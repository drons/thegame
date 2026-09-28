// Тесты механизма сохранения (задача 000031, src/save.js).
// Хранилище — мок localStorage-совместимого объекта; миграции и
// сериализация проверяются как чистые функции.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const S = require('../src/save.js');

// Мок localStorage.
function makeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    has: (k) => m.has(k),
  };
}

// Сырая запись в хранилище (обходить makeSave, чтобы задать старую
// версию данных).
function rawSet(storage, objOrText) {
  storage.setItem(S.SAVE_KEY,
    typeof objOrText === 'string' ? objOrText : JSON.stringify(objOrText));
}

// Версии и миграции — состояние модуля; тесты, которые его меняют,
// обязаны вернуть исходное (setCurrentVersion(1), чистые MIGRATIONS).
function withVersions(fn) {
  const saved = {};
  for (const k of Object.keys(S.MIGRATIONS)) saved[k] = S.MIGRATIONS[k];
  const savedVersion = S.CURRENT_VERSION;
  return Promise.resolve().then(() => {
    try {
      return fn();
    } finally {
      for (const k of Object.keys(S.MIGRATIONS)) delete S.MIGRATIONS[k];
      for (const k of Object.keys(saved)) S.MIGRATIONS[k] = saved[k];
      S.setCurrentVersion(savedVersion);
    }
  });
}

test('SAVE_KEY и CURRENT_VERSION: форма', () => {
  assert.equal(typeof S.SAVE_KEY, 'string');
  assert.ok(S.SAVE_KEY.length > 0);
  assert.equal(S.CURRENT_VERSION, 1);
});

test('makeSave: оболочка с версией и savedAt; не-объект — ошибка', () => {
  const save = S.makeSave({ day: 5, hero: { level: 3 } }, 0);
  assert.equal(save.version, S.CURRENT_VERSION);
  assert.equal(save.savedAt, new Date(0).toISOString());
  assert.deepEqual(save.data, { day: 5, hero: { level: 3 } });
  assert.throws(() => S.makeSave(null), TypeError);
  assert.throws(() => S.makeSave([1]), TypeError);
});

test('serialize/load/save: roundtrip (мок-хранилище)', () => {
  const st = makeStorage();
  assert.equal(S.load(st).status, 'empty');
  const data = { day: 7, position: { x: 1, y: -2 }, hero: { gold: 42 } };
  assert.equal(S.save(st, data, 1234), true);
  const res = S.load(st);
  assert.equal(res.status, 'ok');
  assert.equal(res.save.version, S.CURRENT_VERSION);
  assert.equal(res.save.savedAt, new Date(1234).toISOString());
  assert.deepEqual(res.save.data, data);
});

test('load: битый JSON — corrupt', () => {
  const st = makeStorage();
  rawSet(st, '{это не JSON');
  const res = S.load(st);
  assert.equal(res.status, 'corrupt');
  assert.ok(res.error instanceof Error);
});

test('load: некорректная оболочка — corrupt', () => {
  for (const bad of [
    'null', '"строка"', '[1,2]', '42',
    JSON.stringify({ version: 1 }),                    // нет data
    JSON.stringify({ version: 1, data: null }),        // data не объект
    JSON.stringify({ version: 1, data: [1] }),         // data массив
    JSON.stringify({ version: '1', data: {} }),        // версия-строка
    JSON.stringify({ version: 0, data: {} }),          // версия < 1
    JSON.stringify({ version: -2, data: {} }),
  ]) {
    const st = makeStorage();
    rawSet(st, bad);
    assert.equal(S.load(st).status, 'corrupt', bad);
  }
});

test('load: данные не изменяются хранилищем при неудаче (согласие — UI)', () => {
  // При migration_failed/corrupt запись в хранилище НЕ трогаем —
  // обнуление только после согласия пользователя (UI — main.js).
  const st = makeStorage();
  rawSet(st, JSON.stringify({ version: 2, data: {} })); // «из будущего»
  const before = st.getItem(S.SAVE_KEY);
  const res = S.load(st);
  assert.equal(res.status, 'migration_failed');
  assert.equal(res.version, 2);
  assert.equal(st.getItem(S.SAVE_KEY), before);
  rawSet(st, '{бито');
  const res2 = S.load(st);
  assert.equal(res2.status, 'corrupt');
  assert.equal(st.getItem(S.SAVE_KEY), '{бито');
});

test('migrate: цепочка N→N+1→N+2 применяется последовательно', () =>
  withVersions(() => {
    const order = [];
    S.MIGRATIONS[1] = (d) => { order.push('1→2'); return { ...d, v2: true }; };
    S.MIGRATIONS[2] = (d) => { order.push('2→3'); return { ...d, v3: true }; };
    S.setCurrentVersion(3);

    const st = makeStorage();
    rawSet(st, { version: 1, savedAt: 'x', data: { day: 4 } });
    const res = S.load(st);
    assert.equal(res.status, 'ok');
    assert.equal(res.save.version, 3);
    assert.equal(res.save.migrated, true);
    assert.deepEqual(res.save.data, { day: 4, v2: true, v3: true });
    assert.deepEqual(order, ['1→2', '2→3']); // порядок важен
  }));

test('migrate: чистая функция (явная toVersion, без изменения входа)', () => {
  const input = { a: 1 };
  const out = S.migrate(input, 1, 1);
  assert.equal(out, input); // миграций нет — те же данные
  assert.throws(() => S.migrate(input, 3, 2), RangeError); // to < from
  assert.throws(() => S.migrate(input, 0), RangeError);    // from < 1
});

test('migrate/ load: не удалось мигрировать — migration_failed', () =>
  withVersions(() => {
    S.MIGRATIONS[1] = () => { throw new Error('баг миграции 1→2'); };
    S.setCurrentVersion(2);
    const st = makeStorage();
    rawSet(st, { version: 1, savedAt: 'x', data: {} });
    const res = S.load(st);
    assert.equal(res.status, 'migration_failed');
    assert.equal(res.version, 1);
    assert.match(String(res.error.message), /баг миграции 1→2/);
  }));

test('load: нет нужной миграции в цепочке — migration_failed', () =>
  withVersions(() => {
    S.MIGRATIONS[1] = (d) => d; // 2→3 отсутствует
    S.setCurrentVersion(3);
    const st = makeStorage();
    rawSet(st, { version: 1, savedAt: 'x', data: {} });
    const res = S.load(st);
    assert.equal(res.status, 'migration_failed');
    assert.match(String(res.error.message), /нет миграции 2→3/);
  }));

test('load: сейв «из будущего» — migration_failed, версия в ответе', () => {
  const st = makeStorage();
  rawSet(st, { version: 99, savedAt: 'x', data: {} });
  const res = S.load(st);
  assert.equal(res.status, 'migration_failed');
  assert.equal(res.version, 99);
  assert.match(String(res.error.message), /новее версии кода/);
});

test('save: хранилище не дало (квота) — false, без исключений', () => {
  const st = makeStorage();
  st.setItem = () => { throw new Error('QuotaExceededError'); };
  assert.equal(S.save(st, { a: 1 }), false);
  const st2 = makeStorage();
  st2.removeItem = () => { throw new Error('denied'); };
  assert.equal(S.clear(st2), false);
});

test('clear: обнуляет запись', () => {
  const st = makeStorage();
  S.save(st, { a: 1 });
  assert.equal(S.clear(st), true);
  assert.equal(S.load(st).status, 'empty');
  assert.equal(S.clear(st), true); // идемпотентно
});

test('load: getItem, бросаящий (file:// приватный режим) — corrupt', () => {
  const st = { getItem: () => { throw new Error('denied'); } };
  const res = S.load(st);
  assert.equal(res.status, 'corrupt');
  assert.ok(res.error instanceof Error);
});

test('setCurrentVersion: только целое >= 1', () =>
  withVersions(() => {
    assert.throws(() => S.setCurrentVersion(0), RangeError);
    assert.throws(() => S.setCurrentVersion(1.5), RangeError);
    assert.throws(() => S.setCurrentVersion('2'), RangeError);
  }));

test('браузер: UMD вешает API на Game, не ломая существующий', () => {
  const sandbox = { Game: { Marker: 1 } };
  const code = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'save.js'), 'utf8');
  vm.runInNewContext(code, sandbox);
  assert.equal(sandbox.Game.Marker, 1);
  for (const fn of ['load', 'save', 'clear', 'makeSave', 'serialize',
    'migrate', 'isValidSave']) {
    assert.equal(typeof sandbox.Game[fn], 'function', fn);
  }
  assert.equal(sandbox.Game.SAVE_KEY, S.SAVE_KEY);
  // Работоспособность из «браузерного» realm (мок-хранилище — тот же).
  const st = makeStorage();
  sandbox.Game.save(st, { a: 1 });
  const res = sandbox.Game.load(st);
  assert.equal(res.status, 'ok');
  assert.equal(res.save.data.a, 1);
});

// --- Задача 000045: книга заклинаний в сейве ---
//
// hero.spells — новое ОПЦИОНАЛЬНОЕ поле сейва (без повышения версии,
// 000031): сейв без поля восстанавливается с книгой []; подделанное поле
// (чужие id, дубли, мусор) чистится по каталогу — sanitizeSpellBook.

test('sanitizeSpellBook: только известные id без дублей; не-массив — []', () => {
  const fn = require('../src/spells.js').sanitizeSpellBook;
  assert.deepEqual(fn(['spark', 'nope', 'fireball']),
    ['spark', 'fireball'], 'неизвестные id отброшены, порядок сохранён');
  assert.deepEqual(fn(['spark', 'spark', 'mend']),
    ['spark', 'mend'], 'дубли — один раз');
  assert.deepEqual(fn(['spark', 42, null, 'nope', 'mend']),
    ['spark', 'mend'], 'не-строки отброшены');
  assert.deepEqual(fn(['spark']), ['spark']);
  // Сейв без hero.spells (старая версия данных) → [].
  for (const bad of [null, undefined, 'spark', 42, { spark: 1 }]) {
    assert.deepEqual(fn(bad), [], 'не-массив → []: ' + String(bad));
  }
});

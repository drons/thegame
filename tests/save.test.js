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

// Объекты из vm-сэндбокса — чужой realm (свой Object.prototype),
// deepStrictEqual (assert/strict) на это падает. JSON-рондтрип даёт
// объект host-realm — тот же паттерн, что global-settings.test.js.
function host(o) { return JSON.parse(JSON.stringify(o)); }

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

// --- Задача 000072: разделы сейва «раз в день» и благословения ---
// Новые разделы data.buildingOncePerDay ('x,y:effectId' → день) и
// data.buffs ({source, day, kind}) — неломкое расширение v1: версия
// НЕ поднимается, миграций нет (правило 000031; прецедент 000029 —
// quests/npcStocks добавлены полями). Чтение/запись разделов —
// main.js (collectSaveData/restoreFromSave), здесь — уровень оболочки
// сейва: версии, миграции, roundtrip через мок-хранилище.

const D = require('../src/day.js');

test('000072: версию сейва не поднимают — CURRENT_VERSION = 1, миграций нет', () => {
  assert.equal(S.CURRENT_VERSION, 1,
    'новые разделы — неломкое расширение v1 (000031)');
  assert.deepEqual(Object.keys(S.MIGRATIONS), [], 'миграций быть не должно');
});

test('000072: v1-сейв без новых разделов восстанавливается как есть (нет миграции)', () => {
  const st = makeStorage();
  const data = { day: 4, position: { x: 1, y: 2 }, hero: { gold: 5 } };
  assert.equal(S.save(st, data, 111), true);
  const res = S.load(st);
  assert.equal(res.status, 'ok');
  assert.equal(res.save.migrated, undefined, 'старым разделам миграция не нужна');
  assert.equal(res.save.version, 1);
  assert.deepEqual(res.save.data, data, 'данные — как есть');
});

test('000072: roundtrip новых разделов через хранилище + восстановление состояния', () => {
  const st = makeStorage();
  const data = {
    day: 7,
    buildingOncePerDay: { '-3,7:heal': 5, '0,0': 2 },
    buffs: [
      { source: '1,1', day: 7, kind: 'damage' },
      { source: '2,2', day: 7, kind: 'armor' },
    ],
  };
  assert.equal(S.save(st, data, 222), true);
  const res = S.load(st);
  assert.equal(res.status, 'ok');
  assert.deepEqual(res.save.data, data, 'разделы проходят save/load без потерь');
  // Восстановление в состояние (чистые функции day.js).
  const m = D.restoreDayMap(res.save.data.buildingOncePerDay);
  assert.equal(m.get('-3,7:heal'), 5);
  assert.equal(m.get('0,0'), 2);
  const buffs = D.restoreBuffs(res.save.data.buffs, res.save.data.day);
  assert.deepEqual(buffs, data.buffs, 'активные благословения восстановлены');
});

// --- Задача 000046: крафт в сейве ---
//
// hero.craft / hero.craftXp / hero.equipmentBonus — новые ОПЦИОНАЛЬНЫЕ
// поля сейва (без повышения версии, 000031): сейв без полей
// восстанавливается с дефолтами ({} / {} / {weapon:null,armor:null});
// подделанные значения чистятся санитизерами — «битый сейв не роняет
// игру», и главное: restoreFromSave обязан поля ВОССТАНОВИТЬ
// (иначе Object.assign(hero, clean) молча сбрасывает прогресс —
// прецедент hero.spells, задача 000045).

test('000045/000046: restoreFromSave чистит hero.spells/craft/craftXp/' +
  'equipmentBonus', () => {
  // restoreFromSave живёт внутри IIFE main.js (не экспортируется),
  // поэтому проводку проверяем по коду: паттерн hero.spells (000045) —
  // поле героя присваивается из санитайзера (с дефолтом для старого
  // сейва), иначе Object.assign(hero, clean) молча сбрасывает прогресс.
  // hero.spells — РЕГРЕССИЯ 000045: санитайзер живёт в Game.Spells
  // (именованное пространство), а G — снимок корня Game;
  // G.sanitizeSpellBook (без .Spells) — undefined, и книга сбрасывалась
  // в [] при каждой перезагрузке (data loss).
  // Поведение (roundtrip + подделанный сейв + дефолты) закреплено
  // vm-тестом ниже.
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  const restore = src.slice(src.indexOf('function restoreFromSave'));
  assert.ok(restore.length > 0, 'restoreFromSave найден в main.js');
  for (const [field, fn] of [
    ['hero.spells', 'G.Spells.sanitizeSpellBook'],
    ['hero.craft', 'G.sanitizeCraftLevels'],
    ['hero.craftXp', 'G.sanitizeCraftXp'],
    ['hero.equipmentBonus', 'G.sanitizeEquipmentBonus'],
  ]) {
    assert.ok(restore.includes(field) && restore.includes(fn),
      `restoreFromSave восстанавливает ${field} через ${fn}`);
  }
});

// --- Полный roundtrip через main.js (vm-песочница, паттерн
// tests/main-visuals.test.js): цепочка index.html + localStorage с
// сейвом. Песочница — компактный аналог стабов main-visuals: WebGL/
// DOM-стабы, map.png всегда onerror (детерминированный фолбэк),
// requestAnimationFrame ловит первый кадр. ---

function makeGl() {
  const noop = () => {};
  const gl = {
    VERTEX_SHADER: 35633, FRAGMENT_SHADER: 35632,
    COMPILE_STATUS: 35713, LINK_STATUS: 35714,
    ARRAY_BUFFER: 34962, DYNAMIC_DRAW: 35048, FLOAT: 5126,
    COLOR_BUFFER_BIT: 1024, TRIANGLES: 4,
  };
  gl.createShader = () => ({});
  gl.shaderSource = noop;
  gl.compileShader = noop;
  gl.getShaderParameter = () => true;
  gl.getShaderInfoLog = () => '';
  gl.createProgram = () => ({});
  gl.attachShader = noop;
  gl.linkProgram = noop;
  gl.getProgramParameter = () => true;
  gl.getProgramInfoLog = () => '';
  gl.useProgram = noop;
  let attrib = 0;
  gl.getAttribLocation = () => attrib++;
  gl.getUniformLocation = () => ({});
  gl.enableVertexAttribArray = noop;
  gl.createBuffer = () => ({});
  gl.bindBuffer = noop;
  gl.bufferData = noop;
  gl.vertexAttribPointer = noop;
  gl.viewport = noop;
  gl.clearColor = noop;
  gl.clear = noop;
  gl.uniformMatrix4fv = noop;
  gl.drawArrays = noop;
  return gl;
}

function makeEl(tag) {
  const target = {
    tagName: tag,
    className: '',
    textContent: '',
    title: '',
    style: {},
    dataset: {},
    children: [],
    listeners: {},
    appendChild(ch) { target.children.push(ch); return ch; },
    addEventListener(type, fn) {
      (target.listeners[type] || (target.listeners[type] = [])).push(fn);
    },
    removeEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    closest() { return null; },
    setAttribute() {},
    getBoundingClientRect() { return { left: 0, top: 0 }; },
    remove() {},
    blur() {},
  };
  if (tag === 'canvas') {
    // 000118: боевой оверлей (combat-ui.js build()) создаёт canvas через
    // document.createElement — без 2d-стаба startCombat в песочнице
    // падал (g2 = undefined → TypeError при set fillStyle).
    // Существующие тесты бой НЕ начинают — на них изменение не
    // влияет (бит-в-бит; прецедент 000081 main-visuals). Явные
    // getContext у gameCanvas/spriteCanvas в bootWithSave ПЕРЕОПРЕДЕЛЯЮТ
    // этот стаб после создания (те же поведения).
    target.getContext = (kind) => (kind === '2d'
      ? new Proxy({}, {
          get: (t, k) => (k in t ? t[k] : () => undefined),
          set: (t, k, v) => { t[k] = v; return true; },
        }) : null);
  }
  return new Proxy(target, {
    get(t, k) {
      if (k in t) return t[k];
      return () => undefined; // неизвестный метод DOM — no-op
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

// dataExtra (000085): ДОПОЛНИТЕЛЬНЫЕ поля data (companions/efir/
// dead_mercs) — ОПЦИОНАЛЬНЫЙ 3-й аргумент (additive: Object.assign
// игнорирует undefined) — существующие вызовы без правок.
function bootWithSave(storage, heroExtra, dataExtra) {
  // Сейв записывается ДО запуска цепочки: main.js снимает
  // window.localStorage и читает его при ЗАГРУЗКЕ (restoreFromSave).
  const hero = Object.assign({
    name: 'Смоук', level: 2, xp: 10, totalXp: 100, gold: 50,
    hp: 20, mp: 10, points: 1,
    primary: {
      strength: 2, dexterity: 1, constitution: 1,
      intelligence: 1, wisdom: 1, charisma: 1,
    },
    secondary: { forge: 3 },
    skillXp: {},
    spells: ['spark'],
  }, heroExtra);
  rawSet(storage, {
    version: 1,
    savedAt: new Date(0).toISOString(),
    // 000109: dataExtra — дополнительные поля раздела data (напр.,
    // cities), day/steps переопределяются (restore — до fastForward).
    data: Object.assign({ day: 1, steps: 0, hero }, dataExtra),
  });

  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const chain = Array.from(
    html.matchAll(/<script\s+src="([^"]+)"/g), (m) => m[1]);
  const winListeners = {};
  const raf = [];
  const warns = [];
  const errors = [];
  const gameCanvas = makeEl('canvas');
  const spriteCanvas = makeEl('canvas');
  const hud = makeEl('div');
  gameCanvas.getContext = (kind) => (kind === 'webgl'
    ? makeGl() : new Proxy({}, {
      get: () => () => undefined,
      set: () => true,
    }));
  spriteCanvas.getContext = (kind) => (kind === '2d'
    ? new Proxy({}, {
      get: () => () => undefined,
      set: () => true,
    }) : null);
  const document = {
    createElement: (tag) => makeEl(tag),
    getElementById: (id) => (
      id === 'game' ? gameCanvas
        : id === 'sprites' ? spriteCanvas
          : id === 'hud' ? hud
            : null
    ),
    body: makeEl('body'),
    addEventListener() {},
    removeEventListener() {},
    querySelector: () => null,
    hidden: false,
  };
  const window = {
    innerWidth: 1280,
    innerHeight: 720,
    location: { search: '' },
    addEventListener: (t, f) => {
      (winListeners[t] || (winListeners[t] = [])).push(f);
    },
    removeEventListener() {},
    localStorage: storage, // 000046: сейв на восстановление
    confirm: () => false,
  };
  // Image: map.png ВСЕГДА onerror → детерминированный фолбэк
  // G.generateSeedPixels (фикс. сид, main.js); остальные — onload.
  function Image() {
    const self = this;
    self.naturalWidth = 0;
    self.naturalHeight = 0;
    Object.defineProperty(self, 'src', {
      configurable: true,
      get() { return self.__src; },
      set(v) {
        self.__src = v;
        Promise.resolve().then(() => {
          if (v === 'assets/map.png') {
            if (typeof self.onerror === 'function') self.onerror();
          } else if (typeof self.onload === 'function') {
            self.onload();
          }
        });
      },
    });
  }
  const sandbox = {
    console: {
      warn: (m) => warns.push(String(m)),
      error: (m) => errors.push(String(m)),
      log: () => {},
    },
    document,
    window,
    Image,
    performance: { now: () => 1000 },
    requestAnimationFrame: (fn) => { raf.push(fn); return raf.length; },
  };
  vm.createContext(sandbox);
  for (const f of chain) {
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), sandbox,
      { filename: f });
  }
  return {
    sandbox, winListeners, raf, warns, errors,
    drain: () => new Promise((r) => setImmediate(r)),
  };
}

test('000046: hero.craft/craftXp/equipmentBonus — roundtrip и подделанный сейв', async () => {
  const st = makeStorage();
  // Подделка + валидные в одном сейве:
  //   * «нет_такого_вида» — отброс; «алхимия»: 150 — кламп до 100;
  //   * craftXp: отрицательный чужой вид — отброс;
  //   * equipmentBonus: armor {armor: -1} — невалиден → null;
  //     чужой ключ «extra» — отброс.
  const h = bootWithSave(st, {
    craft: { 'кузнечное_дело': 7, 'алхимия': 150, 'нет_такого_вида': 5 },
    craftXp: { 'алхимия': 5, 'нет_такого_вида': -3 },
    equipmentBonus: {
      weapon: { damage: 2 }, armor: { armor: -1 }, extra: 1,
    },
  });
  for (let i = 0; i < 5; i++) await h.drain();
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет: ' + h.errors.join('; '));
  const g = h.sandbox.__game;
  assert.ok(g, 'main.js выполнен (__game)');
  const state = g.state;
  assert.ok(state.save, 'сейв загружен');
  assert.equal(state.hero.level, 2, 'ядро героя восстановлено');
  // РЕГРЕССИЯ 000045: книга заклинаний восстановлена, а не сброшена
  // в [] (restoreFromSave обязан читать G.Spells.sanitizeSpellBook,
  // а не G.sanitizeSpellBook — undefined в корне Game).
  assert.deepEqual(host(state.hero.spells), ['spark'],
    'книга заклинаний восстановлена (регрессия 000045)');
  assert.deepEqual(host(state.hero.craft),
    { 'кузнечное_дело': 7, 'алхимия': 100 },
    'craft восстановлен и очищен (чужой вид отброшен, >100 — кламп)');
  assert.deepEqual(host(state.hero.craftXp), { 'алхимия': 5 },
    'craftXp восстановлен и очищен');
  assert.deepEqual(host(state.hero.equipmentBonus),
    { weapon: { damage: 2 }, armor: null },
    'equipmentBonus восстановлен и очищен');
  // Roundtrip: beforeunload → поля в сериализованном герое (очищенные).
  const beforeUnload = h.winListeners['beforeunload'];
  assert.ok(beforeUnload && beforeUnload.length > 0,
    'beforeunload зарегистрирован');
  beforeUnload[0]();
  const saved = JSON.parse(st.getItem(S.SAVE_KEY));
  assert.deepEqual(saved.data.hero.craft,
    { 'кузнечное_дело': 7, 'алхимия': 100 }, 'craft пережил roundtrip');
  assert.deepEqual(saved.data.hero.craftXp, { 'алхимия': 5 },
    'craftXp пережил roundtrip');
  assert.deepEqual(saved.data.hero.equipmentBonus,
    { weapon: { damage: 2 }, armor: null }, 'equipmentBonus пережил roundtrip');
  assert.deepEqual(saved.data.hero.spells, ['spark'],
    'spells пережили roundtrip (регрессия 000045)');

  // Старый сейв (полей 000046 нет) — дефолты, без падений.
  // spells: undefined — ключ ВЫБЫВАЕТ из JSON (JSON.stringify), т.е.
  // сейв «до 000045»: hero.spells в данных отсутствует → [].
  const st2 = makeStorage();
  const h2 = bootWithSave(st2, { spells: undefined });
  for (let i = 0; i < 5; i++) await h2.drain();
  assert.equal(h2.errors.length, 0,
    'старый сейв: ошибок загрузки нет: ' + h2.errors.join('; '));
  const state2 = h2.sandbox.__game.state;
  assert.ok(state2.save, 'старый сейв загружен');
  assert.deepEqual(host(state2.hero.craft), {}, 'старый сейв: craft → {}');
  assert.deepEqual(host(state2.hero.craftXp), {}, 'старый сейв: craftXp → {}');
  assert.deepEqual(host(state2.hero.equipmentBonus),
    { weapon: null, armor: null }, 'старый сейв: equipmentBonus → дефолт');
  assert.deepEqual(host(state2.hero.spells), [], 'старый сейв: spells → []');
});

// --- Задача 000093: смотровая башня — раздел explored в сейве ---
//
// data.explored — plain object { towerKey 'x,y' → 'x,y;x,y;…' }
// (контракт — memory/000093-explored.md). Неломкое расширение v1:
// версия НЕ повышается, миграций НЕТ (000031; прецедент 000072);
// save.js — общая механика, раздела explored НЕ знает (не лезет в
// данные). Живая форма Map<towerKey, Set<tileKey>> — main.js;
// ser/de — building-effects.js (serializeExplored/restoreExplored,
// паттерн 000072/teleports).

test('000093: v1-сейв без раздела explored восстанавливается как есть (нет миграции, save.js раздел не знает)', () => {
  const st = makeStorage();
  const data = { day: 4, position: { x: 1, y: 2 }, hero: { gold: 5 } };
  assert.equal(S.save(st, data, 111), true);
  const res = S.load(st);
  assert.equal(res.status, 'ok');
  assert.equal(res.save.migrated, undefined, 'миграций нет (v1)');
  assert.deepEqual(res.save.data, data,
    'данные — как есть (explored НЕ добавляется механикой сейва)');
  assert.equal(res.save.data.explored, undefined,
    'в данных раздела explored нет (как в сейве)');
});

test('000093: roundtrip explored: save/load без потерь + restoreExplored → Map<towerKey, Set<tileKey>>', () => {
  const st = makeStorage();
  const data = { day: 7, explored: { '36,-21': '36,-21;16,-41;56,-1' } };
  assert.equal(S.save(st, data, 222), true);
  const res = S.load(st);
  assert.equal(res.status, 'ok');
  assert.deepEqual(res.save.data, data,
    'раздел explored проходит save/load без потерь');
  // Восстановление в ЖИВОЮ форму (чистая функция building-effects).
  const BE = require('../src/building-effects.js');
  assert.equal(typeof BE.restoreExplored, 'function',
    'restoreExplored (red: экспорт отсутствует)');
  const m = BE.restoreExplored(res.save.data.explored);
  assert.ok(m instanceof Map, 'живая форма — Map');
  assert.deepEqual(m,
    new Map([['36,-21', new Set(['36,-21', '16,-41', '56,-1'])]]),
    'Map<towerKey, Set<tileKey>> восстановлен');
});

// =====================================================================
// Задача 000085: отряд и Эфир в сейве (неломкое расширение v1, 000031:
// БЕЗ бампа CURRENT_VERSION, MIGRATIONS пуст; каждый раздел restore —
// свой try/catch, 000031/000029 «призрак»).
// Контракт: memory/000085-save-party-efir.md (D1–D8, D13) +
// memory/000085-save-roster.md (компактный контракт).
// КРАСНЫЕ, пока нет: serializeRoster/deserializeRoster (companions.js),
// serializeEfir/deserializeEfir (efir.js), разделы companions/efir/
// dead_mercs в collectSaveData/restoreFromSave (main.js).
// =====================================================================

const C = require('../src/companions.js');
const E = require('../src/efir.js');
const { NPCS } = require('../src/npc-data.js');

// Сerde-функции ОБЯЗАНЫ быть тихими (0 console.warn) — warn печатает
// main.js по dropped/битым разделам (D3/D8).
function quiet(fn) {
  const orig = console.warn;
  let n = 0;
  console.warn = () => { n += 1; };
  try {
    return { res: fn(), n };
  } finally {
    console.warn = orig;
  }
}

test('000085 T1: serializeRoster — чистая копия ровно 5 полей, лишнее отброшено, fresh-copy; тихая', () => {
  const volk = { npcId: 'merc_volk', level: 2, xp: 30, loyalty: 77, hiredDay: 3 };
  const snap = C.serializeRoster([
    volk,
    { npcId: 'merc_ashka', level: 1, xp: 0, loyalty: 50, hiredDay: 2, extra: 99 },
    'junk', 42, { level: 1, xp: 0 }, // не-объект / без строки npcId — skip
  ]);
  assert.deepEqual(snap, [
    { npcId: 'merc_volk', level: 2, xp: 30, loyalty: 77, hiredDay: 3 },
    { npcId: 'merc_ashka', level: 1, xp: 0, loyalty: 50, hiredDay: 2 },
  ], 'ровно 5 полей (лишние отброшены), не-объект/без npcId — skip');
  volk.level = 99; // fresh-copy: мутация входа не меняет снапшот
  assert.deepEqual(snap[0],
    { npcId: 'merc_volk', level: 2, xp: 30, loyalty: 77, hiredDay: 3 },
    'fresh-copy — мутация input не меняет снапшот');
  assert.deepEqual(C.serializeRoster('junk'), [], 'не-массив → []');
  assert.deepEqual(C.serializeRoster(null), [], 'null → []');
  const q = quiet(() => C.serializeRoster([volk]));
  assert.equal(q.n, 0, 'serializeRoster ТИХАЯ (warn печатает main.js)');
});

test('000085 T2: deserializeRoster — призрак/дубли/лимит/числа; round-trip; тихая', () => {
  const mk = (npcId, over) => Object.assign(
    { npcId, level: 1, xp: 0, loyalty: 50, hiredDay: 1 }, over);
  const volk = mk('merc_volk');
  const ashka = mk('merc_ashka');
  const baldor = mk('merc_baldor');
  const mira = mk('merc_mira');

  // Старый сейв: null/undefined → {roster:[], dropped:[]} — ТИХО
  // (тотальная функция; ПУСТОЙ отряд ЗАФИКСИРОВАНО ТЗ, warn НЕТ).
  const q0 = quiet(() => C.deserializeRoster(NPCS, null));
  assert.deepEqual(q0.res, { roster: [], dropped: [] }, 'null → пустой отряд (тихо)');
  assert.equal(q0.n, 0, 'null — без warn (старый сейв)');
  assert.deepEqual(C.deserializeRoster(NPCS, undefined),
    { roster: [], dropped: [] }, 'undefined → пустой отряд');

  // Битый раздел (не-массив) → null — main.js: warn + сброс.
  for (const bad of ['junk', 42, {}]) {
    assert.equal(C.deserializeRoster(NPCS, bad), null,
      'не-массив → null: ' + JSON.stringify(bad));
  }

  // Призрак (нет в каталоге), дубликат, сверх-лимит
  // (max_companions = 3, LIVE-чтение) → dropped (строки npcId);
  // порядок валидных сохранён.
  const q1 = quiet(() => C.deserializeRoster(NPCS,
    [volk, mk('ghost_merc'), mk('merc_volk'), ashka, baldor, mira]));
  assert.deepEqual(q1.res.roster, [volk, ashka, baldor],
    'первый дубль живёт, призрак и 4-й сверх-лимита → dropped; порядок сохранён');
  assert.deepEqual(q1.res.dropped, ['ghost_merc', 'merc_volk', 'merc_mira'],
    'dropped — строки npcId');
  assert.equal(q1.n, 0, 'deserializeRoster ТИХАЯ (warn печатает main.js)');

  // Неидентифицируемо (не-объект / npcId не строка) — тихий skip,
  // в dropped НЕ попадает.
  const q2 = quiet(() => C.deserializeRoster(NPCS,
    [{ npcId: 42, level: 1, xp: 0, loyalty: 50, hiredDay: 1 }, 'junk', 7, volk]));
  assert.deepEqual(q2.res.roster, [volk], 'npcId не строка / не-объект — skip');
  assert.deepEqual(q2.res.dropped, [], 'skip НЕ попадает в dropped');
  assert.equal(q2.n, 0);

  // Числа (D3): невалидные → запись в dropped; валидные → as-is /
  // дешёвая нормализация (loyalty — clamp 0..100 без округления,
  // hiredDay — floor; дроби xp ЛЕГИТИМНЫ — прецедент hero.xp).
  const NUM = [
    [{ level: 2.5 }, null, 'level'],
    [{ level: 0 }, null, 'level'],
    [{ xp: -1 }, null, 'xp'],
    [{ xp: 7.9 }, 7.9, 'xp'],
    [{ loyalty: 150 }, 100, 'loyalty'],
    [{ loyalty: 'x' }, null, 'loyalty'],
    [{ loyalty: 77.5 }, 77.5, 'loyalty'],
    [{ hiredDay: 0 }, null, 'hiredDay'],
    [{ hiredDay: 2.7 }, 2, 'hiredDay'],
  ];
  for (const [over, expected, field] of NUM) {
    const res = C.deserializeRoster(NPCS, [mk('merc_volk', over)]).roster;
    if (expected === null) {
      assert.equal(res.length, 0, 'числа: ' + JSON.stringify(over) + ' → drop');
    } else {
      assert.equal(res.length, 1, 'числа: ' + JSON.stringify(over) + ' → kept');
      assert.equal(res[0][field], expected, 'числа: ' + JSON.stringify(over));
    }
  }

  // Round-trip: serialize → deserialize — идентично (значения и порядок).
  const rt = C.deserializeRoster(NPCS, [
    mk('merc_volk', { level: 2, xp: 30, loyalty: 77, hiredDay: 3 }),
    mk('merc_ashka', { xp: 7.9, loyalty: 77.5 }),
  ]);
  assert.deepEqual(C.deserializeRoster(NPCS, C.serializeRoster(rt.roster)), rt,
    'round-trip serialize(deserialize(x)) === deserialize(x)');
});

test('000085 T3: serializeEfir/deserializeEfir — round-trip 5 полей; 3-полевая legacy; сломанные → null', () => {
  // 000115 D4 (техническая фиксация под ОБЯЗАТЕЛЬНЫЙ reprocessEfirSkills
  // ВНУТРИ deserialize, канон 000111 §9): ВЫХОД deserialize — ПЛОТНЫЙ
  // (ВСЕ 4 id пула материализованы); round-trip-идентичность — на
  // post-reprocess (неподвижной) форме. Фикс-точки: skillXp 2.5 <
  // efirSkillXpForNext(1) = 30; icelord — requires firelord ≥ 5 не
  // выполнен → 0/0; xp 10 < xpForNext(2) = 141 (reprocess level не
  // трогает).
  const afterBattle = {
    level: 2, xp: 10,
    skillXp: { firelord: 2.5, icelord: 0, perception: 0, precog: 0 },
    skills: { firelord: 1, icelord: 0, perception: 0, precog: 0 },
    spells: ['spark', 'mend', 'light_heal'],
  };
  const fresh = E.createEfir();
  assert.deepEqual(E.deserializeEfir(E.serializeEfir(fresh)), {
    level: 1, xp: 0,
    skillXp: { firelord: 0, icelord: 0, perception: 0, precog: 0 },
    skills: { firelord: 0, icelord: 0, perception: 0, precog: 0 },
    spells: ['spark', 'mend'],
  }, 'round-trip: свежий createEfir() (5 полей; reprocess → плотный 4×0)');
  assert.deepEqual(E.deserializeEfir(E.serializeEfir(afterBattle)), afterBattle,
    'round-trip: «после боя» (дроби skillXp, порядок spells) — неподвижная точка');

  // 3-полевая legacy-форма (до 000111): дефолты skillXp→{}, spells→старт
  // (+ reprocess 000115 → плотный 4×0).
  assert.deepEqual(E.deserializeEfir({ level: 2, xp: 5, skills: {} }),
    { level: 2, xp: 5,
      skillXp: { firelord: 0, icelord: 0, perception: 0, precog: 0 },
      skills: { firelord: 0, icelord: 0, perception: 0, precog: 0 },
      spells: ['spark', 'mend'] },
    '3-полевая legacy → 5 полей (000111 §9; reprocess → плотный 4×0)');
  assert.deepEqual(E.deserializeEfir({ level: 1, xp: 0, spells: [] }),
    { level: 1, xp: 0,
      skillXp: { firelord: 0, icelord: 0, perception: 0, precog: 0 },
      skills: { firelord: 0, icelord: 0, perception: 0, precog: 0 },
      spells: ['spark', 'mend'] },
    'пустые spells → EFIR_SPELL_START (НЕ выводить из уровня, 000115; reprocess → плотный 4×0)');

  // Сломанные → null (main.js: warn + тихий сброс на createEfir()).
  const broken = [
    ['«junk»', 'junk'],
    ['42', 42],
    ['null', null],
    ['undefined', undefined],
    ['[1]', [1]],
    ['level 0.5', { level: 0.5, xp: 0, skillXp: {}, skills: {}, spells: ['spark'] }],
    ['level 0', { level: 0, xp: 0, skillXp: {}, skills: {}, spells: ['spark'] }],
    // 000115 D5: save-integrity-граница (защита от зависания reprocess
    // поддельным уровнем); 1-арг. вызов — guard срабатывает до каталогов.
    ['level > 1e6', { level: 1000001, xp: 0, skillXp: {}, skills: {}, spells: ['spark'] }],
    ["xp 'x'", { level: 1, xp: 'x', skillXp: {}, skills: {}, spells: ['spark'] }],
    ['xp -1', { level: 1, xp: -1, skillXp: {}, skills: {}, spells: ['spark'] }],
    ["skillXp 'abc'", { level: 1, xp: 0, skillXp: 'abc', skills: {}, spells: ['spark'] }],
    ['skillXp {a:-1}', { level: 1, xp: 0, skillXp: { a: -1 }, skills: {}, spells: ['spark'] }],
    ['skills 42', { level: 1, xp: 0, skillXp: {}, skills: 42, spells: ['spark'] }],
    ["skills {a:'x'}", { level: 1, xp: 0, skillXp: {}, skills: { a: 'x' }, spells: ['spark'] }],
    ['skills {a:2.5}', { level: 1, xp: 0, skillXp: {}, skills: { a: 2.5 }, spells: ['spark'] }],
    ["spells 'abc'", { level: 1, xp: 0, skillXp: {}, skills: {}, spells: 'abc' }],
    ['spells [1]', { level: 1, xp: 0, skillXp: {}, skills: {}, spells: [1] }],
  ];
  for (const [label, raw] of broken) {
    assert.equal(E.deserializeEfir(raw), null, 'сломанные → null: ' + label);
  }

  assert.equal(E.serializeEfir(42), null, 'serializeEfir: не plain-object → null');
  assert.equal(E.serializeEfir(null), null, 'serializeEfir: null → null');
  assert.equal(E.serializeEfir(['a']), null, 'serializeEfir: массив → null');
});

test('000085 T4: e2e round-trip — отряд/Эфир/dead_mercs переживают сейв (vm, полная цепочка)', async () => {
  const st = makeStorage();
  // day:7 — день найма уже прошёл; efir L5: light_heal легитимно
  // по EFIR_SPELL_UNLOCKS (порог 5); skillXp 2.5 — фикс-точка (< 30).
  // 000115 D4 (техническая фиксация): раздел сейва — КАНОНИЧЕСКАЯ
  // post-reprocess форма (плотный: ВСЕ 4 id пула; icelord — requires
  // firelord ≥ 5 не выполнен → 0/0) — неподвижная точка reprocess.
  const seed = {
    day: 7,
    companions: [
      { npcId: 'merc_volk', level: 2, xp: 30, loyalty: 77, hiredDay: 3 },
      { npcId: 'merc_ashka', level: 1, xp: 0, loyalty: 50, hiredDay: 2 },
    ],
    efir: {
      level: 5, xp: 5,
      skillXp: { firelord: 2.5, icelord: 0, perception: 0, precog: 0 },
      skills: { firelord: 1, icelord: 0, perception: 0, precog: 0 },
      spells: ['spark', 'mend', 'light_heal'],
    },
    dead_mercs: ['merc_baldor'],
  };
  const h = bootWithSave(st, null, seed);
  for (let i = 0; i < 5; i++) await h.drain();
  assert.equal(h.errors.length, 0, 'ошибок загрузки нет: ' + h.errors.join('; '));
  const state = h.sandbox.__game.state;
  // PITFALL (000082): host(undefined) БРОСАЕТ — сначала Array.isArray.
  assert.ok(Array.isArray(state.roster), 'state.roster — массив');
  assert.deepEqual(host(state.roster), seed.companions,
    'отряд восстановлен из сейва (5 полей на запись)');
  assert.deepEqual(host(state.deadMercs), seed.dead_mercs,
    'dead_mercs восстановлены');
  assert.deepEqual(host(state.efir), seed.efir,
    'Эфир восстановлен (5 полей, форма 000111)');
  // Round-trip: beforeunload → saveNow → те же разделы в сейве,
  // CURRENT_VERSION НЕ бампится (000031).
  h.winListeners['beforeunload'][0]();
  const saved = JSON.parse(st.getItem(S.SAVE_KEY));
  assert.equal(saved.version, 1, 'CURRENT_VERSION = 1 (без бампа)');
  assert.deepEqual(saved.data.companions, seed.companions, 'companions в сейве');
  assert.deepEqual(saved.data.efir, seed.efir, 'efir в сейве');
  assert.deepEqual(saved.data.dead_mercs, seed.dead_mercs, 'dead_mercs в сейве');
});

test('000085 T5: СТАРЫЙ сейв (без companions/efir/dead_mercs) — отряд [], Эфир L1, version 1', async () => {
  const st = makeStorage();
  const h = bootWithSave(st, null, { day: 5 });
  for (let i = 0; i < 5; i++) await h.drain();
  assert.equal(h.errors.length, 0, 'ошибок загрузки нет: ' + h.errors.join('; '));
  const state = h.sandbox.__game.state;
  assert.ok(Array.isArray(state.roster), 'state.roster — массив');
  assert.deepEqual(host(state.roster), [], 'старый сейв: ПУСТОЙ отряд (ЗАФИКСИРОВАНО)');
  assert.deepEqual(host(state.deadMercs), [], 'старый сейв: deadMercs []');
  assert.deepEqual(host(state.efir),
    { level: 1, xp: 0, skillXp: {}, skills: {}, spells: ['spark', 'mend'] },
    'старый сейв: Эфир L1-дефолт, 5 полей (ЗАФИКСИРОВАНО)');
  h.winListeners['beforeunload'][0]();
  const saved = JSON.parse(st.getItem(S.SAVE_KEY));
  assert.equal(saved.version, 1, 'CURRENT_VERSION = 1 (без бампа)');
  assert.deepEqual(saved.data.companions, [], 'companions [] в сейве');
  assert.deepEqual(saved.data.dead_mercs, [], 'dead_mercs [] в сейве');
  assert.deepEqual(saved.data.efir,
    { level: 1, xp: 0, skillXp: {}, skills: {}, spells: ['spark', 'mend'] },
    'efir L1-дефолт в сейве (5 полей)');
});

test('000085 T6: битые разделы + призраки — 0 ошибок, warns с именами разделов, чистый сейв', async () => {
  const st = makeStorage();
  const validVolk = { npcId: 'merc_volk', level: 1, xp: 0, loyalty: 50, hiredDay: 1 };
  const h = bootWithSave(st, null, {
    day: 5,
    companions: [
      validVolk,
      { npcId: 'ghost_merc', level: 1, xp: 0, loyalty: 50, hiredDay: 1 },
      { npcId: 42, level: 1, xp: 0, loyalty: 50, hiredDay: 1 }, // тихий skip
      'junk',                                                    // тихий skip
    ],
    efir: 'junk',
    dead_mercs: ['merc_rena', 'ghost_dead', 42, 'merc_rena'],
  });
  for (let i = 0; i < 5; i++) await h.drain();
  assert.equal(h.errors.length, 0, 'ошибок НЕТ (тихий сброс, игра не падает): '
    + h.errors.join('; '));
  assert.ok(h.warns.some((m) => m.includes('companions') && m.includes('ghost_merc')),
    'warn: companions — призрак ghost_merc');
  assert.ok(h.warns.some((m) => m.includes('efir')), 'warn: раздел efir');
  assert.ok(h.warns.some((m) => m.includes('dead_mercs') && m.includes('ghost_dead')),
    'warn: dead_mercs — призрак ghost_dead');
  const state = h.sandbox.__game.state;
  assert.deepEqual(host(state.roster), [validVolk],
    'roster: только валидная запись (skip не в составе)');
  assert.deepEqual(host(state.efir),
    { level: 1, xp: 0, skillXp: {}, skills: {}, spells: ['spark', 'mend'] },
    'efir: тихий сброс на L1-дефолт');
  assert.deepEqual(host(state.deadMercs), ['merc_rena'],
    'deadMercs: дубль/призрак/число отброшены, порядок сохранён');
  // Битое вычищено за 1 цикл: повторный сейв — ЧИСТЫЕ разделы
  // (мусор не размножается).
  h.winListeners['beforeunload'][0]();
  const saved = JSON.parse(st.getItem(S.SAVE_KEY));
  assert.deepEqual(saved.data.companions, [validVolk],
    'companions — чистые (мусор не размножается)');
  assert.deepEqual(saved.data.efir,
    { level: 1, xp: 0, skillXp: {}, skills: {}, spells: ['spark', 'mend'] },
    'efir — чистый L1-дефолт (не «junk»)');
  assert.deepEqual(saved.data.dead_mercs, ['merc_rena'], 'dead_mercs — чистые');
});

// --- 000109: раздел cities — сейв и респаун состояния города ---
//
// Контракты (memory/000109-city-save-respawn.md):
//   * data.cities = { 'cx,cy': { lastVisitDay, stock: { 'tx,ty':
//     {itemId: qty} } } } — ключ = ЯКОРЬ города; АБСОЛЮТНЫЕ дни
//     (000031); неломкое расширение v1 (версия НЕ поднимается);
//   * restore — паттерн 000072: СВОЙ try/catch, битый раздел →
//     console.warn + сброс (игру не роняем), валидных 0 при
//     непустом — warn;
//   * ОБРЕЗКА: истёкшие (day − lastVisitDay >= city_respawn_days) и
//     «будущие» (lastVisitDay > day) отбрасываются И при сейве, И
//     при восстановлении;
//   * save() → false (квота localStorage) — saveNow: console.warn
//     ОДИН раз за сессию, падений нет.
// Контракты 000109 — memory/000109-city-save-respawn.md.

test('000109 R5: неломкое расширение v1 — старый сейв (без cities) грузится; версия не поднимается; сейв ВСЕГДА пишет data.cities ({} )', async () => {
  const st = makeStorage();
  const h = bootWithSave(st);
  for (let i = 0; i < 5; i++) await h.drain();
  assert.equal(h.errors.length, 0, 'ошибок загрузки нет: '
    + h.errors.join('; '));
  const g = h.sandbox.__game;
  assert.ok(g, 'main.js выполнен (__game)');
  assert.ok(g.state.save, 'сейв загружен');
  // Старый сейв без cities — легитимен: warn о cities НЕТ.
  assert.ok(!h.warns.some((w) => /cities/i.test(w)),
    'старый сейв: без warn о cities (неломко): ' + h.warns.join('; '));
  const beforeUnload = h.winListeners['beforeunload'];
  assert.ok(beforeUnload && beforeUnload.length > 0,
    'beforeunload зарегистрирован');
  beforeUnload[0]();
  const saved = JSON.parse(st.getItem(S.SAVE_KEY));
  assert.equal(saved.version, 1,
    'версия НЕ поднимается (v1, неломкое расширение — 000031)');
  assert.deepEqual(saved.data.cities, {},
    'сейв: data.cities пишется ВСЕГДА (пусто — {})');
});

test('000109 R6: засеянное состояние города (в окне респауна) переживает boot и roundtrip; в hero полей города НЕТ', async () => {
  const st = makeStorage();
  const seedCities = {
    '20,-16': { lastVisitDay: 18, stock: { '2,2': { bread: 2, honey_cake: 1 } } },
  };
  const h = bootWithSave(st, null, { day: 20, cities: seedCities });
  for (let i = 0; i < 5; i++) await h.drain();
  assert.equal(h.errors.length, 0, 'ошибок загрузки нет: '
    + h.errors.join('; '));
  const state = h.sandbox.__game.state;
  assert.equal(state.day, 20, 'день восстановлен (fastForward)');
  // Состояние города — НЕ в hero (ловушка-прецедент _lastUnkillDay:
  // состояние обязано быть в сейве, но в СВОЁМ разделе).
  assert.ok(!('cities' in state.hero)
    && !('cityStates' in state.hero),
    'hero: полей cities/cityStates НЕТ (свой раздел data.cities)');
  const beforeUnload = h.winListeners['beforeunload'];
  beforeUnload[0]();
  const saved = JSON.parse(st.getItem(S.SAVE_KEY));
  assert.deepEqual(saved.data.cities, seedCities,
    'в-окне состояние (20 − 18 = 2 < city_respawn_days) '
    + 'переживает roundtrip как есть');
});

test('000109 R7: битый раздел cities — console.warn + сброс (игру не роняем); в сейве — {}', async () => {
  const broken = [
    'junk',                                                    // строка
    [1, 2, 3],                                                 // массив
    42,                                                        // число
    { '20,-16': { lastVisitDay: 18, stock: 'nope' } },   // битый stock
    { '20,-16': { lastVisitDay: '18' } },             // битый день
  ];
  for (const cities of broken) {
    const st = makeStorage();
    const h = bootWithSave(st, null, { day: 20, cities });
    for (let i = 0; i < 5; i++) await h.drain();
    assert.equal(h.errors.length, 0,
      'ошибок НЕТ (игру не роняем): ' + h.errors.join('; ')
      + ' — ' + JSON.stringify(cities));
    // Warn о cities: битый раздел → сброс (паттерн 000072:
    // не-объект/массив — явный warn; валидных 0 при непустом — warn).
    assert.ok(h.warns.some((w) => /cities/i.test(w)),
      'warn о cities — ' + JSON.stringify(cities)
      + ' (warns: ' + h.warns.join('; ') + ')');
    const beforeUnload = h.winListeners['beforeunload'];
    beforeUnload[0]();
    const saved = JSON.parse(st.getItem(S.SAVE_KEY));
    assert.deepEqual(saved.data.cities, {},
      'битый раздел сброшен, сейв — {} — ' + JSON.stringify(cities));
  }
});

test('000109 R8: ОБРЕЗКА при сейве — 1000 истёкших городов не переживают сейв (мир бесконечен — без обрезки раздувание до квоты)', async () => {
  const st = makeStorage();
  const cities = {};
  for (let i = 0; i < 1000; i++)
    cities[i + ',' + i] = { lastVisitDay: 1, stock: {} }; // 10 − 1 ≥ 3
  // В-окне (день 10, last 10 — diff 0): переживает.
  cities['20,-16'] = { lastVisitDay: 10, stock: { '2,2': { bread: 1 } } };
  const h = bootWithSave(st, null, { day: 10, cities });
  for (let i = 0; i < 5; i++) await h.drain();
  assert.equal(h.errors.length, 0, 'ошибок загрузки нет: '
    + h.errors.join('; '));
  const beforeUnload = h.winListeners['beforeunload'];
  beforeUnload[0]();
  const saved = JSON.parse(st.getItem(S.SAVE_KEY));
  assert.deepEqual(saved.data.cities,
    { '20,-16': { lastVisitDay: 10, stock: { '2,2': { bread: 1 } } } },
    '1000 истёкших отброшены, в-окне пережил сейв');
});

test('000109 R9: ОБРЕЗКА при восстановлении — «будущие» (lastVisitDay > day) отброшены при загрузке (fastForward без слушателей — 000031)', async () => {
  const st = makeStorage();
  const h = bootWithSave(st, null, {
    day: 20,
    cities: {
      '20,-16': { lastVisitDay: 18, stock: { '2,2': { bread: 2 } } },
      // 25 > 20 — подделка/«будущее» — отброс.
      '30,0': { lastVisitDay: 25, stock: {} },
    },
  });
  for (let i = 0; i < 5; i++) await h.drain();
  assert.equal(h.errors.length, 0, 'ошибок загрузки нет: '
    + h.errors.join('; '));
  const g = h.sandbox.__game;
  assert.equal(g.state.day, 20, 'день — 20 (город из «будущего» не сдвинул день)');
  const beforeUnload = h.winListeners['beforeunload'];
  beforeUnload[0]();
  const saved = JSON.parse(st.getItem(S.SAVE_KEY));
  assert.deepEqual(saved.data.cities,
    { '20,-16': { lastVisitDay: 18, stock: { '2,2': { bread: 2 } } } },
    'в-окне пережил, «будущее» отброшено (restore обрезает сам)');
});

test('000109 R11: save() → false (квота localStorage) — saveNow: без падений, ровно ОДИН console.warn за сессию', async () => {
  const st = makeStorage();
  const h = bootWithSave(st);
  for (let i = 0; i < 5; i++) await h.drain();
  assert.equal(h.errors.length, 0, 'ошибок загрузки нет: '
    + h.errors.join('; '));
  // Эмуляция квоты: setItem бросает (save.js — тихо false).
  st.setItem = () => { throw new Error('QuotaExceededError'); };
  const beforeUnload = h.winListeners['beforeunload'];
  assert.ok(beforeUnload && beforeUnload.length > 0,
    'beforeunload зарегистрирован');
  const warnsBefore = h.warns.length;
  // saveNow — на каждом мировом шаге: спам warn недопустим —
  // три сохранения подряд.
  for (let i = 0; i < 3; i++) beforeUnload[0]();
  assert.equal(h.errors.length, 0,
    'ошибок НЕТ (saveNow обрабатывает false): '
    + h.errors.join('; '));
  const newWarns = h.warns.slice(warnsBefore);
  assert.equal(newWarns.length, 1,
    'ровно ОДИН warn за сессию (не спам): ' + JSON.stringify(newWarns));
  assert.match(newWarns[0], /квот|Сейв|save/i,
    'warn называет проблему: ' + newWarns[0]);
  const g = h.sandbox.__game;
  assert.equal(g.state.day, 1, 'состояние игры целое после квоты');
});

// =====================================================================
// Задача 000115: сейв Эфира — финальная форма (аудит 000085 + пробелы
// ТЗ). 000085 уже закрыло базовую форму (5 полей, legacy-нормализация,
// efir отсутствует → createEfir(), структурный мусор → null + warn,
// version 1) — 000115 добавляет:
//   (1) id-валидацию в deserializeEfir по КАТАЛОГАМ-ПАРАМЕТРАМ:
//       id скила ∉ assets/skills / id заклинания ∉ assets/spells → null
//       на ВЕСЬ раздел (сброс ЗАПИСИ, 000029; warn печатает main.js);
//   (2) ОБЯЗАТЕЛЬНЫЙ reprocessEfirSkills ВНУТРИ deserializeEfir до
//       return (канон 000111 §9, efir.js:335–336) — выход ПЛОТНЫЙ:
//       ВСЕ 4 id пула материализованы.
// КРАСНЫЕ: N1/N2/V1/V2 — функция существует, поведения НЕТ
// (AssertionError «нет поведения», не Syntax/ReferenceError); N3 —
// зелёный с самого начала (re-pin версии, ТЗ явно в списке «Тесты»);
// N4 — пин D5 level-guard (добавлен правками по итогам ревью: guard
// уже был в коде, пин — чтобы рефакторинг не убрал защиту незаметно).
// Контракт: memory/000115-efir-save-final.md (D1–D9).
// =====================================================================

const SD = require('../src/skills-data.js');
const SP = require('../src/spells-data.js');
// Полные зеркала assets (D2): skills = PRIMARY_SKILLS (массив, 6) +
// Object.values(SECONDARY_SKILLS) (ОБЪЕКТ-КАРТА, 31 — не массив!) =
// 37 id; spells = SPELLS (массив, 16 id).
const EFIR_SKILL_CATALOG = SD.PRIMARY_SKILLS.concat(
  Object.values(SD.SECONDARY_SKILLS));
const EFIR_SPELL_CATALOG = SP.SPELLS;

test('000115 N1: deserializeEfir — id-валидация по каталогам-параметрам: чужой id (skillXp/skills/spells) → null (сброс ЗАПИСИ); тихая; каталог null/мусор → off (совместимость 000085)', () => {
  // Каталоги — полные зеркала assets (37 + 16 id).
  assert.equal(EFIR_SKILL_CATALOG.length, 37,
    'каталог skills: 6 primary + 31 secondary = 37 записей');
  assert.equal(EFIR_SPELL_CATALOG.length, 16, 'каталог spells: 16 записей');

  const base = { level: 1, xp: 0, skillXp: {}, skills: {}, spells: ['spark', 'mend'] };

  // Чужой id (вне ЛЮБОГО каталога) → null — сброс ЗАПИСИ (000029).
  const q0 = quiet(() => E.deserializeEfir({ ...base, skillXp: { nope: 1 } },
    EFIR_SKILL_CATALOG, EFIR_SPELL_CATALOG));
  assert.equal(q0.res, null, 'чужой skill id в skillXp → null');
  assert.equal(q0.n, 0, 'тихая: сброс БЕЗ warn (warn печатает main.js)');
  assert.equal(E.deserializeEfir({ ...base, skills: { nope: 1 } },
    EFIR_SKILL_CATALOG, EFIR_SPELL_CATALOG), null,
    'чужой skill id в skills → null');
  assert.equal(E.deserializeEfir({ ...base, spells: ['spark', 'nope'] },
    EFIR_SKILL_CATALOG, EFIR_SPELL_CATALOG), null,
    'чужой spell id в spells → null');
  assert.equal(E.deserializeEfir({ ...base, spells: ['nope'] },
    EFIR_SKILL_CATALOG, EFIR_SPELL_CATALOG), null,
    'чужой spell id (spells ["nope"]) → null');

  // Каталогически-валидные id (пул) → состояние; reprocess (000115) —
  // ПЛОТНАЯ форма (неподвижная точка: 2.5 < efirSkillXpForNext(1) = 30,
  // ВСЕ 4 id пула).
  const q = quiet(() => E.deserializeEfir({
    level: 5, xp: 0,
    skillXp: { firelord: 2.5, icelord: 0, perception: 0, precog: 0 },
    skills: { firelord: 1, icelord: 0, perception: 0, precog: 0 },
    spells: ['spark', 'mend', 'light_heal'],
  }, EFIR_SKILL_CATALOG, EFIR_SPELL_CATALOG));
  assert.ok(q.res !== null, 'каталогически-валидные id — приняты');
  assert.deepEqual(q.res, {
    level: 5, xp: 0,
    skillXp: { firelord: 2.5, icelord: 0, perception: 0, precog: 0 },
    skills: { firelord: 1, icelord: 0, perception: 0, precog: 0 },
    spells: ['spark', 'mend', 'light_heal'],
  }, 'валидные id → состояние (плотная форма после reprocess, неподвижная точка)');

  // Каталогический id ВНЕ пула (strength / flame_burst) — ПРОХОДИТ и
  // персистит (D2-последствие: ИНЕРТЕН — reprocess пишет только 4 id
  // пула; поведение то же, что на master — регрессии нет).
  const q2 = quiet(() => E.deserializeEfir({
    ...base, skills: { strength: 3 }, spells: ['spark', 'flame_burst'],
  }, EFIR_SKILL_CATALOG, EFIR_SPELL_CATALOG));
  assert.ok(q2.res !== null,
    'каталогический id вне пула — проходит (инертен, D2-последствие)');

  // Каталоги null/undefined → СТРУКТУРНЫЙ режим (совместимость 000085:
  // unknown-id инертен) — пин 1-арг. вызовов существующих тестов.
  assert.notEqual(E.deserializeEfir({ ...base, skills: { nope: 1 } }), null,
    '1-арг. вызов — структурный режим (nope проходит)');
  assert.notEqual(E.deserializeEfir({ ...base, skills: { nope: 1 } },
    null, undefined), null,
    'каталоги null/undefined → id-валидация off');

  // Мусорный каталог (не-массив / записи без строкового id / пустой) →
  // off БЕЗ исключений (безопасное направление).
  for (const bad of ['junk', 42, { nope: 1 }, [], [{}, 'x', 42]]) {
    assert.doesNotThrow(() => {
      assert.notEqual(E.deserializeEfir({ ...base, skills: { nope: 1 } },
        bad, EFIR_SPELL_CATALOG), null,
        'мусорный каталог → off: ' + JSON.stringify(bad));
    }, 'мусорный каталог — без исключений: ' + JSON.stringify(bad));
  }

  // Тихая: serde-функции не warn'ят (warn печатает main.js).
  assert.equal(q.n, 0, 'тихая: 0 console.warn (валидные id)');
  assert.equal(q2.n, 0, 'тихая: 0 console.warn (инертный id)');
});

test('000115 N2: deserializeEfir — ОБЯЗАТЕЛЬНЫЙ reprocess при загрузке (банк → уровни, cap, overflow; плотная форма 4 id пула); round-trip идентично на канонической форме; 3-полевая legacy → плотная', () => {
  // Банк-оверфлоу: L1 cap = 3·2 = 6; 999 − (15+30+45+60+75+90) = 684
  // (фикс-точка 000111 T5).
  assert.deepEqual(
    E.deserializeEfir({ level: 1, xp: 0, skillXp: { firelord: 999 }, skills: {}, spells: ['spark', 'mend'] },
      EFIR_SKILL_CATALOG, EFIR_SPELL_CATALOG),
    { level: 1, xp: 0,
      skillXp: { firelord: 684, icelord: 0, perception: 0, precog: 0 },
      skills: { firelord: 6, icelord: 0, perception: 0, precog: 0 },
      spells: ['spark', 'mend'] },
    'банк-оверфлоу → cap + overflow, материализованы ВСЕ 4 id пула');

  // Round-trip на КАНОНИЧЕСКОЙ (post-reprocess) форме — идентично
  // (дроби skillXp 2.5, порядок spells [spark, mend, light_heal] — ТЗ).
  // Неподвижная точка: 2.5 < 30; reprocess не пишет level/xp/spells.
  const x = {
    level: 2, xp: 10,
    skillXp: { firelord: 2.5, icelord: 0, perception: 0, precog: 0 },
    skills: { firelord: 1, icelord: 0, perception: 0, precog: 0 },
    spells: ['spark', 'mend', 'light_heal'],
  };
  assert.deepEqual(E.deserializeEfir(E.serializeEfir(x),
    EFIR_SKILL_CATALOG, EFIR_SPELL_CATALOG), x,
    'round-trip идентично на канонической форме (дроби + порядок)');

  // 3-полевая legacy (до 000111) → 5-полевая ПЛОТНАЯ
  // (нормализация 000085 + reprocess 000115).
  assert.deepEqual(
    E.deserializeEfir({ level: 2, xp: 5, skills: {} },
      EFIR_SKILL_CATALOG, EFIR_SPELL_CATALOG),
    { level: 2, xp: 5,
      skillXp: { firelord: 0, icelord: 0, perception: 0, precog: 0 },
      skills: { firelord: 0, icelord: 0, perception: 0, precog: 0 },
      spells: ['spark', 'mend'] },
    '3-полевая legacy → плотная 4×0 + [spark, mend]');

  // Идемпотентность: повторный deserialize того же raw → идентично.
  const raw = { level: 1, xp: 0, skillXp: { firelord: 999 }, skills: {}, spells: ['spark', 'mend'] };
  assert.deepEqual(
    E.deserializeEfir(raw, EFIR_SKILL_CATALOG, EFIR_SPELL_CATALOG),
    E.deserializeEfir(raw, EFIR_SKILL_CATALOG, EFIR_SPELL_CATALOG),
    'идемпотентно (повторный deserialize → идентично)');
});

test('000115 N4: D5 level-guard — level > 1e6 → null (сброс ЗАПИСИ, тихая); граница level = 1e6 ВКЛЮЧИТЕЛЬНА (игровой кэп не введён)', () => {
  // D5 (memory/000115-efir-save-final.md): save-integrity-граница —
  // защита от зависания while-цикла reprocess поддельным уровнем
  // (forged ~1e15 + банк → cap ≈ 2·attr → ~1e15 итераций, вкладка
  // замёрзнет; новый путь после 000115, до неё недостижимый). НЕ
  // игровой кэп: L999/1e6 проходят (000085 D5 «без кэпа уровня»).
  const q = quiet(() => E.deserializeEfir({
    level: 2000000, xp: 0, skillXp: {}, skills: {}, spells: ['spark', 'mend'],
  }, EFIR_SKILL_CATALOG, EFIR_SPELL_CATALOG));
  assert.equal(q.res, null, 'level > 1e6 → null (сброс ЗАПИСИ, 000029)');
  assert.equal(q.n, 0, 'тихая: сброс БЕЗ warn (warn печатает main.js)');

  // Граница ВКЛЮЧИТЕЛЬНА: level = 1e6 проходит. Банк пуст → цикл
  // reprocess не крутится (0 < cost(0) = 15) — выход: плотный 4×0.
  assert.deepEqual(
    E.deserializeEfir({
      level: 1000000, xp: 0, skillXp: {}, skills: {}, spells: ['spark', 'mend'],
    }, EFIR_SKILL_CATALOG, EFIR_SPELL_CATALOG),
    { level: 1000000, xp: 0,
      skillXp: { firelord: 0, icelord: 0, perception: 0, precog: 0 },
      skills: { firelord: 0, icelord: 0, perception: 0, precog: 0 },
      spells: ['spark', 'mend'] },
    'level = 1e6 → состояние (граница включена; кэп не введён; плотный 4×0)');
});

test('000115 N3: версия НЕ поднята — CURRENT_VERSION = 1, MIGRATIONS пуст (re-pin 000072, ТЗ явно в списке «Тесты»)', () => {
  assert.equal(S.CURRENT_VERSION, 1,
    'финальная форма (5 полей) — неломкое расширение v1 (000031, ТЗ п.2)');
  assert.deepEqual(Object.keys(S.MIGRATIONS), [], 'миграций нет (MIGRATIONS пуст)');
});

test('000115 V1: e2e — чужие id в разделе efir: 0 ошибок, warn с именем раздела, state.efir = L1-дефолт (сброс ЗАПИСИ — не частичная чистка), повторный сейв — ЧИСТЫЙ раздел, version 1', async () => {
  const st = makeStorage();
  const h = bootWithSave(st, null, {
    day: 5,
    efir: { level: 2, xp: 0, skillXp: {}, skills: { nope: 1 }, spells: ['spark', 'nope'] },
  });
  for (let i = 0; i < 5; i++) await h.drain();
  assert.equal(h.errors.length, 0, 'ошибок НЕТ (тихий сброс, игра не падает): '
    + h.errors.join('; '));
  assert.ok(h.warns.some((m) => m.includes('efir')),
    'warn: раздел efir (текст main.js:570)');
  const state = h.sandbox.__game.state;
  assert.ok(state.efir, 'state.efir существует');
  assert.deepEqual(host(state.efir),
    { level: 1, xp: 0, skillXp: {}, skills: {}, spells: ['spark', 'mend'] },
    'чужой id → L1-дефолт: сброс ЗАПИСИ (не частичная чистка, не материализованный пул)');
  h.winListeners['beforeunload'][0]();
  const saved = JSON.parse(st.getItem(S.SAVE_KEY));
  assert.equal(saved.version, 1, 'CURRENT_VERSION = 1 (без бампа)');
  assert.deepEqual(saved.data.efir,
    { level: 1, xp: 0, skillXp: {}, skills: {}, spells: ['spark', 'mend'] },
    'мусор не размножается (000029) — повторный сейв чистый');
});

test('000115 V2: e2e — reprocess при загрузке (банк-оверфлоу): state.efir = ПЛОТНАЯ форма (cap + overflow), beforeunload → ТА ЖЕ форма в сейве (идентичность, дроби не теряются), version 1', async () => {
  const DENSE = {
    level: 1, xp: 0,
    skillXp: { firelord: 684, icelord: 0, perception: 0, precog: 0 },
    skills: { firelord: 6, icelord: 0, perception: 0, precog: 0 },
    spells: ['spark', 'mend'],
  };
  const st = makeStorage();
  const h = bootWithSave(st, null, {
    day: 7,
    efir: { level: 1, xp: 0, skillXp: { firelord: 999 }, skills: {}, spells: ['spark', 'mend'] },
  });
  for (let i = 0; i < 5; i++) await h.drain();
  assert.equal(h.errors.length, 0, 'ошибок загрузки нет: ' + h.errors.join('; '));
  const state = h.sandbox.__game.state;
  assert.ok(state.efir, 'state.efir существует');
  assert.deepEqual(host(state.efir), DENSE,
    'reprocess при загрузке: банк → cap + overflow (плотная 4 id пула)');
  h.winListeners['beforeunload'][0]();
  const saved = JSON.parse(st.getItem(S.SAVE_KEY));
  assert.equal(saved.version, 1, 'CURRENT_VERSION = 1 (без бампа)');
  assert.deepEqual(saved.data.efir, DENSE,
    'раздел переживает сейв БЕЗ ПОТЕРЬ (идемпотентно, 000111 §4)');
});

// --- Задача 000118: флаг первой встречи Эфира (вариант (а)) —
// ТОП-УРОВНЕВОЕ поле сейва efir_met (вне замороженного 5-полевого
// раздела efir — пины 000085/000115) ---
//
// КРАСНЫЙ (TDD): падает, пока в main.js нет let efirMet, поля
// efir_met в collectSaveData (ВСЕГДА пишется — паттерн 000109 R5),
// restore-ветки (=== true / мусор → warn+false / отсутствует →
// false), вызова noteEfirCombat после точек startCombat (реальные
// c.units), efirMet в opts и __game.state.
//
// Round-trip: бой с Эфиром → beforeunload → saved.data.efir_met =
// true (version 1) → СВЕЖАЯ песочница (модульный one-shot efir.js
// ЦЕЛ — строка повторилась бы без флага) → state.efirMet = true →
// строки первой встречи НЕТ (проверка флага ЧЕРЕЗ сейв, R8).

test('000118: e2e — флаг первой встречи: бой с Эфиром → beforeunload: efir_met = true (version 1); reload → state.efirMet → строки НЕТ; seed true → без строки; мусор → false + warn (CU118-SAVE)', async () => {
  const LINE = 'Эфир материализуется рядом с Флогистоном…'; // U+2026
  // (1) Свежая сессия: отладочный бой (Эфир ВСЕГДА, 000081) →
  //     строка в логе + флаг в сейве (топ-уровень, version 1).
  const st = makeStorage();
  const h = bootWithSave(st, null, { day: 1 });
  for (let i = 0; i < 5; i++) await h.drain();
  assert.equal(h.errors.length, 0, 'ошибок загрузки нет: ' + h.errors.join('; '));
  const c1 = h.sandbox.__game.actions.startCombat(0);
  assert.ok(c1, 'отладочный бой создан');
  assert.ok(c1.log.includes(LINE), 'бой 1: строка первой встречи: '
    + c1.log.join(' | '));
  assert.equal(h.sandbox.__game.state.efirMet, true,
    'state.efirMet = true после боя с Эфиром');
  h.winListeners['beforeunload'][0]();
  const saved = JSON.parse(st.getItem(S.SAVE_KEY));
  assert.equal(saved.version, 1,
    'CURRENT_VERSION = 1 (неломкое расширение v1 — без бампа)');
  assert.equal(saved.data.efir_met, true,
    'efir_met = true в сейве (ТОП-УРОВЕНЬ, вне раздела efir)');
  assert.deepEqual(Object.keys(saved.data.efir).sort(),
    ['level', 'skillXp', 'skills', 'spells', 'xp'],
    'раздел efir — ровно 5 полей (000115 — не трогается)');

  // (2) Reload из этого сейва: флаг восстановлен → строки НЕТ,
  //     даже в СВЕЖЕЙ песочнице (модульный one-shot там цел!).
  const st2 = makeStorage();
  const h2 = bootWithSave(st2, null, saved.data);
  for (let i = 0; i < 5; i++) await h2.drain();
  assert.equal(h2.sandbox.__game.state.efirMet, true,
    'restore: efir_met = true → state.efirMet = true');
  const c2 = h2.sandbox.__game.actions.startCombat(0);
  assert.ok(c2, 'бой 2 (после рестора)');
  assert.ok(!c2.log.includes(LINE),
    'бой 2 (сейв с флагом): строки НЕТ: ' + c2.log.join(' | '));

  // (3) Seed efir_met: true напрямую (без боевого round-trip) →
  //     state true → строки НЕТ.
  const st3 = makeStorage();
  const h3 = bootWithSave(st3, null, { day: 1, efir_met: true });
  for (let i = 0; i < 5; i++) await h3.drain();
  assert.equal(h3.sandbox.__game.state.efirMet, true,
    'seed: state.efirMet = true');
  const c3 = h3.sandbox.__game.actions.startCombat(0);
  assert.ok(c3, 'бой 3 (seed)');
  assert.ok(!c3.log.includes(LINE),
    'seed true: строки НЕТ: ' + c3.log.join(' | '));

  // (4) Мусор: 'junk' (не-boolean) → false + warn с именем поля
  //     (безопасное направление: строка максимум РАЗ повторится).
  const st4 = makeStorage();
  const h4 = bootWithSave(st4, null, { day: 1, efir_met: 'junk' });
  for (let i = 0; i < 5; i++) await h4.drain();
  assert.equal(h4.sandbox.__game.state.efirMet, false,
    'мусор: state.efirMet = false (безопасная деградация)');
  assert.ok(h4.warns.some((m) => m.includes('efir_met')),
    'warn с именем поля efir_met: ' + h4.warns.join('; '));
});

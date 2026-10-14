// Задача 000211.01 (родитель 000211): JSON-справочники — формат ссылки +
// общий резолвер + общий тест целостности.
//
// КРАСНЫЕ тесты (TDD): написаны ДО реализации; падают, пока
// scripts/lib/json-ref.js не существует (assert existsSync → осмысленная
// причина «модуля нет» в каждом из 9 тестов, не синтаксическая).
// После реализации — зелёные с первого прогона: якорных ссылок в данных
// сейчас 0 (гейт миграций 000211.02–.08, 000207/208/209), все 210
// svg-строк существуют (перепроверено станцией a3).
//
// Резолвер — Node-only CommonJS (scripts/lib/json-ref.js, образец
// scripts/lib/write-atomic.js): <script>-тега в index.html НЕТ (ТЗ §1,
// пин tests/index-order.test.js). Формат ссылки и правила sweep —
// memory/000211.01-json-ref-format.md.
//
// Контракты, зафиксированные здесь:
//   * AR1 — модуль на месте, поверхность РОВНО: REF_RE/PORTRAITS_RE
//     (RegExp), REF_CATALOGS (11 каталогов), isRef/resolveRef/
//     collectRefs/collectSvgs (функции); пути collectRefs/collectSvgs —
//     стиль where валидатора (голый ключ, [i], .k).
//   * AR2 — isRef: якорный паттерн 9 каталогов (+/−); visuals ВНЕ
//     паттерна; 5/7 цифр, .bak, id и путь к js — не ссылки; не-строка —
//     false.
//   * AR3 — isRef: portraits — именованные (efir/flogiston/npc-NNNNNN)
//     (+/−).
//   * AR4 — resolveRef(root, ref): файл существует, парсится как JSON,
//     содержит id — hasOwnProperty, НЕ truthiness: dungeons/000001 —
//     id = 0 (falsy) резолюция ОБЯЗАНА пройти; id строковый и числовой.
//   * AR5 — resolveRef: отрицательный контроль — битый путь (считается
//     ДИНАМИЧЕСКИ: макс. номер items + 1, без хардкода) → 'no-file';
//     строка вне паттерна (visuals, id) → 'not-a-ref'.
//   * AR6 — resolveRef: отрицательный контроль — не-JSON файл →
//     'not-json' (изолирован в mkdtemp tmp-корне; root — позиционный
//     параметр, дефолта нет).
//   * AR7 — resolveRef: отрицательный контроль — JSON-объект без
//     верхнеуровневого id → 'no-id' (tmp-корень).
//   * AR8 — sweep 11 каталогов (REF_CATALOGS): только ДАННЫЕ файлы
//     (9 каталогов — \d{6}.json, portraits — ВСЕ *.json; schema.json
//     исключён), каждая строка под якорным паттерном (collectRefs)
//     резолвится ok. Сейчас 0 ссылок — тест ГЕЙТ последующих миграций.
//   * AR9 — sweep 11 каталогов: каждая строка «assets/…*.svg»
//     (collectSvgs) существует от корня (existsSync). Анти-вакуум:
//     прецедент «спрайт» assets/visuals/000001.json
//     "assets/sprites/visuals/grass_blades_light.svg" обязателен в
//     результате. Голые имена иконок portraits (efir.svg …) — вне скоупа
//     (волна 2, memory §3).
//
// Тест НЕ пиннит КОЛИЧЕСТВО ссылок/svg (0 сейчас, 45+ после миграций).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const MOD_PATH = path.join(ROOT, 'scripts', 'lib', 'json-ref.js');

function loadRef() {
  assert.ok(fs.existsSync(MOD_PATH),
    'scripts/lib/json-ref.js не существует (задача 000211.01: красные тесты)');
  return require(MOD_PATH);
}

const REF_CATALOGS_EXPECTED = ['items', 'skills', 'spells', 'mobs',
  'mob_groups', 'buildings', 'craft', 'dungeons', 'npc', 'visuals',
  'portraits'];

function dataFiles(mod, cat) {
  const dir = path.join(ROOT, 'assets', cat);
  const files = cat === 'portraits'
    ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort()
    : fs.readdirSync(dir).filter((f) => /^\d{6}\.json$/.test(f)).sort();
  assert.ok(files.length >= 1, cat + ': sweep прошёл 0 файлов (анти-вакуум)');
  return { dir, files };
}

function sweep(mod, pick) {
  const out = [];
  for (const cat of mod.REF_CATALOGS) {
    const { dir, files } = dataFiles(mod, cat);
    for (const f of files) {
      const data = JSON.parse(
        fs.readFileSync(path.join(dir, f), 'utf8'));
      for (const item of pick(data)) {
        out.push(Object.assign({ cat, file: f }, item));
      }
    }
  }
  return out;
}

function withTmpRoot(files, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'assets-refs-'));
  try {
    for (const [rel, content] of files) {
      const p = path.join(dir, rel);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, content, 'utf8');
    }
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('AR1: json-ref.js — модуль на месте, поверхность', () => {
  const mod = loadRef();
  assert.ok(mod && typeof mod === 'object' && !Array.isArray(mod),
    'module.exports — объект (CommonJS)');
  assert.ok(mod.REF_RE instanceof RegExp, 'REF_RE — RegExp');
  assert.ok(mod.PORTRAITS_RE instanceof RegExp, 'PORTRAITS_RE — RegExp');
  assert.ok(Array.isArray(mod.REF_CATALOGS), 'REF_CATALOGS — массив');
  assert.deepEqual([...mod.REF_CATALOGS].sort(),
    [...REF_CATALOGS_EXPECTED].sort(),
    'REF_CATALOGS — РОВНО 11 каталогов sweep; факт: '
    + JSON.stringify(mod.REF_CATALOGS));
  for (const fn of ['isRef', 'resolveRef', 'collectRefs', 'collectSvgs']) {
    assert.equal(typeof mod[fn], 'function', fn + ' — функция');
  }
  // Пути — стиль where валидатора: голый ключ, [i], .k.
  assert.deepEqual(mod.collectRefs({
    loot: [{ item: 'assets/items/000001.json', name: 'не ссылка' }],
    skill: 'fists',
    nested: { ref: 'assets/dungeons/000001.json' },
  }), [
    { path: 'loot[0].item', ref: 'assets/items/000001.json' },
    { path: 'nested.ref', ref: 'assets/dungeons/000001.json' },
  ], 'collectRefs: только якорные строки, путь where-стиля');
  assert.deepEqual(mod.collectSvgs({
    art: { move: ['assets/sprites/mobs/x_move1.svg'] },
    icon: 'efir.svg',
    map: 'assets/sprites/loot/x.png',
  }), [
    { path: 'art.move[0]', svg: 'assets/sprites/mobs/x_move1.svg' },
  ], 'collectSvgs: только «assets/…*.svg» (голое имя и .png — мимо)');
});

test('AR2: isRef — якорный паттерн 9 каталогов (+/−)', () => {
  const mod = loadRef();
  for (const s of [
    'assets/items/000001.json',
    'assets/skills/000037.json',
    'assets/dungeons/000005.json',
    'assets/mobs/000036.json',
    'assets/mob_groups/000007.json',
    'assets/buildings/000054.json',
    'assets/craft/000031.json',
    'assets/spells/000017.json',
    'assets/npc/000018.json',
  ]) {
    assert.equal(mod.isRef(s), true, 'ссылка: ' + s);
  }
  for (const s of [
    'assets/visuals/000001.json',  // visuals вне паттерна (прямые svg-пути)
    'assets/mobs/00001.json',      // 5 цифр
    'assets/mobs/0000001.json',    // 7 цифр
    'assets/items/1.json',
    'assets/items/000001.json.bak',
    'assets/items/000001.JSON',
    'fists',                       // id, не путь
    'src/items-data.js',
  ]) {
    assert.equal(mod.isRef(s), false, 'не ссылка: ' + s);
  }
  for (const v of [42, null, undefined, {}]) {
    assert.equal(mod.isRef(v), false, 'не-строка — false: '
      + JSON.stringify(v));
  }
});

test('AR3: isRef — portraits (efir/flogiston/npc-NNNNNN) (+/−)', () => {
  const mod = loadRef();
  for (const s of [
    'assets/portraits/efir.json',
    'assets/portraits/flogiston.json',
    'assets/portraits/npc-000012.json',
    'assets/portraits/npc-000017.json',
  ]) {
    assert.equal(mod.isRef(s), true, 'ссылка: ' + s);
  }
  for (const s of [
    'assets/portraits/npc-12.json',
    'assets/portraits/npc-0000123.json',
    'assets/portraits/unknown.json',
    'assets/portraits/efir.svg',
    'assets/portraits/npc-000012.json.bak',
  ]) {
    assert.equal(mod.isRef(s), false, 'не ссылка: ' + s);
  }
});

test('AR4: resolveRef — файл существует, парсится, содержит id (id=0)', () => {
  const mod = loadRef();
  const cases = [
    ['assets/items/000001.json', 'wood_sword'],  // id — строка
    ['assets/dungeons/000001.json', 0],          // id = 0 (falsy!)
    ['assets/buildings/000001.json', 1],         // id — число
    ['assets/portraits/efir.json', 'efir'],      // именованный portraits
  ];
  for (const [ref, id] of cases) {
    const r = mod.resolveRef(ROOT, ref);
    assert.deepEqual(r, { ok: true, id },
      ref + ': {ok:true, id:' + JSON.stringify(id) + '}; факт: '
      + JSON.stringify(r));
  }
});

test('AR5: resolveRef — отрицательный: битый путь (no-file), не-ссылка (not-a-ref)', () => {
  const mod = loadRef();
  const items = fs.readdirSync(path.join(ROOT, 'assets', 'items'))
    .filter((f) => /^\d{6}\.json$/.test(f)).sort();
  assert.ok(items.length > 0, 'assets/items пуст — предпосылка нарушена');
  const maxNum = parseInt(items[items.length - 1], 10);
  const missing = 'assets/items/'
    + String(maxNum + 1).padStart(6, '0') + '.json';
  assert.equal(mod.isRef(missing), true,
    'предпосылка: битый путь под якорным паттерном');
  assert.deepEqual(mod.resolveRef(ROOT, missing),
    { ok: false, reason: 'no-file' },
    missing + ': файла нет → no-file');
  assert.deepEqual(mod.resolveRef(ROOT, 'assets/visuals/000001.json'),
    { ok: false, reason: 'not-a-ref' },
    'visuals вне паттерна → not-a-ref');
  assert.deepEqual(mod.resolveRef(ROOT, 'fists'),
    { ok: false, reason: 'not-a-ref' }, 'id, не путь → not-a-ref');
});

test('AR6: resolveRef — отрицательный: не-JSON файл (not-json)', () => {
  const mod = loadRef();
  withTmpRoot([['assets/items/000001.json', 'не JSON {']
  ], (dir) => {
    assert.deepEqual(mod.resolveRef(dir, 'assets/items/000001.json'),
      { ok: false, reason: 'not-json' });
  });
});

test('AR7: resolveRef — отрицательный: файл без id (no-id)', () => {
  const mod = loadRef();
  withTmpRoot([['assets/items/000001.json',
    JSON.stringify({ name: 'без id', kind: 'weapon' })]
  ], (dir) => {
    assert.deepEqual(mod.resolveRef(dir, 'assets/items/000001.json'),
      { ok: false, reason: 'no-id' });
  });
});

test('AR8: sweep 11 каталогов — каждая якорная ссылка резолвится (гейт)', () => {
  const mod = loadRef();
  const refs = sweep(mod, (data) => mod.collectRefs(data));
  const bad = refs
    .filter(({ ref }) => !mod.resolveRef(ROOT, ref).ok)
    .map(({ cat, file, path: where, ref }) =>
      cat + '/' + file + ' ' + where + ' → ' + ref);
  assert.deepEqual(bad, [], 'нерезолвящиеся ссылки: ' + bad.join('; '));
});

test('AR9: sweep 11 каталогов — каждая «assets/…*.svg» существует', () => {
  const mod = loadRef();
  const svgs = sweep(mod, (data) => mod.collectSvgs(data));
  const missing = svgs
    .filter(({ svg }) => !fs.existsSync(path.join(ROOT, svg)))
    .map(({ cat, file, path: where, svg }) =>
      cat + '/' + file + ' ' + where + ' → ' + svg);
  assert.deepEqual(missing, [],
    'несуществующие svg: ' + missing.join('; '));
  const v1 = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'assets', 'visuals', '000001.json'), 'utf8'));
  assert.ok(mod.collectSvgs(v1).some((x) =>
    x.svg === 'assets/sprites/visuals/grass_blades_light.svg'),
    'анти-вакуум: прецедент «спрайт» visuals/000001 в sweep');
});

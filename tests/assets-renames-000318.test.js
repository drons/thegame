// Задача 000318.01 (родитель 000318): инфраструктура — per-catalog форма имён
// JSON в assets/ + свип ссылочной целостности имён (НИЧЕГО не переименовывает:
// все каталоги на диске — 'number'-формы). Реестр каталогов/шейпов и правила
// будущих переименований — memory/000318-asset-rename.md; анализ разбивки —
// tasks/result/000318-split-20261108.md.
//
// КРАСНЫЕ тесты (TDD): RN1/RN4/RN5 красные, пока в scripts/lib/json-ref.js
// нет ASSET_NAME_SHAPES/SHAPE_BASENAME_RES/refPath/isRefPath/isRefPathFull/
// REF_LINKED_CATALOGS (охрана через assert.ok — осмысленный ERR_ASSERTION,
// не крах загрузки). RN2/RN3 зелёные на текущем диске.
//
// Контракты:
//   * RN1 — реестр шейпов: 11 нумерованных каталогов → 'number',
//     portraits → 'named'; REF_LINKED_CATALOGS — РОВНО 9 мишеней ссылок
//     (REF_CATALOGS минус visuals и portraits); ref-eligibility ≠ name-shape
//     (visuals/runes при ЛЮБОМ шейпе НЕ ref); refPath/isRefPathFull.
//   * RN2 — покаталожный свип: каждый JSON (кроме schema.json) в форме из
//     таблицы шейпов lib; номера уникальны и идут ПОДРЯД 1..N; craft —
//     явное пин-исключение (файлы сегментами с дырами, memory).
//   * RN3 — каждая межкаталожная ссылка в каждом файловом данных 11
//     каталогов резолвится ok (супер-set AR8, включая runes).
//   * RN4 — задел под slug-шейп (будущие дочерние 000318.YY): при ВРЕМЕННОМ
//     (try/finally) флипе шейпа свип требует basename === id + '.json';
//     'number'-шейп НЕ требует basename == id (dungeons: id 0..4 при
//     файлах 000001..000005 — прецедент смещения).
//   * RN5 — изоморфный набор строк (9 каталогов × {6,5,7 цифр, slug, .bak,
//     .JSON, 1 цифра} + visuals/runes/portraits/мусор/не-строки): isRef ≡
//     REF_RE ∪ PORTRAITS_RE — обратная совместимость после разборки REF_RE.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const MOD_PATH = path.join(ROOT, 'scripts', 'lib', 'json-ref.js');

// Авторитетная таблица теста (паттерн tests/svg.test.js): 11 нумерованных
// каталогов данных (REF_CATALOGS минус portraits, плюс runes — он никогда
// не был мишенью ссылок, но каталог нумерованный).
const NUMBERED = ['items', 'skills', 'spells', 'mobs', 'mob_groups',
  'buildings', 'craft', 'dungeons', 'npc', 'runes', 'visuals'];
// Непрерывная нумерация 1..N НЕ пиннится только здесь (дыры сегментов —
// memory/000318-asset-rename.md).
const GAPPED = new Set(['craft']);
const REF_LINKED_EXPECTED = ['items', 'skills', 'spells', 'mobs',
  'mob_groups', 'buildings', 'craft', 'dungeons', 'npc'];

function loadRef() {
  assert.ok(fs.existsSync(MOD_PATH),
    'scripts/lib/json-ref.js не существует');
  return require(MOD_PATH);
}

function loadShapes() {
  const mod = loadRef();
  assert.ok(mod.ASSET_NAME_SHAPES
    && typeof mod.ASSET_NAME_SHAPES === 'object'
    && !Array.isArray(mod.ASSET_NAME_SHAPES),
    'ASSET_NAME_SHAPES отсутствует (000318.01: красные до появления шейпов в lib)');
  assert.ok(mod.SHAPE_BASENAME_RES
    && mod.SHAPE_BASENAME_RES.number instanceof RegExp
    && mod.SHAPE_BASENAME_RES.slug instanceof RegExp,
    'SHAPE_BASENAME_RES.number/.slug — RegExp');
  for (const fn of ['refPath', 'isRefPath', 'isRefPathFull']) {
    assert.equal(typeof mod[fn], 'function', fn + ' — функция');
  }
  assert.ok(Array.isArray(mod.REF_LINKED_CATALOGS),
    'REF_LINKED_CATALOGS — массив');
  return mod;
}

function dataFiles(dir, cat) {
  return fs.readdirSync(path.join(dir, 'assets', cat))
    .filter((f) => f.endsWith('.json') && f !== 'schema.json')
    .sort();
}

function withTmpRoot(files, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'assets-renames-'));
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

// Семантика свипа для будущих дочерних 000318.YY (НЕ реальный rename):
// slug-шейп → basename === id + '.json'; number-шейп → только форма
// (basename ≠ id легален: dungeons). Возвращает массив описаний нарушений.
function renameViolations(mod, dir, cat) {
  const shape = mod.ASSET_NAME_SHAPES[cat];
  const re = mod.SHAPE_BASENAME_RES[shape];
  const out = [];
  for (const f of dataFiles(dir, cat)) {
    if (!re || !re.test(f)) {
      out.push(cat + '/' + f + ': не форма шейпа «' + shape + '»');
      continue;
    }
    if (shape === 'slug') {
      const data = JSON.parse(fs.readFileSync(
        path.join(dir, 'assets', cat, f), 'utf8'));
      if (f !== data.id + '.json') {
        out.push(cat + '/' + f + ': basename != id «' + data.id + '»');
      }
    }
  }
  return out;
}

test('RN1: реестр шейпов — 11 каталогов number, portraits named, 9 мишеней', () => {
  const mod = loadShapes();
  for (const cat of NUMBERED) {
    assert.equal(mod.ASSET_NAME_SHAPES[cat], 'number',
      cat + ': шейп number (в .01 ничего не переименовано)');
  }
  assert.equal(mod.ASSET_NAME_SHAPES.portraits, 'named',
    'portraits — named (только PORTRAITS_RE, вне SHAPE_BASENAME_RES)');
  assert.deepEqual([...mod.REF_LINKED_CATALOGS], REF_LINKED_EXPECTED,
    'REF_LINKED_CATALOGS — РОВНО 9 мишеней ссылок (REF_CATALOGS минус visuals/portraits)');
  assert.equal(mod.isRefPath('visuals', '000001.json'), false,
    'ref-eligibility ≠ name-shape: visuals не мишень ссылок (AR2/AR5)');
  assert.equal(mod.isRefPath('runes', '000001.json'), false,
    'runes никогда не был мишенью REF_RE — остаётся не-ref и при number-шейпе');
  assert.equal(mod.isRefPath('portraits', 'efir.json'), false,
    'portraits — вне шейпов, только PORTRAITS_RE');
  assert.equal(mod.isRefPath('items', '000001.json'), true,
    'number-каталог-мишень: номерная форма — ref');
  assert.equal(mod.isRefPath('items', 'wood_sword.json'), false,
    'slug в number-каталоге — НЕ ref (негатив ТЗ)');
  assert.equal(mod.refPath('items', '000001.json'),
    'assets/items/000001.json', 'refPath собирает корневой путь');
  assert.equal(mod.isRefPathFull('assets/mobs/000036.json'), true);
  assert.equal(mod.isRefPathFull('assets/mobs/00001.json'), false,
    '5 цифр — не ref');
  assert.equal(mod.isRefPathFull('assets/mobs/0000001.json'), false,
    '7 цифр — не ref');
});

test('RN2: свип каталогов — имена по форме lib, номера уникальны и подряд (craft — дыры, исключение)', () => {
  const mod = loadShapes();
  for (const cat of NUMBERED) {
    const files = dataFiles(ROOT, cat);
    assert.ok(files.length >= 1, cat + ': свип прошёл 0 файлов (анти-вакуум)');
    const shape = mod.ASSET_NAME_SHAPES[cat];
    const re = mod.SHAPE_BASENAME_RES[shape];
    assert.ok(re instanceof RegExp,
      cat + ': шейп «' + shape + '» без формы в SHAPE_BASENAME_RES');
    const bad = files.filter((f) => !re.test(f));
    assert.deepEqual(bad, [], cat + ': файлы вне формы шейпа «' + shape + '»');
    const nums = files.map((f) => parseInt(f, 10));
    const seen = new Set();
    const dup = [];
    for (const n of nums) {
      if (seen.has(n)) dup.push(n);
      seen.add(n);
    }
    assert.deepEqual(dup, [], cat + ': дубли номеров');
    const ascending = [...nums].sort((a, b) => a - b);
    assert.deepEqual(nums, ascending,
      cat + ': номера идут по порядку имён файлов');
    if (GAPPED.has(cat)) {
      assert.ok(nums[nums.length - 1] > nums.length,
        cat + ': пин-исключение — нумерация С ДЫРАМИ (макс. номер больше '
        + 'числа файлов); факт: max=' + nums[nums.length - 1]
        + ', count=' + nums.length);
    } else {
      assert.deepEqual(nums,
        Array.from({ length: nums.length }, (_, i) => i + 1),
        cat + ': номера подряд 1..' + nums.length + ' без дыр');
    }
  }
});

test('RN3: каждая межкаталожная ссылка в 11 нумерованных каталогах резолвится ok', () => {
  const mod = loadShapes();
  const bad = [];
  let total = 0;
  for (const cat of NUMBERED) {
    for (const f of dataFiles(ROOT, cat)) {
      const data = JSON.parse(
        fs.readFileSync(path.join(ROOT, 'assets', cat, f), 'utf8'));
      for (const { path: where, ref } of mod.collectRefs(data)) {
        total += 1;
        if (!mod.resolveRef(ROOT, ref).ok) {
          bad.push(cat + '/' + f + ' ' + where + ' → ' + ref);
        }
      }
    }
  }
  assert.ok(total > 0, 'анти-вакуум: на диске есть хотя бы одна якорная ссылка');
  assert.deepEqual(bad, [], 'нерезолвящиеся ссылки: ' + bad.join('; '));
});

test('RN4: slug-шейп (временная подмена) — свип требует basename == id; number — НЕ требует', () => {
  const mod = loadShapes();
  assert.deepEqual(renameViolations(mod, ROOT, 'dungeons'), [],
    'number-шейп: смещение id допустимо (dungeons id 0..4 при 000001..000005)');
  const saved = mod.ASSET_NAME_SHAPES.items;
  mod.ASSET_NAME_SHAPES.items = 'slug';
  try {
    withTmpRoot([
      ['assets/items/wood_sword.json', JSON.stringify({ id: 'wood_sword' })],
      ['assets/items/iron_helmet.json', JSON.stringify({ id: 'iron_helmet' })],
    ], (dir) => {
      assert.deepEqual(renameViolations(mod, dir, 'items'), [],
        'slug-шейп: basename == id — чисто');
    });
    withTmpRoot([
      ['assets/items/wood_sword.json', JSON.stringify({ id: 'wood_sword' })],
      ['assets/items/old_name.json', JSON.stringify({ id: 'iron_helmet' })],
    ], (dir) => {
      const v = renameViolations(mod, dir, 'items');
      assert.equal(v.length, 1,
        'slug-шейп: basename != id — ровно одно нарушение: ' + v.join('; '));
      assert.ok(v[0].includes('old_name.json'),
        'нарушение указывает на файл с рассогласованным именем: ' + v[0]);
    });
  } finally {
    mod.ASSET_NAME_SHAPES.items = saved;
  }
  assert.equal(mod.ASSET_NAME_SHAPES.items, 'number',
    'шейп восстановлен после finally (изоляция от других тестов файла)');
});

test('RN5: изоморфный набор — isRef ≡ REF_RE ∪ PORTRAITS_RE (обратная совместимость)', () => {
  const mod = loadShapes();
  const samples = [];
  for (const cat of REF_LINKED_EXPECTED) {
    for (const b of ['000001.json', '00001.json', '0000001.json',
      'wood_sword.json', '000001.json.bak', '000001.JSON', '1.json']) {
      samples.push('assets/' + cat + '/' + b);
    }
  }
  samples.push(
    'assets/visuals/000001.json',
    'assets/runes/000001.json',
    'assets/runes/wood_sword.json',
    'assets/portraits/efir.json',
    'assets/portraits/flogiston.json',
    'assets/portraits/npc-000012.json',
    'assets/portraits/npc-12.json',
    'assets/portraits/unknown.json',
    'fists',
    'src/items-data.js',
    'assets',
    'assets//000001.json',
    'assets/items/000001/000002.json');
  for (const s of samples) {
    assert.equal(mod.isRef(s),
      mod.REF_RE.test(s) || mod.PORTRAITS_RE.test(s),
      'isRef ≡ REF_RE ∪ PORTRAITS_RE: ' + s);
    assert.equal(mod.isRef(s),
      mod.isRefPathFull(s) || mod.PORTRAITS_RE.test(s),
      'isRef ≡ isRefPathFull ∪ PORTRAITS_RE: ' + s);
  }
  for (const v of [42, null, undefined, {}]) {
    assert.equal(mod.isRef(v), false, 'не-строка — false');
    assert.equal(mod.isRefPathFull(String(v)), false,
      'не-путь — isRefPathFull false');
  }
});

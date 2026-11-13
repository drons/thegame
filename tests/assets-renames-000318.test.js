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
//   * RN1 — реестр шейпов: 11 нумерованных каталогов → 'number'
//     (runes — 'slug' с 000318.02, visuals — 'slug' с 000318.03,
//     mobs/mob_groups/dungeons — 'slug' с 000318.04, spells — 'slug'
//     с 000318.05, buildings — 'slug' с 000318.06),
//     portraits → 'named';
//     REF_LINKED_CATALOGS — РОВНО 9 мишеней ссылок
//     (REF_CATALOGS минус visuals и portraits); ref-eligibility ≠ name-shape
//     (visuals/runes при ЛЮБОМ шейпе НЕ ref); refPath/isRefPathFull.
//   * RN2 — покаталожный свип: каждый JSON (кроме schema.json) в форме из
//     таблицы шейпов lib; номера уникальны и идут ПОДРЯД 1..N (прежнее
//     пин-исключение craft с дырами сегментов снято 000318.07 — каталог
//     slug, «подряд» несвойственен имени); slug-шейп —
//     basename == имени из NAME_OF_000318 (runes — id; visuals — basename
//     «спрайт», id числовой остаётся в JSON).
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
// Непрерывная нумерация 1..N НЕ пиннится только здесь. Пусто с 000318.07:
// единственное исключение (craft — файлы сегментами с дырами,
// memory/000318-asset-rename.md) снято вместе с number-шейпом каталога.
const GAPPED = new Set();
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

// Имя-носитель для slug-каталогов (по умолчанию basename === id + '.json'):
// runes (000318.02) — id; visuals (000318.03) — basename поля «спрайт»
// (id каталога ЧИСЛОВОЙ 1..13, имя — по спрайту); mobs (000318.04) — id
// (строковый, default); craft (000318.07) — id (строковый, default).
// mob_groups/dungeons (000318.04) — ИМЕНА РУКОПИСНЫЕ
// (id числовой, имя не выводится из данных): честный пин — таблица id→slug
// задачи .04 (память memory/000318-asset-rename.md), а не ослабление свипа.
const MOB_GROUP_SLUG_00031804 = {
  1: 'orc_camp', 2: 'orc_raiders', 3: 'skeleton_den', 4: 'wolf_pack',
  5: 'spider_nest', 6: 'elemental_circle', 7: 'abyss_spirit',
};
const DUNGEON_SLUG_00031804 = {
  0: 'simple_cave', 1: 'crypt', 2: 'castle_ruins', 3: 'flooded_cave',
  4: 'abyss',
};
// buildings (000318.06): 29 записей несут «спрайт» (25 × sprites/buildings
// + 4 города city_5N) — имя = basename спрайта (visuals .03); 26 без
// «спрайт» — ИМЕНА РУКОПИСНЫЕ (иконки numeric — контракт 000293, имя не
// выводится из данных): честный пин — таблица id→slug задачи .06 (память
// memory/000318-buildings.md), а не ослабление свипа.
const BUILDING_SLUG_00031806 = {
  5: 'wanderer_shop', 6: 'universam', 9: 'gladiator_yard',
  12: 'hunting_estate', 13: 'gymnasium', 14: 'gladiator_camp',
  15: 'bathhouse', 16: 'library', 17: 'alchemy_lab', 18: 'mage_tower',
  19: 'monastery', 20: 'elders_hut', 21: 'healing_temple',
  22: 'tavern_school', 23: 'theater', 24: 'town_hall',
  26: 'healer_house', 27: 'scribe_house', 28: 'merchant_house',
  29: 'hermit_hut', 30: 'orc_pagan_house', 32: 'crypt',
  33: 'castle_ruins', 34: 'flooded_cave', 35: 'abyss',
  50: 'bridge_gate',
};
const NAME_OF_000318 = {
  runes: (data) => data.id + '.json',
  visuals: (data) => path.basename(data.спрайт, '.svg') + '.json',
  mob_groups: (data) => MOB_GROUP_SLUG_00031804[data.id] + '.json',
  dungeons: (data) => DUNGEON_SLUG_00031804[data.id] + '.json',
  buildings: (data) => (typeof data.спрайт === 'string'
    ? path.basename(data.спрайт, '.svg')
    : BUILDING_SLUG_00031806[data.id]) + '.json',
};

// Семантика свипа для будущих дочерних 000318.YY (НЕ реальный rename):
// slug-шейп → basename === NameOf-имени; number-шейп → только форма
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
      const nameOf = NAME_OF_000318[cat] || ((d) => d.id + '.json');
      if (f !== nameOf(data)) {
        out.push(cat + '/' + f + ': basename != «' + nameOf(data) + '»');
      }
    }
  }
  return out;
}

// Переименованные дочерними каталоги (000318.YY) — вне прежнего default
// 'number'; остальные NUMBERED остаются number до своих дочерних.
const SHAPES_EXPECTED_000318 = { runes: 'slug', visuals: 'slug',
  mobs: 'slug', mob_groups: 'slug', dungeons: 'slug',
  spells: 'slug', buildings: 'slug', craft: 'slug' }; // .02, .03, .04, .05, .06, .07

test('RN1: реестр шейпов — переименованные каталоги по таблице, прочие number, portraits named, 9 мишеней', () => {
  const mod = loadShapes();
  for (const cat of NUMBERED) {
    assert.equal(mod.ASSET_NAME_SHAPES[cat],
      SHAPES_EXPECTED_000318[cat] || 'number',
      cat + ': шейп по таблице переименований 000318 (.01 — все number; '
      + '.02 переименовал runes в slug; .03 — visuals; .04 — '
      + 'mobs/mob_groups/dungeons; .05 — spells; .06 — buildings; '
      + '.07 — craft)');
  }
  assert.equal(mod.ASSET_NAME_SHAPES.portraits, 'named',
    'portraits — named (только PORTRAITS_RE, вне SHAPE_BASENAME_RES)');
  assert.deepEqual([...mod.REF_LINKED_CATALOGS], REF_LINKED_EXPECTED,
    'REF_LINKED_CATALOGS — РОВНО 9 мишеней ссылок (REF_CATALOGS минус visuals/portraits)');
  assert.equal(mod.isRefPath('visuals', '000001.json'), false,
    'ref-eligibility ≠ name-shape: visuals не мишень ссылок (AR2/AR5)');
  assert.equal(mod.isRefPath('runes', '000001.json'), false,
    'runes никогда не был мишенью REF_RE — не-ref и при slug-шейпе (000318.02)');
  assert.equal(mod.isRefPath('portraits', 'efir.json'), false,
    'portraits — вне шейпов, только PORTRAITS_RE');
  assert.equal(mod.isRefPath('items', '000001.json'), true,
    'number-каталог-мишень: номерная форма — ref');
  assert.equal(mod.isRefPath('items', 'wood_sword.json'), false,
    'slug в number-каталоге — НЕ ref (негатив ТЗ)');
  assert.equal(mod.refPath('items', '000001.json'),
    'assets/items/000001.json', 'refPath собирает корневой путь');
  assert.equal(mod.isRefPathFull('assets/mobs/abomination.json'), true,
    'mobs (slug с 000318.04): slug-имя — ref');
  assert.equal(mod.isRefPathFull('assets/mobs/000036.json'), false,
    'mobs (slug с 000318.04): прежний номер — НЕ ref');
  assert.equal(mod.isRefPathFull('assets/mobs/00001.json'), false,
    '5 цифр — не ref');
  assert.equal(mod.isRefPathFull('assets/mobs/0000001.json'), false,
    '7 цифр — не ref');
});

test('RN2: свип каталогов — имена по форме lib; number — номера подряд, slug — basename == NameOf (runes/mobs/craft — id, visuals — спрайт, mob_groups/dungeons — таблицы 000318.04)', () => {
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
    if (shape !== 'number') {
      // Смысловая замена числовых пинов для slug-каталога (000318.02/.03):
      // «подряд 1..N» носителю имени несвойственен — вместо него честный
      // свип basename == NameOf (renameViolations: runes — id, visuals —
      // basename «спрайт») + уникальность id.
      assert.deepEqual(renameViolations(mod, ROOT, cat), [],
        cat + ': slug-шейп — basename == имени из NAME_OF_000318 каждого файла');
      const ids = files.map((f) => JSON.parse(fs.readFileSync(
        path.join(ROOT, 'assets', cat, f), 'utf8')).id);
      const dupIds = ids.filter((v, i) => ids.indexOf(v) !== i);
      assert.deepEqual(dupIds, [],
        cat + ': дубли id (basename==NameOf + уникальность файлов ⇒ имена уникальны)');
      continue;
    }
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
  assert.deepEqual(renameViolations(mod, ROOT, 'items'), [],
    'number-шейп: смещение id допустимо (items id — строковые slug-имена '
    + 'при файлах 0000NN.json; dungeons с 000318.04 сам slug-шейп)');
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
    'assets/visuals/grass_blades_light.json',
    'assets/mobs/abomination.json',
    'assets/mob_groups/orc_camp.json',
    'assets/dungeons/abyss.json',
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

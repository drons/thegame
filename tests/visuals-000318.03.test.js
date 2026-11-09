// Задача 000318.03 (родитель 000318): переименование assets/visuals/
// 0000NN.json → <slug>.json, где slug = basename поля «спрайт» (13 файлов,
// git mv R100 контент-0-diff; числовой id 1..13 в JSON НЕ меняется —
// имя ≠ id, в отличие от runes 000318.02). Зависимость 000318.01: шейп
// per-catalog — ASSET_NAME_SHAPES.visuals = 'slug' (фильтры читают РЕЕСТР
// scripts/lib/json-ref.js, своего regex не плодим; slug-regex ловит и
// schema.json — явное исключение обязательно).
//
// КЛЮЧЕВОЙ КОНТРАКТ ПОРЯДКА: прежняя sync-сортировка .sort() по имени файла
// была носителем ПОРЯДКА зеркала (входит в формулы tileVisuals — seed от id,
// порядок массива — от порядка каталога). После rename сортировка — ПО
// ЧИСЛОВИЧ id, итоговый порядок записей в src/visuals-data.js — бит-в-бит
// прежний (меняются только пути-комментарии). lex-порядок slug-имён ≠
// id-порядку (bush=6, dry_tuft=11, …) — компаратор ЖИВО наблюдаем на новых
// именах (в отличие от runes, где basename==id делал его ненаблюдаемым).
//
// REGRESSION-стражи: REF_RE от флипа шейпа НЕ дрейфует (visuals ∉
// REF_LINKED_CATALOGS — каталог прямых svg-путей, негативы AR2/AR5/AR14
// навсегда); биекция 13≡13 json↔svg по basename сохраняется.
// kind=node; RED: до rename/флипа реестра T1/T2/T3/T4/T6 краснеют ОСМЫСЛЕННО
// (guard-сообщения), T5 — зелёный страж порядка (носитель «формулы бит-в-бит»).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const VDIR = path.join(ROOT, 'assets', 'visuals');
const SPR_DIR = path.join(ROOT, 'assets', 'sprites', 'visuals');
const MIRROR = path.join(ROOT, 'src', 'visuals-data.js');
const SYNC = path.join(ROOT, 'scripts', 'sync-visuals-data.js');
const LIB = path.join(ROOT, 'scripts', 'lib', 'json-ref.js');

const TOTAL_00031803 = 13;

// Ростер номер→slug (id JSON = прежний номер файла; slug = basename
// «спрайт»; фиксирован в memory/000318-visuals.md).
const ROSTER_00031803 = [
  [1, 'grass_blades_light'],
  [2, 'grass_blades_dark'],
  [3, 'flower_red'],
  [4, 'flower_yellow'],
  [5, 'flower_white'],
  [6, 'bush'],
  [7, 'mushroom'],
  [8, 'rock'],
  [9, 'pebble'],
  [10, 'snow_patch'],
  [11, 'dry_tuft'],
  [12, 'reed'],
  [13, 'lily_pad'],
];

function lib() {
  assert.ok(fs.existsSync(LIB),
    'RED: scripts/lib/json-ref.js не существует (000318.01 в master)');
  return require(LIB);
}

function slugNameOf(data) {
  return path.basename(data.спрайт, '.svg') + '.json';
}

function dataFiles() {
  const mod = lib();
  assert.ok(mod.ASSET_NAME_SHAPES && mod.SHAPE_BASENAME_RES,
    'RED: в lib нет ASSET_NAME_SHAPES/SHAPE_BASENAME_RES (000318.01)');
  const re = mod.SHAPE_BASENAME_RES[mod.ASSET_NAME_SHAPES.visuals];
  assert.ok(re instanceof RegExp,
    "RED: шейп visuals «" + mod.ASSET_NAME_SHAPES.visuals +
    '» без формы в SHAPE_BASENAME_RES');
  // slug-regex матчит и schema.json (прецедент 000318.02) — исключение.
  return fs.readdirSync(VDIR)
    .filter((f) => f !== 'schema.json' && re.test(f))
    .sort();
}

function readJson(f) {
  return JSON.parse(fs.readFileSync(path.join(VDIR, f), 'utf8'));
}

// --- T1: реестр + каталог в slug-форме по контракту ростера ---

test('000318.03 T1: ASSET_NAME_SHAPES.visuals == slug; каталог — ровно 13 <slug>.json из ростера, ни одного numeric, basename == basename(спрайт)', () => {
  const mod = lib();
  assert.equal(mod.ASSET_NAME_SHAPES.visuals, 'slug',
    'RED: шейп visuals ещё «' + mod.ASSET_NAME_SHAPES.visuals +
    '» — реестр 000318.03 не переведён в slug');
  assert.ok(fs.existsSync(VDIR), 'RED: каталог assets/visuals не существует');
  const files = dataFiles();
  assert.equal(files.length, TOTAL_00031803,
    'файлов данных — ровно ' + TOTAL_00031803 + '; факт: ' + files.length);
  const expected = ROSTER_00031803.map(([, slug]) => slug + '.json').sort();
  assert.deepEqual(files, expected,
    'каталожные имена ≡ контрактованному ростеру номер→slug');
  const numeric = fs.readdirSync(VDIR).filter((f) => /^\d{6}\.json$/.test(f));
  assert.deepEqual(numeric, [],
    'numeric-имён (0000NN.json) остаться не должно — все переименованы');
  const byId = new Map();
  for (const f of files) {
    const data = readJson(f);
    assert.ok(Number.isInteger(data.id) && data.id >= 1
      && data.id <= TOTAL_00031803,
      f + ': id — целый 1..' + TOTAL_00031803 + ' (в JSON НЕ меняется); факт: '
      + JSON.stringify(data.id));
    assert.equal(f, slugNameOf(data),
      f + ': basename != basename поля «спрайт» «' + slugNameOf(data) + '»');
    assert.equal(byId.has(data.id), false, 'дубль id=' + data.id);
    byId.set(data.id, f);
  }
  for (const [id, slug] of ROSTER_00031803) {
    assert.equal(byId.get(id), slug + '.json',
      'id ' + id + ' живёт в «' + slug + '.json» (ростер номер→slug)');
  }
});

// --- T2: биекция json ↔ svg (иконки не тронуты) ---

test('000318.03 T2: биекция 13≡13 — имена <slug>.json ≡ имена <slug>.svg (assets/sprites/visuals не тронуты)', () => {
  assert.ok(fs.existsSync(SPR_DIR),
    'RED: каталог иконок assets/sprites/visuals не существует');
  const jsons = dataFiles().map((f) => f.replace(/\.json$/, '.svg')).sort();
  const svgs = fs.readdirSync(SPR_DIR).filter((f) => f.endsWith('.svg')).sort();
  assert.equal(jsons.length, TOTAL_00031803, 'json — ровно 13 (анти-вакуум)');
  assert.deepEqual(svgs, jsons,
    'иконочный набор ≡ каталожному по basename (rename не трогает иконки)');
});

// --- T3: зеркало — порядок записей бит-в-бит прежний (id 1..13), компаратор наблюдаем ---

test('000318.03 T3: зеркало src/visuals-data.js — id строго 1..13 позиционно, ≡ каталог в id-порядке; lex-порядок slug-имён != id-порядку (страж компаратора)', () => {
  assert.ok(fs.existsSync(MIRROR),
    'RED: зеркало src/visuals-data.js не сгенерировано (sync-visuals-data.js)');
  const mod = require(MIRROR);
  assert.ok(Array.isArray(mod.VISUALS), 'VISUALS — массив');
  assert.equal(mod.VISUALS.length, TOTAL_00031803,
    'VISUALS.length — ровно 13; факт: ' + mod.VISUALS.length);
  const ids = mod.VISUALS.map((v) => v.id);
  assert.deepEqual(ids,
    Array.from({ length: TOTAL_00031803 }, (_, i) => i + 1),
    'порядок id в зеркале — строго 1..13 (прежняя нумерация файлов, '
    + 'порядок после rename сохранён бит-в-бит)');
  const byId = new Map();
  for (const f of dataFiles()) {
    const data = readJson(f);
    byId.set(data.id, data);
  }
  assert.equal(byId.size, TOTAL_00031803, 'id в каталоге уникальны (13)');
  mod.VISUALS.forEach((v, i) => {
    assert.deepEqual(v, byId.get(v.id),
      'позиция ' + i + ': зеркало ≡ JSON (source of truth)');
  });
  // Компаратор наблюдаем именно на slug-именах: если бы sync сортировал по
  // имени файла, записи встали бы в lex-порядке slug (bush=6, dry_tuft=11,
  // …) — это иной порядок, чем id. Страж красит случай «сортировку забыли».
  const lexIds = dataFiles().map((f) => readJson(f).id);
  assert.notDeepEqual(lexIds, ids,
    'lex-порядок файлов обязан ОТЛИЧАТЬСЯ от id-порядка — иначе пин '
    + 'сортировки по id ненаблюдаем (компаратор не проверить на именах)');
});

// --- T4: ref-eligibility и REF_RE от флипа НЕ дрейфуют ---

test('000318.03 T4: visuals вне мишеней ссылок навсегда — isRefPath/isRef false при обоих шейпах; REF_RE.source побайтово прежний', () => {
  const mod = lib();
  assert.ok(!mod.REF_LINKED_CATALOGS.includes('visuals'),
    'visuals не входит в REF_LINKED_CATALOGS (9 мишеней, .01)');
  const saved = mod.ASSET_NAME_SHAPES.visuals;
  for (const shape of ['number', 'slug']) {
    mod.ASSET_NAME_SHAPES.visuals = shape;
    try {
      assert.equal(mod.isRefPath('visuals', 'grass_blades_light.json'), false,
        'visuals при шейпе ' + shape + ': не мишень ссылок (AR2/AR5)');
      assert.equal(mod.isRefPath('visuals', '000001.json'), false,
        'visuals при шейпе ' + shape + ': numeric-имя тоже не ref');
      assert.equal(mod.isRef('assets/visuals/grass_blades_light.json'), false,
        'isRef — false (slug-имя не делает ref)');
      assert.equal(mod.isRefPathFull('assets/visuals/grass_blades_light.json'),
        false);
    } finally {
      mod.ASSET_NAME_SHAPES.visuals = saved;
    }
  }
  assert.equal(mod.ASSET_NAME_SHAPES.visuals, 'slug',
    'шейп restored с сохранённого — после 000318.03 сохранённый «slug»; '
    + 'факт: «' + mod.ASSET_NAME_SHAPES.visuals + '»');
  assert.equal(mod.REF_RE.source,
    '^assets\\/(items|skills|spells|mobs|mob_groups|buildings|craft|'
    + 'dungeons|npc)\\/\\d{6}\\.json$',
    'REF_RE от флипа visuals НЕ меняется (visuals ∉ реф-группы; пин AR11 '
    + 'дублирован страховкой)');
});

// --- T5: золотой порядок видимых носителей (спрайт-пути в id-порядке) ---

test('000318.03 T5: зеркало ≡ golden-последовательности спрайт-путей в прежнем (числовом) порядке — формулы/сиды бит-в-бит', () => {
  assert.ok(fs.existsSync(MIRROR), 'RED: зеркало не сгенерировано');
  const mod = require(MIRROR);
  assert.deepEqual(mod.VISUALS.map((v) => v.спрайт),
    ROSTER_00031803.map(([, slug]) => 'assets/sprites/visuals/' + slug + '.svg'),
    'последовательность спрайт-путей в зеркале — прежний порядок файлов '
    + '000001…000013 (носитель формул tileVisuals: seed от id, выбор/порядок '
    + '— от порядка массива); сдвиг = видимое игроку изменение декора');
});

// --- T6: сортировка sync — СЕМАНТИЧЕСКИ по id (tmp с переставленными именами) ---

test('000318.03 T6: tmp-дерево с ДВУМЯ переставленными именами (slug-имя ≠ содержимое) — выход sync всё равно в id-порядке и ≡ закоммиченному зеркалу', () => {
  assert.ok(fs.existsSync(SYNC), 'RED: scripts/sync-visuals-data.js не существует');
  assert.ok(fs.existsSync(MIRROR), 'RED: зеркало не сгенерировано');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'visuals-00031803-'));
  try {
    fs.mkdirSync(path.join(tmp, 'scripts', 'lib'), { recursive: true });
    fs.mkdirSync(path.join(tmp, 'src'), { recursive: true });
    fs.mkdirSync(path.join(tmp, 'assets', 'visuals'), { recursive: true });
    for (const libFile of ['write-atomic.js', 'json-ref.js']) {
      fs.copyFileSync(path.join(ROOT, 'scripts', 'lib', libFile),
        path.join(tmp, 'scripts', 'lib', libFile));
    }
    fs.copyFileSync(SYNC, path.join(tmp, 'scripts', 'sync-visuals-data.js'));
    // Переставляем содержимое двух файлов под ЧУЖИМИ slug-именами: имена
    // остаются slug-формы, но lex-порядок имён ≠ id-порядку уже для этой
    // пары — сортировка по имени утащила бы запись не на своё место.
    const swap = { 'bush.json': 'dry_tuft.json',
      'dry_tuft.json': 'bush.json' };
    for (const f of dataFiles()) {
      const src = path.join(VDIR, Object.prototype.hasOwnProperty.call(swap, f) ? swap[f] : f);
      fs.copyFileSync(src, path.join(tmp, 'assets', 'visuals', f));
    }
    const run = spawnSync(process.execPath,
      [path.join(tmp, 'scripts', 'sync-visuals-data.js')], { encoding: 'utf8' });
    assert.equal(run.status, 0, 'tmp-запуск exit 0: ' + (run.stderr || run.stdout));
    // Контракт — ПОРЯДОК ЗАПИСЕЙ (носитель формул tileVisuals). Пофайловые
    // комменты «// <file>» в tmp легально отражают tmp-имена (в отличие от
    // runes .02, где зеркало без построчных комментов и сверка байтовая),
    // поэтому сравниваем разобранные массивы.
    const tmpMod = require(path.join(tmp, 'src', 'visuals-data.js'));
    const committedMod = require(MIRROR);
    assert.deepEqual(tmpMod.VISUALS.map((v) => v.id),
      committedMod.VISUALS.map((v) => v.id),
      'порядок id в выходе — прежний: перестановка ИМЕН не меняет его '
      + '(по имени файла — «куст» встал бы на место «сухой травки»)');
    assert.deepEqual(tmpMod.VISUALS, committedMod.VISUALS,
      'записи выхода ≡ закоммиченному зеркалу (сортировка — по data.id)');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// --- T7: sync-исходник — lib + сортировка по id (grep-пины) ---

test('000318.03 T7: scripts/sync-visuals-data.js — фильтр через lib (без своего \\d{6}, со schema-исключением), сортировка по data.id, отказ от «0000NN»', () => {
  assert.ok(fs.existsSync(SYNC), 'RED: scripts/sync-visuals-data.js не существует');
  const src = fs.readFileSync(SYNC, 'utf8');
  assert.ok(src.includes("require('./lib/json-ref.js')"),
    'sync обязан читать форму из ./lib/json-ref.js (реестр .01), а не свой regex');
  assert.ok(!src.includes('\\d{6}'),
    'numeric-литерал фильтра \\d{6} остаться не должен');
  assert.ok(!src.includes('0000NN'),
    'отказ «0000NN.json» — slug-формулировка сообщения обязательна');
  assert.match(src, /visuals\.sort\(\(a, b\) => \(a\.data\.id < b\.data\.id/,
    'сортировка — по data.id (компаратор a.data.id < b.data.id), не по имени файла');
  assert.ok(src.includes("'schema.json'"),
    'slug-regex ловит schema.json (прецедент .02) — явное исключение обязательно');
});

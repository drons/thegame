// Задача 000318.02 (родитель 000318): переименование assets/runes/
// 0000NN.json → <id>.json (55 файлов, git mv R100 контент-0-diff).
// Зависимость 000318.01: шейп per-catalog в scripts/lib/json-ref.js —
// ASSET_NAME_SHAPES.runes = 'slug' (фильтры читают РЕЕСТР, своего regex
// не плодим). Порядок зеркала — ПО ID (носителя прежней нумерации после
// rename нет; решение и цена перепина M6-golden — memory/000318-runes.md).
// Иконки assets/sprites/runes/<id>.svg НЕ тронуты — биекция 55≡55 сохраняется.
// REGRESSION-страж: REF_RE (runes вне REF_LINKED_CATALOGS) от флипа шейпа
// НЕ дрейфует; runes не мишень ссылок при любом шейпе (AR14-минимум).
// kind=node; RED: до rename/T-флипа реестра тесты краснеют ОСМЫСЛЕННО
// (guard + assert.fail-сообщения), не крахом загрузки.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const RUNES_DIR = path.join(ROOT, 'assets', 'runes');
const ICON_DIR = path.join(ROOT, 'assets', 'sprites', 'runes');
const MIRROR = path.join(ROOT, 'src', 'runes-data.js');
const SYNC = path.join(ROOT, 'scripts', 'sync-runes-data.js');
const LIB = path.join(ROOT, 'scripts', 'lib', 'json-ref.js');

const TOTAL_00031802 = 55;

function lib() {
  assert.ok(fs.existsSync(LIB),
    'RED: scripts/lib/json-ref.js не существует (000318.01 в master)');
  return require(LIB);
}

function slugRe() {
  const mod = lib();
  assert.ok(mod.ASSET_NAME_SHAPES && mod.SHAPE_BASENAME_RES,
    'RED: в lib нет ASSET_NAME_SHAPES/SHAPE_BASENAME_RES (000318.01)');
  return mod.SHAPE_BASENAME_RES.slug;
}

function jsonFiles() {
  return fs.readdirSync(RUNES_DIR)
    .filter((f) => f.endsWith('.json') && f !== 'schema.json')
    .sort();
}

// --- T1: каталог в slug-форме, basename == id ---

test('000318.02 T1: ASSET_NAME_SHAPES.runes == slug; каталог — ровно 55 <id>.json, ни одного numeric, basename == id каждого', () => {
  const mod = lib();
  assert.equal(mod.ASSET_NAME_SHAPES.runes, 'slug',
    'RED: шейп runes ещё «' + mod.ASSET_NAME_SHAPES.runes +
    '» — реестр 000318.02 не переведён в slug');
  assert.ok(fs.existsSync(RUNES_DIR), 'RED: каталог assets/runes не существует');
  const files = jsonFiles();
  assert.equal(files.length, TOTAL_00031802,
    'файлов данных — ровно ' + TOTAL_00031802 + '; факт: ' + files.length);
  const re = slugRe();
  const wrong = files.filter((f) => !re.test(f));
  assert.deepEqual(wrong, [], 'файлы вне slug-формы SHAPE_BASENAME_RES.slug');
  const numeric = files.filter((f) => /^\d{6}\.json$/.test(f));
  assert.deepEqual(numeric, [],
    'numeric-имён (0000NN.json) остаться не должно — все переименованы');
  for (const f of files) {
    const data = JSON.parse(fs.readFileSync(path.join(RUNES_DIR, f), 'utf8'));
    assert.equal(f, data.id + '.json',
      f + ': basename != id «' + data.id + '»');
  }
});

// --- T2: биекция json ↔ svg ---

test('000318.02 T2: биекция 55≡55 — имена <id>.json ≡ имена <id>.svg (иконки не тронуты)', () => {
  assert.ok(fs.existsSync(RUNES_DIR), 'RED: каталог assets/runes не существует');
  assert.ok(fs.existsSync(ICON_DIR),
    'RED: каталог иконок assets/sprites/runes не существует');
  const jsons = jsonFiles().map((f) => f.replace(/\.json$/, '.svg')).sort();
  const svgs = fs.readdirSync(ICON_DIR).filter((f) => f.endsWith('.svg')).sort();
  assert.equal(jsons.length, TOTAL_00031802, 'json — ровно 55 (анти-вакуум)');
  assert.deepEqual(svgs, jsons,
    'иконочный набор ≡ каталожный (rename не трогает assets/sprites/runes)');
});

// --- T3: зеркало — порядок по id ---

test('000318.02 T3: зеркало src/runes-data.js — 55 записей, порядок id строго по возрастанию, ≡ каталог в id-порядке', () => {
  assert.ok(fs.existsSync(MIRROR),
    'RED: зеркало src/runes-data.js не сгенерировано (sync-runes-data.js)');
  const mod = require(MIRROR);
  assert.ok(Array.isArray(mod.RUNES), 'RUNES — массив');
  assert.equal(mod.RUNES.length, TOTAL_00031802,
    'RUNES.length — ровно 55; факт: ' + mod.RUNES.length);
  const ids = mod.RUNES.map((r) => r.id);
  for (let i = 1; i < ids.length; i++) {
    assert.ok(ids[i - 1] < ids[i],
      'порядок id строго возрастающий: [' + (i - 1) + '] «' + ids[i - 1] +
      '» ≥ [' + i + '] «' + ids[i] + '» (сортировка sync — по id)');
  }
  const byId = new Map();
  for (const f of jsonFiles()) {
    const data = JSON.parse(fs.readFileSync(path.join(RUNES_DIR, f), 'utf8'));
    byId.set(data.id, data);
  }
  assert.equal(byId.size, TOTAL_00031802, 'id в каталоге уникальны (55)');
  assert.deepEqual(mod.RUNES.map((r) => r.id), [...byId.keys()].sort(),
    'зеркало ≡ каталог в id-порядке');
  mod.RUNES.forEach((r, i) => {
    assert.deepEqual(r, byId.get(r.id), 'позиция ' + i + ': зеркало ≡ JSON');
  });
});

// --- T4: ref-eligibility и REF_RE от флипа НЕ дрейфуют ---

test('000318.02 T4: runes вне мишеней ссылок навсегда — isRefPath/isRef false при slug; REF_RE.source побайтово прежний', () => {
  const mod = lib();
  assert.equal(mod.ASSET_NAME_SHAPES.runes, 'slug',
    'RED: шейп runes не slug (тот же guard, что T1)');
  assert.ok(!mod.REF_LINKED_CATALOGS.includes('runes'),
    'runes не входит в REF_LINKED_CATALOGS (9 мишеней, .01)');
  assert.equal(mod.isRefPath('runes', 'stone_hide.json'), false,
    'slug-шейп НЕ делает runes мишенью');
  assert.equal(mod.isRefPath('runes', '000001.json'), false,
    'numeric-имя в slug-каталоге — тоже не ref');
  assert.equal(mod.isRef('assets/runes/stone_hide.json'), false,
    'isRef — false (AR2/AR5/AR14-минимум)');
  assert.equal(mod.isRefPathFull('assets/runes/stone_hide.json'), false);
  assert.equal(mod.REF_RE.source,
    '^assets\\/(items|skills|buildings|craft|npc)\\/\\d{6}\\.json$'
    + '|^assets\\/(spells|mobs|mob_groups|dungeons)\\/[a-z][a-z0-9_]*\\.json$',
    'REF_RE — ДВЕ группы после 000318.05 (spells/mobs/mob_groups/dungeons —'
    + ' ref-мишени, их флипы в slug меняют source; флипы runes/visuals ∉ '
    + 'ref-группам его НЕ меняли; пин AR11 дублирован страховкой)');
});

// --- T5: сортировка sync — СЕМАНТИЧЕСКИ по id (tmp с переставленными именами) ---

test('000318.02 T5: tmp-дерево с ДВУМЯ переставленными именами (basename != id) — выход sync всё равно в id-порядке и ≡ закоммиченному зеркалу', () => {
  assert.ok(fs.existsSync(SYNC), 'RED: scripts/sync-runes-data.js не существует');
  assert.ok(fs.existsSync(MIRROR), 'RED: зеркало не сгенерировано');
  const committed = fs.readFileSync(MIRROR, 'utf8');
  const tmp = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'runes-00031802-'));
  try {
    const { spawnSync } = require('node:child_process');
    fs.mkdirSync(path.join(tmp, 'scripts', 'lib'), { recursive: true });
    fs.mkdirSync(path.join(tmp, 'src'), { recursive: true });
    fs.mkdirSync(path.join(tmp, 'assets', 'runes'), { recursive: true });
    for (const libFile of ['write-atomic.js', 'json-ref.js']) {
      fs.copyFileSync(path.join(ROOT, 'scripts', 'lib', libFile),
        path.join(tmp, 'scripts', 'lib', libFile));
    }
    fs.copyFileSync(SYNC, path.join(tmp, 'scripts', 'sync-runes-data.js'));
    // Переставляем содержимое двух соседних по имени файлов: имена остаются
    // slug (файловый порядок меняется на ≠ id-порядок только для этой пары),
    // содержимое (id) — под ЧУЖИМИ именами.
    const swapped = new Set(['stone_hide.json', 'wall_plate.json']);
    const swap = { 'stone_hide.json': 'wall_plate.json',
      'wall_plate.json': 'stone_hide.json' };
    for (const f of jsonFiles()) {
      const src = path.join(RUNES_DIR, swapped.has(f) ? swap[f] : f);
      fs.copyFileSync(src, path.join(tmp, 'assets', 'runes', f));
    }
    const run = spawnSync(process.execPath,
      [path.join(tmp, 'scripts', 'sync-runes-data.js')], { encoding: 'utf8' });
    assert.equal(run.status, 0, 'tmp-запуск exit 0: ' + (run.stderr || run.stdout));
    assert.equal(fs.readFileSync(path.join(tmp, 'src', 'runes-data.js'), 'utf8'),
      committed,
      'сортировка — по id: перестановка ИМЕН не меняет выход (по имени файла — '
      + 'каменная плита уехала бы за стену)');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// --- T6: sync-исходник — lib + сортировка по id (grep-пины) ---

test('000318.02 T6: scripts/sync-runes-data.js — фильтр через lib (без своего \\d{6}), сортировка по id, сообщение slug-формулировки', () => {
  assert.ok(fs.existsSync(SYNC), 'RED: scripts/sync-runes-data.js не существует');
  const src = fs.readFileSync(SYNC, 'utf8');
  assert.ok(src.includes("require('./lib/json-ref.js')"),
    'sync обязан читать форму из ./lib/json-ref.js (реестр .01), а не свой regex');
  assert.ok(!src.includes('\\d{6}'),
    'numeric-литерал фильтра \\d{6} остаться не должен');
  assert.ok(!src.includes('0000NN'),
    'отказ «0000NN.json» — slug-формулировка сообщения обязательна');
  assert.match(src, /runes\.sort\(\(a, b\) => \(a\.id < b\.id/,
    'сортировка — по data.id (компаратор a.id < b.id), не по имени файла');
});

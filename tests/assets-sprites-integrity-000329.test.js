// 000329 — свип ссылочной целостности переноса SVG в assets/sprites/*.
// (a) каждая ссылка на спрайт из JSON/кода резолвится в файл;
// (b) каждый файл перенесённых каталогов ссылаем кем-то (литерал,
//     таблица src/sprites.js или префиксная конкатенация).
// Имена старых каталогов собирается в регулярки динамически, чтобы
// собственный текст файла не попадал в скан устаревших путей.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SP = require(path.join(ROOT, 'src', 'sprites.js'));
const SELF = 'assets-sprites-integrity-000329.test.js';

const OLD_DIRS = [
  ['building-icons'],
  ['city', 'walls'],
  ['combat'],
  ['dungeon'],
  ['school-icons'],
  ['spell-icons'],
  ['tiles'],
  ['ui'],
];
const REMOVED_DIRS = [
  'building-icons', 'city', 'combat', 'dungeon',
  'school-icons', 'spell-icons', 'tiles', 'ui',
];
const OLD_JOIN_SEGS = [
  'building-icons', 'city', 'combat', 'dungeon',
  'school-icons', 'spell-icons', 'tiles', 'ui',
];

const NEW_LEAVES = [
  'sprites/building',
  'sprites/city/walls',
  'sprites/combat/bg',
  'sprites/combat/obstacles',
  'sprites/dungeon',
  'sprites/dungeon/floor',
  'sprites/dungeon/walls',
  'sprites/portraits',
  'sprites/skills',
  'sprites/spells',
  'sprites/tiles',
  'sprites/ui',
];

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function dirSvg(absDir) {
  if (!fs.existsSync(absDir)) return null;
  return fs.readdirSync(absDir)
    .filter((f) => f.endsWith('.svg'))
    .sort();
}

function walkFiles(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkFiles(p, out);
    else out.push(p);
  }
  return out;
}

const REPO_FILES = [
  ...walkFiles(path.join(ROOT, 'src'), []),
  ...walkFiles(path.join(ROOT, 'tests'), []),
  ...walkFiles(path.join(ROOT, 'scripts'), []),
  ...walkFiles(path.join(ROOT, 'spec'), []),
  path.join(ROOT, 'index.html'),
  ...walkFiles(path.join(ROOT, 'assets'), [])
    .filter((f) => f.endsWith('.json')),
];

const TEXT_SCAN = REPO_FILES.filter((f) => {
  const b = path.basename(f);
  if (b === SELF) return false;
  return /\.(js|md|html|json)$/.test(b);
});

const CONSUMER_FILES = REPO_FILES.filter((f) => {
  const b = path.basename(f);
  const rel = path.relative(ROOT, f);
  if (b === SELF) return false;
  if (rel === 'index.html') return true;
  if (rel.startsWith('src' + path.sep) && b.endsWith('.js')) return true;
  if (rel.startsWith('scripts' + path.sep) && b.endsWith('.js')) return true;
  if (rel.startsWith('assets' + path.sep) && b.endsWith('.json')) return true;
  return false;
});

const CORPUS = CONSUMER_FILES
  .map((f) => fs.readFileSync(f, 'utf8'))
  .join('\n');

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
}

function jsonsIn(dirRel) {
  return fs.readdirSync(path.join(ROOT, dirRel))
    .filter((f) => f.endsWith('.json') && f !== 'schema.json')
    .sort();
}

test('000329 T1: старые каталоги переноса удалены; assets/portraits — JSON остались, SVG нет (защита от половинчатого переноса)', () => {
  const alive = REMOVED_DIRS.filter((d) => fs.existsSync(path.join(ROOT, 'assets', d)));
  assert.deepEqual(alive, [],
    'старые каталог(и) ещё существуют: ' + alive.join(', '));
  const pAbs = path.join(ROOT, 'assets', 'portraits');
  assert.ok(fs.existsSync(pAbs), 'assets/portraits/ обязан остаться (JSON-каталог 000142)');
  const svgs = fs.readdirSync(pAbs).filter((f) => f.endsWith('.svg'));
  assert.deepEqual(svgs, [],
    'в assets/portraits/ не должно быть SVG — они в assets/sprites/portraits/');
  assert.ok(fs.existsSync(path.join(ROOT, 'assets', 'dungeons')),
    'assets/dungeons (JSON-каталог типов) — не переносится, обязан быть на месте');
});

test('000329 T2: содержимое новых каталогов ≡ выводу из данных (JSON-каталоги и таблицы src/sprites.js), без лишних и без потерь', () => {
  const expected = {};
  expected['sprites/building'] =
    jsonsIn('assets/buildings')
      .map((f) => readJson('assets/buildings/' + f))
      .filter((b) => typeof b.icon === 'string' &&
        b.icon.startsWith('assets/sprites/building/'))
      .map((b) => path.basename(b.icon));
  expected['sprites/skills'] =
    jsonsIn('assets/skills')
      .map((s) => readJson('assets/skills/' + s))
      .filter((s) => typeof s.icon === 'string')
      .map((s) => path.basename(s.icon));
  expected['sprites/spells'] =
    jsonsIn('assets/spells')
      .map((s) => readJson('assets/spells/' + s))
      .map((s) => path.basename(s.icon));
  expected['sprites/portraits'] =
    jsonsIn('assets/portraits')
      .map((p) => readJson('assets/portraits/' + p))
      .map((p) => p.icon);
  expected['sprites/tiles'] = [
    ...new Set([
      ...Object.values(SP.TILE_FRAMES).flat(),
      ...Object.values(SP.TILE_VARIANTS).flat(),
    ].map((p) => path.basename(p))),
  ];
  expected['sprites/combat/bg'] = [
    ...Object.values(SP.COMBAT_BG_TERRAIN).map((n) => n + '.svg'),
    ...Object.values(SP.COMBAT_BG_DUNGEON).map((n) => n + '.svg'),
    path.basename(SP.COMBAT_BG_FALLBACK),
  ];
  expected['sprites/combat/obstacles'] =
    SP.OBSTACLE_SPRITES.map((p) => path.basename(p));
  expected['sprites/dungeon'] = [
    path.basename(SP.DUNGEON_CHEST),
    ...Object.values(SP.DUNGEON_PORTAL).map((p) => path.basename(p)),
    ...Object.values(SP.DUNGEON_DEPOSIT).map((p) => path.basename(p)),
  ];
  expected['sprites/dungeon/floor'] =
    Object.values(SP.DUNGEON_FLOOR_FRAMES).flat().map((p) => path.basename(p));
  expected['sprites/dungeon/walls'] =
    SP.WALL_AUTOTILE_NAMES.flatMap((n) => ['rock_', 'column_', 'stalactite_']
      .map((k) => k + n + '.svg'));
  expected['sprites/city/walls'] =
    SP.WALL_AUTOTILE_NAMES.map((n) => 'city_' + n + '.svg');

  for (const leaf of NEW_LEAVES) {
    const onDisk = dirSvg(path.join(ROOT, 'assets', leaf));
    assert.notEqual(onDisk, null,
      'каталог assets/' + leaf + ' отсутствует — перенос не завершён');
    if (!expected[leaf]) continue;
    assert.deepEqual([...onDisk].sort(), [...expected[leaf]].sort(),
      'assets/' + leaf + ': набор файлов ≠ выводу из данных/таблиц');
  }
  const uiDisk = dirSvg(path.join(ROOT, 'assets', 'sprites', 'ui'));
  assert.notEqual(uiDisk, null);
  assert.ok(uiDisk.length > 0, 'assets/sprites/ui пуст');
});

test('000329 T3: ни одного устаревшего пути перенесённых каталогов в тексте репозитория; каждая спрайт-ссылка данных/кода резолвится в файл', () => {
  const stale = [];
  const needles = [];
  for (const segs of OLD_DIRS) {
    needles.push(new RegExp('assets/' + segs.map(esc).join('/') + '\\b', 'g'));
  }
  for (const seg of OLD_JOIN_SEGS) {
    needles.push(new RegExp("'assets'\\s*,\\s*'" + esc(seg) + "'", 'g'));
  }
  for (const f of TEXT_SCAN) {
    const text = fs.readFileSync(f, 'utf8');
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      for (const re of needles) {
        re.lastIndex = 0;
        if (re.test(lines[i])) {
          stale.push(path.relative(ROOT, f) + ':' + (i + 1) + ': ' +
            lines[i].trim().slice(0, 100));
        }
      }
    }
  }
  assert.deepEqual(stale, [], 'устаревшие ссылки на перенесённые каталоги:\n' +
    stale.slice(0, 40).join('\n') +
    (stale.length > 40 ? '\n… всего ' + stale.length : ''));

  const broken = [];
  const check = (srcDesc, relPath) => {
    if (!fs.existsSync(path.join(ROOT, relPath))) {
      broken.push(srcDesc + ' → ' + relPath);
    }
  };
  for (const rel of ['assets/spells', 'assets/buildings', 'assets/skills']) {
    for (const f of jsonsIn(rel)) {
      const data = readJson(rel + '/' + f);
      if (typeof data.icon === 'string' && data.icon.startsWith('assets/')) {
        check(rel + '/' + f, data.icon);
      }
    }
  }
  for (const f of jsonsIn('assets/portraits')) {
    const data = readJson('assets/portraits/' + f);
    check('assets/portraits/' + f,
      'assets/sprites/portraits/' + data.icon);
  }
  const pathRe = /assets\/sprites\/[\w./-]+\.svg/g;
  for (const f of CONSUMER_FILES) {
    const rel = path.relative(ROOT, f);
    const text = fs.readFileSync(f, 'utf8');
    for (const m of text.matchAll(pathRe)) check(rel, m[0]);
  }
  assert.deepEqual(broken, [], 'ссылки на несуществующие файлы:\n' +
    broken.join('\n'));
});

test('000329 T4: каждый файл новых каталогов ссылаем (литерал в код-корпусе, таблица src/sprites.js или префиксная конкатенация); исключений нет', () => {
  const corpusLower = CORPUS.toLowerCase();
  const wallSet = new Set(Object.values(SP.WALL_AUTOTILES).flat()
    .map((p) => path.basename(p)));
  const floorSet = new Set(Object.values(SP.DUNGEON_FLOOR_FRAMES).flat()
    .map((p) => path.basename(p)));
  const bgSet = new Set([
    ...Object.values(SP.COMBAT_BG_TERRAIN).map((n) => n + '.svg'),
    ...Object.values(SP.COMBAT_BG_DUNGEON).map((n) => n + '.svg'),
    path.basename(SP.COMBAT_BG_FALLBACK),
  ]);
  const obstSet = new Set(SP.OBSTACLE_SPRITES.map((p) => path.basename(p)));
  const dungeonSet = new Set([
    path.basename(SP.DUNGEON_CHEST),
    ...Object.values(SP.DUNGEON_PORTAL).map((p) => path.basename(p)),
    ...Object.values(SP.DUNGEON_DEPOSIT).map((p) => path.basename(p)),
  ]);
  const tileSet = new Set([...Object.values(SP.TILE_FRAMES).flat(),
    ...Object.values(SP.TILE_VARIANTS).flat()].map((p) => path.basename(p)));

  const orphan = [];
  for (const leaf of NEW_LEAVES) {
    const files = dirSvg(path.join(ROOT, 'assets', leaf));
    if (!files) {
      orphan.push(leaf + ': каталог отсутствует');
      continue;
    }
    for (const f of files) {
      let hit;
      if (leaf === 'sprites/dungeon/walls' || leaf === 'sprites/city/walls') {
        hit = wallSet.has(f);
      } else if (leaf === 'sprites/dungeon/floor') {
        hit = floorSet.has(f);
      } else if (leaf === 'sprites/combat/bg') {
        hit = bgSet.has(f);
      } else if (leaf === 'sprites/combat/obstacles') {
        hit = obstSet.has(f);
      } else if (leaf === 'sprites/dungeon') {
        hit = dungeonSet.has(f);
      } else if (leaf === 'sprites/tiles') {
        hit = tileSet.has(f);
      } else if (leaf === 'sprites/ui' && f.startsWith('combat_')) {
        hit = corpusLower.includes(f.toLowerCase()) ||
          (corpusLower.includes("'assets/sprites/ui/combat_'") &&
            corpusLower.includes(f.slice('combat_'.length, -'.svg'.length)));
      } else {
        hit = CORPUS.includes(f);
      }
      if (!hit) orphan.push('assets/' + leaf + '/' + f);
    }
  }
  assert.deepEqual(orphan, [],
    'никогда не ссылаемые SVG в новых каталогах:\n' + orphan.join('\n'));
});

test('000329 T5: схема spells — паттерн icon принимает assets/sprites/spells/ и НЕ принимает старый каталог', () => {
  const pattern = readJson('assets/spells/schema.json')
    .properties.icon.pattern;
  const re = new RegExp(pattern);
  assert.ok(re.test('assets/sprites/spells/fireball.svg'),
    'новая форма assets/sprites/spells/<id>.svg обязана проходить схему');
  assert.ok(!re.test('assets/' + 'spell-icons' + '/fireball.svg'),
    'старая форма не должна проходить схему');
  for (const f of jsonsIn('assets/spells')) {
    const icon = readJson('assets/spells/' + f).icon;
    assert.ok(re.test(icon), f + ': icon «' + icon + '» не проходит схему');
  }
});

test('000329 T6: схема buildings — union-паттерн icon принимает sprites/building (ед.ч.) и sprites/buildings|cities, НЕ принимает старый каталог', () => {
  const pattern = readJson('assets/buildings/schema.json')
    .properties.icon.pattern;
  const re = new RegExp(pattern);
  assert.ok(re.test('assets/sprites/building/000006.svg'),
    'assets/sprites/building/<NNNNNN>.svg обязан проходить union');
  assert.ok(re.test('assets/sprites/buildings/blacksmith.svg'),
    'sprites/buildings не должен ломаться');
  assert.ok(re.test('assets/sprites/cities/city.svg'),
    'sprites/cities не должен ломаться');
  assert.ok(!re.test('assets/' + 'building-icons' + '/000006.svg'),
    'старая форма не должна проходить схему');
  for (const f of jsonsIn('assets/buildings')) {
    const b = readJson('assets/buildings/' + f);
    if (typeof b.icon === 'string') {
      assert.ok(re.test(b.icon), f + ': icon «' + b.icon + '» не проходит схему');
    }
  }
});

test('000329 T7: консюмеры портретов префиксуют assets/sprites/portraits/; sync-portraits проверяет иконки там же; JSON-каталог остаётся assets/portraits', () => {
  const consumers = ['src/ui.js', 'src/building-ui.js', 'src/ui-tab-skills.js'];
  for (const rel of consumers) {
    const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    assert.ok(text.includes("'assets/sprites/portraits/' + p.icon"),
      rel + ': потребитель не использует префикс assets/sprites/portraits/');
    assert.ok(!text.includes("'assets/portraits/'"),
      rel + ': остался старый префикс assets/portraits/ у img.src');
  }
  const sync = fs.readFileSync(path.join(ROOT, 'scripts', 'sync-portraits.js'), 'utf8');
  assert.ok(sync.includes("'assets', 'sprites', 'portraits'") ||
    sync.includes('assets/sprites/portraits'),
    'sync-portraits.js не знает про assets/sprites/portraits (проверка иконок)');
  assert.ok(!/icon assets\/portraits\//.test(sync),
    'sync-portraits.js ищет иконки по старому пути');
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const D = require('../src/dungeon.js');
const M = require('../src/map.js');
const { createCharacter } = require('../src/player.js');

const PX = M.syntheticPixels(8, 8, 128, 128, 128, 255);

function heroAt(xp, level = 1) {
  const c = createCharacter();
  c.totalXp = xp;
  c.level = level;
  return c;
}

function floorSet(d) {
  const s = new Set();
  for (let y = 0; y < d.height; y++) {
    for (let x = 0; x < d.width; x++) {
      if (d.cells[y * d.width + x] === D.CELL_FLOOR) s.add(x + ',' + y);
    }
  }
  return s;
}

test('детерминированность: одна и та же точка входа — тот же лабиринт', () => {
  const a = D.createDungeon(37, -12, PX, M.TERRAIN.GRASS);
  const b = D.createDungeon(37, -12, PX, M.TERRAIN.GRASS);
  assert.equal(a.seed, b.seed);
  assert.deepEqual(a.cells, b.cells);
  assert.deepEqual(a.rooms, b.rooms);
  assert.deepEqual(a.exit, b.exit);
  assert.deepEqual(a.entrance, b.entrance);
});

test('другие координаты — другая форма', () => {
  const a = D.createDungeon(37, -12, PX, M.TERRAIN.GRASS);
  const b = D.createDungeon(38, -12, PX, M.TERRAIN.GRASS);
  assert.notEqual(a.seed, b.seed);
  assert.notDeepEqual(a.cells, b.cells);
});

test('форма зависит от пикселя map.png в точке входа', () => {
  const p1 = M.syntheticPixels(8, 8, 128, 128, 128, 255);
  const p2 = M.syntheticPixels(8, 8, 128, 128, 128, 254); // другой альфа-канал
  const a = D.createDungeon(37, -12, p1, M.TERRAIN.GRASS);
  const b = D.createDungeon(37, -12, p2, M.TERRAIN.GRASS);
  assert.notEqual(a.seed, b.seed);
  assert.notDeepEqual(a.cells, b.cells);
});

test('размер лабиринта зависит от типа', () => {
  for (const [terrain, alpha, type] of [
    [M.TERRAIN.GRASS, 255, D.DUNGEON_TYPES.CAVE],
    [M.TERRAIN.SWAMP, 255, D.DUNGEON_TYPES.DROWNED],
    [M.TERRAIN.FOREST, 255, D.DUNGEON_TYPES.CRYPT],
    [M.TERRAIN.HILL, 255, D.DUNGEON_TYPES.RUINS],
    [M.TERRAIN.HILL, 10, D.DUNGEON_TYPES.ABYSS],
  ]) {
    const px = M.syntheticPixels(8, 8, 128, 128, 128, alpha);
    const d = D.createDungeon(5, 5, px, terrain);
    assert.equal(d.type, type);
    assert.equal(d.width, D.DUNGEON_SIZE[type]);
    assert.equal(d.height, D.DUNGEON_SIZE[type]);
  }
});

test('типы подземелий из местности и альфы пикселя', () => {
  assert.equal(D.dungeonTypeFor(M.TERRAIN.SAND, 255), D.DUNGEON_TYPES.CAVE);
  assert.equal(D.dungeonTypeFor(M.TERRAIN.GRASS, 255), D.DUNGEON_TYPES.CAVE);
  assert.equal(D.dungeonTypeFor(M.TERRAIN.SWAMP, 255), D.DUNGEON_TYPES.DROWNED);
  assert.equal(D.dungeonTypeFor(M.TERRAIN.FOREST, 255), D.DUNGEON_TYPES.CRYPT);
  assert.equal(D.dungeonTypeFor(M.TERRAIN.HILL, 255), D.DUNGEON_TYPES.RUINS);
  assert.equal(D.dungeonTypeFor(M.TERRAIN.MOUNTAIN, 255), D.DUNGEON_TYPES.RUINS);
  assert.equal(D.dungeonTypeFor(M.TERRAIN.HILL, 63), D.DUNGEON_TYPES.ABYSS);
  assert.equal(D.dungeonTypeFor(M.TERRAIN.MOUNTAIN, 63), D.DUNGEON_TYPES.ABYSS);
});

test('все напольные клетки достижимы от входа (включая выход)', () => {
  for (const [x, y] of [[37, -12], [0, 0], [-7, 21], [100, 40]]) {
    const d = D.createDungeon(x, y, PX, M.TERRAIN.GRASS);
    const reach = D.reachableFrom(d, d.entrance.x, d.entrance.y);
    const floor = floorSet(d);
    assert.deepEqual(reach, floor, 'не все клетки достижимы');
    assert.ok(reach.has(d.exit.x + ',' + d.exit.y), 'выход недостижим');
  }
});

test('содержимое сидируется опытом персонажа (totalXp)', () => {
  const d = D.createDungeon(9, 9, PX, M.TERRAIN.GRASS);
  const a = D.generateDungeonContents(d, heroAt(1000));
  const b = D.generateDungeonContents(D.createDungeon(9, 9, PX, M.TERRAIN.GRASS), heroAt(1000));
  assert.equal(a.seed, b.seed);
  assert.deepEqual(a.mobs, b.mobs);
  assert.deepEqual(a.chests, b.chests);

  const c = D.generateDungeonContents(d, heroAt(1001));
  assert.notEqual(a.seed, c.seed);
  const snap = (k) => JSON.stringify({ m: k.mobs, ch: k.chests });
  assert.notEqual(snap(a), snap(c));
});

test('уровни мобов = уровень персонажа ± 3 (не ниже 1)', () => {
  const d = D.createDungeon(9, 9, PX, M.TERRAIN.GRASS);
  for (const lvl of [1, 5, 20]) {
    const c = D.generateDungeonContents(d, heroAt(500 * lvl, lvl));
    for (const m of c.mobs) {
      assert.ok(m.level >= 1, 'уровень ниже 1');
      assert.ok(m.level <= lvl + D.LEVEL_DELTA_MAX, 'выше потолка');
      assert.ok(Math.abs(m.level - lvl) <= D.LEVEL_DELTA_MAX || m.level === 1, 'дальше чем ±3');
    }
    assert.ok(c.mobs.length >= 3 && c.mobs.length <= 6, 'мало групп');
    assert.ok(c.chests.length >= 2 && c.chests.length <= 5, 'мало сундуков');
  }
});

test('безопасная зона у входа и выхода: там нет мобов', () => {
  const d = D.createDungeon(9, 9, PX, M.TERRAIN.GRASS);
  const c = D.generateDungeonContents(d, heroAt(800));
  for (const m of c.mobs) {
    const nearEntrance = Math.abs(m.x - d.entrance.x) <= 2 && Math.abs(m.y - d.entrance.y) <= 2;
    const nearExit = Math.abs(m.x - d.exit.x) <= 2 && Math.abs(m.y - d.exit.y) <= 2;
    assert.ok(!nearEntrance && !nearExit, 'моб в безопасной зоне');
  }
});

test('бездна: босс в дальней комнате', () => {
  const px = M.syntheticPixels(8, 8, 40, 40, 40, 10); // тёмная альфа → ABYSS
  const d = D.createDungeon(11, 3, px, M.TERRAIN.MOUNTAIN);
  assert.equal(d.type, D.DUNGEON_TYPES.ABYSS);
  const c = D.generateDungeonContents(d, heroAt(2000, 10));
  const boss = c.mobs.find((m) => m.boss);
  assert.ok(boss, 'в бездне нет босса');
  const far = d.rooms[d.rooms.length - 1];
  assert.equal(boss.x, far.cx);
  assert.equal(boss.y, far.cy);
  assert.equal(boss.level, Math.max(1, 10 + D.LEVEL_DELTA_MAX));
});

test('содержимое живёт dungeon_memory_days дней', () => {
  assert.ok(D.contentValid(1, 1 + D.DUNGEON_MEMORY_DAYS));
  assert.ok(!D.contentValid(1, 1 + D.DUNGEON_MEMORY_DAYS + 1));
  assert.ok(D.contentValid(10, 10));
});

test('DUNGEON_MOBS: все id мобов описаны в каталоге (assets/mobs)', () => {
  const C = require('../src/combat.js');
  for (const [name, type] of Object.entries(D.DUNGEON_TYPES)) {
    for (const id of D.DUNGEON_MOBS[type]) {
      assert.ok(C.MOB_TYPES[id], `подземелье ${name}: нет описания моба ${id}`);
    }
  }
});

test('сундуки: в каждом типе подземелья есть книга/свиток с опытом навыка', () => {
  const I = require('../src/items.js');
  for (const [name, type] of Object.entries(D.DUNGEON_TYPES)) {
    const books = D.DUNGEON_ITEMS[type].filter(
      (id) => I.getItem(id) && I.getItem(id).kind === 'skill_book');
    assert.ok(books.length >= 1,
      `в «${D.DUNGEON_NAMES[type]}» (${name}) нет книг с опытом навыка`);
    for (const id of books) {
      assert.equal(I.getItem(id).effect.kind, 'skill_xp', id);
    }
  }
});

test('сундук открывается один раз', () => {
  const d = D.createDungeon(9, 9, PX, M.TERRAIN.GRASS);
  const c = D.generateDungeonContents(d, heroAt(700));
  const ch = c.chests[0];
  const r1 = D.openChest(c, ch.id);
  assert.ok(r1.ok);
  assert.equal(r1.gold, ch.gold);
  const r2 = D.openChest(c, ch.id);
  assert.equal(r2.ok, false);
  assert.equal(D.openChest(c, 'нет').ok, false);
});

test('мобы блуждают: только по полу, без наложений, детерминированно', () => {
  const d = D.createDungeon(9, 9, PX, M.TERRAIN.GRASS);
  const mk = () => D.generateDungeonContents(D.createDungeon(9, 9, PX, M.TERRAIN.GRASS), heroAt(900));
  const a = mk();
  const b = mk();
  for (let i = 0; i < 30; i++) {
    D.wanderStep(a, d);
    D.wanderStep(b, d);
    // Детерминизм по номеру шага.
    assert.deepEqual(a.mobs.map((m) => [m.x, m.y]), b.mobs.map((m) => [m.x, m.y]));
    // Только на полу, без двух групп на одной клетке.
    const seen = new Set();
    for (const m of a.mobs) {
      if (m.defeated) continue;
      assert.equal(d.cells[m.y * d.width + m.x], D.CELL_FLOOR, 'моб в стене');
      assert.ok(!seen.has(m.x + ',' + m.y), 'две группы на одной клетке');
      seen.add(m.x + ',' + m.y);
    }
  }
});

test('побеждённая группа не двигается', () => {
  const d = D.createDungeon(9, 9, PX, M.TERRAIN.GRASS);
  const c = D.generateDungeonContents(d, heroAt(900));
  const m = c.mobs[0];
  m.defeated = true;
  const [x, y] = [m.x, m.y];
  for (let i = 0; i < 10; i++) D.wanderStep(c, d);
  assert.equal(m.x, x);
  assert.equal(m.y, y);
});

// --- Задача 000058: каталог assets/dungeons (source of truth) ---
//
// Фиксированное решение (противоречие в тексте задачи «id 1..5 = номер
// файла (и значения DUNGEON_TYPES)» разрезано в пользу собственного
// ограничения «перенумерации НЕТ»): DUNGEON_TYPES = 0..4, фон боя
// assets/combat/bg выбирается именно по этим числам (000049), а
// нумерация файлов каталога в проекте — с 000001 (тест assets-schemas).
// Поэтому файл 0000NN.json хранит id NN−1 (0..4), МНОЖЕСТВО id по
// файлам = ровно {0..4} (уникальность схемой не выразима — проверяется
// здесь и в sync-скрипте). `название` — ТОЧНО из DUNGEON_NAMES,
// кодовый регистр (строчный): строки HUD/логов не меняются.
// `постройка` — id пещеры 31..35 из assets/buildings (связь
// однонаправленная: dungeons → buildings, buildings не меняется).
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..');
const DDIR = path.join(ROOT, 'assets', 'dungeons');

function loadDungeonCatalog() {
  const files = fs.readdirSync(DDIR)
    .filter((f) => /^\d{6}\.json$/.test(f))
    .sort();
  return files.map((f) => ({
    file: f,
    data: JSON.parse(fs.readFileSync(path.join(DDIR, f), 'utf8')),
  }));
}

test('DUNGEON_NAMES — кодовый регистр (строки HUD/логов), 1:1', () => {
  assert.deepEqual(D.DUNGEON_NAMES, {
    0: 'простая пещера',
    1: 'склеп',
    2: 'руины замка',
    3: 'затопленная пещера',
    4: 'бездна',
  });
});

test('golden: детерминизм — закреплённые значения ДО переноса данных в каталог', () => {
  // Снято с рабочего кода ДО изменений (задача 000058): перенос таблиц
  // в каталог обязан быть byte-for-byte 1:1 — генерация не меняется.
  // CAVE, фикс. вход (37, −12), трава, светлый пиксель.
  const d = D.createDungeon(37, -12, PX, M.TERRAIN.GRASS);
  assert.equal(d.type, 0, 'CAVE');
  assert.equal(d.seed, 2658571374);
  assert.equal(d.width, 25);
  assert.equal(d.height, 25);
  assert.deepEqual(d.rooms, [
    { x: 15, y: 10, w: 7, h: 9, cx: 18, cy: 14 },
    { x: 2, y: 10, w: 5, h: 8, cx: 4, cy: 14 },
    { x: 6, y: 6, w: 7, h: 8, cx: 9, cy: 10 },
    { x: 8, y: 10, w: 7, h: 5, cx: 11, cy: 12 },
    { x: 15, y: 2, w: 6, h: 7, cx: 18, cy: 5 },
  ]);
  assert.deepEqual(d.entrance, { x: 18, y: 14 });
  assert.deepEqual(d.exit, { x: 18, y: 5 });
  assert.equal(
    d.cells.join(''),
    '00000000000000000000000000000000000000000000000000' +
    '00000000000000011111100000000000000000001111110000' +
    '00000000000000011111100000000000000011111111110000' +
    '00000011111110011111100000000001111111001111110000' +
    '00000011111110011111100000000001111111000000000000' +
    '00111111111111111111110000011111111111111111111000' +
    '00111111111111111111110000011111111111111111111000' +
    '00111111111111111111110000011111000000001111111000' +
    '00111110000000011111110000011111000000001111111000' +
    '00000000000000011111110000000000000000000000000000' +
    '00000000000000000000000000000000000000000000000000' +
    '00000000000000000000000000000000000000000000000000' +
    '0000000000000000000000000');
  // ABYSS с боссом: горный тёмный вход (11, 3), totalXp = 2000, level 10.
  const px = M.syntheticPixels(8, 8, 40, 40, 40, 10);
  const d2 = D.createDungeon(11, 3, px, M.TERRAIN.MOUNTAIN);
  assert.equal(d2.type, 4, 'ABYSS');
  assert.equal(d2.seed, 2941640529);
  assert.equal(d2.width, 35);
  const c2 = D.generateDungeonContents(d2, heroAt(2000, 10));
  assert.equal(c2.seed, 3935780563);
  assert.deepEqual(c2.mobs, [
    { id: 'g0', mobIds: ['lower_demon', 'lower_demon'], x: 7, y: 5, level: 12, defeated: false },
    { id: 'g1', mobIds: ['lower_demon', 'succubus', 'lower_demon'], x: 8, y: 6, level: 7, defeated: false },
    { id: 'g2', mobIds: ['abomination', 'succubus'], x: 16, y: 10, level: 7, defeated: false },
    { id: 'boss', mobIds: ['abomination', 'lower_demon', 'lower_demon'], x: 14, y: 6, level: 13, defeated: false, boss: true },
  ]);
  assert.deepEqual(c2.chests, [
    { id: 'c0', x: 15, y: 12, opened: false, gold: 63, item: null },
    { id: 'c1', x: 14, y: 9, opened: false, gold: 58, item: 'phoenix_feather' },
  ]);
});

test('assets/dungeons: ровно 000001..000005.json + schema.json, id = номер файла − 1, множество id = {0..4}', () => {
  const dir = fs.readdirSync(DDIR).sort();
  for (const f of dir) {
    assert.ok(/^\d{6}\.json$/.test(f) || f === 'schema.json',
      `чужой файл в каталоге dungeons: ${f}`);
  }
  assert.ok(fs.existsSync(path.join(DDIR, 'schema.json')),
    'нет assets/dungeons/schema.json');
  const files = dir.filter((f) => /^\d{6}\.json$/.test(f));
  assert.deepEqual(files, [
    '000001.json', '000002.json', '000003.json', '000004.json', '000005.json',
  ], 'в каталоге ровно 5 файлов подряд 000001..000005');
  // Файл 0000NN.json хранит id NN−1 (значения DUNGEON_TYPES, перенумерации
  // НЕТ — фон боя по ним, 000049).
  const ids = files.map((f) => {
    const data = JSON.parse(fs.readFileSync(path.join(DDIR, f), 'utf8'));
    const n = parseInt(f, 10);
    assert.equal(data.id, n - 1, `${f}: id ≠ номер файла − 1 (ожидалось ${n - 1})`);
    return data.id;
  });
  // Уникальность (схемой не выразима): множество id — ровно {0..4}.
  assert.deepEqual(ids.slice().sort((a, b) => a - b), [0, 1, 2, 3, 4],
    'множество id каталога ≠ {0..4}');
});

test('зеркало src/dungeons-data.js ≡ JSON-файлы каталога (deepEqual)', () => {
  const DD = require('../src/dungeons-data.js');
  const cat = loadDungeonCatalog();
  assert.equal(DD.DUNGEONS.length, 5, 'DUNGEONS — 5 записей в порядке файлов');
  cat.forEach(({ file, data }, i) => {
    assert.deepEqual(DD.DUNGEONS[i], data, `DUNGEONS[${i}] ≠ ${file}`);
  });
  assert.deepEqual(
    Object.keys(DD.DUNGEONS_BY_ID).sort(), ['0', '1', '2', '3', '4'],
    'DUNGEONS_BY_ID — индекс по id 0..4');
  for (const d of DD.DUNGEONS) {
    assert.deepEqual(DD.DUNGEONS_BY_ID[d.id], d, `DUNGEONS_BY_ID[${d.id}]`);
  }
});

test('таблицы dungeon.js (node-ветка) выведены из каталога: 1:1', () => {
  const cat = loadDungeonCatalog();
  for (const { file, data } of cat) {
    const t = data.id;
    assert.equal(D.DUNGEON_NAMES[t], data.название, `DUNGEON_NAMES[${t}] (${file})`);
    assert.deepEqual(D.DUNGEON_MOBS[t], data.мобы, `DUNGEON_MOBS[${t}] (${file})`);
    assert.deepEqual(D.DUNGEON_ITEMS[t], data.предметы, `DUNGEON_ITEMS[${t}] (${file})`);
    assert.equal(D.DUNGEON_SIZE[t], data.размер, `DUNGEON_SIZE[${t}] (${file})`);
  }
  // DUNGEON_TYPES — без изменений (перенумерации нет, 000049).
  assert.deepEqual(D.DUNGEON_TYPES, {
    CAVE: 0, CRYPT: 1, RUINS: 2, DROWNED: 3, ABYSS: 4,
  });
});

test('связь постройка: подземелье ↔ пещера 31..35 биективно, названия совпадают (без учёта регистра)', () => {
  const cat = loadDungeonCatalog();
  const bdir = path.join(ROOT, 'assets', 'buildings');
  const byId = {};
  for (const f of fs.readdirSync(bdir).filter((f) => /^\d{6}\.json$/.test(f))) {
    const b = JSON.parse(fs.readFileSync(path.join(bdir, f), 'utf8'));
    byId[b.id] = b;
  }
  const targets = [];
  for (const { file, data } of cat) {
    const b = byId[data.постройка];
    assert.ok(b, `подземелье ${file}: постройки ${data.постройка} нет в assets/buildings`);
    assert.ok(b.id >= 31 && b.id <= 35,
      `подземелье ${file}: постройка ${b.id} не из пещер 31..35`);
    assert.equal(b.категория, 'пещера',
      `подземелье ${file}: постройка ${b.id} не категории «пещера»`);
    // Каталог построек — заглавная, dungeons — строчная (кодовый регистр).
    assert.equal(b.название.toLowerCase(), data.название,
      `подземелье ${file} ↔ постройка ${b.id}: «${b.название}» ≠ «${data.название}»`);
    targets.push(b.id);
  }
  // Биекция: каждая из пещер 31..35 указана ровно одним подземельем.
  assert.deepEqual(targets.slice().sort((a, b) => a - b), [31, 32, 33, 34, 35],
    'множество постройок ≠ 31..35 (связь не биективна)');
});

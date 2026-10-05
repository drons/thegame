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

test('ссылки: ВСЕ предметы подземелий существуют в assets/items (требование задачи)', () => {
  // Существующий тест «сундуки: в каждом типе ... есть книга/свиток»
  // ловит только провисание книг (getItem → null → фильтр выкидывает);
  // провисший id НЕ-книги он не ловит, а getItem(id) → null даёт краш
  // в src/items.js (например, weight на сумму инвентаря).
  const I = require('../src/items.js');
  const idir = path.join(ROOT, 'assets', 'items');
  const itemIds = new Set();
  for (const f of fs.readdirSync(idir).filter((f) => /^\d{6}\.json$/.test(f))) {
    itemIds.add(JSON.parse(fs.readFileSync(path.join(idir, f), 'utf8')).id);
  }
  assert.ok(itemIds.size >= 20, 'каталог assets/items пуст (прединд теста)');
  for (const { file, data } of loadDungeonCatalog()) {
    for (const id of data.предметы) {
      assert.ok(itemIds.has(id),
        `подземелье ${file} (${data.название}): предмета «${id}» нет в assets/items`);
      // JS-фолбэк (file://-ветка): getItem обязан вернуть запись,
      // иначе сундук выдаст null в инвентарь → краш в items.js.
      assert.ok(I.getItem(id),
        `подземелье ${file}: getItem('${id}') → null (зеркало items-data?)`);
    }
  }
});

// --- Задача 000070: «непроходимые» предметы стен (подзадача 000032, н.3) ---
//
// Зафиксированные решения (стадия красных тестов — всё ниже падает до кода):
// * набор видов стен каждого типа — поле `предметы_стен` в каталоге
//   assets/dungeons (source of truth — JSON, 000058; зеркало —
//   src/dungeons-data.js, перегенерация через sync:dungeons). Литерал
//   «рядом с DUNGEON_MOBS» отклонён: 000058 уже смержена, каталог —
//   source of truth, дублировать типовые данные в коде — против
//   прецедента 000053/000058.
// * Матрица типа → виды (фиксирована в задаче; «один набор для всех
//   пяти типов» — типичный косяк, запрещён точным тестом 1:1).
// * wallObjFor(x, y, d) → 'rock_1'|…|'stalactite_2'|null — ЧИСТАЯ
//   функция ТОЛЬКО от (x, y, d.seed, d.type) через hash2: без RNG,
//   без обращения к cells/содержимому/player. «Один вход — один вид»:
//   возврат в подземелье с новым опытом не меняет облик стен.
// * d.wallObjs — массив {x, y, obj} ТОЛЬКО wall-клеток edge-маски:
//   стена с хотя бы одним floor-соседом по 8-соседству Чебышёва 1
//   («фасад» стен, не все стены); floor/entrance/exit — без объектов.
//   Маска считается по ФИНАЛЬНОЙ сетке (после комнат и коридоров).
// * Отрисовка — в 000066; тут — данные, таблицы и чистое ядро.

const WALL_KINDS_ALLOWED = new Set(['rock', 'column', 'stalactite']);
const WALL_MATRIX = {
  [D.DUNGEON_TYPES.CAVE]: ['rock', 'stalactite'],
  [D.DUNGEON_TYPES.CRYPT]: ['column', 'rock'],
  [D.DUNGEON_TYPES.RUINS]: ['column'],
  [D.DUNGEON_TYPES.DROWNED]: ['rock'],
  [D.DUNGEON_TYPES.ABYSS]: ['stalactite', 'rock'],
};

// Фиксированные входы по типам (dungeonTypeFor по terrain/alpha пикселя):
// те же точки, что в существующих golden-тестах этого файла.
const PX_ABYSS_000070 = M.syntheticPixels(8, 8, 40, 40, 40, 10);
const WALL_ENTRIES = [
  { name: 'CAVE', args: [37, -12, PX, M.TERRAIN.GRASS] },
  { name: 'CRYPT', args: [5, 5, PX, M.TERRAIN.FOREST] },
  { name: 'RUINS', args: [5, 5, PX, M.TERRAIN.HILL] },
  { name: 'DROWNED', args: [5, 5, PX, M.TERRAIN.SWAMP] },
  { name: 'ABYSS', args: [11, 3, PX_ABYSS_000070, M.TERRAIN.MOUNTAIN] },
];

/** Edge-маска: wall-клетка с floor-соседом по 8-соседству Чебышёва 1. */
function edgeWallSet(d) {
  const s = new Set();
  for (let y = 0; y < d.height; y++) {
    for (let x = 0; x < d.width; x++) {
      if (d.cells[y * d.width + x] !== D.CELL_WALL) continue;
      let hasFloor = false;
      for (let dy = -1; dy <= 1 && !hasFloor; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= d.width || ny >= d.height) continue;
          if (d.cells[ny * d.width + nx] === D.CELL_FLOOR) {
            hasFloor = true;
            break;
          }
        }
      }
      if (hasFloor) s.add(x + ',' + y);
    }
  }
  return s;
}

test('000070 каталог: предметы_стен — у каждого типа, из допустимого множества, точная матрица 1:1', () => {
  const cat = loadDungeonCatalog();
  assert.equal(cat.length, 5, 'каталог — ровно 5 файлов');
  for (const { file, data } of cat) {
    assert.ok(Array.isArray(data.предметы_стен),
      `${file}: нет поля «предметы_стен»`);
    assert.ok(data.предметы_стен.length > 0, `${file}: «предметы_стен» пусто`);
    for (const k of data.предметы_стен) {
      assert.ok(WALL_KINDS_ALLOWED.has(k),
        `${file}: вид «${k}» вне {rock, column, stalactite}`);
    }
    assert.deepEqual(
      data.предметы_стен.slice().sort(),
      WALL_MATRIX[data.id].slice().sort(),
      `${file} (${data.название}): матрица ≠ зафиксированной`);
  }
});

test('000070 DUNGEON_WALL_KINDS ≡ каталог (1:1, порядок — как в JSON)', () => {
  assert.ok(D.DUNGEON_WALL_KINDS && typeof D.DUNGEON_WALL_KINDS === 'object',
    'dungeon.js: нет экспорта DUNGEON_WALL_KINDS');
  for (const { file, data } of loadDungeonCatalog()) {
    assert.deepEqual(D.DUNGEON_WALL_KINDS[data.id], data.предметы_стен,
      `DUNGEON_WALL_KINDS[${data.id}] (${file}) ≠ каталогу`);
  }
});

for (const t of WALL_ENTRIES) {
  const mkD = () => D.createDungeon(t.args[0], t.args[1], t.args[2], t.args[3]);

  test(`000070 ${t.name}: wallObjs — биекция с edge-маской, ровно один объект на клетку`, () => {
    const d = mkD();
    assert.ok(Array.isArray(d.wallObjs), `${t.name}: нет d.wallObjs`);
    const mask = edgeWallSet(d);
    const seen = new Set();
    for (const o of d.wallObjs) {
      const k = o.x + ',' + o.y;
      assert.ok(!seen.has(k), `${t.name}: дубль объекта на клетке ${k}`);
      seen.add(k);
      assert.ok(mask.has(k), `${t.name}: объект вне edge-маски: ${k}`);
      assert.equal(d.cells[o.y * d.width + o.x], D.CELL_WALL,
        `${t.name}: клетка ${k} не стена`);
      assert.ok(typeof o.obj === 'string' && o.obj.length > 0,
        `${t.name}: пустой obj на ${k}`);
    }
    for (const k of mask) {
      assert.ok(seen.has(k), `${t.name}: edge-стена ${k} без объекта`);
    }
    assert.equal(d.wallObjs.length, mask.size,
      `${t.name}: число объектов ≠ числу edge-клеток`);
  });

  test(`000070 ${t.name}: wallObjs — вид из набора типа, вариант 1..2`, () => {
    const d = mkD();
    const allowed = new Set();
    for (const k of D.DUNGEON_WALL_KINDS[d.type]) {
      allowed.add(k + '_1');
      allowed.add(k + '_2');
    }
    assert.ok(allowed.size > 0, `${t.name}: пустой набор видов`);
    for (const o of d.wallObjs) {
      assert.ok(allowed.has(o.obj),
        `${t.name}: obj «${o.obj}» не из набора типа (${[...allowed].sort().join(', ')})`);
    }
  });

  test(`000070 ${t.name}: без объектов — floor, entrance, exit, стены вне edge-маски (внешнее кольцо)`, () => {
    const d = mkD();
    assert.ok(Array.isArray(d.wallObjs), `${t.name}: нет d.wallObjs`);
    const inObjs = new Set(d.wallObjs.map((o) => o.x + ',' + o.y));
    for (let y = 0; y < d.height; y++) {
      for (let x = 0; x < d.width; x++) {
        const k = x + ',' + y;
        if (d.cells[y * d.width + x] === D.CELL_FLOOR) {
          assert.ok(!inObjs.has(k), `${t.name}: объект на полу ${k}`);
        }
        // Внешнее кольцо решётки: комнаты не ближе 2 клеток к границе —
        // у периметра нет floor-соседей (стена без «фасада») → объектов нет.
        const border = x === 0 || y === 0 || x === d.width - 1 || y === d.height - 1;
        if (border) {
          assert.ok(!inObjs.has(k), `${t.name}: объект на внешнем кольце ${k}`);
        }
      }
    }
    assert.ok(!inObjs.has(d.entrance.x + ',' + d.entrance.y),
      `${t.name}: объект на входе`);
    assert.ok(!inObjs.has(d.exit.x + ',' + d.exit.y),
      `${t.name}: объект на выходе`);
  });

  test(`000070 ${t.name}: стена с floor-соседом только по диагонали — объект (8-соседство, не 4)`, () => {
    const d = mkD();
    assert.ok(Array.isArray(d.wallObjs), `${t.name}: нет d.wallObjs`);
    const inObjs = new Set(d.wallObjs.map((o) => o.x + ',' + o.y));
    const diagOnly = [];
    for (let y = 0; y < d.height; y++) {
      for (let x = 0; x < d.width; x++) {
        if (d.cells[y * d.width + x] !== D.CELL_WALL) continue;
        let card = false, diag = false;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= d.width || ny >= d.height) continue;
            if (d.cells[ny * d.width + nx] !== D.CELL_FLOOR) continue;
            if (Math.abs(dx) + Math.abs(dy) === 1) card = true; else diag = true;
          }
        }
        if (diag && !card) diagOnly.push(x + ',' + y);
      }
    }
    assert.ok(diagOnly.length > 0,
      `${t.name}: прединд не выполнен — нет wall-клеток с диагонально-единственным floor-соседом`);
    for (const k of diagOnly) {
      assert.ok(inObjs.has(k),
        `${t.name}: диагональная edge-стена ${k} без объекта (маска по 4-соседству?)`);
    }
  });

  test(`000070 ${t.name}: детерминизм — один вход → идентичные wallObjs (включая _1/_2)`, () => {
    const a = mkD();
    const b = mkD();
    assert.ok(Array.isArray(a.wallObjs) && a.wallObjs.length > 0,
      `${t.name}: нет d.wallObjs`);
    assert.deepEqual(a.wallObjs, b.wallObjs,
      `${t.name}: повторный createDungeon дал другие wallObjs`);
  });

  test(`000070 ${t.name}: «один вход — один вид» — totalXp/содержимое не меняют wallObjs`, () => {
    const d = mkD();
    assert.ok(Array.isArray(d.wallObjs) && d.wallObjs.length > 0,
      `${t.name}: нет d.wallObjs`);
    const snap = JSON.stringify(d.wallObjs);
    D.generateDungeonContents(d, heroAt(1000));
    D.generateDungeonContents(d, heroAt(999999));
    assert.equal(JSON.stringify(d.wallObjs), snap,
      `${t.name}: wallObjs изменились после generateDungeonContents`);
    // «Возврат» с новым опытом: та же форма входа — тот же вид стен.
    const again = mkD();
    assert.deepEqual(again.wallObjs, d.wallObjs,
      `${t.name}: повторный вход дал другой вид стен`);
  });

  test(`000070 ${t.name}: оба варианта _1/_2 каждого вида типа встречаются на решётке`, () => {
    const d = mkD();
    assert.ok(Array.isArray(d.wallObjs), `${t.name}: нет d.wallObjs`);
    const seen = new Set(d.wallObjs.map((o) => o.obj));
    for (const k of D.DUNGEON_WALL_KINDS[d.type]) {
      assert.ok(seen.has(k + '_1'), `${t.name}: нет ни одного ${k}_1`);
      assert.ok(seen.has(k + '_2'), `${t.name}: нет ни одного ${k}_2`);
    }
  });
}

test('000070 wallObjFor: чистая функция от (x, y, d.seed, d.type) — player/содержимое не видит', () => {
  const d = D.createDungeon(37, -12, PX, M.TERRAIN.GRASS);
  // МИНИМАЛЬНЫЙ объект — без cells/rooms/entrance/exit: функция не
  // должна обращаться к ним (иначе вид зависел бы от решётки/содержимого).
  const min = { type: d.type, seed: d.seed };
  const v1 = D.wallObjFor(3, 7, min);
  assert.equal(v1, D.wallObjFor(3, 7, min), 'повторный вызов — другой результат');
  const check = (v, where) => {
    const m = /^([a-z][a-z0-9]*)_(1|2)$/.exec(String(v));
    assert.ok(m, `wallObjFor ${where}: непредвиденный формат «${v}»`);
    assert.ok(D.DUNGEON_WALL_KINDS[d.type].includes(m[1]),
      `wallObjFor ${where}: вид «${m[1]}» не из набора типа`);
  };
  check(v1, '(3, 7)');
  for (const [x, y] of [[0, 0], [12, 12], [24, 3]]) {
    check(D.wallObjFor(x, y, min), `(${x}, ${y})`);
  }
});

test('000070 wallObjFor ≡ d.wallObjs: каждый объект решётки воспроизводится функцией', () => {
  for (const t of WALL_ENTRIES) {
    const d = D.createDungeon(t.args[0], t.args[1], t.args[2], t.args[3]);
    assert.ok(Array.isArray(d.wallObjs), `${t.name}: нет d.wallObjs`);
    for (const o of d.wallObjs) {
      assert.equal(D.wallObjFor(o.x, o.y, d), o.obj,
        `${t.name}: wallObjFor(${o.x}, ${o.y}) ≠ obj в d.wallObjs`);
    }
  }
});

test('000070 golden: CAVE (37, −12) — закреплённые wallObjs', () => {
  // Практика 000058: закреплённые значения снимаются с рабочего кода
  // на СТАДИИ РЕАЛИЗАЦИИ — пін фиксирует соли hash2 wallObjFor.
  // В красной стадии тест падает: d.wallObjs отсутствует.
  const d = D.createDungeon(37, -12, PX, M.TERRAIN.GRASS);
  assert.equal(d.type, D.DUNGEON_TYPES.CAVE, 'CAVE');
  assert.equal(d.seed, 2658571374, 'сид CAVE (37, −12) уже закреплён');
  assert.ok(Array.isArray(d.wallObjs) && d.wallObjs.length > 0,
    'нет d.wallObjs');
  // Снапшот снят с рабочего кода на стадии реализации (задача 000070):
  // пин фиксирует соли hash2 wallObjFor (WALL_KIND_SALT /
  // WALL_VARIANT_SALT) и обход edge-маски (y, затем x).
  assert.deepEqual(d.wallObjs, [
    { x: 14, y: 1, obj: 'stalactite_1' },
    { x: 15, y: 1, obj: 'stalactite_1' },
    { x: 16, y: 1, obj: 'stalactite_1' },
    { x: 17, y: 1, obj: 'rock_1' },
    { x: 18, y: 1, obj: 'stalactite_2' },
    { x: 19, y: 1, obj: 'stalactite_2' },
    { x: 20, y: 1, obj: 'stalactite_2' },
    { x: 21, y: 1, obj: 'stalactite_2' },
    { x: 14, y: 2, obj: 'rock_1' },
    { x: 21, y: 2, obj: 'stalactite_2' },
    { x: 14, y: 3, obj: 'stalactite_1' },
    { x: 21, y: 3, obj: 'rock_1' },
    { x: 10, y: 4, obj: 'rock_1' },
    { x: 11, y: 4, obj: 'stalactite_2' },
    { x: 12, y: 4, obj: 'stalactite_2' },
    { x: 13, y: 4, obj: 'stalactite_1' },
    { x: 14, y: 4, obj: 'stalactite_2' },
    { x: 21, y: 4, obj: 'stalactite_2' },
    { x: 5, y: 5, obj: 'rock_2' },
    { x: 6, y: 5, obj: 'stalactite_2' },
    { x: 7, y: 5, obj: 'rock_1' },
    { x: 8, y: 5, obj: 'rock_2' },
    { x: 9, y: 5, obj: 'stalactite_2' },
    { x: 10, y: 5, obj: 'rock_2' },
    { x: 21, y: 5, obj: 'rock_2' },
    { x: 5, y: 6, obj: 'stalactite_1' },
    { x: 13, y: 6, obj: 'rock_1' },
    { x: 14, y: 6, obj: 'stalactite_1' },
    { x: 21, y: 6, obj: 'stalactite_2' },
    { x: 5, y: 7, obj: 'rock_2' },
    { x: 13, y: 7, obj: 'stalactite_1' },
    { x: 14, y: 7, obj: 'rock_2' },
    { x: 21, y: 7, obj: 'stalactite_1' },
    { x: 5, y: 8, obj: 'stalactite_1' },
    { x: 13, y: 8, obj: 'rock_2' },
    { x: 14, y: 8, obj: 'stalactite_2' },
    { x: 21, y: 8, obj: 'rock_2' },
    { x: 1, y: 9, obj: 'rock_1' },
    { x: 2, y: 9, obj: 'rock_1' },
    { x: 3, y: 9, obj: 'rock_1' },
    { x: 4, y: 9, obj: 'stalactite_2' },
    { x: 5, y: 9, obj: 'stalactite_1' },
    { x: 13, y: 9, obj: 'stalactite_2' },
    { x: 14, y: 9, obj: 'rock_1' },
    { x: 15, y: 9, obj: 'rock_1' },
    { x: 16, y: 9, obj: 'rock_1' },
    { x: 17, y: 9, obj: 'stalactite_2' },
    { x: 18, y: 9, obj: 'rock_2' },
    { x: 19, y: 9, obj: 'rock_1' },
    { x: 20, y: 9, obj: 'stalactite_2' },
    { x: 21, y: 9, obj: 'stalactite_2' },
    { x: 22, y: 9, obj: 'rock_1' },
    { x: 1, y: 10, obj: 'stalactite_1' },
    { x: 22, y: 10, obj: 'stalactite_1' },
    { x: 1, y: 11, obj: 'rock_2' },
    { x: 22, y: 11, obj: 'rock_1' },
    { x: 1, y: 12, obj: 'rock_1' },
    { x: 22, y: 12, obj: 'rock_2' },
    { x: 1, y: 13, obj: 'stalactite_1' },
    { x: 22, y: 13, obj: 'rock_1' },
    { x: 1, y: 14, obj: 'rock_1' },
    { x: 22, y: 14, obj: 'stalactite_2' },
    { x: 1, y: 15, obj: 'rock_1' },
    { x: 7, y: 15, obj: 'rock_2' },
    { x: 8, y: 15, obj: 'rock_1' },
    { x: 9, y: 15, obj: 'rock_2' },
    { x: 10, y: 15, obj: 'rock_2' },
    { x: 11, y: 15, obj: 'stalactite_2' },
    { x: 12, y: 15, obj: 'stalactite_1' },
    { x: 13, y: 15, obj: 'rock_1' },
    { x: 14, y: 15, obj: 'rock_2' },
    { x: 22, y: 15, obj: 'stalactite_2' },
    { x: 1, y: 16, obj: 'stalactite_1' },
    { x: 7, y: 16, obj: 'rock_2' },
    { x: 14, y: 16, obj: 'stalactite_2' },
    { x: 22, y: 16, obj: 'stalactite_2' },
    { x: 1, y: 17, obj: 'stalactite_2' },
    { x: 7, y: 17, obj: 'stalactite_1' },
    { x: 14, y: 17, obj: 'rock_2' },
    { x: 22, y: 17, obj: 'rock_1' },
    { x: 1, y: 18, obj: 'stalactite_1' },
    { x: 2, y: 18, obj: 'stalactite_1' },
    { x: 3, y: 18, obj: 'rock_2' },
    { x: 4, y: 18, obj: 'rock_1' },
    { x: 5, y: 18, obj: 'stalactite_1' },
    { x: 6, y: 18, obj: 'stalactite_2' },
    { x: 7, y: 18, obj: 'rock_1' },
    { x: 14, y: 18, obj: 'stalactite_2' },
    { x: 22, y: 18, obj: 'rock_1' },
    { x: 14, y: 19, obj: 'stalactite_2' },
    { x: 15, y: 19, obj: 'stalactite_1' },
    { x: 16, y: 19, obj: 'stalactite_2' },
    { x: 17, y: 19, obj: 'rock_1' },
    { x: 18, y: 19, obj: 'stalactite_2' },
    { x: 19, y: 19, obj: 'rock_2' },
    { x: 20, y: 19, obj: 'rock_1' },
    { x: 21, y: 19, obj: 'stalactite_1' },
    { x: 22, y: 19, obj: 'stalactite_1' }
  ]);
});

// --- Задача 000133: свитки заклинаний в подземельных пулах (S3) ---
//
// КРАСНЫЙ: пулы без свитков (контракт memory/000133-spell-scrolls-
// runes.md §2.3). Распределение (решение ТЗ): каждый свиток РОВНО
// в одном пуле; порядок — свитки ПРИЛОЖЕНЫ к концу массива
// «предметы» (золотые значения DUNGEON_ITEMS ре-пинятся на стадии
// ЗЕЛЁНОЙ — §5, здесь фиксируется целевой состав).

test('S3. 000133: пулы подземелий — 8 свитков, каждый ровно в одном', () => {
  // Целевые пулы (текущий состав + приложенные свитки).
  const EXPECTED = {
    '000001.json': ['iron_sword', 'healing_potion', 'sulfur',
      'stone_fist_grimoire', 'frost_bolt_scroll'],
    '000002.json': ['alchemy_manual', 'chainmail', 'mana_potion',
      'meditation_scroll', 'chill_scroll', 'light_heal_scroll'],
    '000003.json': ['steel_sword', 'knight_plate', 'war_hammer',
      'iron_hide_tome', 'fireball_scroll', 'vine_scroll'],
    '000004.json': ['mana_elixir', 'hunting_bow', 'moonstone',
      'nature_scroll', 'magic_shield_scroll'],
    '000005.json': ['war_hammer', 'phoenix_feather', 'greater_healing',
      'heavy_tome', 'fire_spellbook', 'flame_burst_scroll',
      'blizzard_scroll'],
  };
  const SCROLL_IDS = new Set([
    'fireball_scroll', 'flame_burst_scroll', 'frost_bolt_scroll',
    'blizzard_scroll', 'chill_scroll', 'light_heal_scroll',
    'magic_shield_scroll', 'vine_scroll',
  ]);
  const cat = loadDungeonCatalog();
  assert.equal(cat.length, 5, '5 подземелий (регрессия)');
  const seen = new Map();
  for (const { file, data } of cat) {
    assert.deepEqual(data.предметы, EXPECTED[file],
      file + ': предметы (red: свитков нет в пуле); факт: '
      + JSON.stringify(data.предметы));
    for (const id of data.предметы) {
      if (SCROLL_IDS.has(id)) seen.set(id, (seen.get(id) || 0) + 1);
    }
  }
  for (const id of SCROLL_IDS) {
    assert.equal(seen.get(id) || 0, 1,
      id + ': свиток РОВНО в одном пуле (red: свитка нет ни в одном)');
  }
});

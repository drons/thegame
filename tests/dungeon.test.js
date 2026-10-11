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
  // 000177: выход = вход — единый тайл (rooms[0]), ранее rooms[last].
  assert.deepEqual(d.exit, { x: 18, y: 14 });
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
  // РЕ-ПИН 000177: выход = вход (rooms[0]) → safe-зона — ОДИН 5×5
  // блок (ранее два: вход + rooms[last]) → spots длиннее → позиции
  // мобов/сундуков сдвинуты (mobIds/level/seed/gold/item — те же).
  assert.deepEqual(c2.mobs, [
    { id: 'g0', mobIds: ['lower_demon', 'lower_demon'], x: 15, y: 4, level: 12, defeated: false },
    { id: 'g1', mobIds: ['lower_demon', 'succubus', 'lower_demon'], x: 11, y: 5, level: 7, defeated: false },
    { id: 'g2', mobIds: ['abomination', 'succubus'], x: 13, y: 9, level: 7, defeated: false },
    { id: 'boss', mobIds: ['abomination', 'lower_demon', 'lower_demon'], x: 14, y: 6, level: 13, defeated: false, boss: true },
  ]);
  assert.deepEqual(c2.chests, [
    { id: 'c0', x: 20, y: 11, opened: false, gold: 63, item: null },
    { id: 'c1', x: 7, y: 8, opened: false, gold: 58, item: 'phoenix_feather' },
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

// ====================================================================
// 000183: KРАСНЫЙ тест (D-BOSS-1) — инвариант босс-клетки ABYSS:
// клетка дальней комнаты (босс) НИКОГДА не занята wander-группой или
// сундуком. Контракт: memory/000183-guard-pins-abyss-boss.md §D-BOSS-1.
//
// На master гарда НЕТ: generateDungeonContents занимает клетки
// takeSpot(), но клетка босса в `occupied` не добавляется →
// коллизии (пробное сканирование: 69/99/137 коллизий за xp 1..3000
// на трёх формах ниже; первые нарушения: (11,3) xp=18 сундук c3;
// (-25,-20) xp=45 моб g2; (-15,-20) xp=9 сундук c2). После фикса
// (occupied.add(клетка босса) до первого takeSpot) тест зелёный —
// инвариант на всём сценарном диапазоне xp.
// ====================================================================

test('D-BOSS-1: ABYSS — клетка босса (дальняя комната) НИКОГДА не занята wander-группой или сундуком (свип xp 1..3000, 3 формы) (000183, RED)', () => {
  const shapes = [[11, 3], [-25, -20], [-15, -20]];
  const MAX_XP = 3000;
  for (const [ex, ey] of shapes) {
    const d = D.createDungeon(ex, ey, PX_ABYSS_000070, M.TERRAIN.MOUNTAIN);
    assert.equal(d.type, D.DUNGEON_TYPES.ABYSS,
      '(' + ex + ',' + ey + '): MOUNTAIN + пиксель alpha 10 → ABYSS '
      + '(сценарий)');
    const far = d.rooms[d.rooms.length - 1];
    const bx = far.cx, by = far.cy;
    assert.equal(d.cells[by * d.width + bx], D.CELL_FLOOR,
      '(' + ex + ',' + ey + '): босс-клетка (центр rooms[last]) — floor');
    assert.ok(!(bx === d.entrance.x && by === d.entrance.y),
      '(' + ex + ',' + ey + '): босс-клетка ≠ вход (инвариант '
      + 'нетривиален; 000177: exit deepEqual entrance)');
    for (let xp = 1; xp <= MAX_XP; xp++) {
      const c = D.generateDungeonContents(d, heroAt(xp));
      const boss = c.mobs.find((m) => m.boss);
      assert.ok(boss,
        '(' + ex + ',' + ey + ') xp=' + xp + ': босс присутствует');
      assert.deepEqual({ x: boss.x, y: boss.y }, { x: bx, y: by },
        '(' + ex + ',' + ey + ') xp=' + xp + ': босс — на клетке '
        + 'дальней комнаты');
      const who = [];
      for (const m of c.mobs)
        if (!m.boss && m.x === bx && m.y === by) who.push('моб ' + m.id);
      for (const ch of c.chests)
        if (ch.x === bx && ch.y === by) who.push('сундук ' + ch.id);
      assert.equal(who.length, 0,
        '(' + ex + ',' + ey + ') xp=' + xp + ': босс-клетка свободна — '
        + 'коллизия: ' + who.join(', '));
    }
  }
});

// ====================================================================
// 000183: D-BOSS-2 — РЕ-ПИН post-fix контента (зелёный с рождения):
// полный {seed, mobs, chests, createdAtXp} трёх ABYSS-подземелий после
// фикса (occupied.add(клетка босса) до первого takeSpot). Значения
// ПЕРЕПРОВЕРЕНЫ против реальной исправленной generateDungeonContents
// (node-пробой) перед захардкоживанием; контракт: memory/000183-
// guard-pins-abyss-boss.md §C2.
//
// (11,3)/xp=18 — случай, где на мастере была коллизия: сундук c3
// (14,6) НА клетке босса; после фикса c3 — (11,12). Case A/B — другие
// формы подземелья (анти-ваккуум: фикс не «случайно» чистит только
// золотую решётку). Золотой пин (11,3)/xp=2000 (тест «golden:
// детерминизм») ПОСЛЕ фикса бит-в-бит тот же — репин не требовался.
// ====================================================================

test('D-BOSS-2: ABYSS — post-fix контент: репин 3 подземелий, босс-клетка чиста (000183)', () => {
  const PINS = [
    {
      name: '(11,3) xp=18', args: [11, 3], xp: 18,
      dseed: 2941640529, cseed: 4033219701,
      mobs: [
        { id: 'g0', mobIds: ['lower_demon', 'abomination', 'succubus'], x: 5, y: 23, level: 4, defeated: false },
        { id: 'g1', mobIds: ['lower_demon', 'lower_demon'], x: 3, y: 13, level: 1, defeated: false },
        { id: 'g2', mobIds: ['lower_demon'], x: 7, y: 5, level: 3, defeated: false },
        { id: 'g3', mobIds: ['abomination', 'abomination'], x: 13, y: 7, level: 1, defeated: false },
        { id: 'boss', mobIds: ['abomination', 'lower_demon', 'lower_demon'], x: 14, y: 6, level: 4, defeated: false, boss: true },
      ],
      chests: [
        { id: 'c0', x: 17, y: 23, opened: false, gold: 20, item: null },
        { id: 'c1', x: 13, y: 11, opened: false, gold: 12, item: 'war_hammer' },
        { id: 'c2', x: 13, y: 13, opened: false, gold: 14, item: 'blizzard_scroll' },
        { id: 'c3', x: 11, y: 12, opened: false, gold: 28, item: 'blizzard_scroll' },
      ],
    },
    {
      name: 'Case A (−25,−20) xp=100', args: [-25, -20], xp: 100,
      dseed: 3164924960, cseed: 3522625240,
      mobs: [
        { id: 'g0', mobIds: ['succubus', 'lower_demon', 'lower_demon'], x: 27, y: 26, level: 1, defeated: false },
        { id: 'g1', mobIds: ['lower_demon', 'succubus'], x: 24, y: 28, level: 1, defeated: false },
        { id: 'g2', mobIds: ['abomination', 'succubus', 'abomination'], x: 16, y: 7, level: 1, defeated: false },
        { id: 'g3', mobIds: ['lower_demon', 'lower_demon', 'lower_demon'], x: 16, y: 8, level: 2, defeated: false },
        { id: 'boss', mobIds: ['abomination', 'lower_demon', 'lower_demon'], x: 24, y: 24, level: 4, defeated: false, boss: true },
      ],
      chests: [
        { id: 'c0', x: 22, y: 24, opened: false, gold: 21, item: 'heavy_tome' },
        { id: 'c1', x: 14, y: 13, opened: false, gold: 27, item: null },
        { id: 'c2', x: 20, y: 8, opened: false, gold: 28, item: null },
        { id: 'c3', x: 10, y: 10, opened: false, gold: 11, item: null },
        { id: 'c4', x: 17, y: 7, opened: false, gold: 20, item: 'greater_healing' },
      ],
    },
    {
      name: 'Case B (−15,−20) xp=321', args: [-15, -20], xp: 321,
      dseed: 2383094398, cseed: 1222898703,
      mobs: [
        { id: 'g0', mobIds: ['abomination', 'lower_demon'], x: 14, y: 25, level: 1, defeated: false },
        { id: 'g1', mobIds: ['abomination', 'lower_demon'], x: 21, y: 26, level: 4, defeated: false },
        { id: 'g2', mobIds: ['abomination'], x: 18, y: 30, level: 1, defeated: false },
        { id: 'boss', mobIds: ['abomination', 'lower_demon', 'lower_demon'], x: 21, y: 29, level: 4, defeated: false, boss: true },
      ],
      chests: [
        { id: 'c0', x: 20, y: 29, opened: false, gold: 15, item: null },
        { id: 'c1', x: 14, y: 26, opened: false, gold: 25, item: null },
      ],
    },
  ];
  for (const p of PINS) {
    const d = D.createDungeon(p.args[0], p.args[1], PX_ABYSS_000070, M.TERRAIN.MOUNTAIN);
    assert.equal(d.type, D.DUNGEON_TYPES.ABYSS, p.name + ': ABYSS (сценарий)');
    assert.equal(d.seed, p.dseed, p.name + ': сид подземелья (решётка)');
    const c = D.generateDungeonContents(d, heroAt(p.xp));
    assert.equal(c.seed, p.cseed, p.name + ': сид контента');
    assert.deepEqual(c.mobs, p.mobs, p.name + ': mobs (полный deepEqual)');
    assert.deepEqual(c.chests, p.chests, p.name + ': chests (полный deepEqual)');
    assert.equal(c.createdAtXp, p.xp, p.name + ': createdAtXp');
    // Инвариант D-BOSS-1 на закреплённом контенте.
    const far = d.rooms[d.rooms.length - 1];
    for (const m of c.mobs)
      assert.ok(m.boss || (m.x !== far.cx || m.y !== far.cy),
        p.name + ': моб ' + m.id + ' на клетке босса (' + far.cx + ',' + far.cy + ')');
    for (const ch of c.chests)
      assert.ok(ch.x !== far.cx || ch.y !== far.cy,
        p.name + ': сундук ' + ch.id + ' на клетке босса (' + far.cx + ',' + far.cy + ')');
  }
});

// ====================================================================
// Ретро-20261011 (000183): blast-radius границы — НЕ-ABYSS содержимое
// бит-в-бит.
//
// Finding (minor, tasks/result/000183-retro-20261011.md): свойство
// фикса 000183 «все не-ABYSS подземелья бит-в-бит неизменны» (guard
// `d.type === ABYSS` перед occupied.add(клетка босса)) задекларировано
// и «проверено пробой», но не закреплено тестом — абсолютных
// content-пинов были только ABYSS (golden (11,3)/xp=2000, D-BOSS-2);
// golden CAVE (37,−12) пинит только решётку. D-BOSS-3 — полный
// deepEqual-пин generateDungeonContents для НЕ-ABYSS входа; вместе с
// D-BOSS-1/2 закрывает blast-radius фикса с обеих сторон.
//
// Сценарий: CAVE (37,−12) — каноническая точка файла (golden L254,
// DEP-1); xp=32 — ПЕРВЫЙ чувствительный к обобщению гарда (свип
// xp 1..3000: 132/3000; xp=1000 из примера ТЗ НЕ чувствителен — на
// нём пин не покраснел бы при регрессии «обобщат гард»): при xp=32
// сундук c3 стоит ровно на (18,5) = клетка дальней комнаты, обобщение
// гарда блокирует её → сдвиг. Значения — ПО ФАКТУ master 3ce98ad
// (node-пробой, детерминизм перепроверен). Контракт:
// memory/000189-non-abyss-contents-pin.md.
// ====================================================================

test('D-BOSS-3: НЕ-ABYSS — полный deepEqual-пин содержимого CAVE (37,−12) xp=32: blast-radius границы фикса 000183 (Ретро-20261011)', () => {
  const d = D.createDungeon(37, -12, PX, M.TERRAIN.GRASS);
  assert.equal(d.type, D.DUNGEON_TYPES.CAVE,
    'CAVE (сценарий; якорь — пин не «тихо дрейфует» при смене формы)');
  assert.equal(d.seed, 2658571374,
    'сид решётки (golden L254 / DEP-1 — бит-в-бит)');
  const c = D.generateDungeonContents(d, heroAt(32));
  assert.equal(c.seed, 664152848, 'сид контента');
  // Полный объект: ВСЕ поля (seed/mobs/chests/createdAtXp/step) —
  // node:assert/strict deepEqual === deepStrictEqual: пинит и набор
  // собственных ключей (новое/удалённое поле результата → красный →
  // осознанный ре-пин от факта), чего не делают существующие goldens.
  assert.deepEqual(c, {
    seed: 664152848,
    mobs: [
      { id: 'g0', mobIds: ['skeleton'], x: 7, y: 7, level: 2, defeated: false },
      { id: 'g1', mobIds: ['giant_larva', 'crawling_bones', 'giant_larva'], x: 11, y: 13, level: 3, defeated: false },
      { id: 'g2', mobIds: ['crawling_bones', 'giant_larva', 'crawling_bones'], x: 11, y: 14, level: 1, defeated: false },
      { id: 'g3', mobIds: ['skeleton', 'giant_larva', 'ant'], x: 17, y: 7, level: 2, defeated: false },
      { id: 'g4', mobIds: ['crawling_bones', 'giant_larva', 'crawling_bones'], x: 6, y: 12, level: 1, defeated: false },
      { id: 'g5', mobIds: ['giant_larva', 'crawling_bones', 'giant_larva'], x: 8, y: 11, level: 1, defeated: false },
    ],
    chests: [
      { id: 'c0', x: 18, y: 18, opened: false, gold: 31, item: null },
      { id: 'c1', x: 6, y: 13, opened: false, gold: 24, item: null },
      { id: 'c2', x: 13, y: 10, opened: false, gold: 31, item: 'healing_potion' },
      { id: 'c3', x: 18, y: 5, opened: false, gold: 27, item: 'stone_fist_grimoire' },
      { id: 'c4', x: 15, y: 18, opened: false, gold: 26, item: null },
    ],
    createdAtXp: 32,
    step: 0,
  }, 'полный объект generateDungeonContents: ВСЕ поля бит-в-бит');
});

// --- Задача 000153.01: модель глубины подземелья (КРАСНЫЕ, §6) ---
// d.depth (int ≥ 1, первый этаж = 1), сид формы per-глубина
// (depth=1 — бит-в-бит существующие goldens; depth>1 — формула
// dungeonDepthSeed, без rng), ключ памяти 'x,y:depth', сериализатор
// раздела сейва dungeonMemory (паттерн cities.js). Пины —
// memory/000153.01-dungeon-depth-save.md §2.1/§2.2 (предвычислено
// реальным hash2: CAVE(37,−12) base 2658571374 → d2 3912048804,
// d3 4212266649, d10 1597152373; ABYSS(11,3) base 2941640529 →
// d2 792410970).

test('DEP-1: d.depth = 1 (дефолт), depth=1 БИТ-В-БИТ, fail-open clamp', () => {
  const d = D.createDungeon(37, -12, PX, M.TERRAIN.GRASS);
  assert.equal(d.depth, 1, 'd.depth — целое 1 (дефолт, первый этаж)');
  assert.ok(Number.isInteger(d.depth) && d.depth >= 1,
    'd.depth — целое ≥ 1');
  assert.equal(d.seed, 2658571374,
    'depth=1: seed БИТ-В-БИТ (существующий golden)');
  const a = D.createDungeon(11, 3, PX_ABYSS_000070, M.TERRAIN.MOUNTAIN);
  assert.equal(a.depth, 1, 'ABYSS: d.depth = 1');
  assert.equal(a.seed, 2941640529,
    'ABYSS depth=1: seed БИТ-В-БИТ (существующий golden)');
  // fail-open clamp: невалидный depth → 1 (молча), форма depth=1.
  for (const bad of [0, 0.5, NaN, -3, '2']) {
    const z = D.createDungeon(37, -12, PX, M.TERRAIN.GRASS, bad);
    assert.equal(z.depth, 1, 'clamp depth=' + String(bad) + ' → 1');
    assert.equal(z.seed, 2658571374,
      'clamp depth=' + String(bad) + ': seed depth=1 (fail-open)');
  }
});

// cells depth=2 CAVE(37,−12) 28×28 — снято с рабочего кода
// (000153.02, зелёная стадия; node-ре-верификация).
// РЕ-ПИН 000153.02: W(depth) — сторона ×1.1/этаж (depth=2 CAVE:
// 25→28); seed/число комнат — те же (сид и nRooms — до W).
const D2_CELLS =
  '0000000000000000000000000000' +
  '0000000000000000000000000000' +
  '0000000000000000000000000000' +
  '0000000000000000000000000000' +
  '0000000000000000000000000000' +
  '0000000000000000000000000000' +
  '0000000000000000000000000000' +
  '0000000000000001111111000000' +
  '0000000000000001111111000000' +
  '0000000000000011111111000000' +
  '0000000000000011111111000000' +
  '0000000000001111111111000000' +
  '0000000000001011111111000000' +
  '0000000000001011111111000000' +
  '0000000000001000111000000000' +
  '0000000001111111111000000000' +
  '0000000001111111111000000000' +
  '0000000001111111111000000000' +
  '0000000001111111111110000000' +
  '0000000000111111111110000000' +
  '0000000000111111111110000000' +
  '0000000000111111111110000000' +
  '0000000000111111111110000000' +
  '0000000000111111111110000000' +
  '0000000000000111111110000000' +
  '0000000000000000000000000000' +
  '0000000000000000000000000000' +
  '0000000000000000000000000000';

test('DEP-2: depth=2 — d.depth = 2, сид/форма детерминированы (пinned)', () => {
  const a = D.createDungeon(37, -12, PX, M.TERRAIN.GRASS, 2);
  const b = D.createDungeon(37, -12, PX, M.TERRAIN.GRASS, 2);
  assert.equal(a.depth, 2, 'd.depth = 2');
  assert.equal(a.seed, 3912048804,
    'depth2 seed = dungeonDepthSeed(base, 2) (дизайн-пин)');
  assert.equal(a.seed, b.seed, 'детерминизм: та же глубина — тот же сид');
  assert.deepEqual(a.cells, b.cells, 'детерминизм: cells');
  assert.deepEqual(a.rooms, b.rooms, 'детерминизм: rooms');
  assert.deepEqual(a.entrance, b.entrance, 'детерминизм: entrance');
  assert.deepEqual(a.exit, b.exit, 'детерминизм: exit');
  assert.deepEqual(a.wallObjs, b.wallObjs, 'детерминизм: wallObjs');
  // Фиксированная форма depth=2 (РЕ-ПИН 000153.02: W(depth) — сторона
  // ×1.1/этаж, CAVE depth=2: 25→28; seed/число комнат — те же, т.к.
  // сид и nRooms — до W): 28×28, entrance (13,17), 7 комнат, 75 wallObjs.
  assert.equal(a.width, 28, 'depth2 W');
  assert.equal(a.height, 28, 'depth2 H');
  assert.deepEqual(a.entrance, { x: 13, y: 17 }, 'depth2 entrance');
  assert.equal(a.rooms.length, 7, 'depth2 rooms');
  assert.equal(a.wallObjs.length, 75, 'depth2 wallObjs');
  assert.equal(a.cells.join(''), D2_CELLS, 'depth2 cells-стринг (пinned)');
});

test('DEP-3: depth>1 — сид per-глубина (≠ depth=1), 2..12 попарно различны', () => {
  const d1 = D.createDungeon(37, -12, PX, M.TERRAIN.GRASS);
  const d2 = D.createDungeon(37, -12, PX, M.TERRAIN.GRASS, 2);
  assert.notEqual(d2.seed, d1.seed, 'depth2 seed ≠ depth1 seed');
  assert.notDeepEqual(d2.cells, d1.cells, 'depth2 форма ≠ depth1 форма');
  // Конкретные пины формулы (дизайн §2.1).
  assert.equal(D.createDungeon(37, -12, PX, M.TERRAIN.GRASS, 3).seed,
    4212266649, 'depth3 seed (дизайн-пин)');
  assert.equal(D.createDungeon(37, -12, PX, M.TERRAIN.GRASS, 10).seed,
    1597152373, 'depth10 seed (дизайн-пин)');
  assert.equal(
    D.createDungeon(11, 3, PX_ABYSS_000070, M.TERRAIN.MOUNTAIN, 2).seed,
    792410970, 'ABYSS depth2 seed (дизайн-пин)');
  const seen = new Set([d1.seed]);
  for (let dep = 2; dep <= 12; dep++) {
    const s = D.createDungeon(37, -12, PX, M.TERRAIN.GRASS, dep).seed;
    assert.ok(!seen.has(s), 'depth ' + dep + ' seed попарно различен');
    seen.add(s);
  }
});

test('DEP-4: новые экспорты dungeon.js (seed/key/regex/сериализатор)', () => {
  // Экспорт (additive, :539-546 → +6) — в красной стадии отсутствует.
  assert.equal(typeof D.dungeonDepthSeed, 'function', 'dungeonDepthSeed');
  assert.equal(typeof D.dungeonMemoryKey, 'function', 'dungeonMemoryKey');
  assert.equal(typeof D.validateDungeonContents, 'function',
    'validateDungeonContents');
  assert.equal(typeof D.serializeDungeonMemory, 'function',
    'serializeDungeonMemory');
  assert.equal(typeof D.restoreDungeonMemory, 'function',
    'restoreDungeonMemory');
  assert.ok(D.DUNGEON_MEMORY_KEY_RE instanceof RegExp,
    'DUNGEON_MEMORY_KEY_RE (RegExp)');

  // dungeonDepthSeed — формула (дизайн §2.1), ноль rng.
  assert.equal(D.dungeonDepthSeed(2658571374, 2), 3912048804);
  assert.equal(D.dungeonDepthSeed(2658571374, 3), 4212266649);
  assert.equal(D.dungeonDepthSeed(2941640529, 2), 792410970);

  // Ключ (дизайн §2.2).
  assert.equal(D.dungeonMemoryKey('18,14', 1), '18,14:1');
  assert.equal(D.dungeonMemoryKey('-5,-12', 3), '-5,-12:3');
  assert.ok(D.DUNGEON_MEMORY_KEY_RE.test('18,14:1'));
  assert.ok(D.DUNGEON_MEMORY_KEY_RE.test('-5,-12:3'));
  assert.ok(!D.DUNGEON_MEMORY_KEY_RE.test('18,14'),
    'старый формат «x,y» (без depth) — отклонён');
  assert.ok(!D.DUNGEON_MEMORY_KEY_RE.test('18:14'), '«18:14» — отклонён');
  assert.ok(!D.DUNGEON_MEMORY_KEY_RE.test('18,14:'), '«18,14:» — отклонён');
  assert.ok(!D.DUNGEON_MEMORY_KEY_RE.test(''), 'пустота — отклонён');

  // validateDungeonContents — глубокая копия / null (дизайн §2.3).
  const goodContents = {
    seed: 12345, createdAtXp: 0, step: 3,
    mobs: [{ id: 'g0', mobIds: ['ant', 'ant'], x: 3, y: 4, level: 1,
      defeated: true }],
    chests: [{ id: 'c0', x: 2, y: 3, opened: true, gold: 10,
      item: 'iron_sword' }],
  };
  const v = D.validateDungeonContents(goodContents);
  assert.deepEqual(v, goodContents, 'валидный contents — глубокая копия');
  assert.notStrictEqual(v, goodContents, 'копия — новый объект');
  assert.notStrictEqual(v.mobs, goodContents.mobs, 'массивы — новые');
  assert.notStrictEqual(v.chests, goodContents.chests, 'массивы — новые');
  assert.notStrictEqual(v.mobs[0], goodContents.mobs[0], 'элементы — новые');
  assert.equal(D.validateDungeonContents(null), null, 'null → null');
  assert.equal(D.validateDungeonContents('junk'), null, 'строка → null');
  assert.equal(D.validateDungeonContents([1, 2]), null, 'массив → null');
  assert.equal(
    D.validateDungeonContents({ ...goodContents, step: -1 }), null,
    'step < 0 → null');
  assert.equal(
    D.validateDungeonContents({ ...goodContents, mobs: 'junk' }), null,
    'mobs не массив → null');
  assert.equal(
    D.validateDungeonContents({
      seed: 1, createdAtXp: 0, step: 0,
      mobs: [{ id: 42, mobIds: ['ant'], x: 1, y: 1, level: 1,
        defeated: false }],
      chests: [],
    }), null, 'mobs[0].id не строка → null');
  assert.equal(
    D.validateDungeonContents({
      seed: 1, createdAtXp: 0, step: 0, mobs: [],
      chests: [{ id: 'c0', x: 1, y: 1, opened: false, gold: -5,
        item: null }],
    }), null, 'chests[0].gold < 0 → null');

  // serializeDungeonMemory (дизайн §2.3): двусторонняя обрезка +
  // activeRec merge «активный поверх». День 7, окно 3.
  const rec = (last, contents, pos) => ({
    contents, lastVisitDay: last, ...(pos ? { pos } : {}),
  });
  const mem = {
    '18,14:1': rec(5, goodContents), // 7−5=2 ≤ 3 → kept
    '20,10:1': rec(1, goodContents), // 7−1=6 > 3 → expired → dropped
    '21,10:1': rec(9, goodContents), // 9 > 7 → future → dropped
    '7,7': rec(5, goodContents), // старый формат → dropped
    '30,10:2': rec(5, { ...goodContents, step: -5 }), // битый → dropped
  };
  const out = D.serializeDungeonMemory(mem, 7, 3, null);
  assert.deepEqual(Object.keys(out).sort(), ['18,14:1'],
    'обрезка: осталась только валидная запись');
  assert.equal(out['18,14:1'].lastVisitDay, 5);
  assert.deepEqual(out['18,14:1'].contents, goodContents);
  // activeRec — merge «активный поверх» (своя key перезаписана;
  // step/pos — из активного).
  const activeContents = { ...goodContents, step: 42 };
  const activeRec = {
    key: '18,14:1', contents: activeContents, lastVisitDay: 7,
    pos: { x: 6, y: 15 },
  };
  const out2 = D.serializeDungeonMemory(mem, 7, 3, activeRec);
  assert.deepEqual(out2['18,14:1'].contents, activeContents,
    'merge: contents — активного');
  assert.equal(out2['18,14:1'].lastVisitDay, 7, 'merge: lastVisitDay — 7');
  assert.deepEqual(out2['18,14:1'].pos, { x: 6, y: 15 },
    'merge: pos — из activeRec');
  // activeRec с ключом, отсутствующим в memory — пишется.
  const out3 = D.serializeDungeonMemory({}, 7, 3, {
    key: '1,2:1', contents: goodContents, lastVisitDay: 7,
    pos: { x: 0, y: 0 },
  });
  assert.deepEqual(Object.keys(out3), ['1,2:1'],
    'merge: ключ activeRec создаётся');
  // Map-вход (1:1 с runtime-Map main.js).
  const out4 = D.serializeDungeonMemory(
    new Map(Object.entries(mem)), 7, 3, null);
  assert.deepEqual(Object.keys(out4).sort(), ['18,14:1'],
    'Map-вход — та же обрезка');

  // restoreDungeonMemory (дизайн §2.3): plain → Map; non-object →
  // пустой Map молча; глубокая копия.
  const m = D.restoreDungeonMemory({ '18,14:1': rec(5, goodContents) }, 7, 3);
  assert.ok(m instanceof Map, 'restore → Map');
  assert.equal(m.size, 1, 'restore: валидная запись');
  const got = m.get('18,14:1');
  assert.equal(got.lastVisitDay, 5);
  assert.deepEqual(got.contents, goodContents);
  assert.notStrictEqual(got.contents, goodContents, 'restore: глубокая копия');
  const mAll = D.restoreDungeonMemory(mem, 7, 3);
  assert.deepEqual([...mAll.keys()].sort(), ['18,14:1'],
    'restore: та же двусторонняя обрезка');
  for (const junk of ['junk', 42, null, undefined, [1, 2]]) {
    assert.equal(D.restoreDungeonMemory(junk, 7, 3).size, 0,
      'non-object ' + String(junk) + ' → пустой Map, без исключений');
  }
});

// ====================================================================
// 000153.02: генерация этажа — W(depth), уровни мобов, лут,
// stairs-down (12 RED + 1 guard).
// Контракты: memory/000153.02-floor-generation.md §2 (D1–D14),
// тестовая карта — §6. depth>1: W = min(63, round(base·1.1^(depth−1)))
// (СТОРОНА ×1.1/этаж), уровни групп = player.level + (depth−1) ± δ
// (босс ABYSS = +δ+(depth−1)), сундуки +1/этаж, gold — по эффективному
// уровню, stairs-down — детерминированное размещение БЕЗ rng (поле
// ФОРМЫ из createDungeon; читает 000153.03). depth=1 — БИТ-В-БИТ:
// формулы свёрнуты при (depth−1)=0, существующие goldens проходят
// без правок (ST-4 — гард контракта).
// Протокол красной стадии: падают ТОЧНО 12 (SZ-1/2, LV-1/2, LT-1/2,
// G2-1/2, ST-1..4) — осмысленные assertion-fail (нет
// DUNGEON_SIZE_CAP/dungeonSizeFor/STAIRS_SALT/stairsDownFor, W не
// растёт, уровни/лут без сдвига, d.stairsDown undefined). SZ-3 —
// guard перформанса на cap, зелёный с рождения.
// Contents G2-1/G2-2 — значения снимают с рабочего кода на стадии
// реализации (практика 000058/000070) + re-verify node; chest-
// контент — перезахват (формула D3). Shape-пины предвычислены
// репликой createDungeon+W(depth) (/tmp/thegame-wf-000153.02/
// replica.js — сверена с depth=1 goldens master побайтово, fails: 0).
// ====================================================================

// cells CAVE (37,−12) depth=2 28×28 — предвычислено репликой
// (W(d2)=round(25·1.1)=28; seed 3912048804 — пин 000153.01).
const G2_CELLS =
  '0000000000000000000000000000' +
  '0000000000000000000000000000' +
  '0000000000000000000000000000' +
  '0000000000000000000000000000' +
  '0000000000000000000000000000' +
  '0000000000000000000000000000' +
  '0000000000000000000000000000' +
  '0000000000000001111111000000' +
  '0000000000000001111111000000' +
  '0000000000000011111111000000' +
  '0000000000000011111111000000' +
  '0000000000001111111111000000' +
  '0000000000001011111111000000' +
  '0000000000001011111111000000' +
  '0000000000001000111000000000' +
  '0000000001111111111000000000' +
  '0000000001111111111000000000' +
  '0000000001111111111000000000' +
  '0000000001111111111110000000' +
  '0000000000111111111110000000' +
  '0000000000111111111110000000' +
  '0000000000111111111110000000' +
  '0000000000111111111110000000' +
  '0000000000111111111110000000' +
  '0000000000000111111110000000' +
  '0000000000000000000000000000' +
  '0000000000000000000000000000' +
  '0000000000000000000000000000';

// cells ABYSS (11,3) depth=2 39×39 — предвычислено репликой
// (W(d2)=round(35·1.1)=39; seed 792410970 — пин 000153.01).
const G22_CELLS =
  '000000000000000000000000000000000000000' +
  '000000000000000000000000000000000000000' +
  '000000000000000000000000000000000000000' +
  '000000000000000000000000000000000000000' +
  '000000000000000000000000000000000000000' +
  '000000000000000000000000000000000000000' +
  '000000000000000000000000000000000000000' +
  '000000000000000000000000000000000000000' +
  '000000000000000000000000000000000000000' +
  '000000000000000000000000000000000000000' +
  '000000000000000000000000000000000000000' +
  '000000000000000000000000000000000000000' +
  '000000000000000000000000000000000000000' +
  '000000000000000000000011111100000000000' +
  '000000000000000011111111111100000000000' +
  '000000000000000011111111111100000000000' +
  '000000000000000011111111111100000000000' +
  '000000000000000011111111010000000000000' +
  '000000000000000000001000010000000000000' +
  '000001111100000000001000010000000000000' +
  '000001111111111100001000010000000000000' +
  '000001111111111100001000010011111111000' +
  '000001111111111111111100010011111111000' +
  '000001111111111111111100010011111111000' +
  '000001111100011111111100010011111111000' +
  '000000011111111111111111111111111111000' +
  '000000011111111111111100000011111111000' +
  '000000000000011111111100000011111111000' +
  '000000000000011111111100000011111111000' +
  '000000000000011111111100000011111111000' +
  '000000000000000000000000000000000000000' +
  '000000000000000000000000000000000000000' +
  '000000000000000000000000000000000000000' +
  '000000000000000000000000000000000000000' +
  '000000000000000000000000000000000000000' +
  '000000000000000000000000000000000000000' +
  '000000000000000000000000000000000000000' +
  '000000000000000000000000000000000000000' +
  '000000000000000000000000000000000000000';

// W-таблицы (CAP=63), depth 1..12 — фиксация FP-окружения
// Math.round(base·1.1^(depth−1)) (half-up: 25·1.1=27.500…004→28,
// 35·1.1=38.5→39). Если V8 когда-либо поменяет FP-окружение —
// SZ-1 поймает (решение D1).
const W_TABLE = {
  [D.DUNGEON_TYPES.CAVE]: [25, 28, 30, 33, 37, 40, 44, 49, 54, 59, 63, 63],
  [D.DUNGEON_TYPES.CRYPT]: [27, 30, 33, 36, 40, 43, 48, 53, 58, 63, 63, 63],
  [D.DUNGEON_TYPES.RUINS]: [31, 34, 38, 41, 45, 50, 55, 60, 63, 63, 63, 63],
  [D.DUNGEON_TYPES.DROWNED]: [27, 30, 33, 36, 40, 43, 48, 53, 58, 63, 63, 63],
  [D.DUNGEON_TYPES.ABYSS]: [35, 39, 42, 47, 51, 56, 62, 63, 63, 63, 63, 63],
};

// Фиксированные входы по типам (те же, что в «размер лабиринта
// зависит от типа»): terrain/alpha → dungeonTypeFor.
const SIZE_ENTRIES = [
  [M.TERRAIN.GRASS, 255, D.DUNGEON_TYPES.CAVE],
  [M.TERRAIN.SWAMP, 255, D.DUNGEON_TYPES.DROWNED],
  [M.TERRAIN.FOREST, 255, D.DUNGEON_TYPES.CRYPT],
  [M.TERRAIN.HILL, 255, D.DUNGEON_TYPES.RUINS],
  [M.TERRAIN.HILL, 10, D.DUNGEON_TYPES.ABYSS],
];

test('SZ-1: W(depth) = min(CAP, round(base·1.1^(depth−1))) — 5 типов × depth 1..12 (000153.02, RED)', () => {
  assert.equal(D.DUNGEON_SIZE_CAP, 63,
    'DUNGEON_SIZE_CAP = 63 (максимум схемы «размер» 5..63; рост ТОЛЬКО в коде)');
  assert.equal(typeof D.dungeonSizeFor, 'function',
    'экспорт dungeonSizeFor(base, depth)');
  // dungeonSizeFor — чистая функция; depth=1 → base бит-в-бит.
  for (let depth = 1; depth <= 12; depth++) {
    assert.equal(D.dungeonSizeFor(25, depth),
      Math.min(Math.round(25 * Math.pow(1.1, depth - 1)), D.DUNGEON_SIZE_CAP),
      'dungeonSizeFor(25, ' + depth + ')');
  }
  // createDungeon: width = height = W(depth) — W-таблицы.
  for (const [terrain, alpha, type] of SIZE_ENTRIES) {
    const px = M.syntheticPixels(8, 8, 128, 128, 128, alpha);
    for (let depth = 1; depth <= 12; depth++) {
      const d = D.createDungeon(5, 5, px, terrain, depth);
      assert.equal(d.width, W_TABLE[type][depth - 1],
        type + ' d' + depth + ': W (таблица)');
      assert.equal(d.width,
        Math.min(Math.round(D.DUNGEON_SIZE[type] * Math.pow(1.1, depth - 1)),
          D.DUNGEON_SIZE_CAP),
        type + ' d' + depth + ': W (формула)');
      assert.equal(d.height, d.width, type + ' d' + depth + ': H = W');
    }
  }
});

test('SZ-2: W — рост ≈1.1×/этаж, W ≤ CAP (depth 1..40), плато на cap (000153.02, RED)', () => {
  const CAP = D.DUNGEON_SIZE_CAP;
  assert.ok(Number.isInteger(CAP) && CAP >= 63, 'DUNGEON_SIZE_CAP (целое, ≥ 63)');
  for (const [terrain, alpha, type] of SIZE_ENTRIES) {
    const px = M.syntheticPixels(8, 8, 128, 128, 128, alpha);
    let prev = 0;
    for (let depth = 1; depth <= 40; depth++) {
      const w = D.createDungeon(5, 5, px, terrain, depth).width;
      assert.ok(w <= CAP, type + ' d' + depth + ': W=' + w + ' ≤ CAP');
      if (depth > 1 && prev < CAP && w < CAP) {
        // До срабатывания cap: W(d) = round(base·1.1^(d−1)) →
        // рост ≈1.1× (шум округления ≤ 1 к round(prev·1.1)).
        assert.ok(w >= prev, type + ' d' + depth + ': W неубывает');
        assert.ok(Math.abs(w - Math.round(prev * 1.1)) <= 1,
          type + ' d' + depth + ': W=' + w +
          ' vs round(prev·1.1)=' + Math.round(prev * 1.1) + ' (рост ≈1.1×)');
      }
      prev = w;
    }
  }
  // Плато на cap (W-таблицы): ABYSS d8..d10 = 63, RUINS d9..d11 = 63.
  for (let depth = 8; depth <= 10; depth++) {
    assert.equal(
      D.createDungeon(5, 5, M.syntheticPixels(8, 8, 128, 128, 128, 10),
        M.TERRAIN.HILL, depth).width,
      CAP, 'ABYSS d' + depth + ' = CAP');
  }
  for (let depth = 9; depth <= 11; depth++) {
    assert.equal(
      D.createDungeon(5, 5, M.syntheticPixels(8, 8, 128, 128, 128, 255),
        M.TERRAIN.HILL, depth).width,
      CAP, 'RUINS d' + depth + ' = CAP');
  }
});

test('SZ-3: перформанс: генерация на cap (ABYSS d8, W=63) в бюджете < 5000 мс (000153.02, guard)', () => {
  // Паттерн map.test.js (тёплый прогон, бюджет 5000 мс): замерено
  // ~3 мс/генерацию на W=63 (N=30) — запас >5×; флейк-риск под
  // нагрузкой — перепуск, не дефект.
  const px = M.syntheticPixels(8, 8, 40, 40, 40, 10);
  const warm = D.createDungeon(11, 3, px, M.TERRAIN.MOUNTAIN, 8);
  D.generateDungeonContents(warm, heroAt(2000, 10));
  D.reachableFrom(warm, warm.entrance.x, warm.entrance.y); // прогрев
  const t0 = Date.now();
  const d = D.createDungeon(11, 3, px, M.TERRAIN.MOUNTAIN, 8);
  D.generateDungeonContents(d, heroAt(2000, 10));
  D.reachableFrom(d, d.entrance.x, d.entrance.y);
  const ms = Date.now() - t0;
  assert.ok(ms < 5000,
    'ABYSS d8 (W на cap) за ' + ms + ' мс — превышен бюджет 5000 мс');
});

test('LV-1: уровни групп depth>1 = player.level + (depth−1) ± δ (000153.02, RED)', () => {
  // depth=8: новый интервал [lvl+4, lvl+10] НЕ СЕКРЕЩИВАЕТСЯ со
  // старым [lvl−3, lvl+3] (δ=3, d−1=7) — свойство не-ваккуумно.
  const depth = 8;
  for (const lvl of [5, 20, 40]) {
    const d = D.createDungeon(37, -12, PX, M.TERRAIN.GRASS, depth);
    const c = D.generateDungeonContents(d, heroAt(500 * lvl, lvl));
    const lo = lvl + (depth - 1) - D.LEVEL_DELTA_MAX;
    const hi = lvl + (depth - 1) + D.LEVEL_DELTA_MAX;
    for (const m of c.mobs) {
      assert.ok(m.level >= lo && m.level <= hi,
        'd' + depth + ' lvl' + lvl + ': m.level ' + m.level
        + ' вне [' + lo + ',' + hi + ']');
    }
  }
});

test('LV-2: босс ABYSS depth>1 = max(1, player.level + δ + (depth−1)) — точно (000153.02, RED)', () => {
  const px = M.syntheticPixels(8, 8, 40, 40, 40, 10);
  for (const depth of [2, 10]) {
    const d = D.createDungeon(11, 3, px, M.TERRAIN.MOUNTAIN, depth);
    assert.equal(d.type, D.DUNGEON_TYPES.ABYSS, 'ABYSS');
    for (const lvl of [1, 10, 25]) {
      const c = D.generateDungeonContents(d, heroAt(500 * lvl, lvl));
      const boss = c.mobs.find((m) => m.boss);
      assert.ok(boss, 'ABYSS: нет босса');
      assert.equal(boss.level, Math.max(1, lvl + D.LEVEL_DELTA_MAX + (depth - 1)),
        'd' + depth + ' lvl' + lvl + ': boss.level');
    }
  }
});

test('LT-1: кол-во сундуков растёт с глубиной: ≥ depth=1, монотонно (000153.02, RED)', () => {
  // (a) per-instance диапазон d=1..5 (D3: 2+floor(rng·4)+(d−1) →
  //     [d+1, d+4] ⊂ [2, 5+(d−1)]).
  for (let depth = 1; depth <= 5; depth++) {
    const d = D.createDungeon(37, -12, PX, M.TERRAIN.GRASS, depth);
    for (const xp of [1, 777, 4321]) {
      const c = D.generateDungeonContents(d, heroAt(xp));
      assert.ok(c.chests.length >= 2,
        'd' + depth + ' xp' + xp + ': сундуки ≥ 2');
      assert.ok(c.chests.length <= 5 + (depth - 1),
        'd' + depth + ' xp' + xp + ': сундуки ≤ ' + (5 + depth - 1));
    }
  }
  // (b) РОСТ: свип xp 1..1000 на d=5 → observed max ≥ 6
  //     (max старой формулы = 5 — красный сигнал).
  const d5 = D.createDungeon(37, -12, PX, M.TERRAIN.GRASS, 5);
  let maxD5 = 0;
  for (let xp = 1; xp <= 1000; xp++) {
    const n = D.generateDungeonContents(d5, heroAt(xp)).chests.length;
    if (n > maxD5) maxD5 = n;
  }
  assert.ok(maxD5 >= 6,
    'd5 свип xp1..1000: observed max ' + maxD5 + ' ≥ 6 (старый max = 5)');
  // (c) d=1: старая формула бит-в-бит → observed max = 5 (регрессия).
  const d1 = D.createDungeon(37, -12, PX, M.TERRAIN.GRASS);
  let maxD1 = 0;
  for (let xp = 1; xp <= 1000; xp++) {
    const n = D.generateDungeonContents(d1, heroAt(xp)).chests.length;
    if (n > maxD1) maxD1 = n;
  }
  assert.equal(maxD1, 5,
    'd1 свип xp1..1000: observed max = 5 (старая формула, бит-в-бит)');
});

test('LT-2: gold depth>1 = round(10 + rng·20·(1 + 0.2·(lvl+(depth−1)))): диапазон + рост (000153.02, RED)', () => {
  // (a) per-instance: 10 ≤ gold ≤ round(30·(1 + 0.2·effLevel))
  //     (верх формулы 10+20·(1+0.2·eff) ≤ 30·(1+0.2·eff)); d=1 —
  //     старый диапазон бит-в-бит.
  for (const [depth, lvl] of [[1, 1], [3, 5], [10, 1]]) {
    const d = D.createDungeon(37, -12, PX, M.TERRAIN.GRASS, depth);
    for (const xp of [1, 777, 4321]) {
      const c = D.generateDungeonContents(d, heroAt(xp, lvl));
      const gmax = Math.round(30 * (1 + 0.2 * (lvl + depth - 1)));
      for (const ch of c.chests) {
        assert.ok(ch.gold >= 10 && ch.gold <= gmax,
          'd' + depth + ' lvl' + lvl + ' xp' + xp + ': gold '
          + ch.gold + ' вне [10,' + gmax + ']');
      }
    }
  }
  // (b) РОСТ: свип (lvl=1, d=10) xp 1..1000 → observed max > 34
  //     (старый max при lvl=1 = round(10+20·1.2) = 34 — красный сигнал).
  const d10 = D.createDungeon(37, -12, PX, M.TERRAIN.GRASS, 10);
  let maxGold = 0;
  for (let xp = 1; xp <= 1000; xp++) {
    for (const ch of D.generateDungeonContents(d10, heroAt(xp, 1)).chests)
      if (ch.gold > maxGold) maxGold = ch.gold;
  }
  assert.ok(maxGold > 34,
    'd10 lvl1 свип xp1..1000: observed max ' + maxGold
    + ' > 34 (старый max = 34)');
});

test('G2-1: golden: CAVE (37,−12) depth=2 — полный детерминированный снапшот (000153.02, RED)', () => {
  const a = D.createDungeon(37, -12, PX, M.TERRAIN.GRASS, 2);
  const b = D.createDungeon(37, -12, PX, M.TERRAIN.GRASS, 2);
  assert.equal(a.depth, 2, 'd.depth = 2');
  assert.equal(a.seed, 3912048804,
    'depth2 seed (пин 000153.01 — формула сида .02 НЕ меняет)');
  assert.equal(a.seed, b.seed, 'детерминизм: seed');
  // W(depth): CAVE d2 = round(25·1.1) = 28 (сторона ×1.1/этаж).
  assert.equal(a.width, 28, 'depth2 W (25→28)');
  assert.equal(a.height, 28, 'depth2 H');
  assert.deepEqual(a.rooms, [
    { x: 9, y: 15, w: 9, h: 4, cx: 13, cy: 17 },
    { x: 15, y: 18, w: 6, h: 7, cx: 18, cy: 21 },
    { x: 14, y: 9, w: 7, h: 5, cx: 17, cy: 11 },
    { x: 13, y: 19, w: 6, h: 6, cx: 16, cy: 22 },
    { x: 15, y: 8, w: 7, h: 6, cx: 18, cy: 11 },
    { x: 10, y: 19, w: 4, h: 5, cx: 12, cy: 21 },
    { x: 15, y: 7, w: 7, h: 7, cx: 18, cy: 10 },
  ], 'depth2 rooms (7)');
  assert.deepEqual(a.entrance, { x: 13, y: 17 }, 'depth2 entrance');
  assert.deepEqual(a.exit, a.entrance, 'exit = entrance (000177)');
  assert.equal(a.cells.join(''), G2_CELLS,
    'depth2 cells-стринг (784 симв., pinned)');
  assert.equal(a.wallObjs.length, 75, 'depth2 wallObjs');
  assert.deepEqual(
    D.reachableFrom(a, a.entrance.x, a.entrance.y), floorSet(a),
    'все напольные клетки достижимы от входа');
  // stairs-down — поле ФОРМЫ (createDungeon), детерминировано.
  assert.deepEqual(a.stairsDown, { x: 21, y: 7 }, 'depth2 stairsDown (pinned)');
  assert.deepEqual(a.stairsDown, b.stairsDown, 'детерминизм: stairsDown');
  // Contents: heroAt(1234, 10) — ПО-ПОЛЕВОМУ deepEqual (устойчивость
  // к аддитивным полям других задач, напр. deposits от 000157.02).
  const c = D.generateDungeonContents(a, heroAt(1234, 10));
  assert.equal(c.seed, 3649620488, 'contents seed (pinned)');
  // heroAt(1234, 10): effLevel = 10 + (2−1) = 11; группы ∈ [11−3, 11+3];
  // сундуки: 2+floor(rng·4)+(2−1) ∈ [3, 6]; снято с рабочего кода
  // (зелёная стадия, node-ре-верификация; chest-контент — D3).
  assert.deepEqual(c.mobs, [
    { id: 'g0', mobIds: ['ant', 'giant_larva', 'ant'], x: 17, y: 17, level: 13, defeated: false },
    { id: 'g1', mobIds: ['ant', 'crawling_bones'], x: 16, y: 13, level: 13, defeated: false },
    { id: 'g2', mobIds: ['ant', 'ant', 'skeleton'], x: 10, y: 17, level: 10, defeated: false },
    { id: 'g3', mobIds: ['crawling_bones'], x: 19, y: 12, level: 13, defeated: false },
  ], 'depth2 mobs (по-полевой пин)');
  assert.deepEqual(c.chests, [
    { id: 'c0', x: 17, y: 11, opened: false, gold: 51, item: null },
    { id: 'c1', x: 20, y: 13, opened: false, gold: 28, item: null },
    { id: 'c2', x: 14, y: 13, opened: false, gold: 12, item: 'stone_fist_grimoire' },
    { id: 'c3', x: 16, y: 12, opened: false, gold: 63, item: 'iron_sword' },
  ], 'depth2 chests (по-полевой пин)');
});

test('G2-2: golden: ABYSS (11,3) depth=2 — полный детерминированный снапшот + босс (000153.02, RED)', () => {
  const px = M.syntheticPixels(8, 8, 40, 40, 40, 10);
  const a = D.createDungeon(11, 3, px, M.TERRAIN.MOUNTAIN, 2);
  const b = D.createDungeon(11, 3, px, M.TERRAIN.MOUNTAIN, 2);
  assert.equal(a.depth, 2, 'd.depth = 2');
  assert.equal(a.seed, 792410970,
    'ABYSS depth2 seed (пин 000153.01 — формула сида .02 НЕ меняет)');
  assert.equal(a.seed, b.seed, 'детерминизм: seed');
  assert.equal(a.width, 39, 'depth2 W (35→39)');
  assert.equal(a.height, 39, 'depth2 H');
  assert.deepEqual(a.rooms, [
    { x: 13, y: 22, w: 9, h: 8, cx: 17, cy: 26 },
    { x: 5, y: 19, w: 5, h: 6, cx: 7, cy: 22 },
    { x: 28, y: 21, w: 8, h: 9, cx: 32, cy: 25 },
    { x: 22, y: 13, w: 6, h: 4, cx: 25, cy: 15 },
    { x: 16, y: 14, w: 8, h: 4, cx: 20, cy: 16 },
    { x: 10, y: 20, w: 6, h: 4, cx: 13, cy: 22 },
  ], 'depth2 rooms (6)');
  assert.deepEqual(a.entrance, { x: 17, y: 26 }, 'depth2 entrance');
  assert.equal(a.cells.join(''), G22_CELLS,
    'depth2 cells-стринг (1521 симв., pinned)');
  assert.equal(a.wallObjs.length, 156, 'depth2 wallObjs');
  assert.deepEqual(
    D.reachableFrom(a, a.entrance.x, a.entrance.y), floorSet(a),
    'все напольные клетки достижимы от входа');
  const far = a.rooms[a.rooms.length - 1];
  assert.deepEqual({ x: far.cx, y: far.cy }, { x: 13, y: 22 },
    'босс-клетка = rooms[last] (000183)');
  assert.deepEqual(a.stairsDown, { x: 35, y: 21 }, 'depth2 stairsDown (pinned)');
  assert.ok(a.stairsDown.x !== far.cx || a.stairsDown.y !== far.cy,
    'stairsDown ≠ босс-клетка');
  // Contents: heroAt(1234, 10): босс = 10 + δ + (2−1) = 14.
  const c = D.generateDungeonContents(a, heroAt(1234, 10));
  assert.equal(c.seed, 1514336718, 'contents seed (pinned)');
  const boss = c.mobs.find((m) => m.boss);
  assert.ok(boss, 'ABYSS: нет босса');
  assert.equal(boss.level, 14, 'boss.level = 10 + δ + (2−1) = 14');
  assert.equal(boss.x, far.cx, 'босс на rooms[last]');
  assert.equal(boss.y, far.cy, 'босс на rooms[last]');
  // heroAt(1234, 10): effLevel = 10 + (2−1) = 11; группы ∈ [11−3, 11+3];
  // босс = 11 + 3 = 14; сундуки: 2+floor(rng·4)+(2−1) ∈ [3, 6]; снято
  // с рабочего кода (зелёная стадия, node-ре-верификация; chest-контент
  // — D3).
  assert.deepEqual(c.mobs, [
    { id: 'g0', mobIds: ['succubus'], x: 6, y: 24, level: 11, defeated: false },
    { id: 'g1', mobIds: ['succubus', 'lower_demon', 'abomination'], x: 5, y: 24, level: 14, defeated: false },
    { id: 'g2', mobIds: ['succubus'], x: 33, y: 29, level: 14, defeated: false },
    { id: 'g3', mobIds: ['lower_demon'], x: 29, y: 26, level: 12, defeated: false },
    { id: 'boss', mobIds: ['abomination', 'lower_demon', 'lower_demon'], x: 13, y: 22, level: 14, defeated: false, boss: true },
  ], 'depth2 mobs (по-полевой пин)');
  assert.deepEqual(c.chests, [
    { id: 'c0', x: 11, y: 20, opened: false, gold: 68, item: null },
    { id: 'c1', x: 10, y: 21, opened: false, gold: 43, item: null },
    { id: 'c2', x: 20, y: 23, opened: false, gold: 64, item: null },
    { id: 'c3', x: 21, y: 29, opened: false, gold: 61, item: 'flame_burst_scroll' },
    { id: 'c4', x: 35, y: 28, opened: false, gold: 24, item: null },
  ], 'depth2 chests (по-полевой пин)');
});

test('ST-1: stairs-down: поле {x,y}, FLOOR, достижима, вне safe-зоны, детерминирована (000153.02, RED)', () => {
  assert.equal(D.STAIRS_SALT, 0x53d10d53, 'пин STAIRS_SALT = 0x53d10d53');
  // Уникальность соли: без коллизий с существующими (форма/глубина/
  // контент/wander/стены) и с in-flight 0x0DE5 (депозиты 000157.02).
  assert.ok(![0xd0d6b5e5, 0xd337b153, 0x5e11, 0x7777, 0x5e11c3a7,
    0x0c9f4b2d, 0x0DE5].includes(D.STAIRS_SALT),
    'STAIRS_SALT коллидирует с существующей солью');
  assert.equal(typeof D.stairsDownFor, 'function', 'экспорт stairsDownFor(d)');
  const px = M.syntheticPixels(8, 8, 40, 40, 40, 10);
  for (const [x, y, p, t] of [
    [37, -12, PX, M.TERRAIN.GRASS],
    [11, 3, px, M.TERRAIN.MOUNTAIN],
  ]) {
    for (const depth of [2, 5]) {
      const d = D.createDungeon(x, y, p, t, depth);
      const s = d.stairsDown;
      assert.ok(s && Number.isInteger(s.x) && Number.isInteger(s.y),
        '(' + x + ',' + y + ') d' + depth + ': d.stairsDown {x,y}');
      assert.equal(d.cells[s.y * d.width + s.x], D.CELL_FLOOR,
        '(' + x + ',' + y + ') d' + depth + ': stairsDown на FLOOR');
      const reach = D.reachableFrom(d, d.entrance.x, d.entrance.y);
      assert.ok(reach.has(s.x + ',' + s.y),
        '(' + x + ',' + y + ') d' + depth + ': stairsDown достижима от входа');
      // Вне 5×5 safe-зоны (entrance = exit — одна зона, 000177).
      assert.ok(Math.abs(s.x - d.entrance.x) > 2 || Math.abs(s.y - d.entrance.y) > 2,
        '(' + x + ',' + y + ') d' + depth + ': stairsDown вне 5×5 safe-зоны');
      const e = D.createDungeon(x, y, p, t, depth);
      assert.deepEqual(e.stairsDown, s,
        '(' + x + ',' + y + ') d' + depth + ': детерминизм: stairsDown');
    }
  }
});

test('ST-2: stairs-down ABYSS: НЕ на клетке босса (rooms[last]) — свип d2..6 (000153.02, RED)', () => {
  // Анти-ваккуум (паттерн D-BOSS-1): инвариант сверяется на всём
  // контенте этажа, хотя размещение — поле ФОРМЫ (0 rng в
  // createDungeon) — гард против регрессии к placement, зависящей
  // от контента.
  const px = M.syntheticPixels(8, 8, 40, 40, 40, 10);
  for (let depth = 2; depth <= 6; depth++) {
    const d = D.createDungeon(11, 3, px, M.TERRAIN.MOUNTAIN, depth);
    assert.equal(d.type, D.DUNGEON_TYPES.ABYSS, 'ABYSS');
    assert.ok(d.stairsDown, 'd' + depth + ': нет d.stairsDown');
    const far = d.rooms[d.rooms.length - 1];
    for (let xp = 1; xp <= 200; xp++) {
      const c = D.generateDungeonContents(d, heroAt(xp));
      const boss = c.mobs.find((m) => m.boss);
      assert.ok(boss, 'd' + depth + ' xp' + xp + ': босс присутствует');
      assert.deepEqual({ x: boss.x, y: boss.y }, { x: far.cx, y: far.cy },
        'd' + depth + ' xp' + xp + ': босс — на клетке дальней комнаты');
      assert.ok(d.stairsDown.x !== boss.x || d.stairsDown.y !== boss.y,
        'd' + depth + ' xp' + xp + ': stairsDown на клетке босса');
    }
  }
});

test('ST-3: stairs-down: контент depth>1 НЕ на клетке спуска (safe расширен на 5×5) — свип (000153.02, RED)', () => {
  const px = M.syntheticPixels(8, 8, 40, 40, 40, 10);
  for (const [x, y, p, t] of [
    [37, -12, PX, M.TERRAIN.GRASS],
    [11, 3, px, M.TERRAIN.MOUNTAIN],
  ]) {
    for (let depth = 2; depth <= 4; depth++) {
      const d = D.createDungeon(x, y, p, t, depth);
      const s = d.stairsDown;
      assert.ok(s, '(' + x + ',' + y + ') d' + depth + ': нет d.stairsDown');
      for (let xp = 1; xp <= 300; xp++) {
        const c = D.generateDungeonContents(d, heroAt(xp));
        for (const m of c.mobs) {
          if (m.boss) continue; // босс-клетка — как есть (000183: occupied)
          assert.ok(Math.abs(m.x - s.x) > 2 || Math.abs(m.y - s.y) > 2,
            '(' + x + ',' + y + ') d' + depth + ' xp' + xp
            + ': группа ' + m.id + ' в 5×5 вокруг клетки спуска');
        }
        for (const ch of c.chests) {
          assert.ok(Math.abs(ch.x - s.x) > 2 || Math.abs(ch.y - s.y) > 2,
            '(' + x + ',' + y + ') d' + depth + ' xp' + xp
            + ': сундук ' + ch.id + ' в 5×5 вокруг клетки спуска');
        }
      }
    }
  }
});

test('ST-4: stairs-down depth=1: размещение валидно, контент depth=1 НЕ сдвинут (000153.02, RED)', () => {
  // Поле ЕСТЬ на depth=1 (решение D5: 000153.03 читает d.stairsDown
  // на всех глубинах). Размещение — те же инварианты; РАСШИРЕНИЕ
  // safe на stairsDown — ТОЛЬКО depth>1 (if d.depth > 1) → контент
  // depth=1 БИТ-В-БИТ (ниже — явный deepEqual против golden :295-304 —
  // КЛЮЧЕВАЯ защита контракта).
  const d = D.createDungeon(37, -12, PX, M.TERRAIN.GRASS);
  const s = d.stairsDown;
  assert.ok(s && Number.isInteger(s.x) && Number.isInteger(s.y),
    'CAVE d1: d.stairsDown {x,y}');
  assert.equal(d.cells[s.y * d.width + s.x], D.CELL_FLOOR, 'CAVE d1: FLOOR');
  assert.ok(D.reachableFrom(d, d.entrance.x, d.entrance.y).has(s.x + ',' + s.y),
    'CAVE d1: достижима от входа');
  assert.ok(Math.abs(s.x - d.entrance.x) > 2 || Math.abs(s.y - d.entrance.y) > 2,
    'CAVE d1: вне 5×5 safe-зоны');
  const px = M.syntheticPixels(8, 8, 40, 40, 40, 10);
  const a = D.createDungeon(11, 3, px, M.TERRAIN.MOUNTAIN);
  const sa = a.stairsDown;
  assert.ok(sa && Number.isInteger(sa.x) && Number.isInteger(sa.y),
    'ABYSS d1: d.stairsDown {x,y}');
  assert.equal(a.cells[sa.y * a.width + sa.x], D.CELL_FLOOR, 'ABYSS d1: FLOOR');
  assert.ok(D.reachableFrom(a, a.entrance.x, a.entrance.y).has(sa.x + ',' + sa.y),
    'ABYSS d1: достижима от входа');
  assert.ok(Math.abs(sa.x - a.entrance.x) > 2 || Math.abs(sa.y - a.entrance.y) > 2,
    'ABYSS d1: вне 5×5 safe-зоны');
  const far = a.rooms[a.rooms.length - 1];
  assert.ok(sa.x !== far.cx || sa.y !== far.cy,
    'ABYSS d1: ≠ босс-клетка (' + far.cx + ',' + far.cy + ')');
  const c = D.generateDungeonContents(a, heroAt(2000, 10));
  assert.deepEqual(c.mobs, [
    { id: 'g0', mobIds: ['lower_demon', 'lower_demon'], x: 15, y: 4, level: 12, defeated: false },
    { id: 'g1', mobIds: ['lower_demon', 'succubus', 'lower_demon'], x: 11, y: 5, level: 7, defeated: false },
    { id: 'g2', mobIds: ['abomination', 'succubus'], x: 13, y: 9, level: 7, defeated: false },
    { id: 'boss', mobIds: ['abomination', 'lower_demon', 'lower_demon'], x: 14, y: 6, level: 13, defeated: false, boss: true },
  ], 'ABYSS d1 mobs = существующий golden (бит-в-бит)');
  assert.deepEqual(c.chests, [
    { id: 'c0', x: 20, y: 11, opened: false, gold: 63, item: null },
    { id: 'c1', x: 7, y: 8, opened: false, gold: 58, item: 'phoenix_feather' },
  ], 'ABYSS d1 chests = существующий golden (бит-в-бит)');
});

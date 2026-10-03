// Layout города (задача 000104, дочерняя 000052 «Города и деревни»).
//
// src/cities.js — НОВЫЙ чистый модуль (без DOM, без totalXp):
// детерминированный dungeon-совместимый layout города.
//   createCityLayout(cityX, cityY, footprint) →
//   { width, height, cells, entrance:{x,y}, exit:{x,y}, seed,
//     kind: 'city' }
//
// Зафиксированные решения (memory/000104-cities-layout.md; золотые
// пины — литералы GOLDEN_ ниже):
//  * внутренний размер = footprint × 2 УНИФОРМНО: 1→2x2, 2→4x4,
//    5→10x10, 7→14x14. Хутор (footprint 1) — вырожденный 2x2: всего
//    4 клетки периметра, внутренности НЕТ (000102: хутор «без
//    внутренностей», мин_постройки=0);
//  * периметр = CELL_WALL (0), внутренность — сплошное открытое
//    пространство CELL_FLOOR (1): город НЕ лабиринт («улицы/
//    кварталы» по умолчанию не делаются; постройки 000106 кладёт
//    на FLOOR);
//  * entrance — ЮЖНЫЙ периметр (y = height−1), exit — СЕВЕРНЫЙ
//    (y = 0); x — колонны 1..width−2 через rng(mulberry32(seed))
//    (при width=2 оба x=0 — клетки смежные). «Сторона захода героя»
//    НЕ передаётся: layout статичен (один якорь → один layout
//    навсегда); направление захода — проблема экрана 000105;
//  * seed = hash2(cityX, cityY, CITY_LAYOUT_CONST) >>> 0,
//    CITY_LAYOUT_CONST = 0x4c41594f — НОВАЯ соль (НЕ GLOBAL_SEED,
//    НЕ CITY_SEED_CONST, не сиды dungeon.js): смена константы =
//    смена всех городов — недопустима после мержа (golden-пин);
//  * форма layout ровно поля из задачи: БЕЗ type/rooms/wallObjs
//    (город — НЕ тип подземелья; 000105 переиспользует
//    dungeonState и читает city-shape, 000106 — содержимое).
//
// STADIA KRASNYKH TESTOV (TDD): модуля src/cities.js ещё НЕТ —
// тесты ниже падают до реализации. Ленивый require: отсутствие
// модуля не ломает загрузку этого файла (паттерн 000046).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const CITIES_PATH = path.join(ROOT, 'src', 'cities.js');
const P = require('../src/perlin.js');
const D = require('../src/dungeon.js');
const M = require('../src/map.js');
// 000108: городские лавки — обёртка СУЩЕСТВУЮЩЕЙ торговли
// (items.js — makeShop/buyItem/sellPrice..., buildings.js — каталог
// id → map_index; player.js — персонаж для buy/sell-тестов).
// Эти модули в node чистые (тестируются в node) — require здесь
// не тянет cities.js (циклического require нет).
const I = require('../src/items.js');
const B = require('../src/buildings.js');
const PL = require('../src/player.js');

function loadCities() { return require('../src/cities.js'); }

// Якоря: реальные городские из ре-пинов 000103 (tests/map.test.js
// GOLDEN_TILES: хутор 51 — (-119,-104) и (-118,33); деревня 52 —
// (-114,-119)); для 5x5/7x7 — фикс. произвольные (layout НЕ зависит
// от map.png и террейна).
const ANCHORS = [
  { fp: 1, x: -119, y: -104 },
  { fp: 1, x: -118, y: 33 },
  { fp: 2, x: -114, y: -119 },
  { fp: 5, x: 100, y: -40 },
  { fp: 5, x: 101, y: -40 },
  { fp: 7, x: -37, y: 21 },
];

// --- GOLDEN-пины: литералы зафиксированной формулы ---
// (hash2 + mulberry32, CITY_LAYOUT_CONST = 0x4c41594f, размер
// footprint×2, вход юг / выход север, x из rng по колоннам
// 1..W−2, W=2 → x=0). Любое отклонение формулы (соль, порядок
// вызовов rng, стороны) ломает пины. Строки — по строкам layout.
const GOLDEN = {
  '1,-119,-104': {
    width: 2, height: 2,
    // 2x2: все клетки — периметр; FLOOR = только вход/выход.
    cells: [
      1, 0,
      1, 0,
    ],
    entrance: { x: 0, y: 1 }, exit: { x: 0, y: 0 },
    seed: 2891528378, kind: 'city',
  },
  '1,-118,33': {
    width: 2, height: 2,
    cells: [
      1, 0,
      1, 0,
    ],
    entrance: { x: 0, y: 1 }, exit: { x: 0, y: 0 },
    seed: 2117505400, kind: 'city',
  },
  '2,-114,-119': {
    width: 4, height: 4,
    cells: [
      0, 0, 1, 0,
      0, 1, 1, 0,
      0, 1, 1, 0,
      0, 0, 1, 0,
    ],
    entrance: { x: 2, y: 3 }, exit: { x: 2, y: 0 },
    seed: 39464456, kind: 'city',
  },
  '5,100,-40': {
    width: 10, height: 10,
    cells: [
      0, 0, 0, 0, 0, 0, 0, 1, 0, 0,
      0, 1, 1, 1, 1, 1, 1, 1, 1, 0,
      0, 1, 1, 1, 1, 1, 1, 1, 1, 0,
      0, 1, 1, 1, 1, 1, 1, 1, 1, 0,
      0, 1, 1, 1, 1, 1, 1, 1, 1, 0,
      0, 1, 1, 1, 1, 1, 1, 1, 1, 0,
      0, 1, 1, 1, 1, 1, 1, 1, 1, 0,
      0, 1, 1, 1, 1, 1, 1, 1, 1, 0,
      0, 1, 1, 1, 1, 1, 1, 1, 1, 0,
      0, 0, 0, 0, 0, 0, 0, 1, 0, 0,
    ],
    entrance: { x: 7, y: 9 }, exit: { x: 7, y: 0 },
    seed: 3580905026, kind: 'city',
  },
  '5,101,-40': {
    width: 10, height: 10,
    cells: [
      0, 0, 0, 1, 0, 0, 0, 0, 0, 0,
      0, 1, 1, 1, 1, 1, 1, 1, 1, 0,
      0, 1, 1, 1, 1, 1, 1, 1, 1, 0,
      0, 1, 1, 1, 1, 1, 1, 1, 1, 0,
      0, 1, 1, 1, 1, 1, 1, 1, 1, 0,
      0, 1, 1, 1, 1, 1, 1, 1, 1, 0,
      0, 1, 1, 1, 1, 1, 1, 1, 1, 0,
      0, 1, 1, 1, 1, 1, 1, 1, 1, 0,
      0, 1, 1, 1, 1, 1, 1, 1, 1, 0,
      0, 0, 0, 0, 0, 1, 0, 0, 0, 0,
    ],
    entrance: { x: 5, y: 9 }, exit: { x: 3, y: 0 },
    seed: 2388422751, kind: 'city',
  },
  '7,-37,21': {
    width: 14, height: 14,
    cells: [
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0,
      0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0,
      0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0,
      0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0,
      0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0,
      0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0,
      0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0,
      0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0,
      0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0,
      0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0,
      0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0,
      0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0,
      0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0,
    ],
    entrance: { x: 9, y: 13 }, exit: { x: 10, y: 0 },
    seed: 1313675484, kind: 'city',
  },
};

// --- API и структура модуля ---

test('модуль существует и даёт API (node, без DOM)', () => {
  const C = loadCities();
  assert.equal(typeof C.createCityLayout, 'function',
    'createCityLayout(cityX, cityY, footprint)');
  assert.equal(C.CELL_WALL, 0, 'CELL_WALL = 0 (значение dungeon.js)');
  assert.equal(C.CELL_FLOOR, 1, 'CELL_FLOOR = 1 (значение dungeon.js)');
  assert.equal(typeof C.CITY_LAYOUT_CONST, 'number',
    'CITY_LAYOUT_CONST — зафиксированная соль');
  assert.equal(typeof C.cityLayoutSize, 'function',
    'cityLayoutSize(footprint) — расшириемый экспорт для 000105/000106');
  assert.equal(typeof C.cityLayoutSeed, 'function',
    'cityLayoutSeed(cityX, cityY) — расшириемый экспорт для 000105/000106');
});

test('структура исходника: require — ТОЛЬКО ./perlin.js + ./items.js + ./buildings.js (000108; взаимных require в момент загрузки нет)', () => {
  // 000104: cities.js не тянет dungeon.js/map.js (цепочки vm-
  // песочниц tests/dungeon-ui.test.js и tests/sprites.test.js
  // грузят подмножества БЕЗ cities.js — проверено grep; прецедент
  // 000064). 000108 (осознанное расширение, memory/000108-city-
  // shops.md): makeCityShop вызывает СУЩЕСТВУЮЩИЙ items.makeShop и
  // читает каталог (buildingId → особые_параметры.map_index),
  // поэтому node-ветка требует ./items.js и ./buildings.js (оба
  // чистые в node; ни один из них НЕ требует cities.js — цикла нет).
  // Браузерная ветка ничего НЕ требует при ЗАГРУЗКЕ — референсы
  // ленивые (root.Game в момент вызова), поэтому порядок скриптов
  // index.html не становится скрытой зависимостью (items.js 391 и
  // buildings.js 392 и так раньше cities.js 402).
  const src = fs.readFileSync(CITIES_PATH, 'utf8');
  const reqs = [...src.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)]
    .map((m) => m[1]);
  assert.deepEqual(reqs, ['./perlin.js', './items.js', './buildings.js'],
    'cities.js обязан требовать только perlin.js, items.js, buildings.js');
});

test('dungeon-совместимость: CELL_WALL/CELL_FLOOR РАВНЫ значениям dungeon.js', () => {
  // Константы переопределены в cities.js (взаимный require невозможен)
  // — равенство закреплено, иначе «dungeon-совместимые» клетки могут
  // молча разъехаться и сломать отрисовку 000105, читающий 0/1.
  const C = loadCities();
  assert.equal(C.CELL_WALL, D.CELL_WALL,
    'CELL_WALL cities.js = CELL_WALL dungeon.js');
  assert.equal(C.CELL_FLOOR, D.CELL_FLOOR,
    'CELL_FLOOR cities.js = CELL_FLOOR dungeon.js');
});

test('CITY_LAYOUT_CONST: зафиксирован (0x4c41594f), новая соль — НЕ GLOBAL_SEED и НЕ CITY_SEED_CONST', () => {
  const C = loadCities();
  assert.equal(C.CITY_LAYOUT_CONST, 0x4c41594f,
    'golden-пин константы: смена = смена ВСЕХ городов');
  assert.notEqual(C.CITY_LAYOUT_CONST, M.GLOBAL_SEED,
    'НЕ слотовый сид (hash2 % 13)');
  assert.notEqual(C.CITY_LAYOUT_CONST, M.CITY_SEED_CONST,
    'НЕ сид типа города (000103)');
});

test('seed = hash2(cityX, cityY, CITY_LAYOUT_CONST) >>> 0 (от позиции, НЕ totalXp/террейн)', () => {
  const C = loadCities();
  for (const a of [[-119, -104], [100, -40], [-37, 21]]) {
    assert.equal(C.createCityLayout(a[0], a[1], 2).seed,
      (P.hash2(a[0], a[1], C.CITY_LAYOUT_CONST) >>> 0),
      `якорь (${a[0]},${a[1]})`);
  }
});

test('layout НЕ зависит от «опыта»: у createCityLayout ровно 3 параметра', () => {
  assert.equal(loadCities().createCityLayout.length, 3,
    'createCityLayout(cityX, cityY, footprint) — больше параметров нет');
});

test('форма layout: ровно поля из задачи (БЕЗ type/rooms/wallObjs)', () => {
  // 000105 переиспользует dungeonState: у города нет dungeon-
  // полей type/rooms/wallObjs (город — НЕ тип подземелья) —
  // точный city-shape зафиксирован, чтобы 000105 не получил
  // undefined-имя/фон.
  const C = loadCities();
  const L = C.createCityLayout(100, -40, 5);
  assert.deepEqual(Object.keys(L).sort(),
    ['cells', 'entrance', 'exit', 'height', 'kind', 'seed', 'width'],
    'ровно 7 полей, без type/rooms/wallObjs');
  assert.equal(L.kind, 'city', 'kind — маркер для 000105');
  assert.ok(Number.isInteger(L.seed) && L.seed >= 0 && L.seed < 2 ** 32,
    'seed — unsigned 32-bit');
});

// --- Размер и каталог (000102) ---

test('размер из footprint: footprint×2 униформно (таблица каталога 1→2, 2→4, 5→10, 7→14)', () => {
  const C = loadCities();
  for (const a of ANCHORS) {
    const L = C.createCityLayout(a.x, a.y, a.fp);
    assert.equal(L.width, a.fp * 2, `fp${a.fp} (${a.x},${a.y}): width`);
    assert.equal(L.height, a.fp * 2, `fp${a.fp} (${a.x},${a.y}): height`);
  }
  assert.equal(C.cityLayoutSize(1), 2);
  assert.equal(C.cityLayoutSize(2), 4);
  assert.equal(C.cityLayoutSize(5), 10);
  assert.equal(C.cityLayoutSize(7), 14);
});

test('ссылочная целостность: 4 типа «город» каталога 000102 → размеры footprint×2', () => {
  // Footprint берётся из РЕАЛЬНЫХ JSON каталога (размер.ширина —
  // сторона квадрата); 4 значения НЕ хардкодим — каталог может
  // добавлять новые размеры.
  const C = loadCities();
  const dir = path.join(ROOT, 'assets', 'buildings');
  const cities = fs.readdirSync(dir)
    .filter((f) => /^\d{6}\.json$/.test(f))
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')))
    .filter((b) => b.категория === 'город');
  assert.equal(cities.length, 4, 'каталог 000102: ровно 4 типа города');
  // Реальные якоря 000103, где известны (tests/map.test.js).
  const anchors = { 51: [-119, -104], 52: [-114, -119],
    53: [100, -40], 54: [-37, 21] };
  for (const b of cities) {
    assert.equal(b.размер.ширина, b.размер.высота,
      `город ${b.id}: footprint квадратный`);
    const [ax, ay] = anchors[b.id] || [0, 0];
    const L = C.createCityLayout(ax, ay, b.размер.ширина);
    assert.equal(L.width, b.размер.ширина * 2, `город ${b.id}`);
    assert.equal(L.height, b.размер.ширина * 2, `город ${b.id}`);
    assert.equal(L.kind, 'city', `город ${b.id}`);
  }
});

test('валидация: footprint — целое ≥ 1, иначе throw (новые размеры каталога разрешены)', () => {
  const C = loadCities();
  for (const bad of [0, -1, 2.5, '5', NaN, null, undefined]) {
    assert.throws(() => C.createCityLayout(100, -40, bad),
      `footprint=${String(bad)} обязан бросать`);
  }
  // Каталога размера нет ≠ запрет: любое целое ≥ 1 работает.
  const L = C.createCityLayout(0, 0, 13);
  assert.equal(L.width, 26);
  assert.equal(L.height, 26);
});

// --- Инварианты формы layout ---

test('периметр — стены, внутренность — открытое пространство (все 4 типа)', () => {
  const C = loadCities();
  for (const a of ANCHORS) {
    const L = C.createCityLayout(a.x, a.y, a.fp);
    const { width: W, height: H } = L;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const perim = x === 0 || y === 0 || x === W - 1 || y === H - 1;
        const isDoor = (x === L.entrance.x && y === L.entrance.y) ||
          (x === L.exit.x && y === L.exit.y);
        const expect = perim
          ? (isDoor ? C.CELL_FLOOR : C.CELL_WALL)
          : C.CELL_FLOOR;
        assert.equal(L.cells[y * W + x], expect,
          `fp${a.fp} (${a.x},${a.y}) клетка (${x},${y})`);
      }
    }
  }
});

test('вход — ЮГ (y = height−1), выход — СЕВЕР (y = 0); обе клетки FLOOR', () => {
  // Стороны зафиксированы (НЕ «сторона, с которой зашёл герой» —
  // направление захода — экран 000105; layout статичен).
  const C = loadCities();
  for (const a of ANCHORS) {
    const L = C.createCityLayout(a.x, a.y, a.fp);
    assert.equal(L.entrance.y, L.height - 1,
      `fp${a.fp} (${a.x},${a.y}): entrance — южный периметр`);
    assert.equal(L.exit.y, 0,
      `fp${a.fp} (${a.x},${a.y}): exit — северный периметр`);
    assert.equal(L.cells[L.entrance.y * L.width + L.entrance.x],
      C.CELL_FLOOR, 'entrance — FLOOR');
    assert.equal(L.cells[L.exit.y * L.width + L.exit.x],
      C.CELL_FLOOR, 'exit — FLOOR');
  }
});

test('dungeon-совместимость: BFS от входа обходит ВСЕ FLOOR-клетки (включая выход)', () => {
  // D.reachableFrom (src/dungeon.js) — потребитель dungeon-
  // совместимой структуры (паттерн tests/dungeon.test.js).
  const C = loadCities();
  for (const a of ANCHORS) {
    const L = C.createCityLayout(a.x, a.y, a.fp);
    const reach = D.reachableFrom(L, L.entrance.x, L.entrance.y);
    const floor = new Set();
    for (let y = 0; y < L.height; y++) {
      for (let x = 0; x < L.width; x++) {
        if (L.cells[y * L.width + x] === C.CELL_FLOOR)
          floor.add(x + ',' + y);
      }
    }
    assert.deepEqual(reach, floor,
      `fp${a.fp} (${a.x},${a.y}): не все FLOOR-клетки достижимы`);
    assert.ok(reach.has(L.exit.x + ',' + L.exit.y),
      `fp${a.fp} (${a.x},${a.y}): выход недостижим`);
  }
});

// --- Детерминизм и golden ---

test('детерминизм: тот же якорь → идентичный layout при повторных вызовах', () => {
  const C = loadCities();
  const a = C.createCityLayout(-114, -119, 2);
  const b = C.createCityLayout(-114, -119, 2);
  assert.deepEqual(a, b, 'весь объект (seed/cells/entrance/exit)');
});

test('golden: фикс. якорь → фикс. seed/entrance/exit/cells (закреплённые литералы)', () => {
  const C = loadCities();
  for (const key of Object.keys(GOLDEN)) {
    const [fp, x, y] = key.split(',').map(Number);
    assert.deepEqual(C.createCityLayout(x, y, fp), GOLDEN[key],
      `golden ${key}`);
  }
});

test('seed от позиции: разные якоря → разные seed (фикс. пары)', () => {
  const C = loadCities();
  assert.notEqual(
    C.createCityLayout(-119, -104, 1).seed,
    C.createCityLayout(-118, 33, 1).seed, 'fp1: пара якорей 000103');
  assert.notEqual(
    C.createCityLayout(100, -40, 5).seed,
    C.createCityLayout(101, -40, 5).seed, 'fp5: пара якорей');
});

test('разные якоря → разные layout (fp5, закреплённая пара)', () => {
  // Закреплённая пара (100,−40) / (101,−40): у golden различны И
  // колонны входа, И колонны выхода (проверено при фиксации).
  const C = loadCities();
  const a = C.createCityLayout(100, -40, 5);
  const b = C.createCityLayout(101, -40, 5);
  assert.notEqual(a.seed, b.seed, 'seed различен');
  assert.notEqual(a.entrance.x, b.entrance.x, 'колонна входа различна');
  assert.notEqual(a.exit.x, b.exit.x, 'колонна выхода различна');
  assert.notDeepEqual(a, b, 'полные layout различны');
});

test('хутор (fp1) — вырожденный 2x2: разные якоря → ОДИНАКОВЫЕ cells/entrance/exit, но РАЗНЫЕ seed', () => {
  // При width=2 колонн 1..W−2 нет: оба x=0 (клетки смежные,
  // BFS проходит) — позиция меняет только seed. Внутренности нет
  // (000102: хутор «без внутренностей», мин_постройки=0).
  const C = loadCities();
  const a = C.createCityLayout(-119, -104, 1);
  const b = C.createCityLayout(-118, 33, 1);
  assert.equal(a.width, 2);
  assert.equal(a.height, 2);
  assert.deepEqual(a.cells, b.cells, 'cells');
  assert.deepEqual(a.entrance, b.entrance, 'entrance');
  assert.deepEqual(a.exit, b.exit, 'exit');
  assert.notEqual(a.seed, b.seed, 'seed различен');
  assert.equal(a.cells.filter((v) => v === C.CELL_FLOOR).length, 2,
    'у хутора ровно 2 FLOOR-клетки (вход и выход)');
});

// --- UMD: браузерная ветка ---

test('vm-песочница БЕЗ dungeon.js: минимальная цепочка perlin.js → cities.js — Game.Cities работает в чужом realm', () => {
  assert.ok(fs.existsSync(CITIES_PATH),
    'src/cities.js не существует (задача 000104)');
  const perlinCode = fs.readFileSync(path.join(ROOT, 'src', 'perlin.js'), 'utf8');
  const citiesCode = fs.readFileSync(CITIES_PATH, 'utf8');
  const warns = [], errors = [];
  const sandbox = {
    console: {
      warn: (m) => warns.push(String(m)),
      error: (m) => errors.push(String(m)),
      log() {},
    },
  };
  sandbox.Game = {};
  vm.createContext(sandbox);
  vm.runInContext(perlinCode, sandbox, { filename: 'perlin.js' });
  vm.runInContext(citiesCode, sandbox, { filename: 'cities.js' });
  // Загрузка: DOM не трогает (в песочнице НЕТ document — касание
  // дало бы ReferenceError), console.warn/error не пишет (контракт
  // tests/main-visuals.test.js — там собирается ПОЛНАЯ цепочка
  // index.html и warn/error собираются).
  assert.equal(warns.length, 0, 'нет console.warn при загрузке: ' + warns.join('; '));
  assert.equal(errors.length, 0, 'нет console.error при загрузке: ' + errors.join('; '));
  const G = sandbox.Game;
  assert.ok(G.Cities, 'браузерная ветка должна дать Game.Cities');
  assert.equal(typeof G.Cities.createCityLayout, 'function');
  // По полям, а не deepEqual: объекты из vm-контекста — чужой realm.
  // Golden fp5 (100,−40) — тот же, что в node: браузерная ветка
  // снимает hash2 из Game (perlin.js) и та же CITY_LAYOUT_CONST.
  const L = G.Cities.createCityLayout(100, -40, 5);
  assert.equal(L.width, 10);
  assert.equal(L.height, 10);
  assert.equal(L.kind, 'city');
  assert.equal(L.seed, 3580905026);
  assert.equal(L.entrance.x, 7);
  assert.equal(L.entrance.y, 9);
  assert.equal(L.exit.x, 7);
  assert.equal(L.exit.y, 0);
  assert.equal(L.cells.length, 100);
  assert.equal(L.cells[L.exit.y * 10 + L.exit.x], G.Cities.CELL_FLOOR);
  assert.equal(L.cells[L.entrance.y * 10 + L.entrance.x], G.Cities.CELL_FLOOR);
  assert.equal(L.cells[0], G.Cities.CELL_WALL, 'периметр — стена');
  assert.equal(L.cells[1 * 10 + 1], G.Cities.CELL_FLOOR, 'внутренность — пол');
});

test('vm: cities.js БЕЗ perlin.js — throw с явным сообщением (ловушка порядка 000018/000038)', () => {
  assert.ok(fs.existsSync(CITIES_PATH),
    'src/cities.js не существует (задача 000104)');
  const citiesCode = fs.readFileSync(CITIES_PATH, 'utf8');
  const sandbox = { console: { warn() {}, error() {}, log() {} } };
  sandbox.Game = {};
  vm.createContext(sandbox);
  let err = null;
  try {
    vm.runInContext(citiesCode, sandbox, { filename: 'cities.js' });
  } catch (e) { err = e; }
  assert.ok(err, 'без perlin.js cities.js обязан бросить, а не молча деградировать');
  assert.match(String(err.message), /perlin\.js/,
    'сообщение называет perlin.js');
  assert.match(String(err.message), /cities\.js/,
    'сообщение называет cities.js (паттерн гарда day.js)');
});

// ============================================================
// Содержимое города (задача 000106) — generateCityContents
// ============================================================
//
// generateCityContents(layout, cityX, cityY, cityRecord, wealth) →
//   { buildings: [{ x, y, buildingId }], seed }
//
// Зафиксированные решения (memory/000106-city-contents.md):
//  * CITY_CONTENT_CONST = 0x434f4e54 (ASCII «CONT») — НОВАЯ соль:
//    seed = hash2(cityX, cityY, CITY_CONTENT_CONST) >>> 0 — от
//    ПОЗИЦИИ якоря; wealth в сид НЕ входит (один якорь → один
//    rng-поток на все wealth); totalXp — тоже нет (город статичен);
//    seed ≠ layout.seed (у layout своя соль CITY_LAYOUT_CONST);
//  * count = мин_постройки + wealth (без верхнего лимита —
//    размещение ограничено местом); ассортимент — топ-(1+wealth)
//    ключей доли_типов по (доля убыв, id растущ);
//  * таверна (id 44) строится ПЕРВОЙ (count ≥ 1), остальные —
//    взвешенный выбор по долям активных типов (1 rng-вызов на тип,
//    кумулятивная сумма в порядке сортировки);
//  * постройки 1x1 (ВСЕ внутренние, включая Арены id 7, 3x3 в
//    каталоге — размер каталога внутри города НЕ уважается,
//    решение, держать scope 000105/000107/000110); только FLOOR,
//    НИЧЕГО на entrance/exit; паттерн takeSpot (src/dungeon.js):
//    ≤200 случайных попыток из rng; КАЖДАЯ попытка проверяется
//    4-направленным BFS от entrance (занятые клетки = стены):
//    недостижимый FLOOR (включая exit) → отклонение; после 200
//    провалов — детерминированный y→x скан (БЕЗ rng); валидных
//    мест нет → GRACEFUL-стоп (buildings.length < count — норма,
//    без throw и без зацикливания);
//  * ДОСТИЖИМОСТЬ — СТРОГИЙ инвариант (функция обеспечивает);
//    мин_постройки — best-effort: у деревни 4x4 при РАЗНЫХ
//    колоннах входа/выхода максимум при сохранной достижимости
//    = 1 < мин 2 (брутфорс-проверено; 2 из 4 классностей, ~50%
//    якорей) — функция останавливается gracefully;
//  * хутор (fp1): FLOOR только entrance/exit → spots пуст →
//    buildings: [] при ЛЮБОМ wealth (мин_постройки = 0, 000102 —
//    задокументированное исключение «таверна в каждом городе»);
//  * pool/квоты — только из особых_параметры cityRecord
//    (source of truth 000053): ключи доли_типов нормализуются
//    Number(); города новых типов НЕ вводит (категория ≠ «город»).
//
// СТАНЦИЯ КРАСНЫХ ТЕСТОВ (TDD): до реализации падают на
// «C.generateCityContents — function». GOLDEN: seed уже
// зафиксирован формулой (0x434f4e54); литералы списков построек
// пиннются ПОСЛЕ ПЕРВОГО ЗЕЛЁНОГО ПРОГОНА (null — плейсхолдер,
// как в 000104): любое изменение порядка вызовов rng (таверна →
// (тип, место)×N; 200 попыток; порядок y→x) ломает пины.

const BUILDINGS_DIR = path.join(ROOT, 'assets', 'buildings');

function catalogAll() {
  return fs.readdirSync(BUILDINGS_DIR)
    .filter((f) => /^\d{6}\.json$/.test(f))
    .map((f) => JSON.parse(fs.readFileSync(path.join(BUILDINGS_DIR, f), 'utf8')));
}
const CATALOG_BY_ID = new Map(catalogAll().map((b) => [b.id, b]));
const CITY_RECORDS = new Map(
  catalogAll().filter((b) => b.категория === 'город')
    .map((b) => [b.id, b]));

const TAV_ID = 44; // Таверна — минимум 1 в каждом городе с внутренностями
const WEALTHS = [0, 1, 2, 3];

// Закреплённые якоря: реальные городские 000103 (tests/map.test.js).
const C_ANCHORS = { 51: [-119, -104], 52: [-114, -119],
  53: [100, -40], 54: [-37, 21] };
// 4 классности деревни 4x4 — layout деревни определяется ТОЛЬКО
// парой колонн (вход, выход) из {1,2}; закреплены якорями:
// одинаковые колонны → 2 валидные клетки (минимум 2 выполним),
// разные → 1 валидная (брутфорс; максимум 1 < мин 2).
const V_CASES = [
  { x: -400, y: -400, entrance: { x: 2, y: 3 }, exit: { x: 1, y: 0 } },
  { x: -400, y: -399, entrance: { x: 1, y: 3 }, exit: { x: 1, y: 0 } },
  { x: -400, y: -395, entrance: { x: 1, y: 3 }, exit: { x: 2, y: 0 } },
  { x: -400, y: -391, entrance: { x: 2, y: 3 }, exit: { x: 2, y: 0 } },
];

function range2d(from, to) {
  const out = [];
  for (let x = from; x <= to; x++)
    for (let y = from; y <= to; y++) out.push([x, y]);
  return out;
}
// Детерминированные sweep-сетки якорей (без флейка: фикс. координаты).
const V_SWEEP = range2d(-300, -289); // деревня: 144 якоря
const T_SWEEP = range2d(-160, -151); // город: 100 якорей
const S_SWEEP = range2d(-60, -47);   // столица: 196 якорей
const V_ANCHORS = [C_ANCHORS[52], ...V_SWEEP,
  ...V_CASES.map((v) => [v.x, v.y])];

function genFor(C, id, x, y, wealth) {
  const rec = CITY_RECORDS.get(id);
  const L = C.createCityLayout(x, y, rec.размер.ширина);
  return { res: C.generateCityContents(L, x, y, rec, wealth), L, rec };
}

/** Достигимость после размещения: клетки построек = стены; ВСЕ
 *  оставшиеся FLOOR-клетки (включая entrance/exit) достижимы от
 *  entrance 4-направленным BFS (D.reachableFrom — референс). */
function floorReachOK(C, L, buildings) {
  const cells = L.cells.slice();
  for (const b of buildings) cells[b.y * L.width + b.x] = C.CELL_WALL;
  const reach = D.reachableFrom(
    { width: L.width, height: L.height, cells },
    L.entrance.x, L.entrance.y);
  for (let y = 0; y < L.height; y++)
    for (let x = 0; x < L.width; x++)
      if (cells[y * L.width + x] === C.CELL_FLOOR &&
          !reach.has(x + ',' + y)) return false;
  return true;
}

function typesOf(res) {
  return [...new Set(res.buildings.map((b) => b.buildingId))]
    .sort((a, b) => a - b);
}

// --- API, константа, сид ---

test('000106 API: generateCityContents — функция (ровно 5 параметров), CITY_CONTENT_CONST — число', () => {
  const C = loadCities();
  assert.equal(typeof C.generateCityContents, 'function',
    'generateCityContents(layout, cityX, cityY, cityRecord, wealth)');
  assert.equal(C.generateCityContents.length, 5,
    'ровно 5 параметров: totalXp-параметра НЕТ (город не меняется с опытом)');
  assert.equal(typeof C.CITY_CONTENT_CONST, 'number',
    'CITY_CONTENT_CONST — зафиксированная соль содержимого');
});

test('CITY_CONTENT_CONST: зафиксирован (0x434f4e54 «CONT»), новая соль — НЕ известные (аудит 000053)', () => {
  const C = loadCities();
  assert.equal(C.CITY_CONTENT_CONST, 0x434f4e54,
    'golden-пин: смена = смена ВСЕХ городских содержимых');
  const others = [
    C.CITY_LAYOUT_CONST, M.GLOBAL_SEED, M.CITY_SEED_CONST,
    0xd0d6b5e5, 0x5e11c3a7, 0x0c9f4b2d, 0x5e11, 0x7777,
  ];
  for (const s of others) assert.notEqual(C.CITY_CONTENT_CONST, s,
    'коллизия солей с 0x' + s.toString(16));
});

test('seed содержимого = hash2(cityX, cityY, CITY_CONTENT_CONST) >>> 0; wealth в сид НЕ входит; ≠ layout.seed', () => {
  const C = loadCities();
  for (const [id, [x, y]] of Object.entries(C_ANCHORS)) {
    const rec = CITY_RECORDS.get(Number(id));
    const L = C.createCityLayout(x, y, rec.размер.ширина);
    let seed0 = null;
    for (const w of WEALTHS) {
      const res = C.generateCityContents(L, x, y, rec, w);
      assert.equal(res.seed,
        (P.hash2(x, y, C.CITY_CONTENT_CONST) >>> 0),
        `тип ${id} (${x},${y}) w${w}: формула сида`);
      if (seed0 === null) seed0 = res.seed;
      assert.equal(res.seed, seed0,
        `тип ${id} (${x},${y}): seed одинаков для всех wealth`);
    }
    assert.notEqual(seed0, L.seed,
      `тип ${id} (${x},${y}): seed содержимого ≠ layout.seed`);
  }
});

test('форма результата: ровно {buildings, seed}; building — ровно {x, y, buildingId}; plain (JSON-сериализуемо для сейва 000109)', () => {
  const C = loadCities();
  const { res } = genFor(C, 53, 100, -40, 1);
  assert.deepEqual(Object.keys(res).sort(), ['buildings', 'seed'],
    'ровно 2 поля (без Set/Map)');
  assert.ok(Array.isArray(res.buildings), 'buildings — массив');
  for (const b of res.buildings) {
    assert.deepEqual(Object.keys(b).sort(), ['buildingId', 'x', 'y'],
      'building — ровно {x, y, buildingId}');
    assert.ok(Number.isInteger(b.x) && Number.isInteger(b.y));
    assert.ok(Number.isInteger(b.buildingId));
  }
  assert.ok(Number.isInteger(res.seed) && res.seed >= 0 &&
    res.seed < 2 ** 32, 'seed — unsigned 32-bit');
  assert.deepEqual(JSON.parse(JSON.stringify(res)), res,
    'plain-объекты — сериализуемо');
});

test('детерминизм: повторный вызов → идентичный результат (весь объект)', () => {
  const C = loadCities();
  for (const [id, w] of [[51, 0], [51, 3], [52, 2], [53, 3], [54, 1]]) {
    const [x, y] = C_ANCHORS[id];
    assert.deepEqual(genFor(C, id, x, y, w).res,
      genFor(C, id, x, y, w).res, `тип ${id} (${x},${y}) w${w}`);
  }
});

// --- GOLDEN: seed зафиксирован формулой (0x434f4e54, вычислен);
// литералы списков построек пиннются ПОСЛЕ ПЕРВОГО ЗЕЛЁНОГО
// ПРОГОНА (null — плейсхолдер; как в 000104).
const GOLDEN_CONTENT = {
  // «id,x,y,wealth» → { seed, buildings } — литералы зафиксированы
  // из ПЕРВОГО зелёного прогона (зелёная стадия, паттерн 000104):
  // порядок вызовов rng (таверна: место; дальше: тип → место;
  // ≤200 попыток; y→x скан без rng) — любое изменение ломает пины.
  // Деревня (−114,−119): одинаковые колонны входа/выхода → ровно
  // 2 валидные клетки (1,1)/(1,2) → buildings.length = 2 при
  // ЛЮБОМ wealth (count = 2+wealth — feasibility-cap, graceful-стоп).
  '51,-119,-104,0': { seed: 1811910784, buildings: [] },
  '51,-119,-104,3': { seed: 1811910784, buildings: [] },
  '52,-114,-119,0': { seed: 4224836588, buildings: [
    { x: 1, y: 2, buildingId: 44 },
    { x: 1, y: 1, buildingId: 1 },
  ] },
  '52,-114,-119,2': { seed: 4224836588, buildings: [
    { x: 1, y: 2, buildingId: 44 },
    { x: 1, y: 1, buildingId: 1 },
  ] },
  '52,-114,-119,3': { seed: 4224836588, buildings: [
    { x: 1, y: 2, buildingId: 44 },
    { x: 1, y: 1, buildingId: 1 },
  ] },
  '53,100,-40,0':   { seed: 2930258412, buildings: [
    { x: 7, y: 5, buildingId: 44 },
    { x: 1, y: 4, buildingId: 25 },
    { x: 2, y: 4, buildingId: 25 },
    { x: 7, y: 3, buildingId: 25 },
  ] },
  '53,100,-40,3':   { seed: 2930258412, buildings: [
    { x: 7, y: 5, buildingId: 44 },
    { x: 1, y: 4, buildingId: 7 },
    { x: 2, y: 4, buildingId: 7 },
    { x: 7, y: 3, buildingId: 44 },
    { x: 8, y: 6, buildingId: 1 },
    { x: 1, y: 2, buildingId: 44 },
    { x: 2, y: 6, buildingId: 44 },
  ] },
  '54,-37,21,1':    { seed: 1979804739, buildings: [
    { x: 1, y: 7, buildingId: 44 },
    { x: 2, y: 11, buildingId: 25 },
    { x: 5, y: 5, buildingId: 25 },
    { x: 11, y: 6, buildingId: 10 },
    { x: 5, y: 12, buildingId: 10 },
    { x: 10, y: 3, buildingId: 25 },
    { x: 2, y: 6, buildingId: 10 },
  ] },
};

test('golden: фикс. (якорь, тип, wealth) → фикс. seed + список построек', () => {
  const C = loadCities();
  for (const [key, g] of Object.entries(GOLDEN_CONTENT)) {
    const [id, x, y, w] = key.split(',').map(Number);
    const { res } = genFor(C, id, x, y, w);
    assert.equal(res.seed, g.seed, `golden ${key}: seed`);
    if (g.buildings === null) continue; // пин — на зелёной стадии
    assert.deepEqual(res.buildings, g.buildings,
      `golden ${key}: buildings`);
  }
});

// --- Каталог и pool ---

test('ссылочная целостность: каждый buildingId ∈ каталогу assets/buildings и категория ≠ «город» (все 4 типа × wealth)', () => {
  const C = loadCities();
  for (const [id, [x, y]] of Object.entries(C_ANCHORS)) {
    for (const w of WEALTHS) {
      const { res } = genFor(C, Number(id), x, y, w);
      for (const b of res.buildings) {
        assert.ok(CATALOG_BY_ID.has(b.buildingId),
          `тип ${id} (${x},${y}) w${w}: id ${b.buildingId} нет в каталоге`);
        assert.notEqual(CATALOG_BY_ID.get(b.buildingId).категория,
          'город',
          `тип ${id} (${x},${y}) w${w}: вложенный город id ${b.buildingId} недопустим`);
      }
    }
  }
});

test('типы — только из доли_типов cityRecord (source of truth 000053; все 4 типа × wealth)', () => {
  const C = loadCities();
  for (const [id, [x, y]] of Object.entries(C_ANCHORS)) {
    const rec = CITY_RECORDS.get(Number(id));
    const pool = new Set(
      Object.keys(rec.особые_параметры.доли_типов).map(Number));
    for (const w of WEALTHS) {
      const { res } = genFor(C, Number(id), x, y, w);
      for (const b of res.buildings) {
        assert.ok(pool.has(b.buildingId),
          `тип ${id} (${x},${y}) w${w}: id ${b.buildingId} вне доли_типов`);
      }
    }
  }
});

// --- Таверна и минимум ---

test('таверна (44) — минимум 1: деревня/город/столица (все wealth + sweep); хутор — buildings: [] (дегенерат 000102)', () => {
  const C = loadCities();
  for (const [id, anchors] of Object.entries({
    52: V_ANCHORS, 53: [C_ANCHORS[53], ...T_SWEEP],
    54: [C_ANCHORS[54], ...S_SWEEP],
  })) {
    for (const [x, y] of anchors) {
      for (const w of WEALTHS) {
        const { res } = genFor(C, Number(id), x, y, w);
        assert.ok(res.buildings.some((b) => b.buildingId === TAV_ID),
          `тип ${id} (${x},${y}) w${w}: таверна обязательна (найм 000065/000078)`);
      }
    }
  }
  for (const [x, y] of [C_ANCHORS[51], [-118, 33]])
    for (const w of WEALTHS) {
      const { res } = genFor(C, 51, x, y, w);
      assert.deepEqual(res.buildings, [],
        `хутор (${x},${y}) w${w}: FLOOR только entrance/exit → пусто`);
    }
});

test('минимум: город/столица — length ≥ мин_постройки (все wealth + sweep); деревня — ≥ 1 (таверна), (−114,−119) — ровно 2 (мин. выполнимо); graceful-стоп при разных колоннах', () => {
  const C = loadCities();
  for (const [id, sweep] of [[53, T_SWEEP], [54, S_SWEEP]]) {
    const min = CITY_RECORDS.get(id).особые_параметры.мин_постройки;
    for (const [x, y] of [[C_ANCHORS[id][0], C_ANCHORS[id][1]], ...sweep])
      for (const w of WEALTHS) {
        const { res } = genFor(C, id, x, y, w);
        assert.ok(res.buildings.length >= min,
          `тип ${id} (${x},${y}) w${w}: ${res.buildings.length} < ${min}`);
      }
  }
  // Деревня: ≥ 1 ВСЕГДА (хотя бы таверна — есть валидное место);
  // при РАЗНЫХ колоннах максимум = 1 < мин 2 → graceful-стоп,
  // НЕ throw (приоритет: достижимость > минимум — 000106/memory).
  for (const [x, y] of V_ANCHORS)
    for (const w of WEALTHS) {
      const { res } = genFor(C, 52, x, y, w);
      assert.ok(res.buildings.length >= 1,
        `деревня (${x},${y}) w${w}: ни одной постройки`);
    }
  // (−114,−119): одинаковые колонны → 2 валидные клетки = минимум 2
  for (const w of WEALTHS) {
    const { res } = genFor(C, 52, -114, -119, w);
    assert.equal(res.buildings.length, 2,
      `деревня (−114,−119) w${w}: минимум 2 выполнен (count = 2+wealth, мест 2)`);
  }
});

test('graceful-стоп: мест не хватает → length < count БЕЗ throw; достижимость сохранена (синт. min=50 на деревне)', () => {
  const C = loadCities();
  const rec = {
    id: 999, название: 'Тест', категория: 'город',
    особые_параметры: { мин_постройки: 50,
      доли_типов: { '44': 0.5, '1': 0.5 } },
  };
  const L = C.createCityLayout(-114, -119, 2); // 4 внутренние клетки, валидных 2
  const res = C.generateCityContents(L, -114, -119, rec, 3); // count = 53
  assert.ok(res.buildings.length >= 1, 'хотя бы таверна (места есть)');
  assert.ok(res.buildings.length < 50,
    'стоп, когда мест нет (не зациклился, не бросил)');
  assert.ok(res.buildings.length <= 4, 'не больше внутренних FLOOR-клеток');
  assert.ok(floorReachOK(C, L, res.buildings), 'достижимость сохранена');
});

// --- Гигиена и достижимость ---

test('гигиена размещения: ничего на entrance/exit; координаты в пределах layout; клетки FLOOR; уникальны (1x1, без пересечений)', () => {
  const C = loadCities();
  for (const [id, [x, y]] of Object.entries(C_ANCHORS)) {
    for (const w of WEALTHS) {
      const { res, L } = genFor(C, Number(id), x, y, w);
      const keys = new Set();
      for (const b of res.buildings) {
        assert.ok(b.x >= 0 && b.x < L.width && b.y >= 0 && b.y < L.height,
          `тип ${id} w${w}: (${b.x},${b.y}) вне layout`);
        assert.ok(!(b.x === L.entrance.x && b.y === L.entrance.y),
          `тип ${id} w${w}: постройка на entrance`);
        assert.ok(!(b.x === L.exit.x && b.y === L.exit.y),
          `тип ${id} w${w}: постройка на exit`);
        assert.equal(L.cells[b.y * L.width + b.x], C.CELL_FLOOR,
          `тип ${id} w${w}: постройка не на FLOOR`);
        const k = b.x + ',' + b.y;
        assert.ok(!keys.has(k), `тип ${id} w${w}: пересечение на (${k})`);
        keys.add(k);
      }
    }
  }
});

test('достижимость (СТРОГОЕ): после размещения ВСЕ незастроенные FLOOR достижимы от entrance (BFS 4 напр.), выход достижим — все 4 типа × wealth, sweep + 4 классности деревни', () => {
  const C = loadCities();
  const all = {
    51: [C_ANCHORS[51], [-118, 33]],
    52: V_ANCHORS,
    53: [C_ANCHORS[53], ...T_SWEEP],
    54: [C_ANCHORS[54], ...S_SWEEP],
  };
  for (const [id, anchors] of Object.entries(all)) {
    for (const [x, y] of anchors) {
      for (const w of WEALTHS) {
        const { res, L } = genFor(C, Number(id), x, y, w);
        assert.ok(floorReachOK(C, L, res.buildings),
          `тип ${id} (${x},${y}) w${w}: замурованы FLOOR-клетки (или выход)`);
      }
    }
  }
});

// --- Формула count/ассортимента ---

test('ассортимент = топ-(1+wealth) по (доля убыв, id растущ): w0 → только топ-1 тип + таверна; Арена (7) — ВНЕ ассортимента столицы при ЛЮБОМ wealth (5-й по доле)', () => {
  const C = loadCities();
  // w0: город и столица → ровно {44, 25} (топ-1 — Дом кузнеца 25,
  // доля 0.3; у столицы 1-й по (доля,id), у города тоже).
  for (const [id, x, y] of [[53, 100, -40], [54, -37, 21]]) {
    const { res } = genFor(C, id, x, y, 0);
    assert.deepEqual(typesOf(res), [25, 44], `тип ${id} w0: ассортимент`);
  }
  // деревня w0: топ-1 — Оружейная 1 (доля 0.5, id 1 < 44) → ⊆ {1, 44}
  for (const [x, y] of V_ANCHORS) {
    const { res } = genFor(C, 52, x, y, 0);
    for (const b of res.buildings)
      assert.ok(b.buildingId === 1 || b.buildingId === TAV_ID,
        `деревня (${x},${y}) w0: тип ${b.buildingId} вне {1, 44}`);
  }
  // деревня (−114,−119) w0: ровно {44, 1} (таверна + Оружейная)
  assert.deepEqual(typesOf(genFor(C, 52, -114, -119, 0).res), [1, 44]);
  // столица: 7 (Арена) — НИКОГДА: 5-й по (доля, id) — доля 0.15 =
  // у 1, но id 7 > 1; топ-(1+wealth) ≤ топ-4 не доходит до него.
  for (const [x, y] of [C_ANCHORS[54], ...S_SWEEP])
    for (const w of WEALTHS) {
      const { res } = genFor(C, 54, x, y, w);
      for (const b of res.buildings)
        assert.notEqual(b.buildingId, 7,
          `столица (${x},${y}) w${w}: Арена вне ассортимента`);
    }
});

test('доли в пределах допуска: столица w3, детерминированный сэмпл 196 якорей — эмпирическая частота каждого активного типа в ±0.15 (абс.) от нормализованной доли', () => {
  const C = loadCities();
  const total = {};
  let n = 0;
  for (const [x, y] of S_SWEEP) {
    const { res } = genFor(C, 54, x, y, 3);
    for (const b of res.buildings) {
      total[b.buildingId] = (total[b.buildingId] || 0) + 1;
      n++;
    }
  }
  assert.equal(n, S_SWEEP.length * 9,
    'каждая столица w3 дала 9 построек (count = 6+3, все поместились)');
  // Активные типы w3: 25:0.3, 10:0.2, 44:0.2, 1:0.15 (сумма 0.85;
  // таверна строится первой — смещение +11 п.п. на 44, в допуске).
  const norm = { 25: 0.3 / 0.85, 10: 0.2 / 0.85,
    44: 0.2 / 0.85, 1: 0.15 / 0.85 };
  for (const [id, share] of Object.entries(norm)) {
    const freq = (total[id] || 0) / n;
    assert.ok(Math.abs(freq - share) <= 0.15,
      `тип ${id}: частота ${(freq * 100).toFixed(1)}% вне допуска ±15 п.п. от ${(share * 100).toFixed(1)}%`);
  }
});

test('wealth: город (100,−40) — (w0) ≠ (w3); count = мин_постройки + wealth: length(w0) = 4, length(w3) = 7', () => {
  const C = loadCities();
  const r0 = genFor(C, 53, 100, -40, 0).res;
  const r3 = genFor(C, 53, 100, -40, 3).res;
  assert.notDeepEqual(r0, r3, 'wealth меняет содержимое');
  assert.equal(r0.buildings.length, 4, 'count w0 = 4+0');
  assert.equal(r3.buildings.length, 7, 'count w3 = 4+3');
});

// --- Чистота ---

test('layout НЕ мутируется: generateCityContents работает на своих копиях (000105 кеширует layout и переиспользует)', () => {
  const C = loadCities();
  const rec = CITY_RECORDS.get(53);
  const L = C.createCityLayout(100, -40, 5);
  const before = JSON.parse(JSON.stringify(L));
  C.generateCityContents(L, 100, -40, rec, 3);
  assert.deepEqual(L, before, 'layout после вызова deepEqual-равен до');
});

test('чистота: vm-песочница БЕЗ dungeon.js (цепочка perlin → cities) — generateCityContents работает, результат = node', () => {
  const C = loadCities();
  const perlinCode = fs.readFileSync(path.join(ROOT, 'src', 'perlin.js'), 'utf8');
  const citiesCode = fs.readFileSync(CITIES_PATH, 'utf8');
  const sandbox = { console: { warn() {}, error() {}, log() {} } };
  sandbox.Game = {};
  vm.createContext(sandbox);
  vm.runInContext(perlinCode, sandbox, { filename: 'perlin.js' });
  vm.runInContext(citiesCode, sandbox, { filename: 'cities.js' });
  const G = sandbox.Game;
  assert.ok(G.Cities, 'браузерная ветка: Game.Cities');
  assert.equal(typeof G.Cities.generateCityContents, 'function');
  assert.equal(typeof G.Cities.CITY_CONTENT_CONST, 'number');
  const L = G.Cities.createCityLayout(100, -40, 5);
  const rec = JSON.parse(JSON.stringify(CITY_RECORDS.get(53)));
  const resVm = G.Cities.generateCityContents(L, 100, -40, rec, 1);
  const resNode = C.generateCityContents(
    C.createCityLayout(100, -40, 5), 100, -40, CITY_RECORDS.get(53), 1);
  // Строка JSON, а не deepEqual: объекты из vm — чужой realm.
  assert.equal(JSON.stringify(resVm), JSON.stringify(resNode),
    'vm и node — идентичный результат (golden-значения совпадают)');
});

// --- Валидация ---

test('валидация: wealth — целое 0..3, иначе throw с явным сообщением', () => {
  const C = loadCities();
  const rec = CITY_RECORDS.get(53);
  const L = C.createCityLayout(100, -40, 5);
  for (const w of [-1, 4, 1.5, '2', null, undefined, NaN, true]) {
    assert.throws(() => C.generateCityContents(L, 100, -40, rec, w),
      /cities\.js/, `wealth=${String(w)} обязан бросать`);
  }
  for (const w of WEALTHS) C.generateCityContents(L, 100, -40, rec, w);
});

test('валидация: cityRecord — особые_параметры / мин_постройки (целое ≥ 0) / доли_типов (числовые ключи, доли > 0), иначе throw', () => {
  const C = loadCities();
  const L = C.createCityLayout(100, -40, 5);
  const base = () => JSON.parse(JSON.stringify(CITY_RECORDS.get(53)));
  const bad = [null];
  const r1 = base(); delete r1.особые_параметры; bad.push(r1);
  const r2 = base(); r2.особые_параметры = {}; bad.push(r2);
  const r3 = base(); delete r3.особые_параметры.мин_постройки; bad.push(r3);
  const r4 = base(); delete r4.особые_параметры.доли_типов; bad.push(r4);
  for (const min of [-1, 1.5, '2', null]) {
    const r = base();
    r.особые_параметры.мин_постройки = min;
    bad.push(r);
  }
  for (const доли of [{}, { '44': 0 }, { '44': -0.2 }, { '44': 'abc' },
    { '44': null }, { abc: 0.5 }, 42]) {
    const r = base();
    r.особые_параметры.доли_типов = доли;
    bad.push(r);
  }
  for (const r of bad) {
    assert.throws(() => C.generateCityContents(L, 100, -40, r, 1),
      /cities\.js/,
      'невалидный cityRecord: ' + JSON.stringify(r && r.особые_параметры));
  }
});

test('валидация: layout — width/height/cells/entrance/exit, иначе throw', () => {
  const C = loadCities();
  const rec = CITY_RECORDS.get(53);
  const full = C.createCityLayout(100, -40, 5);
  for (const field of ['width', 'height', 'cells', 'entrance', 'exit']) {
    const broken = { ...full };
    delete broken[field];
    assert.throws(() => C.generateCityContents(broken, 100, -40, rec, 1),
      /cities\.js/, `layout без ${field} обязан бросать`);
  }
});

// ============================================================
// Лавки города (задача 000108) — makeCityShop
// ============================================================
//
// makeCityShop(cityX, cityY, tx, ty, buildingId, wealth) → shop-
// объект в makeShop/setShop-формате {x, y, buildingType, wealth,
// stock, seed} — РОВНО 6 полей, где x/y = ЛОКАЛЬНАЯ клетка (tx,ty)
// города (ключ состояния 000109 «tx,ty»).
//
// Зафиксированные решения (memory/000108-city-shops.md):
//  * лавка = обёртка СУЩЕСТВУЮЩего items.makeShop с офсетом
//    координат города: makeShop(cityX*256+tx, cityY*256+ty,
//    map_index, wealth) — семантика стока/seed/ассортимента/
//    универсала-w3 НЕ дублируется (формула закреплена golden-
//    пинами items.test.js, 000060);
//  * CITY_SHOP_CELL_BASE = 256 — инъективная кодировка (город,
//    клетка) → координаты makeShop: x′ = cityX*256+tx,
//    y′ = cityY*256+ty. 256 > максимальный размер layout
//    (2×footprint−1 ≤ 14): две РАЗНЫЕ пары (город, клетка)
//    никогда не дают общие координаты — ВКЛЮЧАЯ СОСЕДНИЕ якоря
//    (наивная сумма cityX+tx дала бы коллизию: (100,−40)+tx=1 и
//    (101,−40)+tx=0 — оба x′=101 → общий сток; ловит тест
//    «анти-прецедент» ниже);
//  * buildingId → запись каталога assets/buildings (ЛЕНИВЫЙ
//    референс: node — require, браузер — Game в момент вызова) →
//    особые_параметры.map_index: записи нет → throw (ошибка
//    вызывающего); map_index нет (города 51..54) или «виды» нет
//    (Арена 7 / Стрельбище 10 / Дом кузнеца 25) → null (не лавка);
//    КРОСС-ССЫЛКА — id каталога, НЕ map_index: 44 (Таверна) → 11,
//    1 (Оружейная) → 0 (shopKindsFor(44) — null, shopKindsFor(1) —
//    Бронник ['armor'], типичная ошибка — ловят тесты ниже);
//  * wealth — целое 0..3, cities.js-конвенция (throw, как в
//    generateCityContents); в проде — tileAt().buildingWealth;
//  * buy/sell — СУЩЕСТВУЮЩИЕ I.buyItem/I.sellItem/buyPrice/
//    sellPrice БЕЗ ИЗМЕНЕНИЙ: городская лавка «влезает» в
//    существующий интерфейс playerUI.setShop как есть;
//  * sellItem НЕ увеличивает сток (существующая семантика: товар
//    скупается и исчезает, items.js) — формулировка задачи
//    «продажа — увеличивает» неточна; тесты пиннят ФАКТИЧЕСКОЕ
//    поведение (расхождение — в отчёте);
//  * ЛОВУШКА-ПРЕЦЕДЕНТ: мировой npcStocks (main.js) ключируется по
//    npcId — «все тайлы храма солнца делят один сток». Городские
//    лавки — СВОИ стоки по (город, клетка): повторный вызов
//    makeCityShop даёт НОВЫЙ объект stock (тест ниже), мировой
//    npcStocks в этой задаче НЕ трогается (регрессионный
//    структурный тест в конце раздела).
//
// СТАДИЯ КРАСНЫХ ТЕСТОВ (TDD): makeCityShop ещё НЕ реализован в
// src/cities.js — тесты ниже падают на «C.makeCityShop is not a
// function» (паттерн 000104/000106). Golden-литералы stock/seed
// зафиксированы ЗАРАНЕЕ из существующего закреплённого makeShop
// (items.test.js, 000060): seed = hash2(cityX*256+tx, cityY*256+ty,
// 0x154075) ^ (map_index+1) — обёртка обязана вернуть ровно эти
// значения; ре-имплементация логики стока вместо вызова makeShop
// их сломает.

// --- API и константа ---

test('000108 API: makeCityShop — функция (ровно 6 параметров); CITY_SHOP_CELL_BASE = 256 (golden-пин литерала)', () => {
  const C = loadCities();
  assert.equal(typeof C.makeCityShop, 'function',
    'makeCityShop(cityX, cityY, tx, ty, buildingId, wealth)');
  assert.equal(C.makeCityShop.length, 6,
    'ровно 6 параметров: layout/cityRecord-аргументов НЕТ ' +
    '(данные — из (город, клетка) и каталога по buildingId)');
  assert.equal(C.CITY_SHOP_CELL_BASE, 256,
    'golden-пин: 256 > максимального layout (2×footprint−1 ≤ 14); ' +
    'смена после мержа = смена ВСЕХ городских стоков — недопустимо');
});

// --- Не-лавки и валидация ---

test('не-лавка → null: Арена (7), Стрельбище (10), Дом кузнеца (25) — без «виды»; города (51..54) — без map_index; все wealth', () => {
  const C = loadCities();
  for (const id of [7, 10, 25])
    for (const w of WEALTHS)
      assert.equal(C.makeCityShop(100, -40, 2, 2, id, w), null,
        `buildingId ${id} — не лавка (w${w})`);
  for (const id of [51, 52, 53, 54])
    assert.equal(C.makeCityShop(-114, -119, 1, 1, id, 1), null,
      `город ${id} — не лавка (map_index нет)`);
});

test('buildingId нет в каталоге → throw (ошибка вызывающего), /cities\\.js/', () => {
  const C = loadCities();
  for (const id of [999, 500, -1])
    assert.throws(() => C.makeCityShop(100, -40, 2, 2, id, 1),
      /cities\.js/, `buildingId ${id} — нет в каталоге`);
});

test('валидация: cityX/cityY/tx/ty/buildingId — целые (cityX/cityY — ЛЮБЫЕ, включая отрицательные), иначе throw /cities\\.js/', () => {
  const C = loadCities();
  for (const bad of [1.5, -0.5, '2', NaN, null, undefined]) {
    assert.throws(() => C.makeCityShop(bad, -40, 2, 2, 44, 1),
      /cities\.js/, 'cityX=' + String(bad));
    assert.throws(() => C.makeCityShop(100, bad, 2, 2, 44, 1),
      /cities\.js/, 'cityY=' + String(bad));
    assert.throws(() => C.makeCityShop(100, -40, bad, 2, 44, 1),
      /cities\.js/, 'tx=' + String(bad));
    assert.throws(() => C.makeCityShop(100, -40, 2, bad, 44, 1),
      /cities\.js/, 'ty=' + String(bad));
    assert.throws(() => C.makeCityShop(100, -40, 2, 2, bad, 1),
      /cities\.js/, 'buildingId=' + String(bad));
  }
  // Отрицательные координаты города — ВАЛИДНЫ (реальные якоря:
  // (−114,−119), (−37,21), (−119,−104)).
  assert.ok(C.makeCityShop(-114, -119, 1, 1, 44, 1), 'cityX/cityY < 0');
});

test('валидация: wealth — целое 0..3 (cities.js-конвенция, как generateCityContents); tx/ty — [0, 256) (инъективность), иначе throw', () => {
  const C = loadCities();
  for (const w of [-1, 4, 1.5, '2', null, undefined, NaN, true])
    assert.throws(() => C.makeCityShop(100, -40, 2, 2, 44, w),
      /cities\.js/, 'wealth=' + String(w));
  for (const [tx, ty] of [[256, 0], [0, 256], [-1, 0], [0, -1], [257, 257]])
    assert.throws(() => C.makeCityShop(100, -40, tx, ty, 44, 1),
      /cities\.js/, `tx=${tx},ty=${ty} вне [0,256)`);
  // Граница 255 — валидна (максимальный layout 14 — гард защищает
  // кодировку, а не layout).
  assert.ok(C.makeCityShop(100, -40, 255, 255, 44, 1), 'tx=ty=255');
});

// --- Форма shop-объекта ---

test('форма shop: РОВНО 6 полей makeShop/setShop-формата; x/y = локальная клетка (tx,ty); buildingType = map_index каталога (44→11, 1→0)', () => {
  const C = loadCities();
  const s = C.makeCityShop(100, -40, 2, 2, 44, 2);
  assert.ok(s, 'таверна — лавка');
  assert.deepEqual(Object.keys(s).sort(),
    ['buildingType', 'seed', 'stock', 'wealth', 'x', 'y'],
    'ровно 6 полей — без доп. полей (влезает в playerUI.setShop ' +
    'и buy/sell, читающие stock/wealth/buildingType)');
  assert.equal(s.x, 2, 'x = tx — ЛОКАЛЬНАЯ клетка (ключ 000109 «tx,ty»), а не cityX*256+tx');
  assert.equal(s.y, 2, 'y = ty');
  assert.equal(s.buildingType, 11,
    'id 44 (Таверна) → map_index 11, НЕ 44 (shopKindsFor(44) — null)');
  assert.equal(s.wealth, 2);
  assert.ok(s.stock && typeof s.stock === 'object' &&
    Object.keys(s.stock).length > 0, 'stock не пуст');
  // Ассортимент — из каталога (000060): wealth < 3 — только виды
  // записи (таверна: food/potion).
  for (const w of [0, 1, 2]) {
    const s2 = C.makeCityShop(100, -40, 2, 2, 44, w);
    for (const id of Object.keys(s2.stock))
      assert.ok(['food', 'potion'].includes(I.getItem(id).kind),
        `таверна w${w}: «${id}» вне видов [food, potion]`);
  }
  // Оружейная (id 1): map_index 0 (НЕ 1 — shopKindsFor(1) это
  // Бронник ['armor']), сток — только оружие.
  const ws = C.makeCityShop(-114, -119, 1, 1, 1, 1);
  assert.equal(ws.buildingType, 0, 'id 1 (Оружейная) → map_index 0');
  for (const id of Object.keys(ws.stock))
    assert.equal(I.getItem(id).kind, 'weapon', `оружейная: «${id}»`);
  // plain (JSON-сериализуемо для сейва 000109).
  assert.deepEqual(JSON.parse(JSON.stringify(s)), s, 'plain-объект');
});

// --- Формула (ядро задачи) и детерминизм ---

test('формула: shop = СУЩЕСТВУЮЩИЙ makeShop(cityX*256+tx, cityY*256+ty, map_index, wealth) — seed/stock без дублирования логики', () => {
  const C = loadCities();
  // Кросс-ссылка id → map_index — из каталога (B.getBuilding),
  // НЕ через обёртку: независимый референс.
  for (const [cx, cy, tx, ty, id, w] of [
    [100, -40, 2, 2, 44, 2],
    [100, -40, 7, 5, 44, 3],
    [-114, -119, 1, 1, 1, 1],
    [-37, 21, 1, 7, 44, 1],
    [100, -40, 2, 2, 1, 0],
  ]) {
    const mi = B.getBuilding(id).особые_параметры.map_index;
    const ref = I.makeShop(cx * 256 + tx, cy * 256 + ty, mi, w);
    const s = C.makeCityShop(cx, cy, tx, ty, id, w);
    assert.equal(s.seed, ref.seed,
      `(${cx},${cy}) (${tx},${ty}) id${id} w${w}: seed — из (город, клетка)`);
    assert.deepEqual(s.stock, ref.stock,
      `(${cx},${cy}) (${tx},${ty}) id${id} w${w}: сток — семантика makeShop`);
  }
});

test('детерминизм: повторный вызов → deepEqual; НО stock — НОВЫЙ объект при каждом вызове (общего стока НЕТ — анти-прецедент npcStocks)', () => {
  const C = loadCities();
  const a = C.makeCityShop(100, -40, 2, 2, 44, 2);
  const b = C.makeCityShop(100, -40, 2, 2, 44, 2);
  assert.deepEqual(a, b, 'результат идентичен');
  assert.notEqual(a.stock, b.stock,
    'stock — новый объект (ссылочного общего стока нет, в отличие от npcStocks)');
  // Мутация стока одной лавки не трогает другую.
  delete a.stock.healing_potion;
  assert.ok('healing_potion' in b.stock, 'мутация a.stock не тронула b.stock');
  const c1 = C.makeCityShop(100, -40, 2, 2, 44, 2);
  assert.deepEqual(c1.stock, b.stock, 'третий вызов — тот же сток');
});

// --- GOLDEN: литералы из существующего закреплённого makeShop ---
const SHOP_GOLDEN = {
  // «cx,cy,tx,ty,id,wealth» → {seed, stock}. Литералы вычислены из
  // существующего makeShop (golden 000060 items.test.js): seed =
  // hash2(cx*256+tx, cy*256+ty, 0x154075) ^ (map_index+1). Любая
  // ре-имплементация стока вместо вызова makeShop ломает пины.
  '100,-40,2,2,44,2': { seed: 7804926, stock: {
    healing_potion: 3, greater_healing: 3, mana_potion: 4,
    bread: 4, honey_cake: 2 } },
  '100,-40,7,5,44,3': { seed: 3425630131, stock: {
    wood_sword: 1, iron_sword: 1, steel_sword: 5, short_bow: 2,
    hunting_bow: 1, battle_axe: 3, war_hammer: 4, leather_armor: 3,
    chainmail: 1, knight_plate: 2, minor_healing: 2, healing_potion: 5,
    greater_healing: 3, mana_potion: 3, mana_elixir: 4, bread: 4,
    meat: 1, honey_cake: 1, alchemy_manual: 1, sword_treatise: 4,
    sulfur: 4, moonstone: 5, phoenix_feather: 1, stone_fist_grimoire: 4,
    iron_hide_tome: 3, fire_spellbook: 2, ice_spellbook: 2,
    heavy_tome: 4, meditation_scroll: 3, nature_scroll: 1, iron_ore: 1,
    copper_ore: 1, wood_log: 1, stone_chunk: 3, hide: 5, herb_healing: 3,
    herb_mana: 2, herb_bitter: 5, stone_chisel: 5 } },
  '-114,-119,1,1,1,1': { seed: 550380853, stock: {
    iron_sword: 3, short_bow: 3, hunting_bow: 3, battle_axe: 1,
    war_hammer: 1 } },
  '-37,21,1,7,44,1': { seed: 1556417893, stock: {
    minor_healing: 3, greater_healing: 3, mana_potion: 2,
    mana_elixir: 3, bread: 3, meat: 1, honey_cake: 1 } },
};

test('golden: фикс. (якорь, клетка, buildingId, wealth) → фикс. seed/stock (литералы)', () => {
  const C = loadCities();
  for (const [key, g] of Object.entries(SHOP_GOLDEN)) {
    const [cx, cy, tx, ty, id, w] = key.split(',').map(Number);
    const s = C.makeCityShop(cx, cy, tx, ty, id, w);
    assert.equal(s.seed, g.seed, `golden ${key}: seed`);
    assert.deepEqual(s.stock, g.stock, `golden ${key}: stock`);
  }
});

// --- Разные города / клетки / wealth ---

test('разные города → РАЗНЫЕ стоки (одна клетка/тип/wealth); тот же город/клетка → тот же сток (детерминизм)', () => {
  const C = loadCities();
  const a = C.makeCityShop(100, -40, 2, 2, 44, 2);
  const b = C.makeCityShop(-37, 21, 2, 2, 44, 2);
  assert.notEqual(a.seed, b.seed, 'seed различен');
  assert.notDeepEqual(a.stock, b.stock, 'сток не общий между городами');
  assert.deepEqual(C.makeCityShop(100, -40, 2, 2, 44, 2), a,
    'тот же город/клетка — детерминизм');
});

test('анти-прецедент инъективной кодировки: СОСЕДНИЕ якоря (100,−40)+tx=1 и (101,−40)+tx=0 → РАЗНЫЕ стоки (наивный cityX+tx дал бы обоим x′=101 → общий сток)', () => {
  const C = loadCities();
  // 100*256+1 = 25601; 101*256+0 = 25856 — различны. При сумме
  // 100+1 = 101 = 101+0 — коллизия (баг, который ловит тест).
  const a = C.makeCityShop(100, -40, 1, 0, 44, 2);
  const b = C.makeCityShop(101, -40, 0, 0, 44, 2);
  assert.notEqual(a.seed, b.seed, 'seed различен');
  assert.notDeepEqual(a.stock, b.stock, 'стоки различны');
});

test('один город, один тип, РАЗНЫЕ клетки → РАЗНЫЕ стоки (ключ — клетка, НЕ тип и НЕ город; 4 таверны у 000106-golden (100,−40) w3: (7,5), (7,3), (1,2), (2,6))', () => {
  const C = loadCities();
  const s1 = C.makeCityShop(100, -40, 7, 5, 44, 3);
  const s2 = C.makeCityShop(100, -40, 7, 3, 44, 3);
  const s3 = C.makeCityShop(100, -40, 1, 2, 44, 3);
  const s4 = C.makeCityShop(100, -40, 2, 6, 44, 3);
  assert.notDeepEqual(s1.stock, s2.stock, 'таверны (7,5) и (7,3)');
  assert.notDeepEqual(s1.stock, s3.stock, 'таверны (7,5) и (1,2)');
  assert.notDeepEqual(s3.stock, s4.stock, 'таверны (1,2) и (2,6)');
});

test('wealth: сток w0 ≠ w3; универсам (w3) содержит виды ВНЕ видов таверны (смесь); buyPrice(w1) ≠ buyPrice(w2) для общего предмета (BUY_WEALTH_MULT)', () => {
  const C = loadCities();
  const w0 = C.makeCityShop(100, -40, 2, 2, 44, 0);
  const w3 = C.makeCityShop(100, -40, 2, 2, 44, 3);
  assert.notDeepEqual(w0.stock, w3.stock, 'wealth меняет сток');
  const kinds = new Set(
    Object.keys(w3.stock).map((id) => I.getItem(id).kind));
  const foreign = [...kinds].filter((k) =>
    !['food', 'potion'].includes(k));
  assert.ok(foreign.length > 0,
    'универсам (w3) — смесь: виды ' + foreign.join(', ') +
    ' вне видов таверны');
  const w1 = C.makeCityShop(100, -40, 2, 2, 44, 1);
  const w2 = C.makeCityShop(100, -40, 2, 2, 44, 2);
  assert.ok('healing_potion' in w1.stock &&
    'healing_potion' in w2.stock, 'общий предмет в стоках w1 и w2');
  const c = PL.createCharacter();
  assert.notEqual(I.buyPrice(w1, 'healing_potion', c),
    I.buyPrice(w2, 'healing_potion', c),
    'цена покупки зависит от wealth (0.10 за уровень)');
});

// --- buy/sell: городская лавка «влезает» в СУЩЕСТВУЮЩУЮ торговлю ---

test('buyItem (существующий): покупка уменьшает сток и золото; «нет в наличии»; «мало золота»', () => {
  const C = loadCities();
  const s = C.makeCityShop(100, -40, 2, 2, 44, 2);
  const c = PL.createCharacter(); // gold = 100
  const price = I.buyPrice(s, 'healing_potion', c);
  const before = s.stock.healing_potion;
  const r = I.buyItem(s, c, 'healing_potion', 2);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(c.gold, 100 - 2 * price, 'золото − цена');
  assert.equal(I.totalQty(c, 'healing_potion'), 2, 'предмет в инвентаре');
  assert.equal(s.stock.healing_potion, before - 2, 'сток − qty');
  // Нет в наличии: реагент таверна не продаёт вовсе.
  assert.equal(I.buyItem(s, c, 'sulfur').ok, false, 'нет в наличии');
  // Мало золота.
  c.gold = 0;
  const poor = I.buyItem(s, c, 'healing_potion');
  assert.equal(poor.ok, false);
  assert.match(poor.reason, /золота/);
});

test('sellItem (существующий): золото +, инвентарь −, сток НЕ меняется (рефакторинг-безопасный факт: скупленное исчезает, в сток не возвращается); таверна НЕ скупает weapon (buildingType проходит в shopKindsFor)', () => {
  const C = loadCities();
  const s = C.makeCityShop(100, -40, 2, 2, 44, 2);
  const c = PL.createCharacter();
  const stockBefore = JSON.parse(JSON.stringify(s.stock));
  I.addItem(c, 'bread', 1);
  const sell = I.sellItem(s, c, 'bread', 1);
  assert.equal(sell.ok, true, JSON.stringify(sell));
  assert.equal(c.gold, 100 + I.sellPrice(s, 'bread', c),
    'золото + цена продажи (SELL_WEALTH_MULT)');
  assert.equal(I.totalQty(c, 'bread'), 0, 'предмет покинул инвентарь');
  assert.deepEqual(s.stock, stockBefore,
    'сток НЕ увеличивается продажей (существующая семантика)');
  // Таверна (buildingType 11) не скупает оружие.
  I.addItem(c, 'wood_sword');
  const no = I.sellItem(s, c, 'wood_sword');
  assert.equal(no.ok, false);
  assert.match(no.reason, /не скупает/);
});

// --- vm-песочницы ---

test('vm perlin → cities (БЕЗ items.js): makeCityShop → throw, сообщение называет cities.js И items.js; РЕГРЕССИЯ: createCityLayout/generateCityContents в той же песочнице работают', () => {
  const C = loadCities();
  const perlinCode = fs.readFileSync(path.join(ROOT, 'src', 'perlin.js'), 'utf8');
  const citiesCode = fs.readFileSync(CITIES_PATH, 'utf8');
  const sandbox = { console: { warn() {}, error() {}, log() {} } };
  sandbox.Game = {};
  vm.createContext(sandbox);
  vm.runInContext(perlinCode, sandbox, { filename: 'perlin.js' });
  vm.runInContext(citiesCode, sandbox, { filename: 'cities.js' });
  const G = sandbox.Game;
  assert.ok(G.Cities, 'браузерная ветка: Game.Cities');
  // РЕГРЕССИЯ: минимальная цепочка не сломана (000104/000106).
  assert.equal(G.Cities.createCityLayout(100, -40, 5).seed,
    3580905026, 'createCityLayout — как в node');
  const rec = JSON.parse(JSON.stringify(CITY_RECORDS.get(53)));
  assert.ok(G.Cities.generateCityContents(
    G.Cities.createCityLayout(100, -40, 5), 100, -40, rec, 1)
    .buildings.length >= 1, 'generateCityContents работает');
  // makeCityShop без items.js — ЯВНЫЙ throw (гард порядка,
  // паттерн 000018/000038; load-time-гарда на items.js НЕТ —
  // существующие vm-тесты цепочки perlin→cities обязаны остаться
  // зелёными).
  let err = null;
  try {
    G.Cities.makeCityShop(100, -40, 2, 2, 44, 1);
  } catch (e) { err = e; }
  assert.ok(err, 'без items.js makeCityShop обязан бросить');
  assert.match(String(err.message), /cities\.js/,
    'сообщение называет cities.js');
  assert.match(String(err.message), /items\.js/,
    'сообщение называет items.js');
});

test('vm ПОЛНАЯ цепочка (global-settings → perlin → map → skills-data → items-data → player → items → buildings → cities): G.Cities.makeCityShop работает, JSON-результат = node-результат', () => {
  const C = loadCities();
  const sandbox = {};
  const chain = ['global-settings.js', 'perlin.js', 'map.js',
    'skills-data.js', 'items-data.js', 'player.js', 'items.js',
    'buildings.js', 'cities.js'];
  for (const f of chain)
    vm.runInNewContext(
      fs.readFileSync(path.join(ROOT, 'src', f), 'utf8'), sandbox,
      { filename: f });
  const G = sandbox.Game;
  assert.ok(G.Cities, 'Game.Cities (браузерная ветка)');
  assert.equal(typeof G.Cities.makeCityShop, 'function');
  // Ленивые референсы подхватывают Game.Items/Game.BUILDINGS в
  // момент вызова — результат идентичен node (JSON, чужой realm).
  const vmShop = G.Cities.makeCityShop(100, -40, 2, 2, 44, 2);
  const nodeShop = C.makeCityShop(100, -40, 2, 2, 44, 2);
  assert.equal(JSON.stringify(vmShop), JSON.stringify(nodeShop),
    'vm и node — идентичный результат');
  // Каталог подхвачен: не-лавка в песочнице — тоже null.
  assert.equal(G.Cities.makeCityShop(100, -40, 1, 1, 7, 2), null,
    'арена — не лавка (в песочнице)');
});

// --- РЕГРЕССИЯ: мировой сток NPC (ловушка-прецедент задачи) ---

test('регрессия: мировой npcStocks (main.js) ключируется по npcId — БЕЗ ИЗМЕНЕНИЙ (src/main.js браузерный, в node не require-ается — структурный ассерт по паттерну проекта)', () => {
  const mainSrc = fs.readFileSync(path.join(ROOT, 'src', 'main.js'), 'utf8');
  assert.match(mainSrc, /const npcStocks = \{\}/,
    'npcStocks — глобальный объект');
  assert.match(mainSrc, /if \(!npcStocks\[npcId\]\)/,
    'ленивое создание по npcId');
  assert.match(mainSrc, /npcStocks\[npcId\] = shop\.stock/,
    'ключ — npcId (НЕ (город, клетка)); городской сток — другой ключ (000109)');
});

// --- Состояние города для сейва (задача 000109) ---
//
// Контракты (memory/000109-city-save-respawn.md):
//   * Чистые функции — в src/cities.js (доменный модуль; НЕ day.js —
//     require-пин выше фиксирует цепочку cities.js):
//     - validateCityStock(stock) → копия { 'tx,ty': {itemId: qty} }
//       (мусор отбрасывается, вход не мутируется);
//     - serializeCityStates(cityStates, day, respawnDays) → JSON-объект
//       раздела (копии; ОБРЕЗКА: истёкшие
//       `day − lastVisitDay >= respawnDays` и «будущие»
//       `lastVisitDay > day` отбрасываются);
//     - restoreCityStates(saved, day, respawnDays) → Map
//       (не-объект/массив → пустой Map, тихо).
//   * Запись: { lastVisitDay: int ≥ 1, stock: { 'tx,ty': {itemId: qty ≥ 0} } };
//     ключ города — ЯКОРЬ (целые координаты, отрицательные возможны).
//   * day/respawnDays — ПАРАМЕТРАМИ (конвенция 000072 restoreBuffs).
// STADIA KRASNYKH TESTOV: функций в src/cities.js ещё НЕТ — тесты ниже
// падают по осмысленной причине (нет экспорта/функциональности), не
// по синтаксической.

test('000109 R1: API — cities.js экспортирует validateCityStock/serializeCityStates/restoreCityStates (чистые функции)', () => {
  const C = loadCities();
  assert.equal(typeof C.validateCityStock, 'function',
    'cities.js: validateCityStock (контракт 000109)');
  assert.equal(typeof C.serializeCityStates, 'function',
    'cities.js: serializeCityStates (контракт 000109)');
  assert.equal(typeof C.restoreCityStates, 'function',
    'cities.js: restoreCityStates (контракт 000109)');
});

test('000109 R2: roundtrip раздела, мусор отбрасывается, входы не мутируются', () => {
  const C = loadCities();
  // Валидный раздел: отрицательный якорь, qty 0 легитимно
  // (buyItem доводит сток до 0). День 20, окно 3: оба в окне.
  const input = {
    '20,-16': { lastVisitDay: 18, stock: { '2,2': { bread: 2, honey_cake: 1 } } },
    '-114,-119': { lastVisitDay: 19, stock: { '0,0': { minor_healing: 0 } } },
  };
  const serialized = C.serializeCityStates(input, 20, 3);
  assert.deepEqual(serialized, input,
    'serialize: валидные записи переживают как есть (копия)');
  const restored = C.restoreCityStates(serialized, 20, 3);
  assert.ok(restored instanceof Map, 'restoreCityStates → Map');
  assert.equal(restored.size, 2, 'restore: обе валидные записи');
  assert.deepEqual(restored.get('20,-16'),
    { lastVisitDay: 18, stock: { '2,2': { bread: 2, honey_cake: 1 } } },
    'запись переживает roundtrip');
  assert.deepEqual(restored.get('-114,-119'),
    { lastVisitDay: 19, stock: { '0,0': { minor_healing: 0 } } },
    'roundtrip: отрицательный якорь, qty 0 — легитимно');
  // Map-вход — принимается (в-памяти состояние main.js — Map).
  const fromMap = C.serializeCityStates(restored, 20, 3);
  assert.deepEqual(fromMap, input, 'serialize: Map-вход — тот же результат');
  // ВХОДЫ не мутируются: serialize — копии; restore — чтения.
  serialized['20,-16'].stock['2,2'].bread = 999;
  serialized['-114,-119'].lastVisitDay = 999;
  assert.equal(input['20,-16'].stock['2,2'].bread, 2,
    'serialize: вход не мутирован (stock)');
  assert.equal(input['-114,-119'].lastVisitDay, 19,
    'serialize: вход не мутирован (lastVisitDay)');
  // Мусорные ЗАПИСИ — тихий отброс (000029), валидные переживают.
  const dirty = {
    '1x2': { lastVisitDay: 10, stock: { '2,2': { bread: 1 } } }, // битый ключ
    '4,4,5': { lastVisitDay: 10, stock: {} },                   // битый ключ
    '4,11': { lastVisitDay: 10, stock: { '1,0': { bread: 3 } } }, // валидная
    '7,7': { lastVisitDay: 0, stock: {} },                       // день < 1
    '8,8': { lastVisitDay: 1.5, stock: {} },                     // не целое
    '9,9': { lastVisitDay: '7', stock: {} },                     // строка
    '10,10': { stock: { '2,2': { bread: 1 } } },                 // нет дня
    '11,11': { lastVisitDay: 10 },                               // нет stock
    '12,12': { lastVisitDay: 10, stock: 'nope' },                // stock-строка
    '13,13': { lastVisitDay: 10, stock: [1, 2] },                // stock-массив
    '14,14': { lastVisitDay: 10, stock: null },                  // stock null
  };
  const dirtyOut = C.serializeCityStates(dirty, 12, 3);
  assert.deepEqual(Object.keys(dirtyOut).sort(), ['4,11'],
    'serialize: мусорные записи отброшены (осталась валидная)');
  // Мусор ВНУТРИ stock — чистится, сама запись переживает.
  const dirtyStock = {
    '4,11': {
      lastVisitDay: 10,
      stock: {
        '2,2': { bread: 3, honey_cake: 'x' }, // qty-строка — отброс
        '3x3': { bread: 1 },                  // битая клетка — отброс
        '5,6,7': { bread: 1 },                // битая клетка — отброс
        '1,0': { bread: -1 },                 // отрицательный — отброс
        '2,0': { bread: 1.5 },                // не целое — отброс
        '0,1': { bread: 0 },                  // 0 — легитимно
      },
    },
  };
  const dsOut = C.serializeCityStates(dirtyStock, 12, 3);
  assert.deepEqual(dsOut, {
    '4,11': { lastVisitDay: 10,
      stock: { '2,2': { bread: 3 }, '0,1': { bread: 0 } } },
  }, 'serialize: мусорный stock очищен, запись пережила');
  assert.deepEqual(dirtyStock['4,11'].stock['2,2'],
    { bread: 3, honey_cake: 'x' }, 'stock-вход не мутирован');
  // restore — те же правила: мусор тихо, валидные остаются, вход не
  // мутируется.
  const dirtyRestored = C.restoreCityStates(dirty, 12, 3);
  assert.ok(dirtyRestored instanceof Map, 'restore: Map (грязный вход)');
  assert.equal(dirtyRestored.size, 1, 'restore: мусорные записи отброшены');
  assert.deepEqual(dirtyRestored.get('4,11'),
    { lastVisitDay: 10, stock: { '1,0': { bread: 3 } } });
  assert.deepEqual(dirty['12,12'],
    { lastVisitDay: 10, stock: 'nope' }, 'restore: вход не мутирован');
  // Не-объект/массив — тихо (пусто), без броска.
  assert.deepEqual(C.serializeCityStates(null, 20, 3), {},
    'serialize: null → {}');
  assert.deepEqual(C.serializeCityStates([1, 2], 20, 3), {},
    'serialize: массив → {}');
  assert.deepEqual(C.serializeCityStates(42, 20, 3), {},
    'serialize: число → {}');
  const emptyMap = C.restoreCityStates(null, 20, 3);
  assert.ok(emptyMap instanceof Map && emptyMap.size === 0,
    'restore: null → пустой Map (тихо)');
  assert.equal(C.restoreCityStates([1, 2, 3], 20, 3).size, 0,
    'restore: массив → пустой Map (тихо)');
  // validateCityStock — чистая, отдельно: копия; не-объект → {};
  // вход не мутируется.
  const rawStock = { '2,2': { bread: 3, junk: 'x' }, 'bad': { bread: 1 } };
  const cleaned = C.validateCityStock(rawStock);
  assert.deepEqual(cleaned, { '2,2': { bread: 3 } },
    'validateCityStock: мусор отброшен, копия');
  assert.deepEqual(rawStock,
    { '2,2': { bread: 3, junk: 'x' }, 'bad': { bread: 1 } },
    'validateCityStock: вход не мутирован');
  assert.deepEqual(C.validateCityStock(null), {}, 'validateCityStock: null → {}');
  assert.deepEqual(C.validateCityStock([1]), {}, 'validateCityStock: массив → {}');
  assert.deepEqual(C.validateCityStock('s'), {}, 'validateCityStock: строка → {}');
});

test('000109 R3: ОБРЕЗКА при сейве И при восстановлении — истёкшие (day − lastVisitDay >= respawnDays) и «будущие» (lastVisitDay > day) отбрасываются', () => {
  const C = loadCities();
  const day = 10, r = 3;
  // Граница: last = day − r (10 − 7 = 3 ≥ 3) — отброс;
  // last = day − r + 1 (10 − 8 = 2 < 3) — остаётся.
  const boundary = {
    '1,1': { lastVisitDay: 8, stock: { '0,0': { bread: 1 } } },  // 2 < 3 — keep
    '2,2': { lastVisitDay: 7, stock: { '0,0': { bread: 1 } } },  // 3 ≥ 3 — drop
    '3,3': { lastVisitDay: 11, stock: {} },                      // будущее — drop
    '4,4': { lastVisitDay: 100, stock: {} },                     // будущее — drop
  };
  const out = C.serializeCityStates(boundary, day, r);
  assert.deepEqual(Object.keys(out), ['1,1'],
    'serialize: граница — живёт только last = day − r + 1');
  const rest = C.restoreCityStates(boundary, day, r);
  assert.equal(rest.size, 1,
    'restore: истёкшие/«будущие» отброшены (fastForward без '
    + 'слушателей — 000031: restore обрезает сам)');
  assert.deepEqual(rest.get('1,1'),
    { lastVisitDay: 8, stock: { '0,0': { bread: 1 } } },
    'restore: валидная запись — как есть');
  // Масштаб (мир бесконечен): 1000 истёкших + 5 свежих → ровно 5.
  const many = {};
  for (let i = 0; i < 1000; i++)
    many[i + ',' + i] = { lastVisitDay: 1, stock: {} }; // 10 − 1 ≥ 3
  for (let i = 0; i < 5; i++)
    many['100' + i + ',5'] =
      { lastVisitDay: 9, stock: { '0,0': { bread: i } } }; // 10 − 9 < 3
  const manyOut = C.serializeCityStates(many, day, r);
  assert.equal(Object.keys(manyOut).length, 5,
    'serialize: 1000 истёкших отброшено (без обрезки — раздувание до квоты)');
  assert.deepEqual(Object.keys(manyOut).sort(),
    ['1000,5', '1001,5', '1002,5', '1003,5', '1004,5'].sort(),
    'serialize: в окне — только свежие');
  assert.equal(C.restoreCityStates(many, day, r).size, 5,
    'restore: истёкшие отброшены и при загрузке');
});

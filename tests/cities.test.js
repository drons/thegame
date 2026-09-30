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
      0, 0, 0, 0, 0, 0, 1, 0, 0, 0,
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

test('структура исходника: ЕДИНСТВЕННЫЙ require — ./perlin.js (взаимных require в момент загрузки нет)', () => {
  // cities.js не может тянуть dungeon.js/map.js (цепочки vm-
  // песочниц tests/dungeon-ui.test.js и tests/sprites.test.js
  // грузят подмножества; прецедент 000064).
  const src = fs.readFileSync(CITIES_PATH, 'utf8');
  const reqs = [...src.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)]
    .map((m) => m[1]);
  assert.deepEqual(reqs, ['./perlin.js'],
    'cities.js обязан требовать только ./perlin.js');
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

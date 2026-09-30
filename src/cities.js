// Layout города (задача 000104, дочерняя 000052 «Города и деревни»).
//
// Детерминированный dungeon-совместимый layout города: периметр —
// стены, внутренность — открытое пространство (город НЕ лабиринт),
// вход — южный периметр, выход — северный. Seed — от ПОЗИЦИИ города
// (hash2(cityX, cityY, CITY_LAYOUT_CONST)), НЕ от опыта персонажа:
// layout статичен, один якорь → один layout навсегда. Содержимое
// (постройки/NPC/лавки) — 000106, экран/состояние — 000105.
//
// Чистое ядро без DOM — тестируется в node (tests/cities.test.js).
// Униформный модуль: в браузере — globalThis.Game (неймспейс
// Game.Cities), в node — require(). Зависимость: perlin.js
// (hash2, mulberry32) — ЕДИНСТВЕННЫЙ require; взаимных require в
// момент загрузки нет (цепочки vm-песочниц грузят подмножества).
// Решения закреплены в memory/000104-cities-layout.md; golden-пины —
// в tests/cities.test.js (смена CITY_LAYOUT_CONST после мержа
// недопустима — сменит ВСЕ города).

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./perlin.js'));
  } else {
    const G0 = typeof root.Game === 'object' ? root.Game : {};
    root.Game = Object.assign({}, G0, { Cities: factory(G0) });
  }
})(typeof globalThis !== 'undefined' ? globalThis : self, function (perlin) {

  if (!perlin || typeof perlin.hash2 !== 'function' ||
      typeof perlin.mulberry32 !== 'function') {
    throw new Error(
      'cities.js: не найден perlin.js — загрузите perlin.js до cities.js');
  }

  const hash2 = perlin.hash2;
  const mulberry32 = perlin.mulberry32;

  // Значения клеток — те же, что в dungeon.js (дungeon-совместимость:
  // dungeon-ui рисует 0/1 без изменений; константы переопределены —
  // взаимный require невозможен, равенство закреплено тестом).
  const CELL_WALL = 0;
  const CELL_FLOOR = 1;

  // Соль сида layout: НОВАЯ константа (не GLOBAL_SEED, не
  // CITY_SEED_CONST 000103, не сиды dungeon.js). GOLDEN-ПИН: смена
  // после мержа = смена ВСЕХ городских layout'ов — недопустима.
  // GLOBAL_SEED НЕ смешивается: cities.js не тянет map.js, а
  // дублировать его литерал в константе нельзя (аудит 000053).
  const CITY_LAYOUT_CONST = 0x4c41594f;

  /** Внутренний размер layout: footprint × 2 УНИФОРМНО (1→2x2, 2→4x4,
   *  5→10x10, 7→14x14; хутор fp1 — вырожденный 2x2). */
  function cityLayoutSize(footprint) {
    if (!Number.isInteger(footprint) || footprint < 1) {
      throw new Error(
        'cities.js: footprint — целое ≥ 1 (получено ' + String(footprint) + ')');
    }
    return footprint * 2;
  }

  /** Сид layout от ПОЗИЦИИ города (не totalXp, не террейн). */
  function cityLayoutSeed(cityX, cityY) {
    return hash2(cityX, cityY, CITY_LAYOUT_CONST) >>> 0;
  }

  /**
   * Layout города: dungeon-совместимая структура city-shape.
   *   { width, height, cells, entrance:{x,y}, exit:{x,y}, seed,
   *     kind: 'city' }
   * ровно 7 полей — БЕЗ type/rooms/wallObjs (город — НЕ тип
   * подземелья; 000105 не читает dungeon-поля у kind === 'city').
   *
   * Периметр — CELL_WALL; внутренность — сплошное CELL_FLOOR
   * (открытое пространство; «улицы/кварталы» не делаются).
   * entrance — южный периметр (y = height−1), exit — северный
   * (y = 0); x — из rng(mulberry32(seed)) по колоннам 1..width−2
   * (порядок вызовов rng: СНАЧАЛА entrance.x, затем exit.x —
   * golden-пин; при width=2 оба x=0 — клетки смежные, BFS
   * проходит). Layout СТАТИЧЕН: один якорь → один layout навсегда.
   * @param {number} cityX координата якоря на основной карте
   * @param {number} cityY координата якоря на основной карте
   * @param {number} footprint сторона квадрата типа города (каталог
   *        000102: 1/2/5/7; новое целое ≥ 1 — тоже валидно)
   */
  function createCityLayout(cityX, cityY, footprint) {
    const W = cityLayoutSize(footprint);
    const H = W;
    const seed = cityLayoutSeed(cityX, cityY);
    const rng = mulberry32(seed);
    const cells = new Array(W * H).fill(CELL_WALL);
    // Внутренность — открытое пространство (у хутора W=2 её нет —
    // цикл по пустому диапазону; все 4 клетки — периметр).
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) cells[y * W + x] = CELL_FLOOR;
    }
    // Колонны входа/выхода: 1..W−2 (при W=2 — 0; клетки (0,H−1) и
    // (0,0) смежны по вертикали через край, BFS проходит).
    const col = () => (W >= 3 ? 1 + Math.floor(rng() * (W - 2)) : 0);
    const entrance = { x: col(), y: H - 1 };
    const exit = { x: col(), y: 0 };
    cells[entrance.y * W + entrance.x] = CELL_FLOOR;
    cells[exit.y * W + exit.x] = CELL_FLOOR;
    return { width: W, height: H, cells, entrance, exit, seed,
      kind: 'city' };
  }

  return {
    CELL_WALL, CELL_FLOOR,
    CITY_LAYOUT_CONST,
    cityLayoutSize, cityLayoutSeed,
    createCityLayout,
  };
});

// Задача 000224 (СТАДИЯ КРАСНЫХ ТЕСТОВ, TDD): здания — анимированные
// элементы на изображениях (кузница — дым/уголь, маг-лавка — огни).
//
// Механизм — ККАДР-СВИТЧ (оверлей отклонён: не может стереть статичный
// дым, вшитый в blacksmith.svg): 4 отдельных SVG-кадра на анимированный
// слот, кадр = f(now, x, y). Идиома проекта: вода water_1..4, мобы 2 кадра
// (SPEC: «Анимация — по кадрам (отдельные файлы), а не по времени внутри
// SVG»; SMIL в SVG запрещён spec/MOBS.md).
//
// Контракты (станция Проектирование): memory/000224-building-anim-overlays.md
//   * BUILDING_FRAMES — ЛИТЕРАЛ в src/sprites.js (прецедент MOB_FRAMES/
//     TILE_FRAMES), ключи — СЛОТЫ BUILDING_TYPES: 3 (магазин магии) и
//     5 (кузница) → 4 пути 'assets/sprites/buildings/<name>_<n>.svg'.
//     Каталог assets/buildings/*.json НЕ расширяется (schema
//     additionalProperties:false + sync-гейт).
//   * buildingFrames(slot) → string[] | null: null для 0..12 без
//     анимации, NONE(−1), 999, undefined, мусора (конвенция null — как
//     buildingSprite).
//   * buildingFrameIndex(nowMs, tx, ty, frameCount) → int [0; n):
//     t = max(0, floor(nowMs / BUILDING_FRAME_MS));
//     phase = (((tx*5 + ty*9) % n) + n) % n; return (t + phase) % n.
//     Чистая функция; НЕЧИСЛОВОЕ now (NaN/±Infinity/undefined) — клампится
//     к 0 БЕЗ исключения (индекс валиден, рендер не падает).
//   * BUILDING_FRAME_MS = 800 (медленный «экологический» дрейф: медленнее
//     мобов FRAME_MS=480, не период воды 3200).
//   * Все 8 кадров — в allAssetPaths() (ЕДИНСТВЕННЫЙ pre-лоад; кадр вне
//     списка = вечный legacy-маркер в браузере).
//   * ЛОВУШКА ВОДЫ (000025): frameIndex(now, tx, ty, 4) при frameCount=4
//     уезжает в waterTileFrame (world-space фаза волны) —
//     buildingFrameIndex — ОТОБРАЖАЮЩАЯ функция, НЕ переиспользовать
//     frameIndex для 4 кадров здания.
//
// КРАСНЫЕ (падают на ТЕКУЩЕМ коде, осмысленно — экспорты отсутствуют,
// файлов кадров нет):
//   BA-1: buildingFrames/buildingFrameIndex/BUILDING_FRAME_MS —
//         экспорты sprites.js; таблица кадров (4 РАЗНЫХ кадра на слоты
//         3/5, null иначе); 8 файлов существуют и в allAssetPaths.
//   BA-2: формула buildingFrameIndex (пространственная фаза, время,
//         отрицательные координаты/now, нечисловое now → 0, диапазон
//         [0; n), полный цикл, чистота, НЕ вода).
//   BA-3: таблица — ЛИТЕРАЛ: мутация каталога «спрайт» (записи 4/8)
//         ПОСЛЕ загрузки меняет buildingSprite (ленивое чтение, R5),
//         НЕ меняет buildingFrames; база остаётся пин-базой слота;
//         кадры ≠ базы.
//
// node (не vm): sprites.js — чистый UMD-модуль (require). Интеграция
// кадров в рендер — в vm-тестах RM-BA (tests/global-map-draw.test.js)
// и CU-BA (tests/dungeon-ui.test.js).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const S = require('../src/sprites.js');
const B = require('../src/buildings.js');
const { BUILDING_TYPES } = require('../src/map.js');

const ROOT = path.join(__dirname, '..');
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

// Пины кадров (закрытые таблицы): имя = <база без расширения>_<n>.svg.
const MAGIC_FRAMES = [
  'assets/sprites/buildings/magic_shop_1.svg',
  'assets/sprites/buildings/magic_shop_2.svg',
  'assets/sprites/buildings/magic_shop_3.svg',
  'assets/sprites/buildings/magic_shop_4.svg',
];
const BLACK_FRAMES = [
  'assets/sprites/buildings/blacksmith_1.svg',
  'assets/sprites/buildings/blacksmith_2.svg',
  'assets/sprites/buildings/blacksmith_3.svg',
  'assets/sprites/buildings/blacksmith_4.svg',
];
const BASE_MAGIC = 'assets/sprites/buildings/magic_shop.svg';
const BASE_BLACK = 'assets/sprites/buildings/blacksmith.svg';

test('000224 BA-1: buildingFrames(slot) — магазин магии (слот 3) и кузница (слот 5) — по 4 РАЗНЫХ кадра; остальные слоты — null; кадры — файлы, в allAssetPaths, без дублей; BUILDING_FRAME_MS = 800', () => {
  assert.equal(typeof S.buildingFrames, 'function',
    'sprites.js: экспорт buildingFrames(slot) — отсутствует (Задача 000224)');
  assert.equal(typeof S.buildingFrameIndex, 'function',
    'sprites.js: экспорт buildingFrameIndex(nowMs, tx, ty, n) — отсутствует (Задача 000224)');
  assert.equal(S.BUILDING_FRAME_MS, 800,
    'sprites.js: BUILDING_FRAME_MS = 800 (медленнее мобов 480, не вода 3200)');
  assert.deepEqual(
    S.buildingFrames(BUILDING_TYPES.MAGIC_SHOP), MAGIC_FRAMES,
    'слот 3 (магазин магии) — 4 кадра magic_shop_1..4.svg');
  assert.deepEqual(
    S.buildingFrames(BUILDING_TYPES.BLACKSMITH), BLACK_FRAMES,
    'слот 5 (кузница) — 4 кадра blacksmith_1..4.svg');
  assert.equal(new Set(MAGIC_FRAMES).size, 4, 'кадры лавки — 4 РАЗНЫХ');
  assert.equal(new Set(BLACK_FRAMES).size, 4, 'кадры кузницы — 4 РАЗНЫХ');
  for (const slot of [0, 1, 2, 4, 6, 7, 8, 9, 10, 11, 12]) {
    assert.equal(S.buildingFrames(slot), null,
      'слот ' + slot + ' — анимации нет (null)');
  }
  for (const slot of [BUILDING_TYPES.NONE, 999, undefined, 'x', -42]) {
    assert.equal(S.buildingFrames(slot), null,
      'слот ' + String(slot) + ' — null (конвенция, как buildingSprite)');
  }
  for (const p of [...MAGIC_FRAMES, ...BLACK_FRAMES]) {
    assert.ok(exists(p), 'нет файла кадра: ' + p);
  }
  const all = S.allAssetPaths();
  for (const p of [...MAGIC_FRAMES, ...BLACK_FRAMES]) {
    assert.ok(all.includes(p),
      'кадр вне allAssetPaths (нет pre-лоада → вечный legacy-маркер): ' + p);
  }
  assert.equal(new Set(all).size, all.length, 'дублей в allAssetPaths нет');
});

test('000224 BA-2: buildingFrameIndex — чистая функция: t = max(0, floor(now/800)), phase = ((tx*5+ty*9) % n + n) % n, (t+phase) % n; нечисловое now → 0 БЕЗ исключения; НЕ вода (frameIndex(4) уходит в waterTileFrame)', () => {
  assert.equal(typeof S.buildingFrameIndex, 'function',
    'sprites.js: экспорт buildingFrameIndex — отсутствует (Задача 000224)');
  const idx = (now, tx, ty, n) => S.buildingFrameIndex(now, tx, ty, n);
  // Пространственная фаза (t = 0, n = 4): соседи рассинхронизированы.
  assert.equal(idx(0, 0, 0, 4), 0);
  assert.equal(idx(0, 1, 0, 4), 1);
  assert.equal(idx(0, 2, 0, 4), 2);
  assert.equal(idx(0, 3, 0, 4), 3);
  assert.equal(idx(0, 0, 1, 4), 1);
  assert.equal(idx(0, 0, 2, 4), 2);
  assert.equal(idx(0, 0, 3, 4), 3);
  // Отрицательные координаты — положительный остаток фазы.
  assert.equal(idx(0, -1, 0, 4), 3);
  assert.equal(idx(0, 0, -1, 4), 3);
  assert.equal(idx(0, -1, -1, 4), 2);
  // Время (фаза 0 в (0,0)): тик каждые BUILDING_FRAME_MS = 800 мс.
  assert.equal(idx(799, 0, 0, 4), 0);
  assert.equal(idx(800, 0, 0, 4), 1);
  assert.equal(idx(1599, 0, 0, 4), 1);
  assert.equal(idx(1600, 0, 0, 4), 2);
  assert.equal(idx(1000, 0, 0, 4), 1);
  assert.equal(idx(-1, 0, 0, 4), 0, 'отрицательный now — клампится к 0');
  // Нечисловой now — клампится к 0 БЕЗ исключения (индекс валиден).
  assert.equal(idx(NaN, 0, 0, 4), 0);
  assert.equal(idx(Infinity, 0, 0, 4), 0);
  assert.equal(idx(-Infinity, 0, 0, 4), 0);
  assert.equal(idx(undefined, 0, 0, 4), 0);
  // n = 1 и n = 2 (идиома 2 кадров мобов).
  assert.equal(idx(0, 7, 3, 1), 0);
  assert.equal(idx(1000, 7, 3, 1), 0);
  assert.equal(idx(0, 0, 0, 2), 0);
  assert.equal(idx(0, 1, 0, 2), 1);
  assert.equal(idx(800, 0, 0, 2), 1);
  assert.equal(idx(1600, 0, 0, 2), 0);
  // Диапазон [0; n) на всём свипе.
  for (let now = -1600; now <= 4000; now += 800) {
    for (let tx = -3; tx <= 3; tx++) {
      for (let ty = -3; ty <= 3; ty++) {
        for (const n of [2, 3, 4, 5]) {
          const v = idx(now, tx, ty, n);
          assert.ok(Number.isInteger(v) && v >= 0 && v < n,
            'индекс вне [0; ' + n + '): (' + now + ',' + tx + ',' + ty
            + ') → ' + v);
        }
      }
    }
  }
  // Полный цикл: 4 последовательных 800-мс кадра — все 4 кадра таблицы.
  const cycle = new Set(
    [0, 1, 2, 3].map((k) => idx(k * 800 + 400, 7, 3, 4)));
  assert.deepEqual([...cycle].sort((a, b) => a - b), [0, 1, 2, 3],
    'цикл 4×800 мс — все 4 кадра (анимация не застревает)');
  // Чистота (D10): два вызова — одинаковый результат.
  assert.equal(idx(1000, 5, 2, 4), idx(1000, 5, 2, 4));
  // ЛОВУШКА ВОДЫ (000025): frameIndex(now, tx, ty, 4) уезжает в
  // waterTileFrame (world-space фаза волны, период 3200) —
  // buildingFrameIndex — ОТОБРАЖАЮЩАЯ функция, не frameIndex.
  assert.notEqual(
    S.buildingFrameIndex(0, 0, 0, 4), S.frameIndex(0, 0, 0, 4),
    'кадр здания (4 кадра) — НЕ вода: frameIndex(4) = waterTileFrame');
});

test('000224 BA-3: таблица кадров — ЛИТЕРАЛ (не каталог): мутация «спрайт» записей 4/8 ПОСЛЕ загрузки меняет buildingSprite (ленивое чтение, R5) и НЕ меняет buildingFrames; база — пин слота; кадры ≠ базы', () => {
  assert.equal(typeof S.buildingFrames, 'function',
    'sprites.js: экспорт buildingFrames(slot) — отсутствует (Задача 000224)');
  const before3 = S.buildingFrames(BUILDING_TYPES.MAGIC_SHOP);
  const before5 = S.buildingFrames(BUILDING_TYPES.BLACKSMITH);
  const rec4 = B.BUILDINGS.find((b) => b.id === 4);
  const rec8 = B.BUILDINGS.find((b) => b.id === 8);
  assert.ok(rec4 && rec8,
    'каталог: записи 4 (магазин магии) и 8 (кузница)');
  const orig4 = rec4.спрайт;
  const orig8 = rec8.спрайт;
  try {
    rec4.спрайт = 'assets/sprites/buildings/divergent_000224.svg';
    rec8.спрайт = 'assets/sprites/buildings/divergent_000224b.svg';
    assert.equal(S.buildingSprite(BUILDING_TYPES.MAGIC_SHOP),
      'assets/sprites/buildings/divergent_000224.svg',
      'buildingSprite(3) — ленивое чтение каталога (мутация отражена, R5)');
    assert.equal(S.buildingSprite(BUILDING_TYPES.BLACKSMITH),
      'assets/sprites/buildings/divergent_000224b.svg',
      'buildingSprite(5) — ленивое чтение каталога (мутация отражена, R5)');
    assert.deepEqual(S.buildingFrames(BUILDING_TYPES.MAGIC_SHOP), before3,
      'buildingFrames(3) — ЛИТЕРАЛ: мутация каталога НЕ меняет кадры');
    assert.deepEqual(S.buildingFrames(BUILDING_TYPES.BLACKSMITH), before5,
      'buildingFrames(5) — ЛИТЕРАЛ: мутация каталога НЕ меняет кадры');
  } finally {
    rec4.спрайт = orig4;
    rec8.спрайт = orig8;
  }
  assert.equal(S.buildingSprite(BUILDING_TYPES.MAGIC_SHOP), BASE_MAGIC,
    'база слота 3 — magic_shop.svg (пин, иконка [E] статична)');
  assert.equal(S.buildingSprite(BUILDING_TYPES.BLACKSMITH), BASE_BLACK,
    'база слота 5 — blacksmith.svg (пин, иконка [E] статична)');
  const all8 = [...MAGIC_FRAMES, ...BLACK_FRAMES];
  assert.equal(new Set(all8).size, 8, '8 кадров — 8 РАЗНЫХ путей');
  for (const p of all8) {
    assert.notEqual(p, BASE_MAGIC, 'кадр ≠ база магазина магии');
    assert.notEqual(p, BASE_BLACK, 'кадр ≠ база кузницы');
  }
});

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
// Задача 000238 (волна 1, СТАДИЯ КРАСНЫХ ТЕСТОВ): расширение
// кадр-свитча на слот 2 «Аптекарь» (id 3), слот 7 «Школа акробатов»
// (id 11), город 53 (на карте — MV-C3/C4) и лагерь 47 (костёр).
// Контракты: memory/000238-building-anim-extension.md
//   * BUILDING_FRAMES — новые строки 2/7 (4 РАЗНЫХ кадра
//     apothecary_1..4.svg / academy_1..4.svg); кадр 1 = БАЙТ-КОПИЯ
//     статичной базы (идеология 000224: кадры 2–4 — та же композиция,
//     движется только анимированный элемент); остальные слоты — null.
//   * CITY_FRAMES — СВОЯ таблица (ключ — buildingId, не слот: города —
//     не слоты, 000103): {53: [city_53_1..4.svg]} (5×5 = 320×320);
//     селектор cityFrames(buildingId) — Number.isInteger-гард +
//     конвенция null; ЛИТЕРАЛ; CITY_SPRITES/citySprite — БАЗЫ
//     (SP-C1/C2 интактны).
//   * CAMP_FRAMES — СВОЯ таблица: {47: [camp_1..4.svg]} (семья
//     buildings/); селектор campFrames(buildingId); ЛИТЕРАЛ;
//     CAMP_SPRITES/campSprite — БАЗА (SP-47 интактен).
//   * allAssetPaths — все 16 новых кадров (ЕДИНСТВЕННЫЙ pre-лоад),
//     без дублей.
//
// КРАСНЫЕ 000238 (падают на ТЕКУЩЕМ коде, осмысленно):
//   BA-4: строки BUILDING_FRAMES[2]/[7] отсутствуют (null) + 8 файлов
//         кадров нет;
//   BA-5: экспорты S.CITY_FRAMES/S.cityFrames отсутствуют (typeof
//         'undefined'), 4 файла city_53_1..4.svg нет;
//   BA-6: экспорты S.CAMP_FRAMES/S.campFrames отсутствуют (typeof
//         'undefined'), 4 файла camp_1..4.svg нет.
//
// node (не vm): sprites.js — чистый UMD-модуль (require). Интеграция
// кадров в рендер — в vm-тестах RM-BA/RM-CAMP (tests/global-map-draw.
// test.js), MV-C (tests/main-visuals.test.js), CP-12
// (tests/camp-map-e2e.test.js) и CU-BA (tests/dungeon-ui.test.js).

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
  // 000238: слоты 2 (Аптекарь) и 7 (академия) получают кадры —
  // из null-списка исключены (пони — BA-4).
  for (const slot of [0, 1, 4, 6, 8, 9, 10, 11, 12]) {
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

// --- Задача 000238 (волна 1): пины кадров новых строителей.
// Имя кадра = <база без расширения>_<n>.svg (идиома 000224).
const APOT_FRAMES = [
  'assets/sprites/buildings/apothecary_1.svg',
  'assets/sprites/buildings/apothecary_2.svg',
  'assets/sprites/buildings/apothecary_3.svg',
  'assets/sprites/buildings/apothecary_4.svg',
];
const ACAD_FRAMES = [
  'assets/sprites/buildings/academy_1.svg',
  'assets/sprites/buildings/academy_2.svg',
  'assets/sprites/buildings/academy_3.svg',
  'assets/sprites/buildings/academy_4.svg',
];
const BASE_APOT = 'assets/sprites/buildings/apothecary.svg';
const BASE_ACAD = 'assets/sprites/buildings/academy.svg';
// Город 53 = 5×5 (320×320, каталог 000053) — кадры в СВОЕЙ таблице
// CITY_FRAMES (ключ — buildingId), не в BUILDING_FRAMES (слоты).
const CITY53_FRAMES = [
  'assets/sprites/cities/city_53_1.svg',
  'assets/sprites/cities/city_53_2.svg',
  'assets/sprites/cities/city_53_3.svg',
  'assets/sprites/cities/city_53_4.svg',
];
const BASE_CITY53 = 'assets/sprites/cities/city_53.svg';
// Лагерь 47 — костёр, кадры в СВОЕЙ таблице CAMP_FRAMES (семья
// buildings/ — тот же каталог спрайтов, что и база camp.svg).
const CAMP47_FRAMES = [
  'assets/sprites/buildings/camp_1.svg',
  'assets/sprites/buildings/camp_2.svg',
  'assets/sprites/buildings/camp_3.svg',
  'assets/sprites/buildings/camp_4.svg',
];
const BASE_CAMP = 'assets/sprites/buildings/camp.svg';

// buildingId каталожных записей слотовых построек (особые_параметры.
// map_index: 0..12 → id) — для null-гардов селекторов городов/лагеря:
// слотовые id НЕ города и НЕ лагерь → null.
const SLOT_IDS = [1, 2, 3, 4, 7, 8, 10, 11, 36, 31, 40, 44, 25];

test('000238 BA-4: BUILDING_FRAMES[2] (Аптекарь) и [7] (академия) — по 4 РАЗНЫХ кадра apothecary_1..4.svg / academy_1..4.svg; остальные слоты (0,1,4,6,8,9,10,11,12) — null; кадр 1 = байт-копия статичной базы; кадры — файлы, в allAssetPaths, без дублей', () => {
  assert.equal(typeof S.buildingFrames, 'function',
    'sprites.js: экспорт buildingFrames(slot) — отсутствует (Задача 000224)');
  assert.deepEqual(
    S.buildingFrames(BUILDING_TYPES.APOTHECARY), APOT_FRAMES,
    'строка BUILDING_FRAMES[2] (Аптекарь) — 4 кадра apothecary_1..4.svg (Задача 000238)');
  assert.deepEqual(
    S.buildingFrames(BUILDING_TYPES.ACADEMY), ACAD_FRAMES,
    'строка BUILDING_FRAMES[7] (академия) — 4 кадра academy_1..4.svg (Задача 000238)');
  assert.equal(new Set(APOT_FRAMES).size, 4, 'кадры аптекаря — 4 РАЗНЫХ');
  assert.equal(new Set(ACAD_FRAMES).size, 4, 'кадры академии — 4 РАЗНЫХ');
  for (const slot of [0, 1, 4, 6, 8, 9, 10, 11, 12]) {
    assert.equal(S.buildingFrames(slot), null,
      'слот ' + slot + ' — анимации нет (null)');
  }
  const all16 = [...MAGIC_FRAMES, ...BLACK_FRAMES, ...APOT_FRAMES, ...ACAD_FRAMES];
  assert.equal(new Set(all16).size, 16, '16 кадров — 16 РАЗНЫХ путей');
  for (const p of all16) {
    assert.ok(exists(p), 'нет файла кадра: ' + p);
  }
  // КАДР 1 = БАЙТ-КОПИЯ статичной базы (идеология 000224: кадры 2–4 —
  // та же композиция, движется только анимированный элемент).
  assert.equal(Buffer.compare(
    fs.readFileSync(path.join(ROOT, APOT_FRAMES[0])),
    fs.readFileSync(path.join(ROOT, BASE_APOT))), 0,
    'apothecary_1.svg — байт-копия apothecary.svg');
  assert.equal(Buffer.compare(
    fs.readFileSync(path.join(ROOT, ACAD_FRAMES[0])),
    fs.readFileSync(path.join(ROOT, BASE_ACAD))), 0,
    'academy_1.svg — байт-копия academy.svg');
  const all = S.allAssetPaths();
  for (const p of all16) {
    assert.ok(all.includes(p),
      'кадр вне allAssetPaths (нет pre-лоада → вечный legacy-маркер): ' + p);
  }
  assert.equal(new Set(all).size, all.length, 'дублей в allAssetPaths нет');
});

test('000238 BA-5: CITY_FRAMES/cityFrames(53) — 4 РАЗНЫХ кадра city_53_1..4.svg (320×320); город НЕ слот — таблица по buildingId; cityFrames(51/52/54/47/слотовые id/999/−1/нецелое/строка/неопределённое) → null; кадр 1 = байт-копия city_53.svg; кадры — файлы, в allAssetPaths; таблица — ЛИТЕРАЛ; CITY_SPRITES/citySprite(53) — БАЗА (SP-C1/C2 интактны)', () => {
  assert.equal(typeof S.cityFrames, 'function',
    'sprites.js: экспорт cityFrames(buildingId) — отсутствует (Задача 000238)');
  assert.ok(S.CITY_FRAMES && typeof S.CITY_FRAMES === 'object',
    'sprites.js: экспорт CITY_FRAMES (таблица кадров городов) — отсутствует (Задача 000238)');
  assert.deepEqual(Object.keys(S.CITY_FRAMES), ['53'],
    'CITY_FRAMES — ровно одна строка: 53 (волна 1; 51/52/54 — волна 2)');
  assert.deepEqual(S.cityFrames(53), CITY53_FRAMES,
    'cityFrames(53) — 4 кадра city_53_1..4.svg');
  assert.equal(new Set(CITY53_FRAMES).size, 4, 'кадры города 53 — 4 РАЗНЫХ');
  for (const id of [51, 52, 54, 47, 999, -1,
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, ...SLOT_IDS,
    '53', 53.5, undefined, null, NaN]) {
    assert.equal(S.cityFrames(id), null,
      'cityFrames(' + String(id) + ') — null (городов там нет)');
  }
  for (const p of CITY53_FRAMES) {
    assert.ok(exists(p), 'нет файла кадра: ' + p);
  }
  // Город 53 = 5×5 → viewBox кадров = базе (320×320, каталог 000053).
  for (const p of CITY53_FRAMES) {
    assert.ok(
      fs.readFileSync(path.join(ROOT, p), 'utf8').includes('viewBox="0 0 320 320"'),
      'viewBox 320×320 у кадра: ' + p);
  }
  assert.equal(Buffer.compare(
    fs.readFileSync(path.join(ROOT, CITY53_FRAMES[0])),
    fs.readFileSync(path.join(ROOT, BASE_CITY53))), 0,
    'city_53_1.svg — байт-копия city_53.svg');
  const all = S.allAssetPaths();
  for (const p of CITY53_FRAMES) {
    assert.ok(all.includes(p),
      'кадр вне allAssetPaths (нет pre-лоада → вечный skip города): ' + p);
  }
  assert.equal(new Set(all).size, all.length, 'дублей в allAssetPaths нет');
  // ЛИТЕРАЛ: мутация «спрайт» каталога 53 — citySprite меняется
  // (ленивое чтение, R5), cityFrames — НЕТ.
  const rec53 = B.BUILDINGS.find((b) => b.id === 53);
  assert.ok(rec53, 'каталог: запись 53');
  const orig53 = rec53.спрайт;
  try {
    rec53.спрайт = 'assets/sprites/cities/divergent_000238.svg';
    assert.equal(S.citySprite(53), 'assets/sprites/cities/divergent_000238.svg',
      'citySprite(53) — ленивое чтение каталога (мутация отражена, R5)');
    assert.deepEqual(S.cityFrames(53), CITY53_FRAMES,
      'cityFrames(53) — ЛИТЕРАЛ: мутация каталога НЕ меняет кадры');
  } finally {
    rec53.спрайт = orig53;
  }
  assert.deepEqual(S.CITY_SPRITES, {
    51: 'assets/sprites/cities/city_51.svg',
    52: 'assets/sprites/cities/city_52.svg',
    53: 'assets/sprites/cities/city_53.svg',
    54: 'assets/sprites/cities/city_54.svg',
  }, 'CITY_SPRITES — БАЗЫ, НЕ расширяется (SP-C2); кадры — отдельная CITY_FRAMES');
  assert.equal(S.citySprite(53), BASE_CITY53,
    'citySprite(53) — БАЗА city_53.svg (селектор баз интактен)');
});

test('000238 BA-6: CAMP_FRAMES/campFrames(47) — 4 РАЗНЫХ кадра camp_1..4.svg (семья buildings/); лагерь НЕ слот — таблица по buildingId; campFrames(слотовые id/51..54/999/−1/нецелое/строка/неопределённое) → null; кадр 1 = байт-копия camp.svg; кадры — файлы, в allAssetPaths; таблица — ЛИТЕРАЛ; CAMP_SPRITES/campSprite(47) — БАЗА (SP-47 интактен)', () => {
  assert.equal(typeof S.campFrames, 'function',
    'sprites.js: экспорт campFrames(buildingId) — отсутствует (Задача 000238)');
  assert.ok(S.CAMP_FRAMES && typeof S.CAMP_FRAMES === 'object',
    'sprites.js: экспорт CAMP_FRAMES (таблица кадров костра) — отсутствует (Задача 000238)');
  assert.deepEqual(Object.keys(S.CAMP_FRAMES), ['47'],
    'CAMP_FRAMES — ровно одна строка: 47 (лагерь)');
  assert.deepEqual(S.campFrames(47), CAMP47_FRAMES,
    'campFrames(47) — 4 кадра camp_1..4.svg');
  assert.equal(new Set(CAMP47_FRAMES).size, 4, 'кадры костра — 4 РАЗНЫХ');
  for (const id of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ...SLOT_IDS, 51, 52, 53, 54, 999, -1, '47', 47.5, undefined, null, NaN]) {
    assert.equal(S.campFrames(id), null,
      'campFrames(' + String(id) + ') — null (лагеря там нет)');
  }
  for (const p of CAMP47_FRAMES) {
    assert.ok(exists(p), 'нет файла кадра: ' + p);
  }
  // Костёр — 64×64 (семья buildings/, как база camp.svg).
  for (const p of CAMP47_FRAMES) {
    assert.ok(
      fs.readFileSync(path.join(ROOT, p), 'utf8').includes('viewBox="0 0 64 64"'),
      'viewBox 64×64 у кадра: ' + p);
  }
  assert.equal(Buffer.compare(
    fs.readFileSync(path.join(ROOT, CAMP47_FRAMES[0])),
    fs.readFileSync(path.join(ROOT, BASE_CAMP))), 0,
    'camp_1.svg — байт-копия camp.svg');
  const all = S.allAssetPaths();
  for (const p of CAMP47_FRAMES) {
    assert.ok(all.includes(p),
      'кадр вне allAssetPaths (нет pre-лоада → вечный skip лагеря): ' + p);
  }
  assert.equal(new Set(all).size, all.length, 'дублей в allAssetPaths нет');
  // ЛИТЕРАЛ: мутация «спрайт» каталога 47 — campSprite меняется
  // (ленивое чтение, R5), campFrames — НЕТ.
  const rec47 = B.BUILDINGS.find((b) => b.id === 47);
  assert.ok(rec47, 'каталог: запись 47');
  const orig47 = rec47.спрайт;
  try {
    rec47.спрайт = 'assets/sprites/buildings/divergent_000238.svg';
    assert.equal(S.campSprite(47), 'assets/sprites/buildings/divergent_000238.svg',
      'campSprite(47) — ленивое чтение каталога (мутация отражена, R5)');
    assert.deepEqual(S.campFrames(47), CAMP47_FRAMES,
      'campFrames(47) — ЛИТЕРАЛ: мутация каталога НЕ меняет кадры');
  } finally {
    rec47.спрайт = orig47;
  }
  assert.deepEqual(S.CAMP_SPRITES,
    { 47: 'assets/sprites/buildings/camp.svg' },
    'CAMP_SPRITES — БАЗА, НЕ расширяется (SP-47); кадры — отдельная CAMP_FRAMES');
  assert.equal(S.campSprite(47), BASE_CAMP,
    'campSprite(47) — БАЗА camp.svg (селектор баз интактен)');
});

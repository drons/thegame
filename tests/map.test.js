const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  createMap, syntheticPixels,
  visibleTileRange, createTileCache,
  ZOOM_MIN, ZOOM_MAX, ZOOM_START,
  TERRAIN, TERRAIN_NAMES,
  BUILDING_COUNT, BUILDING_TYPES,
  MOB_GROUP_COUNT, MOB_GROUP_TYPES,
} = require('../src/map.js');
const { generateSeedPixels, MAP_PNG_SIZE, MAP_PNG_SEED } = require('../src/mapseed.js');
const { decodePng } = require('./png.js');

const VALID_TERRAINS = new Set(Object.values(TERRAIN));

test('tileAt детерминирован: повторный вызов даёт тот же тайл', () => {
  const map = createMap();
  for (let i = 0; i < 100; i++) {
    const x = Math.floor(Math.random() * 1000) - 500;
    const y = Math.floor(Math.random() * 1000) - 500;
    assert.deepEqual(map.tileAt(x, y), map.tileAt(x, y));
  }
});

test('два createMap с теми же пикселями дают одинаковый мир', () => {
  const px = syntheticPixels(16, 16, 100, 200, 50, 255);
  const m1 = createMap(px);
  const m2 = createMap(px);
  for (let i = 0; i < 200; i++) {
    const x = Math.floor(Math.random() * 500) - 250;
    const y = Math.floor(Math.random() * 500) - 250;
    assert.deepEqual(m1.tileAt(x, y), m2.tileAt(x, y));
  }
});

test('сэмпл мира: валидные значения и согласованность полей', () => {
  const map = createMap();
  let water = 0, land = 0, buildings = 0, groups = 0;
  for (let x = -100; x < 100; x++) {
    for (let y = -100; y < 100; y++) {
      const t = map.tileAt(x, y);
      assert.ok(VALID_TERRAINS.has(t.terrain), `неизвестный terrain ${t.terrain}`);
      assert.ok(TERRAIN_NAMES[t.terrain], 'нет имени для terrain');
      assert.equal(typeof t.passable, 'boolean');
      if (t.hasBuilding) {
        buildings++;
        assert.ok(t.passable, 'постройка на непроходимом тайле');
        assert.ok(t.building >= 0 && t.building < BUILDING_COUNT);
        assert.ok(!t.hasMobGroup, 'постройка и группа мобов в одном тайле');
      }
      if (t.hasMobGroup) {
        groups++;
        assert.ok(t.passable, 'группа мобов на непроходимом тайле');
        assert.ok(t.mobGroup >= 0 && t.mobGroup < MOB_GROUP_COUNT);
      }
      if (t.terrain === TERRAIN.WATER || t.terrain === TERRAIN.DEEP_WATER) water++;
      if (t.passable) land++;
    }
  }
  // Мир должен быть разнообразен и иметь и сушу, и воду.
  assert.ok(water > 1000, `слишком мало воды: ${water}`);
  assert.ok(land > 10000, `слишком мало суши: ${land}`);
  assert.ok(buildings > 10, `слишком мало построек: ${buildings}`);
  assert.ok(groups > 10, `слишком мало групп мобов: ${groups}`);
});

test('непроходимые тайлы: вода и горы, проходимые: остальное', () => {
  const map = createMap();
  for (let x = -50; x < 50; x++) {
    for (let y = -50; y < 50; y++) {
      const t = map.tileAt(x, y);
      const blocked = t.terrain === TERRAIN.WATER ||
        t.terrain === TERRAIN.DEEP_WATER ||
        t.terrain === TERRAIN.MOUNTAIN;
      assert.equal(t.passable, !blocked);
    }
  }
});

test('pixelAt периодически повторяется по модулю размеров (бесконечная карта)', () => {
  const px = syntheticPixels(17, 13, 1, 2, 3, 4);
  const map = createMap(px);
  const base = map.pixelAt(5, 7);
  assert.deepEqual(base, [1, 2, 3, 4]);
  // Сдвиг на целый размер — тот же пиксель.
  assert.deepEqual(map.pixelAt(5 + 17, 7), base);
  assert.deepEqual(map.pixelAt(5, 7 + 13), base);
  assert.deepEqual(map.pixelAt(5 + 17, 7 + 13), base);
  // Отрицательные координаты — тоже корректно (модуль).
  assert.deepEqual(map.pixelAt(5 - 17, 7 - 13), map.pixelAt(5 - 17 + 17, 7 - 13 + 13));
  assert.deepEqual(map.pixelAt(-1, -1), map.pixelAt(16, 12));
});

test('пиксель map.png влияет на рельеф: уровень моря сдвигается каналом R', () => {
  // Tёмный R (r=0) → море поднимается, светлый (r=255) → отступает.
  const low = createMap(syntheticPixels(8, 8, 0, 128, 128, 255));
  const high = createMap(syntheticPixels(8, 8, 255, 128, 128, 255));
  let differ = 0;
  let lowIsWater = 0;
  for (let x = -50; x < 50; x++) {
    for (let y = -50; y < 50; y++) {
      const a = low.tileAt(x, y);
      const b = high.tileAt(x, y);
      if (a.terrain !== b.terrain) differ++;
      if (a.terrain === TERRAIN.WATER || a.terrain === TERRAIN.DEEP_WATER) lowIsWater++;
    }
  }
  assert.ok(differ > 500, `канал R почти не влияет на рельеф: ${differ} различий`);
  assert.ok(lowIsWater > 2000, `R=0 должен давать больше воды, а их ${lowIsWater}`);
});

test('плотность фич зависит от канала A (тёмный альфа = реже)', () => {
  const dense = createMap(syntheticPixels(8, 8, 128, 128, 128, 255));
  const sparse = createMap(syntheticPixels(8, 8, 128, 128, 128, 0));
  let denseCount = 0, sparseCount = 0;
  const N = 300;
  for (let x = -N; x < N; x++) {
    for (let y = -N; y < N; y++) {
      const a = dense.tileAt(x, y);
      const b = sparse.tileAt(x, y);
      if (a.hasBuilding || a.hasMobGroup) denseCount++;
      if (b.hasBuilding || b.hasMobGroup) sparseCount++;
    }
  }
  assert.ok(denseCount > sparseCount * 2,
    `A=255 должен давать чаще фичи: dense=${denseCount}, sparse=${sparseCount}`);
});

test('assets/map.png: декодируется, 256x256, совпадает с генератором', () => {
  const { width, height, data } = decodePng('assets/map.png');
  assert.equal(width, MAP_PNG_SIZE);
  assert.equal(height, MAP_PNG_SIZE);
  const expected = generateSeedPixels(MAP_PNG_SIZE, MAP_PNG_SEED);
  assert.deepEqual(Buffer.from(data), Buffer.from(expected.data),
    'map.png расходится с генератором');
});

test('карта с реальным assets/map.png: детерминирована и валидна', () => {
  const { width, height, data } = decodePng('assets/map.png');
  const map = createMap({ width, height, data });
  assert.equal(map.width, 256);
  assert.equal(map.height, 256);
  const t1 = map.tileAt(12345, -6789);
  const t2 = map.tileAt(12345, -6789);
  assert.deepEqual(t1, t2);
  assert.ok(VALID_TERRAINS.has(t1.terrain));
  // Проверка выборки с повтором: тайлы (x, y) и (x+256, y) используют один пиксель.
  assert.deepEqual(map.pixelAt(12345, -6789), map.pixelAt(12345 + 256, -6789));
});

test('brightness детерминирован и ограничен', () => {
  const map = createMap();
  for (let i = 0; i < 100; i++) {
    const x = Math.floor(Math.random() * 100) - 50;
    const y = Math.floor(Math.random() * 100) - 50;
    const b1 = map.brightness(x, y);
    assert.equal(b1, map.brightness(x, y));
    assert.ok(Math.abs(b1) <= 1);
  }
});

test('BUILDING_TYPES.NONE / MOB_GROUP_TYPES.NONE равны -1', () => {
  assert.equal(BUILDING_TYPES.NONE, -1);
  assert.equal(MOB_GROUP_TYPES.NONE, -1);
});

// --- Задача 000019: крупный стартовый зум и диапазон видимых тайлов ---

test('стартовый зум крупный (64–96 px) и в пределах шкалы зума', () => {
  assert.ok(ZOOM_START >= 64 && ZOOM_START <= 96,
    `стартовый зум ${ZOOM_START} вне диапазона 64–96 px`);
  assert.ok(ZOOM_MIN <= ZOOM_START && ZOOM_START <= ZOOM_MAX,
    'стартовый зум вне [ZOOM_MIN; ZOOM_MAX]');
});

test('visibleTileRange: покрывает всё видимое окно плюс запас', () => {
  // Окно 1920x1080, зум 40: видно 48x27 тайлов, +2 по осям.
  const r = visibleTileRange(10.5, -20.5, 1920, 1080, 40);
  assert.equal(r.x1 - r.x0 + 1, Math.ceil(1920 / 40) + 2);
  assert.equal(r.y1 - r.y0 + 1, Math.ceil(1080 / 40) + 2);
  // Центр камеры (в непрерывных координатах) внутри диапазона тайлов.
  assert.ok(r.x0 <= 10.5 && 10.5 < r.x1 + 1);
  assert.ok(r.y0 <= -20.5 && -20.5 < r.y1 + 1);
  assert.ok(r.x0 <= Math.floor(10.5) && Math.floor(10.5) <= r.x1);
  assert.ok(r.y0 <= Math.floor(-20.5) && Math.floor(-20.5) <= r.y1);
});

test('visibleTileRange: целочисленные границы, корректны для отрицательных координат', () => {
  const r = visibleTileRange(-100.5, 3.2, 800, 600, 14);
  for (const k of ['x0', 'y0', 'x1', 'y1']) {
    assert.ok(Number.isInteger(r[k]), `${k} не целое: ${r[k]}`);
  }
  assert.ok(r.x0 < -100 && r.x1 > -100, 'диапазон не содержит центр камеры по X');
  assert.ok(r.y0 < 3 && r.y1 > 3, 'диапазон не содержит центр камеры по Y');
  assert.ok(r.x0 <= r.x1 && r.y0 <= r.y1);
  // Размер диапазона не зависит от позиции камеры.
  const r2 = visibleTileRange(500.5, 500.2, 800, 600, 14);
  assert.equal(r2.x1 - r2.x0, r.x1 - r.x0);
  assert.equal(r2.y1 - r2.y0, r.y1 - r.y0);
});

test('visibleTileRange: зум out и больший запас увеличивают диапазон', () => {
  const base = visibleTileRange(0, 0, 1000, 800, 20);
  const wide = visibleTileRange(0, 0, 1000, 800, 20, 8);
  assert.ok(wide.x1 - wide.x0 > base.x1 - base.x0, 'запас не увеличил диапазон');
  const zoomedOut = visibleTileRange(0, 0, 1000, 800, 5);
  assert.ok(zoomedOut.x1 - zoomedOut.x0 > base.x1 - base.x0, 'зум out не увеличил диапазон');
  assert.ok(zoomedOut.y1 - zoomedOut.y0 > base.y1 - base.y0);
});

test('createTileCache: тайл совпадает с tileAt и не пересчитывается', () => {
  const map = createMap();
  const calls = new Map(); // 'x,y' → число вызовов tileAt
  const proxy = {
    tileAt: (x, y) => {
      const k = x + ',' + y;
      calls.set(k, (calls.get(k) || 0) + 1);
      return map.tileAt(x, y);
    },
  };
  const cache = createTileCache(proxy, 1000);
  for (let i = 0; i < 50; i++) {
    const x = Math.floor(Math.random() * 200) - 100;
    const y = Math.floor(Math.random() * 200) - 100;
    const t1 = cache.tile(x, y);
    assert.deepEqual(t1, map.tileAt(x, y));
    assert.equal(cache.tile(x, y), t1, 'повторный запрос должен идти из кэша');
  }
  // Каждая координата сгенерирована ровно один раз.
  for (const [k, n] of calls) assert.equal(n, 1, `тайл ${k} пересчитан`);
});

test('createTileCache: ограничен — при переполнении вытесняются старые тайлы', () => {
  let generated = 0;
  const map = { tileAt: (x, y) => { generated++; return { x, y }; } };
  const cache = createTileCache(map, 4);
  for (let x = 0; x < 10; x++) cache.tile(x, 0);
  assert.equal(generated, 10, 'все тайлы должны сгенерироваться');
  assert.ok(cache.size() <= 4, `кэш не ограничен: ${cache.size()}`);
  // Самые ранние тайлы вытеснены — запрос их пересчитывает.
  cache.tile(0, 0);
  assert.equal(generated, 11, 'вытесненный тайл должен пересчитаться');
  // Последние тайлы в кэше — пересчёта нет.
  cache.tile(9, 0);
  assert.equal(generated, 11);
});

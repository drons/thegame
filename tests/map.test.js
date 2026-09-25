const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  createMap, syntheticPixels,
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

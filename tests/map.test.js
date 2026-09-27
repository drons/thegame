const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  createMap, syntheticPixels,
  visibleTileRange, createTileCache,
  ZOOM_MIN, ZOOM_MAX, ZOOM_START,
  TERRAIN, TERRAIN_NAMES,
  BUILDING_COUNT, BUILDING_TYPES,
  BUILD_MAX_W, BUILD_MAX_H,
  MOB_GROUP_COUNT, MOB_GROUP_TYPES,
} = require('../src/map.js');
const { BUILDINGS, buildingSize } = require('../src/buildings.js');
const { generateSeedPixels, MAP_PNG_SIZE, MAP_PNG_SEED } = require('../src/mapseed.js');
const { decodePng } = require('./png.js');
const fs = require('node:fs');
const vm = require('node:vm');

// «Браузерный» путь UMD: исполняем файл в чистом контексте без module/exports
// (паттерн tests/global-settings.test.js).
function loadInSandbox(file, sandbox) {
  const code = fs.readFileSync(__dirname + '/../src/' + file, 'utf8');
  vm.runInNewContext(code, sandbox);
}

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

test('непроходимые тайлы: вода, горы и стены построек', () => {
  // Стена — тайл footprint'а постройки, НЕ вход (задача 000026):
  // постройка стоит на земле, но внутри её нельзя ходить.
  const map = createMap();
  for (let x = -50; x < 50; x++) {
    for (let y = -50; y < 50; y++) {
      const t = map.tileAt(x, y);
      const blocked = t.terrain === TERRAIN.WATER ||
        t.terrain === TERRAIN.DEEP_WATER ||
        t.terrain === TERRAIN.MOUNTAIN;
      const wall = t.inBuilding && !t.isEntrance;
      assert.equal(t.passable, !blocked && !wall,
        `(${x},${y}): terrain=${t.terrain} inBuilding=${t.inBuilding} entrance=${t.isEntrance}`);
      if (t.inBuilding) {
        assert.equal(t.hasMobGroup, false, `(${x},${y}): в footprint'е постройки нет группы мобов`);
      }
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

// --- Задача 000026: footprint'ы построек на карте ---

test('BUILD_MAX_W/H покрывают максимальный размер в каталоге', () => {
  let maxW = 1, maxH = 1;
  for (const b of BUILDINGS) {
    const { width, height } = buildingSize(b);
    maxW = Math.max(maxW, width);
    maxH = Math.max(maxH, height);
  }
  assert.ok(maxW <= BUILD_MAX_W, `каталог шире окна поиска: ${maxW} > ${BUILD_MAX_W}`);
  assert.ok(maxH <= BUILD_MAX_H, `каталог выше окна поиска: ${maxH} > ${BUILD_MAX_H}`);
});

test("мировые постройки: прямоугольные footprint'ы без пересечений, один вход", () => {
  const map = createMap();
  const R = 100;
  // Группируем тайлы по якорю постройки.
  const groups = new Map();
  let multiTile = 0, oneTile = 0;
  for (let x = -R; x < R; x++) {
    for (let y = -R; y < R; y++) {
      const t = map.tileAt(x, y);
      if (!t.inBuilding) continue;
      const key = t.buildingAnchor.join(',');
      if (!groups.has(key)) {
        groups.set(key, {
          ax: t.buildingAnchor[0],
          ay: t.buildingAnchor[1],
          type: t.building,
          wealth: t.buildingWealth,
          tiles: new Set(),
          entrances: [],
        });
      }
      const g = groups.get(key);
      g.tiles.add(x + ',' + y);
      assert.equal(t.building, g.type, `(${x},${y}): тип постройки в footprint'е не один`);
      assert.equal(t.buildingWealth, g.wealth, `(${x},${y}): богатство в footprint'е не одно`);
      if (t.isEntrance) {
        g.entrances.push([x, y]);
        assert.equal(t.hasBuilding, true, `(${x},${y}): вход = hasBuilding`);
        assert.equal(t.passable, true, `(${x},${y}): вход проходим`);
        assert.equal(t.hasMobGroup, false, `(${x},${y}): на входе нет группы мобов`);
      } else if (t.inBuilding) {
        assert.equal(t.hasBuilding, false, `(${x},${y}): hasBuilding только на входе`);
        assert.equal(t.passable, false, `(${x},${y}): стена непроходима`);
      }
    }
  }
  assert.ok(groups.size > 50, `слишком мало построек в сэмпле: ${groups.size}`);
  for (const g of groups.values()) {
    if (g.tiles.size > 1) multiTile++; else oneTile++;
  }

  // Каждая группа — ровно прямоугольник w×h от якоря; один вход;
  // footprint'ы не пересекаются.
  const rects = [];
  for (const g of groups.values()) {
    let maxX = -Infinity, maxY = -Infinity;
    for (const s of g.tiles) {
      const [tx, ty] = s.split(',').map(Number);
      assert.ok(tx >= g.ax && ty >= g.ay, 'тайл за левым верхним углом якоря');
      maxX = Math.max(maxX, tx);
      maxY = Math.max(maxY, ty);
    }
    const w = maxX - g.ax + 1;
    const h = maxY - g.ay + 1;
    assert.ok(w <= BUILD_MAX_W && h <= BUILD_MAX_H, 'footprint крупнее максимума');
    // Группы, чей полный прямоугольник (до BUILD_MAX) выходит за сэмпл,
    // пропускаем: снаружи могли остаться невычитанные тайлы постройки.
    if (g.ax < -R || g.ay < -R ||
        g.ax + BUILD_MAX_W - 1 >= R || g.ay + BUILD_MAX_H - 1 >= R) continue;
    assert.equal(g.tiles.size, w * h, `footprint не полный прямоугольник ${w}x${h}`);
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        assert.ok(g.tiles.has((g.ax + dx) + ',' + (g.ay + dy)),
          `(${g.ax + dx},${g.ay + dy}) должен принадлежать постройке`);
      }
    }
    assert.equal(g.entrances.length, 1, 'ровно один вход');
    const [ex, ey] = g.entrances[0];
    assert.ok(ex >= g.ax && ex < g.ax + w && ey >= g.ay && ey < g.ay + h, "вход внутри footprint'а");
    rects.push([g.ax, g.ay, g.ax + w, g.ay + h]);
  }
  // Ничьи тайлы не входят в два прямоугольника.
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const [x1a, y1a, x1b, y1b] = rects[i];
      const [x2a, y2a, x2b, y2b] = rects[j];
      const overlap = !(x1b <= x2a || x2b <= x1a || y1b <= y2a || y2b <= y1a);
      assert.ok(!overlap, `постройки пересекаются: ${rects[i]} и ${rects[j]}`);
    }
  }
  assert.ok(multiTile >= 1, 'в сэмпле не нашлось ни одной постройки крупнее 1x1');
  assert.ok(oneTile > 0, 'построек 1x1 не осталось');
});

test('1x1-совместимость: hasBuilding ⇒ isEntrance, passable, валидный building', () => {
  const map = createMap();
  let n = 0;
  for (let x = -100; x < 100; x++) {
    for (let y = -100; y < 100; y++) {
      const t = map.tileAt(x, y);
      if (!t.hasBuilding) {
        assert.equal(t.isEntrance, false, `(${x},${y}): isEntrance без hasBuilding`);
        continue;
      }
      n++;
      assert.equal(t.isEntrance, true);
      assert.equal(t.inBuilding, true);
      assert.equal(t.passable, true, 'тайл с hasBuilding проходим (старые контракты main.js)');
      assert.ok(t.building >= 0 && t.building < BUILDING_COUNT);
      assert.ok(t.buildingWealth >= 0 && t.buildingWealth <= 3);
      // 1x1-постройка: в footprint'е только вход.
      if (t.building !== BUILDING_TYPES.ARENA && t.building !== BUILDING_TYPES.TEMPLE) {
        const corner = map.tileAt(x + 1, y);
        assert.ok(!corner.inBuilding || corner.buildingAnchor.join(',') !== t.buildingAnchor.join(','),
          '1x1-постройка не должна занимать соседние тайлы');
      }
    }
  }
  assert.ok(n > 10, `слишком мало hasBuilding: ${n}`);
});

test('браузер: map.js лениво подхватывает каталог из Game (vm-песочница)', () => {
  // Порядок как в index.html: perlin → map.js → … → buildings.js.
  // buildings.js грузится ПОСЛЕ map.js, значит каталог должен
  // подхватываться лениво (из Game в момент tileAt), а не при загрузке.
  const sandbox = {};
  loadInSandbox('perlin.js', sandbox);
  loadInSandbox('map.js', sandbox);
  assert.equal(typeof sandbox.Game.createMap, 'function', 'map.js в browser-режиме');
  assert.equal(sandbox.Game.placeBuilding, undefined, 'buildings.js ещё не загружен');
  loadInSandbox('buildings.js', sandbox);

  const bMap = sandbox.Game.createMap();
  const nMap = createMap();
  let multi = 0;
  for (let i = 0; i < 300; i++) {
    const x = Math.floor(Math.random() * 400) - 200;
    const y = Math.floor(Math.random() * 400) - 200;
    const a = bMap.tileAt(x, y);
    const b = nMap.tileAt(x, y);
    // Разные realm'ы: сравниваем JSON-нормализованные копии.
    assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)), `(${x},${y})`);
    if (a.inBuilding) {
      const g = new Set();
      for (let dx = -3; dx <= 3; dx++) {
        for (let dy = -3; dy <= 3; dy++) {
          const t = bMap.tileAt(x + dx, y + dy);
          if (t.inBuilding && JSON.stringify(t.buildingAnchor) === JSON.stringify(a.buildingAnchor)) {
            g.add((x + dx) + ',' + (y + dy));
          }
        }
      }
      if (g.size > 1) multi++;
    }
  }
  assert.ok(multi > 0, 'крупные постройки (3x3) в browser-режиме не появились');
});

test('уменьшение размера: блокированный 3x3 не пересечётся с соседом, а влезет 1x1', () => {
  // Искусственный мир: сплошные проходимые тайлы (A=255 → много якорей,
  // деревни толпятся рядом) — при этом проверяем глобальное правило:
  // ни один тайл не принадлежит двум footprint'ам, и ни одна постройка
  // не вылезает за проходимый тайл.
  const map = createMap(syntheticPixels(8, 8, 128, 128, 128, 255));
  const owner = new Map();
  for (let x = -60; x < 60; x++) {
    for (let y = -60; y < 60; y++) {
      const t = map.tileAt(x, y);
      if (!t.inBuilding) continue;
      const key = x + ',' + y;
      const who = t.buildingAnchor.join(',');
      const prev = owner.get(key);
      assert.equal(prev, undefined, `тайл ${key} в двух footprint'ах (${prev} и ${who})`);
      owner.set(key, who);
      assert.equal(t.terrain === TERRAIN.MOUNTAIN || t.terrain === TERRAIN.WATER ||
        t.terrain === TERRAIN.DEEP_WATER, false, 'footprint на непроходимом рельефе');
    }
  }
  assert.ok(owner.size > 50, `мало тайлов построек: ${owner.size}`);
});

// --- Правки по итогам ревью 000026: вход не замурован ---

// У входа постройки (тайла, где игрок заходит внутрь) должен быть
// проходимый сосед по одному из 4 направлений — иначе постройка
// генерируется, но в неё нельзя войти никогда (стены + вода/стены
// соседа вокруг входа). Игрок ходит только в 4 направлениях
// (src/main.js, KEY_DIRS).
function assertEntrancesReachable(map, R, label) {
  let entrances = 0, multi = 0;
  for (let x = -R; x < R; x++) {
    for (let y = -R; y < R; y++) {
      const t = map.tileAt(x, y);
      if (!t.isEntrance) continue;
      entrances++;
      if (t.buildingAnchor) {
        const [ax, ay] = t.buildingAnchor;
        const side = map.tileAt(ax + 1, ay);
        if (side.inBuilding &&
            side.buildingAnchor &&
            side.buildingAnchor[0] === ax && side.buildingAnchor[1] === ay) {
          multi++; // footprint шире 1 тайла
        }
      }
      const free =
        map.tileAt(x + 1, y).passable ||
        map.tileAt(x - 1, y).passable ||
        map.tileAt(x, y + 1).passable ||
        map.tileAt(x, y - 1).passable;
      assert.ok(free,
        `${label} (${x},${y}): вход постройки ${t.building} (якорь ${JSON.stringify(t.buildingAnchor)}) замурован`);
    }
  }
  return { entrances, multi };
}

test('вход не замурован: у входа каждой постройки есть проходимый сосед (синтетические миры)', () => {
  const worlds = [
    [createMap(), 'мир по умолчанию'],
    // Поднятое море (R=0): постройки у кромки воды — случай
    // «нижний ряд на песке, под ним вода» из ревью.
    [createMap(syntheticPixels(8, 8, 0, 128, 128, 255)), 'мир с приливом'],
    // Плотные деревни (A=255): footprint'ы толпятся — случай
    // «стена поздней постройки замуровала вход ранней».
    [createMap(syntheticPixels(8, 8, 128, 128, 128, 255)), 'плотный мир'],
  ];
  for (const [map, label] of worlds) {
    const { entrances } = assertEntrancesReachable(map, 100, label);
    assert.ok(entrances > 20, `${label}: мало входов ${entrances}`);
  }
});

test('вход не замурован: реальный assets/map.png (±150)', () => {
  const { width, height, data } = decodePng('assets/map.png');
  const map = createMap({ width, height, data });
  const { entrances, multi } = assertEntrancesReachable(map, 150, 'реальная карта');
  assert.ok(entrances > 100, `мало входов: ${entrances}`);
  assert.ok(multi > 0, 'в сэмпле не осталось много-тайловых построек — тест не проверяет 3x3');
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  createMap, syntheticPixels,
  visibleTileRange, createTileCache,
  ZOOM_MIN, ZOOM_MAX, ZOOM_START,
  TERRAIN, TERRAIN_NAMES,
  // Задача 000056 (стадия красных тестов): единая таблица террейнов ещё
  // не реализована — тесты в конце файла падают, пока её нет в map.js.
  TERRAIN_DATA,
  BUILDING_TYPES,
  buildingCount, buildingNames, buildingNameUi,
  buildMaxW, buildMaxH,
  MOB_GROUP_TYPES, mobGroupCount,
  // Задача 000061 (стадия красных тестов): функция ещё не реализована —
  // тесты ниже падают, пока в map.js её нет.
  worldToScreen, orthoMatrix,
} = require('../src/map.js');
const {
  deltaForEvent, deltaForMoveKey,
  layoutTouchControls, touchActionAt,
} = require('../src/controls.js');
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
        assert.ok(t.building >= 0 && t.building < buildingCount());
        assert.ok(!t.hasMobGroup, 'постройка и группа мобов в одном тайле');
      }
      if (t.hasMobGroup) {
        groups++;
        assert.ok(t.passable, 'группа мобов на непроходимом тайле');
        assert.ok(t.mobGroup >= 0 && t.mobGroup < mobGroupCount());
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

test('buildMaxW/H() покрывают максимальный размер в каталоге', () => {
  let maxW = 1, maxH = 1;
  for (const b of BUILDINGS) {
    const { width, height } = buildingSize(b);
    maxW = Math.max(maxW, width);
    maxH = Math.max(maxH, height);
  }
  assert.ok(maxW <= buildMaxW(), `каталог шире окна поиска: ${maxW} > ${buildMaxW()}`);
  assert.ok(maxH <= buildMaxH(), `каталог выше окна поиска: ${maxH} > ${buildMaxH()}`);
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
    assert.ok(w <= buildMaxW() && h <= buildMaxH(), 'footprint крупнее максимума');
    // Группы, чей полный прямоугольник (до BUILD_MAX) выходит за сэмпл,
    // пропускаем: снаружи могли остаться невычитанные тайлы постройки.
    if (g.ax < -R || g.ay < -R ||
        g.ax + buildMaxW() - 1 >= R || g.ay + buildMaxH() - 1 >= R) continue;
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
      assert.ok(t.building >= 0 && t.building < buildingCount());
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

// --- Задача 000061: проекция «мир → экран» глобальной карты ---
//
// Жалоба: на глобальной карте «вниз» двигало вверх и «вверх» — вниз
// (и на клавиатуре, и на touch D-pad); право/лево, подземелье и бой —
// корректны. Корень — не в инпутах (DIR_DELTA/CODE_DIRS/touchActionAt
// корректны и зафиксированы тестами controls.test.js/dungeon-ui.test.js/
// combat-keys.test.js), а в преобразовании мир→экран: слой спрайтов
// (drawSprites в src/main.js) зеркалил ось y относительно WebGL-слоя:
//   toY = (ty) => cy + (cam.y − ty) * zoom      (ЗЕРКАЛЬНО)
// тогда как WebGL-матрица (orthoMatrix в main.js) рисовала точку южнее
// камеры (ty > cam.y) НИЖЕ центра экрана — корректно. Зеркало проходило
// через центр камеры, а игрок сидит ровно в этом центре — поэтому
// «совпадение слоёв» в точке игрока (кросс-чек 000033) не ловило баг.
//
// ВАЖНО (ловушка, зафиксирована численно): в WebGL NDC +y — ВЕРХ
// экрана. Правильная матрица ИМЕЕТ отрицательный склон в NDC по y
// (y-строка «0, −1/halfH, …, +cy/halfH») — именно так южный тайл
// попадает НИЗ: ndc.y = (camY − ty)/halfH < 0 → пиксель
// (1 − ndc.y)·H/2 = H/2 + (ty − camY)·zoom. «Пофиксить» матрицу
// «положительным склоном» — значит перевернуть корректный WebGL-слой
// под зеркальный спрайт-слой (игра останется инвертированной).
//
// Фикс (зелёная стадия): обе проекции вынести в этот чистый модуль с
// единой конвенцией «y растёт вниз — и в мире, и на экране» (та же,
// что в подземелье/бою), main.js — потребитель:
//   * worldToScreen(tx, ty, camX, camY, zoom, viewW, viewH) →
//     {x: viewW/2 + (tx−camX)·zoom, y: viewH/2 + (ty−camY)·zoom};
//   * orthoMatrix(zoom, camX, camY, viewW, viewH) → Float32Array(16),
//     column-major, ТОТАЖЕ знаки, что в рабочем WebGL-слое до фикса
//     (y-строка «0, −1/halfH, 0, 0», трансляция «−camX/halfW,
//     +camY/halfH, 0, 1», z-строка «0, 0, −1, 0»);
//   * ОБА слоя main.js — в одном коммите (тест «оба слоя согласованы»
//     + структурный тест main.js).
//
// Регрессия прогоняется на уровне ядра (DOM/WebGL в node не
// покрываются — устоявшийся паттерн проекта): клавиша/тач → дельта
// (src/controls.js) → проекция (этот модуль).

// Пайплайн WebGL для проверки матрицы: мир → NDC (column-major 4x4,
// вершина z=0) → пиксели. NDC: x∈[−1,1] лево→право, y∈[−1,1] низ→верх
// (NDC +y = ВЕРХ экрана); пиксельная y — от верхнего края:
// y_px = (1 − ndc.y)·H/2.
function screenPointOf(m, tx, ty, viewW, viewH) {
  const w = m[15] || 1;
  const ndcX = (m[0] * tx + m[12]) / w;
  const ndcY = (m[5] * ty + m[13]) / w;
  return { x: (ndcX + 1) * viewW / 2, y: (1 - ndcY) * viewH / 2 };
}

// Допуск: матрица Float32Array — погрешность ~1e-7 отн. на компонент.
const F32_EPS = 1e-3;

test('worldToScreen: камера — в центре экрана', () => {
  const p = worldToScreen(3.2, -7.75, 3.2, -7.75, 40, 1920, 1080);
  assert.ok(Math.abs(p.x - 960) < 1e-9, `x: ${p.x}`);
  assert.ok(Math.abs(p.y - 540) < 1e-9, `y: ${p.y}`);
  const q = worldToScreen(0, 0, 0, 0, 80, 1000, 640);
  assert.deepEqual(q, { x: 500, y: 320 });
});

test('worldToScreen: точная формула — x вправо, y ВНИЗ', () => {
  const camX = 3.2, camY = -7.75, z = 40, W = 1920, H = 1080;
  const pts = [
    [4.2, -7.75, W / 2 + z, H / 2],               // тайл на восток
    [2.2, -7.75, W / 2 - z, H / 2],               // тайл на запад
    [3.2, -6.75, W / 2, H / 2 + z],               // тайл на юг — НИЖЕ
    [3.2, -8.75, W / 2, H / 2 - z],               // тайл на север — ВЫШЕ
    [3.7, -8.5, W / 2 + 0.5 * z, H / 2 - 0.75 * z], // дробная точка
  ];
  for (const [tx, ty, ex, ey] of pts) {
    const p = worldToScreen(tx, ty, camX, camY, z, W, H);
    assert.ok(Math.abs(p.x - ex) < 1e-9, `x(${tx},${ty}): ${p.x} != ${ex}`);
    assert.ok(Math.abs(p.y - ey) < 1e-9, `y(${tx},${ty}): ${p.y} != ${ey}`);
  }
});

test('worldToScreen: точка южнее камеры НИЖЕ центра экрана (y растёт с ty)', () => {
  const z = 40, W = 1920, H = 1080;
  const center = worldToScreen(0, 0, 0, 0, z, W, H);
  const south = worldToScreen(0, 1, 0, 0, z, W, H);
  const north = worldToScreen(0, -1, 0, 0, z, W, H);
  assert.ok(south.y > center.y,
    'юг должен рисоваться НИЖЕ центра (старая формула давала H/2−zoom)');
  assert.ok(north.y < center.y, 'север должен рисоваться ВЫШЕ центра');
  assert.equal(south.x, center.x, 'вертикальное смещение не сдвигает x');
  assert.ok(Math.abs(south.y - center.y - z) < 1e-9, 'тайл = zoom пикселей');
});

test('worldToScreen: зум масштабирует расстояние, сдвиг камеры двигает точку', () => {
  const W = 1920, H = 1080;
  const d40 = worldToScreen(5, 2, 0, 0, 40, W, H);
  const d80 = worldToScreen(5, 2, 0, 0, 80, W, H);
  assert.ok(Math.abs((d80.x - 960) - 2 * (d40.x - 960)) < 1e-9, 'x: зум x2 → дистанция x2');
  assert.ok(Math.abs((d80.y - 540) - 2 * (d40.y - 540)) < 1e-9, 'y: зум x2 → дистанция x2');
  // Камера сдвинулась на (1.5, −2.5) — точка на экране сдвинулась на
  // (−1.5·z, +2.5·z).
  const a = worldToScreen(5, 2, 0, 0, 40, W, H);
  const b = worldToScreen(5, 2, 1.5, -2.5, 40, W, H);
  assert.ok(Math.abs((a.x - b.x) - 1.5 * 40) < 1e-9);
  assert.ok(Math.abs((a.y - b.y) + 2.5 * 40) < 1e-9);
});

test('worldToScreen: невалидные аргументы (NaN, размер<=0, зум<=0) → NaN, без исключения', () => {
  const bad = [
    worldToScreen(NaN, 0, 0, 0, 40, 100, 100),
    worldToScreen(0, NaN, 0, 0, 40, 100, 100),
    worldToScreen(0, 0, NaN, 0, 40, 100, 100),
    worldToScreen(0, 0, 0, NaN, 40, 100, 100),
    worldToScreen(Infinity, 0, 0, 0, 40, 100, 100),
    worldToScreen(0, 0, 0, 0, NaN, 100, 100),
    worldToScreen(0, 0, 0, 0, 40, NaN, 100),
    worldToScreen(0, 0, 0, 0, 40, 100, NaN),
    worldToScreen(0, 0, 0, 0, 40, 0, 100),
    worldToScreen(0, 0, 0, 0, 40, -5, 100),
    worldToScreen(0, 0, 0, 0, 0, 100, 100),
    worldToScreen(0, 0, 0, 0, -40, 100, 100),
    worldToScreen(0, 0, 0, 0, 40, 100, 0),
  ];
  for (const p of bad) {
    assert.ok(Number.isNaN(p.x) && Number.isNaN(p.y),
      `ожидался NaN/NaN: ${JSON.stringify(p)}`);
  }
});

// --- Регрессия КЛАВИАТУРЫ (жалоба пользователя, cam = позиция игрока) ---
// Цепочка как в игре: клавиша → дельта мира (y вниз) → проекция на экран.

test('клавиатура: «вниз» — ниже на экране (игрок в центре камеры)', () => {
  const d = deltaForEvent({ code: 'ArrowDown' });
  assert.deepEqual(d, [0, 1], '«вниз» в мире = +y (конвенция y-вниз)');
  const W = 1920, H = 1080, z = 40;
  const p0 = worldToScreen(0, 0, 0, 0, z, W, H);
  const p1 = worldToScreen(d[0], d[1], 0, 0, z, W, H);
  assert.ok(p1.y > p0.y, 'после «вниз» персонаж НИЖЕ на экране');
  assert.equal(p1.x, p0.x, '«вниз» не двигает по x');
});

test('клавиатура: «вверх» — выше на экране; лево/право — только x', () => {
  const W = 1920, H = 1080, z = 40;
  const p0 = worldToScreen(0, 0, 0, 0, z, W, H);
  const up = deltaForEvent({ code: 'ArrowUp' });
  assert.deepEqual(up, [0, -1]);
  const pu = worldToScreen(up[0], up[1], 0, 0, z, W, H);
  assert.ok(pu.y < p0.y, 'после «вверх» персонаж ВЫШЕ на экране');
  const left = deltaForEvent({ code: 'ArrowLeft' });
  const right = deltaForEvent({ code: 'ArrowRight' });
  assert.deepEqual(left, [-1, 0]);
  assert.deepEqual(right, [1, 0]);
  const pl = worldToScreen(left[0], left[1], 0, 0, z, W, H);
  const pr = worldToScreen(right[0], right[1], 0, 0, z, W, H);
  assert.ok(pl.x < p0.x, '«лево» — левее');
  assert.ok(pr.x > p0.x, '«право» — правее');
  assert.equal(pl.y, p0.y, '«лево» не двигает по y');
  assert.equal(pr.y, p0.y, '«право» не двигает по y');
});

// --- Регрессия TOUCH (мобильная часть жалобы, на уровне ядра) ---
// DOM в node не покрывается (паттерн проекта): раскладка и хит-тест
// D-pad — чистые функции controls.js.

test('touch: нижний/верхний луч D-pad → вниз/вверх на экране', () => {
  const layout = layoutTouchControls(360, 640);
  const cx = layout.dpad.x + layout.dpad.w / 2;
  const cy = layout.dpad.y + layout.dpad.h / 2;
  const W = 1920, H = 1080, z = 40;
  const p0 = worldToScreen(0, 0, 0, 0, z, W, H);
  for (const [dy, action, lower] of [[50, 'down', true], [-50, 'up', false]]) {
    const a = touchActionAt(cx, cy + dy, layout);
    assert.equal(a, action, `луч dy=${dy} даёт «${action}»`);
    const d = deltaForMoveKey('touch:' + action);
    assert.deepEqual(d, lower ? [0, 1] : [0, -1],
      `touch:${action} → дельта мира`);
    const p1 = worldToScreen(d[0], d[1], 0, 0, z, W, H);
    if (lower) {
      assert.ok(p1.y > p0.y, 'нижний луч D-pad → НИЖЕ на экране');
    } else {
      assert.ok(p1.y < p0.y, 'верхний луч D-pad → ВЫШЕ на экране');
    }
    assert.equal(p1.x, p0.x);
  }
});

// --- orthoMatrix (WebGL-слой) ---

test('orthoMatrix: 16 чисел column-major, камера → NDC (0,0) → центр экрана', () => {
  const m = orthoMatrix(40, 3.2, -7.75, 1920, 1080);
  assert.ok(m instanceof Float32Array, 'ожидается Float32Array');
  assert.equal(m.length, 16);
  for (let i = 0; i < 16; i++) assert.ok(Number.isFinite(m[i]), `m[${i}] не число`);
  // Tочка камеры: NDC (0, 0) → центр экрана.
  assert.ok(Math.abs(m[0] * 3.2 + m[12]) < 1e-6, 'NDC x камеры = 0');
  assert.ok(Math.abs(m[5] * -7.75 + m[13]) < 1e-6, 'NDC y камеры = 0');
  const p = screenPointOf(m, 3.2, -7.75, 1920, 1080);
  assert.ok(Math.abs(p.x - 960) < F32_EPS);
  assert.ok(Math.abs(p.y - 540) < F32_EPS);
});

test('orthoMatrix: точка южнее камеры НИЖЕ центра экрана (не зеркало)', () => {
  const W = 1920, H = 1080, z = 40, cx = 3.2, cy = -7.75;
  const m = orthoMatrix(z, cx, cy, W, H);
  // Зафиксируемое свойство (NDC +y = верх экрана, юг → низ):
  //   юг  (ty = cy+1) → y_px = H/2 + zoom (НИЖЕ центра);
  //   север (ty = cy−1) → y_px = H/2 − zoom (ВЫШЕ центра).
  // Зеркальная спрайт-формула toY = cy + (cam.y − ty)·zoom давала югу
  // H/2 − zoom — баг 000061. «Положительный NDC-склон по y» — тоже
  // зеркало (см. комментарий в шапке секции): его НЕ проверяем,
  // проверяем пиксели.
  const south = screenPointOf(m, cx, cy + 1, W, H);
  assert.ok(south.y > H / 2, `юг ниже центра: ${south.y} > ${H / 2}`);
  assert.ok(Math.abs(south.y - (H / 2 + z)) < F32_EPS, 'тайл юга = +zoom px');
  assert.ok(Math.abs(south.x - W / 2) < F32_EPS, 'юг не сдвигает x');
  const north = screenPointOf(m, cx, cy - 1, W, H);
  assert.ok(Math.abs(north.y - (H / 2 - z)) < F32_EPS, 'тайл севера = −zoom px');
  const east = screenPointOf(m, cx + 1, cy, W, H);
  assert.ok(Math.abs(east.x - (W / 2 + z)) < F32_EPS, 'тайл востока = +zoom px');
  assert.ok(Math.abs(east.y - H / 2) < F32_EPS, 'восток не сдвигает y');
});

test('orthoMatrix: несцентральные дробные точки — точные пиксели', () => {
  // Ось зеркала проходит через центр камеры — проверка «в точке
  // игрока» проходила даже с багом. Здесь точки ОТ ЦЕНТРА, с дробями.
  const W = 1920, H = 1080, z = 40, cx = 3.2, cy = -7.75;
  const m = orthoMatrix(z, cx, cy, W, H);
  const p1 = screenPointOf(m, cx + 0.5, cy + 1.25, W, H);
  assert.ok(Math.abs(p1.x - (W / 2 + 0.5 * z)) < F32_EPS);
  assert.ok(Math.abs(p1.y - (H / 2 + 1.25 * z)) < F32_EPS);
  const p2 = screenPointOf(m, cx - 2.25, cy - 3.5, W, H);
  assert.ok(Math.abs(p2.x - (W / 2 - 2.25 * z)) < F32_EPS);
  assert.ok(Math.abs(p2.y - (H / 2 - 3.5 * z)) < F32_EPS);
});

test('orthoMatrix: невалидные аргументы → 16 NaN, без исключения', () => {
  const bad = [
    orthoMatrix(NaN, 0, 0, 100, 100),
    orthoMatrix(40, NaN, 0, 100, 100),
    orthoMatrix(40, 0, NaN, 100, 100),
    orthoMatrix(40, 0, 0, NaN, 100),
    orthoMatrix(40, 0, 0, 100, NaN),
    orthoMatrix(0, 0, 0, 100, 100),
    orthoMatrix(-1, 0, 0, 100, 100),
    orthoMatrix(40, 0, 0, 0, 100),
    orthoMatrix(40, 0, 0, 100, -10),
  ];
  for (const m of bad) {
    assert.ok(m instanceof Float32Array);
    assert.equal(m.length, 16);
    for (let i = 0; i < 16; i++) {
      assert.ok(Number.isNaN(m[i]), `m[${i}] должен быть NaN`);
    }
  }
});

test('оба слоя согласованы: WebGL-матрица и worldToScreen в ЛЮБОЙ точке мира', () => {
  // Инвариант, защищающий от повторного расслоения (слои обязаны
  // меняться в одном коммите): для несцентральных точек мира пиксель
  // через матрицу (NDC → экран) === пиксель worldToScreen.
  const W = 1920, H = 1080, z = 40, cx = 10.5, cy = -20.5;
  const m = orthoMatrix(z, cx, cy, W, H);
  const offs = [-4, -2.5, -1, -0.5, 0, 0.5, 1, 2.5, 4];
  for (const dx of offs) {
    for (const dy of offs) {
      const a = screenPointOf(m, cx + dx, cy + dy, W, H);
      const b = worldToScreen(cx + dx, cy + dy, cx, cy, z, W, H);
      assert.ok(Math.abs(a.x - b.x) < F32_EPS,
        `x в (${cx + dx},${cy + dy}): матрица ${a.x} != спрайт ${b.x}`);
      assert.ok(Math.abs(a.y - b.y) < F32_EPS,
        `y в (${cx + dx},${cy + dy}): матрица ${a.y} != спрайт ${b.y}`);
    }
  }
});

// --- main.js (клей) — структурный фиксатор (не тестируется в node) ---

test('main.js: обе проекции — из map.js, зеркальная формула удалена (структурный)', () => {
  // WebGL-слой — через G.orthoMatrix, спрайт-слой — через G.worldToScreen
  // (guard-фолбэки с ИСПРАВЛЕННЫМ знаком по паттерну проекта); локальная
  // матрица и зеркальная формула (cam.y − ty)·zoom должны исчезнуть —
  // иначе будущий читатель «починит» по ней снова.
  const text = fs.readFileSync(__dirname + '/../src/main.js', 'utf8');
  assert.ok(text.includes('G.orthoMatrix'),
    'WebGL-слой — через G.orthoMatrix (map.js)');
  assert.ok(text.includes('G.worldToScreen'),
    'спрайт-слой — через G.worldToScreen (map.js)');
  assert.ok(!text.includes('(cam.y - ty)'),
    'зеркальная формула (cam.y - ty) * zoom в main.js удалена');
  assert.ok(!text.includes('(cam.y − ty)'),
    'зеркальная формула (кириллический −) в main.js удалена');
});

test('браузер: map.js отдаёт worldToScreen и orthoMatrix (vm-песочница)', () => {
  // Порядок как в index.html: perlin → map.js (→ … → main.js).
  const sandbox = {};
  loadInSandbox('perlin.js', sandbox);
  loadInSandbox('map.js', sandbox);
  assert.equal(typeof sandbox.Game.worldToScreen, 'function',
    'worldToScreen в browser-режиме');
  assert.equal(typeof sandbox.Game.orthoMatrix, 'function',
    'orthoMatrix в browser-режиме');
  // То же свойство в browser-режиме: юг — ниже центра.
  const p = sandbox.Game.worldToScreen(0, 1, 0, 0, 40, 800, 600);
  assert.ok(p.y > 300, 'y-вниз в browser-режиме');
  const m = sandbox.Game.orthoMatrix(40, 0, 0, 800, 600);
  const q = screenPointOf(m, 0, 1, 800, 600);
  assert.ok(Math.abs(q.y - (300 + 40)) < F32_EPS, 'юг = +zoom px в browser-режиме');
});

// --- Задача 000055: производные данные построек — из каталога лениво ---

// Реальный порядок загрузки index.html (строки 288–298): между map.js
// и buildings.js грузятся player/day/items, каждый делает
// Object.assign({}, Game, …) — «ленивые» данные map.js обязаны
// пережить копирование Game (тест ниже). mob-groups-data.js — ДО
// map.js (задача 000057).
function loadBrowserChain(sandbox) {
  for (const f of [
    'global-settings.js', 'perlin.js', 'mapseed.js', 'skills-data.js',
    'items-data.js', 'npc-data.js', 'mob-groups-data.js', 'map.js',
    'player.js', 'day.js', 'items.js', 'buildings.js',
  ]) loadInSandbox(f, sandbox);
}

test('производные данные из каталога: buildingCount() === 13, 13 имён, buildMaxW/H() — максимум по 13 «картовым» записям (сейчас 3/3)', () => {
  assert.equal(typeof buildingCount, 'function', 'map.js: нет функции buildingCount()');
  assert.equal(buildingCount(), 13, 'ровно 13 «картовых» индексов');
  assert.equal(typeof buildingNames, 'function', 'map.js: нет функции buildingNames()');
  const names = buildingNames();
  assert.equal(names.length, 13, '13 имён — по одному на map_index');
  for (let i = 0; i < 13; i++) {
    assert.equal(typeof names[i], 'string', `имя ${i} — строка`);
    assert.notEqual(names[i].trim(), '', `имя ${i} не пусто`);
  }
  assert.equal(typeof buildMaxW, 'function', 'map.js: нет функции buildMaxW()');
  assert.equal(typeof buildMaxH, 'function', 'map.js: нет функции buildMaxH()');
  // Окно поиска выводится из 13 «картовых» записей (не захардкожено):
  // накрывает максимум по ним и равно ему.
  let mw = 1, mh = 1;
  for (let i = 0; i < 13; i++) {
    const b = BUILDINGS.find(
      (x) => x.особые_параметры && x.особые_параметры.map_index === i);
    assert.ok(b, `запись с map_index ${i} найдена`);
    const { width, height } = buildingSize(b);
    assert.ok(width <= buildMaxW(),
      `окно по X не накрывает map_index ${i}: ${width} > ${buildMaxW()}`);
    assert.ok(height <= buildMaxH(),
      `окно по Y не накрывает map_index ${i}: ${height} > ${buildMaxH()}`);
    mw = Math.max(mw, width);
    mh = Math.max(mh, height);
  }
  assert.equal(buildMaxW(), mw, 'buildMaxW() = максимум ширины по 13 «картовым» записям');
  assert.equal(buildMaxH(), mh, 'buildMaxH() = максимум высоты по 13 «картовым» записям');
  // Сейчас в каталоге 3x3 (арена/храм солнца/монастырь/ратуша) —
  // значения сохраняются, но источник уже каталог.
  assert.equal(buildMaxW(), 3, 'сейчас 3');
  assert.equal(buildMaxH(), 3, 'сейчас 3');
});

test('vm без каталога: фолбэк ИМЕННО 13/3/3; после загрузки каталога — производные значения (пустой вывод не кэшируется)', () => {
  // vm-песочницы (combat-ui) грузят map.js БЕЗ buildings.js: без
  // каталога фолбэк обязан дать ровно текущие значения генерации
  // (hash2 % 13, окно 3×3) — иначе карта в песочнице уедет.
  const sandbox = {};
  loadInSandbox('perlin.js', sandbox);
  loadInSandbox('map.js', sandbox);
  assert.equal(sandbox.Game.placeBuilding, undefined, 'buildings.js ещё не загружен');
  assert.equal(sandbox.Game.buildingCount(), 13, 'фолбэк buildingCount() без каталога = 13');
  assert.equal(sandbox.Game.buildMaxW(), 3, 'фолбэк buildMaxW() без каталога = 3');
  assert.equal(sandbox.Game.buildMaxH(), 3, 'фолбэк buildMaxH() без каталога = 3');
  // Каталог подхватывается лениво: пустой вывод ДО загрузки НЕ
  // кэшируется — после buildings.js значения производные.
  loadInSandbox('buildings.js', sandbox);
  assert.equal(sandbox.Game.buildingCount(), 13);
  const names = sandbox.Game.buildingNames();
  assert.equal(names.length, 13, 'каталог подхвачен (пустой вывод не закэширован)');
  // idx 8 — «Храм солнца» (каталожный регистр; в старом map.js было «храм»).
  assert.equal(names[8], 'Храм солнца', 'имя idx 8 — из каталога');
});

test('vm, реальный порядок index.html: имена построек из Game (ловушка Object.assign)', () => {
  // items.js и др. грузятся ПОСЛЕ map.js и ДО buildings.js и делают
  // Object.assign({}, Game, …): если бы «ленивое» имя было getter'ом,
  // его значение застыло бы на моменте без каталога (Object.assign
  // читает getter источника и копирует data-проприети). Функции
  // переживают копирование Game по ссылке и разрешают каталог в
  // момент вызова — HUD «Здесь: …» (main.js) и панель (ui.js).
  const sandbox = {};
  loadBrowserChain(sandbox);
  assert.equal(sandbox.Game.buildingCount(), 13);
  assert.equal(sandbox.Game.buildingNameUi(0), 'оружейная', 'имя из каталога после полной загрузки');
  assert.equal(sandbox.Game.buildingNameUi(8), 'храм солнца');
  assert.equal(sandbox.Game.buildingNameUi(9), 'вход в пещеру');
  assert.equal(sandbox.Game.buildingNameUi(11), 'таверна');
  assert.equal(sandbox.Game.buildingNameUi(12), 'дом NPC');
});

// --- Golden-пин детерминизма (задача 000055) ---
// tileAt на фиксированных координатах реального assets/map.png
// (seed 0xf10c7a26): 12 входов (включая две 3x3 постройки — храм
// солнца якорь [-119,9] и арена якорь [-118,-90]), 8 стен, 6 групп
// мобов, вода/горы/суша. Генерация (hash2 % 13, окно 3×3, sizeChain)
// НЕ меняется — тест обязан остаться зелёным после рефакторинга.
const GOLDEN_TILES = {
  '-119,-104': { x: -119, y: -104, terrain: 2, passable: true, hasBuilding: true, building: 2, buildingWealth: 3, hasMobGroup: false, mobGroup: -1, inBuilding: true, isEntrance: true, buildingAnchor: [-119, -104] }, // вход
  '-119,-19': { x: -119, y: -19, terrain: 3, passable: true, hasBuilding: true, building: 2, buildingWealth: 1, hasMobGroup: false, mobGroup: -1, inBuilding: true, isEntrance: true, buildingAnchor: [-119, -19] }, // вход
  '-118,-114': { x: -118, y: -114, terrain: 3, passable: true, hasBuilding: true, building: 1, buildingWealth: 3, hasMobGroup: false, mobGroup: -1, inBuilding: true, isEntrance: true, buildingAnchor: [-118, -114] }, // вход
  '-118,-25': { x: -118, y: -25, terrain: 3, passable: true, hasBuilding: true, building: 1, buildingWealth: 1, hasMobGroup: false, mobGroup: -1, inBuilding: true, isEntrance: true, buildingAnchor: [-118, -25] }, // вход
  '-118,11': { x: -118, y: 11, terrain: 5, passable: true, hasBuilding: true, building: 8, buildingWealth: 3, hasMobGroup: false, mobGroup: -1, inBuilding: true, isEntrance: true, buildingAnchor: [-119, 9] }, // вход (3x3)
  '-118,33': { x: -118, y: 33, terrain: 3, passable: true, hasBuilding: true, building: 2, buildingWealth: 2, hasMobGroup: false, mobGroup: -1, inBuilding: true, isEntrance: true, buildingAnchor: [-118, 33] }, // вход
  '-117,-88': { x: -117, y: -88, terrain: 3, passable: true, hasBuilding: true, building: 4, buildingWealth: 1, hasMobGroup: false, mobGroup: -1, inBuilding: true, isEntrance: true, buildingAnchor: [-118, -90] }, // вход (3x3)
  '-117,111': { x: -117, y: 111, terrain: 3, passable: true, hasBuilding: true, building: 0, buildingWealth: 2, hasMobGroup: false, mobGroup: -1, inBuilding: true, isEntrance: true, buildingAnchor: [-117, 111] }, // вход
  '-116,-100': { x: -116, y: -100, terrain: 2, passable: true, hasBuilding: true, building: 11, buildingWealth: 2, hasMobGroup: false, mobGroup: -1, inBuilding: true, isEntrance: true, buildingAnchor: [-116, -100] }, // вход
  '-114,-119': { x: -114, y: -119, terrain: 2, passable: true, hasBuilding: true, building: 0, buildingWealth: 2, hasMobGroup: false, mobGroup: -1, inBuilding: true, isEntrance: true, buildingAnchor: [-114, -119] }, // вход
  '-114,-35': { x: -114, y: -35, terrain: 3, passable: true, hasBuilding: true, building: 1, buildingWealth: 3, hasMobGroup: false, mobGroup: -1, inBuilding: true, isEntrance: true, buildingAnchor: [-114, -35] }, // вход
  '-114,18': { x: -114, y: 18, terrain: 5, passable: true, hasBuilding: true, building: 11, buildingWealth: 2, hasMobGroup: false, mobGroup: -1, inBuilding: true, isEntrance: true, buildingAnchor: [-114, 18] }, // вход
  '-119,9': { x: -119, y: 9, terrain: 5, passable: false, hasBuilding: false, building: 8, buildingWealth: 3, hasMobGroup: false, mobGroup: -1, inBuilding: true, isEntrance: false, buildingAnchor: [-119, 9] }, // стена (3x3)
  '-119,10': { x: -119, y: 10, terrain: 5, passable: false, hasBuilding: false, building: 8, buildingWealth: 3, hasMobGroup: false, mobGroup: -1, inBuilding: true, isEntrance: false, buildingAnchor: [-119, 9] }, // стена (3x3)
  '-119,11': { x: -119, y: 11, terrain: 5, passable: false, hasBuilding: false, building: 8, buildingWealth: 3, hasMobGroup: false, mobGroup: -1, inBuilding: true, isEntrance: false, buildingAnchor: [-119, 9] }, // стена (3x3)
  '-118,-90': { x: -118, y: -90, terrain: 3, passable: false, hasBuilding: false, building: 4, buildingWealth: 1, hasMobGroup: false, mobGroup: -1, inBuilding: true, isEntrance: false, buildingAnchor: [-118, -90] }, // стена (3x3)
  '-118,-89': { x: -118, y: -89, terrain: 3, passable: false, hasBuilding: false, building: 4, buildingWealth: 1, hasMobGroup: false, mobGroup: -1, inBuilding: true, isEntrance: false, buildingAnchor: [-118, -90] }, // стена (3x3)
  '-118,-88': { x: -118, y: -88, terrain: 3, passable: false, hasBuilding: false, building: 4, buildingWealth: 1, hasMobGroup: false, mobGroup: -1, inBuilding: true, isEntrance: false, buildingAnchor: [-118, -90] }, // стена (3x3)
  '-118,9': { x: -118, y: 9, terrain: 5, passable: false, hasBuilding: false, building: 8, buildingWealth: 3, hasMobGroup: false, mobGroup: -1, inBuilding: true, isEntrance: false, buildingAnchor: [-119, 9] }, // стена (3x3)
  '-118,10': { x: -118, y: 10, terrain: 5, passable: false, hasBuilding: false, building: 8, buildingWealth: 3, hasMobGroup: false, mobGroup: -1, inBuilding: true, isEntrance: false, buildingAnchor: [-119, 9] }, // стена (3x3)
  '-120,-113': { x: -120, y: -113, terrain: 3, passable: true, hasBuilding: false, building: -1, buildingWealth: 0, hasMobGroup: true, mobGroup: 0, inBuilding: false, isEntrance: false, buildingAnchor: null }, // группа мобов
  '-120,-88': { x: -120, y: -88, terrain: 3, passable: true, hasBuilding: false, building: -1, buildingWealth: 0, hasMobGroup: true, mobGroup: 0, inBuilding: false, isEntrance: false, buildingAnchor: null }, // группа мобов
  '-120,-78': { x: -120, y: -78, terrain: 3, passable: true, hasBuilding: false, building: -1, buildingWealth: 0, hasMobGroup: true, mobGroup: 2, inBuilding: false, isEntrance: false, buildingAnchor: null }, // группа мобов
  '-120,108': { x: -120, y: 108, terrain: 2, passable: true, hasBuilding: false, building: -1, buildingWealth: 0, hasMobGroup: true, mobGroup: 0, inBuilding: false, isEntrance: false, buildingAnchor: null }, // группа мобов
  '-119,-81': { x: -119, y: -81, terrain: 3, passable: true, hasBuilding: false, building: -1, buildingWealth: 0, hasMobGroup: true, mobGroup: 6, inBuilding: false, isEntrance: false, buildingAnchor: null }, // группа мобов
  '-119,-21': { x: -119, y: -21, terrain: 3, passable: true, hasBuilding: false, building: -1, buildingWealth: 0, hasMobGroup: true, mobGroup: 2, inBuilding: false, isEntrance: false, buildingAnchor: null }, // группа мобов
  '-120,-64': { x: -120, y: -64, terrain: 1, passable: false, hasBuilding: false, building: -1, buildingWealth: 0, hasMobGroup: false, mobGroup: -1, inBuilding: false, isEntrance: false, buildingAnchor: null }, // вода
  '-120,-63': { x: -120, y: -63, terrain: 1, passable: false, hasBuilding: false, building: -1, buildingWealth: 0, hasMobGroup: false, mobGroup: -1, inBuilding: false, isEntrance: false, buildingAnchor: null }, // вода
  '-120,-62': { x: -120, y: -62, terrain: 1, passable: false, hasBuilding: false, building: -1, buildingWealth: 0, hasMobGroup: false, mobGroup: -1, inBuilding: false, isEntrance: false, buildingAnchor: null }, // вода
  '-120,-61': { x: -120, y: -61, terrain: 1, passable: false, hasBuilding: false, building: -1, buildingWealth: 0, hasMobGroup: false, mobGroup: -1, inBuilding: false, isEntrance: false, buildingAnchor: null }, // вода
  '-119,26': { x: -119, y: 26, terrain: 6, passable: false, hasBuilding: false, building: -1, buildingWealth: 0, hasMobGroup: false, mobGroup: -1, inBuilding: false, isEntrance: false, buildingAnchor: null }, // горы
  '-119,27': { x: -119, y: 27, terrain: 6, passable: false, hasBuilding: false, building: -1, buildingWealth: 0, hasMobGroup: false, mobGroup: -1, inBuilding: false, isEntrance: false, buildingAnchor: null }, // горы
  '-118,26': { x: -118, y: 26, terrain: 6, passable: false, hasBuilding: false, building: -1, buildingWealth: 0, hasMobGroup: false, mobGroup: -1, inBuilding: false, isEntrance: false, buildingAnchor: null }, // горы
  '-118,27': { x: -118, y: 27, terrain: 6, passable: false, hasBuilding: false, building: -1, buildingWealth: 0, hasMobGroup: false, mobGroup: -1, inBuilding: false, isEntrance: false, buildingAnchor: null }, // горы
  '-59,0': { x: -59, y: 0, terrain: 3, passable: true, hasBuilding: false, building: -1, buildingWealth: 0, hasMobGroup: false, mobGroup: -1, inBuilding: false, isEntrance: false, buildingAnchor: null }, // суша
  '-58,-1': { x: -58, y: -1, terrain: 3, passable: true, hasBuilding: false, building: -1, buildingWealth: 0, hasMobGroup: false, mobGroup: -1, inBuilding: false, isEntrance: false, buildingAnchor: null }, // суша
  '-58,0': { x: -58, y: 0, terrain: 3, passable: true, hasBuilding: false, building: -1, buildingWealth: 0, hasMobGroup: false, mobGroup: -1, inBuilding: false, isEntrance: false, buildingAnchor: null }, // суша
  '-58,1': { x: -58, y: 1, terrain: 3, passable: true, hasBuilding: false, building: -1, buildingWealth: 0, hasMobGroup: false, mobGroup: -1, inBuilding: false, isEntrance: false, buildingAnchor: null }, // суша
  '-57,-2': { x: -57, y: -2, terrain: 3, passable: true, hasBuilding: false, building: -1, buildingWealth: 0, hasMobGroup: false, mobGroup: -1, inBuilding: false, isEntrance: false, buildingAnchor: null }, // суша
  '-57,-1': { x: -57, y: -1, terrain: 3, passable: true, hasBuilding: false, building: -1, buildingWealth: 0, hasMobGroup: false, mobGroup: -1, inBuilding: false, isEntrance: false, buildingAnchor: null }, // суша
};

test('golden: tileAt на фиксированных координатах (реальный assets/map.png, node)', () => {
  const { width, height, data } = decodePng('assets/map.png');
  const map = createMap({ width, height, data });
  for (const key of Object.keys(GOLDEN_TILES)) {
    const [x, y] = key.split(',').map(Number);
    assert.deepEqual(map.tileAt(x, y), GOLDEN_TILES[key], key);
  }
});

test('golden: vm-путь (реальный порядок index.html) — те же тайлы', () => {
  const { width, height, data } = decodePng('assets/map.png');
  const sandbox = {};
  loadBrowserChain(sandbox);
  const bMap = sandbox.Game.createMap({ width, height, data });
  for (const key of Object.keys(GOLDEN_TILES)) {
    const [x, y] = key.split(',').map(Number);
    // Разные realm'ы: сравниваем JSON-нормализованные копии.
    assert.deepEqual(
      JSON.parse(JSON.stringify(bMap.tileAt(x, y))),
      JSON.parse(JSON.stringify(GOLDEN_TILES[key])),
      key);
  }
});

// --- Задача 000042: buildingAt — read-only доступ к записи постройки ---
//
// Слой спрайтов (drawSprites, src/main.js) обязан рисовать постройку
// прямоугольником w×h по всему footprint'у ОТ ЯКОРЯ, а не одним 1x1-
// спрайтом на тайле входа. Для этого drawSprites нужен доступ к записи
// постройки по якорю:
//   map.buildingAt(ax, ay) →
//     { anchor, type, x, y, w, h, entrance, wealth } или null
// (O(1)-обёртка над внутренней мемоизированной buildingAtAnchor —
// источник геометрии ОДИН, тот, что размещал постройку).
//
// Опасный альтернативный путь — «скан» краёв вправо/вниз по tileAt
// БЕЗ проверки равенства buildingAnchor: соседняя ЧУЖАЯ постройка даст
// inBuilding=true и зальёт скан (ложные 2x1/1x2). Поэтому тест ниже
// сверяет прямоугольник с tileAt строго по buildingAnchor, а «правый/
// нижний край не footprint» — по равенству якоря, а не по inBuilding.

// Тестовый пересчёт геометрии footprint'а из tileAt (инвариант мира:
// footprint = набор тайлов с данным якорем, прямоугольник от якоря —
// закреплён тестами задачи 000026). Только для ПРОВЕРКИ buildingAt.
function footprintByScan(map, ax, ay) {
  let w = 1, h = 1;
  while (w < buildMaxW()) {
    const t = map.tileAt(ax + w, ay);
    if (t.inBuilding && t.buildingAnchor &&
        t.buildingAnchor[0] === ax && t.buildingAnchor[1] === ay) w++;
    else break;
  }
  while (h < buildMaxH()) {
    const t = map.tileAt(ax, ay + h);
    if (t.inBuilding && t.buildingAnchor &&
        t.buildingAnchor[0] === ax && t.buildingAnchor[1] === ay) h++;
    else break;
  }
  return { x: ax, y: ay, w, h };
}

// Проверки для одного мира (скан ±R):
//   * buildingAt(якорь) — запись, прямоугольник [x, x+w)×[y, y+h)
//     РAVЕН footprint'у по tileAt (каждый тайл прямоугольника — тот же
//     якорь; правый и нижний края — не тот якорь; запись = скан);
//   * buildingAt(не-якорь) — null (и в чужом footprint'е, и на пустом
//     тайле).
function assertBuildingAtWorld(map, R, label) {
  let anchors = 0, multi = 0;
  for (let x = -R; x < R; x++) {
    for (let y = -R; y < R; y++) {
      const t = map.tileAt(x, y);
      const isAnchor = !!(t.inBuilding && t.buildingAnchor &&
        t.buildingAnchor[0] === x && t.buildingAnchor[1] === y);
      if (!isAnchor) {
        assert.equal(map.buildingAt(x, y), null,
          `${label} (${x},${y}): buildingAt(не-якорь) обязан вернуть null`);
        continue;
      }
      anchors++;
      const rec = map.buildingAt(x, y);
      assert.ok(rec,
        `${label} (${x},${y}): buildingAt(якорь) — null, хотя постройка есть`);
      assert.deepEqual(rec.anchor, [x, y],
        `${label} (${x},${y}): anchor записи ≠ якорь`);
      assert.equal(rec.type, t.building,
        `${label} (${x},${y}): тип записи ≠ тип тайла`);
      assert.ok(Number.isInteger(rec.wealth) &&
        rec.wealth >= 0 && rec.wealth <= 3,
        `${label} (${x},${y}): wealth вне [0..3]`);
      // Каждый тайл прямоугольника — тот же якорь и тот же тип.
      for (let dy = 0; dy < rec.h; dy++) {
        for (let dx = 0; dx < rec.w; dx++) {
          const ft = map.tileAt(x + dx, y + dy);
          assert.ok(ft.inBuilding && ft.buildingAnchor &&
            ft.buildingAnchor[0] === x && ft.buildingAnchor[1] === y,
            `${label} (${x + dx},${y + dy}): должен принадлежать постройке с якорем (${x},${y})`);
          assert.equal(ft.building, rec.type,
            `${label} (${x + dx},${y + dy}): в footprint'е один тип постройки`);
        }
      }
      // Вход внутри прямоугольника.
      assert.ok(rec.entrance &&
        rec.entrance[0] >= rec.x && rec.entrance[0] < rec.x + rec.w &&
        rec.entrance[1] >= rec.y && rec.entrance[1] < rec.y + rec.h,
        `${label} (${x},${y}): вход записи вне footprint'а`);
      // Правый и нижний края — НЕ этот footprint (равенство якоря,
      // а не просто inBuilding — ловит дефект «чужой сосед залил скан»).
      const right = map.tileAt(x + rec.w, y);
      assert.ok(!right.inBuilding ||
        right.buildingAnchor[0] !== x || right.buildingAnchor[1] !== y,
        `${label} (${x + rec.w},${y}): w завышен — край ушёл в этот же якорь`);
      const below = map.tileAt(x, y + rec.h);
      assert.ok(!below.inBuilding ||
        below.buildingAnchor[0] !== x || below.buildingAnchor[1] !== y,
        `${label} (${x},${y + rec.h}): h завышен — край ушёл в этот же якорь`);
      // Запись совпадает с пересчётом по tileAt.
      assert.deepEqual({ x: rec.x, y: rec.y, w: rec.w, h: rec.h },
        footprintByScan(map, x, y),
        `${label} (${x},${y}): запись ${JSON.stringify(rec)} ≠ скан tileAt`);
      if (rec.w > 1 || rec.h > 1) multi++;
    }
  }
  return { anchors, multi };
}

test('buildingAt: геометрия footprint\'а — якорь → запись, не-якорь → null', () => {
  // Фолбэк-мир (generateSeedPixels — тот же, что в vm-песочнице
  // main-visuals.test.js: map.png там всегда onerror) и плотный
  // синтетический мир (A=255 — деревни толпятся, случай «чужой
  // сосед» для скана краёв).
  const worlds = [
    [createMap(generateSeedPixels()), 'фолбэк-мир (generateSeedPixels)'],
    [createMap(syntheticPixels(8, 8, 128, 128, 128, 255)), 'синтетика A=255'],
  ];
  for (const [map, label] of worlds) {
    assert.equal(typeof map.buildingAt, 'function',
      `${label}: createMap обязан экспортировать buildingAt`);
    const { anchors, multi } = assertBuildingAtWorld(map, 40, label);
    assert.ok(anchors > 20, `${label}: мало якорей (${anchors})`);
    // Гарантия сценария: есть хотя бы одна много-тайловая постройка
    // (в фолбэк-мире — храм 3x3, якорь (6,28)); без неё тесты
    // main-visuals «пройдут вакуумно».
    assert.ok(multi >= 1,
      `${label}: не нашлось ни одной постройки крупнее 1x1 (сценарий)`);
  }
});

// --- Задача 000056: единая таблица террейнов (имена, проходимость, цвета) ---
//
// Сейчас на 8 террейнов ТРИ таблицы разнесены по четырём модулям:
//   TERRAIN_NAMES/PASSABLE (map.js) + T/ALL_PASSABLE/DENSE (buildings.js)
//   + TILE_BASE (sprites.js, hex) + TILE_COLORS (main.js, rgb).
// Решение (memory/000056-terrain-table.md): ЕДИНАЯ таблица TERRAIN_DATA
// в src/map.js — { [id]: { name, passable, dense, base:<hex>, rgb:[r,g,b] } },
// все остальные модули — потребители без собственных копий. Цвета — ДВА
// представления: base (hex, текстуры/фолбэк) и rgb (0..1, WebGL-рендер),
// согласованные соотношением rgb[i] = round(hex[i]/255·100)/100 (закреплено
// тестом — молчаливая смена вывода недопустима).
//
// СТАДИЯ КРАСНЫХ ТЕСТОВ: TERRAIN_DATA ещё не экспортируется — все тесты
// секции падают, пока реализация не готова. Значения (имена, hex, rgb,
// проходимость, плотность) — ТЕ ЖЕ, что сейчас: «визуально мир не
// меняется» закреплено пин-константами OLD_* (литералы из текущих
// TERRAIN_NAMES/TILE_BASE/TILE_COLORS/DENSE).

// Литералы ДО рефакторинга (пин «мир не меняется»).
const OLD_TERRAIN_NAMES = {
  0: 'глубокая вода',
  1: 'вода',
  2: 'песок',
  3: 'трава',
  4: 'лес',
  5: 'холмы',
  6: 'горы',
  7: 'болото',
};
// hex — из TILE_BASE в src/sprites.js (фолбэк/текстуры).
const OLD_TILE_BASE = {
  0: '#172e6b', 1: '#29579e', 2: '#c2b380', 3: '#578c40',
  4: '#2e6633', 5: '#736e4a', 6: '#57525c', 7: '#4d613d',
};
// rgb — из TILE_COLORS в src/main.js (WebGL). Не пересчёт из hex, а
// ТОЧНЫЕ литералы: hex/255, скруглённые до 2 знаков (SAND 0.70 ≠ 194/255).
const OLD_TILE_COLORS = {
  0: [0.09, 0.18, 0.42], 1: [0.16, 0.34, 0.62],
  2: [0.76, 0.70, 0.50], 3: [0.34, 0.55, 0.25],
  4: [0.18, 0.40, 0.20], 5: [0.45, 0.43, 0.29],
  6: [0.34, 0.32, 0.36], 7: [0.30, 0.38, 0.24],
};
// passable — из PASSABLE (map.js): песок/трава/лес/холмы/болото.
const OLD_PASSABLE_IDS = [2, 3, 4, 5, 7];
// dense — из DENSE (buildings.js): песок/трава/лес/холмы.
const OLD_DENSE_IDS = [2, 3, 4, 5];

const terrainIds = () =>
  Object.keys(TERRAIN_DATA).map(Number).sort((a, b) => a - b);
const hexChannel = (hex, i) =>
  parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);

test('TERRAIN_DATA: ровно 8 записей, ключи = значения enum TERRAIN, поля name/passable/dense/base/rgb', () => {
  assert.ok(TERRAIN_DATA && typeof TERRAIN_DATA === 'object',
    'map.js: нет экспорта TERRAIN_DATA');
  assert.deepEqual(terrainIds(),
    Object.values(TERRAIN).slice().sort((a, b) => a - b),
    'ключи таблицы = 0..7 (значения enum TERRAIN)');
  for (const id of terrainIds()) {
    const d = TERRAIN_DATA[id];
    assert.equal(typeof d.name, 'string', `id ${id}: name — строка`);
    assert.notEqual(d.name.trim(), '', `id ${id}: name не пуст`);
    assert.equal(typeof d.passable, 'boolean', `id ${id}: passable — boolean`);
    assert.equal(typeof d.dense, 'boolean', `id ${id}: dense — boolean`);
    assert.equal(typeof d.base, 'string', `id ${id}: base — строка`);
    assert.match(d.base, /^#[0-9a-f]{6}$/i, `id ${id}: base — hex #rrggbb`);
    assert.ok(Array.isArray(d.rgb) && d.rgb.length === 3,
      `id ${id}: rgb — массив из 3 чисел`);
    for (const c of d.rgb) {
      assert.equal(typeof c, 'number', `id ${id}: rgb — числа`);
      assert.ok(c >= 0 && c <= 1, `id ${id}: rgb-компонента в [0,1]`);
    }
  }
});

test('TERRAIN_NAMES ≡ поле name единой таблицы (производные, не копия)', () => {
  assert.ok(TERRAIN_DATA, 'map.js: нет TERRAIN_DATA');
  const fromTable = {};
  for (const id of terrainIds()) fromTable[id] = TERRAIN_DATA[id].name;
  assert.deepEqual(TERRAIN_NAMES, fromTable, 'TERRAIN_NAMES — из таблицы');
  assert.deepEqual(
    Object.keys(TERRAIN_NAMES).map(Number).sort((a, b) => a - b),
    terrainIds(), 'набор ключей TERRAIN_NAMES = id таблицы');
});

test('два представления цвета согласованы: rgb[i] = round(hex[i]/255·100)/100', () => {
  // Решение «одна таблица, два представления»: base — hex (текстуры/
  // фолбэк), rgb — 0..1 (WebGL), без расхождения в знаке/округлении.
  assert.ok(TERRAIN_DATA, 'map.js: нет TERRAIN_DATA');
  for (const id of terrainIds()) {
    const d = TERRAIN_DATA[id];
    for (let i = 0; i < 3; i++) {
      const expected = Math.round(hexChannel(d.base, i) / 255 * 100) / 100;
      assert.equal(d.rgb[i], expected,
        `id ${id} (${d.name}): rgb[${i}] = ${d.rgb[i]} ≠ hex ${d.base}`);
    }
  }
});

test('TERRAIN_DATA: значения зафиксированы — мир НЕ меняется (имена, hex, rgb, passable, dense)', () => {
  assert.ok(TERRAIN_DATA, 'map.js: нет TERRAIN_DATA');
  for (const id of Object.keys(OLD_TERRAIN_NAMES)) {
    const i = Number(id);
    const d = TERRAIN_DATA[i];
    assert.ok(d, `нет записи id ${i}`);
    assert.equal(d.name, OLD_TERRAIN_NAMES[i], `id ${i}: имя`);
    assert.equal(d.base, OLD_TILE_BASE[i], `id ${i}: hex`);
    assert.deepEqual(d.rgb, OLD_TILE_COLORS[i], `id ${i}: rgb`);
    assert.equal(d.passable, OLD_PASSABLE_IDS.includes(i), `id ${i}: passable`);
    assert.equal(d.dense, OLD_DENSE_IDS.includes(i), `id ${i}: dense`);
  }
  assert.deepEqual(TERRAIN_NAMES, OLD_TERRAIN_NAMES, 'TERRAIN_NAMES не сдвинулся');
});

test('vm, browser-режим: Game.TERRAIN_DATA есть и совпадает с node-таблицей', () => {
  // perlin + map в чистом контексте (как существующие vm-тесты): таблица
  // — ЧИСТЫЕ данные на момент загрузки, без зданий/спрайтов (vm-
  // песочницы combat-ui грузят map.js без buildings.js).
  assert.ok(TERRAIN_DATA, 'map.js: нет TERRAIN_DATA (node)');
  const sandbox = {};
  loadInSandbox('perlin.js', sandbox);
  loadInSandbox('map.js', sandbox);
  assert.ok(sandbox.Game.TERRAIN_DATA, 'Game.TERRAIN_DATA в browser-режиме');
  // Разные realm'ы: JSON-нормализация.
  assert.deepEqual(
    JSON.parse(JSON.stringify(sandbox.Game.TERRAIN_DATA)),
    JSON.parse(JSON.stringify(TERRAIN_DATA)),
    'browser-таблица ≠ node-таблице');
});

test('vm, цепочка index.html: Game.TILE_BASE[t] = base из таблицы для всех 8 (потребитель ≡ таблица)', () => {
  // loadBrowserChain (perlin → … → map.js → … → buildings.js) + sprites.js —
  // реальный порядок index.html (map.js 294 < sprites.js 320): hex-цвета
  // спрайт-слоя обязаны браться из единой таблицы, а не из собственной
  // копии в sprites.js.
  assert.ok(TERRAIN_DATA, 'map.js: нет TERRAIN_DATA (node)');
  const sandbox = {};
  loadBrowserChain(sandbox);
  loadInSandbox('sprites.js', sandbox);
  const table = JSON.parse(JSON.stringify(sandbox.Game.TERRAIN_DATA));
  assert.ok(table, 'Game.TERRAIN_DATA после цепочки index.html');
  for (const id of Object.keys(table).map(Number)) {
    assert.equal(sandbox.Game.TILE_BASE[id], table[id].base,
      `TILE_BASE[${id}] ≠ base таблицы`);
  }
});

test('main.js: TILE_COLORS выводится из G.TERRAIN_DATA, rgb-литералы удалены (структурный)', () => {
  // main.js — браузерный IIFE, в node не грузится: «потребитель ≡
  // таблица» покрывается структурным тестом + vm-прогоном всей цепочки
  // index.html (tests/main-visuals.test.js обязан остаться зелёным).
  const text = fs.readFileSync(__dirname + '/../src/main.js', 'utf8');
  assert.ok(text.includes('G.TERRAIN_DATA'),
    'main.js: нет ссылки на G.TERRAIN_DATA (вывод TILE_COLORS из таблицы)');
  // Литеральный блок TILE_COLORS (ровно как в main.js до рефакторинга,
  // включая «0.70»/«0.50» — формат источника, а не числа).
  const OLD_LITERALS = [
    '[0.09, 0.18, 0.42]', '[0.16, 0.34, 0.62]', '[0.76, 0.70, 0.50]',
    '[0.34, 0.55, 0.25]', '[0.18, 0.40, 0.20]', '[0.45, 0.43, 0.29]',
    '[0.34, 0.32, 0.36]', '[0.30, 0.38, 0.24]',
  ];
  for (const lit of OLD_LITERALS) {
    assert.ok(!text.includes(lit),
      'rgb-литерал ' + lit + ' в main.js не удалён (своя копия цвета)');
  }
});

test('require-порядок map.js ПЕРВЫМ: passableTiles()/denseTiles() согласованы с таблицей', () => {
  // В этом файле map.js требуется РАНЬШЕ buildings.js (map.js сам тянет
  // buildings.js): циклический require map↔buildings обязан разрешаться
  // лениво в момент ВЫЗОВА (паттерн 000055: пустой вывод не кэшируется) —
  // топ-уровневый require('./map.js') в buildings.js дал бы buildings-first
  // цикл с мёртвой таблицей.
  assert.ok(TERRAIN_DATA, 'map.js: нет TERRAIN_DATA');
  const b = require('../src/buildings.js');
  assert.equal(typeof b.passableTiles, 'function',
    'buildings.js: нет passableTiles()');
  assert.equal(typeof b.denseTiles, 'function',
    'buildings.js: нет denseTiles()');
  assert.deepEqual(b.passableTiles(),
    terrainIds().filter((id) => TERRAIN_DATA[id].passable)
      .map((id) => TERRAIN_DATA[id].name), 'passableTiles() в порядке id');
  assert.deepEqual(b.denseTiles(),
    terrainIds().filter((id) => TERRAIN_DATA[id].dense)
      .map((id) => TERRAIN_DATA[id].name), 'denseTiles() в порядке id');
});

// --- Задача 000057: стационарные группы мобов — из каталога лениво ---
//
// MOB_GROUP_COUNT/MOB_GROUP_NAMES уходят из map.js: значения —
// ленивые функции mobGroupCount()/mobGroupName(index) (паттерн
// buildingCount/buildingNames из 000055: кэш, пустой вывод НЕ
// кэшируется, фолбэк = ровно текущие значения 7/имена для
// vm-песочниц без каталога).

const MOB_GROUP_NAMES_EXPECTED = [
  'орочий лагерь', 'орочий набеги', 'логово скелетов', 'волчья стая',
  'паучье гнездо', 'круг стихийников', 'дух бездны',
];

test('vm без каталога mob_groups: фолбэк ИМЕННО 7 и 7 текущих имён; каталог подхватывается лениво (пустой вывод не кэшируется)', () => {
  // vm-песочницы (combat-ui) грузят map.js БЕЗ mob-groups-data.js:
  // без каталога фолбэк обязан дать ровно текущие значения генерации
  // (hash2 % 7, 7 имён) — иначе мир в песочнице уедет (прецедент
  // 000055: фолбэк 13/3/3).
  const sandbox = {};
  loadInSandbox('perlin.js', sandbox);
  loadInSandbox('map.js', sandbox);
  assert.equal(sandbox.Game.MobGroupsData, undefined, 'mob-groups-data.js ещё не загружен');
  assert.equal(sandbox.Game.mobGroupCount(), 7, 'фолбэк mobGroupCount() без каталога = 7');
  for (let i = 0; i < 7; i++) {
    assert.equal(sandbox.Game.mobGroupName(i), MOB_GROUP_NAMES_EXPECTED[i],
      `фолбэк имя ${i}`);
  }
  assert.equal(sandbox.Game.mobGroupName(7), '', 'неизвестный индекс — пустая строка');
  assert.equal(sandbox.Game.mobGroupName(-1), '', 'отрицательный индекс — пустая строка');
  // Каталог подхватывается лениво: пустой вывод ДО загрузки НЕ
  // кэшируется — после mob-groups-data.js значения производные.
  loadInSandbox('mob-groups-data.js', sandbox);
  assert.ok(sandbox.Game.MobGroupsData, 'каталог загружен');
  assert.equal(sandbox.Game.mobGroupCount(), 7, 'каталог подхвачен (пустой вывод не закэширован)');
  for (let i = 0; i < 7; i++) {
    assert.equal(sandbox.Game.mobGroupName(i), MOB_GROUP_NAMES_EXPECTED[i],
      `имя ${i} — из каталога`);
  }
});

test('vm: инъекция ИСКРЁВЛЕННОГО MobGroupsData — mobGroupCount/mobGroupName отдают каталожные значения', () => {
  // Каталог — source of truth: подменённые значения (1 группа,
  // другое имя) обязаны вернуться из функций, а не фолбэк.
  const sandbox = {};
  loadInSandbox('perlin.js', sandbox);
  loadInSandbox('map.js', sandbox);
  sandbox.Game.MobGroupsData = {
    MOB_GROUPS: [{
      id: 1,
      название: 'тестовая группа',
      состав: { название: 't_group', мобы: ['wolf'] },
      спрайт: 'wolf',
      особые_параметры: {},
    }],
  };
  assert.equal(sandbox.Game.mobGroupCount(), 1, 'каталожное число групп');
  assert.equal(sandbox.Game.mobGroupName(0), 'тестовая группа', 'имя из каталога');
  assert.equal(sandbox.Game.mobGroupName(1), '', 'вне каталога — пустая строка');
});

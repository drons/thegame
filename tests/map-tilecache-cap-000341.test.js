// Задача 000341: cap кэша тайлов tileCache под худший вьюпорт против
// FIFO-трэша. Гарнитура kind=node — прямой импорт src/map.js (tests/map.test.js).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {
  createMap, visibleTileRange, createTileCache, ZOOM_MIN,
  TILE_CACHE_MAX,
} = require('../src/map.js');

// Худший вьюпорт (T1/T2 общий): минимальный зум × типовое окно 1920×1080.
const WORST_VIEW_W = 1920;
const WORST_VIEW_H = 1080;

function countingMap() {
  const state = { generated: 0 };
  state.map = {
    tileAt: (x, y) => {
      state.generated++;
      return { x, y };
    },
  };
  return state;
}

// Детерминированный LCG (Numerical Recipes) — координаты без Math.random.
function makeLcg(seed) {
  let s = seed >>> 0;
  return function next() {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s;
  };
}

test('000341 T1: TILE_CACHE_MAX >= N худшего вьюпорта (пин формулы и клампа зума)', () => {
  assert.equal(ZOOM_MIN, 4,
    'кламп минимального зума ушёл — пересчитать худший вьюпорт');
  const r = visibleTileRange(0, 0, WORST_VIEW_W, WORST_VIEW_H, ZOOM_MIN);
  const countX = r.x1 - r.x0 + 1;
  const countY = r.y1 - r.y0 + 1;
  assert.equal(countX, Math.ceil(WORST_VIEW_W / ZOOM_MIN) + 2,
    'margin=2 по оси X ушёл — пересчитать N');
  assert.equal(countY, Math.ceil(WORST_VIEW_H / ZOOM_MIN) + 2,
    'margin=2 по оси Y ушёл — пересчитать N');
  const n = countX * countY;
  assert.equal(n, 131104,
    `N худшего вьюпорта ${WORST_VIEW_W}×${WORST_VIEW_H}@z${ZOOM_MIN} = countX×countY`);
  assert.equal(typeof TILE_CACHE_MAX, 'number',
    'TILE_CACHE_MAX не экспортируется — cap tileCache не зафиксирован константой');
  assert.ok(TILE_CACHE_MAX >= n,
    `cap ${TILE_CACHE_MAX} < N худшего вьюпорта ${n} — FIFO-трэш на pan-кадрах`);
});

test('000341 T2: pan/ходьба через N+4096 уникальных тайлов — генерации ограничены первым заполнением', () => {
  const r = visibleTileRange(0, 0, WORST_VIEW_W, WORST_VIEW_H, ZOOM_MIN);
  const countX = r.x1 - r.x0 + 1;
  const countY = r.y1 - r.y0 + 1;
  const total = countX * countY + 4096;
  const coords = [];
  for (let i = 0; i < total; i++) {
    coords.push([r.x0 + (i % countX), r.y0 + Math.floor(i / countX)]);
  }
  const fake = countingMap();
  const cache = createTileCache(fake.map); // ДЕФОЛТНЫЙ cap — как main.js:4645
  for (const [x, y] of coords) cache.tile(x, y);
  assert.equal(fake.generated, total,
    `первый проход обязан сгенерировать ровно по одному разу на тайл (факт ${fake.generated})`);
  assert.equal(cache.size(), total,
    `после первого прохода все ${total} тайлов должны оставаться в кэше (факт ${cache.size()})`);
  const afterFill = fake.generated;
  // Повторный проход по тому же набору — pan/movement-кадр: только lookup,
  // ни одной регенерации (до подъёма cap — ~65k регенераций FIFO-трэша).
  for (const [x, y] of coords) cache.tile(x, y);
  assert.equal(fake.generated, afterFill,
    `второй проход по уже посещённым тайлам не должен генерировать: ${fake.generated} > ${afterFill} — FIFO вытесняет ещё видимые тайлы (cap ${TILE_CACHE_MAX} < рабочего набора ${total})`);
});

test('000341 T3: детерминизм — содержимое тайла не зависит от cap и FIFO-порядка вытеснения', () => {
  const map = createMap();
  const next = makeLcg(0x341);
  const coords = [];
  for (let i = 0; i < 200; i++) {
    coords.push([(next() % 2000) - 1000, (next() % 2000) - 1000]);
  }
  const thrashed = createTileCache(map, 16);
  const roomy = createTileCache(map, 1000000);
  const fromThrashed = [];
  const fromRoomy = [];
  for (const [x, y] of coords) {
    const direct = map.tileAt(x, y);
    const t = thrashed.tile(x, y);
    assert.deepEqual(t, direct,
      `тайл (${x},${y}) после evict-трэша обязан совпадать с tileAt (детерминизм чистой генерации)`);
    fromThrashed.push(t);
    fromRoomy.push(roomy.tile(x, y));
  }
  assert.deepEqual(fromThrashed, fromRoomy,
    'порядок запросов идентичен, cap разный → вытеснение меняет только object identity, не содержимое');
});

test('000341 T4: evict жив — кэш ограничен TILE_CACHE_MAX, вытесняется старейший', () => {
  assert.equal(typeof TILE_CACHE_MAX, 'number',
    'TILE_CACHE_MAX не экспортируется — нечего ограничивать');
  const total = TILE_CACHE_MAX + 8;
  const fake = countingMap();
  const cache = createTileCache(fake.map);
  for (let i = 0; i < total; i++) cache.tile(i % 1024, Math.floor(i / 1024));
  assert.equal(fake.generated, total,
    `все уникальные запросы генерируются (факт ${fake.generated} из ${total})`);
  assert.ok(cache.size() <= TILE_CACHE_MAX,
    `кэш не ограничен: ${cache.size()} > ${TILE_CACHE_MAX}`);
  cache.tile(0, 0);
  assert.equal(fake.generated, total + 1,
    'самый старый тайл обязан быть вытеснен и пересчитан при повторном запросе');
  const lastX = (total - 1) % 1024;
  const lastY = Math.floor((total - 1) / 1024);
  cache.tile(lastX, lastY);
  assert.equal(fake.generated, total + 1,
    'последний запрос должен остаться в кэше (вытесняется старейший, не новейший)');
});

test('000341 T5: guard — fpCache/nmCache не тронуты, дефолт createTileCache привязан к TILE_CACHE_MAX', () => {
  const src = fs.readFileSync(__dirname + '/../src/map.js', 'utf8');
  assert.ok(src.includes('fpCache.size > 65536'),
    'порог fpCache изменён — это отдельный кэш footprint, задача его НЕ трогает');
  assert.ok(src.includes('nmCache.size > 65536'),
    'порог nmCache изменён — это отдельный кэш, задача его НЕ трогает');
  assert.match(src, /function createTileCache\(map,\s*maxSize = TILE_CACHE_MAX\)/,
    'дефолтный cap createTileCache не привязан к TILE_CACHE_MAX — main.js (вызов без аргумента) подхватит не то значение');
});

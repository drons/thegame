// Задача 000263 (скорость отрисовки: чанковый рендер 16×16 с кэшем
// чанков) — RED-тесты, стадия КРАСНЫХ ТЕСТОВ (TDD).
//
// CC-1 — unit нового модуля src/chunk-cache.js (контракты
// memory/000263-chunked-render.md §2.1; ТЗ tasks/pending/000263.md
// «Тесты»: «кэш существует (offscreen-canvas на видимый чанк)»,
// геометрия — «результат тот же, что был»):
//   * require('../src/chunk-cache.js') — RED: модуля НЕТ
//     (MODULE_NOT_FOUND — осмысленно: файл не создан, не синтаксис);
//   * CHUNK_SIZE = 16; chunkRange — Math.floor на границах
//     (отрицательные координаты мира корректны);
//   * zoomBucket — каноническая сетка 1.2^k от ZOOM_START=80
//     (bucket(80)=0, bucket(96)=1, bucket(4)=−16, bucket(4.8)=−15,
//     bucket(4)=bucket(4.33)); гарды: NaN/отрицательный zoom → NaN;
//   * worldChunkLocalEdges ≡ worldAnchoredTileEdges (map.js, 000228)
//     попиксельно — свойство разделимости: local edge j == global
//     edge[j] − global edge[0] (100k случайных камер/зумов +
//     попиксельная сверка прямоугольников ВСЕХ 256 клеток чанка на
//     100 сценариях; зеркало метода 000228);
//   * camAnchoredChunkRect ≡ snappedTileRect (map.js, 000215)
//     попиксельно — тот же метод (100k + 100×256);
//   * worldChunkBlitRect — формула anchor'а worldAnchored (x =
//     round(viewW/2 − camX·zoom) + round(16·cx·zoom));
//   * createChunkCache — LRU по пикселям: вытеснение с начала, пока
//     pixels > maxPixels (многократное за один put), get-хит
//     пере-insert'ит (продлевает), clear, stats {chunks, pixels,
//     evictions}; дефолт maxPixels = 16 MP;
//   * гарды-зеркала snappedTileEdges: невалидные аргументы →
//     NaN-результат, без исключения.
//
// Числа чанков (264/576) и бюджеты сценариев — НЕ здесь: они зависят
// от детерминированного мира и пинятся в tests/chunk-render.test.js
// (CC-2..CC-7) вычислением от G.visibleTileRange, не хардкодом.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const MAP = require(path.join(ROOT, 'src', 'map.js'));

// Детерминированный PRNG (копия mulberry32, src/perlin.js): тест
// самодостаточен, сценарии воспроизводимы.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('CC-1: src/chunk-cache.js — CHUNK_SIZE=16, chunkRange/zoomBucket, геометрия ≡ мир-якорной (000228) и камерно-якорной (000215) сеткам попиксельно, LRU-кэш по пикселям (000263)', () => {
  // RED: модуля нет — падение с MODULE_NOT_FOUND (осмысленно:
  // «нет файла», стадия до реализации).
  const CC = require(path.join(ROOT, 'src', 'chunk-cache.js'));

  // --- Экспорты и константы ---
  assert.equal(CC.CHUNK_SIZE, 16, 'CHUNK_SIZE = 16');
  for (const k of ['chunkRange', 'zoomBucket', 'worldChunkLocalEdges',
      'worldChunkBlitRect', 'camAnchoredChunkRect', 'createChunkCache']) {
    assert.equal(typeof CC[k], 'function', 'экспорт ' + k + ' — функция');
  }

  // --- chunkRange: Math.floor на границах, отрицательные координаты ---
  assert.deepEqual(CC.chunkRange(0, 0, 255, 255),
    { cx0: 0, cy0: 0, cx1: 15, cy1: 15 },
    'chunkRange(0..255) — 16×16 чанков без смещения');
  assert.deepEqual(CC.chunkRange(16, 0, 31, 0),
    { cx0: 1, cy0: 0, cx1: 1, cy1: 0 },
    'chunkRange(16..31) — один чанк cx=1 (floor на границах)');
  assert.deepEqual(CC.chunkRange(-1, -1, 0, 0),
    { cx0: -1, cy0: -1, cx1: 0, cy1: 0 },
    'отрицательные координаты: floor(−1/16)=−1');
  // Сценарии мира (детерминированный мир, спавн (0,0), cam (0.5,0.5)):
  // 1280×720 @ z=4: тайлы x −161..160, y −91..90 → 22×12 чанков.
  assert.deepEqual(CC.chunkRange(-161, -91, 160, 90),
    { cx0: -11, cy0: -6, cx1: 10, cy1: 5 },
    'мир 1280×720 @ z=4: чанки −11..10 × −6..5 (22×12)');
  // 1920×1080 @ z=4: тайлы x −241..240, y −136..135 → 32×18.
  assert.deepEqual(CC.chunkRange(-241, -136, 240, 135),
    { cx0: -16, cy0: -9, cx1: 15, cy1: 8 },
    'мир 1920×1080 @ z=4: чанки −16..15 × −9..8 (32×18)');
  assert.deepEqual(CC.chunkRange(0, 0, 63, 63, 16),
    { cx0: 0, cy0: 0, cx1: 3, cy1: 3 },
    'сетка 63×63 — 4×4 чанка (подземелье CC-6)');

  // --- zoomBucket: каноническая сетка 1.2^k от 80 ---
  const zb = (z, ...rest) => CC.zoomBucket(z, ...rest);
  assert.equal(zb(80), 0, 'bucket(80) = 0 (ZOOM_START)');
  assert.equal(zb(96), 1, 'bucket(96) = 1 (80·1.2)');
  assert.equal(zb(80 / 1.2), -1, 'bucket(80/1.2) = −1');
  assert.equal(zb(4), -16, 'bucket(4) = −16 (ZOOM_MIN, wheel-грид)');
  assert.equal(zb(4.8), -15, 'bucket(4.8) = −15 (4·1.2 — соседний бакет)');
  assert.equal(zb(4.33), -16, 'bucket(4.33) = −16 (тот же бакет, что 4)');
  // Шаг колеса ±1.2 двигает бакет ровно на 1 (FP-грид 4·1.2^k).
  let prev = zb(4);
  for (let k = 1; k <= 8; k++) {
    const b = zb(4 * Math.pow(1.2, k));
    assert.equal(b, prev + 1,
      'каждый wheel-шаг — соседний бакет (k=' + k + '): '
      + b + ' === ' + prev + ' + 1');
    prev = b;
  }
  // Свойые start/step (подпись с параметрами).
  assert.equal(zb(100, 100, 2), 0, 'bucket(100, start=100, step=2) = 0');
  assert.equal(zb(200, 100, 2), 1, 'bucket(200, 100, 2) = 1');
  assert.equal(zb(50, 100, 2), -1, 'bucket(50, 100, 2) = −1');
  // Гарды: невалидный zoom → NaN, без исключения.
  assert.ok(Number.isNaN(zb(NaN)), 'bucket(NaN) = NaN');
  assert.ok(Number.isNaN(zb(-4)), 'bucket(−4) = NaN (log отрицательного)');

  // --- Геометрия: свойство разделимости (100k сценариев) ---
  //
  // local edge j ≡ global edge[j] − global edge[0]: мир-якорная
  // сетка 000228 (worldAnchoredTileEdges) и камерно-якорная 000215
  // (snappedTileEdges) — ОДНА формула на весь диапазон, чанк —
  // её 16-клеточное окно. Зум — только wheel-грид (4·1.2^k, как в
  // игре), камеры/вьюпорты — случайные.
  const rnd = mulberry32(0x000263);
  const VIEWS = [[1280, 720], [1920, 1080], [800, 600], [1366, 768],
    [2560, 1440]];
  const scenario = () => {
    const k = -17 + Math.floor(rnd() * 26); // −17..8
    return {
      cx: -20 + Math.floor(rnd() * 40),
      cy: -20 + Math.floor(rnd() * 40),
      zoom: 4 * Math.pow(1.2, k),
      camX: (rnd() * 2 - 1) * 400,
      camY: (rnd() * 2 - 1) * 400,
      view: VIEWS[Math.floor(rnd() * VIEWS.length)],
    };
  };
  for (let i = 0; i < 100000; i++) {
    const { cx, cy, zoom, camX, camY, view } = scenario();
    const [vw, vh] = view;
    // (a) мир-якорная: local ≡ worldAnchored окно 16cx..16cx+16.
    const gw = MAP.worldAnchoredTileEdges(16 * cx, 16 * cy,
      16 * cx + 16, 16 * cy + 16, camX, camY, zoom, vw, vh);
    const lw = CC.worldChunkLocalEdges(cx, cy, zoom);
    assert.equal(lw.ex.length, 17, 'worldChunkLocalEdges: ex[17]');
    assert.equal(lw.ey.length, 17, 'worldChunkLocalEdges: ey[17]');
    assert.equal(lw.w.length, 16, 'worldChunkLocalEdges: w[16]');
    assert.equal(lw.h.length, 16, 'worldChunkLocalEdges: h[16]');
    for (let j = 0; j <= 16; j++) {
      assert.equal(lw.ex[j], gw.x[j] - gw.x[0],
        'мир: local x-edge ' + j + ' == global[' + j + '] − global[0]');
    }
    for (let j = 0; j <= 16; j++) {
      assert.equal(lw.ey[j], gw.y[j] - gw.y[0],
        'мир: local y-edge ' + j + ' == global[' + j + '] − global[0]');
    }
    // (b) камерно-якорная: origin ≡ первый край окна, local ≡ окну.
    const gc = MAP.snappedTileEdges(16 * cx, 16 * cy,
      16 * cx + 16, 16 * cy + 16, camX, camY, zoom, vw, vh);
    const lc = CC.camAnchoredChunkRect(cx, cy, zoom, camX, camY, vw, vh);
    assert.equal(lc.origin.x, gc.x[0],
      'камера: origin.x == первый камерно-якорный край');
    for (let j = 0; j <= 16; j++) {
      assert.equal(lc.ex[j], gc.x[j] - gc.x[0],
        'камера: local x-edge ' + j + ' == global[' + j + '] − global[0]');
    }
    for (let j = 0; j <= 16; j++) {
      assert.equal(lc.ey[j], gc.y[j] - gc.y[0],
        'камера: local y-edge ' + j + ' == global[' + j + '] − global[0]');
    }
    // w/h — разности соседних локальных краёв.
    for (let j = 0; j < 16; j++) {
      assert.equal(lw.w[j], lw.ex[j + 1] - lw.ex[j],
        'мир: w[j] = ex[j+1] − ex[j]');
      assert.equal(lc.h[j], lc.ey[j + 1] - lc.ey[j],
        'камера: h[j] = ey[j+1] − ey[j]');
    }
  }

  // --- Попиксельные прямоугольники ВСЕХ 256 клеток (100+100
  // сценариев): рендер чанка обязан дать ровно те же пиксели, что
  // per-tile путь (контракт «результат тот же, что был»). ---
  for (let i = 0; i < 100; i++) {
    const { cx, cy, zoom, camX, camY, view } = scenario();
    const [vw, vh] = view;
    const gw = MAP.worldAnchoredTileEdges(16 * cx, 16 * cy,
      16 * cx + 16, 16 * cy + 16, camX, camY, zoom, vw, vh);
    const lw = CC.worldChunkLocalEdges(cx, cy, zoom);
    const bl = CC.worldChunkBlitRect(cx, cy, zoom, camX, camY, vw, vh);
    // Blit-прямоугольник — ровно окно глобальной мир-якорной сетки.
    assert.equal(bl.x, gw.x[0], 'мир: blit.x == global x-edge[0]');
    assert.equal(bl.y, gw.y[0], 'мир: blit.y == global y-edge[0]');
    assert.equal(bl.w, gw.x[16] - gw.x[0], 'мир: blit.w == окно 16 клеток');
    assert.equal(bl.h, gw.y[16] - gw.y[0], 'мир: blit.h == окно 16 строк');
    // Формула anchor'а (worldAnchored, 000228) — явно.
    assert.equal(bl.x,
      Math.round(vw / 2 - camX * zoom) + Math.round(16 * cx * zoom),
      'мир: blit.x = round(vw/2 − camX·z) + round(16·cx·z)');
    for (let jx = 0; jx < 16; jx++) {
      for (let jy = 0; jy < 16; jy++) {
        // Клетка (16cx+jx, 16cy+jy): перенесённый в локальные
        // координаты rect == глобальному rect минус offset блита.
        assert.equal(gw.x[jx] - bl.x, lw.ex[jx],
          'мир: локальный x-край клетки (' + jx + ',' + jy + ')');
        assert.equal(gw.y[jy] - bl.y, lw.ey[jy],
          'мир: локальный y-край клетки (' + jx + ',' + jy + ')');
        assert.equal(gw.x[jx + 1] - gw.x[jx], lw.w[jx],
          'мир: локальная ширина клетки (' + jx + ',' + jy + ')');
        assert.equal(gw.y[jy + 1] - gw.y[jy], lw.h[jy],
          'мир: локальная высота клетки (' + jx + ',' + jy + ')');
      }
    }
  }
  for (let i = 0; i < 100; i++) {
    const { cx, cy, zoom, camX, camY, view } = scenario();
    const [vw, vh] = view;
    const lc = CC.camAnchoredChunkRect(cx, cy, zoom, camX, camY, vw, vh);
    const g0 = MAP.snappedTileRect(16 * cx, 16 * cy, camX, camY, zoom,
      vw, vh);
    assert.equal(lc.origin.x, g0.x,
      'камера: origin == snappedTileRect первого угла чанка (x)');
    assert.equal(lc.origin.y, g0.y,
      'камера: origin == snappedTileRect первого угла чанка (y)');
    for (let jx = 0; jx < 16; jx++) {
      for (let jy = 0; jy < 16; jy++) {
        const r = MAP.snappedTileRect(16 * cx + jx, 16 * cy + jy,
          camX, camY, zoom, vw, vh);
        // Локальный rect клетки == глобальному rect минус origin
        // (TS-10/11/12 по смыслу: формулы клеток не меняются).
        assert.equal(r.x - lc.origin.x, lc.ex[jx],
          'камера: локальный x-край клетки (' + jx + ',' + jy + ')');
        assert.equal(r.y - lc.origin.y, lc.ey[jy],
          'камера: локальный y-край клетки (' + jx + ',' + jy + ')');
        assert.equal(r.w, lc.w[jx],
          'камера: локальная ширина == глобальной (' + jx + ',' + jy + ')');
        assert.equal(r.h, lc.h[jy],
          'камера: локальная высота == глобальной (' + jx + ',' + jy + ')');
      }
    }
  }

  // --- Гарды-зеркала snappedTileEdges: NaN-результат, нет исключ. ---
  for (const args of [[0, 0, NaN], [NaN, 0, 80], [0, 0, -4]]) {
    assert.doesNotThrow(() => CC.worldChunkLocalEdges(...args),
      'worldChunkLocalEdges невалидных аргументов — без исключения');
    const r = CC.worldChunkLocalEdges(...args);
    assert.ok(r.ex.some(Number.isNaN) && r.ey.some(Number.isNaN),
      'worldChunkLocalEdges невалидных аргументов → NaN-края');
  }
  for (const args of [[0, 0, NaN, 0.5, 0.5, 1280, 720],
    [0, 0, 80, NaN, 0.5, 1280, 720]]) {
    assert.doesNotThrow(
      () => CC.worldChunkBlitRect(...args),
      'worldChunkBlitRect невалидных аргументов — без исключения');
    const r = CC.worldChunkBlitRect(...args);
    assert.ok(Number.isNaN(r.x) && Number.isNaN(r.y)
      && Number.isNaN(r.w) && Number.isNaN(r.h),
      'worldChunkBlitRect невалидных аргументов → {NaN×4}');
  }
  const bad = CC.camAnchoredChunkRect(0, 0, NaN, 0.5, 0.5, 800, 600);
  assert.ok(Number.isNaN(bad.origin.x) && bad.ex.some(Number.isNaN),
    'camAnchoredChunkRect невалидных аргументов → NaN');

  // --- createChunkCache: LRU по пикселям ---
  const MP = 1024 * 1024;
  const entry = (k, pixels) => ({ canvas: { id: k }, w: 1, h: 1, pixels,
    zoom: 80, ex: [0], ey: [0] });
  const c = CC.createChunkCache({ maxPixels: 16 * MP });
  assert.deepEqual(c.stats(), { chunks: 0, pixels: 0, evictions: 0 },
    'пустой кэш: stats {0, 0, 0}');
  assert.equal(c.get('a'), null, 'get miss — null');
  const aEntry = entry('a', 6 * MP);
  const bEntry = entry('b', 6 * MP);
  c.put('a', aEntry);
  c.put('b', bEntry);
  assert.deepEqual(c.stats(),
    { chunks: 2, pixels: 12 * MP, evictions: 0 },
    '2×6 MP при maxPixels 16 MP — без вытеснения');
  c.put('c', entry('c', 6 * MP));
  // 18 MP > 16 MP → вытесняется старейший (a) — с НАЧАЛА Map.
  assert.deepEqual(c.stats(),
    { chunks: 2, pixels: 12 * MP, evictions: 1 },
    'put 3-го 6 MP → вытеснение старейшего (a)');
  assert.equal(c.get('a'), null, 'a вытеснен (LRU: с начала)');
  // get-хит: возвращает вложенный entry (тождество) И пере-insert'ит
  // (b → в хвост: порядок Map [c, b]).
  assert.equal(c.get('b'), bEntry, 'get hit — возвращает entry (тождество)');
  c.put('d', entry('d', 6 * MP));
  // 18 MP > 16 MP → вытесняется c (голова после get(b)) — НЕ b:
  // LRU (последнее ИСПОЛЬЗОВАНИЕ), не FIFO (последний put).
  assert.equal(c.get('c'), null,
    'c вытеснен, хотя put' + ' c был новее b (хит get(b) продлил b)');
  assert.equal(c.get('b'), bEntry, 'b пережил put d (LRU-хит)');
  assert.deepEqual(c.stats(),
    { chunks: 2, pixels: 12 * MP, evictions: 2 },
    'после put d: {b, d}, evictions 2');
  // Многократное вытеснение за ОДИН put (while pixels > maxPixels):
  // {b:6, d:6} + e:16 = 28 → b (22 > 16) → d (16 ≤ 16, стоп).
  c.put('e', entry('e', 16 * MP));
  assert.equal(c.get('b'), null, 'b вытеснен (28 > 16)');
  assert.equal(c.get('d'), null, 'd вытеснен (22 > 16, while-цикл)');
  assert.ok(c.get('e'), 'e в кэше');
  assert.deepEqual(c.stats(),
    { chunks: 1, pixels: 16 * MP, evictions: 4 },
    'после put e: ровно 16 MP, evictions 4 (два за один put)');
  // Повторный put тем же ключом — замена (не накопление пикселей).
  c.put('e', entry('e', 4 * MP));
  assert.deepEqual(c.stats(),
    { chunks: 1, pixels: 4 * MP, evictions: 4 },
    'put тем же ключом — замена entry');
  c.clear();
  assert.equal(c.stats().chunks, 0, 'clear: 0 chunks');
  assert.equal(c.stats().pixels, 0, 'clear: 0 pixels');
  assert.equal(c.get('e'), null, 'clear: кэш пуст');

  // Дефолт maxPixels = 16 MP (16·1024·1024).
  const d = CC.createChunkCache();
  d.put('g', entry('g', 16 * MP));
  assert.equal(d.stats().chunks, 1, '16 MP == maxPixels — вытеснения нет');
  d.put('h', entry('h', 1 * MP));
  assert.equal(d.get('g'), null, '17 MP > 16 MP — вытеснен старейший');
  assert.equal(d.stats().pixels, 1 * MP, 'дефолт maxPixels = 16 MP');
});

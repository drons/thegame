//
// Униформный модуль: в браузере — globalThis.Game, в node — require().

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Game = Object.assign({}, root.Game, { ChunkCache: factory() });
  }
})(typeof globalThis !== 'undefined' ? globalThis : self, function () {
  'use strict';

  const CHUNK_SIZE = 16;
  const DEFAULT_MAX_PIXELS = 16 * 1024 * 1024;

  function isNum(v) {
    return typeof v === 'number' && Number.isFinite(v);
  }

  function chunkRange(x0, y0, x1, y1, size) {
    const s = size === undefined ? CHUNK_SIZE : size;
    return {
      cx0: Math.floor(x0 / s),
      cy0: Math.floor(y0 / s),
      cx1: Math.floor(x1 / s),
      cy1: Math.floor(y1 / s),
    };
  }

  function zoomBucket(zoom, start, step) {
    const s = start === undefined ? 80 : start;
    const k = step === undefined ? 1.2 : step;
    if (!isNum(zoom) || zoom <= 0
        || !isNum(s) || s <= 0
        || !isNum(k) || k <= 1) {
      return NaN;
    }
    return Math.round(Math.log(zoom / s) / Math.log(k));
  }

  function worldChunkLocalEdges(cx, cy, zoom) {
    const ex = new Array(17).fill(NaN);
    const ey = new Array(17).fill(NaN);
    const w = new Array(16).fill(NaN);
    const h = new Array(16).fill(NaN);
    if (!isNum(cx) || !isNum(cy) || !isNum(zoom)) {
      return { ex, ey, w, h };
    }
    if (!Number.isInteger(cx) || !Number.isInteger(cy) || zoom <= 0) {
      return { ex, ey, w, h };
    }
    const bx0 = Math.round(CHUNK_SIZE * cx * zoom);
    const by0 = Math.round(CHUNK_SIZE * cy * zoom);
    for (let j = 0; j <= CHUNK_SIZE; j++) {
      ex[j] = Math.round((CHUNK_SIZE * cx + j) * zoom) - bx0;
      ey[j] = Math.round((CHUNK_SIZE * cy + j) * zoom) - by0;
    }
    for (let j = 0; j < CHUNK_SIZE; j++) {
      w[j] = ex[j + 1] - ex[j];
      h[j] = ey[j + 1] - ey[j];
    }
    return { ex, ey, w, h };
  }

  function worldChunkBlitRect(cx, cy, zoom, camX, camY, viewW, viewH) {
    if (!isNum(cx) || !isNum(cy) || !isNum(zoom)
        || !isNum(camX) || !isNum(camY)
        || !isNum(viewW) || !isNum(viewH)) {
      return { x: NaN, y: NaN, w: NaN, h: NaN };
    }
    if (!Number.isInteger(cx) || !Number.isInteger(cy)
        || zoom <= 0 || viewW <= 0 || viewH <= 0) {
      return { x: NaN, y: NaN, w: NaN, h: NaN };
    }
    const ax = Math.round(CHUNK_SIZE * cx * zoom);
    const ay = Math.round(CHUNK_SIZE * cy * zoom);
    return {
      x: Math.round(viewW / 2 - camX * zoom) + ax,
      y: Math.round(viewH / 2 - camY * zoom) + ay,
      w: Math.round((CHUNK_SIZE * cx + CHUNK_SIZE) * zoom) - ax,
      h: Math.round((CHUNK_SIZE * cy + CHUNK_SIZE) * zoom) - ay,
    };
  }

  function camAnchoredChunkRect(cx, cy, zoom, camX, camY, viewW, viewH) {
    const origin = { x: NaN, y: NaN };
    const ex = new Array(17).fill(NaN);
    const ey = new Array(17).fill(NaN);
    const w = new Array(16).fill(NaN);
    const h = new Array(16).fill(NaN);
    if (!isNum(cx) || !isNum(cy) || !isNum(zoom)
        || !isNum(camX) || !isNum(camY)
        || !isNum(viewW) || !isNum(viewH)) {
      return { origin, ex, ey, w, h };
    }
    if (!Number.isInteger(cx) || !Number.isInteger(cy)
        || zoom <= 0 || viewW <= 0 || viewH <= 0) {
      return { origin, ex, ey, w, h };
    }
    origin.x = Math.round(viewW / 2 + (CHUNK_SIZE * cx - camX) * zoom);
    origin.y = Math.round(viewH / 2 + (CHUNK_SIZE * cy - camY) * zoom);
    for (let j = 0; j <= CHUNK_SIZE; j++) {
      ex[j] = Math.round(viewW / 2
        + (CHUNK_SIZE * cx + j - camX) * zoom) - origin.x;
      ey[j] = Math.round(viewH / 2
        + (CHUNK_SIZE * cy + j - camY) * zoom) - origin.y;
    }
    for (let j = 0; j < CHUNK_SIZE; j++) {
      w[j] = ex[j + 1] - ex[j];
      h[j] = ey[j + 1] - ey[j];
    }
    return { origin, ex, ey, w, h };
  }

  function createChunkCache(opts) {
    const maxPixels = (opts && typeof opts.maxPixels === 'number'
      && Number.isFinite(opts.maxPixels) && opts.maxPixels > 0)
      ? opts.maxPixels
      : DEFAULT_MAX_PIXELS;
    const map = new Map();
    let pixels = 0;
    let evictions = 0;

    function evictOldest() {
      const it = map.keys().next();
      if (it.done) return;
      pixels -= map.get(it.value).pixels;
      map.delete(it.value);
      evictions += 1;
    }

    return {
      get(key) {
        if (!map.has(key)) return null;
        const entry = map.get(key);
        map.delete(key);
        map.set(key, entry);
        return entry;
      },
      put(key, entry) {
        if (map.has(key)) {
          pixels -= map.get(key).pixels;
          map.delete(key);
        }
        map.set(key, entry);
        pixels += entry.pixels;
        while (pixels > maxPixels && map.size > 1) {
          evictOldest();
        }
      },
      clear() {
        map.clear();
        pixels = 0;
        evictions = 0;
      },
      stats() {
        return { chunks: map.size, pixels, evictions };
      },
    };
  }

  return {
    CHUNK_SIZE,
    DEFAULT_MAX_PIXELS,
    chunkRange,
    zoomBucket,
    worldChunkLocalEdges,
    worldChunkBlitRect,
    camAnchoredChunkRect,
    createChunkCache,
  };
});

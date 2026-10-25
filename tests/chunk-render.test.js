// Задача 000263 (скорость отрисовки мировой карты и городов/подземелий:
// чанковый рендер 16×16 с кэшем чанков) — RED-тесты, стадия КРАСНЫХ
// ТЕСТОВ (TDD).
//
// Контракты: memory/000263-chunked-render.md (§2.1 API, §2.2 мир,
// §2.3 подземелье/город, §7 красные); ТЗ tasks/pending/000263.md
// «Тесты»; план /tmp/thegame-wf-000263/a3-tests.md.
//
// CC-2 (мир 1280×720, z=4): offscreen-чанки существуют (зафиксированные
// createElement-канвасы с записями); blit-пин: drawImage на
// sprites-канвасе == ЧИСЛУ ВИДИМЫХ ЧАНКОВ (264 = 22×12 — вычисляется
// от visibleTileRange, не хардкод: в мире спавна range x −161..160 /
// y −91..90); 0 per-tile статичных тайлов (запеклись); вода — per-tile,
// попиксельно == worldAnchored-сетке (000228) и frameIndex (R5,
// биту-в-бит со старым путём); воды в чанках НЕТ (анимация не
// запекается); координаты блитов == мир-якорной сетке попиксельно (R4);
// z-порядок: блиты → вода → постройки → агро → мобы → герой (R4).
//
// CC-3: тёплый кадр — 0 re-bake (записи на чанк-канвасах не растут),
// блиты стабильны; колесо на ZOOM_MIN — клэмпа z = 4.0 ТОЧНО (FP:
// 4/1.2 клэмпится в 4) → 0 re-bake; ZOOM_START (198 тайлов < 8192) —
// чанков нет, per-tile путь (guard гейта; колесом из z=4 в 80 НЕ
// добраться — 20 = не степень 1.2, новый сценарий = fresh-boot).
//
// CC-4: невалидация по зуму: z=4 (bucket −16) → warm; 1 wheel-in
// z=4·1.2 = 4.8 ТОЧНО (bucket −15) → новые ключи → новые bake
// (180 = 18×10, вычисляется); 1 wheel-out z = 4.8/1.2 = 4.0 ТОЧНО
// (FP: 4·1.2/1.2 === 4) → entry из warm ЕЩЁ В КЭШЕ (16 MP, ~2.2 MP
// суммарно — вытеснений нет) → 0 re-bake, 264 blit — пин SURVIVAL +
// гарда 1e-6 + edgesEqual.
//
// CC-5 (PERF-пин, отдельный sandbox 1920×1080, z=4, тёплый кэш):
// total drawImage < 40 000 (бюджет ТЗ) И ≤ вода + чанки + постройки +
// мобы + 50 (СТРУКТУРНЫЙ: худший случай — каждый динамический слой
// одним drawImage; baseline ДО фикса = 131 104 per-tile тайлов +
// динамика ≈ 133 774 → RED). ЧИСЛА СЦЕНАРИЯ ВЫЧИСЛЯЮТСЯ от
// детерминированного мира (тот же seed, что в песочнице: map.png
// всегда onerror → G.generateSeedPixels). ОТКЛОНЕНИЕ ОТ КОНТРАКТА §7:
// «527 + 250» — неверно для реального мира (видимых чанков 576 =
// 32×18, а не 527; построек 1200 + мобы 1469 в кадре, а не ≤250) —
// бюджет пересобран по фактическим слоям; абсолютный порог 40 000 —
// без изменений.
//
// CC-6 (подземелье 63×63 @ z=4, камера закреплена (31.5, 31.5)):
// чанков 4×4 = 16, blit-ов 16; 0 per-cell floor/wall на основном
// канвасе (запеклось); origin блита == snappedTileRect(16cx, 16cy) и
// локальный rect клетки == snappedTileRect(x, y) − origin ПОПИКСЕЛЬНО
// (TS-10/11/12 по смыслу: формулы клеток не меняются); шаг игрока
// (31,31)→(32,31) — targeted re-bake ТОЛЬКО чанков (2,1)/(2,2)
// (fog 0→2: столбец x=37), остальные 14 переиспользуются; FOG_DIM =
// клетки mask==1 (столбец x=26, 11 fillRect) — динамический pass
// интактен.
//
// CC-7 (город 26×26 @ z=20, 800×600): 676 клеток ≤ 1024 → город НЕ
// чанкуется (guard: 0 чанк-канвасов, 0 blit'ов, ВСЕ 676 клеток —
// per-cell fillRect городским палитрам); структурный пин: dungeon-ui.js
// ССЫЛАЕТСЯ на ChunkCache (единое ядро чанков для подземелья/города —
// §2.3; RED: ссылки нет — интеграции нет).
//
// ХАРНЕСЫ (копии паттернов, файлы самодостаточны):
//   * мир — ВЕСЬ <script>-цепочка index.html в vm (паттерн
//     tests/global-map-draw.test.js); новый модуль подхватывается
//     script-тегом автоматически (index.html ре-пинится станцией
//     реализации — §5 контракта);
//   * подземелье/город — vm-partial (паттерн tests/dungeon-ui.test.js);
//     src/chunk-cache.js в цепочке, ЕСЛИ СУЩЕСТВУЕТ (RED: модуля нет —
//     dungeon-ui деградирует тихо, тест падает по ПОВЕДЕНИЮ, а не по
//     ENOENT-краху харнеса).
//
// expectedRedCount = 6 (CC-2..CC-7) + CC-1 (chunk-cache.test.js) +
// CC-8 (spec-000263-wording.test.js) = 8.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const srcOf = (f) => fs.readFileSync(path.join(ROOT, 'src', f), 'utf8');

// Цепочка мира — из index.html (не хардкод; паттерн main-visuals).
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CHAIN = Array.from(html.matchAll(/<script\s+src="([^"]+)"/g), (m) => m[1])
  .map((p) => p.replace(/^src\//, ''));

// --- Независимая модель детерминированного мира (node-ветки UMD) ---
//
// Мир в песочнице = тот же: map.png ВСЕГДА onerror →
// G.generateSeedPixels (фиксированный seed, как во всех vm-харнесах).
// ЧИСЛА СЦЕНАРИЯ (чанки/вода/постройки/мобы) — ВЫЧИСЛЯЮТСЯ, не
// хардкодятся: ассерты выживают при смене мира/ассетов/зума.
const MAP = require(path.join(ROOT, 'src', 'map.js'));
const SEED = require(path.join(ROOT, 'src', 'mapseed.js'));
const SPR = require(path.join(ROOT, 'src', 'sprites.js'));
const CITIES = require(path.join(ROOT, 'src', 'cities.js'));
const WORLD = MAP.createMap(SEED.generateSeedPixels());

const CHUNK = 16;
const chunkRangeOf = (r) => ({
  cx0: Math.floor(r.x0 / CHUNK),
  cy0: Math.floor(r.y0 / CHUNK),
  cx1: Math.floor(r.x1 / CHUNK),
  cy1: Math.floor(r.y1 / CHUNK),
});

// Сцена мира: видимый диапазон + число чанков/воды/построек/мобов +
// ожидаемые прямоугольники блитов (мир-якорная сетка 000228).
function worldScene(viewW, viewH, zoom, camX, camY) {
  const r = MAP.visibleTileRange(camX, camY, viewW, viewH, zoom);
  const cr = chunkRangeOf(r);
  const nChunks = (cr.cx1 - cr.cx0 + 1) * (cr.cy1 - cr.cy0 + 1);
  let waterTiles = 0, nMobs = 0;
  const anchors = new Set();
  for (let y = r.y0; y <= r.y1; y++) {
    for (let x = r.x0; x <= r.x1; x++) {
      const t = WORLD.tileAt(x, y);
      if (t.terrain === MAP.TERRAIN.WATER
          || t.terrain === MAP.TERRAIN.DEEP_WATER) waterTiles += 1;
      if (t.hasMobGroup) nMobs += 1;
      if (t.inBuilding && t.buildingAnchor) {
        anchors.add(t.buildingAnchor[0] + ',' + t.buildingAnchor[1]);
      }
    }
  }
  const blits = [];
  for (let cy = cr.cy0; cy <= cr.cy1; cy++) {
    for (let cx = cr.cx0; cx <= cr.cx1; cx++) {
      const e = MAP.worldAnchoredTileEdges(16 * cx, 16 * cy,
        16 * cx + 16, 16 * cy + 16, camX, camY, zoom, viewW, viewH);
      blits.push({ x: e.x[0], y: e.y[0], w: e.x[16] - e.x[0],
        h: e.y[16] - e.y[0] });
    }
  }
  return {
    range: r, chunkRange: cr,
    nTiles: (r.x1 - r.x0 + 1) * (r.y1 - r.y0 + 1),
    nChunks, waterTiles, nBuildings: anchors.size, nMobs, blits,
  };
}

// Водяные тайлы с ОЖИДАЕМЫМИ rect'ами (worldAnchored) и frameIndex-
// кадрами (биту-в-бит со старым per-tile путём, R5).
function waterTilesAt(viewW, viewH, zoom, camX, camY, now) {
  const r = MAP.visibleTileRange(camX, camY, viewW, viewH, zoom);
  const e = MAP.worldAnchoredTileEdges(r.x0, r.y0, r.x1, r.y1,
    camX, camY, zoom, viewW, viewH);
  const out = [];
  for (let y = r.y0; y <= r.y1; y++) {
    for (let x = r.x0; x <= r.x1; x++) {
      const t = WORLD.tileAt(x, y);
      if (t.terrain !== MAP.TERRAIN.WATER
          && t.terrain !== MAP.TERRAIN.DEEP_WATER) continue;
      const ix = x - r.x0, iy = y - r.y0;
      const frames = SPR.tileFrames(t.terrain);
      const idx = frames.length > 1
        ? SPR.frameIndex(now, x, y, frames.length) : 0;
      out.push({ x: e.x[ix], y: e.y[iy],
        w: e.x[ix + 1] - e.x[ix], h: e.y[iy + 1] - e.y[iy],
        asset: frames[idx] });
    }
  }
  return out;
}

// CC-9: чанки, содержащие ≥1 тайл данного террейна (область 16×16
// каждого чанка — как bakeWorldChunk).
function terrainChunkSet(terrain, cr) {
  const out = new Set();
  for (let cy = cr.cy0; cy <= cr.cy1; cy++) {
    for (let cx = cr.cx0; cx <= cr.cx1; cx++) {
      for (let jy = 0; jy < CHUNK; jy++) {
        for (let jx = 0; jx < CHUNK; jx++) {
          if (WORLD.tileAt(16 * cx + jx, 16 * cy + jy).terrain === terrain) {
            out.add(cx + ',' + cy);
            break;
          }
        }
      }
    }
  }
  return out;
}

// CC-9: суммарные записи на канвасах (re-bake = НОВЫЙ канвас, записи
// на живом канвасе не растут — CC-3).
function totalCanvasWrites(canvases) {
  let n = 0;
  for (const cv of canvases) n += cv.drawCalls.length;
  return n;
}

// === Харнес МИРА (копия tests/global-map-draw.test.js, + tracking
// созданных createElement-канвасов = offscreen-чанков) ===

const NOW = 1000; // performance.now() в песочнице заморожен на NOW

function makeGl(glCalls) {
  const noop = () => {};
  const gl = {
    VERTEX_SHADER: 35633, FRAGMENT_SHADER: 35632,
    COMPILE_STATUS: 35713, LINK_STATUS: 35714,
    ARRAY_BUFFER: 34962, DYNAMIC_DRAW: 35048, FLOAT: 5126,
    COLOR_BUFFER_BIT: 1024, TRIANGLES: 4,
  };
  gl.createShader = () => ({});
  gl.shaderSource = noop;
  gl.compileShader = noop;
  gl.getShaderParameter = () => true;
  gl.getShaderInfoLog = () => '';
  gl.createProgram = () => ({});
  gl.attachShader = noop;
  gl.linkProgram = noop;
  gl.getProgramParameter = () => true;
  gl.getProgramInfoLog = () => '';
  gl.useProgram = noop;
  let attrib = 0;
  gl.getAttribLocation = () => attrib++;
  gl.getUniformLocation = () => ({});
  gl.enableVertexAttribArray = noop;
  gl.createBuffer = () => ({});
  gl.bindBuffer = noop;
  gl.vertexAttribPointer = noop;
  gl.viewport = noop;
  gl.clearColor = noop;
  gl.clear = noop;
  gl.uniformMatrix4fv = noop;
  gl.bufferData = (target, data, usage) => {
    glCalls.push({ fn: 'bufferData', data });
  };
  gl.drawArrays = (mode, first, count) => {
    glCalls.push({ fn: 'drawArrays', count });
  };
  return gl;
}

function makeContext2d(el) {
  const calls = el.drawCalls = [];
  return new Proxy({}, {
    get: (t, k) => (k in t ? t[k] : (...args) => { calls.push([k, args]); }),
    set: (t, k, v) => { t[k] = v; return true; },
  });
}

function makeEl(tag) {
  const target = {
    tagName: tag,
    className: '',
    textContent: '',
    title: '',
    style: {},
    dataset: {},
    children: [],
    listeners: {},
    appendChild(ch) { target.children.push(ch); return ch; },
    addEventListener(type, fn) {
      (target.listeners[type] || (target.listeners[type] = [])).push(fn);
    },
    removeEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    closest() { return null; },
    setAttribute(k, v) {
      if (String(k).startsWith('data-')) {
        target.dataset[String(k).slice(5)] = v;
      }
    },
    getBoundingClientRect() { return { left: 0, top: 0 }; },
    remove() {},
    blur() {},
  };
  if (tag === 'canvas') {
    target.width = 0;
    target.height = 0;
    target.getContext = (kind) => (kind === '2d'
      ? makeContext2d(target) : null);
  }
  return new Proxy(target, {
    get(t, k) {
      if (k in t) return t[k];
      return () => undefined;
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

function makeStorage() {
  const store = {};
  return {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k)
      ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
}

function bootSandbox(viewW, viewH, withheld = null) {
  const winListeners = {};
  const raf = [];
  const errors = [];
  const createdCanvases = new Set(); // offscreen-чанки (createElement)
  const pendingImages = []; // CC-9: src из withheld — onload отложен
  const gameCanvas = makeEl('canvas');
  const spriteCanvas = makeEl('canvas');
  const hud = makeEl('div');
  const glCalls = [];
  gameCanvas.getContext = (kind) => (kind === 'webgl'
    ? makeGl(glCalls) : makeContext2d(gameCanvas));
  spriteCanvas.getContext = (kind) => (kind === '2d'
    ? makeContext2d(spriteCanvas) : null);
  const storage = makeStorage();
  const document = {
    createElement: (tag) => {
      const el = makeEl(tag);
      if (tag === 'canvas') createdCanvases.add(el);
      return el;
    },
    getElementById: (id) => (
      id === 'game' ? gameCanvas
        : id === 'sprites' ? spriteCanvas
          : id === 'hud' ? hud
            : null
    ),
    body: makeEl('body'),
    addEventListener() {},
    removeEventListener() {},
    querySelector: () => null,
    hidden: false,
  };
  const window = {
    innerWidth: viewW,
    innerHeight: viewH,
    location: { search: '' },
    localStorage: storage,
    confirm: () => false,
    addEventListener: (t, f) => {
      const a = winListeners[t] || (winListeners[t] = []);
      if (!a.includes(f)) a.push(f);
    },
    removeEventListener: (t, f) => {
      const a = winListeners[t];
      if (!a) return;
      const i = a.indexOf(f);
      if (i >= 0) a.splice(i, 1);
    },
  };
  function Image() {
    const self = this;
    self.naturalWidth = 0;
    self.naturalHeight = 0;
    Object.defineProperty(self, 'src', {
      configurable: true,
      get() { return self.__src; },
      set(v) {
        self.__src = v;
        self.__asset = v;
        Promise.resolve().then(() => {
          const failed = v === 'assets/map.png';
          if (failed) {
            if (typeof self.onerror === 'function') self.onerror();
            return;
          }
          if (withheld && withheld.has(v)) {
            pendingImages.push(self);
            return;
          }
          if (typeof self.onload === 'function') {
            self.onload();
          }
        });
      },
    });
  }
  const sandbox = {
    console: {
      warn: () => {},
      error: (m) => errors.push(String(m)),
      log: () => {},
    },
    document,
    window,
    Image,
    performance: { now: () => NOW },
    requestAnimationFrame: (fn) => { raf.push(fn); return raf.length; },
    setTimeout: () => 0,
    clearTimeout: () => {},
  };
  vm.createContext(sandbox);
  for (const f of CHAIN) {
    vm.runInContext(
      fs.readFileSync(path.join(ROOT, 'src', f), 'utf8'), sandbox,
      { filename: f });
  }
  return {
    sandbox, winListeners, raf, errors, storage,
    gameCanvas, spriteCanvas, hud, glCalls,
    body: document.body, createdCanvases,
    completeImages() {
      for (const img of pendingImages) {
        if (typeof img.onload === 'function') img.onload();
      }
      pendingImages.length = 0;
    },
  };
}

const drain = () => new Promise((r) => setImmediate(r));

async function boot(viewW, viewH, withheld = null) {
  const h = bootSandbox(viewW, viewH, withheld);
  await drain();
  await drain();
  await drain();
  const g = h.sandbox.__game;
  assert.ok(g, 'globalThis.__game выставлен (main.js выполнен)');
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет (порядок цепочки): ' + h.errors.join('; '));
  h.frameFn = h.raf[h.raf.length - 1];
  return h;
}

function frameAt(h, now) {
  h.glCalls.length = 0;
  const n0 = h.spriteCanvas.drawCalls.length;
  const r0 = h.raf.length;
  h.frameFn(now);
  return {
    draw: h.spriteCanvas.drawCalls.slice(n0),
    raf: h.raf.length - r0,
  };
}

function assertReady(h) {
  const s = h.sandbox.__game.state.sprites;
  assert.ok(s && s.total > 0, 'спрайт-лоадер запущен');
  assert.equal(s.ready, s.total, 'steady state: все ассеты ready');
}

// Колесо: deltaY > 0 — зум ВЫШЕ (÷1.2), < 0 — ниже (×1.2).
function wheelN(h, n, dir = 1) {
  const wheel = (h.gameCanvas.listeners['wheel'] || [])[0];
  assert.ok(typeof wheel === 'function', 'сценарий: wheel-обработчик');
  for (let i = 0; i < n; i++) {
    wheel({ deltaY: 100 * dir, preventDefault() {} });
  }
}

// --- Анализ drawCalls спрайт-канваса ---

function drawImages(draw) {
  return draw.filter((c) => c[0] === 'drawImage');
}

function assetOf(c) {
  const img = c[1] && c[1][0];
  return img && typeof img.__asset === 'string' ? img.__asset : '';
}

// Блит чанка: drawImage с ИСТОЧНИКОМ = созданный createElement-канвас
// (offscreen-чанк; __asset у него нет — отличает от спрайтов).
function blitsOf(draw, h) {
  return drawImages(draw).filter((c) => h.createdCanvases.has(c[1][0]));
}

function isWaterAsset(a) {
  return a.startsWith('assets/tiles/water_')
    || a.startsWith('assets/tiles/deepwater_');
}

function waterDrawsOf(draw) {
  return drawImages(draw).filter((c) => isWaterAsset(assetOf(c)));
}

function tileDrawsOf(draw) {
  return drawImages(draw).filter((c) => assetOf(c).startsWith('assets/tiles/'));
}

// Статичные тайловые текстуры (вода исключена — она per-tile и в
// чанк не запекается): в чанковом кадре их на sprites-канвасе НЕТ.
function staticTileDrawsOf(draw) {
  return tileDrawsOf(draw).filter((c) => !isWaterAsset(assetOf(c)));
}

function buildingDrawsOf(draw) {
  return drawImages(draw).filter(
    (c) => assetOf(c).startsWith('assets/sprites/buildings/'));
}

function mobDrawsOf(draw) {
  return drawImages(draw).filter(
    (c) => assetOf(c).startsWith('assets/sprites/mobs/'));
}

function heroDrawsOf(draw) {
  return drawImages(draw).filter(
    (c) => assetOf(c).startsWith('assets/sprites/phlogiston/'));
}

// Записи на ВСЕХ чанк-канвасах (объём bake-контента).
function chunkWrites(h) {
  let n = 0;
  for (const cv of h.createdCanvases) n += cv.drawCalls.length;
  return n;
}

// Водяные drawImage НА ЧАНК-КАНВАСАХ (обязано быть 0: анимация не
// запекается — вода per-tile).
function waterInChunks(h) {
  let n = 0;
  for (const cv of h.createdCanvases) {
    for (const c of cv.drawCalls) {
      if (c[0] === 'drawImage' && c[1][0]
          && typeof c[1][0].__asset === 'string'
          && isWaterAsset(c[1][0].__asset)) n += 1;
    }
  }
  return n;
}

function rectKey(r) {
  return r.x + ',' + r.y + ',' + r.w + ',' + r.h;
}

function assertSameRects(actual, expected, label) {
  const a = new Map();
  const e = new Map();
  for (const r of actual) a.set(rectKey(r), (a.get(rectKey(r)) || 0) + 1);
  for (const r of expected) e.set(rectKey(r), (e.get(rectKey(r)) || 0) + 1);
  assert.equal(a.size, e.size,
    label + ': число прямоугольников ' + a.size + ' === ' + e.size);
  for (const [k, n] of e) {
    assert.equal(a.get(k), n, label + ': прямоугольник ' + k + ' (×' + n + ')');
  }
}

function drawRectOf(c) {
  return { x: c[1][1], y: c[1][2], w: c[1][3], h: c[1][4] };
}

// --- CC-2: кэш существует + blit из кэша + результат как раньше ---

test('CC-2: мир z=4 — offscreen-чанки с записями, blit-ов == число видимых чанков, 0 per-tile статичных тайлов, вода per-tile (worldAnchored + frameIndex, биту-в-бит), blit-rect == мир-якорной сетке попиксельно, z-порядок слоёв (000263)', async () => {
  const VIEW_W = 1280, VIEW_H = 720;
  const h = await boot(VIEW_W, VIEW_H);
  assertReady(h);
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  // 22 wheel-outs: ZOOM_START → ZOOM_MIN (4) — последние шаги
  // клэмпа (паттерн RM-10).
  wheelN(h, 22);
  assert.equal(g.state.zoom, G.ZOOM_MIN,
    'сценарий: зум заклампирован в ZOOM_MIN (4)');
  frameAt(h, NOW + 200); // тёплый кадр (bake-кадр в чанковом рендере)
  const f = frameAt(h, NOW + 400); // кадр ассертов
  assert.equal(h.errors.length, 0,
    'ошибок кадра нет: ' + h.errors.join('; '));
  // Камера кадра — из state (getter: актуальный cam после frame()):
  // cam ≡ renderPos(now) + 0.5 (000228; в покое = player + 0.5 —
  // пин tile-pulse).
  const camX = g.state.cam.x, camY = g.state.cam.y;
  const sc = worldScene(VIEW_W, VIEW_H, g.state.zoom, camX, camY);
  assert.ok(sc.nTiles > 8192,
    'сценарий: nTiles ' + sc.nTiles + ' > 8192 (гейт чанков активен)');
  assert.ok(sc.nChunks > 0 && sc.waterTiles > 0 && sc.nBuildings > 0
    && sc.nMobs > 0,
    'сценарий: вода/постройки/мобы в кадре (все слои з-порядка не пусты)');
  // (1) offscreen-чанки существуют: ≥1 созданный канвас с записями.
  assert.ok(h.createdCanvases.size > 0,
    'offscreen-чанк-канвасы созданы (bake); RED: чанкового рендера нет');
  assert.ok(chunkWrites(h) > 0,
    'на чанк-канвасах есть записи (тайлы запеклись)');
  // (2) blit-пин: drawImage на sprites-канвасе == ЧИСЛУ ВИДИМЫХ ЧАНКОВ.
  const bl = blitsOf(f.draw, h);
  assert.equal(bl.length, sc.nChunks,
    'blit-ов на sprites-канвасе == видимым чанкам (' + bl.length
    + ' / ' + sc.nChunks + ' = ' + (sc.chunkRange.cx1 - sc.chunkRange.cx0 + 1)
    + '×' + (sc.chunkRange.cy1 - sc.chunkRange.cy0 + 1) + ')');
  // (3) per-tile статичных тайлов НЕТ — всё запеклось.
  assert.equal(staticTileDrawsOf(f.draw).length, 0,
    '0 per-tile статичных тайлов (запеклись в чанки), получено '
    + staticTileDrawsOf(f.draw).length);
  // (4) вода — per-tile, биту-в-бит со старым путём: rect-сет ==
  // worldAnchored-сетке (000228), кадр == frameIndex(now, x, y, n).
  const wexp = waterTilesAt(VIEW_W, VIEW_H, g.state.zoom, camX, camY,
    NOW + 400);
  const wg = waterDrawsOf(f.draw);
  assert.equal(wg.length, wexp.length,
    'вода per-tile: ' + wg.length + ' === ' + wexp.length
    + ' (анимация НЕ запекается)');
  assertSameRects(wg.map(drawRectOf), wexp, 'water-rect (worldAnchored)');
  const byPos = new Map(wexp.map((r) => [r.x + ',' + r.y, r]));
  for (const c of wg) {
    const exp = byPos.get(c[1][1] + ',' + c[1][2]);
    assert.ok(exp, 'water-rect в ожидаемом наборе: ' + rectKey(drawRectOf(c)));
    assert.equal(assetOf(c), exp.asset,
      'water-кадр по frameIndex: ' + exp.asset + ' (' + c[1][1] + ','
      + c[1][2] + ')');
  }
  assert.equal(waterInChunks(h), 0,
    'воды на чанк-канвасах НЕТ (анимация не запекается)');
  // (5) координаты блитов (R4) == мир-якорной сетке попиксельно.
  assertSameRects(bl.map(drawRectOf), sc.blits,
    'blit-rect == worldAnchoredTileEdges (попиксельно, 000228)');
  // (6) z-порядок (R4): блиты → вода → постройки → агро → мобы → герой.
  const idxOf = (pred) => {
    const out = [];
    for (let i = 0; i < f.draw.length; i++) if (pred(f.draw[i])) out.push(i);
    return out;
  };
  const isBlit = (c) => c[0] === 'drawImage'
    && h.createdCanvases.has(c[1][0]);
  const layers = [
    ['чанк-блиты', idxOf(isBlit)],
    ['вода', idxOf((c) => c[0] === 'drawImage' && isWaterAsset(assetOf(c)))],
    ['постройки', idxOf((c) => c[0] === 'drawImage'
      && assetOf(c).startsWith('assets/sprites/buildings/'))],
    ['агро-окружности', idxOf((c) => c[0] === 'arc')],
    ['мобы', idxOf((c) => c[0] === 'drawImage'
      && assetOf(c).startsWith('assets/sprites/mobs/'))],
    ['герой', idxOf((c) => c[0] === 'drawImage'
      && assetOf(c).startsWith('assets/sprites/phlogiston/'))],
  ];
  for (const [name, ix] of layers) {
    assert.ok(ix.length > 0, 'z-порядок: слой «' + name + '» в кадре');
  }
  for (let i = 1; i < layers.length; i++) {
    assert.ok(Math.max(...layers[i - 1][1]) < Math.min(...layers[i][1]),
      'z-порядок: ' + layers[i - 1][0] + ' ПОД ' + layers[i][0]);
  }
  // (7) hero exactly once.
  assert.equal(heroDrawsOf(f.draw).length, 1, 'герой в кадре ровно 1×');
});

// --- CC-3: reuse (0 re-bake) + guard гейта + клэмпа ZOOM_MIN ---

test('CC-3: тёплый кадр — 0 re-bake и блиты стабильны; колесо на ZOOM_MIN (заклэмпа z=4.0 ТОЧНО) — 0 re-bake; fresh-boot на ZOOM_START (198 тайлов < 8192) — чанков нет, per-tile путь (000263)', async () => {
  const VIEW_W = 1280, VIEW_H = 720;
  const h = await boot(VIEW_W, VIEW_H);
  assertReady(h);
  const g = h.sandbox.__game;
  wheelN(h, 22);
  assert.equal(g.state.zoom, 4, 'сценарий: ZOOM_MIN (4)');
  const fA = frameAt(h, NOW + 200);
  const bA = blitsOf(fA.draw, h).length;
  assert.ok(bA > 0,
    'чанковый путь активен на ZOOM_MIN: blit-ы есть; RED: нет');
  const wA = chunkWrites(h);
  const fB = frameAt(h, NOW + 400);
  assert.equal(chunkWrites(h), wA,
    '2-й кадр тот же cam/zoom: 0 новых bake (кэш переиспользуется)');
  assert.equal(blitsOf(fB.draw, h).length, bA,
    '2-й кадр: число блитов стабильно');
  // Колесо-вниз на ZOOM_MIN — клэмпа: z = 4.0 ТОЧНО (FP: max(4, 4/1.2)
  // = 4) → bucket/edges не меняются → 0 re-bake (гард 1e-6).
  wheelN(h, 3);
  assert.equal(g.state.zoom, 4,
    'клэмпа: z остаётся 4.0 ТОЧНО (FP-инвариант)');
  const fC = frameAt(h, NOW + 600);
  assert.equal(chunkWrites(h), wA,
    'клэмпа-кадр: 0 re-bake (|z − entry.zoom| ≤ 1e-6, edgesEqual)');
  assert.equal(blitsOf(fC.draw, h).length, bA,
    'клэмпа-кадр: блиты стабильны');
  // Guard гейта: ZOOM_START — 198 тайлов < 8192 → per-tile путь.
  // (Колесом из z=4 в 80 НЕ добраться: 20 — не степень 1.2 — новый
  // сценарий = fresh-boot на стартовом зуме.)
  const h2 = await boot(VIEW_W, VIEW_H);
  assertReady(h2);
  const g2 = h2.sandbox.__game;
  assert.equal(g2.state.zoom, h2.sandbox.Game.ZOOM_START,
    'сценарий: fresh-boot на ZOOM_START (80)');
  const f2 = frameAt(h2, NOW + 200);
  assert.equal(blitsOf(f2.draw, h2).length, 0,
    'z=ZOOM_START (198 тайлов < 8192): 0 блитов — per-tile путь');
  assert.ok(staticTileDrawsOf(f2.draw).length > 0,
    'z=ZOOM_START: per-tile статичные тайлы на месте (гейт не сломан)');
});

// --- CC-4: невалидация по зуму (bucket) + SURVIVAL entry ---

test('CC-4: z=4 → 4.8 (bucket −16 → −15): новые bake; 4.8 → 4.0 ТОЧНО (FP): entry warm-кадра в кэше (16 MP — нет вытеснения) → 0 re-bake, blit' + 'ы как на warm (000263)', async () => {
  const VIEW_W = 1280, VIEW_H = 720;
  const h = await boot(VIEW_W, VIEW_H);
  assertReady(h);
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  wheelN(h, 22);
  assert.equal(g.state.zoom, G.ZOOM_MIN, 'сценарий: z = 4');
  const fA = frameAt(h, NOW + 200);
  const camX = g.state.cam.x, camY = g.state.cam.y;
  const sc4 = worldScene(VIEW_W, VIEW_H, 4, camX, camY);
  const cA = h.createdCanvases.size;
  assert.ok(cA > 0, 'z=4: bake-канвасы созданы; RED: нет');
  assert.equal(blitsOf(fA.draw, h).length, sc4.nChunks,
    'z=4: blit-ов == ' + sc4.nChunks);
  // 1 wheel-in: z = 4·1.2 = 4.8 ТОЧНО — соседний bucket (−16 → −15).
  wheelN(h, 1, -1);
  assert.equal(g.state.zoom, 4 * 1.2, 'z = 4.8 ТОЧНО (FP: 4·1.2)');
  const sc48 = worldScene(VIEW_W, VIEW_H, 4 * 1.2, camX, camY);
  const fB = frameAt(h, NOW + 400);
  const cB = h.createdCanvases.size;
  assert.equal(cB - cA, sc48.nChunks,
    'новый bucket: новые bake = чанкам на z=4.8 (' + (cB - cA)
    + ' / ' + sc48.nChunks + ')');
  assert.equal(blitsOf(fB.draw, h).length, sc48.nChunks,
    'z=4.8: blit-ов == ' + sc48.nChunks);
  // 1 wheel-out: z = 4.8/1.2 = 4.0 ТОЧНО (FP: 4·1.2/1.2 === 4) —
  // bucket −16: entry из warm-кадра ещё в кэше (нет вытеснения:
  // 264 + 180 чанков @ ~64×64 px << 16 MP) → 0 re-bake.
  wheelN(h, 1);
  assert.equal(g.state.zoom, 4,
    'z = 4.0 ТОЧНО (FP-инвариант 4·1.2/1.2 === 4)');
  const fC = frameAt(h, NOW + 600);
  assert.equal(h.createdCanvases.size, cB,
    'SURVIVAL: 0 новых канвасов — entry bucket −16 переиспользован '
    + '(гард 1e-6 + edgesEqual, не re-bake)');
  assert.equal(blitsOf(fC.draw, h).length, sc4.nChunks,
    'z=4: blit-ов == ' + sc4.nChunks + ' (из warm-кэша)');
});

// --- CC-5: PERF-пин 1920×1080 (отдельный sandbox) ---

test('CC-5: PERF — 1920×1080 @ z=4, тёплый кэш: total drawImage < 40 000 И ≤ вода + чанки + постройки + мобы + 50 (baseline до фикса: 131 104 per-tile + динамика ≈ 133 774) (000263)', async () => {
  const VIEW_W = 1920, VIEW_H = 1080;
  const h = await boot(VIEW_W, VIEW_H);
  assertReady(h);
  const g = h.sandbox.__game;
  wheelN(h, 22);
  assert.equal(g.state.zoom, 4, 'сценарий: ZOOM_MIN на 1920×1080');
  frameAt(h, NOW + 200); // тёплый кадр (bake)
  const f = frameAt(h, NOW + 400); // кадр ассертов
  assert.equal(h.errors.length, 0, 'ошибок кадра нет: ' + h.errors.join('; '));
  const camX = g.state.cam.x, camY = g.state.cam.y;
  const sc = worldScene(VIEW_W, VIEW_H, 4, camX, camY);
  assert.ok(sc.nTiles > 8192,
    'сценарий: nTiles ' + sc.nTiles + ' > 8192 (гейт активен)');
  const total = drawImages(f.draw).length;
  // Бюджет ТЗ: существенно ниже 131 104 (абсолютно).
  assert.ok(total < 40000,
    'PERF: total drawImage на кадр < 40 000; получено ' + total
    + ' (baseline per-tile: ' + sc.nTiles + ' тайлов)');
  // Структурный бюджет: худший случай — каждый слой одним drawImage:
  // вода per-tile + 1 blit на чанк + 1 на постройку + 1 на группу
  // мобы + герой (+50 на прочую динамику).
  const budget = sc.waterTiles + sc.nChunks + sc.nBuildings + sc.nMobs + 50;
  assert.ok(total <= budget,
    'PERF: структурный бюджет ' + total + ' ≤ ' + budget
    + ' (вода ' + sc.waterTiles + ' + чанки ' + sc.nChunks
    + ' + постройки ' + sc.nBuildings + ' + мобы ' + sc.nMobs + ' + 50)');
});

// === Харнес ПОДЗЕМЕЛЬЯ/ГОРОДА (копия tests/dungeon-ui.test.js, +
// tracking createElement-канвасов) ===
//
// Кадр — только явным G.dungeonUI.render(now) (событийный рендер,
// паттерн 000067). performance.now заморожен на NOW_D (start()-рендер).
// src/chunk-cache.js в цепочке ЕСЛИ СУЩЕСТВУЕТ: RED — модуля нет,
// dungeon-ui деградирует тихо (live-гарды), тест падает по ПОВЕДЕНИЮ
// (нет блитов/чанков), а не по ENOENT-краху харнеса.

const NOW_D = 1000;
const DW = 800, DH = 600; // window-стаб подземелья (паттерн 000066)

function makeContext2dD(el) {
  const calls = el.drawCalls = [];
  let fillStyle = null;
  return new Proxy({}, {
    get: (t, k) => (k in t ? t[k] : (...args) => {
      calls.push([k, args, fillStyle]);
    }),
    set: (t, k, v) => {
      if (k === 'fillStyle') fillStyle = v;
      t[k] = v;
      return true;
    },
  });
}

function makeElD(tag) {
  const el = {
    tagName: tag,
    className: '',
    textContent: '',
    title: '',
    disabled: false,
    style: {},
    dataset: {},
    children: [],
    listeners: {},
    appendChild(ch) { this.children.push(ch); return ch; },
    remove() {},
    addEventListener(type, fn, opts) {
      (this.listeners[type] || (this.listeners[type] = [])).push([fn, opts]);
    },
    querySelectorAll() { return []; },
    getBoundingClientRect() { return { left: 0, top: 0 }; },
  };
  if (tag === 'canvas') {
    el.width = 0;
    el.height = 0;
    el.getContext = () => makeContext2dD(el);
  }
  return el;
}

function findCanvasD(el) {
  if (el.tagName === 'canvas') return el;
  for (const ch of el.children || []) {
    const found = findCanvasD(ch);
    if (found) return found;
  }
  return null;
}

function loadDungeonUiD(opts = {}) {
  const keydown = [];
  const errors = [];
  const createdCanvases = new Set();
  const document = {
    createElement: (tag) => {
      const el = makeElD(tag);
      if (tag === 'canvas') createdCanvases.add(el);
      return el;
    },
    body: makeElD('body'),
  };
  const window = {
    innerWidth: DW,
    innerHeight: DH,
    addEventListener: (type, fn) => { if (type === 'keydown') keydown.push(fn); },
  };
  const sandbox = {
    console: { error: (m) => errors.push(String(m)) },
    document, window,
    performance: { now: () => NOW_D },
  };
  vm.createContext(sandbox);
  // Порядок — из index.html (частичная цепочка, паттерн 000043/000105);
  // chunk-cache.js — ПОСЛЕ sprites.js, ДО dungeon-ui.js (позиция
  // реализации §5; UMD-модуль читается live, порядок не критичен, но
  // зеркалим браузер).
  const chain = ['global-settings.js', 'perlin.js', 'map.js'];
  if (opts.withBuildings) chain.push('buildings.js');
  chain.push('controls.js', 'dungeon.js', 'locations.js');
  if (opts.withSprites) chain.push('sprites.js');
  if (fs.existsSync(path.join(ROOT, 'src', 'chunk-cache.js'))) {
    chain.push('chunk-cache.js');
  }
  chain.push('dungeon-ui.js', 'motion.js');
  for (const f of chain) {
    vm.runInContext(srcOf(f), sandbox, { filename: f });
  }
  return {
    G: sandbox.Game, keydown, body: document.body, errors,
    createdCanvases, window,
  };
}

// spriteLoader-стаб (паттерн 000067): «ready» — только для paths,
// свой объект { __img: path } на путь.
function makeSpriteLoaderD(paths) {
  const ready = new Set(paths);
  const imgs = new Map();
  return {
    isReady: (p) => ready.has(p),
    image: (p) => {
      if (!ready.has(p)) return null;
      if (!imgs.has(p)) imgs.set(p, { __img: p });
      return imgs.get(p);
    },
  };
}

// CC-9: тот же стаб, но ready-множество мутируемо (addReady) — сценарий
// «чанк запечён при незагруженных ассетах → ассеты готовы → re-bake».
function makePartialSpriteLoaderD(readyPaths) {
  const ready = new Set(readyPaths);
  const imgs = new Map();
  return {
    isReady: (p) => ready.has(p),
    image: (p) => {
      if (!ready.has(p)) return null;
      if (!imgs.has(p)) imgs.set(p, { __img: p });
      return imgs.get(p);
    },
    addReady: (ps) => { for (const p of ps) ready.add(p); },
  };
}

// Состояние подземелья: стены по периметру, пол внутри (паттерн
// makeState, dungeon-ui.test.js).
function makeStateD(width, height, px, py) {
  const cells = new Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const wall = x === 0 || y === 0 || x === width - 1 || y === height - 1;
      cells[y * width + x] = wall ? 0 : 1;
    }
  }
  return {
    dg: {
      type: 0, width, height, cells,
      entrance: { x: 1, y: 1 },
      exit: { x: 1, y: 1 },
    },
    contents: { chests: [], mobs: [], deposits: [] },
    x: px, y: py,
    log: ['простая пещера: вход.'],
  };
}

// Чанк-канвасы = все createElement-канвасы МИНУС оверлей-канвас.
function chunkCanvasesOf(loaded) {
  const overlay = findCanvasD(loaded.body);
  const out = new Set();
  for (const cv of loaded.createdCanvases) {
    if (cv !== overlay) out.add(cv);
  }
  return out;
}

function perCanvasWrites(canvases) {
  const m = new Map();
  for (const cv of canvases) m.set(cv, cv.drawCalls.length);
  return m;
}

function assertSamePoints(actual, expected, label) {
  const a = new Map();
  const e = new Map();
  const k = (p) => p.x + ',' + p.y;
  for (const p of actual) a.set(k(p), (a.get(k(p)) || 0) + 1);
  for (const p of expected) e.set(k(p), (e.get(k(p)) || 0) + 1);
  assert.equal(a.size, e.size,
    label + ': число точек ' + a.size + ' === ' + e.size);
  for (const [key, n] of e) {
    assert.equal(a.get(key), n, label + ': точка ' + key);
  }
}

// --- CC-6: подземелье 63×63 @ z=4 — чанки, fog, targeted re-bake ---

test('CC-6: подземелье 63×63 @ z=4 — 16 чанков/блитов (4×4), 0 per-cell floor/wall на основном канвасе, origin блита и локальные rect-ы клеток == snappedTileRect попиксельно; шаг (31,31)→(32,31) — re-bake ТОЛЬКО чанков (2,1)/(2,2) (fog 0→2), FOG_DIM = mask==1 (11), остальные 14 чанков переиспользуются (000263)', () => {
  const W = 63, H = 63, PX = 31, PY = 31, ZOOM = 4;
  const loaded = loadDungeonUiD({ withSprites: true });
  const G = loaded.G;
  assert.ok(G.dungeonUI, 'Game.dungeonUI создан (загрузка в порядке)');
  assert.equal(loaded.errors.length, 0,
    'ошибок загрузки нет: ' + loaded.errors.join('; '));
  // Loader: ВСЕ кадры пола сетки (cave_1..3.svg, type 0).
  const paths = new Set();
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) paths.add(G.dungeonFloorFrame(0, x, y));
  }
  const s = makeStateD(W, H, PX, PY);
  G.dungeonUI.start({
    state: s, onMove() {}, zoom: ZOOM,
    spriteLoader: makeSpriteLoaderD([...paths]),
  });
  const canvas = findCanvasD(loaded.body);
  assert.ok(canvas, 'canvas подземелья создан (start)');
  // Камера: снап к игроку + вьюпорт больше сетки → центр (31.5, 31.5).
  const camX = W / 2, camY = H / 2;
  // start() — первый рендер (bake-рендер в чанковом пути).
  const chunkCanvases = chunkCanvasesOf(loaded);
  assert.equal(chunkCanvases.size, 16,
    'чанк-канвасов: 4×4 = 16 (сетка 63×63, 3969 клеток > 1024); '
    + 'RED: чанковой интеграции нет (0)');
  // Blit-origin → (cx, cy) и canvas → (cx, cy): из snappedTileRect.
  const n0 = canvas.drawCalls.length;
  G.dungeonUI.render(NOW_D);
  const f1 = canvas.drawCalls.slice(n0);
  const blits1 = f1.filter((c) => c[0] === 'drawImage'
    && chunkCanvases.has(c[1][0]));
  assert.equal(blits1.length, 16, 'кадр 1: blit-ов 16');
  const blitCanvas = new Map(); // 'cx,cy' → canvas-источник
  const expectedOrigins = [];
  for (let cy = 0; cy < 4; cy++) {
    for (let cx = 0; cx < 4; cx++) {
      expectedOrigins.push(G.snappedTileRect(16 * cx, 16 * cy, camX, camY,
        ZOOM, DW, DH));
    }
  }
  assertSamePoints(blits1.map((c) => ({ x: c[1][1], y: c[1][2] })),
    expectedOrigins, 'blit-origin == snappedTileRect(16cx, 16cy)');
  for (const c of blits1) {
    for (let cy = 0; cy < 4; cy++) {
      for (let cx = 0; cx < 4; cx++) {
        const o = G.snappedTileRect(16 * cx, 16 * cy, camX, camY, ZOOM,
          DW, DH);
        if (o.x === c[1][1] && o.y === c[1][2]) {
          blitCanvas.set(cx + ',' + cy, c[1][0]);
        }
      }
    }
  }
  // (a) 0 per-cell floor/wall на основном канвасе (запеклось).
  const cellDraws = f1.filter((c) => c[0] === 'drawImage'
    && c[1][0] && typeof c[1][0].__img === 'string'
    && (c[1][0].__img.startsWith('assets/dungeon/floor/')
      || c[1][0].__img.startsWith('assets/dungeon/walls/')));
  assert.equal(cellDraws.length, 0,
    '0 per-cell floor/wall drawImage (контент в чанках); RED: '
    + cellDraws.length + ' per-cell');
  assert.equal(f1.filter((c) => c[0] === 'fillRect'
    && c[2] === '#182029').length, 0,
    '0 fillRect #182029 (пол-фолбэк не нужен: всё ready и запеклось)');
  // (b) fog кадр 1: explored пусто → mask==1 нет → 0 FOG_DIM.
  const FOG = 'rgba(10, 13, 18, 0.65)';
  assert.equal(f1.filter((c) => c[0] === 'fillRect' && c[2] === FOG)
    .length, 0, 'кадр 1: 0 FOG_DIM (explored пусто)');
  // (c) контент: ВСЕ видимые клетки (11×11 = 121) запеклись в свои
  // чанки: локальный rect == snappedTileRect(x, y) − origin
  // (попиксельно, TS-10/11/12 по смыслу), кадр == dungeonFloorFrame.
  const R = G.dungeonUI.vision.baseRadius;
  assert.equal(R, 5, 'сценарий: базовый радиус видимости 5');
  const m1 = G.dungeonUI.vision.maskFor(W, H, PX, PY, R, new Set());
  let visibleCells = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (m1[y * W + x] === 0) continue;
      visibleCells += 1;
      const cx = Math.floor(x / CHUNK), cy = Math.floor(y / CHUNK);
      const o = G.snappedTileRect(16 * cx, 16 * cy, camX, camY, ZOOM,
        DW, DH);
      const r = G.snappedTileRect(x, y, camX, camY, ZOOM, DW, DH);
      const cv = blitCanvas.get(cx + ',' + cy);
      assert.ok(cv, 'чанк (' + cx + ',' + cy + ') в кадре');
      const hit = cv.drawCalls.some((c) => c[0] === 'drawImage'
        && c[1][1] === r.x - o.x && c[1][2] === r.y - o.y
        && c[1][3] === r.w && c[1][4] === r.h
        && c[1][0] && c[1][0].__img === G.dungeonFloorFrame(0, x, y));
      assert.ok(hit,
        'чанк (' + cx + ',' + cy + '): клетка (' + x + ',' + y + ') '
        + 'запечена в локальный rect == глобальному − origin');
    }
  }
  assert.equal(visibleCells, 121, 'сценарий: видно 11×11 = 121 клетка');
  // (d) шаг игрока (31,31) → (32,31): fog 0→2 в столбце x=37 →
  // re-bake ТОЛЬКО чанков (2,1)/(2,2); FOG_DIM = explored вне радиуса
  // (столбец x=26 → 11 клеток mask==1).
  const explored = new Set();
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (m1[y * W + x] === 2) explored.add(x + ',' + y);
    }
  }
  const m2 = G.dungeonUI.vision.maskFor(W, H, 32, PY, R, explored);
  const reBake = new Set();
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (m1[y * W + x] === 0 && m2[y * W + x] !== 0) {
        reBake.add(Math.floor(x / CHUNK) + ',' + Math.floor(y / CHUNK));
      }
    }
  }
  assert.deepEqual([...reBake].sort(), ['2,1', '2,2'],
    'сценарий: fog 0→2 затронул чанки (2,1), (2,2) (столбец x=37)');
  let dimCount = 0;
  for (let i = 0; i < m2.length; i++) if (m2[i] === 1) dimCount += 1;
  assert.equal(dimCount, 11, 'сценарий: 11 клеток mask==1 (x=26)');
  const writesBefore = perCanvasWrites(loaded.createdCanvases);
  const n1 = canvas.drawCalls.length;
  s.x = 32;
  G.dungeonUI.render(NOW_D + 200);
  const f2 = canvas.drawCalls.slice(n1);
  const blits2 = f2.filter((c) => c[0] === 'drawImage'
    && (chunkCanvases.has(c[1][0])
      || loaded.createdCanvases.has(c[1][0])));
  assert.equal(blits2.length, 16, 'кадр 2: blit-ов 16');
  // Какие чанки пере-запеклись: новый canvas ИЛИ новые записи.
  const rebaked = new Set();
  for (const c of blits2) {
    const cv = c[1][0];
    for (let cy = 0; cy < 4; cy++) {
      for (let cx = 0; cx < 4; cx++) {
        const o = G.snappedTileRect(16 * cx, 16 * cy, camX, camY, ZOOM,
          DW, DH);
        if (o.x !== c[1][1] || o.y !== c[1][2]) continue;
        const before = writesBefore.get(cv);
        if (before === undefined || cv.drawCalls.length > before) {
          rebaked.add(cx + ',' + cy);
        }
      }
    }
  }
  assert.deepEqual([...rebaked].sort(), [...reBake].sort(),
    'targeted re-bake: пере-запеклись ТОЛЬКО затронутые чанки ('
    + [...rebaked].sort() + ' === [' + [...reBake].sort() + ']); '
    + 'остальные 14 переиспользуются (0 новых записей)');
  // (e) FOG_DIM — динамический pass интактен: ровно mask==1 клетки.
  assert.equal(f2.filter((c) => c[0] === 'fillRect' && c[2] === FOG)
    .length, dimCount,
    'кадр 2: FOG_DIM == mask==1 (' + dimCount + ') — explored-затемнение');
  // (f) игрок в кадре (ромб-фолбэк: phlogiston в loader'е нет).
  assert.ok(f2.some((c) => c[0] === 'moveTo'),
    'игрок нарисован в кадре 2 (moveTo ромба)');
});

// --- CC-7: город — не чанкуется + структурный пин интеграции ---

test('CC-7: город 26×26 @ z=20 — 0 чанков/блитов (676 клеток ≤ 1024, guard), ВСЕ 676 клеток per-cell fillRect городским палитрам; dungeon-ui.js ссылается на ChunkCache (единое ядро для подземелья/города) (000263)', () => {
  // Структурный пин: dungeon-ui.js — единое чанковое ядро для
  // подземелья И города (§2.3: useChunks = live.ChunkCache && nCells >
  // 1024); RED: ссылки на ChunkCache НЕТ — интеграции нет.
  const du = srcOf('dungeon-ui.js');
  assert.ok(du.includes('ChunkCache'),
    'src/dungeon-ui.js: ссылка на Game.ChunkCache (чанковое ядро); '
    + 'RED: модуль не подключён — города/подземелья без чанков');
  const loaded = loadDungeonUiD({});
  const G = loaded.G;
  assert.ok(G.dungeonUI, 'Game.dungeonUI создан');
  assert.equal(loaded.errors.length, 0,
    'ошибок загрузки нет: ' + loaded.errors.join('; '));
  const d = CITIES.createCityLayout(-37, 21, 7);
  assert.equal(d.width * d.height, 676,
    'сценарий: столица 26×26 (676 клеток ≤ 1024)');
  const s = {
    dg: d, contents: null, kind: 'city', name: 'Столица',
    x: d.entrance.x, y: d.entrance.y,
    prevX: d.entrance.x, prevY: d.entrance.y,
    log: ['Столица: вход.'], cityContents: null,
  };
  G.dungeonUI.start({ state: s, onMove() {}, zoom: 20 });
  const canvas = findCanvasD(loaded.body);
  assert.ok(canvas, 'canvas города создан (start)');
  // Камера: вьюпорт больше сетки (26·20 = 520 ≤ 800/600) → центр
  // (13, 13).
  const camX = d.width / 2, camY = d.height / 2;
  const n0 = canvas.drawCalls.length;
  G.dungeonUI.render(NOW_D);
  const f = canvas.drawCalls.slice(n0);
  // Guard: город НЕ чанкуется — 0 чанк-канвасов, 0 блитов.
  assert.equal(chunkCanvasesOf(loaded).size, 0,
    'город 676 клеток ≤ 1024: 0 чанк-канвасов (не чанкуется)');
  const chunkCanvases = chunkCanvasesOf(loaded);
  const allCanvasDraws = f.filter((c) => c[0] === 'drawImage'
    && (chunkCanvases.has(c[1][0])
      || (loaded.createdCanvases.has(c[1][0])
        && c[1][0] !== canvas)));
  assert.equal(allCanvasDraws.length, 0,
    'город: 0 drawImage с canvas-источником (per-cell путь)');
  // Все 676 клеток — per-cell fillRect в ТОЧНЫХ координатах
  // (worldToScreen == snapped при целом зуме), городским палитрам
  // (пол ≤ 3 + стена ≤ 2 — не #182029 и не фон).
  const colors = new Set();
  for (let y = 0; y < d.height; y++) {
    for (let x = 0; x < d.width; x++) {
      const p = G.worldToScreen(x, y, camX, camY, 20, DW, DH);
      const c = f.find((cc) => cc[0] === 'fillRect'
        && cc[1][0] === p.x && cc[1][1] === p.y
        && cc[1][2] === 20 && cc[1][3] === 20);
      assert.ok(c,
        'клетка (' + x + ',' + y + '): per-cell fillRect в точных '
        + 'координатах (' + p.x + ',' + p.y + ', 20×20)');
      assert.notEqual(c[2], '#182029',
        'клетка (' + x + ',' + y + '): городские тайлы, не подземный '
        + 'фолбэк');
      assert.notEqual(c[2], '#0a0d12',
        'клетка (' + x + ',' + y + '): не фон');
      colors.add(c[2]);
    }
  }
  assert.ok(colors.size <= 5,
    'палитра города: пол ≤ 3 + стена ≤ 2 (фактически ' + colors.size
    + ' оттенков: ' + [...colors].join(', ') + ')');
});

// --- CC-9: readiness re-bake (правки по итогам ревью 2026-10-25) ---
//
// Путь «чанк запечён при незагруженных ассетах → ассеты готовы →
// чанк перерисован» — production-сценарий первых кадров при загрузке
// (main.js пропускает кадр только при readyCount() === 0; при
// частичной загрузке bake идёт с дырами). CC-2..CC-7 используют
// полностью ready-лоадер до первого кадра — путь был не закреплён.
// Мир — readyCount-гард (entry.nullCount > 0 && readyAtBake !==
// readyNow); подземелье — notReadyPaths через loader.isReady
// (chunkReadyOk).

test('CC-9: мир z=4 — readiness re-bake (readyCount-гард): bake с дырой (nullCount > 0) → 0 re-bake, пока лоадер не догрузился → после готовности re-bake ТОЛЬКО чанков с дырой (новые канвасы) → warm-кадр 0 re-bake (000263)', async () => {
  const VIEW_W = 1280, VIEW_H = 720;
  // «Дыра» — террейн с МИНИМАЛЬНЫМ покрытием чанков в видимом
  // диапазоне (seed-мир детерминирован; числа вычисляются).
  const pre = chunkRangeOf(MAP.visibleTileRange(0.5, 0.5, VIEW_W,
    VIEW_H, 4));
  const coverage = new Map();
  for (let cy = pre.cy0; cy <= pre.cy1; cy++) {
    for (let cx = pre.cx0; cx <= pre.cx1; cx++) {
      for (let jy = 0; jy < CHUNK; jy++) {
        for (let jx = 0; jx < CHUNK; jx++) {
          const t = WORLD.tileAt(16 * cx + jx, 16 * cy + jy);
          if (t.terrain === MAP.TERRAIN.WATER
              || t.terrain === MAP.TERRAIN.DEEP_WATER) continue;
          if (!coverage.has(t.terrain)) coverage.set(t.terrain, new Set());
          coverage.get(t.terrain).add(cx + ',' + cy);
        }
      }
    }
  }
  let chosen = null;
  let minChunks = Infinity;
  for (const [terrain, set] of coverage) {
    if (set.size < minChunks) { minChunks = set.size; chosen = terrain; }
  }
  assert.ok(minChunks > 0, 'сценарий: выбранный террейн присутствует');
  const withheld = new Set(SPR.tileFrames(chosen));
  const h = await boot(VIEW_W, VIEW_H, withheld);
  const g = h.sandbox.__game;
  const spr = g.state.sprites;
  assert.ok(spr.ready > 0,
    'сценарий: часть ассетов ready (рендер возможен)');
  assert.ok(spr.ready < spr.total,
    'сценарий: withheld-ассет не загрузился (ready < total)');
  wheelN(h, 22);
  assert.equal(g.state.zoom, 4, 'сценарий: ZOOM_MIN');
  const camX = g.state.cam.x, camY = g.state.cam.y;
  const sc = worldScene(VIEW_W, VIEW_H, 4, camX, camY);
  assert.ok(sc.nTiles > 8192,
    'сценарий: nTiles ' + sc.nTiles + ' > 8192 (гейт активен)');
  const holeChunks = terrainChunkSet(chosen, sc.chunkRange);
  assert.ok(holeChunks.size > 0 && holeChunks.size < sc.nChunks,
    'сценарий: дыры в непустом истинном подмножестве чанков ('
    + holeChunks.size + ' / ' + sc.nChunks + ')');
  // (1) Кадр 1 — bake: дыра = nullCount > 0, блит идёт на все чанки.
  const f1 = frameAt(h, NOW + 200);
  assert.equal(blitsOf(f1.draw, h).length, sc.nChunks,
    'кадр 1: блит-ов == видимым чанкам (дыра не блокирует блит)');
  assert.equal(h.createdCanvases.size, sc.nChunks,
    'кадр 1: 1 канвас на чанк');
  assert.equal(h.errors.length, 0,
    'кадр 1: ошибок нет: ' + h.errors.join('; '));
  assert.ok(g.state.chunkCache, 'сценарий: кэш виден в state');
  assert.equal(g.state.chunkCache.evictions, 0,
    'сценарий: 0 LRU-вытеснений (бюджет 16 MP)');
  const total1 = totalCanvasWrites(h.createdCanvases);
  assert.ok(total1 > 0, 'кадр 1: записи на чанк-канвасах есть');
  // (2) Кадр 2 — лоадер не изменился: 0 re-bake (readyAtBake ===
  // readyNow, дыры всё ещё не ready).
  frameAt(h, NOW + 400);
  assert.equal(h.createdCanvases.size, sc.nChunks,
    'кадр 2: новых канвасов нет');
  assert.equal(totalCanvasWrites(h.createdCanvases), total1,
    'кадр 2: 0 re-bake (readyCount не изменился)');
  // (3) Догружаем withheld-ассеты.
  h.completeImages();
  await drain();
  assert.equal(g.state.sprites.ready, g.state.sprites.total,
    'сценарий: все ассеты готовы (ready === total)');
  // (4) Кадр 3 — re-bake ТОЛЬКО чанков с дырой (re-bake = новый
  // канвас; старые канвасы не трогаются).
  const oldCanvases = new Set(h.createdCanvases);
  const oldTotal = totalCanvasWrites(oldCanvases);
  const f3 = frameAt(h, NOW + 600);
  const newCanvases = [...h.createdCanvases]
    .filter((cv) => !oldCanvases.has(cv));
  const newSet = new Set(newCanvases);
  assert.equal(newCanvases.length, holeChunks.size,
    'кадр 3: re-bake-канвасов == чанков с дырой (' + newCanvases.length
    + ' / ' + holeChunks.size + ')');
  const originToChunk = new Map();
  for (let cy = sc.chunkRange.cy0; cy <= sc.chunkRange.cy1; cy++) {
    for (let cx = sc.chunkRange.cx0; cx <= sc.chunkRange.cx1; cx++) {
      const e = MAP.worldAnchoredTileEdges(16 * cx, 16 * cy,
        16 * cx + 16, 16 * cy + 16, camX, camY, 4, VIEW_W, VIEW_H);
      originToChunk.set(e.x[0] + ',' + e.y[0], cx + ',' + cy);
    }
  }
  const rebaked = new Set();
  for (const c of f3.draw) {
    if (c[0] !== 'drawImage' || !newSet.has(c[1][0])) continue;
    const ch = originToChunk.get(c[1][1] + ',' + c[1][2]);
    assert.ok(ch,
      'blit re-bake-чанка в origin чанка: ' + c[1][1] + ',' + c[1][2]);
    rebaked.add(ch);
  }
  assert.deepEqual([...rebaked].sort(), [...holeChunks].sort(),
    'кадр 3: пере-запеклись ТОЛЬКО чанки с дырой (остальные '
    + 'переиспользуются)');
  assert.equal(totalCanvasWrites(oldCanvases), oldTotal,
    'кадр 3: на старых канвасах 0 новых записей');
  assert.equal(g.state.chunkCache.evictions, 0,
    'кадр 3: 0 вытеснений (re-put в те же ключи)');
  // (5) Кадр 4 — warm: 0 re-bake (все nullCount = 0, readyAtBake ===
  // readyNow).
  const total3 = totalCanvasWrites(h.createdCanvases);
  frameAt(h, NOW + 800);
  assert.equal(h.createdCanvases.size,
    oldCanvases.size + newCanvases.length,
    'кадр 4: новых канвасов нет (warm)');
  assert.equal(totalCanvasWrites(h.createdCanvases), total3,
    'кадр 4: 0 re-bake (дыры закрыты, readyCount стабилен)');
});

test('CC-9b: подземелье 63×63 @ z=4 — readiness re-bake (notReadyPaths): bake с дырой (floor-кадр не ready) → 0 re-bake, пока не ready → после addReady re-bake ТОЛЬКО чанков с дырой (остальные 12 чанков переиспользуются — не глобальный сброс кэша) → warm-кадр 0 re-bake (000263)', () => {
  const W = 63, H = 63, PX = 31, PY = 31, ZOOM = 4;
  const loaded = loadDungeonUiD({ withSprites: true });
  const G = loaded.G;
  const paths = new Set();
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) paths.add(G.dungeonFloorFrame(0, x, y));
  }
  // Маска start: explored пуст → Чебышев R (5) вокруг игрока.
  const R = G.dungeonUI.vision.baseRadius;
  const mask = G.dungeonUI.vision.maskFor(W, H, PX, PY, R, new Set());
  // Floor-кадр с МИНИМАЛЬНЫМ числом клеток в маске — минимальная
  // дыра.
  const cellsByPath = new Map();
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (mask[y * W + x] === 0) continue;
      const p = G.dungeonFloorFrame(0, x, y);
      if (!cellsByPath.has(p)) cellsByPath.set(p, []);
      cellsByPath.get(p).push(x + ',' + y);
    }
  }
  let withheldPath = null;
  let minCells = Infinity;
  for (const [p, cells] of cellsByPath) {
    if (cells.length < minCells) { minCells = cells.length; withheldPath = p; }
  }
  assert.ok(minCells > 0,
    'сценарий: у withheld-кадра есть клетки в маске');
  const loader = makePartialSpriteLoaderD(
    [...paths].filter((p) => p !== withheldPath));
  const s = makeStateD(W, H, PX, PY);
  G.dungeonUI.start({
    state: s, onMove() {}, zoom: ZOOM,
    spriteLoader: loader,
  });
  const canvas = findCanvasD(loaded.body);
  const camX = W / 2, camY = H / 2;
  assert.equal(chunkCanvasesOf(loaded).size, 16,
    'start: 16 чанк-канвасов (bake-кадр)');
  const holeChunks = new Set();
  for (const cell of cellsByPath.get(withheldPath)) {
    const [x, y] = cell.split(',').map(Number);
    holeChunks.add(Math.floor(x / CHUNK) + ',' + Math.floor(y / CHUNK));
  }
  assert.ok(holeChunks.size >= 1 && holeChunks.size < 16,
    'сценарий: дыры в непустом истинном подмножестве чанков ('
    + holeChunks.size + ' / 16)');
  // (1) Кадр 2 — лоадер не изменился: 0 re-bake (notReadyPaths всё
  // ещё не ready → chunkReadyOk).
  const oldCanvases = chunkCanvasesOf(loaded);
  const total1 = totalCanvasWrites(oldCanvases);
  G.dungeonUI.render(NOW_D + 100);
  assert.equal(chunkCanvasesOf(loaded).size, 16,
    'кадр 2: новых чанк-канвасов нет');
  assert.equal(totalCanvasWrites(oldCanvases), total1,
    'кадр 2: 0 re-bake (notReadyPaths не стали ready)');
  // (2) Кадр 3 — withheld floor-кадр стал ready.
  loader.addReady([withheldPath]);
  const n2 = canvas.drawCalls.length;
  G.dungeonUI.render(NOW_D + 200);
  const newCanvases = [...chunkCanvasesOf(loaded)]
    .filter((cv) => !oldCanvases.has(cv));
  const newSet = new Set(newCanvases);
  assert.equal(newCanvases.length, holeChunks.size,
    'кадр 3: re-bake-канвасов == чанков с дырой (' + newCanvases.length
    + ' / ' + holeChunks.size + ')');
  const f3 = canvas.drawCalls.slice(n2);
  const originToChunk = new Map();
  for (let cy = 0; cy < 4; cy++) {
    for (let cx = 0; cx < 4; cx++) {
      const o = G.snappedTileRect(16 * cx, 16 * cy, camX, camY, ZOOM,
        DW, DH);
      originToChunk.set(o.x + ',' + o.y, cx + ',' + cy);
    }
  }
  const rebaked = new Set();
  for (const c of f3) {
    if (c[0] !== 'drawImage' || !newSet.has(c[1][0])) continue;
    const ch = originToChunk.get(c[1][1] + ',' + c[1][2]);
    assert.ok(ch,
      'blit re-bake-чанка в origin чанка: ' + c[1][1] + ',' + c[1][2]);
    rebaked.add(ch);
  }
  assert.deepEqual([...rebaked].sort(), [...holeChunks].sort(),
    'кадр 3: пере-запеклись ТОЛЬКО чанки с дырой (угловые чанки с '
    + 'не-ready wall-путями переиспользуются)');
  assert.equal(totalCanvasWrites(oldCanvases), total1,
    'кадр 3: на старых чанк-канвасах 0 новых записей');
  // (3) Кадр 4 — warm: 0 re-bake.
  const total3 = totalCanvasWrites(chunkCanvasesOf(loaded));
  const n3 = canvas.drawCalls.length;
  G.dungeonUI.render(NOW_D + 300);
  assert.equal(chunkCanvasesOf(loaded).size,
    16 + newCanvases.length,
    'кадр 4: новых чанк-канвасов нет (warm)');
  assert.equal(totalCanvasWrites(chunkCanvasesOf(loaded)), total3,
    'кадр 4: 0 re-bake (все notReadyPaths ready)');
  const f4 = canvas.drawCalls.slice(n3);
  const allChunk = new Set([...oldCanvases, ...newCanvases]);
  assert.equal(f4.filter((c) => c[0] === 'drawImage'
    && allChunk.has(c[1][0])).length, 16,
    'кадр 4: 16 блитов (кадр не сломан)');
});

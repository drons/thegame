// Задача 000276 (frameTiles/buildFrame: кэш видимого range — белая
// оптимизация 000263 §9) — RED-тесты, стадия КРАСНЫХ ТЕСТОВ (TDD).
//
// Контракты: memory/000276-frame-tiles-cache.md (§2 архитектура, §3
// источники инвалидации, §5 замеры/бюджет, §8 тесты); ТЗ
// tasks/pending/000276.md «Тесты (красные)»; план
// /tmp/thegame-wf-000276/a3-tests.md.
//
// Корневая причина красноты ВСЕХ 7 тестов (FT-1..FT-7): в main.js НЕТ
// кэша frameTiles и НЕТ зеркал/действий state.frameTilesCache и
// actions.{buildFrameOnce, bumpWorldVersion, spawnBuildingTile} —
// свойство undefined → ERR_ASSERTION/TypeError на осмысленном ассерте
// («нет модуля/функции/символа» — функциональность ТЗ не существует).
// Цепочка index.html НЕ меняется (нового скрипта нет) — харнес грузится
// чисто: assert 0 ошибок загрузки в boot. Зеркало проверяется ДО первых
// кадров — краснота наступает до дорогих z=4-кадров.
//
// Сценарий-база (FT-1..FT-4, FT-7): 1920×1080, спавн (-0,0) → cam
// (0.5, 0.5) (getter state.cam), 22 wheel-out → z = 4.0 ТОЧНО (ZOOM_MIN;
// FP-инвариант 4·1.2/1.2 === 4 — паттерн CC-3/CC-4); N = 131 104 тайла
// = (ceil(1920/4)+2) × (ceil(1080/4)+2) — числится от
// MAP.visibleTileRange, не хардкод («131k итераций» — шов §9
// дословно). Steady state — все ассеты ready (assertReady).
//
// Золотой = row-major перебор целочисленного range (ty-внешний,
// tx-внутренний — порядок прохода buildFrame): состав frameTiles
// (порядок + координаты) — чистая функция integer-range (t.x === tx,
// t.y === ty — тайл хранит свои координаты, map.js tileAt) → золотой
// СТРУКТУРНЫЙ (tileAt для него не нужен); содержимое тайлов —
// СПОТ-ЧЕК 3 контрольных тайлов по WORLD.tileAt (тот же детерминирован-
// ный seed: map.png ВСЕГДА onerror → G.generateSeedPixels).
//
// Бит-в-бит: экранная геометрия/now-зависимое/readiness-зависимое —
// пересчитываются в кадре из frameTiles + live cam/zoom/now → при
// идентичном составе рендер идентичен (пины — существующие тесты
// RM-1..10/CC-2..5 без правок; здесь — deepEqual drawCalls между
// hit-кадрами при ОДНОМ now).
//
// expectedRedCount = 7 (FT-1..FT-7, этот файл). Технических правок
// существующих тестов — НИ ОДНОЙ (a3 §5: нового модуля/require-пути
// нет, index.html не меняется, vm-харнесы подхватывают main.js
// автоматически).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CHAIN = Array.from(html.matchAll(/<script\s+src="([^"]+)"/g), (m) => m[1])
  .map((p) => p.replace(/^src\//, ''));
const { SAVE_KEY } = require(path.join(ROOT, 'src', 'save.js'));

// --- Независимая модель детерминированного мира (node-ветки UMD) ---
//
// Мир в песочнице = тот же: map.png всегда onerror →
// G.generateSeedPixels (фиксированный seed, как во всех vm-харнесах).
// ЧИСЛА СЦЕНАРИЯ ВЫЧИСЛЯЮТСЯ, не хардкодятся.
const MAP = require(path.join(ROOT, 'src', 'map.js'));
const SEED = require(path.join(ROOT, 'src', 'mapseed.js'));
const WORLD = MAP.createMap(SEED.generateSeedPixels());

const NOW = 1000; // performance.now() в песочнице заморожен на NOW
const VIEW_W = 1920, VIEW_H = 1080;
const EPS = 1e-4; // Float32Array: цвет 0..1 точится с ошибкой ~1e-8

// Палитра legacy-фолбэка main.js (L56): маркер постройки.
const BUILDING_COLOR = [0.98, 0.83, 0.30];

// FT-1 БЮДЖЕТ (контракт memory/000276-frame-tiles-cache.md §5, D11):
// BUDGET_MS = max(10 × ПОСЛЕ_hot(dev-машина), 2000) — станция
// реализации финализирует КОНСТАНТУ по замеру ПОСЛЕ (тот же harness,
// свободная машина; запись — §5 этого же файла). ЗАМЕР ДО — §5:
// hot-кадр @ ZOOM_MIN 12 300 мс (FIFO-трэш: N=131 104 > maxSize
// 65 536 → ~65 568 регенераций tileAt каждый rebuild-кадр) — выше
// любого бюджета в порядки → выходной клаус ТЗ п.4 («закрыть отчётом
// без кода») НЕ срабатывает — реализация идёт. Бюджет FT-1 — СМОК
// против катастрофической регрессии (O(N²), случайный vertex-кэш с
// аллоками); регрессия «кэш убран» закреплена FT-2 СТРУКТУРНО
// (rebuilds на каждом кадре — детерминированно, без тайминга).
const BUDGET_MS = 2000;

// explored-окно смотровой башни (000093): Чебышёв ≤ 20 → 41×41.
const EXPLORED_WINDOW = 41 * 41;

// --- Золотые и зеркало ---

// Золотой состав: row-major перебор range (порядок прохода buildFrame:
// ty-внешний, tx-внутренний) — 'x,y'. СТРУКТУРНЫЙ: t.x === tx, t.y ===
// ty (map.js tileAt — тайл хранит координаты) → список = перебор.
function goldenList(range) {
  const out = [];
  for (let ty = range.y0; ty <= range.y1; ty++) {
    for (let tx = range.x0; tx <= range.x1; tx++) out.push(tx + ',' + ty);
  }
  return out;
}

function tilesList(tiles) {
  // Массив строим for-ом в host-realm (tiles — vm-realm: .map дал бы
  // vm-массив, а deepStrictEqual(vm-массив, host-литерал goldenList)
  // падает по прототипу даже на равных списках — та же кросс-realm-
  // ловушка, что у vmKey; смысл ассерта не меняется).
  const out = new Array(tiles.length);
  for (let i = 0; i < tiles.length; i++) {
    out[i] = tiles[i].x + ',' + tiles[i].y;
  }
  return out;
}

// Зеркало state.frameTilesCache — read-only (контракт memory/000276
// §2.4; прецедент state.chunkCache, main.js). RED-ТОЧКА всех тестов:
// на HEAD свойство undefined — нет кэша (функциональность ТЗ).
function cacheOf(g) {
  const c = g.state.frameTilesCache;
  assert.ok(c,
    'state.frameTilesCache — read-only зеркало кэша видимого range '
    + 'в main.js ({size, hits, rebuilds, key, tiles}); '
    + 'RED: кэш не существует (свойство undefined)');
  return c;
}

// Ключ — robust-вариант ТЗ п.2: (range-четвёрка, worldVersion,
// exploredVersion) — 6 целых (§2.1 контракта).
function expectedKey(range, worldVersion, exploredVersion) {
  return {
    x0: range.x0, y0: range.y0, x1: range.x1, y1: range.y1,
    worldVersion, exploredVersion,
  };
}

// Ключ создаётся в vm-realm (main.js в песочнице): deepStrictEqual
// сравнивает Object.prototype между realm'ами и падает даже на
// равные по структуре (кросс-realm-ловушка Node vm, прецеденты
// memory/000076, memory/000149) — сравнение с host-литералом
// expectedKey через JSON-копию в realm теста (ключ — 6 целых,
// без потерь; смысл ассерта не меняется).
function vmKey(k) {
  return k == null ? k : JSON.parse(JSON.stringify(k));
}

function rangeOf(g, viewW, viewH) {
  return MAP.visibleTileRange(g.state.cam.x, g.state.cam.y,
    viewW, viewH, g.state.zoom);
}

// СПОТ-ЧЕК 3 контрольных тайлов (terrain / hasBuilding / hasMobGroup)
// по WORLD.tileAt — содержимое кэшированных объектов = содержимое
// мира (тот же seed; полная deepEqual объекта тайла).
function spotCheckTiles(tiles, range, label) {
  let bX = null, bY = null, mX = null, mY = null;
  outer:
  for (let ty = range.y0; ty <= range.y1; ty++) {
    for (let tx = range.x0; tx <= range.x1; tx++) {
      const t = WORLD.tileAt(tx, ty);
      if (bX === null && t.hasBuilding) { bX = tx; bY = ty; }
      if (mX === null && t.hasMobGroup) { mX = tx; mY = ty; }
      if (bX !== null && mX !== null) break outer;
    }
  }
  assert.ok(bX !== null && mX !== null,
    label + ': в range есть контрольные тайлы (hasBuilding/hasMobGroup)');
  const spots = [
    { x: range.x0, y: range.y0 },
    { x: bX, y: bY },
    { x: mX, y: mY },
  ];
  for (const s of spots) {
    const t = tiles.find((tl) => tl.x === s.x && tl.y === s.y);
    assert.ok(t, label + ': тайл (' + s.x + ',' + s.y + ') в frameTiles');
    // t — vm-realm-объект, assert/strict: deepEqual === strict →
    // кросс-realm-прототип (см. vmKey) — нормализуем JSON-копией в
    // host-realm (тайл — плоские данные, потерь нет).
    assert.deepEqual(JSON.parse(JSON.stringify(t)), WORLD.tileAt(s.x, s.y),
      label + ': тайл (' + s.x + ',' + s.y + ') — содержимое = модели '
      + 'мира (terrain/hasBuilding/hasMobGroup/лоот — тот же seed)');
  }
}

// --- WebGL-стаб с записью bufferData (legacy-вершинный фолбэк) ---

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

// --- «Снисходительный» DOM-элемент с ДЕРЕВОМ (дети/родитель, dataset,
// closest, textContent) — паттерн tests/building-effects.test.js:
// нужен для оверлея buildingUI (FT-5) и нейтрален для остального. ---

function matchesSel(el, sel) {
  let rest = String(sel).trim();
  let tag = null;
  let cls = null;
  let attr = null;
  const bm = rest.match(/\[([^\]=]+)(?:="([^"]*)")?\]$/);
  if (bm) {
    attr = [bm[1], bm[2]];
    rest = rest.slice(0, bm.index);
  }
  const cm = rest.match(/\.([A-Za-z0-9_-]+)$/);
  if (cm) {
    cls = cm[1];
    rest = rest.slice(0, cm.index);
  }
  if (rest) tag = rest;
  if (tag && String(el.tagName || '').toLowerCase() !== tag.toLowerCase()) {
    return false;
  }
  if (cls &&
      !String(el.className || '').split(/\s+/).includes(cls)) {
    return false;
  }
  if (attr) {
    if (!attr[0].startsWith('data-')) return false;
    const v = el.dataset ? el.dataset[attr[0].slice(5)] : undefined;
    if (v === undefined) return false;
    return attr[1] === undefined ? true : String(v) === attr[1];
  }
  return true;
}

function findAll(root, sel) {
  const out = [];
  const walk = (n) => {
    for (const ch of n.children || []) {
      if (matchesSel(ch, sel)) out.push(ch);
      walk(ch);
    }
  };
  walk(root);
  return out;
}

function makeEl(tag) {
  const target = {
    tagName: tag,
    className: '',
    _text: '',
    title: '',
    disabled: false,
    style: {},
    dataset: {},
    children: [],
    parent: null,
    listeners: {},
    appendChild(ch) {
      const raw = ch && ch.__raw ? ch.__raw : ch;
      if (raw.parent) {
        raw.parent.children.splice(raw.parent.children.indexOf(raw), 1);
      }
      raw.parent = target;
      target.children.push(raw);
      return ch;
    },
    remove() {
      if (!target.parent) return;
      const i = target.parent.children.indexOf(target);
      if (i >= 0) target.parent.children.splice(i, 1);
      target.parent = null;
    },
    addEventListener(type, fn) {
      (target.listeners[type] || (target.listeners[type] = [])).push(fn);
    },
    removeEventListener(type, fn) {
      const a = target.listeners[type];
      if (!a) return;
      const i = a.indexOf(fn);
      if (i >= 0) a.splice(i, 1);
    },
    setAttribute(name, value) {
      if (name.startsWith('data-')) {
        target.dataset[name.slice(5)] = value;
      }
    },
    getBoundingClientRect() { return { left: 0, top: 0 }; },
    blur() {},
    closest(sel) {
      let n = target;
      while (n) {
        if (matchesSel(n, sel)) return n;
        n = n.parent;
      }
      return null;
    },
    querySelector(sel) { return findAll(target, sel)[0] || null; },
    querySelectorAll(sel) { return findAll(target, sel); },
  };
  if (tag === 'canvas') {
    target.width = 0;
    target.height = 0;
    target.getContext = (kind) => (kind === '2d'
      ? makeContext2d(target) : null);
  }
  Object.defineProperty(target, 'textContent', {
    get() { return this._text; },
    set(v) {
      this._text = String(v);
      for (const ch of target.children) ch.parent = null;
      target.children.length = 0;
    },
  });
  target.__raw = target;
  return new Proxy(target, {
    get(t, k) {
      if (k in t) return t[k];
      return () => undefined;
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

// --- Песочница: ВСЯ <script>-цепочка index.html в vm ---

function makeStorage(seed) {
  const m = new Map();
  if (seed != null) m.set(SAVE_KEY, JSON.stringify(seed));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

// Оболочка досеянного сейва актуальной версии (v1) — паттерн B24.
function seedSave(data) {
  return { version: 1, savedAt: new Date(0).toISOString(), data };
}

function bootSandbox(viewW, viewH, seed) {
  const winListeners = {};
  const raf = [];
  const errors = [];
  const gameCanvas = makeEl('canvas');
  const spriteCanvas = makeEl('canvas');
  const hud = makeEl('div');
  const glCalls = [];
  gameCanvas.getContext = (kind) => (kind === 'webgl'
    ? makeGl(glCalls) : makeContext2d(gameCanvas));
  spriteCanvas.getContext = (kind) => (kind === '2d'
    ? makeContext2d(spriteCanvas) : null);
  const body = makeEl('body');
  const document = {
    createElement: (tag) => makeEl(tag),
    getElementById: (id) => (
      id === 'game' ? gameCanvas
        : id === 'sprites' ? spriteCanvas
          : id === 'hud' ? hud
            : null),
    body,
    addEventListener() {},
    removeEventListener() {},
    querySelector: () => null,
    hidden: false,
  };
  const window = {
    innerWidth: viewW,
    innerHeight: viewH,
    location: { search: '' },
    localStorage: makeStorage(seed),
    confirm: () => false,
    // Семантика браузерного window: повторный add — no-op, remove —
    // реально снимает (иначе buildingUI-keyHandler накапливался — B9).
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
  // Image-стаб: assets/map.png ВСЕГДА onerror (детерминированный
  // фолбэк G.generateSeedPixels, main.js loadMapPixels), остальные —
  // onload.
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
          if (v === 'assets/map.png') {
            if (typeof self.onerror === 'function') self.onerror();
          } else if (typeof self.onload === 'function') {
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
    sandbox, winListeners, raf, errors,
    gameCanvas, spriteCanvas, hud, glCalls, body,
  };
}

const drain = () => new Promise((r) => setImmediate(r));

async function boot(viewW, viewH, seed = null) {
  const h = bootSandbox(viewW, viewH, seed);
  await drain();
  await drain();
  await drain();
  const g = h.sandbox.__game;
  assert.ok(g, 'globalThis.__game выставлен (main.js выполнен)');
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет (порядок цепочки): ' + h.errors.join('; '));
  return h;
}

// Один кадр с заданным now (время в песочнице «идёт» только через
// аргумент frame(now) — performance.now() заморожен на NOW).
function frameAt(h, now) {
  h.glCalls.length = 0;
  const n0 = h.spriteCanvas.drawCalls.length;
  const r0 = h.raf.length;
  h.raf[h.raf.length - 1](now);
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

// --- Ввод: диспетч по захваченным window-слушателям ---

function key(h, code, extra = {}) {
  const e = Object.assign({ code, preventDefault() {}, stopPropagation() {} },
    extra);
  for (const fn of (h.winListeners['keydown'] || []).slice()) fn(e);
  return e;
}

function keyup(h, code, extra = {}) {
  const e = Object.assign({ code }, extra);
  for (const fn of (h.winListeners['keyup'] || []).slice()) fn(e);
  return e;
}

// ОДИН шаг в соседний тайл (walker-паттерн
// tests/global-map-draw.test.js): keydown → кадры по +200 мс, пока
// игрок фактически не перешёл (stepMs ≤ 420 мс) → keyup; + 4 осадочных
// кадра (глейд мувера завершается). now — монотонный.
function makeWalker(h) {
  const g = h.sandbox.__game;
  let now = NOW;
  return function walk(tx, ty) {
    const px = g.state.player.x, py = g.state.player.y;
    const dx = tx - px, dy = ty - py;
    assert.ok(Math.abs(dx) + Math.abs(dy) === 1,
      'шаг по соседнему тайлу (' + px + ',' + py + ')→(' + tx + ',' + ty + ')');
    const code = dx === 1 ? 'ArrowRight' : dx === -1 ? 'ArrowLeft'
      : dy === 1 ? 'ArrowDown' : 'ArrowUp';
    key(h, code);
    let guard = 0;
    do {
      now += 200;
      frameAt(h, now);
    } while ((g.state.player.x !== tx || g.state.player.y !== ty)
      && ++guard < 12);
    keyup(h, code);
    assert.ok(g.state.player.x === tx && g.state.player.y === ty,
      'сценарий: игрок перешёл на (' + tx + ',' + ty + ')');
    for (let i = 0; i < 4; i++) { now += 200; frameAt(h, now); }
    return now;
  };
}

// --- WebGL-вершины кадра (bufferData: 6 floats на вершину) ---

function totalVerts(glCalls) {
  let n = 0;
  for (const c of glCalls) if (c.fn === 'bufferData') n += c.data.length / 6;
  return n;
}

function countColor(glCalls, rgb) {
  let n = 0;
  for (const c of glCalls) {
    if (c.fn !== 'bufferData') continue;
    const d = c.data;
    for (let i = 0; i + 5 < d.length; i += 6) {
      if (Math.abs(d[i + 2] - rgb[0]) < EPS
          && Math.abs(d[i + 3] - rgb[1]) < EPS
          && Math.abs(d[i + 4] - rgb[2]) < EPS) n += 1;
    }
  }
  return n;
}

// --- Спрайт-слой (drawCalls спрайт-канваса) ---

function drawImages(draw) {
  return draw.filter((c) => c[0] === 'drawImage');
}

function assetOf(c) {
  const img = c[1] && c[1][0];
  return img && typeof img.__asset === 'string' ? img.__asset : '';
}

// Проход 2 рисует три семейства: слоты/лагеря — buildings/,
// города (buildingId 51..54) — cities/ (CITY_SPRITES/CITY_FRAMES,
// src/sprites.js) — фильтр по обоим (expectedBuildingDraws считает
// ВСЕ якоря inBuilding-тайлов, города в том числе).
function buildingDrawsOf(draw) {
  return drawImages(draw).filter(
    (c) => assetOf(c).startsWith('assets/sprites/buildings/')
      || assetOf(c).startsWith('assets/sprites/cities/'));
}

function heroDrawsOf(draw) {
  return drawImages(draw).filter(
    (c) => assetOf(c).startsWith('assets/sprites/phlogiston/'));
}

// Ожидаемое число building-спрайтов в кадре: якоря видимых тайлов
// (t.inBuilding && t.buildingAnchor — проход 2 собирает так же);
// якоря из СЕД-реестра дают rec + ready-спрайт (assertReady).
function expectedBuildingDraws(range) {
  const anchors = new Set();
  for (let y = range.y0; y <= range.y1; y++) {
    for (let x = range.x0; x <= range.x1; x++) {
      const t = WORLD.tileAt(x, y);
      if (t.inBuilding && t.buildingAnchor) {
        anchors.add(t.buildingAnchor[0] + ',' + t.buildingAnchor[1]);
      }
    }
  }
  return anchors.size;
}

// --- Оверлей buildingUI (FT-5) ---

function textOf(n) {
  let s = String(n.textContent || '');
  for (const ch of n.children || []) s += textOf(ch);
  return s;
}

function readSave(h) {
  const text = h.sandbox.window.localStorage.getItem(SAVE_KEY);
  return text == null ? null : JSON.parse(text);
}

// Оверлей buildingUI — единственный .combat-overlay без npc-overlay.
function findOverlay(h) {
  const all = findAll(h.body, '.combat-overlay');
  return all.find((o) => !String(o.className).includes('npc-overlay'))
    || null;
}

function findRow(overlay, id) {
  return findAll(overlay, '[data-buid]')
    .find((r) => r.dataset.buid === id) || null;
}

function median(xs) {
  const a = xs.slice().sort((p, q) => p - q);
  return a[Math.floor(a.length / 2)];
}

// --- FT-1: PERF-бюджет + зеркало {size, key} ---

test('FT-1: PERF-бюджет — 131k-тайловый range (ZOOM_MIN, 1920×1080) в пределах бюджета: зеркало {size, key(range, worldVersion, exploredVersion)} + медиана warm-вызовов actions.buildFrameOnce ≤ BUDGET_MS (000276)', async () => {
  const h = await boot(VIEW_W, VIEW_H);
  assertReady(h);
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  // Зеркало существует ДО первого кадра: пусто, key = null
  // (контракт memory/000276 §2.4; RED-точка — до дорогих кадров).
  const c0 = cacheOf(g);
  assert.equal(c0.size, 0, 'до первого кадра: кэш пуст (size 0)');
  assert.equal(c0.key, null, 'до первого кадра: key = null');
  // 22 wheel-outs: ZOOM_START (80) → ZOOM_MIN (4) — последние шаги
  // клэмпа (паттерн RM-10/CC-2).
  wheelN(h, 22);
  assert.equal(g.state.zoom, G.ZOOM_MIN,
    'сценарий: зум заклампирован в ZOOM_MIN (4)');
  // Warm-up: кадр 1 = rebuild + chunk-bake, кадр 2 = hit.
  frameAt(h, NOW + 200);
  frameAt(h, NOW + 400);
  const camX = g.state.cam.x, camY = g.state.cam.y;
  const range = MAP.visibleTileRange(camX, camY, VIEW_W, VIEW_H,
    g.state.zoom);
  const N = (range.x1 - range.x0 + 1) * (range.y1 - range.y0 + 1);
  assert.ok(N > 8192,
    'сценарий: N=' + N + ' > 8192 (худший случай шва §9, «131k»)');
  const c1 = cacheOf(g);
  assert.equal(c1.size, N,
    'зеркало: size === N (' + c1.size + ' / ' + N + ')');
  assert.deepEqual(vmKey(c1.key), expectedKey(range, 0, 0),
    'зеркало: key === (range-четвёрка, worldVersion 0, exploredVersion 0) '
    + '— до любых мутаций: ' + JSON.stringify(c1.key));
  assert.equal(c1.rebuilds, 1,
    '2 warm-кадра без сдвигов: ровно 1 пересборка (первый кадр)');
  assert.equal(c1.hits, 1, 'второй кадр — hit (сдвигов нет)');
  // ИЗОЛИРОВАННЫЙ замер (контракт §2.4 D9): actions.buildFrameOnce(now)
  // — ровно buildFrame(renderPos(now), now) (как frame() :4041), без
  // drawSprites/renderHud (они дороже пересборки — размывают сигнал).
  // now — ЯВНЫЙ аргумент (в vm performance.now() заморожен NOW=1000 —
  // внутренний замер дал бы 0). Идемпотентно: cam/zoom не меняются.
  assert.equal(typeof g.actions.buildFrameOnce, 'function',
    'actions.buildFrameOnce(now) — изолированный замер buildFrame; '
    + 'RED: действия нет');
  const K = 5;
  const times = [];
  let r = null;
  for (let i = 0; i < K; i++) {
    const t0 = process.hrtime.bigint();
    r = g.actions.buildFrameOnce(NOW + 1000 + 200 * i);
    times.push(Number(process.hrtime.bigint() - t0) / 1e6);
  }
  assert.ok(typeof r.verts === 'number' && typeof r.size === 'number'
    && typeof r.hits === 'number' && typeof r.rebuilds === 'number',
    'buildFrameOnce возвращает {verts, size, hits, rebuilds}');
  assert.equal(r.size, N, 'buildFrameOnce: size === N (frameTiles)');
  assert.equal(r.verts, 0,
    'steady state (все ready): 0 legacy-вершин (XOR 000176, RM-3)');
  assert.equal(r.rebuilds, c1.rebuilds,
    'сдвигов нет → K warm-вызовов: пересборок НЕТ (все hit)');
  const med = median(times);
  assert.ok(med <= BUDGET_MS,
    'PERF: медиана wall-time K=' + K + ' warm-вызовов buildFrameOnce '
    + med.toFixed(1) + ' мс ≤ бюджет ' + BUDGET_MS + ' мс (memory/000276 '
    + '§5, D11: max(10×ПОСЛЕ_hot, 2000))');
});

// --- FT-2: тёплые кадры БЕЗ сдвигов — пересборки нет ---

test('FT-2: тёплые кадры БЕЗ сдвигов — rebuilds не растут, hits += 3, key стабилен, frameTiles — ИДЕНТИЧНАЯ ссылка (состав неизменен), вывод спрайт-канваса биту-в-бит (deepEqual drawCalls) (000276)', async () => {
  const h = await boot(VIEW_W, VIEW_H);
  assertReady(h);
  const g = h.sandbox.__game;
  cacheOf(g); // RED-точка (до дорогих кадров)
  wheelN(h, 22);
  assert.equal(g.state.zoom, 4, 'сценарий: ZOOM_MIN (4)');
  const f0 = frameAt(h, NOW + 200); // rebuild #1 (key был null)
  const f1 = frameAt(h, NOW + 400); // hit #1 — steady state
  const c0 = cacheOf(g);
  assert.equal(c0.rebuilds, 1, '2 кадра: 1 пересборка (кадр 1 — key null → miss)');
  assert.equal(c0.hits, 1, 'кадр 2: ровно 1 hit (тот же key → hit)');
  const range = rangeOf(g, VIEW_W, VIEW_H);
  const N = (range.x1 - range.x0 + 1) * (range.y1 - range.y0 + 1);
  assert.equal(c0.size, N, 'кадр 1: size === N (' + N + ')');
  assert.deepEqual(vmKey(c0.key), expectedKey(range, 0, 0),
    'кадр 1: key записан (range, 0, 0)');
  const tiles0 = c0.tiles;
  // N=3 warm-кадра БЕЗ сдвигов — при ОДНОМ now (NOW+400): вода/
  // постройки/герой — те же кадры → вывод обязан совпасть побайтово.
  const f2 = frameAt(h, NOW + 400);
  const f3 = frameAt(h, NOW + 400);
  const f4 = frameAt(h, NOW + 400);
  const c1 = cacheOf(g);
  assert.equal(c1.rebuilds, c0.rebuilds,
    '3 warm-кадра БЕЗ сдвигов: rebuilds НЕ РОСТУТ (' + c1.rebuilds
    + ' === ' + c0.rebuilds + '); RED без кэша: пересборка каждый кадр');
  assert.equal(c1.hits, c0.hits + 3,
    'hits += 3 (все три кадра — hit)');
  assert.deepEqual(c1.key, c0.key, 'key стабилен (сдвигов нет)');
  assert.equal(c1.tiles, tiles0,
    'frameTiles — ИДЕНТИЧНАЯ ссылка (const-массив переиспользуется, '
    + 'hit не трогает состав); RED без кэша: массив пересобирается');
  assert.equal(c1.size, N, 'состав: size неизменен (' + N + ')');
  // Бит-в-бит вывод: hit-кадры при одном now — одинаковые drawCalls.
  assert.deepStrictEqual(f2.draw, f1.draw,
    'hit-кадр: вывод спрайт-канваса биту-в-бит (тот же now)');
  assert.deepStrictEqual(f3.draw, f2.draw,
    'hit-кадр 2: вывод биту-в-бит');
  assert.deepStrictEqual(f4.draw, f3.draw,
    'hit-кадр 3: вывод биту-в-бит');
  assert.ok(f1.draw.length > 0, 'сценарий: кадр не пуст');
});

// --- FT-3: сдвиг cam (шаг героя) — пересборка + золотой ---

test('FT-3: сдвиг cam (шаг героя (0,0)→(0,1) — walker-паттерн) — ровно ОДНА пересборка, key === visibleTileRange(НОВЫЙ cam), ПОЛНЫЙ состав (порядок прохода: ty-внешний/tx-внутренний) === золотому + СПОТ-ЧЕК 3 контрольных тайлов по WORLD.tileAt (000276)', async () => {
  const h = await boot(VIEW_W, VIEW_H);
  assertReady(h);
  const g = h.sandbox.__game;
  cacheOf(g); // RED-точка (до дорогих кадров)
  wheelN(h, 22);
  assert.equal(g.state.zoom, 4, 'сценарий: ZOOM_MIN (4)');
  frameAt(h, NOW + 200); // warm: rebuild #1
  const c0 = cacheOf(g);
  assert.equal(c0.rebuilds, 1, 'warm-кадр: 1 пересборка');
  assert.equal(c0.hits, 0, 'warm-кадр: hit ещё не было');
  // (0,1) — чистый проходимый тайл без мобов/построек (seed-мир;
  // (1,0) — группа мобов — шаг = бой, сценарий ломается).
  const t10 = WORLD.tileAt(0, 1);
  assert.ok(t10.passable && !t10.hasMobGroup && !t10.hasBuilding
    && !t10.inBuilding, 'сценарий: (0,1) — чистый проходимый тайл');
  const walk = makeWalker(h);
  walk(0, 1); // (0,0)→(0,1) + 4 осадочных кадра (глейд завершён)
  assert.equal(g.state.player.y, 1, 'сценарий: игрок на (0,1)');
  // cam ≡ renderPos + 0.5 (tile-pulse): в покое = цель + 0.5.
  assert.equal(g.state.cam.x, 0.5, 'cam.x = 0.5');
  assert.equal(g.state.cam.y, 1.5, 'cam.y = 1.5 (шаг «вниз»)');
  const c1 = cacheOf(g);
  const range1 = rangeOf(g, VIEW_W, VIEW_H);
  const N1 = (range1.x1 - range1.x0 + 1) * (range1.y1 - range1.y0 + 1);
  assert.deepEqual(vmKey(c1.key), expectedKey(range1, 0, 0),
    'key.{x0..y1} === MAP.visibleTileRange(НОВЫЙ state.cam, …) — '
    + 'cam-канал инвалидации: ' + JSON.stringify(c1.key));
  assert.ok(c1.key.y0 !== c0.key.y0 || c1.key.x0 !== c0.key.x0,
    'сценарий: range реально сместился (cam-сдвиг виден в ключе)');
  assert.equal(c1.rebuilds, c0.rebuilds + 1,
    'сдвиг cam → ровно ОДНА пересборка (range сменился; глейд проходит '
    + 'через 2 значения range — переход един)');
  assert.equal(c1.size, N1, 'состав: size === N1 (' + N1 + ')');
  // ПОЛНЫЙ список содержимого === золотому (row-major по новому range).
  assert.deepStrictEqual(tilesList(c1.tiles), goldenList(range1),
    'ПОЛНЫЙ состав frameTiles (порядок прохода) === золотому из '
    + 'node-модели');
  // Следующий кадр — hit (сдвигов больше нет).
  const fHit = frameAt(h, NOW + 2200);
  const c2 = cacheOf(g);
  assert.equal(c2.rebuilds, c1.rebuilds,
    'кадр после сдвига БЕЗ новых сдвигов: hit (rebuilds не растут)');
  assert.ok(fHit.draw.length > 0, 'сценарий: кадр не пуст');
  // СПОТ-ЧЕК содержимого: 3 контрольных тайла = модели мира.
  spotCheckTiles(c1.tiles, range1, 'FT-3 спот-чек');
});

// --- FT-4: сдвиг zoom (4 → 4.8 → 4.0 ТОЧНО) — пересборка + бит-в-бит ---

test('FT-4: сдвиг zoom (4 → 4.8 → 4.0 ТОЧНО, FP-инвариант 4·1.2/1.2 === 4) — пересборка на каждом сдвиге, ПОЛНЫЙ состав === золотому на каждом зуме, возврат к исходному составу биту-в-бит (000276)', async () => {
  const h = await boot(VIEW_W, VIEW_H);
  assertReady(h);
  const g = h.sandbox.__game;
  cacheOf(g); // RED-точка (до дорогих кадров)
  wheelN(h, 22);
  assert.equal(g.state.zoom, 4, 'сценарий: z = 4 (ZOOM_MIN)');
  frameAt(h, NOW + 200); // rebuild #1 @ z=4
  const c0 = cacheOf(g);
  assert.equal(c0.rebuilds, 1, 'z=4: 1 пересборка');
  const range4 = rangeOf(g, VIEW_W, VIEW_H);
  const N4 = (range4.x1 - range4.x0 + 1) * (range4.y1 - range4.y0 + 1);
  assert.equal(c0.size, N4, 'z=4: size === N4 (' + N4 + ')');
  const L4 = tilesList(c0.tiles);
  assert.deepStrictEqual(L4, goldenList(range4),
    'z=4: ПОЛНЫЙ состав === золотому');
  // 1 wheel-in: z = 4·1.2 = 4.8 ТОЧНО — range сузился.
  wheelN(h, 1, -1);
  assert.equal(g.state.zoom, 4 * 1.2, 'z = 4.8 ТОЧНО (FP: 4·1.2)');
  frameAt(h, NOW + 400);
  const c1 = cacheOf(g);
  const range48 = rangeOf(g, VIEW_W, VIEW_H);
  const N48 = (range48.x1 - range48.x0 + 1) * (range48.y1 - range48.y0 + 1);
  assert.deepEqual(vmKey(c1.key), expectedKey(range48, 0, 0),
    'z=4.8: key === range@4.8 (zoom-канал идёт через range-четвёрку)');
  assert.ok(N48 !== N4,
    'сценарий: range@4.8 отличается (' + N48 + ' ≠ ' + N4 + ')');
  assert.equal(c1.rebuilds, c0.rebuilds + 1, 'z=4.8: пересборка (miss)');
  assert.equal(c1.size, N48, 'z=4.8: size === N48 (' + N48 + ')');
  assert.deepStrictEqual(tilesList(c1.tiles), goldenList(range48),
    'z=4.8: ПОЛНЫЙ состав === золотому@4.8');
  // 1 wheel-out: z = 4.8/1.2 = 4.0 ТОЧНО (FP: 4·1.2/1.2 === 4).
  wheelN(h, 1);
  assert.equal(g.state.zoom, 4,
    'z = 4.0 ТОЧНО (FP-инвариант 4·1.2/1.2 === 4 — паттерн CC-4)');
  frameAt(h, NOW + 600);
  const c2 = cacheOf(g);
  assert.deepEqual(c2.key, c0.key,
    'z=4.0: key вернулсЯ к исходному (range-четвёрка идентична)');
  assert.equal(c2.rebuilds, c0.rebuilds + 2, 'z=4.0: пересборка (miss)');
  assert.equal(c2.size, N4, 'z=4.0: size === N4');
  assert.deepStrictEqual(tilesList(c2.tiles), L4,
    'z=4.0: состав БИТ-В-БИТ идентичен исходному (независимо от '
    + 'hit/miss — структурно по ключу range)');
});

// --- FT-5: explored-изменение («Взглянуть» на башне) — e2e ---

test('FT-5: explored-изменение (e2e паттерн B24: pre-seed НА смотровой башне (36,−21), [E] «Взглянуть» → окно 1681) — exploredVersion 0→1681, ровно ОДНА пересборка, состав биту-в-бит (range не менялся), HUD «Исследовано: 1681 тайлов», следующий warm-кадр — hit (000276)', async () => {
  // Игрок НА смотровой башне (id 46) — золотой факт seed-мира (B24):
  // БЕЗ ходьбы; кадр 1 — ev=0, miss.
  const h = await boot(VIEW_W, VIEW_H, seedSave({
    day: 1, position: { x: 36, y: -21 },
  }));
  assertReady(h);
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  cacheOf(g); // RED-точка (до кадров)
  assert.equal(g.state.player.x, 36, 'позиция сейва (x)');
  assert.equal(g.state.player.y, -21, 'позиция сейва (y)');
  assert.equal(g.state.zoom, G.ZOOM_START,
    'сценарий: ZOOM_START (80) — лёгкие кадры');
  const t = WORLD.tileAt(36, -21);
  assert.ok(t.passable && t.hasBuilding && t.buildingId === 46,
    'сценарий: тайл — смотровая башня (buildingId 46)');
  // Кадр 1: explored пусто → exploredVersion = 0.
  frameAt(h, NOW + 200);
  const c1 = cacheOf(g);
  const range = rangeOf(g, VIEW_W, VIEW_H);
  const N = (range.x1 - range.x0 + 1) * (range.y1 - range.y0 + 1);
  assert.equal(c1.size, N, 'кадр 1: size === N (' + N + ')');
  assert.deepEqual(vmKey(c1.key), expectedKey(range, 0, 0),
    'кадр 1: key.exploredVersion === 0 (explored пуст)');
  assert.equal(c1.rebuilds, 1, 'кадр 1: 1 пересборка');
  const L1 = tilesList(c1.tiles);
  assert.deepStrictEqual(L1, goldenList(range),
    'кадр 1: состав === золотому');
  // [E] → ровно ОДНА строка «Взглянуть» (id 46) → Digit1.
  key(h, 'KeyE');
  assert.equal(G.buildingUI.isActive(), true, '[E] открывает buildingUI');
  const ov = findOverlay(h);
  assert.ok(ov, 'оверлей подвешен к body');
  const rows = findAll(ov, '[data-buid]');
  assert.equal(rows.length, 1, 'ровно одна строка действия (башня)');
  assert.equal(rows[0].dataset.buid, '46', 'строка — id 46');
  assert.equal(rows[0].disabled, false, 'строка доступна');
  assert.ok(textOf(rows[0]).includes('Взглянуть'),
    'имя действия: «Взглянуть» (' + textOf(rows[0]) + ')');
  key(h, 'Digit1');
  assert.equal(G.buildingUI.isActive(), false,
    'оверлей закрылся после действия');
  // explored — окно башни 41×41 (000093) = 1681 тайлов.
  const save1 = readSave(h);
  assert.ok(save1.data.explored, 'сценарий: explored-раздел в сейве');
  const segs = String(save1.data.explored['36,-21']).split(';');
  assert.equal(segs.length, EXPLORED_WINDOW,
    'окно 41×41 — ровно ' + EXPLORED_WINDOW + ' тайлов');
  // Кадр 2: exploredVersion 0→1681 — МИСС по explored-каналу.
  frameAt(h, NOW + 400);
  const c2 = cacheOf(g);
  assert.deepEqual(vmKey(c2.key), expectedKey(range, 0, EXPLORED_WINDOW),
    'кадр 2: key.exploredVersion = ' + EXPLORED_WINDOW + ' (Σ Set.size — '
    + 'то же выражение, что HUD-счётчик), range-четвёрка НЕ изменилась');
  assert.equal(c2.rebuilds, c1.rebuilds + 1,
    'explored-изменение → ровно ОДНА пересборка (инвалидация работает)');
  assert.equal(c2.size, N, 'состав: size неизменен (range тот же)');
  assert.deepStrictEqual(tilesList(c2.tiles), L1,
    'состав БИТ-В-БИТ: range не менялся → тот же золотой ( explored в '
    + 'проходах frameTiles не читается — future-proof канал)');
  assert.equal(c2.hits, c1.hits,
    'кадр 2 — miss (rebuild), hit не засчитывается');
  // HUD: строка «Исследовано: 1681 тайлов» (pinned B24 — побайтово).
  const hud1 = String(h.hud.textContent);
  assert.ok(hud1.includes('Исследовано: ' + EXPLORED_WINDOW + ' тайлов'),
    'HUD «Исследовано: ' + EXPLORED_WINDOW + ' тайлов»: ' + hud1);
  // Кадр 3: warm — hit (сдвигов нет, explored стабилен — union-
  // монотонность 000093).
  frameAt(h, NOW + 600);
  const c3 = cacheOf(g);
  assert.equal(c3.rebuilds, c2.rebuilds,
    'кадр 3: hit — rebuilds не растут (explored стабилен)');
  assert.equal(c3.hits, c2.hits + 1, 'кадр 3: hits += 1');
  assert.deepStrictEqual(tilesList(c3.tiles), L1, 'кадр 3: состав тот же');
});

// --- FT-6: появление здания (мутация тайла) — worldVersion ---

test('FT-6: появление здания (actions.spawnBuildingTile — сигнал-заглушка точки мутации: hasBuilding/buildingAnchor/inBuilding + bump worldVersion) — key.worldVersion +1, пересборка, legacy-маркер ТОЧНО 6 вершин BUILDING_COLOR (buildingRec → null для несидового якоря), проход 2 — без спрайта (rec null → skip), следующий warm-кадр — hit И маркер переживает (000276)', async () => {
  const h = await boot(VIEW_W, VIEW_H);
  assertReady(h);
  const g = h.sandbox.__game;
  cacheOf(g); // RED-точка (до кадров)
  // 14 wheel-out: z = 80/1.2^14 ≈ 6.23 → N = 54 736 ≤ 65 536 (ВСЕ ХИТЫ
  // tileCache, FIFO стабилен — мутация переживает rebuild и hit-кадры;
  // §3-камень контракта: при N > 65 536 FIFO выталкивает смутацию).
  wheelN(h, 14);
  const range = rangeOf(g, VIEW_W, VIEW_H);
  const N = (range.x1 - range.x0 + 1) * (range.y1 - range.y0 + 1);
  assert.ok(N > 8192, 'сценарий: N=' + N + ' > 8192 (чанковый путь)');
  assert.ok(N <= 65536,
    'сценарий: N=' + N + ' ≤ 65 536 (tileCache все хиты, FIFO стабилен)');
  frameAt(h, NOW + 200); // rebuild #1 + chunk-bake
  const f1 = frameAt(h, NOW + 400); // hit #1 — steady state
  const c0 = cacheOf(g);
  assert.equal(c0.rebuilds, 1, '2 warm-кадра: 1 пересборка');
  assert.equal(c0.hits, 1, 'кадр 2 — hit');
  assert.equal(c0.size, N, 'size === N (' + N + ')');
  assert.equal(c0.key.worldVersion, 0, 'worldVersion === 0 (мутаций нет)');
  assert.equal(totalVerts(h.glCalls), 0,
    'steady state (все ready): 0 legacy-вершин (RM-3-режим)');
  // Т: первый в range (row-major) ЧИСТЫЙ тайл (без постройки/мобов —
  // контент memory/000276 §8: «первый в range с !hasBuilding»).
  let T = null;
  for (let ty = range.y0; ty <= range.y1 && !T; ty++) {
    for (let tx = range.x0; tx <= range.x1; tx++) {
      const t = WORLD.tileAt(tx, ty);
      if (!t.hasBuilding && !t.inBuilding && !t.hasMobGroup) {
        T = { x: tx, y: ty };
        break;
      }
    }
  }
  assert.ok(T, 'сценарий: в range есть чистый тайл для мутации');
  const L0 = tilesList(c0.tiles);
  const bBefore = buildingDrawsOf(f1.draw).length;
  assert.equal(bBefore, expectedBuildingDraws(range),
    'steady state: building-спрайты === якорям СЕД-реестра в range ('
    + bBefore + ')');
  // Мутация: сигнал-заглушка ТОЧКИ МУТАЦИИ тайла (контракт §2.4 D9).
  assert.equal(typeof g.actions.spawnBuildingTile, 'function',
    'actions.spawnBuildingTile(x, y) — сигнал-заглушка точки мутации '
    + '(hasBuilding/buildingAnchor/inBuilding + bumpWorldVersion); '
    + 'RED: действия нет');
  g.actions.spawnBuildingTile(T.x, T.y);
  // Кадр 3: МИСС по world-каналу → пересборка + маркер.
  const f3 = frameAt(h, NOW + 600);
  const c1 = cacheOf(g);
  assert.equal(c1.key.worldVersion, c0.key.worldVersion + 1,
    'key.worldVersion ИЗМЕНИЛСЯ (0→1 — мутация тайла забампена)');
  assert.equal(c1.rebuilds, c0.rebuilds + 1,
    'worldVersion-сдвиг → ровно ОДНА пересборка');
  assert.equal(c1.size, N, 'состав: size неизменен (range тот же)');
  assert.deepStrictEqual(tilesList(c1.tiles), L0,
    'состав: координаты неизменны (тайл тот же объект, поле мутировано)');
  // Наблюдаемо (XOR 000176): legacy-маркер BUILDING_COLOR — ТОЧНО 6
  // вершин (buildingRec(якорь) → map.buildingAt → null: якоря нет в
  // сид-реестре → bimg null → pushQuad). Terrain-квадов 0 (все ready),
  // герой ready — ромба нет.
  assert.equal(countColor(h.glCalls, BUILDING_COLOR), 6,
    'steady state: маркер нового здания — ТОЧНО 6 вершин '
    + 'BUILDING_COLOR (получено ' + countColor(h.glCalls, BUILDING_COLOR)
    + ')');
  assert.equal(totalVerts(h.glCalls), 6,
    'ВСЕГО вершин 6 (terrain-квадов и других маркеров нет — все ready)');
  // Проход 2: реестра для несидового якоря нет (buildingAt → null) →
  // спрайт НЕ рисуется (XOR: элемент 1× — только WebGL-маркер).
  assert.equal(buildingDrawsOf(f3.draw).length, bBefore,
    'проход 2: building-спрайты НЕ изменились (rec null → skip; '
    + 'XOR 000176: маркер без спрайта)');
  assert.equal(heroDrawsOf(f3.draw).length, 1,
    'сценарий: герой в кадре ровно 1× (спрайт-слой интактен)');
  // Кадр 4: warm — hit; маркер ПЕРЕЖИВАЕТ hit (гейт читает поля live;
  // N ≤ 65 536 — FIFO-вытеснения нет, объект в кэше тот же).
  const f4 = frameAt(h, NOW + 800);
  const c2 = cacheOf(g);
  assert.equal(c2.rebuilds, c1.rebuilds, 'кадр 4: hit (rebuilds не растут)');
  assert.equal(c2.hits, c1.hits + 1, 'кадр 4: hits += 1');
  assert.equal(countColor(h.glCalls, BUILDING_COLOR), 6,
    'hit-кадр: маркер всё ещё 6 вершин (мутация переживает hit — '
    + 'кэшированный тайл = смутационный объект)');
  assert.equal(buildingDrawsOf(f4.draw).length, bBefore,
    'hit-кадр: спрайты построек неизменны');
});

// --- FT-7: золотой состав (пин рефакторинга) ---

test('FT-7: бит-в-бит — ПОЛНЫЙ список «x,y» содержимого frameTiles для фиксированного (cam спавн, ZOOM_MIN, explored=∅) === золотому (row-major перебор range): старый per-frame пересчёт ≡ новый кэш (до и после фикса — одно и то же) (000276)', async () => {
  const h = await boot(VIEW_W, VIEW_H);
  assertReady(h);
  const g = h.sandbox.__game;
  cacheOf(g); // RED-точка (до дорогого кадра)
  wheelN(h, 22);
  assert.equal(g.state.zoom, 4, 'сценарий: ZOOM_MIN (4)');
  assert.equal(g.state.cam.x, 0.5, 'cam спавна (x) = 0.5');
  assert.equal(g.state.cam.y, 0.5, 'cam спавна (y) = 0.5');
  frameAt(h, NOW + 200); // rebuild #1 — пересчёт range
  const c = cacheOf(g);
  const range = rangeOf(g, VIEW_W, VIEW_H);
  const N = (range.x1 - range.x0 + 1) * (range.y1 - range.y0 + 1);
  assert.equal(c.size, N, 'size === N (' + N + ')');
  assert.deepEqual(vmKey(c.key), expectedKey(range, 0, 0),
    'key === (range, 0, 0) (explored=∅, мутаций нет)');
  assert.deepStrictEqual(tilesList(c.tiles), goldenList(range),
    'ПОЛНЫЙ состав (порядок прохода ty-внешний/tx-внутренний) === '
    + 'золотому из node-модели: per-frame пересчёт ≡ кэш — пин '
    + 'рефакторинга (до и после фикса одно и то же)');
  // Второй кадр — hit: состав (ссылка) не изменился.
  frameAt(h, NOW + 400);
  const c2 = cacheOf(g);
  assert.equal(c2.tiles, c.tiles,
    'hit-кадр: frameTiles — та же ссылка (состав не пересобран)');
  assert.deepStrictEqual(tilesList(c2.tiles), goldenList(range),
    'hit-кадр: состав === тому же золотому (бит-в-бит)');
});

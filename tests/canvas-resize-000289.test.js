// Задача 000289 (рендеринг: не сбрасывать canvas каждый кадр — ресайз
// только при реальном изменении размера окна + явная GL-состоятельность
// + само-исцеление 000170 на error-пути) — RED-тесты, стадия КРАСНЫХ
// ТЕСТОВ (TDD).
//
// Контракты: memory/000289-render-canvas-resize.md (§2 решения
// D1–D10, §3 GL/2D-аудит, §6 тест-план); ТЗ tasks/pending/000289.md
// («SCOPE» п.1–3 + «Тесты» 4a/4b/4c); план /tmp/thegame-wf-000289/
// a3-tests.md.
//
// RZ-1 (ТЗ 4a) — ресайз только при изменении окна: 5 кадров при
// неизменном окне 1280×720 — кадр 1: ровно 1×width + 1×height
// (1280/720) на gameCanvas И на spriteCanvas + gl.viewport(0,0,1280,720)
// ровно 1×; кадры 2..5: 0 присвоений width/height на обоих слоях;
// итог по 5 кадрам — по 1 width + 1 height на canvas; рендер интактен
// (drawArrays в glCalls каждого кадра, drawCalls спрайт-слоя > 0 в
// каждом кадре). RED на master 5c0b88a: canvas.width/height
// присваиваются КАЖДЫЙ кадр (main.js :4100-4101 / :4120-4121) →
// кадры 2..5 по 1/1/1/1 (прототип: итог 5/5/5/5).
//
// RZ-2 (ТЗ 4b) — изменение окна 1280×720 → 1600×900 между кадрами:
// ровно один ресайз на следующем кадре (1×width+1×height на обоих
// canvas, значения 1600/900) + gl.viewport(0,0,1600,900) ровно 1× +
// canvas.width/height синхронно === 1600/900 (читатели в том же
// кадре: buildFrame :3564, инвариант 000276); 2 стабильных кадра
// после — 0 присвоений (пин от over-fix «кэшировали размер и никогда
// не обновляем»). RED на master: стабильные кадры после ресайза —
// 1/1/1/1.
//
// RZ-3 (ТЗ 4c) — само-исцеление 000170 на error-пути: 2 стабильных
// кадра → ИНЪЕКЦИЯ исключения в общий объект-экспорт G.hud.update
// (T2-паттерн tests/movement-freeze-e2e.test.js; G.hud.update вызов
// renderHud — последняя стадия кадра, main.js :3955 → сцена уже в
// буфере, HUD не обновился — реалистичный «частичный кадр») →
// ошибка-кадр (размер окна НЕ меняется):
//   (a) исключение не улетает, rAF-цепь жива (reschedule в finally),
//       errors ровно +1 — watchdog-строка «main.js: исключение в
//       кадре…» (logged once) — пин 000170 (зелёно до и после);
//   (b) в ошибка-кадре сброшены ОБА слоя (1×width+1×height на каждом
//       canvas) — зелёно до (normal-path) и после (catch);
//   (c) ПОРЯДОК: все 4 присвоения ошибка-кадра в timeline ПОСЛЕ
//       маркера 'E' (само-исцеление в catch, а не normal-path) —
//       RED на master (timeline [W,W,W,W,E]: 4 до / 0 после);
//   (d) восстановить G.hud.update → следующий кадр: 0 присвоений на
//       обоих canvas (окно не менялось — ресайза нет) — RED на
//       master (1/1/1/1);
//   (e) ревью-правка 2026-11-03 (детерминированное само-исцеление,
//       НЕ зависящее от семантики same-size-присвоения в браузерах,
//       где оно — no-op без reallocation): в ошибка-кадре glCalls —
//       ВТОРОЙ набор GL-деклараций от catch (useProgram×2,
//       enableVertexAttribArray [0,1,0,1], viewport(0,0,1280,720)×2,
//       clearColor×2, clear×2 — 2-й gl.clear(COLOR_BUFFER_BIT) ЯВНО
//       чистит WebGL-слой) + в 2D-вызовах спрайт-слоя — 2-й
//       clearRect(0,0,1280,720), ПОСЛЕДНИЙ вызов кадра (ЯВНО чистит
//       спрайт-слой): частичная сцена гасится до композита в любом
//       браузере. RED на master: в catch 0 GL-вызовов и 0 clearRect
//       (в кадре 1 и 1 соответственно).
//
// RZ-4 (ТЗ 3 — явная GL-состоятельность) — в КАЖДОМ кадре glCalls:
// gl.useProgram ровно 1× + gl.enableVertexAttribArray(aPos=0,
// aColor=1) ровно 2× + gl.viewport(0,0,1280,720) ровно 1× +
// gl.clearColor(0.06,0.08,0.10,1) ровно 1× + gl.clear(COLOR_BUFFER_BIT)
// ровно 1×. RED на master: useProgram/enableVertexAttribArray —
// init-only (main.js :189 / :194-195), в кадре 0 вызовов — reallocation
// 1-го кадра (300×150→окно) сбрасывала program/attrib'ы, код их НИКОГДА
// не восстанавливал (memory 000289 §1.1: в реальном браузере
// фолбэк-слой НИЧЕГО не рисовал; same-size-присвоения в steady state —
// no-op в браузерах — ревью-правка 2026-11-03).
//
// ХАРНЕС — 1:1-копия мир-харнеса tests/chunk-render.test.js (весь
// <script>-цепочка index.html в vm; makeEl/makeStorage/Image
// (map.png → onerror → G.generateSeedPixels, фиксированный seed);
// raf-массив; drain×3; frameAt; assertReady) + ДВА расширения mock'ов
// (прототип прогнан на master 5c0b88a — /tmp/thegame-wf-000289/
// prototype-red-check.js):
//   1. canvas-моки #game/#sprites — СЧЁТЧИКИ ПРИСВОЕНИЙ: width/height
//      — Object.defineProperty (get/set; let val = 0), setter →
//      журнал resizes {canvas, prop, value} + общий timeline (маркеры
//      'W:<id>:<prop>' / 'E' / 'FRAME:<now>'); set-trap Proxy'а t[k]=v
//      триггерит setter. Значения работают как на мастере (get —
//      последний set).
//   2. makeGl — viewport/clearColor/useProgram/
//      enableVertexAttribArray ЗАПИСЫВАЮТ аргументы в glCalls (в
//      chunk-render — noop'ы без записи); bufferData/drawArrays — с
//      записью (как в оригинале).
//
// expectedRedCount = 4 (RZ-1..RZ-4 — все красные на master 5c0b88a;
// все зелёные после фикса; memory/000289 §2 D8).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

// Цепочка мира — из index.html (не хардкод; паттерн main-visuals).
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CHAIN = Array.from(html.matchAll(/<script\s+src="([^"]+)"/g), (m) => m[1])
  .map((p) => p.replace(/^src\//, ''));

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
  gl.useProgram = (program) => {
    glCalls.push({ fn: 'useProgram', program });
  };
  let attrib = 0;
  gl.getAttribLocation = () => attrib++;
  gl.getUniformLocation = () => ({});
  gl.enableVertexAttribArray = (index) => {
    glCalls.push({ fn: 'enableVertexAttribArray', index });
  };
  gl.createBuffer = () => ({});
  gl.bindBuffer = noop;
  gl.vertexAttribPointer = noop;
  gl.viewport = (x, y, w, h) => {
    glCalls.push({ fn: 'viewport', x, y, w, h });
  };
  gl.clearColor = (r, g, b, a) => {
    glCalls.push({ fn: 'clearColor', r, g, b, a });
  };
  gl.clear = (mask) => { glCalls.push({ fn: 'clear', mask }); };
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

function makeEl(tag, resizeLog = null) {
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
    if (resizeLog) {
      for (const prop of ['width', 'height']) {
        let val = 0;
        Object.defineProperty(target, prop, {
          get: () => val,
          set: (v) => {
            val = v;
            resizeLog.resizes.push(
              { canvas: resizeLog.id, prop, value: v });
            resizeLog.timeline.push('W:' + resizeLog.id + ':' + prop);
          },
        });
      }
    } else {
      target.width = 0;
      target.height = 0;
    }
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

function bootSandbox(viewW, viewH) {
  const winListeners = {};
  const raf = [];
  const errors = [];
  const resizes = [];
  const timeline = [];
  const gameCanvas = makeEl('canvas', { id: 'game', resizes, timeline });
  const spriteCanvas = makeEl('canvas',
    { id: 'sprite', resizes, timeline });
  const hud = makeEl('div');
  const glCalls = [];
  gameCanvas.getContext = (kind) => (kind === 'webgl'
    ? makeGl(glCalls) : makeContext2d(gameCanvas));
  spriteCanvas.getContext = (kind) => (kind === '2d'
    ? makeContext2d(spriteCanvas) : null);
  const storage = makeStorage();
  const document = {
    createElement: (tag) => makeEl(tag),
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
          if (v === 'assets/map.png') {
            if (typeof self.onerror === 'function') self.onerror();
            return;
          }
          if (typeof self.onload === 'function') self.onload();
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
    gameCanvas, spriteCanvas, hud, glCalls, window,
    resizes, timeline,
  };
}

const drain = () => new Promise((r) => setImmediate(r));

async function boot(viewW, viewH) {
  const h = bootSandbox(viewW, viewH);
  await drain();
  await drain();
  await drain();
  const g = h.sandbox.__game;
  assert.ok(g, 'globalThis.__game выставлен (main.js выполнен)');
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет (порядок цепочки): ' + h.errors.join('; '));
  return h;
}

function assertReady(h) {
  const s = h.sandbox.__game.state.sprites;
  assert.ok(s && s.total > 0, 'спрайт-лоадер запущен');
  assert.equal(s.ready, s.total, 'steady state: все ассеты ready');
}

// Один кадр: glCalls чист, маркер в timeline, последняя rAF-запись
// (frame пере-планирует себя в finally — всегда последняя).
function frameAt(h, now) {
  h.glCalls.length = 0;
  const d0 = h.spriteCanvas.drawCalls.length;
  const r0 = h.raf.length;
  h.timeline.push('FRAME:' + now);
  h.raf[h.raf.length - 1](now);
  return {
    draw: h.spriteCanvas.drawCalls.slice(d0),
    raf: h.raf.length - r0,
  };
}

// То же, что frameAt, но с ловлей побега (000170-сценарий: watchdog
// обязан съесть исключение; если улетело — харнес показывает его).
function frameAtTry(h, now) {
  h.glCalls.length = 0;
  const r0 = h.raf.length;
  h.timeline.push('FRAME:' + now);
  let escaped = null;
  try {
    h.raf[h.raf.length - 1](now);
  } catch (e) {
    escaped = e;
  }
  return { escaped, raf: h.raf.length - r0 };
}

// Присвоения width/height в resizes[from, to) по слоям/свойствам.
function countsBetween(h, from, to) {
  const c = { gameW: 0, gameH: 0, spriteW: 0, spriteH: 0 };
  for (let i = from; i < to; i++) {
    const r = h.resizes[i];
    if (r.canvas === 'game' && r.prop === 'width') c.gameW += 1;
    else if (r.canvas === 'game' && r.prop === 'height') c.gameH += 1;
    else if (r.canvas === 'sprite' && r.prop === 'width') c.spriteW += 1;
    else if (r.canvas === 'sprite' && r.prop === 'height') c.spriteH += 1;
  }
  return c;
}

const ZERO = { gameW: 0, gameH: 0, spriteW: 0, spriteH: 0 };
const ONCE = { gameW: 1, gameH: 1, spriteW: 1, spriteH: 1 };

function assertCounts(c, expected, msg) {
  assert.deepEqual(c, expected, msg);
}

test('RZ-1: 5 кадров, окно 1280×720 не меняется — ресайз ТОЛЬКО на первом кадре (1×width+1×height на обоих слоях, значения 1280/720, viewport(0,0,1280,720)×1), кадры 2..5 — 0 присвоений; рендер интактен (000289)', async () => {
  const h = await boot(1280, 720);
  assertReady(h);
  const marks = [h.resizes.length];
  const frameGl = [];
  for (let i = 1; i <= 5; i++) {
    const r = frameAt(h, NOW + 200 * i);
    assert.equal(r.raf, 1,
      'кадр ' + i + ': rAF-цепь жива (reschedule в finally)');
    assert.ok(r.draw.length > 0,
      'кадр ' + i + ': спрайт-слой рисуется (drawCalls > 0)');
    assert.ok(h.glCalls.some((c) => c.fn === 'drawArrays'),
      'кадр ' + i + ': WebGL drawArrays на месте');
    frameGl.push(h.glCalls.slice());
    marks.push(h.resizes.length);
  }
  assertCounts(countsBetween(h, marks[0], marks[1]), ONCE,
    'кадр 1: ровно один ресайз каждого слоя (1×width+1×height)');
  assert.deepEqual(
    h.resizes.slice(marks[0], marks[1])
      .map((r) => [r.canvas, r.prop, r.value]),
    [['game', 'width', 1280], ['game', 'height', 720],
     ['sprite', 'width', 1280], ['sprite', 'height', 720]],
    'кадр 1: значения присвоений = размер окна (оба слоя)');
  const vp1 = frameGl[0].filter((c) => c.fn === 'viewport');
  assert.equal(vp1.length, 1, 'кадр 1: gl.viewport ровно 1×');
  assert.deepEqual([vp1[0].x, vp1[0].y, vp1[0].w, vp1[0].h],
    [0, 0, 1280, 720], 'кадр 1: viewport = размер canvas');
  for (let i = 2; i <= 5; i++) {
    assertCounts(countsBetween(h, marks[i - 1], marks[i]), ZERO,
      'кадр ' + i + ': окно не менялось — 0 присвоений width/height');
  }
  assertCounts(countsBetween(h, marks[0], marks[5]), ONCE,
    'итог по 5 кадрам: ровно один ресайз на canvas');
  assert.equal(h.gameCanvas.width, 1280,
    'финал: gameCanvas.width === окно');
  assert.equal(h.gameCanvas.height, 720,
    'финал: gameCanvas.height === окно');
  assert.equal(h.spriteCanvas.width, 1280,
    'финал: spriteCanvas.width === окно');
  assert.equal(h.spriteCanvas.height, 720,
    'финал: spriteCanvas.height === окно');
});

test('RZ-2: окно 1280×720 → 1600×900 между кадрами — ровно один ресайз на следующем кадре (оба слоя, 1600/900) + gl.viewport(0,0,1600,900)×1 + canvas синхронно 1600×900; 2 стабильных кадра после — 0 присвоений (000289)', async () => {
  const h = await boot(1280, 720);
  assertReady(h);
  const m0 = h.resizes.length;
  frameAt(h, NOW + 200);
  assertCounts(countsBetween(h, m0, h.resizes.length), ONCE,
    'кадр 1 (boot): ровно один ресайз обоих слоёв');
  h.window.innerWidth = 1600;
  h.window.innerHeight = 900;
  const m1 = h.resizes.length;
  frameAt(h, NOW + 400);
  assertCounts(countsBetween(h, m1, h.resizes.length), ONCE,
    'resize-кадр: ровно один ресайз каждого слоя');
  assert.deepEqual(
    h.resizes.slice(m1).map((r) => [r.canvas, r.prop, r.value]),
    [['game', 'width', 1600], ['game', 'height', 900],
     ['sprite', 'width', 1600], ['sprite', 'height', 900]],
    'resize-кадр: значения присвоений = новый размер окна');
  const vp = h.glCalls.filter((c) => c.fn === 'viewport');
  assert.equal(vp.length, 1, 'resize-кадр: gl.viewport ровно 1×');
  assert.deepEqual([vp[0].x, vp[0].y, vp[0].w, vp[0].h],
    [0, 0, 1600, 900], 'resize-кадр: viewport с новыми размерами');
  assert.equal(h.gameCanvas.width, 1600,
    'resize-кадр: canvas.width обновлён синхронно (читатели в том же кадре)');
  assert.equal(h.gameCanvas.height, 900,
    'resize-кадр: canvas.height === 900');
  assert.equal(h.spriteCanvas.width, 1600,
    'resize-кадр: spriteCanvas.width === 1600');
  assert.equal(h.spriteCanvas.height, 900,
    'resize-кадр: spriteCanvas.height === 900');
  const m2 = h.resizes.length;
  frameAt(h, NOW + 600);
  assertCounts(countsBetween(h, m2, h.resizes.length), ZERO,
    'стабильный кадр 1 после ресайза: 0 присвоений');
  const m3 = h.resizes.length;
  frameAt(h, NOW + 800);
  assertCounts(countsBetween(h, m3, h.resizes.length), ZERO,
    'стабильный кадр 2 после ресайза: 0 присвоений');
});

test('RZ-3: 000170 error-путь — исключение в кадре (инъекция G.hud.update, renderHud — последняя стадия кадра): watchdog жив (исключение не улетает, rAF жив, errors +1, logged once); сброс ОБОИХ слоёв в ошибка-кадре — ПОСЛЕ маркера \'E\' в timeline (catch, не normal-path); следующий кадр после восстановления — 0 присвоений (000289)', async () => {
  const h = await boot(1280, 720);
  assertReady(h);
  const G = h.sandbox.Game;
  frameAt(h, NOW + 200);
  frameAt(h, NOW + 400);
  const orig = G.hud.update;
  try {
    G.hud.update = () => {
      h.timeline.push('E');
      throw new Error('RZ-3-inject');
    };
    const e0 = h.errors.length;
    const m0 = h.resizes.length;
    const dErr0 = h.spriteCanvas.drawCalls.length;
    const nowE = NOW + 600;
    const r = frameAtTry(h, nowE);
    const m1 = h.resizes.length;
    assert.equal(r.escaped, null,
      'ошибка-кадр: исключение не улетает (watchdog try/catch)');
    assert.equal(r.raf, 1,
      'ошибка-кадр: rAF-цепь жива (reschedule в finally)');
    assert.equal(h.errors.length, e0 + 1,
      'ошибка-кадр: errors ровно +1');
    assert.ok(h.errors[e0].startsWith('main.js: исключение в кадре'),
      'ошибка-кадр: watchdog-строка (logged once)');
    assertCounts(countsBetween(h, m0, m1), ONCE,
      'ошибка-кадр: сброшены оба слоя (1×width+1×height на каждом canvas)');
    const start = h.timeline.lastIndexOf('FRAME:' + nowE);
    assert.ok(start >= 0, 'ошибка-кадр: FRAME-маркер в timeline');
    const seg = h.timeline.slice(start);
    const eIdx = seg.indexOf('E');
    assert.ok(eIdx >= 0, 'ошибка-кадр: маркер исключения \'E\' в timeline');
    const wBefore = seg.slice(0, eIdx)
      .filter((s) => s.startsWith('W:')).length;
    const wAfter = seg.slice(eIdx + 1)
      .filter((s) => s.startsWith('W:')).length;
    assert.equal(wBefore, 0,
      'ошибка-кадр: 0 присвоений ДО исключения \'E\' (само-исцеление в catch, не normal-path)');
    assert.equal(wAfter, 4,
      'ошибка-кадр: все 4 присвоения ПОСЛЕ исключения (error-путь 000170)');
    assert.equal(
      h.glCalls.filter((c) => c.fn === 'useProgram').length, 2,
      'ошибка-кадр: gl.useProgram 2× — 2-я декларация от catch (явное GL-состояние, не только пересет)');
    assert.deepEqual(
      h.glCalls.filter((c) => c.fn === 'enableVertexAttribArray')
        .map((c) => c.index),
      [0, 1, 0, 1],
      'ошибка-кадр: gl.enableVertexAttribArray ещё 2× от catch (aPos, aColor)');
    const vpE = h.glCalls.filter((c) => c.fn === 'viewport');
    assert.equal(vpE.length, 2,
      'ошибка-кадр: gl.viewport 2× — 2-й от catch');
    assert.deepEqual([vpE[1].x, vpE[1].y, vpE[1].w, vpE[1].h],
      [0, 0, 1280, 720],
      'ошибка-кадр: 2-й viewport = размер canvas (catch)');
    assert.equal(
      h.glCalls.filter((c) => c.fn === 'clearColor').length, 2,
      'ошибка-кадр: gl.clearColor 2× — 2-й от catch');
    const clE = h.glCalls.filter((c) => c.fn === 'clear');
    assert.equal(clE.length, 2,
      'ошибка-кадр: gl.clear 2× — 2-й (catch) ЯВНО очищает WebGL-слой (не зависит от reallocation)');
    assert.equal(clE[1].mask, 1024,
      'ошибка-кадр: 2-й gl.clear(COLOR_BUFFER_BIT)');
    const dSeg = h.spriteCanvas.drawCalls.slice(dErr0);
    assert.equal(
      dSeg.filter((c) => c[0] === 'clearRect').length, 2,
      'ошибка-кадр: спрайт-слой — 2-й clearRect от catch (явное очищение 2D-слоя)');
    assert.deepEqual(dSeg[dSeg.length - 1],
      ['clearRect', [0, 0, 1280, 720]],
      'ошибка-кадр: ПОСЛЕДНИЙ 2D-вызов кадра — полный clearRect (частичная сцена гасится до композита)');
    const m2 = h.resizes.length;
    G.hud.update = orig;
    frameAt(h, NOW + 800);
    assertCounts(countsBetween(h, m2, h.resizes.length), ZERO,
      'кадр после ошибки: 0 присвоений (окно не менялось)');
  } finally {
    G.hud.update = orig;
  }
});

test('RZ-4: явная GL-состоятельность в КАЖДОМ кадре — glCalls: useProgram×1 + enableVertexAttribArray(aPos=0, aColor=1)×2 + viewport(0,0,1280,720)×1 + clearColor(0.06,0.08,0.10,1)×1 + clear(COLOR_BUFFER_BIT)×1 (000289)', async () => {
  const h = await boot(1280, 720);
  assertReady(h);
  const frames = [];
  for (let i = 1; i <= 3; i++) {
    frameAt(h, NOW + 200 * i);
    frames.push(h.glCalls.slice());
  }
  frames.forEach((gc, i) => {
    const n = i + 1;
    const up = gc.filter((c) => c.fn === 'useProgram');
    assert.equal(up.length, 1,
      'кадр ' + n + ': gl.useProgram ровно 1× в кадре (явное состояние, не init-only)');
    const ea = gc.filter((c) => c.fn === 'enableVertexAttribArray');
    assert.deepEqual(ea.map((c) => c.index), [0, 1],
      'кадр ' + n + ': gl.enableVertexAttribArray(aPos, aColor) ровно 2× в кадре');
    const vp = gc.filter((c) => c.fn === 'viewport');
    assert.equal(vp.length, 1,
      'кадр ' + n + ': gl.viewport ровно 1× в кадре');
    assert.deepEqual([vp[0].x, vp[0].y, vp[0].w, vp[0].h],
      [0, 0, 1280, 720], 'кадр ' + n + ': viewport = размер canvas');
    const cc = gc.filter((c) => c.fn === 'clearColor');
    assert.equal(cc.length, 1,
      'кадр ' + n + ': gl.clearColor ровно 1× в кадре');
    assert.deepEqual([cc[0].r, cc[0].g, cc[0].b, cc[0].a],
      [0.06, 0.08, 0.10, 1], 'кадр ' + n + ': clearColor — фон мира');
    const cl = gc.filter((c) => c.fn === 'clear');
    assert.equal(cl.length, 1,
      'кадр ' + n + ': gl.clear ровно 1× в кадре');
    assert.equal(cl[0].mask, 1024,
      'кадр ' + n + ': gl.clear(COLOR_BUFFER_BIT)');
  });
});

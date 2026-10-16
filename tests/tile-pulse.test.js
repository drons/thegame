// Задача 000228 (СТАДИЯ КРАСНЫХ ТЕСТОВ, TDD): на глобальной карте
// тайлы «дрожат» при движении персонажа, а в покое мерцают тёмные
// швы — цели задачи 000215 не достигнуты («похоже, что-то с
// округлением координат»).
//
// ТЗ: tasks/pending/000228.md. Контракты (станция Проектирование):
//   memory/000228-world-rigid-snap.md — две независимые правки
//   мир-слоя, обе обязательны:
//     * фазо-запрет мировой камеры: cam ≡ renderPos(now) + 0.5 НА
//       КАЖДОМ кадре frame() (src/main.js). Убивает пульс на старте
//       шага (камера гонится за ЦЕЛЕМ-ТАЙЛОМ player.x+0.5 с
//       G.cameraStep, τ ≈ 74.7 мс — в 5.6 раза короче глейда героя
//       420 мс) и асимптотический хвост (cameraStep — чистая
//       экспонента без клампа: после остановки камера ползёт >1 с);
//     * мир-якорная жёсткая решётка worldAnchoredTileEdges
//       (src/map.js) — убивает дрейф прибора широт дробного зума
//       {115,116} со скоростью камеры и по-краевый stagger
//       камерно-якорной формулы 000215. Формула пинится отдельно —
//       tests/tile-seam.test.js TS-13 (математика) / TS-14 (e2e).
//
// Файл пинит КОНТРАКТ КАМЕРЫ (фазо-запрет) на живой vm-цепочке —
// то, что видит пользователь: скорость земли = скорости шага героя
// (1-Lipschitz: |Δземли + Δгероя_мира| ≤ 1 px/кадр), и в покое мир
// стоит ровно (никакого хвоста, raw-проекция при целом зуме — ровно
// целая).
//
// КРАСНЫЕ (падают на ТЕКУЩЕМ коде, осмысленно — отсутствует
// ПОВЕДЕНИЕ, все символы существуют; не синтаксис):
//   PW-1: cam === playerRender + 0.5 строго на каждом кадре —
//         сейчас погоня: mid-glide cam ≠ rp+0.5 (измерено: cam
//         −0.2386 при rp+0.5 ≈ +0.15..+0.45 в ходе шага), в покое
//         остаток e^{−(t−s)/74.7} ≠ 0 (cam −0.49980 ≠ −0.5) —
//         assertion-неравенство;
//   PW-2: |Δсетки + Δгероя_МИРОВОГО| ≤ 1 px/кадр + жёсткость ряда —
//         сейчас пульс на старте шага: сетка 16 px/кадр при герое
//         0 (assertion-неравенство; жёсткость ряда при целом зуме
//         выдерживает и старая формула — пин на будущее);
//   PW-3: покой — cam строго на центре тайла И raw-проекция ВСЕХ
//         видимых тайлов (целый зум 80) строго целая — сейчас
//         хвост: cam ≠ player+0.5 строгое + общая дробная часть
//         80·e^{−(t−s)/74.7} у всех видимых tx (Number.isInteger
//         false) — «округление координат» из ТЗ буквально.
//
// Анти-вакуумность ОБЯЗАТЕЛЬНА: ≥1 mid-glide кадр (cam НЕ на
// полувесь-тайльной позиции, |playerRender − player| > 0.05) +
// ≥1 кадр покоя после движения — иначе тест проходил бы «вхолостую»
// на статичной сцене.
//
// Харнес: КОПИЯ паттерна полной цепочки tile-seam.test.js
// (1280×720, mock-canvas drawCalls, rAF-памп) с ОДНИМ отличием:
// performance.now() ТРАКИРУЕТ последний pumped-now (let NOW;
// wFrameAt(h,t){ NOW = t; h.frameFn(t); }) — тогда отладочный
// getter __game.state.playerRender (renderPos(performance.now()),
// main.js) отдаёт РОВНО ту rp, которой кадр рисовал героя (тот же
// mover state, тот же now) — тестам не нужно реплицировать
// lerp/ease/interval. Существующие harness-файлы НЕ модифицируются
// и tracking НЕ переносятся (их NOW заморожен — их тесты
// playerRender не используют; memory/000228 §6.6). Памп —
// детерминированный: 16.7 мс/кадр, now = 1200 + 16.7k (тот же
// порядок операций каждый запуск). Интервал шага 420 мс —
// default SETTINGS.move_interval_ms (tests/global-settings.test.js;
// localStorage в песочнице пуст).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CHAIN = Array.from(html.matchAll(/<script\s+src="([^"]+)"/g), (m) => m[1])
  .map((p) => p.replace(/^src\//, ''));

const VIEW_W = 1280;
const VIEW_H = 720;
let NOW = 1000; // performance.now() — последний pumped-now (tracking)

function wMakeGl(glCalls) {
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
  gl.bufferData = (target, data, usage) => { glCalls.push({ fn: 'bufferData', data }); };
  gl.drawArrays = (mode, first, count) => { glCalls.push({ fn: 'drawArrays', count }); };
  return gl;
}

function wMakeContext2d(el) {
  const calls = el.drawCalls = [];
  return new Proxy({}, {
    get: (t, k) => (k in t ? t[k] : (...args) => { calls.push([k, args]); }),
    set: (t, k, v) => { t[k] = v; return true; },
  });
}

function wMakeEl(tag) {
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
      if (String(k).startsWith('data-')) target.dataset[String(k).slice(5)] = v;
    },
    getBoundingClientRect() { return { left: 0, top: 0 }; },
    remove() {},
    blur() {},
  };
  if (tag === 'canvas') {
    target.width = 0;
    target.height = 0;
    target.getContext = (kind) => (kind === '2d'
      ? wMakeContext2d(target) : null);
  }
  return new Proxy(target, {
    get(t, k) {
      if (k in t) return t[k];
      return () => undefined;
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

function wMakeStorage() {
  const store = {};
  return {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k)
      ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
}

function wBootSandbox(reject, chain) {
  const winListeners = {};
  const raf = [];
  const errors = [];
  const gameCanvas = wMakeEl('canvas');
  const spriteCanvas = wMakeEl('canvas');
  const hud = wMakeEl('div');
  const glCalls = [];
  gameCanvas.getContext = (kind) => (kind === 'webgl'
    ? wMakeGl(glCalls) : wMakeContext2d(gameCanvas));
  spriteCanvas.getContext = (kind) => (kind === '2d'
    ? wMakeContext2d(spriteCanvas) : null);
  const storage = wMakeStorage();
  const document = {
    createElement: (tag) => wMakeEl(tag),
    getElementById: (id) => (
      id === 'game' ? gameCanvas
        : id === 'sprites' ? spriteCanvas
          : id === 'hud' ? hud
            : null
    ),
    body: wMakeEl('body'),
    addEventListener() {},
    removeEventListener() {},
    querySelector: () => null,
    hidden: false,
  };
  const window = {
    innerWidth: VIEW_W,
    innerHeight: VIEW_H,
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
          const failed = v === 'assets/map.png'
            || (reject != null && reject(v));
          if (failed) {
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
  for (const f of (chain || CHAIN)) {
    vm.runInContext(
      fs.readFileSync(path.join(ROOT, 'src', f), 'utf8'), sandbox,
      { filename: f });
  }
  return {
    sandbox, winListeners, raf, errors, storage,
    gameCanvas, spriteCanvas, hud, glCalls,
    body: document.body,
  };
}

const wDrain = () => new Promise((r) => setImmediate(r));

async function wBoot(reject, chain) {
  const h = wBootSandbox(reject, chain);
  await wDrain();
  await wDrain();
  await wDrain();
  const g = h.sandbox.__game;
  assert.ok(g, 'globalThis.__game выставлен (main.js выполнен)');
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет (порядок цепочки): ' + h.errors.join('; '));
  h.frameFn = h.raf[h.raf.length - 1];
  return h;
}

// Памп ОДНОГО кадра (frameFn — rAF-колбэк frame() main.js).
// NOW := now ДО кадра — getter state.playerRender после кадра
// (renderPos(performance.now())) отдаёт rp ЭТОГО кадра.
function wFrameAt(h, now) {
  h.glCalls.length = 0;
  NOW = now;
  const n0 = h.spriteCanvas.drawCalls.length;
  h.frameFn(now);
  return { draw: h.spriteCanvas.drawCalls.slice(n0) };
}

function wDrawImages(draw) {
  return draw.filter((c) => c[0] === 'drawImage');
}

function wAssetOf(c) {
  const img = c[1] && c[1][0];
  return img && typeof img.__asset === 'string' ? img.__asset : '';
}

// Текстуры тайлов (assets/tiles/*.svg) — проход 1 drawSprites.
function wTileDraws(draw) {
  return wDrawImages(draw).filter(
    (c) => wAssetOf(c).startsWith('assets/tiles/'));
}

function wAssertReady(h) {
  const s = h.sandbox.__game.state.sprites;
  assert.ok(s && s.total > 0, 'спрайт-лоадер запущен');
  assert.equal(s.ready, s.total, 'steady state: все ассеты ready');
}

function wKey(h, code) {
  const e = { code, preventDefault() {}, stopPropagation() {} };
  for (const fn of (h.winListeners['keydown'] || []).slice()) fn(e);
  return e;
}

function wKeyup(h, code) {
  const e = { code };
  for (const fn of (h.winListeners['keyup'] || []).slice()) fn(e);
  return e;
}

test('PW-1: мир: камера фазо-заперта с точкой рендера героя (cam === playerRender + 0.5 строго на каждом кадре; 2 шага — x и y динамичны) (000228)', async () => {
  const h = await wBoot();
  wAssertReady(h);
  const g = h.sandbox.__game;
  let t = NOW + 200;
  wFrameAt(h, t);
  assert.equal(g.state.zoom, 80, 'сценарий: спавн на ZOOM_START (80)');
  const st = () => g.state;
  let frames = 0;
  let mid = 0;
  let sawMotion = false;
  let restAfter = false;
  const check = () => {
    frames++;
    const s = st();
    assert.equal(s.cam.x, s.playerRender.x + 0.5,
      'cam.x === playerRender.x + 0.5 строго (кадр ' + frames
      + ', t=' + t.toFixed(1) + '): ' + s.cam.x + ' vs '
      + (s.playerRender.x + 0.5));
    assert.equal(s.cam.y, s.playerRender.y + 0.5,
      'cam.y === playerRender.y + 0.5 строго (кадр ' + frames
      + ', t=' + t.toFixed(1) + '): ' + s.cam.y + ' vs '
      + (s.playerRender.y + 0.5));
    const gx = Math.abs(s.playerRender.x - s.player.x) > 0.05;
    const gy = Math.abs(s.playerRender.y - s.player.y) > 0.05;
    if (gx || gy) {
      mid++;
      sawMotion = true;
    } else if (sawMotion) {
      restAfter = true;
    }
  };
  check(); // спавн-кадр (cam (0.5,0.5), rp (0,0))
  // Шаг 1 (ArrowLeft): 26 кадров — шаг на первом (lastMove 0),
  // глейд 420 мс, клавиша отпущена до второго шага.
  wKey(h, 'ArrowLeft');
  for (let k = 1; k <= 26; k++) {
    t += 16.7;
    wFrameAt(h, t);
    check();
  }
  wKeyup(h, 'ArrowLeft');
  for (let k = 27; k <= 30; k++) {
    t += 16.7;
    wFrameAt(h, t);
    check();
  }
  // Шаг 2 (ArrowUp): y-ось динамична; шаг на первом кадре (t −
  // lastMove ≥ 420 мс с шага 1).
  wKey(h, 'ArrowUp');
  let stepped = false;
  for (let k = 31; k <= 56; k++) {
    t += 16.7;
    const before = { x: st().player.x, y: st().player.y };
    wFrameAt(h, t);
    const after = { x: st().player.x, y: st().player.y };
    if (!stepped && (after.x !== before.x || after.y !== before.y))
      stepped = true;
    check();
  }
  wKeyup(h, 'ArrowUp');
  for (let k = 57; k <= 64; k++) {
    t += 16.7;
    wFrameAt(h, t);
    check();
  }
  assert.ok(stepped,
    'сценарий: второй шаг совершён (ArrowUp): ' + JSON.stringify(st().player));
  assert.ok(mid >= 2,
    'анти-вакуум: mid-glide-кадры (cam НЕ на центре тайла, '
    + '|playerRender − player| > 0.05): ' + mid);
  assert.ok(restAfter,
    'анти-вакуум: ≥1 кадр покоя после движения');
  assert.ok(frames >= 60, 'сценарий: pumped-кадров: ' + frames);
});

test('PW-2: мир: сетка тайлов в lockstep с героем (|Δсетки + Δгероя_МИРОВОГО| ≤ 1 px/кадр — мир не опережает героя; ряд y=0 жёсткий; нет пульса на старте шага) (000228)', async () => {
  const h = await wBoot();
  wAssertReady(h);
  const g = h.sandbox.__game;
  const st = () => g.state;
  let t = NOW + 200;
  const zoom = st().zoom;
  assert.equal(zoom, 80, 'сценарий: спавн на ZOOM_START (80)');
  // Ряд y=0 кадра: «tx → отрисованный x» (обратная проекция;
  // допуск 1/zoom — на будущее для мир-якорной решётки, 000228 §3.2).
  const rowOf = (draw) => {
    const s = st();
    const m = new Map();
    for (const c of wTileDraws(draw)) {
      const x = c[1][1], y = c[1][2];
      const wx = s.cam.x + (x - VIEW_W / 2) / s.zoom;
      const wy = s.cam.y + (y - VIEW_H / 2) / s.zoom;
      if (Math.round(wy) !== 0) continue;
      const tx = Math.round(wx);
      assert.ok(Math.abs(wx - tx) <= 1 / s.zoom + 1e-9,
        'сценарий: ряд y=0 на сетке тайлов: ' + x + ',' + y);
      m.set(tx, x);
    }
    return m;
  };
  const REF = 2; // реф-тайл (2,0) — виден весь сценарий (cam ∈ [−0.5, 0.5])
  const frames = [];
  const capture = (draw) => {
    const s = st();
    frames.push({ t, row: rowOf(draw), rpx: s.playerRender.x,
      rpy: s.playerRender.y });
  };
  capture(wFrameAt(h, t).draw); // спавн-кадр
  // Шаг 1 на k=1 (lastMove 0, now − lastMove ≥ 420 мс уже на первом
  // pumped-кадре); клавиша отпущена на k=26 — ДО дедлайна шага 2
  // (t − lastMove ≥ 420 → k=53), поэтому второй шаг не происходит;
  // глейд 420 мс заканчивается на k=27 → k=27..34 — покой
  // (анти-вакуум restPair).
  wKey(h, 'ArrowLeft');
  for (let k = 1; k <= 26; k++) {
    t += 16.7;
    capture(wFrameAt(h, t).draw);
  }
  wKeyup(h, 'ArrowLeft');
  for (let k = 27; k <= 34; k++) {
    t += 16.7;
    capture(wFrameAt(h, t).draw);
  }
  let pairs = 0;
  let bigHero = 0;
  for (let k = 1; k < frames.length; k++) {
    const a = frames[k - 1], b = frames[k];
    if (!b.row.has(REF) || !a.row.has(REF)) continue;
    const gridDx = b.row.get(REF) - a.row.get(REF);
    // МИРОВОЕ перемещение героя (НЕ screen-delta: при lock герой
    // зафиксирован в центре экрана и земля ЛЕГИТИМНО едет со
    // скоростью шага — пин равен РАВЕНСТВУ скоростей).
    const heroWorldDx = (b.rpx - a.rpx) * zoom;
    assert.ok(Math.abs(gridDx + heroWorldDx) <= 1 + 1e-9,
      '|Δсетки + Δгероя_мира| ≤ 1 px/кадр (1-Lipschitz; знак: левый '
      + 'ход → сетка вправо, герой влево), t=' + b.t.toFixed(1)
      + ': gridDx=' + gridDx + ', heroWorldDx=' + heroWorldDx.toFixed(4));
    for (const [tx, xB] of b.row) {
      if (!a.row.has(tx)) continue;
      assert.equal(xB - a.row.get(tx), gridDx,
        'ряд y=0 жёсткий: ВСЕ тайлы сдвигаются ОДИНАКОВО (tx=' + tx
        + ', t=' + b.t.toFixed(1) + '): ' + (xB - a.row.get(tx))
        + ' vs реф ' + gridDx);
    }
    pairs++;
    if (Math.abs(heroWorldDx) >= 1) bigHero++;
  }
  const sEnd = st();
  assert.ok(sEnd.player.x !== 0,
    'сценарий: шаг совершён (player.x: ' + sEnd.player.x + ')');
  assert.ok(pairs >= 30, 'сценарий: пар кадров с реф-тайлом: ' + pairs);
  assert.ok(bigHero >= 1,
    'анти-вакуум: ≥1 кадр с |Δгероя_мира| ≥ 1 px (пик ease ≈ 4.8 '
    + 'px/кадр при zoom 80): ' + bigHero);
  let restPair = false;
  for (let k = Math.max(1, frames.length - 8); k < frames.length; k++) {
    if (frames[k].rpx === frames[k - 1].rpx
        && frames[k].rpy === frames[k - 1].rpy) restPair = true;
  }
  assert.ok(restPair,
    'анти-вакуум: покой после движения (hero-дёрвы равны 0)');
});

test('PW-3: мир: герой стоит — мир стоит (нет асимптотического хвоста: cam строго на центре тайла, raw-проекция ВСЕХ видимых тайлов при целом зуме строго целая — «округление» из ТЗ) (000228)', async () => {
  const h = await wBoot();
  wAssertReady(h);
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  const st = () => g.state;
  let t = NOW + 200;
  wFrameAt(h, t);
  assert.equal(st().zoom, 80, 'сценарий: спавн на ZOOM_START (80)');
  wKey(h, 'ArrowLeft');
  let stepT = null;
  const rps = [];
  for (let k = 1; k <= 26; k++) {
    t += 16.7;
    const before = { x: st().player.x, y: st().player.y };
    wFrameAt(h, t);
    const s = st();
    if (stepT == null && (s.player.x !== before.x
        || s.player.y !== before.y)) stepT = t;
    rps.push(s.playerRender);
  }
  wKeyup(h, 'ArrowLeft'); // до t = stepT + 417.8 — второй шаг не начался
  for (let k = 27; k <= 38; k++) {
    t += 16.7;
    wFrameAt(h, t);
    rps.push(st().playerRender);
  }
  const s = st();
  assert.ok(stepT != null, 'сценарий: шаг совершён (stepT: ' + stepT + ')');
  assert.ok(t >= stepT + 500,
    'сценарий: t ≥ шаг + 500 мс (420-глейд + запас): '
    + (t - stepT).toFixed(1) + ' мс');
  assert.ok(s.player.x !== 0,
    'анти-вакуум: герой ушёл со спавна: ' + s.player.x);
  const n = rps.length;
  assert.ok(rps[n - 3].x === rps[n - 1].x && rps[n - 2].x === rps[n - 1].x
      && rps[n - 3].y === rps[n - 1].y && rps[n - 2].y === rps[n - 1].y,
    'анти-вакуум: hero-дёрвы последних 3 кадров равны (покой реальный)');
  assert.equal(s.cam.x, s.player.x + 0.5,
    'cam.x === player.x + 0.5 строго в покое (нет хвоста): '
    + s.cam.x + ' vs ' + (s.player.x + 0.5));
  assert.equal(s.cam.y, s.player.y + 0.5,
    'cam.y === player.y + 0.5 строго в покое: ' + s.cam.y
    + ' vs ' + (s.player.y + 0.5));
  const vr = G.visibleTileRange(s.cam.x, s.cam.y, VIEW_W, VIEW_H,
    s.zoom);
  let nRaw = 0;
  for (let tx = vr.x0; tx <= vr.x1; tx++) {
    const rawX = VIEW_W / 2 + (tx - s.cam.x) * s.zoom;
    assert.ok(Number.isInteger(rawX),
      'raw-проекция видимого тайла tx=' + tx + ' строго целая в покое '
      + '(целый зум 80; никакого полупиксельного остатка): ' + rawX);
    nRaw++;
  }
  assert.ok(nRaw >= 15, 'сценарий: видимых тайлов: ' + nRaw);
});

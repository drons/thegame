// Задача 000339 (оптимизация рендера A, RENDER-OPTIMIZE §5A): пропуск
// legacy XOR-гейта 000176 в steady state.
//
// Legacy-гейт (цикл buildFrame по всем frameTiles через legacyTileVerts)
// выполняется КАЖДЫЙ rAF-кадр и на hit-, и на rebuild-ветке — при z=4 это
// ~131k вызовов tileFrameImg на кадр даже когда все ассеты ready и гейт
// детерминированно даёт 0 вершин. Правка: при readyCount()===totalCount()
// (spriteLoader, src/sprites.js) тело базового тайлового квада (и сбор
// brightness) пропускается; маркерные ветки (постройка/группа) и ромб
// героя живут (FT-6: при всех ready маркер nesided-постройки — 6 вершин).
//
// Контракты (НЕ ослаблять; тесты-носители):
//   tests/global-map-draw.test.js — RM-3/RM-10 (steady 0 вершин),
//     RM-4/RM-5/RM-8/RM-9 (частичная загрузка — полный legacy-кадр),
//     RM-10 (ровно 1 bufferData + 1 drawArrays на кадр);
//   tests/frame-tiles-cache-000276.test.js — FT-6 (маркер при всех ready),
//     FT-7 (золотой состав frameTiles);
//   tests/main-visuals.test.js — MV-C7/MV-C8; tests/chunk-render.test.js.
//
// ТЕСТЫ:
//   T1 (КРАСНЫЙ до правки): steady — обращений к G.tileFrames за кадр не
//      больше 1.5×|frameTiles| (один проход — спрайт-слой; цикл гейта
//      добавляет второй — 2.0× до правки), brightness 0, вершин 0; и на
//      hit-, и на rebuild-кадре (смена зума wheel-out → miss).
//   T2 (ГЛАВНЫЙ НОВЫЙ ПИН «гейт возвращается при частичной загрузке»):
//      ready < total → гейт работает: brightness вызывается, тайловые
//      квады в WebGL-буфере (regression RM-4/RM-8), герой ready — ромба
//      нет; и на rebuild-, и на hit-кадре.
//   T3: steady — 0 вершин fallback-геометрии на трёх warm-кадрах подряд
//      (эквивалент RM-3/RM-10).
//   T4: bufferData (new Float32Array, DYNAMIC_DRAW) — РОВНО 1 на кадр:
//      steady — пустая нагрузка, частичная — с данными; РАЗНЫЕ массивы в
//      разных кадрах; drawArrays count === length/6 (RM-6/RM-10).
//   T5: бит-в-бит: miss-кадр ≡ hit-кадр (steady и частичная), повторный
//      boot той же фикстуры даёт идентичные буферы — вывод правки не
//      меняет (попиксельный эталон — неизменные носители RM/MV/FT/CC).
//
// Харнес — копия tests/global-map-draw.test.js (ВЕСЬ <script>-цепочка
// index.html в vm-песочнице, усиленный gl-стаб с записью bufferData/
// drawArrays, Image-стаб с reject-предиктом, map.png — ВСЕГДА onerror →
// детерминированный спавн-мир). Spy БЕЗ правки продакшн-кода:
//   * G.tileFrames — единственная точка чтения селектора tileFrameImg
//     (main.js, свойство на Game читается в момент вызова) → обёртка
//     считает обращения к нему; brightness — main.js зовёт
//     map.brightness единственным местом, обёртка навешивается на
//     Game.createMap ДО промывки микротасков boot.
//
// kind=node: node:test + node:assert/strict + node:vm, без npm-зависимостей.

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
const NOW = 1000; // performance.now() в песочнице заморожен на NOW

// Палитра fallback-слоя (src/main.js; контракт 000176).
const PLAYER_COLOR = [0.55, 0.95, 1.0];
const BUILDING_COLOR = [0.98, 0.83, 0.30];
const MOB_COLOR = [0.85, 0.30, 0.25];
const EPS = 1e-4;

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

function bootSandbox(reject) {
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
  for (const f of CHAIN) {
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

const drain = () => new Promise((r) => setImmediate(r));

// Boot со spy-обёртками (только в харнесе, продакшн-код не меняется):
// counts.tileFrames — обращения к Game.tileFrames (единственный читатель
// — селектор tileFrameImg); counts.brightness — map.brightness (единственный
// читатель — базовое тело legacyTileVerts). createMap оборачивается ДО
// промывки микротасков: main.js создаёт мир в loadMapPixels().then.
async function boot(reject) {
  const counts = { brightness: 0, tileFrames: 0 };
  const h = bootSandbox(reject);
  const G = h.sandbox.Game;
  const origCreateMap = G.createMap;
  G.createMap = (pixels) => {
    const m = origCreateMap(pixels);
    const origBrightness = m.brightness;
    m.brightness = (x, y) => {
      counts.brightness += 1;
      return origBrightness(x, y);
    };
    return m;
  };
  const origTileFrames = G.tileFrames;
  G.tileFrames = (terrain) => {
    counts.tileFrames += 1;
    return origTileFrames(terrain);
  };
  h.counts = counts;
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

function bufferDataOf(glCalls) {
  const out = [];
  for (const c of glCalls) if (c.fn === 'bufferData') out.push(c.data);
  return out;
}

function totalVerts(glCalls) {
  let n = 0;
  for (const d of bufferDataOf(glCalls)) n += d.length / 6;
  return n;
}

function countColor(glCalls, rgb) {
  let n = 0;
  for (const d of bufferDataOf(glCalls)) {
    for (let i = 0; i + 5 < d.length; i += 6) {
      if (Math.abs(d[i + 2] - rgb[0]) < EPS
          && Math.abs(d[i + 3] - rgb[1]) < EPS
          && Math.abs(d[i + 4] - rgb[2]) < EPS) n += 1;
    }
  }
  return n;
}

// Тайл-квады: вершины с цветом ВНЕ маркерной палитры.
function tileVerts(glCalls) {
  let n = 0;
  for (const d of bufferDataOf(glCalls)) {
    for (let i = 0; i + 5 < d.length; i += 6) {
      const r = d[i + 2], g = d[i + 3], b = d[i + 4];
      const marker = [PLAYER_COLOR, BUILDING_COLOR, MOB_COLOR].some(
        ([pr, pg, pb]) =>
          Math.abs(r - pr) < EPS && Math.abs(g - pg) < EPS
          && Math.abs(b - pb) < EPS);
      if (!marker) n += 1;
    }
  }
  return n;
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

// Кадр + дельты spy-счётчиков за этот кадр (glCalls сброшены до кадра).
function measure(h, now) {
  h.glCalls.length = 0;
  const b0 = h.counts.brightness;
  const t0 = h.counts.tileFrames;
  h.frameFn(now);
  return {
    brightness: h.counts.brightness - b0,
    tileFrames: h.counts.tileFrames - t0,
  };
}

function assertReady(h) {
  const s = h.sandbox.__game.state.sprites;
  assert.ok(s && s.total > 0, 'спрайт-лоадер запущен');
  assert.equal(s.ready, s.total, 'steady state: все ассеты ready');
}

function sizeOf(h) {
  return h.sandbox.__game.state.frameTilesCache.size;
}

// Канон знака нуля: hit-ветка гейта берёт координаты из t.x/t.y (тайл
// создан первым вызовом tileCache.tile, у спавн-тайла это -0 при
// вычисленном диапазоне), rebuild-ветка — из целых цикла → SameValue-
// различие ±0 в Float32 при одинаковой геометрии (−0 ≡ 0 для рендера;
// существующее поведение мастера, не регресс 000339). Сравнение буферов
// — после нормализации нуля.
function bufNorm(glCalls) {
  return Array.from(bufferDataOf(glCalls)[0], (v) => (v === 0 ? 0 : v));
}

// --- T1 (КРАСНЫЙ до правки): steady — цикл гейта не выполняется ---

test('T1: steady state (ready===total): цикл legacy-гейта НЕ выполняется — tileFrames <= 1.5×|frameTiles| (только спрайт-проход), brightness 0, вершин 0; и на hit-, и на rebuild-кадре (000339)', async () => {
  const h = await boot();
  assertReady(h);
  frameAt(h, NOW + 200); // rebuild #1
  frameAt(h, NOW + 400); // warm hit #1
  const size = sizeOf(h);
  assert.ok(size > 0, 'сценарий: frameTiles непусты');
  // hit-кадр: до правки — 2.0×size (цикл гейта + спрайт-проход), после — 1.0×.
  const hit = measure(h, NOW + 600);
  const hitLimit = Math.round(size * 1.5);
  assert.ok(hit.tileFrames <= hitLimit,
    'steady hit-кадр: обращений tileFrames за кадр ' + hit.tileFrames
    + ' <= ' + hitLimit + ' (1× на тайл — только спрайт-слой; полный цикл'
    + ' гейта добавляет ещё 1× — именно его пропускает 000339)');
  assert.equal(hit.brightness, 0,
    'steady hit-кадр: brightness не вызывается (получено '
    + hit.brightness + ')');
  assert.equal(totalVerts(h.glCalls), 0,
    'steady hit-кадр: 0 вершин (RM-3-режим сохранён)');
  // rebuild-кадр (смена зума wheel-out → key промазал): тот же пропуск.
  const wheel = (h.gameCanvas.listeners['wheel'] || [])[0];
  assert.ok(typeof wheel === 'function', 'сценарий: wheel на #game');
  wheel({ deltaY: -100, preventDefault() {} });
  const miss = measure(h, NOW + 800);
  const size2 = sizeOf(h);
  assert.ok(size2 > 0 && size2 !== size,
    'сценарий: зум изменил диапазон (rebuild-кадр)');
  const missLimit = Math.round(size2 * 1.5);
  assert.ok(miss.tileFrames <= missLimit,
    'steady rebuild-кадр: tileFrames ' + miss.tileFrames
    + ' <= ' + missLimit + ' (пропуск и на miss-ветке — movement-кадр)'
    + '; полный цикл гейта даёт 2× — краснота до 000339');
  assert.equal(miss.brightness, 0,
    'steady rebuild-кадр: brightness не вызывается (получено '
    + miss.brightness + ')');
  assert.equal(totalVerts(h.glCalls), 0,
    'steady rebuild-кадр: 0 вершин');
});

// --- T2 (ГЛАВНЫЙ НОВЫЙ ПИН): гейт возвращается при частичной загрузке ---

test('T2: частичная загрузка (ready < total): ГЕЙТ ВОЗВРАЩАЕТСЯ — тайловые квады неразрешённых кадров в WebGL-буфере, brightness вызывается на rebuild- И hit-кадре; герой ready — ромба нет (regression RM-4/RM-8, 000339)', async () => {
  const h = await boot((v) => v.startsWith('assets/tiles/'));
  const s = h.sandbox.__game.state.sprites;
  assert.ok(s.total > 0, 'сценарий: лоадер с очередью');
  assert.ok(s.ready > 0, 'сценарий: остальные ассеты ready');
  assert.ok(s.ready < s.total,
    'сценарий: частичная загрузка (ready ' + s.ready + ' < total '
    + s.total + ')');
  const f1 = frameAt(h, NOW + 200); // rebuild-кадр
  assert.equal(f1.raf, 1, 'rAF-цикл жив');
  assert.ok(countColor(h.glCalls, PLAYER_COLOR) === 0,
    'герой ready → legacy-ромба нет (XOR)');
  assert.ok(totalVerts(h.glCalls) > 0,
    'частичная загрузка: вершины в WebGL-кадре есть');
  assert.ok(tileVerts(h.glCalls) > 0,
    'частичная загрузка: тайловые квады в буфере (гейт работает)');
  assert.ok(h.counts.brightness > 0,
    'частичная загрузка (rebuild): brightness вызывается (шум'
    + ' рисуемых legacy-тайлов) — при пропускающем гейте 0');
  const b1 = h.counts.brightness;
  const m2 = measure(h, NOW + 400); // hit-кадр — гейт обязан остаться
  assert.ok(m2.brightness > 0,
    'частичная загрузка (hit-кадр): гейт РАБОТАЕТ — brightness '
    + m2.brightness + ' (0 = пропуск при ready<total, регресс RM-4)');
  assert.ok(tileVerts(h.glCalls) > 0,
    'частичная загрузка (hit): тайловые квады в буфере');
  assert.equal(countColor(h.glCalls, PLAYER_COLOR), 0,
    'герой ready → ромба нет и на hit-кадре');
  assert.ok(b1 > 0, 'сценарий: brightness на rebuild-кадре');
});

// --- T3: steady 0 вершин — три warm-кадра подряд ---

test('T3: steady state — 0 вершин fallback-геометрии на трёх warm-кадрах подряд (эквивалент RM-3/RM-10 сохранён после пропуска, 000339)', async () => {
  const h = await boot();
  assertReady(h);
  for (let i = 0; i < 3; i++) {
    frameAt(h, NOW + 200 * (i + 1));
    assert.equal(totalVerts(h.glCalls), 0,
      'кадр ' + (i + 1) + ': 0 вершин (steady — и rebuild, и hit)'
      + ', получено ' + totalVerts(h.glCalls));
  }
});

// --- T4: bufferData каждый кадр (RM-6/RM-10 не сломать) ---

test('T4: bufferData (new Float32Array, DYNAMIC_DRAW) — РОВНО 1 на кадр: steady — пустой и РАЗНЫЕ массивы в разных кадрах; частичная загрузка — непустой; drawArrays count === length/6 (RM-6/RM-10, 000339)', async () => {
  const h = await boot();
  assertReady(h);
  let prevData = null;
  for (let i = 0; i < 3; i++) {
    frameAt(h, NOW + 200 * (i + 1));
    const bds = bufferDataOf(h.glCalls);
    assert.equal(bds.length, 1,
      'steady кадр ' + (i + 1) + ': ровно 1 bufferData (проход выполнен)');
    assert.ok(ArrayBuffer.isView(bds[0]),
      'bufferData принимает типизированный массив (Float32Array)');
    assert.equal(bds[0].length, 0,
      'steady кадр ' + (i + 1) + ': пустая нагрузка (0 floats)');
    if (prevData !== null) {
      assert.notEqual(bds[0], prevData,
        'каждый кадр — НОВЫЙ Float32Array (new каждый кадр, не реюз)');
    }
    prevData = bds[0];
    const da = h.glCalls.filter((c) => c.fn === 'drawArrays');
    assert.equal(da.length, 1, 'ровно 1 drawArrays на кадр');
    assert.equal(da[0].count, bds[0].length / 6,
      'drawArrays count === вершин в буфере');
  }
  const hp = await boot((v) => v.startsWith('assets/tiles/'));
  frameAt(hp, NOW + 200);
  const bds = bufferDataOf(hp.glCalls);
  assert.equal(bds.length, 1,
    'частичная загрузка: ровно 1 bufferData на кадр');
  assert.ok(bds[0].length > 0,
    'частичная загрузка: bufferData С ДАННЫМИ (legacy-квады не потеряны)');
  const da = hp.glCalls.filter((c) => c.fn === 'drawArrays');
  assert.equal(da.length, 1);
  assert.equal(da[0].count, bds[0].length / 6);
});

// --- T5: бит-в-бит (вывод не меняется; miss ≡ hit; повторный boot ≡) ---

test('T5: бит-в-бит: miss-кадр ≡ hit-кадр по буферу (steady — пусто, частичная — квады), повторный boot той же фикстуры даёт идентичный буфер (вывод правки идентичен; попиксельный эталон — носители RM/MV/FT/CC без правок, 000339)', async () => {
  // steady: miss (первый кадр) ≡ hit (второй) — оба пусты.
  const hs = await boot();
  assertReady(hs);
  frameAt(hs, NOW + 200);
  const sMiss = bufNorm(hs.glCalls);
  frameAt(hs, NOW + 400);
  const sHit = bufNorm(hs.glCalls);
  assert.deepStrictEqual(sHit, sMiss,
    'steady: hit-кадр бит-в-бит ≡ miss-кадру');
  // частичная: miss ≡ hit — квады неразрешённых тайлов идентичны.
  const h1 = await boot((v) => v.startsWith('assets/tiles/'));
  frameAt(h1, NOW + 200);
  const pMiss = bufNorm(h1.glCalls);
  frameAt(h1, NOW + 400);
  const pHit = bufNorm(h1.glCalls);
  assert.ok(pMiss.length > 0, 'сценарий: частичная загрузка рисует квады');
  assert.deepStrictEqual(pHit, pMiss,
    'частичная: hit-кадр бит-в-бит ≡ miss-кадру');
  // детерминизм фикстуры: повторный boot того же предиката — тот же кадр.
  const h2 = await boot((v) => v.startsWith('assets/tiles/'));
  frameAt(h2, NOW + 200);
  assert.deepStrictEqual(bufNorm(h2.glCalls), pMiss,
    'повторный boot: WebGL-буфер первого кадра идентичен');
  const hs2 = await boot();
  frameAt(hs2, NOW + 200);
  assert.deepStrictEqual(bufNorm(hs2.glCalls), sMiss,
    'повторный steady boot: буфер идентичен');
});

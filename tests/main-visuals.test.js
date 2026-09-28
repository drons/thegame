// Задача 000039: отрисовка декораций тайлов на слое спрайтов
// (src/main.js, drawSprites).
//
// Данные и чистое ядро декораций готовы с задачи 000021: Game.tileVisuals
// (src/sprites.js), спрайты assets/sprites/visuals/ (в allAssetPaths),
// данные assets/visuals/ — в node покрыты tests/sprites.test.js. Не
// сделан только рендер: drawSprites в main.js декорации не рисует.
// main.js в node не грузится (IIFE: WebGL-контекст + DOM) — поэтому здесь
// исполняем ВЕСЬ <script>-цепочку из index.html в vm-песочнице с
// DOM/WebGL-стабами (паттерн tests/combat-ui.test.js), вызываем
// frame-колбэк, захваченный через requestAnimationFrame, и проверяем
// drawImage-вызовы 2d-контекста canvas #sprites:
//   * каждый ожидаемый элемент (пересчитан сам тестом из Game.tileVisuals
//     по видимому диапазону) нарисован с ТОЧНОЙ геометрией: центр
//     (sx + e.x*zoom, sy + e.y*zoom), сторона e.size*zoom — e.x/e.y это
//     ЦЕНТР элемента, поэтому drawImage идёт в
//     (sx + e.x*zoom − s/2, sy + e.y*zoom − s/2, s, s);
//   * порядок слоёв: декорации ПОСЛЕ текстуры тайла и ДО спрайта
//     постройки/моба (внутри цикла по frameTiles — отдельный проход
//     после цикла нарисовал бы их поверх построек, мобов и Флогистона);
//   * порог: при zoom < 24 (VISUALS_MIN_ZOOM) декорации не рисуются
//     (производительность: при малом зуме видимых тайлов explode),
//     при zoom >= 24 — рисуются;
//   * фолбэк: не загрузившийся спрайт декорации — элемент не рисуется,
//     остальные — как ожидаются (игра не падает, слой не пуст).
//
// Детерминизм: assets/map.png в стабе ВСЕГДА проваливается (onerror) →
// детерминированный фолбэк G.generateSeedPixels (фикс. сид, main.js) →
// мир и видимая область стабильны между запусками. Ожидаемые декорации
// тест пересчитывает САМИМ из Game песочницы (visibleTileRange + tileAt +
// tileVisuals) — конкретный террейн на спавне не предполагается.
// Загрузки Image резолвятся микротасками — перед первым кадром их
// промываем (иначе isReady все false и тест пройдёт «вакуумно»:
// слой не нарисован, и декораций в нём «нет, как и ожидалось»).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

// Цепочка скриптов — из index.html (не хардкод: изменения порядка
// подхватятся сами; регрессия порядка — tests/index-order.test.js).
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CHAIN = Array.from(html.matchAll(/<script\s+src="([^"]+)"/g), (m) => m[1])
  .map((p) => p.replace(/^src\//, ''));

// Окно «браузера» песочницы: frame() каждый кадр перезаписывает
// canvas.width/height из window.innerWidth/innerHeight.
const VIEW_W = 1280;
const VIEW_H = 720;
// Фиксированное время кадра (performance.now тоже = NOW): анимация
// кадров детерминирована (G.frameIndex получает now аргументом).
const NOW = 1000;
// Допуск сравнения геометрии: формулы в тесте и в реализации — те же
// операции, 1e-6 px ловит любой реальный сдвиг (ошибка центрирования
// −s/2 — до ~10 px), но не ulp-шум пересортировки операций.
const EPS = 1e-6;

// --- WebGL-стаб (main.js: compile/link/буферы) ---

function makeGl() {
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
  gl.getShaderParameter = () => true; // иначе main.js бросит Error
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
  gl.bufferData = noop;
  gl.vertexAttribPointer = noop;
  gl.viewport = noop;
  gl.clearColor = noop;
  gl.clear = noop;
  gl.uniformMatrix4fv = noop;
  gl.drawArrays = noop;
  return gl;
}

// --- Canvas 2D-стаб: каждый ВЫЗОВ метода записывается в el.drawCalls
// как [имя, args] — по содержимому drawImage проверяем геометрию,
// порядок слоёв и порог зума (паттерн makeContext2d,
// tests/combat-ui.test.js). ---

function makeContext2d(el) {
  const calls = el.drawCalls = [];
  return new Proxy({}, {
    get: (t, k) => (k in t ? t[k] : (...args) => { calls.push([k, args]); }),
    set: (t, k, v) => { t[k] = v; return true; },
  });
}

// --- «Снисходительный» DOM-элемент: known-свойства настоящие,
// неизвестные методы — no-op (ui.js/main.js при загрузке DOM-тяжёлые:
// панель персонажа, оверлеи; ассерты только на drawImage + __game). ---

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
    setAttribute() {},
    getBoundingClientRect() { return { left: 0, top: 0 }; },
    remove() {},
    blur() {},
  };
  return new Proxy(target, {
    get(t, k) {
      if (k in t) return t[k];
      return () => undefined; // неизвестный метод DOM — no-op
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

// --- Песочница: вся цепочка index.html (браузерная ветка UMD) ---

function bootSandbox(rejectSet) {
  const winListeners = {};
  const raf = [];
  const warns = [];
  const errors = [];
  const gameCanvas = makeEl('canvas');
  const spriteCanvas = makeEl('canvas');
  const hud = makeEl('div');
  // #game — WebGL (без него main.js уходит в фолбэк-ветку «WebGL не
  // поддерживается» и игра не стартует); #sprites — 2d со спаем.
  gameCanvas.getContext = (kind) => (kind === 'webgl'
    ? makeGl() : makeContext2d(gameCanvas));
  spriteCanvas.getContext = (kind) => (kind === '2d'
    ? makeContext2d(spriteCanvas) : null);
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
    // documentElement/requestFullscreen не заданы →
    // fullscreen.supported = false → кнопки нет (безопасно).
  };
  const window = {
    innerWidth: VIEW_W,
    innerHeight: VIEW_H,
    location: { search: '' },
    addEventListener: (t, f) => {
      (winListeners[t] || (winListeners[t] = [])) .push(f);
    },
    removeEventListener() {},
    // localStorage нет → main.js: saveStorage = undefined (try/catch) →
    // сейвы в песочнице не пишутся.
  };
  // Image-стаб: src ставится ПОСЛЕ onload/onerror (main.js). Загрузка —
  // микротаск: assets/map.png ВСЕГДА onerror (детерминированный фолбэк
  // G.generateSeedPixels, main.js loadMapPixels), остальные пути —
  // onload, кроме rejectSet (явный провал — тест фолбэка). На каждом
  // изображении метка __asset — по ней тест отличает вызовы drawImage.
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
          if (v === 'assets/map.png' || rejectSet.has(v)) {
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
      warn: (m) => warns.push(String(m)),
      error: (m) => errors.push(String(m)),
      log: () => {},
    },
    document,
    window,
    Image,
    performance: { now: () => NOW },
    requestAnimationFrame: (fn) => { raf.push(fn); return raf.length; },
  };
  vm.createContext(sandbox);
  for (const f of CHAIN) {
    vm.runInContext(
      fs.readFileSync(path.join(ROOT, 'src', f), 'utf8'), sandbox,
      { filename: f });
  }
  return {
    sandbox, winListeners, raf, warns, errors,
    gameCanvas, spriteCanvas, hud,
  };
}

// Промывка микротасков (все загрузки Image + loadMapPixels().then:
// создание карты, спавн, requestAnimationFrame(frame)).
const drain = () => new Promise((r) => setImmediate(r));

async function boot(rejectSet) {
  const h = bootSandbox(rejectSet);
  await drain();
  await drain();
  await drain();
  return h;
}

// Один кадр: вызываем последний захваченный rAF-колбэк (frame) с
// фиксированным now; возвращаем ТОЛЬКО вызовы этого кадра (clearRect
// кадра — первая запись).
function frameOnce(h) {
  const n0 = h.spriteCanvas.drawCalls.length;
  h.raf[h.raf.length - 1](NOW);
  return h.spriteCanvas.drawCalls.slice(n0);
}

// Колесо мыши на canvas #game (zoom: deltaY < 0 → ×1.2, deltaY > 0 → ÷1.2).
function dispatchWheel(h, deltaY) {
  const e = { deltaY, preventDefault() {} };
  for (const fn of h.gameCanvas.listeners['wheel'] || []) fn(e);
}

// drawImage-вызовы декораций (по метке изображения __asset).
function decoDraws(calls) {
  return calls.filter((c) => c[0] === 'drawImage'
    && c[1][0]
    && typeof c[1][0].__asset === 'string'
    && c[1][0].__asset.startsWith('assets/sprites/visuals/'));
}

// drawImage-вызовы текстур тайлов (санитайз: слой реально нарисован,
// а не пустой — иначе тест декораций пройдёт «вакуумно»).
function tileDraws(calls) {
  return calls.filter((c) => c[0] === 'drawImage'
    && c[1][0]
    && typeof c[1][0].__asset === 'string'
    && c[1][0].__asset.startsWith('assets/tiles/'));
}

// Ожидаемые декорации кадра: пересчёт из Game песочницы (тот же мир —
// generateSeedPixels с фикс. сидом; tileAt чистая функция координат).
// cam/zoom — из __game.state; skip — набор спрайтов, которые НЕ
// загрузились (тест фолбэка).
function expectedDecos(G, myMap, cam, zoom, skip) {
  const range = G.visibleTileRange(cam.x, cam.y, VIEW_W, VIEW_H, zoom);
  const out = [];
  for (let ty = range.y0; ty <= range.y1; ty++) {
    for (let tx = range.x0; tx <= range.x1; tx++) {
      const t = myMap.tileAt(tx, ty);
      // Та же проекция мир→экран, что и в drawSprites (G.worldToScreen,
      // задача 000061 — единый источник для обоих слоёв): y-вниз.
      const p = G.worldToScreen(tx, ty, cam.x, cam.y, zoom, VIEW_W, VIEW_H);
      const sx = p.x, sy = p.y;
      for (const e of G.tileVisuals(tx, ty, t.terrain)) {
        if (skip && skip.has(e.sprite)) continue;
        const s = e.size * zoom;
        out.push({
          sprite: e.sprite,
          x: sx + e.x * zoom - s / 2,
          y: sy + e.y * zoom - s / 2,
          size: s,
        });
      }
    }
  }
  return out;
}

// Множественное сравнение фактических и ожидаемых вызовов с допуском
// EPS: каждый фактический — в ожидании (и наоборот), нет «лишних»
// и нет «недорисованных».
function assertDecosEqual(actual, expected, label) {
  assert.equal(actual.length, expected.length,
    label + ': число вызовов декораций ' + actual.length
    + ' ≠ ожидаемых ' + expected.length);
  const pool = expected.slice();
  for (const [, a] of actual) {
    const i = pool.findIndex((e) => e.sprite === a[0].__asset
      && Math.abs(e.x - a[1]) < EPS
      && Math.abs(e.y - a[2]) < EPS
      && Math.abs(e.size - a[3]) < EPS
      && Math.abs(e.size - a[4]) < EPS);
    assert.ok(i >= 0,
      label + ': неожиданный вызов: ' + a[0].__asset
      + ' @ (' + a[1] + ', ' + a[2] + ') размер ' + a[3]);
    pool.splice(i, 1);
  }
  assert.equal(pool.length, 0,
    label + ': не нарисованы: ' + JSON.stringify(pool.slice(0, 3)));
}

// --- Тесты ---

test('песочница: цепочка index.html грузится, карта сгенерирована, все ассеты готовы', async () => {
  const h = await boot(new Set());
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет (порядок цепочки): ' + h.errors.join('; '));
  const g = h.sandbox.__game;
  assert.ok(g, 'globalThis.__game выставлен (main.js выполнен)');
  const st = g.state;
  assert.ok(st.map, 'карта сгенерирована');
  assert.equal(st.map.fromPng, false,
    'map.png в стабе провалился → фолбэк G.generateSeedPixels');
  assert.ok(h.warns.some((m) => m.includes('map.png')),
    'фолбэк map.png прошёл через console.warn (детерминированный пересчёт)');
  assert.ok(st.player, 'спавн найден');
  assert.ok(st.sprites, 'спрайтовый лоадер создан (есть 2d-контекст)');
  assert.equal(st.sprites.ready, st.sprites.total, 'все ассеты загрузились');
  assert.ok(st.sprites.total >= 60, 'набор ассетов не пустой');
  assert.equal(st.zoom, h.sandbox.Game.ZOOM_START, 'zoom = ZOOM_START');
  assert.equal(h.raf.length, 1, 'первый кадр запланирован через requestAnimationFrame');
});

test('декорации: каждый ожидаемый элемент нарисован с точной геометрией (ZOOM_START)', async () => {
  const h = await boot(new Set());
  const st = h.sandbox.__game.state;
  const calls = frameOnce(h);
  assert.ok(tileDraws(calls).length > 0,
    'текстуры тайлов нарисованы (слой спрайтов не пустой)');
  const G = h.sandbox.Game;
  const myMap = G.createMap(G.generateSeedPixels());
  const expected = expectedDecos(G, myMap, st.cam, st.zoom, null);
  assert.ok(expected.length > 10,
    'сценарий тестов: в видимой области есть декорации (ожид. ' + expected.length + ')');
  assertDecosEqual(decoDraws(calls), expected,
    'геометрия: центр (sx + e.x*zoom, sy + e.y*zoom), сторона e.size*zoom');
});

test('декорации: порядок слоёв — после текстуры тайла, до спрайта постройки/моба', async () => {
  const h = await boot(new Set());
  const st = h.sandbox.__game.state;
  const calls = frameOnce(h);
  const G = h.sandbox.Game;
  const myMap = G.createMap(G.generateSeedPixels());
  const zoom = st.zoom;
  const range = G.visibleTileRange(st.cam.x, st.cam.y, VIEW_W, VIEW_H, zoom);
  let checked = 0;
  for (let ty = range.y0; ty <= range.y1; ty++) {
    for (let tx = range.x0; tx <= range.x1; tx++) {
      const t = myMap.tileAt(tx, ty);
      const decos = G.tileVisuals(tx, ty, t.terrain);
      if (!decos.length || (!t.hasBuilding && !t.hasMobGroup)) continue;
      checked++;
      // Та же проекция мир→экран, что и в drawSprites (G.worldToScreen,
      // задача 000061): y-вниз.
      const p = G.worldToScreen(tx, ty, st.cam.x, st.cam.y, zoom, VIEW_W, VIEW_H);
      const sx = p.x, sy = p.y;
      // Текстура тайла: drawImage(img, sx, sy, zoom, zoom).
      const iTile = calls.findIndex((c) => c[0] === 'drawImage'
        && c[1][0] && c[1][0].__asset.startsWith('assets/tiles/')
        && Math.abs(c[1][1] - sx) < EPS
        && Math.abs(c[1][2] - sy) < EPS
        && Math.abs(c[1][3] - zoom) < EPS);
      assert.ok(iTile >= 0, `тайл (${tx},${ty}): текстура нарисована`);
      // Маркер тайла: постройка (sx + zoom*0.04, sy + zoom*0.04) либо
      // мобы (sx − zoom*0.1, sy − zoom*0.15) — формулы из drawSprites.
      const mark = t.hasBuilding
        ? [sx + zoom * 0.04, sy + zoom * 0.04, 'assets/sprites/buildings/']
        : [sx - zoom * 0.1, sy - zoom * 0.15, 'assets/sprites/mobs/'];
      const iMark = calls.findIndex((c) => c[0] === 'drawImage'
        && c[1][0] && c[1][0].__asset.startsWith(mark[2])
        && Math.abs(c[1][1] - mark[0]) < EPS
        && Math.abs(c[1][2] - mark[1]) < EPS);
      assert.ok(iMark >= 0, `тайл (${tx},${ty}): спрайт ${
        t.hasBuilding ? 'постройки' : 'мобов'} нарисован`);
      // Каждая декорация тайла — СТРОГО между текстурой и маркером
      // (внутри цикла по frameTiles).
      for (const e of decos) {
        const s = e.size * zoom;
        const iDeco = calls.findIndex((c) => c[0] === 'drawImage'
          && c[1][0] && c[1][0].__asset === e.sprite
          && Math.abs(c[1][1] - (sx + e.x * zoom - s / 2)) < EPS
          && Math.abs(c[1][2] - (sy + e.y * zoom - s / 2)) < EPS);
        assert.ok(iDeco >= 0,
          `тайл (${tx},${ty}): декорация id=${e.id} нарисована`);
        assert.ok(iTile < iDeco,
          `тайл (${tx},${ty}): декорация — ПОСЛЕ текстуры тайла`);
        assert.ok(iDeco < iMark,
          `тайл (${tx},${ty}): декорация — ДО спрайта ${
            t.hasBuilding ? 'постройки' : 'мобов'}`);
      }
    }
  }
  assert.ok(checked >= 3,
    'сценарий тестов: >= 3 тайлов с постройкой/мобами И декорациями (найдено ' + checked + ')');
});

test('декорации: zoom < 24 — не рисуются; zoom >= 24 — рисуются (порог из ТЗ)', async () => {
  const h = await boot(new Set());
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const myMap = G.createMap(G.generateSeedPixels());
  const state = () => g.state;

  // Старт: ZOOM_START = 80 >= 24 → декорации рисуются.
  const c0 = frameOnce(h);
  assert.ok(decoDraws(c0).length > 0, 'ZOOM_START (80): декорации рисуются');

  // Колесо (deltaY > 0) — отдалиться до zoom < 24 (шаги ×1/1.2:
  // 80 → 66.7 → 55.6 → … → 26.8 → 22.3).
  let guard = 0;
  while (state().zoom >= 24 && guard++ < 100) dispatchWheel(h, 120);
  assert.ok(state().zoom < 24, 'zoom ушёл ниже 24: ' + state().zoom);
  const c1 = frameOnce(h);
  assert.ok(tileDraws(c1).length > 0, 'текстуры тайлов на месте (слой жив)');
  assert.equal(decoDraws(c1).length, 0,
    'zoom < 24: декорации НЕ рисуются (производительность)');

  // Колесо (deltaY < 0) — вернуться к zoom >= 24.
  guard = 0;
  while (state().zoom < 24 && guard++ < 100) dispatchWheel(h, -120);
  assert.ok(state().zoom >= 24, 'zoom вернулся к >= 24: ' + state().zoom);
  const c2 = frameOnce(h);
  const st = state();
  const expected = expectedDecos(G, myMap, st.cam, st.zoom, null);
  assertDecosEqual(decoDraws(c2), expected, 'после приближения');
});

test('декорации: не загрузившийся спрайт не рисуется (фолбэк), остальные — как ожидаются', async () => {
  const REJECT = 'assets/sprites/visuals/lily_pad.svg';
  const h = await boot(new Set([REJECT]));
  const st = h.sandbox.__game.state;
  assert.equal(st.sprites.ready, st.sprites.total - 1,
    'именно один ассет не загрузился');
  const calls = frameOnce(h);
  assert.ok(tileDraws(calls).length > 0, 'текстуры тайлов на месте (слой жив)');
  const G = h.sandbox.Game;
  const myMap = G.createMap(G.generateSeedPixels());
  const all = expectedDecos(G, myMap, st.cam, st.zoom, null);
  const rejected = all.filter((e) => e.sprite === REJECT);
  assert.ok(rejected.length > 0,
    'сценарий тестов: ' + REJECT + ' присутствует в видимой области');
  const expected = all.filter((e) => e.sprite !== REJECT);
  const actual = decoDraws(calls);
  assert.ok(!actual.some(([, a]) => a[0].__asset === REJECT),
    'не загрузившийся спрайт НЕ рисуется (isReady false → пропуск)');
  assertDecosEqual(actual, expected,
    'остальные декорации — точно ожидаемый набор');
});

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
  if (tag === 'canvas') {
    // 000081: боевой оверлей (combat-ui.js build()) создаёт canvas через
    // document.createElement — без 2d-стаба startCombat в песочнице падал
    // бы (g2 = undefined → TypeError при set fillStyle). Существующие
    // тесты бой НЕ начинают — на них изменение не влияет (бит-в-бит).
    target.getContext = (kind) => (kind === '2d'
      ? makeContext2d(target) : null);
  }
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
      // Задача 000042: декорации на тайлах-стенах постройки
      // (inBuilding && !isEntrance) НЕ рисуются — как в drawSprites.
      if (t.inBuilding && !t.isEntrance) continue;
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
      // Маркер тайла: постройка — ОДИН w×h-прямоугольник ОТ ЯКОРЯ
      // (задача 000042: позиция worldToScreen(ax, ay), размер
      // w·zoom × h·zoom — формулы из drawSprites; запись пересчитана
      // из tileAt, recOf) либо мобы (sx − zoom*0.1, sy − zoom*0.15).
      const mark = t.hasBuilding
        ? (() => {
            const [ax, ay] = t.buildingAnchor;
            const rec = recOf(myMap, ax, ay);
            const pa = G.worldToScreen(ax, ay, st.cam.x, st.cam.y,
              zoom, VIEW_W, VIEW_H);
            return [pa.x, pa.y, 'assets/sprites/buildings/',
              rec.w * zoom, rec.h * zoom];
          })()
        : [sx - zoom * 0.1, sy - zoom * 0.15, 'assets/sprites/mobs/',
          undefined, undefined];
      const iMark = calls.findIndex((c) => c[0] === 'drawImage'
        && c[1][0] && c[1][0].__asset.startsWith(mark[2])
        && Math.abs(c[1][1] - mark[0]) < EPS
        && Math.abs(c[1][2] - mark[1]) < EPS
        && (mark[3] === undefined ||
            (Math.abs(c[1][3] - mark[3]) < EPS
              && Math.abs(c[1][4] - mark[4]) < EPS)));
      assert.ok(iMark >= 0, `тайл (${tx},${ty}): спрайт ${
        t.hasBuilding ? 'постройки (w×h от якоря)' : 'мобов'} нарисован`);
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

// --- Задача 000042: постройка по всему footprint'у + без декораций на стенах ---
//
// ТЗ (tasks/pending/000042.md): много-тайловая постройка (3x3 Арена/
// Храм, задача 000026) видна одним 1x1-спрайтом на тайле ВХОДА,
// стены — голый террейн с декорациями («травинки на стене»). Нужно:
//   * спрайт — ОДИН раз на постройку, прямоугольник w×h ОТ ЯКОРЯ:
//     drawImage(img, worldToScreen(ax,ay).x/y, w*zoom, h*zoom);
//     якорь берётся из ЛЮБОГО видимого тайла footprint'а (словарь за
//     кадр) — сам якорь может быть за краем экрана (margin zума ~1
//     тайл < 3);
//   * декорации на стенах (inBuilding && !isEntrance) — не рисовать;
//   * порядок слоёв: текстура < декорации < постройка < мобы < Флогистон
//     (глобально согласованно — по-тайловый цикл «постройка внутри
//     прохода текстур» не работает: текстуры соседних тайлов
//     footprint'а перерисуют часть прямоугольника).
//
// Сценарий: в песочнице мир ВСЕГДА фолбэчный (map.png onerror →
// G.generateSeedPixels, фикс. сид). Игрок с спавна (0,0) идёт до
// ближайшего (по числу шагов) ВХОДА много-тайловой постройки —
// храм 3x3, якорь (6,28), вход (7,30), 39 шагов (детерминированно;
// «гарантии сценария» ниже падают с сообщением, если мир сменят).
// Каждый шаг — как в игре: keydown → кадры frame(now) по +200 мс,
// пока игрок не перейдёт на целевой тайл → keyup (tryMove
// выполняется в frame при now−lastMove ≥ stepMs; stepMs = 420 мс —
// базовый интервал из глобальных настроек, задача 000063, поэтому
// один кадр хода не гарантирует); frameOnce(NOW) не подходит —
// в нём время застыло. Камера экспоненциально следует (G.cameraStep):
// после шагов — несколько «осадочных» кадров, но cam/zoom для
// ожидаемой геометрии берём из __game.state ПОСЛЕ кадра — точность
// без терпимости на схождение.
//
// Ход безопасен: BFS исключает тайлы групп мобов (startCombat
// остановил бы мир в песочнице) и входов пещер (maybeEnterDungeon);
// в footprint'е построек мобы не рождаются. День в песочнице —
// не ассертим (stepsPerDay=40, путь 39 шагов — смена дня на
// пороге; onDay безопасен: saveNow no-op без localStorage).

// --- Хелперы ходьбы игрока ---

// Кадр с заданным now (аналог frameOnce, но время не фиксировано):
// возвращает только вызовы этого кадра.
function frameAt(h, now) {
  const n0 = h.spriteCanvas.drawCalls.length;
  h.raf[h.raf.length - 1](now);
  return h.spriteCanvas.drawCalls.slice(n0);
}

// drawImage-вызовы спрайтов построек (по метке __asset).
function buildingDraws(calls) {
  return calls.filter((c) => c[0] === 'drawImage'
    && c[1][0]
    && typeof c[1][0].__asset === 'string'
    && c[1][0].__asset.startsWith('assets/sprites/buildings/'));
}

// Запись постройки по якорю — пересчётом из tileAt (инвариант мира:
// footprint = тайлы с данным якорем, прямоугольник от якоря;
// каталожный размер НЕ подходит — sizeChain сжимал постройку при
// размещении, memory/000026). footprint ≤ 3×3 (BUILD_MAX).
function recOf(myMap, ax, ay) {
  let w = 1, h = 1;
  while (w < 3) {
    const t = myMap.tileAt(ax + w, ay);
    if (t.inBuilding && t.buildingAnchor &&
        t.buildingAnchor[0] === ax && t.buildingAnchor[1] === ay) w++;
    else break;
  }
  while (h < 3) {
    const t = myMap.tileAt(ax, ay + h);
    if (t.inBuilding && t.buildingAnchor &&
        t.buildingAnchor[0] === ax && t.buildingAnchor[1] === ay) h++;
    else break;
  }
  // 000131: buildingId — 1:1-зеркало резолва спрайта в прохождении 2
  // main.js (лагерь: type = NONE, buildingId 47 → campSprite).
  const t0 = myMap.tileAt(ax, ay);
  return { ax, ay, w, h, type: t0.building, buildingId: t0.buildingId };
}

// BFS до ближайшего входа много-тайловой постройки (правила те же,
// что у игрока: 4 направления, только на passable тайлы). Исключаем
// КАК ЦЕЛИ:
//   * тайлы групп мобов — шаг на группу = startCombat (мир
//     останавливается в песочнице);
//   * входы пещер — maybeEnterDungeon (лабиринт поверх кадра);
//   * входы городов (задача 000103; предикат — building = NONE,
//     с 000073 слотовые входы тоже имеют buildingId — подтип) —
//     городских спрайтов в каталоге пока нет (000104/000105),
//     buildingSprite(NONE) = null (main.js их не рисует), а recOf
//     зажат в 3x3, тогда как города до 7x7 — геометрия теста
//     уедет. Сам тайл входа проходим — путь может через него идти.
//     Задача 000073: слотовые multi-входы (Арена/Храм) ОСТАЮТСЯ
//     валидными целями — у подтипа ЕСТЬ спрайт (спрайт своего
//     слота: buildingSprite(rec.type)).
// Целевой вход multi-постройки безопасен: в footprint'е мобы не
// рождаются, а в мире как multi (не города) рождается только
// Арена/Храм.
function findNearestMulti(G, myMap, start) {
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const startKey = start.x + ',' + start.y;
  const visited = new Set([startKey]);
  const prev = new Map();
  let frontier = [{ x: start.x, y: start.y }];
  for (let depth = 0; depth < 300 && frontier.length; depth++) {
    const next = [];
    for (const cur of frontier) {
      for (const [dx, dy] of DIRS) {
        const nx = cur.x + dx, ny = cur.y + dy;
        const k = nx + ',' + ny;
        if (visited.has(k)) continue;
        const t = myMap.tileAt(nx, ny);
        if (!t.passable || t.hasMobGroup) continue;
        if (t.hasBuilding
            && t.building === G.BUILDING_TYPES.CAVE_ENTRANCE) continue;
        visited.add(k);
        prev.set(k, cur.x + ',' + cur.y);
        // Городской вход — НЕ цель (см. комментарий выше, 000103).
        // Задача 000073: город — по building = NONE (до 000073 —
        // buildingId == null; у слотовых multi-входов теперь есть
        // buildingId — подтип, и они остаются целями).
        if (t.isEntrance && t.building !== G.BUILDING_TYPES.NONE) {
          const [ax, ay] = t.buildingAnchor;
          const rec = recOf(myMap, ax, ay);
          if (rec.w > 1 || rec.h > 1) {
            // Восстановление пути: тайлы от цели к спавну.
            const steps = [];
            let kk = k;
            while (kk !== startKey) {
              const [px, py] = kk.split(',').map(Number);
              steps.unshift([px, py]);
              kk = prev.get(kk);
            }
            return { target: { x: nx, y: ny }, rec, steps };
          }
        }
        next.push({ x: nx, y: ny });
      }
    }
    frontier = next;
  }
  return null;
}

// Доход игрока до ближайшей multi-постройки: на каждый шаг
// keydown(направление) → кадры по +200 мс, ПОКА игрок фактически не
// перешёл на целевой тайл (tryMove выполняется в frame при
// now−lastMove ≥ stepMs; базовый stepMs = 420 мс из глобальных
// настроек — задача 000063, поэтому один кадр +200 мс хода НЕ
// гарантирует, и протокол гоняет кадры до фактического перехода —
// ровно как в игре: клавиша удержана, игрок сам шажкивает) → keyup;
// в конце — 4 осадочных кадра (глейд мувера и сглаживание камеры
// завершаются). Кадр делает не более ОДНОГО хода, поэтому перелёта
// через целевой тайл быть не может. Возвращает { calls — вызовы
// ПОСЛЕДНЕГО кадра, found }.
function walkToMulti(h) {
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const myMap = G.createMap(G.generateSeedPixels());
  const spawn = { x: g.state.player.x, y: g.state.player.y };
  const found = findNearestMulti(G, myMap, spawn);
  assert.ok(found,
    'сценарий: найдена достижимая пешком много-тайловая постройка');
  assert.ok(found.steps.length > 0, 'сценарий: путь до входа не пуст');
  let now = NOW;
  let calls = null;
  for (let i = 0; i < found.steps.length; i++) {
    const [fx, fy] = i === 0 ? [spawn.x, spawn.y] : found.steps[i - 1];
    const [tx, ty] = found.steps[i];
    const dx = tx - fx, dy = ty - fy;
    assert.ok(Math.abs(dx) + Math.abs(dy) === 1, 'BFS: шаг по соседнему тайлу');
    const code = dx === 1 ? 'ArrowRight' : dx === -1 ? 'ArrowLeft'
      : dy === 1 ? 'ArrowDown' : 'ArrowUp';
    const e = { code, preventDefault() {}, stopPropagation() {} };
    for (const fn of h.winListeners['keydown'] || []) fn(e);
    // Лимит 10 кадров = 2 с: закрывает любой интервал шага от
    // MIN_MOVE_INTERVAL_MS (60 мс, motion.js) и выше; больше интервала
    // не бывает (кламп не удлиняет шаг сверх base).
    let guard = 0;
    do {
      now += 200;
      calls = frameAt(h, now);
    } while ((g.state.player.x !== tx || g.state.player.y !== ty)
      && ++guard < 10);
    for (const fn of h.winListeners['keyup'] || []) fn(e);
    assert.ok(g.state.player.x === tx && g.state.player.y === ty,
      `сценарий: игрок не перешёл на (${tx},${ty}) за ${guard} кадров`);
    // 000135: мир стал опаснее — маршрут пересекает 5×5-зону
    // триггерящей группы → бой посреди ходьбы (inCombat замораживает
    // tryMove). Техническая правка: авторазрешение zone-боя (мобы
    // 9999 → Space; Эфир НЕ убиваем — отличие от
    // resolveCombatVictory, где гибель Эфира — ассерт), ходьба
    // продолжается. Ассерты тестов — про отрисовку, не про бой.
    if (G.combatUI.isActive()) {
      const c = G.combatUI.current();
      for (const m of c.units.filter((x) => x.side === 'mob'
          && x.alive)) {
        G.combatInternals.dealDamageToMob(c, m, 9999);
      }
      assert.ok(c.result && c.result.outcome === 'victory',
        '000135: zone-бой по маршруту — победа');
      G.combatUI.handleCode('Space');
      assert.equal(G.combatUI.isActive(), false,
        '000135: zone-бой закрыт (Space → finish)');
    }
  }
  for (let i = 0; i < 4; i++) {
    now += 200;
    calls = frameAt(h, now);
  }
  return { calls, found };
}

// Ожидаемые drawImage построек кадра (новое поведение 000042):
// постройка с ЛЮБЫМ видимым тайлом рисуется ОДИН раз — прямоугольник
// w×h от якоря: позиция G.worldToScreen(ax, ay), размер w*zoom ×
// h*zoom. Якоря ищутся по видимому диапазону (якорь — любой тайл
// footprint'а, поэтому расширять диапазон не нужно).
function expectedBuildings(G, myMap, cam, zoom) {
  const range = G.visibleTileRange(cam.x, cam.y, VIEW_W, VIEW_H, zoom);
  const anchors = new Map();
  for (let ty = range.y0; ty <= range.y1; ty++) {
    for (let tx = range.x0; tx <= range.x1; tx++) {
      const t = myMap.tileAt(tx, ty);
      if (!t.inBuilding) continue;
      const k = t.buildingAnchor[0] + ',' + t.buildingAnchor[1];
      if (anchors.has(k)) continue;
      anchors.set(k, recOf(myMap, t.buildingAnchor[0], t.buildingAnchor[1]));
    }
  }
  const out = [];
  for (const rec of anchors.values()) {
    // Задача 000103: города (buildingId != null, type = NONE)
    // спрайтов пока не имеют (000104/000105) — buildingSprite(-1)
    // = null, и main.js их НЕ рисует (spriteLoader.image(null) →
    // пропуск). Ожидаемый набор — только со спрайтом.
    // 000131: лагерь (type = NONE, buildingId 47) — 1:1-зеркало
    // резолва прохождением 2 main.js: campSprite по каталожному id.
    // Городскую ветку не добавляем: в кадровых окнах main-visuals
    // нет якорей городов (51..54) — попади город в кадр, main.js
    // рисовал бы его через citySprite (CITY_SPRITES, 000110) и до,
    // и после задачи. 47 — единственный нетривиальный нетиповой
    // buildingId в этих окнах, поэтому campSprite — единственная
    // ветка, которую зеркалим.
    const asset = G.buildingSprite(rec.type) ||
      (rec.buildingId != null && typeof G.campSprite === 'function'
       ? G.campSprite(rec.buildingId) : null);
    if (!asset) continue;
    const p = G.worldToScreen(rec.ax, rec.ay, cam.x, cam.y, zoom, VIEW_W, VIEW_H);
    out.push({
      asset,
      x: p.x, y: p.y,
      w: rec.w * zoom, h: rec.h * zoom,
    });
  }
  return out;
}

// Мультимножественное сравнение вызовов построек (asset, x, y, w, h).
function assertBuildingsEqual(actual, expected, label) {
  assert.equal(actual.length, expected.length,
    label + ': число drawImage построек ' + actual.length
    + ' ≠ ожидаемых ' + expected.length);
  const pool = expected.slice();
  for (const [, a] of actual) {
    const i = pool.findIndex((e) => e.asset === a[0].__asset
      && Math.abs(e.x - a[1]) < EPS
      && Math.abs(e.y - a[2]) < EPS
      && Math.abs(e.w - a[3]) < EPS
      && Math.abs(e.h - a[4]) < EPS);
    assert.ok(i >= 0,
      label + ': неожиданный вызов: ' + a[0].__asset
      + ' @ (' + a[1] + ', ' + a[2] + ') ' + a[3] + '×' + a[4]);
    pool.splice(i, 1);
  }
  assert.equal(pool.length, 0,
    label + ': не нарисованы: ' + JSON.stringify(pool.slice(0, 3)));
}

test('постройка: footprint рисуется ОДИН раз w×h с якоря (не 1x1 на входе)', async () => {
  const h = await boot(new Set());
  const { calls, found } = walkToMulti(h);
  const g = h.sandbox.__game;
  const st = g.state;
  assert.deepEqual({ x: st.player.x, y: st.player.y },
    { x: found.target.x, y: found.target.y },
    'игрок дошёл до входа multi-постройки (протокол шагов работает)');
  assert.ok(tileDraws(calls).length > 0, 'текстуры тайлов на месте (слой жив)');
  const G = h.sandbox.Game;
  const myMap = G.createMap(G.generateSeedPixels());
  const expected = expectedBuildings(G, myMap, st.cam, st.zoom);
  assert.ok(expected.some((e) => e.w > st.zoom || e.h > st.zoom),
    'сценарий: в кадре есть много-тайловая постройка');
  assertBuildingsEqual(buildingDraws(calls), expected, 'footprint');

  // Прошедшая постройка: ровно ОДИН вызов её спрайта на позиции
  // якоря размером w×h — и НОЛЬ вызовов по старой формуле 1x1 на
  // входе (sx + 0.04·zoom, sy + 0.04·zoom, 0.92·zoom).
  const rec = found.rec;
  const asset = G.buildingSprite(rec.type);
  const p = G.worldToScreen(rec.ax, rec.ay, st.cam.x, st.cam.y,
    st.zoom, VIEW_W, VIEW_H);
  const atAnchor = buildingDraws(calls).filter(([, a]) =>
    a[0].__asset === asset
    && Math.abs(a[1] - p.x) < EPS && Math.abs(a[2] - p.y) < EPS
    && Math.abs(a[3] - rec.w * st.zoom) < EPS
    && Math.abs(a[4] - rec.h * st.zoom) < EPS);
  assert.equal(atAnchor.length, 1,
    'спрайт пройденной постройки — ровно ОДИН раз на якоре w×h');
  const pe = G.worldToScreen(found.target.x, found.target.y,
    st.cam.x, st.cam.y, st.zoom, VIEW_W, VIEW_H);
  const atOldEntrance = buildingDraws(calls).filter(([, a]) =>
    a[0].__asset === asset
    && Math.abs(a[1] - (pe.x + st.zoom * 0.04)) < EPS
    && Math.abs(a[2] - (pe.y + st.zoom * 0.04)) < EPS
    && Math.abs(a[3] - st.zoom * 0.92) < EPS);
  assert.equal(atOldEntrance.length, 0,
    'старая 1x1-формула на тайле входа не используется');
});

test('декорации: на тайлах-стенах постройки не рисуются', async () => {
  const h = await boot(new Set());
  const { calls } = walkToMulti(h);
  const st = h.sandbox.__game.state;
  assert.ok(tileDraws(calls).length > 0, 'текстуры тайлов на месте (слой жив)');
  const G = h.sandbox.Game;
  const myMap = G.createMap(G.generateSeedPixels());
  const range = G.visibleTileRange(st.cam.x, st.cam.y, VIEW_W, VIEW_H, st.zoom);
  // Ожидаемый набор декораций: ВСЕ видимые тайлы, КРОМЕ стен
  // (inBuilding && !isEntrance — задача 000042); вход декорации
  // сохраняет (на нём игрок взаимодействует с постройкой).
  let wallWithDeco = 0;
  const expected = [];
  for (let ty = range.y0; ty <= range.y1; ty++) {
    for (let tx = range.x0; tx <= range.x1; tx++) {
      const t = myMap.tileAt(tx, ty);
      const decos = G.tileVisuals(tx, ty, t.terrain);
      const isWall = t.inBuilding && !t.isEntrance;
      if (isWall && decos.length) wallWithDeco++;
      if (isWall) continue;
      const p = G.worldToScreen(tx, ty, st.cam.x, st.cam.y, st.zoom,
        VIEW_W, VIEW_H);
      const sx = p.x, sy = p.y;
      for (const e of decos) {
        const s = e.size * st.zoom;
        expected.push({
          sprite: e.sprite,
          x: sx + e.x * st.zoom - s / 2,
          y: sy + e.y * st.zoom - s / 2,
          size: s,
        });
      }
    }
  }
  // Тест не «вакуумный»: в кадре есть стена, на которой старое
  // поведение рисовало бы декорацию (tileVisuals детерминирована).
  assert.ok(wallWithDeco >= 1,
    'сценарий: >= 1 стена видимой постройки с потенциальной '
    + 'декорацией (найдено ' + wallWithDeco + ')');
  assert.ok(expected.length > 10,
    'сценарий: вне стен декорации есть (ожид. ' + expected.length + ')');
  assertDecosEqual(decoDraws(calls), expected, 'нет декораций на стенах');
});

test('порядок слоёв: текстура < декорации < постройка < мобы < Флогистон', async () => {
  const h = await boot(new Set());
  const { calls, found } = walkToMulti(h);
  const st = h.sandbox.__game.state;
  const G = h.sandbox.Game;
  const myMap = G.createMap(G.generateSeedPixels());
  const zoom = st.zoom;
  const rec = found.rec;
  const p = G.worldToScreen(rec.ax, rec.ay, st.cam.x, st.cam.y, zoom, VIEW_W, VIEW_H);
  // Текстура якорного тайла: drawImage(img, sx, sy, zoom, zoom).
  const iTile = calls.findIndex((c) => c[0] === 'drawImage'
    && c[1][0] && typeof c[1][0].__asset === 'string'
    && c[1][0].__asset.startsWith('assets/tiles/')
    && Math.abs(c[1][1] - p.x) < EPS && Math.abs(c[1][2] - p.y) < EPS
    && Math.abs(c[1][3] - zoom) < EPS && Math.abs(c[1][4] - zoom) < EPS);
  assert.ok(iTile >= 0, 'текстура якорного тайла нарисована');
  // Постройка: ОДИН прямоугольник w×h от якоря (задача 000042).
  const iBuilding = calls.findIndex((c) => c[0] === 'drawImage'
    && c[1][0] && c[1][0].__asset === G.buildingSprite(rec.type)
    && Math.abs(c[1][1] - p.x) < EPS && Math.abs(c[1][2] - p.y) < EPS
    && Math.abs(c[1][3] - rec.w * zoom) < EPS
    && Math.abs(c[1][4] - rec.h * zoom) < EPS);
  assert.ok(iBuilding >= 0,
    'постройка нарисована прямоугольником w×h от якоря');
  assert.ok(iTile < iBuilding, 'постройка — ПОСЛЕ текстуры тайла');
  // Декорации входного тайла (если есть): между текстурой и постройкой
  // (на стене декораций нет вообще — см. соседний тест).
  const ent = myMap.tileAt(found.target.x, found.target.y);
  const pE = G.worldToScreen(found.target.x, found.target.y,
    st.cam.x, st.cam.y, zoom, VIEW_W, VIEW_H);
  for (const e of G.tileVisuals(found.target.x, found.target.y, ent.terrain)) {
    const s = e.size * zoom;
    const iDeco = calls.findIndex((c) => c[0] === 'drawImage'
      && c[1][0] && c[1][0].__asset === e.sprite
      && Math.abs(c[1][1] - (pE.x + e.x * zoom - s / 2)) < EPS
      && Math.abs(c[1][2] - (pE.y + e.y * zoom - s / 2)) < EPS);
    assert.ok(iDeco >= 0, 'декорация входного тайла нарисована');
    assert.ok(iTile < iDeco && iDeco < iBuilding,
      'декорация — между текстурой тайла и постройкой');
  }
  // Мобы (если группа в кадре): ПОСЛЕ построек — глобальный порядок
  // слоёв (мобы в footprint'е не рождаются, поэтому «моб поверх
  // стены» не возникает).
  const iMob = calls.findIndex((c) => c[0] === 'drawImage'
    && c[1][0] && typeof c[1][0].__asset === 'string'
    && c[1][0].__asset.startsWith('assets/sprites/mobs/'));
  if (iMob >= 0) {
    assert.ok(iBuilding < iMob, 'мобы — ПОСЛЕ построек');
  }
  // Флогистон — поверх всего.
  const iPh = calls.findIndex((c) => c[0] === 'drawImage'
    && c[1][0] && typeof c[1][0].__asset === 'string'
    && c[1][0].__asset.startsWith('assets/sprites/phlogiston/'));
  assert.ok(iPh >= 0, 'Флогистон нарисован');
  const top = iMob >= 0 ? iMob : iBuilding;
  assert.ok(top < iPh, 'Флогистон — ПОСЛЕ построек/мобов');
});

// --- Задача 000122: спрайт поверженной группы скрыт до дня респауна ---
//
// drawSprites, проход 3 (main.js), рисует спрайт группы для каждого
// видимого тайла с hasMobGroup — без того, чтобы спросить, не
// повержена ли группа (запись 'x,y' → день поражения в Map
// `defeatedAt` main.js; в день респауна onDay удаляет запись через
// dueForRespawn). Требование: перед drawImage спрашивать
// G.groupVisible(defeatedAt, x, y) — поверженная группа скрыта до
// дня респауна, в день респауна спрайт возвращается, БЕЗ доп.
// состояния.
//
// Протокол: в main.js `const G = globalThis.Game` — тот же объект,
// что h.sandbox.Game, поэтому переопределение Game.groupVisible
// достает до прохода 3. Шпион несёт ИСТИННУЮ семантику
// (!defeatedAt.has(x + ',' + y), ключ — тот же формат, что в main.js)
// и фиксирует вызовы; на первом вызове получает САМО defeatedAt
// main.js (в state не выведено). «Победа» = запись на тайле видимой
// группы (как при победе, main.js:716); «день респауна» — РЕАЛЬНЫЙ
// onDay: actions.setDay(+respawn_days) → rest → dueForRespawn →
// delete. До реализации (красный): проход 3 G.groupVisible не
// вызывает — шпион не вызывается, поверженная группа рисуется.
//
// Сценарий детерминирован: фолбэчный мир (фикс. сид), в начальном
// кадре группы есть (гарантия сценария падает с сообщением, если
// мир сменят).

function mobDraws(calls) {
  return calls.filter((c) => c[0] === 'drawImage'
    && c[1][0]
    && typeof c[1][0].__asset === 'string'
    && c[1][0].__asset.startsWith('assets/sprites/mobs/'));
}

test('группа: после «победы» спрайт скрыт, другие группы на месте; в день респауна возвращается', async () => {
  const h = await boot(new Set());
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const myMap = G.createMap(G.generateSeedPixels());
  const st = g.state;
  const zoom = st.zoom;
  const range = G.visibleTileRange(st.cam.x, st.cam.y, VIEW_W, VIEW_H, zoom);
  const groups = [];
  for (let ty = range.y0; ty <= range.y1; ty++) {
    for (let tx = range.x0; tx <= range.x1; tx++) {
      if (myMap.tileAt(tx, ty).hasMobGroup) groups.push({ x: tx, y: ty });
    }
  }
  assert.ok(groups.length >= 2,
    'сценарий: >= 2 тайлов групп в кадре (найдено ' + groups.length + ')');
  const target = groups[0];
  const key = target.x + ',' + target.y;

  // Базовый кадр (без переопределения): ВСЕ видимые группы нарисованы.
  const c0 = frameOnce(h);
  assert.equal(mobDraws(c0).length, groups.length,
    'базово: все видимые группы нарисованы (слой живой)');

  // Шпион: истинная семантика + запись вызовов.
  const spyCalls = [];
  let D = null; // defeatedAt main.js (первый аргумент первого вызова)
  G.groupVisible = (defeatedAt, x, y) => {
    spyCalls.push([defeatedAt, x, y]);
    if (D === null && defeatedAt && typeof defeatedAt.has === 'function') D = defeatedAt;
    return !defeatedAt.has(x + ',' + y);
  };
  const c1 = frameOnce(h);
  // Утиный тип, а не instanceof: defeatedAt — Map из ВМ-области
  // песочницы, node'овский Map на него не instanceof.
  assert.ok(D && typeof D.has === 'function' && typeof D.set === 'function'
      && typeof D.delete === 'function',
    'проход 3 спрашивает G.groupVisible и передаёт собственное defeatedAt (Map)');
  assert.ok(spyCalls.length >= groups.length,
    'шпион вызван по тайлам групп кадра (вызовов: ' + spyCalls.length + ')');
  assert.ok(spyCalls.every((a) => a[0] === D),
    'ОДНО и то же defeatedAt в каждом вызове (не копия/сериализация)');
  assert.equal(mobDraws(c1).length, groups.length,
    'записей нет — все группы по-прежнему нарисованы (ложного скрытия нет)');

  // «Победа»: запись на целевом тайле (defeatedAt.set(key, день), main.js:716).
  D.set(key, g.state.day);
  const c2 = frameOnce(h);
  const tPos = G.worldToScreen(target.x, target.y,
    st.cam.x, st.cam.y, zoom, VIEW_W, VIEW_H);
  // Формула прохода 3: (sx − zoom*0.1, sy − zoom*0.15, zoom*1.2, zoom*1.2).
  assert.ok(!mobDraws(c2).some(([, a]) =>
      Math.abs(a[1] - (tPos.x - zoom * 0.1)) < EPS
      && Math.abs(a[2] - (tPos.y - zoom * 0.15)) < EPS),
    'спрайт поверженной группы НЕ рисуется');
  const others = groups.filter((p) => p !== target);
  assert.equal(mobDraws(c2).length, others.length,
    'скрыта ТОЛЬКО поверженная группа');
  for (const p of others) {
    const q = G.worldToScreen(p.x, p.y, st.cam.x, st.cam.y, zoom, VIEW_W, VIEW_H);
    assert.ok(mobDraws(c2).some(([, a]) =>
        Math.abs(a[1] - (q.x - zoom * 0.1)) < EPS
        && Math.abs(a[2] - (q.y - zoom * 0.15)) < EPS),
      `группа (${p.x},${p.y}) по-прежнему нарисована`);
  }

  // День респауна: реальный onDay (setDay → rest → dueForRespawn → delete).
  g.actions.setDay(g.state.day + G.RESPAWN_DAYS);
  assert.equal(D.has(key), false,
    'в день респауна onDay удалил запись (dueForRespawn)');
  const c3 = frameOnce(h);
  const back = mobDraws(c3).filter(([, a]) =>
    Math.abs(a[1] - (tPos.x - zoom * 0.1)) < EPS
    && Math.abs(a[2] - (tPos.y - zoom * 0.15)) < EPS);
  assert.equal(back.length, 1,
    'спрайт поверженной группы вернулся автоматически в день респауна');
  assert.equal(mobDraws(c3).length, groups.length,
    'все группы кадра снова на месте');
});

// --- Эфир: постоянный союзник (задача 000081) ---
//
// КРАСНЫЙ e2e-тест (TDD): полная цепочка index.html (тег src/efir.js
// подхватывается АВТОМАТИЧЕСКИ) + проводка main.js. Падают, пока
// src/efir.js не существует и main.js не передаёт efir в startCombat.
//
// Пинит «ВСЕГДА» (ТЗ): отладочный бой [E] (startCombat(0)) — один из
// трёх входов main.js (startCombatAt / maybeStartCombat /
// startDungeonCombat) — обязан содержать Эфира. Без этого пина будущая
// правка main.js молча отключила бы проводку. h.errors — пин «efir.js
// грузится чисто» (0 console.error — условие зелёных всех full-chain
// vm-тестов).

test('000081 e2e: цепочка грузится чисто; отладочный бой — Эфир в allies; __game.state.efir жив', async () => {
  const h = await boot(new Set());
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет (efir.js грузится чисто, main.js молчит): '
    + h.errors.join('; '));
  const g = h.sandbox.__game;
  assert.ok(g, '__game (main.js выполнен)');
  // Отладочный бой — ВСЕГДА через main.js (startCombat(0) → startCombatAt).
  const c = g.actions.startCombat(0);
  assert.ok(c, 'отладочный бой создан');
  const u = c.units.find((x) => x.kind === 'efir');
  assert.ok(u, 'Эфир в allies отладочного боя (main.js передаёт efir ВСЕГДА)');
  assert.equal(u.id, 'efir');
  assert.equal(u.side, 'ally');
  assert.equal(u.alive, true);
  assert.equal(u.hp, u.maxHP, 'старт с полным HP');
  // __game.state.efir — live-объект: единый лист (10 ключей, 000139),
  // точка для 000086/000116.
  const st = g.state.efir;
  assert.ok(st, '__game.state.efir существует (live-ссылка)');
  assert.equal(st.level, 1, 'новая сессия — L1');
  assert.equal(st.xp, 0);
  // 000139: единый лист — осознанный пере-пин (000085→000115→000144).
  assert.deepEqual(
    Object.keys(st).sort(),
    ['kind', 'level', 'points', 'primary', 'secondary',
     'skillXp', 'skills', 'spells', 'totalXp', 'xp'],
    'форма листа: 10 ключей (000139)');
});

// --- Задача 000110: города на глобальной карте (footprint w×h,
// спрайты городов, HUD-имя) ---
//
// ТЗ (tasks/pending/000110.md): город виден на карте как footprint
// (механизм 000042, расширение на 7×7), а не одним спрайтом на
// входном тайле; HUD-имя — уже в master (000105/000129, пин —
// tests/hud.js.test.js HU-C1), здесь — рендер и спрайты.
//
// Корень RED: проход 2 drawSprites (main.js) для городского якоря
// берёт G.buildingSprite(rec.type), у городов type = NONE → null →
// skip; в sprites.js нет селектора городских спрайтов
// (CITY_SPRITES/citySprite), файлов assets/sprites/cities/ нет —
// cityDraws пуст, и expectedCities падает на отсутствующем
// G.citySprite (нет функции — осмысленное падение, не синтаксис).
//
// Город НЕ слот (000103: свой канал, building = NONE, buildingId
// 51..54) — слотовая отрисовка и её тесты (000042) НЕ меняются:
// cityDraws фильтрует ТОЛЬКО assets/sprites/cities/, buildingDraws —
// только assets/sprites/buildings/.
//
// Хелперы новые (старые — findNearestMulti/expectedBuildings/recOf/
// buildingDraws — БЕЗ ИЗМЕНЕНИЙ). recOf НЕ подходит для городов:
// он зажат в 3×3, города — до 7×7; источник геометрии —
// myMap.buildingAt(ax, ay) (тот же, что у buildingRec в main.js,
// 000042: запись раскладывала мир — один источник footprint'а).
//
// ЛОВУШКА (memory/000103-city-channel.md устарела после 000105):
// исключения city-входов из findNearestMulti/expectedBuildings НЕ
// снимать — сняв их, старые walk-тесты шагнут на городской вход,
// откроют экран города (maybeEnterCity) и зависнут (guard !inDungeon
// блокирует world-движение). Городские тесты получают СОБСТВЕННЫЙ
// BFS (cityRoute/walkToCity) — входы городов в нём препятствия.
//
// Сценарии (координаты вычислены исполнением на реальной цепочке —
// фолбэчный мир generateSeedPixels, фикс. сид; спавн (0,0),
// ZOOM_START = 80, view 1280×720):
//   * MV-C1 — столица 54: якорь (−84,−48), 7×7, вход (−81,−42).
//     Цель (−86,−47) — ближайший по BFS тайл, из которого весь
//     7×7-footprint в кадре (133 шага; диапазон видимости
//     −95..−78 × −52..−42 ⊇ bbox). В кадре ровно ОДИН город.
//   * MV-C2 — один walk до (21,−14) (35 шагов): в кадре
//     ОДНОВРЕМЕННО деревня 52 (якорь (20,−16), 2×2, вход (21,−15))
//     и хутор 51 (якорь (19,−12), 1×1, вход = якорь). Кадр
//     12..29 × −19..−9. Анти-«штамп»: «один общий спрайт 5×5/7×7
//     для всех городов» провалит мультимножественное равенство.
//
// Камера: экспоненциальное сглаживание τ≈74.7 мс (G.cameraStep),
// цель — центр тайла игрока (player+0.5); после 4 осадочных кадров
// ×200 мс ошибка < 3e-3 тайла — границы диапазона видимости
// стабильны (гвард bbox-в-диапазоне даёт явное сообщение).
// День в песочнице не ассертим (133 шага = 3 смены дня; onDay
// безопасен: saveNow no-op без localStorage).

// drawImage-вызовы городских спрайтов (по метке __asset, каталог
// assets/sprites/cities/ — новый, город НЕ слот).
function cityDraws(calls) {
  return calls.filter((c) => c[0] === 'drawImage'
    && c[1][0]
    && typeof c[1][0].__asset === 'string'
    && c[1][0].__asset.startsWith('assets/sprites/cities/'));
}

// Ожидаемые городские drawImage кадра: якоря — по видимым тайлам
// (t.inBuilding && t.buildingId != null && t.building = NONE —
// фильтр по NONE ОБЯЗАТЕЛЕН: у слотовых якорей 8..12 тоже есть
// buildingId (подтип, 000073), но это не города). Запись — из
// myMap.buildingAt(ax, ay) (НЕ recOf: он зажат в 3×3). Каждый
// видимый город — ровно ОДИН w×h-прямоугольник ОТ ЯКОРЯ: позиция
// G.worldToScreen(rec.x, rec.y), размер w*zoom × h*zoom (те же
// формулы, что у слотовых построек, main.js проход 2).
// asset — G.citySprite(rec.buildingId); RED: функции нет — падение
// TypeError «G.citySprite is not a function» (символ отсутствует).
function expectedCities(G, myMap, cam, zoom) {
  const range = G.visibleTileRange(cam.x, cam.y, VIEW_W, VIEW_H, zoom);
  const anchors = new Map();
  for (let ty = range.y0; ty <= range.y1; ty++) {
    for (let tx = range.x0; tx <= range.x1; tx++) {
      const t = myMap.tileAt(tx, ty);
      if (!t.inBuilding) continue;
      if (t.buildingId == null) continue;
      if (t.building !== G.BUILDING_TYPES.NONE) continue;
      if (!t.buildingAnchor) continue;
      const k = t.buildingAnchor[0] + ',' + t.buildingAnchor[1];
      if (anchors.has(k)) continue;
      anchors.set(k, myMap.buildingAt(t.buildingAnchor[0],
        t.buildingAnchor[1]));
    }
  }
  const out = [];
  for (const rec of anchors.values()) {
    if (!rec) continue;
    const asset = G.citySprite(rec.buildingId);
    if (!asset) continue;
    const p = G.worldToScreen(rec.x, rec.y, cam.x, cam.y, zoom,
      VIEW_W, VIEW_H);
    out.push({
      asset,
      x: p.x, y: p.y,
      w: rec.w * zoom, h: rec.h * zoom,
    });
  }
  return out;
}

// BFS до ЯВНОЙ цели (в отличие от findNearestMulti — своей, не
// трогаем её). Правила — как у игрока (4 направления, только
// passable). Препятствия (и НЕ цели):
//   * тайлы групп мобов — startCombat остановит мир в песочнице;
//   * входы пещер — maybeEnterDungeon;
//   * ВСЕ городские входы — шаг на них открывает экран города
//     (maybeEnterCity, 000105), guard !inDungeon остановит
//     world-движение → walk зависнет. Предикат: hasBuilding +
//     buildingId != null + building = NONE (слотовые входы —
//     building ≠ NONE — проходимы, тест 000042 ходит на вход храма).
// Целевой тайл — СНАРУЖИ footprint'а города.
function cityRoute(G, myMap, start, goal) {
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const key = (x, y) => x + ',' + y;
  const visited = new Set([key(start.x, start.y)]);
  const prev = new Map();
  let frontier = [start];
  for (let depth = 0; depth < 400 && frontier.length; depth++) {
    const next = [];
    for (const cur of frontier) {
      for (const [dx, dy] of DIRS) {
        const nx = cur.x + dx, ny = cur.y + dy;
        const k = key(nx, ny);
        if (visited.has(k)) continue;
        const t = myMap.tileAt(nx, ny);
        if (!t.passable || t.hasMobGroup) continue;
        if (t.hasBuilding
            && t.building === G.BUILDING_TYPES.CAVE_ENTRANCE) continue;
        if (t.hasBuilding && t.buildingId != null
            && t.building === G.BUILDING_TYPES.NONE) continue;
        visited.add(k);
        prev.set(k, key(cur.x, cur.y));
        if (nx === goal.x && ny === goal.y) {
          // Восстановление пути: тайлы от цели к спавну.
          const steps = [];
          let kk = k;
          while (kk !== key(start.x, start.y)) {
            const [px, py] = kk.split(',').map(Number);
            steps.unshift([px, py]);
            kk = prev.get(kk);
          }
          return steps;
        }
        next.push({ x: nx, y: ny });
      }
    }
    frontier = next;
  }
  return null;
}

// Ход игрока до ЯВНОЙ цели — протокол ТОЧНО как walkToMulti:
// на каждый шаг keydown(направление) → кадры по +200 мс, ПОКА игрок
// фактически не перешёл (tryMove — в frame при now−lastMove ≥
// stepMs = 420 мс; один кадр хода не гарантирует) → keyup; лимит
// 10 кадров/шаг; в конце 4 осадочных кадра (глейд мувера + сглажение
// камеры завершаются). cam/zoom — из __game.state ПОСЛЕ кадра
// (точность без терпимости на схождение).
function walkToCity(h, goal) {
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const myMap = G.createMap(G.generateSeedPixels());
  const spawn = { x: g.state.player.x, y: g.state.player.y };
  const steps = cityRoute(G, myMap, spawn, goal);
  assert.ok(steps,
    'сценарий: цель (' + goal.x + ',' + goal.y
    + ') достижима городским BFS');
  assert.ok(steps.length > 0, 'сценарий: путь до цели не пуст');
  let now = NOW;
  let calls = null;
  for (let i = 0; i < steps.length; i++) {
    const [fx, fy] = i === 0 ? [spawn.x, spawn.y] : steps[i - 1];
    const [tx, ty] = steps[i];
    const dx = tx - fx, dy = ty - fy;
    assert.ok(Math.abs(dx) + Math.abs(dy) === 1,
      'BFS: шаг по соседнему тайлу');
    const code = dx === 1 ? 'ArrowRight' : dx === -1 ? 'ArrowLeft'
      : dy === 1 ? 'ArrowDown' : 'ArrowUp';
    const e = { code, preventDefault() {}, stopPropagation() {} };
    for (const fn of h.winListeners['keydown'] || []) fn(e);
    let guard = 0;
    do {
      now += 200;
      calls = frameAt(h, now);
    } while ((g.state.player.x !== tx || g.state.player.y !== ty)
      && ++guard < 10);
    for (const fn of h.winListeners['keyup'] || []) fn(e);
    assert.ok(g.state.player.x === tx && g.state.player.y === ty,
      'сценарий: игрок не перешёл на (' + tx + ',' + ty + ') за '
      + guard + ' кадров (движение заблокировано?)');
    // 000135: маршрут до города пересекает 5×5-зону триггерящей
    // группы — авторазрешение zone-боя (см. walkToMulti), чтобы
    // ходьба не зависла (inCombat замораживает tryMove). Ассерты
    // тестов — про отрисовку, не про бой.
    if (G.combatUI.isActive()) {
      const c = G.combatUI.current();
      for (const m of c.units.filter((x) => x.side === 'mob'
          && x.alive)) {
        G.combatInternals.dealDamageToMob(c, m, 9999);
      }
      assert.ok(c.result && c.result.outcome === 'victory',
        '000135: zone-бой по маршруту — победа');
      G.combatUI.handleCode('Space');
      assert.equal(G.combatUI.isActive(), false,
        '000135: zone-бой закрыт (Space → finish)');
    }
  }
  for (let i = 0; i < 4; i++) {
    now += 200;
    calls = frameAt(h, now);
  }
  return { calls, steps };
}

test('000110 MV-C1: столица 7×7 — footprint отрисован: все 49 тайлов, без выхода за bbox, не 1×1 на входе', async () => {
  const h = await boot(new Set());
  // Цель (−86,−47): ближайший по BFS тайл, из которого весь
  // 7×7-footprint столицы в кадре (133 шага).
  const goal = { x: -86, y: -47 };
  const { calls, steps } = walkToCity(h, goal);
  const g = h.sandbox.__game;
  const st = g.state;
  const G = h.sandbox.Game;
  const myMap = G.createMap(G.generateSeedPixels());
  // (a) Сценарные гварды: игрок на цели, путь = 133 шага (падение
  // с сообщением, если мир/генерация сместится).
  assert.deepEqual({ x: st.player.x, y: st.player.y }, goal,
    'игрок дошёл до цели (−86,−47) (walk-протокол работает)');
  assert.equal(steps.length, 133,
    'сценарий: путь до столицы = 133 шага (если мир сместился — '
    + 'тест обязан упасть: факт ' + steps.length + ')');
  const rec = myMap.buildingAt(-84, -48);
  assert.ok(rec && rec.buildingId === 54
      && rec.type === G.BUILDING_TYPES.NONE
      && rec.x === -84 && rec.y === -48 && rec.w === 7 && rec.h === 7
      && rec.entrance[0] === -81 && rec.entrance[1] === -42,
    'сценарий: столица 54 — якорь (−84,−48), 7×7, вход (−81,−42)');
  // (b) Гвард: bbox footprint'а (−84..−78 × −48..−42) — внутри
  // видимого диапазона (49/49 тайлов при zoom 80).
  const range = G.visibleTileRange(st.cam.x, st.cam.y, VIEW_W,
    VIEW_H, st.zoom);
  assert.ok(range.x0 <= rec.x && range.x1 >= rec.x + rec.w - 1
      && range.y0 <= rec.y && range.y1 >= rec.y + rec.h - 1,
    'сценарий: bbox столицы (' + rec.x + '..' + (rec.x + rec.w - 1)
    + ' × ' + rec.y + '..' + (rec.y + rec.h - 1) + ') внутри '
    + JSON.stringify(range) + ' (cam ' + st.cam.x + ',' + st.cam.y
    + ', zoom ' + st.zoom + ')');
  assert.ok(tileDraws(calls).length > 0, 'текстуры тайлов на месте');
  // (c) Мультимножественное равенство: каждый видимый город — ровно
  // ОДИН draw w×h от якоря, без лишнего, без пропусков. RED:
  // expectedCities падает на отсутствующем G.citySprite.
  const expected = expectedCities(G, myMap, st.cam, st.zoom);
  assert.ok(expected.length >= 1,
    'сценарий: в кадре есть городской якорь (найдено '
    + expected.length + ')');
  assertBuildingsEqual(cityDraws(calls), expected, 'footprint столицы');
  // (d) Ровно ОДИН draw city_54 в worldToScreen(−84,−48) размером
  // 7z×7z.
  const asset = G.citySprite(54);
  const p = G.worldToScreen(rec.x, rec.y, st.cam.x, st.cam.y,
    st.zoom, VIEW_W, VIEW_H);
  const atAnchor = cityDraws(calls).filter(([, a]) =>
    a[0].__asset === asset
    && Math.abs(a[1] - p.x) < EPS && Math.abs(a[2] - p.y) < EPS
    && Math.abs(a[3] - rec.w * st.zoom) < EPS
    && Math.abs(a[4] - rec.h * st.zoom) < EPS);
  assert.equal(atAnchor.length, 1,
    'спрайт столицы — ровно ОДИН раз на якоре (−84,−48) 7z×7z');
  // (e) Объединение прямоугольников cityDraws (мировые координаты —
  // инверсия worldToScreen) покрывает ВСЕ 49 тайлов bbox и НЕ
  // выходит за него. (В кадре ровно один город — столица.)
  const covered = new Set();
  let stray = 0;
  for (const [, a] of cityDraws(calls)) {
    const wx0 = st.cam.x + (a[1] - VIEW_W / 2) / st.zoom;
    const wy0 = st.cam.y + (a[2] - VIEW_H / 2) / st.zoom;
    const wx1 = wx0 + a[3] / st.zoom;
    const wy1 = wy0 + a[4] / st.zoom;
    // Прямой угол — в угловом тайле (draw ОТ ЯКОРЯ, по сетке).
    const gx0 = Math.round(wx0), gy0 = Math.round(wy0);
    const gx1 = Math.round(wx1), gy1 = Math.round(wy1);
    assert.ok(Math.abs(wx0 - gx0) < 0.01 && Math.abs(wy0 - gy0) < 0.01
        && Math.abs(wx1 - gx1) < 0.01 && Math.abs(wy1 - gy1) < 0.01,
      'городский draw по сетке тайлов (угол в угловом тайле): '
      + wx0.toFixed(4) + ',' + wy0.toFixed(4) + ' '
      + a[3].toFixed(2) + '×' + a[4].toFixed(2));
    for (let tx = gx0; tx < gx1; tx++) {
      for (let ty = gy0; ty < gy1; ty++) {
        if (tx < rec.x || tx >= rec.x + rec.w
            || ty < rec.y || ty >= rec.y + rec.h) stray++;
        covered.add(tx + ',' + ty);
      }
    }
  }
  assert.equal(stray, 0,
    'городские draw НЕ выходят за bbox столицы (' + stray
    + ' тайла(ов) за границей)');
  let missing = 0;
  for (let tx = rec.x; tx < rec.x + rec.w; tx++) {
    for (let ty = rec.y; ty < rec.y + rec.h; ty++) {
      if (!covered.has(tx + ',' + ty)) missing++;
    }
  }
  assert.equal(missing, 0,
    'footprint столицы покрыт: все 49 тайлов bbox нарисованы '
    + '(не покрыто ' + missing + ')');
  // (f) НОЛЬ city-draw по старой 1×1-формуле (0.92·zoom в
  // pe + 0.04·zoom) на входном тайле (−81,−42).
  const pe = G.worldToScreen(rec.entrance[0], rec.entrance[1],
    st.cam.x, st.cam.y, st.zoom, VIEW_W, VIEW_H);
  const atOldEntrance = cityDraws(calls).filter(([, a]) =>
    Math.abs(a[1] - (pe.x + st.zoom * 0.04)) < EPS
    && Math.abs(a[2] - (pe.y + st.zoom * 0.04)) < EPS
    && Math.abs(a[3] - st.zoom * 0.92) < EPS
    && Math.abs(a[4] - st.zoom * 0.92) < EPS);
  assert.equal(atOldEntrance.length, 0,
    'старая 1×1-формула на тайле входа города не используется');
});

test('000110 MV-C2: деревня 2×2 и хутор 1×1 — footprint отрисован ТОЧНО (анти-«штамп»)', async () => {
  const h = await boot(new Set());
  // ОДИН walk до (21,−14) (35 шагов): в кадре одновременно деревня
  // 52 (якорь (20,−16), 2×2, вход (21,−15)) и хутор 51 (якорь
  // (19,−12), 1×1, вход = якорь) — отдельный walk к хутору не нужен.
  const goal = { x: 21, y: -14 };
  const { calls, steps } = walkToCity(h, goal);
  const st = h.sandbox.__game.state;
  const G = h.sandbox.Game;
  const myMap = G.createMap(G.generateSeedPixels());
  assert.deepEqual({ x: st.player.x, y: st.player.y }, goal,
    'игрок дошёл до цели (21,−14) (walk-протокол работает)');
  assert.equal(steps.length, 35,
    'сценарий: путь = 35 шагов (если мир сместился — тест обязан '
    + 'упасть: факт ' + steps.length + ')');
  const v = myMap.buildingAt(20, -16);
  const f = myMap.buildingAt(19, -12);
  assert.ok(v && v.buildingId === 52 && v.w === 2 && v.h === 2
      && v.entrance[0] === 21 && v.entrance[1] === -15,
    'сценарий: деревня 52 — якорь (20,−16), 2×2, вход (21,−15)');
  assert.ok(f && f.buildingId === 51 && f.w === 1 && f.h === 1
      && f.entrance[0] === 19 && f.entrance[1] === -12,
    'сценарий: хутор 51 — якорь (19,−12), 1×1, вход = якорь');
  const range = G.visibleTileRange(st.cam.x, st.cam.y, VIEW_W,
    VIEW_H, st.zoom);
  assert.ok(range.x0 <= 19 && range.x1 >= 21 && range.y0 <= -16
      && range.y1 >= -12,
    'сценарий: деревня и хутор в кадре ' + JSON.stringify(range)
    + ' (cam ' + st.cam.x + ',' + st.cam.y + ')');
  const expected = expectedCities(G, myMap, st.cam, st.zoom);
  assert.ok(expected.some((e) => e.w === 2 * st.zoom
      && e.h === 2 * st.zoom),
    'сценарий: деревня 2×2 в кадре');
  assert.ok(expected.some((e) => e.w === st.zoom && e.h === st.zoom),
    'сценарий: хутор 1×1 в кадре');
  assertBuildingsEqual(cityDraws(calls), expected, 'деревня + хутор');
  // Деревня: ровно ОДИН draw 2z×2z ОТ ЯКОРЯ (20,−16) — без
  // перелива на соседние тайлы.
  const pv = G.worldToScreen(v.x, v.y, st.cam.x, st.cam.y, st.zoom,
    VIEW_W, VIEW_H);
  const vDraws = cityDraws(calls).filter(([, a]) =>
    Math.abs(a[1] - pv.x) < EPS && Math.abs(a[2] - pv.y) < EPS
    && Math.abs(a[3] - 2 * st.zoom) < EPS
    && Math.abs(a[4] - 2 * st.zoom) < EPS);
  assert.equal(vDraws.length, 1,
    'деревня — ровно 4 тайла: ОДИН draw 2z×2z от якоря (20,−16)');
  // Хутор: ровно ОДИН draw 1z×1z ОТ ЯКОРЯ (19,−12) — 1 тайл.
  const pf = G.worldToScreen(f.x, f.y, st.cam.x, st.cam.y, st.zoom,
    VIEW_W, VIEW_H);
  const fDraws = cityDraws(calls).filter(([, a]) =>
    Math.abs(a[1] - pf.x) < EPS && Math.abs(a[2] - pf.y) < EPS
    && Math.abs(a[3] - st.zoom) < EPS
    && Math.abs(a[4] - st.zoom) < EPS);
  assert.equal(fDraws.length, 1,
    'хутор — ровно 1 тайл: ОДИН draw 1z×1z от якоря (19,−12)');
});

// --- Задача 000112: Эфир в бою — полная цепочка в vm (W1 мир +
// D1 подземелье; CB-8/CB-9) ---
//
// Контракт (memory/000112-efir-combat.md §6): оба входа в бой
// покрыты vm — maybeStartCombat (мир: ходьба на тайл группы) и
// startDungeonCombat (подземелье: блуждающая группа через
// dungeonOnMove). В бою Эфир — 100% HP и своя мана u.mp =
// efirStats.maxMP, c.efs {spellInt, spellWis, touch: 1, move: 3}
// и явный u.maxHP = efirStats.maxHP (buildEfirUnit — 12-й экспорт
// src/efir.js, вызов в combat-ui startCombat); гибель — новый
// combatInternals.dealDamageToAlly; победа — 100% боевого xp в
// Эфир (finish → addEfirXp, 000081) и закрытие панели Space.
//
// Корень RED: makeAlly (000080/000081) создаёт Эфира с hp = maxHP
// (round((8+4·1)·0.7) = 8) БЕЗ своей маны u.mp (undefined) и без
// явного maxHP/c.efs — первый падающий ассерт ТОЛЬКО на u.mp
// (порядок пинов: u.hp === u.maxHP — 8===8, зелёный в red;
// u.mp === stats.maxMP — undefined !== 11, RED; c.efs по-полю;
// u.maxHP === stats.maxHP). Падение осмысленное (нет поля), не
// синтаксическое.
//
// vm-реальм (000082): u/c.efs — объекты песочницы; пины —
// примитивы, c.efs сравнивается по-полю (не deepEqual).
//
// Детерминизм сценария: фолбэчный мир (generateSeedPixels, фикс.
// сид); содержимое подземелья — чистая функция (totalXp, сид
// подземелья); позиции блуждания P_s — чистая функция номера шага
// (wanderStep: rng от (step, seed), игнорирует игрока) →
// time-expanded BFS воспроизводим.

const DIRS112 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// Пины Эфира в бою (vm: только примитивы, 000082). Уровень —
// актуальный (g.state.efir.level): после побед Эфир мог вырасти
// (addEfirXp — до onEnd), формулы пулов — зеркало buildEfirUnit.
function assertEfirCombat(G, g, c, label) {
  assert.ok(c, label + ': бой существует');
  const u = c.units.find((x) => x.kind === 'efir');
  assert.ok(u, label + ': Эфир в бою (main.js передаёт efir ВСЕГДА)');
  assert.equal(u.alive, true, label + ': жив на старте');
  assert.equal(u.hp, u.maxHP, label + ': полный HP на старте (100%)');
  const stats = G.efir.efirStats(g.state.efir.level);
  assert.equal(u.mp, stats.maxMP,
    label + ': своя мана u.mp = maxMP (buildEfirUnit)');
  assert.ok(c.efs,
    label + ': c.efs — боевой профиль построен (buildEfirUnit)');
  assert.equal(c.efs.spellInt,
    1 + Math.floor(stats.intelligence / 10), label + ': пул spellInt');
  assert.equal(c.efs.spellWis,
    1 + Math.floor(stats.wisdom / 10), label + ': пул spellWis');
  assert.equal(c.efs.touch, 1, label + ': пул touch');
  assert.equal(c.efs.move, 3, label + ': пул move');
  assert.equal(u.maxHP, stats.maxHP,
    label + ': явный maxHP = efirStats (buildEfirUnit)');
  return u;
}

// Гибель Эфира (новый combatInternals.dealDamageToAlly) + победа
// (мобы 9999 через dealDamageToMob → checkVictory) + Space →
// finish (100% xp в Эфир, onEnd, панель закрыта).
function resolveCombatVictory(G, c, label) {
  const u = c.units.find((x) => x.kind === 'efir');
  assert.ok(u, label + ': Эфир в бою');
  G.combatInternals.dealDamageToAlly(c, u, 9999);
  assert.equal(u.alive, false, label + ': Эфир пал (dealDamageToAlly)');
  for (const m of c.units.filter((x) => x.side === 'mob' && x.alive)) {
    G.combatInternals.dealDamageToMob(c, m, 9999);
  }
  assert.ok(c.result && c.result.outcome === 'victory',
    label + ': победа (checkVictory)');
  assert.ok(c.result.xp > 0, label + ': xp > 0 (победа над группой)');
  G.combatUI.handleCode('Space');
  assert.equal(G.combatUI.isActive(), false,
    label + ': панель закрыта (Space → finish)');
}

// 000135: hasMobGroup-тайлы окрестности (x, y) — окно Чебышёва ≤ 2
// (максимум радиуса зоны), формат findZoneCombat.
function zoneTilesAt(G, myMap, x, y) {
  const tiles = [];
  for (let dx = -2; dx <= 2; dx++) {
    for (let dy = -2; dy <= 2; dy++) {
      const t = myMap.tileAt(x + dx, y + dy);
      if (t.hasMobGroup) {
        tiles.push({ x: t.x, y: t.y, hasMobGroup: true,
          mobGroup: t.mobGroup });
      }
    }
  }
  return tiles;
}

// Мир: BFS от start к ближайшему ТАЙЛУ ЗОНЫ ГРУППЫ (000135): тайлу
// группы (нейтральные/трусливые — как до) ИЛИ краю 5×5-зоны
// триггерящей группы (агрессивные/территориальные — бой на шаге
// ВХОДА В ЗОНУ, не на тайле). findZoneCombat с defeatedAt (параметр
// defeated, ревью 000135): первый такой тайл — ЦЕЛЬ (шаг на него =
// бой), путь его НЕ пересекает (BFS возвращается на первой найден-
// ной). Маршрут ДО боя — defeatedAt пуст (дефолт); маршрут ПОСЛЕ
// боя — передать ключи поверженных тайлов групп: поверженная группа
// не триггерит, с пустым map BFS мог бы остановиться в ЕЁ зоне
// (шаг туда — без боя → ложный ассерт; латентная хрупкость CB-8,
// ревью 000135 — мир детерминирован, но фикс не зависит от мира).
// Входы пещер и городов — непроходимы: enterLocation откроет
// оверлей и заморозит мир (guard ходьбы зависнет). Прочие входы
// построек — безопасны (паттерн walkToMulti).
function worldGroupRoute(G, myMap, start, defeated) {
  const defeatedMap = defeated || new Map();
  const startKey = start.x + ',' + start.y;
  const visited = new Set([startKey]);
  const prev = new Map();
  let frontier = [{ x: start.x, y: start.y }];
  for (let depth = 0; depth < 600 && frontier.length; depth++) {
    const next = [];
    for (const cur of frontier) {
      for (const [dx, dy] of DIRS112) {
        const nx = cur.x + dx, ny = cur.y + dy;
        const k = nx + ',' + ny;
        if (visited.has(k)) continue;
        const t = myMap.tileAt(nx, ny);
        if (!t.passable) continue;
        if (t.hasBuilding
            && t.building === G.BUILDING_TYPES.CAVE_ENTRANCE) continue;
        if (t.hasBuilding && t.buildingId != null) {
          const rec = G.getBuilding(t.buildingId);
          if (rec && rec.категория === 'город') continue;
        }
        visited.add(k);
        prev.set(k, cur.x + ',' + cur.y);
        // 000135: стоп на тайле группы (любой класс, dist 0) ИЛИ на
        // тайле 5×5-зоны триггерящей группы (dist ≤ radius) — там
        // шаг вызывает бой (findZoneCombat — та же логика, что в
        // main.js). defeated — ключи поверженных тайлов групп
        // (ревью 000135): поверженные не триггерят; пустой map —
        // маршрут ДО боя (маршрут 1).
        if (G.findZoneCombat(nx, ny, zoneTilesAt(G, myMap, nx, ny),
            defeatedMap) !== null) {
          const steps = [];
          let kk = k;
          while (kk !== startKey) {
            const [px, py] = kk.split(',').map(Number);
            steps.unshift({ x: px, y: py });
            kk = prev.get(kk);
          }
          return { target: { x: nx, y: ny }, steps, key: k };
        }
        next.push({ x: nx, y: ny });
      }
    }
    frontier = next;
  }
  return null;
}

// Ходьба по BFS-маршруту (мир): шаг = keydown → кадры по +200 мс,
// пока игрок фактически не перешёл (stepMs ≤ 420 мс из настроек,
// 000063) → keyup (протокол walkToMulti). Бой может начаться в
// кадре ПОСЛЕДНЕГО шага (tryMove → maybeStartCombat: тайл группы
// ИЛИ вход в 5×5-зону, 000135) — игрок уже на целевом тайле, бой
// остаётся активным (тест решает его сам). 000135: зона-бой на
// НЕПОСЛЕДНЕМ шаге невозможен по построению (BFS — первый тайл
// зоны), авторазрешение — страховка (мобы 9999 → Space; Эфир НЕ
// убиваем), без него inCombat заморозил бы tryMove.
function walkWorldRoute(h, steps) {
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  let now = NOW;
  for (let i = 0; i < steps.length; i++) {
    const [fx, fy] = i === 0
      ? [g.state.player.x, g.state.player.y]
      : [steps[i - 1].x, steps[i - 1].y];
    const tx = steps[i].x, ty = steps[i].y;
    const dx = tx - fx, dy = ty - fy;
    assert.ok(Math.abs(dx) + Math.abs(dy) === 1,
      'BFS: шаг по соседнему тайлу');
    const code = dx === 1 ? 'ArrowRight' : dx === -1 ? 'ArrowLeft'
      : dy === 1 ? 'ArrowDown' : 'ArrowUp';
    const e = { code, preventDefault() {}, stopPropagation() {} };
    for (const fn of h.winListeners['keydown'] || []) fn(e);
    let guard = 0;
    do {
      now += 200;
      frameAt(h, now);
    } while ((g.state.player.x !== tx || g.state.player.y !== ty)
      && ++guard < 10);
    for (const fn of h.winListeners['keyup'] || []) fn(e);
    assert.ok(g.state.player.x === tx && g.state.player.y === ty,
      `сценарий: игрок не перешёл на (${tx},${ty}) за ${guard} кадров`);
    if (i < steps.length - 1 && G.combatUI.isActive()) {
      const c = G.combatUI.current();
      for (const m of c.units.filter((x) => x.side === 'mob'
          && x.alive)) {
        G.combatInternals.dealDamageToMob(c, m, 9999);
      }
      assert.ok(c.result && c.result.outcome === 'victory',
        '000135: zone-бой по маршруту — победа');
      G.combatUI.handleCode('Space');
      assert.equal(G.combatUI.isActive(), false,
        '000135: zone-бой закрыт (Space → finish)');
    }
  }
  return now;
}

// Подземелье: число floor-клеток (окно time-expanded BFS).
function dungeonFloorCount(G, d) {
  let n = 0;
  for (let i = 0; i < d.cells.length; i++) {
    if (d.cells[i] === G.CELL_FLOOR) n++;
  }
  return n;
}

// Подземелье: time-expanded BFS. Позиции блуждания P_s — чистая
// функция номера шага (wanderStep: rng от (step, seed), игнорирует
// игрока) — симулируются на КОПИИ contents (P_0 — текущее).
// Переход с клетки глубины s к соседу: бой, если живая группа на
// соседе в P_s (dungeonMove проверяет группы ДО wanderStep этого
// шага); иначе шаг успешен и сдвигает счётчик на s+1 (следующий
// уровень BFS). Возврат: { steps, group } (бой на ПОСЛЕДНЕМ шаге)
// либо { steps, group: null } — путь к клетке окна (игрок
// продвигает счётчик шагов для следующего окна); null — от позиции
// не проходимое (сценарий).
function dungeonEncounterPlan(G, d, contents, start, window) {
  const floor = (x, y) => x >= 0 && y >= 0 && x < d.width && y < d.height
    && d.cells[y * d.width + x] === G.CELL_FLOOR;
  const sim = {
    step: contents.step || 0,
    seed: contents.seed,
    mobs: contents.mobs.map((m) => Object.assign({}, m)),
  };
  // СНИМКИ позиций: wanderStep мутирует m.x/m.y на месте — ссылки
  // на сим-мобы в старых снимках показали бы ФИНАЛЬНЫЕ позиции.
  const snap = () => sim.mobs.filter((m) => !m.defeated)
    .map((m) => ({ x: m.x, y: m.y }));
  const groups = [snap()];
  for (let s = 1; s <= window; s++) {
    G.wanderStep(sim, d);
    groups[s] = snap();
  }
  const startKey = start.x + ',' + start.y;
  const parent = new Map([[startKey, null]]);
  let frontier = [[startKey, start.x, start.y]];
  for (let s = 0; s < window && frontier.length; s++) {
    const next = [];
    for (const [k, x, y] of frontier) {
      for (const [dx, dy] of DIRS112) {
        const nx = x + dx, ny = y + dy;
        const nk = nx + ',' + ny;
        if (parent.has(nk)) continue;
        if (!floor(nx, ny)) continue;
        if (nx === d.exit.x && ny === d.exit.y) continue; // выход — не шаг
        const grp = groups[s].find((m) => m.x === nx && m.y === ny);
        if (grp) {
          const steps = [{ x: nx, y: ny }];
          let kk = k;
          while (kk !== startKey) {
            const [px, py] = kk.split(',').map(Number);
            steps.unshift({ x: px, y: py });
            kk = parent.get(kk);
          }
          return { steps, group: grp };
        }
        parent.set(nk, k);
        next.push([nk, nx, ny]);
      }
    }
    frontier = next;
  }
  if (!frontier.length) return null;
  const [k] = frontier[frontier.length - 1];
  const steps = [];
  let kk = k;
  while (kk !== startKey) {
    const [px, py] = kk.split(',').map(Number);
    steps.unshift({ x: px, y: py });
    kk = parent.get(kk);
  }
  return { steps, group: null };
}

// Подземелье: один шаг — ОДИН keydown (dungeon-ui → ctx.onMove →
// dungeonMove синхронно: 1 клавиша = 1 клетка; wanderStep — ровно
// раз на успешный шаг). Бой, если живая группа на клетке — после
// шага combatUI.isActive() = true.
function stepDungeon(h, tx, ty) {
  const g = h.sandbox.__game;
  const dx = tx - g.dungeon.x, dy = ty - g.dungeon.y;
  assert.ok(Math.abs(dx) + Math.abs(dy) === 1,
    'BFS: шаг по соседней клетке');
  const code = dx === 1 ? 'ArrowRight' : dx === -1 ? 'ArrowLeft'
    : dy === 1 ? 'ArrowDown' : 'ArrowUp';
  const e = { code, key: code, preventDefault() {}, stopPropagation() {} };
  for (const fn of h.winListeners['keydown'] || []) fn(e);
}

// Подземелье: встреча с блуждающей группой (цикл окон; «пустое»
// окно — ходьба к краю BFS, продвигающая счётчик шагов, и повтор).
// Возврат: active-бой (c) или null (бюджет окон исчерпан —
// сценарий-фолбэк решает тест).
function encounterCombat(h, G, g, ds, window) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const plan = dungeonEncounterPlan(G, ds.dg, ds.contents,
      { x: g.dungeon.x, y: g.dungeon.y }, window);
    assert.ok(plan,
      'сценарий: подземелье проходимое от текущей клетки');
    if (plan.group) {
      for (const s of plan.steps) stepDungeon(h, s.x, s.y);
      return G.combatUI.current();
    }
    if (!plan.steps.length) break;
    for (const s of plan.steps) stepDungeon(h, s.x, s.y);
  }
  return null;
}

// Подземелье: путь к выходу (BFS по floor-клеткам; группы НЕ
// препятствия — бой по пути резолвится и ход продолжается;
// выходная клетка — цель: шаг на неё закрывает подземелье
// (exitLocation), позиция игрока не сдвигается).
function walkDungeonToExit(h, G, g, ds) {
  const d = ds.dg;
  const start = { x: g.dungeon.x, y: g.dungeon.y };
  const startKey = start.x + ',' + start.y;
  const floor = (x, y) => x >= 0 && y >= 0 && x < d.width && y < d.height
    && d.cells[y * d.width + x] === G.CELL_FLOOR;
  const parent = new Map([[startKey, null]]);
  let frontier = [[start.x, start.y]];
  let found = null;
  for (let depth = 0; depth < 5000 && frontier.length && !found; depth++) {
    const next = [];
    for (const [x, y] of frontier) {
      for (const [dx, dy] of DIRS112) {
        const nx = x + dx, ny = y + dy;
        const nk = nx + ',' + ny;
        if (parent.has(nk) || !floor(nx, ny)) continue;
        parent.set(nk, [x, y]);
        if (nx === d.exit.x && ny === d.exit.y) { found = [nx, ny]; break; }
        next.push([nx, ny]);
      }
    }
    frontier = next;
  }
  assert.ok(found, 'сценарий: выход достижим');
  const steps = [];
  let kk = found[0] + ',' + found[1];
  while (kk !== startKey) {
    const [px, py] = kk.split(',').map(Number);
    steps.unshift({ x: px, y: py });
    kk = parent.get(kk).join(',');
  }
  for (const s of steps) {
    stepDungeon(h, s.x, s.y);
    if (G.combatUI.isActive()) {
      resolveCombatVictory(G, G.combatUI.current(),
        'подземелье: бой по пути к выходу');
    }
  }
  assert.equal(g.dungeon, null,
    'выход: подземелье закрыто (exitLocation)');
}

test('000112 CB-8: W1 (мир) — ходьба на тайл группы → maybeStartCombat: Эфир 100% HP/MP, c.efs (1/1/1/3); гибель через dealDamageToAlly; победа — Space, 100% xp в Эфир; второй бой — снова 100% HP/MP (текущий уровень)', async () => {
  const h = await boot(new Set());
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет: ' + h.errors.join('; '));
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const myMap = G.createMap(G.generateSeedPixels());
  assert.equal(G.combatUI.isActive(), false,
    'сценарий: спавн не на тайле группы');
  const spawn = { x: g.state.player.x, y: g.state.player.y };

  // Бой 1: ближайшая по BFS группа — тайл группы ИЛИ край её 5×5-
  // зоны (000135: нейтральная/трусливая — тайл, как до;
  // агрессивная/территориальная — вход в зону).
  // Ревью 000135: spy startCombat — ключ тайла ГРУППЫ боя 1
  // (opts.tile = тайл группы, D8; main.js читает G.combatUI
  // динамически — паттерн tests/mob-zones-e2e.test.js): маршрут 2
  // строится ПОСЛЕ победы — с живым defeatedAt, иначе BFS мог бы
  // остановиться в зоне уже поверженной группы (шаг туда — без боя
  // → ложный ассерт «бой 2»).
  const origStart1 = G.combatUI.startCombat;
  const cap1 = { opts: null };
  G.combatUI = Object.assign({}, G.combatUI, {
    startCombat: (o) => { cap1.opts = o; return origStart1(o); },
  });
  const r1 = worldGroupRoute(G, myMap, spawn);
  assert.ok(r1, 'сценарий: найдена достижимая группа');
  walkWorldRoute(h, r1.steps);
  assert.equal(G.combatUI.isActive(), true,
    'шаг на тайл группы / в зону — бой начался (maybeStartCombat)');
  assertEfirCombat(G, g, G.combatUI.current(), 'бой 1');
  resolveCombatVictory(G, G.combatUI.current(), 'бой 1');
  assert.ok(g.state.efir.xp > 0,
    'Эфир получил 100% боевого опыта (000081): ' + g.state.efir.xp);

  // Бой 2: другая группа (побеждённый тайл проходимо: defeatedAt;
  // BFS стартует С НЕГО — он в visited и целью не может быть).
  // 000135: цель — тайл группы ИЛИ край 5×5-зоны (spider_nest —
  // territorial — бой на шаге ВХОДА В ЗОНУ, не на тайле).
  // Ревью 000135: defeated1 — ключ тайла группы боя 1 (spy; в мире
  // фолбэка пустой/живой map дают одну цель — (1,1) — но маршруты
  // должны быть корректны при ЛЮБОМ детерминированном мире).
  const from2 = { x: g.state.player.x, y: g.state.player.y };
  const defeated1 = new Map();
  if (cap1.opts) {
    defeated1.set(cap1.opts.tile.x + ',' + cap1.opts.tile.y, 1);
  }
  const r2 = worldGroupRoute(G, myMap, from2, defeated1);
  assert.ok(r2, 'сценарий: найдена вторая группа');
  assert.notEqual(r2.key, r1.key, 'второй бой — на другом тайле');
  walkWorldRoute(h, r2.steps);
  assert.equal(G.combatUI.isActive(), true,
    'второй бой начался (maybeStartCombat)');
  const c2 = G.combatUI.current();
  // Уровень мог вырасти (xp боя 1: addEfirXp — ДО onEnd) — пины
  // по актуальному уровню (assertEfirCombat читает g.state.efir).
  assertEfirCombat(G, g, c2, 'бой 2');
  resolveCombatVictory(G, c2, 'бой 2');
  assert.ok(g.state.efir.xp > 0, 'xp сохранён после второго боя');
});

test('000112 CB-9: D1 (подземелье) — enterDungeon (отладочный вход) + ходьба к блуждающей группе → startDungeonCombat: Эфир 100% HP/MP, c.efs; гибель через dealDamageToAlly; победа — Space, 100% xp; второй бой — снова 100% HP/MP', async () => {
  const h = await boot(new Set());
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет: ' + h.errors.join('; '));
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const ds = g.actions.enterDungeon();
  assert.ok(ds,
    'enterDungeon — состояние подземелья (отладочный вход, 000127)');
  assert.ok(g.dungeon, '__game.dungeon — подземелье активно');
  const window = Math.max(64, dungeonFloorCount(G, ds.dg));

  // Бой 1: встреча с блуждающей группой (time-expanded BFS).
  const c1 = encounterCombat(h, G, g, ds, window);
  assert.ok(c1, 'сценарий: встречена блуждающая группа');
  assert.equal(G.combatUI.isActive(), true,
    'бой начался (dungeonOnMove → startDungeonCombat)');
  assertEfirCombat(G, g, c1, 'бой 1');
  resolveCombatVictory(G, c1, 'бой 1');
  assert.ok(g.state.efir.xp > 0,
    'Эфир получил 100% боевого опыта (000081): ' + g.state.efir.xp);
  assert.ok(g.dungeon,
    'подземелье активно после боя (onEnd не закрывает)');

  // Бой 2: группа повержена (onEnd: g.defeated = true), счётчик
  // шагов сдвинут — новый план от актуального contents.
  let c2 = encounterCombat(h, G, g, ds, window);
  if (!c2) {
    // Фолбэк (контракт §6): выход и повторный вход — новое
    // содержимое (totalXp изменился после боя 1 → другой сид).
    walkDungeonToExit(h, G, g, ds);
    const ds2 = g.actions.enterDungeon();
    assert.ok(ds2, 'повторный вход: новое подземелье (новый сид)');
    assert.notStrictEqual(ds2.contents, ds.contents,
      'содержимое нового подземелья — другой объект');
    c2 = encounterCombat(h, G, g, ds2,
      Math.max(64, dungeonFloorCount(G, ds2.dg)));
    assert.ok(c2, 'сценарий: группа встречена в новом содержимом');
  }
  assert.equal(G.combatUI.isActive(), true, 'второй бой начался');
  assertEfirCombat(G, g, c2, 'бой 2');
  resolveCombatVictory(G, c2, 'бой 2');
  assert.ok(g.state.efir.xp > 0, 'xp сохранён после второго боя');
});

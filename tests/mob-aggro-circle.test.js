// Задача 000172: окружность радиуса агрессии моба на глобальной карте
// (src/main.js, drawSprites).
//
// ТЗ (tasks/pending/000172.md): на глобальной карте отрисовать тонкую
// красную пунктирную полупрозрачную линию окружности с радиусом
// агрессии моба.
//
// Контракт (memory/000172-aggro-circle.md, D1–D8):
//   * радиус агрессии = дистанция триггера боя — ЕДИНЫЙ источник
//     G.groupZoneInfo(groupType) (combat.js, 000135):
//     aggressive/territorial → {radius: 2, triggers: true},
//     neutral/timid → {radius: 1, triggers: false} — бой ТОЛЬКО на
//     тайле группы (SPEC L162 «может пройти мимо»);
//   * окружность — ТОЛЬКО для triggers=true групп; центр = центр тайла
//     worldToScreen(x + 0.5, y + 0.5), r = info.radius * zoom (радиус
//     читается на кадр из groupZoneInfo — НЕ хардкодится);
//   * стиль: strokeStyle 'rgba(255, 64, 56, 0.4)' (красный, alpha 0.4 <
//     1 — полупрозрачный), lineWidth 1 (тонкая — экранный px),
//     setLineDash([6,6]) (пунктирная), setLineDash([]) после stroke
//     (2d-состояние не «висит»);
//   * z-порядок: тайлы/декорации < постройки < агро-окружности < мобы <
//     Флогистон (отдельный проход между Проходом 2 и Проходом 3);
//   * без fill, без анимации (ТЗ — «не больше, чем просит ТЗ»).
//
// КРАСНАЯ стадия (TDD): прохода НЕТ в drawSprites → в кадре НОЛЬ
// arc-вызовов → M1–M5 падают осмысленно («окружность не нарисована»,
// «0 ≠ N ожидаемых», пресуппозиция стиля/порядка/детерминизма: нет
// arc) — не синтаксис: цепочка index.html не меняется, новых
// <script>-тегов/модулей/ассетов нет (D2).
//
// Детерминизм: assets/map.png в стабе ВСЕГДА проваливается (onerror) →
// детерминированный фолбэк G.generateSeedPixels (фикс. сид, main.js).
// Ожидаемые окружности тест пересчитывает САМ из Game песочницы
// (visibleTileRange + tileAt + groupZoneInfo + worldToScreen) —
// мирозависимо (паттерн expectedDecos, tests/main-visuals.test.js).
// Сценарий фолбэк-мира (проверен расчётом, §6 memory): спавн (0,0),
// cam (0.5, 0.5), ZOOM_START = 80, view 1280×720 — в кадре 5 групп:
// триггерящие (2,3) g4 spider_nest и (5,−5) g6 abyss_spirit
// (r = 2·80 = 160 px); не-триггерящие (1,0) g2, (−2,−4) g2,
// (−7,0) g3; постройки — 3 ((2,−4), (3,−4), (4,3)). Камера при
// спавне стоит на цели (cam = {0.5, 0.5} = player + 0.5) — два кадра
// с фикс. NOW идентичны (M5).
//
// ТЕХНО-НОТА: стандартный стаб 2d-контекста (main-visuals) логирует
// только ВЫЗОВЫ методов; property-SETы (strokeStyle/lineWidth) уходят
// в set-trap без записи. Здесь стаб расширен: set-trap дописывает
// ['set:' + свойство, [значение]] в ТОТ ЖЕ журнал (порядок
// сохраняется) — ассерты стиля M3 идут по журналу. В drawSprites
// свойства s2 выставляет только агро-проход (прочие проходы — только
// drawImage) → журнал чистый.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

// Цепочка скриптов — из index.html (не хардкод: изменения порядка
// подхватятся сами; регрессия порядка — tests/index-order.test.js).
// НОВОГО <script>-тега в задаче НЕТ (D2) — проход в main.js.
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CHAIN = Array.from(html.matchAll(/<script\s+src="([^"]+)"/g), (m) => m[1])
  .map((p) => p.replace(/^src\//, ''));

// Окно «браузера» песочницы: frame() каждый кадр перезаписывает
// canvas.width/height из window.innerWidth/innerHeight.
const VIEW_W = 1280;
const VIEW_H = 720;
// Фиксированное время кадра (performance.now тоже = NOW): два кадра
// M5 идентичны (нет wall-clock в отрисовке — D7).
const NOW = 1000;
// Допуск сравнения геометрии: формулы в тесте и в реализации — те же
// операции (G.worldToScreen, radius * zoom) — 1e-6 px ловит любой
// реальный сдвиг, но не ulp-шум пересортировки операций.
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

// --- Canvas 2d-стаб: ВЫЗОВЫ методов — [имя, args], property-SETы —
// ['set:' + свойство, [значение]] (расширение для M3 — см. техно-ноту
// в шапке). Порядок записей журнала = порядок операций кадра. ---

function makeContext2d(el) {
  const calls = el.drawCalls = [];
  // Аргумент/значение из vm-рема (у него СВОЙ Array.prototype):
  // массив копируем [ ...v ] в хост-рем, иначе deepStrictEqual([6,6]
  // из песочницы, [6,6] хоста) падает по прототипу, а не по значению
  // (паттерн [...C.CRAFT_TYPES], tests/craft-core.test.js).
  const norm = (v) => (Array.isArray(v) ? [...v] : v);
  return new Proxy({}, {
    get: (t, k) => (k in t ? t[k]
      : (...args) => { calls.push([k, args.map(norm)]); }),
    set: (t, k, v) => {
      t[k] = v;
      calls.push(['set:' + k, [norm(v)]]);
      return true;
    },
  });
}

// --- «Снисходительный» DOM-элемент: known-свойства настоящие,
// неизвестные методы — no-op (утилита main-visuals без изменений). ---

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
      (winListeners[t] || (winListeners[t] = [])).push(f);
    },
    removeEventListener() {},
    // localStorage нет → main.js: saveStorage = undefined (try/catch) →
    // сейвы в песочнице не пишутся.
  };
  // Image-стаб: src ставится ПОСЛЕ onload/onerror (main.js). Загрузка —
  // микротаск: assets/map.png ВСЕГДА onerror (детерминированный фолбэк
  // G.generateSeedPixels, main.js loadMapPixels), остальные пути —
  // onload. На каждом изображении метка __asset — по ней тест
  // отличает вызовы drawImage.
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
// фиксированным now; возвращаем ТОЛЬКО записи этого кадра (clearRect
// кадра — первая запись).
function frameOnce(h) {
  const n0 = h.spriteCanvas.drawCalls.length;
  h.raf[h.raf.length - 1](NOW);
  return h.spriteCanvas.drawCalls.slice(n0);
}

// --- Срезы журнала кадра ---

// drawImage-вызовы текстур тайлов (санитайз: слой реально нарисован,
// а не пустой — иначе тесты прошли бы «вакуумно»).
function tileDraws(calls) {
  return calls.filter((c) => c[0] === 'drawImage'
    && c[1][0]
    && typeof c[1][0].__asset === 'string'
    && c[1][0].__asset.startsWith('assets/tiles/'));
}

// drawImage-вызовы спрайтов построек (проход 2; M4 «после построек»).
function buildingDraws(calls) {
  return calls.filter((c) => c[0] === 'drawImage'
    && c[1][0]
    && typeof c[1][0].__asset === 'string'
    && c[1][0].__asset.startsWith('assets/sprites/buildings/'));
}

// Набор спрайтов Флогистона всех действий (frames — из
// G.phlogistonFrames песочницы, без хардкода имён фреймов).
function phlogistonAssets(G) {
  const s = new Set();
  for (const a of ['idle', 'walk', 'attack', 'cast']) {
    for (const f of G.phlogistonFrames(a)) s.add(f);
  }
  return s;
}

// ВСЕ arc-вызовы кадра с индексом в журнале. Спрайт-слой
// (drawSprites) до задачи НЕ содержит arc-вызовов (WebGL-слой —
// отдельный контекст, в drawCalls не пишется) → каждый arc журнала —
// кандидат в агро-окружности (после реализации — именно они).
function arcsOf(calls) {
  const out = [];
  for (let i = 0; i < calls.length; i++) {
    if (calls[i][0] === 'arc') {
      out.push({
        i,
        cx: calls[i][1][0], cy: calls[i][1][1], r: calls[i][1][2],
        a0: calls[i][1][3], a1: calls[i][1][4],
      });
    }
  }
  return out;
}

// Ближайшая ПРЕДЫДУЩАЯ запись журнала с именем (состояние, выставленное
// перед операцией): {j, v} — индекс + значение ([v][0] для set-*).
function prevEntry(calls, i, name) {
  for (let j = i - 1; j >= 0; j--) {
    if (calls[j][0] === name) return { j, v: calls[j][1][0] };
  }
  return null;
}

// Ближайшая СЛЕДУЮЩАЯ запись журнала с именем (состояние после stroke).
function nextEntry(calls, i, name) {
  for (let j = i + 1; j < calls.length; j++) {
    if (calls[j][0] === name) return { j, v: calls[j][1][0] };
  }
  return null;
}

// --- Ожидаемые агро-окружности кадра: пересчёт из Game песочницы
// (мирозависимо, паттерн expectedDecos) ---
// D1: ТОЛЬКО триггерящие группы; радиус — из G.groupZoneInfo
// (ЕДИНЫЙ источник, combat.js 000135 — НЕ хардкод); центр — центр
// тайла той же проекцией G.worldToScreen, что и все слои.
// Свежая песочница: defeatedAt пуст → все группы видимы (фильтр
// groupVisible Прохода 3 — тождество), бой не начинаем.
// Окно — visibleTileRange (margin 2 — то же, что frameTiles в
// buildFrame main.js, тот же вызов без явного margin).
function expectedAgroCircles(G, myMap, cam, zoom) {
  const range = G.visibleTileRange(cam.x, cam.y, VIEW_W, VIEW_H, zoom);
  const out = [];
  for (let ty = range.y0; ty <= range.y1; ty++) {
    for (let tx = range.x0; tx <= range.x1; tx++) {
      const t = myMap.tileAt(tx, ty);
      if (!t.hasMobGroup) continue;
      const info = G.groupZoneInfo(t.mobGroup);
      if (!info || !info.triggers || !(info.radius > 0)) continue;
      const c = G.worldToScreen(tx + 0.5, ty + 0.5, cam.x, cam.y,
        zoom, VIEW_W, VIEW_H);
      out.push({ x: tx, y: ty, cx: c.x, cy: c.y, r: info.radius * zoom });
    }
  }
  return out;
}

// --- Общий сценарий: чистая загрузка + первый кадр + санитайз ---
// Анти-«вакуум»: ошибок загрузки нет (h.errors === 0 — новый код не
// даёт load-time console.error), все ассеты готовы, слой реально
// нарисован (текстуры тайлов в кадре).
async function scene() {
  const h = await boot(new Set());
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет (порядок цепочки): ' + h.errors.join('; '));
  const g = h.sandbox.__game;
  const st = g.state;
  assert.ok(st.map, 'карта сгенерирована');
  assert.equal(st.map.fromPng, false,
    'map.png в стабе провалился → фолбэк G.generateSeedPixels');
  assert.ok(st.player, 'спавн найден');
  assert.equal(st.sprites.ready, st.sprites.total, 'все ассеты загрузились');
  const calls = frameOnce(h);
  assert.ok(tileDraws(calls).length > 0,
    'текстуры тайлов нарисованы (слой спрайтов не пустой)');
  const G = h.sandbox.Game;
  const myMap = G.createMap(G.generateSeedPixels());
  return { h, g, st, calls, G, myMap };
}

// --- Тесты ---

test('M1: окружность — каждая видимая триггерящая группа: arc(центр, radius·zoom, 0..2π) + stroke; (2,3) — r = 2·zoom', async () => {
  const { st, calls, G, myMap } = await scene();
  const expected = expectedAgroCircles(G, myMap, st.cam, st.zoom);
  // Сценарий фолбэк-мира (спавн (0,0), ZOOM_START 80): в кадре
  // >= 2 триггерящие группы — (2,3) spider_nest, (5,-5) abyss_spirit.
  assert.ok(expected.length >= 2,
    'сценарий: >= 2 триггерящих группы в кадре (найдено '
    + expected.length + ')');
  const arcs = arcsOf(calls);
  // Число окружностей в кадре = число ожидаемых (лишних нет).
  assert.equal(arcs.length, expected.length,
    'окружностей в кадре = ожидаемых: фактически ' + arcs.length
    + ', ожидаемо ' + expected.length);
  for (const e of expected) {
    const hit = arcs.find((a) =>
      Math.abs(a.cx - e.cx) < EPS
      && Math.abs(a.cy - e.cy) < EPS
      && Math.abs(a.r - e.r) < EPS);
    assert.ok(hit,
      'окружность не нарисована: группа (' + e.x + ',' + e.y
      + '), центр (' + e.cx + ', ' + e.cy + '), r = ' + e.r);
    assert.ok(Math.abs(hit.a0 - 0) < EPS
        && Math.abs(hit.a1 - Math.PI * 2) < EPS,
      'группа (' + e.x + ',' + e.y + '): ПОЛНАЯ окружность 0..2π');
    assert.equal(calls[hit.i + 1][0], 'stroke',
      'группа (' + e.x + ',' + e.y + '): сразу после arc — stroke()');
  }
  // ЯВНО (2,3): spider_nest — «моб на глобальной карте имеет
  // окружность радиуса агрессии правильного радиуса»:
  // r = groupZoneInfo.radius · zoom = 2 · zoom (160 px при старте).
  const t23 = myMap.tileAt(2, 3);
  assert.ok(t23.hasMobGroup, 'сценарий: группа на тайле (2,3)');
  const info23 = G.groupZoneInfo(t23.mobGroup);
  assert.ok(info23.triggers, 'сценарий: (2,3) — триггерящая группа');
  const c23 = G.worldToScreen(2.5, 3.5, st.cam.x, st.cam.y, st.zoom,
    VIEW_W, VIEW_H);
  const hit23 = arcs.find((a) =>
    Math.abs(a.cx - c23.x) < EPS && Math.abs(a.cy - c23.y) < EPS);
  assert.ok(hit23, 'окружность (2,3) нарисована');
  assert.ok(Math.abs(hit23.r - info23.radius * st.zoom) < EPS,
    'радиус (2,3) = groupZoneInfo.radius * zoom (радиус НЕ хардкод)');
  assert.ok(Math.abs(hit23.r - 2 * st.zoom) < EPS,
    'явно: радиус (2,3) = 2*zoom (' + (2 * st.zoom) + ' px)');
});

test('M2: окружность — не-триггерящие группы (D1) окружности НЕТ; лишних окружностей нет', async () => {
  const { st, calls, G, myMap } = await scene();
  const expected = expectedAgroCircles(G, myMap, st.cam, st.zoom);
  const arcs = arcsOf(calls);
  // (a) D1: neutral/timid группы — бой ТОЛЬКО на своём тайле
  // (SPEC L162 «может пройти мимо») → радиус агрессии 0 → окружности
  // НЕТ (ни с каким радиусом). Сценарий: (1,0) g2 skeleton_den,
  // (−2,−4) g2, (−7,0) g3 wolf_pack.
  const range = G.visibleTileRange(st.cam.x, st.cam.y, VIEW_W, VIEW_H,
    st.zoom);
  let nonTriggering = 0;
  for (let ty = range.y0; ty <= range.y1; ty++) {
    for (let tx = range.x0; tx <= range.x1; tx++) {
      const t = myMap.tileAt(tx, ty);
      if (!t.hasMobGroup) continue;
      const info = G.groupZoneInfo(t.mobGroup);
      if (!info || info.triggers) continue;
      nonTriggering++;
      const c = G.worldToScreen(tx + 0.5, ty + 0.5, st.cam.x, st.cam.y,
        st.zoom, VIEW_W, VIEW_H);
      assert.ok(!arcs.some((a) =>
          Math.abs(a.cx - c.x) < EPS && Math.abs(a.cy - c.y) < EPS),
        'не-триггерящая группа (' + tx + ',' + ty + ') — окружности НЕТ');
    }
  }
  assert.ok(nonTriggering >= 1,
    'сценарий: >= 1 не-триггерящая группа в кадре (найдено '
    + nonTriggering + ')');
  // ЯВНО: skeleton_den (1,0) — в кадре (сценарий), окружности с
  // r = 1*zoom (и ни с каким другим) НЕТ.
  const t10 = myMap.tileAt(1, 0);
  if (t10.hasMobGroup) {
    assert.ok(!G.groupZoneInfo(t10.mobGroup).triggers,
      'сценарий: (1,0) — не-триггерящая группа');
    const c10 = G.worldToScreen(1.5, 0.5, st.cam.x, st.cam.y, st.zoom,
      VIEW_W, VIEW_H);
    assert.ok(!arcs.some((a) =>
        Math.abs(a.cx - c10.x) < EPS && Math.abs(a.cy - c10.y) < EPS),
      '(1,0): окружности НЕТ (радиус агрессии = 0)');
  }
  // (b) Множественное равенство: КАЖДЫЙ arc кадра — ожидаемая
  // окружность (нет «по всем группам» и «фикс-радиус по всем») и
  // ни одна ожидаемая не пропущена.
  const pool = expected.slice();
  for (const a of arcs) {
    const i = pool.findIndex((e) =>
      Math.abs(e.cx - a.cx) < EPS && Math.abs(e.cy - a.cy) < EPS
      && Math.abs(e.r - a.r) < EPS);
    assert.ok(i >= 0,
      'неожиданная окружность: центр (' + a.cx + ', ' + a.cy
      + '), r = ' + a.r);
    pool.splice(i, 1);
  }
  assert.equal(pool.length, 0,
    'не нарисованы: ' + JSON.stringify(pool.slice(0, 3)));
});

test('M3: стиль (D4) — тонкая красная пунктирная полупрозрачная: lineWidth 1, strokeStyle rgba(255, 64, 56, 0.4), setLineDash([6,6]) перед arc, setLineDash([]) после stroke — побайтово', async () => {
  const { calls } = await scene();
  const arcs = arcsOf(calls);
  // Пресуппозиция: в кадре ЕСТЬ агро-arc — иначе проверка стиля
  // «вакуумна» (0 окружностей — 0 проверок) и тест зелёный на
  // красной стадии.
  assert.ok(arcs.length >= 1,
    'в кадре есть агро-arc (пресуппозиция проверки стиля); '
    + 'найдено 0 — окружности не нарисованы');
  for (const a of arcs) {
    // Состояние ПЕРЕД arc: цвет/толщина/пунктир (порядок
    // выставления внутри прохода не важен — важно состояние на
    // момент arc/stroke).
    const ss = prevEntry(calls, a.i, 'set:strokeStyle');
    assert.ok(ss, 'перед arc — выставлен strokeStyle');
    assert.equal(ss.v, 'rgba(255, 64, 56, 0.4)',
      'strokeStyle — красный + alpha 0.4 < 1 (полупрозрачный)');
    const lw = prevEntry(calls, a.i, 'set:lineWidth');
    assert.ok(lw, 'перед arc — выставлен lineWidth');
    assert.equal(lw.v, 1, 'lineWidth = 1 (тонкая — экранный px)');
    const dash = prevEntry(calls, a.i, 'setLineDash');
    assert.ok(dash, 'перед arc — setLineDash');
    assert.deepEqual(dash.v, [6, 6], 'пунктир [6, 6]');
    assert.equal(calls[a.i + 1][0], 'stroke',
      'сразу после arc — stroke()');
    // ПОСЛЕ stroke — сброс пунктира: dash-состояние 2d-контекста не
    // «висит» за пределами прохода.
    const reset = nextEntry(calls, a.i + 1, 'setLineDash');
    assert.ok(reset, 'после stroke — сброс setLineDash');
    assert.deepEqual(reset.v, [],
      'setLineDash([]) — dash-состояние не остаётся после stroke');
  }
});

test('M4: z-порядок (D3) — постройки < агро-окружности < мобы < Флогистон', async () => {
  const { st, calls, G } = await scene();
  const arcs = arcsOf(calls);
  // Пресуппозиция: в кадре ЕСТЬ агро-arc — иначе проверка порядка
  // «вакуумна» (0 окружностей — 0 проверок).
  assert.ok(arcs.length >= 1,
    'в кадре есть агро-arc (пресуппозиция проверки порядка); '
    + 'найдено 0 — окружности не нарисованы');
  // Спрайты групп мобов: ПЕРВЫЙ drawImage assets/sprites/mobs/*.
  const iMob = calls.findIndex((c) => c[0] === 'drawImage'
    && c[1][0] && typeof c[1][0].__asset === 'string'
    && c[1][0].__asset.startsWith('assets/sprites/mobs/'));
  assert.ok(iMob >= 0, 'сценарий: спрайт группы мобов в кадре');
  // Флогистон: ПЕРВЫЙ drawImage фрейма Флогистона (набор фреймов —
  // из G.phlogistonFrames песочницы, без хардкода имён).
  const phAssets = phlogistonAssets(G);
  const iPh = calls.findIndex((c) => c[0] === 'drawImage'
    && c[1][0] && typeof c[1][0].__asset === 'string'
    && phAssets.has(c[1][0].__asset));
  assert.ok(iPh >= 0, 'сценарий: Флогистон нарисован в кадре');
  // Постройки (проход 2): в фолбэк-кадре — 3 ((2,−4), (3,−4), (4,3))
  // → «после построек» конкретно. Все agro-arc строго ПОСЛЕ всех
  // building-drawImage кадра.
  const buildings = buildingDraws(calls);
  assert.ok(buildings.length >= 1,
    'сценарий: >= 1 постройка в кадре (найдено ' + buildings.length + ')');
  const buildingIdx = [];
  for (let i = 0; i < calls.length; i++) {
    const c = calls[i];
    if (c[0] === 'drawImage' && c[1][0]
        && typeof c[1][0].__asset === 'string'
        && c[1][0].__asset.startsWith('assets/sprites/buildings/')) {
      buildingIdx.push(i);
    }
  }
  const lastBuilding = buildingIdx[buildingIdx.length - 1];
  for (const a of arcs) {
    assert.ok(a.i > lastBuilding,
      'агро-окружность (r = ' + a.r + ') — ПОСЛЕ всех построек');
    assert.ok(a.i < iMob,
      'агро-окружность (r = ' + a.r + ') — ДО спрайтов мобов');
    assert.ok(a.i < iPh,
      'агро-окружность (r = ' + a.r + ') — ДО Флогистона');
  }
});

test('M5: детерминизм — два идентичных кадра (фикс. NOW): идентичный набор arc (нет мерцания/бегущего пунктира)', async () => {
  const { h, st, calls, G, myMap } = await scene();
  // Кадр 1 уже отрисован в scene() (фикс. NOW); кадр 2 — тот же NOW
  // (время застыло; камера на спавне стоит на цели — cam не ползёт).
  const c2 = frameOnce(h);
  assert.ok(tileDraws(c2).length > 0, 'кадр 2: текстуры тайлов (слой жив)');
  // Пресуппозиция (ВАЖНА): в КАЖДОМ кадре >= 1 агро-arc — иначе
  // «0 arc === 0 arc» было бы вакуумно-зелёным на красной стадии.
  const a1 = arcsOf(calls);
  const a2 = arcsOf(c2);
  assert.ok(a1.length >= 1,
    'кадр 1: есть агро-arc (пресуппозиция); найдено 0 — окружности '
    + 'не нарисованы');
  assert.ok(a2.length >= 1,
    'кадр 2: есть агро-arc (пресуппозиция); найдено 0 — окружности '
    + 'не нарисованы');
  // Сценарий: >= 2 окружности (не «одна одинаковая»).
  assert.ok(a1.length >= 2,
    'сценарий: >= 2 агро-arc в кадре (найдено ' + a1.length + ')');
  assert.equal(a1.length, a2.length,
    'два кадра — одинаковое число окружностей');
  // Подписи окружностей (cx, cy, r) — мультимножественное равенство
  // (округление 1e-6 px: значения из одних и тех же операций, ulp-
  // шум между кадрами исключён; порядок итерации не важен).
  const sig = (as) => as
    .map((a) => [Math.round(a.cx * 1e6), Math.round(a.cy * 1e6),
                 Math.round(a.r * 1e6)])
    .sort((p, q) => (p[0] - q[0]) || (p[1] - q[1]) || (p[2] - q[2]));
  assert.deepEqual(sig(a1), sig(a2),
    'наборы arc двух кадров идентичны (отрисовка детерминирована: '
    + 'нет мерцания/анимации — ТЗ «не больше»): '
    + JSON.stringify(sig(a1).slice(0, 2)) + ' vs '
    + JSON.stringify(sig(a2).slice(0, 2)));
  // Санитайз: окружности кадра 2 — ровно ожидаемые (мир/камера/зум
  // не сдвинулись между кадрами).
  const expected = expectedAgroCircles(G, myMap, st.cam, st.zoom);
  assert.equal(a2.length, expected.length,
    'кадр 2: число окружностей = ожидаемых');
});

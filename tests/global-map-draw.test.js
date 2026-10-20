// Задача 000176 (СТАДИЯ КРАСНЫХ ТЕСТОВ, TDD): глобальная карта —
// дублирующаяся отрисовка: до-000011 WebGL-сцена (buildFrame) рисуется
// БЕУСЛОВНО каждый кадр ПОД готовым спрайт-слоем (#sprites):
//   * цветные тайл-квады + золотые/красные маркеры + «геометрическая
//     фигура» — ромб Флогистона — дублируют спрайты (нагрузка:
//     пересборка Float32Array + bufferData на кадр; «старые тайлы»,
//     когда спрайт-слой пуст/неполон — вид до 000011);
//   * красный маркер группы ОСТАЁТСЯ после победы: спрайт-слой скрыть
//     поверженную группу (000122, G.groupVisible), WebGL-проход не
//     знает о defeatedAt — «прол» геометрической фигуры.
//
// ТЗ: tasks/pending/000176.md. Контракты (станция Проектирование):
//   memory/000176-global-map-single-pass.md — XOR-контракт элемента
//   (спрайт ИЛИ legacy-фигура, не оба; steady state = 0 вершин в
//   WebGL-проходе), контракт фолбэка 000011 (элемент без готового
//   спрайта → его legacy-фигура), groupVisible-паритет маркера;
//   memory/000176-duplicate-render.md — постмортем (root cause,
//   file:line, цифры сценария).
//
// КРАСНЫЕ (падают на ТЕКУЩЕМ коде master 3d5bac4, осмысленно —
// buildFrame без гейтов по готовности спрайтов):
//   RM-2: ready-кадр — спрайт героя в кадре И 0 вершин PLAYER_COLOR
//         в WebGL-буфере (ромб-фолбэк не рисуется, когда спрайт
//         нарисован: «фигура вместо героя» закрыта);
//   RM-3: ready-кадр — 0 вершин fallback-геометрии ВСЕГО (ни тайл-
//         квадов, ни маркеров, ни ромба): мир рисует ОДИН слой —
//         дублирования/излишней нагрузки нет;
//   RM-7: e2e — после победы над ВИДИМОЙ группой (1,0) (defeatedAt)
//         в кадре 0 вершин MOB_COLOR на её тайле — прол закрыт
//         (groupVisible-паритет legacy-маркера со спрайт-слоем).
//
// ГАУАРДЫ (зелёные с RED — пинят контракты и границы фикса):
//   RM-1: «exactly once» ТЗ — Флогистон в кадре ровно 1×
//         (drawImage спрайта);
//   RM-4: фолбэк 000011 — НИЧЕГО не загрузилось (cold-лоадер) →
//         спрайт-слой пуст (0 drawImage), WebGL-кадр ПОЛОН: ромб
//         героя (6 вершин) + тайл-квады — герой не пропадает;
//   RM-5: фолбэк героя — упал ТОЛЬКО phlogiston-спрайт (остальные
//         ready) → drawImage героя НЕТ, ровно 6 вершин PLAYER_COLOR
//         (фигура = фолбэк, не пропажа), тайл-текстуры на месте;
//   RM-6: одна линия отрисовки — на кадр ровно 1 rAF-планирование и
//         ровно 1 clearRect(#sprites): второго цикла нет;
//   RM-8: деградация — цепочка БЕЗ sprites.js (spriteLoader null):
//         frame() НЕ бросает, rAF-цикл жив, legacy-сцена ПОЛНАЯ
//         (ромб героя 6 вершин + тайл-квады + маркеры) — правка по
//         итогам ревью (buildingAsset без гарда !spriteLoader крашил
//         первый кадр спавн-мира: G.buildingSprite определён только
//         в sprites.js).
//
// Харнес: ВЕСЬ <script>-цепочка index.html в vm-песочнице (паттерн
// tests/camp-map-e2e.test.js) с ДВУМЯ изменениями стабов:
//   (a) gl-стаб ЗАПИСЫВАЕТ bufferData (Float32Array [x,y,r,g,b,a]*6)
//       и drawArrays (count) в h.glCalls — анализ вершин по цветам
//       fallback-палитры (src/main.js L46-52); сброс .length = 0 ДО
//       каждого pumped-кадра (ассерты — «вершины КАДРА»);
//   (b) Image-стаб с предикатом «падающих» ассетов (onerror по
//       списку) для сценариев фолбэка; assets/map.png — ВСЕГДА
//       onerror (детерминированный G.generateSeedPixels, как во всех
//       vm-харнесах).
//
// Числа НЕ хардкодим: ассерты — «0» / «6» (ромб) / «ровно 1×» /
// «> 0», а не спавн-цифры (1242 вершин / 198 тайлов — меняются со
// миром/ассетами/зумом).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
// Цепочка скриптов — из index.html (не хардкод, паттерн main-visuals).
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CHAIN = Array.from(html.matchAll(/<script\s+src="([^"]+)"/g), (m) => m[1])
  .map((p) => p.replace(/^src\//, ''));

const VIEW_W = 1280;
const VIEW_H = 720;
const NOW = 1000; // performance.now() в песочнице заморожен на NOW

// Pалитра fallback-слоя (src/main.js L46-52; контракт 000176: НЕ
// меняется, после фикса её читает только фолбэк).
const PLAYER_COLOR = [0.55, 0.95, 1.0]; // светящийся ромб Флогистона
const BUILDING_COLOR = [0.98, 0.83, 0.30]; // золотой маркер постройки
const MOB_COLOR = [0.85, 0.30, 0.25]; // красный маркер группы мобов
const EPS = 1e-4; // Float32Array: цвет 0..1 точится с ошибкой ~1e-8

// --- WebGL-стаб (УСИЛЕННЫЙ): bufferData/drawArrays → h.glCalls ---
//
// glCalls — общий на всё время жизни песочницы; сбрасывается
// (.length = 0) ПЕРЕД каждым pumped-кадром: frame() может зваться
// несколько раз за тест, ассерты — только «вершины кадра».

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

// --- Canvas 2D-стаб: каждый ВЫЗОВ метода → el.drawCalls [имя, args] ---

function makeContext2d(el) {
  const calls = el.drawCalls = [];
  return new Proxy({}, {
    get: (t, k) => (k in t ? t[k] : (...args) => { calls.push([k, args]); }),
    set: (t, k, v) => { t[k] = v; return true; },
  });
}

// --- Снисходительный DOM-элемент ---

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
      return () => undefined; // неизвестный метод DOM — no-op
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

// --- localStorage-стаб (наблюдение saveNow) ---

function makeStorage() {
  const store = {};
  return {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k)
      ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
}

// --- Песочница: вся цепочка index.html (браузерная ветка UMD) ---
//
// reject(asset) — предикат «падающих» ассетов (Image.onerror).
// assets/map.png — ВСЕГДА onerror (детерминированный мир),
// независимо от reject.
// chain — цепочка скриптов (по умолчанию ВЕСЬ index.html; RM-8
// передаёт цепочку без sprites.js — сценарий деградации).

function bootSandbox(reject, chain) {
  const winListeners = {};
  const raf = [];
  const errors = [];
  const gameCanvas = makeEl('canvas');
  const spriteCanvas = makeEl('canvas');
  const hud = makeEl('div');
  // #game — WebGL (без него main.js уходит в фолбэк-ветку);
  // glCalls — запись усиленного gl-стаба (bufferData/drawArrays).
  const glCalls = [];
  gameCanvas.getContext = (kind) => (kind === 'webgl'
    ? makeGl(glCalls) : makeContext2d(gameCanvas));
  // #sprites — 2d со спаем (слой спрайтов; его drawCalls —
  // drawImage/clearRect кадра).
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
    // Семантика браузерного window: повторный add — no-op.
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
  // Image-стаб (паттерн main-visuals + reject): src ставится ПОСЛЕ
  // onload/onerror; загрузка — микротаск; метка __asset — по ней
  // тест отличает вызовы drawImage.
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
    // Таймеры не гоняем (флаши UI): no-op.
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
    body: document.body, // DOM-хелперы оверлеев ищут .combat-overlay
  };
}

// Промывка микротасков (загрузки Image + loadMapPixels().then).
const drain = () => new Promise((r) => setImmediate(r));

async function boot(reject, chain) {
  const h = bootSandbox(reject, chain);
  await drain();
  await drain();
  await drain();
  const g = h.sandbox.__game;
  assert.ok(g, 'globalThis.__game выставлен (main.js выполнен)');
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет (порядок цепочки): ' + h.errors.join('; '));
  // frame() main.js — единственный rAF-колбэк после старта (пере
  // планирует себя); кадр вызываем ЕЁ.
  h.frameFn = h.raf[h.raf.length - 1];
  return h;
}

// --- Анализ WebGL-буфера кадра (h.glCalls) ---

function bufferDataOf(glCalls) {
  const out = [];
  for (const c of glCalls) if (c.fn === 'bufferData') out.push(c.data);
  return out;
}

// Всего вершин в кадре (6 floats на вершину: x, y, r, g, b, a).
function totalVerts(glCalls) {
  let n = 0;
  for (const d of bufferDataOf(glCalls)) n += d.length / 6;
  return n;
}

// Вершин с заданным цветом (fallback-палитра main.js L46-52).
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

// Вершины маркера на тайле (tx, ty): маркерный квад
// [tx+0.30, tx+0.70]² (buildFrame main.js), окно ±0.05. Мировые
// координаты — независимо от камеры/зума. (Ромб Флогистона в том же
// районе — другой цвет PLAYER_COLOR; тайл-квад — другой цвет.)
function markerVerts(glCalls, rgb, tx, ty) {
  let n = 0;
  for (const d of bufferDataOf(glCalls)) {
    for (let i = 0; i + 5 < d.length; i += 6) {
      if (d[i] >= tx + 0.25 && d[i] <= tx + 0.75
          && d[i + 1] >= ty + 0.25 && d[i + 1] <= ty + 0.75
          && Math.abs(d[i + 2] - rgb[0]) < EPS
          && Math.abs(d[i + 3] - rgb[1]) < EPS
          && Math.abs(d[i + 4] - rgb[2]) < EPS) n += 1;
    }
  }
  return n;
}

// Тайл-квады: вершины с цветом ВНЕ маркерной палитры (TERRAIN rgb +
// brightness·0.05 — ни один террейн не совпадает с маркером в EPS).
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

// --- Анализ drawCalls спрайт-канваса кадра ---

function drawImages(draw) {
  return draw.filter((c) => c[0] === 'drawImage');
}

function assetOf(c) {
  const img = c[1] && c[1][0];
  return img && typeof img.__asset === 'string' ? img.__asset : '';
}

// Спрайты Флогистона (assets/sprites/phlogiston/*.svg — 8 кадров).
function heroDraws(draw) {
  return drawImages(draw).filter(
    (c) => assetOf(c).startsWith('assets/sprites/phlogiston/'));
}

// Текстуры тайлов (assets/tiles/*.svg).
function tileDraws(draw) {
  return drawImages(draw).filter(
    (c) => assetOf(c).startsWith('assets/tiles/'));
}

// Спрайты групп мобов (assets/sprites/mobs/*.svg).
function mobDraws(draw) {
  return drawImages(draw).filter(
    (c) => assetOf(c).startsWith('assets/sprites/mobs/'));
}

function clearRects(draw) {
  return draw.filter((c) => c[0] === 'clearRect');
}

// Памп ОДНОГО кадра (frameFn — rAF-колбэк frame() main.js). glCalls
// СБРАСЫВАЮТСЯ до кадра → ассерты видят только вершины ЭТОГО кадра.
// Возврат: { draw — drawCalls спрайт-канваса кадра, raf — число
// rAF-планирований кадра }.
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

// Steady state: ВСЕ ассеты ready (живое поле __game.state.sprites).
function assertReady(h) {
  const s = h.sandbox.__game.state.sprites;
  assert.ok(s && s.total > 0, 'спрайт-лоадер запущен');
  assert.equal(s.ready, s.total, 'steady state: все ассеты ready');
}

// --- Ходьба и бой (паттерн tests/mob-zones-e2e.test.js) ---

function key(h, code) {
  const e = { code, preventDefault() {}, stopPropagation() {} };
  for (const fn of (h.winListeners['keydown'] || []).slice()) fn(e);
  return e;
}

function keyup(h, code) {
  const e = { code };
  for (const fn of (h.winListeners['keyup'] || []).slice()) fn(e);
  return e;
}

// ОДИН шаг в соседний тайл: keydown → кадры по +200 мс, пока игрок
// фактически не перешёл (stepMs ≤ 420 мс) → keyup; + 4 осадочных
// кадра (глейд мувера и сглаживание камеры завершаются). now —
// монотонный (шаг только через stepMs от последнего).
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

// Победа в бою (паттерн resolveCombatVictory
// tests/mob-zones-e2e.test.js): Эфир 9999 (dealDamageToAlly) + мобы
// 9999 (dealDamageToMob) → checkVictory → Space (finish → onEnd:
// defeatedAt.set(ключ тайла, день), saveNow).
function resolveCombatVictory(G, c, label) {
  const u = c.units.find((x) => x.kind === 'efir');
  assert.ok(u, label + ': Эфир в бою (main.js передаёт efir ВСЕГДА)');
  G.combatInternals.dealDamageToAlly(c, u, 9999);
  assert.equal(u.alive, false, label + ': Эфир пал (dealDamageToAlly)');
  for (const m of c.units.filter((x) => x.side === 'mob' && x.alive)) {
    G.combatInternals.dealDamageToMob(c, m, 9999);
  }
  assert.ok(c.result && c.result.outcome === 'victory',
    label + ': победа (checkVictory)');
  G.combatUI.handleCode('Space');
  assert.equal(G.combatUI.isActive(), false,
    label + ': панель закрыта (Space → finish)');
}

// --- RM-1 (ГАУАРД): «exactly once» ТЗ — герой в кадре ровно 1× ---

test('RM-1: ready-кадр — Флогистон нарисован РОВНО 1× (drawImage спрайта), без второй фигуры (000176)', async () => {
  const h = await boot();
  assertReady(h);
  const f = frameAt(h, NOW + 200);
  assert.equal(heroDraws(f.draw).length, 1,
    'герой в кадре ровно 1× (спрайт-слой), дубля нет');
});

// --- RM-2 (КРАСНЫЙ): нет legacy-ромба под готовым спрайтом героя ---
//
// Почему красен (master 3d5bac4): buildFrame src/main.js L2283–2291
// пушит 6 вершин ромба БЕУСЛОВНО — до-000011 draw-путь не связан с
// готовностью спрайтов; «геометрическая фигура» рисуется под
// нарисованным спрайтом героя. Ожидаем 0 вершин PLAYER_COLOR,
// получаем 6.

test('RM-2: ready-кадр: спрайт героя в кадре И 0 вершин PLAYER_COLOR в WebGL-кадре — legacy-ромба нет, герой ровно 1×, без «фигуры» (000176)', async () => {
  const h = await boot();
  assertReady(h);
  const f = frameAt(h, NOW + 200);
  assert.equal(heroDraws(f.draw).length, 1,
    'сценарий: спрайт героя в кадре (ready-состояние)');
  const got = countColor(h.glCalls, PLAYER_COLOR);
  assert.equal(got, 0,
    'герой нарисован спрайтом → legacy-ромба НЕТ (XOR): '
    + '0 вершин PLAYER_COLOR, получено ' + got);
});

// --- RM-3 (КРАСНЫЙ): нет дублирования — 0 fallback-геометрии ---
//
// Почему красен (master 3d5bac4): buildFrame src/main.js L2260–2276
// пушает тайл-квады ВСЕХ видимых тайлов + маркеры БЕУСЛОВНО —
// «дублируется отрисовка» под готовым спрайт-слоем (спавн-кадр:
// 1242 вершины, ~358k при обзорном зуме). Ожидаем 0.

test('RM-3: ready-кадр — 0 вершин fallback-геометрии в WebGL-кадре (ни тайл-квадов, ни маркеров, ни ромба): мир рисует ОДИН слой (000176)', async () => {
  const h = await boot();
  assertReady(h);
  const f = frameAt(h, NOW + 200);
  assert.ok(drawImages(f.draw).length > 0,
    'сценарий: спрайт-слой нарисован (ready-состояние)');
  const got = totalVerts(h.glCalls);
  assert.equal(got, 0,
    'готовый спрайт-слой → 0 вершин в WebGL-кадре (нет дубля), '
    + 'получено ' + got);
});

// --- RM-4 (ГАУАРД): фолбэк 000011 — cold-лоадер → полный WebGL-кадр ---
//
// Контракт 000011 (сохранён 000176): элемент без готового спрайта →
// его legacy-фигура; лоадер весь down → legacy-сцена ПОЛНАЯ
// (цветные тайлы/маркеры/ромб), герой не пропадает, игра не падает.

test('RM-4: фолбэк 000011: НИЧЕГО не загрузилось → спрайт-слой пуст (0 drawImage), WebGL-кадр полон: 6 вершин PLAYER_COLOR (ромб героя) + тайл-квады (000176)', async () => {
  const h = await boot(() => true); // ВСЕ ассеты onerror (map.png — всегда)
  const s = h.sandbox.__game.state.sprites;
  assert.ok(s.total > 0, 'сценарий: лоадер с очередью');
  assert.equal(s.ready, 0, 'сценарий: ничего не загрузилось (cold)');
  const f = frameAt(h, NOW + 200);
  assert.equal(drawImages(f.draw).length, 0,
    'спрайт-слой пуст (readyCount()===0 → early return)');
  assert.equal(countColor(h.glCalls, PLAYER_COLOR), 6,
    'герой не пропадает: ромб = фолбэк (ровно 6 вершин)');
  assert.ok(tileVerts(h.glCalls) > 0,
    'тайл-квады в кадре (legacy-сцена полна, а не тёмный фон)');
});

// --- RM-5 (ГАУАРД): фолбэк героя — упал ТОЛЬКО phlogiston-спрайт ---

test('RM-5: фолбэк героя: упал ТОЛЬКО phlogiston-спрайт (остальные ready) → 0 drawImage героя, ровно 6 вершин PLAYER_COLOR (фигура = фолбэк, не пропажа), тайл-текстуры на месте (000176)', async () => {
  const h = await boot(
    (v) => v.startsWith('assets/sprites/phlogiston/'));
  const s = h.sandbox.__game.state.sprites;
  assert.ok(s.ready > 0, 'сценарий: ОСТАЛЬНЫЕ ассеты ready (частный сбой)');
  assert.equal(s.total - s.ready, 8,
    'сценарий: упали ровно 8 кадров phlogiston '
    + '(assets/sprites/phlogiston, пин tests/sprites.test.js)');
  const f = frameAt(h, NOW + 200);
  assert.equal(heroDraws(f.draw).length, 0,
    'спрайт героя не загрузился → drawImage героя НЕТ');
  assert.equal(countColor(h.glCalls, PLAYER_COLOR), 6,
    'герой ВИДЕН как фолбэк-ромб (ровно 6 вершин — не пропажа)');
  assert.ok(tileDraws(f.draw).length > 0,
    'тайл-текстуры в кадре (упал только спрайт героя)');
});

// --- RM-6 (ГАУАРД): одна линия отрисовки — 1 rAF + 1 clearRect ---

test('RM-6: одна линия отрисовки: на кадр ровно 1 rAF-планирование и ровно 1 clearRect(#sprites) — дублирующего цикла нет (000176)', async () => {
  const h = await boot();
  assertReady(h);
  let now = NOW;
  for (let i = 0; i < 3; i++) {
    now += 200;
    const f = frameAt(h, now);
    assert.equal(f.raf, 1,
      'кадр ' + (i + 1) + ': ровно 1 rAF запланировано (единый цикл)');
    assert.equal(clearRects(f.draw).length, 1,
      'кадр ' + (i + 1) + ': ровно 1 clearRect(#sprites)');
  }
});

// --- RM-7 (КРАСНЫЙ): прол закрыт — маркер исчезает с победой ---
//
// Почему красен (master 3d5bac4): buildFrame src/main.js L2274–2275
// пушит красный маркер по hasMobGroup БЕЗ учёта G.groupVisible/
// defeatedAt (000122 скрывает поверженную группу ТОЛЬКО в
// спрайт-слое) — после победы «геометрическая фигура» (красный
// квадрат) остаётся на тайле. Ожидаем 0 вершин MOB_COLOR на тайле
// (1,0), получаем 6.
//
// Анти-вакуумность: ДО боя спрайты групп в кадре (группа (1,0)
// видимая; на master до фикса там же рисовался и legacy-маркер —
// 6 вершин, «прол»); ПОСЛЕ боя герой стоит на (1,0) и спрайт героя
// в кадре (1×) → тайл (1,0) в frameTiles и кадр штатный — асерт «0»
// не проходит «потому что тайл вне кадра».

test('RM-7: e2e: победа над видимой группой (1,0) → в кадре 0 вершин MOB_COLOR на её тайле (прол закрыт, groupVisible-паритет со спрайт-слоем) (000176)', async () => {
  const h = await boot();
  assertReady(h);
  const G = h.sandbox.Game;
  const myMap = G.createMap(G.generateSeedPixels());
  assert.ok(myMap.tileAt(1, 0).hasMobGroup,
    'сценарий: (1,0) — тайл группы (спавн-мир)');
  assert.equal(myMap.tileAt(1, 0).mobGroup, 2,
    'сценарий: (1,0) — логово скелетов (g2)');

  // До боя: группа ВИДИМА — спрайт-слой рисует спрайты групп ((1,0)
  // в кадре). Ready-спрайт → legacy-маркера НЕТ (XOR, RM-3); на
  // master (красная стадия) здесь было 6 вершин — сам «прол», который
  // тест закрывает.
  const f0 = frameAt(h, NOW + 200);
  assert.ok(mobDraws(f0.draw).length >= 1,
    'сценарий: спрайт-слой рисует спрайты групп ((1,0) в кадре)');
  assert.equal(markerVerts(h.glCalls, MOB_COLOR, 1, 0), 0,
    'сценарий: ready-спрайт → legacy-маркера нет (на master — 6, прол)');

  // Бой НА тайле (1,0) (паттерн mob-zones-e2e Z3b) → победа.
  const walk = makeWalker(h);
  const now = walk(1, 0); // (0,0)→(1,0): шаг на тайл группы → бой
  assert.equal(G.combatUI.isActive(), true,
    'сценарий: бой на тайле группы начался');
  resolveCombatVictory(G, G.combatUI.current(), 'бой на тайле');
  assert.equal(h.sandbox.__game.state.player.x, 1,
    'сценарий: герой на (1,0) — x');
  assert.equal(h.sandbox.__game.state.player.y, 0,
    'сценарий: герой на (1,0) — y');

  // Кадр ПОСЛЕ победы: спрайт-слой скрывает поверженную группу
  // (000122 — groupVisible), кадр штатный (герой на тайле — его
  // спрайт в кадре 1×); legacy-маркер обязан исчезнуть.
  const f1 = frameAt(h, now + 200);
  assert.equal(heroDraws(f1.draw).length, 1,
    'сценарий: кадр штатный (спрайт героя 1× на поверженном тайле)');
  const got = markerVerts(h.glCalls, MOB_COLOR, 1, 0);
  assert.equal(got, 0,
    'после победы — красного маркера на (1,0) НЕТ (прол закрыт): '
    + '0 вершин MOB_COLOR, получено ' + got);
});

// --- RM-8 (ГАУАРД, ревью 000176): деградация без sprites.js ---
//
// Контракт §4 (memory/000176-global-map-single-pass.md): spriteLoader
// null (нет sprites.js в цепочке — G.createSpriteLoader и
// G.buildingSprite/citySprite/campSprite отсутствуют) → все селекторы
// готовности возвращают null → legacy-сцена рисуется ПОЛНОСТЬЮ, игра
// НЕ падает. До правки по ревью buildingAsset был БЕЗ гарда
// `if (!spriteLoader) return null;` (G.buildingSprite определён только
// в sprites.js) — первый кадр спавн-мира (постройки в видимой области)
// бросал TypeError в buildingAsset → buildFrame → frame, rAF-цикл
// умирал, игра замораживалась (регрессия: до 000176 buildingSprite
// вызывался только в drawSprites за early-return при null-loадере).

test('RM-8: деградация: цепочка БЕЗ sprites.js (spriteLoader null) → frame() не бросает, rAF жив, legacy-сцена полна: 6 вершин PLAYER_COLOR + тайл-квады + маркеры построек/групп (000176)', async () => {
  const h = await boot(null, CHAIN.filter((f) => f !== 'sprites.js'));
  assert.equal(h.sandbox.__game.state.sprites, null,
    'сценарий: спрайт-лоадер не создан (нет sprites.js в цепочке)');
  const f = frameAt(h, NOW + 200); // без фикса — TypeError здесь
  assert.equal(h.errors.length, 0, 'деградация тихая: ошибок нет');
  assert.equal(f.raf, 1,
    'rAF-цикл жив: кадр запланировал следующий (игра не заморожена)');
  assert.equal(drawImages(f.draw).length, 0,
    'спрайт-слой пуст (early return drawSprites при null-loадере)');
  assert.equal(countColor(h.glCalls, PLAYER_COLOR), 6,
    'герой не пропадает: legacy-ромб (ровно 6 вершин)');
  assert.ok(tileVerts(h.glCalls) > 0,
    'тайл-квады в кадре (legacy-сцена полна, а не тёмный фон)');
  assert.ok(countColor(h.glCalls, BUILDING_COLOR) > 0,
    'маркеры построек в кадре (спавн-мир содержит постройки)');
  assert.ok(countColor(h.glCalls, MOB_COLOR) > 0,
    'маркеры групп в кадре (спавн-мир содержит группы, см. RM-7)');
});

// --- RM-9 (ГАУАРД, 000183): смешанное частичное состояние загрузки
// — ПЕР-ЭЛЕМЕНТНЫЙ фолбэк (XOR-контракт 000176 на уровне ЭЛЕМЕНТА,
// а не «всё/ничего»): отсутствующий ассет → его legacy-фигура в
// WebGL-буфере, ОСТАЛЬНЫЙ кадр интактен (спрайт-слой рисует всё
// готовое). Расширяет RM-4 (all-failed) и RM-5 (только герой):
// три субфазы — тайл / моб / постройка. Числа не хардкодим —
// эталонный boot даёт baseline-счёты того же детерминированного
// спавн-кадра. ---

test('RM-9: смешанное частичное состояние загрузки: пер-элементный фолбэк (тайл/моб/постройка) — упавший ассет → его WebGL-фигура, остальное кадра интактно (000176/000183)', async () => {
  // (0) Эталонный boot — baseline-счёты спавн-кадра.
  const hb = await boot();
  assertReady(hb);
  const fb = frameAt(hb, NOW + 200);
  const G = hb.sandbox.Game;
  const myMap = G.createMap(G.generateSeedPixels());
  const buildingDraws = (draw) => drawImages(draw).filter(
    (c) => assetOf(c).startsWith('assets/sprites/buildings/'));
  const N_tile = tileDraws(fb.draw).length;
  const N_mob = mobDraws(fb.draw).length;
  const N_bld = buildingDraws(fb.draw).length;
  assert.ok(N_tile > 0 && N_mob >= 1 && N_bld >= 1,
    'сценарий: спавн-кадр с тайлами/мобами/постройками');
  const stb = hb.sandbox.__game.state;

  // (a) ТАЙЛ: упала текстура с максимальным числом draw.
  {
    const paths = {};
    for (const c of tileDraws(fb.draw)) {
      const p = assetOf(c);
      paths[p] = (paths[p] || 0) + 1;
    }
    let pMax = null;
    for (const [p, n] of Object.entries(paths))
      if (pMax === null || n > paths[pMax]) pMax = p;
    const nMax = paths[pMax];
    const h = await boot((v) => v === pMax);
    const f = frameAt(h, NOW + 200);
    assert.equal(tileDraws(f.draw).length, N_tile - nMax,
      '(a) тайл: нет только упавшей текстуры (' + (N_tile - nMax)
      + ' из ' + N_tile + ')');
    assert.ok(tileVerts(h.glCalls) > 0,
      '(a) тайл: упавший тайл → legacy-квад (цвет TERRAIN) в WebGL-кадре');
    assert.equal(countColor(h.glCalls, MOB_COLOR), 0,
      '(a) моб: спрайты ready → маркеров MOB_COLOR нет (XOR)');
    assert.equal(countColor(h.glCalls, BUILDING_COLOR), 0,
      '(a) постройка: спрайты ready → маркеров BUILDING_COLOR нет (XOR)');
    assert.equal(countColor(h.glCalls, PLAYER_COLOR), 0,
      '(a) герой: спрайт ready → legacy-ромба нет (XOR)');
    assert.equal(heroDraws(f.draw).length, 1, '(a) герой: 1×');
    assert.equal(mobDraws(f.draw).length, N_mob, '(a) моб: интактен');
    assert.equal(buildingDraws(f.draw).length, N_bld, '(a) постройка: интактна');
  }

  // (b) МОБ: упал спрайт группы на тайле (2,3) (g4 — единственный
  // тайл этого вида в видимом диапазоне, пин сценарного мира).
  {
    assert.equal(myMap.tileAt(2, 3).mobGroup, 4,
      'сценарий: (2,3) — паучье гнездо (g4)');
    const p = G.worldToScreen(2, 3, stb.cam.x, stb.cam.y, stb.zoom,
      VIEW_W, VIEW_H);
    const ax = p.x - stb.zoom * 0.1, ay = p.y - stb.zoom * 0.15;
    const ds = mobDraws(fb.draw).filter((c) =>
      Math.abs(c[1][1] - ax) < 1e-6 && Math.abs(c[1][2] - ay) < 1e-6);
    assert.equal(ds.length, 1, 'сценарий: группа (2,3) в baseline-кадре');
    const prefix = assetOf(ds[0]).replace(/_\d+\.svg$/, '_');
    assert.equal(mobDraws(fb.draw).filter((c) => assetOf(c).startsWith(prefix)).length,
      1, 'сценарий: вид группы (2,3) уникален в видимом диапазоне');
    const h = await boot((v) => v.indexOf(prefix) === 0);
    const f = frameAt(h, NOW + 200);
    assert.equal(mobDraws(f.draw).length, N_mob - 1,
      '(b) моб: нет только упавшего спрайта (' + (N_mob - 1)
      + ' из ' + N_mob + ')');
    assert.equal(countColor(h.glCalls, MOB_COLOR), 6,
      '(b) моб: упавшая группа → ровно ОДИН legacy-квад (6 вершин)');
    assert.equal(markerVerts(h.glCalls, MOB_COLOR, 2, 3), 6,
      '(b) моб: маркер — на тайле группы (2,3)');
    assert.equal(tileDraws(f.draw).length, N_tile, '(b) тайл: интактен');
    assert.equal(buildingDraws(f.draw).length, N_bld, '(b) постройка: интактна');
    assert.equal(heroDraws(f.draw).length, 1, '(b) герой: 1×');
    assert.equal(tileVerts(h.glCalls), 0,
      '(b) тайл: все ready → 0 тайл-квадов');
    assert.equal(countColor(h.glCalls, BUILDING_COLOR), 0,
      '(b) постройка: ready → маркеров нет (XOR)');
  }

  // (c) ПОСТРОЙКА: упал спрайт первой постройки кадра (якорь —
  // обратная проекция drawImage-аргумента; сценарий требует 1×1 —
  // маркерный квад ровно один).
  {
    const bds = buildingDraws(fb.draw);
    const bd = bds[0];
    const wx = stb.cam.x + (bd[1][1] - VIEW_W / 2) / stb.zoom;
    const wy = stb.cam.y + (bd[1][2] - VIEW_H / 2) / stb.zoom;
    const ax = Math.round(wx), ay = Math.round(wy);
    assert.ok(Math.abs(wx - ax) + Math.abs(wy - ay) < 1e-3,
      'сценарий: якорь постройки — целочисленный тайл');
    // Footprint — из myMap (маркер на КАЖДЫЙ тайл footprint'а;
    // 1×1 → ровно 6 вершин).
    let foot = 0;
    const range = G.visibleTileRange(stb.cam.x, stb.cam.y, VIEW_W, VIEW_H, stb.zoom);
    for (let ty = range.y0; ty <= range.y1; ty++) {
      for (let tx = range.x0; tx <= range.x1; tx++) {
        const t = myMap.tileAt(tx, ty);
        if (t.inBuilding && t.buildingAnchor
            && t.buildingAnchor[0] === ax && t.buildingAnchor[1] === ay) foot++;
      }
    }
    assert.equal(foot, 1,
      'сценарий: выбранная постройка 1×1 (один маркерный квад)');
    const pFile = assetOf(bd);
    assert.equal(bds.filter((c) => assetOf(c) === pFile).length, 1,
      'сценарий: ассет постройки уникален в кадре');
    const h = await boot((v) => v === pFile);
    const f = frameAt(h, NOW + 200);
    assert.equal(buildingDraws(f.draw).length, N_bld - 1,
      '(c) постройка: нет только упавшего спрайта (' + (N_bld - 1)
      + ' из ' + N_bld + ')');
    assert.equal(countColor(h.glCalls, BUILDING_COLOR), 6,
      '(c) постройка: упавшая постройка → ровно ОДИН legacy-квад (6 вершин)');
    assert.equal(markerVerts(h.glCalls, BUILDING_COLOR, ax, ay), 6,
      '(c) постройка: маркер — на якоря (' + ax + ',' + ay + ')');
    assert.equal(tileDraws(f.draw).length, N_tile, '(c) тайл: интактен');
    assert.equal(mobDraws(f.draw).length, N_mob, '(c) моб: интактен');
    assert.equal(heroDraws(f.draw).length, 1, '(c) герой: 1×');
    assert.equal(tileVerts(h.glCalls), 0,
      '(c) тайл: все ready → 0 тайл-квадов');
    assert.equal(countColor(h.glCalls, MOB_COLOR), 0,
      '(c) моб: ready → маркеров нет (XOR)');
  }
});

// --- RM-10 (ГАУАРД, 000183): перфоманс-заявка ТЗ при обзорном зуме
// (худший случай постмортема 000176: ~358k вершин при ZOOM_MIN на
// до-фикс коде): на ZOOM_MIN WebGL-буфер ПУСТ (0 вершин, проход
// выполнен: 1 bufferData + 1 drawArrays count 0), 2d-проход
// интактен (тайлов нарисовано БОЛЬШЕ, чем при спавн-зуме) ---

test('RM-10: обзорный зум (ZOOM_MIN): WebGL-буфер пуст (0 вершин, проход выполнен), 2d-проход интактен (000176/000183)', async () => {
  const h = await boot();
  assertReady(h);
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  const f0 = frameAt(h, NOW + 200);
  const N_tile = tileDraws(f0.draw).length;
  assert.ok(N_tile > 0, 'сценарий: спавн-кадр с тайлами');
  assert.equal(g.state.zoom, G.ZOOM_START, 'сценарий: старт на ZOOM_START');
  // 22 wheel-outs: zoom = ZOOM_START · (1/1.2)^22 — клэмпа в
  // ZOOM_MIN (main.js: Math.max(G.ZOOM_MIN, …)).
  const wheel = (h.gameCanvas.listeners['wheel'] || [])[0];
  assert.ok(typeof wheel === 'function',
    'сценарий: wheel-обработчик на #game');
  for (let i = 0; i < 22; i++) wheel({ deltaY: 100, preventDefault() {} });
  assert.equal(g.state.zoom, G.ZOOM_MIN,
    'зум заклампирован в ZOOM_MIN (обзорный зум, худший случай постмортема)');
  // Кадр при обзорном зуме: WebGL-проход выполнен, но ПУСТ (steady
  // state: все спрайты ready при ЛЮБОМ зуме — гейты по готовности,
  // не по зуму); 2d-проход рисует весь видимый мир.
  const f = frameAt(h, NOW + 400);
  assert.equal(totalVerts(h.glCalls), 0,
    'ZOOM_MIN: 0 вершин в WebGL-буфере (нет дубля при обзорном зуме)');
  const bds = bufferDataOf(h.glCalls);
  assert.equal(bds.length, 1,
    'ZOOM_MIN: ровно 1 bufferData на кадр (проход выполнен, не пропущен)');
  assert.equal(bds[0].length, 0, 'ZOOM_MIN: буфер пуст (0 floats)');
  const da = h.glCalls.filter((c) => c.fn === 'drawArrays');
  assert.equal(da.length, 1, 'ZOOM_MIN: ровно 1 drawArrays на кадр');
  assert.equal(da[0].count, 0, 'ZOOM_MIN: drawArrays count = 0');
  assert.ok(tileDraws(f.draw).length > N_tile,
    '2d-проход интактен: тайлов при обзорном зуме БОЛЬШЕ ('
    + tileDraws(f.draw).length + ' > ' + N_tile + ')');
  assert.equal(heroDraws(f.draw).length, 1, 'герой: 1× (спрайт-слой)');
});

// --- RM-BA (Задача 000224, СТАДИЯ КРАСНЫХ ТЕСТОВ): анимированные
// элементы зданий — кадр-свитч на глобальной карте.
//
// Контракты: memory/000224-building-anim-overlays.md
//   * buildingAsset(rec, now) — анимированный слот (3/5) берёт ТЕКУЩИЙ
//     КАДР из G.buildingFrames(slot) строго (без fallback на базу);
//     кадр не загрузился → legacy-маркер (гейт buildFrame) + skip
//     (проход 2) — СТРОГАЯ готовность (прецедент воды);
//   * оба потребителя (гейт buildFrame, проход 2 drawSprites)
//     получают now ОДНОГО кадра (XOR-паритет 000176);
//   * кадр = f(now, x, y) (buildingFrameIndex, BUILDING_FRAME_MS = 800)
//     — детерминизм (D10: два рендера на одном now идентичны).
//
// КРАСНЫЕ (падают на ТЕКУЩЕМ коде, осмысленно — экспорты
// buildingFrames/buildingFrameIndex/BUILDING_FRAME_MS отсутствуют
// в sprites.js):
//   RM-BA-1: анимированная постройка (слот 3/5) пешком достижима —
//            в кадре на её якоря drawImage КАДРА (не статичной базы),
//            rec.w×rec.h × zoom; кадр через 800 мс — ДРУГОЙ (анимация
//            видна); герой/тайлы/мобы интактны; errors 0.
//   RM-BA-2: СТРОГАЯ готовность — отклонён ТЕКУЩИЙ кадр постройки →
//            legacy-маркер (6 вершин) на якоря и СПРАЙТА нет (fallback
//            на статичную базу ЗАПРЕЩЁН — база загрузилась!);
//            остальной кадр интактен (RM-9(c) XOR).
//
// Сценарий: BFS от спавна (0,0) до входа ближайшей анимированной
// постройки (слот 3/5) по проходимым тайлам, ИСКЛЮЧАЯ группы мобов,
// входы пещер (maybeEnterDungeon) и входы городов (maybeEnterCity —
// затянет игрока в город посреди пути). Мир — тот же детерминированный
// G.generateSeedPixels (map.png в стабе ВСЕГДА onerror).

// BFS: вход ближайшей анимированной постройки (слот 3/5) от (sx, sy).
// Возврат: { target: {x, y, tile}, steps: [{x, y}…] (без старта),
// slot } | null (не найдена в пределах cap).
function findNearestAnimated(G, myMap, sx, sy, cap) {
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const visited = new Set([sx + ',' + sy]);
  const prev = new Map();
  let frontier = [{ x: sx, y: sy }];
  let depth = 0;
  let found = null;
  while (frontier.length && depth < cap && !found) {
    const next = [];
    for (const t of frontier) {
      for (const [dx, dy] of DIRS) {
        const x = t.x + dx, y = t.y + dy;
        const k = x + ',' + y;
        if (visited.has(k)) continue;
        const tile = myMap.tileAt(x, y);
        const cityEntrance = tile.isEntrance
          && tile.building === G.BUILDING_TYPES.NONE
          && tile.buildingId != null;
        const caveEntrance = tile.hasBuilding
          && tile.building === G.BUILDING_TYPES.CAVE_ENTRANCE;
        const isGoal = tile.isEntrance
          && (tile.building === G.BUILDING_TYPES.BLACKSMITH
              || tile.building === G.BUILDING_TYPES.MAGIC_SHOP)
          && !tile.hasMobGroup;
        if (isGoal) {
          visited.add(k);
          prev.set(k, t);
          found = { x, y, tile };
          break;
        }
        if (!tile.passable || tile.hasMobGroup || caveEntrance
            || cityEntrance) continue;
        visited.add(k);
        prev.set(k, t);
        next.push({ x, y });
      }
      if (found) break;
    }
    frontier = next;
    depth++;
  }
  if (!found) return null;
  const steps = [];
  let cur = { x: found.x, y: found.y };
  while (!(cur.x === sx && cur.y === sy)) {
    steps.unshift(cur);
    cur = prev.get(cur.x + ',' + cur.y);
  }
  return { target: found, steps, slot: found.tile.building };
}

// Ходьба ПО МАРШРУТУ (как makeWalker, но: бой зоны (000135)
// авторешается (победа → Space — боевая панель замораживает
// игрока), guard кадра щедрый — 40). now — монотонный (+200 мс).
function makeRouteWalker(h) {
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  let now = NOW;
  return function walkStep(tx, ty) {
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
      if (G.combatUI.isActive()) {
        resolveCombatVictory(G, G.combatUI.current(), 'RM-BA');
      }
    } while ((g.state.player.x !== tx || g.state.player.y !== ty)
      && ++guard < 40);
    keyup(h, code);
    assert.ok(g.state.player.x === tx && g.state.player.y === ty,
      'сценарий: игрок перешёл на (' + tx + ',' + ty + ')');
    for (let i = 0; i < 4; i++) { now += 200; frameAt(h, now); }
    return now;
  };
}

test('RM-BA-1 (Задача 000224, RED): анимированная постройка (слот 3/5) — на её якоря drawImage КАДРА (не статичная база), rec.w×rec.h × zoom; через 800 мс кадр ДРУГОЙ (анимация видна); герой 1×; errors 0', async () => {
  const h = await boot();
  assertReady(h);
  const G = h.sandbox.Game;
  // Предусловия — контракты кадров (отсутствуют в sprites.js сейчас).
  assert.equal(typeof G.buildingFrames, 'function',
    'sprites.js: экспорт buildingFrames(slot) — отсутствует (Задача 000224)');
  assert.equal(typeof G.buildingFrameIndex, 'function',
    'sprites.js: экспорт buildingFrameIndex(nowMs, tx, ty, n) — отсутствует (Задача 000224)');
  assert.equal(G.BUILDING_FRAME_MS, 800,
    'sprites.js: BUILDING_FRAME_MS = 800 — отсутствует (Задача 000224)');
  const myMap = G.createMap(G.generateSeedPixels());
  const sc = findNearestAnimated(G, myMap, 0, 0, 400);
  assert.ok(sc, 'сценарий: анимированная постройка (слот 3/5) пешком достижима от спавна');
  const rec = myMap.buildingAt(sc.target.x, sc.target.y);
  assert.equal(rec.type, sc.slot,
    'сценарий: buildingAt(якорь) — та же постройка (слот ' + sc.slot + ')');
  assert.equal(rec.w * rec.h, 1, 'сценарий: анимированная постройка 1×1 (один маркерный квад)');
  let now = NOW;
  const walker = makeRouteWalker(h);
  for (const st of sc.steps) now = walker(st.x, st.y);
  const f1 = frameAt(h, now + 200);
  const st1 = h.sandbox.__game.state;
  const p = G.worldToScreen(rec.x, rec.y, st1.cam.x, st1.cam.y,
    st1.zoom, VIEW_W, VIEW_H);
  const bds = drawImages(f1.draw).filter(
    (c) => assetOf(c).startsWith('assets/sprites/buildings/'));
  const hit = bds.find((c) =>
    Math.abs(c[1][1] - p.x) <= 1e-6 && Math.abs(c[1][2] - p.y) <= 1e-6
    && Math.abs(c[1][3] - rec.w * st1.zoom) <= 1e-6
    && Math.abs(c[1][4] - rec.h * st1.zoom) <= 1e-6);
  assert.ok(hit,
    'анимированная постройка — спрайт на якоря (' + rec.x + ',' + rec.y + ') '
    + 'размером rec.w×rec.h × zoom; building-drawImage в кадре: '
    + bds.map((c) => assetOf(c)).join(', ') || '0');
  const frames = G.buildingFrames(rec.type);
  assert.ok(Array.isArray(frames) && frames.length >= 2,
    'buildingFrames(слот) — таблица кадров');
  assert.ok(frames.includes(assetOf(hit)),
    'нарисованный спрайт — КАДР таблицы (' + assetOf(hit) + '), '
    + 'а не статичная база');
  assert.notEqual(assetOf(hit), G.buildingSprite(rec.type),
    'нарисованный спрайт ≠ статичной базе (' + G.buildingSprite(rec.type) + ')');
  assert.equal(tileVerts(h.glCalls), 0, 'тайлы: все ready → 0 тайл-квадов');
  assert.equal(countColor(h.glCalls, BUILDING_COLOR), 0,
    'постройки ready → маркеров BUILDING_COLOR нет (XOR)');
  assert.equal(countColor(h.glCalls, PLAYER_COLOR), 0,
    'герой ready → legacy-ромба нет (XOR)');
  assert.equal(heroDraws(f1.draw).length, 1, 'герой: 1× (спрайт-слой)');
  // +800 мс (один BUILDING_FRAME_MS) — кадр сменился (анимация видна).
  const f2 = frameAt(h, now + 1000);
  const st2 = h.sandbox.__game.state;
  const p2 = G.worldToScreen(rec.x, rec.y, st2.cam.x, st2.cam.y,
    st2.zoom, VIEW_W, VIEW_H);
  const bds2 = drawImages(f2.draw).filter(
    (c) => assetOf(c).startsWith('assets/sprites/buildings/'));
  const hit2 = bds2.find((c) =>
    Math.abs(c[1][1] - p2.x) <= 1e-6 && Math.abs(c[1][2] - p2.y) <= 1e-6
    && Math.abs(c[1][3] - rec.w * st2.zoom) <= 1e-6
    && Math.abs(c[1][4] - rec.h * st2.zoom) <= 1e-6);
  assert.ok(hit2, 'постройка по-прежнему нарисована через 800 мс');
  assert.ok(frames.includes(assetOf(hit2)),
    'через 800 мс — тоже кадр таблицы (' + assetOf(hit2) + ')');
  assert.notEqual(assetOf(hit2), assetOf(hit),
    'через 800 мс кадр ДРУГОЙ (анимация видна): ' + assetOf(hit)
    + ' → ' + assetOf(hit2));
  assert.equal(h.errors.length, 0, 'ошибок нет: ' + h.errors.join('; '));
});

test('RM-BA-2 (Задача 000224, RED): строгая готовность — отклонён ТЕКУЩИЙ кадр анимированной постройки → legacy-маркер (6 вершин) на якоря, СПРАЙТА нет (fallback на статичную базу ЗАПРЕЩЁН — база загрузилась); остальной кадр интактен (RM-9(c) XOR)', async () => {
  // (0) Эталонный boot: ходьба к анимированной постройке, baseline-кадр.
  const hb = await boot();
  assertReady(hb);
  const G = hb.sandbox.Game;
  assert.equal(typeof G.buildingFrames, 'function',
    'sprites.js: экспорт buildingFrames(slot) — отсутствует (Задача 000224)');
  assert.equal(typeof G.buildingFrameIndex, 'function',
    'sprites.js: экспорт buildingFrameIndex(nowMs, tx, ty, n) — отсутствует (Задача 000224)');
  const myMap = G.createMap(G.generateSeedPixels());
  const sc = findNearestAnimated(G, myMap, 0, 0, 400);
  assert.ok(sc, 'сценарий: анимированная постройка (слот 3/5) пешком достижима');
  const rec = myMap.buildingAt(sc.target.x, sc.target.y);
  const ax = rec.x, ay = rec.y;
  let now0 = NOW;
  {
    const walker = makeRouteWalker(hb);
    for (const st of sc.steps) now0 = walker(st.x, st.y);
  }
  const now1 = now0 + 200;
  const fb = frameAt(hb, now1);
  const buildingDraws = (draw) => drawImages(draw).filter(
    (c) => assetOf(c).startsWith('assets/sprites/buildings/'));
  const frames = G.buildingFrames(rec.type);
  assert.ok(Array.isArray(frames) && frames.length >= 2,
    'buildingFrames(слот) — таблица кадров');
  const active = frames[G.buildingFrameIndex(now1, ax, ay, frames.length)];
  assert.ok(frames.includes(active), 'текущий кадр — из таблицы');
  const N_bld = buildingDraws(fb.draw).length;
  const K = buildingDraws(fb.draw).filter(
    (c) => assetOf(c) === active).length;
  assert.ok(K >= 1,
    'baseline-кадр: постройка с текущим кадром нарисована (K=' + K + ')');
  const N_tile = tileDraws(fb.draw).length;
  const N_mob = mobDraws(fb.draw).length;
  assert.ok(N_tile > 0, 'сценарий: кадр с тайлами');
  assert.equal(heroDraws(fb.draw).length, 1, 'герой: 1×');
  assert.equal(countColor(hb.glCalls, BUILDING_COLOR), 0,
    'baseline: постройки ready → маркеров нет (XOR)');
  // (1) Reject ТОЛЬКО текущего кадра (база загрузилась — fallback
  // искушает, но запрещён: строгая семантика, прецедент воды).
  const h = await boot((v) => v === active);
  let now1b = NOW;
  {
    const walker = makeRouteWalker(h);
    for (const st of sc.steps) now1b = walker(st.x, st.y);
  }
  assert.equal(now1b, now0,
    'детерминизм: ходьба (тот же мир/входы) завершается в тот же now');
  const f = frameAt(h, now1);
  const st = h.sandbox.__game.state;
  const p = G.worldToScreen(ax, ay, st.cam.x, st.cam.y, st.zoom,
    VIEW_W, VIEW_H);
  const atAnchor = buildingDraws(f.draw).filter((c) =>
    Math.abs(c[1][1] - p.x) <= 1e-6 && Math.abs(c[1][2] - p.y) <= 1e-6);
  assert.equal(atAnchor.length, 0,
    'отклонённый кадр — на якоря (' + ax + ',' + ay + ') building-спрайта НЕТ '
    + '(fallback на статичную базу запрещён: строгая готовность)');
  assert.equal(countColor(h.glCalls, BUILDING_COLOR), 6 * K,
    'каждая постройка, рисовавшая отклонённый кадр — legacy-маркер (6 вершин × K=' + K + ')');
  assert.equal(markerVerts(h.glCalls, BUILDING_COLOR, ax, ay), 6,
    'маркер — на якоря целевой постройки (' + ax + ',' + ay + ')');
  assert.equal(buildingDraws(f.draw).length, N_bld - K,
    'остальные постройки интактны (' + (N_bld - K) + ' из ' + N_bld + ')');
  assert.equal(tileDraws(f.draw).length, N_tile, 'тайлы: интактны');
  assert.equal(mobDraws(f.draw).length, N_mob, 'мобы: интактны');
  assert.equal(heroDraws(f.draw).length, 1, 'герой: 1×');
  assert.equal(tileVerts(h.glCalls), 0, 'тайлы: все ready → 0 тайл-квадов');
  assert.equal(countColor(h.glCalls, MOB_COLOR), 0,
    'мобы: ready → маркеров нет (XOR)');
  assert.equal(countColor(h.glCalls, PLAYER_COLOR), 0,
    'герой: ready → legacy-ромба нет (XOR)');
  assert.equal(h.errors.length, 0, 'ошибок нет: ' + h.errors.join('; '));
});

// --- RM-BA-3/4 + RM-CAMP-2 (Задача 000238, СТАДИЯ КРАСНЫХ ТЕСТОВ):
// расширение кадр-свитча (000224) на слоты 2/7 (Аптекарь/академия)
// и лагерь 47 (костёр; город 53 на карте — MV-C3/C4 в
// tests/main-visuals.test.js).
// Контракты: memory/000238-building-anim-extension.md (§3–§6):
//   * buildingAsset(rec, now) — строки BUILDING_FRAMES[2]/[7] →
//     ТЕКУЩИЙ КАДР buildingFrameIndex(now, rec.x, rec.y, 4);
//   * лагерь (rec.buildingId = 47, type = NONE) — КАДР
//     G.campFrames(47) — СВОЯ таблица, ключ — buildingId (не слот);
//   * строгая готовность: кадр не загрузился → legacy-маркер (6
//     вершин) + skip; FALLBACK НА СТАТИЧНУЮ БАЗУ ЗАПРЕЩЁН (прецедент
//     воды 000025);
//   * кадр = f(now, x, y) (D10), ОДИН now на кадр; typeof-гарды
//     (RM-8: старое sprites.js — тихая деградация).
//
// КРАСНЫЕ (падают на ТЕКУЩЕМ коде, осмысленно): строки
// BUILDING_FRAMES[2]/[7] отсутствуют (buildingFrames → null) и
// экспорт G.campFrames отсутствует (typeof 'undefined').
//
// Сценарные якоря (дет. мир, пробы memory/000238 §5): академия
// (3,−4) 1×1 — 7 шагов от спавна (ближайшая из слотов 2/7; аптекарь
// (2,−36) — 38); лагерь (−18,−12) 1×1 — 30 шагов (golden CP-6).

// BFS: вход ближайшей постройки слота 2/7 (Аптекарь/академия) от
// (sx, sy). Правила блокировки — 1:1 findNearestAnimated (группы
// мобов, входы пещер, входы городов).
function findNearestAnimated238(G, myMap, sx, sy, cap) {
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const visited = new Set([sx + ',' + sy]);
  const prev = new Map();
  let frontier = [{ x: sx, y: sy }];
  let depth = 0;
  let found = null;
  while (frontier.length && depth < cap && !found) {
    const next = [];
    for (const t of frontier) {
      for (const [dx, dy] of DIRS) {
        const x = t.x + dx, y = t.y + dy;
        const k = x + ',' + y;
        if (visited.has(k)) continue;
        const tile = myMap.tileAt(x, y);
        const cityEntrance = tile.isEntrance
          && tile.building === G.BUILDING_TYPES.NONE
          && tile.buildingId != null;
        const caveEntrance = tile.hasBuilding
          && tile.building === G.BUILDING_TYPES.CAVE_ENTRANCE;
        const isGoal = tile.isEntrance
          && (tile.building === G.BUILDING_TYPES.APOTHECARY
              || tile.building === G.BUILDING_TYPES.ACADEMY)
          && !tile.hasMobGroup;
        if (isGoal) {
          visited.add(k);
          prev.set(k, t);
          found = { x, y, tile };
          break;
        }
        if (!tile.passable || tile.hasMobGroup || caveEntrance
            || cityEntrance) continue;
        visited.add(k);
        prev.set(k, t);
        next.push({ x, y });
      }
      if (found) break;
    }
    frontier = next;
    depth++;
  }
  if (!found) return null;
  const steps = [];
  let cur = { x: found.x, y: found.y };
  while (!(cur.x === sx && cur.y === sy)) {
    steps.unshift(cur);
    cur = prev.get(cur.x + ',' + cur.y);
  }
  return { target: found, steps, slot: found.tile.building };
}

// BFS до ближайшего лагеря (hasBuilding && buildingId = 47) — 1:1
// findNearest tests/camp-map-e2e.test.js: ЦЕЛЬ проверяется ДО
// исключения (лагерь — NONE-вход, не промежуточный узел).
function findNearestCamp(G, myMap, sx, sy, cap) {
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const visited = new Set([sx + ',' + sy]);
  const prev = new Map();
  let frontier = [{ x: sx, y: sy }];
  let depth = 0;
  let found = null;
  while (frontier.length && depth < cap && !found) {
    const next = [];
    for (const t of frontier) {
      for (const [dx, dy] of DIRS) {
        const x = t.x + dx, y = t.y + dy;
        const k = x + ',' + y;
        if (visited.has(k)) continue;
        const tile = myMap.tileAt(x, y);
        if (!tile.passable || tile.hasMobGroup) continue;
        visited.add(k);
        prev.set(k, t);
        if (tile.hasBuilding && tile.buildingId === 47) {
          found = { x, y };
          break;
        }
        if (tile.hasBuilding
            && (tile.building === G.BUILDING_TYPES.CAVE_ENTRANCE
                || tile.building === G.BUILDING_TYPES.NONE)) continue;
        next.push({ x, y });
      }
      if (found) break;
    }
    frontier = next;
    depth++;
  }
  if (!found) return null;
  const steps = [];
  let cur = { x: found.x, y: found.y };
  while (!(cur.x === sx && cur.y === sy)) {
    steps.unshift(cur);
    cur = prev.get(cur.x + ',' + cur.y);
  }
  return { target: found, steps };
}

test('RM-BA-3 (Задача 000238, RED): Аптекарь/академия (слот 2/7) — на якоря drawImage КАДРА (не статичная база), rec.w×rec.h × zoom; через 800 мс кадр ДРУГОЙ; тот же now — идентично (D10); тайлы/мобы/герой интактны; errors 0', async () => {
  const h = await boot();
  assertReady(h);
  const G = h.sandbox.Game;
  assert.ok(Array.isArray(G.buildingFrames(G.BUILDING_TYPES.APOTHECARY))
      && G.buildingFrames(G.BUILDING_TYPES.APOTHECARY).length === 4,
    'строка BUILDING_FRAMES[2] (Аптекарь) — 4 кадра (Задача 000238)');
  assert.ok(Array.isArray(G.buildingFrames(G.BUILDING_TYPES.ACADEMY))
      && G.buildingFrames(G.BUILDING_TYPES.ACADEMY).length === 4,
    'строка BUILDING_FRAMES[7] (академия) — 4 кадра (Задача 000238)');
  const myMap = G.createMap(G.generateSeedPixels());
  const sc = findNearestAnimated238(G, myMap, 0, 0, 400);
  assert.ok(sc, 'сценарий: аптекарь/академия пешком достижима от спавна');
  assert.deepEqual({ x: sc.target.x, y: sc.target.y }, { x: 3, y: -4 },
    'сценарий: nearest — академия (3,−4) (если мир сместился — '
    + 'тест обязан упасть)');
  assert.equal(sc.steps.length, 7,
    'сценарий: 7 шагов от спавна (факт ' + sc.steps.length + ')');
  const rec = myMap.buildingAt(sc.target.x, sc.target.y);
  assert.equal(rec.type, sc.slot,
    'сценарий: buildingAt(якорь) — та же постройка (слот ' + sc.slot + ')');
  assert.equal(rec.w * rec.h, 1, 'сценарий: постройка 1×1 (один маркерный квад)');
  let now = NOW;
  const walker = makeRouteWalker(h);
  for (const st of sc.steps) now = walker(st.x, st.y);
  const f1 = frameAt(h, now + 200);
  const st1 = h.sandbox.__game.state;
  const p = G.worldToScreen(rec.x, rec.y, st1.cam.x, st1.cam.y,
    st1.zoom, VIEW_W, VIEW_H);
  const bds = drawImages(f1.draw).filter(
    (c) => assetOf(c).startsWith('assets/sprites/buildings/'));
  const hit = bds.find((c) =>
    Math.abs(c[1][1] - p.x) <= 1e-6 && Math.abs(c[1][2] - p.y) <= 1e-6
    && Math.abs(c[1][3] - rec.w * st1.zoom) <= 1e-6
    && Math.abs(c[1][4] - rec.h * st1.zoom) <= 1e-6);
  assert.ok(hit,
    'постройка слота 2/7 — спрайт на якоря (' + rec.x + ',' + rec.y + '); '
    + 'building-drawImage в кадре: '
    + bds.map((c) => assetOf(c)).join(', '));
  const frames = G.buildingFrames(rec.type);
  assert.ok(Array.from(frames).includes(assetOf(hit)),
    'нарисованный спрайт — КАДР таблицы (' + assetOf(hit)
    + '), а не статичная база');
  assert.notEqual(assetOf(hit), G.buildingSprite(rec.type),
    'нарисованный спрайт ≠ статичной базе (' + G.buildingSprite(rec.type) + ')');
  assert.equal(tileVerts(h.glCalls), 0, 'тайлы: все ready → 0 тайл-квадов');
  assert.equal(countColor(h.glCalls, BUILDING_COLOR), 0,
    'постройки ready → маркеров BUILDING_COLOR нет (XOR)');
  assert.equal(countColor(h.glCalls, PLAYER_COLOR), 0,
    'герой ready → legacy-ромба нет (XOR)');
  assert.equal(heroDraws(f1.draw).length, 1, 'герой: 1× (спрайт-слой)');
  const N_mob1 = mobDraws(f1.draw).length;
  // D10: повторный рендер на ТОМ ЖЕ now — идентичен (тот же кадр).
  const f1b = frameAt(h, now + 200);
  const st1b = h.sandbox.__game.state;
  const pb = G.worldToScreen(rec.x, rec.y, st1b.cam.x, st1b.cam.y,
    st1b.zoom, VIEW_W, VIEW_H);
  const bdsb = drawImages(f1b.draw).filter(
    (c) => assetOf(c).startsWith('assets/sprites/buildings/'));
  const hitb = bdsb.find((c) =>
    Math.abs(c[1][1] - pb.x) <= 1e-6 && Math.abs(c[1][2] - pb.y) <= 1e-6
    && Math.abs(c[1][3] - rec.w * st1b.zoom) <= 1e-6
    && Math.abs(c[1][4] - rec.h * st1b.zoom) <= 1e-6);
  assert.ok(hitb, 'D10: повторный рендер — постройка на месте');
  assert.equal(assetOf(hitb), assetOf(hit), 'D10: тот же now — тот же кадр');
  assert.equal(bdsb.length, bds.length,
    'D10: число building-draw не изменилось');
  // +800 мс (один BUILDING_FRAME_MS) — кадр сменился (анимация видна).
  const f2 = frameAt(h, now + 1000);
  const st2 = h.sandbox.__game.state;
  const p2 = G.worldToScreen(rec.x, rec.y, st2.cam.x, st2.cam.y,
    st2.zoom, VIEW_W, VIEW_H);
  const bds2 = drawImages(f2.draw).filter(
    (c) => assetOf(c).startsWith('assets/sprites/buildings/'));
  const hit2 = bds2.find((c) =>
    Math.abs(c[1][1] - p2.x) <= 1e-6 && Math.abs(c[1][2] - p2.y) <= 1e-6
    && Math.abs(c[1][3] - rec.w * st2.zoom) <= 1e-6
    && Math.abs(c[1][4] - rec.h * st2.zoom) <= 1e-6);
  assert.ok(hit2, 'постройка по-прежнему нарисована через 800 мс');
  assert.ok(Array.from(frames).includes(assetOf(hit2)),
    'через 800 мс — тоже кадр таблицы (' + assetOf(hit2) + ')');
  assert.notEqual(assetOf(hit2), assetOf(hit),
    'через 800 мс кадр ДРУГОЙ (анимация видна): ' + assetOf(hit)
    + ' → ' + assetOf(hit2));
  assert.equal(mobDraws(f2.draw).length, N_mob1, 'мобы: интактны');
  assert.equal(h.errors.length, 0, 'ошибок нет: ' + h.errors.join('; '));
});

test('RM-BA-4 (Задача 000238, RED): строгая готовность — отклонён ТЕКУЩИЙ кадр Аптекаря/академии (слот 2/7) → legacy-маркер (6 вершин) на якоря, СПРАЙТА нет (fallback на статичную базу ЗАПРЕЩЁН — база загрузилась); остальной кадр интактен (RM-9(c) XOR)', async () => {
  // (0) Эталонный boot: ходьба к постройке слота 2/7, baseline-кадр.
  const hb = await boot();
  assertReady(hb);
  const G = hb.sandbox.Game;
  assert.ok(Array.isArray(G.buildingFrames(G.BUILDING_TYPES.APOTHECARY))
      && G.buildingFrames(G.BUILDING_TYPES.APOTHECARY).length === 4,
    'строка BUILDING_FRAMES[2] (Аптекарь) — 4 кадра (Задача 000238)');
  assert.ok(Array.isArray(G.buildingFrames(G.BUILDING_TYPES.ACADEMY))
      && G.buildingFrames(G.BUILDING_TYPES.ACADEMY).length === 4,
    'строка BUILDING_FRAMES[7] (академия) — 4 кадра (Задача 000238)');
  const myMap = G.createMap(G.generateSeedPixels());
  const sc = findNearestAnimated238(G, myMap, 0, 0, 400);
  assert.ok(sc, 'сценарий: аптекарь/академия пешком достижима');
  assert.deepEqual({ x: sc.target.x, y: sc.target.y }, { x: 3, y: -4 },
    'сценарий: nearest — академия (3,−4) (дрейф мира — тест обязан упасть)');
  const rec = myMap.buildingAt(sc.target.x, sc.target.y);
  const ax = rec.x, ay = rec.y;
  let now0 = NOW;
  {
    const walker = makeRouteWalker(hb);
    for (const st of sc.steps) now0 = walker(st.x, st.y);
  }
  const now1 = now0 + 200;
  const fb = frameAt(hb, now1);
  const buildingDraws = (draw) => drawImages(draw).filter(
    (c) => assetOf(c).startsWith('assets/sprites/buildings/'));
  const frames = G.buildingFrames(rec.type);
  assert.ok(Array.isArray(frames) && frames.length === 4,
    'строка кадров слота 2/7 — 4 кадра');
  const active = frames[G.buildingFrameIndex(now1, ax, ay, frames.length)];
  assert.ok(Array.from(frames).includes(active), 'текущий кадр — из таблицы');
  const N_bld = buildingDraws(fb.draw).length;
  const K = buildingDraws(fb.draw).filter(
    (c) => assetOf(c) === active).length;
  assert.ok(K >= 1,
    'baseline-кадр: постройка с текущим кадром нарисована (K=' + K + ')');
  const N_tile = tileDraws(fb.draw).length;
  const N_mob = mobDraws(fb.draw).length;
  assert.ok(N_tile > 0, 'сценарий: кадр с тайлами');
  assert.equal(heroDraws(fb.draw).length, 1, 'герой: 1×');
  assert.equal(countColor(hb.glCalls, BUILDING_COLOR), 0,
    'baseline: постройки ready → маркеров нет (XOR)');
  // (1) Reject ТОЛЬКО текущего кадра (база загрузилась — fallback
  // искушает, но запрещён: строгая семантика, прецедент воды).
  const h = await boot((v) => v === active);
  let now1b = NOW;
  {
    const walker = makeRouteWalker(h);
    for (const st of sc.steps) now1b = walker(st.x, st.y);
  }
  assert.equal(now1b, now0,
    'детерминизм: ходьба (тот же мир/входы) завершается в тот же now');
  const f = frameAt(h, now1);
  const st = h.sandbox.__game.state;
  const p = G.worldToScreen(ax, ay, st.cam.x, st.cam.y, st.zoom,
    VIEW_W, VIEW_H);
  const atAnchor = buildingDraws(f.draw).filter((c) =>
    Math.abs(c[1][1] - p.x) <= 1e-6 && Math.abs(c[1][2] - p.y) <= 1e-6);
  assert.equal(atAnchor.length, 0,
    'отклонённый кадр — на якоря (' + ax + ',' + ay + ') building-спрайта НЕТ '
    + '(fallback на статичную базу запрещён: строгая готовность)');
  assert.equal(countColor(h.glCalls, BUILDING_COLOR), 6 * K,
    'постройки, рисовавшие отклонённый кадр — legacy-маркеры (6 вершин × K=' + K + ')');
  assert.equal(markerVerts(h.glCalls, BUILDING_COLOR, ax, ay), 6,
    'маркер — на якоря целевой постройки (' + ax + ',' + ay + ')');
  assert.equal(buildingDraws(f.draw).length, N_bld - K,
    'остальные постройки интактны (' + (N_bld - K) + ' из ' + N_bld + ')');
  assert.equal(tileDraws(f.draw).length, N_tile, 'тайлы: интактны');
  assert.equal(mobDraws(f.draw).length, N_mob, 'мобы: интактны');
  assert.equal(heroDraws(f.draw).length, 1, 'герой: 1×');
  assert.equal(tileVerts(h.glCalls), 0, 'тайлы: все ready → 0 тайл-квадов');
  assert.equal(countColor(h.glCalls, MOB_COLOR), 0,
    'мобы: ready → маркеров нет (XOR)');
  assert.equal(countColor(h.glCalls, PLAYER_COLOR), 0,
    'герой: ready → legacy-ромба нет (XOR)');
  assert.equal(h.errors.length, 0, 'ошибок нет: ' + h.errors.join('; '));
});

test('RM-CAMP-2 (Задача 000238, RED): строгая готовность лагеря — отклонён ТЕКУЩИЙ camp-кадр (костёр) → legacy-маркер (6 вершин) на якоря (−18,−12), СПРАЙТА НЕТ (skip; fallback на camp.svg ЗАПРЕЩЁН); остальной кадр интактен (XOR)', async () => {
  // (0) Эталонный boot: ходьба к лагерю, baseline-кадр.
  const hb = await boot();
  assertReady(hb);
  const G = hb.sandbox.Game;
  assert.equal(typeof G.campFrames, 'function',
    'sprites.js: экспорт campFrames(buildingId) — отсутствует (Задача 000238)');
  assert.equal(typeof G.buildingFrameIndex, 'function',
    'sprites.js: экспорт buildingFrameIndex (механизм 000224)');
  const myMap = G.createMap(G.generateSeedPixels());
  const sc = findNearestCamp(G, myMap, 0, 0, 400);
  assert.ok(sc, 'сценарий: лагерь пешком достижим от спавна');
  assert.deepEqual({ x: sc.target.x, y: sc.target.y }, { x: -18, y: -12 },
    'сценарий: nearest лагерь — (−18,−12) (golden CP-6; дрейф мира — тест обязан упасть)');
  assert.equal(sc.steps.length, 30,
    'сценарий: 30 шагов (golden CP-6; факт ' + sc.steps.length + ')');
  const rec = myMap.buildingAt(sc.target.x, sc.target.y);
  assert.ok(rec && rec.buildingId === 47 && rec.w === 1 && rec.h === 1,
    'сценарий: лагерь 1×1, buildingId 47');
  const ax = rec.x, ay = rec.y;
  let now0 = NOW;
  {
    const walker = makeRouteWalker(hb);
    for (const st of sc.steps) now0 = walker(st.x, st.y);
  }
  const now1 = now0 + 200;
  const fb = frameAt(hb, now1);
  const buildingDraws = (draw) => drawImages(draw).filter(
    (c) => assetOf(c).startsWith('assets/sprites/buildings/'));
  const frames = G.campFrames(47);
  assert.ok(Array.isArray(frames) && frames.length === 4,
    'CAMP_FRAMES[47] — 4 кадра костра');
  const active = frames[G.buildingFrameIndex(now1, ax, ay, frames.length)];
  assert.ok(Array.from(frames).includes(active), 'текущий кадр — из таблицы');
  const N_bld = buildingDraws(fb.draw).length;
  const K = buildingDraws(fb.draw).filter(
    (c) => assetOf(c) === active).length;
  assert.ok(K >= 1,
    'baseline-кадр: костёр с текущим кадром нарисован (K=' + K + ')');
  const N_tile = tileDraws(fb.draw).length;
  const N_mob = mobDraws(fb.draw).length;
  assert.ok(N_tile > 0, 'сценарий: кадр с тайлами');
  assert.equal(heroDraws(fb.draw).length, 1, 'герой: 1×');
  assert.equal(countColor(hb.glCalls, BUILDING_COLOR), 0,
    'baseline: постройки ready → маркеров нет (XOR)');
  // (1) Reject ТОЛЬКО текущего camp-кадра (база camp.svg загрузилась —
  // fallback запрещён: строгая семантика, прецедент воды).
  const h = await boot((v) => v === active);
  let now1b = NOW;
  {
    const walker = makeRouteWalker(h);
    for (const st of sc.steps) now1b = walker(st.x, st.y);
  }
  assert.equal(now1b, now0,
    'детерминизм: ходьба (тот же мир/входы) завершается в тот же now');
  const f = frameAt(h, now1);
  const st = h.sandbox.__game.state;
  const p = G.worldToScreen(ax, ay, st.cam.x, st.cam.y, st.zoom,
    VIEW_W, VIEW_H);
  const atAnchor = buildingDraws(f.draw).filter((c) =>
    Math.abs(c[1][1] - p.x) <= 1e-6 && Math.abs(c[1][2] - p.y) <= 1e-6);
  assert.equal(atAnchor.length, 0,
    'отклонённый camp-кадр — на якоря (' + ax + ',' + ay + ') СПРАЙТА НЕТ '
    + '(skip; fallback на camp.svg запрещён: строгая готовность)');
  assert.equal(countColor(h.glCalls, BUILDING_COLOR), 6 * K,
    'лагеря, рисовавшие отклонённый кадр — legacy-маркеры (6 вершин × K=' + K + ')');
  assert.equal(markerVerts(h.glCalls, BUILDING_COLOR, ax, ay), 6,
    'маркер — на якоря лагеря (' + ax + ',' + ay + ')');
  assert.equal(buildingDraws(f.draw).length, N_bld - K,
    'остальные постройки интактны (' + (N_bld - K) + ' из ' + N_bld + ')');
  assert.equal(tileDraws(f.draw).length, N_tile, 'тайлы: интактны');
  assert.equal(mobDraws(f.draw).length, N_mob, 'мобы: интактны');
  assert.equal(heroDraws(f.draw).length, 1, 'герой: 1×');
  assert.equal(tileVerts(h.glCalls), 0, 'тайлы: все ready → 0 тайл-квадов');
  assert.equal(countColor(h.glCalls, MOB_COLOR), 0,
    'мобы: ready → маркеров нет (XOR)');
  assert.equal(countColor(h.glCalls, PLAYER_COLOR), 0,
    'герой: ready → legacy-ромба нет (XOR)');
  assert.equal(h.errors.length, 0, 'ошибок нет: ' + h.errors.join('; '));
});

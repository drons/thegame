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

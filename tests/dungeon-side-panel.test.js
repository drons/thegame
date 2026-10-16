// Задача 000229: Правое информационное окно убрать совсем (цель 000212
// достигнута не полностью). ТЗ: tasks/pending/000229.md. Контракт:
// memory/000229-dungeon-side-panel-removed.md (D1-D14).
//
// «Правое окно» = .dungeon-overlay .combat-side (src/dungeon-ui.js
// build(), CSS index.html: absolute top/right 16px, width 270px) —
// ОДНОВРЕМЕННО у города и подземелья (один оверлей локации). После
// 000212 в подземелье (kind 'dungeon' / legacy без kind) в ней
// остались logEl (.combat-log, последние 8 строк s.log) + hint
// (.combat-state, строки управления + «Залежь — [E]» 000157.03) —
// окно всё ещё висит справа поверх канваса подземелья. 000229:
// панель в подземелье НЕ СОЗДАЁТСЯ ВООБЩЕ (чистое удаление: лог/хинт
// НЕ переносятся в #hud — «не больше и не меньше»). #hud (000212) —
// ЕДИНСТВЕННОЕ инфо-окно подземелья — остаётся (z-lift '25', имя,
// «Глубина: N» при depth>1, «До выхода: ~N»). Город (kind 'city') —
// байт-в-байт (вне скоупа ТЗ). Боевой .combat-side (combat-ui.js,
// оверлей .combat-overlay--combat) — ДРУГОЙ оверлей — не тронут.
// index.html / main.js / hud.js / locations.js — 0 diff (CSS-правило
// .dungeon-overlay .combat-side — общее с городом — остаётся).
//
// КРАСНЫЕ (RW-1..RW-4, expectedRedCount = 4 — падают на master
// ОСМЫСЛЕННО: build() создаёт панель для обоих kind'ов (side/logEl/
// hint без условия kind) — assert «0 .combat-side» получает факт 1;
// не синтаксис/окружение):
//   * RW-1 (node) — подземелье: в оверлее 0 .combat-side/.combat-
//     state/.combat-log; оверлей = canvas; рендер жив (floor #182029);
//     errors 0.
//   * RW-2 (fullchain) — enterDungeon + кадр: .dungeon-overlay =
//     canvas ТОЛЬКО (1 прямой ребёнок); #hud zIndex '25', 1-я строка
//     = имя подземелья, «До выхода: ~N», без «---»/«групп(ы)»;
//     errors не растут.
//   * RW-3 (fullchain) — переход этажей (transitionFloor:
//     close→start→build): НОВЫЙ оверлей (depth 2) тоже без панели —
//     удаление структурное в build() по kind, не точечное; HUD
//     «Глубина: 2»; zIndex '25'.
//   * RW-4 (fullchain) — no over-fix: в бою боевой .combat-side
//     ЕСТЬ (.combat-actions/.combat-log — бой не тронут); после боя
//     dungeon-оверлей снова 0 .combat-side + zIndex '25'; локация
//     цела.
//
// ГАРД (RW-G1, ЗЕЛЁНЫЙ — фиксирует ГРАНИЦУ ТЗ: город вне скоупа,
// байт-в-байт; дополняет DH-7(b) — тот не считает .combat-side/
// .combat-log и не пинит stateEl-байты):
//   * город: 1 .combat-side + 2 .combat-state (stateEl + hint) +
//     1 .combat-log; stateEl-байты «<имя>  (x, y)\nДо выхода: ~N
//     клеток»; hint-байты «Стрелки/WASD — шаг.\nДверь — вход и
//     выход: встаньте на неё и нажмите [E].\n[E] — постройки.»
//     (без «Сундук и мобы»/«Залежи»).
//
// Харнес: самодостаточный (дубль конвенций): (а) full-chain
// vm-песочница по tests/dungeon-info-window.test.js (CHAIN из
// index.html, Proxy-DOM, WebGL/Image-стабы, h.hud, frameFn, drain;
// вход — g.actions.enterDungeon(); спуск — walkDungeonTo по паттерну
// DH-8: BFS d.cells === D.CELL_FLOOR, 1 keydown = 1 шаг, бой по
// маршруту 9999→Space); (б) node-часть — частичная цепочка
// loadDungeonUi + makeState/makeCityState по tests/dungeon-ui.
// test.js (фабрики дублируются в файл). Ошибки на чистых путях —
// errors не растут.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const D = require('../src/dungeon.js');
const CITIES = require('../src/cities.js');

const ROOT = path.join(__dirname, '..');

// ============================================================
// Full-chain vm-песочница (конвенция tests/dungeon-info-
// window.test.js): вся цепочка index.html, __game + Game.
// ============================================================

// Цепочка скриптов — из index.html (не хардкод, паттерн main-visuals).
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CHAIN = Array.from(html.matchAll(/<script\s+src="([^"]+)"/g), (m) => m[1])
  .map((p) => p.replace(/^src\//, ''));
const NOW = 1000; // performance.now() в песочнице заморожен на NOW

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

function makeContext2d(el) {
  const calls = el.drawCalls = [];
  return new Proxy({}, {
    get: (t, k) => (k in t ? t[k] : (...args) => { calls.push([k, args]); }),
    set: (t, k, v) => { t[k] = v; return true; },
  });
}

// --- «Снисходительный» DOM-элемент с деревом (dataset, closest,
// querySelectorAll) — дубль конвенции tests/city-interact.test.js. ---
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
  if (cls && !String(el.className || '').split(/\s+/).includes(cls)) {
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
    // children хранят СУРЫЕ target (а не прокси): remove() ищет по
    // identity (дубль tests/city-interact.test.js).
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
      if (name.startsWith('data-')) target.dataset[name.slice(5)] = value;
    },
    getContext(kind) {
      if (tag !== 'canvas') return null;
      return kind === 'webgl' ? makeGl() : makeContext2d(target);
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
      return () => undefined; // неизвестный метод DOM — no-op
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

function makeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

// --- Песочница: вся цепочка index.html (браузерная ветка UMD) ---
function bootSandbox() {
  const winListeners = {};
  const raf = [];
  const errors = [];
  const gameCanvas = makeEl('canvas');
  const spriteCanvas = makeEl('canvas');
  const hud = makeEl('div');
  // #game — WebGL (без него main.js уходит в фолбэк-ветку и не
  // стартует); #sprites — 2d со спаем (слой спрайтов).
  gameCanvas.getContext = (kind) => (kind === 'webgl'
    ? makeGl() : makeContext2d(gameCanvas));
  spriteCanvas.getContext = (kind) => (kind === '2d'
    ? makeContext2d(spriteCanvas) : null);
  const storage = makeStorage();
  const body = makeEl('body');
  const document = {
    createElement: (tag) => makeEl(tag),
    getElementById: (id) => (
      id === 'game' ? gameCanvas
        : id === 'sprites' ? spriteCanvas
          : id === 'hud' ? hud : null),
    body,
    addEventListener() {},
    removeEventListener() {},
    querySelector: () => null,
    hidden: false,
  };
  const window = {
    innerWidth: 1280,
    innerHeight: 720,
    location: { search: '' },
    localStorage: storage,
    confirm: () => false,
    // Семантика браузерного window: повторный add — no-op, remove —
    // реально снимает (дубль tests/city-interact.test.js).
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
  // Image-стаб (паттерн main-visuals): assets/map.png ВСЕГДА onerror
  // → детерминированный фолбэк G.generateSeedPixels; остальные onload.
  function Image() {
    const self = this;
    self.naturalWidth = 0;
    self.naturalHeight = 0;
    Object.defineProperty(self, 'src', {
      configurable: true,
      get() { return self.__src; },
      set(v) {
        self.__src = v;
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
  return { sandbox, winListeners, raf, errors, body, storage, hud };
}

// Промывка микротасков (Image + loadMapPixels().then: карта, спавн,
// requestAnimationFrame(frame)).
const drain = () => new Promise((r) => setImmediate(r));

async function boot() {
  const h = bootSandbox();
  await drain();
  await drain();
  await drain();
  const g = h.sandbox.__game;
  assert.ok(g, 'globalThis.__game выставлен (main.js выполнен)');
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет (порядок цепочки): ' + h.errors.join('; '));
  // frame() main.js — единственный rAF-колбэк после старта; кадр пере
  // планирует себя (одна и та же функция) — frameFn валидна на любом
  // моменте.
  h.frameFn = h.raf[h.raf.length - 1];
  return h;
}

// --- Ввод ---
// ВАЖНО: массив слушателей снапшотится ПЕРЕД диспетчем (паттерн B9):
// слушатель, зарегистрированный ВО ВРЕМЯ диспетча, текущее событие
// НЕ видит (семантика браузерного DOM).
function key(h, code, extra = {}) {
  const e = Object.assign(
    { code, preventDefault() {}, stopPropagation() {} }, extra);
  for (const fn of (h.winListeners['keydown'] || []).slice()) fn(e);
  return e;
}

function keyup(h, code, extra = {}) {
  const e = Object.assign({ code }, extra);
  for (const fn of (h.winListeners['keyup'] || []).slice()) fn(e);
  return e;
}

function press(h, code) {
  return key(h, code);
}

function release(h, code) {
  return keyup(h, code);
}

function keydownFor(dx, dy) {
  return dx === 1 ? 'ArrowRight' : dx === -1 ? 'ArrowLeft'
    : dy === 1 ? 'ArrowDown' : 'ArrowUp';
}

// Резолв боевого оверлея (паттерн DH-6): мобы 9999 → Space.
function resolveCombat(G) {
  assert.equal(G.combatUI.isActive(), true, 'резолв: бой активен');
  const c = G.combatUI.current();
  for (const m of c.units.filter((x) => x.side === 'mob' && x.alive)) {
    G.combatInternals.dealDamageToMob(c, m, 9999);
  }
  assert.ok(c.result && c.result.outcome === 'victory',
    'резолв: победа (9999 по живым мобам)');
  G.combatUI.handleCode('Space');
  assert.equal(G.combatUI.isActive(), false,
    'резолв: бой закрыт (Space → finish)');
}

// Ходьба в подземелье до (tx, ty) (паттерн DH-8): BFS 4-соседство по
// d.cells === D.CELL_FLOOR; 1 keydown = 1 синхронный шаг; бой по
// маршруту — авторазрешение 9999 → Space.
function walkDungeonTo(h, tx, ty) {
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const d0 = g.dungeon;
  const W = d0.width, H = d0.height;
  const sx = d0.x, sy = d0.y;
  if (sx === tx && sy === ty) return;
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const startKey = sx + ',' + sy;
  const prev = new Map([[startKey, null]]);
  let frontier = [{ x: sx, y: sy }];
  let found = false;
  outer:
  for (let depth = 0; depth < W * H && !found; depth++) {
    const next = [];
    for (const cur of frontier) {
      for (const [dx, dy] of DIRS) {
        const nx = cur.x + dx, ny = cur.y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        if (d0.cells[ny * W + nx] !== D.CELL_FLOOR) continue;
        const k = nx + ',' + ny;
        if (prev.has(k)) continue;
        prev.set(k, cur.x + ',' + cur.y);
        if (nx === tx && ny === ty) { found = true; break outer; }
        next.push({ x: nx, y: ny });
      }
    }
    frontier = next;
  }
  assert.ok(found,
    'walkDungeonTo: (' + tx + ',' + ty + ') недостижимо от (' + sx
    + ',' + sy + ') (сценарий)');
  const path = [];
  for (let k = tx + ',' + ty; k !== startKey; k = prev.get(k)) {
    const [x, y] = k.split(',').map(Number);
    path.unshift({ x, y });
  }
  for (const step of path) {
    const before = g.dungeon;
    const code = keydownFor(step.x - before.x, step.y - before.y);
    press(h, code);
    release(h, code);
    const after = g.dungeon;
    assert.equal(after.x, step.x,
      'walkDungeonTo: герой перешёл на (' + step.x + ',' + step.y
      + ') — x');
    assert.equal(after.y, step.y,
      'walkDungeonTo: герой перешёл на (' + step.x + ',' + step.y
      + ') — y');
    if (G.combatUI.isActive()) {
      const c = G.combatUI.current();
      for (const m of c.units.filter((x) => x.side === 'mob' && x.alive)) {
        G.combatInternals.dealDamageToMob(c, m, 9999);
      }
      assert.ok(c.result && c.result.outcome === 'victory',
        'walkDungeonTo: бой по маршруту — победа');
      G.combatUI.handleCode('Space');
      assert.equal(G.combatUI.isActive(), false,
        'walkDungeonTo: бой закрыт (Space → finish)');
    }
  }
}

// Оверлей локации (.dungeon-overlay — child body, src/dungeon-ui.js).
function dungeonOverlayOf(h) {
  const ovs = findAll(h.body, '.dungeon-overlay');
  return ovs.length ? ovs[ovs.length - 1] : null;
}

// Боевой оверлей (.combat-overlay--combat, src/combat-ui.js).
function combatOverlayOf(h) {
  const ovs = findAll(h.body, '.combat-overlay--combat');
  return ovs.length ? ovs[ovs.length - 1] : null;
}

// ============================================================
// Node-часть (RW-1/RW-G1): частичная цепочка loadDungeonUi +
// фабрики makeState/makeCityState (дубль tests/dungeon-ui.
// test.js).
// ============================================================

// Canvas 2D: методы — no-op, свойства (fillStyle и т.п.) —
// записываются. Каждый ВЫЗОВ метода — в el.drawCalls как
// [имя, args, fillStyle] (fillStyle на момент вызова).
function makeContext2dNode(el) {
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

function makeElNode(tag, buttons) {
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
    querySelectorAll() { return buttons; },
    getBoundingClientRect() { return { left: 0, top: 0 }; },
  };
  if (tag === 'canvas') {
    el.width = 0;
    el.height = 0;
    el.getContext = () => makeContext2dNode(el);
  }
  return el;
}

// Загрузка цепочки src-скриптов (порядок index.html: global-
// settings, perlin, map, controls, dungeon, locations, dungeon-ui,
// motion) + dungeon-ui.js в vm-песочнице (дубль loadDungeonUi
// tests/dungeon-ui.test.js).
function loadDungeonUi() {
  const keydown = [];
  const errors = [];
  const buttons = [];
  const document = {
    createElement: (tag) => {
      const el = makeElNode(tag, buttons);
      if (tag === 'button') buttons.push(el);
      return el;
    },
    body: makeElNode('body', buttons),
  };
  const window = {
    innerWidth: 800,
    innerHeight: 600,
    addEventListener: (type, fn) => { if (type === 'keydown') keydown.push(fn); },
  };
  const sandbox = {
    console: { error: (m) => errors.push(String(m)) },
    document, window,
  };
  vm.createContext(sandbox);
  const chain = ['global-settings.js', 'perlin.js', 'map.js',
    'controls.js', 'dungeon.js', 'locations.js', 'dungeon-ui.js',
    'motion.js'];
  const src = (f) => fs.readFileSync(path.join(ROOT, 'src', f), 'utf8');
  for (const f of chain) vm.runInContext(src(f), sandbox, { filename: f });
  return { G: sandbox.Game, keydown, body: document.body, errors, window };
}

// Canvas подземелья (создаётся build() при старте).
function findCanvas(el) {
  if (el.tagName === 'canvas') return el;
  for (const ch of el.children || []) {
    const found = findCanvas(ch);
    if (found) return found;
  }
  return null;
}

// Элемент с className, содержащим cls (рекурсивно, в порядке обхода).
function findByClass(el, cls) {
  if (typeof el.className === 'string'
      && el.className.split(' ').includes(cls)) return el;
  for (const ch of el.children || []) {
    const found = findByClass(ch, cls);
    if (found) return found;
  }
  return null;
}

// Все элементы с className, содержащим cls (рекурсивно, в порядке
// обхода): у панели «combat-state» — город: ДВА (stateEl + hint —
// одноимённый класс по паттерну combat-ui).
function allByClass(el, cls) {
  const out = [];
  (function walk(n) {
    if (typeof n.className === 'string' && n.className.includes(cls)) {
      out.push(n);
    }
    for (const ch of n.children || []) walk(ch);
  })(el);
  return out;
}

// Минимальное состояние подземелья — форма main.js (maybeEnterDungeon):
// { dg, contents, x, y, log }; ПОЛЕ KIND НЕТ (legacy = dungeon —
// production dungeonState locations.js — kind 'dungeon'; фикстура
// без kind должна вести себя как подземелье). 5×5, стены по
// периметру, пол внутри, exit = entrance (1,1) (000177).
function makeState() {
  const w = 5, h = 5;
  const cells = new Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const wall = x === 0 || y === 0 || x === w - 1 || y === h - 1;
      cells[y * w + x] = wall ? 0 : 1;
    }
  }
  return {
    dg: {
      type: 0, // DUNGEON_TYPES
      width: w, height: h, cells,
      entrance: { x: 1, y: 1 },
      exit: { x: 1, y: 1 },
    },
    contents: { chests: [], mobs: [], deposits: [] },
    x: 1, y: 1,
    log: ['простая пещера: вход.'],
  };
}

// Состояние города — форма main.js enterCity (000105): dg = layout
// (createCityLayout), contents = null, kind = 'city', name =
// название_карты, первая клетка — layout.entrance.
function makeCityState() {
  const d = CITIES.createCityLayout(-119, -104, 1);
  const name = 'Хутор';
  return {
    dg: d,
    contents: null,
    kind: 'city',
    name,
    x: d.entrance.x,
    y: d.entrance.y,
    prevX: d.entrance.x,
    prevY: d.entrance.y,
    log: [name + ': вход.'],
    cityContents: null,
  };
}

// ============================================================
// RW-1..RW-4 (RED) + RW-G1 (гард)
// ============================================================

test('000229 RW-1 (RED, node): подземелье — панель .combat-side УБРАНА СОВСЕМ: 0 .combat-side/.combat-state/.combat-log; оверлей = canvas; рендер жив (пол #182029); errors 0', () => {
  const loaded = loadDungeonUi();
  const G = loaded.G;
  const s = makeState();
  G.dungeonUI.start({ state: s, onMove() {}, zoom: 40 });
  assert.equal(G.dungeonUI.isActive(), true, 'dungeonUI активен');
  assert.equal(allByClass(loaded.body, 'combat-side').length, 0,
    'RED: .combat-side НЕТ (master: build() создаёт панель для '
    + 'dungeon-kind — факт 1): '
    + allByClass(loaded.body, 'combat-side')
      .map((n) => JSON.stringify(n.textContent)).join(' ; '));
  assert.equal(allByClass(loaded.body, 'combat-state').length, 0,
    'RED: .combat-state (hint) НЕТ — окно убрано совсем');
  assert.equal(allByClass(loaded.body, 'combat-log').length, 0,
    'RED: .combat-log (журнал) НЕТ — окно убрано совсем');
  const overlay = findByClass(loaded.body, 'dungeon-overlay');
  assert.ok(overlay, 'оверлей .dungeon-overlay на месте (экран цел)');
  assert.ok(String(overlay.className).includes('combat-overlay'),
    'оверлей — тот же класс локации (combat-overlay dungeon-overlay)');
  const canvas = findCanvas(overlay);
  assert.ok(canvas, 'canvas — в оверлее (экран не сломан)');
  assert.ok(canvas.drawCalls.length > 0,
    'рендер жив: drawCalls > 0 (start() — событийный рендер)');
  assert.ok(canvas.drawCalls.some(
      (c) => c[0] === 'fillRect' && c[2] === '#182029'),
    'рендер жив: пол #182029 (fillRect) нарисован');
  assert.equal(loaded.errors.length, 0,
    'чистый вход — без console.error: ' + loaded.errors.join('; '));
});

test('000229 RW-2 (RED, fullchain): enterDungeon + кадр — .dungeon-overlay = canvas ТОЛЬКО (0 .combat-side/.combat-state/.combat-log); единое инфо-окно #hud цело (zIndex «25», 1-я строка — имя, «До выхода: ~N», без «---»/«групп(ы)»)', async () => {
  const h = await boot();
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const ds = g.actions.enterDungeon();
  assert.ok(ds, 'enterDungeon — состояние подземелья (отладочный вход)');
  assert.equal(g.dungeon.kind, 'dungeon', 'kind dungeon');
  assert.equal(g.dungeon.depth, 1, 'debug-вход — depth 1');
  const errBefore = h.errors.length;
  h.frameFn(NOW + 16);
  const overlay = dungeonOverlayOf(h);
  assert.ok(overlay, 'экран подземелья — .dungeon-overlay в body');
  assert.equal(findAll(overlay, '.combat-side').length, 0,
    'RED: .combat-side НЕТ (master: панель log+hint висит справа — '
    + 'факт 1): '
    + findAll(overlay, '.combat-side')
      .map((n) => JSON.stringify(String(n.textContent).slice(0, 60)))
      .join(' ; '));
  assert.equal(findAll(overlay, '.combat-state').length, 0,
    'RED: .combat-state (hint) НЕТ — окно убрано совсем');
  assert.equal(findAll(overlay, '.combat-log').length, 0,
    'RED: .combat-log (журнал) НЕТ — окно убрано совсем');
  assert.equal(overlay.children.length, 1,
    'RED: оверлей = canvas — ОДИН прямой ребёнок (master: canvas + '
    + 'side)');
  assert.equal(overlay.children[0].tagName, 'canvas',
    'единственный ребёнок оверлея — canvas');
  // Единое инфо-окно 000212 — НЕ тронуто (regression-гард): z-lift
  // '25', dungeon-формат побайтово.
  assert.equal(h.hud.style.zIndex, '25',
    '#hud поднят над оверлеем (000212 — ЕДИНСТВЕННОЕ инфо-окно): '
    + JSON.stringify(h.hud.style.zIndex));
  const hudText = String(h.hud.textContent);
  const name = G.DUNGEON_NAMES[g.dungeon.type];
  assert.ok(name, 'сценарий: тип подземелья именуется');
  assert.equal(hudText.split('\n')[0],
    'Флогистон, ур. ' + g.state.hero.level + '  (' + name + ')',
    '1-я строка #hud — имя подземелья: ' + JSON.stringify(hudText));
  assert.ok(!hudText.includes('---'),
    'без рамки «---» (000212): ' + JSON.stringify(hudText));
  assert.ok(!hudText.includes('групп(ы)'),
    'без счётчика «групп(ы)» (000212): ' + JSON.stringify(hudText));
  assert.ok(/До выхода: ~\d+ клеток/.test(hudText),
    '«До выхода: ~N клеток» на месте: ' + JSON.stringify(hudText));
  assert.equal(h.errors.length, errBefore,
    'чистый вход — без новых console.error: '
    + h.errors.slice(errBefore).join('; '));
});

test('000229 RW-3 (RED, fullchain): переход этажей (transitionFloor close→start→build) — НОВЫЙ оверлей (depth 2) тоже БЕЗ панели; HUD «Глубина: 2»; zIndex «25»', async () => {
  const h = await boot();
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const ds = g.actions.enterDungeon();
  assert.ok(ds, 'enterDungeon — состояние подземелья (отладочный вход)');
  assert.equal(g.dungeon.kind, 'dungeon', 'kind dungeon');
  assert.equal(g.dungeon.depth, 1, 'debug-вход — depth 1');
  const stairs = g.dungeon.stairsDown;
  assert.ok(stairs,
    'фикстура: stairsDown выставлен (stairsDownFor — детерминированно)');
  walkDungeonTo(h, stairs.x, stairs.y);
  assert.deepEqual({ x: g.dungeon.x, y: g.dungeon.y },
    { x: stairs.x, y: stairs.y }, 'герой — на клетке stairs-down');
  const errBefore = h.errors.length;
  press(h, 'KeyE');
  release(h, 'KeyE');
  assert.equal(g.dungeon.depth, 2,
    '[E] на stairs-down — depth 2 (спавн на клетке-выходе)');
  h.frameFn(NOW + 16);
  const overlay = dungeonOverlayOf(h);
  assert.ok(overlay, 'новый экран (depth 2) — .dungeon-overlay в body');
  assert.equal(findAll(overlay, '.combat-side').length, 0,
    'RED: НОВЫЙ оверлей после rebuild (close→start→build) — без '
    + 'панели (удаление — структурное в build() по kind, не точечное): '
    + findAll(overlay, '.combat-side')
      .map((n) => JSON.stringify(String(n.textContent).slice(0, 60)))
      .join(' ; '));
  assert.equal(findAll(overlay, '.combat-state').length, 0,
    'RED: новый оверлей — .combat-state (hint) НЕТ');
  assert.equal(findAll(overlay, '.combat-log').length, 0,
    'RED: новый оверлей — .combat-log (журнал) НЕТ');
  assert.equal(overlay.children.length, 1,
    'новый оверлей = canvas (один прямой ребёнок)');
  assert.equal(overlay.children[0].tagName, 'canvas',
    'единственный ребёнок нового оверлея — canvas');
  assert.equal(h.hud.style.zIndex, '25',
    'depth 2 — #hud поднят (000212): '
    + JSON.stringify(h.hud.style.zIndex));
  assert.ok(String(h.hud.textContent).includes('Глубина: 2'),
    'HUD: строка «Глубина: 2» (floorStatusLine): '
    + JSON.stringify(String(h.hud.textContent)));
  assert.equal(h.errors.length, errBefore,
    'без новых console.error: ' + h.errors.slice(errBefore).join('; '));
});

test('000229 RW-4 (RED, fullchain): no over-fix — боевой .combat-side цел (с .combat-actions/.combat-log); после боя dungeon-оверлей снова 0 .combat-side + zIndex «25»; локация цела', async () => {
  const h = await boot();
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const ds = g.actions.enterDungeon();
  assert.ok(ds, 'enterDungeon — состояние подземелья (отладочный вход)');
  assert.equal(g.dungeon.kind, 'dungeon', 'kind dungeon');
  const errBefore = h.errors.length;
  h.frameFn(NOW + 16);
  assert.equal(h.hud.style.zIndex, '25',
    'в подземелье #hud поднят (000212)');
  // Debug-бой (000096): боевой оверлей — ДРУГОЙ оверлей (combat-ui.
  // js), СВОЙ .combat-side — не тронут.
  const c0 = g.actions.startCombat();
  assert.ok(c0, 'startCombat — бой начат (отладочный)');
  assert.equal(G.combatUI.isActive(), true, 'боевой оверлей активен');
  h.frameFn(NOW + 32);
  const combat = combatOverlayOf(h);
  assert.ok(combat, 'боевой оверлей — .combat-overlay--combat в body');
  assert.equal(findAll(combat, '.combat-side').length, 1,
    'боевой оверлей: ровно 1 .combat-side (бой НЕ тронут)');
  assert.equal(findAll(combat, '.combat-actions').length, 1,
    'боевой .combat-actions на месте');
  assert.equal(findAll(combat, '.combat-log').length, 1,
    'боевой .combat-log на месте');
  resolveCombat(G);
  h.frameFn(NOW + 48);
  assert.equal(G.combatUI.isActive(), false, 'бой закрыт');
  const overlay = dungeonOverlayOf(h);
  assert.ok(overlay, 'подземелье живо после боя — оверлей в body');
  assert.equal(findAll(overlay, '.combat-side').length, 0,
    'RED: после боя dungeon-оверлей — без панели (master: факт 1): '
    + findAll(overlay, '.combat-side')
      .map((n) => JSON.stringify(String(n.textContent).slice(0, 60)))
      .join(' ; '));
  assert.equal(findAll(overlay, '.combat-state').length, 0,
    'RED: после боя dungeon-оверлей — .combat-state (hint) НЕТ');
  assert.equal(findAll(overlay, '.combat-log').length, 0,
    'RED: после боя dungeon-оверлей — .combat-log (журнал) НЕТ');
  assert.equal(overlay.children.length, 1,
    'dungeon-оверлей = canvas (один прямой ребёнок)');
  assert.equal(h.hud.style.zIndex, '25',
    'после боя #hud снова поднят (локация цела): '
    + JSON.stringify(h.hud.style.zIndex));
  assert.equal(g.dungeon.kind, 'dungeon', 'локация цела: kind dungeon');
  assert.equal(G.dungeonUI.isActive(), true,
    'локация цела: dungeonUI активен');
  assert.equal(h.errors.length, errBefore,
    'без новых console.error: ' + h.errors.slice(errBefore).join('; '));
});

test('000229 RW-G1 (гард, node): город — панель БАЙТ-В-БАЙТ (город вне скоупа ТЗ, граница 000212): 1 .combat-side + 2 .combat-state + 1 .combat-log; stateEl/hint — побайтово', () => {
  const loaded = loadDungeonUi();
  const G = loaded.G;
  const s = makeCityState();
  G.dungeonUI.start({ state: s, onMove() {}, zoom: 40 });
  const body = loaded.body;
  const sides = allByClass(body, 'combat-side');
  assert.equal(sides.length, 1, 'город: ровно 1 .combat-side (панель цела)');
  const states = allByClass(body, 'combat-state');
  assert.equal(states.length, 2,
    'город: 2 .combat-state (stateEl + hint — одноимённый класс)');
  const logs = allByClass(body, 'combat-log');
  assert.equal(logs.length, 1, 'город: 1 .combat-log (журнал цела)');
  assert.ok(sides[0].children.includes(states[0]),
    'stateEl — ребёнок .combat-side');
  assert.ok(sides[0].children.includes(logs[0]),
    'logEl — ребёнок .combat-side');
  assert.ok(sides[0].children.includes(states[1]),
    'hint — ребёнок .combat-side');
  // stateEl (000105 + 000153.03 D5: floorStatusLine — единый
  // источник): имя города + текущая клетка (layout.entrance) +
  // «До выхода: ~0 клеток» (000177: exit = entrance).
  assert.equal(String(states[0].textContent),
    'Хутор  (0, 1)\nДо выхода: ~0 клеток',
    'город: stateEl байт-в-байт: ' + JSON.stringify(states[0].textContent));
  // hint (000177 + 000107): строки управления + дверь + постройки;
  // без «Сундук и мобы» (город пуст) и строк про залежи.
  assert.equal(String(states[1].textContent),
    'Стрелки/WASD — шаг.\nДверь — вход и выход: встаньте на неё и нажмите [E].\n[E] — постройки.',
    'город: hint байт-в-байт: ' + JSON.stringify(states[1].textContent));
  assert.ok(!String(states[1].textContent).includes('Сундук и мобы'),
    'город: hint без «Сундук и мобы»');
  assert.ok(!String(states[1].textContent).includes('Залежи'),
    'город: hint без строк про залежи');
  assert.equal(loaded.errors.length, 0,
    'чистый рендер города — без console.error: '
    + loaded.errors.join('; '));
});

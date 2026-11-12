// Задача 000356 — подсказки клавиш [I] [C] [E] [B] в правом нижнем
// углу экранных кнопок (button.tc-action в #touch-controls, блок 000351).
//
// Дизайн (анализ): ВНУТРЕННИЙ span.tc-key-hint ПОСЛЕДНИМ ребёнком
// каждой кнопки, а не отдельный слой: display:none единицей buttons в
// applyVisibility скрывает подсказку автоматически (0-diff), дети
// #touch-controls не растут (пины TV3/TV8/000332-B1/000351-T4), новой
// ступени z-лестницы нет (оверлей книги z-35 остаётся над подсказкой).
// Текст ровно '[E]'/'[I]'/'[C]'/'[B]' (маппинг по иконке).
//
// Инварианты: ГЕОМЕТРИЯ controls.js не двигается (хитбоксы —
// прямоугольники кнопки, absolute-ребёнок в flex не участвует); тап по
// подсказке даёт ТОТ ЖЕ роут (pointer-events:none — мишень события
// остаётся кнопка; на span слушателей нет); подсказка не выделяется
// (user-select:none на правиле и на .tc-action — расширение контракта
// 000352 с D-pad на кнопки); класс ГОЛЫЙ (.tc-key-hint без скоупинга
// .tc-action) — переиспользование в боевых кнопках (000357).
//
// Харнес (конвенция per-file дубли): T1–T2 — vm-сборка controls.js+ui.js
// со стабами (образец tests/ui-btn-text-select-000352), T3–T4 — пин
// CSS-источника index.html (computed-стили стабами недоступны — узаконен
// 000352), T5 — ПОЛНАЯ цепочка index.html (дубль
// tests/ui-button-b-block-000351), T6 — гард геометрии.
//
//   T1 (RED): каждая из 4 кнопок — РОВНО 1 img + РОВНО 1 span
//     .tc-key-hint ПОСЛЕДНИМ ребёнком, текст по иконке
//     (icon_action→'[E]', icon_inventory→'[I]', icon_squad→'[C]',
//     combat_spellbook→'[B]'), обе схемы (touch/keyboard).
//   T2 (guard): дети #touch-controls НЕ выросли (5 touch / 4 keyboard),
//     состав — только .tc-dpad/.tc-action (подсказка — ВНУТРИ кнопки).
//   T3 (RED): голое правило .tc-key-hint: position:absolute,
//     pointer-events:none, user-select:none, font-size ≤ 14px; НЕГАТИВЫ:
//     скоупинг '.tc-action .tc-key-hint' (ломает переиспользование
//     000357) и z-index у подсказки.
//   T4 (RED): .tc-action объявляет user-select:none (подсказка не
//     выделяется; негатив text/auto/all).
//   T5 (RED, полная цепочка): у подсказок НЕТ слушателей (роут — через
//     кнопку: pointerdown книги открывает, KeyB закрывает; pointerdown
//     инвентаря открывает панель); подсказка — потомок своей кнопки.
//   T6 (guard): геометрия controls.js бит-в-бит (TOUCH_ACTIONS 8,
//     золотые 800×600) — задача не имела права её двигать.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const C = require('../src/controls.js');
const S = require('../src/save.js');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const controlsCode = fs.readFileSync(
  path.join(ROOT, 'src', 'controls.js'), 'utf8');
const uiCode = fs.readFileSync(path.join(ROOT, 'src', 'ui.js'), 'utf8');

const KEY_BY_ICON = {
  'assets/ui/icon_action.svg': '[E]',
  'assets/ui/icon_inventory.svg': '[I]',
  'assets/ui/icon_squad.svg': '[C]',
  'assets/ui/combat_spellbook.svg': '[B]',
};

function declMap(body) {
  const decls = {};
  for (const part of body.split(';')) {
    const i = part.indexOf(':');
    if (i < 0) continue;
    const prop = part.slice(0, i).trim().toLowerCase();
    if (prop) decls[prop] = part.slice(i + 1).trim();
  }
  return decls;
}

function ruleDecls(selector) {
  const esc = selector.replace(/[.#]/g, '\\$&');
  const m = html.match(new RegExp(esc + '\\s*\\{([^}]*)\\}'));
  return m ? declMap(m[1]) : null;
}

// ---------------------------------------------------------------------------
// T1–T2: vm-сборка контролов (стабы 000352)
// ---------------------------------------------------------------------------

function stubEl(tag) {
  const n = {
    tagName: tag,
    className: '',
    textContent: '',
    id: '',
    style: {},
    children: [],
    listeners: {},
    classList: { add() {}, remove() {} },
    appendChild(ch) { n.children.push(ch); return ch; },
    addEventListener(type, fn) {
      (n.listeners[type] || (n.listeners[type] = [])).push(fn);
    },
    removeEventListener() {},
    setAttribute() {},
    setPointerCapture() {},
    blur() {},
  };
  return n;
}

function bootControls(withDpad) {
  const errors = [];
  const body = stubEl('body');
  const sandbox = {
    console: { error: (m) => errors.push(String(m)), log() {} },
    document: {
      createElement: (tag) => stubEl(tag),
      body,
      addEventListener() {},
      removeEventListener() {},
      querySelector: () => null,
      hidden: false,
    },
    window: {
      innerWidth: 1280,
      innerHeight: 720,
      addEventListener() {},
      removeEventListener() {},
    },
  };
  sandbox.Game = {};
  vm.createContext(sandbox);
  vm.runInContext(controlsCode, sandbox, { filename: 'controls.js' });
  vm.runInContext(uiCode, sandbox, { filename: 'ui.js' });
  const tc = sandbox.Game.touchControls;
  tc.init({ dpad: withDpad === true });
  tc.show();
  const root = body.children.find((c) => c.id === 'touch-controls');
  const actions = root.children.filter((c) => c.className === 'tc-action');
  return { errors, root, actions };
}

function hintsOf(btn) {
  return btn.children.filter((ch) => ch.className === 'tc-key-hint');
}

function imgsOf(btn) {
  return btn.children.filter((ch) => String(ch.tagName) === 'img');
}

test('T1: каждая .tc-action — РОВНО 1 img + РОВНО 1 span.tc-key-hint последним ребёнком, текст по иконке (обе схемы)', () => {
  for (const withDpad of [true, false]) {
    const env = bootControls(withDpad);
    assert.deepEqual(env.errors, [], 'сборка без ошибок консоли');
    assert.equal(env.actions.length, 4, '4 кнопки .tc-action');
    const seen = [];
    for (const btn of env.actions) {
      const imgs = imgsOf(btn);
      const hints = hintsOf(btn);
      assert.equal(imgs.length, 1, 'ровно один img (иконка) в кнопке');
      assert.equal(hints.length, 1,
        'RED: в кнопке ровно один span.tc-key-hint — подсказка клавиши');
      assert.equal(btn.children.length, 2,
        'RED: содержимое кнопки — ровно [img, span] без посторонних');
      const hint = hints[0];
      assert.equal(hint, btn.children[btn.children.length - 1],
        'RED: подсказка — ПОСЛЕДНИЙ ребёнок кнопки');
      assert.equal(hint.tagName, 'span',
        'подсказка — span (не img, не текст кнопки)');
      const icon = String(imgs[0].src || '');
      assert.ok(KEY_BY_ICON[icon],
        'иконка кнопки из известного набора: ' + icon);
      seen.push(KEY_BY_ICON[icon]);
      assert.equal(hint.textContent, KEY_BY_ICON[icon],
        "RED: текст подсказки ровно '" + KEY_BY_ICON[icon] +
        "' (скобки, верхний регистр) для " + icon);
    }
    assert.deepEqual(seen.sort(), ['[B]', '[C]', '[E]', '[I]'],
      'все четыре подсказки E/I/C/B на своих кнопках');
  }
});

test('T2: guard — дети #touch-controls не выросли (5/4), состав только .tc-dpad/.tc-action (подсказка внутри кнопки)', () => {
  const touch = bootControls(true);
  assert.equal(touch.root.children.length, 5,
    "touch-схема — дети [dpad, action, inventory, squad, spellbook] "
    + '(ТВ3-контракт: подсказка НЕ добавляется в корень)');
  const kbd = bootControls(false);
  assert.equal(kbd.root.children.length, 4,
    'keyboard-схема — 4 кнопки, без stray-узлов подсказок');
  for (const ch of touch.root.children.concat(kbd.root.children)) {
    assert.ok(ch.className === 'tc-dpad' || ch.className === 'tc-action',
      "каждый ребёнок корня — .tc-dpad или .tc-action: " + ch.className);
  }
});

// ---------------------------------------------------------------------------
// T3–T4: пин CSS-источника index.html
// ---------------------------------------------------------------------------

test('T3: CSS — голое правило .tc-key-hint: absolute, pointer-events:none, user-select:none, font-size ≤14px; негативы: скоупинг .tc-action и z-index', () => {
  const d = ruleDecls('.tc-key-hint');
  assert.ok(d, 'RED: правило .tc-key-hint объявлено в index.html');
  assert.equal(d.position, 'absolute',
    "RED: подсказка — position:absolute (мелкий угол, не flex-член — "
    + 'хитбокс и центрирование иконки не двигаются)');
  assert.equal(d['pointer-events'], 'none',
    'RED: pointer-events:none — тап по подсказке ретаргетится на кнопку '
    + '(тот же роут); иначе span стал бы мишенью события');
  assert.equal(d['user-select'], 'none',
    'RED: user-select:none — подсказка не выделяется (000352-механизм)');
  const m = String(d['font-size'] || '').match(/^(\d+(?:\.\d+)?)px$/);
  assert.ok(m,
    'RED: font-size подсказки задан в px — «мелкий угол» без магии em: '
    + JSON.stringify(d['font-size']));
  assert.ok(Number(m[1]) <= 14,
    'font-size ≤ 14px (мелкий угол, не перекрывает иконку): ' + m[1]);
  assert.ok(!html.includes('.tc-action .tc-key-hint'),
    'НЕГАТИВ: правило ГОЛОЕ (не через .tc-action) — класс переиспользуется '
    + 'боевыми кнопками (000357)');
  assert.ok(!('z-index' in d),
    'НЕГАТИВ: z-index у подсказки нет (рисуются поверх img порядком '
    + 'документа; лестница z не двигается)');
});

test('T4: CSS — .tc-action объявляет user-select:none (расширение 000352: подсказка на кнопке тоже не выделяется)', () => {
  const d = ruleDecls('.tc-action');
  assert.ok(d, 'правило .tc-action найдено в index.html');
  assert.equal(d['user-select'], 'none',
    "RED: user-select у .tc-action = 'none' (свойство наследуется ⇒ "
    + 'покрывает span.tc-key-hint; text/auto/all вернули бы баг '
    + 'выделения 000352 на тексте подсказки): '
    + JSON.stringify(d['user-select']));
});

// ---------------------------------------------------------------------------
// T5: полная цепочка index.html (дубль tests/ui-button-b-block-000351)
// ---------------------------------------------------------------------------

const CHAIN = Array.from(html.matchAll(/<script\s+src="([^"]+)"/g), (m) => m[1])
  .map((p) => p.replace(/^src\//, ''));
const NOW = 1000;

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
      return () => undefined;
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

function makeStorage(seed) {
  const m = new Map();
  if (seed != null) m.set(S.SAVE_KEY, JSON.stringify(seed));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

function bootSandbox(seed) {
  const winListeners = {};
  const raf = [];
  const errors = [];
  const gameCanvas = makeEl('canvas');
  const spriteCanvas = makeEl('canvas');
  const hud = makeEl('div');
  gameCanvas.getContext = (kind) => (kind === 'webgl'
    ? makeGl() : makeContext2d(gameCanvas));
  spriteCanvas.getContext = (kind) => (kind === '2d'
    ? makeContext2d(spriteCanvas) : null);
  const storage = makeStorage(seed);
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

const drain = () => new Promise((r) => setImmediate(r));

async function boot(seed) {
  const h = bootSandbox(seed);
  await drain();
  await drain();
  await drain();
  const g = h.sandbox.__game;
  assert.ok(g, 'globalThis.__game выставлен (main.js выполнен)');
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет (порядок цепочки — load-clean 000038): '
    + h.errors.join('; '));
  h.frameFn = h.raf[h.raf.length - 1];
  return h;
}

function key(h, code, extra = {}) {
  const e = Object.assign(
    { code, preventDefault() {}, stopPropagation() {} }, extra);
  for (const fn of (h.winListeners['keydown'] || []).slice()) fn(e);
  return e;
}

function dismissStartWindow(h) {
  const g = h.sandbox.__game;
  const sw = g.startWindow;
  assert.ok(sw && typeof sw.hide === 'function',
    'фикстура: __game.startWindow (000138)');
  sw.hide();
  assert.equal(sw.isActive(), false,
    'стартовое окно скрыто (клик «Продолжить»)');
}

function touchRoot(h) {
  const root = h.body.children.find((c) => c.id === 'touch-controls');
  assert.ok(root, 'сценарий: #touch-controls в body (init при загрузке)');
  return root;
}

function tcButtons(root) {
  return root.children.filter((c) =>
    String(c.className).includes('tc-action'));
}

function byIcon(root, name) {
  return tcButtons(root).find((b) => b.children.some(
    (ch) => String(ch.src || '') === 'assets/ui/' + name));
}

test('T5: роут не меняется — подсказки без слушателей, тап кнопки книги открывает (KeyB закрывает), тап инвентаря открывает панель; подсказка — потомок своей кнопки', async () => {
  const h = await boot();
  dismissStartWindow(h);
  const G = h.sandbox.Game;
  const root = touchRoot(h);
  const btns = tcButtons(root);
  assert.equal(btns.length, 4, 'фикстура: 4 кнопки');
  for (const btn of btns) {
    const hints = btn.children.filter((ch) =>
      String(ch.className) === 'tc-key-hint');
    assert.equal(hints.length, 1,
      'RED: полная цепочка — в каждой кнопке ровно одна подсказка');
    const hint = hints[0];
    assert.equal(hint.parent, btn,
      'подсказка — потомок КНОПКИ, а не отдельный слой в корне/body');
    assert.deepEqual(
      Object.keys(hint.listeners || {}), [],
      'RED: у span подсказки НЕТ слушателей — мишень события остаётся '
      + 'кнопка (pointer-events:none ретаргетит тап, тот же роут)');
  }
  // Тот же роут через кнопку: книга открывается pointerdown-ом и
  // закрывается KeyB (подсказка [B] в том же поддереве).
  const sb = byIcon(root, 'combat_spellbook.svg');
  assert.equal(G.spellbookOC.isOpen(), false, 'до тапа книга закрыта');
  sb.listeners.pointerdown[0](
    { pointerId: 1, preventDefault() {} });
  assert.equal(G.spellbookOC.isOpen(), true,
    'тап по кнопке книги — открыта (роут touchControls→toggle)');
  key(h, 'KeyB');
  assert.equal(G.spellbookOC.isOpen(), false, 'KeyB закрывает книгу');
  // Инвентарь: pointerdown кнопки [I] — тот же путь, что [I]-хоткей
  // (main.js onInventory → playerUI.toggle(undefined,'inventory')).
  const inv = byIcon(root, 'icon_inventory.svg');
  assert.equal(G.playerUI.isOpen(), false, 'до тапа панель закрыта');
  inv.listeners.pointerdown[0]({ pointerId: 2, preventDefault() {} });
  assert.equal(G.playerUI.isOpen(), true,
    'тап по кнопке инвентаря открывает панель (роут не сломан)');
  key(h, 'KeyI');
});

// ---------------------------------------------------------------------------
// T6: гард геометрии (controls.js не двигался)
// ---------------------------------------------------------------------------

test('T6: guard — геометрия controls.js бит-в-бит: TOUCH_ACTIONS 8, золотые 800×600 (хитбоксы задачи не трогали)', () => {
  assert.deepEqual(C.TOUCH_ACTIONS,
    ['up', 'down', 'left', 'right', 'interact', 'inventory', 'squad',
      'spellbook'],
    'TOUCH_ACTIONS — 8 действий (без изменений)');
  const L = C.layoutTouchControls(800, 600);
  assert.deepEqual(L.action, { x: 688, y: 488, w: 96, h: 96 });
  assert.deepEqual(L.inventory, { x: 688, y: 380, w: 96, h: 96 });
  assert.deepEqual(L.squad, { x: 688, y: 272, w: 96, h: 96 });
  assert.deepEqual(L.spellbook, { x: 688, y: 164, w: 96, h: 96 });
});

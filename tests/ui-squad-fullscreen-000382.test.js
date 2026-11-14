// Задача 000382: панель «Отряд» [C] — на весь экран (симметрия 000377).
// ТЗ: tasks/pending/000382.md. Контракт: memory/000382-squad-fullscreen.md.
//
// Терминология: клавиша панели «Отряд» в коде — [C] (KeyC, main.js),
// метка «[K]» в тексте задачи — документальный артефакт (KeyK = боевая
// атака, combat-keys.js); биндинг не менялся.
//
// Решение (по образцу 000377 для панели [I]):
//   * index.html .squad-panel — top/left/right/bottom: 0 ЧЕТЫРЬМЯ
//     ЛОНГХЕНДАМИ (НЕ shorthand inset:0 — пины парсят именно keys;
//     память 000377 §ФОРМУЛА); рамка/padding 12px 14px/z-10 — контур;
//   * сокрытие кнопки — РОВНО ОДНО CSS-правило
//     body.squad-panel-open .fs-btn { display: none; }, стоит ПОСЛЕ
//     char-правила 000377 (first-match игла P3 обязана резолвить
//     char-токен); из JS display кнопки НЕ пишется (зуб FS-2,
//     FullscreenController 0-diff);
//   * src/ui.js — markPanelOpen параметризован токеном; squad-toggle
//     пишет токен squad-panel-open той же единственной точкой смены
//     видимости (все входы/выходы панели идут через toggle).
//
// Три слоя (конвенция ui-тестов, дублирование стабов принято):
//   A — статика index.html + src/ui.js (S1–S3):
//     S1 геометрия .squad-panel = 0 по четырём лонгхендам (RED);
//     S2 правило body.squad-panel-open .fs-btn + порядок база < char <
//        squad + кросс-контракт токенов CSS ≡ литералы в src/ui.js (RED);
//     S3 контракт [I] 000377 не сдвинут (guard-пин, зелёный и до, и
//        после) — анти-регрессия симметризации.
//   B — vm ui.js (стаб-дубль tests/ui-panel-fullscreen-000377.test.js +
//     companions/efir в цепочке): S4 токен squad на toggle(true/false),
//     preserve чужих токенов + независимость от char-токена; S5 —
//     снятие токена через [Esc] и close-кнопку, reopen; S6 — инвариант
//     display⇔токен, no-op до init, null-guard document.body.
//   C — e2e полная цепь index.html (дубль bootSandbox377 +
//     fullscreen-мок): S7 — KeyC ставит токен, кадр жив, РОВНО одна
//     .fs-btn и display кнопки из JS не пишется, повторный KeyC снимает;
//     S8 — сосуществование [C] и [I]: закрытие одной панели не трогает
//     токен другой.
//
// КРАСНЫЕ до реализации: S1, S2, S4–S8 (осмысленные ERR_ASSERTION —
// правило/токены ещё отсутствуют, загрузка цепи не падает).
// ЗЕЛЁНЫЙ guard-пин: S3.
//
// Ре-пин задачи: tests/ui-panel-fullscreen-000377.test.js P2
// (bottom 56px как ТЕКУЩЕЕ [C]) переписан на новый контракт.

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const src = (f) => fs.readFileSync(path.join(ROOT, 'src', f), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CHAIN = Array.from(
  html.matchAll(/<script\s+src="([^"]+)"/g), (m) => m[1])
  .map((p) => p.replace(/^src\//, ''));

const TOKEN = 'squad-panel-open';
const CHAR_TOKEN = 'char-panel-open';

function tokensOf(node) {
  return String(node.className || '').split(/\s+/).filter(Boolean);
}
function hasToken(node, tok) {
  return tokensOf(node).includes(tok);
}
function tokenCount(node, tok) {
  return tokensOf(node).filter((t) => t === tok).length;
}

// ---------------------------------------------------------------------------
// Слой A — статика index.html
// ---------------------------------------------------------------------------

function cssRuleFirst(name) {
  const m = html.match(new RegExp('\\.' + name + '\\s*{([^}]*)}'));
  assert.ok(m, 'CSS-правило .' + name + ' найдено в index.html');
  const decls = {};
  for (const part of m[1].split(';')) {
    const i = part.indexOf(':');
    if (i < 0) continue;
    const prop = part.slice(0, i).trim().toLowerCase();
    if (prop) decls[prop] = part.slice(i + 1).trim();
  }
  return decls;
}

function cssRuleSel(selector) {
  const re = new RegExp('^[ \\t]*'
    + selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    + '[ \\t]*\\{([^}]*)\\}', 'm');
  const m = html.match(re);
  assert.ok(m, 'CSS-правило ' + selector + ' { … } найдено в index.html');
  const decls = {};
  for (const part of m[1].split(';')) {
    const i = part.indexOf(':');
    if (i < 0) continue;
    const prop = part.slice(0, i).trim().toLowerCase();
    if (prop) decls[prop] = part.slice(i + 1).trim();
  }
  return decls;
}

test('000382-S1 (RED): CSS .squad-panel — весь экран: top/left/right/bottom = 0 лонгхендами; контур (padding/border/z-index) без изменений; НЕТ width и bottom: 56px', () => {
  const p = cssRuleSel('.squad-panel');
  assert.equal(p.position, 'fixed', '.squad-panel: position fixed (оверлей)');
  assert.equal(p.top, '0', 'top 0 (было 12px — мёртвая кромка)');
  assert.equal(p.left, '0', 'left 0 (было 12px)');
  assert.equal(p.right, '0', 'right 0 (было 12px)');
  assert.equal(p.bottom, '0',
    'bottom 0 (было 56px — полоса под .fs-btn; при открытой [C] кнопка '
    + 'скрыта правилом S2, симметрия 000377)');
  assert.ok(!/\.squad-panel\s*\{[^}]*bottom:\s*56px/.test(html),
    'в правиле .squad-panel НЕТ строки bottom: 56px');
  assert.equal(p.padding, '12px 14px', 'padding контура не тронут');
  assert.equal(p.border, '1px solid #4a4433', 'рамка не тронута');
  assert.equal(p['border-radius'], '12px', 'скругление не тронуто');
  assert.equal(p['z-index'], '10', 'z-index 10 (лестница 10/15/20/30)');
  assert.equal(p.width, undefined, 'фиксированного width НЕТ');
});

test('000382-S2 (RED): правило body.squad-panel-open .fs-btn display:none ПОСЛЕ char-правила; база .fs-btn раньше обоих; набор body-токенов сокрытия ≡ {char, squad}; кросс-контракт литералов в src/ui.js', () => {
  const hide = cssRuleSel('body.' + TOKEN + ' .fs-btn');
  assert.equal(hide.display, 'none',
    'при открытой панели [C] кнопка FS скрыта (display: none)');

  const base = cssRuleFirst('fs-btn');
  assert.equal(base['z-index'], '15', '.fs-btn база: z-index 15');
  assert.equal(base.display, undefined,
    'БАЗА .fs-btn — без display (сокрытие — только скоуп-правила)');

  const iBase = html.search(/^[ \t]*\.fs-btn\s*\{/m);
  const iChar = html.indexOf('body.' + CHAR_TOKEN + ' .fs-btn');
  const iSquad = html.indexOf('body.' + TOKEN + ' .fs-btn');
  assert.ok(iBase >= 0 && iChar >= 0 && iSquad >= 0,
    'база .fs-btn и оба правила сокрытия найдены');
  assert.ok(iBase < iChar && iChar < iSquad,
    'порядок: база < char-правило < squad-правило (first-match парсеры '
    + 'резолвят базу; игла 000377-P3 обязана остаться на char-токене)');

  const seen = Array.from(
    html.matchAll(/body\.([A-Za-z0-9_-]+) \.fs-btn\s*\{/g), (m) => m[1]);
  assert.deepEqual(Array.from(new Set(seen)).sort(),
    [CHAR_TOKEN, TOKEN],
    'селекторы сокрытия .fs-btn — ровно char-panel-open и squad-panel-open');
  const ui = src('ui.js');
  for (const tok of [CHAR_TOKEN, TOKEN]) {
    assert.ok(new RegExp("['\"]" + tok + "['\"]").test(ui),
      'src/ui.js содержит литерал токена «' + tok
      + '» (CSS и JS — один токен; иначе сокрытие разойдётся молча)');
  }
});

test('000382-S3 (guard-пин): контракт [I] 000377 не сдвинут симметризацией: .char-panel 0/0/0/0 z-10, char-правило display:none, база .fs-btn цела, строка «Лестница:» на месте', () => {
  const c = cssRuleFirst('char-panel');
  assert.equal(c.position, 'fixed', '.char-panel: position fixed');
  assert.equal(c.top, '0', '.char-panel top 0 (000377)');
  assert.equal(c.left, '0', '.char-panel left 0 (000377)');
  assert.equal(c.right, '0', '.char-panel right 0 (000377)');
  assert.equal(c.bottom, '0', '.char-panel bottom 0 (000377)');
  assert.equal(c['z-index'], '10', '.char-panel z-index 10');

  const hideChar = cssRuleSel('body.' + CHAR_TOKEN + ' .fs-btn');
  assert.equal(hideChar.display, 'none',
    'правило сокрытия под char-токеном — display: none (000377)');

  const base = cssRuleFirst('fs-btn');
  assert.equal(base.position, 'fixed', '.fs-btn база: fixed');
  assert.equal(base.right, '12px', '.fs-btn база: right 12px');
  assert.equal(base.bottom, '12px', '.fs-btn база: bottom 12px');
  assert.equal(base['z-index'], '15',
    '.fs-btn база: z-index 15 (лестница 000017/000256 не меняется)');

  assert.ok(html.includes('Лестница: .char-panel 10 <'),
    'строка лестницы z-index в комментарии index.html цела '
    + '(пин spellbook-oc-button-000332 B2)');
});

// ---------------------------------------------------------------------------
// Слой B — vm ui.js (стаб-дубль tests/ui-panel-fullscreen-000377.test.js;
// companions.js + efir.js в цепочке — порядок по tests/squad-panel.test.js,
// иначе render() уходит в read-only деградацию с console.error)
// ---------------------------------------------------------------------------

function matchesSel(el, sel) {
  const m = /^([a-zA-Z][\w-]*)\[([\w-]+)(?:=([^\]]+))?\]$/.exec(sel);
  if (m) {
    if (String(el.tagName || '').toLowerCase() !== m[1].toLowerCase()) {
      return false;
    }
    const keys = [m[2]];
    if (m[2].startsWith('data-')) keys.push(m[2].slice(5));
    const key = keys.find((k) => k in el.dataset);
    if (key === undefined) return false;
    if (m[3] !== undefined) {
      const val = m[3].replace(/^['"]|['"]$/g, '');
      return String(el.dataset[key]) === val;
    }
    return true;
  }
  if (sel.startsWith('.')) {
    return String(el.className || '').split(/\s+/).includes(sel.slice(1));
  }
  return String(el.tagName || '').toLowerCase() === sel.toLowerCase();
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
  const el = {
    tagName: tag,
    className: '',
    textContent: '',
    title: '',
    disabled: false,
    style: {},
    dataset: {},
    children: [],
    parent: null,
    listeners: {},
    appendChild(ch) {
      if (ch.parent) {
        ch.parent.children.splice(ch.parent.children.indexOf(ch), 1);
      }
      ch.parent = this;
      this.children.push(ch);
      return ch;
    },
    remove() {
      if (this.parent) {
        const i = this.parent.children.indexOf(this);
        if (i >= 0) this.parent.children.splice(i, 1);
        this.parent = null;
      }
    },
    addEventListener(type, fn) {
      (this.listeners[type] || (this.listeners[type] = [])).push(fn);
    },
    setAttribute(name, value) { this.dataset[name] = value; },
    getBoundingClientRect() { return { left: 0, top: 0 }; },
    querySelector(sel) { return findAll(this, sel)[0] || null; },
    querySelectorAll(sel) { return findAll(this, sel); },
    closest(sel) {
      let n = this;
      while (n) {
        if (matchesSel(n, sel)) return n;
        n = n.parent;
      }
      return null;
    },
  };
  Object.defineProperty(el, 'textContent', {
    get() { return this._text; },
    set(v) {
      this._text = String(v);
      for (const ch of this.children) ch.parent = null;
      this.children.length = 0;
    },
  });
  return el;
}

const VM_CHAIN = [
  'global-settings.js', 'perlin.js', 'mapseed.js',
  'skills-data.js', 'items-data.js', 'npc-data.js',
  'portraits-data.js',
  'map.js', 'sheet.js', 'player.js', 'day.js', 'items.js', 'buildings.js',
  'npc.js', 'companions.js', 'efir.js', 'combat.js', 'dungeon.js',
  'controls.js', 'combat-keys.js',
  'party.js',
  'ui-tabs.js', 'ui-tab-skills.js', 'ui-tab-inventory.js',
  'ui-tab-settings.js', 'ui-tab-shop.js', 'ui-tab-quests.js',
  'ui.js',
];

function loadPanelUi(opts) {
  const withInit = !opts || opts.init !== false;
  const errors = [];
  const document = {
    createElement: (tag) => makeEl(tag),
    body: makeEl('body'),
    querySelector: () => null,
    hidden: false,
    listeners: {},
    addEventListener(type, fn) {
      (this.listeners[type] || (this.listeners[type] = [])).push(fn);
    },
    removeEventListener(type, fn) {
      const a = this.listeners[type];
      if (!a) return;
      const i = a.indexOf(fn);
      if (i >= 0) a.splice(i, 1);
    },
  };
  const window = {
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  const sandbox = {
    console: {
      log: () => {}, info: () => {}, warn: () => {},
      error: (m) => errors.push(String(m)),
    },
    document, window, setTimeout, clearTimeout,
  };
  vm.createContext(sandbox);
  for (const f of VM_CHAIN) {
    vm.runInContext(src(f), sandbox, { filename: f });
  }
  const env = { G: sandbox.Game, body: document.body, doc: document, errors };
  assert.equal(errors.length, 0,
    'ошибок при загрузке цепочки нет: ' + errors.join('; '));
  assert.ok(env.G.playerUI, 'Game.playerUI создан');
  assert.ok(env.G.squadUI, 'Game.squadUI создан');
  if (withInit) {
    env.G.squadUI.init({ roster: [], efir: null });
  }
  return env;
}

function squadPanelOf(env) {
  const panel = findAll(env.body, '.squad-panel')[0];
  assert.ok(panel, 'панель .squad-panel подвешена к body');
  return panel;
}

test('000382-S4 (RED): squad toggle(true/false) — токен squad-panel-open на body: появление, снятие, идемпотентность, preserve чужих токенов; независимость от char-токена', () => {
  const env = loadPanelUi();
  env.body.className = 'host-theme zoom-x';

  env.G.squadUI.toggle(true);
  assert.equal(hasToken(env.body, TOKEN), true,
    'toggle(true): токен на document.body (CSS-сокрытие .fs-btn)');
  assert.equal(tokenCount(env.body, TOKEN), 1, 'токен ровно один');
  assert.deepEqual(
    tokensOf(env.body).filter((t) => t !== TOKEN),
    ['host-theme', 'zoom-x'],
    'чужие токены className сохранены (мульти-токен preserve)');
  assert.equal(hasToken(env.body, CHAR_TOKEN), false,
    'открытие [C] НЕ ставит char-токен (независимость панелей)');

  env.G.squadUI.toggle(true);
  assert.equal(tokenCount(env.body, TOKEN), 1,
    'повторный open — идемпотентно (дублей токена нет)');

  env.G.squadUI.toggle(false);
  assert.equal(hasToken(env.body, TOKEN), false,
    'toggle(false): токен снят — кнопка FS снова видима');
  assert.deepEqual(tokensOf(env.body), ['host-theme', 'zoom-x'],
    'после закрытия чужие токены целы');

  // Char-токен при открытой [C] не тронут (общий markPanelOpen preserve).
  const c = env.G.createCharacter();
  env.G.playerUI.setCharacter(c);
  env.G.playerUI.toggle(true);
  env.G.squadUI.toggle(true);
  env.G.playerUI.toggle(false);
  assert.equal(hasToken(env.body, CHAR_TOKEN), false,
    'закрытие [I] сняло свой токен');
  assert.equal(hasToken(env.body, TOKEN), true,
    'закрытие [I] НЕ тронуло squad-токен (открытая [C])');
  env.G.squadUI.toggle(false);
  assert.equal(hasToken(env.body, TOKEN), false, 'close [C] — снят');
});

test('000382-S5 (RED): закрытие [C] через [Esc] и через close-кнопку снимает токен; reopen — ставит', () => {
  const env = loadPanelUi();
  env.G.squadUI.toggle(true);
  assert.equal(hasToken(env.body, TOKEN), true, 'open — токен есть');

  const dispatch = (code) => {
    for (const fn of (env.doc.listeners.keydown || []).slice()) fn({ code });
  };
  dispatch('KeyX');
  assert.equal(hasToken(env.body, TOKEN), true,
    'не-Esc клавиша — токен НЕ тронут');
  dispatch('Escape');
  assert.equal(env.G.squadUI.isOpen(), false, '[Esc] закрыл панель');
  assert.equal(hasToken(env.body, TOKEN), false,
    'закрытие через [Esc] — токен снят (выходы панели идут через toggle)');

  dispatch('Escape');
  assert.equal(hasToken(env.body, TOKEN), false,
    'повторный [Esc] при закрытой панели — без восстановления токена');

  env.G.squadUI.toggle(true);
  assert.equal(hasToken(env.body, TOKEN), true, 'reopen — токен снова стоит');

  const closeBtn = findAll(squadPanelOf(env), '.cp-close')[0];
  assert.ok(closeBtn, 'close-кнопка «закрыть [C]/[Esc]» найдена');
  assert.ok(closeBtn.listeners.click, 'у close-кнопки есть click-слушатель');
  closeBtn.listeners.click[0]();
  assert.equal(env.G.squadUI.isOpen(), false, 'клик close — панель закрыта');
  assert.equal(hasToken(env.body, TOKEN), false,
    'клик close — токен снят');
});

test('000382-S6 (RED): инвариант display панели ⇔ токен на body (в т.ч. авто-toggle); до init — no-op без токена; отсутствие document.body — toggle не бросает', () => {
  const env = loadPanelUi();
  env.G.squadUI.toggle(true);
  const panel = squadPanelOf(env);

  const seq = [true, false, true, true, false];
  for (const open of seq) {
    env.G.squadUI.toggle(open);
    assert.equal(panel.style.display, open ? 'flex' : 'none',
      'display синхронен операции (open=' + open + ')');
    assert.equal(hasToken(env.body, TOKEN), open,
      'токен ⇔ панель открыта (open=' + open + ')');
  }

  // Авто-режим toggle() без force (KeyC/тач-кнопка): show по display —
  // инвариант обязан сохраняться и на этом пути.
  env.G.squadUI.toggle();
  assert.equal(panel.style.display, 'flex', 'авто: открыта');
  assert.equal(hasToken(env.body, TOKEN), true, 'авто: токен стоит');
  env.G.squadUI.toggle();
  assert.equal(panel.style.display, 'none', 'авто: закрыта');
  assert.equal(hasToken(env.body, TOKEN), false, 'авто: токен снят');

  // Guard: panel построена, но document.body недоступен (чужие стабы,
  // ранний teardown) — закрытие НЕ бросает.
  const saved = env.doc.body;
  env.G.squadUI.toggle(true);
  env.doc.body = null;
  assert.doesNotThrow(() => env.G.squadUI.toggle(false),
    'toggle(false) без document.body — без исключения (null-guard)');
  env.doc.body = saved;
  env.G.squadUI.toggle(true);
  assert.equal(hasToken(env.body, TOKEN), true,
    'после восстановления body токен снова пишется');
  env.G.squadUI.toggle(false);

  // До init — toggle no-op: панель не открыта, токена нет (контракт
  // 000086: guard инициализации стоит ДО записи display).
  const fresh = loadPanelUi({ init: false });
  fresh.G.squadUI.toggle(true);
  assert.equal(fresh.G.squadUI.isOpen(), false, 'до init — не открыта');
  const p2 = findAll(fresh.body, '.squad-panel')[0];
  assert.ok(p2, 'панель построена (ленивый build идёт до guard)');
  assert.equal(p2.style.display, 'none', 'до init — display none');
  assert.equal(hasToken(fresh.body, TOKEN), false, 'до init — токена нет');
});

// ---------------------------------------------------------------------------
// Слой C — e2e полная цепь index.html (дубль bootSandbox377 из
// tests/ui-panel-fullscreen-000377.test.js + fullscreen-мок documentElement
// — main.js реально создаёт .fs-btn и инициализирует squadUI)
// ---------------------------------------------------------------------------

const NOW = 1000;

function makeGl382() {
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

function makeContext2d382(el) {
  const calls = el.drawCalls = [];
  return new Proxy({}, {
    get: (t, k) => (k in t ? t[k] : (...args) => { calls.push([k, args]); }),
    set: (t, k, v) => { t[k] = v; return true; },
  });
}

function makeEl382(tag) {
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
      ? makeContext2d382(target) : null);
  }
  return new Proxy(target, {
    get(t, k) {
      if (k in t) return t[k];
      return () => undefined;
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

function bootSandbox382() {
  const winListeners = {};
  const raf = [];
  const errors = [];
  const gameCanvas = makeEl382('canvas');
  const spriteCanvas = makeEl382('canvas');
  const hud = makeEl382('div');
  gameCanvas.getContext = (kind) => (kind === 'webgl'
    ? makeGl382() : makeContext2d382(gameCanvas));
  spriteCanvas.getContext = (kind) => (kind === '2d'
    ? makeContext2d382(spriteCanvas) : null);
  const document = {
    createElement: (tag) => makeEl382(tag),
    getElementById: (id) => (
      id === 'game' ? gameCanvas
        : id === 'sprites' ? spriteCanvas
          : id === 'hud' ? hud
            : null
    ),
    body: makeEl382('body'),
    documentElement: {
      requestFullscreen: () => Promise.resolve(),
    },
    fullscreenElement: null,
    exitFullscreen: () => Promise.resolve(),
    addEventListener() {},
    removeEventListener() {},
    querySelector: (sel) => (
      sel === '.fs-btn'
        ? findAll382(document.body, '.fs-btn')[0] || null : null),
    hidden: false,
  };
  const window = {
    innerWidth: 1280,
    innerHeight: 720,
    location: { search: '' },
    addEventListener: (t, f) => {
      (winListeners[t] || (winListeners[t] = [])).push(f);
    },
    removeEventListener() {},
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
  };
  vm.createContext(sandbox);
  for (const f of CHAIN) {
    vm.runInContext(src(f), sandbox, { filename: f });
  }
  return { sandbox, winListeners, raf, errors };
}

const drain382 = () => new Promise((r) => setImmediate(r));

async function boot382() {
  const h = bootSandbox382();
  for (let i = 0; i < 3; i++) await drain382();
  return h;
}

function frame382(h) {
  h.raf[0](NOW);
}

function press382(h, code) {
  const e = { code, preventDefault() {}, stopPropagation() {} };
  for (const fn of (h.winListeners.keydown || []).slice()) fn(e);
}

function findAll382(root, sel) {
  const out = [];
  const walk = (n) => {
    for (const ch of n.children || []) {
      if (String(ch.className || '').split(/\s+/).includes(sel.slice(1))) {
        out.push(ch);
      }
      walk(ch);
    }
  };
  walk(root);
  return out;
}

test('000382-S7 (RED): e2e — KeyC ставит токен на body и открывает панель (сквозь кадр), РОВНО одна .fs-btn и её display из JS не пишется; повторный KeyC снимает', async () => {
  const h = await boot382();
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет: ' + h.errors.join('; '));
  const G = h.sandbox.Game;
  const doc = h.sandbox.document;
  assert.ok(G.squadUI, 'Game.squadUI в полной цепи');
  const fsBtns = findAll382(doc.body, '.fs-btn');
  assert.equal(fsBtns.length, 1,
    'сценарий: main.js создал ровно одну .fs-btn (зуб FS-2 — DOM-счётчик, '
    + 'CSS-скрытие его не меняет)');

  press382(h, 'KeyC');
  assert.equal(G.squadUI.isOpen(), true, 'KeyC: панель открыта');
  assert.equal(hasToken(doc.body, TOKEN), true,
    'KeyC: токен squad-panel-open на document.body');

  frame382(h);
  assert.equal(hasToken(doc.body, TOKEN), true,
    'кадр main.js — токен жив (кадр className панели не перетирает)');
  assert.equal(G.squadUI.isOpen(), true, 'кадр: панель открыта');
  assert.equal(fsBtns[0].style.display, undefined,
    'сокрытие — ТОЛЬКО CSS-каскад: main/ui display кнопки из JS не пишут');

  press382(h, 'KeyC');
  assert.equal(G.squadUI.isOpen(), false, 'повторный KeyC: панель закрыта');
  assert.equal(hasToken(doc.body, TOKEN), false,
    'закрытие: токен снят — кнопка FS восстановлена каскадом');
  frame382(h);
  assert.equal(hasToken(doc.body, TOKEN), false, 'кадр после закрытия — токена нет');
});

test('000382-S8 (RED): e2e сосуществование — KeyC и KeyI ставят НЕЗАВИСИМЫЕ токены; закрытие одной панели оставляет токен другой', async () => {
  const h = await boot382();
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет: ' + h.errors.join('; '));
  const G = h.sandbox.Game;
  const doc = h.sandbox.document;

  press382(h, 'KeyC');
  press382(h, 'KeyI');
  assert.equal(G.squadUI.isOpen(), true, '[C] открыта');
  assert.equal(G.playerUI.isOpen(), true, '[I] открыта');
  assert.equal(hasToken(doc.body, TOKEN), true, 'squad-токен стоит');
  assert.equal(hasToken(doc.body, CHAR_TOKEN), true, 'char-токен стоит');
  assert.equal(tokenCount(doc.body, TOKEN), 1, 'squad-токен ровно один');
  assert.equal(tokenCount(doc.body, CHAR_TOKEN), 1, 'char-токен ровно один');

  press382(h, 'KeyI');
  assert.equal(G.playerUI.isOpen(), false, '[I] закрыта');
  assert.equal(hasToken(doc.body, CHAR_TOKEN), false, 'char-токен снят');
  assert.equal(hasToken(doc.body, TOKEN), true,
    'закрытие [I] НЕ тронуло squad-токен ([C] всё ещё открыта)');

  press382(h, 'KeyI');
  press382(h, 'KeyC');
  assert.equal(G.squadUI.isOpen(), false, '[C] закрыта');
  assert.equal(hasToken(doc.body, TOKEN), false, 'squad-токен снят');
  assert.equal(hasToken(doc.body, CHAR_TOKEN), true,
    'закрытие [C] НЕ тронуло char-токен ([I] снова открыта)');
  press382(h, 'KeyI');
  assert.equal(hasToken(doc.body, TOKEN), false,
    'после закрытия обеих панелей squad-токена нет');
  assert.equal(hasToken(doc.body, CHAR_TOKEN), false,
    'после закрытия обеих панелей char-токена нет');
});

// Задача 000377: панель персонажа [I] — на весь экран.
// ТЗ: tasks/pending/000377.md. Контракт: memory/000377-panel-fullscreen.md.
//
// Дефицит места (ТЗ «Проблема»): (1) геометрия .char-panel —
// top/left/right 12px + bottom 56px (зарезервированная полоса под
// фиксированной .fs-btn, задача 000017) и (2) «мёртвые» вертикальные
// отступы вокруг таблиц (глобальные .cp-section margin-top 10px,
// .cp-table/.cp-items margin-top 4px).
//
// Решение (зафиксировано анализом 000377):
//   * index.html .char-panel — top/left/right/bottom: 0 (рамка/скругление/
//     padding 12px 14px/z-10 — контур, не «мёртвый» отступ — сохраняются);
//   * отступы таблиц — СКОУП-оверрайды .char-panel .cp-section
//     {margin-top:2px}, .char-panel .cp-table/.cp-items {margin-top:0};
//     ГЛОБАЛЬНЫЕ .cp-* байт-в-байт (их пинуют build-menu-layout и
//     storage-panels-000313-S1e; их же используют оверлеи NPC/крафта);
//   * кнопка FS — вариант (а) ТЗ: скрытие CSS-правилом
//     body.char-panel-open .fs-btn { display: none; }; токен на body
//     пишет ЕДИНСТВЕННАЯ точка смены видимости панели — playerUI.toggle
//     (src/ui.js). Механика FullscreenController (src/fullscreen.js) и
//     DOM-привязка кнопки (src/main.js — inline zIndex 000256) — 0-diff.
//
// Три слоя (конвенция ui-тестов):
//   A — статика index.html + src/ui.js (P1–P5):
//     P1 геометрия .char-panel = 0 по всем четырём лондхендам (RED);
//     P2 .squad-panel (панель [K]) — вне скоупа, bottom 56px инвариантен
//        (guard-пин, зелёный и до, и после);
//     P3 база .fs-btn цела + новое правило сокрытия ПОСЛЕ базы + кросс-
//        контракт токена: селектор CSS и литерал в src/ui.js — один и тот
//        же (RED);
//     P4 скоуп-оверрайды отступов существуют (RED);
//     P5 глобальные .cp-* базы байт-в-байт + скоуп-правила строго ПОСЛЕ
//        баз (first-match парсеры пинов) (guard-пин).
//   B — vm ui.js (стаб и цепь — дубль tests/ui-panel.test.js, дублирование
//     стабов принято): P6 токен на toggle(true/false) — появление/снятие/
//     идемпотентность/preserve чужих токенов/вкладка 'inventory'; P7 —
//     снятие токена путём [Esc]; P8 — инвариант display⇔токен, guard
//     отсутствия document.body, вкладочный путь main-teardown toggle(false).
//   C — e2e полная цепь index.html (паттерн bootSandbox/frameMain из
//     tests/combat-placement-dpad-000376.test.js) + fullscreen-мок
//     documentElement (кнопка реально создаётся main.js): P9 — KeyI
//     ставит токен и открывает панель, кадр — токен жив, повторный KeyI
//     снимает; display кнопки из JS НЕ пишется (сокрытие — только CSS).
//
// КРАСНЫЕ до реализации: P1, P3, P4, P6, P7, P8, P9 (осмысленные
// ERR_ASSERTION — значения/правила/токены ещё не существуют, загрузка
// цепи не падает). ЗЕЛЁНЫЕ guard-пины: P2, P5 (обязаны остаться).
//
// Ре-пин задачи: tests/ui-panel.test.js «CSS: .char-panel — … bottom ≥ 56px»
// переписан на новый контракт (единственный сломанный поведением тест —
// свип 000377).

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

const TOKEN = 'char-panel-open';

function tokensOf(node) {
  return String(node.className || '').split(/\s+/).filter(Boolean);
}
function hasToken(node) {
  return tokensOf(node).includes(TOKEN);
}
function tokenCount(node) {
  return tokensOf(node).filter((t) => t === TOKEN).length;
}

// ---------------------------------------------------------------------------
// Слой A — статика index.html
// ---------------------------------------------------------------------------

// Парсер ui-panel.test.js:357–369 (первое совпадение, НЕ якорный) — им
// пиноватся базы в ui-panel/CI-13 — новый скоуп-селектор не должен
// перехватываться раньше базы.
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

// Парсер build-menu-layout/storage-000313: селектор ЦЕЛИКОМ, якорь
// начала строки — им пиноватся скоупные и составные правила.
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

test('000377-P1 (RED): CSS .char-panel — весь экран: top/left/right/bottom = 0; рамка/padding/z-index без изменений; НЕТ width', () => {
  const p = cssRuleFirst('char-panel');
  assert.equal(p.position, 'fixed', '.char-panel: position fixed (оверлей)');
  assert.equal(p.top, '0', 'top 0 (было 12px — мёртвая кромка)');
  assert.equal(p.left, '0', 'left 0 (было 12px)');
  assert.equal(p.right, '0', 'right 0 (было 12px)');
  assert.equal(p.bottom, '0',
    'bottom 0 (было 56px — полоса под .fs-btn; при открытой панели '
    + 'кнопка скрыта, правило — P3)');
  assert.ok(!/\.char-panel\s*{[^}]*bottom:\s*56px/.test(html),
    'в правиле .char-panel НЕТ строки bottom: 56px');
  // Контур (НЕ «мёртвый» отступ) — сохранён бит-в-байт.
  assert.equal(p.padding, '12px 14px', 'padding контура не тронут');
  assert.equal(p.border, '1px solid #4a4433', 'рамка не тронута');
  assert.equal(p['border-radius'], '12px', 'скругление не тронуто');
  assert.equal(p['z-index'], '10', 'z-index 10 (лестница 10/15/20/30)');
  assert.equal(p.width, undefined, 'фиксированного width НЕТ');
});

test('000377-P2 (guard-пин): .squad-panel (панель [K]) — вне скоупа: геометрия bottom 56px байт-инвариантна', () => {
  const s = cssRuleSel('.squad-panel');
  assert.equal(s.top, '12px', '.squad-panel top 12px (не трогали)');
  assert.equal(s.left, '12px', '.squad-panel left 12px');
  assert.equal(s.right, '12px', '.squad-panel right 12px');
  assert.equal(s.bottom, '56px',
    '.squad-panel bottom 56px — полоса под .fs-btn СОХРАНЕНА (задача '
    + 'только про [I]; для [K] кнопка не скрывается)');
  assert.equal(s['z-index'], '10', '.squad-panel z-index 10');
});

test('000377-P3 (RED): база .fs-btn цела; НОВОЕ правило body.char-panel-open .fs-btn display:none ПОСЛЕ базы; токен CSS ≡ литерал в src/ui.js', () => {
  const base = cssRuleFirst('fs-btn');
  assert.equal(base.position, 'fixed', '.fs-btn база: fixed');
  assert.equal(base.right, '12px', '.fs-btn база: right 12px');
  assert.equal(base.bottom, '12px', '.fs-btn база: bottom 12px');
  assert.equal(base['z-index'], '15',
    '.fs-btn база: z-index 15 (лестница 000017/000256 не меняется)');
  assert.equal(base.display, undefined,
    'БАЗА .fs-btn — без display (сокрытие — только скоуп-правило)');

  const hide = cssRuleSel('body.' + TOKEN + ' .fs-btn');
  assert.equal(hide.display, 'none',
    'при открытой панели [I] кнопка FS скрыта (display: none)');

  // Порядок: база ПЕРВОЙ — first-match парсеры (ui-panel cssRule,
  // CI-13 лестница) обязаны резолвить базу, а не скоуп-правило.
  const iBase = html.search(/^[ \t]*\.fs-btn\s*\{/m);
  const iHide = html.indexOf('body.' + TOKEN + ' .fs-btn');
  assert.ok(iBase >= 0 && iHide >= 0 && iBase < iHide,
    'правило сокрытия стоит ПОСЛЕ базы .fs-btn (первое совпадение — база)');

  // Кросс-контракт: токен, который пишет ui.js, — ровно тот, что в
  // CSS-селекторе (переименование в любом из двух файлов красит тест).
  const selM = html.match(/body\.([A-Za-z0-9_-]+) \.fs-btn\s*\{/);
  assert.ok(selM, 'селектор сокрытия имеет вид body.<токен> .fs-btn');
  const quoted = new RegExp("['\"]" + selM[1] + "['\"]");
  assert.ok(quoted.test(src('ui.js')),
    'src/ui.js содержит литерал токена «' + selM[1] + '» (CSS и JS — '
    + 'один токен; сокрытие разойдётся молча иначе)');
});

test('000377-P4 (RED): скоуп-оверрайды мёртвых отступов таблиц под .char-panel', () => {
  assert.equal(cssRuleSel('.char-panel .cp-section')['margin-top'], '2px',
    '.char-panel .cp-section — margin-top 2px (база 10px)');
  assert.equal(cssRuleSel('.char-panel .cp-table')['margin-top'], '0',
    '.char-panel .cp-table — margin-top 0 (база 4px)');
  assert.equal(cssRuleSel('.char-panel .cp-items')['margin-top'], '0',
    '.char-panel .cp-items — margin-top 0 (база 4px)');
});

test('000377-P5 (guard-пин): глобальные .cp-* базы байт-в-байт (зубья 000202/000313 целы); скоупные правила ПОСЛЕ баз', () => {
  assert.equal(cssRuleSel('.cp-section')['margin-top'], '10px',
    'базовый .cp-section — margin-top 10px');
  assert.equal(cssRuleSel('.cp-section')['font-weight'], '700',
    'базовый .cp-section — font-weight 700');
  const t = cssRuleSel('.cp-table');
  assert.equal(t['margin-top'], '4px', 'базовый .cp-table — margin-top 4px');
  assert.equal(t.width, '100%', 'базовый .cp-table — width 100%');
  assert.equal(cssRuleSel('.cp-items')['margin-top'], '4px',
    'базовый .cp-items — margin-top 4px (пин build-menu-layout:54)');
  assert.equal(cssRuleSel('.cp-tabs')['margin-bottom'], '8px',
    'базовый .cp-tabs — margin-bottom 8px');
  const title = cssRuleSel('.cp-title');
  assert.equal(title['margin-bottom'], '6px',
    'базовый .cp-title — margin-bottom 6px');
  assert.equal(title['font-size'], '15px',
    'базовый .cp-title — font-size 15px (пин storage-000313-S1e)');
  // 000243: .cp-notice — функциональная зона фидбека, НЕ «мёртвый»
  // отступ — база сохраняется полностью.
  const notice = cssRuleSel('.cp-notice');
  assert.equal(notice['margin-top'], '8px', '.cp-notice margin-top 8px');
  assert.equal(notice['min-height'], '16px', '.cp-notice min-height 16px');
  // Порядок для НЕякорных парсеров (ui-panel cssRule(html,'cp-table')
  // и т.п.): первая строка-база обязана идти раньше скоуп-оверрайда.
  for (const name of ['cp-section', 'cp-table', 'cp-items']) {
    const iBase = html.search(new RegExp('^[ \\t]*\\.' + name + '\\s*\\{', 'm'));
    const iScope = html.indexOf('.char-panel .' + name + ' {');
    assert.ok(iBase >= 0, 'база .' + name + ' найдена');
    if (iScope >= 0) {
      assert.ok(iBase < iScope,
        'скоуп-правило .char-panel .' + name + ' стоит ПОСЛЕ базы '
        + '(first-match парсеры пинов резолвят базу)');
    }
  }
});

// ---------------------------------------------------------------------------
// Слой B — vm ui.js (стаб-дубль tests/ui-panel.test.js)
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
  'npc.js', 'combat.js', 'dungeon.js',
  'controls.js', 'combat-keys.js',
  'party.js',
  'ui-tabs.js', 'ui-tab-skills.js', 'ui-tab-inventory.js',
  'ui-tab-settings.js', 'ui-tab-shop.js', 'ui-tab-quests.js',
  'ui.js',
];

function loadPanelUi() {
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
  return env;
}

function panelOf(env) {
  const panel = findAll(env.body, '.char-panel')[0];
  assert.ok(panel, 'панель .char-panel подвешена к body');
  return panel;
}

test('000377-P6 (RED): toggle(true/false) — токен char-panel-open на body: появление, снятие, идемпотентность, preserve чужих токенов', () => {
  const env = loadPanelUi();
  const c = env.G.createCharacter();
  env.G.playerUI.setCharacter(c);
  env.body.className = 'host-theme zoom-x';

  env.G.playerUI.toggle(true);
  assert.equal(hasToken(env.body), true,
    'toggle(true): токен на document.body (CSS-сокрытие .fs-btn)');
  assert.equal(tokenCount(env.body), 1, 'токен ровно один');
  assert.deepEqual(
    tokensOf(env.body).filter((t) => t !== TOKEN),
    ['host-theme', 'zoom-x'],
    'чужие токены className сохранены (мульти-токен preserve)');

  env.G.playerUI.toggle(true);
  assert.equal(tokenCount(env.body), 1,
    'повторный open — идемпотентно (дублей токена нет)');

  env.G.playerUI.toggle(false);
  assert.equal(hasToken(env.body), false,
    'toggle(false): токен снят — кнопка FS снова видима');
  assert.deepEqual(tokensOf(env.body), ['host-theme', 'zoom-x'],
    'после закрытия чужие токены целы');

  // Явная вкладка (тач-[I] → toggle(true,'inventory')) — тот же контракт.
  env.G.playerUI.toggle(true, 'inventory');
  assert.equal(hasToken(env.body), true,
    'open с tabId «inventory» — токен поставлен');
  env.G.playerUI.toggle(false);
  assert.equal(hasToken(env.body), false, 'close — снят');
});

test('000377-P7 (RED): закрытие [Esc] (document keydown-диспетчер панели) снимает токен; reopen — ставит снова', () => {
  const env = loadPanelUi();
  const c = env.G.createCharacter();
  env.G.playerUI.setCharacter(c);

  env.G.playerUI.toggle(true);
  assert.equal(hasToken(env.body), true, 'open — токен есть');

  const dispatch = (code) => {
    for (const fn of (env.doc.listeners.keydown || []).slice()) fn({ code });
  };
  dispatch('KeyX');
  assert.equal(hasToken(env.body), true,
    'не-Esc клавиша — токен НЕ тронут');
  dispatch('Escape');
  assert.equal(env.G.playerUI.isOpen(), false, '[Esc] закрыл панель');
  assert.equal(hasToken(env.body), false,
    'закрытие через [Esc] — токен снят (выходы панели идут через toggle)');

  dispatch('Escape');
  assert.equal(hasToken(env.body), false,
    'повторный [Esc] при закрытой панели — без восстановления токена');

  env.G.playerUI.toggle(true);
  assert.equal(hasToken(env.body), true, 'reopen — токен снова стоит');
});

test('000377-P8 (RED): инвариант display панели ⇔ токен на body; отсутствие document.body — toggle не бросает', () => {
  const env = loadPanelUi();
  const c = env.G.createCharacter();
  env.G.playerUI.setCharacter(c);
  const panel = (() => {
    env.G.playerUI.toggle(true);
    return panelOf(env);
  })();

  const seq = [true, false, true, true, false];
  for (const open of seq) {
    env.G.playerUI.toggle(open);
    assert.equal(panel.style.display, open ? 'flex' : 'none',
      'display синхронен операции (open=' + open + ')');
    assert.equal(hasToken(env.body), open,
      'токен ⇔ панель открыта (open=' + open + ')');
  }

  // Авто-режим toggle() без force (Кнопка [I]/KeyI): show считается по
  // display — инвариант обязан сохраняться и на этом пути.
  env.G.playerUI.toggle();
  assert.equal(panel.style.display, 'flex', 'авто: открыта');
  assert.equal(hasToken(env.body), true, 'авто: токен стоит');
  env.G.playerUI.toggle();
  assert.equal(panel.style.display, 'none', 'авто: закрыта');
  assert.equal(hasToken(env.body), false, 'авто: токен снят');

  // Guard: панель построена, но document.body недоступен (чужие стабы,
  // ранний teardown) — закрытие НЕ бросает.
  const saved = env.doc.body;
  env.G.playerUI.toggle(true);
  env.doc.body = null;
  assert.doesNotThrow(() => env.G.playerUI.toggle(false),
    'toggle(false) без document.body — без исключения (null-guard)');
  env.doc.body = saved;
  env.G.playerUI.toggle(true);
  assert.equal(hasToken(env.body), true,
    'после восстановления body токен снова пишется');
});

// ---------------------------------------------------------------------------
// Слой C — e2e полная цепь index.html (стаб-дубль
// tests/combat-placement-dpad-000376.test.js:576-659 + fullscreen-мок
// documentElement — main.js реально создаёт .fs-btn)
// ---------------------------------------------------------------------------

const NOW = 1000;

function makeGl377() {
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

function makeContext2d377(el) {
  const calls = el.drawCalls = [];
  return new Proxy({}, {
    get: (t, k) => (k in t ? t[k] : (...args) => { calls.push([k, args]); }),
    set: (t, k, v) => { t[k] = v; return true; },
  });
}

function makeEl377(tag) {
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
      ? makeContext2d377(target) : null);
  }
  return new Proxy(target, {
    get(t, k) {
      if (k in t) return t[k];
      return () => undefined;
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

function bootSandbox377() {
  const winListeners = {};
  const raf = [];
  const errors = [];
  const gameCanvas = makeEl377('canvas');
  const spriteCanvas = makeEl377('canvas');
  const hud = makeEl377('div');
  gameCanvas.getContext = (kind) => (kind === 'webgl'
    ? makeGl377() : makeContext2d377(gameCanvas));
  spriteCanvas.getContext = (kind) => (kind === '2d'
    ? makeContext2d377(spriteCanvas) : null);
  const document = {
    createElement: (tag) => makeEl377(tag),
    getElementById: (id) => (
      id === 'game' ? gameCanvas
        : id === 'sprites' ? spriteCanvas
          : id === 'hud' ? hud
            : null
    ),
    body: makeEl377('body'),
    // Fullscreen API мок (паттерн fullscreen-button-overlay): main.js
    // создаёт .fs-btn — DOM-привязка кнопки в сценарии реально есть.
    documentElement: {
      requestFullscreen: () => Promise.resolve(),
    },
    fullscreenElement: null,
    exitFullscreen: () => Promise.resolve(),
    addEventListener() {},
    removeEventListener() {},
    querySelector: (sel) => (
      sel === '.fs-btn'
        ? findAll377(document.body, '.fs-btn')[0] || null : null),
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

const drain377 = () => new Promise((r) => setImmediate(r));

async function boot377() {
  const h = bootSandbox377();
  for (let i = 0; i < 3; i++) await drain377();
  return h;
}

function frame377(h) {
  h.raf[0](NOW);
}

function press377(h, code) {
  const e = { code, preventDefault() {}, stopPropagation() {} };
  for (const fn of (h.winListeners.keydown || []).slice()) fn(e);
}

function findAll377(root, sel) {
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

test('000377-P9 (RED): e2e — KeyI ставит токен на body и открывает панель (сквозь кадр), повторный KeyI снимает; display кнопки из JS не пишется', async () => {
  const h = await boot377();
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет: ' + h.errors.join('; '));
  const G = h.sandbox.Game;
  const doc = h.sandbox.document;
  assert.ok(G.playerUI, 'Game.playerUI в полной цепи');
  const fsBtns = findAll377(doc.body, '.fs-btn');
  assert.equal(fsBtns.length, 1,
    'сценарий: main.js создал ровно одну .fs-btn (fullscreen-мок)');

  press377(h, 'KeyI');
  assert.equal(G.playerUI.isOpen(), true, 'KeyI: панель открыта');
  assert.equal(hasToken(doc.body), true,
    'KeyI: токен char-panel-open на document.body');

  frame377(h);
  assert.equal(hasToken(doc.body), true,
    'кадр main.js — токен жив (кадр className панели не перетирает)');
  assert.equal(G.playerUI.isOpen(), true, 'кадр: панель открыта');
  assert.equal(fsBtns[0].style.display, undefined,
    'сокрытие — ТОЛЬКО CSS-каскад: main/ui display кнопки из JS не пишут');

  press377(h, 'KeyI');
  assert.equal(G.playerUI.isOpen(), false, 'повторный KeyI: панель закрыта');
  assert.equal(hasToken(doc.body), false,
    'закрытие: токен снят — кнопка FS восстановлена каскадом');
  frame377(h);
  assert.equal(hasToken(doc.body), false, 'кадр после закрытия — токена нет');
});

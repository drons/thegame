// Задача 000351: кнопка книги магии [B] — одного размера с [C]/[I]/[E]
// и в ОДНОМ блоке с ними (сейчас выбивается размером/контейнером).
//
// Корень (анализ): [E]/[I]/[C] — button.tc-action в #touch-controls
// (src/ui.js, раскладка G.layoutTouchControls — src/controls.js, стопка
// снизу вверх E,I,C с зазором TOUCH_ACTION_GAP), а [B] — ОТДЕЛЬНАЯ
// body-кнопка .spellbook-oc-btn (src/main.js, 36×36, fixed правый верх,
// CSS-правило + frame-lift z-25). Фикс: 'spellbook' — четвёртое действие
// раскладки (стопка E,I,C,B — [B] НАД [C]), 4-я кнопка .tc-action в
// #touch-controls (иконка assets/ui/combat_spellbook.svg, та же
// единица видимости buttons, pointerdown+preventDefault+blur как
// сиблинги); старый DOM/CSS/z-lift удаляются. Роут тот же:
// G.spellbookOC.toggle() (blocked-политика сохраняется).
//
// Харнес (конвенция — per-file дубли): T1–T3 — чистые функции
// controls.js (require, как tests/controls.test.js); T4–T6 — vm-сборка
// ПОЛНОЙ цепочки index.html (дубль tests/spellbook-oc-button-000332).
//
//   T1 раскладка: spellbook — 4-й прямоугольник правой колонки
//     (800×600: {688,164,96,96}), тот же размер/колонка, зазор 12,
//     TOUCH_ACTIONS += 'spellbook' — RED (undefined / 7 элементов).
//   T2 формула: низкий/узкий вьюпорт — 4·B+3·gap влезает (новый
//     /4-член B); высокие вьюпорты — action/inventory/squad бит-в-бит
//     прежние; невалидные/inset-перебор → spellbook нулевой — RED.
//   T3 хит-тест: центр/угол spellbook → 'spellbook', зазор → null,
//     регрессии E/I/C/D-pad; legacy-layout без spellbook — деградация;
//     в бой/spellbook не роутится (TOUCH_KEY_CODES/delta) — RED.
//   T4 DOM: в #touch-controls РОВНО 4 .tc-action, последний — книга
//     (иконка combat_spellbook.svg, alt=''); тап=pointerdown →
//     preventDefault + книга открыта; KeyB закрывает; click-слушателя
//     нет; в body НЕТ .spellbook-oc-btn — RED (3 кнопки + старая).
//   T5 CSS: правило .spellbook-oc-btn ОТСУТСТВУЕТ (и упоминаний в
//     index.html нет); гварды #touch-controls z-30 / .tc-action /
//     .tc-action img / .spellbook-oc z-35 целы — RED.
//   T6 visibility: бой — display:none у ВСЕХ четырёх; после боя '';
//     подземелье — книга видима и inline zIndex НЕ задаётся (frame-lift
//     снят); src/main.js не содержит 'spellbook-oc-btn' — RED.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const C = require('../src/controls.js');
const S = require('../src/save.js');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const mainCode = fs.readFileSync(
  path.join(ROOT, 'src', 'main.js'), 'utf8');

// ---------------------------------------------------------------------------
// T1–T3: чистая геометрия/хит-тест (controls.js)
// ---------------------------------------------------------------------------

test('T1 (000351): раскладка — spellbook 4-м прямоугольником стопки E,I,C,B; TOUCH_ACTIONS', () => {
  assert.deepEqual(C.TOUCH_ACTIONS,
    ['up', 'down', 'left', 'right', 'interact', 'inventory', 'squad',
      'spellbook'],
    'RED: TOUCH_ACTIONS — 8 действий, с spellbook (стопка E,I,C,B)');
  const L = C.layoutTouchControls(800, 600);
  // B = 96 (новый /4-член floor((568−36)/4)=133 НЕ активен) — колонка
  // x=688: action 488, inventory 380, squad 272, spellbook 164.
  assert.deepEqual(L.spellbook, { x: 688, y: 164, w: 96, h: 96 },
    'RED: spellbook {688,164,96,96} — та же колонка, над squad');
  // Стопка снизу вверх: action/inventory/squad — бит-в-бит прежние.
  assert.deepEqual(L.action, { x: 688, y: 488, w: 96, h: 96 });
  assert.deepEqual(L.inventory, { x: 688, y: 380, w: 96, h: 96 });
  assert.deepEqual(L.squad, { x: 688, y: 272, w: 96, h: 96 });
  // Тот же размер и колонка, что у [E] (ТЗ: «одного размера»).
  assert.equal(L.spellbook.w, L.action.w,
    'RED: кнопка [B] того же размера, что [E]');
  assert.equal(L.spellbook.h, L.action.h);
  assert.equal(L.spellbook.x, L.action.x, 'та же правая колонка');
  // Зазор squad→spellbook = TOUCH_ACTION_GAP (12).
  assert.equal(L.squad.y - (L.spellbook.y + L.spellbook.h), 12,
    'зазор между «Отряд» и книгой = 12 px');
  // В вьюпорте.
  assert.ok(L.spellbook.y >= 0 && L.spellbook.y + L.spellbook.h <= 600);
});

test('T2 (000351): формула B с 4-м членом — стопка влезает на низком/узком; высокие вьюпорты без регрессий; невалидные и inset-перебор → нули', () => {
  // Низкий вьюпорт 800×140: availH=108 → B = min(...,floor((108−36)/4)=18).
  const low = C.layoutTouchControls(800, 140);
  assert.deepEqual(low.spellbook, { x: 766, y: 16, w: 18, h: 18 },
    'RED: 800×140 — spellbook {766,16,18,18} (B ужимается под 4 кнопки)');
  assert.deepEqual(low.squad, { x: 766, y: 46, w: 18, h: 18 });
  // 4·18 + 3·12 = 108 = availH — стопка влезает ровно, верх на M=16.
  assert.ok(low.spellbook.y >= 0 && low.spellbook.y + low.spellbook.h <= 140);
  // Узкий 100×120: availW=68, availH=88 → B = floor((88−36)/4) = 13.
  const narrow = C.layoutTouchControls(100, 120);
  assert.deepEqual(narrow.spellbook, { x: 71, y: 16, w: 13, h: 13 },
    'RED: 100×120 — spellbook {71,16,13,13}');
  assert.deepEqual(narrow.squad, { x: 71, y: 41, w: 13, h: 13 });
  assert.ok(narrow.spellbook.x >= 0
    && narrow.spellbook.x + narrow.spellbook.w <= 100);
  assert.ok(narrow.spellbook.y >= 0
    && narrow.spellbook.y + narrow.spellbook.h <= 120);
  // Типичные вьюпорты — без регрессий хитбоксов E/I/C.
  const base = C.layoutTouchControls(800, 600);
  assert.deepEqual(base.action, { x: 688, y: 488, w: 96, h: 96 });
  assert.deepEqual(base.inventory, { x: 688, y: 380, w: 96, h: 96 });
  assert.deepEqual(base.squad, { x: 688, y: 272, w: 96, h: 96 });
  const wide = C.layoutTouchControls(1280, 720);
  assert.deepEqual(wide.action, { x: 1168, y: 608, w: 96, h: 96 });
  assert.deepEqual(wide.spellbook, { x: 1168, y: 284, w: 96, h: 96 });
  // Невалидные размеры → spellbook тоже нулевой (как прочие).
  for (const [w, h] of [[0, 600], [-5, 600], [NaN, 600], [800, 0]]) {
    const bad = C.layoutTouchControls(w, h);
    assert.deepEqual(bad.spellbook, { x: 0, y: 0, w: 0, h: 0 },
      'RED: невалидный вьюпорт (' + w + '×' + h + ') — spellbook нулевой');
  }
  // Гигантский bottomInset — кнопка не влезает → B = 0.
  const over = C.layoutTouchControls(800, 600, { bottomInset: 1e6 });
  assert.equal(over.spellbook.w, 0, 'RED: inset-перебор — spellbook.w = 0');
  assert.equal(over.spellbook.h, 0);
  // bottomInset=48 (fs-btn): стопка поднимается целиком, B не меняется.
  const lifted = C.layoutTouchControls(800, 600, { bottomInset: 48 });
  assert.equal(lifted.spellbook.w, 96);
  assert.equal(lifted.spellbook.y, base.spellbook.y - 48,
    'стопка с inset поднимается на inset');
});

test('T3 (000351): хит-тест — точка в spellbook → spellbook; без регрессий; без роутинга в бой', () => {
  const L = C.layoutTouchControls(800, 600);
  // Центр и угол spellbook {688,164,96,96} (эталон — мимо L.spellbook,
  // чтобы на HEAD был осмысленный assert, а не TypeError).
  assert.equal(C.touchActionAt(688 + 48, 164 + 48, L), 'spellbook',
    "RED: центр книги → 'spellbook'");
  assert.equal(C.touchActionAt(688 + 2, 164 + 2, L), 'spellbook',
    'RED: угол книги → spellbook');
  // Точка в зазоре squad→spellbook (260..272) — null.
  assert.equal(C.touchActionAt(736, 266, L), null,
    'зазор squad→spellbook — мимо кнопок');
  // Регрессии: squad/inventory/interact — без изменений.
  assert.equal(C.touchActionAt(736, 320, L), 'squad');
  assert.equal(C.touchActionAt(736, 428, L), 'inventory');
  assert.equal(C.touchActionAt(736, 536, L), 'interact');
  // D-pad: направление и мёртвая зона — без изменений.
  const d = L.dpad;
  assert.equal(C.touchActionAt(d.x + d.w / 2 + d.w * 0.3, d.y + d.h / 2, L),
    'right');
  assert.equal(C.touchActionAt(d.x + d.w / 2, d.y + d.h / 2, L), null,
    'центр D-pad — мёртвая зона');
  // Мёртвая зона над всей стопкой — null.
  assert.equal(C.touchActionAt(736, 100, L), null);
  // Legacy layout без spellbook (HEAD-объект) — деградация, не крах.
  const legacy = { dpad: d, action: L.action, inventory: L.inventory,
    squad: L.squad };
  assert.equal(C.touchActionAt(736, 320, legacy), 'squad',
    'legacy-раскладка без spellbook — squad работает');
  assert.equal(C.touchActionAt(736, 212, legacy), null,
    'legacy: точка бывшей книги — null (не крах)');
  // В бой/spellbook НЕ роутится (как inventory/squad): кода нет.
  assert.equal(C.TOUCH_KEY_CODES.spellbook, undefined,
    'spellbook не даёт e.code (в бой не роутится)');
  assert.equal(C.touchKeyCode('spellbook'), null);
  assert.equal(C.deltaForMoveKey('touch:spellbook'), null,
    'touch:spellbook — не направление движения');
});

// ---------------------------------------------------------------------------
// T4–T6: vm-сборка ПОЛНОЙ цепочки index.html (дубль
// tests/spellbook-oc-button-000332.test.js — конвенция per-file)
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

function press(h, code) {
  return key(h, code);
}

function release(h, code) {
  for (const fn of (h.winListeners['keyup'] || []).slice()) {
    fn({ code });
  }
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

test('T4 (000351): DOM — РОВНО 4-я кнопка .tc-action в #touch-controls (иконка combat_spellbook.svg); тап=pointerdown открывает; KeyB закрывает; click-слушателя и body-.spellbook-oc-btn нет', async () => {
  const h = await boot();
  dismissStartWindow(h);
  const G = h.sandbox.Game;
  const root = touchRoot(h);
  const btns = tcButtons(root);
  assert.equal(btns.length, 4,
    'RED: в #touch-controls РОВНО 4 кнопки .tc-action (E, I, «Отряд», '
    + 'книга): ' + btns.length);
  const sb = byIcon(root, 'combat_spellbook.svg');
  assert.ok(sb,
    'RED: кнопка книги (иконка assets/ui/combat_spellbook.svg) — в '
    + '#touch-controls, а не отдельным body-элементом');
  assert.equal(sb, btns[btns.length - 1],
    'RED: книга — КОНЕЧНАЯ кнопка блока (стопка E,I,C,B)');
  assert.equal(String(sb.tagName).toLowerCase(), 'button',
    'кнопка книги — button (тот же класс tc-action, что [E]/[I]/[C])');
  assert.equal(sb.className, 'tc-action', 'общий класс .tc-action');
  const imgs = sb.children.filter((c) =>
    String(c.tagName).toLowerCase() === 'img');
  assert.equal(imgs.length, 1, 'ОДИН дочерний img (иконка)');
  assert.equal(imgs[0].alt, '',
    "alt='' — иконка презентационная (паттерн E/I/C, 000124)");
  // Тап = pointerdown (не click): preventDefault + роут toggle().
  const pd = sb.listeners.pointerdown;
  assert.ok(pd && pd.length === 1,
    'RED: у кнопки книги ровно один pointerdown-слушатель');
  assert.equal(sb.listeners.click, undefined,
    'click-слушателя нет (compatibility-click после pointerdown '
    + 'повторно роутнул бы toggle — открыл/закрыл за один тап)');
  let pdCalls = 0;
  pd[0]({ pointerId: 1, preventDefault: () => { pdCalls++; } });
  assert.equal(pdCalls, 1, 'тап: preventDefault вызван');
  assert.equal(G.spellbookOC.isOpen(), true,
    'RED: тап по 4-й кнопке открывает книгу (тот же роут, что [B])');
  assert.ok(h.body.querySelector('.spellbook-oc'),
    'книга открыта (.spellbook-oc в body)');
  key(h, 'KeyB');
  assert.equal(G.spellbookOC.isOpen(), false,
    'KeyB закрывает книгу (тот же роут)');
  // Старый контейнер исчез: в body нет .spellbook-oc-btn.
  for (const c of h.body.children) {
    assert.ok(!String(c.className || '').includes('spellbook-oc-btn'),
      'RED: в body больше нет отдельной кнопки .spellbook-oc-btn');
  }
});

test('T5 (000351): CSS — правило .spellbook-oc-btn удалено из index.html; гварды блока контролов целы', () => {
  assert.ok(!html.includes('.spellbook-oc-btn'),
    'RED: упоминания .spellbook-oc-btn в index.html быть не должно '
    + '(правило и лестничный сегмент удаляются — кнопка живёт в '
    + '#touch-controls как .tc-action)');
  // Гварды: контейнер и общий стиль кнопки не пострадали.
  const tc = html.match(/#touch-controls\s*\{([^}]*)\}/);
  assert.ok(tc && /z-index:\s*30/.test(tc[1]),
    'гард: #touch-controls сохраняет z-index 30 (над оверлеями 20)');
  const tca = html.match(/\.tc-action\s*\{([^}]*)\}/);
  assert.ok(tca && /border-radius:\s*50%/.test(tca[1])
    && /display:\s*flex/.test(tca[1]),
    'гард: .tc-action сохраняет круглую форму и flex-центрирование');
  const tci = html.match(/\.tc-action img\s*\{([^}]*)\}/);
  assert.ok(tci && /width:\s*60%/.test(tci[1]),
    'гард: .tc-action img сохраняет 60%');
  const sb = html.match(/\.spellbook-oc\s*\{([^}]*)\}/);
  assert.ok(sb && /z-index:\s*35/.test(sb[1]),
    'гард: оверлей книги .spellbook-oc остаётся z-35 (над блоком 30)');
});

test('T6 (000351): visibility — бой: display:none у всех 4-х; после боя — восстановлены; подземелье: книга видима без inline z-lift; main.js без spellbook-oc-btn', async () => {
  assert.ok(!mainCode.includes('spellbook-oc-btn'),
    'RED: src/main.js больше не создаёт .spellbook-oc-btn (ни класс, '
    + 'ни frame-lift)');
  const h = await boot();
  dismissStartWindow(h);
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  const root = touchRoot(h);
  const sb = byIcon(root, 'combat_spellbook.svg');
  assert.ok(sb, 'RED: кнопка книги в #touch-controls (общая фикстура T6)');
  const btns = tcButtons(root);
  assert.equal(btns.length, 4, 'фикстура: 4 кнопки');
  // До боя — все видны.
  h.frameFn(NOW + 16);
  for (const b of btns) {
    assert.notEqual(b.style.display, 'none', 'до боя — видно');
  }
  // Бой: ВСЕ четыре скрыты одной единицей buttons (как E/I/C).
  const c0 = g.actions.startCombat();
  assert.ok(c0, 'отладочный бой начат');
  assert.equal(G.combatUI.isActive(), true, 'боевой оверлей активен');
  h.frameFn(NOW + 32);
  for (const b of btns) {
    assert.equal(b.style.display, 'none',
      'RED: бой — все 4 кнопки .tc-action скрыты (книга — в общем '
      + 'юните buttons, больше не висит над оверлеем)');
  }
  resolveCombat(G);
  h.frameFn(NOW + 48);
  for (const b of btns) {
    assert.equal(b.style.display, '',
      'после конца боя — все 4 восстановлены (restore — «»)');
  }
  // Подземелье: книга видима, frame-lift снят (inline zIndex не
  // задаётся вовсе — контейнер #touch-controls z-30 сам над оверлеем).
  g.actions.enterDungeon();
  h.frameFn(NOW + 64);
  assert.notEqual(sb.style.display, 'none',
    'подземелье — книга видима (кнопки скрыты только на '
    + 'бой/инвентарь/вход, 000150)');
  assert.ok(sb.style.zIndex === undefined || sb.style.zIndex === '',
    'RED: frame-lift z-25 снят — inline zIndex не задаётся: '
    + JSON.stringify(sb.style.zIndex));
  press(h, 'KeyE');
  release(h, 'KeyE');
  assert.equal(g.dungeon, null, '[E] — выход из локации');
});

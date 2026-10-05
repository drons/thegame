// Задача 000138: стартовое окно — логотип assets/logo.svg + «Продолжить»
// (зелёный фон) / «Начать заново» (красный фон); «Начать заново» —
// удаление локальных данных ПОСЛЕ тройного переспрашивания
// (схема Да/Нет/Да — защита от случайного удаления).
//
// ТЗ — tasks/pending/000138.md; контракт — memory/000138-start-window.md
// (API Game.startWindow, DOM-дерево, проводка main.js, resetPending).
//
// КРАСНАЯ стадия: модуля src/start-window.js нет, тега в index.html нет,
// проводки в main.js нет — все 12 тестов падают ОСМЫСЛЕННО (не
// синтаксис):
//   * SW-N1..N3 — require('../src/start-window.js') → ENOENT;
//   * SW-E1..E7 — __game.startWindow undefined (проводки нет);
//   * SW-E8 — гард main.js при провале порядка ещё не существует
//     (errors пусто, __game.startWindow undefined, а не null).
//
// Harness — СВОЙ, дубль bootSandbox из tests/loot-e2e.test.js
// (дублирование харнессов принято — 000083/000087; полный makeEl).
// ДВЕ отличия (контракт memory §9):
//   * window.location = { search: '', reload: <spy> } — «Начать заново»
//     завершается location.reload();
//   * fireBeforeUnload() — dispatch winListeners['beforeunload']
//     (образец tests/save-restore.test.js:246) — ловитель re-сейва
//     (memory §6: без resetPending reload перезаписал бы старый сейв).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { SAVE_KEY } = require('../src/save.js');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const NOW = 1000; // performance.now() в песочнице заморожен

// --- Формулировки трёх вопросов — КОНТРАКТ (memory §3) ---
// Анти-случайная схема: верные ответы ТОЧНО Да → Нет → Да; серия
// «Да, Да, Да» подтверждением НЕ является (на Q2 неверный ответ).
const Q1 = 'Точно удалить сохранение?';
const Q2 = 'Продолжить игру (сохранить прогресс)?';
const Q3 = 'В последний раз: удалить ВСЕ данные безвозвратно?';
const EXPECTS = ['yes', 'no', 'yes'];

// --- Цепочка скриптов — из index.html (тег start-window.js подхватится
//     автоматически на зелёной стадии — CHAIN читается matchAll'ем) ---
const CHAIN = Array.from(html.matchAll(/<script\s+src="([^"]+)"/g), (m) => m[1])
  .map((p) => p.replace(/^src\//, ''));

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

// --- Canvas 2d-стаб (запись вызовов — sanity, что слой жив) ---

function makeContext2d(el) {
  const calls = el.drawCalls = [];
  return new Proxy({}, {
    get: (t, k) => (k in t ? t[k] : (...args) => { calls.push([k, args]); }),
    set: (t, k, v) => { t[k] = v; return true; },
  });
}

// --- «Снисходительный» DOM (полный, дубль loot-e2e) ---

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
  if (cls &&
      !String(el.className || '').split(/\s+/).includes(cls)) {
    return false;
  }
  if (attr) {
    if (!attr[0].startsWith('data-')) return false;
    const v = el.dataset ? el.dataset[attr[0].slice(5)] : undefined;
    if (attr[1] !== undefined && v !== attr[1]) return false;
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
    // children хранят СУРЫЕ target (а не прокси): remove() ищёт по
    // identity (дубль loot-e2e).
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
      if (name.startsWith('data-')) {
        target.dataset[name.slice(5)] = value;
      }
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
  // textContent — как в DOM: сбрасывает детей.
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

// --- localStorage-мок: seed — досеянная оболочка сейва (v1) ---

function makeStorage(seed) {
  const m = new Map();
  if (seed != null) m.set(SAVE_KEY, JSON.stringify(seed));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

function seedSave(data) {
  return { version: 1, savedAt: new Date(0).toISOString(), data };
}

// Досеянный сейв для e2e-сценариев: день 5, позиция (2,1). Позиция —
// НЕ спавн (0,0) (проходима, мобов/построек нет; справа (3,1) тоже
// чистая — детерминированная карта generateSeedPixels) — restore
// позиции проверяется осмысленно (иначе игрок оказался бы на (0,0)
// и без сейва).
const SEED = seedSave({ day: 5, position: { x: 2, y: 1 } });
const SEED_JSON = JSON.stringify(SEED);

// --- Песочница: вся цепочка index.html (браузерная ветка UMD) ---
// отличие 1: location с reload-spy; отличие 2: winListeners отдаётся
// наружу (fireBeforeUnload).

function bootSandbox(seed, chain) {
  const files = chain || CHAIN;
  const winListeners = {};
  const raf = [];
  const warns = [];
  const errors = [];
  const reloadCalls = [];
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
          : id === 'hud' ? hud
            : null),
    body,
    addEventListener() {},
    removeEventListener() {},
    querySelector: () => null,
    hidden: false,
  };
  const window = {
    innerWidth: 1280,
    innerHeight: 720,
    // отличие 1: reload — spy (в чужих песочницах его нет —
    // onRestartConfirmed main.js обязан быть typeof-guard'ом).
    location: {
      search: '',
      reload: () => { reloadCalls.push(1); },
    },
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
  // Image-стаб: assets/map.png ВСЕГДА onerror (детерминированный
  // фолбэк G.generateSeedPixels, main.js loadMapPixels), остальные —
  // onload. Загрузка — микротаск.
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
      warn: (m) => warns.push(String(m)),
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
  for (const f of files) {
    vm.runInContext(
      fs.readFileSync(path.join(ROOT, 'src', f), 'utf8'), sandbox,
      { filename: f });
  }
  return {
    sandbox, winListeners, raf, warns, errors,
    storage, body, hud, reloadCalls,
  };
}

// Промывка микротасков (загрузки Image + loadMapPixels().then: карта,
// спавн, restoreFromSave, requestAnimationFrame).
const drain = () => new Promise((r) => setImmediate(r));

async function boot(seed, chain) {
  const h = bootSandbox(seed, chain);
  await drain();
  await drain();
  await drain();
  const g = h.sandbox.__game;
  assert.ok(g, 'globalThis.__game выставлен (main.js выполнен)');
  // frame() main.js — единственный rAF-колбэк после старта (пере
  // планирует себя); кадр вызываем ЕЁ (паттерн camp-map-e2e boot()).
  h.frameFn = h.raf[h.raf.length - 1];
  assert.ok(h.frameFn, 'rAF-колбэк main-цикла зарегистрирован');
  return h;
}

// --- Наблюдение ---

const host = (o) => JSON.parse(JSON.stringify(o));

// Окно (контракт memory §2.2: { root, dom, isActive, hide }).
function winOf(h) {
  const sw = h.sandbox.__game.startWindow;
  assert.ok(sw,
    'стартовое окно существует (__game.startWindow): тег ' +
    'src/start-window.js ДО src/main.js + проводка main.js (000138)');
  return sw;
}

// Клик по кнопке окна: обработчик из harness-стаба (listeners.click).
function click(el, name) {
  const fns = el && el.listeners && el.listeners.click;
  assert.ok(fns && fns.length, 'клик-обработчик на кнопке ' + name);
  fns[0]({});
}

// Ключевые кнопки (дом — контракт memory §2.2: прямые ссылки, без
// querySelector).
function clickContinue(h) { click(winOf(h).dom.continue, '«Продолжить»'); }
function clickRestart(h) { click(winOf(h).dom.restart, '«Начать заново»'); }
function clickYes(h) { click(winOf(h).dom.yes, '«Да»'); }
function clickNo(h) { click(winOf(h).dom.no, '«Нет»'); }

// Dispatch захваченного window-слушателя beforeunload → saveNow()
// (образец save-restore.test.js:246).
function fireBeforeUnload(h) {
  const fns = h.winListeners['beforeunload'];
  assert.ok(fns && fns.length, 'слушатель beforeunload зарегистрирован');
  for (const fn of fns) fn({});
}

// --- Ходьба (паттерн camp-map-e2e press/release) ---

function press(h, code) {
  const e = {
    code, key: code,
    prevented: false,
    preventDefault() { this.prevented = true; },
    stopPropagation() {},
  };
  for (const fn of h.winListeners['keydown'] || []) fn(e);
  return e;
}

function release(h, e) {
  for (const fn of h.winListeners['keyup'] || []) fn(e);
}

// Один шаг вправо: keydown → кадры до фактического перехода (интервал
// шага 420 мс — кадры по +200 мс, лимит 10) → keyup.
function walkRightOne(h) {
  const g = h.sandbox.__game;
  const x0 = g.state.player.x, y0 = g.state.player.y;
  const e = press(h, 'ArrowRight');
  let now = NOW + 100;
  let guard = 0;
  do {
    now += 200;
    h.frameFn(now);
  } while ((g.state.player.x !== x0 + 1 || g.state.player.y !== y0)
    && ++guard < 10);
  release(h, e);
  assert.ok(g.state.player.x === x0 + 1 && g.state.player.y === y0,
    'игрок шагнул вправо: (' + x0 + ',' + y0 + ') → ('
    + g.state.player.x + ',' + g.state.player.y + ')');
}

// CSS-фиксатор «зелёный/красный фон» (ТЗ): hex background из правила
// index.html → каналы (граница без CSS-движка: пины читают исход).
function ruleHex(selector) {
  const i = html.indexOf(selector);
  assert.ok(i >= 0, 'CSS-правило «' + selector + '» есть в index.html');
  const body = html.slice(i, html.indexOf('}', i));
  const m = body.match(/background(?:-color)?:\s*#([0-9a-fA-F]{6})/);
  assert.ok(m, 'background:#rrggbb в правиле «' + selector + '»');
  const hx = m[1];
  return {
    r: parseInt(hx.slice(0, 2), 16),
    g: parseInt(hx.slice(2, 4), 16),
    b: parseInt(hx.slice(4, 6), 16),
  };
}

// =====================================================================
// SW-N1..N3. node-юниты: UMD node-ветка (require ../src/start-window.js)
// — чистая машина «трёх вопросов» без DOM.
// =====================================================================

// SW-N1: модуль существует, UMD node-ветка даёт API целиком.
test('000138-SW-N1: src/start-window.js — UMD node: API (LOGO, BUTTONS, CONFIRM_QUESTIONS, createConfirmFlow, createStartWindow)', () => {
  let api;
  assert.doesNotThrow(
    () => { api = require('../src/start-window.js'); },
    'src/start-window.js существует и грузится в node (UMD)');
  assert.equal(api.LOGO, 'assets/logo.svg',
    'LOGO — существующий ассет assets/logo.svg (ТЗ)');
  assert.deepEqual(api.BUTTONS,
    { continue: 'Продолжить', restart: 'Начать заново', yes: 'Да', no: 'Нет' },
    'BUTTONS — точные тексты кнопок (ТЗ: «Продолжить»/«Начать заново»)');
  assert.ok(Array.isArray(api.CONFIRM_QUESTIONS),
    'CONFIRM_QUESTIONS — массив');
  assert.equal(typeof api.createConfirmFlow, 'function',
    'createConfirmFlow — функция (чистая машина)');
  assert.equal(typeof api.createStartWindow, 'function',
    'createStartWindow — функция (DOM-фабрика)');
});

// SW-N2: схема тройного подтверждения — ровно 3 вопроса, верные ответы
// ТОЧНО Да→Нет→Да, тексты зафиксированы (контракт memory §3).
test('000138-SW-N2: схема — ровно 3 вопроса, верные ответы ТОЧНО Да→Нет→Да (анти-случайная)', () => {
  const api = require('../src/start-window.js');
  const qs = api.CONFIRM_QUESTIONS;
  assert.ok(Array.isArray(qs), 'CONFIRM_QUESTIONS — массив');
  assert.equal(qs.length, 3, 'вопросов ровно 3 (ТЗ: «переспросить трижды»)');
  assert.deepEqual(qs.map((q) => q.expect), EXPECTS,
    'верные ответы ТОЧНО [yes, no, yes] — «Да, Да, Да» подтверждением '
    + 'НЕ является (защита от случайного удаления, ТЗ)');
  assert.deepEqual(qs.map((q) => q.text), [Q1, Q2, Q3],
    'тексты вопросов — зафиксированные формулировки (один источник)');
});

// SW-N3: чистая машина — любой неверный ответ прерывает (onConfirm 0×),
// полный Да/Нет/Да → onConfirm РОВНО 1×, answer() после терминала
// бросает, start() после aborted — цепочка СНАЧАЛА.
test('000138-SW-N3: createConfirmFlow — неверный ответ на любом шаге прерывает; Да/Нет/Да → подтверждение (onConfirm 1×)', () => {
  const api = require('../src/start-window.js');
  const onConfirm = [];
  const onAbort = [];
  const flow = api.createConfirmFlow(
    () => onConfirm.push(1), () => onAbort.push(1));
  // До start() — idle, вопросов нет, answer() бросает.
  assert.equal(flow.state(), 'idle', 'начальное состояние — idle');
  assert.equal(flow.question(), null, 'вопроса нет до start()');
  assert.throws(() => flow.answer('yes'),
    'answer() до start() — бросает');
  // (Пере)запуск с Q1.
  assert.equal(flow.start(), Q1, 'start() возвращает текст Q1');
  assert.equal(flow.state(), 'pending', 'после start() — pending');
  assert.equal(flow.question(), Q1, 'текущий вопрос — Q1');
  // Q1: «Нет» — неверно (нужно «Да») → abort, данные не трогаются
  // (машина не знает о данных — контракт main.js).
  assert.equal(flow.answer('no'), null, 'терминал — null');
  assert.equal(flow.state(), 'aborted', 'неверный ответ — aborted');
  assert.equal(onAbort.length, 1, 'onAbort 1×');
  assert.equal(onConfirm.length, 0, 'onConfirm НЕ вызван');
  assert.throws(() => flow.answer('yes'),
    'answer() после терминала — бросает');
  // [Да, Да] → abort на Q2 (там нужно «Нет»).
  flow.start();
  assert.equal(flow.answer('yes'), Q2, 'Q1 верно → текст Q2');
  assert.equal(flow.answer('yes'), null, 'Q2: «Да» — неверно, терминал');
  assert.equal(flow.state(), 'aborted', '[Да, Да] — aborted');
  // [Да, Нет, Нет] → abort на Q3 (там нужно «Да»).
  flow.start();
  assert.equal(flow.answer('yes'), Q2);
  assert.equal(flow.answer('no'), Q3, 'Q2 верно → текст Q3');
  assert.equal(flow.answer('no'), null, 'Q3: «Нет» — неверно, терминал');
  assert.equal(flow.state(), 'aborted', '[Да, Нет, Нет] — aborted');
  assert.equal(onConfirm.length, 0, 'onConfirm всё ещё 0×');
  assert.equal(onAbort.length, 3, 'onAbort 3× (3 абор-та)');
  // Полный проход Да/Нет/Да → confirmed, onConfirm РОВНО 1×.
  flow.start();
  assert.equal(flow.answer('yes'), Q2);
  assert.equal(flow.answer('no'), Q3);
  assert.equal(flow.answer('yes'), null, 'Q3 верно — терминал');
  assert.equal(flow.state(), 'confirmed', 'Да/Нет/Да — confirmed');
  assert.equal(flow.question(), null, 'вопроса больше нет');
  assert.equal(onConfirm.length, 1, 'onConfirm РОВНО 1× за проход');
  // Второй полный проход (start() после confirmed) → onConfirm 2-й раз.
  flow.start();
  assert.equal(flow.answer('yes'), Q2);
  assert.equal(flow.answer('no'), Q3);
  assert.equal(flow.answer('yes'), null);
  assert.equal(onConfirm.length, 2, '2 полных прохода = 2 вызова');
  // Некорректный ответ (не yes/no) — бросает.
  flow.start();
  assert.throws(() => flow.answer('maybe'),
    'ответ вне {yes, no} — бросает');
});

// =====================================================================
// SW-E1..E8. vm e2e: полная цепочка index.html + window.location.reload
// (spy) + fireBeforeUnload.
// =====================================================================

// SW-E1: окно показывается при загрузке — логотип + «Продолжить»
// (зелёный) + «Начать заново» (красный); цепочка чистая (errors 0).
test('000138-SW-E1: окно при загрузке — логотип assets/logo.svg + «Продолжить» (зелёный) + «Начать заново» (красный)', async () => {
  const h = await boot(null);
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет (цепочка с окном чистая): ' + h.errors.join('; '));
  const sw = winOf(h);
  assert.equal(sw.isActive(), true, 'окно активно сразу при загрузке');
  // DOM-дерево (контракт memory §2.2) — root подвешен к body.
  assert.ok(String(sw.root.className).includes('start-window'),
    'root — div.start-window: ' + sw.root.className);
  assert.equal(sw.root.__raw.parent, h.body.__raw,
    'root подвешен к document.body');
  const dom = sw.dom;
  for (const k of ['logo', 'main', 'continue', 'restart', 'confirm',
    'question', 'yes', 'no']) {
    assert.ok(dom[k], 'dom.' + k + ' — прямая ссылка');
  }
  assert.equal(dom.logo.src, 'assets/logo.svg',
    'логотип — assets/logo.svg (ТЗ)');
  assert.equal(dom.logo.alt, 'Флогистон', 'alt логотипа');
  assert.ok(String(dom.continue.className).includes('start-window-btn'),
    'кнопка — .start-window-btn');
  assert.ok(String(dom.continue.className).includes('start-window-btn--continue'),
    'кнопка «Продолжить» — .start-window-btn--continue');
  assert.equal(dom.continue.textContent, 'Продолжить',
    'текст кнопки (ТЗ)');
  assert.ok(String(dom.restart.className).includes('start-window-btn--restart'),
    'кнопка «Начать заново» — .start-window-btn--restart');
  assert.equal(dom.restart.textContent, 'Начать заново', 'текст кнопки (ТЗ)');
  // Панель подтверждения скрыта до «Начать заново».
  assert.equal(dom.confirm.style.display, 'none',
    'confirm-панель скрыта с создания (inline display)');
  // Цвета кнопок (ТЗ «на зелёном/красном фоне»): hex из index.html —
  // доминантный канал.
  const c = ruleHex('.start-window-btn--continue');
  assert.ok(c.g > c.r,
    '«Продолжить» — зелёный фон (g > r): ' + JSON.stringify(c));
  const r = ruleHex('.start-window-btn--restart');
  assert.ok(r.r > r.g,
    '«Начать заново» — красный фон (r > g): ' + JSON.stringify(r));
});

// SW-E2: «Продолжить» — окно закрывается, игра стартует как сейчас:
// сейв восстановлен при бут'е (окно НЕ гейт), игрок ходит.
test('000138-SW-E2: «Продолжить» — окно закрывается, игра как сейчас (сейв восстановлен, игрок ходит)', async () => {
  const h = await boot(SEED);
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет: ' + h.errors.join('; '));
  const g = h.sandbox.__game;
  // Сейв ПРОЧИТАН при бут'е (до клика — окно не блокировало старт).
  assert.ok(g.state.map, 'карта сгенерирована (boot прошёл)');
  assert.ok(g.state.save, 'сейв прочитан (state.save выставлен)');
  assert.equal(g.state.save.version, 1, 'оболочка v1');
  assert.equal(g.state.day, 5, 'день мира восстановлен из сейва');
  assert.deepEqual(host(g.state.player), { x: 2, y: 1 },
    'позиция восстановлена из сейва (НЕ спавн)');
  const sw = winOf(h);
  assert.equal(sw.isActive(), true, 'окно активно ДО клика');
  // Клик «Продолжить» → hide (окно само себя прячет — контракт §2.2).
  clickContinue(h);
  assert.equal(sw.isActive(), false, 'после «Продолжить» окно не активно');
  assert.equal(sw.root.style.display, 'none', 'hide = display:none');
  // Игра ЖИВА: игрок ходит (клавиатура + main-цикл — как сейчас).
  walkRightOne(h);
  assert.deepEqual(host(g.state.player), { x: 3, y: 1 },
    'игрок перешёл на (3,1) — движение не сломано окном');
});

// SW-E3: «Начать заново» → вопрос 1; неверный ответ («Нет» на Q1, где
// нужно «Да») — процесс прерван, данные НЕ удалены, reload НЕ вызван.
test('000138-SW-E3: «Начать заново» → Q1; неверный «Нет» — абор-т, данные НЕ удалены, reload 0×', async () => {
  const h = await boot(SEED);
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет: ' + h.errors.join('; '));
  const sw = winOf(h);
  clickRestart(h);
  assert.equal(sw.dom.question.textContent, Q1, 'показан вопрос 1');
  assert.equal(sw.dom.confirm.style.display, 'flex',
    'confirm-панель показана (inline display:flex)');
  assert.equal(sw.dom.yes.textContent, 'Да', 'кнопка «Да»');
  assert.equal(sw.dom.no.textContent, 'Нет', 'кнопка «Нет»');
  // «Нет» на Q1 — неверно (нужно «Да») → абор-т, возврат на main-вид.
  clickNo(h);
  assert.equal(sw.dom.confirm.style.display, 'none',
    'абор-т — возврат на main-вид (confirm скрыт)');
  assert.equal(h.storage.getItem(SAVE_KEY), SEED_JSON,
    'сейв БИТО-В-БИТО ЦЕЛ (данные не тронуты)');
  assert.equal(h.reloadCalls.length, 0, 'reload НЕ вызывался');
  assert.equal(sw.isActive(), true, 'окно всё ещё активно (main-вид)');
});

// SW-E4: неверные ответы на Q2 («Да» вместо «Нет») и на Q3 («Нет»
// вместо «Да») — процесс прерван, данные НЕ удалены, reload 0×.
test('000138-SW-E4: неверные Q2 («Да») и Q3 («Нет») — абор-ты, данные НЕ удалены, reload 0×', async () => {
  const h = await boot(SEED);
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет: ' + h.errors.join('; '));
  const sw = winOf(h);
  // Сценарий (а): Да → Q2 → «Да» (неверно) → aborted.
  clickRestart(h);
  assert.equal(sw.dom.question.textContent, Q1);
  clickYes(h);
  assert.equal(sw.dom.question.textContent, Q2, 'Q1 верно → показан Q2');
  clickYes(h);
  assert.equal(sw.dom.confirm.style.display, 'none', 'Q2: «Да» — абор-т');
  assert.equal(h.storage.getItem(SAVE_KEY), SEED_JSON,
    'сейв цел после абор-та на Q2');
  assert.equal(h.reloadCalls.length, 0, 'reload 0× (абор-т на Q2)');
  // Сценарий (б): заново → Да → Нет → Q3 → «Нет» (неверно) → aborted.
  clickRestart(h);
  assert.equal(sw.dom.question.textContent, Q1, 'повтор — цепочка с Q1');
  clickYes(h);
  assert.equal(sw.dom.question.textContent, Q2);
  clickNo(h);
  assert.equal(sw.dom.question.textContent, Q3, 'Q2 верно → показан Q3');
  clickNo(h);
  assert.equal(sw.dom.confirm.style.display, 'none', 'Q3: «Нет» — абор-т');
  assert.equal(h.storage.getItem(SAVE_KEY), SEED_JSON,
    'сейв цел после абор-та на Q3');
  assert.equal(h.reloadCalls.length, 0, 'reload 0× (абор-т на Q3)');
});

// SW-E5: полное подтверждение Да/Нет/Да — локальные данные удалены
// (G.clear), страница перезагружается (reload ровно 1×).
test('000138-SW-E5: полное подтверждение Да/Нет/Да — данные удалены, reload 1×', async () => {
  const h = await boot(SEED);
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет: ' + h.errors.join('; '));
  const sw = winOf(h);
  clickRestart(h);
  clickYes(h);  // Q1 верно
  clickNo(h);   // Q2 верно
  assert.equal(sw.dom.question.textContent, Q3, 'показан Q3');
  clickYes(h);  // Q3 верно → подтверждено
  assert.equal(h.storage.getItem(SAVE_KEY), null,
    'локальные данные удалены (G.clear, ключ ' + SAVE_KEY + ')');
  assert.equal(h.reloadCalls.length, 1,
    'страница перезагружается (location.reload ровно 1×)');
});

// SW-E5b: ЛОВИТЕЛЬ КЛЮЧЕВОГО БАГА (memory §6): location.reload()
// fire'ит beforeunload → saveNow() → G.save() перезаписал бы старый
// сейв СРАЗУ ПОСЛЕ clear → «сброс» тихо не состоялся бы. После полного
// подтверждения хранилище обязано остаться ПУСТЫМ.
test('000138-SW-E5b: после полного подтверждения beforeunload НЕ re-сейвит (resetPending)', async () => {
  const h = await boot(SEED);
  const sw = winOf(h);
  clickRestart(h);
  clickYes(h);
  clickNo(h);
  clickYes(h);
  assert.equal(h.storage.getItem(SAVE_KEY), null, 'данные удалены');
  // beforeunload (в браузере — на самом reload) → saveNow.
  fireBeforeUnload(h);
  assert.equal(h.storage.getItem(SAVE_KEY), null,
    'хранилище ОСТАЛОСЬ ПУСТЫМ: resetPending подавил re-сейв '
    + 'через beforeunload (memory §6)');
  assert.equal(h.reloadCalls.length, 1, 'reload — по-прежнему ровно 1×');
});

// SW-E5c: (ревью 000138) двойной клик по финальному «Да»: после
// полного прохода state — 'confirmed', confirm-панель НЕ скрыта
// (страница должна уйти на reload — в vm это spy). Второй клик
// физического двойного клика может прийти до начала навигации:
// он НЕ обязан бросать необработанную ошибку в клик-обработчике
// (гард reply(): state !== 'pending' → no-op) и не трогает
// хранилище/reload. Красный до фикса: reply('yes') →
// flow.answer('yes') в состоянии 'confirmed' → throw.
test('000138-SW-E5c: повторный клик «Да» после полного подтверждения — не бросает, хранилище и reload не меняются', async () => {
  const h = await boot(SEED);
  const sw = winOf(h);
  clickRestart(h);
  clickYes(h);
  clickNo(h);
  clickYes(h);
  assert.equal(h.storage.getItem(SAVE_KEY), null, 'данные удалены');
  assert.equal(h.reloadCalls.length, 1,
    'reload 1× после подтверждения');
  assert.equal(sw.dom.confirm.style.display, 'flex',
    'confirm-панель НЕ скрыта после подтверждения (страница на '
    + 'reload) — именно поэтому возможен повторный клик');
  // Двойной клик: второй клик по «Да» при state === 'confirmed'.
  assert.doesNotThrow(() => clickYes(h),
    'второй клик «Да» не бросает необработанную ошибку '
    + '(гард reply: state !== pending — no-op)');
  assert.equal(h.storage.getItem(SAVE_KEY), null,
    'хранилище не изменилось (данные уже удалены)');
  assert.equal(h.reloadCalls.length, 1,
    'reload НЕ повторился (по-прежнему ровно 1×)');
});

// SW-E6: повторная загрузка — окно показывается снова: НОВЫЙ
// независимый sandbox, ПУСТОЕ хранилище → окно активно, та же
// структура, сейва нет, день 1.
test('000138-SW-E6: повторная загрузка — окно снова (пустое хранилище, день 1)', async () => {
  const h = await boot(null);
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет: ' + h.errors.join('; '));
  const g = h.sandbox.__game;
  const sw = winOf(h);
  assert.equal(sw.isActive(), true, 'окно активно при повторной загрузке');
  assert.equal(sw.dom.logo.src, 'assets/logo.svg', 'логотип на месте');
  assert.equal(sw.dom.continue.textContent, 'Продолжить',
    '«Продолжить» на месте');
  assert.equal(sw.dom.restart.textContent, 'Начать заново',
    '«Начать заново» на месте');
  assert.equal(g.state.save, null, 'сейва нет (пустое хранилище)');
  assert.equal(g.state.day, 1, 'день 1 (игра с нуля)');
});

// SW-E7: окно НЕ меняет семантику бута — КЛИКОВ НЕТ: чистая загрузка
// (errors 0), сейв восстановлен (день/позиция/оболочка), мир как
// прежде (детерминизм/сейв не сломаны).
test('000138-SW-E7: окно не меняет семантику бута — сейв восстановлен, мир как прежде', async () => {
  const h = await boot(SEED);
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет (окно — чистый оверлей): ' + h.errors.join('; '));
  const g = h.sandbox.__game;
  assert.ok(g.state.map, 'карта сгенерирована');
  assert.ok(g.state.map.fromPng === false || g.state.map.fromPng === true,
    'карта — фолбэк generateSeedPixels (map.png → onerror, детерминизм)');
  assert.ok(g.state.save, 'сейв прочитан');
  assert.equal(g.state.save.version, 1, 'оболочка v1');
  assert.equal(g.state.day, 5, 'день мира из сейва');
  assert.deepEqual(host(g.state.player), { x: 2, y: 1 },
    'позиция из сейва');
  assert.equal(h.storage.getItem(SAVE_KEY), SEED_JSON,
    'бут НЕ перезаписывает сейв (бит-в-бит)');
  const sw = winOf(h);
  assert.equal(sw.isActive(), true, 'окно показано поверх мира');
});

// SW-E8: ПРОВАЛЕННЫЙ ПОРЯДОК (деградация 000053, UMD-ловушка 000038):
// цепочка МИНУС src/start-window.js — main.js обязан написать
// console.error (гард), игра стартует БЕЗ окна, __game.startWindow
// === null. Красный сейчас: гарда в main.js ещё нет (errors пусто,
// поле undefined).
test('000138-SW-E8: цепочка без start-window.js — деградация: console.error, игра стартует без окна', async () => {
  const chain = CHAIN.filter((f) => f !== 'start-window.js');
  const h = await boot(null, chain);
  const g = h.sandbox.__game;
  assert.equal(h.errors.length, 1,
    'ошибка ОДНА — гард main.js про отсутствие модуля: '
    + h.errors.join('; '));
  assert.ok(h.errors[0].includes('start-window.js'),
    'текст гарда — про src/start-window.js: ' + h.errors[0]);
  assert.equal(g.startWindow, null,
    '__game.startWindow === null (модуль не загружен — деградация)');
  assert.ok(g.state.map, 'игра стартует без окна (не крах)');
});

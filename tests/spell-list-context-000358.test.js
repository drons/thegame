// Задача 000358: список заклинаний — НЕ в панели персонажа [I];
// полный список — только в книге [B]; в мире боевые в [B] ВИДНЫ, но
// НЕАКТИВНЫ (класс-маркер + row.disabled + отсутствие click-слушателя),
// внебоевые — применимы. ТЗ: tasks/pending/000358.md. Контракт:
// memory/000358-spell-list-context.md.
//
// Дизайн-вилки (решения зафиксированы в памяти):
//   F1 маркировка неактивной строки — БЕМ-класс «spoc-row--disabled»
//      (конвенция блока: spoc-tab--active, 000301) + JS-свойство
//      row.disabled (двойная защита, паттерн building-ui) + КЛИК-
//      СЛУШАТЕЛЬ НЕ ВЕШАЕТСЯ; CSS-правило — opacity 0.3 + cursor
//      default (палитра :disabled-пинов index.html).
//   F2 область показа «в мире» = все внебоевые экраны книги [B]
//      (мир/подземелье/город — единое правило).
//   F3 текст пустоты без квалификатора — «Нет изученных заклинаний»
//      (квалификатор «вне боя» стал ложью; школьный вариант —
//      БЕЗ ИЗМЕНЕНИЙ).
//   F5 «применимо сейчас» = каталожный флаг «вне_боя: true»
//      (Game.SpellsData.SPELLS_BY_ID), единая точка вычисления —
//      render spellbook-oc.js; surface РОВНО 6 (000235.02 §2.6) —
//      НИЧЕГО НЕ экспортируется; каст-гейт Spells.castOutOfCombat —
//      последняя линия обороны (0-diff).
//
// Тесты (красные на master a7ee858d — ОСМЫСЛЕННО: функциональности
// нет, не синтаксис; загрузка цепочки в обоих харнессах чистая):
//   * T1 (vm, CHAIN до ui.js) — панель [I]: секции «Книга заклинаний»
//     НЕТ, .cp-itemrow в pane = 0, panel._book undefined; «Вдох
//     Эфира»/«Школы магии» целы, «Школы магии» — ПОСЛЕДНЯЯ секция
//     перед «Вдох Эфира»; hero и efir-виды.
//   * T2 (vm full-chain) — книга [B]: РОВНО строки hero.spells в его
//     порядке; боевые — класс «spoc-row spoc-row--disabled» +
//     row.disabled === true + слушателя click НЕТ; внебоевой —
//     className РОВНО «spoc-row» + свой click-listener; неизученный
//     гость — НЕТ.
//   * T3 (vm) — «клик» по боевой строке: слушателей нет → mp/записи/
//     открытая книга/#hud без изменений.
//   * T4 (vm) — школьный фильтр включает неактивные: «огонь» →
//     [spark (disabled), firelight (castable)].
//   * T5 (vm) — пустота: spells=[] → «Нет изученных заклинаний» БЕЗ
//     «вне боя»; боевые-only → 2 disabled-строки, .spoc-empty НЕТ.
//   * T6 (node fs) — CSS-guard: РОВНО ОДНО правило .spoc-row--disabled
//     (opacity 0.3 + cursor default); гарды .spoc-row/.spoc-row:hover.
//
// Харнесы — самодостаточные дубли: панельный — tests/unlearned-
// spells-hidden.test.js (loadEnv/makePartyEnv, динамический CHAIN до
// ui.js); книжный — tests/spellbook-oc-tabs.test.js (full-chain из
// index.html, Proxy-DOM makeEl, boot/dismissStartWindow/key/frameFn)
// + ocGuest/injectGuests/saveHero — tests/spellbook-oc-e2e.test.js.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const S = require('../src/save.js');

const ROOT = path.join(__dirname, '..');
const src = (f) => fs.readFileSync(path.join(ROOT, 'src', f), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const NOW = 1000;

// =====================================================================
// Харнес A — панель [I]: динамический CHAIN из index.html ДО ui.js
// (дубль tests/unlearned-spells-hidden.test.js)
// =====================================================================

function matchesSelA(el, sel) {
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

function findAllA(root, sel) {
  const out = [];
  const walk = (n) => {
    for (const ch of n.children || []) {
      if (matchesSelA(ch, sel)) out.push(ch);
      walk(ch);
    }
  };
  walk(root);
  return out;
}

function makeElA(tag) {
  const el = {
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
    querySelector(sel) { return findAllA(this, sel)[0] || null; },
    querySelectorAll(sel) { return findAllA(this, sel); },
    closest(sel) {
      let n = this;
      while (n) {
        if (matchesSelA(n, sel)) return n;
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

const CHAIN_A = (() => {
  const all = Array.from(
    html.matchAll(/<script\s+src="([^"]+)"/g), (m) => m[1])
    .map((p) => p.replace(/^src\//, ''));
  const i = all.indexOf('ui.js');
  assert.ok(i >= 0, 'ui.js подключён в index.html');
  return all.slice(0, i + 1);
})();

function loadEnvA() {
  const errors = [];
  const document = {
    createElement: (tag) => makeElA(tag),
    body: makeElA('body'),
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
  for (const f of CHAIN_A) vm.runInContext(src(f), sandbox,
    { filename: f });
  return { G: sandbox.Game, body: document.body, errors, sandbox };
}

function makePartyEnvA() {
  const env = loadEnvA();
  assert.equal(env.errors.length, 0,
    'ошибок при загрузке цепочки нет: ' + env.errors.join('; '));
  assert.ok(env.G.playerUI, 'Game.playerUI создан (ui.js в CHAIN)');
  const hero = env.G.createCharacter();
  const efir = env.G.efir.createEfir();
  const volk = env.G.NpcData.NPCS.find((n) => n.id === 'merc_volk');
  assert.ok(volk, 'Вольк (merc_volk) в каталоге npc-data');
  const mercSheet = env.G.Sheet.createSheet('merc', {
    primary: volk.найм.базовые_характеристики,
    spells: volk.найм.spells,
    npcId: 'merc_volk',
  });
  const roster = [{ npcId: 'merc_volk', sheet: mercSheet, level: 1,
    xp: 0, loyalty: 51, hiredDay: 1 }];
  env.sandbox.__game = { state: { efir, efirMet: true, roster } };
  env.G.playerUI.setCharacter(hero);
  env.G.playerUI.toggle(true);
  env.hero = hero;
  env.efirSheet = efir;
  return env;
}

function panelOfA(env) {
  const p = findAllA(env.body, '.char-panel')[0];
  assert.ok(p, 'панель .char-panel в body');
  return p;
}

function characterPaneA(env) {
  const cols = findAllA(env.body, '.cp-column');
  assert.ok(cols && cols.length >= 1, 'панель персонажа построена');
  const panes = findAllA(cols[0], '.cp-tabpane');
  return panes[0] || null;
}

function sectionOfA(pane, name) {
  assert.ok(pane, 'character-pane существует');
  return findAllA(pane, '.cp-section')
    .find((s) => s.textContent === name) || null;
}

// =====================================================================
// Харнес B — книга [B]: full-chain vm-песочница (дубль tests/
// spellbook-oc-tabs.test.js + хелперы tests/spellbook-oc-e2e.test.js)
// =====================================================================

const CHAIN_B = Array.from(html.matchAll(/<script\s+src="([^"]+)"/g),
  (m) => m[1]).map((p) => p.replace(/^src\//, ''));

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

function matchesSelB(el, sel) {
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

function findAllB(root, sel) {
  const out = [];
  const walk = (n) => {
    for (const ch of n.children || []) {
      if (matchesSelB(ch, sel)) out.push(ch);
      walk(ch);
    }
  };
  walk(root);
  return out;
}

function makeElB(tag) {
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
        if (matchesSelB(n, sel)) return n;
        n = n.parent;
      }
      return null;
    },
    querySelector(sel) { return findAllB(target, sel)[0] || null; },
    querySelectorAll(sel) { return findAllB(target, sel); },
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

function makeStorageB(seed) {
  const m = new Map();
  if (seed != null) m.set('phlogiston.save', JSON.stringify(seed));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

function bootSandboxB(seed) {
  const winListeners = {};
  const raf = [];
  const errors = [];
  const gameCanvas = makeElB('canvas');
  const spriteCanvas = makeElB('canvas');
  const hud = makeElB('div');
  gameCanvas.getContext = (kind) => (kind === 'webgl'
    ? makeGl() : makeContext2d(gameCanvas));
  spriteCanvas.getContext = (kind) => (kind === '2d'
    ? makeContext2d(spriteCanvas) : null);
  const storage = makeStorageB(seed);
  const body = makeElB('body');
  const document = {
    createElement: (tag) => makeElB(tag),
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
  for (const f of CHAIN_B) {
    vm.runInContext(
      fs.readFileSync(path.join(ROOT, 'src', f), 'utf8'), sandbox,
      { filename: f });
  }
  return { sandbox, winListeners, raf, errors, body, storage, hud };
}

const drain = () => new Promise((r) => setImmediate(r));

async function bootB(seed) {
  const h = bootSandboxB(seed);
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

function keyB(h, code, extra = {}) {
  const e = Object.assign(
    { code, preventDefault() {}, stopPropagation() {} }, extra);
  for (const fn of (h.winListeners['keydown'] || []).slice()) fn(e);
  return e;
}

function dismissStartWindowB(h) {
  const g = h.sandbox.__game;
  const sw = g.startWindow;
  assert.ok(sw && typeof sw.hide === 'function',
    'фикстура: __game.startWindow (000138)');
  sw.hide();
  assert.equal(sw.isActive(), false, 'стартовое окно скрыто');
}

function learnB(h, ids) {
  const spells = h.sandbox.__game.state.hero.spells;
  assert.ok(Array.isArray(spells), 'сценарий: live hero.spells (массив)');
  for (const id of ids) spells.push(id);
}

function oc358Guest(id, over = {}) {
  return Object.assign({
    id,
    название: 'Гость (000358)',
    школа: 'тень',
    база: null,
    степень: 1,
    атрибут: 'intelligence',
    уровень: 1,
    мани: 5,
    действие: 'внебой',
    вне_боя: true,
    параметры: { days: 1 },
    здания: ['assets/buildings/weapons_shop.json'],
    описание: 'Гостевое внебоевое заклинание (000358)',
    icon: 'assets/spell-icons/ghost.svg',
    icon_prompt: 'Тестовая иконка (000358)',
  }, over);
}

function injectGuestsB(h, guests) {
  const data = h.sandbox.Game.SpellsData;
  assert.ok(data && data.SPELLS && data.SPELLS_BY_ID,
    'сценарий: SpellsData в цепочке');
  for (const g of guests) {
    data.SPELLS.push(g);
    data.SPELLS_BY_ID[g.id] = g;
  }
  return guests;
}

function saveHeroB(h) {
  const bu = h.winListeners['beforeunload'];
  assert.ok(bu && bu.length > 0, 'beforeunload зарегистрирован');
  bu[0]();
  const raw = h.storage.getItem(S.SAVE_KEY);
  assert.ok(raw, 'сейв в localStorage (saveNow вызван)');
  return JSON.parse(raw).data.hero;
}

function bookRowsB(h) {
  return findAllB(h.body, '.spoc-row');
}

function clickTabB(h, school) {
  const tab = h.body.querySelector('.spoc-tab[data-school="' + school + '"]');
  assert.ok(tab, 'вкладка школы «' + school + '» (.spoc-tab)');
  const l = tab.listeners && tab.listeners.click;
  assert.ok(l && l.length > 0, 'вкладка «' + school + '» — слушатель');
  l[l.length - 1]();
}

// =====================================================================
// T1 — панель [I]: список заклинаний УБРАН (оба вида)
// =====================================================================

test('000358 T1: панель [I] — секции «Книга заклинаний» НЕТ (hero и efir-виды): .cp-section с этим текстом = 0, .cp-itemrow в pane = 0, panel._book undefined; «Вдох Эфира» и «Школы магии» целы, «Школы магии» — последняя секция перед «Вдох Эфира»; 0 ошибок', () => {
  const env = makePartyEnvA();
  const pane = characterPaneA(env);
  const panel = panelOfA(env);
  assert.equal(pane.querySelector('.cp-title').textContent, 'Флогистон',
    'дефолтный активный — герой');
  assert.equal(sectionOfA(pane, 'Книга заклинаний') === null, true,
    'RED: секции «Книга заклинаний» на странице НЕТ (списк — только '
    + 'в книге [B], 000358)');
  assert.equal(findAllA(pane, '.cp-itemrow').length, 0,
    'RED: строк книги (.cp-itemrow) в pane НЕТ');
  assert.equal(panel._book === undefined, true,
    'RED: ctx.panel._book НЕ создаётся (мёртвый код удалён)');
  assert.ok(sectionOfA(pane, 'Школы магии'),
    '«Школы магии» на месте (000324)');
  const breathSec = sectionOfA(pane, 'Вдох Эфира');
  assert.ok(breathSec, '«Вдох Эфира» на месте (000145/000146)');
  assert.equal(breathSec.style.display, 'none', 'для hero — СКРЫТА');
  const secs = findAllA(pane, '.cp-section');
  const names = secs.map((s) => s.textContent);
  assert.equal(names.indexOf('Книга заклинаний'), -1,
    'секции нет в перечне: ' + JSON.stringify(names));
  assert.equal(names.indexOf('Школы магии'),
    names.indexOf('Вдох Эфира') - 1,
    '«Школы магии» — ПОСЛЕДНЯЯ секция перед «Вдох Эфира»: '
    + JSON.stringify(names));
  // efir-вид: книги тоже нет, «Вдох Эфира» видна.
  env.G.playerUI.toggle(true, 'character', 'efir');
  assert.equal(pane.querySelector('.cp-title').textContent, 'Эфир',
    'активный — Эфир');
  assert.equal(sectionOfA(pane, 'Книга заклинаний') === null, true,
    'RED: у Эфира секции «Книга заклинаний» тоже НЕТ');
  assert.equal(findAllA(pane, '.cp-itemrow').length, 0,
    'RED: строк книги у Эфира НЕТ');
  assert.equal(sectionOfA(pane, 'Вдох Эфира').style.display, '',
    '«Вдох Эфира» — ВИДНА для Эфира (не задета)');
  assert.equal(env.errors.length, 0, '0 ошибок: ' + env.errors.join('; '));
});

// =====================================================================
// T2 — книга [B]: боевые видны-неактивны, внебоевые применимы
// =====================================================================

test('000358 T2: книга [B] — ВСЕ изученные строки в порядке hero.spells (дефолт spark/mend + внебоевой гость): боевые — className «spoc-row spoc-row--disabled» + row.disabled === true + click-слушателя НЕТ; внебоевой — className РОВНО «spoc-row» + свой click-listener; неизученный гость — НЕТ; .spoc-empty НЕТ', async () => {
  const h = await bootB();
  dismissStartWindowB(h);
  const a = oc358Guest('oc358_a');
  const b = oc358Guest('oc358_b');
  injectGuestsB(h, [a, b]);
  learnB(h, [a.id]);
  h.frameFn(NOW + 16);
  keyB(h, 'KeyB');
  assert.ok(h.body.querySelector('.spellbook-oc'),
    'книга открыта (KeyB)');
  const rows = bookRowsB(h);
  assert.deepEqual(rows.map((r) => r.dataset['spell-id']),
    ['spark', 'mend', 'oc358_a'],
    'RED: строки = ВСЕ изученные (боевые — неактивными строками), '
    + 'порядок = hero.spells');
  const combat = rows.slice(0, 2);
  for (const r of combat) {
    assert.equal(r.className, 'spoc-row spoc-row--disabled',
      'боевая строка ' + r.dataset['spell-id'] + ' — класс-маркер '
      + 'неактивности (F1)');
    assert.equal(r.disabled, true,
      'боевая строка — row.disabled === true (двойная защита)');
    const l = r.listeners && r.listeners.click;
    assert.ok(!l || l.length === 0,
      'боевая строка — click-слушателя НЕТ (каст невозможен)');
  }
  const castable = rows[2];
  assert.equal(castable.className, 'spoc-row',
    'внебоевая строка — className РОВНО «spoc-row» (без модификаторов '
    + '— стабы index-order/OC17)');
  assert.equal(castable.disabled, false,
    'внебоевая — row.disabled НЕ выставлен');
  const cl = castable.listeners && castable.listeners.click;
  assert.ok(cl && cl.length > 0, 'внебоевая — свой click-listener');
  assert.equal(findAllB(h.body, '.spoc-empty').length, 0,
    '.spoc-empty НЕТ (книга не пустая)');
});

// =====================================================================
// T3 — «клик» по боевой строке ничего не делает
// =====================================================================

test('000358 T3: «клик» по боевой строке книги — слушателей НЕТ → mp (16), outOfCombatEffects, открытая книга и #hud БЕЗ изменений; flash «боевое заклинание» не нужен (строка просто не кликается)', async () => {
  const h = await bootB();
  dismissStartWindowB(h);
  const a = oc358Guest('oc358_a');
  injectGuestsB(h, [a]);
  learnB(h, [a.id]);
  h.frameFn(NOW + 16);
  keyB(h, 'KeyB');
  const g = h.sandbox.__game;
  assert.equal(saveHeroB(h).mp, 16, 'фикстура: mp 16');
  const rows = bookRowsB(h);
  const spark = rows.find((r) => r.dataset['spell-id'] === 'spark');
  assert.ok(spark, 'боевая строка spark в книге (не скрыта)');
  const l = spark.listeners && spark.listeners.click;
  assert.ok(!l || l.length === 0,
    'RED: у боевой строки НЕТ click-слушателя (каст невозможен)');
  if (l) for (const fn of l.slice()) fn({});
  assert.equal(saveHeroB(h).mp, 16, 'mp БЕЗ изменений (16)');
  assert.equal(JSON.stringify(g.state.hero.outOfCombatEffects || []),
    '[]', 'записей внебоя НЕТ');
  assert.ok(h.body.querySelector('.spellbook-oc'),
    'книга осталась открыта');
  assert.ok(!String(h.hud.textContent).includes('боевое заклинание'),
    '#hud БЕЗ flash «боевое заклинание»');
});

// =====================================================================
// T4 — школьный фильтр включает неактивные строки
// =====================================================================

test('000358 T4: школьный фильтр [B] «огонь» — включает неактивные: строки [spark (disabled), firelight (castable)]; spark НЕ скрывается (огонь), firelight — РОВНО «spoc-row» + слушатель', async () => {
  const h = await bootB();
  dismissStartWindowB(h);
  const G = h.sandbox.Game;
  assert.equal(G.SpellsData.SPELLS_BY_ID.spark['школа'], 'огонь',
    'фикстура: spark — школа «огонь»');
  assert.notEqual(G.SpellsData.SPELLS_BY_ID.spark['вне_боя'], true,
    'фикстура: spark — боевое (вне_боя НЕ задан)');
  assert.equal(G.SpellsData.SPELLS_BY_ID.firelight['вне_боя'], true,
    'фикстура: firelight — внебоевой «огонь» (каталог)');
  learnB(h, ['firelight']);
  h.frameFn(NOW + 16);
  keyB(h, 'KeyB');
  clickTabB(h, 'огонь');
  const rows = bookRowsB(h);
  assert.deepEqual(rows.map((r) => r.dataset['spell-id']),
    ['spark', 'firelight'],
    'RED: «огонь» — [spark (неактивный), firelight] (боевые не '
    + 'скрыты школьным фильтром)');
  assert.equal(rows[0].className, 'spoc-row spoc-row--disabled',
    'spark под фильтром — неактивный класс');
  assert.ok(!rows[0].listeners || !rows[0].listeners.click
    || rows[0].listeners.click.length === 0,
    'spark — слушателя нет');
  assert.equal(rows[1].className, 'spoc-row',
    'firelight — РОВНО «spoc-row»');
  const cl = rows[1].listeners && rows[1].listeners.click;
  assert.ok(cl && cl.length > 0, 'firelight — свой click-listener');
});

// =====================================================================
// T5 — пустота: текст без квалификатора; боевые-only — НЕ пустота
// =====================================================================

test('000358 T5: пустота книги — spells=[] (live-мутация): .spoc-empty РОВНО ОДИН «Нет изученных заклинаний» БЕЗ «вне боя»; дефолтный герой (только боевые spark/mend): 2 disabled-строки, .spoc-empty НЕТ', async () => {
  const h = await bootB();
  dismissStartWindowB(h);
  const g = h.sandbox.__game;
  g.state.hero.spells.length = 0;
  h.frameFn(NOW + 16);
  keyB(h, 'KeyB');
  assert.ok(h.body.querySelector('.spellbook-oc'), 'книга открыта');
  const empties = findAllB(h.body, '.spoc-empty');
  assert.equal(empties.length, 1, 'spells=[] — ровно ОДИН .spoc-empty');
  assert.equal(String(empties[0].textContent), 'Нет изученных заклинаний',
    'RED: текст пустоты БЕЗ квалификатора «вне боя» (F3)');
  assert.ok(!String(empties[0].textContent).includes('вне боя'),
    '«вне боя» в тексте пустоты НЕТ');
  assert.equal(bookRowsB(h).length, 0, 'spells=[] — 0 строк');
  // Боевые-only (дефолтный герой) — НЕ пустота: 2 disabled-строки.
  const h2 = await bootB();
  dismissStartWindowB(h2);
  h2.frameFn(NOW + 16);
  keyB(h2, 'KeyB');
  assert.ok(h2.body.querySelector('.spellbook-oc'), 'книга открыта');
  const rows2 = bookRowsB(h2);
  assert.deepEqual(rows2.map((r) => r.dataset['spell-id']),
    ['spark', 'mend'],
    'RED: боевые-only герой — 2 ВИДИМЫЕ строки (не пустая книга)');
  for (const r of rows2) {
    assert.equal(r.className, 'spoc-row spoc-row--disabled',
      'строка ' + r.dataset['spell-id'] + ' — неактивная');
  }
  assert.equal(findAllB(h2.body, '.spoc-empty').length, 0,
    '.spoc-empty НЕТ (строки есть)');
});

// =====================================================================
// T6 — CSS-guard index.html
// =====================================================================

test('000358 T6: CSS-guard index.html — РОВНО ОДНО правило .spoc-row--disabled (opacity 0.3 + cursor default); гарды: .spoc-row (display flex/cursor pointer/border) и .spoc-row:hover — байт-в-байт', () => {
  const rules = (selector) => {
    const re = new RegExp('^[ \\t]*'
      + selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      + '[ \\t]*\\{([^}]*)\\}', 'gm');
    const out = [];
    let m;
    while ((m = re.exec(html))) {
      const decls = {};
      for (const part of m[1].split(';')) {
        const i = part.indexOf(':');
        if (i < 0) continue;
        const prop = part.slice(0, i).trim().toLowerCase();
        if (prop) decls[prop] = part.slice(i + 1).trim();
      }
      out.push(decls);
    }
    return out;
  };
  const dis = rules('.spoc-row--disabled');
  assert.equal(dis.length, 1,
    'RED: правило .spoc-row--disabled — РОВНО ОДНО (дубли запрещены): '
    + dis.length);
  assert.equal(dis[0]['opacity'], '0.3',
    '.spoc-row--disabled: opacity 0.3 (палитра :disabled-пинов)');
  assert.equal(dis[0]['cursor'], 'default',
    '.spoc-row--disabled: cursor default');
  const row = rules('.spoc-row');
  assert.equal(row.length, 1, '.spoc-row — РОВНО ОДНО правило (гард)');
  assert.equal(row[0]['display'], 'flex', 'гард: .spoc-row display flex');
  assert.equal(row[0]['cursor'], 'pointer', 'гард: cursor pointer');
  assert.ok(row[0]['border'], 'гард: border');
  assert.ok(/\.spoc-row:hover\s*\{[^}]*background: rgba\(255, ?255, ?255, ?0\.07\)/
    .test(html), 'гард: .spoc-row:hover не тронут');
});

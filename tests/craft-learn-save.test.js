// Задача 000232: изучение видов крафта в сейвах + e2e «чертёж →
// сейв → перезагрузка → вид изучен».
//
// Контракты — memory/000232-craft-learned-kinds.md D0b/D8:
//   * hero.craftTypes — ОПЦИОНАЛЬНОЕ поле v1 ({тип: true}); версию
//     НЕ поднимаем (CURRENT_VERSION = 1), миграций НЕТ (000031;
//     прецедент 000045/000046: hero.spells/craft/craftXp — тоже
//     опциональные поля v1);
//   * restoreFromSave (main.js): hero.craftTypes =
//     G.sanitizeCraftTypes ? G.sanitizeCraftTypes(d.hero.craftTypes)
//     : {} — санитайзер с КОРНЯ Game (UMD-merge craft.js; паттерн
//     000046: hero.craft — G.sanitizeCraftLevels; регрессия 000045:
//     без проводки Object.assign молча сбрасывает прогресс —
//     data loss);
//   * проекция __game.state.hero += craftTypes (паттерн
//     craft/craftXp/equipmentBonus);
//   * старый сейв без поля → {}; подделанный — очищен санитизером.
//
// КРАСНЫЕ — 2 (expectedRedCount = 2):
//   * SV-1: C.sanitizeCraftTypes — undefined (API не реализовано);
//     (далее — восстановление/проекция/roundtrip: в красной стадии
//     тест падает раньше, на API);
//   * SV-2: чертёж blueprint_forge — нет каталожной записи (CR-2) →
//     sanitizeInventory сбрасывает слот «призрак» → первый ассерт
//     (чертёж в инвентаре после restore) красный.
//
// Механика: SV-1 — vm-roundtrip через main.js (дубль
// tests/save.test.js bootWithSave + makeStorage/rawSet/host, но с
// БОГАТЫМ DOM-стабом — дубль ЧАСТИ B tests/spells-any-party.test.js
// / 000231: children-дерево/dataset/closest/textContent); SV-2 —
// e2e на ТОЙ ЖЕ песочнице: полная цепочка index.html (включая
// main.js) + localStorage с сейвом + клик UI «исп.» (паттерн AP-7
// 000147: .cp-tab inventory → .cp-btn[data-act=use]) → flash
// .cp-notice → beforeunload → новая загрузка → проекция + диалог
// крафта.
//
// Cross-realm (vm): host(o) = JSON-рондтрип (правило 000082);
// массивы песочницы — [...arr].

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const S = require('../src/save.js');
const C = require('../src/craft.js');

const ROOT = path.join(__dirname, '..');

// --- Мок localStorage (дубль tests/save.test.js) ---

function makeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    has: (k) => m.has(k),
  };
}

function rawSet(storage, objOrText) {
  storage.setItem(S.SAVE_KEY,
    typeof objOrText === 'string' ? objOrText : JSON.stringify(objOrText));
}

// Объекты из vm-сэндбокса — чужой realm; JSON-рондтрип даёт
// объект host-realm (паттерн save.test.js).
function host(o) { return JSON.parse(JSON.stringify(o)); }

// --- Богатый DOM-стаб (дубль 000231 / ЧАСТИ B 000147) ---

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
      (this.listeners[type] || (this.listeners[type] = []))
        .push(fn);
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

function textOf(node) {
  let s = node._text || '';
  for (const ch of node.children || []) s += textOf(ch);
  return s;
}

// --- WebGL-стаб (дубль tests/save.test.js makeGl) ---

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

// --- Полная цепочка index.html (включая main.js) в vm ---
// (дубль save.test.js bootWithSave: canvas/Image/perf/raf-стабы;
//  DOM — богатый; localStorage — мок с сейвом ДО запуска цепочки:
//  main.js снимает window.localStorage и читает его при ЗАГРУЗКЕ.)

const CHAIN_232 = (() =>
  Array.from(
    fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')
      .matchAll(/<script\s+src="([^"]+)"/g), (m) => m[1])
)();

function runChain232(storage) {
  const winListeners = {};
  const raf = [];
  const errors = [];
  const gameCanvas = makeEl('canvas');
  const spriteCanvas = makeEl('canvas');
  const hud = makeEl('div');
  gameCanvas.getContext = (kind) => (kind === 'webgl'
    ? makeGl() : new Proxy({}, {
      get: () => () => undefined,
      set: () => true,
    }));
  spriteCanvas.getContext = (kind) => (kind === '2d'
    ? new Proxy({}, {
      get: () => () => undefined,
      set: () => true,
    }) : null);
  const body = makeEl('body');
  const document = {
    createElement: (tag) => makeEl(tag),
    getElementById: (id) => (
      id === 'game' ? gameCanvas
        : id === 'sprites' ? spriteCanvas
          : id === 'hud' ? hud
            : null
    ),
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
    addEventListener: (t, f) => {
      (winListeners[t] || (winListeners[t] = [])).push(f);
    },
    removeEventListener() {},
    localStorage: storage,
    confirm: () => false,
  };
  // Image: map.png ВСЕГДА onerror → детерминированный фолбэк
  // (паттерн save.test.js); остальные — onload.
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
      log: () => {},
      warn: () => {},
      error: (m) => errors.push(String(m)),
    },
    document,
    window,
    Image,
    performance: { now: () => 1000 },
    requestAnimationFrame: (fn) => { raf.push(fn); return raf.length; },
    setTimeout, clearTimeout,
  };
  vm.createContext(sandbox);
  for (const f of CHAIN_232) {
    vm.runInContext(
      fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox,
      { filename: f });
  }
  return {
    sandbox, winListeners, raf, errors, body,
    drain: () => new Promise((r) => setImmediate(r)),
  };
}

// Дефолтный герой сейва (дубль save.test.js bootWithSave): валидный
// минимальный restore (level 2, «Смоук»).
const HERO_DEFAULT = {
  name: 'Смоук', level: 2, xp: 10, totalXp: 100, gold: 50,
  hp: 20, mp: 10, points: 1,
  primary: {
    strength: 2, dexterity: 1, constitution: 1,
    intelligence: 1, wisdom: 1, charisma: 1,
  },
  secondary: { forge: 3 },
  skillXp: {},
  spells: ['spark'],
};

// Записать сейв (hero = дефолт + heroExtra) и запустить цепочку:
// main.js restoreFromSave ЧИТАЕТ сейв при загрузке.
function bootWithSave232(storage, heroExtra) {
  rawSet(storage, {
    version: 1,
    savedAt: new Date(0).toISOString(),
    data: {
      day: 1, steps: 0,
      hero: Object.assign({}, HERO_DEFAULT, heroExtra),
    },
  });
  return runChain232(storage);
}

// Только запуск цепочки (сейв УЖЕ в хранилище — БООТ B, SV-2).
function bootFromSave232(storage) {
  return runChain232(storage);
}

test('SV-1: сейв — hero.craftTypes: версия 1 (миграций НЕТ, D8); C.sanitizeCraftTypes — API; restoreFromSave — G.sanitizeCraftTypes (корень Game, паттерн 000046) с дефолтом {}; проекция state.hero.craftTypes; подделка очищена; roundtrip beforeunload; старый сейв без поля → {}', async () => {
  // (a) Версия/миграции — НЕ трогаем (в1, опциональное поле):
  assert.equal(S.CURRENT_VERSION, 1,
    '000232: версия сейва НЕ повышается (v1, D8)');
  assert.deepEqual(Object.keys(S.MIGRATIONS), [],
    '000232: миграций НЕТ (D8)');
  // (b) Санитайзер — API craft.js (UMD → корень Game):
  assert.equal(typeof C.sanitizeCraftTypes, 'function',
    'краснота: C.sanitizeCraftTypes не реализовано');
  assert.deepEqual(
    C.sanitizeCraftTypes({ 'рунопись': 1, 'чужое': true, 'кузнечное_дело': 1 }),
    { 'рунопись': true, 'кузнечное_дело': true },
    'sanitize: truthy → true, чужой ключ отброшен');
  assert.deepEqual(C.sanitizeCraftTypes('мусор'), {},
    'sanitize: не-объект → {}');
  // (c) Проводка restoreFromSave (source-пин, паттерн 000046):
  //     без неё Object.assign(hero, clean) молча сбрасывает поле
  //     при каждой перезагрузке (data loss, регрессия 000045).
  const src = fs.readFileSync(path.join(ROOT, 'src', 'main.js'), 'utf8');
  const restore = src.slice(src.indexOf('function restoreFromSave'));
  assert.ok(restore.length > 0, 'restoreFromSave найден в main.js');
  assert.ok(
    restore.includes('hero.craftTypes')
    && restore.includes('G.sanitizeCraftTypes'),
    'краснота: restoreFromSave не восстанавливает hero.craftTypes '
    + 'через G.sanitizeCraftTypes (data loss)');
  // (d) vm-roundtrip: подделка + валидные в одном сейве:
  const st = makeStorage();
  const h = bootWithSave232(st, {
    craftTypes: { 'рунопись': true, 'чужое': 1 },
  });
  for (let i = 0; i < 5; i++) await h.drain();
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет: ' + h.errors.join('; '));
  const state = h.sandbox.__game.state;
  assert.ok(state.save, 'сейв загружен');
  assert.deepEqual(host(state.hero.craftTypes), { 'рунопись': true },
    'краснота: проекция state.hero без craftTypes / подделка не '
    + 'очищена (чужой ключ «чужое» должен отпасть)');
  const beforeUnload = h.winListeners['beforeunload'];
  assert.ok(beforeUnload && beforeUnload.length > 0,
    'beforeunload зарегистрирован');
  beforeUnload[0]();
  const saved = JSON.parse(st.getItem(S.SAVE_KEY));
  assert.deepEqual(saved.data.hero.craftTypes, { 'рунопись': true },
    'craftTypes пережил roundtrip (очищенный)');
  // (e) Старый сейв (без поля) — дефолт {}, без падений:
  const st2 = makeStorage();
  const h2 = bootWithSave232(st2, { craftTypes: undefined });
  for (let i = 0; i < 5; i++) await h2.drain();
  assert.equal(h2.errors.length, 0,
    'старый сейв: ошибок загрузки нет: ' + h2.errors.join('; '));
  assert.deepEqual(
    host(h2.sandbox.__game.state.hero.craftTypes), {},
    'старый сейв без craftTypes → {} (дефолт, D8)');
});

test('SV-2: e2e (vm, полная цепочка + main.js): чертёж blueprint_forge в сейве → restore (переживает sanitizeInventory) → UI «исп.» → flash «Изучено: «Ковка железного меча»», предмет −1 → beforeunload → новая загрузка: state.hero.craftTypes = {кузнечное_дело: true}; диалог крафта (Дом кузнеца) — РОВНО кузнечное (65 id data-driven; ре-пин 000250), зачарование не видно; RED: чертёж выпал из инвентаря (нет каталожной записи)', async () => {
  // --- БООТ A: чертёж в инвентаре героя сейва ---
  const st = makeStorage();
  const h = bootWithSave232(st, {
    inventory: {
      slots: [{ id: 'blueprint_forge', qty: 1 }],
      quick: [null, null, null],
    },
  });
  for (let i = 0; i < 5; i++) await h.drain();
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет: ' + h.errors.join('; '));
  const G = h.sandbox.Game;
  const state = h.sandbox.__game.state;
  const inv = host(state.hero.inventory);
  assert.ok(inv.some((s) => s && s.id === 'blueprint_forge'),
    'краснота: чертёж выпал из инвентаря (нет каталожной записи — '
    + 'sanitizeInventory «призрак»); факт: ' + JSON.stringify(inv));
  // Вкладка «Инвентарь» + клик «исп.» (паттерн AP-7 000147):
  G.playerUI.toggle(true);
  assert.equal(h.errors.length, 0,
    'openPanel: 0 ошибок: ' + h.errors.join('; '));
  const panel = findAll(h.body, '.char-panel')[0];
  assert.ok(panel, 'панель персонажа (.char-panel в body)');
  const tab = findAll(panel, '.cp-tab').find((t) =>
    t.dataset.col === '0' && t.dataset.tabid === 'inventory');
  assert.ok(tab, 'вкладка «Инвентарь» (column 0)');
  const clickers = panel.listeners.click || [];
  assert.ok(clickers.length >= 1,
    'делегированный click-обработчик на панели (ОДИН)');
  clickers[0]({ target: tab });
  const cols = findAll(h.body, '.cp-column');
  const invPane = findAll(cols[0], '.cp-tabpane')[1];
  assert.ok(invPane, 'панель «Инвентарь» активна');
  const btn = findAll(invPane, '.cp-btn').find((b) =>
    b.dataset.act === 'use' && b.dataset.item === 'blueprint_forge');
  assert.ok(btn,
    'кнопка «исп.» у blueprint_forge (краснота: строки предмета нет)');
  clickers[0]({ target: btn });
  assert.equal(h.errors.length, 0,
    'клик «исп.»: 0 ошибок: ' + h.errors.join('; '));
  const notice = panel.querySelector('.cp-notice');
  assert.ok(notice, 'flash-уведомление (.cp-notice в панели)');
  assert.equal(notice.textContent, 'Изучено: «Ковка железного меча»',
    'flash «Изучено: «<название рецепта>»» (контракт D2); '
    + 'факт: ' + notice.textContent);
  const inv2 = host(h.sandbox.__game.state.hero.inventory);
  assert.ok(!inv2.some((s) => s && s.id === 'blueprint_forge'),
    'чертёж потрачен (ровно 1 шт.)');
  // --- Сейв (beforeunload → saveNow) → БООТ B с тем же хранилищем ---
  assert.ok(h.winListeners['beforeunload']
    && h.winListeners['beforeunload'].length > 0,
    'beforeunload зарегистрирован');
  h.winListeners['beforeunload'][0]();
  const saved = JSON.parse(st.getItem(S.SAVE_KEY));
  assert.deepEqual(saved.data.hero.craftTypes, { 'кузнечное_дело': true },
    'краснота: craftTypes не сериализован в сейв (no restore)');
  const hB = bootFromSave232(st);
  for (let i = 0; i < 5; i++) await hB.drain();
  assert.equal(hB.errors.length, 0,
    'BOOT B: ошибок загрузки нет: ' + hB.errors.join('; '));
  const stateB = hB.sandbox.__game.state;
  assert.ok(stateB.save, 'BOOT B: сейв загружен');
  assert.deepEqual(host(stateB.hero.craftTypes),
    { 'кузнечное_дело': true },
    'краснота: вид не пережил перезагрузку (data loss — no '
    + 'restore/проекции)');
  // Диалог крафта на ВОССТАНОВЛЕННОМ герое (проекция — чистое
  // чтение: alive/craft/craftXp/craftTypes/spells в state.hero):
  const GB = hB.sandbox.Game;
  const b25 = GB.BUILDINGS.find((x) => x && x.id === 25);
  assert.ok(b25, 'постройка 25 (Дом кузнеца) в каталоге');
  GB.craftUI.open({ building: b25, hero: stateB.hero });
  assert.equal(hB.errors.length, 0,
    'craftUI.open: 0 ошибок: ' + hB.errors.join('; '));
  const ov = findAll(hB.body, '.craft-overlay')[0];
  assert.ok(ov, 'BOOT B: оверлей крафта открыт');
  const shown = findAll(ov, '.cp-btn')
    .filter((b) => b.dataset.craftact === 'craft')
    .map((b) => b.dataset.recipe).sort();
  const expect = GB.Craft.CRAFT
    .filter((r) => r.здания.includes(25) && r.тип === 'кузнечное_дело')
    .map((r) => r.id).sort();
  assert.deepEqual(host(shown), [...expect],
    'BOOT B: диалог — РОВНО изученный вид здания 25 (65, '
    + 'ре-пин 000250: +2 кожаные брони); RED: + 2 зачарования (фильтра нет)');
  assert.ok(!textOf(ov).includes('зачарование'),
    'BOOT B: неизученное «зачарование» — не видно');
  assert.equal(hB.errors.length, 0,
    '0 ошибок: ' + hB.errors.join('; '));
});

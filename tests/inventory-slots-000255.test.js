// Задача 000255: слоты инвентаря растут с уровнем навыка «Крепкая
// спина»: +2 за уровень. Формула ровно 20 + 2·S('back') — flat,
// целая, БЕЗ affix-компонента; капа НЕТ (back=100 → 220); база 20 —
// INVENTORY_SLOTS (единственный источник правды).
//
// ТЗ — tasks/pending/000255.md; контракт — memory/000255-inventory-
// slots-back.md (§1 формула и решения, §2 контракты, §3 тесты,
// §4 ленивые ссылки).
//
// КРАСНЫЕ (5 — падают на master c694320: функциональность ещё не
// существует; все падения осмысленные ERR_ASSERTION — отсутствующее
// ПОЛЕ/ПАРАМЕТР/ЗНАЧЕНИЕ/ВЫВОД, не синтаксис: все модули существуют
// и грузятся, vm-цепочки чистые):
//   000255-D1  derived() — поле inventorySlots: back=0 → 20 (и
//              === INVENTORY_SLOTS — пин базы); back=5 → 30;
//              back=100 → 220; Number.isInteger (дробных слотов
//              не существует);
//   000255-A1  checkAdd — 21-й слот: back=0 — отказ «нет свободных
//              слотов инвентаря» (ёмкость 20 — база); back=1
//              (ёмкость 22) — 21-й УСПЕХ, 23-й — отказ (строка
//              отказа без изменений);
//   000255-S1  sanitizeInventory(inv, maxSlots) — ОПЦИОНАЛЬНЫЙ
//              2-й аргумент: 25 уникальных нескладываемых слотов +
//              maxSlots 26 (20 + 2·3 — ёмкость героя back=3) → 25
//              слотов (баг-кейс ТЗ: сейв с back>0 и >20 слотами
//              отсекается до 20); одноаргументный вызов — дефолт
//              INVENTORY_SLOTS (регрессия, пин items.test.js :558);
//   000255-S2  restoreFromSave e2e (ПОЛНАЯ цепочка index.html в vm,
//              паттерн tests/save-restore.test.js): досеянный сейв
//              hero back=3 + 25 слотов → state.hero.inventory — 25
//              слотов (main.js обязан передать ёмкость героя в
//              sanitizeInventory);
//   000255-U1  UI (ДИНАМИЧЕСКИЙ CHAIN до ui.js, паттерн
//              tests/ui.test.js): back=1 — 4-я строка .cp-stats —
//              «Слоты: 0/22» и «Инвентарь» (пустой) —
//              «пусто (22 слотов)» (вместимость — из героя, не
//              G.INVENTORY_SLOTS).
//
// ЗЕЛЁНЫЙ наблюдение-тест (ревью 2026-10-25): 000255-AFF —
// 'back'-аффикс кольца (bone_ring, +3%) НЕ масштабирует
// inventorySlots (flat-решение memory §1: формула — по вторичному
// навыку, не через pct); контроль: тот же аффикс масштабирует ВЕС —
// аффикс активен, изоляция осмыслена.
//
// ЗЕЛЁНЫЕ ассерты в красных тестах (регрессия/преконтракты): строка
// отказа «нет свободных слотов инвентаря» (байт-в-байт), back=0 →
// ёмкость 20 = база, дефолтный кап одноаргументного sanitize.
//
// expectedRedCount = 5 (D1, A1, S1, S2, U1).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const I = require('../src/items.js');
const P = require('../src/player.js');
const SH = require('../src/sheet.js');
const { SAVE_KEY } = require('../src/save.js');

const ROOT = path.join(__dirname, '..');

// --- Node-тесты (D1, A1, S1) ---

test('000255-D1: derived() — inventorySlots = 20 + 2·S(\'back\') (flat, целая; без affix; без капа)', () => {
  const h = P.createCharacter();
  const d0 = SH.derived(h);
  assert.ok(d0, 'преконтрак: derived — каталог навыков загружен');
  assert.equal(d0.inventorySlots, 20,
    'back=0 → 20 (база); факт: ' + d0.inventorySlots);
  assert.equal(d0.inventorySlots, I.INVENTORY_SLOTS,
    'back=0: база = INVENTORY_SLOTS (единый источник правды)');
  assert.ok(Number.isInteger(d0.inventorySlots),
    'целая (дробных слотов не существует)');
  h.secondary.back = 5;
  const d5 = SH.derived(h);
  assert.equal(d5.inventorySlots, 30,
    'back=5 → 20 + 2·5 = 30; факт: ' + d5.inventorySlots);
  assert.ok(Number.isInteger(d5.inventorySlots), 'целая при back=5');
  h.secondary.back = 100;
  const d100 = SH.derived(h);
  assert.equal(d100.inventorySlots, 220,
    'back=100 → 220 (капа нет); факт: ' + d100.inventorySlots);
  assert.ok(Number.isInteger(d100.inventorySlots), 'целая при back=100');
});

test('000255-AFF: «back»-аффикс кольца (bone_ring) НЕ масштабирует inventorySlots (flat; вес — масштабируется)', () => {
  const h = P.createCharacter();
  h.secondary.back = 5; // ёмкость без аффикса 20 + 2·5 = 30
  assert.ok(I.getItem('bone_ring'),
    'преконтрак: bone_ring (back-аффикс +3%) в каталоге');
  assert.equal(I.addItem(h, 'bone_ring').ok, true,
    'преконтрак: кольцо в инвентарь');
  assert.equal(I.equip(h, 'bone_ring').ok, true,
    'преконтрак: кольцо надето');
  const d = SH.derived(h);
  assert.equal(d.inventorySlots, 30,
    'back=5 + bone_ring: слоты = 20 + 2·5 = 30 — «back»-аффикс НЕ '
    + 'масштабирует (flat, решение memory §1); факт: '
    + d.inventorySlots);
  assert.ok(Number.isInteger(d.inventorySlots), 'целая с аффиксом');
  assert.equal(d.carryWeightMult, 1 + 0.1 * 5 * 1.03,
    'контроль: тот же аффикс масштабирует ВЕС (1 + 0.1·5·1.03) — '
    + 'аффикс активен, изоляция осмыслена; факт: ' + d.carryWeightMult);
});

test('000255-A1: checkAdd — 21-й слот: back=0 — отказ (ёмкость 20); back=1 — 21-й успех (ёмкость 22), 23-й — отказ', () => {
  // back=0: ёмкость 20 = база (зелёная часть: строка отказа
  // без изменений — пин companions/city-storage/craft-core).
  const c0 = P.createCharacter();
  for (let i = 0; i < I.INVENTORY_SLOTS; i++) {
    assert.equal(I.addItem(c0, 'wood_sword').ok, true,
      'back=0: слот ' + (i + 1));
  }
  assert.equal(I.slotCount(c0), I.INVENTORY_SLOTS);
  const r0 = I.addItem(c0, 'wood_sword');
  assert.equal(r0.ok, false, 'back=0: 21-й слот — отказ (ёмкость 20)');
  assert.equal(r0.reason, 'нет свободных слотов инвентаря',
    'строка отказа — без изменений (байт-в-байт)');

  // back=1: ёмкость 22 — 21-й влезает, 23-й — отказ.
  const c1 = P.createCharacter();
  c1.secondary.back = 1;
  for (let i = 0; i < 22; i++) {
    assert.equal(I.addItem(c1, 'wood_sword').ok, true,
      'back=1: слот ' + (i + 1) + ' (ёмкость 22)');
  }
  assert.equal(I.slotCount(c1), 22,
    'back=1: заполнено до ёмкости 22 (20 + 2·1)');
  const r23 = I.addItem(c1, 'wood_sword');
  assert.equal(r23.ok, false, 'back=1: 23-й — отказ (ёмкость 22)');
  assert.equal(r23.reason, 'нет свободных слотов инвентаря',
    'строка отказа — без изменений (байт-в-байт)');
});

// 25 УНИКАЛЬНЫХ нескладываемых предметов (weapon/armor/scroll/...):
// sanitizeInventory сливает только дубликаты — 25 разных id = 25
// слотов. Ловушка ТЗ: moonstone (stackable reagent) — НЕ в списке.
function uniqueSlots(n) {
  const items = I.allItems().filter((it) =>
    !['potion', 'food', 'skill_book', 'reagent'].includes(it.kind));
  assert.ok(items.length >= n,
    'преконтрак: каталог даёт ' + n + ' нескладываемых: ' + items.length);
  return items.slice(0, n).map((it) => ({ id: it.id, qty: 1 }));
}

test('000255-S1: sanitizeInventory(inv, maxSlots) — ёмкость героя (баг-кейс back>0 и >20); дефолт — INVENTORY_SLOTS', () => {
  const slots25 = uniqueSlots(25);
  const inv = { slots: slots25, quick: null };
  // 26 = 20 + 2·3 — ёмкость героя back=3: 25 слотов НЕ отсекать.
  const out = I.sanitizeInventory(inv, 26);
  assert.equal(out.slots.length, 25,
    'ёмкость 26: 25 слотов сохранены (баг-кейс: сейчас отсечение до 20); '
    + 'факт: ' + out.slots.length);
  assert.equal(out.slots[0].id, 'wood_sword', 'порядок слотов — как во входе');
  assert.equal(out.slots[24].id, slots25[24].id, '25-й слот на месте');
  assert.deepEqual(out.quick, [null, null, null], 'quick — 3 слота');
  // Регрессия (пин items.test.js :558): одноаргументный вызов —
  // дефолтный кап INVENTORY_SLOTS.
  const out0 = I.sanitizeInventory(inv);
  assert.equal(out0.slots.length, I.INVENTORY_SLOTS,
    'без ёмкости — дефолтный кап INVENTORY_SLOTS');
  assert.equal(inv.slots.length, 25, 'вход не мутируется');
});

// --- VM: ПОЛНАЯ цепочка index.html (S2) ---
// Паттерн tests/save-restore.test.js (дубль стабов: makeGl/
// makeContext2d/makeEl/makeStorage/seedSave/bootSandbox/drain/boot)
// — localStorage-мок с досеянным сейвом; restoreFromSave сам
// вызывается при boot; наблюдение — через __game.state (getter,
// main.js).

const htmlFull = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CHAIN_FULL = Array.from(htmlFull.matchAll(/<script\s+src="([^"]+)"/g), (m) => m[1])
  .map((p) => p.replace(/^src\//, ''));

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
    setAttribute() {},
    getBoundingClientRect() { return { left: 0, top: 0 }; },
    remove() {},
    blur() {},
  };
  if (tag === 'canvas') {
    target.getContext = (kind) => (kind === '2d'
      ? makeContext2d(target) : null);
  }
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

function bootSandbox(seed) {
  const winListeners = {};
  const raf = [];
  const warns = [];
  const errors = [];
  const gameCanvas = makeEl('canvas');
  const spriteCanvas = makeEl('canvas');
  const hud = makeEl('div');
  gameCanvas.getContext = (kind) => (kind === 'webgl'
    ? makeGl() : makeContext2d(gameCanvas));
  spriteCanvas.getContext = (kind) => (kind === '2d'
    ? makeContext2d(spriteCanvas) : null);
  const storage = makeStorage(seed);
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
    innerWidth: 1280,
    innerHeight: 720,
    location: { search: '' },
    localStorage: storage,
    confirm: () => false,
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
      warn: (m) => warns.push(String(m)),
      error: (m) => errors.push(String(m)),
      log: () => {},
    },
    document,
    window,
    Image,
    performance: { now: () => 1000 },
    requestAnimationFrame: (fn) => { raf.push(fn); return raf.length; },
  };
  vm.createContext(sandbox);
  for (const f of CHAIN_FULL) {
    vm.runInContext(
      fs.readFileSync(path.join(ROOT, 'src', f), 'utf8'), sandbox,
      { filename: f });
  }
  return { sandbox, winListeners, raf, warns, errors, storage };
}

const drain = () => new Promise((r) => setImmediate(r));

async function boot(seed) {
  const h = bootSandbox(seed);
  await drain();
  await drain();
  await drain();
  return h;
}

// Сейв реально ПРОЧИТАН (boot не «вакуумный»).
function assertRestored(h, day) {
  const st = h.sandbox.__game.state;
  assert.ok(st.map, 'карта сгенерирована (boot прошёл)');
  assert.ok(st.save, 'сейв прочитан (state.save выставлен)');
  assert.equal(st.save.version, 1, 'оболочка — текущая версия');
  assert.equal(st.day, day, 'день мира восстановлен из сейва');
}

test('000255-S2: restoreFromSave — сейв hero back=3 с 25 слотами НЕ отсёкается до 20 (баг-кейс ТЗ)', async () => {
  // Ядро hero — по sanitizeSavedHero (level/xp/gold/hp + все шесть
  // primary >= 1); secondary.back = 3 → ёмкость 26; 25 уникальных
  // нескладываемых слотов (qty 1) — под ёмкость.
  const slots25 = uniqueSlots(25);
  const hero = {
    name: 'Флогистон',
    level: 2,
    xp: 0,
    totalXp: 0,
    gold: 100,
    hp: 30,
    mp: 10,
    points: 0,
    primary: {
      strength: 1, dexterity: 1, constitution: 1,
      intelligence: 1, wisdom: 1, charisma: 1,
    },
    secondary: { back: 3 },
    skillXp: {},
    spells: ['spark', 'mend'],
    alive: true,
    inventory: { slots: slots25, quick: [null, null, null] },
    equipment: { weapon: null, armor: null },
  };
  const h = await boot(seedSave({ day: 2, hero }));
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет: ' + h.errors.join('; '));
  assertRestored(h, 2);
  const g = h.sandbox.__game;
  const inv = g.state.hero.inventory; // МIRROR-массив slots (main.js)
  assert.equal(inv.length, 25,
    'hero back=3 (ёмкость 26): 25 слотов переживают restore; '
    + 'факт: ' + inv.length + ' (баг: main.js передаёт без ёмкости)');
  assert.equal(inv[0].id, 'wood_sword', 'порядок слотов сохранён');
  // Зеркало state.hero без secondary (main.js) — через maxWeight:
  // back=3 → 30·1.3 = 39 (back=0 дало бы 30): вторичный навык
  // восстановлен (sanitizeSavedHero).
  assert.equal(g.state.hero.maxWeight, 39,
    'преконтрак: secondary.back=3 восстановлен (maxWeight 39, не 30)');
});

// --- VM: ДИНАМИЧЕСКИЙ CHAIN до ui.js (U1) ---
// Паттерн tests/ui.test.js (DOM-стаб с деревом: matchesSel/findAll/
// makeEl; loadEnv). Партия — как makePartyEnv (roster live через
// __game.state, инъекция ДО toggle).

const srcFile = (f) => fs.readFileSync(path.join(ROOT, 'src', f), 'utf8');
const CHAIN_UI = (() => {
  const all = Array.from(
    htmlFull.matchAll(/<script\s+src="([^"]+)"/g), (m) => m[1])
    .map((p) => p.replace(/^src\//, ''));
  const i = all.indexOf('ui.js');
  assert.ok(i >= 0, 'ui.js подключён в index.html');
  return all.slice(0, i + 1);
})();

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

function makeElTree(tag) {
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

function loadUiEnv() {
  const errors = [];
  const document = {
    createElement: (tag) => makeElTree(tag),
    body: makeElTree('body'),
    querySelector: () => null,
    hidden: false,
    listeners: {},
    addEventListener(type, fn) {
      (this.listeners[type] || (this.listeners[type] = []))
        .push(fn);
    },
    removeEventListener(type, fn) {
      const a = this.listeners[type];
      if (!a) return;
      const i = a.indexOf(fn);
      if (i >= 0) a.splice(i, 1);
    },
  };
  const window = {
    addEventListener: () => {}, removeEventListener: () => {},
  };
  const sandbox = {
    console: {
      log: () => {}, info: () => {}, warn: () => {},
      error: (m) => errors.push(String(m)),
    },
    document, window, setTimeout, clearTimeout,
  };
  vm.createContext(sandbox);
  for (const f of CHAIN_UI) {
    vm.runInContext(srcFile(f), sandbox, { filename: f });
  }
  return {
    G: sandbox.Game, body: document.body, doc: document,
    errors, sandbox,
  };
}

test('000255-U1: UI back=1 — «Слоты: 0/22» (.cp-stats) и «пусто (22 слотов)» (вкладка «Инвентарь»)', () => {
  const env = loadUiEnv();
  assert.equal(env.errors.length, 0,
    'ошибок при загрузке цепочки нет: ' + env.errors.join('; '));
  const volk = env.G.NpcData.NPCS.find((n) => n.id === 'merc_volk');
  assert.ok(volk, 'Вольк (merc_volk) в каталоге npc-data');
  const mercSheet = env.G.Sheet.createSheet('merc', {
    primary: volk.найм.базовые_характеристики,
    spells: volk.найм.spells,
    npcId: 'merc_volk',
  });
  for (const [id, lv] of Object.entries(volk.найм.начальные_навыки)) {
    mercSheet.secondary[id] = lv;
  }
  const roster = [{
    npcId: 'merc_volk', sheet: mercSheet, level: 1,
    xp: 0, loyalty: 51, hiredDay: 1,
  }];
  env.sandbox.__game = { state: { efir: null, efirMet: false, roster } };
  const hero = env.G.createCharacter();
  hero.secondary.back = 1; // ёмкость 22 = 20 + 2·1
  env.G.playerUI.setCharacter(hero);
  env.G.playerUI.toggle(true);
  const panel = findAll(env.body, '.char-panel')[0];
  assert.ok(panel, 'панель .char-panel подвешена к body');
  assert.ok(
    panel._stats.textContent.includes('Слоты: 0/22'),
    '«Персонаж»: 4-я строка — «Слоты: 0/22» (ёмкость 20 + 2·1, не '
    + 'константа 20); факт: ' + panel._stats.textContent);
  const emptyNote = findAll(panel._invBody, '.cp-itemmeta')[0];
  assert.ok(emptyNote,
    '«Инвентарь» (пустой): div.cp-itemmeta-плейсхолдер в _invBody '
    + '(структура/стиль — как в мастер-паттерне)');
  assert.equal(
    emptyNote.textContent, 'пусто (22 слотов)',
    '«Инвентарь» (пустой): «пусто (22 слотов)» (ёмкость — из героя); '
    + 'факт: ' + emptyNote.textContent);
});

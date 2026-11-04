// Задача 000299.03 — цены магазина — по навыкам АКТИВНОГО персонажа
// (дочерняя 000299, п.4/5; ТЗ tasks/pending/000299.03.md).
//
// Контракт: цена (покупка/продажа) — по «Торговцу» priceChar (активный
// персонаж, 000299.01/000145); ВЛАДЕЛЕЦ мутаций (золото/инвентарь/
// сток) — всегда hero (000194): sheet наёмного БЕЗ gold — передача его
// владельцем = NaN (guard-тесты merc.gold === undefined). priceChar —
// ХВОСТОВОЙ опциональный параметр (priceChar = owner): существующие
// 3/4-арг. вызовы — бит-в-бит (A5, B3).
//
// КРАСНЫЕ (до — красные, осмысленно, не краш):
//   * A1/A3: 5-й аргумент npcBuy/buyItem игнорируется — цена по hero
//     (10), а не по merc Торговец 2 (round(10×0.90)=9);
//   * A2/A4: то же для npcSell/sellItem (6/10 против 7/11);
//   * B1: строки «торговли» npcUI + покупка — по hero (10/6), а не по
//     активному merc (9/7);
//   * B2: строки «Магазина» [I] + покупка — по hero (10), а не по
//     активному merc (9);
//   * B4: клик по портрету при открытой «торговли» — ин-плейс
//     ре-рендер НЕТ (строки остаются 10/6).
// ЗЕЛЁНЫЕ с первого запуска (регрессия бит-в-бит hero): A5, B3.
//
// vm-песочница — цепочка index.html БЕЗ main.js (паттерн
// tests/npc-dialog-scope.test.js: точку __game ставит ТЕСТ).
//
// expectedRedCount (файл) = 7 (A1, A2, A3, A4, B1, B2, B4).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const P = require('../src/player.js');
const S = require('../src/sheet.js');
const I = require('../src/items.js');
const N = require('../src/npc.js');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CHAIN = Array.from(html.matchAll(/<script\s+src="([^"]+)"/g), (m) => m[1])
  .map((p) => p.replace(/^src\//, ''))
  .filter((f) => f !== 'main.js');
const NOW = 1000;

// --- WebGL-стаб (как tests/npc-dialog-scope.test.js) ---

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

// --- Снисходительный DOM-элемент с деревом (дубль
// tests/npc-dialog-scope.test.js: нужен делегированный клик). ---

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

// --- localStorage-мок ---

function makeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

// --- Песочница: цепочка index.html БЕЗ main.js ---

function bootSandbox() {
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
  const storage = makeStorage();
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
  return { sandbox, winListeners, raf, errors, storage, body };
}

const drain = () => new Promise((r) => setImmediate(r));

async function boot() {
  const h = bootSandbox();
  await drain();
  await drain();
  await drain();
  return h;
}

// --- Часть A: ядро (require src/npc.js, src/items.js) ---

// Фикстура торгового NPC: wood_sword 10/6 (×2), iron_sword 42/24 (×1).
const TRADE_NPC = {
  id: 'price_test_merchant',
  имя: 'Тест-торговец',
  роль: 'торговец',
  постройки: [0],
  торговля: {
    предметы: [
      { предмет: 'wood_sword', цена_покупки: 10, цена_продажи: 6, количество: 2 },
      { предмет: 'iron_sword', цена_покупки: 42, цена_продажи: 24, количество: 1 },
    ],
  },
};

// Наёмный лист Торговца 2 (buyPriceMult 0.90, sellPriceMult 1.10):
// primary ЕСТЬ (createSheet — 000143), gold НЕТ (ловушка NaN).
function mercWithMerchant() {
  const m = S.createSheet('merc', { npcId: 'merc_mira' });
  m.secondary.merchant = 2;
  return m;
}

const APOTHECARY_SHOP = () => ({
  x: 1, y: 1, buildingType: 2, wealth: 0,
  stock: { healing_potion: 2 },
});

test('A1. npcBuy(shop, hero, id, 1, priceChar) — цена по Торговцу priceChar; мутации — за owner (hero); gold priceChar — undefined', () => {
  const hero = P.createCharacter();
  const merc = mercWithMerchant();
  const shop = N.createNpcShop(TRADE_NPC);
  const r = N.npcBuy(shop, hero, 'wood_sword', 1, merc);
  assert.equal(r.ok, true, 'покупка успешна: ' + JSON.stringify(r));
  assert.equal(r.price, 9,
    'round(10 × 0.90) = 9 — цена по priceChar (merc Торговец 2)');
  assert.equal(hero.gold, 100 - 9,
    'золото списано с owner (hero) по цене priceChar');
  assert.equal(I.totalQty(hero, 'wood_sword'), 1,
    'предмет — в инвентаре owner');
  assert.equal(shop.stock.wood_sword, 1, 'сток −1');
  assert.equal(merc.gold, undefined,
    'gold priceChar НЕ существует (NaN-ловушка: priceChar ≠ owner)');
});

test('A2. npcSell(shop, hero, id, 1, priceChar) — цена продажи по priceChar; мутации — за owner', () => {
  const hero = P.createCharacter();
  I.addItem(hero, 'wood_sword', 1);
  const merc = mercWithMerchant();
  const shop = N.createNpcShop(TRADE_NPC);
  const r = N.npcSell(shop, hero, 'wood_sword', 1, merc);
  assert.equal(r.ok, true, 'продажа успешна: ' + JSON.stringify(r));
  assert.equal(r.price, 7,
    'round(6 × 1.10) = 7 — цена по priceChar');
  assert.equal(hero.gold, 100 + 7, 'золото начислено owner (hero)');
  assert.equal(I.totalQty(hero, 'wood_sword'), 0,
    'предмет снят с owner');
  assert.equal(merc.gold, undefined,
    'gold priceChar — undefined (NaN-ловушка)');
});

test('A3. buyItem(shop, c, id, 1, priceChar) — цена по priceChar; мутации за c', () => {
  const c = P.createCharacter();
  const merc = mercWithMerchant();
  const shop = APOTHECARY_SHOP();
  const r = I.buyItem(shop, c, 'healing_potion', 1, merc);
  assert.equal(r.ok, true, 'покупка успешна: ' + JSON.stringify(r));
  assert.equal(r.price, 9,
    'round(10 × 0.90) = 9 — цена по priceChar (wealth 0)');
  assert.equal(c.gold, 100 - 9, 'золото списано с owner (c)');
  assert.equal(I.totalQty(c, 'healing_potion'), 1,
    'предмет — в инвентаре owner');
  assert.equal(shop.stock.healing_potion, 1, 'сток −1');
  assert.equal(merc.gold, undefined,
    'gold priceChar — undefined (NaN-ловушка)');
});

test('A4. sellItem(shop, c, id, 1, priceChar) — цена по priceChar; мутации за c', () => {
  const c = P.createCharacter();
  I.addItem(c, 'healing_potion', 1);
  const merc = mercWithMerchant();
  const shop = APOTHECARY_SHOP();
  const r = I.sellItem(shop, c, 'healing_potion', 1, merc);
  assert.equal(r.ok, true, 'продажа успешна: ' + JSON.stringify(r));
  assert.equal(r.price, 11,
    'round(10 × 1.10) = 11 — цена по priceChar (wealth 0)');
  assert.equal(c.gold, 100 + 11, 'золото начислено owner (c)');
  assert.equal(I.totalQty(c, 'healing_potion'), 0, 'предмет снят с owner');
  assert.equal(merc.gold, undefined,
    'gold priceChar — undefined (NaN-ловушка)');
});

test('A5. регрессия: вызовы БЕЗ priceChar и priceChar = owner — бит-в-бит', () => {
  const c = P.createCharacter();
  const shop = N.createNpcShop(TRADE_NPC);
  assert.deepEqual(N.npcBuy(shop, c, 'wood_sword'),
    { ok: true, item: 'wood_sword', qty: 1, price: 10 },
    '3-арг. npcBuy — без изменений (npc.test.js)');
  assert.equal(c.gold, 90);
  I.addItem(c, 'wood_sword', 1);
  assert.deepEqual(N.npcSell(shop, c, 'wood_sword'),
    { ok: true, item: 'wood_sword', qty: 1, price: 6 },
    '3-арг. npcSell — без изменений');
  assert.equal(c.gold, 96);
  const s = APOTHECARY_SHOP();
  assert.equal(I.buyItem(s, c, 'healing_potion').price, 10,
    '3-арг. buyItem — без изменений');
  I.addItem(c, 'healing_potion', 1);
  assert.equal(I.sellItem(s, c, 'healing_potion').price, 10,
    '3-арг. sellItem — без изменений');
  const shop2 = N.createNpcShop(TRADE_NPC);
  const c2 = P.createCharacter();
  assert.deepEqual(N.npcBuy(shop2, c2, 'wood_sword', 1, c2),
    { ok: true, item: 'wood_sword', qty: 1, price: 10 },
    'priceChar = owner (hero) — бит-в-бит');
  assert.equal(I.buyItem(s, c2, 'healing_potion', 1, c2).price, 10,
    'buyItem priceChar = owner — бит-в-бит');
});

// --- Часть B: vm (src/ui.js) ---

function seedWorld(h, over = {}) {
  const G = h.sandbox.Game;
  const state = {
    day: 1,
    hero: over.hero !== undefined ? over.hero
      : G.createCharacter('Флогистон'),
    efir: over.efir !== undefined ? over.efir
      : G.efir.createEfir(),
    efirMet: over.efirMet !== undefined ? over.efirMet : true,
    roster: over.roster !== undefined ? over.roster : [],
    deadMercs: over.deadMercs !== undefined ? over.deadMercs : [],
  };
  h.sandbox.__game = { state };
  return state;
}

function lastOverlay(h) {
  const ch = h.body.children;
  return ch[ch.length - 1];
}

function openNpc(h, npcId, st) {
  const G = h.sandbox.Game;
  const npc = G.NpcData.NPCS.find((n) => n.id === npcId);
  assert.ok(npc, `NPC ${npcId} в каталоге`);
  G.npcUI.open(Object.assign({
    npc,
    character: st.hero,
    book: G.createQuestBook(),
    tile: { x: 1, y: 1, building: { id: 44 }, buildingWealth: 1 },
    day: 1,
    roster: st.roster,
    deadMercs: st.deadMercs,
  }));
  return { G, overlay: lastOverlay(h) };
}

function addMercMira(h, st) {
  const mira = h.sandbox.Game.Sheet.createSheet('merc',
    { npcId: 'merc_mira' });
  mira.secondary.merchant = 2;
  st.roster.push({
    npcId: 'merc_mira', level: 1, xp: 0, loyalty: 50, hiredDay: 1,
    sheet: mira,
  });
  return mira;
}

function clickTradeTab(overlay) {
  const tradeTab = overlay.querySelectorAll('button[data-npcact="tab"]')
    .find((b) => b.dataset.tab === 'trade');
  assert.ok(tradeTab, 'вкладка «торговля» на месте');
  overlay.listeners.click[0]({ target: tradeTab });
}

function metaLines(root) {
  return root.querySelectorAll('.cp-itemmeta')
    .map((e) => String(e.textContent));
}

test('B1. npcUI «торговля» при активном наёмном: строки — по наёмному; покупка — с hero, сток −1, gold наёмного — undefined', async () => {
  const h = await boot();
  const st = seedWorld(h);
  const mira = addMercMira(h, st);
  const { G, overlay } = openNpc(h, 'weapons_merchant', st);
  const before = h.errors.length;
  G.playerUI.setActiveCharId('merc_mira');
  clickTradeTab(overlay);
  const metas = metaLines(overlay);
  const line = metas.find((s) => s.startsWith('покупка'));
  assert.ok(line, 'строка цены wood_sword на месте');
  assert.equal(line, 'покупка 9 з / продажа 7 з',
    'цены — по Торговцу активного (merc 2): round(10×0.90)/round(6×1.10)');
  assert.equal(metas.find((s) => s.startsWith('Золото:')),
    'Золото: ' + st.hero.gold,
    '«Золото» — за owner (hero), активный не меняет владельца');
  const buyBtn = overlay.querySelectorAll('button[data-npcact="buy"]')[0];
  assert.equal(buyBtn.dataset.item, 'wood_sword');
  const goldBefore = st.hero.gold;
  overlay.listeners.click[0]({ target: buyBtn });
  assert.equal(st.hero.gold, goldBefore - 9,
    'покупка — с hero по цене merc (9, не 10)');
  assert.ok(G.hasItem(st.hero, 'wood_sword', 1),
    'предмет — в инвентаре hero (общий, 000194)');
  assert.equal(mira.gold, undefined,
    'NaN-ловушка: gold наёмного НЕ тронут (owner = hero)');
  assert.equal(h.errors.length, before,
    '0 новых console.error (вкладка «торговля» + покупка)');
  G.npcUI.close();
  G.playerUI.setActiveCharId(null);
});

test('B2. [I] «Магазин» при активном наёмном: строки — по наёмному; покупка — из/в hero', async () => {
  const h = await boot();
  const st = seedWorld(h);
  const mira = addMercMira(h, st);
  const G = h.sandbox.Game;
  G.addItem(st.hero, 'healing_potion', 1);
  G.playerUI.setCharacter(st.hero);
  G.playerUI.toggle(true);
  const panel = findAll(h.body, '.char-panel')[0];
  assert.ok(panel, 'панель [I] подвешена к body');
  const shop = {
    x: 5, y: 5,
    buildingType: G.BUILDING_TYPES.APOTHECARY,
    wealth: 0,
    stock: { healing_potion: 2 },
  };
  G.playerUI.setShop(shop);
  G.playerUI.setActiveCharId('merc_mira');
  const metas = metaLines(panel);
  assert.equal(metas.find((s) => s.startsWith('покупка')),
    'покупка 9 з',
    'buy-строка — по Торговцу активного (merc 2)');
  assert.equal(metas.find((s) => s.startsWith('продажа')),
    'продажа 11 з',
    'sell-строка — по Торговцу активного (merc 2)');
  const buyBtn = panel.querySelectorAll('button[data-act="buy"]')
    .find((b) => b.dataset.item === 'healing_potion');
  assert.ok(buyBtn, 'кнопка «купить» (healing_potion) на месте');
  const goldBefore = st.hero.gold;
  panel.listeners.click[0]({ target: buyBtn });
  assert.equal(st.hero.gold, goldBefore - 9,
    'покупка — с hero по цене merc (9, не 10)');
  assert.equal(G.totalQty(st.hero, 'healing_potion'), 2,
    'предмет — в инвентаре hero (1 стартовый + 1 купленный)');
  assert.equal(shop.stock.healing_potion, 1, 'сток −1');
  assert.equal(mira.gold, undefined,
    'NaN-ловушка: gold наёмного НЕ тронут (owner = hero)');
  G.playerUI.setActiveCharId(null);
  G.playerUI.toggle(false);
});

test('B3. hero активен (дефолт при непустой партии): npcUI и [I] — бит-в-бит (регрессия)', async () => {
  const h = await boot();
  const st = seedWorld(h);
  addMercMira(h, st);
  const { G, overlay } = openNpc(h, 'weapons_merchant', st);
  assert.equal(G.playerUI.getActiveCharId(), null, 'активный — дефолт');
  clickTradeTab(overlay);
  const metas = metaLines(overlay);
  assert.equal(metas.find((s) => s.startsWith('покупка')),
    'покупка 10 з / продажа 6 з',
    'hero активен — цены hero (бит-в-бит)');
  const buyBtn = overlay.querySelectorAll('button[data-npcact="buy"]')[0];
  const goldBefore = st.hero.gold;
  overlay.listeners.click[0]({ target: buyBtn });
  assert.equal(st.hero.gold, goldBefore - 10,
    'покупка — по цене hero (10)');
  G.npcUI.close();
  G.playerUI.setCharacter(st.hero);
  G.playerUI.toggle(true);
  const panel = findAll(h.body, '.char-panel')[0];
  assert.ok(panel, 'панель [I] подвешена к body');
  const shop = {
    x: 5, y: 5,
    buildingType: G.BUILDING_TYPES.APOTHECARY,
    wealth: 0,
    stock: { healing_potion: 2 },
  };
  G.playerUI.setShop(shop);
  const pm = metaLines(panel);
  assert.equal(pm.find((s) => s.startsWith('покупка')), 'покупка 10 з',
    'hero активен — цена hero (бит-в-бит)');
  const buyBtn2 = panel.querySelectorAll('button[data-act="buy"]')
    .find((b) => b.dataset.item === 'healing_potion');
  const g0 = st.hero.gold;
  panel.listeners.click[0]({ target: buyBtn2 });
  assert.equal(st.hero.gold, g0 - 10, 'покупка — по цене hero (10)');
  assert.equal(shop.stock.healing_potion, 1, 'сток −1');
  G.playerUI.toggle(false);
});

test('B4. клик по портрету при открытой «торговле» — ин-плейс ре-рендер цен БЕЗ переключения вкладки/закрытия оверлея', async () => {
  const h = await boot();
  const st = seedWorld(h);
  addMercMira(h, st);
  const { G, overlay } = openNpc(h, 'weapons_merchant', st);
  clickTradeTab(overlay);
  let metas = metaLines(overlay);
  assert.equal(metas.find((s) => s.startsWith('покупка')),
    'покупка 10 з / продажа 6 з', 'до клика — цены hero (дефолт)');
  const row = overlay.querySelector('.cp-portraits');
  const miraBtn = row.querySelectorAll('button.cp-portrait')
    .find((b) => b.dataset.memberid === 'merc_mira');
  assert.ok(miraBtn, 'портрет наёмного в ряду');
  overlay.listeners.click[0]({ target: miraBtn });
  assert.equal(G.playerUI.getActiveCharId(), 'merc_mira',
    'активный — npcId');
  assert.ok(G.npcUI.isActive(), 'диалог НЕ закрылся');
  metas = metaLines(overlay);
  assert.ok(metas.some((s) => s.startsWith('Золото:')),
    'вкладка «торговля» открыта (не переключилась)');
  assert.equal(metas.find((s) => s.startsWith('покупка')),
    'покупка 9 з / продажа 7 з',
    'цены обновлены ин-плейс (активный сменился)');
  assert.ok(overlay.querySelectorAll('button[data-npcact="buy"]')
    .length >= 1, 'кнопка «купить» сохранена');
  G.npcUI.close();
  G.playerUI.setActiveCharId(null);
});

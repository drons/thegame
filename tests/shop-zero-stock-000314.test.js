// Задача 000314 — магазины: не отображать позицию при количестве 0
// (ТЗ tasks/pending/000314.md; контракт
// memory/000314-shop-zero-qty-hidden.md).
//
// Контракт (оба экрана магазинов — по факту кода): позиция со стоком
// 0 (или с ключом, отсутствующим в карте стока) НЕ РЕНДЕРИТСЯ — строка
// отсутствует (не «ост. 0» / не «×0»). Обновление/респавн стока
// возвращает позицию (регресс); покупка последней штуки — после
// ре-рендера позиция исчезает; прочие позиции — бит-в-бит (порядок
// строк, цены). Экраны: вкладка «торговля» NPC-диалога (renderTradeTab,
// src/ui.js) и вкладка «Магазин» [I]-панели (src/ui-tab-shop.js —
// compliant с 000101, здесь — 0-diff-пины).
//
// КРАСНЫЕ (осмысленные — ERR_ASSERTION с дампом строк/фразы, не краш
// загрузки модулей):
//   * A1  — «торговля»: 2-я покупка (сток 1→0) — строка «Деревянный
//     меч (ост. 0)» на месте (renderTradeTab без stock-чека);
//   * A2b — close/reopen с ТОЙ ЖЕ живой ссылкой на сток (семантика
//     npcStocks main.js: персистентно, респавна у мирского NPC нет) —
//     строка «ост. 0» на месте;
//   * A3  — карта стока с ОДНИМ ключом — прочие 6 позиций каталога
//     показаны «(ост. 0)»;
//   * W1/W2 — новые spec-фразы отсутствуют (npc-storage/buildings).
// ЗЕЛЁНЫЕ с первого запуска (регресс-пины): A2 (refresh — позиция
// вернулась), B1/B2 ([I] уже соответствует — 0-diff).
//
// vm-песочница — цепочка index.html БЕЗ main.js (паттерн
// tests/shop-prices-000299.03.test.js: точку __game ставит ТЕСТ).
//
// expectedRedCount (файл) = 5 (A1, A2b, A3, W1, W2).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CHAIN = Array.from(html.matchAll(/<script\s+src="([^"]+)"/g), (m) => m[1])
  .map((p) => p.replace(/^src\//, ''))
  .filter((f) => f !== 'main.js');
const NOW = 1000;

const NSTOR = fs.readFileSync(path.join(ROOT, 'spec', 'npc-storage.md'), 'utf8');
const BLD = fs.readFileSync(path.join(ROOT, 'spec', 'buildings.md'), 'utf8');

// --- WebGL-стаб (как tests/shop-prices-000299.03.test.js) ---

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
// tests/shop-prices-000299.03.test.js: нужен делегированный клик). ---

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

// --- vm-хелперы (дубль tests/shop-prices-000299.03.test.js) ---

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

// Сток Бренна по каталогу (assets/npc/000001.json) — живой объект:
// main.js передаёт npcUI.open LIVE-ссылку (npcStocks/cityShops).
const BRENN_STOCK = () => ({
  wood_sword: 2, iron_sword: 2, steel_sword: 1, short_bow: 2,
  hunting_bow: 1, battle_axe: 1, war_hammer: 1,
});

const ALL_7 = [
  'Деревянный меч (ост. 2)', 'Железный меч (ост. 2)',
  'Стальной меч (ост. 1)', 'Короткий лук (ост. 2)',
  'Охотничий лук (ост. 1)', 'Боевой топор (ост. 1)',
  'Боевой молот (ост. 1)',
];
const OTHER_6 = ALL_7.slice(1);

function openBrennTrade(h, st, stock) {
  const G = h.sandbox.Game;
  const npc = G.NpcData.NPCS.find((n) => n.id === 'weapons_merchant');
  assert.ok(npc, 'NPC weapons_merchant (Бренн) в каталоге');
  G.npcUI.open({
    npc,
    character: st.hero,
    book: G.createQuestBook(),
    tile: { x: 1, y: 1, building: { id: 44 }, buildingWealth: 1 },
    day: 1,
    shop: { npc, stock },
  });
  const overlay = lastOverlay(h);
  clickTradeTab(overlay);
  return { G, overlay };
}

function clickTradeTab(overlay) {
  const tradeTab = overlay.querySelectorAll('button[data-npcact="tab"]')
    .find((b) => b.dataset.tab === 'trade');
  assert.ok(tradeTab, 'вкладка «торговля» на месте');
  overlay.listeners.click[0]({ target: tradeTab });
}

function nameLinesOf(overlay) {
  return overlay.querySelectorAll('.cp-itemname')
    .map((e) => String(e.textContent));
}

function metaLinesOf(overlay) {
  return overlay.querySelectorAll('.cp-itemmeta')
    .map((e) => String(e.textContent));
}

function textOf(n) {
  let s = (n && n._text) ? String(n._text) : '';
  for (const ch of (n && n.children) || []) s += textOf(ch);
  return s;
}

// Купит 1 шт. wood_sword (кнопка ищется заново — вкладка
// перерисовывается в обработчике).
function buyWoodSword(h, overlay, expectPrice) {
  const btn = overlay.querySelectorAll('button[data-npcact="buy"]')
    .find((b) => b.dataset.item === 'wood_sword');
  assert.ok(btn, 'кнопка «купить» (wood_sword) на месте');
  overlay.listeners.click[0]({ target: btn });
  return expectPrice;
}

// --- Часть A: вкладка «торговля» npcUI (ГДЕ КРАСНОЕ) ---

test('A1. «торговля»: покупка последней штуки → позиция исчезает (0 строк для предмета); прочие строки — бит-в-бит', async () => {
  const h = await boot();
  const st = seedWorld(h);
  const stock = BRENN_STOCK();
  const { overlay } = openBrennTrade(h, st, stock);
  const before = h.errors.length;
  assert.deepEqual(nameLinesOf(overlay), ALL_7,
    'все 7 строк каталога — бит-в-бит (порядок, сток): '
    + JSON.stringify(nameLinesOf(overlay)));
  assert.deepEqual(metaLinesOf(overlay), [
    'Золото: 100',
    'покупка 10 з / продажа 6 з',
    'покупка 42 з / продажа 24 з',
    'покупка 126 з / продажа 72 з',
    'покупка 32 з / продажа 18 з',
    'покупка 95 з / продажа 54 з',
    'покупка 158 з / продажа 90 з',
    'покупка 263 з / продажа 150 з',
  ], 'строки цен — бит-в-бит (hero, Торговец 0): '
    + JSON.stringify(metaLinesOf(overlay)));
  buyWoodSword(h, overlay, 10);
  assert.equal(st.hero.gold, 90, 'золото −10 (1-я покупка)');
  assert.equal(stock.wood_sword, 1, 'сток −1 (live-ссылка)');
  assert.ok(nameLinesOf(overlay)
    .includes('Деревянный меч (ост. 1)'),
    'сток −1 ин-плейс: «ост. 1» после 1-й покупки');
  buyWoodSword(h, overlay, 10);
  assert.equal(st.hero.gold, 80, 'золото −10 (2-я покупка — сток 1→0)');
  assert.equal(stock.wood_sword, 0, 'сток = 0');
  // ре-пин 000315: двухколоночная торговля — купленные предметы
  // появляются в Инвентарь-колонке («имя ×N», левая колонка — раньше в
  // DOM-порядке); контракт «сток 0 — магазин-строки нет» не тронут.
  assert.deepEqual(nameLinesOf(overlay), ['Деревянный меч ×2'].concat(OTHER_6),
    'позиция со стоком 0 — ОТСУТСТВУЕТ (0 строк для предмета); '
    + 'прочие — бит-в-бит + инв-строка «×2»: '
    + JSON.stringify(nameLinesOf(overlay)));
  assert.equal(overlay.querySelectorAll('button[data-npcact="buy"]')
    .filter((b) => b.dataset.item === 'wood_sword').length, 0,
    'кнопки «купить» (wood_sword) нет');
  assert.equal(overlay.querySelectorAll('button[data-npcact="sell"]')
    .filter((b) => b.dataset.item === 'wood_sword').length, 0,
    'кнопки «продать» (wood_sword) нет (строка объединяет buy+sell)');
  assert.ok(!textOf(overlay).includes('Деревянный меч (ост. '),
    'текст оверлея без строки «Деревянный меч (ост. N)»');
  assert.equal(h.errors.length, before,
    '0 новых console.error: ' + h.errors.slice(before).join('; '));
  h.sandbox.Game.npcUI.close();
});

test('A2. refresh (новый сток) — позиция вернулась (регресс «обновление ассортимента»)', async () => {
  const h = await boot();
  const st = seedWorld(h);
  const stockA = BRENN_STOCK();
  const { G, overlay } = openBrennTrade(h, st, stockA);
  buyWoodSword(h, overlay, 10);
  buyWoodSword(h, overlay, 10);
  assert.equal(stockA.wood_sword, 0, 'сток 0 после 2 покупок');
  G.npcUI.close();
  const stockB = BRENN_STOCK();
  const o2 = openBrennTrade(h, st, stockB);
  // ре-пин 000315: инв-колонка (купленное осталось у hero) — первой.
  assert.deepEqual(nameLinesOf(o2.overlay), ['Деревянный меч ×2'].concat(ALL_7),
    'refresh: позиция вернулась с полным (ост. 2): '
    + JSON.stringify(nameLinesOf(o2.overlay)));
  G.npcUI.close();
});

test('A2b. мирской NPC — live-сток без респавна: позиция со стоком 0 остаётся скрытой (персистентность, как в main.js npcStocks)', async () => {
  const h = await boot();
  const st = seedWorld(h);
  const stockA = BRENN_STOCK();
  const { G, overlay } = openBrennTrade(h, st, stockA);
  buyWoodSword(h, overlay, 10);
  buyWoodSword(h, overlay, 10);
  assert.equal(stockA.wood_sword, 0, 'сток 0 после 2 покупок');
  G.npcUI.close();
  const o2 = openBrennTrade(h, st, stockA);
  // ре-пин 000315: инв-колонка («Деревянный меч ×2» у hero) — первой.
  assert.deepEqual(nameLinesOf(o2.overlay), ['Деревянный меч ×2'].concat(OTHER_6),
    'повторное открытие с ТЕМ ЖЕ стоком: строка wood_sword '
    + 'ОТСУТСТВУЕТ (респавна нет, сток жив): '
    + JSON.stringify(nameLinesOf(o2.overlay)));
  assert.ok(!textOf(o2.overlay).includes('Деревянный меч (ост. '),
    'без строки «Деревянный меч (ост. N)»');
  G.npcUI.close();
});

test('A3. ключ отсутствует в карте стока = 0: позиция отсутствует (реальный городской поток — makeCityShop не обязан содержать весь каталог)', async () => {
  const h = await boot();
  const st = seedWorld(h);
  const { G, overlay } = openBrennTrade(h, st, { wood_sword: 1 });
  assert.deepEqual(nameLinesOf(overlay), ['Деревянный меч (ост. 1)'],
    'ровно 1 строка (единственный ключ стока); прочие 6 позиций '
    + 'каталога — ОТСУТСТВУЮТ: ' + JSON.stringify(nameLinesOf(overlay)));
  assert.deepEqual(metaLinesOf(overlay), [
    'Золото: 100',
    'покупка 10 з / продажа 6 з',
  ], 'цена единственной строки — бит-в-бит');
  assert.equal(overlay.querySelectorAll('button[data-npcact="buy"]')
    .length, 1, 'ровно 1 кнопка «купить» (wood_sword)');
  const sells = overlay.querySelectorAll('button[data-npcact="sell"]');
  assert.equal(sells.length, 1, 'ровно 1 кнопка «продать» (строка одна)');
  assert.equal(sells[0].disabled, true,
    '«продать» — disabled (в инвентаре hero пусто)');
  G.npcUI.close();
});

// --- Часть B: вкладка «Магазин» [I]-панели (регресс 000101/000130 —
// экран уже соответствует контракту, 0-diff) ---

function openIWithShop(h, st, shop) {
  const G = h.sandbox.Game;
  G.playerUI.setCharacter(st.hero);
  G.playerUI.toggle(true);
  const panel = findAll(h.body, '.char-panel')[0];
  assert.ok(panel, 'панель [I] подвешена к body');
  G.playerUI.setShop(shop);
  const bodyEl = panel._shopBody;
  assert.ok(bodyEl, 'секция «Магазин» панели [I]');
  return { G, panel, bodyEl };
}

test('B1. [I] «Магазин»: покупка последней штуки → 0 строк; прочие позиции — бит-в-бит (регресс 000101)', async () => {
  const h = await boot();
  const st = seedWorld(h);
  const shop = {
    x: 1, y: 1,
    buildingType: 2, wealth: 1,
    stock: { healing_potion: 1, bread: 2 },
  };
  const { G, panel, bodyEl } = openIWithShop(h, st, shop);
  const before = h.errors.length;
  const names = () => bodyEl.querySelectorAll('.cp-itemname')
    .map((e) => String(e.textContent));
  const metas = () => bodyEl.querySelectorAll('.cp-itemmeta')
    .map((e) => String(e.textContent));
  assert.deepEqual(names(), ['Зелье лечения ×1', 'Хлеб ×2'],
    'buy-строки — бит-в-бит (порядок, количества): ' + JSON.stringify(names()));
  assert.deepEqual(metas(), [
    'аптекарь, богатство 1/3',
    'покупка 9 з',
    'покупка 2 з',
  ], 'строки цен — бит-в-бит (hero, wealth 1: round(10×0.9)=9, '
    + 'round(2×0.9)=2): ' + JSON.stringify(metas()));
  const buyBtn = bodyEl.querySelectorAll('button[data-act="buy"]')
    .find((b) => b.dataset.item === 'healing_potion');
  assert.ok(buyBtn, 'кнопка «купить» (healing_potion) на месте');
  panel.listeners.click[0]({ target: buyBtn });
  assert.equal(st.hero.gold, 91, 'золото −9 (round(10×0.9))');
  assert.equal(G.totalQty(st.hero, 'healing_potion'), 1,
    'предмет — в инвентаре hero');
  assert.equal(shop.stock.healing_potion, 0, 'сток −1 → 0');
  assert.deepEqual(names(), ['Хлеб ×2', 'Зелье лечения ×1'],
    'BUY-строка «Зелье лечения ×1» (сток 0) — ОТСУТСТВУЕТ; осталась '
    + '«Хлеб ×2» + SELL-строка «Зелье лечения ×1» (hero теперь '
    + 'владает предметом — инвентарная секция, не сток): '
    + JSON.stringify(names()));
  assert.deepEqual(metas(), [
    'аптекарь, богатство 1/3',
    'покупка 2 з',
    'продажа 12 з',
  ], '«Хлеб ×2» — строка цены бит-в-бит; за «Зельем» — SELL-цена '
    + 'round(10×1.15)=12: ' + JSON.stringify(metas()));
  assert.equal(bodyEl.querySelectorAll('button[data-act="buy"]')
    .filter((b) => b.dataset.item === 'healing_potion').length, 0,
    'BUY-кнопки (healing_potion) нет — строка стока не рендерится');
  assert.equal(bodyEl.querySelectorAll('button[data-act="sell"]')
    .filter((b) => b.dataset.item === 'healing_potion').length, 1,
    'SELL-кнопка (healing_potion) — инвентарная секция (не сток)');
  assert.equal(h.errors.length, before,
    '0 новых console.error: ' + h.errors.slice(before).join('; '));
  G.playerUI.toggle(false);
});

test('B2. [I] «Магазин»: setShop с новым key — позиция вернулась (shopKey-гард ядра)', async () => {
  const h = await boot();
  const st = seedWorld(h);
  const shop0 = {
    x: 1, y: 1,
    buildingType: 2, wealth: 1,
    stock: { healing_potion: 1, bread: 2 },
  };
  const { G, panel, bodyEl } = openIWithShop(h, st, shop0);
  const buyBtn = bodyEl.querySelectorAll('button[data-act="buy"]')
    .find((b) => b.dataset.item === 'healing_potion');
  assert.ok(buyBtn, 'кнопка «купить» (healing_potion) до покупки');
  panel.listeners.click[0]({ target: buyBtn });
  assert.equal(shop0.stock.healing_potion, 0, 'сток −1 → 0');
  const names = () => bodyEl.querySelectorAll('.cp-itemname')
    .map((e) => String(e.textContent));
  assert.deepEqual(names(), ['Хлеб ×2', 'Зелье лечения ×1'],
    'BUY-строка «Зелье лечения ×1» (сток 0) — ОТСУТСТВУЕТ (SELL-строка '
    + 'из инвентаря — не сток)');
  G.playerUI.setShop({
    x: 1, y: 2,
    buildingType: 2, wealth: 1,
    stock: { healing_potion: 3 },
  });
  assert.deepEqual(names(), ['Зелье лечения ×3', 'Зелье лечения ×1'],
    'смена key (y) — ре-рендер, позиция вернулась (BUY ×3; SELL ×1 — '
    + 'инвентарь): ' + JSON.stringify(names()));
  G.playerUI.toggle(false);
});

// --- Часть C: spec-пины (красные до правки spec, зелёные в том же
// коммите) ---

function esc(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Нормализация: коллапс белых + нижний регистр (паттерн
// tests/spec-000312-wording.test.js).
function norm(s) {
  return s.replace(/\s+/g, ' ').toLowerCase();
}

function phrase(slice, label, needle, why) {
  assert.ok(
    norm(slice).includes(norm(needle)),
    label + ': фраза не найдена: «' + needle + '» — ' + why);
}

function bulletAt(text, prefix) {
  const i = text.indexOf(prefix);
  assert.notEqual(i, -1, 'spec: буллет «' + prefix + '» не найден');
  const j = text.indexOf('\n * ', i + 1);
  return text.slice(i, j === -1 ? text.length : j);
}

function h3Slice(sec, name) {
  const m = sec.match(new RegExp('^### ' + esc(name) + '\\s*$', 'm'));
  assert.ok(m, 'spec: раздел «### ' + name + '» не найден');
  const j3 = sec.indexOf('\n### ', m.index + 1);
  const j2 = sec.indexOf('\n## ', m.index + 1);
  let j = -1;
  if (j3 !== -1 && (j2 === -1 || j3 < j2)) j = j3;
  else if (j2 !== -1) j = j2;
  return sec.slice(m.index, j === -1 ? sec.length : j);
}

test('W1. spec/npc-storage.md буллет «Экран» — строки «торговли» только предметы со стоком ≥ 1 (000314)', () => {
  const b = bulletAt(NSTOR, ' * Экран — оверлей диалога');
  phrase(b, 'буллет «Экран»',
    'строки «торговли» — только предметы со стоком ≥ 1 (000314)',
    'контракт «0 — строка отсутствует» для вкладки «торговля» '
    + 'не зафиксирован');
  phrase(b, 'буллет «Экран»',
    'строка возвращается при регенерации стока (лагерь — по дню, '
    + 'город — city_respawn_days, мирской NPC — респавна нет)',
    'регенерация стока по типам (лагерь/город/мир) не зафиксирована');
});

test('W2. spec/buildings.md «### Магазины» — позиция с количеством 0 не отображается (000314)', () => {
  const sc = h3Slice(BLD, 'Магазины');
  phrase(sc, '«### Магазины»',
    'позиция с количеством 0 не отображается (000314)',
    'контракт «0 — строка отсутствует» для магазинов построек '
    + 'не зафиксирован');
  // 000319: формулировка намеренно переписана (line-neutral):
  // картовые — НЕ «makeShop при смене тайла/богатства» (сток
  // хранится по точкам, tasks/done/000319.md), лагерь/город — прежние.
  phrase(sc, '«### Магазины»',
    'строка возвращается при регенерации стока точки (картовые — '
    + 'Сток по точкам (000319), ротация per-точка по окну '
    + 'city_respawn_days (000319) от дня генерации; лагерь — по '
    + 'дню, город — city_respawn_days)',
    'регенерация стока по типам магазинов не зафиксирована');
});

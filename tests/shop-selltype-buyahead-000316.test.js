// Задача 000316 — магазины: продажа по типу (sellable(K)) + выкуп
// следующего обновления детерминированного стока (ТЗ
// tasks/done/000316.md; контракт memory/000316-shop-selltype.md).
//
// Контракт:
//  (1) ПРОДАЖА ПО ТИПУ: предмет kind T продаётся в магазине вида K,
//      если T ∈ sellable(K) — sellAccepts(shop,itemId): «не-магазин»
//      (shopKindsFor → null: лагерь 47, Арена) не скупает НИЧЕГО (P1);
//      богатство 3 (универсам) скупает ВСЁ (P2); floor: kind ∈ видов
//      ассортимента — скупается всегда (P3); таблица SELLABLE_BY_KIND
//      — сверх floor (P4). Цена — существующая формула (без новых
//      множителей); у предмета без конечной цены — SELL_BASE_VALUE по
//      kind (оборонительно: валидатор каталога требует value, но
//      NaN его проходит).
//  (2) ВЫКУП СЛЕДУЮЩЕГО ОБНОВЛЕНИЯ: позиции грядущей ротации стока
//      (барахолка лагеря — сток по (тайл, день)) покупаются сейчас;
//      покупка списывает их из стока СЛЕДУЮЩЕГО цикла
//      (consumeShopAhead при refresh, min-clamp), в ТЕКУЩЕМ сток не
//      фигурирует и остаётся цел; 0 новых RNG (сид-формулы и потоки
//      mulberry32 — бит-в-бит).
//
// КРАСНЫЕ (осмысленные ERR_ASSERTION с дампами — guard typeof ПЕРЕД
// вызовом нового API, не крах/TypeError): T1 (щит/инструмент/кольцо/
// свитки/артефакты в назначенных магазинах), T2 (sweep полноты),
// T3 (универсам скупает всё), T5 (SELL_BASE_VALUE + дивергирующий
// каталог в vm), T6 (экран [I]: sell-фильтр по типу + блок
// «Следующее обновление» + клик-выкуп), T7 (ядро выкупа + consume),
// T8 (секция сейва shopPreOrders: roundtrip/санация + структура
// main.js), T10 (спека-иглы).
// ЗЕЛЁНЫЕ с первого запуска (страховочные регресс-пины): T4 (лагерь
// BUY-ONLY в том числе богатство 3; цены без изменений), T9 (0 новых
// RNG: сид-формулы/стоки/срок ротации — бит-в-бит).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const I = require('../src/items.js');
const M = require('../src/map.js');
const PL = require('../src/perlin.js');
const { createCharacter } = require('../src/player.js');
const B = M.BUILDING_TYPES;

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const FULL_CHAIN = Array.from(html.matchAll(/<script\s+src="([^"]+)"/g),
  (m) => m[1]).map((p) => p.replace(/^src\//, ''))
  .filter((f) => f !== 'main.js');

const campRec = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'assets', 'buildings', 'camp.json'),
    'utf8'));

const ITEMS_DIR = path.join(ROOT, 'assets', 'items');
const diskItems = fs.readdirSync(ITEMS_DIR)
  .filter((f) => /^\d+\.json$/.test(f))
  .map((f) => JSON.parse(fs.readFileSync(path.join(ITEMS_DIR, f),
    'utf8')));
const diskKinds = [...new Set(diskItems.map((it) => it.kind))].sort();

const ALL_KINDS = [...new Set(Object.values(I.ITEM_KINDS)
  .concat(diskKinds))].sort();

function sampleOf(kind) {
  return I.allItems().find((it) => it.kind === kind) || null;
}

function shopAt(bt, w) {
  return I.makeShop(7, 9, bt, w);
}

const NO_BUY = 'магазин не скупает такие предметы';

// ============ vm-хелперы (полная цепочка index.html БЕЗ main.js —
// паттерн tests/shop-zero-stock-000314.test.js) ============

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
    get: (t, k) => (k in t ? t[k] : (...args) => {
      calls.push([k, args]);
    }),
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
  if (tag &&
      String(el.tagName || '').toLowerCase() !== tag.toLowerCase()) {
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
        raw.parent.children.splice(
          raw.parent.children.indexOf(raw), 1);
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
      (target.listeners[type] ||
        (target.listeners[type] = [])).push(fn);
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
      return kind === 'webgl'
        ? makeGl() : makeContext2d(target);
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

function makeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

function bootSandbox() {
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
    addEventListener: () => {},
    removeEventListener: () => {},
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
    performance: { now: () => 1000 },
    requestAnimationFrame: (fn) => { raf.push(fn); return raf.length; },
    setTimeout: () => 0,
    clearTimeout: () => {},
  };
  vm.createContext(sandbox);
  for (const f of FULL_CHAIN) {
    vm.runInContext(
      fs.readFileSync(path.join(ROOT, 'src', f), 'utf8'), sandbox,
      { filename: f });
  }
  return { sandbox, raf, errors, storage, body };
}

const drain = () => new Promise((r) => setImmediate(r));

async function boot() {
  const h = bootSandbox();
  await drain();
  await drain();
  await drain();
  return h;
}

function seedWorld(h) {
  const G = h.sandbox.Game;
  const state = {
    day: 1,
    hero: G.createCharacter('Флогистон'),
    efir: G.efir.createEfir(),
    efirMet: true,
    roster: [],
    deadMercs: [],
  };
  h.sandbox.__game = { state };
  return state;
}

// Дивергирующий каталог (house-паттерн tests/items.test.js L7:
// цепочка до player.js, затем Game.ITEMS подменяется ДО загрузки
// items.js — браузерная ветка UMD читает G0.ITEMS при ЗАГРУЗКЕ).
function divergedBoot(probes) {
  const errors = [];
  const sandbox = {
    console: {
      warn: () => {},
      error: (m) => errors.push(String(m)),
      log: () => {},
    },
  };
  vm.createContext(sandbox);
  const chain = ['global-settings.js', 'perlin.js', 'map.js',
    'skills-data.js', 'items-data.js', 'sheet.js', 'player.js'];
  for (const f of chain) {
    vm.runInContext(
      fs.readFileSync(path.join(ROOT, 'src', f), 'utf8'), sandbox,
      { filename: f });
  }
  sandbox.Game.ITEMS = probes;
  vm.runInContext(
    fs.readFileSync(path.join(ROOT, 'src', 'items.js'), 'utf8'),
    sandbox, { filename: 'items.js' });
  return { G: sandbox.Game, errors };
}

function textOf(n) {
  let s = (n && n._text) ? String(n._text) : '';
  for (const ch of (n && n.children) || []) s += textOf(ch);
  return s;
}

function norm(s) {
  return s.replace(/\s+/g, ' ').toLowerCase();
}

// ============================================================
// T1. Продажа по типу: новые пары kind → магазин + отказ (RED)
// ============================================================

test('T1. продажа по типу: shield/tool в оружейной, ring у бронника, свитки/артефакты/книги/реагенты в магазине магии — ok; чужой магазин — отказ с каноничной причиной', () => {
  const shieldId = sampleOf('shield').id;
  const toolId = sampleOf('tool').id;
  const ringId = sampleOf('ring').id;
  const weaponId = sampleOf('weapon').id;
  const armorId = sampleOf('armor').id;
  const potionId = sampleOf('potion').id;
  const foodId = sampleOf('food').id;
  const reagentId = sampleOf('reagent').id;
  const bookId = sampleOf('skill_book').id;
  const scrollId = sampleOf('spell_scroll').id;
  const resId = sampleOf('resurrection_scroll').id;
  const craftId = sampleOf('craft_scroll').id;
  const artId = sampleOf('artifact').id;
  assert.ok(shieldId && toolId && ringId && weaponId && armorId
    && potionId && foodId && reagentId && bookId && scrollId && resId
    && craftId && artId,
    'каталог представляет все 13 kind');
  const OK = [
    [B.WEAPONS_SHOP, weaponId], [B.WEAPONS_SHOP, shieldId],
    [B.WEAPONS_SHOP, toolId],
    [B.ARMOR_SHOP, armorId], [B.ARMOR_SHOP, ringId],
    [B.APOTHECARY, potionId], [B.APOTHECARY, foodId],
    [B.TAVERN, foodId], [B.TAVERN, potionId],
    [B.MAGIC_SHOP, reagentId], [B.MAGIC_SHOP, bookId],
    [B.MAGIC_SHOP, scrollId], [B.MAGIC_SHOP, resId],
    [B.MAGIC_SHOP, craftId], [B.MAGIC_SHOP, artId],
  ];
  const NO = [
    [B.APOTHECARY, weaponId], [B.TAVERN, weaponId],
    [B.APOTHECARY, shieldId], [B.APOTHECARY, ringId],
    [B.WEAPONS_SHOP, potionId], [B.WEAPONS_SHOP, armorId],
    [B.WEAPONS_SHOP, ringId], [B.WEAPONS_SHOP, artId],
    [B.ARMOR_SHOP, weaponId], [B.ARMOR_SHOP, toolId],
    [B.MAGIC_SHOP, weaponId], [B.MAGIC_SHOP, armorId],
    [B.TAVERN, scrollId],
  ];
  for (const [bt, id] of OK) {
    const c = createCharacter('Флогистон');
    I.addItem(c, id, 1);
    const shop = shopAt(bt, 1);
    const r = I.sellItem(shop, c, id, 1);
    assert.equal(r.ok, true,
      'kind ' + I.getItem(id).kind + ' продаётся в bt' + bt +
      ' (RED: таблица sellable не работает): ' + JSON.stringify(r));
    assert.equal(c.gold, 100 + I.sellPrice(shop, id, c),
      'золото + цена по существующей формуле');
  }
  for (const [bt, id] of NO) {
    const c = createCharacter('Флогистон');
    I.addItem(c, id, 1);
    const r = I.sellItem(shopAt(bt, 1), c, id, 1);
    assert.deepEqual(r, { ok: false, reason: NO_BUY },
      'kind ' + I.getItem(id).kind + ' НЕ продаётся в bt' + bt +
      ' (причина — канонична, пин 000095): ' + JSON.stringify(r));
    assert.equal(I.totalQty(c, id), 1,
      'предмет остался в инвентаре');
  }
});

// ============================================================
// T2. ПОЛНОТА sweep (kind — динамически с диска assets/items —
// +50 weapons параллельной 000321.01 безопасны) (RED: guard)
// ============================================================

test('T2. sweep полноты: у КАЖДОГО kind (диск assets/items ∪ ITEM_KINDS) есть ≥1 магазин-покупатель; у каждого bt — ≥1 kind; таблица ⊆ ITEM_KINDS', () => {
  assert.equal(typeof I.sellAccepts, 'function',
    'RED: sellAccepts не экспортирован (000316)');
  assert.equal(typeof I.SELLABLE_BY_KIND, 'object',
    'RED: SELLABLE_BY_KIND не экспортирован (000316)');
  assert.ok(diskKinds.length >= 13,
    'диск: каталожных kind не меньше ITEM_KINDS: ' +
    JSON.stringify(diskKinds));
  const BTS = [0, 1, 2, 3, 11];
  for (const kind of ALL_KINDS) {
    const it = sampleOf(kind);
    assert.ok(it,
      'kind каталога ' + kind + ' не найден в core-каталоге ' +
      '(зеркало отстаёт от assets/items — sync-all)');
    let found = null;
    for (const bt of BTS) {
      for (const w of [0, 1, 2]) {
        if (I.sellAccepts(shopAt(bt, w), it.id)) found = bt;
      }
    }
    assert.notEqual(found, null,
      'RED: kind ' + kind + ' не скупает НИ ОДИН магазин ' +
      '(полнота таблицы sellable нарушена)');
  }
  for (const bt of BTS) {
    const hit = ALL_KINDS.some((kind) => {
      const it = sampleOf(kind);
      return it && I.sellAccepts(shopAt(bt, 1), it.id);
    });
    assert.ok(hit,
      'RED: магазин bt' + bt + ' не скупает ни одного kind');
  }
  const kindIds = Object.values(I.ITEM_KINDS);
  for (const k of Object.keys(I.SELLABLE_BY_KIND)) {
    assert.ok(kindIds.includes(k),
      'висячий kind в таблице sellable: ' + k);
  }
});

// ============================================================
// T3. Универсам (богатство 3) скупает всё; богатство <3 — не всё (RED)
// ============================================================

test('T3. универсам (богатство 3) скупает ВСЕ kind в «картовом» магазине; богатство <3 скупает не всё; «не-магазин» богатства 3 — по-прежнему ничего', () => {
  assert.equal(typeof I.sellAccepts, 'function',
    'RED: sellAccepts не экспортирован (000316)');
  for (const bt of [0, 1, 2]) {
    const shop = shopAt(bt, 3);
    for (const kind of ALL_KINDS) {
      const it = sampleOf(kind);
      if (!it) continue;
      assert.equal(I.sellAccepts(shop, it.id), true,
        'RED: универсам bt' + bt + ' не скупает kind ' + kind);
    }
  }
  for (const bt of [0, 1, 2, 3, 11]) {
    let rejected = 0;
    for (const kind of ALL_KINDS) {
      const it = sampleOf(kind);
      if (it && !I.sellAccepts(shopAt(bt, 2), it.id)) rejected++;
    }
    assert.ok(rejected > 0,
      'магазин bt' + bt + ' (богатство 2) скупает всё — ' +
      'универсам-дыра');
  }
  // P1: лагерь богатства 3 — НЕ универсам (не-магазин).
  const camp = I.makeCampShop(3, 4, 1, 3, campRec);
  const c = createCharacter('Флогистон');
  I.addItem(c, 'bread', 1);
  assert.equal(I.sellAccepts(camp, 'bread'), false,
    'RED: лагерь богатства 3 не должен скупать (P1)');
  assert.deepEqual(I.sellItem(camp, c, 'bread', 1),
    { ok: false, reason: NO_BUY });
});

// ============================================================
// T4. (зелёный пин) Барахолка BUY-ONLY + прежние цены
// ============================================================

test('T4. барахолка BUY-ONLY: отказ deepEqual при богатстве 2 и 3; buyPrice/sellPrice — прежние формулы (регресс)', () => {
  const s2 = I.makeCampShop(10, 20, 1, 2, campRec);
  const s3 = I.makeCampShop(10, 20, 1, 3, campRec);
  assert.equal(I.shopKindsFor(47), null);
  const c = createCharacter('Флогистон');
  I.addItem(c, 'bread', 1);
  assert.deepEqual(I.sellItem(s2, c, 'bread', 1),
    { ok: false, reason: NO_BUY }, 'богатство 2 — отказ');
  assert.deepEqual(I.sellItem(s3, c, 'bread', 1),
    { ok: false, reason: NO_BUY }, 'богатство 3 — отказ (не ' +
    'универсам: P1 раньше P2)');
  const bread = I.getItem('bread');
  assert.equal(I.buyPrice(s2, 'bread', c),
    Math.max(1, Math.round(bread.value * (1 - 0.10 * 2))),
    'buyPrice — прежняя формула');
  assert.equal(I.sellPrice(s2, 'bread', c),
    Math.max(1, Math.round(bread.value * (1 + 0.15 * 2))),
    'sellPrice — прежняя формула (лагерь считает цену, но не ' +
    'покупает)');
});

// ============================================================
// T5. Цена: существующая формула вне ассортимента; дивергирующий
// каталог — base по kind (RED: SELL_BASE_VALUE)
// ============================================================

test('T5. цена продажи/выкупа — существующая формула (без новых множителей); предмет без конечной цены — SELL_BASE_VALUE по kind в vm с дивергирующим каталогом; у всех core-предметов value конечен', () => {
  assert.equal(typeof I.SELL_BASE_VALUE, 'object',
    'RED: SELL_BASE_VALUE не экспортирован (000316)');
  assert.notEqual(I.SELL_BASE_VALUE, null,
    'RED: SELL_BASE_VALUE null (000316)');
  for (const k of Object.values(I.ITEM_KINDS)) {
    assert.equal(typeof I.SELL_BASE_VALUE[k], 'number',
      'SELL_BASE_VALUE покрывает kind ' + k);
  }
  const ringId = sampleOf('ring').id;
  const shieldId = sampleOf('shield').id;
  const c0 = createCharacter('Флогистон');
  const s1w2 = shopAt(B.ARMOR_SHOP, 2);
  assert.equal(I.sellPrice(s1w2, ringId, c0),
    Math.max(1, Math.round(
      I.getItem(ringId).value * (1 + 0.15 * 2) * 1)),
    'продажа вне ассортимента (кольцо у бронника) — та же формула');
  const s0w1 = shopAt(B.WEAPONS_SHOP, 1);
  assert.equal(I.sellPrice(s0w1, shieldId, c0),
    Math.max(1, Math.round(
      I.getItem(shieldId).value * (1 + 0.15 * 1) * 1)),
    'продажа вне ассортимента (щит в оружейной) — та же формула');
  assert.equal(I.buyPrice(s1w2, ringId, c0),
    Math.max(1, Math.round(
      I.getItem(ringId).value * (1 - 0.10 * 2) * 1)),
    'выкуп следующего обновления — существующая buyPrice (без ' +
    'множителя «заранее»)');
  const broken = I.allItems()
    .filter((it) => !Number.isFinite(it.value));
  assert.deepEqual(broken.map((it) => it.id), [],
    'sweep: у ВСЕХ core-предметов value конечен → базовая цена по ' +
    'типу — оборонительная ветка (0 попаданий на каталоге)');
  // Дивергирующий каталог: валидатор пропускает value=NaN (дыра
  // validateItem L358: typeof number + NaN<1 === false) — ветка
  // SELL_BASE_VALUE достижима; неизвестный kind (не проходит
  // валидатор) остаётся чистой обороной (?? 1).
  const probes = [
    { id: 'probe_ring', kind: 'ring', name: 'Проба-кольцо',
      weight: 1, slot: 'ring', rarity: 'common',
      value: NaN },
    { id: 'probe_bread', kind: 'food', name: 'Проба-хлеб',
      weight: 1, value: 3, effect: { kind: 'eat', amount: 1 } },
  ];
  const h = divergedBoot(probes);
  assert.equal(typeof h.G.SELL_BASE_VALUE, 'object',
    'RED: vm: SELL_BASE_VALUE отсутствует в Game');
  const hv = h.G.createCharacter('Флогистон');
  const shopLit = { x: 1, y: 1, buildingType: 1, wealth: 0,
    stock: {} };
  const baseRing = I.SELL_BASE_VALUE.ring;
  assert.equal(h.G.sellPrice(shopLit, 'probe_ring', hv),
    Math.max(1, Math.round(baseRing * (1 + 0.15 * 0) * 1)),
    'RED: предмет без цены — базовая по kind (ring → ' +
    baseRing + ')');
  assert.equal(h.G.sellPrice(shopLit, 'probe_bread', hv), 3,
    'предмет с ценой — бит-в-бит прежняя формула (value 3, ' +
    'богатство 0)');
  assert.equal(h.G.sellPrice(shopLit, 'probe_nothere', hv), null,
    'несуществующий предмет — null (регресс)');
});

// ============================================================
// T6. Экран [I]: sell-фильтр sellAccepts + блок «Следующее
// обновление» + клик-выкуп (RED)
// ============================================================

test('T6. экран [I] «Магазин»: продажа по типу (ring у бронника есть, в оружейной нет); без провайдера — 0 новых строк; с провайдером — заголовок + строки только отсутствующих в текущем стоке позиций; клик — выкуп (токен предзаказа), повтор сверх avail — «нет в наличии»; 0 console.error', async () => {
  const h = await boot();
  const G = h.sandbox.Game;
  const st = seedWorld(h);
  const hero = st.hero;
  const ringId = sampleOf('ring').id;
  const armorId = sampleOf('armor').id;
  const aheadId = 'healing_potion';
  G.addItem(hero, ringId, 1);
  const errBefore = h.errors.length;

  function openShop(shop) {
    G.playerUI.setCharacter(hero);
    G.playerUI.toggle(false);
    G.playerUI.toggle(true);
    const panel = findAll(h.body, '.char-panel')[0];
    assert.ok(panel, 'панель [I] подвешена');
    G.playerUI.setShop(shop);
    assert.ok(panel._shopBody, 'секция «Магазин»');
    return panel;
  }
  function btns(panel, act) {
    return findAll(panel._shopBody,
      'button[data-act="' + act + '"]');
  }

  // Продажа по типу: bt1 (бронник) принимает ring, bt0 — нет.
  const shop1 = { x: 1, y: 1, buildingType: 1, wealth: 0,
    stock: { [armorId]: 1 } };
  let panel = openShop(shop1);
  assert.ok(btns(panel, 'sell')
    .some((b) => b.dataset.item === ringId),
    'RED: SELL-строка ring у бронника (продажа по типу) ' +
    'отсутствует');
  const shopW = { x: 1, y: 2, buildingType: 0, wealth: 0,
    stock: { wood_sword: 1 } };
  panel = openShop(shopW);
  assert.ok(!btns(panel, 'sell')
    .some((b) => b.dataset.item === ringId),
    'ring НЕ продаётся в оружейной (SELL-строки нет)');
  // Без провайдера — блока следующего обновления нет (совместимость
  // харнесов 000314/000317 — deepEqual-пины строк не сдвигаются).
  assert.ok(!textOf(panel._shopBody).includes('Следующее обновление'),
    'без setShopAheadProvider — блок «Следующее обновление» пуст');

  assert.equal(typeof G.setShopAheadProvider, 'function',
    'RED: setShopAheadProvider не экспортирован (000316)');
  G.setShopAheadProvider((sh) => ({ key: 'C:9,9',
    stock: { [aheadId]: 2, [armorId]: 1 } }));
  const shop9 = { x: 9, y: 9, buildingType: 1, wealth: 0,
    stock: { [armorId]: 1 } };
  panel = openShop(shop9);
  const bodyText = textOf(panel._shopBody);
  assert.ok(bodyText.includes('Следующее обновление'),
    'RED: заголовок «Следующее обновление…» не отрисован: '
    + bodyText);
  const aheadBtns = btns(panel, 'buy')
    .filter((b) => b.dataset.item === aheadId);
  assert.equal(aheadBtns.length, 1,
    'RED: ровно 1 ahead-строка healing_potion (в текущем стоке ' +
    'её нет)');
  const armorBuyBtns = btns(panel, 'buy')
    .filter((b) => b.dataset.item === armorId);
  assert.equal(armorBuyBtns.length, 1,
    'предмет, ЕСТЬ в текущем стоке — только обычная buy-строка ' +
    '(выкуп не предлагается): ' + armorBuyBtns.length);
  const aheadRow = aheadBtns[0].closest('.cp-itemrow');
  assert.ok(textOf(aheadRow).includes('(след. обновление)'),
    'RED: meta ahead-строки — «покупка N з (след. обновление)»: '
    + textOf(aheadRow));
  const price = G.buyPrice(shop9, aheadId, hero);
  const stockSnapshot =
    JSON.parse(JSON.stringify(shop9.stock));
  const gold0 = hero.gold;
  panel.listeners.click[0]({ target: aheadBtns[0] });
  assert.equal(hero.gold, gold0 - price,
    'выкуп списывает золото по существующей buyPrice × 1');
  assert.equal(G.totalQty(hero, aheadId), 1,
    'RED: предмет выкупа — в инвентаре');
  assert.deepEqual(JSON.parse(JSON.stringify(shop9.stock)),
    stockSnapshot,
    'ТЕКУЩИЙ сток цел (deepStrictEqual): '
    + JSON.stringify(shop9.stock));
  const pre1 =
    JSON.parse(JSON.stringify(G.serializeShopPreOrders()));
  assert.deepEqual(pre1, { 'C:9,9': { [aheadId]: 1 } },
    'RED: предзаказ записан в магазинный сток следующего цикла');
  // avail 2−1 → после ре-рендера «×1».
  panel = openShop(shop9);
  const aheadBtn2 = btns(panel, 'buy')
    .filter((b) => b.dataset.item === aheadId);
  assert.equal(aheadBtn2.length, 1, 'остался ещё 1 выкуп');
  assert.ok(textOf(aheadBtn2[0].closest('.cp-itemrow'))
    .includes('×1'),
    'avail следующего стока уменьшен до ×1: '
    + textOf(aheadBtn2[0].closest('.cp-itemrow')));
  panel.listeners.click[0]({ target: aheadBtn2[0] });
  assert.equal(G.totalQty(hero, aheadId), 2);
  const over = G.buyItem(shop9, hero, aheadId, 1);
  assert.equal(over.ok, false,
    'RED: третий выкуп сверх avail следующего стока — отказ');
  assert.match(over.reason, /нет в наличии/,
    'причина отказа сверх avail — «нет в наличии» (не «мало ' +
    'золота»)');
  assert.deepEqual(
    JSON.parse(JSON.stringify(G.serializeShopPreOrders())),
    { 'C:9,9': { [aheadId]: 2 } },
    'при отказе — 0 мутаций предзаказа (счёт прежний)');
  G.setShopAheadProvider(null);
  G.playerUI.toggle(false);
  assert.deepEqual(h.errors.slice(errBefore), [],
    '0 новых console.error: ' +
    h.errors.slice(errBefore).join('; '));
});

// ============================================================
// T7. Ядро выкупа следующего цикла: camp-поток, consume при refresh
// (RED)
// ============================================================

test('T7. выкуп следующего цикла (ядро): покупка отсутствующего предмета ok+message; следующий сток −qty; consumeShopAhead при refresh вычитает (min-clamp) и гасит предзаказ; B (есть в обоих стоках) покупается из текущего без предзаказа; world-магазин без провайдера — прежний отказ', () => {
  assert.equal(typeof I.setShopAheadProvider, 'function',
    'RED: setShopAheadProvider не экспортирован (000316)');
  assert.equal(typeof I.nextCycleStock, 'function',
    'RED: nextCycleStock не экспортирован (000316)');
  assert.equal(typeof I.consumeShopAhead, 'function',
    'RED: consumeShopAhead не экспортирован (000316)');
  assert.equal(typeof I.serializeShopPreOrders, 'function',
    'RED: serializeShopPreOrders не экспортирован (000316)');
  assert.equal(typeof I.restoreShopPreOrders, 'function',
    'RED: restoreShopPreOrders не экспортирован (000316)');
  I.restoreShopPreOrders({});
  I.setShopAheadProvider(null);

  const cur = I.makeCampShop(5, 5, 1, 1, campRec);
  const nxt = I.makeCampShop(5, 5, 2, 1, campRec);
  const curIds = Object.keys(cur.stock);
  const nxtIds = Object.keys(nxt.stock);
  const A = nxtIds.find((id) => !curIds.includes(id));
  const Bth = nxtIds.find((id) => curIds.includes(id));
  assert.ok(A, 'следующий сток содержит хотя бы 1 новый предмет');
  assert.ok(Bth, 'следующий сток пересекается с текущим');
  I.setShopAheadProvider((sh) => (sh && sh.buildingType === 47
  && sh.x === 5 && sh.y === 5)
    ? { key: 'C:5,5',
      stock: JSON.parse(JSON.stringify(nxt.stock)) }
    : null);

  const stockSnap = JSON.parse(JSON.stringify(cur.stock));
  const c = createCharacter('Флогистон');
  c.gold = 1000000;
  const r = I.buyItem(cur, c, A, 1);
  assert.equal(r.ok, true, 'RED: выкуп отсутствующего в текущем ' +
    'стоке предмета из СЛЕДУЮЩЕГО цикла не работает: '
    + JSON.stringify(r));
  assert.equal(r.ahead, true, 'результат помечен ahead');
  assert.equal(typeof r.message, 'string',
    'RED: flash-сообщение выкупа не задано (ui.js маршрутизирует ' +
    'r.message до ветки «Куплено:»)');
  assert.equal(r.price, I.buyPrice(cur, A, c),
    'цена выкупа — существующая buyPrice');
  assert.equal(c.gold, 1000000 - r.price, 'золото списано');
  assert.equal(I.totalQty(c, A), 1, 'предмет — в инвентаре');
  assert.deepEqual(JSON.parse(JSON.stringify(cur.stock)), stockSnap,
    'ТЕКУЩИЙ сток не тронут выкупом: '
    + JSON.stringify(cur.stock));

  const net = I.nextCycleStock(cur);
  assert.equal(net.key, 'C:5,5');
  assert.equal(net.stock[A], (nxt.stock[A] || 0) - 1,
    '«полка» следующего цикла уменьшена на 1');

  for (let i = 1; i < nxt.stock[A]; i++) {
    assert.equal(I.buyItem(cur, c, A, 1).ok, true,
      'i=' + i + ' из ' + nxt.stock[A]);
  }
  const over = I.buyItem(cur, c, A, 1);
  assert.equal(over.ok, false, 'RED: avail исчерпан — повтор ' +
    'должен отказывать (двойной выкуп сверх следующего стока)');
  assert.match(over.reason, /нет в наличии/);
  assert.equal(I.nextCycleStock(cur).stock[A], undefined,
    'в net-стоке следующего цикла A погашен полностью');

  const preBefore = JSON.stringify(I.serializeShopPreOrders());
  const bRes = I.buyItem(cur, c, Bth, 1);
  assert.equal(bRes.ok, true,
    'B (в текущем стоке) — обычная покупка');
  assert.notEqual(bRes.ahead, true, 'B — НЕ ahead');
  assert.equal(JSON.stringify(I.serializeShopPreOrders()), preBefore,
    'B не порождает предзаказ');

  const freshNext = I.makeCampShop(5, 5, 2, 1, campRec);
  assert.deepEqual(JSON.parse(JSON.stringify(freshNext.stock)),
    JSON.parse(JSON.stringify(nxt.stock)),
    'refresh-сток ≡ превью (тот же seed, 0 новых RNG)');
  I.consumeShopAhead('C:5,5', freshNext.stock);
  assert.equal(freshNext.stock[A], 0,
    'RED: после ротации A выкуплен (сток следующего цикла ' +
    '−выкупленное)');
  assert.deepEqual(I.serializeShopPreOrders(), {},
    'RED: consume гасит предзаказ лагеря');
  I.consumeShopAhead('C:5,5', freshNext.stock);
  assert.equal(freshNext.stock[Bth], nxt.stock[Bth],
    'no-op consume не меняет сток');

  I.setShopAheadProvider(null);
  const w = I.makeShop(1, 1, B.APOTHECARY, 1);
  const anyId = Object.keys(w.stock)[0];
  const clone = { x: 1, y: 1, buildingType: B.APOTHECARY,
    wealth: 1, stock: {} };
  const rWorld = I.buyItem(clone, createCharacter('Флогистон'),
    anyId, 1);
  assert.deepEqual(rWorld, { ok: false, reason: 'нет в наличии' },
    'провайдер null: пустой сток — прежний отказ без ветки ' +
    'выкупа');
  I.restoreShopPreOrders({});
});

// ============================================================
// T8. Сейв: секция shopPreOrders — roundtrip/санация + main.js (RED)
// ============================================================

test('T8. сейв: serializeShopPreOrders↔restoreShopPreOrders roundtrip; санация (не-объект/битый ключ/qty не int≥1 → skip; absent → {} без console.error); main.js: секция + restore + провайдер + consume в refresh-ветке', () => {
  assert.equal(typeof I.serializeShopPreOrders, 'function',
    'RED: serializeShopPreOrders не экспортирован (000316)');
  assert.equal(typeof I.restoreShopPreOrders, 'function',
    'RED: restoreShopPreOrders не экспортирован (000316)');
  I.restoreShopPreOrders(
    { 'C:1,2': { bread: 2, minor_healing: 1 } });
  const s1 =
    JSON.parse(JSON.stringify(I.serializeShopPreOrders()));
  assert.deepEqual(s1,
    { 'C:1,2': { bread: 2, minor_healing: 1 } },
    'roundtrip: serialize ≡ восстановленное');
  I.restoreShopPreOrders(s1);
  assert.deepEqual(
    JSON.parse(JSON.stringify(I.serializeShopPreOrders())), s1,
    'второй roundtrip ≡');

  for (const junk of ['junk', 5, null, undefined, [1, 2]]) {
    I.restoreShopPreOrders(junk);
    assert.deepEqual(I.serializeShopPreOrders(), {},
      'санация: ' + JSON.stringify(junk) + ' → пустой сток');
  }
  I.restoreShopPreOrders({
    'zz': { bread: 1 },
    '1,2': { bread: 1 },
    'C:1': { bread: 1 },
    'C:1,2,3': { bread: 1 },
    'C:1,2': { a: 0 },
    'C:-3,4': { b: -1, c: 1.5, d: 'x', good: 2 },
    'C:0,0': { ok: 1 },
  });
  assert.deepEqual(
    JSON.parse(JSON.stringify(I.serializeShopPreOrders())),
    { 'C:-3,4': { good: 2 }, 'C:0,0': { ok: 1 } },
    'RED: санация — только ключ C:x,y и количества int≥1');
  const errs = [];
  const realErr = console.error;
  console.error = (m) => errs.push(String(m));
  try {
    I.restoreShopPreOrders(undefined);
  } finally {
    console.error = realErr;
  }
  assert.deepEqual(errs, [],
    'absent-секция → дефолт {} БЕЗ console.error (паттерн 000298)');
  assert.deepEqual(I.serializeShopPreOrders(), {});

  const srcMain = fs.readFileSync(
    path.join(ROOT, 'src', 'main.js'), 'utf8');
  assert.match(srcMain, /shopPreOrders:\s*G\.serializeShopPreOrders/,
    'RED: main.js collectSaveData — секция shopPreOrders ' +
    'отсутствует');
  assert.match(srcMain, /G\.restoreShopPreOrders\(/,
    'RED: main.js restoreFromSave — restoreShopPreOrders не ' +
    'вызывается');
  assert.match(srcMain, /G\.setShopAheadProvider\(/,
    'RED: main.js — провайдер следующего стока не зарегистрирован');
  const refreshArea = srcMain.slice(
    srcMain.indexOf('function campShopFor'),
    srcMain.indexOf('function campShopFor') + 1800);
  assert.match(refreshArea, /G\.consumeShopAhead\(/,
    'RED: campShopFor refresh-ветка — consumeShopAhead не ' +
    'вызывается');
  I.restoreShopPreOrders({});
});

// ============================================================
// T9. (зелёный пин) 0 новых RNG: сид-формулы и стоки — бит-в-бит;
// срок ротации и сериализация campStocks — не тронуты
// ============================================================

test('T9. 0 новых RNG: makeShop/makeCampShop повтор ≡, сид ≡ формулам (0x154075/CAMP), campStockDueRefresh и serialize/restoreCampStocks — без изменений', () => {
  const pts = [[10, 20, 2, 1], [0, 0, 0, 0], [-5, 9, 3, 1],
    [-34, 48, 2, 0], [7, 9, 11, 1], [123, -7, 0, 3]];
  for (const [x, y, bt, w] of pts) {
    const a = I.makeShop(x, y, bt, w);
    const b = I.makeShop(x, y, bt, w);
    assert.deepEqual(JSON.parse(JSON.stringify(a)),
      JSON.parse(JSON.stringify(b)),
      'makeShop повтор ≡ (' + x + ',' + y + ',' + bt + ',' +
      w + ')');
    assert.equal(a.seed,
      (PL.hash2(x, y, 0x154075) ^ (bt + 1)) >>> 0,
      'сид makeShop ≡ прежней формуле — 0 новых RNG');
  }
  for (const [x, y, day, w] of [[5, 5, 1, 1], [10, 20, 7, 3],
    [-3, -9, 2, 0]]) {
    const a = I.makeCampShop(x, y, day, w, campRec);
    const b = I.makeCampShop(x, y, day, w, campRec);
    assert.deepEqual(JSON.parse(JSON.stringify(a)),
      JSON.parse(JSON.stringify(b)), 'makeCampShop повтор ≡');
    assert.equal(a.seed, (PL.hash2(x, y, 0x43414d50)
      ^ ((day + 1) * 0x9E3779B9)) >>> 0,
      'сид campStock ≡ формуле (день+1) — 0 новых RNG');
  }
  assert.equal(I.campStockDueRefresh(null, 1, 1), true);
  assert.equal(I.campStockDueRefresh({ day: 1 }, 2, 1), true);
  assert.equal(I.campStockDueRefresh({ day: 1 }, 1, 1), false);
  assert.equal(I.campStockDueRefresh({ day: 1 }, 2, 2), false);
  assert.deepEqual(I.serializeCampStocks(
    { '5,5': { day: 1, stock: { bread: 2, zero: 0 } } }),
    { '5,5': { day: 1, stock: { bread: 2, zero: 0 } } });
  const tileAt = (x, y) => ({ x, y, buildingWealth: 1 });
  const initial = I.makeCampShop(5, 5, 1, 1, campRec);
  const rs = I.restoreCampStocks(
    { '5,5': { day: 1 } }, 1, tileAt, campRec);
  assert.equal(rs['5,5'].day, 1);
  assert.deepEqual(rs['5,5'].stock, initial.stock,
    'restore без снимка стока ≡ initial (регресс 000095)');
  assert.equal(rs['5,5'].seed, initial.seed);
});

// ============================================================
// T10. Спека-иглы (RED до правки spec)
// ============================================================

test('T10. спека: items.md — продажа по типу + выкуп следующего обновления + универсам скупает; buildings.md — скупка по типу и ротация лагеря; npc-storage.md — граница NPC-канала (не смешивать)', () => {
  const itemsMd = fs.readFileSync(
    path.join(ROOT, 'spec', 'items.md'), 'utf8');
  const bldMd = fs.readFileSync(
    path.join(ROOT, 'spec', 'buildings.md'), 'utf8');
  const nstorMd = fs.readFileSync(
    path.join(ROOT, 'spec', 'npc-storage.md'), 'utf8');
  const need = (text, label, needle) => assert.ok(
    norm(text).includes(norm(needle)),
    label + ': не найдена фраза «' + needle + '»');
  need(itemsMd, 'items.md', 'продажа по типу');
  need(itemsMd, 'items.md', 'выкуп следующего обновления');
  need(itemsMd, 'items.md',
    'богатства 3 (универсам) скупает все предметы');
  need(itemsMd, 'items.md', '0 новых RNG');
  need(bldMd, 'buildings.md', 'скупка предметов');
  need(bldMd, 'buildings.md', 'выкуп следующего обновления');
  need(nstorMd, 'npc-storage.md', 'не смешивать');
});

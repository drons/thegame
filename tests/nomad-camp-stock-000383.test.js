// Задача 000383: Кочевник ↔ лагерная барахолка (F2 из 000345) —
// ЕДИНЫЙ сток лагерной точки. Диалог кочевника читал каталожный
// канал (npcShopFor/createNpcShop, «респавна нет»), барахолка [I] —
// campStocks (респавн по дню, 000095): витрины одного NPC в одном
// месте расходились.
//
// Фикс (ветвь А, образец 000345 — третья живая ссылка): shopFor на
// тайле лагеря (hasBuilding + buildingId===47) резолвит ЖИВУЮ ССЫЛКУ
// campShopFor(t.x,t.y,t).stock; прочие тайлы — прежний каталожный
// канал. Строки Кочевника = каталог 000018 ∩ полка дня (отсутствие
// согласовано, 000314); цены/скупка — по каталогу (прилавок
// персонален, деградация №2 000345). Респавн-предикат 000095
// (campStockDueRefresh) не тронут — диалог теперь честит «лагерь — по
// дню» (spec/npc-storage.md) так же, как [I].
//
// Фикстуры лагеря — конвенция B24–B29 tests/building-effects.test.js
// (синтетический тайл (40,40), building=-1, buildingId=47, wealth=0;
// сид restore-валидации — buildingWealth из tileAt(40,40)=0).
// Харнес vm-цепочки index.html — 1:1 tests/shop-tab-sync-000345.test.js.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { SAVE_KEY } = require('../src/save.js');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
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

function textOf(n) {
  let s = String(n.textContent || '');
  for (const ch of n.children || []) s += textOf(ch);
  return s;
}

function makeStorage(seed) {
  const m = new Map();
  if (seed != null) m.set(SAVE_KEY, JSON.stringify(seed));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => m.delete(k),
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
  for (const f of CHAIN) {
    vm.runInContext(
      fs.readFileSync(path.join(ROOT, 'src', f), 'utf8'), sandbox,
      { filename: f });
  }
  return { sandbox, winListeners, raf, warns, errors, storage, body, hud };
}

const drain = () => new Promise((r) => setImmediate(r));

async function boot(seed) {
  const h = bootSandbox(seed);
  await drain();
  await drain();
  await drain();
  return h;
}

function readSave(h) {
  const text = h.storage.getItem(SAVE_KEY);
  assert.ok(text != null, 'сейв записан в мок-хранилище');
  return JSON.parse(text);
}

function fireBeforeUnload(h) {
  const fns = h.winListeners['beforeunload'];
  assert.ok(fns && fns.length, 'слушатель beforeunload зарегистрирован');
  for (const fn of fns) fn({});
}

// --- Фикстуры лагеря (конвенция B24–B29 building-effects) ---

const CAMP = { x: 40, y: 40, key: '40,40' };

function campTile() {
  return { x: CAMP.x, y: CAMP.y, hasBuilding: true,
    building: -1, buildingId: 47, buildingWealth: 0 };
}

function campRecord(G) {
  const b = G.getBuilding(47);
  assert.ok(b, 'каталог: запись 47 «Лагерь»');
  return b;
}

function campNpc(G) {
  const npc = G.npcForBuilding(G.NpcData.NPCS, 47);
  assert.ok(npc && npc.торговля, 'каталог: Кочевник торгует');
  return npc;
}

const DIALOG = { id: 'dialog', имя: 'Диалог', доступен: true };
const CAMP_MARKET = { id: 'market', имя: 'Барахолка', доступен: true };

function findNpcOverlay(h) {
  return findAll(h.body, '.combat-overlay')
    .find((o) => String(o.className).includes('npc-overlay')) || null;
}

function dialogClickOpt(ov, optid) {
  const opt = findAll(ov, 'button[data-npcact="opt"]')
    .find((btn) => btn.dataset.optid === optid);
  assert.ok(opt, 'опция «' + optid + '» в диалоге: ' + textOf(ov));
  ov.listeners.click[0]({ target: opt });
}

function openTrade(h, G, t, rec, npc) {
  G.buildingActions.onBuildingAction(DIALOG, t, rec, npc);
  const ov = findNpcOverlay(h);
  assert.ok(ov, 'диалог на тайле ' + t.x + ',' + t.y + ' открыт');
  dialogClickOpt(ov, 'trade');
  return ov;
}

function dialogBuyOnce(ov, itemId) {
  const btn = findAll(ov, 'button[data-npcact="buy"]')
    .find((b) => b.dataset.item === itemId);
  if (!btn) return false;
  ov.listeners.click[0]({ target: btn });
  return true;
}

function dialogSellOnce(ov, itemId) {
  const btn = findAll(ov, 'button[data-npcact="sell"]')
    .find((b) => b.dataset.item === itemId && !b.disabled);
  if (!btn) return false;
  ov.listeners.click[0]({ target: btn });
  return true;
}

function dialogStock(ov) {
  const m = new Map();
  for (const btn of findAll(ov, 'button[data-npcact="buy"]')) {
    const mm = /\(ост\. (\d+)\)/.exec(textOf(btn.parent || ov));
    if (mm) m.set(btn.dataset.item, Number(mm[1]));
  }
  return m;
}

function openMarket(h, G, t, rec, npc) {
  G.buildingActions.onBuildingAction(CAMP_MARKET, t, rec, npc);
  const panel = findAll(h.body, '.char-panel')[0];
  assert.ok(panel, 'вкладка «Магазин» [I] (барахолка) открыта');
  return panel;
}

function panelStock(panel) {
  const scope = panel._shopBody || panel;
  const m = new Map();
  for (const btn of findAll(scope, 'button[data-act="buy"]')) {
    const mm = / ×(\d+)/.exec(textOf(btn.parent || scope));
    if (mm) m.set(btn.dataset.item, Number(mm[1]));
  }
  return m;
}

function panelBuyOnce(panel, itemId) {
  const scope = panel._shopBody || panel;
  const btn = findAll(scope, '.cp-btn')
    .find((b) => b.dataset.act === 'buy' && b.dataset.item === itemId);
  if (!btn) return false;
  panel.listeners.click[0]({ target: btn });
  return true;
}

// Полка дня лагерной точки (ЧИСТО, без сайд-эффектов кэша main.js).
function campShelf(G, day) {
  return G.makeCampShop(CAMP.x, CAMP.y, day, 0, campRecord(G)).stock;
}

// id каталога Кочевника, присутствующие на полке с qty ≥ 1.
function catalogIn(npc, shelf) {
  return npc.торговля.предметы
    .map((p) => p.предмет)
    .filter((id) => (shelf[id] || 0) >= 1);
}

// --- Тесты ---

test('000383-N1. витрина диалога Кочевника = каталог ∩ полка дня campStocks; «ост.» ≡ остатки барахолки; чертеж вне видов лагеря — строки нет', async () => {
  const h = await boot();
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет: ' + h.errors.join('; '));
  const npc = campNpc(G);
  const rec = campRecord(G);
  const shelf = campShelf(G, 1);
  const expected = catalogIn(npc, shelf);
  assert.ok(expected.length >= 2,
    'полка дня 1 (40,40) пересекает каталог минимум на 2 товара: '
    + JSON.stringify(shelf));
  const ov = openTrade(h, G, campTile(), rec, npc);
  const dRows = dialogStock(ov);
  assert.equal(dRows.size, expected.length,
    'диалог: строк = пересечение каталога с полкой дня (полка '
    + JSON.stringify(expected) + ', диалог '
    + JSON.stringify([...dRows.keys()])
    + '; красный корня: 6 статических каталожных строк)');
  for (const id of expected) {
    assert.equal(dRows.get(id), shelf[id],
      'диалог: «ост. » для «' + id + '» = полка дня ' + shelf[id]
      + ' (красный корня: каталожное количество)');
  }
  assert.ok(!dRows.has('blueprint_woodwork'),
    'blueprint_woodwork ∉ виды лагеря [food,potion,weapon,armor] ⇒ '
    + 'строки нет (полка ≠ каталог; красным корня: каталожная строка '
    + 'с «ост. 1»)');
  const bpRow = findAll(ov, '.cp-itemrow')
    .some((r) => textOf(r).includes('чертёж')
      || textOf(r).includes('Чертёж'));
  assert.ok(!bpRow, 'в колонке «Магазин» нет строки чертежа');
  G.npcUI.close();
});

test('000383-N2. покупка в диалоге Кочевника списывает campStocks ТАЙЛА (живая ссылка), а не npcStocks; барахолка [I] показывает остаток', async () => {
  const h = await boot();
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет: ' + h.errors.join('; '));
  const npc = campNpc(G);
  const rec = campRecord(G);
  const shelf = campShelf(G, 1);
  const rich = catalogIn(npc, shelf).filter((id) => shelf[id] >= 2);
  const X = rich[0];
  assert.ok(X, 'на полке дня 1 есть каталожный товар с qty ≥ 2: '
    + JSON.stringify(shelf));
  const before = shelf[X];
  const ov = openTrade(h, G, campTile(), rec, npc);
  assert.ok(dialogBuyOnce(ov, X), 'строка «' + X + '» в диалоге есть');
  G.npcUI.close();
  const e = g.campStocks[CAMP.key];
  assert.ok(e, 'диалог на лагерном тайле создал/использовал запись '
    + 'СТОКА ТОЧКИ campStocks[«40,40»] (красный корня: списание шло '
    + 'в npcStocks[camp_wanderer@W:40,40], барахолка не тронута); '
    + 'ключи: ' + Object.keys(g.campStocks).join(' | '));
  assert.equal(e.stock[X], before - 1,
    'сток точки списан на 1 (было ' + before + ')');
  const npcKey = 'camp_wanderer@W:' + CAMP.key;
  assert.ok(!(npcKey in g.npcStocks),
    'для лагерного тайла запись npcStocks НЕ создаётся; ключи: '
    + Object.keys(g.npcStocks).join(' | '));
  const panel = openMarket(h, G, campTile(), rec, npc);
  const pRows = panelStock(panel);
  assert.equal(pRows.get(X), before - 1,
    '[I] следом: «×' + (before - 1) + '» для «' + X + '» (красный '
    + 'корня: барахолка показывала прежнюю полку)');
});

test('000383-N3. выкуп позиции на [I] убирает строку Кочевника из диалога (000314 «нет строки при qty<1»), остальные — по полке', async () => {
  const h = await boot();
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет: ' + h.errors.join('; '));
  const npc = campNpc(G);
  const rec = campRecord(G);
  const shelf = campShelf(G, 1);
  const cheap = catalogIn(npc, shelf)
    .sort((a, b) => shelf[a] - shelf[b] || (a < b ? -1 : 1))[0];
  assert.ok(cheap, 'на полке дня 1 есть каталожный товар');
  const init = shelf[cheap];
  const panel = openMarket(h, G, campTile(), rec, npc);
  let clicks = 0;
  for (let i = 0; i < init + 1; i++) {
    if (!panelBuyOnce(panel, cheap)) break;
    clicks++;
    const still = g.campStocks[CAMP.key].stock[cheap];
    if (still <= 0) break;
  }
  assert.equal(g.campStocks[CAMP.key].stock[cheap], 0,
    '«' + cheap + '» выкуплен на [I] (' + init + ' шт., кликов '
    + clicks + ' — остальное, вероятно, кончилось золото героя: '
    + g.state.hero.gold + ')');
  const ov = openTrade(h, G, campTile(), rec, npc);
  const dRows = dialogStock(ov);
  assert.ok(!dRows.has(cheap),
    'диалог: строка выкупленного «' + cheap + '» исчезла (красный '
    + 'корня: каталожный канал независим — строка с прежним '
    + 'остатком); лог: ' + textOf(ov).slice(-160));
  assert.ok(!dialogBuyOnce(ov, cheap),
    'кнопки «купить» для «' + cheap + '» нет');
  const still = catalogIn(npc, g.campStocks[CAMP.key].stock)[0];
  if (still) {
    assert.equal(dRows.get(still),
      g.campStocks[CAMP.key].stock[still],
      'остальные товары Кочевника — по полке точки');
  }
  G.npcUI.close();
});

test('000383-N4. сейв-roundtrip: покупка в диалоге персистится через campStocks; npcStocks-ключ лагерного тайла не пишется; перезагрузка держит остаток в обоих экранах', async () => {
  const h = await boot();
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет: ' + h.errors.join('; '));
  const npc = campNpc(G);
  const rec = campRecord(G);
  const shelf = campShelf(G, 1);
  const rich = catalogIn(npc, shelf).filter((id) => shelf[id] >= 2);
  const X = rich[0];
  assert.ok(X, 'на полке дня 1 есть каталожный товар с qty ≥ 2');
  const before = shelf[X];
  const ov = openTrade(h, G, campTile(), rec, npc);
  assert.ok(dialogBuyOnce(ov, X), 'покупка 1 в диалоге');
  G.npcUI.close();
  fireBeforeUnload(h);
  const sv = readSave(h);
  assert.ok(sv.data.campStocks && sv.data.campStocks[CAMP.key],
    'сейв: запись точки в разделе campStocks; разделы: '
    + Object.keys(sv.data).join(' | '));
  assert.equal(sv.data.campStocks[CAMP.key].stock[X], before - 1,
    'сейв: остаток «' + X + '» = ' + (before - 1));
  const npcKey = 'camp_wanderer@W:' + CAMP.key;
  assert.ok(!(sv.data.npcStocks && (npcKey in sv.data.npcStocks)),
    'сейв: для лагерного тайла npcStocks-ключ не пишется; ключи: '
    + Object.keys(sv.data.npcStocks || {}).join(' | '));
  const h2 = await boot(seedSave(sv.data));
  const g2 = h2.sandbox.__game;
  assert.equal(h2.errors.length, 0,
    'перезагрузка без ошибок: ' + h2.errors.join('; '));
  assert.ok(g2.campStocks[CAMP.key],
    'roundtrip: запись точки восстановлена');
  assert.equal(g2.campStocks[CAMP.key].stock[X], before - 1,
    'roundtrip: остаток точки = ' + (before - 1));
  const ov2 = openTrade(h2, h2.sandbox.Game, campTile(), rec, npc);
  assert.equal(dialogStock(ov2).get(X), before - 1,
    'после перезагрузки диалог держит восстановленный остаток');
  h2.sandbox.Game.npcUI.close();
  const panel2 = openMarket(h2, h2.sandbox.Game, campTile(), rec, npc);
  assert.equal(panelStock(panel2).get(X), before - 1,
    'после перезагрузки [I] держит тот же остаток');
});

test('000383-N5. ротация по дню (000095) едина для диалога и [I]: сейв дня 2 с ЗАПИСЬЮ дня 1 — ленивый refresh по campStockDueRefresh, витрина Кочевника = полка дня 2, entry.day = 2', async () => {
  // Сейв несёт stale-запись дня 1 ⇒ диалог обязан пройти предикат
  // ротации (respawn_days=1), а не только первую генерацию полки.
  const h = await boot(seedSave({
    day: 2,
    campStocks: { [CAMP.key]: { day: 1, stock: {} } },
  }));
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет: ' + h.errors.join('; '));
  const npc = campNpc(G);
  const rec = campRecord(G);
  const shelf1 = campShelf(G, 1);
  const shelf2 = campShelf(G, 2);
  const in1 = catalogIn(npc, shelf1);
  const in2 = catalogIn(npc, shelf2);
  const changed = JSON.stringify(in1.map((id) => [id, shelf1[id]]))
    !== JSON.stringify(in2.map((id) => [id, shelf2[id]]));
  assert.ok(changed,
    'полки дня 1 и 2 для (40,40) РАЗНЫ (иначе ротация не проверяется): '
    + JSON.stringify(in1) + ' vs ' + JSON.stringify(in2));
  const ov = openTrade(h, G, campTile(), rec, npc);
  const dRows = dialogStock(ov);
  G.npcUI.close();
  assert.equal(dRows.size, in2.length,
    'диалог на 2-й день: строки = каталог ∩ полка ДНЯ 2 '
    + '(красный корня: каталожная витрина не ротируется по дням)');
  for (const id of in2) {
    assert.equal(dRows.get(id), shelf2[id],
      'диалог: «ост. » для «' + id + '» = полка дня 2 ' + shelf2[id]);
  }
  const panel = openMarket(h, G, campTile(), rec, npc);
  const pRows = panelStock(panel);
  for (const id of in2) {
    assert.equal(pRows.get(id), shelf2[id],
      '[I]: «×' + shelf2[id] + '» для «' + id + '» — та же полка');
  }
  assert.equal(g.campStocks[CAMP.key].day, 2,
    'campStocks: запись дня 2 (ленивый refresh сработал и для '
    + 'диалога)');
});

test('000383-N6. регрессии каналов: Жрец — каталожный канал (npcStocks, campStocks чист), Мила — worldShops (000345), продажа Кочевнику полку не пополняет (BUY-ONLY 000095)', async () => {
  const h = await boot();
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет: ' + h.errors.join('; '));
  // (а) не-лагерь, не-магазин: каталожный канал без изменений.
  const priest = G.npcById(G.NpcData.NPCS, 'sun_priest');
  assert.ok(priest && priest.торговля, 'Жрец Солнца торгует');
  const map = G.createMap(G.generateSeedPixels());
  let templeTile = null;
  for (let y = -200; y <= 200 && !templeTile; y++) {
    for (let x = -200; x <= 200 && !templeTile; x++) {
      const t = map.tileAt(x, y);
      if (t.hasBuilding && t.building === 8) templeTile = t;
    }
  }
  assert.ok(templeTile, 'скан: храм солнца найден');
  const ovP = openTrade(h, G, templeTile, G.getBuilding(36), priest);
  const firstBuy = findAll(ovP, 'button[data-npcact="buy"]')[0];
  assert.ok(firstBuy, 'витрина Жреца непуста');
  ovP.listeners.click[0]({ target: firstBuy });
  G.npcUI.close();
  const priestKey = 'sun_priest@W:' + templeTile.x + ',' + templeTile.y;
  assert.ok(priestKey in g.npcStocks,
    'Жрец: npcStocks-ключ создан (каталожный канал жив)');
  assert.ok(!(templeTile.x + ',' + templeTile.y in g.campStocks),
    'Жрец: campStocks не тронут');
  // (б) магазинный тайл мира — канал worldShops 000345 цел.
  const apothecary = G.npcById(G.NpcData.NPCS, 'apothecary');
  let shopTile = null;
  for (let y = -200; y <= 200 && !shopTile; y++) {
    for (let x = -200; x <= 200 && !shopTile; x++) {
      const t = map.tileAt(x, y);
      if (t.hasBuilding && t.building === 2) shopTile = t;
    }
  }
  assert.ok(shopTile, 'скан: аптечный тайл найден');
  const ovA = openTrade(h, G, shopTile, G.getBuilding(3), apothecary);
  const rowsA = dialogStock(ovA);
  G.npcUI.close();
  assert.ok(rowsA.size >= 1, 'Мила на магазинном тайле: строки есть');
  assert.ok(shopTile.x + ',' + shopTile.y in g.worldShops,
    'Мила: запись worldShops создана (000345 не сломан)');
  assert.ok(!(apothecary.id + '@W:' + shopTile.x + ',' + shopTile.y
    in g.npcStocks),
    'Мила: npcStocks-ключ для магазинного тайла не создаётся');
  // (в) Кочевник: покупка + продажа — полка BUY-ONLY (sell не
  // пополняет сток точки).
  const npc = campNpc(G);
  const rec = campRecord(G);
  const shelf = campShelf(G, 1);
  const X = catalogIn(npc, shelf).find((id) => shelf[id] >= 2);
  assert.ok(X, 'полка дня 1 пересекает каталог товаром с qty ≥ 2');
  const ov = openTrade(h, G, campTile(), rec, npc);
  const shown0 = dialogStock(ov).get(X);
  assert.ok(dialogBuyOnce(ov, X), 'покупка «' + X + '» у Кочевника');
  G.npcUI.close();
  const ov2 = openTrade(h, G, campTile(), rec, npc);
  const shownBuy = dialogStock(ov2).get(X);
  assert.equal(shownBuy, shown0 - 1, 'покупка списала 1 (витрина)');
  assert.ok(dialogSellOnce(ov2, X),
    'кнопка «продать» «' + X + '» активна (есть в инвентаре)');
  G.npcUI.close();
  const ov3 = openTrade(h, G, campTile(), rec, npc);
  assert.equal(dialogStock(ov3).get(X), shownBuy,
    'продажа Кочевнику сток НЕ пополняет (BUY-ONLY 000095): '
    + 'витрина осталась «ост. ' + shownBuy + '»');
  G.npcUI.close();
});

test('000383-N7. статика shopFor: лагерная ветвь — РОВНО одна живая ссылка cs.stock, порядок город→мир→лагерь→каталог, формы гардов 000345 не тронуты', () => {
  const mainSrc = fs.readFileSync(path.join(ROOT, 'src', 'main.js'), 'utf8');
  const cityIdx = mainSrc.indexOf('ds.kind === \'city\' && ds.cityShops && t');
  const unifyIdx = mainSrc.indexOf('!ds && t && t.hasBuilding');
  const campIdx = mainSrc.indexOf('t.buildingId === CAMP_ID && npc');
  assert.ok(cityIdx >= 0, 'городская ветвь (000107/000108) — на месте');
  assert.ok(unifyIdx >= 0, 'мирская унификация (000345) — на месте');
  assert.ok(campIdx >= 0,
    'лагерная ветвь (000383) — на месте: «t.buildingId === CAMP_ID '
    + '&& npc»');
  assert.ok(cityIdx < unifyIdx && unifyIdx < campIdx,
    'порядок разрешения город → мир → ЛАГЕРЬ (после мирской, перед '
    + 'каталожным фолбэком)');
  assert.match(mainSrc,
    /!ds && t && t\.hasBuilding && t\.buildingId === CAMP_ID && npc\s*&& npc\.торговля && Array\.isArray\(npc\.торговля\.предметы\)/,
    'гард лагерной ветви полон: вне подземелья, тайл входа лагеря, '
    + 'торговец с каталогом');
  assert.match(mainSrc, /const cs = campShopFor\(t\.x, t\.y, t\);/,
    'лагерная ветвь зовёт ТОТ ЖЕ решатель campShopFor(t.x, t.y, t) '
    + '([I]/сейв/диалог — один refresh)');
  assert.equal(
    (mainSrc.match(/return \{ npc, stock: cs\.stock \};/g) || []).length, 1,
    'лагерная живая ссылка — РОВНО одна (не копия, не дубль)');
  assert.match(mainSrc, /return \{ npc, stock: s\.stock \};/,
    'город — ЖИВАЯ ссылка cityShops (000108 без изменений)');
  assert.match(mainSrc, /const ws = worldShopFor\(t\.x, t\.y, t\);\s*\n\s*if \(ws\) return \{ npc, stock: ws\.stock \};/,
    'мир — ЖИВАЯ ссылка на сток точки (000345 без изменений)');
  assert.match(mainSrc,
    /!ds && t && t\.hasBuilding && npc && npc\.торговля\s*&& Array\.isArray\(npc\.торговля\.предметы\)\s*&& G\.shopKindsFor\(t\.building\)/,
    'форма мирского гарда 000345 НЕ менялась (S5-иглы живы)');
  assert.equal((mainSrc.match(/return \{ npc, stock: ws\.stock \};/g) || [])
    .length, 1, 'мирская живая ссылка — по-прежнему РОВНО одна');
  assert.equal(
    (mainSrc.match(/return npc \? npcShopFor\(npc\.id, t\) : null;/g) || [])
      .length, 2,
    'каталожный фолбэк цел (000134 + конец shopFor) — fail-open '
    + 'лагерной ветви (cs null ⇒ прежний канал)');
});

test('000383-N8. стражи 0-diff смежных контрактов: сиды/формула ротации campStock (000095), provider camp-only (000316), ключи @W (000319), «ост.»/npcBuy/createNpcShop', () => {
  const items = fs.readFileSync(path.join(ROOT, 'src', 'items.js'), 'utf8');
  assert.match(items, /hash2\(x, y, CAMP_STOCK_SEED\)/,
    'сид лагеря — без изменений (000095)');
  assert.match(items, /hash2\(x, y, 0x154075\)/,
    'сид makeShop — без изменений (0 новых RNG; голдены не двигаются)');
  assert.match(items,
    /return \(day - entry\.day\) >= respawnDays;/,
    'campStockDueRefresh — предикат ротации 000095 не тронут '
    + '(диалог использует его через campShopFor)');
  assert.match(items,
    /stock\[it\.id\] = 1 \+ Math\.floor\(rng\(\) \* \(2 \+ wealth\)\);/,
    'формула количества полки лагеря — 000095 без изменений');
  const mainSrc = fs.readFileSync(path.join(ROOT, 'src', 'main.js'), 'utf8');
  assert.match(mainSrc, /shop\.buildingType !== CAMP_ID/,
    'провайдер выкупа — camp-only (000316)');
  assert.match(mainSrc, /return npcId \+ '@W:' \+ t\.x \+ ',' \+ t\.y;/,
    'формат ключа каталожного канала «id@W:x,y» не изменился');
  const uiSrc = fs.readFileSync(path.join(ROOT, 'src', 'ui.js'), 'utf8');
  assert.match(uiSrc, /\(ост\. /,
    'ui.js: формат строки «(ост. N)» вкладки торговли не менялся');
  assert.match(uiSrc, /npcShop = o\.shop \|\| null;/,
    'ui.js: диалог переиспользует ПЕРЕДАННЫЙ сток (третья живая '
    + 'ссылка проходит без правки ui.js)');
  const npcSrc = fs.readFileSync(path.join(ROOT, 'src', 'npc.js'), 'utf8');
  assert.match(npcSrc, /function createNpcShop\(npc\) \{/,
    'createNpcShop — 0 правок (каталожный канал жив)');
  assert.match(npcSrc, /function npcBuy\(shop, character, itemId, qty = 1, priceChar = character\) \{/,
    'npcBuy — 0 правок (прилавок персонален: требует tradeEntry)');
  assert.match(npcSrc, /function npcSell\(shop, character, itemId, qty = 1, priceChar = character\) \{/,
    'npcSell — 0 правок (сток не пополняет — BUY-ONLY 000095)');
});

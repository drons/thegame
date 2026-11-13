// Задача 000345: список товаров торговли различается внутри постройки
// (диалог NPC, вкладка «торговля») и на вкладке «Магазин» панели [I].
//
// Корень (верифицировано на базе): два экрана одного тайла-постройки
// читали РАЗНЫЕ каналы стока:
//   * [I] «Магазин» — hud → worldShopFor → makeShop (rng-ассортимент
//     точки, персист worldShops, 000319);
//   * диалог — main.shopFor → npcShopFor → createNpcShop: ПРЯМОЕ
//     статическое чтение блока «торговля» каталога NPC, отдельный
//     канал npcStocks['id@W:x,y'] (000319).
// Ожидание (ТЗ + SPEC spec/npc-storage.md: «сток принадлежит точке
// мира»): один ассортимент и одни остатки в оба момента.
//
// Фикс (A1 — прецедент города 000107 один-в-один): мирский диалог НА
// ТАЙЛЕ-МАГАЗИНЕ (hasBuilding + shopKindsFor) резолвит ЖИВУЮ ССЫЛКУ на
// сток точки worldShopFor; прочие тайлы — прежний каталожный канал
// (Лавка/Кузница/Дома NPC/барахолка — контракт 000319 «респавна нет»
// сохранён). Строки торговца = каталог ∩ сток точки (согласованное
// отсутствие, 000314 «нет строки при qty<1»); полка [I] шире прилавка
// — by design (мультиперсонажность точек: Оружейная = Бренн/Корд/Дарн).
//
// Харнес — 1:1 tests/shop-point-stock-000319.test.js (vm-цепочка
// index.html + DOM/WebGL-стабы + мок localStorage; диалог через
// onBuildingAction('dialog', tile, rec, npc); [I] — setShop+toggle).
// Тайлы и предметы — ДИНАМИЧЕСКИЙ скан детерминированного мира
// (устойчивость к составу карты/каталога и к идущим items-волнам).

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

// --- WebGL-стаб (main.js: compile/link/буферы; как main-visuals) ---

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

// --- «Снисходительный» DOM-элемент (прецедент building-effects) ---

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

// --- localStorage-мок: seed — досеянная оболочка сейва (v1) ---

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

// --- Песочница: вся цепочка index.html ---

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

const cl = (o) => JSON.parse(JSON.stringify(o));

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

// --- Общие хелперы задачи ---

// Все тайлы-ВХОДЫ «картового» магазина вида kind детерминированного
// мира (скан — по тому же генератору, что main.js; прецедент
// findTwoShopTiles 000319).
function tilesOfKind(G, kind) {
  const map = G.createMap(G.generateSeedPixels());
  const out = [];
  for (let y = -200; y <= 200; y++) {
    for (let x = -200; x <= 200; x++) {
      const t = map.tileAt(x, y);
      if (t.hasBuilding && t.building === kind) out.push(t);
    }
  }
  return out;
}

function shopStock(G, t) {
  return G.makeShop(t.x, t.y, t.building, t.buildingWealth);
}

// Каталог торговца — предметы, присутствующие в стоке точки с qty ≥
// minQty (детерминированный отбор устойчив к сдвигам rng-хвоста).
function catalogIn(G, npc, t, minQty) {
  const golden = shopStock(G, t);
  const ids = [];
  for (const p of npc.торговля.предметы) {
    if (!G.getItem(p.предмет)) continue;
    if ((golden.stock[p.предмет] || 0) >= (minQty || 1)) ids.push(p.предмет);
  }
  return { golden, ids };
}

// Первый тайл вида kind с неотсутствующей выборкой pred(golden, ids).
function pickTile(G, kind, npc, pred) {
  for (const t of tilesOfKind(G, kind)) {
    const { golden, ids } = catalogIn(G, npc, t, 1);
    const r = pred(golden, ids, t);
    if (r) return { t, golden, ids, picked: r };
  }
  return null;
}

function cheapest(G, npc, ids, stock) {
  const c = G.createCharacter();
  let best = null;
  let bestPrice = Infinity;
  for (const id of ids) {
    const price = G.npcBuyPrice({ npc, stock }, id, c);
    if (price == null) continue;
    if (price < bestPrice || (price === bestPrice && id < best)) {
      best = id; bestPrice = price;
    }
  }
  return best;
}

const DIALOG = { id: 'dialog', имя: 'Диалог', доступен: true };

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

// { itemId → «ост. N» } вкладки «торговля» диалога.
function dialogStock(ov) {
  const m = new Map();
  for (const btn of findAll(ov, 'button[data-npcact="buy"]')) {
    const mm = /\(ост\. (\d+)\)/.exec(textOf(btn.parent || ov));
    if (mm) m.set(btn.dataset.item, Number(mm[1]));
  }
  return m;
}

function panelOpen(G, h, wrap) {
  G.playerUI.setShop(wrap);
  G.playerUI.toggle(true, 'shop');
  const panel = findAll(h.body, '.char-panel')[0];
  assert.ok(panel, 'панель персонажа открыта вкладкой «Магазин»');
  return panel;
}

// { itemId → «×N» } вкладки «Магазин» панели [I] (секция магазина).
function panelStock(h, panel) {
  const scope = panel._shopBody || panel;
  const m = new Map();
  for (const btn of findAll(scope, 'button[data-act="buy"]')) {
    const mm = / ×(\d+)/.exec(textOf(btn.parent || scope));
    if (mm) m.set(btn.dataset.item, Number(mm[1]));
  }
  return m;
}

function panelBuyOut(G, h, wrap, itemId, maxClicks) {
  const panel = panelOpen(G, h, wrap);
  let clicks = 0;
  for (let i = 0; i < maxClicks; i++) {
    const btn = findAll(panel._shopBody || panel, '.cp-btn')
      .find((b) => b.dataset.act === 'buy' && b.dataset.item === itemId);
    if (!btn) break;
    panel.listeners.click[0]({ target: btn });
    clicks++;
  }
  return clicks;
}

// --- Тесты ---

test('000345-S1. диалог и вкладка «Магазин» [I] на одном магазине-тайле: одни остатки по всем товарам торговца, отсутствие согласовано', async () => {
  const h = await boot();
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет: ' + h.errors.join('; '));
  const npc = G.npcById(G.NpcData.NPCS, 'apothecary');
  assert.ok(npc && npc.торговля, 'каталог: Мила-аптекарь торгует');
  const rec = G.getBuilding(3);
  // Тайл, где каталожные количества ОТЛИЧАЮМЫ от стока точки (иначе
  // тест вырождается): хотя бы один товар торговца вне полки точки.
  const sel = pickTile(G, 2, npc, (golden, ids) => {
    const outside = npc.торговля.предметы
      .some((p) => G.getItem(p.предмет) && !((golden.stock[p.предмет] || 0) >= 1));
    return ids.length >= 1 && outside ? ids[0] : null;
  });
  assert.ok(sel, 'скан: найден аптекарский тайл с пересечением каталога и полки');
  const { t, golden } = sel;
  const ov = openTrade(h, G, t, rec, npc);
  const dRows = dialogStock(ov);
  G.npcUI.close();
  const panel = panelOpen(G, h, g.worldShopFor(t.x, t.y, t));
  const pRows = panelStock(h, panel);
  G.playerUI.toggle(false);
  // Красный корня ДО фикса: dRows = каталог целиком (созданный при
  // первом диалоге npcStocks), pRows = rng-полка точки → наборы и
  // количества расходятся.
  for (const p of npc.торговля.предметы) {
    if (!G.getItem(p.предмет)) continue;
    const q = golden.stock[p.предмет] || 0;
    assert.equal(dRows.has(p.предмет), q >= 1,
      'диалог: строка «' + p.предмет + '» видна ⟺ сток точки ≥ 1 '
      + '(полка ' + q + ', диалог ' + (dRows.get(p.предмет)) + ')');
    if (q >= 1) {
      assert.equal(dRows.get(p.предмет), q,
        'диалог: «ост. » для «' + p.предмет + '» = сток точки ' + q
        + ' (красный корня: каталожное ' + (p.количество || 1) + ')');
    }
    assert.equal(pRows.has(p.предмет), q >= 1,
      '[I]: строка «' + p.предмет + '» = полка точки');
    if (q >= 1) {
      assert.equal(pRows.get(p.предмет), q,
        '[I]: ×N для «' + p.предмет + '» = ' + q);
    }
  }
});

test('000345-S2. покупка в диалоге магазина мира списывает сток ТОЧКИ (worldShops), не npcStocks; [I] показывает новый остаток', async () => {
  const h = await boot();
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет: ' + h.errors.join('; '));
  const npc = G.npcById(G.NpcData.NPCS, 'apothecary');
  const rec = G.getBuilding(3);
  const sel = pickTile(G, 2, npc, (golden, ids) =>
    (ids.length >= 1 ? ids : null));
  assert.ok(sel, 'скан: найден аптекарский тайл с пересечением');
  const { t, golden, ids } = sel;
  const key = t.x + ',' + t.y;
  const rich = ids.filter((id) => golden.stock[id] >= 2);
  assert.ok(rich.length >= 1, 'есть товар торговца с остатком ≥ 2');
  const X = cheapest(G, npc, rich, golden.stock);
  assert.ok(X, 'есть предмет для покупки');
  const before = golden.stock[X];
  const ov = openTrade(h, G, t, rec, npc);
  assert.ok(dialogBuyOnce(ov, X), 'строка «' + X + '» в диалоге есть');
  G.npcUI.close();
  const e = g.worldShops[key];
  assert.ok(e, 'диалог на магазине-тайле создал/использовал запись '
    + 'стока ТОЧКИ worldShops[«x,y»] (красный корня: списание шло в '
    + 'npcStocks[id@W:x,y], точка не тронута); ключи: '
    + Object.keys(g.worldShops).join(' | '));
  assert.equal(e.stock[X], before - 1,
    'сток точки списан на 1 (было ' + before + ')');
  const npcKey = 'apothecary@W:' + key;
  assert.ok(!(npcKey in g.npcStocks),
    'для магазинного тайла запись npcStocks НЕ создаётся; ключи: '
    + Object.keys(g.npcStocks).join(' | '));
  const panel = panelOpen(G, h, g.worldShopFor(t.x, t.y, t));
  const pRows = panelStock(h, panel);
  assert.equal(pRows.get(X), before - 1,
    '[I] следом: «×' + (before - 1) + '» для «' + X + '»');
  G.playerUI.toggle(false);
});

test('000345-S3. выкуп на [I] до нуля убирает строку торговца из диалога (000314 «нет строки при qty<1»), продажа NPC сток не меняет', async () => {
  const h = await boot();
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет: ' + h.errors.join('; '));
  const npc = G.npcById(G.NpcData.NPCS, 'apothecary');
  const rec = G.getBuilding(3);
  const sel = pickTile(G, 2, npc, (golden, ids) =>
    (ids.length >= 1 ? ids : null));
  assert.ok(sel, 'скан: найден аптекарский тайл с пересечением');
  const { t, golden, ids } = sel;
  const key = t.x + ',' + t.y;
  const X = cheapest(G, npc, ids, golden.stock);
  const init = golden.stock[X];
  const w = g.worldShopFor(t.x, t.y, t);
  assert.equal(panelBuyOut(G, h, w, X, init + 1), init,
    'выкуп «' + X + '» на [I] до нуля (' + init + ' шт.)');
  G.playerUI.toggle(false);
  assert.equal(g.worldShops[key].stock[X], 0, 'полка точки пуста');
  const ov = openTrade(h, G, t, rec, npc);
  const dRows = dialogStock(ov);
  assert.ok(!dRows.has(X),
    'диалог: строка выкупленного «' + X + '» исчезла (красный корня: '
    + 'npcStocks независим — строка с прежним остатком); лог: '
    + textOf(ov).slice(-160));
  assert.ok(!dialogBuyOnce(ov, X), 'кнопки «купить» для «' + X + '» нет');
  const still = ids.find((id) => id !== X && g.worldShops[key].stock[id] >= 1);
  if (still) {
    assert.equal(dRows.get(still), g.worldShops[key].stock[still],
      'остальные товары торговца — по стоку точки');
  }
  G.npcUI.close();
});

test('000345-S4. guard: НЕ-магазинный тайл — прежний каталожный канал (npcStocks по точке+npcId, раздельные точки, респавна нет)', async () => {
  const h = await boot();
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет: ' + h.errors.join('; '));
  const npc = G.npcById(G.NpcData.NPCS, 'sun_priest');
  assert.ok(npc && npc.торговля, 'жрец храма торгует (каталожный канал)');
  assert.equal(G.shopKindsFor(8), null,
    'Храм солнца (map_index 8) — НЕ «картовый» магазин (нет «виды»)');
  const rec = G.getBuilding(36);
  const tiles = tilesOfKind(G, 8);
  assert.ok(tiles.length >= 2, 'в мире есть ≥2 храма солнца');
  const [tA, tB] = tiles;
  const gold = g.state.hero.gold;
  const hero = G.createCharacter();
  hero.gold = gold;
  let X = null;
  let init = 0;
  let bestPrice = Infinity;
  for (const p of npc.торговля.предметы) {
    if (!G.getItem(p.предмет)) continue;
    const price = G.npcBuyPrice({ npc, stock: {} }, p.предмет, hero);
    if (price == null || price > gold) continue;
    if (price < bestPrice) { bestPrice = price; X = p.предмет; }
  }
  assert.ok(X, 'у жреца есть предмет по карману герою (gold ' + gold + ')');
  init = (npc.торговля.предметы.find((p) => p.предмет === X).количество || 1);
  const ovA = openTrade(h, G, tA, rec, npc);
  assert.ok(dialogBuyOnce(ovA, X), 'покупка у жреца в точке A');
  G.npcUI.close();
  const keyA = 'sun_priest@W:' + tA.x + ',' + tA.y;
  const keyB = 'sun_priest@W:' + tB.x + ',' + tB.y;
  assert.ok(keyA in g.npcStocks,
    'npcStocks: point-ключ каталожного канала; ключи: '
    + Object.keys(g.npcStocks).join(' | '));
  assert.equal(g.npcStocks[keyA][X], init - 1,
    'A: каталожное списание (init ' + init + ')');
  assert.deepEqual(Object.keys(g.worldShops), [],
    'НЕ-магазинный тайл worldShops не трогает');
  const ovB = openTrade(h, G, tB, rec, npc);
  assert.ok(dialogBuyOnce(ovB, X),
    'точка B — раздельные остатки (000319): покупка возможна');
  G.npcUI.close();
  assert.ok(keyB in g.npcStocks, 'npcStocks: вторая точка — своя запись');
  assert.notEqual(g.npcStocks[keyA], g.npcStocks[keyB],
    'объекты стоков A и B — РАЗНЫЕ');
  assert.equal(g.npcStocks[keyB][X], init - 1,
    'B: списание только из своей записи (init ' + init + ')');
});

test('000345-S5. guard: городская ветвь shopFor не тронута; унификация — только МИР (гард !ds) и ПОСЛЕ города', async () => {
  const mainSrc = fs.readFileSync(path.join(ROOT, 'src', 'main.js'), 'utf8');
  const cityIdx = mainSrc.indexOf('ds.kind === \'city\' && ds.cityShops && t');
  const unifyIdx = mainSrc.indexOf('!ds && t && t.hasBuilding');
  assert.ok(cityIdx >= 0, 'городская ветвь (000107/000108) — на месте');
  assert.ok(unifyIdx >= 0,
    'мирская унификация (000345) — на месте: «!ds && t && t.hasBuilding»');
  assert.ok(cityIdx < unifyIdx,
    'город резолвится ПЕРВЫМ (cityShops-семантика 000108 не тронута)');
  assert.match(mainSrc, /return \{ npc, stock: s\.stock \};/,
    'город — ЖИВАЯ ссылка cityShops (без изменений)');
  assert.match(mainSrc, /const ws = worldShopFor\(t\.x, t\.y, t\);\s*\n\s*if \(ws\) return \{ npc, stock: ws\.stock \};/,
    'мир — ЖИВАЯ ссылка на сток точки (не копия — прецедент города)');
  assert.match(mainSrc,
    /!ds && t && t\.hasBuilding && npc && npc\.торговля\s*&& Array\.isArray\(npc\.торговля\.предметы\)\s*&& G\.shopKindsFor\(t\.building\)/,
    'гард мирской ветви полон: вне подземелья, тайл с постройкой, '
    + 'торговец с каталогом, постройка — магазин (иначе — каталожный '
    + 'канал 000319 без изменений)');
  assert.equal((mainSrc.match(/return \{ npc, stock: ws\.stock \};/g) || [])
    .length, 1,
    'мирская живая ссылка — РОВНО одна (унификация не дублируется)');
});

test('000345-S6. сейв: покупка в диалоге магазинной точки персистится через worldShops, roundtrip держит остаток в обоих экранах', async () => {
  const h = await boot();
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет: ' + h.errors.join('; '));
  const npc = G.npcById(G.NpcData.NPCS, 'apothecary');
  const rec = G.getBuilding(3);
  const sel = pickTile(G, 2, npc, (golden, ids) => {
    const rich = ids.filter((id) => golden.stock[id] >= 2);
    return rich.length >= 1 ? rich : null;
  });
  assert.ok(sel, 'скан: найден тайл с товаром торговца qty ≥ 2 на полке');
  const { t, golden, picked } = sel;
  const key = t.x + ',' + t.y;
  const X = cheapest(G, npc, picked, golden.stock);
  const before = golden.stock[X];
  const ov = openTrade(h, G, t, rec, npc);
  assert.ok(dialogBuyOnce(ov, X), 'покупка 1 в диалоге');
  G.npcUI.close();
  fireBeforeUnload(h);
  const sv = readSave(h);
  assert.ok(sv.data.worldShops && sv.data.worldShops[key],
    'сейв: запись точки в разделе worldShops; разделы: '
    + Object.keys(sv.data).join(' | '));
  assert.equal(sv.data.worldShops[key].stock[X], before - 1,
    'сейв: остаток «' + X + '» = ' + (before - 1));
  const npcKey = 'apothecary@W:' + key;
  assert.ok(!sv.data.npcStocks || !(npcKey in sv.data.npcStocks),
    'сейв: для магазинного тайла npcStocks-ключ не пишется; ключи: '
    + Object.keys(sv.data.npcStocks || {}).join(' | '));
  const h2 = await boot(seedSave(sv.data));
  const g2 = h2.sandbox.__game;
  assert.equal(h2.errors.length, 0,
    'перезагрузка без ошибок: ' + h2.errors.join('; '));
  assert.equal(g2.worldShops[key].stock[X], before - 1,
    'roundtrip: остаток точки восстановлен');
  const ov2 = openTrade(h2, h2.sandbox.Game, t, rec, npc);
  assert.equal(dialogStock(ov2).get(X), before - 1,
    'после перезагрузки диалог держит восстановленный остаток');
  h2.sandbox.Game.npcUI.close();
});

test('000345-S7. Оружейная: трое торговцев — общая полка точки, разный «прилавок» (каталог каждого — только свои строки)', async () => {
  const h = await boot();
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет: ' + h.errors.join('; '));
  const a = G.npcById(G.NpcData.NPCS, 'weapons_merchant');
  const b = G.npcById(G.NpcData.NPCS, 'blade_smith');
  assert.ok(a && a.торговля && b && b.торговля,
    'Бренн и Дарн торгуют (один дом — weapons_shop)');
  const rec = G.getBuilding(1);
  const gold = g.state.hero.gold;
  const pay = G.createCharacter();
  pay.gold = gold;
  const affordable = (id) => {
    const price = G.npcBuyPrice({ npc: a, stock: {} }, id, pay);
    return price != null && price <= gold;
  };
  const sel = pickTile(G, 0, a, (golden, ids) => {
    const shared = ids.filter((id) => (golden.stock[id] || 0) >= 2
      && b.торговля.предметы.some((p) => p.предмет === id)
      && affordable(id));
    return shared.length >= 1 ? shared : null;
  });
  assert.ok(sel, 'скан: найден оружейный тайл с общим товаром qty ≥ 2 '
    + 'по карману герою (gold ' + gold + ')');
  const { t, golden, picked } = sel;
  const key = t.x + ',' + t.y;
  const X = cheapest(G, a, picked, golden.stock) || picked[0];
  const outside = a.торговля.предметы
    .map((p) => p.предмет)
    .find((id) => (golden.stock[id] || 0) >= 1
      && !b.торговля.предметы.some((p) => p.предмет === id));
  const ov1 = openTrade(h, G, t, rec, a);
  const rows1 = dialogStock(ov1);
  if (outside) {
    assert.equal(rows1.get(outside), golden.stock[outside],
      'Бренн: «ост.» полочного «' + outside + '» = сток точки '
      + '(красный корня: каталожное количество)');
  }
  assert.ok(dialogBuyOnce(ov1, X), 'Бренн: покупка «' + X + '»');
  G.npcUI.close();
  const e7 = g.worldShops[key];
  assert.ok(e7, 'диалог у Бренна на магазинном тайле использует сток '
    + 'ТОЧКИ (красный корня: мира npcStocks, worldShops пуст); '
    + 'ключи: ' + Object.keys(g.worldShops).join(' | '));
  assert.equal(e7.stock[X], golden.stock[X] - 1,
    'покупка у одного торговца списывает ПОЛКУ ТОЧКИ');
  const ov2 = openTrade(h, G, t, rec, b);
  const rows2 = dialogStock(ov2);
  assert.equal(rows2.get(X), golden.stock[X] - 1,
    'Дарн: «ост.» того же товара = списанная полка точки');
  if (outside) {
    assert.ok(!rows2.has(outside),
      'вне каталога Дарна — строки нет (прилавок персонален, '
      + 'несмотря на общую полку)');
  }
  G.npcUI.close();
});

test('000345-S8. стражи смежных контрактов: сиды makeShop/camp, городская проводка, каталожный канал, ключи и прокидка hud — 0-diff', () => {
  const items = fs.readFileSync(path.join(ROOT, 'src', 'items.js'), 'utf8');
  assert.match(items, /hash2\(x, y, 0x154075\)/,
    'сид makeShop — без изменений (0 новых RNG; голдены cities/000317)');
  assert.match(items, /hash2\(x, y, CAMP_STOCK_SEED\)/,
    'сид лагеря — без изменений (барахолка вне скоупа 000345)');
  const mainSrc = fs.readFileSync(path.join(ROOT, 'src', 'main.js'), 'utf8');
  assert.match(mainSrc, /G\.makeShop\(x, y, tile\.building, tile\.buildingWealth\)/,
    'worldShopFor — прежний детерминированный вызов makeShop');
  assert.match(mainSrc, /shop\.buildingType !== CAMP_ID/,
    'провайдер выкупа — camp-only (000316)');
  assert.match(mainSrc, /return npcId \+ '@W:' \+ t\.x \+ ',' \+ t\.y;/,
    'формат ключа каталожного канала «id@W:x,y» не изменился (сейв-форма)');
  assert.match(mainSrc, /if \(!npc \|\| !npc\.торговля \|\| !Array\.isArray\(npc\.торговля\.предметы\)\) \{\s*\n\s*return null;\s*\n\s*\}/,
    'гард «не торговец → null» городской ветви цел');
  const npcSrc = fs.readFileSync(path.join(ROOT, 'src', 'npc.js'), 'utf8');
  assert.match(npcSrc, /function createNpcShop\(npc\) \{/,
    'createNpcShop — 0 правок (каталожный канал жив)');
  assert.match(npcSrc, /function npcBuy\(shop, character, itemId, qty = 1, priceChar = character\) \{/,
    'npcBuy — 0 правок (по-прежнему требует tradeEntry: прилавок персонален)');
  const hudSrc = fs.readFileSync(path.join(ROOT, 'src', 'hud.js'), 'utf8');
  assert.match(hudSrc, /ctx\.worldShopFor\(ctx\.player\.x, ctx\.player\.y, ctx\.tile\)/,
    'hud [I] — та же прокидка per-точечного стока');
  const uiSrc = fs.readFileSync(path.join(ROOT, 'src', 'ui.js'), 'utf8');
  assert.match(uiSrc, /\(ост\. /,
    'ui.js: формат строки «(ост. N)» вкладки торговли не менялся');
});

test('000345-S9. ре-пин канона: 000319-файл T1 переименован под единый источник (000345), старый расходящийся контракт снят', () => {
  const f = fs.readFileSync(
    path.join(ROOT, 'tests', 'shop-point-stock-000319.test.js'), 'utf8');
  const m = /^test\('T1\.([^\n]*)',/m.exec(f);
  assert.ok(m, 'файл 000319: тест T1 найден');
  assert.ok(m[1].includes('000345'),
    'имя T1 содержит маркер ре-пина 000345 (диалог магазинного тайла '
    + '— сток точки); фактическое имя: T1.' + m[1]);
  assert.ok(!f.includes('ключи точки раздельны'),
    'старая формулировка «npcStocks: ключи точки раздельны» у T1 '
    + 'снята (для магазинных тайлов канал — worldShops)');
});

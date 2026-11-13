// Задача 000319: независимый ассортимент магазинов ПО ТОЧКАМ.
//
// Контракт (tasks/done/000319.md, memory/000319-shop-point-stock.md):
//   * «Картовый» магазин мира — сток на уровне точки: хранилище
//     main.js `worldShops` с ключом 'x,y' МИРОВОГО тайла (прецедент
//     campStocks 000095); покупка списывает сток ТОЛЬКО этой точки;
//     wrap ССЫЛКОЙ на entry.stock (buyItem мутирует in place).
//   * Диалог-торговля NPC — ключ «точка+npcId»: 'npcId@W:x,y' (мир),
//     'npcId@C:ax,ay:tx,ty' (город-fallback без cityShops),
//     'npcId@D:<worldKey>:tx,ty' (защитная ветвь); БЕЗ tile —
//     прежний plain-npcId ключ (legacy-фолбэк harness-проводки
//     building-actions deps.npcShopFor).
//   * Сейв v1 БЕЗ смены версии/MIGRATIONS: новый топ-раздел
//     `worldShops` 'x,y' → { day, stock } (seed/buildingType/wealth
//     НЕ сериализуются — воспроизводятся makeShop по тайлу; паттерн
//     campStocks); npcStocks — ФОРМА {ключ: {itemId: qty}} НЕ
//     меняется, ключи additive (point-ключи + legacy plain);
//     absent → дефолт (полный сток), мусор — санация skip (000298).
//   * Refresh per-магазин: мир — окно city_respawn_days ОТ ДНЯ
//     ГЕНЕРАЦИИ записи (campStockDueRefresh-семантика, ЛЕНИВО при
//     резолве точки); город — без изменений (per-city на входе —
//     SPEC spec/buildings.md «Состояние, сейв, респаун»); лагерь —
//     без изменений; NPC-сток — респавна нет.
//   * 0 НОВЫХ RNG: сид makeShop hash2(x, y, 0x154075)^(bt+1) НЕ
//     меняется, день/уровень/effWealth в сиды не входят; голдены
//     cities/000317/000222 бит-в-бит.
//
// Корень дефекта (см. memory §1): (1) npcStocks ключен ТОЛЬКО по
// npcId — все тайлы-аптеки мира торгуют в ОДИН сток «Милы»;
// (2) сток «картовых» магазинов hud.js создаёт ЗАНОВО КАЖДЫЙ КАДР
// (ctx.game.makeShop) и в сейв не пишется — списание теряется
// следующим кадром.
//
// Харнес — vm-цепочка index.html с DOM/WebGL-стабами + мок
// localStorage (1:1 прецеденты tests/save-restore.test.js:137–263 и
// tests/building-effects.test.js:4790–5061: досеянный сейв до boot,
// beforeunload → saveNow, e2e-диалог через onBuildingAction('dialog',
// синтетический tile)). Тайлы-магазины — ДИНАМИЧЕСКИЙ скан
// детерминированного мира (G.createMap(G.generateSeedPixels()) — тот
// же генератор, что у main.js): устойчивость к составу карты.
// Предметы/количества — из каталога (устойчивость к 000321.01).

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
    removeItem: (k) => { m.delete(k); },
  };
}

function seedSave(data) {
  return { version: 1, savedAt: new Date(0).toISOString(), data };
}

// --- Песочница: вся цепочка index.html (warns — captured, для T5) ---

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

// Клон в ХОСТ-realm: vm.createContext — отдельный realm, прототипы
// объектов из песочницы ≠ хостовые, deepStrictEqual между realm'ами
// красный при идентичном содержимом (сверка — только cl(a) vs cl(b)
// либо cl(x) vs хостовый литерал).
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

function frameAt(h, now) {
  h.raf[h.raf.length - 1](now);
}

// --- Общие хелперы задачи ---

// ДВЕ точки ОДНОГО ВИДА «картового» магазина детерминированного мира
// (ТЗ: «два магазина одного вида»). Скан — по ТОМУ ЖЕ генератору,
// что main.js (G.generateSeedPixels + createMap).
function findTwoShopTiles(G) {
  const map = G.createMap(G.generateSeedPixels());
  const byKind = {};
  for (let y = -200; y <= 200; y++) {
    for (let x = -200; x <= 200; x++) {
      const t = map.tileAt(x, y);
      if (t.hasBuilding && t.building >= 0 && G.shopKindsFor(t.building)) {
        (byKind[t.building] || (byKind[t.building] = [])).push(t);
      }
    }
  }
  const kinds = Object.keys(byKind)
    .sort((a, b) => (byKind[b].length - byKind[a].length) || (a - b));
  for (const k of kinds) {
    if (byKind[k].length >= 2) return [byKind[k][0], byKind[k][1]];
  }
  throw new Error('в мире нет двух «картовых» магазинов одного вида');
}

// Мирская точка БЕЗ «картового» магазина (для негатива санации).
function findNonShopTile(G) {
  const map = G.createMap(G.generateSeedPixels());
  for (let y = -20; y <= 20; y++) {
    for (let x = -20; x <= 20; x++) {
      const t = map.tileAt(x, y);
      if (!G.shopKindsFor(t.building)) return t;
    }
  }
  throw new Error('нет тайла без «картового» магазина');
}

// Самый дешёвый предмет стока по фактической цене покупки. РЕ-ПИН
// 000346: цена включает множитель редкости ×8^шаг (value-порядок
// больше не эквивалентен ценовому), сортировка — по G.buyPrice.
function cheapestStockItem(G, shop) {
  const c = G.createCharacter();
  let best = null;
  let bestPrice = Infinity;
  for (const id of Object.keys(shop.stock)) {
    if (!(shop.stock[id] >= 1)) continue;
    if (!G.getItem(id)) continue;
    const price = G.buyPrice(shop, id, c);
    if (price < bestPrice
        || (price === bestPrice && id < best)) {
      best = id; bestPrice = price;
    }
  }
  return best;
}

// Открыть вкладку «Магазин» на wrap'е (тот же setShop/toggle, что
// лагерь 000095) и выкупить item до нуля кликами «купить» (прецедент
// B29(5): panel.listeners.click[0]({target}) — делегат панели).
function panelBuyOut(G, h, wrap, itemId, maxClicks) {
  G.playerUI.setShop(wrap);
  G.playerUI.toggle(true, 'shop');
  const panel = findAll(h.body, '.char-panel')[0];
  assert.ok(panel, 'панель персонажа открыта вкладкой «Магазин»');
  let clicks = 0;
  for (let i = 0; i < maxClicks; i++) {
    const btn = findAll(panel, '.cp-btn')
      .find((b) => b.dataset.act === 'buy' && b.dataset.item === itemId);
    if (!btn) break;
    panel.listeners.click[0]({ target: btn });
    clicks++;
  }
  return clicks;
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

// Один клик «купить» у NPC (или null, если строки уже нет).
function dialogBuyOnce(ov, itemId) {
  const btn = findAll(ov, 'button[data-npcact="buy"]')
    .find((b) => b.dataset.item === itemId);
  if (!btn) return false;
  ov.listeners.click[0]({ target: btn });
  return true;
}

// --- Тесты ---

test('T1. диалог на магазинном тайле — сток ТОЧКИ (РЕ-ПИН 000345): выкуп у Милы в A списывает worldShops A; точка B цела, покупка возможна', async () => {
  const h = await boot();
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет: ' + h.errors.join('; '));
  // РЕ-ПИН 000345: диалог на ТАЙЛЕ-МАГАЗИНЕ мира читает ЖИВОЙ сток
  // точки (worldShopFor, прецедент города 000107) — прежний канал
  // npcStocks для магазинных тайлов НЕ используется. Смысловой
  // инвариант 000319 («в двух точках — раздельные остатки») сохраняется
  // через раздельные записи worldShops.
  const npc = G.npcById(G.NpcData.NPCS, 'apothecary');
  assert.ok(npc && npc.торговля, 'каталог: Мила-аптекарь торгует');
  const rec = G.getBuilding(3);
  const map = G.createMap(G.generateSeedPixels());
  const tiles = [];
  for (let y = -200; y <= 200; y++) {
    for (let x = -200; x <= 200; x++) {
      const t = map.tileAt(x, y);
      if (t.hasBuilding && t.building === 2) tiles.push(t);
    }
  }
  assert.ok(tiles.length >= 2, 'в мире есть ≥2 аптекарских тайла');
  const pay = G.createCharacter();
  const gold = g.state.hero.gold;
  // Выкуп ДО НУЛЯ должен быть ПО КАРМАНУ: кандидаты — общий товар
  // (≥2 на полке A, ≥1 на полке B), суммарная цена npcBuyPrice за всю
  // полку A ≤ gold; берём самого дешёвого кандидата (перебор по всем
  // парам точек — детерминирован по координатному порядку скана).
  const shops = tiles.map((t) => G.makeShop(t.x, t.y, t.building,
    t.buildingWealth));
  let pair = null;
  let itemId = null;
  let npcPrice = null;
  let bestTotal = Infinity;
  for (let i = 0; i < tiles.length; i++) {
    const inA = npc.торговля.предметы
      .map((p) => p.предмет)
      .filter((id) => (shops[i].stock[id] || 0) >= 2 && G.getItem(id));
    if (!inA.length) continue;
    for (let j = i + 1; j < tiles.length; j++) {
      for (const id of inA) {
        if ((shops[j].stock[id] || 0) < 1) continue;
        const price = G.npcBuyPrice({ npc, stock: shops[i].stock }, id, pay);
        const priceB = G.npcBuyPrice({ npc, stock: shops[j].stock }, id, pay);
        const total = price * shops[i].stock[id];
        // Кармана хватит и на выкуп A ДО НУЛЯ, и на ОДНУ покупку в B.
        if (price != null && priceB != null
            && total + priceB <= gold && total + priceB < bestTotal) {
          bestTotal = total + priceB;
          pair = [tiles[i], tiles[j]];
          itemId = id;
          npcPrice = price;
        }
      }
    }
  }
  assert.ok(pair, 'скан: найдены две точки с общим посильным выкупу товаром'
    + ' Милы на полке (gold ' + gold + ')');
  const [tA, tB] = pair;
  const keyA = tA.x + ',' + tA.y;
  const keyB = tB.x + ',' + tB.y;
  const gA = shops[tiles.indexOf(tA)];
  const gB = shops[tiles.indexOf(tB)];
  const initA = gA.stock[itemId];
  const initB = gB.stock[itemId];
  // Точка A — выкупаем предмет ДО НУЛЯ через диалог.
  G.buildingActions.onBuildingAction(DIALOG, tA, rec, npc);
  const ov = findNpcOverlay(h);
  assert.ok(ov, 'диалог на тайле A открыт');
  dialogClickOpt(ov, 'trade');
  assert.ok(npcPrice != null && npcPrice * initA <= gold,
    'выкуп по карману (цена ' + npcPrice + ' × ' + initA
    + ' ≤ gold ' + gold + ')');
  for (let i = 0; i < initA + 1; i++) {
    if (!dialogBuyOnce(ov, itemId)) break;
  }
  G.npcUI.close();
  assert.ok(g.worldShops[keyA],
    'диалог списывает сток ТОЧКИ A (раздел worldShops); ключи: '
    + Object.keys(g.worldShops).join(' | '));
  assert.equal(g.worldShops[keyA].stock[itemId], 0,
    'сток точки A выкуплен до нуля (init ' + initA + ')');
  assert.ok(!('apothecary@W:' + keyA in g.npcStocks),
    'для магазинного тайла запись npcStocks НЕ создаётся; ключи: '
    + Object.keys(g.npcStocks).join(' | '));
  // Точка B — ТОТ ЖЕ NPC, ДРУГАЯ точка: покупка возможна, списание
  // только из записи B (раздельность остатков по точкам — 000319).
  G.buildingActions.onBuildingAction(DIALOG, tB, rec, npc);
  const ov2 = findNpcOverlay(h);
  assert.ok(ov2, 'диалог на тайле B открыт');
  dialogClickOpt(ov2, 'trade');
  const bought = dialogBuyOnce(ov2, itemId);
  assert.ok(bought,
    'витрина B: строка предмета «' + itemId + '» есть (init B '
    + initB + '); лог оверлея: ' + textOf(ov2).slice(-200));
  assert.equal(g.worldShops[keyB].stock[itemId], initB - 1,
    'B: списание ТОЛЬКО из записи точки B (init ' + initB + ')');
  assert.equal(g.worldShops[keyA].stock[itemId], 0,
    'A осталась нулевой (точки не смешиваются)');
  assert.notEqual(g.worldShops[keyA].stock, g.worldShops[keyB].stock,
    'объекты стоков A и B — РАЗНЫЕ записи');
  G.npcUI.close();
});

test('T2. worldShops: wrap бит-в-бит makeShop (РЕГРЕСС одиночного магазина), покупка переживает резолвы в окне (W4), точка B цела', async () => {
  const h = await boot();
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет: ' + h.errors.join('; '));
  if (typeof g.worldShopFor !== 'function') {
    assert.fail('worldShopFor: решателя нет — «картовый» сток '
      + 'пересоздаётся каждый кадр (списание теряется следующим кадром)');
  }
  const [tA, tB] = findTwoShopTiles(G);
  const keyA = tA.x + ',' + tA.y;
  const w = g.worldShopFor(tA.x, tA.y, tA);
  assert.ok(w, 'wrap точки A есть');
  const golden = G.makeShop(tA.x, tA.y, tA.building, tA.buildingWealth);
  assert.ok(golden, 'makeShop(A) не null (магазин по каталогу)');
  assert.equal(JSON.stringify(w), JSON.stringify(golden),
    'РЕГРЕСС: одиночный магазин — wrap бит-в-бит makeShop '
    + '(поля, порядок, seed — 0 новых RNG)');
  const w2 = g.worldShopFor(tA.x, tA.y, tA);
  assert.equal(w2.stock, w.stock,
    'тот же live-объект стока (buyItem мутирует entry.stock in place)');
  const e = g.worldShops[keyA];
  assert.ok(e && Number.isInteger(e.day) && e.day >= 1,
    'хранилище: запись «x,y» с днём генерации: ' + JSON.stringify(e));
  assert.equal(e.seed, golden.seed);
  const itemId = cheapestStockItem(G, golden);
  assert.ok(itemId, 'в стоке есть предмет для выкупа');
  const init = golden.stock[itemId];
  const clicks = panelBuyOut(G, h, w, itemId, init + 1);
  assert.ok(clicks >= 1, 'клик «купить» прошёл');
  assert.equal(g.worldShops[keyA].stock[itemId], 0,
    'выкуп до нуля записан в хранилище точки (init ' + init + ')');
  const w3 = g.worldShopFor(tA.x, tA.y, tA);
  assert.equal(w3.stock[itemId], 0,
    'РЕГРЕСС W4: в окне (тот же день) повторный резолв НЕ регенерит сток');
  const wB = g.worldShopFor(tB.x, tB.y, tB);
  const goldenB = G.makeShop(tB.x, tB.y, tB.building, tB.buildingWealth);
  assert.deepEqual(wB.stock, goldenB.stock,
    'точка B — полный сток, НЕ затронута покупками в A');
});

test('T3. refresh per-точка: протухшая точка — refill бит-в-бит makeShop, свежая точка сохраняет остатки', async () => {
  const h0 = await boot();
  const G0 = h0.sandbox.Game;
  const [tA, tB] = findTwoShopTiles(G0);
  const gs = G0.GlobalSettings && G0.GlobalSettings.SETTINGS;
  const N = (gs && Number.isInteger(gs.city_respawn_days)
    && gs.city_respawn_days >= 1) ? gs.city_respawn_days : 3;
  const gA = G0.makeShop(tA.x, tA.y, tA.building, tA.buildingWealth);
  const gB = G0.makeShop(tB.x, tB.y, tB.building, tB.buildingWealth);
  const X = cheapestStockItem(G0, gA);
  const Y = cheapestStockItem(G0, gB);
  const keyA = tA.x + ',' + tA.y;
  const keyB = tB.x + ',' + tB.y;
  const D = 2 + N; // мир «на N+1 день старше» записи A; запись B — ровно у границы окна
  const data = {
    day: D,
    position: { x: 0, y: 0 },
    worldShops: {
      [keyA]: { day: D, stock: { [X]: 0 } },
      [keyB]: { day: D - N, stock: { [Y]: 0 } },
    },
  };
  const h = await boot(seedSave(data));
  const g = h.sandbox.__game;
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет: ' + h.errors.join('; '));
  assert.equal(g.state.day, D, 'день мира из сейва');
  if (typeof g.worldShopFor !== 'function') {
    assert.fail('worldShopFor: решателя нет — остатки/refresh по точкам невозможны');
  }
  const e0 = g.worldShops[keyA];
  assert.ok(e0, 'остатки A восстановлены из раздела worldShops '
    + '(раздел: ' + JSON.stringify(Object.keys(g.worldShops)) + ')');
  assert.equal(e0.stock[X], 0, 'A: выкупленный предмет восстановлен нулём');
  const eB0 = g.worldShops[keyB];
  assert.ok(eB0 && eB0.stock[Y] === 0, 'B: остатки восстановлены');
  const wB = g.worldShopFor(tB.x, tB.y, tB);
  assert.deepEqual(cl(wB.stock), cl(gB.stock),
    'B у окна (day−entry.day ≥ ' + N + ') — полный refill, бит-в-бит '
    + 'makeShop (день в сид НЕ входит — 0 новых RNG): '
    + JSON.stringify(cl(wB.stock)).slice(0, 200));
  assert.equal(g.worldShops[keyA].stock[X], 0,
    'A НЕ затронута резолвом/ротацией B (refresh per-магазин, не глобально)');
  const wA = g.worldShopFor(tA.x, tA.y, tA);
  assert.equal(wA.stock[X], 0, 'A в окне — остатки целы');
});

test('T4. save/restore: раздельные остатки картовых точек и NPC-диалога переживают перезагрузку; legacy plain-ключ npcStocks читаем', async () => {
  const h = await boot();
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет: ' + h.errors.join('; '));
  if (typeof g.worldShopFor !== 'function') {
    assert.fail('worldShopFor: решателя нет — картовый сток в сейв не пишется');
  }
  const [tA, tB] = findTwoShopTiles(G);
  const keyA = tA.x + ',' + tA.y;
  const keyB = tB.x + ',' + tB.y;
  const wA = g.worldShopFor(tA.x, tA.y, tA);
  const wB = g.worldShopFor(tB.x, tB.y, tB);
  const gA = G.makeShop(tA.x, tA.y, tA.building, tA.buildingWealth);
  const gB = G.makeShop(tB.x, tB.y, tB.building, tB.buildingWealth);
  const X = cheapestStockItem(G, gA);
  const Y = cheapestStockItem(G, gB);
  const aBefore = cl(g.worldShops[keyA].stock);
  const bBefore = cl(g.worldShops[keyB].stock);
  // По ОДНОЙ покупке в каждой точке — остатки РАЗДЕЛЬНЫ: после обеих
  // покупок каждый сток отличается от СВОЕГО init только списанным
  // предметом (X и Y могут СОВПАДАТЬ — магазины одного вида:
  // независимость — построчная сверка каждого стока со своим init).
  assert.equal(panelBuyOut(G, h, wA, X, 1), 1, 'покупка 1×X в A');
  assert.equal(panelBuyOut(G, h, wB, Y, 1), 1, 'покупка 1×Y в B');
  const aAfter = cl(g.worldShops[keyA].stock);
  const bAfter = cl(g.worldShops[keyB].stock);
  for (const id of Object.keys(aBefore)) {
    assert.equal(aAfter[id], aBefore[id] - (id === X ? 1 : 0),
      'A: строка «' + id + '» — только X списан (B не смешалась)');
  }
  for (const id of Object.keys(bBefore)) {
    assert.equal(bAfter[id], bBefore[id] - (id === Y ? 1 : 0),
      'B: строка «' + id + '» — только Y списан (A не смешалась)');
  }
  // NPC-диалог КАНАЛА КАТАЛОГА (000319): одна покупка — point-ключ
  // npcStocks. РЕ-ПИН 000345: магазинный тайл больше НЕ идёт этим
  // каналом (см. T1), поэтому несущий тест раздельности каналов берёт
  // НЕ-магазинную постройку — Храм солнца (жрец, каталог «торговля»).
  const npc = G.npcById(G.NpcData.NPCS, 'sun_priest');
  assert.ok(npc && npc.торговля, 'каталог: Жрец Солнца торгует');
  const rec = G.getBuilding(36);
  const world = G.createMap(G.generateSeedPixels());
  let tT = null;
  for (let y = -200; y <= 200 && !tT; y++) {
    for (let x = -200; x <= 200 && !tT; x++) {
      const t = world.tileAt(x, y);
      if (t.hasBuilding && t.building === 8 && !G.shopKindsFor(t.building)) {
        tT = t;
      }
    }
  }
  assert.ok(tT, 'в мире есть тайл Храма солнца (не «картовый» магазин)');
  const goldLeft = g.state.hero.gold;
  const pay = G.createCharacter();
  const nEntry = npc.торговля.предметы
    .map((p) => {
      const id = p.предмет;
      const price = G.npcBuyPrice({ npc, stock: {} }, id, pay);
      return { id, qty: p.количество || 1,
        price: price == null ? Infinity : price };
    })
    .filter((e) => e.price <= goldLeft && G.getItem(e.id))
    .sort((a, b) => (a.price - b.price) || (a.id < b.id ? -1 : 1))[0];
  assert.ok(nEntry,
    'найдена посильная позиция каталога жреца (gold ' + goldLeft + ')');
  const npcKey = 'sun_priest@W:' + tT.x + ',' + tT.y;
  G.buildingActions.onBuildingAction(DIALOG, tT, rec, npc);
  const ov = findNpcOverlay(h);
  assert.ok(ov, 'диалог жреца открыт');
  dialogClickOpt(ov, 'trade');
  assert.ok(dialogBuyOnce(ov, nEntry.id),
    'покупка 1 у жреца «' + nEntry.id + '» (цена ' + nEntry.price
    + ' ≤ ' + goldLeft + ')');
  G.npcUI.close();
  // Сейв.
  fireBeforeUnload(h);
  const sv = readSave(h);
  assert.ok(sv.data.worldShops, 'раздел worldShops записан');
  assert.deepEqual(Object.keys(sv.data.worldShops).sort(),
    [keyA, keyB].sort(), 'по точке — своя запись');
  assert.equal(sv.data.worldShops[keyA].stock[X], gA.stock[X] - 1,
    'сейв: остаток A');
  assert.equal(sv.data.worldShops[keyB].stock[Y], gB.stock[Y] - 1,
    'сейв: остаток B (раздельно)');
  assert.ok(sv.data.npcStocks && sv.data.npcStocks[npcKey],
    'npcStocks: point-ключ в сейве; ключи: '
    + Object.keys(sv.data.npcStocks || {}).join(' | '));
  assert.equal(sv.data.npcStocks[npcKey][nEntry.id], nEntry.qty - 1);
  // Перезагрузка: остатки раздельны.
  const h2 = await boot(seedSave(sv.data));
  const g2 = h2.sandbox.__game;
  assert.equal(h2.errors.length, 0,
    'перезагрузка без ошибок: ' + h2.errors.join('; '));
  if (typeof g2.worldShopFor !== 'function') {
    assert.fail('worldShopFor: решателя нет после перезагрузки');
  }
  assert.equal(g2.worldShops[keyA].stock[X], gA.stock[X] - 1,
    'roundtrip: остаток A');
  assert.equal(g2.worldShops[keyB].stock[Y], gB.stock[Y] - 1,
    'roundtrip: остаток B');
  assert.ok(g2.npcStocks[npcKey],
    'roundtrip: npcStocks point-ключ; ключи: '
    + Object.keys(g2.npcStocks).join(' | '));
  assert.equal(g2.npcStocks[npcKey][nEntry.id], nEntry.qty - 1);
  // Старый сейв: plain-ключ npcStocks — читаем КАК СЕЙЧАС.
  const legacy = { day: 2, position: { x: 0, y: 0 },
    npcStocks: { apothecary: { healing_potion: 0 } } };
  const h3 = await boot(seedSave(legacy));
  assert.equal(h3.errors.length, 0,
    'legacy-сейв без ошибок: ' + h3.errors.join('; '));
  assert.equal(h3.sandbox.__game.npcStocks['apothecary'].healing_potion, 0,
    'legacy plain-ключ валидируется и грузится (старый сейв играбелен)');
  assert.deepEqual(cl(h3.sandbox.__game.worldShops), {},
    'старый сейв без раздела — {} (absent → дефолт, без миграций): '
    + JSON.stringify(h3.sandbox.__game.worldShops));
});

test('T5. санация: absent-раздел — тихо полный сток; мусорные записи — skip, 0 console.error', async () => {
  const h = await boot();
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  if (g.worldShops === undefined) {
    assert.fail('debug-геттер __game.worldShops отсутствует');
  }
  assert.deepEqual(cl(g.worldShops), {},
    'чистый boot — пусто: ' + JSON.stringify(g.worldShops).slice(0, 400));
  // Старый v1 без раздела — молча {}, без warn по разделу.
  const h1 = await boot(seedSave({ day: 3, position: { x: 0, y: 0 } }));
  assert.deepEqual(cl(h1.sandbox.__game.worldShops), {},
    'absent-раздел → {} (полный сток = дефолт «пересоздать»)',
    JSON.stringify(h1.sandbox.__game.worldShops));
  assert.equal(h1.warns.filter((w) => /worldShops/.test(w)).length, 0,
    'absent — ТИХО (без warn); warns: ' + h1.warns.join(' | '));
  assert.equal(h1.errors.length, 0,
    'без ошибок: ' + h1.errors.join('; '));
  // Мусор: кривые ключи / «будущий» день / день 0 / не-запись /
  // не-магазин. «Магазинные» координаты — РЕАЛЬНЫЕ тайлы-магазины:
  // иначе гард тайла маскирует правила дня (мутации M7/M8 не краснеют).
  const bad = findNonShopTile(G);
  const [sG1, sG2] = findTwoShopTiles(G);
  const garbage = {
    day: 5,
    position: { x: 0, y: 0 },
    worldShops: {
      'нельзя': { day: 1, stock: {} },
      [sG1.x + ',' + sG1.y]: { day: 9, stock: {} },
      [sG2.x + ',' + sG2.y]: { day: 0, stock: {} },
      '9,9': 'не запись',
      [bad.x + ',' + bad.y]: { day: 2, stock: {} },
    },
  };
  const h2 = await boot(seedSave(garbage));
  assert.equal(h2.errors.length, 0,
    'мусорный раздел — без ошибок загрузки: '
    + h2.errors.join('; '));
  assert.deepEqual(cl(h2.sandbox.__game.worldShops), {},
    'мусор — skip all (fail-open: игра не роняется): '
    + JSON.stringify(h2.sandbox.__game.worldShops));
});

test('T6. стражи 0 новых RNG и неизменных контрактов (зелёные с RED-стадии): сиды makeShop/camp, провайдер выкупа camp-only', () => {
  const items = fs.readFileSync(path.join(ROOT, 'src', 'items.js'), 'utf8');
  assert.match(items, /hash2\(x, y, 0x154075\)/,
    'сид makeShop 0x154075 — без изменений (голдены cities/000317)');
  assert.match(items, /hash2\(x, y, CAMP_STOCK_SEED\)/,
    'сид лагеря — без изменений (A57)');
  assert.match(items, /SHOP_EXPAND_SEED/,
    '000317 expansion-сиды — на месте');
  assert.match(items, /function campStockDueRefresh\(entry, day, respawnDays\)/,
    'campStockDueRefresh — переиспользуется как общий предикат, не мутируется');
  assert.match(items, /function serializeCampStocks\(stocks\)/,
    'serializeCampStocks — 0 правок');
  assert.match(items, /function restoreCampStocks\(saved, day, tileAt, record\)/,
    'restoreCampStocks — 0 правок');
  const mainSrc = fs.readFileSync(path.join(ROOT, 'src', 'main.js'), 'utf8');
  assert.match(mainSrc, /shop\.buildingType !== CAMP_ID/,
    '000316 провайдер выкупа — camp-only (мирская лавка НЕ получает выкуп: '
    + 'день не в сиде makeShop → preview = refill)');
  assert.match(mainSrc, /G\.makeCampShop\(x, y, clock\.day, wealth, rec\)/,
    'campShopFor — тот же детерминированный вызов');
  assert.match(mainSrc, /function cityRespawnDays\(\)/,
    'окно refresh — существующая настройка city_respawn_days (новых нет)');
});

test('T7. hud: ctx.worldShopFor проводит per-точечный сток; БЕЗ поля — фолбэк makeShop бит-в-бит', async () => {
  const h = await boot();
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  const [tA] = findTwoShopTiles(G);
  const hudMod = G.hud;
  const realUpdate = hudMod.update;
  let ctxCap = null;
  hudMod.update = function (ctx) { ctxCap = ctx; return realUpdate.call(this, ctx); };
  frameAt(h, NOW);
  hudMod.update = realUpdate;
  assert.ok(ctxCap, 'кадр main.js дёрнул hud.update');
  if (typeof ctxCap.worldShopFor !== 'function') {
    assert.fail('renderHud ctx.worldShopFor отсутствует — hud по-прежнему '
      + 'создаёт сток makeShop-ом каждый кадр (списание теряет следующий кадр)');
  }
  const shopPlayer = { x: tA.x, y: tA.y };
  // ВЕТКА 1: поля нет (harness-пин hud.js.test) — фолбэк makeShop,
  // хранилище НЕ создаётся (бит-в-бит прежнему поведению).
  const realMake = G.makeShop;
  let makeCalls = [];
  G.makeShop = (...a) => { makeCalls.push(a); return realMake.apply(G, a); };
  const ctxNoW = Object.assign({}, ctxCap, {
    tile: tA, player: shopPlayer, worldShopFor: undefined,
  });
  realUpdate(ctxNoW);
  assert.equal(makeCalls.length, 1,
    'фолбэк: ровно один makeShop с прежними аргументами');
  assert.deepEqual(makeCalls[0], [tA.x, tA.y, tA.building, tA.buildingWealth],
    'фолбэк бит-в-бит: (x, y, building, buildingWealth) — 4 арг');
  assert.deepEqual(cl(g.worldShops), {},
    'фолбэк — хранилище не тронуто (прежнее поведение без '
    + 'main.js-решателя): ' + JSON.stringify(g.worldShops));
  G.makeShop = realMake;
  // ВЕТКА 2: поле есть — per-точечный сток попадает в setShop и хранилище.
  const ctxW = Object.assign({}, ctxCap, { tile: tA, player: shopPlayer });
  realUpdate(ctxW);
  const keyA = tA.x + ',' + tA.y;
  const e = g.worldShops[keyA];
  assert.ok(e, 'hud использовал worldShopFor — запись «x,y» в хранилище');
  const golden = G.makeShop(tA.x, tA.y, tA.building, tA.buildingWealth);
  assert.equal(e.seed, golden.seed, 'wrap — тот же сид (0 новых RNG)');
});

test('T8. спека: буллеты «Сток по точкам (000319)» в items/buildings/npc-storage', () => {
  const items = fs.readFileSync(path.join(ROOT, 'spec', 'items.md'), 'utf8');
  assert.ok(items.includes('Сток по точкам (000319)'),
    'spec/items.md: буллет «Сток по точкам (000319)» в H2 «Торговля»');
  assert.ok(items.includes('worldShops'),
    'spec/items.md: топ-раздел сейва worldShops назван');
  const b = fs.readFileSync(path.join(ROOT, 'spec', 'buildings.md'), 'utf8');
  assert.ok(b.includes('Сток по точкам (000319)'),
    'spec/buildings.md: буллет «Сток по точкам (000319)» в «Магазины»');
  assert.ok(!b.includes('картовые — makeShop при смене тайла/богатства'),
    'spec/buildings.md: старая формулировка «makeShop при смене '
    + 'тайла/богатства» заменена (line-neutral, 000319)');
  assert.ok(b.includes('city_respawn_days (000319)'),
    'spec/buildings.md: окно city_respawn_days для картовых (000319)');
  const ns = fs.readFileSync(path.join(ROOT, 'spec', 'npc-storage.md'), 'utf8');
  assert.ok(ns.includes('точка+npcId'),
    'spec/npc-storage.md: сток торговца — по точке+npcId (000319)');
});

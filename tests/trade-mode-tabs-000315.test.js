// Задача 000315 — режим торговли NPC: две колонки «Инвентарь | Магазин»,
// drag-n-drop с подтверждением продажи, кнопки «Продать»/«Купить»
// (ТЗ tasks/pending/000315.md; контракт memory/000315-trade-mode-tabs.md).
//
// Контракт (вкладка «торговля» NPC-диалога, renderTradeTab, src/ui.js):
//   * T1 — .storage-cols с РОВНО 2 .storage-col (классы-переиспользование
//     000313): слева «Инвентарь» (агрегат инвентаря hero «имя ×N»,
//     slot-порядок), справа «Магазин» (прежние магазин-строки
//     «имя (ост. N)» + meta цен — бит-в-бит); «Золото: N» — ПЕРВЫЙ meta
//     ВНЕ колонок;
//   * T2 — кнопки: на магазин-строке СТАРЫЕ «купить» (data-npcact='buy')
//     и «продать» (data-npcact='sell') СОХРАНЕНЫ + НОВАЯ «Купить»
//     ('trade-buy'); на инвентарной строке — «Продать» ('trade-sell')
//     (отдельные npcact — селекторные пины 000314/000299.03/
//     building-levels не меняют семантику);
//   * T4 — подтверждение продажи ПОБАЙТОВНО «Вы хотите продать 'имя'
//     за X золота?» (X — npcSellPrice по активному, 000299.03);
//     «Да» — мутация + ровно 1 сейв; «Нет» — состояние бит-в-бит,
//     0 сейвов; stale-«Да» — причина ядра, 0 мутаций/сейвов;
//   * T5/T6 — dnd-паритет: drop deep-equal клику (state/log/сейвы);
//     продажа (инвентарь→магазин) — через ТОТ ЖЕ confirm; покупка
//     (магазин→инвентарь) — БЕЗ подтверждения, отказ по факту кода
//     («мало золота (нужно N)», npc.js);
//   * T7 — disabled+причина: «Купить» — «мало золота (нужно N)»;
//     «Продать» не-торгуемого — «NPC не скупает такие предметы» +
//     row.draggable=false;
//   * T8 — цены/подтверждение — по Торговцу АКТИВНОГО (000299.03),
//     золото — всегда hero (Флогистон, 000194);
//   * T9 — регресс 000314: сток 0 — магазин-строки нет, но инв-строка
//     с активной «Продать» остаётся;
//   * W — spec/npc-storage.md буллет «Экран» фиксирует модель.
//
// vm-песочница — цепочка index.html БЕЗ main.js (паттерн
// tests/shop-zero-stock-000314.test.js: точку __game ставит ТЕСТ;
// onChange-сейвы — РЕЛЯТИВный счётчик).
//
// expectedRedCount (файл) = 10 (T1, T2, T4, T4b, T5, T6, T7, T8, T9, W).

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

// --- WebGL-стаб (дубль tests/shop-zero-stock-000314.test.js) ---

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

// --- Снисходительный DOM-элемент (дубль 000313/000314; draggable —
// явное поле: не-postawленное Proxy читает truthy-функцию) ---

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
    draggable: false,
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
  let s = String((n && n._text) || '');
  for (const ch of (n && n.children) || []) s += textOf(ch);
  return s;
}

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

// --- vm-хелперы (дубль tests/shop-zero-stock-000314.test.js) ---

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

function lastOverlay(h) {
  const ch = h.body.children;
  return ch[ch.length - 1];
}

// Сток Бренна по каталогу (assets/npc/000001.json) — живой объект
// (main.js передаёт npcUI.open LIVE-ссылку; здесь — ТЕСТ).
const BRENN_STOCK = () => ({
  wood_sword: 2, iron_sword: 2, steel_sword: 1, short_bow: 2,
  hunting_bow: 1, battle_axe: 1, war_hammer: 1,
});

function openBrennTrade(h, st, stock) {
  const G = h.sandbox.Game;
  const npc = G.NpcData.NPCS.find((n) => n.id === 'weapons_merchant');
  assert.ok(npc, 'NPC weapons_merchant (Бренн) в каталоге');
  const handle = { saves: 0 };
  G.npcUI.open({
    npc,
    character: st.hero,
    book: G.createQuestBook(),
    tile: { x: 1, y: 1, building: { id: 44 }, buildingWealth: 1 },
    day: 1,
    shop: { npc, stock },
    roster: st.roster,
    deadMercs: st.deadMercs,
    onChange: () => { handle.saves += 1; },
  });
  const overlay = lastOverlay(h);
  const tradeTab = overlay.querySelectorAll('button[data-npcact="tab"]')
    .find((b) => b.dataset.tab === 'trade');
  assert.ok(tradeTab, 'вкладка «торговля» на месте');
  overlay.listeners.click[0]({ target: tradeTab });
  return { G, overlay, handle };
}

function click(overlay, btn) {
  assert.ok(btn, 'кнопка для клика найдена');
  assert.ok(!btn.disabled,
    'кнопка активна: ' + btn.dataset.npcact + ' ' + btn.dataset.item);
  overlay.listeners.click[0]({ target: btn });
}

function tradeBtn(overlay, act, item) {
  return findAll(overlay, 'button[data-npcact="' + act + '"]')
    .find((b) => b.dataset.item === item) || null;
}

function colOf(overlay, tok) {
  return findAll(overlay, '.storage-col')
    .find((c) => String(c.className).includes(tok)) || null;
}

function nameLinesOf(root) {
  return findAll(root, '.cp-itemname').map((e) => String(e.textContent));
}

function metaLinesOf(root) {
  return findAll(root, '.cp-itemmeta').map((e) => String(e.textContent));
}

function confirmBlock(overlay) {
  return findAll(overlay, '.trade-confirm')[0] || null;
}

function confirmText(overlay) {
  const b = confirmBlock(overlay);
  if (!b) return null;
  const meta = findAll(b, '.cp-itemmeta')[0];
  return meta ? String(meta.textContent) : null;
}

function confirmBtn(overlay, act) {
  return findAll(overlay, 'button[data-npcact="' + act + '"]')[0] || null;
}

function logText(overlay) {
  const logEl = findAll(overlay, '.npc-log')[0];
  return logEl ? textOf(logEl) : '';
}

function invRowOf(overlay, itemId) {
  const col = colOf(overlay, 'storage-col--inv');
  if (!col) return null;
  return findAll(col, '.cp-itemrow')
    .find((r) => findAll(r, 'button[data-npcact="trade-sell"]')
      .some((b) => b.dataset.item === itemId)) || null;
}

function shopRowOf(overlay, itemId) {
  const col = colOf(overlay, 'storage-col--shop');
  if (!col) return null;
  return findAll(col, '.cp-itemrow')
    .find((r) => findAll(r, 'button[data-npcact="buy"]')
      .some((b) => b.dataset.item === itemId)) || null;
}

// Снимок состояния — JSON-copy (vm-realm → host realm; 000313).
function snapOf(st, stock) {
  return JSON.parse(JSON.stringify({
    gold: st.hero.gold,
    inv: st.hero.inventory,
    stock,
  }));
}

// Фейк drag-события (дубль 000313-S4): getData — ЗАБРОШЕН (реализация
// обязана опираться на внутреннее drag-состояние).
function fakeDragEvent() {
  const calls = { setData: [], preventDefault: 0 };
  const dataTransfer = {
    setData: (type, value) => { calls.setData.push([type, value]); },
    getData: () => {
      throw new Error('000315: getData — защищён в браузере на '
        + 'dragover/drop-валидации — использовать нельзя');
    },
  };
  return {
    e: {
      dataTransfer,
      preventDefault: () => { calls.preventDefault += 1; },
    },
    calls,
    dt: dataTransfer,
  };
}

// ============================================================
// T1. Структура: .storage-cols → 2 .storage-col
// ============================================================

test('000315-T1. «торговля»: .storage-cols с РОВНО 2 .storage-col — слева «Инвентарь» (агрегат hero «×N»), справа «Магазин» (магазин-строки бит-в-бит); «Золото: N» — первый meta ВНЕ колонок', async () => {
  const h = await boot();
  const st = seedWorld(h);
  const stock = BRENN_STOCK();
  const { overlay } = openBrennTrade(h, st, stock);
  const before = h.errors.length;
  const wraps = findAll(overlay, '.storage-cols');
  assert.equal(wraps.length, 1,
    'RED: ровно 1 .storage-cols (переиспользование классов 000313): '
    + wraps.length);
  const cols = findAll(overlay, '.storage-col');
  assert.equal(cols.length, 2, 'RED: ровно 2 .storage-col: ' + cols.length);
  assert.ok(String(cols[0].className).includes('storage-col--inv'),
    'левая колонка — --inv: ' + cols[0].className);
  assert.ok(String(cols[1].className).includes('storage-col--shop'),
    'правая колонка — --shop: ' + cols[1].className);
  assert.deepEqual(nameLinesOf(cols[0]), [],
    'пустой инвентарь hero — 0 строк (без placeholder): '
    + JSON.stringify(nameLinesOf(cols[0])));
  assert.deepEqual(nameLinesOf(cols[1]), [
    'Деревянный меч (ост. 2)', 'Железный меч (ост. 2)',
    'Стальной меч (ост. 1)', 'Короткий лук (ост. 2)',
    'Охотничий лук (ост. 1)', 'Боевой топор (ост. 1)',
    'Боевой молот (ост. 1)',
  ], 'магазин-строки — бит-в-бит (000314-формат): '
    + JSON.stringify(nameLinesOf(cols[1])));
  assert.deepEqual(metaLinesOf(cols[1]), [
    'покупка 10 з / продажа 6 з',
    'покупка 42 з / продажа 24 з',
    'покупка 126 з / продажа 72 з',
    'покупка 32 з / продажа 18 з',
    'покупка 95 з / продажа 54 з',
    'покупка 158 з / продажа 90 з',
    'покупка 263 з / продажа 150 з',
  ], 'магазин-цены — бит-в-бит: ' + JSON.stringify(metaLinesOf(cols[1])));
  const heads = findAll(overlay, '.cp-section')
    .map((e) => String(e.textContent));
  assert.ok(heads.includes('Инвентарь'), 'RED: заголовок «Инвентарь»: '
    + JSON.stringify(heads));
  assert.ok(heads.includes('Магазин'), 'RED: заголовок «Магазин»: '
    + JSON.stringify(heads));
  assert.equal(metaLinesOf(overlay)[0], 'Золото: 100',
    '«Золото» — первый meta ВНЕ колонок: ' + metaLinesOf(overlay)[0]);
  assert.equal(h.errors.length, before,
    '0 новых console.error: ' + h.errors.slice(before).join('; '));
  h.sandbox.Game.npcUI.close();
});

// ============================================================
// T2. Кнопки: старые цёлы + новые «Купить»/«Продать»
// ============================================================

test('000315-T2. кнопки: на магазин-строке СТАРЫЕ «купить»/«продать» (buy/sell — бит-в-бит контракт 000314/B5) + НОВАЯ «Купить» (trade-buy); на инв-строке — «Продать» (trade-sell)', async () => {
  const h = await boot();
  const st = seedWorld(h);
  const stock = BRENN_STOCK();
  const { G, overlay, handle } = openBrennTrade(h, st, stock);
  click(overlay, tradeBtn(overlay, 'buy', 'wood_sword'));
  assert.equal(st.hero.gold, 90, 'покупка старой кнопкой — мутация цела');
  assert.equal(handle.saves, 1, '1 сейв на покупку');
  const buy = findAll(overlay, 'button[data-npcact="buy"]');
  const sell = findAll(overlay, 'button[data-npcact="sell"]');
  const tbuy = findAll(overlay, 'button[data-npcact="trade-buy"]');
  const tsell = findAll(overlay, 'button[data-npcact="trade-sell"]');
  assert.equal(buy.length, 7, 'RED: 7 старых «купить» (все позиции): '
    + buy.length);
  assert.equal(sell.length, 7, 'RED: 7 старых «продать»: ' + sell.length);
  assert.equal(tbuy.length, 7, 'RED: 7 новых «Купить» (trade-buy): '
    + tbuy.length);
  assert.equal(tsell.length, 1, 'RED: 1 «Продать» (trade-sell, инв-строка '
    + 'wood_sword ×1): ' + tsell.length);
  assert.equal(tsell[0] && tsell[0].dataset.item, 'wood_sword');
  assert.ok(G.hasItem(st.hero, 'wood_sword', 1));
  h.sandbox.Game.npcUI.close();
});

// ============================================================
// T4. Подтверждение продажи — побайтовый текст, Да/Нет, stale
// ============================================================

test('000315-T4. «Продать» → подтверждение ПОБАЙТОВНО «Вы хотите продать \'Деревянный меч\' за 6 золота?» (0 мутаций при показе); «Нет» — состояние бит-в-бит + 0 сейвов; «Да» — qty−1, gold+6, лог «Продано: … за 6 з», ровно 1 сейв', async () => {
  const h = await boot();
  const st = seedWorld(h);
  const stock = BRENN_STOCK();
  const { G, overlay, handle } = openBrennTrade(h, st, stock);
  click(overlay, tradeBtn(overlay, 'buy', 'wood_sword'));
  const savesBase = handle.saves;
  click(overlay, tradeBtn(overlay, 'trade-sell', 'wood_sword'));
  assert.equal(confirmText(overlay),
    'Вы хотите продать \'Деревянный меч\' за 6 золота?',
    'RED: текст подтверждения побайтово: ' + confirmText(overlay));
  assert.equal(st.hero.gold, 90, 'показ — 0 мутаций (золото)');
  assert.equal(G.totalQty(st.hero, 'wood_sword'), 1,
    'показ — 0 мутаций (инвентарь)');
  assert.equal(handle.saves, savesBase, 'показ — 0 сейвов');
  assert.ok(confirmBtn(overlay, 'sell-yes'), 'RED: кнопка «Да»');
  assert.ok(confirmBtn(overlay, 'sell-no'), 'RED: кнопка «Нет»');
  const snapshot = snapOf(st, stock);
  click(overlay, confirmBtn(overlay, 'sell-no'));
  assert.deepEqual(snapOf(st, stock), snapshot,
    'RED: «Нет» — состояние бит-в-бит');
  assert.equal(handle.saves, savesBase, 'RED: «Нет» — 0 сейвов');
  assert.ok(!logText(overlay).includes('Продано'),
    '«Нет» — ни одной строки о продаже');
  assert.equal(confirmBlock(overlay), null, '«Нет» — подтверждение снято');
  click(overlay, tradeBtn(overlay, 'trade-sell', 'wood_sword'));
  click(overlay, confirmBtn(overlay, 'sell-yes'));
  assert.equal(st.hero.gold, 96, 'RED: «Да» — gold +6');
  assert.equal(G.totalQty(st.hero, 'wood_sword'), 0,
    'RED: «Да» — qty −1');
  assert.ok(logText(overlay).includes('Продано: Деревянный меч за 6 з'),
    'RED: лог «Продано: Деревянный меч за 6 з»: ' + logText(overlay));
  assert.equal(handle.saves, savesBase + 1, 'RED: ровно 1 сейв на «Да»');
  assert.equal(confirmBlock(overlay), null, '«Да» — подтверждение снято');
  G.npcUI.close();
});

test('000315-T4b. stale-«Да» (предмет снят внешним removeItem при открытом подтверждении) — причина ядра «предмета нет в инвентаре», 0 мутаций, 0 сейвов', async () => {
  const h = await boot();
  const st = seedWorld(h);
  const stock = BRENN_STOCK();
  const { G, overlay, handle } = openBrennTrade(h, st, stock);
  click(overlay, tradeBtn(overlay, 'buy', 'wood_sword'));
  const savesBase = handle.saves;
  click(overlay, tradeBtn(overlay, 'trade-sell', 'wood_sword'));
  assert.ok(confirmBlock(overlay), 'RED: подтверждение открыто');
  G.removeItem(st.hero, 'wood_sword', 1);
  const snapshot = snapOf(st, stock);
  click(overlay, confirmBtn(overlay, 'sell-yes'));
  assert.equal(st.hero.gold, 90, 'RED: stale-«Да» — золото без изменений');
  assert.deepEqual(snapOf(st, stock), snapshot,
    'RED: stale-«Да» — состояние бит-в-бит');
  assert.ok(logText(overlay).includes('предмета нет в инвентаре'),
    'RED: причина ядра в логе: ' + logText(overlay));
  assert.ok(!logText(overlay).includes('Продано'), 'stale — не продажа');
  assert.equal(handle.saves, savesBase, 'RED: stale — 0 сейвов');
  G.npcUI.close();
});

// ============================================================
// T5. dnd-продажа: паритет с кнопкой + no-op
// ============================================================

test('000315-T5. dnd-ПРОДАЖА (инвентарь→магазин): dragstart (setData text/plain=id, effectAllowed move), dragover preventDefault ТОЛЬКО на целевой колонке, drop → ТОТ ЖЕ confirm → «Да» — state/log/сейвы deep-equal кнопке; «Нет» — 0 мутаций/сейвов; drop без dragstart / в свою колонку — no-op', async () => {
  // A — кнопочный эталон
  const ha = await boot();
  const sta = seedWorld(ha);
  const stockA = BRENN_STOCK();
  const oa = openBrennTrade(ha, sta, stockA);
  click(oa.overlay, tradeBtn(oa.overlay, 'buy', 'wood_sword'));
  click(oa.overlay, tradeBtn(oa.overlay, 'trade-sell', 'wood_sword'));
  click(oa.overlay, confirmBtn(oa.overlay, 'sell-yes'));
  const snapA = snapOf(sta, stockA);
  const logA = logText(oa.overlay);
  const savesA = oa.handle.saves;

  // B — dnd
  const hb = await boot();
  const stb = seedWorld(hb);
  const stockB = BRENN_STOCK();
  const ob = openBrennTrade(hb, stb, stockB);
  click(ob.overlay, tradeBtn(ob.overlay, 'buy', 'wood_sword'));
  const row = invRowOf(ob.overlay, 'wood_sword');
  assert.ok(row, 'RED: инв-строка «Деревянный меч ×1»');
  assert.equal(row.draggable, true, 'RED: доступная инв-строка draggable');
  const colInv = colOf(ob.overlay, 'storage-col--inv');
  const colShop = colOf(ob.overlay, 'storage-col--shop');
  assert.ok(colInv && colShop, 'RED: обе колонки');
  const dNo = fakeDragEvent();
  colShop.listeners.drop[0](dNo.e);
  assert.equal(confirmBlock(ob.overlay), null,
    'RED: drop без dragstart — no-op (без подтверждения)');
  assert.ok(Array.isArray(row.listeners.dragstart)
    && row.listeners.dragstart.length >= 1,
    'RED: слушатель dragstart на инв-строке');
  const d1 = fakeDragEvent();
  row.listeners.dragstart[0](d1.e);
  assert.deepEqual(d1.calls.setData, [['text/plain', 'wood_sword']],
    'RED: dragstart — setData("text/plain", id): '
    + JSON.stringify(d1.calls.setData));
  assert.equal(d1.e.dataTransfer.effectAllowed, 'move',
    'RED: dragstart — effectAllowed "move"');
  assert.ok(Array.isArray(colShop.listeners.dragover)
    && colShop.listeners.dragover.length >= 1,
    'RED: слушатель dragover на магазин-колонке');
  const d2 = fakeDragEvent();
  colShop.listeners.dragover[0](d2.e);
  assert.equal(d2.calls.preventDefault, 1,
    'RED: dragover на ЦЕЛЕВОЙ (магазин) — preventDefault');
  const d3 = fakeDragEvent();
  colInv.listeners.dragover[0](d3.e);
  assert.equal(d3.calls.preventDefault, 0,
    'RED: dragover на СВОЕЙ (инвентарь) — без preventDefault');
  const dOwn = fakeDragEvent();
  colInv.listeners.drop[0](dOwn.e);
  assert.equal(confirmBlock(ob.overlay), null,
    'RED: drop в СВОЮ колонку — no-op');
  const savesBase = ob.handle.saves;
  const snapBefore = snapOf(stb, stockB);
  const d4 = fakeDragEvent();
  row.listeners.dragstart[0](d4.e);
  colShop.listeners.drop[0](d4.e);
  assert.equal(confirmText(ob.overlay),
    'Вы хотите продать \'Деревянный меч\' за 6 золота?',
    'RED: drop → ТОТ ЖЕ confirm-текст: ' + confirmText(ob.overlay));
  assert.deepEqual(snapOf(stb, stockB), snapBefore,
    'RED: drop — ещё 0 мутаций (мутация только на «Да»)');
  assert.equal(ob.handle.saves, savesBase, 'drop — 0 сейвов');
  click(ob.overlay, confirmBtn(ob.overlay, 'sell-no'));
  assert.deepEqual(snapOf(stb, stockB), snapBefore,
    'RED: «Нет» после drop — состояние бит-в-бит');
  assert.equal(ob.handle.saves, savesBase, 'RED: «Нет» после drop — 0 сейвов');
  const d5 = fakeDragEvent();
  row.listeners.dragstart[0](d5.e);
  colShop.listeners.drop[0](d5.e);
  click(ob.overlay, confirmBtn(ob.overlay, 'sell-yes'));
  assert.deepEqual(snapOf(stb, stockB), snapA,
    'RED: dnd-продажа deep-equal кнопке: ' + JSON.stringify(snapOf(stb, stockB)));
  assert.equal(logText(ob.overlay), logA, 'тот же лог, что у кнопки');
  assert.equal(ob.handle.saves - savesBase, savesA - 1,
    'тот же счётчик сейвов (1 на подтверждение)');
  ha.sandbox.Game.npcUI.close();
  hb.sandbox.Game.npcUI.close();
});

// ============================================================
// T6. dnd-покупка: БЕЗ подтверждения, паритет с кликом
// ============================================================

test('000315-T6. dnd-ПОКУПКА (магазин→инвентарь): БЕЗ подтверждения; state/log/сейвы deep-equal клику «купить» и клику «Купить»; не хватает золота — отказ по факту кода («мало золота (нужно 10)»), состояние бит-в-бит, 0 сейвов', async () => {
  // A — клики: сначала старая «купить», затем новая «Купить»
  const ha = await boot();
  const sta = seedWorld(ha);
  const stockA = BRENN_STOCK();
  const oa = openBrennTrade(ha, sta, stockA);
  click(oa.overlay, tradeBtn(oa.overlay, 'buy', 'wood_sword'));
  const afterFirst = snapOf(sta, stockA);
  click(oa.overlay, tradeBtn(oa.overlay, 'trade-buy', 'wood_sword'));
  const snapA = snapOf(sta, stockA);
  const logA = logText(oa.overlay);
  assert.equal(sta.hero.gold, 80, 'RED: «Купить» (trade-buy) — та же мутация');
  assert.ok(sta.hero.gold < afterFirst.gold,
    'anti-vacuum: вторая покупка списала золото');
  assert.equal(oa.handle.saves, 2, 'RED: 2 сейва на 2 покупки');

  // B — dnd: два перетаскивания подряд
  const hb = await boot();
  const stb = seedWorld(hb);
  const stockB = BRENN_STOCK();
  const ob = openBrennTrade(hb, stb, stockB);
  const srow = shopRowOf(ob.overlay, 'wood_sword');
  assert.ok(srow, 'RED: магазин-строка «Деревянный меч (ост. 2)»');
  assert.equal(srow.draggable, true, 'RED: магазин-строка draggable');
  const colInv = colOf(ob.overlay, 'storage-col--inv');
  const colShop = colOf(ob.overlay, 'storage-col--shop');
  assert.ok(colInv && colShop, 'RED: обе колонки');
  const d1 = fakeDragEvent();
  srow.listeners.dragstart[0](d1.e);
  const d2 = fakeDragEvent();
  colInv.listeners.dragover[0](d2.e);
  assert.equal(d2.calls.preventDefault, 1,
    'RED: dragover на ЦЕЛЕВОЙ (инвентарь) — preventDefault');
  const d3 = fakeDragEvent();
  colShop.listeners.dragover[0](d3.e);
  assert.equal(d3.calls.preventDefault, 0,
    'RED: dragover на СВОЕЙ (магазин) — без preventDefault');
  colInv.listeners.drop[0](d1.e);
  assert.equal(confirmBlock(ob.overlay), null,
    'RED: покупка — БЕЗ подтверждения');
  const d4 = fakeDragEvent();
  srow.listeners.dragstart[0](d4.e);
  colInv.listeners.drop[0](d4.e);
  assert.deepEqual(snapOf(stb, stockB), snapA,
    'RED: dnd-покупка deep-equal кликам: ' + JSON.stringify(snapOf(stb, stockB)));
  assert.equal(logText(ob.overlay), logA, 'тот же лог, что у кликов');
  assert.equal(ob.handle.saves, 2, 'RED: 2 сейва на 2 dnd-покупки');

  // C — отказ по факту кода: не хватает золота
  const hc = await boot();
  const stc = seedWorld(hc);
  stc.hero.gold = 5;
  const stockC = BRENN_STOCK();
  const oc = openBrennTrade(hc, stc, stockC);
  const srowC = shopRowOf(oc.overlay, 'wood_sword');
  assert.ok(srowC, 'RED: магазин-строка для отказа');
  const colInvC = colOf(oc.overlay, 'storage-col--inv');
  const snapC = snapOf(stc, stockC);
  const savesC = oc.handle.saves;
  const d5 = fakeDragEvent();
  srowC.listeners.dragstart[0](d5.e);
  colInvC.listeners.drop[0](d5.e);
  assert.equal(confirmBlock(oc.overlay), null, 'отказ — без подтверждения');
  assert.ok(logText(oc.overlay).includes('мало золота (нужно 10)'),
    'RED: отказ по факту кода («мало золота (нужно 10)», npc.js): '
    + logText(oc.overlay));
  assert.deepEqual(snapOf(stc, stockC), snapC,
    'RED: отказ — состояние бит-в-бит');
  assert.equal(oc.handle.saves, savesC, 'RED: отказ — 0 сейвов');
  ha.sandbox.Game.npcUI.close();
  hb.sandbox.Game.npcUI.close();
  hc.sandbox.Game.npcUI.close();
});

// ============================================================
// T7. disabled + причина
// ============================================================

test('000315-T7. disabled+причина: «Купить» при gold<buy — disabled+title «мало золота (нужно 126)» (старая «купить» — НЕ дизейблится, контракт текущей кода); «Продать» не-торгуемого (Хлеб) — disabled+title «NPC не скупает такие предметы» + draggable=false', async () => {
  const h = await boot();
  const st = seedWorld(h);
  const stock = BRENN_STOCK();
  const { G, overlay } = openBrennTrade(h, st, stock);
  const steelBuy = tradeBtn(overlay, 'trade-buy', 'steel_sword');
  assert.ok(steelBuy, 'RED: «Купить» (steel_sword) на месте');
  assert.equal(steelBuy.disabled, true,
    'RED: «Купить» disabled (gold 100 < 126)');
  assert.equal(steelBuy.title, 'мало золота (нужно 126)',
    'RED: причина — текст ядра (npc.js): ' + steelBuy.title);
  const oldBuy = tradeBtn(overlay, 'buy', 'steel_sword');
  assert.equal(oldBuy.disabled, false,
    'старая «купить» — НЕ дизейблится (контракт текущей кода)');
  G.addItem(st.hero, 'bread', 1);
  G.npcUI.render();
  const row = invRowOf(overlay, 'bread');
  assert.ok(row, 'RED: инв-строка «Хлеб ×1»');
  const sellBtn = findAll(row, 'button[data-npcact="trade-sell"]')[0];
  assert.ok(sellBtn, 'RED: «Продать» на не-торгуемой строке есть');
  assert.equal(sellBtn.disabled, true,
    'RED: «Продать» не-торгуемого — disabled');
  assert.equal(sellBtn.title, 'NPC не скупает такие предметы',
    'RED: причина — текст ядра (npc.js): ' + sellBtn.title);
  assert.equal(row.draggable, false,
    'RED: не-торгуемая инв-строка — НЕ draggable');
  assert.ok(!Array.isArray(row.listeners.dragstart)
    || row.listeners.dragstart.length === 0,
    'RED: dragstart на не-торгуемой строке НЕ вешается');
  G.npcUI.close();
});

// ============================================================
// T8. Цены/подтверждение — по Торговцу активного (000299.03)
// ============================================================

test('000315-T8. активный merc (Торговец 2): инв-meta «продажа 7 з», подтверждение «…за 7 золота?», «Да» — мутация за hero (+7), gold наёмного undefined (000299.03/000194)', async () => {
  const h = await boot();
  const st = seedWorld(h);
  const mira = h.sandbox.Game.Sheet.createSheet('merc',
    { npcId: 'merc_mira' });
  mira.secondary.merchant = 2;
  st.roster.push({
    npcId: 'merc_mira', level: 1, xp: 0, loyalty: 50, hiredDay: 1,
    sheet: mira,
  });
  h.sandbox.Game.playerUI.setActiveCharId('merc_mira');
  const stock = BRENN_STOCK();
  const { G, overlay, handle } = openBrennTrade(h, st, stock);
  const shopMeta = metaLinesOf(overlay).find((s) =>
    s.startsWith('покупка'));
  assert.equal(shopMeta, 'покупка 9 з / продажа 7 з',
    'RED: цены — по Торговцу активного: ' + shopMeta);
  click(overlay, tradeBtn(overlay, 'trade-buy', 'wood_sword'));
  assert.equal(st.hero.gold, 91, 'RED: покупка по цене merc (9, не 10)');
  const row = invRowOf(overlay, 'wood_sword');
  assert.ok(row, 'RED: инв-строка после покупки');
  const invMeta = findAll(row, '.cp-itemmeta')[0];
  assert.ok(invMeta, 'RED: инв-meta «продажа 7 з»');
  assert.equal(String(invMeta.textContent), 'продажа 7 з',
    'RED: цена продажи в инв-колонке — по активному: '
    + invMeta.textContent);
  click(overlay, tradeBtn(overlay, 'trade-sell', 'wood_sword'));
  assert.equal(confirmText(overlay),
    'Вы хотите продать \'Деревянный меч\' за 7 золота?',
    'RED: подтверждение — по цене активного (7, не 6): '
    + confirmText(overlay));
  click(overlay, confirmBtn(overlay, 'sell-yes'));
  assert.equal(st.hero.gold, 98, 'RED: «Да» — +7 за hero');
  assert.equal(mira.gold, undefined,
    'NaN-ловушка: gold наёмного НЕ тронут');
  assert.ok(logText(overlay).includes('Продано: Деревянный меч за 7 з'),
    'RED: лог по цене merc: ' + logText(overlay));
  assert.equal(handle.saves, 2, '2 сейва: покупка + продажа');
  G.npcUI.close();
  G.playerUI.setActiveCharId(null);
});

// ============================================================
// T9. Регресс 000314 при двух колонках
// ============================================================

test('000315-T9. регресс 000314: покупка последней штуки — магазин-строка исчезает («ост. 0» нет, buy/sell-кнопок wood_sword нет), но в ИНВ-колонке «Деревянный меч ×2» с активной «Продать» → confirm → «Да» (+6 з)', async () => {
  const h = await boot();
  const st = seedWorld(h);
  const stock = BRENN_STOCK();
  const { G, overlay, handle } = openBrennTrade(h, st, stock);
  click(overlay, tradeBtn(overlay, 'buy', 'wood_sword'));
  click(overlay, tradeBtn(overlay, 'buy', 'wood_sword'));
  assert.equal(stock.wood_sword, 0, 'сток 0');
  const shopCol = colOf(overlay, 'storage-col--shop');
  assert.ok(shopCol, 'RED: магазин-колонка есть');
  assert.ok(!nameLinesOf(shopCol).includes('Деревянный меч (ост. 0)'),
    '«ост. 0» не рендерится (000314)');
  assert.ok(!nameLinesOf(shopCol).some((s) =>
    s.startsWith('Деревянный меч (ост. ')),
    'магазин-строка wood_sword ОТСУТСТВУЕТ: '
    + JSON.stringify(nameLinesOf(shopCol)));
  assert.equal(findAll(overlay, 'button[data-npcact="buy"]')
    .filter((b) => b.dataset.item === 'wood_sword').length, 0,
    'старой «купить» (wood_sword) нет');
  assert.equal(findAll(overlay, 'button[data-npcact="sell"]')
    .filter((b) => b.dataset.item === 'wood_sword').length, 0,
    'старой «продать» (wood_sword) нет');
  assert.deepEqual(nameLinesOf(colOf(overlay, 'storage-col--inv')),
    ['Деревянный меч ×2'],
    'RED: инв-колонка — «Деревянный меч ×2» (не позиция стока): '
    + JSON.stringify(nameLinesOf(colOf(overlay, 'storage-col--inv'))));
  const row = invRowOf(overlay, 'wood_sword');
  const tsell = findAll(row, 'button[data-npcact="trade-sell"]')[0];
  assert.equal(tsell.disabled, false, 'RED: «Продать» активна при стоке 0');
  const savesBase = handle.saves;
  click(overlay, tsell);
  assert.equal(confirmText(overlay),
    'Вы хотите продать \'Деревянный меч\' за 6 золота?',
    'RED: confirm при стоке 0 (продаже сток не нужен): '
    + confirmText(overlay));
  click(overlay, confirmBtn(overlay, 'sell-yes'));
  assert.equal(st.hero.gold, 86, 'RED: 100 −10 −10 +6 = 86');
  assert.equal(handle.saves, savesBase + 1);
  G.npcUI.close();
});

// ============================================================
// W. spec-пин модели взаимодействия
// ============================================================

function norm(s) {
  return s.replace(/\s+/g, ' ').toLowerCase();
}

function bulletAt(text, prefix) {
  const i = text.indexOf(prefix);
  assert.notEqual(i, -1, 'spec: буллет «' + prefix + '» не найден');
  const j = text.indexOf('\n * ', i + 1);
  return text.slice(i, j === -1 ? text.length : j);
}

test('000315-W. spec/npc-storage.md буллет «Экран» — модель двух колонок, dnd с подтверждением продажи, покупка без подтверждения, «Купить»/«Продать» + disabled с причиной из src/npc.js (000315)', () => {
  const b = bulletAt(NSTOR, ' * Экран — оверлей диалога');
  assert.ok(norm(b).includes(norm('две колонки: «Инвентарь» (слева)')),
    'буллет «Экран»: модель двух колонок (000315) не зафиксирована');
  assert.ok(norm(b).includes(
    norm('продажа с подтверждением «Вы хотите продать \'имя\' за')),
    'буллет «Экран»: текст подтверждения продажи не зафиксирован');
  assert.ok(norm(b).includes(norm('покупка без подтверждения')),
    'буллет «Экран»: покупка без подтверждения не зафиксирована');
  assert.ok(norm(b).includes(norm('disabled с причиной из `src/npc.js`')),
    'буллет «Экран»: disabled+причина из ядра не зафиксированы');
});

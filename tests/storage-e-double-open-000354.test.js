// Задача 000354: Хранилище [E] — убрать старый интерфейс с лентой
// предметов без прокрутки; кнопка улучшения (цепь 000222).
//
// МЕХАНИЗМ (см. tasks/result/000354.md): двух оверлеев никогда не
// было — buildingUI.open всегда закрывает прежний (building-ui.js
// buildDom → closeDom). «Старый интерфейс» = ОДНОСЛОЙНОЕ [E]-меню,
// раздутое лентой storageMenuRows (по строке «Сложить/Вынуть» на
// каждый слот инвентаря и каждую запись склада): голый
// '.combat-overlay' без overflow → панель выше вьюпорта, обрезана
// без прокрутки; строка «Улучшить…» тонула в ленте («кнопка не
// видна»). Фикс: инициализация ленты ВЫРЕЗАНА (storageMenuRows +
// concat в building-actions.js) — старый DOM не создаётся вообще;
// лента живёт только в двухпанельном оверлее 000313.
//
// КРАСНЫЕ (на базе падают с осмысленным ERR_ASSERTION):
//   * T1 — [E]-меню player-55: ids РОВНО ['storage','upgrade',
//     'demolish'] (на базе туда же вставлены put-*/take-*);
//   * T5 — vm DOM: после [E] в оверлее НЕТ текста «Сложить:»/
//     «Вынуть:» и строк put-*/take-* (на базе лента в DOM).
// ГАРДЫ (зелёные и на базе — фиксируют, что фикс их не ломает):
//   * T2 — панель «Хранилище» владеет лентой (layout/capacity/ids);
//   * T3 — улучшение работает (часть 2 ТЗ: апгрейд был и есть —
//     в [E]-МЕНЮ по 000222, строка 2 после фиксов ленты; ёмкость
//     панели растёт до 60 — одна мутация уровня);
//   * T4 — прямой put через pipeline делегирует спец-у «storage»
//     (ОДНА мутация — контракт S7c/000221, даже без строки в меню);
//   * T6 — vm: после клика «Хранилище» РОВНО ОДИН .combat-overlay
//     с классом combat-overlay--storage и ДВУМЯ .storage-col
//     (анти-«старый слой поверх/под новым»).
//
// Харнессы — копия конвенции 000206 (тесты пинуют свои): node-
// фикстура по образцу tests/city-storage.test.js (fake deps +
// РЕАЛЬНЫЕ cities/buildings/building-effects/building-actions +
// спец-модуль ЯВНО), vm full-chain по образцу building-levels.test.js
// (реальный индекс CHAIN index.html, детерминированный мир).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const C = require('../src/cities.js');
const B = require('../src/buildings.js');
const BE = require('../src/building-effects.js');
const BA = require('../src/building-actions.js');
const IT = require('../src/items.js');
const PLR = require('../src/player.js');

// ============================================================
// node-секция: фикстуры (паттерн tests/city-storage.test.js)
// ============================================================

const STORAGE_MOD = path.join(ROOT, 'src/building-effect-storage.js');
function loadStorageMod() {
  if (!fs.existsSync(STORAGE_MOD)) return null;
  try { return require(STORAGE_MOD); } catch (err) { return null; }
}

function makeOverlayStubs(over = {}) {
  const state = { building: !!over.buildingOpen };
  const calls = { buildingOpen: [] };
  const buildingUI = {
    open: (p) => { state.building = true; calls.buildingOpen.push(p); },
    close: () => { state.building = false; },
    isActive: () => state.building,
  };
  const npcUI = { open: () => {}, close: () => {}, isActive: () => false };
  const combatUI = { isActive: () => false };
  const dungeonUI = { isActive: () => false };
  return { state, calls, buildingUI, npcUI, combatUI, dungeonUI };
}

function makeCityDs(over = {}) {
  const buildings = over.cityContents === undefined
    ? [] : over.cityContents;
  return {
    kind: 'city',
    x: over.x === undefined ? 1 : over.x,
    y: over.y === undefined ? 1 : over.y,
    pos: { x: over.x === undefined ? 1 : over.x,
      y: over.y === undefined ? 1 : over.y },
    contents: null,
    cityContents: buildings === null ? null : { buildings, seed: 9 },
    cityShops: over.cityShops === undefined ? {} : over.cityShops,
    cityWealth: 1,
    name: 'Деревня',
    dg: { width: 4, height: 4, cells: null,
      entrance: { x: 1, y: 3 }, exit: { x: 2, y: 0 } },
  };
}

function makeDeps(over = {}) {
  const o = makeOverlayStubs(over);
  const ds = makeCityDs(over);
  const deps = {
    game: {
      buildingEffects: BE,
      buildingUI: o.buildingUI,
      npcUI: o.npcUI,
      combatUI: o.combatUI,
      dungeonUI: o.dungeonUI,
      getBuilding: (id) => B.getBuilding(id),
      npcForBuilding: (list, bid) =>
        (list || []).find((n) => Array.isArray(n.постройки)
          && n.постройки.includes(bid)) || null,
    },
    clock: { day: 5 },
    hero: { id: 'hero', name: 'Флогистон', gold: 100 },
    questBook: { active: [], done: [] },
    player: { x: 5, y: 7 },
    prevPos: { x: 5, y: 7 },
    npcs: over.npcs === undefined ? [] : over.npcs,
    cityState: () => ds,
    npcShopFor: (id) => ({ npc: null, stock: {} }),
    shopFor: () => null,
    collectSaveData: () => ({}),
    saveNow: () => {},
    flash: () => {},
    buildingOncePerDay: new Map(),
    buffs: [],
    teleports: new Map(),
    buildingQuests: new Map(),
    playerRender: () => {},
    moveHero: () => {},
    startCombat: () => {},
    getMap: () => ((x, y) => ({ x, y, passable: true,
      hasBuilding: false })),
    mover: null,
  };
  return { deps, o, ds };
}

function initStorageFixture(over = {}) {
  const env = makeDeps(over);
  env.ds.dg = C.createCityLayout(100, -40, 5);
  env.hero = PLR.createCharacter();
  env.deps.hero = env.hero;
  env.deps.game.getItem = IT.getItem;
  env.deps.game.hasItem = IT.hasItem;
  env.deps.game.removeItem = IT.removeItem;
  env.deps.game.addItem = IT.addItem;
  env.deps.game.canAddItem = IT.canAddItem;
  env.deps.game.totalQty = IT.totalQty;
  env.deps.game.getBuilding = (id) => B.getBuilding(id);
  env.deps.game.Cities = C;
  const S = loadStorageMod();
  if (S && typeof S.storageHandler === 'function') {
    BA.registerSpecial('storage', S.storageHandler);
  }
  BA.init(env.deps);
  return Object.assign({ BA }, env);
}

function wireCityAnchor(env, ax, ay) {
  env.ds.worldKey = ax + ',' + ay;
  env.deps.getMap = () => (
    ({ tileAt: () => ({ buildingAnchor: [ax, ay] }) }));
  return env;
}

function lastOverlay(t) {
  const list = t.o.calls.buildingOpen;
  return list[list.length - 1];
}

// [E] → клик «Хранилище» → ПАНЕЛЬ (последний payload).
function openPanel(t) {
  const menu = lastOverlay(t);
  const row = menu.actions.find((a) => a.id === 'storage');
  assert.ok(row, 'строка «Хранилище» в [E]-меню');
  menu.onAction({ id: 'storage' });
  return lastOverlay(t);
}

// fixture: player-55 + LIVE record (storage: Сера ×5) + инвентарь
// (Соломенная шляпа ×1, Бревно ×3) — на базе лента = put-0/put-1/
// take-0 прямо в [E]-меню.
function seedMenuFixture(over = {}) {
  const t = initStorageFixture(Object.assign({
    x: 1, y: 1,
    cityContents: [{ x: 1, y: 1, buildingId: 55, player: true }],
  }, over));
  wireCityAnchor(t, 100, -40);
  const cs = new Map([['100,-40', { lastVisitDay: 5, stock: {},
    built: [{ x: 1, y: 1, buildingId: 55, player: true,
      storage: [{ id: 'sulfur', qty: 5 }] }] }]]);
  t.deps.cityStates = cs;
  IT.addItem(t.hero, 'straw_hat', 1);
  IT.addItem(t.hero, 'wood_log', 3);
  const flashes = [];
  t.deps.flash = (m) => { flashes.push(m); };
  let saves = 0;
  t.deps.saveNow = () => { saves += 1; };
  return { t, cs, flashes, getSaves: () => saves };
}

// ============================================================
// T1. [E]-меню player-55 — РОВНО ['storage','upgrade','demolish']
//     (лента put/take из меню ВЫРЕЗАНА — старый слой не создаётся)
// ============================================================

test('000354-T1. [E] player-55 с предметами — ids меню РОВНО [storage, upgrade, demolish]: ни одной put-*/take*-строки («огромная лента без прокрутки» устранена на уровне инициализации); title «хранилище»', () => {
  const { t } = seedMenuFixture();
  t.BA.interactCity();
  assert.equal(t.o.calls.buildingOpen.length, 1, '[E] — меню 55');
  const menu = lastOverlay(t);
  assert.equal(menu.title, 'хранилище', 'title каталога');
  const ids = menu.actions.map((a) => a.id);
  const ribbon = ids.filter((id) => typeof id === 'string'
    && (id.indexOf('put-') === 0 || id.indexOf('take-') === 0));
  assert.deepEqual(ribbon, [],
    'RED: [E]-лента убрана — строки «Сложить/Вынуть» в DOM не '
    + 'создаются вообще (000354); факт: ' + JSON.stringify(ribbon)
    + ' из ' + JSON.stringify(ids));
  assert.deepEqual(ids, ['storage', 'upgrade', 'demolish'],
    'RED: меню = эффект + «Улучшить…» (000222) + «Разобрать»');
});

// ============================================================
// T2. панель «Хранилище» владеет лентой (гард 000313: layout/
//     capacity/ids — лента НЕ потеряна, а переехала в панель)
// ============================================================

test('000354-T2. панель «Хранилище» (после клика строки) — layout "storage", capacity {n,m}, actions put-0/put-1/take-0 бит-в-бит: строки живут ТОЛЬКО в двухпанельном оверлее', () => {
  const { t } = seedMenuFixture();
  t.BA.interactCity();
  const ov = openPanel(t);
  assert.equal(ov.title, 'Хранилище');
  assert.equal(ov.layout, 'storage',
    'RED: панель layout "storage" (000313)');
  assert.deepEqual(ov.capacity, { n: 1, m: 40 },
    'RED: capacity {n,m}: ' + JSON.stringify(ov.capacity));
  assert.deepEqual(ov.actions.map((a) => a.id),
    ['put-0', 'put-1', 'take-0'],
    'лента — В ПАНЕЛИ: ' + JSON.stringify(ov.actions.map((a) => a.id)));
});

// ============================================================
// T3. улучшение (часть 2 ТЗ): строка «Улучшить…» в [E]-МЕНЮ
//     (контракт 000222 R11 — не в панели), onAction — успех,
//     ёмкость панели 40 → 60 (одна мутация уровня)
// ============================================================

test('000354-T3. улучшение Хранилища РАБОТАЕТ (000222): в [E]-меню строка «Улучшить до уровня 2 — 100 з. (Бревно ×2, Каменный обломок ×2)» доступна → onAction: gold 1000→900, исходники списаны, built level:2, flash; ПАНЕЛЬ после — capacity.m 60 (прирост уровня применён)', () => {
  const t = initStorageFixture({
    x: 1, y: 1,
    cityContents: [{ x: 1, y: 1, buildingId: 55, player: true }],
  });
  wireCityAnchor(t, 100, -40);
  const cs = new Map([['100,-40', { lastVisitDay: 5, stock: {},
    built: [{ x: 1, y: 1, buildingId: 55, player: true,
      storage: [{ id: 'sulfur', qty: 5 }] }] }]]);
  t.deps.cityStates = cs;
  const flashes = [];
  t.deps.flash = (m) => { flashes.push(m); };
  t.hero.gold = 1000;
  IT.addItem(t.hero, 'wood_log', 2);
  IT.addItem(t.hero, 'stone_chunk', 2);
  t.BA.interactCity();
  const menu = lastOverlay(t);
  const up = menu.actions.find((a) => a.id === 'upgrade');
  assert.ok(up, 'RED: строка «Улучшить…» в [E]-меню (000222)');
  assert.equal(up.имя,
    'Улучшить до уровня 2 — 100 з. (Бревно ×2, Каменный обломок ×2)',
    'имя строки (L1→2, цена buildCost): ' + up.имя);
  assert.equal(up.доступен, true,
    'RED: апгрейд доступен (золото+материалы) — «кнопка» видна: '
    + (up.reason || ''));
  menu.onAction({ id: 'upgrade' });
  assert.equal(t.hero.gold, 900, 'RED: −100 з.');
  assert.equal(IT.totalQty(t.hero, 'wood_log'), 0, 'Бревно списано');
  assert.equal(IT.totalQty(t.hero, 'stone_chunk'), 0, 'Обломок списан');
  assert.equal(cs.get('100,-40').built[0].level, 2,
    'RED: built level:2');
  assert.ok(flashes.some((m) => m.includes(
    'Улучшено: Хранилище (уровень 2)')),
    'RED: flash апгрейда: ' + JSON.stringify(flashes));
  t.o.buildingUI.close();
  t.BA.interactCity();
  const ov = openPanel(t);
  assert.deepEqual(ov.capacity, { n: 1, m: 60 },
    'RED: ёмкость 60 = 40 + прирост 20×(2−1) (000222 D-C): '
    + JSON.stringify(ov.capacity));
});

// ============================================================
// T4. прямой put через pipeline (меню) — делегирование спец-у
//     (контракт S7c: ОДНА мутация), даже когда строки в меню нет
// ============================================================

test('000354-T4. прямой menu.onAction({id:"put-0"}) — делегирование спец-у «storage» сохранено (000221/S7c): saveNow 1, flash «Сложено: Соломенная шляпа ×1», storage live — без второй мутации', () => {
  const { t, cs, flashes, getSaves } = seedMenuFixture();
  t.BA.interactCity();
  const menu = lastOverlay(t);
  const pre = { saves: getSaves(), n: flashes.length };
  menu.onAction({ id: 'put-0' });
  assert.equal(getSaves(), pre.saves + 1,
    'RED: одна мутация — saveNow ровно 1');
  assert.deepEqual(flashes.slice(pre.n),
    ['Сложено: Соломенная шляпа ×1'],
    'RED: flash переноса: ' + JSON.stringify(flashes));
  assert.deepEqual(cs.get('100,-40').built[0].storage,
    [{ id: 'sulfur', qty: 5 }, { id: 'straw_hat', qty: 1 }],
    'RED: storage live без дубля: '
    + JSON.stringify(cs.get('100,-40').built[0].storage));
});

// ============================================================
// vm full-chain (паттерн tests/building-levels.test.js R14)
// ============================================================

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CHAIN = Array.from(html.matchAll(/<script\s+src="([^"]+)"/g),
  (m) => m[1]).map((p) => p.replace(/^src\//, ''));
const NOW = 1000;
const G_CELL_FLOOR = 1;

function makeGl() {
  const noop = () => {};
  const gl = {
    VERTEX_SHADER: 35633, FRAGMENT_SHADER: 35732,
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
  let s = String(n.textContent || '');
  for (const ch of n.children || []) s += textOf(ch);
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

function bootSandbox(existingStorage) {
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
  const storage = existingStorage || makeStorage();
  const body = makeEl('body');
  const document = {
    createElement: (tag) => makeEl(tag),
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
  for (const f of CHAIN) {
    vm.runInContext(
      fs.readFileSync(path.join(ROOT, 'src', f), 'utf8'), sandbox,
      { filename: f });
  }
  return { sandbox, winListeners, raf, errors, body, hud };
}

const drain = () => new Promise((r) => setImmediate(r));

async function bootChain(existingStorage) {
  const h = bootSandbox(existingStorage);
  await drain();
  await drain();
  await drain();
  const g = h.sandbox.__game;
  assert.ok(g, 'globalThis.__game выставлен (main.js выполнен)');
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет (порядок цепочки): ' + h.errors.join('; '));
  h.frameFn = h.raf[h.raf.length - 1];
  return h;
}

function key(h, code, extra = {}) {
  const e = Object.assign(
    { code, preventDefault() {}, stopPropagation() {} }, extra);
  for (const fn of (h.winListeners['keydown'] || []).slice()) fn(e);
  return e;
}

function keyup(h, code, extra = {}) {
  const e = Object.assign({ code }, extra);
  for (const fn of (h.winListeners['keyup'] || []).slice()) fn(e);
  return e;
}

function keydownFor(dx, dy) {
  return dx === 1 ? 'ArrowRight' : dx === -1 ? 'ArrowLeft'
    : dy === 1 ? 'ArrowDown' : 'ArrowUp';
}

function press(h, code) {
  return key(h, code);
}

function release(h, code) {
  return keyup(h, code);
}

function walkTiles(h, now, tiles) {
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  for (const [tx, ty] of tiles) {
    const dx = tx - g.state.player.x, dy = ty - g.state.player.y;
    assert.ok(Math.abs(dx) + Math.abs(dy) === 1,
      'BFS: шаг по соседнему тайлу');
    const code = keydownFor(dx, dy);
    press(h, code);
    let guard = 0;
    do {
      now += 200;
      h.frameFn(now);
    } while ((g.state.player.x !== tx || g.state.player.y !== ty)
      && ++guard < 10);
    release(h, code);
    assert.equal(g.state.player.x, tx,
      'сценарий: игрок перешёл на (' + tx + ', ' + ty + ') — x');
    assert.equal(g.state.player.y, ty,
      'сценарий: игрок перешёл на (' + tx + ', ' + ty + ') — y');
    if (G.combatUI.isActive()) {
      const c = G.combatUI.current();
      for (const m of c.units.filter((x) => x.side === 'mob'
          && x.alive)) {
        G.combatInternals.dealDamageToMob(c, m, 9999);
      }
      assert.ok(c.result && c.result.outcome === 'victory',
        'zone-бой по маршруту — победа');
      G.combatUI.handleCode('Space');
      assert.equal(G.combatUI.isActive(), false,
        'zone-бой закрыт (Space)');
    }
  }
  for (let i = 0; i < 4; i++) {
    now += 200;
    h.frameFn(now);
  }
  return now;
}

function findTile(G, myMap, start, isTarget, radius = 700) {
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const startKey = start.x + ',' + start.y;
  const visited = new Set([startKey]);
  const prev = new Map();
  let frontier = [start];
  for (let depth = 0; depth < radius && frontier.length; depth++) {
    const next = [];
    for (const cur of frontier) {
      for (const [dx, dy] of DIRS) {
        const nx = cur.x + dx, ny = cur.y + dy;
        const k = nx + ',' + ny;
        if (visited.has(k)) continue;
        const t = myMap.tileAt(nx, ny);
        if (!t.passable || t.hasMobGroup) continue;
        visited.add(k);
        prev.set(k, cur.x + ',' + cur.y);
        if (isTarget(t)) {
          const steps = [];
          let kk = k;
          while (kk !== startKey) {
            const [px, py] = kk.split(',').map(Number);
            steps.unshift([px, py]);
            kk = prev.get(kk);
          }
          return { tile: t, steps };
        }
        if (t.hasBuilding) continue;
        next.push({ x: nx, y: ny });
      }
    }
    frontier = next;
  }
  return null;
}

function findCityFor(G, myMap, start, pred, radius = 700) {
  let info = null;
  const isCityTile = (t) => {
    if (!t.hasBuilding || t.building !== G.BUILDING_TYPES.NONE) return false;
    const rec = G.getBuilding(t.buildingId);
    if (!rec || rec.категория !== 'город') return false;
    const fp = rec.размер.ширина;
    const [ax, ay] = t.buildingAnchor;
    const layout = G.Cities.createCityLayout(ax, ay, fp);
    const contents = G.Cities.generateCityContents(layout, ax, ay,
      rec, t.buildingWealth);
    const i = { fp, rec, layout, contents, ax, ay,
      wealth: t.buildingWealth, tile: t };
    if (pred(i) === true) info = i;
    return info !== null;
  };
  const r = findTile(G, myMap, start, isCityTile, radius);
  return r ? Object.assign({ tile: r.tile, steps: r.steps }, info) : null;
}

function freeCityCell(info) {
  const d = info.layout;
  const occupied = new Set(
    (info.contents ? info.contents.buildings : [])
      .map((b) => b.x + ',' + b.y));
  for (let y = 1; y < d.height - 1; y++) {
    for (let x = 1; x < d.width - 1; x++) {
      if (x === d.entrance.x && y === d.entrance.y) continue;
      if (d.cells[y * d.width + x] !== G_CELL_FLOOR) continue;
      if (occupied.has(x + ',' + y)) continue;
      return { x, y };
    }
  }
  return null;
}

function safeWorldNeighbor(G, myMap, from) {
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (const [dx, dy] of DIRS) {
    const t = myMap.tileAt(from.x + dx, from.y + dy);
    if (!t.passable || t.hasMobGroup || t.hasBuilding) continue;
    return [from.x + dx, from.y + dy];
  }
  return null;
}

function cityStepsTo(from, tx, ty) {
  const steps = [];
  const vy = ty < from.y ? -1 : 1;
  for (let y = from.y + vy; y !== ty + vy; y += vy) steps.push([from.x, y]);
  const hx = tx < from.x ? -1 : 1;
  for (let x = from.x + hx; x !== tx + hx; x += hx) steps.push([x, ty]);
  return steps;
}

function walkCity(h, steps) {
  const g = h.sandbox.__game;
  for (const [tx, ty] of steps) {
    const dx = tx - g.dungeon.x, dy = ty - g.dungeon.y;
    assert.ok(Math.abs(dx) + Math.abs(dy) === 1,
      'город: шаг по соседней клетке');
    const code = keydownFor(dx, dy);
    press(h, code);
    release(h, code);
    assert.ok(g.dungeon, 'в городе (не вышел)');
    assert.equal(g.dungeon.x, tx, 'город: шаг x (' + tx + ',' + ty + ')');
    assert.equal(g.dungeon.y, ty, 'город: шаг y (' + tx + ',' + ty + ')');
  }
}

function buildingOverlayOf(h) {
  const ovs = findAll(h.body, '.combat-overlay').filter((o) =>
    !String(o.className).includes('npc-overlay') &&
    !String(o.className).includes('dungeon-overlay'));
  return ovs[ovs.length - 1] || null;
}

// Узлы buildingUI-оверлеев: dungeon-overlay (городской слой входа/
// выхода — своя подсистема) и npc-overlay в счёт не идут.
function overlayNodes(h) {
  return findAll(h.body, '.combat-overlay').filter((o) =>
    !String(o.className).includes('npc-overlay') &&
    !String(o.className).includes('dungeon-overlay'));
}

function findRow(overlay, id) {
  return findAll(overlay, '[data-buid]')
    .find((r) => r.dataset.buid === id) || null;
}

function seedSlot(g, id, qty) {
  const slots = g.state.hero.inventory;
  assert.ok(Array.isArray(slots), 'инвентарь — живой массив слотов');
  for (let i = 0; i < qty; i++) slots.push({ id, qty: 1 });
  return slots;
}

function qtyOf(g, id) {
  return (g.state.hero.inventory || [])
    .filter((e) => e && e.id === id)
    .reduce((s, e) => s + (e.qty || 0), 0);
}

// Сценарий: boot → город (fp>=2, свободная клетка, безопасный
// сосед) → build-55 (100 з. + Бревно×2 + Каменный обломок×2 —
// старт 100 з.) → сиd инвентаря (лента на базе обязана проявиться).
async function bootBuiltStorage() {
  const storage = makeStorage();
  const h = await bootChain(storage);
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  const myMap = G.createMap(G.generateSeedPixels());
  const found = findCityFor(G, myMap, g.state.player,
    (c) => c.fp >= 2 && freeCityCell(c) !== null
      && safeWorldNeighbor(G, myMap, c.tile) !== null);
  assert.ok(found,
    'сценарий: город (fp>=2) со свободной клеткой + безопасным соседом');
  walkTiles(h, NOW, found.steps);
  const dg = g.dungeon;
  assert.ok(dg && dg.kind === 'city', 'в городе (авто-вход)');
  const target = freeCityCell(found);
  seedSlot(g, 'wood_log', 2);
  seedSlot(g, 'stone_chunk', 2);
  walkCity(h, cityStepsTo({ x: dg.x, y: dg.y }, target.x, target.y));
  key(h, 'KeyE');
  const ovB = buildingOverlayOf(h);
  const row55 = findRow(ovB, 'build-55');
  assert.ok(row55, 'строка build-55 в меню «Строительство»');
  ovB.listeners.click[0]({ target: row55 });
  assert.equal(g.state.hero.gold, 0, 'gold 100 → 0 (цена 55)');
  const anchor = found.ax + ',' + found.ay;
  assert.deepEqual(
    JSON.parse(JSON.stringify(g.cities[anchor].built)),
    [{ x: target.x, y: target.y, buildingId: 55, player: true }],
    'built — запись 55 (player)');
  // Инвентарь ПОСЛЕ стройки: предмет — на базе [E] обязан родить
  // put-ленту в оверлей (то, что фикс устраняет).
  seedSlot(g, 'bread', 2);
  return { h, g, G, anchor };
}

// ============================================================
// T5. vm RED: [E] на построенном 55 — оверлей БЕЗ ленты (ни
//     текста, ни строк put/take); ровно 3 строки действий
// ============================================================

test('000354-T5. vm [E] player-55 (инвентарь не пуст) — в оверлее НЕТ «Сложить:»/«Вынуть:» и put-*/take-* строк, ровно 3 [data-buid] (storage/upgrade/demolish): старая инициализация ленты НЕ создаёт DOM', async () => {
  const { h } = await bootBuiltStorage();
  key(h, 'KeyE');
  const ov = buildingOverlayOf(h);
  assert.ok(ov, '[E] — оверлей построенного 55');
  const txt = textOf(ov);
  assert.ok(!txt.includes('Сложить:'),
    'RED: лента «Сложить:» в [E]-оверлее недопустима (000354): '
    + txt.slice(0, 400));
  assert.ok(!txt.includes('Вынуть:'),
    'RED: лента «Вынуть:» в [E]-оверлее недопустима (000354): '
    + txt.slice(0, 400));
  assert.equal(findRow(ov, 'put-0'), null,
    'RED: put-строка в [E] не создаётся');
  assert.equal(findRow(ov, 'take-0'), null,
    'RED: take-строка в [E] не создаётся');
  assert.equal(findAll(ov, '[data-buid]').length, 3,
    'RED: меню = РОВНО 3 строки (лента вырезана): '
    + findAll(ov, '[data-buid]')
      .map((r) => r.dataset.buid).join(','));
  assert.ok(findRow(ov, 'storage'), 'строка «Хранилище»');
  assert.ok(findRow(ov, 'upgrade'),
    'RED (часть 2): «Улучшить…» — строка 2 видима (лента не тонет)');
  assert.ok(findRow(ov, 'demolish'), 'строка «Разобрать»');
});

// ============================================================
// T6. vm: клик «Хранилище» — ОДИН оверлей combat-overlay--storage
//     с двумя .storage-col (лента — внутри панелей); второй слой
//     не появляется
// ============================================================

test('000354-T6. vm: клик «Хранилище» — РОВНО ОДИН .combat-overlay (--storage) с 2×.storage-col, put-строка только в панели; второй слой/старая лента отсутствуют', async () => {
  const { h } = await bootBuiltStorage();
  key(h, 'KeyE');
  const ovM = buildingOverlayOf(h);
  const rowSt = findRow(ovM, 'storage');
  assert.ok(rowSt, 'строка «Хранилище» (эффект)');
  ovM.listeners.click[0]({ target: rowSt });
  const nodes = overlayNodes(h);
  assert.equal(nodes.length, 1,
    'RED: ОДИН оверлей (старый слой не со-существует): '
    + nodes.map((o) => o.className).join(' | '));
  const ov = nodes[0];
  assert.ok(String(ov.className).includes('combat-overlay--storage'),
    'RED: класс --storage: ' + ov.className);
  assert.equal(findAll(ov, '.storage-col').length, 2,
    'RED: ровно 2 панели (инвентарь | склад)');
  const txt = textOf(ov);
  assert.ok(txt.includes('Инвентарь'), 'заголовок «Инвентарь»');
  assert.ok(txt.includes('Склад (0/40)'),
    'заголовок «Склад (0/40)»: ' + txt.slice(0, 300));
  assert.ok(txt.includes('Сложить:'),
    'лента ЖИВЁТ В ПАНЕЛИ (перенос 000313, не потеряна)');
  assert.ok(findRow(ov, 'put-0'), 'put-0 в панели');
});

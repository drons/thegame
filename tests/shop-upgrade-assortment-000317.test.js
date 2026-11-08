// Задача 000317 — улучшение постройки с магазином: ассортимент
// детерминированно РАСШИРЯЕТСЯ уровнем (ТЗ tasks/pending/000317.md;
// контракт memory/000317-shop-assortment-upgrade.md).
//
// Контракт (по ФАКТУ КОДА — сид-цепочка makeShop/cities.makeCityShop,
// 000108/000222):
//  * ⊇-контракт уровня: stock(уровень N+1) ⊇ stock(уровень N) (ключи) и
//    количества не меньше — детерминированно, при том же сиде; строгий
//    рост — пока пул видов лавки не покрыт (верхняя граница — полное
//    покрытие пула, documented в спеке/памяти);
//  * РЕГРЕСС: магазин БЕЗ улучшения (level отсутствует/1/мусор) —
//    бит-в-бит прежняя генерация (сид-цепочка не сдвинута, 0 новых
//    RNG-вызовов на не-улучшенном пути); сид лагеря — не тронут;
//  * стабильность: повторный вызов — тот же сток; реестр shopLevels ≡
//    явный level;
//  * цены: улучшением ВНЕ существующих wealth-множителей НЕ меняются
//    (формула it.value × (1 ∓ WEALTH_MULT·wealth) — 000322/000299.03);
//  * расширение видно на экране магазина (вкладка «Магазин» [I]-панели
//    — data-driven от shop.stock, ui-tab-shop.js 0-diff).
//
// КРАСНЫЕ на RED-стадии (осмысленные ERR_ASSERTION с дампами, не краш
// загрузки): T1 (⊇/strict — 5-й аргумент makeShop игнорируется,
// effWealth-механизм 000222 НЕ даёт вложенности множеств: на шаге
// богатства поток перекашивается → ⊇/qty/strict-ноги красные), T5 (на
// экране новых строк после уровня нет), T6 (spec-игла правила
// отсутствует). ЗЕЛЁНЫЕ с первого запуска (страховочные регресс-пины):
// T2 (бит-в-бит 4-арг./6-арг. + level-мусор + camp-сид), T3
// (детерминизм/реестр), T4 (цены), seed-инвариантность по level.
//
// expectedRedCount (файл) = 3 (T1, T5, T6).
//
// Раунд 1 фиксера (аудит-блокер): fallback × expansion — при пустом
// потоке (достижимо при богатстве 0/1 на малых пулах видов) L1 =
// fallback {pool[0].id: 1}, а в префиксере непустой expansion при L≥2
// глушил fallback → строка pool[0] ТЕРЯЛАСЬ при улучшении (контрпример
// (1082,5771,bt2,w0): L1={minor_healing:1} → L2={bread:1}). Фикс:
// guaranteed-строка пула видов мержится при L≥2 ДО expansion (L=1 —
// бит-в-бит); страж — T7 (красная против префиксера: ⊇-нога на координате
// класса + свип «stock(L) ⊇ stock(1)» по fallback-классу).
//
// Раунд 2 фиксера (аудит-блокер): условный fallback «потоки пусты»
// НЕинвариантен по L — на городском пути cities поднимает effWealth с
// уровнем, непустой поток нового богатства глушил условие, и fallback-
// ключ терялся на ШАГЕ БОГАТСТВА (не только на пересечении с expansion):
// контрпримеры (0,1,bt2,w0), (−34,48,bt2,w0), (−54,51,bt2,w0) —
// minor_healing исчезает L2→L3; брутфорс 120×120×bt{0,1,2,3,11}×w{0,1}
// давал 32 события потери. Фикс: при L≥2 ВСЕГДА мержится гарантированная
// строка kindPool[0] (количество 1, max-слияние) — не зависит от богатства
// и непустоты потоков; страж — T8 (красная против кода раунда 1: ⊇/qty
// по ЦЕПОЧКЕ effWealth min(3,w+floor((L−1)/2)), L=1..7 — пин координат
// класса + свип). T7 остаётся зелёной (её координата при фиксированном
// богатстве).
//
// Ре-пины В ЗЕЛЁНОЙ ЧАСТИ суэта (этот же коммит): building-levels R6
// (deepEqual l7-стока с 4-арг. makeShop → ⊇ базы + строгое расширение +
// deepEqual makeShop(...,7)) и R15 (fresh-ожидание makeShop(x,y,0,3) →
// makeShop(x,y,0,3,5)).
//
// vm-песочница — цепочка index.html БЕЗ main.js (паттерн
// tests/shop-zero-stock-000314.test.js: точку __game ставит ТЕСТ).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const I = require('../src/items.js');
const C = require('../src/cities.js');
const perlin = require('../src/perlin.js');
const { createCharacter } = require('../src/player.js');

const ROOT = path.join(__dirname, '..');
const BUILDINGS = fs.readFileSync(
  path.join(ROOT, 'spec', 'buildings.md'), 'utf8');

const NOW = 1000;

// Фиксированные координаты (город (500,−100) клетка (2,3) — Оружейная
// id 1 (map_index 0); город (−114,−119) клетка (5,7) — Таверна id 44
// (map_index 11)); координаты makeShop — офсет CITY_SHOP_CELL_BASE=256
// (GOLDEN 000108). Ассерты ДИНАМИЧЕСКИЕ (⊇/strict по стокам) — без
// канареек счёта каталога (000333 его растит).
const CITY = { cx: 500, cy: -100, tx: 2, ty: 3, bid: 1 };
const TAV = { cx: -114, cy: -119, tx: 5, ty: 7, bid: 44 };
const SX = 500 * 256 + 2;
const SY = -100 * 256 + 3;
const TX = -114 * 256 + 5;
const TY = -119 * 256 + 7;

function baseSeed(x, y, mapIndex) {
  return (perlin.hash2(x, y, 0x154075) ^ (mapIndex + 1)) >>> 0;
}

function stockKeysOf(shop) {
  return Object.keys(shop.stock);
}

// ⊇-нога: ключи предка ⊆ потомка И количества не меньше.
function assertSuperset(prev, next, label) {
  const missing = stockKeysOf(prev).filter((id) => !(id in next.stock));
  const drops = stockKeysOf(prev)
    .filter((id) => next.stock[id] < prev.stock[id]);
  assert.deepEqual(missing, [],
    label + ': ключи уровня N ⊆ уровня N+1, пропало: ' +
    JSON.stringify(missing));
  assert.deepEqual(drops, [],
    label + ': количества не убывают, упало: ' + JSON.stringify(
      drops.map((id) => id + ': ' + prev.stock[id] + '→' + next.stock[id])));
}

// ============================================================
// T1. ⊇/strict-контракт уровня + сид без level + ⊇ базовой генерации
// ============================================================

test('000317-T1. ассортимент строго шире с уровнем: makeCityShop и makeShop(5-й аргумент level) — ⊇ ключей и qty на каждом шаге L→L+1 (L=1..6), строгий рост суммарно и не менее 3 шагов; сид идентичен для всех L и ≡ базовой формуле (level НЕ в сиде); stock(L) ⊇ не-улучшенного магазина', () => {
  const full = [
    ['city w1', (L) => C.makeCityShop(CITY.cx, CITY.cy, CITY.tx, CITY.ty, CITY.bid, 1, L), SX, SY, 0],
    ['city w0', (L) => C.makeCityShop(CITY.cx, CITY.cy, CITY.tx, CITY.ty, CITY.bid, 0, L), SX, SY, 0],
    ['city w2', (L) => C.makeCityShop(CITY.cx, CITY.cy, CITY.tx, CITY.ty, CITY.bid, 2, L), SX, SY, 0],
    ['tavern w0', (L) => C.makeCityShop(TAV.cx, TAV.cy, TAV.tx, TAV.ty, TAV.bid, 0, L), TX, TY, 11],
    ['direct w1', (L) => I.makeShop(SX, SY, 0, 1, L), SX, SY, 0],
    ['direct w2', (L) => I.makeShop(SX, SY, 0, 2, L), SX, SY, 0],
  ];
  for (const [name, mk, x, y, mi] of full) {
    let strictSteps = 0;
    for (let L = 1; L <= 6; L++) {
      const a = mk(L);
      const b = mk(L + 1);
      assert.ok(a && b, name + ': магазин есть');
      assertSuperset(a, b, name + ' L' + L + '→L' + (L + 1));
      if (stockKeysOf(b).length > stockKeysOf(a).length) strictSteps++;
      assert.equal(b.seed, baseSeed(x, y, mi),
        name + ': seed ≡ базовой формуле (hash2(x,y,0x154075)^(map+1)), ' +
        'level НЕ входит в сид');
    }
    const first = mk(1);
    const last = mk(7);
    assert.ok(stockKeysOf(last).length > stockKeysOf(first).length,
      'RED ' + name + ': L7 строго шире L1: ' +
      stockKeysOf(first).length + ' vs ' + stockKeysOf(last).length);
    assert.ok(strictSteps >= 3,
      'RED ' + name + ': строгий рост минимум на 3 из 6 шагов ' +
      '(расширение уровнем), шагов: ' + strictSteps);
  }
  // Универсам (базовое богатство 3): ⊇/qty — всегда; суммарный рост —
  // есть; поштучная строгость шага ограничена покрытием пула.
  const sat = [
    ['city w3', (L) => C.makeCityShop(CITY.cx, CITY.cy, CITY.tx, CITY.ty, CITY.bid, 3, L), SX, SY, 0],
    ['direct w3', (L) => I.makeShop(SX, SY, 0, 3, L), SX, SY, 0],
  ];
  for (const [name, mk, x, y, mi] of sat) {
    for (let L = 1; L <= 6; L++) {
      assertSuperset(mk(L), mk(L + 1), name + ' L' + L + '→L' + (L + 1));
      assert.equal(mk(L).seed, baseSeed(x, y, mi),
        name + ': seed не зависит от level');
    }
    assert.ok(stockKeysOf(mk(7)).length > stockKeysOf(mk(1)).length,
      'RED ' + name + ': L7 строго шире L1');
  }
  // stock(L) ⊇ НЕ улучшенного магазина (4-арг.) — ключи и количества.
  const legs = [
    ['direct w1 base', I.makeShop(SX, SY, 0, 1), (L) => I.makeShop(SX, SY, 0, 1, L)],
    ['direct w2 base', I.makeShop(SX, SY, 0, 2), (L) => I.makeShop(SX, SY, 0, 2, L)],
    ['city w1 base', I.makeShop(SX, SY, 0, 1), () => C.makeCityShop(CITY.cx, CITY.cy, CITY.tx, CITY.ty, CITY.bid, 1, 7)],
    ['city w0 base', I.makeShop(SX, SY, 0, 0), () => C.makeCityShop(CITY.cx, CITY.cy, CITY.tx, CITY.ty, CITY.bid, 0, 7)],
  ];
  for (const [name, base, mk] of legs) {
    for (const L of [2, 3, 5, 7]) {
      assertSuperset(base, mk(L), name + ' ⊆ L' + L);
    }
  }
});

// ============================================================
// T2. РЕГРЕСС: не-улучшенный магазин — бит-в-бит (сид-цепочка цела)
// ============================================================

// Литералы сняты с кода ДО задачи (RED-коммит 000317): детерминизм
// 4-арг. makeShop — семантика «как до изменения».
const GOLDEN_MAKESHOP = {
  '10,20,2,1': {
    stock: { healing_potion: 3, greater_healing: 3, mana_potion: 2, mana_elixir: 3, bread: 1, meat: 2 },
    seed: baseSeed(10, 20, 2),
  },
};

test('000317-T2. РЕГРЕСС бит-в-бит: 4-арг. makeShop — прежний сток/сид (литералы ДО задачи); 5-й аргумент level=1/0/мусор ≡ 4-арг.; 6-арг. makeCityShop ≡ прежнему; сид лагеря не тронут; сид-формула не зависит от level', () => {
  const g = GOLDEN_MAKESHOP['10,20,2,1'];
  const s = I.makeShop(10, 20, 2, 1);
  assert.deepEqual(s.stock, g.stock, '4-арг. makeShop — бит-в-бит (литерал до задачи)');
  assert.equal(s.seed, g.seed, 'сид — базовая формула');
  for (const junk of [undefined, null, 0, 1, -3, 2.5, 'x', NaN]) {
    assert.deepEqual(I.makeShop(10, 20, 2, 1, junk), s,
      'level ' + String(junk) + ' — не-уровень ≡ 4-арг. (бит-в-бит)');
  }
  // Страж не-улучшенного пути: на точках, где expansion видим (L2
  // добавляет ключ сверх потока), 4-арг. сток СТРОГО уже L2 — если
  // мутация подмешивает расширение при L=1, точки становятся равны.
  // (Точка золотого литерала выше expansion-поглощена потоком — для
  // этого стража она слепая; точки перепикинуются при росте каталога.)
  // 000321.01: точка (-5,9) стала слепой (+50 оружия: расширение
  // поглощено потоком, 57≡57) — перепикинована на (-4,9) (47→48).
  for (const [px, py, pbt, pw] of [[0, 0, 0, 0], [-4, 9, 0, 1]]) {
    const base = I.makeShop(px, py, pbt, pw);
    const up = I.makeShop(px, py, pbt, pw, 2);
    assert.ok(Object.keys(up.stock).length > Object.keys(base.stock).length,
      'не-улучшенный (' + px + ',' + py + ') без расширения: L2 строго шире, ' +
      Object.keys(base.stock).length + ' vs ' + Object.keys(up.stock).length);
    assertSuperset(base, up, 'точка-страж ⊇');
  }
  // 6-арг. makeCityShop — прежняя семантика (seed — литерал формулы).
  const c6 = C.makeCityShop(CITY.cx, CITY.cy, CITY.tx, CITY.ty, CITY.bid, 1);
  assert.equal(c6.seed, baseSeed(SX, SY, 0), '6-арг. сид — базовая формула');
  assert.deepEqual(c6, C.makeCityShop(CITY.cx, CITY.cy, CITY.tx, CITY.ty, CITY.bid, 1, 1),
    'level 1 ≡ 6-арг. (бит-в-бит)');
  for (const junk of [undefined, null, 0, 8, 2.5, 'x']) {
    assert.deepEqual(
      C.makeCityShop(CITY.cx, CITY.cy, CITY.tx, CITY.ty, CITY.bid, 1, junk),
      c6, 'level-мусор ' + String(junk) + ' ≡ 6-арг. (реестр чист)');
  }
  // Барахолка лагеря — своей сигнатуры/сида (level не принимает).
  const B = require('../src/buildings.js');
  assert.equal(I.makeCampShop.length, 5, 'makeCampShop — 5 аргументов');
  const camp = I.makeCampShop(5, 7, 3, 1, B.getBuilding(47));
  assert.equal(camp.seed,
    (perlin.hash2(5, 7, I.CAMP_STOCK_SEED) ^ ((3 + 1) * 0x9E3779B9)) >>> 0,
    'сид лагеря — прежняя формула (CAMP_STOCK_SEED, по дню)');
});

// ============================================================
// T3. Стабильность (та же «сессия» — тот же ассортимент)
// ============================================================

test('000317-T3. стабильность: двойной вызов бит-в-бит (L=1..7, город и makeShop); реестр shopLevels ≡ явный level (тот же сток/сид/wealth)', () => {
  for (const L of [1, 2, 3, 4, 5, 6, 7]) {
    assert.deepEqual(
      C.makeCityShop(CITY.cx, CITY.cy, CITY.tx, CITY.ty, CITY.bid, 1, L),
      C.makeCityShop(CITY.cx, CITY.cy, CITY.tx, CITY.ty, CITY.bid, 1, L),
      'makeCityShop L' + L + ' — повторный вызов идентичен');
    assert.deepEqual(I.makeShop(SX, SY, 0, 1, L),
      I.makeShop(SX, SY, 0, 1, L),
      'makeShop L' + L + ' — повторный вызов идентичен');
  }
  C.setShopLevel(CITY.cx, CITY.cy, CITY.tx, CITY.ty, 5);
  const viaReg = C.makeCityShop(CITY.cx, CITY.cy, CITY.tx, CITY.ty, CITY.bid, 1);
  const explicit = C.makeCityShop(CITY.cx, CITY.cy, CITY.tx, CITY.ty, CITY.bid, 1, 5);
  assert.deepEqual(viaReg, explicit,
    'реестр level 5 ≡ явный level 5 (тот же ассортимент — новая ' +
    'сессия после апгрейда даёт тот же сток)');
  C.setShopLevel(CITY.cx, CITY.cy, CITY.tx, CITY.ty, 0);
});

// ============================================================
// T4. Цены: улучшением вне существующих множителей НЕ меняются
// ============================================================

test('000317-T4. цены: пары уровней с равным effWealth — карты buy/sell идентичны по всему стоку; формула it.value×(1∓wealth-множитель) без новых множителей; расширение membership на цену не влияет', () => {
  const c = createCharacter();
  const priceMap = (shop) => {
    const m = {};
    for (const id of Object.keys(shop.stock)) {
      m[id] = [I.buyPrice(shop, id, c), I.sellPrice(shop, id, c)];
    }
    return m;
  };
  const pairs = [
    [1, 2, 1], [3, 4, 1], [5, 6, 1],
    [1, 2, 0], [3, 4, 0],
  ];
  for (const [la, lb, w] of pairs) {
    const a = C.makeCityShop(CITY.cx, CITY.cy, CITY.tx, CITY.ty, CITY.bid, w, la);
    const b = C.makeCityShop(CITY.cx, CITY.cy, CITY.tx, CITY.ty, CITY.bid, w, lb);
    assert.equal(a.wealth, b.wealth, 'пара L' + la + '/L' + lb + ' w' + w + ' — равное богатство');
    for (const id of Object.keys(a.stock)) {
      assert.deepEqual(priceMap(a)[id], priceMap(b)[id],
        'цена ' + id + ' на L' + la + ' = L' + lb + ' (богатство равно)');
    }
  }
  // Формула (000322 канон): buy = value×(1−0.10·wealth), sell =
  // value×(1+0.15·wealth) — «Торговец» 0 (createCharacter).
  const shop = C.makeCityShop(CITY.cx, CITY.cy, CITY.tx, CITY.ty, CITY.bid, 1, 3);
  for (const id of Object.keys(shop.stock)) {
    const it = I.getItem(id);
    assert.equal(I.buyPrice(shop, id, c),
      Math.max(1, Math.round(it.value * (1 - 0.10 * shop.wealth))),
      'buy ' + id + ' — формула без новых множителей');
    assert.equal(I.sellPrice(shop, id, c),
      Math.max(1, Math.round(it.value * (1 + 0.15 * shop.wealth))),
      'sell ' + id + ' — формула без новых множителей');
  }
});

// ============================================================
// T5. Экран магазина: новые строки после улучшения (вкладка «Магазин» [I])
// ============================================================

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CHAIN = Array.from(html.matchAll(/<script\s+src="([^"]+)"/g), (m) => m[1])
  .map((p) => p.replace(/^src\//, ''))
  .filter((f) => f !== 'main.js');

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

function shopRowMap(bodyEl) {
  const rows = {};
  for (const row of findAll(bodyEl, '.cp-itemrow')) {
    const btn = findAll(row, 'button[data-act="buy"]')[0];
    if (!btn) continue;
    const name = findAll(row, '.cp-itemname')[0];
    const m = /×(\d+)$/.exec(String(name ? name.textContent : ''));
    rows[String(btn.dataset.item)] = m ? Number(m[1]) : null;
  }
  return rows;
}

function openShopTab(h, hero, shop) {
  const G = h.sandbox.Game;
  G.playerUI.setCharacter(hero);
  G.playerUI.toggle(true);
  const panel = findAll(h.body, '.char-panel')[0];
  assert.ok(panel, 'панель [I] подвешена к body');
  G.playerUI.setShop(shop);
  assert.ok(panel._shopBody, 'секция «Магазин» панели [I]');
  return panel;
}

// Свежий рендер вкладки на актуальном ctx.shop (semantика fresh-входа:
// shopKey-гард ядра не включает stock — ре-рендер при открытии).
function reRenderShopTab(h, panel, shop) {
  h.sandbox.Game.playerUI.setShop(shop);
  h.sandbox.Game.playerUI.toggle(false);
  h.sandbox.Game.playerUI.toggle(true);
  return panel._shopBody;
}

test('000317-T5. экран магазина [I] «Магазин»: строки уровня L+1 ⊇ строк L и СТРОГО больше (новая строка после улучшения — факт UI); порядок/строки сохранены', async () => {
  const h = await boot();
  const G = h.sandbox.Game;
  const hero = G.createCharacter('Флогистон');
  const shop1 = G.Cities.makeCityShop(CITY.cx, CITY.cy, CITY.tx, CITY.ty, CITY.bid, 1, 1);
  const panel = openShopTab(h, hero, shop1);
  const rows1 = shopRowMap(panel._shopBody);
  assert.ok(Object.keys(rows1).length >= 3,
    'экран L1 непустой: ' + JSON.stringify(Object.keys(rows1)));
  assert.deepEqual(Object.keys(rows1).sort(),
    Object.keys(shop1.stock).sort(),
    'строки экрана = сток L1 (data-driven)');
  const shop2 = G.Cities.makeCityShop(CITY.cx, CITY.cy, CITY.tx, CITY.ty, CITY.bid, 1, 2);
  const body2 = reRenderShopTab(h, panel, shop2);
  const rows2 = shopRowMap(body2);
  const gone = Object.keys(rows1).filter((id) => !(id in rows2));
  assert.deepEqual(gone, [],
    'RED: строки L2 ⊇ L1, пропало: ' + JSON.stringify(gone));
  const fresh = Object.keys(rows2).filter((id) => !(id in rows1));
  assert.ok(fresh.length > 0,
    'RED: после улучшения (L1→L2) на экране ЕСТЬ новые строки ' +
    '(расширение видно), было ' + Object.keys(rows1).length +
    ', стало ' + Object.keys(rows2).length);
  for (const id of Object.keys(rows1)) {
    assert.ok(rows2[id] >= rows1[id],
      'количество ' + id + ' на экране не упало: ' + rows1[id] +
      ' → ' + rows2[id]);
  }
  const shop3 = G.Cities.makeCityShop(CITY.cx, CITY.cy, CITY.tx, CITY.ty, CITY.bid, 1, 3);
  const rows3 = shopRowMap(reRenderShopTab(h, panel, shop3));
  assert.ok(Object.keys(rows3)
    .filter((id) => !(id in rows2)).length > 0,
    'RED: L2→L3 — ещё новые строки');
  assert.deepEqual(Object.keys(rows3).filter((id) => !(id in rows2))
    .filter((id) => G.getItem(id).kind !== 'weapon'), [],
    'расширение лавки — предметами её видов (оружейная: оружие)');
  G.playerUI.toggle(false);
});

// ============================================================
// T6. Спека: правило расширения в spec/buildings.md
// ============================================================

function esc(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function h3(text, name) {
  const m = text.match(new RegExp('^### ' + esc(name) + '\\s*$', 'm'));
  assert.ok(m, 'spec: раздел «' + name + '» не найден');
  const i = m.index;
  const j = text.indexOf('\n### ', i + 1);
  return text.slice(i, j === -1 ? text.length : j);
}

function norm(s) {
  return s.replace(/\s+/g, ' ');
}

test('000317-T6. spec/buildings.md «Содержимое города»: ассортимент лавки детерминированно расширяется уровнем (000317) — union базовых генераций + до (level−1) предмета по хэш-порядку derived-сида; level в сид НЕ входит; множества/количества не убывают; тайминг fresh-входа; цены вне существующих множителей не меняются', () => {
  const c = norm(h3(BUILDINGS, 'Содержимое города'));
  assert.ok(c.includes('Ассортимент лавки детерминированно расширяется уровнем (000317)'),
    'RED: «Содержимое города»: правило расширения уровнем (000317) отсутствует');
  assert.ok(c.includes('уровень в сид НЕ входит'),
    'RED: нет пина «уровень в сид НЕ входит» (000222-контракт сохранён)');
  assert.ok(c.includes('до (level−1) дополняющих предметов пула видов лавки'),
    'RED: нет правила top-k расширения по пулу видов');
  assert.ok(c.includes('Множество предметов и количества не убывают с уровнем'),
    'RED: нет ⊇/qty-контракта уровня');
  assert.ok(c.includes('цены улучшением вне существующих множителей не меняются'),
    'RED: нет ценового контракта');
});

// ============================================================
// T7. fallback ⊇ страж: пустой поток + расширение НЕ вытесняет pool[0]
// ============================================================

test('000317-T7. fallback-класс: пустой поток → L1 = {pool[0]: 1} и этот ключ живёт на всех L≥2 (страж «stock(L) ⊇ fallback-L1»); координата класса (1082,5771,bt2,w0) + свип bt×богатство 0/1 — без потери ключей и количеств', () => {
  // Координата класса из аудита: поток w=wealth пуст (малый пул видов
  // bt=2 при богатстве 0) → L1 — fallback-строка. Префиксер терял её
  // уже на L2 (expansion глушил fallback) — нога красная до фикса.
  const FX = 1082, FY = 5771, FBT = 2, FW = 0;
  const base = I.makeShop(FX, FY, FBT, FW);
  const bk = Object.keys(base.stock);
  assert.equal(bk.length, 1,
    'координата класса (' + FX + ',' + FY + ',' + FBT + ',' + FW +
    ') — L1 из ОДНОЙ fallback-строки (пустой поток): ' +
    JSON.stringify(base.stock));
  assert.equal(base.stock[bk[0]], 1, 'fallback — количество 1');
  for (let L = 2; L <= 7; L++) {
    assertSuperset(base, I.makeShop(FX, FY, FBT, FW, L),
      'RED: fallback ⊇ на L' + L + ' — расширение не вытесняет pool[0]');
  }
  // Свип-страж класса: на ВСЕХ координатах stock(L) ⊇ stock(1)
  // (⊇-контракт уровня, включая fallback-подмножество), и класс в
  // свипе непуст (иначе страж вырождается; точки перепикинуются при
  // росте каталога — прецедент стражей T2).
  let fallbacks = 0;
  for (const bt of [0, 1, 2, 3, 11]) {
    for (const w of [0, 1]) {
      for (let x = 0; x < 24; x++) {
        for (let y = 0; y < 24; y++) {
          const s1 = I.makeShop(x, y, bt, w);
          const keys = Object.keys(s1.stock);
          if (keys.length === 1 && s1.stock[keys[0]] === 1) fallbacks++;
          for (const L of [2, 3, 5, 7]) {
            assertSuperset(s1, I.makeShop(x, y, bt, w, L),
              'свип (' + x + ',' + y + ',bt' + bt + ',w' + w +
              '): stock(L' + L + ') ⊇ stock(1)');
          }
        }
      }
    }
  }
  assert.ok(fallbacks > 0,
    'в свипе есть хотя бы одна fallback-координата (пустой поток): ' +
    fallbacks);
});

// ============================================================
// T8. effWealth-цепочка ⊇ страж (раунд 2): рост богатства с уровнем
// НЕ вытесняет строки предыдущего уровня (гарантированная строка
// kindPool[0] живёт на всех L≥2)
// ============================================================

test('000317-T8. цепочка effWealth min(3,w+floor((L−1)/2)): ⊇/qty на КАЖДОМ шаге L→L+1 (L=1..6) — координаты класса (0,1,bt2,w0), (−34,48,bt2,w0), (−54,51,bt2,w0), (−53,10,bt11,w1) + свип bt×богатство 0/1×сетка 24×24; код раунда 1 терял minor_healing на шаге богатства L2→L3', () => {
  const eff = (w, L) => Math.min(3, w + Math.floor((L - 1) / 2));
  const chain = (x, y, bt, w, label) => {
    let prev = I.makeShop(x, y, bt, eff(w, 1), 1);
    for (let L = 2; L <= 7; L++) {
      const next = I.makeShop(x, y, bt, eff(w, L), L);
      assertSuperset(prev, next, label + ' L' + (L - 1) + '→L' + L +
        ' (effWealth ' + eff(w, L - 1) + '→' + eff(w, L) + ')');
      prev = next;
    }
  };
  // Координаты класса: пустой поток при базовом богатстве → fallback-
  // строка на L1-L2; на шаге effWealth 0→1 (L2→L3) непустой поток
  // поднятого богатства в коде раунда 1 глушил условный fallback —
  // minor_healing исчезала (нога красная против того кода).
  const pinned = [
    ['(0,1,bt2,w0)', 0, 1, 2, 0],
    ['(−34,48,bt2,w0)', -34, 48, 2, 0],
    ['(−54,51,bt2,w0)', -54, 51, 2, 0],
    ['(−53,10,bt11,w1)', -53, 10, 11, 1],
  ];
  for (const [label, x, y, bt, w] of pinned) {
    const l1 = I.makeShop(x, y, bt, eff(w, 1), 1);
    assert.equal(Object.keys(l1.stock).length, 1,
      label + ': L1 — одна fallback-строка (пустой поток): ' +
      JSON.stringify(l1.stock));
    chain(x, y, bt, w, label);
  }
  // Свип-страж цепочки: на всех координатах ⊇/qty по effWealth-цепочке
  // на каждом шаге (не только «stock(L) ⊇ stock(1)» — вытеснение
  // возможно и на промежуточном шаге богатства).
  for (const bt of [0, 1, 2, 3, 11]) {
    for (const w of [0, 1]) {
      for (let x = 0; x < 24; x++) {
        for (let y = 0; y < 24; y++) {
          chain(x, y, bt, w, 'цепочка (' + x + ',' + y + ',bt' + bt +
            ',w' + w + ')');
        }
      }
    }
  }
});

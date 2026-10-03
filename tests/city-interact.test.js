// Задача 000107: взаимодействие в городе через buildingUI (родитель 000052).
//
// [E] внутри города — ЕДИНЫЙ путь: клетка с внутренней постройкой (000106)
// → Game.buildingUI (000071) → «Диалог» → Game.npcUI (торговля/школа/
// квесты/найм). Обход buildingUI ЗАПРЕЩЁН (даже при деградации —
// console.error + no-op); клетка без постройки → [E] ничего; HUD hint
// города получает строку «[E] — постройки.»; найм (000078/000083) — НЕ
// зависимый, код найма не трогаем. Контракт: memory/000107-city-
// interact.md.
//
// КРАСНЫЕ тесты (TDD): написаны ДО реализации. Причины падения на
// текущем коде — отсутствие функциональности (не синтаксис):
//   * CI-U1..U8 — src/building-actions.js НЕ ИМЕЕТ interactCity()
//     (домен [E] города) — TypeError «not a function» / пустой surface;
//   * CI-V1/V2/V6 — ветки KeyE в dungeon-ui (ctx.onInteract) нет,
//     contents города не генерируется (locations.js не вызывает
//     generateCityContents), cityOnInteract в main.js отсутствует →
//     buildingUI/npcUI в городе не открываются;
//   * CI-V3 — hint города без строки «[E] — постройки.»;
//   * CI-V7 — гейта cityOnMove нет: с «открытым» buildingUI/npcUI герой
//     двигается (в текущем коде оверлей вообще не открывается — герой
//     тем более двигается);
//   * CI-V8 — __game.dungeon.buildings отсутствует (содержимое не в
//     рантайме).
// Зелёные пины (регрессия, проходят с первой стадии): CI-U9 (гард
// toggle() dungeonUI.isActive — 000128, НЕ ПЕРЕНОСИТЬ), CI-V4 (клетка
// без постройки → [E] ничего), CI-V5 (KeyE в настоящем подземелье →
// no-op, 000121).
//
// Контракты, зафиксированные здесь:
//   * CI-U1 — interactCity() без аргументов; [E] на клетке с постройкой
//     (у которой есть npc) → buildingUI.open ровно 1 раз (title — из
//     b.название, первая буква нижним; городские записи БЕЗ эффектов →
//     ровно одна строка «Диалог»); «Диалог» (onAction) → npcUI.open
//     payload {npc, character: hero, book, tile: {x, y, building:
//     map_index|null, buildingWealth} (КЛЕТКА ГОРОДА, не deps.player —
//     D4), shop: {npc, stock: ds.cityShops['tx,ty'].stock} (city-ветка
//     shopFor — fake npcShopFor НЕ вызывается), onChange: saveNow,
//     day: clock.day}.
//   * CI-U2 — клетка без постройки → ничего (ни buildingUI, ни npcUI).
//   * CI-U3 — ds.cityContents: null (генерация не сработала) → ничего.
//   * CI-U4 — стек (паритет с миром): buildingUI.isActive → [E]
//     закрывает buildingUI (npcUI не открывает); npcUI.isActive → [E]
//     закрывает npcUI.
//   * CI-U5 — combatUI.isActive → [E] ничего (бой выше по стеку).
//   * CI-U6 — npc == null и эффектов нет → actions пусто → openBuildingUI
//     false → buildingUI.open НЕ вызывается.
//   * CI-U7 — сток: таверна (44, Берта БЕЗ торговля) → shop в npcUI
//     payload = null (гасится ДО npcUI — иначе TypeError в
//     renderTradeTab); оружейная (1, Бренн) → shop = {npc, stock} (сток
//     из 6-полевого makeCityShop по (город, клетка), 000108).
//   * CI-U8 — needDeps (init не вызван) → no-op + console.error, игра
//     не падает (UMD-деградация 000053).
//   * CI-U9 — [ЗЕЛЁНЫЙ ПИН] toggle() при активном dungeonUI → return
//     (гард building-actions.js L469 сохранён — 000128; в городе
//     toggle — МЁРТВЫЙ путь, [E] ведёт через interactCity).
//   * CI-V1 — [E] на клетке с постройкой в ГОРОДЕ (full-chain) →
//     buildingUI активен (NPC/запись из каталога, строка «Диалог»);
//     npcUI напрямую НЕ открывается; dungeonUI остаётся активен.
//   * CI-V2 — «Диалог» (Digit1) из buildingUI → npcUI: у Бренна (1)
//     вкладка «торговля» — строки «имя (ост. N)» со стоком
//     makeCityShop(якорь, клетка, wealth); у Берты (44) — «Этот NPC не
//     торгует.»; вкладка «найм» (000083) не падает.
//   * CI-V3 — hint города содержит «[E] — постройки.» (3 строки); hint
//     подземелья БЕЗ ИЗМЕНЕНИЙ («Сундук и мобы…», без «[E]»).
//   * CI-V4 — [ЗЕЛЁНЫЙ ПИН] [E] на клетке без постройки (entrance —
//     построек там нет, 000106) → ничего, без ошибок.
//   * CI-V5 — [ЗЕЛЁНЫЙ ПИН] KeyE в настоящем подземелье → no-op
//     (000121: ветка мёртвая — onInteract передаётся только городу).
//   * CI-V6 — повторный [E] закрывает buildingUI; [E] при открытом
//     npcUI закрывает npcUI (стек-семантика).
//   * CI-V7 — с открытым buildingUI/npcUI движение (стрелки/WASD) НЕ
//     двигает героя (гейт cityOnMove — паритет с миром).
//   * CI-V8 — содержимое на входе: __game.dungeon.buildings deepEqual
//     generateCityContents(layout(якорь), …) (recompute); на
//     entrance/exit постройки НЕТ; все buildingId ∈ {1, 7, 10, 25, 44}.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

// ============================================================
// Секция 1: юнит — interactCity (fake deps, паттерн building-actions)
// ============================================================

// Городские записи каталога (срез нужных полей; map_index — из
// 000001/000044: оружейная 0, таверна 11).
const CITY_RECS = {
  1: { id: 1, название: 'Оружейная', категория: 'здание',
    особые_параметры: { map_index: 0, виды: ['weapon'] } },
  7: { id: 7, название: 'Арена', категория: 'здание',
    особые_параметры: { map_index: 2, виды: ['training'] } },
  44: { id: 44, название: 'Таверна', категория: 'здание',
    особые_параметры: { map_index: 11, виды: ['food', 'potion'] } },
};
// NPC постройок (постройки — массив id, как в каталоге assets/npc).
const NPC_WREN = { id: 'npc_wren', имя: 'Бренн', постройки: [1],
  торговля: { предметы: [{ предмет: 'wood_sword' },
    { предмет: 'iron_sword' }] } };
const NPC_BERTA = { id: 'npc_berta', имя: 'Берта', постройки: [44] };
const STOCK_W = { wood_sword: 2, iron_sword: 1 };

// Стейки оверлеев (buildingUI/npcUI/combatUI/dungeonUI) + журнал.
function makeOverlayStubs(over = {}) {
  const state = {
    building: !!over.buildingOpen,
    npc: !!over.npcOpen,
    combat: !!over.combatOpen,
  };
  const calls = { buildingOpen: [], npcOpen: [], buildingClose: 0,
    npcClose: 0 };
  const buildingUI = {
    open: (p) => { state.building = true; calls.buildingOpen.push(p); },
    close: () => { state.building = false; calls.buildingClose += 1; },
    isActive: () => state.building,
  };
  const npcUI = {
    open: (p) => { state.npc = true; calls.npcOpen.push(p); },
    close: () => { state.npc = false; calls.npcClose += 1; },
    isActive: () => state.npc,
  };
  const combatUI = { isActive: () => state.combat };
  const dungeonUI = { isActive: () => !!over.dungeonOpen };
  return { state, calls, buildingUI, npcUI, combatUI, dungeonUI };
}

// ds города (000105/000107): hero на (2,3); ПОСТРОЙКА на (2,3) —
// buildingId 1; 6-полевой makeCityShop (000108) в cityShops['2,3'].
function makeCityDs(over = {}) {
  const buildings = over.cityContents === undefined
    ? [{ x: 2, y: 3, buildingId: 1 }] : over.cityContents;
  return {
    kind: 'city',
    x: over.x === undefined ? 2 : over.x,
    y: over.y === undefined ? 3 : over.y,
    pos: { x: 2, y: 3 }, // glide-рендер 000105 — НЕ источник координат
    contents: null, // ЛОВУШКА __game.dungeon — ОБЯЗАТЕЛЬНО null в городе
    cityContents: buildings === null ? null : { buildings, seed: 9 },
    cityShops: over.cityShops === undefined
      ? { '2,3': { x: 2, y: 3, buildingType: 1, wealth: 1,
        stock: STOCK_W, seed: 5 } }
      : over.cityShops,
    cityWealth: over.cityWealth === undefined ? 1 : over.cityWealth,
    name: 'Деревня',
    dg: { width: 4, height: 4, cells: null,
      entrance: { x: 1, y: 3 }, exit: { x: 2, y: 0 } },
  };
}

// Фейковый deps-бандл (все поля, которые трогает цепочка
// interactCity → openBuildingUI → onBuildingAction → openNpcDialog).
function makeDeps(over = {}) {
  const o = makeOverlayStubs(over);
  const ds = makeCityDs(over);
  const npcShopForCalls = [];
  const hero = { id: 'hero', name: 'Флогистон', gold: 100 };
  const book = { active: [], done: [] };
  const saveNow = () => {};
  const deps = {
    game: {
      buildingEffects: {
        EFFECTS: {},
        hasDailyLimit: () => false,
        // Зеркало building-effects L777-781: «Диалог» ПЕРВЫМ при
        // npc != null; городские записи БЕЗ эффектов → иначе пусто.
        buildingActions: (b, npc) => {
          const list = [];
          if (npc) list.push({ id: 'dialog', name: 'Диалог' });
          return list;
        },
      },
      buildingUI: o.buildingUI,
      npcUI: o.npcUI,
      combatUI: o.combatUI,
      dungeonUI: o.dungeonUI,
      getBuilding: (id) => CITY_RECS[id] || null,
      npcForBuilding: (list, bid) =>
        list.find((n) => Array.isArray(n.постройки)
          && n.постройки.includes(bid)) || null,
    },
    clock: { day: 5 },
    hero,
    questBook: book,
    // Намеренно НЕ (2,3): D4 — tile берётся из КЛЕТКИ, не из player.
    player: { x: 5, y: 7 },
    prevPos: { x: 5, y: 7 },
    npcs: over.npcs === undefined ? [NPC_WREN, NPC_BERTA] : over.npcs,
    cityState: () => ds,
    npcShopFor: (id) => {
      npcShopForCalls.push(id);
      return { npc: null, stock: { world_item: 1 } };
    },
    // city-ветка контракта shopFor (main.js): {npc, stock} | null.
    // Мир — fallback npcShopFor (в городе не должен вызываться).
    shopFor: (npc, t) => {
      const d = deps.cityState();
      if (d && d.kind === 'city' && d.cityShops && t) {
        const s = d.cityShops[t.x + ',' + t.y];
        if (!s) return null;
        if (!npc || !npc.торговля || !Array.isArray(npc.торговля.предметы)) {
          return null; // таверна: Берта без торговля — гасим ДО npcUI
        }
        return { npc, stock: s.stock };
      }
      return deps.npcShopFor(npc.id);
    },
    collectSaveData: () => ({}),
    saveNow,
    flash: () => {},
    buildingOncePerDay: new Map(),
    buffs: [],
    teleports: new Map(),
    buildingQuests: new Map(),
    playerRender: () => {},
    moveHero: () => {},
    startCombat: () => {},
    getMap: () => ((x, y) => ({ x, y, passable: true, hasBuilding: false })),
    mover: null,
  };
  return { deps, o, ds, npcShopForCalls, hero, book, saveNow };
}

function initCity(over) {
  const env = makeDeps(over);
  const BA = require('../src/building-actions.js');
  BA.init(env.deps); // re-init — присвоение бандла (паттерн BA-тестов)
  return Object.assign({ BA }, env);
}

test('CI-U1. [E] на клетке с постройкой → buildingUI.open ×1; «Диалог» → npcUI.open (D4: tile/shop из клетки, не из player)', () => {
  const { BA, o, npcShopForCalls, hero, book, saveNow } = initCity();
  assert.equal(typeof BA.interactCity, 'function',
    'RED: surface модуля — interactCity (домен [E] города, 000107)');
  BA.interactCity();
  assert.equal(o.calls.buildingOpen.length, 1, 'buildingUI.open — ровно 1');
  const p = o.calls.buildingOpen[0];
  assert.equal(p.title, 'оружейная',
    'title — из каталога b.название (первая буква нижним)');
  assert.equal(p.actions.length, 1, 'одна строка (городские записи без эффектов)');
  assert.equal(p.actions[0].id, 'dialog', 'строка — «Диалог»');
  assert.equal(o.calls.npcOpen.length, 0, 'npcUI напрямую НЕ открывается');
  // «Диалог» → onBuildingAction (fallback) → openNpcDialog (D4).
  p.onAction({ id: 'dialog' });
  assert.equal(o.calls.npcOpen.length, 1, '«Диалог» → npcUI.open');
  assert.deepEqual(o.calls.npcOpen[0], {
    npc: NPC_WREN,
    character: hero,
    book,
    tile: { x: 2, y: 3, building: 0, buildingWealth: 1 },
    shop: { npc: NPC_WREN, stock: STOCK_W },
    onChange: saveNow,
    day: 5,
  }, 'payload npcUI: tile — КЛЕТКА ГОРОДА (2,3), shop — городской сток');
  assert.equal(npcShopForCalls.length, 0,
    'city-ветка shopFor — мирный npcShopFor НЕ вызывается');
});

test('CI-U2. клетка без постройки → [E] ничего (ни buildingUI, ни npcUI)', () => {
  const { BA, o } = initCity({
    cityContents: [{ x: 9, y: 9, buildingId: 1 }], cityShops: {},
  });
  BA.interactCity();
  assert.equal(o.calls.buildingOpen.length, 0, 'buildingUI — нет');
  assert.equal(o.calls.npcOpen.length, 0, 'npcUI — нет');
  assert.equal(o.calls.buildingClose + o.calls.npcClose, 0, 'ничего не закрыто');
});

test('CI-U3. cityContents: null (генерация не сработала) → [E] ничего', () => {
  const { BA, o } = initCity({
    cityContents: null, cityShops: null, cityWealth: null,
  });
  BA.interactCity();
  assert.equal(o.calls.buildingOpen.length, 0, 'buildingUI — нет');
  assert.equal(o.calls.npcOpen.length, 0, 'npcUI — нет');
});

test('CI-U4. стек: [E] закрывает открытый buildingUI / открытый npcUI (не открывает новое)', () => {
  // (a) buildingUI открыт → close, npcUI не открывается.
  let t = initCity({ buildingOpen: true });
  t.BA.interactCity();
  assert.equal(t.o.calls.buildingClose, 1, 'buildingUI.close()');
  assert.equal(t.o.calls.buildingOpen.length, 0, 'buildingUI не переоткрыт');
  assert.equal(t.o.calls.npcOpen.length, 0, 'npcUI не открыт');
  // (b) npcUI открыт (buildingUI закрыт executeAction, 000071) → close.
  t = initCity({ npcOpen: true });
  t.BA.interactCity();
  assert.equal(t.o.calls.npcClose, 1, 'npcUI.close()');
  assert.equal(t.o.calls.buildingOpen.length, 0, 'buildingUI не открыт');
  assert.equal(t.o.calls.buildingClose, 0, 'buildingUI не закрыт (не был)');
});

test('CI-U5. combatUI.isActive → [E] ничего (бой выше по стеку)', () => {
  const { BA, o } = initCity({ combatOpen: true });
  BA.interactCity();
  assert.equal(o.calls.buildingOpen.length, 0, 'buildingUI — нет');
  assert.equal(o.calls.npcOpen.length, 0, 'npcUI — нет');
  assert.equal(o.calls.buildingClose + o.calls.npcClose, 0, 'ничего не закрыто');
});

test('CI-U6. постройка без NPC и без эффектов → actions пусто → [E] ничего', () => {
  // Оружейная (1) без Бренна — npc == null; эффектов у записи нет.
  const { BA, o } = initCity({ npcs: [NPC_BERTA] });
  BA.interactCity();
  assert.equal(o.calls.buildingOpen.length, 0,
    'openBuildingUI false (actions пусто) — buildingUI не открыт');
  assert.equal(o.calls.npcOpen.length, 0, 'npcUI — нет');
});

test('CI-U7. сток: таверна (44, Берта без торговля) → shop null; оружейная (1, Бренн) → shop {npc, stock}', () => {
  // (a) Таверна: cityShops ИМЕЕТ запись (44 — прод/potion), но Берта
  // без торговля → shop null (гасится ДО npcUI — иначе TypeError в
  // renderTradeTab: npc.торговля.предметы).
  let t = initCity({
    cityContents: [{ x: 2, y: 3, buildingId: 44 }],
    cityShops: { '2,3': { x: 2, y: 3, buildingType: 44, wealth: 1,
      stock: { bread: 3, potion: 2 }, seed: 6 } },
  });
  t.BA.interactCity();
  assert.equal(t.o.calls.buildingOpen.length, 1, 'buildingUI (Берта — NPC)');
  t.o.calls.buildingOpen[0].onAction({ id: 'dialog' });
  assert.equal(t.o.calls.npcOpen.length, 1, '«Диалог» → npcUI.open');
  assert.equal(t.o.calls.npcOpen[0].shop, null,
    'Берта без торговля → shop = null');
  // (b) Оружейная: Бренн с торговля → {npc, stock} из cityShops.
  t = initCity();
  t.BA.interactCity();
  t.o.calls.buildingOpen[0].onAction({ id: 'dialog' });
  assert.deepEqual(t.o.calls.npcOpen[0].shop,
    { npc: NPC_WREN, stock: STOCK_W },
    'Бренн — {npc, stock}; сток — из 6-полевого makeCityShop (000108)');
});

test('CI-U8. needDeps (init не вызван) → no-op + console.error, не падает (000053)', () => {
  const p = require.resolve('../src/building-actions.js');
  delete require.cache[p]; // СВЕЖИЙ модуль без init
  const BA = require('../src/building-actions.js');
  const errs = [];
  const orig = console.error;
  console.error = (...a) => { errs.push(a.join(' ')); };
  try {
    BA.interactCity(); // RED: TypeError — функции нет в модуле
  } finally {
    console.error = orig;
  }
  assert.ok(errs.some((m) => m.includes('init не вызван')),
    'console.error needDeps (без init): ' + JSON.stringify(errs));
});

test('CI-U9. [зелёный пин] toggle() при активном dungeonUI → return (гард 000128 не тронут)', () => {
  const { BA, o } = initCity({ dungeonOpen: true });
  BA.toggle();
  assert.equal(o.calls.buildingOpen.length, 0,
    'toggle в городе/подземелье — buildingUI не открывает');
  assert.equal(o.calls.npcOpen.length, 0, 'npcUI — тоже');
  assert.equal(o.calls.buildingClose + o.calls.npcClose, 0, 'ничего не закрыто');
});

// ============================================================
// Секция 2: vm full-chain (index.html CHAIN, host-паттерн
// city-screen.test.js + building-effects B-секции)
// ============================================================

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CHAIN = Array.from(html.matchAll(/<script\s+src="([^"]+)"/g), (m) => m[1])
  .map((p) => p.replace(/^src\//, ''));
const NOW = 1000; // performance.now() в песочнице заморожен на NOW
const G_CELL_FLOOR = 1; // значение CELL_FLOOR (dungeon.js/cities.js)

// --- WebGL-стаб (main.js: compile/link/буферы) ---
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
  gl.getShaderParameter = () => true; // иначе main.js бросит Error
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

// --- «Снисходительный» DOM-элемент с деревом (dataset, closest,
// querySelectorAll) — паттерн building-effects (оверлеи, делегированный
// клик npcUI, строки buildingUI). ---
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
      return () => undefined; // неизвестный метод DOM — no-op
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

// Рекурсивный текст элемента (ассерты содержимого оверлея).
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

// --- Песочница: вся цепочка index.html ---
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
    // Семантика браузерного window: повторный add — no-op, remove —
    // реально снимает (иначе накопление устаревших keyHandler — B9).
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
  // Image-стаб: assets/map.png ВСЕГДА onerror (детерминированный мир
  // G.generateSeedPixels), остальные — onload.
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
  return { sandbox, winListeners, raf, errors, body };
}

// Промывка микротасков (Image + loadMapPixels().then: карта, спавн, rAF).
const drain = () => new Promise((r) => setImmediate(r));

async function bootChain() {
  const h = bootSandbox();
  await drain();
  await drain();
  await drain();
  const g = h.sandbox.__game;
  assert.ok(g, 'globalThis.__game выставлен (main.js выполнен)');
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет (порядок цепочки): ' + h.errors.join('; '));
  // frame() main.js — единственный rAF-колбэк после старта; кадр
  // пере планирует себя (одна и та же функция) — frameFn валидна
  // на любом моменте.
  h.frameFn = h.raf[h.raf.length - 1];
  return h;
}

// --- Ввод ---
// ВАЖНО: массив слушателей снапшотится ПЕРЕД диспетчем (паттерн
// building-effects B9): слушатель, зарегистрированный ВО ВРЕМЯ
// диспетча (buildingUI.open вешает keyHandler; npcUI.open — escHandler),
// текущее событие НЕ видит (семантика браузерного DOM).
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

// press/release — для ходьбы (world + city): полный цикл keydown→keyup.
function press(h, code) {
  return key(h, code);
}

function release(h, code) {
  return keyup(h, code);
}

// --- Ходьба по МИРУ (протокол city-screen/main-visuals) ---
// keydown(направление) → кадры frame(now) по +200 мс, пока игрок не
// перешёл (tryMove — в frame при now−lastMove ≥ stepMs; базовый
// stepMs = 420 мс, 000063) → keyup. Кадр делает ≤ ОДНОГО хода.
function walkTiles(h, now, tiles) {
  const g = h.sandbox.__game;
  for (const [tx, ty] of tiles) {
    const dx = tx - g.state.player.x, dy = ty - g.state.player.y;
    assert.ok(Math.abs(dx) + Math.abs(dy) === 1, 'BFS: шаг по соседнему тайлу');
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
  }
  // Осадочные кадры (глейд мувера, сглаживание камеры).
  for (let i = 0; i < 4; i++) {
    now += 200;
    h.frameFn(now);
  }
  return now;
}

// --- BFS по миру до целевого тайла. Промежуточные узлы: passable,
// БЕЗ групп мобов (шаг = startCombat) и БЕЗ входов (пещера/город —
// авто-вход сломает протокол); целевой тайл — проверка ДО исключения.
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
        if (t.hasBuilding) continue; // вход (пещера/город) — не на пути
        next.push({ x: nx, y: ny });
      }
    }
    frontier = next;
  }
  return null;
}

// Настоящий вход (НЕ развалины — подтип слота 9, buildingId 48: 000073,
// шаг на развалины НЕ открывает лабиринт — тот же гард, что и
// maybeEnterDungeon).
const isCaveTile = (G) => (t) =>
  t.hasBuilding && t.building === G.BUILDING_TYPES.CAVE_ENTRANCE
  && t.buildingId !== 48;

// Город + RECOMPUTE содержимого (чистые функции 000106/000108 — те же
// входы, что и production: якорь, wealth из tileAt): layout от ЯКОРЯ,
// не от входного тайла (000105). Возврат: {tile, steps, fp, rec,
// layout, contents, ax, ay, wealth}.
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

// --- Ходьба ВНУТРИ города: синхронная (keydown → ctx.onMove →
// cityMove; кадры не нужны). Layout города: периметр WALL, вся
// внутренность (1..W−2)² — FLOOR (000104); постройки (000106) НЕ
// мутируют cells → клетки построек проходимы. L-путь: вертикаль в
// столбце от входа, горизонталь в строке цели — все клетки FLOOR,
// выход (y=0) не пересекается.
function cityStepsTo(from, tx, ty) {
  // Каждый шаг — ЦЕЛЕВАЯ клетка (не исходная): (from.x, from.y±1) …
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
    assert.ok(Math.abs(dx) + Math.abs(dy) === 1, 'город: шаг по соседней клетке');
    const code = keydownFor(dx, dy);
    press(h, code);
    release(h, code);
    assert.ok(g.dungeon, 'в городе (не вышел)');
    assert.equal(g.dungeon.x, tx, 'город: шаг x (' + tx + ',' + ty + ')');
    assert.equal(g.dungeon.y, ty, 'город: шаг y (' + tx + ',' + ty + ')');
  }
}

// Направление шага ВНУТРЬ города (клетка строго внутренней, FLOOR) —
// для CI-V7: в текущем коде (гейта нет) герой гарантированно СОДВИНЕТСЯ
// → красный честный.
function stepDirInside(dg, from) {
  const DIRS = [[0, -1], [0, 1], [-1, 0], [1, 0]];
  for (const [dx, dy] of DIRS) {
    const nx = from.x + dx, ny = from.y + dy;
    if (nx < 1 || ny < 1 || nx >= dg.width - 1 || ny >= dg.height - 1) {
      continue;
    }
    if (dg.cells[ny * dg.width + nx] !== G_CELL_FLOOR) continue;
    return [dx, dy];
  }
  return null;
}

// --- Оверлеи и HUD ---
function buildingOverlayOf(h) {
  const ovs = findAll(h.body, '.combat-overlay').filter((o) =>
    !String(o.className).includes('npc-overlay') &&
    !String(o.className).includes('dungeon-overlay'));
  return ovs[ovs.length - 1] || null;
}

function npcOverlayOf(h) {
  const ovs = findAll(h.body, '.npc-overlay');
  return ovs[ovs.length - 1] || null;
}

function findRow(overlay, id) {
  return findAll(overlay, '[data-buid]')
    .find((r) => r.dataset.buid === id) || null;
}

function tabBtn(overlay, tab) {
  return findAll(overlay, 'button[data-npcact="tab"]')
    .find((b) => b.dataset.tab === tab) || null;
}

// Делегированный клик вкладкой (паттерн npc-hire:
// overlay.listeners.click[0]({ target })).
function clickTab(h, overlay, tab) {
  const btn = tabBtn(overlay, tab);
  assert.ok(btn, 'вкладка «' + tab + '» в ряде вкладок');
  const clickers = overlay.listeners.click || [];
  assert.ok(clickers.length >= 1, 'делегированный click-обработчик оверлея');
  clickers[0]({ target: btn });
}

// Hint dungeon-ui: ВТОРОЙ .combat-state внутри .dungeon-overlay
// (первый — stateEl; паттерн dungeon-ui.test.js).
function hintOf(h) {
  const ov = findAll(h.body, '.dungeon-overlay')[0];
  assert.ok(ov, 'dungeon-ui оверлей активен');
  const states = findAll(ov, '.combat-state');
  assert.ok(states.length >= 2, 'оверлей: stateEl + hint (combat-state)');
  return textOf(states[1]);
}

// ============================================================
// vm-тесты CI-V1..V8
// ============================================================

test('CI-V1. [E] в городе на клетке с постройкой → buildingUI (единый путь, обход запрещён)', async () => {
  const h = await bootChain();
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  const myMap = G.createMap(G.generateSeedPixels());
  const found = findCityFor(G, myMap, g.state.player,
    (c) => c.fp >= 2 && c.contents.buildings.length >= 1);
  assert.ok(found,
    'сценарий: город (fp>=2) с внутренней постройкой достижим');
  walkTiles(h, NOW, found.steps);
  const dg = g.dungeon;
  assert.ok(dg && dg.kind === 'city', 'в городе (авто-вход)');
  const target = found.contents.buildings[0]; // 000106: таверна первой
  walkCity(h, cityStepsTo({ x: dg.x, y: dg.y }, target.x, target.y));
  const errsBefore = h.errors.length;
  key(h, 'KeyE');
  assert.equal(G.buildingUI.isActive(), true,
    'RED: [E] в городе — buildingUI (000071); ветки KeyE в dungeon-ui нет');
  assert.equal(G.npcUI.isActive(), false, 'npcUI напрямую НЕ открывается');
  assert.equal(h.errors.length, errsBefore,
    'без console.error: ' + h.errors.slice(errsBefore).join('; '));
  const ov = buildingOverlayOf(h);
  assert.ok(ov, 'оверлей buildingUI прикреплён к body');
  const b = G.getBuilding(target.buildingId);
  const rawName = (b.особые_параметры &&
    b.особые_параметры.название_карты) || b.название;
  const title = rawName.charAt(0).toLowerCase() + rawName.slice(1);
  const titleEl = findAll(ov, '.cp-title')[0];
  assert.ok(titleEl && textOf(titleEl).includes(title),
    'title — каталожное имя постройки («' + title + '»): ' +
      (titleEl ? textOf(titleEl) : 'нет .cp-title'));
  assert.ok(findRow(ov, 'dialog'), 'строка «Диалог» (data-buid="dialog")');
  assert.equal(G.dungeonUI.isActive(), true,
    'dungeonUI активен (городский режим, 000105)');
});

test('CI-V2. «Диалог» из buildingUI → npcUI: Бренн — сток cityShops; Берта — «не торгует»', async () => {
  const h = await bootChain();
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  const myMap = G.createMap(G.generateSeedPixels());
  const found = findCityFor(G, myMap, g.state.player, (c) => c.fp >= 2 &&
    c.contents.buildings.some((b) => b.buildingId === 1) &&
    c.contents.buildings.some((b) => b.buildingId === 44));
  assert.ok(found,
    'сценарий: город с Оружейной (1) и Таверной (44)');
  walkTiles(h, NOW, found.steps);
  const dg = g.dungeon;
  assert.ok(dg && dg.kind === 'city', 'в городе');

  // (a) Оружейная: [E] → buildingUI → Digit1 «Диалог» → npcUI (Бренн).
  const w = found.contents.buildings.find((b) => b.buildingId === 1);
  walkCity(h, cityStepsTo({ x: dg.x, y: dg.y }, w.x, w.y));
  key(h, 'KeyE');
  assert.equal(G.buildingUI.isActive(), true, 'RED: [E] — buildingUI');
  key(h, 'Digit1');
  assert.equal(G.buildingUI.isActive(), false,
    'оверлей закрыт действием (executeAction, 000071)');
  assert.equal(G.npcUI.isActive(), true, '«Диалог» → npcUI');
  const npcW = G.npcForBuilding(G.NpcData.NPCS, 1);
  assert.ok(npcW && npcW.торговля, 'NPC Оружейной — торговля');
  const ovW = npcOverlayOf(h);
  assert.ok(ovW, 'оверлей npcUI');
  assert.ok(textOf(ovW).includes(npcW.имя),
    'диалог — NPC постройки (' + npcW.имя + ')');
  clickTab(h, ovW, 'trade');
  const expW = G.Cities.makeCityShop(found.ax, found.ay, w.x, w.y, 1,
    found.wealth);
  assert.ok(expW && expW.stock,
    'сценарий: makeCityShop — сток Оружейной (000108, 6-полевой)');
  const tradeW = textOf(ovW);
  for (const p of npcW.торговля.предметы) {
    const it = G.getItem(p.предмет);
    assert.ok(
      tradeW.includes(it.name + ' (ост. ' + (expW.stock[p.предмет] || 0) + ')'),
      'строка «' + it.name + ' (ост. N)» — ГОРОДСКОЙ сток (cityShops): ' +
        tradeW.slice(0, 240));
  }
  key(h, 'Escape');
  assert.equal(G.npcUI.isActive(), false, 'диалог закрыт (Esc)');

  // (b) Таверна: Берта без торговля → «Этот NPC не торгует.»; вкладка
  // «найм» (000083) — не падает (код найма не тронут).
  const tv = found.contents.buildings.find((b) => b.buildingId === 44);
  walkCity(h, cityStepsTo({ x: dg.x, y: dg.y }, tv.x, tv.y));
  key(h, 'KeyE');
  assert.equal(G.buildingUI.isActive(), true, '[E] — buildingUI (таверна)');
  key(h, 'Digit1');
  assert.equal(G.npcUI.isActive(), true, 'таверна «Диалог» → npcUI');
  const npcT = G.npcForBuilding(G.NpcData.NPCS, 44);
  assert.ok(npcT && !npcT.торговля, 'NPC Таверны — без торговля');
  const ovT = npcOverlayOf(h);
  assert.ok(textOf(ovT).includes(npcT.имя), 'диалог — ' + npcT.имя);
  clickTab(h, ovT, 'trade');
  assert.ok(textOf(ovT).includes('Этот NPC не торгует.'),
    'shop = null → «Этот NPC не торгует.» (TypeError не возник)');
  const errsBefore = h.errors.length;
  clickTab(h, ovT, 'hire');
  assert.equal(h.errors.length, errsBefore, 'вкладка «найм» (000083) без ошибок');
  assert.ok(textOf(ovT).includes('Наёмник'),
    'кандидаты найма: ' + textOf(ovT).slice(0, 240));
});

test('CI-V3. HUD: hint города — строка «[E] — постройки.»; hint подземелья — без изменений', async () => {
  // Город.
  const h = await bootChain();
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  const myMap = G.createMap(G.generateSeedPixels());
  const found = findCityFor(G, myMap, g.state.player, (c) => c.fp >= 2);
  assert.ok(found, 'сценарий: город (fp>=2)');
  walkTiles(h, NOW, found.steps);
  assert.ok(g.dungeon && g.dungeon.kind === 'city', 'в городе');
  const hint = hintOf(h);
  assert.ok(hint.includes('[E] — постройки.'),
    'RED: hint города: «[E] — постройки.»: ' + JSON.stringify(hint));
  assert.ok(hint.includes('Стрелки/WASD — шаг.'), 'строка 1 без изменений');
  assert.ok(hint.includes('Жёлтая клетка «X» — выход.'), 'строка 2 без изменений');
  assert.ok(!hint.includes('Сундук и мобы'),
    'в городе — без подземной строки (000105)');

  // Подземелье (отдельный boot: без выхода из города — не тапать
  // входной тайл повторно, авто-вход сломал бы протокол).
  const h2 = await bootChain();
  const g2 = h2.sandbox.__game;
  const G2 = h2.sandbox.Game;
  const myMap2 = G2.createMap(G2.generateSeedPixels());
  const cave = findTile(G2, myMap2, g2.state.player, isCaveTile(G2));
  assert.ok(cave, 'сценарий: вход в пещеру');
  walkTiles(h2, NOW, cave.steps);
  assert.ok(g2.dungeon && g2.dungeon.kind === 'dungeon', 'в подземелье');
  const dHint = hintOf(h2);
  assert.ok(dHint.includes('Сундук и мобы'),
    'hint подземелья: строка без изменений');
  assert.ok(!dHint.includes('[E] — постройки.'),
    'hint подземелья: без городской строки');
});

test('CI-V4. [зелёный пин] клетка без постройки → [E] ничего, без ошибок', async () => {
  const h = await bootChain();
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  const myMap = G.createMap(G.generateSeedPixels());
  const found = findCityFor(G, myMap, g.state.player, (c) => c.fp >= 2);
  assert.ok(found, 'сценарий: город (fp>=2)');
  walkTiles(h, NOW, found.steps);
  const dg = g.dungeon;
  assert.ok(dg && dg.kind === 'city', 'в городе');
  // Герой на entrance — построек там нет (000106: spots = FLOOR минус
  // entrance/exit).
  assert.ok(!found.contents.buildings.some((b) =>
    b.x === dg.entrance.x && b.y === dg.entrance.y),
    'сценарий: на entrance постройка не стоит');
  const before = { x: dg.x, y: dg.y, day: dg.day };
  const errsBefore = h.errors.length;
  key(h, 'KeyE');
  assert.ok(!G.buildingUI.isActive(), 'buildingUI не открыт');
  assert.ok(!G.npcUI.isActive(), 'npcUI не открыт');
  assert.equal(g.dungeon.x, before.x, 'позиция не изменилась');
  assert.equal(g.dungeon.y, before.y, 'позиция не изменилась');
  assert.equal(g.dungeon.day, before.day, 'день не изменился');
  assert.equal(h.errors.length, errsBefore,
    'без console.error: ' + h.errors.slice(errsBefore).join('; '));
});

test('CI-V5. [зелёный пин] KeyE в настоящем подземелье → no-op (000121)', async () => {
  const h = await bootChain();
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  const myMap = G.createMap(G.generateSeedPixels());
  const cave = findTile(G, myMap, g.state.player, isCaveTile(G));
  assert.ok(cave, 'сценарий: вход в пещеру');
  walkTiles(h, NOW, cave.steps);
  const dg = g.dungeon;
  assert.ok(dg && dg.kind === 'dungeon', 'в подземелье');
  const before = { x: dg.x, y: dg.y };
  const errsBefore = h.errors.length;
  key(h, 'KeyE'); // 000121: ветка мёртвая (onInteract — только городу)
  assert.ok(!G.buildingUI.isActive(), 'buildingUI не открыт');
  assert.ok(!G.npcUI.isActive(), 'npcUI не открыт');
  assert.equal(g.dungeon.x, before.x, 'позиция не изменилась');
  assert.equal(g.dungeon.y, before.y, 'позиция не изменилась');
  assert.equal(h.errors.length, errsBefore,
    'без console.error (byte-в-точности 000121): ' +
      h.errors.slice(errsBefore).join('; '));
});

test('CI-V6. стек: повторный [E] закрывает buildingUI; [E] при открытом npcUI закрывает npcUI', async () => {
  const h = await bootChain();
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  const myMap = G.createMap(G.generateSeedPixels());
  const found = findCityFor(G, myMap, g.state.player,
    (c) => c.fp >= 2 && c.contents.buildings.length >= 1);
  assert.ok(found, 'сценарий: город (fp>=2) с постройкой');
  walkTiles(h, NOW, found.steps);
  const dg = g.dungeon;
  assert.ok(dg && dg.kind === 'city', 'в городе');
  const w = found.contents.buildings[0];
  walkCity(h, cityStepsTo({ x: dg.x, y: dg.y }, w.x, w.y));
  key(h, 'KeyE');
  assert.equal(G.buildingUI.isActive(), true, 'RED: [E] — открыл buildingUI');
  key(h, 'KeyE');
  assert.equal(G.buildingUI.isActive(), false, 'повторный [E] — закрыл buildingUI');
  assert.equal(G.npcUI.isActive(), false, 'npcUI не открыт');
  key(h, 'KeyE');
  assert.equal(G.buildingUI.isActive(), true, '[E] — открыл снова');
  key(h, 'Digit1');
  assert.equal(G.npcUI.isActive(), true, '«Диалог» — npcUI открыт');
  key(h, 'KeyE');
  assert.equal(G.npcUI.isActive(), false, '[E] при открытом npcUI — закрыл npcUI');
  assert.equal(G.buildingUI.isActive(), false, 'buildingUI при этом не открыт');
});

test('CI-V7. с открытым buildingUI/npcUI движение НЕ двигает героя (гейт cityOnMove)', async () => {
  const h = await bootChain();
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  const myMap = G.createMap(G.generateSeedPixels());
  const found = findCityFor(G, myMap, g.state.player,
    (c) => c.fp >= 2 && c.contents.buildings.length >= 1);
  assert.ok(found, 'сценарий: город (fp>=2) с постройкой');
  walkTiles(h, NOW, found.steps);
  const dg = g.dungeon;
  assert.ok(dg && dg.kind === 'city', 'в городе');
  const w = found.contents.buildings[0];
  walkCity(h, cityStepsTo({ x: dg.x, y: dg.y }, w.x, w.y));
  const dir = stepDirInside(dg, { x: w.x, y: w.y });
  assert.ok(dir, 'сценарий: направление шага внутрь города существует');
  const code = keydownFor(dir[0], dir[1]);

  key(h, 'KeyE');
  assert.equal(G.buildingUI.isActive(), true, 'RED: buildingUI открыт');
  let pos = { x: g.dungeon.x, y: g.dungeon.y };
  key(h, code);
  assert.deepEqual({ x: g.dungeon.x, y: g.dungeon.y }, pos,
    'RED: buildingUI открыт — движение заблокировано (гейта cityOnMove нет)');

  key(h, 'KeyE'); // закрыть buildingUI
  assert.equal(G.buildingUI.isActive(), false, 'buildingUI закрыт');
  key(h, 'KeyE'); // открыть снова
  assert.equal(G.buildingUI.isActive(), true, 'buildingUI открыт');
  key(h, 'Digit1');
  assert.equal(G.npcUI.isActive(), true, 'npcUI открыт');
  pos = { x: g.dungeon.x, y: g.dungeon.y };
  key(h, 'KeyW');
  assert.deepEqual({ x: g.dungeon.x, y: g.dungeon.y }, pos,
    'RED: npcUI открыт — движение заблокировано');
});

test('CI-V8. содержимое на входе: __game.dungeon.buildings = generateCityContents recompute; entrance/exit — без построек; buildingId ∈ пул', async () => {
  const h = await bootChain();
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  const myMap = G.createMap(G.generateSeedPixels());
  const found = findCityFor(G, myMap, g.state.player,
    (c) => c.fp >= 2 && c.contents.buildings.length >= 1);
  assert.ok(found, 'сценарий: город (fp>=2) с постройкой');
  walkTiles(h, NOW, found.steps);
  const dg = g.dungeon;
  assert.ok(dg && dg.kind === 'city', 'в городе');
  // Свойства recompute (чистые функции 000106 — те же входы, что и
  // production на входе: layout(якорь), wealth якоря).
  const expected = found.contents.buildings;
  for (const b of expected) {
    assert.ok([1, 7, 10, 25, 44].includes(b.buildingId),
      'buildingId из городского пула: ' + b.buildingId);
    assert.ok(!(b.x === dg.entrance.x && b.y === dg.entrance.y),
      'на entrance постройка не стоит (000106)');
    assert.ok(!(b.x === dg.exit.x && b.y === dg.exit.y),
      'на exit постройка не стоит (000106)');
  }
  assert.deepEqual(dg.buildings, expected,
    'RED: __game.dungeon.buildings — содержимое города в рантайме');
});

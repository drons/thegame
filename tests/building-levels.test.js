// Задача 000222: города — уровни зданий (улучшение, стоимость ×2,
// максимум 7).
//
// Источник правды: tasks/pending/000222.md; контракты и дизайн:
// memory/000222-building-levels.md (D-A..D-J, §2 контракты/тексты,
// §6 красные).
//
// КРАСНЫЕ тесты (TDD): написаны ДО реализации. Причины падения на
// текущем коде — отсутствие функциональности (не синтаксис/среда):
//   * R1 — C.upgradeCost отсутствует (undefined);
//   * R2 — C.MAX_BUILDING_LEVEL / C.buildingLevelAt отсутствуют;
//   * R3 — C.upgradeBuildingAt отсутствует;
//   * R4 — C.storageCapacity(55, 2) — 2-й аргумент игнорируется
//     (40 вместо 60);
//   * R5 — [E] player-55 (level 2): «Сложить» ограничен 40
//     (storageMenuRows — 1-аргументная capacity);
//   * R6 — C.makeCityShop.length — 6 (7-го аргумента level нет);
//     реестр shopLevels отсутствует;
//   * R7 — C.syncShopLevels / C.setShopLevel отсутствуют;
//   * R8 — applyMentorSpell без level-гейта (cap 4): фейк-спелл L5
//     выдан БЕЗ st.level / на level 4 (ожидается отказ);
//   * R9 — apply-state пайплайна без поля level (undefined вместо
//     уровня записи);
//   * R10 — validateCityState ТИХО отбрасывает level built-записей
//     (канон-копия 4 ключа, предупреждений нет);
//   * R11 — [E]-меню player-постройки без строки «Улучшить…»
//     (upgradeActionRow отсутствует);
//   * R12 — onAction({id:'upgrade'}) — «НЕТ ДЕЙСТВИЯ» (special
//     'upgrade' не зарегистрирован): ничего не списано/не сохранено;
//   * R13 — idem: flash-отказы specialty отсутствуют;
//   * R14 — vm: строка «Улучшить…» в [E] отсутствует (upgrade
//     не реализован);
//   * R15 — vm idem (магазин: wealth-бамп/реестр отсутствуют);
//   * R16 — vm idem (ментор: проводка level отсутствует);
//   * R17 — правка по итогам ревью: реестр shopLevels после СНОСА —
//     без синка makeCityShop при перестройке читает СТАРЫЙ уровень
//     (wealth-бамп) и строка улучшения дорожает по стагнувшему
//     реестру;
//   * R18 — правка по итогам ревью: daily-марк на 'upgrade' НЕ
//     пишется (исключение в хвосте пайплайна — пин).
//
// Фикстуры: fake deps-бандл (паттерн tests/city-storage.test.js) +
// РЕАЛЬНЫЕ модули (cities.js/buildings.js/items.js/player.js/
// building-effects.js/building-actions.js). vm-секция R14..R16 —
// full-chain песочница index.html (паттерн tests/city-interact.test.js).
//
// GREEN-фаза (только 3 технических репина — memory §3):
// city-storage R6 ids + 'upgrade'; cities.test.js makeCityShop.length
// 6→7; spec-split строки buildings.md.

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
const { SAVE_KEY } = require('../src/save.js');

// 40 РАЗНЫХ предметов (паттерн tests/city-storage.test.js) — заполнение
// хранилища; +3 — 43-й набор для vm-сценария (R14: 42 × put + 1 остаток).
const REAGENT_SEED = ['sulfur', 'hide', 'wood_log', 'moonstone',
  'stone_chunk', 'herb_healing', 'iron_ore', 'coal', 'herb_mana',
  'herb_bitter'];
const BATCH_A = ['bread', 'meat', 'honey_cake', 'minor_healing',
  'mana_potion', 'alchemy_manual', 'archery_manual', 'fireball_scroll',
  'frost_bolt_scroll', 'berry_red'];
const BATCH_B = ['wood_sword', 'iron_sword', 'steel_sword', 'short_bow',
  'hunting_bow', 'leather_armor', 'chainmail', 'healing_potion',
  'greater_healing', 'mana_elixir', 'sword_treatise', 'fire_spellbook',
  'ice_spellbook', 'stone_chisel', 'flame_burst_scroll', 'blizzard_scroll',
  'silver_ore', 'quartz', 'berry_blue', 'fruit_apple'];
const ALL40 = REAGENT_SEED.concat(BATCH_A, BATCH_B);
const EXTRA3 = ['berry_wild', 'fruit_plum', 'mushroom_grey'];
const STORE43 = ALL40.concat(EXTRA3);

// console.warn-шпион (паттерн withWarns tests/cities.test.js).
function withWarns(fn) {
  const warns = [];
  const orig = console.warn;
  console.warn = (...a) => { warns.push(a.join(' ')); };
  let res;
  try { res = fn(); } finally { console.warn = orig; }
  return { res, warns };
}

// globalThis.Game — set/restore (паттерн tests/spells-any-party.test.js).
function withGame(fake, fn) {
  const had = Object.prototype.hasOwnProperty.call(globalThis, 'Game');
  const prev = globalThis.Game;
  globalThis.Game = fake;
  try {
    return fn();
  } finally {
    if (had) globalThis.Game = prev;
    else delete globalThis.Game;
  }
}

// ============================================================
// Фикстура: fake deps + РЕАЛЬНЫЕ модули (паттерн city-storage)
// ============================================================

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

// Счётчики pipeline-хвоста (saveNow/flash/playerRender) — пин
// «отказ — без saveNow», «успех — ровно 1 saveNow + 1 flash».
function makeDeps(over = {}) {
  const o = makeOverlayStubs(over);
  const ds = makeCityDs(over);
  const counters = { saveNow: 0, flash: [], playerRender: 0 };
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
    saveNow: () => { counters.saveNow += 1; },
    flash: (m) => { counters.flash.push(m); },
    buildingOncePerDay: new Map(),
    buffs: [],
    teleports: new Map(),
    buildingQuests: new Map(),
    playerRender: () => { counters.playerRender += 1; },
    moveHero: () => {},
    startCombat: () => {},
    getMap: () => ((x, y) => ({ x, y, passable: true, hasBuilding: false })),
    mover: null,
  };
  return { deps, o, ds, counters };
}

// Город 18×18 (fp5, якорь 100,-40); hero = createCharacter;
// РЕАЛЬНЫЕ flat-items + Cities + каталог на deps.game.
function initBLFixture(over = {}) {
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
  BA.init(env.deps);
  return Object.assign({ BA }, env);
}

// Якорь города (worldKey + buildingAnchor) — interactCity резолвит
// cityAnchor '100,-40'.
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

function openMenu(t) {
  t.BA.interactCity();
  return lastOverlay(t);
}

// ============================================================
// R1. upgradeCost: формула L→L+1 = buildCost × 2^(L−1), всё сразу
// ============================================================

test('000222-R1. upgradeCost: L=1 ≡ buildCost; L2 ×2 / L3 ×4 / L6 ×32 (золото И исходники; 48/55/38/1); L≥7 → null; не-целые/id вне каталога → throw', () => {
  assert.equal(typeof C.upgradeCost, 'function',
    'RED: cities.js upgradeCost отсутствует');
  assert.deepEqual(C.upgradeCost(48, 1), C.buildCost(48),
    'L=1 ≡ buildCost(48)');
  assert.deepEqual(C.upgradeCost(48, 1),
    { золото: 30, исходники: [{ предмет: 'stone_chunk', количество: 1 }] });
  assert.deepEqual(C.upgradeCost(48, 2),
    { золото: 60, исходники: [{ предмет: 'stone_chunk', количество: 2 }] },
    '48: L2 = 30×2 з., stone_chunk ×2');
  assert.deepEqual(C.upgradeCost(48, 3),
    { золото: 120, исходники: [{ предмет: 'stone_chunk', количество: 4 }] });
  assert.deepEqual(C.upgradeCost(48, 6),
    { золото: 960, исходники: [{ предмет: 'stone_chunk', количество: 32 }] },
    '48: L6→7 = ×32');
  assert.deepEqual(C.upgradeCost(55, 2),
    { золото: 200, исходники: [
      { предмет: 'wood_log', количество: 4 },
      { предмет: 'stone_chunk', количество: 4 },
    ] }, '55: L2 — ВСЕ ресурсы ×2');
  assert.deepEqual(C.upgradeCost(38, 2),
    { золото: 160, исходники: [{ предмет: 'herb_bitter', количество: 4 }] });
  assert.deepEqual(C.upgradeCost(1, 4),
    { золото: 400, исходники: [{ предмет: 'wood_log', количество: 16 }] },
    '1: L4 = 50×16 з., wood_log 2×16');
  assert.equal(C.upgradeCost(55, 7), null, 'L=7 → null (макс)');
  assert.equal(C.upgradeCost(48, 8), null, 'L>7 → null');
  assert.throws(() => C.upgradeCost(55, 1.5), 'level 1.5 → throw');
  assert.throws(() => C.upgradeCost(55, 0), 'level 0 → throw');
  assert.throws(() => C.upgradeCost(55, -1), 'level −1 → throw');
  assert.throws(() => C.upgradeCost(1.5, 1), 'id 1.5 → throw');
  assert.throws(() => C.upgradeCost(999, 1), 'id вне каталога → throw');
});

// ============================================================
// R2. MAX_BUILDING_LEVEL + buildingLevelAt
// ============================================================

test('000222-R2. MAX_BUILDING_LEVEL === 7; buildingLevelAt: record null/{} / built не массив → null; не покрыто → null; без level → 1; level:3 → 3; мусор (0/8/2.5/«три»/null) → 1; footprint 2×2 (18); поиск с конца', () => {
  assert.equal(C.MAX_BUILDING_LEVEL, 7,
    'RED: cities.js MAX_BUILDING_LEVEL отсутствует');
  assert.equal(typeof C.buildingLevelAt, 'function',
    'RED: cities.js buildingLevelAt отсутствует');
  assert.equal(C.buildingLevelAt(null, 1, 1), null);
  assert.equal(C.buildingLevelAt({}, 1, 1), null);
  assert.equal(C.buildingLevelAt({ built: 'x' }, 1, 1), null);
  const rec = { built: [
    { x: 1, y: 1, buildingId: 55, player: true },
    { x: 3, y: 3, buildingId: 1, player: true, level: 3 },
    { x: 5, y: 5, buildingId: 55, player: true, level: 8 },
  ] };
  assert.equal(C.buildingLevelAt(rec, 9, 9), null,
    'клетка без записи → null');
  assert.equal(C.buildingLevelAt(rec, 1, 1), 1,
    'запись без level → 1');
  assert.equal(C.buildingLevelAt(rec, 3, 3), 3, 'level:3 → 3');
  assert.equal(C.buildingLevelAt(rec, 5, 5), 1,
    'level:8 (мусор >7) → 1');
  const rec2 = { built: [
    { x: 1, y: 1, buildingId: 55, player: true, level: 0 },
    { x: 2, y: 2, buildingId: 55, player: true, level: 2.5 },
    { x: 3, y: 3, buildingId: 55, player: true, level: 'три' },
    { x: 4, y: 4, buildingId: 55, player: true, level: null },
  ] };
  for (const [x, y] of [[1, 1], [2, 2], [3, 3], [4, 4]]) {
    assert.equal(C.buildingLevelAt(rec2, x, y), 1,
      'мусорный level → 1 (' + x + ',' + y + ')');
  }
  // Multi-cell footprint: 18 Башня мага 2×2, якорь (1,1), level 5.
  const rec3 = { built: [{ x: 1, y: 1, buildingId: 18, player: true,
    level: 5 }] };
  assert.equal(C.buildingLevelAt(rec3, 2, 2), 5,
    'footprint: внутренний угол (2,2) → 5');
  assert.equal(C.buildingLevelAt(rec3, 1, 2), 5);
  assert.equal(C.buildingLevelAt(rec3, 2, 1), 5);
  assert.equal(C.buildingLevelAt(rec3, 3, 3), null,
    'вне footprint → null');
  // Поиск с конца: две записи на одной клетке — ПОСЛЕДНЯЯ побеждает.
  const rec4 = { built: [
    { x: 1, y: 1, buildingId: 55, player: true, level: 3 },
    { x: 1, y: 1, buildingId: 1, player: true, level: 6 },
  ] };
  assert.equal(C.buildingLevelAt(rec4, 1, 1), 6,
    'запись с конца → 6');
});

// ============================================================
// R3. upgradeBuildingAt: чистое ядро
// ============================================================

test('000222-R3. upgradeBuildingAt: вход НЕ мутируется; новый record {record, buildingId, x, y (ЯКОРЬ footprint), oldLevel, newLevel}; без level 1→2; level:3 → 4; level:7 → null; (x,y) не покрыт/record null/пустой built → null; не-целое x → throw; прочее сохранено', () => {
  assert.equal(typeof C.upgradeBuildingAt, 'function',
    'RED: cities.js upgradeBuildingAt отсутствует');
  const base = {
    lastVisitDay: 5,
    stock: { '2,2': { bread: 3 } },
    built: [
      { x: 1, y: 1, buildingId: 55, player: true, storage: [] },
      { x: 3, y: 3, buildingId: 1, player: true },
    ],
  };
  const base0 = JSON.parse(JSON.stringify(base));
  const res = C.upgradeBuildingAt(base, 1, 1);
  assert.deepEqual(base, base0, 'вход не мутирован (чистота)');
  assert.notEqual(res, base, 'новый record (не вход)');
  assert.ok(res && typeof res === 'object');
  assert.equal(res.buildingId, 55);
  assert.equal(res.x, 1, 'x — якорь записи');
  assert.equal(res.y, 1, 'y — якорь записи');
  assert.equal(res.oldLevel, 1, 'запись без level → oldLevel 1');
  assert.equal(res.newLevel, 2);
  assert.deepEqual(res.record.built[0],
    { x: 1, y: 1, buildingId: 55, player: true, storage: [], level: 2 });
  assert.equal(res.record.lastVisitDay, 5, 'transient-пара сохранена');
  assert.deepEqual(res.record.stock, { '2,2': { bread: 3 } });
  assert.deepEqual(res.record.built[1],
    { x: 3, y: 3, buildingId: 1, player: true },
    'чужая built-запись не тронута');
  const res3 = C.upgradeBuildingAt(
    { built: [{ x: 1, y: 1, buildingId: 55, player: true, level: 3 }] },
    1, 1);
  assert.equal(res3.oldLevel, 3, 'level:3 → oldLevel 3');
  assert.equal(res3.newLevel, 4);
  assert.equal(
    C.upgradeBuildingAt(
      { built: [{ x: 1, y: 1, buildingId: 55, player: true, level: 7 }] },
      1, 1),
    null, 'level:7 → null (макс)');
  assert.equal(C.upgradeBuildingAt(base, 9, 9), null,
    '(x,y) не покрыт → null');
  assert.equal(C.upgradeBuildingAt(null, 1, 1), null);
  assert.equal(C.upgradeBuildingAt({ built: [] }, 1, 1), null);
  assert.throws(() => C.upgradeBuildingAt(base, 1.5, 1),
    'не-целое x → throw');
  const res18 = C.upgradeBuildingAt(
    { built: [{ x: 1, y: 1, buildingId: 18, player: true, level: 3 }] },
    2, 2);
  assert.ok(res18, 'multi-cell: запрос с внутреннего угла (2,2)');
  assert.equal(res18.x, 1, 'x — якорь (верхний-левый)');
  assert.equal(res18.y, 1);
  assert.equal(res18.oldLevel, 3);
  assert.equal(res18.newLevel, 4);
  assert.deepEqual(res18.record.built[0],
    { x: 1, y: 1, buildingId: 18, player: true, level: 4 });
});

// ============================================================
// R4. storageCapacity(buildingId, level)
// ============================================================

test('000222-R4. storageCapacity(55, L): 40/60/80/100/120/140/160 (L1..7); 1-аргументно === 40 (регрессия 000221); id вне каталога → 0; 48 (без хранилища) → 0; level null/0/8/2.5 → кламп в 1 (40)', () => {
  assert.equal(C.storageCapacity(55), 40,
    '1-аргументно — 40 (регрессия 000221)');
  const caps = [[1, 40], [2, 60], [3, 80], [4, 100], [5, 120],
    [6, 140], [7, 160]];
  for (const [L, cap] of caps) {
    assert.equal(C.storageCapacity(55, L), cap,
      'RED: storageCapacity(55, ' + L + ') — ' + cap
      + ' (прирост 20×(L−1))');
  }
  assert.equal(C.storageCapacity(999, 3), 0, 'id вне каталога → 0');
  assert.equal(C.storageCapacity(48, 3), 0,
    '48 (без хранилища) → 0 на любом уровне');
  assert.equal(C.storageCapacity(55, null), 40, 'level null → кламп 1');
  assert.equal(C.storageCapacity(55, 0), 40, 'level 0 → кламп 1');
  assert.equal(C.storageCapacity(55, 8), 40, 'level 8 → кламп 1');
  assert.equal(C.storageCapacity(55, 2.5), 40, 'level 2.5 → кламп 1');
});

// ============================================================
// R5. [E]-меню player-55 (level 2): «Сложить» до 60
// ============================================================

test('000222-R5. [E] player-55 (level:2): «Сложить» доступно при 40 записях (reason НЕТ); 60 записей → «хранилище полное (60/60)»; контраст БЕЗ level: 40 записей → «хранилище полное (40/40)»', () => {
  const mk = (level, n) => {
    const built = [{ x: 1, y: 1, buildingId: 55, player: true }];
    if (level !== undefined) built[0].level = level;
    built[0].storage = ALL40.concat(BATCH_B).slice(0, n)
      .map((id) => ({ id, qty: 1 }));
    return built;
  };
  // (a) level 2, storage 40 → доступно (60).
  const t1 = initBLFixture({
    x: 1, y: 1,
    cityContents: [{ x: 1, y: 1, buildingId: 55, player: true }],
  });
  wireCityAnchor(t1, 100, -40);
  t1.deps.cityStates = new Map([['100,-40',
    { lastVisitDay: 5, stock: {}, built: mk(2, 40) }]]);
  IT.addItem(t1.hero, 'bread', 1);
  const p1 = openMenu(t1);
  assert.ok(p1, 'RED: [E] — buildingUI открыт');
  const r1 = p1.actions.find((a) => a.id === 'put-0');
  assert.ok(r1, 'строка «Сложить» (put-0)');
  assert.equal(r1.доступен, true,
    'RED: level 2 — 40/60 доступно (текущий: capacity 40)');
  assert.equal(r1.reason, undefined, 'RED: reason отсутствует');
  // (b) level 2, storage 60 → полное (60/60).
  const t2 = initBLFixture({
    x: 1, y: 1,
    cityContents: [{ x: 1, y: 1, buildingId: 55, player: true }],
  });
  wireCityAnchor(t2, 100, -40);
  t2.deps.cityStates = new Map([['100,-40',
    { lastVisitDay: 5, stock: {}, built: mk(2, 60) }]]);
  IT.addItem(t2.hero, 'bread', 1);
  const r2 = openMenu(t2).actions.find((a) => a.id === 'put-0');
  assert.ok(r2, 'строка «Сложить» (put-0)');
  assert.equal(r2.доступен, false, '60/60 — недоступно');
  assert.equal(r2.reason, 'хранилище полное (60/60)',
    'RED: «(60/60)» — capacity по level 2');
  // (c) без level, storage 40 → полное (40/40) — регрессия 000221.
  const t3 = initBLFixture({
    x: 1, y: 1,
    cityContents: [{ x: 1, y: 1, buildingId: 55, player: true }],
  });
  wireCityAnchor(t3, 100, -40);
  t3.deps.cityStates = new Map([['100,-40',
    { lastVisitDay: 5, stock: {}, built: mk(undefined, 40) }]]);
  IT.addItem(t3.hero, 'bread', 1);
  const r3 = openMenu(t3).actions.find((a) => a.id === 'put-0');
  assert.equal(r3.доступен, false);
  assert.equal(r3.reason, 'хранилище полное (40/40)',
    'без level — 40/40 (бит-в-бит 000221)');
});

// ============================================================
// R6. makeCityShop: 7-й аргумент level + реестр shopLevels
// ============================================================

test('000222-R6. makeCityShop: length 7; level absent/1 ≡ 6-арг. (бит-в-бит); level 7 → wealth 3 (универсам, deepEqual makeShop(...,3)) + детерминизм; реестр: syncShopLevels → 6-арг. wealth по уровню клетки; чужая клетка/город — бит-в-бит; явный аргумент сильнее реестра; setShopLevel 0/null — delete', () => {
  assert.equal(C.makeCityShop.length, 7,
    'RED: makeCityShop — 7 аргументов (7-й — level, optional)');
  const a6 = C.makeCityShop(500, -100, 2, 3, 1, 1);
  const a7 = C.makeCityShop(500, -100, 2, 3, 1, 1, 1);
  assert.ok(a6 && a6.stock, 'магазин (map_index 0)');
  assert.deepEqual(a7, a6, 'level 1 ≡ 6-арг. (бит-в-бит)');
  assert.notEqual(a7, a6, 'новый объект');
  const l7a = C.makeCityShop(500, -100, 2, 3, 1, 1, 7);
  const l7b = C.makeCityShop(500, -100, 2, 3, 1, 1, 7);
  assert.equal(l7a.wealth, 3,
    'RED: level 7 → effWealth = min(3, 1+3) = 3');
  assert.deepEqual(l7a.stock, l7b.stock, 'детерминизм');
  assert.notEqual(l7a, l7b, 'новый объект');
  assert.deepEqual(l7a.stock,
    IT.makeShop(500 * 256 + 2, -100 * 256 + 3, 0, 3).stock,
    'RED: сток L7 — универсам (allItems, wealth 3)');
  assert.equal(C.makeCityShop(500, -100, 2, 3, 1, 1, 3).wealth, 2,
    'level 3, wealth 1 → min(3, 1+1) = 2');
  assert.equal(C.makeCityShop(500, -100, 2, 3, 1, 2, 3).wealth, 3,
    'level 3, wealth 2 → 3');
  assert.equal(C.makeCityShop(500, -100, 2, 3, 1, 3, 5).wealth, 3,
    'wealth 3 — потолок');
  // Реестр (module state — координаты клетки, НЕ buildingId).
  C.syncShopLevels(500, -100, { built: [
    { x: 2, y: 3, buildingId: 1, player: true, level: 5 },
  ] });
  assert.equal(C.makeCityShop(500, -100, 2, 3, 1, 1).wealth, 3,
    'RED: реестр — 6-арг. wealth = min(3, 1+f(5)) = 3');
  assert.equal(C.makeCityShop(500, -100, 9, 9, 1, 1).wealth, 1,
    'чужая клетка — бит-в-бит');
  assert.equal(C.makeCityShop(501, -101, 2, 3, 1, 1).wealth, 1,
    'чужой город — бит-в-бит');
  assert.equal(C.makeCityShop(500, -100, 2, 3, 1, 1, 2).wealth, 1,
    'явный level 2 сильнее реестра (level 5): min(3, 1+0) = 1');
  C.setShopLevel(500, -100, 2, 3, 4);
  assert.equal(C.makeCityShop(500, -100, 2, 3, 1, 1).wealth, 2,
    'setShopLevel 4 → min(3, 1+1) = 2');
  C.setShopLevel(500, -100, 2, 3, 0);
  assert.equal(C.makeCityShop(500, -100, 2, 3, 1, 1).wealth, 1,
    'setShopLevel 0 — delete');
  C.setShopLevel(500, -100, 2, 3, null);
  assert.equal(C.makeCityShop(500, -100, 2, 3, 1, 1).wealth, 1,
    'setShopLevel null — delete');
  C.syncShopLevels(500, -100, null);
});

// ============================================================
// R7. syncShopLevels: семантика реестра
// ============================================================

test('000222-R7. syncShopLevels: очистка префикса (stale-ключи); ВСЕ клетки footprint (18, 2×2); мусорный level → 1; запись без level → 1; record null → только очистка; идемпотентность; чужой город — бит-в-бит', () => {
  assert.equal(typeof C.syncShopLevels, 'function',
    'RED: cities.js syncShopLevels отсутствует');
  assert.equal(typeof C.setShopLevel, 'function',
    'RED: cities.js setShopLevel отсутствует');
  const obs = (x, y) => C.makeCityShop(600, -200, x, y, 1, 1).wealth;
  // Footprint 18 (2×2, якорь 1,1), level 4 → f(4)=1 → 1+1 = 2.
  C.syncShopLevels(600, -200, { built: [
    { x: 1, y: 1, buildingId: 18, player: true, level: 4 },
  ] });
  assert.equal(obs(1, 1), 2, 'footprint (1,1)');
  assert.equal(obs(2, 1), 2, 'RED: footprint (2,1) — ВСЕ клетки');
  assert.equal(obs(1, 2), 2, 'footprint (1,2)');
  assert.equal(obs(2, 2), 2, 'footprint (2,2)');
  assert.equal(obs(3, 3), 1, 'вне footprint — бит-в-бит');
  // Мусорный level → 1; запись без level → 1.
  C.syncShopLevels(600, -200, { built: [
    { x: 1, y: 1, buildingId: 18, player: true, level: 9 },
    { x: 5, y: 5, buildingId: 44, player: true },
  ] });
  assert.equal(obs(2, 2), 1, 'мусорный level 9 → 1');
  assert.equal(obs(5, 5), 1, 'запись без level → 1');
  // Идемпотентность (повторный sync той же записи).
  C.syncShopLevels(600, -200, { built: [
    { x: 1, y: 1, buildingId: 1, player: true, level: 7 },
    { x: 5, y: 5, buildingId: 44, player: true },
  ] });
  assert.equal(obs(1, 1), 3, 'level 7 → min(3, 1+3) = 3');
  C.syncShopLevels(600, -200, { built: [
    { x: 1, y: 1, buildingId: 1, player: true, level: 7 },
    { x: 5, y: 5, buildingId: 44, player: true },
  ] });
  assert.equal(obs(1, 1), 3, 'идемпотентность');
  assert.equal(obs(5, 5), 1);
  assert.equal(C.makeCityShop(601, -201, 1, 1, 1, 1).wealth, 1,
    'чужой город — бит-в-бит');
  // record null — ТОЛЬКО очистка префикса.
  C.syncShopLevels(600, -200, null);
  assert.equal(obs(1, 1), 1, 'после null — (1,1) очищен');
  assert.equal(obs(5, 5), 1, 'после null — (5,5) очищен');
});

// ============================================================
// R8. Ментор-гейт: cap = max(4, level)
// ============================================================

test('000222-R8. ментор: БЕЗ st.level → cap 4 → фейк L5 отказ «…заклинаний нет (ранг школы/базовое)»; level 7 → успех (spellId/price 50/«Наставник передал: «Фейк L5»»); level 4 → отказ; спелл без уровня / не найден → fail-open; мало золота → «недостаточно золота»', () => {
  const catalog = {
    id: 38, название: 'Храм горы',
    особые_параметры: { наставник: { заклинания: ['fake_l5'],
      цена: 50 } },
  };
  const hero = PLR.createCharacter(); // gold 100 ≥ 50
  const GFAKE = {
    Spells: {
      canLearn: () => ({ ok: true }),
      getSpell: (id) => (id === 'fake_l5'
        ? { название: 'Фейк L5', уровень: 5 } : null),
    },
  };
  const r1 = withGame(GFAKE, () => BE.applyMentorSpell(
    { catalog, hero }));
  assert.deepEqual(r1, {
    ok: false,
    message: 'Наставник: новых заклинаний нет (ранг школы/базовое)',
  }, 'RED: без level — cap 4 < L5 → отказ (текущий: спелл выдан)');
  const r2 = withGame(GFAKE, () => BE.applyMentorSpell(
    { catalog, hero, level: 7 }));
  assert.deepEqual(r2, {
    ok: true, success: true, spellId: 'fake_l5', price: 50,
    message: 'Наставник передал: «Фейк L5»',
  }, 'level 7 — cap 7 ≥ 5 → успех');
  const r3 = withGame(GFAKE, () => BE.applyMentorSpell(
    { catalog, hero, level: 4 }));
  assert.deepEqual(r3, {
    ok: false,
    message: 'Наставник: новых заклинаний нет (ранг школы/базовое)',
  }, 'RED: level 4 — cap max(4,4)=4 → отказ');
  // Fail-open: спелл БЕЗ уровня / спелл не найден (getSpell null).
  const G4 = {
    Spells: {
      canLearn: () => ({ ok: true }),
      getSpell: (id) => (id === 'fake_nolevel'
        ? { название: 'Без уровня' } : null),
    },
  };
  const r4 = withGame(G4, () => BE.applyMentorSpell({
    catalog: { особые_параметры: { наставник: {
      заклинания: ['fake_nolevel'], цена: 50 } } },
    hero, level: 7,
  }));
  assert.deepEqual(r4, {
    ok: true, success: true, spellId: 'fake_nolevel', price: 50,
    message: 'Наставник передал: «Без уровня»',
  }, 'спелл без уровня → fail-open (picked)');
  const r4b = withGame(G4, () => BE.applyMentorSpell({
    catalog: { особые_параметры: { наставник: {
      заклинания: ['missing'], цена: 50 } } },
    hero, level: 7,
  }));
  assert.equal(r4b.ok, true, 'getSpell null → fail-open');
  assert.equal(r4b.message, 'Наставник передал: «missing»');
  const poor = PLR.createCharacter();
  poor.gold = 30;
  const r5 = withGame(GFAKE, () => BE.applyMentorSpell(
    { catalog, hero: poor, level: 7 }));
  assert.deepEqual(r5, { ok: false, message: 'недостаточно золота' },
    'gold 30 < 50 → «недостаточно золота»');
});

// ============================================================
// R9. Проводка level в apply-state
// ============================================================

test('000222-R9. apply-state.level: t.cityAnchor + record built level:3 → 3; мир (cityAnchor null) → null; record БЕЗ built → null', () => {
  const t = initBLFixture({
    x: 1, y: 1,
    cityContents: [{ x: 1, y: 1, buildingId: 55, player: true }],
  });
  wireCityAnchor(t, 100, -40);
  t.deps.cityStates = new Map([['100,-40',
    { lastVisitDay: 5, stock: {}, built: [
      { x: 1, y: 1, buildingId: 55, player: true, level: 3 },
    ] }]]);
  let captured = null;
  BE.EFFECTS['__test_capture'] = {
    apply: (st) => { captured = st; return { ok: true }; },
  };
  try {
    t.BA.onBuildingAction(
      { id: '__test_capture' },
      { x: 1, y: 1, cityAnchor: '100,-40' },
      B.getBuilding(55), null);
    assert.equal(captured && captured.level, 3,
      'RED: apply-state.level — уровень записи (3)');
    t.BA.onBuildingAction(
      { id: '__test_capture' },
      { x: 1, y: 1 },
      B.getBuilding(55), null);
    assert.equal(captured.level, null,
      'мировое (cityAnchor null) — level null');
    t.deps.cityStates = new Map([['100,-40',
      { lastVisitDay: 5, stock: {} }]]);
    t.BA.onBuildingAction(
      { id: '__test_capture' },
      { x: 1, y: 1, cityAnchor: '100,-40' },
      B.getBuilding(55), null);
    assert.equal(captured.level, null,
      'record без built — level null');
  } finally {
    delete BE.EFFECTS['__test_capture'];
  }
});

// ============================================================
// R10. Персист: level через serializeCityStates/restoreCityStates
// ============================================================

test('000222-R10. персист: built level:3 → канон-копия с level:3; мусор (8/0/2.5/«три») → console.warn («cities») + поле отброшено (запись жива, 4 ключа); без level → ровно 4 ключа (бит-в-бит 000221); roundtrip serialize→restore: level жив (в т.ч. persistent-only)', () => {
  const day = 5;
  const rd = 300;
  // (a) level:3 — канон-копия с level.
  const serA = C.serializeCityStates(new Map([['100,-40',
    { lastVisitDay: 5, stock: {}, built: [
      { x: 1, y: 1, buildingId: 55, player: true, level: 3 },
    ] }]]), day, rd);
  assert.deepEqual(serA['100,-40'].built[0],
    { x: 1, y: 1, buildingId: 55, player: true, level: 3 },
    'RED: level:3 переживает сериализацию');
  // (b) мусорные level — warn («cities») + поле отброшено, запись жива.
  const { res: serB, warns } = withWarns(() =>
    C.serializeCityStates(new Map([['100,-40',
      { lastVisitDay: 5, stock: {}, built: [
        { x: 1, y: 1, buildingId: 55, player: true, level: 8 },
        { x: 2, y: 2, buildingId: 55, player: true, level: 0 },
        { x: 3, y: 3, buildingId: 55, player: true, level: 2.5 },
        { x: 4, y: 4, buildingId: 55, player: true, level: 'три' },
      ] }]]), day, rd));
  assert.equal(warns.length, 4,
    'RED: 4 предупреждения (по одному на битый level)');
  for (const w of warns) {
    assert.ok(w.includes('cities'),
      'warn содержит «cities»: ' + w);
  }
  for (const e of serB['100,-40'].built) {
    assert.deepEqual(Object.keys(e).sort(),
      ['buildingId', 'player', 'x', 'y'],
      'RED: мусорный level отброшен — 4 ключа');
  }
  assert.equal(serB['100,-40'].built.length, 4, 'записи живы');
  // (c) без level — ровно 4 ключа (бит-в-бит 000221).
  const { res: serC, warns: warnsC } = withWarns(() =>
    C.serializeCityStates(new Map([['100,-40',
      { lastVisitDay: 5, stock: {}, built: [
        { x: 1, y: 1, buildingId: 55, player: true },
      ] }]]), day, rd));
  assert.deepEqual(serC['100,-40'].built[0],
    { x: 1, y: 1, buildingId: 55, player: true });
  assert.equal(warnsC.length, 0);
  // (d) roundtrip: level жив.
  const back = C.restoreCityStates(serA, day, rd);
  assert.equal(back.get('100,-40').built[0].level, 3,
    'RED: restore — level:3');
  // (e) persistent-only (без transient-пары) — level жив.
  const serE = C.serializeCityStates(new Map([['100,-40',
    { built: [{ x: 1, y: 1, buildingId: 55, player: true, level: 5 }] }
  ]]), day, rd);
  assert.equal(serE['100,-40'].built[0].level, 5,
    'persistent-only — level:5');
});

// ============================================================
// R11. [E]-меню: строка «Улучшить…»
// ============================================================

test("000222-R11. [E]: player-55 (пустой инвентарь) → ids ['storage','upgrade','demolish']; с материалами gold 1000 → строка «Улучшить до уровня 2 — 100 з. (Бревно ×2, Каменный обломок ×2)» доступен (ПОЗИЦИЯ: до «Сложить»); level 2 → «уровня 3 — 200 з. (Бревно ×4, Каменный обломок ×4)»; level 7 → «Улучшить: Хранилище» disabled «максимальный уровень (7)»; player-48 → ['48','demolish'] (строк upgrade НЕТ, эффект «48» — как у базовых); базовое 55 / без cityStates → строки НЕТ; нехватка → «Не хватает …»", () => {
  const mk = (over, built) => {
    const t = initBLFixture(over);
    wireCityAnchor(t, 100, -40);
    if (built !== undefined) {
      t.deps.cityStates = new Map([['100,-40',
        { lastVisitDay: 5, stock: {}, built }]]);
    }
    return t;
  };
  const over55 = { x: 1, y: 1,
    cityContents: [{ x: 1, y: 1, buildingId: 55, player: true }] };
  const idsOf = (t) => openMenu(t).actions.map((a) => a.id);
  const rowOf = (t) =>
    openMenu(t).actions.find((a) => a.id === 'upgrade') || null;
  // (a) пустой инвентарь — ровно ['storage','upgrade','demolish'].
  const tA = mk(over55, [{ x: 1, y: 1, buildingId: 55, player: true }]);
  assert.deepEqual(idsOf(tA), ['storage', 'upgrade', 'demolish'],
    'RED: ids — строка upgrade между эффектом и «Разобрать»');
  // (b) с материалами + gold 1000 — строка доступна, позиция до
  //     «Сложить»; имя дословно.
  const tB = mk(over55, [{ x: 1, y: 1, buildingId: 55, player: true }]);
  tB.hero.gold = 1000;
  IT.addItem(tB.hero, 'wood_log', 2);
  IT.addItem(tB.hero, 'stone_chunk', 2);
  const pB = openMenu(tB);
  const idsB = pB.actions.map((a) => a.id);
  assert.deepEqual(idsB,
    ['storage', 'upgrade', 'put-0', 'put-1', 'demolish'],
    'RED: upgrade ПЕРВАЯ в extraActions (до «Сложить»)');
  const rB = pB.actions.find((a) => a.id === 'upgrade');
  assert.equal(rB.имя,
    'Улучшить до уровня 2 — 100 з. (Бревно ×2, Каменный обломок ×2)',
    'RED: имя строки (L1→2, цена 55)');
  assert.equal(rB.доступен, true, 'материалы + золото — доступно');
  assert.equal(rB.reason, undefined);
  // (c) level 2 — «уровня 3 — 200 з.».
  const tC = mk(over55,
    [{ x: 1, y: 1, buildingId: 55, player: true, level: 2 }]);
  tC.hero.gold = 1000;
  IT.addItem(tC.hero, 'wood_log', 4);
  IT.addItem(tC.hero, 'stone_chunk', 4);
  const rC = rowOf(tC);
  assert.ok(rC, 'строка upgrade');
  assert.equal(rC.имя,
    'Улучшить до уровня 3 — 200 з. (Бревно ×4, Каменный обломок ×4)');
  assert.equal(rC.доступен, true);
  // (d) level 7 — disabled, reason «максимальный уровень (7)».
  const tD = mk(over55,
    [{ x: 1, y: 1, buildingId: 55, player: true, level: 7 }]);
  const rD = rowOf(tD);
  assert.ok(rD, 'строка upgrade (level 7 — строка есть, недоступна)');
  assert.equal(rD.имя, 'Улучшить: Хранилище');
  assert.equal(rD.доступен, false);
  assert.equal(rD.reason, 'максимальный уровень (7)');
  // (e) player-48 (не levelable) — строки upgrade НЕТ; эффект «48»
  // («Осмотреть») — ЕСТЬ (spec/buildings.md «Эффекты построенных
  // в городе» — как у базовых; подавление 1-к-1 в городе УБРАНО
  // правкой по итогам ревью).
  const tE = mk({ x: 1, y: 1,
    cityContents: [{ x: 1, y: 1, buildingId: 48, player: true }] },
    [{ x: 1, y: 1, buildingId: 48, player: true }]);
  assert.deepEqual(idsOf(tE), ['48', 'demolish'],
    '48 (нет level-условия) — без строки upgrade, эффект «48» есть');
  // (f) базовое 55 (player не true) — строки НЕТ.
  const tF = mk({ x: 1, y: 1,
    cityContents: [{ x: 1, y: 1, buildingId: 55 }] });
  assert.deepEqual(idsOf(tF), ['storage'],
    'базовое (player ≠ true) — без строки upgrade');
  // (g) без cityStates — строки НЕТ (record не найден).
  const tG = mk(over55, undefined);
  assert.deepEqual(idsOf(tG), ['storage', 'demolish'],
    'без cityStates — без строки upgrade');
  // (h) нехватка — доступен false + reason.
  const tH = mk(over55, [{ x: 1, y: 1, buildingId: 55, player: true }]);
  tH.hero.gold = 50;
  const rH = rowOf(tH);
  assert.ok(rH, 'строка upgrade');
  assert.equal(rH.доступен, false);
  assert.equal(rH.reason,
    'Не хватает 50 золота, 2 бревна и 2 каменных обломков');
});

// ============================================================
// R12. onAction('upgrade') — успех
// ============================================================

test("000222-R12. onAction({id:'upgrade}'): L1 55 — gold 1000→900, wood 3→1, chunk 3→1, entry.level 2, per-cell НЕ изменён, saveNow=1, playerRender=1, flash «Улучшено: Хранилище (уровень 2) (−100 з., −Бревно ×2, −Каменный обломок ×2)»; ре-энтри [E] — строка «уровня 3» (нехватка); shop-1 L2→L3 — ds.cityShops.wealth 1→2 + реестр (makeCityShop 6-арг.)", () => {
  // (a) хранилище 55, L1→2.
  const t = initBLFixture({
    x: 1, y: 1,
    cityContents: [{ x: 1, y: 1, buildingId: 55, player: true }],
  });
  wireCityAnchor(t, 100, -40);
  t.deps.cityStates = new Map([['100,-40',
    { lastVisitDay: 5, stock: {}, built: [
      { x: 1, y: 1, buildingId: 55, player: true },
    ] }]]);
  t.hero.gold = 1000;
  IT.addItem(t.hero, 'wood_log', 3);
  IT.addItem(t.hero, 'stone_chunk', 3);
  t.BA.onBuildingAction({ id: 'upgrade' },
    { x: 1, y: 1, cityAnchor: '100,-40' }, B.getBuilding(55), null);
  assert.equal(t.hero.gold, 900, 'RED: списано ровно 100 з.');
  assert.equal(IT.totalQty(t.hero, 'wood_log'), 1,
    'RED: wood_log 3→1 (списано ×2)');
  assert.equal(IT.totalQty(t.hero, 'stone_chunk'), 1,
    'RED: stone_chunk 3→1');
  assert.deepEqual(t.deps.cityStates.get('100,-40').built[0],
    { x: 1, y: 1, buildingId: 55, player: true, level: 2 },
    'RED: entry.level = 2 (record)');
  assert.deepEqual(t.ds.cityContents.buildings[0],
    { x: 1, y: 1, buildingId: 55, player: true },
    'per-cell запись НЕ изменена (level — только в record)');
  assert.equal(t.counters.saveNow, 1, 'успех — ровно 1 saveNow');
  assert.equal(t.counters.playerRender, 1);
  assert.deepEqual(t.counters.flash, [
    'Улучшено: Хранилище (уровень 2) (−100 з., −Бревно ×2, '
      + '−Каменный обломок ×2)',
  ], 'RED: flash дословно (− U+2212, × U+00D7)');
  // Ре-энтри [E]: строка «уровня 3 — 200 з.», нехватка (1+1 остаток).
  t.BA.interactCity();
  const p2 = lastOverlay(t);
  assert.deepEqual(p2.actions.map((a) => a.id),
    ['storage', 'upgrade', 'put-0', 'put-1', 'demolish']);
  const r2 = p2.actions.find((a) => a.id === 'upgrade');
  assert.equal(r2.имя,
    'Улучшить до уровня 3 — 200 з. (Бревно ×4, Каменный обломок ×4)');
  assert.equal(r2.доступен, false);
  assert.equal(r2.reason,
    'Не хватает 3 бревна и 3 каменных обломков');
  // (b) магазин 1 (L2→L3): wealth-бамп in-place + реестр.
  const t2 = initBLFixture({
    x: 1, y: 1,
    cityContents: [{ x: 1, y: 1, buildingId: 1, player: true }],
    cityShops: { '1,1': { x: 1, y: 1, buildingType: 0, wealth: 1,
      stock: {}, seed: 0 } },
  });
  wireCityAnchor(t2, 100, -40);
  t2.deps.cityStates = new Map([['100,-40',
    { lastVisitDay: 5, stock: {}, built: [
      { x: 1, y: 1, buildingId: 1, player: true, level: 2 },
    ] }]]);
  t2.hero.gold = 1000;
  IT.addItem(t2.hero, 'wood_log', 4);
  t2.BA.onBuildingAction({ id: 'upgrade' },
    { x: 1, y: 1, cityAnchor: '100,-40' }, B.getBuilding(1), null);
  assert.equal(t2.hero.gold, 900, 'shop-1: списано 100 з.');
  assert.equal(IT.totalQty(t2.hero, 'wood_log'), 0,
    'shop-1: wood_log 4→0 (×4)');
  assert.deepEqual(t2.deps.cityStates.get('100,-40').built[0],
    { x: 1, y: 1, buildingId: 1, player: true, level: 3 });
  assert.equal(t2.ds.cityShops['1,1'].wealth, 2,
    'RED: in-place wealth-бамп 1→2 (f(3)−f(2)=1)');
  assert.deepEqual(t2.counters.flash, [
    'Улучшено: Оружейная (уровень 3) (−100 з., −Бревно ×4)',
  ]);
  assert.equal(C.makeCityShop(100, -40, 1, 1, 1, 1).wealth, 2,
    'RED: реестр (syncShopLevels) — 6-арг. wealth 2');
  if (typeof C.syncShopLevels === 'function') {
    C.syncShopLevels(100, -40, null);
  }
});

// ============================================================
// R13. onAction('upgrade') — отказы атомарно
// ============================================================

test("000222-R13. onAction({id:'upgrade'}): gold 90 → «мало золота (нужно 100)» (gold-first); gold ок, wood_log 1 → «мало: Бревно»; ВСЕ: record/инвентарь/золото НЕ изменены, saveNow=0", () => {
  // (a) мало золота (gold-first, предметы ЕСТЬ).
  const t = initBLFixture({
    x: 1, y: 1,
    cityContents: [{ x: 1, y: 1, buildingId: 55, player: true }],
  });
  wireCityAnchor(t, 100, -40);
  t.deps.cityStates = new Map([['100,-40',
    { lastVisitDay: 5, stock: {}, built: [
      { x: 1, y: 1, buildingId: 55, player: true },
    ] }]]);
  t.hero.gold = 90;
  IT.addItem(t.hero, 'wood_log', 2);
  IT.addItem(t.hero, 'stone_chunk', 2);
  t.BA.onBuildingAction({ id: 'upgrade' },
    { x: 1, y: 1, cityAnchor: '100,-40' }, B.getBuilding(55), null);
  assert.deepEqual(t.counters.flash, ['мало золота (нужно 100)'],
    'RED: flash-отказ gold-first');
  assert.equal(t.hero.gold, 90, 'золото не тронуто');
  assert.equal(IT.totalQty(t.hero, 'wood_log'), 2,
    'предметы НЕ списаны (все-или-ничего)');
  assert.equal(IT.totalQty(t.hero, 'stone_chunk'), 2);
  assert.deepEqual(t.deps.cityStates.get('100,-40').built[0],
    { x: 1, y: 1, buildingId: 55, player: true },
    'record НЕ изменён (level не появился)');
  assert.equal(t.counters.saveNow, 0, 'отказ — без saveNow');
  // (b) мало предмета (gold ок).
  const t2 = initBLFixture({
    x: 1, y: 1,
    cityContents: [{ x: 1, y: 1, buildingId: 55, player: true }],
  });
  wireCityAnchor(t2, 100, -40);
  t2.deps.cityStates = new Map([['100,-40',
    { lastVisitDay: 5, stock: {}, built: [
      { x: 1, y: 1, buildingId: 55, player: true },
    ] }]]);
  t2.hero.gold = 1000;
  IT.addItem(t2.hero, 'wood_log', 1);
  IT.addItem(t2.hero, 'stone_chunk', 3);
  t2.BA.onBuildingAction({ id: 'upgrade' },
    { x: 1, y: 1, cityAnchor: '100,-40' }, B.getBuilding(55), null);
  assert.deepEqual(t2.counters.flash, ['мало: Бревно'],
    'RED: flash-отказ по первому недостающему предмету');
  assert.equal(t2.hero.gold, 1000, 'золото НЕ списано');
  assert.equal(IT.totalQty(t2.hero, 'wood_log'), 1, 'wood не тронут');
  assert.equal(IT.totalQty(t2.hero, 'stone_chunk'), 3,
    'chunk НЕ списан (все-или-ничего)');
  assert.deepEqual(t2.deps.cityStates.get('100,-40').built[0],
    { x: 1, y: 1, buildingId: 55, player: true });
  assert.equal(t2.counters.saveNow, 0);
});

// ============================================================
// R17. Правка по итогам ревью: реестр shopLevels после СНОСА
// ============================================================

test("000222-R17. Правка ревью: shop-1 (1,1) L1→3 (реестр 3, cityShops.wealth 1→2) → demolish (built [], +15 з.) → shopLevelAt null (синк ПОСЛЕ сноса — RED: до правки реестр держал 3) → перестройка build-1 → makeCityShop читает реестр: wealth НОВОЙ лавки = 1 (не 2 из стагнувшего уровня) + fresh-запись (level отсутствует) → [E] строка «Улучшить до уровня 2 — 50 з. (Бревно ×2)» (не 400 з. по стагнувшему реестру)", () => {
  const t = initBLFixture({
    x: 1, y: 1,
    cityContents: [{ x: 1, y: 1, buildingId: 1, player: true }],
    cityShops: { '1,1': { x: 1, y: 1, buildingType: 0, wealth: 1,
      stock: {}, seed: 0 } },
  });
  wireCityAnchor(t, 100, -40);
  const rec0 = { lastVisitDay: 5, stock: {}, built: [
    { x: 1, y: 1, buildingId: 1, player: true },
  ] };
  t.deps.cityStates = new Map([['100,-40', rec0]]);
  if (typeof C.syncShopLevels === 'function') {
    C.syncShopLevels(100, -40, rec0);
  }
  assert.equal(C.shopLevelAt(100, -40, 1, 1), 1,
    'реестр после «входа» (синк по записи) — 1');
  t.hero.gold = 1000;
  IT.addItem(t.hero, 'wood_log', 10);
  const tile = { x: 1, y: 1, cityAnchor: '100,-40' };
  const b1 = B.getBuilding(1);
  // L1→2: 50 з. (×2^0), Бревно ×2.
  t.BA.onBuildingAction({ id: 'upgrade' }, tile, b1, null);
  assert.equal(t.hero.gold, 950, 'L1→2: −50 з.');
  assert.equal(IT.totalQty(t.hero, 'wood_log'), 8, '−2');
  assert.equal(t.deps.cityStates.get('100,-40').built[0].level, 2);
  assert.equal(C.shopLevelAt(100, -40, 1, 1), 2, 'реестр после 1-го');
  assert.equal(t.ds.cityShops['1,1'].wealth, 1, 'f(2)−f(1)=0');
  // L2→3: 100 з. (×2^1), Бревно ×4.
  t.BA.onBuildingAction({ id: 'upgrade' }, tile, b1, null);
  assert.equal(t.hero.gold, 850, 'L2→3: −100 з.');
  assert.equal(IT.totalQty(t.hero, 'wood_log'), 4, '−4');
  assert.equal(t.deps.cityStates.get('100,-40').built[0].level, 3);
  assert.equal(C.shopLevelAt(100, -40, 1, 1), 3, 'реестр после 2-го');
  assert.equal(t.ds.cityShops['1,1'].wealth, 2, 'f(3)−f(2)=1: 1→2');
  // Demolish: +15 з. (floor 30% от 50), built [], cityShops очищен.
  t.BA.onBuildingAction({ id: 'demolish' }, tile, b1, null);
  assert.equal(t.hero.gold, 865, 'возврат 15 з.');
  assert.deepEqual(t.deps.cityStates.get('100,-40').built, [],
    'built — пусто (снос)');
  assert.equal(t.ds.cityShops['1,1'], undefined,
    'cityShops — слот удалён');
  assert.equal(C.shopLevelAt(100, -40, 1, 1), null,
    'RED: реестр ПОСЛЕ сноса — ключи отписаны (syncShopLevels)');
  // Перестройка: меню строительства (пустая клетка) → build-1.
  const ovB = openMenu(t);
  const rowB = ovB.actions.find((a) => a.id === 'build-1');
  assert.ok(rowB, 'строка build-1 (меню «Строительство»)');
  assert.equal(typeof ovB.onAction, 'function', 'onAction — проводка');
  ovB.onAction({ id: 'build-1' });
  assert.equal(t.hero.gold, 865 - 50, 'build: −50 з.');
  assert.equal(IT.totalQty(t.hero, 'wood_log'), 2, 'build: −Бревно ×2');
  assert.deepEqual(t.deps.cityStates.get('100,-40').built,
    [{ x: 1, y: 1, buildingId: 1, player: true }],
    'fresh-запись (level отсутствует)');
  assert.ok(t.ds.cityShops['1,1'], 'лавка на клетке после постройки');
  assert.equal(t.ds.cityShops['1,1'].wealth, 1,
    'RED: НОВАЯ лавка — wealth 1 (реестр пуст), не 2 (стальный уровень)');
  // [E] на постройке: строка улучшения — по уровню ЗАПИСИ (1).
  t.o.buildingUI.close();
  const pU = openMenu(t);
  const rU = pU.actions.find((a) => a.id === 'upgrade');
  assert.ok(rU, 'строка upgrade');
  assert.equal(rU.имя, 'Улучшить до уровня 2 — 50 з. (Бревно ×2)',
    'RED: цена — по уровню записи, реестр для цены НЕ читается');
  if (typeof C.syncShopLevels === 'function') {
    C.syncShopLevels(100, -40, null);
  }
});

// ============================================================
// R18. Правка по итогам ревью: daily-марк — «upgrade» не пишется
// ============================================================

test("000222-R18. Правка ревью: daily-марк — 'upgrade' НЕ пишется даже при каталожном лимите (особые_параметры.раз_в_день = {upgrade: true}, успех — −100 з.); КОНТРАСТ: реальный лимитный эффект 45 (раз_в_день: true, колодец) — ключ '100,-40:45' пишется", () => {
  // (a) upgrade с декларируемым лимитом — марка ':upgrade' НЕ пишется.
  const t = initBLFixture({
    x: 1, y: 1,
    cityContents: [{ x: 1, y: 1, buildingId: 55, player: true }],
  });
  wireCityAnchor(t, 100, -40);
  t.deps.cityStates = new Map([['100,-40',
    { lastVisitDay: 5, stock: {}, built: [
      { x: 1, y: 1, buildingId: 55, player: true },
    ] }]]);
  t.hero.gold = 1000;
  IT.addItem(t.hero, 'wood_log', 2);
  IT.addItem(t.hero, 'stone_chunk', 2);
  const b55 = B.getBuilding(55);
  const bMarked = Object.assign({}, b55, {
    особые_параметры: Object.assign({}, b55.особые_параметры,
      { раз_в_день: { upgrade: true } }),
  });
  assert.equal(BE.hasDailyLimit(bMarked, 'upgrade'), true,
    'гард: лимит «upgrade» задекларирован');
  t.BA.onBuildingAction({ id: 'upgrade' },
    { x: 1, y: 1, cityAnchor: '100,-40' }, bMarked, null);
  assert.equal(t.hero.gold, 900, 'успех: списано 100 з. (L1→2)');
  for (const k of t.deps.buildingOncePerDay.keys()) {
    assert.ok(!String(k).endsWith(':upgrade'),
      'RED: марка «:upgrade» НЕ написана (ключ: ' + k + ')');
  }
  assert.equal(t.counters.saveNow, 1, 'успех — saveNow (марка не писана)');
  // (b) контраст: лимитный эффект 45 (раз_в_день: true) — марка ЕСТЬ.
  const t2 = initBLFixture({
    x: 1, y: 1,
    cityContents: [{ x: 1, y: 1, buildingId: 45, player: true }],
  });
  wireCityAnchor(t2, 100, -40);
  const fakeG = {
    hash2: (a, b, s) =>
      (((a * 73856093) ^ (b * 19349663) ^ (s * 83492791)) >>> 0),
    derived: () => ({ thiefBonus: 0 }),
  };
  const b45 = B.getBuilding(45);
  assert.equal(b45.особые_параметры.раз_в_день, true,
    'гард: 45 — boolean-лимит раз_в_день');
  withGame(fakeG, () => {
    t2.BA.onBuildingAction({ id: '45' },
      { x: 1, y: 1, cityAnchor: '100,-40' }, b45, null);
  });
  assert.ok(t2.deps.buildingOncePerDay.has('100,-40:45'),
    'контраст: марка «100,-40:45» написана (город-якорь, 000137)');
  assert.equal(t2.deps.buildingOncePerDay.get('100,-40:45'), 5,
    'день — deps.clock.day');
  if (typeof C.syncShopLevels === 'function') {
    C.syncShopLevels(100, -40, null);
  }
});

// ============================================================
// vm-секция: full-chain песочница index.html (R14..R16)
// ============================================================

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CHAIN = Array.from(html.matchAll(/<script\s+src="([^"]+)"/g),
  (m) => m[1]).map((p) => p.replace(/^src\//, ''));
const NOW = 1000; // performance.now() в песочнице заморожен на NOW
const G_CELL_FLOOR = 1; // значение CELL_FLOOR (dungeon.js/cities.js)

// --- WebGL-стаб (main.js: compile/link/буферы) ---
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

// --- «Снисходительный» DOM-элемент (dataset, closest,
// querySelectorAll) — паттерн tests/city-interact.test.js ---
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
  // Image-стаб: assets/map.png ВСЕГДА onerror (детерминированный
  // мир G.generateSeedPixels), остальные — onload.
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

// --- Ввод ---
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

// --- Ходьба по МИРУ: keydown → кадры +200 мс → keyup ---
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
    // zone-бой по маршруту — авторазрешение (9999 → Space).
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

// --- BFS по миру до целевого тайла ---
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

// Город + RECOMPUTE содержимого (чистые функции — те же входы, что
// production: layout от ЯКОРЯ, wealth из tileAt).
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

// Свободная ВНУТРЕННЯЯ FLOOR-клетка (≠ дверь, без постройки).
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

// Безопасный ОДИН шаг в МИРЕ от тайла входа.
function safeWorldNeighbor(G, myMap, from) {
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (const [dx, dy] of DIRS) {
    const t = myMap.tileAt(from.x + dx, from.y + dy);
    if (!t.passable || t.hasMobGroup || t.hasBuilding) continue;
    return [from.x + dx, from.y + dy];
  }
  return null;
}

// L-путь ВНУТРИ города: вертикаль в столбце, горизонталь в строке.
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

function clickTab(h, overlay, tab) {
  const btn = tabBtn(overlay, tab);
  assert.ok(btn, 'вкладка «' + tab + '» в ряде вкладок');
  const clickers = overlay.listeners.click || [];
  assert.ok(clickers.length >= 1,
    'делегированный click-обработчик оверлея');
  clickers[0]({ target: btn });
}

// Флэш — в HUD (hud.js: append при performance.now() < flashUntil;
// now заморожен на NOW → flash видим): 2 кадра + текст.
function hudFrames(h, now) {
  h.frameFn(now + 200);
  h.frameFn(now + 400);
  return now + 400;
}

function hudText(h) {
  return textOf(h.sandbox.document.getElementById('hud'));
}

// Живые слоты инвентаря (debug-хук state.hero.inventory — live slots).
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

function fireBeforeUnload(h) {
  const fns = h.winListeners['beforeunload'];
  assert.ok(fns && fns.length, 'beforeunload-слушатель');
  for (const fn of fns) fn({});
}

// [E] на постройке с NPC → «Диалог» → вкладка «Торговля».
function openNpcTrade(h) {
  const G = h.sandbox.Game;
  key(h, 'KeyE');
  assert.equal(G.buildingUI.isActive(), true, '[E] — buildingUI');
  const ov = buildingOverlayOf(h);
  const rowDlg = findRow(ov, 'dialog');
  assert.ok(rowDlg, 'строка «Диалог»');
  ov.listeners.click[0]({ target: rowDlg });
  assert.equal(G.npcUI.isActive(), true, '«Диалог» → npcUI');
  const ovN = npcOverlayOf(h);
  clickTab(h, ovN, 'trade');
  return npcOverlayOf(h);
}

// Продать n шт. (кнопка ищется заново: вкладка перерисовывается).
function sellItem(h, itemId, n) {
  const g = h.sandbox.__game;
  for (let i = 0; i < n; i++) {
    const o = npcOverlayOf(h);
    const btn = findAll(o, 'button[data-npcact="sell"]')
      .find((b) => b.dataset.item === itemId);
    assert.ok(btn && !btn.disabled, 'кнопка продажи ' + itemId + ' #'
      + (i + 1));
    o.listeners.click[0]({ target: btn });
  }
  return g.state.hero.gold;
}

// ============================================================
// R14. vm e2e: build-55 → upgrade → персист → storage 60 →
//     double boot
// ============================================================

test('000222-R14. vm e2e: build-55 (−100 з., −Бревно ×2, −Каменный обломок ×2) → [E] → upgrade (gold 400→300→200, flash «Улучшено: Хранилище (уровень 2) (−100 з., −Бревно ×2, −Каменный обломок ×2)») → выход/ВОЗВРАТ (built level:2 persistent) → [E]: строка «Улучшить до уровня 3 — 200 з. (Бревно ×4, Каменный обломок ×4)» + storage 60 (42 × put, «Сложить» доступно 42/60) → double boot: level:2 + storage 42 после restore, строки те же', async () => {
  const storage = makeStorage();
  const h = await bootChain(storage);
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  const myMap = G.createMap(G.generateSeedPixels());
  const found = findCityFor(G, myMap, g.state.player,
    (c) => c.fp >= 2 && freeCityCell(c) !== null
      && safeWorldNeighbor(G, myMap, c.tile) !== null
      && c.contents.buildings.some((b) => b.buildingId === 1));
  assert.ok(found,
    'сценарий: город (fp>=2) с Оружейной + свободной клеткой '
    + '+ безопасным соседом');
  let now = walkTiles(h, NOW, found.steps);
  const dg = g.dungeon;
  assert.ok(dg && dg.kind === 'city', 'в городе (авто-вход)');
  const shopCell = found.contents.buildings
    .find((b) => b.buildingId === 1);
  const target = freeCityCell(found);
  assert.notEqual(shopCell.x + ',' + shopCell.y, target.x + ','
    + target.y, 'свободная клетка ≠ Оружейная');
  // Золото: продажа 2 war_hammer (150 з. шт., Бренн).
  walkCity(h, cityStepsTo({ x: dg.x, y: dg.y }, shopCell.x, shopCell.y));
  seedSlot(g, 'war_hammer', 2);
  openNpcTrade(h);
  sellItem(h, 'war_hammer', 2);
  assert.equal(g.state.hero.gold, 100 + 2 * 150, 'золото +300');
  key(h, 'Escape');
  // Материалы: 4 wood + 4 stone (build 55 + upgrade L1→2).
  seedSlot(g, 'wood_log', 4);
  seedSlot(g, 'stone_chunk', 4);
  // build-55.
  walkCity(h, cityStepsTo(
    { x: g.dungeon.x, y: g.dungeon.y }, target.x, target.y));
  key(h, 'KeyE');
  const ovB = buildingOverlayOf(h);
  const row55 = findRow(ovB, 'build-55');
  assert.ok(row55, 'строка build-55 в меню «Строительство»');
  ovB.listeners.click[0]({ target: row55 });
  assert.equal(g.state.hero.gold, 400 - 100, 'gold −100 (цена 55)');
  assert.equal(qtyOf(g, 'wood_log'), 2, 'wood 4→2');
  assert.equal(qtyOf(g, 'stone_chunk'), 2, 'stone 4→2');
  // [E] → upgrade.
  key(h, 'KeyE');
  const ovU = buildingOverlayOf(h);
  const rowUp = findRow(ovU, 'upgrade');
  assert.ok(rowUp, 'RED: строка «Улучшить…» в [E]-меню');
  assert.ok(textOf(ovU).includes(
    'Улучшить до уровня 2 — 100 з. (Бревно ×2, Каменный обломок ×2)'),
    'RED: имя строки: ' + textOf(ovU).slice(0, 400));
  ovU.listeners.click[0]({ target: rowUp });
  assert.equal(g.state.hero.gold, 300 - 100,
    'RED: gold −100 (L1→2)');
  assert.equal(qtyOf(g, 'wood_log'), 0, 'wood 2→0');
  assert.equal(qtyOf(g, 'stone_chunk'), 0, 'stone 2→0');
  now = hudFrames(h, now);
  assert.ok(hudText(h).includes(
    'Улучшено: Хранилище (уровень 2) (−100 з., −Бревно ×2, '
    + '−Каменный обломок ×2)'),
    'RED: flash upgrade: ' + hudText(h).slice(0, 300));
  // Выход/ВОЗВРАТ: built level:2 persistent.
  const door = { x: dg.entrance.x, y: dg.entrance.y };
  walkCity(h, cityStepsTo({ x: g.dungeon.x, y: g.dungeon.y },
    door.x, door.y));
  key(h, 'KeyE');
  assert.equal(g.dungeon, null, '[E] на двери — выход');
  const away = safeWorldNeighbor(G, myMap, found.tile);
  assert.ok(away, 'сценарий: безопасный сосед');
  now = walkTiles(h, now, [away, [found.tile.x, found.tile.y]]);
  const dg2 = g.dungeon;
  assert.ok(dg2 && dg2.kind === 'city', 'повторный вход');
  const anchor = found.ax + ',' + found.ay;
  assert.deepEqual(
    JSON.parse(JSON.stringify(g.cities[anchor].built)),
    [{ x: target.x, y: target.y, buildingId: 55, player: true,
      level: 2 }],
    'RED: built-запись с level:2 после возврата (persistent)');
  // [E]: строка «уровня 3 — 200 з.» + storage (42 × put).
  walkCity(h, cityStepsTo({ x: dg2.x, y: dg2.y }, target.x, target.y));
  key(h, 'KeyE');
  const ovM = buildingOverlayOf(h);
  assert.ok(textOf(ovM).includes(
    'Улучшить до уровня 3 — 200 з. (Бревно ×4, Каменный обломок ×4)'),
    'RED: строка «уровня 3 — 200 з.»: ' + textOf(ovM).slice(0, 400));
  for (const id of STORE43) seedSlot(g, id, 1);
  const rowSt = findRow(ovM, 'storage');
  assert.ok(rowSt, 'строка «Хранилище» (эффект)');
  ovM.listeners.click[0]({ target: rowSt });
  for (let i = 0; i < 42; i++) {
    const ovS = buildingOverlayOf(h);
    assert.ok(ovS, 'storage-оверлей открыт (итер ' + i + ')');
    const rowP = findRow(ovS, 'put-0');
    assert.ok(rowP && !rowP.disabled,
      'RED: put-0 доступно (итер ' + i + ', ёмкость 60)');
    ovS.listeners.click[0]({ target: rowP });
  }
  const b0 = g.cities[anchor].built[0];
  assert.equal(b0.storage.length, 42,
    'RED: storage 42 (ёмкость 60)');
  assert.equal(qtyOf(g, STORE43[42]), 1, 'остаток — 1 предмет');
  // [E]: «Сложить» доступно (42/60).
  key(h, 'Escape');
  key(h, 'KeyE');
  const ovF = buildingOverlayOf(h);
  const rowF = findRow(ovF, 'put-0');
  assert.ok(rowF, 'RED: строка «Сложить» в [E] (после 42 × put)');
  assert.ok(!rowF.disabled,
    'RED: «Сложить» доступно (42 < 60): '
    + textOf(ovF).slice(0, 300));
  // Выход + сейв + double boot.
  key(h, 'Escape');
  walkCity(h, cityStepsTo({ x: g.dungeon.x, y: g.dungeon.y },
    door.x, door.y));
  key(h, 'KeyE');
  assert.equal(g.dungeon, null, 'выход (перед сейвом)');
  fireBeforeUnload(h);
  const saved = JSON.parse(storage.getItem(SAVE_KEY));
  assert.ok(saved && saved.data && saved.data.cities
    && saved.data.cities[anchor], 'сейв: раздел cities');
  assert.equal(saved.data.cities[anchor].built[0].level, 2,
    'RED: level:2 в сейве');
  assert.equal(saved.data.cities[anchor].built[0].storage.length, 42,
    'сейв: storage 42');
  const h2 = await bootChain(storage);
  const g2 = h2.sandbox.__game;
  assert.ok(g2.state.save && g2.state.save.version === 1,
    'boot 2: сейв прочитан');
  now = walkTiles(h2, NOW, [away, [found.tile.x, found.tile.y]]);
  const dg3 = g2.dungeon;
  assert.ok(dg3 && dg3.kind === 'city', 'boot 2: повторный вход');
  const b2 = g2.cities[anchor].built[0];
  assert.equal(b2.level, 2, 'RED: boot 2 — level:2 после restore');
  assert.equal(b2.storage.length, 42, 'boot 2 — storage 42');
  walkCity(h2, cityStepsTo({ x: dg3.x, y: dg3.y }, target.x, target.y));
  key(h2, 'KeyE');
  const ovR = buildingOverlayOf(h2);
  assert.ok(textOf(ovR).includes(
    'Улучшить до уровня 3 — 200 з. (Бревно ×4, Каменный обломок ×4)'),
    'boot 2: строка «уровня 3»');
  const rowR = findRow(ovR, 'put-0');
  assert.ok(rowR && !rowR.disabled,
    'RED: boot 2 — «Сложить» доступно (ёмкость 60 после restore)');
});

// ============================================================
// R15. vm e2e магазин: build-1 → upgrade ×4 → wealth/сток
// ============================================================

test('000222-R15. vm e2e магазин: build-1 (Оружейная, wealth 1-2) → сток L1 = ТОЛЬКО оружие; upgrade ×4 (L1→5: 50/100/200/400 з. = цена ×2^(L−1), Бревно ×2/×4/×8/×16; gold 1750→950); built level:5; в ТОМ ЖЕ визите сток НЕ перегенерируется; fresh (day +3) — сток по wealth min(3, w+3)=3 (deepEqual makeShop(...,0,3), НЕ оружие в сток) ≠ L1-сток; level:5 persistent; строка «Улучшить до уровня 6 — 800 з. (Бревно ×32)»', async () => {
  const h = await bootChain();
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  const myMap = G.createMap(G.generateSeedPixels());
  const found = findCityFor(G, myMap, g.state.player,
    (c) => c.fp >= 2 && freeCityCell(c) !== null
      && safeWorldNeighbor(G, myMap, c.tile) !== null
      && (c.wealth === 1 || c.wealth === 2)
      && c.contents.buildings.some((b) => b.buildingId === 1));
  assert.ok(found,
    'сценарий: город wealth 1-2 (fp>=2) с Оружейной + свободной '
    + 'клеткой + безопасным соседом');
  let now = walkTiles(h, NOW, found.steps);
  const dg = g.dungeon;
  assert.ok(dg && dg.kind === 'city', 'в городе (авто-вход)');
  const shopCell = found.contents.buildings
    .find((b) => b.buildingId === 1);
  const target = freeCityCell(found);
  assert.notEqual(shopCell.x + ',' + shopCell.y, target.x + ','
    + target.y, 'свободная клетка ≠ Оружейная');
  // Золото: 11 × war_hammer (150 з.).
  walkCity(h, cityStepsTo({ x: dg.x, y: dg.y }, shopCell.x, shopCell.y));
  seedSlot(g, 'war_hammer', 11);
  openNpcTrade(h);
  sellItem(h, 'war_hammer', 11);
  assert.equal(g.state.hero.gold, 100 + 11 * 150,
    'золото +1650');
  key(h, 'Escape');
  seedSlot(g, 'wood_log', 62);
  // build-1.
  walkCity(h, cityStepsTo(
    { x: g.dungeon.x, y: g.dungeon.y }, target.x, target.y));
  key(h, 'KeyE');
  const ovB = buildingOverlayOf(h);
  const row1 = findRow(ovB, 'build-1');
  assert.ok(row1, 'строка build-1 в меню «Строительство»');
  ovB.listeners.click[0]({ target: row1 });
  assert.equal(g.state.hero.gold, 1750 - 50, 'gold −50 (цена 1)');
  assert.equal(qtyOf(g, 'wood_log'), 60, 'wood 62→60');
  const anchor = found.ax + ',' + found.ay;
  const cellKey = target.x + ',' + target.y;
  const stockAtBuild = JSON.parse(JSON.stringify(
    g.cities[anchor].stock[cellKey]));
  assert.ok(Object.keys(stockAtBuild).length > 0,
    'сток магазина на клетке (L1)');
  assert.ok(Object.keys(stockAtBuild)
    .every((id) => G.getItem(id).kind === 'weapon'),
    'RED: сток L1 — ТОЛЬКО оружие (виды map_index 0): '
    + JSON.stringify(Object.keys(stockAtBuild)));
  // Upgrade ×4: L1→2→3→4→5. Цена = 50 × 2^(L−1): 50/100/200/400 з.
  const steps = [
    ['Улучшить до уровня 2 — 50 з. (Бревно ×2)', 1650],
    ['Улучшить до уровня 3 — 100 з. (Бревно ×4)', 1550],
    ['Улучшить до уровня 4 — 200 з. (Бревно ×8)', 1350],
    ['Улучшить до уровня 5 — 400 з. (Бревно ×16)', 950],
  ];
  for (const [name, goldAfter] of steps) {
    key(h, 'KeyE');
    const ov = buildingOverlayOf(h);
    const rowUp = findRow(ov, 'upgrade');
    assert.ok(rowUp, 'RED: строка «Улучшить…» в [E]-меню');
    assert.ok(textOf(ov).includes(name),
      'RED: строка «' + name + '»: ' + textOf(ov).slice(0, 400));
    ov.listeners.click[0]({ target: rowUp });
    assert.equal(g.state.hero.gold, goldAfter,
      'gold после «' + name + '»');
  }
  assert.equal(qtyOf(g, 'wood_log'), 30,
    'wood: 62 − 2 (build) − 30 (2+4+8+16) = 30');
  assert.equal(g.cities[anchor].built[0].level, 5,
    'RED: built level:5');
  // В ТОМ ЖЕ визите: сток НЕ перегенерируется (re-entry в окне).
  const door = { x: dg.entrance.x, y: dg.entrance.y };
  walkCity(h, cityStepsTo({ x: g.dungeon.x, y: g.dungeon.y },
    door.x, door.y));
  key(h, 'KeyE');
  assert.equal(g.dungeon, null, 'выход');
  const away = safeWorldNeighbor(G, myMap, found.tile);
  assert.ok(away, 'сценарий: безопасный сосед');
  now = walkTiles(h, now, [away, [found.tile.x, found.tile.y]]);
  assert.ok(g.dungeon && g.dungeon.kind === 'city', 'повторный вход');
  assert.deepEqual(JSON.parse(JSON.stringify(
      g.cities[anchor].stock[cellKey])),
    stockAtBuild,
    'RED: в окне — сток НЕ перегенерирован (upgrade не трогает сток)');
  // Fresh: day +3 → сток по wealth 3 (универсам).
  const day0 = g.dungeon.day;
  key(h, 'KeyE');
  assert.equal(g.dungeon, null, 'выход (перед fresh)');
  g.actions.setDay(day0 + 3);
  now = walkTiles(h, now, [away, [found.tile.x, found.tile.y]]);
  const dgF = g.dungeon;
  assert.ok(dgF && dgF.kind === 'city', 'fresh-вход');
  const stockFresh = JSON.parse(JSON.stringify(
    g.cities[anchor].stock[cellKey]));
  const expectStock = JSON.parse(JSON.stringify(
    G.makeShop(found.ax * 256 + target.x, found.ay * 256 + target.y,
      0, 3).stock));
  assert.deepEqual(stockFresh, expectStock,
    'RED: fresh-сток — wealth min(3, w+3) = 3 (реестр по level 5): '
    + JSON.stringify(stockFresh).slice(0, 200));
  assert.ok(Object.keys(stockFresh)
    .some((id) => G.getItem(id).kind !== 'weapon'),
    'RED: fresh-сток богаче L1 (универсам — allItems)');
  assert.notDeepEqual(stockFresh, stockAtBuild,
    'fresh-сток ≠ L1-сток');
  assert.equal(g.cities[anchor].built[0].level, 5,
    'level:5 после fresh (persistent)');
  walkCity(h, cityStepsTo({ x: dgF.x, y: dgF.y }, target.x, target.y));
  key(h, 'KeyE');
  const ovF = buildingOverlayOf(h);
  assert.ok(textOf(ovF).includes(
    'Улучшить до уровня 6 — 800 з. (Бревно ×32)'),
    'RED: строка «уровня 6 — 800 з.»: '
    + textOf(ovF).slice(0, 400));
});

// ============================================================
// R16. vm e2e ментор 38: build-38 → upgrade L2 → обучение
// ============================================================

test('000222-R16. vm e2e ментор 38: build-38 (80 з., −Горечавка ×2; gold 400→320) → upgrade «Улучшить до уровня 2 — 80 з. (Горечавка ×2)» (gold →240, flash «Улучшено: Храм горы (уровень 2) (−80 з., −Горечавка ×2)») → [E] → «Обучение (наставник)» (базовый пул — гейт max(4, level) не сужает): gold −50 (→190), изучено magic_shield, flash «Наставник передал: «Магический щит»»', async () => {
  const h = await bootChain();
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  const myMap = G.createMap(G.generateSeedPixels());
  const found = findCityFor(G, myMap, g.state.player,
    (c) => c.fp >= 2 && freeCityCell(c) !== null
      && c.contents.buildings.some((b) => b.buildingId === 1));
  assert.ok(found,
    'сценарий: город (fp>=2) с Оружейной + свободной клеткой');
  let now = walkTiles(h, NOW, found.steps);
  const dg = g.dungeon;
  assert.ok(dg && dg.kind === 'city', 'в городе (авто-вход)');
  const shopCell = found.contents.buildings
    .find((b) => b.buildingId === 1);
  const target = freeCityCell(found);
  assert.notEqual(shopCell.x + ',' + shopCell.y, target.x + ','
    + target.y, 'свободная клетка ≠ Оружейная');
  // Золото: 2 × war_hammer (150 з.).
  walkCity(h, cityStepsTo({ x: dg.x, y: dg.y }, shopCell.x, shopCell.y));
  seedSlot(g, 'war_hammer', 2);
  openNpcTrade(h);
  sellItem(h, 'war_hammer', 2);
  assert.equal(g.state.hero.gold, 400, 'золото +300');
  key(h, 'Escape');
  seedSlot(g, 'herb_bitter', 6);
  // build-38.
  walkCity(h, cityStepsTo(
    { x: g.dungeon.x, y: g.dungeon.y }, target.x, target.y));
  key(h, 'KeyE');
  const ovB = buildingOverlayOf(h);
  const row38 = findRow(ovB, 'build-38');
  assert.ok(row38, 'строка build-38 в меню «Строительство»');
  ovB.listeners.click[0]({ target: row38 });
  assert.equal(g.state.hero.gold, 400 - 80, 'gold −80 (цена 38)');
  assert.equal(qtyOf(g, 'herb_bitter'), 4, 'горечавка 6→4');
  // [E] → upgrade L1→2. Цена = 80 × 2^(1−1) = 80 з., Горечавка ×2.
  key(h, 'KeyE');
  const ovU = buildingOverlayOf(h);
  const rowUp = findRow(ovU, 'upgrade');
  assert.ok(rowUp, 'RED: строка «Улучшить…» в [E]-меню');
  assert.ok(textOf(ovU).includes(
    'Улучшить до уровня 2 — 80 з. (Горечавка ×2)'),
    'RED: имя строки (L1→2, цена 38): ' + textOf(ovU).slice(0, 400));
  ovU.listeners.click[0]({ target: rowUp });
  assert.equal(g.state.hero.gold, 320 - 80,
    'RED: gold −80 (L1→2)');
  assert.equal(qtyOf(g, 'herb_bitter'), 2, 'горечавка: 4 − 2 = 2');
  now = hudFrames(h, now);
  assert.ok(hudText(h).includes(
    'Улучшено: Храм горы (уровень 2) (−80 з., −Горечавка ×2)'),
    'RED: flash upgrade: ' + hudText(h).slice(0, 300));
  // [E] → «Обучение (наставник)» (базовый пул, день НЕ сгорает).
  key(h, 'KeyE');
  const ovM = buildingOverlayOf(h);
  const rowM = findRow(ovM, '38_mentor');
  assert.ok(rowM, 'строка «Обучение (наставник)» (38_mentor)');
  assert.ok(!rowM.disabled,
    'строка доступна (лимит «38» не на «38_mentor»): '
    + textOf(ovM).slice(0, 300));
  ovM.listeners.click[0]({ target: rowM });
  assert.equal(g.state.hero.gold, 240 - 50,
    'RED: gold −50 (цена наставника)');
  assert.ok(g.state.hero.spells.includes('magic_shield'),
    'RED: изучено magic_shield (базовый пул — гейт не сужает)');
  now = hudFrames(h, now);
  assert.ok(hudText(h).includes('Наставник передал: «Магический щит»'),
    'RED: flash обучения: ' + hudText(h).slice(0, 300));
});

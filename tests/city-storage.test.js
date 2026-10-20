// Задача 000221: город — особое здание «Хранилище» (склад предметов
// из инвентаря).
//
// Источник правды: tasks/pending/000221.md («Добавить возможность
// строить в городах особый вид здания - хранилище, куда персонаж может
// сложить предметы из инвентаря.»); контракты и дизайн:
// memory/000221-city-storage.md (D1–D12, §2 контракты, §7 красные).
//
// КРАСНЫЕ тесты (TDD): написаны ДО реализации. Причины падения на
// текущем коде — отсутствие функциональности (не синтаксис/среда):
//   * R1 — assets/buildings/000055.json НЕТ, зеркало buildings.js
//     без 55 (getBuilding(55) — null, каталог 54 записи);
//   * R2 — buildableBuildingIds — 21 id (55 нет), buildCost(55) —
//     throw (id вне каталога);
//   * R3 — ядро cities.js (storageCapacity/storageSanitize/
//     storageAt/storagePut/storageTake) НЕ ЭКСПОРТИРОВАНО;
//   * R4 — семантика ядра отсутствует (R3);
//   * R5 — validateCityState (cities.js:630) ОТБРАСЫВАЕТ storage-
//     поле built-записей — тихая потеря при каждом лоаде сейва
//     (R-VALIDATE);
//   * R6 — [E] на построенном 55: getBuilding(55) — null →
//     console.error + no-op (buildingUI не открывается); строка
//     «Хранилище» (каталог эффекты + реестр EFFECTS) отсутствует;
//   * R7 — src/building-effect-storage.js НЕТ (UMD, саморегистрация,
//     гарды, pipeline-семантика «спец обработал сам»);
//   * R8 — строка build-55 в меню «Строительство» отсутствует (22
//     строки вместо 23); цепочка build→put→fill→refuse отсутствует;
//   * R9 — storage не переживает roundtrip сейва (R5); «Вынуть»
//     (merge id+bonusState в инвентаре) и all-or-nothing отсутствуют;
//   * R10 — special 'demolish' без гарда D10: разборка непустого
//     55 УСПЕШНА (предметы теряются вместе с записью);
//   * R11 — index.html без тега src/building-effect-storage.js
//     (IO4: ПОСЛЕ building-actions.js и building-effect-fullrest.js,
//     ДО hud.js).
//
// Фикстуры: fake deps-бандл (паттерн tests/city-interact.test.js
// initCityBuild) + РЕАЛЬНЫЕ модули (cities.js/buildings.js/items.js/
// player.js/building-effects.js/building-actions.js) — строка
// «Хранилище» data-driven (каталог + EFFECTS), для неё нужен реальный
// buildingActions. Спец-модуль регистрируется ЯВНО (node-экспорт
// storageHandler — паттерн tests/building-effect-runes.test.js; в
// браузере — саморегистрация при загрузке).

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

// Спец-модуль — ЛЕНИВО (красная стадия: файла нет → null; неудавшийся
// require НЕ кэшируется — повторные require зелёной стадии работают).
const STORAGE_MOD = path.join(ROOT, 'src/building-effect-storage.js');
function loadStorageMod() {
  if (!fs.existsSync(STORAGE_MOD)) return null;
  try { return require(STORAGE_MOD); } catch (err) { return null; }
}

// Набор D3 (21) — существующие buildable-типы (каталог, id-порядок);
// после задачи — +55 (22).
const D3_21 = [1, 2, 3, 4, 7, 8, 10, 11, 25, 36, 37, 38, 39, 40,
  42, 43, 44, 45, 46, 48, 49];

// Сиды (000202-рецепт: ВСЕ 10 реагентов в максимуме цен, вес 13.4 кг
// после списания исходников ≤ 30 кг) + 30 РАЗНЫХ предметов по 1 шт.
// (батчи A/B, вес ≤ 30 кг на батч) — итого 40 РАЗНЫХ (id, bonusState)
// для заполнения ёмкости 40 (D5).
const REAGENT_SEED = {
  sulfur: 10, hide: 8, wood_log: 3, moonstone: 3, stone_chunk: 3,
  herb_healing: 2, iron_ore: 2, coal: 2, herb_mana: 2, herb_bitter: 2,
};
const BATCH_A = ['bread', 'meat', 'honey_cake', 'minor_healing',
  'mana_potion', 'alchemy_manual', 'archery_manual', 'fireball_scroll',
  'frost_bolt_scroll', 'berry_red'];
const BATCH_B = ['wood_sword', 'iron_sword', 'steel_sword', 'short_bow',
  'hunting_bow', 'leather_armor', 'chainmail', 'healing_potion',
  'greater_healing', 'mana_elixir', 'sword_treatise', 'fire_spellbook',
  'ice_spellbook', 'stone_chisel', 'flame_burst_scroll', 'blizzard_scroll',
  'silver_ore', 'quartz', 'berry_blue', 'fruit_apple'];
const ALL40 = Object.keys(REAGENT_SEED).concat(BATCH_A, BATCH_B);

// console.warn-шпион (паттерн withWarns tests/cities.test.js).
function withWarns(fn) {
  const warns = [];
  const orig = console.warn;
  console.warn = (...a) => { warns.push(a.join(' ')); };
  let res;
  try { res = fn(); } finally { console.warn = orig; }
  return { res, warns };
}

// ============================================================
// Фикстура: fake deps + РЕАЛЬНЫЕ модули (паттерн initCityBuild)
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
    contents: null, // ЛОВУШКА __game.dungeon — ОБЯЗАТЕЛЬНО null в городе
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
      // РЕАЛЬНЫЙ building-effects (строка «Хранилище» data-driven:
      // эффектIds из каталога → запись EFFECTS; в node lazyGame() —
      // globalThis.Game отсутствует → крафт-строки нет).
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
    getMap: () => ((x, y) => ({ x, y, passable: true, hasBuilding: false })),
    mover: null,
  };
  return { deps, o, ds };
}

// Спец-модуль регистрируется явно (node-экспорт; в браузере —
// саморегистрация при загрузке). Красная стадия — модуль нет →
// регистрация не происходит (pipeline для 'storage' молчит).
function withStorageSpecial() {
  const S = loadStorageMod();
  if (S && typeof S.storageHandler === 'function')
    BA.registerSpecial('storage', S.storageHandler);
  return S;
}

// Город 18×18 (fp5, якорь 100,-40); hero = createCharacter (инвентарь
// лениво); РЕАЛЬНЫЕ flat-items + Cities + каталог на deps.game.
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
  withStorageSpecial();
  BA.init(env.deps); // re-init — присвоение бандла (паттерн BA-тестов)
  return Object.assign({ BA }, env);
}

// Якорь города (worldKey + buildingAnchor) — чтобы interactCity
// резолвил cityAnchor '100,-40' (дефолтный fake без worldKey — тихо
// null, :1552-1576).
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

// ============================================================
// R1. Каталог: 000055.json «Хранилище» + зеркало buildings.js
// ============================================================

test('000221-R1. каталог: 000055.json «Хранилище» + зеркало getBuilding(55): прочее, npc null, слот 12/доля 0, БЕЗ map_index/«спрайт»/«размер», эффекты ["storage"], слоты 40, стройка 100 з. + Бревно×2 + Каменный обломок×2', () => {
  const p = path.join(ROOT, 'assets/buildings/000055.json');
  assert.ok(fs.existsSync(p),
    'RED: файл assets/buildings/000055.json отсутствует');
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  assert.equal(j.id, 55, 'RED: id 55');
  assert.equal(j.название, 'Хранилище', 'RED: название');
  assert.equal(j.категория, 'прочее', 'RED: категория прочее (7→8)');
  assert.equal(j.типичный_npc, null, 'RED: типичный_npc — null');
  assert.deepEqual(j.допустимые_тайлы,
    ['песок', 'трава', 'лес', 'холмы'], 'RED: допустимые_тайлы');
  assert.ok(!('размер' in j), '1×1 — поле «размер» не требуется');
  assert.ok(!('спрайт' in j),
    'RED: Д3 — НЕТ поля «спрайт» (слот 12 = npc_house.svg, '
    + 'НОВЫХ SVG НЕТ)');
  const pp = j.особые_параметры;
  assert.ok(pp && typeof pp === 'object', 'особые_параметры');
  assert.ok(pp.map_index == null,
    'RED: Д2 — БЕЗ map_index (мир бит-в-бит)');
  assert.ok(!('раз_в_день' in pp),
    'RED: без лимита раз-в-день (hasDailyLimit — false)');
  assert.deepEqual(pp.эффекты, ['storage'],
    'RED: эффекты ["storage"] (data-driven строка [E])');
  assert.equal(pp.хранилище && pp.хранилище.слоты, 40,
    'RED: хранилище.слоты — 40 (D5)');
  assert.deepEqual(pp.размещение, { слот: 12, доля: 0 },
    'RED: размещение {слот:12, доля:0} (доля 0 — в содержимом НЕ '
    + 'спавнится, строится ТОЛЬКО игроком)');
  assert.deepEqual(pp.стройка, {
    золото: 100,
    исходники: [
      { предмет: 'assets/items/000035.json', количество: 2 },
      { предмет: 'assets/items/000036.json', количество: 2 },
    ],
  }, 'RED: стройка — 100 з. + Бревно×2 + Каменный обломок×2 (ссылки-файлы)');

  // Зеркало (buildings.js, ссылки-файлы → id):
  assert.equal(B.BUILDINGS.length, 55, 'RED: зеркало 54 → 55');
  const b55 = B.getBuilding(55);
  assert.ok(b55, 'RED: зеркало getBuilding(55)');
  assert.equal(b55.название, 'Хранилище');
  assert.equal(b55.категория, 'прочее');
  assert.equal(b55.типичный_npc, null);
  assert.ok(!('размер' in b55), '1×1 (buildingSize — дефолт)');
  assert.ok(!('спрайт' in b55), 'Д3 — без «спрайт»');
  const mpp = b55.особые_параметры;
  assert.ok(mpp.map_index == null, 'Д2 — зеркало без map_index');
  assert.deepEqual(mpp.эффекты, ['storage']);
  assert.equal(mpp.хранилище.слоты, 40);
  assert.deepEqual(mpp.размещение, { слот: 12, доля: 0 });
  assert.equal(mpp.стройка.золото, 100);
  assert.deepEqual(mpp.стройка.исходники, [
    { предмет: 'wood_log', количество: 2 },
    { предмет: 'stone_chunk', количество: 2 },
  ], 'RED: зеркало — ссылки ВЫПЕЧЕНЫ в id (wood_log/stone_chunk)');
});

// ============================================================
// R2. buildable: 22 id (D3 + 55); цена 55
// ============================================================

test('000221-R2. buildable: 22 id (D3 + 55, конец — id-порядок); buildCost(55) = {золото:100, исходники: Бревно×2 + Каменный обломок×2}', () => {
  const ids = C.buildableBuildingIds();
  assert.deepEqual(ids, D3_21.concat([55]),
    'RED: buildableBuildingIds — 22 id (сейчас 21, 55 нет): '
    + JSON.stringify(ids));
  const cost = C.buildCost(55);
  assert.deepEqual(cost, {
    золото: 100,
    исходники: [
      { предмет: 'wood_log', количество: 2 },
      { предмет: 'stone_chunk', количество: 2 },
    ],
  }, 'RED: buildCost(55) — каталожная цена (норма-копия)');
});

// ============================================================
// R3. Ядро: surface 5 функций (экспорт return-блока cities.js)
// ============================================================

test('000221-R3. ядро cities.js: storageCapacity/storageSanitize/storageAt/storagePut/storageTake — typeof function (экспорт)', () => {
  for (const name of ['storageCapacity', 'storageSanitize',
      'storageAt', 'storagePut', 'storageTake']) {
    assert.equal(typeof C[name], 'function',
      'RED: export cities.js ' + name + ' отсутствует (D6)');
  }
});

// ============================================================
// R4. Ядро: семантика (чистые функции, node)
// ============================================================

test('000221-R4. ядро: capacity (каталог 40 / id вне каталога 0 / без .хранилище 0), sanitize (копия, warn «cities» + отброс битых, не-массив → []), storageAt (живая ссылка / null-случаи), storagePut (merge (id,bonusState), стак 99, 40 → full, purity), storageTake (целой записью, out-of-range → {ok:false}, purity)', () => {
  // storageCapacity (D6):
  assert.equal(C.storageCapacity(55), 40,
    'RED: каталог 000055 — хранилище.слоты 40');
  assert.equal(C.storageCapacity(999), 0,
    'RED: id ∉ каталогу — 0 (НЕ throw: гард, не ошибка вызывающего)');
  assert.equal(C.storageCapacity(48), 0,
    'RED: каталог без .хранилище — 0');

  // storageSanitize (D6): чистая КОПИЯ, запись валидна ⇔ id —
  // непустая строка, qty int 1..99, bonus — plain-object ИЛИ нет.
  const clean = [{ id: 'wood_log', qty: 3 },
    { id: 'sulfur', qty: 1, bonus: { damage: 2 } }];
  const cleanCopy = JSON.parse(JSON.stringify(clean));
  const out = C.storageSanitize(clean);
  assert.deepEqual(out, clean, 'валидный ввод — чистая копия');
  assert.notEqual(out, clean, 'НОВЫЙ массив (вход не возвращается)');
  const brokenIn = [
    { id: 'wood_log', qty: 0 }, // qty < 1
    { id: 'sulfur', qty: 100 }, // qty > 99
    { id: 42, qty: 3 }, // id не строка
    { id: '', qty: 3 }, // id пустая
    { id: 'sulfur', qty: 3, bonus: [1] }, // bonus не plain-object
    { id: 'sulfur', qty: 3, bonus: null }, // bonus null
    { id: 'herb_healing', qty: 2 }, // валидная
  ];
  const broken0 = JSON.parse(JSON.stringify(brokenIn));
  const qw = withWarns(() => C.storageSanitize(brokenIn));
  assert.deepEqual(qw.res, [{ id: 'herb_healing', qty: 2 }],
    'RED: битые ЗАПИСИ отброшены, валидные живы');
  assert.ok(qw.warns.some((m) => /cities/.test(m)),
    'RED: console.warn (msg содержит «cities», 000029)');
  assert.deepEqual(brokenIn, broken0, 'вход не мутируется');
  assert.deepEqual(C.storageSanitize(null), [], 'не-массив (null) → []');
  assert.deepEqual(C.storageSanitize('x'), [], 'не-массив (string) → []');
  assert.deepEqual(C.storageSanitize({ a: 1 }), [],
    'не-массив (object) → []');

  // storageAt (D6): built-запись на клетке → живая ссылка на storage
  // | null (нет записи / не-player / нет record).
  const rec = { built: [
    { x: 1, y: 1, buildingId: 55, player: true,
      storage: [{ id: 'sulfur', qty: 5 }] },
    { x: 3, y: 3, buildingId: 55, player: false,
      storage: [{ id: 'sulfur', qty: 5 }] },
  ] };
  assert.equal(C.storageAt(rec, 1, 1), rec.built[0].storage,
    'RED: ЖИВАЯ ссылка на storage (точка персиста — мутация записи)');
  assert.equal(C.storageAt(rec, 9, 9), null, 'нет built-записи → null');
  assert.equal(C.storageAt(rec, 3, 3), null,
    'не-player запись → null');
  assert.equal(C.storageAt(null, 1, 1), null, 'record null → null');
  assert.equal(C.storageAt({}, 1, 1), null, 'no built → null');
  assert.equal(C.storageAt({ built: 'x' }, 1, 1), null,
    'built не массив → null');

  // storagePut (D6): merge по (id, bonusState), стак ≤ 99, записи
  // ≤ capacity, чистый (новый массив, вход не мутируется).
  let s = [{ id: 'sulfur', qty: 10 }];
  const s0 = JSON.parse(JSON.stringify(s));
  let r = C.storagePut(s, 'wood_log', 3, null, 40);
  assert.equal(r.ok, true, 'RED: новая запись — ok');
  assert.deepEqual(r.storage,
    [{ id: 'sulfur', qty: 10 }, { id: 'wood_log', qty: 3 }],
    'RED: запись добавлена (новый массив)');
  assert.notEqual(r.storage, s, 'новый массив (не вход)');
  assert.deepEqual(s, s0, 'RED: вход не мутируется (purity)');
  // merge в существующий стак — до 99, остаток — НОВАЯ запись:
  s = [{ id: 'sulfur', qty: 95 }];
  r = C.storagePut(s, 'sulfur', 10, null, 40);
  assert.ok(r.ok, 'RED: merge в стак');
  assert.deepEqual(r.storage,
    [{ id: 'sulfur', qty: 99 }, { id: 'sulfur', qty: 6 }],
    'RED: стак 99 + остаток новой записью (95+10 — 105 хранится)');
  // (id, bonusState) — ИЗОЛЯЦИЯ: тот же id, другой бонус — отдельная
  // запись (bonusState items.js:224 — канонический merge-ключ).
  s = [{ id: 'wood_log', qty: 3 }];
  r = C.storagePut(s, 'wood_log', 2, { damage: 2 }, 40);
  assert.ok(r.ok, 'RED: bonus-запись');
  assert.deepEqual(r.storage,
    [{ id: 'wood_log', qty: 3 },
     { id: 'wood_log', qty: 2, bonus: { damage: 2 } }],
    'RED: (id, bonusState) — изоляция');
  // capacity: 40 записей → 41-я — {ok:false, reason:'full'};
  // merge в существующий при capacity — OK (записей не прибавилось).
  s = [];
  for (let i = 0; i < ALL40.length; i++) {
    assert.equal(ALL40.length, 40, 'фикстура: 40 разных предметов');
    r = C.storagePut(s, ALL40[i], 1, null, 40);
    assert.ok(r.ok, 'RED: запись ' + i + ' (≤ 40) — ok');
    s = r.storage;
  }
  const fullCopy = JSON.parse(JSON.stringify(s));
  r = C.storagePut(s, 'fruit_quince', 1, null, 40);
  assert.equal(r.ok, false, 'RED: 41-я запись — отказ');
  assert.equal(r.reason, 'full', 'RED: reason «full»');
  assert.deepEqual(s, fullCopy, 'REFUSE — вход не мутируется');
  r = C.storagePut(s, ALL40[0], 1, null, 40);
  assert.ok(r.ok, 'RED: merge в существующий при capacity — ok');
  assert.equal(r.storage.length, 40, 'записей не прибавилось');

  // storageTake (D6): точный индекс, ЦЕЛОЙ записью; out-of-range —
  // {ok:false}; чистый.
  const base = [{ id: 'sulfur', qty: 5 },
    { id: 'wood_log', qty: 3, bonus: { damage: 2 } }];
  const base0 = JSON.parse(JSON.stringify(base));
  r = C.storageTake(base, 0);
  assert.equal(r.ok, true, 'RED: take 0 — ok');
  assert.deepEqual(r.entry, { id: 'sulfur', qty: 5 },
    'RED: entry — целая запись');
  assert.deepEqual(r.storage,
    [{ id: 'wood_log', qty: 3, bonus: { damage: 2 } }],
    'RED: новый массив без записи');
  assert.notEqual(r.storage, base, 'новый массив');
  assert.deepEqual(base, base0, 'RED: вход не мутируется (purity)');
  assert.equal(C.storageTake(base, 2).ok, false,
    'RED: out-of-range (верх) — {ok:false}');
  assert.equal(C.storageTake(base, -1).ok, false,
    'RED: out-of-range (низ) — {ok:false}');
  assert.equal(C.storageTake(base, 1.5).ok, false,
    'не-целый индекс — {ok:false}');
});

// ============================================================
// R5. Персист: roundtrip validate→serialize→restore (D7)
// ============================================================

test('000221-R5. персист: storage живёт в roundtrip (окно stock истекло — built/name персистентны); битое ПОЛЕ (не-массив) → warn «cities» + отброс поля, запись жива; битые ЗАПИСИ → warn + отброс; storage [] / без storage → поле omitted (byte-совместимость)', () => {
  const built = [{ x: 2, y: 2, buildingId: 55, player: true,
    storage: [{ id: 'wood_log', qty: 3 },
      { id: 'sulfur', qty: 1, bonus: { damage: 2 } }] }];
  const built0 = JSON.parse(JSON.stringify(built));
  const input = { '20,-16': { lastVisitDay: 1, stock: { '2,2': { bread: 1 } },
    name: 'Флогистонград', built } };
  // (a) ROUNDTRIP: окно stock истекло (10 − 1 ≥ 3) — stock отброшен,
  // built/name/storage ПЕРСИСТЕНТНЫ (R-VALIDATE: сейчас validate-
  // CityState storage-поле молча ОТБРАСЫВАЕТ).
  const ser = C.serializeCityStates(input, 10, 3);
  assert.deepEqual(ser, { '20,-16': { name: 'Флогистонград',
    built: [{ x: 2, y: 2, buildingId: 55, player: true,
      storage: [{ id: 'wood_log', qty: 3 },
        { id: 'sulfur', qty: 1, bonus: { damage: 2 } }] }] } },
    'RED: storage переживает roundtrip (сейчас — поле отброшено): '
    + JSON.stringify(ser));
  assert.deepEqual(input['20,-16'].built, built0, 'вход не мутируется');
  assert.notEqual(ser['20,-16'].built[0].storage, built[0].storage,
    'копия (не ссылка на вход)');
  const rest = C.restoreCityStates(ser, 10, 3);
  assert.equal(rest.size, 1, 'restore — запись жива');
  assert.deepEqual(rest.get('20,-16').built[0].storage,
    [{ id: 'wood_log', qty: 3 },
      { id: 'sulfur', qty: 1, bonus: { damage: 2 } }],
    'RED: restore — storage цел');
  // (b) битое ПОЛЕ (не-массив) → warn «cities» + отброс ПОЛЯ,
  // запись жива (паттерн 000148.05):
  const q = withWarns(() => C.serializeCityStates({
    '20,-16': { lastVisitDay: 18, stock: { '2,2': { bread: 2 } },
      built: [{ x: 2, y: 2, buildingId: 55, player: true,
        storage: 'nope' }] },
  }, 20, 3));
  assert.ok(q.warns.some((m) => /cities/.test(m)),
    'RED: warn «cities» (битое storage-поле)');
  assert.deepEqual(q.res, { '20,-16': { lastVisitDay: 18,
    stock: { '2,2': { bread: 2 } },
    built: [{ x: 2, y: 2, buildingId: 55, player: true }] } },
    'RED: поле отброшено, запись жива (4 ключа)');
  // (c) битые ЗАПИСИ (qty 0 / id число) → warn + отброс ЗАПИСИ,
  // валидные живы:
  const q2 = withWarns(() => C.serializeCityStates({
    '20,-16': { lastVisitDay: 18, stock: {},
      built: [{ x: 2, y: 2, buildingId: 55, player: true,
        storage: [{ id: 'wood_log', qty: 0 }, { id: 42, qty: 3 },
          { id: 'sulfur', qty: 5 }] }] },
  }, 20, 3));
  assert.ok(q2.warns.some((m) => /cities/.test(m)),
    'RED: warn «cities» (битые storage-записи)');
  assert.deepEqual(q2.res['20,-16'].built[0].storage,
    [{ id: 'sulfur', qty: 5 }],
    'RED: битые записи отброшены, валидная жива');
  // (d) пустое storage → поле omitted (D-.05f, паритет built 0):
  const q3 = C.serializeCityStates({
    '20,-16': { lastVisitDay: 18, stock: {},
      built: [{ x: 2, y: 2, buildingId: 55, player: true,
        storage: [] }] },
  }, 20, 3);
  assert.deepEqual(q3['20,-16'].built[0],
    { x: 2, y: 2, buildingId: 55, player: true },
    'пустое storage — поле omitted');
  // (e) БЕЗ storage → ровно 4 ключа (byte-совместимость, R22-R26
  // 000148.05 / 000109 — зелёные без правок):
  const q4 = C.serializeCityStates({
    '20,-16': { lastVisitDay: 18, stock: {},
      built: [{ x: 2, y: 2, buildingId: 55, player: true }] },
  }, 20, 3);
  assert.deepEqual(q4['20,-16'].built[0],
    { x: 2, y: 2, buildingId: 55, player: true },
    'запись без storage — ровно 4 ключа');
});

// ============================================================
// R6. [E] на построенном 55 (player) — строки [storage, upgrade,
// demolish] (upgrade — 000222)
// ============================================================

test('000221-R6. [E] на построенном 55 (per-cell player:true) → buildingUI: строки [{id:"storage", имя:"Хранилище", доступен:true}, {id:"upgrade", «Улучшить…» (000222)}, {id:"demolish", «Разобрать (возврат 30 з.)»}], title «хранилище», npcUI не открывается', () => {
  const t = initStorageFixture({
    x: 1, y: 1,
    cityContents: [{ x: 1, y: 1, buildingId: 55, player: true }],
  });
  wireCityAnchor(t, 100, -40);
  const cs = new Map([['100,-40', { lastVisitDay: 5, stock: {},
    built: [{ x: 1, y: 1, buildingId: 55, player: true,
      storage: [] }] }]]);
  t.deps.cityStates = cs;
  t.BA.interactCity();
  assert.equal(t.o.calls.buildingOpen.length, 1,
    'RED: buildingUI — меню построенного игроком 55 (сейчас: '
    + 'getBuilding(55) — null → no-op)');
  const p = t.o.calls.buildingOpen[0];
  assert.equal(p.title, 'хранилище',
    'RED: title — название каталога, первая буква нижним');
  assert.deepEqual(p.actions.map((a) => a.id),
    ['storage', 'upgrade', 'demolish'],
    'RED: строки — «Хранилище» (эффекты), «Улучшить» (000222), '
    + '«Разобрать» (конец списка): '
    + JSON.stringify(p.actions.map((a) => a.id)));
  const st = p.actions[0];
  assert.equal(st.имя, 'Хранилище',
    'RED: имя — реестр EFFECTS["storage"] (data-driven, каталог '
    + 'эффекты ["storage"])');
  assert.equal(st.доступен, true,
    'RED: без раз_в_день — строка ВСЕГДА доступна');
  assert.equal(st.reason, undefined, 'доступная строка — без reason');
  assert.equal(p.actions[2].имя, 'Разобрать (возврат 30 з.)',
    'RED: «Разобрать» — 30% floor (100 → 30), предметный возврат '
    + 'пуст (2 → 0) — старая форма');
  assert.equal(t.o.calls.npcOpen.length, 0,
    'npcUI напрямую НЕ открывается (ТОЛЬКО через buildingUI)');
});

// ============================================================
// R7. Спец-модуль: node-экспорт/гарды, browser-саморегистрация,
//     pipeline «спец обработал сам»
// ============================================================

test('000221-R7. спец-модуль src/building-effect-storage.js: node-ветка {storageHandler}; гарды (якорь/cityStates/запись→«Постройка не найдена»/capacity→«Хранилище недоступно»/buildingUI→console.error); browser-ветка: без Game тихо, без buildingActions — console.error, с registerSpecial — «storage»; pipeline: onAction("storage") → оверлей «Хранилище», возврат {ok:false} БЕЗ message → без saveNow/flash/playerRender', () => {
  const S = loadStorageMod();
  assert.ok(S && typeof S === 'object' && !Array.isArray(S),
    'RED: модуль src/building-effect-storage.js (UMD) отсутствует');
  assert.equal(typeof S.storageHandler, 'function',
    'RED: node-экспорт {storageHandler}');

  // --- Гарды storageHandler (node, прямой вызов) ---
  // Полный ctx (форма спец-ctx 000128 из pipeline onBuildingAction):
  function guardCtx(over) {
    const opens = [];
    const hero = PLR.createCharacter();
    IT.addItem(hero, 'wood_log', 3);
    const base = {
      t: { x: 1, y: 1, cityAnchor: '100,-40' },
      b: B.getBuilding(55),
      hero,
      world: {
        cityStates: new Map([['100,-40', {
          built: [{ x: 1, y: 1, buildingId: 55, player: true,
            storage: [{ id: 'sulfur', qty: 5 }] }] }]]),
        game: {
          Cities: C,
          buildingUI: { open: (p) => { opens.push(p); } },
          getItem: IT.getItem, canAddItem: IT.canAddItem,
          addItem: IT.addItem, totalQty: IT.totalQty,
        },
        saveNow: () => {}, flash: () => {}, playerRender: () => {},
      },
      opens,
    };
    return Object.assign(base, over);
  }
  // (1) нет t.cityAnchor — {ok:false, message} (не падает):
  let g = guardCtx({ t: { x: 1, y: 1 } });
  let r = S.storageHandler(g);
  assert.equal(r.ok, false, 'RED: гард — нет якоря');
  assert.equal(typeof r.message, 'string', 'видимый отказ (message)');
  assert.ok(r.message && r.message.length > 0,
    'RED: message непустая');
  // (2) нет world.cityStates — {ok:false, message}:
  g = guardCtx({ world: { game: g.world.game } });
  r = S.storageHandler(g);
  assert.equal(r.ok, false, 'RED: гард — нет cityStates');
  assert.equal(typeof r.message, 'string');
  assert.ok(r.message.length > 0, 'RED: message непустая');
  // (3) нет record (пустой Map) — «Постройка не найдена»:
  g = guardCtx({ world: Object.assign({}, g.world,
    { cityStates: new Map() }) });
  r = S.storageHandler(g);
  assert.deepEqual(r, { ok: false, message: 'Постройка не найдена' },
    'RED: fail-open — «Постройка не найдена»');
  // (4) record есть, но built-записи на (1,1) нет — «Постройка не
  // найдена» (storageAt → null):
  g = guardCtx({ world: {
    cityStates: new Map([['100,-40', {
      built: [{ x: 9, y: 9, buildingId: 55, player: true,
        storage: [{ id: 'sulfur', qty: 5 }] }] }]]),
    game: { Cities: C, buildingUI: { open: () => {} },
      getItem: IT.getItem, canAddItem: IT.canAddItem,
      addItem: IT.addItem, totalQty: IT.totalQty },
    saveNow: () => {}, flash: () => {}, playerRender: () => {},
  } });
  r = S.storageHandler(g);
  assert.deepEqual(r, { ok: false, message: 'Постройка не найдена' },
    'RED: нет built-записи на клетке — «Постройка не найдена»');
  // (5) capacity ≤ 0 (id вне каталога) — «Хранилище недоступно»:
  g = guardCtx({ b: { id: 999 } });
  r = S.storageHandler(g);
  assert.deepEqual(r, { ok: false,
    message: 'Хранилище недоступно' },
    'RED: capacity 0 — «Хранилище недоступно»');
  // (6) нет world.game.buildingUI — console.error + {ok:false,
  // message} (wiring-сбой 000053, игра не падает):
  g = guardCtx({ world: {
    cityStates: new Map([['100,-40', {
      built: [{ x: 1, y: 1, buildingId: 55, player: true,
        storage: [{ id: 'sulfur', qty: 5 }] }] }]]),
    game: { Cities: C, getItem: IT.getItem, canAddItem: IT.canAddItem,
      addItem: IT.addItem, totalQty: IT.totalQty },
    saveNow: () => {}, flash: () => {}, playerRender: () => {},
  } });
  const errs = [];
  const origErr = console.error;
  console.error = (...a) => { errs.push(a.join(' ')); };
  try { r = S.storageHandler(g); } finally { console.error = origErr; }
  assert.equal(r.ok, false, 'RED: гард — нет buildingUI');
  assert.equal(typeof r.message, 'string');
  assert.ok(errs.length > 0,
    'RED: console.error (wiring-сбой): ' + JSON.stringify(errs));
  // (7) happy: строки построены, оверлей открыт, возврат {ok:false}
  // БЕЗ message (pipeline молчит — «спец обработал сам»):
  g = guardCtx({});
  r = S.storageHandler(g);
  assert.equal(r.ok, false,
    'RED: возврат {ok:false} (оверлей открыт сам)');
  assert.equal(r.message, undefined,
    'RED: БЕЗ message — pipeline без saveNow/flash');
  assert.equal(g.opens.length, 1, 'RED: buildingUI.open — 1');
  assert.equal(g.opens[0].title, 'Хранилище',
    'RED: оверлей «Хранилище»');
  assert.deepEqual(g.opens[0].actions.map((a) => a.id),
    ['put-0', 'take-0'],
    'RED: строки FLAT — put-*/take-* (Сложить ПЕРЕД Вынуть): '
    + JSON.stringify(g.opens[0].actions.map((a) => a.id)));
  assert.equal(g.opens[0].actions[0].имя, 'Сложить: Бревно ×3',
    'RED: «Сложить: <имя> ×<qty>» (hero inventory)');
  assert.equal(g.opens[0].actions[0].доступен, true,
    'RED: место в хранилище (0/40) — доступно');
  assert.equal(g.opens[0].actions[1].имя, 'Вынуть: Сера ×5',
    'RED: «Вынуть: <имя> ×<qty>» (entry.storage)');
  assert.equal(g.opens[0].actions[1].доступен, true,
    'RED: dry-run canAddItem — инвентарь не полон');

  // --- Browser-ветка (саморегистрация при загрузке, mini-vm) ---
  // UMD: в контексте без module → factory(root) — саморегистрация
  // root.Game.buildingActions.registerSpecial('storage', …).
  const src = fs.readFileSync(STORAGE_MOD, 'utf8');
  function runBrowser(over) {
    const errs2 = [];
    const reg = [];
    const ctxObj = Object.assign({
      console: { error: (...a) => { errs2.push(a.join(' ')); },
        warn: () => {} },
    }, over);
    vm.createContext(ctxObj);
    vm.runInContext(src, ctxObj,
      { filename: 'building-effect-storage.js' });
    return { errs2, reg };
  }
  // (a) без Game — ТИХО (не падает, без console.error):
  let br = runBrowser({});
  assert.equal(br.errs2.length, 0,
    'RED: browser-ветка без Game — тихо (нет console.error)');
  // (b) Game без buildingActions/registerSpecial — console.error +
  // без регистрации:
  br = runBrowser({ Game: {} });
  assert.ok(br.errs2.length > 0,
    'RED: Game без buildingActions — console.error: '
    + JSON.stringify(br.errs2));
  assert.ok(br.errs2[0].indexOf('building-effect-storage') >= 0,
    'RED: message начинается с имени модуля: ' + br.errs2[0]);
  // (c) Game с registerSpecial — зарегистрирован «storage»:
  // (локальный regC — замыкание на внешнее `br` в момент вызова
  // registerSpecial ещё указывает на (b): TDZ-ловушка харнеса).
  const regC = [];
  br = runBrowser({ Game: { buildingActions: {
    registerSpecial: (id, fn) => regC.push([id, fn]),
  } } });
  assert.equal(regC.length, 1,
    'RED: browser-саморегистрация — ровно 1 спец');
  assert.equal(regC[0][0], 'storage',
    'RED: зарегистрирован id «storage»');
  assert.equal(typeof regC[0][1], 'function',
    'RED: handler — function');

  // --- Pipeline: onAction("storage") → оверлей, БЕЗ saveNow/flash ---
  const t = initStorageFixture({
    x: 1, y: 1,
    cityContents: [{ x: 1, y: 1, buildingId: 55, player: true }],
  });
  wireCityAnchor(t, 100, -40);
  const cs = new Map([['100,-40', { lastVisitDay: 5, stock: {},
    built: [{ x: 1, y: 1, buildingId: 55, player: true,
      storage: [{ id: 'sulfur', qty: 5 }] }] }]]);
  t.deps.cityStates = cs;
  IT.addItem(t.hero, 'wood_log', 3);
  let saves = 0, renders = 0;
  const flashes = [];
  t.deps.saveNow = () => { saves += 1; };
  t.deps.playerRender = () => { renders += 1; };
  t.deps.flash = (m) => { flashes.push(m); };
  t.BA.interactCity();
  assert.equal(t.o.calls.buildingOpen.length, 1,
    'RED: [E] — меню построенного 55');
  const p = t.o.calls.buildingOpen[0];
  const st = p.actions.find((a) => a.id === 'storage');
  assert.ok(st, 'RED: строка {id:"storage"}');
  p.onAction({ id: 'storage' });
  assert.equal(saves, 0,
    'RED: pipeline — открытие оверлея БЕЗ saveNow (семантика 000128 §2.6)');
  assert.equal(flashes.length, 0,
    'RED: pipeline — БЕЗ flash ({ok:false} без message)');
  assert.equal(renders, 0, 'RED: pipeline — БЕЗ playerRender');
  const ov = lastOverlay(t);
  assert.equal(ov.title, 'Хранилище', 'RED: оверлей «Хранилище»');
  assert.deepEqual(ov.actions.map((a) => a.id), ['put-0', 'take-0'],
    'RED: put-*/take-* строки');
  assert.equal(ov.actions[0].имя, 'Сложить: Бревно ×3');
  assert.equal(ov.actions[1].имя, 'Вынуть: Сера ×5');
});

// ============================================================
// R8. e2e: build 55 → [E] → «Хранилище» → «Сложить» → 40 → full
// ============================================================

test('000221-R8. e2e: строка build-55 в меню (23 строки) → постройка (1000→900, Бревно 3→1, Каменный обломок 3→1, built, per-cell, saveNow, flash) → [E] → «Хранилище» → «Сложить» (запись из инвентаря, quick-слоты сохранены — своя единица, 000223, entry.storage, saveNow, flash «Сложено: …», reopen) → 40 записей → «Сложить» disabled «хранилище полное (40/40)» + отказ-flash БЕЗ мутации/сейва', () => {
  const t = initStorageFixture({ x: 1, y: 1 });
  wireCityAnchor(t, 100, -40);
  const cs = new Map([['100,-40', { lastVisitDay: 5, stock: {} }]]);
  t.deps.cityStates = cs;
  t.hero.gold = 1000;
  for (const [rid, qty] of Object.entries(REAGENT_SEED))
    assert.ok(IT.addItem(t.hero, rid, qty).ok, 'сид 000202: ' + rid);
  for (const rid of BATCH_A)
    assert.ok(IT.addItem(t.hero, rid, 1).ok, 'сид батч A: ' + rid);
  const flashes = [];
  t.deps.flash = (m) => { flashes.push(m); };
  let saves = 0, renders = 0;
  t.deps.saveNow = () => { saves += 1; };
  t.deps.playerRender = () => { renders += 1; };

  // (a) Меню «Строительство»: 23 строки (22 buildable + rename).
  t.BA.interactCity();
  assert.equal(t.o.calls.buildingOpen.length, 1,
    'меню «Строительство»');
  const menu = lastOverlay(t);
  assert.equal(menu.actions.length, 23,
    'RED: 23 строки (22 buildable включ. 55 + rename): '
    + menu.actions.length);
  const row55 = menu.actions.find((a) => a.id === 'build-55');
  assert.ok(row55, 'RED: строка build-55 в меню');
  assert.equal(row55.имя,
    'Построить: Хранилище — 100 з. (Бревно ×2, Каменный обломок ×2)',
    'RED: формат строки (каталог + цена): '
    + (row55 ? row55.имя : '—'));
  assert.equal(row55.доступен, true,
    'RED: gold 1000 + Бревно 3≥2 + Каменный обломок 3≥2 — доступна');
  assert.equal(row55.reason, undefined, 'доступная — без reason');

  // (b) Постройка: списание, built, per-cell, saveNow, flash.
  menu.onAction({ id: 'build-55' });
  assert.equal(t.hero.gold, 900, 'RED: золото 1000 → 900 (−100)');
  assert.equal(IT.totalQty(t.hero, 'wood_log'), 1,
    'RED: Бревно 3 → 1 (списано ×2)');
  assert.equal(IT.totalQty(t.hero, 'stone_chunk'), 1,
    'RED: Каменный обломок 3 → 1 (списано ×2)');
  assert.ok(cs.get('100,-40').built
    .some((e) => e.buildingId === 55 && e.player === true),
    'RED: built — запись 55 (cityStates)');
  assert.ok(t.ds.cityContents.buildings.some(
    (b) => b.buildingId === 55 && b.player === true),
    'RED: per-cell запись player:true');
  assert.equal(saves, 1, 'RED: saveNow — 1 (успех)');
  assert.ok(flashes.includes(
    'Построено: Хранилище (−100 з., −Бревно ×2, −Каменный обломок ×2)'),
    'RED: flash «Построено: … (−N з., −<имя> ×<Q>)»: '
    + JSON.stringify(flashes));
  t.o.buildingUI.close(); // стек: повторный [E] закрывал бы оверлей

  // (c) [E] на построенном → строка «Хранилище»; onAction("storage")
  // → оверлей (pipeline молчит — см. R7).
  t.BA.interactCity();
  assert.equal(t.o.calls.buildingOpen.length, 2,
    'RED: [E] — меню построенного 55');
  const p2 = t.o.calls.buildingOpen[1];
  const stRow = p2.actions.find((a) => a.id === 'storage');
  assert.ok(stRow, 'RED: строка {id:"storage"} (data-driven)');
  assert.equal(stRow.имя, 'Хранилище');
  const pre = { saves, flashes: flashes.length, renders };
  p2.onAction({ id: 'storage' });
  assert.equal(saves, pre.saves, 'pipeline — без saveNow');
  assert.equal(flashes.length, pre.flashes, 'pipeline — без flash');
  const ov0 = lastOverlay(t);
  assert.equal(ov0.title, 'Хранилище', 'RED: оверлей «Хранилище»');
  assert.equal(ov0.actions.length, 20,
    'RED: 20 put-строк (инвентарь 20 слотов), 0 take (хранилище пусто)');
  assert.equal(ov0.actions[0].имя, 'Сложить: Сера ×10',
    'RED: put-0 — первая запись инвентаря');

  // (d) Quick-слоты: складывание занятый слот НЕ трогает (000223 D5:
  // слот — СВОЯ единица; прецедент «totalQty 0 → null» УБРАН самими
  // 000223 — items.js:498-500). Сохранение: запасы + слоты +
  // хранилище = исходные 10 серы (предмет не теряется никогда).
  assert.ok(IT.setQuick(t.hero, 0, 'sulfur').ok, 'quick[0] = sulfur');
  assert.ok(IT.setQuick(t.hero, 1, 'hide').ok, 'quick[1] = hide');
  t.o.buildingUI.close();
  t.BA.interactCity();
  const ov1 = lastOverlay(t);
  const putSulfur = ov1.actions.find((a) => a.id === 'put-0');
  assert.equal(putSulfur.имя, 'Сложить: Сера ×9',
    'RED: «Сложить: Сера ×9» (1 из 10 — в quick[0], 000223)');
  ov1.onAction({ id: 'put-0' });
  assert.equal(IT.totalQty(t.hero, 'sulfur'), 0,
    'RED: запись УШЛА из инвентаря (splice по идентичности)');
  assert.equal(t.hero.inventory.quick[0], 'sulfur',
    'RED: quick[0] СОХРАНЁН (своя единица — put слот не трогает, '
    + '000223 D5; прежнее «очищен» уничтожало единицу — потеря)');
  assert.equal(t.hero.inventory.quick[1], 'hide',
    'quick[1] СОХРАНЁН (своя единица)');
  let rec = cs.get('100,-40').built.find((e) => e.buildingId === 55);
  assert.deepEqual(rec.storage, [{ id: 'sulfur', qty: 9 }],
    'RED: entry.storage — запись сложена (ЛIVE запись — точка персиста)');
  assert.equal(
    IT.totalQty(t.hero, 'sulfur')
    + (t.hero.inventory.quick[0] === 'sulfur' ? 1 : 0)
    + rec.storage.reduce((s, x) => (x.id === 'sulfur' ? s + x.qty : s), 0),
    10, 'RED: предмет не потерян (запасы 0 + слот 1 + хранилище 9 = 10)');
  assert.equal(saves, pre.saves + 1, 'RED: saveNow (успех)');
  assert.ok(flashes.includes('Сложено: Сера ×9'),
    'RED: flash «Сложено: <имя> ×<qty>»: '
    + JSON.stringify(flashes.slice(pre.flashes)));
  assert.equal(renders, pre.renders + 1, 'RED: playerRender (успех)');
  assert.notEqual(lastOverlay(t), ov1, 'RED: reopen после успеха');

  // (e) До 20 записей (батч A + остаток реагентов): 19 put.
  let guard = 0;
  while (guard++ < 25) {
    const ov = lastOverlay(t);
    const row = ov.actions.find((a) => a.id === 'put-0');
    if (!row) break;
    ov.onAction({ id: 'put-0' });
  }
  rec = cs.get('100,-40').built.find((e) => e.buildingId === 55);
  assert.equal(rec.storage.length, 20,
    'RED: хранилище — 20 записей (батч A + реагенты)');
  assert.equal(t.hero.inventory.slots.length, 0,
    'RED: инвентарь пуст (20 сложен)');
  assert.deepEqual(t.hero.inventory.quick, ['sulfur', 'hide', null],
    'RED: quick-слоты СОХРАНЕНЫ (свои единицы — put не трогает, '
    + '000223 D5)');

  // (f) Батч B: +20 разных → ещё 20 put → 40 записей (ёмкость D5).
  for (const rid of BATCH_B)
    assert.ok(IT.addItem(t.hero, rid, 1).ok, 'сид батч B: ' + rid);
  t.o.buildingUI.close();
  t.BA.interactCity();
  guard = 0;
  while (guard++ < 25) {
    const ov = lastOverlay(t);
    const row = ov.actions.find((a) => a.id === 'put-0');
    if (!row) break;
    ov.onAction({ id: 'put-0' });
  }
  rec = cs.get('100,-40').built.find((e) => e.buildingId === 55);
  assert.equal(rec.storage.length, 40,
    'RED: хранилище — 40 записей (ёмкость, каталог 40)');
  assert.equal(t.hero.inventory.slots.length, 0, 'инвентарь пуст');
  const ovEnd = lastOverlay(t);
  assert.ok(!ovEnd.actions.some((a) => a.id.indexOf('put-') === 0),
    'RED: инвентарь пуст — строк «Сложить» нет');
  assert.equal(ovEnd.actions
    .filter((a) => a.id.indexOf('take-') === 0).length, 40,
    'RED: 40 строк «Вынуть» (по каждой записи)');

  // (g) Ёмкость: «Сложить» disabled + reason; прямой onAction
  // (обход оверлея) → отказ-flash, без мутации/сейва.
  assert.ok(IT.addItem(t.hero, 'fruit_quince', 1).ok,
    'сид fruit_quince');
  t.o.buildingUI.close();
  t.BA.interactCity();
  const ovFull = lastOverlay(t);
  const putFull = ovFull.actions.find((a) => a.id === 'put-0');
  assert.ok(putFull, 'RED: строка put-0 (fruit_quince)');
  assert.equal(putFull.доступен, false,
    'RED: «Сложить» DISABLED при ёмкости 40/40');
  assert.equal(putFull.reason, 'хранилище полное (40/40)',
    'RED: reason «хранилище полное (N/M)»: ' + putFull.reason);
  const preFull = { saves, flashes: flashes.length };
  ovFull.onAction({ id: 'put-0' });
  assert.ok(flashes.includes('Хранилище полное'),
    'RED: отказ-flash «Хранилище полное»: '
    + JSON.stringify(flashes.slice(preFull.flashes)));
  assert.equal(saves, preFull.saves,
    'RED: отказ — БЕЗ saveNow (мутировано ничего)');
  assert.equal(cs.get('100,-40').built
    .find((e) => e.buildingId === 55).storage.length, 40,
    'RED: отказ — хранилище не мутировано');
  assert.equal(IT.totalQty(t.hero, 'fruit_quince'), 1,
    'RED: отказ — инвентарь не мутирован');
  assert.notEqual(lastOverlay(t), ovFull, 'RED: reopen после отказа');
});

// ============================================================
// R9. Double boot: save → restore → «Вынуть» (merge id+bonusState),
//     all-or-nothing
// ============================================================

test('000221-R9. double boot: save (serializeCityStates) → restore (restoreCityStates) → storage жив в built-записи; «Вынуть» возвращает (merge (id,bonusState) в инвентаре: бонус-стак 5+3=8 одной стопкой, обычный — изолирован); all-or-nothing: полный инвентарь → отказ-flash, storage НЕ тронут, saveNow не стреляет', () => {
  // --- Boot A: построить 55, сложить 3 записи ---
  const t = initStorageFixture({ x: 1, y: 1 });
  wireCityAnchor(t, 100, -40);
  const cs = new Map([['100,-40', { lastVisitDay: 5, stock: {} }]]);
  t.deps.cityStates = cs;
  t.hero.gold = 1000;
  for (const [rid, qty] of Object.entries(REAGENT_SEED))
    assert.ok(IT.addItem(t.hero, rid, qty).ok, 'сид 000202: ' + rid);
  t.BA.interactCity();
  const menu = lastOverlay(t);
  const row55 = menu.actions.find((a) => a.id === 'build-55');
  assert.ok(row55, 'RED: строка build-55');
  menu.onAction({ id: 'build-55' });
  t.o.buildingUI.close();
  t.BA.interactCity();
  const p = lastOverlay(t);
  assert.ok(p.actions.some((a) => a.id === 'storage'),
    'RED: строка «Хранилище» на построенном 55');
  p.onAction({ id: 'storage' });
  // (1) Сера ×10 (первая запись инвентаря):
  let ov = lastOverlay(t);
  ov.onAction({ id: 'put-0' });
  // (2) Зелье маны ×3 (улучш., potion — stackable + bonus {amount}
  // валиден items.js validBonus; reagent/weapon НЕ подходят:
  // reagent бонус не несёт, weapon не stackable) — сеится за
  // открытым оверлеем:
  assert.ok(IT.addItem(t.hero, 'mana_potion', 3, { amount: 2 }).ok,
    'сид bonus mana_potion ×3');
  assert.ok(IT.addItem(t.hero, 'mana_potion', 2).ok,
    'сид plain mana_potion ×2 (R-REMOVEITEM: ДВЕ записи одного id — '
    + 'разные bonusState)');
  t.o.buildingUI.close();
  t.BA.interactCity();
  ov = lastOverlay(t);
  const putBonus = ov.actions.find((a) =>
    a.имя === 'Сложить: Зелье маны ×3 (улучш.)');
  assert.ok(putBonus,
    'RED: put-строка «Сложить: Зелье маны ×3 (улучш.)» '
    + '(bonus-суффикс): '
    + JSON.stringify(ov.actions.map((a) => a.имя)));
  ov.onAction({ id: putBonus.id });
  const plainMP = t.hero.inventory.slots
    .filter((e) => e.id === 'mana_potion' && !e.bonus);
  assert.equal(plainMP.length, 1,
    'R-REMOVEITEM: no-bonus-стопка ЦЕЛА (splice по идентичности, а не '
    + 'removeItem по id): '
    + JSON.stringify(t.hero.inventory.slots));
  assert.equal(plainMP[0].qty, 2,
    'R-REMOVEITEM: no-bonus ×2 — не тронута');
  // (3) Бревно ×1 (обычный остаток после постройки):
  t.o.buildingUI.close();
  t.BA.interactCity();
  ov = lastOverlay(t);
  const putPlain = ov.actions.find((a) => a.имя === 'Сложить: Бревно ×1');
  assert.ok(putPlain,
    'RED: put-строка «Сложить: Бревно ×1» (без суффикса)');
  ov.onAction({ id: putPlain.id });
  const recA = cs.get('100,-40').built.find((e) => e.buildingId === 55);
  assert.deepEqual(recA.storage, [
    { id: 'sulfur', qty: 10 },
    { id: 'mana_potion', qty: 3, bonus: { amount: 2 } },
    { id: 'wood_log', qty: 1 },
  ], 'RED: 3 записи сложены (порядок = порядок put)');

  // --- SAVE (окно stock истекло: 10 − 5 ≥ 3 — stock отброшен,
  //     built/storage персистентны) ---
  const ser = C.serializeCityStates(cs, 10, 3);
  assert.ok(ser['100,-40'], 'запись города переживает roundtrip');
  assert.ok(ser['100,-40'].built
    .some((e) => e.buildingId === 55 && Array.isArray(e.storage)
      && e.storage.length === 3),
    'RED: storage жив в СЕЙВЕ (built-запись): '
    + JSON.stringify(ser['100,-40'].built));

  // --- Boot B: restore + новый deps-бандл (новый hero) ---
  const cs2 = C.restoreCityStates(ser, 10, 3);
  const t2 = initStorageFixture({
    x: 1, y: 1,
    cityContents: [{ x: 1, y: 1, buildingId: 55, player: true }],
  });
  wireCityAnchor(t2, 100, -40);
  t2.deps.cityStates = cs2;
  const flashes2 = [];
  t2.deps.flash = (m) => { flashes2.push(m); };
  let saves2 = 0;
  t2.deps.saveNow = () => { saves2 += 1; };

  // (a) ALL-OR-NOTHING: полный инвентарь (20 слотов) → «Вынуть»
  // disabled (dry-run); прямой onAction (обход) → storageTake ok →
  // canAddItem отказ → flash(reason), storage НЕ тронут, no saveNow.
  for (const rid of BATCH_B)
    assert.ok(IT.addItem(t2.hero, rid, 1).ok, 'сид батч B: ' + rid);
  t2.BA.interactCity();
  assert.equal(t2.o.calls.buildingOpen.length, 1,
    'RED: [E] — меню построенного 55 (boot B)');
  const pb = lastOverlay(t2);
  const takeRow = pb.actions.find((a) => a.id === 'take-0');
  assert.ok(takeRow, 'RED: строка take-0 после restore (storage жив)');
  assert.equal(takeRow.доступен, false,
    'RED: полный инвентарь — «Вынуть» disabled (dry-run canAddItem)');
  assert.equal(takeRow.reason, 'нет свободных слотов инвентаря',
    'RED: reason dry-run: ' + takeRow.reason);
  const pre = { saves: saves2, flashes: flashes2.length };
  pb.onAction({ id: 'take-0' });
  assert.ok(flashes2.includes('нет свободных слотов инвентаря'),
    'RED: all-or-nothing — отказ-flash (reason dry-run): '
    + JSON.stringify(flashes2.slice(pre.flashes)));
  assert.equal(saves2, pre.saves,
    'RED: all-or-nothing — БЕЗ saveNow');
  const recB = cs2.get('100,-40').built.find((e) => e.buildingId === 55);
  assert.equal(recB.storage.length, 3,
    'RED: all-or-nothing — storage НЕ тронут');
  assert.equal(t2.hero.inventory.slots.length, 20,
    'RED: all-or-nothing — инвентарь не мутирован');

  // (b) «Вынуть»: merge (id, bonusState) в инвентаре.
  for (const rid of BATCH_B)
    assert.ok(IT.removeItem(t2.hero, rid, 1).ok, 'очистка: ' + rid);
  assert.ok(IT.addItem(t2.hero, 'mana_potion', 5, { amount: 2 }).ok,
    'сид hero Зелье маны ×5 (улучш.) — для merge');
  t2.o.buildingUI.close();
  t2.BA.interactCity();
  let ovb = lastOverlay(t2);
  const takeSulfur = ovb.actions.find((a) => a.имя === 'Вынуть: Сера ×10');
  assert.ok(takeSulfur,
    'RED: строка «Вынуть: Сера ×10» (storage после restore): '
    + JSON.stringify(ovb.actions.map((a) => a.имя)));
  ovb.onAction({ id: takeSulfur.id });
  assert.equal(IT.totalQty(t2.hero, 'sulfur'), 10,
    'RED: «Вынуть» возвращает (addItem hero)');
  assert.equal(saves2, pre.saves + 1, 'RED: saveNow (успех)');
  assert.ok(flashes2.includes('Вынуто: Сера ×10'),
    'RED: flash «Вынуто: <имя> ×<qty>»: '
    + JSON.stringify(flashes2.slice(pre.flashes)));
  // merge: bonus-стак 5 + 3 = 8 — ОДНА стопка (тот же bonusState):
  t2.o.buildingUI.close();
  t2.BA.interactCity();
  ovb = lastOverlay(t2);
  const takeBonus = ovb.actions.find((a) =>
    a.имя === 'Вынуть: Зелье маны ×3 (улучш.)');
  assert.ok(takeBonus,
    'RED: строка «Вынуть: Зелье маны ×3 (улучш.)»');
  ovb.onAction({ id: takeBonus.id });
  const bonusSlots = t2.hero.inventory.slots
    .filter((e) => e.id === 'mana_potion' && e.bonus
      && e.bonus.amount === 2);
  assert.equal(bonusSlots.length, 1,
    'RED: merge (id, bonusState) — ОДНА бонус-стопка: '
    + JSON.stringify(t2.hero.inventory.slots));
  assert.equal(bonusSlots[0].qty, 8,
    'RED: merge 5 + 3 = 8 (items.js merge по bonusState)');
  assert.equal(saves2, pre.saves + 2, 'RED: saveNow (успех)');
  // изоляция: обычный Бревно — ОТСЕЛЬНАЯ стопка (bonusState ≠):
  t2.o.buildingUI.close();
  t2.BA.interactCity();
  ovb = lastOverlay(t2);
  const takePlain = ovb.actions.find((a) => a.имя === 'Вынуть: Бревно ×1');
  assert.ok(takePlain,
    'RED: строка «Вынуть: Бревно ×1» (обычный — без суффикса)');
  ovb.onAction({ id: takePlain.id });
  const plainSlots = t2.hero.inventory.slots
    .filter((e) => e.id === 'wood_log' && !e.bonus);
  assert.equal(plainSlots.length, 1,
    'RED: (id, bonusState) — изоляция: обычный Бревно отдельной стопкой');
  assert.equal(plainSlots[0].qty, 1, 'обычный Бревно ×1');
  assert.equal(saves2, pre.saves + 3, 'RED: saveNow (успех)');
  assert.deepEqual(recB.storage, [],
    'RED: storage пуст после всех «Вынуть» (entry.storage — live)');
});

// ============================================================
// R10. Разборка непустого 55 — отказ (гард D10)
// ============================================================

test('000221-R10. demolish непустого 55 → отказ: flash «Хранилище не пусто — сначала выньте предметы», built/record/per-cell/storage НЕ изменены, gold не тронут, saveNow 0; пустое 55 → успех (gold +30, built очищен, per-cell удалён, saveNow 1)', () => {
  // (a) НЕПУСТОЕ — отказ (гард D10 в special 'demolish'):
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
  let saves = 0;
  t.deps.saveNow = () => { saves += 1; };
  t.BA.interactCity();
  assert.equal(t.o.calls.buildingOpen.length, 1,
    'RED: [E] — меню построенного 55');
  const p = t.o.calls.buildingOpen[0];
  const dem = p.actions.find((a) => a.id === 'demolish');
  assert.ok(dem, 'RED: строка «Разобрать»');
  p.onAction({ id: 'demolish' });
  assert.ok(flashes.includes(
    'Хранилище не пусто — сначала выньте предметы'),
    'RED: отказ-flash (гард D10): ' + JSON.stringify(flashes));
  assert.equal(saves, 0,
    'RED: отказ — БЕЗ saveNow (семантика specials §2.6)');
  assert.equal(t.hero.gold, 100,
    'RED: отказ — золото не тронуто (createCharacter 100)');
  assert.deepEqual(cs.get('100,-40').built,
    [{ x: 1, y: 1, buildingId: 55, player: true,
      storage: [{ id: 'sulfur', qty: 5 }] }],
    'RED: отказ — built-запись НЕ изменена (storage жива)');
  assert.ok(t.ds.cityContents.buildings.some(
    (b) => b.buildingId === 55 && b.player === true),
    'RED: отказ — per-cell запись на месте');
  // (b) ПУСТОЕ — успех (контроль: гард не блокирует пустое):
  const t2 = initStorageFixture({
    x: 1, y: 1,
    cityContents: [{ x: 1, y: 1, buildingId: 55, player: true }],
  });
  wireCityAnchor(t2, 100, -40);
  const cs2 = new Map([['100,-40', { lastVisitDay: 5, stock: {},
    built: [{ x: 1, y: 1, buildingId: 55, player: true,
      storage: [] }] }]]);
  t2.deps.cityStates = cs2;
  const flashes2 = [];
  t2.deps.flash = (m) => { flashes2.push(m); };
  let saves2 = 0;
  t2.deps.saveNow = () => { saves2 += 1; };
  t2.BA.interactCity();
  const p2 = t2.o.calls.buildingOpen[0];
  p2.onAction({ id: 'demolish' });
  assert.equal(t2.hero.gold, 130,
    'RED: золото +30 (floor 30% от 100)');
  assert.deepEqual(cs2.get('100,-40').built, [],
    'RED: built очищен');
  assert.ok(!t2.ds.cityContents.buildings.some(
    (b) => b.buildingId === 55),
    'RED: per-cell запись удалена');
  assert.ok(flashes2.includes('Разобрано: Хранилище (+30 з.)'),
    'RED: flash (старая форма — предметный возврат пуст): '
    + JSON.stringify(flashes2));
  assert.equal(saves2, 1, 'RED: saveNow — 1 (успех)');
});

// ============================================================
// R11. index.html: тег + порядок IO4
// ============================================================

test('000221-R11. index.html: <script src="src/building-effect-storage.js"> + порядок IO4 (ПОСЛЕ building-actions.js и building-effect-fullrest.js — registerSpecial доступен; ДО hud.js)', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const scripts = Array.from(
    html.matchAll(/<script\s+src="([^"]+)"/g), (m) => m[1]);
  const pos = (f) => scripts.indexOf(f);
  assert.notEqual(pos('src/building-effect-storage.js'), -1,
    'RED: тег src/building-effect-storage.js в index.html отсутствует');
  assert.ok(pos('src/building-actions.js')
    < pos('src/building-effect-storage.js'),
    'RED: IO4a — ПОСЛЕ building-actions.js (registerSpecial)');
  assert.ok(pos('src/building-effect-fullrest.js')
    < pos('src/building-effect-storage.js'),
    'RED: IO4b — ПОСЛЕ building-effect-fullrest.js (паттерн UMD)');
  assert.ok(pos('src/building-effect-storage.js') < pos('src/hud.js'),
    'RED: IO4c — ДО hud.js (саморегистрация до инициализации Game)');
});

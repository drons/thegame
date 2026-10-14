// Задача 000107: взаимодействие в городе через buildingUI (родитель 000052).
//
// [E] внутри города — ЕДИНЫЙ путь: клетка с внутренней постройкой (000106)
// → Game.buildingUI (000071) → «Диалог» → Game.npcUI (торговля/школа/
// квесты/найм); для постройки ИГРОКА (000148.03) меню строки эффектов
// расширяется строкой «Разобрать (возврат N з.)» — special 'demolish'.
// Обход buildingUI ЗАПРЕЩЁН (даже при деградации —
// console.error + no-op); клетка БЕЗ постройки → [E] → меню
// «Строительство» (buildingUI, 21 строка набора D3, 000148.03);
// HUD hint города получает строку «[E] — постройки.»; найм
// (000078/000083) — НЕ зависимый, код найма не трогаем. Контракты:
// memory/000107-city-interact.md, memory/000148.03-city-building-
// core.md.
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
// без постройки → [E] → меню «Строительство», 21 строка; повторный [E]
// — закрыть; репин 000148.03), CI-V5 (KeyE в настоящем подземелье →
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
//     day: clock.day}. Сравнение ПОЛЕ-В-ПОЛЕ (payload расширяет
//     000083: roster/deadMercs — пин тестов 000083).
//   * CI-U2 — клетка без постройки → [E] → buildingUI-меню
//     «Строительство» (21 строка, набор D3; npcUI не открывается) —
//     репин 000148.03 (ранее: «ничего»).
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
//   * CI-U10 — деградация: Game.buildingUI отсутствует → no-op +
//     console.error «обход запрещён», прямого npcUI.open НЕТ (ТЗ §2 —
//     намеренная асимметрия с деградацией toggle()).
//   * CI-V1 — [E] на клетке с постройкой в ГОРОДЕ (full-chain) →
//     buildingUI активен (NPC/запись из каталога, строка «Диалог»);
//     npcUI напрямую НЕ открывается; dungeonUI остаётся активен.
//   * CI-V2 — «Диалог» (Digit1) из buildingUI → npcUI: у Бренна (1)
//     вкладка «торговля» — строки «имя (ост. N)» со стоком
//     makeCityShop(якорь, клетка, wealth); у Берты (44) — «Этот NPC не
//     торгует.»; вкладка «найм» (000083) не падает.
//   * CI-V3 — hint города содержит «[E] — постройки.» (3 строки;
//     строка 2 — единый тайл-дверь, 000177); hint подземелья —
//     «Вход в пещеру — вход и выход…» + «Сундук и мобы…».
//   * CI-V4 — [ПИН] 000177: спавн — на двери ([E] там = выход); [E] на
//     ДРУГОЙ клетке без постройки → меню «Строительство» (21 строка,
//     000148.03), повторный [E] — закрыть оверлей; без ошибок.
//   * CI-V5 — [ЗЕЛЁНЫЙ ПИН] KeyE в настоящем подземелье ВНЕ единого
//     тайла → no-op (000121/000177: спавн на тайле — шаг С тайла,
//     затем [E] ничего).
//   * CI-V6 — повторный [E] закрывает buildingUI; [E] при открытом
//     npcUI закрывает npcUI (стек-семантика).
//   * CI-V7 — с открытым buildingUI/npcUI движение (стрелки/WASD) НЕ
//     двигает героя (гейт cityOnMove — паритет с миром).
//   * CI-V8 — содержимое на входе: __game.dungeon.buildings deepEqual
//     generateCityContents(layout(якорь), …) (recompute); на
//     entrance/exit постройки НЕТ; все buildingId ∈ {1, 5, 7, 10, 25, 44}
//     (000134: Лавка странника — легитимный городской тип).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
// 000134: CI-134B — ключ мок-хранилища для ДВОЙНОГО boot (сейв →
// лоад); SAVE_KEY — единственный экспорт src/save.js, который нужен.
const { SAVE_KEY } = require('../src/save.js');
// 000148.03 (CI-U12+): реальный каталог построек (названия/размеры/
// .стройка для меню «Строительство») — чистый в node (тесты
// buildings.test.js), циклического require cities.js нет.
const B = require('../src/buildings.js');
// 000148.04 (CI-U18+): РЕАЛЬНЫЕ flat-items (items.js — чистый в node)
// + createCharacter (player.js → sheet.js; gold 100 = стартовый,
// sheet.js:120) — фикстура initCityBuild (контракт R15): addItem →
// checkAdd → P.derived(c) — на «голом» объекте {id, name, gold}
// ПАДАЕТ (sheet.secondary), bare-герой makeDeps не трогаем (CI-U1..U11
// не ходят в предметы).
const IT = require('../src/items.js');
const PLR = require('../src/player.js');

const ROOT = path.join(__dirname, '..');

// ============================================================
// Секция 1: юнит — interactCity (fake deps, паттерн building-actions)
// ============================================================

// Городские записи каталога (срез нужных полей; map_index — из
// 000001/000044: оружейная 0, таверна 11; лавка странника 5 —
// map_index НЕТ: spec/buildings.md «Магазины», 000134 — канал только NPC-торговля).
const CITY_RECS = {
  1: { id: 1, название: 'Оружейная', категория: 'здание',
    особые_параметры: { map_index: 0, виды: ['weapon'] } },
  5: { id: 5, название: 'Лавка странника', категория: 'здание',
    особые_параметры: { виды: [] } }, // map_index нет (spec/buildings.md «Магазины»)
  7: { id: 7, название: 'Арена', категория: 'здание',
    особые_параметры: { map_index: 2, виды: ['training'] } },
  44: { id: 44, название: 'Таверна', категория: 'здание',
    особые_параметры: { map_index: 11, виды: ['food', 'potion'] } },
};
// NPC постройок (постройки — массив id, как в каталоге assets/npc).
// 000134: у Бренна + Лавка (5) — фейковый торговец для пина
// shopFor-fallback (D2); реальный NPC Лавки — Хольд (000011.json).
const NPC_WREN = { id: 'npc_wren', имя: 'Бренн', постройки: [1, 5],
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
    // Зеркало main.js npcShopFor (000029): {npc, stock} — npc
    // резолвится из deps.npcs (реальный — G.npcById); stock — фейк.
    npcShopFor: (id) => {
      npcShopForCalls.push(id);
      const npc = (deps.npcs || []).find((n) => n.id === id) || null;
      return { npc, stock: { world_item: 1 } };
    },
    // city-ветка контракта shopFor (main.js): {npc, stock} | null.
    // Мир — fallback npcShopFor (в городе не должен вызываться).
    shopFor: (npc, t) => {
      const d = deps.cityState();
      if (d && d.kind === 'city' && d.cityShops && t) {
        const s = d.cityShops[t.x + ',' + t.y];
        // 000134 (зеркало D2): клетка города С cityShops-записью →
        // городской сток; БЕЗ записи (Лавка 5 — нет map_index,
        // spec/buildings.md «Магазины») → NPC-канал npcStocks как в мире.
        if (!s) return npc ? deps.npcShopFor(npc.id) : null;
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
  if (over.noBuildingUI) delete deps.game.buildingUI;
  return { deps, o, ds, npcShopForCalls, hero, book, saveNow };
}

function initCity(over) {
  const env = makeDeps(over);
  const BA = require('../src/building-actions.js');
  BA.init(env.deps); // re-init — присвоение бандла (паттерн BA-тестов)
  return Object.assign({ BA }, env);
}

// 000148.03 (CI-U12..U15): fake для МЕНЮ СТРОИТЕЛЬСТВА и действий
// build/demolish — поверх makeDeps: РЕАЛЬНЫЙ layout (createCityLayout —
// canBuildAt — чистая функция cities.js, dg.cells === null дефолта
// makeCityDs была бы throw), реальный каталог (названия строк) и
// Game.Cities (реальный cities.js — buildableBuildingIds/buildCost/
// canBuildAt), teleportCharge — зеркало building-effects.js:2486-2491
// (чистый: {ok, gold, message}; отказ — «недостаточно золота» — НЕ
// используется buildCityAt, отказ строит «мало золота (нужно N)»).
// over.fp: 1 — хутор (−119,−104, 2×2), 2 — деревня (−114,−119, 6×6),
// 5 — город (100,−40, 18×18); default — 5.
function initCityBuild(over) {
  const env = makeDeps(Object.assign({}, over, {
    cityContents: over.cityContents === undefined ? [] : over.cityContents,
    cityShops: over.cityShops === undefined ? {} : over.cityShops,
  }));
  const C = require('../src/cities.js');
  const fp = over.fp === undefined ? 5 : over.fp;
  const anchor = fp === 1 ? [-119, -104] : fp === 2 ? [-114, -119]
    : [100, -40];
  env.ds.dg = C.createCityLayout(anchor[0], anchor[1], fp);
  // 000148.04 (контракт R15): hero = createCharacter (gold 100 =
  // старый bare-дефолт — пины .03 держатся; addItem на bare-объекте
  // падает в P.derived — createCharacter обязателен) + РЕАЛЬНЫЕ
  // flat-items функции items.js на deps.game (в production — на Game;
  // пин tests/craft-ui.test.js:534). makeDeps НЕ трогаем.
  env.hero = PLR.createCharacter();
  env.deps.hero = env.hero;
  env.deps.game.getItem = IT.getItem;
  env.deps.game.hasItem = IT.hasItem;
  env.deps.game.removeItem = IT.removeItem;
  env.deps.game.addItem = IT.addItem;
  env.deps.game.totalQty = IT.totalQty;
  env.deps.game.getBuilding = (id) => B.getBuilding(id);
  env.deps.game.Cities = C;
  env.deps.game.buildingEffects.teleportCharge = (hero, active, cost) => {
    const gold = hero && Number.isFinite(hero.gold) ? hero.gold : 0;
    const c = Number.isFinite(cost) ? cost : 0;
    if (active) return { ok: true, gold }; // повтор — бесплатно
    if (gold >= c) return { ok: true, gold: gold - c };
    return { ok: false, message: 'недостаточно золота', gold };
  };
  const BA = require('../src/building-actions.js');
  BA.init(env.deps); // re-init — присвоение бандла (паттерн BA-тестов)
  return Object.assign({ BA }, env);
}

// 000148.03: якорь города в fake (worldKey + buildingAnchor) — чтобы
// interactCity резолвил cityAnchor ('ax,ay') для cityStates-ключей
// (дефолтный fake ds без worldKey — тихий null, :647-671).
function wireCityAnchor(env, ax, ay) {
  env.ds.worldKey = ax + ',' + ay;
  env.deps.getMap = () => (
    ({ tileAt: () => ({ buildingAnchor: [ax, ay] }) }));
  return env;
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
  // ПОЛЕ-В-ПОЛЕ (не deepEqual всего payload): контракт 000107 — 7
  // полей ТЗ (npc, character, book, tile, shop, onChange, day). На
  // master 000083 расширяет тот же payload ключами roster/deadMercs
  // (их пин — тесты 000083, не 000107): full-deepEqual ломал бы
  // ребейз/мерж. Поле-в-поле — зелёно и на базе ветки, и после
  // ребейза на master.
  const n = o.calls.npcOpen[0];
  assert.equal(n.npc, NPC_WREN, 'npc — NPC постройки (Бренн)');
  assert.equal(n.character, hero, 'character — герой');
  assert.equal(n.book, book, 'book — questBook');
  assert.deepEqual(n.tile,
    { x: 2, y: 3, building: 0, buildingWealth: 1 },
    'tile — КЛЕТКА ГОРОДА (2,3), не deps.player (D4)');
  assert.deepEqual(n.shop, { npc: NPC_WREN, stock: STOCK_W },
    'shop — городской сток (cityShops по (город, клетка), 000108)');
  assert.equal(n.onChange, saveNow, 'onChange — saveNow');
  assert.equal(n.day, 5, 'day — clock.day');
  assert.equal(npcShopForCalls.length, 0,
    'city-ветка shopFor — мирный npcShopFor НЕ вызывается');
});

// 000148.03 (репин): клетка без постройки — больше НЕ no-op: [E] →
// buildingUI-меню «Строительство» (21 строка buildable-типа, набор
// D3). Фейк — initCityBuild (реальный layout + реальный каталог +
// Game.Cities — pre-check canBuildAt; дефолт makeCityDs dg.cells ===
// null была бы throw).
test('CI-U2. клетка без постройки → [E] → меню «Строительство» (21 строка); npcUI — нет (000148.03)', () => {
  const t = initCityBuild({
    cityContents: [{ x: 9, y: 9, buildingId: 48 }], cityShops: {},
  });
  t.BA.interactCity();
  assert.equal(t.o.calls.buildingOpen.length, 1,
    'buildingUI — меню «Строительство»');
  assert.equal(t.o.calls.buildingOpen[0].title, 'Строительство',
    'заголовок «Строительство»');
  assert.equal(t.o.calls.buildingOpen[0].actions.length, 22,
    'ровно 22 строки (21 набор D3 + «Переименовать город», 000148.05)');
  assert.equal(t.o.calls.npcOpen.length, 0, 'npcUI — нет');
  assert.equal(t.o.calls.buildingClose + t.o.calls.npcClose, 0,
    'ничего не закрыто');
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

test('CI-U10. деградация: Game.buildingUI отсутствует → no-op + console.error «обход запрещён», не падает (ТЗ §2)', () => {
  const { BA, o } = initCity({ noBuildingUI: true });
  const errs = [];
  const orig = console.error;
  console.error = (...a) => { errs.push(a.join(' ')); };
  try {
    BA.interactCity();
  } finally {
    console.error = orig;
  }
  assert.equal(o.calls.buildingOpen.length, 0, 'buildingUI.open — не вызван');
  assert.equal(o.calls.npcOpen.length, 0,
    'npcUI.open — не вызван (прямой обход НЕ строится — асимметрия с toggle())');
  assert.ok(errs.some((m) => m.includes('обход запрещён')),
    'console.error «обход запрещён»: ' + JSON.stringify(errs));
});

test('CI-U11. 000134: клетка города БЕЗ cityShops-записи (Лавка id 5 — нет map_index, spec/buildings.md «Магазины») → shopFor — fallback npcShopFor (живой NPC-сток), не null (D2, юнит-пин; e2e — CI-134A)', () => {
  // ds = {kind: 'city', cityShops: {}} — записи городской стока НЕТ
  // (makeCityShop → null у Лавки — guard !map_index, cities.js:453);
  // NPC постройки 5 — Бренн (фейковый торговец; реальный — Хольд,
  // 000011.json). Без fallback (D2) shop = null → одноразовая
  // копия стока в ui.js — покупки не сериализуются.
  const { BA, o, npcShopForCalls } = initCity({
    cityContents: [{ x: 2, y: 3, buildingId: 5 }],
    cityShops: {},
  });
  BA.interactCity();
  assert.equal(o.calls.buildingOpen.length, 1, 'buildingUI (Лавка)');
  const p = o.calls.buildingOpen[0];
  assert.equal(p.title, 'лавка странника', 'title — из каталога');
  assert.equal(p.actions.length, 1, 'одна строка — «Диалог» (NPC есть)');
  p.onAction({ id: 'dialog' });
  assert.equal(o.calls.npcOpen.length, 1, '«Диалог» → npcUI.open');
  assert.deepEqual(npcShopForCalls, ['npc_wren'],
    'RED: fallback — мирный npcShopFor ВЫЗВАН (ключ — npcId)');
  const n = o.calls.npcOpen[0];
  assert.deepEqual(n.shop, { npc: NPC_WREN, stock: { world_item: 1 } },
    'RED: shop — NPC-канал (живой сток npcStocks), НЕ null/одноразовый');
  assert.equal(n.tile.building, null,
    'tile.building — null (map_index нет — spec/buildings.md «Магазины»)');
});

// ============================================================
// 000148.03: строительство в городе — ядро (красные, CI-U12..U15)
// ============================================================
// ТЗ: tasks/pending/000148.03.md; контракт: memory/000148.03-city-
// building-core.md. Красные причины (осмысленные, не синтаксис):
//  * CI-U12 — building-actions.js:616 `if (!cell) return;` (клетка
//    без постройки — НИЧЕГО): buildingUI.open НЕ вызывается;
//  * CI-U13 — «Разобрать»-действий нет нигде (grep «разобрать» src/
//    = 0); interactCity не знает о built;
//  * CI-U14 — build-пути (buildCityAt) нет;
//  * CI-U15 — pre-check строк (доступен/reason) нет.
// Меню — ТОЛЬКО через buildingUI (000107): гард «обход запрещён»
// (CI-U10) сохраняется и дублируется в пустой ветке (не репинится).

// Набор D3 (ровно 21) — id-строки меню (id 'build-<id>', порядок
// BUILDINGS = id-порядок).
const D3_IDS_03 = [1, 2, 3, 4, 7, 8, 10, 11, 25, 36, 37, 38, 39, 40,
  42, 43, 44, 45, 46, 48, 49];

// 000202 (репин CI-U12 + сиды CI-B): ВСЕ 10 реагентов в количестве
// максимума, требуемого ценами (000148.04): сера 10 (id 36), кожа 8
// (id 7), бревно 3 (id 25), лунный камень 3 (id 42), каменный обломок
// 3 (id 46), остальные ≤2. Сумма 20.4 кг ≤ 30 кг (лимит веса
// items.js — ×10 на каждый не влезает), 10 стаков ≤ 20 слотов.
const REAGENT_SEED_202 = {
  sulfur: 10, hide: 8, wood_log: 3, moonstone: 3, stone_chunk: 3,
  herb_healing: 2, iron_ore: 2, coal: 2, herb_mana: 2, herb_bitter: 2,
};

test('CI-U12. 000148.03: [E] на пустой клетке города → buildingUI «Строительство»: ровно 21 строка «Построить: <название> — N з. (…исходники…)» (набор D3, цены каталога, id build-<id>); npcUI напрямую НЕ открывается', () => {
  // Город 18×18 (fp5): интерьер 256, потолок 128 — при пустом
  // occupied ВСЕ 21 строка доступны (в т.ч. 3×3 на (1,1)).
  // 000202 (осознанный репин): pre-check = геометрия + золото +
  // предметы (R1) — сиды В ТЕСТЕ (фикстура общая с .03-пинами):
  // золото 1000 (макс. цена — 500, id 36) + все 10 реагентов в
  // макс. количестве.
  const t = initCityBuild({ x: 1, y: 1 });
  t.hero.gold = 1000;
  for (const [rid, qty] of Object.entries(REAGENT_SEED_202)) {
    assert.ok(IT.addItem(t.hero, rid, qty).ok,
      'сид 000202: ' + rid + ' ×' + qty);
  }
  t.BA.interactCity();
  assert.equal(t.o.calls.buildingOpen.length, 1,
    'RED: buildingUI.open — ровно 1 (сейчас no-op, :616)');
  const p = t.o.calls.buildingOpen[0];
  assert.equal(p.title, 'Строительство', 'RED: заголовок меню «Строительство»');
  assert.equal(p.actions.length, 22,
    'ровно 22 строки (21 набор D3 + «Переименовать город», 000148.05),'
    + ' получено ' + p.actions.length);
  assert.deepEqual(p.actions.map((a) => a.id),
    D3_IDS_03.map((id) => 'build-' + id).concat(['rename-city']),
    'строки — id build-<id> (порядок каталога, id-порядок) + «rename'
    + '-city» КОНЦА (000148.05)');
  // 000148.04 (осознанный репин): строка = «Построить: <название> —
  // <N> з. (<имя> ×<Q>[, <имя> ×<Q>])» — скобки группируют ЦЕНУ
  // (золото + материалы, контракт R4); «×» — U+00D7.
  const row48 = p.actions.find((a) => a.id === 'build-48');
  assert.equal(row48.имя,
    'Построить: Развалины — 30 з. (Каменный обломок ×1)',
    'RED: формат строки с исходниками (каталог + цена + предмет)');
  const row1 = p.actions.find((a) => a.id === 'build-1');
  assert.equal(row1.имя, 'Построить: Оружейная — 50 з. (Бревно ×2)',
    'строка id 1 (50 з. + Бревно ×2)');
  const row7 = p.actions.find((a) => a.id === 'build-7');
  assert.equal(row7.имя, 'Построить: Арена — 400 з. (Кожа ×8)',
    '3×3 — 400 з. (существенно дороже 1×1) + Кожа ×8');
  for (const a of p.actions) {
    assert.equal(a.доступен, true,
      'пустая клетка, пустой occupied — строка ' + a.id + ' доступна');
    assert.equal(a.reason, undefined, 'доступная строка — без reason');
  }
  assert.equal(t.o.calls.npcOpen.length, 0,
    'npcUI напрямую НЕ открывается (ТОЛЬКО через buildingUI, 000107)');
  assert.equal(t.o.calls.buildingClose + t.o.calls.npcClose, 0,
    'ничего не закрыто');
});

test('CI-U13. 000148.03: [E] на постройке ИГРОКА (per-cell player:true) → строка «Разобрать (возврат 9 з.)» → onAction: built очищен, золото +9, saveNow, flash, per-cell удалён; базовая постройка — строки НЕТ', () => {
  // (a) Постройка игрока: клетка ∈ built (per-cell запись player:true).
  const t = initCityBuild({
    x: 1, y: 1,
    cityContents: [{ x: 1, y: 1, buildingId: 48, player: true }],
    npcs: [],
  });
  wireCityAnchor(t, 100, -40);
  const cs = new Map([['100,-40', { lastVisitDay: 5, stock: {},
    built: [{ x: 1, y: 1, buildingId: 48, player: true }] }]]);
  t.deps.cityStates = cs;
  const flashes = [];
  t.deps.flash = (m) => flashes.push(m);
  let saves = 0;
  t.deps.saveNow = () => { saves += 1; };
  t.BA.interactCity();
  assert.equal(t.o.calls.buildingOpen.length, 1,
    'RED: buildingUI — меню постройки игрока (с строкой «Разобрать»)');
  const p = t.o.calls.buildingOpen[0];
  const dem = p.actions.find((a) => a.id === 'demolish');
  assert.ok(dem, 'RED: строка «Разобрать» (id «demolish») в действиях');
  assert.equal(dem.имя, 'Разобрать (возврат 9 з.)',
    'RED: текст строки — возврат 30% floor (id 48: 30 → 9)');
  assert.equal(dem.доступен, true, '«Разобрать» доступна (повторная разборка невозможна конструктивно)');
  p.onAction({ id: 'demolish' });
  const rec = cs.get('100,-40');
  assert.deepEqual(rec.built, [],
    'RED: built — запись удалена (record заменён копией)');
  assert.equal(t.hero.gold, 109, 'RED: золото +9 (100 → 109)');
  assert.ok(!t.ds.cityContents.buildings
    .some((b) => b.x === 1 && b.y === 1),
    'per-cell запись удалена из cityContents.buildings');
  assert.ok(flashes.includes('Разобрано: Развалины (+9 з.)'),
    'RED: flash «Разобрано: <имя> (+N з.)»: ' + JSON.stringify(flashes));
  assert.equal(saves, 1, 'saveNow — 1 (успех)');
  // (b) Базовая постройка (∉ built): затрачено = 0 — строки НЕТ.
  const t2 = initCityBuild({
    x: 1, y: 1,
    cityContents: [{ x: 1, y: 1, buildingId: 44 }], // без player
    npcs: [NPC_BERTA],
  });
  t2.BA.interactCity();
  assert.equal(t2.o.calls.buildingOpen.length, 1,
    'базовая с NPC — меню (текущее поведение, CI-U1)');
  assert.ok(!t2.o.calls.buildingOpen[0].actions
    .some((a) => a.id === 'demolish'),
    'RED: базовая постройка — БЕЗ строки «Разобрать»');
});

test('CI-U14. 000148.03: build из меню — списание 100 → 70 (id 48: 30 з.) + списание исходников (000148.04) + built + per-cell + saveNow + flash «Построено: … (−30 з., −Каменный обломок ×1)»; отказ при 20 з.: «мало золота (нужно 30)» — без saveNow/built/списания', () => {
  // (a) Успех. 000148.04 (осознанный репин): hero — createCharacter,
  // сеидится stone_chunk ×1 (id 48: исходник stone_chunk ×1) — иначе
  // отказ по нехватке, а не успех; список — ровно на количество.
  const t = initCityBuild({ x: 1, y: 1 });
  wireCityAnchor(t, 100, -40);
  const cs = new Map([['100,-40', { lastVisitDay: 5, stock: {} }]]);
  t.deps.cityStates = cs;
  t.hero.gold = 100;
  const rseed = IT.addItem(t.hero, 'stone_chunk', 1);
  assert.ok(rseed.ok, 'сид: stone_chunk ×1 (исходник id 48)');
  const flashes = [];
  t.deps.flash = (m) => flashes.push(m);
  let saves = 0, renders = 0;
  t.deps.saveNow = () => { saves += 1; };
  t.deps.playerRender = () => { renders += 1; };
  t.BA.interactCity();
  assert.equal(t.o.calls.buildingOpen.length, 1, 'меню «Строительство»');
  t.o.calls.buildingOpen[0].onAction({ id: 'build-48' });
  const rec = cs.get('100,-40');
  assert.deepEqual(rec.built,
    [{ x: 1, y: 1, buildingId: 48, player: true }],
    'RED: built — ANCHOR-запись (cityStates)');
  assert.equal(t.hero.gold, 70, 'RED: золото 100 → 70 (списание 30 з.)');
  assert.equal(IT.totalQty(t.hero, 'stone_chunk'), 0,
    'RED: списание исходников — ровно на количество (×1 → 0)');
  assert.ok(t.ds.cityContents.buildings.some(
    (b) => b.x === 1 && b.y === 1 && b.buildingId === 48
      && b.player === true),
    'per-cell запись player:true в cityContents.buildings ([E]-поиск/рендер)');
  assert.equal(saves, 1, 'saveNow — 1 (успех)');
  assert.equal(renders, 1, 'playerRender — 1');
  assert.ok(flashes.includes(
    'Построено: Развалины (−30 з., −Каменный обломок ×1)'),
    'RED: flash «Построено: <имя> (−N з., −<имя> ×<Q>)» (000148.04): '
    + JSON.stringify(flashes));
  // (b) Отказ — мало золота (проверяется ТОЛЬКО в момент действия;
  // строка меню геометрическая — доступна).
  const t2 = initCityBuild({ x: 1, y: 1 });
  wireCityAnchor(t2, 100, -40);
  const cs2 = new Map([['100,-40', { lastVisitDay: 5, stock: {} }]]);
  t2.deps.cityStates = cs2;
  t2.hero.gold = 20;
  const flashes2 = [];
  t2.deps.flash = (m) => flashes2.push(m);
  let saves2 = 0;
  t2.deps.saveNow = () => { saves2 += 1; };
  t2.BA.interactCity();
  assert.equal(t2.o.calls.buildingOpen.length, 1, 'меню');
  const row48b = t2.o.calls.buildingOpen[0]
    .actions.find((a) => a.id === 'build-48');
  // 000202 (осознанный репин): pre-check = геометрия + золото +
  // предметы (R1): золото 20 < 30, stone_chunk 0 < 1 — строка
  // недоступна, reason ЯВНЫЙ. Прямой onAction (обход оверлея) →
  // повторная проверка buildCityAt — flash «мало золота (нужно 30)»
  // сохраняется (пин ниже).
  assert.equal(row48b.доступен, false,
    'RED: строка недоступна — pre-check включает ресурсы (000202)');
  assert.equal(row48b.reason, 'Не хватает 10 золота, 1 каменного обломка',
    'RED: reason «Не хватает 10 золота, 1 каменного обломка» '
    + '(золото первыми, запятая): ' + row48b.reason);
  t2.o.calls.buildingOpen[0].onAction({ id: 'build-48' });
  assert.equal(t2.hero.gold, 20, 'RED: отказ — золото не изменилось');
  assert.ok(!cs2.get('100,-40').built
    || cs2.get('100,-40').built.length === 0, 'built — нет записи');
  assert.ok(!t2.ds.cityContents.buildings.some(
    (b) => b.x === 1 && b.y === 1),
    'per-cell — не добавлен');
  assert.equal(saves2, 0, 'RED: отказ — БЕЗ saveNow (семантика 000128 §2.6)');
  assert.ok(flashes2.includes('мало золота (нужно 30)'),
    'RED: отказ — flash «мало золота (нужно N)» (паттерн items.js:859): '
    + JSON.stringify(flashes2));
});

test('CI-U15. 000148.03: pre-disabled строки с reason: деревня при cap (8/8) — 1×1 «лимит 50%», 3×3 «нет места» (space ПЕРВЫЙ); хутор (интерьер 0) — все «нет места»', () => {
  // (a) Деревня (6×6, интерьер 16, потолок 8): 8 занятых клеток
  // (per-cell player-записи) = cap достигнут. Герой на СВОБОДНОЙ
  // (1,1). 1×1 на (1,1): space ОК → cap 8+1 > 8 → «cap». 3×3 на
  // (1,1): footprint перекрывает occupied → «space» ПЕРВЫМ
  // (порядок space→cap→reach).
  const occupied = [[1, 2], [1, 3], [1, 4], [2, 1], [2, 2],
    [2, 3], [2, 4], [3, 1]];
  const contents = occupied.map(([x, y]) =>
    ({ x, y, buildingId: 48, player: true }));
  const t = initCityBuild({ x: 1, y: 1, fp: 2, cityContents: contents });
  t.BA.interactCity();
  assert.equal(t.o.calls.buildingOpen.length, 1,
    'меню открывается (pre-check — доступность строк, не открытие)');
  const p = t.o.calls.buildingOpen[0];
  assert.equal(p.actions.length, 22,
    'все 22 строки присутствуют (21 D3 + rename-city, 000148.05)');
  for (const a of p.actions) {
    if (a.id === 'rename-city') continue; // строка переименования — всегда доступна (000148.05)
    assert.equal(a.доступен, false,
      'RED: при cap строка ' + a.id + ' pre-disabled');
    if ([7, 36].includes(Number(String(a.id).slice(6)))) {
      assert.equal(a.reason, 'Нет места',
        'RED: 3×3: перекрытие occupied → «space» → «Нет места» '
        + '(000202: caps); порядок проверок сохранён');
    } else {
      assert.equal(a.reason, 'Лимит 50%',
        'RED: 1×1: cap 8+1 > 8 → «cap» → «Лимит 50%» (000202: caps)');
    }
  }
  // (b) Хутор (2×2, интерьер 0): ЛЮБОЕ размещение — «space».
  const t2 = initCityBuild({ x: 0, y: 1, fp: 1, cityContents: [] });
  t2.BA.interactCity();
  assert.equal(t2.o.calls.buildingOpen.length, 1, 'меню открывается');
  for (const a of t2.o.calls.buildingOpen[0].actions) {
    if (a.id === 'rename-city') continue; // строка переименования — всегда доступна (000148.05)
    assert.equal(a.доступен, false, 'хутор — строка ' + a.id + ' pre-disabled');
    assert.equal(a.reason, 'Нет места',
      'RED: хутор: интерьер 0 → «space» → «Нет места» (000202: caps)');
  }
});

test('CI-U16. 000148.03: pre-check reason «reach»: 1×1 на (3,4) деревни замуровывает дверь (3,5) → строки 1×1 «закроет доступ к постройкам» (space/cap — ОК); 3×3 — «нет места» (space первым, R5(e))', () => {
  // Конфигурация R5(e) (tests/cities.test.js): дверь деревни (3,5) —
  // единственный путь в интерьер через (3,4) (соседи (2,5)/(4,5) —
  // WALL). 1×1 на (3,4): space ОК (интерьерная FLOOR), cap ОК (1 ≤ 8)
  // → reach: blocked = footprint НОВОЙ постройки → «reach».
  const t = initCityBuild({ x: 3, y: 4, fp: 2, cityContents: [] });
  t.BA.interactCity();
  assert.equal(t.o.calls.buildingOpen.length, 1, 'меню открывается');
  const p = t.o.calls.buildingOpen[0];
  assert.equal(p.actions.length, 22,
    'все 22 строки присутствуют (21 D3 + rename-city, 000148.05)');
  for (const a of p.actions) {
    if (a.id === 'rename-city') continue; // строка переименования — всегда доступна (000148.05)
    assert.equal(a.доступен, false,
      'RED: строка ' + a.id + ' pre-disabled (дверь замурована)');
    if ([7, 36].includes(Number(String(a.id).slice(6)))) {
      assert.equal(a.reason, 'Нет места',
        'RED: 3×3: footprint (3..5, 4..6) за интерьером → «space» ПЕРВЫМ '
        + '(000202: caps)');
    } else {
      assert.equal(a.reason, 'Закроет доступ к постройкам',
        'RED: 1×1: reach → «Закроет доступ к постройкам» '
        + '(000202: caps; R5(e))');
    }
  }
});

test('CI-U17. деградация: пустая клетка + Game.buildingUI отсутствует → no-op + console.error «обход запрещён», ничего не открывается (дубль гарда 000107 в пустой ветке)', () => {
  // Пустая ветка (клетка без постройки) — гард «обход запрещён»
  // (ТЗ 000107) дублирует ветку с постройкой (CI-U10): без buildingUI
  // [E] НИЧЕГО не делает — ни меню, ни NPC.
  const t = initCityBuild({ noBuildingUI: true, cityContents: [] });
  const errs = [];
  const orig = console.error;
  console.error = (...a) => { errs.push(a.join(' ')); };
  try {
    t.BA.interactCity();
  } finally {
    console.error = orig;
  }
  assert.equal(t.o.calls.buildingOpen.length, 0,
    'buildingUI.open — не вызван (нет buildingUI)');
  assert.equal(t.o.calls.npcOpen.length, 0, 'npcUI.open — не вызван');
  assert.ok(errs.some((m) => m.includes('обход запрещён')),
    'console.error «обход запрещён»: ' + JSON.stringify(errs));
});

// ============================================================
// 000148.04: цена — ингредиенты (красные, CI-U18..U19)
// ============================================================
// Контракт: memory/000148.04-city-building-reagents.md (R8/R9, R16-R17).
// Красные причины (осмысленные, не синтаксис): buildCityAt НЕ знает о
// предметах (списание/нехватки нет — старый успех там, где обязан быть
// отказ), demolish НЕ возвращает предметы (flash/строка старой формы,
// инвентарь не растёт).

test('CI-U18. 000148.04: build при ДОСТАТОЧНОМ золоте, НО без исходников (stone_chunk ×0 < ×1) — отказ «мало: Каменный обломок» ДО ЛЮБОГО списания: золото 100 не тронуто, built/per-cell — нет, saveNow=0', () => {
  const t = initCityBuild({ x: 1, y: 1 });
  wireCityAnchor(t, 100, -40);
  const cs = new Map([['100,-40', { lastVisitDay: 5, stock: {} }]]);
  t.deps.cityStates = cs;
  t.hero.gold = 100; // золото ДОСТАТОЧНО (30 з.) — срабатывает ПРОВЕРКА ПРЕДМЕТОВ
  assert.equal(IT.totalQty(t.hero, 'stone_chunk'), 0, 'сид: пусто (stone_chunk ×0)');
  const flashes = [];
  t.deps.flash = (m) => flashes.push(m);
  let saves = 0, renders = 0;
  t.deps.saveNow = () => { saves += 1; };
  t.deps.playerRender = () => { renders += 1; };
  t.BA.interactCity();
  assert.equal(t.o.calls.buildingOpen.length, 1, 'меню «Строительство»');
  t.o.calls.buildingOpen[0].onAction({ id: 'build-48' });
  assert.deepEqual(flashes, ['мало: Каменный обломок'],
    'RED: отказ по нехватке — flash «мало: <имя предмета>» ' +
    '(паттерн items.js «мало золота (нужно N)»): ' + JSON.stringify(flashes));
  assert.equal(t.hero.gold, 100,
    'RED: золото НЕ списано (отказ ДО списания; в старом коде — успех 70)');
  assert.equal(IT.totalQty(t.hero, 'stone_chunk'), 0,
    'инвентарь не тронут (списывать было нечего)');
  const rec = cs.get('100,-40');
  assert.ok(!rec.built || rec.built.length === 0,
    'RED: built — нет записи (в старом коде — запись)');
  assert.equal(t.ds.cityContents.buildings.length, 0,
    'RED: per-cell — не добавлен (в старом коде — добавлен)');
  assert.equal(saves, 0, 'RED: отказ — БЕЗ saveNow (в старом коде — 1)');
  assert.equal(renders, 0, 'отказ — без playerRender');
});

test('CI-U19. 000148.04: demolish Арены (id 7, 3×3, hide ×8) — строка «Разобрать (возврат 120 з., Кожа ×2)» и возврат ПРЕДМЕТОВ в инвентарь РОВНО floor 30% (hide ×1 → ×3, +×2): золото 100 → 220, built/per-cell/stock — чистка, saveNow=1, flash «Разобрано: Арена (+120 з., +Кожа ×2)»', () => {
  // 3×3 в деревню не ставится (cap 8 < 9) — fp5-город (18×18).
  const cells = [];
  for (let dy = 0; dy < 3; dy++)
    for (let dx = 0; dx < 3; dx++)
      cells.push({ x: 3 + dx, y: 2 + dy, buildingId: 7, player: true });
  const t = initCityBuild({
    x: 3, y: 2, cityContents: cells, npcs: [],
  });
  wireCityAnchor(t, 100, -40);
  const cs = new Map([['100,-40', { lastVisitDay: 5, stock: {},
    built: [{ x: 3, y: 2, buildingId: 7, player: true }] }]]);
  t.deps.cityStates = cs;
  const rseed = IT.addItem(t.hero, 'hide', 1);
  assert.ok(rseed.ok, 'сид: hide ×1');
  t.hero.gold = 100;
  const flashes = [];
  t.deps.flash = (m) => flashes.push(m);
  let saves = 0, renders = 0;
  t.deps.saveNow = () => { saves += 1; };
  t.deps.playerRender = () => { renders += 1; };
  t.BA.interactCity();
  assert.equal(t.o.calls.buildingOpen.length, 1,
    'меню постройки игрока (строка «Разобрать»)');
  const p = t.o.calls.buildingOpen[0];
  const dem = p.actions.find((a) => a.id === 'demolish');
  assert.ok(dem, 'строка «Разобрать» (id «demolish»)');
  assert.equal(dem.имя,
    'Разобрать (возврат 120 з., Кожа ×2)',
    'RED: строка с предметным возвратом (floor(8×3/10) = 2): ' + dem.имя);
  p.onAction({ id: 'demolish' });
  assert.equal(t.hero.gold, 220, 'золото +120 (floor(400×3/10))');
  assert.equal(IT.totalQty(t.hero, 'hide'), 3,
    'RED: предметный возврат — hide ×1 + ×2 (floor 30% от ×8) = ×3 ' +
    '(в старом коде — ×1, предметов нет)');
  const rec = cs.get('100,-40');
  assert.deepEqual(rec.built, [], 'built — чистка (record заменён)');
  assert.equal(t.ds.cityContents.buildings.length, 0,
    'per-cell — 9 записей footprint удалено');
  assert.equal(saves, 1, 'saveNow — 1 (успех)');
  assert.equal(renders, 1, 'playerRender — 1');
  assert.ok(flashes.includes('Разобрано: Арена (+120 з., +Кожа ×2)'),
    'RED: flash нового формата (золото + предметы, U+2212 в строке): '
    + JSON.stringify(flashes));
});

// ============================================================
// 000202: UI списка зданий — скролл, иконки, недостающие ресурсы
// красным (красные тесты pre-check/строки/иконки/open-опции)
// ============================================================
// ТЗ: tasks/pending/000202.md; контракт: memory/000202-building-menu-
// ui.md (R1–R8). Причины красного (по функционалу, не синтаксису):
// pre-check openCityBuildMenu — ТОЛЬКО геометрия (a.доступен =
// canBuildAt, a.reason = BUILD_REASON_TEXT строчными); поле «icon»
// в строках отсутствует; reason-тексты типа «Не хватает …»
// отсутствуют; open() вызывается только с title/actions/onAction
// (опций scroll/reasonRed нет).

test('CI-B1. 000202: нехватка ТОЛЬКО золота — id 48 (30 з. + Каменный обломок ×1): обломок ×1 ЕСТЬ, золото 20 → доступен=false, reason «Не хватает 10 золота» (золото первыми, без предметов)', () => {
  const t = initCityBuild({ x: 1, y: 1 });
  t.hero.gold = 20; // < 30 (цена id 48)
  assert.ok(IT.addItem(t.hero, 'stone_chunk', 1).ok,
    'сид: Каменный обломок ×1 (предметов хватает — не хватает золота)');
  t.BA.interactCity();
  const row48 = t.o.calls.buildingOpen[0]
    .actions.find((a) => a.id === 'build-48');
  assert.equal(row48.доступен, false,
    'RED: строка недоступна — pre-check включает золото (000202 R1)');
  assert.equal(row48.reason, 'Не хватает 10 золота',
    'RED: «Не хватает 10 золота» (золото первыми): ' + row48.reason);
});

test('CI-B2. 000202: нехватка ТОЛЬКО предметов (золото 1000 — всем хватает): id 48 (Каменный обломок ×1) ×0 → «Не хватает 1 каменного обломка»; id 45 (×2): ×0 → «Не хватает 2 каменных обломков», ×1 → «Не хватает 1 каменного обломка»', () => {
  // (a) id 48: stone_chunk 0 < 1 (ед. число, пример ТЗ); id 45:
  // 0 < 2 (мн. число).
  const t = initCityBuild({ x: 1, y: 1 });
  t.hero.gold = 1000;
  t.BA.interactCity();
  const p = t.o.calls.buildingOpen[0];
  const row48 = p.actions.find((a) => a.id === 'build-48');
  assert.equal(row48.доступен, false, 'RED: строка недоступна (предметы в pre-check)');
  assert.equal(row48.reason, 'Не хватает 1 каменного обломка',
    'RED: «Не хватает 1 каменного обломка» (ед. число при 1, пример ТЗ): '
    + row48.reason);
  const row45 = p.actions.find((a) => a.id === 'build-45');
  assert.equal(row45.доступен, false, 'RED: строка недоступна');
  assert.equal(row45.reason, 'Не хватает 2 каменных обломков',
    'RED: id 45 (×2), ×0 — «Не хватает 2 каменных обломков» (мн. число): '
    + row45.reason);
  // (b) id 45 ×1 < ×2 (ед. число).
  const t2 = initCityBuild({ x: 1, y: 1 });
  t2.hero.gold = 1000;
  assert.ok(IT.addItem(t2.hero, 'stone_chunk', 1).ok, 'сид: Каменный обломок ×1');
  t2.BA.interactCity();
  const row45b = t2.o.calls.buildingOpen[0]
    .actions.find((a) => a.id === 'build-45');
  assert.equal(row45b.доступен, false, 'RED: строка недоступна');
  assert.equal(row45b.reason, 'Не хватает 1 каменного обломка',
    'RED: id 45 ×1 < ×2 — «Не хватает 1 каменного обломка»: '
    + row45b.reason);
});

test('CI-B3. 000202: нумерация в «Не хватает …» — ДЕФИЦИТ (число = стоимость − имеющееся, как у золота; ревью-репин) + склонение (R3): id 36 (Сера ×10, 500 з. — золото 1000 ОК): ×0 → «Не хватает 10 сер», ×5 → «Не хватает 5 сер»; id 25 (Бревно ×3): ×0 → «Не хватает 3 бревна» (НЕ «бревен»!), ×2 → «Не хватает 1 бревна» (3−2), ×1 → «Не хватает 2 бревна» (3−1)', () => {
  const cases = [
    [36, 'sulfur', 0, 'Не хватает 10 сер'],
    [36, 'sulfur', 5, 'Не хватает 5 сер'],
    [25, 'wood_log', 0, 'Не хватает 3 бревна'],
    [25, 'wood_log', 2, 'Не хватает 1 бревна'],
    [25, 'wood_log', 1, 'Не хватает 2 бревна'],
  ];
  for (const [id, item, have, expect] of cases) {
    const t = initCityBuild({ x: 1, y: 1 });
    t.hero.gold = 1000; // золото ОК (цены 500/70)
    if (have > 0) {
      assert.ok(IT.addItem(t.hero, item, have).ok,
        'сид: ' + item + ' ×' + have);
    }
    t.BA.interactCity();
    const row = t.o.calls.buildingOpen[0]
      .actions.find((a) => a.id === 'build-' + id);
    assert.equal(row.доступен, false,
      'RED: строка build-' + id + ' недоступна');
    assert.equal(row.reason, expect,
      'RED: нумерация «' + expect + '»; факт: ' + row.reason);
  }
});

test('CI-B4. 000202: приоритет геометрии — деревня при cap (8/8) и герой БЕЗ ресурсов (золото 0, предметов нет): 1×1 → «Лимит 50%» (НЕ «Не хватает …»), 3×3 (7/36) → «Нет места»', () => {
  // Конфигурация CI-U15(a), но герой полностью пуст (gold 0):
  // ресурсные тексты НЕ должны появляться — геометрия приоритетнее
  // (R1: порядок = порядок проверок canBuildAt: space → cap → reach).
  const occupied = [[1, 2], [1, 3], [1, 4], [2, 1], [2, 2],
    [2, 3], [2, 4], [3, 1]];
  const contents = occupied.map(([x, y]) =>
    ({ x, y, buildingId: 48, player: true }));
  const t = initCityBuild({ x: 1, y: 1, fp: 2, cityContents: contents });
  t.hero.gold = 0;
  t.BA.interactCity();
  const p = t.o.calls.buildingOpen[0];
  assert.equal(p.actions.length, 22, 'все 22 строки');
  for (const a of p.actions) {
    if (a.id === 'rename-city') continue;
    assert.equal(a.доступен, false, 'строка ' + a.id + ' недоступна');
    if ([7, 36].includes(Number(String(a.id).slice(6)))) {
      assert.equal(a.reason, 'Нет места',
        'RED: 3×3 — «Нет места» (space первым): ' + a.reason);
    } else {
      assert.equal(a.reason, 'Лимит 50%',
        'RED: 1×1 при cap — «Лимит 50%», не «Не хватает …» '
        + '(приоритет геометрии, золото 0): ' + a.reason);
    }
  }
});

test('CI-B5. 000202: icon = путь к спрайту слота (game.buildingSprite, 1:1 cityBuildingPath 000148.02): build-48 → cave_entrance.svg, build-36 → temple.svg, build-44 → tavern.svg, build-1 → weapons_shop.svg; ВСЕ 21 строка — icon (строка); rename-city — без icon; без buildingSprite (фикстура по умолчанию) — icon везде undefined и console.error нет (тихая деградация, R8)', () => {
  // (a) Реальный buildingSprite (sprites.js — чистый в node).
  const SP = require('../src/sprites.js');
  const t = initCityBuild({ x: 1, y: 1 });
  t.deps.game.buildingSprite = SP.buildingSprite;
  t.BA.interactCity();
  const p = t.o.calls.buildingOpen[0];
  const pinIcon = (id, expected) => {
    const row = p.actions.find((a) => a.id === 'build-' + id);
    assert.equal(row.icon, expected,
      'RED: icon строки build-' + id + ' — ' + expected
      + '; факт: ' + row.icon);
  };
  pinIcon(48, 'assets/sprites/buildings/cave_entrance.svg');
  pinIcon(36, 'assets/sprites/buildings/temple.svg');
  pinIcon(44, 'assets/sprites/buildings/tavern.svg');
  pinIcon(1, 'assets/sprites/buildings/weapons_shop.svg');
  for (const a of p.actions) {
    if (a.id === 'rename-city') {
      assert.equal(a.icon, undefined,
        'rename-city — без icon (нумерационный чип, 000148.05)');
      continue;
    }
    assert.equal(typeof a.icon, 'string',
      'RED: строка ' + a.id + ' — icon строкой-путём: ' + a.icon);
  }
  // (b) buildingSprite НЕТ (фикстура по умолчанию): тихая деградация —
  // icon везде отсутствует, console.error нет (R8; пин «ошибок нет»
  // в духе CI-V4).
  const t2 = initCityBuild({ x: 1, y: 1 });
  const errs = [];
  const origErr = console.error;
  console.error = (...a) => { errs.push(a.join(' ')); };
  try {
    t2.BA.interactCity();
  } finally {
    console.error = origErr;
  }
  const p2 = t2.o.calls.buildingOpen[0];
  assert.equal(p2.actions.length, 22, 'меню открывается (деградация, не сбой)');
  for (const a of p2.actions) {
    assert.equal(a.icon, undefined,
      'тихая деградация: строка ' + a.id + ' — icon отсутствует (нет buildingSprite)');
  }
  assert.equal(errs.length, 0,
    'деградация без console.error: ' + JSON.stringify(errs));
});

test('CI-B6. 000202: open()-опции — «Строительство»: scroll:true И reasonRed:true; эффекты-меню (постройка с NPC, «Диалог»): обе undefined (другие вызывающие — байт-в-байт, R6)', () => {
  // (a) Строительное меню (пустая клетка).
  const t = initCityBuild({ x: 1, y: 1 });
  t.BA.interactCity();
  const p = t.o.calls.buildingOpen[0];
  assert.equal(p.title, 'Строительство', 'меню «Строительство»');
  assert.equal(p.scroll, true,
    'RED: «Строительство» — scroll:true (ТЗ: вертикальный скролл)');
  assert.equal(p.reasonRed, true,
    'RED: «Строительство» — reasonRed:true (ТЗ: нехватка — явно красным)');
  // (b) Эффекты-меню (постройка с NPC — фикстура CI-U1): опции НЕТ.
  const t2 = initCity();
  t2.BA.interactCity();
  assert.equal(t2.o.calls.buildingOpen.length, 1,
    'эффекты-меню (постройка с NPC, строка «Диалог»)');
  const p2 = t2.o.calls.buildingOpen[0];
  assert.equal(p2.title, 'оружейная', 'заголовок — из каталога');
  assert.equal(p2.scroll, undefined,
    'эффекты-меню — без scroll (байт-в-байт как раньше)');
  assert.equal(p2.reasonRed, undefined,
    'эффекты-меню — без reasonRed (байт-в-байт как раньше)');
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
// 000134 (CI-134B): existingStorage — ОБЩЕЕ мок-хранилище для
// ДВОЙНОГО boot (сейв в первом → лоад во втором); по умолчанию —
// новое (поведение ВСЕХ прежних вызовов без изменений).
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

// 000134 (CI-134B): existingStorage пробрасывается в bootSandbox
// (двойной boot на ОДНОМ хранилище: сейв → лоад).
async function bootChain(existingStorage) {
  const h = bootSandbox(existingStorage);
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
  const G = h.sandbox.Game;
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
    // 000135: маршрут к городу/пещере может пересечь 5×5-зону
    // триггерящей группы — авторазрешение zone-боя после КАЖДОГО
    // шага (мобы 9999 → Space; Эфир НЕ убиваем — отличие от
    // resolveCombatVictory), без него inCombat заморозит tryMove.
    // Ассерты тестов — про город/взаимодействие, не про бой.
    if (G.combatUI.isActive()) {
      const c = G.combatUI.current();
      for (const m of c.units.filter((x) => x.side === 'mob'
          && x.alive)) {
        G.combatInternals.dealDamageToMob(c, m, 9999);
      }
      assert.ok(c.result && c.result.outcome === 'victory',
        '000135: zone-бой по маршруту — победа');
      G.combatUI.handleCode('Space');
      assert.equal(G.combatUI.isActive(), false,
        '000135: zone-бой закрыт (Space → finish)');
    }
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

// Свободная ВНУТРЕННЯЯ FLOOR-клетка (≠ дверь, без постройки) — для
// CI-V4 (000177: спавн — на двери, [E] там = выход). null — мест нет.
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

// Безопасный ОДИН шаг в МИРЕ от тайла входа (000148.03 CI-V14/V15:
// выход из города → герой на входном тайле; повторный вход требует
// шага С тайла и обратно — авто-вход срабатывает на шаге).
// passable, без группы мобов (шаг = бой), без постройки (пещера/
// город/лестница — авто-вход сломает протокол). null — нет такого
// соседа (сценарий — другой город).
function safeWorldNeighbor(G, myMap, from) {
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (const [dx, dy] of DIRS) {
    const t = myMap.tileAt(from.x + dx, from.y + dy);
    if (!t.passable || t.hasMobGroup || t.hasBuilding) continue;
    return [from.x + dx, from.y + dy];
  }
  return null;
}

// Безопасный ОДИН шаг из спавна (единого тайла, 000177) в
// подземелье: floor, ≠ выход, без живого моба (5×5 безопасная зона
// у входа гарантирует отсутствие сундука на расстоянии 1).
// null — шага нет.
function safeDungeonStep(dg) {
  const DIRS = [[0, -1], [0, 1], [-1, 0], [1, 0]];
  for (const [dx, dy] of DIRS) {
    const nx = dg.x + dx, ny = dg.y + dy;
    if (nx < 0 || ny < 0 || nx >= dg.width || ny >= dg.height) continue;
    if (dg.cells[ny * dg.width + nx] !== G_CELL_FLOOR) continue;
    if (nx === dg.exit.x && ny === dg.exit.y) continue;
    if (dg.mobs && dg.mobs.some((m) => m.x === nx && m.y === ny)) continue;
    return [dx, dy];
  }
  return null;
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
  // Второй обход — от ТЕКУЩЕЙ позиции (Оружейная w): dg — снапшот
  // входа (getter __game.dungeon — свежий объект на каждое чтение).
  walkCity(h, cityStepsTo({ x: w.x, y: w.y }, tv.x, tv.y));
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
  // 000177: строка 2 — единый тайл-дверь (вход и выход).
  assert.ok(hint.includes('Дверь — вход и выход: встаньте на неё и нажмите [E].'),
    'строка 2: единый тайл-дверь (000177): ' + JSON.stringify(hint));
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

// 000148.03 (репин): клетка без постройки — больше НЕ no-op: [E] →
// buildingUI-меню «Строительство» (21 строка, набор D3); повторный
// [E] — закрыть оверлей (стек, как было).
test('CI-V4. [пин] клетка без постройки → [E] → меню «Строительство» (21 строка); повторный [E] — закрыть; без ошибок (000148.03)', async () => {
  const h = await bootChain();
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  const myMap = G.createMap(G.generateSeedPixels());
  // 000177: spawn = единый тайл-дверь (exit) — [E] на нём ВЫВОДИТ из
  // города. Клетка без постройки — любая ВНУТРЕННЯЯ FLOOR (≠ дверь),
  // где постройка не стоит (000106: spots = FLOOR минус дверь);
  // сценарий требует таковой (fp>=2 + свободная клетка).
  const found = findCityFor(G, myMap, g.state.player,
    (c) => c.fp >= 2 && freeCityCell(c) != null);
  assert.ok(found, 'сценарий: город (fp>=2) со свободной клеткой');
  walkTiles(h, NOW, found.steps);
  const dg = g.dungeon;
  assert.ok(dg && dg.kind === 'city', 'в городе');
  // Спавн — на двери (000177) и постройка там не стоит.
  assert.ok(dg.x === dg.entrance.x && dg.y === dg.entrance.y,
    'сценарий: спавн на едином тайле (000177)');
  assert.ok(!found.contents.buildings.some((b) =>
    b.x === dg.entrance.x && b.y === dg.entrance.y),
    'сценарий: на двери постройка не стоит');
  const target = freeCityCell(found);
  walkCity(h, cityStepsTo({ x: dg.x, y: dg.y }, target.x, target.y));
  const before = { x: g.dungeon.x, y: g.dungeon.y, day: g.dungeon.day };
  const errsBefore = h.errors.length;
  key(h, 'KeyE');
  assert.ok(g.dungeon, 'не вышел (клетка без постройки ≠ дверь)');
  assert.ok(G.buildingUI.isActive(),
    'buildingUI открыт — меню «Строительство» (000148.03)');
  const ov = buildingOverlayOf(h);
  assert.ok(ov && textOf(ov).includes('Строительство'),
    'заголовок «Строительство»: ' + (ov ? textOf(ov).slice(0, 200) : 'нет оверлея'));
  assert.equal(findAll(ov, '[data-buid]').length, 22,
    'ровно 22 строки (21 набор D3 + rename-city, 000148.05)');
  assert.ok(!G.npcUI.isActive(), 'npcUI не открыт');
  // Повторный [E] — закрыть оверлей (стек, паритет с 000107).
  key(h, 'KeyE');
  assert.ok(!G.buildingUI.isActive(), 'повторный [E] — оверлей закрыт');
  assert.equal(g.dungeon.x, before.x, 'позиция не изменилась');
  assert.equal(g.dungeon.y, before.y, 'позиция не изменилась');
  assert.equal(g.dungeon.day, before.day, 'день не изменился');
  assert.equal(h.errors.length, errsBefore,
    'без console.error: ' + h.errors.slice(errsBefore).join('; '));
});

test('CI-V5. [зелёный пин] KeyE в настоящем подземелье (вне единого тайла) → no-op (000121/000177)', async () => {
  const h = await bootChain();
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  const myMap = G.createMap(G.generateSeedPixels());
  const cave = findTile(G, myMap, g.state.player, isCaveTile(G));
  assert.ok(cave, 'сценарий: вход в пещеру');
  walkTiles(h, NOW, cave.steps);
  const dg = g.dungeon;
  assert.ok(dg && dg.kind === 'dungeon', 'в подземелье');
  // 000177: спавн — на едином тайле (там [E] = ВЫХОД).
  assert.ok(dg.x === dg.exit.x && dg.y === dg.exit.y,
    'сценарий: спавн на едином тайле (000177)');
  // Шаг С тайла (floor, без моба — безопасная зона входа).
  const step = safeDungeonStep(dg);
  assert.ok(step, 'сценарий: существует безопасный шаг');
  const code = keydownFor(step[0], step[1]);
  press(h, code);
  release(h, code);
  const after = g.dungeon;
  assert.ok(after, 'в подземелье (шаг не вызвал выхода)');
  assert.ok(after.x !== after.exit.x || after.y !== after.exit.y,
    'герой не на едином тайле');
  const before = { x: after.x, y: after.y };
  const errsBefore = h.errors.length;
  key(h, 'KeyE'); // 000121/000177: вне совмещённого тайла → no-op
  assert.ok(g.dungeon, 'не вышел (KeyE вне единого тайла)');
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
    assert.ok([1, 5, 7, 10, 25, 44].includes(b.buildingId),
      'buildingId из городского пула (000134: + Лавка 5): ' + b.buildingId);
    assert.ok(!(b.x === dg.entrance.x && b.y === dg.entrance.y),
      'на entrance постройка не стоит (000106)');
    assert.ok(!(b.x === dg.exit.x && b.y === dg.exit.y),
      'на exit постройка не стоит (000106)');
  }
  assert.deepEqual(dg.buildings, expected,
    'RED: __game.dungeon.buildings — содержимое города в рантайме');
});

// ============================================================
// 000148.03: строительство в городе — vm e2e (красные, CI-V12..V13)
// ============================================================
// Контракт: memory/000148.03-city-building-core.md §6–8. Красная
// причина (осмысленная, не синтаксис): building-actions.js:616
// `if (!cell) return;` — пустая клетка = НИЧЕГО → buildingUI НЕ
// открывается (CI-V12 падает на isActive; CI-V13 — на первом [E]).
// Клик строкой — делегированный обработчик оверлея
// (ov.listeners.click[0]({ target: row }), паттерн 000134).

// 000148.04 (vm-сеид исходников): g.state.hero — СНИМОК-проекция
// (getter __game, main.js): G.addItem/G.totalQty на ней НЕЛЬЗЯ — у
// проекции .inventory — САМ массив слотов, .slots у него нет
// (checkAdd/totalQty → TypeError «inv.slots is not iterable»; паттерн
// qtyOf — tests/building-effects.test.js). ЖИВОЙ инвентарь =
// g.state.hero.inventory — сам hero.inventory.slots (debug-хук
// main.js) — сеид в-place push, счётчик — локальный.
function seedSlot(g, id, qty) {
  const slots = g.state.hero.inventory;
  assert.ok(Array.isArray(slots),
    'инвентарь — живой массив слотов (debug-хук main.js)');
  for (let i = 0; i < qty; i++) slots.push({ id, qty: 1 });
  return slots;
}
function qtyOf(g, id) {
  return (g.state.hero.inventory || [])
    .filter((e) => e && e.id === id)
    .reduce((s, e) => s + (e.qty || 0), 0);
}

test('CI-V12. 000148.03: [E] на пустой клетке города (vm e2e) → buildingUI «Строительство»: 21 строка «Построить: <название> — N з.»; повторный [E] — закрыть оверлей (стек); позиция/день не изменены', async () => {
  const h = await bootChain();
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  const myMap = G.createMap(G.generateSeedPixels());
  const found = findCityFor(G, myMap, g.state.player,
    (c) => c.fp >= 2 && freeCityCell(c) !== null);
  assert.ok(found,
    'сценарий: город (fp>=2) со свободной внутренней клеткой достижим');
  walkTiles(h, NOW, found.steps);
  const dg = g.dungeon;
  assert.ok(dg && dg.kind === 'city', 'в городе (авто-вход)');
  const target = freeCityCell(found);
  walkCity(h, cityStepsTo({ x: dg.x, y: dg.y }, target.x, target.y));
  const before = { x: g.dungeon.x, y: g.dungeon.y, day: g.dungeon.day };
  const errsBefore = h.errors.length;
  key(h, 'KeyE');
  assert.equal(G.buildingUI.isActive(), true,
    'RED: [E] на пустой клетке — buildingUI (сейчас no-op, :616)');
  const ov = buildingOverlayOf(h);
  assert.ok(ov, 'оверлей buildingUI прикреплён к body');
  assert.ok(textOf(ov).includes('Строительство'),
    'RED: заголовок меню «Строительство»: ' + textOf(ov).slice(0, 200));
  assert.equal(findAll(ov, '[data-buid]').length, 22,
    'ровно 22 строки (21 набор D3 + rename-city, 000148.05)');
  assert.ok(textOf(ov).includes(
    'Построить: Развалины — 30 з. (Каменный обломок ×1)'),
    'RED: строка «Построить: <название> — <N> з. (<имя> ×<Q>…)» (000148.04, id 48)');
  // Повторный [E] — закрыть оверлей (стек, :601-604 — не трогать).
  key(h, 'KeyE');
  assert.equal(G.buildingUI.isActive(), false,
    'повторный [E] — оверлей закрыт (стек)');
  assert.equal(g.dungeon.x, before.x, 'позиция не изменена: x');
  assert.equal(g.dungeon.y, before.y, 'позиция не изменена: y');
  assert.equal(g.dungeon.day, before.day, 'день не изменён');
  assert.equal(h.errors.length, errsBefore,
    'без console.error: ' + h.errors.slice(errsBefore).join('; '));
});

test('CI-V13. 000148.03: vm e2e цикл: [E] → «Построить: Развалины» (−30 з.) → built + per-cell + золото; [E] на постройке → «Разобрать (возврат 9 з.)» → клетка очищена, золото +9; позиция/день не изменены', async () => {
  const h = await bootChain();
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  const myMap = G.createMap(G.generateSeedPixels());
  const found = findCityFor(G, myMap, g.state.player,
    (c) => c.fp >= 2 && freeCityCell(c) !== null);
  assert.ok(found,
    'сценарий: город (fp>=2) со свободной внутренней клеткой достижим');
  walkTiles(h, NOW, found.steps);
  const dg = g.dungeon;
  assert.ok(dg && dg.kind === 'city', 'в городе');
  const target = freeCityCell(found);
  walkCity(h, cityStepsTo({ x: dg.x, y: dg.y }, target.x, target.y));
  const gold0 = g.state.hero.gold;
  assert.ok(gold0 >= 30,
    'сценарий: золото ≥ 30 (цена id 48; стартовое 100, sheet.js:120)');
  // 000148.04 (осознанный репин): сеидим исходник id 48 (stone_chunk ×1)
  // — без него зелёный buildCityAt отказал бы по нехватке ДО списаний.
  seedSlot(g, 'stone_chunk', 1);
  assert.equal(qtyOf(g, 'stone_chunk'), 1, 'сид: stone_chunk — ровно ×1');
  const day0 = g.dungeon.day;
  const errsBefore = h.errors.length;
  // (a) Строительство.
  key(h, 'KeyE');
  assert.equal(G.buildingUI.isActive(), true,
    'RED: [E] на пустой клетке — buildingUI (сейчас no-op, :616)');
  const ov = buildingOverlayOf(h);
  const row48 = findRow(ov, 'build-48');
  assert.ok(row48, 'RED: строка build-48 (id 48, 30 з.) в меню');
  assert.equal(row48.disabled, false,
    'свободная клетка, пустой occupied — строка доступна');
  ov.listeners.click[0]({ target: row48 });
  assert.equal(G.buildingUI.isActive(), false,
    'оверлей закрыт действием (executeAction, 000071)');
  assert.equal(g.state.hero.gold, gold0 - 30,
    'RED: золото −30 (каталожная цена id 48)');
  const cs = g.cities[found.ax + ',' + found.ay];
  assert.ok(cs, 'сценарий: запись города в cityStates (ключ — якорь)');
  // JSON-мост: vm-реалм (createContext) — другой Object.prototype,
  // assert/strict deepEqual = deepStrictEqual (референс-пин); мост
  // сохраняет структуру (репин 000148.03, интент без изменений).
  assert.deepEqual(JSON.parse(JSON.stringify(cs.built)),
    [{ x: target.x, y: target.y, buildingId: 48, player: true }],
    'RED: built — ANCHOR-запись (cityStates, 000148.03 §5)');
  assert.ok(g.dungeon.buildings.some(
    (b) => b.x === target.x && b.y === target.y && b.buildingId === 48
      && b.player === true),
    'RED: per-cell запись player:true в dungeon.buildings');
  assert.equal(qtyOf(g, 'stone_chunk'), 0,
    'RED: 000148.04 — списание исходников при build: stone_chunk 1 → 0 (×1)');
  // (b) Разборка.
  key(h, 'KeyE');
  assert.equal(G.buildingUI.isActive(), true,
    'RED: [E] на постройке игрока — меню (со строкой «Разобрать»)');
  const ov2 = buildingOverlayOf(h);
  const rowDem = findRow(ov2, 'demolish');
  assert.ok(rowDem, 'RED: строка «Разобрать» (id «demolish») в меню');
  assert.ok(textOf(ov2).includes('Разобрать (возврат 9 з.)'),
    'RED: текст «Разобрать (возврат <refund> з.)» (30 → floor 30% = 9): '
    + textOf(ov2).slice(0, 300));
  ov2.listeners.click[0]({ target: rowDem });
  assert.equal(G.buildingUI.isActive(), false, 'оверлей закрыт действием');
  assert.equal(g.state.hero.gold, gold0 - 30 + 9,
    'RED: золото +9 (возврат floor(30·3/10))');
  const cs2 = g.cities[found.ax + ',' + found.ay];
  assert.deepEqual(JSON.parse(JSON.stringify(cs2.built)), [],
    'RED: built очищен');
  assert.ok(!g.dungeon.buildings.some(
    (b) => b.x === target.x && b.y === target.y && b.player === true),
    'per-cell запись удалена из dungeon.buildings');
  assert.equal(qtyOf(g, 'stone_chunk'), 0,
    '000148.04: возврат предметов при demolish id 48 = +0 (floor 30% от ×1 = 0)');
  assert.equal(g.dungeon.x, target.x, 'позиция не изменена: x');
  assert.equal(g.dungeon.y, target.y, 'позиция не изменена: y');
  assert.equal(g.dungeon.day, day0, 'день не изменён');
  assert.equal(h.errors.length, errsBefore,
    'без console.error: ' + h.errors.slice(errsBefore).join('; '));
});

// ============================================================
// 000148.03: правки по итогам ревью (2026-10-11) — vm e2e
// ============================================================
// Ревью (blocker): built-merge в prepareCityState мутировал только
// СВЕЖИЙ contents (generateCityContents), а не live-вид
// ds.cityContents.buildings — после выхода/повторного входа клетка
// игрока «пустеет»: [E] открывает «Строительство» вместо меню
// постройки (разборка недостижима, double-build, обход лимита).
// Ревью (major): торговля на ИГРОКОВСКОЙ постройке обслуживалась из
// МИРСКОГО npcStocks (shopFor-fallback 000134) вместо городского
// стока; покупка в городском стоке НЕ персистилась в record.stock.

test('CI-V14. 000148.03 (ревью blocker): построить id 48 → [E] выход на двери → шаг в мир и обратно → повторный вход: live-вид (dungeon.buildings) И built (cityStates) содержат запись player:true; [E] на клетке — меню постройки со строкой «Разобрать (возврат 9 з.)», НЕ «Строительство»', async () => {
  const h = await bootChain();
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  const myMap = G.createMap(G.generateSeedPixels());
  const found = findCityFor(G, myMap, g.state.player,
    (c) => c.fp >= 2 && freeCityCell(c) !== null &&
      safeWorldNeighbor(G, myMap, c.tile) !== null);
  assert.ok(found,
    'сценарий: город (fp>=2) со свободной клеткой и безопасным ' +
    'мировым соседом входного тайла (выход/повторный вход)');
  let now = walkTiles(h, NOW, found.steps);
  const dg = g.dungeon;
  assert.ok(dg && dg.kind === 'city', 'в городе (авто-вход)');
  const target = freeCityCell(found);
  walkCity(h, cityStepsTo({ x: dg.x, y: dg.y }, target.x, target.y));
  const gold0 = g.state.hero.gold;
  // 000148.04 (осознанный репин): сеидим исходник id 48 (stone_chunk ×1)
  // — без него buildCityAt откажет по нехватке ДО списаний (репин
  // CI-V13; отрицательный пин !includes('Построить: ') не трогаем).
  seedSlot(g, 'stone_chunk', 1);
  const errsBefore = h.errors.length;
  // (a) Строительство id 48 (30 з. + stone_chunk ×1).
  key(h, 'KeyE');
  assert.equal(G.buildingUI.isActive(), true, '[E] — меню «Строительство»');
  const ov = buildingOverlayOf(h);
  const row48 = findRow(ov, 'build-48');
  assert.ok(row48, 'строка build-48 в меню');
  ov.listeners.click[0]({ target: row48 });
  assert.equal(g.state.hero.gold, gold0 - 30, 'золото −30 (цена id 48)');
  // (b) Выход: [E] на едином тайле-двери (000177).
  const door = { x: dg.entrance.x, y: dg.entrance.y };
  walkCity(h, cityStepsTo({ x: g.dungeon.x, y: g.dungeon.y },
    door.x, door.y));
  key(h, 'KeyE');
  assert.equal(g.dungeon, null, '[E] на двери — выход из города');
  assert.equal(g.state.player.x, found.tile.x,
    'герой на входном тайле мира: x');
  assert.equal(g.state.player.y, found.tile.y,
    'герой на входном тайле мира: y');
  // (c) Повторный вход: шаг С входного тайла и обратно (авто-вход).
  const away = safeWorldNeighbor(G, myMap, found.tile);
  assert.ok(away, 'сценарий: безопасный сосед входного тайла');
  now = walkTiles(h, now, [away, [found.tile.x, found.tile.y]]);
  const dg2 = g.dungeon;
  assert.ok(dg2 && dg2.kind === 'city', 'повторный вход (авто-вход)');
  // Ревью-правка (blocker): live-вид содержит player-запись.
  assert.ok(dg2.buildings.some((b) => b.x === target.x
      && b.y === target.y && b.buildingId === 48 && b.player === true),
    'REVIEW: per-cell запись player:true в dungeon.buildings ' +
    'ПОСЛЕ повторного входа (live-вид = ds.cityContents.buildings): ' +
    JSON.stringify(dg2.buildings));
  // built (cityStates) — переживает повторный вход (spread).
  assert.deepEqual(JSON.parse(JSON.stringify(
      g.cities[found.ax + ',' + found.ay].built)),
    [{ x: target.x, y: target.y, buildingId: 48, player: true }],
    'built — ANCHOR-запись player:true в cityStates (в-памяти)');
  // (d) [E] на клетке игрока — меню ПОСТРОЙКИ (не «Строительство»)
  // со строкой «Разобрать (возврат 9 з.)».
  walkCity(h, cityStepsTo({ x: dg2.x, y: dg2.y }, target.x, target.y));
  key(h, 'KeyE');
  assert.equal(G.buildingUI.isActive(), true, '[E] — buildingUI');
  const ov2 = buildingOverlayOf(h);
  assert.ok(!textOf(ov2).includes('Построить: '),
    'НЕ меню «Строительство» (нет строк «Построить: …»): ' +
    textOf(ov2).slice(0, 240));
  const rowDem = findRow(ov2, 'demolish');
  assert.ok(rowDem, 'строка «Разобрать» (id «demolish») в меню');
  assert.ok(textOf(ov2).includes('Разобрать (возврат 9 з.)'),
    'текст «Разобрать (возврат 9 з.)»: ' + textOf(ov2).slice(0, 300));
  assert.equal(h.errors.length, errsBefore,
    'без console.error: ' + h.errors.slice(errsBefore).join('; '));
});

test('CI-V15. 000148.03 (ревью major): торговля на ИГРОКОВСКОЙ Оружейной (id 1) — ГОРОДСКОЙ сток (makeCityShop по (город, клетка)), НЕ мирской npcStocks; покупка мутирует record.stock (cityStates → сейв, 000109); базовый сток — тоже через record.stock', async () => {
  const h = await bootChain();
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  const myMap = G.createMap(G.generateSeedPixels());
  const found = findCityFor(G, myMap, g.state.player,
    (c) => c.fp >= 2 && freeCityCell(c) !== null);
  assert.ok(found, 'сценарий: город (fp>=2) со свободной клеткой');
  let now = walkTiles(h, NOW, found.steps);
  const dg = g.dungeon;
  assert.ok(dg && dg.kind === 'city', 'в городе (авто-вход)');
  const target = freeCityCell(found);
  walkCity(h, cityStepsTo({ x: dg.x, y: dg.y }, target.x, target.y));
  const gold0 = g.state.hero.gold;
  assert.ok(gold0 >= 50 + 42,
    'сценарий: золото ≥ 92 (стройка id 1 — 50 з. + покупка ≤ 42 з.; ' +
    'стартовое 100, sheet.js:120)');
  // 000148.04 (осознанный репин): строка id 1 теперь несёт исходники
  // (wood_log ×2) — без сеида buildCityAt откажет «мало: Бревно»
  // ДО списаний и дойдём до торговли не сможем. Сеид — в-place в живой
  // массив слотов (G.addItem на g.state.hero-проекции падает — см.
  // seedSlot; на текущем коде build-1 предмет не проверяет — сеид
  // безвреден, на зелёном — расходится).
  seedSlot(g, 'wood_log', 2);
  const errsBefore = h.errors.length;
  // (a) Строим Оружейную (id 1, 50 з. + wood_log ×2, map_index — лавка).
  key(h, 'KeyE');
  const ov = buildingOverlayOf(h);
  const row1 = findRow(ov, 'build-1');
  assert.ok(row1, 'строка build-1 (Оружейная) в меню');
  ov.listeners.click[0]({ target: row1 });
  assert.equal(g.state.hero.gold, gold0 - 50, 'золото −50 (цена id 1)');
  // (b) [E] → «Диалог» → npcUI (Бренн) → торговля.
  key(h, 'KeyE');
  assert.equal(G.buildingUI.isActive(), true, '[E] — меню постройки');
  const ovB = buildingOverlayOf(h);
  const rowDlg = findRow(ovB, 'dialog');
  assert.ok(rowDlg, 'строка «Диалог» (NPC Оружейной — Бренн)');
  ovB.listeners.click[0]({ target: rowDlg });
  assert.equal(G.npcUI.isActive(), true, '«Диалог» → npcUI');
  const ovN = npcOverlayOf(h);
  const npc1 = G.npcForBuilding(G.NpcData.NPCS, 1);
  assert.ok(npc1 && npc1.торговля, 'NPC Оружейной — Бренн (торговля)');
  clickTab(h, ovN, 'trade');
  // ГОРОДСКОЙ сток ИГРОКОВСКОЙ клетки (makeCityShop — детерминирован):
  // строки «<имя> (ост. N)» — количества стока (cx,cy), НЕ мирского
  // defaults (npcStocks). До ревью-правки fallback 000134 давал
  // мирской сток (wood_sword «ост. 2» = assets-количество).
  const fresh = G.Cities.makeCityShop(found.ax, found.ay,
    target.x, target.y, 1, found.wealth);
  assert.ok(fresh && fresh.stock, 'сценарий: makeCityShop — сток (id 1)');
  const tradeTxt = textOf(npcOverlayOf(h));
  const buyable = npc1.торговля.предметы
    .map((p) => p.предмет)
    .find((id) => (fresh.stock[id] || 0) > 0 &&
      (gold0 - 50) >= G.npcBuyPrice({ npc: npc1, stock: {} }, id,
        G.createCharacter()));
  assert.ok(buyable,
    'сценарий: в городском стоке ИГРОКОВСКОЙ клетки есть ' +
    'доступный (≤ оставшегося золота) предмет Бренна: ' +
    JSON.stringify(fresh.stock));
  const it = G.getItem(buyable);
  assert.ok(tradeTxt.includes(it.name + ' (ост. ' +
      fresh.stock[buyable] + ')'),
    'строка «' + it.name + ' (ост. ' + fresh.stock[buyable] + ')» — ' +
    'ГОРОДСКОЙ сток игровьской клетки (cityShops), не мирской: ' +
    tradeTxt.slice(0, 300));
  // Мирской канал НЕ задет: npcStocks.weapons_merchant НЕ создан.
  assert.equal(g.npcStocks.weapons_merchant, undefined,
    'REVIEW: мирской npcStocks (ключ npcId) — НЕ создан (городской ' +
    'сток, не fallback 000134)');
  // (c) Покупка мутирует ГОРОДСКОЙ сток → record.stock (cityStates).
  const nov = npcOverlayOf(h);
  const buyBtn = findAll(nov, 'button[data-npcact="buy"]')
    .find((b) => b.dataset.item === buyable);
  assert.ok(buyBtn, 'кнопка «купить» у ' + buyable);
  const goldBefore = g.state.hero.gold;
  const price = G.npcBuyPrice({ npc: npc1, stock: {} }, buyable,
    G.createCharacter());
  nov.listeners.click[0]({ target: buyBtn });
  assert.equal(g.state.hero.gold, goldBefore - price, 'золото − цена');
  const rec = g.cities[found.ax + ',' + found.ay];
  const cellStock = rec && rec.stock
    ? rec.stock[target.x + ',' + target.y] : null;
  assert.ok(cellStock,
    'REVIEW: record.stock ИМЕЕТ клетку ИГРОКОВСКОЙ постройки ' +
    '(F2b: buildCityAt кладёт магазин в record.stock)');
  assert.equal(cellStock[buyable], fresh.stock[buyable] - 1,
    'REVIEW: покупка мутирует record.stock (fresh − 1) — ' +
    'персистентность 000109: ' + JSON.stringify(cellStock));
  assert.equal(g.npcStocks.weapons_merchant, undefined,
    'мировой npcStocks — НЕ создан даже после покупки');
  // (d) Повторный вход — сток игровьской клетки живой (не «свежий»).
  key(h, 'Escape');
  assert.equal(G.npcUI.isActive(), false, 'диалог закрыт (Esc)');
  const door = { x: dg.entrance.x, y: dg.entrance.y };
  walkCity(h, cityStepsTo({ x: g.dungeon.x, y: g.dungeon.y },
    door.x, door.y));
  key(h, 'KeyE');
  assert.equal(g.dungeon, null, '[E] на двери — выход');
  const away = safeWorldNeighbor(G, myMap, found.tile);
  assert.ok(away, 'сценарий: безопасный сосед входного тайла');
  now = walkTiles(h, now, [away, [found.tile.x, found.tile.y]]);
  const dg2 = g.dungeon;
  assert.ok(dg2 && dg2.kind === 'city', 'повторный вход');
  assert.ok(dg2.buildings.some((b) => b.x === target.x
      && b.y === target.y && b.buildingId === 1 && b.player === true),
    'live-вид: Оружейная игрока после повторного входа (F1)');
  walkCity(h, cityStepsTo({ x: dg2.x, y: dg2.y }, target.x, target.y));
  key(h, 'KeyE');
  const ovB2 = buildingOverlayOf(h);
  ovB2.listeners.click[0]({ target: findRow(ovB2, 'dialog') });
  assert.equal(G.npcUI.isActive(), true, '«Диалог» → npcUI');
  const ovN2 = npcOverlayOf(h);
  clickTab(h, ovN2, 'trade');
  const tradeTxt2 = textOf(npcOverlayOf(h));
  assert.ok(tradeTxt2.includes(it.name + ' (ост. ' +
      (fresh.stock[buyable] - 1) + ')'),
    'REVIEW: после повторного входа сток живой: «' + it.name +
    ' (ост. ' + (fresh.stock[buyable] - 1) + ')» (не «свежий» ' +
    fresh.stock[buyable] + '): ' + tradeTxt2.slice(0, 300));
  assert.equal(h.errors.length, errsBefore,
    'без console.error: ' + h.errors.slice(errsBefore).join('; '));
});

// ============================================================
// 000134: Лавка странника в городе — Хольд достижим
// ============================================================
// Контракт: memory/000134-city-wanderer-shop.md (D2/D4/D7),
// данные: memory/000134-wanderer-shop.md.
//
// Е2Е-ФИКСТУРА (D4): ПЕРВЫЙ город с Лавкой в BFS-700 от спавна
// (0,0) — деревня 52 @ якорь (38,−12), wealth 3, тайл входа
// (39,−11), 50 шагов; layout 6x6, вход (2,5): таверна (2,3),
// Лавка (1,1) — 5 шагов от входа (000148.01: layout 4f−2; координаты
// е2e-фикстуры — без изменений). 50 > steps_per_day (40) — день
// сменится в пути: НЕ пины (npcStocks без day-респауна, 000109 —
// сток города, а не NPC-сток).
//
// Красные причины (осмысленные — нет функциональности, не
// синтаксис):
//   (1) города с Лавкой нет: id 5 отсутствует во ВСЕХ долях_типов
//       → findCityFor → null → assert.ok(found);
//   (2) слой 2 (если бы доли были, а shopFor-фикса нет): клетка
//       Лавки без cityShops-записи (makeCityShop → null, map_index
//       нет — spec/buildings.md «Магазины») → shopFor → null → renderTradeTab
//       создаёт ОДНОРАЗОВЫЙ сток G.createNpcShop(npc) в оверлее:
//       npcStocks пуст (покупка сгорает при close), повторный
//       диалог «Бревно (ост. 5)», в сейве раздела нет → падают
//       ассерты npcStocks/повторного диалога/сейва (D2).

// beforeunload → saveNow (main.js:627): dispatch захваченного
// window-слушателя (паттерн save-restore.test.js).
function fireBeforeUnload(h) {
  const fns = h.winListeners['beforeunload'];
  assert.ok(fns && fns.length, 'слушатель beforeunload зарегистрирован');
  for (const fn of fns) fn({});
}

// Ход до Лавки + диалог с Хольдом (общая часть CI-134A/B):
// findCityFor(предмет 5) → walkTiles → авто-вход → walkCity →
// [E] → buildingUI → Digit1 «Диалог» → npcUI. existingStorage —
// только для CI-134B (двойной boot). Возврат:
// { h, G, g, found, npc, ov, b5 }.
async function walkToShopAndDialog(existingStorage) {
  const h = await bootChain(existingStorage);
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  const myMap = G.createMap(G.generateSeedPixels());
  const found = findCityFor(G, myMap, g.state.player,
    (c) => c.fp >= 2 &&
    c.contents.buildings.some((b) => b.buildingId === 5));
  assert.ok(found,
    'RED: сценарий — город с Лавкой (id 5) достижим (id 5 отсутствует во всех долях_типов)');
  walkTiles(h, NOW, found.steps);
  const dg = g.dungeon;
  assert.ok(dg && dg.kind === 'city', 'в городе (авто-вход)');
  const b5 = found.contents.buildings.find((b) => b.buildingId === 5);
  assert.ok(b5, 'сценарий: Лавка в содержимом города');
  walkCity(h, cityStepsTo({ x: dg.x, y: dg.y }, b5.x, b5.y));
  const npc = G.npcForBuilding(G.NpcData.NPCS, 5);
  assert.ok(npc && npc.id === 'wanderer_merchant' && npc.имя === 'Хольд',
    'NPC Лавки — Хольд (assets/npc/000011.json, постройки [5])');
  key(h, 'KeyE');
  assert.equal(G.buildingUI.isActive(), true, '[E] — buildingUI (Лавка)');
  const ovb = buildingOverlayOf(h);
  assert.ok(ovb && textOf(ovb).includes('лавка'),
    'title buildingUI — «лавка странника» (каталог): ' +
      (ovb ? textOf(ovb).slice(0, 120) : 'нет оверлея'));
  key(h, 'Digit1');
  assert.equal(G.npcUI.isActive(), true, '«Диалог» → npcUI (Хольд)');
  const ov = npcOverlayOf(h);
  assert.ok(ov, 'оверлей npcUI');
  assert.ok(textOf(ov).includes('Хольд'), 'диалог — Хольд');
  clickTab(h, ov, 'trade');
  return { h, G, g, found, npc, ov, b5 };
}

test('CI-134A. город с Лавкой: [E] → buildingUI → «Диалог» → торговля Хольда (8 позиций 000011.json); покупка wood_log — ГЛОБАЛЬНЫЙ сток npcStocks (ключ npcId); городская запись стока у Лавки НЕТ (spec/buildings.md «Магазины»); повторный диалог — сток живой', async () => {
  const { h, G, g, found, npc, ov, b5 } = await walkToShopAndDialog();
  const trade = textOf(ov);
  // 8 позиций Хольда (6 старых + silver_ore/quartz — 000157.04):
  // «имя (ост. N)» (N — начальное количество) +
  // «покупка P з / продажа S з» (динамические G.npcBuyPrice/
  // npcSellPrice — НЕ хардкод; свежий персонаж = герой спавна:
  // buyPriceMult = sellPriceMult = 1 — у обоих «Торговца» нет).
  assert.ok(npc.торговля && Array.isArray(npc.торговля.предметы));
  assert.equal(npc.торговля.предметы.length, 8,
    'Хольд — ровно 8 позиций сырья (000011.json)');
  const c0 = G.createCharacter();
  for (const p of npc.торговля.предметы) {
    const it = G.getItem(p.предмет);
    assert.ok(
      trade.includes(it.name + ' (ост. ' + p.количество + ')'),
      'строка «' + it.name + ' (ост. ' + p.количество + '）»: ' +
        trade.slice(0, 300));
    assert.ok(
      trade.includes('покупка ' +
        G.npcBuyPrice({ npc, stock: {} }, p.предмет, c0) + ' з / ' +
        'продажа ' +
        G.npcSellPrice({ npc, stock: {} }, p.предмет, c0) + ' з'),
      'цены «покупка P з / продажа S з» для ' + p.предмет);
  }
  // Покупка wood_log: сток — ГЛОБАЛЬНЫЙ npcStocks (ключ — npcId,
  // НЕ (город, клетка)): «что привёз — тем и торгует» — все Лавки
  // всех городов — ОДИН сток Хольда (ТЗ :37-39).
  const buyBtn = findAll(ov, 'button[data-npcact="buy"]')
    .find((b) => b.dataset.item === 'wood_log');
  assert.ok(buyBtn, 'кнопка «купить» у wood_log');
  const goldBefore = g.state.hero.gold;
  const buyPrice = G.npcBuyPrice({ npc, stock: {} }, 'wood_log', c0);
  ov.listeners.click[0]({ target: buyBtn });
  const st = g.npcStocks;
  assert.ok(st.wanderer_merchant,
    'RED: npcStocks.wanderer_merchant создан (ключ — npcId)');
  assert.equal(st.wanderer_merchant.wood_log, 4,
    'RED: npcStocks wood_log 5 → 4 (покупка мутирует ГЛОБАЛЬНЫЙ сток)');
  assert.equal(g.state.hero.gold, goldBefore - buyPrice,
    'золото − цена (dyn)');
  const invW = g.state.hero.inventory
    .reduce((s, e) => s + (e.id === 'wood_log' ? e.qty : 0), 0);
  assert.equal(invW, 1, 'инвентарь: +1 wood_log');
  // Городского канала (cityShops) у Лавки НЕТ (map_index нет —
  // spec/buildings.md «Магазины», makeCityShop → null): в стоке города (ключ —
  // ЯКОРЬ) нет клетки Лавки; таверна — ЕСТЬ.
  const cityRec = g.cities[found.ax + ',' + found.ay];
  assert.ok(cityRec && cityRec.stock,
    'сценарий: город в cityStates (000109, ключ — якорь)');
  const b44 = found.contents.buildings.find((b) => b.buildingId === 44);
  assert.ok(b44, 'сценарий: таверна в городе (минимум 1)');
  assert.ok(cityRec.stock[b44.x + ',' + b44.y],
    'таверна — в городском стоке (makeCityShop работает)');
  assert.equal(cityRec.stock[b5.x + ',' + b5.y], undefined,
    'клетка Лавки — НЕ в городском стоке (канала НЕТ — spec/buildings.md «Магазины»)');
  // Сток НЕ «воскрешает» при повторном диалоге (фиксатор разрыва
  // D2: без shopFor-fallback одноразовый сток → «ост. 5»).
  key(h, 'Escape');
  assert.equal(G.npcUI.isActive(), false, 'диалог закрыт (Esc)');
  key(h, 'KeyE');
  assert.equal(G.buildingUI.isActive(), true, 'повторный [E] — buildingUI');
  key(h, 'Digit1');
  assert.equal(G.npcUI.isActive(), true, 'повторный «Диалог»');
  const ov2 = npcOverlayOf(h);
  clickTab(h, ov2, 'trade');
  assert.ok(textOf(ov2).includes('Бревно (ост. 4)'),
    'RED: повторный диалог: «Бревно (ост. 4)» — сток живой (не одноразовый): ' +
      textOf(ov2).slice(0, 300));
});

test('CI-134B. сейв/лоад: npcStocks сериализуется (data.npcStocks, ключ npcId); закупленный у Хольда сток НЕ «воскресает» после лоада (restoreNpcStocks) — ДВА boot на ОДНОМ хранилище', async () => {
  const storage = makeStorage();
  const { h, G, g, npc } = await walkToShopAndDialog(storage);
  const ov = npcOverlayOf(h);
  clickTab(h, ov, 'trade');
  const buyBtn = findAll(ov, 'button[data-npcact="buy"]')
    .find((b) => b.dataset.item === 'wood_log');
  assert.ok(buyBtn, 'кнопка «купить» у wood_log');
  ov.listeners.click[0]({ target: buyBtn });
  assert.equal(g.npcStocks.wanderer_merchant.wood_log, 4,
    'RED: покупка — npcStocks мутирован (5 → 4)');
  // beforeunload → saveNow (main.js:627): раздел data.npcStocks.
  fireBeforeUnload(h);
  const saved = JSON.parse(storage.getItem(SAVE_KEY));
  assert.ok(saved, 'сейв записан в хранилище');
  assert.equal(saved.version, 1, 'оболочка v1 (неломкое расширение)');
  assert.ok(saved.data && saved.data.npcStocks,
    'RED: раздел data.npcStocks в сейве (serializeNpcStocks)');
  assert.equal(saved.data.npcStocks.wanderer_merchant.wood_log, 4,
    'RED: сейв: wood_log = 4 (закупленный сток сохранён)');
  for (const p of npc.торговля.предметы) {
    if (p.предмет === 'wood_log') continue;
    assert.equal(
      saved.data.npcStocks.wanderer_merchant[p.предмет],
      p.количество, 'сейв: ' + p.предмет + ' — начальное');
  }
  // Второй boot на том же хранилище: restoreFromSave при boot —
  // сток Хольда восстановлен из сейва (catalog-first, qty ≤ нач.).
  const h2 = await bootChain(storage);
  const g2 = h2.sandbox.__game;
  assert.ok(g2.state.save && g2.state.save.version === 1,
    'boot 2: сейв прочитан (не «вакуумный»)');
  const st2 = g2.npcStocks;
  assert.ok(st2.wanderer_merchant,
    'RED: после лоада сток Хольда восстановлен (npcId-ключ)');
  assert.equal(st2.wanderer_merchant.wood_log, 4,
    'RED: лоад: wood_log = 4, НЕ 5 — закупленный сток НЕ «воскресает»');
  for (const p of npc.торговля.предметы) {
    if (p.предмет === 'wood_log') continue;
    assert.equal(st2.wanderer_merchant[p.предмет], p.количество,
      'лоад: ' + p.предмет + ' — как в сейве');
  }
});

// ============================================================
// 000148.05 — Имена городов + персистентность состава (красные
// CI-U20 / CI-U21 / CI-V16)
// ============================================================
// Контракт: memory/000148.05-city-name-persistence.md §3.6–§3.8
// (D-.05d — строка меню; D-.05l/D-.05s — flash-строки; D-.05e —
// e.key-кириллица; D-.05g — renameCity-ядро; D-.05h — occupied;
// D-.05j — input-оверлей; D-.05k — гард interactCity).
// КРАСНЫЕ (TDD):
//  * CI-U20 — в openCityBuildMenu (building-actions.js:588-649)
//    ровно 21 строка build-<id>; строки 'rename-city' НЕТ;
//  * CI-U21 — экспорт renameCity отсутствует (typeof undefined);
//    onAction('rename-city') → buildCityAt(t, NaN) →
//    canBuildAt — throw (диспетчера нет);
//  * CI-V16 — строки «Переименовать город»/input-оверлея/
//    persistent-имени нет — e2e падают на первой такой проверке.
// 6× существующих 21-ассертов (CI-U2/U12/U15/U16/V4/V12) — БЕЗ
// ПРАВКИ на красной стадии (техправка 21→22 — зелёная стадия,
// контракт §7).

test('CI-U20. 000148.05: [E] на пустой клетке → «Строительство»: 21 «Построить: …» (порядок D3) + 22-я строка {id: "rename-city", имя: «Переименовать город», доступен: true} КОНЦА; npcUI напрямую НЕ открывается (000107)', () => {
  const t = initCityBuild({ x: 1, y: 1 });
  t.BA.interactCity();
  assert.equal(t.o.calls.buildingOpen.length, 1,
    'buildingUI.open — ровно 1');
  const p = t.o.calls.buildingOpen[0];
  assert.equal(p.title, 'Строительство',
    'RED: заголовок «Строительство» НЕ меняется (D-.05m)');
  assert.equal(p.actions.length, 22,
    'RED: 22 строки (21 build + rename-city; сейчас 21) — '
    + p.actions.length);
  assert.deepEqual(p.actions.slice(0, 21).map((a) => a.id),
    D3_IDS_03.map((id) => 'build-' + id),
    '21 build-строка — порядок каталога (id-порядок), НЕСДВИГНУТА');
  const last = p.actions[21];
  assert.equal(last.id, 'rename-city',
    'RED: 22-я строка — id «rename-city» (конец списка)');
  assert.equal(last.имя, 'Переименовать город',
    'RED: текст строки «Переименовать город» (D-.05d)');
  assert.equal(last.доступен, true,
    'RED: «Переименовать город» — доступна (reason нет)');
  assert.equal(last.reason, undefined, 'доступная строка — без reason');
  assert.equal(t.o.calls.npcOpen.length, 0,
    'npcUI напрямую НЕ открывается (ТОЛЬКО через buildingUI, 000107)');
  assert.equal(t.o.calls.buildingClose + t.o.calls.npcClose, 0,
    'ничего не закрыто');
});

test('CI-U21. 000148.05: renameCity-ядро — валидное (trim) → record.name + ds.name, saveNow=1, playerRender=1, flash «Город переименован: <name>», built/lastVisitDay НЕ тронуты, stock — LIVE-ссылка (shallow-копия, 000109 «сток переживает визит»); 33 символа/пустое после trim → flash-отказ БЕЗ saveNow, имя не изменено; name === current → тихо; onAction("rename-city") — диспетчер (node-деградация: console.error + no-op, без throw)', () => {
  const probe = initCityBuild({ x: 1, y: 1 });
  assert.equal(typeof probe.BA.renameCity, 'function',
    'RED: экспорт BA.renameCity — нет в building-actions.js');
  // Фикстура (паттерн CI-U14).
  const t = initCityBuild({
    x: 1, y: 1,
    cityContents: [{ x: 1, y: 1, buildingId: 48, player: true }],
  });
  wireCityAnchor(t, 100, -40);
  const stock = { '2,2': { bread: 1 } };
  const built = [{ x: 1, y: 1, buildingId: 48, player: true }];
  const cs = new Map([['100,-40', { lastVisitDay: 5, stock: stock,
    built: built }]]);
  t.deps.cityStates = cs;
  const flashes = [];
  t.deps.flash = (m) => flashes.push(m);
  let saves = 0;
  t.deps.saveNow = () => { saves += 1; };
  let renders = 0;
  t.deps.playerRender = () => { renders += 1; };
  const tile = { x: 1, y: 1, cityAnchor: '100,-40' };
  // (a) Успех (trim по D7).
  t.BA.renameCity(tile, ' Флогистонград ');
  const rec = cs.get('100,-40');
  assert.equal(rec.name, 'Флогистонград',
    'RED: record.name — trim (D7), запись заменена копией');
  assert.equal(t.ds.name, 'Флогистонград',
    'RED: ds.name обновлён (live-имя города)');
  assert.equal(saves, 1, 'RED: saveNow — 1 (успех, мутация)');
  assert.equal(renders, 1, 'RED: playerRender — 1 (паритет buildCityAt)');
  assert.ok(flashes.includes('Город переименован: Флогистонград'),
    'RED: flash «Город переименован: <name>» (ИМЯ БЕЗ КАВЫЧЕК, D-.05s): '
    + JSON.stringify(flashes));
  assert.equal(rec.stock, stock,
    'LIVE-ссылка stock СОХРАНЕНА (shallow-копия записи — '
    + '000109 «сток переживает визит»); глубокое копирование сломает 000109');
  assert.equal(rec.built, built, 'built — НЕ тронут (ссылка)');
  assert.equal(rec.lastVisitDay, 5, 'transient — НЕ тронут');
  // (b) Отказ: 33 символа (D7) — flash БЕЗ saveNow (000128 §2.6).
  t.BA.renameCity(tile, 'А'.repeat(33));
  assert.equal(cs.get('100,-40').name, 'Флогистонград',
    'RED: отказ — имя не изменено (33 символа)');
  assert.equal(saves, 1, 'RED: отказ — saveNow НЕ вызывается');
  assert.ok(flashes.includes('Некорректное имя города'),
    'RED: flash-отказ «Некорректное имя города» (D-.05l): '
    + JSON.stringify(flashes));
  // (c) Отказ: пустое после trim.
  t.BA.renameCity(tile, '   ');
  assert.equal(cs.get('100,-40').name, 'Флогистонград',
    'RED: отказ — имя не изменено (пустое после trim)');
  assert.equal(saves, 1, 'RED: отказ — saveNow НЕ вызывается');
  // (d) name === current → ТИХО (изменений нет — без saveNow/flash).
  const flashesLen = flashes.length;
  t.BA.renameCity(tile, 'Флогистонград');
  assert.equal(cs.get('100,-40').name, 'Флогистонград', 'имя без изменений');
  assert.equal(saves, 1, 'RED: no-op — saveNow НЕ вызывается');
  assert.equal(flashes.length, flashesLen,
    'RED: no-op — flash НЕ печатается');
  // (e) Диспетчер: строка «Переименовать город» → onAction('rename-city')
  //     — путь rename (НЕ buildCityAt). node-деградация транспорта
  //     (window/document нет — D-.05j): console.error + no-op, без
  //     throw и saveNow.
  const t2 = initCityBuild({ x: 1, y: 1 });
  wireCityAnchor(t2, 100, -40);
  const cs2 = new Map([['100,-40', { lastVisitDay: 5, stock: {} }]]);
  t2.deps.cityStates = cs2;
  let saves2 = 0;
  t2.deps.saveNow = () => { saves2 += 1; };
  const errs = [];
  const origErr = console.error;
  console.error = (...a) => { errs.push(a.join(' ')); };
  try {
    t2.BA.interactCity();
    assert.equal(t2.o.calls.buildingOpen.length, 1,
      'меню «Строительство» открыто');
    t2.o.calls.buildingOpen[0].onAction({ id: 'rename-city' });
  } finally {
    console.error = origErr;
  }
  assert.ok(errs.some((m) => m.includes('window/document')),
    'RED: node-деградация транспорта — console.error «window/document» '
    + '(сейчас: onAction → buildCityAt(t, NaN) → canBuildAt — throw): '
    + JSON.stringify(errs));
  assert.equal(saves2, 0, 'RED: диспетчер — saveNow НЕ вызывается (no-op)');
  assert.equal(t2.ds.name, 'Деревня', 'RED: имя не изменено (no-op)');
  assert.equal(t2.o.calls.npcOpen.length, 0,
    'npcUI не открывается (000107)');
});

test('CI-V16. 000148.05: vm e2e (ДВА boot, одно хранилище): [E] пустая клетка → «Переименовать город» → input-оверлей (заголовок «Имя города», подсказка «Enter — сохранить, Esc — отмена») → keydown-кириллица (e.key, D-.05e) → Enter → ds.name = «Флогистонград» + flash в HUD; выход; save; день +3 (≥ city_respawn_days); 2-й boot → повторный вход: ds.name/record.name = кастомное, built в памяти (persistent), базовый набор НЕ занимает player-built клетку (e2e-пин 3.5)', async () => {
  const storage = makeStorage();
  const h = await bootChain(storage);
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  const myMap = G.createMap(G.generateSeedPixels());
  const found = findCityFor(G, myMap, g.state.player,
    (c) => c.fp >= 2 && freeCityCell(c) !== null
      && safeWorldNeighbor(G, myMap, c.tile) !== null);
  assert.ok(found,
    'сценарий: город (fp>=2) со свободной клеткой и безопасным '
    + 'мировым соседом входного тайла (выход/повторный вход)');
  let now = walkTiles(h, NOW, found.steps);
  const dg = g.dungeon;
  assert.ok(dg && dg.kind === 'city', 'в городе (авто-вход)');
  // ДВЕ свободные внутренние клетки: build (target) + rename (free2).
  const d = found.layout;
  const occ = new Set(found.contents.buildings
    .map((b) => b.x + ',' + b.y));
  const frees = [];
  for (let y = 1; y < d.height - 1; y++) {
    for (let x = 1; x < d.width - 1; x++) {
      if (x === d.entrance.x && y === d.entrance.y) continue;
      if (d.cells[y * d.width + x] !== G_CELL_FLOOR) continue;
      if (occ.has(x + ',' + y)) continue;
      frees.push({ x, y });
    }
  }
  assert.ok(frees.length >= 2,
    'сценарий: ≥ 2 свободные внутренние клетки (получено '
    + frees.length + ')');
  const target = frees[0];
  const free2 = frees[1];
  const gold0 = g.state.hero.gold;
  assert.ok(gold0 >= 30,
    'сценарий: золото ≥ 30 (цена id 48; стартовое 100, sheet.js:120)');
  seedSlot(g, 'stone_chunk', 1);
  const errsBefore = h.errors.length;
  // (a) Строительство id 48 на target (000148.03/04 — регрессия).
  walkCity(h, cityStepsTo({ x: dg.x, y: dg.y }, target.x, target.y));
  key(h, 'KeyE');
  assert.equal(G.buildingUI.isActive(), true,
    '[E] на пустой клетке — меню «Строительство»');
  let ov = buildingOverlayOf(h);
  const row48 = findRow(ov, 'build-48');
  assert.ok(row48, 'строка build-48 в меню');
  ov.listeners.click[0]({ target: row48 });
  assert.equal(G.buildingUI.isActive(), false,
    'оверлей закрыт действием (executeAction)');
  assert.equal(g.state.hero.gold, gold0 - 30,
    'золото −30 (build id 48)');
  // (b) Rename на free2: [E] → «Переименовать город» → input-оверлей.
  walkCity(h, cityStepsTo({ x: target.x, y: target.y },
    free2.x, free2.y));
  key(h, 'KeyE');
  assert.equal(G.buildingUI.isActive(), true,
    '[E] на пустой клетке — меню «Строительство»');
  ov = buildingOverlayOf(h);
  assert.ok(textOf(ov).includes('Переименовать город'),
    'RED: меню содержит строку «Переименовать город»: '
    + textOf(ov).slice(0, 300));
  const rowRen = findRow(ov, 'rename-city');
  assert.ok(rowRen, 'RED: строка rename-city (data-buid="rename-city")');
  ov.listeners.click[0]({ target: rowRen });
  assert.equal(G.buildingUI.isActive(), false,
    'оверлей закрыт действием (executeAction: close ДО onAction)');
  const ovIn = buildingOverlayOf(h);
  assert.ok(ovIn,
    'RED: input-оверлей (свой, building-actions.js — D-.05j)');
  assert.ok(textOf(ovIn).includes('Имя города'),
    'RED: заголовок «Имя города» (D-.05j): ' + textOf(ovIn).slice(0, 200));
  assert.ok(textOf(ovIn).includes('Enter — сохранить, Esc — отмена'),
    'RED: подсказка «Enter — сохранить, Esc — отмена» (D-.05j): '
    + textOf(ovIn).slice(0, 200));
  // (c) Ввод имени (D-.05e: символы по e.key — КИРИЛЛИЦА, не e.code)
  //     + Enter (коммит).
  for (const ch of 'Флогистонград') key(h, 'KeyA', { key: ch });
  key(h, 'Enter');
  assert.equal(g.dungeon.name, 'Флогистонград',
    'RED: ds.name — кастомное (коммит по Enter)');
  const ck = found.ax + ',' + found.ay;
  assert.equal(g.cities[ck].name, 'Флогистонград',
    'RED: record.name в cityStates (ключ — якорь)');
  // Flash — в HUD (hud.js:264 — append при performance.now() <
  // flashUntil; в песочнице now заморожен на NOW → flash видим).
  h.frameFn(now + 200);
  h.frameFn(now + 400);
  now += 400;
  const hudEl = h.sandbox.document.getElementById('hud');
  assert.ok(textOf(hudEl).includes('Город переименован: Флогистонград'),
    'RED: flash «Город переименован: <name>» (БЕЗ кавычек, D-.05s): '
    + textOf(hudEl).slice(0, 300));
  // (d) Выход: [E] на едином тайле-двери (000177).
  // ТЕХПРАВКА (ревью 000148.05): cityStepsTo (вертикаль-ПЕРВЫМ) к
  // двери (южный периметр, y=H−1) пересекает периметр-стену, если
  // герой не в столбце двери. До фикса гейта ввода этот путь
  // «работал» СЛУЧАЙНО: баг-движение во время ввода (11× KeyA —
  // буква «Ф») сдвигал героя на клетку влево — ровно в столбец
  // двери (сценарий: free2=(2,1), дверь=(1,5)). После фикса ввод
  // не двигает героя — путь явный: горизонталь в ТЕКУЩЕЙ
  // (внутренней, FLOOR) строке, затем вертикаль в СТОЛБЦЕ ДВЕРИ
  // (внутренние FLOOR-строки + клетка двери — FLOOR). СЕМАНТИКА
  // СЦЕНАРИЯ НЕ ИЗМЕНЕНА (выход с двери), ассерты — без правок.
  const door = { x: dg.entrance.x, y: dg.entrance.y };
  const stepsDoor = [];
  const hxd = door.x < g.dungeon.x ? -1 : 1;
  for (let x = g.dungeon.x + hxd; x !== door.x + hxd; x += hxd)
    stepsDoor.push([x, g.dungeon.y]);
  const vyd = door.y < g.dungeon.y ? -1 : 1;
  for (let y = g.dungeon.y + vyd; y !== door.y + vyd; y += vyd)
    stepsDoor.push([door.x, y]);
  walkCity(h, stepsDoor);
  key(h, 'KeyE');
  assert.equal(g.dungeon, null, '[E] на двери — выход из города');
  assert.equal(g.state.player.x, found.tile.x,
    'герой на входном тайле мира: x');
  assert.equal(g.state.player.y, found.tile.y,
    'герой на входном тайле мира: y');
  // (e) Save + день +3 (≥ city_respawn_days = 3 — persistent ВНЕ окна).
  fireBeforeUnload(h);
  const saved = JSON.parse(storage.getItem(SAVE_KEY));
  assert.ok(saved, 'сейв записан в хранилище');
  const recS = saved.data.cities[ck];
  assert.ok(recS, 'RED: запись города в сейве (persistent — вне окна)');
  assert.equal(recS.name, 'Флогистонград', 'RED: name в сейве');
  assert.deepEqual(JSON.parse(JSON.stringify(recS.built)),
    [{ x: target.x, y: target.y, buildingId: 48, player: true }],
    'RED: built в сейве (состав — persistent)');
  saved.data.day += 3;
  storage.setItem(SAVE_KEY, JSON.stringify(saved));
  // (f) 2-й boot (паттерн CI-134B): повторный вход — имя и состав
  //     переживают окно; базовый набор НЕ занимает player-built
  //     клетку (occupied → regeneration, e2e-пин 3.5).
  const h2 = await bootChain(storage);
  const g2 = h2.sandbox.__game;
  const G2 = h2.sandbox.Game;
  assert.ok(g2.state.save && g2.state.save.version === 1,
    'boot 2: сейв прочитан (не «вакуумный»)');
  const myMap2 = G2.createMap(G2.generateSeedPixels());
  const away = safeWorldNeighbor(G2, myMap2,
    { x: found.tile.x, y: found.tile.y });
  assert.ok(away, 'сценарий: безопасный сосед входного тайла');
  walkTiles(h2, NOW, [away, [found.tile.x, found.tile.y]]);
  const dg2 = g2.dungeon;
  assert.ok(dg2 && dg2.kind === 'city', 'повторный вход (авто-вход)');
  assert.equal(dg2.name, 'Флогистонград',
    'RED: ds.name — кастомное после повторного входа '
    + '(переживает окно респауна — 000148.05)');
  const rec2 = g2.cities[ck];
  assert.equal(rec2.name, 'Флогистонград',
    'RED: record.name в памяти (2-й boot, persistent)');
  assert.deepEqual(JSON.parse(JSON.stringify(rec2.built)),
    [{ x: target.x, y: target.y, buildingId: 48, player: true }],
    'RED: built переживает окно (состав — persistent)');
  assert.equal(rec2.lastVisitDay, g2.state.day,
    'stock ПЕРЕГЕНЕРИРОВАН (свежий визит — lastVisitDay = день входа)');
  assert.ok(!dg2.buildings.some((b) => b.x === target.x
      && b.y === target.y && b.player !== true),
    'RED: базовый набор НЕ занимает player-built клетку '
    + '(occupied — фильтр spots, e2e-пин 3.5): '
    + JSON.stringify(dg2.buildings.filter(
      (b) => b.x === target.x && b.y === target.y)));
  assert.equal(h2.errors.length, 0,
    'boot 2: без console.error: ' + h2.errors.join('; '));
  assert.equal(h.errors.length, errsBefore,
    'boot 1: без console.error: '
    + h.errors.slice(errsBefore).join('; '));
});

// ============================================================
// 000148.05 (ревью) — гейт ввода: движение и [E] блокированы,
// пока открыт input-оверлей переименования (CI-V17)
// ============================================================
// Findings ревью: (1) буквы Ц/Ф/Ы/В (игровая раскладка =
// KeyW/KeyA/KeyS/KeyD) шли каналом dungeon-ui (window keydown,
// зарегистрирован ДО main.js; stopPropagation НЕ гасит другие
// window-слушатели) — герой двигался, пока шло имя; гейт main.js
// keydown (D-.05p) этот канал не накрывал; тач-D-pad
// (touchHoldStep) — тот же канал ctx.onMove. (2) [E] на двери с
// открытым вводом — выход (гард D-.05k — в interactCity, путь
// interactExit не накрыт). Правка: гейт renameInputActive в
// cityOnMove (ОБА канала движения — клавиатура и тач) и в
// locationOnInteract (ветка города). Сценарий гарантирует, что
// без гейта движение ВОЗМОЖНО (свободная клетка со свободным
// FLOOR-соседом справа + вводится ВСЕ ЧЕТЫРЕ буквы направлений —
// честный красный; ловушка CI-V16: «11× KeyA в заблокированную
// стену, позиция после ввода не ассертится»).

// Свободная ВНУТРЕННЯЯ FLOOR-клетка со СВОБОДНОЙ ВНУТРЕННЕЙ
// FLOOR-клеткой справа (≠ дверь, без построек) — сценарий
// CI-V17: без гейта первый введённый символ-направление
// (правый сосед свободен — 'в'/KeyD) гарантированно сдвинул бы
// героя. null — мест нет.
function freeCellWithFreeRightNeighbor(info) {
  const d = info.layout;
  const occupied = new Set(
    (info.contents ? info.contents.buildings : [])
      .map((b) => b.x + ',' + b.y));
  for (let y = 1; y < d.height - 1; y++) {
    for (let x = 1; x < d.width - 2; x++) {
      if (x === d.entrance.x && y === d.entrance.y) continue;
      if (d.cells[y * d.width + x] !== G_CELL_FLOOR) continue;
      if (occupied.has(x + ',' + y)) continue;
      const nx = x + 1;
      if (nx === d.entrance.x && y === d.entrance.y) continue;
      if (d.cells[y * d.width + nx] !== G_CELL_FLOOR) continue;
      if (occupied.has(nx + ',' + y)) continue;
      return { x, y };
    }
  }
  return null;
}

test('CI-V17. 000148.05 (ревью): с открытым input-оверлеем переименования — (a) ввод букв Ц/Ф/Ы/В (клавиши движения игровой раскладки) НЕ двигает героя (канал dungeon-ui keydown → ctx.onMove → cityOnMove) и draft собирает ВСЕ символы; (b) [E] на пустой клетке во время ввода — no-op (нет выхода, нет buildingUI поверх — контракт D-.05p); (c) тач-D-pad (G.dungeonUI.touchHold) не двигает героя; Esc — тихая отмена, имя и позиция не изменены', async () => {
  const storage = makeStorage();
  const h = await bootChain(storage);
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  const myMap = G.createMap(G.generateSeedPixels());
  const found = findCityFor(G, myMap, g.state.player,
    (c) => c.fp >= 2 && freeCellWithFreeRightNeighbor(c) !== null);
  assert.ok(found,
    'сценарий: город (fp>=2) со свободной клеткой, у которой '
    + 'свободный правый FLOOR-сосед');
  walkTiles(h, NOW, found.steps);
  const dg = g.dungeon;
  assert.ok(dg && dg.kind === 'city', 'в городе (авто-вход)');
  const name0 = dg.name;
  const free = freeCellWithFreeRightNeighbor(found);
  assert.ok(free, 'сценарий: свободная клетка со свободным соседом');
  const errsBefore = h.errors.length;
  // Открытие input-оверлея: [E] на свободной клетке →
  // «Переименовать город» (то же, что CI-V16(b)).
  walkCity(h, cityStepsTo({ x: dg.x, y: dg.y }, free.x, free.y));
  key(h, 'KeyE');
  assert.equal(G.buildingUI.isActive(), true,
    '[E] на пустой клетке — меню «Строительство»');
  const ov = buildingOverlayOf(h);
  const rowRen = findRow(ov, 'rename-city');
  assert.ok(rowRen, 'строка «Переименовать город»');
  ov.listeners.click[0]({ target: rowRen });
  const ovIn = buildingOverlayOf(h);
  assert.ok(ovIn && textOf(ovIn).includes('Имя города'),
    'input-оверлей открыт: '
    + (ovIn ? textOf(ovIn).slice(0, 200) : '—'));
  const x0 = g.dungeon.x, y0 = g.dungeon.y;
  // (a) Ввод ВСЕХ ЧЕТЫРЁХ букв-направлений игровой раскладки
  //     (ц=KeyW, ф=KeyA, ы=KeyS, в=KeyD — e.code физический,
  //     e.key — символ раскладки, D-.05e). БЕЗ гейта: каждый
  //     символ шагал героя (dungeon-ui keydown → ctx.onMove →
  //     cityOnMove; гейт main.js keydown (D-.05p) этот канал не
  //     накрывает, а «в» — правый сосед свободен).
  for (const [code, ch] of [['KeyW', 'ц'], ['KeyA', 'ф'],
       ['KeyS', 'ы'], ['KeyD', 'в']]) key(h, code, { key: ch });
  assert.equal(g.dungeon.x, x0,
    'RED (ревью): герой НЕ сдвинулся во время ввода — x '
    + '(буквы ЦФЫВ = клавиши движения)');
  assert.equal(g.dungeon.y, y0,
    'RED (ревью): герой НЕ сдвинулся во время ввода — y');
  assert.ok(textOf(ovIn).includes('цфыв▌'),
    'draft собрал ВСЕ 4 символа (гейт не ломает сам ввод): '
    + textOf(ovIn).slice(0, 200));
  // (b) [E] на пустой клетке во время ввода — no-op (контракт
  //     D-.05p «KeyE блокирован»): выход НЕ случился, buildingUI
  //     НЕ открылся поверх input-оверлея, имя не изменено.
  key(h, 'KeyE');
  assert.ok(g.dungeon,
    'выхода во время ввода НЕТ (g.dungeon не null)');
  assert.equal(G.buildingUI.isActive(), false,
    'buildingUI не открылся поверх input-оверлея (000107/D-.05k)');
  assert.equal(g.dungeon.name, name0,
    'имя не изменено ([E] во время ввода — no-op)');
  // (c) Тач-D-pad — тот же канал ctx.onMove (touchHoldStep →
  //     cityOnMove): во время ввода — шага НЕТ.
  for (const dir of ['right', 'left', 'up', 'down'])
    G.dungeonUI.touchHold(dir);
  assert.equal(g.dungeon.x, x0,
    'RED (ревью): тач-D-pad не двигает героя — x');
  assert.equal(g.dungeon.y, y0,
    'RED (ревью): тач-D-pad не двигает героя — y');
  // Esc — тихая отмена (picker-паттерн, D-.05e): оверлей снят,
  // имя не изменено, saveNow не вызывался (имя = каталожное).
  key(h, 'Escape');
  assert.equal(buildingOverlayOf(h), null,
    'Esc — input-оверлей снят из DOM');
  assert.equal(g.dungeon.name, name0,
    'Esc — имя не изменено (тихая отмена)');
  assert.equal(g.dungeon.x, x0, 'позиция — не изменена (x)');
  assert.equal(g.dungeon.y, y0, 'позиция — не изменена (y)');
  assert.equal(h.errors.length, errsBefore,
    'без console.error: ' + h.errors.slice(errsBefore).join('; '));
});

// ============================================================
// 000191 — ретро-покрытие: fail-open-отбраковка мусорных built-
// записей (retro-20261012, find #3): в prepareCityState зафиксирован
// только happy-path (CI-V14) — мусорные built в сейве
// ============================================================

test('CI-V18. 000191.3: vm e2e (ДВА boot, одно хранилище): сейв cities.<якорь>.built = [мусор ×3 (не-целые x/y; id ∉ каталогу; периметр), валидная] → повторный вход: live-вид (dungeon.buildings) player-постройки РОВНО [валидная]; сток города: валидная (map_index 0) ЕСТЬ, периметра (0,2) НЕТ; 0 console.error (warn — допустим, fail-open 000029)', async () => {
  const storage = makeStorage();
  // Boot 1: находим город (fp>=2, есть свободная внутренняя клетка)
  // и его якорь/шаги (детерминированный мир — boot 2 тот же).
  const h1 = await bootChain(storage);
  const G1 = h1.sandbox.Game;
  const g1 = h1.sandbox.__game;
  const myMap = G1.createMap(G1.generateSeedPixels());
  const found = findCityFor(G1, myMap, g1.state.player,
    (c) => c.fp >= 2 && freeCityCell(c) !== null);
  assert.ok(found,
    'сценарий: город (fp>=2) со свободной внутренней клеткой');
  const target = freeCityCell(found);
  const anchorKey = found.ax + ',' + found.ay;
  // Сейв: built — мусор ×3 + одна валидная (id 1 Оружейная, 1×1,
  // map_index 0 — в городском стоке будет).
  storage.setItem(SAVE_KEY, JSON.stringify({
    version: 1,
    savedAt: new Date(0).toISOString(),
    data: {
      day: 1,
      cities: {
        [anchorKey]: {
          built: [
            { x: 1.5, y: 2, buildingId: 1 }, // не-целые → restore (warn)
            { x: 2, y: 3, buildingId: 999 },  // id ∉ каталогу → merge
            { x: 0, y: 2, buildingId: 1 },    // периметр → вне интерьера
            { x: target.x, y: target.y, buildingId: 1, player: true },
          ],
        },
      },
    },
  }));
  // Boot 2: лоад + вход в город (авто-вход на шаге).
  const h2 = await bootChain(storage);
  const g2 = h2.sandbox.__game;
  walkTiles(h2, NOW, found.steps);
  const dg = g2.dungeon;
  assert.ok(dg && dg.kind === 'city', 'в городе (авто-вход)');
  // Live-вид: player-постройки РОВНО [валидная] — мусор отброшен
  // (restore: не-целые; merge: каталог/интерьер — fail-open).
  // JSON-roundtrip: объекты из vm-песочницы (чужой Object.prototype —
  // deepStrictEqual сравнивает прототипы).
  const playerBuilt = JSON.parse(
    JSON.stringify(dg.buildings.filter((b) => b.player === true)));
  assert.deepEqual(playerBuilt,
    [{ x: target.x, y: target.y, buildingId: 1, player: true }],
    'live-вид: РОВНО [валидная] (мусор ×3 не в городе)');
  assert.ok(!dg.buildings.some((b) => b.buildingId === 999),
    'id 999 (∉ каталогу) — не в городе (merge-отброс)');
  assert.ok(!dg.buildings.some((b) => b.x === 0 && b.y === 2),
    'периметр (0,2) — не в городе (footprint вне интерьера)');
  // Сток города: валидная (Оружейная — map_index 0) ЕСТЬ;
  // периметра (0,2) — НЕТ (базовые — только интерьер).
  const rec = g2.cities[anchorKey];
  assert.ok(rec && rec.stock, 'сценарий: город в cityStates (ключ — якорь)');
  assert.ok(rec.stock[target.x + ',' + target.y],
    'валидная постройка (map_index 0) — в городском стоке');
  assert.equal(rec.stock['0,2'], undefined,
    'периметр (0,2) — НЕ в городском стоке (не попала в merge)');
  // persistent built (spread): не-целые отброшены restore-слоем;
  // целые (999/периметр) — живы (restore каталог/интерьер не
  // проверяет — D-.05n; отброс — на стороне merge-цикла).
  assert.ok(Array.isArray(rec.built), 'built — persistent (spread)');
  assert.ok(!rec.built.some((e) => e.x === 1.5),
    'мусор (x:1.5) — отброшен validateCityState (restore)');
  assert.equal(rec.built.filter((e) => e.buildingId === 999).length, 1,
    'целая запись id 999 — жива в built (restore не проверяет каталог)');
  assert.equal(h2.errors.length, 0,
    '0 console.error (warn — допустим, fail-open 000029): '
    + h2.errors.join('; '));
});

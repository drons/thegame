// Задача 000129 (разбиение main.js 3/4): src/hud.js — строки HUD
// мира/подземелья/города (hudUpdate → Game.hud).
//
// Рефакторинг БЕЗ смены поведения: домен «строки HUD» переезжает из
// src/main.js (L1256–1358: hudUpdate) в чистый UMD-модуль; в main.js
// остаётся тонкая проводка (обёртка renderHud с ctx-литералом 15 полей
// + load-time гард) и СОСТОЯНИЕ flash hudFlash/hudFlashUntil (пишут
// действия/бой — hud.js только отрисовывает). Вывод — побайтово.
// Контракт зафиксирован в memory/000129-hud-module.md (для ~10
// будущих HUD-задач).
//
// КРАСНЫЕ тесты (TDD): написаны ДО реализации; падают, пока
// src/hud.js не существует (MODULE_NOT_FOUND), Game.hud нет в
// браузерном realm (тега нет в index.html) и main.js ещё содержит
// function hudUpdate. Причина падения — отсутствие функциональности
// (не синтаксическая ошибка).
//
// Контракты, зафиксированные здесь:
//   * HU1 — модуль на месте: UMD node-ветка (module.exports —
//     factory()); загрузка в ГОЛОМ realm чистая — ноль зависимостей
//     в момент загрузки (нет require/DOM/Game/console — прецедент
//     000053, паттерн A14/BA1); поверхность РОВНО 6 экспортов:
//     update/buildLine/eHint/buildingNameHint/hereLine/
//     locationLine; браузерная ветка merge БЕЗ потери чужих ключей.
//   * HU2 — eHint(npc, effects): 4 ветки побайтово (000071):
//     NPC+effects «  ([E] <имя>, действия)», NPC «  ([E] <имя>)»,
//     effects «  ([E] действия)», нет — «».
//   * HU3 — buildingNameHint(g, t) → { name, hint }: базовая
//     пещера — имя слота + « (вход — шагните)»; buildingId 48
//     «развалины» — имя каталога, хинт ПОДАВЛЕН (000073); подтипы
//     37/38/39 — СВОЁ каталожное имя (НЕ имя слота); город (категория
//     «город», building NONE) — название_карты + хинт (000103/
//     000105); каталога нет / имя пусто — имя слота. Реальные
//     каталожные записи — src/buildings.js (прецедент
//     building-effects A-тестов).
//   * HU4 — buildLine(ctx): ПОЛНЫЙ побайтовый снимок строки HUD
//     (топ-строка ур/HP/Золото/Очки/Местность/День/Масштаб/карта
//     (map.png|пересчёт) с/без spriteLoader; «[I] персонаж» + [E]-
//     хинты 4 ветки; «Здесь:» + shopHint + eHint + hint; ветки
//     группы мобов «Осторожно: …!» / «Группа … повержена.»;
//     подземный блок «--- <имя> (x, y) ---» + «До выхода: ~N клеток»
//     + «N групп(ы)»; городская ветка — БЕЗ строк групп (contents
//     null, 000106); flash (now < until → «\n»+текст)). Закрывает
//     зазор a3 §2 (топ-строка и mob-строки доселе БЕЗ фиксаторов).
//     update(ctx): setShop РОВНО 1× (makeShop/null) и ДО записи
//     ctx.hudEl.textContent (порядок 1:1 main.js L1350–1357);
//     dungeonState → setShop(null) (1:1 !dungeonState).
//   * HU5 — full-chain index.html (vm, паттерн BA5/bootSandbox):
//     Game.hud в браузерном realm (вся поверхность), загрузка
//     ЧИСТА (errors === 0), игра стартовала (__game, карта, спавн),
//     топ-строка HUD побайтово (форматные фиксаторы).
//   * HU6 — деградация (000053): ctx.game без
//     buildingActions/buildingEffects/npcForBuilding — строка
//     строится БЕЗ [E]-хинтов, БЕЗ исключений, БЕЗ console.error
//     (тихие гарды 1:1, main.js L1264–1274); DUNGEON_NAMES
//     отсутствует (или нет ключа типа) — console.error 1×/вызов +
//     fallback «подземелье» (прецедент locations.js, 000127).
//   * HU7 — структурный: main.js НЕ содержит `function hudUpdate`
//     (домен в src/hud.js — критерий ТЗ: ~10 будущих HUD-задач БЕЗ
//     правок main.js, прецедент BA7); тонкая проводка на месте
//     (G.hud.update( + обёртка renderHud); load-time гард (D12);
//     СОСТОЯНИЕ flash (let hudFlash/hudFlashUntil + flash())
//     ОСТАЁТСЯ в main.js (владелец — действия/бой, §4 memory).
//
// Node-тесты (HU1–HU4, HU6–HU7) — через ctx-стабы со свежим
// объектом каждый кадр (контракт §3 memory); globalThis.Game НЕ
// трогается. Реальные buildingNameUi/TERRAIN_NAMES/BUILDING_TYPES —
// src/map.js, каталожные записи — src/buildings.js (побайтовая
// честность имён). vm-тест (HU5) — паттерн bootSandbox
// tests/building-actions.test.js (DOM/WebGL/localStorage-стабы,
// performance.now заморожен, мир детерминированный).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const m = require('../src/map.js');        // buildingNameUi/TERRAIN_NAMES/BUILDING_TYPES
const b = require('../src/buildings.js');  // getBuilding — реальные каталожные записи

const ROOT = path.join(__dirname, '..');
// Лёнкое чтение: до зелёной стадии файла нет — каждый тест падает на
// СВОЁМ require/ENOENT (осмысленный красный, не «мёртвый файл»).
const MOD = 'src/hud.js';
const MOD_CODE = () => fs.readFileSync(path.join(ROOT, MOD), 'utf8');

// Поверхность Game.hud (контракт §2 memory) — РОВНО 6 экспортов.
const SURFACE = ['update', 'buildLine', 'eHint', 'buildingNameHint',
  'hereLine', 'locationLine'];

// --- Stub-Game (зеркало ctx.game: те же API, что читает строка HUD)
// и ctx-фабрика (свежий объект КАЖДЫЙ кадр — контракт §3 memory). ---

function makeGame(over = {}) {
  const g = {
    derived: (h) => ({ maxHP: 50 }),
    TERRAIN_NAMES: { 3: 'трава' },
    DUNGEON_NAMES: { 0: 'простая пещера' },
    buildingNameUi: m.buildingNameUi,
    BUILDING_TYPES: m.BUILDING_TYPES,
    getBuilding: (id) => b.getBuilding(id),
    shopKindsFor: () => null,
    makeShop: (x, y, bt, w) => ({ shop: true, x, y, building: bt,
      wealth: w }),
    mobGroupName: () => 'волчья стая',
  };
  for (const k of Object.keys(over)) g[k] = over[k];
  return g;
}

function makeHudEl(log) {
  let value = '';
  return {
    set textContent(v) {
      if (log) log.push('text');
      value = String(v);
    },
    get textContent() { return value; },
  };
}

function makeCtx(over = {}) {
  const g = makeGame(over.game);
  const rest = Object.assign({}, over);
  delete rest.game;
  return Object.assign({
    hudEl: makeHudEl(),
    game: g,
    tile: { terrain: 3, hasBuilding: false, buildingId: null,
      hasMobGroup: false },
    map: { width: 40, height: 40, fromPng: false },
    player: { x: 5, y: 7 },
    hero: { level: 3, hp: 42, gold: 100, points: 5 },
    day: 5,
    zoom: 28,
    spriteLoader: null,
    dungeonState: null,
    defeatedAt: new Map(),
    npcs: [],
    flash: '',
    flashUntil: 0,
  }, rest, { game: g });
}

// Топ-строка для базового ctx (hero 3/42/100/5, d.maxHP 50, player
// 5,7, трава, день 5, zoom 28px, карта 40x40 пересчёт, без
// spriteLoader) — побайтово 1:1 main.js L1275–1282.
const TOP_BASE =
  'Флогистон, ур. 3  (5, 7)\n' +
  'HP 42/50  |  Золото: 100  |  Очки: 5\n' +
  'Местность: трава\n' +
  'День: 5  |  Масштаб: 28px  |  карта: 40x40 (пересчёт)\n';

test('HU1. модуль на месте: UMD node-ветка + чистая одиночная загрузка, нуль зависимостей при загрузке (задача 000129)', () => {
  const hud = require('../src/hud.js'); // RED: MODULE_NOT_FOUND
  assert.ok(hud && typeof hud === 'object',
    'module.exports — объект (UMD node-ветка)');
  assert.deepEqual(Object.keys(hud).sort(),
    ['buildLine', 'buildingNameHint', 'eHint', 'hereLine',
      'locationLine', 'update'],
    'поверхность — РОВНО 6 экспортов (контракт §2)');
  for (const mm of SURFACE) {
    assert.equal(typeof hud[mm], 'function', 'поверхность: ' + mm);
  }
  // Одиночная загрузка в голой песочнице (паттерн A14/BA1): sandbox
  // БЕЗ require/module — если бы модуль тащил зависимости при
  // загрузке, здесь ReferenceError (000053); загрузка ЧИСТА (0
  // ошибок); браузерная ветка merge БЕЗ потери чужих ключей.
  const errors = [];
  const sandbox = {
    console: {
      error: (mm) => errors.push(String(mm)),
      warn: () => {}, log: () => {},
    },
  };
  sandbox.Game = { foreign: 42, nested: { a: 1 } };
  vm.createContext(sandbox);
  vm.runInContext(MOD_CODE(), sandbox, { filename: 'hud.js' });
  assert.equal(errors.length, 0,
    'загрузка в голом realm — чистая (ноль console при загрузке): '
    + errors.join('; '));
  const h = sandbox.Game.hud;
  assert.ok(h, 'Game.hud создан в голом realm');
  for (const mm of SURFACE) {
    assert.equal(typeof h[mm], 'function', 'Game.hud.' + mm);
  }
  assert.equal(sandbox.Game.foreign, 42,
    'браузерная ветка: merge не теряет чужие ключи');
  assert.equal(sandbox.Game.nested.a, 1,
    'браузерная ветка: вложенный объект сохранён');
});

test('HU2. eHint (000071): 4 ветки побайтово', () => {
  const hud = require('../src/hud.js'); // RED: MODULE_NOT_FOUND
  const npc = { id: 10, имя: 'Мерлин' };
  assert.equal(hud.eHint(npc, true), '  ([E] Мерлин, действия)',
    'NPC + effects: «  ([E] <имя>, действия)»');
  assert.equal(hud.eHint(npc, false), '  ([E] Мерлин)',
    'только NPC: «  ([E] <имя>)»');
  assert.equal(hud.eHint(null, true), '  ([E] действия)',
    'только effects: «  ([E] действия)»');
  assert.equal(hud.eHint(null, false), '', 'нет ни того, ни другого: «»');
});

test('HU3. buildingNameHint (000073/000103/000105): имя/хинт постройки тайла — 1:1', () => {
  const hud = require('../src/hud.js'); // RED: MODULE_NOT_FOUND
  const g = makeGame();
  // (a) базовая пещера (подтипа нет): имя слота + хинт «(вход —
  // шагните)» (regress C2 city-screen).
  assert.deepEqual(hud.buildingNameHint(g, { building: 9, buildingId: null }),
    { name: 'вход в пещеру', hint: ' (вход — шагните)' });
  // (b) подтип 48 «развалины» (000073): ИМЯ — каталожное, хинт
  // ПОДАВЛЕН (тайл не вход — гард maybeEnterDungeon).
  assert.deepEqual(hud.buildingNameHint(g, { building: 9, buildingId: 48 }),
    { name: 'развалины', hint: '' });
  // (c) храм (слот 8) без каталога (buildingId null) — имя слота.
  assert.deepEqual(hud.buildingNameHint(g, { building: 8, buildingId: null }),
    { name: 'храм солнца', hint: '' });
  // (d) подтипы 37/38/39 (000073): СВОИ каталожные имена — НЕ
  // обобщённое имя слота «храм солнца» (регресс C4 city-screen).
  assert.deepEqual(hud.buildingNameHint(g, { building: 8, buildingId: 37 }),
    { name: 'храм луны', hint: '' });
  assert.deepEqual(hud.buildingNameHint(g, { building: 8, buildingId: 38 }),
    { name: 'храм горы', hint: '' });
  assert.deepEqual(hud.buildingNameHint(g, { building: 8, buildingId: 39 }),
    { name: 'заброшенный храм', hint: '' });
  // (e) город (000103/000105): building NONE (−1) — имя слота
  // пустое; каталожное название_карты + хинт (категория «город»).
  assert.deepEqual(hud.buildingNameHint(g, { building: -1, buildingId: 51 }),
    { name: 'хутор', hint: ' (вход — шагните)' });
  assert.deepEqual(hud.buildingNameHint(g, { building: -1, buildingId: 53 }),
    { name: 'город', hint: ' (вход — шагните)' });
  // (f) каталога нет (getBuilding → null): имя слота, хинт — по
  // типу (пещера без подтипа — хинт на месте).
  assert.deepEqual(hud.buildingNameHint(g, { building: 9, buildingId: 999 }),
    { name: 'вход в пещеру', hint: ' (вход — шагните)' });
  // (g) каталожная запись с ПУСТЫМ именем: имя слота сохраняется
  // (НЕ «Здесь: \n» — regress C1 city-screen).
  const gEmpty = makeGame({
    getBuilding: (id) => (id === 555
      ? { id: 555, название: '' } : b.getBuilding(id)),
  });
  assert.deepEqual(hud.buildingNameHint(gEmpty,
    { building: 8, buildingId: 555 }),
    { name: 'храм солнца', hint: '' });
});

// Задача 000110: HUD-имя — ВСЕ 4 типа городов (ТЗ «4 типа»).
// Реализация — в master с 000105/000129 (buildingNameHint: имя из
// название_карты каталога, первая буква в нижнем; хинт «(вход —
// шагните)» — категория «город»); HU3 пинит 51/53 — HU-C1 докрывает
// все 4 типа (51..54) как пин покрытия. hereLine→buildLine вызван
// только на тайле входа (hasBuilding) — «имя + подсказка на тайле
// входа» — ровно по ТЗ; экран города (000105) — не здесь.
test('HU-C1. buildingNameHint: все 4 типа городов (51..54) — имя каталога + хинт «(вход — шагните)» (задача 000110)', () => {
  const hud = require('../src/hud.js');
  const g = makeGame();
  assert.deepEqual(hud.buildingNameHint(g, { building: -1, buildingId: 51 }),
    { name: 'хутор', hint: ' (вход — шагните)' });
  assert.deepEqual(hud.buildingNameHint(g, { building: -1, buildingId: 52 }),
    { name: 'деревня', hint: ' (вход — шагните)' });
  assert.deepEqual(hud.buildingNameHint(g, { building: -1, buildingId: 53 }),
    { name: 'город', hint: ' (вход — шагните)' });
  assert.deepEqual(hud.buildingNameHint(g, { building: -1, buildingId: 54 }),
    { name: 'столица', hint: ' (вход — шагните)' });
});

test('HU4. buildLine(ctx) — побайтовый снимок строки HUD; update: setShop ДО textContent (задача 000129)', () => {
  const hud = require('../src/hud.js'); // RED: MODULE_NOT_FOUND

  // (a) пустырь (без постройки/моба/подземелья): топ-строка
  // побайтово — форматные фиксаторы (зазор a3 §2: топ-строка
  // доселе в тестах НЕ была зафиксирована).
  assert.equal(hud.buildLine(makeCtx()),
    TOP_BASE + '[I] персонаж',
    'топ-строка: ур/HP/Золото/Очки/Местность/День/Масштаб/карта');

  // (b) spriteLoader — фрагмент «  |  графика: a/b» (1:1) и его
  // АБСЕНС при null.
  assert.equal(hud.buildLine(makeCtx({
    spriteLoader: { readyCount: () => 7, totalCount: () => 12 },
  })),
    'Флогистон, ур. 3  (5, 7)\n' +
    'HP 42/50  |  Золото: 100  |  Очки: 5\n' +
    'Местность: трава\n' +
    'День: 5  |  Масштаб: 28px  |  карта: 40x40 (пересчёт)  |  графика: 7/12\n' +
    '[I] персонаж',
    'фрагмент «графика: a/b» побайтово');
  assert.ok(!hud.buildLine(makeCtx()).includes('графика:'),
    'spriteLoader null — фрагмента «графика:» НЕТ (1:1)');

  // (c) карта из map.png — « (map.png)» вместо « (пересчёт)».
  assert.ok(hud.buildLine(makeCtx(
    { map: { width: 40, height: 40, fromPng: true } }))
    .includes('карта: 40x40 (map.png)'),
    'fromPng true — «(map.png)»');

  // (d) NPC только: топ-строка «  |  [E] диалог», «Здесь:» —
  // «  ([E] <имя>)» (регресс E2 building-effects).
  const npcGame = {
    buildingActions: {
      buildingRecForTile: (t) => (t.hasBuilding
        ? { id: t.buildingId != null ? t.buildingId : 10 } : null),
    },
    npcForBuilding: (npcs, id) => ({ id, имя: 'Мерлин' }),
  };
  assert.equal(hud.buildLine(makeCtx({
    tile: { terrain: 3, hasBuilding: true, building: 10,
      buildingId: null, hasMobGroup: false },
    game: npcGame,
  })),
    TOP_BASE + '[I] персонаж  |  [E] диалог\n' +
    'Здесь: рунический камень  ([E] Мерлин)',
    'NPC: «[E] диалог» + «Здесь: …  ([E] <имя>)»');

  // (e) эффекты только: топ-строка «  |  [E] действия», «Здесь:» —
  // «  ([E] действия)» (регресс E1).
  assert.equal(hud.buildLine(makeCtx({
    tile: { terrain: 3, hasBuilding: true, building: 10,
      buildingId: null, hasMobGroup: false },
    game: Object.assign({}, npcGame, {
      npcForBuilding: () => null,
      buildingEffects: { hasEffects: () => true },
    }),
  })),
    TOP_BASE + '[I] персонаж  |  [E] действия\n' +
    'Здесь: рунический камень  ([E] действия)',
    'эффекты: «[E] действия» + «Здесь: …  ([E] действия)»');

  // (f) NPC + эффекты: топ-строка — ВСЁ РАВНО «  |  [E] диалог»,
  // «Здесь:» — «  ([E] <имя>, действия)» (регресс E6; 000071
  // раунд-3).
  assert.equal(hud.buildLine(makeCtx({
    tile: { terrain: 3, hasBuilding: true, building: 10,
      buildingId: null, hasMobGroup: false },
    game: Object.assign({}, npcGame, {
      buildingEffects: { hasEffects: () => true },
    }),
  })),
    TOP_BASE + '[I] персонаж  |  [E] диалог\n' +
    'Здесь: рунический камень  ([E] Мерлин, действия)',
    'NPC+эффекты: диалог в топ-строке, «([E] <имя>, действия)» у «Здесь:»');

  // (g) магазин: «Здесь:» + «  (торговля — панель [I])».
  assert.equal(hud.buildLine(makeCtx({
    tile: { terrain: 3, hasBuilding: true, building: 0,
      buildingId: null, hasMobGroup: false },
    game: { shopKindsFor: (bt) => (bt === 0 ? ['food'] : null) },
  })),
    TOP_BASE + '[I] персонаж\n' +
    'Здесь: оружейная  (торговля — панель [I])',
    'shopHint побайтово');

  // (h) группа мобов (НЕ повержена): «Осторожно: …!» — форматный
  // фиксатор (зазор a3 §2).
  assert.equal(hud.buildLine(makeCtx({
    tile: { terrain: 3, hasBuilding: false, buildingId: null,
      hasMobGroup: true, mobGroup: 3 },
  })),
    TOP_BASE + '[I] персонаж\n' +
    'Осторожно: волчья стая!',
    '«Осторожно: <группа>!» побайтово');

  // (i) группа мобов ПОВЕРЖЕНА (defeatedAt по ключу 'x,y'):
  // «Группа … повержена.» (1:1 L1345–1346).
  assert.equal(hud.buildLine(makeCtx({
    tile: { terrain: 3, hasBuilding: false, buildingId: null,
      hasMobGroup: true, mobGroup: 3 },
    defeatedAt: new Map([['5,7', true]]),
  })),
    TOP_BASE + '[I] персонаж\n' +
    'Группа волчья стая повержена.',
    '«Группа <группа> повержена.» побайтово');

  // (j) подземелье: «--- <имя> (x, y) ---» + «До выхода: ~N клеток»
  // + «N групп(ы)» (dist — Манхэттен до выхода; не-поверженные
  // группы; регресс E/LOC-цепочки).
  assert.equal(hud.buildLine(makeCtx({
    dungeonState: {
      kind: 'dungeon', x: 2, y: 3,
      dg: { type: 0, exit: { x: 0, y: 0 } },
      contents: { mobs: [{ defeated: false }, { defeated: true },
        { defeated: false }] },
    },
  })),
    TOP_BASE + '[I] персонаж\n' +
    '--- простая пещера (2, 3) ---\n' +
    'До выхода: ~5 клеток  |  2 групп(ы)',
    'подземный блок побайтово');

  // (k) город: «--- <имя> (x, y) ---» + «До выхода: ~N клеток» —
  // БЕЗ строк групп (contents null, 000106 — ветка по kind;
  // regress C5 city-screen).
  assert.equal(hud.buildLine(makeCtx({
    dungeonState: {
      kind: 'city', name: 'Старый город', x: 10, y: 12,
      dg: { exit: { x: 10, y: 14 } },
    },
  })),
    TOP_BASE + '[I] персонаж\n' +
    '--- Старый город (10, 12) ---\n' +
    'До выхода: ~2 клеток',
    'городской блок побайтово, БЕЗ «групп(ы)»');

  // (l) flash АКТИВЕН (performance.now() < flashUntil): строка
  // «\n<текст>» в КОНЦЕ (1:1 L1356).
  assert.equal(hud.buildLine(makeCtx({
    flash: 'Казна пополнена', flashUntil: Number.POSITIVE_INFINITY,
  })),
    TOP_BASE + '[I] персонаж\n' +
    'Казна пополнена',
    'flash-строка в конце (now < until)');

  // (m) flash ИСТЁК (now >= until): строки НЕТ (1:1).
  assert.equal(hud.buildLine(makeCtx({
    flash: 'Казна пополнена', flashUntil: -1,
  })),
    TOP_BASE + '[I] персонаж',
    'flash истёк — строки нет');

  // (n) update: setShop РОВНО 1×, аргументы makeShop 1:1, и setShop
  // ДО записи ctx.hudEl.textContent (порядок 1:1 L1350–1357;
  // HU4-фиксатор порядка — fake hudEl с журналом).
  const log = [];
  const setShopArgs = [];
  const ctxN = makeCtx({
    tile: { terrain: 3, hasBuilding: true, building: 0, buildingId: null,
      hasMobGroup: false, buildingWealth: 2 },
    game: {
      shopKindsFor: (bt) => (bt === 0 ? ['food'] : null),
      playerUI: {
        setShop: (arg) => { setShopArgs.push(arg); log.push('setShop'); },
      },
    },
  });
  ctxN.hudEl = makeHudEl(log);
  hud.update(ctxN);
  assert.equal(setShopArgs.length, 1, 'setShop — РОВНО 1×');
  assert.deepEqual(setShopArgs[0],
    { shop: true, x: 5, y: 7, building: 0, wealth: 2 },
    'setShop(makeShop(x, y, building, buildingWealth)) — аргументы 1:1');
  assert.equal(ctxN.hudEl.textContent,
    TOP_BASE + '[I] персонаж\n' +
    'Здесь: оружейная  (торговля — панель [I])',
    'textContent — вся строка');
  assert.deepEqual(log, ['setShop', 'text'],
    'порядок 1:1: строка → setShop → запись textContent');

  // (o) не-магазин — setShop(null) 1× (1:1 L1350–1355).
  const setShopArgs2 = [];
  const ctxO = makeCtx({
    tile: { terrain: 3, hasBuilding: true, building: 10,
      buildingId: null, hasMobGroup: false },
    game: { playerUI: { setShop: (arg) => setShopArgs2.push(arg) } },
  });
  hud.update(ctxO);
  assert.deepEqual(setShopArgs2, [null], 'не-магазин — setShop(null)');

  // (p) playerUI нет — setShop НЕ вызывается, БЕЗ исключения
  // (гард 1:1 «if (G.playerUI)»).
  const ctxP = makeCtx({
    tile: { terrain: 3, hasBuilding: true, building: 0,
      buildingId: null, hasMobGroup: false },
  });
  let threw = false;
  try { hud.update(ctxP); } catch (err) { threw = true; }
  assert.equal(threw, false, 'без playerUI — без исключения');
  assert.ok(ctxP.hudEl.textContent.startsWith('Флогистон, ур. 3'),
    'строка строится и без playerUI');

  // (q) dungeonState + магазинный тайл — isShop false (1:1
  // !dungeonState) → setShop(null).
  const setShopArgs3 = [];
  const ctxQ = makeCtx({
    tile: { terrain: 3, hasBuilding: true, building: 0,
      buildingId: null, hasMobGroup: false },
    dungeonState: { kind: 'city', name: 'Старый город', x: 10, y: 12,
      dg: { exit: { x: 10, y: 14 } } },
    game: {
      shopKindsFor: (bt) => (bt === 0 ? ['food'] : null),
      playerUI: { setShop: (arg) => setShopArgs3.push(arg) },
    },
  });
  hud.update(ctxQ);
  assert.deepEqual(setShopArgs3, [null],
    'в городе на магазинном тайле — setShop(null) (1:1)');
});

// --- HU5: vm-песочница — вся цепочка index.html (паттерн
// bootSandbox tests/building-actions.test.js: DOM/WebGL/localStorage-
// стабы, performance.now заморожен на NOW, мир детерминированный —
// map.png onerror → generateSeedPixels) ---

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CHAIN = Array.from(html.matchAll(/<script\s+src="([^"]+)"/g), (m2) => m2[1])
  .map((p) => p.replace(/^src\//, ''));
const NOW = 1000; // performance.now() в песочнице заморожен на NOW

// --- WebGL-стаб (main.js: compile/link/буферы; как save-restore) ---

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

// --- «Снисходительный» DOM-элемент с ДЕРЕВОМ (дети/родитель,
// dataset, closest) — как building-actions (оверлеи панели). ---

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
  // textContent — как в DOM: сбрасывает детей (render() очищает секции).
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

// --- localStorage-мок (сейвы реально пишутся/читаются) ---
function makeStorage(seed) {
  const m = new Map();
  if (seed != null) m.set('phlogiston.save', JSON.stringify(seed));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

// --- Песочница: вся цепочка index.html ---

function bootSandbox(seed) {
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
  // Image-стаб: assets/map.png ВСЕГДА onerror (детерминированный
  // фолбэк G.generateSeedPixels, main.js loadMapPixels),
  // остальные — onload.
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
      error: (m3) => errors.push(String(m3)),
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
  return { sandbox, winListeners, raf, errors, storage, body, hud };
}

// Промывка микротасков (загрузки Image + loadMapPixels().then: карта,
// спавн, requestAnimationFrame).
const drain = () => new Promise((r) => setImmediate(r));

async function boot(seed) {
  const h = bootSandbox(seed);
  await drain();
  await drain();
  await drain();
  return h;
}

test('HU5. full-chain index.html: Game.hud в браузерном realm, загрузка чистая, игра стартовала, HUD-строки без изменений (задача 000129)', async () => {
  const h = await boot();
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет: ' + h.errors.join('; '));
  const hudMod = h.sandbox.Game.hud;
  assert.ok(hudMod,
    'Game.hud на месте в браузерном realm (src/hud.js)');
  for (const mm of SURFACE) {
    assert.equal(typeof hudMod[mm], 'function', 'Game.hud.' + mm);
  }
  // Игра стартовала (main.js — в цепочке ПОСЛЕ модуля).
  const g = h.sandbox.__game;
  assert.ok(g, 'globalThis.__game выставлен (main.js выполнен)');
  assert.ok(g.state.map, 'карта сгенерирована');
  assert.ok(g.state.player, 'спавн найден');
  // HUD-строки без изменений: топ-строка побайтово (форматные
  // фиксаторы зазора a3 §2) — кадры main.js идут через проводку
  // renderHud → G.hud.update.
  h.frameFn = h.raf[h.raf.length - 1];
  let now = NOW;
  for (let i = 0; i < 3; i++) {
    now += 16;
    h.frameFn(now);
  }
  const text = h.hud.textContent;
  assert.ok(text.startsWith('Флогистон, ур. '),
    'топ-строка «Флогистон, ур. N  (x, y)»: ' + JSON.stringify(text));
  assert.ok(
    /\nHP \d+\/\d+  \|  Золото: \d+  \|  Очки: \d+\n/.test(text),
    'строка «HP N/N  |  Золото: N  |  Очки: N»: ' + JSON.stringify(text));
  assert.ok(/\nМестность: [^\n]+\n/.test(text),
    'строка «Местность: …»: ' + JSON.stringify(text));
  // В полной цепочке спрайты загружены (Image-стаб onload) —
  // spriteLoader не null, и фрагмент «  |  графика: a/b» В СТРОКЕ
  // (1:1 main.js L1280; проверено по исходному main.js HEAD —
  // побайтово тот же вывод). a/b — детерминированные счётчики
  // (число ассетов), в пине — \d+.
  assert.ok(
    /\nДень: \d+  \|  Масштаб: \d+px  \|  карта: \d+x\d+ \(пересчёт\)(  \|  графика: \d+\/\d+)?\n/
      .test(text),
    'строка «День: N  |  Масштаб: Npx  |  карта: WxH (пересчёт)»: '
    + JSON.stringify(text));
  assert.ok(
    /\(пересчёт\)  \|  графика: \d+\/\d+\n/.test(text),
    'фрагмент «  |  графика: a/b» побайтово (спрайти в цепочке): '
    + JSON.stringify(text));
  assert.ok(text.includes('[I] персонаж'),
    'строка «[I] персонаж»: ' + JSON.stringify(text));
});

test('HU6. деградация: без [E]-зависимостей — строка без хинтов, без исключений; DUNGEON_NAMES — fallback «подземелье» (000053)', () => {
  const hud = require('../src/hud.js'); // RED: MODULE_NOT_FOUND

  // (a) ctx.game без buildingActions/buildingEffects/npcForBuilding:
  // строка строится БЕЗ [E]-хинтов, БЕЗ исключений и БЕЗ
  // console.error (тихие гарды 1:1, main.js L1264–1274 — регрессия
  // ТЕКУЩЕГО поведения).
  const errs = [];
  const origErr = console.error;
  console.error = (mm) => errs.push(String(mm));
  try {
    const line = hud.buildLine(makeCtx({
      tile: { terrain: 3, hasBuilding: true, building: 10,
        buildingId: null, hasMobGroup: false },
    }));
    assert.equal(line,
      TOP_BASE + '[I] персонаж\n' +
      'Здесь: рунический камень',
      'строка без [E]-хинтов (деградация 1:1)');
    assert.equal(errs.length, 0, 'тихие гарды — без console.error');
  } finally {
    console.error = origErr;
  }

  // (b) подземелье БЕЗ Game.DUNGEON_NAMES: console.error (1×/вызов)
  // + fallback «подземелье» (000053, прецедент locations.js 000127;
  // строка всё равно строится — игра не падает).
  let errs2 = [];
  console.error = (mm) => errs2.push(String(mm));
  try {
    const line2 = hud.buildLine(makeCtx({
      game: { DUNGEON_NAMES: undefined },
      dungeonState: {
        kind: 'dungeon', x: 1, y: 1,
        dg: { type: 0, exit: { x: 0, y: 0 } },
        contents: { mobs: [{ defeated: false }] },
      },
    }));
    assert.ok(line2.includes('--- подземелье (1, 1) ---'),
      'fallback «подземелье» в строке: ' + JSON.stringify(line2));
    assert.ok(line2.includes('До выхода: ~2 клеток  |  1 групп(ы)'),
      'подземный блок цел: ' + JSON.stringify(line2));
    assert.equal(errs2.length, 1, 'console.error — 1×/вызов');
    assert.ok(errs2[0].includes('DUNGEON_NAMES'),
      'сообщение — про DUNGEON_NAMES: ' + errs2[0]);
  } finally {
    console.error = origErr;
  }

  // (c) DUNGEON_NAMES есть, НО НЕТ КЛЮЧА типа: тот же fallback
  // (гард шире 1:1 — data-error-ветка, контракт §2.2).
  let errs3 = [];
  console.error = (mm) => errs3.push(String(mm));
  try {
    const line3 = hud.buildLine(makeCtx({
      game: { DUNGEON_NAMES: { 0: 'простая пещера' } },
      dungeonState: {
        kind: 'dungeon', x: 1, y: 1,
        dg: { type: 7, exit: { x: 0, y: 0 } },
        contents: { mobs: [{ defeated: false }] },
      },
    }));
    assert.ok(line3.includes('--- подземелье (1, 1) ---'),
      'нет ключа типа — fallback «подземелье»: ' + JSON.stringify(line3));
    assert.equal(errs3.length, 1, 'console.error — 1×/вызов');
  } finally {
    console.error = origErr;
  }
});

test('HU7. структурный: hudUpdate из main.js ушёл в src/hud.js; проводка и flash-состояние на месте (задача 000129)', () => {
  const main = fs.readFileSync(path.join(ROOT, 'src', 'main.js'), 'utf8');
  // Домен в src/hud.js — критерий ТЗ: ~10 будущих HUD-задач БЕЗ
  // правок main.js (прецедент BA7).
  assert.ok(!/function\s+hudUpdate\b/.test(main),
    'main.js после задачи 000129 НЕ содержит function hudUpdate: ' +
    'домен переехал в src/hud.js');
  // Тонкая проводка на месте.
  assert.ok(main.includes('function renderHud'),
    'main.js: обёртка renderHud (контекст 15 полей)');
  assert.ok(main.includes('G.hud.update('),
    'main.js: вызов G.hud.update(ctx) в проводке');
  // Load-time гард (D12): src/hud.js обязан грузиться ДО main.js
  // (UMD-ловушка 000038) — ошибка видна ОДИН раз при загрузке.
  assert.ok(main.includes('Game.hud отсутствует'),
    'main.js: load-time гард с console.error (D12)');
  // СОСТОЯНИЕ flash остаётся в main.js (владелец — действия/бой,
  // §4 memory): hud.js получает значения в ctx.
  assert.ok(main.includes('let hudFlash'),
    'let hudFlash — состояние flash в main.js');
  assert.ok(main.includes('let hudFlashUntil'),
    'let hudFlashUntil — состояние flash в main.js');
  assert.ok(main.includes('function flash'),
    'flash() — в main.js (пишут действия/бой)');
});

test('HU8. buildLine(ctx): строка «Исследовано: N тайлов» (задача 000093) — top-блок, ПОСЛЕ «[I] персонаж» + [E]-хинта, ДО «Здесь:»; без склонений; 0/NaN/нет поля — строки нет', () => {
  const hud = require('../src/hud.js');
  // (a) N = 1681 (окно башни 41×41) — побайтово: строка ПРЯМО ПОСЛЕ
  // top-блока «[I] персонаж» + [E]-хинта (контракт 000093-explored-
  // tower.md §2.3; red: строка отсутствует).
  assert.equal(hud.buildLine(makeCtx({ exploredCount: 1681 })),
    TOP_BASE + '[I] персонаж\nИсследовано: 1681 тайлов',
    '«Исследовано: 1681 тайлов» побайтово (red: строка отсутствует)');
  // (b) Грамматика «N тайлов» БЕЗ склонений (контракт ТЗ).
  assert.equal(hud.buildLine(makeCtx({ exploredCount: 1 })),
    TOP_BASE + '[I] персонаж\nИсследовано: 1 тайлов',
    '«1 тайлов» — без склонений');
  // (c) 0 / NaN / поле отсутствует — строки НЕТ (побайтово = базовая
  // строка; гард — Number.isFinite(ctx.exploredCount)).
  const base = TOP_BASE + '[I] персонаж';
  assert.equal(hud.buildLine(makeCtx({ exploredCount: 0 })), base,
    '0 — строки нет');
  assert.equal(hud.buildLine(makeCtx({ exploredCount: NaN })), base,
    'NaN — строки нет');
  assert.equal(hud.buildLine(makeCtx()), base, 'поля нет — строки нет');
  // (d) ПОЗИЦИЯ строки: ПОСЛЕ top-блока, ДО «Здесь:» (тайл постройки)
  // — ветки dungeonState/hereLine/mobgroup идут ПОСЛЕ explored-строки.
  assert.equal(hud.buildLine(makeCtx({
    tile: { terrain: 3, hasBuilding: true, building: 10,
      buildingId: null, hasMobGroup: false },
    exploredCount: 3,
  })),
    TOP_BASE + '[I] персонаж\nИсследовано: 3 тайлов\n' +
    'Здесь: рунический камень',
    'строка между top-блоком и «Здесь:»');
});

test('HU9. update(): ветка лагеря — ctx.campShopFor → setShop(campWrap), dungeon → null, без campShopFor — 1:1, isShop побеждает (задача 000095)', () => {
  const hud = require('../src/hud.js');
  const CAMP_WRAP = { x: 5, y: 7, buildingType: 47, wealth: 0,
    stock: { bread: 2 }, seed: 123456 };

  // (a) тайл лагеря + campShopFor в ctx → setShop(campWrap) РОВНО 1×,
  // makeShop НЕ вызывается (лагерь — не «картовый» магазин:
  // shopKindsFor(-1) → null → ветка isShop мертва). Контракт
  // §2.7: setShop(isShop ? makeShop(...) : campShop).
  {
    const log = [];
    const setShopArgs = [];
    let makeShopCalls = 0;
    const ctxA = makeCtx({
      tile: { terrain: 3, hasBuilding: true, building: -1,
        buildingId: 47, hasMobGroup: false, buildingWealth: 0 },
      game: {
        playerUI: {
          setShop: (arg) => { setShopArgs.push(arg); log.push('setShop'); },
        },
        makeShop: () => { makeShopCalls++; return { shop: true }; },
      },
      campShopFor: (x, y, tile) => CAMP_WRAP,
    });
    ctxA.hudEl = makeHudEl(log);
    hud.update(ctxA);
    assert.equal(setShopArgs.length, 1, 'setShop — РОВНО 1×/кадр');
    assert.deepEqual(setShopArgs[0], CAMP_WRAP,
      'setShop(campWrap) — сток лагеря (не makeShop)');
    assert.equal(makeShopCalls, 0, 'makeShop НЕ вызван (не магазин)');
    assert.deepEqual(log, ['setShop', 'text'],
      'порядок 1:1: строка → setShop → запись textContent');
  }
  // (b) dungeonState — setShop(null) ДАЖЕ при campShopFor
  // (гард !dungeonState на обеих ветках, 1:1 существующий).
  // Стуб — МИНИМАЛЬНО корректная форма (x/y/dg.exit/contents.mobs):
  // buildLine → locationLine (hud.js) читает их (реал-форма —
  // makeDungeonState, src/locations.js).
  {
    const setShopArgs = [];
    const ctxB = makeCtx({
      dungeonState: { kind: 'dungeon', x: 0, y: 0,
        dg: { type: 0, cells: [], exit: { x: 0, y: 0 } },
        contents: { mobs: [] } },
      game: { playerUI: { setShop: (arg) => setShopArgs.push(arg) } },
      campShopFor: () => CAMP_WRAP,
    });
    hud.update(ctxB);
    assert.deepEqual(setShopArgs, [null],
      'подземелье → setShop(null), campShop не пробивается');
  }
  // (c) ctx БЕЗ campShopFor (текущая цепочка, 14 полей) — campShop
  // null → поведение 1:1 (регрессия существующих hud-тестов).
  {
    const setShopArgs = [];
    const ctxC = makeCtx({
      game: { playerUI: { setShop: (arg) => setShopArgs.push(arg) } },
    });
    hud.update(ctxC);
    assert.deepEqual(setShopArgs, [null],
      'без campShopFor — setShop(null) (1:1)');
  }
  // (d) «картовый» магазин + campShopFor — isShop ПЕРЕБИВАЕТ:
  // setShop(makeShop(x, y, building, wealth)), campWrap не
  // используется (контракт §2.7: isShop ? makeShop : campShop).
  {
    const setShopArgs = [];
    const ctxD = makeCtx({
      tile: { terrain: 3, hasBuilding: true, building: 0,
        buildingId: null, hasMobGroup: false, buildingWealth: 2 },
      game: {
        shopKindsFor: (bt) => (bt === 0 ? ['food'] : null),
        playerUI: { setShop: (arg) => setShopArgs.push(arg) },
        makeShop: (x, y, bt, w) => ({ shop: true, x, y, building: bt,
          wealth: w }),
      },
      campShopFor: () => CAMP_WRAP,
    });
    hud.update(ctxD);
    assert.deepEqual(setShopArgs,
      [{ shop: true, x: 5, y: 7, building: 0, wealth: 2 }],
      'магазин тайла побеждает — setShop(makeShop(...))');
    assert.notDeepEqual(setShopArgs[0], CAMP_WRAP,
      'campWrap НЕ передан (isShop true)');
  }
});

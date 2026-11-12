// Задача 000348 — заклинание школы тени «Декаданс» (decadance): экстренный
// выход из подземелья «вниз». Применимо ТОЛЬКО в пещерах и подземельях
// (dungeonState.kind === 'dungeon' — пещеры и подземелья один домен,
// типы CAVE/CRYPT/RUINS/DROWNED/ABYSS); карта (dungeonState===null),
// город (kind==='city', тот же экран) и бой — отказ ДО списания маны.
// Механика: мгновенный многоэтажный спуск — телепорт ко ВХОДУ (entrance-
// клетке) ТЕКУЩЕГО подземелья на глубину d.depth + (5 + floor(Интеллект/10))
// (интерпретация (а), memory/000348-decadance.md: «ко входу подземелья на
// N уровней ниже» = entrance-клетка целевого этажа — точка спавна обычного
// спуска, descendFloor 000153.03). Округление Интеллект/10 — Math.floor
// (единая конвенция диска: sheet.js spellActionsInt, combat.js spellInt,
// efir.js — 1 + Math.floor(X/10)). День НЕ тратится (переход этажей,
// clock не вызывается), память старого этажа пишется, промежуточные — нет.
// Действие «телепорт» (мгновенное, без параметров.days) → боевой отказ
// «внебоевое заклинание» бесплатен (гейт по ДЕЙСТВИЮ, OUT_OF_COMBAT).
// Механизм гейта — колбэк ctx.decadance (прецедент ctx.navPath 000333,
// fail-closed ДО маны). Иконки slug-именованы (000318.05); свиток-спутник
// decadance_scroll — spell_scroll, effect.spell = ID (000327), value/tier
// по lvl3-свиткам тень (115/3).
//
// КРАСНЫЕ до реализации (осмысленные ERR_ASSERTION, без краха загрузки):
//   D-JSON-1 — файла нет / схема / slug-шейп / порядок ключей / roundtrip;
//   D-SWEEP-2 — записи нет в каталоге; коллизий id/имени нет и в RED
//     (guard-пин — ловит будущую коллизию);
//   D-SCROLL-3 — свитка 000764 нет / схема / канон desc;
//   D-MIRROR-4 — записи нет в зеркалах spells-data/items-data;
//   D-CTX-5 — castOutOfCombat: «неизвестное заклинание» вместо ветки;
//   D-COMBAT-6 — тот же отказ вместо «внебоевое заклинание»;
//   D-FORMULA-7 — S.decadanceLevels отсутствует;
//   D-TELEPORT-8 — L.deepDescendFloor отсутствует;
//   D-REFUSE-9 — тот же отказ вместо memoryBanned/levels-гардов.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const D = require('../src/dungeon.js');
const M = require('../src/map.js');
const { createCharacter } = require('../src/player.js');
const { createCombat } = require('../src/combat.js');
const { validate } = require('./json-schema.js');

const ROOT = path.join(__dirname, '..');
const SPELL_FILE = path.join(ROOT, 'assets', 'spells', 'decadance.json');
const SCROLL_FILE = path.join(ROOT, 'assets', 'items', '000764.json');
const SPELL_ICON = path.join(ROOT, 'assets', 'spell-icons', 'decadance.svg');
const SCROLL_ICON = path.join(
  ROOT, 'assets', 'sprites', 'items', 'decadance_scroll.svg');
const SPELLS_DIR = path.join(ROOT, 'assets', 'spells');
const SPELL_SCHEMA = JSON.parse(
  fs.readFileSync(path.join(SPELLS_DIR, 'schema.json'), 'utf8'));
const ITEM_SCHEMA = JSON.parse(fs.readFileSync(
  path.join(ROOT, 'assets', 'items', 'schema.json'), 'utf8'));

const MANA = 13;
const KEY_ORDER = ['id', 'название', 'школа', 'база', 'степень', 'атрибут',
  'уровень', 'мани', 'действие', 'вне_боя', 'предметы', 'здания',
  'описание', 'icon', 'icon_prompt'];

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}
function loadSpellsData() { return require('../src/spells-data.js'); }
function loadSpells() { return require('../src/spells.js'); }
function loadLocations() { return require('../src/locations.js'); }

function spellHero({ spells, intelligence = 1, mp = 30, level = 3 } = {}) {
  const p = createCharacter();
  p.primary.intelligence = intelligence;
  p.level = level;
  p.mp = mp;
  p.spells = spells.slice();
  return p;
}
function soloCombat(p, mobId = 'wolf') {
  const c = createCombat({ player: p, mobs: [mobId], mobLevel: 2, seed: 5 });
  const u = c.units[0];
  u.x = c.px; u.y = c.py - 1;
  return c;
}

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

// --- D-JSON-1: файл заклинания — схема, slug-шейп, порядок ключей, roundtrip ---

test('D-JSON-1: assets/spells/decadance.json — есть, схема чиста, basename==id+.json, порядок ключей shadow_step, roundtrip-канон, поля по коридорам тени lvl3', () => {
  assert.ok(fs.existsSync(SPELL_FILE),
    'RED: файл assets/spells/decadance.json отсутствует');
  const raw = fs.readFileSync(SPELL_FILE, 'utf8');
  const s = JSON.parse(raw);
  const errors = [];
  validate(SPELL_SCHEMA, s, 'decadance.json', errors);
  assert.deepEqual(errors, [], 'схема каталога spells: ' +
    JSON.stringify(errors));
  assert.equal(s.id, 'decadance');
  assert.equal('decadance.json', path.basename(SPELL_FILE),
    'slug-шейп spells (000318.05): basename === id + ".json"');
  assert.deepEqual(Object.keys(s), KEY_ORDER,
    'порядок ключей — как shadow_step/way_down');
  assert.equal(JSON.stringify(s, null, 2) + '\n', raw,
    'roundtrip-канон: JSON.stringify(obj,null,2) + "\\n"');
  assert.equal(s['название'], 'Декаданс');
  assert.equal(s['школа'], 'тень');
  assert.equal(s['атрибут'], 'intelligence');
  assert.equal(s['степень'], 1);
  assert.equal(s['уровень'], 3);
  assert.equal(s['мани'], MANA, 'полоса L3 (10..15), соседи despair 11 / shadow_wraith 14');
  assert.equal(s['действие'], 'телепорт',
    'мгновенный телепорт: боевой отказ бесплатен, parameters.days НЕ нужен');
  assert.equal(s['вне_боя'], true);
  assert.ok(!('параметры' in s),
    'мгновенное (прецедент shadow_step): блока «параметры» нет');
  assert.deepEqual(s['здания'], ['assets/buildings/mage_tower.json'],
    'магазин магов — mage_tower (как все тени каталога)');
});

// --- D-SWEEP-2: уникальность id/имени + единственность файла ---

test('D-SWEEP-2: в каталоге spells ровно один decadance; id/имя не пересекаются с остальными записями', () => {
  assert.ok(fs.existsSync(SPELL_FILE), 'RED: файл заклинания отсутствует');
  const s = readJson(SPELL_FILE);
  const files = fs.readdirSync(SPELLS_DIR)
    .filter((f) => f.endsWith('.json') && f !== 'schema.json');
  const ids = [];
  const names = [];
  for (const f of files) {
    if (f === 'decadance.json') continue;
    const o = readJson(path.join(SPELLS_DIR, f));
    ids.push(o.id);
    names.push(o['название']);
  }
  assert.ok(!ids.includes('decadance'),
    'id «decadance» не занят другим файлом');
  assert.ok(!names.includes('Декаданс'),
    'имя «Декаданс» не занято другой записью');
  assert.equal(files.filter((f) => f === 'decadance.json').length, 1,
    'ровно один файл decadance.json');
});

// --- D-SCROLL-3: свиток-спутник 000764 ---

test('D-SCROLL-3: assets/items/000764.json — spell_scroll decadance_scroll, effect.spell=«decadance» (ID), value 115 / tier 3, desc-канон, base_price=115 (ре-пин 000347.02: E1 — base_price=value у всех spell_scroll); связан со спеллом; иконки на месте', () => {
  assert.ok(fs.existsSync(SCROLL_FILE),
    'RED: файл assets/items/000764.json отсутствует');
  const it = readJson(SCROLL_FILE);
  const errors = [];
  validate(ITEM_SCHEMA, it, '000764.json', errors);
  assert.deepEqual(errors, [], 'схема каталога items: ' +
    JSON.stringify(errors));
  assert.equal(it.id, 'decadance_scroll');
  assert.equal(it.kind, 'spell_scroll');
  assert.deepEqual(it.effect, { kind: 'spell', spell: 'decadance' },
    'effect.spell — ID заклинания (контракт 000327), не путь');
  assert.equal(it.value, 115, 'lvl3-свитки тень: night_strike/nightmare/shroud_of_night = 115');
  assert.equal(it.tier, 3);
  assert.equal(it.weight, 0.2);
  assert.equal(it.base_price, 115,
    'base_price = value=115 (ре-пин 000347.02: E1 — у ВСЕХ spell_scroll '
    + 'base_price=value; и сам свиток теперь продаётся — жрица луны, '
    + 'школа тень; навигационный прецедент way_up/way_down тоже '
    + 'перепинен dungeon-nav-spells-000333)');
  assert.equal(it.desc,
    'Свиток: изучает «Декаданс» (нужен ранг школы.)',
    'desc-канон каталога свитков (точка ВНУТРИ скобки)');
  const s = readJson(SPELL_FILE);
  assert.ok(s['предметы'].includes('assets/items/000764.json'),
    'спелл ссылается на свиток-спутник');
  assert.equal(it.icon, 'assets/sprites/items/decadance_scroll.svg');
  assert.ok(fs.existsSync(SCROLL_ICON), 'RED: спрайт свитка отсутствует');
  assert.ok(fs.existsSync(SPELL_ICON), 'RED: иконка заклинания отсутствует');
});

// --- D-MIRROR-4: зеркала (перегенерация sync-скриптами) ---

test('D-MIRROR-4: зеркала — SPELLS_BY_ID.decadance ≡ JSON (лексикографическая позиция), ITEMS включает decadance_scroll', () => {
  const dataMod = loadSpellsData();
  assert.ok(dataMod.SPELLS_BY_ID.decadance,
    'RED: decadance отсутствует в зеркале src/spells-data.js (нужен node scripts/sync-spells-data.js)');
  const s = readJson(SPELL_FILE);
  const m = dataMod.SPELLS_BY_ID.decadance;
  const expected = Object.assign({}, s);
  expected['предметы'] = ['decadance_scroll'];
  expected['здания'] = [18];
  assert.equal(expected['здания'][0],
    readJson(path.join(ROOT, 'assets', 'buildings', 'mage_tower.json')).id,
    'фикстура: mage_tower → id 18 (число-цель REF-резолва)');
  assert.deepEqual(m, expected,
    'зеркало спеллов — JSON с REF-резолвом sync (контракт 000318: '
    + 'предметы/здания → цели-id, остальные поля 1-в-1)');
  const ids = dataMod.SPELLS.map((x) => x.id);
  assert.equal(ids.filter((x) => x === 'decadance').length, 1);
  const at = ids.indexOf('decadance');
  assert.ok(at > 0, 'запись в зеркале не первая');
  assert.equal(ids[at - 1], 'dark_presence',
    'lex по id: между dark_presence и deep_freeze');
  assert.equal(ids[at + 1], 'deep_freeze');
  const itemsMod = require('../src/items-data.js');
  const scroll = itemsMod.ITEMS.find((x) => x.id === 'decadance_scroll');
  assert.ok(scroll,
    'RED: decadance_scroll отсутствует в зеркале src/items-data.js (нужен node scripts/sync-items-data.js)');
  assert.deepEqual(scroll, readJson(SCROLL_FILE),
    'зеркало предмета — точная копия JSON');
});

// --- D-CTX-5: гейт контекста — книга вне боя (4 контекста) ---

test('D-CTX-5: castOutOfCombat decadance — подземелье ок (мана −13, записей НЕТ, мгновенное); без колбэка (карта) / отказ колбэка (город) — ДО маны; повтор в тот же день разрешён', () => {
  const dataMod = loadSpellsData();
  assert.ok(dataMod.SPELLS_BY_ID.decadance,
    'RED: decadance отсутствует в каталоге/зеркале');
  const { castOutOfCombat } = loadSpells();
  const p = spellHero({ spells: ['decadance'], intelligence: 10, mp: 30 });
  let calls = 0;
  const ok = (id) => { calls += 1; return { ok: true }; };
  const r = castOutOfCombat(p, 'decadance', 5, { decadance: ok });
  assert.equal(r.ok, true, 'подземелье: каст ок; reason: ' + r.reason);
  assert.equal(calls, 1, 'колбэк вызван ровно 1 раз');
  assert.equal(r.expiresDay, null,
    'мгновенное: expiresDay null (прецедент shadow_step)');
  assert.equal(p.mp, 30 - MANA, 'мана списана ровно 13');
  assert.equal(p.outOfCombatEffects, undefined,
    'записей outOfCombatEffects НЕТ (мгновенный телепорт)');
  const r2 = castOutOfCombat(p, 'decadance', 5, { decadance: ok });
  assert.equal(r2.ok, true, 'повторный каст в тот же день разрешён (кулдаунов нет)');
  assert.equal(p.mp, 30 - 2 * MANA);
  assert.equal(p.outOfCombatEffects, undefined);
  p.mp = 30;
  const before = p.mp;
  const rMap = castOutOfCombat(p, 'decadance', 5, {});
  assert.equal(rMap.ok, false, 'карта (ctx без decadance) — отказ');
  assert.equal(rMap.reason, 'не здесь');
  assert.equal(p.mp, before, 'мана НЕ тронута ДО колбэка (fail-closed)');
  const rCity = castOutOfCombat(p, 'decadance', 5, {
    decadance: () => ({ ok: false, reason: 'не здесь' }),
  });
  assert.equal(rCity.ok, false, 'город (тот же экран, kind!==dungeon) — отказ');
  assert.equal(rCity.reason, 'не здесь');
  assert.equal(p.mp, before, 'город: мана НЕ тронута');
  assert.equal(p.outOfCombatEffects, undefined, 'записей по-прежнему НЕТ');
  const poor = spellHero({ spells: ['decadance'], intelligence: 10, mp: 5 });
  let poorCalls = 0;
  const rPoor = castOutOfCombat(poor, 'decadance', 5, {
    decadance: () => { poorCalls += 1; return { ok: true }; },
  });
  assert.equal(rPoor.ok, false, 'не хватает маны');
  assert.equal(rPoor.reason, 'не хватает маны');
  assert.equal(poorCalls, 0, 'гейт маны РАНЬШЕ колбэка (прецедент N-CAST-4)');
});

// --- D-COMBAT-6: бой — отказ «внебоевое заклинание» (действие «телепорт») ---

test('D-COMBAT-6: в бою canCastSpell/castSpell decadance → «внебоевое заклинание» ДО расхода маны/пула (OUT_OF_COMBAT по действию)', () => {
  const dataMod = loadSpellsData();
  assert.ok(dataMod.SPELLS_BY_ID.decadance,
    'RED: decadance отсутствует в каталоге/зеркале');
  const { castSpell, canCastSpell } = loadSpells();
  const p = spellHero({ spells: ['decadance'], intelligence: 20, mp: 30 });
  const c = soloCombat(p, 'wolf');
  const poolBefore = c.ps.spellInt;
  const mirror = canCastSpell(c, 'decadance');
  const core = castSpell(c, 'decadance');
  assert.equal(core.ok, false, 'в бою декаданс не кастуется');
  assert.equal(core.reason, 'внебоевое заклинание',
    'гейт по действию «телепорт» (OUT_OF_COMBAT 000235.01); факт: «'
    + core.reason + '»');
  assert.equal(mirror.ok, false, 'зеркало: тот же отказ');
  assert.equal(mirror.reason, core.reason, 'зеркало: одна причина');
  assert.equal(c.ps.spellInt, poolBefore, 'пул Интеллекта не тронут');
  assert.equal(p.mp, 30, 'мана не тронута');
});

// --- D-FORMULA-7: формула глубины — 5 + floor(Интеллект/10) ---

test('D-FORMULA-7: Spells.decadanceLevels — 5 + Math.floor(инт/10): границы 0/9→5, 10/19→6, 20/29→7, 30/39→8, 40→9, undefined→5', () => {
  const S = loadSpells();
  assert.equal(typeof S.decadanceLevels, 'function',
    'RED: экспорт decadanceLevels в src/spells.js отсутствует');
  const cases = [[0, 5], [9, 5], [10, 6], [19, 6], [20, 7], [29, 7],
    [30, 8], [39, 8], [40, 9], [55, 10]];
  for (const [int, want] of cases) {
    assert.equal(S.decadanceLevels(int), want,
      'Интеллект ' + int + ' → ' + want + ' (пол CONVENTION floor)');
  }
  assert.equal(S.decadanceLevels(undefined), 5,
    'отсутствующий стат → 5 (гард ||0, прецедент efir.js ||0)');
  assert.equal(S.decadanceLevels(9.9), 5, 'дробный Интеллект — floor');
});

// --- D-TELEPORT-8: deepDescendFloor — легальный многоярусный спуск ---

function makeFloorGame() {
  return {
    DUNGEON_NAMES: D.DUNGEON_NAMES,
    CELL_FLOOR: D.CELL_FLOOR,
    CELL_WALL: D.CELL_WALL,
    mobFootprint: D.mobFootprint,
    createDungeon: D.createDungeon,
    dungeonMemoryKey: D.dungeonMemoryKey,
    contentValid: D.contentValid,
    generateDungeonContents: D.generateDungeonContents,
  };
}

test('D-TELEPORT-8: L.deepDescendFloor — спуск на levels этажей: глубина depth+levels, спавн на entrance цели, память СТАРОГО этажа записана, REUSE памяти цели, промежуточные НЕ записаны, день не тронут', () => {
  const L = loadLocations();
  assert.equal(typeof L.deepDescendFloor, 'function',
    'RED: экспорт deepDescendFloor в src/locations.js отсутствует');
  const G = makeFloorGame();
  const PX = M.syntheticPixels(8, 8, 128, 128, 128, 255);
  const d1 = D.createDungeon(37, -12, PX, M.TERRAIN.GRASS, 1);
  const contents1 = { seed: 4242, mobs: [], chests: [], createdAtXp: 0,
    step: 0 };
  const sentinel = { seed: 777, mobs: [], chests: [], createdAtXp: 0,
    step: 0 };
  const memory = new Map();
  const targetKey = D.dungeonMemoryKey('37,-12', 7);
  memory.set(targetKey, { contents: sentinel, lastVisitDay: 9 });
  withGame(G, () => {
    const ds1 = L.makeDungeonState(d1, contents1, '37,-12',
      { intervalMs: 420 });
    const ctx = {
      map: { tileAt: () => ({ terrain: M.TERRAIN.GRASS }) },
      mapPixels: PX,
      player: { x: 37, y: -12 },
      hero: { totalXp: 0, level: 3, primary: { intelligence: 10 } },
      day: 10,
      memory,
      intervalMs: 420,
    };
    const levels = 6;
    const ds2 = L.deepDescendFloor(ds1, ctx, levels);
    assert.ok(ds2, 'RED: deepDescendFloor вернул null на легальном входе');
    assert.equal(ds2.kind, 'dungeon');
    assert.equal(ds2.dg.depth, 1 + levels,
      'целевая глубина = текущая + levels');
    assert.equal(ds2.x, ds2.dg.entrance.x,
      'спавн — на entrance-клетке («вход в подземелье на глубине N»)');
    assert.equal(ds2.y, ds2.dg.entrance.y);
    assert.equal(ds2.dg.cells[ds2.dg.entrance.y * ds2.dg.width
      + ds2.dg.entrance.x], D.CELL_FLOOR);
    const mobOnEntrance = (ds2.contents.mobs || []).some(
      (m) => !m.defeated && m.x === ds2.x && m.y === ds2.y);
    assert.equal(mobOnEntrance, false,
      'safe-зона: живого моба на спавне нет');
    assert.equal(ds2.contents, sentinel,
      'посещённая память целевого этажа — REUSE live-объекта');
    assert.deepEqual(ds2.log, ['Декаданс: глубина 7.'],
      'log нового этажа — строка «Декаданс: глубина N.»');
    const oldKey = D.dungeonMemoryKey('37,-12', 1);
    assert.deepEqual(memory.get(oldKey),
      { contents: contents1, lastVisitDay: 10 },
      'память СТАРОГО этажа записана ДО сборки нового (инвариант descendFloor)');
    assert.deepEqual([...memory.keys()].sort(),
      [oldKey, targetKey].sort(),
      'промежуточные глубины 2..6 НЕ записаны (этажи не покидались)');
    assert.equal(memory.get(targetKey).lastVisitDay, 10,
      'saved.lastVisitDay цели продлён (как при обычном переходе)');
    assert.equal(ctx.day, 10, 'день не тронут (clock не вызывается)');
    assert.equal(ds1.dg.depth, 1, 'старый этаж не мутирован');
  });
});

// --- D-REFUSE-9: доменные отказы — memoryBanned, невалидные levels, город ---

test('D-REFUSE-9: deepDescendFloor — memoryBanned → null + console.error + 0 мутаций памяти; levels 0/1.5/«x» → null; город → null', () => {
  const L = loadLocations();
  assert.equal(typeof L.deepDescendFloor, 'function',
    'RED: экспорт deepDescendFloor отсутствует');
  const G = makeFloorGame();
  const PX = M.syntheticPixels(8, 8, 128, 128, 128, 255);
  const d1 = D.createDungeon(37, -12, PX, M.TERRAIN.GRASS, 1);
  const contents1 = { seed: 4242, mobs: [], chests: [], createdAtXp: 0,
    step: 0 };
  withGame(G, () => {
    const ds1 = L.makeDungeonState(d1, contents1, '37,-12',
      { intervalMs: 420 });
    ds1.memoryBanned = true;
    const memory = new Map();
    const ctx = {
      map: { tileAt: () => ({ terrain: M.TERRAIN.GRASS }) },
      mapPixels: PX,
      player: { x: 37, y: -12 },
      hero: { totalXp: 0, level: 3, primary: { intelligence: 10 } },
      day: 10,
      memory,
      intervalMs: 420,
    };
    const origErr = console.error;
    let errs = 0;
    console.error = () => { errs += 1; };
    let r;
    try {
      r = L.deepDescendFloor(ds1, ctx, 6);
    } finally {
      console.error = origErr;
    }
    assert.equal(r, null,
      'debug-вход (memoryBanned) — отказ (D12 descendFloor)');
    assert.equal(errs, 1, 'console.error ровно 1 (паттерн D12)');
    assert.equal(memory.size, 0, 'память не контаминирована');
    assert.equal(L.deepDescendFloor(Object.assign(
      L.makeDungeonState(d1, contents1, '37,-12', { intervalMs: 420 }),
      {}), ctx, 0), null, 'levels 0 → null');
    assert.equal(L.deepDescendFloor(L.makeDungeonState(d1, contents1,
      '37,-12', { intervalMs: 420 }), ctx, 1.5), null,
    'дробный levels → null');
    assert.equal(L.deepDescendFloor(L.makeDungeonState(d1, contents1,
      '37,-12', { intervalMs: 420 }), ctx, 'x'), null,
    'не-числовой levels → null');
    const city = L.makeCityState(C_fakeLayout(),
      { название: 'Тестгород', размер: { ширина: 5 } }, '100,-40',
      { intervalMs: 420 });
    assert.equal(L.deepDescendFloor(city, ctx, 6), null,
      'город (kind!==dungeon) → null');
    assert.equal(L.deepDescendFloor(null, ctx, 6), null,
      'null ds → null');
  });
});

function C_fakeLayout() {
  return {
    width: 5, height: 5,
    entrance: { x: 2, y: 4 },
    exit: { x: 2, y: 4 },
    cells: new Array(25).fill(D.CELL_FLOOR),
  };
}

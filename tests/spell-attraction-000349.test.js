// Задача 000349 — заклинание школы природы «Притяжение» (attraction): сбор
// лута по площади. Профиль-прецедент 000348 (decadance): формула
// 5 + Math.floor(Интеллект/10) (конвенция floor — decadanceLevels),
// применение на глобальной карте, в пещерах и подземельях
// (dungeonState.kind === 'dungeon' — пещеры и подземелья один домен,
// типы CAVE/CRYPT/RUINS/DROWNED/ABYSS); город (kind==='city') и отсутствие
// контекста — отказ ДО списания маны. Сбор = эквивалент ручного подбора
// каждой сущности: мир — пайплайн 000158.04 (addItem → collectedLoot.set
// ('x,y', день) → сейв), сундуки — 000127/000186 (openChest →
// applyDungeonChest: золото всегда, предмет → addItem, overflow →
// авто-золото, ds.log «Сундук: …»), залежи — 000157.03 (gatherDeposit
// с canFit-гейтом: «не влезает» → ноль мутаций, залежь остаётся).
// День НЕ тратится (clock не дёргается), записей outOfCombatEffects НЕТ
// (мгновенное, действие «телепорт»).
//
// Фиксированные решения (memory/000349-spell-attraction.md):
//   * F1: пустой радиус → БЕСПЛАТНЫЙ отказ «нечего собирать» (до маны);
//     цели есть, но 0 успешных мутаций → «не влезает в инвентарь» (тоже
//     до маны); инвариант «отказ ⇒ 0 мутаций».
//   * F2: атрибут JSON = wisdom (инвариант SCHOOL_ATTR природа=wisdom);
//     ФОРМУЛА читает hero.primary.intelligence напрямую (ТЗ
//     «Интеллект/10»).
//   * F3: достижимость — НЕ простой радиус: мир — оконный BFS 4-соседства
//     по map.tileAt().passable (террейн ∩ ¬footprint-стена, map.js) с
//     окном Чебышёва ≤ radius; подземелье — G.reachableFrom (dungeon.js,
//     единый источник) ∩ окно. Респавн-невидимый лут (collectedLoot) не
//     берётся (G.lootVisible).
//   * Свиток НЕ создаётся (контракта «каждый спелл имеет свиток» нет) —
//     learnability = здания healing_temple (21) + mountain_temple (38);
//     items/зеркало items-data 0-diff.
//
// КРАСНЫЕ до реализации (осмысленные ERR_ASSERTION, без краха загрузки):
//   A-JSON-1 — файла нет / схема / slug-шейп / порядок ключей / roundtrip;
//   A-SWEEP-2 — записи нет в каталоге; коллизий id/имени нет и в RED
//     (guard-пин — ловит будущую коллизию); иконки нет / не уникальна;
//   A-MIRROR-3 — записи нет в зеркале spells-data (items — НЕ двигается);
//   A-CTX-4 — castOutOfCombat: «неизвестное заклинание» вместо ветки;
//   A-COMBAT-5 — тот же отказ вместо «внебоевое заклинание»;
//   A-FORMULA-6 — Spells.attractionRadius отсутствует;
//   A-REACH-7 — L.worldLootTargets / L.dungeonLootTargets отсутствуют;
//   A-E2E-WORLD-8 / A-E2E-DUNGEON-9 / A-E2E-REFUSE-10 — строки «attraction»
//     нет в книге (запись не в каталоге) — boot load-clean проходит.
//
// Харнес e2e — дубль tests/spellbook-oc-e2e.test.js (000235.02, сам
// дублирует tests/dungeon-info-window.test.js): самодостаточная
// full-chain vm-песочница — CHAIN из index.html (динамический),
// Proxy-DOM makeEl, WebGL/Image-стабы, performance.now() заморожен на
// NOW=1000. Дублирование харнессов принято (000083/000087).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const D = require('../src/dungeon.js');
const { createCharacter } = require('../src/player.js');
const { createCombat } = require('../src/combat.js');
const { validate } = require('./json-schema.js');
const ItemsNode = require('../src/items.js');
const MapNode = require('../src/map.js');
const { decodePng } = require('./png.js');
const SNode = require('../src/save.js');

const ROOT = path.join(__dirname, '..');
const SPELL_FILE = path.join(ROOT, 'assets', 'spells', 'attraction.json');
const SPELL_ICON = path.join(ROOT, 'assets', 'spell-icons', 'attraction.svg');
const SPELLS_DIR = path.join(ROOT, 'assets', 'spells');
const ICONS_DIR = path.join(ROOT, 'assets', 'spell-icons');
const SPELL_SCHEMA = JSON.parse(
  fs.readFileSync(path.join(SPELLS_DIR, 'schema.json'), 'utf8'));

const MANA = 13;
const KEY_ORDER = ['id', 'название', 'школа', 'база', 'степень', 'атрибут',
  'уровень', 'мани', 'действие', 'вне_боя', 'здания',
  'описание', 'icon', 'icon_prompt'];
const DESC = 'Притяжение: глобальная карта, пещеры и подземелья — мгновенно '
  + 'собирает весь видимый лут (предметы, сундуки, залежи) в радиусе '
  + '5 + Интеллект/10 тайлов, только достижимый. Не здесь, нечего собирать '
  + 'или не влезает в инвентарь — заклинание не расходуется.';

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}
function loadSpellsData() { return require('../src/spells-data.js'); }
function loadSpells() { return require('../src/spells.js'); }
function loadLocations() { return require('../src/locations.js'); }

function spellHero({ spells, intelligence = 10, mp = 30, level = 3 } = {}) {
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

// =====================================================================
// A-JSON-1 — файл заклинания: схема, slug-шейп, порядок ключей, roundtrip
// =====================================================================

test('A-JSON-1: assets/spells/attraction.json — есть, схема чиста, basename==id+.json, порядок ключей (decadance-шейп БЕЗ «предметы»), roundtrip-канон, поля по коридорам природы lvl3', () => {
  assert.ok(fs.existsSync(SPELL_FILE),
    'RED: файл assets/spells/attraction.json отсутствует');
  const raw = fs.readFileSync(SPELL_FILE, 'utf8');
  const s = JSON.parse(raw);
  const errors = [];
  validate(SPELL_SCHEMA, s, 'attraction.json', errors);
  assert.deepEqual(errors, [], 'схема каталога spells: '
    + JSON.stringify(errors));
  assert.equal(s.id, 'attraction');
  assert.equal('attraction.json', path.basename(SPELL_FILE),
    'slug-шейп spells (000318.05): basename === id + ".json"');
  assert.deepEqual(Object.keys(s), KEY_ORDER,
    'порядок ключей — decadance (000348) БЕЗ «предметы» (свитка нет)');
  assert.equal(JSON.stringify(s, null, 2) + '\n', raw,
    'roundtrip-канон: JSON.stringify(obj,null,2) + "\\n"');
  assert.equal(s['название'], 'Притяжение');
  assert.equal(s['школа'], 'природа');
  assert.equal(s['атрибут'], 'wisdom',
    'инвариант SCHOOL_ATTR: природа = wisdom (spells.test.js); '
    + 'формула радиуса при этом читает intelligence (ТЗ, F2)');
  assert.equal(s['степень'], 1);
  assert.equal(s['уровень'], 3);
  assert.equal(s['мани'], MANA,
    'полоса L3 (10..15), profile decadance 3/13; соседи природы: '
    + 'root_grasp 12, vitality 13, path_of_vines 15');
  assert.equal(s['действие'], 'телепорт',
    'мгновенное внебоевое без параметров (прецедент decadance): '
    + 'боевой отказ бесплатен, days НЕ нужен');
  assert.equal(s['вне_боя'], true);
  assert.ok(!('параметры' in s),
    'мгновенное (гейт W-03: телепорт — без параметров)');
  assert.ok(!('предметы' in s),
    'свитка нет — КЛЮЧА «предметы» нет вообще (зеркало доверительное)');
  assert.equal(s['база'], null);
  assert.deepEqual(s['здания'], [
    'assets/buildings/healing_temple.json',
    'assets/buildings/mountain_temple.json',
  ], 'learnability без свитка — храмы природы: healing_temple (21) + '
    + 'mountain_temple (38)');
  assert.equal(s['описание'], DESC);
  assert.equal(s['icon'], 'assets/spell-icons/attraction.svg');
});

// =====================================================================
// A-SWEEP-2 — уникальность id/имени + иконка (sha256-уникальна)
// =====================================================================

test('A-SWEEP-2: в каталоге spells ровно один attraction; id/имя не пересекаются с остальными; иконка есть, 24×24/#e8dcc0, sha256 уникальна', () => {
  assert.ok(fs.existsSync(SPELL_FILE), 'RED: файл заклинания отсутствует');
  const s = readJson(SPELL_FILE);
  const files = fs.readdirSync(SPELLS_DIR)
    .filter((f) => f.endsWith('.json') && f !== 'schema.json');
  const ids = [];
  const names = [];
  for (const f of files) {
    if (f === 'attraction.json') continue;
    const o = readJson(path.join(SPELLS_DIR, f));
    ids.push(o.id);
    names.push(o['название']);
  }
  assert.ok(!ids.includes('attraction'),
    'id «attraction» не занят другим файлом');
  assert.ok(!names.includes('Притяжение'),
    'имя «Притяжение» не занято другой записью');
  assert.equal(files.filter((f) => f === 'attraction.json').length, 1,
    'ровно один файл attraction.json');
  assert.ok(fs.existsSync(SPELL_ICON),
    'RED: иконка assets/spell-icons/attraction.svg отсутствует');
  const svg = fs.readFileSync(SPELL_ICON, 'utf8');
  assert.ok(svg.includes('xmlns="http://www.w3.org/2000/svg"'),
    'иконка — валидный SVG с xmlns');
  assert.ok(svg.includes('width="24"') && svg.includes('height="24"'),
    'иконка 24×24 (формат spell-icons)');
  assert.ok(/viewBox="0 0 24 24"/.test(svg), 'viewBox 0 0 24 24');
  assert.ok(svg.includes('#e8dcc0'), 'заливка #e8dcc0 (палитра карточек)');
  assert.ok(!/NaN|undefined/.test(svg), 'нет NaN/undefined в разметке');
  const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
  const mine = sha(fs.readFileSync(SPELL_ICON));
  for (const f of fs.readdirSync(ICONS_DIR)) {
    if (f === 'attraction.svg') continue;
    assert.notEqual(sha(fs.readFileSync(path.join(ICONS_DIR, f))), mine,
      'sha256-уникальность иконки (sweep svg.test W-05): совпала с ' + f);
  }
  assert.equal(s.icon, 'assets/spell-icons/attraction.svg');
});

// =====================================================================
// A-MIRROR-3 — зеркало spells-data (резолв refs, лекс. позиция); items —
// НЕ двигается (свитка нет)
// =====================================================================

test('A-MIRROR-3: зеркало — SPELLS_BY_ID.attraction ≡ JSON (здания→[21,38], база null, без «предметы»), лексикографическая позиция, items 0-diff (attraction_scroll НЕ создан)', () => {
  const dataMod = loadSpellsData();
  assert.ok(dataMod.SPELLS_BY_ID.attraction,
    'RED: attraction отсутствует в зеркале src/spells-data.js '
    + '(нужен node scripts/sync-spells-data.js в том же коммите)');
  assert.ok(fs.existsSync(SPELL_FILE), 'RED: файл заклинания отсутствует');
  const s = readJson(SPELL_FILE);
  const m = dataMod.SPELLS_BY_ID.attraction;
  const expected = Object.assign({}, s);
  expected['здания'] = [
    readJson(path.join(ROOT, 'assets', 'buildings',
      'healing_temple.json')).id,
    readJson(path.join(ROOT, 'assets', 'buildings',
      'mountain_temple.json')).id,
  ];
  assert.deepEqual(expected['здания'], [21, 38],
    'фикстура: healing_temple → 21, mountain_temple → 38');
  assert.deepEqual(m, expected,
    'зеркало спеллов — JSON с REF-резолвом sync (контракт 000318: '
    + 'здания → цели-id, база null сохраняется, остальные поля 1-в-1; '
    + 'ключ «вне_боя» переезжает в конец — резолвится формой выше)');
  const ids = dataMod.SPELLS.map((x) => x.id);
  assert.equal(ids.filter((x) => x === 'attraction').length, 1);
  const at = ids.indexOf('attraction');
  assert.ok(at > 0, 'запись в зеркале не первая');
  assert.equal(ids[at - 1], 'ashen_debilitation',
    'lex по id: между ashen_debilitation и aura_of_protection');
  assert.equal(ids[at + 1], 'aura_of_protection');
  const itemsMod = require('../src/items-data.js');
  assert.ok(!itemsMod.ITEMS.some((x) => x.id === 'attraction'
      || x.id === 'attraction_scroll'),
    'items 0-diff: свиток attraction_scroll НЕ создавался (бриф)');
});

// =====================================================================
// A-CTX-4 — castOutOfCombat: ветка attraction (прецедент decadance)
// =====================================================================

test('A-CTX-4: castOutOfCombat attraction — успех колбэка (мана −13 РОВНО, записей НЕТ, expiresDay null, повтор разрешён); без колбэка / «нечего собирать» / «не влезает» — ДО маны; mp<13 — колбэк НЕ вызван', () => {
  const dataMod = loadSpellsData();
  assert.ok(dataMod.SPELLS_BY_ID.attraction,
    'RED: attraction отсутствует в каталоге/зеркале');
  const { castOutOfCombat } = loadSpells();
  const p = spellHero({ spells: ['attraction'], intelligence: 10, mp: 30 });
  let calls = 0;
  const ok = () => { calls += 1; return { ok: true }; };
  const r = castOutOfCombat(p, 'attraction', 5, { attraction: ok });
  assert.equal(r.ok, true, 'мир/подземелье: каст ок; reason: ' + r.reason);
  assert.equal(calls, 1, 'колбэк вызван ровно 1 раз');
  assert.equal(r.expiresDay, null,
    'мгновенное: expiresDay null (прецедент decadance/shadow_step)');
  assert.equal(p.mp, 30 - MANA, 'мана списана ровно 13');
  assert.equal(p.outOfCombatEffects, undefined,
    'записей outOfCombatEffects НЕТ (мгновенный сбор, не эффект)');
  const r2 = castOutOfCombat(p, 'attraction', 5, { attraction: ok });
  assert.equal(r2.ok, true,
    'повторный каст в тот же день разрешён (кулдаунов нет)');
  assert.equal(p.mp, 30 - 2 * MANA);
  assert.equal(p.outOfCombatEffects, undefined);
  p.mp = 30;
  const before = p.mp;
  const rMap = castOutOfCombat(p, 'attraction', 5, {});
  assert.equal(rMap.ok, false, 'ctx без callback — отказ');
  assert.equal(rMap.reason, 'не здесь');
  assert.equal(p.mp, before, 'мана НЕ тронута ДО колбэка (fail-closed)');
  const rEmpty = castOutOfCombat(p, 'attraction', 5, {
    attraction: () => ({ ok: false, reason: 'нечего собирать' }),
  });
  assert.equal(rEmpty.ok, false, 'пустой радиус (F1) — отказ');
  assert.equal(rEmpty.reason, 'нечего собирать');
  assert.equal(p.mp, before, 'F1: «нечего собирать» — мана НЕ тронута');
  const rFit = castOutOfCombat(p, 'attraction', 5, {
    attraction: () => ({ ok: false, reason: 'не влезает в инвентарь' }),
  });
  assert.equal(rFit.ok, false, 'цели не влезают — отказ');
  assert.equal(rFit.reason, 'не влезает в инвентарь');
  assert.equal(p.mp, before, 'отказ по инвентарю — мана НЕ тронута');
  assert.equal(p.outOfCombatEffects, undefined, 'записей по-прежнему НЕТ');
  const poor = spellHero({ spells: ['attraction'], intelligence: 10,
    mp: MANA - 1 });
  let poorCalls = 0;
  const rPoor = castOutOfCombat(poor, 'attraction', 5, {
    attraction: () => { poorCalls += 1; return { ok: true }; },
  });
  assert.equal(rPoor.ok, false, 'не хватает маны');
  assert.equal(rPoor.reason, 'не хватает маны');
  assert.equal(poorCalls, 0, 'гейт маны РАНЬШЕ колбэка (N-CAST-4)');
});

// =====================================================================
// A-COMBAT-5 — бой: отказ «внебоевое заклинание» ДО пула/маны
// =====================================================================

test('A-COMBAT-5: в бою canCastSpell/castSpell attraction → «внебоевое заклинание» ДО расхода маны/пула (OUT_OF_COMBAT по действию «телепорт»)', () => {
  const dataMod = loadSpellsData();
  assert.ok(dataMod.SPELLS_BY_ID.attraction,
    'RED: attraction отсутствует в каталоге/зеркале');
  const { castSpell, canCastSpell } = loadSpells();
  const p = spellHero({ spells: ['attraction'], intelligence: 20, mp: 30 });
  const c = soloCombat(p, 'wolf');
  const poolBefore = c.ps.spellInt;
  const mirror = canCastSpell(c, 'attraction');
  const core = castSpell(c, 'attraction');
  assert.equal(core.ok, false, 'в бою притяжение не кастуется');
  assert.equal(core.reason, 'внебоевое заклинание',
    'гейт по действию «телепорт» (OUT_OF_COMBAT 000235.01); факт: «'
    + core.reason + '»');
  assert.equal(mirror.ok, false, 'зеркало: тот же отказ');
  assert.equal(mirror.reason, core.reason, 'зеркало: одна причина');
  assert.equal(c.ps.spellInt, poolBefore, 'пул Интеллекта не тронут');
  assert.equal(p.mp, 30, 'мана не тронута');
});

// =====================================================================
// A-FORMULA-6 — attractionRadius: 5 + floor(Инт/10)
// =====================================================================

test('A-FORMULA-6: Spells.attractionRadius — 5 + Math.floor(инт/10): границы 0/9→5, 10/19→6, 20/29→7, 30/39→8, 40/49→9, 50/55→10; undefined→5; 9.9→5', () => {
  const S = loadSpells();
  assert.equal(typeof S.attractionRadius, 'function',
    'RED: экспорт attractionRadius в src/spells.js отсутствует');
  const cases = [[0, 5], [9, 5], [10, 6], [19, 6], [20, 7], [29, 7],
    [30, 8], [39, 8], [40, 9], [49, 9], [50, 10], [55, 10]];
  for (const [int, want] of cases) {
    assert.equal(S.attractionRadius(int), want,
      'Интеллект ' + int + ' → ' + want + ' (пол — конвенция floor, '
      + 'прецедент decadanceLevels)');
  }
  assert.equal(S.attractionRadius(undefined), 5,
    'отсутствующий стат → 5 (гард ||0)');
  assert.equal(S.attractionRadius(9.9), 5, 'дробный Интеллект — floor');
});

// =====================================================================
// A-REACH-7 — селекторы целей: оконный BFS мира + reachableFrom-фильтр
// подземелья (F3: НЕ простой радиус)
// =====================================================================

function fixtureWorldMap(rows) {
  const h = rows.length;
  const w = rows[0].length;
  const grid = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return '#';
    return rows[y][x];
  };
  return {
    tileAt(x, y) {
      const c = grid(x, y);
      const passable = c === '.' || c === 'L';
      return { x, y, passable,
        loot: c === 'L' ? { item: 'root_rock' } : null };
    },
  };
}

test('A-REACH-7: L.worldLootTargets — оконный BFS 4-соседства по passable с окном Чебышёва (отрезанный водой/стеной лут НЕ берётся, обходной путь — берётся, за окном/невидимый — нет, детерминизм); L.dungeonLootTargets — reachableFrom ∩ окно, opened/gathered исключены, граница включена', () => {
  const L = loadLocations();
  assert.equal(typeof L.worldLootTargets, 'function',
    'RED: экспорт worldLootTargets в src/locations.js отсутствует');
  assert.equal(typeof L.dungeonLootTargets, 'function',
    'RED: экспорт dungeonLootTargets в src/locations.js отсутствует');
  // Мира-фикстура 11×9: '.' проходимо, 'L' лут (проходимо), 'W' вода/
  // стена (непроходимо), '#' стена/footprint (непроходимо). Старт (5,4),
  // radius 4 (окно Чебышёва 4 → x∈[1,9], y∈[0,8]). Ожидаемый набор:
  //   - (5,3) сосед — ДА; (2,4) за водой x=3 (y 2..6) — ОБХОД через
  //     y=1 в окне — ДА; (1,0) в окне, обходной путь — ДА;
  //   - (4,8) нижняя граница окна, достижим — ДА;
  //   - (9,4) изолирован стенами (8,4),(9,3),(9,5) + x=10 вне окна —
  //     НЕТ (это и есть «НЕ простой радиус»: в окне, но не достижим);
  //   - (6,5) невидимый (isVisible=false) — НЕТ; (0,4) за окном
  //     (Чебышёв 5) — НЕТ.
  const rows = [
    '.L.........',
    '...........',
    '...W.......',
    '...W.L...#.',
    'L.LW....#L.',
    '...W..L..#.',
    '...W.......',
    '...........',
    '....L......',
  ];
  const map = fixtureWorldMap(rows);
  const vis = (x, y) => !(x === 6 && y === 5);
  const got = L.worldLootTargets(map, 5, 4, 4, vis);
  const keys = got.map((t) => t.x + ',' + t.y);
  const set = new Set(keys);
  assert.ok(set.has('5,3'), 'лут-сосед в окне/достижим — взят');
  assert.ok(set.has('2,4'), 'лут за водой — ОБХОДНОЙ путь в окне → взят');
  assert.ok(set.has('1,0'), 'лут в окне ( Чебышёв 4 по диагонали), '
    + 'достижим обходом → взят');
  assert.ok(set.has('4,8'), 'лут на границе окна (y=8) — включительно');
  assert.ok(!set.has('9,4'),
    'лут (9,4): в окне, но ОТРЕЗАН стенами (8,4),(9,3),(9,5); (10,4) '
    + 'вне окна → НЕ взят (НЕ простой радиус)');
  assert.ok(!set.has('6,5'), 'невидимый (isVisible=false) → НЕ взят');
  assert.ok(!set.has('0,4'), 'за Чебышёвым ≤ 4 (x=0) → НЕ взят');
  for (const t of got) {
    assert.equal(t.item, 'root_rock', 'цель несёт id предмета лута');
    assert.ok(Math.max(Math.abs(t.x - 5), Math.abs(t.y - 4)) <= 4,
      'все цели в окне Чебышёва: ' + t.x + ',' + t.y);
  }
  assert.deepEqual([...set].sort(), ['1,0', '2,4', '4,8', '5,3'],
    'ровно ожидаемый набор (иного лута в фикстуре нет)');
  const again = L.worldLootTargets(map, 5, 4, 4, vis);
  assert.deepEqual(again.map((t) => t.x + ',' + t.y), keys,
    'детерминизм: повторный вызов — та же последовательность');
  assert.deepEqual(L.worldLootTargets(map, 5, 4, -1, vis), [],
    'отрицательный radius → []');
  assert.deepEqual(L.worldLootTargets(null, 0, 0, 5, vis), [],
    'null map → [] без краха');

  // Подземелье: сетка 17×17, периметр WALL, спавн (8,8), radius 6.
  // Карман (4,4): соседи (3,4),(5,4),(4,3),(4,5) → WALL (4-связность
  // изолирует; Чебышёв 4 — ВНУТРИ окна, но НЕ reachableFrom).
  const W = 17; const H = 17;
  const cells = new Array(W * H).fill(D.CELL_WALL);
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) cells[y * W + x] = D.CELL_FLOOR;
  const wall = (x, y) => { cells[y * W + x] = D.CELL_WALL; };
  wall(3, 4); wall(5, 4); wall(4, 3); wall(4, 5);
  const dg = { width: W, height: H, cells };
  const contents = {
    seed: 1, createdAtXp: 0, step: 0, mobs: [],
    chests: [
      { id: 'c1', x: 10, y: 8, gold: 5, item: null, opened: false },
      { id: 'c2', x: 7, y: 9, gold: 1, item: null, opened: true },
      { id: 'c3', x: 2, y: 8, gold: 1, item: null, opened: false },
      { id: 'c4', x: 15, y: 8, gold: 1, item: null, opened: false },
      { id: 'c5', x: 4, y: 4, gold: 1, item: null, opened: false },
    ],
    deposits: [
      { id: 'd1', x: 8, y: 2, amount: 2, item: 'coal', gathered: false },
      { id: 'd2', x: 7, y: 7, amount: 1, item: 'coal', gathered: true },
      { id: 'd3', x: 15, y: 15, amount: 1, item: 'coal', gathered: false },
    ],
  };
  const ds = { kind: 'dungeon', dg, x: 8, y: 8, contents };
  withGame({ reachableFrom: D.reachableFrom }, () => {
    const r = L.dungeonLootTargets(ds, 6);
    assert.deepEqual(r.chests.map((c) => c.id), ['c1', 'c3'],
      'сундуки: c2 opened — нет; c4 (15,8) Чебышёв 7 — за окном, нет; '
      + 'c5 в кармане в окне (Чебышёв 4), но НЕ reachableFrom — нет; '
      + 'c3 (2,8) граница окна Чебышёв 6 — включительно');
    assert.deepEqual(r.deposits.map((dp) => dp.id), ['d1'],
      'залежи: d2 gathered — нет; d3 (15,15) Чебышёв 7 — за окном; '
      + 'd1 (8,2) на границе окна — включительно');
    const guard = L.dungeonLootTargets(null, 6);
    assert.deepEqual(guard, { chests: [], deposits: [] },
      'null ds → пустой набор без краха');
    const bare = L.dungeonLootTargets(
      { kind: 'dungeon', dg, x: 7, y: 7, contents: null }, 6);
    assert.deepEqual(bare, { chests: [], deposits: [] },
      'contents null (город-форма) → пустой набор');
  });
});

// =====================================================================
// e2e-харнес — дубль tests/spellbook-oc-e2e.test.js
// =====================================================================

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CHAIN = Array.from(html.matchAll(/<script\s+src="([^"]+)"/g),
  (m) => m[1]).map((p) => p.replace(/^src\//, ''));
const NOW = 1000;

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

function makeStorage(seed) {
  const m = new Map();
  if (seed != null) m.set(SNode.SAVE_KEY, JSON.stringify(seed));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

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
  return { sandbox, winListeners, raf, errors, body, storage, hud };
}

const drain = () => new Promise((r) => setImmediate(r));

async function boot(seed) {
  const h = bootSandbox(seed);
  await drain();
  await drain();
  await drain();
  const g = h.sandbox.__game;
  assert.ok(g, 'globalThis.__game выставлен (main.js выполнен)');
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет (порядок цепочки — load-clean 000038): '
    + h.errors.join('; '));
  h.frameFn = h.raf[h.raf.length - 1];
  return h;
}

function key(h, code, extra = {}) {
  const e = Object.assign(
    { code, preventDefault() {}, stopPropagation() {} }, extra);
  for (const fn of (h.winListeners['keydown'] || []).slice()) fn(e);
  return e;
}

function press(h, code) {
  return key(h, code);
}

function release(h, code) {
  const e = Object.assign({ code, preventDefault() {},
    stopPropagation() {} });
  for (const fn of (h.winListeners['keyup'] || []).slice()) fn(e);
  return e;
}

function keydownFor(dx, dy) {
  return dx === 1 ? 'ArrowRight' : dx === -1 ? 'ArrowLeft'
    : dy === 1 ? 'ArrowDown' : 'ArrowUp';
}

function resolveCombat(G) {
  assert.equal(G.combatUI.isActive(), true, 'резолв: бой активен');
  const c = G.combatUI.current();
  for (const m of c.units.filter((x) => x.side === 'mob' && x.alive)) {
    G.combatInternals.dealDamageToMob(c, m, 9999);
  }
  assert.ok(c.result && c.result.outcome === 'victory',
    'резолв: победа (9999 по живым мобам)');
  G.combatUI.handleCode('Space');
  assert.equal(G.combatUI.isActive(), false,
    'резолв: бой закрыт (Space → finish)');
}

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
    if (G.combatUI.isActive()) resolveCombat(G);
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

function safeWorldNeighbor(G, myMap, from) {
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (const [dx, dy] of DIRS) {
    const t = myMap.tileAt(from.x + dx, from.y + dy);
    if (!t.passable || t.hasMobGroup || t.hasBuilding) continue;
    return [from.x + dx, from.y + dy];
  }
  return null;
}

function enterCity(h, now, myMap, pred) {
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const found = findCityFor(G, myMap, g.state.player, pred);
  assert.ok(found,
    'сценарий: город достижим пешком (BFS, мир детерминирован)');
  now = walkTiles(h, now, found.steps);
  const entry = { x: found.tile.x, y: found.tile.y };
  for (let attempt = 0; !g.dungeon && attempt < 3; attempt += 1) {
    if (G.combatUI.isActive()) resolveCombat(G);
    const adj = safeWorldNeighbor(G, myMap, entry);
    assert.ok(adj, 'сценарий: безопасный сосед тайла входа есть');
    now = walkTiles(h, now, [adj, [entry.x, entry.y]]);
  }
  assert.ok(g.dungeon, 'сценарий: локация открыта (bounded re-entry ≤3)');
  assert.equal(g.dungeon.kind, 'city', 'экран города (kind city)');
  return { found, entry, now };
}

function dismissStartWindow(h) {
  const g = h.sandbox.__game;
  const sw = g.startWindow;
  assert.ok(sw && typeof sw.hide === 'function',
    'фикстура: __game.startWindow (000138)');
  sw.hide();
  assert.equal(sw.isActive(), false,
    'стартовое окно скрыто (клик «Продолжить»)');
}

function learn(h, ids) {
  const spells = h.sandbox.__game.state.hero.spells;
  assert.ok(Array.isArray(spells), 'сценарий: live hero.spells (массив)');
  for (const id of ids) spells.push(id);
}

function host(o) { return JSON.parse(JSON.stringify(o)); }

function saveHero(h) {
  const bu = h.winListeners['beforeunload'];
  assert.ok(bu && bu.length > 0, 'beforeunload зарегистрирован');
  bu[0]();
  const raw = h.storage.getItem(SNode.SAVE_KEY);
  assert.ok(raw, 'сейв в localStorage (saveNow вызван)');
  const saved = JSON.parse(raw);
  return saved.data.hero;
}

function readSave(h) {
  const raw = h.storage.getItem(SNode.SAVE_KEY);
  assert.ok(raw, 'сейв присутствует в localStorage');
  return JSON.parse(raw);
}

function clickRow(h, id) {
  const row = h.body.querySelector('[data-spell-id="' + id + '"]');
  assert.ok(row, 'строка ' + id + ' в книге');
  const l = row.listeners && row.listeners.click;
  assert.ok(l && l.length > 0,
    'строка ' + id + ' — свой click-listener (makeEl)');
  l[l.length - 1]();
}

function castViaBook(h, id) {
  key(h, 'KeyB');
  assert.ok(h.body.querySelector('.spellbook-oc'), 'книга открыта');
  clickRow(h, id);
}

// Независимая реплика селекции мира (НЕ вызывает Locations): BFS
// 4-соседства по tileAt().passable, окно Чебышёва, фильтр loot +
// collectedLoot-видимости. Тест сверяет реализацию с РЕПЛИКОЙ.
function replicaWorldTargets(myMap, sx, sy, radius, collected) {
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const seen = new Set([sx + ',' + sy]);
  const queue = [[sx, sy]];
  const out = [];
  while (queue.length) {
    const [x, y] = queue.shift();
    const t = myMap.tileAt(x, y);
    if (t.loot != null && !collected.has(x + ',' + y)) {
      out.push({ x: t.x, y: t.y, item: t.loot.item });
    }
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (Math.max(Math.abs(nx - sx), Math.abs(ny - sy)) > radius) continue;
      const k = nx + ',' + ny;
      if (seen.has(k)) continue;
      if (!myMap.tileAt(nx, ny).passable) continue;
      seen.add(k);
      queue.push([nx, ny]);
    }
  }
  return out;
}

// =====================================================================
// A-E2E-WORLD-8 — мир: книга → клик строки → ВЕСЬ достижимый видимый лут
// в окне собран (эквивалент ручного подбора), collectedLoot-зеркало
// сейва, день/шаги не тронуты, мана −13 ровно, второй каст — отказ
// =====================================================================

test('A-E2E-WORLD-8: e2e мир — клик «Притяжение»: инвентарь == реплика (items.js-симуляция по BFS-порядку), collectedLoot-зеркало сейва (день сбора), за-окном целы, day/steps не тронуты, mp −13, повтор — отказ с исходной цены', async () => {
  const h = await boot({ version: 1, savedAt: new Date(0).toISOString(),
    data: { day: 1, hero: Object.assign(createCharacter(), {
      mp: 40,
      primary: Object.assign({}, createCharacter().primary,
        { wisdom: 10 }),
    }) } });
  dismissStartWindow(h);
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  assert.equal(typeof G.Spells.attractionRadius, 'function',
    'RED: G.Spells.attractionRadius в цепочке отсутствует');
  const intel = saveHero(h).primary.intelligence;
  const R = 5 + Math.floor((intel || 0) / 10);
  assert.equal(G.Spells.attractionRadius(intel), R,
    'фикстура: radius = формула (инт ' + intel + ' → ' + R + ')');
  learn(h, ['attraction']);
  await drain();
  const myMap = G.createMap(G.generateSeedPixels());
  const sx = g.state.player.x, sy = g.state.player.y;
  const mp0 = saveHero(h).mp;
  assert.ok(mp0 >= MANA, 'фикстура: mp ' + mp0 + ' ≥ мани ' + MANA);
  const collected0 = new Set(Object.keys(readSave(h).data.collectedLoot || {}));
  const targets = replicaWorldTargets(myMap, sx, sy, R, collected0);
  assert.ok(targets.length >= 2,
    'фикстура: в окне (0,0) r=' + R + ' есть ≥2 видимых лут-тайла: '
    + targets.length);
  // Симуляция addItem node-копией items.js на ЧИСТОМ hero-клоне —
  // предсказание инвентаря/разделений (те же правила веса/слотов).
  const sim = JSON.parse(JSON.stringify(createCharacter('Флогистон')));
  const simCollected = [];
  const simRefused = [];
  for (const t of targets) {
    const r = ItemsNode.addItem(sim, t.item);
    if (r && r.ok) simCollected.push(t.x + ',' + t.y);
    else simRefused.push(t.x + ',' + t.y);
  }
  assert.ok(simCollected.length > 0,
    'симуляция: что-то влезает (иначе тест деградирован)');
  // За-окном: первый лут-тайл с Чебышёвым R+1 (контроль невредимости).
  let outsideKey = null;
  for (let dy = -(R + 1); dy <= R + 1 && !outsideKey; dy++) {
    for (let dx = -(R + 1); dx <= R + 1 && !outsideKey; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== R + 1) continue;
      const t = myMap.tileAt(sx + dx, sy + dy);
      if (t.loot != null && !collected0.has((sx + dx) + ',' + (sy + dy))) {
        outsideKey = (sx + dx) + ',' + (sy + dy);
      }
    }
  }
  const day0 = readSave(h).data.day;
  const steps0 = readSave(h).data.steps;
  castViaBook(h, 'attraction');
  assert.equal(G.spellbookOC.isOpen(), false, 'успех → книга закрыта');
  assert.deepEqual(host(g.state.hero.inventory), host(sim.inventory.slots),
    'инвентарь == симуляция ручного подбора в BFS-порядке '
    + '(собрано ' + simCollected.length + ', не влезло '
    + simRefused.length + ')');
  const saved = readSave(h);
  const cl = saved.data.collectedLoot || {};
  assert.deepEqual(Object.keys(cl).sort(), [...simCollected].sort(),
    'collectedLoot-зеркало: ровно собранные тайла (не влезшие НЕ '
    + 'помечены — тайл сохраняется)');
  for (const k of Object.keys(cl)) {
    assert.equal(cl[k], day0, 'отметка «x,y» → день сбора ' + day0);
  }
  if (outsideKey != null) {
    assert.ok(!(outsideKey in cl),
      'лут за окном (Чебышёв R+1) ' + outsideKey + ' — не тронут');
    const t = myMap.tileAt(...outsideKey.split(',').map(Number));
    assert.ok(t.loot != null, 'лут за окном по-прежнему на тайле');
  }
  assert.equal(saveHero(h).mp, mp0 - MANA, 'мана списана ровно 13');
  assert.deepEqual(host(g.state.hero.outOfCombatEffects), [],
    'записей outOfCombatEffects НЕТ');
  assert.equal(saved.data.day, day0, 'ДЕНЬ не потрачен');
  assert.equal(saved.data.steps, steps0, 'шаги не сдвинуты');
  h.frameFn(NOW + 16);
  assert.ok(String(h.hud.textContent).includes('Притяжение: собрано '
    + simCollected.length + '.'),
    'hud-вспышка-сводка: ' + JSON.stringify(h.hud.textContent));
  // Второй каст: собранное невидимо; если остались невлезшие — «не
  // влезает в инвентарь», иначе — «нечего собирать»; мана НЕ тратится.
  const expect2 = simRefused.length > 0
    ? 'не влезает в инвентарь' : 'нечего собирать';
  castViaBook(h, 'attraction');
  h.frameFn(NOW + 32);
  assert.ok(String(h.hud.textContent).includes(expect2),
    'повторный каст — «' + expect2 + '» в hud: '
    + JSON.stringify(h.hud.textContent));
  assert.equal(saveHero(h).mp, mp0 - MANA,
    'отказ повторного каста — мана НЕ тронута');
  assert.equal(readSave(h).data.day, day0, 'повтор: день снова не тронут');
});

// =====================================================================
// A-E2E-DUNGEON-9 — подземелье: контролируемая сетка/contents; сбор в
// окне (сундук → applyDungeonChest-эквивалент, залежь → gatherDeposit),
// карман/даль/already-флаги — нет; log/gold/invariant-PIN
// =====================================================================

test('A-E2E-DUNGEON-9: e2e подземелье — клик «Притяжение»: в окне собраны сундук (gold+item+ds.log) и залежь (+N+ds.log), карман за стеной/за-окном/already-флаги — нет; contents.step/day/steps целы; mp −13; повтор — «нечего собирать»', async () => {
  const h = await boot({ version: 1, savedAt: new Date(0).toISOString(),
    data: { day: 1, hero: Object.assign(createCharacter(), {
      mp: 40,
      primary: Object.assign({}, createCharacter().primary,
        { strength: 1, dexterity: 1, constitution: 10, intelligence: 10,
          wisdom: 10, charisma: 1 }),
    }) } });
  dismissStartWindow(h);
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  learn(h, ['attraction']);
  const ds = g.actions.enterDungeon();
  assert.ok(ds && ds.kind === 'dungeon', 'подземелье открыто');
  await drain();
  // Контролируемая сетка 17×17 (полная замена dg): периметр WALL,
  // интерьер FLOOR, спавн (8,8); карман (4,4) изолирован стеной
  // 4-соседей (Чебышёв 4 — в окне R=6, но НЕ reachableFrom).
  const W = 17, HH = 17;
  const cells = new Array(W * HH).fill(G.CELL_WALL);
  for (let y = 1; y < HH - 1; y++)
    for (let x = 1; x < W - 1; x++) cells[y * W + x] = G.CELL_FLOOR;
  cells[4 * W + 3] = G.CELL_WALL; cells[4 * W + 5] = G.CELL_WALL;
  cells[3 * W + 4] = G.CELL_WALL; cells[5 * W + 4] = G.CELL_WALL;
  ds.dg = { width: W, height: HH, cells, depth: 1, type: ds.dg.type,
    entrance: { x: 8, y: 8 }, exit: { x: 8, y: 8 } };
  ds.x = 8; ds.y = 8;
  ds.contents = {
    seed: 1, createdAtXp: 0, step: 0, mobs: [],
    chests: [
      { id: 'c1', x: 10, y: 8, gold: 37, item: 'coal', opened: false },
      { id: 'c2', x: 7, y: 9, gold: 99, item: null, opened: true },
      { id: 'c3', x: 14, y: 8, gold: 100, item: null, opened: false },
      { id: 'c4', x: 4, y: 4, gold: 55, item: null, opened: false },
    ],
    deposits: [
      { id: 'd1', x: 8, y: 10, item: 'coal', amount: 2, gathered: false },
      { id: 'd2', x: 14, y: 14, item: 'coal', amount: 3, gathered: false },
    ],
  };
  const gold0 = saveHero(h).gold;
  const mp0 = saveHero(h).mp;
  const day0 = readSave(h).data.day;
  const steps0 = readSave(h).data.steps;
  assert.equal(mp0, 40, 'фикстура mp 40');
  assert.equal(ds.contents.step, 0, 'фикстура contents.step 0');
  castViaBook(h, 'attraction');
  assert.equal(G.spellbookOC.isOpen(), false, 'успех → книга закрыта');
  const coalName = G.getItem('coal').name;
  // c1 (10,8) Чебышёв 2 — открыт (37 золота, coal → инвентарь).
  assert.equal(ds.contents.chests[0].opened, true,
    'c1 в окне — открыт');
  assert.equal(ds.contents.chests[1].opened, true,
    'c2 уже был открыт (флаг не тронут, золота НЕ добавлено)');
  assert.equal(ds.contents.chests[2].opened, true,
    'c3 на границе окна (14,8 — Чебышёв ровно 6=R) — включительно');
  assert.equal(ds.contents.chests[3].opened, false,
    'c4 в кармане за стеной — НЕ открыт (reachableFrom, не радиус)');
  assert.equal(ds.contents.deposits[0].gathered, true,
    'd1 (8,10) в окне — собрана');
  assert.equal(ds.contents.deposits[1].gathered, true,
    'd2 (14,14) Чебышёв 6 — на границе окна, достижима — собрана (+3)');
  const saved = readSave(h);
  assert.equal(saved.data.hero.gold, gold0 + 37 + 100,
    'золото: c1 37 + c3 100 (c2 уже открыт — 99 НЕ начислено)');
  assert.deepEqual(host(g.state.hero.inventory),
    [{ id: 'coal', qty: 6 }],
    'coal: c1 +1, d1 +2, d2 +3 (стек)');
  assert.ok(ds.log.includes('Сундук: +37 золота, ' + coalName),
    'ds.log «Сундук: +37 золота, ' + coalName + '»: '
    + JSON.stringify(ds.log));
  assert.ok(ds.log.includes('Сундук: +100 золота'),
    'ds.log «Сундук: +100 золота» (c3 без предмета)');
  assert.ok(ds.log.includes('Залежь: +2 ' + coalName),
    'ds.log «Залежь: +2 ' + coalName + '»');
  assert.ok(ds.log.includes('Залежь: +3 ' + coalName),
    'ds.log «Залежь: +3 ' + coalName + '»');
  assert.equal(ds.contents.step, 0,
    'contents.step НЕ вырос (wanderStep не вызывался)');
  assert.equal(saved.data.day, day0, 'ДЕНЬ не потрачен');
  assert.equal(saved.data.steps, steps0, 'шаги не сдвинуты');
  assert.equal(saveHero(h).mp, 40 - MANA, 'mp ровно −13');
  assert.deepEqual(host(g.state.hero.outOfCombatEffects), [],
    'записей outOfCombatEffects НЕТ');
  h.frameFn(NOW + 16);
  assert.ok(String(h.hud.textContent).endsWith('Притяжение: собрано 4.'),
    'hud-сводка «Притяжение: собрано 4.» (2 сундука + 2 залежи): '
    + JSON.stringify(h.hud.textContent));
  // Второй каст — всё собрано/закрыто/вне видимости → «нечего собирать».
  castViaBook(h, 'attraction');
  h.frameFn(NOW + 32);
  assert.ok(String(h.hud.textContent).includes('нечего собирать'),
    'повтор — «нечего собирать»: ' + JSON.stringify(h.hud.textContent));
  assert.equal(saveHero(h).mp, 40 - MANA,
    'отказ — мана НЕ тронута (mp 27)');
  assert.equal(ds.contents.chests[3].opened, false,
    'карман по-прежнему не открыт');
});

// =====================================================================
// A-E2E-REFUSE-10 — отказы БЕСПЛАТНЫ и без мутаций: «не влезает» (полный
// инвентарь, залежь остаётся), «нечего собирать» (пустой_contents),
// город — «не здесь»
// =====================================================================

test('A-E2E-REFUSE-10: e2e отказы — полный инвентарь: «не влезает в инвентарь» + gathered:false + 0 мутаций + mp цел; пустые contents: «нечего собирать» + mp цел; город: «не здесь» + mp цел', async () => {
  const h = await boot({ version: 1, savedAt: new Date(0).toISOString(),
    data: { day: 1, hero: Object.assign(createCharacter(), {
      mp: 24,
      inventory: { slots: [{ id: 'coal', qty: 60 }] },
      primary: Object.assign({}, createCharacter().primary,
        { strength: 1, dexterity: 1, constitution: 10, intelligence: 10,
          wisdom: 10, charisma: 1 }),
    }) } });
  dismissStartWindow(h);
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  learn(h, ['attraction']);
  const ds = g.actions.enterDungeon();
  assert.ok(ds, 'подземелье открыто');
  await drain();
  const W = 15, HH = 15;
  const cells = new Array(W * HH).fill(G.CELL_WALL);
  for (let y = 1; y < HH - 1; y++)
    for (let x = 1; x < W - 1; x++) cells[y * W + x] = G.CELL_FLOOR;
  ds.dg = { width: W, height: HH, cells, depth: 1, type: ds.dg.type,
    entrance: { x: 7, y: 7 }, exit: { x: 7, y: 7 } };
  ds.x = 7; ds.y = 7;
  // Только залежь в окне; инвентарь 60 coal = 30 кг (лимит) → не влезет.
  ds.contents = {
    seed: 1, createdAtXp: 0, step: 0, mobs: [], chests: [],
    deposits: [{ id: 'd1', x: 8, y: 7, item: 'coal', amount: 2,
      gathered: false }],
  };
  const logLen0 = ds.log.length;
  castViaBook(h, 'attraction');
  h.frameFn(NOW + 16);
  assert.ok(String(h.hud.textContent).includes('не влезает в инвентарь'),
    'hud: «не влезает в инвентарь»: ' + JSON.stringify(h.hud.textContent));
  assert.equal(ds.contents.deposits[0].gathered, false,
    'залежь ОСТАЁТСЯ (gathered:false — 0 мутаций)');
  assert.equal(ds.log.length, logLen0, 'ds.log не вырос');
  assert.equal(saveHero(h).mp, 24, 'отказ — мана НЕ тронута');
  press(h, 'KeyB');
  assert.equal(G.spellbookOC.isOpen(), false,
    'отказ оставляет книгу открытой (паттерн 252) — закрываем вручную');
  // Пустые contents → «нечего собирать» (F1, до маны).
  ds.contents = { seed: 1, createdAtXp: 0, step: 0, mobs: [], chests: [],
    deposits: [] };
  castViaBook(h, 'attraction');
  h.frameFn(NOW + 32);
  assert.ok(String(h.hud.textContent).includes('нечего собирать'),
    'hud: «нечего собирать»: ' + JSON.stringify(h.hud.textContent));
  assert.equal(saveHero(h).mp, 24, 'F1: mp цел');
  // Город (city-screen протокол).
  const h2 = await boot();
  dismissStartWindow(h2);
  const g2 = h2.sandbox.__game;
  const G2 = h2.sandbox.Game;
  const myMap = G2.createMap(G2.generateSeedPixels());
  learn(h2, ['attraction']);
  const mp0 = saveHero(h2).mp;
  assert.ok(mp0 >= MANA, 'город: фикстура mp ' + mp0 + ' ≥ ' + MANA);
  await drain();
  enterCity(h2, NOW + 64, myMap, (c) => c.fp >= 2);
  h2.frameFn(NOW + 96);
  const errBefore = h2.errors.length;
  castViaBook(h2, 'attraction');
  h2.frameFn(NOW + 112);
  assert.ok(String(h2.hud.textContent).includes('не здесь'),
    'город: «не здесь»: ' + JSON.stringify(h2.hud.textContent));
  assert.equal(saveHero(h2).mp, mp0, 'город: мана НЕ тронута');
  assert.equal(h2.errors.length, errBefore,
    'город: без новых console.error: '
    + h2.errors.slice(errBefore).join('; '));
});

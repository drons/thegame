// Задача 000333 — заклинания навигации подземелья: «Путь наверх» (way_up)
// и «Путь вниз» (way_down). A* (детерминированный, 0 новых RNG) от клетки
// игрока до цели этажа: way_up → d.exit (выход на верхний этаж / в мир),
// way_down → d.stairsDown (вход на нижний этаж; null — «пути нет»).
// Результат — полупрозрачная ЛИНИЯ на карте подземелья (полилиния центров
// клеток, цвета РАЗНЫЕ: way_up '#59ffb0', way_down '#ff7a4d', alpha 0.5);
// туман-gate: сегмент рисуется, только если ОБА конца mask !== 0 (линия
// НЕ раскрывает геометрию за туманом — контракт 000225/000136).
// Пути нет → заклинание НЕ применяется ДО расхода маны (fail-closed —
// прецедент flame_step/shadow_step/miracle, W-10a); лог — flash(reason)
// в книге вне боя (spellbook-oc.js :253-254 — по факту кода).
// Состояние линии — НЕ в сейве (ds.navPaths; сейв этажа — белый список
// activeDungeonMemoryRec {key,contents,lastVisitDay,pos}, main.js).
// Свитки way_up_scroll/way_down_scroll (spell_scroll, effect.spell = ID
// заклинания — формат 000327, НЕ путь). Школа/атрибут — природа/wisdom
// (решение анализа, memory/000333-dungeon-nav-spells.md).
//
// КРАСНЫЕ до реализации (осмысленная краснота, не крах загрузки):
//   N-ASTAR-1..3 — D.navPath отсутствует / A* неверен;
//   N-CAST-1..4 — way_up/way_down нет в каталоге → «неизвестное
//     заклинание», fail-closed-гейт не работает;
//   N-JSON-1..2 — файлы каталога/иконок нет;
//   N-REND-UP/DOWN — линия не рисуется;
//   N-SWEEP-0 — новых записей в каталоге нет.
//   N-SAVE-1 — PIN (зелёный и на RED: белый список serializeDungeon-
//     Memory цел до задачи) — ловит будущую утечку navPaths в сейв;
//     краснеет на мутации «прокинуть navPaths через сериализатор».
//
// Фикстура A*/рендера — буква «Z» 9×5: (1,1)→(3,1)→(3,3)→(7,3) — путь
// ЕДИНСТВЕНЕН (не зависит от тай-брейков): 9 клеток, 8 сегментов.
// vm-харнес рендера — дубль tests/boss-3x3-000330.test.js (паттерн
// tests/dungeon-ui.test.js), context2d-стаб ДОПИСАН пин-снапшот
// (strokeStyle/globalAlpha/lineWidth) для ассертов линии.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const D = require('../src/dungeon.js');
const { validate } = require('./json-schema.js');

const ROOT = path.join(__dirname, '..');
const src = (f) => fs.readFileSync(path.join(ROOT, 'src', f), 'utf8');
const CELL = D.CELL_FLOOR;
const WALL = D.CELL_WALL;

const SPELLS_DIR = path.join(ROOT, 'assets', 'spells');
const ITEMS_DIR = path.join(ROOT, 'assets', 'items');
const SPELL_UP_FILE = path.join(SPELLS_DIR, 'way_up.json');
const SPELL_DOWN_FILE = path.join(SPELLS_DIR, 'way_down.json');
const SCROLL_UP_FILE = path.join(ITEMS_DIR, '000512.json');
const SCROLL_DOWN_FILE = path.join(ITEMS_DIR, '000513.json');

const NAV_COLOR_UP = '#59ffb0';
const NAV_COLOR_DOWN = '#ff7a4d';
const NAV_ALPHA = 0.5;

// --- Фикстура «Z» 9×5: путь ЕДИНСТВЕНЕН (A*-ответ — точный набор) ---

const Z_W = 9, Z_H = 5;
const Z_PATH = [
  { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 1 },
  { x: 3, y: 2 },
  { x: 3, y: 3 }, { x: 4, y: 3 }, { x: 5, y: 3 },
  { x: 6, y: 3 }, { x: 7, y: 3 },
];

function zShape(extraFloors) {
  const cells = new Array(Z_W * Z_H).fill(WALL);
  for (const c of Z_PATH) cells[c.y * Z_W + c.x] = CELL;
  for (const c of (extraFloors || [])) cells[c.y * Z_W + c.x] = CELL;
  return {
    type: D.DUNGEON_TYPES.CAVE, width: Z_W, height: Z_H, cells,
    entrance: { x: 1, y: 1 }, exit: { x: 7, y: 3 },
    seed: 333, depth: 1,
  };
}

function zPocket() {
  // (8,4) — WALL-цель; (7,1) — FLOOR-карман: соседи (6,1), (8,1), (7,0),
  // (7,2) — все WALL (путь «Z» идёт по y=1 только x=1..3 и по y=3).
  return zShape([{ x: 7, y: 1 }]);
}

// --- N-ASTAR-1: единственный путь — ТОЧНЫЙ список клеток ---

test('N-ASTAR-1: Z-фикстура — navPath((1,1)→(7,3)) = ровно 9 клеток единственного пути (вкл. старт и цель), 0 RNG', () => {
  assert.equal(typeof D.navPath, 'function',
    'RED: экспорт D.navPath (src/dungeon.js) отсутствует');
  const d = zShape();
  const p = D.navPath(d, 1, 1, 7, 3);
  assert.ok(Array.isArray(p), 'навpath — массив клеток (null — нет пути)');
  assert.deepEqual(p, Z_PATH,
    'путь единственен: (1,1)→(3,1)→(вниз)→(3,3)→(7,3); факт: '
    + JSON.stringify(p));
});

// --- N-ASTAR-2: цель в стеновом кармане → null ---

test('N-ASTAR-2: цель — WALL-клетка в 4-стеновом кармане → null (fail-closed, недостижимо/не-FLOOR)', () => {
  assert.equal(typeof D.navPath, 'function',
    'RED: экспорт D.navPath отсутствует');
  const d = zPocket();
  assert.equal(d.cells[4 * Z_W + 8], WALL,
    'фикстура: (8,4) — WALL, единственная FLOOR-окружающая (7,4) — тоже WALL');
  assert.equal(d.cells[1 * Z_W + 7], CELL,
    'фикстура: (7,1) — FLOOR-карман (все 4 соседа — WALL)');
  assert.equal(D.navPath(d, 1, 1, 8, 4), null,
    'цель не-FLOOR → null (никакого «пути сквозь стену»)');
  assert.equal(D.navPath(d, 1, 1, 7, 1), null,
    'цель FLOOR, но недостижима (изоляция стенами) → null');
});

// --- N-ASTAR-3: старт==цель → 1 клетка; не-FLOOR старт → null ---

test('N-ASTAR-3: старт==цель (FLOOR) → [{x,y}] длины 1; старт не-FLOOR → null; детерминизм (тот же вызов → тот же путь)', () => {
  assert.equal(typeof D.navPath, 'function',
    'RED: экспорт D.navPath отсутствует');
  const d = zShape();
  assert.deepEqual(D.navPath(d, 5, 3, 5, 3), [{ x: 5, y: 3 }],
    'старт==цель — ровно одна клетка');
  assert.equal(D.navPath(d, 0, 0, 5, 3), null,
    'старт не-FLOOR → null (никакого переноса на ближайшую клетку)');
  const a = D.navPath(d, 1, 1, 7, 3);
  const b = D.navPath(d, 1, 1, 7, 3);
  assert.deepEqual(a, b, 'A* — чистая функция карты (детерминизм, 0 RNG)');
});

// --- Каст: hero-фикстура (паттерн spells.test.js spellHero) ---

function loadSpellsData() { return require('../src/spells-data.js'); }
function loadSpells() { return require('../src/spells.js'); }

function heroFixture(spellIds, mp) {
  return { spells: spellIds.slice(), mp, level: 3 };
}

// --- N-CAST-1: fail-closed — «пути нет» ДО расхода маны (W-10a) ---

test('N-CAST-1: castOutOfCombat way_up + ctx.navPath → {ok:false,reason:«пути нет»} → мана НЕ тронута, записей НЕТ (fail-closed ДО мутаций)', () => {
  const dataMod = loadSpellsData();
  assert.ok(dataMod.SPELLS_BY_ID.way_up,
    'RED: way_up отсутствует в каталоге/зеркале');
  const { castOutOfCombat } = loadSpells();
  const p = heroFixture(['way_up', 'way_down'], 20);
  const r = castOutOfCombat(p, 'way_up', 10, {
    navPath: () => ({ ok: false, reason: 'пути нет' }),
  });
  assert.equal(r.ok, false, 'отказ при отсутствии пути');
  assert.equal(r.reason, 'пути нет',
    'reason colbake — «пути нет»; факт: «' + r.reason + '»');
  assert.equal(p.mp, 20, 'мана НЕ списана ДО отказа (прецедент W-10a)');
  assert.equal(p.outOfCombatEffects, undefined,
    'записей outOfCombatEffects НЕТ при отказе');
  const rd = castOutOfCombat(p, 'way_down', 10, {
    navPath: () => ({ ok: false, reason: 'пути нет' }),
  });
  assert.equal(rd.ok, false, 'way_down — тот же fail-closed');
  assert.equal(p.mp, 20, 'way_down: мана НЕ списана');
});

// --- N-CAST-2: успех — мана −6, запись {spellId, expiresDay: day+1} ---

test('N-CAST-2: castOutOfCombat way_up + ctx.navPath ok → ok:true, мана −6 (мани way_up), РОВНО 1 запись {way_up, expiresDay: 11} (days=1); повтор — обновление in place', () => {
  const dataMod = loadSpellsData();
  assert.ok(dataMod.SPELLS_BY_ID.way_up,
    'RED: way_up отсутствует в каталоге/зеркале');
  const { castOutOfCombat } = loadSpells();
  const p = heroFixture(['way_up', 'way_down'], 20);
  let calls = 0;
  const r = castOutOfCombat(p, 'way_up', 10, {
    navPath: (id) => { calls += 1; assert.equal(id, 'way_up',
      'ctx.navPath вызывается с id кастуемого заклинания'); return { ok: true }; },
  });
  assert.equal(r.ok, true, 'каст — ok (RED: «неизвестное заклинание» или отказ гейта)');
  assert.equal(calls, 1, 'navPath вызван ровно 1 раз');
  assert.equal(p.mp, 14, 'мана 20 − 6 (мани way_up = 6)');
  assert.equal(r.expiresDay, 11, 'expiresDay = day + days (10 + 1)');
  assert.deepEqual(p.outOfCombatEffects,
    [{ spellId: 'way_up', expiresDay: 11 }],
    'запись {spellId, expiresDay} — ровно одна');
  const r2 = castOutOfCombat(p, 'way_up', 10, {
    navPath: () => ({ ok: true }),
  });
  assert.equal(r2.ok, true, 'повторный каст в тот же день разрешён (кулдаунов нет)');
  assert.deepEqual(p.outOfCombatEffects,
    [{ spellId: 'way_up', expiresDay: 11 }],
    'перезаклинание — ОБНОВЛЕНИЕ in place (дублей нет)');
  const rd = castOutOfCombat(p, 'way_down', 10, {
    navPath: (id) => { assert.equal(id, 'way_down'); return { ok: true }; },
  });
  assert.equal(rd.ok, true, 'way_down кастуется');
  assert.equal(p.mp, 2, 'way_down — свои 6 маны (20 − 6 − 6 повтор − 6)');
  assert.equal(rd.expiresDay, 11, 'way_down — свои days=1');
});

// --- N-CAST-3: ctx без navPath → отказ ДО маны ---

test('N-CAST-3: ctx БЕЗ navPath (не подземелье/модуль не подключён) → отказ ДО маны, мана НЕ тронута, записей НЕТ', () => {
  const dataMod = loadSpellsData();
  assert.ok(dataMod.SPELLS_BY_ID.way_up,
    'RED: way_up отсутствует в каталоге/зеркале');
  const { castOutOfCombat } = loadSpells();
  const p = heroFixture(['way_up', 'way_down'], 20);
  const r = castOutOfCombat(p, 'way_up', 10, {});
  assert.equal(r.ok, false, 'без ctx.navPath — отказ (fail-closed)');
  assert.equal(p.mp, 20, 'мана НЕ списана');
  assert.equal(p.outOfCombatEffects, undefined, 'записей НЕТ');
});

// --- N-CAST-4: мана-гейт раньше navPath-колбэка ---

test('N-CAST-4: mp < мани → «не хватает маны» И navPath НЕ вызывается (счётчик 0 — порядок проверок каталог→книга→мана→флаг→days→гейт)', () => {
  const dataMod = loadSpellsData();
  assert.ok(dataMod.SPELLS_BY_ID.way_up,
    'RED: way_up отсутствует в каталоге/зеркале');
  const { castOutOfCombat } = loadSpells();
  const p = heroFixture(['way_up', 'way_down'], 3);
  let calls = 0;
  const r = castOutOfCombat(p, 'way_up', 10, {
    navPath: () => { calls += 1; return { ok: true }; },
  });
  assert.equal(r.ok, false, 'отказ по мане');
  assert.equal(r.reason, 'не хватает маны',
    'причина — «не хватает маны»; факт: «' + r.reason + '»');
  assert.equal(calls, 0, 'navPath НЕ вызывался (нет пути не считается без маны)');
  assert.equal(p.mp, 3, 'мана НЕ тронута');
});

// --- N-SAVE-1: белый список сейва — navPaths НЕ попадает в раздел ---

test('N-SAVE-1: activeRec С navPaths → serializeDungeonMemory теряет navPaths (белый список записи {contents,lastVisitDay,pos}; сейв v1 без изменений)', () => {
  const goodContents = {
    seed: 12345, createdAtXp: 0, step: 3,
    mobs: [{ id: 'g0', mobIds: ['ant', 'ant'], x: 3, y: 4, level: 1,
      defeated: true }],
    chests: [{ id: 'c0', x: 2, y: 3, opened: true, gold: 10,
      item: 'iron_sword' }],
  };
  const out = D.serializeDungeonMemory({}, 10, 30, {
    key: '20,-16:1', contents: goodContents, lastVisitDay: 10,
    pos: { x: 1, y: 2 },
    navPaths: { way_up: [{ x: 1, y: 2 }, { x: 2, y: 2 }] },
  });
  assert.deepEqual(Object.keys(out), ['20,-16:1'],
    'activeRec пишется под своей key; факт: '
    + JSON.stringify(Object.keys(out)));
  const rec = out['20,-16:1'];
  assert.deepEqual(rec, { contents: goodContents, lastVisitDay: 10,
    pos: { x: 1, y: 2 } },
    'запись — белый список {contents,lastVisitDay,pos}, navPaths НЕТ '
    + '(сейв v1 не тронут); факт: ' + JSON.stringify(rec));
  assert.ok(!('navPaths' in rec), 'navPaths — НЕ в разделе сейва');
  const m = D.restoreDungeonMemory(out, 10, 30);
  assert.ok(!('navPaths' in m.get('20,-16:1')),
    'restore — тот же белый список (утечка в сейв не вернётся)');
});

// --- N-JSON-1: 4 JSON — схемы, roundtrip, поля-контракт ---

function readJson(f) { return JSON.parse(fs.readFileSync(f, 'utf8')); }

test('N-JSON-1: assets/spells/way_up,way_down (000318.05) + assets/items/000512,000513 — схема-валидны, roundtrip-канон (000327 S5), поля: природа/wisdom/внебой/days 1/мани 6/здания [21,38]; свитки spell_scroll value 60 tier 2, effect.spell = ID, base_price НЕТ', () => {
  for (const f of [SPELL_UP_FILE, SPELL_DOWN_FILE,
    SCROLL_UP_FILE, SCROLL_DOWN_FILE]) {
    assert.ok(fs.existsSync(f),
      'RED: файл отсутствует — ' + path.relative(ROOT, f));
  }
  const spellSchema = readJson(path.join(SPELLS_DIR, 'schema.json'));
  const itemSchema = readJson(path.join(ITEMS_DIR, 'schema.json'));
  const upRaw = fs.readFileSync(SPELL_UP_FILE, 'utf8');
  const downRaw = fs.readFileSync(SPELL_DOWN_FILE, 'utf8');
  const upS = JSON.parse(upRaw);
  const downS = JSON.parse(downRaw);
  assert.equal(upRaw, JSON.stringify(upS, null, 2) + '\n',
    'way_up: канон JSON.stringify(obj,null,2)+\\n (roundtrip 000327 S5)');
  assert.equal(downRaw, JSON.stringify(downS, null, 2) + '\n',
    'way_down: канон roundtrip');
  const e1 = []; validate(spellSchema, upS, SPELL_UP_FILE, e1);
  assert.deepEqual(e1, [], 'way_up: схема-ошибки: ' + e1.join('; '));
  const e2 = []; validate(spellSchema, downS, SPELL_DOWN_FILE, e2);
  assert.deepEqual(e2, [], 'way_down: схема-ошибки: ' + e2.join('; '));
  assert.equal(upS.id, 'way_up', 'way_up: id');
  assert.equal(downS.id, 'way_down', 'way_down: id');
  for (const [s, id, name] of [[upS, 'way_up', 'Путь наверх'],
    [downS, 'way_down', 'Путь вниз']]) {
    assert.equal(s['название'], name, `${id}: название «${name}»`);
    assert.equal(s['школа'], 'природа', `${id}: школа — природа (решение анализа)`);
    assert.equal(s['атрибут'], 'wisdom', `${id}: атрибут — wisdom`);
    assert.equal(s['действие'], 'внебой', `${id}: действие — внебой`);
    assert.equal(s['вне_боя'], true, `${id}: вне_боя true`);
    assert.deepEqual(s['параметры'], { days: 1 },
      `${id}: параметры {days: 1} (1 день, кулдаунов нет)`);
    assert.equal(s['мани'], 6, `${id}: мани 6 (полоса L2 6–8, конвенция W-02)`);
    assert.equal(s['уровень'], 2, `${id}: уровень 2`);
    assert.equal(s['степень'], 1, `${id}: степень 1`);
    assert.equal(s['база'], null, `${id}: база null`);
    assert.deepEqual(s['здания'],
      ['assets/buildings/healing_temple.json', 'assets/buildings/mountain_temple.json'],
      `${id}: здания [21, 38] — общий якорь внебоевых природных`);
    assert.equal(s.icon, `assets/spell-icons/${id}.svg`, `${id}: icon`);
    assert.ok(typeof s.icon_prompt === 'string'
      && s.icon_prompt.trim().length > 0, `${id}: icon_prompt непустое`);
    assert.ok(typeof s['описание'] === 'string'
      && s['описание'].trim().length > 0, `${id}: описание непустое`);
  }
  assert.deepEqual(upS['предметы'], ['assets/items/000512.json'],
    'way_up: предметы — СВОЙ свиток 000512');
  assert.deepEqual(downS['предметы'], ['assets/items/000513.json'],
    'way_down: предметы — СВОЙ свиток 000513');
  const upRawI = fs.readFileSync(SCROLL_UP_FILE, 'utf8');
  const downRawI = fs.readFileSync(SCROLL_DOWN_FILE, 'utf8');
  const upI = JSON.parse(upRawI);
  const downI = JSON.parse(downRawI);
  assert.equal(upRawI, JSON.stringify(upI, null, 2) + '\n',
    'way_up_scroll: канон roundtrip');
  assert.equal(downRawI, JSON.stringify(downI, null, 2) + '\n',
    'way_down_scroll: канон roundtrip');
  const e3 = []; validate(itemSchema, upI, '000512.json', e3);
  assert.deepEqual(e3, [], 'way_up_scroll: схема-ошибки: ' + e3.join('; '));
  const e4 = []; validate(itemSchema, downI, '000513.json', e4);
  assert.deepEqual(e4, [], 'way_down_scroll: схема-ошибки: ' + e4.join('; '));
  const dataMod = loadSpellsData();
  for (const [it, id, name, spell] of [
    [upI, 'way_up_scroll', 'Свиток: Путь наверх', 'way_up'],
    [downI, 'way_down_scroll', 'Свиток: Путь вниз', 'way_down'],
  ]) {
    assert.equal(it.id, id, `${id}: id`);
    assert.equal(it.name, name, `${id}: name`);
    assert.equal(it.kind, 'spell_scroll', `${id}: kind spell_scroll`);
    assert.equal(it.weight, 0.2, `${id}: weight 0.2 (свиток)`);
    assert.equal(it.value, 60, `${id}: value 60 (калибровка beast_friend)`);
    assert.equal(it.tier, 2, `${id}: tier 2 (уровень 2 → «Знаток»)`);
    assert.deepEqual(it.effect, { kind: 'spell', spell },
      `${id}: effect {kind:'spell', spell:ID} — ссылка ID, НЕ путь (000327)`);
    assert.ok(dataMod.SPELLS_BY_ID[spell],
      `${id}: effect.spell «${spell}» ∈ SPELLS_BY_ID (контракт 000326/000327)`);
    assert.equal(it.icon, `assets/sprites/items/${id}.svg`, `${id}: icon`);
    assert.equal(it.base_price, undefined,
      `${id}: base_price НЕ фабрикуем (000322 — у свитков его нет)`);
  }
});

// --- N-JSON-2: 4 SVG — структурно валидны + sha256-уникальны ---

function svgFiles(dir) {
  return fs.readdirSync(path.join(ROOT, 'assets', dir))
    .filter((f) => f.endsWith('.svg'));
}

function sha256(f) {
  return crypto.createHash('sha256')
    .update(fs.readFileSync(path.join(ROOT, f))).digest('hex');
}

test('N-JSON-2: 4 новых SVG (spell-icons way_up/way_down + sprites/items way_{up,down}_scroll) — существуют, xmlns+viewBox без NaN/пустых атрибутов, sha256-уникальны среди каталога (паттерн W-05)', () => {
  const files = [
    'assets/spell-icons/way_up.svg', 'assets/spell-icons/way_down.svg',
    'assets/sprites/items/way_up_scroll.svg',
    'assets/sprites/items/way_down_scroll.svg',
  ];
  for (const f of files) {
    assert.ok(fs.existsSync(path.join(ROOT, f)),
      'RED: SVG отсутствует — ' + f);
  }
  for (const f of files) {
    const text = fs.readFileSync(path.join(ROOT, f), 'utf8');
    assert.ok(text.startsWith('<svg'), f + ': корень <svg>');
    assert.ok(text.includes('xmlns="http://www.w3.org/2000/svg"'),
      f + ': xmlns http://www.w3.org/2000/svg');
    assert.ok(/viewBox="0 0 \d+(\.\d+)? \d+(\.\d+)?"/.test(text),
      f + ': viewBox «0 0 W H» с конечными числами');
    assert.ok(!/(NaN|Infinity)/.test(text), f + ': NaN/Infinity нет');
    assert.ok(!/=""/.test(text), f + ': пустых атрибутов нет');
    assert.ok(text.trimEnd().endsWith('</svg>'), f + ': закрыт </svg>');
  }
  const spellIconHashes = new Map();
  for (const f of svgFiles('spell-icons')) {
    const h = sha256('assets/spell-icons/' + f);
    assert.ok(!spellIconHashes.has(h),
      'фикстура: дубль spell-icons в каталоге — ' + f);
    spellIconHashes.set(h, f);
  }
  for (const id of ['way_up', 'way_down']) {
    const h = sha256(`assets/spell-icons/${id}.svg`);
    assert.equal(spellIconHashes.get(id), undefined,
      `иконка ${id} должна ОТЛИЧАТЬСЯ от всех существующих (W-05)`);
    spellIconHashes.set(h, id);
  }
  const itemIconHashes = new Map();
  for (const f of svgFiles('sprites/items')) {
    const h = sha256('assets/sprites/items/' + f);
    assert.ok(!itemIconHashes.has(h),
      'фикстура: дубль sprites/items в каталоге — ' + f);
    itemIconHashes.set(h, f);
  }
  for (const id of ['way_up_scroll', 'way_down_scroll']) {
    const h = sha256(`assets/sprites/items/${id}.svg`);
    assert.equal(itemIconHashes.get(id), undefined,
      `иконка ${id} должна ОТЛИЧАТЬСЯ от всех существующих (W-05)`);
    itemIconHashes.set(h, id);
  }
  assert.notEqual(sha256('assets/spell-icons/way_up.svg'),
    sha256('assets/spell-icons/way_down.svg'),
    'way_up ≠ way_down иконки между собой');
});

// --- vm-харнес рендера (дубль boss-3x3-000330, пин-снапшот пена) ---

const ZOOM = 48;
const VW = 800, VH = 600;
// 9×5 @ 48: вьюпорт больше подземелья → камера центрирована (4.5, 2.5).
const CAM = { x: Z_W / 2, y: Z_H / 2 };

function makeContext2d(el) {
  const calls = el.drawCalls = [];
  const pen = {
    fillStyle: null, strokeStyle: null, globalAlpha: 1, lineWidth: 1,
  };
  return new Proxy({}, {
    get: (t, k) => (k in t ? t[k] : (...args) => {
      calls.push([k, args, Object.assign({}, pen)]);
    }),
    set: (t, k, v) => {
      if (k in pen) pen[k] = v;
      t[k] = v;
      return true;
    },
  });
}

function makeEl(tag, buttons) {
  const el = {
    tagName: tag,
    className: '',
    textContent: '',
    title: '',
    disabled: false,
    style: {},
    dataset: {},
    children: [],
    listeners: {},
    appendChild(ch) { this.children.push(ch); return ch; },
    remove() {},
    addEventListener(type, fn) {
      (this.listeners[type] || (this.listeners[type] = [])).push([fn]);
    },
    querySelectorAll() { return buttons; },
    getBoundingClientRect() { return { left: 0, top: 0 }; },
  };
  if (tag === 'canvas') {
    el.width = 0;
    el.height = 0;
    el.getContext = () => makeContext2d(el);
  }
  return el;
}

function findCanvas(el) {
  if (el.tagName === 'canvas') return el;
  for (const ch of el.children || []) {
    const found = findCanvas(ch);
    if (found) return found;
  }
  return null;
}

function loadDungeonUiSandbox(opts = {}) {
  const errors = [];
  const buttons = [];
  const document = {
    createElement: (tag) => {
      const el = makeEl(tag, buttons);
      if (tag === 'button') buttons.push(el);
      return el;
    },
    body: makeEl('body', buttons),
  };
  const window = { innerWidth: 800, innerHeight: 600, addEventListener() {} };
  const sandbox = {
    console: { error: (m) => errors.push(String(m)) },
    document, window,
  };
  if (opts.performance) sandbox.performance = opts.performance;
  vm.createContext(sandbox);
  const chain = ['global-settings.js', 'perlin.js', 'map.js',
    'controls.js', 'dungeon.js', 'locations.js'];
  if (opts.withSprites) chain.push('sprites.js');
  chain.push('dungeon-ui.js', 'motion.js');
  for (const f of chain) vm.runInContext(src(f), sandbox, { filename: f });
  return { G: sandbox.Game, body: document.body, errors };
}

function makeSpriteLoader(G) {
  const ready = new Set();
  for (const frames of Object.values(G.MOB_FRAMES)) {
    for (const p of frames) ready.add(p);
  }
  const imgs = new Map();
  return {
    isReady: (p) => ready.has(p),
    image: (p) => {
      if (!ready.has(p)) return null;
      if (!imgs.has(p)) imgs.set(p, { __img: p });
      return imgs.get(p);
    },
  };
}

function makeNavState(navPaths) {
  const s = {
    dg: zShape(),
    contents: { chests: [], mobs: [], deposits: [] },
    x: 1, y: 1,
    log: ['фикстура 000333'],
  };
  if (navPaths) s.navPaths = navPaths;
  return s;
}

// Сегменты линии: beginPath с нужным strokeStyle → moveTo/lineTo → stroke.
function navSegments(calls, color) {
  const segs = [];
  let cur = null;
  for (const [k, args, pen] of calls) {
    if (k === 'beginPath') {
      cur = pen.strokeStyle === color ? [] : null;
    } else if ((k === 'moveTo' || k === 'lineTo') && cur) {
      cur.push([args[0], args[1]]);
    } else if (k === 'stroke' && cur && cur.length >= 2) {
      segs.push(cur);
      cur = null;
    }
  }
  return segs;
}

// --- N-REND-UP: линия way_up — ровно путь, цвет «верхнего», alpha 0.5 ---

test('N-REND-UP: ds.navPaths.way_up = Z-путь → 8 сегментов-пар центров клеток со strokeStyle #59ffb0, globalAlpha 0.5 (ровно путь, ПОД exit-маркером), way_down-цветa нет', () => {
  const { G, body, errors } = loadDungeonUiSandbox({
    withSprites: true, performance: { now: () => 1000 },
  });
  assert.equal(errors.length, 0, 'ошибок загрузки цепочки нет');
  G.dungeonUI.start({
    state: makeNavState({ way_up: Z_PATH }),
    onMove() {}, zoom: ZOOM, visionMult: 3,
    spriteLoader: makeSpriteLoader(G),
  });
  const calls = findCanvas(body).drawCalls;
  const P = (x, y) => G.worldToScreen(x, y, CAM.x, CAM.y, ZOOM, VW, VH);
  const segs = navSegments(calls, NAV_COLOR_UP);
  assert.equal(segs.length, 8,
    '8 сегментов единственного пути (9 центров); факт: ' + segs.length);
  for (let i = 0; i < 8; i++) {
    const a = P(Z_PATH[i].x + 0.5, Z_PATH[i].y + 0.5);
    const b = P(Z_PATH[i + 1].x + 0.5, Z_PATH[i + 1].y + 0.5);
    assert.deepEqual(segs[i], [[a.x, a.y], [b.x, b.y]],
      'сегмент ' + i + ' — ЦЕНТРЫ клеток (' + Z_PATH[i].x + ',' + Z_PATH[i].y
      + ')→(' + Z_PATH[i + 1].x + ',' + Z_PATH[i + 1].y + '); факт: '
      + JSON.stringify(segs[i]));
  }
  const penOf = calls.find((c) => c[0] === 'stroke'
    && c[2].strokeStyle === NAV_COLOR_UP);
  assert.ok(penOf, 'stroke с нав-цветом есть');
  assert.equal(penOf[2].globalAlpha, NAV_ALPHA,
    'globalAlpha 0.5 — полупрозрачность по ТЗ');
  assert.equal(penOf[2].lineWidth, Math.max(2, ZOOM * 0.22),
    'lineWidth = max(2, zoom × 0.22)');
  assert.ok(!navSegments(calls, NAV_COLOR_DOWN).length,
    'way_down-линии нет (только way_up в navPaths)');
  const exitMarker = calls.findIndex((c) => c[0] === 'fillRect'
    && c[2].fillStyle === '#d4b45a');
  const firstStroke = calls.findIndex((c) => c[0] === 'stroke'
    && c[2].strokeStyle === NAV_COLOR_UP);
  assert.ok(firstStroke >= 0 && exitMarker >= 0
    && firstStroke < exitMarker,
    'линия — floor-level, ДО exit-маркера (порядок слоёв 000330-фиксация)');
  // регрессия: без navPaths — нав-штрихов нет.
  const sb2 = loadDungeonUiSandbox({
    withSprites: true, performance: { now: () => 1000 },
  });
  sb2.G.dungeonUI.start({
    state: makeNavState(null),
    onMove() {}, zoom: ZOOM, visionMult: 3,
    spriteLoader: makeSpriteLoader(sb2.G),
  });
  const calls2 = findCanvas(sb2.body).drawCalls;
  assert.equal(navSegments(calls2, NAV_COLOR_UP).length, 0,
    'без navPaths — штрихов way_up-цвета нет (регрессия рендера)');
  assert.equal(navSegments(calls2, NAV_COLOR_DOWN).length, 0,
    'без navPaths — штрихов way_down-цвета нет');
});

// --- N-REND-DOWN: цвет «нижнего» + различность + туман-gate ---

test('N-REND-DOWN: way_down → strokeStyle #ff7a4d (≠ цвета way_up — ассерт); ОБЕ линии сосуществуют; туман-gate: сегмент с концом в тумане (mask 0) отсутствует (default R=5: (7,3) вне видимости)', () => {
  assert.notEqual(NAV_COLOR_UP, NAV_COLOR_DOWN,
    'цвета РАЗНЫЕ по ТЗ (верхний — мятный, нижний — остров-красный)');
  const { G, body, errors } = loadDungeonUiSandbox({
    withSprites: true, performance: { now: () => 1000 },
  });
  assert.equal(errors.length, 0, 'ошибок загрузки цепочки нет');
  G.dungeonUI.start({
    state: makeNavState({ way_up: Z_PATH, way_down: Z_PATH }),
    onMove() {}, zoom: ZOOM, visionMult: 3,
    spriteLoader: makeSpriteLoader(G),
  });
  const calls = findCanvas(body).drawCalls;
  const up = navSegments(calls, NAV_COLOR_UP);
  const down = navSegments(calls, NAV_COLOR_DOWN);
  assert.equal(up.length, 8, 'обе линии сосуществуют: way_up — 8 сегментов');
  assert.equal(down.length, 8, 'way_down — 8 сегментов');
  const downPen = calls.find((c) => c[0] === 'stroke'
    && c[2].strokeStyle === NAV_COLOR_DOWN);
  assert.equal(downPen[2].globalAlpha, NAV_ALPHA,
    'way_down — та же полупрозрачность 0.5');
  // Туман-gate: без visionMult (R=5) клетка (7,3) вне радиуса от (1,1),
  // explored пуста → mask[(3)*9+7] === 0 → последний сегмент НЕ рисуется.
  const sb2 = loadDungeonUiSandbox({
    withSprites: true, performance: { now: () => 1000 },
  });
  sb2.G.dungeonUI.start({
    state: makeNavState({ way_up: Z_PATH }),
    onMove() {}, zoom: ZOOM,
    spriteLoader: makeSpriteLoader(sb2.G),
  });
  const calls2 = findCanvas(sb2.body).drawCalls;
  const segs2 = navSegments(calls2, NAV_COLOR_UP);
  assert.equal(segs2.length, 7,
    'туман-gate: 8−1 сегмент (конец (7,3) в тумане — маска 0); факт: '
    + segs2.length);
  const P = (x, y) => sb2.G.worldToScreen(x, y, CAM.x, CAM.y, ZOOM, VW, VH);
  const far = P(7.5, 3.5);
  assert.ok(!segs2.some((s) => s.some(([x, y]) =>
    Math.abs(x - far.x) <= 1e-9 && Math.abs(y - far.y) <= 1e-9)),
    'центр затуманенной клетки (7,3) НЕ участвует в линии (map-reveal запрещён)');
});

// --- N-SWEEP-0: паттерн spell-links-000327 для новых записей ---

test('N-SWEEP-0: way_up/way_down проходят паттерн sweep 000327 локально: школа ∈ enum-6, атрибут ∈ {intelligence,wisdom}, summon-бижекция не нарушена; свитки — effect.spell ∈ каталога', () => {
  const SCHOOLS = ['огонь', 'лёд', 'тень', 'исцеление', 'защита', 'природа'];
  const dataMod = loadSpellsData();
  assert.ok(fs.existsSync(SPELL_UP_FILE) && fs.existsSync(SPELL_DOWN_FILE),
    'RED: JSON заклинаний нет');
  for (const f of [SPELL_UP_FILE, SPELL_DOWN_FILE]) {
    const j = readJson(f);
    assert.ok(SCHOOLS.includes(j['школа']),
      `${j.id}: школа ∈ enum-6 (sweep S1)`);
    assert.ok(['intelligence', 'wisdom'].includes(j['атрибут']),
      `${j.id}: атрибут ∈ enum (sweep S2)`);
    const isSummon = j['действие'] === 'призыв';
    const summon = j['параметры'] && j['параметры'].summon;
    assert.equal(isSummon && typeof summon !== 'string', false,
      `${j.id}: призыв без summon (бижекция S3)`);
    assert.equal(!isSummon && typeof summon === 'string', false,
      `${j.id}: summon без действия «призыв» (бижекция S3)`);
    assert.ok(dataMod.SPELLS_BY_ID[j.id],
      `${j.id}: запись ∈ зеркале SPELLS_BY_ID (sync — тот же коммит)`);
    const mirror = dataMod.SPELLS_BY_ID[j.id];
    assert.equal(mirror['школа'], j['школа'],
      `${j.id}: зеркало совпадает (школа)`);
  }
  for (const f of [SCROLL_UP_FILE, SCROLL_DOWN_FILE]) {
    assert.ok(fs.existsSync(f), 'RED: свиток нет — ' + path.basename(f));
    const j = readJson(f);
    assert.equal(j.kind, 'spell_scroll', `${j.id}: kind`);
    assert.ok(dataMod.SPELLS_BY_ID[j.effect.spell],
      `${j.id}: effect.spell «${j.effect.spell}» ∈ каталогу (000326/000327)`);
  }
});

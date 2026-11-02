// Задача 000293: иконка постройки в диалоге «Строительство» — из JSON
// постройки (поле icon — единый источник, без слотовых параллельных
// резолвов); иконка = вид постройки на глобальной карте и в городе.
// Контракт: memory/000293-building-icon-json.md.
//
// Краснота осмысленная (функционал ТЗ не существует): поле icon НЕТ в
// 55 JSON, в schema.json и в зеркале src/buildings.js; диалог резолвит
// иконку по слот-спрайту (buildIconPath → buildingSprite(слот)) —
// падение «undefined vs путь» / «база слота vs свой арт», не синтаксис.
//
// BI-1: 29 записей с «спрайт» — icon === «спрайт» (вид на карте/в
//       городе — конструктивно), файл существует.
// BI-2: 26 записей без «спрайт» — icon = assets/building-icons/
//       0000NN.svg (имя по id), icon_prompt непустой, файл существует;
//       26 SVG — 24×24/viewBox/xmlns/#e8dcc0/well-formed/пара-уникальны.
// BI-3: schema.json — properties.icon (union-паттерн) + icon_prompt;
//       icon — required (конец), icon_prompt — НЕ required;
//       additionalProperties:false.
// BI-4: зеркало src/buildings.js — у всех 55 icon === значению сырого
//       JSON (диалог читает каталожную запись).
// BI-5: диалог — a.icon всех 22 строк === icon сырого JSON; rename-city
//       без icon; 23 строки; меню открыт.
// BI-6: консистентность с артом карты/города — НЕЗАВИСИМЫМ резолвом
//       (sprites.js): слотовые 24 → buildingSprite(слот, id) (id-
//       приоритет), 47 → campSprite(47), 51–54 → citySprite(id).
// BI-7: деградация — запись каталога без icon → строка без a.icon
//       (нумерационный чип), меню 23 строки, console.error нет (тихая,
//       R8 000202).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'assets', 'buildings');

const B = require('../src/buildings.js');
const C = require('../src/cities.js');
const SP = require('../src/sprites.js');
const IT = require('../src/items.js');
const PLR = require('../src/player.js');
const BA = require('../src/building-actions.js');

// --- Каталог (сырые JSON — source of truth; зеркало — BI-4) ---

const FILES = fs.readdirSync(DIR)
  .filter((f) => /^\d{6}\.json$/.test(f)).sort();
const RECORDS = FILES.map((f) => ({
  file: f,
  data: JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')),
}));
const byId = {};
for (const r of RECORDS) byId[r.data.id] = r.data;

// 26 построек без «спрайт» — НОВЫЕ иконки (имя файла = id записи,
// механически, без параллельной таблицы имён — прецеденты spell-icons
// <id>.svg, sprites/loot <id>.svg).
const ICON_IDS = [5, 6, 9, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22,
  23, 24, 26, 27, 28, 29, 30, 32, 33, 34, 35, 50];
const ICON_DIR = 'assets/building-icons';
const iconPathFor = (id) => ICON_DIR + '/'
  + String(id).padStart(6, '0') + '.svg';

// Слот карты (map_index ИЛИ размещение.слот) — аргумент арт-резолва.
function slotOf(rec) {
  const op = (rec && rec.особые_параметры) || {};
  if (Number.isInteger(op.map_index)) return op.map_index;
  if (op.размещение && Number.isInteger(op.размещение.слот))
    return op.размещение.слот;
  return null;
}

// Арт-резолв «вид на карте/в городе» (sprites.js — НЕ каталог icon):
// защита от «icon = база слота» (старый багованный резолв диалога).
function mapArtFor(id) {
  if (id === 47) return SP.campSprite(47);
  if (id >= 51 && id <= 54) return SP.citySprite(id);
  return SP.buildingSprite(slotOf(byId[id]), id);
}

// --- Мини-проверка well-formedness SVG (баланс тегов; полная
// well-formedness всех SVG assets/ — обход tests/svg.test.js) ---

function svgTagBalance(s) {
  const tags = s.match(/<\/?[a-zA-Z][^>]*>/g) || [];
  const stack = [];
  for (const t of tags) {
    if (t.startsWith('</')) {
      const name = (t.match(/^<\/([a-zA-Z][\w.-]*)/) || [])[1];
      const top = stack.pop();
      if (top !== name) return 'закрытие «' + name + '» ≠ «' + top + '»';
    } else if (!t.endsWith('/>')) {
      const name = (t.match(/^<([a-zA-Z][\w.-]*)/) || [])[1];
      if (name) stack.push(name);
    }
  }
  return stack.length ? 'незакрытые: ' + stack.join(',') : null;
}

// --- Фикстура диалога «Строительство» (по образцу initCityBuild,
// tests/city-interact.test.js): пустая клетка (1,1) города fp 5 +
// реальный каталог (getBuilding → src/buildings.js) + реальный
// cities.js (D3/pre-check) + реальные flat-items (reason «Не хватает»)
// ---

function initBuildMenu(over = {}) {
  const ds = {
    kind: 'city',
    x: over.x === undefined ? 1 : over.x,
    y: over.y === undefined ? 1 : over.y,
    contents: null,
    cityContents: { buildings: [], seed: 1 },
    cityShops: {},
    cityWealth: 1,
    name: 'Деревня',
    dg: C.createCityLayout(100, -40, 5),
  };
  const calls = [];
  const deps = {
    game: {
      buildingUI: {
        open: (p) => { calls.push(p); },
        close: () => {},
        isActive: () => false,
      },
      npcUI: { close: () => {}, isActive: () => false },
      combatUI: { isActive: () => false },
      dungeonUI: { isActive: () => false },
      getBuilding: (id) => B.getBuilding(id),
      Cities: C,
      buildingEffects: { EFFECTS: {} },
    },
    clock: { day: 1 },
    hero: PLR.createCharacter(),
    questBook: { active: [], done: [] },
    player: { x: 9, y: 9 },
    prevPos: { x: 9, y: 9 },
    cityState: () => ds,
    getMap: () => ((x, y) => ({ x, y, passable: true })),
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
    mover: null,
  };
  deps.game.getItem = IT.getItem;
  deps.game.hasItem = IT.hasItem;
  deps.game.removeItem = IT.removeItem;
  deps.game.addItem = IT.addItem;
  deps.game.totalQty = IT.totalQty;
  BA.init(deps);
  return { deps, calls, ds };
}

function withConsoleErrorSink(fn) {
  const errs = [];
  const orig = console.error;
  console.error = (...a) => { errs.push(a.join(' ')); };
  try {
    fn();
  } finally {
    console.error = orig;
  }
  return errs;
}

const buildableIds = C.buildableBuildingIds();

test('BI-1. 000293: 29 записей с «спрайт» — icon = «спрайт» (вид постройки на глобальной карте и в городе), файл icon существует', () => {
  const withSprite = RECORDS.filter((r) =>
    typeof r.data.спрайт === 'string' && r.data.спрайт !== '');
  assert.equal(withSprite.length, 29,
    'контур R1: ровно 29 из 55 с «спрайт» (факт: ' + withSprite.length + ')');
  for (const r of withSprite) {
    const id = r.data.id;
    assert.equal(r.data.icon, r.data.спрайт,
      'RED: ' + id + ' «' + r.data.название + '» — icon = «спрайт» ('
      + r.data.спрайт + '); факт: ' + r.data.icon);
    assert.ok(fs.existsSync(path.join(ROOT, r.data.icon)),
      id + ': файл icon существует: ' + r.data.icon);
  }
});

test('BI-2. 000293: 26 записей без «спрайт» — icon = assets/building-icons/0000NN.svg (имя по id) + icon_prompt (конвенция заклинаний), файл существует; 26 SVG — 24×24/viewBox/xmlns/#e8dcc0/well-formed, парно-уникальны (sha256)', () => {
  const noSprite = RECORDS.filter((r) =>
    typeof r.data.спрайт !== 'string' || r.data.спрайт === '');
  assert.equal(noSprite.length, 26,
    'ровно 26 из 55 без «спрайт» (факт: ' + noSprite.length + ')');
  assert.deepEqual(
    noSprite.map((r) => r.data.id).sort((a, b) => a - b), ICON_IDS,
    'набор 26 — механика по id (55 − 29)');
  for (const r of noSprite) {
    const id = r.data.id;
    assert.equal(r.data.icon, iconPathFor(id),
      'RED: ' + id + ' «' + r.data.название + '» — icon по имени id ('
      + iconPathFor(id) + '); факт: ' + r.data.icon);
    assert.ok(typeof r.data.icon_prompt === 'string'
      && r.data.icon_prompt.trim() !== '',
      'RED: ' + id + ' — icon_prompt непустой (конвенция 000149); факт: '
      + r.data.icon_prompt);
    const f = path.join(ROOT, iconPathFor(id));
    assert.ok(fs.existsSync(f),
      'RED: файл ' + iconPathFor(id) + ' существует (каталог '
      + ICON_DIR + '/)');
    const s = fs.readFileSync(f, 'utf8');
    assert.ok(s.includes('xmlns="http://www.w3.org/2000/svg"'),
      id + ': xmlns svg');
    assert.ok(s.includes('width="24"') && s.includes('height="24"'),
      id + ': width/height 24');
    assert.ok(s.includes('viewBox="0 0 24 24"'), id + ': viewBox 0 0 24 24');
    assert.ok(s.includes('fill="#e8dcc0"'), id + ': fill #e8dcc0');
    assert.ok(!/\bNaN\b|\bInfinity\b/.test(s), id + ': без NaN/Infinity');
    const bal = svgTagBalance(s);
    assert.equal(bal, null, id + ': well-formed (баланс тегов): ' + bal);
  }
  const byHash = new Map();
  for (const id of ICON_IDS) {
    const f = path.join(ROOT, iconPathFor(id));
    if (!fs.existsSync(f)) continue;
    const h = crypto.createHash('sha256')
      .update(fs.readFileSync(f)).digest('hex');
    assert.ok(!byHash.has(h),
      iconPathFor(id) + ' == ' + byHash.get(h) + ': дубль иконки (копия)');
    byHash.set(h, iconPathFor(id));
  }
  assert.equal(byHash.size, 26,
    '26 парно-уникальных sha256 (факт: ' + byHash.size + ')');
});

test('BI-3. 000293: schema.json — properties.icon (union-паттерн sprites/buildings|cities|building-icons) + properties.icon_prompt; icon — required (конец), icon_prompt — НЕ required; additionalProperties:false', () => {
  const s = JSON.parse(
    fs.readFileSync(path.join(DIR, 'schema.json'), 'utf8'));
  assert.equal(s.additionalProperties, false,
    'additionalProperties:false (свойства обязательны)');
  assert.deepEqual(s.properties.icon,
    { type: 'string',
      pattern: '^assets/(sprites/(buildings|cities)'
        + '|building-icons)/[\\w]+\\.svg$' },
    'RED: properties.icon — точная форма; факт: '
    + JSON.stringify(s.properties.icon));
  assert.deepEqual(s.properties.icon_prompt,
    { type: 'string', pattern: '^\\S(.*\\S)?$' },
    'RED: properties.icon_prompt — точная форма; факт: '
    + JSON.stringify(s.properties.icon_prompt));
  assert.ok(Array.isArray(s.required), 'required — массив');
  assert.ok(s.required.includes('icon'), 'RED: icon в required');
  assert.equal(s.required[s.required.length - 1], 'icon',
    'RED: icon — КОНЕЦ required (id — required[0], «спрайт» не '
    + 'required — не тронуто); факт: ' + s.required.join(','));
  assert.ok(!s.required.includes('icon_prompt'),
    'icon_prompt НЕ в required (опциональное поле-сопровождение)');
});

test('BI-4. 000293: зеркало src/buildings.js — у всех 55 icon = значению сырого JSON-файла (строка; источник данных диалога — 22 buildable)', () => {
  assert.equal(buildableIds.length, 22,
    'набор D3 — ровно 22 (факт: ' + buildableIds.length + ')');
  for (const r of RECORDS) {
    const id = r.data.id;
    const rec = B.getBuilding(id);
    assert.ok(rec, id + ': запись в зеркале');
    assert.equal(typeof rec.icon, 'string',
      'RED: ' + id + ' «' + r.data.название + '» — icon в зеркале '
      + '(строка); факт: ' + rec.icon);
    assert.equal(rec.icon, r.data.icon,
      'RED: ' + id + ' — зеркало === сырой JSON (' + r.data.icon
      + '); факт: ' + rec.icon);
  }
  for (const id of buildableIds) {
    assert.equal(B.getBuilding(id).icon, byId[id].icon,
      'RED: ' + id + ' (buildable) — диалоговый источник: зеркало '
      + '=== JSON; факт: ' + B.getBuilding(id).icon);
  }
});

test('BI-5. 000293: диалог «Строительство» — a.icon всех 22 строк = значению icon из JSON (единый источник — каталожная запись); rename-city — без icon; ровно 23 строки; меню открыт', () => {
  const t = initBuildMenu();
  t.deps.game.buildingSprite = SP.buildingSprite;
  BA.interactCity();
  assert.equal(t.calls.length, 1, 'меню открыто (buildingUI.open ×1)');
  const p = t.calls[0];
  assert.equal(p.title, 'Строительство', 'заголовок «Строительство»');
  assert.equal(p.actions.length, 23,
    'ровно 23 строки (22 набора D3 + «Переименовать город»)');
  for (const id of buildableIds) {
    const row = p.actions.find((a) => a.id === 'build-' + id);
    assert.ok(row, 'строка build-' + id + ' в меню');
    assert.equal(typeof row.icon, 'string',
      'RED: строка build-' + id + ' — icon строкой-путём (из JSON); '
      + 'факт: ' + row.icon);
    assert.equal(row.icon, byId[id].icon,
      'RED: строка build-' + id + ' — a.icon = icon сырого JSON ('
      + byId[id].icon + '); факт: ' + row.icon);
  }
  const rename = p.actions.find((a) => a.id === 'rename-city');
  assert.ok(rename, 'строка rename-city в меню');
  assert.equal(rename.icon, undefined,
    'rename-city — без icon (нумерационный чип, 000148.05)');
});

test('BI-6. 000293: icon = вид на глобальной карте и в городе — НЕЗАВИСИМЫМ резолвом (sprites.js): 24 слотовые записи → buildingSprite(слот, id) (id-приоритет), 47 → campSprite(47), 51–54 → citySprite(id)', () => {
  const withSprite = RECORDS.filter((r) =>
    typeof r.data.спрайт === 'string' && r.data.спрайт !== '');
  assert.equal(withSprite.length, 29,
    '29 записей с артом (факт: ' + withSprite.length + ')');
  let slotCount = 0, campCount = 0, cityCount = 0;
  for (const r of withSprite) {
    const id = r.data.id;
    if (id === 47) campCount += 1;
    else if (id >= 51 && id <= 54) cityCount += 1;
    else slotCount += 1;
    const art = mapArtFor(id);
    assert.ok(typeof art === 'string' && art !== '',
      id + ' «' + r.data.название + '»: арт карты/города резолвится; '
      + 'факт: ' + art);
    assert.equal(r.data.icon, art,
      'RED: ' + id + ' «' + r.data.название + '» — icon = арт '
      + 'карты/города (' + art + '); факт: ' + r.data.icon);
  }
  assert.equal(slotCount, 24, '24 слотовые (факт: ' + slotCount + ')');
  assert.equal(campCount, 1, 'лагерь 47 (факт: ' + campCount + ')');
  assert.equal(cityCount, 4, 'города 51–54 (факт: ' + cityCount + ')');
});

test('BI-7. 000293: деградация — запись каталога БЕЗ icon → строка без a.icon (нумерационный чип в UI), меню 23 строки, console.error нет (тихая деградация R8 000202)', () => {
  const t = initBuildMenu();
  t.deps.game.buildingSprite = SP.buildingSprite;
  const origGet = t.deps.game.getBuilding;
  t.deps.game.getBuilding = (id) => {
    const rec = origGet(id);
    if (!rec) return null;
    const { icon, icon_prompt, ...rest } = rec;
    return rest;
  };
  const errs = withConsoleErrorSink(() => BA.interactCity());
  assert.equal(t.calls.length, 1, 'меню открывается (деградация, не сбой)');
  const p = t.calls[0];
  assert.equal(p.actions.length, 23, 'ровно 23 строки (деградация)');
  for (const a of p.actions) {
    assert.equal(a.icon, undefined,
      'RED: строка ' + a.id + ' — a.icon undefined (запись без icon); '
      + 'факт: ' + a.icon);
  }
  assert.equal(errs.length, 0,
    'деградация без console.error: ' + JSON.stringify(errs));
});

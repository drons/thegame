// Каталог крафта (assets/craft) — задача 000024.
//
// Проверяем:
//  * нумерацию файлов 000001.json … N подряд, без чужих файлов;
//  * валидность каждого файла по assets/craft/schema.json (минимальный
//    валидатор, допустимые ключи — ALLOWED_SCHEMA_KEYS, задача 000015);
//  * правила каталога: уникальные id, тип из списка видов,
//    исходник ≠ предмет-результат, без дублей в списках;
//  * ссылочную целостность: результат/исходники → assets/items
//    (src/items.js), навыки → assets/skills (src/player.js),
//    здания → assets/buildings (src/buildings.js), заклинания →
//    assets/spells (JSON-каталог, задача 000023 — src-модуля ещё нет);
//  * улучшенные способы («база»): тот же вид и результат, уровень не
//    ниже, исходники не меньше базовых, цепочки без циклов;
//  * покрытие: есть улучшенный способ и рецепт со «заклинания».

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { getItem } = require('../src/items.js');
const { getBuilding } = require('../src/buildings.js');
const { PRIMARY_SKILLS, SECONDARY_SKILLS } = require('../src/player.js');

const DIR = path.join(__dirname, '..', 'assets', 'craft');
const SPELLS_DIR = path.join(__dirname, '..', 'assets', 'spells');

// Минимальный валидатор JSON-схем — общий модуль (задача 000015):
// tests/json-schema.js (допустимые ключи — ALLOWED_SCHEMA_KEYS).
const { validate, ALLOWED_SCHEMA_KEYS } = require('./json-schema.js');

// Виды крафта (spec/craft.md «Виды крафта»).
const CRAFT_TYPES = new Set([
  'кузнечное_дело', 'алхимия', 'резьба_по_камню',
  'столярное_дело', 'зачарование', 'рунопись',
]);

function listCraftFiles() {
  return fs.readdirSync(DIR)
    .filter((f) => /^\d{6}\.json$/.test(f))
    .sort();
}

// Каталог: Map<id, {file, data}>.
function loadCatalog() {
  const all = fs.readdirSync(DIR).sort();
  const byId = new Map();
  for (const f of all) {
    if (f === 'schema.json') continue;
    assert.match(f, /^\d{6}\.json$/, `чужой файл в каталоге крафта: ${f}`);
    const data = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
    assert.ok(!byId.has(data.id), `дубликат id рецепта "${data.id}" в ${f}`);
    byId.set(data.id, { file: f, data });
  }
  return { all, byId };
}

// Id заклинаний каталога assets/spells (задача 000023; src-модуля нет).
function loadSpellIds() {
  const ids = new Set();
  for (const f of fs.readdirSync(SPELLS_DIR)) {
    if (!/^\d{6}\.json$/.test(f)) continue;
    const data = JSON.parse(
      fs.readFileSync(path.join(SPELLS_DIR, f), 'utf8'));
    ids.add(data.id);
  }
  return ids;
}

function loadSchema() {
  return JSON.parse(fs.readFileSync(path.join(DIR, 'schema.json'), 'utf8'));
}

// --- Нумерация ---

test('каталог: нумерация файлов 000001..N подряд', () => {
  const files = listCraftFiles();
  assert.ok(files.length >= 8, 'каталог подозрительно маленький');
  files.forEach((f, i) => {
    assert.equal(f, String(i + 1).padStart(6, '0') + '.json',
      `пробел в нумерации на позиции ${i + 1}: ${f}`);
  });
});

test('каталог: чужих файлов нет (только NNNNNN.json и schema.json)', () => {
  for (const f of fs.readdirSync(DIR).sort()) {
    assert.ok(/^\d{6}\.json$/.test(f) || f === 'schema.json',
      `чужой файл в каталоге крафта: ${f}`);
  }
});

// --- Схема ---

test('schema.json: только ключи минимального валидатора (000015)', () => {
  const schema = loadSchema();
  let keyCount = 0;
  // Рекурсия: properties/items/oneOf/anyOf — под-схемы; массивы required
  // и enum содержат простые значения — листы.
  (function walk(node, where) {
    if (Array.isArray(node)) {
      node.forEach((v, i) => walk(v, `${where}[${i}]`));
      return;
    }
    assert.ok(node && typeof node === 'object',
      `схема: узел в ${where} не объект`);
    for (const [k, v] of Object.entries(node)) {
      keyCount += 1;
      assert.ok(ALLOWED_SCHEMA_KEYS.has(k),
        `схема: недопустимый ключ "${k}" в ${where}`);
      if (v === null) continue;
      if (k === 'properties' && v && typeof v === 'object' && !Array.isArray(v)) {
        // Ключи properties — имена полей данных, не ключи схемы.
        for (const [fname, fschema] of Object.entries(v)) {
          walk(fschema, `${where}.properties.${fname}`);
        }
      } else if (k === 'items' || k === 'oneOf' || k === 'anyOf') {
        walk(v, `${where}.${k}`);
      }
    }
  })(schema, '$');
  assert.ok(keyCount > 5, 'схема подозрительно маленькая');
});

test('каждый файл: валиден по schema.json (минимальный валидатор)', () => {
  const schema = loadSchema();
  const files = listCraftFiles();
  for (const f of files) {
    const data = JSON.parse(
      fs.readFileSync(path.join(DIR, f), 'utf8'));
    const errors = [];
    validate(schema, data, f, errors);
    assert.deepEqual(errors, [], `${f}: ${errors.join('; ')}`);
  }
});

// --- Правила каталога ---

test('правила: уникальные id, тип из списка, исходник ≠ результат', () => {
  const { byId } = loadCatalog();
  assert.ok(byId.size >= 8, 'каталог подозрительно маленький');
  const types = new Set();
  for (const { file, data } of byId.values()) {
    assert.match(data.id, /^[a-z][a-z0-9_]*$/, `${file}: id "${data.id}"`);
    assert.ok(CRAFT_TYPES.has(data.тип),
      `${file}: неизвестный тип крафта "${data.тип}"`);
    types.add(data.тип);
    assert.ok(getItem(data.результат.предмет) !== null,
      `${file}: результат "${data.результат.предмет}" нет в items`);
    // Исходники: без дублей, исходник не совпадает с результатом.
    const inputs = new Set();
    for (const inp of data.исходники) {
      assert.ok(getItem(inp.предмет) !== null,
        `${file}: исходник "${inp.предмет}" нет в items`);
      assert.ok(!inputs.has(inp.предмет),
        `${file}: дубль исходника "${inp.предмет}"`);
      inputs.add(inp.предмет);
      assert.notEqual(inp.предмет, data.результат.предмет,
        `${file}: исходник совпадает с предметом-результатом`);
    }
    // Списки навыков/зданий/заклинаний — без дублей.
    for (const [name, list] of [['навыки', data.навыки],
                                ['здания', data.здания],
                                ['заклинания', data.заклинания || []]]) {
      assert.equal(new Set(list).size, list.length,
        `${file}: дубли в «${name}»`);
    }
  }
  // В enum схемы и в каталоге — согласованные виды.
  assert.deepEqual([...CRAFT_TYPES].sort(),
    [...loadSchema().properties.тип.enum].sort(),
    'enum вида в схеме = список видов крафта');
  assert.ok(types.size >= 2, 'рецепты должны покрывать несколько видов');
});

// --- Ссылочная целостность ---

test('ссылки: навыки → assets/skills, здания → assets/buildings', () => {
  const { byId } = loadCatalog();
  const knownSkill = (id) =>
    SECONDARY_SKILLS[id] !== undefined ||
    PRIMARY_SKILLS.some((p) => p.id === id);
  for (const { file, data } of byId.values()) {
    for (const s of data.навыки) {
      assert.ok(knownSkill(s),
        `${file}: навык "${s}" нет в каталоге assets/skills`);
    }
    for (const b of data.здания) {
      assert.ok(Number.isInteger(b) && b >= 1 && b <= 50,
        `${file}: постройка ${b} вне диапазона 1..50 каталога`);
      assert.ok(getBuilding(b) !== null,
        `${file}: здание id=${b} нет в каталоге assets/buildings`);
    }
  }
});

test('ссылки: заклинания → assets/spells (каталог задачи 000023)', () => {
  const spellIds = loadSpellIds();
  assert.ok(spellIds.size >= 10, 'каталог заклинаний подозрительно маленький');
  const { byId } = loadCatalog();
  for (const { file, data } of byId.values()) {
    for (const sp of (data.заклинания || [])) {
      assert.ok(spellIds.has(sp),
        `${file}: заклинание "${sp}" нет в каталоге assets/spells`);
    }
  }
});

test('улучшенные способы: «база» → рецепт каталога, без циклов', () => {
  const { byId } = loadCatalog();
  for (const { file, data } of byId.values()) {
    if (data.база === undefined) continue;
    const base = byId.get(data.база);
    assert.ok(base, `${file}: базовый рецепт "${data.база}" нет в каталоге`);
    assert.notEqual(data.база, data.id, `${file}: цикл «база» на самом себе`);
    assert.equal(base.data.тип, data.тип,
      `${file}: улучшенный способ другого вида, чем базовый`);
    assert.equal(base.data.результат.предмет, data.результат.предмет,
      `${file}: улучшенный способ даёт другой предмет, чем базовый`);
    assert.ok(data.уровень >= base.data.уровень,
      `${file}: уровень ${data.уровень} ниже уровня базового (${base.data.уровень})`);
    // Исходники улучшенного способа покрывают исходники базового.
    const baseQty = new Map(base.data.исходники
      .map((i) => [i.предмет, i.количество]));
    const qty = new Map();
    for (const i of data.исходники) qty.set(i.предмет, (qty.get(i.предмет) || 0) + i.количество);
    for (const [item, n] of baseQty) {
      assert.ok((qty.get(item) || 0) >= n,
        `${file}: исходник "${item}" (нужно ${n}) меньше, чем в базовом способе`);
    }
    // Обход цепочки «база» завершается (циклов нет).
    const seen = new Set();
    let cur = data;
    let guard = 0;
    while (cur && cur.база !== undefined) {
      assert.ok(++guard <= byId.size, `${file}: цикл в цепочке «база»`);
      assert.ok(!seen.has(cur.id), `${file}: цикл на "${cur.id}"`);
      seen.add(cur.id);
      cur = byId.get(cur.база).data;
    }
  }
});

// --- Покрытие требований задачи 000024 ---

test('с нуля: столяр, камнерез, кузнец и алхимик (задача 000044)', () => {
  // «С нуля»-рецепты: исходники — сырьевые reagent-предметы, а не
  // готовые снаряжение/зелья. До задачи 000044 в каталоге были только
  // рецепты-улучшения, виды столярное_дело и резьба_по_камню пусты.
  const { byId } = loadCatalog();
  const recipes = [...byId.values()].map((x) => x.data);
  const hasInput = (r, id) =>
    r.исходники.some((i) => i.предмет === id);
  const find = (pred, what) => {
    const hit = recipes.filter(pred);
    assert.ok(hit.length >= 1, 'нет рецепта: ' + what);
    return hit[0];
  };

  // Столярное дело: деревянный меч и лук — из древесины.
  find((r) => r.результат.предмет === 'wood_sword'
    && r.тип === 'столярное_дело'
    && hasInput(r, 'wood_log'), 'деревянный меч из древесины (столярное дело)');
  find((r) => r.результат.предмет === 'short_bow'
    && r.тип === 'столярное_дело'
    && hasInput(r, 'wood_log'), 'короткий лук из древесины (столярное дело)');

  // Резьба по камню: резец из камня и огранка лунного камня.
  find((r) => r.результат.предмет === 'stone_chisel'
    && r.тип === 'резьба_по_камню'
    && hasInput(r, 'stone_chunk'), 'каменный резец из камня (резьба по камню)');
  find((r) => r.результат.предмет === 'moonstone'
    && r.тип === 'резьба_по_камню'
    && hasInput(r, 'stone_chunk'), 'лунный камень из каменных обломков (резьба по камню)');

  // Кузнечное дело: железный меч из руды (альтернатива перковке)
  // и кожаная броня из кожи.
  find((r) => r.результат.предмет === 'iron_sword'
    && r.тип === 'кузнечное_дело'
    && hasInput(r, 'iron_ore'), 'железный меч из руды (кузнечное дело)');
  find((r) => r.результат.предмет === 'leather_armor'
    && r.тип === 'кузнечное_дело'
    && hasInput(r, 'hide'), 'кожаная броня из кожи (кузнечное дело)');

  // Алхимия: базовые зелья из трав.
  find((r) => r.результат.предмет === 'minor_healing'
    && r.тип === 'алхимия'
    && r.исходники.some((i) => i.предмет.startsWith('herb_')),
    'малое зелье лечения из трав (алхимия)');
  find((r) => r.результат.предмет === 'mana_potion'
    && r.тип === 'алхимия'
    && r.исходники.some((i) => i.предмет.startsWith('herb_')),
    'зелье маны из трав (алхимия)');
});

test('покрытие: каталог покрывает все шесть видов крафта (задача 000044)', () => {
  const { byId } = loadCatalog();
  const types = new Set([...byId.values()].map((x) => x.data.тип));
  for (const t of CRAFT_TYPES) {
    assert.ok(types.has(t), 'нет ни одного рецепта вида «' + t + '»');
  }
});

test('покрытие: есть улучшенный способ и рецепт со «заклинания»', () => {
  const { byId } = loadCatalog();
  const improved = [...byId.values()].filter((x) => x.data.база !== undefined);
  assert.ok(improved.length >= 1, 'нет ни одного улучшенного способа (база)');
  const withSpells = [...byId.values()].filter((x) => x.data.заклинания);
  assert.ok(withSpells.length >= 1,
    'нет ни одного рецепта, связанного с заклинаниями');
  // Каждый рецепт ссылается на всё, что требует задача:
  // результат/исходники (items), навыки (skills), здания (buildings).
  for (const { file, data } of byId.values()) {
    assert.ok(data.результат && data.результат.предмет, `${file}: нет результата`);
    assert.ok(data.исходники.length >= 1, `${file}: нет исходников`);
    assert.ok(data.навыки.length >= 1, `${file}: нет навыков`);
    assert.ok(data.здания.length >= 1, `${file}: нет зданий`);
  }
});

// --- Задача 000046: игровой код крафта (TDD: красные тесты) ---
//
// Модули ещё не существуют — эти тесты падают до реализации. Ленивый
// require: отсутствие модуля не ломает старые тесты каталога (000024/
// 000044) в этом файле.

function loadCraftData() { return require('../src/craft-data.js'); }

test('craft-data.js: точное зеркало каталога JSON (задача 000046)', () => {
  const { CRAFT, CRAFT_BY_ID } = loadCraftData();
  const files = listCraftFiles();
  assert.ok(files.length >= 16, 'каталог подозрительно маленький');
  assert.equal(CRAFT.length, files.length,
    'CRAFT — по одному рецепту на файл каталога');
  // Порядок CRAFT = порядок файлов каталога; данные — дословно.
  files.forEach((f, i) => {
    const data = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
    assert.equal(CRAFT[i].id, data.id, `позиция ${i}: порядок файлов`);
    assert.deepEqual(CRAFT[i], data, `${f}: зеркало CRAFT не совпадает`);
    assert.equal(CRAFT_BY_ID[data.id], CRAFT[i],
      `${f}: CRAFT_BY_ID — те же объекты (идентичность)`);
  });
  assert.equal(Object.keys(CRAFT_BY_ID).length, files.length,
    'CRAFT_BY_ID — все id каталога');
  // Обратное: все id модуля есть в каталоге.
  const { byId } = loadCatalog();
  for (const r of CRAFT) {
    assert.ok(byId.has(r.id), `id "${r.id}" из модуля нет в каталоге`);
  }
});

test('sync-craft-data.js: генератор существует, пересборка не меняет модуль', () => {
  const { execFileSync } = require('node:child_process');
  const script = path.join(__dirname, '..', 'scripts', 'sync-craft-data.js');
  assert.ok(fs.existsSync(script),
    'существует генератор scripts/sync-craft-data.js');
  const out = path.join(__dirname, '..', 'src', 'craft-data.js');
  assert.ok(fs.existsSync(out), 'существует сгенерированный src/craft-data.js');
  const before = fs.readFileSync(out, 'utf8');
  execFileSync(process.execPath, [script], { cwd: path.join(__dirname, '..') });
  assert.equal(fs.readFileSync(out, 'utf8'), before,
    'пересборка меняет закоммиченный src/craft-data.js — перегенерируйте');
});

// --- Задача 000157.04: рецепты на руды, минералы и самоцветы (TDD) ---
//
// Data-only (memory/000157.04-craft-ore-recipes.md §2): 12 новых
// рецептов 000020–000031 (кузнечное/резьба/алхимия/зачарование/
// рунопись), закрытие дыры 000044 (copper_ore — ≥1 рецепт), каждый
// из 11 предметов 000157.01 — в ≥1 рецепте (исходник или результат),
// буллет в spec/craft.md H2 «Рецепты». На текущем каталоге (19
// файлов) все тесты ниже падают: id/файлы/строки отсутствуют.

// Итоговый набор (контракт §2, финал стадии Проектирования):
// [id, тип, результат, «база» (undefined — без «база»)].
const RECIPES_015704 = [
  ['steel_sword_ore', 'кузнечное_дело', 'iron_sword', 'iron_sword_ore'],
  ['war_hammer_copper', 'кузнечное_дело', 'war_hammer', 'war_hammer'],
  ['war_hammer_mithril', 'кузнечное_дело', 'war_hammer', 'war_hammer_copper'],
  ['quartz_chisel', 'резьба_по_камню', 'stone_chisel', 'stone_chisel'],
  ['ruby_cut', 'резьба_по_камню', 'ruby', undefined],
  ['sapphire_cut', 'резьба_по_камню', 'sapphire', undefined],
  ['emerald_cut', 'резьба_по_камню', 'emerald', undefined],
  ['diamond_cut', 'резьба_по_камню', 'diamond', undefined],
  ['mana_elixir_rare', 'алхимия', 'mana_elixir', 'mana_elixir'],
  ['knight_plate_ruby', 'зачарование', 'knight_plate', 'knight_plate'],
  ['hunting_bow_sapphire', 'зачарование', 'hunting_bow', 'hunting_bow'],
  ['amethyst_moonstone', 'рунопись', 'moonstone', 'moonstone_runes'],
];

// 11 предметов задачи 000157.01 (assets/items 000052–000062).
const ORES_015701 = ['silver_ore', 'gold_ore', 'mithril_ore', 'quartz',
  'obsidian', 'phosphorite', 'ruby', 'sapphire', 'emerald', 'amethyst',
  'diamond'];

test('000157.04 R1: каталог — ровно 31 файл 000001..000031 подряд (12 новых 000020+)', () => {
  const files = listCraftFiles();
  assert.equal(files.length, 31,
    'ровно 31 рецепт (19 старых + 12 новых 000020–000031), '
    + 'а есть: ' + files.length);
  files.forEach((f, i) => {
    assert.equal(f, String(i + 1).padStart(6, '0') + '.json',
      `пробел в нумерации на позиции ${i + 1}: ${f}`);
  });
  for (const n of [20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31]) {
    assert.ok(fs.existsSync(path.join(DIR, String(n).padStart(6, '0') + '.json')),
      `файл 0000${n}.json существует (краснота: ENOENT — новые рецепты не созданы)`);
  }
});

test('000157.04 R2: 12 именованных рецептов (id/тип/результат; огранки без «база»)', () => {
  const { byId } = loadCatalog();
  for (const [id, type, result, base] of RECIPES_015704) {
    const r = byId.get(id);
    assert.ok(r,
      `рецепт "${id}" в каталоге (краснота: id не создан — данные не добавлены)`);
    assert.equal(r.data.тип, type, `${id}: тип «${type}» (контракт §2)`);
    assert.equal(r.data.результат.предмет, result,
      `${id}: результат — существующий предмет "${result}"`);
    assert.equal(r.data.результат.количество, 1, `${id}: результат ×1`);
    if (base === undefined) {
      assert.equal(r.data.база, undefined,
        `${id}: без «база» (огранка «с нуля» — базового рецепта на самоцветы нет)`);
    } else {
      assert.equal(r.data.база, base,
        `${id}: «база» — "${base}"`);
    }
  }
});

test('000157.04 R3: copper_ore — ≥1 рецепт (регресс-пин закрытия дыры 000044)', () => {
  const { byId } = loadCatalog();
  let n = 0;
  for (const { data } of byId.values()) {
    if (data.результат.предмет === 'copper_ore') n += 1;
    for (const i of data.исходники) if (i.предмет === 'copper_ore') n += 1;
  }
  assert.ok(n >= 1,
    'copper_ore — исходник или результат ≥1 рецепта (закрытие дыры 000044), '
    + 'а рецептов: ' + n);
});

test('000157.04 R4: каждый из 11 предметов 000157.01 — ≥1 рецепт (исходник или результат)', () => {
  const { byId } = loadCatalog();
  for (const id of ORES_015701) {
    const hit = [...byId.values()].some(({ data }) =>
      data.результат.предмет === id ||
      data.исходники.some((i) => i.предмет === id));
    assert.ok(hit,
      `предмет "${id}" (000157.01) — исходник или результат ≥1 рецепта`);
  }
});

test('000157.04 R5: 8 цепочек «база» (тот же тип/результат, уровень ≥, исходники ⊇, ациклично)', () => {
  const { byId } = loadCatalog();
  const CHAINS = [
    ['steel_sword_ore', 'iron_sword_ore'],
    ['war_hammer_copper', 'war_hammer'],
    ['war_hammer_mithril', 'war_hammer_copper'],
    ['quartz_chisel', 'stone_chisel'],
    ['mana_elixir_rare', 'mana_elixir'],
    ['knight_plate_ruby', 'knight_plate'],
    ['hunting_bow_sapphire', 'hunting_bow'],
    ['amethyst_moonstone', 'moonstone_runes'],
  ];
  for (const [childId, baseId] of CHAINS) {
    const child = byId.get(childId);
    assert.ok(child, `рецепт "${childId}" в каталоге`);
    const base = byId.get(baseId);
    assert.ok(base, `базовый рецепт "${baseId}" в каталоге`);
    const c = child.data;
    const b = base.data;
    assert.equal(c.база, baseId, `${childId}: «база» — "${baseId}"`);
    assert.equal(c.тип, b.тип, `${childId}: тот же тип, что у базы`);
    assert.equal(c.результат.предмет, b.результат.предмет,
      `${childId}: тот же предмет-результат, что у базы`);
    assert.ok(c.уровень >= b.уровень,
      `${childId}: уровень ${c.уровень} не ниже уровня базы (${b.уровень})`);
    // Исходники улучшенного способа покрывают исходники базы (по количеству).
    const baseQty = new Map(b.исходники.map((i) => [i.предмет, i.количество]));
    for (const [item, n] of baseQty) {
      const have = c.исходники
        .filter((i) => i.предмет === item)
        .reduce((s, i) => s + i.количество, 0);
      assert.ok(have >= n,
        `${childId}: исходник "${item}" (${have}) покрывает базовых (${n})`);
    }
    // Обход цепочки «база» завершается (циклов нет).
    const seen = new Set();
    let cur = c;
    let guard = 0;
    while (cur && cur.база !== undefined) {
      assert.ok(++guard <= byId.size, `${childId}: цикл в цепочке «база»`);
      assert.ok(!seen.has(cur.id), `${childId}: цикл на "${cur.id}"`);
      seen.add(cur.id);
      cur = byId.get(cur.база).data;
    }
  }
});

test('000157.04 R9: spec/craft.md H2 «Рецепты» — буллет про редкие руды (000157.04)', () => {
  // Нормализация белых (прецедент tests/spec-combat-wording.test.js):
  // строки SPEC ломаются переносом (~64 символа).
  const spec = fs.readFileSync(
    path.join(__dirname, '..', 'spec', 'craft.md'), 'utf8');
  const norm = (s) => s.replace(/\s+/g, ' ');
  const section = norm(spec.slice(spec.indexOf('\n## Рецепты')));
  assert.ok(section.length > 0, 'spec/craft.md: H2 «Рецепты» найден');
  assert.ok(
    section.includes(
      'Улучшенные способы могут потреблять редкие руды, минералы и самоцветы (000157.04)'),
    'H2 «Рецепты»: буллет «Улучшенные способы могут потреблять редкие '
    + 'руды, минералы и самоцветы (000157.04)» (текст ТЗ дословно)');
});

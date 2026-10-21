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

// --- Задача 000208: ссылки на файлы каталогов items/skills/buildings ---
//
// Формат ссылки — контракт 000211 §2 (memory/000211-spec-coverage-
// audit.md): строка — путь к файлу от корня репозитория; id целевого
// файла === прежнему ссылочному значению (items/skills — строка,
// buildings — число). Хелперы локальные (НЕ scripts/lib/json-ref.js):
// задача 000216 параллельна — жёсткая зависимость сломала бы мерж
// (решение 000208, memory/000208-craft-refs.md §6.9).

const REF_ITEMS = /^assets\/items\/\d{6}\.json$/;
const REF_SKILLS = /^assets\/skills\/\d{6}\.json$/;
const REF_BUILDINGS = /^assets\/buildings\/\d{6}\.json$/;
const REF_CRAFT = /^assets\/craft\/\d{6}\.json$/;
const REF_CACHE = new Map(); // ссылка → id цели (файл читается 1 раз)

// Числовые id сырого каталога зданий (000211.04: membership вместо
// устаревшего range 1..50; Set.has строгий — строка не пройдёт).
const BUILDING_IDS = (() => {
  const dir = path.join(__dirname, '..', 'assets', 'buildings');
  const ids = new Set();
  for (const f of fs.readdirSync(dir)) {
    if (!/^\d{6}\.json$/.test(f)) continue;
    const data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    ids.add(data.id);
  }
  return ids;
})();

// Ссылка → id целевого файла: ссылка по per-catalog паттерну, цель
// существует, парсится и имеет id.
function refId(ref, re, file) {
  assert.match(ref, re,
    `${file}: ссылка "${ref}" не по паттерну каталога`);
  if (REF_CACHE.has(ref)) return REF_CACHE.get(ref);
  const target = path.join(__dirname, '..', ref);
  assert.ok(fs.existsSync(target),
    `${file}: нет цели ссылки ${ref}`);
  let data;
  try {
    data = JSON.parse(fs.readFileSync(target, 'utf8'));
  } catch (e) {
    assert.fail(`${file}: цель ссылки ${ref} не JSON: ${e.message}`);
  }
  assert.ok(data && data.id !== undefined,
    `${file}: цель ссылки ${ref} без id`);
  REF_CACHE.set(ref, data.id);
  return data.id;
}

// Рецепт в id-форме — та, что в зеркале src/craft-data.js и рантайме
// (то же преобразование, что resolveRecipeData в sync-craft-data.js):
// 5 групп полей-ссылок резолвятся в id целевого файла, остальные
// поля — те же значения (вход не мутируется). «База» — ключ
// опционален (21/31 файл без него) — не домысливается.
function resolveRecipe(data, file) {
  return {
    ...data,
    ...(data.база === undefined ? {} : {
      база: refId(data.база, REF_CRAFT, file) }),
    результат: { ...data.результат,
      предмет: refId(data.результат.предмет, REF_ITEMS, file) },
    исходники: data.исходники.map(
      (i) => ({ ...i, предмет: refId(i.предмет, REF_ITEMS, file) })),
    навыки: data.навыки.map((s) => refId(s, REF_SKILLS, file)),
    здания: data.здания.map((b) => refId(b, REF_BUILDINGS, file)),
  };
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
    assert.ok(getItem(refId(data.результат.предмет, REF_ITEMS, file))
      !== null,
      `${file}: результат "${data.результат.предмет}" нет в items`);
    // Исходники: без дублей, исходник не совпадает с результатом.
    const inputs = new Set();
    for (const inp of data.исходники) {
      assert.ok(getItem(refId(inp.предмет, REF_ITEMS, file)) !== null,
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

test('ссылки: навыки → assets/skills, здания → assets/buildings (000208: ссылки на файлы каталогов)', () => {
  const { byId } = loadCatalog();
  const knownSkill = (id) =>
    SECONDARY_SKILLS[id] !== undefined ||
    PRIMARY_SKILLS.some((p) => p.id === id);
  for (const { file, data } of byId.values()) {
    for (const s of data.навыки) {
      const id = refId(s, REF_SKILLS, file);
      assert.ok(knownSkill(id),
        `${file}: навык "${id}" нет в каталоге assets/skills`);
    }
    for (const b of data.здания) {
      const id = refId(b, REF_BUILDINGS, file);
      assert.ok(BUILDING_IDS.has(id),
        `${file}: здание id=${id} нет в каталоге assets/buildings (membership)`);
      assert.ok(getBuilding(id) !== null,
        `${file}: здание id=${id} нет в каталоге assets/buildings`);
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
    const baseId = refId(data.база, REF_CRAFT, file);
    const base = byId.get(baseId);
    assert.ok(base, `${file}: базовый рецепт "${data.база}" нет в каталоге`);
    assert.notEqual(baseId, data.id, `${file}: цикл «база» на самом себе`);
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
    let curFile = file;
    let guard = 0;
    while (cur && cur.база !== undefined) {
      assert.ok(++guard <= byId.size, `${file}: цикл в цепочке «база»`);
      assert.ok(!seen.has(cur.id), `${file}: цикл на "${cur.id}"`);
      seen.add(cur.id);
      const next = byId.get(refId(cur.база, REF_CRAFT, curFile));
      cur = next.data;
      curFile = next.file;
    }
  }
});

// --- Покрытие требований задачи 000024 ---

test('с нуля: столяр, камнерез, кузнец и алхимик (задача 000044)', () => {
  // «С нуля»-рецепты: исходники — сырьевые reagent-предметы, а не
  // готовые снаряжение/зелья. До задачи 000044 в каталоге были только
  // рецепты-улучшения, виды столярное_дело и резьба_по_камню пусты.
  const { byId } = loadCatalog();
  const recipes = [...byId.values()]
    .map((x) => resolveRecipe(x.data, x.file));
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
    assert.deepEqual(CRAFT[i], resolveRecipe(data, f),
      `${f}: зеркало CRAFT не совпадает`);
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

test('000157.04 R1: каталог — ровно 59 файл 000001..000059 подряд (ре-пин 000230.08: +28 000032–000059)', () => {
  const files = listCraftFiles();
  assert.equal(files.length, 59,
    'ровно 59 рецепт (31 до 000230.08 + 28 head 000032–000059), '
    + 'а есть: ' + files.length);
  files.forEach((f, i) => {
    assert.equal(f, String(i + 1).padStart(6, '0') + '.json',
      `пробел в нумерации на позиции ${i + 1}: ${f}`);
  });
  for (let n = 20; n <= 59; n++) {
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
    assert.equal(refId(r.data.результат.предмет, REF_ITEMS, r.file), result,
      `${id}: результат — существующий предмет "${result}"`);
    assert.equal(r.data.результат.количество, 1, `${id}: результат ×1`);
    if (base === undefined) {
      assert.equal(r.data.база, undefined,
        `${id}: без «база» (огранка «с нуля» — базового рецепта на самоцветы нет)`);
    } else {
      assert.equal(refId(r.data.база, REF_CRAFT, r.file), base,
        `${id}: «база» — "${base}"`);
    }
  }
});

test('000157.04 R3: copper_ore — ≥1 рецепт (регресс-пин закрытия дыры 000044)', () => {
  const { byId } = loadCatalog();
  let n = 0;
  for (const { file, data } of byId.values()) {
    if (refId(data.результат.предмет, REF_ITEMS, file) === 'copper_ore') {
      n += 1;
    }
    for (const i of data.исходники) {
      if (refId(i.предмет, REF_ITEMS, file) === 'copper_ore') n += 1;
    }
  }
  assert.ok(n >= 1,
    'copper_ore — исходник или результат ≥1 рецепта (закрытие дыры 000044), '
    + 'а рецептов: ' + n);
});

test('000157.04 R4: каждый из 11 предметов 000157.01 — ≥1 рецепт (исходник или результат)', () => {
  const { byId } = loadCatalog();
  for (const id of ORES_015701) {
    const hit = [...byId.values()].some(({ file, data }) =>
      refId(data.результат.предмет, REF_ITEMS, file) === id ||
      data.исходники.some((i) => refId(i.предмет, REF_ITEMS, file) === id));
    assert.ok(hit,
      `предмет "${id}" (000157.01) — исходник или результат ≥1 рецепта`);
  }
});

test('000157.04 R5: 11 цепочек «база» (тот же тип/результат, уровень ≥, исходники ⊇, ациклично; ре-пин 000230.08: +3 head-улучшенных)', () => {
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
    ['rune_hoop_mithril', 'rune_hoop'],
    ['star_hoop_mithril', 'star_hoop'],
    ['crown_flame_diamond', 'crown_flame'],
  ];
  for (const [childId, baseId] of CHAINS) {
    const child = byId.get(childId);
    assert.ok(child, `рецепт "${childId}" в каталоге`);
    const base = byId.get(baseId);
    assert.ok(base, `базовый рецепт "${baseId}" в каталоге`);
    const c = child.data;
    const b = base.data;
    assert.equal(refId(c.база, REF_CRAFT, child.file), baseId,
      `${childId}: «база» — "${baseId}"`);
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
    let curFile = child.file;
    let guard = 0;
    while (cur && cur.база !== undefined) {
      assert.ok(++guard <= byId.size, `${childId}: цикл в цепочке «база»`);
      assert.ok(!seen.has(cur.id), `${childId}: цикл на "${cur.id}"`);
      seen.add(cur.id);
      const next = byId.get(refId(cur.база, REF_CRAFT, curFile));
      cur = next.data;
      curFile = next.file;
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

// --- Задача 000191.14: каталожный инвариант «зачарование ⇒ ≥1 заклинание» ---

test('000191.14: КАЖДЫЙ рецепт типа «зачарование» имеет ≥1 «заклинание» (каталожный инвариант, не покрытый схемой)', () => {
  const { byId } = loadCatalog();
  const spellIds = loadSpellIds();
  const enchants = [...byId.values()]
    .filter((x) => x.data['тип'] === 'зачарование');
  assert.deepEqual(
    enchants.map((x) => x.data.id).sort(),
    ['hunting_bow', 'hunting_bow_sapphire', 'knight_plate',
     'knight_plate_ruby', 'mystic_cloth', 'obsidian_cloth',
     'quartz_cloth', 'rune_hoop', 'rune_hoop_mithril', 'star_hoop',
     'star_hoop_mithril'],
    'анти-вакуумность: ровно 11 зачарований с этим составом id '
    + '(ре-пин 000230.08: +7 head-зачарований; каталог не растёт '
    + 'и не теряет рецептов)');
  for (const e of enchants) {
    assert.ok(Array.isArray(e.data['заклинания'])
        && e.data['заклинания'].length >= 1,
      e.data.id + ': «зачарование» — непустой «заклинания» '
      + '(инвариант: зачарование вписывает заклинание; факт: '
      + JSON.stringify(e.data['заклинания']));
    for (const sp of e.data['заклинания']) {
      assert.ok(spellIds.has(sp),
        e.data.id + ': заклинание «' + sp + '» есть в assets/spells '
        + '(ссылочная целостность инварианта)');
    }
  }
});

// --- Задача 000208: ссылки на файлы каталогов (TDD, красные тесты) ---
//
// Красная стадия: данные каталога ещё в id-форме, узлы schema.json —
// в старой форме, sync-craft-data.js без резолвера ссылок и без
// валидации ссылок — тесты ниже падают именно по этому. Синк-скрипт
// запускается в tmp-«репозитории» (копия РЕАЛЬНОГО скрипта — ROOT он
// резолвит из __dirname; паттерн — makeTmpRepo в tests/sync-all.
// test.js, решение 000208 §6.6: CLI без root-аргумента).

const { spawnSync } = require('node:child_process');
const os = require('node:os');
const SCRIPTS = path.join(__dirname, '..', 'scripts');

const FIXTURE_TARGETS = {
  items: {
    '000001.json': '{"id": "wood_sword"}\n',
    '000002.json': '{"id": "wood_log"}\n',
  },
  skills: { '000001.json': '{"id": "forge"}\n' },
  buildings: { '000003.json': '{"id": 3}\n' },
};

const FIXTURE_RECIPE = {
  id: 'test_recipe',
  'название': 'Тестовый рецепт',
  'тип': 'столярное_дело',
  'результат': { 'предмет': 'assets/items/000001.json', 'количество': 1 },
  'исходники': [{ 'предмет': 'assets/items/000002.json', 'количество': 3 }],
  'навыки': ['assets/skills/000001.json'],
  'здания': ['assets/buildings/000003.json'],
  'уровень': 1,
  'описание': 'Фикстура 000208: ссылки на файлы каталогов',
};

// Цель self-ссылки «база» (000211.09): ВСЕ 4 группы ссылок — resolveRecipeData
// sync читает их безусловно для каждого файла каталога; цель без них —
// TypeError, а не fail-closed exit 1.
const FIXTURE_BASE_RECIPE = {
  id: 'base_recipe',
  'название': 'Базовый рецепт',
  'тип': 'столярное_дело',
  'результат': { 'предмет': 'assets/items/000001.json', 'количество': 1 },
  'исходники': [{ 'предмет': 'assets/items/000002.json', 'количество': 2 }],
  'навыки': ['assets/skills/000001.json'],
  'здания': ['assets/buildings/000003.json'],
  'уровень': 1,
  'описание': 'Фикстура 000211.09: цель self-ссылки «база»',
};

// tmp-«репозиторий»: копия реального sync-craft-data.js +
// write-atomic.js + фикстура assets (рецепт в ссылочной форме).
function makeTmpCraftRepo(craftFiles, targets) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'craft-000208-'));
  for (const sub of ['scripts/lib', 'src', 'assets/craft',
                     'assets/items', 'assets/skills', 'assets/buildings']) {
    fs.mkdirSync(path.join(dir, sub), { recursive: true });
  }
  fs.copyFileSync(path.join(SCRIPTS, 'sync-craft-data.js'),
    path.join(dir, 'scripts', 'sync-craft-data.js'));
  fs.copyFileSync(path.join(SCRIPTS, 'lib', 'write-atomic.js'),
    path.join(dir, 'scripts', 'lib', 'write-atomic.js'));
  for (const [f, content] of Object.entries(craftFiles)) {
    fs.writeFileSync(path.join(dir, 'assets', 'craft', f), content, 'utf8');
  }
  for (const [sub, files] of Object.entries(targets)) {
    for (const [f, content] of Object.entries(files)) {
      fs.writeFileSync(path.join(dir, 'assets', sub, f), content, 'utf8');
    }
  }
  return dir;
}

test('000208 R1: schema.json — поля-ссылки зафиксированы per-catalog паттернами', () => {
  const schema = loadSchema();
  assert.deepEqual(schema.properties.результат.properties.предмет,
    { type: 'string', pattern: '^assets/items/\\d{6}\\.json$' },
    'результат.предмет — ссылка на файл assets/items');
  assert.deepEqual(schema.properties.исходники.items.properties.предмет,
    { type: 'string', pattern: '^assets/items/\\d{6}\\.json$' },
    'исходники[].предмет — ссылка на файл assets/items');
  assert.deepEqual(schema.properties.навыки.items,
    { type: 'string', pattern: '^assets/skills/\\d{6}\\.json$' },
    'навыки[] — ссылка на файл assets/skills');
  assert.deepEqual(schema.properties.здания.items,
    { type: 'string', pattern: '^assets/buildings/\\d{6}\\.json$' },
    'здания[] — ссылка на файл assets/buildings (integer → string)');
});

test('000208 R2: все 59 рецепт — результат/исходники/навыки/здания — ссылки на файлы каталогов, резолв в id каталога (ре-пин 000230.08: +28 head-рецептов)', () => {
  const { byId } = loadCatalog();
  const knownSkill = (id) =>
    SECONDARY_SKILLS[id] !== undefined ||
    PRIMARY_SKILLS.some((p) => p.id === id);
  let itemRefs = 0;
  let skillRefs = 0;
  let buildingRefs = 0;
  for (const { file, data } of byId.values()) {
    for (const ref of [data.результат.предмет,
                       ...data.исходники.map((i) => i.предмет)]) {
      itemRefs += 1;
      const id = refId(ref, REF_ITEMS, file);
      assert.ok(getItem(id) !== null,
        `${file}: цель ссылки ${ref} (id "${id}") нет в assets/items`);
    }
    for (const ref of data.навыки) {
      skillRefs += 1;
      const id = refId(ref, REF_SKILLS, file);
      assert.ok(knownSkill(id),
        `${file}: цель ссылки ${ref} (id "${id}") нет в каталоге skills`);
    }
    for (const ref of data.здания) {
      buildingRefs += 1;
      const id = refId(ref, REF_BUILDINGS, file);
      assert.ok(getBuilding(id) !== null,
        `${file}: цель ссылки ${ref} (id ${id}) нет в assets/buildings`);
    }
  }
  // Анти-вакуум: точные счётчики ссылок (контракт 000208 §1).
  assert.equal(itemRefs, 213, 'анти-вакуум: 213 item-ссылок (ре-пин 000230.08: 114+99)');
  assert.equal(skillRefs, 79, 'анти-вакуум: 79 skill-ссылок (ре-пин 000230.08: 44+35)');
  assert.equal(buildingRefs, 93, 'анти-вакуум: 93 building-ссылки (ре-пин 000230.08: 54+39)');
});

test('000208 R3: sync-craft-data.js запекает ссылки в id-форму (tmp-репозиторий)', () => {
  const dir = makeTmpCraftRepo(
    { '000001.json': JSON.stringify(FIXTURE_RECIPE) }, FIXTURE_TARGETS);
  try {
    const script = path.join(dir, 'scripts', 'sync-craft-data.js');
    const run1 = spawnSync(process.execPath, [script], { encoding: 'utf8' });
    assert.equal(run1.status, 0,
      'sync-craft-data.js на tmp-репозитории со ссылочными данными: ' +
      (run1.stdout || '') + (run1.stderr || ''));
    const out = path.join(dir, 'src', 'craft-data.js');
    const text = fs.readFileSync(out, 'utf8');
    // Данные модуля — РЕЗОЛВЕННАЯ id-форма: items/skills — строки,
    // здание — ЧИСЛО (id целевого файла).
    assert.match(text, /предмет: "wood_sword"/,
      'результат — резолв-ид предмета');
    assert.match(text, /предмет: "wood_log"/,
      'исходник — резолв-ид предмета');
    assert.match(text, /навыки: \["forge"\]/, 'навык — резолв-ид');
    assert.match(text, /здания: \[3\]/, 'здание — резолв-ид (число)');
    assert.doesNotMatch(text, /assets\/(items|skills|buildings)\//,
      'в данных модуля нет сырых ссылок «assets/…»');
    // Повторный запуск byte-identical.
    const before = fs.readFileSync(out, 'utf8');
    const run2 = spawnSync(process.execPath, [script], { encoding: 'utf8' });
    assert.equal(run2.status, 0,
      'повторный запуск: ' + (run2.stdout || '') + (run2.stderr || ''));
    assert.equal(fs.readFileSync(out, 'utf8'), before,
      'повторный запуск byte-identical');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('000208 R4: sync-craft-data.js — битая ссылка → exit 1 + имя ссылки в stderr', () => {
  // 1. Нет цели ссылки.
  {
    const recipe = JSON.parse(JSON.stringify(FIXTURE_RECIPE));
    recipe.результат.предмет = 'assets/items/000009.json';
    const dir = makeTmpCraftRepo(
      { '000001.json': JSON.stringify(recipe) }, FIXTURE_TARGETS);
    try {
      const r = spawnSync(process.execPath,
        [path.join(dir, 'scripts', 'sync-craft-data.js')],
        { encoding: 'utf8' });
      assert.equal(r.status, 1,
        'битая ссылка (нет цели) обязана дать exit 1: ' +
        (r.stdout || '') + (r.stderr || ''));
      assert.match(r.stderr || '', /assets\/items\/000009\.json/,
        'в stderr — имя битой ссылки (нет цели)');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
  // 2. Цель существует, но без id.
  {
    const targets = {
      items: {
        '000001.json': '{"name": "без id"}\n',
        '000002.json': '{"id": "wood_log"}\n',
      },
      skills: { '000001.json': '{"id": "forge"}\n' },
      buildings: { '000003.json': '{"id": 3}\n' },
    };
    const dir = makeTmpCraftRepo(
      { '000001.json': JSON.stringify(FIXTURE_RECIPE) }, targets);
    try {
      const r = spawnSync(process.execPath,
        [path.join(dir, 'scripts', 'sync-craft-data.js')],
        { encoding: 'utf8' });
      assert.equal(r.status, 1,
        'цель без id обязана дать exit 1: ' +
        (r.stdout || '') + (r.stderr || ''));
      assert.match(r.stderr || '', /assets\/items\/000001\.json/,
        'в stderr — имя ссылки на цель без id');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

// --- Задача 000211.09: «база» → self-ссылка на файл каталога craft (TDD) ---
//
// Красная стадия: 10 значений «база» ещё в id-форме, узел «база»
// schema.json — паттерн id, sync-craft-data.js без 4-й per-catalog
// группы (REF_CRAFT) — тесты ниже падают именно по этому. Контракт:
// memory/000211.09-craft-base-refs.md (формат ссылки — 000211 §2;
// прецедент self-ссылки — 000211.04 spells). Синк запускается в
// tmp-«репозитории» (makeTmpCraftRepo — копия РЕАЛЬНОГО скрипта,
// ROOT он резолвит из __dirname).

test('000211.09 R1: schema.json — «база» закреплена per-catalog паттерном', () => {
  const schema = loadSchema();
  assert.deepEqual(schema.properties.база,
    { type: 'string', pattern: '^assets/craft/\\d{6}\\.json$' },
    '«база» — self-ссылка на файл каталога assets/craft '
    + '(type string без смены типа, null-ветки нет — ключ опционален)');
});

test('000211.09 R2: все 13 «база» — self-ссылки: per-catalog паттерн, резолв, цель — рецепт того же каталога, id цели = значению зеркала (анти-вакуум 13/13, ре-пин 000230.08: +3 head-улучшенных)', () => {
  const { byId } = loadCatalog();
  const { CRAFT_BY_ID } = loadCraftData();
  let baseRefs = 0;
  const baseTargets = new Set();
  for (const { file, data } of byId.values()) {
    if (data.база === undefined) continue;
    baseRefs += 1;
    assert.match(data.база, REF_CRAFT,
      `${file}: «база» "${data.база}" — self-ссылка на файл каталога assets/craft`);
    const id = refId(data.база, REF_CRAFT, file);
    assert.ok(byId.has(id),
      `${file}: цель self-ссылки «база» (id "${id}") — рецепт того же каталога`);
    assert.equal(id, CRAFT_BY_ID[data.id].база,
      `${file}: id целевого файла «${data.база}» === прежнему значению «база» зеркала`);
    baseTargets.add(id);
  }
  // Анти-вакуум: точные счётчики (контракт memory/000211.09 §2).
  assert.equal(baseRefs, 13,
    'анти-вакуум: ровно 13 self-ссылок «база» (ре-пин 000230.08: +3)');
  assert.equal(baseTargets.size, 13,
    'анти-вакуум: ровно 13 уникальных целей «база» (ре-пин 000230.08: +3)');
});

test('000211.09 R3: sync-craft-data.js запекает «база» в id-форму (tmp-репозиторий)', () => {
  const recipe = JSON.parse(JSON.stringify(FIXTURE_RECIPE));
  recipe.база = 'assets/craft/000002.json';
  const dir = makeTmpCraftRepo(
    { '000001.json': JSON.stringify(recipe),
      '000002.json': JSON.stringify(FIXTURE_BASE_RECIPE) },
    FIXTURE_TARGETS);
  try {
    const script = path.join(dir, 'scripts', 'sync-craft-data.js');
    const run1 = spawnSync(process.execPath, [script], { encoding: 'utf8' });
    assert.equal(run1.status, 0,
      'sync-craft-data.js на tmp-репозитории со self-ссылкой «база»: '
      + (run1.stdout || '') + (run1.stderr || ''));
    const out = path.join(dir, 'src', 'craft-data.js');
    const text = fs.readFileSync(out, 'utf8');
    // Данные модуля — РЕЗОЛВЕННАЯ id-форма: «база» — id целевого файла.
    assert.match(text, /база: "base_recipe"/,
      '«база» — резолв-ид рецепта-цели');
    // Scope на строку данных: шапка «// Рецепты (assets/craft/…)»
    // легитимно содержит craft-путь — глобальный пин здесь неверен.
    assert.doesNotMatch(text, /база: "assets\/craft\/\d{6}\.json"/,
      'в данных модуля нет сырой self-ссылки «база»');
    assert.doesNotMatch(text, /assets\/(items|skills|buildings)\//,
      'в данных модуля нет сырых ссылок «assets/…» (пин 000208)');
    // Повторный запуск byte-identical.
    const before = fs.readFileSync(out, 'utf8');
    const run2 = spawnSync(process.execPath, [script], { encoding: 'utf8' });
    assert.equal(run2.status, 0,
      'повторный запуск: ' + (run2.stdout || '') + (run2.stderr || ''));
    assert.equal(fs.readFileSync(out, 'utf8'), before,
      'повторный запуск byte-identical');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('000211.09 R4: sync-craft-data.js — битая «база» → exit 1 + имя ссылки в stderr', () => {
  // 1. Нет цели self-ссылки (000009.json — нет в tmp-каталоге).
  {
    const recipe = JSON.parse(JSON.stringify(FIXTURE_RECIPE));
    recipe.база = 'assets/craft/000009.json';
    const dir = makeTmpCraftRepo(
      { '000001.json': JSON.stringify(recipe) }, FIXTURE_TARGETS);
    try {
      const r = spawnSync(process.execPath,
        [path.join(dir, 'scripts', 'sync-craft-data.js')],
        { encoding: 'utf8' });
      assert.equal(r.status, 1,
        'битая «база» (нет цели) обязана дать exit 1: '
        + (r.stdout || '') + (r.stderr || ''));
      assert.match(r.stderr || '', /assets\/craft\/000009\.json/,
        'в stderr — имя битой self-ссылки (нет цели)');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
  // 2. Цель существует, но без id (fires на 000001: refId «база» раньше,
  // чем цикл дойдёт до 000002).
  {
    const recipe = JSON.parse(JSON.stringify(FIXTURE_RECIPE));
    recipe.база = 'assets/craft/000002.json';
    const dir = makeTmpCraftRepo(
      { '000001.json': JSON.stringify(recipe),
        '000002.json': '{"name": "без id"}\n' }, FIXTURE_TARGETS);
    try {
      const r = spawnSync(process.execPath,
        [path.join(dir, 'scripts', 'sync-craft-data.js')],
        { encoding: 'utf8' });
      assert.equal(r.status, 1,
        'цель «база» без id обязана дать exit 1: '
        + (r.stdout || '') + (r.stderr || ''));
      assert.match(r.stderr || '', /assets\/craft\/000002\.json/,
        'в stderr — имя self-ссылки на цель без id');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

// =====================================================================
// Задача 000230.08 — рецепты на предметы «Голова»: 25 базовых +
// 3 улучшенных (контентная волна 1 серии 000230; P2).
// Контракт — memory/000230.08-head-items-wave.md §2.4 (id/файлы
// фиксированы: 000032–000059, рецепт NNNNNN → предмет 000083+(NNNNN−32)).
// RED (TDD): в assets/craft 31 файл (000001–000031), рецептов с
// head-результатами нет — тесты падают по ОСМЫСЛЕННОЙ причине «рецепты
// волны не созданы» (нет id/файлов), а не по синтаксису. Ссылки
// проверяются в РЕЗОЛВЕННОЙ id-форме (refId — хелпер 000208).
// =====================================================================

// [id, файл, тип, уровень, здания (resolved id), навыки (resolved id),
//  результат (id), исходники [[id, qty]], заклинания (null — поле нет)]
const HEAD_RECIPES_00023008 = [
  ['straw_hat', '000032.json', 'столярное_дело', 3, [5],
   ['dexterity'], 'straw_hat', [['wood_log', 2], ['herb_bitter', 1]], null],
  ['wool_cap', '000033.json', 'столярное_дело', 2, [5],
   ['dexterity'], 'wool_cap', [['hide', 1], ['herb_bitter', 1]], null],
  ['leather_cap', '000034.json', 'столярное_дело', 4, [5],
   ['dexterity'], 'leather_cap', [['hide', 2], ['coal', 1]], null],
  ['fur_hat', '000035.json', 'столярное_дело', 8, [5],
   ['dexterity'], 'fur_hat', [['hide', 3], ['wood_log', 1]], null],
  ['cloth_band', '000036.json', 'столярное_дело', 2, [5],
   ['dexterity'], 'cloth_band', [['wood_log', 1], ['herb_bitter', 1]], null],
  ['wanderer_cap', '000037.json', 'столярное_дело', 3, [5],
   ['dexterity'], 'wanderer_cap', [['hide', 1], ['wood_log', 1]], null],
  ['hood_common', '000038.json', 'столярное_дело', 4, [5],
   ['dexterity'], 'hood_common', [['hide', 1], ['herb_bitter', 1]], null],
  ['linen_cloth', '000039.json', 'столярное_дело', 2, [5],
   ['dexterity'], 'linen_cloth', [['wood_log', 1], ['herb_healing', 1]], null],
  ['felt_hat', '000040.json', 'столярное_дело', 6, [5],
   ['dexterity'], 'felt_hat', [['hide', 2], ['coal', 1]], null],
  ['travel_cloth', '000041.json', 'столярное_дело', 5, [5],
   ['dexterity'], 'travel_cloth', [['hide', 1], ['herb_mana', 1]], null],
  ['silver_band', '000042.json', 'кузнечное_дело', 12, [8, 25],
   ['forge'], 'silver_band', [['silver_ore', 2], ['coal', 1]], null],
  ['copper_band', '000043.json', 'кузнечное_дело', 10, [8, 25],
   ['forge'], 'copper_band', [['copper_ore', 2], ['coal', 1]], null],
  ['obsidian_cloth', '000044.json', 'зачарование', 22, [18],
   ['runes', 'precog'], 'obsidian_cloth',
   [['obsidian', 1], ['wood_log', 1]], ['chill']],
  ['amethyst_band', '000045.json', 'кузнечное_дело', 16, [8, 25],
   ['forge'], 'amethyst_band',
   [['amethyst', 1], ['silver_ore', 1], ['coal', 1]], null],
  ['quartz_cloth', '000046.json', 'зачарование', 25, [18],
   ['runes', 'meditation'], 'quartz_cloth',
   [['quartz', 1], ['wood_log', 1]], ['vine']],
  ['bone_band', '000047.json', 'кузнечное_дело', 14, [8, 25],
   ['forge'], 'bone_band', [['stone_chunk', 2], ['coal', 1]], null],
  ['mystic_cloth', '000048.json', 'зачарование', 30, [18],
   ['runes', 'meditation'], 'mystic_cloth',
   [['amethyst', 1], ['herb_mana', 1]], ['light_heal']],
  ['silver_helm', '000049.json', 'кузнечное_дело', 35, [8, 25],
   ['forge'], 'silver_helm', [['silver_ore', 4], ['coal', 2]], null],
  ['gold_helm', '000050.json', 'кузнечное_дело', 45, [8, 25],
   ['forge'], 'gold_helm', [['gold_ore', 4], ['coal', 2]], null],
  ['sapphire_helm', '000051.json', 'кузнечное_дело', 55, [8, 25],
   ['forge'], 'sapphire_helm',
   [['sapphire', 1], ['silver_ore', 3], ['coal', 2]], null],
  ['mithril_helm', '000052.json', 'кузнечное_дело', 60, [8, 25],
   ['forge'], 'mithril_helm', [['mithril_ore', 3], ['coal', 2]], null],
  ['emerald_helm', '000053.json', 'кузнечное_дело', 50, [8, 25],
   ['forge'], 'emerald_helm',
   [['emerald', 1], ['silver_ore', 3], ['coal', 2]], null],
  ['rune_hoop', '000054.json', 'зачарование', 65, [18],
   ['runes', 'perception'], 'rune_hoop',
   [['amethyst', 2], ['silver_ore', 2], ['wood_log', 1]], ['stone_skin']],
  ['star_hoop', '000055.json', 'зачарование', 75, [18],
   ['runes', 'perception'], 'star_hoop',
   [['sapphire', 2], ['gold_ore', 2], ['wood_log', 1]], ['magic_shield']],
  ['crown_flame', '000056.json', 'кузнечное_дело', 95, [8, 25],
   ['forge'], 'crown_flame',
   [['gold_ore', 4], ['mithril_ore', 2], ['diamond', 1],
    ['ruby', 2], ['coal', 4]], null],
];

// Диапазоны «уровень» по редкости результата (ТЗ: пин):
// common 1–10, rare 10–30, epic 30–60, legendary 60–90, impossible 90–100.
const RARITY_LEVEL_RANGE_00023008 = {
  common: [1, 10], rare: [10, 30], epic: [30, 60],
  legendary: [60, 90], impossible: [90, 100],
};

test('000230.08 C1: 25 базовых рецептов (ростер §2.4: id/файл/тип/уровень/здания/навыки/результат/исходники/заклинания); «уровень» в диапазоне редкости РЕЗУЛЬТАТА (пин); зачарование — ≥1 заклинание (ID-форма); каждый из 25 head-предметов — ровно 1 базовый рецепт-результат (краснота: рецептов на head нет)', () => {
  const { byId } = loadCatalog();
  for (const [id, file, type, level, buildings, skills, resultId,
      inputs, spells] of HEAD_RECIPES_00023008) {
    const r = byId.get(id);
    assert.ok(r, 'рецепт «' + id + '» (' + file + ') в каталоге '
      + '(краснота: рецепт волны не создан)');
    assert.equal(r.file, file, id + ': файл ' + file
      + ' (контракт §2.4, переименований нет)');
    assert.equal(r.data['тип'], type, id + ': тип «' + type + '»');
    assert.equal(r.data['уровень'], level, id + ': уровень ' + level);
    assert.deepEqual(
      r.data['здания'].map((b) => refId(b, REF_BUILDINGS, r.file)),
      buildings, id + ': здания (resolved id)');
    assert.deepEqual(
      r.data['навыки'].map((s) => refId(s, REF_SKILLS, r.file)),
      skills, id + ': навыки (resolved id)');
    const resId = refId(r.data['результат']['предмет'], REF_ITEMS, r.file);
    assert.equal(resId, resultId,
      id + ': результат — head-предмет «' + resultId + '»');
    assert.equal(r.data['результат']['количество'], 1,
      id + ': результат ×1');
    assert.deepEqual(
      r.data['исходники'].map((i) =>
        [refId(i['предмет'], REF_ITEMS, r.file), i['количество']]),
      inputs, id + ': исходники (resolved id, порядок контракта)');
    if (spells === null) {
      assert.equal(r.data['заклинания'], undefined,
        id + ': «заклинания» отсутствуют');
    } else {
      assert.deepEqual(r.data['заклинания'], spells,
        id + ': «заклинания» (ID-форма, не пути)');
    }
    const it = getItem(resId);
    assert.ok(it, id + ': результат «' + resultId + '» — в assets/items');
    const [lo, hi] = RARITY_LEVEL_RANGE_00023008[it.rarity];
    assert.ok(r.data['уровень'] >= lo && r.data['уровень'] <= hi,
      id + ': уровень ' + r.data['уровень'] + ' в диапазоне редкости '
      + it.rarity + ' [' + lo + '–' + hi + '] (пин ТЗ)');
    if (type === 'зачарование') {
      assert.ok(Array.isArray(r.data['заклинания'])
          && r.data['заклинания'].length >= 1,
        id + ': «зачарование» — ≥1 заклинание (инвариант 000191.14)');
    }
  }
  // Каждый head-предмет — ровно 1 базовый (БЕЗ «база») рецепт-результат:
  // улучшенные (C2) дают тот же предмет, их сюда не считаем.
  const basicResults = [];
  for (const { file, data } of byId.values()) {
    if (data['база'] !== undefined) continue;
    basicResults.push(
      refId(data['результат']['предмет'], REF_ITEMS, file));
  }
  for (const row of HEAD_RECIPES_00023008) {
    const n = basicResults.filter((x) => x === row[6]).length;
    assert.equal(n, 1,
      'head-предмет «' + row[6] + '» — ровно 1 базовый рецепт-результат '
      + '(факт: ' + n + ')');
  }
});

// [id, файл, «база» (id), уровень, t4-материал (tier 4, 000157.04)]
const HEAD_IMPROVED_00023008 = [
  ['rune_hoop_mithril', '000057.json', 'rune_hoop', 80, 'mithril_ore'],
  ['star_hoop_mithril', '000058.json', 'star_hoop', 88, 'mithril_ore'],
  ['crown_flame_diamond', '000059.json', 'crown_flame', 100, 'diamond'],
];

test('000230.08 C2: 3 улучшенных (000057–000059) — «база» = rune_hoop/star_hoop/crown_flame (000054/000055/000056), тот же тип/результат, уровень ≥ базы (80/88/100), исходники ⊇ базы (по qty), цепочка «база» ациклична, +t4-руда/камень (tier 4) в исходниках (000157.04)', () => {
  const { byId } = loadCatalog();
  for (const [id, file, baseId, level, t4] of HEAD_IMPROVED_00023008) {
    const r = byId.get(id);
    assert.ok(r, 'рецепт «' + id + '» (' + file + ') в каталоге '
      + '(краснота: улучшенный рецепт не создан)');
    assert.equal(r.file, file, id + ': файл ' + file);
    assert.equal(refId(r.data['база'], REF_CRAFT, r.file), baseId,
      id + ': «база» — «' + baseId + '» (self-ссылка)');
    const base = byId.get(baseId);
    assert.ok(base, id + ': базовый рецепт «' + baseId + '» в каталоге');
    const c = r.data;
    const b = base.data;
    assert.equal(c['тип'], b['тип'], id + ': тот же тип, что у базы');
    assert.equal(
      refId(c['результат']['предмет'], REF_ITEMS, r.file),
      refId(b['результат']['предмет'], REF_ITEMS, base.file),
      id + ': тот же предмет-результат, что у базы');
    assert.equal(c['уровень'], level, id + ': уровень ' + level);
    assert.ok(c['уровень'] >= b['уровень'],
      id + ': уровень не ниже базового (' + b['уровень'] + ')');
    const qtyOf = (data, fileRef) => {
      const m = new Map();
      for (const i of data['исходники']) {
        const iid = refId(i['предмет'], REF_ITEMS, fileRef);
        m.set(iid, (m.get(iid) || 0) + i['количество']);
      }
      return m;
    };
    const baseQty = qtyOf(b, base.file);
    const qty = qtyOf(c, r.file);
    for (const [item, n] of baseQty) {
      assert.ok((qty.get(item) || 0) >= n,
        id + ': исходник «' + item + '» ⊇ базового (' + n + ')');
    }
    assert.ok(qty.has(t4),
      id + ': t4-материал «' + t4 + '» в исходниках (000157.04)');
    assert.equal(getItem(t4).tier, 4,
      t4 + ': tier 4 в каталоге (редкая руда/самоцвет)');
    // Обход цепочки «база» завершается (циклов нет, self-ссылка нет).
    const seen = new Set();
    let cur = r;
    let curFile = r.file;
    let guard = 0;
    while (cur && cur.data['база'] !== undefined) {
      assert.ok(++guard <= byId.size, id + ': цикл в цепочке «база»');
      assert.ok(!seen.has(cur.data.id), id + ': цикл на «' + cur.data.id + '»');
      seen.add(cur.data.id);
      cur = byId.get(refId(cur.data['база'], REF_CRAFT, curFile));
      curFile = cur.file;
    }
  }
});

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

test('каталог: нумерация файлов — сегменты подряд: 000001..000199 + 000210..000237 + 000260..000287 + 000310..000337 + 000360..000415 (ре-пин 000230.11: 000144–000199 руки; ре-пин 000230.12: 000210–000237 «правая рука»; ре-пин 000230.13: 000260–000287 left_hand; ре-пин 000230.14: 000310–000337 кольца; ре-пин 000230.15: 000360–000415 ноги/ступни — пятихсегментный каталог)', () => {
  const files = listCraftFiles();
  assert.ok(files.length >= 8, 'каталог подозрительно маленький');
  let i = 0;
  for (const [from, to] of [[1, 199], [210, 237], [260, 287], [310, 337], [360, 415]]) {
    for (let n = from; n <= to; n++, i++) {
      assert.equal(files[i], String(n).padStart(6, '0') + '.json',
        `пробел в нумерации на позиции ${i + 1}: ${files[i]}`);
    }
  }
  assert.equal(i, files.length,
    'число файлов = сумма сегментов (ре-пин 000230.11: 199; '
    + 'ре-пин 000230.13: +28 = 227; '
    + 'ре-пин 000230.14: +28 = 255; '
    + 'ре-пин 000230.12: +28 = 283; '
    + 'ре-пин 000230.15: +56 = 339)');
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
    // Списки навыков/зданий/заклинаний — без дублей (ре-пин
    // 000230.14: rune_ring (000330) — вырожденный паттерн
    // «runes + 1-й skill-аффикс» = [runes, runes], пин T9;
    // «навыки» у него — единственный осознанный дубль каталога).
    for (const [name, list] of [['навыки', data.навыки],
                                ['здания', data.здания],
                                ['заклинания', data.заклинания || []]]) {
      if (name === 'навыки' && data.id === 'rune_ring') continue;
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

test('000157.04 R1: каталог — ровно 339 файлов: 000001..000199 подряд + 000210..000237 подряд + 000260..000287 подряд + 000310..000337 подряд + 000360..000415 подряд (ре-пин 000230.08: +28 000032–000059; ре-пин 000230.09: +56 000060–000115; ре-пин 000230.10: +28 torso 000116–000143; ре-пин 000230.11: +56 рук 000144–000199; ре-пин 000230.12: +28 right-hand 000210–000237; ре-пин 000230.13: +28 left_hand 000260–000287; ре-пин 000230.14: +28 колец 000310–000337; ре-пин 000230.15: +56 ног/ступней 000360–000415; дыры 000200–000209, 000238–000259, 000288–000309, 000338–000359 — пятихсегментный каталог)', () => {
  const files = listCraftFiles();
  assert.equal(files.length, 339,
    'ровно 339 рецепт (31 до 000230.08 + 28 head 000032–000059 '
    + '+ 56 уши/шея 000060–000115 + 28 torso 000116–000143 '
    + '+ 56 рук 000144–000199 + 28 right-hand 000210–000237 '
    + '+ 28 left_hand 000260–000287 + 28 колец 000310–000337 '
    + '+ 56 ног/ступней 000360–000415), '
    + 'а есть: ' + files.length);
  files.forEach((f, i) => {
    const expected = i < 199
      ? String(i + 1).padStart(6, '0') + '.json'
      : i < 227
        ? String(210 + i - 199).padStart(6, '0') + '.json'
        : i < 255
          ? String(260 + i - 227).padStart(6, '0') + '.json'
          : i < 283
            ? String(310 + i - 255).padStart(6, '0') + '.json'
            : String(360 + i - 283).padStart(6, '0') + '.json';
    assert.equal(f, expected,
      `пробел в нумерации на позиции ${i + 1}: ${f} (ожидается ${expected})`);
  });
  for (let n = 20; n <= 199; n++) {
    assert.ok(fs.existsSync(path.join(DIR, String(n).padStart(6, '0') + '.json')),
      `файл ${String(n).padStart(6, '0')}.json существует (краснота: ENOENT — новые рецепты не созданы)`);
  }
  for (let n = 210; n <= 237; n++) {
    assert.ok(fs.existsSync(path.join(DIR, String(n).padStart(6, '0') + '.json')),
      `файл ${String(n).padStart(6, '0')}.json существует (краснота: ENOENT — right-hand-рецепты не созданы)`);
  }
  for (let n = 260; n <= 287; n++) {
    assert.ok(fs.existsSync(path.join(DIR, String(n).padStart(6, '0') + '.json')),
      `файл ${String(n).padStart(6, '0')}.json существует (краснота: ENOENT — left_hand-рецепты не созданы)`);
  }
  for (let n = 310; n <= 337; n++) {
    assert.ok(fs.existsSync(path.join(DIR, String(n).padStart(6, '0') + '.json')),
      `файл ${String(n).padStart(6, '0')}.json существует (краснота: ENOENT — ring-рецепты не созданы)`);
  }
  for (let n = 360; n <= 415; n++) {
    assert.ok(fs.existsSync(path.join(DIR, String(n).padStart(6, '0') + '.json')),
      `файл ${String(n).padStart(6, '0')}.json существует (краснота: ENOENT — legs/feet-рецепты не созданы)`);
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

test('000157.04 R5: 35 цепочек «база» (тот же тип/результат, уровень ≥, исходники ⊇, ациклично; ре-пин 000230.08: +3 head-улучшенных; ре-пин 000230.09: +6 уши/шея-улучшенных; ре-пин 000230.10: +3 torso-улучшенных; ре-пин 000230.11: +6 рук-улучшенных; ре-пин 000230.12: +3 right-hand-улучшенных; ре-пин 000230.13: +3 left_hand-улучшенных; ре-пин 000230.14: +3 ring-улучшенных)', () => {
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
    ['star_earring_mithril', 'star_earring'],
    ['whisper_hoop_diamond', 'whisper_hoop'],
    ['soul_bell_mithril', 'soul_bell'],
    ['star_pendant_mithril', 'star_pendant'],
    ['rune_necklace_diamond', 'rune_necklace'],
    ['dawn_pendant_diamond', 'dawn_pendant'],
    ['pilgrim_sutan_mithril', 'pilgrim_sutan'],
    ['void_robe_diamond', 'void_robe'],
    ['aegis_mantle_mithril', 'aegis_mantle'],
    // Ре-пин 000230.11: +6 рук-улучшенных (000194-000199).
    ['rune_bracers_mithril', 'rune_bracers'],
    ['star_armguard_diamond', 'star_armguard'],
    ['titan_brace_mithril', 'titan_brace'],
    ['rune_gauntlets_mithril', 'rune_gauntlets'],
    ['star_gloves_diamond', 'star_gloves'],
    ['void_gauntlet_mithril', 'void_gauntlet'],
    // Ре-пин 000230.12: +3 right-hand-улучшенных (000235-000237).
    ['sage_staff_mithril', 'sage_staff'],
    ['mithril_hammer_diamond', 'mithril_hammer'],
    ['philosopher_staff_mithril', 'philosopher_staff'],
    // Ре-пин 000230.13: +3 left_hand-улучшенных (000285-000287).
    ['arcane_eye_diamond', 'arcane_eye'],
    ['snow_focus_mithril', 'snow_focus'],
    ['heart_of_elements_mithril', 'heart_of_elements'],
    // Ре-пин 000230.14: +3 ring-улучшенных (000335-000337).
    ['star_signet_mithril', 'star_signet'],
    ['void_ring_diamond', 'void_ring'],
    ['phoenix_ring_mithril', 'phoenix_ring'],
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
    [
      'aegis_mantle', 'aegis_mantle_mithril', 'amethyst_boots', 'amethyst_choker', 'amethyst_dangle',
      'amethyst_pants', 'amethyst_ring', 'arcane_eye', 'arcane_eye_diamond', 'bone_graver',
      'cinder_eye', 'dawn_pendant', 'dawn_pendant_diamond', 'deep_breath_robe', 'ember_focus',
      'ember_pants', 'ember_robe', 'ember_staff', 'emerald_amulet', 'emerald_signet',
      'emerald_stud', 'faith_amulet', 'faith_necklace', 'faith_stud', 'flame_staff',
      'frost_charm', 'frost_orb', 'frost_ring', 'frost_sandals', 'ghost_cuff',
      'gold_chain', 'gold_dangle', 'guard_amulet', 'haste_wraps', 'heart_of_elements',
      'heart_of_elements_mithril', 'hunting_bow', 'hunting_bow_sapphire', 'ice_staff', 'knight_plate',
      'knight_plate_ruby', 'meditating_robe', 'mind_pendant', 'moonstone_chain', 'moonstone_dangle',
      'mystic_breeches', 'mystic_cloth', 'mystic_sandals', 'night_gloves', 'obsidian_cloth',
      'obsidian_greaves', 'obsidian_sandals', 'phantom_gloves', 'philosopher_staff', 'philosopher_staff_mithril',
      'phoenix_ring', 'phoenix_ring_mithril', 'pilgrim_sutan', 'pilgrim_sutan_mithril', 'quartz_cloth',
      'rime_staff', 'ruby_bell', 'ruby_pendant', 'ruby_ring', 'rune_boots',
      'rune_boots_mithril', 'rune_bracers', 'rune_bracers_mithril', 'rune_charm', 'rune_chisel',
      'rune_gauntlets', 'rune_gauntlets_mithril', 'rune_greaves', 'rune_greaves_mithril', 'rune_hoop',
      'rune_hoop_mithril', 'rune_necklace', 'rune_necklace_diamond', 'rune_ring', 'rune_sphere',
      'rune_staff', 'rune_stylus', 'runic_cuff', 'sage_staff', 'sage_staff_mithril',
      'scholar_pendant', 'scholar_ring', 'shadow_robe', 'shadow_wrap', 'silver_signet',
      'snow_focus', 'snow_focus_mithril', 'soul_bell', 'soul_bell_mithril', 'star_armguard',
      'star_armguard_diamond', 'star_earring', 'star_earring_mithril', 'star_gloves', 'star_gloves_diamond',
      'star_hoop', 'star_hoop_mithril', 'star_pendant', 'star_pendant_mithril', 'star_signet',
      'star_signet_mithril', 'stone_robe', 'storm_leggings', 'storm_leggings_diamond', 'storm_sandals',
      'storm_sandals_diamond', 'swift_boots', 'swift_boots_diamond', 'swift_brace', 'void_gauntlet',
      'void_gauntlet_mithril', 'void_ring', 'void_ring_diamond', 'void_robe', 'void_robe_diamond',
      'ward_crystal', 'whisper_hoop', 'whisper_hoop_diamond', 'wind_gloves'
    ],
    'анти-вакуумность: ровно 124 зачарований с этим составом id '
    + '(ре-пин 000230.08: +7 head-зачарований; ре-пин 000230.09: '
    + '+19 базовых + 6 улучшенных зачарований уши/шея; '
    + 'ре-пин 000230.10: +8 базовых + 3 улучшенных зачарований torso; '
    + 'ре-пин 000230.11: +13 базовых + 5 улучшенных зачарований рук '
    + '(titan_brace/titan_brace_mithril — кузница); ре-пин 000230.12: '
    + '+10 базовых + 2 улучшенных зачарований правой руки '
    + '(mithril_hammer_diamond — кузница); ре-пин 000230.13: '
    + '+13 базовых + 3 улучшенных зачарования left_hand; '
    + 'ре-пин 000230.14: +10 базовых + 3 улучшенных зачарования '
    + 'колец; ре-пин 000230.15: +13 базовых + 5 улучшенных '
    + 'зачарований ног/ступней; каталог не растёт и не теряет '
    + 'рецептов)');
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

test('000208 R2: все 339 рецепт — результат/исходники/навыки/здания — ссылки на файлы каталогов, резолв в id каталога (ре-пин 000230.08: +28 head-рецептов; ре-пин 000230.09: +56 уши/шея-рецептов; ре-пин 000230.10: +28 torso-рецептов; ре-пин 000230.11: +56 рук-рецептов; ре-пин 000230.12: +28 right-hand-рецептов; ре-пин 000230.13: +28 left_hand-рецептов; ре-пин 000230.14: +28 ring-рецептов; ре-пин 000230.15: +56 legs/feet-рецептов)', () => {
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
  assert.equal(itemRefs, 1245, 'анти-вакуум: 1245 item-ссылок (ре-пин 000230.08: 114+99; ре-пин 000230.09: +208; ре-пин 000230.10: +106; ре-пин 000230.11: +203; ре-пин 000230.12: +108; ре-пин 000230.13: +102; ре-пин 000230.14: +106; ре-пин 000230.15: +199)');
  assert.equal(skillRefs, 471, 'анти-вакуум: 471 skill-ссылок (ре-пин 000230.08: 44+35; ре-пин 000230.09: +81; ре-пин 000230.10: +39; ре-пин 000230.11: +74; ре-пин 000230.12: +39; ре-пин 000230.13: +44; ре-пин 000230.14: +41; ре-пин 000230.15: +74)');
  assert.equal(buildingRefs, 469, 'анти-вакуум: 469 building-ссылок (ре-пин 000230.08: 54+39; ре-пин 000230.09: +87; ре-пин 000230.10: +28; ре-пин 000230.11: +78; ре-пин 000230.12: +34; ре-пин 000230.13: +30; ре-пин 000230.14: +43; ре-пин 000230.15: +74; ре-пин 000250: +2 (кожаные брони → [8, 25]))');
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

test('000211.09 R2: все 43 «база» — self-ссылки: per-catalog паттерн, резолв, цель — рецепт того же каталога, id цели = значению зеркала (анти-вакуум 43/43, ре-пин 000230.08: +3 head-улучшенных; ре-пин 000230.09: +6 уши/шея-улучшенных; ре-пин 000230.10: +3 torso-улучшенных; ре-пин 000230.11: +6 рук-улучшенных; ре-пин 000230.12: +3 right-hand-улучшенных; ре-пин 000230.13: +3 left_hand-улучшенных; ре-пин 000230.14: +3 ring-улучшенных; ре-пин 000230.15: +6 legs/feet-улучшенных)', () => {
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
  assert.equal(baseRefs, 43,
    'анти-вакуум: ровно 43 self-ссылки «база» (ре-пин 000230.08: +3; '
    + 'ре-пин 000230.09: +6; ре-пин 000230.10: +3; '
    + 'ре-пин 000230.11: +6 рук-улучшенных; ре-пин 000230.12: +3; '
    + 'ре-пин 000230.13: +3; ре-пин 000230.14: +3; '
    + 'ре-пин 000230.15: +6)');
  assert.equal(baseTargets.size, 43,
    'анти-вакуум: ровно 43 уникальные цели «база» '
    + '(ре-пин 000230.08: +3; ре-пин 000230.09: +6; '
    + 'ре-пин 000230.10: +3; ре-пин 000230.11: +6 рук-улучшенных; '
    + 'ре-пин 000230.12: +3; ре-пин 000230.13: +3; '
    + 'ре-пин 000230.14: +3; ре-пин 000230.15: +6)');
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

// =====================================================================
// Задача 000230.09 — рецепты на предметы «Уши» + «Шея»: 50 базовых
// (31 резьба_по_камню + 19 зачарование) + 6 улучшенных (контентная
// волна 2 серии 000230, серийно после .08; P2).
// Контракт — memory/000230.09-ears-neck-items-wave.md §2.4 (id/файлы
// фиксированы: 000060–000115, рецепт NNNNNN → предмет
// 000108+(NNNNN−60)).
// RED (TDD): в assets/craft 59 файлов (000001–000059), рецептов с
// ears/neck-результатами нет — тесты падают по ОСМЫСЛЕННОЙ причине
// «рецепты волны не созданы» (нет id/файлов), а не по синтаксису.
// Ссылки проверяются в РЕЗОЛВЕННОЙ id-форме (refId — хелпер 000208).
// =====================================================================

// [id, файл, тип, уровень, здания (resolved id), навыки (resolved id),
//  результат (id), исходники [[id, qty]], заклинания (null — поле нет)]
// ювелирная группа (ТЗ): без магии — резьба_по_камню (навыки [runes],
// здания [40, 48] — литерал всех 9 существующих резьб-рецептов),
// самоцветы/магия/«вера» — зачарование (навыки [runes, тематический],
// здания [18], ≥1 заклинание в ID-форме, maxItems 4).
const EARSNECK_RECIPES_00023009 = [
  ['copper_hoop', '000060.json', 'резьба_по_камню', 2, [40, 48],
   ['runes'], 'copper_hoop', [['copper_ore', 2], ['stone_chunk', 1]], null],
  ['bone_stud', '000061.json', 'резьба_по_камню', 3, [40, 48],
   ['runes'], 'bone_stud', [['stone_chunk', 2], ['hide', 1]], null],
  ['leather_loop', '000062.json', 'резьба_по_камню', 3, [40, 48],
   ['runes'], 'leather_loop', [['hide', 2], ['coal', 1]], null],
  ['clay_dangle', '000063.json', 'резьба_по_камню', 4, [40, 48],
   ['runes'], 'clay_dangle', [['stone_chunk', 2], ['coal', 1]], null],
  ['wood_bead', '000064.json', 'резьба_по_камню', 4, [40, 48],
   ['runes'], 'wood_bead', [['wood_log', 2], ['stone_chunk', 1]], null],
  ['copper_dangle', '000065.json', 'резьба_по_камню', 5, [40, 48],
   ['runes'], 'copper_dangle', [['copper_ore', 2], ['coal', 1]], null],
  ['shell_hoop', '000066.json', 'резьба_по_камню', 5, [40, 48],
   ['runes'], 'shell_hoop', [['stone_chunk', 2], ['hide', 1]], null],
  ['faith_stud', '000067.json', 'зачарование', 7, [18],
   ['runes', 'meditation'], 'faith_stud',
   [['copper_ore', 1], ['herb_healing', 1]], ['mend']],
  ['twine_hoop', '000068.json', 'резьба_по_камню', 8, [40, 48],
   ['runes'], 'twine_hoop', [['wood_log', 2], ['hide', 1]], null],
  ['antler_hook', '000069.json', 'резьба_по_камню', 9, [40, 48],
   ['runes'], 'antler_hook', [['hide', 2], ['stone_chunk', 1]], null],
  ['stone_bead', '000070.json', 'резьба_по_камню', 12, [40, 48],
   ['runes'], 'stone_bead', [['stone_chunk', 3], ['coal', 1]], null],
  ['silver_hoop', '000071.json', 'резьба_по_камню', 12, [40, 48],
   ['runes'], 'silver_hoop', [['silver_ore', 2], ['coal', 1]], null],
  ['moonstone_dangle', '000072.json', 'зачарование', 16, [18],
   ['runes', 'artist'], 'moonstone_dangle',
   [['moonstone', 1], ['silver_ore', 1], ['coal', 1]], ['nature_blessing']],
  ['quartz_bead', '000073.json', 'резьба_по_камню', 14, [40, 48],
   ['runes'], 'quartz_bead',
   [['quartz', 1], ['silver_ore', 1], ['coal', 1]], null],
  ['silver_stud', '000074.json', 'резьба_по_камню', 16, [40, 48],
   ['runes'], 'silver_stud', [['silver_ore', 2], ['stone_chunk', 1]], null],
  ['obsidian_stud', '000075.json', 'резьба_по_камню', 18, [40, 48],
   ['runes'], 'obsidian_stud',
   [['obsidian', 1], ['silver_ore', 1], ['coal', 1]], null],
  ['amethyst_dangle', '000076.json', 'зачарование', 20, [18],
   ['runes', 'orator'], 'amethyst_dangle',
   [['amethyst', 1], ['silver_ore', 1], ['coal', 1]], ['frost_bolt']],
  ['sapphire_hoop', '000077.json', 'резьба_по_камню', 35, [40, 48],
   ['runes'], 'sapphire_hoop',
   [['sapphire', 1], ['silver_ore', 2], ['coal', 2]], null],
  ['emerald_stud', '000078.json', 'зачарование', 38, [18],
   ['runes', 'meditation'], 'emerald_stud',
   [['emerald', 1], ['gold_ore', 1], ['coal', 2]], ['ward']],
  ['ruby_bell', '000079.json', 'зачарование', 42, [18],
   ['runes', 'orator'], 'ruby_bell',
   [['ruby', 1], ['gold_ore', 1], ['coal', 2]], ['flame_burst']],
  ['gold_dangle', '000080.json', 'зачарование', 45, [18],
   ['runes', 'artist'], 'gold_dangle',
   [['gold_ore', 2], ['ruby', 1], ['coal', 1]], ['spark']],
  ['mithril_hoop', '000081.json', 'резьба_по_камню', 55, [40, 48],
   ['runes'], 'mithril_hoop', [['mithril_ore', 2], ['coal', 2]], null],
  ['star_earring', '000082.json', 'зачарование', 65, [18],
   ['runes', 'perception'], 'star_earring',
   [['sapphire', 2], ['gold_ore', 2], ['coal', 2]], ['magic_shield']],
  ['whisper_hoop', '000083.json', 'зачарование', 70, [18],
   ['runes', 'elder'], 'whisper_hoop',
   [['sapphire', 1], ['gold_ore', 2], ['coal', 2]], ['shadow_bolt']],
  ['soul_bell', '000084.json', 'зачарование', 95, [18],
   ['runes', 'orator'], 'soul_bell',
   [['gold_ore', 4], ['phoenix_feather', 2], ['ruby', 2],
    ['coal', 3]], ['inferno']],
  ['copper_chain', '000085.json', 'резьба_по_камню', 2, [40, 48],
   ['runes'], 'copper_chain', [['copper_ore', 2], ['coal', 1]], null],
  ['bone_beads', '000086.json', 'резьба_по_камню', 3, [40, 48],
   ['runes'], 'bone_beads', [['stone_chunk', 2], ['hide', 1]], null],
  ['twine_amulet', '000087.json', 'резьба_по_камню', 4, [40, 48],
   ['runes'], 'twine_amulet', [['wood_log', 2], ['hide', 1]], null],
  ['clay_pendant', '000088.json', 'резьба_по_камню', 4, [40, 48],
   ['runes'], 'clay_pendant', [['stone_chunk', 2], ['coal', 1]], null],
  ['wood_pendant', '000089.json', 'резьба_по_камню', 5, [40, 48],
   ['runes'], 'wood_pendant', [['wood_log', 2], ['stone_chunk', 1]], null],
  ['copper_pendant', '000090.json', 'резьба_по_камню', 5, [40, 48],
   ['runes'], 'copper_pendant', [['copper_ore', 2], ['hide', 1]], null],
  ['shell_beads', '000091.json', 'резьба_по_камню', 6, [40, 48],
   ['runes'], 'shell_beads', [['stone_chunk', 2], ['coal', 1]], null],
  ['faith_necklace', '000092.json', 'зачарование', 8, [18],
   ['runes', 'meditation'], 'faith_necklace',
   [['copper_ore', 1], ['herb_healing', 1], ['coal', 1]], ['mend']],
  ['leather_choker', '000093.json', 'резьба_по_камню', 8, [40, 48],
   ['runes'], 'leather_choker', [['hide', 2], ['coal', 1]], null],
  ['stone_beads', '000094.json', 'резьба_по_камню', 9, [40, 48],
   ['runes'], 'stone_beads', [['stone_chunk', 3], ['hide', 1]], null],
  ['bone_pendant', '000095.json', 'резьба_по_камню', 12, [40, 48],
   ['runes'], 'bone_pendant', [['stone_chunk', 2], ['coal', 1]], null],
  ['silver_chain', '000096.json', 'резьба_по_камню', 13, [40, 48],
   ['runes'], 'silver_chain', [['silver_ore', 2], ['coal', 1]], null],
  ['quartz_amulet', '000097.json', 'резьба_по_камню', 14, [40, 48],
   ['runes'], 'quartz_amulet',
   [['quartz', 1], ['silver_ore', 1], ['coal', 1]], null],
  ['moonstone_chain', '000098.json', 'зачарование', 16, [18],
   ['runes', 'artist'], 'moonstone_chain',
   [['moonstone', 1], ['silver_ore', 1], ['coal', 1]], ['nature_blessing']],
  ['faith_amulet', '000099.json', 'зачарование', 18, [18],
   ['runes', 'elder'], 'faith_amulet',
   [['amethyst', 1], ['herb_mana', 1], ['coal', 1]], ['light_heal']],
  ['obsidian_pendant', '000100.json', 'резьба_по_камню', 18, [40, 48],
   ['runes'], 'obsidian_pendant',
   [['obsidian', 1], ['silver_ore', 1], ['coal', 1]], null],
  ['amethyst_choker', '000101.json', 'зачарование', 20, [18],
   ['runes', 'precog'], 'amethyst_choker',
   [['amethyst', 1], ['silver_ore', 1], ['coal', 1]], ['chill']],
  ['sapphire_pendant', '000102.json', 'резьба_по_камню', 35, [40, 48],
   ['runes'], 'sapphire_pendant',
   [['sapphire', 1], ['silver_ore', 2], ['coal', 2]], null],
  ['emerald_amulet', '000103.json', 'зачарование', 40, [18],
   ['runes', 'meditation'], 'emerald_amulet',
   [['emerald', 1], ['gold_ore', 2], ['coal', 2]], ['greater_heal']],
  ['ruby_pendant', '000104.json', 'зачарование', 42, [18],
   ['runes', 'precog'], 'ruby_pendant',
   [['ruby', 1], ['gold_ore', 2], ['coal', 2]], ['fireball']],
  ['gold_chain', '000105.json', 'зачарование', 48, [18],
   ['runes', 'orator'], 'gold_chain',
   [['gold_ore', 3], ['ruby', 1], ['coal', 2]], ['flame_burst']],
  ['mithril_choker', '000106.json', 'резьба_по_камню', 55, [40, 48],
   ['runes'], 'mithril_choker',
   [['mithril_ore', 2], ['silver_ore', 1], ['coal', 2]], null],
  ['rune_necklace', '000107.json', 'зачарование', 68, [18],
   ['runes', 'perception'], 'rune_necklace',
   [['sapphire', 1], ['gold_ore', 2], ['coal', 2]], ['stone_skin']],
  ['star_pendant', '000108.json', 'зачарование', 72, [18],
   ['runes', 'precog'], 'star_pendant',
   [['sapphire', 2], ['gold_ore', 2], ['coal', 2]], ['blizzard']],
  ['dawn_pendant', '000109.json', 'зачарование', 97, [18],
   ['runes', 'meditation'], 'dawn_pendant',
   [['gold_ore', 4], ['diamond', 2], ['phoenix_feather', 1],
    ['coal', 4]], ['light_heal']],
];

test('000230.09 C1: 50 базовых рецептов (ростер §2.4: id/файл/тип/уровень/здания/навыки/результат/исходники/заклинания; 31 резьба_по_камню + 19 зачарование); «уровень» в диапазоне редкости РЕЗУЛЬТАТА (пин); зачарование — ≥1 заклинание (ID-форма); каждый из 50 ears/neck-предметов — ровно 1 базовый рецепт-результат (краснота: рецептов на ears/neck нет)', () => {
  const { byId } = loadCatalog();
  for (const [id, file, type, level, buildings, skills, resultId,
      inputs, spells] of EARSNECK_RECIPES_00023009) {
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
      id + ': результат — ears/neck-предмет «' + resultId + '»');
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
      assert.ok(r.data['заклинания'].length <= 4,
        id + ': «зачарование» — заклинания ≤ 4 (maxItems schema)');
    }
  }
  // Каждый ears/neck-предмет — ровно 1 базовый (БЕЗ «база»)
  // рецепт-результат: улучшенные (C2) дают тот же предмет, их сюда
  // не считаем.
  const basicResults = [];
  for (const { file, data } of byId.values()) {
    if (data['база'] !== undefined) continue;
    basicResults.push(
      refId(data['результат']['предмет'], REF_ITEMS, file));
  }
  for (const row of EARSNECK_RECIPES_00023009) {
    const n = basicResults.filter((x) => x === row[6]).length;
    assert.equal(n, 1,
      'ears/neck-предмет «' + row[6] + '» — ровно 1 базовый '
      + 'рецепт-результат (факт: ' + n + ')');
  }
});

// [id, файл, «база» (id), уровень, t4-материал (tier 4, 000157.04)]
// 6 улучшенных — 2 legendary + 1 impossible на часть (паттерн .08);
// все — на зачарованиях.
const EARSNECK_IMPROVED_00023009 = [
  ['star_earring_mithril', '000110.json', 'star_earring', 80, 'mithril_ore'],
  ['whisper_hoop_diamond', '000111.json', 'whisper_hoop', 85, 'diamond'],
  ['soul_bell_mithril', '000112.json', 'soul_bell', 100, 'mithril_ore'],
  ['star_pendant_mithril', '000113.json', 'star_pendant', 85, 'mithril_ore'],
  ['rune_necklace_diamond', '000114.json', 'rune_necklace', 82, 'diamond'],
  ['dawn_pendant_diamond', '000115.json', 'dawn_pendant', 100, 'diamond'],
];

test('000230.09 C2: 6 улучшенных (000110–000115) — «база» = star_earring/whisper_hoop/soul_bell/star_pendant/rune_necklace/dawn_pendant (000082/000083/000084/000108/000107/000109), тот же тип/результат, уровень ≥ базы, исходники ⊇ базы (по qty), цепочка «база» ациклична, +t4-руда/камень (tier 4) в исходниках (000157.04)', () => {
  const { byId } = loadCatalog();
  for (const [id, file, baseId, level, t4] of EARSNECK_IMPROVED_00023009) {
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

// =====================================================================
// Задача 000230.10 — рецепты на предметы «Тело»: 25 базовых +
// 3 улучшенных (контентная волна 3 серии 000230; P2).
// Контракт — memory/000230.10-torso-items-wave.md §2.4 (id/файлы
// фиксированы: 000116–000143; 15 × столярное_дело [5] + 2 ×
// кузнечное_дело [8, 25] (000250: кожаные брони); 8 × зачарование [18]
// skills [runes, первый affix-skill] + заклинания ID-формат,
// maxItems 4; 3 × improved зачарование +t4, «база» = 000138/000139/
// 000140, материалы ⊇ базовых). RED (TDD): в assets/craft 115
// файлов (000001–000115), рецептов с torso-результатами нет —
// тесты падают по ОСМЫСЛЕННОЙ причине «рецепты волны не созданы»
// (нет id/файлов), а не по синтаксису.
// =====================================================================

// [id, файл, тип, уровень, здания (resolved id), навыки (resolved id),
//  результат (id), исходники [[id, qty]], заклинания (null — поле нет)]
const TORSO_RECIPES_00023010 = [
  ['linen_shirt', '000116.json', 'столярное_дело', 2, [5],
   ['dexterity'], 'linen_shirt', [['wood_log', 2], ['coal', 1]], null],
  ['wool_shirt', '000117.json', 'столярное_дело', 3, [5],
   ['dexterity'], 'wool_shirt', [['hide', 1], ['coal', 1]], null],
  ['cloth_tunic', '000118.json', 'столярное_дело', 3, [5],
   ['dexterity'], 'cloth_tunic', [['wood_log', 2], ['herb_bitter', 1]], null],
  ['linen_gown', '000119.json', 'столярное_дело', 4, [5],
   ['dexterity'], 'linen_gown', [['wood_log', 2], ['coal', 1]], null],
  ['hemp_robe', '000120.json', 'столярное_дело', 4, [5],
   ['dexterity'], 'hemp_robe', [['wood_log', 3], ['coal', 1]], null],
  ['rough_kaftan', '000121.json', 'столярное_дело', 5, [5],
   ['dexterity'], 'rough_kaftan', [['hide', 2], ['coal', 1]], null],
  ['wool_gown', '000122.json', 'столярное_дело', 6, [5],
   ['dexterity'], 'wool_gown', [['hide', 1], ['wood_log', 2], ['coal', 1]], null],
  ['cloth_sutan', '000123.json', 'столярное_дело', 6, [5],
   ['dexterity'], 'cloth_sutan', [['wood_log', 2], ['herb_bitter', 1]], null],
  ['linen_tunic', '000124.json', 'столярное_дело', 7, [5],
   ['dexterity'], 'linen_tunic', [['wood_log', 2], ['coal', 2]], null],
  ['wool_kaftan', '000125.json', 'столярное_дело', 9, [5],
   ['dexterity'], 'wool_kaftan', [['hide', 2], ['coal', 2]], null],
  ['wool_sutan', '000126.json', 'столярное_дело', 12, [5],
   ['dexterity'], 'wool_sutan', [['hide', 2], ['wood_log', 2], ['coal', 1]], null],
  ['leather_kaftan', '000127.json', 'кузнечное_дело', 14, [8, 25],
   ['dexterity'], 'leather_kaftan', [['hide', 3], ['coal', 2]], null],
  ['embroidered_kaftan', '000128.json', 'столярное_дело', 16, [5],
   ['dexterity'], 'embroidered_kaftan',
   [['wood_log', 2], ['herb_bitter', 2], ['coal', 1]], null],
  ['cloth_robe', '000129.json', 'столярное_дело', 18, [5],
   ['dexterity'], 'cloth_robe', [['wood_log', 3], ['coal', 2]], null],
  ['leather_gown', '000130.json', 'кузнечное_дело', 20, [8, 25],
   ['dexterity'], 'leather_gown',
   [['hide', 3], ['coal', 2], ['wood_log', 1]], null],
  ['monk_sutan', '000131.json', 'столярное_дело', 22, [5],
   ['dexterity'], 'monk_sutan',
   [['wood_log', 2], ['herb_bitter', 2], ['coal', 2]], null],
  ['fine_kaftan', '000132.json', 'столярное_дело', 25, [5],
   ['dexterity'], 'fine_kaftan',
   [['hide', 2], ['wood_log', 2], ['coal', 3]], null],
  ['ember_robe', '000133.json', 'зачарование', 35, [18],
   ['runes', 'endurance'], 'ember_robe',
   [['silver_ore', 1], ['gold_ore', 1], ['coal', 2]], ['heat_shield']],
  ['stone_robe', '000134.json', 'зачарование', 38, [18],
   ['runes', 'golem'], 'stone_robe',
   [['obsidian', 1], ['silver_ore', 1], ['coal', 2]], ['stone_skin']],
  ['shadow_robe', '000135.json', 'зачарование', 42, [18],
   ['runes', 'hide'], 'shadow_robe',
   [['amethyst', 1], ['silver_ore', 1], ['coal', 2]], ['stone_skin']],
  ['deep_breath_robe', '000136.json', 'зачарование', 45, [18],
   ['runes', 'breath'], 'deep_breath_robe',
   [['quartz', 1], ['silver_ore', 2], ['coal', 2]], ['nature_blessing']],
  ['meditating_robe', '000137.json', 'зачарование', 55, [18],
   ['runes', 'meditation'], 'meditating_robe',
   [['emerald', 1], ['gold_ore', 1], ['coal', 2]], ['mend']],
  ['pilgrim_sutan', '000138.json', 'зачарование', 70, [18],
   ['runes', 'endurance'], 'pilgrim_sutan',
   [['sapphire', 1], ['gold_ore', 2], ['coal', 2]], ['greater_heal']],
  ['void_robe', '000139.json', 'зачарование', 80, [18],
   ['runes', 'golem'], 'void_robe',
   [['sapphire', 2], ['gold_ore', 2], ['coal', 3]], ['shadow_bolt']],
  ['aegis_mantle', '000140.json', 'зачарование', 95, [18],
   ['runes', 'hide'], 'aegis_mantle',
   [['gold_ore', 4], ['phoenix_feather', 2], ['ruby', 2], ['coal', 3]],
   ['magic_shield']],
];

test('000230.10 T11: 25 базовых рецептов (ростер §2.4: id/файл/тип/уровень/здания/навыки/результат/исходники/заклинания; 15 столярное_дело [5] + 2 кузнечное_дело [8, 25] + 8 зачарование [18]; ре-пин 000250: 000127/000130 в кузнечное_дело); «уровень» в диапазоне редкости РЕЗУЛЬТАТА (пин); зачарование — ≥1 заклинание ID-формы (≤4); каждый из 25 torso-предметов — ровно 1 базовый рецепт-результат (краснота: рецептов на torso нет)', () => {
  const { byId } = loadCatalog();
  for (const [id, file, type, level, buildings, skills, resultId,
      inputs, spells] of TORSO_RECIPES_00023010) {
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
      id + ': результат — torso-предмет «' + resultId + '»');
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
      assert.ok(r.data['заклинания'].length <= 4,
        id + ': «зачарование» — заклинания ≤ 4 (maxItems schema)');
    }
  }
  // Каждый torso-предмет — ровно 1 базовый (БЕЗ «база»)
  // рецепт-результат: улучшенные (T12) дают тот же предмет, их сюда
  // не считаем.
  const basicResults = [];
  for (const { file, data } of byId.values()) {
    if (data['база'] !== undefined) continue;
    basicResults.push(
      refId(data['результат']['предмет'], REF_ITEMS, file));
  }
  for (const row of TORSO_RECIPES_00023010) {
    const n = basicResults.filter((x) => x === row[6]).length;
    assert.equal(n, 1,
      'torso-предмет «' + row[6] + '» — ровно 1 базовый '
      + 'рецепт-результат (факт: ' + n + ')');
  }
});

// [id, файл, «база» (id), уровень, t4-материал (tier 4, 000157.04)]
const TORSO_IMPROVED_00023010 = [
  ['pilgrim_sutan_mithril', '000141.json', 'pilgrim_sutan', 85,
   'mithril_ore'],
  ['void_robe_diamond', '000142.json', 'void_robe', 88, 'diamond'],
  ['aegis_mantle_mithril', '000143.json', 'aegis_mantle', 100,
   'mithril_ore'],
];

// =====================================================================
// Задача 000230.11 — T9/T10 (контракт — memory/000230.11-forearms-
// palms-items-wave.md §2.4, решения D-01/D-08/D-16). 50 базовых
// (000144–000193: 16 столярное_дело [5] dexterity + 21
// кузнечное_дело [8,25] forge + 13 зачарование [18] runes+first-
// affix-skill) + 6 улучшенных (000194–000199). 1:1-формула: рецепт
// NNNNNN ↔ предмет 000283+(NNNNN−144); id базового рецепта == id
// предмета; id улучшенного = <item>_<mat>; «база» улучшенного —
// ИСПРАВЛЕННЫЕ (D-16) id базовых 000166/000167/000168/000191/000192/
// 000193. Точные qty — green-таблица (D-08): здесь пинуются КОНТРАКТНЫЕ
// МНОЖЕСТВА материалов (по типу+редкости результата) + первичный
// материал строки + coal/самоцвет-ограничения + ТОЧНЫЙ паттерн
// crown_flame для impossible-кузнечного. RED (TDD): рецептов
// 000144–000199 нет в каталоге — падение по ОСМЫСЛЕННОЙ причине
// «рецепт волны не создан» (не синтаксис/окружение).
// =====================================================================

// [id, файл, тип, уровень, здания (resolved), навыки (resolved),
//  первичный материал, заклинания (null — отсутствуют)]
const HANDS_RECIPES_00023011 = [
  ['cloth_cuff', '000144.json', 'столярное_дело', 2, [5],
   ['dexterity'], 'wood_log', null],
  ['leather_cuff', '000145.json', 'столярное_дело', 4, [5],
   ['dexterity'], 'hide', null],
  ['hemp_bracer', '000146.json', 'столярное_дело', 5, [5],
   ['dexterity'], 'wood_log', null],
  ['rough_bracer', '000147.json', 'кузнечное_дело', 5, [8, 25],
   ['forge'], 'iron_ore', null],
  ['leather_garter', '000148.json', 'столярное_дело', 6, [5],
   ['dexterity'], 'hide', null],
  ['cloth_wrap', '000149.json', 'столярное_дело', 7, [5],
   ['dexterity'], 'wood_log', null],
  ['iron_cuff', '000150.json', 'кузнечное_дело', 7, [8, 25],
   ['forge'], 'iron_ore', null],
  ['bone_bracer', '000151.json', 'кузнечное_дело', 8, [8, 25],
   ['forge'], 'stone_chunk', null],
  ['wood_brace', '000152.json', 'столярное_дело', 8, [5],
   ['dexterity'], 'wood_log', null],
  ['hide_cuff', '000153.json', 'столярное_дело', 10, [5],
   ['dexterity'], 'hide', null],
  ['studded_bracer', '000154.json', 'кузнечное_дело', 12, [8, 25],
   ['forge'], 'copper_ore', null],
  ['copper_brace', '000155.json', 'кузнечное_дело', 15, [8, 25],
   ['forge'], 'copper_ore', null],
  ['archer_brace', '000156.json', 'столярное_дело', 16, [5],
   ['dexterity'], 'hide', null],
  ['silver_cuff', '000157.json', 'кузнечное_дело', 18, [8, 25],
   ['forge'], 'silver_ore', null],
  ['shadow_wrap', '000158.json', 'зачарование', 20, [18],
   ['runes', 'thief'], 'obsidian', ['shadow_bind']],
  ['iron_elbow', '000159.json', 'кузнечное_дело', 22, [8, 25],
   ['forge'], 'iron_ore', null],
  ['runic_cuff', '000160.json', 'зачарование', 25, [18],
   ['runes', 'step'], 'quartz', ['blazing_speed']],
  ['steel_bracers', '000161.json', 'кузнечное_дело', 35, [8, 25],
   ['forge'], 'iron_ore', null],
  ['gold_brace', '000162.json', 'кузнечное_дело', 42, [8, 25],
   ['forge'], 'gold_ore', null],
  ['sapphire_bracer', '000163.json', 'кузнечное_дело', 50, [8, 25],
   ['forge'], 'sapphire', null],
  ['ghost_cuff', '000164.json', 'зачарование', 50, [18],
   ['runes', 'thief'], 'amethyst', ['invisibility']],
  ['swift_brace', '000165.json', 'зачарование', 55, [18],
   ['runes', 'step'], 'quartz', ['winter_haste']],
  ['rune_bracers', '000166.json', 'зачарование', 70, [18],
   ['runes', 'swordsman'], 'amethyst', ['night_blade']],
  ['star_armguard', '000167.json', 'зачарование', 80, [18],
   ['runes', 'fists'], 'obsidian', ['hellfire']],
  ['titan_brace', '000168.json', 'кузнечное_дело', 95, [8, 25],
   ['forge'], 'gold_ore', null],
  ['cloth_gloves', '000169.json', 'столярное_дело', 2, [5],
   ['dexterity'], 'wood_log', null],
  ['leather_gloves', '000170.json', 'столярное_дело', 4, [5],
   ['dexterity'], 'hide', null],
  ['hide_gloves', '000171.json', 'столярное_дело', 5, [5],
   ['dexterity'], 'hide', null],
  ['rough_gauntlets', '000172.json', 'кузнечное_дело', 5, [8, 25],
   ['forge'], 'iron_ore', null],
  ['archer_gloves', '000173.json', 'столярное_дело', 6, [5],
   ['dexterity'], 'hide', null],
  ['linen_wraps', '000174.json', 'столярное_дело', 7, [5],
   ['dexterity'], 'wood_log', null],
  ['iron_gauntlets', '000175.json', 'кузнечное_дело', 7, [8, 25],
   ['forge'], 'iron_ore', null],
  ['bone_grips', '000176.json', 'кузнечное_дело', 8, [8, 25],
   ['forge'], 'stone_chunk', null],
  ['wood_guards', '000177.json', 'столярное_дело', 8, [5],
   ['dexterity'], 'wood_log', null],
  ['fine_gloves', '000178.json', 'столярное_дело', 10, [5],
   ['dexterity'], 'hide', null],
  ['studded_gloves', '000179.json', 'кузнечное_дело', 12, [8, 25],
   ['forge'], 'copper_ore', null],
  ['copper_gauntlets', '000180.json', 'кузнечное_дело', 15, [8, 25],
   ['forge'], 'copper_ore', null],
  ['quiver_gloves', '000181.json', 'столярное_дело', 16, [5],
   ['dexterity'], 'hide', null],
  ['silver_gauntlets', '000182.json', 'кузнечное_дело', 18, [8, 25],
   ['forge'], 'silver_ore', null],
  ['night_gloves', '000183.json', 'зачарование', 20, [18],
   ['runes', 'thief'], 'obsidian', ['shroud']],
  ['iron_wraps', '000184.json', 'кузнечное_дело', 22, [8, 25],
   ['forge'], 'iron_ore', null],
  ['wind_gloves', '000185.json', 'зачарование', 25, [18],
   ['runes', 'step'], 'quartz', ['flame_step']],
  ['steel_gauntlets', '000186.json', 'кузнечное_дело', 35, [8, 25],
   ['forge'], 'iron_ore', null],
  ['gold_gloves', '000187.json', 'кузнечное_дело', 42, [8, 25],
   ['forge'], 'gold_ore', null],
  ['emerald_gauntlets', '000188.json', 'кузнечное_дело', 50, [8, 25],
   ['forge'], 'emerald', null],
  ['phantom_gloves', '000189.json', 'зачарование', 50, [18],
   ['runes', 'thief'], 'amethyst', ['veil_of_night']],
  ['haste_wraps', '000190.json', 'зачарование', 55, [18],
   ['runes', 'step'], 'quartz', ['blazing_speed']],
  ['rune_gauntlets', '000191.json', 'зачарование', 70, [18],
   ['runes', 'fists'], 'amethyst', ['night_blade']],
  ['star_gloves', '000192.json', 'зачарование', 80, [18],
   ['runes', 'archer'], 'obsidian', ['void_arrow']],
  ['void_gauntlet', '000193.json', 'зачарование', 95, [18],
   ['runes', 'thief'], 'obsidian', ['shadowflame']],
];

// Контрактные множества материалов (D-08: точные qty — green-таблица;
// здесь — мультисеты + первичный материал строки + ограничения).
const HANDS_ALLOWED_INPUTS_00023011 = {
  'столярное_дело': new Set(['wood_log', 'hide', 'coal', 'herb_bitter']),
  'кузнечное_дело': {
    common: new Set(['copper_ore', 'iron_ore', 'stone_chunk', 'coal']),
    rare: new Set(['copper_ore', 'iron_ore', 'stone_chunk', 'coal',
      'silver_ore']),
    epic: new Set(['gold_ore', 'sapphire', 'emerald', 'iron_ore',
      'silver_ore', 'coal']),
  },
  'зачарование': new Set(['obsidian', 'amethyst', 'quartz',
    'silver_ore', 'coal']),
};
const HANDS_ENCHANT_GEMS_00023011 = new Set(
  ['obsidian', 'amethyst', 'quartz']);
// Точный паттерн impossible-кузнечного (crown_flame, 000056.json):
const CROWN_FLAME_INPUTS_00023011 = [
  ['gold_ore', 4], ['mithril_ore', 2], ['diamond', 1],
  ['ruby', 2], ['coal', 4],
];

test('000230.11 T9: 50 базовых рецептов (ростер §2.4: id/файл/тип/уровень/здания/навыки/результат/исходники/заклинания; 16 столярное_дело [5] dexterity + 21 кузнечное_дело [8,25] forge + 13 зачарование [18] runes+first-affix-skill); 1:1-формула: результат = assets/items/000283+(NNNNN−144).json, id рецепта == id предмета (D-01); материалы ⊆ контрактного множества по типу+редкости результата (D-08: qty — green-таблица) + первичный материал строки + ≥2 различных; зачарование — ровно 3 различных (silver_ore + coal + ровно 1 самоцвет = первичный); кузнечное — coal обязателен, ≤4; столярное — ≤3; impossible-кузнечное (titan_brace) — ТОЧНЫЙ паттерн crown_flame; «уровень» в диапазоне редкости РЕЗУЛЬТАТА (пин); зачарование — 1–4 заклинания (ID-форма, live); каждый из 50 forearms/palms-предметов — ровно 1 базовый рецепт-результат (краснота: рецептов волны нет)', () => {
  const { byId } = loadCatalog();
  const spellIds = loadSpellIds();
  for (const [id, file, type, level, buildings, skills, primaryMat,
      spells] of HANDS_RECIPES_00023011) {
    const r = byId.get(id);
    assert.ok(r, 'рецепт «' + id + '» (' + file + ') в каталоге '
      + '(краснота: рецепт волны не создан)');
    assert.equal(r.file, file, id + ': файл ' + file
      + ' (1:1-формула §2.4)');
    assert.equal(r.data['тип'], type, id + ': тип «' + type + '»');
    assert.equal(r.data['уровень'], level, id + ': уровень ' + level);
    assert.deepEqual(
      r.data['здания'].map((b) => refId(b, REF_BUILDINGS, r.file)),
      buildings, id + ': здания (resolved id)');
    assert.deepEqual(
      r.data['навыки'].map((s) => refId(s, REF_SKILLS, r.file)),
      skills, id + ': навыки (resolved id)');
    assert.equal(r.data['база'], undefined,
      id + ': базовый рецепт (без «база»); улучшенные — T10');
    const n = parseInt(file, 10);
    const resPath = r.data['результат']['предмет'];
    assert.equal(
      resPath, 'assets/items/'
        + String(283 + (n - 144)).padStart(6, '0') + '.json',
      id + ': 1:1-формула — результат assets/items/000283+('
      + n + '−144).json (D-01)');
    const resId = refId(resPath, REF_ITEMS, r.file);
    assert.equal(resId, id,
      id + ': id базового рецепта == id предмета (1:1, D-01)');
    assert.equal(r.data['результат']['количество'], 1,
      id + ': результат ×1');
    const rawInp = r.data['исходники'].map((i) =>
      [refId(i['предмет'], REF_ITEMS, r.file), i['количество']]);
    for (const [iid, q] of rawInp) {
      assert.ok(Number.isInteger(q) && q >= 1,
        id + ': количество исходника «' + iid + '» — целое ≥ 1');
    }
    assert.equal(new Set(rawInp.map((x) => x[0])).size, rawInp.length,
      id + ': дублей строк исходников нет');
    const m = new Map();
    for (const [iid, q] of rawInp)
      m.set(iid, (m.get(iid) || 0) + q);
    assert.ok(m.has(primaryMat),
      id + ': первичный материал «' + primaryMat + '» в исходниках '
      + '(§2.4)');
    const distinct = [...m.keys()];
    assert.ok(distinct.length >= 2,
      id + ': ≥2 различных материала; факт: ' + distinct.join(','));
    const it = getItem(resId);
    assert.ok(it, id + ': результат «' + resId + '» — в assets/items '
      + '(краснота: предмета нет — волна не добавлена)');
    if (type === 'зачарование') {
      assert.equal(distinct.length, 3,
        id + ': зачарование — ровно 3 различных материала (§2.4); '
        + 'факт: ' + distinct.join(','));
      assert.ok(m.has('silver_ore') && m.has('coal'),
        id + ': зачарование — silver_ore + coal обязательны (§2.4)');
      const gems = distinct.filter((g) =>
        HANDS_ENCHANT_GEMS_00023011.has(g));
      assert.equal(gems.length, 1,
        id + ': ровно 1 самоцвет {obsidian,amethyst,quartz}; факт: '
        + gems.join(','));
      assert.deepEqual(gems, [primaryMat],
        id + ': самоцвет = первичный материал строки');
      for (const g of distinct) {
        assert.ok(HANDS_ALLOWED_INPUTS_00023011['зачарование'].has(g),
          id + ': материал «' + g + '» ⊆ мультисета зачарования');
      }
    } else if (type === 'столярное_дело') {
      assert.ok(distinct.length <= 3,
        id + ': столярное — ≤3 различных (§2.4); факт: '
        + distinct.join(','));
      for (const g of distinct) {
        assert.ok(
          HANDS_ALLOWED_INPUTS_00023011['столярное_дело'].has(g),
          id + ': материал «' + g + '» ⊆ мультисета столярного');
      }
    } else if (it.rarity === 'impossible') {
      assert.deepEqual(rawInp, CROWN_FLAME_INPUTS_00023011,
        id + ': impossible-кузнечное — ТОЧНЫЙ паттерн crown_flame '
        + '(§2.4: gold_ore×4, mithril_ore×2, diamond×1, ruby×2, '
        + 'coal×4)');
    } else {
      const allowed = HANDS_ALLOWED_INPUTS_00023011
        ['кузнечное_дело'][it.rarity];
      assert.ok(allowed,
        id + ': кузнечное — редкость результата «' + it.rarity
        + '» допустима (§2.4)');
      assert.ok(distinct.length <= 4,
        id + ': кузнечное — ≤4 различных (§2.4); факт: '
        + distinct.join(','));
      assert.ok(m.has('coal'),
        id + ': кузнечное — coal обязателен (§2.4)');
      for (const g of distinct) {
        assert.ok(allowed.has(g),
          id + ': материал «' + g + '» ⊆ мультисета кузнечного '
          + it.rarity);
      }
    }
    if (spells === null) {
      assert.equal(r.data['заклинания'], undefined,
        id + ': «заклинания» отсутствуют');
    } else {
      assert.deepEqual(r.data['заклинания'], spells,
        id + ': «заклинания» (ID-форма, §2.4)');
      assert.ok(spells.length >= 1 && spells.length <= 4,
        id + ': «заклинание» — 1–4 (maxItems schema)');
      for (const s of spells) {
        assert.ok(spellIds.has(s),
          id + ': заклинание «' + s + '» — в assets/spells (live)');
      }
    }
    const [lo, hi] = RARITY_LEVEL_RANGE_00023008[it.rarity];
    assert.ok(level >= lo && level <= hi,
      id + ': уровень ' + level + ' в диапазоне редкости ' + it.rarity
      + ' [' + lo + '–' + hi + '] (пин ТЗ)');
  }
  // Каждый forearms/palms-предмет — ровно 1 базовый (БЕЗ «база»)
  // рецепт-результат (улучшенные T10 дают тот же предмет — их сюда
  // не считаем).
  const basicResults = [];
  for (const { file, data } of byId.values()) {
    if (data['база'] !== undefined) continue;
    basicResults.push(
      refId(data['результат']['предмет'], REF_ITEMS, file));
  }
  for (const row of HANDS_RECIPES_00023011) {
    const n = basicResults.filter((x) => x === row[0]).length;
    assert.equal(n, 1,
      'forearms/palms-предмет «' + row[0] + '» — ровно 1 базовый '
      + 'рецепт-результат (факт: ' + n + ')');
  }
});

// [id, файл, «база» (id), файл «база», уровень, t4-материал (tier 4)]
// 6 улучшенных (D-16: ИСПРАВЛЕННЫЕ «база» — 000166/000167/000168/
// 000191/000192/000193, НЕ архитектурный черновик); id = <item>_<mat>.
const HANDS_IMPROVED_00023011 = [
  ['rune_bracers_mithril', '000194.json', 'rune_bracers',
   '000166.json', 85, 'mithril_ore'],
  ['star_armguard_diamond', '000195.json', 'star_armguard',
   '000167.json', 88, 'diamond'],
  ['titan_brace_mithril', '000196.json', 'titan_brace',
   '000168.json', 100, 'mithril_ore'],
  ['rune_gauntlets_mithril', '000197.json', 'rune_gauntlets',
   '000191.json', 85, 'mithril_ore'],
  ['star_gloves_diamond', '000198.json', 'star_gloves',
   '000192.json', 88, 'diamond'],
  ['void_gauntlet_mithril', '000199.json', 'void_gauntlet',
   '000193.json', 100, 'mithril_ore'],
];

test('000230.11 T10: 6 улучшенных (000194–000199) — id = <item>_<mat>; «база» = ИСПРАВЛЕННЫЕ (D-16) assets/craft/000166/000167/000168/000191/000192/000193.json (рune_bracers/star_armguard/titan_brace/rune_gauntlets/star_gloves/void_gauntlet); тот же тип/результат, что у базы; уровень ровно 85/88/100/85/88/100 (не ниже базового); исходники ⊇ базовых (по qty); +t4-руда/камень (tier 4) в исходниках; цепочка «база» ациклична (краснота: улучшенные рецепты не созданы)', () => {
  const { byId } = loadCatalog();
  for (const [id, file, baseId, baseFile, level, t4]
      of HANDS_IMPROVED_00023011) {
    const r = byId.get(id);
    assert.ok(r, 'рецепт «' + id + '» (' + file + ') в каталоге '
      + '(краснота: улучшенный рецепт не создан)');
    assert.equal(r.file, file, id + ': файл ' + file);
    // Тех-правка 000230.11 (зелёная): суффикс id — КОРОТКОЕ имя
    // материала (mithril/diamond; конвенция всех 22 улучшенных
    // 000230.08–.10 и таблица §2.4 memory), а t4 в строке — id
    // предмета tier 4 для материального пина.
    const matShort = t4.replace(/_ore$/, '');
    assert.equal(id, baseId + '_' + matShort,
      id + ': id улучшенного = <item>_<mat>');
    assert.equal(r.data['база'], 'assets/craft/' + baseFile,
      id + ': «база» — assets/craft/' + baseFile + ' (D-16: '
      + 'исправленные «база»)');
    assert.equal(refId(r.data['база'], REF_CRAFT, r.file), baseId,
      id + ': «база» — «' + baseId + '»');
    const base = byId.get(baseId);
    assert.ok(base, id + ': базовый рецепт «' + baseId + '» в '
      + 'каталоге (краснота: базовый рецепт волны не создан)');
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
      assert.ok(!seen.has(cur.data.id), id + ': цикл на «'
        + cur.data.id + '»');
      seen.add(cur.data.id);
      cur = byId.get(refId(cur.data['база'], REF_CRAFT, curFile));
      curFile = cur.file;
    }
  }
});

test('000230.10 T12: 3 улучшенных (000141–000143) — «база» = pilgrim_sutan/void_robe/aegis_mantle (000138/000139/000140), тот же тип/результат, уровень ровно 85/88/100 (не ниже базового), исходники ⊇ базовых (по qty), цепочка «база» ациклична, +t4-руда/камень (tier 4) в исходниках (краснота: улучшенные рецепты не созданы)', () => {
  const { byId } = loadCatalog();
  for (const [id, file, baseId, level, t4] of TORSO_IMPROVED_00023010) {
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
// Задача 000230.13 — предметы «Левая рука»: 25 (10/7/5/2/1) + иконки +
// рецепты (контентная волна 4 серии 000230; P2). Щиты (kind shield)
// и магические артефакты (kind artifact).
// Контракт — memory/000230.13-left-hand-items-wave.md §2.4 (id/файлы
// фиксированы 000260–000287: 10 × столярное_дело [5] мастерская +
// навыки [dexterity]; 2 × кузнечное_дело [8,25] кузница +
// [forge]; 13 × зачарование [18] башня мага + [runes, affix-skill]
// (runes-affix — [runes, scholar], D-09) + «заклинания» ID-формы;
// 3 × улучшенное зачарование +t4, «база» = 000282/000283/000284,
// уровень 85/88/100, исходники ⊇ базовых). RED (TDD): в assets/craft
// нет 000260–000287 — тесты падают по ОСМЫСЛЕННОЙ причине («рецепт
// волны не создан»), а не по синтаксису. Технические репины
// существующих тестов (COUNT/SUM и др.) — стадия ЗЕЛЁНАЯ.
// =====================================================================

// [id, файл, тип, уровень, здания (resolved id), навыки (resolved id),
//  результат (id), исходники [[id, qty]], заклинания (null — поля нет)]
const LEFT_HAND_RECIPES_00023013 = [
  ['wooden_buckler', '000260.json', 'столярное_дело', 2, [5],
   ['dexterity'], 'wooden_buckler', [['wood_log', 2], ['coal', 1]], null],
  ['leather_shield', '000261.json', 'столярное_дело', 3, [5],
   ['dexterity'], 'leather_shield', [['hide', 2], ['coal', 1]], null],
  ['cloth_shield', '000262.json', 'столярное_дело', 3, [5],
   ['dexterity'], 'cloth_shield',
   [['wood_log', 2], ['herb_bitter', 1]], null],
  ['wicker_buckler', '000263.json', 'столярное_дело', 4, [5],
   ['dexterity'], 'wicker_buckler',
   [['wood_log', 1], ['herb_mana', 1]], null],
  ['oiled_shield', '000264.json', 'столярное_дело', 5, [5],
   ['dexterity'], 'oiled_shield', [['wood_log', 2], ['coal', 2]], null],
  ['bone_shield', '000265.json', 'столярное_дело', 5, [5],
   ['dexterity'], 'bone_shield', [['stone_chunk', 2], ['coal', 1]], null],
  ['horn_shield', '000266.json', 'столярное_дело', 6, [5],
   ['dexterity'], 'horn_shield', [['stone_chunk', 1], ['hide', 1]], null],
  ['palm_shield', '000267.json', 'столярное_дело', 7, [5],
   ['dexterity'], 'palm_shield',
   [['wood_log', 2], ['herb_bitter', 1]], null],
  ['ash_shield', '000268.json', 'столярное_дело', 8, [5],
   ['dexterity'], 'ash_shield', [['wood_log', 3], ['coal', 1]], null],
  ['clay_buckler', '000269.json', 'столярное_дело', 10, [5],
   ['dexterity'], 'clay_buckler', [['stone_chunk', 2], ['coal', 1]], null],
  ['iron_round', '000270.json', 'кузнечное_дело', 15, [8, 25],
   ['forge'], 'iron_round', [['iron_ore', 2], ['coal', 1]], null],
  ['steel_buckler', '000271.json', 'кузнечное_дело', 20, [8, 25],
   ['forge'], 'steel_buckler', [['iron_ore', 3], ['coal', 2]], null],
  ['rune_charm', '000272.json', 'зачарование', 12, [18],
   ['runes', 'scholar'], 'rune_charm',
   [['obsidian', 1], ['wood_log', 1]], ['spark']],
  ['guard_amulet', '000273.json', 'зачарование', 15, [18],
   ['runes', 'perception'], 'guard_amulet',
   [['moonstone', 1], ['silver_ore', 1], ['coal', 1]], ['ward']],
  ['ember_focus', '000274.json', 'зачарование', 18, [18],
   ['runes', 'firelord'], 'ember_focus',
   [['phosphorite', 1], ['coal', 1]], ['flame_burst']],
  ['frost_charm', '000275.json', 'зачарование', 22, [18],
   ['runes', 'icelord'], 'frost_charm',
   [['quartz', 1], ['silver_ore', 1], ['coal', 1]], ['frost_bolt']],
  ['scholar_pendant', '000276.json', 'зачарование', 25, [18],
   ['runes', 'scholar'], 'scholar_pendant',
   [['moonstone', 1], ['wood_log', 1]], ['firelight']],
  ['ward_crystal', '000277.json', 'зачарование', 35, [18],
   ['runes', 'perception'], 'ward_crystal',
   [['sapphire', 1], ['silver_ore', 1], ['coal', 1]], ['magic_shield']],
  ['cinder_eye', '000278.json', 'зачарование', 40, [18],
   ['runes', 'firelord'], 'cinder_eye',
   [['ruby', 1], ['obsidian', 1], ['coal', 1]], ['fire_aura']],
  ['frost_orb', '000279.json', 'зачарование', 45, [18],
   ['runes', 'icelord'], 'frost_orb',
   [['quartz', 1], ['moonstone', 1], ['coal', 1]], ['ice_armor']],
  ['rune_sphere', '000280.json', 'зачарование', 50, [18],
   ['runes', 'scholar'], 'rune_sphere',
   [['amethyst', 1], ['silver_ore', 1], ['coal', 1]], ['shatter']],
  ['mind_pendant', '000281.json', 'зачарование', 55, [18],
   ['runes', 'precog'], 'mind_pendant',
   [['amethyst', 1], ['gold_ore', 1], ['coal', 1]], ['veil_of_night']],
  ['arcane_eye', '000282.json', 'зачарование', 70, [18],
   ['runes', 'precog'], 'arcane_eye',
   [['sapphire', 2], ['gold_ore', 1], ['coal', 1]], ['shroud']],
  ['snow_focus', '000283.json', 'зачарование', 80, [18],
   ['runes', 'scholar'], 'snow_focus',
   [['quartz', 2], ['gold_ore', 1], ['coal', 2]], ['ice_armor']],
  ['heart_of_elements', '000284.json', 'зачарование', 95, [18],
   ['runes', 'firelord'], 'heart_of_elements',
   [['gold_ore', 4], ['phoenix_feather', 2], ['ruby', 1],
    ['coal', 3]], ['inferno']],
];

test('000230.13 T11: 25 базовых рецептов (ростер §2.4: id/файл/тип/уровень/здания/навыки/результат/исходники/заклинания; 10 столярное_дело [5] + 2 кузнечное_дело [8,25] + 13 зачарование [18]); «уровень» в диапазоне редкости РЕЗУЛЬТАТА (пин); зачарование — ≥1 заклинание ID-формы (≤4); каждый из 25 left_hand-предметов — ровно 1 базовый рецепт-результат (краснота: рецептов на left_hand нет)', () => {
  const { byId } = loadCatalog();
  for (const [id, file, type, level, buildings, skills, resultId,
      inputs, spells] of LEFT_HAND_RECIPES_00023013) {
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
      id + ': результат — left_hand-предмет «' + resultId + '»');
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
      assert.ok(r.data['заклинания'].length <= 4,
        id + ': «зачарование» — заклинания ≤ 4 (maxItems schema)');
    }
  }
  // Каждый left_hand-предмет — ровно 1 базовый (БЕЗ «база»)
  // рецепт-результат: улучшенные (T12) дают тот же предмет, их сюда
  // не считаем.
  const basicResults = [];
  for (const { file, data } of byId.values()) {
    if (data['база'] !== undefined) continue;
    basicResults.push(
      refId(data['результат']['предмет'], REF_ITEMS, file));
  }
  for (const row of LEFT_HAND_RECIPES_00023013) {
    const n = basicResults.filter((x) => x === row[6]).length;
    assert.equal(n, 1,
      'left_hand-предмет «' + row[6] + '» — ровно 1 базовый '
      + 'рецепт-результат (факт: ' + n + ')');
  }
});

// [id, файл, «база» (id), уровень, t4-материал (tier 4, 000157.04)]
const LEFT_HAND_IMPROVED_00023013 = [
  ['arcane_eye_diamond', '000285.json', 'arcane_eye', 85, 'diamond'],
  ['snow_focus_mithril', '000286.json', 'snow_focus', 88,
   'mithril_ore'],
  ['heart_of_elements_mithril', '000287.json', 'heart_of_elements', 100,
   'mithril_ore'],
];

test('000230.13 T12: 3 улучшенных (000285–000287) — «база» = arcane_eye/snow_focus/heart_of_elements (000282/000283/000284), тот же тип/результат, уровень ровно 85/88/100 (не ниже базового), исходники ⊇ базовых (по qty), цепочка «база» ациклична, +t4-руда/камень (tier 4) в исходниках (краснота: улучшенные рецепты не созданы)', () => {
  const { byId } = loadCatalog();
  for (const [id, file, baseId, level, t4] of LEFT_HAND_IMPROVED_00023013) {
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

// Задача 000230.14 — рецепты колец: 25 базовых (000310–000334,
// каталожный порядок) + 3 улучшенных (000335–000337) (контракт —
// memory/000230.14-ring-items-wave.md §2.4/D-07: 15 резьба_по_камню
// [40+48] + 10 зачарование [18] (тема/free_cast — паттерн .08/.09);
// «уровень» ∈ RARITY_LEVEL_RANGE_00023008; исходники — паттерн .09;
// improved — self-ref «база» + t4, ур. 85/88/100).
// RED (TDD): в assets/craft 143 файла (000001–000143), файлов
// 000310–000337 НЕТ — тесты падают по ОСМЫСЛЕННОЙ причине «рецепт
// волны не создан» (не синтаксис).
// =====================================================================

// [id, файл, тип, уровень, здания (resolved id), навыки (resolved id),
//  результат (id), исходники [[id, qty]], заклинания (null — поле нет)]
const RING_RECIPES_00023014 = [
  ['copper_ring', '000310.json', 'резьба_по_камню', 2, [40, 48],
   ['runes'], 'copper_ring', [['copper_ore', 2], ['coal', 1]], null],
  ['bone_ring', '000311.json', 'резьба_по_камню', 3, [40, 48],
   ['runes'], 'bone_ring', [['stone_chunk', 2], ['hide', 1]], null],
  ['iron_ring', '000312.json', 'резьба_по_камню', 3, [40, 48],
   ['runes'], 'iron_ring', [['iron_ore', 2], ['coal', 1]], null],
  ['thread_ring', '000313.json', 'резьба_по_камню', 4, [40, 48],
   ['runes'], 'thread_ring', [['hide', 2], ['coal', 1]], null],
  ['stone_ring', '000314.json', 'резьба_по_камню', 4, [40, 48],
   ['runes'], 'stone_ring', [['stone_chunk', 3], ['coal', 1]], null],
  ['clay_ring', '000315.json', 'резьба_по_камню', 5, [40, 48],
   ['runes'], 'clay_ring', [['stone_chunk', 2], ['coal', 1]], null],
  ['wood_ring', '000316.json', 'резьба_по_камню', 5, [40, 48],
   ['runes'], 'wood_ring', [['wood_log', 2], ['stone_chunk', 1]], null],
  ['leather_ring', '000317.json', 'резьба_по_камню', 6, [40, 48],
   ['runes'], 'leather_ring', [['hide', 2], ['coal', 1]], null],
  ['silver_ring', '000318.json', 'резьба_по_камню', 8, [40, 48],
   ['runes'], 'silver_ring', [['silver_ore', 2], ['coal', 1]], null],
  ['silver_signet', '000319.json', 'зачарование', 9, [18],
   ['runes', 'orator'], 'silver_signet',
   [['silver_ore', 1], ['moonstone', 1], ['coal', 1]], ['flame_burst']],
  ['gold_ring', '000320.json', 'резьба_по_камню', 12, [40, 48],
   ['runes'], 'gold_ring', [['gold_ore', 2], ['coal', 1]], null],
  ['glacier_ring', '000321.json', 'резьба_по_камню', 14, [40, 48],
   ['runes'], 'glacier_ring',
   [['moonstone', 1], ['silver_ore', 1], ['coal', 1]], null],
  ['quartz_ring', '000322.json', 'резьба_по_камню', 16, [40, 48],
   ['runes'], 'quartz_ring',
   [['quartz', 1], ['silver_ore', 1], ['coal', 1]], null],
  ['obsidian_ring', '000323.json', 'резьба_по_камню', 18, [40, 48],
   ['runes'], 'obsidian_ring',
   [['obsidian', 1], ['silver_ore', 1], ['coal', 1]], null],
  ['amethyst_ring', '000324.json', 'зачарование', 20, [18],
   ['runes', 'meditation'], 'amethyst_ring',
   [['amethyst', 1], ['silver_ore', 1], ['coal', 1]], ['ward']],
  ['sapphire_ring', '000325.json', 'резьба_по_камню', 22, [40, 48],
   ['runes'], 'sapphire_ring',
   [['sapphire', 1], ['silver_ore', 2], ['coal', 2]], null],
  ['gold_signet', '000326.json', 'резьба_по_камню', 25, [40, 48],
   ['runes'], 'gold_signet', [['gold_ore', 2], ['coal', 1]], null],
  ['emerald_signet', '000327.json', 'зачарование', 35, [18],
   ['runes', 'nature'], 'emerald_signet',
   [['emerald', 1], ['gold_ore', 2], ['coal', 2]], ['vine']],
  ['ruby_ring', '000328.json', 'зачарование', 40, [18],
   ['runes', 'firelord'], 'ruby_ring',
   [['ruby', 1], ['gold_ore', 2], ['coal', 2]], ['fireball']],
  ['frost_ring', '000329.json', 'зачарование', 45, [18],
   ['runes', 'icelord'], 'frost_ring',
   [['sapphire', 1], ['gold_ore', 2], ['coal', 2]], ['ice_armor']],
  ['rune_ring', '000330.json', 'зачарование', 50, [18],
   ['runes', 'runes'], 'rune_ring',
   [['sapphire', 1], ['gold_ore', 2], ['coal', 2]], ['magic_shield']],
  ['scholar_ring', '000331.json', 'зачарование', 55, [18],
   ['runes', 'scholar'], 'scholar_ring',
   [['amethyst', 1], ['gold_ore', 2], ['coal', 2]], ['light_heal']],
  ['star_signet', '000332.json', 'зачарование', 70, [18],
   ['runes', 'precog'], 'star_signet',
   [['sapphire', 2], ['gold_ore', 2], ['coal', 2]], ['blizzard']],
  ['void_ring', '000333.json', 'зачарование', 80, [18],
   ['runes', 'unkill'], 'void_ring',
   [['obsidian', 2], ['gold_ore', 2], ['coal', 2]], ['void_horror']],
  ['phoenix_ring', '000334.json', 'зачарование', 95, [18],
   ['runes', 'firelord'], 'phoenix_ring',
   [['gold_ore', 4], ['diamond', 2], ['phoenix_feather', 2],
    ['coal', 3]], ['phoenix']],
];

test('000230.14 T9: 25 базовых рецептов (000310–000334, каталожный порядок; ростер §2.4: id/файл/тип/уровень/здания/навыки/результат/исходники/заклинания; 15 резьба_по_камню [40,48] + 10 зачарование [18], навыки = runes + файл 1-го skill-аффикса (000330 — вырожденный [runes, runes])); «уровень» ∈ RARITY_LEVEL_RANGE_00023008 по редкости РЕЗУЛЬТАТА (пин); зачарование ⇒ ≥1 заклинание (≤4); у free_cast-колец заклинание = САМО free_cast (frost → ice_armor, rune → magic_shield); каждое из 25 колец — ровно 1 базовый рецепт-результат (краснота: файлов 000310–000334 нет)', () => {
  const { byId } = loadCatalog();
  for (const [id, file, type, level, buildings, skills, resultId,
      inputs, spells] of RING_RECIPES_00023014) {
    const r = byId.get(id);
    assert.ok(r, 'рецепт «' + id + '» (' + file + ') в каталоге '
      + '(краснота: рецепт волны не создан)');
    assert.equal(r.file, file, id + ': файл ' + file
      + ' (контракт §2.4, каталожный порядок)');
    assert.equal(r.data['тип'], type, id + ': тип «' + type + '»');
    assert.equal(r.data['уровень'], level, id + ': уровень ' + level);
    assert.deepEqual(
      r.data['здания'].map((b) => refId(b, REF_BUILDINGS, r.file)),
      buildings, id + ': здания (resolved id)');
    assert.deepEqual(
      r.data['навыки'].map((s) => refId(s, REF_SKILLS, r.file)),
      skills, id + ': навыки (resolved id: runes + файл 1-го '
      + 'skill-аффикса)');
    const resId = refId(r.data['результат']['предмет'], REF_ITEMS,
      r.file);
    assert.equal(resId, resultId,
      id + ': результат — кольцо «' + resultId + '»');
    assert.equal(r.data['результат']['количество'], 1,
      id + ': результат ×1');
    assert.deepEqual(
      r.data['исходники'].map((i) =>
        [refId(i['предмет'], REF_ITEMS, r.file), i['количество']]),
      inputs, id + ': исходники (resolved id, порядок контракта)');
    if (spells === null) {
      assert.equal(r.data['заклинания'], undefined,
        id + ': «заклинания» отсутствуют (резьба)');
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
      assert.ok(r.data['заклинания'].length <= 4,
        id + ': «зачарование» — заклинания ≤ 4 (maxItems schema)');
    }
  }
  const basicResults = [];
  for (const { file, data } of byId.values()) {
    if (data['база'] !== undefined) continue;
    basicResults.push(
      refId(data['результат']['предмет'], REF_ITEMS, file));
  }
  for (const row of RING_RECIPES_00023014) {
    const n = basicResults.filter((x) => x === row[6]).length;
    assert.equal(n, 1,
      'кольцо «' + row[6] + '» — ровно 1 базовый рецепт-результат '
      + '(факт: ' + n + ')');
  }
});

// [id, файл, «база» (id), уровень, t4-материал (tier 4, 000157.04)]
// 3 улучшенных — 2 legendary + 1 impossible (паттерн .10 single-part;
// «база» = self-ref на базовый рецепт, результат НЕ меняется).
const RING_IMPROVED_00023014 = [
  ['star_signet_mithril', '000335.json', 'star_signet', 85,
   'mithril_ore'],
  ['void_ring_diamond', '000336.json', 'void_ring', 88, 'diamond'],
  ['phoenix_ring_mithril', '000337.json', 'phoenix_ring', 100,
   'mithril_ore'],
];

test('000230.14 T10: 3 улучшенных (000335–000337) — «база» = star_signet/void_ring/phoenix_ring (self-ref на базовые 000332/000333/000334), тот же тип/результат (кольцо, id НЕ меняется), уровень ≥ базы (85/88/100), исходники ⊇ базовых (по qty) + t4 (mithril_ore×1 / diamond×1 / mithril_ore×1, tier 4), цепочка «база» ациклична (краснота: файлов 000335–000337 нет)', () => {
  const { byId } = loadCatalog();
  for (const [id, file, baseId, level, t4] of RING_IMPROVED_00023014) {
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
      id + ': тот же предмет-результат, что у базы (id кольца '
      + 'НЕ меняется)');
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
    const seen = new Set();
    let cur = r;
    let curFile = r.file;
    let guard = 0;
    while (cur && cur.data['база'] !== undefined) {
      assert.ok(++guard <= byId.size, id + ': цикл в цепочке «база»');
      assert.ok(!seen.has(cur.data.id), id + ': цикл на «'
        + cur.data.id + '»');
      seen.add(cur.data.id);
      cur = byId.get(refId(cur.data['база'], REF_CRAFT, curFile));
      curFile = cur.file;
    }
  }
});

// =====================================================================
// Задача 000230.12 — рецепты на предметы «Правая рука»: 28 (25
// базовых + 3 improved), каталожный порядок 000210–000237 (D-01/D-13).
// Контракт — memory/000230.12-right-hand-items-wave.md §2.4 + D-13
// (типы/уровни/здания/навыки/спеллы фиксированы; материалы — ТОЧНЫЙ
// ростер закреплён красным тестом R12 ниже, границы-палитры §2.4).
// RED (TDD): в assets/craft 199 файла (000001–000199), рецептов с
// right-hand-результатами нет — тесты падают по ОСМЫСЛЕННОЙ причине
// «рецепты волны не созданы» (нет id/файлов), а не по синтаксису.
// =====================================================================

// [id, файл, тип, уровень, здания (resolved id), навыки (resolved id),
//  результат (id), исходники [[id, qty]], заклинания (null — поле нет)]
const RIGHT_HAND_RECIPES_00023012 = [
  ['wood_scyte', '000210.json', 'кузнечное_дело', 3, [8], ['forge'],
   'wood_scyte', [['wood_log', 2], ['coal', 1]], null],
  ['iron_scyte', '000211.json', 'кузнечное_дело', 4, [8], ['forge'],
   'iron_scyte', [['iron_ore', 2], ['coal', 1]], null],
  ['wood_pitchfork', '000212.json', 'кузнечное_дело', 3, [8], ['forge'],
   'wood_pitchfork', [['wood_log', 2], ['stone_chunk', 1]], null],
  ['iron_pitchfork', '000213.json', 'кузнечное_дело', 4, [8], ['forge'],
   'iron_pitchfork', [['iron_ore', 2], ['stone_chunk', 1]], null],
  ['copper_scyte', '000214.json', 'кузнечное_дело', 6, [8], ['forge'],
   'copper_scyte', [['copper_ore', 2], ['coal', 2]], null],
  ['iron_hammer', '000215.json', 'кузнечное_дело', 2, [8], ['forge'],
   'iron_hammer', [['iron_ore', 1], ['coal', 1]], null],
  ['iron_tongs', '000216.json', 'кузнечное_дело', 3, [8], ['forge'],
   'iron_tongs', [['iron_ore', 1], ['stone_chunk', 2]], null],
  ['clay_crucible', '000217.json', 'алхимия', 2, [17], ['alchemy'],
   'clay_crucible', [['stone_chunk', 2], ['coal', 1]], null],
  ['stone_mortar', '000218.json', 'алхимия', 3, [17], ['alchemy'],
   'stone_mortar', [['stone_chunk', 3], ['coal', 1]], null],
  ['bone_graver', '000219.json', 'зачарование', 5, [18], ['runes'],
   'bone_graver', [['quartz', 1], ['stone_chunk', 1]], ['spark']],
  ['steel_scyte', '000220.json', 'кузнечное_дело', 15, [8, 25], ['forge'],
   'steel_scyte', [['iron_ore', 3], ['silver_ore', 1], ['coal', 2]],
   null],
  ['steel_pitchfork', '000221.json', 'кузнечное_дело', 16, [8, 25], ['forge'],
   'steel_pitchfork', [['iron_ore', 3], ['amethyst', 1], ['coal', 2]],
   null],
  ['ember_staff', '000222.json', 'зачарование', 18, [18], ['runes', 'firelord'],
   'ember_staff', [['quartz', 1], ['amethyst', 1], ['coal', 2]],
   ['flame_burst']],
  ['rime_staff', '000223.json', 'зачарование', 20, [18], ['runes', 'icelord'],
   'rime_staff', [['quartz', 2], ['silver_ore', 1], ['coal', 2]],
   ['chill']],
  ['rune_staff', '000224.json', 'зачарование', 24, [18], ['runes'],
   'rune_staff', [['amethyst', 2], ['silver_ore', 1], ['coal', 2]],
   ['ward']],
  ['steel_hammer', '000225.json', 'кузнечное_дело', 14, [8, 25], ['forge'],
   'steel_hammer', [['iron_ore', 3], ['silver_ore', 1], ['coal', 2]],
   null],
  ['rune_stylus', '000226.json', 'зачарование', 16, [18], ['runes'],
   'rune_stylus', [['quartz', 2], ['amethyst', 1], ['coal', 1]],
   ['ward']],
  ['harvest_scyte', '000227.json', 'кузнечное_дело', 40, [8, 25],
   ['forge', 'heavy'], 'harvest_scyte',
   [['gold_ore', 2], ['silver_ore', 3], ['coal', 2]], null],
  ['flame_staff', '000228.json', 'зачарование', 45, [18], ['runes', 'firelord'],
   'flame_staff',
   [['ruby', 1], ['gold_ore', 1], ['silver_ore', 3], ['coal', 2]],
   ['fireball']],
  ['ice_staff', '000229.json', 'зачарование', 48, [18], ['runes', 'icelord'],
   'ice_staff',
   [['sapphire', 1], ['gold_ore', 1], ['silver_ore', 3], ['coal', 2]],
   ['frost_bolt']],
  ['silver_crucible', '000230.json', 'алхимия', 38, [17], ['alchemy'],
   'silver_crucible', [['silver_ore', 3], ['gold_ore', 1], ['coal', 2]],
   null],
  ['rune_chisel', '000231.json', 'зачарование', 42, [18], ['runes'],
   'rune_chisel', [['sapphire', 1], ['gold_ore', 1], ['silver_ore', 3]],
   ['magic_shield']],
  ['sage_staff', '000232.json', 'зачарование', 70, [18], ['runes', 'scholar'],
   'sage_staff', [['mithril_ore', 1], ['sapphire', 2], ['gold_ore', 2]],
   ['greater_heal']],
  ['mithril_hammer', '000233.json', 'кузнечное_дело', 75, [8, 25],
   ['forge', 'heavy'], 'mithril_hammer',
   [['mithril_ore', 2], ['gold_ore', 2], ['sapphire', 1]], null],
  ['philosopher_staff', '000234.json', 'зачарование', 95, [18],
   ['runes', 'alchemy'], 'philosopher_staff',
   [['gold_ore', 3], ['ruby', 2], ['diamond', 1], ['coal', 3]],
   ['mend']],
];

// [id, файл, «база» (id), уровень, t4-материал (tier 4, 000157.04),
//  исходники (ТОЧНО: ⊇ базовых по qty + t4-материал)]
const RIGHT_HAND_IMPROVED_00023012 = [
  ['sage_staff_mithril', '000235.json', 'sage_staff', 85, 'mithril_ore',
   [['mithril_ore', 2], ['sapphire', 2], ['gold_ore', 2]]],
  ['mithril_hammer_diamond', '000236.json', 'mithril_hammer', 88,
   'diamond',
   [['mithril_ore', 2], ['gold_ore', 2], ['sapphire', 1], ['diamond', 1]]],
  ['philosopher_staff_mithril', '000237.json', 'philosopher_staff', 100,
   'mithril_ore',
   [['gold_ore', 3], ['ruby', 2], ['diamond', 1], ['coal', 3],
    ['mithril_ore', 1]]],
];

test('000230.12 R12: 28 рецептов (199 → 227): 25 базовых (ростер D-13: id/файл/тип/уровень/здания/навыки/результат/исходники/заклинания; 12 кузнечное_дело + 3 алхимия + 10 зачарование) + 3 improved (000235–000237: «база»-ссылка на базовый файл, тот же тип/результат, уровень 85/88/100 ≥ базового, здания/навыки = базовые, исходники ТОЧНО (⊇ базы по qty) + t4-материал tier 4, цепочка «база» ациклична); «уровень» в диапазоне редкости РЕЗУЛЬТАТА (пин, ВСЕ 28 рецептов); зачарование — ≥1 заклинание ID-формы (инвариант 000191.14); каждый из 25 right-hand-предметов — ровно 1 базовый рецепт-результат (краснота: рецептов волны нет)', () => {
  const { byId } = loadCatalog();
  for (const [id, file, type, level, buildings, skills, resultId,
      inputs, spells] of RIGHT_HAND_RECIPES_00023012) {
    const r = byId.get(id);
    assert.ok(r, 'рецепт «' + id + '» (' + file + ') в каталоге '
      + '(краснота: рецепт волны не создан)');
    assert.equal(r.file, file, id + ': файл ' + file
      + ' (контракт D-01, переименований нет)');
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
      id + ': результат — right-hand-предмет «' + resultId + '»');
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
      assert.ok(r.data['заклинания'].length <= 4,
        id + ': «зачарование» — заклинания ≤ 4 (maxItems schema)');
    }
  }
  // Каждый right-hand-предмет — ровно 1 базовый (БЕЗ «база»)
  // рецепт-результат: улучшенные дают тот же предмет, их не считаем.
  const basicResults = [];
  for (const { file, data } of byId.values()) {
    if (data['база'] !== undefined) continue;
    basicResults.push(
      refId(data['результат']['предмет'], REF_ITEMS, file));
  }
  for (const row of RIGHT_HAND_RECIPES_00023012) {
    const n = basicResults.filter((x) => x === row[6]).length;
    assert.equal(n, 1,
      'right-hand-предмет «' + row[6] + '» — ровно 1 базовый '
      + 'рецепт-результат (факт: ' + n + ')');
  }
  // 3 improved (паттерн .10 T12 + точный исходников-ростер +
  // здания/навыки = базовые: счётчики 000208-R2 (R13 ниже)).
  for (const [id, file, baseId, level, t4, inputs]
      of RIGHT_HAND_IMPROVED_00023012) {
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
    assert.deepEqual(
      c['здания'].map((x) => refId(x, REF_BUILDINGS, r.file)),
      b['здания'].map((x) => refId(x, REF_BUILDINGS, base.file)),
      id + ': здания — как у базы (счётчик 000208-R2)');
    assert.deepEqual(
      c['навыки'].map((x) => refId(x, REF_SKILLS, r.file)),
      b['навыки'].map((x) => refId(x, REF_SKILLS, base.file)),
      id + ': навыки — как у базы (счётчик 000208-R2)');
    assert.deepEqual(
      c['исходники'].map((i) =>
        [refId(i['предмет'], REF_ITEMS, r.file), i['количество']]),
      inputs, id + ': исходники (ТОЧНО: ⊇ базовых + t4-материал)');
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

test('000230.12 R13: ре-пин 000208-R2 — каталог 339 рецепт (199 + 28 волны + 28 left_hand (000230.13) + 28 колец (000230.14) + 56 legs/feet (000230.15)), ВСЕ ссылки резолвятся; анти-вакуум счётчики: item-ссылки 730 → 838 (+108 = 28 результат + 80 исходников) → 940 (+102, 000230.13) → 1046 (+106, 000230.14) → 1245 (+199, 000230.15), skill-ссылки 273 → 312 (+39) → 356 (+44, 000230.13) → 397 (+41, 000230.14) → 471 (+74, 000230.15), building-ссылки 286 → 320 (+34) → 350 (+30, 000230.13) → 393 (+43, 000230.14) → 467 (+74, 000230.15) → 469 (+2, 000250) — точные дельты зафиксированы ростером R12 (у improved здания/навыки = базовые) (краснота: рецептов волны нет — счётчики до-волновые)', () => {
  const { byId } = loadCatalog();
  const knownSkill = (id) =>
    SECONDARY_SKILLS[id] !== undefined ||
    PRIMARY_SKILLS.some((p) => p.id === id);
  assert.equal(byId.size, 339,
    'каталог — 339 рецепт (199 + 28 волны + 28 left_hand (000230.13) + 28 колец (000230.14) + 56 legs/feet (000230.15)); факт: ' + byId.size);
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
  assert.equal(itemRefs, 1245,
    'анти-вакуум: 1245 item-ссылки (730 + 28 результатов + 80 '
    + 'исходников; ре-пин 000230.12: +108; ре-пин 000230.13: +102; '
    + 'ре-пин 000230.14: +106; ре-пин 000230.15: +199); факт: ' + itemRefs);
  assert.equal(skillRefs, 471,
    'анти-вакуум: 471 skill-ссылки (273 + 39; ре-пин 000230.12: +39; '
    + 'ре-пин 000230.13: +44; ре-пин 000230.14: +41; '
    + 'ре-пин 000230.15: +74); факт: ' + skillRefs);
  assert.equal(buildingRefs, 469,
    'анти-вакуум: 469 building-ссылки (286 + 34; ре-пин 000230.12: '
    + '+34; ре-пин 000230.13: +30; ре-пин 000230.14: +43; '
    + 'ре-пин 000230.15: +74; ре-пин 000250: +2 (кожаные брони → '
    + '[8, 25])); факт: ' + buildingRefs);
});

// =====================================================================
// Задача 000230.15 — рецепты на предметы «Ноги» + «Ступни»: 50
// базовых + 6 улучшенных (контентная волна серии 000230; P2;
// follow-up 000230). Контракт —
// memory/000230.15-legs-feet-items-wave.md §2.4 (id/файлы 000360–
// 000415; 20 × столярное_дело [5] skills [dexterity] ВСЕ common;
// 17 × кузнечное_дело [8, 25] skills [forge]; 13 × зачарование [18]
// skills [runes + skill ПЕРВОГО affix] + ≥1 заклинание ID-формы;
// 6 × improved (5 зачарование + 1 кузнечное) +t4, «база» = self-ref,
// материалы ⊇ базовых). RED (TDD): в assets/craft 143 файла
// (000001–000143), рецептов с legs/feet-результатами нет — тесты
// падают по ОСМЫСЛЕННОЙ причине «рецепты волны не созданы» (нет
// id/файлов), а не по синтаксису.
// =====================================================================

// [id, файл, тип, уровень, здания (resolved id), навыки (resolved id),
//  результат (id), исходники [[id, qty]], заклинания (null — поле нет)]
const LEGSFEET_RECIPES_00023015 = [
  ['linen_trousers', '000360.json', 'столярное_дело', 2, [5],
   ['dexterity'], 'linen_trousers', [['wood_log', 2], ['herb_bitter', 1]],
   null],
  ['wool_trousers', '000361.json', 'столярное_дело', 3, [5],
   ['dexterity'], 'wool_trousers', [['hide', 1], ['wood_log', 2]], null],
  ['hemp_breeches', '000362.json', 'столярное_дело', 4, [5],
   ['dexterity'], 'hemp_breeches', [['wood_log', 2], ['stone_chunk', 1]],
   null],
  ['felt_trousers', '000363.json', 'столярное_дело', 5, [5],
   ['dexterity'], 'felt_trousers', [['hide', 2], ['coal', 1]], null],
  ['leather_pants', '000364.json', 'столярное_дело', 6, [5],
   ['dexterity'], 'leather_pants', [['hide', 2], ['coal', 1]], null],
  ['traveler_breeches', '000365.json', 'столярное_дело', 7, [5],
   ['dexterity'], 'traveler_breeches', [['wood_log', 2], ['hide', 1]],
   null],
  ['hide_wrap', '000366.json', 'столярное_дело', 4, [5],
   ['dexterity'], 'hide_wrap', [['hide', 2], ['coal', 1]], null],
  ['twine_wraps', '000367.json', 'столярное_дело', 5, [5],
   ['dexterity'], 'twine_wraps', [['wood_log', 2], ['hide', 1]], null],
  ['rough_chaps', '000368.json', 'столярное_дело', 8, [5],
   ['dexterity'], 'rough_chaps', [['hide', 2], ['stone_chunk', 1]],
   null],
  ['cloth_loincloth', '000369.json', 'столярное_дело', 3, [5],
   ['dexterity'], 'cloth_loincloth', [['wood_log', 2], ['herb_bitter', 1]],
   null],
  ['bone_greaves', '000370.json', 'кузнечное_дело', 12, [8, 25],
   ['forge'], 'bone_greaves', [['stone_chunk', 2], ['coal', 1]], null],
  ['copper_greaves', '000371.json', 'кузнечное_дело', 14, [8, 25],
   ['forge'], 'copper_greaves', [['copper_ore', 2], ['coal', 1]], null],
  ['silver_chaps', '000372.json', 'кузнечное_дело', 16, [8, 25],
   ['forge'], 'silver_chaps', [['silver_ore', 2], ['coal', 1]], null],
  ['stone_greaves', '000373.json', 'кузнечное_дело', 13, [8, 25],
   ['forge'], 'stone_greaves', [['stone_chunk', 3], ['coal', 1]], null],
  ['obsidian_greaves', '000374.json', 'зачарование', 20, [18],
   ['runes', 'hide'], 'obsidian_greaves',
   [['obsidian', 1], ['wood_log', 1], ['coal', 1]], ['shadow_bolt']],
  ['amethyst_pants', '000375.json', 'зачарование', 22, [18],
   ['runes', 'breath'], 'amethyst_pants',
   [['amethyst', 1], ['wood_log', 1], ['coal', 1]], ['frost_bolt']],
  ['mystic_breeches', '000376.json', 'зачарование', 24, [18],
   ['runes', 'step'], 'mystic_breeches',
   [['amethyst', 1], ['herb_mana', 1], ['wood_log', 1]],
   ['nature_blessing']],
  ['sapphire_leggings', '000377.json', 'кузнечное_дело', 35, [8, 25],
   ['forge'], 'sapphire_leggings',
   [['sapphire', 1], ['silver_ore', 2], ['coal', 2]], null],
  ['ember_pants', '000378.json', 'зачарование', 38, [18],
   ['runes', 'step'], 'ember_pants',
   [['root_ember', 2], ['wood_log', 2], ['coal', 2]], ['blazing_speed']],
  ['emerald_greaves', '000379.json', 'кузнечное_дело', 40, [8, 25],
   ['forge'], 'emerald_greaves',
   [['emerald', 1], ['silver_ore', 1], ['coal', 2]], null],
  ['gold_leggings', '000380.json', 'кузнечное_дело', 45, [8, 25],
   ['forge'], 'gold_leggings', [['gold_ore', 2], ['coal', 2]], null],
  ['mithril_greaves', '000381.json', 'кузнечное_дело', 50, [8, 25],
   ['forge'], 'mithril_greaves', [['mithril_ore', 2], ['coal', 2]], null],
  ['rune_greaves', '000382.json', 'зачарование', 65, [18],
   ['runes', 'hide'], 'rune_greaves',
   [['sapphire', 1], ['gold_ore', 2], ['coal', 2]], ['stone_skin']],
  ['storm_leggings', '000383.json', 'зачарование', 70, [18],
   ['runes', 'step'], 'storm_leggings',
   [['sapphire', 2], ['gold_ore', 2], ['coal', 2]], ['blizzard']],
  ['titan_greaves', '000384.json', 'кузнечное_дело', 95, [8, 25],
   ['forge'], 'titan_greaves',
   [['gold_ore', 3], ['mithril_ore', 2], ['diamond', 2], ['coal', 3]],
   null],
  ['straw_sandals', '000385.json', 'столярное_дело', 2, [5],
   ['dexterity'], 'straw_sandals', [['wood_log', 2], ['herb_bitter', 1]],
   null],
  ['cloth_sandals', '000386.json', 'столярное_дело', 3, [5],
   ['dexterity'], 'cloth_sandals', [['wood_log', 2], ['stone_chunk', 1]],
   null],
  ['leather_sandals', '000387.json', 'столярное_дело', 4, [5],
   ['dexterity'], 'leather_sandals', [['hide', 2], ['coal', 1]], null],
  ['wool_boots', '000388.json', 'столярное_дело', 5, [5],
   ['dexterity'], 'wool_boots', [['hide', 1], ['wood_log', 2]], null],
  ['felt_boots', '000389.json', 'столярное_дело', 6, [5],
   ['dexterity'], 'felt_boots', [['hide', 2], ['coal', 1]], null],
  ['leather_boots', '000390.json', 'столярное_дело', 7, [5],
   ['dexterity'], 'leather_boots', [['hide', 2], ['stone_chunk', 1]],
   null],
  ['travel_boots', '000391.json', 'столярное_дело', 8, [5],
   ['dexterity'], 'travel_boots', [['wood_log', 2], ['hide', 1]], null],
  ['hide_boots', '000392.json', 'столярное_дело', 5, [5],
   ['dexterity'], 'hide_boots', [['hide', 2], ['coal', 1]], null],
  ['wooden_sandals', '000393.json', 'столярное_дело', 3, [5],
   ['dexterity'], 'wooden_sandals', [['wood_log', 3]], null],
  ['hemp_sandals', '000394.json', 'столярное_дело', 4, [5],
   ['dexterity'], 'hemp_sandals', [['wood_log', 2], ['herb_bitter', 1]],
   null],
  ['bone_sandals', '000395.json', 'кузнечное_дело', 12, [8, 25],
   ['forge'], 'bone_sandals', [['stone_chunk', 2], ['coal', 1]], null],
  ['copper_boots', '000396.json', 'кузнечное_дело', 14, [8, 25],
   ['forge'], 'copper_boots', [['copper_ore', 2], ['coal', 1]], null],
  ['silver_boots', '000397.json', 'кузнечное_дело', 16, [8, 25],
   ['forge'], 'silver_boots', [['silver_ore', 2], ['coal', 1]], null],
  ['stone_sandals', '000398.json', 'кузнечное_дело', 13, [8, 25],
   ['forge'], 'stone_sandals', [['stone_chunk', 3], ['coal', 1]], null],
  ['obsidian_sandals', '000399.json', 'зачарование', 20, [18],
   ['runes', 'breath'], 'obsidian_sandals',
   [['obsidian', 1], ['hide', 1], ['coal', 1]], ['chill']],
  ['amethyst_boots', '000400.json', 'зачарование', 22, [18],
   ['runes', 'endurance'], 'amethyst_boots',
   [['amethyst', 1], ['hide', 1], ['coal', 1]], ['frost_bolt']],
  ['mystic_sandals', '000401.json', 'зачарование', 24, [18],
   ['runes', 'step'], 'mystic_sandals',
   [['amethyst', 1], ['herb_mana', 1], ['hide', 1]], ['spark']],
  ['sapphire_boots', '000402.json', 'кузнечное_дело', 35, [8, 25],
   ['forge'], 'sapphire_boots',
   [['sapphire', 1], ['silver_ore', 2], ['coal', 2]], null],
  ['frost_sandals', '000403.json', 'зачарование', 42, [18],
   ['runes', 'step'], 'frost_sandals',
   [['root_moon', 2], ['hide', 2], ['coal', 2]], ['winter_haste']],
  ['emerald_boots', '000404.json', 'кузнечное_дело', 40, [8, 25],
   ['forge'], 'emerald_boots',
   [['emerald', 1], ['silver_ore', 1], ['coal', 2]], null],
  ['gold_sandals', '000405.json', 'кузнечное_дело', 45, [8, 25],
   ['forge'], 'gold_sandals', [['gold_ore', 2], ['coal', 2]], null],
  ['mithril_boots', '000406.json', 'кузнечное_дело', 50, [8, 25],
   ['forge'], 'mithril_boots', [['mithril_ore', 2], ['coal', 2]], null],
  ['storm_sandals', '000407.json', 'зачарование', 70, [18],
   ['runes', 'step'], 'storm_sandals',
   [['sapphire', 2], ['gold_ore', 2], ['coal', 2]], ['blizzard']],
  ['rune_boots', '000408.json', 'зачарование', 65, [18],
   ['runes', 'hide'], 'rune_boots',
   [['sapphire', 1], ['gold_ore', 2], ['coal', 2]], ['magic_shield']],
  ['swift_boots', '000409.json', 'зачарование', 97, [18],
   ['runes', 'step'], 'swift_boots',
   [['phoenix_feather', 2], ['gold_ore', 3], ['diamond', 1], ['coal', 3]],
   ['blazing_speed']],
];

test('000230.15 LF9: 50 базовых рецептов (ростер §2.4: id/файл/тип/уровень/здания/навыки/результат/исходники/заклинания; 20 столярное_дело [5] ВСЕ common-результаты + 17 кузнечное_дело [8,25] + 13 зачарование [18]); «уровень» в диапазоне редкости РЕЗУЛЬТАТА (пин); зачарование — ≥1 заклинание ID-формы (≤4); каждый из 50 legs/feet-предметов — ровно 1 базовый рецепт-результат (краснота: рецептов на legs/feet нет)', () => {
  const { byId } = loadCatalog();
  const typeCount = {};
  for (const [id, file, type, level, buildings, skills, resultId,
      inputs, spells] of LEGSFEET_RECIPES_00023015) {
    const r = byId.get(id);
    assert.ok(r, 'рецепт «' + id + '» (' + file + ') в каталоге '
      + '(краснота: рецепт волны не создан)');
    assert.equal(r.file, file, id + ': файл ' + file
      + ' (контракт §2.4, переименований нет)');
    assert.equal(r.data['тип'], type, id + ': тип «' + type + '»');
    typeCount[type] = (typeCount[type] || 0) + 1;
    assert.equal(r.data['уровень'], level, id + ': уровень ' + level);
    assert.deepEqual(
      r.data['здания'].map((b) => refId(b, REF_BUILDINGS, r.file)),
      buildings, id + ': здания (resolved id)');
    assert.deepEqual(
      r.data['навыки'].map((s) => refId(s, REF_SKILLS, r.file)),
      skills, id + ': навыки (resolved id)');
    const resId = refId(r.data['результат']['предмет'], REF_ITEMS, r.file);
    assert.equal(resId, resultId,
      id + ': результат — legs/feet-предмет «' + resultId + '»');
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
    if (type === 'столярное_дело') {
      assert.equal(it.rarity, 'common',
        id + ': столярное — ТОЛЬКО common-результаты (§2.4, D-05)');
    }
    const [lo, hi] = RARITY_LEVEL_RANGE_00023008[it.rarity];
    assert.ok(r.data['уровень'] >= lo && r.data['уровень'] <= hi,
      id + ': уровень ' + r.data['уровень'] + ' в диапазоне редкости '
      + it.rarity + ' [' + lo + '–' + hi + '] (пин ТЗ)');
    if (type === 'зачарование') {
      assert.ok(Array.isArray(r.data['заклинания'])
          && r.data['заклинания'].length >= 1,
        id + ': «зачарование» — ≥1 заклинание (инвариант 000191.14)');
      assert.ok(r.data['заклинания'].length <= 4,
        id + ': «зачарование» — заклинания ≤ 4 (maxItems schema)');
    }
  }
  assert.deepEqual(
    { 'столярное_дело': typeCount['столярное_дело'] || 0,
      'кузнечное_дело': typeCount['кузнечное_дело'] || 0,
      'зачарование': typeCount['зачарование'] || 0 },
    { 'столярное_дело': 20, 'кузнечное_дело': 17, 'зачарование': 13 },
    'сплит типов 20/17/13 (§2.4, D-05); факт: '
    + JSON.stringify(typeCount));
  const basicResults = [];
  for (const { file, data } of byId.values()) {
    if (data['база'] !== undefined) continue;
    basicResults.push(
      refId(data['результат']['предмет'], REF_ITEMS, file));
  }
  for (const row of LEGSFEET_RECIPES_00023015) {
    const n = basicResults.filter((x) => x === row[6]).length;
    assert.equal(n, 1,
      'legs/feet-предмет «' + row[6] + '» — ровно 1 базовый '
      + 'рецепт-результат (факт: ' + n + ')');
  }
});

// [id, файл, «база» (id), уровень, t4-материал (tier 4, 000157.04)]
// 6 улучшенных — 5 зачарование + 1 кузнечное (titan_greaves_diamond).
const LEGSFEET_IMPROVED_00023015 = [
  ['rune_greaves_mithril', '000410.json', 'rune_greaves', 80,
   'mithril_ore'],
  ['storm_leggings_diamond', '000411.json', 'storm_leggings', 85,
   'diamond'],
  ['titan_greaves_diamond', '000412.json', 'titan_greaves', 100,
   'diamond'],
  ['rune_boots_mithril', '000413.json', 'rune_boots', 80,
   'mithril_ore'],
  ['storm_sandals_diamond', '000414.json', 'storm_sandals', 85,
   'diamond'],
  ['swift_boots_diamond', '000415.json', 'swift_boots', 100,
   'diamond'],
];

test('000230.15 LF10: 6 улучшенных (000410–000415) — «база» = rune_greaves/storm_leggings/titan_greaves/rune_boots/storm_sandals/swift_boots (000382/000383/000384/000408/000407/000409), тот же тип/результат, уровень ровно 80/85/100/80/85/100 (не ниже базового), исходники ⊇ базовых (по qty), цепочка «база» ациклична, +t4-руда/камень (tier 4) в исходниках (краснота: улучшенные рецепты не созданы)', () => {
  const { byId } = loadCatalog();
  for (const [id, file, baseId, level, t4] of LEGSFEET_IMPROVED_00023015) {
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

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

// Виды крафта (SPEC.md «Крафт» → «Виды крафта»).
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

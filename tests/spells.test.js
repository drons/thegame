// Каталог заклинаний (assets/spells) — задача 000023.
//
// Проверяем:
//  * нумерацию файлов 000001.json … N подряд, без чужих файлов;
//  * валидность каждого файла по assets/spells/schema.json (минимальный
//    валидатор, допустимые ключи — ALLOWED_SCHEMA_KEYS, задача 000015);
//  * правила каталога: уникальные id, «база null ⇔ степень 1»,
//    соответствие атрибута школе (SPEC.md «Заклинания» → «Школы магии»),
//    покрытие всех школ и всех уровней заклинаний (рангов);
//  * ссылочную целостность: «база» → заклинание каталога (одна школа,
//    степень = +1, уровень не ниже, без циклов), «предметы» →
//    assets/items (src/items.js), «здания» → assets/buildings
//    (src/buildings.js);
//  * ранги школы покрывают уровни 1..100 без разрывов (SPEC.md).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { getItem } = require('../src/items.js');
const { getBuilding } = require('../src/buildings.js');

const DIR = path.join(__dirname, '..', 'assets', 'spells');

// Допустимые ключи JSON-схем (задача 000015: минимальный валидатор).
const ALLOWED_SCHEMA_KEYS = new Set([
  'type', 'required', 'properties', 'additionalProperties', 'items',
  'enum', 'const', 'minimum', 'maximum', 'minItems', 'maxItems',
  'pattern', 'anyOf', 'oneOf',
]);

// Школа → атрибут (SPEC.md «Заклинания» → «Школы магии»).
const SCHOOL_ATTR = {
  'огонь': 'intelligence',
  'лёд': 'intelligence',
  'тень': 'intelligence',
  'исцеление': 'wisdom',
  'защита': 'wisdom',
  'природа': 'wisdom',
};

// Ранги школы (SPEC.md «Заклинания» → «Ранги в школе»):
// уровни основного навыка и открываемый уровень заклинаний.
const SCHOOL_RANKS = [
  { name: 'Ученик', min: 1, max: 10, tier: 1 },
  { name: 'Знаток', min: 11, max: 25, tier: 2 },
  { name: 'Мастер', min: 26, max: 50, tier: 3 },
  { name: 'Аркимаг', min: 51, max: 100, tier: 4 },
];

function listSpellFiles() {
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
    assert.match(f, /^\d{6}\.json$/, `чужой файл в каталоге заклинаний: ${f}`);
    const data = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
    assert.ok(!byId.has(data.id), `дубликат id заклинания "${data.id}" в ${f}`);
    byId.set(data.id, { file: f, data });
  }
  return { all, byId };
}

// --- Минимальный валидатор JSON-схем (ключи ALLOWED_SCHEMA_KEYS) ---

// Фактический тип значения: целое — 'integer', дробное — 'number'.
function actualType(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (typeof v === 'number') {
    return Number.isInteger(v) ? 'integer' : 'number';
  }
  return typeof v;
}

// Рекурсивная проверка значения по под-схеме; ошибки — в массив errors.
function validate(schema, value, where, errors) {
  if (schema.type) {
    let t = actualType(value);
    if (schema.type === 'number' && t === 'integer') t = 'number';
    if (t !== schema.type) {
      errors.push(`${where}: тип «${t}» вместо «${schema.type}»`);
      return;
    }
  }
  if (schema.const !== undefined && value !== schema.const) {
    errors.push(`${where}: значение вместо константы ${JSON.stringify(schema.const)}`);
  }
  if (schema.enum !== undefined && !schema.enum.includes(value)) {
    errors.push(`${where}: значение ${JSON.stringify(value)} вне enum`);
  }
  if (schema.pattern !== undefined && typeof value === 'string' &&
      !new RegExp(schema.pattern).test(value)) {
    errors.push(`${where}: строка не совпадает с ${schema.pattern}`);
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) {
      errors.push(`${where}: ${value} < minimum ${schema.minimum}`);
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      errors.push(`${where}: ${value} > maximum ${schema.maximum}`);
    }
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push(`${where}: элементов меньше minItems ${schema.minItems}`);
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      errors.push(`${where}: элементов больше maxItems ${schema.maxItems}`);
    }
    if (schema.items !== undefined) {
      value.forEach((v, i) => validate(schema.items, v, `${where}[${i}]`, errors));
    }
  } else if (value !== null && typeof value === 'object') {
    if (schema.required !== undefined) {
      for (const r of schema.required) {
        if (!(r in value)) {
          errors.push(`${where}: нет обязательного поля «${r}»`);
        }
      }
    }
    if (schema.properties !== undefined) {
      for (const [k, v] of Object.entries(value)) {
        if (k in schema.properties) {
          validate(schema.properties[k], v, `${where}.${k}`, errors);
        } else if (schema.additionalProperties === false) {
          errors.push(`${where}: лишнее поле «${k}»`);
        }
      }
    } else if (schema.additionalProperties === false) {
      for (const k of Object.keys(value)) {
        errors.push(`${where}: лишнее поле «${k}»`);
      }
    }
  }
  if (schema.anyOf !== undefined) {
    const ok = schema.anyOf.some((sub) => {
      const e = [];
      validate(sub, value, where, e);
      return e.length === 0;
    });
    if (!ok) errors.push(`${where}: не подходит ни один вариант anyOf`);
  }
  if (schema.oneOf !== undefined) {
    const matched = schema.oneOf.filter((sub) => {
      const e = [];
      validate(sub, value, where, e);
      return e.length === 0;
    });
    if (matched.length !== 1) {
      errors.push(`${where}: подошло вариантов oneOf: ${matched.length}, нужно 1`);
    }
  }
}

function loadSchema() {
  return JSON.parse(fs.readFileSync(path.join(DIR, 'schema.json'), 'utf8'));
}

// --- Нумерация ---

test('каталог: нумерация файлов 000001..N подряд', () => {
  const files = listSpellFiles();
  assert.ok(files.length >= 10, 'каталог подозрительно маленький');
  files.forEach((f, i) => {
    assert.equal(f, String(i + 1).padStart(6, '0') + '.json',
      `пробел в нумерации на позиции ${i + 1}: ${f}`);
  });
});

test('каталог: чужих файлов нет (только NNNNNN.json и schema.json)', () => {
  for (const f of fs.readdirSync(DIR).sort()) {
    assert.ok(/^\d{6}\.json$/.test(f) || f === 'schema.json',
      `чужой файл в каталоге заклинаний: ${f}`);
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
  const files = listSpellFiles();
  for (const f of files) {
    const data = JSON.parse(
      fs.readFileSync(path.join(DIR, f), 'utf8'));
    const errors = [];
    validate(schema, data, f, errors);
    assert.deepEqual(errors, [], `${f}: ${errors.join('; ')}`);
  }
});

// --- Правила каталога ---

test('правила: уникальные id, «база null ⇔ степень 1», атрибут школы', () => {
  const { byId } = loadCatalog();
  assert.ok(byId.size >= 10, 'каталог подозрительно маленький');
  const schools = new Set();
  const tiers = new Set();
  for (const { file, data } of byId.values()) {
    assert.match(data.id, /^[a-z][a-z0-9_]*$/, `${file}: id "${data.id}"`);
    assert.ok(SCHOOL_ATTR[data.школа],
      `${file}: неизвестная школа "${data.школа}"`);
    assert.equal(data.атрибут, SCHOOL_ATTR[data.школа],
      `${file}: атрибут "${data.атрибут}" не подходит школе "${data.школа}"`);
    if (data.база === null) {
      assert.equal(data.степень, 1,
        `${file}: базовое заклинание должно иметь степень 1`);
    } else {
      assert.ok(data.степень >= 2,
        `${file}: совершенствование должно иметь степень >= 2`);
    }
    schools.add(data.школа);
    tiers.add(data.уровень);
    // Связанные предметы и постройки — без дублей внутри списка.
    if (data.предметы) {
      assert.equal(new Set(data.предметы).size, data.предметы.length,
        `${file}: дубли в «предметы»`);
    }
    assert.equal(new Set(data.здания).size, data.здания.length,
      `${file}: дубли в «здания»`);
  }
  for (const s of Object.keys(SCHOOL_ATTR)) {
    assert.ok(schools.has(s), `нет ни одного заклинания школы "${s}"`);
  }
  for (const t of [1, 2, 3, 4]) {
    assert.ok(tiers.has(t), `нет заклинаний уровня ${t}`);
  }
});

// --- Ссылочная целостность ---

test('ссылки: «база» — заклинание каталога, цепочки без циклов', () => {
  const { byId } = loadCatalog();
  for (const { file, data } of byId.values()) {
    if (data.база === null) continue;
    const base = byId.get(data.база);
    assert.ok(base, `${file}: базовое заклинание "${data.база}" нет в каталоге`);
    assert.notEqual(data.база, data.id, `${file}: цикл «база» на самом себе`);
    assert.equal(base.data.школа, data.школа,
      `${file}: совершенствование другой школы, чем базовое`);
    assert.equal(data.степень, base.data.степень + 1,
      `${file}: степень ${data.степень} != степень базового (${base.data.степень}) + 1`);
    assert.ok(data.уровень >= base.data.уровень,
      `${file}: уровень ${data.уровень} ниже уровня базового (${base.data.уровень})`);
    assert.ok(data.мани >= base.data.мани,
      `${file}: мана ${data.мани} ниже маны базового (${base.data.мани})`);
    // Обход цепочки «база» завершается (циклов нет).
    const seen = new Set();
    let cur = data;
    let guard = 0;
    while (cur && cur.база !== null) {
      assert.ok(++guard <= byId.size, `${file}: цикл в цепочке совершенствований`);
      assert.ok(!seen.has(cur.id), `${file}: цикл на "${cur.id}"`);
      seen.add(cur.id);
      cur = byId.get(cur.база).data;
    }
  }
});

test('ссылки: «предметы» → assets/items, «здания» → assets/buildings', () => {
  const { byId } = loadCatalog();
  for (const { file, data } of byId.values()) {
    for (const it of (data.предметы || [])) {
      assert.ok(getItem(it) !== null,
        `${file}: предмет "${it}" нет в каталоге assets/items`);
    }
    for (const b of data.здания) {
      assert.ok(Number.isInteger(b) && b >= 1 && b <= 50,
        `${file}: постройка ${b} вне диапазона 1..50 каталога`);
      assert.ok(getBuilding(b) !== null,
        `${file}: здание id=${b} нет в каталоге assets/buildings`);
    }
  }
});

// --- Ранги школы (SPEC.md) ---

test('ранги: 4 ранга покрывают уровни 1..100 без разрывов', () => {
  assert.equal(SCHOOL_RANKS.length, 4, 'рангов школы должно быть 4');
  assert.equal(SCHOOL_RANKS[0].min, 1, 'первый ранг начинается с 1');
  for (let i = 1; i < SCHOOL_RANKS.length; i++) {
    assert.equal(SCHOOL_RANKS[i].min, SCHOOL_RANKS[i - 1].max + 1,
      `ранг ${i}: разрыв между рангами`);
  }
  assert.equal(SCHOOL_RANKS[SCHOOL_RANKS.length - 1].max, 100,
    'последний ранг до 100');
  for (let i = 1; i < SCHOOL_RANKS.length; i++) {
    assert.equal(SCHOOL_RANKS[i].tier, SCHOOL_RANKS[i - 1].tier + 1,
      `ранг ${i}: уровни заклинаний идут подряд`);
  }
});

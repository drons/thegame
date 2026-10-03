// Каталог данных: соответствие JSON-файлов JSON-схемам (задача 000015).
//
// Семь каталогов: assets/items, assets/npc, assets/skills,
// assets/buildings, assets/dungeons (задача 000058),
// assets/mob_groups (задача 000057), assets/visuals (задача 000059).
// Проверяем:
//  * минимальный валидатор (tests/json-schema.js) сам работает
//    правильно — самопроверки по каждому поддерживаемому ключу,
//    включая отрицательные (страховка от «немых» валидации);
//  * schema.json каждого каталога существует, разбирается и использует
//    только ключи минимального валидатора (ALLOWED_SCHEMA_KEYS);
//  * каждый файл 000001.json … NNNNNN.json каталога валиден по
//    схеме каталога (финальное состояние каталогов; JSON —
//    source of truth, см. SPEC.md);
//  * отрицательный контроль: валидатор ловит намеренную поломку
//    файла (нет обязательного поля / лишнее поле) — валидация
//    по схеме не пустая формальность.
//
// Валидатор общий (tests/json-schema.js), без внешних зависимостей
// (package.json без deps).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  validate, validateData, schemaKeys,
  ALLOWED_SCHEMA_KEYS, actualType,
} = require('./json-schema.js');

const ROOT = path.join(__dirname, '..');
const CATALOGS = ['items', 'npc', 'skills', 'buildings', 'dungeons', 'mob_groups', 'visuals'];

function catalogDir(name) {
  return path.join(ROOT, 'assets', name);
}

function listDataFiles(name) {
  return fs.readdirSync(catalogDir(name))
    .filter((f) => /^\d{6}\.json$/.test(f))
    .sort();
}

function loadSchema(name) {
  return JSON.parse(
    fs.readFileSync(path.join(catalogDir(name), 'schema.json'), 'utf8'));
}

// --- Валидатор: самопроверки (ключи ALLOWED_SCHEMA_KEYS) ---

test('actualType: integer и number различаются, остальные — typeof', () => {
  assert.equal(actualType(3), 'integer');
  assert.equal(actualType(3.5), 'number');
  assert.equal(actualType(null), 'null');
  assert.equal(actualType([]), 'array');
  assert.equal(actualType('s'), 'string');
  assert.equal(actualType({}), 'object');
  assert.equal(actualType(true), 'boolean');
});

test('валидатор: type — integer/number/string/object/array/null/boolean', () => {
  const cases = [
    [{ type: 'integer' }, 3, true],
    [{ type: 'integer' }, 3.5, false],
    [{ type: 'integer' }, '3', false],
    [{ type: 'number' }, 3, true], // целое — тоже number
    [{ type: 'number' }, 3.5, true],
    [{ type: 'number' }, '3', false],
    [{ type: 'string' }, 'abc', true],
    [{ type: 'string' }, 3, false],
    [{ type: 'object' }, { a: 1 }, true],
    [{ type: 'object' }, [1], false],
    [{ type: 'array' }, [1, 2], true],
    [{ type: 'array' }, {}, false],
    [{ type: 'null' }, null, true],
    [{ type: 'null' }, 0, false],
    [{ type: 'boolean' }, true, true],
    [{ type: 'boolean' }, 1, false],
  ];
  for (const [schema, value, ok] of cases) {
    const errors = validateData(schema, value);
    assert.equal(errors.length === 0, ok,
      `type ${schema.type}, значение ${JSON.stringify(value)}: ` +
      `${errors.join('; ')}`);
  }
});

test('валидатор: const и enum', () => {
  assert.deepEqual(validateData({ const: 'primary' }, 'primary'), []);
  assert.ok(validateData({ const: 'primary' }, 'secondary').length > 0,
    'const: другое значение не поймано');
  assert.deepEqual(validateData({ enum: ['a', 1] }, 1), []);
  assert.ok(validateData({ enum: ['a', 1] }, 'b').length > 0,
    'enum: значение вне списка не поймано');
});

test('валидатор: pattern — RegExp, применяется только к строкам', () => {
  const s = { type: 'string', pattern: '^[a-z][a-z0-9_]*$' };
  assert.deepEqual(validateData(s, 'swordman'), []);
  assert.ok(validateData(s, 'Swordman').length > 0,
    'pattern: заглавная буква не поймана');
  assert.ok(validateData(s, '1abc').length > 0,
    'pattern: цифра на старте не поймана');
  assert.deepEqual(validateData({ pattern: '^[a-z]+$' }, 42), [],
    'pattern к не-строке не применяется (не ошибка)');
});

test('валидатор: minimum/maximum — границы включены', () => {
  const s = { type: 'number', minimum: 0.05, maximum: 200 };
  assert.deepEqual(validateData(s, 0.05), [], 'minimum — граница включена');
  assert.deepEqual(validateData(s, 200), [], 'maximum — граница включена');
  assert.ok(validateData(s, 0.04).length > 0, '< minimum не поймано');
  assert.ok(validateData(s, 200.1).length > 0, '> maximum не поймано');
});

test('валидатор: minItems/maxItems — границы включены, items рекурсивен', () => {
  const s = { type: 'array', minItems: 6, maxItems: 6 };
  assert.deepEqual(validateData(s, [1, 2, 3, 4, 5, 6]), [],
    'ровно minItems — валидно');
  assert.ok(validateData(s, [1, 2, 3, 4, 5]).length > 0,
    '< minItems не поймано');
  assert.ok(validateData(s, [1, 2, 3, 4, 5, 6, 7]).length > 0,
    '> maxItems не поймано');
  const e = validateData({ type: 'array', items: { type: 'integer' } },
    [1, 'x']);
  assert.equal(e.length, 1, 'один ошибочный элемент — одна ошибка');
  assert.ok(e[0].includes('$[1]'), `индекс элемента в ошибке: ${e[0]}`);
});

test('валидатор: required, properties, additionalProperties false', () => {
  const s = {
    type: 'object',
    required: ['a', 'b'],
    properties: { a: { type: 'string' }, b: { type: 'integer' } },
    additionalProperties: false,
  };
  assert.deepEqual(validateData(s, { a: 'x', b: 1 }), []);
  const miss = validateData(s, { a: 'x' });
  assert.ok(miss.some((e) => e.includes('«b»')),
    `нет обязательного «b»: ${miss.join('; ')}`);
  const extra = validateData(s, { a: 'x', b: 1, c: 2 });
  assert.ok(extra.some((e) => e.includes('«c»')),
    `лишнее «c»: ${extra.join('; ')}`);
  const bad = validateData(s, { a: 'x', b: '1' });
  assert.ok(bad.some((e) => e.includes('.b')),
    `тип .b: ${bad.join('; ')}`);
  // без properties: additionalProperties false отклоняет ЛЮБОЕ поле
  const closed = { type: 'object', additionalProperties: false };
  assert.ok(validateData(closed, { a: 1 }).length > 0,
    'closed: поле не поймано');
  assert.deepEqual(validateData(closed, {}), []);
});

test('валидатор: anyOf — подходит хотя бы один вариант', () => {
  const s = { anyOf: [{ type: 'string' }, { type: 'null' }] };
  assert.deepEqual(validateData(s, 'x'), []);
  assert.deepEqual(validateData(s, null), []);
  assert.ok(validateData(s, 3).length > 0,
    'anyOf: ни один вариант не поймано');
});

test('валидатор: oneOf — подходит ровно один вариант', () => {
  const distinct = { oneOf: [{ const: 'a' }, { const: 'b' }] };
  assert.deepEqual(validateData(distinct, 'a'), []);
  assert.deepEqual(validateData(distinct, 'b'), []);
  assert.ok(validateData(distinct, 'c').length > 0,
    'oneOf: ноль вариантов не поймано');
  // две вложенные схемы, которым подходит одно значение → ошибка
  const ambiguous = {
    oneOf: [
      { type: 'object', required: ['x'] },
      { type: 'object' },
    ],
  };
  assert.ok(validateData(ambiguous, { x: 1 }).length > 0,
    'oneOf: два варианта не поймано');
  assert.ok(validateData(ambiguous, 5).length > 0,
    'oneOf: ноль вариантов (число) не поймано');
});

test('валидатор: путь where вложен — в сообщении ошибка', () => {
  const s = {
    type: 'object',
    properties: {
      arr: {
        type: 'array',
        items: {
          type: 'object',
          properties: { v: { type: 'integer' } },
        },
      },
    },
  };
  const e = validateData(s, { arr: [{ v: 1 }, { v: 'x' }] });
  assert.ok(e.some((x) => x.includes('arr[1].v')),
    `путь до вложенного поля: ${e.join('; ')}`);
});

// --- Каталоги: схемы и валидация файлов ---

for (const name of CATALOGS) {
  test(`${name}: schema.json существует и использует только ключи валидатора`, () => {
    const schema = loadSchema(name);
    assert.ok(schema && typeof schema === 'object' && !Array.isArray(schema),
      'schema.json — объект');
    const keys = schemaKeys(schema, '$', []);
    assert.ok(keys.length > 5, 'схема подозрительно маленькая');
    for (const [where, k] of keys) {
      assert.ok(ALLOWED_SCHEMA_KEYS.has(k),
        `схема: недопустимый ключ "${k}" в ${where}`);
    }
  });

  test(`${name}: файлы 000001.json … N.json подряд, каталог не пуст`, () => {
    const files = listDataFiles(name);
    assert.ok(files.length >= 1, 'каталог пустой');
    for (let i = 0; i < files.length; i++) {
      const num = String(i + 1).padStart(6, '0');
      assert.equal(files[i], num + '.json',
        `пробел в нумерации на позиции ${i + 1}: ${files[i]}`);
    }
    // Чужих файлов нет (только NNNNNN.json и schema.json).
    for (const f of fs.readdirSync(catalogDir(name))) {
      assert.ok(/^\d{6}\.json$/.test(f) || f === 'schema.json',
        `чужой файл в каталоге ${name}: ${f}`);
    }
  });

  test(`${name}: каждый файл валиден по schema.json`, () => {
    const schema = loadSchema(name);
    const files = listDataFiles(name);
    for (const f of files) {
      const data = JSON.parse(
        fs.readFileSync(path.join(catalogDir(name), f), 'utf8'));
      const errors = [];
      validate(schema, data, f, errors);
      assert.deepEqual(errors, [],
        `${f}: ${errors.join('; ')}`);
    }
  });

  test(`${name}: отрицательный контроль — валидатор ловит поломку`, () => {
    const schema = loadSchema(name);
    const files = listDataFiles(name);
    const data = JSON.parse(
      fs.readFileSync(path.join(catalogDir(name), files[0]), 'utf8'));
    // Обязательные поля: верхний уровень или первый вариант oneOf
    // (skills: схема — oneOf primary | secondary).
    const required = schema.required ||
      (schema.oneOf ? schema.oneOf[0].required : null);
    assert.ok(Array.isArray(required) && required.length > 0,
      'схема не даёт required для отрицательного контроля');
    // 1) Нет обязательного поля.
    const miss = JSON.parse(JSON.stringify(data));
    delete miss[required[0]];
    assert.ok(validateData(schema, miss, 'test').length > 0,
      `удаление обязательного «${required[0]}» не поймано`);
    // 2) Лишнее поле (все четыре схемы запрещают additionalProperties).
    const extra = JSON.parse(JSON.stringify(data));
    extra.__test_extra__ = true;
    assert.ok(validateData(schema, extra, 'test').length > 0,
      'лишнее поле не поймано');
  });
}

// --- 000077: «ежедневный контент» — форма новых полей каталога 39/43 ---

test('buildings: 000039/000043 — «ежедневный контент» (000077): форма новых полей', () => {
  const schema = loadSchema('buildings');
  const read = (f) => JSON.parse(
    fs.readFileSync(path.join(catalogDir('buildings'), f), 'utf8'));
  const j39 = read('000039.json');
  const j43 = read('000043.json');
  // Фиксатор: оба файла валидны по схеме (особые_параметры —
  // free-form: проходят и до, и после 000077).
  assert.deepEqual(validateData(schema, j39), [],
    '39: валиден по schema.json');
  assert.deepEqual(validateData(schema, j43), [],
    '43: валиден по schema.json');
  // Форма новых полей (контракт 000077 §6): эффект — ОБЪЕКТ
  // { доли: {сундук, босс, реликвия}, реликвии: [id] } (red: у 39
  // поля нет, у 43 эффект — строка).
  for (const [id, j] of [['39', j39], ['43', j43]]) {
    const p = j.особые_параметры;
    assert.ok(p.эффект && typeof p.эффект === 'object'
      && !Array.isArray(p.эффект),
      id + ': эффект — объект (000077)');
    const d = p.эффект.доли;
    assert.ok(d && typeof d === 'object' && !Array.isArray(d),
      id + ': эффект.доли — объект');
    for (const k of ['сундук', 'босс', 'реликвия']) {
      assert.equal(typeof d[k], 'number',
        id + ': доля «' + k + '» — число');
      assert.ok(Number.isFinite(d[k]) && d[k] >= 0 && d[k] <= 1,
        id + ': доля «' + k + '» ∈ [0,1]');
    }
    const sum = d.сундук + d.босс + d.реликвия;
    assert.ok(Math.abs(sum - 1) < 1e-9,
      id + ': суммы долей = 1 (получено ' + sum + ')');
    assert.ok(Array.isArray(p.эффект.реликвии)
      && p.эффект.реликвии.length > 0,
      id + ': эффект.реликвии — массив id');
    for (const rid of p.эффект.реликвии) {
      assert.equal(typeof rid, 'string',
        id + ': реликвия — строка id («' + rid + '»)');
    }
  }
  assert.equal(j39.особые_параметры.раз_в_день, true,
    '39: раз_в_день — true (red: поля нет)');
  assert.equal(j43.особые_параметры.раз_в_день, true,
    '43: раз_в_день — true');
});

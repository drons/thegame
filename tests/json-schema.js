// Минимальный валидатор JSON-схем (задача 000015) — общий для всех
// каталогов assets/ (items, npc, skills, buildings, spells, craft, …).
// Только для тестов (node), без внешних зависимостей.
//
// Поддерживаемые ключи схемы — ALLOWED_SCHEMA_KEYS:
//   type, required, properties, additionalProperties, items,
//   enum, const, minimum, maximum, minItems, maxItems, pattern,
//   anyOf, oneOf
// Все schema.json каталогов обязаны использовать ТОЛЬКО этот набор
// (проверяется отдельным тестом в каждом tests/*.test.js).
//
// Семантика:
//   type 'integer' — только целые; 'number' — целые и дробные;
//   'null' — только null. minimum/maximum/minItems/maxItems —
//   границы включены. pattern — RegExp без флагов.
//   anyOf — подходит хотя бы один вариант; oneOf — ровно один.
// Ошибки накапливаются в массив errors (строки с путём «where»).

'use strict';

const ALLOWED_SCHEMA_KEYS = new Set([
  'type', 'required', 'properties', 'additionalProperties', 'items',
  'enum', 'const', 'minimum', 'maximum', 'minItems', 'maxItems',
  'pattern', 'anyOf', 'oneOf',
]);

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

// Удобная обёртка: валидация значения по схеме, результат — массив
// ошибок (пустой массив = валидно). where — имя для сообщений.
function validateData(schema, data, where) {
  const errors = [];
  validate(schema, data, where || '$', errors);
  return errors;
}

// Обход схемы: все пары [где, ключ] для каждого ключа схемы.
// properties — ходит по под-схемам значений (ключи properties — имена
// полей данных, не ключи схемы); items/oneOf/anyOf — под-схемы;
// массивы required/enum — листья (простые значения).
function schemaKeys(node, where, out) {
  if (Array.isArray(node)) {
    node.forEach((v, i) => schemaKeys(v, `${where}[${i}]`, out));
    return out;
  }
  if (!node || typeof node !== 'object') return out;
  for (const [k, v] of Object.entries(node)) {
    out.push([where, k]);
    if (v === null) continue;
    if (k === 'properties' && typeof v === 'object' && !Array.isArray(v)) {
      for (const [fname, fschema] of Object.entries(v)) {
        schemaKeys(fschema, `${where}.properties.${fname}`, out);
      }
    } else if (k === 'items' || k === 'oneOf' || k === 'anyOf') {
      schemaKeys(v, `${where}.${k}`, out);
    }
  }
  return out;
}

module.exports = {
  ALLOWED_SCHEMA_KEYS,
  actualType,
  validate,
  validateData,
  schemaKeys,
};

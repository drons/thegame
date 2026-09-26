// Каталог NPC (assets/npc) — задача 000010.
//
// Проверяем:
//  * нумерация файлов 000001.json … N подряд, без чужих файлов;
//  * каждый файл валиден по assets/npc/schema.json (минимальный
//    валидатор, допустимые ключи — ALLOWED_SCHEMA_KEYS, задача 000015);
//  * консистентность: каталог JSON <-> src/npc-data.js (фолбэк file://)
//    (все NPC, все поля, порядок = нумерация файлов);
//  * правила каталога: уникальные id, постройки 1..50 из каталога зданий,
//    непустые имя/роль/диалог, допустимые действия опций;
//  * ссылочную целостность: предметы (assets/items), навыки
//    (src/skills-data.js), типы групп мобов (src/map.js), цепочки квестов;
//  * кросс-проверку школ: «тренирует» здания = обучение.навыки NPC;
//  * покрытие требований задачи: торговцы с разным ассортиментом,
//    ≥ 3 школы, старейшина с цепочкой квестов, карта покрыта NPC.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { NPCS } = require('../src/npc-data.js');
const { getBuilding } = require('../src/buildings.js');
const { getItem } = require('../src/items.js');
const { PRIMARY_SKILLS, SECONDARY_SKILLS } = require('../src/player.js');
const { MOB_GROUP_COUNT } = require('../src/map.js');

const DIR = path.join(__dirname, '..', 'assets', 'npc');

// Допустимые ключи JSON-схем (задача 000015: минимальный валидатор).
const ALLOWED_SCHEMA_KEYS = new Set([
  'type', 'required', 'properties', 'additionalProperties', 'items',
  'enum', 'const', 'minimum', 'maximum', 'minItems', 'maxItems',
  'pattern', 'anyOf', 'oneOf',
]);

// Допустимые действия опций диалога (assets/npc/schema.json).
const ACTIONS = new Set(['торговля', 'обучение', 'квесты', 'подсказка']);

// «Картовые» постройки с NPC (map_index → id каталога, src/map.js):
// 4 магазина, 4 школы, дом кузнеца, храм солнца, таверна.
const MAP_NPC_BUILDINGS = [1, 2, 3, 4, 7, 8, 10, 11, 25, 36, 44];

function listNpcFiles() {
  return fs.readdirSync(DIR)
    .filter((f) => /^\d{6}\.json$/.test(f))
    .sort();
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

// --- Нумерация и зеркало ---

test('каталог: ровно N файлов 000001..N.json подряд, N = NPCS.length', () => {
  const files = listNpcFiles();
  assert.ok(files.length >= 1, 'каталог пустой');
  assert.equal(files.length, NPCS.length,
    'в зеркале столько же NPC, сколько файлов');
  for (let i = 0; i < files.length; i++) {
    const num = String(i + 1).padStart(6, '0');
    assert.equal(files[i], num + '.json',
      `пробел в нумерации на позиции ${i + 1}: ${files[i]}`);
  }
});

test('каталог: чужих файлов нет (только NNNNNN.json и schema.json)', () => {
  const all = fs.readdirSync(DIR).sort();
  for (const f of all) {
    assert.ok(/^\d{6}\.json$/.test(f) || f === 'schema.json',
      `чужой файл в каталоге NPC: ${f}`);
  }
});

test('зеркало: src/npc-data.js — точная копия каталога JSON', () => {
  const files = listNpcFiles();
  assert.ok(Array.isArray(NPCS), 'NPCS — массив');
  for (let i = 0; i < files.length; i++) {
    const fromFile = JSON.parse(
      fs.readFileSync(path.join(DIR, files[i]), 'utf8'));
    assert.ok(NPCS[i] && typeof NPCS[i] === 'object' && !Array.isArray(NPCS[i]),
      `NPCS[${i}] (${files[i]}): не объект`);
    assert.deepEqual(NPCS[i], fromFile,
      `${files[i]}: зеркало совпадает с JSON (ключи и порядок)`);
  }
});

// --- Схема ---

test('schema.json: object, additionalProperties false, обязательные поля', () => {
  const schema = loadSchema();
  assert.equal(schema.type, 'object', 'верхний уровень: object');
  assert.equal(schema.additionalProperties, false,
    'верхний уровень: additionalProperties false');
  for (const r of ['id', 'имя', 'роль', 'постройки', 'диалог']) {
    assert.ok(schema.required.includes(r), `required: «${r}»`);
  }
});

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
  const files = listNpcFiles();
  for (const f of files) {
    const data = JSON.parse(
      fs.readFileSync(path.join(DIR, f), 'utf8'));
    const errors = [];
    validate(schema, data, f, errors);
    assert.deepEqual(errors, [], `${f}: ${errors.join('; ')}`);
  }
});

test('схема: цель квеста требует поле по типу (oneOf)', () => {
  // {тип: "kill_group", количество} без «группа» и
  // {тип: "bring_item", количество} без «предмет» — цели, которые в
  // src/npc.js никогда не выполняются (softlock): схема их запрещает.
  const schema = loadSchema();
  const goalSchema = schema.properties.квесты.items.properties.цель;
  assert.ok(goalSchema.oneOf, 'цель — oneOf из вариантов по типу');
  const cases = [
    { goal: { тип: 'kill_group', количество: 1 }, ok: false },
    { goal: { тип: 'bring_item', количество: 2 }, ok: false },
    { goal: { тип: 'kill_group', группа: 2, количество: 1 }, ok: true },
    { goal: { тип: 'bring_item', предмет: 'moonstone', количество: 2 }, ok: true },
    // чужое поле типа — тоже мимо (additionalProperties false в варианте)
    { goal: { тип: 'kill_group', группа: 2, количество: 1,
              предмет: 'moonstone' }, ok: false },
    { goal: { тип: 'other', количество: 1 }, ok: false },
  ];
  for (const { goal, ok } of cases) {
    const errors = [];
    validate(goalSchema, goal, 'цель', errors);
    assert.equal(errors.length === 0, ok,
      `цель ${JSON.stringify(goal)}: ${errors.join('; ')}`);
  }
});

// --- Правила каталога ---

test('правила: id уникальны, постройки 1..50 из каталога, поля не пусты', () => {
  const files = listNpcFiles();
  const seenIds = new Set();
  files.forEach((f, i) => {
    const n = NPCS[i];
    assert.match(n.id, /^[a-z][a-z0-9_]*$/, `${f}: id "${n.id}"`);
    assert.ok(!seenIds.has(n.id), `дубликат id "${n.id}" в ${f}`);
    seenIds.add(n.id);
    assert.equal(typeof n.имя, 'string', `${f}: имя — строка`);
    assert.ok(n.имя.trim() !== '', `${f}: имя не пустое`);
    assert.equal(typeof n.роль, 'string', `${f}: роль — строка`);
    assert.ok(n.роль.trim() !== '', `${f}: роль не пустая`);
    assert.ok(Array.isArray(n.постройки) && n.постройки.length > 0,
      `${f}: постройки — непустой массив`);
    for (const b of n.постройки) {
      assert.ok(Number.isInteger(b) && b >= 1 && b <= 50,
        `${f}: постройка ${b} вне диапазона 1..50`);
      assert.ok(getBuilding(b) !== null,
        `${f}: здание id=${b} нет в каталоге buildings`);
    }
    assert.ok(Array.isArray(n.диалог) && n.диалог.length > 0,
      `${f}: диалог — непустой массив`);
    const optIds = new Set();
    for (const o of n.диалог) {
      assert.ok(!optIds.has(o.id), `${f}: дубль опции диалога "${o.id}"`);
      optIds.add(o.id);
      assert.ok(ACTIONS.has(o.действие), `${f}: действие "${o.действие}"`);
    }
  });
});

// --- Ссылочная целостность ---

test('целостность: предметы, навыки, типы групп мобов, цепочки квестов', () => {
  for (const n of NPCS) {
    // Торговля: предметы — из каталога assets/items.
    if (n.торговля) {
      for (const p of n.торговля.предметы) {
        assert.ok(getItem(p.предмет) !== null,
          `${n.id}: предмет "${p.предмет}" нет в items`);
      }
    }
    // Обучение: только вторичные навыки каталога.
    if (n.обучение) {
      for (const id of n.обучение.навыки) {
        assert.ok(SECONDARY_SKILLS[id] !== undefined,
          `${n.id}: "${id}" не вторичный навык`);
      }
    }
    // Диалог: требуемый навык — основной или вторичный.
    const knownSkill = (id) =>
      SECONDARY_SKILLS[id] !== undefined ||
      PRIMARY_SKILLS.some((p) => p.id === id);
    for (const o of n.диалог) {
      if (o.требования && o.требования.навык) {
        assert.ok(knownSkill(o.требования.навык.id),
          `${n.id}: опция ${o.id}: навык "${o.требования.навык.id}" неизвестен`);
      }
    }
    // Квесты.
    if (n.квесты) {
      const allIds = new Set(n.квесты.map((q) => q.id));
      assert.equal(allIds.size, n.квесты.length,
        `${n.id}: дубликаты id квестов`);
      for (const q of n.квесты) {
        const goal = q.цель;
        if (goal.тип === 'kill_group') {
          assert.ok(Number.isInteger(goal.группа) &&
            goal.группа >= 0 && goal.группа < MOB_GROUP_COUNT,
            `${n.id}: квест ${q.id}: группа ${goal.группа} вне 0..${MOB_GROUP_COUNT - 1}`);
        } else if (goal.тип === 'bring_item') {
          assert.ok(getItem(goal.предмет) !== null,
            `${n.id}: квест ${q.id}: предмет "${goal.предмет}" нет в items`);
        }
        for (const r of (q.награда.предметы || [])) {
          assert.ok(getItem(r.предмет) !== null,
            `${n.id}: квест ${q.id}: награда "${r.предмет}" нет в items`);
        }
        if (q.предыдущий !== null && q.предыдущий !== undefined) {
          assert.ok(allIds.has(q.предыдущий),
            `${n.id}: квест ${q.id}: предыдущий "${q.предыдущий}" не у этого NPC`);
        }
      }
      // Циклов в цепочках нет: обход по «предыдущий» завершается.
      for (const q of n.квесты) {
        const seen = new Set();
        let cur = q;
        let guard = 0;
        while (cur) {
          assert.ok(++guard <= n.квесты.length + 1,
            `${n.id}: цикл в цепочке квестов`);
          assert.ok(!seen.has(cur.id),
            `${n.id}: цикл в цепочке на квесте "${cur.id}"`);
          seen.add(cur.id);
          const prev = cur.предыдущий;
          cur = prev ? n.квесты.find((x) => x.id === prev) : null;
        }
      }
    }
  }
});

test('школы: «тренирует» здания = обучение.навыки NPC (названия)', () => {
  const lower = (s) => s.toLowerCase();
  let pairs = 0;
  for (const n of NPCS) {
    for (const bId of n.постройки) {
      const b = getBuilding(bId);
      const trains = b && b.категория === 'школа_навыков'
        ? b.особые_параметры.тренирует
        : undefined;
      if (!Array.isArray(trains)) continue;
      pairs += 1;
      const buildingNames = new Set(trains.map(lower));
      const npcNames = new Set(
        (n.обучение ? n.обучение.навыки : []).map(
          (id) => lower(SECONDARY_SKILLS[id].name)));
      assert.deepEqual([...buildingNames].sort(), [...npcNames].sort(),
        `${n.id} в здании ${bId} «${b.название}»: наборы обучаемых навыков совпадают`);
    }
  }
  // Арена, Кузница, Стрельбище, Школа акробатов, Хижина старейшин.
  assert.ok(pairs >= 5, 'проверено не меньше 5 пар «NPC — школа»');
});

// --- Покрытие требований задачи 000010 ---

test('покрытие: торговцы с разным ассортиментом, ≥ 3 школы, ≥ 4 навыков', () => {
  const traders = NPCS.filter((n) => n.торговля);
  assert.ok(traders.length >= 2, 'торговцов не меньше 2');
  const stocks = traders.map(
    (n) => n.торговля.предметы.map((p) => p.предмет).sort().join(','));
  assert.ok(new Set(stocks).size > 1,
    'наборы предметов у торговцев не совпадают полностью');
  const teachers = NPCS.filter((n) => n.обучение);
  assert.ok(teachers.length >= 3, 'школ навыков не меньше 3');
  const allSkills = new Set();
  for (const t of teachers) {
    for (const id of t.обучение.навыки) allSkills.add(id);
  }
  assert.ok(allSkills.size >= 4, 'разных обучаемых навыков не меньше 4');
});

test('покрытие: старейшина с цепочкой из ≥ 2 квестов', () => {
  const elders = NPCS.filter((n) => n.роль.includes('старейшин'));
  assert.ok(elders.length >= 1, 'старейшины нет');
  for (const e of elders) {
    assert.ok(Array.isArray(e.квесты) && e.квесты.length >= 2,
      `${e.id}: квестов не меньше 2`);
    const ids = new Set(e.квесты.map((q) => q.id));
    const chained = e.квесты.filter(
      (q) => q.предыдущий !== null && ids.has(q.предыдущий));
    assert.ok(chained.length >= 1,
      `${e.id}: есть квест, ссылающийся на предыдущий (цепочка)`);
  }
});

test('покрытие: все «картовые» постройки с NPC заняты хотя бы одним NPC', () => {
  const covered = new Set();
  for (const n of NPCS) {
    for (const bId of n.постройки) covered.add(bId);
  }
  for (const bId of MAP_NPC_BUILDINGS) {
    assert.ok(covered.has(bId),
      `постройка ${bId} (${getBuilding(bId).название}) без NPC`);
  }
});

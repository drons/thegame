// Каталог навыков (assets/skills) — задача 000012.
//
// Проверяем:
//  * нумерация файлов 000001.json … N подряд, без дубликатов;
//  * каждый файл — корректный JSON с известным типом и полными полями;
//  * консистентность: каталог JSON <-> src/skills-data.js (фолбэк file://)
//    <-> src/player.js (каждый навык присутствует в обоих и наоборот,
//      эффекты и требования совпадают);
//  * ссылочная целостность дерева навыков;
//  * schema.json использует только ключи минимального валидатора (000015).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const skillsData = require('../src/skills-data.js');
const {
  PRIMARY_SKILLS, SECONDARY_SKILLS, RANKS,
} = require('../src/player.js');

const SKILLS_DIR = path.join(__dirname, '..', 'assets', 'skills');
const ROOT = path.join(__dirname, '..');
const { isRef, resolveRef, REF_RE } = require(
  path.join(ROOT, 'scripts', 'lib', 'json-ref.js'));

// Допустимые ключи JSON-схем (задача 000015: минимальный валидатор).
const ALLOWED_SCHEMA_KEYS = new Set([
  'type', 'required', 'properties', 'additionalProperties', 'items',
  'enum', 'const', 'minimum', 'maximum', 'minItems', 'maxItems',
  'pattern', 'anyOf', 'oneOf',
]);

const PRIMARY_FIELDS = ['id', 'type', 'name', 'desc', 'combat', 'world'];
// Обязательные поля вторичного навыка; `requires` опционален —
// опущен в JSON, если у навыка нет требований.
const SECONDARY_FIELDS =
  ['id', 'type', 'name', 'primary', 'effect', 'effectType', 'desc', 'names'];
const KNOWN_SECONDARY_FIELDS = SECONDARY_FIELDS.concat('requires');

function listSkillFiles() {
  return fs.readdirSync(SKILLS_DIR)
    .filter((f) => /^\d{6}\.json$/.test(f))
    .sort();
}

// Каталог: Map<номер, {file, data}> + список всех файлов каталога.
function denorm(file, data) {
  if (isRef(data.primary)) {
    const r = resolveRef(ROOT, data.primary);
    assert.ok(r.ok,
      `${file}: primary-ссылка не резолвится: ${r.reason} (${data.primary})`);
    data.primary = r.id;
  }
  if (data.requires && isRef(data.requires.skill)) {
    const r = resolveRef(ROOT, data.requires.skill);
    assert.ok(r.ok,
      `${file}: requires.skill не резолвится: ${r.reason} (${data.requires.skill})`);
    data.requires.skill = r.id;
  }
  return data;
}

function loadCatalog() {
  const all = fs.readdirSync(SKILLS_DIR).sort();
  const byNumber = new Map();
  for (const f of all) {
    if (f === 'schema.json') continue;
    assert.match(f, /^\d{6}\.json$/, `чужой файл в каталоге навыков: ${f}`);
    const n = parseInt(f, 10);
    assert.ok(!byNumber.has(n), `дубликат номера навыка: ${f}`);
    const data = denorm(f, JSON.parse(
      fs.readFileSync(path.join(SKILLS_DIR, f), 'utf8')));
    byNumber.set(n, { file: f, data });
  }
  return { all, byNumber };
}

function normRequires(r) {
  return r === undefined || r === null ? null : r;
}

test('каталог: нумерация файлов подряд с 000001', () => {
  const files = listSkillFiles();
  assert.ok(files.length >= 2, 'каталог пустой');
  files.forEach((f, i) => {
    assert.equal(f, String(i + 1).padStart(6, '0') + '.json',
      `пробел в нумерации на позиции ${i + 1}: ${f}`);
  });
});

test('каталог: 6 основных и 31 вторичный навык', () => {
  const { byNumber } = loadCatalog();
  let primary = 0;
  let secondary = 0;
  for (const { data } of byNumber.values()) {
    if (data.type === 'primary') primary += 1;
    else if (data.type === 'secondary') secondary += 1;
  }
  assert.equal(primary, 6, 'основных навыков должно быть 6');
  assert.equal(secondary, 31, 'вторичных навыков должно быть 31 (SPEC.md)');
});

test('каждый файл: известные поля, без лишних', () => {
  const { byNumber } = loadCatalog();
  const primaryIds = new Set(
    [...byNumber.values()].filter((x) => x.data.type === 'primary').map((x) => x.data.id));
  for (const { file, data } of byNumber.values()) {
    assert.ok(data && typeof data === 'object' && !Array.isArray(data),
      `${file}: не объект`);
    assert.ok(data.type === 'primary' || data.type === 'secondary',
      `${file}: type = ${data.type}`);
    const fields = data.type === 'primary' ? PRIMARY_FIELDS : SECONDARY_FIELDS;
    const known = data.type === 'primary' ? fields : KNOWN_SECONDARY_FIELDS;
    for (const f of fields) {
      assert.ok(f in data, `${file}: нет поля ${f}`);
    }
    for (const f of Object.keys(data)) {
      assert.ok(known.includes(f), `${file}: неизвестное поле ${f}`);
    }
    if (data.type === 'primary') {
      assert.equal(data.type, 'primary', `${file}`);
      for (const f of ['name', 'desc', 'combat', 'world']) {
        assert.equal(typeof data[f], 'string', `${file}: ${f} — строка`);
        assert.ok(data[f].length > 0, `${file}: ${f} — не пустая строка`);
      }
    } else {
      assert.equal(typeof data.name, 'string', `${file}`);
      assert.ok(primaryIds.has(data.primary),
        `${file}: primary "${data.primary}" не основной навык`);
      assert.equal(typeof data.effect.stat, 'string', `${file}: effect.stat`);
      assert.equal(typeof data.effect.perLevel, 'number', `${file}: effect.perLevel`);
      assert.ok(['Бой', 'Карта', 'Бой/Карта', 'ОТСРОЧЕНО'].includes(data.effectType),
        `${file}: effectType "${data.effectType}"`);
      assert.ok(Array.isArray(data.names) && data.names.length === 6,
        `${file}: names — 6 имён по рангам`);
      if (data.requires !== undefined) {
        assert.equal(typeof data.requires.skill, 'string', `${file}`);
        assert.ok(Number.isInteger(data.requires.level) &&
          data.requires.level >= 1 && data.requires.level <= 100,
          `${file}: requires.level в диапазоне 1..100`);
      }
    }
    assert.match(data.id, /^[a-z][a-z0-9_]*$/, `${file}: id "${data.id}"`);
  }
});

test('консистентность: основные навыки каталог <-> player.js', () => {
  const { byNumber } = loadCatalog();
  const catPrimary = new Map();
  for (const { data } of byNumber.values()) {
    if (data.type === 'primary') catPrimary.set(data.id, data);
  }
  for (const p of PRIMARY_SKILLS) {
    const c = catPrimary.get(p.id);
    assert.ok(c, `player.js: навык "${p.id}" отсутствует в каталоге`);
    assert.equal(c.name, p.name, `${p.id}: имя`);
    assert.equal(c.desc, p.desc, `${p.id}: описание`);
  }
  assert.equal(catPrimary.size, PRIMARY_SKILLS.length,
    'в каталоге есть основные навыки, которых нет в player.js');
});

test('консистентность: вторичные навыки каталог <-> player.js', () => {
  const { byNumber } = loadCatalog();
  const catSecondary = new Map();
  for (const { data } of byNumber.values()) {
    if (data.type === 'secondary') catSecondary.set(data.id, data);
  }
  for (const [id, s] of Object.entries(SECONDARY_SKILLS)) {
    const c = catSecondary.get(id);
    assert.ok(c, `player.js: навык "${id}" отсутствует в каталоге`);
    assert.equal(c.name, s.name, `${id}: имя`);
    assert.equal(c.primary, s.primary, `${id}: основной навык`);
    assert.deepEqual(normRequires(c.requires), normRequires(s.requires),
      `${id}: требования`);
    assert.equal(c.effect.stat, s.effect.stat, `${id}: effect.stat`);
    assert.equal(c.effect.perLevel, s.effect.perLevel, `${id}: effect.perLevel`);
    assert.equal(c.desc, s.desc, `${id}: описание`);
    assert.deepEqual(c.names, s.names, `${id}: имена по рангам`);
  }
  assert.equal(catSecondary.size, Object.keys(SECONDARY_SKILLS).length,
    'в каталоге есть вторичные навыки, которых нет в player.js');
});

test('skills-data.js — точное зеркало каталога JSON (фолбэк file://)', () => {
  const { byNumber } = loadCatalog();
  // Основные: порядок в модуле = порядку номеров файлов.
  const catPrimary = [];
  for (const { data } of byNumber.values()) {
    if (data.type === 'primary') catPrimary.push(data);
  }
  assert.deepEqual(skillsData.PRIMARY_SKILLS, catPrimary,
    'основные навыки: JS-модуль != JSON-каталог');
  // Вторичные: полное совпадение по каждому файлу (requires нормализован в null).
  for (const { file, data } of byNumber.values()) {
    if (data.type !== 'secondary') continue;
    const got = skillsData.SECONDARY_SKILLS[data.id];
    assert.ok(got, `skills-data.js: нет навыка "${data.id}" (${file})`);
    assert.deepEqual(got, Object.assign({ requires: null },
      { id: data.id, type: data.type, name: data.name, primary: data.primary,
        requires: normRequires(data.requires),
        effect: data.effect, effectType: data.effectType,
        desc: data.desc, names: data.names }),
      `skills-data.js: данные "${data.id}" (${file}) != JSON`);
  }
  const catCount = [...byNumber.values()].filter((x) => x.data.type === 'secondary').length;
  assert.equal(Object.keys(skillsData.SECONDARY_SKILLS).length, catCount,
    'skills-data.js: лишний/недостающий вторичный навык');
});

test('player.js читает каталог из skills-data.js', () => {
  assert.equal(PRIMARY_SKILLS, skillsData.PRIMARY_SKILLS,
    'PRIMARY_SKILLS не тот же объект, что в skills-data.js');
  assert.equal(SECONDARY_SKILLS, skillsData.SECONDARY_SKILLS,
    'SECONDARY_SKILLS не тот же объект, что в skills-data.js');
});

test('дерево навыков: requires.skill существует в каталоге', () => {
  const { byNumber } = loadCatalog();
  const allIds = new Set();
  for (const { data } of byNumber.values()) allIds.add(data.id);
  for (const { file, data } of byNumber.values()) {
    if (data.type !== 'secondary') continue;
    assert.ok(allIds.has(data.primary),
      `${file}: primary "${data.primary}" не найден в каталоге`);
    if (data.requires) {
      assert.ok(allIds.has(data.requires.skill),
        `${file}: требует "${data.requires.skill}" — навыка нет в каталоге`);
      // Требование не должно ссылаться на самого навыка (цикл).
      assert.notEqual(data.requires.skill, data.id, `${file}: цикл в требованиях`);
    }
  }
});

test('schema.json: только ключи минимального валидатора (000015)', () => {
  const schema = JSON.parse(
    fs.readFileSync(path.join(SKILLS_DIR, 'schema.json'), 'utf8'));
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

test('schema.json: структура (oneOf: primary | secondary)', () => {
  const schema = JSON.parse(
    fs.readFileSync(path.join(SKILLS_DIR, 'schema.json'), 'utf8'));
  assert.ok(Array.isArray(schema.oneOf) && schema.oneOf.length === 2,
    'схема: верхний уровень — oneOf из двух вариантов');
  const [prim, sec] = [schema.oneOf[0], schema.oneOf[1]];
  for (const [branch, type] of [[prim, 'primary'], [sec, 'secondary']]) {
    assert.equal(branch.type, 'object', `${type}: type object`);
    assert.equal(branch.additionalProperties, false,
      `${type}: additionalProperties false`);
    assert.deepEqual(branch.properties.type, { const: type },
      `${type}: type закреплено константой`);
    assert.ok(branch.properties.id &&
      typeof branch.properties.id.pattern === 'string',
      `${type}: id со схемой-паттерном`);
  }
  assert.deepEqual(Object.keys(prim.properties).sort(),
    ['combat', 'desc', 'id', 'name', 'type', 'world'],
    'primary: наборы свойств');
  assert.deepEqual(Object.keys(sec.properties).sort(),
    ['desc', 'effect', 'effectType', 'id', 'name', 'names', 'primary', 'requires', 'type'],
    'secondary: наборы свойств');
  assert.equal(sec.properties.primary.pattern, REF_RE.source,
    'secondary: primary — якорный паттерн ссылки (REF_RE)');
  assert.ok(!('enum' in sec.properties.primary),
    'secondary: primary без enum (ref-значение не проходит enum)');
  assert.equal(sec.properties.requires.properties.skill.pattern, REF_RE.source,
    'secondary: requires.skill — якорный паттерн ссылки (REF_RE)');
  assert.equal(sec.properties.names.minItems, 6, 'names: ровно 6 имён');
  assert.equal(sec.properties.names.maxItems, 6, 'names: ровно 6 имён');
  assert.deepEqual(sec.properties.effectType.enum,
    ['Бой', 'Карта', 'Бой/Карта', 'ОТСРОЧЕНО'], 'effectType: enum');
  assert.equal(sec.properties.requires.additionalProperties, false, 'requires');
  assert.ok(sec.required.includes('effect'), 'secondary: effect обязателен');
  assert.ok(!sec.required.includes('requires'),
    'secondary: requires опционален (отсутствует в JSON, если нет требований)');
});

test('ранги: 6 рангов покрывают уровни 1..100 без разрывов', () => {
  assert.equal(RANKS.length, 6, 'рангов должно быть 6');
  assert.equal(RANKS[0].min, 1, 'первый ранг начинается с 1');
  for (let i = 1; i < RANKS.length; i++) {
    assert.equal(RANKS[i].min, RANKS[i - 1].max + 1,
      `ранг ${i}: разрыв между рангами`);
  }
  assert.equal(RANKS[RANKS.length - 1].max, 100, 'последний ранг до 100');
});

test('000280 V1: forge (000010) — effectType «Карта» + desc «+5% к качеству собственного крафта за уровень»', () => {
  const d = loadCatalog().byNumber.get(10).data;
  assert.equal(d.effectType, 'Карта',
    `forge: effectType ожидало «Карта», факт «${d.effectType}»`);
  assert.equal(d.desc, '+5% к качеству собственного крафта за уровень',
    `forge: desc ожидало «+5% к качеству собственного крафта за уровень», факт «${d.desc}»`);
});

test('000280 V2: acro (000016) — effectType «ОТСРОЧЕНО» + desc «ОТСРОЧЕНО: потребителей стата в коде нет»', () => {
  const d = loadCatalog().byNumber.get(16).data;
  assert.equal(d.effectType, 'ОТСРОЧЕНО',
    `acro: effectType ожидало «ОТСРОЧЕНО», факт «${d.effectType}»`);
  assert.equal(d.desc, 'ОТСРОЧЕНО: потребителей стата в коде нет',
    `acro: desc ожидало «ОТСРОЧЕНО: потребителей стата в коде нет», факт «${d.desc}»`);
});

test('000280 V3: thief (000017) — effectType «Карта» + desc «Колодец: +5% шанс предмета на дне за уровень»', () => {
  const d = loadCatalog().byNumber.get(17).data;
  assert.equal(d.effectType, 'Карта',
    `thief: effectType ожидало «Карта», факт «${d.effectType}»`);
  assert.equal(d.desc, 'Колодец: +5% шанс предмета на дне за уровень',
    `thief: desc ожидало «Колодец: +5% шанс предмета на дне за уровень», факт «${d.desc}»`);
});

test('000280 V4: endurance (000019) — effectType «Бой» + desc «+3% к максимальному здоровью за уровень»', () => {
  const d = loadCatalog().byNumber.get(19).data;
  assert.equal(d.effectType, 'Бой',
    `endurance: effectType ожидало «Бой», факт «${d.effectType}»`);
  assert.equal(d.desc, '+3% к максимальному здоровью за уровень',
    `endurance: desc ожидало «+3% к максимальному здоровью за уровень», факт «${d.desc}»`);
});

test('000280 V5: golem (000020) — effectType «Бой» + desc «+2% макс. здоровье и +1 броня за уровень»', () => {
  const d = loadCatalog().byNumber.get(20).data;
  assert.equal(d.effectType, 'Бой',
    `golem: effectType ожидало «Бой», факт «${d.effectType}»`);
  assert.equal(d.desc, '+2% макс. здоровье и +1 броня за уровень',
    `golem: desc ожидало «+2% макс. здоровье и +1 броня за уровень», факт «${d.desc}»`);
});

test('000280 V6: leader (000035) — effectType «Бой» + desc «+5% мораль спутников за уровень»', () => {
  const d = loadCatalog().byNumber.get(35).data;
  assert.equal(d.effectType, 'Бой',
    `leader: effectType ожидало «Бой», факт «${d.effectType}»`);
  assert.equal(d.desc, '+5% мораль спутников за уровень',
    `leader: desc ожидало «+5% мораль спутников за уровень», факт «${d.desc}»`);
});

test('000280 V7: artist (000036) — effectType «Карта» + desc «+10% заработок на выступлениях за уровень»', () => {
  const d = loadCatalog().byNumber.get(36).data;
  assert.equal(d.effectType, 'Карта',
    `artist: effectType ожидало «Карта», факт «${d.effectType}»`);
  assert.equal(d.desc, '+10% заработок на выступлениях за уровень',
    `artist: desc ожидало «+10% заработок на выступлениях за уровень», факт «${d.desc}»`);
});

test('000280 V8: fright (000037) — effectType «Бой» + desc «5% за уровень шанс напугать моба уровнем ниже»', () => {
  const d = loadCatalog().byNumber.get(37).data;
  assert.equal(d.effectType, 'Бой',
    `fright: effectType ожидало «Бой», факт «${d.effectType}»`);
  assert.equal(d.desc, '5% за уровень шанс напугать моба уровнем ниже',
    `fright: desc ожидало «5% за уровень шанс напугать моба уровнем ниже», факт «${d.desc}»`);
});

// 000286 A1/A2 — антидрейф-пины двусторонних (контракт 000280 «НЕ ТРОГАТЬ»;
// allow-лист effectType :133 ловит только вне-enum-дрейф, value-пин — и
// смену на легитимное enum-значение; desc НЕ пинится — ТЗ просит ровно
// effectType; консьюмеры: potionPowerMult items.js:870/880 + craft.js:262,
// runePowerMult building-effects.js:975 + craft.js:263).

test('000286 A1: alchemy (000025) — effectType «Бой/Карта» (двусторонние, антидрейф)', () => {
  const d = loadCatalog().byNumber.get(25).data;
  assert.equal(d.effectType, 'Бой/Карта',
    `alchemy: effectType ожидало «Бой/Карта», факт «${d.effectType}»`);
});

test('000286 A2: runes (000027) — effectType «Бой/Карта» (двусторонние, антидрейф)', () => {
  const d = loadCatalog().byNumber.get(27).data;
  assert.equal(d.effectType, 'Бой/Карта',
    `runes: effectType ожидало «Бой/Карта», факт «${d.effectType}»`);
});

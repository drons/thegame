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

// Минимальный валидатор JSON-схем — общий модуль (задача 000015):
// tests/json-schema.js (допустимые ключи — ALLOWED_SCHEMA_KEYS).
const { validate, ALLOWED_SCHEMA_KEYS } = require('./json-schema.js');

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

// --- Задача 000045: игровой код заклинаний (TDD: красные тесты) ---
//
// Модули ещё не существуют — эти тесты падают до реализации. Ленивый
// require: отсутствие модуля не ломает старые тесты каталога (000023)
// в этом файле.

const { createCharacter } = require('../src/player.js');
const { createCombat, PRACTICE_XP } = require('../src/combat.js');

function loadSpells() { return require('../src/spells.js'); }
function loadSpellsData() { return require('../src/spells-data.js'); }

// --- Модуль-зеркало src/spells-data.js ---

test('spells-data.js: точное зеркало каталога JSON (16 заклинаний)', () => {
  const { SPELLS, SPELLS_BY_ID } = loadSpellsData();
  const files = listSpellFiles();
  assert.equal(files.length, 16, 'каталог: 16 файлов');
  assert.equal(SPELLS.length, 16, 'SPELLS — 16 заклинаний');
  assert.equal(Object.keys(SPELLS_BY_ID).length, 16, 'SPELLS_BY_ID — 16 id');
  // Порядок SPELLS = порядок файлов каталога; данные — дословно.
  files.forEach((f, i) => {
    const data = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
    assert.equal(SPELLS[i].id, data.id, `позиция ${i}: порядок файлов`);
    assert.deepEqual(SPELLS[i], data, `${f}: зеркало SPELLS не совпадает`);
    assert.deepEqual(SPELLS_BY_ID[data.id], data,
      `${f}: зеркало SPELLS_BY_ID не совпадает`);
  });
  // Обратное: все id модуля есть в каталоге.
  const { byId } = loadCatalog();
  for (const s of SPELLS) {
    assert.ok(byId.has(s.id), `id "${s.id}" из модуля нет в каталоге`);
  }
});

test('sync-spells-data.js: генератор существует, пересборка не меняет модуль', () => {
  const { execFileSync } = require('node:child_process');
  const script = path.join(__dirname, '..', 'scripts', 'sync-spells-data.js');
  assert.ok(fs.existsSync(script),
    'существует генератор scripts/sync-spells-data.js');
  const out = path.join(__dirname, '..', 'src', 'spells-data.js');
  const before = fs.readFileSync(out, 'utf8');
  execFileSync(process.execPath, [script], { cwd: path.join(__dirname, '..') });
  assert.equal(fs.readFileSync(out, 'utf8'), before,
    'пересборка меняет закоммиченный src/spells-data.js — перегенерируйте');
});

// --- src/spells.js: ранги школы ---

test('spells.js: SCHOOL_RANKS — таблица SPEC (совпадает с таблицей данных)', () => {
  const Sp = loadSpells();
  assert.deepEqual(Sp.SCHOOL_RANKS, SCHOOL_RANKS,
    'ранги школы обязаны совпадать с таблицей SPEC' +
      ' (1–10/11–25/26–50/51–100 → уровни 1..4)');
});

test('schoolRank: границы рангов, null для уровня < 1; rankAllowsTier', () => {
  const { schoolRank, rankAllowsTier } = loadSpells();
  const expect = (lvl, name, tier) => {
    assert.deepEqual(schoolRank(lvl), { name, tier }, `уровень ${lvl}`);
  };
  expect(1, 'Ученик', 1);   expect(10, 'Ученик', 1);
  expect(11, 'Знаток', 2);  expect(25, 'Знаток', 2);
  expect(26, 'Мастер', 3);  expect(50, 'Мастер', 3);
  expect(51, 'Аркимаг', 4); expect(100, 'Аркимаг', 4);
  assert.equal(schoolRank(0), null, 'уровень 0 — ранга нет');
  // rankAllowsTier: ранг открывает уровень заклинания.
  assert.equal(rankAllowsTier(10, 1), true);
  assert.equal(rankAllowsTier(10, 2), false);
  assert.equal(rankAllowsTier(11, 2), true);
  assert.equal(rankAllowsTier(25, 2), true);
  assert.equal(rankAllowsTier(25, 3), false);
  assert.equal(rankAllowsTier(26, 3), true);
  assert.equal(rankAllowsTier(50, 3), true);
  assert.equal(rankAllowsTier(50, 4), false);
  assert.equal(rankAllowsTier(51, 4), true);
  assert.equal(rankAllowsTier(100, 4), true);
  assert.equal(rankAllowsTier(0, 1), false);
});

// --- src/spells.js: книга заклинаний и изучение ---

test('книга: стартовая spark + mend; ленивая инициализация; knows', () => {
  const { bookOf, knows } = loadSpells();
  // Стартовая книга (задача 000045, отзыв ревью): аналоги старых кнопок
  // «Огонь»/«Исцел.» — без них кастовать нечего, а источников изучения
  // (книги/наставники/камни) в игре этой задачей не заводится.
  const p = createCharacter();
  assert.deepEqual(p.spells, ['spark', 'mend'], 'стартовая книга: Искра и Заговора');
  const { SPELLS_BY_ID } = loadSpellsData();
  for (const id of p.spells) {
    assert.ok(SPELLS_BY_ID[id], `стартовое заклинание "${id}" нет в каталоге`);
  }
  assert.ok(knows(p, 'spark'), 'knows: spark');
  assert.ok(knows(p, 'mend'), 'knows: mend');
  assert.ok(!knows(p, 'fireball'), 'knows: fireball не изучено');
  // Ленивая инициализация: «голый» объект без p.spells — bookOf создаёт.
  const bare = { primary: { intelligence: 1, wisdom: 1 }, secondary: {} };
  assert.equal(bare.spells, undefined, 'до bookOf поля нет');
  assert.deepEqual(bookOf(bare), []);
  assert.deepEqual(bare.spells, [], 'bookOf создал p.spells');
  assert.equal(bookOf(bare), bare.spells, 'возвращает тот же массив');
});

test('learn/canLearn: неизвестный id, уже изучено, мутация книги', () => {
  const { canLearn, learn } = loadSpells();
  const p = createCharacter();
  assert.deepEqual(canLearn(p, 'nope'), { ok: false, reason: 'неизвестное заклинание' });
  assert.deepEqual(learn(p, 'nope'), { ok: false, reason: 'неизвестное заклинание' });
  assert.equal(p.spells.length, 2, 'неудавшееся изучение не меняет книгу');
  // Уже изучено (spark — из стартовой книги).
  assert.deepEqual(canLearn(p, 'spark'), { ok: false, reason: 'уже изучено' });
  assert.deepEqual(learn(p, 'spark'), { ok: false, reason: 'уже изучено' });
  // fireball (уровень 2) — Знаток: Интеллект 11.
  p.primary.intelligence = 11;
  assert.equal(canLearn(p, 'fireball').ok, true, 'Знаток + уровень 2 — можно');
  const before = p.spells.length;
  const r = learn(p, 'fireball');
  assert.equal(r.ok, true);
  assert.equal(p.spells.length, before + 1, 'learn добавляет id в книгу');
  assert.ok(p.spells.includes('fireball'));
  // Повторно — «уже изучено», дублей в книге нет.
  assert.deepEqual(learn(p, 'fireball'), { ok: false, reason: 'уже изучено' });
  assert.equal(p.spells.filter((s) => s === 'fireball').length, 1,
    'дублей id в книге нет');
});

test('canLearn: ранг школы — по атрибуту заклинания (Интеллект/Мудрость)', () => {
  const { canLearn } = loadSpells();
  // Уровень 2 — Знаток: Интеллект 10 не хватает, 11 хватает.
  const p = createCharacter();
  p.primary.intelligence = 10;
  assert.equal(canLearn(p, 'fireball').reason, 'нужен ранг школы «Знаток»');
  // Уровень 1 — Ученик подходит: заклинание уровня 1 НЕ из стартовой
  // книги (spark/mend уже изучены — canLearn дал бы «уже изучено»).
  assert.equal(canLearn(p, 'frost_bolt').ok, true, 'уровень 1 — Ученик подходит');
  p.primary.intelligence = 11;
  assert.equal(canLearn(p, 'fireball').ok, true, 'Знаток открывает уровень 2');
  // Школа Мудрости — по Мудрости, а не Интеллекту.
  const p2 = createCharacter();
  p2.primary.intelligence = 99;
  p2.primary.wisdom = 10;
  assert.equal(canLearn(p2, 'light_heal').reason, 'нужен ранг школы «Знаток»');
  p2.primary.wisdom = 11;
  assert.equal(canLearn(p2, 'light_heal').ok, true, 'Мудрость 11 — можно');
  // Уровень 3 — Мастер (26), уровень 4 — Аркимаг (51).
  const p3 = createCharacter();
  p3.primary.intelligence = 25;
  assert.equal(canLearn(p3, 'flame_burst').reason, 'нужен ранг школы «Мастер»',
    'ранг проверяется ДО базы');
  p3.primary.intelligence = 26;
  p3.spells.push('fireball'); // база известна
  assert.equal(canLearn(p3, 'flame_burst').ok, true, 'Мастер + база — можно');
  const p4 = createCharacter();
  p4.primary.intelligence = 50;
  assert.equal(canLearn(p4, 'inferno').reason, 'нужен ранг школы «Аркимаг»');
});

test('canLearn: базовое заклинание для совершенствования', () => {
  const { canLearn } = loadSpells();
  const p = createCharacter();
  p.primary.intelligence = 26; // Мастер — хватает для flame_burst (ур. 3)
  assert.equal(canLearn(p, 'flame_burst').reason,
    'нужно базовое заклинание: Огненный шар');
  p.spells.push('fireball');
  assert.equal(canLearn(p, 'flame_burst').ok, true, 'база известна — можно');
  // inferno (база flame_burst): одного fireball мало.
  const p2 = createCharacter();
  p2.primary.intelligence = 51; // Аркимаг — хватает для inferno (ур. 4)
  p2.spells = ['fireball'];
  assert.equal(canLearn(p2, 'inferno').reason,
    'нужно базовое заклинание: Пламенный взрыв');
  p2.spells.push('flame_burst');
  assert.equal(canLearn(p2, 'inferno').ok, true);
});

test('canLearn: источник «rune» — Рунопись >= уровень заклинания', () => {
  const { canLearn } = loadSpells();
  const p = createCharacter(); // Рунопись 0
  // Заклинание уровня 1: без рунописи — нельзя, с — можно.
  assert.equal(canLearn(p, 'chill', 'rune').reason, 'нужна Рунопись 1');
  assert.equal(canLearn(p, 'chill', 'book').ok, true,
    'другие источники Рунопись не требуют');
  p.secondary.runes = 1;
  assert.equal(canLearn(p, 'chill', 'rune').ok, true, 'Рунопись 1 — можно');
  // Уровень 2 — Рунопись 2.
  const p2 = createCharacter();
  p2.primary.wisdom = 11; // Знаток — хватает для light_heal (ур. 2)
  p2.secondary.runes = 1;
  assert.equal(canLearn(p2, 'light_heal', 'rune').reason, 'нужна Рунопись 2');
  p2.secondary.runes = 2;
  assert.equal(canLearn(p2, 'light_heal', 'rune').ok, true, 'Рунопись 2 — можно');
});

// --- src/spells.js: цепочки «база» ---

test('цепочки: getSpell, chainRoot, chainSpells, highestKnown, activeSpells', () => {
  const { getSpell, chainRoot, chainSpells, highestKnown, activeSpells,
    SPELLS_BY_ID } = loadSpells();
  assert.deepEqual(getSpell('spark'), SPELLS_BY_ID.spark, 'getSpell — из каталога');
  assert.equal(getSpell('nope'), null, 'неизвестный id → null');
  assert.equal(getSpell(''), null);
  assert.equal(getSpell(null), null);
  // Цепочка fireball → flame_burst → inferno.
  assert.equal(chainRoot(getSpell('inferno')).id, 'fireball');
  assert.equal(chainRoot(getSpell('flame_burst')).id, 'fireball');
  assert.equal(chainRoot(getSpell('fireball')).id, 'fireball');
  assert.equal(chainRoot(getSpell('spark')).id, 'spark', 'одиночное — своя цепочка');
  assert.deepEqual(chainSpells('fireball').map((s) => s.id),
    ['fireball', 'flame_burst', 'inferno']);
  assert.deepEqual(chainSpells('spark').map((s) => s.id), ['spark']);
  // highestKnown: высшая ИЗВЕСТНАЯ степень цепочки.
  const p = createCharacter();
  p.spells = ['fireball', 'flame_burst'];
  assert.equal(highestKnown(p, getSpell('fireball')).id, 'flame_burst');
  assert.equal(highestKnown(p, getSpell('flame_burst')).id, 'flame_burst');
  p.spells.push('inferno');
  assert.equal(highestKnown(p, getSpell('flame_burst')).id, 'inferno');
  // Изучена только база — она сама.
  const p2 = createCharacter();
  p2.spells = ['fireball'];
  assert.equal(highestKnown(p2, getSpell('fireball')).id, 'fireball');
  // activeSpells: Map rootId → высшая известная степень.
  const p3 = createCharacter();
  p3.spells = ['spark', 'fireball', 'inferno', 'mend'];
  const active = activeSpells(p3);
  assert.ok(active instanceof Map, 'activeSpells — Map');
  assert.deepEqual([...active.keys()].sort(), ['fireball', 'mend', 'spark']);
  assert.equal(active.get('fireball').id, 'inferno', 'высшая известная степень');
  assert.equal(active.get('spark').id, 'spark');
  assert.equal(active.get('mend').id, 'mend');
  // Пустая книга — пустой набор.
  const p4 = { primary: { intelligence: 1, wisdom: 1 }, secondary: {}, spells: [] };
  assert.equal(activeSpells(p4).size, 0);
});

// --- src/spells.js: применение в бою (castSpell/canCastSpell) ---
//
// Формулы детерминированы (без RNG), зафиксированы задачей 000045:
//  * урон:     round((4 + 0.5*атрибут) * (1 + 0.15*(степень−1))
//              * (1 + schoolBonus)), schoolBonus: огонь → fireDamageBonus,
//              лёд → iceDamageBonus, иначе 0; всегда попадает, броня
//              моба игнорируется;
//  * лечение:  round((4 + 0.5*атрибут + level) * (1 + 0.15*(степень−1)))
//              (в каталоге все исцеления — Мудрость);
//  * защита:   c.ps.shield = { armor: 1 + степень, turns: 3 };
//  * ослабление: u.weaken = { mult: 0.75, turns: 3 };
//  * контроль: u.bind = { turns: 1 }.
// Пул действий — c.ps.spellInt/spellWis по spell.атрибут, мана — spell.мани.

// Фикстура: персонаж с изученными заклинаниями.
function spellHero({ spells, intelligence = 1, wisdom = 1, level = 1,
  mp = 30, secondary = {} } = {}) {
  const p = createCharacter();
  p.primary.intelligence = intelligence;
  p.primary.wisdom = wisdom;
  p.level = level;
  p.mp = mp;
  for (const [k, v] of Object.entries(secondary)) p.secondary[k] = v;
  p.spells = spells.slice();
  return p;
}

// Бой один-на-один (лидера нет — damageTakenMult = 1); цель вплотную —
// в дальности заклинаний (4).
function soloCombat(p, mobId = 'wolf') {
  const c = createCombat({ player: p, mobs: [mobId], mobLevel: 2, seed: 5 });
  const u = c.units[0];
  u.x = c.px; u.y = c.py - 1;
  return c;
}

test('castSpell: урон — формула, пул Интеллекта, мана, броня моба игнорируется', () => {
  const { castSpell } = loadSpells();
  const p = spellHero({ spells: ['spark'], intelligence: 10, mp: 30 });
  const c = soloCombat(p, 'orc_warrior'); // у воина броня >= 1
  const w = c.units[0];
  assert.ok(w.armor >= 1, 'воин без брони?');
  const poolBefore = c.ps.spellInt;
  const hpBefore = w.hp;
  const r = castSpell(c, 'spark', w.id);
  assert.equal(r.ok, true, r.reason);
  assert.equal(c.ps.spellInt, poolBefore - 1, 'пул Интеллекта −1');
  assert.equal(p.mp, 30 - 3, 'мана −3 (Искра)');
  const expected = Math.round((4 + 0.5 * p.primary.intelligence) * 1 * 1);
  assert.equal(r.dmg, expected, 'формула урона');
  assert.equal(hpBefore - w.hp, expected, 'броня моба игнорируется');
  assert.equal(r.spell.id, 'spark', 'в ответе — объект заклинания');
});

test('castSpell: урон — школьный бонус (огонь/лёд — Повелители, тень — нет)', () => {
  const { castSpell } = loadSpells();
  const base = { intelligence: 10, mp: 30 };
  const fire = spellHero({ spells: ['fireball'], ...base,
    secondary: { firelord: 5 } });
  const c1 = soloCombat(fire, 'wolf');
  assert.equal(castSpell(c1, 'fireball', c1.units[0].id).dmg,
    Math.round((4 + 0.5 * 10) * 1.25), 'огонь + Повелитель огня 5');
  const ice = spellHero({ spells: ['frost_bolt'], ...base,
    secondary: { icelord: 5 } });
  const c2 = soloCombat(ice, 'wolf');
  assert.equal(castSpell(c2, 'frost_bolt', c2.units[0].id).dmg,
    Math.round((4 + 0.5 * 10) * 1.25), 'лёд + Повелитель льда 5');
  const shadow = spellHero({ spells: ['shadow_bolt'], ...base,
    secondary: { firelord: 5, icelord: 5 } });
  const c3 = soloCombat(shadow, 'wolf');
  assert.equal(castSpell(c3, 'shadow_bolt', c3.units[0].id).dmg,
    Math.round(4 + 0.5 * 10), 'у тени школьного бонуса нет');
});

test('castSpell: степень масштабирует формулу; в бою — высшая степень цепочки', () => {
  const { castSpell, canCastSpell } = loadSpells();
  const p = spellHero({ spells: ['fireball', 'flame_burst'],
    intelligence: 10, mp: 40 });
  const c = soloCombat(p, 'wolf');
  // flame_burst (степень 2): round(9 * 1.15) = 10.
  const r = castSpell(c, 'flame_burst', c.units[0].id);
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.dmg, Math.round(9 * 1.15), 'множитель степени');
  assert.equal(p.mp, 40 - 10, 'мана = мани flame_burst (10)');
  // Известна более высокая степень — кастуется только она.
  const p2 = spellHero({ spells: ['fireball', 'inferno'],
    intelligence: 11, mp: 40 });
  const c2 = soloCombat(p2, 'wolf');
  assert.equal(castSpell(c2, 'fireball', c2.units[0].id).reason,
    'в бою действует высшая степень: Преисподняя');
  assert.equal(canCastSpell(c2, 'fireball', { targetId: c2.units[0].id }).reason,
    'в бою действует высшая степень: Преисподняя');
  assert.equal(canCastSpell(c2, 'inferno', { targetId: c2.units[0].id }).ok,
    true, 'высшая степень — кастуется');
});

test('castSpell: убийство последнего моба — победа', () => {
  const { castSpell } = loadSpells();
  const p = spellHero({ spells: ['spark'], intelligence: 10, mp: 30 });
  const c = soloCombat(p, 'wolf');
  const w = c.units[0];
  w.hp = 1;
  const r = castSpell(c, 'spark', w.id);
  assert.equal(r.ok, true, r.reason);
  assert.equal(w.alive, false);
  assert.equal(c.result.outcome, 'victory');
  assert.equal(c.phase, 'over');
});

test('castSpell: причины отказа (те же формулировки, что в ядре)', () => {
  const { castSpell } = loadSpells();
  const p = spellHero({ spells: ['spark'], intelligence: 10, mp: 30 });
  const c = soloCombat(p, 'wolf');
  const w = c.units[0];

  assert.equal(castSpell(c, 'nope').reason, 'неизвестное заклинание');
  assert.equal(castSpell(c, 'fireball').reason, 'заклинание не изучено');

  // Пул действий по атрибуту.
  c.ps.spellInt = 0;
  assert.equal(castSpell(c, 'spark', w.id).reason,
    'действий «Заклинание» (Интеллект) больше нет');
  c.ps.spellInt = 1;
  const cWis = soloCombat(
    spellHero({ spells: ['mend'], wisdom: 10, mp: 30 }), 'wolf');
  cWis.ps.spellWis = 0;
  assert.equal(castSpell(cWis, 'mend').reason,
    'действий «Заклинание» (Мудрость) больше нет');

  // Мана.
  const cMana = soloCombat(
    spellHero({ spells: ['spark'], intelligence: 10, mp: 2 }), 'wolf');
  assert.equal(castSpell(cMana, 'spark', cMana.units[0].id).reason,
    'не хватает маны (3)');
  const cMana2 = soloCombat(
    spellHero({ spells: ['inferno'], intelligence: 11, mp: 19 }), 'wolf');
  assert.equal(castSpell(cMana2, 'inferno', cMana2.units[0].id).reason,
    'не хватает маны (20)');

  // Дальность 4.
  w.y = c.py - 5;
  assert.equal(castSpell(c, 'spark', w.id).reason, 'цель слишком далеко (дальность 4)');
  w.y = c.py - 1;

  // Нет цели (мёртвая/сбежавшая цель, живой цели нет).
  w.alive = false;
  assert.equal(castSpell(c, 'spark', w.id).reason, 'нет цели');
  w.alive = true;
  w.fled = true;
  assert.equal(castSpell(c, 'spark').reason, 'нет цели',
    'без targetId — ближайший живой моб, его нет');
  w.fled = false;

  // Ход / блок / конец боя.
  c.phase = 'mob';
  assert.equal(castSpell(c, 'spark', w.id).reason, 'не ваш ход');
  c.phase = 'player';
  c.ps.blocked = true;
  assert.equal(castSpell(c, 'spark', w.id).reason, 'блок — только последнее действие');
  c.ps.blocked = false;
  c.phase = 'over';
  c.result = { outcome: 'victory', xp: 0, gold: 0, defeated: 1 };
  assert.equal(castSpell(c, 'spark', w.id).reason, 'бой закончен');
});

test('castSpell: лечение — формула, пул Мудрости, мана', () => {
  const { castSpell } = loadSpells();
  const p = spellHero({ spells: ['mend'], wisdom: 10, level: 1, mp: 30 });
  const c = soloCombat(p, 'wolf');
  p.hp = 5; // maxHP = 25 — кламп не сработает
  const poolBefore = c.ps.spellWis;
  const r = castSpell(c, 'mend');
  assert.equal(r.ok, true, r.reason);
  assert.equal(c.ps.spellWis, poolBefore - 1, 'пул Мудрости −1');
  assert.equal(p.mp, 30 - 3, 'мана −3 (Заговора)');
  const expected = Math.round((4 + 0.5 * p.primary.wisdom + p.level) * 1);
  assert.equal(r.healed, expected, 'формула лечения');
  assert.equal(p.hp, 5 + expected);
  // greater_heal (степень 2): round(10 * 1.15) = 12.
  const p2 = spellHero({ spells: ['light_heal', 'greater_heal'],
    wisdom: 10, level: 1, mp: 30 });
  const c2 = soloCombat(p2, 'wolf');
  p2.hp = 5;
  const r2 = castSpell(c2, 'greater_heal');
  assert.equal(r2.ok, true, r2.reason);
  assert.equal(r2.healed, 12, 'множитель степени');
  assert.equal(p2.mp, 30 - 11, 'мана = мани greater_heal (11)');
});

test('castSpell: защита — временный щит { armor: 1 + степень, turns: 3 }', () => {
  const { castSpell } = loadSpells();
  const p = spellHero({ spells: ['magic_shield'], wisdom: 10, mp: 30 });
  const c = soloCombat(p, 'wolf');
  const poolBefore = c.ps.spellWis;
  const r = castSpell(c, 'magic_shield');
  assert.equal(r.ok, true, r.reason);
  assert.deepEqual(c.ps.shield, { armor: 2, turns: 3 },
    'степень 1 → броня 2 на 3 раунда');
  assert.equal(c.ps.spellWis, poolBefore - 1);
  assert.equal(p.mp, 30 - 5, 'мана −5 (Магический щит)');
  assert.deepEqual(r.shield, { armor: 2, turns: 3 }, 'щит в ответе');
  // ward (степень 2) → броня 3.
  const p2 = spellHero({ spells: ['magic_shield', 'ward'], wisdom: 11, mp: 30 });
  const c2 = soloCombat(p2, 'wolf');
  const r2 = castSpell(c2, 'ward');
  assert.equal(r2.ok, true, r2.reason);
  assert.deepEqual(c2.ps.shield, { armor: 3, turns: 3 });
});

test('castSpell: ослабление — u.weaken { mult: 0.75, turns: 3 }', () => {
  const { castSpell } = loadSpells();
  const p = spellHero({ spells: ['chill'], intelligence: 10, mp: 30 });
  const c = soloCombat(p, 'wolf');
  const w = c.units[0];
  const r = castSpell(c, 'chill', w.id);
  assert.equal(r.ok, true, r.reason);
  assert.deepEqual(w.weaken, { mult: 0.75, turns: 3 });
  assert.equal(p.mp, 30 - 4, 'мана −4 (Хлад)');
});

test('castSpell: контроль — u.bind { turns: 1 }', () => {
  const { castSpell } = loadSpells();
  const p = spellHero({ spells: ['vine'], wisdom: 10, mp: 30 });
  const c = soloCombat(p, 'wolf');
  const w = c.units[0];
  const r = castSpell(c, 'vine', w.id);
  assert.equal(r.ok, true, r.reason);
  assert.deepEqual(w.bind, { turns: 1 });
  assert.equal(p.mp, 30 - 5, 'мана −5 (Плетень)');
});

test('castSpell: практика — мапа школа → навык (тень/защита — без практики)', () => {
  const { castSpell } = loadSpells();
  const cases = [
    ['spark', 'firelord', { intelligence: 10 }],
    ['frost_bolt', 'icelord', { intelligence: 10 }],
    ['mend', 'meditation', { wisdom: 10 }],
    ['nature_blessing', 'nature', { wisdom: 10 }],
  ];
  for (const [spell, skill, attrs] of cases) {
    const p = spellHero({ spells: [spell], mp: 30, ...attrs });
    const c = soloCombat(p, 'wolf');
    const r = castSpell(c, spell, c.units[0].id);
    assert.equal(r.ok, true, `${spell}: ${r.reason || ''}`);
    assert.equal(p.skillXp[skill], PRACTICE_XP.spell,
      `${spell} → практика «${skill}» (${PRACTICE_XP.spell} опыта)`);
    assert.ok(r.practice && r.practice.skill === skill,
      `${spell}: практика в ответе`);
  }
  // Школы Тень и Защита — соответствующего вторичного навыка нет.
  for (const [spell, attrs] of [
    ['chill', { intelligence: 10 }],
    ['magic_shield', { wisdom: 10 }],
  ]) {
    const p = spellHero({ spells: [spell], mp: 30, ...attrs });
    const c = soloCombat(p, 'wolf');
    const r = castSpell(c, spell, c.units[0].id);
    assert.equal(r.ok, true, `${spell}: ${r.reason || ''}`);
    assert.deepEqual(p.skillXp, {}, `${spell}: практики нет`);
  }
});

test('canCastSpell: зеркало castSpell — одна причина, одно поведение (000037)', () => {
  const { castSpell, canCastSpell } = loadSpells();
  // Сценарий: персонаж (+опциональный твик боя) → зеркало, затем ядро;
  // ok и reason обязаны совпасть.
  const check = (hero, id, targetId, tweak) => {
    const c = soloCombat(hero, 'wolf');
    if (tweak) tweak(c);
    const tid = targetId === undefined ? undefined
      : (targetId === 'target' ? c.units[0].id : targetId);
    const mirror = canCastSpell(c, id, tid != null ? { targetId: tid } : undefined);
    const core = castSpell(c, id, tid);
    assert.equal(mirror.ok, core.ok,
      `расхождение ok: ${id} (${core.reason || mirror.reason || 'ok'})`);
    if (!core.ok) {
      assert.equal(mirror.reason, core.reason, `расхождение reason: ${id}`);
    }
  };
  const hero = (spells, extra = {}) => spellHero(
    Object.assign({ spells, intelligence: 10, mp: 30 }, extra));
  check(hero(['spark']), 'spark', 'target');             // оба ok
  check(hero(['spark']), 'spark', 'target', (c) => { c.ps.spellInt = 0; }); // пул
  check(hero(['spark'], { mp: 2 }), 'spark', 'target');  // мана
  check(hero([]), 'spark', 'target');                    // не изучено
  check(hero(['spark']), 'spark', 'target',
    (c) => { c.units[0].y = c.py - 5; });                // дальность
  check(hero(['spark']), 'spark', 'target',
    (c) => { c.units[0].alive = false; });               // нет цели
  check(hero(['spark']), 'spark', 'target', (c) => { c.phase = 'mob'; });   // ход
  check(hero(['spark']), 'spark', 'target',
    (c) => { c.phase = 'over';
      c.result = { outcome: 'victory', xp: 0, gold: 0, defeated: 1 }; });   // конец
  check(hero(['fireball', 'inferno'], { intelligence: 11, mp: 40 }),
    'fireball', 'target');                               // высшая степень
  check(hero(['fireball', 'inferno'], { intelligence: 11, mp: 40 }),
    'inferno', 'target');                                // оба ok
  check(hero(['fireball', 'inferno'], { intelligence: 11, mp: 40 }),
    'mend', 'target');                                   // не изучено (мудрость)
  check(hero(['mend'], { wisdom: 10 }), 'mend');         // само-заклинание, оба ok
  check(hero(['spark']), 'nope', 'target');              // неизвестное
});

test('canCastSpell: без побочных эффектов (зеркало 000037)', () => {
  const { canCastSpell } = loadSpells();
  const p = spellHero({ spells: ['spark', 'fireball'], intelligence: 11, mp: 30 });
  const c = soloCombat(p, 'wolf');
  const w = c.units[0];
  let rngCalls = 0;
  const origRng = c._rng;
  c._rng = () => { rngCalls += 1; return origRng(); };
  const snap = () => JSON.stringify({
    ps: c.ps, hp: p.hp, mp: p.mp, inv: p.inventory, eq: p.equipment,
    log: c.log, targetId: c.targetId, spells: p.spells,
  });
  const before = snap();
  for (const id of ['spark', 'fireball', 'mend', 'magic_shield', 'nope']) {
    canCastSpell(c, id);
    canCastSpell(c, id, { targetId: w.id });
  }
  w.y = c.py - 5; // ветка дальности
  canCastSpell(c, 'spark', { targetId: w.id });
  assert.equal(rngCalls, 0, 'c._rng() не вызывается');
  assert.equal(snap(), before, 'состояние боя и героя не изменилось');
  // «Голый» персонаж без p.spells: зеркало книгу НЕ создаёт.
  const bare = {
    primary: {
      strength: 1, dexterity: 1, constitution: 1,
      intelligence: 1, wisdom: 1, charisma: 1,
    },
    secondary: {},
  };
  const c2 = createCombat({ player: bare, mobs: ['wolf'], mobLevel: 1, seed: 5 });
  const r = canCastSpell(c2, 'spark', { targetId: c2.units[0].id });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'заклинание не изучено');
  assert.equal(bare.spells, undefined,
    'p.spells не создаётся как побочный эффект');
});

// --- Задача 000045: правки по итогам ревью (раунд 1) ---
//
// Три потенциальных дефекта, невоспроизводимых на актуальном каталоге
// (схема/тесты данных их закрывают): каталог мутируется В ПАМЯТИ,
// восстановление — в finally.

test('castSpell: неизвестное действие — зеркало и без расхода (ревью, раунд 1)', () => {
  const { castSpell, canCastSpell } = loadSpells();
  const { SPELLS_BY_ID } = loadSpellsData();
  const spark = SPELLS_BY_ID.spark;
  const saved = spark.действие;
  try {
    // Мутация в памяти: в файле enum фиксирован схемой, но код обязан
    // НЕ тратить пул/ману при отказе, и canCastSpell обязан дать ту же
    // причину (зеркало 000037).
    spark.действие = 'телепорт';
    const p = spellHero({ spells: ['spark'], intelligence: 10, mp: 30 });
    const c = soloCombat(p, 'wolf');
    const w = c.units[0];
    const poolBefore = c.ps.spellInt;
    const mirror = canCastSpell(c, 'spark', { targetId: w.id });
    const core = castSpell(c, 'spark', w.id);
    assert.equal(core.ok, false, 'неизвестное действие — отказ');
    assert.equal(mirror.ok, false, 'зеркало: тот же отказ');
    assert.equal(mirror.reason, core.reason, 'зеркало: одна причина');
    assert.equal(core.reason, 'неизвестное действие: телепорт');
    assert.equal(c.ps.spellInt, poolBefore, 'пул при отказе не тратится');
    assert.equal(p.mp, 30, 'мана при отказе не тратится');
  } finally {
    spark.действие = saved;
  }
});

test('castSpell: лечение масшталируется от spell.атрибут (ревью, раунд 1)', () => {
  const { castSpell } = loadSpells();
  const { SPELLS_BY_ID } = loadSpellsData();
  const mend = SPELLS_BY_ID.mend;
  const saved = mend.атрибут;
  try {
    // Мутация в памяти: исцеление с атрибутом Интеллект. Формула лечения
    // обязана брать spell.атрибут (как урон), а не зашитую wisdom.
    mend.атрибут = 'intelligence';
    const p = spellHero({
      spells: ['mend'], wisdom: 1, intelligence: 10, level: 1, mp: 30,
    });
    const c = soloCombat(p, 'wolf');
    p.hp = 5; // maxHP = 25 — кламп не сработает
    const r = castSpell(c, 'mend');
    assert.equal(r.ok, true, r.reason);
    assert.equal(r.healed, Math.round((4 + 0.5 * 10 + 1) * 1),
      'лечение от Интеллекта (атрибут заклинания), а не от Wisdom');
  } finally {
    mend.атрибут = saved;
  }
});

test('цепочки: несколько улучшений одной базы — одна цепочка, без undefined-ключа (ревью, раунд 1)', () => {
  const dataMod = loadSpellsData();
  // Каталог в памяти: второе улучшение fireball (схема это разрешает,
  // тест 000023 единственность улучшения на базу не фиксирует).
  const extra = {
    id: 'fireball_alt', название: 'Искра шара', школа: 'огонь',
    база: 'fireball', степень: 2, атрибут: 'intelligence',
    уровень: 2, мани: 6, действие: 'урон',
    здания: [18], описание: 'тестовый вариант (ревью)',
  };
  try {
    dataMod.SPELLS.push(extra);
    dataMod.SPELLS_BY_ID[extra.id] = extra;
    // Цепочки предвычислены при загрузке модуля — пере-require spells.js
    // (spells-data тот же модуль, уже мутирован).
    delete require.cache[require.resolve('../src/spells.js')];
    const Sp = require('../src/spells.js');
    // Второе улучшение — часть цепочки fireball, а не «свой корень».
    assert.equal(Sp.chainRoot(Sp.getSpell('fireball_alt')).id, 'fireball');
    const p = spellHero({
      spells: ['fireball', 'flame_burst', 'fireball_alt'],
      intelligence: 10, mp: 40,
    });
    const active = Sp.activeSpells(p);
    assert.ok(!active.has(undefined), 'undefined-ключа в activeSpells нет');
    assert.deepEqual([...active.keys()].sort(), ['fireball'],
      'один ключ — корень цепочки');
    assert.ok(
      ['flame_burst', 'fireball_alt'].includes(active.get('fireball').id),
      'высшая известная степень');
    // В бою кастуется ровно одна степень 2: высшая известная (однозначный
    // выбор при равных степенях), вторая — отказ, база — отказ.
    const c = soloCombat(p, 'wolf');
    const w = c.units[0];
    const top = active.get('fireball').id;
    const other = top === 'flame_burst' ? 'fireball_alt' : 'flame_burst';
    assert.equal(Sp.canCastSpell(c, top, { targetId: w.id }).ok, true,
      'высшая степень — кастуется');
    const rOther = Sp.canCastSpell(c, other, { targetId: w.id });
    assert.equal(rOther.ok, false, 'вторая степень той же цепочки — нет');
    assert.match(rOther.reason, /высшая степень/);
    assert.equal(
      Sp.canCastSpell(c, 'fireball', { targetId: w.id }).ok, false,
      'база при известном улучшении — нет');
  } finally {
    const i = dataMod.SPELLS.lastIndexOf(extra);
    if (i >= 0) dataMod.SPELLS.splice(i, 1);
    delete dataMod.SPELLS_BY_ID[extra.id];
    // Модуль spells.js с исходным каталогом для последующих тестов.
    delete require.cache[require.resolve('../src/spells.js')];
    loadSpells();
  }
});

// Задача 000080: ИИ союзника (support) читает каталог заклинаний ЛЕНИВО
// через combatInternals.allySpells — UMD-ловушка 000038: в браузере
// combat.js грузится ДО spells-data.js/spells.js, поэтому spells.js
// обязан поставить каталог в combatInternals при загрузке (ОДНА строка,
// обе ветки UMD). Боевое поведение — tests/combat.test.js.
test('combatInternals.allySpells: каталог для ИИ союзников стоит после загрузки spells.js (задача 000080)', () => {
  loadSpells();
  const combat = require('../src/combat.js');
  assert.ok(combat.combatInternals, 'combatInternals экспортирован');
  assert.equal(
    combat.combatInternals.allySpells,
    require('../src/spells-data.js').SPELLS_BY_ID,
    'spells.js ставит каталог в combatInternals.allySpells при загрузке');
});

// Задача 000080, раунд ревью 1: явный targetId у целевых заклинаний
// (урон/ослабление/контроль) — СОЮЗНИК НЕ ЦЕЛЬ. Все пять путей
// прицеливания игрока в combat.js (selectTarget/attack/fire/
// canDoAction/move) защищены side-проверкой (пин
// memory/000080-ally-framework.md), но core-API spells.js (000045)
// side не проверял: castSpell(c, spell, idСоюзника) ставил союзнику
// hp = NaN (makeAlly не имел damageTakenMult → amount*undefined в
// dealDamageToMob) — неубиваемый (NaN<=0 false) и «нелечимый»
// (NaN перехватывал пул лечения support). Причина — «нет цели», как в
// combat.js playerAttack/playerSpell (000080); canCastSpell — зеркало
// (000037): та же причина БЕЗ расхода пула/маны (evalSpell отказывает
// ДО расхода).
test('castSpell: союзник как цель — отказ «нет цели», без расхода и NaN (000080, ревью)', () => {
  const { castSpell, canCastSpell } = loadSpells();
  const p = spellHero({ spells: ['shadow_bolt', 'chill'],
    intelligence: 10, mp: 30 });
  const c = createCombat({
    player: p, mobs: ['wolf'], mobLevel: 2, seed: 5,
    allies: [{ name: 'Вольк', role: 'melee', level: 1, dmg: 1.2,
      hp: 1.1, skills: [], spells: [] }],
  });
  const ally = c.units.find((u) => u.side === 'ally');
  assert.ok(ally, 'союзник в c.units');
  const pool = c.ps.spellInt, mp = p.mp, hpBefore = ally.hp;

  // Уронное заклинание с явным targetId — союзник не цель.
  const r = castSpell(c, 'shadow_bolt', ally.id);
  assert.equal(r.ok, false, 'каст по союзнику отклонён');
  assert.equal(r.reason, 'нет цели', 'та же причина, что в combat.js');
  // Отказ ДО расхода (evalSpell): пул и мана не тронуты.
  assert.equal(c.ps.spellInt, pool, 'пул не потрачен на отказ');
  assert.equal(p.mp, mp, 'мана не потрачена на отказ');
  // Союзник не задет: hp без NaN, жив, без статусов.
  assert.equal(ally.hp, hpBefore, 'hp союзника не изменилось (не NaN)');
  assert.equal(ally.alive, true, 'союзник жив');
  assert.equal(ally.weaken, undefined, 'без «ослабления» союзника');
  assert.equal(ally.bind, undefined, 'без «ковки» союзника');
  // Зеркало 000037: canCastSpell — одна и та же причина.
  assert.deepEqual(canCastSpell(c, 'shadow_bolt', { targetId: ally.id }),
    { ok: false, reason: 'нет цели' });
  // Неуронная целевая ветка (ослабление) — тот же отказ; guard на
  // уровне TARGETED, а не только урона.
  const r2 = castSpell(c, 'chill', ally.id);
  assert.equal(r2.ok, false, 'ослабление по союзнику отклонено');
  assert.equal(r2.reason, 'нет цели');
  assert.equal(c.ps.spellInt, pool, 'пул нетронут после второго отказа');
  // Контроль — тоже целевая ветка.
  const pVine = spellHero({ spells: ['vine'], intelligence: 10, mp: 30 });
  const cVine = createCombat({
    player: pVine, mobs: ['wolf'], mobLevel: 2, seed: 5,
    allies: [{ name: 'Вольк', role: 'melee', level: 1, dmg: 1.2,
      hp: 1.1, skills: [], spells: [] }],
  });
  const allyV = cVine.units.find((u) => u.side === 'ally');
  assert.equal(castSpell(cVine, 'vine', allyV.id).reason, 'нет цели');
});

// --- Задача 000133: E1 — e2e через ВЕСЬ index.html в vm ---
//
// КРАСНЫЙ: assets/items/000043.json (fireball_scroll) НЕ СУЩЕСТВУЕТ →
// G.addItem «неизвестный предмет»; ветка useItem spell_scroll
// (source «scroll», memory/000133-spell-scrolls-runes.md §2.4)
// не реализована в items.js. На зелёной стадии: свиток из каталога,
// useItem учит через G.Spells (ленивый Game), предмет тратится;
// изученное заклинание КАСТИРУЕТСЯ в бою (формула 000045, пул INT,
// мана) — hero.spells — единственный источник (контракт UX §6).
// Песочница — паттерн tests/building-effects.test.js (секция B):
// DOM/WebGL-стабы, map.png ВСЕГДА onerror → детерминированный
// generateSeedPixels, performance.now заморожен.

const vm = require('node:vm');

const E1_ROOT = path.join(__dirname, '..');
const E1_CHAIN = Array.from(
  fs.readFileSync(path.join(E1_ROOT, 'index.html'), 'utf8')
    .matchAll(/<script\s+src="([^"]+)"/g), (m) => m[1])
  .map((p) => p.replace(/^src\//, ''));
const E1_NOW = 1000;

function e1Gl() {
  const noop = () => {};
  const gl = {
    VERTEX_SHADER: 35633, FRAGMENT_SHADER: 35632,
    COMPILE_STATUS: 35713, LINK_STATUS: 35714,
    ARRAY_BUFFER: 34962, DYNAMIC_DRAW: 35048, FLOAT: 5126,
    COLOR_BUFFER_BIT: 1024, TRIANGLES: 4,
  };
  gl.createShader = () => ({});
  gl.shaderSource = noop;
  gl.compileShader = noop;
  gl.getShaderParameter = () => true;
  gl.getShaderInfoLog = () => '';
  gl.createProgram = () => ({});
  gl.attachShader = noop;
  gl.linkProgram = noop;
  gl.getProgramParameter = () => true;
  gl.getProgramInfoLog = () => '';
  gl.useProgram = noop;
  let attrib = 0;
  gl.getAttribLocation = () => attrib++;
  gl.getUniformLocation = () => ({});
  gl.enableVertexAttribArray = noop;
  gl.createBuffer = () => ({});
  gl.bindBuffer = noop;
  gl.bufferData = noop;
  gl.vertexAttribPointer = noop;
  gl.viewport = noop;
  gl.clearColor = noop;
  gl.clear = noop;
  gl.uniformMatrix4fv = noop;
  gl.drawArrays = noop;
  return gl;
}

function e1Context2d(el) {
  const calls = el.drawCalls = [];
  return new Proxy({}, {
    get: (t, k) => (k in t ? t[k] : (...args) => { calls.push([k, args]); }),
    set: (t, k, v) => { t[k] = v; return true; },
  });
}

function e1El(tag) {
  const target = {
    tagName: tag,
    className: '',
    _text: '',
    title: '',
    disabled: false,
    style: {},
    dataset: {},
    children: [],
    parent: null,
    listeners: {},
    appendChild(ch) {
      const raw = ch && ch.__raw ? ch.__raw : ch;
      if (raw.parent) {
        raw.parent.children.splice(raw.parent.children.indexOf(raw), 1);
      }
      raw.parent = target;
      target.children.push(raw);
      return ch;
    },
    remove() {
      if (!target.parent) return;
      const i = target.parent.children.indexOf(target);
      if (i >= 0) target.parent.children.splice(i, 1);
      target.parent = null;
    },
    addEventListener(type, fn) {
      (target.listeners[type] || (target.listeners[type] = [])).push(fn);
    },
    removeEventListener(type, fn) {
      const a = target.listeners[type];
      if (!a) return;
      const i = a.indexOf(fn);
      if (i >= 0) a.splice(i, 1);
    },
    setAttribute(name, value) {
      if (name.startsWith('data-')) {
        target.dataset[name.slice(5)] = value;
      }
    },
    getContext(kind) {
      if (tag !== 'canvas') return null;
      return kind === 'webgl' ? e1Gl() : e1Context2d(target);
    },
    getBoundingClientRect() { return { left: 0, top: 0 }; },
    blur() {},
  };
  Object.defineProperty(target, 'textContent', {
    get() { return this._text; },
    set(v) {
      this._text = String(v);
      for (const ch of target.children) ch.parent = null;
      target.children.length = 0;
    },
  });
  target.__raw = target;
  return new Proxy(target, {
    get(t, k) {
      if (k in t) return t[k];
      return () => undefined;
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

// Промывка микротасков (Image-load + loadMapPixels().then).
const e1Drain = () => new Promise((r) => setImmediate(r));

async function e1Boot() {
  const errors = [];
  const gameCanvas = e1El('canvas');
  const spriteCanvas = e1El('canvas');
  const hud = e1El('div');
  gameCanvas.getContext = (kind) => (kind === 'webgl'
    ? e1Gl() : e1Context2d(gameCanvas));
  spriteCanvas.getContext = (kind) => (kind === '2d'
    ? e1Context2d(spriteCanvas) : null);
  const storage = new Map();
  const body = e1El('body');
  const document = {
    createElement: (tag) => e1El(tag),
    getElementById: (id) => (
      id === 'game' ? gameCanvas
        : id === 'sprites' ? spriteCanvas
          : id === 'hud' ? hud
            : null),
    body,
    addEventListener() {},
    removeEventListener() {},
    querySelector: () => null,
    hidden: false,
  };
  const window = {
    innerWidth: 1280,
    innerHeight: 720,
    location: { search: '' },
    localStorage: {
      getItem: (k) => (storage.has(k) ? storage.get(k) : null),
      setItem: (k, v) => { storage.set(k, String(v)); },
      removeItem: (k) => { storage.delete(k); },
    },
    confirm: () => false,
    addEventListener() {},
    removeEventListener() {},
  };
  function Image() {
    const self = this;
    self.naturalWidth = 0;
    self.naturalHeight = 0;
    Object.defineProperty(self, 'src', {
      configurable: true,
      get() { return self.__src; },
      set(v) {
        self.__src = v;
        Promise.resolve().then(() => {
          if (v === 'assets/map.png') {
            if (typeof self.onerror === 'function') self.onerror();
          } else if (typeof self.onload === 'function') {
            self.onload();
          }
        });
      },
    });
  }
  const sandbox = {
    console: {
      warn: () => {},
      error: (m) => errors.push(String(m)),
      log: () => {},
    },
    document,
    window,
    Image,
    performance: { now: () => E1_NOW },
    requestAnimationFrame: () => 0,
    setTimeout: () => 0,
    clearTimeout: () => {},
  };
  vm.createContext(sandbox);
  for (const f of E1_CHAIN) {
    vm.runInContext(
      fs.readFileSync(path.join(E1_ROOT, 'src', f), 'utf8'), sandbox,
      { filename: f });
  }
  for (let i = 0; i < 5; i++) await e1Drain();
  return { sandbox, errors, hud };
}

test('E1. 000133: e2e — свиток: addItem → useItem «Изучено» → каст в бою (формула/мана/пул)', async () => {
  const h = await e1Boot();
  const G = h.sandbox.Game;
  assert.ok(G, 'Game-глобал собран цепочкой index.html');
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет: ' + h.errors.join('; '));
  // Герой: Интеллект 11 (Знаток — fireball tier 2 открыт), мана 30.
  const p = G.createCharacter();
  p.primary.intelligence = 11;
  p.mp = 30;
  // (a) Выдача свитка — КРАСНАЯ точка: файла 000043.json нет.
  const add = G.addItem(p, 'fireball_scroll', 1);
  assert.equal(add.ok, true,
    'выдача свитка (red: неизвестный предмет): ' + JSON.stringify(add));
  // (b) useItem — ветка spell_scroll (source «scroll»).
  const res = G.useItem(p, 'fireball_scroll');
  assert.equal(res.ok, true,
    'useItem ok (red: ветка spell_scroll не реализована): '
    + JSON.stringify(res));
  assert.ok(p.spells.includes('fireball'),
    'заклинание изучено (hero.spells — единственный источник)');
  assert.equal(G.totalQty(p, 'fireball_scroll'), 0, 'свиток тратится');
  assert.match(res.message, /Изучено/i, 'message: ' + res.message);
  // (c) Бой: изученное заклинание КАСТИРУЕТСЯ (000045).
  // Моб — Пещерный медведь (ур 2: maxHP 26, броня 1): hp ≥ dmg,
  // ПОТОМУ полные 10 ложатся на hp (волк maxHP 6 < 10 — кап 0,
  // assert «броня игнорируется» был бы неопределён); броня 1 —
  // проверка ignoreArmor (было бы 9, а не 10).
  const c = G.createCombat({ player: p, mobs: ['cave_bear'], mobLevel: 2,
    seed: 5 });
  const w = c.units[0];
  w.x = c.px;
  w.y = c.py - 1;
  const pool0 = c.ps.spellInt;
  const hp0 = w.hp;
  const r = G.Spells.castSpell(c, 'fireball', w.id);
  assert.equal(r.ok, true, 'каст ok: ' + JSON.stringify(r));
  assert.equal(r.dmg, Math.round(4 + 0.5 * 11),
    'формула round((4+0.5·11)·1·1) = 10 (степень 1, бонусов нет)');
  assert.equal(p.mp, 30 - 6, 'мана −6 (мани fireball)');
  assert.equal(c.ps.spellInt, pool0 - 1, 'пул Интеллекта −1');
  assert.equal(hp0 - w.hp, r.dmg, 'броня моба игнорируется');
});

// --- Задача 000163: заклинание «Воскрешение» — КРАСНЫЕ тесты (TDD) ---
//
// Контракты: memory/000163-resurrection-spell.md (§3 — форма и
// контракты, §4.1 — список), ТЗ tasks/pending/000163.md.
// КРАСНЫЕ: падают, пока НЕТ:
//  * assets/spells/000017.json (id 'resurrect', действие
//    «воскрешение») + schema.json (новое значение enum) +
//    регенерация src/spells-data.js (R1);
//  * ядра combatInternals.resurrectAlly (src/combat.js): alive=true,
//    hp=round(maxHP/2), лог «Возвращён в бой.», ноль c._rng (R2);
//  * действия «воскрешение» в src/spells.js: KNOWN_ACTIONS,
//    цель-правило evalSpell (мёртвый союзник c.units / мёртвый игрок,
//    дальность НЕ ограничена), ветка castSpell → resurrectAlly
//    (R3–R8);
//  * гейта неизвестного действия для нового значения (пин 000045, R9).
// Осмысленная краснота: ENOENT / undefined / «неизвестное заклинание»,
// НЕ синтаксис. EFIR_SPELL_UNLOCKS [22,'resurrect'] — E1 в
// tests/efir.test.js.

const { combatInternals } = require('../src/combat.js');
const { derived: derived163 } = require('../src/player.js');

// Бой с живым союзником (фикстура 000080; паттерны spellHero/soloCombat).
function allyCombat163(p) {
  return createCombat({
    player: p, mobs: ['wolf'], mobLevel: 2, seed: 5,
    allies: [{ name: 'Вольк', role: 'melee', level: 1, dmg: 1.2,
      hp: 1.1, skills: [], spells: [] }],
  });
}

function ally163(c) {
  const a = c.units.find((u) => u.side === 'ally');
  assert.ok(a, 'союзник в c.units');
  return a;
}

function mob163(c) {
  const m = c.units.find((u) => u.side === 'mob');
  assert.ok(m, 'моб в c.units');
  return m;
}

// Мёртвый союзник — через ядро (000112, экспорт combatInternals):
// hp 0, alive false, лог «…пал в бою!» (реальный путь гибели).
function deadAlly163(c) {
  const a = ally163(c);
  combatInternals.dealDamageToAlly(c, a, 9999);
  assert.equal(a.alive, false, 'фикстура: союзник мёртв');
  assert.equal(a.hp, 0, 'фикстура: hp 0');
  return a;
}

test('000163 R1: каталог 000017.json — 17-й файл, поля по ТЗ, схема (enum «воскрешение»), ссылки phoenix_feather/здания [21,36,37,38], зеркало SPELLS[16]/SPELLS_BY_ID.resurrect', () => {
  // (a) Нумерация: 000017.json — 17-й файл (краснота: файла нет).
  const files = listSpellFiles();
  assert.equal(files[16], '000017.json',
    'файл 000017.json — 17-й в каталоге (краснота: файла нет)');
  const data = JSON.parse(
    fs.readFileSync(path.join(DIR, '000017.json'), 'utf8'));
  // (b) Поля по ТЗ (контракт §3.1 memory/000163).
  assert.equal(data.id, 'resurrect');
  assert.equal(data.название, 'Воскрешение');
  assert.equal(data.школа, 'исцеление');
  assert.equal(data.база, null, 'база null (цепочки совершенствования нет)');
  assert.equal(data.степень, 1, 'база null ⇔ степень 1');
  assert.equal(data.атрибут, 'wisdom', 'исцеление → Мудрость');
  assert.equal(data.уровень, 3, 'уровень 3 — ранг «Мастер» исцеления');
  assert.equal(data.мани, 15);
  assert.equal(data.действие, 'воскрешение', 'НОВОЕ значение enum');
  assert.deepEqual(data.предметы, ['phoenix_feather'],
    'предмет: phoenix_feather (свиток НЕ здесь — 000165)');
  assert.deepEqual(data.здания, [21, 36, 37, 38],
    'здания: Храм исцеления (21) + храмы (36/37/38)');
  assert.ok(typeof data.описание === 'string'
    && data.описание.trim().length > 0, 'описание непустое');
  // (c) Валиден по schema.json: enum «действие» обязан содержать
  //     «воскрешение» (краснота: схемы ещё нет этого значения).
  const errors = [];
  validate(loadSchema(), data, '000017.json', errors);
  assert.deepEqual(errors, [], 'схема: ' + errors.join('; '));
  // (d) Ссылочная целостность (локально для 000017; дубль generic).
  assert.ok(getItem('phoenix_feather') !== null,
    'phoenix_feather — в каталоге assets/items');
  for (const b of data.здания) {
    assert.ok(getBuilding(b) !== null, 'здание ' + b + ' — в каталоге');
  }
  // (e) Зеркало src/spells-data.js (regen sync-spells-data.js).
  const { SPELLS, SPELLS_BY_ID } = loadSpellsData();
  assert.equal(SPELLS.length, 17, 'зеркало: 17 заклинаний');
  assert.deepEqual(SPELLS[16], data, 'SPELLS[16] — зеркало 000017.json');
  assert.deepEqual(SPELLS_BY_ID.resurrect, data, 'SPELLS_BY_ID.resurrect');
});

test('000163 R2: ядро combatInternals.resurrectAlly — мёртвый союзник/игрок: alive, hp=round(maxHP/2), лог «Возвращён в бой.», ноль c._rng, возврат hp', () => {
  // (a) КРАСНАЯ точка: экспорта ещё нет в combatInternals.
  assert.equal(typeof combatInternals.resurrectAlly, 'function',
    'resurrectAlly — в combatInternals (задача 000163)');
  // (b) Мёртвый союзник: alive=true, hp=round(u.maxHP/2), лог, ноль
  //     c._rng (детерминизм D3), мутации только alive/hp.
  {
    const p = spellHero({ spells: [], mp: 30 });
    const c = allyCombat163(p);
    const a = deadAlly163(c);
    const maxHP = a.maxHP;
    const keysBefore = Object.keys(a).sort();
    let rngCalls = 0;
    const origRng = c._rng;
    c._rng = () => { rngCalls += 1; return origRng(); };
    const r = combatInternals.resurrectAlly(c, a);
    assert.equal(a.alive, true, 'союзник возвращён (alive)');
    assert.equal(a.hp, Math.round(maxHP / 2), 'hp = round(maxHP/2)');
    assert.ok(c.log.includes('Возвращён в бой.'),
      'лог «Возвращён в бой.»: ' + c.log.join(' | '));
    assert.equal(rngCalls, 0, 'c._rng() не вызывается (детерминизм D3)');
    assert.equal(r, a.hp, 'возврат — новый hp (контракт R-4)');
    assert.deepEqual(Object.keys(a).sort(), keysBefore,
      'новых полей у юнита нет');
    assert.equal(a.fled, false, 'воскрешён — а не «сбежавший»');
    assert.equal(a.weaken, undefined, 'без нового статуса weaken');
    assert.equal(a.bind, undefined, 'без нового статуса bind');
  }
  // (c) Мёртвый ИГРОК (симуляция предсмертного состояния, R-8):
  //     maxHP — P.derived (у игрока поля maxHP НЕТ — только hp).
  {
    const p = spellHero({ spells: [], mp: 30 });
    const c = allyCombat163(p);
    p.alive = false;
    p.hp = 0;
    const maxHP = derived163(p).maxHP;
    const keysBefore = Object.keys(p).sort();
    let rngCalls = 0;
    const origRng = c._rng;
    c._rng = () => { rngCalls += 1; return origRng(); };
    const r = combatInternals.resurrectAlly(c, c.player);
    assert.equal(p.alive, true, 'игрок возвращён (alive)');
    assert.equal(p.hp, Math.round(maxHP / 2),
      'hp игрока = round(P.derived(p).maxHP/2)');
    assert.ok(c.log.includes('Возвращён в бой.'),
      'лог «Возвращён в бой.»: ' + c.log.join(' | '));
    assert.equal(rngCalls, 0, 'c._rng() не вызывается (детерминизм D3)');
    assert.equal(r, p.hp, 'возврат — новый hp');
    assert.deepEqual(Object.keys(p).sort(), keysBefore,
      'новых полей у игрока нет');
  }
});

test('000163 R3: castSpell «resurrect» на мёртвого союзника — ok, hp=round(maxHP/2), пул spellWis −1, мана −15, лог, out.hp, практика meditation', () => {
  const { castSpell } = loadSpells();
  const p = spellHero({ spells: ['resurrect'], wisdom: 10, mp: 30 });
  const c = allyCombat163(p);
  const a = deadAlly163(c);
  const maxHP = a.maxHP;
  const poolBefore = c.ps.spellWis;
  const r = castSpell(c, 'resurrect', a.id);
  assert.equal(r.ok, true,
    'каст ok (краснота: «неизвестное заклинание»): ' + (r.reason || ''));
  assert.equal(a.alive, true, 'союзник возвращён');
  assert.equal(a.hp, Math.round(maxHP / 2), 'hp = round(maxHP/2)');
  assert.equal(c.ps.spellWis, poolBefore - 1,
    'пул spellWis −1 (атрибут wisdom → ATTR_POOL)');
  assert.equal(p.mp, 30 - 15, 'мана −15 (мани каталога)');
  assert.ok(c.log.includes('Возвращён в бой.'),
    'лог «Возвращён в бой.»: ' + c.log.join(' | '));
  assert.equal(r.hp, a.hp, 'out.hp — новый hp (документированное поле)');
  assert.ok(r.practice && r.practice.skill === 'meditation',
    'практика по школе «исцеление» → meditation');
  assert.equal(p.skillXp.meditation, PRACTICE_XP.spell,
    'банк практики: +PRACTICE_XP.spell');
});

test('000163 R4: мёртвый ИГРОК через castSpell — автоцель-приоритет (без targetId); targetId союзника при мёртвом игроке — союзник', () => {
  const { castSpell } = loadSpells();
  // (a) Мёртвый игрок, союзники живы, без targetId → ИГРОК (приоритет).
  {
    const p = spellHero({ spells: ['resurrect'], wisdom: 10, mp: 30 });
    const c = allyCombat163(p);
    p.alive = false;
    p.hp = 0;
    const maxHP = derived163(p).maxHP;
    const r = castSpell(c, 'resurrect');
    assert.equal(r.ok, true,
      'каст на мёртвого игрока (краснота: «неизвестное заклинание»): '
      + (r.reason || ''));
    assert.equal(p.alive, true, 'игрок возвращён');
    assert.equal(p.hp, Math.round(maxHP / 2),
      'hp игрока = round(derived maxHP/2)');
    assert.equal(r.hp, p.hp, 'out.hp');
    const a = ally163(c);
    assert.equal(a.alive, true, 'живой союзник не задет');
  }
  // (b) Игрок И союзник мертвы, без targetId → ИГРОК (приоритет).
  {
    const p = spellHero({ spells: ['resurrect'], wisdom: 10, mp: 30 });
    const c = allyCombat163(p);
    p.alive = false;
    p.hp = 0;
    deadAlly163(c);
    const r = castSpell(c, 'resurrect');
    assert.equal(r.ok, true, r.reason || '');
    assert.equal(p.alive, true, 'игрок — приоритет автоцели');
    const a = ally163(c);
    assert.equal(a.alive, false, 'союзник не воскрешён (игрок приоритетнее)');
  }
  // (c) Игрок мёртв + явный targetId союзника → СОЮЗНИК (явная цель).
  {
    const p = spellHero({ spells: ['resurrect'], wisdom: 10, mp: 30 });
    const c = allyCombat163(p);
    p.alive = false;
    p.hp = 0;
    const a = deadAlly163(c);
    const r = castSpell(c, 'resurrect', a.id);
    assert.equal(r.ok, true, r.reason || '');
    assert.equal(a.alive, true, 'явный targetId — воскрешён союзник');
    assert.equal(p.alive, false, 'игрок НЕ воскрешён (явная цель)');
  }
});

test('000163 R5: отказы «resurrect» — живой союзник, targetId «player», без мёртвых: «нет цели», без расхода, зеркало', () => {
  const { castSpell, canCastSpell } = loadSpells();
  // (a) Живой союзник как явная цель — «нет цели».
  {
    const p = spellHero({ spells: ['resurrect'], wisdom: 10, mp: 30 });
    const c = allyCombat163(p);
    const a = ally163(c);
    const pool = c.ps.spellWis, mp = p.mp, hp = a.hp;
    const r = castSpell(c, 'resurrect', a.id);
    assert.equal(r.ok, false, 'живой союзник — не цель');
    assert.equal(r.reason, 'нет цели',
      'краснота: пока «неизвестное заклинание»');
    assert.equal(c.ps.spellWis, pool, 'пул не потрачен');
    assert.equal(p.mp, mp, 'мана не потрачена');
    assert.equal(a.alive, true, 'союзник жив');
    assert.equal(a.hp, hp, 'союзник не задет');
    assert.deepEqual(canCastSpell(c, 'resurrect', { targetId: a.id }),
      { ok: false, reason: 'нет цели' }, 'зеркало (000037)');
  }
  // (b) targetId «player» — выдуманная адресация (контракт R-1): игрок
  //     НЕ в c.units — «нет цели».
  {
    const p = spellHero({ spells: ['resurrect'], wisdom: 10, mp: 30 });
    const c = allyCombat163(p);
    const pool = c.ps.spellWis, mp = p.mp;
    const r = castSpell(c, 'resurrect', 'player');
    assert.equal(r.ok, false, 'targetId «player» — не цель (R-1)');
    assert.equal(r.reason, 'нет цели');
    assert.equal(c.ps.spellWis, pool, 'пул не потрачен');
    assert.equal(p.mp, mp, 'мана не потрачена');
    assert.deepEqual(canCastSpell(c, 'resurrect', { targetId: 'player' }),
      { ok: false, reason: 'нет цели' }, 'зеркало (R-1)');
  }
  // (c) Без targetId и без мёртвых (игрок и союзники живы) — «нет цели».
  {
    const p = spellHero({ spells: ['resurrect'], wisdom: 10, mp: 30 });
    const c = allyCombat163(p);
    const pool = c.ps.spellWis, mp = p.mp;
    const r = castSpell(c, 'resurrect');
    assert.equal(r.ok, false, 'без мёртвых — нет цели');
    assert.equal(r.reason, 'нет цели');
    assert.equal(c.ps.spellWis, pool, 'пул не потрачен');
    assert.equal(p.mp, mp, 'мана не потрачена');
    assert.deepEqual(canCastSpell(c, 'resurrect'),
      { ok: false, reason: 'нет цели' }, 'зеркало');
  }
});

test('000163 R6: каст «resurrect» на МОБА (живого/мёртвого) — «нет цели», без расхода, зеркало', () => {
  const { castSpell, canCastSpell } = loadSpells();
  const p = spellHero({ spells: ['resurrect'], wisdom: 10, mp: 30 });
  const c = allyCombat163(p);
  const w = mob163(c);
  const pool = c.ps.spellWis, mp = p.mp;
  // (a) Живой моб — не цель (только своя сторона).
  const r1 = castSpell(c, 'resurrect', w.id);
  assert.equal(r1.ok, false, 'моб — не цель');
  assert.equal(r1.reason, 'нет цели');
  assert.deepEqual(canCastSpell(c, 'resurrect', { targetId: w.id }),
    { ok: false, reason: 'нет цели' }, 'зеркало (живой моб)');
  assert.equal(c.ps.spellWis, pool, 'пул не потрачен');
  assert.equal(p.mp, mp, 'мана не потрачена');
  // (b) Мёртвый моб — тоже не цель.
  w.alive = false;
  w.hp = 0;
  const r2 = castSpell(c, 'resurrect', w.id);
  assert.equal(r2.ok, false, 'мёртвый моб — не цель');
  assert.equal(r2.reason, 'нет цели');
  assert.deepEqual(canCastSpell(c, 'resurrect', { targetId: w.id }),
    { ok: false, reason: 'нет цели' }, 'зеркало (мёртвый моб)');
  assert.equal(c.ps.spellWis, pool, 'пул не потрачен');
  assert.equal(p.mp, mp, 'мана не потрачена');
  assert.equal(w.alive, false, 'моб не воскрешён');
});

test('000163 R7: дальность НЕ ограничена — мёртвый союзник на unitDist > 4 (SPELL_MAX_DIST) — валидная цель', () => {
  const { castSpell, canCastSpell } = loadSpells();
  const p = spellHero({ spells: ['resurrect'], wisdom: 10, mp: 30 });
  const c = allyCombat163(p);
  const a = deadAlly163(c);
  // Игрок на (3,6) поля 7×7: клетка (0,0) → unitDist = 3 + 6 = 9 > 4.
  a.x = 0;
  a.y = 0;
  assert.ok(combatInternals.unitDist(c, a) > 4,
    'фикстура: дистанция > SPELL_MAX_DIST (4)');
  assert.equal(canCastSpell(c, 'resurrect', { targetId: a.id }).ok, true,
    'зеркало: дальности нет (краснота: «неизвестное заклинание»); '
    + 'после каталога — «цель слишком далеко» без исключения');
  const r = castSpell(c, 'resurrect', a.id);
  assert.equal(r.ok, true,
    'дальность для воскрешения не ограничена (спасательная механика, D3): '
    + (r.reason || ''));
  assert.equal(a.alive, true, 'союзник воскрешён');
  assert.equal(a.hp, Math.round(a.maxHP / 2), 'hp = round(maxHP/2)');
});

test('000163 R8: зеркало canCast/evalSpell «resurrect» — одна причина на всех сценариях (000037); canCast — без побочных эффектов', () => {
  const { castSpell, canCastSpell } = loadSpells();
  // Сценарий: (маркер targetId, tweak, expectOk) → зеркало, затем ядро;
  // ok и reason обязаны совпасть (паттерн зеркала 000037 этого файла),
  // expectOk — пин ИСХОДА сценария (краснота: валидный сценарий
  // отклоняется как «неизвестное заклинание»).
  const check = (tid, tweak, expectOk) => {
    const p = spellHero({ spells: ['resurrect'], wisdom: 10, mp: 30 });
    const c = allyCombat163(p);
    const a = ally163(c);
    const w = mob163(c);
    if (tweak) tweak(c, p, a, w);
    const id = tid === 'ally' ? a.id : (tid === 'mob' ? w.id : tid);
    const mirror = canCastSpell(
      c, 'resurrect', id != null ? { targetId: id } : undefined);
    const core = castSpell(c, 'resurrect', id);
    if (expectOk !== undefined) {
      assert.equal(core.ok, expectOk,
        'ожидалось ok=' + expectOk + ' (' + JSON.stringify(tid) + '): '
        + (core.reason || 'ok'));
    }
    assert.equal(mirror.ok, core.ok,
      'расхождение ok: ' + JSON.stringify(tid)
      + ' (' + (core.reason || mirror.reason || 'ok') + ')');
    if (!core.ok) {
      assert.equal(mirror.reason, core.reason,
        'расхождение reason: ' + JSON.stringify(tid));
    }
  };
  check('ally', (c, p, a) => { a.alive = false; a.hp = 0; }, true);  // мёртвый союзник — оба ok
  check(undefined, (c, p) => { p.alive = false; p.hp = 0; }, true);  // мёртвый игрок — оба ok
  check('ally', (c, p, a) => { a.alive = false; a.hp = 0;
    a.x = 0; a.y = 0; }, true);                                     // дальность > 4 — оба ok
  check('ally', undefined, false);                                  // живой союзник — нет цели
  check(undefined, undefined, false);                               // без мёртвых — нет цели
  check('mob', undefined, false);                                   // живой моб — нет цели
  check('mob', (c, p, a, w) => { w.alive = false; w.hp = 0; }, false); // мёртвый моб — нет цели
  check('player', undefined, false);                                // targetId «player» — нет цели (R-1)
  check('ally', (c, p, a) => { a.alive = false; a.hp = 0;
    c.ps.spellWis = 0; }, false);                                   // пул 0
  check('ally', (c, p, a) => { a.alive = false; a.hp = 0;
    p.mp = 14; }, false);                                           // мана < 15
  check('ally', (c, p, a) => { a.alive = false; a.hp = 0;
    p.spells = []; }, false);                                       // не изучено
  check('ally', (c, p, a) => { a.alive = false; a.hp = 0;
    c.phase = 'mob'; }, false);                                     // не ваш ход
  // canCast — без побочных эффектов: снимок состояния идентичен,
  // c._rng — 0 (паттерн «без побочных эффектов» 000037).
  {
    const p = spellHero({ spells: ['resurrect'], wisdom: 10, mp: 30 });
    const c = allyCombat163(p);
    const a = deadAlly163(c);
    const w = mob163(c);
    let rngCalls = 0;
    const origRng = c._rng;
    c._rng = () => { rngCalls += 1; return origRng(); };
    const snap = () => JSON.stringify({
      ps: c.ps, hp: p.hp, mp: p.mp, alive: p.alive,
      log: c.log, targetId: c.targetId, spells: p.spells,
      ally: { hp: a.hp, alive: a.alive, fled: a.fled },
    });
    const before = snap();
    for (const args of [undefined, { targetId: a.id },
      { targetId: 'player' }, { targetId: w.id }]) {
      canCastSpell(c, 'resurrect', args);
    }
    assert.equal(rngCalls, 0, 'c._rng() не вызывается');
    assert.equal(snap(), before, 'состояние боя и героя не изменилось');
  }
});

test('000163 R9: гейт неизвестного действия — «воскрешение» проходит (пин 000045); регрессия: мутация «телепорт» — отказ ДО расхода', () => {
  const { castSpell, canCastSpell } = loadSpells();
  const { SPELLS_BY_ID } = loadSpellsData();
  const spell = SPELLS_BY_ID.resurrect;
  assert.ok(spell, 'краснота: 000017 нет в зеркале (файл/реген отсутствуют)');
  // (a) «воскрешение» — известное действие: каст НЕ отвергается гейтом
  //     «неизвестное действие» (отказы — только цель/пул/мана).
  {
    const p = spellHero({ spells: ['resurrect'], wisdom: 10, mp: 30 });
    const c = allyCombat163(p);
    const a = deadAlly163(c);
    const r = castSpell(c, 'resurrect', a.id);
    assert.equal(r.ok, true, 'каст ok: ' + (r.reason || ''));
    for (const line of c.log) {
      assert.doesNotMatch(line, /неизвестное действие/,
        'гейт «неизвестное действие» не сработал: ' + line);
    }
  }
  // (b) РЕГРЕССИЯ пина 000045: мутация действия в памяти (finally —
  //     возврат) → отказ «неизвестное действие: телепорт» у ОБЕИХ
  //     точек ДО расхода пула/маны, одна причина (зеркало 000037).
  const saved = spell.действие;
  try {
    spell.действие = 'телепорт';
    const p = spellHero({ spells: ['resurrect'], wisdom: 10, mp: 30 });
    const c = allyCombat163(p);
    const a = deadAlly163(c);
    const poolBefore = c.ps.spellWis;
    const mirror = canCastSpell(c, 'resurrect', { targetId: a.id });
    const core = castSpell(c, 'resurrect', a.id);
    assert.equal(core.ok, false, 'неизвестное действие — отказ');
    assert.equal(mirror.ok, false, 'зеркало: тот же отказ');
    assert.equal(mirror.reason, core.reason, 'зеркало: одна причина');
    assert.equal(core.reason, 'неизвестное действие: телепорт');
    assert.equal(c.ps.spellWis, poolBefore, 'пул при отказе не тратится');
    assert.equal(p.mp, 30, 'мана при отказе не тратится');
    assert.equal(a.alive, false, 'союзник не воскрешён');
  } finally {
    spell.действие = saved;
  }
});

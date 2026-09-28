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
  assert.equal(canLearn(p, 'spark').ok, true, 'уровень 1 — Ученик подходит');
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
//  * лечение:  round((4 + 0.5*wisdom + level) * (1 + 0.15*(степень−1)));
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

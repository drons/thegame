// Каталог заклинаний (assets/spells) — задача 000023.
//
// Проверяем:
//  * нумерацию файлов 000001.json … N подряд, без чужих файлов;
//  * валидность каждого файла по assets/spells/schema.json (минимальный
//    валидатор, допустимые ключи — ALLOWED_SCHEMA_KEYS, задача 000015);
//  * правила каталога: уникальные id, «база null ⇔ степень 1»,
//    соответствие атрибута школе (spec/spells.md «Школы магии»),
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

// Школа → атрибут (spec/spells.md «Школы магии»).
const SCHOOL_ATTR = {
  'огонь': 'intelligence',
  'лёд': 'intelligence',
  'тень': 'intelligence',
  'исцеление': 'wisdom',
  'защита': 'wisdom',
  'природа': 'wisdom',
};

// Ранги школы (spec/spells.md «Ранги в школе»):
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
    const baseId = refId(data.база, REF_SPELLS, file);
    const base = byId.get(baseId);
    assert.ok(base, `${file}: базовое заклинание "${baseId}" нет в каталоге`);
    assert.notEqual(baseId, data.id, `${file}: цикл «база» на самом себе`);
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
    let curFile = file;
    let guard = 0;
    while (cur && cur.база !== null) {
      assert.ok(++guard <= byId.size, `${file}: цикл в цепочке совершенствований`);
      assert.ok(!seen.has(cur.id), `${file}: цикл на "${cur.id}"`);
      seen.add(cur.id);
      const entry = byId.get(refId(cur.база, REF_SPELLS, curFile));
      assert.ok(entry, `${file}: базовое заклинание цепочки нет в каталоге`);
      curFile = entry.file;
      cur = entry.data;
    }
  }
});

test('ссылки: «предметы» → assets/items, «здания» → assets/buildings', () => {
  const { byId } = loadCatalog();
  for (const { file, data } of byId.values()) {
    for (const it of (data.предметы || [])) {
      const id = refId(it, REF_ITEMS, file);
      assert.ok(getItem(id) !== null,
        `${file}: предмет "${id}" нет в каталоге assets/items`);
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

test('spells-data.js: точное зеркало каталога JSON (ровно 142 заклинания — ре-пин 000235.11: +25 волны Защита)', () => {
  const { SPELLS, SPELLS_BY_ID } = loadSpellsData();
  const files = listSpellFiles();
  assert.equal(files.length, 142, 'каталог: 142 файла (RED: 117)');
  assert.equal(SPELLS.length, 142, 'SPELLS — 142 заклинания (RED: 117)');
  assert.equal(Object.keys(SPELLS_BY_ID).length, 142, 'SPELLS_BY_ID — 142 id (RED: 117)');
  // Порядок SPELLS = порядок файлов каталога; данные — дословно
  // (в id-форме: ссылки резолвятся в id целевого файла, 000211.04).
  files.forEach((f, i) => {
    const data = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
    assert.equal(SPELLS[i].id, data.id, `позиция ${i}: порядок файлов`);
    assert.deepEqual(SPELLS[i], resolveSpell(data, f),
      `${f}: зеркало SPELLS не совпадает`);
    assert.deepEqual(SPELLS_BY_ID[data.id], resolveSpell(data, f),
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
    // причину (зеркало 000037). 000235.01: «телепорт» стало
    // известным действием — мутант на «прыжок» (истинно неизвестное).
    spark.действие = 'прыжок';
    const p = spellHero({ spells: ['spark'], intelligence: 10, mp: 30 });
    const c = soloCombat(p, 'wolf');
    const w = c.units[0];
    const poolBefore = c.ps.spellInt;
    const mirror = canCastSpell(c, 'spark', { targetId: w.id });
    const core = castSpell(c, 'spark', w.id);
    assert.equal(core.ok, false, 'неизвестное действие — отказ');
    assert.equal(mirror.ok, false, 'зеркало: тот же отказ');
    assert.equal(mirror.reason, core.reason, 'зеркало: одна причина');
    assert.equal(core.reason, 'неизвестное действие: прыжок');
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
  assert.deepEqual(
    data.предметы.map((it) => refId(it, REF_ITEMS, '000017.json')),
    ['phoenix_feather'],
    'предмет: phoenix_feather (свиток НЕ здесь — 000165)');
  assert.deepEqual(
    data.здания.map((b) => refId(b, REF_BUILDINGS, '000017.json')),
    [21, 36, 37, 38],
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
    const id = refId(b, REF_BUILDINGS, '000017.json');
    assert.ok(getBuilding(id) !== null, 'здание ' + id + ' — в каталоге');
  }
  // (e) Зеркало src/spells-data.js (regen sync-spells-data.js).
  const { SPELLS, SPELLS_BY_ID } = loadSpellsData();
  assert.equal(SPELLS.length, 142, 'зеркало: 142 заклинания (ре-пин 000235.11: +25 волны Защита; RED: 117)');
  assert.deepEqual(SPELLS[16], resolveSpell(data, '000017.json'),
    'SPELLS[16] — зеркало 000017.json');
  assert.deepEqual(SPELLS_BY_ID.resurrect, resolveSpell(data, '000017.json'),
    'SPELLS_BY_ID.resurrect');
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

test('000163 R9: гейт неизвестного действия — «воскрешение» проходит (пин 000045); регрессия: мутация «прыжок» — отказ ДО расхода', () => {
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
  //     возврат) → отказ «неизвестное действие: прыжок» у ОБЕИХ
  //     точек ДО расхода пула/маны, одна причина (зеркало 000037).
  //     000235.01: «телепорт» — известное действие, мутант — «прыжок».
  const saved = spell.действие;
  try {
    spell.действие = 'прыжок';
    const p = spellHero({ spells: ['resurrect'], wisdom: 10, mp: 30 });
    const c = allyCombat163(p);
    const a = deadAlly163(c);
    const poolBefore = c.ps.spellWis;
    const mirror = canCastSpell(c, 'resurrect', { targetId: a.id });
    const core = castSpell(c, 'resurrect', a.id);
    assert.equal(core.ok, false, 'неизвестное действие — отказ');
    assert.equal(mirror.ok, false, 'зеркало: тот же отказ');
    assert.equal(mirror.reason, core.reason, 'зеркало: одна причина');
    assert.equal(core.reason, 'неизвестное действие: прыжок');
    assert.equal(c.ps.spellWis, poolBefore, 'пул при отказе не тратится');
    assert.equal(p.mp, 30, 'мана при отказе не тратится');
    assert.equal(a.alive, false, 'союзник не воскрешён');
  } finally {
    spell.действие = saved;
  }
});

// --- Задача 000211.04: база/предметы/здания → ссылки на файлы каталогов ---
// (TDD, красные тесты)
//
// Контракт: memory/000211.04-spells-refs.md (формат ссылки — 000211 §2,
// memory/000211-spec-coverage-audit.md; прецеденты 000207/000208).
// Красная стадия: значения «база»/«предметы»/«здания» в 17 JSON ещё id
// (строки/числа), узлы schema.json — в старой форме (id-паттерн /
// integer 1..999999), sync-spells-data.js без резолвера ссылок — тесты
// ниже падают именно по этому (осмысленная краснота: форма данных и
// отсутствие резолвера, не синтаксис). Хелперы локальные (копия стиля
// 000208; прецедент: хелперы per-файл, НЕ scripts/lib/json-ref.js).

const { spawnSync } = require('node:child_process');
const os = require('node:os');
const SCRIPTS = path.join(__dirname, '..', 'scripts');

const REF_SPELLS = /^assets\/spells\/\d{6}\.json$/;
const REF_ITEMS = /^assets\/items\/\d{6}\.json$/;
const REF_BUILDINGS = /^assets\/buildings\/\d{6}\.json$/;
const REF_CACHE = new Map(); // ссылка → id цели (файл читается 1 раз)

// Ссылка → id целевого файла: ссылка по per-catalog паттерну, цель
// существует, парсится и имеет id (assert-вариант 1:1
// tests/craft.test.js:87-104; «без id» — data.id === undefined,
// не truthiness — id=0/число проходят).
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

// Заклинание в id-форме — та, что в зеркале src/spells-data.js и
// рантайме (то же преобразование, что resolveSpellData в
// sync-spells-data.js): поля-ссылки резолвятся в id целевого файла,
// остальные — те же значения (вход не мутируется). Ключ «предметы»
// опционален (6 файлов без него) — не домысливается; «база» — ternary
// на null; «здания» — required, всегда .map.
function resolveSpell(data, file) {
  return {
    ...data,
    база: data.база === null ? null : refId(data.база, REF_SPELLS, file),
    ...(Array.isArray(data.предметы)
      ? { предметы: data.предметы.map((it) => refId(it, REF_ITEMS, file)) }
      : {}),
    здания: data.здания.map((b) => refId(b, REF_BUILDINGS, file)),
  };
}

// Числовые id сырого каталога зданий (assets/buildings, 54 записи):
// membership «id в каталоге» — замена устаревшего range 1..50 (ТЗ п.4).
// Set.has — строгий: строка "17" не пройдёт (проверка типа включена).
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

// Фикстуры tmp-«репозитория» (паттерн 000208 R3: копия РЕАЛЬНОГО
// sync-spells-data.js — ROOT он резолвит из __dirname, CLI без
// root-аргумента). Заклинание в ссылочной форме (контракт §2):
// «база» — self-ссылка каталога spells, «предметы» → items,
// «здания» → buildings. Цель self-ссылки (000002.json) — тоже полный
// каталожный файл (скрипт обрабатывает ВСЕ файлы каталога): «база»
// null и БЕЗ опционального «предметы» — задел на guard.
const FIXTURE_SPELL = {
  id: 'flame_burst',
  'название': 'Пламенный взрыв',
  'школа': 'огонь',
  'база': 'assets/spells/000002.json',
  'степень': 2,
  'атрибут': 'intelligence',
  'уровень': 3,
  'мани': 10,
  'действие': 'урон',
  'предметы': ['assets/items/000001.json'],
  'здания': ['assets/buildings/000001.json'],
  'описание': 'Фикстура 000211.04: ссылки на файлы каталогов',
};

const FIXTURE_BASE_SPELL = {
  id: 'fireball',
  'название': 'Огненный шар',
  'школа': 'огонь',
  'база': null,
  'степень': 1,
  'атрибут': 'intelligence',
  'уровень': 2,
  'мани': 6,
  'действие': 'урон',
  'здания': ['assets/buildings/000001.json'],
  'описание': 'Фикстура 000211.04: цель self-ссылки «база»',
};

const FIXTURE_TARGETS = {
  items: { '000001.json': '{"id": "sulfur"}\n' },
  buildings: { '000001.json': '{"id": 17}\n' },
};

// tmp-«репозиторий»: копия реального sync-spells-data.js +
// write-atomic.js + фикстуры assets (заклинания в ссылочной форме).
function makeTmpSpellsRepo(spellFiles, targets) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spells-000211.04-'));
  for (const sub of ['scripts/lib', 'src', 'assets/spells',
                     'assets/items', 'assets/buildings']) {
    fs.mkdirSync(path.join(dir, sub), { recursive: true });
  }
  fs.copyFileSync(path.join(SCRIPTS, 'sync-spells-data.js'),
    path.join(dir, 'scripts', 'sync-spells-data.js'));
  fs.copyFileSync(path.join(SCRIPTS, 'lib', 'write-atomic.js'),
    path.join(dir, 'scripts', 'lib', 'write-atomic.js'));
  for (const [f, content] of Object.entries(spellFiles)) {
    fs.writeFileSync(path.join(dir, 'assets', 'spells', f), content, 'utf8');
  }
  for (const [sub, files] of Object.entries(targets)) {
    for (const [f, content] of Object.entries(files)) {
      fs.writeFileSync(path.join(dir, 'assets', sub, f), content, 'utf8');
    }
  }
  return dir;
}

test('000211.04 R1: schema.json — поля-ссылки закреплены per-catalog паттернами (§2)', () => {
  const schema = loadSchema();
  assert.deepEqual(schema.properties['база'].anyOf,
    [
      { type: 'string', pattern: '^assets/spells/\\d{6}\\.json$' },
      { type: 'null' },
    ],
    '«база» — ссылка на файл assets/spells (null-ветка сохраняется)');
  assert.deepEqual(schema.properties['предметы'].items,
    { type: 'string', pattern: '^assets/items/\\d{6}\\.json$' },
    '«предметы»[] — ссылка на файл assets/items');
  assert.deepEqual(schema.properties['здания'].items,
    { type: 'string', pattern: '^assets/buildings/\\d{6}\\.json$' },
    '«здания»[] — ссылка на файл assets/buildings (integer → string)');
});

test('000211.04 R2: 142 заклинания — база/предметы/здания — ссылки: per-catalog паттерн, резолв, id ∈ каталогу, id = значению зеркала (анти-вакуум 29/139/226 — ре-пин 000235.11: +25 волны Защита)', () => {
  const files = listSpellFiles();
  assert.equal(files.length, 142, 'каталог: 142 файла (ре-пин 000235.11: +25 волны Защита; RED: 117)');
  const { byId } = loadCatalog();
  const { SPELLS } = loadSpellsData();
  let baseRefs = 0;
  let itemRefs = 0;
  let buildingRefs = 0;
  let filesWithItems = 0;
  const baseTargets = new Set();
  const itemTargets = new Set();
  const buildingTargets = new Set();
  files.forEach((f, i) => {
    const data = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
    // «база»: self-ссылка каталога spells (null остаётся null).
    if (data.база !== null) {
      baseRefs += 1;
      const id = refId(data.база, REF_SPELLS, f);
      assert.ok(byId.has(id),
        `${f}: базовое заклинание id "${id}" нет в каталоге assets/spells`);
      assert.equal(id, SPELLS[i].база,
        `${f}: id цели «база» = прежнему значению (зеркало)`);
      baseTargets.add(id);
    } else {
      assert.equal(SPELLS[i].база, null,
        `${f}: «база» null — зеркало null`);
    }
    // «предметы» (опциональный ключ): ссылки каталога items.
    if (Array.isArray(data.предметы)) {
      filesWithItems += 1;
      const ids = data.предметы.map((it) => {
        itemRefs += 1;
        const id = refId(it, REF_ITEMS, f);
        assert.ok(getItem(id) !== null,
          `${f}: предмет id "${id}" нет в каталоге assets/items`);
        itemTargets.add(id);
        return id;
      });
      assert.deepEqual(ids, SPELLS[i].предметы,
        `${f}: id целей «предметы» = прежним значениям (зеркало)`);
    } else {
      assert.equal(SPELLS[i].предметы, undefined,
        `${f}: ключа «предметы» нет — зеркало доверительное (без ключа)`);
    }
    // «здания»: ссылки каталога buildings, id — член каталога.
    const bIds = data.здания.map((b) => {
      buildingRefs += 1;
      const id = refId(b, REF_BUILDINGS, f);
      assert.ok(BUILDING_IDS.has(id),
        `${f}: здание id=${id} нет в каталоге assets/buildings (membership)`);
      assert.ok(getBuilding(id) !== null,
        `${f}: здание id=${id} нет в зеркале buildings`);
      buildingTargets.add(id);
      return id;
    });
    assert.deepEqual(bIds, SPELLS[i].здания,
      `${f}: id целей «здания» = прежним значениям (зеркало)`);
  });
  // Анти-вакуум: точные счётчики ссылок (контракт §1/§2; ре-пин
  // 000235.11: +25 волны Защита — 3 новые base-ссылки/цели
  // (shield_wall→iron_bulwark, magical_barrier→ward,
  // iron_bastion→shield_wall), 25 item-ссылок/целей (свои свитки),
  // 75 building-ссылок без новых целей (000019/000021/000038 —
  // уже цели); 000235.10: +25 волны Исцеление — 3 base, 25 item,
  // 50 building; 000235.09: +25 волны Тень — 6 base, 25 item, 25 building).
  assert.equal(baseRefs, 29, 'анти-вакуум: ровно 29 base-ссылок (113 null) (ре-пин 000235.11: RED 26)');
  assert.equal(itemRefs, 139, 'анти-вакуум: 139 item-ссылок (ре-пин 000235.11: RED 114)');
  assert.equal(buildingRefs, 226, 'анти-вакуум: 226 building-ссылок (ре-пин 000235.11: RED 151)');
  assert.equal(baseRefs + itemRefs + buildingRefs, 394,
    'всего ссылок: 394 (29 + 139 + 226) (ре-пин 000235.11: RED 291)');
  assert.equal(filesWithItems, 136,
    'анти-вакуум: 136 файлов с «предметы» (6 без ключа) (ре-пин 000235.11: RED 111)');
  assert.equal(baseTargets.size, 29,
    'уникальные цели: 29 spells (26 прежних + iron_bulwark, ward, shield_wall) (ре-пин 000235.11: RED 26)');
  assert.equal(itemTargets.size, 128, 'уникальные цели: 128 items (ре-пин 000235.11: RED 103)');
  assert.equal(buildingTargets.size, 7, 'уникальные цели: 7 buildings (000019/000021/000038 уже цели)');
});

test('000211.04 R3: membership — здания: города 51–54 проходят, id вне каталога — нет; все building-ссылки — члены каталога', () => {
  // Отрицательный контроль — ДИНАМИЧЕСКИЙ (maxId из каталога, без
  // хардкода: каталог может расти; прецедент AR5).
  const maxId = Math.max(...BUILDING_IDS);
  assert.ok(!BUILDING_IDS.has(maxId + 1),
    'id за каталогом (max+1) — не член (membership)');
  assert.equal(getBuilding(maxId + 1), null,
    'getBuilding(max+1) — null');
  assert.ok(!BUILDING_IDS.has(0), 'id 0 — не член (membership)');
  // Положительный контроль: города 51–54 — ИМЕННО их старый range
  // 1..50 отклонял (смысл замены range на membership, ТЗ).
  for (const id of [51, 52, 53, 54]) {
    assert.ok(BUILDING_IDS.has(id),
      `город ${id} — член каталога buildings (membership)`);
    assert.ok(getBuilding(id) !== null, `getBuilding(${id}) ≠ null`);
  }
  // Все элементы «здания»[] 17 заклинаний — ссылки, резолвятся,
  // id — член каталога.
  for (const f of listSpellFiles()) {
    const data = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
    for (const b of data.здания) {
      const id = refId(b, REF_BUILDINGS, f);
      assert.ok(BUILDING_IDS.has(id),
        `${f}: здание id=${id} нет в каталоге assets/buildings (membership)`);
      assert.ok(getBuilding(id) !== null,
        `${f}: getBuilding(${id}) ≠ null`);
    }
  }
});

test('000211.04 R4: sync-spells-data.js запекает ссылки в id-форму (tmp-репозиторий)', () => {
  const dir = makeTmpSpellsRepo({
    '000001.json': JSON.stringify(FIXTURE_SPELL),
    '000002.json': JSON.stringify(FIXTURE_BASE_SPELL),
  }, FIXTURE_TARGETS);
  try {
    const script = path.join(dir, 'scripts', 'sync-spells-data.js');
    const run1 = spawnSync(process.execPath, [script], { encoding: 'utf8' });
    assert.equal(run1.status, 0,
      'sync-spells-data.js на tmp-репозитории со ссылочными данными: '
      + (run1.stdout || '') + (run1.stderr || ''));
    const out = path.join(dir, 'src', 'spells-data.js');
    const text = fs.readFileSync(out, 'utf8');
    // Данные модуля — РЕЗОЛВЕННАЯ id-форма: spells/items — строки,
    // здание — ЧИСЛО (id целевого файла).
    assert.match(text, /база: "fireball"/,
      '«база» — резолв-ид заклинания-цели');
    assert.match(text, /предметы: \["sulfur"\]/,
      '«предметы» — резолв-ид предмета');
    assert.match(text, /здания: \[17\]/,
      '«здания» — резолв-ид (число)');
    assert.doesNotMatch(text, /assets\/(items|buildings)\//,
      'в данных модуля нет сырых ссылок «assets/items|buildings»');
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

test('000211.04 R5: sync-spells-data.js — все 4 ветки fail-closed refId (не по формату / нет цели / не JSON / без id) → exit 1 + контекст в stderr', () => {
  // 1. Нет цели ссылки (000009.json — за максимальным номером фикстуры).
  {
    const spell = Object.assign({}, FIXTURE_SPELL,
      { 'база': 'assets/spells/000009.json' });
    const dir = makeTmpSpellsRepo({
      '000001.json': JSON.stringify(spell),
      '000002.json': JSON.stringify(FIXTURE_BASE_SPELL),
    }, FIXTURE_TARGETS);
    try {
      const r = spawnSync(process.execPath,
        [path.join(dir, 'scripts', 'sync-spells-data.js')],
        { encoding: 'utf8' });
      assert.equal(r.status, 1,
        'битая ссылка (нет цели) обязана дать exit 1: '
        + (r.stdout || '') + (r.stderr || ''));
      assert.match(r.stderr || '', /assets\/spells\/000009\.json/,
        'в stderr — имя битой ссылки (нет цели)');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
  // 2. Цель существует, но без верхнеуровневого id.
  {
    const targets = {
      items: { '000001.json': '{"name": "без id"}\n' },
      buildings: { '000001.json': '{"id": 17}\n' },
    };
    const dir = makeTmpSpellsRepo({
      '000001.json': JSON.stringify(FIXTURE_SPELL),
      '000002.json': JSON.stringify(FIXTURE_BASE_SPELL),
    }, targets);
    try {
      const r = spawnSync(process.execPath,
        [path.join(dir, 'scripts', 'sync-spells-data.js')],
        { encoding: 'utf8' });
      assert.equal(r.status, 1,
        'цель без id обязана дать exit 1: '
        + (r.stdout || '') + (r.stderr || ''));
      assert.match(r.stderr || '', /assets\/items\/000001\.json/,
        'в stderr — имя ссылки на цель без id');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
  // 3. Ссылка-строка вне паттерна каталога (без префикса assets/).
  {
    const spell = Object.assign({}, FIXTURE_SPELL,
      { 'база': 'spells/000002.json' });
    const dir = makeTmpSpellsRepo({
      '000001.json': JSON.stringify(spell),
      '000002.json': JSON.stringify(FIXTURE_BASE_SPELL),
    }, FIXTURE_TARGETS);
    try {
      const r = spawnSync(process.execPath,
        [path.join(dir, 'scripts', 'sync-spells-data.js')],
        { encoding: 'utf8' });
      assert.equal(r.status, 1,
        'ссылка вне паттерна обязана дать exit 1: '
        + (r.stdout || '') + (r.stderr || ''));
      assert.match(r.stderr || '', /не по формату/,
        'в stderr — «не по формату»');
      assert.match(r.stderr || '', /spells\/000002\.json/,
        'в stderr — имя ссылки вне паттерна');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
  // 4. Цель существует, но не JSON.
  {
    const targets = {
      items: { '000001.json': '{битый json\n' },
      buildings: { '000001.json': '{"id": 17}\n' },
    };
    const dir = makeTmpSpellsRepo({
      '000001.json': JSON.stringify(FIXTURE_SPELL),
      '000002.json': JSON.stringify(FIXTURE_BASE_SPELL),
    }, targets);
    try {
      const r = spawnSync(process.execPath,
        [path.join(dir, 'scripts', 'sync-spells-data.js')],
        { encoding: 'utf8' });
      assert.equal(r.status, 1,
        'цель не JSON обязана дать exit 1: '
        + (r.stdout || '') + (r.stderr || ''));
      assert.match(r.stderr || '', /не JSON/,
        'в stderr — «не JSON»');
      assert.match(r.stderr || '', /assets\/items\/000001\.json/,
        'в stderr — имя ссылки на цель не JSON');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

// --- Задача 000235.01: схема новых действий (TDD: красные тесты S1-S3) ---
//
// Контракт: memory/000235.01-spell-actions-core.md. Каталог ЭТОЙ
// задачей НЕ растёт (17 заклинаний, пин «ровно 17» :257-278 не
// меняется; контент — волны .07–.12); краснота — отсутствие в
// schema.json 7 новых действий и 2 новых опциональных полей (S1-S2)
// и гейта «внебоевое заклинание» в src/spells.js (поведенческая
// половина S3). Синтетические спеллы — в файловой (schema) форме;
// госты боевого каталога — инъекция в зеркало с restore в finally
// (паттерн fireball_alt :877-929).

// Полный синтетический спелл в форме schema.json (валиден по текущей
// схеме при старом enum «действия» — «урон»).
function ghostSpell0235(action, extra) {
  const s = {
    id: 'ghost_0235',
    название: 'Тестовое заклинание',
    школа: 'огонь',
    база: null,
    степень: 1,
    атрибут: 'intelligence',
    уровень: 1,
    мани: 3,
    действие: action,
    здания: ['assets/buildings/000001.json'],
    описание: 'Тестовое заклинание (000235.01)',
    icon: 'assets/spell-icons/ghost.svg',
    icon_prompt: 'Тестовая иконка (000235.01)',
  };
  return Object.assign(s, extra || {});
}

test('000235.01 S1: schema.json «действие» — ровно 13 значений (старые 6 + новые 7)', () => {
  const schema = loadSchema();
  const expected = ['урон', 'лечение', 'защита', 'ослабление', 'контроль',
    'воскрешение', 'баф', 'дебаф', 'призыв', 'создание', 'невидимость',
    'телепорт', 'внебой'];
  const enum13 = schema.properties['действие'].enum;
  assert.equal(enum13.length, 13, 'enum «действие» — 13 значений');
  assert.deepEqual(enum13.slice().sort(), expected.slice().sort(),
    'ровно: старые 6 без изменений + 7 новых');
});

test('000235.01 S2: «параметры» — опционально; additionalProperties:false; 8 ключей; чужой ключ — невалиден', () => {
  const schema = loadSchema();
  const params = schema.properties['параметры'];
  assert.ok(params, 'схема: есть опциональное поле «параметры»');
  assert.equal(params.type, 'object', 'параметры — object');
  assert.equal(params.additionalProperties, false,
    'параметры: additionalProperties false');
  assert.deepEqual(Object.keys(params.properties).sort(),
    ['days', 'mode', 'object', 'radius', 'stat', 'summon', 'turns', 'value'],
    'карта — ровно 8 ключей (контракт D1)');
  assert.ok(!schema.required.includes('параметры'),
    '«параметры» — опционально (не в required)');
  // Под-схемы 8 ключей (контракт §2): union 15 stat, границы.
  const stats = ['урон', 'броня', 'ход', 'реген', 'вампиризм', 'отражение',
    'попадание', 'получаемый_урон', 'иммунитет_контроля',
    'урон_вниз', 'броня_вниз', 'попадание_вниз', 'получаемый_урон_вверх',
    'dot', 'ход_вниз'];
  assert.deepEqual(params.properties.stat.enum.slice().sort(),
    stats.slice().sort(), 'stat — union 15 статов (9 баф + 6 дебаф)');
  assert.equal(params.properties.value.type, 'number', 'value — number');
  assert.equal(params.properties.value.minimum, 0, 'value ≥ 0');
  assert.equal(params.properties.turns.type, 'integer', 'turns — integer');
  assert.equal(params.properties.turns.minimum, 1, 'turns ≥ 1');
  assert.equal(params.properties.summon.type, 'string', 'summon — string');
  assert.equal(params.properties.summon.pattern, '^[a-z][a-z0-9_]*$',
    'summon — id-паттерн assets/mobs');
  assert.deepEqual(params.properties.object.enum.slice().sort(),
    ['стена', 'зона'].slice().sort(), 'object — enum стена|зона');
  assert.equal(params.properties.radius.type, 'integer', 'radius — integer');
  assert.equal(params.properties.radius.minimum, 1, 'radius ≥ 1');
  assert.equal(params.properties.radius.maximum, 5, 'radius ≤ 5');
  assert.equal(params.properties.days.type, 'integer', 'days — integer');
  assert.equal(params.properties.days.minimum, 1, 'days ≥ 1');
  assert.equal(params.properties.days.maximum, 3, 'days ≤ 3');
  assert.deepEqual(params.properties.mode.enum.slice().sort(),
    ['метка_установить', 'метка_вернуться', 'город'].slice().sort(),
    'mode — enum 3 значения');
  // Поведенческая половина: синтетические спеллы по схеме.
  const all8 = { stat: 'урон', value: 0.25, turns: 3, summon: 'wolf',
    object: 'стена', radius: 1, days: 1, mode: 'город' };
  const errs = (data) => {
    const e = [];
    validate(schema, data, '$', e);
    return e;
  };
  assert.deepEqual(
    errs(ghostSpell0235('баф', { параметры: all8 })),
    [], 'все 8 ключей своих формах — валиден');
  assert.ok(errs(ghostSpell0235('баф',
    { параметры: Object.assign({}, all8, { duration: 3 }) }))
    .some((e) => e.includes('лишнее поле «duration»')),
    'чужой ключ в «параметрах» — невалиден');
  for (const bad of [
    { stat: 'урон', turns: 0 },           // turns ≥ 1
    { stat: 'урон', value: -1 },          // value ≥ 0
    { stat: 'урон', radius: 6 },          // radius ≤ 5
    { stat: 'нет_такого', value: 1, turns: 1 }, // stat вне enum
    { stat: 'урон', value: 1, turns: 1, days: 4 }, // days ≤ 3
  ]) {
    assert.ok(errs(ghostSpell0235('баф', { параметры: bad })).length > 0,
      'несоответствующий «параметры» — невалиден: ' + JSON.stringify(bad));
  }
  // 17 заклинаний каталога без «параметры» по-прежнему валидны —
  // опциональность закреплена (и тестом «каждый файл валиден»).
  assert.deepEqual(errs(ghostSpell0235('баф')), [],
    'спелл без «параметры» — валиден');
});

test('000235.01 S3: «вне_боя» — опционально, default false; required — те же 13; в бою отказ «внебоевое заклинание» до расхода', () => {
  const schema = loadSchema();
  assert.deepEqual(schema.properties['вне_боя'], { type: 'boolean' },
    '«вне_боя» — boolean');
  assert.ok(!schema.required.includes('вне_боя'),
    '«вне_боя» — опционально (не в required)');
  assert.deepEqual(schema.required.slice().sort(),
    ['id', 'название', 'школа', 'база', 'степень', 'атрибут', 'уровень',
      'мани', 'действие', 'здания', 'описание', 'icon', 'icon_prompt']
      .slice().sort(),
    'required — те же 13 полей, без изменений');
  // Поведенческий default: в 17 заклинаниях каталога флага нет —
  // false; гейт — по ДЕЙСТВИЮ (не по флагу): «телепорт» БЕЗ вне_боя
  // в бою — отказ ДО расхода пула/маны (зеркало 000037).
  const dataMod = loadSpellsData();
  for (const s of dataMod.SPELLS.slice(0, 17)) {
    assert.ok(!s.вне_боя, `${s.id}: «вне_боя» отсутствует/false`);
  }
  const ghost = {
    id: 'ghost_tport', название: 'Тестовый телепорт', школа: 'тень',
    база: null, степень: 1, атрибут: 'intelligence', уровень: 1,
    мани: 3, действие: 'телепорт',
    здания: ['assets/buildings/000001.json'],
    описание: 'Тестовое заклинание (000235.01)',
    icon: 'assets/spell-icons/ghost.svg',
    icon_prompt: 'Тестовая иконка (000235.01)',
    параметры: { mode: 'город' },
  };
  try {
    dataMod.SPELLS.push(ghost);
    dataMod.SPELLS_BY_ID[ghost.id] = ghost;
    const { castSpell, canCastSpell } = loadSpells();
    const p = spellHero({ spells: ['ghost_tport'], intelligence: 10, mp: 30 });
    const c = soloCombat(p, 'wolf');
    const poolBefore = c.ps.spellInt;
    const mirror = canCastSpell(c, 'ghost_tport');
    const core = castSpell(c, 'ghost_tport');
    assert.equal(core.ok, false, 'в бою внебоевое заклинание не кастуется');
    assert.equal(core.reason, 'внебоевое заклинание',
      'гейт по действию — до расхода пула/маны');
    assert.equal(mirror.ok, false, 'зеркало: тот же отказ');
    assert.equal(mirror.reason, core.reason, 'зеркало: одна причина');
    assert.equal(c.ps.spellInt, poolBefore, 'пул при отказе не тратится');
    assert.equal(p.mp, 30, 'мана при отказе не тратится');
  } finally {
    const i = dataMod.SPELLS.lastIndexOf(ghost);
    if (i >= 0) dataMod.SPELLS.splice(i, 1);
    delete dataMod.SPELLS_BY_ID[ghost.id];
  }
});

// --- Задача 000235.02: каст вне боя (TDD: красные тесты) ---
//
// 3 НОВЫХ экспорта src/spells.js: castOutOfCombat(p, spellId, day, ctx),
// expireOutOfCombatEffects(effects, day),
// sanitizeOutOfCombatEffects(list). Контракт:
// memory/000235.02-spellbook-out-of-combat.md §2.1-2.3 (Д-1/Д-2).
// Гость — полная форма каталога + «вне_боя: true» (инъекция по
// паттерну S3 с restore в finally; пины «ровно 17» НЕ ТРОГАТЬ —
// инъекция только внутри try/finally). RED: экспорт отсутствует
// (TypeError: … is not a function — осмысленно, не синтаксис).

function ocGuest0235(id, over = {}) {
  return Object.assign({
    id,
    название: 'Тестовое заклинание (000235.02)',
    школа: 'тень',
    база: null,
    степень: 1,
    атрибут: 'intelligence',
    уровень: 1,
    мани: 5,
    действие: 'внебой',
    вне_боя: true,
    параметры: { days: 2 },
    здания: ['assets/buildings/000001.json'],
    описание: 'Тестовое заклинание (000235.02)',
    icon: 'assets/spell-icons/ghost.svg',
    icon_prompt: 'Тестовая иконка (000235.02)',
  }, over);
}

function pushOcGuests(dataMod, guests) {
  for (const g of guests) {
    dataMod.SPELLS.push(g);
    dataMod.SPELLS_BY_ID[g.id] = g;
  }
}

function popOcGuests(dataMod, guests) {
  for (const g of guests) {
    const i = dataMod.SPELLS.lastIndexOf(g);
    if (i >= 0) dataMod.SPELLS.splice(i, 1);
    delete dataMod.SPELLS_BY_ID[g.id];
  }
}

test('000235.02 OC1: castOutOfCombat успех — мана ровно «мани», запись {spellId, expiresDay: day+days}; телепорт — дней НЕТ, записи НЕТ', () => {
  const dataMod = loadSpellsData();
  const g1 = ocGuest0235('oc_g1'); // внебой, days 2, мани 5
  const gT = ocGuest0235('oc_g1_t', {
    действие: 'телепорт', параметры: { mode: 'город' },
  });
  try {
    pushOcGuests(dataMod, [g1, gT]);
    const { castOutOfCombat } = loadSpells();
    const p = spellHero({ spells: [g1.id, gT.id], mp: 30 });
    const r = castOutOfCombat(p, g1.id, 10);
    assert.equal(r.ok, true, 'каст вне боя — ok');
    assert.equal(r.expiresDay, 12, 'expiresDay = day + days (10 + 2)');
    assert.ok(r.spell && r.spell.id === g1.id,
      'возврат {ok, spell, expiresDay}');
    assert.equal(p.mp, 25, 'мана ровно по «мани» (5)');
    assert.deepEqual(p.outOfCombatEffects,
      [{ spellId: g1.id, expiresDay: 12 }],
      'запись {spellId, expiresDay} создана');
    const rt = castOutOfCombat(p, gT.id, 10);
    assert.equal(rt.ok, true, 'телепорт (вне_боя) — кастуется');
    assert.equal(rt.expiresDay, null,
      'телепорт — мгновенное, дней НЕТ → expiresDay null');
    assert.equal(p.mp, 20, 'телепорт тоже снял манию');
    assert.deepEqual(p.outOfCombatEffects,
      [{ spellId: g1.id, expiresDay: 12 }],
      'телепорт НЕ создаёт запись (запись — только при валидных days)');
  } finally {
    popOcGuests(dataMod, [g1, gT]);
  }
});

test('000235.02 OC2: castOutOfCombat «не хватает маны» — состояние НЕ изменилось (поле не создано, мана не снята)', () => {
  const dataMod = loadSpellsData();
  const g1 = ocGuest0235('oc_g2'); // мани 5
  try {
    pushOcGuests(dataMod, [g1]);
    const { castOutOfCombat } = loadSpells();
    const p = spellHero({ spells: [g1.id], mp: 4 });
    const r = castOutOfCombat(p, g1.id, 10);
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'не хватает маны', 'одна причина (форма 000037)');
    assert.equal(p.mp, 4, 'при отказе мана не снимается');
    assert.equal(p.outOfCombatEffects, undefined,
      'при отказе поле НЕ создаётся (мутации — ПОСЛЕ всех проверок)');
  } finally {
    popOcGuests(dataMod, [g1]);
  }
});

test('000235.02 OC3: фильтр по ФЛАГУ вне_боя — боевое заклинание «боевое заклинание», гость с флагом — кастуется (пара в одном тесте)', () => {
  const dataMod = loadSpellsData();
  const g1 = ocGuest0235('oc_g3');
  try {
    pushOcGuests(dataMod, [g1]);
    const { castOutOfCombat } = loadSpells();
    const p = spellHero({ spells: ['spark', g1.id], mp: 30 });
    const rc = castOutOfCombat(p, 'spark', 10);
    assert.equal(rc.ok, false);
    assert.equal(rc.reason, 'боевое заклинание',
      'отказ именно по флагу вне_боя (гейт .01 по ДЕЙСТВИЮ в бою — не тронут)');
    assert.equal(p.mp, 30, 'отказ — до расхода');
    assert.equal(p.outOfCombatEffects, undefined);
    const ro = castOutOfCombat(p, g1.id, 10);
    assert.equal(ro.ok, true, 'гость с вне_боя: true — кастуется');
  } finally {
    popOcGuests(dataMod, [g1]);
  }
});

test('000235.02 OC4: причины — «заклинание не изучено» (гость в каталоге, не в книге) и «неизвестное заклинание» (id не в каталоге)', () => {
  const dataMod = loadSpellsData();
  const g1 = ocGuest0235('oc_g4');
  try {
    pushOcGuests(dataMod, [g1]);
    const { castOutOfCombat } = loadSpells();
    const p = spellHero({ spells: ['spark'], mp: 30 });
    const r1 = castOutOfCombat(p, g1.id, 10);
    assert.equal(r1.ok, false);
    assert.equal(r1.reason, 'заклинание не изучено');
    const r2 = castOutOfCombat(p, 'нет_такого_заклинания', 10);
    assert.equal(r2.ok, false);
    assert.equal(r2.reason, 'неизвестное заклинание');
    assert.equal(p.mp, 30, 'отказы — без расхода');
    assert.equal(p.outOfCombatEffects, undefined, 'отказы — без мутаций');
  } finally {
    popOcGuests(dataMod, [g1]);
  }
});

test('000235.02 OC5: перезаклинание — ОБНОВЛЕНИЕ (не дубль), кулдаунов НЕТ (второй каст в тот же день)', () => {
  const dataMod = loadSpellsData();
  const g3 = ocGuest0235('oc_g5', { мани: 3 }); // days 2
  try {
    pushOcGuests(dataMod, [g3]);
    const { castOutOfCombat } = loadSpells();
    const p = spellHero({ spells: [g3.id], mp: 30 });
    const r1 = castOutOfCombat(p, g3.id, 10);
    assert.equal(r1.ok, true);
    const r2 = castOutOfCombat(p, g3.id, 10); // тот же день
    assert.equal(r2.ok, true,
      'кулдаунов НЕТ: второй каст в тот же день (мана есть)');
    assert.equal(p.mp, 24, 'мана снята дважды (3 + 3)');
    assert.equal(p.outOfCombatEffects.length, 1,
      'ОДНА запись (обновление in place, не дубль)');
    assert.deepEqual(p.outOfCombatEffects[0],
      { spellId: g3.id, expiresDay: 12 },
      'expiresDay пересчитан (day + days)');
  } finally {
    popOcGuests(dataMod, [g3]);
  }
});

test('000235.02 OC6: expireOutOfCombatEffects — чистый: не-массив → [], expiresDay <= day вылетает (граница), живёт ровно days дней', () => {
  const { expireOutOfCombatEffects } = loadSpells();
  assert.deepEqual(expireOutOfCombatEffects(undefined, 5), [],
    'не-массив → []');
  assert.deepEqual(expireOutOfCombatEffects(null, 5), [], 'null → []');
  assert.deepEqual(expireOutOfCombatEffects('бито', 5), [], 'мусор → []');
  const eff = [
    { spellId: 'a', expiresDay: 5 }, // граница: 5 <= 5 → вылетел
    { spellId: 'b', expiresDay: 6 }, // жив
    { spellId: 'c', expiresDay: 9 }, // жив
  ];
  const out = expireOutOfCombatEffects(eff, 5);
  assert.deepEqual(out,
    [{ spellId: 'b', expiresDay: 6 }, { spellId: 'c', expiresDay: 9 }],
    'expiresDay <= day удалены, остальные — с сохранением порядка');
  assert.notEqual(out, eff, 'НОВЫЙ массив (аргумент не мутируется)');
  assert.equal(eff.length, 3, 'аргумент не мутирован');
  // Каст в день D с days=N: expiresDay = D+N; активен на D..D+N-1.
  const one = [{ spellId: 'a', expiresDay: 1 + 1 }]; // каст 1, days 1
  assert.deepEqual(expireOutOfCombatEffects(one, 1),
    [{ spellId: 'a', expiresDay: 2 }], 'день D — жив');
  assert.deepEqual(expireOutOfCombatEffects(one, 2), [],
    'onDay(D+N) — вылетел');
});

test('000235.02 OC7: sanitizeOutOfCombatEffects — не-массив → []; призрачные id / не-целые / ≤0 expiresDay / не-объекты отброшены; порядок; дубликат spellId — последний wins (поз. первого вхождения)', () => {
  const { sanitizeOutOfCombatEffects } = loadSpells();
  assert.deepEqual(sanitizeOutOfCombatEffects(undefined), [],
    'старый сейв без поля → [] (append-only v1, без бампа)');
  assert.deepEqual(sanitizeOutOfCombatEffects(null), [], 'null → []');
  assert.deepEqual(sanitizeOutOfCombatEffects('бито'), [],
    'не-массив → []');
  assert.deepEqual(sanitizeOutOfCombatEffects([
    { spellId: 'нет_такого_заклинания', expiresDay: 5 }, // призрак
    { spellId: 'spark', expiresDay: -1 }, // ≤ 0
    { spellId: 'spark', expiresDay: NaN }, // не-конечное
    'мусор', // не-объект
    null,
    { spellId: 'mend', expiresDay: 3 }, // валиден
  ]),
  [{ spellId: 'mend', expiresDay: 3 }],
  'невалидные записи отброшены (каталог SPELLS_BY_ID — источник)');
  assert.deepEqual(sanitizeOutOfCombatEffects([
    { spellId: 'spark', expiresDay: 2 },
    { spellId: 'mend', expiresDay: 4 },
    { spellId: 'spark', expiresDay: 6 },
  ]),
  [
    { spellId: 'spark', expiresDay: 6 },
    { spellId: 'mend', expiresDay: 4 },
  ],
  'дубликат spellId — последний wins (позиция первого вхождения), '
  + 'порядок сохранён');
});

// --- Задача 000235.03: невидимость — механика (TDD: красные тесты IV1-IV4) ---
//
// 2 НОВЫХ экспорта src/spells.js (контракт:
// memory/000235.03-invisibility-mechanic.md §2.1/§2.2, Д-1/Д-5):
//   * isHeroInvisible(hero, day) → boolean — true ⇔ в
//     hero.outOfCombatEffects есть запись, чей spellId мапится на
//     действие 'невидимость' и expiresDay > day (граница — зеркало
//     expireOutOfCombatEffects .02);
//   * clearInvisibility(hero) → void — выносит ВСЕ записи действия
//     'невидимость'; переприсваивает поле только если что-то снято
//     (иначе идентичность массива не меняется); поле, которого не
//     было, не создаёт; не-массив/null — no-op.
// Матчинг — по ДЕЙСТВИЮ (ленивый lookup SPELLS_BY_ID в момент вызова),
// не по id (Д-1: id решается контентной волной .09; цепочки-
// совершенствований могут дать НОВОЕ id с тем же действием;
// guest-инъекции live видны без перезагрузки).
// Гость — полная форма каталога: школа 'тень', действие
// 'невидимость', вне_боя: true, параметры {days} (инъекция по
// паттерну ocGuest0235 pushOcGuests/popOcGuests, restore в finally;
// пины «ровно 17» не трогаются).
// RED: экспорт отсутствует (assert typeof — осмысленно, не синтаксис);
// запись/мана — уже зелёное ядро .02.

function invGuest0235(id, over = {}) {
  return Object.assign({
    id,
    название: 'Тестовое заклинание (000235.03)',
    школа: 'тень',
    база: null,
    степень: 1,
    атрибут: 'intelligence',
    уровень: 2,
    мани: 5,
    действие: 'невидимость',
    вне_боя: true,
    параметры: { days: 1 },
    здания: ['assets/buildings/000001.json'],
    описание: 'Тестовое заклинание (000235.03)',
    icon: 'assets/spell-icons/ghost.svg',
    icon_prompt: 'Тестовая иконка (000235.03)',
  }, over);
}

test('000235.03 IV1: isHeroInvisible — запись «невидимость» expiresDay = day+1 → true; граница expiresDay = day → false; < day → false; нет поля / [] → false; чужое действие («внебой» активен) → false; null / мусор-записи → false без краха', () => {
  const dataMod = loadSpellsData();
  const inv = invGuest0235('iv1_inv'); // «невидимость», days 1
  const out = ocGuest0235('iv1_out');  // «внебой», days 2
  try {
    pushOcGuests(dataMod, [inv, out]);
    const { isHeroInvisible } = loadSpells();
    assert.equal(typeof isHeroInvisible, 'function',
      '000235.03: export Spells.isHeroInvisible (src/spells.js)');
    const day = 10;
    assert.equal(isHeroInvisible(
      { outOfCombatEffects: [{ spellId: inv.id, expiresDay: day + 1 }] }, day),
      true, 'активная запись (expiresDay = day+1) — true');
    assert.equal(isHeroInvisible(
      { outOfCombatEffects: [{ spellId: inv.id, expiresDay: day }] }, day),
      false, 'граница: expiresDay === day — false (зеркало истечения .02)');
    assert.equal(isHeroInvisible(
      { outOfCombatEffects: [{ spellId: inv.id, expiresDay: day - 1 }] }, day),
      false, 'истёкшая запись (expiresDay < day) — false');
    assert.equal(isHeroInvisible({}, day), false, 'нет поля — false');
    assert.equal(isHeroInvisible({ outOfCombatEffects: [] }, day), false,
      'пустой массив — false');
    assert.equal(isHeroInvisible(
      { outOfCombatEffects: [{ spellId: out.id, expiresDay: day + 2 }] }, day),
      false, 'чужое действие («внебой» активен) — false');
    assert.equal(isHeroInvisible(null, day), false, 'hero = null — false');
    assert.equal(isHeroInvisible(
      { outOfCombatEffects: [
        null, 'мусор', 42,
        { expiresDay: day + 1 },
        { spellId: 'нет_такого_заклинания', expiresDay: day + 1 },
      ] }, day),
      false, 'мусор-записи — false без краха');
  } finally {
    popOcGuests(dataMod, [inv, out]);
  }
});

test('000235.03 IV2: clearInvisibility — удаляет ТОЛЬКО «невидимость» (оба id — по действию, соседняя запись жива, порядок сохранён); без записи — no-op (идентичность массива, чужие живут); поля нет — не создаёт; не-массив — без краха', () => {
  const dataMod = loadSpellsData();
  const invA = invGuest0235('iv2_inv_a');
  const invB = invGuest0235('iv2_inv_b', { параметры: { days: 2 } });
  const out = ocGuest0235('iv2_out');
  try {
    pushOcGuests(dataMod, [invA, invB, out]);
    const { clearInvisibility } = loadSpells();
    assert.equal(typeof clearInvisibility, 'function',
      '000235.03: export Spells.clearInvisibility (src/spells.js)');
    const arr = [
      { spellId: out.id, expiresDay: 12 },
      { spellId: invA.id, expiresDay: 11 },
      { spellId: invB.id, expiresDay: 13 },
    ];
    const p1 = { outOfCombatEffects: arr };
    clearInvisibility(p1);
    assert.deepEqual(p1.outOfCombatEffects,
      [{ spellId: out.id, expiresDay: 12 }],
      'вынесены ТОЛЬКО записи «невидимость» (оба id — матчинг по '
      + 'действию, Д-1); соседняя «внебой» жива, порядок сохранён');
    assert.notEqual(p1.outOfCombatEffects, arr,
      'успех — переприсвоение (новый массив)');
    const arr2 = [{ spellId: out.id, expiresDay: 12 }];
    const p2 = { outOfCombatEffects: arr2 };
    clearInvisibility(p2);
    assert.equal(p2.outOfCombatEffects, arr2,
      'no-op: идентичность массива не меняется (чистые пути)');
    assert.deepEqual(p2.outOfCombatEffects,
      [{ spellId: out.id, expiresDay: 12 }], 'чужие записи живут');
    const p3 = {};
    clearInvisibility(p3);
    assert.equal(p3.outOfCombatEffects, undefined,
      'поля, которого не было, НЕ создаёт');
    const p4 = { outOfCombatEffects: 'бито' };
    clearInvisibility(p4);
    assert.equal(p4.outOfCombatEffects, 'бито', 'не-массив — no-op');
    clearInvisibility(null); // null — без краха
  } finally {
    popOcGuests(dataMod, [invA, invB, out]);
  }
});

test('000235.03 IV3: установка — castOutOfCombat действия «невидимость» (days 1..3): ok, запись {spellId, expiresDay: day+days}, мана ровно «мани», isHeroInvisible → true; перезаклинание — обновление in place (без дубля); «не хватает маны» — без мутаций; без days — «неполные параметры: days» (пин DURATION_ACTIONS)', () => {
  const dataMod = loadSpellsData();
  const inv1 = invGuest0235('iv3_d1'); // days 1, мани 5
  const inv3 = invGuest0235('iv3_d3', { параметры: { days: 3 } });
  const invN = invGuest0235('iv3_nd', { параметры: {} });
  try {
    pushOcGuests(dataMod, [inv1, inv3, invN]);
    const { castOutOfCombat, isHeroInvisible } = loadSpells();
    assert.equal(typeof isHeroInvisible, 'function',
      '000235.03: export Spells.isHeroInvisible (src/spells.js)');
    const day = 10;
    const p = spellHero({ spells: [inv1.id, inv3.id, invN.id], mp: 30 });
    const r1 = castOutOfCombat(p, inv1.id, day);
    assert.equal(r1.ok, true, 'каст действия «невидимость» — ok');
    assert.equal(r1.expiresDay, day + 1, 'days 1 → expiresDay = day+1');
    assert.equal(p.mp, 25, 'мана ровно «мани» (5)');
    assert.deepEqual(p.outOfCombatEffects,
      [{ spellId: inv1.id, expiresDay: day + 1 }], 'запись создана');
    assert.equal(isHeroInvisible(p, day), true,
      'после каста — isHeroInvisible true (день каста)');
    const r2 = castOutOfCombat(p, inv1.id, day); // перезаклинание, тот же день
    assert.equal(r2.ok, true, 'кулдаунов НЕТ: второй каст в тот же день');
    assert.equal(p.outOfCombatEffects.length, 1,
      'перезаклинание — ОБНОВЛЕНИЕ in place (без дубля)');
    assert.equal(p.mp, 20, 'мана снята дважды (5 + 5)');
    const r3 = castOutOfCombat(p, inv3.id, day);
    assert.equal(r3.ok, true, 'days 3 — ok');
    assert.equal(r3.expiresDay, day + 3, 'days 3 → expiresDay = day+3');
    assert.equal(p.outOfCombatEffects.length, 2,
      'другой spellId — вторая запись');
    assert.equal(isHeroInvisible(p, day), true,
      'две активные записи — true');
    const pPoor = spellHero({ spells: [inv1.id], mp: 4 });
    const r4 = castOutOfCombat(pPoor, inv1.id, day);
    assert.equal(r4.ok, false);
    assert.equal(r4.reason, 'не хватает маны');
    assert.equal(pPoor.mp, 4, 'при отказе мана не снимается');
    assert.equal(pPoor.outOfCombatEffects, undefined,
      'при отказе поле НЕ создаётся');
    const pN = spellHero({ spells: [invN.id], mp: 30 });
    const r5 = castOutOfCombat(pN, invN.id, day);
    assert.equal(r5.ok, false, 'без параметров.days — fail-closed');
    assert.equal(r5.reason, 'неполные параметры: days',
      'пин: DURATION_ACTIONS несёт действие «невидимость» (не только '
      + '«внебой» — пин .02)');
    assert.equal(pN.mp, 30, 'отказ — до расхода');
    assert.equal(pN.outOfCombatEffects, undefined, 'отказ — без мутаций');
  } finally {
    popOcGuests(dataMod, [inv1, inv3, invN]);
  }
});

test('000235.03 IV4: снятие-примитив (триггеры «атака» / «вступление в бой»): каст → isHeroInvisible true → clearInvisibility → false (запись вынесена, чужие живы); повтор — no-op (идентичность)', () => {
  const dataMod = loadSpellsData();
  const inv = invGuest0235('iv4_inv', { параметры: { days: 2 } });
  const out = ocGuest0235('iv4_out');
  try {
    pushOcGuests(dataMod, [inv, out]);
    const { castOutOfCombat, isHeroInvisible, clearInvisibility }
      = loadSpells();
    assert.equal(typeof isHeroInvisible, 'function',
      '000235.03: export Spells.isHeroInvisible (src/spells.js)');
    assert.equal(typeof clearInvisibility, 'function',
      '000235.03: export Spells.clearInvisibility (src/spells.js)');
    const p = spellHero({ spells: [inv.id, out.id], mp: 30 });
    assert.equal(castOutOfCombat(p, out.id, 10).ok, true, 'фикстура: «внебой»');
    assert.equal(castOutOfCombat(p, inv.id, 10).ok, true,
      'фикстура: «невидимость» (expiresDay 12)');
    assert.equal(isHeroInvisible(p, 10), true, 'после каста — невидим');
    clearInvisibility(p);
    assert.equal(isHeroInvisible(p, 10), false,
      'после clearInvisibility — видим (примитив, который вызывают '
      + 'хуки старта боя main.js)');
    assert.deepEqual(p.outOfCombatEffects,
      [{ spellId: out.id, expiresDay: 12 }],
      'запись «невидимость» вынесена; соседняя «внебой» жива');
    const arr = p.outOfCombatEffects;
    clearInvisibility(p);
    assert.equal(p.outOfCombatEffects, arr, 'повтор — no-op (идентичность)');
    assert.equal(isHeroInvisible(p, 10), false, 'повтор — всё ещё видим');
  } finally {
    popOcGuests(dataMod, [inv, out]);
  }
});

// --- Задача 000235.04: порталы — механика 4 заклинаний (TDD: красные) ---
//
// 5 НОВЫХ экспортов src/spells.js + 4 маркер-кейса в switch
// castOutOfCombat + внутренний диспетчер teleportOutOfCombat (контракт:
// memory/000235.04-portals-mechanic.md §3-§5, D1-D14):
//   * nearestBuiltCity(cities, x, y) → {x, y, d} | null — Чебышёв до
//     ЯКОРЯ, built.length > 0, tie → лексико (x, y), НОЛЬ RNG (D7);
//   * nearestPassableTile(ax, ay, passable, maxR) → {x, y} | null —
//     спираль findSpawn-порядком (кольцо r, dx внешний, dy внутренний);
//   * PORTAL_SEARCH_RADIUS = 25 (D5);
//   * wardRadius(p, day) → 0..5 — max параметров.radius по АКТИВНЫМ
//     записям с spellId ∈ {'warding_circle'} (матчинг по spellId — D8;
//     невалидный/отсутствующий radius → дефолт 5);
//   * sanitizePortalMarker(v) → {x, y, day} | null — каноническая
//     КОПИЯ, молча (load-clean 000038).
// Диспетч — по ДЕЙСТВИЮ 'телепорт' + параметры.mode (D1); switch-кейсы
// gate/stone_anchor/recall/warding_circle — маркеры реальных future-ids
// (контент — волна .11). Skeleton-деградация (D2): ctx неполон для
// режима → ok:true, мана ПОТРАЧЕНА, без эффекта, без отказа (P-a:
// OC1 остаётся зелёным). Отказ — ПОСЛЕ мутаций, точный self-rollback
// (D3). Гости — РЕАЛЬНЫЕ future-ids; инъекция в try/finally (пины
// «ровно 17» не трогаются); синтетический ctx формы контракта §2.1.
// RED осмысленная: экспорты отсутствуют (assert typeof — не
// синтаксис); switch-кейсы отсутствуют (ok без эффекта/без reason).

function portalGuest0235(id, over = {}) {
  return Object.assign({
    id,
    название: 'Тестовое заклинание (000235.04)',
    школа: 'тень',
    база: null,
    степень: 1,
    атрибут: 'intelligence',
    уровень: 2,
    мани: 5,
    действие: 'телепорт',
    вне_боя: true,
    параметры: { mode: 'город' },
    здания: ['assets/buildings/000001.json'],
    описание: 'Тестовое заклинание (000235.04)',
    icon: 'assets/spell-icons/ghost.svg',
    icon_prompt: 'Тестовая иконка (000235.04)',
  }, over);
}

// Синтетический ctx формы контракта §2.1 (main.js → книга → spells.js):
// x/y — позиция каста, cities — Map/object по 'cx,cy', passable-оракул
// (000075 + defeatedAt), teleport — исполнитель (moveHero + saveNow).
function makeCtx(over = {}) {
  const calls = [];
  return {
    calls,
    ctx: Object.assign({
      x: 0, y: 0,
      cities: new Map(),
      passable: () => true,
      teleport: (tx, ty) => { calls.push([tx, ty]); },
    }, over),
  };
}

test('000235.04 H1: nearestBuiltCity — ближайший по Чебышёву до якоря; несколько городов → ближайший; tie → лексико (x, затем y); built пустой/отсутствует/не массив/запись не объект → не кандидат; мусорный ключ/запись → skip; нет кандидатов → null; Map + plain object; детерминизм (повтор — то же, НОЛЬ RNG)', () => {
  const { nearestBuiltCity } = loadSpells();
  assert.equal(typeof nearestBuiltCity, 'function',
    '000235.04: export Spells.nearestBuiltCity (src/spells.js)');
  const b = { x: 1, y: 2, buildingId: 4 };
  const m = new Map([
    ['20,-16', { name: 'А', built: [b] }],
    ['5,10', { name: 'Б', built: [b] }],
  ]);
  assert.deepEqual(nearestBuiltCity(m, 0, 0), { x: 5, y: 10, d: 10 },
    'несколько городов — ближайший по Чебышёву до ЯКОРЯ '
    + '(5,10: d=10 < 20,-16: d=20)');
  assert.deepEqual(nearestBuiltCity(m, 20, -16), { x: 20, y: -16, d: 0 },
    'герой у якоря города → d=0, тот город');
  const tie = new Map([
    ['7,5', { built: [b] }],
    ['5,7', { built: [b] }],
  ]);
  assert.deepEqual(nearestBuiltCity(tie, 0, 0), { x: 5, y: 7, d: 7 },
    'tie (оба d=7) → лексикографически (x, затем y): (5,7) < (7,5)');
  const noCand = new Map([
    ['1,1', { built: [] }],        // built пустой
    ['2,2', {}],                    // built отсутствует
    ['3,3', { built: 'нет_массива' }], // built не массив
    ['4,4', 'мусорная_запись'],     // запись не plain object
    ['5,5', null],                  // запись null
    ['мусорный-ключ', { built: [b] }], // ключ не 'cx,cy'
  ]);
  assert.equal(nearestBuiltCity(noCand, 0, 0), null,
    'нет кандидатов → null (все формы мусора — skip, без краха)');
  const plain = { '5,10': { built: [b] }, 'мусор': { built: 'нет' } };
  assert.deepEqual(nearestBuiltCity(plain, 0, 0), { x: 5, y: 10, d: 10 },
    'plain object принимается (не только Map)');
  for (let i = 0; i < 5; i++) {
    assert.deepEqual(nearestBuiltCity(m, 0, 0), { x: 5, y: 10, d: 10 },
      'повторный вызов i=' + i + ' — тот же результат (НОЛЬ RNG)');
  }
});

test('000235.04 H2: nearestPassableTile — anchor сам (если passable); blocked → первое в findSpawn-порядке (кольцо r, dx внешний, dy внутренний); все blocked ≤ maxR → null; за maxR не ходит', () => {
  const { nearestPassableTile } = loadSpells();
  assert.equal(typeof nearestPassableTile, 'function',
    '000235.04: export Spells.nearestPassableTile (src/spells.js)');
  const open = () => true;
  assert.deepEqual(nearestPassableTile(5, 5, open, 25), { x: 5, y: 5 },
    'anchor проходима → сам anchor (r=0)');
  const onlyAt = (tx, ty) => (x, y) => x === tx && y === ty;
  assert.deepEqual(nearestPassableTile(5, 5, onlyAt(6, 5), 25),
    { x: 6, y: 5 }, 'anchor blocked → первый passable (6,5)');
  // Кольцо r=1 findSpawn-порядком: (-1,-1),(-1,0),(-1,1),(0,-1),(0,1),
  // (1,-1),(1,0),(1,1)
  assert.deepEqual(nearestPassableTile(5, 5, onlyAt(4, 4), 25),
    { x: 4, y: 4 }, 'первая клетка кольца r=1 — (-1,-1)');
  assert.deepEqual(nearestPassableTile(5, 5, onlyAt(5, 6), 25),
    { x: 5, y: 6 }, 'порядок кольца: (0,+1) — своя очередь (не r>1)');
  const two = (x, y) => (x === 6 && y === 4) || (x === 4 && y === 4);
  assert.deepEqual(nearestPassableTile(5, 5, two, 25), { x: 4, y: 4 },
    'два кандидата в одном кольце → первый в порядке (dx, dy)');
  assert.deepEqual(nearestPassableTile(5, 5, onlyAt(7, 5), 2),
    { x: 7, y: 5 }, 'passable ровно на maxR=2 → найдена');
  assert.equal(nearestPassableTile(5, 5, onlyAt(8, 5), 2), null,
    'passable только за maxR (r=3 > 2) → null (не ходит дальше)');
  assert.equal(nearestPassableTile(5, 5, () => false, 25), null,
    'все blocked ≤ maxR → null');
});

test('000235.04 G1: gate — выбран ближайший built-город по Чебышёву, телепорт на тайл кольца вокруг якоря (anchor проходима → якорь; blocked → первая клетка кольца); детерминизм (повтор — тот же)', () => {
  const dataMod = loadSpellsData();
  const gate = portalGuest0235('gate'); // телепорт, mode «город»
  try {
    pushOcGuests(dataMod, [gate]);
    const { castOutOfCombat } = loadSpells();
    const b = { x: 1, y: 2, buildingId: 4 };
    const cities = new Map([
      ['20,-16', { built: [b] }],
      ['5,10', { built: [b] }],
    ]);
    const p = spellHero({ spells: [gate.id], mp: 30 });
    const m1 = makeCtx({ x: 0, y: 0, cities });
    const r1 = castOutOfCombat(p, gate.id, 10, m1.ctx);
    assert.equal(r1.ok, true, 'gate с built-городами — ok');
    assert.equal(r1.expiresDay, null, 'телепорт — записей нет (days null)');
    assert.equal(p.mp, 25, 'мана ровно «мани» (5)');
    assert.deepEqual(p.outOfCombatEffects, [], 'телепорт — записей НЕТ');
    assert.deepEqual(m1.calls, [[5, 10]],
      'RED: телепорт в ближайший built-якорь (5,10: d=10 < 20); '
      + 'passable открыт → сам якорь (master: кейса нет — телепорта нет)');
    const p2 = spellHero({ spells: [gate.id], mp: 30 });
    const m2 = makeCtx({
      x: 0, y: 0, cities,
      passable: (x, y) => !(x === 5 && y === 10),
    });
    const r2 = castOutOfCombat(p2, gate.id, 10, m2.ctx);
    assert.equal(r2.ok, true, 'якорь blocked — всё равно ок');
    assert.deepEqual(m2.calls, [[4, 9]],
      'RED: якорь blocked → первая клетка кольца r=1 (findSpawn-порядок: '
      + '(-1,-1)) — (4,9)');
    const p3 = spellHero({ spells: [gate.id], mp: 30 });
    const m3 = makeCtx({ x: 0, y: 0, cities });
    assert.equal(castOutOfCombat(p3, gate.id, 10, m3.ctx).ok, true);
    assert.deepEqual(m3.calls, [[5, 10]],
      'повторный каст — та же цель (детерминизм, НОЛЬ RNG)');
  } finally {
    popOcGuests(dataMod, [gate]);
  }
});

test('000235.04 G2: gate — городов с постройками НЕТ → отказ «нет города с постройками»; mp ОТКАТНУТ; телепорт НЕ вызван; записей нет', () => {
  const dataMod = loadSpellsData();
  const gate = portalGuest0235('gate');
  try {
    pushOcGuests(dataMod, [gate]);
    const { castOutOfCombat } = loadSpells();
    const cities = new Map([
      ['1,1', { built: [] }],            // built пустой — не кандидат
      ['2,2', { name: 'Без построек' }], // built отсутствует — не кандидат
    ]);
    const p = spellHero({ spells: [gate.id], mp: 30 });
    const m = makeCtx({ x: 0, y: 0, cities });
    const r = castOutOfCombat(p, gate.id, 10, m.ctx);
    assert.equal(r.ok, false,
      'RED: отказ (master: кейса нет — ок без эффекта, мана сжата)');
    assert.equal(r.reason, 'нет города с постройками',
      'причина ДЕСЛОВНО по ТЗ');
    assert.equal(p.mp, 30, 'mp ОТКАТНУТ (castFail: мана до switch)');
    assert.equal(m.calls.length, 0, 'телепорт НЕ вызван');
    assert.deepEqual(p.outOfCombatEffects, [], 'записей нет (отказ)');
  } finally {
    popOcGuests(dataMod, [gate]);
  }
});

// 000235.04.01: регрессионный пин (ТЗ п.3) — degenerate-отказ gate:
// built-город ЕСТЬ, но проходимого тайла в ≤ 25 НЕТ (passable:
// () => false) — спираль nearestPassableTile гоняет все 2601 тайл
// (до 2601 вызова tileAt в игре — известная разовая цена каста,
// memory/000235.04.01) и даёт null → отказ, а НЕ крах (прецедент
// 000075). Симметрия RC2 (recall-дегенерат). Зелёный с рождения
// (поведение 5a21d89).
test('000235.04.01 G3: gate — built-город ЕСТЬ, проходимого тайла в ≤ 25 НЕТ (passable: () => false) → отказ «нет проходимого тайла рядом с городом»; mp ОТКАТНУТ; телепорт НЕ вызван; записей нет; метки нет', () => {
  const dataMod = loadSpellsData();
  const gate = portalGuest0235('gate');
  try {
    pushOcGuests(dataMod, [gate]);
    const { castOutOfCombat } = loadSpells();
    const b = { x: 11, y: 10, buildingId: 4 };
    const cities = new Map([['10,10', { built: [b] }]]);
    const p = spellHero({ spells: [gate.id], mp: 30 });
    const m = makeCtx({
      x: 0, y: 0, cities,
      passable: () => false,
    });
    const r = castOutOfCombat(p, gate.id, 10, m.ctx);
    assert.equal(r.ok, false, 'degenerate: проходимого в ≤25 нет');
    assert.equal(r.reason, 'нет проходимого тайла рядом с городом',
      'reason-строка ДЕСЛОВНО (src/spells.js, контракт P-k)');
    assert.equal(p.mp, 30, 'mp ОТКАТНУТ (castFail — откат маны)');
    assert.equal(m.calls.length, 0, 'телепорт НЕ вызван');
    assert.deepEqual(p.outOfCombatEffects, [], 'записей нет (отказ)');
    assert.equal(p.portal_marker, undefined, 'метки нет (gate)');
  } finally {
    popOcGuests(dataMod, [gate]);
  }
});

test('000235.04 SA1: stone_anchor — метка {x, y, day} на тайле каста (day = день каста); герой НЕ сдвинулся; записей НЕТ; повторный каст = ПЕРЕЗАПИСЬ (один объект, день обновлён); без ctx → ok, метка не создана (skeleton)', () => {
  const dataMod = loadSpellsData();
  const anchor = portalGuest0235('stone_anchor',
    { параметры: { mode: 'метка_установить' } });
  try {
    pushOcGuests(dataMod, [anchor]);
    const { castOutOfCombat } = loadSpells();
    const p = spellHero({ spells: [anchor.id], mp: 30 });
    const m = makeCtx({ x: 7, y: -3 });
    const r = castOutOfCombat(p, anchor.id, 5, m.ctx);
    assert.equal(r.ok, true, 'метка установлена — ok');
    assert.deepEqual(p.portal_marker, { x: 7, y: -3, day: 5 },
      'RED: p.portal_marker = {x, y, day} тайла каста (day = день каста; '
      + 'master: поля нет)');
    assert.equal(m.calls.length, 0, 'герой НЕ сдвинулся (телепорта нет)');
    assert.deepEqual(p.outOfCombatEffects, [], 'записей НЕТ (телепорт)');
    assert.equal(p.mp, 25, 'мана ровно «мани» (5)');
    const m2 = makeCtx({ x: 9, y: 1 });
    assert.equal(castOutOfCombat(p, anchor.id, 6, m2.ctx).ok, true);
    assert.deepEqual(p.portal_marker, { x: 9, y: 1, day: 6 },
      'повторный каст — ПЕРЕЗАПИСЬ (один объект, день обновлён)');
    assert.equal(m2.calls.length, 0, 'повтор — герой не сдвинут');
    const p2 = spellHero({ spells: [anchor.id], mp: 30 });
    const r2 = castOutOfCombat(p2, anchor.id, 5); // без ctx
    assert.equal(r2.ok, true, 'без ctx — skeleton ok (D2: поведение .02)');
    assert.equal(p2.mp, 25, 'skeleton: мана ПОТРАЧЕНА');
    assert.equal(p2.portal_marker, undefined, 'skeleton: метка НЕ создана');
  } finally {
    popOcGuests(dataMod, [anchor]);
  }
});

test('000235.04 RC1: recall — с меткой: телепорт к ближайшему проходимому тайлу (метка проходима → сама метка; blocked → первая в спирали); записей НЕТ', () => {
  const dataMod = loadSpellsData();
  const recall = portalGuest0235('recall',
    { параметры: { mode: 'метка_вернуться' } });
  try {
    pushOcGuests(dataMod, [recall]);
    const { castOutOfCombat } = loadSpells();
    const p = spellHero({ spells: [recall.id], mp: 30 });
    p.portal_marker = { x: 12, y: 8, day: 1 };
    const m = makeCtx();
    const r = castOutOfCombat(p, recall.id, 10, m.ctx);
    assert.equal(r.ok, true, 'recall с меткой — ok');
    assert.deepEqual(m.calls, [[12, 8]],
      'RED: телепорт к метке (метка проходима → сама метка; master: '
      + 'кейса нет — телепорта нет)');
    assert.deepEqual(p.outOfCombatEffects, [], 'записей НЕТ (телепорт)');
    assert.equal(p.mp, 25, 'мана ровно «мани» (5)');
    const p2 = spellHero({ spells: [recall.id], mp: 30 });
    p2.portal_marker = { x: 12, y: 8, day: 1 };
    const m2 = makeCtx({ passable: (x, y) => !(x === 12 && y === 8) });
    const r2 = castOutOfCombat(p2, recall.id, 10, m2.ctx);
    assert.equal(r2.ok, true, 'метка на blocked-тайле — всё равно ок');
    assert.deepEqual(m2.calls, [[11, 7]],
      'RED: метка blocked → первая клетка кольца r=1 вокруг метки '
      + '(findSpawn-порядок: (-1,-1)) — (11,7)');
  } finally {
    popOcGuests(dataMod, [recall]);
  }
});

test('000235.04 RC2: recall — без метки → отказ «метка не установлена» + mp-откат + герой не сдвинулся; битая метка — тот же отказ (проверка ИДЁТ ПЕРВОЙ); метка + без ctx → skeleton ok (без эффекта); проходимого ≤25 нет → «нет проходимого тайла рядом с меткой» + откат', () => {
  const dataMod = loadSpellsData();
  const recall = portalGuest0235('recall',
    { параметры: { mode: 'метка_вернуться' } });
  try {
    pushOcGuests(dataMod, [recall]);
    const { castOutOfCombat } = loadSpells();
    const p = spellHero({ spells: [recall.id], mp: 30 });
    const m = makeCtx();
    const r = castOutOfCombat(p, recall.id, 10, m.ctx);
    assert.equal(r.ok, false,
      'RED: отказ (master: кейса нет — ок без эффекта)');
    assert.equal(r.reason, 'метка не установлена', 'причина ДЕСЛОВНО по ТЗ');
    assert.equal(p.mp, 30, 'mp ОТКАТНУТ');
    assert.equal(m.calls.length, 0, 'герой не сдвинулся');
    assert.deepEqual(p.outOfCombatEffects, [], 'записей нет');
    const pJ = spellHero({ spells: [recall.id], mp: 30 });
    pJ.portal_marker = 'мусор';
    const mJ = makeCtx();
    const rJ = castOutOfCombat(pJ, recall.id, 10, mJ.ctx);
    assert.equal(rJ.ok, false, 'битая метка — валидная НЕТ');
    assert.equal(rJ.reason, 'метка не установлена',
      'проверка метки ИДЁТ ПЕРВОЙ (игровая причина)');
    assert.equal(mJ.calls.length, 0, 'битая метка — телепорта нет');
    const p2 = spellHero({ spells: [recall.id], mp: 30 });
    p2.portal_marker = { x: 1, y: 1, day: 1 };
    const r2 = castOutOfCombat(p2, recall.id, 10); // метка есть, ctx нет
    assert.equal(r2.ok, true, 'метка есть + без ctx — skeleton ok (D2)');
    assert.equal(p2.mp, 25, 'skeleton: мана ПОТРАЧЕНА');
    const p3 = spellHero({ spells: [recall.id], mp: 30 });
    p3.portal_marker = { x: 12, y: 8, day: 1 };
    const m3 = makeCtx({ passable: () => false });
    const r3 = castOutOfCombat(p3, recall.id, 10, m3.ctx);
    assert.equal(r3.ok, false, 'degenerate: проходимого в ≤25 нет');
    assert.equal(r3.reason, 'нет проходимого тайла рядом с меткой');
    assert.equal(p3.mp, 30, 'mp ОТКАТНУТ (degenerate-отказ)');
    assert.equal(m3.calls.length, 0, 'телепорт НЕ вызван');
  } finally {
    popOcGuests(dataMod, [recall]);
  }
});

test('000235.04 WD1: warding_circle — каст → запись {spellId, expiresDay: day+1} (generic-ядро .02); wardRadius: активный r=5 → 5 (зона d≤5 — супрессия: d ≤ r); ЧУЖОЙ id (даже «внебой» c radius) → 0 (матчинг по spellId — D8)', () => {
  const dataMod = loadSpellsData();
  const ward = portalGuest0235('warding_circle', {
    действие: 'внебой', параметры: { days: 1, radius: 5 },
  });
  const other = portalGuest0235('wd1_other', {
    действие: 'внебой', параметры: { days: 1, radius: 5 },
  });
  try {
    pushOcGuests(dataMod, [ward, other]);
    const { castOutOfCombat, wardRadius } = loadSpells();
    assert.equal(typeof wardRadius, 'function',
      '000235.04: export Spells.wardRadius (src/spells.js)');
    const day = 10;
    const p = spellHero({ spells: [ward.id, other.id], mp: 60 });
    const r = castOutOfCombat(p, ward.id, day);
    assert.equal(r.ok, true, 'warding_circle — каст ok');
    assert.equal(r.expiresDay, day + 1, 'days 1 → expiresDay = day+1');
    assert.deepEqual(p.outOfCombatEffects,
      [{ spellId: ward.id, expiresDay: day + 1 }],
      'запись generic-ядром .02');
    assert.equal(p.mp, 55, 'мана ровно «мани» (5)');
    assert.equal(wardRadius(p, day), 5,
      'RED: активный warding r=5 → 5 (зона d≤5 — супрессия: d ≤ r; '
      + 'master: экспорта нет)');
    assert.equal(castOutOfCombat(p, other.id, day).ok, true,
      'чужой «внебой» тоже кастуется (ядро .02)');
    assert.equal(wardRadius(p, day), 5,
      'свой warding при активном чужом — всё ещё 5 (иды различаются)');
    const p2 = spellHero({ spells: [other.id], mp: 30 });
    assert.equal(castOutOfCombat(p2, other.id, day).ok, true);
    assert.equal(wardRadius(p2, day), 0,
      'RED: чужой id («внебой» c radius 5) → 0 — матчинг по spellId, '
      + 'НЕ по действию (D8: «внебой» у 14+ спеллов)');
    assert.equal(wardRadius({ outOfCombatEffects:
      [{ spellId: other.id, expiresDay: day + 2 }] }, day), 0,
      'прямая запись чужого id — тоже 0 (без каста)');
  } finally {
    popOcGuests(dataMod, [ward, other]);
  }
});

test('000235.04 WD2: wardRadius — граница expiresDay = day → 0; < day → 0; две активные → max; «невидимость» c radius → 0; radius — из каталога ленивым lookup (1..5 — значение, невалидный/отсутствует → дефолт 5); [] / нет поля / мусор → 0; детерминизм', () => {
  const dataMod = loadSpellsData();
  const day = 10;
  const rec = (expiresDay) => ({ spellId: 'warding_circle', expiresDay });
  const mkWard = (over) => portalGuest0235('warding_circle',
    Object.assign(
      { действие: 'внебой', параметры: { days: 1, radius: 5 } }, over));
  const ward5 = mkWard({});
  const inv = portalGuest0235('wd2_inv', {
    действие: 'невидимость', параметры: { days: 1, radius: 5 },
  });
  try {
    pushOcGuests(dataMod, [ward5, inv]);
    const { wardRadius } = loadSpells();
    assert.equal(typeof wardRadius, 'function',
      '000235.04: export Spells.wardRadius (src/spells.js)');
    assert.equal(wardRadius({ outOfCombatEffects: [rec(day)] }, day), 0,
      'RED: ГРАНИЦА expiresDay = day → 0 (зеркало истечения .02)');
    assert.equal(wardRadius({ outOfCombatEffects: [rec(day - 1)] }, day), 0,
      'expiresDay < day → 0');
    assert.equal(wardRadius({ outOfCombatEffects: [rec(day + 1)] }, day), 5,
      'expiresDay = day+1 → 5 (активный)');
    assert.equal(wardRadius({ outOfCombatEffects:
      [rec(day + 1), rec(day + 2)] }, day), 5,
      'две активные записи → max (обе 5)');
    assert.equal(wardRadius({ outOfCombatEffects:
      [rec(day), rec(day + 1)] }, day), 5,
      'истёкшая + активная → радиус АКТИВНОЙ');
    assert.equal(wardRadius({ outOfCombatEffects:
      [{ spellId: inv.id, expiresDay: day + 1 }] }, day), 0,
      '«невидимость» (даже c radius 5) → 0 (ид не в наборе, D8)');
    assert.equal(wardRadius({ outOfCombatEffects: [] }, day), 0,
      '[] → 0');
    assert.equal(wardRadius({}, day), 0, 'нет поля → 0');
    assert.equal(wardRadius(null, day), 0, 'hero = null → 0');
    assert.equal(wardRadius({ outOfCombatEffects: 'бито' }, day), 0,
      'effects не массив → 0');
    assert.equal(wardRadius({ outOfCombatEffects:
      [null, 'мусор', 42,
       { spellId: 'нет_такого_заклинания', expiresDay: day + 1 },
       { expiresDay: day + 1 }] }, day), 0,
      'мусор-записи → 0 без краха');
    const p = { outOfCombatEffects: [rec(day + 1)] };
    for (let i = 0; i < 5; i++) {
      assert.equal(wardRadius(p, day), 5, 'повторный вызов i=' + i
        + ' — стабильно (без RNG)');
    }
  } finally {
    popOcGuests(dataMod, [ward5, inv]);
  }
  for (const [radius, expected] of [[1, 1], [3, 3], [5, 5]]) {
    const wr = mkWard({ параметры: { days: 1, radius } });
    try {
      pushOcGuests(dataMod, [wr]);
      const { wardRadius, castOutOfCombat } = loadSpells();
      const p = spellHero({ spells: [wr.id], mp: 30 });
      assert.equal(castOutOfCombat(p, wr.id, day).ok, true);
      assert.equal(wardRadius(p, day), expected,
        'RED: radius — ЛЕНИВЫМ lookup из каталога (гость r=' + radius
        + ') → ' + expected + ' (не хардкод 5)');
    } finally {
      popOcGuests(dataMod, [wr]);
    }
  }
  for (const radius of ['нет', 9, 0, 1.5, null]) {
    const wb = mkWard({ параметры: { days: 1, radius } });
    try {
      pushOcGuests(dataMod, [wb]);
      const { wardRadius, castOutOfCombat } = loadSpells();
      const p = spellHero({ spells: [wb.id], mp: 30 });
      assert.equal(castOutOfCombat(p, wb.id, day).ok, true,
        'days валиден — каст ok при мусорном radius: '
        + JSON.stringify(radius));
      assert.equal(wardRadius(p, day), 5,
        'невалидный radius (' + JSON.stringify(radius) + ') → ДЕФОЛТ 5');
    } finally {
      popOcGuests(dataMod, [wb]);
    }
  }
  const wn = portalGuest0235('warding_circle', {
    действие: 'внебой', параметры: { days: 1 },
  });
  try {
    pushOcGuests(dataMod, [wn]);
    const { wardRadius, castOutOfCombat } = loadSpells();
    const p = spellHero({ spells: [wn.id], mp: 30 });
    assert.equal(castOutOfCombat(p, wn.id, day).ok, true);
    assert.equal(wardRadius(p, day), 5, 'radius отсутствует → ДЕФОЛТ 5');
  } finally {
    popOcGuests(dataMod, [wn]);
  }
});

test('000235.04 H3: sanitizePortalMarker — валидный {x, y, day} → каноническая КОПИЯ (не ссылка, чужие поля отброшены); мусор (строка/массив/null/нет day/day=0/дробный x/строковый y/boolean y/дробный day) → null, без краха', () => {
  const { sanitizePortalMarker } = loadSpells();
  assert.equal(typeof sanitizePortalMarker, 'function',
    '000235.04: export Spells.sanitizePortalMarker (src/spells.js)');
  const src = { x: 3, y: -2, day: 7, extra: 'отброс', deep: [1] };
  const r = sanitizePortalMarker(src);
  assert.deepEqual(r, { x: 3, y: -2, day: 7 },
    'RED: валидный → канонический {x, y, day} (мастер: экспорта нет)');
  assert.notEqual(r, src, 'КОПИЯ (не ссылка)');
  assert.equal(src.extra, 'отброс', 'вход не мутирован');
  assert.equal(r.extra, undefined, 'чужие поля отброшены из результата');
  for (const v of [
    'мусор',
    [3, -2, 7],
    null,
    undefined,
    42,
    {},
    { x: 3, y: -2 },                  // нет day
    { x: 3, y: -2, day: 0 },          // day < 1
    { x: 3, y: -2, day: -1 },
    { x: 1.5, y: -2, day: 7 },        // дробный x
    { x: 3, y: '-2', day: 7 },        // строковый y
    { x: 3, y: true, day: 7 },        // boolean y
    { x: 3, y: -2, day: 7.5 },        // дробный day
  ]) {
    assert.equal(sanitizePortalMarker(v), null,
      'мусор → null: ' + JSON.stringify(v));
  }
});

test('000235.04 H4: dispatch-пины — «телепорт» БЕЗ mode → skeleton (ok, без эффекта, мана потрачена — P-a); «внебой»-гость (НЕ warding_circle) → запись generic-ядром, БЕЗ телепорта (кейс-маркер — только запись)', () => {
  const dataMod = loadSpellsData();
  const noMode = portalGuest0235('h4_nomode', { параметры: {} });
  const out = portalGuest0235('h4_out', { параметры: { days: 2 } });
  try {
    pushOcGuests(dataMod, [noMode, out]);
    const { castOutOfCombat } = loadSpells();
    const p = spellHero({ spells: [noMode.id, out.id], mp: 60 });
    const m = makeCtx();
    const r1 = castOutOfCombat(p, noMode.id, 10, m.ctx);
    assert.equal(r1.ok, true,
      '«телепорт» без mode — skeleton ok (D2/P-a: неполный ctx → '
      + 'поведение до .04, а не отказ/крах)');
    assert.equal(r1.expiresDay, null, 'без days → записей нет');
    assert.equal(p.mp, 55, 'skeleton: мана ПОТРАЧЕНА');
    assert.equal(m.calls.length, 0, 'телепорта нет');
    assert.equal(p.portal_marker, undefined, 'метки нет');
    assert.deepEqual(p.outOfCombatEffects, [], 'записей нет');
    const r2 = castOutOfCombat(p, out.id, 10, m.ctx);
    assert.equal(r2.ok, true, '«внебой»-гость — каст ok');
    assert.deepEqual(p.outOfCombatEffects,
      [{ spellId: out.id, expiresDay: 12 }],
      '«внебой» — запись generic-ядром .02 (expiresDay = day+2)');
    assert.equal(m.calls.length, 0,
      '«внебой» — БЕЗ телепорта (кейс-маркер — только запись)');
  } finally {
    popOcGuests(dataMod, [noMode, out]);
  }
});

// --- Задача 000235.07: волна Огонь — 25 заклинаний + 25 свитков (TDD) ---
//
// Контракт: memory/000235.07-fire-wave-content.md. RED: записи/свитки/
// иконки/пул/зеркала/экспорты отсутствуют (ENOENT / undefined / count) —
// осмысленно, не синтаксис. Таблица ТЗ дословно; нумерация append-only:
// spells 000018–000042, свитки items 000108–00132 (тот же порядок;
// после ребейза конкурент 000232 занял 000077–000082).

const FIRE07 = [
  // id, название, действие, уровень, степень, база(файл|null), мани, вне_боя
  ['ember', 'Тлеющий уголёк', 'урон', 1, 1, null, 3, false],
  ['ignite', 'Поджечь', 'урон', 2, 2, 'assets/spells/000018.json', 7, false],
  ['fire_nova', 'Огненная нова', 'урон', 2, 1, null, 6, false],
  ['lava_burst', 'Лава-всплеск', 'урон', 3, 3, 'assets/spells/000019.json', 10, false],
  ['meteor', 'Метеор', 'урон', 3, 1, null, 15, false],
  ['flame_strike', 'Огненный удар', 'урон', 3, 1, null, 12, false],
  ['hellfire', 'Адское пламя', 'урон', 4, 1, null, 20, false],
  ['phlogiston_blast', 'Взрыв флогистона', 'урон', 4, 1, null, 20, false],
  ['burning_ground', 'Жгучая земля', 'создание', 2, 1, null, 8, false],
  ['wall_of_fire', 'Стена огня', 'создание', 3, 1, null, 12, false],
  ['burning_haze', 'Облако пламени', 'создание', 3, 1, null, 12, false],
  ['blazing_speed', 'Пламенная стремительность', 'баф', 1, 1, null, 4, false],
  ['fire_aura', 'Аура пламени', 'баф', 2, 2, 'assets/spells/000029.json', 7, false],
  ['heat_shield', 'Жаровой щит', 'баф', 2, 1, null, 8, false],
  ['sunfire', 'Солнечный огонь', 'баф', 3, 3, 'assets/spells/000030.json', 13, false],
  ['scorch', 'Обжечь', 'дебаф', 2, 1, null, 7, false],
  ['cinder', 'Пепел', 'дебаф', 3, 2, 'assets/spells/000033.json', 10, false],
  ['ashen_debilitation', 'Пепельная слабость', 'дебаф', 4, 3, 'assets/spells/000034.json', 20, false],
  ['lava_snare', 'Лава-петля', 'контроль', 2, 1, null, 6, false],
  ['burning_cage', 'Огненная клетка', 'контроль', 3, 1, null, 12, false],
  ['flame_imp', 'Огненный имп', 'призыв', 2, 1, null, 8, false],
  ['phoenix', 'Феникс', 'призыв', 4, 1, null, 20, false],
  ['firelight', 'Свет пламени', 'внебой', 1, 1, null, 4, true],
  ['hearthfire', 'Очаговый огонь', 'внебой', 1, 1, null, 5, true],
  ['flame_step', 'Пламенный шаг', 'телепорт', 2, 1, null, 7, true],
];
const FIRE07_IDS = FIRE07.map((r) => r[0]);
const FIRE07_OC = ['firelight', 'hearthfire', 'flame_step'];

function fireSpellFile(i) {
  return path.join(DIR, String(18 + i).padStart(6, '0') + '.json');
}
function fireScrollFile(i) {
  return `assets/items/${String(108 + i).padStart(6, '0')}.json`;
}
function fireScrollId(i) { return FIRE07[i][0] + '_scroll'; }

test('000235.07 W-02: 25 записей spells — id/название/школа/атрибут/действие/уровень/степень/база/мани/icon/icon_prompt/здания/предметы/вне_боя по таблице ТЗ', () => {
  let ocCount = 0;
  FIRE07.forEach((row, i) => {
    const [id, name, action, level, degree, base, mana, oc] = row;
    const f = fireSpellFile(i);
    assert.ok(fs.existsSync(f),
      `W-02: запись отсутствует — ${path.basename(f)} (${id}) (RED: файл нет)`);
    const d = JSON.parse(fs.readFileSync(f, 'utf8'));
    assert.equal(d.id, id, `${id}: id`);
    assert.equal(d.название, name, `${id}: название`);
    assert.equal(d.школа, 'огонь', `${id}: школа`);
    assert.equal(d.атрибут, 'intelligence', `${id}: атрибут`);
    assert.equal(d.действие, action, `${id}: действие`);
    assert.equal(d.уровень, level, `${id}: уровень`);
    assert.equal(d.степень, degree, `${id}: степень`);
    assert.equal(d.база, base, `${id}: база`);
    assert.equal(d.мани, mana, `${id}: мани`);
    assert.equal(d.icon, `assets/spell-icons/${id}.svg`, `${id}: icon`);
    assert.ok(typeof d.icon_prompt === 'string' && d.icon_prompt.trim().length > 0,
      `${id}: icon_prompt непустое`);
    assert.ok(typeof d.описание === 'string' && d.описание.trim().length > 0,
      `${id}: описание непустое`);
    assert.deepEqual(d.здания, ['assets/buildings/000018.json'],
      `${id}: здания = [000018]`);
    assert.deepEqual(d.предметы, [fireScrollFile(i)],
      `${id}: предметы = [свой свиток ${fireScrollFile(i)}]`);
    assert.equal(d.вне_боя === true, oc, `${id}: вне_боя`);
    if (oc) ocCount += 1;
  });
  assert.equal(ocCount, 3,
    'вне_боя — ровно 3 (firelight/hearthfire/flame_step)');
});

test('000235.07 W-03: параметры по D1 — баф/дебаф {stat,value,turns}; призыв {summon,turns:4}; создание {object,stat,value,turns,radius}/{object,turns}; внебой {days:1,radius:5}; урон/контроль/телепорт — без параметров', () => {
  const P = {
    blazing_speed: { stat: 'ход', value: 1, turns: 3 },
    fire_aura: { stat: 'урон', value: 0.15, turns: 3 },
    heat_shield: { stat: 'броня', value: 1, turns: 3 },
    sunfire: { stat: 'урон', value: 0.15, turns: 3 },
    scorch: { stat: 'броня_вниз', value: 1, turns: 3 },
    cinder: { stat: 'урон_вниз', value: 0.15, turns: 3 },
    ashen_debilitation: { stat: 'урон_вниз', value: 0.2, turns: 3 },
    flame_imp: { summon: 'imp', turns: 4 },
    phoenix: { summon: 'fire_elemental', turns: 4 },
    burning_ground: { object: 'зона', stat: 'dot', value: 1, turns: 3, radius: 2 },
    burning_haze: { object: 'зона', stat: 'dot', value: 1, turns: 3, radius: 2 },
    wall_of_fire: { object: 'стена', turns: 5 },
    firelight: { days: 1, radius: 5 },
    hearthfire: { days: 1, radius: 5 },
  };
  const NO_PARAMS = new Set([
    'ember', 'ignite', 'fire_nova', 'lava_burst', 'meteor', 'flame_strike',
    'hellfire', 'phlogiston_blast', 'lava_snare', 'burning_cage', 'flame_step',
  ]);
  FIRE07.forEach((row, i) => {
    const id = row[0];
    const f = fireSpellFile(i);
    assert.ok(fs.existsSync(f), `W-03: запись отсутствует — ${id} (RED)`);
    const d = JSON.parse(fs.readFileSync(f, 'utf8'));
    const expected = P[id];
    if (expected !== undefined) {
      assert.deepEqual(d.параметры, expected, `${id}: параметры по D1`);
    } else {
      assert.equal(d.параметры, undefined,
        `${id}: БЕЗ «параметры» (${NO_PARAMS.has(id) ? 'урон/контроль/телепорт' : 'ошибка таблицы'})`);
    }
  });
});

test('000235.07 W-04: кастабельность вне боя — firelight/hearthfire/flame_step ok; 22 боевых «боевое заклинание» до расхода; телепорт без вне_боя (гость) — отказ', () => {
  const dataMod = loadSpellsData();
  const guest = ocGuest0235('w04_tport_noflag', {
    действие: 'телепорт', параметры: {}, вне_боя: false,
  });
  try {
    pushOcGuests(dataMod, [guest]);
    const { castOutOfCombat } = loadSpells();
    for (const id of FIRE07_OC) {
      assert.ok(dataMod.SPELLS_BY_ID[id], `W-04: ${id} — запись в каталоге (RED: нет)`);
      const p = spellHero({ spells: [id], mp: 30 });
      const r = castOutOfCombat(p, id, 10);
      assert.equal(r.ok, true, `${id}: каст вне боя ok (${r.reason})`);
    }
    const combatIds = FIRE07_IDS.filter((id) => !FIRE07_OC.includes(id));
    assert.equal(combatIds.length, 22, '25 − 3 внебоевых = 22 боевых');
    for (const id of combatIds) {
      assert.ok(dataMod.SPELLS_BY_ID[id], `W-04: ${id} — запись (RED: нет)`);
      const p = spellHero({ spells: [id], mp: 30 });
      const r = castOutOfCombat(p, id, 10);
      assert.equal(r.ok, false, `${id}: боевое вне боя — отказ`);
      assert.equal(r.reason, 'боевое заклинание', `${id}: причина по флагу`);
      assert.equal(p.mp, 30, `${id}: отказ — до расхода`);
      assert.equal(p.outOfCombatEffects, undefined, `${id}: отказ — без мутаций`);
    }
    const pg = spellHero({ spells: [guest.id], mp: 30 });
    const rg = castOutOfCombat(pg, guest.id, 10);
    assert.equal(rg.ok, false, 'телепорт без вне_боя — отказ');
    assert.equal(rg.reason, 'боевое заклинание', 'телепорт без флага — гейт по флагу');
    assert.equal(pg.mp, 30, 'гость: отказ до расхода');
  } finally {
    popOcGuests(dataMod, [guest]);
  }
});

test('000235.07 W-08: зеркала в синке — spells-data 142 / items-data 486 (ре-пин 000235.07: +25 свитков; ре-пин 000235.08: +25 волны Лёд; ре-пин 000230.09: +50 уши/шея; ре-пин 000230.10: +25 torso; ре-пин 000235.09: +25 волны Тень; ре-пин 000235.10: +25 волны Исцеление (+25 заклинаний); ре-пин 000230.11: +50 руки; ре-пин 000230.12: +25 «правая рука»; ре-пин 000230.13: +25 left_hand; ре-пин 000230.14: +25 колец; ре-пин 000230.15: +50 ноги/ступни; ре-пин 000230.19: +2 torso-набора; ре-пин 000235.11: +25 волны Защита (+25 заклинаний); ре-пин 000277: +2 set); sync:check exit 0', () => {
  const { SPELLS } = loadSpellsData();
  assert.equal(SPELLS.length, 142, 'spells-data: 142 записей (RED: 117)');
  const itemsData = require('../src/items-data.js');
  assert.equal(itemsData.ITEMS.length, 486,
    'items-data: 486 (каталог после мержа: 182 на базе 000230.09 '
    + '+ 25 свитков волны Лёд (000235.08) + 25 torso (000230.10) '
    + '+ 25 свитков волны Тень (000235.09) '
    + '+ 25 свитков волны Исцеление (000235.10) '
    + '+ 25 свитков волны Защита (000235.11) '
    + '+ 50 рук (000230.11) + 25 «правая рука» (000230.12) '
    + '+ 25 left_hand (000230.13) + 25 колец (000230.14) '
    + '+ 50 ног/ступней (000230.15) '
    + '+ 2 torso-набора (000230.19) '
    + '+ 2 set (000277))');
  const { spawnSync } = require('node:child_process');
  const r = spawnSync(process.execPath,
    [path.join(__dirname, '..', 'scripts', 'sync-all.js'), '--check'],
    { cwd: path.join(__dirname, '..'), encoding: 'utf8' });
  assert.equal(r.status, 0,
    'sync:check exit 0 (RED: зеркала/каталоги расходятся): '
    + ((r.stdout || '') + (r.stderr || '')).slice(0, 400));
});

test('000235.07 W-10a: case flame_step — отказ callback → reason + мана откатилась, ЗАПИСЕЙ НЕТ; успех → {ok:true}, записи нет; без callback → «телепорт недоступен здесь»; нет маны → «не хватает маны» ДО cb (мутаций нет)', () => {
  const dataMod = loadSpellsData();
  assert.ok(dataMod.SPELLS_BY_ID['flame_step'],
    'W-10a: запись flame_step в каталоге (RED: нет)');
  const { castOutOfCombat } = loadSpells();
  {
    const p = spellHero({ spells: ['flame_step'], mp: 30 });
    const r = castOutOfCombat(p, 'flame_step', 10, {
      flameStep: () => ({ ok: false, reason: 'нет направления движения' }),
    });
    assert.equal(r.ok, false, 'отказ callback → ok:false');
    assert.equal(r.reason, 'нет направления движения', 'reason из callback');
    assert.equal(p.mp, 30, 'отказ → мана откатилась (не 30−7)');
    assert.equal(p.outOfCombatEffects, undefined, 'телепорт — ЗАПИСЕЙ НЕТ');
  }
  {
    const p = spellHero({ spells: ['flame_step'], mp: 30 });
    const r = castOutOfCombat(p, 'flame_step', 10, {
      flameStep: () => ({ ok: true }),
    });
    assert.equal(r.ok, true, 'успех callback → ok:true');
    assert.equal(r.expiresDay, null, 'телепорт — expiresDay null');
    assert.equal(p.mp, 23, 'успех → мана снята (7)');
    assert.equal(p.outOfCombatEffects, undefined, 'телепорт — записи НЕ создаёт');
  }
  {
    const p = spellHero({ spells: ['flame_step'], mp: 30 });
    const r = castOutOfCombat(p, 'flame_step', 10, {});
    assert.equal(r.ok, false, 'без callback → отказ');
    assert.equal(r.reason, 'телепорт недоступен здесь');
    assert.equal(p.mp, 30, 'отказ → мана откатилась');
  }
  {
    let calls = 0;
    const p = spellHero({ spells: ['flame_step'], mp: 2 });
    const r = castOutOfCombat(p, 'flame_step', 10, {
      flameStep: () => { calls += 1; return { ok: true }; },
    });
    assert.equal(r.ok, false, 'нет маны + успешный cb → отказ');
    assert.equal(r.reason, 'не хватает маны',
      'проверка маны ДО cb (ревью: мутация — после всех проверок)');
    assert.equal(calls, 0, 'cb НЕ вызван — телепорта нет при отказе');
    assert.equal(p.mp, 2, 'mp без изменений');
    assert.equal(p.outOfCombatEffects, undefined, 'записей нет');
  }
  {
    let calls = 0;
    const p = spellHero({ spells: ['flame_step'], mp: 2 });
    const r = castOutOfCombat(p, 'flame_step', 10, {
      flameStep: () => { calls += 1;
        return { ok: false, reason: 'некуда шагнуть' }; },
    });
    assert.equal(r.ok, false, 'нет маны + отказ cb → отказ');
    assert.equal(r.reason, 'не хватает маны',
      'одновременные «нет маны» и «телепорт невозможен» → мана');
    assert.equal(calls, 0, 'cb НЕ вызван (проверка маны первая)');
    assert.equal(p.mp, 2, 'mp без изменений');
  }
});

test('000235.07 W-11a: isHeroLit — запись firelight expiresDay > day → true; граница = day → false; < day → false; нет/[]/чужой id/null/мусор → false без краха', () => {
  const { isHeroLit } = loadSpells();
  assert.equal(typeof isHeroLit, 'function',
    '000235.07: export Spells.isHeroLit (src/spells.js) (RED: нет)');
  const day = 10;
  assert.equal(isHeroLit({ outOfCombatEffects: [{ spellId: 'firelight', expiresDay: day + 1 }] }, day),
    true, 'активная (expiresDay = day+1) — true');
  assert.equal(isHeroLit({ outOfCombatEffects: [{ spellId: 'firelight', expiresDay: day }] }, day),
    false, 'граница: expiresDay === day — false (>)');
  assert.equal(isHeroLit({ outOfCombatEffects: [{ spellId: 'firelight', expiresDay: day - 1 }] }, day),
    false, 'истёкшая (expiresDay < day) — false');
  assert.equal(isHeroLit({}, day), false, 'нет поля — false');
  assert.equal(isHeroLit({ outOfCombatEffects: [] }, day), false, 'пустой массив — false');
  assert.equal(isHeroLit({ outOfCombatEffects: [{ spellId: 'hearthfire', expiresDay: day + 2 }] }, day),
    false, 'чужой id — false');
  assert.equal(isHeroLit(null, day), false, 'hero = null — false');
  assert.equal(isHeroLit({ outOfCombatEffects: [
    null, 'мусор', 42, { expiresDay: day + 1 },
    { spellId: 'нет_такого', expiresDay: day + 1 },
  ] }, day), false, 'мусор-записи — false без краха');
});

test('000235.07 W-12a: isHeroCamped — ГРАНИЦА expiresDay >= day (day → true, day+1 → true, day−1 → false), матчинг по id; restoreDay(sheet) бит-в-байт, restoreDay(sheet,1.1) — ×1.1 (HP И MP больше)', () => {
  const { isHeroCamped } = loadSpells();
  assert.equal(typeof isHeroCamped, 'function',
    '000235.07: export Spells.isHeroCamped (src/spells.js) (RED: нет)');
  const day = 10;
  assert.equal(isHeroCamped({ outOfCombatEffects: [{ spellId: 'hearthfire', expiresDay: day }] }, day),
    true, 'граница: expiresDay === day — TRUE (>=, не >)');
  assert.equal(isHeroCamped({ outOfCombatEffects: [{ spellId: 'hearthfire', expiresDay: day + 1 }] }, day),
    true, 'expiresDay = day+1 — true');
  assert.equal(isHeroCamped({ outOfCombatEffects: [{ spellId: 'hearthfire', expiresDay: day - 1 }] }, day),
    false, 'expiresDay < day — false');
  assert.equal(isHeroCamped({ outOfCombatEffects: [{ spellId: 'firelight', expiresDay: day }] }, day),
    false, 'чужой id — false');
  assert.equal(isHeroCamped({}, day), false, 'нет поля — false');
  assert.equal(isHeroCamped(null, day), false, 'null — false');

  const player = require('../src/player.js');
  const Sheet = require('../src/sheet.js');
  function regenHero() {
    const h = player.createCharacter();
    h.primary.constitution = 10;
    h.primary.intelligence = 10;
    h.primary.wisdom = 10;
    h.level = 1;
    h.hp = 0;
    h.mp = 0;
    return h;
  }
  const base = Sheet.restoreDay(regenHero());
  const boost = Sheet.restoreDay(regenHero(), 1.1);
  assert.ok(base.hp > 0 && base.mp > 0, 'фикстура: базовый реген > 0');
  assert.ok(boost.hp > base.hp,
    '×1.1 — HP реген больше (RED: regenMult-аргумент не учитывается)');
  assert.ok(boost.mp > base.mp,
    '×1.1 — MP реген больше (RED: regenMult-аргумент не учитывается)');
});

test('000235.07 W-13: призывы flame_imp/phoenix — makeAlly level=уровень спелла, summonTurns=4, имя/роль из MOB_TYPES; детерминизм (seed); fail-closed «неизвестный призыв»', () => {
  const dataMod = loadSpellsData();
  assert.ok(dataMod.SPELLS_BY_ID['flame_imp'], 'W-13: flame_imp (RED: нет)');
  assert.ok(dataMod.SPELLS_BY_ID['phoenix'], 'W-13: phoenix (RED: нет)');
  const { castSpell } = loadSpells();
  function summonCase(spellId, level, name, role) {
    const p = spellHero({ spells: [spellId], intelligence: 11, mp: 40 });
    const c = soloCombat(p, 'wolf');
    const r = castSpell(c, spellId);
    assert.equal(r.ok, true, `${spellId}: каст призыва ok (${r.reason})`);
    assert.ok(r.summoned, `${spellId}: r.summoned`);
    const a = c.units.find((u) => u.id === r.summoned);
    assert.ok(a, `${spellId}: призванный в c.units`);
    assert.equal(a.kind, 'summon', `${spellId}: kind summon`);
    assert.equal(a.summonTurns, 4, `${spellId}: summonTurns 4`);
    assert.equal(a.level, level, `${spellId}: level = уровень спелла`);
    assert.equal(a.name, name, `${spellId}: имя из MOB_TYPES`);
    assert.equal(a.role, role, `${spellId}: роль из MOB_TYPES`);
  }
  summonCase('flame_imp', 2, 'Имп', 'ranged');
  summonCase('phoenix', 4, 'Огненный стихийник', 'melee');
  // Детерминизм: два одинаковых боя (seed) → одинаковые статистики.
  {
    const p1 = spellHero({ spells: ['flame_imp'], intelligence: 11, mp: 40 });
    const c1 = soloCombat(p1, 'wolf');
    castSpell(c1, 'flame_imp');
    const a1 = c1.units.find((u) => u.kind === 'summon');
    const p2 = spellHero({ spells: ['flame_imp'], intelligence: 11, mp: 40 });
    const c2 = soloCombat(p2, 'wolf');
    castSpell(c2, 'flame_imp');
    const a2 = c2.units.find((u) => u.kind === 'summon');
    assert.equal(a1.maxHP, a2.maxHP, 'детерминизм: maxHP');
    assert.equal(a1.dmg, a2.dmg, 'детерминизм: dmg');
    assert.equal(a1.armor, a2.armor, 'детерминизм: armor');
  }
  // Fail-closed: гость-призыв с неизвестным mob → «неизвестный призыв: X».
  const bad = Object.assign(ocGuest0235('w13_badsummon', {
    действие: 'призыв', параметры: { summon: 'nope', turns: 4 }, вне_боя: false,
  }));
  try {
    pushOcGuests(dataMod, [bad]);
    const p = spellHero({ spells: [bad.id], intelligence: 11, mp: 40 });
    const c = soloCombat(p, 'wolf');
    const r = castSpell(c, bad.id);
    assert.equal(r.ok, false, 'неизвестный призыв — отказ');
    assert.equal(r.reason, 'неизвестный призыв: nope', 'fail-closed reason');
    assert.equal(p.mp, 40, 'отказ — до расхода маны');
  } finally {
    popOcGuests(dataMod, [bad]);
  }
});

// --- Задача 000235.08: волна Лёд — 25 заклинаний + 25 свитков (TDD) ---
//
// Контракт: memory/000235.08-ice-wave-content.md. RED: записи/свитки/
// иконки/пул/зеркала/экспорты отсутствуют (ENOENT / undefined / count) —
// осмысленно, не синтаксис. Таблица ТЗ дословно; нумерация append-only:
// spells 000043–000067, свитки items 000133–000157 (тот же порядок).
// W-01 = ре-пин «ровно 67» (зеркало выше), W-08 = ре-пин fire W-08 67/157.

const ICE08 = [
  // id, название, действие, уровень, степень, база(файл|null), мани, вне_боя
  ['ice_lance', 'Ледяное копьё', 'урон', 1, 1, null, 4, false],
  ['rime_bolt', 'Морозный снаряд', 'урон', 2, 2, 'assets/spells/000043.json', 6, false],
  ['hail', 'Град', 'урон', 2, 1, null, 7, false],
  ['shatter', 'Расколоть', 'урон', 3, 3, 'assets/spells/000044.json', 12, false],
  ['glacial_spike', 'Ледяной пик', 'урон', 3, 1, null, 10, false],
  ['permafrost', 'Вечная мерзлота', 'урон', 4, 1, null, 20, false],
  ['absolute_zero', 'Абсолютный ноль', 'урон', 4, 1, null, 20, false],
  ['ice_field', 'Ледяное поле', 'создание', 2, 1, null, 8, false],
  ['wall_of_ice', 'Ледяная стена', 'создание', 3, 1, null, 12, false],
  ['blizzard_field', 'Поле метели', 'создание', 4, 1, null, 20, false],
  ['frost_aura', 'Морозная аура', 'баф', 2, 2, 'assets/spells/000056.json', 7, false],
  ['ice_armor', 'Ледяные латы', 'баф', 2, 1, null, 8, false],
  ['winter_haste', 'Зимняя спешка', 'баф', 3, 3, 'assets/spells/000053.json', 13, false],
  ['frostbite_blessing', 'Благословение мороза', 'баф', 1, 1, null, 4, false],
  ['slow', 'Морозное замедление', 'дебаф', 1, 1, null, 4, false],
  ['frostbite', 'Обморожение', 'дебаф', 2, 2, 'assets/spells/000057.json', 7, false],
  ['arctic_touch', 'Полярное прикосновение', 'дебаф', 2, 1, null, 7, false],
  ['deep_freeze', 'Глубокое замерзание', 'дебаф', 3, 3, 'assets/spells/000058.json', 10, false],
  ['freeze', 'Заморозить', 'контроль', 2, 1, null, 6, false],
  ['glacier_grasp', 'Ледниковая хватка', 'контроль', 3, 1, null, 12, false],
  ['frost_wisp', 'Морозный вестник', 'призыв', 2, 1, null, 8, false],
  ['winter_elemental', 'Зимний элементаль', 'призыв', 3, 1, null, 13, false],
  ['frost_walk', 'Ледяная походка', 'внебой', 2, 1, null, 7, true],
  ['cold_breath', 'Дыхание мороза', 'внебой', 1, 1, null, 5, true],
  ['frozen_stillness', 'Замершая неподвижность', 'внебой', 3, 1, null, 15, true],
];
const ICE08_IDS = ICE08.map((r) => r[0]);
const ICE08_OC = ['frost_walk', 'cold_breath', 'frozen_stillness'];

function iceSpellFile(i) {
  return path.join(DIR, String(43 + i).padStart(6, '0') + '.json');
}
function iceScrollFile(i) {
  return `assets/items/${String(133 + i).padStart(6, '0')}.json`;
}

test('000235.08 W-02: 25 записей spells — id/название/школа/атрибут/действие/уровень/степень/база/мани/icon/icon_prompt/здания/предметы/вне_боя по таблице ТЗ', () => {
  let ocCount = 0;
  ICE08.forEach((row, i) => {
    const [id, name, action, level, degree, base, mana, oc] = row;
    const f = iceSpellFile(i);
    assert.ok(fs.existsSync(f),
      `W-02: запись отсутствует — ${path.basename(f)} (${id}) (RED: файл нет)`);
    const d = JSON.parse(fs.readFileSync(f, 'utf8'));
    assert.equal(d.id, id, `${id}: id`);
    assert.equal(d.название, name, `${id}: название`);
    assert.equal(d.школа, 'лёд', `${id}: школа`);
    assert.equal(d.атрибут, 'intelligence', `${id}: атрибут`);
    assert.equal(d.действие, action, `${id}: действие`);
    assert.equal(d.уровень, level, `${id}: уровень`);
    assert.equal(d.степень, degree, `${id}: степень`);
    assert.equal(d.база, base, `${id}: база`);
    assert.equal(d.мани, mana, `${id}: мани`);
    assert.equal(d.icon, `assets/spell-icons/${id}.svg`, `${id}: icon`);
    assert.ok(typeof d.icon_prompt === 'string' && d.icon_prompt.trim().length > 0,
      `${id}: icon_prompt непустое`);
    assert.ok(typeof d.описание === 'string' && d.описание.trim().length > 0,
      `${id}: описание непустое`);
    assert.deepEqual(d.здания, ['assets/buildings/000018.json'],
      `${id}: здания = [000018]`);
    assert.deepEqual(d.предметы, [iceScrollFile(i)],
      `${id}: предметы = [свой свиток ${iceScrollFile(i)}]`);
    assert.equal(d.вне_боя === true, oc, `${id}: вне_боя`);
    if (oc) ocCount += 1;
  });
  assert.equal(ocCount, 3,
    'вне_боя — ровно 3 (frost_walk/cold_breath/frozen_stillness)');
});

test('000235.08 W-03: параметры по D1 — точный deepEqual на всех 25 (таблица §1.5); урон/контроль — без «параметры»; цепочки C1/C2/C3 — степень = база+1, база = файл предка; мани в полосах L1 3–5 / L2 6–8 / L3 10–15 / L4 20', () => {
  const P = {
    ice_field: { object: 'зона', stat: 'ход_вниз', value: 0.15, turns: 3, radius: 2 },
    wall_of_ice: { object: 'стена', turns: 5 },
    blizzard_field: { object: 'зона', stat: 'dot', value: 1, turns: 3, radius: 2 },
    frost_aura: { stat: 'урон', value: 0.15, turns: 3 },
    ice_armor: { stat: 'броня', value: 1, turns: 3 },
    winter_haste: { stat: 'ход', value: 1, turns: 3 },
    frostbite_blessing: { stat: 'попадание', value: 0.1, turns: 3 },
    slow: { stat: 'ход_вниз', value: 0.15, turns: 3 },
    frostbite: { stat: 'броня_вниз', value: 1, turns: 3 },
    arctic_touch: { stat: 'урон_вниз', value: 0.15, turns: 3 },
    deep_freeze: { stat: 'урон_вниз', value: 0.30, turns: 3 },
    frost_wisp: { summon: 'wind_elemental', turns: 4 },
    winter_elemental: { summon: 'water_elemental', turns: 4 },
    frost_walk: { days: 1 },
    cold_breath: { days: 1, radius: 5 },
    frozen_stillness: { days: 1, radius: 5 },
  };
  const NO_PARAMS = new Set([
    'ice_lance', 'rime_bolt', 'hail', 'shatter', 'glacial_spike',
    'permafrost', 'absolute_zero', 'freeze', 'glacier_grasp',
  ]);
  ICE08.forEach((row, i) => {
    const id = row[0];
    const f = iceSpellFile(i);
    assert.ok(fs.existsSync(f), `W-03: запись отсутствует — ${id} (RED)`);
    const d = JSON.parse(fs.readFileSync(f, 'utf8'));
    const expected = P[id];
    if (expected !== undefined) {
      assert.deepEqual(d.параметры, expected, `${id}: параметры по D1`);
    } else {
      assert.equal(d.параметры, undefined,
        `${id}: БЕЗ «параметры» (${NO_PARAMS.has(id) ? 'урон/контроль' : 'ошибка таблицы'})`);
    }
  });
  // Цепочки (таблица §1.3): степень = степень предка + 1; база — файл предка.
  const byId = new Map(ICE08.map((r) => [r[0], r]));
  const CHAINS = [
    ['rime_bolt', 'ice_lance'],
    ['shatter', 'rime_bolt'],
    ['frost_aura', 'frostbite_blessing'],
    ['winter_haste', 'frost_aura'],
    ['frostbite', 'slow'],
    ['deep_freeze', 'frostbite'],
  ];
  for (const [child, parent] of CHAINS) {
    const ci = ICE08_IDS.indexOf(child);
    const pi = ICE08_IDS.indexOf(parent);
    assert.ok(ci >= 0 && pi >= 0, `цепочка: ${child}/${parent} в таблице`);
    const childDegree = byId.get(child)[4];
    const parentDegree = byId.get(parent)[4];
    assert.equal(childDegree, parentDegree + 1,
      `цепочка ${parent} → ${child}: степень = ${parentDegree} + 1`);
    assert.equal(byId.get(child)[5],
      `assets/spells/${String(43 + pi).padStart(6, '0')}.json`,
      `цепочка ${parent} → ${child}: база (таблица) = файл предка`);
  }
  for (const [child, parent] of CHAINS) {
    const ci = ICE08_IDS.indexOf(child);
    const f = iceSpellFile(ci);
    if (!fs.existsSync(f)) continue; // RED: файл нет — выше упали
    const d = JSON.parse(fs.readFileSync(f, 'utf8'));
    const parentFile = String(43 + ICE08_IDS.indexOf(parent))
      .padStart(6, '0') + '.json';
    assert.equal(d.база, 'assets/spells/' + parentFile,
      `цепочка ${parent} → ${child}: база = файл предка`);
  }
  // Мани — в полосах по уровню (баланс-пин, паттерн калибровки ТЗ).
  const BANDS = { 1: [3, 5], 2: [6, 8], 3: [10, 15], 4: [20, 20] };
  ICE08.forEach(([id, , , level, , , mana]) => {
    const [lo, hi] = BANDS[level];
    assert.ok(mana >= lo && mana <= hi,
      `${id}: мани ${mana} в полосе L${level} [${lo}..${hi}]`);
  });
});

test('000235.08 W-04: гейт каста вне боя — 22 боевых «боевое заклинание» до расхода/мутаций; 3 внебоевых → {ok:true} + запись {spellId, expiresDay: day+1}; мана < мани → отказ ДО мутаций; рекаст — in-place (один слот, expiresDay обновлён)', () => {
  const dataMod = loadSpellsData();
  const { castOutOfCombat } = loadSpells();
  const day = 10;
  const ocMana = { frost_walk: 7, cold_breath: 5, frozen_stillness: 15 };
  for (const id of ICE08_OC) {
    assert.ok(dataMod.SPELLS_BY_ID[id],
      `W-04: ${id} — запись в каталоге (RED: нет)`);
    const p = spellHero({ spells: [id], mp: 30 });
    const r = castOutOfCombat(p, id, day);
    assert.equal(r.ok, true, `${id}: каст вне боя ok (${r.reason})`);
    assert.equal(r.expiresDay, day + 1, `${id}: days 1 → expiresDay = day+1`);
    assert.equal(p.mp, 30 - ocMana[id], `${id}: мана ровно «мани» (${ocMana[id]})`);
    assert.deepEqual(p.outOfCombatEffects,
      [{ spellId: id, expiresDay: day + 1 }],
      `${id}: запись generic-ядром {spellId, expiresDay: day+days}`);
  }
  const combatIds = ICE08_IDS.filter((id) => !ICE08_OC.includes(id));
  assert.equal(combatIds.length, 22, '25 − 3 внебоевых = 22 боевых');
  for (const id of combatIds) {
    assert.ok(dataMod.SPELLS_BY_ID[id], `W-04: ${id} — запись (RED: нет)`);
    const p = spellHero({ spells: [id], mp: 30 });
    const r = castOutOfCombat(p, id, day);
    assert.equal(r.ok, false, `${id}: боевое вне боя — отказ`);
    assert.equal(r.reason, 'боевое заклинание', `${id}: причина по флагу`);
    assert.equal(p.mp, 30, `${id}: отказ — до расхода`);
    assert.equal(p.outOfCombatEffects, undefined, `${id}: отказ — без мутаций`);
  }
  {
    const p = spellHero({ spells: ['frozen_stillness'], mp: 14 });
    const r = castOutOfCombat(p, 'frozen_stillness', day);
    assert.equal(r.ok, false, 'мана 14 < 15 — отказ');
    assert.equal(r.reason, 'не хватает маны', 'причина — мана');
    assert.equal(p.mp, 14, 'отказ ДО мутаций: mp нетронут');
    assert.equal(p.outOfCombatEffects, undefined,
      'отказ ДО мутаций: записей нет');
  }
  {
    const p = spellHero({ spells: ['frost_walk'], mp: 30 });
    assert.equal(castOutOfCombat(p, 'frost_walk', day).ok, true, 'каст 1 (день 10)');
    assert.equal(p.outOfCombatEffects.length, 1, 'одна запись');
    const first = p.outOfCombatEffects[0];
    assert.equal(castOutOfCombat(p, 'frost_walk', day + 1).ok, true,
      'рекаст (день 11)');
    assert.equal(p.outOfCombatEffects.length, 1,
      'рекаст in-place: записей ровно одна (не дубль)');
    assert.equal(p.outOfCombatEffects[0], first,
      'рекаст in-place: тот же объект записи');
    assert.equal(p.outOfCombatEffects[0].expiresDay, day + 2,
      'рекаст: expiresDay обновлён (day+1 → day+2)');
  }
});

test('000235.08 W-10a: frost_walk — каст → запись {frost_walk, expiresDay: day+1}, мана 7; isHeroFrostWalk: активная (expiresDay = day+1) → true; граница expiresDay = day → false; < day → false; чужой id / нет поля / null / мусор → false без краха', () => {
  const dataMod = loadSpellsData();
  assert.ok(dataMod.SPELLS_BY_ID['frost_walk'],
    'W-10a: запись frost_walk в каталоге (RED: нет)');
  const { castOutOfCombat } = loadSpells();
  const day = 10;
  const p = spellHero({ spells: ['frost_walk'], mp: 30 });
  const r = castOutOfCombat(p, 'frost_walk', day);
  assert.equal(r.ok, true, 'frost_walk: каст вне боя ok (' + r.reason + ')');
  assert.equal(p.mp, 23, 'мана ровно 7');
  assert.deepEqual(p.outOfCombatEffects,
    [{ spellId: 'frost_walk', expiresDay: day + 1 }],
    'запись {frost_walk, expiresDay: day+1}');
  const { isHeroFrostWalk } = loadSpells();
  assert.equal(typeof isHeroFrostWalk, 'function',
    '000235.08: export Spells.isHeroFrostWalk (src/spells.js) (RED: нет)');
  assert.equal(isHeroFrostWalk({ outOfCombatEffects:
    [{ spellId: 'frost_walk', expiresDay: day + 1 }] }, day),
    true, 'активная (expiresDay = day+1) — true');
  assert.equal(isHeroFrostWalk({ outOfCombatEffects:
    [{ spellId: 'frost_walk', expiresDay: day }] }, day),
    false, 'граница: expiresDay === day — false (>, не >=)');
  assert.equal(isHeroFrostWalk({ outOfCombatEffects:
    [{ spellId: 'frost_walk', expiresDay: day - 1 }] }, day),
    false, 'истёкшая (expiresDay < day) — false');
  assert.equal(isHeroFrostWalk({}, day), false, 'нет поля — false');
  assert.equal(isHeroFrostWalk(null, day), false, 'hero = null — false');
  assert.equal(isHeroFrostWalk({ outOfCombatEffects:
    [{ spellId: 'cold_breath', expiresDay: day + 2 }] }, day),
    false, 'чужой id — false (матчинг по spellId)');
  assert.equal(isHeroFrostWalk({ outOfCombatEffects:
    [null, 'мусор', 42, { expiresDay: day + 1 },
     { spellId: 'нет_такого', expiresDay: day + 1 }] }, day),
    false, 'мусор-записи — false без краха');
});

test('000235.08 W-11a: findZoneCombat — без 5-го аргумента бит-в-бит (регрессия: триггер dist 2 → зона, dist 0 — приоритет, neutral не триггерит, tie-break лексико); c5=5: триггер dist 2 → НИ ЗОНЫ (2→1), dist 1 → зона, dist-0/neutral — нетронуты; c5=0 → идентично; coldBreathRadius: max по активным, битое/нет radius → 5, нет → 0, граница >', () => {
  const { findZoneCombat, groupZoneInfo } = require('../src/combat.js');
  assert.ok(groupZoneInfo(4).triggers,
    'фикстура: группа 4 (паучье гнездо) — триггерящая (r2)');
  assert.ok(!groupZoneInfo(2).triggers,
    'фикстура: группа 2 (логово скелетов) — не триггерит');
  const trigger = { x: 2, y: 3, hasMobGroup: true, mobGroup: 4 };
  const neutral = { x: 0, y: 3, hasMobGroup: true, mobGroup: 2 };
  const tiles = [trigger, neutral];
  const d0 = null;
  // (a) Регрессия: 5-й аргумент НЕ ПЕРЕДАН — бит-в-бит со старым.
  assert.deepEqual(findZoneCombat(0, 1, tiles, d0),
    { x: 2, y: 3, mobGroup: 4 }, 'dist 2 (Чебышёв) → зона r2');
  assert.deepEqual(findZoneCombat(2, 3, tiles, d0),
    { x: 2, y: 3, mobGroup: 4 }, 'dist 0 — приоритет (свой тайл)');
  assert.deepEqual(findZoneCombat(0, 3, tiles, d0),
    { x: 0, y: 3, mobGroup: 2 }, 'dist 0 — приоритет даже над зоной');
  assert.equal(findZoneCombat(5, 5, tiles, d0), null, 'вне зон — null');
  assert.equal(findZoneCombat(0, 1, tiles, new Set(['2,3'])), null,
    'defeated — зона не триггерит');
  const two = [
    { x: 4, y: 1, hasMobGroup: true, mobGroup: 4 },
    { x: 1, y: 5, hasMobGroup: true, mobGroup: 4 },
  ];
  assert.deepEqual(findZoneCombat(2, 3, two, d0),
    { x: 1, y: 5, mobGroup: 4 }, 'равный dist — tie-break (x, y) лексико');
  // (b) c5 = 0 — идентично вызову без аргумента.
  assert.deepEqual(findZoneCombat(0, 1, tiles, d0, 0),
    { x: 2, y: 3, mobGroup: 4 }, 'c5=0: dist 2 → зона (нет сужения)');
  assert.deepEqual(findZoneCombat(0, 3, tiles, d0, 0),
    { x: 0, y: 3, mobGroup: 2 }, 'c5=0: dist-0 нетронут');
  // (c) c5 = 5: зона триггерящей группы сжимается 2→1 (Chebyshev ≤ 5).
  assert.equal(findZoneCombat(0, 1, tiles, d0, 5), null,
    'c5=5: dist 2 → НИ ЗОНЫ (eff r = max(1, 2−1) = 1; 2 > 1) (RED: нет 5-го аргумента)');
  assert.deepEqual(findZoneCombat(1, 2, tiles, d0, 5),
    { x: 2, y: 3, mobGroup: 4 },
    'c5=5: dist 1 → зона (eff 1 ≥ 1 — зона НЕ гаснет полностью)');
  assert.deepEqual(findZoneCombat(0, 3, tiles, d0, 5),
    { x: 0, y: 3, mobGroup: 2 }, 'c5=5: dist-0 (neutral) нетронут');
  assert.deepEqual(findZoneCombat(2, 3, tiles, d0, 5),
    { x: 2, y: 3, mobGroup: 4 }, 'c5=5: dist-0 (trigger) нетронут');
  // (d) coldBreathRadius — паттерн wardRadius.
  const { coldBreathRadius } = loadSpells();
  assert.equal(typeof coldBreathRadius, 'function',
    '000235.08: export Spells.coldBreathRadius (src/spells.js) (RED: нет)');
  const day10 = 10;
  const rec = (expiresDay) => ({ spellId: 'cold_breath', expiresDay });
  assert.equal(coldBreathRadius({ outOfCombatEffects: [rec(day10)] }, day10), 0,
    'граница expiresDay = day → 0 (>, не >=)');
  assert.equal(coldBreathRadius({ outOfCombatEffects: [rec(day10 - 1)] }, day10), 0,
    'expiresDay < day → 0');
  assert.equal(coldBreathRadius({ outOfCombatEffects: [rec(day10 + 1)] }, day10), 5,
    'активная (day+1) → радиус каталога (5)');
  assert.equal(coldBreathRadius({ outOfCombatEffects:
    [rec(day10), rec(day10 + 1)] }, day10), 5,
    'истёкшая + активная → радиус АКТИВНОЙ');
  assert.equal(coldBreathRadius({ outOfCombatEffects:
    [{ spellId: 'frozen_stillness', expiresDay: day10 + 1 }] }, day10), 0,
    'чужой id → 0 (матчинг по spellId)');
  assert.equal(coldBreathRadius({ outOfCombatEffects: [] }, day10), 0, '[] → 0');
  assert.equal(coldBreathRadius({}, day10), 0, 'нет поля → 0');
  assert.equal(coldBreathRadius(null, day10), 0, 'hero = null → 0');
  assert.equal(coldBreathRadius({ outOfCombatEffects: 'бито' }, day10), 0,
    'effects не массив → 0');
  assert.equal(coldBreathRadius({ outOfCombatEffects:
    [null, 'мусор', 42, { expiresDay: day10 + 1 },
     { spellId: 'нет_такого_заклинания', expiresDay: day10 + 1 }] }, day10), 0,
    'мусор-записи → 0 без краха');
  const p = { outOfCombatEffects: [rec(day10 + 1)] };
  for (let i = 0; i < 5; i++) {
    assert.equal(coldBreathRadius(p, day10), 5, 'повторный вызов i=' + i
      + ' — стабильно (без RNG)');
  }
  // (e) radius — ленивым lookup из каталога (гость 1/3/5 → значение,
  //     невалидный/отсутствует → дефолт 5).
  const dataMod = loadSpellsData();
  const mkBreath = (over) => portalGuest0235('cold_breath', Object.assign(
    { действие: 'внебой', параметры: { days: 1, radius: 5 } }, over));
  for (const [radius, expected] of [[1, 1], [3, 3], [5, 5]]) {
    const g = mkBreath({ параметры: { days: 1, radius } });
    try {
      pushOcGuests(dataMod, [g]);
      const r = coldBreathRadius({ outOfCombatEffects:
        [{ spellId: 'cold_breath', expiresDay: day10 + 1 }] }, day10);
      assert.equal(r, expected, 'ленивый lookup: гость r=' + radius + ' → ' + expected);
    } finally {
      popOcGuests(dataMod, [g]);
    }
  }
  for (const radius of ['нет', 9, 0, 1.5, null]) {
    const g = mkBreath({ параметры: { days: 1, radius } });
    try {
      pushOcGuests(dataMod, [g]);
      const r = coldBreathRadius({ outOfCombatEffects:
        [{ spellId: 'cold_breath', expiresDay: day10 + 1 }] }, day10);
      assert.equal(r, 5,
        'невалидный radius (' + JSON.stringify(radius) + ') → ДЕФОЛТ 5');
    } finally {
      popOcGuests(dataMod, [g]);
    }
  }
  {
    const g = mkBreath({ параметры: { days: 1 } });
    try {
      pushOcGuests(dataMod, [g]);
      const r = coldBreathRadius({ outOfCombatEffects:
        [{ spellId: 'cold_breath', expiresDay: day10 + 1 }] }, day10);
      assert.equal(r, 5, 'radius отсутствует → ДЕФОЛТ 5');
    } finally {
      popOcGuests(dataMod, [g]);
    }
  }
});

test('000235.08 W-12a: frozenStillnessRadius — паттерн wardRadius: активная → радиус каталога (5); граница expiresDay = day → 0; чужой id (cold_breath) → 0; [] / нет поля / null / мусор → 0; max по двум активным; radius — ленивым lookup (гость 1/3/5, невалидный/отсутствует → дефолт 5)', () => {
  const { frozenStillnessRadius } = loadSpells();
  assert.equal(typeof frozenStillnessRadius, 'function',
    '000235.08: export Spells.frozenStillnessRadius (src/spells.js) (RED: нет)');
  const day = 10;
  const rec = (expiresDay) => ({ spellId: 'frozen_stillness', expiresDay });
  assert.equal(frozenStillnessRadius({ outOfCombatEffects: [rec(day)] }, day), 0,
    'граница expiresDay = day → 0 (>, не >=)');
  assert.equal(frozenStillnessRadius({ outOfCombatEffects: [rec(day - 1)] }, day), 0,
    'expiresDay < day → 0');
  assert.equal(frozenStillnessRadius({ outOfCombatEffects: [rec(day + 1)] }, day), 5,
    'активная (day+1) → радиус каталога (5)');
  assert.equal(frozenStillnessRadius({ outOfCombatEffects:
    [rec(day), rec(day + 2)] }, day), 5,
    'истёкшая + активная → радиус АКТИВНОЙ');
  assert.equal(frozenStillnessRadius({ outOfCombatEffects:
    [{ spellId: 'cold_breath', expiresDay: day + 1 }] }, day), 0,
    'чужой id (cold_breath) → 0 (матчинг по spellId)');
  assert.equal(frozenStillnessRadius({ outOfCombatEffects: [] }, day), 0, '[] → 0');
  assert.equal(frozenStillnessRadius({}, day), 0, 'нет поля → 0');
  assert.equal(frozenStillnessRadius(null, day), 0, 'hero = null → 0');
  assert.equal(frozenStillnessRadius({ outOfCombatEffects: 'бито' }, day), 0,
    'effects не массив → 0');
  assert.equal(frozenStillnessRadius({ outOfCombatEffects:
    [null, 'мусор', 42, { expiresDay: day + 1 },
     { spellId: 'нет_такого_заклинания', expiresDay: day + 1 }] }, day), 0,
    'мусор-записи → 0 без краха');
  const p = { outOfCombatEffects: [rec(day + 1)] };
  for (let i = 0; i < 5; i++) {
    assert.equal(frozenStillnessRadius(p, day), 5, 'повторный вызов i=' + i
      + ' — стабильно (без RNG)');
  }
  const dataMod = loadSpellsData();
  const mkStill = (over) => portalGuest0235('frozen_stillness', Object.assign(
    { действие: 'внебой', параметры: { days: 1, radius: 5 } }, over));
  for (const [radius, expected] of [[1, 1], [3, 3], [5, 5]]) {
    const g = mkStill({ параметры: { days: 1, radius } });
    try {
      pushOcGuests(dataMod, [g]);
      const r = frozenStillnessRadius({ outOfCombatEffects:
        [{ spellId: 'frozen_stillness', expiresDay: day + 1 }] }, day);
      assert.equal(r, expected, 'ленивый lookup: гость r=' + radius + ' → ' + expected);
    } finally {
      popOcGuests(dataMod, [g]);
    }
  }
  for (const radius of ['нет', 9, 0, 1.5, null]) {
    const g = mkStill({ параметры: { days: 1, radius } });
    try {
      pushOcGuests(dataMod, [g]);
      const r = frozenStillnessRadius({ outOfCombatEffects:
        [{ spellId: 'frozen_stillness', expiresDay: day + 1 }] }, day);
      assert.equal(r, 5,
        'невалидный radius (' + JSON.stringify(radius) + ') → ДЕФОЛТ 5');
    } finally {
      popOcGuests(dataMod, [g]);
    }
  }
  {
    const g = mkStill({ параметры: { days: 1 } });
    try {
      pushOcGuests(dataMod, [g]);
      const r = frozenStillnessRadius({ outOfCombatEffects:
        [{ spellId: 'frozen_stillness', expiresDay: day + 1 }] }, day);
      assert.equal(r, 5, 'radius отсутствует → ДЕФОЛТ 5');
    } finally {
      popOcGuests(dataMod, [g]);
    }
  }
});

test('000235.08 W-13: призывы frost_wisp/winter_elemental — makeAlly level=уровень спелла, summonTurns=4, имя/роль из MOB_TYPES (wind_elemental — «Ветряной стихийник» ranged; water_elemental — «Водный стихийник» melee); детерминизм (seed); fail-closed «неизвестный призыв»', () => {
  const dataMod = loadSpellsData();
  assert.ok(dataMod.SPELLS_BY_ID['frost_wisp'],
    'W-13: frost_wisp — запись в каталоге (RED: нет)');
  assert.ok(dataMod.SPELLS_BY_ID['winter_elemental'],
    'W-13: winter_elemental — запись в каталоге (RED: нет)');
  const { castSpell } = loadSpells();
  function summonCase(spellId, level, name, role) {
    const p = spellHero({ spells: [spellId], intelligence: 11, mp: 40 });
    const c = soloCombat(p, 'wolf');
    const r = castSpell(c, spellId);
    assert.equal(r.ok, true, `${spellId}: каст призыва ok (${r.reason})`);
    assert.ok(r.summoned, `${spellId}: r.summoned`);
    const a = c.units.find((u) => u.id === r.summoned);
    assert.ok(a, `${spellId}: призванный в c.units`);
    assert.equal(a.kind, 'summon', `${spellId}: kind summon`);
    assert.equal(a.summonTurns, 4, `${spellId}: summonTurns 4`);
    assert.equal(a.level, level, `${spellId}: level = уровень спелла`);
    assert.equal(a.name, name, `${spellId}: имя из MOB_TYPES`);
    assert.equal(a.role, role, `${spellId}: роль из MOB_TYPES`);
  }
  summonCase('frost_wisp', 2, 'Ветряной стихийник', 'ranged');
  summonCase('winter_elemental', 3, 'Водный стихийник', 'melee');
  // Детерминизм: два одинаковых боя (seed) → одинаковые статистики.
  {
    const p1 = spellHero({ spells: ['frost_wisp'], intelligence: 11, mp: 40 });
    const c1 = soloCombat(p1, 'wolf');
    castSpell(c1, 'frost_wisp');
    const a1 = c1.units.find((u) => u.kind === 'summon');
    const p2 = spellHero({ spells: ['frost_wisp'], intelligence: 11, mp: 40 });
    const c2 = soloCombat(p2, 'wolf');
    castSpell(c2, 'frost_wisp');
    const a2 = c2.units.find((u) => u.kind === 'summon');
    assert.equal(a1.maxHP, a2.maxHP, 'детерминизм: maxHP');
    assert.equal(a1.dmg, a2.dmg, 'детерминизм: dmg');
    assert.equal(a1.armor, a2.armor, 'детерминизм: armor');
  }
  // Fail-closed: гость-призыв с неизвестным mob → «неизвестный призыв: X».
  const bad = Object.assign(ocGuest0235('w13_ice_badsummon', {
    действие: 'призыв', параметры: { summon: 'nope', turns: 4 }, вне_боя: false,
  }));
  try {
    pushOcGuests(dataMod, [bad]);
    const p = spellHero({ spells: [bad.id], intelligence: 11, mp: 40 });
    const c = soloCombat(p, 'wolf');
    const r = castSpell(c, bad.id);
    assert.equal(r.ok, false, 'неизвестный призыв — отказ');
    assert.equal(r.reason, 'неизвестный призыв: nope', 'fail-closed reason');
    assert.equal(p.mp, 40, 'отказ — до расхода маны');
  } finally {
    popOcGuests(dataMod, [bad]);
  }
});

// --- Задача 000235.09: волна Тень — 25 заклинаний + 25 свитков (TDD) ---
//
// Контракт: memory/000235.09-shadow-wave-content.md. RED: записи/свитки/
// иконки/пул/зеркала/экспорты отсутствуют (ENOENT / undefined / count) —
// осмысленно, не синтаксис. Таблица ТЗ дословно; нумерация append-only:
// spells 000068–000092, свитки items 000233–000257 (тот же порядок).
// W-01 = ре-пин «ровно 92» (зеркало выше), W-08 = ре-пин fire W-08 92/257.

const SHADOW09 = [
  // id, название, действие, уровень, степень, база(файл|null), мани, вне_боя
  ['umbra_bolt', 'Умбровый снаряд', 'урон', 1, 1, null, 4, false],
  ['drain_life', 'Пожизненная сила', 'урон', 2, 2, 'assets/spells/000068.json', 6, false],
  ['void_arrow', 'Стрела пустоты', 'урон', 3, 1, null, 11, false],
  ['night_strike', 'Ночной удар', 'урон', 3, 1, null, 12, false],
  ['soul_drain', 'Извлечение души', 'урон', 4, 3, 'assets/spells/000069.json', 20, false],
  ['shadowflame', 'Теневое пламя', 'урон', 4, 1, null, 20, false],
  ['dark_nova', 'Тёмная нова', 'урон', 4, 1, null, 20, false],
  ['shroud', 'Теневая вуаль', 'баф', 1, 1, null, 3, false],
  ['night_blade', 'Ночное лезвие', 'баф', 2, 2, 'assets/spells/000075.json', 6, false],
  ['vampire_touch', 'Вампирское прикосновение', 'баф', 3, 3, 'assets/spells/000076.json', 12, false],
  ['fear', 'Страх', 'дебаф', 2, 1, null, 6, false],
  ['doom_mark', 'Печать дурного предзнаменования', 'дебаф', 3, 2, 'assets/spells/000078.json', 11, false],
  ['despair', 'Отчаяние', 'дебаф', 3, 1, null, 12, false],
  ['shadow_curse', 'Теневое проклятие', 'дебаф', 4, 3, 'assets/spells/000079.json', 20, false],
  ['shadow_bind', 'Теневые узы', 'контроль', 2, 1, null, 6, false],
  ['nightmare', 'Кошмар', 'контроль', 3, 1, null, 12, false],
  ['dark_ensnare', 'Тёмные оковы', 'контроль', 4, 1, null, 20, false],
  ['shadow_pool', 'Лужа тьмы', 'создание', 2, 1, null, 8, false],
  ['veil_of_night', 'Покров ночи', 'создание', 3, 1, null, 13, false],
  ['shadow_wraith', 'Теневой виверн', 'призыв', 3, 1, null, 14, false],
  ['void_horror', 'Ужас пустоты', 'призыв', 4, 1, null, 20, false],
  ['shadow_step', 'Теневой шаг', 'телепорт', 1, 1, null, 5, true],
  ['invisibility', 'Невидимость', 'невидимость', 2, 1, null, 7, true],
  ['shroud_of_night', 'Ночной покров', 'внебой', 3, 1, null, 15, true],
  ['dark_presence', 'Мрачное присутствие', 'внебой', 1, 1, null, 5, true],
];
const SHADOW09_IDS = SHADOW09.map((r) => r[0]);
const SHADOW09_OC = ['shadow_step', 'invisibility', 'shroud_of_night', 'dark_presence'];

function shadowSpellFile(i) {
  return path.join(DIR, String(68 + i).padStart(6, '0') + '.json');
}
function shadowScrollFile(i) {
  return `assets/items/${String(233 + i).padStart(6, '0')}.json`;
}

test('000235.09 W-02: 25 записей spells — id/название/школа=тень/атрибут/действие/уровень/степень/база/мани/icon/icon_prompt/описание/здания [000018]/предметы = СВОЙ свиток/вне_боя по таблице ТЗ', () => {
  let ocCount = 0;
  SHADOW09.forEach((row, i) => {
    const [id, name, action, level, degree, base, mana, oc] = row;
    const f = shadowSpellFile(i);
    assert.ok(fs.existsSync(f),
      `W-02: запись отсутствует — ${path.basename(f)} (${id}) (RED: файл нет)`);
    const d = JSON.parse(fs.readFileSync(f, 'utf8'));
    assert.equal(d.id, id, `${id}: id`);
    assert.equal(d.название, name, `${id}: название`);
    assert.equal(d.школа, 'тень', `${id}: школа`);
    assert.equal(d.атрибут, 'intelligence', `${id}: атрибут`);
    assert.equal(d.действие, action, `${id}: действие`);
    assert.equal(d.уровень, level, `${id}: уровень`);
    assert.equal(d.степень, degree, `${id}: степень`);
    assert.equal(d.база, base, `${id}: база`);
    assert.equal(d.мани, mana, `${id}: мани`);
    assert.equal(d.icon, `assets/spell-icons/${id}.svg`, `${id}: icon`);
    assert.ok(typeof d.icon_prompt === 'string' && d.icon_prompt.trim().length > 0,
      `${id}: icon_prompt непустое`);
    assert.ok(typeof d.описание === 'string' && d.описание.trim().length > 0,
      `${id}: описание непустое`);
    assert.deepEqual(d.здания, ['assets/buildings/000018.json'],
      `${id}: здания = [000018]`);
    assert.deepEqual(d.предметы, [shadowScrollFile(i)],
      `${id}: предметы = [свой свиток ${shadowScrollFile(i)}]`);
    assert.equal(d.вне_боя === true, oc, `${id}: вне_боя`);
    if (oc) ocCount += 1;
  });
  assert.equal(ocCount, 4,
    'вне_боя — ровно 4 (shadow_step/invisibility/shroud_of_night/'
    + 'dark_presence; 000089–000092)');
});

test('000235.09 W-03: параметры по D1 — точный deepEqual на всех 25 (таблица §1.5); урон/контроль/телепорт — без «параметры»; цепочки C1/C2/C3 — степень = база+1, база = файл предка; мани в полосах L1 3–5 / L2 6–8 / L3 10–15 / L4 20', () => {
  const P = {
    drain_life: { value: 0.5 },
    soul_drain: { value: 0.5 },
    shroud: { stat: 'попадание_вниз', value: 0.25, turns: 3 },
    night_blade: { stat: 'урон', value: 0.15, turns: 3 },
    vampire_touch: { stat: 'вампиризм', value: 0.5, turns: 3 },
    fear: { stat: 'урон_вниз', value: 0.15, turns: 3 },
    doom_mark: { stat: 'получаемый_урон_вверх', value: 0.25, turns: 3 },
    despair: { stat: 'урон_вниз', value: 0.15, turns: 3 },
    shadow_curse: { stat: 'урон_вниз', value: 0.25, turns: 3 },
    shadow_pool: { object: 'зона', stat: 'попадание_вниз', value: 0.15, turns: 3, radius: 2 },
    veil_of_night: { object: 'зона', stat: 'урон_вниз', value: 0.15, turns: 3, radius: 2 },
    shadow_wraith: { summon: 'vampire', turns: 4 },
    void_horror: { summon: 'bone_coloss', turns: 4 },
    invisibility: { days: 1 },
    shroud_of_night: { days: 3, radius: 5 },
    dark_presence: { days: 1, radius: 5 },
  };
  const NO_PARAMS = new Set([
    'umbra_bolt', 'void_arrow', 'night_strike', 'shadowflame',
    'dark_nova', 'shadow_bind', 'nightmare', 'dark_ensnare',
    'shadow_step',
  ]);
  SHADOW09.forEach((row, i) => {
    const id = row[0];
    const f = shadowSpellFile(i);
    assert.ok(fs.existsSync(f), `W-03: запись отсутствует — ${id} (RED)`);
    const d = JSON.parse(fs.readFileSync(f, 'utf8'));
    const expected = P[id];
    if (expected !== undefined) {
      assert.deepEqual(d.параметры, expected, `${id}: параметры по D1`);
    } else {
      assert.equal(d.параметры, undefined,
        `${id}: БЕЗ «параметры» (${NO_PARAMS.has(id) ? 'урон/контроль/телепорт' : 'ошибка таблицы'})`);
    }
  });
  // Цепочки (таблица §1.3): степень = степень предка + 1; база — файл
  // предка.
  const byId = new Map(SHADOW09.map((r) => [r[0], r]));
  const CHAINS = [
    ['drain_life', 'umbra_bolt'],
    ['soul_drain', 'drain_life'],
    ['night_blade', 'shroud'],
    ['vampire_touch', 'night_blade'],
    ['doom_mark', 'fear'],
    ['shadow_curse', 'doom_mark'],
  ];
  for (const [child, parent] of CHAINS) {
    const ci = SHADOW09_IDS.indexOf(child);
    const pi = SHADOW09_IDS.indexOf(parent);
    assert.ok(ci >= 0 && pi >= 0, `цепочка: ${child}/${parent} в таблице`);
    const childDegree = byId.get(child)[4];
    const parentDegree = byId.get(parent)[4];
    assert.equal(childDegree, parentDegree + 1,
      `цепочка ${parent} → ${child}: степень = ${parentDegree} + 1`);
    assert.equal(byId.get(child)[5],
      `assets/spells/${String(68 + pi).padStart(6, '0')}.json`,
      `цепочка ${parent} → ${child}: база (таблица) = файл предка`);
  }
  for (const [child, parent] of CHAINS) {
    const ci = SHADOW09_IDS.indexOf(child);
    const f = shadowSpellFile(ci);
    if (!fs.existsSync(f)) continue; // RED: файл нет — выше упали
    const d = JSON.parse(fs.readFileSync(f, 'utf8'));
    const parentFile = String(68 + SHADOW09_IDS.indexOf(parent))
      .padStart(6, '0') + '.json';
    assert.equal(d.база, 'assets/spells/' + parentFile,
      `цепочка ${parent} → ${child}: база = файл предка`);
  }
  // Мани — в полосах по уровню (баланс-пин, паттерн калибровки ТЗ).
  const BANDS = { 1: [3, 5], 2: [6, 8], 3: [10, 15], 4: [20, 20] };
  SHADOW09.forEach(([id, , , level, , , mana]) => {
    const [lo, hi] = BANDS[level];
    assert.ok(mana >= lo && mana <= hi,
      `${id}: мани ${mana} в полосе L${level} [${lo}..${hi}]`);
  });
});

test('000235.09 W-04: гейт каста вне боя — 21 боевое «боевое заклинание» до расхода/мутаций; 4 внебоевых: shadow_step {ok, expiresDay null, ЗАПИСИ НЕТ, mp −5, ctx.shadowStep вызван}; invisibility {ok, запись day+1, mp −7}; shroud_of_night {ok, запись day+3, mp −15}; dark_presence {ok, запись day+1, mp −5}; мана < мани → отказ ДО мутаций; рекаст — in-place', () => {
  const dataMod = loadSpellsData();
  const { castOutOfCombat } = loadSpells();
  const day = 10;
  for (const [id, days, mana] of [
    ['invisibility', 1, 7],
    ['shroud_of_night', 3, 15],
    ['dark_presence', 1, 5],
  ]) {
    assert.ok(dataMod.SPELLS_BY_ID[id],
      `W-04: ${id} — запись в каталоге (RED: нет)`);
    const p = spellHero({ spells: [id], mp: 30 });
    const r = castOutOfCombat(p, id, day);
    assert.equal(r.ok, true, `${id}: каст вне боя ok (${r.reason})`);
    assert.equal(r.expiresDay, day + days,
      `${id}: days ${days} → expiresDay = day+${days}`);
    assert.equal(p.mp, 30 - mana, `${id}: мана ровно «мани» (${mana})`);
    assert.deepEqual(p.outOfCombatEffects,
      [{ spellId: id, expiresDay: day + days }],
      `${id}: запись generic-ядром {spellId, expiresDay: day+days}`);
  }
  {
    assert.ok(dataMod.SPELLS_BY_ID['shadow_step'],
      'W-04: shadow_step — запись в каталоге (RED: нет)');
    let calls = 0;
    const p = spellHero({ spells: ['shadow_step'], mp: 30 });
    const r = castOutOfCombat(p, 'shadow_step', day, {
      shadowStep: () => { calls += 1; return { ok: true }; },
    });
    assert.equal(r.ok, true, 'shadow_step: каст ok (' + r.reason + ')');
    assert.equal(r.expiresDay, null, 'телепорт — expiresDay null');
    assert.equal(calls, 1, 'ctx.shadowStep вызван');
    assert.equal(p.mp, 25, 'shadow_step: мана 5 (30−5)');
    assert.equal(p.outOfCombatEffects, undefined, 'телепорт — ЗАПИСИ НЕТ');
  }
  const combatIds = SHADOW09_IDS.filter((id) => !SHADOW09_OC.includes(id));
  assert.equal(combatIds.length, 21, '25 − 4 внебоевых = 21 боевых');
  for (const id of combatIds) {
    assert.ok(dataMod.SPELLS_BY_ID[id], `W-04: ${id} — запись (RED: нет)`);
    const p = spellHero({ spells: [id], mp: 30 });
    const r = castOutOfCombat(p, id, day);
    assert.equal(r.ok, false, `${id}: боевое вне боя — отказ`);
    assert.equal(r.reason, 'боевое заклинание', `${id}: причина по флагу`);
    assert.equal(p.mp, 30, `${id}: отказ — до расхода`);
    assert.equal(p.outOfCombatEffects, undefined, `${id}: отказ — без мутаций`);
  }
  {
    const p = spellHero({ spells: ['shroud_of_night'], mp: 14 });
    const r = castOutOfCombat(p, 'shroud_of_night', day);
    assert.equal(r.ok, false, 'мана 14 < 15 — отказ');
    assert.equal(r.reason, 'не хватает маны', 'причина — мана');
    assert.equal(p.mp, 14, 'отказ ДО мутаций: mp нетронут');
    assert.equal(p.outOfCombatEffects, undefined,
      'отказ ДО мутаций: записей нет');
  }
  {
    const p = spellHero({ spells: ['shroud_of_night'], mp: 30 });
    assert.equal(castOutOfCombat(p, 'shroud_of_night', day).ok, true,
      'каст 1 (день 10)');
    assert.equal(p.outOfCombatEffects.length, 1, 'одна запись');
    const first = p.outOfCombatEffects[0];
    assert.equal(castOutOfCombat(p, 'shroud_of_night', day + 1).ok, true,
      'рекаст (день 11)');
    assert.equal(p.outOfCombatEffects.length, 1,
      'рекаст in-place: записей ровно одна (не дубль)');
    assert.equal(p.outOfCombatEffects[0], first,
      'рекаст in-place: тот же объект записи');
    assert.equal(p.outOfCombatEffects[0].expiresDay, day + 4,
      'рекаст: expiresDay обновлён (day+3 → day+4)');
  }
});

test('000235.09 W-10a: shadow_step — ctx.shadowStep: отказ callback → reason + мана откатилась, ЗАПИСЕЙ НЕТ; успех → {ok:true, expiresDay:null}, записи нет, mp −5; ctx без shadowStep → «телепорт недоступен здесь»; нет маны → «не хватает маны» ДО cb (мутаций нет)', () => {
  const dataMod = loadSpellsData();
  assert.ok(dataMod.SPELLS_BY_ID['shadow_step'],
    'W-10a: запись shadow_step в каталоге (RED: нет)');
  const { castOutOfCombat } = loadSpells();
  {
    const p = spellHero({ spells: ['shadow_step'], mp: 30 });
    const r = castOutOfCombat(p, 'shadow_step', 10, {
      shadowStep: () => ({ ok: false, reason: 'нет направления движения' }),
    });
    assert.equal(r.ok, false, 'отказ callback → ok:false');
    assert.equal(r.reason, 'нет направления движения', 'reason из callback');
    assert.equal(p.mp, 30, 'отказ → мана откатилась (не 30−5)');
    assert.equal(p.outOfCombatEffects, undefined, 'телепорт — ЗАПИСЕЙ НЕТ');
  }
  {
    const p = spellHero({ spells: ['shadow_step'], mp: 30 });
    const r = castOutOfCombat(p, 'shadow_step', 10, {
      shadowStep: () => ({ ok: true }),
    });
    assert.equal(r.ok, true, 'успех callback → ok:true');
    assert.equal(r.expiresDay, null, 'телепорт — expiresDay null');
    assert.equal(p.mp, 25, 'успех → мана снята (5)');
    assert.equal(p.outOfCombatEffects, undefined, 'телепорт — записи НЕ создаёт');
  }
  {
    const p = spellHero({ spells: ['shadow_step'], mp: 30 });
    const r = castOutOfCombat(p, 'shadow_step', 10, {});
    assert.equal(r.ok, false, 'без callback → отказ');
    assert.equal(r.reason, 'телепорт недоступен здесь');
    assert.equal(p.mp, 30, 'отказ → мана откатилась');
  }
  {
    let calls = 0;
    const p = spellHero({ spells: ['shadow_step'], mp: 2 });
    const r = castOutOfCombat(p, 'shadow_step', 10, {
      shadowStep: () => { calls += 1; return { ok: true }; },
    });
    assert.equal(r.ok, false, 'нет маны + успешный cb → отказ');
    assert.equal(r.reason, 'не хватает маны',
      'проверка маны ДО cb (ревью: мутация — после всех проверок)');
    assert.equal(calls, 0, 'cb НЕ вызван — телепорта нет при отказе');
    assert.equal(p.mp, 2, 'mp без изменений');
    assert.equal(p.outOfCombatEffects, undefined, 'записей нет');
  }
  {
    let calls = 0;
    const p = spellHero({ spells: ['shadow_step'], mp: 2 });
    const r = castOutOfCombat(p, 'shadow_step', 10, {
      shadowStep: () => { calls += 1;
        return { ok: false, reason: 'некуда шагнуть' }; },
    });
    assert.equal(r.ok, false, 'нет маны + отказ cb → отказ');
    assert.equal(r.reason, 'не хватает маны',
      'одновременные «нет маны» и «телепорт невозможен» → мана');
    assert.equal(calls, 0, 'cb НЕ вызван (проверка маны первая)');
    assert.equal(p.mp, 2, 'mp без изменений');
  }
});

test('000235.09 W-11a: shroudOfNightRadius — активная запись → 5 (радиус каталога); граница expiresDay = day → 0; чужой id (dark_presence) → 0; битый radius → 5; две активные → max; нет записи → 0; radius — ленивым lookup (гость 1/3/5, невалидный/отсутствует → дефолт 5); zoneSuppressedReason — ветка «покров ночи» ПОСЛЕ «замерзание», порядок: невидимость → круг защиты → замерзание → покров ночи (source-пин main.js)', () => {
  const { shroudOfNightRadius } = loadSpells();
  assert.equal(typeof shroudOfNightRadius, 'function',
    '000235.09: export Spells.shroudOfNightRadius (src/spells.js) (RED: нет)');
  const day = 10;
  const rec = (expiresDay) => ({ spellId: 'shroud_of_night', expiresDay });
  assert.equal(shroudOfNightRadius({ outOfCombatEffects: [rec(day)] }, day), 0,
    'граница expiresDay = day → 0 (>, не >=)');
  assert.equal(shroudOfNightRadius({ outOfCombatEffects: [rec(day - 1)] }, day), 0,
    'expiresDay < day → 0');
  assert.equal(shroudOfNightRadius({ outOfCombatEffects: [rec(day + 1)] }, day), 5,
    'активная (day+1) → радиус каталога (5)');
  assert.equal(shroudOfNightRadius({ outOfCombatEffects:
    [rec(day), rec(day + 2)] }, day), 5,
    'истёкшая + активная → радиус АКТИВНОЙ');
  assert.equal(shroudOfNightRadius({ outOfCombatEffects:
    [{ spellId: 'dark_presence', expiresDay: day + 1 }] }, day), 0,
    'чужой id (dark_presence) → 0 (матчинг по spellId)');
  assert.equal(shroudOfNightRadius({ outOfCombatEffects: [] }, day), 0, '[] → 0');
  assert.equal(shroudOfNightRadius({}, day), 0, 'нет поля → 0');
  assert.equal(shroudOfNightRadius(null, day), 0, 'hero = null → 0');
  assert.equal(shroudOfNightRadius({ outOfCombatEffects: 'бито' }, day), 0,
    'effects не массив → 0');
  assert.equal(shroudOfNightRadius({ outOfCombatEffects:
    [null, 'мусор', 42, { expiresDay: day + 1 },
     { spellId: 'нет_такого_заклинания', expiresDay: day + 1 }] }, day), 0,
    'мусор-записи → 0 без краха');
  const p = { outOfCombatEffects: [rec(day + 1)] };
  for (let i = 0; i < 5; i++) {
    assert.equal(shroudOfNightRadius(p, day), 5, 'повторный вызов i=' + i
      + ' — стабильно (без RNG)');
  }
  const dataMod = loadSpellsData();
  const mk = (over) => portalGuest0235('shroud_of_night', Object.assign(
    { действие: 'внебой', параметры: { days: 3, radius: 5 } }, over));
  for (const [radius, expected] of [[1, 1], [3, 3], [5, 5]]) {
    const g = mk({ параметры: { days: 3, radius } });
    try {
      pushOcGuests(dataMod, [g]);
      const r = shroudOfNightRadius({ outOfCombatEffects:
        [{ spellId: 'shroud_of_night', expiresDay: day + 1 }] }, day);
      assert.equal(r, expected, 'ленивый lookup: гость r=' + radius + ' → ' + expected);
    } finally {
      popOcGuests(dataMod, [g]);
    }
  }
  for (const radius of ['нет', 9, 0, 1.5, null]) {
    const g = mk({ параметры: { days: 3, radius } });
    try {
      pushOcGuests(dataMod, [g]);
      const r = shroudOfNightRadius({ outOfCombatEffects:
        [{ spellId: 'shroud_of_night', expiresDay: day + 1 }] }, day);
      assert.equal(r, 5,
        'невалидный radius (' + JSON.stringify(radius) + ') → ДЕФОЛТ 5');
    } finally {
      popOcGuests(dataMod, [g]);
    }
  }
  {
    const g = mk({ параметры: { days: 3 } });
    try {
      pushOcGuests(dataMod, [g]);
      const r = shroudOfNightRadius({ outOfCombatEffects:
        [{ spellId: 'shroud_of_night', expiresDay: day + 1 }] }, day);
      assert.equal(r, 5, 'radius отсутствует → ДЕФОЛТ 5');
    } finally {
      popOcGuests(dataMod, [g]);
    }
  }
  // Порядок веток zoneSuppressedReason (source-пин src/main.js,
  // паттерн aggro-visibility/building-actions): «покров ночи» — НОВАЯ
  // ветка ПОСЛЕ «замерзание», перед `return null`; общий порядок
  // причин: невидимость → круг защиты → замерзание → покров ночи.
  const mainSrc = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  const iInvis = mainSrc.indexOf("return 'невидимость'");
  const iWard = mainSrc.indexOf("return 'круг защиты'");
  const iFrost = mainSrc.indexOf("return 'замерзание'");
  const iNight = mainSrc.indexOf("return 'покров ночи'");
  assert.ok(iInvis >= 0 && iWard >= 0 && iFrost >= 0,
    'фикстура: ветки невидимость/круг защиты/замерзание в main.js');
  assert.ok(iNight >= 0,
    "zoneSuppressedReason: ветка «покров ночи» отсутствует (RED: не реализована)");
  assert.ok(iInvis < iWard && iWard < iFrost && iFrost < iNight,
    'порядок веток: невидимость → круг защиты → замерзание → покров ночи');
});

test('000235.09 W-12a: darkPresenceRadius — активная → 5 (радиус каталога); граница expiresDay = day → 0; чужой id (shroud_of_night) → 0; [] / нет поля / null / мусор → 0; max по двум активным; radius — ленивым lookup (гость 1/3/5, невалидный/отсутствует → дефолт 5); zoneCombatInfo — сужение = Math.max(coldBreath, darkPresence) (source-пин main.js; оба активных → всё равно −1, НЕ −2: eff = max(1, r−1))', () => {
  const { darkPresenceRadius } = loadSpells();
  assert.equal(typeof darkPresenceRadius, 'function',
    '000235.09: export Spells.darkPresenceRadius (src/spells.js) (RED: нет)');
  const day = 10;
  const rec = (expiresDay) => ({ spellId: 'dark_presence', expiresDay });
  assert.equal(darkPresenceRadius({ outOfCombatEffects: [rec(day)] }, day), 0,
    'граница expiresDay = day → 0 (>, не >=)');
  assert.equal(darkPresenceRadius({ outOfCombatEffects: [rec(day - 1)] }, day), 0,
    'expiresDay < day → 0');
  assert.equal(darkPresenceRadius({ outOfCombatEffects: [rec(day + 1)] }, day), 5,
    'активная (day+1) → радиус каталога (5)');
  assert.equal(darkPresenceRadius({ outOfCombatEffects:
    [rec(day), rec(day + 2)] }, day), 5,
    'истёкшая + активная → радиус АКТИВНОЙ');
  assert.equal(darkPresenceRadius({ outOfCombatEffects:
    [{ spellId: 'shroud_of_night', expiresDay: day + 1 }] }, day), 0,
    'чужой id (shroud_of_night) → 0 (матчинг по spellId)');
  assert.equal(darkPresenceRadius({ outOfCombatEffects: [] }, day), 0, '[] → 0');
  assert.equal(darkPresenceRadius({}, day), 0, 'нет поля → 0');
  assert.equal(darkPresenceRadius(null, day), 0, 'hero = null → 0');
  assert.equal(darkPresenceRadius({ outOfCombatEffects: 'бито' }, day), 0,
    'effects не массив → 0');
  assert.equal(darkPresenceRadius({ outOfCombatEffects:
    [null, 'мусор', 42, { expiresDay: day + 1 },
     { spellId: 'нет_такого_заклинания', expiresDay: day + 1 }] }, day), 0,
    'мусор-записи → 0 без краха');
  const p = { outOfCombatEffects: [rec(day + 1)] };
  for (let i = 0; i < 5; i++) {
    assert.equal(darkPresenceRadius(p, day), 5, 'повторный вызов i=' + i
      + ' — стабильно (без RNG)');
  }
  const dataMod = loadSpellsData();
  const mk = (over) => portalGuest0235('dark_presence', Object.assign(
    { действие: 'внебой', параметры: { days: 1, radius: 5 } }, over));
  for (const [radius, expected] of [[1, 1], [3, 3], [5, 5]]) {
    const g = mk({ параметры: { days: 1, radius } });
    try {
      pushOcGuests(dataMod, [g]);
      const r = darkPresenceRadius({ outOfCombatEffects:
        [{ spellId: 'dark_presence', expiresDay: day + 1 }] }, day);
      assert.equal(r, expected, 'ленивый lookup: гость r=' + radius + ' → ' + expected);
    } finally {
      popOcGuests(dataMod, [g]);
    }
  }
  for (const radius of ['нет', 9, 0, 1.5, null]) {
    const g = mk({ параметры: { days: 1, radius } });
    try {
      pushOcGuests(dataMod, [g]);
      const r = darkPresenceRadius({ outOfCombatEffects:
        [{ spellId: 'dark_presence', expiresDay: day + 1 }] }, day);
      assert.equal(r, 5,
        'невалидный radius (' + JSON.stringify(radius) + ') → ДЕФОЛТ 5');
    } finally {
      popOcGuests(dataMod, [g]);
    }
  }
  {
    const g = mk({ параметры: { days: 1 } });
    try {
      pushOcGuests(dataMod, [g]);
      const r = darkPresenceRadius({ outOfCombatEffects:
        [{ spellId: 'dark_presence', expiresDay: day + 1 }] }, day);
      assert.equal(r, 5, 'radius отсутствует → ДЕФОЛТ 5');
    } finally {
      popOcGuests(dataMod, [g]);
    }
  }
  // sужение findZoneCombat — ОБА источника (cold_breath + dark_presence)
  // через Math.max (source-пин src/main.js: функция zoneCombatInfo).
  const mainSrc = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  const zciStart = mainSrc.indexOf('function zoneCombatInfo');
  assert.ok(zciStart >= 0, 'фикстура: function zoneCombatInfo в main.js');
  const zciEnd = mainSrc.indexOf('function ', zciStart + 1);
  const zci = mainSrc.slice(zciStart, zciEnd > zciStart ? zciEnd : undefined);
  assert.ok(zci.includes('coldBreathRadius'),
    'zoneCombatInfo: источник cold_breath (регрессия)');
  assert.ok(zci.includes('darkPresenceRadius'),
    'zoneCombatInfo: источник dark_presence (RED: не добавлен)');
  assert.ok(zci.includes('Math.max'),
    'zoneCombatInfo: сужение = Math.max из двух источников (оба активных → −1, НЕ −2) (RED: max нет)');
});

test('000235.09 W-13: призывы shadow_wraith/void_horror — makeAlly level=уровень спелла, summonTurns=4, имя/роль из MOB_TYPES (vampire — «Вампир» melee; bone_coloss — «Костяной колосс» shield); детерминизм (seed); fail-closed «неизвестный призыв»; баф-NO-OP-пины: shroud/vampire_touch — buff записывается, краха нет', () => {
  const dataMod = loadSpellsData();
  assert.ok(dataMod.SPELLS_BY_ID['shadow_wraith'],
    'W-13: shadow_wraith — запись в каталоге (RED: нет)');
  assert.ok(dataMod.SPELLS_BY_ID['void_horror'],
    'W-13: void_horror — запись в каталоге (RED: нет)');
  const { castSpell } = loadSpells();
  function summonCase(spellId, level, name, role) {
    const p = spellHero({ spells: [spellId], intelligence: 11, mp: 40 });
    const c = soloCombat(p, 'wolf');
    const r = castSpell(c, spellId);
    assert.equal(r.ok, true, `${spellId}: каст призыва ok (${r.reason})`);
    assert.ok(r.summoned, `${spellId}: r.summoned`);
    const a = c.units.find((u) => u.id === r.summoned);
    assert.ok(a, `${spellId}: призванный в c.units`);
    assert.equal(a.kind, 'summon', `${spellId}: kind summon`);
    assert.equal(a.summonTurns, 4, `${spellId}: summonTurns 4`);
    assert.equal(a.level, level, `${spellId}: level = уровень спелла`);
    assert.equal(a.name, name, `${spellId}: имя из MOB_TYPES`);
    assert.equal(a.role, role, `${spellId}: роль из MOB_TYPES`);
  }
  summonCase('shadow_wraith', 3, 'Вампир', 'melee');
  summonCase('void_horror', 4, 'Костяной колосс', 'shield');
  // Детерминизм: два одинаковых боя (seed) → одинаковые статистики.
  {
    const p1 = spellHero({ spells: ['shadow_wraith'], intelligence: 11, mp: 40 });
    const c1 = soloCombat(p1, 'wolf');
    castSpell(c1, 'shadow_wraith');
    const a1 = c1.units.find((u) => u.kind === 'summon');
    const p2 = spellHero({ spells: ['shadow_wraith'], intelligence: 11, mp: 40 });
    const c2 = soloCombat(p2, 'wolf');
    castSpell(c2, 'shadow_wraith');
    const a2 = c2.units.find((u) => u.kind === 'summon');
    assert.equal(a1.maxHP, a2.maxHP, 'детерминизм: maxHP');
    assert.equal(a1.dmg, a2.dmg, 'детерминизм: dmg');
    assert.equal(a1.armor, a2.armor, 'детерминизм: armor');
  }
  // Fail-closed: гость-призыв с неизвестным mob → «неизвестный призыв: X».
  const bad = Object.assign(ocGuest0235('w13_shadow_badsummon', {
    действие: 'призыв', параметры: { summon: 'nope', turns: 4 }, вне_боя: false,
  }));
  try {
    pushOcGuests(dataMod, [bad]);
    const p = spellHero({ spells: [bad.id], intelligence: 11, mp: 40 });
    const c = soloCombat(p, 'wolf');
    const r = castSpell(c, bad.id);
    assert.equal(r.ok, false, 'неизвестный призыв — отказ');
    assert.equal(r.reason, 'неизвестный призыв: nope', 'fail-closed reason');
    assert.equal(p.mp, 40, 'отказ — до расхода маны');
  } finally {
    popOcGuests(dataMod, [bad]);
  }
  // Баф-NO-OP-пины: статы без потребителя — запись buff (гейт бафа
  // проходим), каст ок, краха НЕТ.
  for (const [id, stat] of [
    ['shroud', 'попадание_вниз'],
    ['vampire_touch', 'вампиризм'],
  ]) {
    assert.ok(dataMod.SPELLS_BY_ID[id],
      `W-13: ${id} — запись в каталоге (RED: нет)`);
    const p = spellHero({ spells: [id], intelligence: 11, mp: 40 });
    const c = soloCombat(p, 'wolf');
    const r = castSpell(c, id);
    assert.equal(r.ok, true, `${id}: каст бафа ok (${r.reason})`);
    assert.equal(r.buffed, 'player', `${id}: buff на игрока`);
    assert.deepEqual(c.ps.buff,
      { stat, value: id === 'shroud' ? 0.25 : 0.5, turns: 3 },
      `${id}: buff записан (NO-OP: потребителя нет, краха нет)`);
  }
});

test('000235.09 W-15: drain_life/soul_drain {value:0.5} в каталоге (пин W-03) + бой: каст → урон = формула урона БИТ-В-БИТ + drain-самохил (потребитель — 000267: r.healed = round(0.5 × факт), герой предповреждён); регрессия: все урон-заклинания каталога — формула инвариантна', () => {
  const dataMod = loadSpellsData();
  const { castSpell } = loadSpells();
  for (const id of ['drain_life', 'soul_drain']) {
    const s = dataMod.SPELLS_BY_ID[id];
    assert.ok(s, `W-15: ${id} — запись в каталоге (RED: нет)`);
    assert.deepEqual(s.параметры, { value: 0.5 },
      `${id}: параметры {value:0.5}`);
    const p = spellHero({ spells: [id], intelligence: 11, mp: 40 });
    // Герой предповреждён (hp = maxHP − 20 = 5; maxHP 25 — Тело 1):
    // хил не упирается в кап → r.healed = факт = round(0.5 × dmg).
    p.hp = 5;
    const c = soloCombat(p, 'wolf');
    const hp0 = p.hp;
    const r = castSpell(c, id, c.units[0].id);
    assert.equal(r.ok, true, `${id}: каст ok (${r.reason})`);
    const expected = Math.round(
      (4 + 0.5 * p.primary.intelligence) *
      (1 + 0.15 * (s.степень - 1)));
    assert.equal(r.dmg, expected,
      `${id}: урон БИТ-В-БИТ по формуле урона (тень — без школьного бонуса)`);
    assert.equal(r.healed, Math.round(0.5 * r.dmg),
      `${id}: drain-самохил — кастер +round(0.5 × факт) (потребитель — 000267)`);
    assert.equal(p.hp - hp0, r.healed,
      `${id}: hp-дельта = r.healed (ножницы)`);
  }
  // Регрессия: ВСЕ урон-заклинания каталога — формула инвариантна
  // (свежий герой: без бафов, вторички 0 → школьный бонус 0).
  let n = 0;
  for (const s of dataMod.SPELLS) {
    if (s.действие !== 'урон') continue;
    const p = spellHero({ spells: [s.id], intelligence: 1, mp: 40 });
    const c = soloCombat(p, 'wolf');
    const r = castSpell(c, s.id, c.units[0].id);
    assert.equal(r.ok, true, `${s.id}: каст (${r.reason})`);
    const expected = Math.round(
      (4 + 0.5 * p.primary[s.атрибут]) *
      (1 + 0.15 * (s.степень - 1)));
    assert.equal(r.dmg, expected, `${s.id}: формула урона инвариантна`);
    n += 1;
  }
  assert.equal(n, 29,
    'урон-заклинаний в каталоге: 29 из 142 (ре-пин 000235.11: +25 волны Защита; урона НЕТ; RED: 29 из 117)');
});

// --- Задача 000235.10: волна Исцеление — 25 заклинаний + 25 свитков (TDD) ---
//
// Контракт: memory/000235.10-healing-wave-content.md. RED: записи/
// зеркала/экспорты/id-наборы отсутствуют (ENOENT / undefined / count) —
// осмысленно, не синтаксис. Таблица ТЗ дословно; нумерация append-only:
// spells 000093–000117, свитки items 000258–000282 (тот же порядок).
// W-01 = ре-пин «ровно 117» (зеркало выше), W-08 = ре-пин fire W-08
// 117/282. Базы цепочки C2 по децимальным именам файлов: blessing =
// 000100, divine_favor = 000101 (таблица §1.2 контракта — hex-сокращение
// 00009A/00009B).

const HEAL10 = [
  // id, название, действие, уровень, степень, база(файл|null), мани, вне_боя
  ['radiant_heal', 'Лучистое исцеление', 'лечение', 1, 1, null, 4, false],
  ['life_bloom', 'Расцвет жизни', 'лечение', 2, 1, null, 7, false],
  ['purify', 'Очищение', 'лечение', 2, 1, null, 6, false],
  ['mass_heal', 'Массовое исцеление', 'лечение', 3, 1, null, 13, false],
  ['holy_mending', 'Святое исцеление', 'лечение', 3, 3,
    'assets/spells/000011.json', 13, false],
  ['mass_holy_light', 'Массовый святой свет', 'лечение', 4, 1, null, 20, false],
  ['regeneration', 'Регенерация', 'лечение', 4, 1, null, 20, false],
  ['blessing', 'Благословение', 'баф', 1, 1, null, 3, false],
  ['divine_favor', 'Божественное благоволение', 'баф', 2, 2,
    'assets/spells/000100.json', 7, false],
  ['guardian_blessing', 'Хранительное благословение', 'баф', 2, 1, null, 6, false],
  ['swift_prayer', 'Молитва о проворстве', 'баф', 3, 3,
    'assets/spells/000101.json', 12, false],
  ['faith_shield', 'Щит веры', 'баф', 1, 1, null, 4, false],
  ['smite', 'Святое поразить', 'дебаф', 2, 1, null, 6, false],
  ['unholy_wrath', 'Божественный гнев', 'дебаф', 3, 1, null, 12, false],
  ['stun_of_light', 'Сияние света', 'контроль', 2, 1, null, 6, false],
  ['holy_bind', 'Священные узы', 'контроль', 3, 1, null, 12, false],
  ['light_sprite', 'Световой sprite', 'призыв', 2, 1, null, 8, false],
  ['spirit_healer', 'Дух-целитель', 'призыв', 3, 1, null, 14, false],
  ['holy_guardian', 'Святой страж', 'призыв', 4, 1, null, 20, false],
  ['circle_of_light', 'Круг света', 'создание', 2, 1, null, 8, false],
  ['holy_ground', 'Священная земля', 'создание', 3, 1, null, 13, false],
  ['prayer', 'Молитва', 'внебой', 1, 1, null, 4, true],
  ['divine_protection', 'Божественная защита', 'внебой', 2, 1, null, 7, true],
  ['holy_light', 'Свет обители', 'внебой', 2, 1, null, 7, true],
  ['miracle', 'Чудо', 'воскрешение', 4, 1, null, 20, true],
];
const HEAL10_IDS = HEAL10.map((r) => r[0]);
const HEAL10_OC = ['prayer', 'divine_protection', 'holy_light', 'miracle'];

function healSpellFile(i) {
  return path.join(DIR, String(93 + i).padStart(6, '0') + '.json');
}
function healScrollFile(i) {
  return `assets/items/${String(258 + i).padStart(6, '0')}.json`;
}

test('000235.10 W-02: 25 записей spells — id/название/школа=исцеление/атрибут=wisdom/действие/уровень/степень/база/мани/icon/icon_prompt/описание/здания [000019,000021]/предметы = СВОЙ свиток (000258–000282, тот же порядок)/вне_боя РОВНО у 4; miracle — единственное «воскрешение»+вне_боя', () => {
  let ocCount = 0;
  let resCount = 0;
  HEAL10.forEach((row, i) => {
    const [id, name, action, level, degree, base, mana, oc] = row;
    const f = healSpellFile(i);
    assert.ok(fs.existsSync(f),
      `W-02: запись отсутствует — ${path.basename(f)} (${id}) (RED: файл нет)`);
    const d = JSON.parse(fs.readFileSync(f, 'utf8'));
    assert.equal(d.id, id, `${id}: id`);
    assert.equal(d.название, name, `${id}: название`);
    assert.equal(d.школа, 'исцеление', `${id}: школа`);
    assert.equal(d.атрибут, 'wisdom', `${id}: атрибут`);
    assert.equal(d.действие, action, `${id}: действие`);
    assert.equal(d.уровень, level, `${id}: уровень`);
    assert.equal(d.степень, degree, `${id}: степень`);
    assert.equal(d.база, base, `${id}: база`);
    assert.equal(d.мани, mana, `${id}: мани`);
    assert.equal(d.icon, `assets/spell-icons/${id}.svg`, `${id}: icon`);
    assert.ok(typeof d.icon_prompt === 'string' && d.icon_prompt.trim().length > 0,
      `${id}: icon_prompt непустое`);
    assert.ok(typeof d.описание === 'string' && d.описание.trim().length > 0,
      `${id}: описание непустое`);
    assert.deepEqual(d.здания,
      ['assets/buildings/000019.json', 'assets/buildings/000021.json'],
      `${id}: здания = [Монастырь 19, Храм исцеления 21] (D12)`);
    assert.deepEqual(d.предметы, [healScrollFile(i)],
      `${id}: предметы = [свой свиток ${healScrollFile(i)}]`);
    assert.equal(d.вне_боя === true, oc, `${id}: вне_боя`);
    if (oc) ocCount += 1;
    if (action === 'воскрешение') resCount += 1;
  });
  assert.equal(ocCount, 4,
    'вне_боя — ровно 4 (prayer, divine_protection, holy_light, miracle)');
  assert.equal(resCount, 1,
    '«воскрешение» — только miracle (и оно вне_боя)');
});

test('000235.10 W-03: параметры по D1 — точный deepEqual на 17 (таблица §1.5); БЕЗ «параметры» — ровно 8: radiant_heal/purify/mass_heal/holy_mending/mass_holy_light/stun_of_light/holy_bind/miracle; цепочки C1 (holy_mending ст3 = 000011 greater_heal ст2+1, 6≤11≤13) / C2 (divine_favor ст2 на 000100, swift_prayer ст3 на 000101); мани — точные значения §1.4 + полосы 000119 (L1 3–5 / L2 6–8 / L3 10–15 / L4 20)', () => {
  const P = {
    life_bloom: { stat: 'реген', value: 1, turns: 2 },
    regeneration: { stat: 'реген', value: 1, turns: 3 },
    blessing: { stat: 'урон', value: 0.10, turns: 3 },
    divine_favor: { stat: 'урон', value: 0.15, turns: 3 },
    guardian_blessing: { stat: 'броня', value: 1, turns: 3 },
    swift_prayer: { stat: 'ход', value: 1, turns: 3 },
    faith_shield: { stat: 'получаемый_урон', value: 0.10, turns: 3 },
    smite: { stat: 'урон_вниз', value: 0.15, turns: 3 },
    unholy_wrath: { stat: 'dot', value: 1, turns: 3 },
    light_sprite: { summon: 'fairy', turns: 4 },
    spirit_healer: { summon: 'orc_shaman', turns: 4 },
    holy_guardian: { summon: 'earth_elemental', turns: 4 },
    circle_of_light: { object: 'зона', stat: 'реген', value: 1, turns: 3, radius: 2 },
    holy_ground: { object: 'зона', stat: 'урон_вниз', value: 0.15, turns: 3, radius: 2 },
    prayer: { days: 1 },
    divine_protection: { days: 1 },
    holy_light: { days: 1, radius: 5 },
  };
  const NO_PARAMS = new Set([
    'radiant_heal', 'purify', 'mass_heal', 'holy_mending',
    'mass_holy_light', 'stun_of_light', 'holy_bind', 'miracle',
  ]);
  assert.equal(NO_PARAMS.size, 8, 'фикстура: 8 без параметров');
  HEAL10.forEach((row, i) => {
    const id = row[0];
    const f = healSpellFile(i);
    assert.ok(fs.existsSync(f), `W-03: запись отсутствует — ${id} (RED)`);
    const d = JSON.parse(fs.readFileSync(f, 'utf8'));
    const expected = P[id];
    if (expected !== undefined) {
      assert.deepEqual(d.параметры, expected, `${id}: параметры по D1`);
    } else {
      assert.equal(d.параметры, undefined,
        `${id}: БЕЗ «параметры» (${NO_PARAMS.has(id)
          ? 'таблица §1.5' : 'ошибка таблицы'})`);
    }
  });
  // C1 — расширение СУЩЕСТВУЮЩЕЙ цепочки light_heal→greater_heal:
  // holy_mending ст3 = greater_heal (000011) ст2 + 1.
  {
    const row = HEAL10.find((r) => r[0] === 'holy_mending');
    const parent = JSON.parse(
      fs.readFileSync(path.join(DIR, '000011.json'), 'utf8'));
    assert.equal(parent.id, 'greater_heal', 'фикстура: 000011 = greater_heal');
    assert.equal(parent.степень, 2, 'фикстура: greater_heal ст2');
    assert.equal(parent.уровень, 3, 'фикстура: greater_heal ур3');
    assert.equal(parent.школа, 'исцеление', 'фикстура: одна школа');
    assert.equal(row[4], parent.степень + 1,
      'C1: holy_mending ст3 = greater_heal ст2 + 1');
    assert.ok(row[3] >= parent.уровень, 'C1: уровень не ниже предка');
    assert.ok(row[6] >= parent.мани, 'C1: мани не ниже предка (13 ≥ 11)');
    assert.equal(row[5], 'assets/spells/000011.json',
      'C1: база = файл предка (таблица)');
    const f = healSpellFile(HEAL10_IDS.indexOf('holy_mending'));
    if (fs.existsSync(f)) {
      const d = JSON.parse(fs.readFileSync(f, 'utf8'));
      assert.equal(d.база, 'assets/spells/000011.json',
        'C1: база = файл предка (файл)');
    }
  }
  // C2 — новая цепочка blessing → divine_favor → swift_prayer.
  const byId = new Map(HEAL10.map((r) => [r[0], r]));
  const CHAINS = [
    ['divine_favor', 'blessing'],
    ['swift_prayer', 'divine_favor'],
  ];
  for (const [child, parent] of CHAINS) {
    const ci = HEAL10_IDS.indexOf(child);
    const pi = HEAL10_IDS.indexOf(parent);
    assert.ok(ci >= 0 && pi >= 0, `цепочка: ${child}/${parent} в таблице`);
    const childDegree = byId.get(child)[4];
    const parentDegree = byId.get(parent)[4];
    assert.equal(childDegree, parentDegree + 1,
      `цепочка ${parent} → ${child}: степень = ${parentDegree} + 1`);
    assert.equal(byId.get(child)[5],
      `assets/spells/${String(93 + pi).padStart(6, '0')}.json`,
      `цепочка ${parent} → ${child}: база (таблица) = файл предка`);
  }
  for (const [child, parent] of CHAINS) {
    const ci = HEAL10_IDS.indexOf(child);
    const f = healSpellFile(ci);
    if (!fs.existsSync(f)) continue; // RED: файл нет — выше упали
    const d = JSON.parse(fs.readFileSync(f, 'utf8'));
    const parentFile = String(93 + HEAL10_IDS.indexOf(parent))
      .padStart(6, '0') + '.json';
    assert.equal(d.база, 'assets/spells/' + parentFile,
      `цепочка ${parent} → ${child}: база = файл предка`);
  }
  // Мани — в полосах по уровню + точные значения §1.4 (таблица HEAL10).
  const BANDS = { 1: [3, 5], 2: [6, 8], 3: [10, 15], 4: [20, 20] };
  HEAL10.forEach(([id, , , level, , , mana]) => {
    const [lo, hi] = BANDS[level];
    assert.ok(mana >= lo && mana <= hi,
      `${id}: мани ${mana} в полосе L${level} [${lo}..${hi}]`);
  });
});

test('000235.10 W-04: гейт каста вне боя — 21 боевое «боевое заклинание» до расхода/мутаций; prayer/divine_protection/holy_light {ok, запись day+1, mp −4/−7/−7}; miracle {ok, expiresDay null, ЗАПИСИ НЕТ, mp −20, ctx.miracle вызван}; ctx без miracle — «воскрешение недоступно здесь» до списания; мана < мани → отказ ДО мутаций; рекаст — in-place (3 duration-спелла)', () => {
  const dataMod = loadSpellsData();
  const { castOutOfCombat } = loadSpells();
  const day = 10;
  for (const [id, days, mana] of [
    ['prayer', 1, 4],
    ['divine_protection', 1, 7],
    ['holy_light', 1, 7],
  ]) {
    assert.ok(dataMod.SPELLS_BY_ID[id],
      `W-04: ${id} — запись в каталоге (RED: нет)`);
    const p = spellHero({ spells: [id], mp: 30 });
    const r = castOutOfCombat(p, id, day);
    assert.equal(r.ok, true, `${id}: каст вне боя ok (${r.reason})`);
    assert.equal(r.expiresDay, day + days,
      `${id}: days ${days} → expiresDay = day+${days}`);
    assert.equal(p.mp, 30 - mana, `${id}: мана ровно «мани» (${mana})`);
    assert.deepEqual(p.outOfCombatEffects,
      [{ spellId: id, expiresDay: day + days }],
      `${id}: запись generic-ядром {spellId, expiresDay: day+days}`);
  }
  {
    assert.ok(dataMod.SPELLS_BY_ID['miracle'],
      'W-04: miracle — запись в каталоге (RED: нет)');
    let calls = 0;
    const p = spellHero({ spells: ['miracle'], mp: 30 });
    const r = castOutOfCombat(p, 'miracle', day, {
      miracle: () => { calls += 1; return { ok: true }; },
    });
    assert.equal(r.ok, true, 'miracle: каст ok (' + r.reason + ')');
    assert.equal(r.expiresDay, null, 'miracle — expiresDay null');
    assert.equal(calls, 1, 'ctx.miracle вызван');
    assert.equal(p.mp, 10, 'miracle: мана 20 (30−20)');
    assert.equal(p.outOfCombatEffects, undefined, 'miracle — ЗАПИСИ НЕТ');
  }
  {
    assert.ok(dataMod.SPELLS_BY_ID['miracle'],
      'W-04: miracle — запись в каталоге (RED: нет)');
    const p = spellHero({ spells: ['miracle'], mp: 30 });
    const r = castOutOfCombat(p, 'miracle', day, {});
    assert.equal(r.ok, false, 'ctx без miracle → отказ');
    assert.equal(r.reason, 'воскрешение недоступно здесь');
    assert.equal(p.mp, 30, 'отказ → мана не списана');
    assert.equal(p.outOfCombatEffects, undefined, 'отказ → записей нет');
  }
  const combatIds = HEAL10_IDS.filter((id) => !HEAL10_OC.includes(id));
  assert.equal(combatIds.length, 21, '25 − 4 внебоевых = 21 боевых');
  for (const id of combatIds) {
    assert.ok(dataMod.SPELLS_BY_ID[id], `W-04: ${id} — запись (RED: нет)`);
    const p = spellHero({ spells: [id], mp: 30 });
    const r = castOutOfCombat(p, id, day);
    assert.equal(r.ok, false, `${id}: боевое вне боя — отказ`);
    assert.equal(r.reason, 'боевое заклинание', `${id}: причина по флагу`);
    assert.equal(p.mp, 30, `${id}: отказ — до расхода`);
    assert.equal(p.outOfCombatEffects, undefined, `${id}: отказ — без мутаций`);
  }
  {
    const p = spellHero({ spells: ['mass_holy_light'], mp: 19 });
    const r = castOutOfCombat(p, 'mass_holy_light', day);
    assert.equal(r.ok, false, 'мана 19 < 20 — отказ');
    assert.equal(r.reason, 'не хватает маны', 'причина — мана');
    assert.equal(p.mp, 19, 'отказ ДО мутаций: mp нетронут');
    assert.equal(p.outOfCombatEffects, undefined,
      'отказ ДО мутаций: записей нет');
  }
  for (const id of ['prayer', 'divine_protection', 'holy_light']) {
    const p = spellHero({ spells: [id], mp: 30 });
    assert.equal(castOutOfCombat(p, id, day).ok, true,
      `${id}: каст 1 (день ${day})`);
    assert.equal(p.outOfCombatEffects.length, 1, 'одна запись');
    const first = p.outOfCombatEffects[0];
    assert.equal(castOutOfCombat(p, id, day + 1).ok, true,
      `${id}: рекаст (день ${day + 1})`);
    assert.equal(p.outOfCombatEffects.length, 1,
      `${id}: рекаст in-place — записей ровно одна (не дубль)`);
    assert.equal(p.outOfCombatEffects[0], first,
      `${id}: рекаст in-place — тот же объект записи`);
    assert.equal(p.outOfCombatEffects[0].expiresDay, day + 2,
      `${id}: рекаст — expiresDay обновлён (day+1 → day+2)`);
  }
});

test('000235.10 W-10a: miracle — ctx.miracle: отказ callback → reason + мана откатилась, ЗАПИСЕЙ НЕТ; успех → {ok:true, expiresDay:null}, записи нет, mp −20, cb 1 раз; ctx без miracle → «воскрешение недоступно здесь»; нет маны → «не хватает маны» ДО cb (мутаций нет); БИТ-В-БАЙТ: боевое resurrect (resurrectAlly) — формула hp=round(maxHP/2)/пул/мана/лог без изменений', () => {
  const dataMod = loadSpellsData();
  assert.ok(dataMod.SPELLS_BY_ID['miracle'],
    'W-10a: запись miracle в каталоге (RED: нет)');
  const { castOutOfCombat } = loadSpells();
  {
    let calls = 0;
    const p = spellHero({ spells: ['miracle'], mp: 30 });
    const r = castOutOfCombat(p, 'miracle', 10, {
      miracle: () => { calls += 1;
        return { ok: false, reason: 'нет погибших' }; },
    });
    assert.equal(r.ok, false, 'отказ callback → ok:false');
    assert.equal(r.reason, 'нет погибших', 'reason из callback');
    assert.equal(p.mp, 30, 'отказ → мана откатилась (не 30−20)');
    assert.equal(p.outOfCombatEffects, undefined, 'miracle — ЗАПИСЕЙ НЕТ');
  }
  {
    let calls = 0;
    const p = spellHero({ spells: ['miracle'], mp: 30 });
    const r = castOutOfCombat(p, 'miracle', 10, {
      miracle: () => { calls += 1; return { ok: false }; },
    });
    assert.equal(r.ok, false, 'отказ callback без reason → ok:false');
    assert.equal(r.reason, 'воскрешение недоступно здесь',
      'reason по умолчанию (fail-closed)');
    assert.equal(p.mp, 30, 'отказ → мана откатилась');
  }
  {
    let calls = 0;
    const p = spellHero({ spells: ['miracle'], mp: 30 });
    const r = castOutOfCombat(p, 'miracle', 10, {
      miracle: () => { calls += 1; return { ok: true }; },
    });
    assert.equal(r.ok, true, 'успех callback → ok:true');
    assert.equal(r.expiresDay, null, 'miracle — expiresDay null');
    assert.equal(calls, 1, 'ctx.miracle вызван 1 раз');
    assert.equal(p.mp, 10, 'успех → мана снята (20)');
    assert.equal(p.outOfCombatEffects, undefined,
      'miracle — записи НЕ создаёт');
  }
  {
    const p = spellHero({ spells: ['miracle'], mp: 30 });
    const r = castOutOfCombat(p, 'miracle', 10, {});
    assert.equal(r.ok, false, 'без callback → отказ');
    assert.equal(r.reason, 'воскрешение недоступно здесь');
    assert.equal(p.mp, 30, 'отказ → мана не списана');
  }
  {
    let calls = 0;
    const p = spellHero({ spells: ['miracle'], mp: 10 });
    const r = castOutOfCombat(p, 'miracle', 10, {
      miracle: () => { calls += 1; return { ok: true }; },
    });
    assert.equal(r.ok, false, 'нет маны + успешный cb → отказ');
    assert.equal(r.reason, 'не хватает маны',
      'проверка маны ДО cb (ревью: мутация — после всех проверок)');
    assert.equal(calls, 0, 'cb НЕ вызван — воскрешения нет при отказе');
    assert.equal(p.mp, 10, 'mp без изменений');
    assert.equal(p.outOfCombatEffects, undefined, 'записей нет');
  }
  // Поток performMiracle (main.js — vm W-10b): в node — чистая часть
  // через ctx.miracle: ВСЕ-ИЛИ-НИЧЕГО (roster + dead > max_companions),
  // запись → roster-запись ЕДИНОЙ точкой companions.reviveEntryFromRecord
  // (000161), reverse-splice; отказ ДО мутаций/маны. Эфир — структурно
  // вне (000087: никогда не в roster/deadMercs).
  {
    const { NPCS } = require('../src/npc-data.js');
    const GS = require('../src/global-settings.js');
    const C = require('../src/companions.js');
    assert.equal(typeof C.reviveEntryFromRecord, 'function',
      'фикстура: companions.reviveEntryFromRecord (000161)');
    assert.equal(GS.SETTINGS.max_companions, 3,
      'фикстура: max_companions = 3 (live)');
    const h = NPCS.find((n) => n.id === 'merc_mira').найм;
    const secondary = {};
    for (const [id, lv] of Object.entries(h.начальные_навыки || {})) {
      if (Number.isInteger(lv) && lv >= 1) secondary[id] = lv;
    }
    const miraSheet = {
      kind: 'merc',
      level: 3, xp: 100, totalXp: 100, points: 0,
      primary: Object.assign({}, h.базовые_характеристики),
      secondary,
      skillXp: {},
      spells: (h.spells || []).slice(),
      npcId: 'merc_mira',
    };
    const makeMiracle = (deadList, rosterList) => () => {
      if (!deadList.length) return { ok: false, reason: 'нет погибших' };
      if (rosterList.length + deadList.length >
          GS.SETTINGS.max_companions)
        return { ok: false, reason: 'отряд полон' };
      const entries = deadList.map(
        (r) => C.reviveEntryFromRecord(NPCS, r));
      if (entries.some((e) => !e))
        return { ok: false, reason: 'недоступно' };
      for (let i = deadList.length - 1; i >= 0; i--) {
        deadList.splice(i, 1);
        rosterList.push(entries[i]);
      }
      return { ok: true };
    };
    {
      const dead = ['merc_volk', { npcId: 'merc_mira', sheet: miraSheet,
        loyalty: 70, hiredDay: 5 }];
      const roster = [];
      const p = spellHero({ spells: ['miracle'], mp: 30 });
      const r = castOutOfCombat(p, 'miracle', 10,
        { miracle: makeMiracle(dead, roster) });
      assert.equal(r.ok, true,
        'deadMercs [string-legacy + record] → каст ok (' + r.reason + ')');
      assert.equal(r.expiresDay, null, 'miracle — expiresDay null');
      assert.equal(p.mp, 10, 'mp −20 (30−20)');
      assert.equal(p.outOfCombatEffects, undefined, 'ЗАПИСЕЙ НЕТ');
      assert.equal(dead.length, 0, 'deadMercs пусто после каста');
      assert.deepEqual(roster.map((e) => e.npcId),
        ['merc_mira', 'merc_volk'],
        'оба в roster; порядок = обратный (reverse-splice — '
        + 'зеркало main.js performMiracle; пин W-10b [mira, volk])');
      const volk = roster[1];
      assert.equal(volk.level, 1, 'string-legacy: level 1 (backfill)');
      assert.equal(volk.xp, 0, 'string-legacy: xp 0');
      assert.equal(volk.loyalty, 50, 'string-legacy: loyalty 50');
      assert.equal(volk.hiredDay, 0, 'string-legacy: hiredDay 0');
      assert.equal(volk.sheet.npcId, 'merc_volk',
        'string-legacy: sheet создан (000161)');
      const mira = roster[0];
      assert.equal(mira.level, 3, 'record: level из записи (3)');
      assert.equal(mira.xp, 100, 'record: xp из записи (100)');
      assert.equal(mira.loyalty, 70, 'record: loyalty из записи (70)');
      assert.equal(mira.hiredDay, 5, 'record: hiredDay из записи (5)');
      assert.ok(!roster.some((e) => e.npcId === 'efir'),
        'эфир — не в roster (000087: структурно вне deadMercs)');
      assert.ok(!dead.some((r) => r === 'efir' ||
        (r && r.npcId === 'efir')),
        'эфир — не в deadMercs (000087)');
    }
    {
      const p = spellHero({ spells: ['miracle'], mp: 30 });
      const r = castOutOfCombat(p, 'miracle', 10,
        { miracle: makeMiracle([], []) });
      assert.equal(r.ok, false, '«нет погибших» → отказ');
      assert.equal(r.reason, 'нет погибших');
      assert.equal(p.mp, 30, 'отказ ДО мутаций: мана не списана');
      assert.equal(p.outOfCombatEffects, undefined,
        'отказ ДО мутаций: записей нет');
    }
    {
      const full = [{ npcId: 'merc_volk' }, { npcId: 'merc_ashka' },
        { npcId: 'merc_baldor' }];
      const deadOne = ['merc_mira'];
      const p = spellHero({ spells: ['miracle'], mp: 30 });
      const r = castOutOfCombat(p, 'miracle', 10,
        { miracle: makeMiracle(deadOne, full) });
      assert.equal(r.ok, false, 'roster 3/3 + 1 dead > 3 → отказ');
      assert.equal(r.reason, 'отряд полон');
      assert.equal(full.length, 3, 'отказ ДО мутаций: roster не тронут');
      assert.equal(deadOne.length, 1, 'отказ ДО мутаций: dead не тронут');
      assert.equal(p.mp, 30, 'отказ ДО мутаций: мана не списана');
    }
  }
  // БИТ-В-БАЙТ: боевое воскрешение (resurrect/resurrectAlly, 000163)
  // — БЕЗ ИЗМЕНЕНИЙ (ядро/формулы/gold).
  {
    const { castSpell } = loadSpells();
    const p = spellHero({ spells: ['resurrect'], wisdom: 10, mp: 30 });
    const c = allyCombat163(p);
    const a = deadAlly163(c);
    const maxHP = a.maxHP;
    const poolBefore = c.ps.spellWis;
    const r = castSpell(c, 'resurrect', a.id);
    assert.equal(r.ok, true, 'resurrect: каст ok (' + r.reason + ')');
    assert.equal(a.alive, true, 'resurrect: союзник возвращён');
    assert.equal(a.hp, Math.round(maxHP / 2),
      'resurrect: hp = round(maxHP/2) (50% — БИТ-В-БАЙТ)');
    assert.equal(c.ps.spellWis, poolBefore - 1,
      'resurrect: пул spellWis −1 (БЕЗ ИЗМЕНЕНИЙ)');
    assert.equal(p.mp, 30 - 15, 'resurrect: мана −15 (БЕЗ ИЗМЕНЕНИЙ)');
    assert.ok(c.log.includes('Возвращён в бой.'),
      'resurrect: лог «Возвращён в бой.» (БЕЗ ИЗМЕНЕНИЙ)');
  }
});

test('000235.10 W-11a: holyLightRadius — активная запись → 5 (радиус каталога); граница expiresDay = day → 0 (>, не >=); чужой id (dark_presence) → 0; битый radius → 5; две активные → max; нет записи → 0; radius — ленивым lookup (гость 1/3/5, невалидный/отсутствует → дефолт 5); zoneSuppressedReason — ветка «свет обители» ПОСЛЕ «покров ночи» (порядок 5 причин, source-пин main.js); visionRadiusFloor — floor из holyLightRadius (source-пин); туман: floor R 3→5 (чистое ядро dungeon-ui.vision)', () => {
  const { holyLightRadius } = loadSpells();
  assert.equal(typeof holyLightRadius, 'function',
    '000235.10: export Spells.holyLightRadius (src/spells.js) (RED: нет)');
  const day = 10;
  const rec = (expiresDay) => ({ spellId: 'holy_light', expiresDay });
  assert.equal(holyLightRadius({ outOfCombatEffects: [rec(day)] }, day), 0,
    'граница expiresDay = day → 0 (>, не >=)');
  assert.equal(holyLightRadius({ outOfCombatEffects: [rec(day - 1)] }, day), 0,
    'expiresDay < day → 0');
  assert.equal(holyLightRadius({ outOfCombatEffects: [rec(day + 1)] }, day), 5,
    'активная (day+1) → радиус каталога (5)');
  assert.equal(holyLightRadius({ outOfCombatEffects:
    [rec(day), rec(day + 2)] }, day), 5,
    'истёкшая + активная → радиус АКТИВНОЙ');
  assert.equal(holyLightRadius({ outOfCombatEffects:
    [rec(day + 1), rec(day + 3)] }, day), 5,
    'две активные → max');
  assert.equal(holyLightRadius({ outOfCombatEffects:
    [{ spellId: 'dark_presence', expiresDay: day + 1 }] }, day), 0,
    'чужой id (dark_presence) → 0 (матчинг по spellId)');
  assert.equal(holyLightRadius({ outOfCombatEffects: [] }, day), 0, '[] → 0');
  assert.equal(holyLightRadius({}, day), 0, 'нет поля → 0');
  assert.equal(holyLightRadius(null, day), 0, 'hero = null → 0');
  assert.equal(holyLightRadius({ outOfCombatEffects: 'бито' }, day), 0,
    'effects не массив → 0');
  assert.equal(holyLightRadius({ outOfCombatEffects:
    [null, 'мусор', 42, { expiresDay: day + 1 },
     { spellId: 'нет_такого_заклинания', expiresDay: day + 1 }] }, day), 0,
    'мусор-записи → 0 без краха');
  const p = { outOfCombatEffects: [rec(day + 1)] };
  for (let i = 0; i < 5; i++) {
    assert.equal(holyLightRadius(p, day), 5, 'повторный вызов i=' + i
      + ' — стабильно (без RNG)');
  }
  const dataMod = loadSpellsData();
  const mk = (over) => portalGuest0235('holy_light', Object.assign(
    { действие: 'внебой', параметры: { days: 1, radius: 5 } }, over));
  for (const [radius, expected] of [[1, 1], [3, 3], [5, 5]]) {
    const g = mk({ параметры: { days: 1, radius } });
    try {
      pushOcGuests(dataMod, [g]);
      const r = holyLightRadius({ outOfCombatEffects:
        [{ spellId: 'holy_light', expiresDay: day + 1 }] }, day);
      assert.equal(r, expected, 'ленивый lookup: гость r=' + radius + ' → ' + expected);
    } finally {
      popOcGuests(dataMod, [g]);
    }
  }
  for (const radius of ['нет', 9, 0, 1.5, null]) {
    const g = mk({ параметры: { days: 1, radius } });
    try {
      pushOcGuests(dataMod, [g]);
      const r = holyLightRadius({ outOfCombatEffects:
        [{ spellId: 'holy_light', expiresDay: day + 1 }] }, day);
      assert.equal(r, 5,
        'невалидный radius (' + JSON.stringify(radius) + ') → ДЕФОЛТ 5');
    } finally {
      popOcGuests(dataMod, [g]);
    }
  }
  {
    const g = mk({ параметры: { days: 1 } });
    try {
      pushOcGuests(dataMod, [g]);
      const r = holyLightRadius({ outOfCombatEffects:
        [{ spellId: 'holy_light', expiresDay: day + 1 }] }, day);
      assert.equal(r, 5, 'radius отсутствует → ДЕФОЛТ 5');
    } finally {
      popOcGuests(dataMod, [g]);
    }
  }
  // Порядок веток zoneSuppressedReason (source-пин src/main.js):
  // «свет обители» — НОВАЯ ветка ПОСЛЕ «покров ночи», перед
  // `return null`; общий порядок причин: невидимость → круг защиты
  // → замерзание → покров ночи → свет обители.
  const mainSrc = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  const iInvis = mainSrc.indexOf("return 'невидимость'");
  const iWard = mainSrc.indexOf("return 'круг защиты'");
  const iFrost = mainSrc.indexOf("return 'замерзание'");
  const iNight = mainSrc.indexOf("return 'покров ночи'");
  const iLight = mainSrc.indexOf("return 'свет обители'");
  assert.ok(iInvis >= 0 && iWard >= 0 && iFrost >= 0 && iNight >= 0,
    'фикстура: ветки невидимость/круг защиты/замерзание/покров ночи');
  assert.ok(iLight >= 0,
    'zoneSuppressedReason: ветка «свет обители» отсутствует (RED: не реализована)');
  assert.ok(iInvis < iWard && iWard < iFrost && iFrost < iNight
    && iNight < iLight,
    'порядок веток: невидимость → круг защиты → замерзание → покров ночи → свет обители');
  const seg = mainSrc.slice(iNight, iLight);
  assert.ok(seg.includes('holyLightRadius'),
    'ветка «свет обители»: источник holyLightRadius (RED)');
  assert.ok(seg.includes('Math.max(Math.abs'),
    'ветка «свет обители»: дистанция Чебышёва d (d ≤ r → причина; d = 6 → null)');
  assert.ok(seg.includes('<='),
    'ветка «свет обители»: подавление при d ≤ radius');
  // visionRadiusFloor: floor = max(firelight, holyLightRadius)
  // (source-пин main.js; typeof-гарды — деградация, не крах).
  const iVrf = mainSrc.indexOf('visionRadiusFloor');
  assert.ok(iVrf >= 0,
    'фикстура: visionRadiusFloor в main.js (000225/000136)');
  assert.ok(mainSrc.slice(iVrf, iVrf + 900).includes('holyLightRadius'),
    'visionRadiusFloor: floor из holyLightRadius (RED: не добавлен)');
  // Туман (000225/000136): чистое ядро dungeon-ui.vision — активная
  // запись поднимает floor: R = max(radiusFor(0.5)=3, 5) = 5; клетка
  // d=4 открывается, d=6 скрыта; без эффекта — инвариантен.
  // dungeon-ui — IIFE на globalThis.Game (UMD-ловушка 000038):
  // порядок загрузки — dungeon.js/controls.js ДО, window-стаб
  // (top-level addEventListener keydown).
  const G0 = globalThis.Game || (globalThis.Game = {});
  if (!G0.createDungeon) {
    G0.createDungeon = require('../src/dungeon.js').createDungeon;
  }
  if (!G0.deltaForEvent) {
    G0.deltaForEvent = require('../src/controls.js').deltaForEvent;
  }
  globalThis.window = globalThis.window || { addEventListener() {} };
  require('../src/dungeon-ui.js');
  const vis = G0.dungeonUI.vision;
  assert.ok(vis, 'dungeon-ui.vision экспортирован (000136)');
  assert.equal(vis.baseRadius, 5, 'фикстура: VISION_BASE_RADIUS (000136)');
  assert.equal(vis.radiusFor(0.5), 3, 'фикстура: radiusFor(0.5) = 3');
  const R_off = Math.max(vis.radiusFor(0.5),
    holyLightRadius({ outOfCombatEffects: [] }, day));
  const R_on = Math.max(vis.radiusFor(0.5),
    holyLightRadius({ outOfCombatEffects: [rec(day + 1)] }, day));
  assert.equal(R_off, 3, 'без эффекта: R = 3 (floor 0)');
  assert.equal(R_on, 5, 'активный: floor поднимает R до 5');
  const mOff = vis.maskFor(12, 12, 5, 5, R_off, null);
  const mOn = vis.maskFor(12, 12, 5, 5, R_on, null);
  assert.equal(mOff[5 * 12 + 8], 2, 'без эффекта: d=3 видно (регрессия)');
  assert.equal(mOff[5 * 12 + 9], 0, 'без эффекта: d=4 скрыто (R = 3)');
  assert.equal(mOn[5 * 12 + 9], 2, 'активный: d=4 раскрывается (R = 5)');
  assert.equal(mOn[11 * 12 + 5], 0, 'активный: d=6 скрыто (R = 5)');
});

test('000235.10 W-12a: партия-механики — (a) mass_heal/mass_holy_light: игрок + ВСЕ живые союзники, out.healed = сумма, seed-детерминизм (0 c._rng); mass_holy_light — u.debuff = null у всех; (b) 5 party-бафов: c.ps.buff + u.buff у ВСЕХ живых союзников (turns 3), targetId (живой союзник) игнорируется, mob-цель — «нет цели», рекаст — overwrite; (c) purify: u.debuff → null (out.purified = id, лечения НЕТ), игрок-цель — без side-effects, weaken/bind НЕ сняты', () => {
  const dataMod = loadSpellsData();
  assert.ok(dataMod.SPELLS_BY_ID['mass_heal'],
    'W-12a: mass_heal (RED: нет)');
  assert.ok(dataMod.SPELLS_BY_ID['mass_holy_light'],
    'W-12a: mass_holy_light (RED: нет)');
  const { derived: pDer } = require('../src/player.js');
  const { castSpell } = loadSpells();
  function partyCombat(p) {
    const allies = [];
    for (let i = 0; i < 3; i++) {
      allies.push({ name: 'Союзник' + i, role: 'melee', level: 1,
        dmg: 1, hp: 1, skills: [], spells: [] });
    }
    const c = createCombat({ player: p, mobs: ['wolf'], mobLevel: 2,
      seed: 7, allies });
    const pMax = pDer(p).maxHP;
    p.hp = Math.max(1, pMax - 30);
    for (const a of c.units.filter((u) => u.side === 'ally')) {
      a.hp = Math.max(1, a.maxHP - 10);
    }
    return c;
  }
  function massCase(id) {
    const p = spellHero({ spells: [id], wisdom: 10, mp: 40 });
    const c = partyCombat(p);
    const allies = c.units.filter((u) => u.side === 'ally');
    const s = dataMod.SPELLS_BY_ID[id];
    const amount = Math.round((4 + 0.5 * p.primary[s.атрибут]
      + p.level) * (1 + 0.15 * (s.степень - 1)));
    const beforeP = p.hp;
    const beforeA = allies.map((a) => a.hp);
    const r = castSpell(c, id);
    assert.equal(r.ok, true, `${id}: каст ok (${r.reason})`);
    const expP = Math.min(amount, pDer(p).maxHP - beforeP);
    assert.equal(p.hp - beforeP, expP, `${id}: игрок (с капом)`);
    let total = expP;
    allies.forEach((a, i) => {
      const expA = Math.min(amount, a.maxHP - beforeA[i]);
      assert.equal(a.hp - beforeA[i], expA, `${id}: союзник ${a.name}`);
      total += expA;
    });
    assert.equal(r.healed, total,
      `${id}: out.healed = сумма (игрок + ВСЕ живые союзники)`);
  }
  massCase('mass_heal');
  // Seed-детерминизм: два одинаковых боя (0 c._rng) → одинаковый
  // out.healed.
  {
    const run = () => {
      const p = spellHero({ spells: ['mass_heal'], wisdom: 10, mp: 40 });
      return castSpell(partyCombat(p), 'mass_heal');
    };
    assert.equal(run().healed, run().healed,
      'детерминизм: out.healed (порядок c.units, 0 c._rng)');
  }
  // mass_holy_light — + очистка u.debuff у ВСЕХ живых союзников.
  {
    const p = spellHero({ spells: ['mass_holy_light'], wisdom: 10, mp: 40 });
    const c = partyCombat(p);
    for (const a of c.units.filter((u) => u.side === 'ally')) {
      a.debuff = { stat: 'dot', value: 1, turns: 3 };
    }
    const r = castSpell(c, 'mass_holy_light');
    assert.equal(r.ok, true, 'mass_holy_light: каст ok (' + r.reason + ')');
    for (const a of c.units.filter((u) => u.side === 'ally')) {
      assert.equal(a.debuff, null,
        `mass_holy_light: ${a.name} — u.debuff = null`);
    }
    assert.ok(r.healed > 0,
      'mass_holy_light: out.healed > 0 (лечение тоже есть)');
  }
  // (b) 5 party-бафов: targetId (живой союзник) игнорируется —
  // эффект на ВСЕХ живых союзниках + игроке.
  const PARTY_BUFF10 = [
    ['blessing', 'урон', 0.10],
    ['divine_favor', 'урон', 0.15],
    ['guardian_blessing', 'броня', 1],
    ['swift_prayer', 'ход', 1],
    ['faith_shield', 'получаемый_урон', 0.10],
  ];
  for (const [id, stat, value] of PARTY_BUFF10) {
    assert.ok(dataMod.SPELLS_BY_ID[id], `W-12a: ${id} (RED: нет)`);
    const p = spellHero({ spells: [id], wisdom: 10, mp: 40 });
    const c = partyCombat(p);
    const ally0 = c.units.find((u) => u.side === 'ally');
    const r = castSpell(c, id, ally0.id);
    assert.equal(r.ok, true, `${id}: каст ok (${r.reason})`);
    assert.equal(r.buffed, 'party', `${id}: out.buffed = 'party'`);
    const eff = { stat, value, turns: 3 };
    assert.deepEqual(c.ps.buff, eff, `${id}: c.ps.buff (игрок)`);
    for (const a of c.units.filter((u) => u.side === 'ally')) {
      assert.deepEqual(a.buff, eff, `${id}: союзник ${a.name} — u.buff`);
    }
  }
  {
    const p = spellHero({ spells: ['blessing'], wisdom: 10, mp: 40 });
    const c = partyCombat(p);
    const mob = c.units.find((u) => u.side === 'mob');
    const r = castSpell(c, 'blessing', mob.id);
    assert.equal(r.ok, false, 'blessing: mob-цель — «нет цели» (evalSpell)');
    assert.equal(r.reason, 'нет цели');
  }
  // Рекаст — overwrite (не стак: c.ps.buff/u.buff — объект).
  {
    const p = spellHero({ spells: ['divine_favor', 'guardian_blessing'],
      wisdom: 10, mp: 40 });
    const c = partyCombat(p);
    castSpell(c, 'divine_favor');
    castSpell(c, 'guardian_blessing');
    assert.deepEqual(c.ps.buff, { stat: 'броня', value: 1, turns: 3 },
      'рекаст: c.ps.buff — overwrite (guardian_blessing)');
    for (const a of c.units.filter((u) => u.side === 'ally')) {
      assert.deepEqual(a.buff, { stat: 'броня', value: 1, turns: 3 },
        'рекаст: u.buff — overwrite');
    }
  }
  // (c) purify: союзник — u.debuff → null, лечения нет; weaken/bind
  // НЕ снимаются (отдельные механики); игрок-цель — без side-effects.
  assert.ok(dataMod.SPELLS_BY_ID['purify'], 'W-12a: purify (RED: нет)');
  {
    const p = spellHero({ spells: ['purify'], wisdom: 10, mp: 40 });
    const c = partyCombat(p);
    const a = c.units.find((u) => u.side === 'ally');
    const hpBefore = a.hp;
    a.debuff = { stat: 'урон_вниз', value: 0.15, turns: 3 };
    a.bind = { turns: 1 };
    a.weakened = { turns: 2 };
    const r = castSpell(c, 'purify', a.id);
    assert.equal(r.ok, true, 'purify: каст ok (' + r.reason + ')');
    assert.equal(r.purified, a.id, 'purify: out.purified = id союзника');
    assert.equal(r.healed, undefined, 'purify: лечения НЕТ (out.healed undefined)');
    assert.equal(a.debuff, null, 'purify: u.debuff → null');
    assert.equal(a.hp, hpBefore, 'purify: hp союзника не тронут');
    assert.deepEqual(a.bind, { turns: 1 },
      'purify: bind НЕ снят (отдельная механика)');
    assert.deepEqual(a.weakened, { turns: 2 },
      'purify: weaken НЕ снят (отдельная механика)');
  }
  {
    const p = spellHero({ spells: ['purify'], wisdom: 10, mp: 40 });
    const c = partyCombat(p);
    const hpBefore = p.hp;
    const r = castSpell(c, 'purify');
    assert.equal(r.ok, true, 'purify: игрок-цель ok (' + r.reason + ')');
    assert.equal(r.purified, null, 'purify: игрок-цель — out.purified null');
    assert.equal(r.healed, undefined, 'purify: лечения нет');
    assert.equal(p.hp, hpBefore, 'purify: игрок — без side-effects');
  }
  {
    const p = spellHero({ spells: ['purify'], wisdom: 10, mp: 40 });
    const c = partyCombat(p);
    const mob = c.units.find((u) => u.side === 'mob');
    const r = castSpell(c, 'purify', mob.id);
    assert.equal(r.ok, false, 'purify: mob-цель — «нет цели»');
    assert.equal(r.reason, 'нет цели');
  }
});

test('000235.10 W-12a.1: party-баф — тик «ровно N раундов, включая каст» для КАЖДОГО носителя: игрок + каждый союзник — СВОИ объекты бафа (общей ссылки НЕТ); startRound тикает каждого носителя по разу за раунд (общий объект сгорал бы 1+N быстрее — регрессия: 1 союзник — 2 раунда, 2+ союзника — 1 раунд); 5 party-бафов: turns 3→2→1→0 у всех носителей → ровно 3 активных раунда', () => {
  const { castSpell } = loadSpells();
  const PARTY_BUFF10_TICK = [
    ['blessing', 'урон', 0.10],
    ['divine_favor', 'урон', 0.15],
    ['guardian_blessing', 'броня', 1],
    ['swift_prayer', 'ход', 1],
    ['faith_shield', 'получаемый_урон', 0.10],
  ];
  for (const [id, stat, value] of PARTY_BUFF10_TICK) {
    const p = spellHero({ spells: [id], wisdom: 10, mp: 40 });
    const allies = [];
    for (let i = 0; i < 3; i++) {
      allies.push({ name: 'Союзник' + i, role: 'melee', level: 1,
        dmg: 1, hp: 1, skills: [], spells: [] });
    }
    const c = createCombat({ player: p, mobs: ['wolf'], mobLevel: 2,
      seed: 7, allies });
    const w = c.units.find((u) => u.side === 'mob');
    w.x = 0; w.y = 0; // далеко — без вмешательства
    c._rng = () => 0.99; // удар волка всегда мимо (hitChance ≤ 0.95)
    const r = castSpell(c, id);
    assert.equal(r.ok, true, `${id}: каст ok (${r.reason})`);
    const a = c.units.filter((u) => u.side === 'ally');
    assert.equal(a.length, 3, `${id}: партия — 3 живых союзника`);
    assert.notStrictEqual(c.ps.buff, a[0].buff,
      `${id}: игрок/союзник0 — РАЗНЫЕ объекты бафа`);
    assert.notStrictEqual(a[0].buff, a[1].buff,
      `${id}: союзник0/союзник1 — разные объекты`);
    assert.notStrictEqual(a[1].buff, a[2].buff,
      `${id}: союзник1/союзник2 — разные объекты`);
    const seq = [c.ps.buff, a[0].buff, a[1].buff, a[2].buff];
    for (const e of seq) {
      assert.deepEqual(e, { stat, value, turns: 3 },
        `${id}: носитель — {${stat}, ${value}, 3}`);
    }
    // Очередь: игрок → 3 союзника → волк: раунд = 4 endTurn
    // (startRound — по исчерпании последнего слота).
    const round = () => {
      c.endTurn(); c.endTurn(); c.endTurn(); c.endTurn();
    };
    round(); // тик 1: 3 → 2 — активен во 2-м раунде
    for (const e of seq) {
      assert.equal(e.turns, 2,
        `${id}: тик 1 — 3 → 2 (активен во 2-м раунде)`);
    }
    round(); // тик 2: 2 → 1 — активен в 3-м раунде
    for (const e of seq) {
      assert.equal(e.turns, 1,
        `${id}: тик 2 — 2 → 1 (активен в 3-м раунде)`);
    }
    round(); // тик 3: 1 → 0 — с 4-го раунда истёк
    for (const e of seq) {
      assert.equal(e.turns, 0,
        `${id}: тик 3 — 1 → 0 (ровно 3 активных раунда, включая каст)`);
    }
  }
});

test('000235.10 W-13: призывы — light_sprite → fairy / spirit_healer → orc_shaman / holy_guardian → earth_elemental: level = уровень спелла (2/3/4), summonTurns 4, имя/роль/статы из MOB_TYPES (deepEqual); healer-призывы — u.spells [light_heal] + c.heal (mostWounded [игрок, союзники], spellWis −1, mp −6, формула 6/7 hp, лог); holy_guardian — u.spells [] + c.heal «недоступно»; контраст kind «efir» — «недоступно»; source-пин гейтов kind «summon» (combat.js/combat-ui.js); рассеивание startRound (4 раунда включая каст); fail-closed ДО расхода («неизвестный призыв»)', () => {
  const dataMod = loadSpellsData();
  for (const id of ['light_sprite', 'spirit_healer', 'holy_guardian']) {
    assert.ok(dataMod.SPELLS_BY_ID[id], `W-13: ${id} (RED: нет)`);
  }
  const { castSpell } = loadSpells();
  function summonCase(spellId, level, name, role, stats) {
    const p = spellHero({ spells: [spellId], wisdom: 11, mp: 40 });
    const c = soloCombat(p, 'wolf');
    const r = castSpell(c, spellId);
    assert.equal(r.ok, true, `${spellId}: каст призыва ok (${r.reason})`);
    assert.ok(r.summoned, `${spellId}: r.summoned`);
    const a = c.units.find((u) => u.id === r.summoned);
    assert.ok(a, `${spellId}: призванный в c.units`);
    assert.equal(a.kind, 'summon', `${spellId}: kind summon`);
    assert.equal(a.summonTurns, 4, `${spellId}: summonTurns 4`);
    assert.equal(a.level, level, `${spellId}: level = уровень спелла`);
    assert.deepEqual(
      { name: a.name, role: a.role, maxHP: a.maxHP, damage: a.damage,
        armor: a.armor, mp: a.mp },
      { name, role, ...stats },
      `${spellId}: имя/роль/статы из MOB_TYPES (makeAlly level ${level})`);
  }
  summonCase('light_sprite', 2, 'Фея', 'support',
    { maxHP: 7, damage: 1, armor: 0, mp: 9 });
  summonCase('spirit_healer', 3, 'Орк-шаман', 'support',
    { maxHP: 10, damage: 2, armor: 0, mp: 9 });
  summonCase('holy_guardian', 4, 'Земляной стихийник', 'shield',
    { maxHP: 130, damage: 5, armor: 2, mp: 6 });
  // Healer-призывы — u.spells ['light_heal']; танк — [] (чистый
  // «урон+щит»).
  for (const [id, expected] of [
    ['light_sprite', ['light_heal']],
    ['spirit_healer', ['light_heal']],
    ['holy_guardian', []],
  ]) {
    const p = spellHero({ spells: [id], wisdom: 11, mp: 40 });
    const c = soloCombat(p, 'wolf');
    const r = castSpell(c, id);
    assert.equal(r.ok, true, `${id}: каст (${r.reason})`);
    const a = c.units.find((u) => u.id === r.summoned);
    assert.deepEqual(a.spells, expected,
      `${id}: u.spells ${JSON.stringify(expected)}`);
  }
  // c.heal (H-кнопка): healer-призывный лечит САМОГО раненого пула
  // [игрок, живые союзники]; расход — spellWis −1 + mp −6 (мана
  // light_heal; рефилла mp нет — 000193); формула 1:1 с книгой.
  function healCase(spellId, amount, logLine) {
    const p = spellHero({ spells: [spellId], wisdom: 11, mp: 40 });
    const c = soloCombat(p, 'wolf');
    const w = c.units[0];
    c.obstacles.clear();
    w.x = c.px; w.y = c.py - 1; w.maxHP = 2000; w.hp = 2000;
    c._rng = () => 0.01;
    const r = castSpell(c, spellId);
    assert.equal(r.ok, true, `${spellId}: каст (${r.reason})`);
    const u = c.units.find((x) => x.kind === 'summon');
    p.hp = 1; // игрок — самый раненый (призывный полон)
    c.turnOrder = [u.id];
    c.turnIndex = 0;
    c.phase = 'player';
    const h = c.heal();
    assert.equal(h.ok, true, `${spellId}: c.heal ok (${h.reason})`);
    assert.equal(p.hp, 1 + amount,
      `${spellId}: игрок +${amount} (mostWounded, P.heal)`);
    assert.ok(c.log.includes(logLine),
      `${spellId}: лог «${logLine}» (вычисленное значение)`);
    assert.equal(u.mp, 9 - 6, `${spellId}: mp 9−6 (рефилла нет)`);
    assert.equal(u.spellWis, 0, `${spellId}: spellWis 1→0`);
  }
  healCase('light_sprite', 6, 'Фея лечит Флогистон (+6).');
  healCase('spirit_healer', 7, 'Орк-шаман лечит Флогистон (+7).');
  // Танк: role shield — c.heal «недоступно».
  {
    const p = spellHero({ spells: ['holy_guardian'], wisdom: 11, mp: 40 });
    const c = soloCombat(p, 'wolf');
    const r = castSpell(c, 'holy_guardian');
    assert.equal(r.ok, true, 'holy_guardian: каст (' + r.reason + ')');
    const u = c.units.find((x) => x.kind === 'summon');
    c.turnOrder = [u.id];
    c.turnIndex = 0;
    c.phase = 'player';
    const h = c.heal();
    assert.equal(h.ok, false, 'holy_guardian: c.heal — отказ (role shield)');
    assert.equal(h.reason, 'недоступно активному персонажу');
  }
  // Контраст kind 'efir': support + spells, НО kind 'efir' — гейты
  // «merc' || 'summon'» его НЕ пускают (а2 R14).
  {
    const p = spellHero({ spells: ['light_sprite'], wisdom: 11, mp: 40 });
    const c = soloCombat(p, 'wolf');
    const e = { id: 'efir_x', side: 'ally', name: 'Эфир (синтетика)',
      role: 'support', kind: 'efir', spells: ['light_heal'],
      spellWis: 1, mp: 9, level: 1, attrs: {}, alive: true, fled: false,
      x: 0, y: 0, maxHP: 10, hp: 10 };
    c.units.push(e);
    c.turnOrder = [e.id];
    c.turnIndex = 0;
    c.phase = 'player';
    const h = c.heal();
    assert.equal(h.ok, false, 'kind efir: c.heal — отказ');
    assert.equal(h.reason, 'недоступно активному персонажу',
      'kind «efir» не в гейте (контраст)');
  }
  // Source-пин гейтов (контракт §2.8, 5 точек): kind 'merc' →
  // 'merc' || 'summon' (ядро + canDo-зеркало + UI).
  const combatSrc = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'combat.js'), 'utf8');
  assert.ok(combatSrc.includes(
    "u.kind !== 'merc' && u.kind !== 'summon'"),
    'гейты allyHealAction/c.heal: kind merc|summon (RED: только merc)');
  assert.ok(combatSrc.includes(
    "u.kind === 'merc' || u.kind === 'summon'"),
    'гейт allyCanDo heal: kind merc|summon (зеркало 1:1) (RED)');
  const uiSrc = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'combat-ui.js'), 'utf8');
  assert.ok(uiSrc.includes("(u.kind === 'merc' || u.kind === 'summon')"),
    'гейты combat-ui (build-gate/activeIsMercWithBook): kind merc|summon (RED)');
  // Рассеивание — startRound: ровно 4 раунда жизни, включая каст
  // (паттерн C4 000235.01).
  {
    const p = spellHero({ spells: ['light_sprite'], wisdom: 11, mp: 40 });
    const c = soloCombat(p, 'wolf');
    const w = c.units[0];
    c.obstacles.clear();
    w.x = 3; w.y = 1; w.maxHP = 2000; w.hp = 2000;
    w.damage = 0;
    c._rng = () => 0.01;
    const r = castSpell(c, 'light_sprite');
    assert.equal(r.ok, true, 'light_sprite: каст (' + r.reason + ')');
    const s = c.units.find((u) => u.kind === 'summon');
    assert.equal(s.summonTurns, 4, 'раунд каста: summonTurns 4');
    c.endTurn(); // раунд 2: тик 4 → 3
    assert.equal(c.round, 2);
    assert.equal(s.summonTurns, 3, 'тик startRound: 4 → 3');
    c.endTurn(); // слот призывного (раунд 2) — пропуск хода
    c.endTurn();
    assert.equal(s.summonTurns, 2, 'раунд 3: 3 → 2');
    c.endTurn();
    c.endTurn();
    assert.equal(s.summonTurns, 1, 'раунд 4: 2 → 1');
    c.endTurn();
    c.endTurn(); // начало раунда 5: 1 → 0 — рассеивание
    assert.equal(c.round, 5, 'рассеивается в начале раунда R+4');
    assert.equal(s.summonTurns, 0, 'ровно 4 раунда жизни');
    assert.equal(s.fled, true, 'рассеивание — fled (не смерть)');
    assert.ok(c.log.some((l) => l.includes('рассеивается')),
      'лог «…рассеивается.»');
  }
  // Fail-closed: неизвестный призыв — ДО расхода пула/маны.
  const bad = Object.assign(ocGuest0235('w13_10_badsummon', {
    действие: 'призыв', параметры: { summon: 'nope', turns: 4 },
    вне_боя: false,
  }));
  try {
    pushOcGuests(dataMod, [bad]);
    const p = spellHero({ spells: [bad.id], wisdom: 11, mp: 40 });
    const c = soloCombat(p, 'wolf');
    const r = castSpell(c, bad.id);
    assert.equal(r.ok, false, 'неизвестный призыв — отказ');
    assert.equal(r.reason, 'неизвестный призыв: nope', 'fail-closed reason');
    assert.equal(p.mp, 40, 'отказ — до расхода маны');
  } finally {
    popOcGuests(dataMod, [bad]);
  }
});

test('000235.10 W-14: внебойные границы — isHeroPrayer `>=` (каст D days1 → expiresDay D+1: onDay(D+1) — restoreDay ×1.1 РАБОТАЕТ (запись ещё в массиве), onDay(D+2) — запись вылетела, ×1; hp И mp +10% — sheet.js restoreDay); camp+prayer → 1.1 (OR, НЕ 1.21) — source-пин main.js; holyLightRadius `>`; isHeroDivineProtected `>` (каст D → активен D, неактивен D+1)', () => {
  const { isHeroPrayer, isHeroDivineProtected, holyLightRadius } =
    loadSpells();
  assert.equal(typeof isHeroPrayer, 'function',
    '000235.10: export Spells.isHeroPrayer (RED: нет)');
  assert.equal(typeof isHeroDivineProtected, 'function',
    '000235.10: export Spells.isHeroDivineProtected (RED: нет)');
  assert.equal(typeof holyLightRadius, 'function',
    '000235.10: export Spells.holyLightRadius (RED: нет)');
  const day = 10;
  const recP = (e) => ({ spellId: 'prayer', expiresDay: e });
  const recD = (e) => ({ spellId: 'divine_protection', expiresDay: e });
  const recH = (e) => ({ spellId: 'holy_light', expiresDay: e });
  // isHeroPrayer — ГРАНИЦА `>=` (consumer restoreDay идёт ДО
  // expireOutOfCombatEffects — с `>` реген был бы dead-on-arrival;
  // прецедент .07 isHeroCamped).
  assert.equal(isHeroPrayer({ outOfCombatEffects: [recP(day)] }, day), true,
    'граница: expiresDay === day — TRUE (>=, не >)');
  assert.equal(isHeroPrayer({ outOfCombatEffects: [recP(day + 1)] }, day), true,
    'expiresDay = day+1 — true');
  assert.equal(isHeroPrayer({ outOfCombatEffects: [recP(day - 1)] }, day), false,
    'expiresDay < day — false');
  assert.equal(isHeroPrayer({ outOfCombatEffects: [recD(day)] }, day), false,
    'чужой id (divine_protection) — false');
  assert.equal(isHeroPrayer({}, day), false, 'нет поля — false');
  assert.equal(isHeroPrayer(null, day), false, 'null — false');
  assert.equal(isHeroPrayer({ outOfCombatEffects:
    [null, 'мусор', 42, { expiresDay: day + 1 },
     { spellId: 'нет_такого', expiresDay: day + 1 }] }, day), false,
    'мусор-записи — false без краха');
  // isHeroDivineProtected — ГРАНИЦА `>` (боевой старт — live-день).
  assert.equal(isHeroDivineProtected({ outOfCombatEffects: [recD(day)] }, day), false,
    'граница: expiresDay === day — false (> , не >=)');
  assert.equal(isHeroDivineProtected({ outOfCombatEffects: [recD(day + 1)] }, day), true,
    'expiresDay = day+1 — true');
  assert.equal(isHeroDivineProtected({ outOfCombatEffects: [recD(day - 1)] }, day), false,
    'expiresDay < day — false');
  assert.equal(isHeroDivineProtected({ outOfCombatEffects: [recP(day + 1)] }, day), false,
    'чужой id (prayer) — false');
  assert.equal(isHeroDivineProtected(null, day), false, 'null — false');
  // holyLightRadius — `>` (полное покрытие — W-11a).
  assert.equal(holyLightRadius({ outOfCombatEffects: [recH(day)] }, day), 0,
    'граница: expiresDay === day → 0 (>)');
  assert.equal(holyLightRadius({ outOfCombatEffects: [recH(day + 1)] }, day), 5,
    'expiresDay = day+1 → 5');
  // Каст D (days 1) → expiresDay D+1: onDay(D+1) — restoreDay ×1.1
  // (запись ещё в массиве — граница >=), ПОТОМ
  // expireOutOfCombatEffects (keep expiresDay > day) — запись
  // вылетела; onDay(D+2) — ×1.
  {
    const h = { outOfCombatEffects: [recP(day + 1)] };
    const multOn = isHeroPrayer(h, day + 1) ? 1.1 : 1;
    assert.equal(multOn, 1.1,
      'onDay(D+1): restoreDay ×1.1 (граница >= — запись ещё в массиве)');
    const kept = h.outOfCombatEffects.filter((r) => r.expiresDay > day + 1);
    assert.equal(kept.length, 0,
      'onDay(D+1): после restoreDay — запись вылетела (expiresDay > day)');
    const multOff = isHeroPrayer({ outOfCombatEffects: kept }, day + 2)
      ? 1.1 : 1;
    assert.equal(multOff, 1, 'onDay(D+2): записи нет → ×1');
    // ×1.1 — HP И MP (+10%, sheet.js restoreDay).
    const player = require('../src/player.js');
    const Sheet = require('../src/sheet.js');
    function regenHero() {
      const hh = player.createCharacter();
      hh.primary.constitution = 10;
      hh.primary.intelligence = 10;
      hh.primary.wisdom = 10;
      hh.level = 1;
      hh.hp = 0;
      hh.mp = 0;
      return hh;
    }
    const base = Sheet.restoreDay(regenHero());
    const boost = Sheet.restoreDay(regenHero(), 1.1);
    assert.ok(base.hp > 0 && base.mp > 0, 'фикстура: базовый реген > 0');
    assert.ok(boost.hp > base.hp, '×1.1 — HP реген больше');
    assert.ok(boost.mp > base.mp, '×1.1 — MP реген больше');
  }
  // camp + prayer — OR (1.1, НЕ 1.21): source-пин main.js
  // (onDay restoreDay: isHeroCamped || isHeroPrayer → ? 1.1 : 1).
  const mainSrc = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  const iCamped = mainSrc.indexOf('isHeroCamped');
  assert.ok(iCamped >= 0, 'фикстура: isHeroCamped в main.js (.07)');
  const seg = mainSrc.slice(iCamped, iCamped + 400);
  assert.ok(seg.includes('isHeroPrayer'),
    'main.js onDay: isHeroPrayer в restoreDay (RED: не добавлен)');
  assert.ok(seg.includes('||'),
    'main.js onDay: OR (camp + prayer → 1.1, НЕ 1.21) (RED)');
  assert.ok(seg.includes('1.1'), 'main.js onDay: константа 1.1 (+10%)');
  assert.ok(seg.includes(': 1'), 'main.js onDay: иначе ×1');
});

test('000235.10 W-15: NO-OP data-pins + регрессия — {реген} (regeneration/life_bloom/circle_of_light) в каталоге + бой: hp инвариантен («потребителя нет»); swift_prayer {ход,1} — moveCells не меняется; divine_favor — c.ps.buff ровно {урон,0.15,3} (второго стата НЕТ); smite — t.debuff ровно {урон_вниз,0.15,3}, урона НЕТ (бит-в-бит); holy_bind — t.bind {turns:1} (получаемый_урон_вверх НЕТ); РЕГРЕССИЯ: mend/light_heal/greater_heal — лечение бит-в-байт; ВСЕ урон-касты каталога — формула инвариантна', () => {
  const dataMod = loadSpellsData();
  for (const id of ['regeneration', 'life_bloom', 'circle_of_light',
    'swift_prayer', 'divine_favor', 'smite', 'holy_bind']) {
    assert.ok(dataMod.SPELLS_BY_ID[id], `W-15: ${id} (RED: нет)`);
  }
  const { castSpell } = loadSpells();
  const { derived: pDer } = require('../src/player.js');
  // (a) {реген} — потребителя нет: hp инвариантен (каст + тик).
  {
    const p = spellHero({ spells: ['regeneration'], wisdom: 10, mp: 40 });
    const c = createCombat({ player: p, mobs: ['wolf'], mobLevel: 2,
      seed: 13 });
    const w = c.units[0];
    w.x = 0; w.y = 0; // далеко — без вмешательства
    const hp0 = p.hp;
    const r = castSpell(c, 'regeneration');
    assert.equal(r.ok, true, 'regeneration: каст ok (' + r.reason + ')');
    assert.equal(r.healed, undefined,
      'regeneration: лечения НЕТ (W-11: только баф)');
    assert.deepEqual(c.ps.buff, { stat: 'реген', value: 1, turns: 3 },
      'regeneration: c.ps.buff {реген,1,3} (записан)');
    c._rng = () => 0.99;
    c.endTurn(); // раунд 2: тик startRound (turns 3→2)
    assert.equal(c.ps.buff.turns, 2, 'тик startRound: 3 → 2');
    assert.equal(p.hp, hp0,
      'regeneration: hp инвариантен («реген» — потребителя нет)');
  }
  // (b) life_bloom: хил формулой + баф {реген,1,2} той же цели.
  {
    const p = spellHero({ spells: ['life_bloom'], wisdom: 10, mp: 40 });
    const pMax = pDer(p).maxHP;
    p.hp = Math.max(1, pMax - 30);
    const c = createCombat({ player: p, mobs: ['wolf'], mobLevel: 2,
      seed: 13 });
    const w = c.units[0];
    w.x = 0; w.y = 0;
    const r = castSpell(c, 'life_bloom');
    assert.equal(r.ok, true, 'life_bloom: каст ok (' + r.reason + ')');
    assert.equal(r.healed, 10,
      'life_bloom: хил формулой (round((4+5+1)·1) = 10)');
    assert.deepEqual(c.ps.buff, { stat: 'реген', value: 1, turns: 2 },
      'life_bloom: c.ps.buff {реген,1,2}');
  }
  // (c) circle_of_light — штатная зона {реген}: союзники в радиусе
  // u.buff, hp инвариантен; игрок не затрагивается.
  {
    const p = spellHero({ spells: ['circle_of_light'], wisdom: 10, mp: 40 });
    const c = createCombat({ player: p, mobs: ['wolf'], mobLevel: 2,
      seed: 13,
      allies: [{ name: 'Вольк', role: 'melee', level: 1, dmg: 1.2,
        hp: 1.1, skills: [], spells: [] }] });
    const w = c.units.find((u) => u.side === 'mob');
    w.x = 0; w.y = 0;
    const a = c.units.find((u) => u.side === 'ally');
    const aHp = a.hp;
    const personal = { stat: 'реген', value: 1, turns: 2 };
    c.ps.buff = personal;
    const r = castSpell(c, 'circle_of_light');
    assert.equal(r.ok, true, 'circle_of_light: каст ok (' + r.reason + ')');
    assert.deepEqual(c.zone,
      { x: c.px, y: c.py, radius: 2, stat: 'реген', value: 1, turns: 3 },
      'circle_of_light: c.zone — штатная зона');
    assert.equal(r.zone, 2, 'circle_of_light: out.zone = radius');
    assert.deepEqual(a.buff, { stat: 'реген', value: 1, turns: 3 },
      'circle_of_light: союзник в радиусе — u.buff {реген,1,3}');
    assert.equal(c.ps.buff, personal,
      'circle_of_light: личный баф игрока НЕ ИЗМЕНЁН (та же ссылка — слот зоны не стирает)');
    assert.deepEqual(c.ps.buff,
      { stat: 'реген', value: 1, turns: 2 },
      'circle_of_light: те же stat/value/turns (игрок не затрагивается)');
    c._rng = () => 0.99;
    c.endTurn();
    c.endTurn();
    assert.equal(a.hp, aHp,
      'circle_of_light: hp союзника инвариантен (NO-OP реген)');
    assert.equal(c.zone.turns, 2, 'тик зоны: 3 → 2');
  }
  // (d) swift_prayer — баф «ход»: потребителя нет — moveCells
  // не меняется.
  {
    const p = spellHero({ spells: ['swift_prayer'], wisdom: 10, mp: 40 });
    const c = createCombat({ player: p, mobs: ['wolf'], mobLevel: 2,
      seed: 13 });
    const move0 = pDer(p).moveCells;
    const r = castSpell(c, 'swift_prayer');
    assert.equal(r.ok, true, 'swift_prayer: каст ok (' + r.reason + ')');
    assert.deepEqual(c.ps.buff, { stat: 'ход', value: 1, turns: 3 },
      'swift_prayer: c.ps.buff {ход,1,3}');
    assert.equal(pDer(p).moveCells, move0,
      'swift_prayer: moveCells не меняется («ход» — потребителя нет)');
  }
  // (e) divine_favor — c.ps.buff ровно {урон,0.15,3} (второго стата
  // НЕТ).
  {
    const p = spellHero({ spells: ['divine_favor'], wisdom: 10, mp: 40 });
    const c = createCombat({ player: p, mobs: ['wolf'], mobLevel: 2,
      seed: 13 });
    const r = castSpell(c, 'divine_favor');
    assert.equal(r.ok, true, 'divine_favor: каст ok (' + r.reason + ')');
    assert.deepEqual(c.ps.buff, { stat: 'урон', value: 0.15, turns: 3 },
      'divine_favor: c.ps.buff ровно {урон,0.15,3}');
    assert.equal(Object.keys(c.ps.buff).length, 3,
      'divine_favor: лишних ключей НЕТ');
  }
  // (f) smite — t.debuff ровно {урон_вниз,0.15,3}, урона НЕТ.
  {
    const p = spellHero({ spells: ['smite'], wisdom: 10, mp: 40 });
    const c = soloCombat(p, 'wolf');
    const w = c.units[0];
    const hp0 = w.hp;
    const r = castSpell(c, 'smite', w.id);
    assert.equal(r.ok, true, 'smite: каст ok (' + r.reason + ')');
    assert.deepEqual(w.debuff,
      { stat: 'урон_вниз', value: 0.15, turns: 3 },
      'smite: t.debuff ровно {урон_вниз,0.15,3}');
    assert.equal(r.debuffed, w.id, 'smite: out.debuffed');
    assert.equal(w.hp, hp0, 'smite: урона НЕТ (бит-в-бит)');
    assert.equal(r.dmg, undefined, 'smite: out.dmg НЕТ');
  }
  // (g) holy_bind — t.bind {turns:1}; дебафа/урона НЕТ.
  {
    const p = spellHero({ spells: ['holy_bind'], wisdom: 10, mp: 40 });
    const c = soloCombat(p, 'wolf');
    const w = c.units[0];
    const hp0 = w.hp;
    const r = castSpell(c, 'holy_bind', w.id);
    assert.equal(r.ok, true, 'holy_bind: каст ok (' + r.reason + ')');
    assert.deepEqual(w.bind, { turns: 1 }, 'holy_bind: t.bind {turns:1}');
    assert.equal(r.bound, w.id, 'holy_bind: out.bound');
    assert.equal(w.debuff, undefined,
      'holy_bind: дебафа НЕТ (получаемый_урон_вверх — не ставится)');
    assert.equal(w.hp, hp0, 'holy_bind: урона НЕТ');
  }
  // РЕГРЕССИЯ (главная): mend/light_heal/greater_heal — одиночный
  // путь лечения бит-в-байт (расширение case 'лечение' НЕ МЕНЯЕТ
  // его).
  for (const [id, st] of [['mend', 1], ['light_heal', 1],
    ['greater_heal', 2]]) {
    const p = spellHero({ spells: [id], wisdom: 10, mp: 40 });
    const pMax = pDer(p).maxHP;
    p.hp = Math.max(1, pMax - 30);
    const c = createCombat({ player: p, mobs: ['wolf'], mobLevel: 2,
      seed: 13 });
    const w = c.units[0];
    w.x = 0; w.y = 0;
    const r = castSpell(c, id);
    const expected = Math.round((4 + 0.5 * 10 + 1)
      * (1 + 0.15 * (st - 1)));
    assert.equal(r.ok, true, `${id}: каст (${r.reason})`);
    assert.equal(r.healed, expected,
      `${id}: лечение бит-в-байт (${expected})`);
  }
  // ВСЕ урон-заклинания каталога — формула инвариантна (волна
  // Исцеление урона не добавляет).
  let n = 0;
  for (const s of dataMod.SPELLS) {
    if (s.действие !== 'урон') continue;
    const p = spellHero({ spells: [s.id], intelligence: 1, mp: 40 });
    const c = soloCombat(p, 'wolf');
    const r = castSpell(c, s.id, c.units[0].id);
    assert.equal(r.ok, true, `${s.id}: каст (${r.reason})`);
    const expected = Math.round(
      (4 + 0.5 * p.primary[s.атрибут]) *
      (1 + 0.15 * (s.степень - 1)));
    assert.equal(r.dmg, expected, `${s.id}: формула урона инвариантна`);
    n += 1;
  }
  assert.equal(n, 29,
    'урон-заклинаний: 29 — волна Исцеление урона НЕ добавляет (инвариант)');
});

test('000235.10 W-16: divine_protection — castOutOfCombat {ok, запись day+1, mp −7}; бой в день эффекта: buffMods {incomingMult:0.85} (форма main.js currentBuffMods) — урон по герою 100→85 и по союзнику 20→17 (РЕАЛЬНЫЙ); день+1 — запись истекла (isHeroDivineProtected false); неактивен — ×1 бит-в-бит; normalizeBuffMods: мусор incomingMult → 1; prayer+divine_protection — одна запись на id; source-пин main.js (isHeroDivineProtected/incomingMult/0.85)', () => {
  const dataMod = loadSpellsData();
  assert.ok(dataMod.SPELLS_BY_ID['divine_protection'],
    'W-16: divine_protection (RED: нет)');
  const { castOutOfCombat, isHeroDivineProtected } = loadSpells();
  assert.equal(typeof isHeroDivineProtected, 'function',
    '000235.10: export Spells.isHeroDivineProtected (RED: нет)');
  const day = 10;
  {
    const p = spellHero({ spells: ['divine_protection'], mp: 30 });
    const r = castOutOfCombat(p, 'divine_protection', day);
    assert.equal(r.ok, true, 'каст вне боя ok (' + r.reason + ')');
    assert.equal(r.expiresDay, day + 1, 'запись day+1');
    assert.equal(p.mp, 23, 'mp −7 (30−7)');
    assert.deepEqual(p.outOfCombatEffects,
      [{ spellId: 'divine_protection', expiresDay: day + 1 }]);
    assert.equal(isHeroDivineProtected(p, day), true,
      'каст D → активен в D (expiresDay D+1 > D)');
    assert.equal(isHeroDivineProtected(p, day + 1), false,
      'день+1 — запись истекла (>, не >=)');
  }
  // Бой в день эффекта: buffMods { incomingMult: 0.85 } — форма,
  // которую main.js currentBuffMods отдаёт createCombat (§3.5).
  const { derived: pDer } = require('../src/player.js');
  function hitCase(buffMods) {
    const p = spellHero({ spells: ['divine_protection'], mp: 40 });
    p.primary.constitution = 20;
    p.primary.intelligence = 2;
    const pMax = pDer(p).maxHP;
    p.hp = pMax;
    const opts = { player: p, mobs: ['wolf'], mobLevel: 2, seed: 11,
      allies: [{ name: 'Вольк', role: 'melee', level: 1, dmg: 1.2,
        hp: 1.1, skills: [], spells: [] }] };
    if (buffMods) opts.buffMods = buffMods;
    const c = createCombat(opts);
    const w = c.units.find((u) => u.side === 'mob');
    w.x = c.px; w.y = c.py - 1;
    w.damage = 100;
    c._rng = () => 0.01;
    const hpBefore = p.hp;
    c.turnOrder = ['player', w.id];
    c.turnIndex = 0;
    c.phase = 'player';
    c.endTurn();
    const playerDmg = hpBefore - p.hp;
    const a = c.units.find((u) => u.side === 'ally');
    const allyDmg = combatInternals.dealDamageToAlly(c, a, 20);
    return { playerDmg, allyDmg };
  }
  {
    const { playerDmg, allyDmg } = hitCase({ incomingMult: 0.85 });
    assert.equal(playerDmg, 85,
      'волк 100 → 85 по герою (×0.85; броня 0) (RED: 100)');
    assert.equal(allyDmg, 17,
      'dealDamageToAlly 20 → 17 (×0.85) (RED: 20)');
  }
  {
    const { playerDmg, allyDmg } = hitCase(undefined);
    assert.equal(playerDmg, 100, 'неактивен — ×1 бит-в-бит (100)');
    assert.equal(allyDmg, 20, 'неактивен — 20 бит-в-бит');
  }
  // normalizeBuffMods: мусор incomingMult → 1 (fail-open, паттерн
  // damageMult/armor).
  for (const [v, expected] of [[-1, 1], [2, 1], ['a', 1], [0, 1],
    [null, 1], [0.5, 0.5], [undefined, 1]]) {
    const c = createCombat({
      player: spellHero({ spells: [] }),
      mobs: ['wolf'], mobLevel: 2, seed: 11,
      buffMods: { incomingMult: v } });
    assert.equal(c.buffMods.incomingMult, expected,
      'normalizeBuffMods: incomingMult ' + JSON.stringify(v) + ' → '
        + expected);
  }
  // prayer + divine_protection — не конфликтуют (одна запись на id).
  {
    const p = spellHero({ spells: ['prayer', 'divine_protection'], mp: 30 });
    assert.ok(dataMod.SPELLS_BY_ID['prayer'],
      'W-16: prayer (RED: нет)');
    assert.equal(castOutOfCombat(p, 'prayer', day).ok, true,
      'prayer: каст');
    assert.equal(castOutOfCombat(p, 'divine_protection', day).ok, true,
      'divine_protection: каст');
    assert.equal(p.outOfCombatEffects.length, 2, 'одна запись на id');
    assert.deepEqual(p.outOfCombatEffects.map((r) => r.spellId).sort(),
      ['divine_protection', 'prayer']);
  }
  // Source-пин main.js: currentBuffMods — divine_protection →
  // incomingMult 0.85 (неактивен — return m, бит-в-бит).
  const mainSrc = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  assert.ok(mainSrc.includes('isHeroDivineProtected'),
    'main.js: потребитель isHeroDivineProtected (RED: нет)');
  assert.ok(mainSrc.includes('incomingMult'),
    'main.js: buffMods.incomingMult (RED: нет)');
  assert.ok(mainSrc.includes('0.85'),
    'main.js: калибровка 0.85 (−15%) (RED: нет)');
});

// --- Задача 000235.11: волна Защита — 25 заклинаний + 25 свитков (TDD) ---
//
// Контракт: memory/000235.11-protection-wave-content.md. RED: записи/
// зеркала/гейты отсутствуют (ENOENT / undefined / count / отсутствие
// гейта) — осмысленно, не синтаксис. Таблица ТЗ дословно (кроме
// stony_hide — переименование §11.2); нумерация append-only: spells
// 000118–000142, свитки items 000460–000484 (тот же порядок).
// W-08 = ре-пин fire W-08 (spells-data 117→142 / items-data 459→484 —
// выше в файле).

const PROT11 = [
  // id, название, действие, уровень, степень, база(файл|null), мани, вне_боя
  ['iron_bulwark', 'Железный бастион', 'защита', 1, 1, null, 4, false],
  ['aegis', 'Эгида', 'защита', 2, 1, null, 8, false],
  ['shield_wall', 'Стена щитов', 'защита', 2, 2,
    'assets/spells/000118.json', 7, false],
  ['magical_barrier', 'Магический барьер', 'защита', 3, 3,
    'assets/spells/000014.json', 13, false],
  ['stony_hide', 'Каменный панцирь', 'защита', 3, 1, null, 12, false],
  ['iron_bastion', 'Железная твердыня', 'защита', 4, 3,
    'assets/spells/000120.json', 20, false],
  ['bulwark_ward', 'Ограда бастиона', 'защита', 4, 1, null, 20, false],
  ['resilience', 'Стойкость', 'баф', 1, 1, null, 3, false],
  ['thorns', 'Шипы', 'баф', 1, 1, null, 4, false],
  ['fortitude', 'Крепость духа', 'баф', 2, 1, null, 6, false],
  ['guardian_oath', 'Клятва хранителя', 'баф', 2, 1, null, 7, false],
  ['stalwart', 'Непоколебимость', 'баф', 3, 1, null, 13, false],
  ['aura_of_protection', 'Аура защиты', 'баф', 3, 1, null, 12, false],
  ['weaken_defense', 'Ослабление защиты', 'дебаф', 2, 1, null, 6, false],
  ['corrode', 'Коррозия', 'дебаф', 3, 1, null, 11, false],
  ['stone_grasp', 'Каменная хватка', 'контроль', 2, 1, null, 6, false],
  ['time_slow', 'Замедление времени', 'контроль', 3, 1, null, 12, false],
  ['stone_wall', 'Каменная стена', 'создание', 2, 1, null, 7, false],
  ['guardian_field', 'Хранительное поле', 'создание', 3, 1, null, 12, false],
  ['stone_golem', 'Каменный голем', 'призыв', 3, 1, null, 14, false],
  ['iron_sentinel', 'Железный страж', 'призыв', 4, 1, null, 20, false],
  ['stone_anchor', 'Каменный якорь', 'телепорт', 2, 1, null, 7, true],
  ['recall', 'Возврат', 'телепорт', 2, 1, null, 7, true],
  ['gate', 'Врата', 'телепорт', 3, 1, null, 12, true],
  ['warding_circle', 'Круг защиты', 'внебой', 3, 1, null, 10, true],
];
const PROT11_IDS = PROT11.map((r) => r[0]);
const PROT11_OC = ['stone_anchor', 'recall', 'gate', 'warding_circle'];

function protSpellFile(i) {
  return path.join(DIR, String(118 + i).padStart(6, '0') + '.json');
}
function protScrollFile(i) {
  return `assets/items/${String(460 + i).padStart(6, '0')}.json`;
}

test('000235.11 W-01: пин переименования — stony_hide (000122) = «Каменный панцирь» (id НЕ менять; имя «Каменная кожа» занято stone_skin 000013 — тот её ХРАНИТ, регрессия); sweep уникальности `название` по ВСЕМУ каталогу — 142 без дублей', () => {
  const dataMod = loadSpellsData();
  const s = dataMod.SPELLS_BY_ID['stony_hide'];
  assert.ok(s,
    'W-01: stony_hide — запись в зеркале (RED: нет — файла/регена нет)');
  assert.equal(s.название, 'Каменный панцирь',
    'stony_hide: название «Каменный панцирь» (переименование §11.2)');
  assert.equal(s.id, 'stony_hide', 'stony_hide: id НЕ менять');
  const legacy = dataMod.SPELLS_BY_ID['stone_skin'];
  assert.ok(legacy, 'фикстура: 000013 stone_skin (регрессия)');
  assert.equal(legacy.название, 'Каменная кожа',
    'stone_skin: «Каменная кожа» НЕ тронута (регрессия — чужое имя)');
  const names = dataMod.SPELLS.map((x) => x.название);
  assert.equal(names.length, 142,
    'каталог: 142 заклинания (RED: ' + names.length + ')');
  const seen = new Set();
  for (const n of names) {
    assert.ok(!seen.has(n), 'дубль названия: «' + n + '» (sweep)');
    seen.add(n);
  }
});

test('000235.11 W-02: 25 записей spells — id/название/школа=защита/атрибут=wisdom/действие/уровень/степень/база/мани/icon/icon_prompt/описание/здания [000019,000021,000038]/предметы = СВОЙ свиток (000460–000484, тот же порядок)/вне_боя РОВНО у 4 (stone_anchor/recall/gate/warding_circle)', () => {
  let ocCount = 0;
  PROT11.forEach((row, i) => {
    const [id, name, action, level, degree, base, mana, oc] = row;
    const f = protSpellFile(i);
    assert.ok(fs.existsSync(f),
      `W-02: запись отсутствует — ${path.basename(f)} (${id}) (RED: файл нет)`);
    const d = JSON.parse(fs.readFileSync(f, 'utf8'));
    assert.equal(d.id, id, `${id}: id`);
    assert.equal(d.название, name, `${id}: название`);
    assert.equal(d.школа, 'защита', `${id}: школа`);
    assert.equal(d.атрибут, 'wisdom', `${id}: атрибут`);
    assert.equal(d.действие, action, `${id}: действие`);
    assert.equal(d.уровень, level, `${id}: уровень`);
    assert.equal(d.степень, degree, `${id}: степень`);
    assert.equal(d.база, base, `${id}: база`);
    assert.equal(d.мани, mana, `${id}: мани`);
    assert.equal(d.icon, `assets/spell-icons/${id}.svg`, `${id}: icon`);
    assert.ok(typeof d.icon_prompt === 'string'
      && d.icon_prompt.trim().length > 0,
      `${id}: icon_prompt непустое`);
    assert.ok(typeof d.описание === 'string'
      && d.описание.trim().length > 0,
      `${id}: описание непустое`);
    assert.deepEqual(d.здания,
      ['assets/buildings/000019.json', 'assets/buildings/000021.json',
       'assets/buildings/000038.json'],
      `${id}: здания = [19, 21, 38] (D12)`);
    assert.deepEqual(d.предметы, [protScrollFile(i)],
      `${id}: предметы = [свой свиток ${protScrollFile(i)}]`);
    assert.equal(d.вне_боя === true, oc, `${id}: вне_боя`);
    if (oc) ocCount += 1;
  });
  assert.equal(ocCount, 4,
    'вне_боя — ровно 4 (stone_anchor, recall, gate, warding_circle)');
});

test('000235.11 W-03: параметры — точный deepEqual на 23 (таблица §1.5); БЕЗ «параметры» — ровно 2: stone_grasp/time_slow; цепочки C1 (magical_barrier ст3 = ward 000014 ст2 + 1; регрессия magic_shield→ward цела) / C2 (shield_wall ст2 на 000118, iron_bastion ст3 на 000120); мани — точные значения §1.2 + полосы 000119 (L1 3–5 / L2 6–8 / L3 10–15 / L4 20)', () => {
  const P = {
    iron_bulwark: { value: 1, turns: 3 },
    aegis: { stat: 'отражение', value: 0.25, turns: 3 },
    shield_wall: { value: 1, turns: 3 },
    magical_barrier: { value: 3, turns: 3 },
    stony_hide: { stat: 'иммунитет_контроля', value: 1, turns: 3 },
    iron_bastion: { value: 2, turns: 3 },
    bulwark_ward: { stat: 'получаемый_урон', value: 0.15, turns: 3 },
    resilience: { stat: 'получаемый_урон', value: 0.15, turns: 3 },
    thorns: { stat: 'отражение', value: 0.25, turns: 3 },
    fortitude: { stat: 'иммунитет_контроля', value: 1, turns: 3 },
    guardian_oath: { stat: 'броня', value: 1, turns: 3 },
    stalwart: { stat: 'получаемый_урон', value: 0.15, turns: 3 },
    aura_of_protection: { stat: 'броня', value: 1, turns: 3 },
    weaken_defense: { stat: 'броня_вниз', value: 0.5, turns: 3 },
    corrode: { stat: 'урон_вниз', value: 0.15, turns: 3 },
    stone_wall: { object: 'стена', turns: 5 },
    guardian_field: { object: 'зона', stat: 'получаемый_урон',
      value: 0.15, turns: 3, radius: 2 },
    stone_golem: { summon: 'stone_golem', turns: 4 },
    iron_sentinel: { summon: 'bone_coloss', turns: 4 },
    stone_anchor: { mode: 'метка_установить' },
    recall: { mode: 'метка_вернуться' },
    gate: { mode: 'город' },
    warding_circle: { days: 1, radius: 5 },
  };
  const NO_PARAMS = new Set(['stone_grasp', 'time_slow']);
  assert.equal(NO_PARAMS.size, 2, 'фикстура: 2 без параметров');
  PROT11.forEach((row, i) => {
    const id = row[0];
    const f = protSpellFile(i);
    assert.ok(fs.existsSync(f), `W-03: запись отсутствует — ${id} (RED)`);
    const d = JSON.parse(fs.readFileSync(f, 'utf8'));
    const expected = P[id];
    if (expected !== undefined) {
      assert.deepEqual(d.параметры, expected, `${id}: параметры по таблице`);
    } else {
      assert.equal(d.параметры, undefined,
        `${id}: БЕЗ «параметры» (${NO_PARAMS.has(id)
          ? 'таблица §1.5' : 'ошибка таблицы'})`);
    }
  });
  // C1 — расширение СУЩЕСТВУЮЩЕЙ цепочки magic_shield→ward:
  // magical_barrier ст3 = ward (000014) ст2 + 1.
  {
    const row = PROT11.find((r) => r[0] === 'magical_barrier');
    const parent = JSON.parse(
      fs.readFileSync(path.join(DIR, '000014.json'), 'utf8'));
    assert.equal(parent.id, 'ward', 'фикстура: 000014 = ward');
    assert.equal(parent.степень, 2, 'фикстура: ward ст2');
    assert.equal(parent.уровень, 3, 'фикстура: ward ур3');
    assert.equal(parent.школа, 'защита', 'фикстура: одна школа');
    assert.equal(row[4], parent.степень + 1,
      'C1: magical_barrier ст3 = ward ст2 + 1');
    assert.ok(row[3] >= parent.уровень, 'C1: уровень не ниже предка');
    assert.ok(row[6] >= parent.мани, 'C1: мани не ниже предка (13 ≥ 12)');
    assert.equal(row[5], 'assets/spells/000014.json',
      'C1: база = файл предка (таблица)');
    const f = protSpellFile(PROT11_IDS.indexOf('magical_barrier'));
    if (fs.existsSync(f)) {
      const d = JSON.parse(fs.readFileSync(f, 'utf8'));
      assert.equal(d.база, 'assets/spells/000014.json',
        'C1: база = файл предка (файл)');
    }
    const base = JSON.parse(
      fs.readFileSync(path.join(DIR, '000012.json'), 'utf8'));
    assert.equal(base.id, 'magic_shield',
      'фикстура: 000012 = magic_shield');
    assert.equal(parent.база, 'assets/spells/000012.json',
      'C1 регрессия: ward.база = 000012 (цепочка цела)');
  }
  // C2 — новая цепочка iron_bulwark → shield_wall → iron_bastion.
  const byId = new Map(PROT11.map((r) => [r[0], r]));
  const CHAINS = [
    ['shield_wall', 'iron_bulwark'],
    ['iron_bastion', 'shield_wall'],
  ];
  for (const [child, parent] of CHAINS) {
    const ci = PROT11_IDS.indexOf(child);
    const pi = PROT11_IDS.indexOf(parent);
    assert.ok(ci >= 0 && pi >= 0, `цепочка: ${child}/${parent} в таблице`);
    const childDegree = byId.get(child)[4];
    const parentDegree = byId.get(parent)[4];
    assert.equal(childDegree, parentDegree + 1,
      `цепочка ${parent} → ${child}: степень = ${parentDegree} + 1`);
    assert.equal(byId.get(child)[5],
      `assets/spells/${String(118 + pi).padStart(6, '0')}.json`,
      `цепочка ${parent} → ${child}: база (таблица) = файл предка`);
  }
  for (const [child, parent] of CHAINS) {
    const ci = PROT11_IDS.indexOf(child);
    const f = protSpellFile(ci);
    if (!fs.existsSync(f)) continue; // RED: файл нет — выше упали
    const d = JSON.parse(fs.readFileSync(f, 'utf8'));
    const parentFile = String(118 + PROT11_IDS.indexOf(parent))
      .padStart(6, '0') + '.json';
    assert.equal(d.база, 'assets/spells/' + parentFile,
      `цепочка ${parent} → ${child}: база = файл предка`);
  }
  // Мани — в полосах по уровню + точные значения §1.2 (таблица PROT11).
  const BANDS = { 1: [3, 5], 2: [6, 8], 3: [10, 15], 4: [20, 20] };
  PROT11.forEach(([id, , , level, , , mana]) => {
    const [lo, hi] = BANDS[level];
    assert.ok(mana >= lo && mana <= hi,
      `${id}: мани ${mana} в полосе L${level} [${lo}..${hi}]`);
  });
});

test('000235.11 W-04: case «защита» params-aware — legacy три (magic_shield/stone_skin/ward — ключа «параметры» НЕТ) бит-в-бит {armor: 1+степень, turns: 3}, c.ps.buff нетронут; плоская (value без stat) — armor = value (iron_bulwark 1 / magical_barrier 3); hasStat — armor 1+степень + вторичный баф (aegis {отражение,0.25,3} / stony_hide {иммунитет_контроля,1,3} — NO-OP: пишутся, потребителя нет, краха нет)', () => {
  const dataMod = loadSpellsData();
  const { castSpell } = loadSpells();
  // (a) legacy — бит-в-бит (регрессия, «параметры» нет).
  for (const [id, armor, mana] of [
    ['magic_shield', 2, 5], ['stone_skin', 2, 8], ['ward', 3, 12]]) {
    const p = spellHero({ spells: [id], wisdom: 10, mp: 30 });
    const c = soloCombat(p, 'wolf');
    const poolBefore = c.ps.spellWis;
    const r = castSpell(c, id);
    assert.equal(r.ok, true, `${id}: каст ok (${r.reason})`);
    assert.deepEqual(c.ps.shield, { armor, turns: 3 },
      `${id}: legacy — бит-в-бит {armor: 1+степень, turns: 3}`);
    assert.equal(c.ps.buff, null,
      `${id}: legacy — c.ps.buff нетронут (стата нет)`);
    assert.equal(c.ps.spellWis, poolBefore - 1, `${id}: пул −1`);
    assert.equal(p.mp, 30 - mana, `${id}: мана −${mana}`);
  }
  // (b) плоская — value без stat → armor = value.
  for (const [id, armor, mana] of [
    ['iron_bulwark', 1, 4], ['magical_barrier', 3, 13]]) {
    assert.ok(dataMod.SPELLS_BY_ID[id], `W-04: ${id} (RED: нет)`);
    const p = spellHero({ spells: [id], wisdom: 10, mp: 30 });
    const c = soloCombat(p, 'wolf');
    const r = castSpell(c, id);
    assert.equal(r.ok, true, `${id}: каст ok (${r.reason})`);
    assert.deepEqual(c.ps.shield, { armor, turns: 3 },
      `${id}: плоская — armor = value (${armor})`);
    assert.equal(c.ps.buff, null,
      `${id}: плоская — c.ps.buff нетронут (стата нет)`);
    assert.equal(p.mp, 30 - mana, `${id}: мана −${mana}`);
  }
  // (c) hasStat — armor 1+степень + вторичный баф (NO-OP-статы).
  for (const [id, stat, value] of [
    ['aegis', 'отражение', 0.25],
    ['stony_hide', 'иммунитет_контроля', 1]]) {
    assert.ok(dataMod.SPELLS_BY_ID[id], `W-04: ${id} (RED: нет)`);
    const p = spellHero({ spells: [id], wisdom: 10, mp: 30 });
    const c = soloCombat(p, 'wolf');
    const r = castSpell(c, id);
    assert.equal(r.ok, true, `${id}: каст ok (${r.reason})`);
    assert.deepEqual(c.ps.shield, { armor: 2, turns: 3 },
      `${id}: hasStat — armor 1+степень(1) = 2`);
    assert.deepEqual(c.ps.buff, { stat, value, turns: 3 },
      `${id}: вторичный баф {${stat}, ${value}, 3} (NO-OP: краха нет)`);
  }
});

test('000235.11 W-04b: PARTY_DEFENSE_IDS — shield_wall/iron_bastion/bulwark_ward: игрок + ВСЕ живые союзники, СВОЙ объект щита/бафа на КАЖДУЮ цель (общей ссылки НЕТ — blocker .10 W-12a.1); тик — turns 3→2→1→0 у ВСЕХ носителей (ровно 3 активных раунда, включая каст)', () => {
  const dataMod = loadSpellsData();
  const { castSpell } = loadSpells();
  const CASES = [
    ['shield_wall', 1, null],
    ['iron_bastion', 2, null],
    ['bulwark_ward', 2,
      { stat: 'получаемый_урон', value: 0.15, turns: 3 }],
  ];
  for (const [id, armor, buff] of CASES) {
    assert.ok(dataMod.SPELLS_BY_ID[id], `W-04b: ${id} (RED: нет)`);
    const p = spellHero({ spells: [id], wisdom: 10, mp: 40 });
    const allies = [];
    for (let i = 0; i < 3; i++) {
      allies.push({ name: 'Союзник' + i, role: 'melee', level: 1,
        dmg: 1, hp: 1, skills: [], spells: [] });
    }
    const c = createCombat({ player: p, mobs: ['wolf'], mobLevel: 2,
      seed: 7, allies });
    const w = c.units.find((u) => u.side === 'mob');
    w.x = 0; w.y = 0; // далеко — без вмешательства
    c._rng = () => 0.99; // удар волка всегда мимо
    const r = castSpell(c, id);
    assert.equal(r.ok, true, `${id}: каст ok (${r.reason})`);
    assert.equal(r.buffed, 'party', `${id}: out.buffed = 'party'`);
    assert.deepEqual(r.shield, { armor, turns: 3 }, `${id}: out.shield`);
    assert.deepEqual(c.ps.shield, { armor, turns: 3 },
      `${id}: c.ps.shield (игрок)`);
    const a = c.units.filter((u) => u.side === 'ally');
    assert.equal(a.length, 3, `${id}: партия — 3 живых союзника`);
    for (const x of a) {
      assert.deepEqual(x.shield, { armor, turns: 3 },
        `${id}: союзник ${x.name} — a.shield`);
      if (buff) {
        assert.deepEqual(x.buff, buff,
          `${id}: союзник ${x.name} — a.buff`);
      } else {
        assert.equal(x.buff, undefined,
          `${id}: союзник ${x.name} — a.buff нетронут (стата нет)`);
      }
    }
    if (buff) {
      assert.deepEqual(c.ps.buff, buff,
        `${id}: c.ps.buff (игрок, партия-стат)`);
    } else {
      assert.equal(c.ps.buff, null,
        `${id}: c.ps.buff нетронут (стата нет)`);
    }
    // Свои объекты: общих ссылок между носителями НЕТ.
    const sseq = [c.ps.shield, a[0].shield, a[1].shield, a[2].shield];
    for (let i = 0; i < sseq.length - 1; i++) {
      assert.notStrictEqual(sseq[i], sseq[i + 1],
        `${id}: объекты щитов РАЗНЫЕ (носитель ${i})`);
    }
    let bseq = null;
    if (buff) {
      bseq = [c.ps.buff, a[0].buff, a[1].buff, a[2].buff];
      for (let i = 0; i < bseq.length - 1; i++) {
        assert.notStrictEqual(bseq[i], bseq[i + 1],
          `${id}: объекты бафов РАЗНЫЕ (носитель ${i})`);
      }
    }
    // Очередь: игрок → 3 союзника → волк: раунд = 4 endTurn
    // (startRound — по исчерпании последнего слота).
    const round = () => {
      c.endTurn(); c.endTurn(); c.endTurn(); c.endTurn();
    };
    round(); // тик 1: 3 → 2 — активен во 2-м раунде
    for (const e of sseq) {
      assert.equal(e.turns, 2, `${id}: тик 1 — 3 → 2`);
    }
    if (bseq) for (const e of bseq) {
      assert.equal(e.turns, 2, `${id}: тик 1 баф — 3 → 2`);
    }
    round(); // тик 2: 2 → 1 — активен в 3-м раунде
    for (const e of sseq) {
      assert.equal(e.turns, 1, `${id}: тик 2 — 2 → 1`);
    }
    if (bseq) for (const e of bseq) {
      assert.equal(e.turns, 1, `${id}: тик 2 баф — 2 → 1`);
    }
    round(); // тик 3: 1 → 0 — с 4-го раунда истёк
    for (const e of sseq) {
      assert.equal(e.turns, 0,
        `${id}: тик 3 — 1 → 0 (ровно 3 активных раунда, включая каст)`);
    }
    if (bseq) for (const e of bseq) {
      assert.equal(e.turns, 0, `${id}: тик 3 баф — 1 → 0`);
    }
  }
});

test('000235.11 W-05: fail-closed гейт «защита» С «параметрами» (000235.01-паттерн «баф»/«дебаф»/«создание»): stat вне union → «неполные параметры: stat»; value не число → «неполные параметры: value»; turns 0 → «неполные параметры: turns» — все отказы ДО расхода пула/маны, canCastSpell — зеркало (одна причина, 000037); legacy БЕЗ ключа «параметры» — гейта НЕТ, каст ok (бит-в-бит)', () => {
  const dataMod = loadSpellsData();
  const { castSpell, canCastSpell } = loadSpells();
  for (const [tag, params] of [
    ['stat', { stat: 'плохой_стат', value: 1, turns: 3 }],
    ['value', { stat: 'отражение', value: 'много', turns: 3 }],
    ['turns', { stat: 'отражение', value: 0.25, turns: 0 }]]) {
    const g = ocGuest0235('w05_11_' + tag, {
      школа: 'защита', действие: 'защита', вне_боя: false,
      атрибут: 'wisdom', параметры: params,
    });
    try {
      pushOcGuests(dataMod, [g]);
      const p = spellHero({ spells: [g.id], wisdom: 10, mp: 40 });
      const c = soloCombat(p, 'wolf');
      const poolBefore = c.ps.spellWis;
      const mirror = canCastSpell(c, g.id);
      const core = castSpell(c, g.id);
      assert.equal(core.ok, false,
        `гейт ${tag}: отказ (RED: гейта для «защита» нет — каст ok)`);
      assert.equal(core.reason, 'неполные параметры: ' + tag,
        `гейт ${tag}: причина`);
      assert.equal(mirror.ok, false,
        `гейт ${tag}: зеркало — тот же отказ`);
      assert.equal(mirror.reason, core.reason,
        `гейт ${tag}: одна причина (зеркало 000037)`);
      assert.equal(c.ps.spellWis, poolBefore,
        `гейт ${tag}: пул при отказе не тратится`);
      assert.equal(p.mp, 40, `гейт ${tag}: мана при отказе не тратится`);
      assert.deepEqual(c.ps.shield, { armor: 0, turns: 0 },
        `гейт ${tag}: отказ — щит не записан (боевой первичный {0,0})`);
    } finally {
      popOcGuests(dataMod, [g]);
    }
  }
  // Ревью 000235.11: stat, присутствующий, но НЕ строка — отказ
  // (строже старого гейта, который трактовал его как плоскую броню;
  // строго как «баф»/«дебаф» 000235.01; плоская броня БЕЗ ключа
  // stat — легальна — legacy-блок ниже).
  {
    const g = ocGuest0235('w05_11_stat_num', {
      школа: 'защита', действие: 'защита', вне_боя: false,
      атрибут: 'wisdom', параметры: { stat: 42, value: 1, turns: 3 },
    });
    try {
      pushOcGuests(dataMod, [g]);
      const p = spellHero({ spells: [g.id], wisdom: 10, mp: 40 });
      const c = soloCombat(p, 'wolf');
      const poolBefore = c.ps.spellWis;
      const mirror = canCastSpell(c, g.id);
      const core = castSpell(c, g.id);
      assert.equal(core.ok, false,
        'гейт stat не-строка: отказ (было бы: плоская броня)');
      assert.equal(core.reason, 'неполные параметры: stat',
        'гейт stat не-строка: причина');
      assert.equal(mirror.ok, false,
        'гейт stat не-строка: зеркало — тот же отказ');
      assert.equal(mirror.reason, core.reason,
        'гейт stat не-строка: одна причина (зеркало 000037)');
      assert.equal(c.ps.spellWis, poolBefore,
        'гейт stat не-строка: пул при отказе не тратится');
      assert.equal(p.mp, 40,
        'гейт stat не-строка: мана при отказе не тратится');
      assert.deepEqual(c.ps.shield, { armor: 0, turns: 0 },
        'гейт stat не-строка: отказ — щит не записан');
    } finally {
      popOcGuests(dataMod, [g]);
    }
  }
  // Legacy БЕЗ ключа «параметры» — гейта нет (фикстура magic_shield).
  {
    const p = spellHero({ spells: ['magic_shield'], wisdom: 10, mp: 40 });
    const c = soloCombat(p, 'wolf');
    const r = castSpell(c, 'magic_shield');
    assert.equal(r.ok, true, 'legacy: каст ok (' + r.reason + ')');
    assert.deepEqual(c.ps.shield, { armor: 2, turns: 3 },
      'legacy: бит-в-бит {armor: 1+степень, 3}');
  }
});

test('000235.11 W-06: guardian_oath — СТАНДАРТНЫЙ путь «баф»: targetId (живой союзник) → t.buff {броня,1,3} (out.buffed = id союзника), без targetId → c.ps.buff (out.buffed «player»); PARTY_BUFF_IDS += stalwart/aura_of_protection — эффект на ВСЮ партию (c.ps.buff + a.buff каждого союзника, out.buffed «party»)', () => {
  const dataMod = loadSpellsData();
  const { castSpell } = loadSpells();
  for (const id of ['guardian_oath', 'stalwart', 'aura_of_protection']) {
    assert.ok(dataMod.SPELLS_BY_ID[id], `W-06: ${id} (RED: нет)`);
  }
  // (a) guardian_oath: союзник-цель — t.buff.
  {
    const p = spellHero({ spells: ['guardian_oath'], wisdom: 10, mp: 40 });
    const c = createCombat({ player: p, mobs: ['wolf'], mobLevel: 2,
      seed: 7, allies: [{ name: 'Вольк', role: 'melee', level: 1,
        dmg: 1.2, hp: 1.1, skills: [], spells: [] }] });
    const a = c.units.find((u) => u.side === 'ally');
    const r = castSpell(c, 'guardian_oath', a.id);
    assert.equal(r.ok, true, 'guardian_oath: каст ok (' + r.reason + ')');
    assert.equal(r.buffed, a.id, 'guardian_oath: out.buffed = id союзника');
    assert.deepEqual(a.buff, { stat: 'броня', value: 1, turns: 3 },
      'guardian_oath: t.buff {броня,1,3}');
    assert.equal(c.ps.buff, null,
      'guardian_oath: c.ps.buff нетронут (цель — союзник, не сам)');
  }
  // (b) guardian_oath: без targetId — c.ps.buff.
  {
    const p = spellHero({ spells: ['guardian_oath'], wisdom: 10, mp: 40 });
    const c = soloCombat(p, 'wolf');
    const r = castSpell(c, 'guardian_oath');
    assert.equal(r.ok, true, 'guardian_oath: каст ok (' + r.reason + ')');
    assert.equal(r.buffed, 'player', 'guardian_oath: out.buffed = player');
    assert.deepEqual(c.ps.buff, { stat: 'броня', value: 1, turns: 3 },
      'guardian_oath: c.ps.buff {броня,1,3}');
  }
  // (c) PARTY_BUFF_IDS += stalwart/aura_of_protection — вся партия.
  for (const [id, stat, value] of [
    ['stalwart', 'получаемый_урон', 0.15],
    ['aura_of_protection', 'броня', 1]]) {
    const p = spellHero({ spells: [id], wisdom: 10, mp: 40 });
    const c = createCombat({ player: p, mobs: ['wolf'], mobLevel: 2,
      seed: 7, allies: [
        { name: 'Союзник0', role: 'melee', level: 1, dmg: 1, hp: 1,
          skills: [], spells: [] },
        { name: 'Союзник1', role: 'melee', level: 1, dmg: 1, hp: 1,
          skills: [], spells: [] },
      ] });
    const r = castSpell(c, id);
    assert.equal(r.ok, true, `${id}: каст ok (${r.reason})`);
    assert.equal(r.buffed, 'party', `${id}: out.buffed = 'party'`);
    const eff = { stat, value, turns: 3 };
    assert.deepEqual(c.ps.buff, eff, `${id}: c.ps.buff`);
    for (const a of c.units.filter((u) => u.side === 'ally')) {
      assert.deepEqual(a.buff, eff, `${id}: союзник ${a.name} — u.buff`);
    }
  }
});

test('000235.11 W-07: контроль/создание/дебаф — stone_grasp/time_slow t.bind {turns:1} (t.debuff НЕТ — «контроль» пишет ТОЛЬКО bind); weaken_defense t.debuff {броня_вниз,0.5,3} / corrode {урон_вниз,0.15,3} (потребители ЕСТЬ); stone_wall — c.walls {cells, turns:5}, клетки в c.obstacles, тик 5→4; guardian_field — СТАНДАРТНАЯ зона c.zone {radius 2, «получаемый_урон»}, союзники u.buff, игрок НЕ в зоне (личная ссылка c.ps.buff нетронута), тик зоны 3→2', () => {
  const dataMod = loadSpellsData();
  const { castSpell } = loadSpells();
  for (const id of ['stone_grasp', 'time_slow', 'weaken_defense',
    'corrode', 'stone_wall', 'guardian_field']) {
    assert.ok(dataMod.SPELLS_BY_ID[id], `W-07: ${id} (RED: нет)`);
  }
  // (a) контроль — t.bind {turns:1}, тик/урона нет.
  for (const [id, mana] of [['stone_grasp', 6], ['time_slow', 12]]) {
    const p = spellHero({ spells: [id], wisdom: 10, mp: 40 });
    const c = soloCombat(p, 'wolf');
    const w = c.units[0];
    const r = castSpell(c, id, w.id);
    assert.equal(r.ok, true, `${id}: каст ok (${r.reason})`);
    assert.equal(r.bound, w.id, `${id}: out.bound`);
    assert.deepEqual(w.bind, { turns: 1 }, `${id}: t.bind {turns:1}`);
    assert.equal(w.debuff, undefined,
      `${id}: t.debuff НЕТ («контроль» пишет только bind)`);
    assert.equal(p.mp, 40 - mana, `${id}: мана −${mana}`);
  }
  // (b) дебаф — t.debuff {stat, value, 3}.
  for (const [id, stat, value, mana] of [
    ['weaken_defense', 'броня_вниз', 0.5, 6],
    ['corrode', 'урон_вниз', 0.15, 11]]) {
    const p = spellHero({ spells: [id], wisdom: 10, mp: 40 });
    const c = soloCombat(p, 'wolf');
    const w = c.units[0];
    const r = castSpell(c, id, w.id);
    assert.equal(r.ok, true, `${id}: каст ok (${r.reason})`);
    assert.equal(r.debuffed, w.id, `${id}: out.debuffed`);
    assert.deepEqual(w.debuff, { stat, value, turns: 3 },
      `${id}: t.debuff {${stat}, ${value}, 3}`);
    assert.equal(p.mp, 40 - mana, `${id}: мана −${mana}`);
  }
  // (c) stone_wall — c.walls + obstacles + тик.
  {
    const p = spellHero({ spells: ['stone_wall'], wisdom: 10, mp: 40 });
    const c = soloCombat(p, 'wolf');
    const w = c.units[0];
    w.x = 0; w.y = 0; // ряд стены (py−2) чист
    c._rng = () => 0.99;
    const r = castSpell(c, 'stone_wall');
    assert.equal(r.ok, true, 'stone_wall: каст ok (' + r.reason + ')');
    assert.equal(c.walls.length, 1, 'stone_wall: c.walls — 1 запись');
    const wl = c.walls[0];
    assert.equal(wl.turns, 5, 'stone_wall: turns 5 (таблица §1.5)');
    assert.ok(Array.isArray(wl.cells) && wl.cells.length > 0,
      'stone_wall: cells — непустой массив');
    assert.equal(r.wall, wl.cells.length,
      'stone_wall: out.wall = cells.length');
    for (const [x, y] of wl.cells) {
      assert.ok(c.obstacles.has(x + ',' + y),
        'stone_wall: клетка (' + x + ',' + y + ') в c.obstacles');
    }
    c.endTurn(); // раунд 2: тик startRound (solo: игрок + волк = 1 слот)
    assert.equal(c.walls[0].turns, 4, 'stone_wall: тик 5 → 4');
  }
  // (d) guardian_field — стандартная зона.
  {
    const p = spellHero({ spells: ['guardian_field'], wisdom: 10, mp: 40 });
    const c = createCombat({ player: p, mobs: ['wolf'], mobLevel: 2,
      seed: 13, allies: [{ name: 'Вольк', role: 'melee', level: 1,
        dmg: 1.2, hp: 1.1, skills: [], spells: [] }] });
    const w = c.units.find((u) => u.side === 'mob');
    w.x = 0; w.y = 0;
    const a = c.units.find((u) => u.side === 'ally');
    const personal = { stat: 'урон', value: 0.10, turns: 3 };
    c.ps.buff = personal;
    c._rng = () => 0.99;
    const r = castSpell(c, 'guardian_field');
    assert.equal(r.ok, true, 'guardian_field: каст ok (' + r.reason + ')');
    assert.deepEqual(c.zone,
      { x: c.px, y: c.py, radius: 2, stat: 'получаемый_урон',
        value: 0.15, turns: 3 },
      'guardian_field: c.zone — стандартная зона (radius 2)');
    assert.equal(r.zone, 2, 'guardian_field: out.zone = radius');
    assert.deepEqual(a.buff,
      { stat: 'получаемый_урон', value: 0.15, turns: 3 },
      'guardian_field: союзник в радиусе — u.buff');
    assert.equal(c.ps.buff, personal,
      'guardian_field: личный баф игрока НЕ ИЗМЕНЁН (та же ссылка — слот зоны не стирает; игрок не в зоне)');
    c.endTurn(); c.endTurn();
    assert.equal(c.zone.turns, 2, 'guardian_field: тик зоны 3 → 2');
  }
});

test('000235.11 W-08: призывы — stone_golem → «Каменный голем» (assets/mobs/000033, shield) level 3 / iron_sentinel → «Костяной колосс» (summon bone_coloss 000015, shield) level 4: level = уровень спелла, summonTurns 4, статы из makeAlly (deepEqual); u.spells [] (HEAL_SUMMON_IDS НЕ расширяется — source-пин)', () => {
  const dataMod = loadSpellsData();
  for (const id of ['stone_golem', 'iron_sentinel']) {
    assert.ok(dataMod.SPELLS_BY_ID[id], `W-08: ${id} (RED: нет)`);
  }
  const { castSpell } = loadSpells();
  function summonCase(spellId, level, name, stats, mana) {
    const p = spellHero({ spells: [spellId], wisdom: 11, mp: 40 });
    const c = soloCombat(p, 'wolf');
    const r = castSpell(c, spellId);
    assert.equal(r.ok, true, `${spellId}: каст призыва ok (${r.reason})`);
    assert.ok(r.summoned, `${spellId}: r.summoned`);
    const a = c.units.find((u) => u.id === r.summoned);
    assert.ok(a, `${spellId}: призванный в c.units`);
    assert.equal(a.kind, 'summon', `${spellId}: kind summon`);
    assert.equal(a.summonTurns, 4, `${spellId}: summonTurns 4`);
    assert.equal(a.level, level, `${spellId}: level = уровень спелла`);
    assert.deepEqual(
      { name: a.name, role: a.role, maxHP: a.maxHP, damage: a.damage,
        armor: a.armor, mp: a.mp },
      { name, role: 'shield', ...stats },
      `${spellId}: имя/роль/статы из MOB_TYPES (makeAlly level ${level})`);
    assert.deepEqual(a.spells, [],
      `${spellId}: u.spells [] (HEAL_SUMMON_IDS не расширен)`);
    assert.equal(p.mp, 40 - mana, `${spellId}: мана −${mana}`);
  }
  // makeAlly: maxHP = round((8+4L)·hp·1.8 (shield)); damage =
  // round((2+0.7L)·dmg); armor = mob.armor + floor(L/10); mp = 5+Int.
  // stone_golem (000033: hp 2.5, dmg 1.2, armor 2, int 1) L3;
  // bone_coloss (000015: hp 2.5, dmg 1.3, armor 2, int 1) L4.
  summonCase('stone_golem', 3, 'Каменный голем',
    { maxHP: 90, damage: 5, armor: 2, mp: 6 }, 14);
  summonCase('iron_sentinel', 4, 'Костяной колосс',
    { maxHP: 108, damage: 6, armor: 2, mp: 6 }, 20);
  // Source-пин: HEAL_SUMMON_IDS НЕ расширяется (големы без книг хила
  // — ТЗ их не обещает).
  const spellsSrc = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'spells.js'), 'utf8');
  assert.ok(spellsSrc.includes(
    "new Set(['light_sprite', 'spirit_healer'])"),
    'HEAL_SUMMON_IDS — без призывов .11 (RED: расширен)');
});

// Задача 000240: flame_step × free_cast (000230.17) — пин (tests-only,
// src бит-в-бит). Ретро 000235.07 finding #3: собственная дублирующая
// free-проверка ветки flame_step (src/spells.js :844/:863) вручную
// резолвлена в конфликте ребейза 000235.07 без пина. Реальный каталог
// не содержит free_cast-предмета с flame_step (6 free_cast-предметов —
// все боевые) → фикстура-кольцо через Game.ITEMS в vm ДО load items.js
// (паттерн FC1–FC8, tests/spellbook-oc-freecast.test.js). flame_step —
// КАТАЛОЖНЫЙ спелл (реальный spells-data.js в цепи), гость-инъекция
// не нужна. Контракт: memory/000240-flame-step-freecast-pin.md.
// Аппенд в EOF — EOF-паттерн файла (.07/.08/.09 дописаны по порядку
// мержей); vm-хелперы не входят в чужой plain-node-блок W-10a.
function loadVm240(fixtures) {
  const chain = ['global-settings.js', 'perlin.js', 'map.js',
    'skills-data.js', 'sheet.js', 'player.js', 'items.js', 'combat.js',
    'spells-data.js', 'spells.js'];
  const errors = [];
  const sandbox = { console: { log() {}, warn() {},
    error: (m) => errors.push(String(m)) } };
  vm.createContext(sandbox);
  for (const f of chain) {
    if (f === 'items.js' && Array.isArray(fixtures)) sandbox.Game.ITEMS = fixtures;
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8'),
      sandbox, { filename: f });
  }
  return { Game: sandbox.Game, errors };
}

// Фикстура-предмет: форма ПОБайТОВО как fcRing (FC1–FC8) — проходит
// validateItem (items.js) при load в vm.
function fcRing240(id, spell) {
  return { id, name: 'Тестовое кольцо', kind: 'ring', slot: 'ring',
    weight: 0.1, value: 30, desc: 'т',
    affixes: [{ type: 'free_cast', spell }] };
}

function hero240(G, { mp, equipment }) {
  const p = G.createCharacter();
  p.spells = ['flame_step'];
  p.mp = mp;
  if (equipment) p.equipment = equipment;
  return p;
}

test('000240 W-10a (vm): flame_step × free_cast — hero с кольцом free_cast «flame_step», mp 2 < 7: каст УДАЁТСЯ (ok:true, expiresDay null), mp НЕ изменилась (2), cb ровно 1 раз, записей нет — пин :844/:863 ветки flame_step (ретро 000235.07 finding #3)', () => {
  const { Game: G, errors } = loadVm240([fcRing240('x240_fs', 'flame_step')]);
  assert.deepEqual(errors, [], 'load-clean: 0 console.error');
  let calls = 0;
  const p = hero240(G, { mp: 2, equipment: { ring_left_1: 'x240_fs' } });
  const r = G.Spells.castOutOfCombat(p, 'flame_step', 10, {
    flameStep: () => { calls += 1; return { ok: true }; },
  });
  assert.equal(r.ok, true,
    'free_cast — каст удаётся при mp 2 < 7: ' + JSON.stringify(r));
  assert.equal(r.expiresDay, null, 'телепорт — expiresDay null');
  assert.equal(p.mp, 2, 'ПИН: mp НЕ изменилась (free) — не 2−7=−5');
  assert.equal(calls, 1, 'телепорт (cb) выполнен ровно 1 раз');
  assert.equal(p.outOfCombatEffects, undefined, 'записей нет (телепорт)');
});

test('000240 W-10a (vm): flame_step × free_cast — контроль: free-проверка не «всегда true» и не «любые affixes»: кольцо free_cast «mend», mp 2 → «не хватает маны» ДО cb (calls 0, mp 2, записей нет); mp 30 → mp 23 (paid); без экипировки, mp 2 → отказ; кольцо «flame_step», mp 30 → mp 30 (НЕ 23) — якорь :863 в высоком mp-регионе', () => {
  const { Game: G, errors } = loadVm240(
    [fcRing240('x240_mend', 'mend'), fcRing240('x240_fs', 'flame_step')]);
  assert.deepEqual(errors, [], 'load-clean: 0 console.error');
  {
    let calls = 0;
    const p = hero240(G, { mp: 2, equipment: { ring_left_1: 'x240_mend' } });
    const r = G.Spells.castOutOfCombat(p, 'flame_step', 10, {
      flameStep: () => { calls += 1; return { ok: true }; },
    });
    assert.equal(r.ok, false,
      'аффикс не на flame_step → платный путь → отказ (не «всегда true»)');
    assert.equal(r.reason, 'не хватает маны', 'reason побайто');
    assert.equal(calls, 0, 'cb НЕ вызван (проверка маны первая)');
    assert.equal(p.mp, 2, 'mp без изменений');
    assert.equal(p.outOfCombatEffects, undefined, 'записей нет');
  }
  {
    let calls = 0;
    const p = hero240(G, { mp: 30, equipment: { ring_left_1: 'x240_mend' } });
    const r = G.Spells.castOutOfCombat(p, 'flame_step', 10, {
      flameStep: () => { calls += 1; return { ok: true }; },
    });
    assert.equal(r.ok, true, 'paid — каст удаётся');
    assert.equal(p.mp, 23, 'мана списана (30 − 7) — экипировка ≠ «free всё»');
    assert.equal(calls, 1, 'cb вызван');
  }
  {
    let calls = 0;
    const p = hero240(G, { mp: 2 });
    const r = G.Spells.castOutOfCombat(p, 'flame_step', 10, {
      flameStep: () => { calls += 1; return { ok: true }; },
    });
    assert.equal(r.ok, false, 'без экипировки, mp 2 < 7 — отказ');
    assert.equal(r.reason, 'не хватает маны', 'reason побайто');
    assert.equal(calls, 0, 'cb НЕ вызван');
    assert.equal(p.mp, 2, 'mp без изменений');
  }
  {
    let calls = 0;
    const p = hero240(G, { mp: 30, equipment: { ring_left_1: 'x240_fs' } });
    const r = G.Spells.castOutOfCombat(p, 'flame_step', 10, {
      flameStep: () => { calls += 1; return { ok: true }; },
    });
    assert.equal(r.ok, true, 'free + высокое mp — каст удаётся');
    assert.equal(p.mp, 30, 'ПИН: mp 30 (НЕ 23) — якорь :863 (high mp)');
  }
});

// =====================================================================
// Задача 000267: потребители NO-OP-статов — КРАСНЫЕ тесты (TDD)
// (находка C1 ретро-анализа RETRO-20261024; ТЗ tasks/pending/000267.md;
// контракт memory/000267-noop-stat-consumers.md).
//
// Файл: drain-самохил. Case «урон» (src/spells.js) НЕ читает
// параметры.value и НЕ лечит кастера: обещание drain_life (000069) /
// soul_drain (000072) — «половина нанесённого урона — кастеру» —
// без потребителя. Краснота осмысленная: урон наносится бит-в-бит
// (формула каталога), мана списывается, но hp кастера не меняется —
// лечение проверяется НОЖНИЦАМИ (hp-дельта), а не out.healed
// (out.healed у drain появляется только на GREEN — контракт §2 S6).
// Контроль (umbra_bolt, параметров.value НЕТ) — гварда: урон тот же,
// лечения нет, out.healed отсутствует (обе стадии).
//
// Закреплённый контракт (RED):
//   * 000267-DRN-1 — «урон» + параметры.value: кастер лечится на
//     round(value × факт) (0.5 × dmg); dmg бит-в-бит по формуле
//     (9.5 × 1.15 = 11; 9.5 × 1.3 = 12; umbra_bolt 9.5 = 10).
//
// expectedRedCount (файл) = 1.
// =====================================================================

test('000267-DRN-1: drain-самохил — case «урон» + параметры.value (красный, 000267)', () => {
  const { castSpell } = loadSpells();
  for (const [id, expDmg, mana] of [
    ['drain_life', 11, 6],
    ['soul_drain', 12, 20],
  ]) {
    const p = spellHero({ spells: [id], intelligence: 11, mp: 40 });
    // maxHP 70 (тело 10) — запас, чтобы хил не упёрся в кап.
    p.primary.constitution = 10;
    p.hp = 40;
    const c = soloCombat(p, 'wolf');
    const w = c.units[0];
    const hp0 = p.hp;
    const mp0 = p.mp;
    const r = castSpell(c, id, w.id);
    assert.equal(r.ok, true, id + ': каст — ok');
    assert.equal(r.dmg, expDmg,
      id + ': dmg бит-в-бит (round(9.5 × '
      + (expDmg === 11 ? '1.15' : '1.3') + ') = ' + expDmg + ')');
    assert.equal(p.mp, mp0 - mana, id + ': мана списана');
    assert.equal(p.hp - hp0, Math.round(0.5 * r.dmg),
      id + ': RED — кастер лечится на round(0.5 × ' + r.dmg
      + ') = ' + Math.round(0.5 * r.dmg));
  }
  const p = spellHero({ spells: ['umbra_bolt'], intelligence: 11, mp: 40 });
  p.primary.constitution = 10;
  p.hp = 40;
  const c = soloCombat(p, 'wolf');
  const hp0 = p.hp;
  const r = castSpell(c, 'umbra_bolt', c.units[0].id);
  assert.equal(r.ok, true, 'umbra_bolt: каст — ok');
  assert.equal(r.dmg, 10, 'umbra_bolt: dmg 10 (бит-в-бит)');
  assert.equal(p.hp, hp0,
    'контроль: параметров.value НЕТ — лечения нет (обе стадии)');
  assert.equal(r.healed, undefined,
    'контроль: out.healed отсутствует (обе стадии)');
});

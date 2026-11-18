// Задача 000320.41: «Наставник-акробат» — id acro_instructor, имя «Кувырок»
// (Школа акробатов, 2-й NPC постройки; 41-я из 100 дочерних 000320).
//
// Контракт (ТЗ tasks/pending/000320.41.md; механизм мульти-NPC —
// 000320.01, spec/npc.md «Несколько NPC на постройку»,
// memory/000320-npcs-batch.md; профиль-эталон «обучение» —
// диск 000056 «Кречет» (.35) и легаси 000008 «Фикка» — prives/подсказка,
// train/обучение, hint_*/подсказка+{харизма:3} последней; свою память
// несёт memory/000320-acro_instructor.md):
//   * assets/npc/000062.json — id acro_instructor (репо-свип: единственный
//     хит — путь memory-файла в самой карточке; паттерн id по постройке —
//     прецедент archery_instructor .35), имя «Кувырок» — выбор агента:
//     свип 0 хитов по всему репо ДО записи; роль-слово ТЗ «наставник»
//     именем не стало — правило ландромина .22; роль РОВНО «наставник»
//     (фикс ТЗ; свипов уникальности ролей нет — тесты фильтруют по id;
//     дубли ролей легальны — Кречет/Намёт), постройка
//     assets/buildings/academy.json (id 11; ТЗ-путь 000011.json
//     мёртв с 000318.06 — zero-sweep
//     tests/buildings-rename-000318.06.test.js T5; путь — SLUG), 2-й
//     NPC Школы акробатов (на диске ОДИН: Фикка 000008 acro_master —
//     мы ВТОРОЙ, Фикка остаётся ПЕРВОЙ по номеру файла); хук
//     истории «Учит акробатике на площадках» — последнее
//     предложение описания (endsWith от ПОЛНОЙ строки хука с точкой,
//     конвенция .02–.40);
//   * РЕ-ПИНЫ РОСТА РОСТЕРА ЭТОЙ ВОЛНОЙ НЕ ТРЕБУЮТСЯ (главная эррата
//     брифа «СЕМВЕРО→ВОСМЕРО в .37–.40» для ЭТОЙ карточки ложна):
//     все носители СЕМВЕРО пинуют ростер ДОМА 10 (Стрельбище), а .41
//     идёт в ДОМ 11 (Школа акробатов), который ни один тест до нас
//     не пинул (живой grep npcsForBuilding(NPCS, 11) = 0 хитов на базе)
//     ⇒ чужие файлы по ростерам 0-diff; свои T7/T8 пинят дом 11 ВПЕРВЫЕ;
//   * счётчик каталога НЕ ре-пинится — держатели живут ls-предикатами
//     миграции 000387.01/000397/000410/000423: чистое добавление
//     000062.json + sync зеленят сиблинговые T1 без ручной правки;
//     tests/npc-refs.test.js — 0-diff (ls-пола односторонний рэтчет);
//   * профиль диалога — «обучение» (фикс ТЗ; ЭРРАТА ТЗ «навыки: [acro]»
//     — контракт «школы» tests/npc-data.test.js (000211.07) требует
//     sorted(тренирует-id) ≡ навыки для КАЖДОГО NPC школы_навыков без
//     ролевого/профильного фильтра; Школа акробатов тренирует
//     [acro, step] ⇒ навыки РОВНО [acro, step]; блок обучения у
//     наставника-профиля органичен train-опцией — эталон 000056/000008):
//     РОВНО 3 опции [prives/подсказка, train/обучение, hint_fall/
//     подсказка+{харизма:3} на ПОСЛЕДНЕЙ], «для» РОВНО 0 (контракт A8a);
//     торговли/найма/квестов нет (mob-группы 0..6 исчерпаны .38);
//     цены 25/40 — вторая ступень лестницы дома 11 (Фикка 20/35;
//     равенств цен по постройке контракты не пинуют, различие пар
//     ростера пиним живым чтением в T6; 25/40 занята Кречетом дома 10
//     и Карком дома 1 — междома легально);
//   * SRC-1 к нам НЕ применяется (прецедент .35–.40: acro/step вне
//     SKILL_CRAFT_TYPE, дом 11 вне зданий рецептов — canMentorCraft
//     data-driven, ролей НЕ знает) ⇒ витрина НЕ предписана кодом,
//     торговли по ТЗ нет — совпадение;
//   * порядок ключей JSON — [id, имя, роль, описание, постройки,
//     диалог, обучение] (побайтовый эталон диска 000052.json);
//   * тема диалога — падения/опора/высота/помост; запрет-лист текстов —
//     АГРЕГАТ РЕЕСТРА forbid-цепи (prev = ledger, 000424): базис (guard
//     .22) + звенья 23..41; со звеном "41" агрегат = 75 + 4×19 = 151
//     (ФОРМУЛОЙ в T9, литерал числа запрещён). Инлайн-массив T5 этого
//     файла — провенанс-якорь зубов 000424 T4/T5 (extractGuard ищет
//     литеральную форму цикла после якоря заголовка T5): он
//     СГЕНЕРИРОВАН дампом aggregate(реестра) и закреплён ЖИВЫМ
//     deepEqual с JSON ниже — ручная транскрипция запрещена,
//     расхождение красное. СВОИ 4 оборота (резерв звена "42") в
//     guard-массив НЕ внесены (правило 000424), пинятся циклом
//     присутствия; их пишет реестру следующее звено на своём мерже;
//   * [E]-оверлей Школы акробатов — ДВЕ dialog-строки (Фикка первой по
//     номеру файла, суффикс «:<id>» со второй — механизм
//     building-effects); эффектов у дома 11 нет; крафт-строки НЕТ
//     (11 ∉ зданий рецептов); хоткеи Digit1..2 — граница
//     /^Digit([1-9])$/ не превышена.
//
// ЗУБ forbid-цепи под реестром (000424 вместо 000372-пар): T9 сверяет
// звено "41" ≡ MINE-константе диска .40 (машинно), инлайн-гард ≡
// aggregate(реестра), длину — ФОРМУЛОЙ базис + 4×звенья (литерал
// числа запрещён), prev ⊆ own + анти-вакуум (инжект каждой prev-фразы
// ловится; вырез элемента guard-копии красит предикат) + свип своих
// оборотов substring-в-обе-стороны против всей цепи и каталога.
//
// ПЕРЕРЕЗКА ХВОСТА .40 (ВЫНУЖДЕННАЯ диском, рецепт
// memory/000320-range_dummy.md): после вписания звена "41" файл .40 не
// хвост — его T5/T9 перерезаны на живой префикс-инвариант SELF_LINK=40
// (aggregateThrough через 40, prev через 39, deepEqual(links['41'],
// MINE) — резерв погашен, «в СВОЁМ гарде своих нет»); guard-литералы и
// MINE .40 побайтово 0-diff (пин 000424 T4); полный агрегат сторожит
// хвостовой зуб 000424 T5.
//
// КРАСНЫЕ (TDD): T1..T8 красные до зелёной стадии (000062.json нет,
// ростер Школы — ОДИН, оверлей 1 строка), T9 красный до аппенда
// звена "41" в реестр (цепь под ledger читается из JSON), без краха
// загрузки. На RED-этапе легитимно краснеют и зубы 000424 T3/T5
// (хвост цепи уже 41, ключа "41" ещё нет) — целевое состояние ДО
// аппенда, не порча legacy.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validateData } = require('./json-schema.js');

const ROOT = path.join(__dirname, '..');
const NDIR = path.join(ROOT, 'assets', 'npc');
const NEW = path.join(NDIR, '000062.json');
const SCHEMA = JSON.parse(
  fs.readFileSync(path.join(NDIR, 'schema.json'), 'utf8'));

const N = require('../src/npc.js');
const { NPCS } = require('../src/npc-data.js');
const BE = require('../src/building-effects.js');
const C = require('../src/craft.js');

const LEDGER_PATH = path.join(__dirname, 'scripts', 'npc-forbidden-ledger.json');

const HOOK = 'Учит акробатике на площадках';
const ID = 'acro_instructor';
const NAME = 'Кувырок';

const MINE = ['паденья не считают, считают подъёмы',
  'высота берёт ровных, а не смелых',
  'опора любит тихие ноги',
  'суета на помосте дороже ошибки'];

function listNpcFiles() {
  return fs.readdirSync(NDIR)
    .filter((f) => /^\d{6}\.json$/.test(f))
    .sort();
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function readLedger() {
  assert.ok(fs.existsSync(LEDGER_PATH),
    'реестр forbid-цепи (000424) должен существовать на диске: '
    + 'tests/scripts/npc-forbidden-ledger.json');
  return JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'));
}

const linkKeysOf = (links) => Object.keys(links).map(Number).sort((a, b) => a - b);

function aggregateThrough(ledger, upto) {
  const out = [...ledger.basis];
  for (const k of linkKeysOf(ledger.links)) {
    if (k <= upto) out.push(...ledger.links[String(k)]);
  }
  return out;
}

const aggregateAll = (ledger) => aggregateThrough(ledger, Number.MAX_SAFE_INTEGER);

const SELF_LINK = 41;

function extractGuardAt(file, marker) {
  const src = fs.readFileSync(file, 'utf8');
  const at = src.indexOf("test('" + marker);
  assert.ok(at >= 0,
    path.basename(file) + ': якорь T5 «' + marker + '» не найден — '
    + 'провенанс-сверка опирается на него (ERR_ASSERTION, не крах)');
  const m = src.slice(at).match(/for \(const w of \[([\s\S]*?)\]\)/);
  assert.ok(m, path.basename(file) + ': guard-массив не найден после якоря T5');
  return [...m[1].matchAll(/'([^']*)'/g)].map((x) => x[1]);
}

function extractMineFrom(file) {
  const src = fs.readFileSync(file, 'utf8');
  const m = src.match(/const MINE = \[([\s\S]*?)\];/);
  assert.ok(m, 'MINE-константа не найдена в ' + path.basename(file));
  return [...m[1].matchAll(/'([^']*)'/g)].map((x) => x[1]);
}

const forbidHits = (texts, list) => {
  const joined = texts.join(' ');
  return list.filter((w) => joined.includes(w));
};

// --- T1: ls-предикат каталога + зеркало -------------------------------------

test('000320.41 T1: каталог — ls-предикат: 000001..N подряд (N = счётчик диска); зеркало NPCS ≡ каталогу с acro_instructor', () => {
  const files = listNpcFiles();
  assert.ok(files.length >= 62,
    'в каталоге NPC не менее 62 файлов (000320.38: +Хожалый; 000320.39: '
    + '+Глухарь; 000320.40: +Пугало; 000320.41: +Кувырок), факт: '
    + files.length);
  for (let i = 0; i < files.length; i++) {
    assert.equal(files[i],
      String(i + 1).padStart(6, '0') + '.json',
      'нумерация подряд без пропусков: индекс ' + i);
  }
  assert.equal(NPCS.length, files.length,
    'зеркало src/npc-data.js ≡ каталогу (sync не прогнан?), факт: '
    + NPCS.length);
  const last = NPCS[61];
  assert.ok(last, '62-я запись зеркала существует');
  assert.equal(last.id, ID,
    '62-я запись зеркала — acro_instructor (порядок = нумерация файлов)');
  assert.equal(NPCS[60].id, 'range_dummy',
    'guard: 61-я запись — Пугало (позиционные NPCS[..] не сдвинуты)');
  assert.equal(NPCS[59].id, 'hunter',
    'guard: 60-я запись — Глухарь (позиционные NPCS[..] не сдвинуты)');
});

// --- T2: 000062.json валиден по схеме + порядок ключей + roundtrip ---------

test('000320.41 T2: assets/npc/000062.json валиден по schema; ключи в порядке эталона диска 000052.json (id, имя, роль, описание, постройки, диалог, обучение — без квестов/найм/торговля); roundtrip-канон; негативы — мимо схемы и мимо порядка ключей', () => {
  assert.ok(fs.existsSync(NEW),
    'RED: assets/npc/000062.json отсутствует (NPC задачи ещё не создан)');
  const data = readJson(NEW);
  assert.deepEqual(validateData(SCHEMA, data, 'npc/000062'), [],
    '000062.json обязан проходить assets/npc/schema.json');
  const KEYS = ['id', 'имя', 'роль', 'описание', 'постройки', 'диалог',
    'обучение'];
  assert.deepEqual(Object.keys(data), KEYS,
    'порядок ключей — побайтовый эталон диска 000052.json: '
    + '«обучение» — профильный блок наставника-эталона 000056 и '
    + 'обязанность контракта 000211.07 «школы» (sorted(тренирует-id) ≡ '
    + 'навыки для КАЖДОГО NPC школы_навыков без ролевого/профильного '
    + 'фильтра; ЭРРАТА ТЗ «навыки: [acro]» — диск требует [acro, step]: '
    + 'Школа акробатов тренирует оба); блоков квесты/найм/торговля нет');
  const raw = fs.readFileSync(NEW, 'utf8');
  assert.equal(raw, JSON.stringify(data, null, 2) + '\n',
    '000062.json — roundtrip JSON.stringify(obj,null,2)+перевод строки');
  const extraKey = JSON.parse(JSON.stringify(data));
  extraKey.цена = 10;
  assert.notDeepEqual(validateData(SCHEMA, extraKey, 'npc/extra'), [],
    'посторонний ключ «цена» — additionalProperties false, обязан отваливаться');
  const badCharisma = JSON.parse(JSON.stringify(data));
  const reqOpt = badCharisma.диалог.find((o) => o.требования);
  assert.ok(reqOpt, 'есть опция с требованиями (харизма-прецедент батча)');
  reqOpt.требования.харизма = 0;
  assert.notDeepEqual(validateData(SCHEMA, badCharisma, 'npc/badcharisma'), [],
    'требование харизма 0 — вне схемы (minimum 1)');
  const badAction = JSON.parse(JSON.stringify(data));
  badAction.диалог[0].действие = 'дар';
  assert.notDeepEqual(validateData(SCHEMA, badAction, 'npc/badaction'), [],
    'действие «дар» — вне enum схемы');
  const badPath = JSON.parse(JSON.stringify(data));
  badPath.постройки = ['000011.json'];
  assert.notDeepEqual(validateData(SCHEMA, badPath, 'npc/badpath'), [],
    'постройки без пути assets/buildings/ (numeric-форма) — вне паттерна схемы');
  const numericPath = JSON.parse(JSON.stringify(data));
  numericPath.постройки = ['assets/buildings/' + '000011' + '.json'];
  assert.notDeepEqual(validateData(SCHEMA, numericPath, 'npc/numericpath'), [],
    'numeric-путь постройки — вне паттерна схемы: база содержит 000318.06, '
    + 'здания — slug-именование, numeric-форма мертва (zero-sweep '
    + 'tests/buildings-rename-000318.06.test.js T5); ТЗ-путь '
    + '000011.json устарел — живая ссылка '
    + 'assets/buildings/academy.json');
  const badPrice = JSON.parse(JSON.stringify(data));
  badPrice.обучение.цена_за_уровень = 0;
  assert.notDeepEqual(validateData(SCHEMA, badPrice, 'npc/badprice'), [],
    'цена_за_уровень 0 — вне схемы (minimum 1, максимум 10000)');
  const badSkill = JSON.parse(JSON.stringify(data));
  badSkill.обучение.навыки = ['Акробатика'];
  assert.notDeepEqual(validateData(SCHEMA, badSkill, 'npc/badskill'), [],
    'навык «Акробатика» — вне паттерна id ^[a-z][a-z0-9_]*$');
  const withTrade = JSON.parse(JSON.stringify(data));
  withTrade.торговля = { предметы: [] };
  assert.notDeepEqual(Object.keys(withTrade), KEYS,
    'лишний блок «торговля» — вне эталона ключей: торговая цепь не '
    + 'трогается, профиль «обучение» держится СЛОВОМ ТЗ');
  const withHire = JSON.parse(JSON.stringify(data));
  withHire.найм = [];
  assert.notDeepEqual(Object.keys(withHire), KEYS,
    'лишний блок «найм» — вне эталона ключей 000052: найма нет');
  const withQuests = JSON.parse(JSON.stringify(data));
  withQuests.квесты = [];
  assert.notDeepEqual(Object.keys(withQuests), KEYS,
    'лишний блок «квесты» — вне эталона ключей: квестов НЕ заводим '
    + '(mob-группы 0..6 исчерпаны .38; повторный выбор группы легитимно '
    + 'красил бы present-tense assert-тексты .27/.28, расширение '
    + 'каталога групп — вне скоупа)');
});

// --- T3: id и имя уникальны (sweep) ----------------------------------------

test('000320.41 T3: id acro_instructor и имя «Кувырок» уникальны в sweep каталога', () => {
  assert.ok(fs.existsSync(NEW), 'RED: assets/npc/000062.json отсутствует');
  const ids = new Set();
  const names = new Set();
  for (const f of listNpcFiles()) {
    const d = readJson(path.join(NDIR, f));
    assert.ok(!ids.has(d.id), 'дубликат id «' + d.id + '» (файл ' + f + ')');
    assert.ok(!names.has(d.имя), 'дубликат имени «' + d.имя + '» (файл ' + f + ')');
    ids.add(d.id);
    names.add(d.имя);
  }
  assert.ok(ids.has(ID), 'id acro_instructor в каталоге');
  assert.ok(names.has(NAME), 'имя «Кувырок» в каталоге');
});

// --- T4: роль-фикс, описание с хуком и уникально ----------------------------

test('000320.41 T4: роль РОВНО «наставник» (точная строка ТЗ + сводная таблица; свипов уникальности ролей нет — дубль роли с Кречетом 000056 и Намётом 000057 легален, фильтры идут по id; роль-слово ТЗ «наставник» именем не стало, правило ландромина .22: имя «Кувырок» — выбор агента, свип 0 хитов); описание непустое, хук «Учит акробатике на площадках» — последнее предложение, и НЕ копия описания другого NPC', () => {
  assert.ok(fs.existsSync(NEW), 'RED: assets/npc/000062.json отсутствует');
  const data = readJson(NEW);
  assert.ok(typeof data.описание === 'string' && data.описание.trim() !== '',
    'описание непустое');
  assert.equal(data.роль, 'наставник',
    'роль — фикс-строка «наставник» (ТЗ; Т4 пишет точное равенство, '
    + 'свипов уникальности ролей нет — дубль с Кречетом/Намётом легален)');
  assert.ok(data.описание.includes(HOOK),
    'хук истории «' + HOOK + '» (ТЗ) в описании дословно');
  assert.ok(data.описание.endsWith(HOOK + '.'),
    'хук — ПОСЛЕДНЕЕ предложение описания (с заглавной, с точкой на '
    + 'конце — прецеденты .02–.40; endsWith идёт от ПОЛНОЙ строки '
    + 'хука, конвенция .22–.40; точка в конце — часть формы хука); факт: '
    + JSON.stringify(data.описание.slice(-90)));
  for (const f of listNpcFiles()) {
    if (f === '000062.json') continue;
    const d = readJson(path.join(NDIR, f));
    assert.notEqual(d.описание, data.описание,
      'описание совпадает с ' + f + ' (не копия существующего)');
  }
});

// --- T5: диалог — профиль «обучение», «для»=0, запрет-лист из реестра ------

test('000320.41 T5: диалог валиден по схеме, РОВНО 3 опции профиля «обучение» эталона диска 000056/000008 (prives/подсказка, train/обучение, hint_fall/подсказка — train РОВНО ОДИН на второй позиции), ДЕЙСТВИЙ торговля/квесты/найм РОВНО 0, РОВНО одна опция с {харизма:3} на ПОСЛЕДНЕЙ, id опций уникальны, опций с «для» — ровно 0, запрет-лист — АГРЕГАТ РЕЕСТРА forbid-цепи (prev = ledger, 000424; инлайн-гард ниже — машинный дамп реестра, провенанс-якорь зубов 000424 T4/T5) по ТЕКСТАМ диалога и описания, СВОИ 4 оборота присутствуют и в гард НЕ внесены (резерв звена "42")', () => {
  assert.ok(fs.existsSync(NEW), 'RED: assets/npc/000062.json отсутствует');
  const data = readJson(NEW);
  assert.ok(Array.isArray(data.диалог) && data.диалог.length >= 1,
    'диалог непустой (schema minItems 1)');
  assert.equal(data.диалог.length, 3,
    'диалог — ровно 3 опции (prives / train / hint_fall — форма '
    + 'эталона «обучение» диска 000056 Кречет и легаси 000008 Фикка), '
    + 'факт: ' + data.диалог.length);
  const ACTIONS = SCHEMA.properties.диалог.items.properties.действие.enum;
  for (const o of data.диалог) {
    assert.ok(ACTIONS.includes(o.действие),
      'действие «' + o.действие + '» вне enum схемы');
    const errs = validateData(SCHEMA.properties.диалог.items, o, 'диалог');
    assert.deepEqual(errs, [],
      'опция «' + o.id + '» — вне схемы диалога: ' + JSON.stringify(errs));
  }
  assert.deepEqual(data.диалог.map((o) => o.id),
    ['prives', 'train', 'hint_fall'],
    'id опций — причесон профиля «обучение» 000056/000008: '
    + 'prives первым, train вторым, hint_* следом');
  assert.deepEqual(data.диалог.map((o) => o.действие),
    ['подсказка', 'обучение', 'подсказка'],
    'РОВНО одна train-опция действием «обучение» на второй позиции — '
    + 'фикс-профиль ТЗ (эталон 000056: prives/подсказка, train/обучение, '
    + 'hint/подсказка; 000008 Фикка той же формой); обучение ПРОФИЛЬНОЕ '
    + '— в отличие от инертного «подсказка»-блока .40 (решение .27 тут '
    + 'НЕ применимо: ТЗ фиксирует профиль «обучение»)');
  assert.equal(data.диалог.filter((o) => o.действие === 'обучение').length, 1,
    'ДЕЯСТВИЙ «обучение» ровно одно (train-вкладка UI открывается '
    + 'действием — src/ui.js; эталон 000056/000008)');
  for (const act of ['торговля', 'квесты', 'найм']) {
    assert.equal(data.диалог.filter((o) => o.действие === act).length, 0,
      'ДЕЯСТВИЙ «' + act + '» в диалоге ровно 0 — профиль «обучение» '
      + '(фикс ТЗ); торговли нет и данными: торговая цепь 0-diff');
  }
  const ids = data.диалог.map((o) => o.id);
  assert.equal(new Set(ids).size, ids.length, 'id опций диалога уникальны');
  assert.equal(data.диалог.filter((o) => o.для !== undefined).length, 0,
    'опций с «для» — ровно 0: наставник говорит со всеми; добавление '
    + '«для» требует ре-пина A8a (tests/npc-dialog-scope) и запрещено');
  const withReq = data.диалог.filter((o) => o.требования !== undefined);
  assert.equal(withReq.length, 1,
    'ровно одна опция с требованиями (прецедент всей цепи .17–.40: '
    + 'харизма-хит последней опции)');
  assert.deepEqual(withReq[0].требования, { харизма: 3 },
    'требование опции — {харизма: 3} (харизма-прецедент батча, НЕ «проверка»)');
  assert.equal(data.диалог.indexOf(withReq[0]), 2,
    'опция с требованием — ПОСЛЕДНЯЯ (конвенция цепи .17–.40: hint_* '
    + 'харизма-хитом последней)');
  const texts = [data.описание, ...data.диалог.map((o) => o.текст)]
    .join(' ');
  for (const w of [
    'хвостовик', 'наковальн', 'штампов', 'коллекци',
    'позолот', 'старые походы', 'арен', 'жалован',
    'знамен', 'задаток', 'табель', 'метл',
    'стена клинков', 'звон', 'дребезг', 'нагрудник',
    'закалк', 'трещин', 'молотк', 'примеря',
    'старые дела', 'храме солнца', 'старейшин', 'посмееш',
    'на весах', 'сонной мяты', 'клонит в сон', 'завянет',
    'пучками', 'почерневш', 'разотрёшь', 'где болит',
    'выше раны', 'доживают до старости', 'не бывает лишнего', 'с далёких гор',
    'договоримся о цене', 'между строк', 'при дневном свете', 'чернила помнят',
    'прощает торопливому', 'из-под пальцев', 'выберем тебе школу', 'описк',
    'чистовик', 'по концу листа', 'копию без торгу', 'вкривь',
    'кормит', 'от кузницы до кузницы', 'не пожалеешь', 'пока повозка полная',
    'на дневку', 'сколько сгрузил', 'ближе к холке', 'сырьё кончается',
    'спрашивай про руду', 'то в моих вьюках', 'ищи меня', 'до площади раньше колокола',
    'понюхай сначала', 'каменная соль', 'в самом конце', 'три металла на прилавке',
    'три монеты в коше', 'два языка служат', 'монету берут на глаз', 'вода по колено',
    'кривой указатель', 'указатель врёт', 'дорога — мой хлеб', 'с солнечной полки',
    'у этой залы слух длинный', 'гора лишних слов не держит', 'про спуск', 'мой дом там, где ночевал',
    'вьюки легче всякого сундука', 'базара без дорог не бывает', 'новости ногами приходят', 'обоз — это стена, которая ходит',
    'груз считается привезённым, только когда он на площади', 'дорогу берегут до разбоя, а не после', 'караван держат не узлы, а порядок', 'товар помнит того, кто его привёз',
    'полог не прячет брака', 'старые весы не льстят', 'у старого угла всегда длиннее очередь', 'рука помнит дольше головы',
    'сильный удар не бывает первым', 'пот на лбу дешевле крови на песке', 'урока без пота не бывает', 'кулак не прощает суеты',
    'бьёт не рука, а весь человек', 'сначала держи, потом давай', 'двор помнит каждого, кто встал в круг', 'зрители забывают даже имя',
    'проигравших не забывают', 'вызов принимают, а не ждут', 'титул тяжелее пояса', 'перевяжут до боя',
    'к поединку готовят, а не к славе', 'первый вызов не торгуют', 'стойкость покупают не деньгами', 'считают круги, а не обещания',
    'правило одно на всех', 'черта важнее крика', 'позор сходить с круга', 'считают не удары, а вмятины',
    'дерево не спорит, дерево запоминает', 'бьют не со зла — на память', 'терпение измеряют не секундами, а ударами', 'дыхание кончается раньше рук',
    'силу копят не в кулаке, а в груди', 'лечат не раны, а спешку', 'усталость бьёт сильнее удара', 'жилу ищут не ногами, а головой',
    'руда в горе молчит, а в возе говорит', 'металл начинают ломом, а кончают весом', 'жилу держат не жадностью, а порядком', 'железо терпение любит больше силы',
    'спешка портит край', 'огонь проверяет, а не тешит', 'мастер не тот, кто не мажет, а тот, кто правит', 'утварь любят не за блеск, а за хват',
    'нагретый лист слушается ровных рук', 'сталь служит тому, кто её не торопит', 'крепка утварь, когда рука легка', 'мишень не прячется, её выбирают глазами',
    'ветер прощает ровному дыханию', 'лук начинает попадать, когда замолчит язык', 'тугая тетива требует ровных рук', 'меткость растёт не из силы, а из терпенья',
    'целиться — значит выбирать, а не желать', 'промах живёт в спешке, а не в ветре', 'десять шагов приучают глаз быстрее тридцати', 'луки берут на просвет, а не на слух',
    'тетиву берегут до выстрела, а не после', 'рогатка прощает дрожащие руки один раз', 'верный замок важнее меткой руки', 'тропа помнит того, кто первым по ней шёл',
    'потерянное ждёт не в стороне, а на середине пути', 'ищейка ведёт носом, а разведчик — головой', 'верная примета важнее смелой догадки', 'дичь помнит тишину, а не оклик',
    'снег в горах терпеливее всякого ловчего', 'у дичи слух длиннее чужих обещаний', 'верный глаз берёт то, что не возьмёт нога', 'солома не считает промахов',
    'стрела помнит руку, а не злость', 'смех над собой меткости не мешает', 'терпеньем мишень доживает до седых перьев'
    ]) {
    assert.ok(!texts.includes(w),
      'тема чужого NPC (агрегат реестра forbid-цепи 000424: базис .22 + '
      + 'звенья 23..41; инлайн-дамп ниже сверен ЖИВЫМ deepEqual с '
      + 'JSON-реестром в конце этого теста) не дублируется: подстрока «'
      + w + '» — prev = ledger, тексты (диалог+описание) прогнаны ДО '
      + 'записи с 0 пересечений');
  }
  for (const w of MINE) {
    assert.ok(texts.includes(w),
      'СВОЙ оборот «' + w + '» живёт в текстах 000062.json — резерв '
      + 'звена "42" по memory/000320-acro_instructor.md (в guard-массив НЕ '
      + 'внесён — правило 000424; его пишет реестру следующее звено)');
  }
  const ownInline = extractGuardAt(__filename, '000320.41 T5:');
  assert.deepEqual(ownInline, aggregateThrough(readLedger(), SELF_LINK),
    'инлайн-гард этого файла ≡ aggregate(реестра) ЧЕРЕЗ МОЁ звено '
    + SELF_LINK + ' ЖИВЬЁМ (prev читается из JSON-реестра; литеральный '
    + 'массив — только провенанс-якорь зубов 000424 T4/T5; хвост цепи '
    + 'переехал на .42 — ре-пин 000320.42, полный агрегат сторожит '
    + 'зуб хвоста 000424 T5; расхождение транскрипции/дампа красное)');
});

// --- T6: блок обучения профиля + зеркало ------------------------------------

test('000320.41 T6: ДАННЫЕ обучения профиля «обучение» (и ОБЯЗАННОСТЬ размещения — зуб контракта 000211.07 «школы» БЕЗ ролевого/профильного фильтра): {навыки ≡ тренирует Школы акробатов [acro, step] — ЭРРАТА ТЗ «[acro]», диск требует полное равенство; цены СВОИ 25/40 — вторая различная пара ростера дома 11 (живое чтение блоков: Фикка 20/35)} при РОВНО 1 диалоговом действии «обучение» (профильное обучение эталона 000056/000008); SRC-1 молчит: acro/step ∉ SKILL_CRAFT_TYPE и дом 11 ∉ зданий рецептов ⇒ canMentorCraft по всем видам false; блоков торговля/найм/квесты НЕТ; постройки [assets/buildings/academy.json]; зеркало NPCS[61]: постройки [11], диалог/описание/обучение deepEqual', () => {
  assert.ok(fs.existsSync(NEW), 'RED: assets/npc/000062.json отсутствует');
  const data = readJson(NEW);
  for (const block of ['торговля', 'найм', 'квесты']) {
    assert.ok(!(block in data),
      'в JSON нет блока «' + block + '»: профиль «обучение» '
      + '(фикс ТЗ); торговая цепь 0-diff (зона живых волн), квесты не '
      + 'заводим (группы 0..6 исчерпаны .38)');
  }
  assert.ok(!JSON.stringify(data).includes('"торговля"'),
    'ни блока, ни действия «торговля» в JSON нет (свипы '
    + 'item-prices-000322/000346/000347.* пропускают неторговцев, '
    + 'прецедент невидимости торговых счётчиков у .35/.36/.38)');
  assert.ok('обучение' in data,
    'в JSON есть блок «обучение» — профильный блок наставника (эталон '
    + '000056) И ОБЯЗАННОСТЬ размещения: Школа акробатов категория '
    + 'школа_навыков, контракт «школы» требует равенства для КАЖДОГО '
    + 'NPC школы без ролевого/профильного фильтра (ЭМПИРИЧЕСКАЯ '
    + 'ЭРРАТА .34, СЕДЬМОЕ подтверждение на форме теста '
    + 'tests/npc-data.test.js «школы»: sorted(тренирует-id) ≡ '
    + '(обучение ? навыки : []); вырез блока красит чужой «школы» + '
    + 'этот T6 — мутация M1)');
  assert.deepEqual(Object.keys(data.обучение),
    ['навыки', 'цена_за_уровень', 'цена_переноса_за_уровень'],
    'ключи блока — формат эталона 000052.json');
  const acad = readJson(path.join(ROOT, 'assets', 'buildings',
    'academy.json'));
  assert.equal(acad.id, 11,
    'здание academy — id 11 (фикс размещения ТЗ; numeric-путь '
    + '000011.json мёртв с 000318.06)');
  assert.equal(acad.категория, 'школа_навыков',
    'категория — школа_навыков (контракт «школы» её и свипует)');
  const trains = acad.особые_параметры.тренирует;
  assert.ok(Array.isArray(trains) && trains.length === 2,
    'тренирует Школы акробатов — массив из двух ссылок (rename-устойчивая '
    + 'форма: пин идём РЕЗОЛВЕННЫМИ id, не numeric-путями)');
  const trainIds = trains.map((v) => {
    assert.ok(fs.existsSync(path.join(ROOT, v)),
      'ссылка тренирует «' + v + '» существует');
    return readJson(path.join(ROOT, v)).id;
  });
  assert.deepEqual([...trainIds].sort(), [...data.обучение.навыки].sort(),
    'id целей тренирует ≡ навыки обучения (зуб контракта 000211.07 '
    + 'tests/npc-data.test.js «школы»; подмена блока красит чужой '
    + '«школы» + этот T6 — мутация M1; ЭРРАТА ТЗ «навыки: [acro]» — '
    + 'контракт требует ПОЛНОГО равенства с [acro, step])');
  assert.deepEqual([...data.обучение.навыки].sort(), ['acro', 'step'],
    'навыки — РОВНО [acro, step] (≡ тренирует Школы акробатов; '
    + 'обоих нет в SKILL_CRAFT_TYPE — SRC-1 молчит, T6-негативы ниже)');
  assert.equal(data.обучение.цена_за_уровень, 25,
    'цена_за_уровень 25 — СВОЯ цена (вторая ступень лестницы дома 11: '
    + 'Фикка 20/35; 25/40 занята Кречетом дома 10 и Карком дома 1 — '
    + 'междома легально, равенств/неравенств цен ПОСТРОЙКОЙ контракты '
    + 'не пинуют, различие пар ростера пиним живым чтением ниже)');
  assert.equal(data.обучение.цена_переноса_за_уровень, 40,
    'цена_переноса_за_уровень 40 — та же своя пара; фиксированных '
    + 'контрактов по шкале нет');
  const pairs = [];
  for (const f of listNpcFiles()) {
    const d2 = readJson(path.join(NDIR, f));
    if (!(d2.постройки || [])
      .includes('assets/buildings/academy.json')) continue;
    assert.ok(d2.обучение,
      'у NPC дома 11 блок обучения обязателен (контракт «школы») — ' + f);
    pairs.push(d2.обучение.цена_за_уровень + '/'
      + d2.обучение.цена_переноса_за_уровень);
  }
  assert.equal(new Set(pairs).size, pairs.length,
    'все цены ростера дома 11 различны (живое чтение; факт: '
    + JSON.stringify(pairs.sort()) + ')');
  assert.ok(pairs.includes('25/40'),
    'наша пара 25/40 в ростере дома 11 (факт: ' + JSON.stringify(pairs) + ')');
  const withTrain = data.диалог.filter((o) => o.действие === 'обучение');
  assert.equal(withTrain.length, 1,
    'ДЕЯСТВИЙ «обучение» в диалоге ровно одно — обучение ПРОФИЛЬНОЕ '
    + '(фикс ТЗ; эталон 000056/000008: train-вкладка открывается '
    + 'действием, src/ui.js); вторая train-опция была бы дублем — '
    + 'красна через T5 (DEPTH опций = 3 и карта id)');
  assert.equal(C.SKILL_CRAFT_TYPE.acro, undefined,
    'acro НЕ маппится в вид крафта (src/craft.js) — зуб SRC-1 нас '
    + 'НЕ триггерит');
  assert.equal(C.SKILL_CRAFT_TYPE.step, undefined,
    'step НЕ маппится в вид крафта');
  for (const type of Object.keys(C.CRAFT_TYPE_SKILL)) {
    assert.ok(!C.typeBuildings(type).includes(11),
      'дом 11 (Школа акробатов) вне зданий рецептов вида «' + type + '» — '
      + 'диск НЕ заставляет витрину; торговли нет и по ТЗ');
  }
  const mirror = NPCS[61];
  assert.ok(mirror && mirror.id === ID,
    'зеркало: 62-я запись acro_instructor (canMentorCraft гоняем по зеркалу '
    + '— id-форма построек, прецедент .31/.32/.35–.40)');
  for (const type of Object.keys(C.CRAFT_TYPE_SKILL)) {
    assert.deepEqual(C.canMentorCraft(mirror, { alive: true }, type),
      { ok: false, reason: 'не обучает этот вид крафта' },
      'SRC-1 негатив по ВСЕМ видам крафта (блок обучения есть, '
      + 'craft-навыков нет) — чертежей продавать не обязаны');
  }
  assert.deepEqual(mirror.постройки, [11],
    'зеркало: постройки [11] — sync резолвит ссылку Школы акробатов в id');
  assert.equal(mirror.роль, 'наставник',
    'роль в зеркале — «наставник» (фикс ТЗ)');
  assert.deepEqual(mirror.диалог, data.диалог,
    'зеркало NPCS[61].диалог ≡ JSON-диалог бит-в-бит');
  assert.deepEqual(mirror.описание, data.описание,
    'зеркало NPCS[61].описание ≡ JSON');
  assert.deepEqual(mirror.обучение, data.обучение,
    'зеркало NPCS[61].обучение ≡ JSON (резолвинга нет — навыки живут '
    + 'строками id, прецедент .26–.40 T6)');
});

// --- T7: ростер Школы акробатов — ЧЕТВЕРО (ре-пин .43), Фикка первая; чужие дома не тронуты --

test('000320.41 T7: npcsForBuilding(NPCS, 11) — ЧЕТВЕРО Школы акробатов в порядке каталога [acro_master, acro_instructor, air_performer, rope_walker] (ре-пин 000320.43); npcForBuilding(11) — по-прежнему Фикка; Стрельбище (10) — СЕМВЕРО не тронуто (.40-ростер); Кузница (8) — ЧЕТВЕРО не тронута (.34-ростер)', () => {
  const list = N.npcsForBuilding(NPCS, 11);
  assert.deepEqual(list.map((n) => n.id),
    ['acro_master', ID, 'air_performer', 'rope_walker'],
    'Школа акробатов (11): Фикка (000008) + наставник Кувырок (000062) '
    + '+ воздушный исполнитель Воздун (000063) + канатходец Затяж '
    + '(000064, ре-пин 000320.43), порядок = нумерация файлов; Фикка '
    + 'ПЕРВАЯ (её файл не тронут); факт: '
    + JSON.stringify(list.map((n) => n.id)));
  assert.equal(N.npcForBuilding(NPCS, 11).id, 'acro_master',
    'npcForBuilding — ПЕРВЫЙ по номеру файла (Фикка; HUD/«Здесь:» '
    + 'не тронуты — города и cities-снапы не двигаются)');
  const range = N.npcsForBuilding(NPCS, 10);
  assert.deepEqual(range.map((n) => n.id),
    ['archery_master', 'archery_instructor', 'accuracy_instructor',
      'crossbowman', 'scout', 'hunter', 'range_dummy'],
    'Стрельбище (10) — СЕМВЕРО не тронуто (.40-ростер, дом 11 нас сюда '
    + 'не двигает): ' + JSON.stringify(range.map((n) => n.id)));
  const smith = N.npcsForBuilding(NPCS, 8);
  assert.deepEqual(smith.map((n) => n.id),
    ['blacksmith', 'ore_merchant', 'forge_instructor', 'tool_smith'],
    'Кузница (8) — ЧЕТВЕРО не тронута (.34-ростер): '
    + JSON.stringify(smith.map((n) => n.id)));
});

// --- T8: [E]-оверлей Школы акробатов — ровно 4 dialog-строки (ре-пин .43) ----

test('000320.41 T8: [E]-оверлей Школы акробатов — ровно 4 строки: dialog (Фикка), dialog:acro_instructor (Кувырок), dialog:air_performer (Воздун), dialog:rope_walker (Затяж) (ре-пин 000320.43); эффектов у дома 11 нет — effectIds пуст; крафт-строки НЕТ (11 ∉ зданий рецептов — под Game.Craft wiring список всё равно 4 строки); подписи «Диалог: Фикка»/«Диалог: Кувырок»/«Диалог: Воздун»/«Диалог: Затяж»; хоткеи Digit1..4 — граница /^Digit([1-9])$/ не превышена', () => {
  const b = readJson(path.join(ROOT, 'assets', 'buildings',
    'academy.json'));
  assert.equal(b.id, 11, 'здание academy — id 11 (фикс размещения)');
  assert.equal(b.категория, 'школа_навыков',
    'категория — школа_навыков (контракт «школы» её и свипует)');
  assert.ok(!('11' in BE.EFFECTS),
    'у дома 11 эффектов НЕТ (EFFECTS не содержит ключа «11») — '
    + 'effectIds(building) пуст на голом диске');
  assert.deepEqual(BE.effectIds(b), [],
    'effectIds Школы акробатов — [] (записи дома 11 в BUILDINGS-дереве '
    + 'эффектов нет)');
  const prevGame = globalThis.Game;
  globalThis.Game = { Craft: C };
  let rows;
  try {
    const list = N.npcsForBuilding(NPCS, 11);
    rows = BE.buildingActions(b, list, { day: 5 });
  } finally {
    if (prevGame === undefined) delete globalThis.Game;
    else globalThis.Game = prevGame;
  }
  assert.equal(rows.length, 4,
    'список здания 11 = dialog-строки по каждому NPC (РОВНО ЧЕТЫРЕ после '
    + '.43 — ре-пин 000320.43) БЕЗ крафт-строки (не дом 8: рецептов на '
    + 'Школе нет), факт: ' + JSON.stringify(rows.map((r) => r.id)));
  assert.deepEqual(rows.map((r) => r.id),
    ['dialog', 'dialog:' + ID, 'dialog:air_performer',
      'dialog:rope_walker'],
    'порядок строк = нумерация файлов каталога, Фикка по-прежнему '
    + 'ПЕРВАЯ, суффикс «:<id>» со второй строки — механизм '
    + 'building-effects); факт: '
    + JSON.stringify(rows.map((r) => r.id)));
  assert.deepEqual(rows.map((r) => r.имя),
    ['Диалог: Фикка', 'Диалог: ' + NAME, 'Диалог: Воздун',
      'Диалог: Затяж'],
    'подписи — «Диалог: <имя>», факт: '
    + JSON.stringify(rows.map((r) => r.имя)));
  assert.deepEqual(rows.map((r) => r.npcId),
    ['acro_master', ID, 'air_performer', 'rope_walker'],
    'каждая dialog-строка несёт npcId своего NPC (роутинг клика)');
  for (let i = 0; i < rows.length; i++) {
    assert.match('Digit' + (i + 1), /^Digit([1-9])$/,
      'хоткеи Digit1..' + rows.length + ' — общий механизм '
      + 'src/building-ui.js /^Digit([1-9])$/ (четвёртая строка в '
      + 'границе)');
  }
});

// --- T9: forbid-цепь под реестром 000424 -------------------------------------

test('000320.41 T9: forbid-цепь под реестром (000424) — звено "41" существует, РОВНО 4 фразы и ≡ дисковой MINE-константе файла .40 (машинное извлечение, EXPECT_ADDS-третьих-копий НЕ заводим), инлайн-гард T5 этого файла ≡ aggregate(реестра) ЧЕРЕЗ МОЁ звено "41" (ре-пин 000320.42: хвост — .42), длина — ФОРМУЛОЙ базис + 4×число_звеньев_через_41 (литерал числа запрещён), prev (агрегат до звена "40") ⊆ own, анти-вакуум: инжект каждой prev-фразы ловится сканером и вырез элемента guard-копии красит предикат, СВОИ 4 оборота НЕ в guard-массиве, ≡ звену "42" реестра (резерв погашен коммитом .42) и не пересекаются substring-в-обе-стороны ни с цепью (агрегат + литералы всех звеньев и legacy-массивов tests/npc-000320.*.test.js), ни с текстами каталога assets/npc', () => {
  const ledger = readLedger();
  assert.ok(Object.prototype.hasOwnProperty.call(ledger.links, '41'),
    'RED: звено "41" ещё не дописано в реестр — его пишет коммит .41 '
    + '(append-only; содержимое — РОВНО 4 фразы prev-звена .40)');
  const prevFile = path.join(__dirname, 'npc-000320.40.test.js');
  assert.ok(fs.existsSync(prevFile),
    'предыдущее звено цепи tests/npc-000320.40.test.js существует');
  const discMine40 = extractMineFrom(prevFile);
  assert.deepEqual(ledger.links['41'], discMine40,
    'звено "41" ≡ дисковой MINE-константе файла .40 (Пугало; '
    + 'провенанс зуба 000424 T4; машинное извлечение — ручной '
    + 'транскрипции нет); факт диска: ' + JSON.stringify(discMine40));
  const own = extractGuardAt(__filename, '000320.41 T5:');
  const agg = aggregateThrough(ledger, SELF_LINK);
  assert.deepEqual(own, agg,
    'инлайн-гард этого файла ≡ aggregate(реестра) ЧЕРЕЗ звено "' + SELF_LINK
    + '" ПОБЛАГО (и порядок, и значения; prev = ledger, 000424; полный '
    + 'агрегат ≡ гарду хвоста — зуб 000424 T5; ре-пин 000320.42)');
  const keys = linkKeysOf(ledger.links).filter((k) => k <= SELF_LINK);
  assert.equal(own.length, ledger.basis.length + 4 * keys.length,
    'длина агрегата через моё звено — ФОРМУЛА базис + 4×звенья (не '
    + 'литерал): ' + ledger.basis.length + ' + 4×' + keys.length
    + '; факт: ' + own.length);
  assert.equal(new Set(agg).size, agg.length,
    'в агрегате через моё звено нет дублей; длина: ' + agg.length);
  const prev = aggregateThrough(ledger, SELF_LINK - 1);
  const ownSet = new Set(own);
  const lost = prev.filter((x) => !ownSet.has(x));
  assert.deepEqual(lost, [],
    'prev ⊆ own — ни одна агрегатная фраза не потеряна в guard-копии; '
    + 'потеряно: ' + JSON.stringify(lost));
  const damaged = own.filter((_, i) => i !== 5);
  const damagedSet = new Set(damaged);
  assert.ok(prev.filter((x) => !damagedSet.has(x)).length > 0,
    'тот же предикат ловит вырез элемента из guard-копии (анти-вакуум '
    + 'предиката, паттерн 000424 T9)');
  for (const phrase of agg) {
    const texts = ['нейтральная строка диалога',
      'текст с подстрокой [' + phrase + '] внутри'];
    assert.ok(forbidHits(texts, own).length >= 1,
      'зуб не вакуумный: инжект prev-фразы «' + phrase.slice(0, 24)
      + '…» обязан быть пойман сканером');
  }
  assert.deepEqual(ledger.links[String(SELF_LINK + 1)], MINE,
    'резерв погашен: звено "' + (SELF_LINK + 1) + '" реестра ≡ моей '
    + 'MINE-константе побла́го (провенанс 000424 T4; вписано коммитом '
    + '.42 — ре-пин 000320.42)');
  for (const m of MINE) {
    assert.ok(!agg.includes(m),
      'свой оборот «' + m + '» НЕ в guard-массиве (агрегат через моё '
      + 'звено его не содержит — правило 000424: звено пишет резерв '
      + 'ПРЕДЫДУЩЕГО, а не свой; в этом файле свои 4 пинятся циклом '
      + 'присутствия в T5)');
  }
  assert.equal(new Set(MINE).size, MINE.length,
    'свои 4 оборота различны между собой');
  const union = new Set(agg);
  const chainFiles = fs.readdirSync(__dirname)
    .filter((f) => /^npc-000320\.\d+\.test\.js$/.test(f))
    .sort();
  for (const f of chainFiles) {
    const t = fs.readFileSync(path.join(__dirname, f), 'utf8');
    for (const mm of t.matchAll(/for \(const w of \[([\s\S]*?)\]\)/g)) {
      for (const x of mm[1].matchAll(/'([^']*)'/g)) union.add(x[1]);
    }
    const mine = t.match(/const MINE = \[([\s\S]*?)\];/);
    if (mine) {
      for (const x of mine[1].matchAll(/'([^']*)'/g)) union.add(x[1]);
    }
  }
  for (const m of MINE) {
    for (const g of union) {
      if (g === m) continue;
      assert.ok(!m.includes(g) && !g.includes(m),
        'подстрока чужой forbid-формы в своём резервном обороте '
        + '(substring в обе стороны по всей цепи): «' + m + '» vs «'
        + g + '»');
    }
  }
  for (const f of listNpcFiles()) {
    if (f === '000062.json') continue;
    const d = readJson(path.join(NDIR, f));
    const joined = [d.описание, ...d.диалог.map((o) => o.текст),
      ...(d.квесты || []).map((q) => (q.название || '') + ' '
        + (q.описание || ''))].join(' ');
    for (const m of MINE) {
      assert.ok(!joined.includes(m),
        'свой резервный оборот «' + m + '» уже живёт в текстах ' + f
        + ' (резерв "42" должен быть чист)');
    }
  }
});

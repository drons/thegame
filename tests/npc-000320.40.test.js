// Задача 000320.40: «Мишень» — id range_dummy, имя «Пугало»
// (Стрельбище, 7-й NPC постройки; 40-я из 100 дочерних 000320).
//
// Контракт (ТЗ tasks/pending/000320.40.md; механизм мульти-NPC —
// 000320.01, spec/npc.md «Несколько NPC на постройку»,
// memory/000320-npcs-batch.md; профиль-эталон чистого «подсказка» —
// диск 000042 «Проводник» (.21), 000052 «Сухарь» и 000060 «Глухарь»
// (.39) — школа + инертный блок обучения; свою память несёт
// memory/000320-range_dummy.md):
//   * assets/npc/000061.json — id range_dummy (репо-свип: единственный
//     хит — путь memory-файла в самой карточке; прецедент .30
//     arena_dummy для «мишени» Арены), имя «Пугало» — выбор агента:
//     свип 0 хитов по всему репо ДО записи; роль-слово ТЗ «мишень»
//     именем не стало — правило ландромина .22; «Чучело» отклонено
//     (2 хита в памяти/тестах .30, резерв Чурки), роль РОВНО «мишень»
//     (фикс ТЗ; свипов уникальности ролей нет — тесты фильтруют по id;
//     дубль роли с Чуркой 000051 легален), постройка
//     assets/buildings/archery_range.json (id 10; ТЗ-путь 000010.json
//     мёртв с 000318.06 — zero-sweep
//     tests/buildings-rename-000318.06.test.js T5; путь — SLUG), 7-й
//     NPC Стрельбища (на диске ШЕСТЕРО: Лейна 000007 + Кречет 000056 +
//     Намёт 000057 + Канитель 000058 + Хожалый 000059 + Глухарь
//     000060 — мы СЕМЫЙ, Лейна остаётся ПЕРВОЙ по номеру файла); хук
//     истории «Стоит на стрельбище — шутит о промахах» — последнее
//     предложение описания (endsWith от ПОЛНОЙ строки хука с точкой,
//     конвенция .02–.39; форме прецедент .30 «Стоит на арене тридцать
//     лет — рассказывает об ударах»);
//   * счётчик каталога НЕ ре-пинится — держатели живут ls-предикатами
//     миграции 000387.01/000397/000410/000423: чистое добавление
//     000061.json + sync зеленят сиблинговые T1 без ручной правки;
//     tests/npc-refs.test.js — 0-diff (ls-пола односторонний рэтчет);
//   * профиль диалога — чистая «подсказка» (фикс ТЗ; РОВНО 3 опции все
//     «подсказка»; «для» РОВНО 0 (контракт A8a)); торговли/найма/
//     квестов нет (mob-группы 0..6 исчерпаны .38);
//   * ОБЯЗАННОСТЬ размещения (не вилка; ЭМПИРИЧЕСКАЯ ЭРРАТА .34,
//     шестое подтверждение): бриф-мир «профиль подсказка ⇒ обучения
//     нет» — ЛОЖЬ живого кода: контракт 000211.07 tests/npc-data.test.js
//     «школы» идёт по всем NPCS × постройки категории школа_навыков
//     БЕЗ ролевого/профильного фильтра и требует sorted(тренирует-id)
//     ≡ (обучение ? навыки : []) для КАЖДОГО NPC школы с массивом
//     тренирует: Стрельбище тренирует accuracy + archer ⇒ блок
//     {навыки [accuracy, archer]} ОБЯЗАН (держатели-прецеденты в доме
//     10: Лейна 000007, Кречет 000056, Намёт 000057, Канитель 000058,
//     Хожалый 000059, Глухарь 000060; паритет «подсказка»-профиля с
//     инертным блоком — 000052 Сухарь). Блок ИНЕРТЕН по диалогу: опции
//     «обучение» НЕТ (train-вкладка открывается только действием,
//     src/ui.js; решение .27). Цены 50/70 — СВОИ (СЕМЬ различная пара
//     дома 10; набор цен ростера различен — проверено ЖИВЫМ чтением
//     блоков в T6; равенств цен по постройке ни один контракт не
//     пинует); лестница дома 10: 20/35, 25/40, 30/50, 35/55, 40/60,
//     45/65 ⇒ наша 50/70;
//   * SRC-1 к нам НЕ применяется (прецедент .35/.36/.37/.38/.39:
//     accuracy/archer вне SKILL_CRAFT_TYPE, дом 10 вне зданий рецептов
//     — canMentorCraft data-driven, ролей НЕ знает) ⇒ витрина НЕ
//     предписана кодом, торговли по ТЗ нет — совпадение;
//   * порядок ключей JSON — [id, имя, роль, описание, постройки,
//     диалог, обучение] (побайтовый эталон диска 000052.json — чистый
//     «подсказка»-профиль со школьным блоком обучения);
//   * тема диалога — солома/стрелы/промахи/смех (ТЗ «можно немного
//     юмора»); запрет-лист текстов — АГРЕГАТ РЕЕСТРА forbid-цепи
//     (prev = ledger, 000424): базис (guard .22) + звенья 23..40; со
//     звеном "40" агрегат = 75 + 4×18 = 147. Инлайн-массив T5 этого
//     файла — провенанс-якорь зубов 000424 T4/T5 (extractGuard ищет
//     литеральную форму цикла после якоря заголовка T5): он
//     СГЕНЕРИРОВАН дампом aggregate(реестра) и закреплён ЖИВЫМ
//     deepEqual с JSON ниже — ручная транскрипция запрещена,
//     расхождение красное. СВОИ 4 оборота (резерв звена "41") в
//     guard-массив НЕ внесены (правило 000424), пинятся циклом
//     присутствия; их пишет реестру следующее звено на своём мерже;
//   * [E]-оверлей Стрельбища — СЕМЬ dialog-строк (Лейна первой по
//     номеру файла, суффикс «:<id>» со второй — механизм
//     building-effects); эффектов у дома 10 нет; крафт-строки НЕТ
//     (10 ∉ зданий рецептов); хоткеи Digit1..7 — граница
//     /^Digit([1-9])$/ не превышена.
//
// ЗУБ forbid-цепи под реестром (000424 вместо 000372-пар): T9 сверяет
// звено "40" ≡ MINE-константе диска .39 (машинно), инлайн-гард ≡
// aggregate(реестра), длину — ФОРМУЛОЙ базис + 4×звенья (литерал
// числа запрещён), prev ⊆ own + анти-вакуум (инжект каждой prev-фразы
// ловится; вырез элемента guard-копии красит предикат) + свип своих
// оборотов substring-в-обе-стороны против всей цепи и каталога.
//
// КРАСНЫЕ (TDD): T1..T8 красные до зелёной стадии (000061.json нет,
// ростер Стрельбища — ШЕСТЕРО, оверлей 6 строк), T9 красный до аппенда
// звена "40" в реестр (цепь под ledger читается из JSON), без краха
// загрузки. На RED-этапе легитимно краснеют и зубы 000424 T3/T4/T5
// (хвост цепи уже 40, ключа "40" ещё нет) — целевое состояние ДО
// аппенда, не порча legacy.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validateData } = require('./json-schema.js');

const ROOT = path.join(__dirname, '..');
const NDIR = path.join(ROOT, 'assets', 'npc');
const NEW = path.join(NDIR, '000061.json');
const SCHEMA = JSON.parse(
  fs.readFileSync(path.join(NDIR, 'schema.json'), 'utf8'));

const N = require('../src/npc.js');
const { NPCS } = require('../src/npc-data.js');
const BE = require('../src/building-effects.js');
const C = require('../src/craft.js');

const LEDGER_PATH = path.join(__dirname, 'scripts', 'npc-forbidden-ledger.json');

const HOOK = 'Стоит на стрельбище — шутит о промахах';
const ID = 'range_dummy';
const NAME = 'Пугало';

const MINE = ['солома не считает промахов',
  'стрела помнит руку, а не злость',
  'смех над собой меткости не мешает',
  'терпеньем мишень доживает до седых перьев'];

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

const SELF_LINK = 40;

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

test('000320.40 T1: каталог — ls-предикат: 000001..N подряд (N = счётчик диска); зеркало NPCS ≡ каталогу с range_dummy', () => {
  const files = listNpcFiles();
  assert.ok(files.length >= 61,
    'в каталоге NPC не менее 61 файла (000320.37: +Канитель; 000320.38: '
    + '+Хожалый; 000320.39: +Глухарь; 000320.40: +Пугало), факт: '
    + files.length);
  for (let i = 0; i < files.length; i++) {
    assert.equal(files[i],
      String(i + 1).padStart(6, '0') + '.json',
      'нумерация подряд без пропусков: индекс ' + i);
  }
  assert.equal(NPCS.length, files.length,
    'зеркало src/npc-data.js ≡ каталогу (sync не прогнан?), факт: '
    + NPCS.length);
  const last = NPCS[60];
  assert.ok(last, '61-я запись зеркала существует');
  assert.equal(last.id, ID,
    '61-я запись зеркала — range_dummy (порядок = нумерация файлов)');
  assert.equal(NPCS[59].id, 'hunter',
    'guard: 60-я запись — Глухарь (позиционные NPCS[..] не сдвинуты)');
  assert.equal(NPCS[58].id, 'scout',
    'guard: 59-я запись — Хожалый (позиционные NPCS[..] не сдвинуты)');
});

// --- T2: 000061.json валиден по схеме + порядок ключей + roundtrip ---------

test('000320.40 T2: assets/npc/000061.json валиден по schema; ключи в порядке эталона диска 000052.json (id, имя, роль, описание, постройки, диалог, обучение — без квестов/найм/торговля); roundtrip-канон; негативы — мимо схемы и мимо порядка ключей', () => {
  assert.ok(fs.existsSync(NEW),
    'RED: assets/npc/000061.json отсутствует (NPC задачи ещё не создан)');
  const data = readJson(NEW);
  assert.deepEqual(validateData(SCHEMA, data, 'npc/000061'), [],
    '000061.json обязан проходить assets/npc/schema.json');
  const KEYS = ['id', 'имя', 'роль', 'описание', 'постройки', 'диалог',
    'обучение'];
  assert.deepEqual(Object.keys(data), KEYS,
    'порядок ключей — побайтовый эталон диска 000052.json (Сухарь — '
    + 'чистый «подсказка»-профиль со школьным блоком обучения): '
    + '«обучение» — ОБЯЗАННОСТЬ контракта 000211.07 «школы» для каждого '
    + 'NPC школы_навыков БЕЗ ролевого/профильного фильтра (ЭМПИРИЧЕСКАЯ '
    + 'ЭРРАТА .34: «профиль подсказка ⇒ обучения нет» — ЛОЖЬ живой кода, '
    + 'шестое подтверждение формой этого теста); '
    + 'блоков квесты/найм/торговля нет');
  const raw = fs.readFileSync(NEW, 'utf8');
  assert.equal(raw, JSON.stringify(data, null, 2) + '\n',
    '000061.json — roundtrip JSON.stringify(obj,null,2)+перевод строки');
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
  badPath.постройки = ['000010.json'];
  assert.notDeepEqual(validateData(SCHEMA, badPath, 'npc/badpath'), [],
    'постройки без пути assets/buildings/ (numeric-форма) — вне паттерна схемы');
  const numericPath = JSON.parse(JSON.stringify(data));
  numericPath.постройки = ['assets/buildings/' + '000010' + '.json'];
  assert.notDeepEqual(validateData(SCHEMA, numericPath, 'npc/numericpath'), [],
    'numeric-путь постройки — вне паттерна схемы: база содержит 000318.06, '
    + 'здания — slug-именование, numeric-форма мертва (zero-sweep '
    + 'tests/buildings-rename-000318.06.test.js T5); ТЗ-путь '
    + '000010.json устарел — живая ссылка '
    + 'assets/buildings/archery_range.json');
  const badPrice = JSON.parse(JSON.stringify(data));
  badPrice.обучение.цена_за_уровень = 0;
  assert.notDeepEqual(validateData(SCHEMA, badPrice, 'npc/badprice'), [],
    'цена_за_уровень 0 — вне схемы (minimum 1, максимум 10000)');
  const badSkill = JSON.parse(JSON.stringify(data));
  badSkill.обучение.навыки = ['Меткость'];
  assert.notDeepEqual(validateData(SCHEMA, badSkill, 'npc/badskill'), [],
    'навык «Меткость» — вне паттерна id ^[a-z][a-z0-9_]*$');
  const withTrade = JSON.parse(JSON.stringify(data));
  withTrade.торговля = { предметы: [] };
  assert.notDeepEqual(Object.keys(withTrade), KEYS,
    'лишний блок «торговля» — вне эталона ключей: торговая цепь не '
    + 'трогается, профиль «подсказка» держится СЛОВОМ ТЗ');
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

test('000320.40 T3: id range_dummy и имя «Пугало» уникальны в sweep каталога', () => {
  assert.ok(fs.existsSync(NEW), 'RED: assets/npc/000061.json отсутствует');
  const ids = new Set();
  const names = new Set();
  for (const f of listNpcFiles()) {
    const d = readJson(path.join(NDIR, f));
    assert.ok(!ids.has(d.id), 'дубликат id «' + d.id + '» (файл ' + f + ')');
    assert.ok(!names.has(d.имя), 'дубликат имени «' + d.имя + '» (файл ' + f + ')');
    ids.add(d.id);
    names.add(d.имя);
  }
  assert.ok(ids.has(ID), 'id range_dummy в каталоге');
  assert.ok(names.has(NAME), 'имя «Пугало» в каталоге');
});

// --- T4: роль-фикс, описание с хуком и уникально ----------------------------

test('000320.40 T4: роль РОВНО «мишень» (точная строка ТЗ + сводная таблица; свипов уникальности ролей нет — дубль роли с Чуркой 000051 легален, фильтры идут по id; роль-слово ТЗ «мишень» именем не стало, правило ландромина .22: имя «Пугало» — выбор агента, свип 0 хитов); описание непустое, хук «Стоит на стрельбище — шутит о промахах» — последнее предложение, и НЕ копия описания другого NPC', () => {
  assert.ok(fs.existsSync(NEW), 'RED: assets/npc/000061.json отсутствует');
  const data = readJson(NEW);
  assert.ok(typeof data.описание === 'string' && data.описание.trim() !== '',
    'описание непустое');
  assert.equal(data.роль, 'мишень',
    'роль — фикс-строка «мишень» (ТЗ; Т4 пишет точное равенство, '
    + 'свипов уникальности ролей нет — прецедент .30 Чурка)');
  assert.ok(data.описание.includes(HOOK),
    'хук истории «' + HOOK + '» (ТЗ) в описании дословно');
  assert.ok(data.описание.endsWith(HOOK + '.'),
    'хук — ПОСЛЕДНЕЕ предложение описания (с заглавной, с точкой на '
    + 'конце — прецеденты .02–.39; endsWith идёт от ПОЛНОЙ строки '
    + 'хука, конвенция .22–.39; точка в конце — часть формы хука); факт: '
    + JSON.stringify(data.описание.slice(-90)));
  for (const f of listNpcFiles()) {
    if (f === '000061.json') continue;
    const d = readJson(path.join(NDIR, f));
    assert.notEqual(d.описание, data.описание,
      'описание совпадает с ' + f + ' (не копия существующего)');
  }
});

// --- T5: диалог — чистый профиль «подсказка», «для»=0, запрет-лист из реестра

test('000320.40 T5: диалог валиден по схеме, РОВНО 3 опции чистого профиля «подсказка» эталона диска 000042/000052/000060 (prives/hint_straw/hint_laugh — все действием «подсказка»), ДЕЙСТВИЙ обучение/торговля/квесты/найм РОВНО 0, РОВНО одна опция с {харизма:3} на ПОСЛЕДНЕЙ, id опций уникальны, опций с «для» — ровно 0, запрет-лист — АГРЕГАТ РЕЕСТРА forbid-цепи (prev = ledger, 000424; инлайн-гард ниже — машинный дамп реестра, провенанс-якорь зубов 000424 T4/T5) по ТЕКСТАМ диалога и описания, СВОИ 4 оборота присутствуют и в гард НЕ внесены (резерв звена "41")', () => {
  assert.ok(fs.existsSync(NEW), 'RED: assets/npc/000061.json отсутствует');
  const data = readJson(NEW);
  assert.ok(Array.isArray(data.диалог) && data.диалог.length >= 1,
    'диалог непустой (schema minItems 1)');
  assert.equal(data.диалог.length, 3,
    'диалог — ровно 3 опции (prives / hint_straw / hint_laugh — форма '
    + 'эталона чистого «подсказка» диска 000042/000052: Проводник, '
    + 'Сухарь, и чистый школьный 000060), факт: ' + data.диалог.length);
  const ACTIONS = SCHEMA.properties.диалог.items.properties.действие.enum;
  for (const o of data.диалог) {
    assert.ok(ACTIONS.includes(o.действие),
      'действие «' + o.действие + '» вне enum схемы');
    const errs = validateData(SCHEMA.properties.диалог.items, o, 'диалог');
    assert.deepEqual(errs, [],
      'опция «' + o.id + '» — вне схемы диалога: ' + JSON.stringify(errs));
  }
  assert.deepEqual(data.диалог.map((o) => o.id),
    ['prives', 'hint_straw', 'hint_laugh'],
    'id опций — причесон чистого «подсказка»-профиля .21/000052/.39: '
    + 'prives первым, подсказки следом');
  assert.deepEqual(data.диалог.map((o) => o.действие),
    ['подсказка', 'подсказка', 'подсказка'],
    'РОВНО три опции «подсказка» — фикс-профиль ТЗ (эталон 000042/'
    + '000052/000060); опций «обучение» НЕТ: train-вкладка UI открывается '
    + 'только действием «обучение» (src/ui.js), её отсутствие и есть '
    + 'инертность блока обучения (решение .27; паритет профиля — 000052 '
    + 'Сухарь со школьным блоком)');
  for (const act of ['обучение', 'торговля', 'квесты', 'найм']) {
    assert.equal(data.диалог.filter((o) => o.действие === act).length, 0,
      'ДЕЯСТВИЙ «' + act + '» в диалоге ровно 0 — профиль чистая '
      + '«подсказка» (фикс ТЗ); обязанность обучения реализована ДАННЫМИ '
      + 'блока (T6), а не опцией');
  }
  const ids = data.диалог.map((o) => o.id);
  assert.equal(new Set(ids).size, ids.length, 'id опций диалога уникальны');
  assert.equal(data.диалог.filter((o) => o.для !== undefined).length, 0,
    'опций с «для» — ровно 0: мишень говорит со всеми; добавление '
    + '«для» требует ре-пина A8a (tests/npc-dialog-scope) и запрещено');
  const withReq = data.диалог.filter((o) => o.требования !== undefined);
  assert.equal(withReq.length, 1,
    'ровно одна опция с требованиями (прецедент всей цепи .17–.38: '
    + 'харизма-хит последней опции)');
  assert.deepEqual(withReq[0].требования, { харизма: 3 },
    'требование опции — {харизма: 3} (харизма-прецедент батча, НЕ «проверка»)');
  assert.equal(data.диалог.indexOf(withReq[0]), 2,
    'опция с требованием — ПОСЛЕДНЯЯ (конвенция цепи .17–.38: hint_* '
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
    'снег в горах терпеливее всякого ловчего', 'у дичи слух длиннее чужих обещаний', 'верный глаз берёт то, что не возьмёт нога'
    ]) {
    assert.ok(!texts.includes(w),
      'тема чужого NPC (агрегат реестра forbid-цепи 000424: базис .22 + '
      + 'звенья 23..40; инлайн-дамп ниже сверен ЖИВЫМ deepEqual с '
      + 'JSON-реестром в конце этого теста) не дублируется: подстрока «'
      + w + '» — prev = ledger, тексты (диалог+описание) прогнаны ДО '
      + 'записи с 0 пересечений');
  }
  for (const w of MINE) {
    assert.ok(texts.includes(w),
      'СВОЙ оборот «' + w + '» живёт в текстах 000061.json — резерв '
      + 'звена "41" по memory/000320-range_dummy.md (в guard-массив НЕ '
      + 'внесён — правило 000424; его пишет реестру следующее звено)');
  }
  const ownInline = extractGuardAt(__filename, '000320.40 T5:');
  assert.deepEqual(ownInline, aggregateThrough(readLedger(), SELF_LINK),
    'инлайн-гард этого файла ≡ aggregate(реестра) ЧЕРЕЗ МОЁ звено '
    + SELF_LINK + ' ЖИВЬЁМ (prev читается из JSON-реестра; литеральный '
    + 'массив — только провенанс-якорь зубов 000424 T4/T5; хвост цепи '
    + 'переехал на .41 — ре-пин 000320.41, полный агрегат сторожит '
    + 'зуб хвоста 000424 T5; расхождение транскрипции/дампа красное)');
});

// --- T6: обязанность обучения (контракт «школы») + зеркало ------------------

test('000320.40 T6: ДАННЫЕ обучения как ОБЯЗАННОСТЬ размещения (зуб контракта 000211.07 «школы» БЕЗ ролевого/профильного фильтра — ЭМПИРИЧЕСКАЯ ЭРРАТА .34 «профиль подсказка ⇒ обучения нет» ложна, проверяется формой теста, а не названием профиля — ШЕСТОЕ подтверждение): {навыки ≡ тренирует Стрельбища [accuracy, archer], цены СВОИ 50/70 — СЕМЬ различных пар ростера дома 10 (живое чтение блоков)} при РОВНО 0 диалоговых действий «обучение» (инертность по паритету 000052); SRC-1 молчит: accuracy/archer ∉ SKILL_CRAFT_TYPE и дом 10 ∉ зданий рецептов ⇒ canMentorCraft по всем видам false; блоков торговля/найм/квесты НЕТ; постройки [assets/buildings/archery_range.json]; зеркало NPCS[60]: постройки [10], диалог/описание/обучение deepEqual', () => {
  assert.ok(fs.existsSync(NEW), 'RED: assets/npc/000061.json отсутствует');
  const data = readJson(NEW);
  for (const block of ['торговля', 'найм', 'квесты']) {
    assert.ok(!(block in data),
      'в JSON нет блока «' + block + '»: профиль чистая «подсказка» '
      + '(фикс ТЗ); торговая цепь 0-diff (зона живых волн), квесты не '
      + 'заводим (группы 0..6 исчерпаны .38)');
  }
  assert.ok(!JSON.stringify(data).includes('"торговля"'),
    'ни блока, ни действия «торговля» в JSON нет (свипы '
    + 'item-prices-000322/000346/000347.* пропускают неторговцев, '
    + 'прецедент невидимости торговых счётчиков у .35/.36/.38)');
  assert.ok('обучение' in data,
    'в JSON есть блок «обучение» — ОБЯЗАННОСТЬ размещения: Стрельбище '
    + 'категория школа_навыков, контракт «школы» требует равенства для '
    + 'КАЖДОГО NPC школы без ролевого/профильного фильтра (ЭМПИРИЧЕСКАЯ '
    + 'ЭРРАТА .34, шестое подтверждение на форме теста '
    + 'tests/npc-data.test.js «школы»: sorted(тренирует-id) ≡ '
    + '(обучение ? навыки : []); вырез блока красит чужой «школы» + '
    + 'этот T6 — мутация M1; паритет «подсказка»-профиля с блоком — '
    + '000052 Сухарь)');
  assert.deepEqual(Object.keys(data.обучение),
    ['навыки', 'цена_за_уровень', 'цена_переноса_за_уровень'],
    'ключи блока — формат эталона 000052.json');
  const range = readJson(path.join(ROOT, 'assets', 'buildings',
    'archery_range.json'));
  assert.equal(range.id, 10,
    'здание archery_range — id 10 (фикс размещения ТЗ; numeric-путь '
    + '000010.json мёртв с 000318.06)');
  assert.equal(range.категория, 'школа_навыков',
    'категория — школа_навыков (контракт «школы» её и свипует)');
  const trains = range.особые_параметры.тренирует;
  assert.ok(Array.isArray(trains) && trains.length === 2,
    'тренирует Стрельбища — массив из двух ссылок (rename-устойчивая '
    + 'форма: пин идём РЕЗОЛВЕННЫМИ id, не numeric-путями)');
  const trainIds = trains.map((v) => {
    assert.ok(fs.existsSync(path.join(ROOT, v)),
      'ссылка тренирует «' + v + '» существует');
    return readJson(path.join(ROOT, v)).id;
  });
  assert.deepEqual([...trainIds].sort(), [...data.обучение.навыки].sort(),
    'id целей тренирует ≡ навыки обучения (зуб контракта 000211.07 '
    + 'tests/npc-data.test.js «школы»; подмена блока красит чужой '
    + '«школы» + этот T6 — мутация M1)');
  assert.deepEqual([...data.обучение.навыки].sort(), ['accuracy', 'archer'],
    'навыки — РОВНО [accuracy, archer] (≡ тренирует Стрельбища; '
    + 'обоих нет в SKILL_CRAFT_TYPE — SRC-1 молчит, T6-негативы ниже)');
  assert.equal(data.обучение.цена_за_уровень, 50,
    'цена_за_уровень 50 — СВОЯ цена (СЕМЬ различных пар дома 10; набор '
    + 'цен ростера различен — проверено ЖИВЫМ чтением блоков ниже; '
    + 'лестница дома 10 20/35..45/65 ⇒ наша 50/70; равенств цен по '
    + 'постройке ни один контракт не пинует)');
  assert.equal(data.обучение.цена_переноса_за_уровень, 70,
    'цена_переноса_за_уровень 70 — та же своя пара; фиксированных '
    + 'контрактов по шкале нет');
  const pairs = [];
  for (const f of listNpcFiles()) {
    const d2 = readJson(path.join(NDIR, f));
    if (!(d2.постройки || [])
      .includes('assets/buildings/archery_range.json')) continue;
    assert.ok(d2.обучение,
      'у NPC дома 10 блок обучения обязателен (контракт «школы») — ' + f);
    pairs.push(d2.обучение.цена_за_уровень + '/'
      + d2.обучение.цена_переноса_за_уровень);
  }
  assert.equal(new Set(pairs).size, pairs.length,
    'все цены ростера дома 10 различны (живое чтение; факт: '
    + JSON.stringify(pairs.sort()) + ')');
  assert.ok(pairs.includes('50/70'),
    'наша пара 50/70 в ростере дома 10 (факт: ' + JSON.stringify(pairs) + ')');
  const withTrain = data.диалог.filter((o) => o.действие === 'обучение');
  assert.equal(withTrain.length, 0,
    'ДЕЯСТВИЙ «обучение» в диалоге ровно 0 — блок инертен по диалогу '
    + '(паритет 000052: train-вкладка открывается только действием, '
    + 'решение .27; ЛЮБАЯ добавленная train-опция красна — профиль '
    + 'фиксирован ТЗ)');
  assert.equal(C.SKILL_CRAFT_TYPE.accuracy, undefined,
    'accuracy НЕ маппится в вид крафта (src/craft.js) — зуб SRC-1 нас '
    + 'НЕ триггерит');
  assert.equal(C.SKILL_CRAFT_TYPE.archer, undefined,
    'archer НЕ маппится в вид крафта');
  for (const type of Object.keys(C.CRAFT_TYPE_SKILL)) {
    assert.ok(!C.typeBuildings(type).includes(10),
      'дом 10 (Стрельбище) вне зданий рецептов вида «' + type + '» — '
      + 'диск НЕ заставляет витрину; торговли нет и по ТЗ');
  }
  const mirror = NPCS[60];
  assert.ok(mirror && mirror.id === ID,
    'зеркало: 61-я запись range_dummy (canMentorCraft гоняем по зеркалу '
    + '— id-форма построек, прецедент .31/.32/.35/.36/.37/.38/.39)');
  for (const type of Object.keys(C.CRAFT_TYPE_SKILL)) {
    assert.deepEqual(C.canMentorCraft(mirror, { alive: true }, type),
      { ok: false, reason: 'не обучает этот вид крафта' },
      'SRC-1 негатив по ВСЕМ видам крафта (блок обучения есть, '
      + 'craft-навыков нет) — чертежей продавать не обязаны');
  }
  assert.deepEqual(mirror.постройки, [10],
    'зеркало: постройки [10] — sync резолвит ссылку Стрельбища в id');
  assert.equal(mirror.роль, 'мишень',
    'роль в зеркале — «мишень» (фикс ТЗ)');
  assert.deepEqual(mirror.диалог, data.диалог,
    'зеркало NPCS[60].диалог ≡ JSON-диалог бит-в-бит');
  assert.deepEqual(mirror.описание, data.описание,
    'зеркало NPCS[60].описание ≡ JSON');
  assert.deepEqual(mirror.обучение, data.обучение,
    'зеркало NPCS[60].обучение ≡ JSON (резолвинга нет — навыки живут '
    + 'строками id, прецедент .26–.39 T6)');
});

// --- T7: ростер Стрельбища — СЕМВЕРО, Лейна первая; чужие дома не тронуты ---

test('000320.40 T7: npcsForBuilding(NPCS, 10) — СЕМВЕРО Стрельбища в порядке каталога [archery_master, archery_instructor, accuracy_instructor, crossbowman, scout, hunter, range_dummy]; npcForBuilding(10) — по-прежнему Лейна; Кузница (8) — ЧЕТВЕРО не тронута (.34-ростер); Арена (7) — СЕВЕРО, Гладиаторский двор (9) — ОДИН не тронуты', () => {
  const list = N.npcsForBuilding(NPCS, 10);
  assert.deepEqual(list.map((n) => n.id),
    ['archery_master', 'archery_instructor', 'accuracy_instructor',
      'crossbowman', 'scout', 'hunter', ID],
    'Стрельбище (10): Лейна (000007) + наставник Кречет (000056) + '
    + 'наставник Намёт (000057) + рогаточник Канитель (000058) + '
    + 'разведчик Хожалый (000059) + охотник Глухарь (000060) + '
    + 'мишень Пугало (000061), '
    + 'порядок = нумерация файлов; Лейна ПЕРВАЯ (её файл не тронут); '
    + 'факт: ' + JSON.stringify(list.map((n) => n.id)));
  assert.equal(N.npcForBuilding(NPCS, 10).id, 'archery_master',
    'npcForBuilding — ПЕРВЫЙ по номеру файла (Лейна; HUD/«Здесь:» '
    + 'не тронуты — города и cities-снапы не двигаются)');
  const smith = N.npcsForBuilding(NPCS, 8);
  assert.deepEqual(smith.map((n) => n.id),
    ['blacksmith', 'ore_merchant', 'forge_instructor', 'tool_smith'],
    'Кузница (8) — ЧЕТВЕРО не тронута (.34-ростер): '
    + JSON.stringify(smith.map((n) => n.id)));
  const arena = N.npcsForBuilding(NPCS, 7);
  assert.equal(arena.length, 7,
    'Арена (7) — СЕВЕРО не тронута (.31-ростер), факт: ' + arena.length);
  const yard = N.npcsForBuilding(NPCS, 9);
  assert.deepEqual(yard.map((n) => n.id), ['fist_instructor'],
    'Гладиаторский двор (9) — ОДИН не тронут (.26-ростер Костяшки): '
    + JSON.stringify(yard.map((n) => n.id)));
});

// --- T8: [E]-оверлей Стрельбища — ровно 7 dialog-строк ----------------------

test('000320.40 T8: [E]-оверлей Стрельбища — ровно 7 строк: dialog (Лейна), dialog:archery_instructor (Кречет), dialog:accuracy_instructor (Намёт), dialog:crossbowman (Канитель), dialog:scout (Хожалый), dialog:hunter (Глухарь), dialog:range_dummy (Пугало); эффектов у дома 10 нет — effectIds пуст; крафт-строки НЕТ (10 ∉ зданий рецептов — под Game.Craft wiring список всё равно 7 строк); подписи «Диалог: Лейна»/…/«Диалог: Пугало»; хоткеи Digit1..7 — граница /^Digit([1-9])$/ не превышена', () => {
  const b = readJson(path.join(ROOT, 'assets', 'buildings',
    'archery_range.json'));
  assert.equal(b.id, 10, 'здание archery_range — id 10 (фикс размещения)');
  assert.equal(b.категория, 'школа_навыков',
    'категория — школа_навыков (контракт «школы» её и свипует)');
  assert.ok(!('10' in BE.EFFECTS),
    'у дома 10 эффектов НЕТ (EFFECTS не содержит ключа «10») — '
    + 'effectIds(building) пуст на голом диске');
  assert.deepEqual(BE.effectIds(b), [],
    'effectIds Стрельбища — [] (запись дома 10 в BUILDINGS-дереве '
    + 'эффектов)');
  const prevGame = globalThis.Game;
  globalThis.Game = { Craft: C };
  let rows;
  try {
    const list = N.npcsForBuilding(NPCS, 10);
    rows = BE.buildingActions(b, list, { day: 5 });
  } finally {
    if (prevGame === undefined) delete globalThis.Game;
    else globalThis.Game = prevGame;
  }
  assert.equal(rows.length, 7,
    'список здания 10 = dialog-строки по каждому NPC (РОВНО СЕМЬ после '
    + '.40) БЕЗ крафт-строки (не дом 8: рецептов на Стрельбище нет), '
    + 'факт: ' + JSON.stringify(rows.map((r) => r.id)));
  assert.deepEqual(rows.map((r) => r.id),
    ['dialog', 'dialog:archery_instructor', 'dialog:accuracy_instructor',
      'dialog:crossbowman', 'dialog:scout', 'dialog:hunter',
      'dialog:' + ID],
    'порядок строк = нумерация файлов каталога, Лейна по-прежнему '
    + 'ПЕРВАЯ, суффикс «:<id>» со второй строки — механизм '
    + 'building-effects); факт: '
    + JSON.stringify(rows.map((r) => r.id)));
  assert.deepEqual(rows.map((r) => r.имя),
    ['Диалог: Лейна', 'Диалог: Кречет', 'Диалог: Намёт',
      'Диалог: Канитель', 'Диалог: Хожалый', 'Диалог: Глухарь',
      'Диалог: ' + NAME],
    'подписи — «Диалог: <имя>», факт: '
    + JSON.stringify(rows.map((r) => r.имя)));
  assert.deepEqual(rows.map((r) => r.npcId),
    ['archery_master', 'archery_instructor', 'accuracy_instructor',
      'crossbowman', 'scout', 'hunter', ID],
    'каждая dialog-строка несёт npcId своего NPC (роутинг клика)');
  for (let i = 0; i < rows.length; i++) {
    assert.match('Digit' + (i + 1), /^Digit([1-9])$/,
      'хоткеи Digit1..' + rows.length + ' — общий механизм '
      + 'src/building-ui.js /^Digit([1-9])$/ (седьмая строка в границе)');
  }
});

// --- T9: forbid-цепь под реестром 000424 -------------------------------------

test('000320.40 T9: forbid-цепь под реестром (000424) — звено "40" существует, РОВНО 4 фразы и ≡ дисковой MINE-константе файла .39 (машинное извлечение, EXPECT_ADDS-третьих-копий НЕ заводим), инлайн-гард T5 этого файла ≡ aggregate(реестра) ЧЕРЕЗ МОЁ звено "40" (ре-пин 000320.41: хвост — .41), длина — ФОРМУЛОЙ базис + 4×число_звеньев_через_40 (литерал числа запрещён), prev (агрегат до звена "39") ⊆ own, анти-вакуум: инжект каждой prev-фразы ловится сканером и вырез элемента guard-копии красит предикат, СВОИ 4 оборота НЕ в guard-массиве, ≡ звену "41" реестра (резерв погашен коммитом .41) и не пересекаются substring-в-обе-стороны ни с цепью (агрегат + литералы всех звеньев и legacy-массивов tests/npc-000320.*.test.js), ни с текстами каталога assets/npc', () => {
  const ledger = readLedger();
  assert.ok(Object.prototype.hasOwnProperty.call(ledger.links, '40'),
    'RED: звено "40" ещё не дописано в реестр — его пишет коммит .40 '
    + '(append-only; содержимое — РОВНО 4 фразы prev-звена .39)');
  const prevFile = path.join(__dirname, 'npc-000320.39.test.js');
  assert.ok(fs.existsSync(prevFile),
    'предыдущее звено цепи tests/npc-000320.39.test.js существует');
  const discMine39 = extractMineFrom(prevFile);
  assert.deepEqual(ledger.links['40'], discMine39,
    'звено "40" ≡ дисковой MINE-константе файла .39 (Глухарь; '
    + 'провенанс зуба 000424 T4; машинное извлечение — ручной '
    + 'транскрипции нет); факт диска: ' + JSON.stringify(discMine39));
  const own = extractGuardAt(__filename, '000320.40 T5:');
  const agg = aggregateThrough(ledger, SELF_LINK);
  assert.deepEqual(own, agg,
    'инлайн-гард этого файла ≡ aggregate(реестра) ЧЕРЕЗ звено "' + SELF_LINK
    + '" ПОБЛАГО (и порядок, и значения; prev = ledger, 000424; полный '
    + 'агрегат ≡ гарду хвоста — зуб 000424 T5; ре-пин 000320.41)');
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
    + '.41 — ре-пин 000320.41)');
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
    if (f === '000061.json') continue;
    const d = readJson(path.join(NDIR, f));
    const joined = [d.описание, ...d.диалог.map((o) => o.текст),
      ...(d.квесты || []).map((q) => (q.название || '') + ' '
        + (q.описание || ''))].join(' ');
    for (const m of MINE) {
      assert.ok(!joined.includes(m),
        'свой оборот «' + m + '» уже живёт в чужих текстах ' + f
        + ' (свои 4 оборота — только в 000061.json)');
    }
  }
});

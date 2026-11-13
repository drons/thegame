// Задача 000320.16: «Маг-наставник» — id magic_instructor, имя
// «Пробник» (Магазин магии, 3-й NPC постройки; 16-я из 100 дочерних
// 000320).
//
// Контракт (ТЗ tasks/done/000320.16.md; механизм мульти-NPC —
// 000320.01, spec/npc.md «Несколько NPC на постройку»,
// memory/000320-npcs-batch.md):
//   * assets/npc/000034.json — id magic_instructor (резерв ТЗ, память-
//     файл фиксирован ТЗ тем же именем; sweep по 33 занятым —
//     свободен), имя «Пробник» (выбор агента: прозвище по делу — он
//     «пробует» ученика прежде, чем выбрать школу, как пробник
//     пробует металл; прецеденты не-личного имени 000018 «Кочевник»,
//     прозвища 000026 «Опилка» … 000032 «Жгут», 000033 «Пергамент»),
//     роль «наставник» (фикс ТЗ; та же точная строка, что у .10/.13 —
//     свипов уникальности ролей нет, Т4 пишет точное равенство),
//     постройка assets/buildings/magic_shop.json (Магазин магии — ТРЕТИЙ
//     NPC: Зира ПЕРВАЯ, Пергамент .15 ВТОРОЙ, npcForBuilding(4)
//     продолжает возвращать Зиру), хук истории «Учит магии: школа —
//     по таланту ученика» (последнее предложение описания, с
//     заглавной — прецеденты .02–.15);
//   * профиль — ОБУЧЕНИЕ (клон механики .10 «Глыба»: форма диалога +
//     блок «обучение» формата assets/npc/000005.json): РОВНО 3 опции,
//     действия ⊆ {подсказка, обучение}, ≥1 «обучение», РОВНО одна с
//     {харизма:3} (прецедент hint_stone .10 — НЕ «проверка»);
//   * обучение: навыки РОВНО [firelord, icelord] (оба ∈ assets/skills,
//     secondary — свип целостности npc-data.test; «школа — по таланту»
//     = ДВЕ школы на выбор; двойного мастера этих школ в каталоге нет;
//     в SRC-1/canMentorCraft не попадает — SKILL_CRAFT_TYPE =
//     {forge, heavy, alchemy, nature, dexterity}, торговля чертежом НЕ
//     требуется — выбор nature был бы ПЛОДЕМ торговли, решение в
//     memory/000320-magic_instructor.md), цены 25/40 — коридор .10 и
//     000005;
//   * блоков квесты/торговля/найм НЕТ (счётчики npc-refs торговля 67 /
//     goal 2 / reward 5 / сумма 74 / уникальные 44 и R7 торгующих 14
//     НЕ растут — неторговец свипам невидим, мутация M6);
//   * опций с «для» — РОВНО 0: контракт A8a (tests/npc-dialog-scope) —
//     динамический свип ждёт 0 «для» у всех, кроме Берты/Элдиры/Корда;
//     добавление «для» = ослабление пина, запрещено (мутация M1);
//   * тема диалога — проба таланта/огонь и мороз/выбор школы; «магич»,
//     «школ», «ученик», «настав» НЕ банятся — категории своего дома и
//     своей роли (правило «брон» .09/.10); к СВОЕМУ хуку запрет-лист не
//     применяется; запрет-лист ТЕКСТОВ диалога 40 = дисковый список .15
//     (37) + СВОИ 3 оборота Пергамента (сосед по дому 4): «между
//     строк», «при дневном свете», «чернила помнят» (зарезервированы в
//     memory/000320-scroll_merchant.md для .16+); «голем»/«трениров»
//     (.10) не банятся — категории чужой школы, формулировок не
//     пересекаем;
//   * [E]-оверлей Магазина магии — РОВНО ТРИ dialog-строки в порядке
//     каталога: 'dialog' (Зира) → 'dialog:scroll_merchant' (Пергамент)
//     → 'dialog:magic_instructor' (Пробник); хоткеи Digit1..3 — общий
//     механизм src/building-ui.js /^Digit([1-9])$/ по индексу строки;
//     ре-пин T7/T8 tests/npc-000320.15.test.js (прецедент .12/.13/.14).
//
// РЕ-ПИН 000320.17 (Переписчик/scribe «Грифель» — ЧЕТВЁРТЫЙ NPC
// дома 4, 000035.json): T1 каталог/зеркало 34→35; T7 ростер дома 4
// ТРИ→ЧЕТЫРЕ [magic_merchant, scroll_merchant, magic_instructor,
// scribe]; T8 оверлей РОВНО ТРИ→ЧЕТЫРЕ dialog-строки (хоткеи
// Digit1..4); этот же ре-пин идёт дальше в .15 T7/T8.
//
// КРАСНЫЕ (TDD): T1..T8 красные до зелёной стадии (000034.json нет,
// каталог 33, ростер дома 4 — ДВА NPC, оверлей 2 строки), без краха
// загрузки.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validateData } = require('./json-schema.js');

const ROOT = path.join(__dirname, '..');
const NDIR = path.join(ROOT, 'assets', 'npc');
const NEW = path.join(NDIR, '000034.json');
const SCHEMA = JSON.parse(
  fs.readFileSync(path.join(NDIR, 'schema.json'), 'utf8'));

const N = require('../src/npc.js');
const { NPCS } = require('../src/npc-data.js');
const BE = require('../src/building-effects.js');

const HOOK = 'Учит магии: школа — по таланту ученика';
const ID = 'magic_instructor';
const NAME = 'Пробник';

function listNpcFiles() {
  return fs.readdirSync(NDIR)
    .filter((f) => /^\d{6}\.json$/.test(f))
    .sort();
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// --- T1: размер каталога ---------------------------------------------------

test('T1: каталог — ровно 45 файлов 000001..000045 подряд; зеркало NPCS 45 записей с magic_instructor', () => {
  const files = listNpcFiles();
  assert.equal(files.length, 45,
    'в каталоге NPC 45 файлов (000320.13: +Алхимик-наставник; 000320.14: '
    + '+Фельдшер; 000320.15: +Торговец свитками; 000320.16: +Маг-'
    + 'наставник; 000320.17: +Переписчик; 000320.18: +Странствующий торговец; 000320.19: +Торговец специями; 000320.20: +Торговец каравана; 000347.02: +жрец солнца, жрица луны, горный жрец; 000320.21: +Проводник; 000320.22: +Перекати; 000320.23: +Сарбон; 000320.24: +Просол), факт: ' + files.length);
  for (let i = 0; i < files.length; i++) {
    assert.equal(files[i],
      String(i + 1).padStart(6, '0') + '.json',
      'нумерация подряд без пропусков: индекс ' + i);
  }
  assert.equal(NPCS.length, 45,
    'зеркало src/npc-data.js — 45 записей (sync не прогнан?), факт: '
    + NPCS.length);
  const last = NPCS[33];
  assert.ok(last, '34-я запись зеркала существует');
  assert.equal(last.id, ID,
    '34-я запись зеркала — magic_instructor (порядок = нумерация файлов)');
});

// --- T2: 000034.json валиден по схеме + порядок ключей + roundtrip ---------

test('T2: assets/npc/000034.json валиден по schema; ключи в порядке эталона ОБУЧЕНИЕ .10 (id, имя, роль, описание, постройки, диалог, обучение); roundtrip-канон; негативы — мимо схемы', () => {
  assert.ok(fs.existsSync(NEW),
    'RED: assets/npc/000034.json отсутствует (NPC задачи ещё не создан)');
  const data = readJson(NEW);
  assert.deepEqual(validateData(SCHEMA, data, 'npc/000034'), [],
    '000034.json обязан проходить assets/npc/schema.json');
  assert.deepEqual(Object.keys(data),
    ['id', 'имя', 'роль', 'описание', 'постройки', 'диалог', 'обучение'],
    'порядок ключей — как у эталона ОБУЧЕНИЕ .10 (000028) и 000005: '
    + 'id, имя, роль, описание, постройки, диалог, обучение — обучение '
    + 'ПОСЛЕ диалога, блоков торговля/квесты/найм нет');
  const raw = fs.readFileSync(NEW, 'utf8');
  assert.equal(raw, JSON.stringify(data, null, 2) + '\n',
    '000034.json — roundtrip JSON.stringify(obj,null,2)+перевод строки');
  const extraKey = JSON.parse(JSON.stringify(data));
  extraKey.цена = 10;
  assert.notDeepEqual(validateData(SCHEMA, extraKey, 'npc/extra'), [],
    'посторонний ключ «цена» — additionalProperties false, обязан отваливаться');
  const badCharisma = JSON.parse(JSON.stringify(data));
  const reqOpt = badCharisma.диалог.find((o) => o.требования);
  assert.ok(reqOpt, 'есть опция с требованиями (прецедент hint_stone .10)');
  reqOpt.требования.харизма = 0;
  assert.notDeepEqual(validateData(SCHEMA, badCharisma, 'npc/badcharisma'), [],
    'требование харизма 0 — вне схемы (minimum 1)');
  const badAction = JSON.parse(JSON.stringify(data));
  badAction.диалог[0].действие = 'дар';
  assert.notDeepEqual(validateData(SCHEMA, badAction, 'npc/badaction'), [],
    'действие «дар» — вне enum схемы');
  const badPath = JSON.parse(JSON.stringify(data));
  badPath.постройки = ['000004.json'];
  assert.notDeepEqual(validateData(SCHEMA, badPath, 'npc/badpath'), [],
    'постройки без пути assets/buildings/ — вне паттерна схемы');
  const badSkillCase = JSON.parse(JSON.stringify(data));
  badSkillCase.обучение.навыки = ['Богус'];
  assert.notDeepEqual(validateData(SCHEMA, badSkillCase, 'npc/badskill'), [],
    'навык обучения «Богус» — вне assets/skills и вне паттерна '
    + '^[a-z][a-z0-9_]*$ схемы');
  const emptySkills = JSON.parse(JSON.stringify(data));
  emptySkills.обучение.навыки = [];
  assert.notDeepEqual(validateData(SCHEMA, emptySkills, 'npc/emptyskills'), [],
    'навыки [] — вне схемы (minItems 1)');
  const legacyTrain = JSON.parse(JSON.stringify(data));
  legacyTrain.обучение = {
    навыки: ['firelord'], цена: 25, перенос: 40,
  };
  assert.notDeepEqual(validateData(SCHEMA, legacyTrain, 'npc/legacytrain'), [],
    'legacy-вход обучения (цена/перенос вместо цена_за_уровень/'
    + 'цена_переноса_за_уровень) — невалиден (required + '
    + 'additionalProperties false)');
  const badPrice = JSON.parse(JSON.stringify(data));
  badPrice.обучение.цена_за_уровень = 0;
  assert.notDeepEqual(validateData(SCHEMA, badPrice, 'npc/badprice'), [],
    'цена_за_уровень 0 — вне схемы (minimum 1)');
});

// --- T3: id и имя уникальны (sweep) ----------------------------------------

test('T3: id magic_instructor и имя «Пробник» уникальны в sweep каталога', () => {
  assert.ok(fs.existsSync(NEW), 'RED: assets/npc/000034.json отсутствует');
  const ids = new Set();
  const names = new Set();
  for (const f of listNpcFiles()) {
    const d = readJson(path.join(NDIR, f));
    assert.ok(!ids.has(d.id), 'дубликат id «' + d.id + '» (файл ' + f + ')');
    assert.ok(!names.has(d.имя), 'дубликат имени «' + d.имя + '» (файл ' + f + ')');
    ids.add(d.id);
    names.add(d.имя);
  }
  assert.ok(ids.has(ID), 'id magic_instructor в каталоге');
  assert.ok(names.has(NAME), 'имя «Пробник» в каталоге');
});

// --- T4: роль-фикс, описание с хуком и уникально ----------------------------

test('T4: роль РОВНО «наставник» (точная строка ТЗ; та же, что у .10/.13 — свипов уникальности ролей нет); описание непустое, хук «Учит магии: школа — по таланту ученика» — последнее предложение, и НЕ копия описания другого NPC', () => {
  assert.ok(fs.existsSync(NEW), 'RED: assets/npc/000034.json отсутствует');
  const data = readJson(NEW);
  assert.ok(typeof data.описание === 'string' && data.описание.trim() !== '',
    'описание непустое');
  assert.equal(data.роль, 'наставник',
    'роль — фикс-строка «наставник» (ТЗ); Т4 пишет точное равенство '
    + '(составные «наставник-боец/...» — другие роли)');
  assert.ok(data.описание.includes(HOOK),
    'хук истории «' + HOOK + '» (ТЗ) в описании дословно');
  assert.ok(data.описание.endsWith(HOOK + '.'),
    'хук — ПОСЛЕДНЕЕ предложение описания (с заглавной, с точкой на '
    + 'конце — прецеденты .02–.15); факт: '
    + JSON.stringify(data.описание.slice(-70)));
  for (const f of listNpcFiles()) {
    if (f === '000034.json') continue;
    const d = readJson(path.join(NDIR, f));
    assert.notEqual(d.описание, data.описание,
      'описание совпадает с ' + f + ' (не копия существующего)');
  }
});

// --- T5: диалог — профиль обучение, без «для», запрет-лист -------------------

test('T5: диалог валиден по схеме, РОВНО 3 опции как у эталона .10, ≥1 «обучение», действия ⊆ {подсказка, обучение}, ровно одна с {харизма:3}, id опций уникальны, опций с «для» — ровно 0, запрет-лист 40 подстрок (дисковые 37 из .15 + обороты Пергамента) по ТЕКСТАМ диалога', () => {
  assert.ok(fs.existsSync(NEW), 'RED: assets/npc/000034.json отсутствует');
  const data = readJson(NEW);
  assert.ok(Array.isArray(data.диалог) && data.диалог.length >= 1,
    'диалог непустой (schema minItems 1)');
  assert.equal(data.диалог.length, 3,
    'диалог — ровно 3 опции (prives / обучение / hint — форма эталона '
    + 'ОБУЧЕНИЕ .10 «Глыба»), факт: ' + data.диалог.length);
  const ACTIONS = SCHEMA.properties.диалог.items.properties.действие.enum;
  for (const o of data.диалог) {
    assert.ok(ACTIONS.includes(o.действие),
      'действие «' + o.действие + '» вне enum схемы');
    const errs = validateData(SCHEMA.properties.диалог.items, o, 'диалог');
    assert.deepEqual(errs, [],
      'опция «' + o.id + '» — вне схемы диалога: ' + JSON.stringify(errs));
  }
  assert.ok(data.диалог.some((o) => o.действие === 'обучение'),
    'профиль «обучение» — хотя бы одна опция действия «обучение»');
  assert.equal(
    data.диалог.filter((o) => o.действие !== 'подсказка'
      && o.действие !== 'обучение').length, 0,
    'профиль ОБУЧЕНИЕ (без квестов/торговли/найма): опций с действием '
    + 'вне {подсказка, обучение} — ровно 0');
  const ids = data.диалог.map((o) => o.id);
  assert.equal(new Set(ids).size, ids.length, 'id опций диалога уникальны');
  assert.equal(data.диалог.filter((o) => o.для !== undefined).length, 0,
    'опций с «для» — ровно 0: наставник учит каждого; добавление «для» '
    + 'требует внесения в исключения A8a (tests/npc-dialog-scope) — '
    + 'ослабление пина, запрещено');
  const withReq = data.диалог.filter((o) => o.требования !== undefined);
  assert.equal(withReq.length, 1,
    'ровно одна опция с требованиями (прецедент hint_wood/hint_old/'
    + 'hint_blade/hint_collection/hint_anvil/hint_march/hint_ring/'
    + 'hint_weight/hint_dry/hint_stone/hint_fire/hint_hand)');
  assert.deepEqual(withReq[0].требования, { харизма: 3 },
    'требование опции — {харизма: 3} (харизма-прецедент батча, НЕ «проверка»)');
  const texts = data.диалог.map((o) => o.текст).join(' ');
  for (const w of ['хвостовик', 'наковальн', 'штампов', 'коллекци', 'позолот',
    'старые походы', 'арен', 'жалован', 'знамен', 'задаток', 'табель',
    'метл', 'стена клинков', 'звон', 'дребезг', 'нагрудник', 'закалк',
    'трещин', 'молотк', 'примеря',
    'старые дела', 'храме солнца', 'старейшин', 'посмееш',
    'на весах', 'сонной мяты', 'клонит в сон',
    'завянет', 'пучками', 'почерневш', 'разотрёшь',
    'где болит', 'выше раны', 'доживают до старости',
    'не бывает лишнего', 'с далёких гор', 'договоримся о цене',
    'между строк', 'при дневном свете', 'чернила помнят']) {
    assert.ok(!texts.includes(w),
      'тема чужого NPC (.04 «старые походы»/арена — «арен», .05 '
      + 'коллекция, .06 ковка/хвостовик, .07 наём/жалованье, .08 '
      + 'метла/стена клинков, .09 броня-звонок, .10 големы; тексты '
      + 'Милы — «старые дела»/«храм солнца»/«старейшина»/«посмеешь»; '
      + 'обороты Отвара — «на весах»/«сонной мяты»/«клонит в сон»; '
      + 'обороты Травницы — «завянет»/«пучками»/«почерневш»/«разотрёшь»; '
      + 'обороты Жгута — «где болит»/«выше раны»/«доживают до '
      + 'старости»; обороты Зиры (хозяйка дома 4) — «не бывает '
      + 'лишнего»/«с далёких гор»/«договоримся о цене»; обороты '
      + 'Пергамента (сосед по дому 4, .15) — «между строк»/«при '
      + 'дневном свете»/«чернила помнят») не дублируется: подстрока «'
      + w + '»');
  }
});

// --- T6: профиль-гарант: обучение формата 000005, две школы, тон дома --------

test('T6: блок «обучение» — форма 000005 (ключи навыки/цена_за_уровень/цена_переноса_за_уровень), навыки РОВНО [firelord, icelord] и резолвятся в assets/skills (по одному файлу, secondary — свип npc-data), цены коридора .10/000005 (25/40); блоков торговля/квесты/найм НЕТ (в JSON и зеркале); постройки [assets/buildings/magic_shop.json] как на диске базы, зеркало: постройки [4], обучение/диалог/описание deepEqual', () => {
  assert.ok(fs.existsSync(NEW), 'RED: assets/npc/000034.json отсутствует');
  const data = readJson(NEW);
  assert.deepEqual(data.постройки, ['assets/buildings/magic_shop.json'],
    'постройка — Магазин магии (фикс ТЗ; путь на базе numeric-именован '
    + '— assets/buildings/magic_shop.json)');
  const train = data.обучение;
  assert.ok(train && typeof train === 'object',
    'в JSON есть блок «обучение» (профиль обучения)');
  assert.deepEqual(Object.keys(train),
    ['навыки', 'цена_за_уровень', 'цена_переноса_за_уровень'],
    'ключи блока обучения — порядок и состав 000005 (Карк)');
  assert.deepEqual(train.навыки, ['firelord', 'icelord'],
    'навыки — РОВНО [firelord, icelord] (ТЗ «школа — по таланту» = '
    + 'ДВЕ школы огня и мороза на выбор; ни одна не закреплена за другим '
    + 'наставником; вне SKILL_CRAFT_TYPE — SRC-1 торговлю чертежом НЕ '
    + 'требует); факт: ' + JSON.stringify(train.навыки));
  const skillDir = path.join(ROOT, 'assets', 'skills');
  const skillFiles = fs.readdirSync(skillDir)
    .filter((f) => /^\d{6}\.json$/.test(f));
  for (const sk of train.навыки) {
    const found = skillFiles
      .filter((f) => readJson(path.join(skillDir, f)).id === sk);
    assert.equal(found.length, 1,
      'навык «' + sk + '» существует в assets/skills ровно одним файлом');
    assert.equal(readJson(path.join(skillDir, found[0])).type, 'secondary',
      'навык «' + sk + '» — вторичный (свип целостности '
      + 'tests/npc-data.test «только вторичные навыки» обучения)');
  }
  assert.equal(train.цена_за_уровень, 25,
    'цена_за_уровень — 25: коридор прецедентов обучения (.10 Глыба и '
    + '000005 Карк — 25/40; Торн/Лейна/Фикка 20/35, Элдира 30/50); '
    + 'факт: ' + train.цена_за_уровень);
  assert.equal(train.цена_переноса_за_уровень, 40,
    'цена_переноса_за_уровень — 40: коридор прецедентов .10/000005; '
    + 'факт: ' + train.цена_переноса_за_уровень);
  for (const key of ['цена_за_уровень', 'цена_переноса_за_уровень']) {
    assert.ok(Number.isInteger(train[key]) && train[key] > 0,
      key + ' — целое > 0 (схема 1..10000), факт: ' + train[key]);
  }
  for (const block of ['квесты', 'торговля', 'найм']) {
    assert.ok(!(block in data),
      'в JSON нет блока «' + block + '»: профиль обучение без торговли/'
      + 'квестов — счётчики npc-refs торговля 67 / goal 2 / reward 5 / '
      + 'сумма 74 / уникальные 44 и R7 торгующих 14 не растут');
  }
  const mirror = NPCS[33];
  assert.ok(mirror && mirror.id === ID,
    'зеркало: 34-я запись magic_instructor');
  assert.equal(mirror.роль, 'наставник',
    'роль в зеркале — «наставник» (фикс ТЗ)');
  for (const block of ['квесты', 'торговля', 'найм']) {
    assert.ok(!(block in mirror),
      'в зеркале нет блока «' + block + '» (следует из JSON)');
  }
  assert.deepEqual(mirror.обучение, train,
    'зеркало: блок обучения — ПАСС-ЧЕРЕЗ ≡ JSON (навыки уже id-строки, '
    + 'sync не резолвит)');
  assert.deepEqual(mirror.постройки, [4],
    'зеркало: постройки [4] — sync резолвит ссылку Магазина магии в id');
  assert.deepEqual(mirror.диалог, data.диалог,
    'зеркало NPCS[33].диалог ≡ JSON-диалог бит-в-бит');
  assert.deepEqual(mirror.описание, data.описание,
    'зеркало NPCS[33].описание ≡ JSON');
});

// --- T7: ростер дома 4 — ТРИ записи, Зира первая -----------------------------

test('T7: npcsForBuilding(NPCS, 4) — ЧЕТЫРЕ записи Магазина магии в порядке каталога [magic_merchant, scroll_merchant, magic_instructor, scribe]; npcForBuilding(4) — по-прежнему Зира; Аптекарь — ПЯТЬ, Бронник — ТРИ и Оружейная — ДЕВЯТЬ не тронуты', () => {
  const list = N.npcsForBuilding(NPCS, 4);
  assert.deepEqual(list.map((n) => n.id),
    ['magic_merchant', 'scroll_merchant', ID, 'scribe'],
    'Магазин магии (4): Зира (000004) + Торговец свитками (000033) + '
    + 'Маг-наставник (000034) + Переписчик (000035, ре-пин 000320.17), '
    + 'порядок = нумерация файлов; факт: '
    + JSON.stringify(list.map((n) => n.id)));
  assert.equal(N.npcForBuilding(NPCS, 4).id, 'magic_merchant',
    'npcForBuilding — ПЕРВЫЙ по номеру файла (Зира; HUD/«Здесь:» не тронуты)');
  const apteka = N.npcsForBuilding(NPCS, 3);
  assert.deepEqual(apteka.map((n) => n.id),
    ['apothecary', 'brewer', 'herbalist', 'alchemy_instructor',
      'village_doctor'],
    'Аптекарь (3) — ПЯТЬ NPC не тронуты (новый NPC — Магазин магии): '
    + JSON.stringify(apteka.map((n) => n.id)));
  const brunnik = N.npcsForBuilding(NPCS, 2);
  assert.deepEqual(brunnik.map((n) => n.id),
    ['armor_merchant', 'armor_specialist', 'golem_instructor'],
    'Бронник (2) — ТРИ NPC не тронуты: '
    + JSON.stringify(brunnik.map((n) => n.id)));
  const armory = N.npcsForBuilding(NPCS, 1);
  assert.deepEqual(armory.map((n) => n.id),
    ['weapons_merchant', 'blade_merchant', 'fencing_instructor',
      'duelist', 'veteran_blade', 'sword_collector', 'blade_smith',
      'ex_mercenary', 'armory_apprentice'],
    'Оружейная (1) — ДЕВЯТЬ NPC не тронута: '
    + JSON.stringify(armory.map((n) => n.id)));
});

// --- T8: оверлей дома 4 — ровно 3 dialog-строки ------------------------------

test('T8: [E]-оверлей Магазина магии — ровно 4 строки: dialog (Зира), dialog:scroll_merchant (Пергамент), dialog:magic_instructor (Пробник), dialog:scribe (Грифель) — ре-пины 000320.15 T8 (ТРИ, был пин ДВЕ) и 000320.17 (ЧЕТЫРЕ)', () => {
  const b = readJson(path.join(ROOT, 'assets', 'buildings', 'magic_shop.json'));
  const list = N.npcsForBuilding(NPCS, 4);
  const rows = BE.buildingActions(b, list, { day: 5 });
  assert.deepEqual(rows.map((r) => r.id),
    ['dialog', 'dialog:scroll_merchant', 'dialog:' + ID, 'dialog:scribe'],
    'у здания 4 эффектов нет — список = dialog-строки по каждому NPC; '
    + 'факт: ' + JSON.stringify(rows.map((r) => r.id)));
  assert.deepEqual(rows.map((r) => r.имя),
    ['Диалог: Зира', 'Диалог: Пергамент', 'Диалог: ' + NAME, 'Диалог: Грифель'],
    'подписи — «Диалог: <имя>», факт: ' + JSON.stringify(rows.map((r) => r.имя)));
  assert.deepEqual(rows.map((r) => r.npcId),
    ['magic_merchant', 'scroll_merchant', ID, 'scribe'],
    'каждая строка несёт npcId своего NPC (роутинг клика); хоткеи '
    + 'Digit1..4 — общий механизм /^Digit([1-9])$/ (src/building-ui.js) '
    + 'по индексу строки');
});

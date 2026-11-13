// Задача 000320.21: «Проводник» — id path_guide, имя «Стрелка» (Лавка
// странника, 5-й NPC постройки; 21-я из 100 дочерних 000320).
//
// Контракт (ТЗ tasks/pending/000320.21.md; механизм мульти-NPC —
// 000320.01, spec/npc.md «Несколько NPC на постройку»,
// memory/000320-npcs-batch.md; профиль-эталон ЧИСТОЙ ПОДСКАЗКИ —
// .14 «Жгут» / .17 «Грифель»):
//   * assets/npc/000042.json — id path_guide (свип по 41 занятым —
//     свободен), имя «Стрелка» (выбор агента: прозвище по дорожной
//     примете — стрелка указателя; прецеденты не-личных имён и
//     прозвищ 000018 «Кочевник», 000026 «Опилка» … 000038 «Барыш»),
//     роль «проводник» (фикс ТЗ — свипов уникальности ролей нет,
//     Т4 пишет точное равенство), постройка
//     assets/buildings/wanderer_shop.json (Лавка странника — ТЗ-путь
//     000005.json мёртв с 000318.06: zero-sweep tests/
//     buildings-rename-000318.06.test.js T5; путь — SLUG), 5-й NPC
//     дома: Хольд ПЕРВЫЙ, npcForBuilding(5) продолжает возвращать
//     Хольда; хук истории «Знает карту лучше картографа» —
//     последнее предложение описания (прецеденты .02–.20);
//   * профиль диалога — ЧИСТАЯ подсказка (форма эталона .14/.17):
//     РОВНО 3 опции, ВСЕ действием «подсказка» (prives / hint_sign /
//     hint_map), РОВНО одна (последняя) с {харизма:3} — харизма-
//     прецедент батча (.15 hint_hand / .16 hint_talent / .17), НЕ
//     «проверка»; блоков обучение/торговля/квесты/найм НЕТ —
//     счётчики npc-refs торговля 234 / goal 2 / reward 5 / сумма
//     202-уникальных НЕ растут, item-prices-000322 R7=20 не растёт
//     (неторговец свипам невидим: `if (!npc.торговля) continue`);
//   * опций с «для» — РОВНО 0: контракт A8a (tests/npc-dialog-scope)
//     — динамический свип ждёт 0 «для» у всех, кроме Берты/Элдиры/
//     Корда; добавление «для» = ослабление пина, запрещено (мутация
//     M2);
//   * тема диалога — дороги/указатели/броды/переправы; «дорог»,
//     «путев», «брод», «троп» НЕ банятся — категории своей темы
//     (правило «брон» .09); к СВОЕМУ хуку запрет-лист не применяется
//     («карту»/«карта» в 67 нет); запрет-лист ТЕКСТОВ диалога 67 =
//     дисковый список .20 T5 (63, с живым «храме солнца» — правило
//     цепочки memory/000364-npc20-t5-matcher.md) + 4 зарезерви-
//     рованных оборота Барыша (memory/000320-caravan_trader.md для
//     .21+: «три металла на прилавке», «три монеты в коше», «два
//     языка служат», «монету берут на глаз»); СВОИ 4 оборота
//     зарезервированы для .22+ — memory/000320-path_guide.md (.22
//     ОБЯЗАН += их в свой список);
//   * [E]-оверлей Лавки странника — РОВНО ПЯТЬ dialog-строк в
//     порядке каталога: 'dialog' (Хольд) → 'dialog:wanderer_trader'
//     (Хомут) → 'dialog:spice_trader' (Шафран) → 'dialog:
//     caravan_trader' (Барыш) → 'dialog:path_guide' (Стрелка);
//     хоткеи Digit1..5 — общий механизм src/building-ui.js
//     /^Digit([1-9])$/ по индексу строки; пин создан в .18 (ДВЕ),
//     поднят .19 (ТРИ), .20 (ЧЕТЫРЕ) и здесь (ПЯТЬ) — ре-пинуты
//     T7/T8 всех трёх файлов (предписание .20 T8 реализовано здесь).
//
// КРАСНЫЕ (TDD): T1..T8 красные до зелёной стадии (000042.json нет,
// каталог 41, ростер дома 5 — ЧЕТЫРЕ NPC, оверлей 4 строки), без
// краха загрузки.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validateData } = require('./json-schema.js');

const ROOT = path.join(__dirname, '..');
const NDIR = path.join(ROOT, 'assets', 'npc');
const NEW = path.join(NDIR, '000042.json');
const SCHEMA = JSON.parse(
  fs.readFileSync(path.join(NDIR, 'schema.json'), 'utf8'));

const N = require('../src/npc.js');
const { NPCS } = require('../src/npc-data.js');
const BE = require('../src/building-effects.js');

const HOOK = 'Знает карту лучше картографа';
const ID = 'path_guide';
const NAME = 'Стрелка';

function listNpcFiles() {
  return fs.readdirSync(NDIR)
    .filter((f) => /^\d{6}\.json$/.test(f))
    .sort();
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// --- T1: размер каталога ---------------------------------------------------

test('T1: каталог — ровно 44 файла 000001..000044 подряд; зеркало NPCS 44 записи с path_guide', () => {
  const files = listNpcFiles();
  assert.equal(files.length, 44,
    'в каталоге NPC 44 файла (000320.17: +Переписчик; 000320.18: '
    + '+Странствующий торговец; 000320.19: +Торговец специями; '
    + '000320.20: +Торговец каравана; 000347.02: +жрец солнца, жрица '
    + 'луны, горный жрец; 000320.21: +Проводник; 000320.22: +Перекати; 000320.23: +Сарбон), факт: ' + files.length);
  for (let i = 0; i < files.length; i++) {
    assert.equal(files[i],
      String(i + 1).padStart(6, '0') + '.json',
      'нумерация подряд без пропусков: индекс ' + i);
  }
  assert.equal(NPCS.length, 44,
    'зеркало src/npc-data.js — 44 записи (sync не прогнан?), факт: '
    + NPCS.length);
  const last = NPCS[41];
  assert.ok(last, '42-я запись зеркала существует');
  assert.equal(last.id, ID,
    '42-я запись зеркала — path_guide (порядок = нумерация файлов)');
  assert.equal(NPCS[40].id, 'mountain_priest',
    'guard: 41-я запись — горный жрец (позиционные NPCS[..] не '
    + 'сдвинуты)');
});

// --- T2: 000042.json валиден по схеме + порядок ключей + roundtrip ---------

test('T2: assets/npc/000042.json валиден по schema; ключи в порядке эталона ЧИСТОЙ ПОДСКАЗКИ .14/.17 (id, имя, роль, описание, постройки, диалог — без блоков); roundtrip-канон; негативы — мимо схемы и мимо порядка ключей', () => {
  assert.ok(fs.existsSync(NEW),
    'RED: assets/npc/000042.json отсутствует (NPC задачи ещё не создан)');
  const data = readJson(NEW);
  assert.deepEqual(validateData(SCHEMA, data, 'npc/000042'), [],
    '000042.json обязан проходить assets/npc/schema.json');
  const KEYS = ['id', 'имя', 'роль', 'описание', 'постройки', 'диалог'];
  assert.deepEqual(Object.keys(data), KEYS,
    'порядок ключей — как у эталона чистой подсказки .14 (000032)/'
    + '.17 (000035): id, имя, роль, описание, постройки, диалог — '
    + 'без блоков обучение/торговля/квесты/найм');
  const raw = fs.readFileSync(NEW, 'utf8');
  assert.equal(raw, JSON.stringify(data, null, 2) + '\n',
    '000042.json — roundtrip JSON.stringify(obj,null,2)+перевод строки');
  const extraKey = JSON.parse(JSON.stringify(data));
  extraKey.цена = 10;
  assert.notDeepEqual(validateData(SCHEMA, extraKey, 'npc/extra'), [],
    'посторонний ключ «цена» — additionalProperties false, обязан отваливаться');
  const badCharisma = JSON.parse(JSON.stringify(data));
  const reqOpt = badCharisma.диалог.find((o) => o.требования);
  assert.ok(reqOpt, 'есть опция с требованиями (прецедент hint_hand .15)');
  reqOpt.требования.харизма = 0;
  assert.notDeepEqual(validateData(SCHEMA, badCharisma, 'npc/badcharisma'), [],
    'требование харизма 0 — вне схемы (minimum 1)');
  const badAction = JSON.parse(JSON.stringify(data));
  badAction.диалог[0].действие = 'дар';
  assert.notDeepEqual(validateData(SCHEMA, badAction, 'npc/badaction'), [],
    'действие «дар» — вне enum схемы');
  const badPath = JSON.parse(JSON.stringify(data));
  badPath.постройки = ['000005.json'];
  assert.notDeepEqual(validateData(SCHEMA, badPath, 'npc/badpath'), [],
    'постройки без пути assets/buildings/ (numeric-форма) — вне паттерна схемы');
  const numericPath = JSON.parse(JSON.stringify(data));
  numericPath.постройки = ['assets/buildings/' + '000005' + '.json'];
  assert.notDeepEqual(validateData(SCHEMA, numericPath, 'npc/numericpath'), [],
    'numeric-путь постройки — вне паттерна схемы: база содержит 000318.06, '
    + 'здания — slug-именование, numeric-форма мертва (zero-sweep '
    + 'tests/buildings-rename-000318.06.test.js T5); ТЗ-путь '
    + '000005.json устарел');
  const withTrade = JSON.parse(JSON.stringify(data));
  withTrade.торговля = { предметы: [{ предмет: 'assets/items/000043.json',
    mult_продажи: 0.5, количество: 1 }] };
  assert.notDeepEqual(Object.keys(withTrade), KEYS,
    'лишний блок «торговля» — вне эталона ключей: схема блок допускает '
    + '(невидимость свипам пинит не схема, а T2/T6), профиль чистая '
    + 'подсказка держится только СЛОВОМ, не витриной');
  const legacyEntry = JSON.parse(JSON.stringify(data));
  legacyEntry.торговля = { предметы: [{ предмет: 'assets/items/000043.json',
    mult_продажи: 0.5, количество: 1, цена_покупки: 60, цена_продажи: 30 }] };
  assert.notDeepEqual(validateData(SCHEMA, legacyEntry, 'npc/legacyentry'), [],
    'legacy-вход торговли цена_покупки/цена_продажи — вне схемы '
    + '(additionalProperties false, формат 000322)');
});

// --- T3: id и имя уникальны (sweep) ----------------------------------------

test('T3: id path_guide и имя «Стрелка» уникальны в sweep каталога', () => {
  assert.ok(fs.existsSync(NEW), 'RED: assets/npc/000042.json отсутствует');
  const ids = new Set();
  const names = new Set();
  for (const f of listNpcFiles()) {
    const d = readJson(path.join(NDIR, f));
    assert.ok(!ids.has(d.id), 'дубликат id «' + d.id + '» (файл ' + f + ')');
    assert.ok(!names.has(d.имя), 'дубликат имени «' + d.имя + '» (файл ' + f + ')');
    ids.add(d.id);
    names.add(d.имя);
  }
  assert.ok(ids.has(ID), 'id path_guide в каталоге');
  assert.ok(names.has(NAME), 'имя «Стрелка» в каталоге');
});

// --- T4: роль-фикс, описание с хуком и уникально ----------------------------

test('T4: роль РОВНО «проводник» (точная строка ТЗ; свипов уникальности ролей нет — прецеденты «наставник» и «торговец»); описание непустое, хук «Знает карту лучше картографа» — последнее предложение, и НЕ копия описания другого NPC', () => {
  assert.ok(fs.existsSync(NEW), 'RED: assets/npc/000042.json отсутствует');
  const data = readJson(NEW);
  assert.ok(typeof data.описание === 'string' && data.описание.trim() !== '',
    'описание непустое');
  assert.equal(data.роль, 'проводник',
    'роль — фикс-строка «проводник» (ТЗ); Т4 пишет точное равенство '
    + '(свипов уникальности ролей нет — прецеденты «наставник» '
    + '.10/.13/.16, «торговец» .20)');
  assert.ok(data.описание.includes(HOOK),
    'хук истории «' + HOOK + '» (ТЗ) в описании дословно');
  assert.ok(data.описание.endsWith(HOOK + '.'),
    'хук — ПОСЛЕДНЕЕ предложение описания (с заглавной, с точкой на '
    + 'конце — прецеденты .02–.20); факт: '
    + JSON.stringify(data.описание.slice(-70)));
  for (const f of listNpcFiles()) {
    if (f === '000042.json') continue;
    const d = readJson(path.join(NDIR, f));
    assert.notEqual(d.описание, data.описание,
      'описание совпадает с ' + f + ' (не копия существующего)');
  }
});

// --- T5: диалог — профиль чистая подсказка, без «для» ------------------------

test('T5: диалог валиден по схеме, РОВНО 3 опции как у эталона .14/.17, ВСЕ «подсказка», ровно одна с {харизма:3}, id опций уникальны, опций с «для» — ровно 0, запрет-лист 67 подстрок (дисковый список .20 = 63, живой «храме солнца», + резерв 4 оборотов Барыша) по ТЕКСТАМ диалога', () => {
  assert.ok(fs.existsSync(NEW), 'RED: assets/npc/000042.json отсутствует');
  const data = readJson(NEW);
  assert.ok(Array.isArray(data.диалог) && data.диалог.length >= 1,
    'диалог непустой (schema minItems 1)');
  assert.equal(data.диалог.length, 3,
    'диалог — ровно 3 опции (prives / hint_sign / hint_map — форма '
    + 'эталона чистой подсказки .14 «Жгут» / .17 «Грифель»), факт: '
    + data.диалог.length);
  const ACTIONS = SCHEMA.properties.диалог.items.properties.действие.enum;
  for (const o of data.диалог) {
    assert.ok(ACTIONS.includes(o.действие),
      'действие «' + o.действие + '» вне enum схемы');
    const errs = validateData(SCHEMA.properties.диалог.items, o, 'диалог');
    assert.deepEqual(errs, [],
      'опция «' + o.id + '» — вне схемы диалога: ' + JSON.stringify(errs));
  }
  assert.ok(data.диалог.some((o) => o.действие === 'подсказка'),
    'профиль «подсказка» — хотя бы одна опция действия «подсказка»');
  assert.equal(data.диалог.filter((o) => o.действие !== 'подсказка').length, 0,
    'профиль ЧИСТАЯ подсказка (клон .14/.17): опций с действием вне '
    + '«подсказка» — ровно 0');
  const ids = data.диалог.map((o) => o.id);
  assert.equal(new Set(ids).size, ids.length, 'id опций диалога уникальны');
  assert.equal(data.диалог.filter((o) => o.для !== undefined).length, 0,
    'опций с «для» — ровно 0: проводник говорит со всеми; добавление '
    + '«для» требует ре-пина A8a (tests/npc-dialog-scope) и запрещено');
  const withReq = data.диалог.filter((o) => o.требования !== undefined);
  assert.equal(withReq.length, 1,
    'ровно одна опция с требованиями (прецедент hint_wood/hint_old/'
    + 'hint_blade/hint_collection/hint_anvil/hint_march/hint_ring/'
    + 'hint_weight/hint_dry/hint_stone/hint_fire/hint_hand/hint_talent/'
    + 'hint_pack/hint_scent)');
  assert.deepEqual(withReq[0].требования, { харизма: 3 },
    'требование опции — {харизма: 3} (харизма-прецедент батча, НЕ «проверка»)');
  assert.equal(data.диалог.indexOf(withReq[0]), 2,
    'опция с требованием — ПОСЛЕДНЯЯ (эталон .17: hint_reader последней)');
  const texts = data.диалог.map((o) => o.текст).join(' ');
  for (const w of [    'хвостовик', 'наковальн', 'штампов', 'коллекци', 'позолот', 'старые походы', 'арен',
    'жалован', 'знамен', 'задаток', 'табель', 'метл', 'стена клинков', 'звон', 'дребезг',
    'нагрудник', 'закалк', 'трещин', 'молотк', 'примеря', 'старые дела', 'храме солнца',
    'старейшин', 'посмееш', 'на весах', 'сонной мяты', 'клонит в сон', 'завянет', 'пучками',
    'почерневш', 'разотрёшь', 'где болит', 'выше раны', 'доживают до старости',
    'не бывает лишнего', 'с далёких гор', 'договоримся о цене', 'между строк',
    'при дневном свете', 'чернила помнят', 'прощает торопливому', 'из-под пальцев',
    'выберем тебе школу', 'описк', 'чистовик', 'по концу листа', 'копию без торгу', 'вкривь',
    'кормит', 'от кузницы до кузницы', 'не пожалеешь', 'пока повозка полная', 'на дневку',
    'сколько сгрузил', 'ближе к холке', 'сырьё кончается', 'спрашивай про руду',
    'то в моих вьюках', 'ищи меня', 'до площади раньше колокола', 'понюхай сначала',
    'каменная соль', 'в самом конце', 'три металла на прилавке', 'три монеты в коше',
    'два языка служат', 'монету берут на глаз']) {
    assert.ok(!texts.includes(w),
      'тема чужого NPC (.04 «старые походы»/арена — «арен», .05 '
      + 'коллекция, .06 ковка/хвостовик, .07 наём/жалованье, .08 '
      + 'метла/стена клинков, .09 броня-звонок, .10 големы; тексты '
      + 'Милы — «старые дела»/«храм солнца» (матчер «храме солнца» — '
      + 'живой, цепочка по 000364 / b18 №7)/«старейшина»/«посмеешь»; '
      + 'обороты Отвара — «на весах»/«сонной мяты»/«клонит в сон»; '
      + 'обороты Травницы — «завянет»/«пучками»/«почерневш»/'
      + '«разотрёшь»; обороты Жгута — «где болит»/«выше раны»/'
      + '«доживают до старости»; обороты Зиры — «не бывает лишнего»/'
      + '«с далёких гор»/«договоримся о цене»; обороты Пергамента — '
      + '«между строк»/«при дневном свете»/«чернила помнят»; обороты '
      + 'Пробника — «прощает торопливому»/«из-под пальцев»/«выберем '
      + 'тебе школу»; обороты Грифеля — «описк»/«чистовик»/«по концу '
      + 'листа»/«копию без торгу» + «вкривь»; обороты Хольда — '
      + '«кормит»/«от кузницы до кузницы»/«не пожалеешь»/«пока '
      + 'повозка полная» + «сырьё кончается»/«спрашивай про руду»; '
      + 'обороты Хомута — «на дневку»/«сколько сгрузил»/«ближе к '
      + 'холке»/«то в моих вьюках»/«ищи меня»; обороты Шафрана — «до '
      + 'площади раньше колокола»/«понюхай сначала»/«каменная соль»/'
      + '«в самом конце»; обороты Барыша — резерв memory/'
      + '000320-caravan_trader.md для .21+ «три металла на прилавке»/'
      + '«три монеты в коше»/«два языка служат»/«монету берут на '
      + 'глаз») не дублируется: подстрока «' + w + '»');
  }
});

// --- T6: профиль-гарант — блоков профильных НЕТ, зеркало ≡ JSON --------------

test('T6: блоков обучение/торговля/квесты/найм НЕТ (ни в JSON, ни в зеркале), нет ссылок assets/items — профиль чистая подсказка (счётчики торговля 234 / goal 2 / reward 5 / уникальные 202 / R7=20 НЕ растут); постройки [assets/buildings/wanderer_shop.json]; зеркало NPCS[41]: постройки [5], диалог/описание deepEqual', () => {
  assert.ok(fs.existsSync(NEW), 'RED: assets/npc/000042.json отсутствует');
  const data = readJson(NEW);
  for (const block of ['обучение', 'торговля', 'квесты', 'найм']) {
    assert.ok(!(block in data),
      'в JSON нет блока «' + block + '»: профиль чистая подсказка — '
      + 'счётчики npc-refs торговля 234 / goal 2 / reward 5 / '
      + 'уникальные предметы 202 и R7 торгующих 20 (tests/'
      + 'item-prices-000322) не растут');
  }
  assert.ok(!JSON.stringify(data).includes('assets/items'),
    'в JSON нет ссылок assets/items (ни торговли, ни квестов) — свипы '
    + 'item-prices-000322 пропускают неторговцев: проводник невидим');
  assert.deepEqual(data.постройки, ['assets/buildings/wanderer_shop.json'],
    'постройка — Лавка странника (фикс ТЗ; путь — SLUG: база содержит '
    + '000318.06, numeric-путь зданий больше НЕ ref)');
  const mirror = NPCS[41];
  assert.ok(mirror && mirror.id === ID,
    'зеркало: 42-я запись path_guide');
  assert.equal(mirror.роль, 'проводник',
    'роль в зеркале — «проводник» (фикс ТЗ)');
  for (const block of ['обучение', 'торговля', 'квесты', 'найм']) {
    assert.ok(!(block in mirror),
      'в зеркале нет блока «' + block + '» (следует из JSON)');
  }
  assert.deepEqual(mirror.постройки, [5],
    'зеркало: постройки [5] — sync резолвит ссылку Лавки странника в id');
  assert.deepEqual(mirror.диалог, data.диалог,
    'зеркало NPCS[41].диалог ≡ JSON-диалог бит-в-бит (резолвинга нет — '
    + 'ни квестов, ни торговли)');
  assert.deepEqual(mirror.описание, data.описание,
    'зеркало NPCS[41].описание ≡ JSON');
});

// --- T7: ростер дома 5 — СЕМЬ записей, Хольд первый ---------------------------

test('T7: npcsForBuilding(NPCS, 5) — СЕМЬ записей Лавки странника в порядке каталога [wanderer_merchant, wanderer_trader, spice_trader, caravan_trader, path_guide, tumbleweed, caravan_leader]; npcForBuilding(5) — по-прежнему Хольд; Магазин магии — ЧЕТЫРЕ, Аптекарь — ПЯТЬ, Бронник — ТРИ и Оружейная — ДЕВЯТЬ не тронуты', () => {
  const list = N.npcsForBuilding(NPCS, 5);
  assert.deepEqual(list.map((n) => n.id),
    ['wanderer_merchant', 'wanderer_trader', 'spice_trader',
      'caravan_trader', ID, 'tumbleweed', 'caravan_leader'],
    'Лавка странника (5): Хольд (000011) + Странствующий торговец '
    + '(000036) + Торговец специями (000037) + Торговец каравана '
    + '(000038) + Проводник (000042) + Кочевник Перекати (000043) + глава каравана Сарбон (000044), порядок = нумерация файлов; '
    + 'факт: ' + JSON.stringify(list.map((n) => n.id)));
  assert.equal(N.npcForBuilding(NPCS, 5).id, 'wanderer_merchant',
    'npcForBuilding — ПЕРВЫЙ по номеру файла (Хольд; HUD/«Здесь:» '
    + 'не тронуты, CI-134 е2е Digit1 — по-прежнему Хольд)');
  const magic = N.npcsForBuilding(NPCS, 4);
  assert.deepEqual(magic.map((n) => n.id),
    ['magic_merchant', 'scroll_merchant', 'magic_instructor', 'scribe'],
    'Магазин магии (4) — ЧЕТЫРЕ NPC не тронуты (новый NPC — Лавка '
    + 'странника): ' + JSON.stringify(magic.map((n) => n.id)));
  const apteka = N.npcsForBuilding(NPCS, 3);
  assert.deepEqual(apteka.map((n) => n.id),
    ['apothecary', 'brewer', 'herbalist', 'alchemy_instructor',
      'village_doctor'],
    'Аптекарь (3) — ПЯТЬ NPC не тронуты: '
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

// --- T8: оверлей дома 5 — ровно 7 dialog-строк ------------------------------

test('T8: [E]-оверлей Лавки странника — ровно 7 строк: dialog (Хольд), dialog:wanderer_trader (Хомут), dialog:spice_trader (Шафран), dialog:caravan_trader (Барыш), dialog:path_guide (Стрелка), dialog:tumbleweed (Перекати), dialog:caravan_leader (Сарбон) — ре-пин .20 ЧЕТЫРЕ→ПЯТЬ и 000320.22 ПЯТЬ→ШЕСТЬ, .23 ШЕСТЬ→СЕМЬ; хоткеи Digit1..7; ВОСЬМОЙ NPC дома 5 (.24 старый торговец по сводной таблице) поднимет оверлей до 8 и заре-пинит T7/T8 всех шести файлов (.18/.19/.20/.21/.22/.23) дальше', () => {
  const b = readJson(path.join(ROOT, 'assets', 'buildings', 'wanderer_shop.json'));
  const list = N.npcsForBuilding(NPCS, 5);
  const rows = BE.buildingActions(b, list, { day: 5 });
  assert.equal(rows.length, 7,
    'у здания 5 эффектов нет — список = dialog-строки по каждому NPC '
    + '(РОВНО СЕМЬ), факт: ' + JSON.stringify(rows.map((r) => r.id)));
  assert.deepEqual(rows.map((r) => r.id),
    ['dialog', 'dialog:wanderer_trader', 'dialog:spice_trader',
      'dialog:caravan_trader', 'dialog:' + ID, 'dialog:tumbleweed',
      'dialog:caravan_leader'],
    'порядок строк = нумерация файлов каталога, Хольд по-прежнему '
    + 'ПЕРВЫЙ; факт: ' + JSON.stringify(rows.map((r) => r.id)));
  assert.deepEqual(rows.map((r) => r.имя),
    ['Диалог: Хольд', 'Диалог: Хомут', 'Диалог: Шафран',
      'Диалог: Барыш', 'Диалог: ' + NAME, 'Диалог: Перекати',
      'Диалог: Сарбон'],
    'подписи — «Диалог: <имя>», факт: ' + JSON.stringify(rows.map((r) => r.имя)));
  assert.deepEqual(rows.map((r) => r.npcId),
    ['wanderer_merchant', 'wanderer_trader', 'spice_trader',
      'caravan_trader', ID, 'tumbleweed', 'caravan_leader'],
    'каждая строка несёт npcId своего NPC (роутинг клика); хоткеи '
    + 'Digit1..7 — общий механизм /^Digit([1-9])$/ (src/building-ui.js) '
    + 'по индексу строки, лимит 9 не достигнут');
});

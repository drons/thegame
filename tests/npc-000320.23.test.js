// Задача 000320.23: «Глава каравана» — id caravan_leader, имя «Сарбон»
// (Лавка странника, 7-й NPC постройки; 23-я из 100 дочерних 000320).
//
// Контракт (ТЗ tasks/pending/000320.23.md; механизм мульти-NPC —
// 000320.01, spec/npc.md «Несколько NPC на постройку»,
// memory/000320-npcs-batch.md; профиль-эталон КВЕСТЫ+ПОДСКАЗКА —
// .03 «Скарн» (000021), квестовые формы — Берта 000009/Элдира 000010):
//   * assets/npc/000044.json — id caravan_leader (свип по 43 занятым —
//     свободен; caravan_trader 000038 «Барыш» — ДРУГОЙ id), имя
//     «Сарбон» (выбор агента: погонщик-глава каравана по-среднеазиатски;
//     конвенция батча — прозвище, не роль-слово), роль «глава каравана»
//     (фикс ТЗ — точным равенством; свипов уникальности ролей нет),
//     постройка assets/buildings/wanderer_shop.json (Лавка странника —
//     ТЗ-путь 000005.json мёртв с 000318.06: zero-sweep tests/
//     buildings-rename-000318.06.test.js T5; путь — SLUG), 7-й NPC
//     дома: Хольд ПЕРВЫЙ, npcForBuilding(5) продолжает возвращать
//     Хольда; хук истории «Ведёт караван; его задания — охранить путь
//     и груз» — последнее предложение описания (прецеденты .02–.22);
//   * профиль диалога — КВЕСТЫ + ПОДСКАЗКА (форма эталона .03 Скарн):
//     РОВНО 3 опции prives/«подсказка» → quests/«квесты» → hint_road/
//     «подсказка», РОВНО одна (последняя) с {харизма:3} — харизма-
//     прецедент батча, НЕ «проверка»; блоков торговля/обучение/найм
//     НЕТ → торговля 234 / уникальные 202 / R7=20 НЕ растут; квесты
//     ЕСТЬ → npc-refs goal 2→3 (bring_item bread 000016 — уже в
//     множестве 202), reward 5→7 (000015/000012 — уже в множестве),
//     сумма 241→244;
//   * опций с «для» — РОВНО 0: контракт A8a (tests/npc-dialog-scope)
//     — динамический свип ждёт 0 «для» у всех, кроме Берты/Элдиры/
//     Корда; добавление «для» = ослабление пина, запрещено (мутация
//     M2);
//   * квесты — 2, формат schema: caravan_load (bring_item bread x2 →
//     50/40 + 000015 x1) → caravan_guard (kill_group группа 1
//     ORC_RAIDERS x1 → 60/50 + 000012 x2, цепочка «предыдущий» по
//     прецеденту Элдиры/Скарна: bring → kill); группа ∈ 0..6 по
//     фактическому MOB_GROUP_TYPES (src/map.js:321) и mobGroupCount
//     (каталог assets/mob_groups — 7 групп); награды по диску
//     существующих 5 квестов (40/50…120/100);
//   * тема диалога — караван/груз/дорога; запрет-лист ТЕКСТОВ диалога
//     79 = дисковый список .22 T5 ЦЕЛИКОМ (75 = .21-67: .20 = 63,
//     живой «храме солнца» + 4 резерва Барыша + 4 оборота Проводника
//     + 4 жреческие 000347.02) + 4 зарезервированных оборота Перекати
//     (memory/000320-nomad.md для .23+: «мой дом там, где ночевал»,
//     «вьюки легче всякого сундука», «базара без дорог не бывает»,
//     «новости ногами приходят»); СВОИ 4 оборота зарезервированы для
//     .24 — memory/000320-caravan_leader.md (.24 ОБЯЗАН += их в свой
//     список; по той же цепочке и все 79 этого списка);
//   * [E]-оверлей Лавки странника — РОВНО СЕМЬ dialog-строк в порядке
//     каталога: 'dialog' (Хольд) → 'dialog:wanderer_trader' (Хомут) →
//     'dialog:spice_trader' (Шафран) → 'dialog:caravan_trader' (Барыш)
//     → 'dialog:path_guide' (Стрелка) → 'dialog:tumbleweed' (Перекати)
//     → 'dialog:caravan_leader' (Сарбон); хоткеи Digit1..7 — общий
//     механизм src/building-ui.js /^Digit([1-9])$/ по индексу строки;
//     пин создан в .18 (ДВЕ), поднят .19 (ТРИ), .20 (ЧЕТЫРЕ), .21
//     (ПЯТЬ), .22 (ШЕСТЬ) и здесь (СЕМЬ) — ре-пинуты T7/T8 всех шести
//     файлов (.18/.19/.20/.21/.22/.23) (предписание .22 T8
//     реализовано здесь).
//
// КРАСНЫЕ (TDD): T1..T8 красные до зелёной стадии (000044.json нет,
// каталог 43, ростер дома 5 — ШЕСТЬ NPC, оверлей 6 строк), без
// краха загрузки.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validateData } = require('./json-schema.js');

const ROOT = path.join(__dirname, '..');
const NDIR = path.join(ROOT, 'assets', 'npc');
const NEW = path.join(NDIR, '000044.json');
const SCHEMA = JSON.parse(
  fs.readFileSync(path.join(NDIR, 'schema.json'), 'utf8'));

const N = require('../src/npc.js');
const { NPCS } = require('../src/npc-data.js');
const { mobGroupCount } = require('../src/map.js');
const BE = require('../src/building-effects.js');

const HOOK = 'Ведёт караван; его задания — охранить путь и груз';
const ID = 'caravan_leader';
const NAME = 'Сарбон';

const MINE = ['обоз — это стена, которая ходит',
  'груз считается привезённым, только когда он на площади',
  'дорогу берегут до разбоя, а не после',
  'караван держат не узлы, а порядок'];

function listNpcFiles() {
  return fs.readdirSync(NDIR)
    .filter((f) => /^\d{6}\.json$/.test(f))
    .sort();
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// --- T1: размер каталога ---------------------------------------------------

test('T1: каталог — ровно 47 файлов 000001..000047 подряд; зеркало NPCS 47 записи с caravan_leader', () => {
  const files = listNpcFiles();
  assert.equal(files.length, 47,
    'в каталоге NPC 47 файлов (000320.01..22 + 000347.02: жрецы; '
    + '000320.23: +Сарбон; 000320.24: +Просол; 000320.25: +Насечка; 000320.26: +Костяшка — полная цепочка в tests/npc-000320.01 '
    + '.test.js T1), факт: ' + files.length);
  for (let i = 0; i < files.length; i++) {
    assert.equal(files[i],
      String(i + 1).padStart(6, '0') + '.json',
      'нумерация подряд без пропусков: индекс ' + i);
  }
  assert.equal(NPCS.length, 47,
    'зеркало src/npc-data.js — 47 записи (sync не прогнан?), факт: '
    + NPCS.length);
  const last = NPCS[43];
  assert.ok(last, '44-я запись зеркала существует');
  assert.equal(last.id, ID,
    '44-я запись зеркала — caravan_leader (порядок = нумерация файлов)');
  assert.equal(NPCS[42].id, 'tumbleweed',
    'guard: 43-я запись — Перекати (позиционные NPCS[..] не '
    + 'сдвинуты)');
});

// --- T2: 000044.json валиден по схеме + порядок ключей + roundtrip ---------

test('T2: assets/npc/000044.json валиден по schema; ключи в порядке эталона КВЕСТЫ+ПОДСКАЗКА .03 (id, имя, роль, описание, постройки, диалог, квесты); roundtrip-канон; негативы — мимо схемы и мимо порядка ключей', () => {
  assert.ok(fs.existsSync(NEW),
    'RED: assets/npc/000044.json отсутствует (NPC задачи ещё не создан)');
  const data = readJson(NEW);
  assert.deepEqual(validateData(SCHEMA, data, 'npc/000044'), [],
    '000044.json обязан проходить assets/npc/schema.json');
  const KEYS = ['id', 'имя', 'роль', 'описание', 'постройки', 'диалог',
    'квесты'];
  assert.deepEqual(Object.keys(data), KEYS,
    'порядок ключей — как у эталона квесты+подсказка .03 (000021 '
    + 'Скарн): id, имя, роль, описание, постройки, диалог, квесты — '
    + 'без блоков обучение/торговля/найм');
  const raw = fs.readFileSync(NEW, 'utf8');
  assert.equal(raw, JSON.stringify(data, null, 2) + '\n',
    '000044.json — roundtrip JSON.stringify(obj,null,2)+перевод строки');
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
  const badGroup = JSON.parse(JSON.stringify(data));
  badGroup.квесты[1].цель.группа = 7;
  assert.notDeepEqual(validateData(SCHEMA, badGroup, 'npc/badgroup'), [],
    'группа 7 в kill_group — вне схемы (maximum 6; каталог 7 групп 0..6)');
  const badItem = JSON.parse(JSON.stringify(data));
  badItem.квесты[0].цель.предмет = 'assets/items/bread.json';
  assert.notDeepEqual(validateData(SCHEMA, badItem, 'npc/baditem'), [],
    'имя-файл вместо numeric-пути в bring_item — вне паттерна схемы');
  const withTrade = JSON.parse(JSON.stringify(data));
  withTrade.торговля = { предметы: [{ предмет: 'assets/items/000765.json',
    mult_продажи: 0.5, количество: 1 }] };
  assert.notDeepEqual(Object.keys(withTrade), KEYS,
    'лишний блок «торговля» — вне эталона ключей: схема блок допускает '
    + '(невидимость свипам пинит не схема, а T2/T6), профиль '
    + 'квесты+подсказка держится только СЛОВОМ, не витриной');
  const legacyEntry = JSON.parse(JSON.stringify(data));
  legacyEntry.торговля = { предметы: [{ предмет: 'assets/items/000765.json',
    mult_продажи: 0.5, количество: 1, цена_покупки: 60, цена_продажи: 30 }] };
  assert.notDeepEqual(validateData(SCHEMA, legacyEntry, 'npc/legacyentry'), [],
    'legacy-вход торговли цена_покупки/цена_продажи — вне схемы '
    + '(additionalProperties false, формат 000322)');
});

// --- T3: id и имя уникальны (sweep) ----------------------------------------

test('T3: id caravan_leader и имя «Сарбон» уникальны в sweep каталога', () => {
  assert.ok(fs.existsSync(NEW), 'RED: assets/npc/000044.json отсутствует');
  const ids = new Set();
  const names = new Set();
  for (const f of listNpcFiles()) {
    const d = readJson(path.join(NDIR, f));
    assert.ok(!ids.has(d.id), 'дубликат id «' + d.id + '» (файл ' + f + ')');
    assert.ok(!names.has(d.имя), 'дубликат имени «' + d.имя + '» (файл ' + f + ')');
    ids.add(d.id);
    names.add(d.имя);
  }
  assert.ok(ids.has(ID), 'id caravan_leader в каталоге');
  assert.ok(names.has(NAME), 'имя «Сарбон» в каталоге');
});

// --- T4: роль-фикс, описание с хуком и уникально ----------------------------

test('T4: роль РОВНО «глава каравана» (точная строка ТЗ; свипов уникальности ролей нет — прецеденты «наставник» и «торговец», «кочевник» .22); описание непустое, хук «Ведёт караван; его задания — охранить путь и груз» — последнее предложение, и НЕ копия описания другого NPC', () => {
  assert.ok(fs.existsSync(NEW), 'RED: assets/npc/000044.json отсутствует');
  const data = readJson(NEW);
  assert.ok(typeof data.описание === 'string' && data.описание.trim() !== '',
    'описание непустое');
  assert.equal(data.роль, 'глава каравана',
    'роль — фикс-строка «глава каравана» (ТЗ); Т4 пишет точное равенство '
    + '(свипов уникальности ролей нет — прецеденты «наставник» '
    + '.10/.13/.16, «торговец» .20; id 000038 caravan_trader — '
    + 'ДРУГОЙ NPC («Барыш»), роль-слово ТЗ не имя: имя «Сарбон»');
  assert.ok(data.описание.includes(HOOK),
    'хук истории «' + HOOK + '» (ТЗ) в описании дословно');
  assert.ok(data.описание.endsWith(HOOK + '.'),
    'хук — ПОСЛЕДНЕЕ предложение описания (с заглавной, с точкой на '
    + 'конце — прецеденты .02–.22; хук содержит «;» — endsWith идёт '
    + 'от ПОЛНОЙ строки хука); факт: '
    + JSON.stringify(data.описание.slice(-80)));
  for (const f of listNpcFiles()) {
    if (f === '000044.json') continue;
    const d = readJson(path.join(NDIR, f));
    assert.notEqual(d.описание, data.описание,
      'описание совпадает с ' + f + ' (не копия существующего)');
  }
});

// --- T5: диалог — профиль квесты+подсказка, без «для» ------------------------

test('T5: диалог валиден по схеме, РОВНО 3 опции как у эталона .03 (подсказка/квесты/подсказка), ровно одна «квесты», РОВНО одна с {харизма:3}, id опций уникальны, опций с «для» — ровно 0, запрет-лист 79 подстрок (дисковый список .22 ЦЕЛИКОМ = 75: .21-67 [.20 = 63, живой «храме солнца», + 4 Барыша] + 4 Проводника + 4 жреческие; + 4 оборота Перекати) по ТЕКСТАМ диалога', () => {
  assert.ok(fs.existsSync(NEW), 'RED: assets/npc/000044.json отсутствует');
  const data = readJson(NEW);
  assert.ok(Array.isArray(data.диалог) && data.диалог.length >= 1,
    'диалог непустой (schema minItems 1)');
  assert.equal(data.диалог.length, 3,
    'диалог — ровно 3 опции (prives / quests / hint_road — форма '
    + 'эталона квесты+подсказка .03 «Скарн»), факт: '
    + data.диалог.length);
  const ACTIONS = SCHEMA.properties.диалог.items.properties.действие.enum;
  for (const o of data.диалог) {
    assert.ok(ACTIONS.includes(o.действие),
      'действие «' + o.действие + '» вне enum схемы');
    const errs = validateData(SCHEMA.properties.диалог.items, o, 'диалог');
    assert.deepEqual(errs, [],
      'опция «' + o.id + '» — вне схемы диалога: ' + JSON.stringify(errs));
  }
  assert.equal(data.диалог.filter((o) => o.действие === 'квесты').length, 1,
    'профиль «квесты» — РОВНО одна опция действия «квесты» (эталон .03)');
  assert.equal(data.диалог.filter((o) => o.действие === 'подсказка').length, 2,
    'профиль «подсказка» — РОВНО две опции действия «подсказка» '
    + '(prives + hint_road, эталон .03), факт: '
    + data.диалог.filter((o) => o.действие === 'подсказка').length);
  assert.equal(data.диалог.filter((o) => o.действие !== 'подсказка'
    && o.действие !== 'квесты').length, 0,
    'профиль квесты+подсказка (клон .03): опций с действием вне '
    + '{подсказка, квесты} — ровно 0');
  const ids = data.диалог.map((o) => o.id);
  assert.equal(new Set(ids).size, ids.length, 'id опций диалога уникальны');
  assert.equal(data.диалог.filter((o) => o.для !== undefined).length, 0,
    'опций с «для» — ровно 0: глава каравана говорит со всеми; добавление '
    + '«для» требует ре-пина A8a (tests/npc-dialog-scope) и запрещено');
  const withReq = data.диалог.filter((o) => o.требования !== undefined);
  assert.equal(withReq.length, 1,
    'ровно одна опция с требованиями (прецедент hint_wood/hint_old/'
    + 'hint_blade/hint_collection/hint_anvil/hint_march/hint_ring/'
    + 'hint_weight/hint_dry/hint_stone/hint_fire/hint_hand/hint_talent/'
    + 'hint_pack/hint_scent/hint_map/hint_reader)');
  assert.deepEqual(withReq[0].требования, { харизма: 3 },
    'требование опции — {харизма: 3} (харизма-прецедент батча, НЕ «проверка»)');
  assert.equal(data.диалог.indexOf(withReq[0]), 2,
    'опция с требованием — ПОСЛЕДНЯЯ (эталон .17: hint_reader последней)');
  const texts = data.диалог.map((o) => o.текст).join(' ');
  for (const w of ['хвостовик', 'наковальн', 'штампов', 'коллекци',
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
    'вьюки легче всякого сундука', 'базара без дорог не бывает', 'новости ногами приходят']) {
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
      + 'глаз»; обороты Проводника — резерв memory/000320-path_guide.md '
      + 'для .22+ «вода по колено»/«кривой указатель»/«указатель '
      + 'врёт»/«дорога — мой хлеб»; жрецы 000347.02 — обязательство '
      + 'ре-пин-карты memory/000347-temple-scroll-trade.md (эррата '
      + '000367 П.4) «с солнечной полки»/«у этой залы слух длинный»/'
      + '«гора лишних слов не держит»/«про спуск»; обороты Перекати — '
      + 'резерв memory/000320-nomad.md для .23+ «мой дом там, где '
      + 'ночевал»/«вьюки легче всякого сундука»/«базара без дорог не '
      + 'бывает»/«новости ногами приходят») не дублируется: '
      + 'подстрока «' + w + '»');
  }
  for (const w of MINE) {
    assert.ok(texts.includes(w),
      'СВОЙ оборот «' + w + '» живёт в текстах 000044.json — резерв '
      + '.24+ по memory/000320-caravan_leader.md (формула наследования: '
      + 'список .24 = дисковый .23 ЦЕЛИКОМ + эти 4)');
  }
});

// --- T6: профиль-гарант — квесты валидны, блоков лишних НЕТ, зеркало ≡ JSON --

test('T6: блоков торговля/обучение/найм НЕТ (ни в JSON, ни в зеркале), квесты ЕСТЬ (1–2): id/цель/награды валидны по диску (группа ∈ 0..mobGroupCount−1, предметы существуют, награды ненулевые, цепочка «предыдущий»); постройки [assets/buildings/wanderer_shop.json]; зеркало NPCS[43]: постройки [5], диалог/описание deepEqual, квесты deepEqual с резолвом items→id', () => {
  assert.ok(fs.existsSync(NEW), 'RED: assets/npc/000044.json отсутствует');
  const data = readJson(NEW);
  for (const block of ['обучение', 'торговля', 'найм']) {
    assert.ok(!(block in data),
      'в JSON нет блока «' + block + '»: профиль квесты+подсказка — '
      + 'счётчики npc-refs торговля 234 / уникальные предметы 202 и '
      + 'R7 торгующих 20 (tests/item-prices-000322) не растут');
  }
  assert.ok(Array.isArray(data.квесты)
    && data.квесты.length >= 1 && data.квесты.length <= 2,
    'квесты — 1–2 по ТЗ; факт: '
    + (Array.isArray(data.квесты) ? data.квесты.length : typeof data.квесты));
  const qids = data.квесты.map((q) => q.id);
  assert.equal(new Set(qids).size, qids.length,
    'id квестов уникальны внутри NPC');
  const mobGroups = fs.readdirSync(path.join(ROOT, 'assets', 'mob_groups'))
    .filter((f) => f.endsWith('.json') && f !== 'schema.json');
  assert.equal(mobGroupCount(), mobGroups.length,
    'mobGroupCount() = каталог assets/mob_groups (source of truth 000057): '
    + mobGroupCount() + ' vs файлов ' + mobGroups.length);
  for (const q of data.квесты) {
    assert.match(q.id, /^[a-z][a-z0-9_]*$/,
      'id квеста «' + q.id + '» вне паттерна схемы');
    const goal = q.цель;
    if (goal.тип === 'kill_group') {
      assert.ok(Number.isInteger(goal.группа) && goal.группа >= 0
        && goal.группа < mobGroupCount(),
        'квест ' + q.id + ': группа ' + goal.группа + ' вне 0..'
        + (mobGroupCount() - 1) + ' (MOB_GROUP_TYPES src/map.js)');
    } else {
      assert.equal(goal.тип, 'bring_item',
        'квест ' + q.id + ': тип цели «' + goal.тип + '» вне {kill_group, bring_item}');
      assert.match(goal.предмет, /^assets\/items\/\d{6}\.json$/,
        'квест ' + q.id + ': предмет цели «' + goal.предмет + '» вне пути');
      assert.ok(fs.existsSync(path.join(ROOT, goal.предмет)),
        'квест ' + q.id + ': предмет цели ' + goal.предмет + ' нет на диске');
    }
    assert.ok(goal.количество >= 1 && goal.количество <= 99,
      'квест ' + q.id + ': количество цели вне 1..99');
    assert.ok(q.награда.опыт > 0 && q.награда.золото > 0,
      'квест ' + q.id + ': награда ненулевая (опыт/золото > 0 — масштаб '
      + 'диска: существующие 5 квестов дают 40/50…120/100); факт: '
      + q.награда.опыт + '/' + q.награда.золото);
    for (const r of (q.награда.предметы || [])) {
      assert.match(r.предмет, /^assets\/items\/\d{6}\.json$/,
        'квест ' + q.id + ': предмет награды «' + r.предмет + '» вне пути');
      assert.ok(fs.existsSync(path.join(ROOT, r.предмет)),
        'квест ' + q.id + ': предмет награды ' + r.предмет + ' нет на диске');
    }
    assert.ok(q.предыдущий === null || q.предыдущий === undefined
      || qids.includes(q.предыдущий),
      'квест ' + q.id + ': предыдущий «' + q.предыдущий + '» не у этого NPC');
  }
  assert.ok(!JSON.stringify(data).includes('"торговля"'),
    'ни блока, ни действия «торговля» в JSON нет (свипы '
    + 'item-prices-000322 пропускают неторговцев: Сарбон невидим)');
  assert.deepEqual(data.постройки, ['assets/buildings/wanderer_shop.json'],
    'постройка — Лавка странника (фикс ТЗ; путь — SLUG: база содержит '
    + '000318.06, numeric-путь зданий больше НЕ ref)');
  const mirror = NPCS[43];
  assert.ok(mirror && mirror.id === ID,
    'зеркало: 44-я запись caravan_leader');
  assert.equal(mirror.роль, 'глава каравана',
    'роль в зеркале — «глава каравана» (фикс ТЗ)');
  for (const block of ['обучение', 'торговля', 'найм']) {
    assert.ok(!(block in mirror),
      'в зеркале нет блока «' + block + '» (следует из JSON)');
  }
  assert.deepEqual(mirror.постройки, [5],
    'зеркало: постройки [5] — sync резолвит ссылку Лавки странника в id');
  assert.deepEqual(mirror.диалог, data.диалог,
    'зеркало NPCS[43].диалог ≡ JSON-диалог бит-в-бит');
  assert.deepEqual(mirror.описание, data.описание,
    'зеркало NPCS[43].описание ≡ JSON');
  const expected = JSON.parse(JSON.stringify(data.квесты));
  for (const q of expected) {
    if (q.цель.тип === 'bring_item') {
      q.цель.предмет = readJson(path.join(ROOT, q.цель.предмет)).id;
    }
    for (const r of (q.награда.предметы || [])) {
      r.предмет = readJson(path.join(ROOT, r.предмет)).id;
    }
  }
  assert.deepEqual(mirror.квесты, expected,
    'зеркало NPCS[43].квесты ≡ JSON с резолвом путей предметов в id '
    + '(sync-npc-data.js:100-107; прецедент duelist_trial→iron_sword)');
});

// --- T7: ростер дома 5 — ВОСЕМЬ записей, Хольд первый ---------------------------

test('T7: npcsForBuilding(NPCS, 5) — ВОСЕМЬ записей Лавки странника в порядке каталога [wanderer_merchant, wanderer_trader, spice_trader, caravan_trader, path_guide, tumbleweed, caravan_leader, old_trader]; npcForBuilding(5) — по-прежнему Хольд; Магазин магии — ЧЕТЫРЕ, Аптекарь — ПЯТЬ, Бронник — ТРИ и Оружейная — ДЕВЯТЬ не тронуты', () => {
  const list = N.npcsForBuilding(NPCS, 5);
  assert.deepEqual(list.map((n) => n.id),
    ['wanderer_merchant', 'wanderer_trader', 'spice_trader',
      'caravan_trader', 'path_guide', 'tumbleweed', ID, 'old_trader'],
    'Лавка странника (5): Хольд (000011) + Странствующий торговец '
    + '(000036) + Торговец специями (000037) + Торговец каравана '
    + '(000038) + Проводник (000042) + Кочевник Перекати (000043) '
    + '+ глава каравана Сарбон (000044) + старый торговец Просол (000045), порядок = нумерация файлов; факт: '
    + JSON.stringify(list.map((n) => n.id)));
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

// --- T8: оверлей дома 5 — ровно 8 dialog-строк ------------------------------

test('T8: [E]-оверлей Лавки странника — ровно 8 строк: dialog (Хольд), dialog:wanderer_trader (Хомут), dialog:spice_trader (Шафран), dialog:caravan_trader (Барыш), dialog:path_guide (Стрелка), dialog:tumbleweed (Перекати), dialog:caravan_leader (Сарбон), dialog:old_trader (Просол) — ре-пин .22 ПЯТЬ→ШЕСТЬ и 000320.23 ШЕСТЬ→СЕМЬ, .24 (СЕМЬ→ВОСЕМЬ); хоткеи Digit1..8; дом 5 укомплектован восемью (диапазон батча .18–.24 закрыт): новый NPC дома 5 сверх восьми = ДЕВЯТЫЙ — Digit9 ещё в границе /^Digit([1-9])$/, десятый её превысит и потребует анализа src/building-actions.js / src/building-ui.js', () => {
  const b = readJson(path.join(ROOT, 'assets', 'buildings', 'wanderer_shop.json'));
  const list = N.npcsForBuilding(NPCS, 5);
  const rows = BE.buildingActions(b, list, { day: 5 });
  assert.equal(rows.length, 8,
    'у здания 5 эффектов нет — список = dialog-строки по каждому NPC '
    + '(РОВНО ВОСЕМЬ), факт: ' + JSON.stringify(rows.map((r) => r.id)));
  assert.deepEqual(rows.map((r) => r.id),
    ['dialog', 'dialog:wanderer_trader', 'dialog:spice_trader',
      'dialog:caravan_trader', 'dialog:path_guide', 'dialog:tumbleweed',
      'dialog:' + ID, 'dialog:old_trader'],
    'порядок строк = нумерация файлов каталога, Хольд по-прежнему '
    + 'ПЕРВЫЙ; факт: ' + JSON.stringify(rows.map((r) => r.id)));
  assert.deepEqual(rows.map((r) => r.имя),
    ['Диалог: Хольд', 'Диалог: Хомут', 'Диалог: Шафран',
      'Диалог: Барыш', 'Диалог: Стрелка', 'Диалог: Перекати',
      'Диалог: ' + NAME, 'Диалог: Просол'],
    'подписи — «Диалог: <имя>», факт: ' + JSON.stringify(rows.map((r) => r.имя)));
  assert.deepEqual(rows.map((r) => r.npcId),
    ['wanderer_merchant', 'wanderer_trader', 'spice_trader',
      'caravan_trader', 'path_guide', 'tumbleweed', ID, 'old_trader'],
    'каждая строка несёт npcId своего NPC (роутинг клика); хоткеи '
    + 'Digit1..8 — общий механизм /^Digit([1-9])$/ (src/building-ui.js) '
    + 'по индексу строки, лимит 9 не достигнут');
});

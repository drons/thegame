// Задача 000320.30: «Мишень» — id arena_dummy, имя «Чурка»
// (Арена, 6-й NPC постройки; 30-я из 100 дочерних 000320).
//
// Контракт (ТЗ tasks/pending/000320.30.md; механизм мульти-NPC —
// 000320.01, spec/npc.md «Несколько NPC на постройку»,
// memory/000320-npcs-batch.md; профиль-эталон ЧИСТАЯ ПОДСКАЗКА —
// .21 «Стрелка» (000042)/.24 «Просол» (000045) и вся hint-only
// девятка каталога; свою память несёт
// memory/000320-arena_dummy.md):
//   * assets/npc/000051.json — id arena_dummy (свип по 50 занятым
//     — свободен), имя «Чурка» (выбор агента: заступ-чучело, конвенция
//     односложных прозвищ батча «Насечка»/«Кремень»/«Шрам»/«Просол»/
//     «Свисток»; роль-слово ТЗ «мишень» именем НЕ стало — правило
//     ландромина .22), роль «мишень» (фикс ТЗ — точным равенством;
//     свипов уникальности ролей нет), постройка
//     assets/buildings/arena.json (ТЗ-путь 000007.json мёртв с
//     000318.06 — zero-sweep tests/buildings-rename-000318.06.test.js
//     T5; путь — SLUG), 6-й NPC дома: Карк ПЕРВЫЙ, npcForBuilding(7)
//     продолжает возвращать Карка; хук истории «Стоит на арене тридцать
//     лет — рассказывает об ударах» — последнее предложение описания
//     (endsWith от ПОЛНОЙ строки хука с точкой, конвенция .22–.29;
//     scare-quotes слова «рассказывает» в ТЗ — выделение смысла, в
//     описание не вдвигаются — прецедент .29 «ДИСК/ТЗ первичен»);
//   * ГЛАВНОЕ ОТЛИЧИЕ ВОЛНЫ ОТ ПРЕДШЕСТВЕННИКОВ: счётчик каталога НЕ
//     ре-пинится — держатели мигрированы на живые ls-предикаты коммитом
//     000387.01 (memory/000387.01-npc-marker-migration.md); чистое
//     добавление 000051.json + sync зеленят 29 сиблинговых T1 без
//     единой ручной правки;
//   * профиль диалога — ЧИСТАЯ ПОДСКАЗКА (фикс ТЗ; форма эталона
//     диска .21/.24 — бриф «одна опция» на диске не реализована ни у
//     кого): РОВНО 3 опции prives/«подсказка» → hint_stance/
//     «подсказка» → hint_marks/«подсказка», РОВНО одна (последняя) с
//     {харизма:3}; блоков торговля/найм/квесты НЕТ → счётчики npc-refs
//     (торговля/goal/reward/сумма/уникальные) и R7 торгующих — ls-полы
//     000410, от неторговца не растут;
//   * ОБЯЗАННОСТЬ размещения (не вилка): Арена — категория
//     школа_навыков с особые_параметры.тренирует (swordsman + heavy),
//     живой контракт 000211.07 (tests/npc-data.test.js «школы»)
//     требует равенства sorted(тренирует-id) ≡ (обучение ? навыки :
//     []) для КАЖДОГО NPC школы — блок {навыки [swordsman, heavy] ≡
//     тренирует, 25/40 — шкала боевых школ} обязателен (наследует
//     решение .27/.28/.29); ТЗ-профиль соблюдён тем, что опции
//     «обучение» в диалоге НЕТ. Блок ИНЕРТЕН: train-вкладка UI
//     открывается только действием «обучение» (src/ui.js), которого
//     здесь нет (пин T5); кузнечное наставничество (heavy ∈
//     SKILL_CRAFT_TYPE) отсекается постройкой: typeBuildings
//     (кузнечное_дело) = [8, 25] ∌ 7 → canMentorCraft даёт reason
//     «нет постройки этого вида» (пин T6);
//   * порядок ключей JSON — [id, имя, роль, описание, постройки,
//     диалог, обучение] (гибрид подсказочного эталона 000042.json с
//     хвостом обучения .28/.29 — без «квесты»);
//   * опций с «для» — РОВНО 0: контракт A8a
//     (tests/npc-dialog-scope);
//   * тема диалога — удары/терпение/вмятины/память дерева; запрет-лист
//     ТЕКСТОВ диалога 107 = дисковый список .29 ЦЕЛИКОМ (103) + 4
//     зарезервированных оборота Свистка (memory/000320-arena_referee.md
//     для .30: «считают круги, а не обещания», «правило одно на всех»,
//     «черта важнее крика», «позор сходить с круга»); СВОИ 4 оборота
//     мишени зарезервированы для .31 — memory/000320-arena_dummy.md;
//     токен «арен» в списке с .04 и действует на ДИАЛОГ — слово
//     «арена» в репликах НЕ звучит (сканируются только тексты диалога;
//     в описании хук с «арене» легален);
//   * [E]-оверлей Арены — ШЕСТЬ dialog-строк в порядке каталога:
//     'dialog' (Карк) → 'dialog:sword_instructor' (Насечка) →
//     'dialog:arena_champion' (Кремень) → 'dialog:arena_challenger'
//     (Шрам) → 'dialog:arena_referee' (Свисток) → 'dialog:arena_dummy'
//     (Чурка); хоткеи Digit1..6 — общий механизм src/building-ui.js
//     /^Digit([1-9])$/; пин поднят .25 (ДВЕ), .27 (ТРИ), .28 (ЧЕТЫРЕ),
//     .29 (ПЯТЬ) и здесь (ШЕСТЬ) — ре-пинуты T7/T8
//     (.25/.26/.27/.28/.29).
//
// ЗУБ forbid-цепи 000372: T9 против .29 (own 107 / prev 103 / дельта
// ≡ MINE-константа файла .29 — 4 Свистка).
//
// КРАСНЫЕ (TDD): T1..T8 красные до зелёной стадии (000051.json нет,
// ростер Арены — ПЯВЕРО, оверлей 5 строк), без краха загрузки; T9
// зелёный и здесь, и после (цепь читается «назад»).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validateData } = require('./json-schema.js');

const ROOT = path.join(__dirname, '..');
const NDIR = path.join(ROOT, 'assets', 'npc');
const NEW = path.join(NDIR, '000051.json');
const SCHEMA = JSON.parse(
  fs.readFileSync(path.join(NDIR, 'schema.json'), 'utf8'));

const N = require('../src/npc.js');
const { NPCS } = require('../src/npc-data.js');
const BE = require('../src/building-effects.js');
const C = require('../src/craft.js');

const HOOK = 'Стоит на арене тридцать лет — рассказывает об ударах';
const ID = 'arena_dummy';
const NAME = 'Чурка';

const MINE = ['считают не удары, а вмятины',
  'дерево не спорит, дерево запоминает',
  'бьют не со зла — на память',
  'терпение измеряют не секундами, а ударами'];

function listNpcFiles() {
  return fs.readdirSync(NDIR)
    .filter((f) => /^\d{6}\.json$/.test(f))
    .sort();
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// --- T1: ls-предикат каталога + зеркало -------------------------------------

test('T1: каталог — ls-предикат: 000001..N подряд (N = счётчик диска); зеркало NPCS ≡ каталогу с arena_dummy', () => {
  const files = listNpcFiles();
  assert.ok(files.length >= 50,
    'в каталоге NPC не менее 50 файлов (000320.17: +Переписчик; 000320.18: '
    + '+Странствующий торговец; 000320.19: +Торговец специями; '
    + '000320.20: +Торговец каравана; 000347.02: +жрец солнца, жрица '
    + 'луны, горный жрец; 000320.21: +Проводник; 000320.22: +Перекати; '
    + '000320.23: +Сарбон; 000320.24: +Просол; 000320.25: +Насечка; '
    + '000320.26: +Костяшка; 000320.27: +Кремень; 000320.28: +Шрам; '
    + '000320.29: +Свисток; 000320.30: +Чурка), '
    + 'факт: ' + files.length);
  for (let i = 0; i < files.length; i++) {
    assert.equal(files[i],
      String(i + 1).padStart(6, '0') + '.json',
      'нумерация подряд без пропусков: индекс ' + i);
  }
  assert.equal(NPCS.length, files.length,
    'зеркало src/npc-data.js ≡ каталогу (sync не прогнан?), факт: '
    + NPCS.length);
  const last = NPCS[50];
  assert.ok(last, '51-я запись зеркала существует');
  assert.equal(last.id, ID,
    '51-я запись зеркала — arena_dummy (порядок = нумерация файлов)');
  assert.equal(NPCS[49].id, 'arena_referee',
    'guard: 50-я запись — Свисток (позиционные NPCS[..] не сдвинуты)');
});

// --- T2: 000051.json валиден по схеме + порядок ключей + roundtrip ---------

test('T2: assets/npc/000051.json валиден по schema; ключи в порядке подсказочного эталона с обязанностью обучения (id, имя, роль, описание, постройки, диалог, обучение — без торговля/найм/квесты); roundtrip-канон; негативы — мимо схемы и мимо порядка ключей', () => {
  assert.ok(fs.existsSync(NEW),
    'RED: assets/npc/000051.json отсутствует (NPC задачи ещё не создан)');
  const data = readJson(NEW);
  assert.deepEqual(validateData(SCHEMA, data, 'npc/000051'), [],
    '000051.json обязан проходить assets/npc/schema.json');
  const KEYS = ['id', 'имя', 'роль', 'описание', 'постройки', 'диалог',
    'обучение'];
  assert.deepEqual(Object.keys(data), KEYS,
    'порядок ключей — подсказочный эталон диска 000042.json (…, диалог) '
    + 'плюс обязательный «обучение» последней строкой (контракт '
    + '000211.07 «школы» для каждого NPC школы_навыков — наследует '
    + 'решение .27/.28/.29, memory/000320-arena_dummy.md); блоков '
    + 'торговля/найм/квесты нет');
  const raw = fs.readFileSync(NEW, 'utf8');
  assert.equal(raw, JSON.stringify(data, null, 2) + '\n',
    '000051.json — roundtrip JSON.stringify(obj,null,2)+перевод строки');
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
  badPath.постройки = ['000007.json'];
  assert.notDeepEqual(validateData(SCHEMA, badPath, 'npc/badpath'), [],
    'постройки без пути assets/buildings/ (numeric-форма) — вне паттерна схемы');
  const numericPath = JSON.parse(JSON.stringify(data));
  numericPath.постройки = ['assets/buildings/' + '000007' + '.json'];
  assert.notDeepEqual(validateData(SCHEMA, numericPath, 'npc/numericpath'), [],
    'numeric-путь постройки — вне паттерна схемы: база содержит 000318.06, '
    + 'здания — slug-именование, numeric-форма мертва (zero-sweep '
    + 'tests/buildings-rename-000318.06.test.js T5); ТЗ-путь '
    + '000007.json устарел — живая ссылка assets/buildings/arena.json');
  const badPrice = JSON.parse(JSON.stringify(data));
  badPrice.обучение.цена_за_уровень = 0;
  assert.notDeepEqual(validateData(SCHEMA, badPrice, 'npc/badprice'), [],
    'цена_за_уровень 0 — вне схемы (minimum 1, максимум 10000)');
  const badSkill = JSON.parse(JSON.stringify(data));
  badSkill.обучение.навыки = ['Кулак'];
  assert.notDeepEqual(validateData(SCHEMA, badSkill, 'npc/badskill'), [],
    'навык «Кулак» — вне паттерна id ^[a-z][a-z0-9_]*$');
  const withQuests = JSON.parse(JSON.stringify(data));
  withQuests.квесты = [{ id: 'dum_dummy', название: 'Д', описание: 'О',
    цель: { тип: 'kill_group', группа: 0, количество: 1 },
    награда: { опыт: 10, золото: 10 } }];
  assert.notDeepEqual(Object.keys(withQuests), KEYS,
    'лишний блок «квесты» — вне эталона ключей: схема блок допускает '
    + '(невидимость свипам пинит не схема, а T2/T6), профиль чистая '
    + 'подсказка держится СЛОВОМ, не витриной');
});

// --- T3: id и имя уникальны (sweep) ----------------------------------------

test('T3: id arena_dummy и имя «Чурка» уникальны в sweep каталога', () => {
  assert.ok(fs.existsSync(NEW), 'RED: assets/npc/000051.json отсутствует');
  const ids = new Set();
  const names = new Set();
  for (const f of listNpcFiles()) {
    const d = readJson(path.join(NDIR, f));
    assert.ok(!ids.has(d.id), 'дубликат id «' + d.id + '» (файл ' + f + ')');
    assert.ok(!names.has(d.имя), 'дубликат имени «' + d.имя + '» (файл ' + f + ')');
    ids.add(d.id);
    names.add(d.имя);
  }
  assert.ok(ids.has(ID), 'id arena_dummy в каталоге');
  assert.ok(names.has(NAME), 'имя «Чурка» в каталоге');
});

// --- T4: роль-фикс, описание с хуком и уникально ----------------------------

test('T4: роль РОВНО «мишень» (точная строка ТЗ ×2 + сводная таблица; свипов уникальности ролей нет — роль-слово ТЗ именем не стало, правило ландромина .22: имя «Чурка»; «чемпион арены» Кремня .27, «вызовший» Шрама .28 и «арбитр» Свистка .29 — другие роль-строки); описание непустое, хук «Стоит на арене тридцать лет — рассказывает об ударах» — последнее предложение, и НЕ копия описания другого NPC', () => {
  assert.ok(fs.existsSync(NEW), 'RED: assets/npc/000051.json отсутствует');
  const data = readJson(NEW);
  assert.ok(typeof data.описание === 'string' && data.описание.trim() !== '',
    'описание непустое');
  assert.equal(data.роль, 'мишень',
    'роль — фикс-строка «мишень» (ТЗ; Т4 пишет точное равенство, '
    + 'свипов уникальности ролей нет — мишень не сосед по роли ни с '
    + 'чемпионом арены .27, ни с арбитром .29, ни с мастером арены '
    + 'Карком)');
  assert.ok(data.описание.includes(HOOK),
    'хук истории «' + HOOK + '» (ТЗ) в описании дословно (scare-quotes '
    + 'слова «рассказывает» в ТЗ — выделение смысла, не буква строки — '
    + 'прецедент .29 «ДИСК/ТЗ первичен»)');
  assert.ok(data.описание.endsWith(HOOK + '.'),
    'хук — ПОСЛЕДНЕЕ предложение описания (с заглавной, с точкой на '
    + 'конце — прецеденты .02–.29; endsWith идёт от ПОЛНОЙ строки '
    + 'хука, конвенция .22–.29); факт: '
    + JSON.stringify(data.описание.slice(-90)));
  for (const f of listNpcFiles()) {
    if (f === '000051.json') continue;
    const d = readJson(path.join(NDIR, f));
    assert.notEqual(d.описание, data.описание,
      'описание совпадает с ' + f + ' (не копия существующего)');
  }
});

// --- T5: диалог — профиль чистая подсказка, без «для», запрет-лист 107 -----

test('T5: диалог валиден по схеме, РОВНО 3 опции как у подсказочного эталона .21/.24 (prives/подсказка, hint_stance/подсказка, hint_marks/подсказка), ВСЕ действия «подсказка», РОВНО одна с {харизма:3} на последней, id опций уникальны, опций с «для» — ровно 0, ДЕЙСТВИЙ «обучение» и «квесты» — ровно 0 (чистая подсказка + инертность данных обучения), запрет-лист 107 подстрок (дисковый список .29 ЦЕЛИКОМ = 103 + 4 оборота Свистка) по ТЕКСТАМ диалога', () => {
  assert.ok(fs.existsSync(NEW), 'RED: assets/npc/000051.json отсутствует');
  const data = readJson(NEW);
  assert.ok(Array.isArray(data.диалог) && data.диалог.length >= 1,
    'диалог непустой (schema minItems 1)');
  assert.equal(data.диалог.length, 3,
    'диалог — ровно 3 опции (prives / hint_stance / hint_marks — форма '
    + 'эталона чистая подсказка диска: .21 «Стрелка» (000042), .24 '
    + '«Просол» (000045) и вся hint-only девятка; бриф «одна опция» '
    + 'на диске не реализована ни у кого), факт: ' + data.диалог.length);
  const ACTIONS = SCHEMA.properties.диалог.items.properties.действие.enum;
  for (const o of data.диалог) {
    assert.ok(ACTIONS.includes(o.действие),
      'действие «' + o.действие + '» вне enum схемы');
    const errs = validateData(SCHEMA.properties.диалог.items, o, 'диалог');
    assert.deepEqual(errs, [],
      'опция «' + o.id + '» — вне схемы диалога: ' + JSON.stringify(errs));
  }
  assert.deepEqual(data.диалог.map((o) => o.id),
    ['prives', 'hint_stance', 'hint_marks'],
    'id опций — причесон подсказочного профиля .21/.24: prives первым, '
    + 'hint_* дальше, харизма-хит последней');
  assert.deepEqual(data.диалог.map((o) => o.действие),
    ['подсказка', 'подсказка', 'подсказка'],
    'ВСЕ опции «подсказка» — профиль чистая подсказка (фикс ТЗ): '
    + 'опций «квесты»/«торговля»/«найм»/«обучение» нет; train-вкладка '
    + 'UI открывается только действием «обучение» (src/ui.js), её '
    + 'отсутствие и есть инертность блока обучения (вилка .27/.28/.29)');
  assert.equal(data.диалог.filter((o) => o.действие !== 'подсказка').length, 0,
    'профиль чистая подсказка: опций с действием вне {подсказка} — ровно 0');
  const ids = data.диалог.map((o) => o.id);
  assert.equal(new Set(ids).size, ids.length, 'id опций диалога уникальны');
  assert.equal(data.диалог.filter((o) => o.для !== undefined).length, 0,
    'опций с «для» — ровно 0: мишень говорит со всеми; добавление '
    + '«для» требует ре-пина A8a (tests/npc-dialog-scope) и запрещено');
  const withReq = data.диалог.filter((o) => o.требования !== undefined);
  assert.equal(withReq.length, 1,
    'ровно одна опция с требованиями (прецедент hint_map .21 и '
    + 'всей цепи .17–.29)');
  assert.deepEqual(withReq[0].требования, { харизма: 3 },
    'требование опции — {харизма: 3} (харизма-прецедент батча, НЕ «проверка»)');
  assert.equal(data.диалог.indexOf(withReq[0]), 2,
    'опция с требованием — ПОСЛЕДНЯЯ (эталон .21/.24: hint_* последней)');
  const texts = data.диалог.map((o) => o.текст).join(' ');
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
    'проигравших не забывают', 'вызов принимают, а не ждут', 'титул тяжелее пояса',
    'перевяжут до боя', 'к поединку готовят, а не к славе',
    'первый вызов не торгуют',
    'стойкость покупают не деньгами',
    'считают круги, а не обещания', 'правило одно на всех',
    'черта важнее крика', 'позор сходить с круга']) {
    assert.ok(!texts.includes(w),
      'тема чужого NPC (.04 «старые походы»; токен «арен» в списке с '
      + '.04 действует на ДИАЛОГ — наша мишень живёт без слова «арена» '
      + '(разговор — про удары/терпение/вмятины/память дерева; в '
      + 'описании хук с «арене» легален); .05 коллекция, .06 '
      + 'ковка/хвостовик, .07 наём/жалованье, .08 метла/стена клинков, '
      + '.09 броня-звонок, .10 големы; тексты Милы, Отвара, Травницы, '
      + 'Жгута, Зиры, Пергамента, Пробника, Грифеля, Хольда, Хомута, '
      + 'Шафрана, Барыша, Проводника, жрецов 000347.02, Перекати, '
      + 'Сарбона, Просола, Насечки, Костяшки, Кремня, Шрама и Свистка — '
      + 'дисковый список .29 ЦЕЛИКОМ + 4 оборота Свистка, формула '
      + 'наследования memory/000372-forbidden-chain-teeth.md) не '
      + 'дублируется: подстрока «' + w + '»');
  }
  for (const w of MINE) {
    assert.ok(texts.includes(w),
      'СВОЙ оборот «' + w + '» живёт в текстах 000051.json — резерв '
      + '.31+ по memory/000320-arena_dummy.md (формула наследования: '
      + 'список .31 = дисковый .30 ЦЕЛИКОМ + эти 4)');
  }
});

// --- T6: чистая подсказка + обязанность обучения (контракт «школы» ----------

test('T6: профиль ЧИСТАЯ подсказка: блоков торговля/найм/квесты НЕТ и строки «"квесты"»/«"торговля"» в JSON нет (счётчики npc-refs 234/20 и goal 5/reward 11/total 250 НЕ растут; 000051.json невидим свипам) + ДАННЫЕ обучения как ОБЯЗАННОСТЬ размещения: блок {навыки ≡ тренирует Арены [swordsman, heavy] (зуб контракта 000211.07 «школы»), цена 25/40} при РОВНО 0 диалоговых действий «обучение» и отказе canMentorCraft(кузнечное) «нет постройки этого вида» (тип ∌ Арена 7); постройки [assets/buildings/arena.json]; зеркало NPCS[50]: постройки [7], диалог/описание/обучение deepEqual, квестов нет', () => {
  assert.ok(fs.existsSync(NEW), 'RED: assets/npc/000051.json отсутствует');
  const data = readJson(NEW);
  for (const block of ['торговля', 'найм', 'квесты']) {
    assert.ok(!(block in data),
      'в JSON нет блока «' + block + '»: профиль ЧИСТАЯ подсказка — '
      + 'счётчики npc-refs (торговля/goal/reward/сумма/уникальные) '
      + 'и R7 торгующих (tests/item-prices-000322) — ls-полы 000410, '
      + 'от неторговца не растут');
  }
  const flat = JSON.stringify(data);
  for (const needle of ['"торговля"', '"квесты"', '"найм"']) {
    assert.ok(!flat.includes(needle),
      'ни блоков, ни действий «' + needle + '» в JSON нет — чистая '
      + 'подсказка (мишень невидима свипам: прецедент .24 «Просол», '
      + 'фельдшер .14, арбитр .29)');
  }
  assert.ok('обучение' in data,
    'в JSON есть блок «обучение» — ОБЯЗАННОСТЬ размещения: Арена '
    + 'категория школа_навыков, контракт «школы» требует равенства '
    + 'без диалоговой опции (наследует решение .27/.28/.29)');
  assert.deepEqual(Object.keys(data.обучение),
    ['навыки', 'цена_за_уровень', 'цена_переноса_за_уровень'],
    'ключи блока — формат эталона 000005.json');
  assert.equal(data.обучение.цена_за_уровень, 25,
    'цена_за_уровень 25 — шкала боевых школ каталога (Карк/Родар/'
    + 'Глыба/Тигель/Пробник/Насечка/Кремень/Шрам/Свисток — 25/40; '
    + 'runtime их не читает: цена = schoolTrainPrice 20+10·L², '
    + 'src/npc.js)');
  assert.equal(data.обучение.цена_переноса_за_уровень, 40,
    'цена_переноса_за_уровень 40 — та же шкала');
  const arena = readJson(path.join(ROOT, 'assets', 'buildings', 'arena.json'));
  assert.equal(arena.id, 7, 'здание arena — id 7 (фикс размещения ТЗ)');
  assert.equal(arena.категория, 'школа_навыков',
    'категория — школа_навыков (контракт «школы» её и свипует)');
  const trains = arena.особые_параметры.тренирует;
  assert.ok(Array.isArray(trains) && trains.length === 2,
    'тренирует Арены — массив из двух ссылок (rename-устойчивая форма: '
    + 'пин идём РЕЗОЛВЕННЫМИ id, не numeric-путями)');
  const trainIds = trains.map((v) => {
    assert.ok(fs.existsSync(path.join(ROOT, v)),
      'ссылка тренирует «' + v + '» существует');
    return readJson(path.join(ROOT, v)).id;
  });
  assert.deepEqual([...trainIds].sort(), [...data.обучение.навыки].sort(),
    'id целей тренирует ≡ навыки обучения (зуб контракта 000211.07 '
    + 'tests/npc-data.test.js «школы»; удаление/подмена блока красит '
    + 'чужой «школы» + этот T6 — мутация M1)');
  assert.deepEqual([...data.обучение.навыки].sort(), ['heavy', 'swordsman'],
    'навыки — РОВНО [swordsman, heavy] (≡ тренирует Арены; ТЗ-профиль '
    + '«подсказка» сохранён: опции «обучение» в диалоге нет — пин T5)');
  assert.equal(data.диалог.filter((o) => o.действие === 'обучение').length, 0,
    'ДЕЯСТВИЙ «обучение» в диалоге ровно 0 — train-вкладка UI не '
    + 'открывается (src/ui.js входит в неё только по этому действию); '
    + 'инертность данных обучения, часть 1');
  assert.equal(C.SKILL_CRAFT_TYPE.heavy, 'кузнечное_дело',
    'heavy маппится в кузнечное дело (src/craft.js) — риск synthesis '
    + 'наставничества проверяется ниже постройкой');
  assert.ok(!C.typeBuildings('кузнечное_дело').includes(7),
    'кузнечное_дело не имеет Арены среди зданий рецептов '
    + '(typeBuildings=' + JSON.stringify(C.typeBuildings('кузнечное_дело'))
    + ') — инертность данных обучения, часть 2 (прецедент Карка 000005, '
    + 'Шрама 000049 и Свистка 000050 с тем же блоком на той же Арене)');
  assert.deepEqual(C.canMentorCraft(NPCS[50], { alive: true },
    'кузнечное_дело'),
    { ok: false, reason: 'нет постройки этого вида' },
    'canMentorCraft(Чурка, …, кузнечное) отказывает по постройке '
    + '(не по навыку: heavy ∈ npcCraftTypes, но дом 7 ∉ [8, 25])');
  assert.deepEqual(C.canMentorCraft(NPCS[50], { alive: true }, 'алхимия'),
    { ok: false, reason: 'не обучает этот вид крафта' },
    'алхимия/столярное недоступны вдвойне (навыков нет в блоке)');
  assert.deepEqual(data.постройки, ['assets/buildings/arena.json'],
    'постройка — Арена (фикс ТЗ; путь — SLUG: база содержит 000318.06, '
    + 'numeric-путь зданий больше НЕ ref; уникальные постройки npc-refs '
    + '17 НЕ растут — Арена уже в множестве у Карка, Насечки, Кремня, '
    + 'Шрама и Свистка, total 52→53)');
  const mirror = NPCS[50];
  assert.ok(mirror && mirror.id === ID,
    'зеркало: 51-я запись arena_dummy');
  assert.equal(mirror.роль, 'мишень',
    'роль в зеркале — «мишень» (фикс ТЗ)');
  for (const block of ['торговля', 'найм', 'квесты']) {
    assert.ok(!(block in mirror),
      'в зеркале нет блока «' + block + '» (следует из JSON)');
  }
  assert.deepEqual(mirror.постройки, [7],
    'зеркало: постройки [7] — sync резолвит ссылку Арены в id');
  assert.deepEqual(mirror.диалог, data.диалог,
    'зеркало NPCS[50].диалог ≡ JSON-диалог бит-в-бит');
  assert.deepEqual(mirror.описание, data.описание,
    'зеркало NPCS[50].описание ≡ JSON');
  assert.deepEqual(mirror.обучение, data.обучение,
    'зеркало NPCS[50].обучение ≡ JSON (резолвинга нет — навыки живут '
    + 'строками id, прецедент .26/.27/.28/.29 T6)');
});

// --- T7: ростер Арены — ШЕСТЕРО, Карк первый; двор 9 и дом 5 не тронуты -----

test('T7: npcsForBuilding(NPCS, 7) — СЕВЕРО Арены в порядке каталога [arena_master, sword_instructor, arena_champion, arena_challenger, arena_referee, arena_dummy, arena_doctor]; npcForBuilding(7) — по-прежнему Карк; Гладиаторский двор (9) — ОДИН не тронут (.26); дом 5 Лавки странника — ВОСЕМЬ не тронут; Магазин магии — ЧЕТЫРЕ, Аптекарь — ПЯТЬ, Бронник — ТРИ и Оружейная — ДЕВЯТЬ не тронуты', () => {
  const list = N.npcsForBuilding(NPCS, 7);
  assert.deepEqual(list.map((n) => n.id),
    ['arena_master', 'sword_instructor', 'arena_champion',
      'arena_challenger', 'arena_referee', ID, 'arena_doctor'],
    'Арена (7): Карк (000005) + Насечка (000046) + чемпион Кремень '
    + '(000048) + вызовший Шрам (000049) + арбитр Свисток (000050) + '
    + 'мишень Чурка (000051) + врач Сухарь (000052, ре-пин 000320.31), порядок = нумерация файлов; факт: '
    + JSON.stringify(list.map((n) => n.id)));
  assert.equal(N.npcForBuilding(NPCS, 7).id, 'arena_master',
    'npcForBuilding — ПЕРВЫЙ по номеру файла (Карк; HUD/«Здесь:» '
    + 'не тронуты — города и cities-снапы не двигаются)');
  const yard = N.npcsForBuilding(NPCS, 9);
  assert.deepEqual(yard.map((n) => n.id), ['fist_instructor'],
    'Гладиаторский двор (9) — ОДИН не тронут (.26-ростер Костяшки; '
    + '.30 поселилась на Арену): '
    + JSON.stringify(yard.map((n) => n.id)));
  const lavka = N.npcsForBuilding(NPCS, 5);
  assert.deepEqual(lavka.map((n) => n.id),
    ['wanderer_merchant', 'wanderer_trader', 'spice_trader',
      'caravan_trader', 'path_guide', 'tumbleweed', 'caravan_leader',
      'old_trader'],
    'Лавка странника (5) — ВОСЕМЬ не тронуты (.30 — НЕ дом 5): '
    + JSON.stringify(lavka.map((n) => n.id)));
  const magic = N.npcsForBuilding(NPCS, 4);
  assert.deepEqual(magic.map((n) => n.id),
    ['magic_merchant', 'scroll_merchant', 'magic_instructor', 'scribe'],
    'Магазин магии (4) — ЧЕТЫРЕ NPC не тронуты: '
    + JSON.stringify(magic.map((n) => n.id)));
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
      'ex_mercenary',
      'armory_apprentice'],
    'Оружейная (1) — ДЕВЯТЬ NPC не тронута (Скарн-дуэлянт остаётся '
    + 'там — наша мишень живёт на Арене): '
    + JSON.stringify(armory.map((n) => n.id)));
});

// --- T8: оверлей Арены — ровно 6 dialog-строк --------------------------------

test('T8: [E]-оверлей Арены — ровно 7 строк: dialog (Карк), dialog:sword_instructor (Насечка), dialog:arena_champion (Кремень), dialog:arena_challenger (Шрам), dialog:arena_referee (Свисток), dialog:arena_dummy (Чурка), dialog:arena_doctor (Сухарь) — пин поднят .25 (ДВЕ), .27 (ТРИ), .28 (ЧЕТЫРЕ), .29 (ПЯТЬ), 000320.30 (ШЕСТЬ) и здесь (СЕДЕМЬ, ре-пин 000320.31 в T7); у дома 7 эффектов нет — EFFECTS не содержит ключа «7», только dialog-строки; хоткеи Digit1..7 — граница /^Digit([1-9])$/ не превышена (диапазон Арены .25–.31: следующие росты — НЕ по Арене, .31 — последний житель дома 7 по сводной таблице)', () => {
  const b = readJson(path.join(ROOT, 'assets', 'buildings', 'arena.json'));
  assert.equal(b.id, 7, 'здание arena — id 7 (фикс размещения)');
  assert.equal(b.категория, 'школа_навыков',
    'категория — школа_навыков (контракт «школы» её и свипует)');
  assert.ok(!('7' in BE.EFFECTS),
    'у дома 7 эффектов НЕТ (EFFECTS не содержит ключа «7») — список '
    + 'здания = только dialog-строки (прецедент .25/.27/.28/.29)');
  const list = N.npcsForBuilding(NPCS, 7);
  const rows = BE.buildingActions(b, list, { day: 5 });
  assert.equal(rows.length, 7,
    'у здания 7 эффектов нет — список = dialog-строки по каждому NPC '
    + '(РОВНО СЕМЬ после .31), факт: ' + JSON.stringify(rows.map((r) => r.id)));
  assert.deepEqual(rows.map((r) => r.id),
    ['dialog', 'dialog:sword_instructor', 'dialog:arena_champion',
      'dialog:arena_challenger', 'dialog:arena_referee',
      'dialog:' + ID, 'dialog:arena_doctor'],
    'порядок строк = нумерация файлов каталога, Карк по-прежнему '
    + 'ПЕРВЫЙ (суффикс «:<id>» со второй строки — механизм '
    + 'building-actions); факт: ' + JSON.stringify(rows.map((r) => r.id)));
  assert.deepEqual(rows.map((r) => r.имя),
    ['Диалог: Карк', 'Диалог: Насечка', 'Диалог: Кремень',
      'Диалог: Шрам', 'Диалог: Свисток', 'Диалог: ' + NAME, 'Диалог: Сухарь'],
    'подписи — «Диалог: <имя>», факт: ' + JSON.stringify(rows.map((r) => r.имя)));
  assert.deepEqual(rows.map((r) => r.npcId),
    ['arena_master', 'sword_instructor', 'arena_champion',
      'arena_challenger', 'arena_referee', ID, 'arena_doctor'],
    'каждая строка несёт npcId своего NPC (роутинг клика); хоткеи '
    + 'Digit1..7 — общий механизм /^Digit([1-9])$/ (src/building-ui.js) '
    + 'по индексу строки');
});

// --- T9: forbid-цепь — зуб длины/уникальности/включения (000372) -------------

test('T9: forbid-цепь 000372 (.29→.30) — guard-массив T5 этого файла РОВНО 107 и без дублей, предыдущего звена .29 РОВНО 103 и без дублей, prev ⊆ own, дельта — РОВНО 4 оборота Свистка (формула наследования; хвост цепи — резерв 4 мишени НЕ в списке, он для .31)', () => {
  const extract = (file) => {
    const src = fs.readFileSync(file, 'utf8');
    const anchor = "test('" + "T5:";
    const at = src.indexOf(anchor);
    assert.ok(at >= 0,
      path.basename(file) + ': якорь T5 не найден — порча имени '
      + 'теста-носителя цепи ловится здесь (ERR_ASSERTION, не крах '
      + 'загрузки)');
    const m = src.slice(at).match(/for \(const w of \[([\s\S]*?)\]\)/);
    assert.ok(m,
      path.basename(file) + ': guard-массив не найден после якоря T5');
    return [...m[1].matchAll(/'([^']*)'/g)].map((x) => x[1]);
  };
  const EXPECT_ADDS = [
    'считают круги, а не обещания', 'правило одно на всех',
    'черта важнее крика', 'позор сходить с круга',
  ];
  const own = extract(__filename);
  const prevFile = path.join(__dirname, 'npc-000320.29.test.js');
  assert.ok(fs.existsSync(prevFile),
    'предыдущее звено цепи tests/npc-000320.29.test.js существует');
  const prev = extract(prevFile);
  assert.equal(own.length, 107,
    'guard-массив T5 этого файла — РОВНО 107 (пин по диску; вырез или '
    + 'лишний элемент ловятся здесь); факт: ' + own.length);
  assert.equal(new Set(own).size, own.length,
    'guard-массив этого файла — элементы уникальны (дубль ловится здесь)');
  assert.equal(prev.length, 103,
    'guard-массив T5 .29 — РОВНО 103 (то же число пинует T9 файла .29 — '
    + 'двойное покрытие); факт: ' + prev.length);
  assert.equal(new Set(prev).size, prev.length,
    'guard-массив .29 — элементы уникальны');
  const ownSet = new Set(own);
  const lost = [...new Set(prev)].filter((x) => !ownSet.has(x));
  assert.deepEqual(lost, [],
    'строгое включение prev ⊆ own — ни один элемент .29 не потерян; '
    + 'потеряно: ' + JSON.stringify(lost));
  const prevSet = new Set(prev);
  const adds = own.filter((x) => !prevSet.has(x));
  assert.deepEqual([...adds].sort(), [...EXPECT_ADDS].sort(),
    'дельта (own минус prev) — РОВНО 4 оборота Свистка = MINE-константа '
    + 'файла .29 (формула наследования '
    + 'memory/000320-arena_referee.md); СВОИ 4 оборота мишени (резерв '
    + '.31 по memory/000320-arena_dummy.md) в списке НЕ сидят; факт: '
    + JSON.stringify(adds));
});

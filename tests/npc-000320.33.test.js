// Задача 000320.33: «Кузнец-наставник» — id forge_instructor, имя «Дымарь»
// (Кузница, 3-й NPC постройки; 33-я из 100 дочерних 000320).
//
// Контракт (ТЗ tasks/pending/000320.33.md; механизм мульти-NPC —
// 000320.01, spec/npc.md «Несколько NPC на постройку»,
// memory/000320-npcs-batch.md; профиль-эталон ОБУЧЕНИЕ+ТОРГОВЛЯ у
// наставника — Тигель 000031 (.13), школьный двойник — Торн 000006;
// свою память несёт memory/000320-forge_instructor.md):
//   * assets/npc/000054.json — id forge_instructor (свип по 53 занятому —
//     свободен; паттерн golem/alchemy/magic_instructor), имя «Дымарь»
//     (выбор агента: прозвищная существительная конвенция батча
//     «Сухарь»/«Перекати»/«Рудяк», кузнечный дым; роль-слова ТЗ
//     «наставник»/«кузнец» именами НЕ стали — правило ландромина .22;
//     свип 0 хитов ДО записи; ловушки: «Горн» — слово горна по всему
//     каталогу, «Горм» занят 000025, «Чекан» занят 000027), роль
//     «наставник» (фикс ТЗ — точным равенством; на диске так же у
//     Глыбы/Тигеля/Пробника; свипов уникальности ролей нет), постройка
//     assets/buildings/blacksmith.json (id 8, мировой слот map_index 5;
//     ТЗ-путь 000008.json мёртв с 000318.06 — zero-sweep
//     tests/buildings-rename-000318.06.test.js T5; путь — SLUG), 3-й NPC
//     дома 8 (на диске ДВОЕ: Торн 000006 + Рудяк 000053 — мы ТРЕТИЙ);
//     хук истории «Учит кузнечному делу у горна» — последнее предложение
//     описания (endsWith от ПОЛНОЙ строки хука с точкой, конвенция
//     .02–.32);
//   * счётчик каталога НЕ ре-пинится — держатели живут ls-предикатами
//     миграции 000387.01 (боевая приёмка в .30): чистое добавление
//     000054.json + sync зеленит сиблинговые T1 без ручной правки;
//   * профиль диалога — ОБУЧЕНИЕ (фикс ТЗ; ФОРМА — каталожная конвенция
//     роли «наставник»: 9/9 NPC с ролью, содержащей «наставник», имеют
//     РОВНО одно действие «обучение» — ЭРРАТА БРИФА «ДЕЙСТВИЙ
//     «обучение» НЕ добавлять» переносит инертность торгового/врачебного
//     профиля (.32/.31 — train-вкладка там декоративна) на школу, где
//     обучение и есть профиль; прецедент формы — Тигель .13, он же
//     наставник-торговец чертежа): РОВНО 4 опции prives/«подсказка» →
//     train/«обучение» → trade/«торговля» → hint_forge/«подсказка» +
//     {харизма:3} на последней; «для» РОВНО 0 (контракт A8a);
//   * ОБЯЗАННОСТЬ размещения (не вилка): Кузница — категория
//     школа_навыков с особые_параметры.тренирует (forge + back), живой
//     контракт 000211.07 (tests/npc-data.test.js «школы») требует
//     равенства sorted(тренирует-id) ≡ (обучение ? навыки : []) для
//     КАЖДОГО NPC школы — блок {навыки [forge, back] ≡ тренирует};
//     цены 25/40 — СВОЯ шкала наставника (доминанта каталога: 7 из 9
//     прежних роль-«наставник»/«наставник-*» держат 25/40 —
//     Карк/Родар/Глыба/Тигель/Пробник/Насечка/Костяшка, и только
//     Лейна/Фикка 20/35; 20/35 Торна/Рудяка — данные дома 8,
//     равенство цен между NPC одной постройки НИ ОДИН контракт не
//     пинует — «школы» пинует только навыки); блок АКТИВЕН и по
//     диалогу (train-опция), и по SRC-1: canMentorCraft(кузнечное_дело)
//     даёт ok (forge ∈ SKILL_CRAFT_TYPE, дом 8 ∈ typeBuildings =
//     [8, 25]) → торговля ОБЯЗАНА содержать
//     assets/items/blueprint_forge.json (контракт «наставник ⇔ продавец
//     чертежа», tests/craft-scroll-sources.test.js SRC-1; прецеденты
//     Торн/Тигель/Рудяк); mentor_-опция синтезируется рантаймом вне
//     данных (src/npc.js) — она ДОПОЛНЯЕТ явную train-опцию, как у
//     Торна (craft-mentor ND-1);
//   * порядок ключей JSON — [id, имя, роль, описание, постройки, диалог,
//     обучение, торговля] (побайтовый порядок эталона 000006.json —
//     двойной блок обучения+торговли без «квесты»);
//   * торговля — РОВНО 1 существующий предмет: blueprint_forge
//     (виртуальный номер 000077 .318.08-реестра; путь slug; цена — в
//     JSON предмета base_price 120 (000322), mult_продажи 0.5,
//     количество 1, mult_покупки — ключ ОТСУТСТВУЕТ; витрина = РОВНО
//     чертёж, как у Тигеля — зуб SRC-1, остальное не наш профиль);
//     чертёж уже торгуем Торном/Рудяком → уникальные 202 БЕЗ;
//   * тема диалога — терпение/край/огонь/чертёж; запрет-лист ТЕКСТОВ
//     диалога 119 = дисковый список .32 ЦЕЛИКОМ (115) + 4 зарезервированных
//     оборота Рудяка (memory/000320-ore_merchant.md для .33: «жилу ищут
//     не ногами, а головой», «руда в горе молчит, а в возе говорит»,
//     «металл начинают ломом, а кончают весом», «жилу держат не
//     жадностью, а порядком» — живут в текстах 000053.json); СВОИ 4
//     оборота наставника зарезервированы для .34 —
//     memory/000320-forge_instructor.md; МИННЫЕ ПОЛЯ кузнечной тематики
//     уже В списке: «молотк» (Чекан), «от кузницы до кузницы» (Хольд),
//     «спрашивай про руду» (Хольд), «три металла на прилавке» (Барыш),
//     «нагрудник» (Чекан), «закалк»/«звон»/«трещин» (Чекан) — тексты
//     Дымаря прогнаны списком 119 ДО записи (0 пересечений);
//   * [E]-оверлей Кузницы — три dialog-строки + крафт-строка СИНТЕЗОМ
//     КОНЦОМ (000126): 'dialog' (Торн) → 'dialog:ore_merchant' (Рудяк) →
//     'dialog:forge_instructor' (Дымарь) → 'craft'; хоткеи Digit1..4 —
//     общий механизм src/building-ui.js /^Digit([1-9])$/; пин роста
//     дома 8 ВПЕРВЫЕ поднят в .32 (ДВОЕ), здесь — ТРОЕ; CU-3
//     tests/craft-ui.test.js передаёт Торна ЯВНО — ['dialog','craft']
//     не движется.
//
// ЗУБ forbid-цепи 000372: T9 против .32 (own 119 / prev 115 / дельта
// ≡ MINE-константа файла .32 — 4 Рудяка).
//
// КРАСНЫЕ (TDD): T1..T8 красные до зелёной стадии (000054.json нет,
// ростер Кузницы — ДВОЕ, оверлей 3 строки), без краха загрузки; T9
// зелёный и здесь, и после (цепь читается «назад»).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validateData } = require('./json-schema.js');

const ROOT = path.join(__dirname, '..');
const NDIR = path.join(ROOT, 'assets', 'npc');
const NEW = path.join(NDIR, '000054.json');
const SCHEMA = JSON.parse(
  fs.readFileSync(path.join(NDIR, 'schema.json'), 'utf8'));

const N = require('../src/npc.js');
const { NPCS } = require('../src/npc-data.js');
const BE = require('../src/building-effects.js');
const C = require('../src/craft.js');

const HOOK = 'Учит кузнечному делу у горна';
const ID = 'forge_instructor';
const NAME = 'Дымарь';

const MINE = ['железо терпение любит больше силы',
  'спешка портит край',
  'огонь проверяет, а не тешит',
  'мастер не тот, кто не мажет, а тот, кто правит'];

function listNpcFiles() {
  return fs.readdirSync(NDIR)
    .filter((f) => /^\d{6}\.json$/.test(f))
    .sort();
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// --- T1: ls-предикат каталога + зеркало -------------------------------------

test('T1: каталог — ls-предикат: 000001..N подряд (N = счётчик диска); зеркало NPCS ≡ каталогу с forge_instructor', () => {
  const files = listNpcFiles();
  assert.ok(files.length >= 53,
    'в каталоге NPC не менее 53 файла (000320.17: +Переписчик; 000320.18: '
    + '+Странствующий торговец; 000320.19: +Торговец специями; '
    + '000320.20: +Торговец каравана; 000347.02: +жрец солнца, жрица '
    + 'луны, горный жрец; 000320.21: +Проводник; 000320.22: +Перекати; '
    + '000320.23: +Сарбон; 000320.24: +Просол; 000320.25: +Насечка; '
    + '000320.26: +Костяшка; 000320.27: +Кремень; 000320.28: +Шрам; '
    + '000320.29: +Свисток; 000320.30: +Чурка; 000320.31: +Сухарь; '
    + '000320.32: +Рудяк), факт: ' + files.length);
  for (let i = 0; i < files.length; i++) {
    assert.equal(files[i],
      String(i + 1).padStart(6, '0') + '.json',
      'нумерация подряд без пропусков: индекс ' + i);
  }
  assert.equal(NPCS.length, files.length,
    'зеркало src/npc-data.js ≡ каталогу (sync не прогнан?), факт: '
    + NPCS.length);
  const last = NPCS[53];
  assert.ok(last, '54-я запись зеркала существует');
  assert.equal(last.id, ID,
    '54-я запись зеркала — forge_instructor (порядок = нумерация файлов)');
  assert.equal(NPCS[52].id, 'ore_merchant',
    'guard: 53-я запись — Рудяк (позиционные NPCS[..] не сдвинуты)');
});

// --- T2: 000054.json валиден по схеме + порядок ключей + roundtrip ---------

test('T2: assets/npc/000054.json валиден по schema; ключи в порядке двойного эталона 000006.json (id, имя, роль, описание, постройки, диалог, обучение, торговля — без найм/квесты); roundtrip-канон; негативы — мимо схемы и мимо порядка ключей', () => {
  assert.ok(fs.existsSync(NEW),
    'RED: assets/npc/000054.json отсутствует (NPC задачи ещё не создан)');
  const data = readJson(NEW);
  assert.deepEqual(validateData(SCHEMA, data, 'npc/000054'), [],
    '000054.json обязан проходить assets/npc/schema.json');
  const KEYS = ['id', 'имя', 'роль', 'описание', 'постройки', 'диалог',
    'обучение', 'торговля'];
  assert.deepEqual(Object.keys(data), KEYS,
    'порядок ключей — побайтовый эталон диска 000006.json (Торн — та же '
    + 'двойная форма обучение+торговля): …, диалог, обучение, торговля '
    + 'после; «обучение» — ОБЯЗАННОСТЬ контракта 000211.07 «школы» для '
    + 'каждого NPC школы_навыков + фикс-профиль ТЗ (обучение), '
    + '«торговля» — зуб SRC-1 (наставник вида ⇔ продавец blueprint_forge); '
    + 'блоков найм/квесты нет');
  const raw = fs.readFileSync(NEW, 'utf8');
  assert.equal(raw, JSON.stringify(data, null, 2) + '\n',
    '000054.json — roundtrip JSON.stringify(obj,null,2)+перевод строки');
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
  badPath.постройки = ['000008.json'];
  assert.notDeepEqual(validateData(SCHEMA, badPath, 'npc/badpath'), [],
    'постройки без пути assets/buildings/ (numeric-форма) — вне паттерна схемы');
  const numericPath = JSON.parse(JSON.stringify(data));
  numericPath.постройки = ['assets/buildings/' + '000008' + '.json'];
  assert.notDeepEqual(validateData(SCHEMA, numericPath, 'npc/numericpath'), [],
    'numeric-путь постройки — вне паттерна схемы: база содержит 000318.06, '
    + 'здания — slug-именование, numeric-форма мертва (zero-sweep '
    + 'tests/buildings-rename-000318.06.test.js T5); ТЗ-путь '
    + '000008.json устарел — живая ссылка assets/buildings/blacksmith.json');
  const numericItem = JSON.parse(JSON.stringify(data));
  numericItem.торговля.предметы[0].предмет = 'assets/items/' + '000077' + '.json';
  assert.notDeepEqual(validateData(SCHEMA, numericItem, 'npc/numericitem'), [],
    'numeric-путь торгового предмета (ТЗ-форма ^assets/items/\\d{6}' +
    '\\.json$ мертва с 000318.08) — вне паттерна схемы '
    + '^assets/items/[a-z][a-z0-9_]*\\.json$ (ASSET_NAME_SHAPES items — slug)');
  const badQty = JSON.parse(JSON.stringify(data));
  badQty.торговля.предметы[0].количество = 0;
  assert.notDeepEqual(validateData(SCHEMA, badQty, 'npc/badqty'), [],
    'количество 0 — вне схемы (minimum 1; ТЗ-диапазон 1–99)');
  const badQty2 = JSON.parse(JSON.stringify(data));
  badQty2.торговля.предметы[0].количество = 100;
  assert.notDeepEqual(validateData(SCHEMA, badQty2, 'npc/badqty100'), [],
    'количество 100 — вне схемы (maximum 99)');
  const badPrice = JSON.parse(JSON.stringify(data));
  badPrice.обучение.цена_за_уровень = 0;
  assert.notDeepEqual(validateData(SCHEMA, badPrice, 'npc/badprice'), [],
    'цена_за_уровень 0 — вне схемы (minimum 1, максимум 10000)');
  const badSkill = JSON.parse(JSON.stringify(data));
  badSkill.обучение.навыки = ['Кулак'];
  assert.notDeepEqual(validateData(SCHEMA, badSkill, 'npc/badskill'), [],
    'навык «Кулак» — вне паттерна id ^[a-z][a-z0-9_]*$');
  const withQuests = JSON.parse(JSON.stringify(data));
  withQuests.квесты = [{ id: 'forge_dummy', название: 'Д', описание: 'О',
    цель: { тип: 'kill_group', группа: 0, количество: 1 },
    награда: { опыт: 10, золото: 10 } }];
  assert.notDeepEqual(Object.keys(withQuests), KEYS,
    'лишний блок «квесты» — вне эталона ключей: схема блок допускает '
    + '(невидимость свипам пинит не схема, а T2/T6), школьный профиль '
    + 'держится СЛОВОМ, не квестодательством');
});

// --- T3: id и имя уникальны (sweep) ----------------------------------------

test('T3: id forge_instructor и имя «Дымарь» уникальны в sweep каталога', () => {
  assert.ok(fs.existsSync(NEW), 'RED: assets/npc/000054.json отсутствует');
  const ids = new Set();
  const names = new Set();
  for (const f of listNpcFiles()) {
    const d = readJson(path.join(NDIR, f));
    assert.ok(!ids.has(d.id), 'дубликат id «' + d.id + '» (файл ' + f + ')');
    assert.ok(!names.has(d.имя), 'дубликат имени «' + d.имя + '» (файл ' + f + ')');
    ids.add(d.id);
    names.add(d.имя);
  }
  assert.ok(ids.has(ID), 'id forge_instructor в каталоге');
  assert.ok(names.has(NAME), 'имя «Дымарь» в каталоге');
});

// --- T4: роль-фикс, описание с хуком и уникально ----------------------------

test('T4: роль РОВНО «наставник» (точная строка ТЗ ×2 + сводная таблица; свипов уникальности ролей нет — на диске так же называются Глыба .10, Тигель .13 и Пробник .16; «кузнец» Торна и «торговец рудой» Рудяка — другие роль-строки; роль-слова ТЗ «наставник»/«кузнец» именами не стали, правило ландромина .22: имя «Дымарь»); описание непустое, хук «Учит кузнечному делу у горна» — последнее предложение, и НЕ копия описания другого NPC', () => {
  assert.ok(fs.existsSync(NEW), 'RED: assets/npc/000054.json отсутствует');
  const data = readJson(NEW);
  assert.ok(typeof data.описание === 'string' && data.описание.trim() !== '',
    'описание непустое');
  assert.equal(data.роль, 'наставник',
    'роль — фикс-строка «наставник» (ТЗ; Т4 пишет точное равенство, '
    + 'свипов уникальности ролей нет — у Глыбы/Тигеля/Пробника та же '
    + 'строка, «наставник-боец»/.25–.26 и «торговец рудой»/.32 — '
    + 'другие роль-строки)');
  assert.ok(data.описание.includes(HOOK),
    'хук истории «' + HOOK + '» (ТЗ) в описании дословно');
  assert.ok(data.описание.endsWith(HOOK + '.'),
    'хук — ПОСЛЕДНЕЕ предложение описания (с заглавной, с точкой на '
    + 'конце — прецеденты .02–.32; endsWith идёт от ПОЛНОЙ строки '
    + 'хука, конвенция .22–.32; точка в конце — часть формы хука); факт: '
    + JSON.stringify(data.описание.slice(-90)));
  for (const f of listNpcFiles()) {
    if (f === '000054.json') continue;
    const d = readJson(path.join(NDIR, f));
    assert.notEqual(d.описание, data.описание,
      'описание совпадает с ' + f + ' (не копия существующего)');
  }
});

// --- T5: диалог — профиль обучение + торговля, без «для», запрет-лист 119 ---

test('T5: диалог валиден по схеме, РОВНО 4 опции как у наставника-торговца эталона 000031 (prives/подсказка, train/обучение, trade/торговля, hint_forge/подсказка), РОВНО одна «обучение» (фикс-профиль ТЗ), РОВНО одна «торговля» (зуб SRC-1), РОВНО одна с {харизма:3} на последней, id опций уникальны, опций с «для» — ровно 0, запрет-лист 119 подстрок (дисковый список .32 ЦЕЛИКОМ = 115 + 4 оборота Рудяка) по ТЕКСТАМ диалога', () => {
  assert.ok(fs.existsSync(NEW), 'RED: assets/npc/000054.json отсутствует');
  const data = readJson(NEW);
  assert.ok(Array.isArray(data.диалог) && data.диалог.length >= 1,
    'диалог непустой (schema minItems 1)');
  assert.equal(data.диалог.length, 4,
    'диалог — ровно 4 опции (prives / train / trade / hint_forge — '
    + 'форма эталона наставника-торговца чертежа: Тигель 000031 '
    + '(.13)), факт: ' + data.диалог.length);
  const ACTIONS = SCHEMA.properties.диалог.items.properties.действие.enum;
  for (const o of data.диалог) {
    assert.ok(ACTIONS.includes(o.действие),
      'действие «' + o.действие + '» вне enum схемы');
    const errs = validateData(SCHEMA.properties.диалог.items, o, 'диалог');
    assert.deepEqual(errs, [],
      'опция «' + o.id + '» — вне схемы диалога: ' + JSON.stringify(errs));
  }
  assert.deepEqual(data.диалог.map((o) => o.id),
    ['prives', 'train', 'trade', 'hint_forge'],
    'id опций — причесон наставнического профиля .13: prives первым, '
    + 'train вторым, trade третьим, hint_* харизма-хитом последним');
  assert.deepEqual(data.диалог.map((o) => o.действие),
    ['подсказка', 'обучение', 'торговля', 'подсказка'],
    'профиль ОБУЧЕНИЕ (фикс ТЗ): ровно одна опция «обучение» — '
    + 'каталожная конвенция роли (9/9 NPC с ролью, содержащей '
    + '«наставник», имеют РОВНО одно действие «обучение» — 000005/07/'
    + '08/20/28/31/34/46/47, выверено на диске; train-вкладка UI '
    + 'открывается именно этим действием, src/ui.js — профиль ТЗ '
    + 'делается живым действием, а не декорацией); торговля — зуб '
    + 'SRC-1 (наставник вида продаёт чертёж); опций «квесты»/«найм» нет');
  assert.equal(data.диалог.filter((o) => o.действие === 'обучение').length, 1,
    'ДЕЯСТВИЙ «обучение» в диалоге РОВНО одно (фикс-профиль ТЗ; '
    + 'ЭРРАТА БРИФА «не добавлять» переносит инертность торгового '
    + 'профиля .32 на школу, где обучение — единственный смысл NPC)');
  assert.equal(data.диалог.filter((o) => o.действие === 'торговля').length, 1,
    'опций «торговля» — РОВНО одна (инвариант каталога: блок торговля '
    + '⇒ торговая опция; форма Тигеля .13)');
  const ids = data.диалог.map((o) => o.id);
  assert.equal(new Set(ids).size, ids.length, 'id опций диалога уникальны');
  assert.equal(data.диалог.filter((o) => o.для !== undefined).length, 0,
    'опций с «для» — ровно 0: наставник говорит со всеми; добавление '
    + '«для» требует ре-пина A8a (tests/npc-dialog-scope) и запрещено');
  const withReq = data.диалог.filter((o) => o.требования !== undefined);
  assert.equal(withReq.length, 1,
    'ровно одна опция с требованиями (прецедент hint_fire .13 и всей '
    + 'цепи .17–.32)');
  assert.deepEqual(withReq[0].требования, { харизма: 3 },
    'требование опции — {харизма: 3} (харизма-прецедент батча, НЕ «проверка»)');
  assert.equal(data.диалог.indexOf(withReq[0]), 3,
    'опция с требованием — ПОСЛЕДНЯЯ (эталон .13: hint_* последней)');
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
    'проигравших не забывают', 'вызов принимают, а не ждут', 'титул тяжелее пояса', 'перевяжут до боя',
    'к поединку готовят, а не к славе', 'первый вызов не торгуют', 'стойкость покупают не деньгами', 'считают круги, а не обещания',
    'правило одно на всех', 'черта важнее крика', 'позор сходить с круга', 'считают не удары, а вмятины',
    'дерево не спорит, дерево запоминает', 'бьют не со зла — на память', 'терпение измеряют не секундами, а ударами',
    'дыхание кончается раньше рук', 'силу копят не в кулаке, а в груди', 'лечат не раны, а спешку', 'усталость бьёт сильнее удара'
  ,
    'жилу ищут не ногами, а головой', 'руда в горе молчит, а в возе говорит', 'металл начинают ломом, а кончают весом', 'жилу держат не жадностью, а порядком']) {
    assert.ok(!texts.includes(w),
      'тема чужого NPC (.04 «старые походы»; токен «арен» в списке с '
      + '.04; .06 «молотк»/«наковальн»/«хвостовик» — Торн, «спрашивай '
      + 'про руду» — Хольд, «от кузницы до кузницы» — Отвар, «закалк»/'
      + '«звон»/«трещин» — Чекан; рудная/кузнечная/бронная тематика '
      + 'ЧУЖИХ витрин уже в списке — наш наставник держится своих '
      + 'оборотов и не повторяет их полными фразами; скан только по '
      + 'text-конкатенации диалога) не дублируется: подстрока «' + w
      + '» — дисковый список .32 ЦЕЛИКОМ + 4 оборота Рудяка, формула '
      + 'наследования memory/000372-forbidden-chain-teeth.md');
  }
  for (const w of MINE) {
    assert.ok(texts.includes(w),
      'СВОЙ оборот «' + w + '» живёт в текстах 000054.json — резерв '
      + '.34+ по memory/000320-forge_instructor.md (формула наследования: '
      + 'список .34 = дисковый .33 ЦЕЛИКОМ + эти 4)');
  }
});

// --- T6: обязанность обучения (контракт «школы» + SRC-1) + витрина чертежа --

test('T6: ДАННЫЕ обучения как ОБЯЗАННОСТЬ размещения: блок {навыки ≡ тренирует Кузницы [forge, back] (зуб контракта 000211.07 «школы»), цена 25/40 — СВОЯ шкала наставника (доминанта 7 из 9 роль-«наставник»; НЕ домовая 20/35 Торна/Рудяка)}; наставник ⇔ продавец чертежа (SRC-1): canMentorCraft(кузнечное_дело) — ok и blueprint_forge в витрине; торговля РОВНО 1 существующий предмет (blueprint_forge — путь с диска, slug; виртуальный номер 000077; mult_продажи 0.5, количество 1, mult_покупки ключ отсутствует, цен в входах нет — 000322); постройки [assets/buildings/blacksmith.json]; зеркало NPCS[53]: постройки [8], торговля id-формой, диалог/описание/обучение deepEqual, квестов нет', () => {
  assert.ok(fs.existsSync(NEW), 'RED: assets/npc/000054.json отсутствует');
  const data = readJson(NEW);
  assert.ok('обучение' in data,
    'в JSON есть блок «обучение» — ОБЯЗАННОСТЬ размещения: Кузница '
    + 'категория школа_навыков, контракт «школы» требует равенства '
    + '(наследует решение .27–.32; фикс-профиль ТЗ)');
  assert.deepEqual(Object.keys(data.обучение),
    ['навыки', 'цена_за_уровень', 'цена_переноса_за_уровень'],
    'ключи блока — формат эталона 000005.json');
  assert.equal(data.обучение.цена_за_уровень, 25,
    'цена_за_уровень 25 — СВОЯ шкала наставника (доминанта каталога: '
    + 'Карк/Родар/Глыба/Тигель/Пробник/Насечка/Костяшка — 25/40; '
    + '20/35 — домовая шкала Кузницы Торна/Рудяка, третий в той же '
    + 'постройке берёт свою; runtime цену берёт из блока: '
    + 'canMentorCraft price — пин ниже)');
  assert.equal(data.обучение.цена_переноса_за_уровень, 40,
    'цена_переноса_за_уровень 40 — та же своя шкала наставника');
  const smith = readJson(path.join(ROOT, 'assets', 'buildings', 'blacksmith.json'));
  assert.equal(smith.id, 8, 'здание blacksmith — id 8 (фикс размещения ТЗ)');
  assert.equal(smith.категория, 'школа_навыков',
    'категория — школа_навыков (контракт «школы» её и свипует)');
  const trains = smith.особые_параметры.тренирует;
  assert.ok(Array.isArray(trains) && trains.length === 2,
    'тренирует Кузницы — массив из двух ссылок (rename-устойчивая форма: '
    + 'пин идём РЕЗОЛВЕННЫМИ id, не numeric-путями)');
  const trainIds = trains.map((v) => {
    assert.ok(fs.existsSync(path.join(ROOT, v)),
      'ссылка тренирует «' + v + '» существует');
    return readJson(path.join(ROOT, v)).id;
  });
  assert.deepEqual([...trainIds].sort(), [...data.обучение.навыки].sort(),
    'id целей тренирует ≡ навыки обучения (зуб контракта 000211.07 '
    + 'tests/npc-data.test.js «школы»; ТЗ-«[forge]» невозможен: '
    + 'deepEqual мультимножеств требует [forge, back] ≡ тренирует; '
    + 'подмена блока красит чужой «школы» + этот T6 — мутация M1)');
  assert.deepEqual([...data.обучение.навыки].sort(), ['back', 'forge'],
    'навыки — РОВНО [forge, back] (≡ тренирует Кузницы; профиль ТЗ '
    + '«обучение» соблюдён ДЕЙСТВИЕМ в диалоге — пин T5)');
  assert.equal(data.диалог.filter((o) => o.действие === 'обучение').length, 1,
    'ДЕЙСТВИЕ «обучение» в диалоге РОВНО одно — train-вкладка UI '
    + 'открывается им (src/ui.js), данные обучения АКТИВНЫ и как блок '
    + '(ниже), и как действие (фикс-профиль ТЗ)');
  assert.equal(C.SKILL_CRAFT_TYPE.forge, 'кузнечное_дело',
    'forge маппится в кузнечное дело (src/craft.js) — зуб SRC-1 '
    + '«наставник ⇔ продавец чертежа» проверяется ниже');
  assert.ok(C.typeBuildings('кузнечное_дело').includes(8),
    'кузнечное_дело имеет Кузницу среди зданий рецептов '
    + '(typeBuildings=' + JSON.stringify(C.typeBuildings('кузнечное_дело'))
    + ') — мы СТОИМ на доме 8, как Торн/Рудяк');
  const mirror53 = NPCS[53];
  assert.ok(mirror53 && mirror53.id === ID,
    'зеркало: 54-я запись forge_instructor (canMentorCraft читает '
    + 'id-форму построек — гоняем по зеркалу, прецедент .31/.32)');
  const chk = C.canMentorCraft(mirror53, { alive: true }, 'кузнечное_дело');
  assert.deepEqual(chk, { ok: true, price: 25 },
    'canMentorCraft(Дымарь, …, кузнечное) — ok с ценой из НАШЕГО блока '
    + '(25): наставник вида → торговля ОБЯЗАНА вести blueprint_forge '
    + '(SRC-1, tests/craft-scroll-sources.test.js)');
  assert.deepEqual(C.canMentorCraft(mirror53, { alive: true }, 'алхимия'),
    { ok: false, reason: 'не обучает этот вид крафта' },
    'алхимия недоступна (навыка нет в блоке) — мы НЕ расползаемся '
    + 'по чужим школам');
  // --- торговля: витрина ---
  assert.ok('торговля' in data,
    'в JSON есть блок «торговля» — зуб SRC-1 (наставник вида ⇔ '
    + 'продавец blueprint_forge; без витрины краснеет '
    + 'craft-scroll-sources SRC-1 — мутация M2)');
  assert.deepEqual(Object.keys(data.торговля), ['предметы'],
    'блок торговли — только «предметы» (additionalProperties false в схеме)');
  const ASSORT = ['assets/items/blueprint_forge.json'];
  assert.deepEqual(data.торговля.предметы.map((e) => e.предмет), ASSORT,
    'ассортимент — РОВНО 1 предмет: чертёж горна (виртуальный номер '
    + '000077 .318.08-реестра; витрина строго под зуб SRC-1, как у '
    + 'Тигеля — один чертёж своего вида; чертёж уже торгуем Торном/'
    + 'Рудяком → уникальные 202 БЕЗ, входы +1)');
  for (const e of data.торговля.предметы) {
    assert.match(e.предмет, /^assets\/items\/[a-z][a-z0-9_]*\.json$/,
      'путь предмета — slug-форма (numeric-пути ТЗ ^\\d{6}\\.json$ '
      + 'мертвы с 000318.08): ' + e.предмет);
    assert.ok(fs.existsSync(path.join(ROOT, e.предмет)),
      'предмет существует по пути диска: ' + e.предмет);
    const item = readJson(path.join(ROOT, e.предмет));
    assert.equal(item.id, path.basename(e.предмет, '.json'),
      'имя файла ≡ id предмета: ' + e.предмет);
    assert.equal(e.mult_продажи, 0.5,
      'mult_продажи 0.5 — конвенция эталонов Торн/Тигель/Рудяк: ' + e.предмет);
    assert.equal(e.количество, 1,
      'количество РОВНО 1 (конвенция витрин каталога; схема допускает '
      + '1–99): ' + e.предмет);
    assert.ok(!('mult_покупки' in e),
      'mult_покупки — ключ ОТСУТСТВУЕТ (конвенция Торна/Тигеля/Рудяка): '
      + e.предмет);
    assert.ok(!('цена_покупки' in e) && !('цена_продажи' in e),
      'цен в входах нет — цены в JSON предмета (000322): ' + e.предмет);
    assert.ok(Number.isInteger(item.base_price) && item.base_price >= 1,
      'base_price предмета — целое ≥ 1 (000322): ' + e.предмет);
    assert.equal(item.rarity, undefined,
      'rarity у торгуемого предмета — undefined (зуб 000346 ×1-регресса): '
      + e.предмет);
  }
  assert.equal(C.SKILL_CRAFT_TYPE.back, undefined,
    'back НЕ маппится в вид крафта (дедуп pair-синтеза mentor_ — '
    + 'одна опция наставничества, не две)');
  assert.ok(!('найм' in data) && !('квесты' in data),
    'блоков найм/квесты нет — goal 5 / reward 11 НЕ растут (наш вклад: '
    + 'торговля 238→239, постройки total 55→56)');
  const mirror = NPCS[53];
  assert.ok(mirror && mirror.id === ID,
    'зеркало: 54-я запись forge_instructor');
  assert.equal(mirror.роль, 'наставник',
    'роль в зеркале — «наставник» (фикс ТЗ)');
  assert.deepEqual(mirror.постройки, [8],
    'зеркало: постройки [8] — sync резолвит ссылку Кузницы в id');
  assert.deepEqual(mirror.диалог, data.диалог,
    'зеркало NPCS[53].диалог ≡ JSON-диалог бит-в-бит');
  assert.deepEqual(mirror.описание, data.описание,
    'зеркало NPCS[53].описание ≡ JSON');
  assert.deepEqual(mirror.обучение, data.обучение,
    'зеркало NPCS[53].обучение ≡ JSON (резолвинга нет — навыки живут '
    + 'строками id, прецедент .26–.32 T6)');
  assert.deepEqual(mirror.торговля.предметы.map((e) => e.предмет),
    ['blueprint_forge'],
    'зеркало: торговля — id-форма путей (sync срезает assets/items/…'
    + '.json до id, прецедент Торна/Тигеля в src/npc-data.js)');
});

// --- T7: ростер Кузницы — ТРОЕ, Торн первый; чужие дома не тронуты ----------

test('T7: npcsForBuilding(NPCS, 8) — ТРОЕ Кузницы в порядке каталога [blacksmith, ore_merchant, forge_instructor]; npcForBuilding(8) — по-прежнему Торн; Арена (7) — СЕВЕРО не тронута (.31); Гладиаторский двор (9) — ОДИН, дом 5 Лавки странника — ВОСЕМЬ не тронуты; Магазин магии — ЧЕТЫРЕ, Аптекарь — ПЯТЬ, Бронник — ТРИ и Оружейная — ДЕВЯТЬ не тронуты', () => {
  const list = N.npcsForBuilding(NPCS, 8);
  assert.deepEqual(list.map((n) => n.id), ['blacksmith', 'ore_merchant', ID],
    'Кузница (8): Торн (000006) + торговец рудой Рудяк (000053) + '
    + 'наставник Дымарь (000054), порядок = нумерация файлов; пин роста '
    + 'дома 8 поднят в .32 (ДВОЕ), здесь — ТРОЕ (на диске было ровно '
    + 'двое: Торн + Рудяк — ЭРРАТА Брифа ТЗ-времен «в Кузнице ДВОЕ '
    + '000002/000011» уже опровергнута в .32); факт: '
    + JSON.stringify(list.map((n) => n.id)));
  assert.equal(N.npcForBuilding(NPCS, 8).id, 'blacksmith',
    'npcForBuilding — ПЕРВЫЙ по номеру файла (Торн; HUD/«Здесь:» '
    + 'не тронуты — города и cities-снапы не двигаются)');
  const arena = N.npcsForBuilding(NPCS, 7);
  assert.deepEqual(arena.map((n) => n.id),
    ['arena_master', 'sword_instructor', 'arena_champion',
      'arena_challenger', 'arena_referee', 'arena_dummy', 'arena_doctor'],
    'Арена (7) — СЕВЕРО не тронута (.31-ростер): '
    + JSON.stringify(arena.map((n) => n.id)));
  const yard = N.npcsForBuilding(NPCS, 9);
  assert.deepEqual(yard.map((n) => n.id), ['fist_instructor'],
    'Гладиаторский двор (9) — ОДИН не тронут (.26-ростер Костяшки): '
    + JSON.stringify(yard.map((n) => n.id)));
  const lavka = N.npcsForBuilding(NPCS, 5);
  assert.deepEqual(lavka.map((n) => n.id),
    ['wanderer_merchant', 'wanderer_trader', 'spice_trader',
      'caravan_trader', 'path_guide', 'tumbleweed', 'caravan_leader',
      'old_trader'],
    'Лавка странника (5) — ВОСЕМЬ не тронуты (.33 — НЕ дом 5): '
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
    'Оружейная (1) — ДЕВЯТЬ NPC не тронута (наш наставник живёт на '
    + 'Кузнице, а не среди мечей): '
    + JSON.stringify(armory.map((n) => n.id)));
});

// --- T8: [E]-оверлей Кузницы — dialog×3 в порядке файлов + craft ------------

test('T8: [E]-оверлей Кузницы — ровно 4 строки: dialog (Торн), dialog:ore_merchant (Рудяк), dialog:forge_instructor (Дымарь), craft (СИНТЕЗ 000126 — крафтовые рецепты здания 8); эффектов у дома 8 нет — effectIds пуст, только dialog-строки + крафт КОНЦОМ; подписи «Диалог: Торн»/«Диалог: Рудяк»/«Диалог: Дымарь»; хоткеи Digit1..4 — граница /^Digit([1-9])$/ не превышена', () => {
  const b = readJson(path.join(ROOT, 'assets', 'buildings', 'blacksmith.json'));
  assert.equal(b.id, 8, 'здание blacksmith — id 8 (фикс размещения)');
  assert.equal(b.категория, 'школа_навыков',
    'категория — школа_навыков (контракт «школы» её и свипует)');
  assert.ok(!('8' in BE.EFFECTS),
    'у дома 8 эффектов НЕТ (EFFECTS не содержит ключа «8») — '
    + 'effectIds(building) пуст на голом диске');
  assert.deepEqual(BE.effectIds(b), [],
    'effectIds Кузницы — [] (запись дома 8 в BUILDINGS-дереве эффектов)');
  const prevGame = globalThis.Game;
  globalThis.Game = { Craft: C };
  let rows;
  try {
    const list = N.npcsForBuilding(NPCS, 8);
    rows = BE.buildingActions(b, list, { day: 5 });
  } finally {
    if (prevGame === undefined) delete globalThis.Game;
    else globalThis.Game = prevGame;
  }
  assert.equal(rows.length, 4,
    'список здания 8 = dialog-строки по каждому NPC (РОВНО ТРИ после '
    + '.33) + СИНТЕЗИРОВАННАЯ крафт-строка КОНЦОМ (000126: '
    + 'CRAFT.здания ∋ 8), факт: ' + JSON.stringify(rows.map((r) => r.id)));
  assert.deepEqual(rows.map((r) => r.id),
    ['dialog', 'dialog:ore_merchant', 'dialog:' + ID, 'craft'],
    'порядок строк = нумерация файлов каталога, Торн по-прежнему '
    + 'ПЕРВЫЙ (суффикс «:<id>» со второй строки — механизм '
    + 'building-effects); «craft» — не запись EFFECTS и не каталог '
    + '(решение 1 контракта 000126); факт: '
    + JSON.stringify(rows.map((r) => r.id)));
  assert.deepEqual(rows.map((r) => r.имя),
    ['Диалог: Торн', 'Диалог: Рудяк', 'Диалог: ' + NAME, 'Крафт'],
    'подписи — «Диалог: <имя>» + «Крафт», факт: '
    + JSON.stringify(rows.map((r) => r.имя)));
  assert.deepEqual(rows.slice(0, 3).map((r) => r.npcId),
    ['blacksmith', 'ore_merchant', ID],
    'каждая dialog-строка несёт npcId своего NPC (роутинг клика); '
    + 'крафт-строка npcId НЕ несёт (не персонифицирована)');
  assert.equal(rows[3].npcId, undefined,
    'строка «craft» без npcId — синтез-строка здания');
  for (let i = 0; i < rows.length; i++) {
    assert.match('Digit' + (i + 1), /^Digit([1-9])$/,
      'хоткеи Digit1..' + rows.length + ' — общий механизм '
      + 'src/building-ui.js /^Digit([1-9])$/ (четвёртая строка в границе)');
  }
});

// --- T9: forbid-цепь — зуб длины/уникальности/включения (000372) -------------

test('T9: forbid-цепь 000372 (.32→.33) — guard-массив T5 этого файла РОВНО 119 и без дублей, предыдущего звена .32 РОВНО 115 и без дублей, prev ⊆ own, дельта — РОВНО 4 оборота Рудяка (формула наследования; хвост цепи — резерв 4 наставника НЕ в списке, он для .34)', () => {
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
    'жилу ищут не ногами, а головой', 'руда в горе молчит, а в возе говорит',
    'металл начинают ломом, а кончают весом', 'жилу держат не жадностью, а порядком',
  ];
  const own = extract(__filename);
  const prevFile = path.join(__dirname, 'npc-000320.32.test.js');
  assert.ok(fs.existsSync(prevFile),
    'предыдущее звено цепи tests/npc-000320.32.test.js существует');
  const prev = extract(prevFile);
  const p32 = fs.readFileSync(prevFile, 'utf8');
  const discMine32 = [...p32.match(/const MINE = \[([\s\S]*?)\];/)[1]
    .matchAll(/'([^']*)'/g)].map((x) => x[1]);
  assert.deepEqual(EXPECT_ADDS, discMine32,
    'копии EXPECT_ADDS ≡ дисковой MINE-константе файла .32 '
    + '(правило 000390: формы ТОЛЬКО с диска — расхождение транскрипции '
    + 'ловится здесь); факт диска: ' + JSON.stringify(discMine32));
  assert.equal(own.length, 119,
    'guard-массив T5 этого файла — РОВНО 119 (пин по диску; вырез или '
    + 'лишний элемент ловятся здесь); факт: ' + own.length);
  assert.equal(new Set(own).size, own.length,
    'guard-массив этого файла — элементы уникальны (дубль ловится здесь)');
  assert.equal(prev.length, 115,
    'guard-массив T5 .32 — РОВНО 115 (то же число пинует T9 файла .32 — '
    + 'двойное покрытие); факт: ' + prev.length);
  assert.equal(new Set(prev).size, prev.length,
    'guard-массив .32 — элементы уникальны');
  const ownSet = new Set(own);
  const lost = [...new Set(prev)].filter((x) => !ownSet.has(x));
  assert.deepEqual(lost, [],
    'строгое включение prev ⊆ own — ни один элемент .32 не потерян; '
    + 'потеряно: ' + JSON.stringify(lost));
  const prevSet = new Set(prev);
  const adds = own.filter((x) => !prevSet.has(x));
  assert.deepEqual([...adds].sort(), [...EXPECT_ADDS].sort(),
    'дельта (own минус prev) — РОВНО 4 оборота Рудяка = MINE-константа '
    + 'файла .32 (формула наследования '
    + 'memory/000320-ore_merchant.md); СВОИ 4 оборота наставника (резерв '
    + '.34 по memory/000320-forge_instructor.md) в списке НЕ сидят; факт: '
    + JSON.stringify(adds));
});

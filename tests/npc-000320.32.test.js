// Задача 000320.32: «Торговец рудой» — id ore_merchant, имя «Рудяк»
// (Кузница, 2-й NPC постройки; 32-я из 100 дочерних 000320).
//
// Контракт (ТЗ tasks/pending/000320.32.md; механизм мульти-NPC —
// 000320.01, spec/npc.md «Несколько NPC на постройку»,
// memory/000320-npcs-batch.md; профиль-эталон ТОРГОВЛЯ — .18 «Хомут»
// (000036) и .20 «Барыш» (000038), школьный двойник обучение+торговля —
// Торн 000006; свою память несёт memory/000320-ore_merchant.md):
//   * assets/npc/000053.json — id ore_merchant (свип по 52 занятому —
//     свободен), имя «Рудяк» (выбор агента: корень от торгового слова по
//     конвенции прозвищ батча «Барыш»/«Хомут»/«Сухарь»; роль-слова ТЗ
//     «торговец»/«руда» именем НЕ стали — правило ландромина .22), роль
//     «торговец рудой» (фикс ТЗ — точным равенством; свипов уникальности
//     ролей нет), постройка assets/buildings/blacksmith.json (id 8,
//     мировой слот map_index 5; ТЗ-путь 000008.json мёртв с 000318.06 —
//     zero-sweep tests/buildings-rename-000318.06.test.js T5; путь —
//     SLUG), 2-й NPC дома 8 (ЭРРАТА БРИФА: «в Кузнице уже ДВОЕ
//     000002/000011» ложью — Грота 000002 живёт в armor_shop, Хольд
//     000011 — в wanderer_shop; дисковый житель один — Торн 000006,
//     npcForBuilding(8) продолжает возвращать Торна); хук истории
//     «Продаёт руду и железо; знает жилы» — последнее предложение
//     описания (endsWith от ПОЛНОЙ строки хука с точкой, конвенция
//     .02–.31);
//   * счётчик каталога НЕ ре-пинится — держатели живут ls-предикатами
//     миграции 000387.01 (боевая приёмка в .30): чистое добавление
//     000053.json + sync зеленит 31 сиблинговый T1 без ручной правки;
//   * профиль диалога — ТОРГОВЛЯ (фикс ТЗ; форма эталона диска
//     .18/.20): РОВНО 3 опции prives/«подсказка» → trade/«торговля» →
//     hint_veins/«подсказка» + {харизма:3} на последней; «для» РОВНО 0
//     (контракт A8a);
//   * ОБЯЗАННОСТЬ размещения (не вилка; ЭРРАТА БРИФА «обязанность
//     обучения НЕ добавлять» противоречит диску): Кузница — категория
//     школа_навыков с особые_параметры.тренирует (forge + back), живой
//     контракт 000211.07 (tests/npc-data.test.js «школы») требует
//     равенства sorted(тренирует-id) ≡ (обучение ? навыки : []) для
//     КАЖДОГО NPC школы — блок {навыки [forge, back] ≡ тренирует,
//     20/35 — шкала самой Кузницы (Торн/Лейна/Фикка), НЕ арены 25/40}
//     обязателен (наследует решение .27–.31); ТЗ-профиль соблюдён тем,
//     что опции «обучение» в диалоге НЕТ. Блок ИНЕРТЕН по диалогу и
//     АКТИВЕН по SRC-1: canMentorCraft(кузнечное_дело) даёт ok
//     (forge ∈ SKILL_CRAFT_TYPE, дом 8 ∈ typeBuildings = [8, 25]) →
//     торговля ОБЯЗАНА содержать assets/items/blueprint_forge.json
//     (контракт «наставник ⇔ продавец чертежа»,
//     tests/craft-scroll-sources.test.js SRC-1; прецеденты Торн/Тигель);
//     mentor_-опция синтезируется рантаймом вне данных (src/npc.js);
//   * порядок ключей JSON — [id, имя, роль, описание, постройки, диалог,
//     обучение, торговля] (побайтовый порядок эталона 000006.json —
//     двойной блок обучения+торговли без «квесты»);
//   * торговля — РОВНО 4 существующих предмета в порядке виртуальных
//     номеров (.318.08-реестр): iron_ore 000033, copper_ore 000034,
//     coal 000038, blueprint_forge 000077; все пути с диска существуют,
//     numeric-пути ТЗ мертвы (ASSET_NAME_SHAPES items — slug); цены —
//     в JSON предмета (000322), mult_продажи 0.5, количество 1,
//     mult_покупки — ключ ОТСУТСТВУЕТ (конвенция Хомута/Барыша/Торна);
//     все 4 уже торгуемы (Хольд/Хомут/Барыш/Торн) → уникальные 202 БЕЗ;
//   * тема диалога — жила/руда/уголь/чертёж; запрет-лист ТЕКСТОВ
//     диалога 115 = дисковый список .31 ЦЕЛИКОМ (111) + 4 зарезервированных
//     оборота Сухаря (memory/000320-arena_doctor.md для .32: «дыхание
//     кончается раньше рук», «силу копят не в кулаке, а в груди», «лечат
//     не раны, а спешку», «усталость бьёт сильнее удара» — живут в
//     текстах 000052.json); СВОИ 4 оборота торговца зарезервированы для
//     .33 — memory/000320-ore_merchant.md; МИННЫЕ ПОЛЯ тематики уже В
//     списке: «спрашивай про руду», «три металла на прилавке», «товар
//     помнит того, кто его привёз», «от кузницы до кузницы», «нагрудник»;
//   * [E]-оверлей Кузницы — две dialog-строки + крафт-строка
//     СИНТЕЗОМ КОНЦОМ (000126): 'dialog' (Торн) → 'dialog:ore_merchant'
//     (Рудяк) → 'craft'; хоткеи Digit1..3 — общий механизм
//     src/building-ui.js /^Digit([1-9])$/; пин роста дома 8 поднят
//     ЗДЕСЬ ВПЕРВЫЕ (сиблинговых держателей оверлея Кузницы на диске
//     нет — у .25–.31 Арена; CU-3 tests/craft-ui.test.js передаёт
//     Торна ЯВНО — ['dialog','craft'] не движется).
//
// ЗУБ forbid-цепи 000372: T9 против .31 (own 115 / prev 111 / дельта
// ≡ MINE-константа файла .31 — 4 Сухаря).
//
// КРАСНЫЕ (TDD): T1..T8 красные до зелёной стадии (000053.json нет,
// ростер Кузницы — ОДИН, оверлей 2 строки), без краха загрузки; T9
// зелёный и здесь, и после (цепь читается «назад»).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validateData } = require('./json-schema.js');

const ROOT = path.join(__dirname, '..');
const NDIR = path.join(ROOT, 'assets', 'npc');
const NEW = path.join(NDIR, '000053.json');
const SCHEMA = JSON.parse(
  fs.readFileSync(path.join(NDIR, 'schema.json'), 'utf8'));

const N = require('../src/npc.js');
const { NPCS } = require('../src/npc-data.js');
const BE = require('../src/building-effects.js');
const C = require('../src/craft.js');

const HOOK = 'Продаёт руду и железо; знает жилы';
const ID = 'ore_merchant';
const NAME = 'Рудяк';

const MINE = ['жилу ищут не ногами, а головой',
  'руда в горе молчит, а в возе говорит',
  'металл начинают ломом, а кончают весом',
  'жилу держат не жадностью, а порядком'];

function listNpcFiles() {
  return fs.readdirSync(NDIR)
    .filter((f) => /^\d{6}\.json$/.test(f))
    .sort();
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// --- T1: ls-предикат каталога + зеркало -------------------------------------

test('T1: каталог — ls-предикат: 000001..N подряд (N = счётчик диска); зеркало NPCS ≡ каталогу с ore_merchant', () => {
  const files = listNpcFiles();
  assert.ok(files.length >= 52,
    'в каталоге NPC не менее 52 файла (000320.17: +Переписчик; 000320.18: '
    + '+Странствующий торговец; 000320.19: +Торговец специями; '
    + '000320.20: +Торговец каравана; 000347.02: +жрец солнца, жрица '
    + 'луны, горный жрец; 000320.21: +Проводник; 000320.22: +Перекати; '
    + '000320.23: +Сарбон; 000320.24: +Просол; 000320.25: +Насечка; '
    + '000320.26: +Костяшка; 000320.27: +Кремень; 000320.28: +Шрам; '
    + '000320.29: +Свисток; 000320.30: +Чурка; 000320.31: +Сухарь), '
    + 'факт: ' + files.length);
  for (let i = 0; i < files.length; i++) {
    assert.equal(files[i],
      String(i + 1).padStart(6, '0') + '.json',
      'нумерация подряд без пропусков: индекс ' + i);
  }
  assert.equal(NPCS.length, files.length,
    'зеркало src/npc-data.js ≡ каталогу (sync не прогнан?), факт: '
    + NPCS.length);
  const last = NPCS[52];
  assert.ok(last, '53-я запись зеркала существует');
  assert.equal(last.id, ID,
    '53-я запись зеркала — ore_merchant (порядок = нумерация файлов)');
  assert.equal(NPCS[51].id, 'arena_doctor',
    'guard: 52-я запись — Сухарь (позиционные NPCS[..] не сдвинуты)');
});

// --- T2: 000053.json валиден по схеме + порядок ключей + roundtrip ---------

test('T2: assets/npc/000053.json валиден по schema; ключи в порядке двойного эталона 000006.json (id, имя, роль, описание, постройки, диалог, обучение, торговля — без найм/квесты); roundtrip-канон; негативы — мимо схемы и мимо порядка ключей', () => {
  assert.ok(fs.existsSync(NEW),
    'RED: assets/npc/000053.json отсутствует (NPC задачи ещё не создан)');
  const data = readJson(NEW);
  assert.deepEqual(validateData(SCHEMA, data, 'npc/000053'), [],
    '000053.json обязан проходить assets/npc/schema.json');
  const KEYS = ['id', 'имя', 'роль', 'описание', 'постройки', 'диалог',
    'обучение', 'торговля'];
  assert.deepEqual(Object.keys(data), KEYS,
    'порядок ключей — побайтовый эталон диска 000006.json (Торн — та же '
    + 'двойная форма обучение+торговля): …, диалог, обучение, торговля '
    + 'после; «обучение» — ОБЯЗАННОСТЬ контракта 000211.07 «школы» для '
    + 'каждого NPC школы_навыков (ЭРРАТА БРИФА «обязанность обучения НЕ '
    + 'добавлять» противоречит диску — прецеденты .27–.31), «торговля» — '
    + 'фикс-профиль ТЗ; блоков найм/квесты нет');
  const raw = fs.readFileSync(NEW, 'utf8');
  assert.equal(raw, JSON.stringify(data, null, 2) + '\n',
    '000053.json — roundtrip JSON.stringify(obj,null,2)+перевод строки');
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
  numericItem.торговля.предметы[0].предмет = 'assets/items/' + '000033' + '.json';
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
  withQuests.квесты = [{ id: 'vein_dummy', название: 'Д', описание: 'О',
    цель: { тип: 'kill_group', группа: 0, количество: 1 },
    награда: { опыт: 10, золото: 10 } }];
  assert.notDeepEqual(Object.keys(withQuests), KEYS,
    'лишний блок «квесты» — вне эталона ключей: схема блок допускает '
    + '(невидимость свипам пинит не схема, а T2/T6), торговый профиль '
    + 'держится СЛОВОМ, не витриной');
});

// --- T3: id и имя уникальны (sweep) ----------------------------------------

test('T3: id ore_merchant и имя «Рудяк» уникальны в sweep каталога', () => {
  assert.ok(fs.existsSync(NEW), 'RED: assets/npc/000053.json отсутствует');
  const ids = new Set();
  const names = new Set();
  for (const f of listNpcFiles()) {
    const d = readJson(path.join(NDIR, f));
    assert.ok(!ids.has(d.id), 'дубликат id «' + d.id + '» (файл ' + f + ')');
    assert.ok(!names.has(d.имя), 'дубликат имени «' + d.имя + '» (файл ' + f + ')');
    ids.add(d.id);
    names.add(d.имя);
  }
  assert.ok(ids.has(ID), 'id ore_merchant в каталоге');
  assert.ok(names.has(NAME), 'имя «Рудяк» в каталоге');
});

// --- T4: роль-фикс, описание с хуком и уникально ----------------------------

test('T4: роль РОВНО «торговец рудой» (точная строка ТЗ ×2 + сводная таблица; свипов уникальности ролей нет — «странствующий торговец» Хольда/.11 и Хомута/.18, «торговец» Барыша/.20, «торговец специями» Шафрана/.19 — другие роль-строки; роль-слова ТЗ «торговец»/«руда» именами не стали, правило ландромина .22: имя «Рудяк»); описание непустое, хук «Продаёт руду и железо; знает жилы» — последнее предложение, и НЕ копия описания другого NPC', () => {
  assert.ok(fs.existsSync(NEW), 'RED: assets/npc/000053.json отсутствует');
  const data = readJson(NEW);
  assert.ok(typeof data.описание === 'string' && data.описание.trim() !== '',
    'описание непустое');
  assert.equal(data.роль, 'торговец рудой',
    'роль — фикс-строка «торговец рудой» (ТЗ; Т4 пишет точное равенство, '
    + 'свипов уникальности ролей нет — «кузнец» Торна и «наставник» '
    + 'будущего .33 — другие роль-строки)');
  assert.ok(data.описание.includes(HOOK),
    'хук истории «' + HOOK + '» (ТЗ) в описании дословно');
  assert.ok(data.описание.endsWith(HOOK + '.'),
    'хук — ПОСЛЕДНЕЕ предложение описания (с заглавной, с точкой на '
    + 'конце — прецеденты .02–.31; endsWith идёт от ПОЛНОЙ строки '
    + 'хука, конвенция .22–.31; точка с запятой — часть хука ТЗ); факт: '
    + JSON.stringify(data.описание.slice(-90)));
  for (const f of listNpcFiles()) {
    if (f === '000053.json') continue;
    const d = readJson(path.join(NDIR, f));
    assert.notEqual(d.описание, data.описание,
      'описание совпадает с ' + f + ' (не копия существующего)');
  }
});

// --- T5: диалог — профиль торговля, без «для», запрет-лист 115 --------------

test('T5: диалог валиден по схеме, РОВНО 3 опции как у торгового эталона .18/.20 (prives/подсказка, trade/торговля, hint_veins/подсказка), РОВНО одна «торговля», РОВНО одна с {харизма:3} на последней, id опций уникальны, опций с «для» — ровно 0, ДЕЙСТВИЙ «обучение» и «квесты» — ровно 0 (профиль торговля + инертность данных обучения), запрет-лист 115 подстрок (дисковый список .31 ЦЕЛИКОМ = 111 + 4 оборота Сухаря) по ТЕКСТАМ диалога', () => {
  assert.ok(fs.existsSync(NEW), 'RED: assets/npc/000053.json отсутствует');
  const data = readJson(NEW);
  assert.ok(Array.isArray(data.диалог) && data.диалог.length >= 1,
    'диалог непустой (schema minItems 1)');
  assert.equal(data.диалог.length, 3,
    'диалог — ровно 3 опции (prives / trade / hint_veins — форма '
    + 'эталона торговля диска: .18 «Хомут» (000036), .20 «Барыш» '
    + '(000038)), факт: ' + data.диалог.length);
  const ACTIONS = SCHEMA.properties.диалог.items.properties.действие.enum;
  for (const o of data.диалог) {
    assert.ok(ACTIONS.includes(o.действие),
      'действие «' + o.действие + '» вне enum схемы');
    const errs = validateData(SCHEMA.properties.диалог.items, o, 'диалог');
    assert.deepEqual(errs, [],
      'опция «' + o.id + '» — вне схемы диалога: ' + JSON.stringify(errs));
  }
  assert.deepEqual(data.диалог.map((o) => o.id),
    ['prives', 'trade', 'hint_veins'],
    'id опций — причесон торгового профиля .18/.20: prives первым, '
    + 'trade вторым, hint_* харизма-хитом последним');
  assert.deepEqual(data.диалог.map((o) => o.действие),
    ['подсказка', 'торговля', 'подсказка'],
    'профиль ТОРГОВЛЯ (фикс ТЗ): ровно одна опция «торговля», '
    + 'обрамлённая подсказками (эталон .18/.20); опций «квесты»/«найм»/'
    + '«обучение» нет — train-вкладка UI открывается только действием '
    + '«обучение» (src/ui.js), её отсутствие и есть инертность блока '
    + 'обучения по диалогу (вилка .27–.31), наставничество живёт '
    + 'СИНТЕЗОМ mentor_ вне данных (src/npc.js)');
  assert.equal(data.диалог.filter((o) => o.действие === 'торговля').length, 1,
    'опций «торговля» — РОВНО одна (фикс профиля ТЗ)');
  assert.equal(data.диалог.filter((o) => o.действие === 'обучение').length, 0,
    'ДЕЯСТВИЙ «обучение» в диалоге ровно 0 — обязанность обучения '
    + 'реализована ДАННЫМИ блока (T6), а не опцией (ТЗ-профиль)');
  const ids = data.диалог.map((o) => o.id);
  assert.equal(new Set(ids).size, ids.length, 'id опций диалога уникальны');
  assert.equal(data.диалог.filter((o) => o.для !== undefined).length, 0,
    'опций с «для» — ровно 0: торговец говорит со всеми; добавление '
    + '«для» требует ре-пина A8a (tests/npc-dialog-scope) и запрещено');
  const withReq = data.диалог.filter((o) => o.требования !== undefined);
  assert.equal(withReq.length, 1,
    'ровно одна опция с требованиями (прецедент hint_pack .18 / '
    + 'hint_coin .20 и всей цепи .17–.31)');
  assert.deepEqual(withReq[0].требования, { харизма: 3 },
    'требование опции — {харизма: 3} (харизма-прецедент батча, НЕ «проверка»)');
  assert.equal(data.диалог.indexOf(withReq[0]), 2,
    'опция с требованием — ПОСЛЕДНЯЯ (эталон .18/.20: hint_* последней)');
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
  ]) {
    assert.ok(!texts.includes(w),
      'тема чужого NPC (.04 «старые походы»; токен «арен» в списке с '
      + '.04; .06 «молотк»/«наковальн»/«хвостовик» — Торн, «спрашивай '
      + 'про руду» — Хольд, «от кузницы до кузницы» — Отвар: '
      + 'рудная/кузнечная тематика ЧУЖИХ витрин уже в списке — '
      + 'наш торговец держится своих оборотов и не повторяет их '
      + 'полными фразами; скан только по text-конкатенации диалога) '
      + 'не дублируется: подстрока «' + w + '» — дисковый список .31 '
      + 'ЦЕЛИКОМ + 4 оборота Сухаря, формула наследования '
      + 'memory/000372-forbidden-chain-teeth.md');
  }
  for (const w of MINE) {
    assert.ok(texts.includes(w),
      'СВОЙ оборот «' + w + '» живёт в текстах 000053.json — резерв '
      + '.33+ по memory/000320-ore_merchant.md (формула наследования: '
      + 'список .33 = дисковый .32 ЦЕЛИКОМ + эти 4)');
  }
});

// --- T6: торговля + обязанность обучения (контракт «школы» + SRC-1 ----------

test('T6: торговля РОВНО 4 существующих предмета (iron_ore/copper_ore/coal/blueprint_forge — пути с диска, slug-форма; порядок виртуальных номеров 000033/000034/000038/000077; mult_продажи 0.5, количество 1, mult_покупки ключ отсутствует, цен в входах нет — 000322) + ДАННЫЕ обучения как ОБЯЗАННОСТЬ размещения: блок {навыки ≡ тренирует Кузницы [forge, back] (зуб контракта 000211.07 «школы»), цена 20/35 — шкала самой Кузницы} при РОВНО 0 диалоговых действий «обучение»; наставник ⇔ продавец чертежа (SRC-1): canMentorCraft(кузнечное_дело) — ok и blueprint_forge в витрине; постройки [assets/buildings/blacksmith.json]; зеркало NPCS[52]: постройки [8], торговля id-формой, диалог/описание/обучение deepEqual, квестов нет', () => {
  assert.ok(fs.existsSync(NEW), 'RED: assets/npc/000053.json отсутствует');
  const data = readJson(NEW);
  assert.ok('обучение' in data,
    'в JSON есть блок «обучение» — ОБЯЗАННОСТЬ размещения: Кузница '
    + 'категория школа_навыков, контракт «школы» требует равенства '
    + 'без диалоговой опции (наследует решение .27–.31; ЭРРАТА БРИФА '
    + '«обязанность обучения НЕ добавлять» противоречит диску)');
  assert.deepEqual(Object.keys(data.обучение),
    ['навыки', 'цена_за_уровень', 'цена_переноса_за_уровень'],
    'ключи блока — формат эталона 000005.json');
  assert.equal(data.обучение.цена_за_уровень, 20,
    'цена_за_уровень 20 — шкала Кузницы (Торн/Лейна/Фикка — 20/35; '
    + 'Арена с её .25–.31 — другая школа, 25/40; runtime цену берёт '
    + 'из блока: canMentorCraft price — пин ниже)');
  assert.equal(data.обучение.цена_переноса_за_уровень, 35,
    'цена_переноса_за_уровень 35 — та же шкала Кузницы');
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
    + 'tests/npc-data.test.js «школы»; удаление/подмена блока красит '
    + 'чужой «школы» + этот T6 — мутация M5)');
  assert.deepEqual([...data.обучение.навыки].sort(), ['back', 'forge'],
    'навыки — РОВНО [forge, back] (≡ тренирует Кузницы; ТЗ-профиль '
    + '«торговля» сохранён: опции «обучение» в диалоге нет — пин T5)');
  assert.equal(data.диалог.filter((o) => o.действие === 'обучение').length, 0,
    'ДЕЯСТВИЙ «обучение» в диалоге ровно 0 — train-вкладка UI не '
    + 'открывается (src/ui.js входит в неё только по этому действию); '
    + 'наставничество доступно СИНТЕЗИРОВАННОЙ mentor_-опцией (T8-механика '
    + 'src/npc.js), инертность данных обучения, часть 1');
  assert.equal(C.SKILL_CRAFT_TYPE.forge, 'кузнечное_дело',
    'forge маппится в кузнечное дело (src/craft.js) — зуб SRC-1 '
    + '«наставник ⇔ продавец чертежа» проверяется ниже');
  assert.ok(C.typeBuildings('кузнечное_дело').includes(8),
    'кузнечное_дело имеет Кузницу среди зданий рецептов '
    + '(typeBuildings=' + JSON.stringify(C.typeBuildings('кузнечное_дело'))
    + ') — мы СТОИМ на доме 8, в отличие от арены .25–.31');
  const mirror52 = NPCS[52];
  assert.ok(mirror52 && mirror52.id === ID,
    'зеркало: 53-я запись ore_merchant (canMentorCraft читает '
    + 'id-форму построек — гоняем по зеркалу, прецедент .31)');
  const chk = C.canMentorCraft(mirror52, { alive: true }, 'кузнечное_дело');
  assert.deepEqual(chk, { ok: true, price: 20 },
    'canMentorCraft(Рудяк, …, кузнечное) — ok с ценой из НАШЕГО блока '
    + '(20): наставник вида → торговля ОБЯЗАНА вести blueprint_forge '
    + '(SRC-1, tests/craft-scroll-sources.test.js)');
  assert.deepEqual(C.canMentorCraft(mirror52, { alive: true }, 'алхимия'),
    { ok: false, reason: 'не обучает этот вид крафта' },
    'алхимия недоступна (навыка нет в блоке) — мы НЕ расползаемся '
    + 'по чужим школам');
  // --- торговля: витрина ---
  assert.ok('торговля' in data, 'в JSON есть блок «торговля» (фикс ТЗ)');
  assert.deepEqual(Object.keys(data.торговля), ['предметы'],
    'блок торговли — только «предметы» (additionalProperties false в схеме)');
  const ASSORT = ['assets/items/iron_ore.json', 'assets/items/copper_ore.json',
    'assets/items/coal.json', 'assets/items/blueprint_forge.json'];
  assert.deepEqual(data.торговля.предметы.map((e) => e.предмет), ASSORT,
    'ассортимент — РОВНО 4 существующих предмета в порядке виртуальных '
    + 'номеров .318.08-реестра (iron_ore 000033, copper_ore 000034, '
    + 'coal 000038, blueprint_forge 000077 — конвенция сортировки '
    + 'витрины Хомута/Барыша); все уже торгуемы Хольдом/Хомутом/'
    + 'Барышом/Торном → уникальные 202 БЕЗ; чертёж кузнечного дела — '
    + 'зуб SRC-1 (мы наставники вида, T6 выше)');
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
      'mult_продажи 0.5 — конвенция эталонов Торн/Хомут/Барыш: ' + e.предмет);
    assert.equal(e.количество, 1,
      'количество РОВНО 1 (конвенция витрин каталога; схема допускает '
      + '1–99): ' + e.предмет);
    assert.ok(!('mult_покупки' in e),
      'mult_покупки — ключ ОТСУТСТВУЕТ (конвенция Торна/Хомута/Барыша): '
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
    + 'торговля 234→238, постройки total 54→55)');
  const mirror = NPCS[52];
  assert.ok(mirror && mirror.id === ID,
    'зеркало: 53-я запись ore_merchant');
  assert.equal(mirror.роль, 'торговец рудой',
    'роль в зеркале — «торговец рудой» (фикс ТЗ)');
  assert.deepEqual(mirror.постройки, [8],
    'зеркало: постройки [8] — sync резолвит ссылку Кузницы в id');
  assert.deepEqual(mirror.диалог, data.диалог,
    'зеркало NPCS[52].диалог ≡ JSON-диалог бит-в-бит');
  assert.deepEqual(mirror.описание, data.описание,
    'зеркало NPCS[52].описание ≡ JSON');
  assert.deepEqual(mirror.обучение, data.обучение,
    'зеркало NPCS[52].обучение ≡ JSON (резолвинга нет — навыки живут '
    + 'строками id, прецедент .26–.31 T6)');
  assert.deepEqual(mirror.торговля.предметы.map((e) => e.предмет),
    ['iron_ore', 'copper_ore', 'coal', 'blueprint_forge'],
    'зеркало: торговля — id-форма путей (sync срезает assets/items/…'
    + '.json до id, прецедент Торна в src/npc-data.js)');
});

// --- T7: ростер Кузницы — ДВОЕ, Торн первый; чужие дома не тронуты ----------

test('T7: npcsForBuilding(NPCS, 8) — ДВОЕ Кузницы в порядке каталога [blacksmith, ore_merchant]; npcForBuilding(8) — по-прежнему Торн; Арена (7) — СЕВЕРО не тронута (.31); Гладиаторский двор (9) — ОДИН, дом 5 Лавки странника — ВОСЕМЬ не тронуты; Магазин магии — ЧЕТЫРЕ, Аптекарь — ПЯТЬ, Бронник — ТРИ и Оружейная — ДЕВЯТЬ не тронуты', () => {
  const list = N.npcsForBuilding(NPCS, 8);
  assert.deepEqual(list.map((n) => n.id), ['blacksmith', ID],
    'Кузница (8): Торн (000006) + торговец рудой Рудяк (000053), '
    + 'порядок = нумерация файлов; пин роста дома 8 поднят ЗДЕСЬ ВПЕРВЫЕ '
    + '(ЭРРАТА БРИФА: «в Кузнице уже ДВОЕ» ложно — Грота 000002 в '
    + 'armor_shop, Хольд 000011 в wanderer_shop; дисковый житель был '
    + 'один); факт: ' + JSON.stringify(list.map((n) => n.id)));
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
    'Лавка странника (5) — ВОСЕМЬ не тронуты (.32 — НЕ дом 5): '
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
    'Оружейная (1) — ДЕВЯТЬ NPC не тронута (наш торговец живёт на '
    + 'Кузнице, а не среди мечей): '
    + JSON.stringify(armory.map((n) => n.id)));
});

// --- T8: [E]-оверлей Кузницы — dialog, dialog:ore_merchant, craft ----------

test('T8: [E]-оверлей Кузницы — ровно 3 строки: dialog (Торн), dialog:ore_merchant (Рудяк), craft (СИНТЕЗ 000126 — крафтовые рецепты здания 8) — пин роста дома 8 поднят ЗДЕСЬ ВПЕРВЫЕ (у .25–.31 Арена, сиблинговых держателей Кузницы нет); эффектов у дома 8 нет — effectIds пуст, только dialog-строки + крафт КОНЦОМ; подписи «Диалог: Торн»/«Диалог: Рудяк»; хоткеи Digit1..3 — граница /^Digit([1-9])$/ не превышена (третья строка дома 8 — за .33 по сводной таблице)', () => {
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
  assert.equal(rows.length, 3,
    'список здания 8 = dialog-строки по каждому NPC (РОВНО ДВЕ после '
    + '.32) + СИНТЕЗИРОВАННАЯ крафт-строка КОНЦОМ (000126: '
    + 'CRAFT.здания ∋ 8), факт: ' + JSON.stringify(rows.map((r) => r.id)));
  assert.deepEqual(rows.map((r) => r.id),
    ['dialog', 'dialog:' + ID, 'craft'],
    'порядок строк = нумерация файлов каталога, Торн по-прежнему '
    + 'ПЕРВЫЙ (суффикс «:<id>» со второй строки — механизм '
    + 'building-effects); «craft» — не запись EFFECTS и не каталог '
    + '(решение 1 контракта 000126); факт: '
    + JSON.stringify(rows.map((r) => r.id)));
  assert.deepEqual(rows.map((r) => r.имя),
    ['Диалог: Торн', 'Диалог: ' + NAME, 'Крафт'],
    'подписи — «Диалог: <имя>» + «Крафт», факт: '
    + JSON.stringify(rows.map((r) => r.имя)));
  assert.deepEqual(rows.slice(0, 2).map((r) => r.npcId),
    ['blacksmith', ID],
    'каждая dialog-строка несёт npcId своего NPC (роутинг клика); '
    + 'крафт-строка npcId НЕ несёт (не персонифицирована)');
  assert.equal(rows[2].npcId, undefined,
    'строка «craft» без npcId — синтез-строка здания');
  for (let i = 0; i < rows.length; i++) {
    assert.match('Digit' + (i + 1), /^Digit([1-9])$/,
      'хоткеи Digit1..' + rows.length + ' — общий механизм '
      + 'src/building-ui.js /^Digit([1-9])$/ (третья строка в границе)');
  }
});

// --- T9: forbid-цепь — зуб длины/уникальности/включения (000372) -------------

test('T9: forbid-цепь 000372 (.31→.32) — guard-массив T5 этого файла РОВНО 115 и без дублей, предыдущего звена .31 РОВНО 111 и без дублей, prev ⊆ own, дельта — РОВНО 4 оборота Сухаря (формула наследования; хвост цепи — резерв 4 торговца НЕ в списке, он для .33)', () => {
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
    'дыхание кончается раньше рук', 'силу копят не в кулаке, а в груди',
    'лечат не раны, а спешку', 'усталость бьёт сильнее удара',
  ];
  const own = extract(__filename);
  const prevFile = path.join(__dirname, 'npc-000320.31.test.js');
  assert.ok(fs.existsSync(prevFile),
    'предыдущее звено цепи tests/npc-000320.31.test.js существует');
  const prev = extract(prevFile);
  const p31 = fs.readFileSync(prevFile, 'utf8');
  const discMine31 = [...p31.match(/const MINE = \[([\s\S]*?)\];/)[1]
    .matchAll(/'([^']*)'/g)].map((x) => x[1]);
  assert.deepEqual(EXPECT_ADDS, discMine31,
    'копии EXPECT_ADDS ≡ дисковой MINE-константе файла .31 '
    + '(правило 000390: формы ТОЛЬКО с диска — расхождение транскрипции '
    + 'ловится здесь); факт диска: ' + JSON.stringify(discMine31));
  assert.equal(own.length, 115,
    'guard-массив T5 этого файла — РОВНО 115 (пин по диску; вырез или '
    + 'лишний элемент ловятся здесь); факт: ' + own.length);
  assert.equal(new Set(own).size, own.length,
    'guard-массив этого файла — элементы уникальны (дубль ловится здесь)');
  assert.equal(prev.length, 111,
    'guard-массив T5 .31 — РОВНО 111 (то же число пинует T9 файла .31 — '
    + 'двойное покрытие); факт: ' + prev.length);
  assert.equal(new Set(prev).size, prev.length,
    'guard-массив .31 — элементы уникальны');
  const ownSet = new Set(own);
  const lost = [...new Set(prev)].filter((x) => !ownSet.has(x));
  assert.deepEqual(lost, [],
    'строгое включение prev ⊆ own — ни один элемент .31 не потерян; '
    + 'потеряно: ' + JSON.stringify(lost));
  const prevSet = new Set(prev);
  const adds = own.filter((x) => !prevSet.has(x));
  assert.deepEqual([...adds].sort(), [...EXPECT_ADDS].sort(),
    'дельта (own минус prev) — РОВНО 4 оборота Сухаря = MINE-константа '
    + 'файла .31 (формула наследования '
    + 'memory/000320-arena_doctor.md); СВОИ 4 оборота торговца (резерв '
    + '.33 по memory/000320-ore_merchant.md) в списке НЕ сидят; факт: '
    + JSON.stringify(adds));
});

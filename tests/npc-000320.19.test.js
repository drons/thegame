// Задача 000320.19: «Торговец специями» — id spice_trader, имя
// «Шафран» (Лавка странника, 3-й NPC постройки; 19-я из 100 дочерних
// 000320).
//
// Контракт (ТЗ tasks/done/000320.19.md; механизм мульти-NPC —
// 000320.01, spec/npc.md «Несколько NPC на постройку»,
// memory/000320-npcs-batch.md):
//   * assets/npc/000037.json — id spice_trader (резерв памяти; свип
//     по 36 занятым — свободен), имя «Шафран» (выбор агента:
//     пряность — его товар; прецеденты прозвищ по ремеслу/товару
//     000026 «Опилка» … 000036 «Хомут»; «Тмин» не взят — травяная
//     отсылка к Полуни .12), роль «торговец специями» (фикс ТЗ —
//     свипов уникальности ролей нет, прецеденты «наставник» и
//     «странствующий торговец», Т4 пишет точное равенство), постройка
//     assets/buildings/wanderer_shop.json (Лавка странника — ТРЕТИЙ
//     NPC: Хольд ПЕРВЫЙ, npcForBuilding(5) продолжает возвращать
//     Хольда; путь — SLUG: numeric-путь 000005.json из текста ТЗ
//     мёртв с 000318.06 и красит zero-sweep
//     tests/buildings-rename-000318.06.test.js T5), хук истории
//     «Продаёт пряности; прилавок его слышно за квартал» (последнее
//     предложение описания, с заглавной — прецеденты .02–.18);
//   * профиль — ТОРГОВЛЯ (клон механики .18 «Хомут» и .15
//     «Пергамент»: форма диалога и блока торговли; без
//     квестов/обучения/найма): РОВНО 3 опции, действия ⊆ {подсказка,
//     торговля}, ≥1 «торговля», РОВНО одна с {харизма:3}; блоков
//     квесты/обучение/найм НЕТ — счётчики npc-refs goal 2 / reward 5
//     НЕ растут; торговля 70 → 73, сумма 77 → 80, уникальные предметы
//     44 БЕЗ изменений — stone_chunk/coal/quartz продаёт Хольд,
//     дедуп по пути срабатывает;
//   * торговля — «пряности/специи» на диске НЕ резолвятся в
//     предметы (из пряно-имённых только артефакт «Гвоздик веры» —
//     не товар) — резолв через сток хозяина дома Хольда (прецедент
//     .18), тематика пряностей СЛОВЕСНАЯ в описании/диалоге
//     (прецеденты «продаёт копии» .17, «вьюки/повозки» .18); взято
//     000036 stone_chunk (камень под жернов), 000038 coal (тёмный
//     помол), 000055 quartz (каменная соль) — витрина отличается от
//     Хомута (wood_log/hide/coal); НОВЫЕ предметы не создаются;
//     формат 000322: base_price у всех трёх есть с миграции ⇒
//     assets/items НЕ трогаются; mult_продажи РОВНО 0.5 и НЕ ВЫШЕ
//     per-item множителя Хольда (у этих трёх ровно 0.5 — «тон
//     хозяина дома», прецеденты .11/.15/.18); количество 1,
//     mult_покупки при 1 — ключа НЕТ;
//   * опций с «для» — РОВНО 0: контракт A8a (tests/npc-dialog-scope)
//     — динамический свип ждёт 0 «для» у всех, кроме Берты/Элдиры/
//     Корда; добавление «для» = ослабление пина, запрещено (мутация
//     M1);
//   * тема диалога — пряности/прилавок/запах; «пряност», «специ»,
//     «прилавок», «караван», «дорог», «торгов» НЕ банятся —
//     категории своего дома (правило «брон» .09); к СВОЕМУ хуку
//     запрет-лист не применяется; запрет-лист ТЕКСТОВ диалога 59 =
//     дисковый список .18 T5 (52) + 3 зарезервированных оборота
//     Хомута (резерв memory/000320-wanderer_trader.md для .19+:
//     «на дневку», «сколько сгрузил», «ближе к холке») + СВОИ 4
//     оборота соседей дома 5 (Хольд — «сырьё кончается», «спрашивай
//     про руду»; Хомут — «то в моих вьюках», «ищи меня»; их диалог
//     не цитируем; СВОИ обороты зарезервированы для .20+ —
//     memory/000320-spice_trader.md);
//   * [E]-оверлей Лавки странника — РОВНО ТРИ dialog-строки в
//     порядке каталога: 'dialog' (Хольд) → 'dialog:wanderer_trader'
//     (Хомут) → 'dialog:spice_trader' (Шафран); хоткеи Digit1..3 —
//     общий механизм src/building-ui.js /^Digit([1-9])$/ по индексу
//     строки; пин создан в .18 (ДВЕ), поднят здесь; ЧЕТВЁРТЫЙ NPC
//     этого дома (.20 по сводной таблице) поднимет оверлей до 4 и
//     обязан ре-пинить T7/T8 обоих файлов дальше (прецеденты
//     .12–.17 для дома 4).
//
// КРАСНЫЕ (TDD): T1..T8 красные до зелёной стадии (000037.json нет,
// каталог 36, ростер дома 5 — ДВА NPC, оверлей 2 строки), без краха
// загрузки.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validateData } = require('./json-schema.js');

const ROOT = path.join(__dirname, '..');
const NDIR = path.join(ROOT, 'assets', 'npc');
const NEW = path.join(NDIR, '000037.json');
const HOLD = path.join(NDIR, '000011.json');
const SCHEMA = JSON.parse(
  fs.readFileSync(path.join(NDIR, 'schema.json'), 'utf8'));

const N = require('../src/npc.js');
const { NPCS } = require('../src/npc-data.js');
const BE = require('../src/building-effects.js');

const HOOK = 'Продаёт пряности; прилавок его слышно за квартал';
const ID = 'spice_trader';
const NAME = 'Шафран';

function listNpcFiles() {
  return fs.readdirSync(NDIR)
    .filter((f) => /^\d{6}\.json$/.test(f))
    .sort();
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// --- T1: размер каталога ---------------------------------------------------

test('T1: каталог — ровно 41 файла 000001..000041 подряд; зеркало NPCS 41 записей с spice_trader', () => {
  const files = listNpcFiles();
  assert.equal(files.length, 41,
    'в каталоге NPC 41 файла (000320.16: +Маг-наставник; 000320.17: '
    + '+Переписчик; 000320.18: +Странствующий торговец; 000320.19: '
    + '+Торговец специями; 000320.20: +Торговец каравана; 000347.02: +жрец солнца, жрица луны, горный жрец), факт: ' + files.length);
  for (let i = 0; i < files.length; i++) {
    assert.equal(files[i],
      String(i + 1).padStart(6, '0') + '.json',
      'нумерация подряд без пропусков: индекс ' + i);
  }
  assert.equal(NPCS.length, 41,
    'зеркало src/npc-data.js — 41 записей (sync не прогнан?), факт: '
    + NPCS.length);
  const last = NPCS[36];
  assert.ok(last, '37-я запись зеркала существует');
  assert.equal(last.id, ID,
    '37-я запись зеркала — spice_trader (порядок = нумерация файлов)');
  assert.equal(NPCS[35].id, 'wanderer_trader',
    'guard: 36-я запись — Странствующий торговец (позиционные NPCS[..] '
    + 'не сдвинуты)');
});

// --- T2: 000037.json валиден по схеме + порядок ключей + roundtrip ---------

test('T2: assets/npc/000037.json валиден по schema; ключи в порядке эталона ТОРГОВЛЯ .15/.18 (id, имя, роль, описание, постройки, диалог, торговля); roundtrip-канон; негативы — мимо схемы и мимо порядка ключей', () => {
  assert.ok(fs.existsSync(NEW),
    'RED: assets/npc/000037.json отсутствует (NPC задачи ещё не создан)');
  const data = readJson(NEW);
  assert.deepEqual(validateData(SCHEMA, data, 'npc/000037'), [],
    '000037.json обязан проходить assets/npc/schema.json');
  assert.deepEqual(Object.keys(data),
    ['id', 'имя', 'роль', 'описание', 'постройки', 'диалог', 'торговля'],
    'порядок ключей — как у эталона ТОРГОВЛЯ .15/.18 (000033/000036): '
    + 'id, имя, роль, описание, постройки, диалог, торговля — торговля '
    + 'ПОСЛЕ диалога, блоков обучение/квесты/найм нет');
  const raw = fs.readFileSync(NEW, 'utf8');
  assert.equal(raw, JSON.stringify(data, null, 2) + '\n',
    '000037.json — roundtrip JSON.stringify(obj,null,2)+перевод строки');
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
  const badQty = JSON.parse(JSON.stringify(data));
  badQty.торговля.предметы[0].количество = 0;
  assert.notDeepEqual(validateData(SCHEMA, badQty, 'npc/badqty'), [],
    'количество 0 — вне схемы (minimum 1, maximum 99)');
  const legacyEntry = JSON.parse(JSON.stringify(data));
  legacyEntry.торговля.предметы[0] = {
    предмет: 'assets/items/000038.json',
    цена_покупки: 2, цена_продажи: 1, количество: 1,
  };
  assert.notDeepEqual(validateData(SCHEMA, legacyEntry, 'npc/legacy'), [],
    'legacy-вход торговли (цена_покупки/цена_продажи) — невалиден (000322)');
});

// --- T3: id и имя уникальны (sweep) ----------------------------------------

test('T3: id spice_trader и имя «Шафран» уникальны в sweep каталога', () => {
  assert.ok(fs.existsSync(NEW), 'RED: assets/npc/000037.json отсутствует');
  const ids = new Set();
  const names = new Set();
  for (const f of listNpcFiles()) {
    const d = readJson(path.join(NDIR, f));
    assert.ok(!ids.has(d.id), 'дубликат id «' + d.id + '» (файл ' + f + ')');
    assert.ok(!names.has(d.имя), 'дубликат имени «' + d.имя + '» (файл ' + f + ')');
    ids.add(d.id);
    names.add(d.имя);
  }
  assert.ok(ids.has(ID), 'id spice_trader в каталоге');
  assert.ok(names.has(NAME), 'имя «Шафран» в каталоге');
});

// --- T4: роль-фикс, описание с хуком и уникально ----------------------------

test('T4: роль РОВНО «торговец специями» (точная строка ТЗ; свипов уникальности ролей нет — прецеденты «наставник» и «странствующий торговец»); описание непустое, хук «Продаёт пряности; прилавок его слышно за квартал» — последнее предложение, и НЕ копия описания другого NPC', () => {
  assert.ok(fs.existsSync(NEW), 'RED: assets/npc/000037.json отсутствует');
  const data = readJson(NEW);
  assert.ok(typeof data.описание === 'string' && data.описание.trim() !== '',
    'описание непустое');
  assert.equal(data.роль, 'торговец специями',
    'роль — фикс-строка «торговец специями» (ТЗ); Т4 пишет точное '
    + 'равенство (свипов уникальности ролей нет — прецеденты «наставник» '
    + '.10/.13/.16, «странствующий торговец» .11/.18/.19-хозяин)');
  assert.ok(data.описание.includes(HOOK),
    'хук истории «' + HOOK + '» (ТЗ) в описании дословно');
  assert.ok(data.описание.endsWith(HOOK + '.'),
    'хук — ПОСЛЕДНЕЕ предложение описания (с заглавной, с точкой на '
    + 'конце — прецеденты .02–.18); факт: '
    + JSON.stringify(data.описание.slice(-70)));
  for (const f of listNpcFiles()) {
    if (f === '000037.json') continue;
    const d = readJson(path.join(NDIR, f));
    assert.notEqual(d.описание, data.описание,
      'описание совпадает с ' + f + ' (не копия существующего)');
  }
});

// --- T5: диалог — профиль торговля, без «для» --------------------------------

test('T5: диалог валиден по схеме, РОВНО 3 опции как у эталона .15/.18, ≥1 «торговля», действия ⊆ {подсказка, торговля}, ровно одна с {харизма:3}, id опций уникальны, опций с «для» — ровно 0, запрет-лист 59 подстрок (дисковые 52 из .18 + резерв 3 оборотов Хомута + свои 4 оборота соседей дома 5) по ТЕКСТАМ диалога', () => {
  assert.ok(fs.existsSync(NEW), 'RED: assets/npc/000037.json отсутствует');
  const data = readJson(NEW);
  assert.ok(Array.isArray(data.диалог) && data.диалог.length >= 1,
    'диалог непустой (schema minItems 1)');
  assert.equal(data.диалог.length, 3,
    'диалог — ровно 3 опции (prives / торговля / hint — форма эталона '
    + 'ТОРГОВЛЯ .15/.18), факт: ' + data.диалог.length);
  const ACTIONS = SCHEMA.properties.диалог.items.properties.действие.enum;
  for (const o of data.диалог) {
    assert.ok(ACTIONS.includes(o.действие),
      'действие «' + o.действие + '» вне enum схемы');
    const errs = validateData(SCHEMA.properties.диалог.items, o, 'диалог');
    assert.deepEqual(errs, [],
      'опция «' + o.id + '» — вне схемы диалога: ' + JSON.stringify(errs));
  }
  assert.ok(data.диалог.some((o) => o.действие === 'торговля'),
    'профиль «торговля» — хотя бы одна опция действия «торговля»');
  assert.equal(
    data.диалог.filter((o) => o.действие !== 'подсказка'
      && o.действие !== 'торговля').length, 0,
    'профиль ТОРГОВЛЯ (без квестов/обучения/найма): опций с действием '
    + 'вне {подсказка, торговля} — ровно 0');
  const ids = data.диалог.map((o) => o.id);
  assert.equal(new Set(ids).size, ids.length, 'id опций диалога уникальны');
  assert.equal(data.диалог.filter((o) => o.для !== undefined).length, 0,
    'опций с «для» — ровно 0: торговец специями говорит со всеми; '
    + 'добавление «для» требует ре-пина A8a (tests/npc-dialog-scope) '
    + 'и запрещено');
  const withReq = data.диалог.filter((o) => o.требования !== undefined);
  assert.equal(withReq.length, 1,
    'ровно одна опция с требованиями (прецедент hint_wood/hint_old/'
    + 'hint_blade/hint_collection/hint_anvil/hint_march/hint_ring/'
    + 'hint_weight/hint_dry/hint_stone/hint_fire/hint_hand/hint_pack)');
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
    'между строк', 'при дневном свете', 'чернила помнят',
    'прощает торопливому', 'из-под пальцев', 'выберем тебе школу',
    'описк', 'чистовик', 'по концу листа', 'копию без торгу', 'вкривь',
    'кормит', 'от кузницы до кузницы', 'не пожалеешь',
    'пока повозка полная',
    'на дневку', 'сколько сгрузил', 'ближе к холке',
    'сырьё кончается', 'спрашивай про руду',
    'то в моих вьюках', 'ищи меня']) {
    assert.ok(!texts.includes(w),
      'тема чужого NPC (.04 «старые походы»/арена — «арен», .05 '
      + 'коллекция, .06 ковка/хвостовик, .07 наём/жалованье, .08 '
      + 'метла/стена клинков, .09 броня-звонок, .10 големы; тексты '
      + 'Милы — «старые дела»/«храм солнца»/«старейшина»/«посмеешь»; '
      + 'обороты Отвара — «на весах»/«сонной мяты»/«клонит в сон»; '
      + 'обороты Травницы — «завянет»/«пучками»/«почерневш»/«разотрёшь»; '
      + 'обороты Жгута — «где болит»/«выше раны»/«доживают до '
      + 'старости»; обороты Зиры — «не бывает лишнего»/«с далёких '
      + 'гор»/«договоримся о цене»; обороты Пергамента — «между '
      + 'строк»/«при дневном свете»/«чернила помнят»; обороты Пробника '
      + '— «прощает торопливому»/«из-под пальцев»/«выберем тебе '
      + 'школу»; обороты Грифеля — «описк»/«чистовик»/«по концу '
      + 'листа»/«копию без торгу» + доп. «вкривь» из строки его '
      + 'диалога; обороты Хольда — «кормит»/«от кузницы до '
      + 'кузницы»/«не пожалеешь»/«пока повозка полная» + резерв .19 '
      + '«сырьё кончается»/«спрашивай про руду»; обороты Хомута — '
      + 'резерв memory/000320-wanderer_trader.md для .19+ «на '
      + 'дневку»/«сколько сгрузил»/«ближе к холке» + резерв .20+ '
      + '«то в моих вьюках»/«ищи меня») не дублируется: подстрока «'
      + w + '»');
  }
});

// --- T6: профиль-гарант + торговля — 3 позиции из стока Хольда ---------------

test('T6: блоков квесты/обучение/найм НЕТ (ни в JSON, ни в зеркале), торговля ЕСТЬ там и там; РОВНО 3 входа (stone_chunk/coal/quartz — резолв ассортимента постройки 5 через сток Хольда, витрина отличается от Хомута) с base_price в JSON предмета; mult ∈ (0,1], РОВНО 0.5 и НЕ выше per-item множителя Хольда; mult_покупки отсутствует; количество 1..99; зеркало: постройки [5], торговля резолвится в id, диалог/описание deepEqual', () => {
  assert.ok(fs.existsSync(NEW), 'RED: assets/npc/000037.json отсутствует');
  const data = readJson(NEW);
  for (const block of ['квесты', 'обучение', 'найм']) {
    assert.ok(!(block in data),
      'в JSON нет блока «' + block + '»: профиль торговля без квестов — '
      + 'счётчики npc-refs goal 2 / reward 5 не растут');
  }
  assert.ok(data.торговля && Array.isArray(data.торговля.предметы),
    'в JSON есть блок «торговля» с предметами (trade 70 → 73)');
  assert.deepEqual(Object.keys(data.торговля), ['предметы'],
    'блок торговли — единственный ключ «предметы» (формат 000322)');
  const items = data.торговля.предметы;
  assert.equal(items.length, 3,
    'витрина — ровно 3 позиции (форма эталона .15/.18), факт: ' + items.length);
  const hold = readJson(HOLD);
  const holdPaths = new Set(hold.торговля.предметы.map((p) => p.предмет));
  const holdMult = {};
  for (const p of hold.торговля.предметы) holdMult[p.предмет] = p.mult_продажи;
  const mirror = NPCS[36];
  assert.ok(mirror && mirror.id === ID, 'зеркало: 37-я запись spice_trader');
  assert.equal(mirror.роль, 'торговец специями',
    'роль в зеркале — «торговец специями» (фикс ТЗ)');
  for (const block of ['квесты', 'обучение', 'найм']) {
    assert.ok(!(block in mirror),
      'в зеркале нет блока «' + block + '» (следует из JSON)');
  }
  assert.ok(mirror.торговля && Array.isArray(mirror.торговля.предметы),
    'в зеркале есть блок «торговля» (следует из JSON)');
  assert.deepEqual(mirror.постройки, [5],
    'зеркало: постройки [5] — sync резолвит ссылку Лавки странника в id');
  const ids = new Set();
  items.forEach((p, j) => {
    assert.match(p.предмет, /^assets\/items\/\d{6}\.json$/,
      'путь предмета — якорная ссылка: ' + p.предмет);
    assert.ok(holdPaths.has(p.предмет),
      p.предмет + ': позиция ⊆ ассортимента дома 5 — резолв «пряностей» '
      + 'через сток хозяина дома (пряно-имённых товаров на диске нет; '
      + 'Хольд продаёт: ' + JSON.stringify([...holdPaths]) + ')');
    const target = path.join(ROOT, p.предмет);
    assert.ok(fs.existsSync(target), 'предмет существует по пути: ' + p.предмет);
    const it = readJson(target);
    assert.equal(it.kind, 'reagent',
      p.предмет + ': лавка странника торгует дорожным сырьём — kind '
      + 'reagent (тот же контракт, что витрина Хольда в npc-data.test)');
    assert.ok(Number.isInteger(it.base_price) && it.base_price >= 1,
      p.предмет + ': base_price в JSON предмета (000322) — у всех '
      + 'предметов Хольда он есть; факт: ' + JSON.stringify(it.base_price));
    ids.add(it.id);
    assert.equal(mirror.торговля.предметы[j].предмет, it.id,
      'зеркало резолвит путь в id: ' + p.предмет);
    assert.ok(p.mult_продажи > 0 && p.mult_продажи <= 1,
      p.предмет + ': mult_продажи ∈ (0,1]: ' + p.mult_продажи);
    assert.equal(p.mult_продажи, 0.5,
      p.предмет + ': множитель РОВНО 0.5 — тон дома 5 (продажные '
      + 'множители Хольда у этих трёх ровно 0.5; «третий NPC дома — '
      + 'в тон хозяину», прецеденты .11/.15/.18), факт: ' + p.mult_продажи);
    assert.ok(p.mult_продажи <= holdMult[p.предмет],
      p.предмет + ': множитель НЕ ВЫШЕ per-item множителя Хольда ('
      + holdMult[p.предмет] + '), факт: ' + p.mult_продажи);
    assert.ok(!('mult_покупки' in p),
      p.предмет + ': mult_покупки при 1 — КЛЮЧ обязан ОТСУТСТВОВАТЬ (000322)');
    assert.ok(Number.isInteger(p.количество) && p.количество >= 1
      && p.количество <= 99,
      p.предмет + ': количество int 1..99, факт: ' + p.количество);
  });
  assert.deepEqual([...ids].sort(), ['coal', 'quartz', 'stone_chunk'],
    'ассортимент — жернов/тёмный помол/каменная соль (камень под '
    + 'жернов, уголь, кварц — резолв «пряностей» постройки 5 «что '
    + 'продаёт Хольд»; витрина отличается от Хомута wood_log/hide/'
    + 'coal); факт: ' + JSON.stringify([...ids].sort()));
  const khomyut = NPCS[35];
  const khomyutPaths = new Set(
    readJson(path.join(NDIR, '000036.json')).торговля.предметы
      .map((p) => p.предмет));
  for (const p of items) {
    assert.ok(!khomyutPaths.has(p.предмет) || p.предмет === 'assets/items/000038.json',
      p.предмет + ': витрина различима с Хомутом (общий допустим — '
      + 'только уголь как «тёмный помол»); дрейф запрещён');
  }
  assert.ok(khomyut && khomyut.id === 'wanderer_trader');
  assert.deepEqual(mirror.диалог, data.диалог,
    'зеркало NPCS[36].диалог ≡ JSON-диалог бит-в-бит');
  assert.deepEqual(mirror.описание, data.описание,
    'зеркало NPCS[36].описание ≡ JSON');
});

// --- T7: ростер дома 5 — ЧЕТЫРЕ записи, Хольд первый ----------------------------

test('T7: npcsForBuilding(NPCS, 5) — ЧЕТЫРЕ записи Лавки странника в порядке каталога [wanderer_merchant, wanderer_trader, spice_trader, caravan_trader]; npcForBuilding(5) — по-прежнему Хольд; Магазин магии — ЧЕТЫРЕ, Аптекарь — ПЯТЬ, Бронник — ТРИ и Оружейная — ДЕВЯТЬ не тронуты', () => {
  const list = N.npcsForBuilding(NPCS, 5);
  assert.deepEqual(list.map((n) => n.id),
    ['wanderer_merchant', 'wanderer_trader', ID, 'caravan_trader'],
    'Лавка странника (5): Хольд (000011) + Странствующий торговец '
    + '(000036) + Торговец специями (000037) + Торговец каравана (000038), порядок = нумерация '
    + 'файлов; факт: ' + JSON.stringify(list.map((n) => n.id)));
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

// --- T8: оверлей дома 5 — ровно 4 dialog-строки ------------------------------

test('T8: [E]-оверлей Лавки странника — ровно 4 строки: dialog (Хольд), dialog:wanderer_trader (Хомут), dialog:spice_trader (Шафран), dialog:caravan_trader (Барыш) — ре-пин .18 (ДВЕ→ТРИ), поднят .20 (ТРИ→ЧЕТЫРЕ); хоткеи Digit1..4; ПЯТЫЙ NPC дома 5 (.21 по сводной таблице) поднимет оверлей до 5 и заре-пинит T7/T8 всех трёх файлов (.18/.19/.20) дальше', () => {
  const b = readJson(path.join(ROOT, 'assets', 'buildings', 'wanderer_shop.json'));
  const list = N.npcsForBuilding(NPCS, 5);
  const rows = BE.buildingActions(b, list, { day: 5 });
  assert.deepEqual(rows.map((r) => r.id),
    ['dialog', 'dialog:wanderer_trader', 'dialog:' + ID, 'dialog:caravan_trader'],
    'у здания 5 эффектов нет — список = dialog-строки по каждому NPC; '
    + 'факт: ' + JSON.stringify(rows.map((r) => r.id)));
  assert.deepEqual(rows.map((r) => r.имя),
    ['Диалог: Хольд', 'Диалог: Хомут', 'Диалог: ' + NAME, 'Диалог: Барыш'],
    'подписи — «Диалог: <имя>», факт: ' + JSON.stringify(rows.map((r) => r.имя)));
  assert.deepEqual(rows.map((r) => r.npcId),
    ['wanderer_merchant', 'wanderer_trader', ID, 'caravan_trader'],
    'каждая строка несёт npcId своего NPC (роутинг клика); хоткеи '
    + 'Digit1..4 — общий механизм /^Digit([1-9])$/ (src/building-ui.js) '
    + 'по индексу строки');
});

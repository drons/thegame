// Задача 000320.20: «Торговец каравана» — id caravan_trader, имя
// «Барыш» (Лавка странника, 4-й NPC постройки; 20-я из 100 дочерних
// 000320).
//
// Контракт (ТЗ tasks/pending/000320.20.md; механизм мульти-NPC —
// 000320.01, spec/npc.md «Несколько NPC на постройку»,
// memory/000320-npcs-batch.md; профиль-прецедент — .19):
//   * assets/npc/000038.json — id caravan_trader (свип по 37 занятым
//     — свободен), имя «Барыш» (выбор агента: барыш — его ремесло;
//     прецеденты прозвищ по товару 000026 «Опилка» … 000037
//     «Шафран»; «Меняла» не взят — меняла не караванный торговец),
//     роль «торговец» (фикс ТЗ — свипов уникальности ролей нет,
//     Т4 пишет точное равенство), постройка
//     assets/buildings/wanderer_shop.json (Лавка странника — ТЗ-путь
//     000005.json мёртв с 000318.06: zero-sweep numeric-путей
//     tests/buildings-rename-000318.06.test.js T5; путь — SLUG),
//     4-й NPC дома: Хольд ПЕРВЫЙ, npcForBuilding(5) продолжает
//     возвращать Хольда; хук истории «Считает монеты в трёх
//     валютах, говорит на двух» — последнее предложение описания
//     (прецеденты .02–.19);
//   * профиль диалога «торговля, подсказка» (форма .19/.18: РОВНО 3
//     опции, действия ⊆ {подсказка, торговля}, ≥1 «торговля» И ≥1
//     «подсказка», РОВНО одна с {харизма:3}; без
//     квестов/обучения/найма — счётчики npc-refs goal 2 / reward 5
//     НЕ растут);
//   * торговля — «три валюты» тематически закрыты витриной из ТРЁХ
//     МЕТАЛЛОВ: 000033 iron_ore / 000034 copper_ore / 000052
//     silver_ore (НОВЫЕ предметы не создаются; резолв ассортимента
//     постройки через сток Хольда — все три продаёт он, дедуп по
//     пути ⇒ уникальные предметы npc-refs 44 БЕЗ; торговля 73 → 76,
//     сумма 80 → 83); витрина РАЗЛИЧНА от Хомута (wood_log/hide/
//     coal) И от Шафрана (stone_chunk/coal/quartz) — БЕЗ общих
//     позиций (строже .19, где coal был общим); формат 000322:
//     base_price у всех трёх есть с миграции, mult_продажи РОВНО
//     0.5 — тон дома 5 (у Хольда 0.5/0.5/0.5333 — не выше per-item),
//     mult_покупки при 1 — ключа НЕТ, количество 1;
//   * опций с «для» — РОВНО 0: контракт A8a (tests/npc-dialog-scope)
//     — динамический свип ждёт 0 «для» у всех, кроме Берты/Элдиры/
//     Корда; добавление «для» = ослабление пина, запрещено (мутация
//     M1);
//   * тема диалога — монеты/валюты/языки/обоз; «монет», «валют»,
//     «кошел», «счита», «караван», «дорог», «торгов» НЕ банятся —
//     категории своего дома/своей темы (правило «брон» .09); к
//     СВОЕМУ хуку запрет-лист не применяется; запрет-лист ТЕКСТОВ
//     диалога 63 = дисковый список .19 T5 (59, уже с живым «храме
//     солнца» — тема Милы — после docs-errata 000360; возврат в
//     цепочку по 000364 / b18 №7) + 4 зарезерви-
//     рованных оборота Шафрана (memory/000320-spice_trader.md для
//     .20+: «до площади раньше колокола», «понюхай сначала»,
//     «каменная соль», «в самом конце»); СВОИ обороты зарезерви-
//     рованы для .21+ — memory/000320-caravan_trader.md;
//   * [E]-оверлей Лавки странника — РОВНО ЧЕТЫРЕ dialog-строки в
//     порядке каталога: 'dialog' (Хольд) → 'dialog:wanderer_trader'
//     (Хомут) → 'dialog:spice_trader' (Шафран) → 'dialog:
//     caravan_trader' (Барыш); хоткеи Digit1..4 — общий механизм
//     src/building-ui.js /^Digit([1-9])$/ по индексу строки; пин
//     создан в .18 (ДВЕ), поднят .19 (ТРИ) и здесь (ЧЕТЫРЕ) —
//     ре-пинуты T7/T8 обоих файлов (.19 T8 предписывал это заранее,
//     прецеденты .12–.17 для дома 4).
//
// КРАСНЫЕ (TDD): T1..T8 красные до зелёной стадии (000038.json нет,
// каталог 37, ростер дома 5 — ТРИ NPC, оверлей 3 строки), без краха
// загрузки.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validateData } = require('./json-schema.js');

const ROOT = path.join(__dirname, '..');
const NDIR = path.join(ROOT, 'assets', 'npc');
const NEW = path.join(NDIR, '000038.json');
const HOLD = path.join(NDIR, '000011.json');
const SCHEMA = JSON.parse(
  fs.readFileSync(path.join(NDIR, 'schema.json'), 'utf8'));

const N = require('../src/npc.js');
const { NPCS } = require('../src/npc-data.js');
const BE = require('../src/building-effects.js');

const HOOK = 'Считает монеты в трёх валютах, говорит на двух';
const ID = 'caravan_trader';
const NAME = 'Барыш';

function listNpcFiles() {
  return fs.readdirSync(NDIR)
    .filter((f) => /^\d{6}\.json$/.test(f))
    .sort();
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// --- T1: размер каталога ---------------------------------------------------

test('T1: каталог — ровно 43 файла 000001..000043 подряд; зеркало NPCS 43 записей с caravan_trader', () => {
  const files = listNpcFiles();
  assert.equal(files.length, 43,
    'в каталоге NPC 43 файла (000320.17: +Переписчик; 000320.18: '
    + '+Странствующий торговец; 000320.19: +Торговец специями; '
    + '000320.20: +Торговец каравана; 000347.02: +жрец солнца, жрица луны, горный жрец; 000320.21: +Проводник; 000320.22: +Перекати), факт: ' + files.length);
  for (let i = 0; i < files.length; i++) {
    assert.equal(files[i],
      String(i + 1).padStart(6, '0') + '.json',
      'нумерация подряд без пропусков: индекс ' + i);
  }
  assert.equal(NPCS.length, 43,
    'зеркало src/npc-data.js — 43 записей (sync не прогнан?), факт: '
    + NPCS.length);
  const last = NPCS[37];
  assert.ok(last, '38-я запись зеркала существует');
  assert.equal(last.id, ID,
    '38-я запись зеркала — caravan_trader (порядок = нумерация файлов)');
  assert.equal(NPCS[36].id, 'spice_trader',
    'guard: 37-я запись — Торговец специями (позиционные NPCS[..] '
    + 'не сдвинуты)');
});

// --- T2: 000038.json валиден по схеме + порядок ключей + roundtrip ---------

test('T2: assets/npc/000038.json валиден по schema; ключи в порядке эталона ТОРГОВЛЯ .15/.18/.19 (id, имя, роль, описание, постройки, диалог, торговля); roundtrip-канон; негативы — мимо схемы и мимо порядка ключей', () => {
  assert.ok(fs.existsSync(NEW),
    'RED: assets/npc/000038.json отсутствует (NPC задачи ещё не создан)');
  const data = readJson(NEW);
  assert.deepEqual(validateData(SCHEMA, data, 'npc/000038'), [],
    '000038.json обязан проходить assets/npc/schema.json');
  assert.deepEqual(Object.keys(data),
    ['id', 'имя', 'роль', 'описание', 'постройки', 'диалог', 'торговля'],
    'порядок ключей — как у эталона ТОРГОВЛЯ .15/.18/.19 (000033/'
    + '000036/000037): id, имя, роль, описание, постройки, диалог, '
    + 'торговля — торговля ПОСЛЕ диалога, блоков обучение/квесты/'
    + 'найм нет');
  const raw = fs.readFileSync(NEW, 'utf8');
  assert.equal(raw, JSON.stringify(data, null, 2) + '\n',
    '000038.json — roundtrip JSON.stringify(obj,null,2)+перевод строки');
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

test('T3: id caravan_trader и имя «Барыш» уникальны в sweep каталога', () => {
  assert.ok(fs.existsSync(NEW), 'RED: assets/npc/000038.json отсутствует');
  const ids = new Set();
  const names = new Set();
  for (const f of listNpcFiles()) {
    const d = readJson(path.join(NDIR, f));
    assert.ok(!ids.has(d.id), 'дубликат id «' + d.id + '» (файл ' + f + ')');
    assert.ok(!names.has(d.имя), 'дубликат имени «' + d.имя + '» (файл ' + f + ')');
    ids.add(d.id);
    names.add(d.имя);
  }
  assert.ok(ids.has(ID), 'id caravan_trader в каталоге');
  assert.ok(names.has(NAME), 'имя «Барыш» в каталоге');
});

// --- T4: роль-фикс, описание с хуком и уникально ----------------------------

test('T4: роль РОВНО «торговец» (точная строка ТЗ; свипов уникальности ролей нет — прецеденты «наставник» и «странствующий торговец»); описание непустое, хук «Считает монеты в трёх валютах, говорит на двух» — последнее предложение, и НЕ копия описания другого NPC', () => {
  assert.ok(fs.existsSync(NEW), 'RED: assets/npc/000038.json отсутствует');
  const data = readJson(NEW);
  assert.ok(typeof data.описание === 'string' && data.описание.trim() !== '',
    'описание непустое');
  assert.equal(data.роль, 'торговец',
    'роль — фикс-строка «торговец» (ТЗ); Т4 пишет точное равенство '
    + '(свипов уникальности ролей нет — прецеденты «наставник» '
    + '.10/.13/.16, «странствующий торговец» .11/.18/.19-хозяин)');
  assert.ok(data.описание.includes(HOOK),
    'хук истории «' + HOOK + '» (ТЗ) в описании дословно');
  assert.ok(data.описание.endsWith(HOOK + '.'),
    'хук — ПОСЛЕДНЕЕ предложение описания (с заглавной, с точкой на '
    + 'конце — прецеденты .02–.19); факт: '
    + JSON.stringify(data.описание.slice(-70)));
  for (const f of listNpcFiles()) {
    if (f === '000038.json') continue;
    const d = readJson(path.join(NDIR, f));
    assert.notEqual(d.описание, data.описание,
      'описание совпадает с ' + f + ' (не копия существующего)');
  }
});

// --- T5: диалог — профиль торговля+подсказка, без «для» ---------------------

test('T5: диалог валиден по схеме, РОВНО 3 опции как у эталона .15/.18/.19, ≥1 «торговля» И ≥1 «подсказка», действия ⊆ {подсказка, торговля}, ровно одна с {харизма:3}, id опций уникальны, опций с «для» — ровно 0, запрет-лист 63 подстрок (дисковый список .19 = 59, уже с живым «храме солнца» после docs-errata 000360 + резерв 4 оборотов Шафрана) по ТЕКСТАМ диалога', () => {
  assert.ok(fs.existsSync(NEW), 'RED: assets/npc/000038.json отсутствует');
  const data = readJson(NEW);
  assert.ok(Array.isArray(data.диалог) && data.диалог.length >= 1,
    'диалог непустой (schema minItems 1)');
  assert.equal(data.диалог.length, 3,
    'диалог — ровно 3 опции (prives / торговля / hint — форма эталона '
    + 'ТОРГОВЛЯ .15/.18/.19), факт: ' + data.диалог.length);
  const ACTIONS = SCHEMA.properties.диалог.items.properties.действие.enum;
  for (const o of data.диалог) {
    assert.ok(ACTIONS.includes(o.действие),
      'действие «' + o.действие + '» вне enum схемы');
    const errs = validateData(SCHEMA.properties.диалог.items, o, 'диалог');
    assert.deepEqual(errs, [],
      'опция «' + o.id + '» — вне схемы диалога: ' + JSON.stringify(errs));
  }
  assert.ok(data.диалог.some((o) => o.действие === 'торговля'),
    'профиль «торговля, подсказка» — хотя бы одна опция действия '
    + '«торговля»');
  assert.ok(data.диалог.some((o) => o.действие === 'подсказка'),
    'профиль «торговля, подсказка» — хотя бы одна опция действия '
    + '«подсказка»');
  assert.equal(
    data.диалог.filter((o) => o.действие !== 'подсказка'
      && o.действие !== 'торговля').length, 0,
    'профиль ТОРГОВЛЯ+ПОДСКАЗКА (без квестов/обучения/найма): опций с '
    + 'действием вне {подсказка, торговля} — ровно 0');
  const ids = data.диалог.map((o) => o.id);
  assert.equal(new Set(ids).size, ids.length, 'id опций диалога уникальны');
  assert.equal(data.диалог.filter((o) => o.для !== undefined).length, 0,
    'опций с «для» — ровно 0: торговец каравана говорит со всеми; '
    + 'добавление «для» требует ре-пина A8a (tests/npc-dialog-scope) '
    + 'и запрещено');
  const withReq = data.диалог.filter((o) => o.требования !== undefined);
  assert.equal(withReq.length, 1,
    'ровно одна опция с требованиями (прецедент hint_wood/hint_old/'
    + 'hint_blade/hint_collection/hint_anvil/hint_march/hint_ring/'
    + 'hint_weight/hint_dry/hint_stone/hint_fire/hint_hand/hint_pack/'
    + 'hint_scent)');
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
    'то в моих вьюках', 'ищи меня',
    'до площади раньше колокола', 'понюхай сначала',
    'каменная соль', 'в самом конце']) {
    assert.ok(!texts.includes(w),
      'тема чужого NPC (.04 «старые походы»/арена — «арен», .05 '
      + 'коллекция, .06 ковка/хвостовик, .07 наём/жалованье, .08 '
      + 'метла/стена клинков, .09 броня-звонок, .10 големы; тексты '
      + 'Милы — «старые дела»/«храм солнца»/«старейшина»/«посмеешь» '
      + '(матчер «храме солнца» — живой, возвращён в цепочку по '
      + '000364 / b18 №7); обороты '
      + 'Отвара — «на весах»/«сонной мяты»/«клонит в сон»; обороты '
      + 'Травницы — «завянет»/«пучками»/«почерневш»/«разотрёшь»; '
      + 'обороты Жгута — «где болит»/«выше раны»/«доживают до '
      + 'старости»; обороты Зиры — «не бывает лишнего»/«с далёких '
      + 'гор»/«договоримся о цене»; обороты Пергамента — «между '
      + 'строк»/«при дневном свете»/«чернила помнят»; обороты Пробника '
      + '— «прощает торопливому»/«из-под пальцев»/«выберем тебе '
      + 'школу»; обороты Грифеля — «описк»/«чистовик»/«по концу '
      + 'листа»/«копию без торгу» + доп. «вкривь» из строки его '
      + 'диалога; обороты Хольда — «кормит»/«от кузницы до '
      + 'кузницы»/«не пожалеешь»/«пока повозка полная» + «сырьё '
      + 'кончается»/«спрашивай про руду»; обороты Хомута — резерв '
      + 'memory/000320-wanderer_trader.md «на дневку»/«сколько '
      + 'сгрузил»/«ближе к холке» + «то в моих вьюках»/«ищи меня»; '
      + 'обороты Шафрана — резерв memory/000320-spice_trader.md для '
      + '.20+ «до площади раньше колокола»/«понюхай сначала»/'
      + '«каменная соль»/«в самом конце») не дублируется: подстрока «'
      + w + '»');
  }
});

// --- T6: профиль-гарант + торговля — 3 металла из стока Хольда --------------

test('T6: блоков квесты/обучение/найм НЕТ (ни в JSON, ни в зеркале), торговля ЕСТЬ там и там; РОВНО 3 входа (iron_ore/copper_ore/silver_ore — «три валюты» витриной трёх металлов, резолв ассортимента постройки 5 через сток Хольда, витрина без общих позиций и с Хомутом, и с Шафраном) с base_price в JSON предмета; mult ∈ (0,1], РОВНО 0.5 и НЕ выше per-item множителя Хольда; mult_покупки отсутствует; количество 1..99; зеркало: постройки [5], торговля резолвится в id, диалог/описание deepEqual', () => {
  assert.ok(fs.existsSync(NEW), 'RED: assets/npc/000038.json отсутствует');
  const data = readJson(NEW);
  for (const block of ['квесты', 'обучение', 'найм']) {
    assert.ok(!(block in data),
      'в JSON нет блока «' + block + '»: профиль торговля без квестов — '
      + 'счётчики npc-refs goal 2 / reward 5 не растут');
  }
  assert.ok(data.торговля && Array.isArray(data.торговля.предметы),
    'в JSON есть блок «торговля» с предметами (trade 73 → 76)');
  assert.deepEqual(Object.keys(data.торговля), ['предметы'],
    'блок торговли — единственный ключ «предметы» (формат 000322)');
  const items = data.торговля.предметы;
  assert.equal(items.length, 3,
    'витрина — ровно 3 позиции (форма эталона .15/.18/.19; «три '
    + 'валюты» — три металла), факт: ' + items.length);
  const hold = readJson(HOLD);
  const holdPaths = new Set(hold.торговля.предметы.map((p) => p.предмет));
  const holdMult = {};
  for (const p of hold.торговля.предметы) holdMult[p.предмет] = p.mult_продажи;
  const mirror = NPCS[37];
  assert.ok(mirror && mirror.id === ID, 'зеркало: 38-я запись caravan_trader');
  assert.equal(mirror.роль, 'торговец',
    'роль в зеркале — «торговец» (фикс ТЗ)');
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
      p.предмет + ': позиция ⊆ ассортимента дома 5 — резолв «валют» '
      + 'через сток хозяина дома (монетных товаров на диске нет; '
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
      + 'множители Хольда у этих трёх 0.5/0.5/0.5333; «четвёртый NPC '
      + 'дома — в тон хозяину», прецеденты .11/.15/.18/.19), факт: '
      + p.mult_продажи);
    assert.ok(p.mult_продажи <= holdMult[p.предмет],
      p.предмет + ': множитель НЕ ВЫШЕ per-item множителя Хольда ('
      + holdMult[p.предмет] + '), факт: ' + p.mult_продажи);
    assert.ok(!('mult_покупки' in p),
      p.предмет + ': mult_покупки при 1 — КЛЮЧ обязан ОТСУТСТВОВАТЬ (000322)');
    assert.ok(Number.isInteger(p.количество) && p.количество >= 1
      && p.количество <= 99,
      p.предмет + ': количество int 1..99, факт: ' + p.количество);
  });
  assert.deepEqual([...ids].sort(), ['copper_ore', 'iron_ore', 'silver_ore'],
    'ассортимент — железо/медь/серебро (три металла ↔ «три валюты» '
    + 'хука; резолв «валют» постройки 5 «что продаёт Хольд»; НОВЫЕ '
    + 'предметы не создаются); факт: ' + JSON.stringify([...ids].sort()));
  const khomyut = NPCS[35];
  assert.ok(khomyut && khomyut.id === 'wanderer_trader');
  const khomyutPaths = new Set(
    readJson(path.join(NDIR, '000036.json')).торговля.предметы
      .map((p) => p.предмет));
  const shafranPaths = new Set(
    readJson(path.join(NDIR, '000037.json')).торговля.предметы
      .map((p) => p.предмет));
  for (const p of items) {
    assert.ok(!khomyutPaths.has(p.предмет),
      p.предмет + ': витрина различима с Хомутом (wood_log/hide/coal) '
      + 'БЕЗ общих позиций (строже .19, где coal был общим); дрейф '
      + 'запрещён');
    assert.ok(!shafranPaths.has(p.предмет),
      p.предмет + ': витрина различима с Шафраном (stone_chunk/coal/'
      + 'quartz) БЕЗ общих позиций; дрейф запрещён');
  }
  assert.deepEqual(mirror.диалог, data.диалог,
    'зеркало NPCS[37].диалог ≡ JSON-диалог бит-в-бит');
  assert.deepEqual(mirror.описание, data.описание,
    'зеркало NPCS[37].описание ≡ JSON');
});

// --- T7: ростер дома 5 — ШЕСТЬ записей, Хольд первый --------------------------

test('T7: npcsForBuilding(NPCS, 5) — ШЕСТЬ записей Лавки странника в порядке каталога [wanderer_merchant, wanderer_trader, spice_trader, caravan_trader, path_guide, tumbleweed]; npcForBuilding(5) — по-прежнему Хольд; Магазин магии — ЧЕТЫРЕ, Аптекарь — ПЯТЬ, Бронник — ТРИ и Оружейная — ДЕВЯТЬ не тронуты', () => {
  const list = N.npcsForBuilding(NPCS, 5);
  assert.deepEqual(list.map((n) => n.id),
    ['wanderer_merchant', 'wanderer_trader', 'spice_trader', ID, 'path_guide',
      'tumbleweed'],
    'Лавка странника (5): Хольд (000011) + Странствующий торговец '
    + '(000036) + Торговец специями (000037) + Торговец каравана '
    + '(000038) + Проводник (000042) + Кочевник Перекати (000043), порядок = нумерация файлов; факт: '
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

// --- T8: оверлей дома 5 — ровно 6 dialog-строк ------------------------------

test('T8: [E]-оверлей Лавки странника — ровно 6 строк: dialog (Хольд), dialog:wanderer_trader (Хомут), dialog:spice_trader (Шафран), dialog:caravan_trader (Барыш), dialog:path_guide (Стрелка), dialog:tumbleweed (Перекати) — ре-пин .19 ТРИ→ЧЕТЫРЕ, 000320.21 ЧЕТЫРЕ→ПЯТЬ и .22 ПЯТЬ→ШЕСТЬ; хоткеи Digit1..6; СЕДЬМОЙ NPC дома 5 (.23 глава каравана по сводной таблице) поднимет оверлей до 7 и заре-пинит T7/T8 всех пяти файлов (.18/.19/.20/.21/.22) дальше', () => {
  const b = readJson(path.join(ROOT, 'assets', 'buildings', 'wanderer_shop.json'));
  const list = N.npcsForBuilding(NPCS, 5);
  const rows = BE.buildingActions(b, list, { day: 5 });
  assert.deepEqual(rows.map((r) => r.id),
    ['dialog', 'dialog:wanderer_trader', 'dialog:spice_trader',
      'dialog:' + ID, 'dialog:path_guide', 'dialog:tumbleweed'],
    'у здания 5 эффектов нет — список = dialog-строки по каждому NPC; '
    + 'факт: ' + JSON.stringify(rows.map((r) => r.id)));
  assert.deepEqual(rows.map((r) => r.имя),
    ['Диалог: Хольд', 'Диалог: Хомут', 'Диалог: Шафран',
      'Диалог: ' + NAME, 'Диалог: Стрелка', 'Диалог: Перекати'],
    'подписи — «Диалог: <имя>», факт: ' + JSON.stringify(rows.map((r) => r.имя)));
  assert.deepEqual(rows.map((r) => r.npcId),
    ['wanderer_merchant', 'wanderer_trader', 'spice_trader', ID, 'path_guide',
      'tumbleweed'],
    'каждая строка несёт npcId своего NPC (роутинг клика); хоткеи '
    + 'Digit1..6 — общий механизм /^Digit([1-9])$/ (src/building-ui.js) '
    + 'по индексу строки, лимит 9 не достигнут');
});

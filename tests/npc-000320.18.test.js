// Задача 000320.18: «Странствующий торговец» — id wanderer_trader, имя
// «Хомут» (Лавка странника, 2-й NPC постройки; 18-я из 100 дочерних 000320).
//
// Контракт (ТЗ tasks/done/000320.18.md; механизм мульти-NPC —
// 000320.01, spec/npc.md «Несколько NPC на постройку»,
// memory/000320-npcs-batch.md):
//   * assets/npc/000036.json — id wanderer_trader (резерв памяти
//     ТЗ; память-файл фиксирован ТЗ именем 000320-wanderer_trader.md
//     независимо от id; sweep по 35 занятым — свободен), имя «Хомут»
//     (выбор агента: прозвище по упряжи каравана — хомут держит
//     вьюк и оглоблю, на нём и стоит обозная тяга; прецеденты
//     прозвищ по ремеслу/орудию 000026 «Опилка» … 000035 «Грифель»),
//     роль «странствующий торговец» (фикс ТЗ; строка УЖЕ есть у
//     wanderer_merchant «Хольд» и camp_wanderer «Кочевник» — свипов
//     уникальности ролей нет, Т4 пишет точное равенство; прецедент
//     «наставник» .10/.13/.16), постройка
//     assets/buildings/wanderer_shop.json (Лавка странника — ВТОРОЙ
//     NPC: Хольд ПЕРВЫЙ, npcForBuilding(5) продолжает возвращать
//     Хольда; путь — SLUG: numeric-путь 000005.json из текста ТЗ
//     мёртв с 000318.06 и красит zero-sweep
//     tests/buildings-rename-000318.06.test.js T5), хук истории
//     «Приходит с караваном, уходит с караваном — стоит только на
//     торговле» (последнее предложение описания, с заглавной —
//     прецеденты .02–.17);
//   * профиль — ТОРГОВЛЯ (клон механики .15 «Пергамент»: форма
//     диалога и блока торговли; без квестов/обучения/найма): РОВНО 3
//     опции, действия ⊆ {подсказка, торговля}, ≥1 «торговля», РОВНО
//     одна с {харизма:3} (прецедент hint_* — НЕ «проверка»); блоков
//     квесты/обучение/найм НЕТ — счётчики npc-refs goal 2 / reward 5
//     НЕ растут; торговля 67 → 70, сумма 74 → 77, уникальные предметы
//     44 БЕЗ изменений — wood_log/hide/coal продаёт Хольд, дедуп по
//     пути срабатывает (в отличие от .15, где свитки были новыми);
//   * торговля — ассортимент постройки 5 («вьюки, повозки, верёвки,
//     факелы») НЕ резолвится в предметы напрямую (ни одного такого
//     предмета на диске) — резолв «что продаёт Хольд» (ТЗ), из его
//     стока взято: 000035 wood_log (вьючная доска/вьюки), 000037
//     hide (кожа на верёвки и сбрую), 000038 coal (уголь на факелы);
//     формат 000322: цены в JSON предмета, base_price у всех есть
//     (миграция 000322; OLD_PRICES содержит wanderer_merchant) ⇒
//     assets/items НЕ трогаются; mult_продажи РОВНО 0.5 и НЕ ВЫШЕ
//     per-item множителя Хольда (0.667/0.6/0.5 — «тон хозяина
//     дома», прецеденты .11/.15); количество 1, mult_покупки при 1 —
//     ключа НЕТ;
//   * опций с «для» — РОВНО 0: контракт A8a (tests/npc-dialog-scope)
//     — динамический свип ждёт 0 «для» у всех, кроме Берты/Элдиры/
//     Корда; добавление «для» = ослабление пина, запрещено (мутация
//     M1);
//   * тема диалога — караван/вьюк/дорожная торговля; «караван»,
//     «дорог», «торгов» НЕ банятся — категории своего дома (правило
//     «брон» .09); к СВОЕМУ хуку запрет-лист не применяется;
//     запрет-лист ТЕКСТОВ диалога 52 = дисковый список .17 T5 (43) +
//     4 подстроки, покрывающие ВСЕ 3 СЪЕДЕННЫХ оборота Грифеля
//     (резерв memory/000320-scribe.md для .18+: «описк»/«чистовик» —
//     «в чистовик не уйдёт ни одной описки», «по концу листа» —
//     «сверяй по началу и по концу листа», «копию без торгу» —
//     «отдаю копию без торгу»; прецедент .17: резервные обороты
//     вносятся в список) + доп. охрана «вкривь» (строка диалога
//     Грифеля 000035.json, НЕ из резерва) + СВОИ 4 оборота Хольда
//     (сосед и хозяин дома 5 — его диалог не цитируем): «кормит»,
//     «от кузницы до кузницы», «не пожалеешь», «пока повозка
//     полная»; СВОИ обороты, резерв для .19+: «на дневку», «сколько
//     сгрузил», «ближе к холке» (memory/000320-wanderer_trader.md);
//   * [E]-оверлей Лавки странника — РОВНО ДВЕ dialog-строки в
//     порядке каталога: 'dialog' (Хольд) → 'dialog:wanderer_trader'
//     (Хомут); хоткеи Digit1..2 — общий механизм src/building-ui.js
//     /^Digit([1-9])$/ по индексу строки. ПРЕЖНИХ пинов ростера/
//     оверлея дома 5 в tests/ не было — закреплено здесь; РЕ-ПИН
//     000320.19: ТРЕТИЙ NPC дома 5 (spice_trader «Шафран», 000037)
//     поднял оверлей до ТРЁХ — T7/T8 заре-пинуты вместе с
//     tests/npc-000320.19.test.js; ЧЕТВЁРТЫЙ поднимет до 4
//     (прецеденты .12–.17 для дома 4).
//
// КРАСНЫЕ (TDD): T1..T8 красные до зелёной стадии (000036.json нет,
// каталог 35, ростер дома 5 — ОДИН NPC, оверлей 1 строка), без краха
// загрузки.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validateData } = require('./json-schema.js');

const ROOT = path.join(__dirname, '..');
const NDIR = path.join(ROOT, 'assets', 'npc');
const NEW = path.join(NDIR, '000036.json');
const HOLD = path.join(NDIR, '000011.json');
const SCHEMA = JSON.parse(
  fs.readFileSync(path.join(NDIR, 'schema.json'), 'utf8'));

const N = require('../src/npc.js');
const { NPCS } = require('../src/npc-data.js');
const BE = require('../src/building-effects.js');

const HOOK = 'Приходит с караваном, уходит с караваном — стоит только на торговле';
const ID = 'wanderer_trader';
const NAME = 'Хомут';

function listNpcFiles() {
  return fs.readdirSync(NDIR)
    .filter((f) => /^\d{6}\.json$/.test(f))
    .sort();
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// --- T1: размер каталога ---------------------------------------------------

test('T1: каталог — ровно 38 файла 000001..000038 подряд; зеркало NPCS 38 записей с wanderer_trader', () => {
  const files = listNpcFiles();
  assert.equal(files.length, 38,
    'в каталоге NPC 38 файла (000320.15: +Торговец свитками; 000320.16: '
    + '+Маг-наставник; 000320.17: +Переписчик; 000320.18: +Странствующий '
    + 'торговец; 000320.19: +Торговец специями; 000320.20: +Торговец каравана), факт: ' + files.length);
  for (let i = 0; i < files.length; i++) {
    assert.equal(files[i],
      String(i + 1).padStart(6, '0') + '.json',
      'нумерация подряд без пропусков: индекс ' + i);
  }
  assert.equal(NPCS.length, 38,
    'зеркало src/npc-data.js — 38 записей (sync не прогнан?), факт: '
    + NPCS.length);
  const last = NPCS[35];
  assert.ok(last, '36-я запись зеркала существует');
  assert.equal(last.id, ID,
    '36-я запись зеркала — wanderer_trader (порядок = нумерация файлов)');
  assert.equal(NPCS[34].id, 'scribe',
    'guard: 35-я запись — Переписчик (позиционные NPCS[..] не сдвинуты)');
});

// --- T2: 000036.json валиден по схеме + порядок ключей + roundtrip ---------

test('T2: assets/npc/000036.json валиден по schema; ключи в порядке эталона ТОРГОВЛЯ .15 (id, имя, роль, описание, постройки, диалог, торговля); roundtrip-канон; негативы — мимо схемы и мимо порядка ключей', () => {
  assert.ok(fs.existsSync(NEW),
    'RED: assets/npc/000036.json отсутствует (NPC задачи ещё не создан)');
  const data = readJson(NEW);
  assert.deepEqual(validateData(SCHEMA, data, 'npc/000036'), [],
    '000036.json обязан проходить assets/npc/schema.json');
  assert.deepEqual(Object.keys(data),
    ['id', 'имя', 'роль', 'описание', 'постройки', 'диалог', 'торговля'],
    'порядок ключей — как у эталона ТОРГОВЛЯ .15 (000033): id, имя, '
    + 'роль, описание, постройки, диалог, торговля — торговля ПОСЛЕ '
    + 'диалога, блоков обучение/квесты/найм нет');
  const raw = fs.readFileSync(NEW, 'utf8');
  assert.equal(raw, JSON.stringify(data, null, 2) + '\n',
    '000036.json — roundtrip JSON.stringify(obj,null,2)+перевод строки');
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
    предмет: 'assets/items/000035.json',
    цена_покупки: 6, цена_продажи: 3, количество: 1,
  };
  assert.notDeepEqual(validateData(SCHEMA, legacyEntry, 'npc/legacy'), [],
    'legacy-вход торговли (цена_покупки/цена_продажи) — невалиден (000322)');
});

// --- T3: id и имя уникальны (sweep) ----------------------------------------

test('T3: id wanderer_trader и имя «Хомут» уникальны в sweep каталога', () => {
  assert.ok(fs.existsSync(NEW), 'RED: assets/npc/000036.json отсутствует');
  const ids = new Set();
  const names = new Set();
  for (const f of listNpcFiles()) {
    const d = readJson(path.join(NDIR, f));
    assert.ok(!ids.has(d.id), 'дубликат id «' + d.id + '» (файл ' + f + ')');
    assert.ok(!names.has(d.имя), 'дубликат имени «' + d.имя + '» (файл ' + f + ')');
    ids.add(d.id);
    names.add(d.имя);
  }
  assert.ok(ids.has(ID), 'id wanderer_trader в каталоге');
  assert.ok(names.has(NAME), 'имя «Хомут» в каталоге');
});

// --- T4: роль-фикс, описание с хуком и уникально ----------------------------

test('T4: роль РОВНО «странствующий торговец» (точная строка ТЗ; свипов уникальности ролей нет — строка уже есть у Хольда и Кочевника); описание непустое, хук «Приходит с караваном, уходит с караваном — стоит только на торговле» — последнее предложение, и НЕ копия описания другого NPC', () => {
  assert.ok(fs.existsSync(NEW), 'RED: assets/npc/000036.json отсутствует');
  const data = readJson(NEW);
  assert.ok(typeof data.описание === 'string' && data.описание.trim() !== '',
    'описание непустое');
  assert.equal(data.роль, 'странствующий торговец',
    'роль — фикс-строка «странствующий торговец» (ТЗ); Т4 пишет точное '
    + 'равенство (свипов уникальности ролей нет — прецедент «наставник» '
    + '.10/.13/.16)');
  assert.ok(data.описание.includes(HOOK),
    'хук истории «' + HOOK + '» (ТЗ) в описании дословно');
  assert.ok(data.описание.endsWith(HOOK + '.'),
    'хук — ПОСЛЕДНЕЕ предложение описания (с заглавной, с точкой на '
    + 'конце — прецеденты .02–.17); факт: '
    + JSON.stringify(data.описание.slice(-70)));
  for (const f of listNpcFiles()) {
    if (f === '000036.json') continue;
    const d = readJson(path.join(NDIR, f));
    assert.notEqual(d.описание, data.описание,
      'описание совпадает с ' + f + ' (не копия существующего)');
  }
});

// --- T5: диалог — профиль торговля, без «для» --------------------------------

test('T5: диалог валиден по схеме, РОВНО 3 опции как у эталона .15, ≥1 «торговля», действия ⊆ {подсказка, торговля}, ровно одна с {харизма:3}, id опций уникальны, опций с «для» — ровно 0, запрет-лист 52 подстрок (дисковые 43 из .17 + покрытие 3 резервных оборотов Грифеля + доп. «вкривь» + обороты Хольда) по ТЕКСТАМ диалога', () => {
  assert.ok(fs.existsSync(NEW), 'RED: assets/npc/000036.json отсутствует');
  const data = readJson(NEW);
  assert.ok(Array.isArray(data.диалог) && data.диалог.length >= 1,
    'диалог непустой (schema minItems 1)');
  assert.equal(data.диалог.length, 3,
    'диалог — ровно 3 опции (prives / торговля / hint — форма эталона '
    + 'ТОРГОВЛЯ .15 «Пергамент»), факт: ' + data.диалог.length);
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
    'опций с «для» — ровно 0: странствующий торговец говорит со всеми; '
    + 'добавление «для» требует ре-пина A8a (tests/npc-dialog-scope) '
    + 'и запрещено');
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
    'старые дела', 'храм солнц', 'старейшин', 'посмееш',
    'на весах', 'сонной мяты', 'клонит в сон',
    'завянет', 'пучками', 'почерневш', 'разотрёшь',
    'где болит', 'выше раны', 'доживают до старости',
    'не бывает лишнего', 'с далёких гор', 'договоримся о цене',
    'между строк', 'при дневном свете', 'чернила помнят',
    'прощает торопливому', 'из-под пальцев', 'выберем тебе школу',
    'описк', 'чистовик', 'по концу листа', 'копию без торгу', 'вкривь',
    'кормит', 'от кузницы до кузницы', 'не пожалеешь',
    'пока повозка полная']) {
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
      + 'школу»; обороты Грифеля (резерв memory/000320-scribe.md для '
      + '.18+: «описк»/«чистовик»/«по концу листа»/«копию без торгу») '
      + '+ доп. «вкривь» из строки его диалога; '
      + 'обороты Хольда (хозяин дома 5, его диалог не цитируем) — '
      + '«кормит»/«от кузницы до кузницы»/«не пожалеешь»/«пока '
      + 'повозка полная») не дублируется: подстрока «' + w + '»');
  }
});

// --- T6: профиль-гарант + торговля — 3 позиции из стока Хольда ---------------

test('T6: блоков квесты/обучение/найм НЕТ (ни в JSON, ни в зеркале), торговля ЕСТЬ там и там; РОВНО 3 входа (wood_log/hide/coal — резолв ассортимента постройки 5 через сток Хольда) с base_price в JSON предмета; mult ∈ (0,1], РОВНО 0.5 и НЕ выше per-item множителя Хольда; mult_покупки отсутствует; количество 1..99; зеркало: постройки [5], торговля резолвится в id, диалог/описание deepEqual', () => {
  assert.ok(fs.existsSync(NEW), 'RED: assets/npc/000036.json отсутствует');
  const data = readJson(NEW);
  for (const block of ['квесты', 'обучение', 'найм']) {
    assert.ok(!(block in data),
      'в JSON нет блока «' + block + '»: профиль торговля без квестов — '
      + 'счётчики npc-refs goal 2 / reward 5 не растут');
  }
  assert.ok(data.торговля && Array.isArray(data.торговля.предметы),
    'в JSON есть блок «торговля» с предметами (trade 67 → 70)');
  assert.deepEqual(Object.keys(data.торговля), ['предметы'],
    'блок торговли — единственный ключ «предметы» (формат 000322)');
  const items = data.торговля.предметы;
  assert.equal(items.length, 3,
    'витрина — ровно 3 позиции (форма эталона .15), факт: ' + items.length);
  const hold = readJson(HOLD);
  const holdPaths = new Set(hold.торговля.предметы.map((p) => p.предмет));
  const holdMult = {};
  for (const p of hold.торговля.предметы) holdMult[p.предмет] = p.mult_продажи;
  const mirror = NPCS[35];
  assert.ok(mirror && mirror.id === ID, 'зеркало: 36-я запись wanderer_trader');
  assert.equal(mirror.роль, 'странствующий торговец',
    'роль в зеркале — «странствующий торговец» (фикс ТЗ)');
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
      p.предмет + ': позиция ⊆ ассортимента дома 5 — резолв «вьюки/'
      + 'повозки/верёвки/факелы» через сток хозяина дома (таких '
      + 'предметов на диске нет; Хольд продаёт: '
      + JSON.stringify([...holdPaths]));
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
      p.предмет + ': множитель РОВНО 0.5 — тон дома 5 (все продажные '
      + 'множители Хольда ≥ 0.5; «второй NPC дома — в тон хозяину», '
      + 'прецеденты .11/.15), факт: ' + p.mult_продажи);
    assert.ok(p.mult_продажи <= holdMult[p.предмет],
      p.предмет + ': множитель НЕ ВЫШЕ per-item множителя Хольда ('
      + holdMult[p.предмет] + '), факт: ' + p.mult_продажи);
    assert.ok(!('mult_покупки' in p),
      p.предмет + ': mult_покупки при 1 — КЛЮЧ обязан ОТСУТСТВОВАТЬ (000322)');
    assert.ok(Number.isInteger(p.количество) && p.количество >= 1
      && p.количество <= 99,
      p.предмет + ': количество int 1..99, факт: ' + p.количество);
  });
  assert.deepEqual([...ids].sort(), ['coal', 'hide', 'wood_log'],
    'ассортимент — доска/кожа/уголь (вьюки, верёвки/сбруя, факелы — '
    + 'резолв ассортимента постройки 5 «что продаёт Хольд»); факт: '
    + JSON.stringify([...ids].sort()));
  assert.deepEqual(mirror.диалог, data.диалог,
    'зеркало NPCS[35].диалог ≡ JSON-диалог бит-в-бит');
  assert.deepEqual(mirror.описание, data.описание,
    'зеркало NPCS[35].описание ≡ JSON');
});

// --- T7: ростер дома 5 — ЧЕТЫРЕ записи, Хольд первый ----------------------------

test('T7: npcsForBuilding(NPCS, 5) — ЧЕТЫРЕ записи Лавки странника в порядке каталога [wanderer_merchant, wanderer_trader, spice_trader, caravan_trader]; npcForBuilding(5) — по-прежнему Хольд; Магазин магии — ЧЕТЫРЕ, Аптекарь — ПЯТЬ, Бронник — ТРИ и Оружейная — ДЕВЯТЬ не тронуты', () => {
  const list = N.npcsForBuilding(NPCS, 5);
  assert.deepEqual(list.map((n) => n.id),
    ['wanderer_merchant', ID, 'spice_trader', 'caravan_trader'],
    'Лавка странника (5): Хольд (000011) + Странствующий торговец '
    + '(000036) + Торговец специями (000037) + Торговец каравана (000038), порядок = нумерация '
    + 'файлов; факт: '
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

// --- T8: оверлей дома 5 — ровно 4 dialog-строки ------------------------------

test('T8: [E]-оверлей Лавки странника — ровно 4 строки: dialog (Хольд), dialog:wanderer_trader (Хомут), dialog:spice_trader (Шафран), dialog:caravan_trader (Барыш) — ре-пин 000320.20 (ТРИ→ЧЕТЫРЕ); хоткеи Digit1..4; ПЯТЫЙ NPC дома 5 (.21 по сводной таблице) поднимет оверлей до 5 и заре-пинит T7/T8 всех трёх файлов (.18/.19/.20) дальше', () => {
  const b = readJson(path.join(ROOT, 'assets', 'buildings', 'wanderer_shop.json'));
  const list = N.npcsForBuilding(NPCS, 5);
  const rows = BE.buildingActions(b, list, { day: 5 });
  assert.deepEqual(rows.map((r) => r.id),
    ['dialog', 'dialog:' + ID, 'dialog:spice_trader', 'dialog:caravan_trader'],
    'у здания 5 эффектов нет — список = dialog-строки по каждому NPC; '
    + 'факт: ' + JSON.stringify(rows.map((r) => r.id)));
  assert.deepEqual(rows.map((r) => r.имя),
    ['Диалог: Хольд', 'Диалог: ' + NAME, 'Диалог: Шафран', 'Диалог: Барыш'],
    'подписи — «Диалог: <имя>», факт: ' + JSON.stringify(rows.map((r) => r.имя)));
  assert.deepEqual(rows.map((r) => r.npcId),
    ['wanderer_merchant', ID, 'spice_trader', 'caravan_trader'],
    'каждая строка несёт npcId своего NPC (роутинг клика); хоткеи '
    + 'Digit1..4 — общий механизм /^Digit([1-9])$/ (src/building-ui.js) '
    + 'по индексу строки');
});

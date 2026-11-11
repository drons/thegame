// Задача 000320.13: «Тигель» (alchemy_instructor) — алхимик-наставник
// (Аптекарь, 4-й NPC постройки; 13-я из 100 дочерних 000320).
//
// Контракт (ТЗ tasks/done/000320.13.md; механизм мульти-NPC —
// 000320.01, spec/npc.md «Несколько NPC на постройку»,
// memory/000320-npcs-batch.md):
//   * assets/npc/000031.json — id alchemy_instructor (резерв ТЗ, sweep
//     по 30 занятым — свободен), имя «Тигель» (выбор агента: прозвище
//     по главному сосуду алхимика — сам варит в нём, отсюда и имя;
//     прецеденты не-личного имени 000018 «Кочевник», прозвища 000026
//     «Опилка», 000027 «Чекан», 000028 «Глыба», 000029 «Отвар», 000030
//     «Полынь»), роль «наставник» (фикс ТЗ; точная строка ЗАНЯТА
//     Глыбой .10 — легальный дубль: свипов уникальности ролей нет,
//     прецеденты .09 «торговец бронёй» vs Грота и .10; T4 пишет точное
//     равенство), постройка assets/buildings/apothecary.json (Аптекарь —
//     ЧЕТВЁРТЫЙ NPC: Мила ПЕРВАЯ, npcForBuilding(3) продолжает
//     возвращать Милу), хук истории «Учит алхимии у прилавка
//     аптекаря» (последнее предложение описания, с заглавной —
//     прецеденты .02–.12);
//   * профиль — ОБУЧЕНИЕ + ТОРГОВЛЯ ЧЕРТЕЖОМ (клон механики .10
//     golem_instructor, второй обучающий не-школы после Родара .02;
//     торговля — клон Торна 000006, наставника кузнечного дела):
//     4 опции (prives / train / trade / hint), действия ⊆
//     {подсказка, обучение, торговля} (≥1 «обучение», ≥1 «торговля»);
//     блок «обучение» формата assets/npc/000005.json: {навыки:[alchemy],
//     цена_за_уровень, цена_переноса_за_уровень} — коридор прецедента
//     наставника (Карк/Родар/Глыба 25/40); навык alchemy =
//     assets/skills/000025.json, type «secondary» — свип целостности
//     tests/npc-data.test «только вторичные навыки» зелёный;
//   * ТОРГОВЛЯ ОБЯЗАТЕЛЬНА КОНТРАКТОМ D5/«SRC-1» (задача 000232,
//     tests/craft-scroll-sources + memory/000232-craft-learned-kinds):
//     «наставник вида обязан продавать чертёж этого вида» —
//     canMentorCraft(Тигель, …, «алхимия») === ok (навык alchemy ↔
//     вид алхимия; Аптекарь 000003 ∈ здания рецептов алхимии), значит
//     витрина — blueprint_alchemy (assets/items/000078.json, base_price
//     120, mult_продажи 0.5 = тон Милы/Торна, количество 1,
//     mult_покупки — ключ отсутствует). ОТКЛОНЕНИЕ ОТ ТЕКСТА ТЗ
//     «блоков торговля нет»: ТЗ вычислялся без учёта SRC-1; без
//     витрины полный прогон красен (ловушка «наставник «алхимия»
//     продаёт blueprint_alchemy»). Глыба .10 не попала под D5: golem —
//     НЕ крафтовый навык; счётчики при этом ЧЕСТНО растут: npc-refs
//     торговля 63→64 / сумма 70→71, уникальные 41 БЕЗ (000078 уже
//     продаёт Мила — дедуп по пути), R7 торгующих 12→13, goal 2 /
//     reward 5 БЕЗ (блоков квесты/найм по-прежнему нет);
//   * опций с «для» — РОВНО 0: наставник учит каждого; контракт A8a
//     (tests/npc-dialog-scope) — динамический свип ждёт 0 «для» у всех,
//     кроме Берты/Элдиры/Корда; добавление «для» = ослабление пина,
//     запрещено (мутация M1);
//   * тема hint — алхимия/зелья у прилавка: ровный жар, перегон,
//     доза; темы брони-звонка (.09), големов (.10), ковки-хвостовика
//     (.06), коллекции (.05), старых походов/арены (.04), наёма/
//     жалованья (.07), метлы/стены клинков (.08) и тексты соседей по
//     дому (Мила, Отвар .11, Травница .12) НЕ дублируются дословно в
//     текстах диалога (запрет-лист — к ТЕКСТАМ диалога, НЕ к описанию:
//     собственный хук с «алхими/прилавк» иначе нарушил бы ассерт —
//     правило «брон» .09/.10; «алхим»/«прилавк»/«зель» не банятся —
//     категории своего дома);
//   * ОБУЧАЮЩИЙ В МАГАЗИНЕ — ЗАКОННО: прецеденты Родар .02 в Оружейной
//     и Глыба .10 на Броннике (категория «магазин», без «тренирует»);
//     здание НЕ тронето, «тренирует» НЕ добавлять;
//   * [E]-оверлей Аптекаря — РОВНО ЧЕТЫРЕ dialog-строки в порядке
//     каталога: 'dialog' (Мила) → 'dialog:brewer' (Отвар) →
//     'dialog:herbalist' (Полынь) → 'dialog:alchemy_instructor'
//     (Тигель); хоткеи Digit1..4 — общий механизм src/building-ui.js
//     /^Digit([1-9])$/ по индексу строки. Пин оверлея создан в .11,
//     ре-пин .12 (ТРИ), ре-пин .13 (ЧЕТЫРЕ); ростер Бронника (ТРИ) и
//     Оружейной (ДЕВЯТЬ) НЕ затрагивается.
//
// КРАСНЫЕ (TDD): T1..T8 красные до зелёной стадии (000031.json нет,
// каталог 30, ростер Аптекаря 3, оверлей 3 строки), без краха загрузки.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validateData } = require('./json-schema.js');

const ROOT = path.join(__dirname, '..');
const NDIR = path.join(ROOT, 'assets', 'npc');
const NEW = path.join(NDIR, '000031.json');
const SCHEMA = JSON.parse(
  fs.readFileSync(path.join(NDIR, 'schema.json'), 'utf8'));

const N = require('../src/npc.js');
const { NPCS } = require('../src/npc-data.js');
const BE = require('../src/building-effects.js');

const HOOK = 'Учит алхимии у прилавка аптекаря';
const ID = 'alchemy_instructor';
const NAME = 'Тигель';

function listNpcFiles() {
  return fs.readdirSync(NDIR)
    .filter((f) => /^\d{6}\.json$/.test(f))
    .sort();
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// --- T1: размер каталога ---------------------------------------------------

test('T1: каталог — ровно 34 файла 000001..000034 подряд; зеркало NPCS 34 записи с alchemy_instructor', () => {
  const files = listNpcFiles();
  assert.equal(files.length, 34,
    'в каталоге NPC 34 файла (000320.10: +Наставник-големовед; 000320.11: '
    + '+Торговец зельями; 000320.12: +Торговка травами; 000320.13: '
    + '+Алхимик-наставник; 000320.14: +Фельдшер; 000320.15: +Торговец свитками; 000320.16: +Маг-наставник), факт: ' + files.length);
  for (let i = 0; i < files.length; i++) {
    assert.equal(files[i],
      String(i + 1).padStart(6, '0') + '.json',
      'нумерация подряд без пропусков: индекс ' + i);
  }
  assert.equal(NPCS.length, 34,
    'зеркало src/npc-data.js — 34 записи (sync не прогнан?), факт: '
    + NPCS.length);
  const last = NPCS[30];
  assert.ok(last, '31-я запись зеркала существует');
  assert.equal(last.id, ID,
    '31-я запись зеркала — alchemy_instructor (порядок = нумерация файлов)');
});

// --- T2: 000031.json валиден по схеме + порядок ключей + roundtrip ---------

test('T2: assets/npc/000031.json валиден по schema; ключи в порядке Торна 000006 (обучение после диалога, торговля после обучения); roundtrip-канон; негативы — мимо схемы', () => {
  assert.ok(fs.existsSync(NEW),
    'RED: assets/npc/000031.json отсутствует (NPC задачи ещё не создан)');
  const data = readJson(NEW);
  assert.deepEqual(validateData(SCHEMA, data, 'npc/000031'), [],
    '000031.json обязан проходить assets/npc/schema.json');
  assert.deepEqual(Object.keys(data),
    ['id', 'имя', 'роль', 'описание', 'постройки', 'диалог', 'обучение',
      'торговля'],
    'порядок ключей — как у Торна 000006 (id, имя, роль, описание, '
    + 'постройки, диалог, обучение, торговля) — наставник-продавец');
  const raw = fs.readFileSync(NEW, 'utf8');
  assert.equal(raw, JSON.stringify(data, null, 2) + '\n',
    '000031.json — roundtrip JSON.stringify(obj,null,2)+перевод строки');
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
  badPath.постройки = ['000003.json'];
  assert.notDeepEqual(validateData(SCHEMA, badPath, 'npc/badpath'), [],
    'постройки без пути assets/buildings/ — вне паттерна схемы');
  const emptySkills = JSON.parse(JSON.stringify(data));
  emptySkills.обучение.навыки = [];
  assert.notDeepEqual(validateData(SCHEMA, emptySkills, 'npc/emptyskills'), [],
    'навыки [] — вне схемы (minItems 1)');
  const badSkillCase = JSON.parse(JSON.stringify(data));
  badSkillCase.обучение.навыки = ['Богус'];
  assert.notDeepEqual(validateData(SCHEMA, badSkillCase, 'npc/badskill'), [],
    'навык «Богус» — вне паттерна ^[a-z][a-z0-9_]*$');
  const badPrice = JSON.parse(JSON.stringify(data));
  badPrice.обучение.цена_за_уровень = 0;
  assert.notDeepEqual(validateData(SCHEMA, badPrice, 'npc/badprice'), [],
    'цена_за_уровень 0 — вне схемы (minimum 1)');
  const badTransfer = JSON.parse(JSON.stringify(data));
  badTransfer.обучение.цена_переноса_за_уровень = 0;
  assert.notDeepEqual(validateData(SCHEMA, badTransfer, 'npc/badtransfer'), [],
    'цена_переноса_за_уровень 0 — вне схемы (minimum 1)');
  const legacyEntry = JSON.parse(JSON.stringify(data));
  legacyEntry.торговля.предметы[0].цена_покупки = 60;
  legacyEntry.торговля.предметы[0].цена_продажи = 60;
  assert.notDeepEqual(validateData(SCHEMA, legacyEntry, 'npc/legacyentry'), [],
    'legacy-вход торговли цена_покупки/цена_продажи — вне схемы '
    + '(additionalProperties false, формат 000322)');
  const zeroQty = JSON.parse(JSON.stringify(data));
  zeroQty.торговля.предметы[0].количество = 0;
  assert.notDeepEqual(validateData(SCHEMA, zeroQty, 'npc/zeroqty'), [],
    'количество 0 — вне схемы (minimum 1; D5 — статичный сток ≥ 1)');
});

// --- T3: id и имя уникальны (sweep) ----------------------------------------

test('T3: id alchemy_instructor и имя «Тигель» уникальны в sweep каталога', () => {
  assert.ok(fs.existsSync(NEW), 'RED: assets/npc/000031.json отсутствует');
  const ids = new Set();
  const names = new Set();
  for (const f of listNpcFiles()) {
    const d = readJson(path.join(NDIR, f));
    assert.ok(!ids.has(d.id), 'дубликат id «' + d.id + '» (файл ' + f + ')');
    assert.ok(!names.has(d.имя), 'дубликат имени «' + d.имя + '» (файл ' + f + ')');
    ids.add(d.id);
    names.add(d.имя);
  }
  assert.ok(ids.has(ID), 'id alchemy_instructor в каталоге');
  assert.ok(names.has(NAME), 'имя «Тигель» в каталоге');
});

// --- T4: роль-фикс, описание с хуком и уникально ----------------------------

test('T4: роль РОВНО «наставник» (точная строка ТЗ; дубль с Глыбой .10 законен — свипов уникальности ролей нет); описание непустое, хук «Учит алхимии у прилавка аптекаря» — последнее предложение, и НЕ копия описания другого NPC', () => {
  assert.ok(fs.existsSync(NEW), 'RED: assets/npc/000031.json отсутствует');
  const data = readJson(NEW);
  assert.ok(typeof data.описание === 'string' && data.описание.trim() !== '',
    'описание непустое');
  assert.equal(data.роль, 'наставник',
    'роль — фикс-строка «наставник» (ТЗ); та же строка, что у Глыбы .10 — '
    + 'легальный дубль (уникальность ролей не контракт, прецедент .09 '
    + '«торговец бронёй» vs Грота); T4 пишет точное равенство');
  assert.ok(data.описание.includes(HOOK),
    'хук истории «' + HOOK + '» (ТЗ) в описании дословно');
  assert.ok(data.описание.endsWith(HOOK + '.'),
    'хук — ПОСЛЕДНЕЕ предложение описания (с заглавной, с точкой на конце — '
    + 'прецеденты .02–.12); факт: ' + JSON.stringify(data.описание.slice(-60)));
  for (const f of listNpcFiles()) {
    if (f === '000031.json') continue;
    const d = readJson(path.join(NDIR, f));
    assert.notEqual(d.описание, data.описание,
      'описание совпадает с ' + f + ' (не копия существующего)');
  }
});

// --- T5: диалог — профиль обучение, без «для» --------------------------------

test('T5: диалог валиден по схеме, РОВНО 4 опции, ≥1 опция «обучение», ≥1 «торговля» (витрина чертежа — D5/SRC-1), действия ⊆ {подсказка, обучение, торговля}, ровно одна с {харизма:3}, id опций уникальны, опций с «для» — ровно 0, темы .04–.10 и тексты Милы/Отвара/Травницы не дублируются', () => {
  assert.ok(fs.existsSync(NEW), 'RED: assets/npc/000031.json отсутствует');
  const data = readJson(NEW);
  assert.ok(Array.isArray(data.диалог) && data.диалог.length >= 1,
    'диалог непустой (schema minItems 1)');
  assert.equal(data.диалог.length, 4,
    'диалог — ровно 4 опции (prives / обучение / торговля / hint — '
    + 'конвенция Торна 000006: наставник крафта ещё и продавец чертежа), '
    + 'факт: ' + data.диалог.length);
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
  assert.ok(data.диалог.some((o) => o.действие === 'торговля'),
    'опция «торговля» есть: витрина чертежа алхимии обязательна '
    + 'контрактом D5/SRC-1 (наставник вида продаёт чертёж), без неё '
    + 'витрина была бы недостижима из диалога');
  assert.equal(
    data.диалог.filter((o) => o.действие !== 'подсказка'
      && o.действие !== 'обучение'
      && o.действие !== 'торговля').length, 0,
    'профиль ОБУЧЕНИЕ+ТОРГОВЛЯ (без квестов/найма): опций с действием '
    + 'вне {подсказка, обучение, торговля} — ровно 0');
  const ids = data.диалог.map((o) => o.id);
  assert.equal(new Set(ids).size, ids.length, 'id опций диалога уникальны');
  assert.equal(data.диалог.filter((o) => o.для !== undefined).length, 0,
    'опций с «для» — ровно 0: наставник учит каждого; добавление «для» '
    + 'требует ре-пина A8a (tests/npc-dialog-scope) и запрещено');
  const withReq = data.диалог.filter((o) => o.требования !== undefined);
  assert.equal(withReq.length, 1,
    'ровно одна опция с требованиями (прецедент hint_wood/hint_old/hint_blade/hint_collection/hint_anvil/hint_march/hint_ring/hint_weight/hint_dry/hint_stone)');
  assert.deepEqual(withReq[0].требования, { харизма: 3 },
    'требование опции — {харизма: 3}');
  const texts = data.диалог.map((o) => o.текст).join(' ');
  for (const w of ['хвостовик', 'наковальн', 'штампов', 'коллекци', 'позолот',
    'старые походы', 'арен', 'жалован', 'знамен', 'задаток', 'табель',
    'метл', 'стена клинков', 'звон', 'дребезг', 'нагрудник', 'закалк',
    'трещин', 'молотк', 'примеря',
    'старые дела', 'храм солнц', 'старейшин', 'посмееш',
    'на весах', 'сонной мяты', 'клонит в сон',
    'завянет', 'пучками', 'почерневш', 'разотрёшь']) {
    assert.ok(!texts.includes(w),
      'тема чужого NPC (.04 «старые походы»/арена, .05 коллекция, .06 ковка/'
      + 'хвостовик, .07 наём/жалованье, .08 метла/стена клинков, .09 '
      + 'броня-звонок, .10 големы; тексты Милы — «старые дела»/«храм '
      + 'солнца»/«старейшина»/«посмеешь»; тексты Отвара — «на весах»/'
      + '«сонной мяты»/«клонит в сон»; тексты Травницы — «завянет»/'
      + '«пучками»/«почерневш»/«разотрёшь») не дублируется: подстрока «'
      + w + '»');
  }
});

// --- T6: блок обучения — форма 000005, alchemy ∈ assets/skills, зеркало -----

test('T6: блок «обучение» — форма 000005 (ключи навыки/цена_за_уровень/цена_переноса_за_уровень), навыки РОВНО [alchemy] и резолвится в assets/skills (secondary), цены целые > 0; блок «торговля» — РОВНО blueprint_alchemy (D5/SRC-1: наставник вида продаёт чертёж; base_price 120, mult ≤ Милы, mult_покупки нет, количество ≥ 1); блоков квесты/найм НЕТ (в JSON и зеркале); зеркало: постройки [3], обучение ≡ JSON, торговля резолвится в id', () => {
  assert.ok(fs.existsSync(NEW), 'RED: assets/npc/000031.json отсутствует');
  const data = readJson(NEW);
  const train = data.обучение;
  assert.ok(train && typeof train === 'object',
    'в JSON есть блок «обучение» (профиль обучения)');
  assert.deepEqual(Object.keys(train),
    ['навыки', 'цена_за_уровень', 'цена_переноса_за_уровень'],
    'ключи блока обучения — порядок и состав 000005 (Карк)');
  assert.deepEqual(train.навыки, ['alchemy'],
    'навыки — РОВНО [alchemy] (ТЗ); факт: '
    + JSON.stringify(train.навыки));
  const skillDir = path.join(ROOT, 'assets', 'skills');
  const alchemyFiles = fs.readdirSync(skillDir)
    .filter((f) => /^\d{6}\.json$/.test(f))
    .filter((f) => readJson(path.join(skillDir, f)).id === 'alchemy');
  assert.equal(alchemyFiles.length, 1,
    'навык alchemy существует в assets/skills ровно одним файлом');
  assert.equal(readJson(path.join(skillDir, alchemyFiles[0])).type,
    'secondary',
    'alchemy — вторичный навык (свип целостности tests/npc-data.test '
    + '«только вторичные навыки»)');
  for (const key of ['цена_за_уровень', 'цена_переноса_за_уровень']) {
    assert.ok(Number.isInteger(train[key]) && train[key] > 0,
      key + ' — целое > 0 (схема 1..10000), факт: ' + train[key]);
  }
  for (const block of ['квесты', 'найм']) {
    assert.ok(!(block in data),
      'в JSON нет блока «' + block + '»: goal 2 / reward 5 не растут; '
      + 'торговля ЕСТЬ по контракту D5/SRC-1 (см. ниже) — счётчики '
      + 'npc-refs торговля 63→64 / сумма 70→71 честные');
  }
  const trade = data.торговля;
  assert.ok(trade && Array.isArray(trade.предметы),
    'в JSON есть блок «торговля» с предметами: D5/SRC-1 (000232) — '
    + 'наставник вида обязан продавать чертёж этого вида; '
    + 'canMentorCraft(Тигель, …, «алхимия») === ok');
  assert.deepEqual(Object.keys(trade), ['предметы'],
    'торговля — только ключ «предметы» (формат 000322)');
  assert.equal(trade.предметы.length, 1,
    'витрина — РОВНО 1 позиция (чертёж алхимии; торговцем зелий Тигель '
    + 'не делает — ассортимент Милы/Отвара/Полыни не дублирует), факт: '
    + trade.предметы.length);
  const bp = trade.предметы[0];
  assert.equal(bp.предмет, 'assets/items/000078.json',
    'витрина — blueprint_alchemy (000078) — чертёж вида «алхимия»');
  const bpItem = readJson(path.join(ROOT, bp.предмет));
  assert.equal(bpItem.id, 'blueprint_alchemy',
    'цель ссылки — blueprint_alchemy');
  assert.equal(bpItem.base_price, 120,
    'base_price чертежа — 120 (пин SRC-1/000322)');
  assert.ok(bp.mult_продажи > 0 && bp.mult_продажи <= 1,
    'mult_продажи ∈ (0,1]: ' + bp.mult_продажи);
  const mila = readJson(path.join(NDIR, '000003.json'));
  const milaMult = mila.торговля.предметы
    .find((e) => e.предмет === bp.предмет).mult_продажи;
  assert.ok(bp.mult_продажи <= milaMult,
    'mult_продажи НЕ ВЫШЕ купецкого Милы (' + milaMult
    + ') — «наставник в тон аптекарю» (прецедент .11/.12), факт: '
    + bp.mult_продажи);
  assert.ok(!('mult_покупки' in bp),
    'mult_покупки при 1 — КЛЮЧ обязан ОТСУТСТВОВАТЬ (000322)');
  assert.ok(Number.isInteger(bp.количество) && bp.количество >= 1
    && bp.количество <= 99,
    'количество int 1..99 (D5 — статичный сток ≥ 1), факт: '
    + bp.количество);
  const mirror = NPCS[30];
  assert.ok(mirror && mirror.id === ID,
    'зеркало: 31-я запись alchemy_instructor');
  assert.equal(mirror.роль, 'наставник',
    'роль в зеркале — «наставник» (фикс ТЗ)');
  for (const block of ['квесты', 'найм']) {
    assert.ok(!(block in mirror),
      'в зеркале нет блока «' + block + '» (следует из JSON)');
  }
  assert.ok(mirror.торговля && Array.isArray(mirror.торговля.предметы),
    'в зеркале есть блок «торговля» (следует из JSON)');
  assert.equal(mirror.торговля.предметы[0].предмет, 'blueprint_alchemy',
    'зеркало резолвит путь чертежа в id: blueprint_alchemy');
  assert.deepEqual(
    { mult_продажи: mirror.торговля.предметы[0].mult_продажи,
      количество: mirror.торговля.предметы[0].количество },
    { mult_продажи: bp.mult_продажи, количество: bp.количество },
    'зеркало: множитель/сток ≡ JSON');
  assert.deepEqual(mirror.обучение, train,
    'зеркало: блок обучения — ПАСС-ЧЕРЕЗ ≡ JSON (навыки уже id-строки, '
    + 'sync не резолвит)');
  assert.deepEqual(mirror.постройки, [3],
    'зеркало: постройки [3] — sync резолвит ссылку Аптекаря в id');
  assert.deepEqual(mirror.диалог, data.диалог,
    'зеркало NPCS[30].диалог ≡ JSON-диалог бит-в-бит');
  assert.deepEqual(mirror.описание, data.описание,
    'зеркало NPCS[30].описание ≡ JSON');
});

// --- T7: ростер Аптекаря — ПЯТЬ записей, Мила первая -------------------------

test('T7: npcsForBuilding(NPCS, 3) — ПЯТЬ записей Аптекаря в порядке каталога [apothecary, brewer, herbalist, alchemy_instructor, village_doctor] (ре-пин 000320.14); npcForBuilding(3) — по-прежнему Мила; Бронник — ТРИ и Оружейная — ДЕВЯТЬ не тронуты', () => {
  const list = N.npcsForBuilding(NPCS, 3);
  assert.deepEqual(list.map((n) => n.id),
    ['apothecary', 'brewer', 'herbalist', ID, 'village_doctor'],
    'Аптекарь (3): Мила (000003) + Зельевар (000029) + Травница '
    + '(000030) + Алхимик-наставник (000031) + Фельдшер (000032, '
    + '000320.14), порядок = нумерация файлов; факт: '
    + JSON.stringify(list.map((n) => n.id)));
  assert.equal(N.npcForBuilding(NPCS, 3).id, 'apothecary',
    'npcForBuilding — ПЕРВЫЙ по номеру файла (Мила; HUD/«Здесь:» не тронуты)');
  const brunnik = N.npcsForBuilding(NPCS, 2);
  assert.deepEqual(brunnik.map((n) => n.id),
    ['armor_merchant', 'armor_specialist', 'golem_instructor'],
    'Бронник (2) — ТРИ NPC не тронуты (новый NPC — Аптекарь): '
    + JSON.stringify(brunnik.map((n) => n.id)));
  const armory = N.npcsForBuilding(NPCS, 1);
  assert.deepEqual(armory.map((n) => n.id),
    ['weapons_merchant', 'blade_merchant', 'fencing_instructor',
      'duelist', 'veteran_blade', 'sword_collector', 'blade_smith',
      'ex_mercenary', 'armory_apprentice'],
    'Оружейная (1) — ДЕВЯТЬ NPC не тронута: '
    + JSON.stringify(armory.map((n) => n.id)));
});

// --- T8: оверлей Аптекаря — ровно 5 dialog-строк ------------------------------

test('T8: [E]-оверлей Аптекаря — ровно 5 строк: dialog (Мила), dialog:brewer (Отвар), dialog:herbalist (Полынь), dialog:alchemy_instructor (Тигель), dialog:village_doctor (Жгут) — ре-пин 000320.14 (было 4 в .13)', () => {
  const b = readJson(path.join(ROOT, 'assets', 'buildings', 'apothecary.json'));
  const list = N.npcsForBuilding(NPCS, 3);
  const rows = BE.buildingActions(b, list, { day: 5 });
  assert.deepEqual(rows.map((r) => r.id),
    ['dialog', 'dialog:brewer', 'dialog:herbalist', 'dialog:' + ID,
      'dialog:village_doctor'],
    'у здания 3 эффектов нет — список = dialog-строки по каждому NPC; '
    + 'ре-пин при появлении шестого NPC Аптекаря; '
    + 'факт: ' + JSON.stringify(rows.map((r) => r.id)));
  assert.deepEqual(rows.map((r) => r.имя),
    ['Диалог: Мила', 'Диалог: Отвар', 'Диалог: Полынь',
      'Диалог: ' + NAME, 'Диалог: Жгут'],
    'подписи — «Диалог: <имя>», факт: ' + JSON.stringify(rows.map((r) => r.имя)));
  assert.deepEqual(rows.map((r) => r.npcId),
    ['apothecary', 'brewer', 'herbalist', ID, 'village_doctor'],
    'каждая строка несёт npcId своего NPC (роутинг клика); хоткеи '
    + 'Digit1..5 — общий механизм /^Digit([1-9])$/ (src/building-ui.js) '
    + 'по индексу строки');
});

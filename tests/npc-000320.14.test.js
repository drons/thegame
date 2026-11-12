// Задача 000320.14: «Жгут» (village_doctor) — фельдшер (Аптекарь,
// 5-й NPC постройки; 14-я из 100 дочерних 000320).
//
// Контракт (ТЗ tasks/done/000320.14.md; механизм мульти-NPC —
// 000320.01, spec/npc.md «Несколько NPC на постройку»,
// memory/000320-npcs-batch.md):
//   * assets/npc/000032.json — id village_doctor (резерв ТЗ, sweep
//     по 31 занятому — свободен), имя «Жгут» (выбор агента: прозвище
//     по инструменту остановки крови — первым делом в сумке фельдшера,
//     отсюда и имя; прецеденты не-личного имени 000018 «Кочевник»,
//     прозвища 000026 «Опилка», 000027 «Чекан», 000028 «Глыба», 000029
//     «Отвар», 000030 «Полынь», 000031 «Тигель»), роль «фельдшер»
//     (фикс ТЗ; строка НОВА в каталоге — свипов уникальности ролей
//     нет, Т4 пишет точное равенство), постройка
//     assets/buildings/apothecary.json (Аптекарь — ПЯТЫЙ NPC: Мила
//     ПЕРВАЯ, npcForBuilding(3) продолжает возвращать Милу), хук
//     истории «Видел все раны арены; о здоровье говорит трезво»
//     (последнее предложение описания, с заглавной — прецеденты
//     .02–.13);
//   * профиль — ЧИСТАЯ подсказка (клон механики .08 «Опилка»): РОВНО
//     3 опции, ВСЕ действием «подсказка» (prives / hint_bleed /
//     hint_health), ровно одна с {харизма:3} (прецедент
//     hint_wood/hint_tools/hint_wall/.../hint_fire — НЕ «проверка»:
//     харизма-прецедент батча); блоков квесты/торговля/обучение/найм
//     НЕТ — счётчики npc-refs goal 2 / reward 5 / торговля 64 / сумма
//     71 / уникальные предметы 41 и R7=13 (tests/item-prices-000322)
//     от этого НЕ растут — ЭТО часть контракта (пин T6; невидимость
//     свипам — все они пропускают неторговцев `if (!npc.торговля)
//     continue`);
//   * опций с «для» — РОВНО 0: фельдшер говорит со всеми; контракт A8a
//     (tests/npc-dialog-scope) — динамический свип ждёт 0 «для» у всех,
//     кроме Берты/Элдиры/Корда; добавление «для» = ослабление пина,
//     запрещено (мутация M1);
//   * тема hint — раны/здоровье/трезвые слова о лечении; слово
//     «арен*» в ТЕКСТАХ диалога НЕ используется (подстрока «арен» — в
//     запрет-листе с .04: арена — чужая территория; исключение —
//     собственный хук в ОПИСАНИИ, правило «брон» .09/.10: запрет-лист
//     применяется к текстам диалога, не к описанию); темы чужих NPC и
//     тексты соседей по дому (Мила, Отвар .11, Травница .12, Тигель
//     .13) НЕ дублируются дословно; «ран»/«здоров»/«леч»/«трезв» —
//     своя тема, не банятся;
//   * [E]-оверлей Аптекаря — РОВНО ПЯТЬ dialog-строк в порядке
//     каталога: 'dialog' (Мила) → 'dialog:brewer' (Отвар) →
//     'dialog:herbalist' (Полынь) → 'dialog:alchemy_instructor'
//     (Тигель) → 'dialog:village_doctor' (Жгут); хоткеи Digit1..5 —
//     общий механизм src/building-ui.js /^Digit([1-9])$/ по индексу
//     строки. Пин оверлея создан в .11, ре-пины .12 (ТРИ), .13
//     (ЧЕТЫРЕ), .14 (ПЯТЬ); ростер Бронника (ТРИ) и Оружейной (ДЕВЯТЬ)
//     НЕ затрагивается; шестой NPC этого дома поднимет оверлей до 6.
//
// КРАСНЫЕ (TDD): T1..T8 красные до зелёной стадии (000032.json нет,
// каталог 31, ростер Аптекаря 4, оверлей 4 строки), без краха загрузки.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validateData } = require('./json-schema.js');

const ROOT = path.join(__dirname, '..');
const NDIR = path.join(ROOT, 'assets', 'npc');
const NEW = path.join(NDIR, '000032.json');
const SCHEMA = JSON.parse(
  fs.readFileSync(path.join(NDIR, 'schema.json'), 'utf8'));

const N = require('../src/npc.js');
const { NPCS } = require('../src/npc-data.js');
const BE = require('../src/building-effects.js');

const HOOK = 'Видел все раны арены; о здоровье говорит трезво';
const ID = 'village_doctor';
const NAME = 'Жгут';

function listNpcFiles() {
  return fs.readdirSync(NDIR)
    .filter((f) => /^\d{6}\.json$/.test(f))
    .sort();
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// --- T1: размер каталога ---------------------------------------------------

test('T1: каталог — ровно 41 файла 000001..000041 подряд; зеркало NPCS 41 записей с village_doctor', () => {
  const files = listNpcFiles();
  assert.equal(files.length, 41,
    'в каталоге NPC 41 файла (000320.11: +Торговец зельями; 000320.12: '
    + '+Торговка травами; 000320.13: +Алхимик-наставник; 000320.14: '
    + '+Фельдшер; 000320.15: +Торговец свитками; 000320.16: +Маг-наставник; 000320.17: +Переписчик; 000320.18: +Странствующий торговец; 000320.19: +Торговец специями; 000320.20: +Торговец каравана; 000347.02: +жрец солнца, жрица луны, горный жрец), факт: ' + files.length);
  for (let i = 0; i < files.length; i++) {
    assert.equal(files[i],
      String(i + 1).padStart(6, '0') + '.json',
      'нумерация подряд без пропусков: индекс ' + i);
  }
  assert.equal(NPCS.length, 41,
    'зеркало src/npc-data.js — 41 записей (sync не прогнан?), факт: '
    + NPCS.length);
  const last = NPCS[31];
  assert.ok(last, '32-я запись зеркала существует');
  assert.equal(last.id, ID,
    '32-я запись зеркала — village_doctor (порядок = нумерация файлов)');
});

// --- T2: 000032.json валиден по схеме + порядок ключей + roundtrip ---------

test('T2: assets/npc/000032.json валиден по schema; ключи в порядке образца .08 (id, имя, роль, описание, постройки, диалог — без блоков); roundtrip-канон; негативы — мимо схемы', () => {
  assert.ok(fs.existsSync(NEW),
    'RED: assets/npc/000032.json отсутствует (NPC задачи ещё не создан)');
  const data = readJson(NEW);
  assert.deepEqual(validateData(SCHEMA, data, 'npc/000032'), [],
    '000032.json обязан проходить assets/npc/schema.json');
  assert.deepEqual(Object.keys(data),
    ['id', 'имя', 'роль', 'описание', 'постройки', 'диалог'],
    'порядок ключей — как у образца чистой подсказки .08 (000026): '
    + 'id, имя, роль, описание, постройки, диалог — без блоков '
    + 'торговля/обучение/квесты/найм');
  const raw = fs.readFileSync(NEW, 'utf8');
  assert.equal(raw, JSON.stringify(data, null, 2) + '\n',
    '000032.json — roundtrip JSON.stringify(obj,null,2)+перевод строки');
  const extraKey = JSON.parse(JSON.stringify(data));
  extraKey.цена = 10;
  assert.notDeepEqual(validateData(SCHEMA, extraKey, 'npc/extra'), [],
    'посторонний ключ «цена» — additionalProperties false, обязан отваливаться');
  const badCharisma = JSON.parse(JSON.stringify(data));
  const reqOpt = badCharisma.диалог.find((o) => o.требования);
  assert.ok(reqOpt, 'есть опция с требованиями (прецедент hint_wall .08)');
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
  const zeroQty = JSON.parse(JSON.stringify(data));
  zeroQty.торговля = { предметы: [{ предмет: 'assets/items/000012.json',
    mult_продажи: 0.5, количество: 0 }] };
  assert.notDeepEqual(validateData(SCHEMA, zeroQty, 'npc/zeroqty'), [],
    'количество 0 (фиктивная торговля) — вне схемы (minimum 1)');
  const legacyEntry = JSON.parse(JSON.stringify(data));
  legacyEntry.торговля = { предметы: [{ предмет: 'assets/items/000012.json',
    mult_продажи: 0.5, количество: 1, цена_покупки: 10, цена_продажи: 5 }] };
  assert.notDeepEqual(validateData(SCHEMA, legacyEntry, 'npc/legacyentry'), [],
    'legacy-вход торговли цена_покупки/цена_продажи — вне схемы '
    + '(additionalProperties false, формат 000322)');
});

// --- T3: id и имя уникальны (sweep) ----------------------------------------

test('T3: id village_doctor и имя «Жгут» уникальны в sweep каталога', () => {
  assert.ok(fs.existsSync(NEW), 'RED: assets/npc/000032.json отсутствует');
  const ids = new Set();
  const names = new Set();
  for (const f of listNpcFiles()) {
    const d = readJson(path.join(NDIR, f));
    assert.ok(!ids.has(d.id), 'дубликат id «' + d.id + '» (файл ' + f + ')');
    assert.ok(!names.has(d.имя), 'дубликат имени «' + d.имя + '» (файл ' + f + ')');
    ids.add(d.id);
    names.add(d.имя);
  }
  assert.ok(ids.has(ID), 'id village_doctor в каталоге');
  assert.ok(names.has(NAME), 'имя «Жгут» в каталоге');
});

// --- T4: роль-фикс, описание с хуком и уникально ----------------------------

test('T4: роль РОВНО «фельдшер» (точная строка ТЗ; свипов уникальности ролей нет); описание непустое, хук «Видел все раны арены; о здоровье говорит трезво» — последнее предложение, и НЕ копия описания другого NPC', () => {
  assert.ok(fs.existsSync(NEW), 'RED: assets/npc/000032.json отсутствует');
  const data = readJson(NEW);
  assert.ok(typeof data.описание === 'string' && data.описание.trim() !== '',
    'описание непустое');
  assert.equal(data.роль, 'фельдшер',
    'роль — фикс-строка «фельдшер» (ТЗ); Т4 пишет точное равенство');
  assert.ok(data.описание.includes(HOOK),
    'хук истории «' + HOOK + '» (ТЗ) в описании дословно');
  assert.ok(data.описание.endsWith(HOOK + '.'),
    'хук — ПОСЛЕДНЕЕ предложение описания (с заглавной, с точкой на конце — '
    + 'прецеденты .02–.13); факт: ' + JSON.stringify(data.описание.slice(-70)));
  for (const f of listNpcFiles()) {
    if (f === '000032.json') continue;
    const d = readJson(path.join(NDIR, f));
    assert.notEqual(d.описание, data.описание,
      'описание совпадает с ' + f + ' (не копия существующего)');
  }
});

// --- T5: диалог — профиль чистая подсказка, без «для» ------------------------

test('T5: диалог валиден по схеме, РОВНО 3 опции как у эталона .08, ВСЕ «подсказка», ровно одна с {харизма:3}, id опций уникальны, опций с «для» — ровно 0, запрет-лист .04–.13 (31 подстрока, включая «арен») по ТЕКСТАМ диалога', () => {
  assert.ok(fs.existsSync(NEW), 'RED: assets/npc/000032.json отсутствует');
  const data = readJson(NEW);
  assert.ok(Array.isArray(data.диалог) && data.диалог.length >= 1,
    'диалог непустой (schema minItems 1)');
  assert.equal(data.диалог.length, 3,
    'диалог — ровно 3 опции (prives / hint_bleed / hint_health — форма '
    + 'эталона чистой подсказки .08 «Опилка»), факт: ' + data.диалог.length);
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
    'профиль ЧИСТАЯ подсказка (клон .08): опций с действием вне '
    + '«подсказка» — ровно 0');
  const ids = data.диалог.map((o) => o.id);
  assert.equal(new Set(ids).size, ids.length, 'id опций диалога уникальны');
  assert.equal(data.диалог.filter((o) => o.для !== undefined).length, 0,
    'опций с «для» — ровно 0: фельдшер говорит со всеми; добавление «для» '
    + 'требует ре-пина A8a (tests/npc-dialog-scope) и запрещено');
  const withReq = data.диалог.filter((o) => o.требования !== undefined);
  assert.equal(withReq.length, 1,
    'ровно одна опция с требованиями (прецедент hint_wood/hint_tools/'
    + 'hint_wall/hint_anvil/hint_ring/hint_weight/hint_dry/hint_stone/'
    + 'hint_fire)');
  assert.deepEqual(withReq[0].требования, { харизма: 3 },
    'требование опции — {харизма: 3} (харизма-прецедент батча, НЕ «проверка»)');
  const texts = data.диалог.map((o) => o.текст).join(' ');
  for (const w of ['хвостовик', 'наковальн', 'штампов', 'коллекци', 'позолот',
    'старые походы', 'арен', 'жалован', 'знамен', 'задаток', 'табель',
    'метл', 'стена клинков', 'звон', 'дребезг', 'нагрудник', 'закалк',
    'трещин', 'молотк', 'примеря',
    'старые дела', 'храме солнца', 'старейшин', 'посмееш',
    'на весах', 'сонной мяты', 'клонит в сон',
    'завянет', 'пучками', 'почерневш', 'разотрёшь']) {
    assert.ok(!texts.includes(w),
      'тема чужого NPC (.04 «старые походы»/арена — «арен», .05 коллекция, '
      + '.06 ковка/хвостовик, .07 наём/жалованье, .08 метла/стена клинков, '
      + '.09 броня-звонок, .10 големы; тексты Милы — «старые дела»/«храм '
      + 'солнца»/«старейшина»/«посмеешь»; тексты Отвара — «на весах»/'
      + '«сонной мяты»/«клонит в сон»; тексты Травницы — «завянет»/'
      + '«пучками»/«почерневш»/«разотрёшь») не дублируется: подстрока «'
      + w + '»');
  }
});

// --- T6: профиль-гарант — блоков профильных НЕТ, зеркало ≡ JSON --------------

test('T6: блоков квесты/торговля/обучение/найм НЕТ (ни в JSON, ни в зеркале); нет ссылок assets/items; зеркало ≡ JSON без резолвинга: постройки [3], диалог/описание deepEqual (счётчики goal 2 / reward 5 / торговля 64 / сумма 71 / unique 41 / R7=13 НЕ растут)', () => {
  assert.ok(fs.existsSync(NEW), 'RED: assets/npc/000032.json отсутствует');
  const data = readJson(NEW);
  for (const block of ['квесты', 'торговля', 'обучение', 'найм']) {
    assert.ok(!(block in data),
      'в JSON нет блока «' + block + '»: профиль чистая подсказка — '
      + 'счётчики npc-refs goal 2 / reward 5 / торговля 64 / сумма 71 / '
      + 'уникальные предметы 41 и R7 (tests/item-prices-000322) не растут');
  }
  assert.ok(!JSON.stringify(data).includes('assets/items'),
    'в JSON нет ссылок assets/items (ни торговли, ни квестов) — свипы '
    + 'item-prices-000322 пропускают неторговцев: фельдшер невидим');
  const mirror = NPCS[31];
  assert.ok(mirror && mirror.id === ID,
    'зеркало: 32-я запись village_doctor');
  assert.equal(mirror.роль, 'фельдшер',
    'роль в зеркале — «фельдшер» (фикс ТЗ); раз блоков нет, инвариант '
    + 'npc-refs goal 2 / reward 5 / торговля 64 / сумма 71 / unique 41 '
    + 'неизменен');
  for (const block of ['квесты', 'торговля', 'обучение', 'найм']) {
    assert.ok(!(block in mirror),
      'в зеркале нет блока «' + block + '» (следует из JSON)');
  }
  assert.deepEqual(mirror.постройки, [3],
    'зеркало: постройки [3] — sync резолвит ссылку Аптекаря в id');
  assert.deepEqual(mirror.диалог, data.диалог,
    'зеркало NPCS[31].диалог ≡ JSON-диалог бит-в-бит (резолвинга нет — '
    + 'ни квестов, ни торговли)');
  assert.deepEqual(mirror.описание, data.описание,
    'зеркало NPCS[31].описание ≡ JSON');
});

// --- T7: ростер Аптекаря — ПЯТЬ записей, Мила первая -------------------------

test('T7: npcsForBuilding(NPCS, 3) — ПЯТЬ записей Аптекаря в порядке каталога [apothecary, brewer, herbalist, alchemy_instructor, village_doctor]; npcForBuilding(3) — по-прежнему Мила; Бронник — ТРИ и Оружейная — ДЕВЯТЬ не тронуты', () => {
  const list = N.npcsForBuilding(NPCS, 3);
  assert.deepEqual(list.map((n) => n.id),
    ['apothecary', 'brewer', 'herbalist', 'alchemy_instructor', ID],
    'Аптекарь (3): Мила (000003) + Зельевар (000029) + Травница '
    + '(000030) + Алхимик-наставник (000031) + Фельдшер (000032), '
    + 'порядок = нумерация файлов; факт: '
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
    ['dialog', 'dialog:brewer', 'dialog:herbalist',
      'dialog:alchemy_instructor', 'dialog:' + ID],
    'у здания 3 эффектов нет — список = dialog-строки по каждому NPC; '
    + 'ре-пин при появлении шестого NPC Аптекаря; факт: '
    + JSON.stringify(rows.map((r) => r.id)));
  assert.deepEqual(rows.map((r) => r.имя),
    ['Диалог: Мила', 'Диалог: Отвар', 'Диалог: Полынь',
      'Диалог: Тигель', 'Диалог: ' + NAME],
    'подписи — «Диалог: <имя>», факт: ' + JSON.stringify(rows.map((r) => r.имя)));
  assert.deepEqual(rows.map((r) => r.npcId),
    ['apothecary', 'brewer', 'herbalist', 'alchemy_instructor', ID],
    'каждая строка несёт npcId своего NPC (роутинг клика); хоткеи '
    + 'Digit1..5 — общий механизм /^Digit([1-9])$/ (src/building-ui.js) '
    + 'по индексу строки');
});

// Задача 000320.17: «Переписчик» — id scribe, имя «Грифель» (Магазин
// магии, 4-й NPC постройки; 17-я из 100 дочерних 000320).
//
// Контракт (ТЗ tasks/done/000320.17.md; механизм мульти-NPC —
// 000320.01, spec/npc.md «Несколько NPC на постройку»,
// memory/000320-npcs-batch.md):
//   * assets/npc/000035.json — id scribe (резерв смысла ТЗ; память-
//     файл фиксирован ТЗ именем 000320-scribe.md независимо от id;
//     sweep по 34 занятым — свободен), имя «Грифель» (выбор агента:
//     прозвище по инструменту письма — грифелем выводят черновик,
//     прежде чем он станет копией; прецеденты не-личного имени 000018
//     «Кочевник», прозвища 000026 «Опилка» … 000033 «Пергамент»,
//     000034 «Пробник»), роль «переписчик» (фикс ТЗ; строка НОВА в
//     каталоге — свипов уникальности ролей нет, Т4 пишет точное
//     равенство), постройка assets/buildings/magic_shop.json (Магазин
//     магии — ЧЕТВЁРТЫЙ NPC: Зира ПЕРВАЯ, Пергамент .15 ВТОРОЙ,
//     Пробник .16 ТРЕТИЙ, npcForBuilding(4) продолжает возвращать
//     Зиру; путь — SLUG: база содержит 000318.06, numeric-путь зданий
//     больше НЕ ref и красит zero-sweep
//     tests/buildings-rename-000318.06.test.js T5), хук истории
//     «Копирует гримуары; продаёт копии тем, кто сам не читает»
//     (последнее предложение описания, с заглавной — прецеденты
//     .02–.16);
//   * профиль — ЧИСТАЯ подсказка (форма подсказочного семейства —
//     эталон .14 «Жгут» / .08 «Опилка»: РОВНО 3 опции, ВСЕ действием
//     «подсказка» (prives / hint_copy / hint_reader), ровно одна с
//     {харизма:3} (прецедент hint_hand .15 / hint_talent .16 — НЕ
//     «проверка»: харизма-прецедент батча); блоков
//     обучение/торговля/квесты/найм НЕТ — «продаёт копии» из хука
//     ТЗ есть СЛОВЕСНЫЙ, витрины нет; счётчики npc-refs торговля 67 /
//     goal 2 / reward 5 / сумма 74 / уникальные 44 и R7=14
//     (tests/item-prices-000322) НЕ растут — неторговец свипам
//     невидим, все они пропускают его `if (!npc.торговля) continue`
//     (пин T6; невидимость закреплена мутацией M6);
//   * опций с «для» — РОВНО 0: контракт A8a (tests/npc-dialog-scope)
//     — динамический свип ждёт 0 «для» у всех, кроме Берты/Элдиры/
//     Корда; добавление «для» = ослабление пина, запрещено (мутация
//     M1);
//   * тема диалога — копия/сверка/безграмотный покупатель; «перепис»,
//     «гримуар», «копий», «пиш» НЕ банятся — категории своего дела
//     (правило «брон» .09/.10); к СВОЕМУ хуку запрет-лист не
//     применяется; запрет-лист ТЕКСТОВ диалога 43 = дисковый список
//     .16 (40 = 37 из .15 + обороты Пергамента «между строк»/«при
//     дневном свете»/«чернила помнят») + СЪЕДЕННЫЕ 3 оборота Пробника
//     (сосед по дому 4; зарезервированы в
//     memory/000320-magic_instructor.md для .17+): «прощает
//     торопливому», «из-под пальцев», «выберем тебе школу»; СВОИ
//     обороты, резерв для .18+: «описк», «чистовик», «вкривь»
//     (memory/000320-scribe.md);
//   * [E]-оверлей Магазина магии — РОВНО ЧЕТЫРЕ dialog-строки в
//     порядке каталога: 'dialog' (Зира) → 'dialog:scroll_merchant'
//     (Пергамент) → 'dialog:magic_instructor' (Пробник) →
//     'dialog:scribe' (Грифель); хоткеи Digit1..4 — общий механизм
//     src/building-ui.js /^Digit([1-9])$/ по индексу строки; ре-пин
//     T7/T8 tests/npc-000320.15.test.js и tests/npc-000320.16.test.js
//     (прецеденты .12–.16); ПЯТЫЙ NPC дома 4 поднимет оверлей до 5 и
//     обязан ре-пинить дальше.
//
// КРАСНЫЕ (TDD): T1..T8 красные до зелёной стадии (000035.json нет,
// каталог 34, ростер дома 4 — ТРИ NPC, оверлей 3 строки), без краха
// загрузки.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validateData } = require('./json-schema.js');

const ROOT = path.join(__dirname, '..');
const NDIR = path.join(ROOT, 'assets', 'npc');
const NEW = path.join(NDIR, '000035.json');
const SCHEMA = JSON.parse(
  fs.readFileSync(path.join(NDIR, 'schema.json'), 'utf8'));

const N = require('../src/npc.js');
const { NPCS } = require('../src/npc-data.js');
const BE = require('../src/building-effects.js');

const HOOK = 'Копирует гримуары; продаёт копии тем, кто сам не читает';
const ID = 'scribe';
const NAME = 'Грифель';

function listNpcFiles() {
  return fs.readdirSync(NDIR)
    .filter((f) => /^\d{6}\.json$/.test(f))
    .sort();
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// --- T1: размер каталога ---------------------------------------------------

test('T1: каталог — ровно 35 файла 000001..000035 подряд; зеркало NPCS 35 записей с scribe', () => {
  const files = listNpcFiles();
  assert.equal(files.length, 35,
    'в каталоге NPC 35 файла (000320.14: +Фельдшер; 000320.15: +Торговец '
    + 'свитками; 000320.16: +Маг-наставник; 000320.17: +Переписчик), '
    + 'факт: ' + files.length);
  for (let i = 0; i < files.length; i++) {
    assert.equal(files[i],
      String(i + 1).padStart(6, '0') + '.json',
      'нумерация подряд без пропусков: индекс ' + i);
  }
  assert.equal(NPCS.length, 35,
    'зеркало src/npc-data.js — 35 записей (sync не прогнан?), факт: '
    + NPCS.length);
  const last = NPCS[34];
  assert.ok(last, '35-я запись зеркала существует');
  assert.equal(last.id, ID,
    '35-я запись зеркала — scribe (порядок = нумерация файлов)');
});

// --- T2: 000035.json валиден по схеме + порядок ключей + roundtrip ---------

test('T2: assets/npc/000035.json валиден по schema; ключи в порядке эталона ЧИСТОЙ ПОДСКАЗКИ .14 (id, имя, роль, описание, постройки, диалог — без блоков); roundtrip-канон; негативы — мимо схемы и мимо порядка ключей', () => {
  assert.ok(fs.existsSync(NEW),
    'RED: assets/npc/000035.json отсутствует (NPC задачи ещё не создан)');
  const data = readJson(NEW);
  assert.deepEqual(validateData(SCHEMA, data, 'npc/000035'), [],
    '000035.json обязан проходить assets/npc/schema.json');
  const KEYS = ['id', 'имя', 'роль', 'описание', 'постройки', 'диалог'];
  assert.deepEqual(Object.keys(data), KEYS,
    'порядок ключей — как у эталона чистой подсказки .14 (000032): id, '
    + 'имя, роль, описание, постройки, диалог — без блоков '
    + 'обучение/торговля/квесты/найм');
  const raw = fs.readFileSync(NEW, 'utf8');
  assert.equal(raw, JSON.stringify(data, null, 2) + '\n',
    '000035.json — roundtrip JSON.stringify(obj,null,2)+перевод строки');
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
  badPath.постройки = ['000004.json'];
  assert.notDeepEqual(validateData(SCHEMA, badPath, 'npc/badpath'), [],
    'постройки без пути assets/buildings/ (numeric-форма) — вне паттерна схемы');
  const numericPath = JSON.parse(JSON.stringify(data));
  numericPath.постройки = ['assets/buildings/' + '000004' + '.json'];
  assert.notDeepEqual(validateData(SCHEMA, numericPath, 'npc/numericpath'), [],
    'numeric-путь постройки — вне паттерна схемы: база содержит 000318.06, '
    + 'здания — slug-именование, numeric-форма мертва (zero-sweep '
    + 'tests/buildings-rename-000318.06.test.js T5)');
  const withTrade = JSON.parse(JSON.stringify(data));
  withTrade.торговля = { предметы: [{ предмет: 'assets/items/000043.json',
    mult_продажи: 0.5, количество: 1 }] };
  assert.notDeepEqual(Object.keys(withTrade), KEYS,
    'лишний блок «торговля» — вне эталона ключей: схема блок допускает '
    + '(невидимость свипам пинит не схема, а T2/T6), профиль чистая '
    + 'подсказка «продаёт копии» держит только СЛОВОМ, не витриной');
  const legacyEntry = JSON.parse(JSON.stringify(data));
  legacyEntry.торговля = { предметы: [{ предмет: 'assets/items/000043.json',
    mult_продажи: 0.5, количество: 1, цена_покупки: 60, цена_продажи: 30 }] };
  assert.notDeepEqual(validateData(SCHEMA, legacyEntry, 'npc/legacyentry'), [],
    'legacy-вход торговли цена_покупки/цена_продажи — вне схемы '
    + '(additionalProperties false, формат 000322)');
});

// --- T3: id и имя уникальны (sweep) ----------------------------------------

test('T3: id scribe и имя «Грифель» уникальны в sweep каталога', () => {
  assert.ok(fs.existsSync(NEW), 'RED: assets/npc/000035.json отсутствует');
  const ids = new Set();
  const names = new Set();
  for (const f of listNpcFiles()) {
    const d = readJson(path.join(NDIR, f));
    assert.ok(!ids.has(d.id), 'дубликат id «' + d.id + '» (файл ' + f + ')');
    assert.ok(!names.has(d.имя), 'дубликат имени «' + d.имя + '» (файл ' + f + ')');
    ids.add(d.id);
    names.add(d.имя);
  }
  assert.ok(ids.has(ID), 'id scribe в каталоге');
  assert.ok(names.has(NAME), 'имя «Грифель» в каталоге');
});

// --- T4: роль-фикс, описание с хуком и уникально ----------------------------

test('T4: роль РОВНО «переписчик» (точная строка ТЗ; свипов уникальности ролей нет); описание непустое, хук «Копирует гримуары; продаёт копии тем, кто сам не читает» — последнее предложение, и НЕ копия описания другого NPC', () => {
  assert.ok(fs.existsSync(NEW), 'RED: assets/npc/000035.json отсутствует');
  const data = readJson(NEW);
  assert.ok(typeof data.описание === 'string' && data.описание.trim() !== '',
    'описание непустое');
  assert.equal(data.роль, 'переписчик',
    'роль — фикс-строка «переписчик» (ТЗ); Т4 пишет точное равенство');
  assert.ok(data.описание.includes(HOOK),
    'хук истории «' + HOOK + '» (ТЗ) в описании дословно');
  assert.ok(data.описание.endsWith(HOOK + '.'),
    'хук — ПОСЛЕДНЕЕ предложение описания (с заглавной, с точкой на '
    + 'конце — прецеденты .02–.16); факт: '
    + JSON.stringify(data.описание.slice(-70)));
  for (const f of listNpcFiles()) {
    if (f === '000035.json') continue;
    const d = readJson(path.join(NDIR, f));
    assert.notEqual(d.описание, data.описание,
      'описание совпадает с ' + f + ' (не копия существующего)');
  }
});

// --- T5: диалог — профиль чистая подсказка, без «для» ------------------------

test('T5: диалог валиден по схеме, РОВНО 3 опции как у эталона .14, ВСЕ «подсказка», ровно одна с {харизма:3}, id опций уникальны, опций с «для» — ровно 0, запрет-лист 43 подстрок (дисковые 40 из .16 + обороты Пробника) по ТЕКСТАМ диалога', () => {
  assert.ok(fs.existsSync(NEW), 'RED: assets/npc/000035.json отсутствует');
  const data = readJson(NEW);
  assert.ok(Array.isArray(data.диалог) && data.диалог.length >= 1,
    'диалог непустой (schema minItems 1)');
  assert.equal(data.диалог.length, 3,
    'диалог — ровно 3 опции (prives / hint_copy / hint_reader — форма '
    + 'эталона чистой подсказки .14 «Жгут»), факт: ' + data.диалог.length);
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
    'профиль ЧИСТАЯ подсказка (клон .14/.08): опций с действием вне '
    + '«подсказка» — ровно 0');
  const ids = data.диалог.map((o) => o.id);
  assert.equal(new Set(ids).size, ids.length, 'id опций диалога уникальны');
  assert.equal(data.диалог.filter((o) => o.для !== undefined).length, 0,
    'опций с «для» — ровно 0: переписчик говорит со всеми; добавление '
    + '«для» требует ре-пина A8a (tests/npc-dialog-scope) и запрещено');
  const withReq = data.диалог.filter((o) => o.требования !== undefined);
  assert.equal(withReq.length, 1,
    'ровно одна опция с требованиями (прецедент hint_wood/hint_old/'
    + 'hint_blade/hint_collection/hint_anvil/hint_march/hint_ring/'
    + 'hint_weight/hint_dry/hint_stone/hint_fire/hint_hand/hint_talent)');
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
    'прощает торопливому', 'из-под пальцев', 'выберем тебе школу']) {
    assert.ok(!texts.includes(w),
      'тема чужого NPC (.04 «старые походы»/арена — «арен», .05 '
      + 'коллекция, .06 ковка/хвостовик, .07 наём/жалованье, .08 '
      + 'метла/стена клинков, .09 броня-звонок, .10 големы; тексты '
      + 'Милы — «старые дела»/«храм солнца»/«старейшина»/«посмеешь»; '
      + 'обороты Отвара — «на весах»/«сонной мяты»/«клонит в сон»; '
      + 'обороты Травницы — «завянет»/«пучками»/«почерневш»/«разотрёшь»; '
      + 'обороты Жгута — «где болит»/«выше раны»/«доживают до '
      + 'старости»; обороты Зиры (хозяйка дома 4) — «не бывает '
      + 'лишнего»/«с далёких гор»/«договоримся о цене»; обороты '
      + 'Пергамента (сосед по дому 4, .15) — «между строк»/«при '
      + 'дневном свете»/«чернила помнят»; обороты Пробника (сосед по '
      + 'дому 4, .16) — «прощает торопливому»/«из-под пальцев»/'
      + '«выберем тебе школу») не дублируется: подстрока «' + w + '»');
  }
});

// --- T6: профиль-гарант — блоков профильных НЕТ, зеркало ≡ JSON --------------

test('T6: блоков обучение/торговля/квесты/найм НЕТ (ни в JSON, ни в зеркале), нет ссылок assets/items — «продаёт копии» из хука ТЗ словесный, не витрина (счётчики торговля 67 / goal 2 / reward 5 / сумма 74 / unique 44 / R7=14 НЕ растут); постройки [assets/buildings/magic_shop.json]; зеркало NPCS[34]: постройки [4], диалог/описание deepEqual', () => {
  assert.ok(fs.existsSync(NEW), 'RED: assets/npc/000035.json отсутствует');
  const data = readJson(NEW);
  for (const block of ['обучение', 'торговля', 'квесты', 'найм']) {
    assert.ok(!(block in data),
      'в JSON нет блока «' + block + '»: профиль чистая подсказка — '
      + 'счётчики npc-refs торговля 67 / goal 2 / reward 5 / сумма 74 / '
      + 'уникальные предметы 44 и R7 торгующих 14 (tests/'
      + 'item-prices-000322) не растут');
  }
  assert.ok(!JSON.stringify(data).includes('assets/items'),
    'в JSON нет ссылок assets/items (ни торговли, ни квестов) — свипы '
    + 'item-prices-000322 пропускают неторговцев: переписчик невидим');
  assert.deepEqual(data.постройки, ['assets/buildings/magic_shop.json'],
    'постройка — Магазин магии (фикс ТЗ; путь — SLUG: база содержит '
    + '000318.06, numeric-путь зданий больше НЕ ref)');
  const mirror = NPCS[34];
  assert.ok(mirror && mirror.id === ID,
    'зеркало: 35-я запись scribe');
  assert.equal(mirror.роль, 'переписчик',
    'роль в зеркале — «переписчик» (фикс ТЗ)');
  for (const block of ['обучение', 'торговля', 'квесты', 'найм']) {
    assert.ok(!(block in mirror),
      'в зеркале нет блока «' + block + '» (следует из JSON)');
  }
  assert.deepEqual(mirror.постройки, [4],
    'зеркало: постройки [4] — sync резолвит ссылку Магазина магии в id');
  assert.deepEqual(mirror.диалог, data.диалог,
    'зеркало NPCS[34].диалог ≡ JSON-диалог бит-в-бит (резолвинга нет — '
    + 'ни квестов, ни торговли)');
  assert.deepEqual(mirror.описание, data.описание,
    'зеркало NPCS[34].описание ≡ JSON');
});

// --- T7: ростер дома 4 — ЧЕТЫРЕ записи, Зира первая ---------------------------

test('T7: npcsForBuilding(NPCS, 4) — ЧЕТЫРЕ записи Магазина магии в порядке каталога [magic_merchant, scroll_merchant, magic_instructor, scribe]; npcForBuilding(4) — по-прежнему Зира; Аптекарь — ПЯТЬ, Бронник — ТРИ и Оружейная — ДЕВЯТЬ не тронуты', () => {
  const list = N.npcsForBuilding(NPCS, 4);
  assert.deepEqual(list.map((n) => n.id),
    ['magic_merchant', 'scroll_merchant', 'magic_instructor', ID],
    'Магазин магии (4): Зира (000004) + Пергамент (000033) + Пробник '
    + '(000034) + Переписчик (000035), порядок = нумерация файлов; '
    + 'факт: ' + JSON.stringify(list.map((n) => n.id)));
  assert.equal(N.npcForBuilding(NPCS, 4).id, 'magic_merchant',
    'npcForBuilding — ПЕРВЫЙ по номеру файла (Зира; HUD/«Здесь:» не тронуты)');
  const apteka = N.npcsForBuilding(NPCS, 3);
  assert.deepEqual(apteka.map((n) => n.id),
    ['apothecary', 'brewer', 'herbalist', 'alchemy_instructor',
      'village_doctor'],
    'Аптекарь (3) — ПЯТЬ NPC не тронуты (новый NPC — Магазин магии): '
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

// --- T8: оверлей дома 4 — ровно 4 dialog-строки ------------------------------

test('T8: [E]-оверлей Магазина магии — ровно 4 строки: dialog (Зира), dialog:scroll_merchant (Пергамент), dialog:magic_instructor (Пробник), dialog:scribe (Грифель) — пин 000320.15 (ДВЕ), ре-пины 000320.16 (ТРИ) и 000320.17 (ЧЕТЫРЕ)', () => {
  const b = readJson(path.join(ROOT, 'assets', 'buildings', 'magic_shop.json'));
  const list = N.npcsForBuilding(NPCS, 4);
  const rows = BE.buildingActions(b, list, { day: 5 });
  assert.deepEqual(rows.map((r) => r.id),
    ['dialog', 'dialog:scroll_merchant', 'dialog:magic_instructor',
      'dialog:' + ID],
    'у здания 4 эффектов нет — список = dialog-строки по каждому NPC; '
    + 'факт: ' + JSON.stringify(rows.map((r) => r.id)));
  assert.deepEqual(rows.map((r) => r.имя),
    ['Диалог: Зира', 'Диалог: Пергамент', 'Диалог: Пробник',
      'Диалог: ' + NAME],
    'подписи — «Диалог: <имя>», факт: ' + JSON.stringify(rows.map((r) => r.имя)));
  assert.deepEqual(rows.map((r) => r.npcId),
    ['magic_merchant', 'scroll_merchant', 'magic_instructor', ID],
    'каждая строка несёт npcId своего NPC (роутинг клика); хоткеи '
    + 'Digit1..4 — общий механизм /^Digit([1-9])$/ (src/building-ui.js) '
    + 'по индексу строки');
});

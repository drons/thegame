// Задача 000320.09: «Чекан» — специалист по броне (Бронник, 2-й NPC
// постройки; 9-я из 100 дочерних 000320).
//
// Контракт (ТЗ tasks/done/000320.09.md; механизм мульти-NPC —
// 000320.01, spec/npc.md «Несколько NPC на постройку»,
// memory/000320-npcs-batch.md):
//   * assets/npc/000027.json — id armor_specialist, имя «Чекан»
//     (выбор агента: прозвище молотка-пробника — именно им проверяют
//     броню звоном, рифма с хуком ТЗ; прецеденты не-личного имени
//     000018 «Кочевник», прозвище 000026 «Опилка»), роль
//     «торговец бронёй» (фикс ТЗ; СОВПАДАЕТ с ролью Гроты
//     armor_merchant 000002 — ЗАКОННО: свипов уникальности ролей в
//     каталоге нет, уникальны по контракту id/имя/описание), постройка
//     assets/buildings/000002.json (Бронник — ВТОРОЙ NPC: Грота
//     ПЕРВАЯ, npcForBuilding(2) продолжает возвращать Гроту), хук
//     истории «Определяет сталь по звону одного удара» (последнее
//     предложение описания, с заглавной — прецеденты .02–.08);
//   * профиль — ТОРГОВЛЯ (без квестов): ≥1 опций с действием
//     «торговля»; блоков квесты/обучение/найм НЕТ (счётчики npc-refs
//     goal 2 / reward 5 НЕ растут; trade 54 → 57 — три брони
//     Специалиста, уникальные предметы 41 — броня Гроты уже в
//     множестве);
//   * торговля — 3 брони каталога (000008/000009/000010, kind armor,
//     формат 000322: base_price в JSON предмета, mult_покупки при 1 —
//     ключа нет), множители не хуже купецких Гроты (прецедент Дарна
//     .06), количества 1..99 (schema); плащ traveler_cloak 000458 —
//     БЕЗ base_price, в ассортимент НЕ включается (ловушка R1);
//   * опций с «для» — РОВНО 0: специалист торгует с каждым; контракт
//     A8a (tests/npc-dialog-scope) — добавление «для» потребовало бы
//     ре-пина A8a;
//   * тема hint — выбор брони на слух: удар по нагруднику, чистый
//     звон = закалка, дребезг — трещина/мягкая сталь. Темы ковки-
//     хвостовика (.06), коллекции (.05), старых походов/арены (.04),
//     наёма/жалованья (.07), метлы/стены клинков (.08) НЕ дублируются
//     дословно в текстах диалога;
//   * [E]-оверлей Бронника — с 000320.10 — ТРИ dialog-строки в
//     порядке каталога: 'dialog' (Грота) →
//     'dialog:armor_specialist' (Чекан) →
//     'dialog:golem_instructor' (Глыба); хоткеи Digit1..3 — общий
//     механизм src/building-ui.js /^Digit([1-9])$/ по индексу строки.
//     Оверлей Оружейной (ДЕВЯТЬ строк) НЕ затрагивается.
//
// КРАСНЫЕ (TDD): T1..T9 красные до зелёной стадии (000027.json нет,
// каталог 26, ростер Бронника 1, оверлей 1 строка), без краха загрузки.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validateData } = require('./json-schema.js');

const ROOT = path.join(__dirname, '..');
const NDIR = path.join(ROOT, 'assets', 'npc');
const NEW = path.join(NDIR, '000027.json');
const SCHEMA = JSON.parse(
  fs.readFileSync(path.join(NDIR, 'schema.json'), 'utf8'));

const N = require('../src/npc.js');
const { NPCS } = require('../src/npc-data.js');
const BE = require('../src/building-effects.js');

const HOOK = 'Определяет сталь по звону одного удара';
const ID = 'armor_specialist';
const NAME = 'Чекан';

function listNpcFiles() {
  return fs.readdirSync(NDIR)
    .filter((f) => /^\d{6}\.json$/.test(f))
    .sort();
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// --- T1: размер каталога ---------------------------------------------------

test('T1: каталог — ровно 31 файл 000001..000031 подряд; зеркало NPCS 31 запись с armor_specialist', () => {
  const files = listNpcFiles();
  assert.equal(files.length, 31,
    'в каталоге NPC 31 файл (000320.06: +Оружейник; 000320.07: +Отставной наёмник; 000320.08: +Подмастерье; 000320.09: +Специалист по броне; 000320.10: +Наставник-големовед; 000320.11: +Торговец зельями; 000320.12: +Торговка травами; 000320.13: +Алхимик-наставник), факт: ' + files.length);
  for (let i = 0; i < files.length; i++) {
    assert.equal(files[i],
      String(i + 1).padStart(6, '0') + '.json',
      'нумерация подряд без пропусков: индекс ' + i);
  }
  assert.equal(NPCS.length, 31,
    'зеркало src/npc-data.js — 31 запись (sync не прогнан?), факт: '
    + NPCS.length);
  const last = NPCS[26];
  assert.ok(last, '27-я запись зеркала существует');
  assert.equal(last.id, ID,
    '27-я запись зеркала — armor_specialist (порядок = нумерация файлов)');
});

// --- T2: 000027.json валиден по схеме + порядок ключей + roundtrip ---------

test('T2: assets/npc/000027.json валиден по schema; ключи в порядке 000001/000019/000024 (торговля после диалога); roundtrip-канон; негативы — мимо схемы', () => {
  assert.ok(fs.existsSync(NEW),
    'RED: assets/npc/000027.json отсутствует (NPC задачи ещё не создан)');
  const data = readJson(NEW);
  assert.deepEqual(validateData(SCHEMA, data, 'npc/000027'), [],
    '000027.json обязан проходить assets/npc/schema.json');
  assert.deepEqual(Object.keys(data),
    ['id', 'имя', 'роль', 'описание', 'постройки', 'диалог', 'торговля'],
    'порядок ключей — как 000001/000019/000024 (id, имя, роль, описание, '
    + 'постройки, диалог, торговля) — профиль торговля');
  const raw = fs.readFileSync(NEW, 'utf8');
  assert.equal(raw, JSON.stringify(data, null, 2) + '\n',
    '000027.json — roundtrip JSON.stringify(obj,null,2)+перевод строки');
  const extraKey = JSON.parse(JSON.stringify(data));
  extraKey.цена = 10;
  assert.notDeepEqual(validateData(SCHEMA, extraKey, 'npc/extra'), [],
    'посторонний ключ «цена» — additionalProperties false, обязан отваливаться');
  const badCharisma = JSON.parse(JSON.stringify(data));
  const reqOpt = badCharisma.диалог.find((o) => o.требования);
  assert.ok(reqOpt, 'есть опция с требованиями (прецедент hint_wood)');
  reqOpt.требования.харизма = 0;
  assert.notDeepEqual(validateData(SCHEMA, badCharisma, 'npc/badcharisma'), [],
    'требование харизма 0 — вне схемы (minimum 1)');
  const badAction = JSON.parse(JSON.stringify(data));
  badAction.диалог[0].действие = 'дар';
  assert.notDeepEqual(validateData(SCHEMA, badAction, 'npc/badaction'), [],
    'действие «дар» — вне enum схемы');
  const badPath = JSON.parse(JSON.stringify(data));
  badPath.постройки = ['000001.json'];
  assert.notDeepEqual(validateData(SCHEMA, badPath, 'npc/badpath'), [],
    'постройки без пути assets/buildings/ — вне паттерна схемы');
  const badQty = JSON.parse(JSON.stringify(data));
  badQty.торговля.предметы[0].количество = 0;
  assert.notDeepEqual(validateData(SCHEMA, badQty, 'npc/badqty'), [],
    'количество 0 — вне схемы (minimum 1, maximum 99)');
  const legacyEntry = JSON.parse(JSON.stringify(data));
  legacyEntry.торговля.предметы[0] = {
    предмет: 'assets/items/000008.json',
    цена_покупки: 36, цена_продажи: 20, количество: 1,
  };
  assert.notDeepEqual(validateData(SCHEMA, legacyEntry, 'npc/legacy'), [],
    'legacy-вход торговли (цена_покупки/цена_продажи) — невалиден (000322)');
});

// --- T3: id и имя уникальны (sweep) ----------------------------------------

test('T3: id armor_specialist и имя «Чекан» уникальны в sweep каталога', () => {
  assert.ok(fs.existsSync(NEW), 'RED: assets/npc/000027.json отсутствует');
  const ids = new Set();
  const names = new Set();
  for (const f of listNpcFiles()) {
    const d = readJson(path.join(NDIR, f));
    assert.ok(!ids.has(d.id), 'дубликат id «' + d.id + '» (файл ' + f + ')');
    assert.ok(!names.has(d.имя), 'дубликат имени «' + d.имя + '» (файл ' + f + ')');
    ids.add(d.id);
    names.add(d.имя);
  }
  assert.ok(ids.has(ID), 'id armor_specialist в каталоге');
  assert.ok(names.has(NAME), 'имя «Чекан» в каталоге');
});

// --- T4: роль-фикс, описание с хуком и уникально ----------------------------

test('T4: роль РОВНО «торговец бронёй» (дубль роли Гроты законен — уникальность ролей не контракт); описание непустое, хук «Определяет сталь» — последнее предложение, и НЕ копия описания другого NPC', () => {
  assert.ok(fs.existsSync(NEW), 'RED: assets/npc/000027.json отсутствует');
  const data = readJson(NEW);
  assert.ok(typeof data.описание === 'string' && data.описание.trim() !== '',
    'описание непустое');
  assert.equal(data.роль, 'торговец бронёй',
    'роль — фикс-строка «торговец бронёй» (ТЗ); совпадает с ролью Гроты '
    + 'armor_merchant — свипов уникальности ролей в каталоге НЕТ');
  assert.ok(data.описание.includes(HOOK),
    'хук истории «' + HOOK + '» (ТЗ) в описании дословно');
  assert.ok(data.описание.endsWith(HOOK + '.'),
    'хук — ПОСЛЕДНЕЕ предложение описания (с заглавной, с точкой на конце — '
    + 'прецеденты .02–.08); факт: ' + JSON.stringify(data.описание.slice(-60)));
  for (const f of listNpcFiles()) {
    if (f === '000027.json') continue;
    const d = readJson(path.join(NDIR, f));
    assert.notEqual(d.описание, data.описание,
      'описание совпадает с ' + f + ' (не копия существующего)');
  }
});

// --- T5: диалог — профиль торговля, без «для» --------------------------------

test('T5: диалог валиден по схеме, ≥1 опция «торговля», действия ⊆ {подсказка, торговля}, ровно одна с {харизма:3}, id опций уникальны, опций с «для» — ровно 0, темы .04–.08 не дублируются', () => {
  assert.ok(fs.existsSync(NEW), 'RED: assets/npc/000027.json отсутствует');
  const data = readJson(NEW);
  assert.ok(Array.isArray(data.диалог) && data.диалог.length >= 1,
    'диалог непустой (schema minItems 1)');
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
    'опций с «для» — ровно 0: специалист торгует с каждым; добавление '
    + '«для» требует ре-пина A8a (tests/npc-dialog-scope)');
  const withReq = data.диалог.filter((o) => o.требования !== undefined);
  assert.equal(withReq.length, 1,
    'ровно одна опция с требованиями (прецедент hint_wood/hint_old/hint_blade/hint_collection/hint_anvil/hint_march)');
  assert.deepEqual(withReq[0].требования, { харизма: 3 },
    'требование опции — {харизма: 3}');
  const texts = data.диалог.map((o) => o.текст).join(' ');
  for (const w of ['хвостовик', 'наковальн', 'штампов', 'коллекци', 'позолот',
    'старые походы', 'арен', 'жалован', 'знамен', 'задаток', 'табель',
    'метл', 'стена клинков']) {
    assert.ok(!texts.includes(w),
      'тема чужого NPC (.04 «старые походы»/арена, .05 коллекция, .06 ковка/'
      + 'хвостовик, .07 наём/жалованье, .08 метла/стена клинков) не '
      + 'дублируется: подстрока «' + w + '»');
  }
});

// --- T6: профиль-гарант — торговля ЕСТЬ, квестов/обучения/найма НЕТ ---------

test('T6: блоков квесты/обучение/найм НЕТ (ни в JSON, ни в зеркале), торговля ЕСТЬ там и там; зеркало: постройки [2], торговля резолвится в id предмета, диалог deepEqual', () => {
  assert.ok(fs.existsSync(NEW), 'RED: assets/npc/000027.json отсутствует');
  const data = readJson(NEW);
  for (const block of ['квесты', 'обучение', 'найм']) {
    assert.ok(!(block in data),
      'в JSON нет блока «' + block + '»: профиль торговля без квестов — '
      + 'счётчики npc-refs goal 2 / reward 5 не растут');
  }
  assert.ok(data.торговля && Array.isArray(data.торговля.предметы),
    'в JSON есть блок «торговля» с предметами (trade 54 → 57)');
  const mirror = NPCS[26];
  assert.ok(mirror && mirror.id === ID,
    'зеркало: 27-я запись armor_specialist');
  assert.equal(mirror.роль, 'торговец бронёй',
    'роль в зеркале — «торговец бронёй» (фикс ТЗ)');
  for (const block of ['квесты', 'обучение', 'найм']) {
    assert.ok(!(block in mirror),
      'в зеркале нет блока «' + block + '» (следует из JSON)');
  }
  assert.ok(mirror.торговля && Array.isArray(mirror.торговля.предметы),
    'в зеркале есть блок «торговля» (следует из JSON)');
  assert.deepEqual(mirror.постройки, [2],
    'зеркало: постройки [2] — sync резолвит ссылку Бронника в id');
  data.торговля.предметы.forEach((e, j) => {
    const it = readJson(path.join(ROOT, e.предмет));
    assert.equal(mirror.торговля.предметы[j].предмет, it.id,
      'зеркало резолвит путь торговли в id: ' + e.предмет);
  });
  assert.deepEqual(mirror.диалог, data.диалог,
    'зеркало NPCS[26].диалог ≡ JSON-диалог бит-в-бит');
  assert.deepEqual(mirror.описание, data.описание,
    'зеркало NPCS[26].описание ≡ JSON');
});

// --- T7: торговля — 3 брони, формат 000322 -----------------------------------

test('T7: торговля — РОВНО 3 входа брони; пути на диске; kind armor; base_price в JSON предмета; mult_продажи ∈ (0,1]; mult_покупки ключ отсутствует; количество 1..99; зеркало в id-форме; ассортимент = {leather_armor, chainmail, knight_plate}', () => {
  assert.ok(fs.existsSync(NEW), 'RED: assets/npc/000027.json отсутствует');
  const data = readJson(NEW);
  const items = data.торговля && data.торговля.предметы;
  assert.ok(Array.isArray(items), 'торговля.предметы — массив');
  assert.equal(items.length, 3,
    'витрина — ровно 3 позиции (брони Бронника), факт: ' + items.length);
  const mirror = NPCS[26];
  const ids = new Set();
  items.forEach((p, j) => {
    assert.match(p.предмет, /^assets\/items\/\d{6}\.json$/,
      'путь предмета — якорная ссылка: ' + p.предмет);
    const target = path.join(ROOT, p.предмет);
    assert.ok(fs.existsSync(target), 'предмет существует по пути: ' + p.предмет);
    const it = readJson(target);
    assert.equal(it.kind, 'armor',
      p.предмет + ': специалист по броне торгует бронёй — kind armor');
    assert.ok(Number.isInteger(it.base_price) && it.base_price >= 1,
      p.предмет + ': base_price в JSON предмета (000322) — предметы без '
      + 'base_price в ассортимент forbidden (невидимы свипу R1)');
    ids.add(it.id);
    assert.equal(mirror.торговля.предметы[j].предмет, it.id,
      'зеркало резолвит путь в id: ' + p.предмет);
    assert.ok(p.mult_продажи > 0 && p.mult_продажи <= 1,
      p.предмет + ': mult_продажи ∈ (0,1]: ' + p.mult_продажи);
    assert.ok(!('mult_покупки' in p),
      p.предмет + ': mult_покупки при 1 — КЛЮЧ обязан ОТСУТСТВОВАТЬ (000322)');
    assert.ok(Number.isInteger(p.количество) && p.количество >= 1
      && p.количество <= 99,
      p.предмет + ': количество int 1..99, факт: ' + p.количество);
  });
  assert.deepEqual([...ids].sort(),
    ['chainmail', 'knight_plate', 'leather_armor'],
    'ассортимент — броня Бронника по диску (000008–000010); плащ '
    + 'traveler_cloak 000458 БЕЗ base_price forbidden');
});

// --- T8: ростер Бронника — ДВЕ записи, Грота первая --------------------------

test('T8: npcsForBuilding(NPCS, 2) — ТРИ записи Бронника в порядке каталога [armor_merchant, armor_specialist, golem_instructor]; npcForBuilding(2) — по-прежнему Грота; Оружейная — ДЕВЯТЬ не тронута', () => {
  const list = N.npcsForBuilding(NPCS, 2);
  assert.deepEqual(list.map((n) => n.id),
    ['armor_merchant', ID, 'golem_instructor'],
    'Бронник (2): Грота (000002) + Специалист (000027) + Наставник-'
    + 'големовед (000028, ре-пин 000320.10), порядок = нумерация '
    + 'файлов; факт: ' + JSON.stringify(list.map((n) => n.id)));
  assert.equal(N.npcForBuilding(NPCS, 2).id, 'armor_merchant',
    'npcForBuilding — ПЕРВЫЙ по номеру файла (Грота; HUD/«Здесь:» не тронуты)');
  const armory = N.npcsForBuilding(NPCS, 1);
  assert.deepEqual(armory.map((n) => n.id),
    ['weapons_merchant', 'blade_merchant', 'fencing_instructor',
      'duelist', 'veteran_blade', 'sword_collector', 'blade_smith',
      'ex_mercenary', 'armory_apprentice'],
    'Оружейная (1) — ДЕВЯТЬ NPC не тронута (новый NPC — Бронник): '
    + JSON.stringify(armory.map((n) => n.id)));
});

// --- T9: оверлей Бронника — ровно 2 dialog-строки -----------------------------

test('T9: [E]-оверлей Бронника — ровно 3 строки: dialog (Грота), dialog:armor_specialist (Чекан), dialog:golem_instructor (Глыба) — ре-пин 000320.10', () => {
  const b = readJson(path.join(ROOT, 'assets', 'buildings', '000002.json'));
  const list = N.npcsForBuilding(NPCS, 2);
  const rows = BE.buildingActions(b, list, { day: 5 });
  assert.deepEqual(rows.map((r) => r.id),
    ['dialog', 'dialog:' + ID, 'dialog:golem_instructor'],
    'у здания 2 эффектов нет — список = dialog-строки по каждому NPC; '
    + 'факт: ' + JSON.stringify(rows.map((r) => r.id)));
  assert.deepEqual(rows.map((r) => r.имя),
    ['Диалог: Грота', 'Диалог: ' + NAME, 'Диалог: Глыба'],
    'подписи — «Диалог: <имя>», факт: ' + JSON.stringify(rows.map((r) => r.имя)));
  assert.deepEqual(rows.map((r) => r.npcId),
    ['armor_merchant', ID, 'golem_instructor'],
    'каждая строка несёт npcId своего NPC (роутинг клика); хоткеи '
    + 'Digit1..3 — общий механизм /^Digit([1-9])$/ (src/building-ui.js) '
    + 'по индексу строки');
});

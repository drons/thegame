// Задача 000320.10: «Наставник-големовед» — id golem_instructor, имя
// «Глыба» (Бронник, 3-й NPC постройки; 10-я из 100 дочерних 000320).
//
// Контракт (ТЗ tasks/done/000320.10.md; механизм мульти-NPC —
// 000320.01, spec/npc.md «Несколько NPC на постройку»,
// memory/000320-npcs-batch.md):
//   * assets/npc/000028.json — id golem_instructor, имя «Глыба»
//     (выбор агента: прозвище каменного молчаливого богатыря — сам как
//     голем, которого учится учить; прецеденты не-личного имени
//     000018 «Кочевник», прозвища 000026 «Опилка», 000027 «Чекан»),
//     роль «наставник» (фикс ТЗ; в каталоге раньше были только
//     составные «наставник-боец/лучник/акробат/мечник» — точная
//     строка «наставник» свободна; свипов уникальности ролей нет),
//     постройка assets/buildings/armor_shop.json (Бронник — ТРЕТИЙ NPC:
//     Грота ПЕРВАЯ, npcForBuilding(2) продолжает возвращать Гроту),
//     хук истории «Тренирует големоведов: броня — первое оружие»
//     (последнее предложение описания, с заглавной — прецеденты
//     .02–.09);
//   * профиль — ОБУЧЕНИЕ (первый обучающий в Броннике; прецедент
//     обучающего в магазине-здании — Родар .02 в Оружейной): ≥1 опций
//     с действием «обучение»; блок «обучение» формата
//     assets/npc/000005.json: {навыки:[golem], цена_за_уровень,
//     цена_переноса_за_уровень}; навык golem ∈ assets/skills
//     (вторичный — свип целостности tests/npc-data.test);
//   * блоков квесты/торговля/найм НЕТ (счётчики npc-refs goal 2 /
//     reward 5 / торговля 57 / сумма 64 / уникальные 41 НЕ растут —
//     навыковые ссылки npc-refs не пинует);
//   * опций с «для» — РОВНО 0: контракт A8a (tests/npc-dialog-scope) —
//     добавление «для» потребовало бы внесения в исключения =
//     ослабление пина (мутация M1);
//   * тема диалога — голем-магия/големоведение/броня-как-первое-оружие;
//     темы Бронника (Грота — торговля бронёй, Чекан .09 — звон/закалка)
//     и Оружейной (.04–.08) в ТЕКСТАХ ДИАЛОГА дословно НЕ дублируются
//     (к описанию запрет-лист НЕ применяется — иначе собственный хук
//     со «броня»/«оружие» нарушил бы ассерт — уроки .08/.09);
//   * [E]-оверлей Бронника — ТРИ dialog-строки в порядке каталога:
//     'dialog' (Грота) → 'dialog:armor_specialist' (Чекан) →
//     'dialog:golem_instructor' (Глыба); хоткеи Digit1..3 — общий
//     механизм src/building-ui.js /^Digit([1-9])$/ по индексу строки.
//     Оверлей Оружейной (ДЕВЯТЬ строк) НЕ затрагивается.
//
// КРАСНЫЕ (TDD): T1..T8 красные до зелёной стадии (000028.json нет,
// каталог 27, ростер Бронника 2, оверлей 2 строки), без краха загрузки.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validateData } = require('./json-schema.js');

const ROOT = path.join(__dirname, '..');
const NDIR = path.join(ROOT, 'assets', 'npc');
const NEW = path.join(NDIR, '000028.json');
const SCHEMA = JSON.parse(
  fs.readFileSync(path.join(NDIR, 'schema.json'), 'utf8'));

const N = require('../src/npc.js');
const { NPCS } = require('../src/npc-data.js');
const BE = require('../src/building-effects.js');

const HOOK = 'Тренирует големоведов: броня — первое оружие';
const ID = 'golem_instructor';
const NAME = 'Глыба';

function listNpcFiles() {
  return fs.readdirSync(NDIR)
    .filter((f) => /^\d{6}\.json$/.test(f))
    .sort();
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// --- T1: размер каталога ---------------------------------------------------

test('T1: каталог — ровно 43 файла 000001..000043 подряд; зеркало NPCS 43 записей с golem_instructor', () => {
  const files = listNpcFiles();
  assert.equal(files.length, 43,
    'в каталоге NPC 43 файла (000320.07: +Отставной наёмник; 000320.08: +Подмастерье; 000320.09: +Специалист по броне; 000320.10: +Наставник-големовед; 000320.11: +Торговец зельями; 000320.12: +Торговка травами; 000320.13: +Алхимик-наставник; 000320.14: +Фельдшер; 000320.15: +Торговец свитками; 000320.16: +Маг-наставник; 000320.17: +Переписчик; 000320.18: +Странствующий торговец; 000320.19: +Торговец специями; 000320.20: +Торговец каравана; 000347.02: +жрец солнца, жрица луны, горный жрец; 000320.21: +Проводник; 000320.22: +Перекати), факт: ' + files.length);
  for (let i = 0; i < files.length; i++) {
    assert.equal(files[i],
      String(i + 1).padStart(6, '0') + '.json',
      'нумерация подряд без пропусков: индекс ' + i);
  }
  assert.equal(NPCS.length, 43,
    'зеркало src/npc-data.js — 43 записей (sync не прогнан?), факт: '
    + NPCS.length);
  const last = NPCS[27];
  assert.ok(last, '28-я запись зеркала существует');
  assert.equal(last.id, ID,
    '28-я запись зеркала — golem_instructor (порядок = нумерация файлов)');
});

// --- T2: 000028.json валиден по схеме + порядок ключей + roundtrip ---------

test('T2: assets/npc/000028.json валиден по schema; ключи в порядке 000005 (обучение после диалога); roundtrip-канон; негативы — мимо схемы', () => {
  assert.ok(fs.existsSync(NEW),
    'RED: assets/npc/000028.json отсутствует (NPC задачи ещё не создан)');
  const data = readJson(NEW);
  assert.deepEqual(validateData(SCHEMA, data, 'npc/000028'), [],
    '000028.json обязан проходить assets/npc/schema.json');
  assert.deepEqual(Object.keys(data),
    ['id', 'имя', 'роль', 'описание', 'постройки', 'диалог', 'обучение'],
    'порядок ключей — как 000005 (id, имя, роль, описание, постройки, '
    + 'диалог, обучение) — профиль обучение');
  const raw = fs.readFileSync(NEW, 'utf8');
  assert.equal(raw, JSON.stringify(data, null, 2) + '\n',
    '000028.json — roundtrip JSON.stringify(obj,null,2)+перевод строки');
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
});

// --- T3: id и имя уникальны (sweep) ----------------------------------------

test('T3: id golem_instructor и имя «Глыба» уникальны в sweep каталога', () => {
  assert.ok(fs.existsSync(NEW), 'RED: assets/npc/000028.json отсутствует');
  const ids = new Set();
  const names = new Set();
  for (const f of listNpcFiles()) {
    const d = readJson(path.join(NDIR, f));
    assert.ok(!ids.has(d.id), 'дубликат id «' + d.id + '» (файл ' + f + ')');
    assert.ok(!names.has(d.имя), 'дубликат имени «' + d.имя + '» (файл ' + f + ')');
    ids.add(d.id);
    names.add(d.имя);
  }
  assert.ok(ids.has(ID), 'id golem_instructor в каталоге');
  assert.ok(names.has(NAME), 'имя «Глыба» в каталоге');
});

// --- T4: роль-фикс, описание с хуком и уникально ----------------------------

test('T4: роль РОВНО «наставник» (точная строка ТЗ; составные «наставник-*» — другие роли; уникальность ролей не контракт); описание непустое, хук «Тренирует големоведов» — последнее предложение, и НЕ копия описания другого NPC', () => {
  assert.ok(fs.existsSync(NEW), 'RED: assets/npc/000028.json отсутствует');
  const data = readJson(NEW);
  assert.ok(typeof data.описание === 'string' && data.описание.trim() !== '',
    'описание непустое');
  assert.equal(data.роль, 'наставник',
    'роль — фикс-строка «наставник» (ТЗ); в каталоге раньше были только '
    + 'составные «наставник-боец/лучник/акробат/мечник» — точное '
    + 'равенство «наставник» свободно');
  assert.ok(data.описание.includes(HOOK),
    'хук истории «' + HOOK + '» (ТЗ) в описании дословно');
  assert.ok(data.описание.endsWith(HOOK + '.'),
    'хук — ПОСЛЕДНЕЕ предложение описания (с заглавной, с точкой на конце — '
    + 'прецеденты .02–.09); факт: ' + JSON.stringify(data.описание.slice(-60)));
  for (const f of listNpcFiles()) {
    if (f === '000028.json') continue;
    const d = readJson(path.join(NDIR, f));
    assert.notEqual(d.описание, data.описание,
      'описание совпадает с ' + f + ' (не копия существующего)');
  }
});

// --- T5: диалог — профиль обучение, без «для» --------------------------------

test('T5: диалог валиден по схеме, ≥1 опция «обучение», действия ⊆ {подсказка, обучение}, ровно одна с {харизма:3}, id опций уникальны, опций с «для» — ровно 0, темы Бронника и .04–.08 не дублируются', () => {
  assert.ok(fs.existsSync(NEW), 'RED: assets/npc/000028.json отсутствует');
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
  assert.ok(data.диалог.some((o) => o.действие === 'обучение'),
    'профиль «обучение» — хотя бы одна опция действия «обучение»');
  assert.equal(
    data.диалог.filter((o) => o.действие !== 'подсказка'
      && o.действие !== 'обучение').length, 0,
    'профиль ОБУЧЕНИЕ (без квестов/торговли/найма): опций с действием '
    + 'вне {подсказка, обучение} — ровно 0');
  const ids = data.диалог.map((o) => o.id);
  assert.equal(new Set(ids).size, ids.length, 'id опций диалога уникальны');
  assert.equal(data.диалог.filter((o) => o.для !== undefined).length, 0,
    'опций с «для» — ровно 0: наставник учит каждого; добавление «для» '
    + 'требует внесения в исключения A8a (tests/npc-dialog-scope) — '
    + 'ослабление пина, запрещено');
  const withReq = data.диалог.filter((o) => o.требования !== undefined);
  assert.equal(withReq.length, 1,
    'ровно одна опция с требованиями (прецедент hint_wood/hint_old/hint_blade/hint_collection/hint_anvil/hint_march/hint_ring)');
  assert.deepEqual(withReq[0].требования, { харизма: 3 },
    'требование опции — {харизма: 3}');
  const texts = data.диалог.map((o) => o.текст).join(' ');
  for (const w of ['хвостовик', 'наковальн', 'штампов', 'коллекци', 'позолот',
    'старые походы', 'арен', 'жалован', 'знамен', 'задаток', 'табель',
    'метл', 'стена клинков',
    'звон', 'дребезг', 'нагрудник', 'закалк', 'трещин', 'молотк', 'примеря']) {
    assert.ok(!texts.includes(w),
      'тема чужого NPC (.04 «старые походы»/арена, .05 коллекция, .06 ковка/'
      + 'хвостовик, .07 наём/жалованье, .08 метла/стена клинков, Грота и '
      + '.09 «звон/закалка/молоток» Бронника) не дублируется: подстрока «'
      + w + '»');
  }
});

// --- T6: блок обучения — форма 000005, golem ∈ assets/skills, зеркало -------

test('T6: блок «обучение» — форма 000005 (ключи навыки/цена_за_уровень/цена_переноса_за_уровень), навыки РОВНО [golem] и резолвится в assets/skills, цены целые > 0; блоков торговля/квесты/найм НЕТ (в JSON и зеркале); зеркало: постройки [2], обучение ≡ JSON', () => {
  assert.ok(fs.existsSync(NEW), 'RED: assets/npc/000028.json отсутствует');
  const data = readJson(NEW);
  const train = data.обучение;
  assert.ok(train && typeof train === 'object',
    'в JSON есть блок «обучение» (профиль обучения)');
  assert.deepEqual(Object.keys(train),
    ['навыки', 'цена_за_уровень', 'цена_переноса_за_уровень'],
    'ключи блока обучения — порядок и состав 000005 (Карк)');
  assert.deepEqual(train.навыки, ['golem'],
    'навыки — РОВНО [golem] (ТЗ: голем-магия); факт: '
    + JSON.stringify(train.навыки));
  const skillDir = path.join(ROOT, 'assets', 'skills');
  const golemFiles = fs.readdirSync(skillDir)
    .filter((f) => /^\d{6}\.json$/.test(f))
    .filter((f) => readJson(path.join(skillDir, f)).id === 'golem');
  assert.equal(golemFiles.length, 1,
    'навык golem существует в assets/skills ровно одним файлом');
  assert.equal(readJson(path.join(skillDir, golemFiles[0])).type,
    'secondary',
    'golem — вторичный навык (свип целостности tests/npc-data.test '
    + '«только вторичные навыки»)');
  for (const key of ['цена_за_уровень', 'цена_переноса_за_уровень']) {
    assert.ok(Number.isInteger(train[key]) && train[key] > 0,
      key + ' — целое > 0 (схема 1..10000), факт: ' + train[key]);
  }
  for (const block of ['квесты', 'торговля', 'найм']) {
    assert.ok(!(block in data),
      'в JSON нет блока «' + block + '»: профиль обучение без торговли/'
      + 'квестов — счётчики npc-refs торговля 57 / goal 2 / reward 5 / '
      + 'сумма 64 / уникальные 41 не растут');
  }
  const mirror = NPCS[27];
  assert.ok(mirror && mirror.id === ID,
    'зеркало: 28-я запись golem_instructor');
  assert.equal(mirror.роль, 'наставник',
    'роль в зеркале — «наставник» (фикс ТЗ)');
  for (const block of ['квесты', 'торговля', 'найм']) {
    assert.ok(!(block in mirror),
      'в зеркале нет блока «' + block + '» (следует из JSON)');
  }
  assert.deepEqual(mirror.обучение, train,
    'зеркало: блок обучения — ПАСС-ЧЕРЕЗ ≡ JSON (навыки уже id-строки, '
    + 'sync не резолвит)');
  assert.deepEqual(mirror.постройки, [2],
    'зеркало: постройки [2] — sync резолвит ссылку Бронника в id');
  assert.deepEqual(mirror.диалог, data.диалог,
    'зеркало NPCS[27].диалог ≡ JSON-диалог бит-в-бит');
  assert.deepEqual(mirror.описание, data.описание,
    'зеркало NPCS[27].описание ≡ JSON');
});

// --- T7: ростер Бронника — ТРИ записи, Грота первая --------------------------

test('T7: npcsForBuilding(NPCS, 2) — ТРИ записи Бронника в порядке каталога [armor_merchant, armor_specialist, golem_instructor]; npcForBuilding(2) — по-прежнему Грота; Оружейная — ДЕВЯТЬ не тронута', () => {
  const list = N.npcsForBuilding(NPCS, 2);
  assert.deepEqual(list.map((n) => n.id),
    ['armor_merchant', 'armor_specialist', ID],
    'Бронник (2): Грота (000002) + Специалист (000027) + Наставник '
    + '(000028), порядок = нумерация файлов; факт: '
    + JSON.stringify(list.map((n) => n.id)));
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

// --- T8: оверлей Бронника — ровно 3 dialog-строки -----------------------------

test('T8: [E]-оверлей Бронника — ровно 3 строки: dialog (Грота), dialog:armor_specialist (Чекан), dialog:golem_instructor (Глыба)', () => {
  const b = readJson(path.join(ROOT, 'assets', 'buildings', 'armor_shop.json'));
  const list = N.npcsForBuilding(NPCS, 2);
  const rows = BE.buildingActions(b, list, { day: 5 });
  assert.deepEqual(rows.map((r) => r.id),
    ['dialog', 'dialog:armor_specialist', 'dialog:' + ID],
    'у здания 2 эффектов нет — список = dialog-строки по каждому NPC; '
    + 'факт: ' + JSON.stringify(rows.map((r) => r.id)));
  assert.deepEqual(rows.map((r) => r.имя),
    ['Диалог: Грота', 'Диалог: Чекан', 'Диалог: ' + NAME],
    'подписи — «Диалог: <имя>», факт: ' + JSON.stringify(rows.map((r) => r.имя)));
  assert.deepEqual(rows.map((r) => r.npcId),
    ['armor_merchant', 'armor_specialist', ID],
    'каждая строка несёт npcId своего NPC (роутинг клика); хоткеи '
    + 'Digit1..3 — общий механизм /^Digit([1-9])$/ (src/building-ui.js) '
    + 'по индексу строки');
});

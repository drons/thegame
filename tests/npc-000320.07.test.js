// Задача 000320.07: «Горм» — отставной наёмник (Оружейная, 8-й NPC
// постройки; 7-я из 100 дочерних 000320).
//
// Контракт (ТЗ tasks/done/000320.07.md; механизм мульти-NPC —
// 000320.01, spec/npc.md «Несколько NPC на постройку»,
// memory/000320-npcs-batch.md):
//   * assets/npc/000025.json — id ex_mercenary, имя «Горм», роль
//     «отставной наёмник» (фикс), постройка assets/buildings/000001.json
//     (Оружейная — восьмая связь), хук истории «Ушёл из наёма из-за
//     ссоры о жалованье» (последнее предложение описания, с заглавной
//     — прецеденты .02 «Учит»/.03 «Ищет»/.04 «Помнит»/.05 «Собирает»);
//   * профиль — ЧИСТАЯ подсказка: все опции диалога действуют
//     «подсказка»; блоков квесты/торговля/обучение/найм НЕТ (счётчики
//     npc-refs goal 2 / reward 5 / trade 54 / сумма 61 / уникальные
//     предметы 41 от этого НЕ растут — ЭТО часть контракта);
//   * опций с «для» — РОВНО 0: наёмник говорит со всеми (прецеденты
//     .01/.02/.03/.05); контракт A8a (tests/npc-dialog-scope) —
//     добавление «для» потребовало бы ре-пина A8a;
//   * тема диалога — наём/походы/жалованье в ПРОШЕДШЕМ времени; темы
//     клинков/коллекции (.05: «хвостовик», «клинки коллекции») и старых
//     походов/арены (.04: «старые походы», «арена у склепа») НЕ
//     дублируются дословно;
//   * [E]-оверлей Оружейной — ВОСЕМЬ dialog-строк в порядке каталога:
//     'dialog' (Бренн) → 'dialog:blade_merchant' (Корд) →
//     'dialog:fencing_instructor' (Родар) → 'dialog:duelist' (Скарн) →
//     'dialog:veteran_blade' (Боримир) → 'dialog:sword_collector'
//     (Рарог) → 'dialog:blade_smith' (Дарн) → 'dialog:ex_mercenary'
//     (Горм), с 000320.08 — ДЕВЯТЬ (+'dialog:armory_apprentice',
//     Опилка); хоткеи Digit1..9 — общий механизм src/building-ui.js
//     /^Digit([1-9])$/ по индексу строки: ДЕВЯТЫЙ — последний
//     свободный цифровой слот.
//
// КРАСНЫЕ (TDD): T1..T8 красные до зелёной стадии (000025.json нет,
// каталог 24, оверлей 7 строк), без краха загрузки.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validateData } = require('./json-schema.js');

const ROOT = path.join(__dirname, '..');
const NDIR = path.join(ROOT, 'assets', 'npc');
const NEW = path.join(NDIR, '000025.json');
const SCHEMA = JSON.parse(
  fs.readFileSync(path.join(NDIR, 'schema.json'), 'utf8'));

const N = require('../src/npc.js');
const { NPCS } = require('../src/npc-data.js');
const BE = require('../src/building-effects.js');

const HOOK = 'Ушёл из наёма из-за ссоры о жалованье';
const ID = 'ex_mercenary';
const NAME = 'Горм';

function listNpcFiles() {
  return fs.readdirSync(NDIR)
    .filter((f) => /^\d{6}\.json$/.test(f))
    .sort();
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// --- T1: размер каталога ---------------------------------------------------

test('T1: каталог — ровно 29 файл 000001..000029 подряд; зеркало NPCS 29 запись с ex_mercenary', () => {
  const files = listNpcFiles();
  assert.equal(files.length, 29,
    'в каталоге NPC 29 файл (000320.06: +Оружейник; 000320.07: +Отставной наёмник; 000320.08: +Подмастерье; 000320.09: +Специалист по броне; 000320.10: +Наставник-големовед; 000320.11: +Торговец зельями), факт: ' + files.length);
  for (let i = 0; i < files.length; i++) {
    assert.equal(files[i],
      String(i + 1).padStart(6, '0') + '.json',
      'нумерация подряд без пропусков: индекс ' + i);
  }
  assert.equal(NPCS.length, 29,
    'зеркало src/npc-data.js — 29 запись (sync не прогнан?), факт: '
    + NPCS.length);
  const last = NPCS[24];
  assert.ok(last, '25-я запись зеркала существует');
  assert.equal(last.id, ID,
    '25-я запись зеркала — ex_mercenary (порядок = нумерация файлов)');
});

// --- T2: 000025.json валиден по схеме + порядок ключей + roundtrip ---------

test('T2: assets/npc/000025.json валиден по schema; ключи в порядке образца; roundtrip-канон; негативы — мимо схемы', () => {
  assert.ok(fs.existsSync(NEW),
    'RED: assets/npc/000025.json отсутствует (NPC задачи ещё не создан)');
  const data = readJson(NEW);
  assert.deepEqual(validateData(SCHEMA, data, 'npc/000025'), [],
    '000025.json обязан проходить assets/npc/schema.json');
  assert.deepEqual(Object.keys(data),
    ['id', 'имя', 'роль', 'описание', 'постройки', 'диалог'],
    'порядок ключей — как 000001/000020/000023 (id, имя, роль, описание, '
    + 'постройки, диалог) — профиль чистая подсказка, без блоков');
  const raw = fs.readFileSync(NEW, 'utf8');
  assert.equal(raw, JSON.stringify(data, null, 2) + '\n',
    '000025.json — roundtrip JSON.stringify(obj,null,2)+перевод строки');
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
});

// --- T3: id и имя уникальны (sweep) ----------------------------------------

test('T3: id ex_mercenary и имя «Горм» уникальны в sweep каталога', () => {
  assert.ok(fs.existsSync(NEW), 'RED: assets/npc/000025.json отсутствует');
  const ids = new Set();
  const names = new Set();
  for (const f of listNpcFiles()) {
    const d = readJson(path.join(NDIR, f));
    assert.ok(!ids.has(d.id), 'дубликат id «' + d.id + '» (файл ' + f + ')');
    assert.ok(!names.has(d.имя), 'дубликат имени «' + d.имя + '» (файл ' + f + ')');
    ids.add(d.id);
    names.add(d.имя);
  }
  assert.ok(ids.has(ID), 'id ex_mercenary в каталоге');
  assert.ok(names.has(NAME), 'имя «Горм» в каталоге');
});

// --- T4: описание с хуком и уникально ---------------------------------------

test('T4: описание Горма непустое, с хуком «Ушёл из наёма» и НЕ копия описания другого NPC', () => {
  assert.ok(fs.existsSync(NEW), 'RED: assets/npc/000025.json отсутствует');
  const data = readJson(NEW);
  assert.ok(typeof data.описание === 'string' && data.описание.trim() !== '',
    'описание непустое');
  assert.ok(data.описание.includes(HOOK),
    'хук истории «' + HOOK + '» (ТЗ) в описании дословно');
  for (const f of listNpcFiles()) {
    if (f === '000025.json') continue;
    const d = readJson(path.join(NDIR, f));
    assert.notEqual(d.описание, data.описание,
      'описание совпадает с ' + f + ' (не копия существующего)');
  }
});

// --- T5: диалог — профиль чистая подсказка, без «для» ------------------------

test('T5: диалог валиден по схеме, ВСЕ опции «подсказка», ровно одна с {харизма:3}, id опций уникальны, опций с «для» — ровно 0', () => {
  assert.ok(fs.existsSync(NEW), 'RED: assets/npc/000025.json отсутствует');
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
  assert.ok(data.диалог.some((o) => o.действие === 'подсказка'),
    'профиль «подсказка» — хотя бы одна опция действия «подсказка»');
  assert.equal(data.диалог.filter((o) => o.действие !== 'подсказка').length, 0,
    'профиль ЧИСТАЯ подсказка: опций с действием вне «подсказка» — ровно 0');
  const ids = data.диалог.map((o) => o.id);
  assert.equal(new Set(ids).size, ids.length, 'id опций диалога уникальны');
  assert.equal(data.диалог.filter((o) => o.для !== undefined).length, 0,
    'опций с «для» — ровно 0: наёмник говорит со всеми; добавление «для» '
    + 'требует ре-пина A8a (tests/npc-dialog-scope)');
  const withReq = data.диалог.filter((o) => o.требования !== undefined);
  assert.equal(withReq.length, 1,
    'ровно одна опция с требованиями (прецедент hint_wood у Родара)');
  assert.deepEqual(withReq[0].требования, { харизма: 3 },
    'требование опции — {харизма: 3} (прецедент hint_wood/hint_old/hint_collection)');
});

// --- T6: профиль-гарант — блоков профильных НЕТ, зеркало ≡ JSON --------------

test('T6: блоков квесты/торговля/обучение/найм НЕТ (ни в JSON, ни в зеркале); зеркало ≡ JSON без квестового резолвинга: постройки [1], диалог deepEqual', () => {
  assert.ok(fs.existsSync(NEW), 'RED: assets/npc/000025.json отсутствует');
  const data = readJson(NEW);
  for (const block of ['квесты', 'торговля', 'обучение', 'найм']) {
    assert.ok(!(block in data),
      'в JSON нет блока «' + block + '»: профиль чистая подсказка — '
      + 'счётчики npc-refs goal 2 / reward 5 / trade 54 / сумма 61 / '
      + 'уникальные предметы 41 не растут');
  }
  assert.ok(!JSON.stringify(data).includes('assets/items'),
    'в JSON нет ссылок assets/items (ни торговли, ни квестов) — goal 2 / '
    + 'reward 5 / trade 54 / сумма 61 / unique 41 БЕЗ изменений');
  const mirror = NPCS[24];
  assert.ok(mirror && mirror.id === ID,
    'зеркало: 25-я запись ex_mercenary');
  assert.equal(mirror.роль, 'отставной наёмник',
    'роль в зеркале — «отставной наёмник» (фикс ТЗ); раз блоков нет, '
    + 'инвариант npc-refs goal 2 / reward 5 / trade 54 / сумма 61 / '
    + 'unique 41 неизменен');
  for (const block of ['квесты', 'торговля', 'обучение', 'найм']) {
    assert.ok(!(block in mirror),
      'в зеркале нет блока «' + block + '» (следует из JSON)');
  }
  assert.deepEqual(mirror.постройки, [1],
    'зеркало: постройки [1] — sync резолвит ссылку Оружейной в id');
  assert.deepEqual(mirror.диалог, data.диалог,
    'зеркало NPCS[24].диалог ≡ JSON-диалог бит-в-бит (квестового '
    + 'резолвинга нет — квестов нет)');
  assert.deepEqual(mirror.описание, data.описание,
    'зеркало NPCS[24].описание ≡ JSON');
});

// --- T7: ростер Оружейной — ДЕВЯТЬ NPC в порядке каталога -------------------

test('T7: npcsForBuilding(NPCS, 1) — ДЕВЯТЬ NPC Оружейной в порядке каталога', () => {
  const list = N.npcsForBuilding(NPCS, 1);
  assert.deepEqual(list.map((n) => n.id),
    ['weapons_merchant', 'blade_merchant', 'fencing_instructor',
      'duelist', 'veteran_blade', 'sword_collector', 'blade_smith', ID,
      'armory_apprentice'],
    'Оружейная (1): Бренн + Корд + Родар + Скарн + Боримир + Рарог + '
    + 'Дарн + Горм + Опилка, порядок = нумерация файлов; факт: '
    + JSON.stringify(list.map((n) => n.id)));
  assert.equal(N.npcForBuilding(NPCS, 1).id, 'weapons_merchant',
    'npcForBuilding — ПЕРВЫЙ (бит-в-бит, HUD/«Здесь:» не тронуты)');
});

// --- T8: оверлей Оружейной — ровно 9 dialog-строк ----------------------------

test('T8: [E]-оверлей Оружейной — ровно 9 строк: dialog (Бренн), dialog:blade_merchant (Корд), dialog:fencing_instructor (Родар), dialog:duelist (Скарн), dialog:veteran_blade (Боримир), dialog:sword_collector (Рарог), dialog:blade_smith (Дарн), dialog:ex_mercenary (Горм), dialog:armory_apprentice (Опилка)', () => {
  const b = readJson(path.join(ROOT, 'assets', 'buildings', '000001.json'));
  const list = N.npcsForBuilding(NPCS, 1);
  const rows = BE.buildingActions(b, list, { day: 5 });
  assert.deepEqual(rows.map((r) => r.id),
    ['dialog', 'dialog:blade_merchant', 'dialog:fencing_instructor',
      'dialog:duelist', 'dialog:veteran_blade', 'dialog:sword_collector',
      'dialog:blade_smith', 'dialog:' + ID, 'dialog:armory_apprentice'],
    'у здания 1 эффектов нет — список = dialog-строки по каждому NPC; '
    + 'факт: ' + JSON.stringify(rows.map((r) => r.id)));
  assert.deepEqual(rows.map((r) => r.имя),
    ['Диалог: Бренн', 'Диалог: Корд', 'Диалог: Родар', 'Диалог: Скарн',
      'Диалог: Боримир', 'Диалог: Рарог', 'Диалог: Дарн', 'Диалог: ' + NAME,
      'Диалог: Опилка'],
    'подписи — «Диалог: <имя>», факт: ' + JSON.stringify(rows.map((r) => r.имя)));
  assert.deepEqual(rows.map((r) => r.npcId),
    ['weapons_merchant', 'blade_merchant', 'fencing_instructor',
      'duelist', 'veteran_blade', 'sword_collector', 'blade_smith', ID,
      'armory_apprentice'],
    'каждая строка несёт npcId своего NPC (роутинг клика)');
});

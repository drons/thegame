// Задача 000320.03: «Скарн» — дуэлянт (Оружейная, 4-й NPC постройки;
// 3-я из 100 дочерних 000320).
//
// Контракт (ТЗ tasks/done/000320.03.md; механизм мульти-NPC —
// 000320.01, spec/npc.md «Несколько NPC на постройку»,
// memory/000320-npcs-batch.md):
//   * assets/npc/000021.json — id duelist, имя «Скарн», роль
//     «дуэлянт» (фикс), постройка assets/buildings/weapons_shop.json
//     (Оружейная — четвёртая связь), хук истории «Ищет дуэли — не
//     с героем, а на арене»;
//   * профиль — квесты: ≥1 опция диалога «квесты» + блок квесты
//     1–2 записи (формат 000009/000010.json): цель kill_group
//     {группа ∈ MOB_GROUP_TYPES без NONE} или bring_item {предмет ∈
//     фактических assets/items}; награды ненулевые;
//   * опций с «для» — РОВНО 0: дуэлянт вызывает на поединок каждого;
//     контракт A8a (tests/npc-dialog-scope) — добавление «для»
//     потребовало бы ре-пина A8a;
//   * [E]-оверлей Оружейной — ЧЕТЫРЕ dialog-строки в порядке
//     каталога: 'dialog' (Бренн) → 'dialog:blade_merchant' (Корд) →
//     'dialog:fencing_instructor' (Родар) → 'dialog:duelist' (Скарн);
//     с 000320.04 — ПЯТЬ (+'dialog:veteran_blade', Боримир),
//     с 000320.05 — ШЕСТЬ (+'dialog:sword_collector', Рарог),
//     с 000320.06 — СЕМЬ (+'dialog:blade_smith', Дарн),
//     с 000320.07 — ВОСЕМЬ (+'dialog:ex_mercenary', Горм),
//     с 000320.08 — ДЕВЯТЬ (+'dialog:armory_apprentice', Опилка).
//
// КРАСНЫЕ (TDD): T1..T8 красные до зелёной стадии (000021.json нет,
// каталог 20, оверлей 3 строки), без краха загрузки.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validateData } = require('./json-schema.js');

const ROOT = path.join(__dirname, '..');
const NDIR = path.join(ROOT, 'assets', 'npc');
const NEW = path.join(NDIR, '000021.json');
const SCHEMA = JSON.parse(
  fs.readFileSync(path.join(NDIR, 'schema.json'), 'utf8'));

const N = require('../src/npc.js');
const { NPCS } = require('../src/npc-data.js');
const { MOB_GROUP_TYPES } = require('../src/map.js');
const BE = require('../src/building-effects.js');

const HOOK = 'Ищет дуэли — не с героем, а на арене';

function listNpcFiles() {
  return fs.readdirSync(NDIR)
    .filter((f) => /^\d{6}\.json$/.test(f))
    .sort();
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function listItemRefs() {
  const refs = new Set();
  for (const f of fs.readdirSync(path.join(ROOT, 'assets', 'items'))) {
    if (/^\d{6}\.json$/.test(f)) refs.add('assets/items/' + f);
  }
  return refs;
}

// --- T1: размер каталога ---------------------------------------------------

test('T1: каталог — ровно 45 файлов 000001..000045 подряд; зеркало NPCS 45 записей с duelist', () => {
  const files = listNpcFiles();
  assert.equal(files.length, 45,
    'в каталоге NPC 45 файлов (000320.03: +Скарн; 000320.04: +Ветеран; 000320.05: +Коллекционер; 000320.06: +Оружейник; 000320.07: +Отставной наёмник; 000320.08: +Подмастерье; 000320.09: +Специалист по броне; 000320.10: +Наставник-големовед; 000320.11: +Торговец зельями; 000320.12: +Торговка травами; 000320.13: +Алхимик-наставник; 000320.14: +Фельдшер; 000320.15: +Торговец свитками; 000320.16: +Маг-наставник; 000320.17: +Переписчик; 000320.18: +Странствующий торговец; 000320.19: +Торговец специями; 000320.20: +Торговец каравана; 000347.02: +жрец солнца, жрица луны, горный жрец; 000320.21: +Проводник; 000320.22: +Перекати; 000320.23: +Сарбон; 000320.24: +Просол), факт: ' + files.length);
  for (let i = 0; i < files.length; i++) {
    assert.equal(files[i],
      String(i + 1).padStart(6, '0') + '.json',
      'нумерация подряд без пропусков: индекс ' + i);
  }
  assert.equal(NPCS.length, 45,
    'зеркало src/npc-data.js — 45 записей (sync не прогнан?), факт: '
    + NPCS.length);
  const last = NPCS[20];
  assert.ok(last, '21-я запись зеркала существует');
  assert.equal(last.id, 'duelist',
    '21-я запись зеркала — duelist (порядок = нумерация файлов)');
});

// --- T2: 000021.json валиден по схеме + порядок ключей + roundtrip ---------

test('T2: assets/npc/000021.json валиден по schema; ключи в порядке образца; roundtrip-канон; негативы — мимо схемы', () => {
  assert.ok(fs.existsSync(NEW),
    'RED: assets/npc/000021.json отсутствует (NPC задачи ещё не создан)');
  const data = readJson(NEW);
  assert.deepEqual(validateData(SCHEMA, data, 'npc/000021'), [],
    '000021.json обязан проходить assets/npc/schema.json');
  assert.deepEqual(Object.keys(data),
    ['id', 'имя', 'роль', 'описание', 'постройки', 'диалог', 'квесты'],
    'порядок ключей — как 000001/000009 (id, имя, роль, описание, '
    + 'постройки, диалог, квесты)');
  const raw = fs.readFileSync(NEW, 'utf8');
  assert.equal(raw, JSON.stringify(data, null, 2) + '\n',
    '000021.json — roundtrip JSON.stringify(obj,null,2)+перевод строки');
  const extraKey = JSON.parse(JSON.stringify(data));
  extraKey.цена = 10;
  assert.notDeepEqual(validateData(SCHEMA, extraKey, 'npc/extra'), [],
    'посторонний ключ «цена» — additionalProperties false, обязан отваливаться');
  const badGroup = JSON.parse(JSON.stringify(data));
  badGroup.квесты[0].цель = { тип: 'kill_group', группа: 7, количество: 1 };
  assert.notDeepEqual(validateData(SCHEMA, badGroup, 'npc/badgroup'), [],
    'цель kill_group группа 7 — вне схемы (integer 0..6)');
  const badCount = JSON.parse(JSON.stringify(data));
  badCount.квесты[0].цель = { тип: 'kill_group', группа: 2, количество: 0 };
  assert.notDeepEqual(validateData(SCHEMA, badCount, 'npc/badcount'), [],
    'цель kill_group количество 0 — вне схемы (integer 1..99)');
  const badGold = JSON.parse(JSON.stringify(data));
  badGold.квесты[0].награда.золото = -1;
  assert.notDeepEqual(validateData(SCHEMA, badGold, 'npc/badgold'), [],
    'награда золото -1 — вне схемы (minimum 0)');
});

// --- T3: id и имя уникальны (sweep) ----------------------------------------

test('T3: id duelist и имя «Скарн» уникальны в sweep каталога', () => {
  assert.ok(fs.existsSync(NEW), 'RED: assets/npc/000021.json отсутствует');
  const ids = new Set();
  const names = new Set();
  for (const f of listNpcFiles()) {
    const d = readJson(path.join(NDIR, f));
    assert.ok(!ids.has(d.id), 'дубликат id «' + d.id + '» (файл ' + f + ')');
    assert.ok(!names.has(d.имя), 'дубликат имени «' + d.имя + '» (файл ' + f + ')');
    ids.add(d.id);
    names.add(d.имя);
  }
  assert.ok(ids.has('duelist'), 'id duelist в каталоге');
  assert.ok(names.has('Скарн'), 'имя «Скарн» в каталоге');
});

// --- T4: описание с хуком и уникально ---------------------------------------

test('T4: описание Скарна непустое, с хуком «Ищет дуэли» и НЕ копия описания другого NPC', () => {
  assert.ok(fs.existsSync(NEW), 'RED: assets/npc/000021.json отсутствует');
  const data = readJson(NEW);
  assert.ok(typeof data.описание === 'string' && data.описание.trim() !== '',
    'описание непустое');
  assert.ok(data.описание.includes(HOOK),
    'хук истории «' + HOOK + '» (ТЗ) в описании дословно');
  for (const f of listNpcFiles()) {
    if (f === '000021.json') continue;
    const d = readJson(path.join(NDIR, f));
    assert.notEqual(d.описание, data.описание,
      'описание совпадает с ' + f + ' (не копия существующего)');
  }
});

// --- T5: диалог — профиль квесты, без «для» ----------------------------------

test('T5: диалог валиден по схеме, ≥1 опция «квесты», id опций уникальны, опций с «для» — ровно 0', () => {
  assert.ok(fs.existsSync(NEW), 'RED: assets/npc/000021.json отсутствует');
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
  assert.ok(data.диалог.some((o) => o.действие === 'квесты'),
    'профиль «квесты» — опция действия «квесты» обязательна');
  const ids = data.диалог.map((o) => o.id);
  assert.equal(new Set(ids).size, ids.length, 'id опций диалога уникальны');
  assert.equal(data.диалог.filter((o) => o.для !== undefined).length, 0,
    'опций с «для» — ровно 0: дуэлянт вызывает каждого; добавление «для» '
    + 'требует ре-пина A8a (tests/npc-dialog-scope)');
});

// --- T6: блок квесты — цели/награды по факту каталога, зеркало ---------------

test('T6: квесты — 1..2 записи; цели ∈ MOB_GROUP_TYPES/фактических assets/items (sweep), награды ненулевые, цепочка, зеркало ≡ JSON', () => {
  assert.ok(fs.existsSync(NEW), 'RED: assets/npc/000021.json отсутствует');
  const data = readJson(NEW);
  assert.ok(Array.isArray(data.квесты)
    && data.квесты.length >= 1 && data.квесты.length <= 2,
    'блок квесты — 1..2 записи (ТЗ), факт: '
    + JSON.stringify((data.квесты || []).length));
  const groups = new Set(
    Object.values(MOB_GROUP_TYPES).filter((v) => v >= 0));
  const items = listItemRefs();
  const seen = new Set();
  const order = [];
  for (const q of data.квесты) {
    assert.deepEqual(validateData(SCHEMA.properties.квесты.items, q, 'квест'),
      [], 'квест «' + q.id + '» — вне схемы: ' + JSON.stringify(
        validateData(SCHEMA.properties.квесты.items, q, 'квест')));
    assert.ok(!seen.has(q.id), 'id квеста «' + q.id + '» дублируется в файле');
    seen.add(q.id);
    if (q.цель.тип === 'kill_group') {
      assert.ok(groups.has(q.цель.группа),
        'квест «' + q.id + '»: группа ' + q.цель.группа
        + ' вне значений MOB_GROUP_TYPES (src/map.js, без NONE)');
    } else {
      assert.ok(items.has(q.цель.предмет),
        'квест «' + q.id + '»: предмет цели ' + q.цель.предмет
        + ' отсутствует в каталоге assets/items (sweep по диску)');
    }
    assert.ok(Number.isInteger(q.цель.количество)
      && q.цель.количество >= 1 && q.цель.количество <= 99,
      'квест «' + q.id + '»: количество цели — целое 1..99');
    const nag = q.награда;
    assert.ok(Number.isInteger(nag.опыт) && nag.опыт >= 0
      && Number.isInteger(nag.золото) && nag.золото >= 0,
      'квест «' + q.id + '»: опыт/золото награды — целые ≥0');
    assert.ok(nag.опыт > 0 || nag.золото > 0
      || ((nag.предметы || []).length > 0),
      'квест «' + q.id + '»: награда ненулевая (опыт>0 ИЛИ золото>0'
      + ' ИЛИ предметы)');
    for (const r of nag.предметы || []) {
      assert.ok(items.has(r.предмет),
        'квест «' + q.id + '»: предмет награды ' + r.предмет
        + ' отсутствует в каталоге assets/items (sweep по диску)');
    }
    if (q.предыдущий !== null && q.предыдущий !== undefined) {
      assert.ok(order.includes(q.предыдущий),
        'квест «' + q.id + '»: предыдущий «' + q.предыдущий
        + '» — id ПРЕДЫДУЩЕГО по порядку квеста этого же NPC');
    }
    order.push(q.id);
  }
  const mirror = NPCS[20];
  assert.ok(mirror && mirror.id === 'duelist',
    'зеркало: 21-я запись duelist');
  // В зеркале ссылки-предметы квестов — id цели (конвенция sync-npc-data:
  // путь в assets, id в src; прецедент orc_raid: награда «healing_potion»)
  const expected = JSON.parse(JSON.stringify(data.квесты));
  for (const q of expected) {
    if (q.цель.тип === 'bring_item') {
      q.цель.предмет = readJson(path.join(ROOT, q.цель.предмет)).id;
    }
    for (const r of (q.награда || {}).предметы || []) {
      r.предмет = readJson(path.join(ROOT, r.предмет)).id;
    }
  }
  assert.deepEqual(mirror.квесты, expected,
    'зеркало NPCS[20].квесты — тот же блок, что в JSON, со ссылками-'
    + 'предметами, резолвленными в id');
});

// --- T7: ростер Оружейной — ДЕВЯТЬ NPC в порядке каталога --------------------

test('T7: npcsForBuilding(NPCS, 1) — ДЕВЯТЬ NPC Оружейной в порядке каталога', () => {
  const list = N.npcsForBuilding(NPCS, 1);
  assert.deepEqual(list.map((n) => n.id),
    ['weapons_merchant', 'blade_merchant', 'fencing_instructor', 'duelist',
      'veteran_blade', 'sword_collector', 'blade_smith', 'ex_mercenary',
      'armory_apprentice'],
    'Оружейная (1): Бренн + Корд + Родар + Скарн + Боримир + Рарог + Дарн + Горм + Опилка, порядок = '
    + 'файлов; факт: ' + JSON.stringify(list.map((n) => n.id)));
  assert.equal(N.npcForBuilding(NPCS, 1).id, 'weapons_merchant',
    'npcForBuilding — ПЕРВЫЙ (бит-в-бит, HUD/«Здесь:» не тронуты)');
});

// --- T8: оверлей Оружейной — ровно 9 dialog-строк ----------------------------

test('T8: [E]-оверлей Оружейной — ровно 9 строк: dialog (Бренн), dialog:blade_merchant (Корд), dialog:fencing_instructor (Родар), dialog:duelist (Скарн), dialog:veteran_blade (Боримир), dialog:sword_collector (Рарог), dialog:blade_smith (Дарн), dialog:ex_mercenary (Горм), dialog:armory_apprentice (Опилка)', () => {
  const b = readJson(path.join(ROOT, 'assets', 'buildings', 'weapons_shop.json'));
  const list = N.npcsForBuilding(NPCS, 1);
  const rows = BE.buildingActions(b, list, { day: 5 });
  assert.deepEqual(rows.map((r) => r.id),
    ['dialog', 'dialog:blade_merchant', 'dialog:fencing_instructor',
      'dialog:duelist', 'dialog:veteran_blade', 'dialog:sword_collector',
      'dialog:blade_smith', 'dialog:ex_mercenary',
      'dialog:armory_apprentice'],
    'у здания 1 эффектов нет — список = dialog-строки по каждому NPC; '
    + 'факт: ' + JSON.stringify(rows.map((r) => r.id)));
  assert.deepEqual(rows.map((r) => r.имя),
    ['Диалог: Бренн', 'Диалог: Корд', 'Диалог: Родар', 'Диалог: Скарн',
      'Диалог: Боримир', 'Диалог: Рарог', 'Диалог: Дарн', 'Диалог: Горм',
      'Диалог: Опилка'],
    'подписи — «Диалог: <имя>», факт: ' + JSON.stringify(rows.map((r) => r.имя)));
  assert.deepEqual(rows.map((r) => r.npcId),
    ['weapons_merchant', 'blade_merchant', 'fencing_instructor', 'duelist',
      'veteran_blade', 'sword_collector', 'blade_smith', 'ex_mercenary',
      'armory_apprentice'],
    'каждая строка несёт npcId своего NPC (роутинг клика)');
});

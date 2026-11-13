// Задача 000320.06: «Дарн» — оружейник-кузнец (Оружейная, 7-й NPC
// постройки; 6-я из 100 дочерних 000320).
//
// Контракт (ТЗ tasks/done/000320.06.md; механизм мульти-NPC —
// 000320.01, spec/npc.md «Несколько NPC на постройку»,
// memory/000320-npcs-batch.md):
//   * assets/npc/000024.json — id blade_smith, имя «Дарн», роль
//     «оружейник» (фикс), постройка assets/buildings/weapons_shop.json
//     (Оружейная — седьмая связь), хук истории «Точит клинки сам;
//     торгует тем, на что не хватает времени»;
//   * профиль — ТОРГОВЛЯ (без квестов): ≥1 опций с действием
//     «торговля»; блоков квесты/обучение/найм НЕТ (счётчики npc-refs
//     goal 2 / reward 5 НЕ растут; trade 51 → 54 — три меча Дарна,
//     уникальные предметы 41 — мечи уже в множестве);
//   * торговля — 3 меча каталога (000001/000002/000003, формат
//     000322: base_price в JSON предмета, mult_покупки при 1 — ключа
//     нет), количества 1..99 (schema);
//   * опций с «для» — РОВНО 0: кузнец торгует с каждым; контракт A8a
//     (tests/npc-dialog-scope) — добавление «для» потребовало бы
//     ре-пина A8a;
//   * [E]-оверлей Оружейной — СЕМЬ dialog-строк в порядке каталога:
//     'dialog' (Бренн) → 'dialog:blade_merchant' (Корд) →
//     'dialog:fencing_instructor' (Родар) → 'dialog:duelist' (Скарн)
//     → 'dialog:veteran_blade' (Боримир) → 'dialog:sword_collector'
//     (Рарог) → 'dialog:blade_smith' (Дарн); с 000320.07 — ВОСЕМЬ
//     (+'dialog:ex_mercenary', Горм), с 000320.08 — ДЕВЯТЬ
//     (+'dialog:armory_apprentice', Опилка).
//
// КРАСНЫЕ (TDD): T1..T9 красные до зелёной стадии (000024.json нет,
// каталог 23, оверлей 6 строк), без краха загрузки.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validateData } = require('./json-schema.js');

const ROOT = path.join(__dirname, '..');
const NDIR = path.join(ROOT, 'assets', 'npc');
const NEW = path.join(NDIR, '000024.json');
const SCHEMA = JSON.parse(
  fs.readFileSync(path.join(NDIR, 'schema.json'), 'utf8'));

const N = require('../src/npc.js');
const { NPCS } = require('../src/npc-data.js');
const BE = require('../src/building-effects.js');

const HOOK = 'Точит клинки сам; торгует тем, на что не хватает времени';
const ID = 'blade_smith';
const NAME = 'Дарн';

function listNpcFiles() {
  return fs.readdirSync(NDIR)
    .filter((f) => /^\d{6}\.json$/.test(f))
    .sort();
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// --- T1: размер каталога ---------------------------------------------------

test('T1: каталог — ровно 45 файлов 000001..000045 подряд; зеркало NPCS 45 записей с blade_smith', () => {
  const files = listNpcFiles();
  assert.equal(files.length, 45,
    'в каталоге NPC 45 файлов (000320.06: +Оружейник; 000320.07: +Отставной наёмник; 000320.08: +Подмастерье; 000320.09: +Специалист по броне; 000320.10: +Наставник-големовед; 000320.11: +Торговец зельями; 000320.12: +Торговка травами; 000320.13: +Алхимик-наставник; 000320.14: +Фельдшер; 000320.15: +Торговец свитками; 000320.16: +Маг-наставник; 000320.17: +Переписчик; 000320.18: +Странствующий торговец; 000320.19: +Торговец специями; 000320.20: +Торговец каравана; 000347.02: +жрец солнца, жрица луны, горный жрец; 000320.21: +Проводник; 000320.22: +Перекати; 000320.23: +Сарбон; 000320.24: +Просол), факт: ' + files.length);
  for (let i = 0; i < files.length; i++) {
    assert.equal(files[i],
      String(i + 1).padStart(6, '0') + '.json',
      'нумерация подряд без пропусков: индекс ' + i);
  }
  assert.equal(NPCS.length, 45,
    'зеркало src/npc-data.js — 45 записей (sync не прогнан?), факт: '
    + NPCS.length);
  const last = NPCS[23];
  assert.ok(last, '24-я запись зеркала существует');
  assert.equal(last.id, ID,
    '24-я запись зеркала — blade_smith (порядок = нумерация файлов)');
});

// --- T2: 000024.json валиден по схеме + порядок ключей + roundtrip ---------

test('T2: assets/npc/000024.json валиден по schema; ключи в порядке 000001/000019 (торговля после диалога); roundtrip-канон; негативы — мимо схемы', () => {
  assert.ok(fs.existsSync(NEW),
    'RED: assets/npc/000024.json отсутствует (NPC задачи ещё не создан)');
  const data = readJson(NEW);
  assert.deepEqual(validateData(SCHEMA, data, 'npc/000024'), [],
    '000024.json обязан проходить assets/npc/schema.json');
  assert.deepEqual(Object.keys(data),
    ['id', 'имя', 'роль', 'описание', 'постройки', 'диалог', 'торговля'],
    'порядок ключей — как 000001/000019 (id, имя, роль, описание, '
    + 'постройки, диалог, торговля) — профиль торговля');
  const raw = fs.readFileSync(NEW, 'utf8');
  assert.equal(raw, JSON.stringify(data, null, 2) + '\n',
    '000024.json — roundtrip JSON.stringify(obj,null,2)+перевод строки');
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
    предмет: 'assets/items/000001.json',
    цена_покупки: 10, цена_продажи: 6, количество: 1,
  };
  assert.notDeepEqual(validateData(SCHEMA, legacyEntry, 'npc/legacy'), [],
    'legacy-вход торговли (цена_покупки/цена_продажи) — невалиден (000322)');
});

// --- T3: id и имя уникальны (sweep) ----------------------------------------

test('T3: id blade_smith и имя «Дарн» уникальны в sweep каталога', () => {
  assert.ok(fs.existsSync(NEW), 'RED: assets/npc/000024.json отсутствует');
  const ids = new Set();
  const names = new Set();
  for (const f of listNpcFiles()) {
    const d = readJson(path.join(NDIR, f));
    assert.ok(!ids.has(d.id), 'дубликат id «' + d.id + '» (файл ' + f + ')');
    assert.ok(!names.has(d.имя), 'дубликат имени «' + d.имя + '» (файл ' + f + ')');
    ids.add(d.id);
    names.add(d.имя);
  }
  assert.ok(ids.has(ID), 'id blade_smith в каталоге');
  assert.ok(names.has(NAME), 'имя «Дарн» в каталоге');
});

// --- T4: описание с хуком и уникально ---------------------------------------

test('T4: описание Дарна непустое, с хуком «Точит клинки сам» и НЕ копия описания другого NPC', () => {
  assert.ok(fs.existsSync(NEW), 'RED: assets/npc/000024.json отсутствует');
  const data = readJson(NEW);
  assert.ok(typeof data.описание === 'string' && data.описание.trim() !== '',
    'описание непустое');
  assert.ok(data.описание.includes(HOOK),
    'хук истории «' + HOOK + '» (ТЗ) в описании дословно');
  for (const f of listNpcFiles()) {
    if (f === '000024.json') continue;
    const d = readJson(path.join(NDIR, f));
    assert.notEqual(d.описание, data.описание,
      'описание совпадает с ' + f + ' (не копия существующего)');
  }
});

// --- T5: диалог — профиль торговля, без «для» --------------------------------

test('T5: диалог валиден по схеме, ≥1 опция «торговля», действия ⊆ {подсказка, торговля}, ровно одна с {харизма:3}, id опций уникальны, опций с «для» — ровно 0', () => {
  assert.ok(fs.existsSync(NEW), 'RED: assets/npc/000024.json отсутствует');
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
    'опций с «для» — ровно 0: кузнец торгует с каждым; добавление '
    + '«для» требует ре-пина A8a (tests/npc-dialog-scope)');
  const withReq = data.диалог.filter((o) => o.требования !== undefined);
  assert.equal(withReq.length, 1,
    'ровно одна опция с требованиями (прецедент hint_wood/hint_old/hint_blade)');
  assert.deepEqual(withReq[0].требования, { харизма: 3 },
    'требование опции — {харизма: 3}');
});

// --- T6: профиль-гарант — торговля ЕСТЬ, квестов/обучения/найма НЕТ ---------

test('T6: блоков квесты/обучение/найм НЕТ (ни в JSON, ни в зеркале), торговля ЕСТЬ там и там; зеркало: постройки [1], торговля резолвится в id предмета, диалог deepEqual', () => {
  assert.ok(fs.existsSync(NEW), 'RED: assets/npc/000024.json отсутствует');
  const data = readJson(NEW);
  for (const block of ['квесты', 'обучение', 'найм']) {
    assert.ok(!(block in data),
      'в JSON нет блока «' + block + '»: профиль торговля без квестов — '
      + 'счётчики npc-refs goal 2 / reward 5 не растут');
  }
  assert.ok(data.торговля && Array.isArray(data.торговля.предметы),
    'в JSON есть блок «торговля» с предметами (trade 51 → 54)');
  const mirror = NPCS[23];
  assert.ok(mirror && mirror.id === ID,
    'зеркало: 24-я запись blade_smith');
  assert.equal(mirror.роль, 'оружейник',
    'роль в зеркале — «оружейник» (фикс ТЗ)');
  for (const block of ['квесты', 'обучение', 'найм']) {
    assert.ok(!(block in mirror),
      'в зеркале нет блока «' + block + '» (следует из JSON)');
  }
  assert.ok(mirror.торговля && Array.isArray(mirror.торговля.предметы),
    'в зеркале есть блок «торговля» (следует из JSON)');
  assert.deepEqual(mirror.постройки, [1],
    'зеркало: постройки [1] — sync резолвит ссылку Оружейной в id');
  data.торговля.предметы.forEach((e, j) => {
    const it = readJson(path.join(ROOT, e.предмет));
    assert.equal(mirror.торговля.предметы[j].предмет, it.id,
      'зеркало резолвит путь торговли в id: ' + e.предмет);
  });
  assert.deepEqual(mirror.диалог, data.диалог,
    'зеркало NPCS[23].диалог ≡ JSON-диалог бит-в-бит');
  assert.deepEqual(mirror.описание, data.описание,
    'зеркало NPCS[23].описание ≡ JSON');
});

// --- T7: торговля — 3 меча, формат 000322 -----------------------------------

test('T7: торговля — РОВНО 3 входа мечей; пути на диске; kind weapon/subtype sword; base_price в JSON предмета; mult_продажи ∈ (0,1]; mult_покупки ключ отсутствует; количество 1..99; зеркало в id-форме', () => {
  assert.ok(fs.existsSync(NEW), 'RED: assets/npc/000024.json отсутствует');
  const data = readJson(NEW);
  const items = data.торговля && data.торговля.предметы;
  assert.ok(Array.isArray(items), 'торговля.предметы — массив');
  assert.equal(items.length, 3,
    'витрина — ровно 3 позиции (мечи Оружейной), факт: ' + items.length);
  const mirror = NPCS[23];
  items.forEach((p, j) => {
    assert.match(p.предмет, /^assets\/items\/\d{6}\.json$/,
      'путь предмета — якорная ссылка: ' + p.предмет);
    const target = path.join(ROOT, p.предмет);
    assert.ok(fs.existsSync(target), 'предмет существует по пути: ' + p.предмет);
    const it = readJson(target);
    assert.equal(it.kind, 'weapon',
      p.предмет + ': оружейник торгует клинками — kind weapon');
    assert.equal(it.subtype, 'sword',
      p.предмет + ': subtype sword, факт: ' + it.subtype);
    assert.ok(Number.isInteger(it.base_price) && it.base_price >= 1,
      p.предмет + ': base_price в JSON предмета (000322)');
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
});

// --- T8: ростер Оружейной — ДЕВЯТЬ NPC в порядке каталога ---------------------

test('T8: npcsForBuilding(NPCS, 1) — ДЕВЯТЬ NPC Оружейной в порядке каталога', () => {
  const list = N.npcsForBuilding(NPCS, 1);
  assert.deepEqual(list.map((n) => n.id),
    ['weapons_merchant', 'blade_merchant', 'fencing_instructor',
      'duelist', 'veteran_blade', 'sword_collector', ID, 'ex_mercenary',
      'armory_apprentice'],
    'Оружейная (1): Бренн + Корд + Родар + Скарн + Боримир + Рарог + '
    + 'Дарн + Горм + Опилка, порядок = нумерация файлов; факт: '
    + JSON.stringify(list.map((n) => n.id)));
  assert.equal(N.npcForBuilding(NPCS, 1).id, 'weapons_merchant',
    'npcForBuilding — ПЕРВЫЙ (бит-в-бит, HUD/«Здесь:» не тронуты)');
});

// --- T9: оверлей Оружейной — ровно 9 dialog-строк ----------------------------

test('T9: [E]-оверлей Оружейной — ровно 9 строк: dialog (Бренн), dialog:blade_merchant (Корд), dialog:fencing_instructor (Родар), dialog:duelist (Скарн), dialog:veteran_blade (Боримир), dialog:sword_collector (Рарог), dialog:blade_smith (Дарн), dialog:ex_mercenary (Горм), dialog:armory_apprentice (Опилка)', () => {
  const b = readJson(path.join(ROOT, 'assets', 'buildings', 'weapons_shop.json'));
  const list = N.npcsForBuilding(NPCS, 1);
  const rows = BE.buildingActions(b, list, { day: 5 });
  assert.deepEqual(rows.map((r) => r.id),
    ['dialog', 'dialog:blade_merchant', 'dialog:fencing_instructor',
      'dialog:duelist', 'dialog:veteran_blade', 'dialog:sword_collector',
      'dialog:' + ID, 'dialog:ex_mercenary', 'dialog:armory_apprentice'],
    'у здания 1 эффектов нет — список = dialog-строки по каждому NPC; '
    + 'факт: ' + JSON.stringify(rows.map((r) => r.id)));
  assert.deepEqual(rows.map((r) => r.имя),
    ['Диалог: Бренн', 'Диалог: Корд', 'Диалог: Родар', 'Диалог: Скарн',
      'Диалог: Боримир', 'Диалог: Рарог', 'Диалог: ' + NAME, 'Диалог: Горм',
      'Диалог: Опилка'],
    'подписи — «Диалог: <имя>», факт: ' + JSON.stringify(rows.map((r) => r.имя)));
  assert.deepEqual(rows.map((r) => r.npcId),
    ['weapons_merchant', 'blade_merchant', 'fencing_instructor',
      'duelist', 'veteran_blade', 'sword_collector', ID, 'ex_mercenary',
      'armory_apprentice'],
    'каждая строка несёт npcId своего NPC (роутинг клика)');
});

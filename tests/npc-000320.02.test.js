// Задача 000320.02: «Родар» — инструктор по фехтованию (Оружейная,
// 3-й NPC постройки; 2-я из 100 дочерних 000320).
//
// Контракт (ТЗ tasks/pending/000320.02.md; механизм мульти-NPC —
// 000320.01, spec/npc.md «Несколько NPC на постройку»,
// memory/000320-npcs-batch.md):
//   * assets/npc/000020.json — id fencing_instructor, имя «Родар»,
//     роль «наставник-мечник» (фикс), постройка
//     assets/buildings/000001.json (Оружейная — третья связь),
//     хук описания «Учит на деревянных мечах — сталь в учений не
//     допускает»;
//   * профиль — обучение: ≥1 опция диалога «обучение» (формат
//     000005.json) + блок обучение {навыки:[swordsman],
//     цена_за_уровень, цена_переноса_за_уровень}; навыки ∈ каталогу
//     assets/skills (sweep по диску);
//   * опций с «для» — РОВНО 0: инструктор учит всех; контракт A8a
//     (tests/npc-dialog-scope) — добавление «для» потребовало бы
//     ре-пина A8a;
//   * [E]-оверлей Оружейной — dialog-строки в порядке каталога:
//     'dialog' (Бренн) → 'dialog:blade_merchant' (Корд) →
//     'dialog:fencing_instructor' (Родар); на момент 000320.02 —
//     ТРИ строки, с 000320.03 — ЧЕТЫРЕ (+'dialog:duelist', Скарн),
//     с 000320.04 — ПЯТЬ (+'dialog:veteran_blade', Боримир),
//     с 000320.05 — ШЕСТЬ (+'dialog:sword_collector', Рарог),
//     с 000320.06 — СЕМЬ (+'dialog:blade_smith', Дарн),
//     с 000320.07 — ВОСЕМЬ (+'dialog:ex_mercenary', Горм),
//     с 000320.08 — ДЕВЯТЬ (+'dialog:armory_apprentice', Опилка).
//
// КРАСНЫЕ (TDD): T1..T8 красные до зелёной стадии (000020.json нет,
// каталог 19, оверлей 2 строки), без краха загрузки.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validateData } = require('./json-schema.js');

const ROOT = path.join(__dirname, '..');
const NDIR = path.join(ROOT, 'assets', 'npc');
const NEW = path.join(NDIR, '000020.json');
const SCHEMA = JSON.parse(
  fs.readFileSync(path.join(NDIR, 'schema.json'), 'utf8'));

const N = require('../src/npc.js');
const { NPCS } = require('../src/npc-data.js');
const BE = require('../src/building-effects.js');

const HOOK = 'Учит на деревянных мечах — сталь в учений не допускает';

function listNpcFiles() {
  return fs.readdirSync(NDIR)
    .filter((f) => /^\d{6}\.json$/.test(f))
    .sort();
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function listSkillIds() {
  const ids = new Set();
  for (const f of fs.readdirSync(path.join(ROOT, 'assets', 'skills'))) {
    if (!/^\d{6}\.json$/.test(f)) continue;
    ids.add(readJson(path.join(ROOT, 'assets', 'skills', f)).id);
  }
  return ids;
}

// --- T1: размер каталога ---------------------------------------------------

test('T1: каталог — ровно 26 файл 000001..000026 подряд; зеркало NPCS 26 запись с fencing_instructor', () => {
  const files = listNpcFiles();
  assert.equal(files.length, 26,
    'в каталоге NPC 26 файл (000320.02: +Родар; 000320.03: +Скарн; 000320.04: +Ветеран; 000320.05: +Коллекционер; 000320.06: +Оружейник; 000320.07: +Отставной наёмник; 000320.08: +Подмастерье), факт: ' + files.length);
  for (let i = 0; i < files.length; i++) {
    assert.equal(files[i],
      String(i + 1).padStart(6, '0') + '.json',
      'нумерация подряд без пропусков: индекс ' + i);
  }
  assert.equal(NPCS.length, 26,
    'зеркало src/npc-data.js — 26 запись (sync не прогнан?), факт: '
    + NPCS.length);
  const last = NPCS[19];
  assert.ok(last, '20-я запись зеркала существует');
  assert.equal(last.id, 'fencing_instructor',
    '20-я запись зеркала — fencing_instructor (порядок = нумерация файлов)');
});

// --- T2: 000020.json валиден по схеме + порядок ключей + roundtrip ---------

test('T2: assets/npc/000020.json валиден по schema; ключи в порядке образца; roundtrip-канон; негативы — мимо схемы', () => {
  assert.ok(fs.existsSync(NEW),
    'RED: assets/npc/000020.json отсутствует (NPC задачи ещё не создан)');
  const data = readJson(NEW);
  assert.deepEqual(validateData(SCHEMA, data, 'npc/000020'), [],
    '000020.json обязан проходить assets/npc/schema.json');
  assert.deepEqual(Object.keys(data),
    ['id', 'имя', 'роль', 'описание', 'постройки', 'диалог', 'обучение'],
    'порядок ключей — как 000001/000005 (id, имя, роль, описание, '
    + 'постройки, диалог, обучение)');
  const raw = fs.readFileSync(NEW, 'utf8');
  assert.equal(raw, JSON.stringify(data, null, 2) + '\n',
    '000020.json — roundtrip JSON.stringify(obj,null,2)+перевод строки');
  const extraKey = JSON.parse(JSON.stringify(data));
  extraKey.цена = 10;
  assert.notDeepEqual(validateData(SCHEMA, extraKey, 'npc/extra'), [],
    'посторонний ключ «цена» — additionalProperties false, обязан отваливаться');
  const strPrice = JSON.parse(JSON.stringify(data));
  strPrice.обучение.цена_за_уровень = '25';
  assert.notDeepEqual(validateData(SCHEMA, strPrice, 'npc/strprice'), [],
    'цена_за_уровень строкой — вне схемы (integer)');
});

// --- T3: id и имя уникальны (sweep) ----------------------------------------

test('T3: id fencing_instructor и имя «Родар» уникальны в sweep каталога', () => {
  assert.ok(fs.existsSync(NEW), 'RED: assets/npc/000020.json отсутствует');
  const ids = new Set();
  const names = new Set();
  for (const f of listNpcFiles()) {
    const d = readJson(path.join(NDIR, f));
    assert.ok(!ids.has(d.id), 'дубликат id «' + d.id + '» (файл ' + f + ')');
    assert.ok(!names.has(d.имя), 'дубликат имени «' + d.имя + '» (файл ' + f + ')');
    ids.add(d.id);
    names.add(d.имя);
  }
  assert.ok(ids.has('fencing_instructor'), 'id fencing_instructor в каталоге');
  assert.ok(names.has('Родар'), 'имя «Родар» в каталоге');
});

// --- T4: описание с хуком и уникально ---------------------------------------

test('T4: описание Родара непустое, с хуком «деревянные мечи» и НЕ копия описания другого NPC', () => {
  assert.ok(fs.existsSync(NEW), 'RED: assets/npc/000020.json отсутствует');
  const data = readJson(NEW);
  assert.ok(typeof data.описание === 'string' && data.описание.trim() !== '',
    'описание непустое');
  assert.ok(data.описание.includes(HOOK),
    'хук истории «' + HOOK + '» (ТЗ) в описании дословно');
  for (const f of listNpcFiles()) {
    if (f === '000020.json') continue;
    const d = readJson(path.join(NDIR, f));
    assert.notEqual(d.описание, data.описание,
      'описание совпадает с ' + f + ' (не копия существующего)');
  }
});

// --- T5: диалог — профиль обучение, без «для» -------------------------------

test('T5: диалог валиден по схеме, ≥1 опция «обучение», id опций уникальны, опций с «для» — ровно 0', () => {
  assert.ok(fs.existsSync(NEW), 'RED: assets/npc/000020.json отсутствует');
  const data = readJson(NEW);
  assert.ok(Array.isArray(data.диалог) && data.диалог.length >= 1,
    'диалог непустой (schema minItems 1)');
  const ACTIONS = ['торговля', 'обучение', 'квесты', 'подсказка', 'найм'];
  for (const o of data.диалог) {
    assert.ok(ACTIONS.includes(o.действие),
      'действие «' + o.действие + '» вне enum схемы');
    const errs = validateData(SCHEMA.properties.диалог.items, o, 'диалог');
    assert.deepEqual(errs, [],
      'опция «' + o.id + '» — вне схемы диалога: ' + JSON.stringify(errs));
  }
  assert.ok(data.диалог.some((o) => o.действие === 'обучение'),
    'профиль «обучение» — опция действия «обучение» обязательна');
  const ids = data.диалог.map((o) => o.id);
  assert.equal(new Set(ids).size, ids.length, 'id опций диалога уникальны');
  assert.equal(data.диалог.filter((o) => o.для !== undefined).length, 0,
    'опций с «для» — ровно 0: инструктор учит всех; добавление «для» '
    + 'требует ре-пина A8a (tests/npc-dialog-scope)');
});

// --- T6: блок обучение — фикс-навык, каталожность, цены, зеркало ------------

test('T6: обучение — навыки [swordsman] ∈ assets/skills (sweep), цены целые 1..10000, зеркало ≡ JSON', () => {
  assert.ok(fs.existsSync(NEW), 'RED: assets/npc/000020.json отсутствует');
  const data = readJson(NEW);
  assert.ok(data.обучение && Array.isArray(data.обучение.навыки),
    'блок обучение.навыки — массив');
  assert.deepEqual(data.обучение.навыки, ['swordsman'],
    'ТЗ фикс: навыки обучения — [swordsman], факт: '
    + JSON.stringify(data.обучение.навыки));
  const known = listSkillIds();
  for (const id of data.обучение.навыки) {
    assert.ok(known.has(id),
      'навык «' + id + '» отсутствует в каталоге assets/skills (sweep по диску)');
  }
  for (const key of ['цена_за_уровень', 'цена_переноса_за_уровень']) {
    const v = data.обучение[key];
    assert.ok(Number.isInteger(v) && v >= 1 && v <= 10000,
      key + ' — целое 1..10000, факт: ' + JSON.stringify(v));
  }
  const mirror = NPCS[19];
  assert.ok(mirror && mirror.id === 'fencing_instructor',
    'зеркало: 20-я запись fencing_instructor');
  assert.deepEqual(mirror.обучение, data.обучение,
    'зеркало NPCS[19].обучение — тот же блок, что в JSON');
});

// --- T7: ростер Оружейной — ДЕВЯТЬ NPC в порядке каталога --------------------

test('T7: npcsForBuilding(NPCS, 1) — ДЕВЯТЬ NPC Оружейной в порядке каталога', () => {
  const list = N.npcsForBuilding(NPCS, 1);
  assert.deepEqual(list.map((n) => n.id),
    ['weapons_merchant', 'blade_merchant', 'fencing_instructor', 'duelist',
      'veteran_blade', 'sword_collector', 'blade_smith', 'ex_mercenary',
      'armory_apprentice'],
    'Оружейная (1): Бренн + Корд + Родар + Скарн + Боримир + Рарог + Дарн + Горм + Опилка, порядок = нумерация файлов; '
    + 'факт: ' + JSON.stringify(list.map((n) => n.id)));
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

// Задача 000320.01: «Корд» — торговец клинками (Оружейная, 2-й NPC) +
// МЕХАНИЗМ «несколько NPC на постройку».
//
// Контракт (spec/npc.md «Несколько NPC на постройку», memory/000320-npcs-batch.md):
//   * [E]-оверлей постройки показывает строку на КАЖДОГО NPC постройки
//     (связь — NPC.постройки ⊇ постройка; ПОРЯДОК — каталог, нумерация
//     файлов assets/npc/NNNNNN.json): подпись «Диалог: <имя>»;
//   * id первой строки — 'dialog' (совместимость data-buid/хоткеев),
//     остальных — 'dialog:<id NPC>'; строка несёт npcId — по нему
//     роутится клик в openNpcDialog (этого NPC);
//   * постройка с ОДНИМ NPC — ЕДИНСТВЕННАЯ строка (та же подпись);
//   * buildingActions: пустой список/null — строк нет (ловушка truthy-
//     пустого [] для фейков buildingEffects);
//   * building-actions: npcsForBuilding (реальный Game) с FALLBACK на
//     [npcForBuilding] — старые фейки deps без npcsForBuilding живы;
//   * onBuildingAction: 'dialog' И 'dialog:*' — фолбэк диалога; цель —
//     по action.npcId в списке (4-аргументный вызов без npcId — прежний
//     npc-параметр, регрессия BA2/BA3/000299.01).
//
// NPC «Корд» (assets/npc/000019.json): id blade_merchant, роль
// «торговец оружием», постройки [assets/buildings/000001.json], профиль
// «торговля» — только мечи и луки (kind weapon, subtype sword/bow),
// формат цен 000322 (base_price предмета; mult_покупки при 1 — ключа нет).
//
// КРАСНЫЕ (TDD): N1..N8 красные до зелёной стадии (000019.json нет,
// строка одна «Диалог», [] даёт ложную строку, 'dialog:*' не роутится);
// N9..N12 — регрессионные (бит-в-бит поведение старых контрактов).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validateData } = require('./json-schema.js');

const ROOT = path.join(__dirname, '..');
const NDIR = path.join(ROOT, 'assets', 'npc');
const N19 = path.join(NDIR, '000019.json');
const SCHEMA = JSON.parse(
  fs.readFileSync(path.join(NDIR, 'schema.json'), 'utf8'));

const N = require('../src/npc.js');
const { NPCS } = require('../src/npc-data.js');

function listNpcFiles() {
  return fs.readdirSync(NDIR)
    .filter((f) => /^\d{6}\.json$/.test(f))
    .sort();
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// --- N1: размер каталога -------------------------------------------------

test('N1: каталог — ровно 26 файл 000001..000026 подряд; зеркало NPCS 26 запись', () => {
  const files = listNpcFiles();
  assert.equal(files.length, 26,
    'в каталоге NPC 26 файл (000320.01: +Корд; 000320.02: +Родар; 000320.03: +Скарн; 000320.04: +Ветеран; 000320.05: +Коллекционер; 000320.06: +Оружейник; 000320.07: +Отставной наёмник; 000320.08: +Подмастерье), факт: ' + files.length);
  for (let i = 0; i < files.length; i++) {
    assert.equal(files[i],
      String(i + 1).padStart(6, '0') + '.json',
      'нумерация подряд без пропусков: индекс ' + i);
  }
  assert.equal(NPCS.length, 26,
    'зеркало src/npc-data.js — 26 запись (sync не прогнан?)');
  assert.equal(NPCS[18].id, 'blade_merchant',
    '19-я запись зеркала — blade_merchant (порядок = нумерация файлов)');
});

// --- N2: 000019.json валиден по схеме + отрицательные образцы ------------

test('N2: assets/npc/000019.json валиден по schema; старый формат цены — мимо схемы', () => {
  assert.ok(fs.existsSync(N19),
    'RED: assets/npc/000019.json отсутствует (NPC задачи ещё не создан)');
  const data = readJson(N19);
  assert.deepEqual(validateData(SCHEMA, data, 'npc/000019'), [],
    '000019.json обязан проходить assets/npc/schema.json');
  // Формат 000322: цена_покупки/цена_продажа_продажи в NPC запрещены
  // (additionalProperties false).
  const legacy = JSON.parse(JSON.stringify(data));
  legacy.торговля.предметы[0].цена_покупки = 10;
  assert.notDeepEqual(validateData(SCHEMA, legacy, 'npc/legacy'), [],
    'цена_покупки в торговом входе — старый формат (000322), обязан отваливаться');
  // Roundtrip-форма (конвенция каталога): JSON.stringify(obj,null,2)+'\n'.
  const raw = fs.readFileSync(N19, 'utf8');
  assert.equal(raw, JSON.stringify(data, null, 2) + '\n',
    '000019.json — roundtrip JSON.stringify(obj,null,2)+перевод строки');
});

// --- N3: id и имя уникальны (sweep) ---------------------------------------

test('N3: id blade_merchant и имя «Корд» уникальны в sweep каталога', () => {
  assert.ok(fs.existsSync(N19), 'RED: assets/npc/000019.json отсутствует');
  const files = listNpcFiles();
  const ids = new Set();
  const names = new Set();
  for (const f of files) {
    const d = readJson(path.join(NDIR, f));
    assert.ok(!ids.has(d.id), 'дубликат id «' + d.id + '» (файл ' + f + ')');
    assert.ok(!names.has(d.имя), 'дубликат имени «' + d.имя + '» (файл ' + f + ')');
    ids.add(d.id);
    names.add(d.имя);
  }
  assert.ok(ids.has('blade_merchant'), 'id blade_merchant в каталоге');
  assert.ok(names.has('Корд'), 'имя «Корд» в каталоге');
});

// --- N4: описание непустое и уникально ------------------------------------

test('N4: описание Корда непустое и НЕ совпадает с описанием любого NPC каталога', () => {
  assert.ok(fs.existsSync(N19), 'RED: assets/npc/000019.json отсутствует');
  const data = readJson(N19);
  assert.ok(typeof data.описание === 'string' && data.описание.trim() !== '',
    'описание непустое');
  assert.ok(data.описание.includes('идеальный баланс — дело вкуса'),
    'хук истории «идеальный баланс — дело вкуса» (ТЗ) в описании');
  for (const f of listNpcFiles()) {
    if (f === '000019.json') continue;
    const d = readJson(path.join(NDIR, f));
    assert.notEqual(d.описание, data.описание,
      'описание совпадает с ' + f + ' (не копия существующего)');
  }
});

// --- N5: диалог — формат, профиль торговля --------------------------------

test('N5: диалог непустой, действие ∈ enum, есть «торговля»; «для»/«требования» — формат схемы', () => {
  assert.ok(fs.existsSync(N19), 'RED: assets/npc/000019.json отсутствует');
  const data = readJson(N19);
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
  assert.ok(data.диалог.some((o) => o.действие === 'торговля'),
    'профиль «торговля» — опция действия «торговля» обязательна');
  const ids = data.диалог.map((o) => o.id);
  assert.equal(new Set(ids).size, ids.length, 'id опций диалога уникальны');
});

// --- N6: торговля — только мечи и луки, формат 000322 ---------------------

test('N6: торговля — 5 входов меч/лук; пути на диске; зеркало в id-форме; формат 000322', () => {
  assert.ok(fs.existsSync(N19), 'RED: assets/npc/000019.json отсутствует');
  const data = readJson(N19);
  assert.ok(data.торговля && Array.isArray(data.торговля.предметы),
    'торговля.предметы — массив');
  const items = data.торговля.предметы;
  assert.equal(items.length, 5, 'витрина — ровно 5 позиций, факт: ' + items.length);
  const mirror = NPCS[18];
  assert.ok(mirror && mirror.id === 'blade_merchant',
    'зеркало: 19-я запись blade_merchant');
  items.forEach((p, j) => {
    assert.match(p.предмет, /^assets\/items\/\d{6}\.json$/,
      'путь предмета — якорная ссылка: ' + p.предмет);
    const target = path.join(ROOT, p.предмет);
    assert.ok(fs.existsSync(target), 'предмет существует по пути: ' + p.предмет);
    const it = readJson(target);
    assert.equal(it.kind, 'weapon',
      p.предмет + ': «только мечи и луки» — kind weapon');
    assert.ok(it.subtype === 'sword' || it.subtype === 'bow',
      p.предмет + ': subtype ∈ {sword, bow}, факт: ' + it.subtype);
    assert.ok(Number.isInteger(it.base_price) && it.base_price >= 1,
      p.предмет + ': base_price в JSON предмета (000322)');
    assert.equal(mirror.торговля.предметы[j].предмет, it.id,
      'зеркало резолвит путь в id: ' + p.предмет);
    assert.ok(p.mult_продажи > 0 && p.mult_продажи <= 1,
      p.предмет + ': mult_продажи ∈ (0,1]: ' + p.mult_продажи);
    if (p.mult_покупки !== undefined) {
      assert.notEqual(p.mult_покупки, 1,
        p.предмет + ': mult_покупки === 1 — КЛЮЧ обязан ОТСУТСТВОВАТЬ (000322)');
      assert.ok(p.mult_покупки > p.mult_продажи,
        p.предмет + ': покупка дороже продажи');
    }
    assert.ok(Number.isInteger(p.количество) && p.количество >= 1 && p.количество <= 99,
      p.предмет + ': количество 1..99');
  });
});

// --- N7: npcsForBuilding — ВСЕ NPC постройки (реальный каталог) -----------

test('N7: npcsForBuilding(NPCS, 1) — ДЕВЯТЬ NPC Оружейной в порядке каталога', () => {
  const list = N.npcsForBuilding(NPCS, 1);
  assert.deepEqual(list.map((n) => n.id),
    ['weapons_merchant', 'blade_merchant', 'fencing_instructor', 'duelist',
      'veteran_blade', 'sword_collector', 'blade_smith', 'ex_mercenary',
      'armory_apprentice'],
    'Оружейная (1): Бренн + Корд + Родар + Скарн + Боримир + Рарог + Дарн + Горм + Опилка, порядок = нумерация файлов; факт: '
    + JSON.stringify(list.map((n) => n.id)));
  assert.equal(N.npcForBuilding(NPCS, 1).id, 'weapons_merchant',
    'npcForBuilding — ПЕРВЫЙ (бит-в-бит, HUD/«Здесь:» не тронуты)');
});

// --- Механизм: building-actions + building-effects ------------------------

const BE = require('../src/building-effects.js');

const FAKE_B = { id: 96, особые_параметры: {} };
const FAKE_TILE = { x: 5, y: 7, hasBuilding: true, buildingId: 96,
  building: null, buildingWealth: 0, loot: null };

function makeGame(o = {}) {
  const opened = { overlay: [], dialog: [] };
  const npcOf = (id) => (o.npcs || []).find((n) => n.id === id) || null;
  const game = {
    buildingEffects: BE,
    getBuilding: (id) => (id === 96 ? FAKE_B : null),
    buildingForMapIndex: () => null,
    npcUI: {
      open: (p) => { opened.dialog.push(p); },
      isActive: () => false,
      close: () => {},
    },
    buildingUI: {
      open: (p) => { opened.overlay.push(p); },
      isActive: () => false,
      close: () => {},
    },
  };
  if (o.npcsForBuilding !== false) {
    game.npcsForBuilding = (list, bid) =>
      (list || []).filter((n) => Array.isArray(n.постройки)
        && n.постройки.includes(bid));
  }
  game.npcForBuilding = (list, bid) =>
    ((list || []).find((n) => Array.isArray(n.постройки)
      && n.постройки.includes(bid)) || null);
  return { game, opened };
}

function initBA(o = {}) {
  const { game, opened } = makeGame(o);
  const deps = {
    game,
    clock: { day: 5 },
    hero: { hp: 10, gold: 100 },
    player: { x: 5, y: 7 },
    prevPos: { x: 5, y: 7 },
    getMap: () => ({ tileAt: () => FAKE_TILE }),
    mover: null,
    npcs: o.npcs || [],
    questBook: { fakeBook: true },
    npcShopFor: (id) => ({ shopFor: id }),
    collectSaveData: () => ({ day: 5 }),
    saveNow: () => {},
    flash: () => {},
    buildingOncePerDay: new Map(),
    buffs: [],
    teleports: new Map(),
    playerRender: () => {},
    moveHero: () => {},
    startCombat: () => {},
  };
  const BA = require('../src/building-actions.js');
  BA.init(deps);
  return { BA, game, opened, deps };
}

test('N8: [E] — строка на каждого NPC постройки (порядок каталога); клик 2-й строки — диалог ЭТОГО NPC', () => {
  const npcs = [
    { id: 'alpha_npc', имя: 'Альфа', постройки: [96] },
    { id: 'blade_test', имя: 'Корд', постройки: [96] },
  ];
  const e = initBA({ npcs });
  e.BA.toggle();
  assert.equal(e.opened.overlay.length, 1, 'buildingUI.open ×1');
  const p = e.opened.overlay[0];
  const ids = p.actions.map((a) => a.id);
  assert.deepEqual(ids.slice(0, 2), ['dialog', 'dialog:blade_test'],
    'две dialog-строки: id первой — dialog (data-buid-совместимость), '
    + 'второй — dialog:<id NPC>; факт: ' + JSON.stringify(ids));
  assert.equal(p.actions[0].имя, 'Диалог: Альфа',
    'подпись 1-й строки — «Диалог: <имя>», факт: ' + p.actions[0].имя);
  assert.equal(p.actions[1].имя, 'Диалог: Корд',
    'подпись 2-й строки — «Диалог: <имя>», факт: ' + p.actions[1].имя);
  assert.equal(p.actions[0].npcId, 'alpha_npc', 'строка несёт npcId (роутинг)');
  assert.equal(p.actions[1].npcId, 'blade_test', 'строка несёт npcId (роутинг)');
  assert.equal(p.actions[1].доступен, true, 'строка доступна');
  // Клик 2-й строки — диалог ВТОРОГО NPC.
  p.onAction(p.actions[1]);
  assert.equal(e.opened.dialog.length, 1, 'клик 2-й строки → npcUI.open ×1');
  assert.equal(e.opened.dialog[0].npc.id, 'blade_test',
    'диалог — Корда (по npcId строки), факт: ' + e.opened.dialog[0].npc.id);
  // Клик 1-й строки — первый NPC.
  p.onAction(p.actions[0]);
  assert.equal(e.opened.dialog.length, 2, 'клик 1-й строки → npcUI.open');
  assert.equal(e.opened.dialog[1].npc.id, 'alpha_npc', 'диалог — Альфы');
});

test('N9: ОДИН NPC постройки — ровно одна строка «Диалог: <имя>» (id dialog)', () => {
  const npcs = [{ id: 'alpha_npc', имя: 'Альфа', постройки: [96] }];
  const e = initBA({ npcs });
  e.BA.toggle();
  const p = e.opened.overlay[0];
  assert.deepEqual(p.actions.map((a) => a.id), ['dialog'],
    'одинарный NPC — ЕДИНСТВЕННАЯ строка id dialog; факт: '
    + JSON.stringify(p.actions.map((a) => a.id)));
  assert.equal(p.actions[0].имя, 'Диалог: Альфа',
    'подпись одиночной строки — «Диалог: <имя>» (тот же формат), факт: '
    + p.actions[0].имя);
  p.onAction(p.actions[0]);
  assert.equal(e.opened.dialog[0].npc.id, 'alpha_npc', 'диалог — этого NPC');
});

test('N10: buildingActions — пустой список [] и null: dialog-строк нет (ловушка truthy [])', () => {
  const st = { day: 5, tile: { x: 0, y: 0 }, hero: {}, save: {} };
  assert.deepEqual(BE.buildingActions(FAKE_B, [], st).map((a) => a.id), [],
    'пустой массив NPC НЕ обязан давать строку «Диалог» (городские фейки '
    + 'if (npc) push — truthy-ловушка)');
  assert.deepEqual(BE.buildingActions(FAKE_B, null, st).map((a) => a.id), [],
    'null — без строк (бит-в-бит master)');
});

test('N11: onBuildingAction — «dialog:<id>» роутится по npcId; неизвестный npcId — no-op; без npcId — прежний npc-параметр', () => {
  const npcA = { id: 'alpha_npc', имя: 'Альфа', постройки: [96] };
  const npcB = { id: 'blade_test', имя: 'Корд', постройки: [96] };
  const e = initBA({ npcs: [npcA, npcB] });
  const t = FAKE_TILE;
  // 'dialog:blade_test' с npcId — ВЕТКА фолбэка (нет EFFECTS/спец-а).
  e.BA.onBuildingAction(
    { id: 'dialog:blade_test', имя: 'Диалог: Корд', доступен: true,
      npcId: 'blade_test' }, t, FAKE_B, npcA, [npcA, npcB]);
  assert.equal(e.opened.dialog.length, 1, 'строка dialog:* → диалог ×1');
  assert.equal(e.opened.dialog[0].npc.id, 'blade_test',
    'цель — по action.npcId, факт: ' + e.opened.dialog[0].npc.id);
  // Неизвестный npcId — тихий no-op БЕЗ краха.
  e.BA.onBuildingAction(
    { id: 'dialog:nope', имя: 'Диалог: ?', доступен: true, npcId: 'nope' },
    t, FAKE_B, npcA, [npcA, npcB]);
  assert.equal(e.opened.dialog.length, 1,
    'неизвестный npcId — no-op (диалог НЕ открывается)');
  // РЕГРЕССИЯ: 4 аргумента, строка без npcId — прежний npc-параметр.
  e.BA.onBuildingAction(
    { id: 'dialog', имя: 'Диалог: Альфа', доступен: true }, t, FAKE_B, npcA);
  assert.equal(e.opened.dialog.length, 2, '4-аргументный вызов — как был');
  assert.equal(e.opened.dialog[1].npc.id, 'alpha_npc',
    'без npcId — NPC из параметра (BA2/BA3/CAMP_DIALOG бит-в-бит)');
});

test('N12: РЕГРЕССИЯ — fake game ТОЛЬКО с npcForBuilding (без npcsForBuilding): fallback одна строка, клик — тот же NPC', () => {
  const npcs = [{ id: 'alpha_npc', имя: 'Альфа', постройки: [96] }];
  const e = initBA({ npcs, npcsForBuilding: false });
  e.BA.toggle();
  assert.equal(e.opened.overlay.length, 1,
    'fallback [npcForBuilding] — buildingUI.open ×1 (крах = красный)');
  const p = e.opened.overlay[0];
  assert.deepEqual(p.actions.map((a) => a.id), ['dialog'],
    'одна dialog-строка через fallback');
  p.onAction(p.actions[0]);
  assert.equal(e.opened.dialog.length, 1, 'клик → диалог');
  assert.equal(e.opened.dialog[0].npc.id, 'alpha_npc',
    'диалог — NPC из npcForBuilding (деградационная ветка жива)');
});

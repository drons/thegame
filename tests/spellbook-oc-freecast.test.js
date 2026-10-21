'use strict';
// Задача 000230.17: внебоевой free_cast — каст из книги без маны
// (красные тесты TDD). Контракт: memory/000230.17-oc-freecast.md §2/§3/§5.
//
// castOutOfCombat (src/spells.js) должен уважать freeCast из экипировки
// героя: spell ∈ freeCast(экипировка) → БЕЗ списания hero.mp (мана-чек
// и списание пропускаются); НЕ free → бит-в-бит текущий платный путь.
// freeCast считается live (equipmentAffixes, items.js) в момент каста —
// ленивая ссылка без load-time require-цикла.
//
// RED (осмысленная — assert-расхождения mp/reason, не load-ошибка):
//   FC1 free из freeCast — мана НЕ списывается  (факт mp 25 ≠ 30)
//   FC4 free + нехватка маны — каст УДАЁТСЯ      (факт {ok:false,'не
//        хватает маны'}; ГЛАВНЫЙ кейс)
//   FC5 невидимость + freeCast — оба эффекта      (факт mp 25 ≠ 30)
//   FC7 free + телепорт-отказ — mp НЕ начисляется (факт reason 'не
//        хватает маны' — R1-пин castFail)
// Зелёные с red-фазы (контрольные/forward-пины):
//   FC2 не-free — мана списывается; FC3 reason-строка; FC6 деградация;
//   FC8 телепорт-отказ не-free — rollback.
//
// Все кейсы — в vm: каталог items.js — приватный Map при загрузке,
// реальный каталог 0 affix-предметов (пин E9 76/0 не трогать) →
// free_cast-фикстура предмета возможна ТОЛЬКО в vm (подмена
// Game.ITEMS до load items.js). Цепь — дубль VM_00023003_CHAIN
// (combat.test.js). Гость-заклинание — полная форма каталога, live-
// инъекция в Game.SpellsData (SPELLS.push + SPELLS_BY_ID), restore в
// finally (пины «ровно 17» не трогаются — инъекция в ЧУЖОЙ realm vm).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

// Цепь: дубль VM_00023003_CHAIN (combat.test.js :9128), items-data.js
// ПРОПУСКАЕТСЯ — фикстуры вместо реального каталога (Game.ITEMS до
// items.js). Дегра-цепь (FC6b) — та же МИНUS items.js.
const FULL_CHAIN = ['global-settings.js', 'perlin.js', 'map.js',
  'skills-data.js', 'sheet.js', 'player.js', 'items.js', 'combat.js',
  'spells-data.js', 'spells.js'];
const DEGRADED_CHAIN = ['global-settings.js', 'perlin.js', 'map.js',
  'skills-data.js', 'sheet.js', 'player.js', 'combat.js', 'spells-data.js',
  'spells.js'];

// Меж-реальм: значения, созданные в vm-песочнице (массивы/объекты),
// имеют ЧУЖИЕ прототипы — deepStrictEqual (assert/strict) их отвергает
// (прецедент fromVm, items.test.js :963-965). Нормализуем через JSON.
const fromVm = (v) => JSON.parse(JSON.stringify(v));

function loadVm(chain, fixtures) {
  const errors = [];
  const sandbox = { console: { log() {}, warn() {}, error: (m) => errors.push(String(m)) } };
  vm.createContext(sandbox);
  for (const f of chain) {
    if (f === 'items.js' && Array.isArray(fixtures)) sandbox.Game.ITEMS = fixtures;
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'src', f), 'utf8'),
      sandbox, { filename: f });
  }
  return { Game: sandbox.Game, errors };
}

// Гость — полная форма каталога (образ ocGuest0235, spells.test.js :2256).
function guest(id, over = {}) {
  return Object.assign({
    id,
    название: 'Тестовое заклинание (000230.17)',
    школа: 'тень',
    база: null,
    степень: 1,
    атрибут: 'intelligence',
    уровень: 1,
    мани: 5,
    действие: 'внебой',
    вне_боя: true,
    параметры: { days: 2 },
    здания: ['assets/buildings/000001.json'],
    описание: 'Тестовое заклинание (000230.17)',
    icon: 'assets/spell-icons/ghost.svg',
    icon_prompt: 'Тестовая иконка (000230.17)',
  }, over);
}

function pushGuests(G, guests) {
  for (const g of guests) {
    G.SpellsData.SPELLS.push(g);
    G.SpellsData.SPELLS_BY_ID[g.id] = g;
  }
}
function popGuests(G, guests) {
  for (const g of guests) {
    const i = G.SpellsData.SPELLS.lastIndexOf(g);
    if (i >= 0) G.SpellsData.SPELLS.splice(i, 1);
    delete G.SpellsData.SPELLS_BY_ID[g.id];
  }
}

// Фикстура-предмет: ring, affixes free_cast → проходит validateItem
// (прецедент F1); spell — ФОРМА id, каталожность — гостем (items.js
// каталог spells не знает).
function fcRing(id, spell) {
  return { id, name: 'Тестовое кольцо', kind: 'ring', slot: 'ring',
    weight: 0.1, value: 30, desc: 'т',
    affixes: [{ type: 'free_cast', spell }] };
}

function hero(G, { spells, mp, equipment }) {
  const p = G.createCharacter();
  p.spells = spells.slice();
  p.mp = mp;
  if (equipment) p.equipment = equipment;
  return p;
}

// ctx телепорта (форма 000235.04): cities БЕЗ построек → отказ
// «нет города с постройками»; teleport-spy — пин «не вызван».
function noCityCtx() {
  const calls = [];
  const cities = new Map([
    ['1,1', { built: [] }],
    ['2,2', { name: 'Без построек' }],
  ]);
  return {
    calls,
    ctx: { x: 0, y: 0, cities, passable: () => true,
      teleport: (tx, ty) => { calls.push([tx, ty]); } },
  };
}

test('000230.17-FC1 (vm): spell из freeCast — ok, запись {spellId, expiresDay}, мана НЕ списывается (mp 30 → 30)', () => {
  const { Game: G, errors } = loadVm(FULL_CHAIN, [fcRing('x_fc1', 'ocfc_free')]);
  const g = guest('ocfc_free'); // внебой, days 2, мани 5
  try {
    assert.deepEqual(errors, [], 'load-clean: 0 console.error');
    pushGuests(G, [g]);
    const p = hero(G, { spells: [g.id], mp: 30,
      equipment: { ring_left_1: 'x_fc1' } });
    const r = G.Spells.castOutOfCombat(p, g.id, 10);
    assert.equal(r.ok, true, 'free из freeCast — каст ок');
    assert.equal(r.expiresDay, 12, 'expiresDay = day + days (10 + 2)');
    assert.deepEqual(fromVm(p.outOfCombatEffects),
      [{ spellId: g.id, expiresDay: 12 }], 'запись создана');
    assert.equal(p.mp, 30,
      'RED: free_cast — мана НЕ списывается (факт: ' + p.mp + ')');
  } finally {
    popGuests(G, [g]);
  }
});

test('000230.17-FC2 (vm): spell НЕ в freeCast (экипировка есть, гость paid) — мана списывается (mp 30 → 25, пин)', () => {
  const { Game: G, errors } = loadVm(FULL_CHAIN,
    [fcRing('x_fc2', 'ocfc_free')]);
  const gFree = guest('ocfc_free');
  const gPaid = guest('ocfc_paid'); // НЕ в freeCast
  try {
    assert.deepEqual(errors, [], 'load-clean: 0 console.error');
    pushGuests(G, [gFree, gPaid]);
    // Кольцо даёт free_cast на ocfc_free; кастуем ocfc_paid → платно.
    const p = hero(G, { spells: [gFree.id, gPaid.id], mp: 30,
      equipment: { ring_left_1: 'x_fc2' } });
    const r = G.Spells.castOutOfCombat(p, gPaid.id, 10);
    assert.equal(r.ok, true, 'paid-гость (не в freeCast) — каст ок');
    assert.equal(p.mp, 25,
      'пина: мана списана ровно «мани» (5) — не «free-всё»');
  } finally {
    popGuests(G, [gFree, gPaid]);
  }
});

test('000230.17-FC3 (vm): без экипировки, mp 4 < мани 5 — {ok:false, reason «не хватает маны»} побайто, мутаций нет (пин строки)', () => {
  const { Game: G, errors } = loadVm(FULL_CHAIN, [fcRing('x_fc3', 'ocfc_free')]);
  const g = guest('ocfc_free');
  try {
    assert.deepEqual(errors, [], 'load-clean: 0 console.error');
    pushGuests(G, [g]);
    const p = hero(G, { spells: [g.id], mp: 4 }); // equipment НЕТ
    const r = G.Spells.castOutOfCombat(p, g.id, 10);
    assert.equal(r.ok, false, 'не хватает маны — отказ');
    assert.equal(r.reason, 'не хватает маны',
      'пина: строка reason побайто (не «мало маны», без деталей)');
    assert.equal(p.mp, 4, 'при отказе мана не снимается');
    assert.equal(p.outOfCombatEffects, undefined,
      'при отказе поле НЕ создаётся');
  } finally {
    popGuests(G, [g]);
  }
});

test('000230.17-FC4 (vm): free + нехватка маны (mp 4 < 5) — каст УДАЁТСЯ (ГЛАВНЫЙ кейс): ok, mp 4, запись создана', () => {
  const { Game: G, errors } = loadVm(FULL_CHAIN, [fcRing('x_fc4', 'ocfc_free')]);
  const g = guest('ocfc_free');
  try {
    assert.deepEqual(errors, [], 'load-clean: 0 console.error');
    pushGuests(G, [g]);
    const p = hero(G, { spells: [g.id], mp: 4,
      equipment: { ring_left_1: 'x_fc4' } });
    const r = G.Spells.castOutOfCombat(p, g.id, 10);
    assert.equal(r.ok, true,
      'RED: free + нехватка маны — каст УДАЁТСЯ (факт: '
      + JSON.stringify({ ok: r.ok, reason: r.reason }) + ')');
    assert.equal(p.mp, 4, 'RED: мана НЕ тронута (факт: ' + p.mp + ')');
    assert.deepEqual(fromVm(p.outOfCombatEffects),
      [{ spellId: g.id, expiresDay: 12 }], 'запись создана');
  } finally {
    popGuests(G, [g]);
  }
});

test('000230.17-FC5 (vm): невидимость (из freeCast) + mp 30 — ok, запись, isHeroInvisible true, мана НЕ списывается (mp 30 → 30) — оба эффекта', () => {
  const { Game: G, errors } = loadVm(FULL_CHAIN, [fcRing('x_fc5', 'ocfc_inv')]);
  const g = guest('ocfc_inv',
    { действие: 'невидимость', параметры: { days: 2 } });
  try {
    assert.deepEqual(errors, [], 'load-clean: 0 console.error');
    pushGuests(G, [g]);
    const p = hero(G, { spells: [g.id], mp: 30,
      equipment: { ring_left_1: 'x_fc5' } });
    const r = G.Spells.castOutOfCombat(p, g.id, 10);
    assert.equal(r.ok, true, 'невидимость из freeCast — каст ок');
    assert.equal(r.expiresDay, 12, 'expiresDay = day + days (10 + 2)');
    assert.deepEqual(fromVm(p.outOfCombatEffects),
      [{ spellId: g.id, expiresDay: 12 }], 'запись создана');
    assert.equal(G.Spells.isHeroInvisible(p, 10), true,
      'эффект: isHeroInvisible true (день каста)');
    assert.equal(p.mp, 30,
      'RED: free_cast + невидимость — мана НЕ списывается (факт: '
      + p.mp + ')');
  } finally {
    popGuests(G, [g]);
  }
});

test('000230.17-FC6 (vm): без экипировки / без items-API — бит-в-бит платный каст + тихая деградация (0 console.error)', () => {
  // (a) полная цепь, герой БЕЗ equipment → платный, 0 console.error.
  const a = loadVm(FULL_CHAIN, [fcRing('x_fc6a', 'ocfc_free')]);
  const ga = guest('ocfc_paid');
  try {
    pushGuests(a.Game, [ga]);
    const p = hero(a.Game, { spells: [ga.id], mp: 30 }); // equipment НЕТ
    const r = a.Game.Spells.castOutOfCombat(p, ga.id, 10);
    assert.equal(r.ok, true, '(a) без экипировки — платный каст ок');
    assert.equal(p.mp, 25, '(a) мана списана (бит-в-бит, freeCast пуст)');
    assert.deepEqual(a.errors, [],
      '(a) тихая деградация: 0 console.error');
  } finally {
    popGuests(a.Game, [ga]);
  }
  // (b) цепь БЕЗ items.js, призрачная экипировка → платный, 0 ошибок.
  const b = loadVm(DEGRADED_CHAIN);
  const gb = guest('ocfc_paid');
  try {
    pushGuests(b.Game, [gb]);
    assert.equal(typeof b.Game.equipmentAffixes, 'undefined',
      '(b) items-API отсутствует в цепи');
    const p = hero(b.Game, { spells: [gb.id], mp: 30,
      equipment: { ring_left_1: 'ghost_item' } });
    const r = b.Game.Spells.castOutOfCombat(p, gb.id, 10);
    assert.equal(r.ok, true,
      '(b) без items-API — платный каст ок (не падает)');
    assert.equal(p.mp, 25, '(b) мана списана (бит-в-бит)');
    assert.equal(b.errors.length, 0,
      '(b) тихая деградация (D-11): 0 console.error');
  } finally {
    popGuests(b.Game, [gb]);
  }
});

test('000230.17-FC7 (vm): free + телепорт-отказ — {ok:false, reason «нет города с постройками»}, mp 0 НЕ +5 (R1-пин castFail), записей нет, teleport не вызван', () => {
  const { Game: G, errors } = loadVm(FULL_CHAIN, [fcRing('x_fc7', 'ocfc_gate')]);
  const g = guest('ocfc_gate',
    { действие: 'телепорт', параметры: { mode: 'город' } });
  const m = noCityCtx();
  try {
    assert.deepEqual(errors, [], 'load-clean: 0 console.error');
    pushGuests(G, [g]);
    const p = hero(G, { spells: [g.id], mp: 0,
      equipment: { ring_left_1: 'x_fc7' } });
    const r = G.Spells.castOutOfCombat(p, g.id, 10, m.ctx);
    assert.equal(r.ok, false, 'телепорт-отказ — отказ');
    assert.equal(r.reason, 'нет города с постройками',
      'RED: R1 — free-каст проходит мана-чек и доходит до '
      + 'телепорт-отказа (факт: ' + r.reason + ')');
    assert.equal(p.mp, 0,
      'RED: R1 — мана НЕ начисляется «из воздуха» (факт: ' + p.mp + ')');
    assert.deepEqual(fromVm(p.outOfCombatEffects), [],
      'записей нет (телепорт)');
    assert.equal(m.calls.length, 0, 'телепорт НЕ вызван');
  } finally {
    popGuests(G, [g]);
  }
});

test('000230.17-FC8 (vm): телепорт-отказ, НЕ free (без кольца), mp 10 — {ok:false, reason}, mp 10 (списано→откат, бит-в-бит 000235.04), записей нет, teleport не вызван', () => {
  const { Game: G, errors } = loadVm(FULL_CHAIN, [fcRing('x_fc8', 'ocfc_gate')]);
  const g = guest('ocfc_gate',
    { действие: 'телепорт', параметры: { mode: 'город' } });
  const m = noCityCtx();
  try {
    assert.deepEqual(errors, [], 'load-clean: 0 console.error');
    pushGuests(G, [g]);
    const p = hero(G, { spells: [g.id], mp: 10 }); // equipment НЕТ → paid
    const r = G.Spells.castOutOfCombat(p, g.id, 10, m.ctx);
    assert.equal(r.ok, false, 'телепорт-отказ (paid) — отказ');
    assert.equal(r.reason, 'нет города с постройками', 'причина ДЕСЛОВНО');
    assert.equal(p.mp, 10, 'mp ОТКАТНУТ (списано 5 → +5, бит-в-бит .04)');
    assert.deepEqual(fromVm(p.outOfCombatEffects), [],
      'записей нет (телепорт)');
    assert.equal(m.calls.length, 0, 'телепорт НЕ вызван');
  } finally {
    popGuests(G, [g]);
  }
});

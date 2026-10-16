// Задача 000223: КРАСНЫЕ тесты — быстрый слот = СВОЯ единица персонажа.
// Контракт — memory/000223-quick-move.md (B2: физическая модель,
// герой И союзник): «быстр.» — ровно 1 единица физически снимается из
// инвентаря и записывается в слот; «убрать» — возврат; removeItem/
// sellItem НЕ трогают занятый слот (инверсия старой авто-очистки
// items.js L497-500); расход — из слота (useQuickItem/takeQuickSlot).
//
// Все тесты красные на старом коде: слот — пин (totalQty не меняется
// после setQuick), символы useQuickItem/useQuickUnit/takeQuickSlot
// отсутствуют, removeItem авто-очистит слот, clearQuick — всегда ok.
//
// node (прямой require) — чистое ядро, DOM не участвует.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const I = require('../src/items.js');
const M = require('../src/map.js');
const { createCharacter } = require('../src/player.js');

// 20 различных лёгких реагентов — заполнение 20 слотов (~2.2 кг).
const REAG20 = [
  'ruby', 'sapphire', 'emerald', 'amethyst', 'diamond',
  'berry_red', 'berry_blue', 'berry_wild', 'herb_sun', 'herb_wind',
  'root_moon', 'root_ember', 'root_rock', 'fruit_apple', 'fruit_plum',
  'fruit_quince', 'mushroom_grey', 'mushroom_glow', 'mushroom_ink', 'quartz',
];

function fill20(c) {
  for (const id of REAG20) {
    const r = I.addItem(c, id);
    assert.equal(r.ok, true, id + ': ' + JSON.stringify(r));
  }
}

// Цикл «перенос» hero-ветки ui.js: сначала свободный слот, потом
// setQuick (порядок 000194: слот → hasItem).
function quickViaUi(c, id) {
  const s = I.freeQuickSlot(c);
  if (s == null) return { ok: false, reason: 'все быстрые слоты заняты' };
  return I.setQuick(c, s, id);
}

// Стуб globalThis.Game (паттерн withGame000133, tests/items.test.js):
// спелл-ветка читает Game ЛЕНИВО в момент ВЫЗОВА.
function withGame(game, fn) {
  const had = Object.prototype.hasOwnProperty.call(globalThis, 'Game');
  const prev = globalThis.Game;
  globalThis.Game = game;
  try {
    return fn();
  } finally {
    if (had) globalThis.Game = prev;
    else delete globalThis.Game;
  }
}

test('223-SLOT-1: setQuick — переносит ровно 1 единицу (N→N−1); слот хранит id', () => {
  const c = createCharacter();
  I.addItem(c, 'bread', 3);
  const r = I.setQuick(c, 0, 'bread');
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(I.quickItem(c, 0), 'bread', 'слот 0 = id предмета');
  assert.equal(I.totalQty(c, 'bread'), 2,
    'краснота: пин-модель не трогает запас (требуется N→N−1)');
  assert.equal(c.inventory.slots[0].qty, 2, 'стопка уменьшена до 2');
  assert.equal(I.slotCount(c), 1, 'число слотов не выросло (1 стопка)');
});

test('223-SLOT-2: повторный перенос — следующий свободный слот; 3 ед. на тип; 4-я — «все быстрые слоты заняты»', () => {
  const c = createCharacter();
  I.addItem(c, 'bread', 4);
  assert.equal(quickViaUi(c, 'bread').ok, true);
  assert.equal(quickViaUi(c, 'bread').ok, true);
  assert.equal(quickViaUi(c, 'bread').ok, true);
  assert.equal(JSON.stringify(c.inventory.quick),
    JSON.stringify(['bread', 'bread', 'bread']), '3 слота заняты');
  assert.equal(I.totalQty(c, 'bread'), 1,
    'краснота: 4→1 (пин: в запасе остаётся 4)');
  const r = quickViaUi(c, 'bread');
  assert.equal(r.ok, false, '4-й перенос — отказ (слотов нет)');
  assert.equal(r.reason, 'все быстрые слоты заняты',
    'причина дословно: ' + r.reason);
  assert.equal(I.totalQty(c, 'bread'), 1, '4-я единица осталась в запасе');
});

test('223-SLOT-3: setQuick — единица только в слоте (запас пуст) — отказ, без изменений', () => {
  const c = createCharacter();
  I.addItem(c, 'meat');
  assert.equal(I.setQuick(c, 0, 'meat').ok, true, 'первый перенос');
  assert.equal(I.totalQty(c, 'meat'), 0,
    'краснота: единица покинула инвентарь (пин: 1)');
  const r = I.setQuick(c, 1, 'meat');
  assert.equal(r.ok, false,
    'краснота: пин-модель разрешает второй пин при пустом запасе');
  assert.equal(I.quickItem(c, 1), null, 'пустой слот не задет');
  assert.equal(I.quickItem(c, 0), 'meat', 'первый слот не задет');
});

test('223-SLOT-4: setQuick по занятому слоту — старая единица возвращается, новая снимается', () => {
  const c = createCharacter();
  I.addItem(c, 'bread');
  I.addItem(c, 'meat');
  assert.equal(I.setQuick(c, 0, 'bread').ok, true);
  assert.equal(I.totalQty(c, 'bread'), 0, 'краснота: bread перенесён');
  const r = I.setQuick(c, 0, 'meat');
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(I.quickItem(c, 0), 'meat', 'слот 0 = новая единица');
  assert.equal(I.totalQty(c, 'meat'), 0,
    'краснота: новая единица снята из запаса (пин: 1)');
  assert.equal(I.totalQty(c, 'bread'), 1, 'старая единица вернулась');
});

test('223-SLOT-5: overwrite при полном инвентаре — отказ ДО мутаций (атомарность)', () => {
  const c = createCharacter();
  assert.equal(I.addItem(c, 'bread', 99).ok, true, 'стопка 99 (19.8 кг)');
  for (const id of REAG20.slice(0, 18)) {
    const r = I.addItem(c, id);
    assert.equal(r.ok, true, id + ': ' + JSON.stringify(r));
  }
  assert.equal(I.addItem(c, 'meat').ok, true, '20-й слот');
  assert.equal(I.slotCount(c), 20, 'инвентарь полный');
  // Слот владеет своей единицей, которой НЕТ в запасах (D5: слот и
  // запасы независимы) — возврат некуда (слотов нет, стопки bread
  // не для iron_sword).
  c.inventory.quick[0] = 'iron_sword';
  const r = I.setQuick(c, 0, 'meat');
  assert.equal(r.ok, false,
    'краснота: пин-модель перезаписывает слот (ok:true) при полном '
    + 'инвентаре: ' + JSON.stringify(r));
  assert.equal(r.reason, 'нет свободных слотов инвентаря',
    'причина возврата старой единицы: ' + r.reason);
  assert.equal(I.quickItem(c, 0), 'iron_sword', 'старый слот цел (без мутаций)');
  assert.equal(I.totalQty(c, 'meat'), 1, 'новая единица НЕ снята');
  assert.equal(I.totalQty(c, 'bread'), 99, 'стопка bread цела');
});

test('223-CLEAR-1: clearQuick — единица возвращается; пустой слот — ok (идемпотентно), без двойного возврата', () => {
  const c = createCharacter();
  I.addItem(c, 'healing_potion', 2);
  assert.equal(I.setQuick(c, 0, 'healing_potion').ok, true);
  assert.equal(I.totalQty(c, 'healing_potion'), 1,
    'краснота: единица покинула инвентарь (пин: 2)');
  assert.equal(I.clearQuick(c, 0).ok, true);
  assert.equal(I.quickItem(c, 0), null, 'слот очищен');
  assert.equal(I.totalQty(c, 'healing_potion'), 2,
    'единица вернулась в инвентарь');
  assert.equal(I.clearQuick(c, 0).ok, true, 'пустой слот — ok (идемпотентно)');
  assert.equal(I.totalQty(c, 'healing_potion'), 2, 'без двойного возврата');
});

test('223-CLEAR-2: clearQuick при полном инвентаре — отказ, слот СОХРАНЁН (единица не теряется)', () => {
  const c = createCharacter();
  fill20(c);
  c.inventory.quick[0] = 'iron_sword'; // своя единица (D5)
  const r = I.clearQuick(c, 0);
  assert.equal(r.ok, false,
    'краснота: старый clearQuick всегда ok (слот просто пустеет): '
    + JSON.stringify(r));
  assert.equal(r.reason, 'нет свободных слотов инвентаря',
    'причина дословно: ' + r.reason);
  assert.equal(I.quickItem(c, 0), 'iron_sword',
    'слот НЕ очищен — единица не теряется НИКОГДА');
  assert.equal(I.slotCount(c), 20, 'инвентарь не задет');
});

test('223-SET-NULL: setQuick(c, slot, null) — то же, что clearQuick (возврат единицы)', () => {
  const c = createCharacter();
  I.addItem(c, 'healing_potion');
  assert.equal(I.setQuick(c, 0, 'healing_potion').ok, true);
  assert.equal(I.totalQty(c, 'healing_potion'), 0,
    'краснота: единица покинула инвентарь (пин: 1)');
  const r = I.setQuick(c, 0, null);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(I.quickItem(c, 0), null, 'слот очищен');
  assert.equal(I.totalQty(c, 'healing_potion'), 1,
    'единица вернулась в инвентарь');
});

test('223-REMOVE-1: removeItem — НЕ очищает больше слот (инверсия items.js L497-500)', () => {
  const c = createCharacter();
  I.addItem(c, 'meat', 2);
  assert.equal(I.setQuick(c, 0, 'meat').ok, true);
  assert.equal(I.totalQty(c, 'meat'), 1,
    'краснота: одна единица перенесена (пин: 2)');
  assert.equal(I.removeItem(c, 'meat', 1).ok, true);
  assert.equal(I.quickItem(c, 0), 'meat',
    'краснота: старая авто-очистка пустит слот (единица потеряна); '
    + 'слот владеет своей единицей');
  assert.equal(I.totalQty(c, 'meat'), 0, 'запас пуст — слот на месте');
});

test('223-SELL-1: sellItem — продаёт из инвентаря; занятый слот не трогает', () => {
  const shop = I.makeShop(10, 20, M.BUILDING_TYPES.APOTHECARY, 2);
  const c = createCharacter();
  I.addItem(c, 'meat', 2);
  assert.equal(I.setQuick(c, 0, 'meat').ok, true);
  assert.equal(I.totalQty(c, 'meat'), 1,
    'краснота: одна единица перенесена (пин: 2)');
  const r = I.sellItem(shop, c, 'meat', 1);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(I.totalQty(c, 'meat'), 0, 'запас продан');
  assert.equal(I.quickItem(c, 0), 'meat',
    'краснота: старая авто-очистка (qty→0) пустит слот; слот '
    + 'независим (D5)');
});

test('223-WEIGHT-1: inventoryWeight — СЛОТЫ ТОЛЬКО: единица в слоте не считается (D6)', () => {
  const c = createCharacter();
  I.addItem(c, 'bread', 3);
  const w3 = I.inventoryWeight(c);
  assert.ok(Math.abs(w3 - 3 * 0.2) < 1e-9, 'вес 3 ед.: ' + w3);
  assert.equal(I.setQuick(c, 0, 'bread').ok, true);
  const w2 = I.inventoryWeight(c);
  assert.ok(Math.abs(w2 - 2 * 0.2) < 1e-9,
    'краснота: пин не меняет вес (пересчёт только по слотам: 2 ед. '
    + 'осталось): ' + w2);
  assert.ok(Math.abs((w3 - w2) - 0.2) < 1e-9,
    'дельта — ровно вес одной единицы');
});

test('223-BONUS-1: перенос — обычная копия СНАЧАЛА (с конца); единственная бонусная — теряется', () => {
  const c = createCharacter();
  // Бонусная ПЕРЕД обычной, обычная С КОНЦА (порядок D1: «−1», с конца).
  assert.equal(I.addItem(c, 'healing_potion', 1, { amount: 5 }).ok, true);
  assert.equal(I.addItem(c, 'healing_potion', 1).ok, true);
  assert.equal(I.setQuick(c, 0, 'healing_potion').ok, true);
  assert.equal(I.quickItem(c, 0), 'healing_potion', 'слот 0 = id');
  const slots = c.inventory.slots;
  assert.equal(slots.length, 1,
    'краснота: снята обычная копия (пин: обе копии в запасах)');
  assert.deepEqual(slots[0].bonus, { amount: 5 },
    'бонусная копия цела в запасах');
  // Теперь единственная копия — бонусная: снимается, бонус теряется.
  assert.equal(I.setQuick(c, 1, 'healing_potion').ok, true);
  assert.equal(slots.length, 0, 'единственная бонусная копия снята');
  assert.equal(I.quickItem(c, 1), 'healing_potion',
    'бонусная единица в слоте (id; бонус в слот не несётся)');
});

test('223-USE-1: useQuickItem — зелье: эффект на героя, слот очищен', () => {
  const c = createCharacter();
  c.hp = 10;
  I.addItem(c, 'healing_potion');
  assert.equal(I.setQuick(c, 0, 'healing_potion').ok, true);
  assert.equal(I.totalQty(c, 'healing_potion'), 0,
    'краснота: единица в слоте, не в запасах (пин: 1)');
  const r = I.useQuickItem(c, 0);
  assert.ok(r && r.ok === true,
    'краснота: I.useQuickItem отсутствует (символ): ' + JSON.stringify(r));
  assert.equal(c.hp, 25, 'лечение 10+15 → 25 (maxHP)');
  assert.equal(r.hp, 15, 'useItem-форма результата: hp');
  assert.ok(String(r.message).includes('+15 HP'), 'сообщение: ' + r.message);
  assert.equal(I.quickItem(c, 0), null, 'расход ИЗ СЛОТА — слот очищен');
});

test('223-USE-2: useQuickItem — реагент: «реагент нельзя применить (торговый товар)», слот цел', () => {
  const c = createCharacter();
  I.addItem(c, 'sulfur');
  assert.equal(I.setQuick(c, 0, 'sulfur').ok, true);
  const r = I.useQuickItem(c, 0);
  assert.equal(r.ok, false,
    'краснота: I.useQuickItem отсутствует: ' + JSON.stringify(r));
  assert.equal(r.reason, 'реагент нельзя применить (торговый товар)',
    'причина дословно (паритет useItem): ' + r.reason);
  assert.equal(I.quickItem(c, 0), 'sulfur', 'слот цел (отказ — не расход)');
});

test('223-USE-3: useQuickItem — оружие: «оружие — экипируется», слот цел', () => {
  const c = createCharacter();
  I.addItem(c, 'wood_sword');
  assert.equal(I.setQuick(c, 0, 'wood_sword').ok, true);
  const r = I.useQuickItem(c, 0);
  assert.equal(r.ok, false,
    'краснота: I.useQuickItem отсутствует: ' + JSON.stringify(r));
  assert.equal(r.reason, 'оружие — экипируется',
    'причина дословно: ' + r.reason);
  assert.equal(I.quickItem(c, 0), 'wood_sword', 'слот цел');
});

test('223-USE-4: useQuickItem — resurrection_scroll: «только в бою», слот цел', () => {
  const c = createCharacter();
  I.addItem(c, 'resurrect_scroll');
  assert.equal(I.setQuick(c, 0, 'resurrect_scroll').ok, true);
  const r = I.useQuickItem(c, 0);
  assert.equal(r.ok, false,
    'краснота: I.useQuickItem отсутствует: ' + JSON.stringify(r));
  assert.equal(r.reason, 'Свиток воскрешения можно применить только в бою',
    'причина дословно: ' + r.reason);
  assert.equal(I.quickItem(c, 0), 'resurrect_scroll',
    'слот цел (боевая обработка — combat.js, D7)');
});

test('223-USE-5: useQuickItem — spell_scroll: canLearn-отказ (stub Game.Spells) — слот цел; успех — слот очищен + изучено', () => {
  withGame({ Spells: {
    canLearn: () => ({ ok: false, reason: 'нужен ранг школы «Знаток»' }),
    learn: () => {},
    getSpell: () => null,
  } }, () => {
    const c = createCharacter();
    I.addItem(c, 'fireball_scroll');
    assert.equal(I.setQuick(c, 0, 'fireball_scroll').ok, true);
    const r = I.useQuickItem(c, 0);
    assert.equal(r.ok, false,
      'краснота: I.useQuickItem отсутствует: ' + JSON.stringify(r));
    assert.equal(r.reason, 'нужен ранг школы «Знаток»',
      'причина — из canLearn (до расхода): ' + r.reason);
    assert.equal(I.quickItem(c, 0), 'fireball_scroll',
      'слот цел (отказ — не расход)');
  });
  const learned = [];
  withGame({ Spells: {
    canLearn: () => ({ ok: true }),
    learn: (t, spell, src) => { learned.push([spell, src]); },
    getSpell: () => ({ название: 'Огненный шар' }),
  } }, () => {
    const c = createCharacter();
    I.addItem(c, 'fireball_scroll');
    assert.equal(I.setQuick(c, 0, 'fireball_scroll').ok, true);
    const r2 = I.useQuickItem(c, 0);
    assert.equal(r2.ok, true, JSON.stringify(r2));
    assert.equal(r2.spell, 'fireball', 'useItem-форма результата: spell');
    assert.equal(JSON.stringify(learned),
      JSON.stringify([['fireball', 'scroll']]),
      'learn — на носителе (c), source «scroll»');
    assert.equal(r2.message, 'Изучено: «Огненный шар»',
      'сообщение дословно: ' + r2.message);
    assert.equal(I.quickItem(c, 0), null, 'успех — слот очищен');
  });
});

test('223-USE-6: useQuickItem — пустой слот — «быстрый слот 1 пуст»; вне диапазона — «неверный быстрый слот»; ghost-id — «неизвестный предмет: <id>»', () => {
  const c = createCharacter();
  let r = I.useQuickItem(c, 0);
  assert.equal(r.ok, false,
    'краснота: I.useQuickItem отсутствует: ' + JSON.stringify(r));
  assert.equal(r.reason, 'быстрый слот 1 пуст',
    'причина дословно: ' + r.reason);
  r = I.useQuickItem(c, 3);
  assert.equal(r.ok, false, 'слот вне диапазона — отказ');
  assert.equal(r.reason, 'неверный быстрый слот',
    'причина дословно: ' + r.reason);
  c.inventory.quick[1] = 'ghost_item'; // ghost-id в слоте (артефакт сейва)
  r = I.useQuickItem(c, 1);
  assert.equal(r.ok, false, 'ghost-id — отказ');
  assert.equal(r.reason, 'неизвестный предмет: ghost_item',
    'причина СОХРАНЕНА: ' + r.reason);
  assert.equal(I.quickItem(c, 1), 'ghost_item', 'слот цел');
});

test('223-TAKE-1: takeQuickSlot — {ok:true, id} + слот очищен; пустой — id:null; вне диапазона — отказ', () => {
  const c = createCharacter();
  I.addItem(c, 'resurrect_scroll');
  assert.equal(I.setQuick(c, 0, 'resurrect_scroll').ok, true);
  assert.equal(I.totalQty(c, 'resurrect_scroll'), 0,
    'краснота: единица в слоте (пин: 1)');
  const r = I.takeQuickSlot(c, 0);
  assert.ok(r && r.ok === true,
    'краснота: I.takeQuickSlot отсутствует (символ): ' + JSON.stringify(r));
  assert.equal(r.id, 'resurrect_scroll', 'id вынут из слота');
  assert.equal(I.quickItem(c, 0), null, 'слот очищен');
  const r2 = I.takeQuickSlot(c, 0);
  assert.equal(r2.ok, true, 'пустой слот — ok');
  assert.equal(r2.id, null, 'пустой слот — id:null');
  const r3 = I.takeQuickSlot(c, 5);
  assert.equal(r3.ok, false, 'вне диапазона — отказ');
  assert.equal(r3.reason, 'неверный быстрый слот', 'причина: ' + r3.reason);
});

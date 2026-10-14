// Задача 000194: useItem(c, itemId, qty, learnTarget, effectTarget) —
// 5-й аргумент: цель ЭФФЕКТА (heal/mp/food). Предмет ВСЕГДА расходуется
// с c (носитель инвентаря — герой); heal/mp/food применяются на
// effectTarget (T.maxHP/T.maxMP — капы, ДЕЛЬТА в сообщении — фактическая),
// множители (potionPowerMult/foodPowerMult) — с НОСИТЕЛЯ; skill_book/
// spell_scroll/practice — всегда на носителе (без изменений).
//
// Красные (4): эффект на 5-м аргументе. Якорь (1): 2-арг. путь героя
// и learnTarget — бит-в-бит.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createCharacter } = require('../src/player.js');
const I = require('../src/items.js');

// Мини-«юнит» цели эффекта: hp/mp/maxHP/maxMP (объект, не sheet —
// useItem должен работать с любым носителем этих полей).
function miniUnit() {
  return { hp: 0, maxHP: 10, mp: 2, maxMP: 5 };
}

test('194-ET-POTION: 5-й аргумент — heal на ЦЕЛИ (кап T.maxHP), носитель не тронут, предмет с носителя', () => {
  const hero = createCharacter();
  I.addItem(hero, 'healing_potion');
  const hp0 = hero.hp;
  const unit = miniUnit();
  const r = I.useItem(hero, 'healing_potion', 1, null, unit);
  assert.equal(r.ok, true,
    'краснота (5-й аргумент не существует): ' + JSON.stringify(r));
  assert.equal(unit.hp, 10,
    'цель: 0 → 10 (кап maxHP 10 от 15; краснота: ' + unit.hp + ')');
  assert.equal(hero.hp, hp0, 'носитель не тронут');
  assert.equal(I.totalQty(hero, 'healing_potion'), 0,
    'предмет расходуется с НОСИТЕЛЯ');
});

test('194-ET-MP: 5-й аргумент — mp на ЦЕЛИ (кап T.maxMP)', () => {
  const hero = createCharacter();
  I.addItem(hero, 'mana_potion');
  const mp0 = hero.mp;
  const unit = miniUnit();
  const r = I.useItem(hero, 'mana_potion', 1, null, unit);
  assert.equal(r.ok, true,
    'краснота (5-й аргумент не существует): ' + JSON.stringify(r));
  assert.equal(unit.mp, 5,
    'цель: 2 → 5 (кап maxMP 5 от 10; краснота: ' + unit.mp + ')');
  assert.equal(hero.mp, mp0, 'носитель не тронут');
  assert.equal(I.totalQty(hero, 'mana_potion'), 0,
    'предмет расходуется с НОСИТЕЛЯ');
});

test('194-ET-FOOD: 5-й аргумент — еда на ЦЕЛИ', () => {
  const hero = createCharacter();
  I.addItem(hero, 'meat');
  const hp0 = hero.hp;
  const unit = miniUnit();
  const r = I.useItem(hero, 'meat', 1, null, unit);
  assert.equal(r.ok, true,
    'краснота (5-й аргумент не существует): ' + JSON.stringify(r));
  assert.equal(unit.hp, 8,
    'цель: 0 → 8 (ед 8; краснота: ' + unit.hp + ')');
  assert.equal(hero.hp, hp0, 'носитель не тронут');
  assert.equal(I.totalQty(hero, 'meat'), 0, 'предмет расходуется с НОСИТЕЛЯ');
});

test('194-ET-MULT: множители (potionPowerMult) — с НОСИТЕЛЯ, не с цели', () => {
  const hero = createCharacter();
  hero.secondary.alchemy = 2; // potionPowerMult = 1 + 0.05·2 = 1.1
  I.addItem(hero, 'healing_potion');
  const unit = { hp: 0, maxHP: 100, mp: 0, maxMP: 0 };
  const r = I.useItem(hero, 'healing_potion', 1, null, unit);
  assert.equal(r.ok, true,
    'краснота (5-й аргумент не существует): ' + JSON.stringify(r));
  assert.equal(unit.hp, 17,
    'цель: round(15 × 1.1) = 17 (множитель НОСИТЕЛЯ; краснота: '
    + unit.hp + ')');
});

test('194-ET-REGR (якорь): 2-арг. путь героя и learnTarget (4-й) — без изменений', () => {
  // 2-арг. путь (hero — и носитель, и цель).
  const p = createCharacter();
  I.addItem(p, 'healing_potion');
  p.hp = 5;
  const r = I.useItem(p, 'healing_potion');
  assert.equal(r.ok, true);
  assert.equal(p.hp, 20, '+15 HP (5 → 20, кап maxHP не ниже 25)');
  assert.equal(I.totalQty(p, 'healing_potion'), 0);
  // skill_book: опыт — на learnTarget (4-й аргумент), 5-й (effectTarget)
  // не меняет, кто получает навык.
  const p2 = createCharacter();
  I.addItem(p2, 'alchemy_manual');
  const unit = { hp: 0, maxHP: 100, mp: 0, maxMP: 0 };
  const xp0 = (p2.skillXp && p2.skillXp.alchemy) || 0;
  const r2 = I.useItem(p2, 'alchemy_manual', 1, p2, unit);
  assert.equal(r2.ok, true);
  const xp1 = (p2.skillXp && p2.skillXp.alchemy) || 0;
  assert.equal(xp1 - xp0, 10, 'опыт навыка — на НОСИТЕЛЕ (learnTarget)');
  assert.equal(unit.hp, 0, 'книга не лечит цель эффекта');
});

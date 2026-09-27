const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  createCharacter, sanitizeSavedHero, derived, canRaise, raiseSkill,
  addXp, takeDamage, heal, restoreDay,
  xpForNext, secondaryName, rankOf,
  PRIMARY_SKILLS, SECONDARY_SKILLS, POINTS_PER_LEVEL, MAX_SKILL_LEVEL,
} = require('../src/player.js');

test('начальный персонаж: статы и здоровье', () => {
  const c = createCharacter();
  assert.equal(c.level, 1);
  assert.equal(c.xp, 0);
  assert.equal(c.totalXp, 0);
  assert.equal(c.alive, true);
  assert.equal(c.points, 0);
  for (const p of PRIMARY_SKILLS) {
    assert.equal(c.primary[p.id], 1, `базовый навык ${p.id} != 1`);
  }
  const d = derived(c);
  assert.equal(c.hp, d.maxHP);
  assert.equal(c.mp, d.maxMP);
  assert.ok(d.maxHP >= 20 && d.maxMP >= 10);
});

test('xpForNext монотонно растёт', () => {
  for (let l = 1; l < 50; l++) {
    assert.ok(xpForNext(l + 1) > xpForNext(l), `xpForNext(${l + 1}) <= xpForNext(${l})`);
  }
  assert.equal(xpForNext(1), 50);
});

test('addXp: уровень вверх, очки навыков выданы', () => {
  const c = createCharacter();
  const r = addXp(c, xpForNext(1));
  assert.equal(c.level, 2);
  assert.equal(r.levelsGained, 1);
  assert.equal(r.pointsGained, POINTS_PER_LEVEL);
  assert.equal(c.points, POINTS_PER_LEVEL);
  assert.equal(c.totalXp, xpForNext(1));
});

test('addXp: несколько уровней за раз и остаток опыта', () => {
  const c = createCharacter();
  const need = xpForNext(1) + xpForNext(2);
  const r = addXp(c, need + 7);
  assert.equal(c.level, 3);
  assert.equal(r.levelsGained, 2);
  assert.equal(c.xp, 7);
  assert.equal(c.points, 2 * POINTS_PER_LEVEL);
});

test('addXp: «Учёный» даёт +2% опыта за уровень', () => {
  const plain = createCharacter();
  const smart = createCharacter();
  smart.secondary.scholar = 10; // +20% опыта
  addXp(plain, 1000);
  addXp(smart, 1000);
  assert.ok(smart.totalXp > plain.totalXp,
    `totalXp: smart=${smart.totalXp} plain=${plain.totalXp}`);
  assert.equal(smart.totalXp, Math.round(1000 * 1.2));
});

test('raiseSkill: основной навык', () => {
  const c = createCharacter();
  assert.equal(canRaise(c, 'strength').ok, false, 'без очков нельзя');
  c.points = 3;
  const r = raiseSkill(c, 'strength');
  assert.equal(r.ok, true);
  assert.equal(c.primary.strength, 2);
  assert.equal(c.points, 2);
  // до максимума
  c.primary.strength = MAX_SKILL_LEVEL;
  c.points = 1;
  assert.equal(canRaise(c, 'strength').ok, false);
});

test('raiseSkill: вторичный навык и требования дерева', () => {
  const c = createCharacter();
  c.points = 20;
  // «Тяжёлое оружие» требует «Мечник 5» — пока нельзя.
  let check = canRaise(c, 'heavy');
  assert.equal(check.ok, false);
  assert.match(check.reason, /Мечник 5/);
  // Качаем «Мечник» до 5 — теперь можно.
  for (let i = 0; i < 5; i++) assert.equal(raiseSkill(c, 'swordsman').ok, true);
  check = canRaise(c, 'heavy');
  assert.equal(check.ok, true);
  const r = raiseSkill(c, 'heavy');
  assert.equal(r.ok, true);
  assert.equal(c.secondary.heavy, 1);
  // «Стрелок» требует «Меткость 5».
  assert.equal(canRaise(c, 'archer').ok, false);
  for (let i = 0; i < 5; i++) assert.equal(raiseSkill(c, 'accuracy').ok, true);
  assert.equal(canRaise(c, 'archer').ok, true);
});

test('raiseSkill: неизвестный навык отклоняется', () => {
  const c = createCharacter();
  c.points = 1;
  const r = raiseSkill(c, 'nonexistent');
  assert.equal(r.ok, false);
});

test('ранги: границы уровней', () => {
  assert.equal(rankOf(1).name, 'Новичок');
  assert.equal(rankOf(10).name, 'Новичок');
  assert.equal(rankOf(11).name, 'Ученик');
  assert.equal(rankOf(25).name, 'Ученик');
  assert.equal(rankOf(26).name, 'Знаток');
  assert.equal(rankOf(50).name, 'Знаток');
  assert.equal(rankOf(51).name, 'Мастер');
  assert.equal(rankOf(75).name, 'Мастер');
  assert.equal(rankOf(76).name, 'Гроссмейстер');
  assert.equal(rankOf(99).name, 'Гроссмейстер');
  assert.equal(rankOf(100).name, 'Легенда');
});

test('вторичные навыки переименовываются по рангам', () => {
  assert.equal(secondaryName('swordsman', 1), 'Начинающий мечник');
  assert.equal(secondaryName('swordsman', 11), 'Ученик фехтовальщика');
  assert.equal(secondaryName('swordsman', 51), 'Мастер меча');
  assert.equal(secondaryName('swordsman', 100), 'Легенда клинка');
  // Все навыки имеют 6 имён (по числу рангов).
  for (const [id, s] of Object.entries(SECONDARY_SKILLS)) {
    assert.equal(s.names.length, 6, `у навыка ${id} нет 6 имён`);
    assert.ok(s.primary, `у навыка ${id} нет основного навыка`);
  }
});

test('derived: формулы эффектов', () => {
  const c = createCharacter();
  // Железная кожа: -5% урона за уровень.
  c.secondary.hide = 4;
  assert.ok(Math.abs(derived(c).damageTakenMult - 0.8) < 1e-9);
  // Выносливость: +3% к макс. HP; Голем: +2% HP и +1 броня.
  c.secondary.endurance = 5;
  c.secondary.golem = 3;
  const d1 = derived(c);
  assert.equal(d1.armor, 3);
  // (20 + 1*5) * (1 + 0.03*5 + 0.02*3) = 25 * 1.21 = 30.25 → 30
  assert.equal(d1.maxHP, 30, 'maxHP не вырос от навыков');
  // Базовая проверка формулы.
  const base = derived(createCharacter());
  assert.equal(base.maxHP, 25); // 20 + 1*5
  assert.equal(base.maxMP, 16); // 10 + (1+1)*3
  // Меткость: +5% урона дальнего боя.
  c.secondary.accuracy = 10;
  assert.ok(Math.abs(derived(c).rangedDamageBonus - 0.5) < 1e-9);
  // Торговец: -5% покупка, +5% продажа.
  c.secondary.merchant = 2;
  const dm = derived(c);
  assert.ok(Math.abs(dm.buyPriceMult - 0.9) < 1e-9);
  assert.ok(Math.abs(dm.sellPriceMult - 1.1) < 1e-9);
});

test('derived: ход и действия в бою от основных навыков', () => {
  const c = createCharacter();
  const d0 = derived(c);
  assert.equal(d0.moveCells, 3); // 3 + floor(1/5)
  assert.equal(d0.attackActions, 1); // 1 + floor(1/10)
  c.primary.dexterity = 15;
  c.primary.strength = 21;
  const d1 = derived(c);
  assert.equal(d1.moveCells, 6); // 3 + floor(15/5)
  assert.equal(d1.attackActions, 3); // 1 + floor(21/10)
});

test('damage: урон учитывает «Железную кожу», смерть при hp<=0', () => {
  const c = createCharacter();
  c.secondary.hide = 2; // -10% урона
  const before = c.hp;
  takeDamage(c, 10);
  assert.equal(c.hp, before - 9); // 10 * 0.9
  // Смерть.
  takeDamage(c, c.hp + 100);
  assert.equal(c.alive, false);
  assert.equal(c.hp, 0);
  // Мёртвый больше не получает опыт и очки.
  const r = addXp(c, 10000);
  assert.equal(r.levelsGained, 0);
});

test('heal: не превышает максимум', () => {
  const c = createCharacter();
  const max = derived(c).maxHP;
  heal(c, max * 10);
  assert.equal(c.hp, max);
});

test('restoreDay: восстановление между днями', () => {
  const c = createCharacter();
  takeDamage(c, 10);
  const before = c.hp;
  restoreDay(c);
  assert.ok(c.hp > before, 'здоровье не восстановилось');
  assert.ok(c.hp <= derived(c).maxHP, 'здоровье выше максимума');
  // «Медитация» и «Глубокий вдох» ускоряют восстановление.
  const c2 = createCharacter();
  c2.secondary.meditation = 10;
  c2.secondary.breath = 10;
  takeDamage(c2, 10);
  restoreDay(c2);
  assert.ok(c2.hp > c.hp, 'навыки восстановления не ускоряют реген');
});

test('restoreDay: формулы (база 10%, Медитация +2% к HP и MP, Глубокий вдох +5% к HP)', () => {
  const c = createCharacter();
  c.secondary.meditation = 10;
  c.secondary.breath = 10;
  const d = derived(c);
  assert.ok(Math.abs(d.hpRegenMult - (0.10 + 0.05 * 10 + 0.02 * 10)) < 1e-9);
  assert.ok(Math.abs(d.mpRegenMult - (0.10 + 0.02 * 10)) < 1e-9);
  c.hp = 0;
  c.mp = 0;
  restoreDay(c);
  assert.equal(c.hp, Math.round(d.maxHP * d.hpRegenMult));
  assert.equal(c.mp, Math.round(d.maxMP * d.mpRegenMult));
  // Без навыков — база 10%.
  const c0 = createCharacter();
  const d0 = derived(c0);
  assert.ok(Math.abs(d0.hpRegenMult - 0.10) < 1e-9);
  assert.ok(Math.abs(d0.mpRegenMult - 0.10) < 1e-9);
});

// --- sanitizeSavedHero (восстановление сейва, задачи 000029/000031) ---
// Ключевой сценарий: сейв живёт в localStorage между версиями игры;
// битый/подделанный персонаж НЕ должен ронять игру (раньше
// Object.assign без валидации давал NaN-характеристики и TypeError
// в рендере панели).

function validSavedHero() {
  return {
    name: 'Флогистон',
    level: 5, xp: 120, totalXp: 900, gold: 340, hp: 37, mp: 8, points: 2,
    primary: {
      strength: 3, dexterity: 2, constitution: 2,
      intelligence: 2, wisdom: 1, charisma: 1,
    },
    secondary: { endurance: 3, meditation: 1 },
    skillXp: { endurance: 40 },
    alive: false, // даже «мёртвый» сейв восстанавливаем живым
  };
}

test('sanitizeSavedHero: валидный сейв — поля переносятся, alive принудительно true', () => {
  const clean = sanitizeSavedHero(validSavedHero());
  assert.ok(clean);
  assert.equal(clean.level, 5);
  assert.equal(clean.xp, 120);
  assert.equal(clean.totalXp, 900);
  assert.equal(clean.gold, 340);
  assert.equal(clean.hp, 37);
  assert.equal(clean.mp, 8);
  assert.equal(clean.points, 2);
  assert.deepEqual(clean.primary, validSavedHero().primary);
  assert.deepEqual(clean.secondary, { endurance: 3, meditation: 1 });
  assert.deepEqual(clean.skillXp, { endurance: 40 });
  assert.equal(clean.alive, true);
  assert.equal(clean.name, 'Флогистон');
  //derived на чистом персонаже — без NaN (регрессия: нечисловой уровень
  // вторичного навыка давал maxHP = NaN).
  const d = derived(Object.assign(createCharacter(), clean));
  assert.ok(Number.isFinite(d.maxHP));
  assert.ok(Number.isFinite(d.maxMP));
});

test('sanitizeSavedHero: битое ядро → null (персонаж не восстанавливается)', () => {
  for (const [field, bad] of [
    ['level', '5'], ['level', 0], ['level', 1.5], ['level', NaN],
    ['xp', -1], ['xp', '100'], ['xp', Infinity],
    ['gold', -5], ['gold', null],
    ['hp', '30'], ['hp', NaN],
  ]) {
    const s = validSavedHero();
    s[field] = bad;
    assert.equal(sanitizeSavedHero(s), null, field + ' = ' + JSON.stringify(bad));
  }
  // primary бит — все шесть обязательны.
  for (const [skill, bad] of [
    ['strength', 0], ['dexterity', -1], ['constitution', '2'],
    ['intelligence', NaN], ['wisdom', null], ['charisma', undefined],
  ]) {
    const s = validSavedHero();
    s.primary[skill] = bad;
    assert.equal(sanitizeSavedHero(s), null, 'primary.' + skill);
  }
  // primary не объект / массив / отсутствует.
  for (const bad of [null, 5, 'obj', [1, 1, 1, 1, 1, 1]]) {
    const s = validSavedHero();
    s.primary = bad;
    assert.equal(sanitizeSavedHero(s), null, 'primary = ' + JSON.stringify(bad));
  }
  // Сами данные не объект.
  assert.equal(sanitizeSavedHero(null), null);
  assert.equal(sanitizeSavedHero('hero'), null);
  assert.equal(sanitizeSavedHero([1, 2]), null);
  assert.equal(sanitizeSavedHero(42), null);
});

test('sanitizeSavedHero: вторичные навыки — посчётный отброс мусора', () => {
  const s = validSavedHero();
  s.secondary = {
    endurance: 3,        // валидный — остаётся
    'unknown_skill': 5,  // нет в каталоге — отбросить
    meditation: '1',     // нецелый уровень — отбросить (было: maxHP NaN)
    golem: -2,           // отрицательный — отбросить
    swordsman: 2.5,      // дробный — отбросить
    firelord: 0,         // ноль — допустим (не трогать)
  };
  const clean = sanitizeSavedHero(s);
  assert.ok(clean);
  assert.deepEqual(clean.secondary, { endurance: 3, firelord: 0 });
  // secondary не объект → пустой набор, но персонаж восстанавливается.
  const s2 = validSavedHero();
  s2.secondary = 'junk';
  assert.deepEqual(sanitizeSavedHero(s2).secondary, {});
});

test('sanitizeSavedHero: skillXp — посчётный отброс, mp/points/name нормализация', () => {
  const s = validSavedHero();
  s.skillXp = { endurance: 40, 'nope': 5, meditation: 'x', nature: -3 };
  const clean = sanitizeSavedHero(s);
  assert.ok(clean);
  assert.deepEqual(clean.skillXp, { endurance: 40 });

  const s2 = validSavedHero();
  s2.mp = '8'; s2.points = -1; s2.name = 42; s2.totalXp = NaN;
  const c2 = sanitizeSavedHero(s2);
  assert.ok(c2);
  assert.equal(c2.mp, 0);
  assert.equal(c2.points, 0);
  assert.equal(c2.name, 'Флогистон');
  assert.equal(c2.totalXp, c2.xp, 'totalXp невалиден → берём xp');
});

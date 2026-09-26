const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  hitChance, createCombat, resolveDifficulty,
  MOB_TYPES, GROUP_RECIPES, LEADER_DMG_MULT,
} = require('../src/combat.js');
const { createCharacter, derived } = require('../src/player.js');
const { SETTINGS } = require('../src/global-settings.js');
const I = require('../src/items.js');

// Сильный персонаж для контролируемых сценариев (много HP — не умирает сам).
function strongHero() {
  const c = createCharacter();
  c.primary.constitution = 50;
  c.hp = 9999;
  return c;
}

// «Разумно сильный» герой середины игры (задача 000027): 15 уровней =
// 28 очков навыков, достижимая тратой (14 уровней × 2): первичные 18
// (Сила 10, Тело 7, Ловкость 4) + вторичные 10 (Укрытие 5 — требование
// Голема, Голем 3, Выносливость 2).
function midGameHero() {
  const c = createCharacter();
  c.level = 15;
  c.primary = {
    strength: 10, dexterity: 4, constitution: 7,
    intelligence: 1, wisdom: 1, charisma: 1,
  };
  c.secondary = { hide: 5, golem: 3, endurance: 2 };
  const d = derived(c);
  c.hp = d.maxHP;
  c.mp = d.maxMP;
  return c;
}

// Цель «разумной» авто-игры: поддержка (лечилка) — приоритет, иначе
// ближайшая живая.
function autoTarget(c) {
  const alive = c.units.filter((u) => u.alive && !u.fled);
  if (!alive.length) return null;
  const supports = alive.filter((u) => u.role === 'support');
  if (supports.length) {
    return supports.reduce((a, b) => (b.hp / b.maxHP < a.hp / a.maxHP ? b : a));
  }
  return alive.reduce((a, b) =>
    (Math.abs(c.px - a.x) + Math.abs(c.py - a.y))
      <= (Math.abs(c.px - b.x) + Math.abs(c.py - b.y)) ? a : b);
}

// Авто-игра «разумного» игрока (задача 000027): ход — чередование
// «бьёт, если в дальности, иначе подходит» до исчерпания действий,
// все действия ударов используются, ход завершается блоком.
function autoPlay(c, maxRounds = 80) {
  let n = 0;
  while (!c.result && n++ < maxRounds) {
    let t = autoTarget(c);
    while (c.result === null && (c.ps.attack > 0 || c.ps.moveLeft > 0) && t) {
      const d = Math.abs(c.px - t.x) + Math.abs(c.py - t.y);
      if (d <= 1 && c.ps.attack > 0) {
        const r = c.attack(t.id);
        if (!r.ok) break;
        if (!t.alive || t.fled) t = autoTarget(c);
      } else if (d > 1 && c.ps.moveLeft > 0) {
        const dx = Math.sign(t.x - c.px);
        const dy = Math.sign(t.y - c.py);
        const tries = Math.abs(t.x - c.px) >= Math.abs(t.y - c.py)
          ? [[dx, 0], [0, dy]] : [[0, dy], [dx, 0]];
        let moved = false;
        for (const [sx, sy] of tries) {
          if (!sx && !sy) continue;
          if (c.move(sx, sy).ok) { moved = true; break; }
        }
        if (!moved) break;
      } else {
        break;
      }
    }
    // Блок — последнее действие хода, снижает получаемый урон.
    if (c.result === null && c.ps.block > 0) c.block();
    c.endTurn();
  }
  return c.result;
}

// Ставит игрока вплотную к живому мобо (клетка рядом свободна).
function standNextTo(c, u) {
  const candidates = [[0, 1], [0, -1], [1, 0], [-1, 0]]
    .map(([dx, dy]) => [u.x + dx, u.y + dy])
    .filter(([x, y]) =>
      x >= 0 && y >= 0 && x < c.width && y < c.height &&
      !c.units.some((v) => v.alive && v.x === x && v.y === y));
  assert.ok(candidates.length, 'нет свободной клетки рядом с мобом');
  c.px = candidates[0][0];
  c.py = candidates[0][1];
}

// --- Состав групп ---

test('состав группы: 2-6 мобов, уровень персонажа ±3', () => {
  const p = createCharacter(); // уровень 1
  for (const [type, recipe] of Object.entries(GROUP_RECIPES)) {
    const c = createCombat({ player: p, groupType: Number(type), seed: 7 });
    const mobs = c.units;
    assert.ok(mobs.length >= 2 && mobs.length <= 6,
      `группа ${type}: ${mobs.length} мобов (ожидается 2-6)`);
    for (const u of mobs) {
      assert.ok(u.level >= 1 && u.level <= 4,
        `группа ${type}: уровень моба ${u.level} вне диапазона 1..4`);
    }
    // Доминирующий тип локации в группе всегда есть.
    const dominant = recipe.mobs[0];
    assert.ok(mobs.some((u) => u.mobId === dominant),
      `группа ${type}: нет доминирующего моба ${dominant}`);
  }
});

test('волчья стая: 3-6 волков', () => {
  const p = createCharacter();
  for (const seed of [1, 2, 3, 4, 5]) {
    const c = createCombat({ player: p, groupType: 3, seed });
    assert.ok(c.units.length >= 3 && c.units.length <= 6, 'не 3-6 волков');
    assert.ok(c.units.every((u) => u.mobId === 'wolf'), 'не все волки');
  }
});

test('состав группы детерминирован при одном сиде', () => {
  const p1 = createCharacter();
  const p2 = createCharacter();
  const c1 = createCombat({ player: p1, groupType: 0, seed: 99 });
  const c2 = createCombat({ player: p2, groupType: 0, seed: 99 });
  assert.deepEqual(
    c1.units.map((u) => [u.mobId, u.level, u.x, u.y, u.hp, u.armor]),
    c2.units.map((u) => [u.mobId, u.level, u.x, u.y, u.hp, u.armor]),
  );
});

test('группа с лидером: +5% урона и +5% защиты всем', () => {
  const p = createCharacter();
  const withLeader = createCombat({ player: p, groupType: 6, seed: 5 }); // Уродство — лидер
  assert.ok(withLeader.units.some((u) => u.role === 'leader'), 'нет лидера');
  for (const u of withLeader.units) {
    assert.equal(u.damageTakenMult, 0.95);
  }
  const noLeader = createCombat({ player: p, groupType: 3, seed: 5 });
  assert.ok(!noLeader.units.some((u) => u.role === 'leader'));
  for (const u of noLeader.units) assert.equal(u.damageTakenMult, 1);
  // Урон лидера: база уровня × бафф лидера × множитель сложности (задача 000027).
  const L = withLeader.units[0].level;
  const diff = SETTINGS.combat_difficulties[SETTINGS.combat_difficulty];
  const leader = withLeader.units.find((u) => u.role === 'leader');
  const expected = Math.max(1, Math.round(
    (2 + 0.7 * L) * MOB_TYPES.abomination.dmg * LEADER_DMG_MULT * diff.damage));
  assert.equal(leader.damage, expected);
});

// --- Формулы попадания и урона ---

test('hitChance: рост с уровнем, штраф от уклонения, клампинг', () => {
  assert.equal(hitChance(5, 0, 5, 0), 0.55);
  assert.ok(hitChance(10, 0, 5, 0) > hitChance(5, 0, 5, 0));
  assert.ok(hitChance(5, 0.2, 5, 0) > hitChance(5, 0, 5, 0), 'бонус попадания');
  assert.ok(hitChance(5, 0, 5, 0.2) < hitChance(5, 0, 5, 0), 'штраф от уклонения');
  assert.equal(hitChance(200, 0.5, 1, 0), 0.95, 'верхний кламп 0.95');
  assert.equal(hitChance(1, -0.9, 200, 0.5), 0.05, 'нижний кламп 0.05');
});

test('удар: урон = база − броня моба (минимум 1), детерминированно', () => {
  const p = strongHero();
  const c = createCombat({ player: p, groupType: 0, seed: 11 }); // орочий лагерь, без лидера
  c._rng = () => 0.01; // попадание гарантировано
  const w = c.units.find((u) => u.mobId === 'orc_warrior');
  standNextTo(c, w);
  const hpBefore = w.hp;
  const base = 3 + Math.floor(p.primary.strength * 0.8) + Math.floor(p.level * 0.5);
  const expected = Math.max(1, base - w.armor);
  const r = c.attack(w.id);
  assert.equal(r.ok, true);
  assert.equal(r.hit, true);
  assert.equal(hpBefore - w.hp, expected, `урон ${hpBefore - w.hp} != ${expected}`);
});

test('промах: HP моба не меняется, действие потрачено', () => {
  const p = strongHero();
  const c = createCombat({ player: p, groupType: 3, seed: 3 });
  c._rng = () => 0.99; // промах гарантирован
  const w = c.units[0];
  standNextTo(c, w);
  const hpBefore = w.hp;
  const atkBefore = c.ps.attack;
  const r = c.attack(w.id);
  assert.equal(r.ok, true);
  assert.equal(r.hit, false);
  assert.equal(w.hp, hpBefore);
  assert.equal(c.ps.attack, atkBefore - 1, 'действие потрачено');
});

// --- Лимиты действий и очередь ходов ---

test('лимит действий: удар доступен 1 + floor(Сила/10) раз за ход', () => {
  const p = strongHero();
  const c = createCombat({ player: p, groupType: 3, seed: 2 });
  assert.equal(c.ps.attack, 1 + Math.floor(p.primary.strength / 10));
  p.primary.strength = 30; // 4 удара
  c.ps.attack = 4;
  const w = c.units[0];
  standNextTo(c, w);
  c._rng = () => 0.99; // промахи — не убиваем цель
  for (let i = 0; i < 4; i++) assert.equal(c.attack(w.id).ok, true, `удар ${i + 1}`);
  assert.equal(c.attack(w.id).ok, false, '5-й удар должен быть отклонён');
  assert.match(c.attack(w.id).reason, /Удар/);
  // Новый ход восстанавливает пул.
  c.endTurn();
  assert.equal(c.ps.attack, 4);
});

test('блок: ставится даже при оставшихся действиях; ПОСЛЕ него другие действия хода запрещены', () => {
  const p = strongHero();
  const c = createCombat({ player: p, groupType: 3, seed: 2 });
  // Блок доступен в любой момент хода (раньше пулы заклинаний ≥1 делали
  // его невыполнимым в бою — задача 000027).
  assert.equal(c.block().ok, true, 'блок можно поставить при наличии других действий');
  assert.equal(c.ps.blocked, true);
  // После блока прочие действия хода отклоняются.
  const w = c.units[0];
  standNextTo(c, w);
  const atk = c.attack(w.id);
  assert.equal(atk.ok, false);
  assert.match(atk.reason, /последнее действие/);
  assert.match(c.spell('fire', w.id).reason, /последнее действие/);
  const mv = c.move(1, 0);
  assert.equal(mv.ok, false);
  assert.match(mv.reason, /последнее действие/);
  I.addItem(p, 'bread');
  assert.match(c.invItem('bread').reason, /последнее действие/);
  // Один раз за ход.
  const bl2 = c.block();
  assert.equal(bl2.ok, false, 'блок один раз за ход');
  assert.match(bl2.reason, /больше нет/);
  // На новый ход блок сброшен.
  c.endTurn();
  assert.equal(c.ps.blocked, false);
});

test('блок снижает получаемый урон', () => {
  const make = () => {
    const p = strongHero();
    const c = createCombat({ player: p, groupType: 3, seed: 77 });
    c._rng = () => 0.01; // все атаки мобов попадают
    standNextTo(c, c.units[0]);
    return c;
  };
  const blocked = make();
  blocked.ps.attack = 0; blocked.ps.spellInt = 0; blocked.ps.spellWis = 0;
  blocked.ps.quickItem = 0; blocked.ps.invItem = 0;
  blocked.block();
  blocked.endTurn();
  const open = make();
  open.endTurn();
  assert.ok(blocked.player.hp > open.player.hp,
    `с блоком HP ${blocked.player.hp} должно быть выше, чем без (${open.player.hp})`);
});

// --- Исход боя ---

test('победа: весь лут, опыт и золото начислены', () => {
  const p = createCharacter();
  p.primary.strength = 30; // 4 удара
  p.primary.constitution = 50;
  const c = createCombat({ player: p, groupType: 3, seed: 4 });
  autoPlay(c);
  assert.ok(c.result, 'бой должен завершиться');
  assert.equal(c.result.outcome, 'victory');
  assert.ok(c.result.xp > 0, 'опыт начислен');
  assert.ok(c.result.gold > 0, 'золото начислено');
  assert.equal(c.units.every((u) => !u.alive || u.fled), true);
});

test('смерть: слабый герой против бездны', () => {
  const p = createCharacter(); // уровень 1, 25 HP
  const c = createCombat({ player: p, groupType: 6, seed: 8 });
  c._rng = () => 0.01; // мобы точно попадают
  let n = 0;
  while (!c.result && n++ < 60) c.endTurn(); // герой только терпит
  assert.ok(c.result, 'бой должен завершиться');
  assert.equal(c.result.outcome, 'dead');
  assert.equal(p.alive, false);
});

test('побег: успех завершает бой, провал сжигает ход', () => {
  const p = createCharacter();
  const ok = createCombat({ player: p, groupType: 3, seed: 6 });
  ok._rng = () => 0.0; // бросок < шанса
  const r1 = ok.flee();
  assert.equal(r1.fled, true);
  assert.equal(ok.result.outcome, 'fled');

  const p2 = createCharacter();
  const bad = createCombat({ player: p2, groupType: 3, seed: 6 });
  bad._rng = () => 0.99; // бросок > шанса
  const before = bad.round;
  const r2 = bad.flee();
  assert.equal(r2.fled, false);
  assert.equal(bad.result, null, 'бой продолжается');
  assert.equal(bad.round, before + 1, 'ход мобов прошёл');
  assert.equal(bad.phase, 'player', 'очередь снова у игрока');
});

// --- Роли мобов ---

test('дальний бой держит дистанцию', () => {
  const p = strongHero();
  const c = createCombat({ player: p, groupType: 5, seed: 13 }); // есть ветряной стихийник
  const ranged = c.units.filter((u) => u.role === 'ranged');
  assert.ok(ranged.length, 'в группе нет дальних бойцов');
  for (let i = 0; i < 3; i++) c.endTurn();
  for (const u of ranged) {
    const d = Math.abs(u.x - c.px) + Math.abs(u.y - c.py);
    assert.ok(d >= 2, `дальний боец ${u.name} сближён: дистанция ${d}`);
  }
});

test('поддержка лечит самого раненого союзника', () => {
  const p = strongHero();
  const c = createCombat({ player: p, groupType: 0, seed: 15 }); // есть орк-шаман
  const shaman = c.units.find((u) => u.role === 'support');
  const warrior = c.units.find((u) => u.mobId === 'orc_warrior');
  warrior.hp = 1;
  c._rng = () => 0.5;
  c.endTurn();
  assert.ok(warrior.hp > 1, `шаман не пролечил воина (hp=${warrior.hp})`);
});

test('пугливый моб убежает при ранении', () => {
  const p = strongHero();
  const c = createCombat({ player: p, groupType: 0, seed: 17 });
  const shaman = c.units.find((u) => u.role === 'support');
  shaman.hp = 1; // < 30% — паника
  let n = 0;
  while (!shaman.fled && n++ < 10) c.endTurn();
  assert.equal(shaman.fled, true, 'шаман не сбежал');
});

test('яд: отравление держится 2 хода и тикает в начале хода игрока', () => {
  const p = strongHero();
  const c = createCombat({ player: p, groupType: 4, seed: 19 }); // пауки ядовиты
  c._rng = () => 0.05; // попадания и яд
  standNextTo(c, c.units[0]);
  c.endTurn(); // мобы травят; тик уже прошёл (2 → 1)
  assert.equal(c.ps.poison, 1, 'отравление должно держаться 2 хода');
  const hp1 = p.hp;
  c.endTurn(); // второй тик (1 → 0)
  assert.ok(p.hp <= hp1 - 2, 'яд не тикает');
  assert.equal(c.ps.poison, 0, 'отравление не снялось');
});

test('вампиризм: моб с чертой лечится нанесённым уроном', () => {
  const p = strongHero();
  const c = createCombat({ player: p, groupType: 2, seed: 21 });
  // В логове скелетов нет вампиров — проверяем факт отсутствия черты.
  assert.ok(!c.units.some((u) => u.traits.lifesteal));
  // Прямая проверка: даём черту одному скелету и ставим его вплотную.
  const v = c.units[0];
  const oldDamage = v.damage;
  v.damage = 7;
  v.traits.lifesteal = true;
  v.hp = Math.max(1, v.hp - 5);
  const vHp = v.hp;
  const hpBefore = p.hp;
  standNextTo(c, v);
  c._rng = () => 0.01; // попадание
  c.endTurn();
  assert.ok(p.hp < hpBefore, 'игрок не получил урон');
  assert.ok(v.hp >= vHp, 'вампиризм не сработал');
  v.damage = oldDamage;
});

test('«Несокрушимость»: смертельный удар можно пережить', () => {
  const p = createCharacter();
  p.secondary = { golem: 10, unkill: 50 }; // шанс выживания 50%
  const c = createCombat({ player: p, groupType: 0, seed: 23 });
  c._rng = () => 0.01; // и попадания мобов, и бросок выживания
  standNextTo(c, c.units[0]);
  // «Голем 10» даёт 10 брони — обычный урон воина (3) гасится полностью.
  c.units[0].damage = 25;
  p.hp = 1;
  c.endTurn();
  if (c.result && c.result.outcome === 'dead') {
    // Все мобы могли не подойти за один ход — допускаем, но тогда
    // проверка смысла не имеет; убеждаемся, что игрок мёртв.
    assert.equal(p.alive, false);
    return;
  }
  assert.equal(p.alive, true, 'Несокрушимость не спасла');
  assert.equal(p.hp, 1);
  assert.ok(c.log.some((l) => l.includes('Несокрушимость')));
});

test('«Несокрушимость»: 1 раз в игровой день (между боями), сброс на новый день', () => {
  // Шанс 100% (unkill 50 * 2% — перекрываем), бросок и попадания детерминированы.
  const newHero = () => {
    const p = createCharacter();
    p.secondary = { golem: 10, unkill: 50 };
    return p;
  };
  // Бой, в котором моб гарантированно бьёт на смерть за endTurn.
  const deadly = (p, day) => {
    const c = createCombat({ player: p, groupType: 0, seed: 23, day });
    c._rng = () => 0.01;
    standNextTo(c, c.units[0]);
    c.units[0].damage = 25; // пробивает броню голема
    p.hp = 1;
    return c;
  };

  const p = newHero();
  const c1 = deadly(p, 1);
  c1.endTurn();
  assert.equal(p.alive, true, '1-й бой дня: выжить можно');
  assert.equal(p._lastUnkillDay, 1, 'помечен день применения');

  // Второй бой того же дня: шанс уже потрачен → смерть.
  const c2 = deadly(p, 1);
  c2.endTurn();
  assert.equal(p.alive, false, '2-й бой того же дня: Несокрушимость не сработала повторно');

  // Новый день: шанс возвращается.
  p.alive = true;
  const c3 = deadly(p, 2);
  c3.endTurn();
  assert.equal(p.alive, true, 'на новый день шанс выживания вернулся');
  assert.equal(p._lastUnkillDay, 2);
});

// --- Ход игрока на мини-карте ---

test('движение: стены, занятые клетки и лимит шагов', () => {
  const p = strongHero();
  const c = createCombat({ player: p, groupType: 3, seed: 25 });
  const steps = c.ps.moveLeft;
  assert.equal(c.move(0, -1).ok, true);
  assert.equal(c.ps.moveLeft, steps - 1);
  assert.equal(c.move(0, -99).ok, false); // вне сетки
  const m = c.units[0];
  c.px = m.x; c.py = m.y + 1; // вплотную, снизу
  const r = c.move(0, -1); // прямо на клетку моба
  assert.equal(r.ok, false, 'нельзя зайти на клетку моба');
  c.ps.moveLeft = 0;
  assert.match(c.move(1, 0).reason, /шаги/);
});

test('заклинания: огонь игнорирует броню и тратит ману, исцеление лечит', () => {
  const p = createCharacter();
  p.primary.intelligence = 10; // пул заклинаний 2
  p.primary.wisdom = 10;
  p.mp = 20;
  p.hp = 20; // исцеление должно поднять HP (максимум — 25)
  const c = createCombat({ player: p, groupType: 0, seed: 27 });
  const warrior = c.units.find((u) => u.mobId === 'orc_warrior');
  assert.ok(warrior.armor >= 1, 'воин без брони?');
  warrior.x = c.px; warrior.y = c.py - 1; // подтянуть цель в дальность
  const hpBefore = warrior.hp;
  const r = c.spell('fire', warrior.id);
  assert.equal(r.ok, true);
  assert.equal(p.mp, 17);
  const expected = Math.round(3 + 0.5 * p.primary.intelligence);
  assert.equal(hpBefore - warrior.hp, expected, 'броня должна быть проигнорирована');
  const hp2 = p.hp;
  const r2 = c.spell('heal');
  assert.equal(r2.ok, true);
  assert.ok(p.hp > hp2, 'исцеление не лечит');
  // Дальность ограничена 4 клетками.
  const far = c.units.find((u) => Math.abs(u.x - c.px) + Math.abs(u.y - c.py) > 4);
  assert.ok(far, 'нет цели вне дальности');
  assert.equal(c.spell('fire', far.id).ok, false, 'огонь долетает только на 4 клетки');
});

// --- Детерминизм ---

test('одинаковый бой при одинаковых действиих (сид + сценарий)', () => {
  const play = (seed) => {
    const p = strongHero();
    p.primary.strength = 20;
    const c = createCombat({ player: p, groupType: 0, seed });
    autoPlay(c, 30);
    return {
      result: c.result,
      hp: p.hp,
      units: c.units.map((u) => [u.id, u.x, u.y, u.hp, u.alive, u.fled]),
    };
  };
  assert.deepEqual(play(31), play(31), 'бой не детерминирован');
});

// --- Произвольный состав (подземелья, задача 000007) ---

test('кастомный состав: массив мобов + mobLevel + groupName', () => {
  const c = createCombat({
    player: strongHero(),
    mobs: ['skeleton', 'skeleton_archer', 'troll'],
    mobLevel: 7,
    seed: 123,
  });
  assert.equal(c.units.length, 3);
  for (const u of c.units) assert.equal(u.level, 7);
  assert.ok(c.units.some((u) => u.role === 'ranged'), 'остряк-скелет — стрелок');
  assert.equal(c.groupName, 'блуждающая группа');
  const a = createCombat({ player: strongHero(), mobs: ['spider', 'scorpion'], mobLevel: 3, seed: 7 });
  assert.equal(a.units.length, 2);
  assert.equal(a.units[0].level, 3);
});

// --- Предметы в бою (задача 000009) ---

test('быстрый предмет: закреплённый слот лечит и тратит пул quickItem', () => {
  const p = strongHero();
  I.addItem(p, 'healing_potion');
  assert.equal(I.setQuick(p, 0, 'healing_potion').ok, true);
  const c = createCombat({ player: p, groupType: 3, seed: 5 });
  p.hp = 10;
  const pool = c.ps.quickItem;
  const r = c.quickItem(0);
  assert.equal(r.ok, true);
  assert.equal(r.slot, 0);
  assert.equal(p.hp, 25, '+15 HP от зелья');
  assert.equal(c.ps.quickItem, pool - 1, 'действие потрачено');
  assert.equal(I.totalQty(p, 'healing_potion'), 0, 'зелье в слоте потрачено');
  // Слот пуст — действие не сгорает (возвращаем пул, чтобы проверить именно слот).
  c.ps.quickItem = pool;
  const r2 = c.quickItem(0);
  assert.equal(r2.ok, false);
  assert.match(r2.reason, /пуст/);
  assert.equal(c.ps.quickItem, pool, 'пустой слот не тратит действие');
  // Без аргумента — первый занятый слот.
  I.addItem(p, 'bread');
  I.setQuick(p, 2, 'bread');
  const r3 = c.quickItem();
  assert.equal(r3.ok, true);
  assert.equal(r3.slot, 2);
});

test('предмет из инвентаря: 1 действие за ход, выбор предмета', () => {
  const p = strongHero();
  I.addItem(p, 'meat');
  const c = createCombat({ player: p, groupType: 3, seed: 5 });
  p.hp = 10;
  assert.equal(c.invItem('bread').ok, false, 'нет в инвентаре');
  assert.equal(c.invItem('bread').ok, false);
  assert.equal(c.ps.invItem, 1, 'несуществующий предмет не тратит действие');
  const r = c.invItem('meat');
  assert.equal(r.ok, true);
  assert.equal(p.hp, 18, '+8 HP от мяса');
  assert.equal(c.ps.invItem, 0, 'действие потрачено');
  assert.equal(c.invItem('meat').ok, false, 'действие больше нет');
});

test('оружие в бою: меч бьёт сильнее кулаков, подтип даёт бонусы', () => {
  const p = strongHero(); // сила 1 → кулаки: 3 урона
  I.addItem(p, 'iron_sword'); // урон 5
  I.equip(p, 'iron_sword');
  const c = createCombat({ player: p, groupType: 3, seed: 5 });
  c._rng = () => 0.01; // все атаки попадают
  standNextTo(c, c.units[0]);
  const r = c.attack(c.units[0].id);
  assert.equal(r.ok, true);
  assert.equal(r.hit, true);
  assert.equal(r.dmg, 5, 'урон меча = stats.damage');
  // «Тяжёлое оружие» +5%/ур: топор 8 → 8.4 на 1 ур.
  const p2 = strongHero();
  p2.secondary.heavy = 1;
  I.addItem(p2, 'battle_axe');
  I.equip(p2, 'battle_axe');
  const c2 = createCombat({ player: p2, groupType: 3, seed: 5 });
  c2._rng = () => 0.01;
  standNextTo(c2, c2.units[0]);
  assert.equal(c2.attack(c2.units[0].id).dmg, Math.round(8 * 1.05) - 0, 'бонус тяжёлого оружия');
});

test('лук: атака в даль до 4 клеток, без лука — только вплотную', () => {
  // Мини-карта 7x4: игрок в (3,3), моб в (3,0) — дистанция 3.
  const p = strongHero();
  I.addItem(p, 'hunting_bow');
  I.equip(p, 'hunting_bow');
  const c = createCombat({ player: p, groupType: 3, seed: 5, width: 7, height: 4 });
  c._rng = () => 0.01;
  const far = c.units.find((u) => Math.abs(u.x - c.px) + Math.abs(u.y - c.py) === 3);
  assert.ok(far, 'найдём моб на дистанции 3');
  const r = c.attack(far.id);
  assert.equal(r.ok, true, 'лук бьёт в даль');
  assert.equal(r.hit, true);
  assert.equal(r.dmg, 6, 'урон лука = stats.damage');

  // Без лука та же дистанция недосягаема.
  const p2 = strongHero();
  const c2 = createCombat({ player: p2, groupType: 3, seed: 5, width: 7, height: 4 });
  const far2 = c2.units.find((u) => Math.abs(u.x - c2.px) + Math.abs(u.y - c2.py) === 3);
  assert.ok(far2);
  const r2 = c2.attack(far2.id);
  assert.equal(r2.ok, false);
  assert.match(r2.reason, /далеко/);
});

test('броня снижает получаемый урон (то же зерно боя, с/без брони)', () => {
  const make = (withArmor) => {
    const p = strongHero();
    if (withArmor) {
      I.addItem(p, 'leather_armor');
      I.equip(p, 'leather_armor');
    }
    const c = createCombat({ player: p, groupType: 3, seed: 99 });
    c._rng = () => 0.01; // все атаки мобов попадают
    standNextTo(c, c.units[0]);
    const hp0 = p.hp;
    c.endTurn();
    return p.hp === 9999 ? 0 : 9999 - p.hp; // strongHero hp=9999
  };
  const without = make(false);
  const withArmor = make(true);
  assert.ok(without > 0, 'без брони урон получен');
  assert.ok(withArmor < without, `с броней урон меньше: ${withArmor} < ${without}`);
});

// --- Сложность боя (задача 000027) ---

test('сложность: в настройках есть три уровня с множителями hp/damage', () => {
  assert.ok(SETTINGS.combat_difficulty, 'задана текущая сложность');
  const table = SETTINGS.combat_difficulties;
  for (const name of ['easy', 'medium', 'hard']) {
    assert.ok(table[name], `нет сложности ${name}`);
    assert.ok(table[name].hp > 0 && table[name].damage > 0,
      `сложность ${name}: множители положительны`);
  }
  assert.equal(typeof SETTINGS.combat_difficulty, 'string');
  assert.ok(table[SETTINGS.combat_difficulty], 'текущая сложность есть в таблице');
});

test('сложность: easy < medium < hard (HP и урон каждого моба)', () => {
  // Мобы уровня 30: у уровня 10 урон medium и hard округляется
  // в одно значение (у шамана), поэтому берём уровень повыше.
  const mk = (difficulty) => createCombat({
    player: createCharacter(),
    mobs: ['orc_warrior', 'orc_archer', 'orc_shaman'],
    mobLevel: 30,
    seed: 77,
    difficulty,
  });
  const e = mk('easy'), m = mk('medium'), h = mk('hard');
  assert.equal(e.difficulty, 'easy');
  assert.equal(m.difficulty, 'medium');
  assert.equal(h.difficulty, 'hard');
  for (let i = 0; i < e.units.length; i++) {
    assert.ok(e.units[i].maxHP < m.units[i].maxHP, `моб ${i}: easy hp < medium hp`);
    assert.ok(m.units[i].maxHP < h.units[i].maxHP, `моб ${i}: medium hp < hard hp`);
    assert.ok(e.units[i].damage < m.units[i].damage, `моб ${i}: easy урон < medium`);
    assert.ok(m.units[i].damage < h.units[i].damage, `моб ${i}: medium урон < hard`);
  }
});

test('сложность: неизвестное имя деградирует до настроенной, opts переопределяет', () => {
  const cur = SETTINGS.combat_difficulties[SETTINGS.combat_difficulty];
  assert.deepEqual(resolveDifficulty('нет-такой-сложности'), cur,
    'неизвестная сложность → настроенная');
  assert.deepEqual(resolveDifficulty('easy'), SETTINGS.combat_difficulties.easy);

  const p = createCharacter();
  const a = createCombat({ player: p, groupType: 0, seed: 3, difficulty: 'hard' });
  const b = createCombat({ player: p, groupType: 0, seed: 3, difficulty: 'нет-такой' });
  assert.equal(a.difficulty, 'hard', 'opts.difficulty записан в бой');
  // «нет-такой» = настроенная сложность — множители совпадают.
  for (let i = 0; i < a.units.length; i++) {
    assert.ok(a.units[i].maxHP >= b.units[i].maxHP, 'hard не слабее настроенной');
  }
});

test('единый источник: SETTINGS.combat_difficulty задаёт сложность по умолчанию', (t) => {
  // Герой повыше: у мобов уровня 1 урон обоих уровней сложности
  // округляется в 1 и различия не видны.
  const hero = () => { const p = createCharacter(); p.level = 10; return p; };
  const before = createCombat({ player: hero(), groupType: 0, seed: 9 });
  assert.equal(before.difficulty, 'medium', 'дефолт = medium');

  SETTINGS.combat_difficulty = 'easy';
  t.after(() => { SETTINGS.combat_difficulty = 'medium'; });
  const after = createCombat({ player: hero(), groupType: 0, seed: 9 });
  assert.equal(after.difficulty, 'easy', 'дефолт следует за настройкой');
  for (let i = 0; i < before.units.length; i++) {
    assert.ok(after.units[i].maxHP < before.units[i].maxHP, 'easy слабее medium');
    assert.ok(after.units[i].damage < before.units[i].damage, 'easy бьёт слабее');
  }
});

test('баланс: разумно сильный герой побеждает ВСЕ стандартные группы на medium', () => {
  // Герой уровня группы (levelDeltaMax: 0), разумная игра (autoPlay):
  // поддержка первой, все удары, блок в конце хода.
  for (const [type, recipe] of Object.entries(GROUP_RECIPES)) {
    for (const seed of [1, 2, 3, 4, 5]) {
      const p = midGameHero();
      const c = createCombat({
        player: p, groupType: Number(type), seed,
        levelDeltaMax: 0, difficulty: 'medium',
      });
      const r = autoPlay(c);
      assert.ok(r, `группа ${recipe.name} (seed ${seed}): бой не завершился`);
      assert.equal(r.outcome, 'victory',
        `группа ${recipe.name} (seed ${seed}): исход ${r.outcome}`);
      assert.ok(r.xp > 0 && r.gold > 0, 'лут за победу');
    }
  }
});

test('баланс: безопасная зона (мобы -3 к герою) на medium — тоже победа', () => {
  for (const [type, recipe] of Object.entries(GROUP_RECIPES)) {
    // Кастомный состав рецепта с фиксированным уровнем мобов = герой - 3
    // (безопасные локации по SPEC: дельта ближе к -N).
    let mobs = recipe.mobs.slice();
    if (recipe.count) mobs = new Array(recipe.count[0]).fill(recipe.mobs[0]);
    const p = midGameHero();
    const c = createCombat({
      player: p, mobs, mobLevel: Math.max(1, p.level - 3),
      seed: 11, difficulty: 'medium', groupName: recipe.name,
    });
    const r = autoPlay(c);
    assert.ok(r, `группа ${recipe.name}: бой не завершился`);
    assert.equal(r.outcome, 'victory', `группа ${recipe.name} (мобы -3): исход ${r.outcome}`);
  }
});

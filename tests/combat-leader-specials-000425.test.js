// Задача 000425 (спец-роли лидеров, [gameplay]): смерть Матки (ant_queen,
// трейт swarmRout) — все ЖИВЫЕ моб-юниты стороны mob получают fled=true по
// существующей семантике побега (тот же контракт «без лута/XP», что
// fright-побег 000271 и TIMID: alive=true, вне targeting/killed); лог
// «Рой разбежался.». Орк-вождь (orc_chief, трейт reinforce='orc_grunt') —
// РОВНО ОДИН призыв подмоги за БОЙ (флаг c.reinforcementCalled на бою, не
// на юните): спавн на одной из свободных чебышёвских соседних клеток вождя
// (rectFree — контракт 000292), выбор клетки — РОВНО ОДИН c._rng (доктрина
// seeded-RNG 000235); призыв = действие хода.
//
// Краснота осмысленная (ERR_ASSERTION, модуль грузится): T1 нет трейтов в
// каталоге; T2 нет разбега; T4/T4b нет призыва; T5 нет строки призыва;
// T3/T6 — зелёные guard-ы (живая Матка — рой не бежит; бои БЕЗ этих мобов
// — бит-в-бит по заснятому следу). expectedRedCount (файл) = 5.
//
// Регресс-гейт карточки (составы без ant_queen/orc_chief — бит-в-бит)
// держит весь существующий suite: новые ветки гейтятся трейтами носителей
// и флагом боя — ноль новых c._rng у прочих мобов.

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { MOB_TYPES, createCombat } = require('../src/combat.js');
const { createCharacter } = require('../src/player.js');

const ROUT_LOG = 'Рой разбежался.';
const REINFORCE_SUB = 'созывает подмогу';

function strongHero() {
  const p = createCharacter();
  p.primary.constitution = 50;
  p.hp = 9999;
  return p;
}

// Инициатива 200 — игрок заведомо первым (вождь/матка — 4).
function fastHero() {
  const p = strongHero();
  p.primary.dexterity = 100;
  p.primary.intelligence = 100;
  return p;
}

// Инициатива 12 (Ловкость 1 + Интеллект 11) > мобов L1 (3/4) — игрок
// первый; удар летален по hp=1.
function heroFirst() {
  const p = strongHero();
  p.level = 5;
  p.primary.intelligence = 11;
  p.primary.strength = 10;
  return p;
}

function standNextTo(c, u) {
  const w = (u.size && u.size.w) || 1, h = (u.size && u.size.h) || 1;
  const taken = (x, y) => c.units.some((v) => v.alive && !v.fled
    && x >= v.x && x < v.x + ((v.size && v.size.w) || 1)
    && y >= v.y && y < v.y + ((v.size && v.size.h) || 1));
  const candidates = [];
  for (let x = u.x - 1; x <= u.x + w; x++) {
    candidates.push([x, u.y - 1], [x, u.y + h]);
  }
  for (let y = u.y; y < u.y + h; y++) {
    candidates.push([u.x - 1, y], [u.x + w, y]);
  }
  const near = (x, y) => {
    const dx = x < u.x ? u.x - x : (x > u.x + w - 1 ? x - (u.x + w - 1) : 0);
    const dy = y < u.y ? u.y - y : (y > u.y + h - 1 ? y - (u.y + h - 1) : 0);
    return dx + dy <= 1;
  };
  const spot = candidates.find(([x, y]) =>
    x >= 0 && y >= 0 && x < c.width && y < c.height && !taken(x, y)
    && !(c.obstacles && c.obstacles.has(x + ',' + y)) && near(x, y));
  assert.ok(spot, 'нет свободной клетки рядом с мобом');
  c.px = spot[0];
  c.py = spot[1];
}

function playToResult(c, maxSteps = 512) {
  let n = 0;
  while (!c.result && n++ < maxSteps) {
    if (c.ps.attack > 0) c.attack(undefined);
    if (!c.result) c.endTurn();
  }
  assert.ok(c.result, 'бой не завершился за ' + maxSteps + ' шагов');
}

function snap(c) {
  return {
    result: c.result,
    log: c.log.slice(),
    units: c.units.map((u) => ({
      id: u.id, mobId: u.mobId || null, side: u.side,
      x: u.x, y: u.y, hp: u.hp, alive: u.alive, fled: u.fled,
    })),
  };
}

test('000425 T1: каталог — traits Матки { swarmRout } и вождя { reinforce: «orc_grunt» }; перенос в юнита боя; волк без спец-трейтов (анти-вакуум)', () => {
  assert.equal(MOB_TYPES.ant_queen.traits && MOB_TYPES.ant_queen.traits.swarmRout, true,
    'RED: swarmRout в данных Матки (spec/mobs.md «при смерти — рой разбежался»)');
  assert.equal(MOB_TYPES.orc_chief.traits && MOB_TYPES.orc_chief.traits.reinforce,
    'orc_grunt',
    'RED: reinforce вождя = id тематической подмоги из того же каталога');
  assert.ok(MOB_TYPES[MOB_TYPES.orc_chief.traits.reinforce],
    'значение reinforce — существующий моб каталога');
  const c1 = createCombat({ player: strongHero(), mobs: ['ant_queen'],
    mobLevel: 1, seed: 31 });
  assert.equal(c1.units[0].traits.swarmRout, true,
    'RED: swarmRout доходит до юнита боя (гейт dealDamageToMob читает его)');
  const c2 = createCombat({ player: strongHero(), mobs: ['orc_chief'],
    mobLevel: 1, seed: 32 });
  assert.equal(c2.units[0].traits.reinforce, 'orc_grunt',
    'RED: reinforce доходит до юнита боя');
  assert.ok(!MOB_TYPES.wolf.traits || (!MOB_TYPES.wolf.traits.swarmRout
    && !MOB_TYPES.wolf.traits.reinforce),
    'волк без спец-трейтов (анти-вакуум: механики — только у носителей)');
});

test('000425 T2: смерть Матки — все живые её группы fled + лог «Рой разбежался.»; итог victory, XP/лут только за Матку; разбег — 0 новых c._rng', () => {
  const mk = (mobs) => {
    const p = heroFirst();
    const c = createCombat({ player: p, mobs, mobLevel: 1, seed: 13 });
    c.obstacles.clear();
    const q = c.units[0];
    q.x = 3;
    q.y = 2;
    for (let i = 1; i < c.units.length; i++) {
      c.units[i].x = 1 + i;
      c.units[i].y = 0;
      c.units[i].maxHP = 200;
      c.units[i].hp = 200;
    }
    standNextTo(c, q);
    q.hp = 1;
    let calls = 0;
    c._rng = () => { calls += 1; return 0.01; };
    const atk = c.attack(q.id);
    return { c, calls, atk };
  };
  const { c, calls, atk } = mk(['ant_queen', 'ant', 'ant']);
  assert.equal(atk.ok, true, 'удар — ok');
  assert.equal(atk.hit, true, 'попадание');
  assert.equal(c.units[0].alive, false, 'Матка мертва (killed-ветка)');
  assert.ok(!c.units[0].fled, 'труп не «сбежал» (fled — только живые)');
  assert.equal(c.units[1].fled, true,
    'RED: рабочий муравей 1 — fled (разбег роя)');
  assert.equal(c.units[2].fled, true, 'RED: рабочий муравей 2 — fled');
  assert.equal(c.units[1].alive, true, 'fled ≠ смерть (контракт 000271/TIMID)');
  assert.ok(c.log.includes(ROUT_LOG),
    'RED: лог «Рой разбежался.»: ' + c.log.join(' | '));
  assert.ok(c.result, 'бой окончен: живых мобов не осталось');
  assert.equal(c.result.outcome, 'victory', 'Матка УБИТА → victory');
  assert.equal(c.result.defeated, 1,
    'defeated = 1: сбежавшие НЕ в killed (без XP/лута за панику)');
  assert.equal(c.result.xp, 12, 'XP только за Матку: round(8 + 4·1)');
  assert.equal(c.result.gold, 5, 'gold: round(3 + 2·1 + 0.01·1)');
  assert.ok(Array.isArray(c.result.items), 'items — массив');
  assert.ok(c.result.items.every((r) => r.id !== 'meat' && r.id !== 'sulfur'),
    'лут сбежавших муравьёв не катится: ' + JSON.stringify(c.result.items));
  // Разбег сам по себе — 0 бросков: тот же victory-флоу с УБИТОЙ Маткой
  // в группе и один-на-один даёт идентичный расход c._rng (killed ≡ {Матка}).
  const solo = mk(['ant_queen']);
  assert.equal(solo.calls, calls,
    'RED: разбег не тратит c._rng (одинаковый расход с соло-Маткой)');
  assert.deepEqual(solo.c.result, c.result,
    'тот же итог при группе (сбежавшие вне XP/лута/defeated)');
});

test('000425 T3: живая Матка — рой НЕ бежит; смерть НЕ-носителя (рабочего) тоже не поднимает разбег', () => {
  const p = heroFirst();
  const c = createCombat({ player: p, mobs: ['ant_queen', 'ant', 'ant'],
    mobLevel: 1, seed: 13 });
  c.obstacles.clear();
  const q = c.units[0];
  q.x = 3;
  q.y = 2;
  for (let i = 1; i < c.units.length; i++) {
    c.units[i].x = 1 + i;
    c.units[i].y = 0;
  }
  standNextTo(c, q);
  q.maxHP = 200;
  q.hp = 200;
  c._rng = () => 0.01;
  const atk = c.attack(q.id);
  assert.equal(atk.ok, true, 'удар — ok');
  assert.equal(atk.hit, true, 'попадание (Матка выживает: hp 200)');
  assert.equal(c.result, null, 'бой жив');
  assert.ok(c.units.every((u) => !u.fled),
    'ни одного fled: разбег — только ПО СМЕРТИ Матки');
  assert.equal(c.log.filter((s) => s.includes('разбеж')).length, 0,
    'лога разбега нет: ' + c.log.join(' | '));
  // Смерть НЕ-носителя (рабочего): разбег привязан к трейту умершего.
  const { combatInternals } = require('../src/combat.js');
  const a1 = c.units[1];
  const r2 = combatInternals.dealDamageToMob(c, a1, 9999);
  assert.equal(r2.killed, true, 'рабочий убит');
  assert.ok(!c.units[2].fled,
    'смерть рабочего (без swarmRout) — рой не разбегается');
  assert.ok(!c.units[0].fled, 'Матка цела и не fled');
  assert.equal(c.result, null, 'бой жив: Матка и второй рабочий');
});

test('000425 T4: вождь — РОВНО ОДИН призыв за бой: orc_grunt на свободной клетке рядом (1 c._rng, row-major), повторный ход не спавнит', () => {
  const p = fastHero();
  const c = createCombat({ player: p, mobs: ['orc_chief'], mobLevel: 1,
    seed: 7 });
  c.obstacles.clear();
  const ch = c.units[0];
  ch.x = 3;
  ch.y = 1;
  c.px = 3;
  c.py = 6;
  ch.maxHP = 200;
  ch.hp = 200;
  let calls = 0;
  c._rng = () => { calls += 1; return 0.5; };
  c.endTurn(); // игрок (быстрый) пасует → ход вождя: призыв
  assert.equal(c.units.length, 2,
    'RED: ровно один новый юнит после первого хода вождя');
  const g = c.units[1];
  assert.equal(g.side, 'mob', 'подмога — сторона mob');
  assert.equal(g.mobId, 'orc_grunt', 'RED: тематическая подмога — орк-шестёрка');
  assert.equal(g.id, 'm1', 'id по схеме m+индекс (уникален)');
  // 8 соседей (3,1) на пустом поле 7×7, row-major: (2,0),(3,0),(4,0),
  // (2,1),(4,1),(2,2),(3,2),(4,2); idx = floor(0.5·8) = 4 → (4,1).
  assert.deepEqual([g.x, g.y], [4, 1],
    'RED: клетка — детерминированный выбор c._rng из свободных соседей');
  assert.equal(calls, 1, 'РОВНО 1 c._rng на призыв');
  assert.equal(c.reinforcementCalled, true, 'RED: флаг «уже звал» — на бою');
  const n0 = c.units.length;
  for (let i = 0; i < 8; i++) c.endTurn();
  assert.equal(c.units.length, n0,
    'повторные ходы вождя — новых призывов нет (флаг боя)');
  assert.equal(c.log.filter((s) => s.includes(REINFORCE_SUB)).length, 1,
    'ровно одна строка призыва: ' + c.log.join(' | '));
});

test('000425 T4b: вождь без свободных клеток — призыва нет, 0 c._rng, флаг всё равно потрачен (детерминизм отказа)', () => {
  const p = fastHero();
  const c = createCombat({ player: p, mobs: ['orc_chief'], mobLevel: 1,
    seed: 8 });
  const ch = c.units[0];
  ch.x = 3;
  ch.y = 1;
  c.px = 3;
  c.py = 6;
  ch.maxHP = 200;
  ch.hp = 200;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      c.obstacles.add((3 + dx) + ',' + (1 + dy));
    }
  }
  let calls = 0;
  c._rng = () => { calls += 1; return 0.5; };
  c.endTurn();
  assert.equal(c.units.length, 1, 'нет свободной клетки — спавна нет');
  assert.equal(calls, 0, 'отказ — 0 бросков c._rng');
  assert.equal(c.reinforcementCalled, true,
    'флаг потрачен и при отказе («РОВНО ОДИН» = верхняя граница)');
  c.obstacles.clear();
  for (let i = 0; i < 8; i++) c.endTurn();
  assert.equal(c.units.length, 1,
    'освободившееся поле — позднего призыва нет (флаг боя)');
  assert.equal(c.log.filter((s) => s.includes(REINFORCE_SUB)).length, 0,
    'строк призыва нет');
});

test('000425 T5: детерминизм по seed — бой с вожём: два прогона идентичны (призыв/позиция/поток rng внутри seed-потока)', () => {
  const run = () => {
    const p = fastHero();
    const c = createCombat({ player: p, mobs: ['orc_chief', 'orc_grunt'],
      mobLevel: 1, seed: 4242 });
    playToResult(c);
    return snap(c);
  };
  const a = run();
  assert.equal(a.log.filter((s) => s.includes(REINFORCE_SUB)).length, 1,
    'RED: призыв произошёл ровно однажды (естественный rng-поток)');
  assert.ok(a.units.some((u) => u.mobId === 'orc_grunt' && u.id === 'm2'),
    'RED: подмога — третий юнит (m2) при состав из двух мобов');
  assert.deepEqual(run(), a,
    '2 прогона (тот же seed) — идентичный снимок {result, log, юниты}');
});

test('000425 T6: анти-вакуум — бой без Матки/вождя: заснятый след побитово, 0 разбегов/призывов, fled пуст', () => {
  const run = () => {
    const p = strongHero();
    const c = createCombat({ player: p, mobs: ['wolf', 'spider', 'ant'],
      mobLevel: 2, seed: 77 });
    c.obstacles.clear();
    let calls = 0;
    const base = c._rng;
    c._rng = () => { calls += 1; return base(); };
    for (let i = 0; i < 40 && !c.result; i++) c.endTurn();
    return {
      calls,
      round: c.round,
      outcome: c.result ? c.result.outcome : null,
      pHp: p.hp,
      logLen: c.log.length,
      fled: c.units.filter((u) => u.fled).map((u) => u.id),
      specialLogs: c.log.filter((s) => s.includes('разбеж')
        || s.includes(REINFORCE_SUB)).length,
    };
  };
  const a = run();
  assert.deepEqual(a, {
    calls: 156,
    round: 41,
    outcome: null,
    pHp: 9910,
    logLen: 65,
    fled: [],
    specialLogs: 0,
  }, 'бой без ant_queen/orc_chief — бит-в-бит по следу базы (c._rng/hp/лог)');
  assert.deepEqual(run(), a,
    'детерминизм: равный seed — идентичный след');
});

// Задача 000420 (паутина гигантского паука, [gameplay]): трейт web у
// MOB_TYPES.spider; попадание паука атакой вешает на жертву дебаф
// «ход_вниз» (value > 0, длительность WEB_TURNS в ходах) — игрок в слот
// c.ps.debuff (паттерн c.ps-записей с ходами, как яд-линия/баф 000235.01),
// союзник — в t.debuff (паттерн записей 000235.01 на юнитах-союзниках).
// Потребитель НЕ новый: «ход_вниз» уводит в конец очереди инициативы
// (SLOW_INITIATIVE_PENALTY, 000235.08.01). НОВОЕ машинное состояние —
// тики длительности для не-мобов: c.ps.debuff и a.debuff тикают в
// startRound (до пересборки очереди — ритм-паритет с моб-тиком); без них
// паутина на игроке/союзнике вечная.
//
// Краснота осмысленная (ERR_ASSERTION, модуль грузится): T1 web нет в
// каталоге; T2/T2b/T3 нет дебафа на жертве; T4 нет очереди/тиков;
// T5 — зелёный guard (анти-вакуум + детерминизм боёв БЕЗ пауков).
// expectedRedCount (файл) = 5 (T1–T4; T2b краснеет на web-ролле).
//
// Регресс-гейт карточки (бои без пауков — бит-в-бит) держит весь
// существующий suite: боевые ветки гейтятся traits.web (ноль новых
// c._rng у не-пауков) и наличием записи дебафа (тики — no-op без неё).

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  MOB_TYPES, createCombat, buildTurnOrder, combatInternals,
} = require('../src/combat.js');
const { createCharacter } = require('../src/player.js');

const WEB_LOG_PLAYER = 'Паутина: вы замедлены!';
const WEB_LOG_ALLY = 'Наёмник: паутина замедляет!';

function webHero() {
  const p = createCharacter();
  p.primary.constitution = 50;
  p.hp = 9999;
  return p;
}

// Игрок ЗАВЕДОМО быстрее паука (4) и волка (3): очередь — игрок первым,
// замедление видно как перенос в КОНЕЦ (иначе и без web игрок последний).
function fastHero() {
  const p = webHero();
  p.primary.dexterity = 100;
  p.primary.intelligence = 100;
  return p;
}

const ALLY_MERC = {
  name: 'Наёмник', role: 'melee', level: 1, dmg: 1, hp: 1,
  skills: [], spells: [],
};

const ALLY_MERC_FAST = {
  name: 'Наёмник', role: 'melee', level: 1, dmg: 1, hp: 1,
  skills: [], spells: [], attrs: { dexterity: 5, intelligence: 5 },
};

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

test('000420 T1: каталог — MOB_TYPES.spider traits { poison, web }; волк без web (анти-вакуум); makeMob переносит трейт в юнита боя', () => {
  assert.equal(MOB_TYPES.spider.traits.poison, true,
    'яд-трейт сохранён (регресс: яд-линия не двигается)');
  assert.equal(MOB_TYPES.spider.traits.web, true,
    'RED: web-трейт паука (spec/mobs.md «Яд; паутина замедляет»');
  assert.ok(!MOB_TYPES.wolf.traits || !MOB_TYPES.wolf.traits.web,
    'волк без web (анти-вакуум: дебаф — только у носителя трейта)');
  const c = createCombat({ player: webHero(), mobs: ['spider'],
    mobLevel: 1, seed: 11 });
  assert.equal(c.units[0].traits.web, true,
    'web доходит до юнита боя (гейт mobAttack/mobAttackAlly читает его)');
});

test('000420 T2: mobAttack — попадание паука вешает на игрока дебаф «ход_вниз» (c.ps.debuff: stat/значение/хода) + лог-строка паутины; яд-линия цела', () => {
  const p = webHero();
  const c = createCombat({ player: p, mobs: ['spider'], mobLevel: 1,
    seed: 5 });
  c.obstacles.clear();
  const s = c.units[0];
  standNextTo(c, s);
  c._rng = () => 0.05; // попадания и шанс паутины (0.05 < WEB_CHANCE)
  for (let i = 0; i < 12 && !c.ps.debuff; i++) c.endTurn();
  assert.ok(c.ps.debuff,
    'RED: попадание паука — дебаф на игроке (c.ps.debuff)');
  assert.equal(c.ps.debuff.stat, 'ход_вниз',
    'дебаф-стат — «ход_вниз» (потребитель 000235.08.01)');
  assert.ok(c.ps.debuff.value > 0,
    'значимая величина > 0 (гейт SLOW_INITIATIVE_PENALTY: > 0)');
  assert.equal(c.ps.debuff.turns, 2, 'длительность — 2 хода (WEB_TURNS)');
  assert.ok(c.log.includes(WEB_LOG_PLAYER),
    'лог-строка попадания паутины: ' + c.log.join(' | '));
  assert.equal(c.ps.poison, 2,
    'яд-линия цела: тот же удар при 0.05 отравляет (2 хода)');
});

test('000420 T2b: web-ролл потребляет ровно ОДИН c._rng на удар паука и только при попадании (анти-вакуум: промах — ролла нет)', () => {
  const mk = (rngValue) => {
    const c = createCombat({ player: webHero(), mobs: ['spider'],
      mobLevel: 1, seed: 5 });
    c.obstacles.clear();
    const s = c.units[0];
    standNextTo(c, s);
    let calls = 0;
    c._rng = () => { calls += 1; return rngValue; };
    for (let i = 0; i < 1 && !c.ps.debuff; i++) c.endTurn();
    return { c, calls };
  };
  const miss = mk(0.99);
  assert.equal(miss.c.ps.debuff || null, null,
    'промах паука — web не срабатывает (ролл только на попадании)');
  assert.equal(miss.calls, 1,
    'промах — ровно 1 бросок c._rng (попадание), web-ролла нет');
  const hit = mk(0.05);
  assert.ok(hit.c.ps.debuff, 'попадание паука — web сработал');
  assert.equal(hit.calls, 3,
    'попадание паука — ровно 3 броска: попадание + яд + паутина');
});

test('000420 T3: mobAttackAlly — попадание паука по союзнику вешает дебаф «ход_вниз» в t.debuff + лог; у игрока дебафа нет', () => {
  const c = createCombat({ player: webHero(), allies: [ALLY_MERC],
    mobs: ['spider'], mobLevel: 1, seed: 13 });
  c.obstacles.clear();
  const s = c.units.find((u) => u.id === 'm0');
  const a = c.units.find((u) => u.id === 'a0');
  a.x = 2;
  a.y = 5;
  s.x = 2;
  s.y = 4;
  a.maxHP = 200;
  a.hp = 200;
  s.maxHP = 200;
  s.hp = 200;
  s.damage = 3;
  c._rng = () => 0.05;
  for (let i = 0; i < 12 && !(a.debuff && a.debuff.turns > 0); i++) {
    c.endTurn();
  }
  assert.ok(a.debuff,
    'RED: удар по союзнику — дебаф в t.debuff (ветка mobAttackAlly)');
  assert.equal(a.debuff.stat, 'ход_вниз',
    'дебаф-стат на союзнике — «ход_вниз»');
  assert.ok(a.debuff.value > 0, 'значимая величина > 0');
  assert.equal(a.debuff.turns, 2, 'длительность — 2 хода (WEB_TURNS)');
  assert.ok(c.log.includes(WEB_LOG_ALLY),
    'лог-строка паутины по союзнику: ' + c.log.join(' | '));
  assert.ok(!c.ps.debuff,
    'паук бил союзника — у игрока дебафа нет (цель одна)');
});

test('000420 T4: очередь инициативы — замедленный игрок/союзник в конце; тик по ходам 2→1→0 — позиция возвращается (тик не-мобов — новый)', () => {
  // (a) игрок: web от паука (ходом дальше — волк-филер БЕЗ web —
  // трейт-гейт ⇒ паутина не обновляется). Игрок fastHero (init 200):
  // без web очередь ['player','m0','m1'] — замедление видно как перенос
  // в конец. Паук снят ДО границы раунда (иначе обновил бы turns).
  const c = createCombat({ player: fastHero(), mobs: ['spider', 'wolf'],
    mobLevel: 1, seed: 21 });
  c.obstacles.clear();
  const s = c.units.find((u) => u.id === 'm0');
  standNextTo(c, s);
  c._rng = () => 0.05;
  for (let i = 0; i < 12 && !c.ps.debuff; i++) c.endTurn();
  assert.ok(c.ps.debuff, 'паутина висит (см. T2)');
  assert.equal(c.ps.debuff.turns, 2,
    'RED: свежая запись — 2 хода (тик ещё не было: применение в раунде R)');
  assert.deepEqual(buildTurnOrder(c), ['m0', 'm1', 'player'],
    'RED: замедленный игрок (init 200 − SLOW_INITIATIVE_PENALTY) — '
    + 'в конце очереди');
  combatInternals.dealDamageToMob(c, s, 9999);
  let r = c.round;
  for (let i = 0; i < 8 && c.round === r; i++) c.endTurn();
  assert.equal(c.ps.debuff.turns, 1,
    'RED: тик c.ps.debuff в начале раунда 2→1 (ритм — моб-тик 000235.01, '
    + 'ДО пересборки очереди)');
  assert.deepEqual(buildTurnOrder(c), ['m1', 'player'],
    'ход 1 из 2 — всё ещё в конце');
  r = c.round;
  for (let i = 0; i < 8 && c.round === r; i++) c.endTurn();
  assert.equal(c.ps.debuff.turns, 0,
    'RED: тик 1→0 — эффект истёк (без тика паутина вечна)');
  assert.deepEqual(buildTurnOrder(c), ['player', 'm1'],
    'истечение — позиция возвращена (init-ключ чистый)');

  // (b) союзник: запись в a.debuff (тот же слот, что пишет
  // mobAttackAlly — см. T3) тикает в startRound (цикл живых союзников).
  const c2 = createCombat({ player: fastHero(), allies: [ALLY_MERC_FAST],
    mobs: ['spider'], mobLevel: 1, seed: 22 });
  c2.obstacles.clear();
  c2._rng = () => 0.99; // паук промахивается (web не навешивается)
  const a2 = c2.units.find((u) => u.id === 'a0');
  a2.debuff = { stat: 'ход_вниз', value: 0.15, turns: 1 };
  assert.deepEqual(buildTurnOrder(c2), ['player', 'm0', 'a0'],
    'RED: замедленный союзник (init 10 − penalty) — за пауком (4)');
  r = c2.round;
  for (let i = 0; i < 8 && c2.round === r; i++) c2.endTurn();
  assert.equal(a2.debuff.turns, 0,
    'RED: тик a.debuff существует (1→0 за раунд)');
  assert.deepEqual(buildTurnOrder(c2), ['player', 'a0', 'm0'],
    'истечение — союзник вернулся в init-порядок');
});

test('000420 T5: анти-вакуум и детерминизм — бой БЕЗ пауков: ни у кого нет дебафа, лог без строк паутины, два прогона идентичны (зелёный guard)', () => {
  const run = () => {
    const p = webHero();
    const c = createCombat({ player: p, allies: [ALLY_MERC],
      mobs: ['wolf'], mobLevel: 2, seed: 42 });
    for (let i = 0; i < 20 && !c.result; i++) c.endTurn();
    return {
      round: c.round,
      outcome: c.result ? c.result.outcome : null,
      log: c.log.slice(),
      pHp: p.hp,
      debuffs: c.units.filter((u) => u.debuff).map((u) => u.id),
      psDebuff: c.ps.debuff || null,
    };
  };
  const a = run();
  assert.deepEqual(a.debuffs, [],
    'ни у волка, ни у союзника дебафа нет (web — только у паука)');
  assert.equal(a.psDebuff, null,
    'у игрока дебафа нет (регресс: бои без пауков — 0 debuff-записей)');
  assert.equal(a.log.filter((l) => /паутин|замедл/i.test(l)).length, 0,
    'в логе боя без пауков нет строк паутины/замедления');
  assert.deepEqual(run(), a,
    'детерминизм: равный seed — идентичный след (лог/раунды/hp)');
});

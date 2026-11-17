// Задача 000430 (purify на себя / mass_holy_light снимают c.ps.debuff,
// [gameplay]): зазор 000420 («Известный зазор» в memory/000420-web.md) —
// писатель слота c.ps.debuff реален (паутина), но само-«Очищение» (t нет)
// и «Массовый святой свет» запись не снимали. Правка — канон
// «регенерации» (if (t) … else c.ps.…): симметрично buff-ветке debuff
// чистится ЦЕЛИКОМ (слот = вся запись «ход_вниз», а не отдельный стат).
// Слот и тики startRound (контракт 000420), потребление очереди
// (SLOW_INITIATIVE_PENALTY, 000235.08.01), c.ps.poison/bind и сейв-формат
// НЕ трогаются; логи веток побитово прежние.
//
// Краснота осмысленная (ERR_ASSERTION, модуль грузится): T1/T2 — purify на
// себя не снимает c.ps.debuff; T3 — mass не задевает героя; T4/T5/T6 —
// зелёные guard-ы (t-ветка purify не трогает слот игрока; анти-вакуум
// каста без дебафа; RNG-нейтральность боёв без purify/mass-кастов —
// след заснят живым кодом базы).
// expectedRedCount (файл) = 3 (T1, T2, T3).

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { createCombat, buildTurnOrder } = require('../src/combat.js');
const { castSpell } = require('../src/spells.js');
const { createCharacter } = require('../src/player.js');

const PURIFY_SELF_LOG = 'Очищение: очищено.';
const WEB_DEBUFF = { stat: 'ход_вниз', value: 0.15, turns: 2 };

function webHero(spells) {
  const p = createCharacter();
  p.primary.constitution = 50;
  p.primary.wisdom = 10;
  p.hp = 9999;
  p.mp = 40;
  p.spells = spells;
  return p;
}

// Игрок ЗАВЕДОМО быстрее паука (4) и волка (3) — паттерн 000420 T4:
// без web очередь ['player','m0','m1'], замедление видно как перенос
// в конец, снятие — как мгновенное возвращение (buildTurnOrder чистая).
function fastHero(spells) {
  const p = webHero(spells);
  p.primary.dexterity = 100;
  p.primary.intelligence = 100;
  return p;
}

const ALLY_MERC = {
  name: 'Наёмник', role: 'melee', level: 1, dmg: 1, hp: 1,
  skills: [], spells: [],
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

// Реальная паутина: спайдер вплотную, c._rng=()=>0.05 (попадание + web),
// endTurn-луп до записи слота — харнесс 000420 T2.
function webbedOn(p, opts) {
  const c = createCombat(Object.assign({ player: p, mobs: ['spider'],
    mobLevel: 1, seed: 5 }, opts));
  c.obstacles.clear();
  standNextTo(c, c.units.find((u) => u.id === 'm0'));
  c._rng = () => 0.05;
  for (let i = 0; i < 12 && !c.ps.debuff; i++) c.endTurn();
  assert.ok(c.ps.debuff, 'паутина висит на игроке (писатель 000420)');
  assert.equal(c.ps.debuff.stat, 'ход_вниз',
    'запись — «ход_вниз» (слот 000420)');
  return c;
}

function partyCombat(p) {
  const allies = [];
  for (let i = 0; i < 3; i++) {
    allies.push({ name: 'Союзник' + i, role: 'melee', level: 1,
      dmg: 1, hp: 1, skills: [], spells: [] });
  }
  const c = createCombat({ player: p, mobs: ['wolf'], mobLevel: 2,
    seed: 7, allies });
  for (const a of c.units.filter((u) => u.side === 'ally')) {
    a.hp = Math.max(1, a.maxHP - 10);
  }
  p.hp = Math.max(1, p.hp - 30);
  return c;
}

test('000430 T1: purify на себя после реальной паутины снимает c.ps.debuff (слот целиком); purified=null, лечения нет, лог побитово, яд/баф/bind не тронуты', () => {
  const p = webHero(['purify']);
  const c = webbedOn(p, {});
  const before = {
    buff: c.ps.buff, bind: c.ps.bind, poison: c.ps.poison,
  };
  const hpBefore = p.hp;
  const logLenBefore = c.log.length;
  const r = castSpell(c, 'purify');
  assert.equal(r.ok, true, 'purify на себя: каст ok (' + r.reason + ')');
  assert.equal(c.ps.debuff, null,
    'RED: «Очищение» на себя снимает запись паутины (слот целиком)');
  assert.equal(r.purified, null, 'игрок-цель — out.purified null (без ре-пина)');
  assert.equal(r.healed, undefined, 'purify: лечения нет');
  assert.equal(p.hp, hpBefore, 'purify на себя: hp не тронут');
  assert.deepEqual({ buff: c.ps.buff, bind: c.ps.bind, poison: c.ps.poison },
    before, 'c.ps.buff/bind/poison НЕ тронуты (debuff-слот — единственный)');
  assert.equal(c.log.filter((l) => l === PURIFY_SELF_LOG).length, 1,
    'ровно одна существующая лог-строка «' + PURIFY_SELF_LOG + '» '
    + '(новая строка при снятии запрещена): '
    + c.log.slice(logLenBefore).join(' | '));
});

test('000430 T2: purify на себя возвращает очередь в тот же раунд (buildTurnOrder без SLOW_INITIATIVE_PENALTY); тик по null в startRound — no-op, без throw', () => {
  const p = fastHero(['purify']);
  const c = webbedOn(p, { mobs: ['spider', 'wolf'], seed: 21 });
  assert.deepEqual(buildTurnOrder(c), ['m0', 'm1', 'player'],
    'база: замедленный fastHero — в конце очереди (000420 T4)');
  const r = castSpell(c, 'purify');
  assert.equal(r.ok, true, 'purify на себя: каст ok (' + r.reason + ')');
  assert.equal(c.ps.debuff, null,
    'RED: запись снята (см. T1)');
  assert.deepEqual(buildTurnOrder(c), ['player', 'm0', 'm1'],
    'RED: очередь пересобрана БЕЗ штрафа в тот же раунд '
    + '(потребитель 000235.08.01 не переписан — снятие гейтится turns > 0)');
  c._rng = () => 0.99; // моба промахиваются — web не перезаливается
  const roundBefore = c.round;
  for (let i = 0; i < 8 && c.round === roundBefore; i++) c.endTurn();
  assert.equal(c.ps.debuff, null,
    'тик startRound по снятому слоту — no-op без throw');
  assert.deepEqual(c.turnOrder, ['player', 'm0', 'm1'],
    'следующий раунд: очередь стартует с игрока (init 200)');
});

test('000430 T3: mass_holy_light снимает c.ps.debuff героя и debuff союзников; лечение побитово; без союзников — слот игрока всё равно снимается', () => {
  const p = webHero(['mass_holy_light']);
  const c = webbedOn(p, { allies: [ALLY_MERC] });
  p.hp = 20; // герой ниже потолка — лечение масс-каста наблюдаемо (> 0)
  for (const a of c.units.filter((u) => u.side === 'ally' && u.alive)) {
    a.debuff = { stat: 'dot', value: 1, turns: 3 };
  }
  const buffBefore = c.ps.buff;
  const r = castSpell(c, 'mass_holy_light');
  assert.equal(r.ok, true, 'mass_holy_light: каст ok (' + r.reason + ')');
  assert.equal(c.ps.debuff, null,
    'RED: массовое очищение задевает героя — c.ps.debuff = null');
  for (const a of c.units.filter((u) => u.side === 'ally' && u.alive)) {
    assert.equal(a.debuff, null,
      'регресс 000235.10: союзник ' + a.name + ' — u.debuff = null');
  }
  assert.ok(r.healed > 0, 'лечение побитово: out.healed > 0');
  assert.deepEqual(c.ps.buff, buffBefore,
    'mass: c.ps.buff не тронут (чистится только debuff-слот)');
  // Без живых союзников слот игрока снимается так же (анти-M8:
  // «очистка героя» не привязана к циклу альясов).
  const p2 = webHero(['mass_holy_light']);
  const c2 = createCombat({ player: p2, mobs: ['wolf'], mobLevel: 2,
    seed: 9 });
  c2.ps.debuff = Object.assign({}, WEB_DEBUFF);
  const r2 = castSpell(c2, 'mass_holy_light');
  assert.equal(r2.ok, true, 'mass без союзников: каст ok (' + r2.reason + ')');
  assert.equal(c2.ps.debuff, null,
    'RED: без союзников герой тоже очищается');
});

test('000430 T4: guard — purify по союзнику слот игрока НЕ трогает; mob-цель — «нет цели» и состояние 0-diff', () => {
  const p = webHero(['purify']);
  const c = partyCombat(p);
  const heroSlot = Object.assign({}, WEB_DEBUFF);
  c.ps.debuff = heroSlot;
  const a = c.units.find((u) => u.side === 'ally');
  a.debuff = { stat: 'dot', value: 1, turns: 3 };
  const r = castSpell(c, 'purify', a.id);
  assert.equal(r.ok, true, 'purify по союзнику: каст ok (' + r.reason + ')');
  assert.equal(a.debuff, null, 'регресс 000235.10: u.debuff → null');
  assert.deepEqual(c.ps.debuff, WEB_DEBUFF,
    'цель — союзник: c.ps.debuff НЕ тронут (чистка только в else-ветке)');
  const mob = c.units.find((u) => u.side === 'mob');
  const psBefore = { debuff: c.ps.debuff, buff: c.ps.buff,
    poison: c.ps.poison, bind: c.ps.bind };
  const allyDebuffs = c.units.filter((u) => u.side === 'ally')
    .map((u) => (u.debuff ? u.debuff.stat : null));
  const hpBefore = p.hp;
  const logLenBefore = c.log.length;
  const bad = castSpell(c, 'purify', mob.id);
  assert.equal(bad.ok, false, 'purify на mob: «нет цели» (гейт evalSpell)');
  assert.equal(bad.reason, 'нет цели');
  assert.deepEqual({ debuff: c.ps.debuff, buff: c.ps.buff,
    poison: c.ps.poison, bind: c.ps.bind }, psBefore,
    'отказ по цели: c.ps 0-diff (нет побочной чистки)');
  assert.deepEqual(c.units.filter((u) => u.side === 'ally')
    .map((u) => (u.debuff ? u.debuff.stat : null)), allyDebuffs,
    'отказ по цели: debuff-состояние союзников 0-diff');
  assert.equal(p.hp, hpBefore, 'отказ по цели: hp не тронут');
  assert.equal(c.log.length, logLenBefore, 'отказ по цели: лог не пополняется');
});

test('000430 T5: анти-вакуум — purify на себя без дебафа: ok, purified null, hp/слоты не тронуты, лог ровно одна прежняя строка', () => {
  const p = webHero(['purify']);
  const c = partyCombat(p);
  assert.equal(c.ps.debuff, null, 'без паутины слот пуст (ps-литерал)');
  const before = { debuff: c.ps.debuff, buff: c.ps.buff,
    poison: c.ps.poison, bind: c.ps.bind };
  const hpBefore = p.hp;
  const logLenBefore = c.log.length;
  const r = castSpell(c, 'purify');
  assert.equal(r.ok, true, 'каст без дебафа: ok (' + r.reason + ')');
  assert.equal(r.purified, null, 'out.purified null (регресс spells.test.js)');
  assert.equal(r.healed, undefined, 'лечения нет');
  assert.equal(p.hp, hpBefore, 'hp не тронут');
  assert.deepEqual({ debuff: c.ps.debuff, buff: c.ps.buff,
    poison: c.ps.poison, bind: c.ps.bind }, before,
    'все c.ps-слоты не тронуты (null = null, без создания объектов)');
  assert.equal(c.log.filter((l) => l === PURIFY_SELF_LOG).length, 1,
    'лог: ровно одна прежняя «' + PURIFY_SELF_LOG + '», новых строк нет');
  assert.equal(c.log.length, logLenBefore + 1,
    'длина лога: +1 строка (сама ветка не болтает лишнего)');
});

test('000430 T6: RNG-нейтральность — бой без паутины и без purify/mass-кастов: заснятый на базе след побитово (зелёный guard)', () => {
  const run = () => {
    const p = webHero(['purify', 'mass_holy_light']);
    const c = createCombat({ player: p, allies: [ALLY_MERC],
      mobs: ['wolf', 'ant'], mobLevel: 2, seed: 77 });
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
      debuffs: c.units.filter((u) => u.debuff).map((u) => u.id),
      psDebuff: c.ps.debuff || null,
      psPoison: c.ps.poison,
    };
  };
  const a = run();
  assert.deepEqual(a, {
    calls: 32,
    round: 21,
    outcome: null,
    pHp: 9987,
    logLen: 10,
    debuffs: [],
    psDebuff: null,
    psPoison: 0,
  }, 'бой без паутины и без кастов — бит-в-бит по следу базы '
    + '(c._rng/раунды/hp/лог): след заснят живым кодом до правки');
  assert.deepEqual(run(), a,
    'детерминизм: равный seed — идентичный след');
});

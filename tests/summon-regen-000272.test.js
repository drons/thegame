// Задача 000272 (реген призывного: потребитель traits.regen у союзников;
// follow-up RETRO-20261025 F2; ТЗ tasks/pending/000272.md; контракт
// memory/000272-summon-regen.md) — RED-тесты (фикстуры только; код игры
// и существующие тесты НЕ меняются на красной стадии).
//
// ТЗ: в startRound (src/combat.js, союзник-цикл livingAllies) каждый
// живой союзник с traits.regen лечится по МОБ-паттерну (та же формула,
// что mobAct :2127-2128): +max(1, round(maxHP×0.1)), потолок maxHP,
// молча (без log), 0 новых c._rng. ПЕРВЫЙ тик — round 2 (round 1 —
// startRound не вызывается); рассеивающийся призывной (summonTurns → 0,
// continue выше тика) тика НЕ получает. НЕ спелл-«реген» (a.buff/
// c.ps.buff через healAlly) — другой механизм (контракт §3).
//
// Красные «отсутствием» (осмысленно — фикстура грузится: каст
// winter_elemental 000064 ok, призывной в c.units с КОПИЕЙ трейта
// {regen}, maxHP 28 (L3), summonTurns 4 — отсутствует ТОЛЬКО тик,
// ERR_ASSERTION на hp-траектории; load-ошибок нет: все require/экспорты
// существуют). Прецедент: блок 000267-REG-* (tests/combat.test.js).
//
// expectedRedCount (файл) = 2 (000272-REG-1, 000272-DISP-1). Гварды
// 000272-MOB-1/CTRL-1/DET-1 — зелёные на обеих стадиях (моб-сторона
// бит-в-бит; 0 новых c._rng + тишина тика; детерминизм по сиду).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createCombat, MOB_TYPES } = require('../src/combat.js');
const { createCharacter } = require('../src/player.js');
const { castSpell } = require('../src/spells.js');

// Сильный персонаж для контролируемых сценариев (много HP — не умирает сам).
function strongHero() {
  const c = createCharacter();
  c.primary.constitution = 50;
  c.hp = 9999;
  return c;
}

// Бой с кастом winter_elemental (000064 → water_elemental, трейт
// {regen}, уровень СПЕЛЛА = 3, maxHP 28, summonTurns 4); c._rng = 0.99
// — все атаки промахиваются (чистая hp-траектория; прецедент
// 000267-REG-*). seed 13 — фиксированный сценарий.
function winterCombat() {
  const p = strongHero();
  p.primary.intelligence = 11;
  p.spells = ['winter_elemental'];
  p.mp = 40;
  const c = createCombat({ player: p, mobs: ['wolf'], mobLevel: 2, seed: 13 });
  const r = castSpell(c, 'winter_elemental');
  assert.equal(r.ok, true, 'каст winter_elemental — ok: ' + r.reason);
  const a = c.units.find((u) => u.id === r.summoned);
  assert.ok(a, 'призывной в c.units');
  c._rng = () => 0.99;
  return { c, a };
}

// hp юнита по раундам: per[round] — значение ПОСЛЕ последнего endTurn
// этого раунда. Тики — только в startRound, в раунде hp плоский (все
// атаки промахиваются, _rng 0.99) → последнее наблюдение раунда =
// значение после тика (или без тика).
function hpByRound(c, u, toRound) {
  const per = {};
  let guard = 0;
  while (c.round < toRound && !c.result) {
    assert.ok(++guard < 64,
      'раунд не идёт (c.result: ' + JSON.stringify(c.result) + ')');
    c.endTurn();
    per[c.round] = u.hp;
  }
  assert.ok(c.round >= toRound, 'не дошёл до раунда ' + toRound);
  return per;
}

test('000272-REG-1: traits.regen призывного (water_elemental через winter_elemental 000064) — тик startRound по МОБ-паттерну: +max(1, round(maxHP×0.1)), потолок maxHP, ПЕРВЫЙ тик — round 2 (красный, 000272)', () => {
  const { c, a } = winterCombat();
  // Фикстура: трейт — КОПИЯ из каталога (не ссылка), статы призывного
  // по уровню СПЕЛЛА (3): maxHP 28, дельта тика d = max(1, round(28×0.1)).
  assert.equal(a.kind, 'summon', 'kind — "summon"');
  assert.equal(a.name, MOB_TYPES.water_elemental.name, 'имя — из каталога');
  assert.equal(a.level, 3, 'уровень — уровень СПЕЛЛА (3)');
  assert.deepEqual(a.traits, { regen: true }, 'traits — {regen} из каталога');
  assert.notStrictEqual(a.traits, MOB_TYPES.water_elemental.traits,
    'копия, не ссылка (каталог MOB_TYPES не мутируется)');
  assert.equal(a.maxHP, 28, 'maxHP water_elemental L3 — 28');
  assert.equal(a.summonTurns, 4, 'summonTurns — 4 (turns 000064)');
  const d = Math.max(1, Math.round(a.maxHP * 0.1));
  assert.equal(d, 3, 'd — max(1, round(28×0.1)) = 3 (формула mobAct)');
  // (a) Round 1 — плоский: сразу после каста hp как задан — startRound
  // в round 1 не вызывается (тик-окна — только при исчерпании очереди).
  a.hp = Math.max(1, a.maxHP - 5 * d);
  const h0 = a.hp;
  assert.equal(a.hp, h0, 'round 1 — плоский (тика нет: startRound не вызывается)');
  const per = hpByRound(c, a, 5);
  assert.deepEqual(
    [per[2], per[3], per[4]],
    [h0 + d, h0 + 2 * d, h0 + 3 * d],
    'RED: ПЕРВЫЙ тик — round 2, далее ровно +d/раунд (моб-паттерн, '
    + 'не +1/тик спелл-реген); факт: ' + JSON.stringify([per[2], per[3], per[4]]));
  // (b) Потолок maxHP: hp = maxHP−1 → тик доводит до maxHP, дальше
  // не растёт (Math.min — та же защита, что у моба).
  const w2 = winterCombat();
  const c2 = w2.c;
  const a2 = w2.a;
  a2.hp = a2.maxHP - 1;
  const per2 = hpByRound(c2, a2, 5);
  assert.equal(per2[2], a2.maxHP, 'потолок: maxHP−1 → maxHP в round 2');
  assert.equal(per2[3], a2.maxHP, 'потолок: в round 3 не растёт дальше');
  assert.equal(per2[4], a2.maxHP, 'потолок: в round 4 не растёт дальше');
});

test('000272-DISP-1: рассеивающийся призывной (summonTurns → 0) — тика НЕ получает (continue выше тика); тики — ровно (turns−1) = 3 за жизнь (красный, 000272)', () => {
  const { c, a } = winterCombat();
  const d = Math.max(1, Math.round(a.maxHP * 0.1));
  a.hp = Math.max(1, a.maxHP - 5 * d);
  const h0 = a.hp;
  const per = hpByRound(c, a, 6);
  // Тики — только в живых раундах 2/3/4 (summonTurns 4→3→2→1); round 5:
  // 1→0 — fled + «рассеивается» + тика НЕТ (continue выше тика — анти-
  // регрессия порядка); round 6 — юнит уже не в livingAllies.
  assert.deepEqual(
    [per[2], per[3], per[4], per[5], per[6]],
    [h0 + d, h0 + 2 * d, h0 + 3 * d, h0 + 3 * d, h0 + 3 * d],
    'RED: ровно 3 тика за жизнь (rounds 2/3/4), в раунде рассеивания '
    + 'тика НЕТ; факт: ' + JSON.stringify([per[2], per[3], per[4], per[5], per[6]]));
  assert.equal(a.hp - h0, 3 * d, 'суммарная дельта за жизнь — ровно 3d');
  assert.equal(a.fled, true, 'рассеивание — fled (не смерть)');
  assert.equal(a.alive, true, 'hp сохраняется (не труп)');
  assert.equal(a.summonTurns, 0, 'summonTurns — 0');
  assert.ok(c.log.some((l) => l.includes('рассеивается')),
    'лог «…рассеивается.»');
});

test('000272-MOB-1: моб water_elemental (mobAct) — поведение НЕ меняется: +max(1, round(maxHP×0.1)) на своём ходу (бит-в-бит гварда, 000272)', () => {
  const p = strongHero();
  p.primary.strength = 20;
  const c = createCombat({ player: p, mobs: ['water_elemental'], mobLevel: 2, seed: 42 });
  const m = c.units.find((u) => u.side === 'mob');
  assert.ok(m, 'моб в c.units');
  assert.equal(m.traits.regen, true, 'моб — с трейтом regen (каталог)');
  assert.equal(m.maxHP, 10, 'maxHP water_elemental L2 — 10');
  const d = Math.max(1, Math.round(m.maxHP * 0.1));
  assert.equal(d, 1, 'd — max(1, round(10×0.1)) = 1');
  m.hp = Math.max(1, m.maxHP - 4 * d);
  const h0 = m.hp;
  c._rng = () => 0.99;
  c.endTurn();
  assert.equal(c.round, 2, 'round 2');
  assert.equal(m.hp, h0 + d, '+d на своём ходу моба (round 2) — mobAct');
  c.endTurn();
  assert.equal(c.round, 3, 'round 3');
  assert.equal(m.hp, h0 + 2 * d, '+d на своём ходу моба (round 3) — mobAct');
});

test('000272-CTRL-1: союзник БЕЗ traits.regen (A/B: run B — s.traits = {} после каста) — бит-в-бит: 0 новых c._rng от тика, лог идентичен, hp юнитов без трейта дельта 0 (гварда, 000272)', () => {
  const run = (strip) => {
    const p = strongHero();
    p.primary.intelligence = 11;
    p.spells = ['winter_elemental'];
    p.mp = 40;
    const c = createCombat({ player: p, mobs: ['wolf'], mobLevel: 2, seed: 13 });
    const r = castSpell(c, 'winter_elemental');
    assert.equal(r.ok, true, 'каст — ok: ' + r.reason);
    const a = c.units.find((u) => u.id === r.summoned);
    if (strip) a.traits = {};
    const d = Math.max(1, Math.round(a.maxHP * 0.1));
    a.hp = Math.max(1, a.maxHP - 5 * d);
    let calls = 0;
    c._rng = () => { calls += 1; return 0.99; };
    let guard = 0;
    while (c.round < 12 && !c.result && guard++ < 64) c.endTurn();
    const w = c.units.find((u) => u.side === 'mob');
    return { calls, a, log: c.log, playerHp: c.player.hp, wolfHp: w.hp };
  };
  const A = run(false);
  const B = run(true);
  assert.equal(A.calls, B.calls,
    '0 новых c._rng от тика: число вызовов идентично (A: '
    + A.calls + ', B: ' + B.calls + ')');
  assert.equal(A.playerHp, B.playerHp, 'hp игрока — бит-в-бит (дельта 0)');
  assert.equal(A.wolfHp, B.wolfHp, 'hp волка — бит-в-бит (дельта 0)');
  assert.deepEqual(A.log, B.log, 'тик МОЛЧА: лог A/B идентичен');
  assert.ok(A.a.hp >= B.a.hp,
    'призывной с трейтом — hp не ниже, чем без (A: ' + A.a.hp
    + ', B: ' + B.a.hp + ')');
});

test('000272-DET-1: детерминизм — одинаковый сид → одинаковый бой (winter_elemental-сценарий, реальный сизедный RNG, 2 прогона → идентичный снимок round/result/log/юнитов) (гварда, 000272)', () => {
  const run = () => {
    const p = strongHero();
    p.primary.intelligence = 11;
    p.spells = ['winter_elemental'];
    p.mp = 40;
    const c = createCombat({ player: p, mobs: ['wolf'], mobLevel: 2, seed: 13 });
    const r = castSpell(c, 'winter_elemental');
    assert.equal(r.ok, true, 'каст — ok: ' + r.reason);
    let guard = 0;
    while (c.round < 12 && !c.result && guard++ < 64) c.endTurn();
    return {
      round: c.round,
      result: c.result,
      log: c.log,
      player: { hp: c.player.hp, x: c.px, y: c.py },
      units: c.units.map((u) => ({
        id: u.id, side: u.side, hp: u.hp, maxHP: u.maxHP,
        summonTurns: u.summonTurns, fled: u.fled, alive: u.alive,
        x: u.x, y: u.y,
      })),
    };
  };
  assert.deepEqual(run(), run(), 'сид 13 → идентичный бой (2 прогона)');
});

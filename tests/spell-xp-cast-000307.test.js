// Задача 000307: опыт за применение боевого заклинания игроком —
// пропорционально потраченной мане и разности уровней кастера и
// опорного моба (контракт — memory/000307-spell-xp-cast.md).
//
// Формула (FIXED, castSpell — src/spells.js, блок практики):
//   XP = round(мана × (1 + 0.1 × max(0, D)))
//   мана — реально потраченная (поле каталога `мани`;
//          free_cast (000230.17) — 0);
//   D = p.level − уровень опорного моба: цель применения, если она
//      моб (t.side === 'mob'), иначе nearestMob(c); живых мобов
//      нет — D = 0;
//   D < 0 — бонус нулевой, БЕЗ штрафа; floor 1 — НЕТ (XP может быть 0).
// Навык — по школе: огонь → firelord, лёд → icelord, исцеление →
// meditation, природа → nature; Тень/Защита — практики нет.
// 0 новых вызовов c._rng.
//
// Тесты (T1–T10; RED — падает на плоском PRACTICE_XP.spell = 3):
//   T1  (RED): fireball (6), герой 5, моб 5 (D=0) → 6
//   T2  (RED): inferno (20), герой 10, моб 4 (D=+6) → 32
//   T3  (RED): fireball (6), герой 4, моб 10 (D=−6) → 6 (без штрафа)
//   T4  (RED): mend (3), герой 5, моб 2 (D=+3), без цели → nearestMob → 4
//   T4b (RED): 2 моба — опорный = БЛИЖАЙШИЙ (лвл 2 вплотную, не лвл 8) → 4
//   T5  (RED): D=0 (герой 1, моб 1): spark/fireball/inferno → 3/6/20
//   T6  (RED): fireball (6), герой 5, моб 4 (D=+1) → 7; skillXp = {firelord: 7}
//   T7  (GUARD): неудачный каст (mp 0) — ok false, опыта нет
//   T8  (RED): free_cast — XP 0, мана не списана
//   T9  (GUARD): детерминизм — каст = 0 новых вызовов c._rng
//   T10 (GUARD): Тень/Защита (chill/magic_shield) — практики нет

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { createCharacter } = require('../src/player.js');
const { createCombat } = require('../src/combat.js');

function loadSpells() { return require('../src/spells.js'); }

function spellHero({ spells, intelligence = 1, wisdom = 1, level = 1,
  mp = 30 } = {}) {
  const p = createCharacter();
  p.primary.intelligence = intelligence;
  p.primary.wisdom = wisdom;
  p.level = level;
  p.mp = mp;
  p.spells = spells.slice();
  return p;
}

// Бой один-на-один; цель вплотную (в дальности заклинаний 4).
function soloCombat(p, mobId = 'wolf', mobLevel = 2) {
  const c = createCombat({ player: p, mobs: [mobId], mobLevel, seed: 5 });
  const u = c.units[0];
  u.x = c.px; u.y = c.py - 1;
  return c;
}

test('000307 T1: fireball (мана 6), герой 5, моб 5 (D=0) → XP 6', () => {
  const { castSpell } = loadSpells();
  const p = spellHero({ spells: ['fireball'], intelligence: 10, level: 5 });
  const c = soloCombat(p, 'wolf', 5);
  const r = castSpell(c, 'fireball', c.units[0].id);
  assert.equal(r.ok, true, r.reason);
  assert.equal(p.skillXp.firelord, 6,
    'XP = round(6 × (1 + 0.1 × 0)) = 6');
  assert.equal(r.practice.xp, 6, 'out.practice.xp — то же значение');
});

test('000307 T2: inferno (мана 20), герой 10, моб 4 (D=+6) → XP 32', () => {
  const { castSpell } = loadSpells();
  const p = spellHero({ spells: ['inferno'], intelligence: 10, level: 10 });
  const c = soloCombat(p, 'wolf', 4);
  const r = castSpell(c, 'inferno', c.units[0].id);
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.practice.xp, 32,
    'XP = round(20 × (1 + 0.1 × 6)) = 32');
  assert.equal(r.practice.applied, 32, 'applied — весь опыт');
  assert.equal(p.skillXp.firelord, 32 - 15,
    'банк: 32 − 15 (уровень 0→1) = 17');
  assert.equal(p.secondary.firelord, 1, 'firelord 0 → 1');
});

test('000307 T3: fireball (мана 6), герой 4, моб 10 (D=−6) → XP 6 (без штрафа за сильного моба)', () => {
  const { castSpell } = loadSpells();
  const p = spellHero({ spells: ['fireball'], intelligence: 10, level: 4 });
  const c = soloCombat(p, 'wolf', 10);
  const r = castSpell(c, 'fireball', c.units[0].id);
  assert.equal(r.ok, true, r.reason);
  assert.equal(p.skillXp.firelord, 6,
    'D < 0 → бонус 0: XP = мана = 6');
  assert.equal(r.practice.xp, 6);
});

test('000307 T4: mend (мана 3) без цели — опорный = nearestMob (герой 5, моб 2, D=+3) → XP 4', () => {
  const { castSpell } = loadSpells();
  const p = spellHero({ spells: ['mend'], wisdom: 10, level: 5 });
  const c = soloCombat(p, 'wolf', 2);
  const r = castSpell(c, 'mend');
  assert.equal(r.ok, true, r.reason);
  assert.equal(p.skillXp.meditation, 4,
    'XP = round(3 × 1.3) = 4 (3.9000000000000004)');
  assert.equal(r.practice.xp, 4);
});

test('000307 T4b: 2 моба — опорный = БЛИЖАЙШИЙ (лвл 2 вплотную), не лвл 8 в 4 клетках (герой 5) → XP 4', () => {
  const { castSpell } = loadSpells();
  const p = spellHero({ spells: ['mend'], wisdom: 10, level: 5 });
  const c = createCombat({
    player: p, mobs: ['wolf', 'wolf'], mobLevel: 2, seed: 5,
  });
  const [near, far] = c.units;
  near.x = c.px; near.y = c.py - 1;
  far.x = c.px; far.y = c.py - 5;
  far.level = 8;
  const r = castSpell(c, 'mend');
  assert.equal(r.ok, true, r.reason);
  assert.equal(p.skillXp.meditation, 4,
    'D = 5 − 2 = +3 (ближайший) → 4; дальнейший лвл 8 дал бы 3');
  assert.equal(r.practice.xp, 4);
});

test('000307 T5: D=0 (герой 1, моб 1) — XP = мана: spark 3, fireball 6, inferno 20', () => {
  const { castSpell } = loadSpells();
  // [spell, XP начислено, банк после, уровень после] (порог 0→1 = 15).
  const cases = [['spark', 3, 3, 0], ['fireball', 6, 6, 0],
    ['inferno', 20, 5, 1]];
  for (const [spell, xp, bank, level] of cases) {
    const p = spellHero({ spells: [spell], intelligence: 10, level: 1 });
    const c = soloCombat(p, 'wolf', 1);
    const r = castSpell(c, spell, c.units[0].id);
    assert.equal(r.ok, true, `${spell}: ${r.reason || ''}`);
    assert.equal(r.practice.xp, xp,
      `${spell}: XP = мана (${xp}) при D = 0`);
    assert.equal(p.skillXp.firelord, bank,
      `${spell}: банк после (XP − 15 при уровне 0→1)`);
    assert.equal(p.secondary.firelord, level);
  }
});

test('000307 T6: fireball (мана 6), герой 5, моб 4 (D=+1) → XP 7; другие навыки не тронуты', () => {
  const { castSpell } = loadSpells();
  const p = spellHero({ spells: ['fireball'], intelligence: 10, level: 5 });
  const c = soloCombat(p, 'wolf', 4);
  const r = castSpell(c, 'fireball', c.units[0].id);
  assert.equal(r.ok, true, r.reason);
  assert.equal(p.skillXp.firelord, 7,
    'XP = round(6 × 1.1) = 7 (6.6000000000000005)');
  assert.deepEqual(p.skillXp, { firelord: 7 }, 'только навык школы');
  assert.equal(r.practice.skill, 'firelord');
  assert.equal(r.practice.xp, 7);
});

test('000307 T7: неудачный каст (mp 0) — ok false, опыта нет (guard)', () => {
  const { castSpell } = loadSpells();
  const p = spellHero({ spells: ['spark'], intelligence: 10, mp: 0 });
  const c = soloCombat(p, 'wolf', 2);
  const r = castSpell(c, 'spark', c.units[0].id);
  assert.equal(r.ok, false, 'mp 0 < 3 — отказ до расхода');
  assert.deepEqual(p.skillXp, {}, 'неудачный каст — практики нет');
  assert.equal(p.mp, 0, 'мана не тронута');
});

test('000307 T8: free_cast (000230.17) — потрачено 0 → XP 0, мана не списана', () => {
  const { castSpell } = loadSpells();
  const p = spellHero({ spells: ['fireball'], intelligence: 10, level: 5,
    mp: 1 });
  const c = soloCombat(p, 'wolf', 5);
  c.freeCast.push('fireball');
  const r = castSpell(c, 'fireball', c.units[0].id);
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.practice.xp, 0, 'XP = round(0 × (1 + …)) = 0');
  assert.equal(p.mp, 1, 'free_cast — мана не списана');
});

test('000307 T9: детерминизм — каст = 0 новых вызовов c._rng (guard)', () => {
  const { castSpell } = loadSpells();
  const p = spellHero({ spells: ['fireball'], intelligence: 10, level: 5 });
  const c = soloCombat(p, 'wolf', 5);
  let calls = 0;
  const orig = c._rng;
  c._rng = () => { calls += 1; return orig(); };
  const r = castSpell(c, 'fireball', c.units[0].id);
  assert.equal(r.ok, true, r.reason);
  assert.equal(calls, 0, 'каст не вызывает c._rng (0 RNG)');
});

test('000307 T10: школы Тень/Защита — практики нет (chill/magic_shield) (guard)', () => {
  const { castSpell } = loadSpells();
  for (const [spell, attrs] of [
    ['chill', { intelligence: 10 }],
    ['magic_shield', { wisdom: 10 }],
  ]) {
    const p = spellHero({ spells: [spell], ...attrs });
    const c = soloCombat(p, 'wolf', 2);
    const r = castSpell(c, spell, c.units[0].id);
    assert.equal(r.ok, true, `${spell}: ${r.reason || ''}`);
    assert.ok(!('practice' in r), `${spell}: r.practice отсутствует`);
    assert.deepEqual(p.skillXp, {}, `${spell}: практики нет`);
  }
});

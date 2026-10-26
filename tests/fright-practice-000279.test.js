const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createCombat, PRACTICE_XP } = require('../src/combat.js');
const { createCharacter, derived } = require('../src/player.js');

// 000279: красные тесты практик-XP «Застращивание»: успешная паника
// (t.fled в playerAttack) — P.skillPractice(p, 'fright', PRACTICE_XP.hit)
// + аддитивное поле frightPractice в результате (shape 1:1 с practice).
// Контракт: memory/000279-fright-practice.md §5 (карта FP-1…FP-6);
// ТЗ «Тесты» — tasks/pending/000279.md.

// Сильный персонаж для контролируемых сценариев (не умирает сам).
// Копия хелпера tests/fright-000271.test.js — изолированный запуск.
function strongHero() {
  const c = createCharacter();
  c.primary.constitution = 50;
  c.hp = 9999;
  return c;
}

// Герой фикстуры FP-1…FP-6: L5; инициатива 12 (Ловкость 1 + Интеллект
// 11) > волк 3 — игрок первый; Сила 10 — базовый урон без оружия
// 3 + floor(10·0.8) + floor(5·0.5) = 13; харизма НЕ задана → 1 →
// потолок «Застращивание» 2 (уровень 15 — НА ПОТОЛКЕ, C1-перелив).
// Копия хелпера tests/fright-000271.test.js — изолированный запуск.
function fearHero(fright) {
  const p = strongHero();
  p.level = 5;
  p.primary.intelligence = 11;
  p.primary.strength = 10;
  p.secondary.fright = fright;
  return p;
}

// Ставит игрока вплотную к живому мому (копия хелпера
// tests/fright-000271.test.js — изолированный запуск).
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

// Фикстура-база (FP-1/FP-2/FP-4): волк L1 hp 200 (удар 13 не летален —
// гейт t.alive), c._rng = () => 0.01: 0.01 < 0.67 (hitChance L5→L1) —
// попадание; 0.01 < 0.75 — паника гарантирована константой, не
// seed-охотой.
function panicFixture(fright) {
  const p = fearHero(fright);
  const c = createCombat({ player: p, mobs: ['wolf'], mobLevel: 1, seed: 13 });
  assert.equal(c.phase, 'player', 'фикстура: игрок первый (инициатива 12 > 3)');
  const w = c.units[0];
  standNextTo(c, w);
  w.maxHP = 200;
  w.hp = 200;
  return { p, c, w };
}

test('000279-FP-1: паника → практик-XP в копилку «fright» (величина = PRACTICE_XP.hit; на потолке — C1-банк, уровень не растёт) (красный)', () => {
  const { p, c, w } = panicFixture(15);
  assert.equal(derived(p).fearChance, 0.75,
    'фикстура: fearChance = min(0.75, 0.05·15) = 0.75');
  c._rng = () => 0.01; // hit (0.01 < 0.67) + паника (0.01 < 0.75)
  const atk = c.attack(w.id);
  assert.equal(atk.ok, true, 'удар — ok');
  assert.equal(atk.hit, true, 'попадание');
  assert.equal(w.fled, true, 'моб в панике убежал (механика 000271)');
  // 000279: успешная паника — опыт навыка «Застращивание» (SPEC:
  // spec/skills.md:94). RED: в fear-блоке playerAttack нет вызова
  // P.skillPractice — мутации копилки нет.
  assert.equal(p.skillXp.fright, PRACTICE_XP.hit,
    'RED: паника → +PRACTICE_XP.hit в копилку «fright»');
  assert.equal(p.secondary.fright, 15,
    'уровень НЕ растёт: 15 на потолке (харизма 1 → 2) — C1-перелив в банк');
  assert.deepEqual(atk.frightPractice, {
    skill: 'fright', xp: PRACTICE_XP.hit, applied: 3, level: 15,
  }, 'RED: поле frightPractice — 4 ключа, 1:1 с practice');
  assert.deepEqual(atk.practice, {
    skill: 'fists', xp: PRACTICE_XP.hit, applied: 3, level: 0,
  }, 'практика оружия (fists) ИНВАРИАНТНА — ОБЕ записи в одном попадании');
});

test('000279-FP-2: shape результата удара — путь паники: ровно 5 ключей (+frightPractice); путь промаха fear — бит-в-бит старый (красный)', () => {
  const mk = (rng) => {
    const { p, c, w } = panicFixture(15);
    c._rng = rng;
    return c.attack(w.id);
  };
  // (а) путь паники — ПЕРВЫЙ full-result deepEqual attack-результата
  // в сьюте (голен нового пути; контракт §6.4).
  assert.deepEqual(mk(() => 0.01), {
    ok: true, hit: true, dmg: 13, killed: false,
    practice: { skill: 'fists', xp: PRACTICE_XP.hit, applied: 3, level: 0 },
    frightPractice: { skill: 'fright', xp: PRACTICE_XP.hit, applied: 3, level: 15 },
  }, 'RED: паника — полный результат с аддитивным полем frightPractice');
  // (б) путь промаха fear (hit 0.01, fear 0.9 >= 0.75) — старые пути
  // бит-в-бит: поле в каждом hit-результате НЕТ.
  const miss = mk(() => {
    let i = 0;
    return () => (i === 0 ? 0.01 : 0.9);
  });
  assert.equal('frightPractice' in miss, false,
    'промах fear — ключа frightPractice НЕТ');
  assert.deepEqual(miss, {
    ok: true, hit: true, dmg: 13, killed: false,
    practice: { skill: 'fists', xp: PRACTICE_XP.hit, applied: 3, level: 0 },
  }, 'промах fear — старый shape бит-в-бит (shape-голен)');
});

test('000279-FP-3: паника → уровень «fright» растёт из предзасеянного банка (1→2 = cap, банк обнуляется) (красный)', () => {
  const { p, c, w } = panicFixture(1);
  assert.equal(derived(p).fearChance, 0.05, 'фикстура: fearChance = 0.05');
  p.skillXp.fright = 27; // 27 + 3 = 30 = skillXpForNext(1) = 15·(1+1)
  c._rng = () => 0.01; // hit + 0.01 < 0.05 — паника
  const atk = c.attack(w.id);
  assert.equal(atk.ok, true, 'удар — ok');
  assert.equal(atk.hit, true, 'попадание');
  assert.equal(w.fled, true, 'моб в панике убежал');
  // 000279: практика подняла уровень навыка (крафт-хук в node — no-op,
  // ассерты по level/банку/полю).
  assert.equal(p.secondary.fright, 2,
    'RED: 27+3 = 30 = skillXpForNext(1) — уровень 1 → 2 (cap харизмы)');
  assert.equal(p.skillXp.fright, 0, 'RED: банк обнулён');
  assert.deepEqual(atk.frightPractice, {
    skill: 'fright', xp: PRACTICE_XP.hit, applied: 3, level: 2,
  }, 'RED: field frightPractice — applied 3, level 2');
});

test('000279-FP-4: fear-ролл ПРОМАХ — паники нет → 0 XP «fright», практика оружия на месте, ровно 2 c._rng (guard)', () => {
  const { p, c, w } = panicFixture(15);
  const seq = [0.01, 0.9]; // hit-ролл, затем fear-ролл (0.9 >= 0.75 — промах)
  let calls = 0;
  c._rng = () => seq[calls++];
  const atk = c.attack(w.id);
  assert.equal(atk.ok, true, 'удар — ok');
  assert.equal(atk.hit, true, 'попадание (0.01)');
  assert.ok(!w.fled, 'fear-промах — паники нет');
  assert.equal(w.alive, true, 'моб жив');
  assert.equal(calls, 2, 'ровно 2 c._rng: hit-ролл + fear-ролл');
  assert.equal(p.skillXp.fright, undefined, 'паники не было — XP «fright» 0');
  assert.equal('frightPractice' in atk, false, 'ключа frightPractice НЕТ');
  assert.equal(atk.practice.skill, 'fists',
    'практика оружия ЕСТЬ — удар был (practice инвариантна)');
  assert.equal(atk.practice.applied, 3, 'applied 3 (fists, уровень 0)');
});

test('000279-FP-5: моб уровнем не ниже героя — 0 XP «fright», ровно 1 c._rng (уровневый гейт ДО броска — практики ТОЖЕ нет, guard)', () => {
  for (const mobLevel of [5, 6]) {
    const p = fearHero(15);
    const c = createCombat({ player: p, mobs: ['wolf'], mobLevel, seed: 13 });
    const w = c.units[0];
    standNextTo(c, w);
    w.maxHP = 200;
    w.hp = 200;
    let calls = 0;
    c._rng = () => { calls += 1; return 0.01; };
    const atk = c.attack(w.id);
    assert.equal(atk.ok, true, `L${mobLevel}: удар — ok`);
    assert.equal(atk.hit, true, `L${mobLevel}: попадание`);
    assert.ok(!w.fled, `L${mobLevel}: t.level ${mobLevel} !< p.level 5 — не паникует`);
    assert.equal(w.alive, true, `L${mobLevel}: моб жив`);
    assert.equal(calls, 1,
      `L${mobLevel}: ровно 1 c._rng (hit) — гейт уровня ДО броска, практики тоже нет`);
    assert.equal(p.skillXp.fright, undefined, `L${mobLevel}: 0 XP «fright»`);
    assert.equal('frightPractice' in atk, false, `L${mobLevel}: ключа НЕТ`);
  }
});

test('000279-FP-6: без навыка (fright 0) — бит-в-бит: ровно 1 c._rng, 0 XP, не паникует (guard)', () => {
  const { p, c, w } = panicFixture(0);
  assert.equal(derived(p).fearChance, 0, 'фикстура: без навыка — fearChance 0');
  let calls = 0;
  c._rng = () => { calls += 1; return 0.01; };
  const atk = c.attack(w.id);
  assert.equal(atk.ok, true, 'удар — ok');
  assert.equal(atk.hit, true, 'попадание');
  assert.ok(!w.fled, 'не сбегает');
  assert.equal(w.alive, true, 'моб жив');
  assert.equal(calls, 1,
    'ровно 1 c._rng (hit-ролл) — fear-ветки НЕТ: бит-в-бит с до-000271');
  assert.equal(p.skillXp.fright, undefined, '0 XP «fright»');
  assert.equal('frightPractice' in atk, false, 'ключа НЕТ в результате');
});

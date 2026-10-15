'use strict';
// Задача 000193: «БОЙ: заклинания Эфира и союзных NPC — в книге
// заклинаний, механики как у Флогистона» — КРАСНЫЕ тесты (TDD-станция).
//
// Контракты (memory/, коммитятся вместе):
//   memory/000193-ally-spell-mechanics.md   — механика: castAllySpell
//     (зеркало evalSpell 1:1: формулы, пул/мана, порядок проверок),
//     makeAlly u.mp/u.spellInt/u.spellWis (Д-Q), poolsOf (Д-C),
//     u.shield + поглощение в dealDamageToAlly, лог-строки §7,
//     практика §9 (Эфир — школа; наёмник — нет), детерминизм §10.
//   memory/000193-companion-spellbook.md    — UI: книга под АКТИВНЫМ
//     юнитом (unitOf → activeUnit), снятие гейта 000179,
//     rowChk/castRow через Game.AllySpells, K-путь только формула.
// Тестовая карта: /tmp/thegame-wf-000193/a3-tests.md (8 красных:
// 5 node + 3 vm).
//
// Красная фаза (модуль src/ally-spells.js, поля makeAlly, поглощение
// щита, снятие гейта — ещё НЕ реализованы):
//   * node: require('../src/ally-spells.js') обёрнут try/catch — на
//     красной фазе возвращает null; осмысленный провал — в assert
//     (отсутствующее поле/поля/модуль), а НЕ падение загрузки файла
//     (прецедент 000132/000155/000167);
//   * vm: тег ally-spells.js в цепочке — existsSync-guard (паттерн
//     spellbook.js/combat-scale.js в loadCombatUi): на красной фазе
//     цепь грузится без модуля, и красные падают на месте, где гейт
//     000179 ещё держит («недоступно активному персонажу»).
// Все 8 тестов должны упасть осмысленно; зелёных среди новых — 0.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const src = (f) => fs.readFileSync(path.join(ROOT, 'src', f), 'utf8');

const C = require('../src/combat.js');
const { createCombat, activeUnitId, combatInternals } = C;
const { createCharacter } = require('../src/player.js');
const E = require('../src/efir.js');
// Каталог: spells.js при загрузке ставит combatInternals.allySpells
// (ленивый контракт, Д-I) — то, что читает будущий модуль.
require('../src/spells.js');

// Красная фаза: модуля нет → null (осмысленный провал — в тестах).
function loadAllySpells193() {
  try {
    return require(path.join(ROOT, 'src', 'ally-spells.js'));
  } catch (e) {
    return null;
  }
}

// --- Фикстуры (контракт §2/§3; все — pre-roll стоп: init 8 > волк 3) ---

// Н1: Мира — support, атрибуты (Wis 4 / Int 4 / Dex 4) → mp 5+4+4 = 13,
// spellWis 1; книга [light_heal]; явное maxHP 40 (ранение 33 = 40−7).
const MIRA193 = { name: 'Мира', role: 'support', level: 1, dmg: 0.5, hp: 0.8,
  skills: [], spells: ['light_heal'],
  attrs: { dexterity: 4, intelligence: 4, wisdom: 4 }, maxHP: 40 };
// Н2/Н5: Ашка — ranged, (Int 4 / Wis 2 / Dex 4) → mp 5+4+2 = 11,
// spellInt 1; spark dmg = round((4+0.5·4)·(1+0.15·0)·(1+0)) = 6.
const ASHKA193 = { name: 'Ашка', role: 'ranged', level: 1, dmg: 1.0, hp: 0.9,
  skills: [], spells: ['spark'],
  attrs: { dexterity: 4, intelligence: 4, wisdom: 2 } };
// Н4: Вольк — melee, книга [fireball, flame_burst] (цепочка «Огненный
// шар» → «Пламенный взрыв» → «Инферно», 000132); mp 11 ≥ 10 (flame).
const VOLK193 = { name: 'Вольк', role: 'melee', level: 1, dmg: 1.2, hp: 1.1,
  skills: [], spells: ['fireball', 'flame_burst'],
  attrs: { dexterity: 4, intelligence: 4, wisdom: 2 } };

function hero193() {
  // Невulnerable игрок (паттерн strongHero): бой идёт на союзнике.
  const p = createCharacter();
  p.primary.constitution = 50;
  p.hp = 9999;
  return p;
}

function makeCombat193(allies, extra) {
  const c = createCombat(Object.assign({
    player: hero193(), mobs: ['wolf'], mobLevel: 1, seed: 5,
    allies: allies,
  }, extra || {}));
  c.obstacles.clear(); // свободная геометрия: координаты — в тестах
  return c;
}

// ============================================================
// N1. Каст из книги наёмника: self-heal, пул/мана СОБСТВЕННЫЕ
// ============================================================

test('000193-N1: каст из книги наёмника — self-heal: u.mp/u.spellWis (makeAlly), формула 1:1 (+7), лог «Мира лечит себя (+7).»; слот/игрок нетронуты, 0 c._rng', () => {
  const AS = loadAllySpells193();
  const c = makeCombat193([MIRA193]);
  const u = c.units.find((x) => x.id === 'a0');
  assert.equal(activeUnitId(c), 'a0',
    'наёмник активен (pre-roll стоп: init 8 > волк 3 > игрок 2)');
  // makeAlly — модель собственного каста наёмника (контракт §3, Д-Q):
  assert.equal(u.mp, 13, 'u.mp = 5+Int+Wis = 13 (факт: ' + u.mp + ')');
  assert.equal(u.spellInt, 1, 'u.spellInt = 1+floor(Int/10) = 1 (факт: ' + u.spellInt + ')');
  assert.equal(u.spellWis, 1, 'u.spellWis = 1+floor(Wis/10) = 1 (факт: ' + u.spellWis + ')');
  u.hp = u.maxHP - 7; // ранена: 33 (+7 → 40, без потолка)
  let rngCalls = 0;
  c._rng = () => { rngCalls += 1; return 0.99; };
  const pMp0 = c.player.mp, pWis0 = c.ps.spellWis, n0 = c.log.length;
  assert.ok(AS && typeof AS.castAllySpell === 'function',
    'модуль src/ally-spells.js: Game.AllySpells.castAllySpell (000193)');
  const r = AS.castAllySpell(c, u, 'light_heal'); // цель — сама (т = u)
  assert.equal(r.ok, true, 'self-heal — ok (факт: ' + JSON.stringify(r) + ')');
  assert.equal(r.healed, 7, 'healed = 40−33 = 7 (факт: ' + r.healed + ')');
  assert.equal(u.hp, 40, 'hp 33 → 40');
  assert.equal(u.mp, 7, 'u.mp 13−6 (light_heal «мани») = 7 (факт: ' + u.mp + ')');
  assert.equal(u.spellWis, 0, 'пул spellWis 1→0 (атрибут — Мудрость)');
  assert.equal(u.spellInt, 1, 'spellInt не тронут');
  assert.equal(u.attackLeft, 1, 'книга не ест слот действия (Д-D)');
  assert.equal(c.player.mp, pMp0, 'мана игрока не сожжена');
  assert.equal(c.ps.spellWis, pWis0, 'пул игрока не сожжён');
  assert.deepEqual(Array.from(c.log).slice(n0), ['Мира лечит себя (+7).'],
    'лог — вычисленный (паттерн 000168): ' + JSON.stringify(Array.from(c.log).slice(n0)));
  assert.equal(rngCalls, 0, '0 c._rng (детерминизм, контракт §10)');
});

// ============================================================
// N2. Каст урона наёмника: targetId, игнор брони, формула 1:1
// ============================================================

test('000193-N2: каст урона из книги наёмника: targetId (не «ближайший от игрока»), броня игнорируется, dmg 6 (шк. бонус 0), лог «Ашка: «Искра» — Волк: 6.»', () => {
  const AS = loadAllySpells193();
  const c = makeCombat193([ASHKA193]);
  const u = c.units.find((x) => x.id === 'a0');
  const w = c.units.find((x) => x.id === 'm0');
  assert.equal(activeUnitId(c), 'a0', 'наёмник активен');
  assert.equal(u.mp, 11, 'u.mp = 5+4+2 = 11 (факт: ' + u.mp + ')');
  assert.equal(u.spellInt, 1, 'u.spellInt = 1');
  // Геометрия: волк в d 3 (≤ 4), броня 50 — заклинание игнорирует.
  u.x = 3; u.y = 5; w.x = 3; w.y = 2;
  w.maxHP = 100; w.hp = 100; w.armor = 50;
  let rngCalls = 0;
  c._rng = () => { rngCalls += 1; return 0.99; };
  const pMp0 = c.player.mp, pInt0 = c.ps.spellInt;
  assert.ok(AS && typeof AS.castAllySpell === 'function',
    'модуль src/ally-spells.js (000193)');
  const r = AS.castAllySpell(c, u, 'spark', w.id);
  assert.equal(r.ok, true, 'каст урона — ok (факт: ' + JSON.stringify(r) + ')');
  assert.equal(r.dmg, 6,
    'dmg = round((4+0.5·4)·(1+0.15·0)·(1+0)) = 6 — бонус школы 0 для наёмника (факт: ' + r.dmg + ')');
  assert.equal(w.hp, 94, 'волк −6 (броня 50 игнорируется, 000118-зеркало)');
  assert.equal(u.mp, 8, 'u.mp 11−3 (spark) = 8');
  assert.equal(u.spellInt, 0, 'пул spellInt 1→0');
  assert.equal(c.player.mp, pMp0, 'мана игрока не сожжена');
  assert.equal(c.ps.spellInt, pInt0, 'пул игрока не сожжён');
  assert.ok(c.log.includes('Ашка: «Искра» — Волк: 6.'),
    'лог — аналог 000118 (em-dash): ' + c.log.join(' | '));
  assert.equal(rngCalls, 0, '0 c._rng (детерминизм)');
});

// ============================================================
// N3. Эфир: «Магический щит» — u.shield + поглощение в
// dealDamageToAlly (плоское, зеркало щита игрока)
// ============================================================

test('000193-N3: щит Эфира: u.shield {armor: 1+степень = 2, turns: 3}, пул c.efs / мана u.mp (poolsOf, Д-C); dealDamageToAlly — 5−2 = 3 (плоское поглощение)', () => {
  const AS = loadAllySpells193();
  const state = E.createEfir();
  state.spells = ['magic_shield']; // книга — только щит
  const c = makeCombat193([E.efirAllyData(state)],
    { mobs: ['wolf'], mobLevel: 2, seed: 5 });
  const u = c.units.find((x) => x.id === 'efir');
  E.buildEfirUnit(state, c);
  assert.ok(c.efs, 'c.efs — боевой профиль (buildEfirUnit)');
  assert.equal(activeUnitId(c), 'efir', 'Эфир активен (pre-roll стоп)');
  // (a) Поглощение: u.shield заранее (паттерн 000112 CB-7): 5 − 2 = 3.
  u.shield = { armor: 2, turns: 3 };
  const d1 = combatInternals.dealDamageToAlly(c, u, 5);
  assert.equal(d1, 3, 'щит поглощает 2: 5 − 2 = 3 (факт: ' + d1 + ')');
  assert.equal(u.hp, 13, 'hp 16 − 3 = 13');
  // (b) Каст из книги: u.shield {armor 2, turns 3}, пул c.efs.spellWis,
  // мана u.mp (11−5 = 6), лог вербатим.
  u.hp = 16;
  const n0 = c.log.length;
  assert.ok(AS && typeof AS.castAllySpell === 'function',
    'модуль src/ally-spells.js (000193)');
  const r = AS.castAllySpell(c, u, 'magic_shield');
  assert.equal(r.ok, true, 'каст щита — ok (факт: ' + JSON.stringify(r) + ')');
  assert.deepEqual(u.shield, { armor: 2, turns: 3 },
    'u.shield: armor = 1+степень = 2, turns = 3 (контракт §4)');
  assert.equal(c.efs.spellWis, 0, 'c.efs.spellWis 1→0 (poolsOf — c.efs, Д-C)');
  assert.equal(u.mp, 6, 'u.mp 11−5 (magic_shield) = 6');
  assert.deepEqual(Array.from(c.log).slice(n0),
    ['Эфир: «Магический щит» — +2 брони на 3 раунда.'],
    'лог (контракт §7): ' + JSON.stringify(Array.from(c.log).slice(n0)));
  // (c) Поставленный щит поглощает: 5 − 2 = 3.
  const d2 = combatInternals.dealDamageToAlly(c, u, 5);
  assert.equal(d2, 3, 'поставленный щит поглощает: 5 − 2 = 3 (факт: ' + d2 + ')');
  assert.equal(u.hp, 13, 'hp 16 − 3 = 13');
});

// ============================================================
// N4. Только высшая степень цепи действует (зеркало 000132);
// canCastAllySpell — чистое зеркало с одним reason
// ============================================================

test('000193-N4: «fireball» при «flame_burst» в книге → отказ «в бою действует высшая степень: Пламенный взрыв» (без расхода); canCastAllySpell — тот же reason + {ok:true} для flame_burst (чисто, без расхода)', () => {
  const AS = loadAllySpells193();
  assert.ok(AS && typeof AS.castAllySpell === 'function'
    && typeof AS.canCastAllySpell === 'function',
    'модуль src/ally-spells.js: castAllySpell + canCastAllySpell (000193)');
  const c = makeCombat193([VOLK193]);
  const u = c.units.find((x) => x.id === 'a0');
  const w = c.units.find((x) => x.id === 'm0');
  u.x = 3; u.y = 5; w.x = 3; w.y = 2; // d 3 ≤ 4
  w.maxHP = 100; w.hp = 100; w.armor = 50;
  assert.equal(activeUnitId(c), 'a0', 'наёмник активен');
  assert.equal(u.mp, 11, 'u.mp 5+4+2 = 11 (≥ 10 — flame_burst)');
  // (a) cast 'fireball' — выше по цепи есть flame_burst → отказ
  // вербатим (зеркало evalSpell 000132); без расхода, без лог-строки.
  const mp0 = u.mp, int0 = u.spellInt, n0 = c.log.length;
  const r = AS.castAllySpell(c, u, 'fireball', w.id);
  assert.equal(r.ok, false,
    'fireball — отказ (факт: ' + JSON.stringify(r) + ')');
  assert.equal(r.reason, 'в бою действует высшая степень: Пламенный взрыв',
    'reason вербатим (факт: ' + (r && r.reason) + ')');
  assert.equal(u.mp, mp0, 'отказ — мана не сгорела');
  assert.equal(u.spellInt, int0, 'отказ — пул не сгорел');
  assert.equal(c.log.length, n0, 'отказ — лог-строки нет (core не пишет)');
  // (b) canCast — тот же reason (000037: один reason — одно поведение).
  assert.deepEqual(AS.canCastAllySpell(c, u, 'fireball', w.id),
    { ok: false, reason: 'в бою действует высшая степень: Пламенный взрыв' },
    'canCast — тот же reason, что и cast');
  // (c) canCast 'flame_burst' — ok; чисто: без расхода/эффекта.
  const chk = AS.canCastAllySpell(c, u, 'flame_burst', w.id);
  assert.deepEqual(chk, { ok: true },
    'flame_burst — canCast {ok:true} (факт: ' + JSON.stringify(chk) + ')');
  assert.equal(u.mp, mp0, 'canCast — чисто: мана не сгорела');
  assert.equal(u.spellInt, int0, 'canCast — чисто: пул не тронут');
  assert.equal(w.hp, 100, 'canCast — чисто: эффекта нет');
});

// ============================================================
// N5. Практика: Эфир — школа каста (+PRACTICE_XP.spell = 3);
// наёмник — НЕТ практики (v1)
// ============================================================

test('000193-N5: практика — Эфир: firelord +3 (ленивый Game.efir.practiceEfir, c.efirState); наёмник — чужой банк не мутируется (канареечный c.efirState)', () => {
  const AS = loadAllySpells193();
  assert.ok(AS && typeof AS.castAllySpell === 'function',
    'модуль src/ally-spells.js (000193)');
  // Паттерн withGame112 (tests/combat.test.js): ленивый globalThis.Game.
  const withGame193 = (fake, fn) => {
    const had = Object.prototype.hasOwnProperty.call(globalThis, 'Game');
    const prev = globalThis.Game;
    globalThis.Game = fake;
    try { return fn(); } finally {
      if (had) globalThis.Game = prev; else delete globalThis.Game;
    }
  };
  withGame193({ efir: { practiceEfir: E.practiceEfir } }, () => {
    // (a) Эфир: «Искра» (огонь) → practiceEfir(c.efirState, 'firelord', 3).
    const state = E.createEfir();
    state.spells = ['spark'];
    const c = makeCombat193([E.efirAllyData(state)],
      { mobs: ['wolf'], mobLevel: 2, seed: 5 });
    const u = c.units.find((x) => x.id === 'efir');
    const w = c.units.find((x) => x.id === 'm0');
    E.buildEfirUnit(state, c);
    assert.ok(c.efirState === state, 'c.efirState — live state');
    w.x = 2; w.y = 3; // от якоря (2,5) — d 2 ≤ 4
    w.maxHP = 100; w.hp = 100;
    assert.equal(activeUnitId(c), 'efir', 'Эфир активен');
    const r = AS.castAllySpell(c, u, 'spark', w.id);
    assert.equal(r.ok, true, 'каст — ok (факт: ' + JSON.stringify(r) + ')');
    assert.equal(r.dmg, 6,
      'dmg = round((4+0.5·3)·1·(1+0.05·1)) = 6 (firelord 1 — EFIR_START_LIST) (факт: ' + r.dmg + ')');
    assert.equal(state.skillXp.firelord, 3,
      'практика: firelord +PRACTICE_XP.spell = 3 (банк был пуст)');
    // (b) Наёмник: практики НЕТ (v1) — канареечный c.efirState
    // не мутируется.
    const c2 = makeCombat193([ASHKA193]);
    const u2 = c2.units.find((x) => x.id === 'a0');
    const w2 = c2.units.find((x) => x.id === 'm0');
    u2.x = 3; u2.y = 5; w2.x = 3; w2.y = 2;
    w2.maxHP = 100; w2.hp = 100;
    const canary = E.createEfir();
    c2.efirState = canary; // для наёмника модуль его НЕ трогает
    const r2 = AS.castAllySpell(c2, u2, 'spark', w2.id);
    assert.equal(r2.ok, true, 'каст наёмника — ok (факт: ' + JSON.stringify(r2) + ')');
    assert.ok(!canary.skillXp || !canary.skillXp.firelord,
      'наёмник — практики нет (канареечный банк не мутирован): '
      + JSON.stringify(canary.skillXp));
  });
});

// ============================================================
// 000216-B1. Каст СОЮЗНИКА под блоком ИГРОКА (c.ps.blocked — флаг
// хода ИГРОКА; союзный ход независим — зеркало 000168/000194)
// ============================================================

test('000216-B1: на ходу СОЮЗНИКА c.ps.blocked = true (игрок в блоке) → canCastAllySpell/castAllySpell — ok: каст СОЮЗНИКА, мана/пул СОЮЗНИКА тратятся, игрок и c.ps.blocked нетронуты; canCast deepEqual {ok:true} (000037-зеркало: одна причина — одно поведение). Краснота: reason «блок — только последнее действие»', () => {
  const AS = loadAllySpells193();
  const c = makeCombat193([MIRA193]);
  const u = c.units.find((x) => x.id === 'a0');
  assert.equal(activeUnitId(c), 'a0',
    'наёмник активен (pre-roll стоп: init 8 > волк 3 > игрок 2)');
  assert.ok(AS && typeof AS.castAllySpell === 'function'
    && typeof AS.canCastAllySpell === 'function',
    'модуль src/ally-spells.js: castAllySpell + canCastAllySpell (000193)');
  // white-box: игрок заблокировался ранее в том же раунде; флаг жив до
  // startRound (combat.js:2711) — на СОЮЗНЫЙ ход влиять не обязан.
  c.ps.blocked = true;
  u.hp = u.maxHP - 7; // ранена: 33 (+7 → 40, формула N1)
  let rngCalls = 0;
  c._rng = () => { rngCalls += 1; return 0.99; };
  const pMp0 = c.player.mp, pWis0 = c.ps.spellWis, n0 = c.log.length;
  // (a) canCast — {ok:true} (краснота: {ok:false, reason: «блок —
  // только последнее действие»} — чужой блок игрока).
  assert.deepEqual(AS.canCastAllySpell(c, u, 'light_heal'), { ok: true },
    'canCast — {ok:true} на ходу союзника под блоком игрока (факт: '
    + JSON.stringify(AS.canCastAllySpell(c, u, 'light_heal')) + ')');
  // (b) cast — ok: расход СОЮЗНИКА, игрок и блок игрока нетронуты.
  const r = AS.castAllySpell(c, u, 'light_heal');
  assert.equal(r.ok, true,
    'каст под блоком игрока — ok (факт: ' + JSON.stringify(r) + ')');
  assert.equal(r.healed, 7, 'healed = 40−33 = 7 (факт: ' + (r && r.healed) + ')');
  assert.equal(u.hp, 40, 'hp 33 → 40');
  assert.equal(u.mp, 7, 'u.mp 13−6 (light_heal) = 7 (факт: ' + u.mp + ')');
  assert.equal(u.spellWis, 0, 'пул spellWis 1→0 (атрибут — Мудрость)');
  assert.equal(u.spellInt, 1, 'spellInt не тронут');
  assert.equal(u.attackLeft, 1, 'книга не ест слот действия (Д-D)');
  assert.equal(c.player.mp, pMp0, 'мана игрока не сожжена');
  assert.equal(c.ps.spellWis, pWis0, 'пул игрока не сожжён');
  assert.deepEqual(Array.from(c.log).slice(n0), ['Мира лечит себя (+7).'],
    'лог — вычисленный (паттерн 000168): ' + JSON.stringify(Array.from(c.log).slice(n0)));
  assert.equal(c.ps.blocked, true,
    'каст союзника НЕ сбирает блок игрока (флаг жив до startRound)');
  assert.equal(rngCalls, 0, '0 c._rng (детерминизм)');
  // (c) 000037-зеркало: после расхода пула (spellWis 0) — canCast и
  // cast дают ОДНУ причину, каст не расходует.
  const mp1 = u.mp;
  const poolReason =
    { ok: false, reason: 'действий «Заклинание» (Мудрость) больше нет' };
  assert.deepEqual(AS.canCastAllySpell(c, u, 'light_heal'), poolReason,
    'canCast после расхода — причина пула (факт: '
    + JSON.stringify(AS.canCastAllySpell(c, u, 'light_heal')) + ')');
  assert.deepEqual(AS.castAllySpell(c, u, 'light_heal'), poolReason,
    'cast после расхода — та же причина (000037: одна причина — одно поведение)');
  assert.equal(u.mp, mp1, 'отказ — мана не сгорела');
});

// ============================================================
// 000193-N6. Таблица отказов §2 memory/000193-ally-spell-mechanics.md:
// на каждую строку — точная строка reason + отсутствие расхода
// (mp/пул/лог) + deepEqual canCastAllySpell === отказ castAllySpell
// (000037: одна причина — одно поведение). Каждый кейс — свежий бой.
// ============================================================

test('000193-N6: таблица отказов §2 — 13 строк (не ваш ход / бой закончен / неизвестное заклинание / не изучено / неизвестное действие / высшая степень / пул Wis / пул Int / мана / нет цели×3 / слишком далеко): reason вербатим + 0 расхода + canCast-зеркало', () => {
  const AS = loadAllySpells193();
  assert.ok(AS && typeof AS.castAllySpell === 'function'
    && typeof AS.canCastAllySpell === 'function',
    'модуль src/ally-spells.js: castAllySpell + canCastAllySpell (000193)');
  const checkCase = (label, allies, mutate, spellId, targetId, expectReason) => {
    const c = makeCombat193(allies);
    const u = c.units.find((x) => x.id === 'a0');
    mutate(c, u);
    const mp0 = u.mp, int0 = u.spellInt, wis0 = u.spellWis, n0 = c.log.length;
    const r = AS.castAllySpell(c, u, spellId, targetId);
    assert.equal(r.ok, false, label + ': отказ (факт: ' + JSON.stringify(r) + ')');
    assert.equal(r.reason, expectReason,
      label + ': reason вербатим «' + expectReason + '» (факт: '
      + (r && r.reason) + ')');
    assert.equal(u.mp, mp0, label + ': отказ — мана не сгорела');
    assert.equal(u.spellInt, int0, label + ': отказ — пул Int не тронут');
    assert.equal(u.spellWis, wis0, label + ': отказ — пул Wis не тронут');
    assert.equal(c.log.length, n0, label + ': отказ — лог-строки нет');
    assert.deepEqual(AS.canCastAllySpell(c, u, spellId, targetId), r,
      label + ': canCast — тот же отказ (000037: одна причина — одно поведение)');
  };
  // 1. «не ваш ход» — c.phase = 'mob' (checkTurn читает ТОЛЬКО c.phase).
  checkCase('1. не ваш ход', [MIRA193],
    (c) => { c.phase = 'mob'; },
    'light_heal', undefined, 'не ваш ход');
  // 2. «бой закончен» — c.phase = 'over'.
  checkCase('2. бой закончен', [MIRA193],
    (c) => { c.phase = 'over'; },
    'light_heal', undefined, 'бой закончен');
  // 3. «неизвестное заклинание» — id вне каталога.
  checkCase('3. неизвестное заклинание', [MIRA193],
    () => {}, 'no_such_spell', undefined, 'неизвестное заклинание');
  // 4. «заклинание не изучено» — MIRA + 'spark' (вне её книги).
  checkCase('4. не изучено', [MIRA193],
    () => {}, 'spark', undefined, 'заклинание не изучено');
  // 5. «неизвестное действие: телепорт» — инъекция каталога (CB-6):
  // internals.allySpells расширен, 'ghost' добавлен в книгу.
  {
    const saved = combatInternals.allySpells;
    try {
      combatInternals.allySpells = Object.assign({}, saved, {
        ghost: { название: 'Гост', атрибут: 'intelligence',
          мани: 1, действие: 'телепорт' },
      });
      checkCase('5. неизвестное действие', [ASHKA193],
        (c, u) => { u.spells.push('ghost'); },
        'ghost', undefined, 'неизвестное действие: телепорт');
    } finally {
      combatInternals.allySpells = saved;
    }
  }
  // 6. «в бою действует высшая степень: Пламенный взрыв» — VOLK + fireball.
  checkCase('6. высшая степень', [VOLK193],
    () => {}, 'fireball', undefined,
    'в бою действует высшая степень: Пламенный взрыв');
  // 7. «действий «Заклинание» (Мудрость) больше нет» — MIRA, spellWis 0.
  checkCase('7. пул Мудрости', [MIRA193],
    (c, u) => { u.spellWis = 0; },
    'light_heal', undefined,
    'действий «Заклинание» (Мудрость) больше нет');
  // 8. «действий «Заклинание» (Интеллект) больше нет» — ASHKA, spellInt 0.
  checkCase('8. пул Интеллекта', [ASHKA193],
    (c, u) => { u.spellInt = 0; },
    'spark', undefined,
    'действий «Заклинание» (Интеллект) больше нет');
  // 9. «не хватает маны (6)» — MIRA, mp 0 (light_heal «мани» 6).
  checkCase('9. мана', [MIRA193],
    (c, u) => { u.mp = 0; },
    'light_heal', undefined, 'не хватает маны (6)');
  // 10. «нет цели» (юнит стороны ally) — targetId = id самого союзника.
  checkCase('10. нет цели (алли)', [ASHKA193],
    () => {}, 'spark', 'a0', 'нет цели');
  // 11. «нет цели» (мёртвый) — m0.alive = false (white-box).
  checkCase('11. нет цели (мёртвый)', [ASHKA193],
    (c) => { c.units.find((x) => x.id === 'm0').alive = false; },
    'spark', 'm0', 'нет цели');
  // 12. «нет цели» (отсутствует) — targetId вне c.units.
  checkCase('12. нет цели (отсутствует)', [ASHKA193],
    () => {}, 'spark', 'ghost', 'нет цели');
  // 13. «цель слишком далеко (дальность 4)» — rectDist 5 > 4.
  checkCase('13. слишком далеко', [ASHKA193],
    (c, u) => {
      u.x = 0; u.y = 0;
      const w = c.units.find((x) => x.id === 'm0');
      w.x = 5; w.y = 0;
    },
    'spark', 'm0', 'цель слишком далеко (дальность 4)');
});

// ============================================================
// 000193-N7. startRound (combat.js) — рефилл пулов СОЮЗНИКА
// (ABSOLUT: 1 + floor(attr/10); u.mp НЕ пополняется) + тик щита
// союзника (turns −−, armor не трогается). startRound не
// экспортирован — управление ТОЛЬКО через c.endTurn() (очередь
// исчерпана → startRound). Волк (6,6) → цель игрок (3,6): к Мире
// (0,0) не подходит (nearestPlayerSide — игрок ближе), hp-дельты
// белые.
// ============================================================

test('000193-N7: startRound — рефилл пулов союзника ABSOLUT (spellWis/spellInt = 1 + floor(attr/10), mp не трогается) + тик щита {armor:2, turns:3}: round 3 → turns 1 → урон 5 = −3; round 4 → turns 0 → урон 5 = −5', () => {
  const AS = loadAllySpells193();
  assert.ok(AS && typeof AS.castAllySpell === 'function',
    'модуль src/ally-spells.js (000193)');
  const toRound = (c, r) => {
    for (let i = 0; i < 64 && c.round < r; i += 1) c.endTurn();
  };
  // (A) Рефилл пулов: каст light_heal (spellWis 1→0, mp 13→7) →
  // round 2 (1 startRound) → spellWis 1, spellInt 1, mp 7.
  {
    const c = makeCombat193([MIRA193]);
    const u = c.units.find((x) => x.id === 'a0');
    const w = c.units.find((x) => x.id === 'm0');
    u.x = 0; u.y = 0; w.x = 6; w.y = 6;
    assert.equal(activeUnitId(c), 'a0', 'фикстура: Мира активна (pre-roll)');
    u.hp = u.maxHP - 7; // ранена: 33 (+7 → 40, формула N1)
    const r = AS.castAllySpell(c, u, 'light_heal');
    assert.equal(r.ok, true, 'каст — ok (факт: ' + JSON.stringify(r) + ')');
    assert.equal(u.spellWis, 0, 'пул 1→0 (расход)');
    assert.equal(u.mp, 7, 'mp 13−6 = 7');
    assert.equal(c.round, 1,
      'фикстура: round 1 (pre-roll тиками не сопровождается)');
    toRound(c, 2);
    assert.equal(c.round, 2, 'round 2 (startRound через c.endTurn)');
    assert.equal(u.spellWis, 1,
      'рефилл ABSOLUT: spellWis = 1 + floor(Wis 4/10) = 1 (не инкремент 0+1)');
    assert.equal(u.spellInt, 1, 'рефилл ABSOLUT: spellInt = 1 + 0 = 1');
    assert.equal(u.mp, 7, 'mp НЕ пополняется в startRound (нет регена маны)');
  }
  // (B) Щит: white-box u.shield = {armor:2, turns:3} ПОСЛЕ createCombat
  // (round 1 — тиков ещё 0).
  {
    const c = makeCombat193([MIRA193]);
    const u = c.units.find((x) => x.id === 'a0');
    const w = c.units.find((x) => x.id === 'm0');
    u.x = 0; u.y = 0; w.x = 6; w.y = 6;
    u.shield = { armor: 2, turns: 3 };
    toRound(c, 3);
    assert.equal(c.round, 3, 'round 3 (2 startRound)');
    assert.equal(u.shield.turns, 1, 'тик щита: 3−2 = 1');
    assert.equal(u.shield.armor, 2, 'armor НЕ трогается тиком');
    const hp0 = u.hp;
    const d1 = combatInternals.dealDamageToAlly(c, u, 5);
    assert.equal(d1, 3, 'поглощение: 5 − armor 2 = 3 (броня Мира 0)');
    assert.equal(u.hp, hp0 - 3, 'hp −3');
    toRound(c, 4);
    assert.equal(c.round, 4, 'round 4 (3-й startRound)');
    assert.equal(u.shield.turns, 0, 'тик щита: 1−1 = 0');
    const hp1 = u.hp;
    const d2 = combatInternals.dealDamageToAlly(c, u, 5);
    assert.equal(d2, 5, 'turns 0 — поглощение 0: 5');
    assert.equal(u.hp, hp1 - 5, 'hp −5');
  }
});

// ============================================================
// VM-часть: цепочка (паттерн loadCombatUi из tests/combat-ui.test.js).
// 000193 (Д-L): ally-spells.js — ПОСЛЕ spellbook.js, ПЕРЕД combat-ui.js
// (G-снапшот — UMD-ловушка 000038). Красная фаза: файла нет —
// existsSync-guard тихо пропускает; осмысленный провал — в тестах
// (гейт 000179 держит: «недоступно активному персонажу»).
// ============================================================

const NOW193 = 1000; // фиксированное время (снимок 000179: рендер
// детерминирован и не «уходит» в будущий кадр)

// Стабы — точные копии loadCombatUi/makeEl/makeContext2d/makeRafStubs
// из tests/combat-ui.test.js (проверенная связка с combat-ui.js):
// vm-ловушка — innerHTML='' НЕ чистит children, строки при
// перестроении ДОБАВЛЯЮТСЯ (test читает хвост children.slice(N0)).
function makeContext2d(el) {
  const calls = el.drawCalls = [];
  return new Proxy({}, {
    get: (t, k) => (k in t ? t[k] : (...args) => {
      calls.push([k, args]);
    }),
    set: (t, k, v) => { t[k] = v; return true; },
  });
}

function makeEl(tag, buttons) {
  const el = {
    tagName: tag,
    className: '',
    textContent: '',
    title: '',
    disabled: false,
    style: {},
    dataset: {},
    children: [],
    onclick: null,
    listeners: {},
    appendChild(ch) { this.children.push(ch); return ch; },
    remove() {},
    addEventListener(type, fn) {
      (this.listeners[type] || (this.listeners[type] = [])).push(fn);
    },
    querySelectorAll() { return buttons; },
    getBoundingClientRect() {
      return { left: 0, top: 0, width: this.width, height: this.height };
    },
  };
  if (tag === 'canvas') {
    el.width = 0;
    el.height = 0;
    el.getContext = () => makeContext2d(el);
  }
  return el;
}

function makeRafStubs() {
  const scheduled = [];
  const cancelled = [];
  let id = 0;
  return {
    scheduled, cancelled,
    requestAnimationFrame(fn) { scheduled.push(fn); return ++id; },
    cancelAnimationFrame(x) { cancelled.push(x); },
  };
}

function findByClass(el, cls) {
  if (el.className === cls) return el;
  for (const ch of el.children || []) {
    const found = findByClass(ch, cls);
    if (found) return found;
  }
  return null;
}

function press(keydown, code) {
  const e = { code, preventDefault() {}, stopPropagation() {} };
  for (const fn of keydown) fn(e);
}

function loadUi193(opts = {}) {
  const keydown = [];
  const buttons = [];
  const document = {
    createElement: (tag) => {
      const el = makeEl(tag, buttons);
      if (tag === 'button') buttons.push(el);
      return el;
    },
    body: makeEl('body', buttons),
  };
  const window = {
    addEventListener: (type, fn) => { if (type === 'keydown') keydown.push(fn); },
  };
  const raf = makeRafStubs();
  const sandbox = {
    console, document, window,
    performance: { now: () => NOW193 },
    requestAnimationFrame: raf.requestAnimationFrame,
    cancelAnimationFrame: raf.cancelAnimationFrame,
  };
  vm.createContext(sandbox);
  for (const f of ['global-settings.js', 'perlin.js', 'map.js',
    'skills-data.js', 'items-data.js', 'sheet.js', 'player.js']) {
    vm.runInContext(src(f), sandbox, { filename: f });
  }
  if (opts.efir) vm.runInContext(src('efir.js'), sandbox, { filename: 'efir.js' });
  for (const f of ['items.js', 'controls.js', 'combat.js']) {
    vm.runInContext(src(f), sandbox, { filename: f });
  }
  if (opts.spells) {
    for (const f of ['spells-data.js', 'spells.js']) {
      vm.runInContext(src(f), sandbox, { filename: f });
    }
  }
  vm.runInContext(src('combat-keys.js'), sandbox, { filename: 'combat-keys.js' });
  if (fs.existsSync(path.join(ROOT, 'src', 'spellbook.js'))) {
    vm.runInContext(src('spellbook.js'), sandbox, { filename: 'spellbook.js' });
  }
  // 000193 (Д-L): ally-spells.js — ПОСЛЕ spellbook.js, ПЕРЕД
  // combat-ui.js (UMD-ловушка 000038: combat-ui снимает G-снапшот
  // один раз на загрузке; rowChk/castRow читают G.AllySpells из него).
  // Красная фаза: файла нет — тихо пропускаем (паттерн spellbook.js
  // выше): цепь грузится, красные падают на гейте 000179.
  if (fs.existsSync(path.join(ROOT, 'src', 'ally-spells.js'))) {
    vm.runInContext(src('ally-spells.js'), sandbox, { filename: 'ally-spells.js' });
  }
  if (fs.existsSync(path.join(ROOT, 'src', 'sprites.js'))) {
    vm.runInContext(src('sprites.js'), sandbox, { filename: 'sprites.js' });
  }
  if (fs.existsSync(path.join(ROOT, 'src', 'combat-scale.js'))) {
    vm.runInContext(src('combat-scale.js'), sandbox, { filename: 'combat-scale.js' });
  }
  vm.runInContext(src('combat-ui.js'), sandbox, { filename: 'combat-ui.js' });
  // motion.js — ПОСЛЕ combat-ui.js (зеркало index.html; ленивое чтение
  // liveGame() — снапшот-ловушка 000038 не блокирует).
  if (fs.existsSync(path.join(ROOT, 'src', 'motion.js'))) {
    vm.runInContext(src('motion.js'), sandbox, { filename: 'motion.js' });
  }
  return { G: sandbox.Game, keydown, body: document.body, raf };
}

// Сцена: 1 волк (seed 42, паттерн scene84) + опционально Эфир
// (createEfir() → pre-roll останавливается на нём: init 4 > волк 3).
function scene193(opts = {}) {
  const { G, keydown, body, raf } = loadUi193({ efir: !!opts.efir, spells: true });
  const hero = G.createCharacter();
  const c = G.combatUI.startCombat({
    hero,
    mobs: ['wolf'], mobLevel: 1, seed: 42,
    ...(opts.efir ? { efir: G.efir.createEfir() } : {}),
  });
  return { G, c, body, keydown, raf };
}

function tick193(S) {
  // Кадр rAF → render (паттерн tickSlice: steady-state без мутов).
  const s = S.raf.scheduled;
  if (s.length) s[s.length - 1]();
}

// Наёмник (kind 'merc', 000080): G.makeAlly + ручные x/y + запись в
// очередь (white box, паттерн addMerc84). id — 'a1' (игрок a0).
function addMerc193(c, G, x, y, data) {
  const merc = G.makeAlly(data, 1);
  merc.x = x; merc.y = y;
  c.units.push(merc);
  c.turnOrder.push(merc.id);
  return merc;
}

// ============================================================
// CU193-BOOK. Книга на ходу наёмника: строки КНИГИ НАЁМНИКА
// ============================================================

test('combat UI: 000193 — книга на ходу наёмника: строки = книга наёмника (unitOf — активный), без -off, клик — cast наёмника (self-heal +7, пул/мана наёмника, лог «Мира лечит себя (+7).»), игрок нетронут, книга закрыта; restore — строки игрока обратно (CU193-BOOK)', () => {
  const S = scene193({});
  const { G, c } = S;
  const wolf = c.units.find((x) => x.id === 'm0');
  // Волк в упор игрока (d 1 — в дальности 4) + цель выбрана — якорь
  // строки spark без -off (паттерн CU179-ROW: позиция игрока — c.px/c.py).
  wolf.x = c.px; wolf.y = c.py - 1;
  c.selectTarget(wolf.id);
  c._rng = () => 0.99; // удары волка — мимо (паттерн 000149)
  // Атрибуты (Dex 1 / Wis 4): mp 5+0+4 = 9 (≥ 6 — light_heal), init 1
  // (< игрок 2) — restore: round 2 стопится на игроке.
  const merc = addMerc193(c, G, 3, 5, {
    name: 'Мира', role: 'support', level: 1, dmg: 0.5, hp: 0.8,
    skills: [], spells: ['light_heal'],
    attrs: { dexterity: 1, wisdom: 4 }, maxHP: 40,
  });
  assert.equal(G.activeUnitId(c), 'player', 'ход игрока (pre-roll)');
  // (1) Якорь (ход игрока): книга игрока [spark, mend] без -off
  // (регрессия 000149). Снимок ДО KeyQ: рендер keydown-обработчика
  // синхронный — строки добавляются В НЁМ (vm-стаб не чистит
  // children: хвост slice(N0) = строки последнего перестроения).
  const bookBox = findByClass(S.body, 'combat-spellbook');
  assert.ok(bookBox, 'книга (.combat-spellbook) есть');
  const m1 = bookBox.children.length;
  press(S.keydown, 'KeyQ');
  assert.notEqual(bookBox.style.display, 'none', 'книга открыта (KeyQ)');
  tick193(S);
  let rows = bookBox.children.slice(m1);
  for (const id of ['spark', 'mend']) {
    const r = rows.find((x) => x.dataset && x.dataset.spell === id);
    assert.ok(r, 'строка «' + id + '» в книге (якорь)');
    assert.ok(!r.className.includes('combat-spellrow-off'),
      id + ' на ходу игрока — без -off');
    assert.equal(r.title, '', id + ' на ходу игрока — пустая подсказка');
  }
  // (2) Конец хода игрока → стоп на наёмнике a1: книга открыта, строки
  // пересобраны (синхронный рендер endTurn — СНИМОК ДО Space) — книга
  // НАЁМНИКА (unitOf — активный): ровно одна строка light_heal, без
  // -off, ресурса хватает (mp 9 ≥ 6, spellWis 1).
  const m2 = bookBox.children.length;
  press(S.keydown, 'Space');
  tick193(S);
  rows = bookBox.children.slice(m2);
  assert.equal(G.activeUnitId(c), 'a1', 'наёмник a1 активен');
  assert.equal(c.phase, 'player', 'ход спутника — фаза player (000168)');
  assert.notEqual(bookBox.style.display, 'none', 'книга осталась открыта');
  assert.equal(rows.length, 1,
    'ровно одна строка — книга наёмника [light_heal]; факт: '
    + rows.map((x) => (x.dataset && x.dataset.spell) || '—').join(','));
  const healRow = rows.find((x) => x.dataset && x.dataset.spell === 'light_heal');
  assert.ok(healRow,
    'строка «light_heal» (книга наёмника); красная фаза: строки ИГРОКА '
    + 'spark/mend -off: ' + rows.map((x) => (x.dataset && x.dataset.spell) || '—').join(','));
  assert.ok(!healRow.className.includes('combat-spellrow-off'),
    'строка без -off (ресурса хватает: mp 9, spellWis 1)');
  assert.equal(healRow.title, '', 'подсказка пуста (canCast ok)');
  const meta = findByClass(healRow, 'combat-spellmeta');
  assert.ok(meta && meta.textContent.includes('Мана 6'),
    'данные строки — из каталога: «Мана 6» (факт: '
    + (meta ? meta.textContent : 'нет meta') + ')');
  // (3) Клик — каст от наёмника: self-heal (ранена 33), пул/мана
  // наёмника, игрок нетронут, c._fx cast, книга закрыта.
  merc.hp = merc.maxHP - 7; // 33: +7 → 40 (без потолка)
  const n0 = c.log.length;
  const pMp0 = c.player.mp, pWis0 = c.ps.spellWis, wolfHp0 = wolf.hp;
  healRow.listeners.click[0]();
  assert.deepEqual(Array.from(c.log).slice(n0), ['Мира лечит себя (+7).'],
    'лог — вычисленный (паттерн 000168): ' + JSON.stringify(Array.from(c.log).slice(n0)));
  assert.equal(merc.hp, 40, 'self +7: 33 → 40');
  assert.equal(merc.mp, 3, 'мана наёмника 9−6 (light_heal) = 3');
  assert.equal(merc.spellWis, 0, 'пул наёмника spellWis 1→0');
  assert.equal(c.player.mp, pMp0, 'мана игрока не сожжена');
  assert.equal(c.ps.spellWis, pWis0, 'пул игрока не сожжён');
  assert.equal(wolf.hp, wolfHp0, 'волк не тронут (self-heal)');
  assert.ok(c._fx && c._fx.action === 'cast', 'FX-каст (только на успех)');
  assert.equal(bookBox.style.display, 'none', 'книга закрыта (действие совершено)');
  // (4) RESTORE: round 2 (волк — мимо) → стоп на игроке: строки игрока
  // обратно, без -off (гейт не sticky).
  press(S.keydown, 'Space');
  const m3 = bookBox.children.length;
  tick193(S);
  assert.equal(G.activeUnitId(c), 'player', 'ход игрока вернулся (round 2)');
  press(S.keydown, 'KeyQ');
  tick193(S);
  assert.notEqual(bookBox.style.display, 'none', 'книга открыта (KeyQ)');
  rows = bookBox.children.slice(m3);
  for (const id of ['spark', 'mend']) {
    const r = rows.find((x) => x.dataset && x.dataset.spell === id);
    assert.ok(r, 'строка «' + id + '» вернулась (restore)');
    assert.ok(!r.className.includes('combat-spellrow-off'),
      id + ' на ходу игрока — без -off (гейт не sticky)');
    assert.equal(r.title, '', 'подсказка пуста (restore)');
  }
});

// ============================================================
// CU193-EFIR. Книга на ходу Эфира
// ============================================================

test('combat UI: 000193 — книга на ходу Эфира: строки [spark, mend] без -off (c.efs/u.mp); клик «spark» — лог «Эфир: «Искра» — Волк: 6.» (формула 1:1, НЕ K-формула), c.efs.spellInt 1→0, u.mp 11→8, броня игнорируется, игрок нетронут, книга закрыта (CU193-EFIR)', () => {
  const S = scene193({ efir: true });
  const { G, c } = S;
  const u = c.units.find((x) => x.id === 'efir');
  const wolf = c.units.find((x) => x.id === 'm0');
  c._rng = () => 0.99;
  assert.equal(G.activeUnitId(c), 'efir',
    'Эфир активен (pre-roll стоп на его слоте: init 4 > волк 3)');
  assert.equal(u.mp, 11, 'фикстура: mp 11 < 20 — «Дыхание» не триггерится');
  // Волк в дальности Эфира (якорь (2,5)): d 1 ≤ 4; броня 50 —
  // заклинание игнорирует.
  wolf.x = 2; wolf.y = 4; wolf.maxHP = 100; wolf.hp = 100; wolf.armor = 50;
  c.targetId = wolf.id; // цель книги (white box; 000198 — вне красной фазы)
  const bookBox = findByClass(S.body, 'combat-spellbook');
  assert.ok(bookBox, 'книга (.combat-spellbook) есть');
  const m0 = bookBox.children.length;
  press(S.keydown, 'KeyQ');
  tick193(S);
  assert.notEqual(bookBox.style.display, 'none', 'книга открыта (KeyQ)');
  const rows = bookBox.children.slice(m0);
  // (1) Строки — книга Эфира [spark, mend], без -off (ресурсы полные:
  // c.efs.spellInt 1, spellWis 1, u.mp 11 ≥ 3).
  for (const id of ['spark', 'mend']) {
    const r = rows.find((x) => x.dataset && x.dataset.spell === id);
    assert.ok(r, 'строка «' + id + '» (книга Эфира)');
    assert.ok(!r.className.includes('combat-spellrow-off'),
      id + ' на ходу Эфира — без -off (rowChk: c.efs/u.mp); красная '
      + 'фаза: гейт 000179 (-off)');
    assert.equal(r.title, '', id + ' — пустая подсказка');
  }
  // (2) Клик «spark» — каст от Эфира: формула 1:1 (round((4+0.5·3)·1·
  // (1+0.05·1)) = 6 — НЕ K-формула (3+0.5·3)·1.05 → 5), пул c.efs,
  // мана u.mp, игрок нетронут.
  const n0 = c.log.length;
  const pMp0 = c.player.mp, pInt0 = c.ps.spellInt;
  rows.find((x) => x.dataset && x.dataset.spell === 'spark').listeners.click[0]();
  assert.deepEqual(Array.from(c.log).slice(n0), ['Эфир: «Искра» — Волк: 6.'],
    'лог — вербатим 000118, формула 1:1 (факт: ' + JSON.stringify(Array.from(c.log).slice(n0)) + ')');
  assert.equal(c.efs.spellInt, 0, 'c.efs.spellInt 1→0 (poolsOf — c.efs, Д-C)');
  assert.equal(c.efs.spellWis, 1, 'c.efs.spellWis не тронут (spark — Интеллект)');
  assert.equal(u.mp, 8, 'u.mp 11−3 (spark) = 8');
  assert.equal(wolf.hp, 94, 'волк −6 (броня 50 игнорируется)');
  assert.equal(c.player.mp, pMp0, 'мана игрока не сожжена');
  assert.equal(c.ps.spellInt, pInt0, 'пул игрока не сожжён');
  assert.ok(c._fx && c._fx.action === 'cast', 'FX-каст');
  assert.equal(bookBox.style.display, 'none', 'книга закрыта');
  assert.equal(G.activeUnitId(c), 'efir', 'очередь не сдвинулась');
});

// ============================================================
// CU193-OFF. Недостаток: -off строка + вербатим title + ровно ОДНА
// строка отказа, книга осталась открыта
// ============================================================

test('combat UI: 000193 — недостаток: у Эфира u.mp = 0 → строка «mend» -off, title вербатим «не хватает маны (3)»; клик — ровно ОДНА строка отказа, КАСТ не произошёл (мана/пул/волк нетронуты), книга осталась открыта (CU193-OFF)', () => {
  const S = scene193({ efir: true });
  const { G, c } = S;
  const u = c.units.find((x) => x.id === 'efir');
  const wolf = c.units.find((x) => x.id === 'm0');
  c._rng = () => 0.99;
  u.mp = 0; // маны нет: дыхание не триггерится (0 < 20)
  assert.equal(G.activeUnitId(c), 'efir', 'Эфир активен');
  wolf.x = 2; wolf.y = 4; wolf.maxHP = 100; wolf.hp = 100;
  c.targetId = wolf.id;
  const bookBox = findByClass(S.body, 'combat-spellbook');
  assert.ok(bookBox, 'книга (.combat-spellbook) есть');
  const m0 = bookBox.children.length;
  press(S.keydown, 'KeyQ');
  tick193(S);
  assert.notEqual(bookBox.style.display, 'none', 'книга открыта (KeyQ)');
  const rows = bookBox.children.slice(m0);
  const mend = rows.find((x) => x.dataset && x.dataset.spell === 'mend');
  assert.ok(mend, 'строка «mend» (книга Эфира)');
  assert.ok(mend.className.includes('combat-spellrow-off'),
    'строка -off (мана 0 < 3)');
  assert.equal(mend.title, 'не хватает маны (3)',
    'подсказка вербатим — canCastAllySpell-зеркало (факт: ' + mend.title + ')');
  // Клик — ровно ОДНА строка отказа в логе; КАСТ не произошёл: пул/мана
  // не сгорели, волк не тронут, книга ОСТАЛАСЬ открыта (UX 000149).
  const n0 = c.log.length;
  const wis0 = c.efs.spellWis, wolfHp0 = wolf.hp, pMp0 = c.player.mp;
  mend.listeners.click[0]();
  assert.deepEqual(Array.from(c.log).slice(n0), ['не хватает маны (3)'],
    'ровно ОДНА строка отказа в логе (факт: ' + JSON.stringify(Array.from(c.log).slice(n0)) + ')');
  assert.equal(c.efs.spellWis, wis0, 'c.efs.spellWis не сгорел');
  assert.equal(u.mp, 0, 'u.mp нетронут');
  assert.equal(wolf.hp, wolfHp0, 'волк не тронут (каста не было)');
  assert.equal(c.player.mp, pMp0, 'мана игрока не сожжена');
  assert.ok(!c._fx || c._fx.action !== 'cast', 'FX-каста нет');
  assert.equal(G.activeUnitId(c), 'efir', 'очередь не сдвинулась');
  assert.notEqual(bookBox.style.display, 'none', 'книга осталась открыта (видна причина)');
});

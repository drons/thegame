// Задача 000359: BUG — «Нанести руну»/«Стереть руну» (камень 40) НЕ
// учитывали навык «Рунопись» спутника/Эфира: applyRuneInscribe/
// applyRuneErase (src/building-effects.js) читали heroRuneLevel(st.hero)
// — Флогистона — тогда как «Расшифровка (заклинание)» (40_spell,
// 000133/000147) и «Наставник» (NN_mentor, 000147) уже берут НАВЫК
// с активного листа через Game.LearnTarget.activeSheet (единая точка
// 000147; fallback без пикера — hero, D2).
//
// Фикс — ЕДИНАЯ точка craftExecutor(hero) в src/building-effects.js
// (тот же inline-паттерн, что applyRuneSpell/applyMentorSpell):
// НАВЫК — с активного листа; ЭКИПИРОВКА-ЦЕЛЬ и ЗОЛОТО — герой
// (прецедент mentor D5 «казна партии — герой»; списание золота не
// меняется — требование ТЗ). Спец-модуль мира
// src/building-effect-runecraft.js навык НЕ читает — 0-diff.
//
// Семантика Эфира: «дух чертит руну на экипировке героя за золото
// партии» — цель-экипировка НЕ переносится на лист (Эфир не
// экипируется; контракты 000328.02 + mentor D5).
//
// СВИПП-РЕЕСТР (см. memory/000359-craft-skills-buildings.md):
//   * ЧИНЯТСЯ ЗДЕСЬ: '40_inscribe' (гейт R≥1 + скидка стоимости),
//     '40_erase' (скидка стоимости).
//   * УЖЕ на активном листе (guard-колонка T7): '40_spell'/'42_spell',
//     'NN_mentor'.
//   * НЕ чиним (не крафтовые действия; XP/gold-проводка привязана к
//     герою контрактами 000074/000092/000137): '40' «Расшифровать»,
//     'coin' (фонтан 49, Ловкость), '45' (колодец, Тать), '48'
//     (руины, Интеллект), '44_perform' (таверна, Выступление).
//   * Экран крафта спец-действия 'craft' (кузницы/алхимия/зачарование/
//     столярное/резьба/рунопись — src/craft.js + craft-ui.js) — ЧИНИТСЯ
//     ДОЧЕРНЕЙ 000359.01 (tests/craft-performer-000359.01.test.js):
//     performer-API навык-стороны + поля craft/craftXp/craftTypes в
//     сейвах merc/efir; мана зачарования — личная (вариант А).
//
// КРАСНЫЕ: T1–T4, T6, T7 (осмысленные ERR_ASSERTION на текущем коде:
// навык читается с героя). ЗЕЛЁНЫЕ guard'ы: T5 (герой-путь без
// пикера — контракты 000133/000147 D2), guard-колонки '40_spell'/
// mentor в T7.
//
// Харнесс — паттерн tests/spells-any-party.test.js (withGame/withState
// set-restore, РЕАЛЬНЫЕ Party/LearnTarget, sheetLike-листы, roster-
// запись 000143) + fake applyGame() из tests/runes-mechanics-
// 000328.02.test.js (hash2/getItem/RunesData/RUNE_LIMITS/
// EQUIP_PHYS_SLOTS).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

const I = require(ROOT + '/src/items.js');
const P = require(ROOT + '/src/player.js');
const PL = require(ROOT + '/src/perlin.js');
const RUNES = require(ROOT + '/src/runes-data.js').RUNES;
const Party = require(ROOT + '/src/party.js');
const LT = require(ROOT + '/src/learn-target.js');

const BE = require(ROOT + '/src/building-effects.js');
const RC = require(ROOT + '/src/building-effect-runecraft.js');
const C40 = require(ROOT + '/src/buildings.js').getBuilding(40);
const PARAMS = C40.особые_параметры.эффект.нанесение;

function withGame(fake, fn) {
  const had = Object.prototype.hasOwnProperty.call(globalThis, 'Game');
  const prev = globalThis.Game;
  globalThis.Game = fake;
  try {
    return fn();
  } finally {
    if (had) globalThis.Game = prev;
    else delete globalThis.Game;
  }
}

function withState(__game, fn) {
  const had = Object.prototype.hasOwnProperty.call(globalThis, '__game');
  const prev = globalThis.__game;
  if (__game === undefined) delete globalThis.__game;
  else globalThis.__game = __game;
  try {
    return fn();
  } finally {
    if (had) globalThis.__game = prev;
    else delete globalThis.__game;
  }
}

const clone = (v) => JSON.parse(JSON.stringify(v));

// Fake-Game для apply (паттерн runes-mechanics-000328.02 applyGame)
// + пикер-колонка: РЕАЛЬНЫЕ Party/LearnTarget, playerUI-замыкание на
// активный id (портретный ряд оверлея, 000145).
function applyGame(over = {}) {
  return Object.assign({
    hash2: PL.hash2,
    getItem: I.getItem,
    RunesData: { RUNES },
    RUNE_LIMITS: I.RUNE_LIMITS,
    EQUIP_PHYS_SLOTS: I.EQUIP_PHYS_SLOTS,
  }, over);
}

function pickerGame(activeId, over = {}) {
  return applyGame(Object.assign({
    Party,
    LearnTarget: LT,
    NpcData: { NPCS: [] },
    playerUI: { getActiveCharId: () => activeId },
  }, over));
}

// Лист-заглушка (паттерн spells-any-party sheetLike): secondary —
// истина навыков (runes — «Рунопись»); merc/Эфир-листы — те же 11
// полей sheet.js, миграции НЕ требуются.
function sheetLike(over = {}) {
  return Object.assign({
    kind: 'merc', level: 1, xp: 0, totalXp: 0, points: 0,
    primary: { strength: 1, dexterity: 1, constitution: 1,
               intelligence: 1, wisdom: 1, charisma: 1 },
    secondary: {}, skillXp: {}, spells: [],
  }, over);
}

const rosterEntry = (npcId, sheet) =>
  ({ npcId, sheet, level: 1, xp: 0, loyalty: 50, hiredDay: 1 });

// Исполнитель-колонки: активный наёмник (roster id 'merc_x') / Эфир
// (efirMet). state-партия — live (паттерн AP-*).
function runMerc(sheet, fn) {
  return withGame(pickerGame('merc_x'),
    () => withState({
      state: { efir: null, efirMet: false,
        roster: [rosterEntry('merc_x', sheet)] },
    }, fn));
}

function runEfir(sheet, fn) {
  return withGame(pickerGame('efir'),
    () => withState({ state: { efir: sheet, efirMet: true, roster: [] } },
      fn));
}

// Герой-носитель: «Соломенная шляпа» (common, head) в экипировке —
// common-база 20 з. даёт различимые исходы R (скид_ранг 0.02,
// скид_макс 0.5): R=0 → 20, R≥25 (кап 0.5) → 10; стирание — ×0.5.
function bearer(runes, gold = 500, eb = {}) {
  const hero = P.createCharacter();
  hero.gold = gold;
  hero.secondary = Object.assign({}, hero.secondary, { runes });
  hero.equipment = { head: 'straw_hat' };
  hero.equipmentBonus = eb;
  return hero;
}

function inscribeState(hero) {
  return { day: 1, tile: { x: -25, y: 34 }, hero, save: {}, catalog: C40 };
}

function eraseState(hero) {
  const st = inscribeState(hero);
  st.hero.equipmentBonus = { head: { runes: ['stone_hide'] } };
  return st;
}

// Ожидания стоимости исполнителя — ЗОЛОТОМ по чистым формулам (R —
// навык ЛИСТА-исполнителя):
const insCost = (R) => BE.inscriptionCost(PARAMS, 'common', 0, R);
const eraCost = (R) => BE.eraseCost(PARAMS, 'common', 0, R);

// ============================================================

test('T1 RED: активен наёмник с Рунопись 0 при hero 10 → «Нанести руну» ОТКАЗ «нужен навык «Рунопись»»; действие НЕ тратится (0 мутаций); RED: R читается с hero (10 ⇒ успех)', () => {
  const merc = sheetLike({ secondary: { runes: 0 } });
  const hero = bearer(10, 1000);
  const before = clone(hero);
  const r = runMerc(merc, () => BE.applyRuneInscribe(inscribeState(hero)));
  assert.equal(r.ok, false,
    'RED: отказ по НАВЫКУ ИСПОЛНИТЕЛЯ (наёмник runes 0), а не героя: '
    + JSON.stringify(r));
  assert.equal(r.message, 'нужен навык «Рунопись»',
    'причина — навык «Рунопись»; факт: ' + r.message);
  assert.deepEqual(clone(hero), before,
    'отказ — 0 мутаций героя (действие НЕ тратится)');
});

test('T2 RED: активен наёмник с Рунопись 30 при hero 0 → успех, скидка ИСПОЛНИТЕЛЯ (common n0: 20→10); руна/цель — с экипировки героя; RED: hero R=0 ⇒ «нужен навык»', () => {
  const merc = sheetLike({ secondary: { runes: 30 } });
  const hero = bearer(0, 500);
  const r = runMerc(merc, () => BE.applyRuneInscribe(inscribeState(hero)));
  assert.equal(r.ok, true,
    'RED: исполнитель со «Рунопись 30» проходит гейт при hero 0: '
    + JSON.stringify(r));
  assert.equal(r.cost, insCost(30),
    'скидка — ОТ НАВЫКА ИСПОЛНИТЕЛЯ; факт: ' + r.cost);
  assert.equal(r.cost, 10, 'golden: ceil(20 × max(1−0.5, 1−0.02·30)) = 10');
  assert.equal(insCost(0), 20, 'база R=0 без скида = 20 (исход отличается)');
  assert.equal(r.slot, 'head', 'цель-экипировка — ГЕРОЯ');
  assert.equal(r.itemId, 'straw_hat', 'предмет цели — с героя');
  assert.ok(RUNES.some((x) => x.id === r.runeId), 'runeId ∈ каталогу');
});

test('T3 RED: Эфир (efirMet) — тот же контракт: runes 0 при hero 10 → отказ; runes 30 при hero 0 → успех cost 10; RED: обе ветки считают hero', () => {
  const efirZero = sheetLike({ kind: 'efir', secondary: { runes: 0 } });
  const heroA = bearer(10, 1000);
  const r1 = runEfir(efirZero,
    () => BE.applyRuneInscribe(inscribeState(heroA)));
  assert.equal(r1.ok, false,
    'RED: Эфир с Рунопись 0 отказывает при hero 10: ' + JSON.stringify(r1));
  assert.equal(r1.message, 'нужен навык «Рунопись»', 'факт: ' + r1.message);
  const efirSkilled = sheetLike({ kind: 'efir', secondary: { runes: 30 } });
  const heroB = bearer(0, 500);
  const r2 = runEfir(efirSkilled,
    () => BE.applyRuneInscribe(inscribeState(heroB)));
  assert.equal(r2.ok, true,
    'RED: Эфир с Рунопись 30 succeeds при hero 0: ' + JSON.stringify(r2));
  assert.equal(r2.cost, 10, 'скидка исполнителя (Эфира); факт: ' + r2.cost);
  assert.equal(r2.slot, 'head',
    'экипировка-цель — героя (Эфир не экипируется)');
});

test('T4 RED: «Стереть руну» — скидка eraseCost от НАВЫКА ИСПОЛНИТЕЛЯ: герой solo (R0) → полная 10; активен наёмник R30 → ровно половина 5; RED: обе ветки = hero', () => {
  const soloHero = bearer(0, 500);
  const soloSt = eraseState(soloHero);
  const soloBefore = clone(soloSt);
  const solo = withGame(applyGame(), () => BE.applyRuneErase(soloSt));
  assert.equal(solo.ok, true,
    'solo-успех (полная стоимость): ' + JSON.stringify(solo));
  assert.equal(solo.cost, eraCost(0), 'solo: R героя 0 → без скида');
  assert.equal(solo.cost, 10, 'golden solo: ceil(20 × 0.5) = 10');
  assert.deepEqual(soloSt, soloBefore, 'apply ЧИСТО (state бит-в-бит)');
  const merc = sheetLike({ secondary: { runes: 30 } });
  const hero = bearer(0, 500);
  const st = eraseState(hero);
  const r = runMerc(merc, () => BE.applyRuneErase(st));
  assert.equal(r.ok, true,
    'стирание проходит и при активном исполнителе: ' + JSON.stringify(r));
  assert.equal(r.cost, eraCost(30),
    'RED: скидка стирания — от НАВЫКА ИСПОЛНИТЕЛЯ; факт: ' + r.cost);
  assert.equal(r.cost, 5, 'golden: ceil(inscriptionCost(R30)=10 × 0.5) = 5');
  assert.equal(r.runeId, 'stone_hide', 'LIFO — последняя руна');
  assert.equal(r.slot, 'head', 'слот — с экипировки героя');
});

test('T5 guard (зелёный на базе): БЕЗ пикера (нет LearnTarget/__game) — герой-путь bit-identical: hero R0 → отказ; hero R2 → успех/стоимость от hero (контракты 000133/000147 D2)', () => {
  const unskilled = bearer(0, 500);
  const r0 = withGame(applyGame(),
    () => withState(undefined,
      () => BE.applyRuneInscribe(inscribeState(unskilled))));
  assert.equal(r0.ok, false, 'hero R0 без пикера — отказ');
  assert.equal(r0.message, 'нужен навык «Рунопись»', 'факт: ' + r0.message);
  const hero = P.createCharacter();
  hero.gold = 500;
  hero.secondary = Object.assign({}, hero.secondary, { runes: 2 });
  hero.equipment = { right_hand: 'steel_scyte' };
  hero.equipmentBonus = {};
  const st = inscribeState(hero);
  const before = clone(st);
  const r = withGame(applyGame(),
    () => withState(undefined, () => BE.applyRuneInscribe(st)));
  assert.equal(r.ok, true, 'hero R2 без пикера — успех (golden 000328.02)');
  assert.equal(r.cost, BE.inscriptionCost(PARAMS, 'rare', 0, 2),
    'стоимость — от hero R (fallback D2)');
  assert.equal(r.itemId, 'steel_scyte', 'цель — экипировка героя');
  assert.deepEqual(st, before, 'apply ЧИСТО');
});

test('T6 RED: исполнитель R30 + hero.gold 5 → «Мало золота: нанесение руны стоит 10 з.» (скидка исполнителя + ПЛАТА ГЕРОЯ одновременно); RED: при hero R0 сообщение про навык; спец-хендлер runecraft — setItemRunes ГЕРОЕМ, gold героя', () => {
  const merc = sheetLike({ secondary: { runes: 30 } });
  const hero = bearer(0, 5);
  const r = runMerc(merc, () => BE.applyRuneInscribe(inscribeState(hero)));
  assert.equal(r.ok, false, 'мало золота героя — отказ');
  assert.equal(r.message, 'Мало золота: нанесение руны стоит 10 з.',
    'RED: скидка ИСПОЛНИТЕЛЯ (10), плата — ГЕРОЙ; факт: ' + r.message);
  assert.equal(hero.gold, 5, 'отказ — 0 списаний');
  const merc2 = sheetLike({ secondary: { runes: 30 } });
  const hero2 = bearer(0, 500);
  const ok = runMerc(merc2, () => BE.applyRuneInscribe(inscribeState(hero2)));
  assert.equal(ok.ok, true, 'успех apply при gold 500');
  assert.equal(ok.cost, 10, 'cost исполнителя');
  assert.equal(ok.slot, 'head', 'цель — экипировка героя');
  assert.equal(ok.itemId, 'straw_hat', 'предмет — с героя');
  const mercBefore = clone(merc2);
  const calls = [];
  const ctx = {
    r: ok, hero: hero2,
    world: { game: { setItemRunes: (h, slot, next) => {
      calls.push({ h, slot, next });
      return { ok: true };
    } } },
  };
  const h = RC.handle(ctx);
  assert.equal(h.ok, true, 'спец-хендлер — ok');
  assert.equal(calls.length, 1, 'один вызов setItemRunes');
  assert.equal(calls[0].h, hero2,
    'пин неизменности: руна пишется НА ЭКИПИРОВКУ ГЕРОЯ (не листа)');
  assert.equal(calls[0].slot, 'head', 'слот — с героя');
  assert.deepEqual(calls[0].next, [ok.runeId], 'runes: [runeId]');
  assert.equal(hero2.gold, 490, 'списание — С ГЕРОЯ (казна партии, D5)');
  assert.deepEqual(clone(merc2), mercBefore, 'лист исполнителя не мутирован');
});

test('T7 RED-свип: {inscribe, erase} × {наёмник, Эфир} — навык С АКТИВНОГО ЛИСТА (позитив+негатив); guard: 40_spell/наставник по-прежнему activeSheet (000147); реестр «не чиним»', () => {
  const rows = [
    { kind: 'merc', run: runMerc },
    { kind: 'efir', run: runEfir },
  ];
  const sheet = (kind, runes) => sheetLike(
    { kind: kind === 'efir' ? 'efir' : 'merc', secondary: { runes } });
  for (const { kind, run } of rows) {
    const insOk = run(sheet(kind, 30), () => {
      const hero = bearer(0, 500);
      return BE.applyRuneInscribe(inscribeState(hero));
    });
    assert.equal(insOk.ok, true,
      kind + ': inscribe — навык листа (R30 при hero 0): '
      + JSON.stringify(insOk));
    assert.equal(insOk.cost, insCost(30),
      kind + ': inscribe cost — R листа; факт: ' + insOk.cost);
    const erOk = run(sheet(kind, 30), () => {
      const hero = bearer(0, 500);
      return BE.applyRuneErase(eraseState(hero));
    });
    assert.equal(erOk.ok, true,
      kind + ': erase — навык листа: ' + JSON.stringify(erOk));
    assert.equal(erOk.cost, eraCost(30),
      kind + ': erase cost — R листа; факт: ' + erOk.cost);
    const insZero = run(sheet(kind, 0), () => {
      const hero = bearer(30, 500);
      return BE.applyRuneInscribe(inscribeState(hero));
    });
    assert.equal(insZero.ok, false,
      kind + ': inscribe — лист R0 отказывает при hero 30: '
      + JSON.stringify(insZero));
    assert.equal(insZero.message, 'нужен навык «Рунопись»',
      'факт: ' + insZero.message);
    const erZero = run(sheet(kind, 0), () => {
      const hero = bearer(30, 500);
      return BE.applyRuneErase(eraseState(hero));
    });
    assert.equal(erZero.ok, true, kind + ': erase — лист R0: успех без скида');
    assert.equal(erZero.cost, eraCost(0),
      kind + ': RED: герой R30 НЕ даёт скидку (скид — листа); факт: '
      + erZero.cost);
  }
  const spellsGame = (id) => pickerGame(id, {
    Spells: { canLearn: (sheet2) => (
      (sheet2.secondary && sheet2.secondary.runes >= 1)
        ? { ok: true } : { ok: false, reason: 'нужна Рунопись 1' }) },
  });
  const heroS = bearer(10, 500);
  const s1 = withGame(spellsGame('merc_x'), () => withState({
    state: { efir: null, efirMet: false,
      roster: [rosterEntry('merc_x', sheet('merc', 0))] },
  }, () => BE.applyRuneSpell(inscribeState(heroS))));
  assert.equal(s1.ok, false,
    'guard 000147: 40_spell — кандидат по активному (merc R0) — отказ');
  const s2 = withGame(spellsGame('flogiston'), () => withState({
    state: { efir: null, efirMet: false,
      roster: [rosterEntry('merc_x', sheet('merc', 0))] },
  }, () => BE.applyRuneSpell(inscribeState(heroS))));
  assert.equal(s2.ok, true,
    'guard 000147: 40_spell — активен герой (R10) — успех; факт: '
    + JSON.stringify(s2));
  const mentorCat = {
    особые_параметры: { наставник: { заклинания: ['fireball'], цена: 0 } },
  };
  const mentorState = () => {
    const hero = bearer(0, 500);
    hero.primary = Object.assign({}, hero.primary, { intelligence: 10 });
    return { day: 1, tile: { x: 0, y: 0 }, hero, save: {},
      catalog: mentorCat };
  };
  const mentorGame = (id) => pickerGame(id, {
    Spells: { canLearn: (sheet2) => (
      (sheet2.primary && sheet2.primary.intelligence >= 5)
        ? { ok: true } : { ok: false, reason: 'ранг школы' }) },
  });
  const m1 = withGame(mentorGame('merc_x'), () => withState({
    state: { efir: null, efirMet: false,
      roster: [rosterEntry('merc_x', sheet('merc', 0))] },
  }, () => BE.applyMentorSpell(mentorState())));
  assert.equal(m1.ok, false,
    'guard 000147: наставник — активный наёмник (INT 1) — отказ');
  const m2 = withGame(mentorGame('flogiston'), () => withState({
    state: { efir: null, efirMet: false,
      roster: [rosterEntry('merc_x', sheet('merc', 0))] },
  }, () => BE.applyMentorSpell(mentorState())));
  assert.equal(m2.ok, true,
    'guard 000147: наставник — активен герой (INT 10) — успех');
  // Реестр «НЕ чиним» (не крафтовые действия; XP/gold-проводка героя;
  // экран крафта 'craft' — чинится дочерней 000359.01, см. шапку):
  //   '40' «Расшифровать» (XP-ролл) · 'coin' фонтан 49 (Ловкость) ·
  //   '45' колодец (Тать) · '48' руины (Интеллект) · '44_perform'
  //   таверна (Выступление). Решение/причины — memory/
  //   000359-craft-skills-buildings.md.
});

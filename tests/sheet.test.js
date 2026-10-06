// Game.Sheet (задача 000140): единый «лист персонажа» — src/sheet.js.
//
// КРАСНЫЕ тесты (TDD-станция): src/sheet.js ещё НЕ СУЩЕСТВУЕТ →
// top-level require падает MODULE_NOT_FOUND, и node считает файл
// ОДНИМ упавшим тестом (осмысленно: функциональности ТЗ нет,
// не синтаксическая ошибка). Зелёная стадия создаёт src/sheet.js
// по контрактам:
//   memory/000140-sheet-model.md  — S-1..S-5, guards, UMD-ловушка,
//                                   scope-границы (000143/000144);
//   memory/000140-sheet-hero.md   — §1 API Game.Sheet, §2 слой
//                                   player.js, §5 порядок тегов;
//   memory/000139-skill-unification.md §2/§4 C1 — bank-перелив
//                                   практики на «потолке практикой»
//                                   (эталон reprocessEfirSkills,
//                                   src/efir.js L402-447).
//
// Блоки (план a3-tests §3.1):
//   SH-1 createSheet — 3 kinds, точный hero-лейаут (без kind — R-1),
//        initial — единственное различие, unknown kind → throw;
//   SH-2 addXp — кривая xpForNext, 2 очка/уровень ВСЕМ kinds,
//        totalXp, live points_per_level (000099) + guard (000098);
//   SH-3 raiseSkill — очко, дерево требований, каскад reprocessSkillXp;
//   SH-4 practice — cap = primary×2, C1-перелив в BANK, MAX-бросок,
//        ignorePracticeCap (книги), reprocessSkillXp, guards;
//   SH-5 derived — hero-формулы дословно + ctx.modifier (kind-хук);
//   UMD  — тихая standalone-загрузка (browser-ветка) + деградация
//        console.error 1× без каталога/настроек (000038/000053).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
// RED: модуль не существует (ls src/ — нет sheet.js).
const Sheet = require('../src/sheet.js');
const GS = require('../src/global-settings.js');

// --- SH-1: createSheet — 3 kinds; начальный список — параметр (ТЗ 000139) ---

test('SH-1: createSheet — 3 kinds; hero — точный лейаут createCharacter (без kind); initial — параметр; unknown kind → throw', () => {
  assert.deepEqual(Sheet.KINDS, ['hero', 'efir', 'merc']);
  assert.equal(Sheet.MAX_SKILL_LEVEL, 100);

  // hero: ТОЧНЫЙ лейаут createCharacter (player.js L96-119): порядок
  // ключей — JSON-байты сейва (культура 000031); ПОЛЯ kind У ГЕРОЯ
  // НЕТ (решение R-1: main.js сериализует hero целиком,
  // sanitizeSavedHero восстанавливает фиксированный набор).
  const h = Sheet.createSheet('hero');
  assert.equal(h.kind, undefined, 'у героя НЕТ поля kind (R-1)');
  assert.deepEqual(h, {
    name: 'Флогистон',
    level: 1,
    xp: 0,
    totalXp: 0,
    gold: 100,
    hp: 25, // maxHP из derived (база)
    mp: 16, // maxMP из derived (база)
    points: 0,
    primary: {
      strength: 1, dexterity: 1, constitution: 1,
      intelligence: 1, wisdom: 1, charisma: 1,
    },
    secondary: {},
    skillXp: {},
    spells: ['spark', 'mend'],
    alive: true,
  }, 'hero-лейаут дословно createCharacter');
  assert.deepEqual(Object.keys(h), [
    'name', 'level', 'xp', 'totalXp', 'gold', 'hp', 'mp', 'points',
    'primary', 'secondary', 'skillXp', 'spells', 'alive',
  ], 'порядок ключей = порядок createCharacter (байты сейва)');

  // initial — ЕДИНСТВЕННОЕ допустимое различие персонажей:
  // hero-путь player.js — createSheet('hero', {name}).
  const h2 = Sheet.createSheet('hero', { name: 'Тест' });
  assert.equal(h2.name, 'Тест');
  assert.deepEqual(h2.spells, ['spark', 'mend'], 'spells — дефолт героя');

  // efir/merc (база для 000144/000143): {kind, level, xp, totalXp,
  // points, primary, secondary, skillXp, spells, npcId} — БЕЗ
  // name/gold/hp/mp/alive (их save-форматы — территория 000144/143).
  const e = Sheet.createSheet('efir');
  assert.equal(e.kind, 'efir');
  assert.equal(e.level, 1);
  assert.equal(e.xp, 0);
  assert.equal(e.totalXp, 0);
  assert.equal(e.points, 0);
  assert.deepEqual(e.primary, {
    strength: 1, dexterity: 1, constitution: 1,
    intelligence: 1, wisdom: 1, charisma: 1,
  }, 'primary — дефолт 6×1');
  assert.deepEqual(e.secondary, {});
  assert.deepEqual(e.skillXp, {});
  assert.deepEqual(e.spells, []);
  assert.equal(e.name, undefined, 'у Эфира нет name');
  assert.equal(e.gold, undefined, 'у Эфира нет gold');
  assert.equal(e.hp, undefined, 'у Эфира нет hp');
  assert.equal(e.mp, undefined, 'у Эфира нет mp');
  assert.equal(e.alive, undefined, 'у Эфира нет alive');

  // merc: primary — merge ПО КЛЮЧАМ, носитель — npcId, spells — как есть.
  const m = Sheet.createSheet('merc', {
    npcId: 'npc_7', primary: { strength: 5 }, spells: ['spark'],
  });
  assert.equal(m.kind, 'merc');
  assert.equal(m.npcId, 'npc_7', 'носитель — npcId');
  assert.equal(m.primary.strength, 5, 'primary — merge по ключам');
  assert.equal(m.primary.dexterity, 1, 'не перечисленные — дефолт 1');
  assert.deepEqual(m.spells, ['spark']);

  // spells — КОПИЯ: мутация initial не просачивается в лист.
  const sp = ['spark'];
  const m2 = Sheet.createSheet('merc', { spells: sp });
  assert.notStrictEqual(m2.spells, sp, 'spells — .slice() (S-1)');
  m2.spells.push('mend');
  assert.equal(sp.length, 1, 'initial не мутирован');

  // unknown kind — throw Error (валидация входа, не деградация).
  assert.throws(() => Sheet.createSheet('wizard'), Error);
});

// --- SH-2: addXp — кривая + 2 очка/уровень ВСЕМ kinds + live (000099) ---

test('SH-2: addXp — кривая xpForNext, 2 очка/уровень ВСЕМ kinds, totalXp, live points_per_level', () => {
  // ЕДИНЫЙ источник кривой (перенос дословно, player.js L87-88).
  assert.equal(Sheet.xpForNext(1), 50);
  assert.equal(Sheet.xpForNext(2), 141); // round(50·2^1.5)
  assert.equal(Sheet.xpForNext(3), 260); // round(50·3^1.5)
  assert.equal(Sheet.xpForNext(10), 1581);
  for (let l = 1; l < 50; l++) {
    assert.ok(Sheet.xpForNext(l + 1) > Sheet.xpForNext(l),
      `xpForNext(${l + 1}) <= xpForNext(${l})`);
  }

  // hero: уровни, 2 очка/уровень, totalXp, остаток xp.
  const h = Sheet.createSheet('hero', { name: 'h' });
  let r = Sheet.addXp(h, 50);
  assert.deepEqual(r, { levelsGained: 1, pointsGained: 2 });
  assert.equal(h.level, 2);
  assert.equal(h.points, 2);
  assert.equal(h.xp, 0);
  assert.equal(h.totalXp, 50);
  r = Sheet.addXp(h, 141 + 260 + 7);
  assert.deepEqual(r, { levelsGained: 2, pointsGained: 4 });
  assert.equal(h.level, 4);
  assert.equal(h.xp, 7, 'остаток опыта');
  assert.equal(h.points, 6);
  assert.equal(h.totalXp, 458, 'totalXp ведётся (R-4)');

  // «Учёный» xpMult — hero-формулы дословно (1 + 0.02·уровень).
  const sch = Sheet.createSheet('hero', { name: 'sch' });
  sch.secondary.scholar = 10; // +20% опыта
  r = Sheet.addXp(sch, 1000);
  assert.equal(sch.totalXp, 1200, 'gained = round(amount·xpMult)');
  assert.equal(sch.level, 5);
  assert.equal(r.levelsGained, 4);
  assert.equal(r.pointsGained, 8);

  // efir И merc — 2 очка/уровень ТОЖЕ (ТЗ: ВСЕМ kinds); полей hp/mp
  // НЕТ → загрязнения NaN нет (hp/mp-кламп только при наличии поля, S-3).
  const e = Sheet.createSheet('efir');
  r = Sheet.addXp(e, 50);
  assert.deepEqual(r, { levelsGained: 1, pointsGained: 2 });
  assert.equal(e.level, 2);
  assert.equal(e.points, 2);
  assert.equal(e.totalXp, 50, 'totalXp — у ВСЕХ kinds (R-4)');
  assert.equal(e.hp, undefined, 'поля hp нет — не создавать');
  assert.equal(e.mp, undefined, 'поля mp нет — не создавать');
  const m = Sheet.createSheet('merc', { npcId: 'm' });
  r = Sheet.addXp(m, 50);
  assert.deepEqual(r, { levelsGained: 1, pointsGained: 2 });
  assert.equal(m.points, 2);
  assert.equal(m.totalXp, 50);

  // Погибший — ничего (R-2: guard sheet.alive === false).
  const dead = Sheet.createSheet('hero', { name: 'dead' });
  dead.alive = false;
  assert.deepEqual(Sheet.addXp(dead, 1000),
    { levelsGained: 0, pointsGained: 0 });
  assert.equal(dead.xp, 0);
  assert.equal(dead.totalXp, 0);
  assert.equal(dead.points, 0);

  // 000099: live-чтение points_per_level в момент вызова; ОДНО чтение
  // на вызов — начисление и возврат — одна значимость.
  const origSettings = GS.SETTINGS;
  const origPpl = origSettings.points_per_level;
  try {
    origSettings.points_per_level = 5;
    assert.equal(Sheet.pointsPerLevel(), 5, 'live-чтение SETTINGS');
    const h2 = Sheet.createSheet('hero', { name: 'h2' });
    r = Sheet.addXp(h2, 50);
    assert.equal(r.pointsGained, 5);
    assert.equal(h2.points, 5, 'начисление = значимость возврата');
  } finally {
    origSettings.points_per_level = origPpl;
  }
  // 000098: guard — битое значение → DEFAULTS (2); SETTINGS = null
  // → DEFAULTS (паттерн livePointsPerLevel, дословно).
  try {
    for (const bad of [0, -3, NaN, '2', Infinity]) {
      origSettings.points_per_level = bad;
      assert.equal(Sheet.pointsPerLevel(), 2,
        `points_per_level = ${String(bad)} → DEFAULTS`);
    }
    GS.SETTINGS = null;
    assert.equal(Sheet.pointsPerLevel(), 2, 'SETTINGS = null → DEFAULTS');
  } finally {
    GS.SETTINGS = origSettings;
    origSettings.points_per_level = origPpl;
  }
});

// --- SH-3: raiseSkill — очко, дерево, каскад reprocessSkillXp ---

test('SH-3: raiseSkill — очко, primary/secondary, требования дерева, каскад reprocessSkillXp', () => {
  const h = Sheet.createSheet('hero', { name: 'h' });
  // без очков — отказ.
  assert.deepEqual(Sheet.canRaise(h, 'strength'),
    { ok: false, reason: 'нет свободных очков навыков' });
  // основной: очко списано, уровень +1.
  h.points = 3;
  let r = Sheet.raiseSkill(h, 'strength');
  assert.equal(r.ok, true);
  assert.equal(r.level, 2);
  assert.equal(h.primary.strength, 2);
  assert.equal(h.points, 2);
  // до максимума 100.
  h.primary.strength = Sheet.MAX_SKILL_LEVEL;
  assert.deepEqual(Sheet.canRaise(h, 'strength'),
    { ok: false, reason: 'максимальный уровень' });

  // вторичный + требования дерева (числа пинов player.test.js).
  const h2 = Sheet.createSheet('hero', { name: 'h2' });
  h2.points = 20;
  let chk = Sheet.canRaise(h2, 'heavy');
  assert.equal(chk.ok, false);
  assert.match(chk.reason, /Мечник 5/);
  for (let i = 0; i < 5; i++) {
    assert.equal(Sheet.raiseSkill(h2, 'swordsman').ok, true);
  }
  assert.equal(Sheet.canRaise(h2, 'heavy').ok, true);
  r = Sheet.raiseSkill(h2, 'heavy');
  assert.equal(r.ok, true);
  assert.equal(r.level, 1);
  assert.equal(h2.secondary.heavy, 1);
  // неизвестный навык.
  assert.deepEqual(Sheet.canRaise(h2, 'nonexistent'),
    { ok: false, reason: 'неизвестный навык' });
  assert.equal(Sheet.raiseSkill(h2, 'nonexistent').ok, false);
  // погибший (R-2: alive === false; лист БЕЗ alive — жив).
  const h3 = Sheet.createSheet('hero', { name: 'h3' });
  h3.points = 1;
  h3.alive = false;
  assert.deepEqual(Sheet.canRaise(h3, 'strength'),
    { ok: false, reason: 'персонаж погиб' });
  const m = Sheet.createSheet('merc', { npcId: 'm' });
  m.points = 1;
  assert.deepEqual(Sheet.canRaise(m, 'strength'), { ok: true },
    'merc без alive — не «погибший» (R-2)');

  // каскад: застрявший в банке опыт конвертируется при росте потолка;
  // под C1 банк на cap БОЛЬШЕ (перелив копится) — лупа покрывает.
  const h4 = Sheet.createSheet('hero', { name: 'h4' });
  Sheet.practice(h4, 'swordsman', 100); // уровень 2 = потолок, банк 55
  assert.equal(h4.secondary.swordsman, 2);
  assert.equal(h4.skillXp.swordsman, 55);
  h4.points = 1;
  r = Sheet.raiseSkill(h4, 'strength'); // сила 2 → потолок 4
  assert.equal(r.ok, true);
  assert.equal(r.level, 2);
  assert.deepEqual(r.skillLevels, ['swordsman'],
    'каскад reprocessSkillXp в возврате');
  // 55: 45 (2→3) → 10; 60 (3→4) не достигается.
  assert.equal(h4.secondary.swordsman, 3);
  assert.equal(h4.skillXp.swordsman, 10);
  assert.equal(h4.points, 0);
  // без банка — каскад пуст.
  const h5 = Sheet.createSheet('hero', { name: 'h5' });
  h5.points = 1;
  r = Sheet.raiseSkill(h5, 'strength');
  assert.deepEqual(r.skillLevels, []);
});

// --- SH-4: practice — cap, C1-перелив в BANK, MAX, книги, reprocess ---

test('SH-4: practice — cap = primary×2; C1-перелив в BANK; MAX-бросок; ignorePracticeCap; reprocessSkillXp; guards', () => {
  // skillXpForNext = 15·(L+1) (перенос дословно).
  assert.equal(Sheet.skillXpForNext(0), 15);
  assert.equal(Sheet.skillXpForNext(1), 30);
  assert.equal(Sheet.skillXpForNext(99), 1500);
  const h = Sheet.createSheet('hero', { name: 'h' }); // сила 1 → cap 2
  assert.equal(Sheet.practiceCap(h, 'swordsman'), 2);
  assert.equal(Sheet.practiceCap(h, 'hide'), 2); // телосложение 1
  assert.equal(Sheet.practiceCap(h, 'nonexistent'), 0);
  assert.equal(Sheet.skillLevel(h, 'swordsman'), 0);

  // ниже cap: копилка → уровни, остаток — в копилке.
  let r = Sheet.practice(h, 'swordsman', 14);
  assert.equal(r.ok, true);
  assert.equal(r.applied, 14);
  assert.equal(r.level, 0);
  assert.equal(r.leveledUp, false);
  assert.equal(h.skillXp.swordsman, 14, 'недо порога (15) — в копилке');
  r = Sheet.practice(h, 'swordsman', 1);
  assert.equal(r.level, 1);
  assert.equal(r.leveledUp, true);
  assert.equal(h.skillXp.swordsman, 0, 'порог 15 пройден');
  r = Sheet.practice(h, 'swordsman', 30);
  assert.equal(r.level, 2);
  assert.equal(r.leveledUp, true);
  assert.equal(h.secondary.swordsman, 2, 'достигнут потолок');
  assert.equal(h.skillXp.swordsman, 0);

  // C1 (КРИТИЧНО): НА cap (level < MAX 100) — ПЕРЕЛИВ В BANK, не
  // бросок (эталон practiceEfir/reprocessEfirSkills, src/efir.js):
  // applied = gain (опыт ПРИНЯТ в копилку — решение D7), уровень НЕ
  // растёт, total = содержимое копилки после операции, reason
  // «потолок практикой» (без изменений).
  r = Sheet.practice(h, 'swordsman', 10);
  assert.equal(r.ok, true);
  assert.equal(r.applied, 10, 'опыт принят в банк (C1)');
  assert.equal(r.level, 2);
  assert.equal(r.leveledUp, false);
  assert.equal(r.total, 10);
  assert.match(r.reason, /потолок/);
  assert.equal(h.secondary.swordsman, 2, 'уровень не растёт');
  assert.equal(h.skillXp.swordsman, 10, 'опыт копится в банке (C1)');
  r = Sheet.practice(h, 'swordsman', 5);
  assert.equal(r.total, 15, 'банк продолжает копить');
  assert.equal(h.skillXp.swordsman, 15);

  // проход cap за один вызов — остаток в банке (числа — как до C1).
  const h2 = Sheet.createSheet('hero', { name: 'h2' });
  r = Sheet.practice(h2, 'swordsman', 100);
  assert.equal(h2.secondary.swordsman, 2);
  assert.equal(h2.skillXp.swordsman, 55); // 100 − 15 − 30

  // MAX = 100 — бросок СОХРАНЯЕТСЯ: applied 0, банк НЕ трогается.
  const h3 = Sheet.createSheet('hero', { name: 'h3' });
  h3.secondary.swordsman = 100;
  h3.skillXp.swordsman = 7;
  r = Sheet.practice(h3, 'swordsman', 10);
  assert.equal(r.ok, true);
  assert.equal(r.applied, 0);
  assert.match(r.reason, /макс/);
  assert.equal(r.level, 100);
  assert.equal(r.total, 7);
  assert.equal(h3.skillXp.swordsman, 7, 'банк не тронут на MAX');

  // ignorePracticeCap (книги/свитки, hook ТЗ п.1): limit = MAX —
  // рост выше practice-cap (без изменений).
  const h4 = Sheet.createSheet('hero', { name: 'h4' }); // сила 1 → cap 2
  for (let i = 0; i < 3; i++) {
    assert.equal(Sheet.practice(h4, 'heavy', 30, true).ok, true);
  }
  assert.equal(h4.secondary.heavy, 3, '90 = 15+30+45 → уровень 3');
  assert.ok(h4.secondary.heavy > Sheet.practiceCap(h4, 'heavy'),
    'книги выше потолка практикой');
  assert.equal(h4.skillXp.heavy, 0);

  // reprocessSkillXp — дословный перенос: лупа до нового cap.
  const h5 = Sheet.createSheet('hero', { name: 'h5' });
  h5.secondary.swordsman = 2;
  h5.skillXp.swordsman = 55;
  h5.primary.strength = 2; // cap 4
  const leveled = Sheet.reprocessSkillXp(h5, 'strength');
  assert.deepEqual(leveled, ['swordsman']);
  assert.equal(h5.secondary.swordsman, 3);
  assert.equal(h5.skillXp.swordsman, 10);
  assert.deepEqual(Sheet.reprocessSkillXp(h5, 'strength'), [],
    'повтор: 10 < 60 (3→4) — нечего пересчитывать');

  // guards (порядок: id → amount → alive; возврат fail-формы).
  const h6 = Sheet.createSheet('hero', { name: 'h6' });
  r = Sheet.practice(h6, 'nonexistent', 5);
  assert.equal(r.ok, false);
  assert.match(r.reason, /неизвестный/);
  assert.equal(r.applied, 0);
  assert.equal(Sheet.practice(h6, 'swordsman', -1).ok, false, 'amount < 0');
  assert.equal(Sheet.practice(h6, 'swordsman', NaN).ok, false, 'amount NaN');
  h6.alive = false;
  assert.match(Sheet.practice(h6, 'swordsman', 5).reason, /погиб/);
});

// --- SH-5: derived — hero-формулы + ctx.modifier (kind-хук) ---

test('SH-5: derived — hero-формулы дословно + ctx.modifier (kind-хук 000143/000144)', () => {
  const h = Sheet.createSheet('hero', { name: 'h' });
  const d0 = Sheet.derived(h);
  // Базовые пины (числа пинов player.test.js L132-168).
  assert.equal(d0.maxHP, 25); // (20 + 1·5)
  assert.equal(d0.maxMP, 16); // 10 + (1+1)·3
  assert.equal(d0.armor, 0);
  assert.equal(d0.moveCells, 3); // 3 + floor(1/5)
  assert.equal(d0.attackActions, 1); // 1 + floor(1/10)
  assert.equal(d0.spellActionsInt, 1);
  assert.equal(d0.spellActionsWis, 1);
  assert.equal(d0.xpMult, 1);
  assert.equal(d0.damageTakenMult, 1);
  assert.equal(d0.buyPriceMult, 1);
  assert.equal(d0.sellPriceMult, 1);
  assert.ok(Math.abs(d0.hpRegenMult - 0.10) < 1e-9);
  assert.ok(Math.abs(d0.mpRegenMult - 0.10) < 1e-9);
  // Эффекты вторичных (перенос дословно).
  h.secondary.hide = 4;
  assert.ok(Math.abs(Sheet.derived(h).damageTakenMult - 0.8) < 1e-9);
  h.secondary.endurance = 5;
  h.secondary.golem = 3;
  assert.equal(Sheet.derived(h).maxHP, 30, '25·1.21');
  assert.equal(Sheet.derived(h).armor, 3);
  h.secondary.accuracy = 10;
  assert.ok(Math.abs(Sheet.derived(h).rangedDamageBonus - 0.5) < 1e-9);
  h.secondary.merchant = 2;
  assert.ok(Math.abs(Sheet.derived(h).buyPriceMult - 0.9) < 1e-9);
  assert.ok(Math.abs(Sheet.derived(h).sellPriceMult - 1.1) < 1e-9);
  // Основные: ход/действия в бою.
  h.primary.dexterity = 15;
  h.primary.strength = 21;
  assert.equal(Sheet.derived(h).moveCells, 6);
  assert.equal(Sheet.derived(h).attackActions, 3);
  // Формулы kind-агностичны: различия kinds — только ctx.modifier.
  const m = Sheet.createSheet('merc', { npcId: 'm' });
  m.primary.strength = 21;
  assert.equal(Sheet.derived(m).attackActions, 3);

  // ctx.modifier — (base, sheet, ctx) → ПОЛНЫЙ объект (не дифф):
  // хук для 000144 (efirStats) и 000143 (role-множители makeAlly).
  const h2 = Sheet.createSheet('hero', { name: 'h2' });
  let seenArgs;
  const ctx = {
    modifier: (base, sh, c) => {
      seenArgs = [sh, c, base];
      return Object.assign({}, base, { maxHP: 1234, efirOnly: true });
    },
  };
  const r = Sheet.derived(h2, ctx);
  assert.equal(r.maxHP, 1234, 'переопределение применено');
  assert.equal(r.efirOnly, true);
  assert.equal(r.maxMP, 16, 'полный объект — base-ключи на месте');
  assert.equal(seenArgs[0], h2, 'arg 1 = sheet');
  assert.equal(seenArgs[1], ctx, 'arg 2 = ctx');
  assert.equal(seenArgs[2].maxHP, 25, 'arg 0 = base (hero-формулы)');
  // без ctx — base (hero).
  assert.equal(Sheet.derived(h2).maxHP, 25);
});

// --- UMD: тихая загрузка (browser) + деградация console.error 1× ---

test('UMD: тихая standalone-загрузка (browser-ветка) + деградация console.error 1× без каталога/настроек', () => {
  // Паттерн 000038/000053: browser-ветка НЕ читает Game при загрузке
  // (снапшота НЕТ — иначе vm-песочницы с неполной цепочкой упадут
  // при загрузке); межимодульные чтения — лениво в момент ВЫЗОВА
  // (rootRef.Game.SkillsData / rootRef.Game.GlobalSettings);
  // деградация — console.error ОДИН раз за загрузку + безопасный
  // отказ (derived → null), исключений 0 (000053).
  const errors = [];
  const sandbox = { console: { error: (m) => errors.push(String(m)) } };
  sandbox.Game = {};
  vm.createContext(sandbox);
  const src = fs.readFileSync(path.join(ROOT, 'src', 'sheet.js'), 'utf8');
  vm.runInContext(src, sandbox, { filename: 'src/sheet.js' });
  // Тихая загрузка: каталога/настроек нет — исключений нет,
  // console.error нет, Game.Sheet создан.
  assert.ok(sandbox.Game.Sheet, 'Game.Sheet создан');
  assert.equal(errors.length, 0, 'при загрузке — ноль console.error');
  // createSheet — без зависимостей (все дефолты — литералы).
  const e = sandbox.Game.Sheet.createSheet('efir', {});
  assert.equal(e.kind, 'efir');
  assert.equal(errors.length, 0,
    'createSheet не требует каталог/настройки');
  // derived без каталога — безопасный отказ: null + ОДИН след.
  assert.equal(sandbox.Game.Sheet.derived(e), null,
    'деградация: derived → null');
  assert.equal(errors.length, 1, 'деградация — ОДИН след в консоли');
  assert.match(errors[0], /sheet\.js/, 'текст называет модуль');
  assert.match(errors[0], /SkillsData/, 'текст называет Game.SkillsData');
  assert.match(errors[0], /GlobalSettings/,
    'текст называет Game.GlobalSettings');
  // Повторные вызовы — без спама (флаг — один раз за загрузку).
  assert.equal(sandbox.Game.Sheet.derived(e), null);
  assert.equal(errors.length, 1, 'повтор — без спама');
  // pointsPerLevel — молчаливый guard по конструкции (000099):
  // без GlobalSettings → DEFAULTS → литерал 2, без console.error.
  assert.equal(sandbox.Game.Sheet.pointsPerLevel(), 2);
  assert.equal(errors.length, 1, 'pointsPerLevel молчалив');
});

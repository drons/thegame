// Задача 000359.01 (дочерняя 000359): экран крафта спец-действия 'craft'
// во ВСЕХ постройках-мастерских исполнял ТОЛЬКО Флогистона — craft-ui и
// весь Game.Craft брали персонажа из hero. Фикс: performer-параметр API
// src/craft.js (skill-сторона — с листа-исполнителя; инвентарь/hasItem/
// addItem/ёмкость/манускрипты — на ГЕРОЕ, общий инвентарь партии
// 000194); performer = LearnTarget.activeSheet(hero) при ОТКРЫТИИ экрана
// (fallback hero — D2, контракты 000133/000147/000359); поля
// craft/craftXp/craftTypes в сейвах merc/efir + backfill (сейв v1 НЕ
// бампается — 000298); мана зачарования — ЛИЧНЫЙ ресурс исполнителя
// (вариант А: лист без mp → «не хватает маны»; мана НЕ казна — золото
// осталось на герое по 000359 D5).
//
// СВИПП-РЕЕСТР родителя (tests/building-craft-skills-000359.test.js):
// строка «ЭКРАН КРАФТА 'craft'» из «ДОЧЕРНЯЯ» перенесена в «чинится»
// этим файлом (расширение реестра — в шапке родителя и T7).
//
// КРАСНЫЕ: T1–T4, T6 (свиток на цель), T7, T8, T9 (экран с пикером) —
// осмысленные ERR_ASSERTION на HEAD (performer не читается, сейв-полей
// нет, свиток учит героя, экран — hero). ЗЕЛЁНЫЕ guard'ы (golden
// герой-поведение bit-identical без пикера/performer): T5, guard-ветки
// T6, serialize «голого» в T8, T9-fallback (craft-ui БЕЗ Game.
// LearnTarget — hero-путь, ловит M3: безусловный activeSheet крашит
// open() в среде без пикера).
//
// Харнесс — паттерн tests/building-craft-skills-000359.test.js
// (withGame set-restore, sheetLike-листы) + DOM-стаб/vm-цепь
// tests/craft-ui-learned.test.js (loadEnv до craft-ui.js; для fallback
// цепь БЕЗ src/learn-target.js; для пикера — sandbox.__game +
// playerUI.getActiveCharId).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const src = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

const C = require(ROOT + '/src/craft.js');
const I = require(ROOT + '/src/items.js');
const P = require(ROOT + '/src/player.js');
const CO = require(ROOT + '/src/companions.js');
const E = require(ROOT + '/src/efir.js');

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

// Game-фейк с санитизерами крафта (main.js-паттерн G.sanitizeCraft*),
// пространством Game.Craft (items.js читает G.Craft, браузерный
// контракт craft.js UMD) и каталогом вторичных навыков (фильтр
// secondary в sanitizeMercSheet).
const GAME_FAKE = Object.assign({}, C, {
  Craft: C,
  SECONDARY_SKILLS: P.SECONDARY_SKILLS,
});

const clone = (v) => JSON.parse(JSON.stringify(v));

function rolls(first, second) {
  const seq = [first, second];
  let i = 0;
  return () => (i < seq.length ? seq[i++] : 0.5);
}
const NO_ROLLS = () => 0.999;

function give(c, id, qty) {
  const r = I.addItem(c, id, qty);
  assert.equal(r.ok, true, `give(${id}): ${r.reason || ''}`);
}

const PRIMARY6 = {
  strength: 1, dexterity: 1, constitution: 1,
  intelligence: 1, wisdom: 1, charisma: 1,
};

// Лист-исполнитель (канон merc/efir листа sheet.js 000140 + опциональные
// craft-поля — те, что задача добавляет в сейв).
function sheetLike(over = {}) {
  return Object.assign({
    kind: 'merc', level: 1, xp: 0, totalXp: 0, points: 0,
    primary: Object.assign({}, PRIMARY6),
    secondary: {}, skillXp: {}, spells: [],
  }, over);
}

// ============================================================
// 1. performer-API src/craft.js — skill-сторона с листа
// ============================================================

test('T1 RED: кузница 25 — активен наёмник с forge 0 (вид изучен, ур 1) при hero ур 5 → «недостаточный уровень (нужно 2)»; исходники героя НЕ тратятся; RED: HEAD считает уровень с hero', () => {
  const hero = P.createCharacter();
  hero.craft = { 'кузнечное_дело': 5 };
  give(hero, 'iron_ore', 2);
  give(hero, 'coal', 1);
  const merc = sheetLike({
    secondary: { forge: 0 },
    craftTypes: { 'кузнечное_дело': true },
  });
  const r = C.canCraft(hero, 'iron_sword_ore',
    { building: 25, performer: merc });
  assert.equal(r.ok, false,
    'RED: гейт — УРОВЕНЬ ИСПОЛНИТЕЛЯ (лист ур 1), а не hero ур 5: '
    + JSON.stringify(r));
  assert.equal(r.reason, 'недостаточный уровень (нужно 2)',
    'факт: ' + r.reason);
  const bad = C.craft(hero, 'iron_sword_ore',
    { building: 25, performer: merc, rng: NO_ROLLS });
  assert.equal(bad.ok, false, 'craft при том же листе — отказ');
  assert.equal(bad.reason, 'недостаточный уровень (нужно 2)');
  assert.equal(I.hasItem(hero, 'iron_ore', 2), true,
    'отказ — исходники героя целы (атомарность)');
});

test('T2 RED: наёмник-мастер (ур 5, forge 10) при голом hero → успех; качество/бонус (×1.5 листа → damage 2) и XP — С ЛИСТА; исходники сняты С ГЕРОЯ, результат — герою (000194); hero.craft НЕ мутирован; RED: HEAD — «вид не изучен»', () => {
  const hero = P.createCharacter();
  give(hero, 'iron_ore', 2);
  give(hero, 'coal', 1);
  const merc = sheetLike({
    secondary: { forge: 10 },
    craftTypes: { 'кузнечное_дело': true },
    craft: { 'кузнечное_дело': 5 },
  });
  const heroCraftBefore = clone({ craft: hero.craft, xp: hero.craftXp });
  const r = C.craft(hero, 'iron_sword_ore',
    { building: 25, performer: merc, rng: rolls(0.001, 0.999) });
  assert.equal(r.ok, true,
    'RED: исполнитель ур 5 крадёт при голом hero (HEAD: «вид не изучен»): '
    + JSON.stringify(r));
  assert.equal(r.quality, true, 'качество — ролл против шанса ЛИСТА (0.07)');
  assert.deepEqual(r.bonus, { damage: 2 },
    'бонус = round(1×equipmentDurabilityMult ЛИСТА forge10 = 1.5) = 2; '
    + 'факт: ' + JSON.stringify(r.bonus));
  assert.equal(merc.craftXp['кузнечное_дело'], 12,
    'XP крафта (10+2) — на ЛИСТ; факт: ' + JSON.stringify(merc.craftXp));
  assert.equal(merc.craft['кузнечное_дело'], 5,
    'уровень вида на листе не прыгнул (порог 90 > 12)');
  assert.deepEqual(clone({ craft: hero.craft, xp: hero.craftXp }),
    heroCraftBefore, 'hero.craft/hero.craftXp НЕ тронуты');
  assert.equal(merc.inventory, undefined,
    'лист не acquiring-ся инвентарём (инвентарь — герой, 000194)');
  assert.equal(I.hasItem(hero, 'iron_ore', 2), false,
    'исходники сняты С ГЕРОЯ');
  assert.equal(I.hasItem(hero, 'iron_sword', 1), true,
    'результат — в инвентарь ГЕРОЯ (общий инвентарь партии)');
});

test('T3 RED: Эфир (kind efir, алхимия 3) — тот же контракт: изученность/уровень/XP с листа при голом hero; негатив — лист БЕЗ знания отказывает «вид не изучен» даже при hero-алхимике; RED: обе ветки на HEAD = hero', () => {
  const heroA = P.createCharacter();
  give(heroA, 'honey_cake', 1);
  give(heroA, 'moonstone', 1);
  const efir = sheetLike({
    kind: 'efir',
    secondary: { alchemy: 5 },
    craftTypes: { 'алхимия': true },
    craft: { 'алхимия': 3 },
  });
  const chk = C.canCraft(heroA, 'healing_potion',
    { building: 17, performer: efir });
  assert.equal(chk.ok, true,
    'RED: Эфир знает алхимию при голом hero: ' + JSON.stringify(chk));
  const r = C.craft(heroA, 'healing_potion',
    { building: 17, performer: efir, rng: NO_ROLLS });
  assert.equal(r.ok, true, 'craft Эфира: ' + JSON.stringify(r));
  assert.equal(efir.craftXp['алхимия'], 11,
    'XP (10+1) — духу; факт: ' + JSON.stringify(efir.craftXp));
  assert.equal(heroA.craftXp, undefined, 'hero не мутирован');
  const heroB = P.createCharacter();
  heroB.craft = { 'алхимия': 5 };
  give(heroB, 'honey_cake', 1);
  give(heroB, 'moonstone', 1);
  const dumb = sheetLike({ kind: 'efir' });
  const bad = C.canCraft(heroB, 'healing_potion',
    { building: 17, performer: dumb });
  assert.equal(bad.ok, false,
    'RED: неизученный лист отказывает при hero-алхимике (HEAD: ok)');
  assert.equal(bad.reason, 'вид не изучен', 'факт: ' + bad.reason);
});

test('T4 RED: зачарование — мана ЛИЧНАЯ (вариант А): лист без mp → «не хватает маны (4)», sheet.mp НЕ создаётся (NaN-guard); отказ — 0 списаний; performer=hero → успех, hero.mp 99→95; RED: HEAD пропускает лист (undefined<N)', () => {
  const mkHero = () => {
    const hero = P.createCharacter();
    hero.mp = 99;
    hero.craftTypes = { 'зачарование': true };
    hero.craft = { 'зачарование': 5 };
    hero.spells = hero.spells.concat(['frost_bolt']);
    give(hero, 'short_bow', 1);
    give(hero, 'phoenix_feather', 1);
    return hero;
  };
  const noMp = sheetLike({
    secondary: { runes: 5 },
    craftTypes: { 'зачарование': true },
    craft: { 'зачарование': 5 },
    spells: ['frost_bolt'],
  });
  const heroA = mkHero();
  const chk = C.canCraft(heroA, 'hunting_bow',
    { building: 12, performer: noMp });
  assert.equal(chk.ok, false,
    'RED: лист без mp НЕ проходит гейт маны (HEAD: undefined<4 = false): '
    + JSON.stringify(chk));
  assert.match(chk.reason, /^не хватает маны/, 'факт: ' + chk.reason);
  assert.equal(noMp.mp, undefined, 'отказ — sheet.mp НЕ материализуется');
  const fail = C.craft(heroA, 'hunting_bow',
    { building: 12, performer: noMp, rng: NO_ROLLS });
  assert.equal(fail.ok, false, 'craft с листом без mp — отказ');
  assert.equal(noMp.mp, undefined, 'ни поля, ни NaN на листе');
  assert.equal(heroA.mp, 99, 'мана героя НЕ тратится за чужой лист');
  assert.equal(I.hasItem(heroA, 'short_bow', 1), true,
    'отказ — исходники целы');
  const heroB = mkHero();
  const ok = C.craft(heroB, 'hunting_bow',
    { building: 12, performer: heroB, rng: NO_ROLLS });
  assert.equal(ok.ok, true, 'performer=hero — успех: ' + JSON.stringify(ok));
  assert.equal(heroB.mp, 95, 'мана списана С ИСПОЛНИТЕЛЯ (99 − 4)');
  assert.deepEqual(ok.bonus, { damage: 1 },
    'без качества — только заклинание (урон +степень 1)');
});

test('T5 guard (зелёный на HEAD): БЕЗ performer — герой-путь golden: ур/качество/XP/бонус с hero, исходники/результат на hero (fallback D2, 000133/000147)', () => {
  const hero = P.createCharacter();
  hero.craftTypes = { 'кузнечное_дело': true };
  hero.craft = { 'кузнечное_дело': 5 };
  hero.secondary = Object.assign({}, hero.secondary, { forge: 10 });
  give(hero, 'iron_ore', 2);
  give(hero, 'coal', 1);
  const chk = C.canCraft(hero, 'iron_sword_ore', { building: 25 });
  assert.equal(chk.ok, true, 'hero знает ур 5 — ok: ' + JSON.stringify(chk));
  const r = C.craft(hero, 'iron_sword_ore',
    { building: 25, rng: rolls(0.001, 0.999) });
  assert.equal(r.ok, true, 'craft golden: ' + JSON.stringify(r));
  assert.equal(r.quality, true, 'шанс с hero ур 5');
  assert.deepEqual(r.bonus, { damage: 2 }, 'множитель с hero forge 10');
  assert.deepEqual(hero.craftXp, { 'кузнечное_дело': 12 },
    'XP — герою (носитель без листа-исполнителя)');
  assert.equal(I.hasItem(hero, 'iron_sword', 1), true);
});

test('T6 RED: свиток «Чертёж: кузнечное дело» при активном листе изучает ВИД ЛИСТУ (learnTarget, зеркало spell_scroll 000147), а НЕ герою; расход — с героя; guard (green): без 4-го аргумента — hero bit-identical (000232)', () => {
  const hero = P.createCharacter();
  give(hero, 'blueprint_forge', 1);
  const merc = sheetLike({ secondary: { forge: 2 } });
  const r = withGame(GAME_FAKE,
    () => I.useItem(hero, 'blueprint_forge', 1, merc));
  assert.equal(r.ok, true, 'свиток применён: ' + JSON.stringify(r));
  assert.equal(merc.craftTypes && merc.craftTypes['кузнечное_дело'], true,
    'RED: вид изучен ИСПОЛНИТЕЛЮ (HEAD: изучился герою); лист: '
    + JSON.stringify(merc.craftTypes));
  assert.equal(hero.craftTypes, undefined,
    'hero.craftTypes НЕ появился (изучение — не герою)');
  assert.equal(I.hasItem(hero, 'blueprint_forge', 1), false,
    'расход — с ГЕРОЯ (носитель инвентаря)');
  const heroSolo = P.createCharacter();
  give(heroSolo, 'blueprint_forge', 1);
  const solo = withGame(GAME_FAKE,
    () => I.useItem(heroSolo, 'blueprint_forge'));
  assert.equal(solo.ok, true, 'без пикера — hero-путь цел');
  assert.equal(heroSolo.craftTypes['кузнечное_дело'], true,
    'golden 000232: без 4-го аргумента изучается hero');
  assert.equal(I.hasItem(heroSolo, 'blueprint_forge', 1), false);
});

// ============================================================
// 2. сейв: поля craft/craftXp/craftTypes у листов merc/efir + backfill
// ============================================================

const NPC_T = {
  id: 'merc_t',
  найм: {
    базовые_характеристики: Object.assign({}, PRIMARY6),
    начальные_навыки: {},
    spells: [],
  },
};

const rosterEntry = (sheet) => ({
  npcId: 'merc_t', sheet, level: 3, xp: 20, loyalty: 60, hiredDay: 3,
});

test('T7 RED: сейв merc — craft/craftXp/craftTypes через serializeRoster→JSON→deserializeRoster ВЫЖИВАЮТ; старый сейв без полей → backfill {}; мусор санитизируется;serialize «голого» листа — 11 ключей; dead-record/воскрешение — поля цёлы; RED: HEAD теряет поля', () => {
  const sheet = sheetLike({
    level: 3, xp: 20, totalXp: 20, trainPoints: 10,
    secondary: { forge: 12 }, skillXp: { forge: 5 }, npcId: 'merc_t',
    craft: { 'кузнечное_дело': 7 },
    craftXp: { 'кузнечное_дело': 42 },
    craftTypes: { 'кузнечное_дело': true, 'алхимия': true },
  });
  const res = withGame(GAME_FAKE, () => {
    const snap = JSON.parse(
      JSON.stringify(CO.serializeRoster([rosterEntry(sheet)])));
    return CO.deserializeRoster([NPC_T], snap);
  });
  assert.deepEqual(res.dropped, [], 'запись валидна: ' + res.dropped);
  const back = res.roster[0].sheet;
  assert.deepEqual(back.craft, { 'кузнечное_дело': 7 },
    'RED: craft выжил round-trip (HEAD: sanitizeMercSheet срезает поле); '
    + 'факт: ' + JSON.stringify(back.craft));
  assert.deepEqual(back.craftXp, { 'кузнечное_дело': 42 }, 'факт: '
    + JSON.stringify(back.craftXp));
  assert.deepEqual(back.craftTypes,
    { 'кузнечное_дело': true, 'алхимия': true },
    'факт: ' + JSON.stringify(back.craftTypes));
  // Старый сейв (лист из hire, полей нет) → сериализация НЕ приобретает
  // поля (trainPoints-прецедент absent→absent), load — backfill {}.
  const fresh = withGame(GAME_FAKE, () => {
    // «Голый» лист найма (канон 11 ключей без craft-полей; createMercSheet
    // в node не экспортируется — каноническая форма вручную).
    const f = sheetLike({ level: 3, xp: 20, totalXp: 20, trainPoints: 10,
      npcId: 'merc_t' });
    const snap = CO.serializeRoster([rosterEntry(f)]);
    assert.deepEqual(Object.keys(snap[0].sheet).sort().length, 11,
      '«голый» лист — ровно 11 ключей в сейве (поле не приобретается)');
    return CO.deserializeRoster([NPC_T], snap);
  });
  const b2 = fresh.roster[0].sheet;
  assert.deepEqual(b2.craft, {}, 'RED: backfill absent → {} (HEAD: поля нет)');
  assert.deepEqual(b2.craftXp, {}, 'backfill craftXp');
  assert.deepEqual(b2.craftTypes, {}, 'backfill craftTypes');
  assert.equal(b2.kind, 'merc', 'ядро целено');
  // Мусор в полях → санитизация (запись ЖИВА): unknown/0/falsy — вон,
  // >100 — кламп, не-объект — {}.
  const dirty = sheetLike({
    level: 3, xp: 20, npcId: 'merc_t',
    craft: { 'алхимия': 0, 'кузнечное_дело': 150, 'чужой': 5 },
    craftXp: { 'алхимия': -3, 'кузнечное_дело': 'x', 'зачарование': 7 },
    craftTypes: { 'кузнечное_дело': 'yes', 'чужой': true },
  });
  const res3 = withGame(GAME_FAKE, () => CO.deserializeRoster([NPC_T],
    JSON.parse(JSON.stringify(CO.serializeRoster([rosterEntry(dirty)])))));
  const b3 = res3.roster[0].sheet;
  assert.deepEqual(b3.craft, { 'кузнечное_дело': 100 }, 'кламп/чистка craft');
  assert.deepEqual(b3.craftXp, { 'зачарование': 7 }, 'чистка craftXp');
  assert.deepEqual(b3.craftTypes, { 'кузнечное_дело': true },
    'truthy → true, unknown — вон');
  // Путь погибшего (000161): serializeDeadRecord → reviveEntryFromRecord.
  const rec = withGame(GAME_FAKE, () => CO.serializeDeadRecord(
    rosterEntry(sheet)));
  assert.deepEqual(rec.sheet.craft, { 'кузнечное_дело': 7 },
    'RED: запись о погибшем хранит craft (HEAD: теряет)');
  const revived = withGame(GAME_FAKE,
    () => CO.reviveEntryFromRecord([NPC_T], rec));
  assert.deepEqual(revived.sheet.craftXp, { 'кузнечное_дело': 42 },
    'воскрешение — прогресс крафта цел');
});

test('T8 RED: сейв efir — serialize «голого» createEfir = 11 ключей (guard, green); deserialize — ВСЕГДА материализует craft/craftXp/craftTypes (backfill absent→{}); значения выживают round-trip; мусор санитизируется; RED: HEAD поля теряет/не создаёт', () => {
  const snapFresh = E.serializeEfir(E.createEfir());
  assert.equal(Object.keys(snapFresh).length, 11,
    'голый efir — 11 ключей (absent→absent, trainPoints-прецедент)');
  assert.equal(snapFresh.craft, undefined, 'serialize НЕ приобретает поля');
  const old5 = {
    level: 2, xp: 5, skillXp: {}, skills: {}, spells: ['spark', 'mend'],
  };
  const s = withGame(GAME_FAKE, () => E.deserializeEfir(old5));
  assert.ok(s !== null, 'старый 5-полевой принят (backfill)');
  assert.deepEqual(s.craft, {},
    'RED: backfill craft при загрузке (HEAD: поля нет): '
    + JSON.stringify(s.craft));
  assert.deepEqual(s.craftXp, {}, 'backfill craftXp');
  assert.deepEqual(s.craftTypes, {}, 'backfill craftTypes');
  s.craft = { 'зачарование': 12 };
  const snap = withGame(GAME_FAKE, () => E.serializeEfir(s));
  assert.deepEqual(snap.craft, { 'зачарование': 12 },
    'serialize копирует наличные поля');
  const back = withGame(GAME_FAKE, () => E.deserializeEfir(snap));
  assert.deepEqual(back.craft, { 'зачарование': 12 },
    'RED: craft выжил efir round-trip (HEAD: тихая потеря)');
  assert.deepEqual(back, s, 'round-trip — неподвижная точка (с craft-полем)');
  const forged = {
    kind: 'efir', level: 2, xp: 5, totalXp: 0, points: 0, trainPoints: 10,
    primary: { intelligence: 3 }, secondary: {}, skillXp: {}, skills: {},
    spells: ['spark', 'mend'],
    craft: { 'кузнечное_дело': 0, 'зачарование': 300 },
    craftXp: { 'алхимия': 'x' },
    craftTypes: { 'алхимия': 1, 'чужой': 1 },
  };
  const clean = withGame(GAME_FAKE, () => E.deserializeEfir(forged));
  assert.ok(clean !== null, 'мусор в craft-полях — санация, НЕ null');
  assert.deepEqual(clean.craft, { 'зачарование': 100 }, 'кламп craft');
  assert.deepEqual(clean.craftXp, {}, 'не-числа — вон');
  assert.deepEqual(clean.craftTypes, { 'алхимия': true },
    'truthy → true, unknown — вон');
});

// ============================================================
// 3. экран (craft-ui): performer при открытии + fallback без пикера
// ============================================================

function matchesSel(el, sel) {
  const bare = /^\[([\w-]+)(?:=([^\]]+))?\]$/.exec(sel);
  if (bare) {
    const keys = [bare[1]];
    if (bare[1].startsWith('data-')) keys.push(bare[1].slice(5));
    const key = keys.find((k) => k in el.dataset);
    if (key === undefined) return false;
    if (bare[2] !== undefined) {
      const val = bare[2].replace(/^['"]|['"]$/g, '');
      return String(el.dataset[key]) === val;
    }
    return true;
  }
  const m = /^([a-zA-Z][\w-]*)\[([\w-]+)(?:=([^\]]+))?\]$/.exec(sel);
  if (m) {
    if (String(el.tagName || '').toLowerCase() !== m[1].toLowerCase()) {
      return false;
    }
    const keys = [m[2]];
    if (m[2].startsWith('data-')) keys.push(m[2].slice(5));
    const key = keys.find((k) => k in el.dataset);
    if (key === undefined) return false;
    if (m[3] !== undefined) {
      const val = m[3].replace(/^['"]|['"]$/g, '');
      return String(el.dataset[key]) === val;
    }
    return true;
  }
  if (sel.startsWith('.')) {
    return String(el.className || '').split(/\s+/).includes(sel.slice(1));
  }
  return String(el.tagName || '').toLowerCase() === sel.toLowerCase();
}

function findAll(root, sel) {
  const out = [];
  const walk = (n) => {
    for (const ch of n.children || []) {
      if (matchesSel(ch, sel)) out.push(ch);
      walk(ch);
    }
  };
  walk(root);
  return out;
}

function makeEl(tag) {
  const el = {
    tagName: tag,
    className: '',
    _text: '',
    title: '',
    disabled: false,
    style: {},
    dataset: {},
    children: [],
    parent: null,
    listeners: {},
    appendChild(ch) {
      if (ch.parent) {
        ch.parent.children.splice(ch.parent.children.indexOf(ch), 1);
      }
      ch.parent = this;
      this.children.push(ch);
      return ch;
    },
    remove() {
      if (this.parent) {
        const i = this.parent.children.indexOf(this);
        if (i >= 0) this.parent.children.splice(i, 1);
        this.parent = null;
      }
    },
    addEventListener(type, fn) {
      (this.listeners[type] || (this.listeners[type] = [])).push(fn);
    },
    setAttribute(name, value) { this.dataset[name] = value; },
    getBoundingClientRect() { return { left: 0, top: 0 }; },
    querySelector(sel) { return findAll(this, sel)[0] || null; },
    querySelectorAll(sel) { return findAll(this, sel); },
    closest(sel) {
      let n = this;
      while (n) {
        if (matchesSel(n, sel)) return n;
        n = n.parent;
      }
      return null;
    },
  };
  Object.defineProperty(el, 'textContent', {
    get() { return this._text; },
    set(v) {
      this._text = String(v);
      for (const ch of this.children) ch.parent = null;
      this.children.length = 0;
    },
  });
  return el;
}

const FULL_CHAIN = (() => {
  const all = Array.from(
    src('index.html').matchAll(/<script\s+src="([^"]+)"/g), (m) => m[1]);
  const i = all.indexOf('src/craft-ui.js');
  assert.ok(i >= 0, 'craft-ui.js подключён в index.html');
  return all.slice(0, i + 1);
})();

// Цепь index.html до craft-ui.js; opts.noLearnTarget — выкинуть
// src/learn-target.js (среда без пикера — проверка fallback D2).
function loadEnv(opts = {}) {
  const errors = [];
  const document = {
    createElement: (tag) => makeEl(tag),
    body: makeEl('body'),
    querySelector: () => null,
    hidden: false,
    listeners: {},
    addEventListener(type, fn) {
      (this.listeners[type] || (this.listeners[type] = [])).push(fn);
    },
    removeEventListener(type, fn) {
      const a = this.listeners[type];
      if (!a) return;
      const i = a.indexOf(fn);
      if (i >= 0) a.splice(i, 1);
    },
  };
  const window = {
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  const sandbox = {
    console: {
      log: () => {}, info: () => {}, warn: () => {},
      error: (m) => errors.push(String(m)),
    },
    document, window, setTimeout, clearTimeout,
  };
  vm.createContext(sandbox);
  const chain = opts.noLearnTarget
    ? FULL_CHAIN.filter((f) => f !== 'src/learn-target.js')
    : FULL_CHAIN;
  assert.ok(opts.noLearnTarget ? chain.length === FULL_CHAIN.length - 1
    : true, 'цепь без learn-target.js собрана');
  for (const f of chain) vm.runInContext(src(f), sandbox, { filename: f });
  return { G: sandbox.Game, body: document.body, errors, sandbox };
}

function craftButtons(env) {
  const ov = findAll(env.body, '.craft-overlay')[0];
  assert.ok(ov, 'оверлей крафта открыт (.craft-overlay в body)');
  return findAll(ov, '.cp-btn')
    .filter((b) => b.dataset.craftact === 'craft');
}

function typeNames(env) {
  return findAll(env.body, '.craft-type-name').map((e) => e._text);
}

test('T9 экран: пикер на наёмнике → список/уровень/клик-крафт ЖИВУТ С ЛИСТА (hero чист); guard-цепь БЕЗ LearnTarget → hero-путь (fallback D2; ловит M3 — безусловный activeSheet крашит open)', () => {
  const env = loadEnv();
  assert.deepEqual(env.errors, [], 'ошибок при загрузке 0');
  const G = env.G;
  const b25 = G.BUILDINGS.find((x) => x && x.id === 25);
  assert.ok(b25, 'постройка 25 в каталоге');
  const hero = G.createCharacter();
  G.addItem(hero, 'iron_ore', 2);
  G.addItem(hero, 'coal', 1);
  const merc = sheetLike({
    level: 5, secondary: { forge: 10 }, spells: [], npcId: 'merc_volk',
    craftTypes: { 'кузнечное_дело': true },
    craft: { 'кузнечное_дело': 2 },
  });
  env.sandbox.__game = {
    state: { efir: null, efirMet: false,
      roster: [{ npcId: 'merc_volk', sheet: merc, level: 1, xp: 0,
        loyalty: 50, hiredDay: 1 }] },
  };
  G.playerUI = { getActiveCharId: () => 'merc_volk' };
  G.craftUI.open({ building: b25, hero });
  const ids = craftButtons(env).map((b) => b.dataset.recipe).sort();
  // Array.from — хостовый массив (CRAFT из vm-realm: deepStrictEqual
  // сверяет прототипы).
  const want = Array.from(G.Craft.CRAFT)
    .filter((r) => r.здания.includes(25) && r.тип === 'кузнечное_дело')
    .map((r) => r.id).sort();
  assert.ok(ids.length > 0,
    'RED: экран с активным исполнителем-наёмником показывает recipes '
    + '(HEAD: герой не знает — экран пуст): ' + JSON.stringify(ids));
  assert.deepEqual(ids, want,
    'показаны ВСЕ рецепты кузнечного дела (вид изучен ЛИСТУ)');
  assert.ok(typeNames(env).some((t) => t.includes('уровень 2')),
    'заголовок вида — УРОВЕНЬ ЛИСТА (2): ' + JSON.stringify(typeNames(env)));
  vm.runInContext('Math.random = (function(){ var s=[0.999,0.999],'
    + 'i=0; return function(){ return i<s.length?s[i++]:0.5; }; })()',
    env.sandbox);
  const btn = craftButtons(env).find((b) => b.dataset.recipe === 'iron_sword_ore');
  assert.ok(btn, 'кнопка iron_sword_ore');
  const ov = findAll(env.body, '.craft-overlay')[0];
  ov.listeners.click[0]({ target: btn });
  assert.equal(G.hasItem(hero, 'iron_sword', 1), true,
    'крафт с экрана — РЕЗУЛЬТАТ ГЕРОЮ (инвентарь партии)');
  assert.equal(G.hasItem(hero, 'iron_ore', 2), false,
    'исходники сняты с героя');
  assert.deepEqual({ ...merc.craftXp }, { 'кузнечное_дело': 12 },
    'XP с экрана — ЛИСТУ; факт: ' + JSON.stringify(merc.craftXp));
  assert.equal(hero.craftXp, undefined, 'hero.craftXp не мутирован');
  G.craftUI.close();
  // Fallback (D2): цепь БЕЗ Game.LearnTarget — open() жив, экран и
  // крафт на hero (headless-среда без пикера — норма, 000133/000147).
  const env2 = loadEnv({ noLearnTarget: true });
  assert.deepEqual(env2.errors, [],
    'craft-ui грузится и работает БЕЗ Game.LearnTarget');
  const G2 = env2.G;
  const hero2 = G2.createCharacter();
  hero2.secondary.forge = 10;
  hero2.craftTypes = { 'кузнечное_дело': true };
  hero2.craft = { 'кузнечное_дело': 2 };
  G2.addItem(hero2, 'iron_ore', 2);
  G2.addItem(hero2, 'coal', 1);
  let opened = true;
  try {
    G2.craftUI.open({ building: b25, hero: hero2 });
  } catch (e) {
    opened = false;
  }
  assert.ok(opened, 'open() БЕЗ LearnTarget не крашится (fallback hero)');
  assert.ok(craftButtons(env2).some((b) => b.dataset.recipe === 'iron_sword_ore'),
    'hero-путь без пикера: рецепты героя показаны');
  vm.runInContext('Math.random = (function(){ var s=[0.999,0.999],'
    + 'i=0; return function(){ return i<s.length?s[i++]:0.5; }; })()',
    env2.sandbox);
  const btn2 = craftButtons(env2)
    .find((b) => b.dataset.recipe === 'iron_sword_ore');
  const ov2 = findAll(env2.body, '.craft-overlay')[0];
  ov2.listeners.click[0]({ target: btn2 });
  assert.equal(hero2.craftXp['кузнечное_дело'], 12,
    'XP — герою (performer = hero при отсутствии пикера)');
  assert.equal(G2.hasItem(hero2, 'iron_sword', 1), true);
});

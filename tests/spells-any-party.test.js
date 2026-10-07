// Задача 000147 (follow-up 000139): «…одних и тех же навыков,
// ЗАКЛИНАНИЙ и т.п.» — ЕДИНОЕ изучение заклинаний для ВСЕХ членов
// партии: источники (свиток / руна / наставник; книга — зарезер-
// вированная, предметов-книг НЕТ) действуют на АКТИВНОГО персонажа
// (000145) ВСЕХ kinds (hero/efir/merc). canLearn/learn (src/spells.
// js) — БЕЗ ИЗМЕНЕНИЙ (generic с 000133: носитель-агностины — p.
// spells любой массив, ранг — p.primary[spell.атрибут], Рунопись —
// p.secondary.runes для 'rune' only); обобщение — в обёртках:
//   * LearnTarget.activeSheet(hero) — НОВЫЙ модуль src/learn-target.
//     js — ОДИН резолвер активного листа (fallback — hero);
//   * useItem(c, itemId, qty, learnTarget) — 4-й ОПЦИОНАЛЬНЫЙ
//     аргумент (изучение на лист, предмет ВСЕГДА с c);
//   * applyRuneSpell — кандидаты по активному (picked=learned);
//   * 'mentor' (SPEC L1074, 000133b): 5 школ 17/18/19/21/38, цена
//     50 с героя, первый learnable, БЕЗ daily-лимита;
//   * UI «Книга заклинаний»: learned (.cp-itemrow — пины B6/B7 intact)
//     + avail (.cp-availrow/.cp-avail-title — НОВЫЙ класс, display-
//     only, «<источник>: доступно|canLearn.reason»).
//
// Контракт: memory/000147-unified-spell-learning.md (§3.1-3.7, §4 —
// эти красные). ТЗ: tasks/pending/000147.md. Контракты-родители:
// 000133 (canLearn/learn, свитки, руна), 000145 (Party, активный),
// 000144 (Эфир-лист/авто-unlocks), 000146 (секции «Персонажа»).
//
// КРАСНЫЕ — 10 (expectedRedCount = 10). Все падают на ТЕКУЩЕМ
// коде: источники ЗАПЕЧАНЫ НА ГЕРОЕ СТРУКТУРНО (носитель = владелец
// инвентаря c / ctx.hero / st.hero — литерала kind==='hero' НЕТ).
// Падение — ПО СИМВОЛУ/КОНТЕНТУ, не SyntaxError/крах файла (ленивый
// require новых модулей ВНУТРИ тел — паттерн 000133):
//   * AP-1  (node) — activeSheet → ТОТ ЖЕ live-лист Эфира; ранг школы
//     — от его Int/Wis; learn мутирует sheet.spells. RED: src/learn-
//     target.js отсутствует (assert.fail «модуль отсутствует»).
//   * AP-2  (node) — activeSheet → live-лист наёмного (roster);
//     ранг/база/mentor-БЕЗ-Рунописи. RED: тот же символ.
//   * AP-3  (node) — свиток → АКТИВНЫЙ наёмный (4-й арг. useItem);
//     hero.spells не тронут; предмет с героя. RED: 4-й аргумент
//     игнорируется (T = c = герой INT 1) → r.ok:false вместо ok.
//   * AP-4  (node) — свиток → ЭФИР + авто-разблокировки intact
//     (append-only). RED: 4-й аргумент → heroC (INT 1) → отказ.
//   * AP-5  (node) — руна: кандидаты ПО АКТИВНОМУ наёмному; golden
//     (tile,day)-пик (5,7) день 1 → shadow_bolt (тот же, что R2);
//     runes 0 → отказ; БЕЗ __game → hero (регрессия R2-совместимо).
//     RED: learner = st.hero (runes 0) → cands 0 → ok:false.
//   * AP-M1 (node) — каталоги 17/18/19/21/38: наставник.заклинания
//     (пулы D12) + цена 50 + эффекты NN_mentor (38: ['38','38_mentor']
//     + раз_в_день-объект) + реестр EFFECTS['NN_mentor'] + зеркало
//     buildings.js. RED: каталожного ключа/реестровых записей нет.
//   * AP-M2 (node) — applyMentorSpell: ЧИСТО, первый learnable, цена
//     50, message «Наставник передал: «Имя»»; отказы БЕЗ марки.
//     RED: функция не экспортируется.
//   * AP-M3 (node) — building-effect-mentor: learn на активного,
//     gold С ГЕРОЯ, повтор → «уже изучено», без Spells → console.
//     error. RED: модуль отсутствует.
//   * AP-6  (vm)   — UI «Книга заклинаний»: learned + avail-строки
//     (display-only, источник+reason); Эфир — каноника data-driven.
//     RED: avail-блока НЕТ (renderBook learned-only + early-return
//     у Эфира) → .cp-availrow = 0.
//   * AP-7  (vm)   — UI-путь: свиток «исп.» → АКТИВНОМУ наёмному
//     (hero.spells не тронут, flash 000133 intact). RED: ui.js
//     G.useItem(c, id) без 4-го аргумента → герой учится.
//
// Механика: ЧАСТЬ A — node; ЧАСТЬ B — ДИНАМИЧЕСКАЯ vm-цепочка ВСЕ
// <script src> index.html до ui.js включительно (паттерн tests/ui-
// tab-skills-active.test.js L370): подхватит тег src/learn-target.
// js (слот day.js→items.js, ДО ui.js) на зелёной стадии САМ —
// лоадер МЕЖДУ ФАЗАМИ НЕ ПРАВится. building-effect-mentor.js — ПОСЛЕ
// ui.js (слот спец-модулей, как runes) — в цепочку до ui.js НЕ
// входит (осознанно). `__game.state` (efir/efirMet/roster — live) —
// ИНЖЕКЦИЯ в sandbox ДО openPanel (main.js в цепочке нет — точку
// ставит тест).
//
// БАЗА worktree: master 7306ca3 (красная фаза ДО ребейза; каталог
// 16 заклинаний, канон. книга Эфира 10 строк). Data-driven-ассерты
// (G.efir.efirSpellsByLevel(100).length) переживают ребейз на
// 000163 (17 заклинаний, 11 строк: +resurrect — АВТО-unlock Эфира,
// в avail-строках НЕ появляется: источников у него нет).
//
// Cross-realm (vm): пины — примитивы/текст/длина (правило 000082);
// массивы песочницы — через [...arr] в node-массив (примитивы
// общие, прототипы — разные).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const src = (f) => fs.readFileSync(path.join(ROOT, 'src', f), 'utf8');
const page = () => fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// --- Сущности на базе (require — в теле теста или на верхнем уровне:
// ВСЕ эти модули существуют на базе 7306ca3) ---
const Party = require('../src/party.js');      // 000145 — на базе
const S = require('../src/spells.js');         // 000045/000133 — на базе
const P = require('../src/player.js');
const I = require('../src/items.js');
const B = require('../src/buildings.js');
const BE = require('../src/building-effects.js');
const E = require('../src/efir.js');
const Sheet = require('../src/sheet.js');
const PL = require('../src/perlin.js');

// --- Хелперы node-части ---

// globalThis.Game — set/restore (дубль tests/building-effects.
// test.js withGame).
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

// globalThis.__game — set/restore; undefined → delete (сценарии
// «без __game» — fallback на hero, D2).
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

// Guarded-require НОВОГО модуля learn-target: RED-фаза — файла нет;
// падение — ОСМЫСЛЕННОЕ assert.fail («модуль отсутствует»), не
// MODULE_NOT_FOUND-крах всего файла (каждый A-тест падает
// независимо).
function loadLearnTarget() {
  let m;
  try {
    m = require('../src/learn-target.js');
  } catch (err) {
    assert.fail(
      'модуль src/learn-target.js отсутствует (задача 000147: ' +
      'Game.LearnTarget = { activeSheet } — единый резолвер ' +
      'активного носителя изучения, контракт §3.1): ' + err.message);
  }
  return m;
}

// try/catch-лоадер для тестов, где RED-падение — не «модуль нет»,
// а ПОВЕДЕНИЕ (AP-5: learner = st.hero; AP-M3 — здесь assert.ok
// прямо по null).
function tryLoad(rel) {
  try {
    return require(rel);
  } catch (err) {
    return null;
  }
}

// Лист-заглушка (единый sheet 000140/000143): все primary 1; canLearn
// читает primary[атрибут]/spells/secondary.runes — остальное не
// важно. kind-дискриминатор — для читабельности (canLearn-агностины).
function sheetLike(over = {}) {
  return Object.assign({
    kind: 'merc', level: 1, xp: 0, totalXp: 0, points: 0,
    primary: { strength: 1, dexterity: 1, constitution: 1,
               intelligence: 1, wisdom: 1, charisma: 1 },
    secondary: {}, skillXp: {}, spells: [],
  }, over);
}

// Запись roster 000143 (6 ключей).
const rosterEntry = (npcId, sheet) =>
  ({ npcId, sheet, level: 1, xp: 0, loyalty: 50, hiredDay: 1 });

// Hero-литерал для activeSheet (live-ссылка вызывающего, D3).
const heroLite = () =>
  ({ name: 'Флогистон', level: 1, xp: 0, points: 0,
     primary: { strength: 1 }, secondary: {}, skillXp: {},
     spells: [] });

const INT = (n, over = {}) =>
  Object.assign({ strength: 1, dexterity: 1, constitution: 1,
                  intelligence: n, wisdom: 1, charisma: 1 }, over);

// ============================================================
// ЧАСТЬ A (node): AP-1..AP-5 — резолвер + источники свиток/руна
// ============================================================

// --- AP-1: Эфир активен → live-лист; школа — от ЕГО Int/Wis ---

test('000147 AP-1: activeSheet — активен ЭФИР → ТОТ ЖЕ live-лист (не копия); ранг школы — от его Wisdom (3 → «Знаток»-отказ; 11 → ok); learn мутирует sheet.spells, повтор → «уже изучено»; RED: модуль src/learn-target.js отсутствует', () => {
  const LT = loadLearnTarget();
  const hero = heroLite();
  const efir = sheetLike({
    kind: 'efir',
    primary: { strength: 1, dexterity: 1, constitution: 3,
               intelligence: 3, wisdom: 3, charisma: 1 },
    spells: ['spark', 'mend'] });
  const G = {
    Party, NpcData: { NPCS: [] },
    playerUI: { getActiveCharId: () => 'efir' },
  };
  const st = { efir, efirMet: true, roster: [] };
  const got = withGame(G, () => withState({ state: st },
    () => LT.activeSheet(hero)));
  assert.equal(got, efir,
    'live-ссылка на лист Эфира (learn/raise — in place, 000144)');
  // Школа — по атрибуту ЛИСТА Эфира (wisdom 3 → Ученик < Знаток t2):
  const r1 = S.canLearn(efir, 'light_heal', 'scroll');
  assert.equal(r1.ok, false, 'WIS 3 — Ученик: t2 закрыт');
  assert.equal(r1.reason, 'нужен ранг школы «Знаток»',
    'reason — дословно из spells.js (не расползается)');
  // Поднять Wisdom листа Эфира до 11 (Знаток) → ок:
  efir.primary.wisdom = 11;
  assert.equal(S.canLearn(efir, 'light_heal', 'scroll').ok, true,
    'WIS 11 — Знаток: t2 открыт (школа — от ЛИСТА, не от героя)');
  assert.equal(S.learn(efir, 'light_heal', 'scroll').ok, true);
  assert.deepEqual(efir.spells, ['spark', 'mend', 'light_heal'],
    'learn — мутация sheet.spells (единый лист 000144)');
  const r2 = S.learn(efir, 'light_heal', 'scroll');
  assert.equal(r2.ok, false);
  assert.equal(r2.reason, 'уже изучено', 'повтор — отказ (без дублей)');
});

// --- AP-2: наёмный активен → live-лист; ранг/база/mentor ---

test('000147 AP-2: activeSheet — активен НАЁМНЫЙ (roster) → ТОТ ЖЕ live-лист; INT 1 → «Знаток»; INT 26 без базы → «нужно базовое заклинание: Огненный шар»; source «mentor» БЕЗ Рунописи (runes 0 + INT 26 + база → ok, «rune» на том же листе — «нужна Рунопись 3»); learn — без дублей; RED: модуль отсутствует', () => {
  const LT = loadLearnTarget();
  const hero = heroLite();
  const merc = sheetLike({ primary: INT(1), spells: [] });
  const G = {
    Party, NpcData: { NPCS: [] },
    playerUI: { getActiveCharId: () => 'merc_x' },
  };
  const st = { efir: null, efirMet: false,
    roster: [rosterEntry('merc_x', merc)] };
  const got = withGame(G, () => withState({ state: st },
    () => LT.activeSheet(hero)));
  assert.equal(got, merc,
    'live-ссылка на лист наёмного (entry.sheet — 000143)');
  // Ранг школы — от INT ЛИСТА наёмного (1 → Ученик < Знаток t2):
  const r1 = S.canLearn(merc, 'fireball', 'scroll');
  assert.equal(r1.ok, false, 'INT 1: t2 закрыт');
  assert.equal(r1.reason, 'нужен ранг школы «Знаток»');
  // Совершенствование: INT 26 (Мастер t3), но база не изучена:
  const merc2 = sheetLike({ primary: INT(26), spells: [] });
  const r2 = S.canLearn(merc2, 'flame_burst', 'mentor');
  assert.equal(r2.ok, false);
  assert.equal(r2.reason, 'нужно базовое заклинание: Огненный шар',
    'база для совершенствований — на НОСИТЕЛЕ (не на герое)');
  // 'mentor' — БЕЗ проверки Рунописи (runes 0): базовое изучено → ok.
  // У 'rune' на ТОМ ЖЕ листе — «нужна Рунопись 3» (t3).
  merc2.spells = ['fireball'];
  assert.equal(S.canLearn(merc2, 'flame_burst', 'mentor').ok, true,
    "source 'mentor' — только школьные проверки (ранг+база)");
  assert.equal(S.canLearn(merc2, 'flame_burst', 'rune').reason,
    'нужна Рунопись 3', '«rune» — с Рунописью (разница source)');
  // learn — мутация live-листа, без дублей:
  const merc3 = sheetLike({ primary: INT(11), spells: [] });
  assert.equal(S.learn(merc3, 'fireball', 'scroll').ok, true);
  assert.deepEqual(merc3.spells, ['fireball']);
  assert.equal(S.learn(merc3, 'fireball', 'scroll').reason,
    'уже изучено');
});

// --- AP-3: свиток → активный наёмный (4-й аргумент useItem) ---

test('000147 AP-3: свиток — изучение на АКТИВНОГО наёмного: useItem(heroC, «fireball_scroll», 1, mercSheet) → mercSheet.spells += fireball, heroC.spells не тронут, предмет −1 С ГЕРОЯ; отказ (merc INT 1) → «Знаток», предмет НЕ сошёл; БЕЗ 4-го аргумента → heroC (регрессия 000133); RED: 4-й аргумент игнорируется (T = c) → r.ok:false', () => {
  // (1) успех:merc INT 11 (Знаток) — свиток у ГЕРОЯ, learn — на merc:
  const heroC = P.createCharacter();
  assert.equal(I.addItem(heroC, 'fireball_scroll', 1).ok, true);
  const merc = sheetLike({ primary: INT(11), spells: [] });
  const heroSpells0 = [...heroC.spells];
  const r = withGame({ Spells: S },
    () => I.useItem(heroC, 'fireball_scroll', 1, merc));
  assert.equal(r.ok, true,
    'RED: 4-й аргумент отсутствует — T = c = heroC (INT 1) → ' +
    'отказ «Знаток»; GREEN: T = merc (INT 11) → ok');
  assert.equal(r.message, 'Изучено: «Огненный шар»',
    'message 000133 intact (строка items.js дословно)');
  assert.deepEqual([...merc.spells], ['fireball'],
    'learn — на лист АКТИВНОГО наёмного');
  assert.deepEqual([...heroC.spells], heroSpells0,
    'книга ГЕРОЯ не тронута (изучение — активного)');
  assert.equal(I.totalQty(heroC, 'fireball_scroll'), 0,
    'предмет расходуется из инвентаря ГЕРОЯ (носитель, D4)');
  // (2) отказ:merc INT 1 — предмет НЕ тратится, причина — в ответе:
  const heroC2 = P.createCharacter();
  assert.equal(I.addItem(heroC2, 'fireball_scroll', 1).ok, true);
  const mercWeak = sheetLike({ primary: INT(1), spells: [] });
  const r2 = withGame({ Spells: S },
    () => I.useItem(heroC2, 'fireball_scroll', 1, mercWeak));
  assert.equal(r2.ok, false, 'merc INT 1 — t2 закрыт');
  assert.equal(r2.reason, 'нужен ранг школы «Знаток»');
  assert.equal(I.totalQty(heroC2, 'fireball_scroll'), 1,
    'отказ → предмет НЕ сошёл (000133: return ДО removeItem)');
  assert.deepEqual([...mercWeak.spells], [], 'на листе мутаций нет');
  // (3) РЕГРЕССИЯ (зелёный с первого запуска): БЕЗ 4-го аргумента —
  //   изучение на c (hero) — побайтово 000133:
  const heroC3 = P.createCharacter();
  heroC3.primary.intelligence = 11;
  assert.equal(I.addItem(heroC3, 'fireball_scroll', 1).ok, true);
  const r3 = withGame({ Spells: S },
    () => I.useItem(heroC3, 'fireball_scroll'));
  assert.equal(r3.ok, true, '2-арг. вызов — герой учится (как ДО)');
  assert.ok([...heroC3.spells].includes('fireball'));
  assert.equal(I.totalQty(heroC3, 'fireball_scroll'), 0);
});

// --- AP-4: Эфир — свиток + авто-разблокировки (append-only) ---

test('000147 AP-4: ЭФИР — авто-разблокировка L5 intact (light_heal, регрессия 000111/000144); свиток fireball_scroll → лист Эфира (INT 11): книга = старт + авто-unlock + изученное; ДАЛЬНЕЙШИЙ levelUp не затирает изученное (append-only, авто-fireball L10 без дубля); RED: 4-й аргумент → heroC (INT 1) → отказ', () => {
  const heroC = P.createCharacter();
  const gameXp = { xpForNext: P.xpForNext, Sheet };
  // (1) РЕГРЕССИЯ: L1→L5 — авто light_heal (5-й порог UNLOCKS):
  const efir = withGame(gameXp, () => {
    const s = E.createEfir();
    const gained = E.addEfirXp(s,
      P.xpForNext(1) + P.xpForNext(2) + P.xpForNext(3) + P.xpForNext(4));
    assert.equal(gained, 4, 'L1→L5 (4 уровня за один addXp)');
    assert.equal(s.level, 5);
    assert.deepEqual(s.spells, ['spark', 'mend', 'light_heal'],
      'авто-разблокировка light_heal (5-й уровень) — как ДО (000111)');
    return s;
  });
  // (2) UNIFIED: свиток fireball (у ГЕРОЯ) → лист Эфира (INT 11 —
  //     Знаток, t2 открыт; fireball ещё НЕ изучен — авто-unlock L10):
  assert.equal(I.addItem(heroC, 'fireball_scroll', 1).ok, true);
  efir.primary.intelligence = 11;
  const r = withGame({ Spells: S },
    () => I.useItem(heroC, 'fireball_scroll', 1, efir));
  assert.equal(r.ok, true,
    'RED: 4-й аргумент отсутствует — T = heroC (INT 1) → «Знаток»; ' +
    'GREEN: T = лист Эфира (INT 11) → ok');
  assert.equal(r.message, 'Изучено: «Огненный шар»');
  assert.deepEqual([...efir.spells],
    ['spark', 'mend', 'light_heal', 'fireball'],
    'единая книга Эфира: старт + авто-unlock + изученное (append)');
  assert.deepEqual([...heroC.spells], ['spark', 'mend'],
    'книга ГЕРОЯ не тронута');
  assert.equal(I.totalQty(heroC, 'fireball_scroll'), 0,
    'свиток — с инвентаря ГЕРОЯ (носитель, D4)');
  // (3) append-only: L5→L8 (auto frost_bolt) — изученное на месте,
  //     ДАЛЬНЕЙШИЙ авто-unlock fireball (L10) — без дубля:
  withGame(gameXp, () => {
    E.addEfirXp(efir, P.xpForNext(5) + P.xpForNext(6) + P.xpForNext(7));
    assert.equal(efir.level, 8, 'L8 — авто frost_bolt');
    assert.deepEqual([...efir.spells],
      ['spark', 'mend', 'light_heal', 'fireball', 'frost_bolt'],
      'levelUp ДОБАВЛЯЕТ, не затирает изученное (append-only, ТЗ: ' +
      'авто-разблокировки СОХРАНЕНЫ — изучение ДОБАВЛЯЕТ источники)');
    E.addEfirXp(efir,
      P.xpForNext(8) + P.xpForNext(9)); // L8→L10
    assert.equal(efir.level, 10, 'L10 — авто fireball (УЖЕ изучен)');
    assert.deepEqual([...efir.spells],
      ['spark', 'mend', 'light_heal', 'fireball', 'frost_bolt'],
      'auto-unlock уже изученного — без дубля (appendSpells идемпотент)');
  });
});

// --- AP-5: руна — кандидаты ПО АКТИВНОМУ (merc), golden intact ---

test('000147 AP-5: руна — кандидаты ПО АКТИВНОМУ наёмному: (5,7) день 1, 5 кандидатов → golden shadow_bolt (тот же пик, что R2-герой — (tile,day)-детерминизм intact); наёмный runes 0 → отказ БЕЗ spellId; БЕЗ __game — кандидаты по st.hero (регрессия R2-совместимо); ЧИСТО: state не мутирован; RED: learner = st.hero (runes 0) → cands 0 → ok:false', () => {
  const LT = tryLoad('../src/learn-target.js');
  const G = {
    hash2: PL.hash2, Spells: S, Party,
    NpcData: { NPCS: [] },
    playerUI: { getActiveCharId: () => 'merc_x' },
  };
  if (LT) G.LearnTarget = LT; // GREEN: резолвер в снапшоте Game
  // Наёмный-learner: INT 11, Рунопись 2, frost_bolt УЖЕ изучен —
  // кандидаты по пулу камня (40) РОВНО 5 (как у R2-героя):
  // chill, vine, magic_shield, fireball, shadow_bolt.
  const merc = sheetLike({
    primary: INT(11), secondary: { runes: 2 },
    spells: ['spark', 'mend', 'frost_bolt'] });
  // st.hero — носитель apply-state: INT 1, Рунопись 0 (0 кандидатов —
  // RED-фаза падает именно этим).
  const heroCarrier = sheetLike({
    primary: INT(1), secondary: { runes: 0 },
    spells: ['spark', 'mend'] });
  const st = { day: 1, tile: { x: 5, y: 7 }, hero: heroCarrier,
    save: {}, catalog: B.getBuilding(40) };
  const s0 = JSON.parse(JSON.stringify(st));
  // (1) активен наёмный → кандидаты по merc → golden shadow_bolt:
  const st1 = { efir: null, efirMet: false,
    roster: [rosterEntry('merc_x', merc)] };
  const r1 = withGame(G, () => withState({ state: st1 },
    () => BE.applyRuneSpell(st)));
  assert.equal(r1.ok, true,
    'RED: learner = st.hero (INT 1, runes 0) → cands 0 → отказ; ' +
    'GREEN: кандидаты по АКТИВНОМУ наёмному (INT 11, runes 2)');
  assert.equal(r1.success, true, 'успех — success:true (контракт)');
  assert.equal(r1.spellId, 'shadow_bolt',
    'golden (tile,day)-пик (5,7) день 1, 5 кандидатов → shadow_bolt ' +
    '(ТОТ ЖЕ, что R2 на hero — сид RUNE_SPELL_SEED не тронут)');
  assert.equal(r1.message, 'Расшифровано: «Теневой сгусток»',
    'message 000133 intact');
  assert.deepEqual(st, s0,
    'ЧИСТО (000071): state (hero-носитель включён) БЕЗ МУТАЦИЙ — ' +
    'learn() не в apply, а в спец-модуле');
  // (2) наёмный с Рунописью 0 → пустые кандидаты → отказ БЕЗ spellId:
  const merc0 = sheetLike({
    primary: INT(11), secondary: { runes: 0 },
    spells: ['spark', 'mend', 'frost_bolt'] });
  const st2 = { efir: null, efirMet: false,
    roster: [rosterEntry('merc_x', merc0)] };
  const r2 = withGame(G, () => withState({ state: st2 },
    () => BE.applyRuneSpell(st)));
  assert.equal(r2.ok, false, 'пустые кандидаты (Рунопись 0) → отказ');
  assert.match(r2.message, /нет заклинаний, доступных для расшифровки/,
    'отказ БЕЗ марки (день не сгорает, 000133)');
  assert.equal(r2.spellId, undefined, 'spellId отсутствует');
  // (3) БЕЗ __game — fallback на st.hero (регрессия: R2-golden на
  //     hero-носителе intact):
  const heroR = sheetLike({
    primary: INT(11), secondary: { runes: 2 },
    spells: ['spark', 'mend', 'frost_bolt'] });
  const st3 = { day: 1, tile: { x: 5, y: 7 }, hero: heroR, save: {},
    catalog: B.getBuilding(40) };
  const r3 = withGame(G, () => withState(undefined,
    () => BE.applyRuneSpell(st3)));
  assert.equal(r3.ok, true, 'без __game — кандидаты по st.hero (D2)');
  assert.equal(r3.spellId, 'shadow_bolt', 'R2-golden на hero intact');
});

// ============================================================
// ЧАСТЬ A-M (node): AP-M1..M3 — «Наставник» (SPEC L1074, 5 школ)
// ============================================================

// Пулы D12 (контракт §2; union = все 16 заклинаний каталога базы).
const MENTOR_POOLS = {
  17: ['fireball', 'flame_burst', 'inferno'],          // Лаборатория
  18: ['spark', 'frost_bolt', 'blizzard'],             // Башня мага
  19: ['chill', 'shadow_bolt'],                        // Монастырь
  21: ['mend', 'light_heal', 'greater_heal', 'vine',
       'nature_blessing'],                             // Храм исцеления
  38: ['magic_shield', 'stone_skin', 'ward'],          // Храм горы
};
const MENTOR_PRICE = 50;
const buildingJson = (id) =>
  JSON.parse(fs.readFileSync(
    path.join(ROOT, 'assets', 'buildings',
      String(id).padStart(6, '0') + '.json'), 'utf8'));

// --- AP-M1: каталоги + реестр + зеркало ---

test('000147 AP-M1: каталоги 17/18/19/21/38 — наставник.заклинания (пулы D12) + цена 50 + эффекты NN_mentor (38: ["38","38_mentor"] + раз_в_день-ОБЪЕКТ {38:true}); реестр EFFECTS[NN_mentor] {имя «Обучение (наставник)», apply}; hasDailyLimit: 38→true, 38_mentor→false, 17_mentor→false; зеркало buildings.js deepEqual JSON; RED: каталожного ключа/реестровых записей нет', () => {
  for (const [id, pool] of Object.entries(MENTOR_POOLS)) {
    const j = buildingJson(Number(id));
    const mentor = j.особые_параметры && j.особые_параметры.наставник;
    assert.deepEqual(mentor, { заклинания: pool, цена: MENTOR_PRICE },
      'каталог ' + id + ': наставник.заклинания (D12) + цена 50 ' +
      '(RED: ключа «наставник» в JSON нет)');
    // Зеркало (GENERATED, npm run sync:buildings) — побайтово JSON:
    assert.deepEqual(B.getBuilding(Number(id)), j,
      'зеркало src/buildings.js ' + id + ' = JSON (sync)');
  }
  // 38: явный эффекты-массив (благословение ПЕРВОЙ) + раз_в_день
  // boolean→ОБЪЕКТ (благословение побайтово; '38_mentor' — нет):
  const j38 = buildingJson(38);
  assert.deepEqual(j38.особые_параметры.эффекты,
    ['38', '38_mentor'],
    'каталог 38: эффекты ["38","38_mentor"] (порядок оверлея)');
  assert.deepEqual(j38.особые_параметры.раз_в_день, { 38: true },
    'каталог 38: раз_в_день boolean→пер-эффектный объект (000092)');
  // Реестр + лимиты:
  for (const id of Object.keys(MENTOR_POOLS)) {
    const e = BE.EFFECTS[id + '_mentor'];
    assert.ok(e, 'EFFECTS[' + id + '_mentor] в реестре (RED: записи нет)');
    assert.equal(e.имя, 'Обучение (наставник)',
      'имя действия (паттерн «Расшифровка (заклинание)»)');
    assert.equal(typeof e.apply, 'function', 'apply(state) — чистый');
  }
  assert.deepEqual(BE.effectIds(B.getBuilding(17)), ['17_mentor'],
    'effectIds(17) — из каталожного эффектов');
  assert.deepEqual(BE.effectIds(B.getBuilding(38)),
    ['38', '38_mentor'], 'effectIds(38) — оба, каталожный порядок');
  assert.equal(BE.hasDailyLimit(B.getBuilding(38), '38'), true,
    'благословение 38 — раз в день (побайтово, объект-ветка)');
  assert.equal(BE.hasDailyLimit(B.getBuilding(38), '38_mentor'), false,
    'наставник 38 — БЕЗ лимита (ключа нет = fail-open, D5)');
  assert.equal(BE.hasDailyLimit(B.getBuilding(17), '17_mentor'), false,
    'наставник 17 — БЕЗ лимита (флага нет, D5)');
});

// --- AP-M2: applyMentorSpell (ЧИСТОЕ ядро) ---

test('000147 AP-M2: applyMentorSpell — ЧИСТОЕ: активен Эфир INT 11 → ПЕРВЫЙ learnable пула 17 (fireball), price 50, message «Наставник передал: «Огненный шар»»; hero НЕ мутирован (purity — списание в хендлере); атрибуты 1 → отказ /заклинаний нет/ БЕЗ spellId; gold 10 → «недостаточно золота», gold не списан; RED: функция не экспортируется', () => {
  assert.equal(typeof BE.applyMentorSpell, 'function',
    'BE.applyMentorSpell экспортируется (контракт §3.3) ' +
    '(RED: экспорт отсутствует)');
  assert.equal(typeof BE.mentorSpellPool, 'function',
    'BE.mentorSpellPool экспортируется (контракт §3.3)');
  const LT = tryLoad('../src/learn-target.js');
  const mkG = () => {
    const g = {
      Party, NpcData: { NPCS: [] }, Spells: S,
      playerUI: { getActiveCharId: () => 'efir' },
    };
    if (LT) g.LearnTarget = LT;
    return g;
  };
  const st17 = () => ({ day: 1, tile: { x: 2, y: 3 },
    hero: { gold: 100, spells: [] }, save: {},
    catalog: B.getBuilding(17) });
  // (1) успех: активен Эфир INT 11 (Знаток) — первый в пуле 17
  //     learnable = fireball (flame_burst — база не изучена, inferno
  //     — t4):
  const efir = sheetLike({
    kind: 'efir',
    primary: { strength: 1, dexterity: 1, constitution: 3,
               intelligence: 11, wisdom: 3, charisma: 1 },
    spells: ['spark', 'mend'] });
  const st = st17();
  const before = JSON.parse(JSON.stringify(st));
  const r = withGame(mkG(), () => withState(
    { state: { efir, efirMet: true, roster: [] } },
    () => BE.applyMentorSpell(st)));
  assert.equal(r.ok, true, 'успех — ok:true');
  assert.equal(r.success, true, 'успех — success:true');
  assert.equal(r.spellId, 'fireball',
    'первый learnable-кандидат в порядке пула (D6: pool.find, БЕЗ RNG)');
  assert.equal(r.price, MENTOR_PRICE, 'цена — из каталога (наставник.цена)');
  assert.equal(r.message, 'Наставник передал: «Огненный шар»',
    'message по контракту (getSpell-название)');
  assert.deepEqual(st, before,
    'ЧИСТО (000071): hero (gold/spells) БЕЗ МУТАЦИЙ — списание ' +
    'золота в спец-хендлере, learn — в спец-модуле');
  // (2) лист с атрибутами 1 → ни один пул не learnable → отказ:
  const weak = sheetLike({
    kind: 'efir',
    primary: { strength: 1, dexterity: 1, constitution: 3,
               intelligence: 1, wisdom: 1, charisma: 1 },
    spells: [] });
  const st2 = st17();
  const r2 = withGame(mkG(), () => withState(
    { state: { efir: weak, efirMet: true, roster: [] } },
    () => BE.applyMentorSpell(st2)));
  assert.equal(r2.ok, false, 'пустые кандидаты → отказ БЕЗ марки');
  assert.match(r2.message, /заклинаний нет/,
    'причина по контракту (ранг школы/базовое); факт: ' + r2.message);
  assert.equal(r2.spellId, undefined, 'spellId отсутствует');
  assert.equal(r2.success, undefined, 'success отсутствует');
  // (3) мало золота → отказ ДО списания (gold 10 < 50):
  const st3 = st17();
  st3.hero.gold = 10;
  const r3 = withGame(mkG(), () => withState(
    { state: { efir, efirMet: true, roster: [] } },
    () => BE.applyMentorSpell(st3)));
  assert.equal(r3.ok, false, 'gold < цена → отказ БЕЗ марки (повтор ок)');
  assert.equal(r3.message, 'недостаточно золота');
  assert.equal(st3.hero.gold, 10, 'gold не списан при отказе');
  assert.deepEqual(st3.hero.spells, [], 'spells не тронуты');
});

// --- AP-M3: спец-модуль building-effect-mentor (мировая сторона) ---

test('000147 AP-M3: building-effect-mentor — handleMentorSpell: learn на АКТИВНОГО наёмного (live-лист), gold −50 С ГЕРОЯ (общая казна), hero.spells не тронут; повтор → {ok:false, message:«уже изучено»}, gold НЕ списан; без Game.Spells → console.error + «заклинания недоступны», мутаций нет; RED: модуль отсутствует', () => {
  const MT = tryLoad('../src/building-effect-mentor.js');
  assert.ok(MT,
    'модуль src/building-effect-mentor.js существует (контракт §3.4: ' +
    'наставники 5 школ, саморегистрация NN_mentor, 1:1 по форме ' +
    'src/building-effect-runes.js)');
  assert.equal(typeof MT.handleMentorSpell, 'function',
    'handleMentorSpell(ctx) экспортируется');
  const LT = require('../src/learn-target.js');
  const merc = sheetLike({ primary: INT(11), secondary: {}, spells: [] });
  const hero = { gold: 100, spells: [] };
  const G = {
    Party, NpcData: { NPCS: [] }, Spells: S, LearnTarget: LT,
    playerUI: { getActiveCharId: () => 'merc_x' },
  };
  const __g = { state: { efir: null, efirMet: false,
    roster: [rosterEntry('merc_x', merc)] } };
  const ctx = {
    hero,
    r: { ok: true, success: true, spellId: 'fireball', price: 50,
         message: 'Наставник передал: «Огненный шар»' },
    world: { game: G },
  };
  withGame(G, () => withState(__g, () => {
    const res = MT.handleMentorSpell(ctx);
    assert.deepEqual(res, { ok: true },
      'успех → { ok: true } (message — из apply, приоритет 000128)');
    assert.deepEqual([...merc.spells], ['fireball'],
      'learn — на лист АКТИВНОГО наёмного (live, 000143)');
    assert.equal(hero.gold, 50,
      'gold списан С ГЕРОЯ (общая казна партии, D5)');
    assert.deepEqual([...hero.spells], [],
      'spells ГЕРОЯ не тронуты (носитель ≠ лист, D4)');
    // Повтор: learner уже знает → отказ БЕЗ марки, gold НЕ списан:
    const res2 = MT.handleMentorSpell(ctx);
    assert.deepEqual(res2, { ok: false, message: 'уже изучено' },
      'повтор — canLearn-отказ (день не сгорает, D5)');
    assert.equal(hero.gold, 50, 'gold НЕ списан при отказе');
    assert.deepEqual([...merc.spells], ['fireball'], 'без дублей');
  }));
  // Без Game.Spells (битый порядок тегов) — console.error + отказ,
  // мутаций НЕТ (000038: «мёртвая магия» заметна):
  const ctx2 = {
    hero: { gold: 100, spells: [] },
    r: { ok: true, success: true, spellId: 'fireball', price: 50,
         message: '…' },
    world: { game: {} },
  };
  const errs = [];
  const realErr = console.error;
  console.error = (m) => { errs.push(String(m)); };
  try {
    const res3 = MT.handleMentorSpell(ctx2);
    assert.deepEqual(res3,
      { ok: false, message: 'заклинания недоступны' },
      'без Game.Spells — отказ (000053)');
    assert.ok(errs.length >= 1,
      'console.error (UMD-ловушка 000038 — порядок тегов); ' +
      'факт: ' + JSON.stringify(errs));
    assert.deepEqual(ctx2.hero, { gold: 100, spells: [] },
      'без мутаций (gold не списан, spells не тронуты)');
  } finally {
    console.error = realErr;
  }
});

// ============================================================
// ЧАСТЬ B (vm): ДИНАМИЧЕСКАЯ цепочка до ui.js — страница «Персонаж»
// ============================================================

// --- Минимальный DOM-стаб с деревом (дубль tests/ui-tab-skills-
// active.test.js L67-161; matchesSel — с «тег[атрибут]») ---

function matchesSel(el, sel) {
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
      (this.listeners[type] || (this.listeners[type] = []))
        .push(fn);
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
  // textContent = '' — как в DOM, сбрасывает детей (render() панели
  // обновляет секции in place).
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

// ДИНАМИЧЕСКИЙ CHAIN: ВСЕ <script src> index.html до ui.js
// включительно. GREEN-фаза — тег src/learn-target.js (слот
// day.js→items.js) подхватывается САМ; лоадер между фазами НЕ
// правится (building-effect-mentor.js — ПОСЛЕ ui.js — в цепочку НЕ
// входит, осознанно — как runes).
const CHAIN = (() => {
  const all = Array.from(
    page().matchAll(/<script\s+src="([^"]+)"/g), (m) => m[1])
    .map((p) => p.replace(/^src\//, ''));
  const i = all.indexOf('ui.js');
  assert.ok(i >= 0, 'ui.js подключён в index.html');
  return all.slice(0, i + 1);
})();

// Загрузка цепочки в vm-песочницу → { G, body, errors, sandbox }.
function loadEnv() {
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
  for (const f of CHAIN) vm.runInContext(src(f), sandbox, { filename: f });
  return { G: sandbox.Game, body: document.body, errors, sandbox };
}

// Партия для vm-тестов 000147: герой (ctx.character) + Эфир
// (live, efirMet) + наёмный Вольк (000143: 6 ключей; sheet — живой
// лист). opts: { heroScroll — свиток в инвентарь ГЕРОЯ, mercInt —
// INT листа наёмного }. `__game.state` (live) — ИНЖЕКЦИЯ ДО
// openPanel (main.js в цепочке нет — точку ставит тест).
function makePartyEnv(opts = {}) {
  const env = loadEnv();
  assert.equal(env.errors.length, 0,
    'ошибок при загрузке цепочки нет: ' + env.errors.join('; '));
  assert.ok(env.G.playerUI, 'Game.playerUI создан (ui.js в CHAIN)');
  const hero = env.G.createCharacter();
  const efir = env.G.efir.createEfir();
  const volk = env.G.NpcData.NPCS.find((n) => n.id === 'merc_volk');
  assert.ok(volk, 'Вольк (merc_volk) в каталоге npc-data');
  const mercSheet = env.G.Sheet.createSheet('merc', {
    primary: volk.найм.базовые_характеристики,
    spells: volk.найм.spells,
    npcId: 'merc_volk',
  });
  for (const [id, lv] of Object.entries(volk.найм.начальные_навыки)) {
    mercSheet.secondary[id] = lv; // 000141: начальные навыки
  }
  // 000147: Рунопись 1 (avail-пины «руна: доступно») + INT по опции:
  mercSheet.secondary.runes = 1;
  if (opts.mercInt != null) mercSheet.primary.intelligence = opts.mercInt;
  const roster = [{ npcId: 'merc_volk', sheet: mercSheet, level: 1,
    xp: 0, loyalty: 51, hiredDay: 1 }];
  if (opts.heroScroll) {
    const add = env.G.addItem(hero, opts.heroScroll, 1);
    assert.ok(add && add.ok, 'свиток в инвентаре героя: ' + opts.heroScroll);
  }
  env.sandbox.__game = { state: { efir, efirMet: true, roster } };
  env.G.playerUI.setCharacter(hero);
  env.G.playerUI.toggle(true); // buildPanel + render
  env.hero = hero;
  env.mercSheet = mercSheet;
  env.efirSheet = efir;
  return env;
}

// --- Хелперы (ЧАСТЬ B; дубль tests/ui-tab-skills-active.test.js) ---

function characterPane(env) {
  const cols = findAll(env.body, '.cp-column');
  assert.ok(cols && cols.length >= 1,
    'панель персонажа построена (.cp-column в body)');
  const panes = findAll(cols[0], '.cp-tabpane');
  return panes[0] || null;
}

function panelOf(env) {
  const p = findAll(env.body, '.char-panel')[0];
  assert.ok(p, 'панель .char-panel в body');
  return p;
}

// Клик через ОДИН делегированный слушатель панели (пин ui-panel:
// ровно 1 click-обработчик — новая ветка ВНУТРИ него, не новый).
function clickPanel(env, target) {
  const panel = panelOf(env);
  const clickers = panel.listeners.click || [];
  assert.ok(clickers.length >= 1,
    'делегированный click-обработчик на панели (ОДИН)');
  clickers[0]({ target });
}

// Секция по СВОЕМУ тексту заголовка (.cp-section; строки — дети).
function sectionOf(pane, name) {
  assert.ok(pane, 'character-pane существует');
  return findAll(pane, '.cp-section')
    .find((s) => s.textContent === name) || null;
}

// --- AP-6: UI «Книга заклинаний» — learned + avail ---

test('000147 AP-6: UI «Книга заклинаний» — learned-строки (.cp-itemrow — пины B6/B7 intact: у наёмного 1 «—») + avail-строки (.cp-availrow/.cp-avail-title): «<источник>: доступно|reason», display-only (кнопок НЕТ); наёмный: «Огненный шар» = «свиток: нужен ранг школы «Знаток»», «Хлад» = «руна: доступно»; Эфир: каноника data-driven (G.efir — не хардкод 10/11) + «Теневой сгусток» = «руна: нужен ранг школы «Знаток»»; RED: avail-блока НЕТ', () => {
  const env = makePartyEnv({ heroScroll: 'fireball_scroll' });
  const pane = characterPane(env);
  // (1) АКТИВЕН наёмный (INT 1, Рунопись 1, spells []):
  env.G.playerUI.toggle(true, 'character', 'merc_volk');
  assert.equal(env.errors.length, 0,
    'переключение активного: 0 ошибок: ' + env.errors.join('; '));
  const bookSec = sectionOf(pane, 'Книга заклинаний');
  assert.ok(bookSec, 'секция «Книга заклинаний» (все kinds, 000145)');
  // learned — БЕЗ ИЗМЕНЕНИЙ (отдельный класс avail, D7):
  const learned = findAll(bookSec, '.cp-itemrow');
  assert.equal(learned.length, 1,
    'learned-строки наёмного — 1 «—» (B7-пин intact: avail-строки ' +
    'ДРУГИМ классом .cp-availrow)');
  assert.equal(learned[0].querySelector('.cp-itemname').textContent,
    '—', 'пустая книга — строка «—» (как ДО)');
  // avail-блок (контракт §3.6):
  const avail = findAll(bookSec, '.cp-availrow');
  assert.ok(avail.length >= 1,
    'avail-строки (RED: блока НЕТ — renderBook learned-only)');
  for (const row of avail) {
    assert.equal(row.querySelector('button'), null,
      'avail — display-only: кнопок НЕТ (read-only, как learned; ' +
      'изучение — через предмет [I] / постройку [E])');
  }
  const titles = findAll(bookSec, '.cp-avail-title');
  assert.equal(titles.length, 1, 'заголовок avail-блока — ОДИН');
  assert.equal(titles[0].textContent, 'Доступно к изучению:',
    'текст заголовка по контракту §3.6');
  const byName = (name) => avail.find((r) => {
    const nm = r.querySelector('.cp-itemname');
    return nm && nm.textContent === name;
  });
  const fb = byName('Огненный шар');
  assert.ok(fb, 'avail-строка «Огненный шар»');
  assert.equal(fb.querySelector('.cp-itemmeta').textContent,
    'свиток: нужен ранг школы «Знаток»',
    'первый источник — свиток (инвентарь ГЕРОЯ), canLearn.reason ' +
    'по АКТИВНОМУ наёмному (INT 1 < Знаток t2)');
  const ch = byName('Хлад');
  assert.ok(ch, 'avail-строка «Хлад»');
  assert.equal(ch.querySelector('.cp-itemmeta').textContent,
    'руна: доступно',
    'первый источник — руна (пул камня 40); canLearn ok (t1, ' +
    'Рунопись 1 ≥ 1)');
  // (2) АКТИВЕН Эфир: каноника data-driven + avail не-канонических:
  env.G.playerUI.toggle(true, 'character', 'efir');
  assert.equal(env.errors.length, 0,
    'переключение на Эфир: 0 ошибок: ' + env.errors.join('; '));
  const rows2 = findAll(bookSec, '.cp-itemrow');
  assert.equal(rows2.length, env.G.efir.efirSpellsByLevel(100).length,
    'каноническая книга Эфира — data-driven (старт + ВСЕ UNLOCKS; ' +
    '10 на базе, 11 после 000163 — хардкода НЕТ, gotcha §8.11)');
  const avail2 = findAll(bookSec, '.cp-availrow');
  assert.ok(avail2.length >= 1,
    'avail-строки у Эфира (не-канонические с источниками)');
  const sb = avail2.find((r) => {
    const nm = r.querySelector('.cp-itemname');
    return nm && nm.textContent === 'Теневой сгусток';
  });
  assert.ok(sb,
    'avail-строка «Теневой сгусток» (НЕ каноника Эфира; источники: ' +
    'руна 40 / наставник 19)');
  assert.equal(sb.querySelector('.cp-itemmeta').textContent,
    'руна: нужен ранг школы «Знаток»',
    'первый источник — руна; INT Эфира 3 → Ученик < Знаток (t2)');
  assert.equal(env.errors.length, 0, '0 ошибок: ' + env.errors.join('; '));
});

// --- AP-7: UI-путь — свиток «исп.» → активному наёмному ---

test('000147 AP-7: UI-путь — свиток «исп.» → АКТИВНОМУ наёмному (INT 11): mercSheet.spells += frost_bolt, hero.spells НЕ тронут, свиток −1 С ИНВЕНТАРЯ ГЕРОЯ, flash «Изучено: «Морозная стрела»» (000133 intact); RED: ui.js G.useItem(c, id) без 4-го аргумента → learn на героя → assert merc.spells падает', () => {
  const env = makePartyEnv({ heroScroll: 'frost_bolt_scroll',
    mercInt: 11 });
  // Активный — наёмный (INT 11; frost_bolt t1 — порог пройден):
  env.G.playerUI.toggle(true, 'character', 'merc_volk');
  assert.equal(env.errors.length, 0,
    'переключение активного: 0 ошибок: ' + env.errors.join('; '));
  // Вкладка «Инвентарь» (column 0, pane 1 — порядок тегов 000130):
  const panel = panelOf(env);
  const tab = findAll(panel, '.cp-tab').find((t) =>
    t.dataset.col === '0' && t.dataset.tabid === 'inventory');
  assert.ok(tab, 'вкладка «Инвентарь» (column 0)');
  clickPanel(env, tab);
  const cols = findAll(env.body, '.cp-column');
  const invPane = findAll(cols[0], '.cp-tabpane')[1];
  assert.ok(invPane && invPane.style.display === '',
    'панель «Инвентарь» активна (display ≠ none)');
  const btn = findAll(invPane, '.cp-btn').find((b) =>
    b.dataset.act === 'use' && b.dataset.item === 'frost_bolt_scroll');
  assert.ok(btn, 'кнопка «исп.» у frost_bolt_scroll (000133)');
  const heroSpells0 = [...env.hero.spells];
  clickPanel(env, btn);
  assert.equal(env.errors.length, 0,
    'клик «исп.»: 0 ошибок: ' + env.errors.join('; '));
  assert.deepEqual([...env.mercSheet.spells], ['frost_bolt'],
    'RED: ui.js G.useItem(c, id) — 2 аргумента → learn на ГЕРОЯ ' +
    '(hero.spells += frost_bolt, merc не тронут); GREEN: 4-й ' +
    'аргумент = LearnTarget.activeSheet(c) = активный наёмный');
  assert.deepEqual([...env.hero.spells], heroSpells0,
    'книга ГЕРОЯ не тронута (изучение — активного, D4)');
  assert.equal(env.G.totalQty(env.hero, 'frost_bolt_scroll'), 0,
    'свиток расходуется из инвентаря ГЕРОЯ (носитель, D4)');
  const notice = panel.querySelector('.cp-notice');
  assert.equal(notice.textContent, 'Изучено: «Морозная стрела»',
    'flash-сообщение 000133 intact (строка items.js дословно)');
});

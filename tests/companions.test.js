// Спутники: ядро отряда (задача 000079, родитель 000065) — найм, отказ,
// лояльность, жалованье, увольнение, уход.
//
// КРАСНЫЕ тесты (TDD): падают, пока src/companions.js не реализован.
//
// Контракт (SPEC.md «Спутники», заключение аналитика):
//   * ЧИСТЫЙ UMD-модуль без DOM/game-state (паттерн src/npc.js): node —
//     require(), браузер — Game.companions (СТРОЧНОЕ имя — 000083/000087
//     вызывают G.companions);
//   * запись отряда (000143, 000139 C3): RUNTIME — ровно 6 ключей
//     {npcId, sheet, level, xp, loyalty, hiredDay} (sheet — единый
//     лист наёмника, 000140; level/xp — плоские ЗЕРКАЛА sheet),
//     СЕЙВ — 4 поля {npcId, sheet, loyalty, hiredDay}; старая
//     5-полевая форма {npcId, level, xp, loyalty, hiredDay}
//     (000082/000085) — неломаный вход: backfill при восстановлении
//     (зафиксированный JSON — tests/companions-sheet.test.js CS-3);
//   * результат найма: {ok:true, entry, loyalty} | {refused:true, …} |
//     {ok:false, reason} — отказ (refused) отличен от сбоя canHire
//     ({ok:false} для disabled-кнопок): 000083 по флагу `refused` пишет
//     текст в npcLog;
//   * при отказе золото НЕ списывается; лояльность новичка
//     min(100, 50 + Харизма) (1:1, cap 100), диапазон лояльности 0…100;
//   * жалованье: gold ≥ Σ жалованье → списать, всем +2 (cap 100);
//     иначе — золоту не списывается, всем −20 (floor 0) и проверка ухода
//     по НОВОЙ лояльности: ≤20 — уйдёт верно, 21…40 — 50% по сиде,
//     >40 — остаётся;
//   * candidatesForTavern(npcs, roster, deadMercs) — через стабильный
//     API 000078 (Npc.hireCandidates): найм-данные, не нанят, не мёртв,
//     порядок каталога, ссылки;
//   * ДЕТЕРМИНИЗМ (КРИТИЧНО): «мирового» rng нет и не вводится. Сид
//     события = perlin.hash2(day, npcKey(npcId), константа_события),
//     бросок = perlin.mulberry32(seed)() — одно значение [0,1), без
//     глобального состояния. npcKey — детерминированное строка→uint32
//     (FNV-1a): perlin.hash2(day, СТРОКА) ВЫРОЖДАЕТСЯ — Math.imul(NaN)→0
//     (проверено: hash2(5,'merc_volk') === hash2(5,'merc_anna')), и без
//     npcKey ВСЕ наёмники имели бы ОДИН сид на день — отказы/уходы
//     синхронизированы.
//
// Схему сида тест фиксирует НЕЗАВИСИМОЙ копией (npcKey + myEventSeed) и
// ЗОЛОТЫМИ ПИНАМИ-литералами: реализация, сменившая схему/константы без
// обновления пинов, — красный тест (как надо).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const P = require('../src/perlin.js');
const { NPCS } = require('../src/npc-data.js');
const { SETTINGS } = require('../src/global-settings.js');
const { createCharacter, xpForNext } = require('../src/player.js');
// Бой (задача 000082): полный цикл «найм → бой → applyCombatXp» и
// рост статов makeAlly с новым уровнем.
const { createCombat, makeAlly } = require('../src/combat.js');
// КРАСНОЕ: модуль ещё не существует — require падает на загрузке файла.
const C = require('../src/companions.js');

// --- Схема сида: независимая копия + золотые пины ---

// FNV-1a: строка → uint32 (детерминированное целочисленное отображение
// npcId; hash2(day, строка) недопустим — см. шапку).
function npcKey(id) {
  let h = 0x811c9dc5;
  const s = String(id);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// Разные события — разные константы (hash2 принимает 3-й аргумент-seed).
const SEED_REFUSE = 0x72656675; // 'refu'
const SEED_QUIT = 0x71756974;   // 'quit'

function myEventSeed(day, id, kind) {
  return P.hash2(day, npcKey(id), kind === 'refuse' ? SEED_REFUSE : SEED_QUIT);
}
const myRoll = (day, id, kind) => P.mulberry32(myEventSeed(day, id, kind))();

// Золотой пин: дни ОТКАЗА (1..100) для id 'merc_test' при базовых 30%
// (Харизма 0, Артист 0 — чистая companion_refusal.base).
const REFUSE_DAYS_MERC_TEST = [
  2, 5, 6, 7, 8, 15, 16, 18, 26, 27, 33, 35, 42, 46, 49, 54, 57, 64, 65,
  66, 68, 75, 76, 80, 83, 85, 88, 91, 94, 97,
];
// Золотой пин: дни ОТКАЗА (1..50) для другого id 'merc_volk', 30%.
const REFUSE_DAYS_MERC_VOLK = [
  1, 3, 4, 5, 9, 18, 20, 23, 30, 31, 33, 38, 41, 42, 43, 44, 46, 47, 48, 49,
];
// Золотые пины значения eventSeed (схема (день, npcId, kind) → сид).
const SEED_PIN_REFUSE_VOLK_D1 = 84935682;    // (1, 'merc_volk', 'refuse')
const SEED_PIN_QUIT_ASHKA_D3 = 4240972129;   // (3, 'merc_ashka', 'quit')
// Пины 50%-ролла ухода для id 'merc_volk' (лояльность 45 → 25 после −20):
const QUIT_LEAVE_DAY = 3; // roll 0.48078… < 0.5 → уйдёт
const QUIT_STAY_DAY = 1;  // roll 0.91126… ≥ 0.5 → останется

// --- Хелперы ---

// Синтетический наёмник (запись каталога с найм-данными).
const merc = (id, price = 40, wage = 1) => (
  { id, постройки: [44], найм: { цена: price, жалованье: wage } });

// Запись отряда в ЗАФИКСИРОВАННОЙ форме (сейв 000085; 000143 — старая
// плоская форма: лист при десериализации/applyCombatXp — backfill).
const entry = (id, loyalty = 50, day = 1) => (
  ({ npcId: id, level: 1, xp: 0, loyalty, hiredDay: day }));

// 000143: канонический merc-лист (контракт мержа 000141):
// createSheet('merc', {primary, spells, npcId}) + явные уровни из
// найм.начальные_навыки (requires НЕ ревалидируются — решение А).
// level/xp — параметры (totalXp = xp — инвариант 000140).
const S = require('../src/sheet.js');
function mercSheet(npc, { level = 1, xp = 0 } = {}) {
  const s = S.createSheet('merc', {
    primary: npc.найм.базовые_характеристики,
    spells: npc.найм.spells,
    npcId: npc.id,
  });
  for (const [id, lv] of Object.entries(npc.найм.начальные_навыки || {})) {
    if (Number.isInteger(lv) && lv >= 1) s.secondary[id] = lv;
  }
  s.level = level;
  s.xp = xp;
  s.totalXp = xp;
  return s;
}

// RUNTIME-запись С листом (000143 §2.1): 6 ключей, зеркала level/xp.
function entryWithSheet(npc,
    { level = 1, xp = 0, loyalty = 50, day = 1 } = {}) {
  return {
    npcId: npc.id, sheet: mercSheet(npc, { level, xp }),
    level, xp, loyalty, hiredDay: day,
  };
}

// Персонаж: Харизма (основной), золото, Артист (вторичный).
const hero = (charisma, gold = 1000, artist = 0) => {
  const c = createCharacter();
  c.primary.charisma = charisma;
  c.gold = gold;
  if (artist) c.secondary.artist = artist;
  return c;
};

// Браузерная UMD-цепочка из index.html (ядро до npc.js) + companions.js.
const BROWSER_CHAIN = [
  'src/global-settings.js', 'src/perlin.js', 'src/mapseed.js',
  'src/skills-data.js', 'src/items-data.js', 'src/npc-data.js',
  'src/map.js', 'src/sheet.js', 'src/player.js', 'src/day.js',
  'src/items.js',
  'src/buildings.js', 'src/npc.js', 'src/companions.js',
];

// Ре-пин 000082: API вырос — applyCombatXp (применение доли боевого
// опыта к roster) и allyDataForEntry (мост roster → данные makeAlly
// для боя; 000087). Не «лишние» экспорты: контракт зафиксирован в
// memory/000082-companion-xp.md.
// Ре-пин 000085: serializeRoster/deserializeRoster (сериализация отряда
// для сейва; каталог — ПАРАМЕТР, новых require НЕТ) — контракт в
// memory/000085-save-party-efir.md (D2/D3).
// Ре-пин 000086 (ТЕХНИЧЕСКИЙ): + rosterSummary — чистая сводка отряда
// для панели «Отряд» (контракт memory/000086-squad-panel.md §4).
const API_KEYS = [
  'allyDataForEntry', 'applyCombatXp', 'canDismiss', 'canHire',
  'candidatesForTavern', 'createRoster', 'deserializeRoster', 'dismiss',
  'eventSeed', 'hire', 'loyaltyTick', 'payWages', 'rosterSummary',
  'serializeRoster', 'wagesTotal',
];

// --- Модуль и API ---

test('модуль: CommonJS-экспорт — весь API ядра отряда', () => {
  for (const k of API_KEYS) {
    assert.equal(typeof C[k], 'function', 'C.' + k);
  }
  assert.deepEqual(Object.keys(C).sort(), API_KEYS,
    'API-поверхность зафиксирована (000083/000087/000085 опираются на неё)');
  assert.equal(C.loyaltyTick, C.payWages,
    'loyaltyTick — экспорт-алиас payWages (000087 пишет «payWages / loyaltyTick»)');
});

test('createRoster — пустой отряд; повторные вызовы — разные массивы', () => {
  const r1 = C.createRoster();
  const r2 = C.createRoster();
  assert.ok(Array.isArray(r1), 'roster — массив');
  assert.equal(r1.length, 0, 'пустой отряд');
  assert.notEqual(r1, r2, 'каждый вызов — новый объект');
});

test('запись отряда: ровно {npcId, sheet, level, xp, loyalty, hiredDay} (000143)', () => {
  const r = C.createRoster();
  const c = hero(15, 100);
  const res = C.hire(r, merc('merc_volk'), c, 7);
  assert.equal(res.ok, true);
  // 000139 C3: форма — 6 ключей: sheet (канонический merc-лист) +
  // плоские зеркала level/xp (читатели — ui.js — не меняем).
  assert.deepEqual(Object.keys(res.entry).sort(),
    ['hiredDay', 'level', 'loyalty', 'npcId', 'sheet', 'xp'],
    'форма записи (000143): 6 ключей — sheet + зеркала level/xp');
  assert.equal(res.entry.npcId, 'merc_volk');
  assert.equal(res.entry.level, 1, 'hire создаёт level 1 (зеркало)');
  assert.equal(res.entry.xp, 0, 'hire создаёт xp 0 (000082 → Sheet.addXp)');
  assert.equal(res.entry.hiredDay, 7);
  assert.equal(res.entry.loyalty, res.loyalty);
  // Синтетический merc (без базовых_характеристики/начальных_навыки —
  // console.error ОДИН раз, деградация 000038/000053): лист — 1-ки.
  // В игре полнота каталога гарантирована 000141 (CS-1).
  const sh = res.entry.sheet;
  assert.equal(sh.kind, 'merc', 'sheet — kind merc (000143)');
  assert.equal(sh.npcId, 'merc_volk');
  assert.equal(sh.level, 1, 'зеркало: sheet.level');
  assert.equal(sh.xp, 0, 'зеркало: sheet.xp');
  assert.equal(sh.totalXp, 0);
  assert.equal(sh.points, 0);
  assert.deepEqual(sh.primary,
    { strength: 1, dexterity: 1, constitution: 1, intelligence: 1,
      wisdom: 1, charisma: 1 },
    'синтетический merc — primary 1 (деградация; каталог — CS-1)');
  assert.deepEqual(sh.secondary, {}, 'без начальных_навыки — пусто');
  assert.deepEqual(sh.spells, [], 'без spells — пусто');
  assert.deepEqual(sh.skillXp, {});
  assert.equal(r[0], res.entry, 'entry — та же ссылка, что в roster');
});

// --- Найм: детерминированные проверки (canHire) ---

test('найм: базовый случай canHire/hire — списывается цена, +лояльность', () => {
  const r = C.createRoster();
  const c = hero(15, 100);
  const n = merc('merc_volk', 40, 1);
  assert.equal(C.canHire(r, n, c).ok, true);
  const res = C.hire(r, n, c, 2); // день 2 — не день отказа по пину, Х 15 → 0%
  assert.equal(res.ok, true);
  assert.equal(c.gold, 60, 'цена контракта списана');
  assert.equal(r.length, 1);
  assert.equal(res.loyalty, 65, '50 + Харизма (1:1)');
});

test('найм: без найм-данных — нельзя (canHire {ok:false}, hire ничего не меняет)', () => {
  const r = C.createRoster();
  const c = hero(15, 100);
  const plain = { id: 'tavern_keeper', постройки: [44] }; // найм-поля нет
  const ch = C.canHire(r, plain, c);
  assert.equal(ch.ok, false);
  assert.equal(typeof ch.reason, 'string');
  assert.ok(ch.reason.length > 0, 'reason — человекочитаемая причина');
  const res = C.hire(r, plain, c, 1);
  assert.equal(res.ok, true === false, 'hire без найм-данных — не найм');
  assert.equal(r.length, 0);
  assert.equal(c.gold, 100, 'золото не тронуто');
});

test('найм: лимит отряда max_companions (3), граница 2, живое чтение', (t) => {
  const c = hero(15, 100);
  const n = merc('merc_x');
  // 3 в отряде (по умолчанию max_companions = 3) — нельзя
  const full = [entry('a'), entry('b'), entry('c')];
  assert.equal(C.canHire(full, n, c).ok, false);
  const res = C.hire(full, n, c, 1);
  assert.equal(res.ok, false);
  assert.equal(full.length, 3, 'roster не вырос');
  assert.equal(c.gold, 100, 'золото не тронуто');
  // ГРАНИЦА: 2 в отряде — можно
  assert.equal(C.canHire([entry('a'), entry('b')], n, c).ok, true);
  // Живое чтение настройки (паттерн combat.js: на вызове, не при загрузке)
  SETTINGS.max_companions = 1;
  t.after(() => { SETTINGS.max_companions = 3; });
  assert.equal(C.canHire([entry('a')], n, c).ok, false, 'максимум 1 — нельзя');
  assert.equal(C.canHire([], n, c).ok, true, 'пустой отряд — можно');
});

test('найм: не хватает золота — нельзя, золото не списывается', () => {
  const r = C.createRoster();
  const c = hero(15, 39);
  const n = merc('merc_volk', 40, 1);
  assert.equal(C.canHire(r, n, c).ok, false);
  const res = C.hire(r, n, c, 5);
  assert.equal(res.ok, false);
  assert.equal(res.refused, undefined, 'мало золота — НЕ «отказался» (refused)');
  assert.equal(c.gold, 39, 'золото не списывается');
  assert.equal(r.length, 0);
});

test('найм: граница — золото ровно цена контракта (инвариант gold ≥ 0)', () => {
  const r = C.createRoster();
  const c = hero(15, 40);
  const res = C.hire(r, merc('merc_volk', 40, 1), c, 2);
  assert.equal(res.ok, true);
  assert.equal(c.gold, 0, 'gold = цене → успех, gold = 0');
  assert.equal(r.length, 1);
});

test('найм: уже в отряде — нельзя', () => {
  const r = C.createRoster();
  const c = hero(15, 200);
  const n = merc('merc_volk', 40, 1);
  assert.equal(C.hire(r, n, c, 2).ok, true);
  const ch = C.canHire(r, n, c);
  assert.equal(ch.ok, false);
  assert.equal(typeof ch.reason, 'string');
  assert.ok(ch.reason.length > 0);
  const res = C.hire(r, n, c, 9);
  assert.equal(res.ok, false);
  assert.equal(r.length, 1, 'дубля нет');
  assert.equal(c.gold, 160, 'вторая цена не списана');
});

// --- Найм: отказ (30% − 2%×Харизма − 5%×Артист, min 0) ---

test('отказ: 0% на границах — Харизма 15 и (Харизма 6 + Артист 4, clamp)', () => {
  // 30% − 2%×15 = 0 → ВСЕГДА найм (дни 1..100, свежий персонаж/отряд)
  for (let day = 1; day <= 100; day++) {
    const r = C.createRoster();
    const c = hero(15, 1000);
    const res = C.hire(r, merc('merc_test'), c, day);
    assert.equal(res.ok, true, `Х 15, день ${day}`);
  }
  // 30% − 2%×6 − 5%×4 = −2% → clamp в 0 → тоже ВСЕГДА найм
  for (let day = 1; day <= 100; day++) {
    const r = C.createRoster();
    const c = hero(6, 1000, 4);
    const res = C.hire(r, merc('merc_test'), c, day);
    assert.equal(res.ok, true, `Х 6 + А 4, день ${day}`);
  }
});

test('отказ: база 30% — детерминизм по (день, npcId) + золотой пин', () => {
  // Харизма 0, Артист 0 → ровно base = 30% из companion_refusal.
  const refuseDays = [];
  for (let day = 1; day <= 100; day++) {
    const r = C.createRoster();
    const c = hero(0, 1000);
    const res = C.hire(r, merc('merc_test'), c, day);
    const expected = myRoll(day, 'merc_test', 'refuse') < 0.30;
    assert.equal(!!res.refused, expected,
      `день ${day}: отказ совпадает с независимым пересчётом по (день, npcId)`);
    if (res.refused) {
      refuseDays.push(day);
      assert.equal(c.gold, 1000, `день ${day}: при отказе золото НЕ списывается`);
      assert.equal(r.length, 0, `день ${day}: при отказе в отряд не попадает`);
    } else {
      assert.equal(res.ok, true, `день ${day}: исход — найм или отказ`);
    }
  }
  assert.deepEqual(refuseDays, REFUSE_DAYS_MERC_TEST,
    'золотой пин: массив дней-отказов зафиксирован');
});

test('отказ: золотой пин — другой npcId (merc_volk, дни 1..50)', () => {
  const days = [];
  for (let day = 1; day <= 50; day++) {
    const r = C.createRoster();
    const c = hero(0, 1000);
    const res = C.hire(r, merc('merc_volk'), c, day);
    assert.equal(!!res.refused, myRoll(day, 'merc_volk', 'refuse') < 0.30,
      'день ' + day);
    if (res.refused) days.push(day);
  }
  assert.deepEqual(days, REFUSE_DAYS_MERC_VOLK);
});

test('отказ: воспроизводимость по (день, npcId) — повторная попытка тот же исход', () => {
  const refuseDay = REFUSE_DAYS_MERC_TEST[0]; // 2
  const okDay = 1; // не в REFUSE_DAYS_MERC_TEST
  for (let i = 0; i < 2; i++) {
    const r1 = C.createRoster();
    const c1 = hero(0, 500);
    const res1 = C.hire(r1, merc('merc_test'), c1, refuseDay);
    assert.equal(res1.refused, true, `повтор ${i + 1}: отказ на дне ${refuseDay}`);
    assert.equal(res1.ok, undefined,
      'отказ — {refused:true}, а НЕ {ok:false} (000083 отличает их)');
    assert.equal(c1.gold, 500, 'при отказе золото не списывается');
    assert.equal(r1.length, 0);
    const r2 = C.createRoster();
    const c2 = hero(0, 500);
    const res2 = C.hire(r2, merc('merc_test'), c2, okDay);
    assert.equal(res2.ok, true, `повтор ${i + 1}: найм на дне ${okDay}`);
  }
});

test('отказ: живое чтение companion_refusal.base = 0 → отказа нет', (t) => {
  SETTINGS.companion_refusal.base = 0;
  t.after(() => { SETTINGS.companion_refusal.base = 0.30; });
  for (let day = 1; day <= 10; day++) {
    const r = C.createRoster();
    const c = hero(0, 1000);
    const res = C.hire(r, merc('merc_test'), c, day);
    assert.equal(res.ok, true, `день ${day}: base = 0 → всегда найм`);
  }
});

// --- Лояльность новичка ---

test('лояльность новичка: 50 + Харизма (1:1), cap 100', () => {
  const r3 = C.createRoster();
  assert.equal(C.hire(r3, merc('merc_a'), hero(3, 1000), 11).entry.loyalty, 53);
  // Пин (стадия реализации): Харизма 1 → шанс отказа 0.28; день 12
  // (roll 0.195) у merc_b — ОТКАЗ по сиду, поэтому пин дня — 14
  // (roll 0.797 ≥ 0.28 — найм).
  const r1 = C.createRoster();
  assert.equal(C.hire(r1, merc('merc_b'), hero(1, 1000), 14).entry.loyalty, 51);
  const r60 = C.createRoster();
  const res = C.hire(r60, merc('merc_c'), hero(60, 1000), 13);
  assert.equal(res.entry.loyalty, 100, 'cap 100 (50 + 60 → 100)');
  assert.equal(res.loyalty, 100);
});

// --- Сиды событий ---

test('eventSeed: золотые пины схемы (день, npcId, kind)', () => {
  assert.equal(C.eventSeed(1, 'merc_volk', 'refuse'), SEED_PIN_REFUSE_VOLK_D1);
  assert.equal(C.eventSeed(3, 'merc_ashka', 'quit'), SEED_PIN_QUIT_ASHKA_D3);
  // Разные события — разные константы → разные сиды.
  assert.notEqual(C.eventSeed(7, 'merc_volk', 'refuse'),
    C.eventSeed(7, 'merc_volk', 'quit'));
});

test('eventSeed: разные npcId → разные сиды/броски на одном дне (вырождение hash2 со строкой)', () => {
  // Контртест на «один сид на всех наёмников»: hash2(day, строка) даёт
  // NaN→0 во втором слоте, и все id имели бы ОДИН сид на день.
  const ids = NPCS.filter((n) => n.найм).map((n) => n.id).concat('merc_test');
  for (const kind of ['refuse', 'quit']) {
    const seeds = new Set(ids.map((id) => C.eventSeed(7, id, kind)));
    assert.equal(seeds.size, ids.length, `seeds уникальны (kind=${kind})`);
    const rolls = new Set(ids.map((id) => P.mulberry32(C.eventSeed(7, id, kind))()));
    assert.equal(rolls.size, ids.length, `броски уникальны (kind=${kind})`);
  }
  // Схему (FNV-1a + hash2 + константы) тест пересчитывает независимо.
  for (const id of ids) {
    assert.equal(C.eventSeed(7, id, 'refuse'), myEventSeed(7, id, 'refuse'));
    assert.equal(C.eventSeed(7, id, 'quit'), myEventSeed(7, id, 'quit'));
  }
});

// --- Жалованье и лояльность (payWages / loyaltyTick) ---

test('wagesTotal: Σ найм.жалованье по отряду (призраки — тихий skip)', () => {
  const npcs = [merc('merc_a', 40, 1), merc('merc_b', 50, 2)];
  assert.equal(C.wagesTotal([entry('merc_a'), entry('merc_b')], npcs), 3);
  assert.equal(C.wagesTotal([], npcs), 0, 'пустой отряд — 0');
  assert.equal(C.wagesTotal([entry('merc_a'), entry('ghost')], npcs), 1,
    'npcId, которого нет в каталоге — не падает, не считается');
});

test('payWages: оплачено — списано, всем +2 (cap 100), events wages_paid', () => {
  const roster = [entry('merc_a', 40), entry('merc_b', 99)];
  const npcs = [merc('merc_a', 40, 1), merc('merc_b', 50, 2)];
  const c = hero(1, 10);
  const res = C.payWages(roster, npcs, c, 3);
  assert.equal(res.paid, true);
  assert.equal(res.total, 3, '1 + 2');
  assert.equal(c.gold, 7);
  assert.equal(roster[0].loyalty, 42, '40 + 2');
  assert.equal(roster[1].loyalty, 100, '99 + 2 → cap 100');
  assert.deepEqual(res.events, [{ type: 'wages_paid', total: 3 }]);
});

test('payWages: граница — золото ровно жалованье (gold ≥ 0)', () => {
  const roster = [entry('merc_a', 40)];
  const npcs = [merc('merc_a', 40, 3)];
  const c = hero(1, 3);
  const res = C.payWages(roster, npcs, c, 2);
  assert.equal(res.paid, true, 'gold = жалованью → оплачено');
  assert.equal(c.gold, 0);
  assert.equal(roster[0].loyalty, 42);
});

test('payWages: пустой отряд — total 0, событий НЕТ (не «выплачено 0»)', () => {
  const npcs = [merc('merc_a', 40, 1)];
  const c = hero(1, 10);
  const res = C.payWages(C.createRoster(), npcs, c, 5);
  assert.equal(res.paid, true);
  assert.equal(res.total, 0);
  assert.deepEqual(res.events, [],
    'событий нет — 000087 не напишет «Жалованье выплачено» (раунд ревью 1)');
  assert.equal(c.gold, 10, 'золото не тронуто');
});

test('payWages: отряд из одних «призраков» — total 0, событий НЕТ', () => {
  const npcs = [merc('merc_a', 40, 1)];
  const roster = [entry('ghost1'), entry('ghost2')];
  const c = hero(1, 10);
  const res = C.payWages(roster, npcs, c, 5);
  assert.equal(res.paid, true);
  assert.equal(res.total, 0);
  assert.deepEqual(res.events, [],
    '«призраки» жалованье не дают — событий нет (раунд ревью 1)');
  assert.equal(c.gold, 10, 'золото не тронуто');
  assert.equal(roster.length, 2,
    'записи-призраки не отбрасываются (валидация — 000085)');
  assert.equal(roster[0].loyalty, 50, 'лояльность «призраков» не тронута');
});

test('payWages: не оплачено — золото не списано, −20 лояльности (floor 0), wages_unpaid', () => {
  const roster = [entry('merc_a', 30), entry('merc_b', 5)];
  const npcs = [merc('merc_a', 40, 1), merc('merc_b', 50, 2)];
  const c = hero(1, 0);
  const res = C.payWages(roster, npcs, c, 8);
  assert.equal(res.paid, false);
  assert.equal(c.gold, 0, 'золото НЕ списывается при неоплате');
  assert.equal(res.total, 3);
  assert.deepEqual(res.events[0], { type: 'wages_unpaid', total: 3 });
  // 30 → 10 и 5 → 0 (floor): обе ≤ 20 — уйдут (уход — ниже), roster пуст
  assert.equal(roster.length, 0);
});

test('уход: ≤20 — уйдёт верно (не зависит от сида)', () => {
  const npcs = [merc('merc_volk', 40, 1), merc('merc_ashka', 50, 1)];
  for (const day of [1, 2, 3, 5]) {
    const roster = [entry('merc_volk', 30, 1), entry('merc_ashka', 20, 2)];
    const c = hero(1, 0);
    const res = C.payWages(roster, npcs, c, day);
    assert.equal(res.paid, false);
    assert.equal(roster.length, 0, `день ${day}: 30→10 и 20→0 — оба ≤ 20`);
    for (const id of ['merc_volk', 'merc_ashka']) {
      assert.ok(res.events.some((e) => e.type === 'left' && e.npcId === id),
        `день ${day}: event left для ${id}`);
    }
  }
});

test('уход: 21…40 — 50% детерминированно по сиду (фиксированные день/npcId)', () => {
  const npcs = [merc('merc_volk', 40, 1)];
  // День, где roll(eventSeed(day, id, 'quit')) < 0.5 → уйдёт.
  {
    const roster = [entry('merc_volk', 45, 1)];
    const c = hero(1, 0);
    const res = C.payWages(roster, npcs, c, QUIT_LEAVE_DAY);
    assert.equal(res.paid, false);
    assert.equal(roster.length, 0, `день ${QUIT_LEAVE_DAY}: roll < 0.5 — ушёл`);
    assert.ok(res.events.some((e) => e.type === 'left' && e.npcId === 'merc_volk'));
  }
  // День, где roll ≥ 0.5 → останется (с −20).
  {
    const roster = [entry('merc_volk', 45, 1)];
    const c = hero(1, 0);
    const res = C.payWages(roster, npcs, c, QUIT_STAY_DAY);
    assert.equal(res.paid, false);
    assert.equal(roster.length, 1, `день ${QUIT_STAY_DAY}: roll ≥ 0.5 — остался`);
    assert.equal(roster[0].loyalty, 25, '45 − 20 = 25');
    assert.ok(!res.events.some((e) => e.type === 'left'));
  }
  // Граница полосы: 41 → 21 (нижний край 21…40) — тот же ролл.
  {
    const roster = [entry('merc_volk', 41, 1)];
    const c = hero(1, 0);
    C.payWages(roster, npcs, c, QUIT_STAY_DAY);
    assert.equal(roster.length, 1);
    assert.equal(roster[0].loyalty, 21, '41 − 20 = 21 — полоса 21…40');
  }
});

test('уход: >40 — остаётся (не зависит от сида)', () => {
  const npcs = [merc('merc_volk', 40, 1)];
  for (const day of [1, 3, 4, 9, 42]) {
    const roster = [entry('merc_volk', 70, 1)];
    const c = hero(1, 0);
    const res = C.payWages(roster, npcs, c, day);
    assert.equal(res.paid, false);
    assert.equal(roster.length, 1, `день ${day}: 70 → 50 > 40 — остался`);
    assert.equal(roster[0].loyalty, 50);
    assert.ok(!res.events.some((e) => e.type === 'left'));
  }
});

test('payWages: «призрак» (npcId нет в каталоге) — тихий skip, не падает', () => {
  const npcs = [merc('merc_volk', 40, 1)];
  const roster = [entry('ghost', 45), entry('merc_volk', 45)];
  const c = hero(1, 10);
  const res = C.payWages(roster, npcs, c, 3);
  assert.equal(res.paid, true);
  assert.equal(res.total, 1, 'жалованье — только реальная запись');
  assert.equal(c.gold, 9);
  assert.equal(roster.length, 2, 'запись-призрак не отбрасывается (валидация — 000085)');
  assert.equal(roster[0].loyalty, 45, 'призрак не получает +2');
  assert.equal(roster[1].loyalty, 47);
});

// --- Увольнение ---

test('увольнение: canDismiss/dismiss — без возврата денег; повторный найм', () => {
  const r = C.createRoster();
  const c = hero(15, 100);
  const n = merc('merc_volk', 40, 1);
  assert.equal(C.hire(r, n, c, 2).ok, true);
  assert.equal(c.gold, 60);
  // Не член отряда
  const ch0 = C.canDismiss(r, 'merc_other');
  assert.equal(ch0.ok, false);
  assert.equal(typeof ch0.reason, 'string');
  assert.ok(ch0.reason.length > 0);
  assert.equal(C.dismiss(r, 'merc_other').ok, false);
  assert.equal(r.length, 1, 'ничего не убрано');
  // Член отряда
  assert.equal(C.canDismiss(r, 'merc_volk').ok, true);
  assert.equal(C.dismiss(r, 'merc_volk').ok, true);
  assert.equal(r.length, 0);
  assert.equal(c.gold, 60, 'возврат денег НЕТ');
  // Повторный найм после увольнения (в тот же день — тот же (day,npcId)-сид)
  const res = C.hire(r, n, c, 2);
  assert.equal(res.ok, true, 'повторный найм после dismiss возможен');
  assert.equal(c.gold, 20);
  assert.equal(r.length, 1);
});

// --- Кандидаты в таверне ---

test('candidatesForTavern: правила каталога (найм, не нанят, не мёртв, порядок, ссылки)', () => {
  const hired = merc('merc_hired', 40, 1);
  const dead = merc('merc_dead', 50, 2);
  const plain = { id: 'tavern_keeper', постройки: [44] }; // найм-данных нет
  const npcs = [plain, hired, dead];
  // Каждое исключающее условие по отдельности (и все вместе)
  // Исправлено на стадии реализации: и merc_hired, и merc_dead созданы
  // merc() — с найм-данными, значит без исключений кандидатов ДВОЕ
  // (plain без найма — нет).
  assert.equal(C.candidatesForTavern(npcs, [], []).length, 2,
    'остались те, у кого есть найм-данные (plain без найма — нет)');
  assert.equal(C.candidatesForTavern(npcs, [entry('merc_hired')], []).length, 1,
    'нанят — нет (остался merc_dead)');
  assert.equal(C.candidatesForTavern(npcs, [], ['merc_dead']).length, 1,
    'мёртв (deadMercs) — нет');
  const res = C.candidatesForTavern(npcs, [entry('merc_hired')], ['merc_dead']);
  assert.equal(res.length, 0, 'все условия вместе — пусто');
  // Порядок = порядок каталога; возвращаются ССЫЛКИ на записи каталога
  const npcs3 = [merc('m2', 40, 1), merc('m1', 40, 1), plain, merc('m3', 40, 1)];
  const res3 = C.candidatesForTavern(npcs3, [], []);
  assert.deepEqual(res3.map((n) => n.id), ['m2', 'm1', 'm3'], 'порядок каталога');
  assert.equal(res3[0], npcs3[0], 'ссылка на запись каталога');
});

test('candidatesForTavern: реальный каталог — ровно 6 наёмников, все в таверне 44', () => {
  const res = C.candidatesForTavern(NPCS, [], []);
  assert.deepEqual(res.map((n) => n.id), [
    'merc_volk', 'merc_ashka', 'merc_baldor', 'merc_mira', 'merc_torga',
    'merc_rena',
  ], 'ровно 6 наёмников 000078, в порядке каталога');
  for (const n of res) {
    assert.ok(Array.isArray(n.постройки) && n.постройки.includes(44),
      n.id + ' в таверне 44');
  }
  // Нанятый исключается, остальные на месте
  const res2 = C.candidatesForTavern(NPCS, [entry('merc_volk')], []);
  assert.deepEqual(res2.map((n) => n.id), [
    'merc_ashka', 'merc_baldor', 'merc_mira', 'merc_torga', 'merc_rena',
  ]);
  // Призрак в roster/deadMercs — не падает
  const res3 = C.candidatesForTavern(NPCS, [entry('ghost')], ['ghost', 'merc_volk']);
  assert.deepEqual(res3.map((n) => n.id), [
    'merc_ashka', 'merc_baldor', 'merc_mira', 'merc_torga', 'merc_rena',
  ]);
});

// --- Детерминизм и инварианты ---

test('детерминизм: два независимых прогона сценария — идентичные состояния', () => {
  function run() {
    const roster = C.createRoster();
    const c = hero(0, 500); // Харизма 0 → отказы по базовым 30%
    const npcs = [merc('merc_volk', 40, 1), merc('merc_ashka', 50, 1)];
    const inv = () => {
      assert.ok(c.gold >= 0, 'инвариант: gold ≥ 0');
      assert.ok(roster.length <= SETTINGS.max_companions,
        'инвариант: roster ≤ max_companions');
      for (const e of roster) {
        assert.ok(e.loyalty >= 0 && e.loyalty <= 100,
          'инвариант: loyalty ∈ [0,100]');
      }
    };
    const snaps = [];
    C.hire(roster, npcs[0], c, 2); // пин: найм (день 2 не в REFUSE_DAYS_VOLK)
    C.hire(roster, npcs[1], c, 3); // пин: отказ (день 3 в списке)
    inv();
    snaps.push(JSON.stringify({ r: roster, g: c.gold }));
    c.gold = 0; // три смены дня без золота
    for (const day of [4, 5, 6]) {
      const res = C.payWages(roster, npcs, c, day);
      inv();
      snaps.push(JSON.stringify({ r: roster, g: c.gold, ev: res.events }));
    }
    return snaps;
  }
  const a = run();
  const b = run();
  assert.deepEqual(b, a, 'воспроизводимость: без «мирового» rng два прогона совпадают');
});

// --- Браузерная UMD-ветка ---

test('браузер: цепочка global-settings…npc.js + companions.js → Game.companions', () => {
  const sandbox = { console };
  sandbox.Game = {};
  vm.createContext(sandbox);
  for (const f of BROWSER_CHAIN) {
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, '..', f), 'utf8'),
      sandbox, { filename: f });
  }
  const G = sandbox.Game;
  const Co = G.companions;
  assert.ok(Co, 'Game.companions — СТРОЧНОЕ имя (000083/000087: G.companions)');
  for (const k of API_KEYS) {
    assert.equal(typeof Co[k], 'function', 'Game.companions.' + k);
  }
  // Поверхность API та же, что в node-ветке (JSON — разные realm).
  assert.deepEqual(Object.keys(Co).sort(), API_KEYS);
  // Та же схема сида, что в node-ветке (независимый пересчёт).
  assert.equal(Co.eventSeed(1, 'merc_volk', 'refuse'), SEED_PIN_REFUSE_VOLK_D1);
  assert.equal(Co.eventSeed(3, 'merc_ashka', 'quit'), SEED_PIN_QUIT_ASHKA_D3);
  // Работоспособность в браузерном realm (UMD-проводка через Game).
  const c = G.createCharacter();
  c.primary.charisma = 15;
  c.gold = 100;
  const n = { id: 'merc_volk', постройки: [44], найм: { цена: 40, жалованье: 1 } };
  const r = Co.createRoster();
  const res = Co.hire(r, n, c, 2);
  assert.equal(res.ok, true, 'hire работает в браузерном realm');
  assert.equal(c.gold, 60);
  assert.equal(r[0].loyalty, 65);
  const wr = Co.payWages(r, [n], c, 4);
  assert.equal(wr.paid, true);
  assert.equal(c.gold, 59);
  assert.equal(r[0].loyalty, 67);
  // Game не «потерян» (UMD-ловушка 000038: модуль ЗАМЕНЯЕТ объект Game,
  // но прежние свойства остаются).
  assert.equal(typeof G.hireCandidates, 'function');
  assert.ok(G.GlobalSettings);
});

test('браузер: без зависимостей — понятная ошибка (guard, паттерн day.js)', () => {
  const file = path.join(__dirname, '..', 'src', 'companions.js');
  assert.ok(fs.existsSync(file), 'src/companions.js должен существовать (000079)');
  const code = fs.readFileSync(file, 'utf8');
  const sandbox = {};
  vm.createContext(sandbox);
  assert.throws(
    () => vm.runInContext(code, sandbox, { filename: 'companions.js' }),
    /companions\.js/, 'guard: понятная ошибка с именем файла');
});

// --- Опыт и уровни спутников (задача 000082) ---
//
// КРАСНЫЕ тесты (TDD): падают, пока src/companions.js не экспортирует
// applyCombatXp / allyDataForEntry.
//
// Контракт (SPEC.md «Спутники» → «Опыт и уровни»,
// memory/000082-companion-xp.md):
//   * applyCombatXp(roster, gains) — ЧИСТАЯ функция (без rng/DOM):
//     gains = c.result.allyXp = [{id, xp}]; xp += доля, повышение
//     уровня ПОРОГОМ xpForNext (src/player.js): while-цикл — один бой
//     может дать НЕСКОЛЬКО уровней; остаток xp копится между боями.
//     «Призрак»/неизвестный id / xp ≤ 0 / нечисло / gains не массив —
//     ТИХИЙ skip (без исключений, applied не считает).
//     Возврат {applied, levelUps, events}, events — [{type:'level_up',
//     npcId, level}] (паттерн payWages.events: 000087 → hudFlash +
//     saveNow в критической точке «уровень спутника»).
//   * Форма записи roster НЕМЕНЯЕТСЯ: ровно {npcId, level, xp, loyalty,
//     hiredDay} (зафиксировано под сейв 000085) — новых полей НЕТ,
//     очков навыков НЕТ (v1).
//   * allyDataForEntry(entry, npc) — мост в бой (000087): данные
//     makeAlly {id: npc.id (— npcId), name, role, level: entry.level,
//     dmg, hp, armor?, skills, spells, kind:'merc'}; «призрак»
//     (npc нет / найм нет / npcId ≠ npc.id) → null. Рост статов
//     ИМПЛИЦИТНЫЙ: makeAlly пересчитывает maxHP/damage/armor из нового
//     уровня при следующем createCombat (формулы makeMob).
//   * Новая зависимость player.js (xpForNext): node — require, браузер —
//     G.xpForNext (ТОПОВЫЙ ключ: player.js разворачивает экспорты прямо
//     в Game, не в Game.Player); load-time guard (паттерн 000079).

test('000082: applyCombatXp — xp += доля; запись — 6 ключей (000139 C3)', () => {
  const roster = [Object.assign(entry('merc_volk'), { xp: 30 })];
  const res = C.applyCombatXp(roster, [{ id: 'merc_volk', xp: 10 }]);
  assert.equal(res.applied, 1, 'одна доля применена');
  assert.equal(res.levelUps, 0, '30 + 10 = 40 < 50 — повышения нет');
  assert.equal(roster[0].xp, 40, 'зеркало e.xp');
  assert.equal(roster[0].level, 1, 'зеркало e.level');
  // 000139 C3, осознанный пере-пин + backfill-тест на фиксированном
  // JSON старого формата (tests/companions-sheet.test.js CS-3): запись
  // 6 ключей — sheet (плоская запись материализуется на месте:
  // level/xp переносятся) + плоские зеркала level/xp.
  assert.deepEqual(Object.keys(roster[0]).sort(),
    ['hiredDay', 'level', 'loyalty', 'npcId', 'sheet', 'xp'],
    '000143: 6 ключей (sheet + зеркала); points — внутри sheet');
  assert.equal(roster[0].sheet.xp, 40, 'sheet.xp — 40');
  assert.equal(roster[0].sheet.level, 1, 'sheet.level — 1');
});

test('000082: applyCombatXp — повышение по порогу xpForNext (50/141/260)', () => {
  // Пороги — из src/player.js (пин: 50·ур^1.5).
  assert.equal(xpForNext(1), 50);
  assert.equal(xpForNext(2), 141);
  assert.equal(xpForNext(3), 260);
  const roster = [Object.assign(entry('merc_volk'), { xp: 30 })];
  const res = C.applyCombatXp(roster, [{ id: 'merc_volk', xp: 25 }]);
  assert.equal(res.applied, 1);
  assert.equal(res.levelUps, 1);
  assert.equal(roster[0].level, 2, '30 + 25 = 55 ≥ 50 → уровень 2');
  assert.equal(roster[0].xp, 5, '55 − 50 = 5 — остаток копится между боями');
});

test('000082: applyCombatXp — МНОЖЕСТВЕННОЕ повышение за бой (while, не if)', () => {
  // Сильный бой (мобы уровня 10+: xp ≈ 192, доля 0.5 → 96) даёт 1-2
  // апгрейда сразу — цикл обязателен.
  const roster = [Object.assign(entry('merc_volk'), { xp: 0 })];
  const res = C.applyCombatXp(roster, [{ id: 'merc_volk', xp: 191 }]);
  assert.equal(res.levelUps, 2, '191 = 50 + 141 → ровно два повышения');
  assert.equal(roster[0].level, 3);
  assert.equal(roster[0].xp, 0, '191 − 50 − 141 = 0');
  assert.deepEqual(res.events, [
    { type: 'level_up', npcId: 'merc_volk', level: 2 },
    { type: 'level_up', npcId: 'merc_volk', level: 3 },
  ], 'событие на каждое повышение (000087 → hudFlash)');
});

test('000082: applyCombatXp — несколько спутников: независимые доли', () => {
  const roster = [
    Object.assign(entry('merc_volk'), { xp: 10 }),
    Object.assign(entry('merc_ashka'), { xp: 0, loyalty: 33 }),
  ];
  const res = C.applyCombatXp(roster, [
    { id: 'merc_volk', xp: 45 },  // 10 + 45 = 55 → уровень 2, xp 5
    { id: 'merc_ashka', xp: 20 }, // 0 + 20 < 50 — без уровня
  ]);
  assert.equal(res.applied, 2, 'каждому — своя доля');
  assert.equal(res.levelUps, 1);
  assert.equal(roster[0].level, 2);
  assert.equal(roster[0].xp, 5);
  assert.equal(roster[1].level, 1);
  assert.equal(roster[1].xp, 20);
  assert.equal(roster[1].loyalty, 33, 'лояльность опытом не трогается');
});

test('000082: applyCombatXp — «призрак»/неизвестный id — тихий skip (нет исключения, applied не считает)', () => {
  const roster = [entry('merc_volk')];
  const res = C.applyCombatXp(roster, [
    { id: 'ghost', xp: 10 },       // нет такой записи в roster
    { id: 'merc_volk', xp: 10 },   // своя
    { id: 'merc_ashka', xp: 5 },   // нет в roster (в отряде не было)
  ]);
  assert.equal(res.applied, 1);
  assert.equal(res.levelUps, 0);
  assert.equal(roster.length, 1, 'roster не тронут (ничего не добавлено/убрано)');
  assert.equal(roster[0].xp, 10);
});

test('000082: applyCombatXp — gains []/null/мусор → {applied:0, levelUps:0}, roster без изменений', () => {
  for (const gains of [[], null, 'мусор', { id: 'x', xp: 1 }]) {
    const roster = [entry('merc_volk')];
    const res = C.applyCombatXp(roster, gains);
    assert.equal(res.applied, 0, 'gains=' + JSON.stringify(gains));
    assert.equal(res.levelUps, 0);
    assert.deepEqual(res.events, [], 'без применений — событий нет');
    assert.equal(roster[0].xp, 0, 'roster без изменений');
  }
  // xp ≤ 0 — тоже тихий skip (доля 0: share = 0 → xp 0).
  const roster = [entry('merc_volk')];
  const res = C.applyCombatXp(roster,
    [{ id: 'merc_volk', xp: 0 }, { id: 'merc_volk', xp: -5 }]);
  assert.equal(res.applied, 0);
  assert.equal(roster[0].xp, 0);
  // xp нечисло (мусор после сейва/UI) — тихий skip, без исключений.
  const roster2 = [entry('merc_volk')];
  const res2 = C.applyCombatXp(roster2,
    [{ id: 'merc_volk', xp: 'мусор' }, { id: 'merc_volk', xp: NaN }]);
  assert.equal(res2.applied, 0);
  assert.equal(roster2[0].xp, 0);
});

test('000082: applyCombatXp — возврат {applied, levelUps, events} (паттерн payWages)', () => {
  const roster = [Object.assign(entry('merc_volk'), { xp: 30 })];
  const res = C.applyCombatXp(roster, [{ id: 'merc_volk', xp: 25 }]);
  assert.equal(res.applied, 1);
  assert.equal(res.levelUps, 1);
  assert.ok(Array.isArray(res.events), 'events — массив (000087 превращает в hudFlash)');
  assert.deepEqual(res.events, [
    { type: 'level_up', npcId: 'merc_volk', level: 2 },
  ], 'ровно {type, npcId, level} — новое значение уровня');
});

test('000082: детерминизм — два прогона «найм → бой → applyCombatXp» → идентичные roster', () => {
  function run() {
    const roster = C.createRoster();
    const hero = createCharacter();
    hero.primary.charisma = 15; // 0% отказов (30% − 2%×15)
    hero.gold = 1000;
    hero.hp = 9999;             // не умирает в бою
    const npcs = NPCS.filter(
      (n) => n.id === 'merc_volk' || n.id === 'merc_ashka');
    assert.equal(C.hire(roster, npcs[0], hero, 2).ok, true);
    assert.equal(C.hire(roster, npcs[1], hero, 3).ok, true);
    // Мост в бой: данные makeAlly из записей отряда (id — npcId).
    const allies = roster.map((e) => C.allyDataForEntry(
      e, npcs.find((n) => n.id === e.npcId))).filter(Boolean);
    const c = createCombat({
      player: hero, allies, mobs: ['wolf'], mobLevel: 2, seed: 5,
    });
    c.obstacles.clear();
    const w = c.units.find((u) => u.id === 'm0');
    w.x = 3; w.y = 2;
    c.units.filter((u) => u.side === 'ally')
      .forEach((u, i) => { u.x = i; u.y = 6; });
    c.px = 3; c.py = 3; // игрок вплотную к волку
    let n = 0;
    while (!c.result && n++ < 60) {
      c.ps.attack = 99;
      c.attack(w.id);
      c.endTurn();
    }
    assert.equal(c.result.outcome, 'victory');
    const res = C.applyCombatXp(roster, c.result.allyXp);
    return {
      roster: roster.map((e) => Object.assign({}, e)),
      events: res.events,
      allyXp: c.result.allyXp,
    };
  }
  const a = run();
  const b = run();
  assert.deepEqual(b, a, 'воспроизводимость: в цикле нет «мирового» rng');
  // Полный цикл: каждому по round(16×0.5) = 8, id — npcId (маппинг).
  assert.deepEqual(a.allyXp, [
    { id: 'merc_volk', xp: 8 },
    { id: 'merc_ashka', xp: 8 },
  ]);
  assert.equal(a.roster[0].xp, 8, 'Вольк: xp в записи');
  assert.equal(a.roster[1].xp, 8, 'Ашка: xp в записи');
  assert.equal(a.roster[0].npcId, 'merc_volk');
  assert.equal(a.events.length, 0, '8 < 50 — повышений уровня пока нет');
});

test('000082: allyDataForEntry — данные makeAlly из записи + каталога найма (id — npcId; 000143 — статы из sheet)', () => {
  const volk = NPCS.find((n) => n.id === 'merc_volk');
  // 000143: запись С листом; боевые статы — из sheet (derived +
  // merc-модификатор): maxHP/damage — явные (overrides), каталожные
  // кнопки dmg/hp — внутри модификатора, в data не уходят.
  const e = entryWithSheet(volk, { level: 5 });
  const d = C.allyDataForEntry(e, volk);
  assert.ok(d, 'данные есть');
  assert.equal(d.id, 'merc_volk',
    'id — npcId (000087 маппит c.result.allyXp → roster по нему)');
  assert.equal(d.name, 'Вольк');
  assert.equal(d.role, 'melee', 'роль — из каталога найма');
  assert.equal(d.level, 5, 'уровень — из ЗАПИСИ roster (зеркало sheet.level)');
  // con 2: base maxHP 20+2·5 = 30; ×hp 1.1 ×melee 1.0 → 33.
  assert.equal(d.maxHP, 33,
    'maxHP — из sheet: round(30·1.1·1.0) (000143)');
  // round((2+0.7·5)·dmg 1.2·(1+swordsman 2·0.05)) = round(7.26) = 7.
  assert.equal(d.damage, 7, 'damage — из sheet: уровень + каталог + навыки');
  assert.equal(d.armor, undefined,
    'у Волька найм.armor нет (только у Бальдора — 3)');
  assert.deepEqual(d.skills, ['swordsman'],
    'skills — id-список из sheet.secondary');
  assert.deepEqual(d.spells, []);
  assert.equal(d.kind, 'merc', 'маркер наёмника (фильтр доли, 000082)');
  // Бальдор — armor 3 в каталоге (shield: roleMult 1.8 в maxHP):
  const baldor = NPCS.find((n) => n.id === 'merc_baldor');
  const db = C.allyDataForEntry(entryWithSheet(baldor, { level: 1 }), baldor);
  assert.equal(db.maxHP, 95,
    'maxHP — из sheet: round(35·1.5·1.8) = 94.5 → 95');
  assert.equal(db.damage, 3,
    'damage — round((2+0.7·1)·1.1·(1+heavy 2·0.05)) = round(3.267)');
  assert.equal(db.armor, 3, 'найм.armor передаётся (щит)');
  assert.equal(db.role, 'shield');
});

test('000082: allyDataForEntry — «призрак» (нет каталога/найм-данных/npcId ≠ id/без sheet) → null', () => {
  const volk = NPCS.find((n) => n.id === 'merc_volk');
  assert.equal(C.allyDataForEntry(entry('ghost'), volk), null,
    'entry.npcId ≠ npc.id — null (несогласованное состояние)');
  assert.equal(C.allyDataForEntry(entry('merc_volk'), null), null,
    'записи каталога нет — null');
  assert.equal(
    C.allyDataForEntry(entry('merc_volk'),
      { id: 'merc_volk', постройки: [44] }),
    null, 'найм-данных нет — null (тихий skip)');
  // 000143: запись БЕЗ sheet (инвариант-нарушение, в игре недостижимо —
  // deserializeRoster/hire всегда дают sheet) — статов нет → тихий skip.
  assert.equal(C.allyDataForEntry(entry('merc_volk'), volk), null,
    'без sheet — null (000143: боевые статы только из листа)');
});

test('000082: рост статов — makeAlly с новым уровнем (000143: maxHP из sheet, damage — уровень + каталог, мораль 1)', () => {
  const volk = NPCS.find((n) => n.id === 'merc_volk');
  // 000143: maxHP — из sheet: round((20+con·5)·hp·роль) — уровня в
  // формуле НЕТ (maxHP плоский до 000145; рост — через очки);
  // damage — makeAlly-формула (2+0.7·ур) + каталожный dmg 1.2 +
  // swordsman 2·0.05, мораль 1; armor = найм.armor + floor(ур/10) (как
  // было).
  const at = (level) => makeAlly(
    C.allyDataForEntry(entryWithSheet(volk, { level }), volk), 0);
  const u1 = at(1), u5 = at(5), u10 = at(10);
  assert.deepEqual([u1.maxHP, u1.damage, u1.armor], [33, 3, 0], 'уровень 1');
  assert.deepEqual([u5.maxHP, u5.damage, u5.armor], [33, 7, 0], 'уровень 5');
  assert.deepEqual([u10.maxHP, u10.damage, u10.armor], [33, 11, 1],
    'уровень 10: maxHP плоский (sheet), armor 0 + floor(10/10) = 1');
});

test('000082 браузер: без player.js — понятная ошибка (новый guard, паттерн 000079)', () => {
  const sandbox = { console, Game: {} };
  vm.createContext(sandbox);
  // Реальные global-settings/perlin (guards 000079 пройдены);
  // npc.js без player.js не загрузится (его собственный guard) —
  // стабильный API 000078 заштембруем: под тестом guard companions.js.
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, '..', 'src', 'global-settings.js'), 'utf8'),
    sandbox, { filename: 'global-settings.js' });
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, '..', 'src', 'perlin.js'), 'utf8'),
    sandbox, { filename: 'perlin.js' });
  sandbox.Game.hireCandidates = () => [];
  sandbox.Game.skillLevel = () => 0;
  assert.throws(
    () => vm.runInContext(
      fs.readFileSync(path.join(__dirname, '..', 'src', 'companions.js'), 'utf8'),
      sandbox, { filename: 'companions.js' }),
    // Кросс-realm: ошибка СОЗДАНА в VM — `e instanceof Error` (хост)
    // ложна (прототип — Error песочницы). Проверяем свойства.
    (e) => e && typeof e.message === 'string'
      && /companions\.js/.test(e.message)
      && /player\.js/.test(e.message),
    'guard: «companions.js: … player.js …» (имена обоих файлов)');
});

test('000082 браузер: applyCombatXp работает в браузерном realm (G.xpForNext — топовый ключ)', () => {
  const sandbox = { console };
  sandbox.Game = {};
  vm.createContext(sandbox);
  for (const f of BROWSER_CHAIN) {
    // player.js — ДО companions.js (BROWSER_CHAIN 000079 уже так).
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, '..', f), 'utf8'),
      sandbox, { filename: f });
  }
  const G = sandbox.Game;
  const Co = G.companions;
  // player.js разворачивает экспорты прямо в Game (НЕ Game.Player):
  assert.equal(typeof G.xpForNext, 'function', 'G.xpForNext — топовый ключ');
  // 000143: запись С листом (браузерный realm: Game.Sheet — из цепочки
  // BROWSER_CHAIN): xp 30 → sheet.xp 30/totalXp 30 + плоские зеркала.
  const sh = G.Sheet.createSheet('merc', { npcId: 'merc_volk' });
  sh.level = 1;
  sh.xp = 30;
  sh.totalXp = 30;
  const roster = [
    { npcId: 'merc_volk', sheet: sh, level: 1, xp: 30, loyalty: 50,
      hiredDay: 1 },
  ];
  const res = Co.applyCombatXp(roster, [{ id: 'merc_volk', xp: 25 }]);
  assert.equal(res.applied, 1);
  assert.equal(res.levelUps, 1);
  assert.equal(roster[0].level, 2, 'level-up в браузерном realm (зеркало)');
  assert.equal(roster[0].xp, 5, 'зеркало e.xp');
  assert.equal(roster[0].sheet.xp, 5, 'sheet.xp — 5 (30+25−50)');
  assert.equal(roster[0].sheet.level, 2, 'sheet.level — 2');
  // События СОЗДАНЫ в VM-realm: deepStrictEqual отклоняет их
  // (прототип — Object.prototype песочницы, не хоста — кросс-realm
  // семантика, проверено). JSON-пин (паттерн day.test.js) фиксирует
  // контент И порядок ключей {type, npcId, level}.
  assert.equal(JSON.stringify(res.events),
    JSON.stringify([{ type: 'level_up', npcId: 'merc_volk', level: 2 }]));
});

// --- Сводка отряда (задача 000086, панель «Отряд») ---
//
// КРАСНЫЕ тесты (TDD): падают, пока src/companions.js не экспортирует
// rosterSummary.
//
// Контракт (memory/000086-squad-panel.md §4):
//   rosterSummary(roster, npcs, efirData) →
//     { members: [{npcId, name, level, loyalty, wage}],
//       empty: boolean,
//       efir: null | { level, maxHP } }
//   * members — порядок = порядок roster; name — каталог (npc.имя),
//     «призрак» (id нет в каталоге) — ГОЛЫЙ npcId (тихий);
//     level/loyalty — из записи (кламп: не finite → 1/0);
//     wage — найм.жалованье из каталога (НЕ из записи); «призрак»
//     или NPC без найм-данных → null (НЕ 0 — «жалованье 0 з/день»
//     не строка);
//   * empty — !Array.isArray(roster) || roster.length === 0: Эфир НЕ
//     делает отряд непустым («Отряд пуст…» — про спутников);
//   * efir — ПАРАМЕТР (не чтение G.efir внутри: UMD-ловушка 000038 —
//     снапшот при загрузке companions.js не содержит efir.js;
//     вызывающий в ui.js вычисляет лениво через G.efir.efirStats):
//     оба поля finite (level ≥1, maxHP ≥0) → как переданы;
//     null/мусор → null (как отсутствует). КЛЮЧЕЙ loyalty/wage НЕТ
//     (000081: Эфир — не наёмник);
//   * ЧИСТОТА: roster НЕ мутируется (форма записи заморожена под
//     сейв 000085), без DOM/rng/console — node-тест без efir.js.

test('000086 S1: rosterSummary — экспорт в API (функция, в пине API)', () => {
  assert.equal(typeof C.rosterSummary, 'function',
    'C.rosterSummary — функция (сводка отряда, 000086)');
  assert.ok(API_KEYS.includes('rosterSummary'),
    'пин API (API_KEYS) включает rosterSummary');
});

test('000086 S2: rosterSummary — строки: имя/уровень/лояльность/жалованье, порядок roster; roster не мутирован', () => {
  const roster = [
    { npcId: 'merc_ashka', level: 3, xp: 100, loyalty: 77, hiredDay: 2 },
    { npcId: 'merc_volk', level: 1, xp: 0, loyalty: 51, hiredDay: 1 },
  ];
  const before = JSON.stringify(roster);
  const s = C.rosterSummary(roster, NPCS, null);
  assert.equal(JSON.stringify(roster), before,
    'roster НЕ мутирован (чистая функция)');
  assert.equal(s.empty, false, 'отряд непустой');
  assert.equal(s.members.length, 2, 'строка на запись');
  assert.deepEqual(s.members.map((m) => m.npcId),
    ['merc_ashka', 'merc_volk'], 'порядок = порядок roster');
  const a = s.members[0];
  assert.equal(a.name, 'Ашка', 'имя — из каталога');
  assert.equal(a.level, 3, 'уровень — из записи');
  assert.equal(a.loyalty, 77, 'лояльность — из записи');
  assert.equal(a.wage, 1, 'жалованье — найм.жалованье каталога');
  const v = s.members[1];
  assert.equal(v.name, 'Вольк', 'имя — из каталога');
  assert.equal(v.level, 1);
  assert.equal(v.loyalty, 51);
  assert.equal(v.wage, 1);
});

test('000086 S3: rosterSummary — «призрак» (npcId нет в каталоге) — голый id, wage = null (не 0), без броска; NPC без найм-данных — имя из каталога, wage = null', () => {
  const roster = [
    { npcId: 'merc_ghost', level: 2, xp: 5, loyalty: 42, hiredDay: 1 },
    { npcId: 'tavern_keeper', level: 1, xp: 0, loyalty: 50, hiredDay: 1 },
  ];
  const s = C.rosterSummary(roster, NPCS, null);
  assert.equal(s.members.length, 2, 'обе записи дают строки (не отбрасываются)');
  const g = s.members[0];
  assert.equal(g.npcId, 'merc_ghost');
  assert.equal(g.name, 'merc_ghost',
    '«призрак» — ГОЛЫЙ npcId (тихий, паттерн 000029/000083)');
  assert.equal(g.level, 2);
  assert.equal(g.loyalty, 42);
  assert.equal(g.wage, null,
    'каталога нет — wage = null (не 0: не «жалованье 0 з/день»)');
  const t = s.members[1];
  assert.equal(t.name, 'Берта',
    'NPC без найм-данных — имя всё равно из каталога');
  assert.equal(t.wage, null, 'нет найм.жалованье — wage = null (не 0)');
});

test('000086 S4: rosterSummary — строка Эфира: {level, maxHP} из ПАРАМЕТРА (без ключей loyalty/wage); null/мусор efirData → null', () => {
  const s = C.rosterSummary(
    [{ npcId: 'merc_volk', level: 1, xp: 0, loyalty: 51, hiredDay: 1 }],
    NPCS, { level: 1, maxHP: 16 });
  assert.ok(s.efir, 'строка Эфира — если efirData передан');
  assert.equal(s.efir.level, 1, 'уровень — как передан');
  assert.equal(s.efir.maxHP, 16,
    'maxHP — как передан (efirStats(1).maxHP = 16)');
  assert.deepEqual(Object.keys(s.efir).sort(), ['level', 'maxHP'],
    'в объекте Эфира КЛЮЧЕЙ loyalty/wage НЕТ (000081: не наёмник)');
  // Другой уровень — как передан (таблицу функция НЕ пересчитывает:
  // вызывающий вычисляет через G.efir.efirStats).
  const s3 = C.rosterSummary([], NPCS, { level: 3, maxHP: 18 });
  assert.equal(s3.efir.level, 3);
  assert.equal(s3.efir.maxHP, 18, 'efirStats(3).maxHP = 18');
  // null — Эфира нет.
  assert.equal(C.rosterSummary([], NPCS, null).efir, null,
    'efirData null → efir: null');
  // Мусор — как отсутствует (без броска).
  for (const bad of [
    { level: 0, maxHP: 16 },
    { level: 1, maxHP: NaN },
    { level: 'мусор', maxHP: 16 },
    'мусор',
    {},
  ]) {
    assert.equal(C.rosterSummary([], NPCS, bad).efir, null,
      'мусорный efirData → null (JSON: ' + JSON.stringify(bad) + ')');
  }
});

test('000086 S5: rosterSummary — пустой отряд: members [], empty: true; строка Эфира независимо (empty не зависит от Эфира); roster не массив — empty', () => {
  const s = C.rosterSummary([], NPCS, { level: 1, maxHP: 16 });
  assert.deepEqual(s.members, [], 'строк нет');
  assert.equal(s.empty, true, 'empty — отряд пуст');
  assert.ok(s.efir, 'строка Эфира — независимо от состава отряда');
  assert.equal(s.efir.maxHP, 16);
  // Эфира нет — всё равно пуст.
  const s0 = C.rosterSummary([], NPCS, null);
  assert.equal(s0.empty, true);
  assert.equal(s0.efir, null);
  // Не массив — тихий empty (без броска).
  const sN = C.rosterSummary(null, NPCS, null);
  assert.equal(sN.empty, true, 'roster null — empty');
  assert.deepEqual(sN.members, []);
});

// =====================================================================
// Задача 000087 — Отряд в игровом цикле: смена дня, гибель, повторный
// найм. Контракт: memory/000087-companion-cycle.md (D1/D3/D7/D9/D10/D12),
// шпаргалка — memory/000087-party-game-loop.md §4/§5.
//
// ЭТОТ блок — контракт-пины ТЗ-золотых (node, direct require):
// ЗЕЛЁНЫЕ уже в red-фазе — ядро 000079 (payWages/loyalty/candidates)
// и 000082 (applyCombatXp) УЖЕ в master. Красные (точки подвешивания
// в main.js/combat-ui.js) — tests/companions-cycle.test.js (S1–S3,
// V1–V5). ТЗ: tasks/pending/000087.md.
// =====================================================================

// Каталог найма — РЕАЛЬНЫЕ записи (числа — не хардкод, паттерн 000053).
const NPC_VOLK = NPCS.find((n) => n.id === 'merc_volk');
assert.ok(NPC_VOLK && NPC_VOLK.найм, 'каталог: merc_volk с найм-данными');

// Золотые пины 50%-ролла ухода G1: (5, 'merc_volk', 'quit').
// Схема (FNV-1a + hash2 + mulberry32) пересчитана независимо ниже.
const QUIT_SEED_VOLK_D5 = 726194406;
const QUIT_ROLL_VOLK_D5 = 0.7840951501857489;

test('000087 G1: ТЗ-золотой — найм день 2 (gold 40→0, лояльность 65); неоплач. дни 4/5/6 — уход в день 6', (t) => {
  // Отказ 0%: base 0 (live-чтение payWages/hire) И Харизма 15
  // (30% − 2%×15 = 0%) — двойной фикс по контракту D12.
  SETTINGS.companion_refusal.base = 0;
  t.after(() => { SETTINGS.companion_refusal.base = 0.30; });
  function run() {
    const c = hero(15, 40); // Харизма 15, gold = цена Волька (40)
    const r = C.createRoster();
    const res = C.hire(r, NPC_VOLK, c, 2);
    assert.equal(res.ok, true, 'день 2: найм (отказ 0%)');
    assert.equal(c.gold, 0, 'найм: gold 40 − 40 = 0');
    assert.equal(r.length, 1);
    // 000143 (000139 C3): запись 6 ключей — sheet (канонический, из
    // каталога найма) + плоские зеркала level/xp.
    assert.deepEqual(r[0], {
      npcId: 'merc_volk', level: 1, xp: 0, loyalty: 65, hiredDay: 2,
      sheet: mercSheet(NPC_VOLK),
    }, 'запись: лояльность 50 + Харизма 15 = 65, hiredDay = день найма; 000143 — sheet + зеркала');
    // Неоплаченные дни 4/5/6 (gold 0 < жалованье 1).
    const d4 = C.payWages(r, NPCS, c, 4);
    assert.equal(d4.paid, false, 'день 4: не хватает');
    assert.deepEqual(d4.events, [{ type: 'wages_unpaid', total: 1 }],
      'день 4: событие wages_unpaid (ухода ещё нет — 45 > 40, ролла нет)');
    assert.equal(r[0].loyalty, 45, 'день 4: 65 − 20 = 45 (выше quit_high — остаётся)');
    const d5 = C.payWages(r, NPCS, c, 5);
    assert.equal(d5.paid, false, 'день 5: не хватает');
    // ЗОЛОТОЙ ПИН РОЛЛА: полоса 21…40 — roll по сиду (5, 'merc_volk',
    // 'quit'). Независимый пересчёт = зафиксированные литералы.
    assert.equal(C.eventSeed(5, 'merc_volk', 'quit'), QUIT_SEED_VOLK_D5,
      'eventSeed(5, ' + QUIT_SEED_VOLK_D5 + ')');
    assert.equal(myRoll(5, 'merc_volk', 'quit'), QUIT_ROLL_VOLK_D5,
      'независимый roll = ' + QUIT_ROLL_VOLK_D5);
    assert.ok(QUIT_ROLL_VOLK_D5 >= 0.5, 'roll ≥ 0.5 — остаётся');
    assert.deepEqual(d5.events, [{ type: 'wages_unpaid', total: 1 }],
      'день 5: события — только wages_unpaid (ухода нет: roll ≥ 0.5)');
    assert.equal(r[0].loyalty, 25, 'день 5: 45 − 20 = 25');
    const d6 = C.payWages(r, NPCS, c, 6);
    assert.equal(d6.paid, false, 'день 6: не хватает');
    assert.deepEqual(d6.events, [
      { type: 'wages_unpaid', total: 1 },
      { type: 'left', npcId: 'merc_volk' },
    ], 'день 6: wages_unpaid + left (порядок: сначала жалованье)');
    assert.equal(r.length, 0, 'день 6: лояльность 5 ≤ 20 — ушёл ВЕРНО (сплис внутри payWages)');
    assert.equal(c.gold, 0, 'gold не тронут (при неоплате НЕ списывается)');
    return { gold: c.gold, roster: C.serializeRoster(r) };
  }
  // Два независимых прогона — deepEqual (детерминизм, паттерн L602).
  const a = run();
  const b = run();
  assert.deepEqual(b, a, 'повторный прогон — тот же исход');
});

test('000087 G2: после ГИБЕЛИ — не в candidatesForTavern (окончательно), остальные на месте', () => {
  // Фильтры НЕЗАВИСИМЫ: нанят (roster) + мёртв (deadMercs) — оба
  // отфильтрованы; остальной каталог — в порядке каталога.
  const cands = C.candidatesForTavern(NPCS, [entry('merc_baldor')],
    ['merc_volk']);
  assert.deepEqual(cands.map((n) => n.id),
    ['merc_ashka', 'merc_mira', 'merc_torga', 'merc_rena'],
    'мёртвый volk и нанятый baldor отфильтрованы, порядок каталога');
});

test('000087 G3: после УВОЛЬНЕНИЯ — повторный найм тот же день (кандидат вернулся, новая запись)', (t) => {
  // День на фильтр НЕ влияет (сид найма — hash2(day, npcId) — влияет
  // только на ОТКАЗ; base 0 → отказа нет).
  SETTINGS.companion_refusal.base = 0;
  t.after(() => { SETTINGS.companion_refusal.base = 0.30; });
  const c = hero(0, 100);
  const r = C.createRoster();
  assert.equal(C.hire(r, NPC_VOLK, c, 2).ok, true, 'найм день 2');
  assert.equal(c.gold, 60);
  assert.equal(C.dismiss(r, 'merc_volk').ok, true, 'увольнение');
  assert.equal(r.length, 0);
  assert.equal(c.gold, 60, 'увольнение — возврата денег нет');
  const cands = C.candidatesForTavern(NPCS, r, []);
  assert.ok(cands.some((n) => n.id === 'merc_volk'),
    'volk СНОВА кандидат — в тот же день (2)');
  assert.equal(C.hire(r, NPC_VOLK, c, 2).ok, true,
    'повторный найм тот же день (тот же сид — base 0 → 0% отказа)');
  assert.equal(c.gold, 20, 'цена контракта списана повторно');
  // 000143: НОВАЯ запись — 6 ключей (sheet + зеркала).
  assert.deepEqual(r[0], {
    npcId: 'merc_volk', level: 1, xp: 0, loyalty: 50, hiredDay: 2,
    sheet: mercSheet(NPC_VOLK),
  }, 'НОВАЯ запись: hiredDay = день, лояльность = старт 50 + Харизма 0; 000143 — sheet + зеркала');
});

test('000087 W3: баланс — ЛЮБОЕ трио реального каталога: Σ жалованье ≤ 10 з/день (20% от ~50)', () => {
  const mercs = NPCS.filter((n) => n.найм
    && typeof n.найм.жалованье === 'number');
  assert.equal(mercs.length, 6, 'каталог найма — 6 наёмников');
  const wages = mercs.map((n) => n.найм.жалованье);
  let max = 0;
  for (let i = 0; i < wages.length; i++) {
    for (let j = i + 1; j < wages.length; j++) {
      for (let k = j + 1; k < wages.length; k++) {
        const sum = wages[i] + wages[j] + wages[k];
        assert.ok(sum <= 10,
          'трио ' + [i, j, k].map((x) => mercs[x].id).join('+')
          + ' = ' + sum + ' ≤ 10');
        max = Math.max(max, sum);
      }
    }
  }
  // Фактический максимум каталога (torga+rena+baldor/mira) — 8
  // (16% от ~50) — порог W3 проходит с запасом (D10: каталог не правится).
  assert.equal(max, 8, 'максимальное трио = 8');
});

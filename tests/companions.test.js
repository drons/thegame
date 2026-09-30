// Спутники: ядро отряда (задача 000079, родитель 000065) — найм, отказ,
// лояльность, жалованье, увольнение, уход.
//
// КРАСНЫЕ тесты (TDD): падают, пока src/companions.js не реализован.
//
// Контракт (SPEC.md «Спутники», заключение аналитика):
//   * ЧИСТЫЙ UMD-модуль без DOM/game-state (паттерн src/npc.js): node —
//     require(), браузер — Game.companions (СТРОЧНОЕ имя — 000083/000087
//     вызывают G.companions);
//   * запись отряда ЗАФИКСИРОВАНА под сейв 000085: ровно
//     {npcId, level, xp, loyalty, hiredDay} (000082/000085 не меняют);
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
const { createCharacter } = require('../src/player.js');
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

// Запись отряда в ЗАФИКСИРОВАННОЙ форме (сейв 000085).
const entry = (id, loyalty = 50, day = 1) => (
  ({ npcId: id, level: 1, xp: 0, loyalty, hiredDay: day }));

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
  'src/map.js', 'src/player.js', 'src/day.js', 'src/items.js',
  'src/buildings.js', 'src/npc.js', 'src/companions.js',
];

const API_KEYS = [
  'canDismiss', 'canHire', 'candidatesForTavern', 'createRoster',
  'dismiss', 'eventSeed', 'hire', 'loyaltyTick', 'payWages', 'wagesTotal',
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

test('запись отряда: ровно {npcId, level, xp, loyalty, hiredDay}', () => {
  const r = C.createRoster();
  const c = hero(15, 100);
  const res = C.hire(r, merc('merc_volk'), c, 7);
  assert.equal(res.ok, true);
  assert.deepEqual(Object.keys(res.entry).sort(),
    ['hiredDay', 'level', 'loyalty', 'npcId', 'xp'],
    'форма записи зафиксирована под сейв 000085 — без денормализованных полей');
  assert.equal(res.entry.npcId, 'merc_volk');
  assert.equal(res.entry.level, 1, 'hire создаёт level 1');
  assert.equal(res.entry.xp, 0, 'hire создаёт xp 0 (000082 пишется сюда)');
  assert.equal(res.entry.hiredDay, 7);
  assert.equal(res.entry.loyalty, res.loyalty);
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

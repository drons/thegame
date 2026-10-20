// Задача 000232: «Изучение видов крафта» — ядро (красные тесты, TDD).
//
// ТЗ (tasks/pending/000232.md): (1) рецепты крафта необходимо изучать,
// неизученные — не отображаются в диалогах крафта; (2) особый вид
// предметов (свитки/чертежи) — при использовании изучает ВИД КРАФТА;
// (3) свитки — у NPC, в сундуках, с мобов.
//
// Контракты — memory/000232-craft-learned-kinds.md:
//   D0  — граничность: изучается ВИД (6 типов), не рецепт;
//   D0b — «изучен» ⇔ c.craftTypes[type] ИЛИ c.craft[type] !== undefined
//         ИЛИ c.craftXp[type] > 0 (прогресс = знание; свежий герой — 0
//         изученных; craftLevel-дефолт 1 ≠ знание);
//   D0c — гейт в evalCraft ОДНОЙ точкой: после alive-пре-чека, ДО
//         уровня; причина РОВНО «вид не изучен» (зеркало
//         canCraft/craft, 000037); mentorCraft/bookCraftXp НЕ гейтятся;
//   D0d — API craft.js (именованное пространство Game.Craft):
//         isTypeLearned / learnedCraftTypes / learnCraftType /
//         sanitizeCraftTypes.
//
// КРАСНЫЕ — 3 (expectedRedCount = 3), все падают ПО АССЕРТУ (не
// SyntaxError/крах — модуль загружается, ленивый require):
//   * CL-1: C.isTypeLearned и др. — undefined (API не реализовано);
//   * CL-2: C.learnCraftType — undefined;
//   * CL-3: гейта нет — craft «голого» героя (wood_sword, ур. 1) —
//     УСПЕХ (сейчас ok:true).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const P = require('../src/player.js');
const I = require('../src/items.js');
const { createCharacter } = P;

// ЛЕНИВЫЙ require (паттерн 000045): если модуль/функции появятся —
// тесты перевернутся без правок файла.
function loadCraft() { return require('../src/craft.js'); }

// Оба ролла (качество/выход) проваливаются — детерминированно.
const NO_ROLLS = () => 0.999;

function give(c, id, qty) {
  const r = I.addItem(c, id, qty);
  assert.equal(r.ok, true, `give(${id}): ${r.reason || ''}`);
}

test('CL-1: API craft.js — isTypeLearned/learnedCraftTypes/learnCraftType/sanitizeCraftTypes (Game.Craft); свежий герой — 0 изученных (craftLevel-дефолт 1 ≠ знание); D0b: c.craft[type] / c.craftXp[type] > 0 = знание; sanitizeCraftTypes чистит мусор', () => {
  const C = loadCraft();
  assert.equal(typeof C.isTypeLearned, 'function',
    'C.isTypeLearned — функция (краснота: API 000232 не реализовано)');
  assert.equal(typeof C.learnedCraftTypes, 'function',
    'C.learnedCraftTypes — функция (краснота: API не реализовано)');
  assert.equal(typeof C.learnCraftType, 'function',
    'C.learnCraftType — функция (краснота: API не реализовано)');
  assert.equal(typeof C.sanitizeCraftTypes, 'function',
    'C.sanitizeCraftTypes — функция (краснота: API не реализовано)');
  // Свежий герой — НИЧЕГО не изучено (ТЗ строка 1):
  const p = createCharacter();
  for (const t of C.CRAFT_TYPES) {
    assert.equal(C.isTypeLearned(p, t), false,
      'свежий герой: «' + t + '» НЕ изучен (записи нет — дефолт уровня ≠ знание)');
  }
  assert.deepEqual(C.learnedCraftTypes(p), [],
    'свежий герой — 0 изученных видов');
  // D0b: «старые» доказательства знания (прогресс = знание):
  const p2 = createCharacter();
  p2.craft = { 'алхимия': 1 };
  assert.equal(C.isTypeLearned(p2, 'алхимия'), true,
    'D0b: запись c.craft[type] — вид изучен (mentorCraft/craft пишут)');
  const p3 = createCharacter();
  p3.craftXp = { 'столярное_дело': 5 };
  assert.equal(C.isTypeLearned(p3, 'столярное_дело'), true,
    'D0b: c.craftXp[type] > 0 — вид изучен');
  const p4 = createCharacter();
  p4.craftXp = { 'столярное_дело': 0 };
  assert.equal(C.isTypeLearned(p4, 'столярное_дело'), false,
    'craftXp = 0 БЕЗ записи c.craft — НЕ изучен');
  // learnedCraftTypes — полный отсортированный список:
  p2.craft['рунопись'] = 2;
  assert.deepEqual(C.learnedCraftTypes(p2), ['алхимия', 'рунопись'],
    'learnedCraftTypes — все изученные, отсортированно');
  // sanitizeCraftTypes (сейв-санитайзер, паттерн sanitizeCraftLevels):
  assert.deepEqual(C.sanitizeCraftTypes(undefined), {}, 'нет поля → {}');
  assert.deepEqual(C.sanitizeCraftTypes(null), {}, 'null → {}');
  assert.deepEqual(C.sanitizeCraftTypes('мусор'), {}, 'строка → {}');
  assert.deepEqual(C.sanitizeCraftTypes(5), {}, 'число → {}');
  assert.deepEqual(C.sanitizeCraftTypes([1, 2]), {}, 'массив → {}');
  assert.deepEqual(
    C.sanitizeCraftTypes({ 'кузнечное_дело': 1, 'чужое': true, 'алхимия': false }),
    { 'кузнечное_дело': true },
    'чужой ключ отброшен; truthy → true; false → без ключа');
});

test('CL-2: learnCraftType — успех (мутация c.craftTypes ТОЛЬКО на успехе), повтор — «вид уже изучен» (в т.ч. по D0b-прогрессу), неизвестный вид — отказ БЕЗ мутации', () => {
  const C = loadCraft();
  assert.equal(typeof C.learnCraftType, 'function',
    'краснота: API не реализовано');
  const p = createCharacter();
  assert.deepEqual(C.learnCraftType(p, 'алхимия'), { ok: true },
    'первое обучение — ok');
  assert.equal(p.craftTypes && p.craftTypes['алхимия'], true,
    'мутация c.craftTypes — ТОЛЬКО на успехе');
  assert.equal(C.isTypeLearned(p, 'алхимия'), true, 'после learn — изучен');
  const again = C.learnCraftType(p, 'алхимия');
  assert.equal(again.ok, false, 'повтор — отказ (двойное обучение исключено)');
  assert.equal(again.reason, 'вид уже изучен',
    'повтор: причина; факт: ' + again.reason);
  // D0b: вид «изучен» прогрессом (без c.craftTypes) — повтор всё равно
  // отказ (иначе свиток тратился бы на изученный по факту вид):
  const p2 = createCharacter();
  p2.craft = { 'рунопись': 2 };
  const via = C.learnCraftType(p2, 'рунопись');
  assert.equal(via.ok, false,
    'D0b: «изучен» по c.craft[type] — повторный learn отказан');
  assert.equal(via.reason, 'вид уже изучен',
    'D0b: причина; факт: ' + via.reason);
  assert.equal(p2.craftTypes, undefined,
    'отказ — без мутации (c.craftTypes не создаётся)');
  // Неизвестный вид:
  const p3 = createCharacter();
  const bad = C.learnCraftType(p3, 'нет_такого_вида');
  assert.equal(bad.ok, false, 'неизвестный вид — отказ');
  assert.match(String(bad.reason), /неизвестный вид/,
    'причина называет «неизвестный вид»; факт: ' + bad.reason);
  assert.equal(p3.craftTypes, undefined, 'неизвестный вид — без мутации');
});

test('CL-3: гейт ядра (evalCraft) — «вид не изучен» ОДНОЙ причиной (зеркало canCraft/craft), ДО проверки уровня, исходники НЕ тратятся при отказе; после learnCraftType — успех', () => {
  const C = loadCraft();
  const p = createCharacter();
  give(p, 'wood_log', 2);
  // (1) Уровневый порог рецепта пройден (wood_sword — ур. 1, герой — 1),
  //     исходники есть — но вид НЕ изучен:
  const r = C.craft(p, 'wood_sword', { building: 5, rng: NO_ROLLS });
  assert.equal(r.ok, false,
    'краснота: сейчас УСПЕХ (гейта нет) — факт: ' + JSON.stringify(r));
  assert.equal(r.reason, 'вид не изучен',
    'причина РОВНО «вид не изучен» (контракт D0c); факт: ' + r.reason);
  assert.equal(C.canCraft(p, 'wood_sword', { building: 5 }).reason,
    'вид не изучен',
    'зеркало canCraft — ТА ЖЕ причина (000037)');
  assert.equal(I.totalQty(p, 'wood_log'), 2,
    'отказ — исходники не тратятся (атомарность)');
  // (2) Гейт РАНОЕ уровня: short_bow — ур. 3 (герой — 1), исходники
  //     достаточны: без гейта причина была бы «недостаточный уровень»:
  const r2 = C.craft(p, 'short_bow', { building: 5, rng: NO_ROLLS });
  assert.equal(r2.reason, 'вид не изучен',
    'гейт раньше «недостаточный уровень (нужно 3)»; факт: ' + r2.reason);
  assert.equal(C.canCraft(p, 'short_bow', { building: 5 }).reason,
    'вид не изучен', 'зеркало canCraft: гейт раньше уровня');
  // (3) После изучения — успех (одна причина → оба API):
  assert.deepEqual(C.learnCraftType(p, 'столярное_дело'), { ok: true },
    'обучение виду');
  const chk = C.canCraft(p, 'wood_sword', { building: 5 });
  assert.equal(chk.ok, true, 'canCraft после learn: ' + (chk.reason || ''));
  const ok = C.craft(p, 'wood_sword', { building: 5, rng: NO_ROLLS });
  assert.equal(ok.ok, true, 'craft после learn: ' + (ok.reason || ''));
  assert.equal(I.totalQty(p, 'wood_sword'), 1, 'результат в инвентаре');
  assert.equal(I.totalQty(p, 'wood_log'), 1, '1 wood_log потрачено');
  assert.equal(C.isTypeLearned(p, 'столярное_дело'), true,
    'D0b: после craft — вид изучен (прогресс)');
});

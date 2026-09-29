// Крафт в игровом коде (задача 000046): уровни видов, рост (практика/
// книги/наставники), изготовление (атомарность, зеркало canCraft/craft),
// качество/выход, зачарование — по каталогу assets/craft (source of
// truth) и SPEC.md «Крафт».
//
// TDD: красные тесты — модуль src/craft.js ещё не существует, require
// падает до реализации (ленивый require, паттерн tests/spells.test.js
// задачи 000045). Числовые формулы фиксированы здесь (паттерн 000045:
// формулы — в шапке модуля + красные тесты, не в SPEC):
//   * пороги уровней вида: 15×(L+1) (та же формула, что у навыков);
//   * опыт за изготовление: 10 + уровень рецепта (виду крафта);
//   * потолок практикой: уровень связанного навыка × 2 (таблица
//     CRAFT_TYPE_SKILL; у столярного дела связанный навык — ОСНОВНОЙ
//     Ловкость); выше потолка рост — только книгами и наставниками;
//     на потолке практика — applied 0, копилка не меняется;
//   * качество: только у постройки — min(0.5, 0.05 + 0.005×(L−1));
//     в поле — 0; рецепт с «база» (улучшенный способ) — 1 (гарантия,
//     даже в поле). Бонус: +1 к главной стате результата (weapon →
//     damage, armor → armor, potion/food → effect.amount) × множитель
//     навыка-потолка вида (forge → equipmentDurabilityMult,
//     alchemy → potionPowerMult, runes → runePowerMult,
//     dexterity → ×1), round, min 1; реагент — без бонуса;
//   * выход (доп. предмет): min(0.25, 0.02 + 0.002×(L−1)) — и у
//     постройки, и в поле (SPEC: в поле вырезается только качество);
//     «база» — 1. Бонус — +1 предмет-результат (qty+1);
//   * зачарование (spell.действие → стата результата): урон →
//     weapon damage += степень; защита → armor += степень; лечение →
//     potion/food amount += 1 + степень; ослабление/контроль — без
//     бонуса к предмету; мана тратится в любом случае;
//   * наставник: +1 уровень виду за обучение.цена_за_уровень, без
//     потолка (до 100).
// Роллы: rng вызывается СНАЧАЛА для качества, затем для выхода
// (порядок закреплён тестом; детерминированные тесты — scripted-rng).

const { test } = require('node:test');
const assert = require('node:assert/strict');

const P = require('../src/player.js');
const I = require('../src/items.js');
const { NPCS } = require('../src/npc-data.js');
const { createCharacter } = P;

// Модуль ещё не существует — ленивый require (красная стадия).
function loadCraft() { return require('../src/craft.js'); }

// Детерминированный rng: роллы по порядку, затем 0.5.
function rolls(first, second) {
  const seq = [first, second];
  let i = 0;
  return () => (i < seq.length ? seq[i++] : 0.5);
}
// Оба ролла проваливаются (качество и выход).
const NO_ROLLS = () => 0.999;

// Выдать предмет (фикстура; assert внутри — ошибка фикстуры видна).
function give(c, id, qty) {
  const r = I.addItem(c, id, qty);
  assert.equal(r.ok, true, `give(${id}): ${r.reason || ''}`);
}

// --- Уровни видов ---

test('уровни: ленивый craftOf, дефолт 1, c.craft {вид: 1..100}', () => {
  const C = loadCraft();
  const bare = {};
  assert.equal(bare.craft, undefined, 'до craftOf поля нет');
  assert.equal(bare.craftXp, undefined, 'до craftOf копилки нет');
  const craft = C.craftOf(bare);
  assert.deepEqual(bare.craft, {}, 'craftOf создал c.craft');
  assert.deepEqual(bare.craftXp, {}, 'craftOf создал c.craftXp');
  assert.equal(craft, bare.craft, 'возвращает тот же объект');
  // Существующий прогресс не затирается.
  bare.craft['алхимия'] = 3;
  C.craftOf(bare);
  assert.equal(bare.craft['алхимия'], 3);
  // Дефолтный уровень вида — 1.
  const p = createCharacter();
  for (const t of C.CRAFT_TYPES) {
    assert.equal(C.craftLevel(p, t), 1, `дефолт для «${t}»`);
  }
  // craftLevel — без побочных эффектов (c.craft НЕ создаёт).
  assert.equal(p.craft, undefined, 'craftLevel не мутирует персонажа');
  // Явный уровень.
  p.craft = { 'алхимия': 7 };
  assert.equal(C.craftLevel(p, 'алхимия'), 7);
  assert.equal(C.craftLevel(p, 'кузнечное_дело'), 1, 'остальные — дефолт');
});

test('craftXpForNext: 15×(L+1) — формула навыков (player.js)', () => {
  const C = loadCraft();
  for (const l of [1, 2, 5, 10, 50, 99]) {
    assert.equal(C.craftXpForNext(l), 15 * (l + 1), `L=${l}`);
    assert.equal(C.craftXpForNext(l), P.skillXpForNext(l),
      'совпадает с формулой навыков');
  }
});

test('таблицы: CRAFT_TYPES, CRAFT_TYPE_SKILL, SKILL_CRAFT_TYPE, typeBuildings', () => {
  const C = loadCraft();
  // Шесть видов (SPEC «Виды крафта») — в порядке .sort()
  // (UTF-16: «з» раньше «к»).
  assert.deepEqual([...C.CRAFT_TYPES].sort(), [
    'алхимия', 'зачарование', 'кузнечное_дело', 'резьба_по_камню',
    'рунопись', 'столярное_дело',
  ]);
  // Навык-потолок на вид (закрытый SPEC-разрыв: у столярного дела
  // связанный навык ОДИН и он ОСНОВНОЙ — Ловкость).
  assert.deepEqual(C.CRAFT_TYPE_SKILL, {
    'кузнечное_дело': 'forge',
    'алхимия': 'alchemy',
    'резьба_по_камню': 'runes',
    'столярное_дело': 'dexterity',
    'зачарование': 'runes',
    'рунопись': 'runes',
  });
  // Навык → вид для книг/наставников: только ОДНОЗНАЧНЫЕ маппинги
  // (runes намеренно исключён — конфликт трёх видов).
  assert.deepEqual(C.SKILL_CRAFT_TYPE, {
    forge: 'кузнечное_дело',
    heavy: 'кузнечное_дело',
    alchemy: 'алхимия',
    nature: 'алхимия',
    dexterity: 'столярное_дело',
  });
  // typeBuildings — union полей «здания» ВСЕХ рецептов вида
  // (выводится из зеркала, не хардкод).
  const expected = {};
  for (const r of C.CRAFT) {
    (expected[r.тип] = expected[r.тип] || new Set());
    for (const b of r.здания) expected[r.тип].add(b);
  }
  for (const t of C.CRAFT_TYPES) {
    assert.deepEqual(C.typeBuildings(t),
      [...expected[t]].sort((a, b) => a - b), `«${t}»`);
  }
  assert.deepEqual(C.typeBuildings('нет_такого_вида'), []);
  // Известные из каталога:
  assert.deepEqual(C.typeBuildings('кузнечное_дело'), [8, 25]);
  assert.deepEqual(C.typeBuildings('столярное_дело'), [5]);
});

test('потолок практикой: craftCap = навык×2 (вторичный ИЛИ основной)', () => {
  const C = loadCraft();
  const p = createCharacter();
  p.secondary.forge = 5;
  assert.equal(C.craftCap(p, 'кузнечное_дело'), 10, 'forge 5 → 10');
  p.secondary.alchemy = 3;
  assert.equal(C.craftCap(p, 'алхимия'), 6);
  // Столярное дело: потолок — ОСНОВНОЙ Ловкость (вторичного нет).
  assert.equal(C.craftCap(p, 'столярное_дело'), 2, 'dexterity 1 → 2');
  p.primary.dexterity = 4;
  assert.equal(C.craftCap(p, 'столярное_дело'), 8, 'dexterity 4 → 8');
  // Зачарование, рунопись и резьба делят Рунопись.
  p.secondary.runes = 7;
  assert.equal(C.craftCap(p, 'зачарование'), 14);
  assert.equal(C.craftCap(p, 'рунопись'), 14);
  assert.equal(C.craftCap(p, 'резьба_по_камню'), 14);
  // Неизвестный вид — 0.
  assert.equal(C.craftCap(p, 'нет_такого_вида'), 0);
});

test('addCraftXp: рост, потолок — applied 0, reprocessCraftXp при росте навыка', () => {
  const C = loadCraft();
  const T = 'кузнечное_дело';
  // Рост ниже потолка: 75 XP = L1→2 (30) + L2→3 (45).
  const p = createCharacter();
  p.secondary.forge = 5; // потолок 10 (навык×2)
  const r = C.addCraftXp(p, T, 75);
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.applied, 75);
  assert.equal(r.level, 3);
  assert.equal(r.leveledUp, true);
  assert.equal(r.total, 0);
  assert.equal(p.craft[T], 3);
  assert.equal(p.craftXp[T], 0);
  // На потолке: applied 0, копилка НЕ меняется (зеркало _gainSkillXp).
  p.craft = { [T]: 10 };
  p.craftXp = { [T]: 165 };
  const r2 = C.addCraftXp(p, T, 50);
  assert.equal(r2.ok, true, r2.reason);
  assert.equal(r2.applied, 0);
  assert.equal(r2.level, 10);
  assert.equal(r2.leveledUp, false);
  assert.equal(r2.total, 165);
  assert.equal(r2.reason, 'потолок практикой');
  assert.equal(p.craftXp[T], 165, 'копилка на потолке не меняется');
  // ignoreCap (книги/наставники): ведёт в потолок.
  const r3 = C.addCraftXp(p, T, 165, true);
  assert.equal(r3.level, 11, 'ignoreCap — рост в потолок');
  assert.equal(r3.total, 165, '330 − 165');
  assert.equal(p.craft[T], 11);
  // Потолок вырос (forge 5→11: 10→22): reprocess конвертирует копилку.
  p.craft = { [T]: 10 };
  p.craftXp = { [T]: 165 };
  p.secondary.forge = 11;
  const leveled = C.reprocessCraftXp(p, 'forge');
  assert.deepEqual(leveled, [T]);
  assert.equal(p.craft[T], 11);
  assert.equal(p.craftXp[T], 0, '165 − 165 (порог 15×11)');
  // Пустая копилка — пере-репроцессинга нет.
  assert.deepEqual(C.reprocessCraftXp(p, 'forge'), []);
  // Причины:
  assert.equal(C.addCraftXp(p, 'нет_такого_вида', 1).reason,
    'неизвестный вид крафта: нет_такого_вида');
  assert.equal(C.addCraftXp(p, T, -5).reason, 'неверный опыт');
  assert.equal(C.addCraftXp(p, T, 1.5).reason, 'неверный опыт');
  p.alive = false;
  assert.equal(C.addCraftXp(p, T, 5).reason, 'персонаж погиб');
});

test('reprocessCraftXp: вызывается из player.js при росте навыка (очки/практика/школа)', () => {
  const C = loadCraft();
  // Ленивый хук читает globalThis.Game.Craft при ВЫЗОВЕ (player.js
  // загружается ДО craft.js — UMD-ловушка 000038; паттерн хука
  // bookCraftXp в items.js). В node Game.Craft нет — задаём явно.
  const G0 = globalThis.Game;
  globalThis.Game = { Craft: C };
  try {
    // Очки, вторичный навык: forge 5→6 — кузнечное_дело: потолок 10→12.
    const p = createCharacter();
    p.primary.strength = 5; // требование дерева forge: Сила 5
    p.secondary.forge = 5; // потолок кузнечного дела 10
    p.craft = { 'кузнечное_дело': 10 }; // на потолке
    p.craftXp = { 'кузнечное_дело': 165 };
    p.points = 1;
    const r = P.raiseSkill(p, 'forge');
    assert.equal(r.ok, true, r.reason);
    assert.equal(p.secondary.forge, 6, 'forge 5→6');
    assert.equal(C.craftLevel(p, 'кузнечное_дело'), 11, 'потолок 10→12: +1');
    assert.equal(p.craftXp['кузнечное_дело'], 0, '165 − 165 (порог 15×11)');
    // Очки, ОСНОВНОЙ навык: dexterity 1→2 — столярное_дело: потолок 2→4.
    const p2 = createCharacter();
    p2.craft = { 'столярное_дело': 2 }; // на потолке (dexterity 1 → 2)
    p2.craftXp = { 'столярное_дело': 45 };
    p2.points = 1;
    const r2 = P.raiseSkill(p2, 'dexterity');
    assert.equal(r2.ok, true, r2.reason);
    assert.equal(C.craftLevel(p2, 'столярное_дело'), 3, 'потолок 2→4: +1');
    assert.equal(p2.craftXp['столярное_дело'], 0, '45 − 45 (порог 15×3)');
    // Практика: alchemy 4→5 — алхимия: потолок 8→10.
    const p3 = createCharacter();
    p3.primary.intelligence = 4; // потолок ПРАКТИКИ alchemy 8
    p3.secondary.alchemy = 4; // потолок алхимии 8
    p3.craft = { 'алхимия': 8 }; // на потолке
    p3.craftXp = { 'алхимия': 135 };
    const pr = P.skillPractice(p3, 'alchemy', 75); // 75 = порог 15×5
    assert.equal(pr.leveledUp, true, 'практика подняла alchemy');
    assert.equal(p3.secondary.alchemy, 5, 'alchemy 4→5');
    assert.equal(C.craftLevel(p3, 'алхимия'), 9, 'потолок 8→10: +1');
    assert.equal(p3.craftXp['алхимия'], 0, '135 − 135 (порог 15×9)');
    // Навык не вырос (не до уровня) — копилка крафта не тронута.
    const p4 = createCharacter();
    p4.primary.strength = 5;
    p4.secondary.forge = 5;
    p4.craft = { 'кузнечное_дело': 10 };
    p4.craftXp = { 'кузнечное_дело': 100 };
    P.skillPractice(p4, 'forge', 10); // 10 < 15×6 — уровня нет
    assert.equal(p4.secondary.forge, 5, 'уровня нет');
    assert.equal(C.craftLevel(p4, 'кузнечное_дело'), 10, 'без репроцессинга');
    assert.equal(p4.craftXp['кузнечное_дело'], 100);
    // КАСКАД: рост ОСНОВНОГО навыка поднимает вторичный (репроцессинг
    // практикой), и от него растёт потолок крафта.
    // Сила 5→6 → потолок практики Кузнечной руки 10→12: рука 10→11
    // (копилка 165 = порог 15×11) → кузнечное_дело: потолок 20→22.
    const p6 = createCharacter();
    p6.primary.strength = 5;
    p6.secondary.forge = 10; // на потолке практики (5×2)
    p6.skillXp = { forge: 165 }; // застряла у потолка
    p6.craft = { 'кузнечное_дело': 20 }; // на потолке крафта (10×2)
    p6.craftXp = { 'кузнечное_дело': 315 }; // порог 20→21: 15×21
    p6.points = 1;
    const r6 = P.raiseSkill(p6, 'strength');
    assert.equal(r6.ok, true, r6.reason);
    assert.deepEqual(r6.skillLevels, ['forge'], 'каскад поднял forge');
    assert.equal(p6.secondary.forge, 11, 'forge 10→11 (каскад)');
    assert.equal(C.craftLevel(p6, 'кузнечное_дело'), 21,
      'потолок 20→22: +1 от каскадного роста forge');
    assert.equal(p6.craftXp['кузнечное_дело'], 0, '315 − 315');
    // Школа (npc.js schoolTrain) — тоже рост навыка.
    const N = require('../src/npc.js');
    const thor = NPCS.find((n) => n.id === 'blacksmith');
    const p5 = createCharacter();
    p5.primary.strength = 5;
    p5.secondary.forge = 5;
    p5.craft = { 'кузнечное_дело': 10 };
    p5.craftXp = { 'кузнечное_дело': 165 };
    const r5 = N.schoolTrain(thor, p5, 'forge');
    assert.equal(r5.ok, true, r5.reason);
    assert.equal(p5.secondary.forge, 6, 'forge 5→6 (школа)');
    assert.equal(p5.gold, 80, 'золото −20');
    assert.equal(C.craftLevel(p5, 'кузнечное_дело'), 11, 'потолок 10→12: +1');
    assert.equal(p5.craftXp['кузнечное_дело'], 0);
  } finally {
    if (G0 === undefined) delete globalThis.Game;
    else globalThis.Game = G0;
  }
});

test('книги: bookCraftXp — опыт виду (effect.amount), ведёт в потолок', () => {
  const C = loadCraft();
  const book = I.getItem('alchemy_manual'); // skill_book, alchemy, 10 XP
  assert.equal(book.effect.skill, 'alchemy');
  assert.equal(book.effect.amount, 10);
  // Практика на потолке — applied 0; книга ведёт в потолок.
  const p = createCharacter();
  p.secondary.alchemy = 5; // потолок 10
  p.craft = { 'алхимия': 10 };
  p.craftXp = { 'алхимия': 160 }; // +10 пересечёт порог 165
  assert.equal(C.addCraftXp(p, 'алхимия', 10).applied, 0, 'практика — на потолке');
  const r = C.bookCraftXp(p, book);
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.level, 11, 'книга ведёт вид в потолок практикой');
  assert.equal(r.total, 5, '160 + 10 − 165');
  assert.equal(p.craft['алхимия'], 11);
  // Книга без маппинга в вид крафта (Мечник) — опыта нет, без эффектов.
  const p2 = createCharacter();
  const r2 = C.bookCraftXp(p2, I.getItem('sword_treatise'));
  assert.equal(r2.ok, false);
  assert.equal(r2.reason, 'книга не связана с видом крафта');
  assert.equal(p2.craft, undefined, 'без побочных эффектов (c.craft)');
  assert.equal(p2.craftXp, undefined, 'без побочных эффектов (c.craftXp)');
  // Не книга — без опыта.
  const r3 = C.bookCraftXp(p2, I.getItem('honey_cake'));
  assert.equal(r3.ok, false);
  assert.equal(r3.reason, 'неверная книга');
});

test('наставник: кузнец Торн — кузнечное_дело (−20 золота, +1, ведёт в потолок)', () => {
  const C = loadCraft();
  const T = 'кузнечное_дело';
  const thor = NPCS.find((n) => n.id === 'blacksmith');
  assert.ok(thor.обучение, 'у Торна есть «обучение»');
  // Успех: уровень +1, золото −20 (цена_за_уровень).
  const p = createCharacter(); // 100 золота
  const r = C.mentorCraft(thor, p, T);
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.level, 2);
  assert.equal(r.price, 20);
  assert.equal(p.gold, 80, 'золото −20');
  assert.equal(C.craftLevel(p, T), 2);
  // Ведёт в потолок практикой: forge 5 → потолок 10; уровень 10 → 11.
  const p2 = createCharacter();
  p2.secondary.forge = 5;
  p2.craft = { [T]: 10 };
  const r2 = C.mentorCraft(thor, p2, T);
  assert.equal(r2.ok, true, r2.reason);
  assert.equal(C.craftLevel(p2, T), 11, 'наставник — в потолок');
  // Причины:
  const merchant = NPCS.find((n) => n.id === 'weapons_merchant');
  assert.equal(C.canMentorCraft(merchant, p, T).reason, 'не обучает крафт',
    'NPC без «обучение»');
  assert.equal(C.canMentorCraft(thor, p, 'алхимия').reason,
    'не обучает этот вид крафта', 'forge/back не маппятся в алхимию');
  assert.equal(C.canMentorCraft(thor, p, 'столярное_дело').reason,
    'не обучает этот вид крафта');
  // Мастер арены: heavy → кузнечное_дело, но постройки [7] ∉ [8, 25].
  const arena = NPCS.find((n) => n.id === 'arena_master');
  assert.equal(C.canMentorCraft(arena, p, T).reason, 'нет постройки этого вида');
  // Максимальный уровень (проверка раньше золота).
  const p3 = createCharacter();
  p3.craft = { [T]: 100 };
  assert.equal(C.canMentorCraft(thor, p3, T).reason, 'максимальный уровень');
  assert.equal(C.mentorCraft(thor, p3, T).ok, false);
  assert.equal(C.craftLevel(p3, T), 100, 'уровень не растёт');
  // Мало золота:
  const p4 = createCharacter();
  p4.gold = 19;
  assert.equal(C.canMentorCraft(thor, p4, T).reason, 'мало золота (нужно 20)');
  assert.equal(C.mentorCraft(thor, p4, T).ok, false);
  assert.equal(p4.gold, 19, 'золото не тратится при отказе');
  assert.equal(C.craftLevel(p4, T), 1);
});

// --- Изготовление (craft/canCraft) ---

test('craft: успех — исходники сняты, результат в инвентаре, опыт 10+уровень', () => {
  const C = loadCraft();
  const p = createCharacter();
  give(p, 'wood_log', 1);
  const r = C.craft(p, 'wood_sword', { building: 5, rng: NO_ROLLS });
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.item, 'wood_sword');
  assert.equal(r.qty, 1);
  assert.equal(I.totalQty(p, 'wood_log'), 0, 'исходники сняты');
  assert.equal(I.totalQty(p, 'wood_sword'), 1, 'результат в инвентаре');
  // Опыт виду: 10 + уровень рецепта (1) = 11 (30 до уровня — не растёт).
  assert.equal(r.xp.applied, 11, 'опыт 10 + уровень вида');
  assert.equal(r.xp.level, 1);
  assert.equal(p.craftXp['столярное_дело'], 11);
  assert.equal(C.craftLevel(p, 'столярное_дело'), 1);
  // Качество не выпало — слот без бонуса.
  const slot = p.inventory.slots.find((s) => s.id === 'wood_sword');
  assert.ok(slot, 'слот результата');
  assert.equal(slot.bonus, undefined);
  assert.equal(r.quality, false);
  assert.equal(r.extra, false);
});

test('craft: неизвестный рецепт / «недостаточный уровень (нужно N)»', () => {
  const C = loadCraft();
  const p = createCharacter();
  give(p, 'wood_log', 2);
  assert.equal(C.craft(p, 'nope', { rng: NO_ROLLS }).reason, 'неизвестный рецепт');
  assert.equal(C.canCraft(p, 'nope').reason, 'неизвестный рецепт');
  // Короткий лук — уровень 3, герой — 1.
  const r = C.craft(p, 'short_bow', { building: 5, rng: NO_ROLLS });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'недостаточный уровень (нужно 3)');
  assert.equal(C.canCraft(p, 'short_bow', { building: 5 }).reason,
    'недостаточный уровень (нужно 3)');
  assert.equal(I.totalQty(p, 'wood_log'), 2, 'при отказе ничего не потрачено');
  // Уровень достигнут — успех.
  p.craft = { 'столярное_дело': 3 };
  assert.equal(C.canCraft(p, 'short_bow', { building: 5 }).ok, true);
  const ok = C.craft(p, 'short_bow', { building: 5, rng: NO_ROLLS });
  assert.equal(ok.ok, true, ok.reason);
  assert.equal(I.totalQty(p, 'short_bow'), 1);
});

test('craft: мёртвый персонаж — отказ (pre-check, без мутаций)', () => {
  // Ревью (раунд 2): без pre-check по alive craft() выполнял ВСЕ
  // мутации (исходники сняты, результат в инвентаре), и лишь опыт
  // давал «персонаж погиб» (applied 0) — результат оставался
  // «в подарок». canCraft при этом — ok:true (нарушение зеркала).
  const C = loadCraft();
  const p = createCharacter();
  give(p, 'wood_log', 1);
  p.alive = false;
  // canCraft — зеркало craft: одна причина.
  const cc = C.canCraft(p, 'wood_sword', { building: 5 });
  assert.equal(cc.ok, false);
  assert.equal(cc.reason, 'персонаж погиб');
  // craft — отказ ДО всех мутаций.
  const r = C.craft(p, 'wood_sword', { building: 5, rng: NO_ROLLS });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'персонаж погиб');
  assert.equal(I.totalQty(p, 'wood_log'), 1, 'исходники не потрачены');
  assert.equal(I.totalQty(p, 'wood_sword'), 0, 'результата в инвентаре нет');
  assert.equal(p.craft, undefined, 'c.craft не создаётся');
  assert.equal(p.craftXp, undefined, 'c.craftXp не создаётся');
  // mentorCraft — тот же pre-check: золото не тратится, уровня нет.
  const thor = NPCS.find((n) => n.id === 'blacksmith');
  const cm = C.canMentorCraft(thor, p, 'кузнечное_дело');
  assert.equal(cm.ok, false);
  assert.equal(cm.reason, 'персонаж погиб');
  const rm = C.mentorCraft(thor, p, 'кузнечное_дело');
  assert.equal(rm.ok, false);
  assert.equal(rm.reason, 'персонаж погиб');
  assert.equal(p.gold, 100, 'золото не тратится при отказе');
  assert.equal(C.craftLevel(p, 'кузнечное_дело'), 1, 'уровень не растёт');
});

test('craft: нехватка исходников — «не хватает: <название>», атомарность', () => {
  const C = loadCraft();
  const p = createCharacter();
  p.craft = { 'кузнечное_дело': 2 };
  // Железный меч из руды: Железная руда ×2 + Уголь ×1 — руды 1.
  give(p, 'iron_ore', 1);
  give(p, 'coal', 1);
  const before = JSON.stringify(p.inventory);
  const r = C.craft(p, 'iron_sword_ore', { building: 8, rng: NO_ROLLS });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'не хватает: ' + I.getItem('iron_ore').name);
  assert.equal(C.canCraft(p, 'iron_sword_ore', { building: 8 }).reason,
    'не хватает: ' + I.getItem('iron_ore').name);
  assert.equal(JSON.stringify(p.inventory), before,
    'инвентарь не тронут (атомарность)');
  // Нехватка ПЕРВОГО из списка исходников — его причина.
  const p2 = createCharacter();
  p2.craft = { 'кузнечное_дело': 6 };
  const r2 = C.craft(p2, 'war_hammer', { building: 8, rng: NO_ROLLS });
  assert.equal(r2.reason, 'не хватает: ' + I.getItem('iron_sword').name,
    'причина — первого нехватившегося исходника');
});

test('craft: не то здание — отказ; в поле (building null) — успех', () => {
  const C = loadCraft();
  const p = createCharacter();
  give(p, 'wood_log', 1);
  // Деревянный меч — здания [5]; Аптекарь (3) — не место.
  const r = C.craft(p, 'wood_sword', { building: 3, rng: NO_ROLLS });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'в этом здании такой способ не изготавливается');
  assert.equal(C.canCraft(p, 'wood_sword', { building: 3 }).reason,
    'в этом здании такой способ не изготавливается');
  assert.equal(I.totalQty(p, 'wood_log'), 1, 'при отказе ничего не потрачено');
  // В поле — можно (качества нет — см. тест качества).
  const r2 = C.craft(p, 'wood_sword', { building: null, rng: NO_ROLLS });
  assert.equal(r2.ok, true, r2.reason);
  assert.equal(I.totalQty(p, 'wood_sword'), 1);
});

test('craft: инвентарь полон / слишком тяжело — отказ, исходники НЕ потрачены', () => {
  const C = loadCraft();
  // Полон: 19 слотов серы + 1 бревно = 20; меч — ещё слот.
  const p = createCharacter();
  p.inventory = {
    slots: [
      ...Array.from({ length: 19 }, () => ({ id: 'sulfur', qty: 1 })),
      { id: 'wood_log', qty: 1 },
    ],
    quick: [null, null, null],
  };
  const before = JSON.stringify(p.inventory);
  const r = C.craft(p, 'wood_sword', { building: 5, rng: NO_ROLLS });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'нет свободных слотов инвентаря');
  assert.equal(C.canCraft(p, 'wood_sword', { building: 5 }).reason,
    'нет свободных слотов инвентаря');
  assert.equal(JSON.stringify(p.inventory), before, 'исходники не потрачены');
  // Слишком тяжело: 28 руды (28 кг) + бревно (2 кг) = лимит 30;
  // + деревянный меч (1 кг) — не влезает.
  const p2 = createCharacter();
  give(p2, 'iron_ore', 28);
  give(p2, 'wood_log', 1);
  const r2 = C.craft(p2, 'wood_sword', { building: 5, rng: NO_ROLLS });
  assert.equal(r2.ok, false);
  assert.equal(r2.reason, 'слишком тяжело (лимит веса)');
  assert.equal(I.totalQty(p2, 'wood_log'), 1, 'исходники не потрачены');
});

test('canCraft: зеркало craft — одна причина, без побочных эффектов (000037)', () => {
  const C = loadCraft();
  const scenarios = [
    ['успех', (h) => give(h, 'wood_log', 1), 'wood_sword', { building: 5 }, {}],
    ['неизвестный', () => {}, 'nope', {}, {}],
    ['уровень', (h) => give(h, 'wood_log', 2), 'short_bow', { building: 5 }, {}],
    ['здание', (h) => give(h, 'wood_log', 1), 'wood_sword', { building: 3 }, {}],
    ['исходники', (h) => give(h, 'wood_log', 1), 'short_bow', { building: 5 },
      { 'столярное_дело': 3 }],
  ];
  for (const [label, prep, id, opts0, levels] of scenarios) {
    const p = createCharacter();
    prep(p);
    if (Object.keys(levels).length) p.craft = levels;
    let rngCalls = 0;
    const opts = Object.assign({}, opts0, {
      rng: () => { rngCalls += 1; return 0.999; },
    });
    const snap = () => JSON.stringify({
      inv: p.inventory, eq: p.equipment, ebonus: p.equipmentBonus,
      craft: p.craft, craftXp: p.craftXp, gold: p.gold, mp: p.mp,
      hp: p.hp, spells: p.spells,
    });
    const before = snap();
    const mirror = C.canCraft(p, id, opts);
    assert.equal(rngCalls, 0, `${label}: canCraft не вызывает rng`);
    assert.equal(snap(), before, `${label}: canCraft без побочных эффектов`);
    const core = C.craft(p, id, Object.assign({}, opts, { rng: () => 0.999 }));
    assert.equal(mirror.ok, core.ok, `${label}: расхождение ok`);
    if (!core.ok) {
      assert.equal(mirror.reason, core.reason, `${label}: расхождение reason`);
    }
  }
  // «Голый» персонаж: canCraft НЕ создаёт c.craft/c.craftXp.
  const bare = {
    primary: {
      strength: 1, dexterity: 1, constitution: 1,
      intelligence: 1, wisdom: 1, charisma: 1,
    },
    secondary: {},
  };
  C.canCraft(bare, 'nope');
  C.canCraft(bare, 'wood_sword');
  assert.equal(bare.craft, undefined, 'c.craft не создаётся');
  assert.equal(bare.craftXp, undefined, 'c.craftXp не создаётся');
  // Зачарование без p.spells: отказ «не изучено», p.spells НЕ создаётся
  // (зеркало 000045: canCastSpell не создаёт p.spells).
  const p2 = createCharacter();
  p2.spells = undefined;
  p2.craft = { 'зачарование': 5 };
  give(p2, 'short_bow', 1);
  give(p2, 'phoenix_feather', 1);
  const rBare = C.canCraft(p2, 'hunting_bow', { building: 18 });
  assert.equal(rBare.ok, false);
  assert.equal(rBare.reason, 'заклинание не изучено');
  assert.equal(p2.spells, undefined, 'p.spells не создаётся зеркалом');
  // craft() при том же отказе тоже p.spells не создаёт, исходники целы.
  const rBare2 = C.craft(p2, 'hunting_bow', { building: 18, rng: NO_ROLLS });
  assert.equal(rBare2.reason, 'заклинание не изучено');
  assert.equal(p2.spells, undefined, 'craft не создаёт p.spells при отказе');
  assert.equal(I.totalQty(p2, 'short_bow'), 1, 'исходники не потрачены');
});

test('ёмкость: выход (+1) считается зеркалом — отказ, если не влезает; ' +
     'результат НЕ остаётся (нет бесплатного предмета)', () => {
  const C = loadCraft();
  // 19 слотов: honey_cake ×2, moonstone ×2 (исходники — стопки с
  // излишком, слот НЕ освобождается), sulfur ×17. Стопки зелья НЕТ:
  // результат (качество — бонусный слот) — 20/20, +1 выходной — 21.
  const p = createCharacter();
  p.inventory = {
    slots: [
      { id: 'honey_cake', qty: 2 },
      { id: 'moonstone', qty: 2 },
      ...Array.from({ length: 17 }, () => ({ id: 'sulfur', qty: 1 })),
    ],
    quick: [null, null, null],
  };
  const before = JSON.stringify(p.inventory);
  // Качество (0.01 < 0.05) и выход (0.01 < 0.02) — оба выпали.
  const r = C.craft(p, 'healing_potion', { building: 17, rng: rolls(0.01, 0.01) });
  assert.equal(r.ok, false, r.reason);
  assert.equal(r.reason, 'нет свободных слотов инвентаря');
  assert.equal(
    C.canCraft(p, 'healing_potion', { building: 17 }).reason,
    'нет свободных слотов инвентаря', 'зеркало: canCraft даёт ту же причину');
  assert.equal(JSON.stringify(p.inventory), before,
    'атомарность: исходники не потрачены, результат не остался');
  assert.equal(I.totalQty(p, 'healing_potion'), 0, 'бесплатного предмета нет');
  // «База» (улучшенный способ): результат ×2 с бонусом + гарантированный
  // выход — те же 19 слотов.
  const p2 = createCharacter();
  p2.craft = { 'алхимия': 4 }; // healing_potion_fine — уровень 4
  p2.inventory = {
    slots: [
      { id: 'honey_cake', qty: 3 },
      { id: 'moonstone', qty: 3 },
      ...Array.from({ length: 17 }, () => ({ id: 'sulfur', qty: 1 })),
    ],
    quick: [null, null, null],
  };
  const r2 = C.craft(p2, 'healing_potion_fine', { building: 17, rng: () => 0.9999 });
  assert.equal(r2.ok, false, r2.reason);
  assert.equal(r2.reason, 'нет свободных слотов инвентаря');
  assert.equal(
    C.canCraft(p2, 'healing_potion_fine', { building: 17 }).reason,
    'нет свободных слотов инвентаря', 'зеркало: canCraft даёт ту же причину');
  assert.equal(I.totalQty(p2, 'healing_potion'), 0,
    'бесплатного предмета нет (×2 + бонус не остались)');
});

test('ёмкость: бонусный слот (отдельный, не сливается со стопкой) — ' +
     'зеркало считает (000037)', () => {
  const C = loadCraft();
  // 20/20 слотов: honey_cake ×2, moonstone ×2, sulfur ×17,
  // healing_potion ×5. В обычную стопку влезает, но БОНУСНЫЙ экземпляр
  // — отдельный слот, а слотов нет.
  const p = createCharacter();
  p.inventory = {
    slots: [
      { id: 'honey_cake', qty: 2 },
      { id: 'moonstone', qty: 2 },
      ...Array.from({ length: 17 }, () => ({ id: 'sulfur', qty: 1 })),
      { id: 'healing_potion', qty: 5 },
    ],
    quick: [null, null, null],
  };
  const before = JSON.stringify(p.inventory);
  // Качество выпало (0.01 < 0.05), выход нет (0.99 > 0.02).
  const r = C.craft(p, 'healing_potion', { building: 17, rng: rolls(0.01, 0.99) });
  assert.equal(r.ok, false, r.reason);
  assert.equal(r.reason, 'нет свободных слотов инвентаря');
  assert.equal(
    C.canCraft(p, 'healing_potion', { building: 17 }).reason,
    'нет свободных слотов инвентаря',
    'зеркало: canCraft НЕ даёт ok, когда craft уткнёт в бонусный слот');
  assert.equal(JSON.stringify(p.inventory), before, 'исходники не потрачены');
  assert.equal(I.totalQty(p, 'healing_potion'), 5, 'результат не остался');
  // Пускать один слот серы (19 слотов) — худший случай влезает:
  // canCraft ok и craft ok, бонус — отдельным слотом.
  p.inventory.slots.splice(2, 1);
  const r2 = C.craft(p, 'healing_potion', { building: 17, rng: rolls(0.01, 0.99) });
  assert.equal(r2.ok, true, r2.reason);
  assert.equal(C.canCraft(p, 'healing_potion', { building: 17 }).ok, true);
  assert.equal(r2.quality, true);
  assert.equal(I.totalQty(p, 'healing_potion'), 6, '5 + 1 (бонусный)');
  const bonusSlot = p.inventory.slots
    .find((s) => s.id === 'healing_potion' && s.bonus);
  assert.ok(bonusSlot, 'бонус — отдельный слот');
  assert.equal(bonusSlot.qty, 1);
  assert.equal(I.totalQty(p, 'honey_cake'), 1, 'исходники потрачены');
  assert.equal(I.totalQty(p, 'moonstone'), 1, 'исходники потрачены');
});

// --- Качество ---

test('qualityChance: min(0.5, 0.05+0.005×(L−1)); в поле 0; «база» → 1', () => {
  const C = loadCraft();
  const p = createCharacter();
  assert.equal(C.qualityChance(p, 'iron_sword', 8), 0.05, 'L=1');
  p.craft = { 'кузнечное_дело': 10 };
  assert.equal(C.qualityChance(p, 'iron_sword', 8),
    0.05 + 0.005 * 9, 'L=10');
  p.craft = { 'кузнечное_дело': 91 };
  assert.equal(C.qualityChance(p, 'iron_sword', 8), 0.5, 'L=91 — потолок 0.5');
  p.craft = { 'кузнечное_дело': 100 };
  assert.equal(C.qualityChance(p, 'iron_sword', 8), 0.5, 'L=100 — потолок 0.5');
  // В поле — 0 (SPEC: вне постройки без шанса качества).
  assert.equal(C.qualityChance(p, 'iron_sword', null), 0);
  // Улучшенный способ («база») — гарантирован (даже в поле).
  assert.equal(C.qualityChance(p, 'iron_sword_fine', 8), 1);
  assert.equal(C.qualityChance(p, 'iron_sword_fine', null), 1);
  // Неизвестный рецепт — 0.
  assert.equal(C.qualityChance(p, 'nope', 8), 0);
});

test('качество: бонус на слоте, множитель навыка вида, equipmentStats', () => {
  const C = loadCraft();
  // Оружие, forge 0 → +1 (round(1 × 1.0)).
  // iron_sword — уровень 2 каталога: уровень вида задаём.
  const p = createCharacter();
  p.craft = { 'кузнечное_дело': 2 };
  give(p, 'wood_sword', 1);
  give(p, 'sulfur', 2);
  const r = C.craft(p, 'iron_sword', { building: 8, rng: rolls(0.01, 0.999) });
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.quality, true, 'качество выпало (0.01 < 0.05)');
  assert.equal(r.extra, false, 'выход не выпал (0.999 > 0.02)');
  const slot = p.inventory.slots.find((s) => s.id === 'iron_sword');
  assert.ok(slot, 'результат в инвентаре');
  assert.deepEqual(slot.bonus, { damage: 1 }, 'weapon → {damage}');
  assert.deepEqual(r.bonus, { damage: 1 }, 'бонус в ответе');
  // Оружие, forge 10 → +2 (round(1 × 1.5)).
  const p2 = createCharacter();
  p2.secondary.forge = 10; // equipmentDurabilityMult 1.5
  p2.craft = { 'кузнечное_дело': 2 }; // iron_sword — уровень 2
  give(p2, 'wood_sword', 1);
  give(p2, 'sulfur', 2);
  const r2 = C.craft(p2, 'iron_sword', { building: 8, rng: rolls(0.01, 0.999) });
  assert.equal(r2.ok, true, r2.reason);
  assert.deepEqual(
    p2.inventory.slots.find((s) => s.id === 'iron_sword').bonus,
    { damage: 2 }, 'forge 10 → ×1.5 → +2');
  // equipmentStats видит бонус (экип — bonus-копия, bonusFirst).
  const eq = I.equip(p2, 'iron_sword');
  assert.equal(eq.ok, true, eq.reason);
  assert.equal(I.equipmentStats(p2).damage, 5 + 2, 'база 5 + бонус 2');
  // Броня, forge 10 → {armor: 2}.
  const p3 = createCharacter();
  p3.secondary.forge = 10;
  p3.craft = { 'кузнечное_дело': 3 }; // leather_armor — уровень 3
  give(p3, 'hide', 2);
  give(p3, 'coal', 1);
  const r3 = C.craft(p3, 'leather_armor', { building: 8, rng: rolls(0.01, 0.999) });
  assert.equal(r3.ok, true, r3.reason);
  assert.deepEqual(
    p3.inventory.slots.find((s) => s.id === 'leather_armor').bonus,
    { armor: 2 }, 'armor → {armor}');
  I.equip(p3, 'leather_armor');
  assert.equal(I.equipmentStats(p3).armor, 2 + 2, 'база 2 + бонус 2');
  // Зелье, алхимик 10 → {amount: 2} (potionPowerMult 1.5).
  const p4 = createCharacter();
  p4.secondary.alchemy = 10;
  give(p4, 'herb_healing', 2);
  const r4 = C.craft(p4, 'minor_healing', { building: 3, rng: rolls(0.01, 0.999) });
  assert.equal(r4.ok, true, r4.reason);
  assert.deepEqual(
    p4.inventory.slots.find((s) => s.id === 'minor_healing').bonus,
    { amount: 2 }, 'potion → {amount}');
  // В поле — качества нет (даже при «везучем» rng).
  const p5 = createCharacter();
  p5.craft = { 'кузнечное_дело': 2 }; // iron_sword — уровень 2
  give(p5, 'wood_sword', 1);
  give(p5, 'sulfur', 2);
  const r5 = C.craft(p5, 'iron_sword', { building: null, rng: () => 0 });
  assert.equal(r5.ok, true, r5.reason);
  assert.equal(r5.quality, false, 'в поле — шанса качества нет');
  assert.equal(
    p5.inventory.slots.find((s) => s.id === 'iron_sword').bonus, undefined);
  // Реагент (резец) — статы нет, бонуса нет.
  const p6 = createCharacter();
  give(p6, 'stone_chunk', 2);
  const r6 = C.craft(p6, 'stone_chisel', { building: 40, rng: () => 0 });
  assert.equal(r6.ok, true, r6.reason);
  assert.equal(
    p6.inventory.slots.find((s) => s.id === 'stone_chisel').bonus, undefined,
    'у реагента нет бонуса качества');
});

test('выход: формула, работает и в поле, extra = результат +1', () => {
  const C = loadCraft();
  const p = createCharacter();
  assert.equal(C.yieldChance(p, 'wood_sword', 5), 0.02, 'L=1, у постройки');
  assert.equal(C.yieldChance(p, 'wood_sword', null), 0.02, 'в поле — то же');
  p.craft = { 'столярное_дело': 11 };
  assert.equal(C.yieldChance(p, 'wood_sword', 5), 0.02 + 0.002 * 10, 'L=11');
  p.craft = { 'столярное_дело': 100 };
  assert.equal(C.yieldChance(p, 'wood_sword', 5), 0.02 + 0.002 * 99, 'L=100');
  // Потолок 0.25 (поддельный уровень >100 — кламп формулы).
  p.craft = { 'столярное_дело': 200 };
  assert.equal(C.yieldChance(p, 'wood_sword', 5), 0.25);
  // Улучшенный способ — гарантирован.
  const p2 = createCharacter();
  assert.equal(C.yieldChance(p2, 'healing_potion_fine', null), 1);
  // Неизвестный рецепт — 0.
  assert.equal(C.yieldChance(p2, 'nope', 5), 0);
  // extra: качество не выпало, выход выпал — зелье ×2 в одной стопке.
  const p3 = createCharacter();
  give(p3, 'honey_cake', 1);
  give(p3, 'moonstone', 1);
  const r = C.craft(p3, 'healing_potion', { building: 17, rng: rolls(0.999, 0.01) });
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.quality, false);
  assert.equal(r.extra, true, 'выход выпал');
  assert.equal(I.totalQty(p3, 'healing_potion'), 2, 'результат + extra');
  assert.equal(
    p3.inventory.slots.filter((s) => s.id === 'healing_potion').length, 1,
    'зелья складываются в одну стопку');
  // В поле тоже:
  const p4 = createCharacter();
  give(p4, 'honey_cake', 1);
  give(p4, 'moonstone', 1);
  const r4 = C.craft(p4, 'healing_potion', { building: null, rng: rolls(0.999, 0.01) });
  assert.equal(r4.ok, true, r4.reason);
  assert.equal(r4.extra, true, 'выход — и в поле (вырезается только качество)');
  assert.equal(I.totalQty(p4, 'healing_potion'), 2);
  // Оружие не складывается: extra = +1 копия (2 слота, без бонусов).
  const p5 = createCharacter();
  give(p5, 'wood_log', 1);
  const r5 = C.craft(p5, 'wood_sword', { building: 5, rng: rolls(0.999, 0.01) });
  assert.equal(r5.ok, true, r5.reason);
  assert.equal(r5.extra, true);
  assert.equal(I.totalQty(p5, 'wood_sword'), 2);
  assert.equal(
    p5.inventory.slots.filter((s) => s.id === 'wood_sword').length, 2);
});

test('улучшенный способ («база»): качество и выход гарантированы (rng неважен)', () => {
  const C = loadCraft();
  // Тонкая ковка: уровень 5; rng 0.9999 — всё равно гарантия.
  const p = createCharacter();
  p.craft = { 'кузнечное_дело': 5 };
  give(p, 'wood_sword', 1);
  give(p, 'sulfur', 3);
  give(p, 'moonstone', 1);
  const r = C.craft(p, 'iron_sword_fine', { building: 8, rng: () => 0.9999 });
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.quality, true, 'качество гарантировано');
  assert.equal(r.extra, true, 'выход гарантирован');
  const slots = p.inventory.slots.filter((s) => s.id === 'iron_sword');
  assert.equal(slots.length, 2, 'bonus-копия + extra-копия');
  assert.equal(slots.filter((s) => s.bonus).length, 1, 'бонус у одного слота');
  assert.equal(slots.find((s) => s.bonus).bonus.damage, 1, 'forge 0 → +1');
  // Гарантия действует и в поле (качество вне постройки — только для
  // обычных рецептов).
  const p2 = createCharacter();
  p2.craft = { 'кузнечное_дело': 5 };
  give(p2, 'wood_sword', 1);
  give(p2, 'sulfur', 3);
  give(p2, 'moonstone', 1);
  const r2 = C.craft(p2, 'iron_sword_fine', { building: null, rng: () => 0.9999 });
  assert.equal(r2.ok, true, r2.reason);
  assert.equal(r2.quality, true, 'улучшенный способ гарантирован и в поле');
  // Тонкая варка: результат ×2 (одна стопка с бонусом) + extra = 3.
  const p3 = createCharacter();
  p3.craft = { 'алхимия': 4 };
  give(p3, 'honey_cake', 2);
  give(p3, 'moonstone', 2);
  const r3 = C.craft(p3, 'healing_potion_fine', { building: 17, rng: () => 0.9999 });
  assert.equal(r3.ok, true, r3.reason);
  assert.equal(r3.quality, true);
  assert.equal(r3.extra, true);
  assert.equal(I.totalQty(p3, 'healing_potion'), 3, '2 (результат) + 1 (extra)');
  const slot3 = p3.inventory.slots.find((s) => s.id === 'healing_potion');
  assert.ok(slot3, 'слот зелья');
  assert.equal(slot3.qty, 2, 'результат ×2 в одном слоте (с бонусом)');
  assert.deepEqual(slot3.bonus, { amount: 1 }, 'алхимик 0 → +1');
});

// --- Зачарование (заклинания при изготовлении) ---

test('зачарование: тип требует заклинание (по умолчанию — первое из рецепта)', () => {
  const C = loadCraft();
  // Охотничий лук: spell по умолчанию — frost_bolt (4 маны, урон, степень 1).
  const p = createCharacter();
  p.spells = ['frost_bolt'];
  p.craft = { 'зачарование': 5 };
  give(p, 'short_bow', 1);
  give(p, 'phoenix_feather', 1);
  const r = C.craft(p, 'hunting_bow', { building: 18, rng: NO_ROLLS });
  assert.equal(r.ok, true, r.reason);
  assert.equal(p.mp, 16 - 4, 'мана −4 (frost_bolt)');
  const slot = p.inventory.slots.find((s) => s.id === 'hunting_bow');
  assert.deepEqual(slot.bonus, { damage: 1 }, 'урон → weapon +степень (1)');
  // Не изучено — отказ до расхода (исходники и мана целы).
  const p2 = createCharacter();
  p2.craft = { 'зачарование': 5 };
  give(p2, 'short_bow', 1);
  give(p2, 'phoenix_feather', 1);
  assert.equal(p2.spells.length, 2, 'стартовая книга: spark + mend');
  const r2 = C.craft(p2, 'hunting_bow', { building: 18, rng: NO_ROLLS });
  assert.equal(r2.ok, false);
  assert.equal(r2.reason, 'заклинание не изучено');
  assert.equal(I.totalQty(p2, 'short_bow'), 1, 'исходники не потрачены');
  assert.equal(p2.mp, 16, 'мана не потрачена');
});

test('зачарование: «не хватает маны (8)»; stone_skin → bonus.armor на доспехе', () => {
  const C = loadCraft();
  // Рыцарский доспех: spell stone_skin (8 маны, защита, степень 1).
  const p = createCharacter();
  p.spells = ['stone_skin'];
  p.craft = { 'зачарование': 8 };
  p.mp = 7;
  give(p, 'chainmail', 1);
  give(p, 'moonstone', 2);
  const r = C.craft(p, 'knight_plate', { building: 18, rng: NO_ROLLS });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'не хватает маны (8)');
  assert.equal(I.totalQty(p, 'chainmail'), 1, 'исходники не потрачены');
  assert.equal(p.mp, 7, 'мана не потрачена');
  p.mp = 8;
  const r2 = C.craft(p, 'knight_plate', { building: 18, rng: NO_ROLLS });
  assert.equal(r2.ok, true, r2.reason);
  assert.equal(p.mp, 0, 'мана −8');
  assert.deepEqual(
    p.inventory.slots.find((s) => s.id === 'knight_plate').bonus,
    { armor: 1 }, 'защита → armor +степень (1)');
});

test('зачарование опционально для остальных типов; spellId не из рецепта — отказ', () => {
  const C = loadCraft();
  // Стальной меч (кузнечное дело): «заклинания» [fireball], но не обязателен.
  const base = () => {
    const p = createCharacter();
    p.craft = { 'кузнечное_дело': 4 };
    give(p, 'iron_sword', 1);
    give(p, 'sulfur', 2);
    give(p, 'phoenix_feather', 1);
    return p;
  };
  // Без spellId — успех, мана не тратится, бонуса нет.
  const p = base();
  const r = C.craft(p, 'steel_sword', { building: 8, rng: NO_ROLLS });
  assert.equal(r.ok, true, r.reason);
  assert.equal(p.mp, 16, 'без заклинания — мана не тратится');
  assert.equal(
    p.inventory.slots.find((s) => s.id === 'steel_sword').bonus, undefined);
  // Со spellId: fireball (6 маны, урон, степень 1) → +1 damage.
  const p2 = base();
  p2.spells = ['fireball'];
  const r2 = C.craft(p2, 'steel_sword', {
    building: 8, spellId: 'fireball', rng: NO_ROLLS,
  });
  assert.equal(r2.ok, true, r2.reason);
  assert.equal(p2.mp, 16 - 6, 'мана −6 (fireball)');
  assert.deepEqual(
    p2.inventory.slots.find((s) => s.id === 'steel_sword').bonus,
    { damage: 1 });
  // spellId не из рецепта (даже если изучено) — отказ.
  const p3 = base();
  p3.spells = ['frost_bolt'];
  const r3 = C.craft(p3, 'steel_sword', {
    building: 8, spellId: 'frost_bolt', rng: NO_ROLLS,
  });
  assert.equal(r3.reason, 'в этом рецепте нет такого заклинания');
  assert.equal(I.totalQty(p3, 'iron_sword'), 1, 'исходники не потрачены');
  // spellId из рецепта, но не изучено — отказ.
  const p4 = base();
  p4.spells = [];
  const r4 = C.craft(p4, 'steel_sword', {
    building: 8, spellId: 'fireball', rng: NO_ROLLS,
  });
  assert.equal(r4.reason, 'заклинание не изучено');
});

test('зачарование: бонус заклинания складывается с качеством', () => {
  const C = loadCraft();
  const p = createCharacter();
  p.spells = ['frost_bolt'];
  p.craft = { 'зачарование': 5 };
  give(p, 'short_bow', 1);
  give(p, 'phoenix_feather', 1);
  const r = C.craft(p, 'hunting_bow', { building: 18, rng: rolls(0.01, 0.999) });
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.quality, true);
  const slot = p.inventory.slots.find((s) => s.id === 'hunting_bow');
  assert.deepEqual(slot.bonus, { damage: 2 },
    'качество (+1, runes 0) + степень заклинания (1)');
});

test('зачарование: рецепт без заклинаний — «для этого рецепта нужно заклинание»', () => {
  const C = loadCraft();
  const recipe = C.CRAFT_BY_ID.hunting_bow;
  const saved = recipe.заклинания;
  try {
    // Мутация каталога в памяти (схема enum это закрывает; код обязан
    // давать чистый отказ — паттерн ревью 000045).
    recipe.заклинания = [];
    const p = createCharacter();
    p.spells = ['frost_bolt'];
    p.craft = { 'зачарование': 5 };
    give(p, 'short_bow', 1);
    give(p, 'phoenix_feather', 1);
    assert.equal(
      C.craft(p, 'hunting_bow', { building: 18, rng: NO_ROLLS }).reason,
      'для этого рецепта нужно заклинание');
    assert.equal(
      C.canCraft(p, 'hunting_bow', { building: 18 }).reason,
      'для этого рецепта нужно заклинание');
  } finally {
    recipe.заклинания = saved;
  }
});

// --- Инвентарь: слоты с бонусом качества (src/items.js, аддитивно) ---

test('инвентарь: слот с bonus изолирован; addItem/canAddItem/removeItem', () => {
  // addItem с bonus — отдельный слот (не сливается с обычной стопкой).
  const p = createCharacter();
  assert.equal(I.addItem(p, 'iron_sword', 1, { damage: 2 }).ok, true);
  assert.equal(I.addItem(p, 'iron_sword', 1).ok, true, 'обычная — свой слот');
  assert.equal(p.inventory.slots.length, 2, 'bonus-слот не слан с стопкой');
  // Нормализованный порядок (компаратор ставит бонусные ПЕРВЫМИ):
  // ровно один слот с бонусом {damage: 2} и один — без.
  assert.deepEqual(
    p.inventory.slots.map((s) => s.bonus).sort((a, b) => (a ? 1 : -1)),
    [{ damage: 2 }, undefined]);
  // Неверный bonus — отказ (к ключам по kind, целые ≥ 1).
  const bad = I.addItem(p, 'iron_sword', 1, { armor: 1 });
  assert.equal(bad.ok, false);
  assert.equal(bad.reason, 'неверный бонус качества');
  assert.equal(I.addItem(p, 'leather_armor', 1, { damage: 1 }).ok, false);
  assert.equal(I.addItem(p, 'healing_potion', 1, { damage: 1 }).ok, false);
  assert.equal(I.addItem(p, 'iron_sword', 1, { damage: 0 }).ok, false);
  assert.equal(I.addItem(p, 'iron_sword', 1, { damage: -1 }).ok, false);
  assert.equal(I.addItem(p, 'iron_sword', 1, { damage: 1.5 }).ok, false);
  assert.equal(I.addItem(p, 'iron_sword', 1, { damage: 1, armor: 1 }).ok, false,
    'у слота только главный стат kind-а');
  assert.equal(I.addItem(p, 'stone_chunk', 1, { damage: 1 }).ok, false,
    'у реагента бонуса нет');
  assert.equal(I.addItem(p, 'iron_sword', 1, 42).ok, false, 'bonus не объект');
  assert.equal(I.totalQty(p, 'iron_sword'), 2, 'отказы ничего не добавили');
  // canAddItem — dry-run тех же проверок addItem (слоты + вес).
  const p2 = createCharacter();
  p2.inventory = {
    slots: Array.from({ length: 20 }, () => ({ id: 'sulfur', qty: 1 })),
    quick: [null, null, null],
  };
  assert.equal(I.canAddItem(p2, 'sulfur', 1).ok, true, 'в существующую стопку');
  const noSlot = I.canAddItem(p2, 'wood_sword', 1);
  assert.equal(noSlot.ok, false, 'свободного слота нет');
  assert.equal(noSlot.reason, 'нет свободных слотов инвентаря');
  assert.equal(p2.inventory.slots.length, 20, 'canAddItem без побочных эффектов');
  // Вес: 29 руды (29 кг) + железный меч (1.5 кг) > 30. (wood_sword —
  // 1 кг: 29+1=30 влезает ровно в лимит, не переполняет.)
  const p3 = createCharacter();
  I.addItem(p3, 'iron_ore', 29);
  const heavy = I.canAddItem(p3, 'iron_sword', 1);
  assert.equal(heavy.ok, false);
  assert.equal(heavy.reason, 'слишком тяжело (лимит веса)');
  // removeItem bonusFirst: bonus-копия уходит первой.
  const p4 = createCharacter();
  I.addItem(p4, 'iron_sword', 1, { damage: 2 });
  I.addItem(p4, 'iron_sword', 1);
  const rm = I.removeItem(p4, 'iron_sword', 1, true);
  assert.equal(rm.ok, true, rm.reason);
  assert.equal(p4.inventory.slots.length, 1);
  assert.deepEqual(p4.inventory.slots[0].bonus, undefined,
    'ушла bonus-копия, осталась обычная');
});

test('инвентарь: equip/unequip — бонус следует предмету (equipmentBonus)', () => {
  const p = createCharacter();
  I.addItem(p, 'iron_sword', 1, { damage: 2 });
  I.addItem(p, 'iron_sword', 1);
  // equip забирает bonus-копию (bonusFirst).
  const eq = I.equip(p, 'iron_sword');
  assert.equal(eq.ok, true, eq.reason);
  assert.deepEqual(p.equipmentBonus, { weapon: { damage: 2 }, armor: null });
  assert.equal(I.equipmentStats(p).damage, 5 + 2, 'база 5 + бонус 2');
  assert.equal(I.totalQty(p, 'iron_sword'), 1, 'в инвентаре обычная копия');
  // unequip — бонус вернулся с предметом.
  const un = I.unequip(p, 'weapon');
  assert.equal(un.ok, true, un.reason);
  const slots = p.inventory.slots.filter((s) => s.id === 'iron_sword');
  assert.equal(slots.length, 2);
  assert.equal(slots.filter((s) => s.bonus).length, 1, 'бонус вернулся');
  // Следующий equip — обычная копия: бонуса нет.
  I.equip(p, 'iron_sword');
  assert.deepEqual(p.equipmentBonus, { weapon: null, armor: null });
  assert.equal(I.equipmentStats(p).damage, 5);
});

test('инвентарь: useItem зелья с bonus — amount+bonus; sellPrice не тронут', () => {
  const M = require('../src/map.js');
  // С bonus: малое зелье лечения, алхимик 10 → round(6×1.5) + 2 = 11.
  const p = createCharacter();
  p.secondary.alchemy = 10;
  I.addItem(p, 'minor_healing', 1, { amount: 2 });
  p.hp = 1;
  const r = I.useItem(p, 'minor_healing');
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.hp, 11, 'база round(6×1.5)=9 + бонус 2');
  assert.equal(p.hp, 12);
  assert.equal(I.totalQty(p, 'minor_healing'), 0, 'слот с bonus потрачен');
  // Контроль: без bonus и без алхимика — 6.
  const p2 = createCharacter();
  I.addItem(p2, 'minor_healing', 1);
  p2.hp = 1;
  const r2 = I.useItem(p2, 'minor_healing');
  assert.equal(r2.hp, 6);
  // Цена предмета от бонуса не зависит (поинстансного прайсинга нет).
  const shop = I.makeShop(10, 20, M.BUILDING_TYPES.APOTHECARY, 2);
  const p3 = createCharacter();
  I.addItem(p3, 'minor_healing', 1, { amount: 2 });
  assert.equal(
    I.sellPrice(shop, 'minor_healing', p3),
    I.sellPrice(shop, 'minor_healing', createCharacter()),
    'sellPrice не зависит от bonus');
});

// --- Сейв: санитизеры (опциональные поля, без повышения версии, 000031) ---

test('sanitizeCraftLevels/sanitizeCraftXp: мусор → {}, валидные — сохранены', () => {
  const C = loadCraft();
  // sanitizeCraftLevels: {вид: целое 1..100}, прочее отбрасывается.
  assert.deepEqual(C.sanitizeCraftLevels(null), {});
  assert.deepEqual(C.sanitizeCraftLevels('craft'), {});
  assert.deepEqual(C.sanitizeCraftLevels([]), {});
  assert.deepEqual(C.sanitizeCraftLevels(42), {});
  assert.deepEqual(C.sanitizeCraftLevels({
    'кузнечное_дело': 7, 'алхимия': 100, 'нет_такого_вида': 5, 'алхимия2': 2,
  }), { 'кузнечное_дело': 7, 'алхимия': 100 }, 'неизвестный вид отброшен');
  assert.deepEqual(C.sanitizeCraftLevels({ 'кузнечное_дело': 200 }),
    { 'кузнечное_дело': 100 }, '>100 клампится до 100');
  assert.deepEqual(C.sanitizeCraftLevels({ 'кузнечное_дело': 0 }), {}, '<1 — отброс');
  assert.deepEqual(C.sanitizeCraftLevels({ 'кузнечное_дело': 1.5 }), {}, 'дробный — отброс');
  assert.deepEqual(C.sanitizeCraftLevels({ 'кузнечное_дело': '5' }), {}, 'строка — отброс');
  assert.deepEqual(C.sanitizeCraftLevels({ 'рунопись': 1 }), { 'рунопись': 1 });
  // sanitizeCraftXp: {вид: целое >= 0}.
  assert.deepEqual(C.sanitizeCraftXp(null), {});
  assert.deepEqual(C.sanitizeCraftXp('x'), {});
  assert.deepEqual(C.sanitizeCraftXp({ 'алхимия': 5, 'нет_такого_вида': 3 }),
    { 'алхимия': 5 });
  assert.deepEqual(C.sanitizeCraftXp({ 'алхимия': -1, 'рунопись': 1.5 }), {},
    'отрицательный/дробный — отброс');
  assert.deepEqual(C.sanitizeCraftXp({ 'алхимия': 0 }), { 'алхимия': 0 },
    '0 — валидно (пустая копилка)');
});

test('sanitizeEquipmentBonus/sanitizeInventory: bonus в сейве — чистка без падений', () => {
  const EMPTY = { weapon: null, armor: null };
  assert.deepEqual(I.sanitizeEquipmentBonus(null), EMPTY);
  assert.deepEqual(I.sanitizeEquipmentBonus('x'), EMPTY);
  assert.deepEqual(I.sanitizeEquipmentBonus({}), EMPTY);
  assert.deepEqual(I.sanitizeEquipmentBonus({ weapon: { damage: 2 } }),
    { weapon: { damage: 2 }, armor: null });
  assert.deepEqual(I.sanitizeEquipmentBonus({ armor: { armor: 3 } }),
    { weapon: null, armor: { armor: 3 } });
  // Мусор:
  assert.deepEqual(I.sanitizeEquipmentBonus({ weapon: { damage: -1 } }), EMPTY);
  assert.deepEqual(I.sanitizeEquipmentBonus({ weapon: { damage: 0 } }), EMPTY);
  assert.deepEqual(I.sanitizeEquipmentBonus({ weapon: { damage: 1.5 } }), EMPTY);
  assert.deepEqual(I.sanitizeEquipmentBonus({ weapon: { armor: 1 } }), EMPTY,
    'чужой стат для слота');
  assert.deepEqual(I.sanitizeEquipmentBonus({ weapon: { damage: 1, armor: 1 } }),
    EMPTY, 'лишний ключ');
  assert.deepEqual(I.sanitizeEquipmentBonus({ weapon: 'iron_sword', armor: { armor: 2 } }),
    { weapon: null, armor: { armor: 2 } }, 'чистка одного слота не трогает другой');
  // sanitizeInventory: валидный bonus сохраняется; невалидный — отбрасывается
  // (слот остаётся); bonus-слот не сливается с обычной стопкой.
  assert.deepEqual(I.sanitizeInventory({
    slots: [{ id: 'iron_sword', qty: 1, bonus: { damage: 2 } }],
  }), { slots: [{ id: 'iron_sword', qty: 1, bonus: { damage: 2 } }],
    quick: [null, null, null] });
  assert.deepEqual(I.sanitizeInventory({
    slots: [{ id: 'iron_sword', qty: 1, bonus: { damage: -1 } }],
  }), { slots: [{ id: 'iron_sword', qty: 1 }], quick: [null, null, null] });
  assert.deepEqual(I.sanitizeInventory({
    slots: [
      { id: 'healing_potion', qty: 5 },
      { id: 'healing_potion', qty: 2, bonus: { amount: 1 } },
    ],
  }), { slots: [
    { id: 'healing_potion', qty: 5 },
    { id: 'healing_potion', qty: 2, bonus: { amount: 1 } },
  ], quick: [null, null, null] }, 'bonus-слот не сливается со стопкой');
});

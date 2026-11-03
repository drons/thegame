// Задача 000309: разборка предметов на составные части (TDD: красные
// тесты): возврат 20%→90% с навыком крафта, разборка качает навык
// сборки. Worktree task-000309 (ветка task/000309, база master
// 52a9041).
//
// ТЗ: tasks/pending/000309.md; контракт: memory/000309-disassemble.md
// (§1 формула, §2 маппинг, §3 опыт, §7 API):
//   D1 ФОРМУЛА: p(L) = 20% + 70% × (L − 1) / 99, L — УРОВЕНЬ ВИДА
//      (craftLevel, 1…100, НЕ уровень рецепта): L=1 → 0.2 ТОЧНО,
//      L=100 → 0.9 ТОЧНО; JS-форма (20 + 70*(L−1)/99)/100 — наивная
//      0.2 + 0.7*(L−1)/99 при L=100 даёт 0.8999… (IEEE754);
//      монотонность; нет канонического рецепта → 0.
//   D2 МАППИНГ предмет → канонический рецепт: базовый (без `база`),
//      минимальный `уровень`, при равенстве — первый по порядку
//      каталога; DISASSEMBLY_BY_ITEM — выводится из зеркала CRAFT
//      (не хардкод, прецедент TYPE_BUILDINGS); moonstone — КРОСС-
//      ТИП (рунопись L2 < резьба_по_камню L3); рецепт с `база` —
//      никогда значение; sulfur — нет.
//   D3 РОЛЛЫ: один rng() на позицию исходника, в ПОРЯДКЕ
//      `исходники`; при успехе — ПОЛНОЕ количество позиции, обычный
//      предмет (без бонуса); инверсия seq → инверсия исхода; одна
//      seq → бит-в-бит результат.
//   D4 КОНТРПРИМЕР (ТЗ): шанс ЗАВИСИТ от навыка — один и тот же
//      ролл 0.5: L=1 (p=0.2) — части нет, L=100 (p=0.9) — есть;
//      граница — СТРОГОЕ <: ролл == p — провал (0.2/0.9 — провал,
//      0.199/0.899 — успех).
//   D5 ОПЫТ В ВЕРНЫЙ ВИД (по рецепту сборки): 10 + `уровень`
//      рецепта; healing_potion → алхимия +11 (копилка 29 → 40 →
//      уровень 1→2, порог 30, копилка 10); moonstone → рунопись
//      (НЕ резьба_по_камню); прочие ключи craftXp не тронуты.
//   D6 ПОТОЛОК ПРАКТИКОЙ: на cap — ok:true, applied 0, reason
//      «потолок практикой», копилка не растёт, предмет снят, части
//      возвращены (опыт — независимо от возврата частей).
//   D7 АТОМАРНОСТЬ: ёмкость — ХУДШИЙ СЛУЧАЙ (ВСЕ части) на ТЕКУЩЕМ
//      инвентаре: полон → «нет свободных слотов инвентаря», перевес
//      → «слишком тяжело (лимит веса)» (wording items.js дословно);
//      предмет и quick бит-в-бит нетронуты, 0 XP, 0 роллов.
//   D8 canDisassemble — ЗЕРКАЛО: те же причины что disassemble,
//      rngCalls = 0, 0 мутаций (deep-snapshot); «голый» персонаж —
//      c.craft/c.craftXp не создаются.
//   D9 mёртвый → «персонаж погиб» (проверка рецепта ПЕРВАЯ, до
//      alive и hasItem).
//   D10 нет предмета → «нет предмета в инвентаре».
//   D11 нет рецепта → «предмет нельзя разобрать» (sulfur, unknown).
//   D12 БЕЗ ГЕЙТА «вид не изучен» (в отличие от craft): герой со
//      связанным навыком ≥ 1, вид неизучен → разбор лутаного
//      предмета ok → isTypeLearned true (D0b: прогресс = знание).
//      (Fresh-hero cap-0 нюанс контракта §3 — документирован:
//      applied 0, не ошибка.)
//   D13 MESSAGE — ТОЧНЫЕ строки обоих вариантов + shape успеха:
//      {ok, item, type, returned:[{id,qty}], lost:[{id,qty}],
//      xp:{applied,level,leveledUp,total[,reason]}, message};
//      qty-семантика: стопка ×3 → снят 1, осталось 2; sulfur ×2 —
//      полное количество позиции; XP в message НЕ появляется.
//
// Краснота ОСМЫСЛЕННАЯ: src/craft.js СУЩЕСТВУЕТ и грузится в node
// чисто (UMD-гарды исполнены — craft-data/player/items на месте),
// все тесты падают на ОТСУТСТВИИ новых экспортов
// (C.DISASSEMBLY_BY_ITEM/C.disassemblyRecipeFor/C.disassemblyChance/
// C.canDisassemble/C.disassemble — undefined), а не на синтаксисе/
// модуле (паттерн 000045/000126: ленивый require). 13 красных
// (D1..D13).
//
// Детерминированные роллы — scripted-rng (паттерн репо: rolls()/
// NO_ROLLS из tests/craft-core.test.js; disassemble — opts {rng}).

const { test } = require('node:test');
const assert = require('node:assert/strict');

const P = require('../src/player.js');
const I = require('../src/items.js');
const { createCharacter } = P;

// Модуль существует и грузится — краснота на отсутствии функций.
function loadCraft() { return require('../src/craft.js'); }

// Выдать предмет (фикстура; assert внутри — ошибка фикстуры видна).
function give(c, id, qty) {
  const r = I.addItem(c, id, qty);
  assert.equal(r.ok, true, `give(${id}): ${r.reason || ''}`);
}

// Детерминированный rng: значения по порядку (цикл mod length).
function seqRng(values) {
  let i = 0;
  return () => values[i++ % values.length];
}
// Все роллы проваливаются (p ≤ 0.9).
const NO_BACK = () => 0.999;

const nm = (id) => I.getItem(id).name;

// --- D1: формула шанса ---

test('D1: disassemblyChance — 20% + 70% × (L − 1) / 99, L — уровень ВИДА; L=1 → 0.2, L=100 → 0.9 ТОЧНО; монотонно; нет рецепта → 0', () => {
  const C = loadCraft();
  assert.equal(typeof C.disassemblyChance, 'function',
    'C.disassemblyChance — функция (контракт D1)');
  const p = createCharacter();
  assert.equal(C.disassemblyChance(p, 'iron_sword'), 0.2,
    'L=1 → ТОЧНО 0.2 (рецепт iron_sword — уровень 2, но L — вид)');
  p.craft = { 'кузнечное_дело': 50 };
  assert.equal(C.disassemblyChance(p, 'iron_sword'),
    (20 + 70 * (50 - 1) / 99) / 100, 'L=50 — JS-форма (контракт §1)');
  p.craft = { 'кузнечное_дело': 100 };
  assert.equal(C.disassemblyChance(p, 'iron_sword'), 0.9,
    'L=100 → ТОЧНО 0.9 (наивная 0.2 + 0.7*99/99 даёт 0.8999…)');
  const ch = (L) => {
    p.craft = { 'кузнечное_дело': L };
    return C.disassemblyChance(p, 'iron_sword');
  };
  assert.ok(ch(1) < ch(51) && ch(51) < ch(100),
    'монотонность 1 < 51 < 100: ' + [ch(1), ch(51), ch(100)]);
  // Чисто (без rng, без мутаций) и без рецепта → 0.
  const p2 = createCharacter();
  assert.equal(p2.craft, undefined, 'до вызова c.craft нет');
  assert.equal(C.disassemblyChance(p2, 'sulfur'), 0,
    'sulfur — не результат ни одного рецепта → 0');
  assert.equal(C.disassemblyChance(p2, 'nope'), 0, 'неизвестный id → 0');
  assert.equal(p2.craft, undefined, 'без побочных эффектов');
});

// --- D2: маппинг предмет → канонический рецепт ---

test('D2: DISASSEMBLY_BY_ITEM — базовый, мин. `уровень`, при равенстве первый в каталоге; moonstone — кросс-тип; `база` — никогда', () => {
  const C = loadCraft();
  assert.ok(C.DISASSEMBLY_BY_ITEM &&
      typeof C.DISASSEMBLY_BY_ITEM === 'object',
    'C.DISASSEMBLY_BY_ITEM — мапа (контракт D2)');
  // Data-driven ожидаемое (зеркало каталога, НЕ хардкод): значения —
  // id канонического рецепта (мапа предмет → recipeId, якоря ниже
  // и CRAFT_BY_ID[rid] — строки-идентификаторы):
  const expected = {};
  for (const r of C.CRAFT) {
    if (r.база !== undefined) continue;
    const res = r.результат.предмет;
    if (!(res in expected) ||
        r.уровень < C.CRAFT_BY_ID[expected[res]].уровень) {
      expected[res] = r.id;
    }
  }
  assert.deepEqual(C.DISASSEMBLY_BY_ITEM, expected,
    'маппинг = правило канонического рецепта по зеркалу CRAFT');
  // Точечные (якоря каталога, контракт §2):
  assert.equal(C.DISASSEMBLY_BY_ITEM.iron_sword, 'iron_sword',
    'тай-брейк `уровень` 2==2 — первый по порядку каталога '
    + '(НЕ iron_sword_ore 000015)');
  assert.equal(C.DISASSEMBLY_BY_ITEM.moonstone, 'moonstone_runes',
    'КРОСС-ТИП: рунопись L2 < резьба_по_камню L3');
  assert.equal(C.DISASSEMBLY_BY_ITEM.wood_sword, 'wood_sword');
  assert.equal(C.DISASSEMBLY_BY_ITEM.sulfur, undefined,
    'sulfur — не крафтится (нет рецепта)');
  assert.equal(C.DISASSEMBLY_BY_ITEM.nope, undefined);
  // Рецепт с `база` — никогда значение.
  for (const rid of Object.values(C.DISASSEMBLY_BY_ITEM)) {
    assert.equal(C.CRAFT_BY_ID[rid].база, undefined,
      rid + ': канонический рецепт без `база`');
  }
  // disassemblyRecipeFor — тот же выбор (recipe|null, чисто):
  assert.equal(typeof C.disassemblyRecipeFor, 'function',
    'C.disassemblyRecipeFor — функция');
  assert.equal(C.disassemblyRecipeFor('moonstone').id, 'moonstone_runes');
  assert.equal(C.disassemblyRecipeFor('iron_sword').id, 'iron_sword');
  assert.equal(C.disassemblyRecipeFor('sulfur'), null);
  assert.equal(C.disassemblyRecipeFor('nope'), null);
});

// --- D3: роллы — порядок исходников, полные количества ---

test('D3: disassemble — роллы в ПОРЯДКЕ `исходники` (2 у iron_sword), при успехе ПОЛНОЕ количество; инверсия seq → инверсия исхода; бит-в-бит', () => {
  const C = loadCraft();
  assert.equal(typeof C.disassemble, 'function',
    'C.disassemble — функция (контракт D3)');
  const mk = () => {
    const p = createCharacter();
    p.secondary.forge = 1; // связанный навык ≥ 1 (потолок ≥ 2)
    give(p, 'iron_sword', 1);
    return p;
  };
  // [0.1, 0.9]: 1-я часть (wood_sword) вернулась, 2-я (sulfur) — нет.
  const p = mk();
  let calls = 0;
  const r = C.disassemble(p, 'iron_sword', {
    rng: () => { calls += 1; return [0.1, 0.9][calls - 1]; },
  });
  assert.equal(r.ok, true, r.reason);
  assert.equal(calls, 2, 'роллов = числу позиций исходников (2)');
  assert.equal(I.totalQty(p, 'wood_sword'), 1,
    '1-я позиция (ролл 0.1 < p=0.2) — вернулась');
  assert.equal(I.totalQty(p, 'sulfur'), 0,
    '2-я позиция (ролл 0.9) — не вернулась');
  assert.equal(I.totalQty(p, 'iron_sword'), 0, 'предмет уничтожен');
  // Инверсия seq → инверсия исхода (порядок закреплён):
  const p2 = mk();
  const r2 = C.disassemble(p2, 'iron_sword', { rng: seqRng([0.9, 0.1]) });
  assert.equal(r2.ok, true, r2.reason);
  assert.equal(I.totalQty(p2, 'wood_sword'), 0, 'инверсия: 1-я не вернулась');
  assert.equal(I.totalQty(p2, 'sulfur'), 2,
    'инверсия: 2-я вернулась ПОЛНЫМ количеством позиции (×2)');
  // Одна seq → бит-в-бит результат (детерминизм):
  const a = mk();
  const b = mk();
  C.disassemble(a, 'iron_sword', { rng: seqRng([0.1, 0.1]) });
  C.disassemble(b, 'iron_sword', { rng: seqRng([0.1, 0.1]) });
  assert.equal(JSON.stringify(a.inventory), JSON.stringify(b.inventory),
    'одна seq → бит-в-бит инвентарь');
  assert.equal(I.totalQty(a, 'sulfur'), 2, 'обе части вернулись');
});

// --- D4: контрпример ТЗ — шанс зависит от навыка; строгий < ---

test('D4: контрпример — ОДИН ролл 0.5: L=1 (p=0.2) части нет, L=100 (p=0.9) — есть; граница строгая (<)', () => {
  const C = loadCraft();
  for (const [lvl, back] of [[1, 0], [100, 1]]) {
    const p = createCharacter();
    p.secondary.forge = 1;
    if (lvl > 1) p.craft = { 'кузнечное_дело': lvl };
    give(p, 'iron_sword', 1);
    const r = C.disassemble(p, 'iron_sword', { rng: () => 0.5 });
    assert.equal(r.ok, true, `L=${lvl}: ` + (r.reason || ''));
    assert.equal(I.totalQty(p, 'wood_sword'), back,
      `ролл 0.5: L=${lvl} (p=${C.disassemblyChance(p, 'iron_sword')}) `
      + `— ${back ? 'вернулась' : 'не вернулась'} (зависимость от навыка)`);
  }
  // Граница СТРОГОГО <: ролл == p — провал, ролл чуть ниже — успех.
  for (const [lvl, failRoll, okRoll] of [[1, 0.2, 0.199], [100, 0.9, 0.899]]) {
    const p = createCharacter();
    p.secondary.forge = 1;
    if (lvl > 1) p.craft = { 'кузнечное_дело': lvl };
    give(p, 'iron_sword', 1);
    const r = C.disassemble(p, 'iron_sword', { rng: () => failRoll });
    assert.equal(r.ok, true, `L=${lvl} ролл ${failRoll}: ` + (r.reason || ''));
    assert.equal(I.totalQty(p, 'wood_sword'), 0,
      `L=${lvl}: ролл == p (${failRoll}) — провал (строгое <)`);
    const p2 = createCharacter();
    p2.secondary.forge = 1;
    if (lvl > 1) p2.craft = { 'кузнечное_дело': lvl };
    give(p2, 'iron_sword', 1);
    const r2 = C.disassemble(p2, 'iron_sword', { rng: () => okRoll });
    assert.equal(r2.ok, true, `L=${lvl} ролл ${okRoll}: ` + (r2.reason || ''));
    assert.equal(I.totalQty(p2, 'wood_sword'), 1,
      `L=${lvl}: ролл ${okRoll} < p — успех`);
  }
});

// --- D5: опыт в ВЕРНЫЙ вид ---

test('D5: опыт — виду канонического рецепта, 10 + `уровень` рецепта; healing_potion → алхимия +11 (1→2), moonstone → рунопись (НЕ резьба_по_камню)', () => {
  const C = loadCraft();
  // healing_potion — рецепт алхимия, `уровень` 1: +11; копилка 29
  // → 40 ≥ порог 30 → уровень 1→2, копилка 10 (связанный alchemy 1
  // → потолок 2).
  const p = createCharacter();
  p.secondary.alchemy = 1;
  give(p, 'healing_potion', 1);
  p.craftXp = { 'алхимия': 29 };
  const r = C.disassemble(p, 'healing_potion', { rng: NO_BACK });
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.type, 'алхимия', 'тип — из канонического рецепта');
  assert.equal(r.xp.applied, 11, '10 + уровень рецепта (1)');
  assert.equal(r.xp.level, 2, 'порог 15×(1+1)=30: 29+11 → уровень 2');
  assert.equal(r.xp.leveledUp, true);
  assert.equal(r.xp.total, 10, '40 − 30');
  assert.equal(p.craft['алхимия'], 2);
  assert.equal(p.craftXp['алхимия'], 10);
  assert.equal(p.craftXp['кузнечное_дело'], undefined,
    'прочие виды — не тронуты');
  assert.equal(I.totalQty(p, 'healing_potion'), 0, 'предмет уничтожен');
  // moonstone — канон ruнаcross-тип: рунопись (L2 → +12), НЕ
  // резьба_по_камню (L3).
  const p2 = createCharacter();
  p2.secondary.runes = 1;
  give(p2, 'moonstone', 1);
  const r2 = C.disassemble(p2, 'moonstone', { rng: NO_BACK });
  assert.equal(r2.ok, true, r2.reason);
  assert.equal(r2.type, 'рунопись', 'кросс-тип: рунопись, не резьба_по_камню');
  assert.equal(r2.xp.applied, 12, '10 + уровень рецепта (2)');
  assert.equal(p2.craftXp['рунопись'], 12);
  assert.equal(p2.craftXp['резьба_по_камню'], undefined,
    'резьба_по_камню — НЕ тронута');
});

// --- D6: потолок практикой ---

test('D6: потолок практикой — ok:true, applied 0, reason «потолок практикой», копилка не растёт, предмет снят, части возвращены', () => {
  const C = loadCraft();
  const p = createCharacter();
  p.secondary.forge = 5; // потолок кузнечного дела = 10
  p.craft = { 'кузнечное_дело': 10 };
  p.craftXp = { 'кузнечное_дело': 165 }; // порог 15×11 — у потолка
  give(p, 'iron_sword', 1);
  const r = C.disassemble(p, 'iron_sword', { rng: seqRng([0.1, 0.1]) });
  assert.equal(r.ok, true, 'потолок — НЕ отказ разбора: ' + (r.reason || ''));
  assert.equal(r.xp.applied, 0, 'потолок практикой: applied 0');
  assert.equal(r.xp.reason, 'потолок практикой', 'reason ДОСЛОВНО');
  assert.equal(r.xp.level, 10, 'уровень не растёт');
  assert.equal(r.xp.leveledUp, false);
  assert.equal(p.craftXp['кузнечное_дело'], 165, 'копилка не растёт');
  assert.equal(C.craftLevel(p, 'кузнечное_дело'), 10);
  assert.equal(I.totalQty(p, 'iron_sword'), 0, 'предмет снят');
  assert.equal(I.totalQty(p, 'wood_sword'), 1, 'части возвращены (ролл 0.1)');
  assert.equal(I.totalQty(p, 'sulfur'), 2, 'полное количество позиции');
});

// --- D7: атомарность — ёмкость (худший случай: ВСЕ части) ---

test('D7: атомарность — ёмкость худшего случая: полон → «нет свободных слотов инвентаря», перевес → «слишком тяжело (лимит веса)»; предмет цел, 0 XP, 0 роллов', () => {
  const C = loadCraft();
  // Полон (20/20): 19 стопок серы + iron_sword. Худший случай (все
  // части на ТЕКУЩЕМ инвентаре, предмет ещё не снят): wood_sword —
  // новый слот → 21 > 20.
  const p = createCharacter();
  p.secondary.forge = 1;
  p.inventory = {
    slots: [
      ...Array.from({ length: 19 }, () => ({ id: 'sulfur', qty: 1 })),
      { id: 'iron_sword', qty: 1 },
    ],
    quick: [null, null, null],
  };
  const before = JSON.stringify({ inv: p.inventory, craftXp: p.craftXp });
  let rngCalls = 0;
  const r = C.disassemble(p, 'iron_sword', {
    rng: () => { rngCalls += 1; return 0.1; },
  });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'нет свободных слотов инвентаря',
    'wording items.js ДОСЛОВНО; факт: ' + (r.reason || ''));
  assert.equal(C.canDisassemble(p, 'iron_sword').reason,
    'нет свободных слотов инвентаря', 'зеркало: та же причина');
  assert.equal(JSON.stringify({ inv: p.inventory, craftXp: p.craftXp }),
    before, 'предмет и quick бит-в-бит нетронуты (атомарность)');
  assert.equal(I.totalQty(p, 'iron_sword'), 1, 'предмет цел');
  assert.equal(p.craftXp, undefined, 'опыт не начислен');
  assert.equal(rngCalls, 0, 'роллы не потрачены (отказ до роллов)');
  // Перевес: 28 руды (28 кг) + меч (1.5 кг) = 29.5; худший случай
  // + дерево (1) + сера (0.4) = 30.9 > 30.
  const p2 = createCharacter();
  p2.secondary.forge = 1;
  give(p2, 'iron_ore', 28);
  give(p2, 'iron_sword', 1);
  const before2 = JSON.stringify(p2.inventory);
  const r2 = C.disassemble(p2, 'iron_sword', { rng: NO_BACK });
  assert.equal(r2.ok, false);
  assert.equal(r2.reason, 'слишком тяжело (лимит веса)',
    'wording items.js ДОСЛОВНО; факт: ' + (r2.reason || ''));
  assert.equal(C.canDisassemble(p2, 'iron_sword').reason,
    'слишком тяжело (лимит веса)', 'зеркало: та же причина');
  assert.equal(JSON.stringify(p2.inventory), before2,
    'инвентарь бит-в-бит нетронут');
  assert.equal(I.totalQty(p2, 'iron_sword'), 1, 'предмет цел');
  assert.equal(p2.craftXp, undefined, 'опыт не начислен');
});

// --- D8: зеркало canDisassemble/disassemble ---

test('D8: canDisassemble — зеркало: те же причины, 0 rng, 0 мутаций; «голый» персонаж — c.craft/c.craftXp не создаются', () => {
  const C = loadCraft();
  const scenarios = [
    ['успех', (h) => { h.secondary.forge = 1; give(h, 'iron_sword', 1); },
      'iron_sword'],
    ['нет рецепта', () => {}, 'sulfur'],
    ['нет предмета', (h) => give(h, 'sulfur', 1), 'iron_sword'],
    ['мёртвый', (h) => { give(h, 'iron_sword', 1); h.alive = false; },
      'iron_sword'],
    ['полон', (h) => {
      h.secondary.forge = 1;
      h.inventory = {
        slots: [
          ...Array.from({ length: 19 }, () => ({ id: 'sulfur', qty: 1 })),
          { id: 'iron_sword', qty: 1 },
        ],
        quick: [null, null, null],
      };
    }, 'iron_sword'],
    ['перевес', (h) => {
      h.secondary.forge = 1;
      give(h, 'iron_ore', 28);
      give(h, 'iron_sword', 1);
    }, 'iron_sword'],
  ];
  for (const [label, prep, id = 'iron_sword'] of scenarios) {
    const p = createCharacter();
    prep(p);
    let rngCalls = 0;
    const snap = () => JSON.stringify({
      inv: p.inventory, eq: p.equipment, ebonus: p.equipmentBonus,
      craft: p.craft, craftXp: p.craftXp, gold: p.gold,
    });
    const before = snap();
    const mirror = C.canDisassemble(p, id, {
      rng: () => { rngCalls += 1; return 0.999; },
    });
    assert.equal(rngCalls, 0, label + ': canDisassemble не вызывает rng');
    assert.equal(snap(), before, label + ': canDisassemble без мутаций');
    const core = C.disassemble(p, id, { rng: () => 0.999 });
    assert.equal(mirror.ok, core.ok, label + ': расхождение ok');
    if (!core.ok) {
      assert.equal(mirror.reason, core.reason,
        label + ': расхождение reason (mirror '
        + (mirror.reason || '') + ' / core ' + (core.reason || '') + ')');
    }
  }
  // «Голый» персонаж: c.craft/c.craftXp НЕ создаются.
  const bare = {
    primary: {
      strength: 1, dexterity: 1, constitution: 1,
      intelligence: 1, wisdom: 1, charisma: 1,
    },
    secondary: {},
  };
  C.canDisassemble(bare, 'sulfur');
  C.canDisassemble(bare, 'iron_sword');
  C.disassemble(bare, 'sulfur', { rng: NO_BACK });
  C.disassemble(bare, 'iron_sword', { rng: NO_BACK });
  assert.equal(bare.craft, undefined, 'c.craft не создаётся');
  assert.equal(bare.craftXp, undefined, 'c.craftXp не создаётся');
});

// --- D9..D11: отказы (порядок: рецепт → alive → предмет → ёмкость) ---

test('D9: мёртвый персонаж — «персонаж погиб» (проверка рецепта ПЕРВАЯ, до alive и hasItem)', () => {
  const C = loadCraft();
  const p = createCharacter();
  give(p, 'iron_sword', 1);
  p.alive = false;
  assert.equal(C.canDisassemble(p, 'iron_sword').reason, 'персонаж погиб');
  const r = C.disassemble(p, 'iron_sword', { rng: seqRng([0.1, 0.1]) });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'персонаж погиб',
    'pre-check ДО всех мутаций (паттерн craft 000046)');
  assert.equal(I.totalQty(p, 'iron_sword'), 1, 'предмет не снят');
  assert.equal(p.craft, undefined, 'c.craft не создаётся');
  assert.equal(p.craftXp, undefined, 'c.craftXp не создаётся');
  // Рецепт — ПЕРВАЯ проверка: мёртвый + нет рецепта → причина
  // рецепта, не «персонаж погиб».
  const p2 = createCharacter();
  p2.alive = false;
  assert.equal(C.disassemble(p2, 'sulfur', { rng: NO_BACK }).reason,
    'предмет нельзя разобрать', 'порядок: рецепт до alive');
});

test('D10: предмета нет в инвентаре — «нет предмета в инвентаре»', () => {
  const C = loadCraft();
  const p = createCharacter();
  p.secondary.forge = 1;
  assert.equal(C.canDisassemble(p, 'iron_sword').reason,
    'нет предмета в инвентаре');
  const r = C.disassemble(p, 'iron_sword', { rng: NO_BACK });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'нет предмета в инвентаре');
  assert.equal(p.craft, undefined, 'c.craft не создаётся');
  assert.equal(p.craftXp, undefined, 'c.craftXp не создаётся');
});

test('D11: нет канонического рецепта — «предмет нельзя разобрать» (sulfur, unknown id)', () => {
  const C = loadCraft();
  const p = createCharacter();
  give(p, 'sulfur', 5);
  for (const id of ['sulfur', 'nope']) {
    assert.equal(C.canDisassemble(p, id).reason, 'предмет нельзя разобрать',
      id);
    const r = C.disassemble(p, id, { rng: NO_BACK });
    assert.equal(r.ok, false, id);
    assert.equal(r.reason, 'предмет нельзя разобрать', id);
  }
  assert.equal(I.totalQty(p, 'sulfur'), 5, 'при отказе ничего не потрачено');
});

// --- D12: без гейта «вид не изучен» ---

test('D12: без гейта «вид не изучен» (в отличие от craft) — первый разбор делает вид изученным (D0b)', () => {
  const C = loadCraft();
  const p = createCharacter();
  p.secondary.forge = 1; // связанный навык ≥ 1 (потолок ≥ 2)
  // Вид НЕ изучен: нет craftTypes/craft/craftXp.
  assert.equal(C.isTypeLearned(p, 'кузнечное_дело'), false,
    'фикстура: вид не изучен');
  give(p, 'iron_sword', 1); // лутаный предмет (не крафт)
  // Контраст: craft() на этом герое — «вид не изучен».
  assert.equal(C.canCraft(p, 'wood_sword', { building: 5 }).reason,
    'вид не изучен', 'craft гейтом ограничен (контраст)');
  const r = C.disassemble(p, 'iron_sword', { rng: NO_BACK });
  assert.equal(r.ok, true,
    'разборка гейтом «вид не изучен» НЕ ограничена: '
    + (r.reason || ''));
  assert.equal(r.xp.applied, 12, '10 + уровень рецепта (2)');
  assert.equal(p.craftXp['кузнечное_дело'], 12, 'копилка создана');
  assert.equal(C.isTypeLearned(p, 'кузнечное_дело'), true,
    'D0b: прогресс = знание');
});

// --- D13: message и shape успеха ---

test('D13: message — ТОЧНЫЕ строки (обратное — «ничего не вернулось») + shape успеха {ok, item, type, returned, lost, xp, message}', () => {
  const C = loadCraft();
  // Обе части вернулись; стопка ×3 → снят 1, осталось 2.
  const p = createCharacter();
  p.secondary.forge = 1;
  give(p, 'iron_sword', 3);
  const r = C.disassemble(p, 'iron_sword', { rng: seqRng([0.1, 0.1]) });
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.item, 'iron_sword', 'r.item — id разобранного предмета');
  assert.equal(r.type, 'кузнечное_дело', 'r.type — тип канонического рецепта');
  assert.equal(I.totalQty(p, 'iron_sword'), 2, 'стопка ×3 → снят 1, осталось 2');
  assert.deepEqual(r.returned, [
    { id: 'wood_sword', qty: 1 },
    { id: 'sulfur', qty: 2 },
  ], 'returned — порядок `исходники`, ПОЛНЫЕ количества позиции');
  assert.deepEqual(r.lost, [], 'lost пусто — всё вернулось');
  assert.ok(r.xp && typeof r.xp.applied === 'number'
    && typeof r.xp.level === 'number' && typeof r.xp.leveledUp === 'boolean'
    && typeof r.xp.total === 'number', 'shape xp {applied,level,leveledUp,total}');
  assert.equal(r.message,
    'Разобрано: ' + nm('iron_sword') + ' — возвращено: '
    + nm('wood_sword') + ' ×1, ' + nm('sulfur') + ' ×2',
    'message ДОСЛОВНО (список — порядок вернувшихся, имена I.getItem); '
    + 'факт: ' + (r.message || ''));
  assert.ok(!r.message.includes(String(r.xp.applied)),
    'XP в message НЕ появляется (паритет craft)');
  // Ничего не вернулось.
  const p2 = createCharacter();
  p2.secondary.forge = 1;
  give(p2, 'iron_sword', 1);
  const r2 = C.disassemble(p2, 'iron_sword', { rng: NO_BACK });
  assert.equal(r2.ok, true, r2.reason);
  assert.deepEqual(r2.returned, [], 'returned пусто');
  assert.deepEqual(r2.lost, [
    { id: 'wood_sword', qty: 1 },
    { id: 'sulfur', qty: 2 },
  ], 'lost — ВСЕ позиции (полные количества)');
  assert.equal(r2.message,
    'Разобрано: ' + nm('iron_sword') + ' — ничего не вернулось',
    'message ДОСЛОВНО (обратный вариант); факт: ' + (r2.message || ''));
});

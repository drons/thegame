// Задача 000328.02: руны — МЕХАНИКА (нанесение/стирание на камне 40,
// лимит по редкости, хранение на ИНСТАНСЕ, применение эффектов через
// derived-путь). Каталог/зеркало/спек — 000328.01 (регресс —
// tests/runes-catalog-000328.01.test.js).
//
// Контракт — memory/000328-runes.md §9–§14 (лимиты, стоимость, камень,
// инстанс, применение, сейв). КРАСНЫЕ тесты (TDD): написаны ДО
// реализации; каждый падает осмысленным ассертом с маркером «RED:»,
// а не крахом загрузки.
//
// Зафиксированные решения (детали — memory):
//   * камень 40: ЭФФЕКТЫ-'40_inscribe' «Нанести руне» → «Нанести руну»
//     и '40_erase' «Стереть руну» (записи building-effects.js); НОВЫХ
//     объектов карты НЕТ; мутации мира — спец-модуль
//     src/building-effect-runecraft.js (registerSpecial, 000128 §2.3);
//   * нанесение БЕЗ рандола игрока: выбор руны детерминирован
//     (tile, day)-сидом RUNE_CRAFT_SEED (паттерн 000074/000133),
//     стоимость ⇒ успех (без ролла); раз-в-день на НОВЫХ действиях
//     НЕТ (гейт — золото), '40'/'40_spell' — как были;
//   * стоимость: inscriptionCost = ceil(база(редкость) × (1+шаг_слота·n)
//     × скид(«Рунопись»)); eraseCost — то же × стирание_доля ⇒
//     стирание ВСЕГДА < нанесения (свип M4);
//   * лимит по редкости: common 1 / rare 2 / epic 3 / legendary 4 /
//     impossible 5 (I.RUNE_LIMITS); предмет БЕЗ rarity — отклонение;
//   * хранение: runes:[runeId] на инстансе (inv.slots) + копия в
//     equipmentBonus[slot] (паттерн 000046); мерж стаков по
//     (id, bonus, runes); сейв v1 НЕ меняется (000298);
//   * применение: ТОЛЬКО на ЭКИПИРОВАННЫЙ предмет, точка слияния —
//     src/sheet.js derived() (skill-суммы — в affixSkills до base,
//     derived-суммы — после base × base.runePowerMult, целочисленные
//     цели округляются).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { SAVE_KEY } = require('../src/save.js');

const ROOT = path.join(__dirname, '..');

const I = require('../src/items.js');
const P = require('../src/player.js');
const PL = require('../src/perlin.js');
const RUNES = require('../src/runes-data.js').RUNES;

function loadBE() {
  return require('../src/building-effects.js');
}

// Game в момент ВЫЗОВА (ленивый захват lazyGame() в building-effects.js)
// — паттерн withGame tests/building-effects.test.js:966.
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

function mkHero(over = {}) {
  return Object.assign(P.createCharacter(), over);
}

const clone = (v) => JSON.parse(JSON.stringify(v));

// Минимальный fake-Game для apply-функций камня (lazyGame читает
// globalThis.Game в момент вызова; apply требует hash2/getItem/
// RunesData/RUNE_LIMITS/EQUIP_PHYS_SLOTS).
function applyGame() {
  return {
    hash2: PL.hash2,
    getItem: I.getItem,
    RunesData: { RUNES },
    RUNE_LIMITS: I.RUNE_LIMITS,
    EQUIP_PHYS_SLOTS: I.EQUIP_PHYS_SLOTS,
  };
}

// Герой-носитель: стальной косой (rare, right_hand) в экипировке,
// «Рунопись» 2, золото 500.
function runeBearer(ebOverride) {
  const hero = mkHero({ gold: 500 });
  hero.secondary = Object.assign({}, hero.secondary, { runes: 2 });
  hero.equipment = {};
  hero.equipment.right_hand = 'steel_scyte';
  hero.equipmentBonus = ebOverride || {};
  return hero;
}

function inscribeState(over = {}) {
  return Object.assign({
    day: 1,
    tile: { x: -25, y: 34 },
    hero: runeBearer(),
    save: {},
    catalog: require('../src/buildings.js').getBuilding(40),
  }, over);
}

// --- M1: реестр, экспортируемые символы, каталог камня, daily-лимиты ---

test('M1. реестр/экспорты/каталог: 40_inscribe/40_erase, формулы, сид, RUNE_LIMITS, hasDailyLimit', () => {
  const BE = loadBE();
  const rec1 = BE.EFFECTS['40_inscribe'];
  assert.ok(rec1, "RED: EFFECTS['40_inscribe'] нет");
  assert.equal(rec1.имя, 'Нанести руну',
    'имя «Нанести руну»; факт: ' + (rec1 && rec1.имя));
  assert.equal(typeof rec1.apply, 'function', '40_inscribe: apply(st)');
  const rec2 = BE.EFFECTS['40_erase'];
  assert.ok(rec2, "RED: EFFECTS['40_erase'] нет");
  assert.equal(rec2.имя, 'Стереть руну',
    'имя «Стереть руну»; факт: ' + (rec2 && rec2.имя));
  assert.equal(typeof rec2.apply, 'function', '40_erase: apply(st)');
  // Экспорты чистых формул и сида (golden-пины — M4/M6).
  for (const fn of ['inscriptionCost', 'eraseCost',
    'applyRuneInscribe', 'applyRuneErase']) {
    assert.equal(typeof BE[fn], 'function', 'RED: BE.' + fn + ' нет');
  }
  assert.equal(BE.RUNE_CRAFT_SEED, 0x52434654,
    'RUNE_CRAFT_SEED = ASCII «RCFT» (hex-пин, паттерн A47/R1)');
  // Ядро предметов: лимиты и точка записи.
  assert.deepEqual(I.RUNE_LIMITS,
    { common: 1, rare: 2, epic: 3, legendary: 4, impossible: 5 },
    'RED: I.RUNE_LIMITS — таблица редкость → максимум рун');
  assert.equal(typeof I.equipmentRunes, 'function',
    'RED: I.equipmentRunes нет');
  assert.equal(typeof I.setItemRunes, 'function', 'RED: I.setItemRunes нет');
  // Каталог 40: четыре действия, порядок существующих НЕ сдвинут.
  const B = require('../src/buildings.js');
  const c40 = B.getBuilding(40);
  assert.deepEqual(c40.особые_параметры.эффекты,
    ['40', '40_spell', '40_inscribe', '40_erase'],
    '40: эффекты — новые КОНЦОМ; факт: '
    + JSON.stringify(c40.особые_параметры.эффекты));
  assert.deepEqual(c40.особые_параметры.раз_в_день,
    { 40: true, '40_spell': true },
    '40: раз_в_день — пер-эффектный объект (новые — БЕЗ лимита); '
    + 'факт: ' + JSON.stringify(c40.особые_параметры.раз_в_день));
  assert.equal(BE.hasDailyLimit(c40, '40'), true, '40: «40» — раз в день');
  assert.equal(BE.hasDailyLimit(c40, '40_spell'), true,
    '40: «40_spell» — раз в день');
  assert.equal(BE.hasDailyLimit(c40, '40_inscribe'), false,
    'RED: «40_inscribe» — БЕЗ дневного лимита (гейт — золото)');
  assert.equal(BE.hasDailyLimit(c40, '40_erase'), false,
    'RED: «40_erase» — БЕЗ дневного лимита');
});

// --- M2: нанесение — успех/чистота/отказы ---

test('M2. нанесение: успех (слот/руна/стоимость/точный message), ЧИСТО; отказы — золото и «Рунопись»', () => {
  const BE = loadBE();
  assert.equal(typeof BE.applyRuneInscribe, 'function',
    'RED: BE.applyRuneInscribe нет');
  const st = inscribeState();
  const before = clone(st);
  const r = withGame(applyGame(), () => BE.applyRuneInscribe(st));
  assert.equal(r.ok, true, 'RED: нанесение не ok: ' + JSON.stringify(r));
  assert.equal(r.success, true, 'успех без ролла (стоимость ⇒ успех)');
  assert.equal(r.slot, 'right_hand', 'цель — right_hand');
  assert.equal(r.itemId, 'steel_scyte', 'предмет цели');
  assert.ok(RUNES.some((x) => x.id === r.runeId),
    'runeId ∈ каталогу: ' + r.runeId);
  const cost = BE.inscriptionCost(
    st.catalog.особые_параметры.эффект.нанесение, 'rare', 0, 2);
  assert.equal(r.cost, cost, 'cost = inscriptionCost(rare, n=0, R=2)');
  const rune = RUNES.find((x) => x.id === r.runeId);
  assert.equal(r.message,
    'Нанесено: «' + rune.название + '» на «Стальная коса» (-' + cost + ' з.)',
    'message побайтово; факт: ' + r.message);
  assert.deepEqual(st, before, 'apply ЧИСТО (state бит-в-бит)');
  // Отказ: мало золота — причина в логе, 0 мутаций.
  const poor = inscribeState();
  poor.hero.gold = 1;
  const poorBefore = clone(poor);
  const rp = withGame(applyGame(), () => BE.applyRuneInscribe(poor));
  assert.equal(rp.ok, false, 'мало золота — ok:false');
  assert.match(rp.message, /^Мало золота: нанесение руны стоит \d+ з\.$/,
    'точная причина стоимости; факт: ' + rp.message);
  assert.deepEqual(poor, poorBefore, 'отказ — 0 мутаций state');
  // Отказ: навык «Рунопись» 0.
  const unskilled = inscribeState();
  unskilled.hero.secondary.runes = 0;
  const ru = withGame(applyGame(), () => BE.applyRuneInscribe(unskilled));
  assert.equal(ru.ok, false, 'runes=0 — ok:false');
  assert.match(ru.message, /«Рунопись»/,
    'причина — навык; факт: ' + ru.message);
  assert.deepEqual(unskilled.hero.secondary.runes, 0, 'skill-гейт — 0 мутаций');
});

// --- M3: лимит/редкость — таблица и предмет без rarity ---

test('M3. лимиты: RUNE_LIMITS ≡ ITEM_RARITIES (sweep); предмет без rarity — отказ и санация', () => {
  assert.ok(I.RUNE_LIMITS, 'RED: I.RUNE_LIMITS нет');
  assert.deepEqual(Object.keys(I.RUNE_LIMITS).sort(),
    Object.values(I.ITEM_RARITIES).sort(),
    'ключи RUNE_LIMITS ≡ enum редкостей items.js');
  const BE = loadBE();
  assert.equal(typeof BE.applyRuneInscribe, 'function',
    'RED: BE.applyRuneInscribe нет');
  // legacy wood_sword — БЕЗ rarity: нанесение отказывает с причиной.
  const st = inscribeState();
  st.hero.equipment.right_hand = 'wood_sword';
  const r = withGame(applyGame(), () => BE.applyRuneInscribe(st));
  assert.equal(r.ok, false, 'RED: wood_sword без rarity — отказ');
  assert.match(r.message, /редкость/,
    'причина — редкость предмета; факт: ' + r.message);
  // sanitizeInventory сносит runes у записей без rarity.
  const inv = I.sanitizeInventory({
    slots: [{ id: 'wood_sword', qty: 1, runes: ['stone_hide'] }],
  });
  assert.equal(inv.slots.length, 1, 'запись жива');
  assert.equal('runes' in inv.slots[0], false,
    'RED: runes у предмета без rarity снесён');
});

// --- M4: (N+1)-я руна + свип формул стоимости ---

test('M4. (N+1)-я руна пропускается; свип inscriptionCost/eraseCost (5 редкостей × n × R)', () => {
  const BE = loadBE();
  const params = require('../src/buildings.js')
    .getBuilding(40).особые_параметры.эффект.нанесение;
  assert.ok(params, 'RED: каталог 40: эффект.нанесение нет');
  // Свип: erase < inscribe строго, монотонность, скид-кап, R=0 ≡ база.
  for (const rarity of Object.keys(I.RUNE_LIMITS)) {
    const limit = I.RUNE_LIMITS[rarity];
    for (let n = 0; n < limit; n++) {
      for (const R of [0, 5, 25, 40]) {
        const ins = BE.inscriptionCost(params, rarity, n, R);
        const era = BE.eraseCost(params, rarity, n, R);
        assert.ok(Number.isInteger(ins) && ins >= 1,
          rarity + ' n=' + n + ': ins — целое ≥1: ' + ins);
        assert.ok(Number.isInteger(era) && era >= 1,
          rarity + ' n=' + n + ': era — целое ≥1: ' + era);
        assert.ok(era < ins,
          'RED: стирание < нанесения (' + era + ' vs ' + ins + ')');
        const insUp = BE.inscriptionCost(params, rarity, n + 1, R);
        assert.ok(insUp >= ins, 'монотонность по n');
      }
      // монотонность по редкости (таблица возрастающая)
    }
    if (rarity !== 'common') {
      const order = ['common', 'rare', 'epic', 'legendary', 'impossible'];
      const prev = order[order.indexOf(rarity) - 1];
      assert.ok(BE.inscriptionCost(params, rarity, 0, 0)
        > BE.inscriptionCost(params, prev, 0, 0),
        'монотонность по редкости: ' + prev + ' < ' + rarity);
    }
  }
  // Скид-кап 0.5 на R≥25 (скид_ранг 0.02, скид_макс 0.5); R=0 ≡ база.
  assert.equal(BE.inscriptionCost(params, 'rare', 0, 40),
    BE.inscriptionCost(params, 'rare', 0, 25), 'кап скида (R≥25)');
  assert.equal(BE.inscriptionCost(params, 'rare', 0, 0),
    Math.ceil(50 * 1.0), 'R=0 ≡ база × (1+шаг·0) = 50');
  assert.equal(BE.inscriptionCost(params, 'rare', 1, 0),
    Math.ceil(50 * 1.5), '2-я руна ×1.5 = 75');
  // Мусор/неизвестная редкость → null (вызывающий → «недоступно»).
  assert.equal(BE.inscriptionCost(params, 'mythic', 0, 0), null,
    'неизвестная редкость → null');
  assert.equal(BE.inscriptionCost(null, 'rare', 0, 0), null,
    'нет params → null');
  assert.equal(BE.eraseCost(params, 'rare', -1, 0), null, 'n<0 → null');
  // (N+1)-я: common-предмет с 1 руной → слот полон → отказ-причина
  // (единственный экипированный).
  const st = inscribeState();
  st.hero.equipment = { head: 'straw_hat' }; // common, limit 1
  st.hero.equipmentBonus = { head: { runes: ['stone_hide'] } };
  const r = withGame(applyGame(), () => BE.applyRuneInscribe(st));
  assert.equal(r.ok, false,
    'RED: common с 1 руной — вторая отклонена (слот пропускается)');
  assert.match(r.message, /Все экипированные предметы заполнены/,
    'причина — лимит по редкости; факт: ' + r.message);
});

// --- M5: стирание LIFO ---

test('M5. стирание: снимается ПОСЛЕДНЯЯ (LIFO), cost=eraseCost, точный message; отказы', () => {
  const BE = loadBE();
  assert.equal(typeof BE.applyRuneErase, 'function', 'RED: BE.applyRuneErase нет');
  const params = require('../src/buildings.js')
    .getBuilding(40).особые_параметры.эффект.нанесение;
  assert.ok(params, 'RED: каталог 40: эффект.нанесение нет');
  const st = inscribeState({
    hero: runeBearer({
      right_hand: { runes: ['stone_hide', 'wall_plate'] },
    }),
  });
  const before = clone(st);
  const r = withGame(applyGame(), () => BE.applyRuneErase(st));
  assert.equal(r.ok, true, 'RED: стирание не ok: ' + JSON.stringify(r));
  assert.equal(r.runeId, 'wall_plate',
    'RED: LIFO — снимается ПОСЛЕДНЯЯ; факт: ' + r.runeId);
  assert.equal(r.slot, 'right_hand', 'слот цели');
  const cost = BE.eraseCost(params, 'rare', 1, 2);
  assert.equal(r.cost, cost, 'cost = eraseCost(rare, n=count−1, R)');
  const rune = RUNES.find((x) => x.id === 'wall_plate');
  assert.equal(r.message,
    'Стёрта: «' + rune.название + '» с «Стальная коса» (-' + cost + ' з.)',
    'message побайтово; факт: ' + r.message);
  assert.deepEqual(st, before, 'apply ЧИСТО');
  // Нет рун — отказ.
  const empty = inscribeState();
  const re = withGame(applyGame(), () => BE.applyRuneErase(empty));
  assert.equal(re.ok, false, 'без рун — ok:false');
  assert.match(re.message, /Нет предметов с рунами/,
    'причина — нет рун; факт: ' + re.message);
  // Мало золота — отказ с суммой.
  const poor = inscribeState({
    hero: Object.assign(runeBearer({
      right_hand: { runes: ['stone_hide'] },
    }), { gold: 1 }),
  });
  const poorBefore = clone(poor);
  const rp = withGame(applyGame(), () => BE.applyRuneErase(poor));
  assert.equal(rp.ok, false, 'мало золота — ok:false');
  assert.match(rp.message, /^Мало золота: стирание руны стоит \d+ з\.$/,
    'точная сумма; факт: ' + rp.message);
  assert.deepEqual(poor, poorBefore, '0 мутаций');
});

// --- M6: детерминизм (tile, day) + golden + каталог-драйвен ---

test('M6. детерминизм (tile, day): повтор — та же руна; golden (-25,34) день 1; день меняет выбор; каталог-драйвен', () => {
  const BE = loadBE();
  assert.equal(typeof BE.applyRuneInscribe, 'function',
    'RED: BE.applyRuneInscribe нет');
  const G = applyGame();
  const r1 = withGame(G, () => BE.applyRuneInscribe(inscribeState()));
  const r2 = withGame(G, () => BE.applyRuneInscribe(inscribeState()));
  assert.equal(r1.ok, true, 'RED: нанесение не ok');
  assert.equal(r2.runeId, r1.runeId, 'тот же (tile, day, state) — та же руна');
  assert.equal(r1.cost, r2.cost, 'та же стоимость');
  // Golden: (-25,34) день 1, steel_scyte rare без рун, Рунопись 2
  // (замер на зелёной сборке — паттерн golden-пика R4 000133).
  assert.equal(r1.runeId, GOLDEN_RUNE_MINUS25_34_DAY1,
    'golden runeId для (-25,34) day 1; факт: ' + r1.runeId);
  assert.equal(GOLDEN_RUNE_MINUS25_34_DAY1,
    RUNES[PL.hash2(-25, 34, BE.RUNE_CRAFT_SEED ^ 1) % RUNES.length].id,
    'golden ≡ формула hash2(x,y,RUNE_CRAFT_SEED^day) % каталог');
  // Смена дня — свип: хотя бы 2 различных руны на горизонте 12 дней.
  const seen = new Set();
  for (let day = 1; day <= 12; day++) {
    const rd = withGame(G, () =>
      BE.applyRuneInscribe(inscribeState({ day })));
    assert.equal(rd.ok, true, 'день ' + day + ' — успех');
    seen.add(rd.runeId);
  }
  assert.ok(seen.size >= 2,
    'RED: разные дни — разный выбор (уникальных: ' + seen.size + ')');
  // Состояние-зависимость: руна уже на предмете → тот же хеш даёт
  // ДРУГУЮ (кандидаты минус нанесённые).
  const stOwned = inscribeState({
    hero: runeBearer({ right_hand: { runes: [GOLDEN_RUNE_MINUS25_34_DAY1] } }),
  });
  const ro = withGame(G, () => BE.applyRuneInscribe(stOwned));
  assert.equal(ro.ok, true, 'с 1 руной — успех (rare limit 2)');
  assert.notEqual(ro.runeId, GOLDEN_RUNE_MINUS25_34_DAY1,
    'нанесённая руна исключена из кандидатов');
  // Каталог-драйвен: мусорный params → «недоступно» (не хардкод).
  const stBad = inscribeState();
  stBad.catalog = {
    id: 40,
    особые_параметры: { эффект: { нанесение: { стоимость: 'нет' } } },
  };
  const rb = withGame(G, () => BE.applyRuneInscribe(stBad));
  assert.deepEqual(rb, { ok: false, message: 'недоступно' },
    'RED: мусор нанесение → «недоступно»; факт: ' + JSON.stringify(rb));
});

// Golden-замер (заполняется на первой зелёной сборке; M6 сверяет его
// с формулой hash2 — рассогласование красит оба).
const GOLDEN_RUNE_MINUS25_34_DAY1 = 'sharper_brew';

// --- M7: хранение на инстансе и санация инвентаря ---

test('M7. sanitizeInventory: absent → без ключа; unknown/дубли/не-массив/сверх лимита — санация; мерж — третья ось runes', () => {
  // absent → byte-identical legacy-форма.
  const plain = I.sanitizeInventory({ slots: [{ id: 'steel_scyte', qty: 1 }] });
  assert.deepEqual(plain.slots, [{ id: 'steel_scyte', qty: 1 }],
    'absent — ключа нет');
  const inv = I.sanitizeInventory({
    slots: [
      // редкая запись: неизвестный id + дубль (канон — порядок
      // первого вхождения: ['wall_plate','stone_hide'])
      { id: 'steel_scyte', qty: 1,
        runes: ['wall_plate', 'нет_такой', 'stone_hide', 'wall_plate'] },
      // мерж: тот же id/bonus/тот же канон рун — в одну стопку
      { id: 'steel_scyte', qty: 2,
        runes: ['wall_plate', 'stone_hide'] },
      // НЕ мерж: другие руны
      { id: 'steel_scyte', qty: 1, runes: ['deep_spring'] },
      // не-массив → снос
      { id: 'steel_scyte', qty: 1, runes: 'stone_hide' },
      // common limit 1 → кап по первому вхождению
      { id: 'straw_hat', qty: 1, runes: ['stone_hide', 'deep_spring'] },
      // элементы не-строки — снос; пусто → без ключа
      { id: 'copper_band', qty: 1, runes: [7, null] },
    ],
  });
  const byRunes = (id) => inv.slots.filter((e) => e.id === id);
  const scy = byRunes('steel_scyte');
  assert.equal(scy.length, 3,
    'RED: мерж по (id, runes): 2+1+1+1 → 3 слота; факт: '
    + JSON.stringify(scy));
  assert.deepEqual(scy.find((e) => e.qty === 3).runes,
    ['wall_plate', 'stone_hide'],
    'мерж равных; дубли — первое вхождение, порядок');
  assert.ok(scy.some((e) => e.qty === 1
    && JSON.stringify(e.runes) === JSON.stringify(['deep_spring'])),
    'ru≠ — отдельный слот');
  assert.ok(scy.some((e) => e.qty === 1 && !('runes' in e)),
    'не-массив runes → снос ключа');
  const hat = byRunes('straw_hat')[0];
  assert.deepEqual(hat.runes, ['stone_hide'],
    'RED: common — кап лимита (2 → 1)');
  assert.equal('runes' in byRunes('copper_band')[0], false,
    'все элементы мусор → ключа нет');
  // addItem — 5-й аргумент; не льётся в простую стопку.
  const hero = mkHero();
  assert.equal(I.addItem(hero, 'steel_scyte', 1, undefined,
    ['stone_hide']).ok, true, 'RED: addItem runes-аргумент');
  assert.equal(I.addItem(hero, 'steel_scyte', 1).ok, true,
    'обычная копия');
  assert.equal(I.slotCount(hero), 2, 'runes-копия ≠ простая стопка');
  assert.deepEqual(hero.inventory.slots[0].runes, ['stone_hide'],
    'runes на записи');
  // addItem без rarity-предмета: runes отбрасываются (не отказ).
  assert.equal(I.addItem(hero, 'wood_sword', 1, undefined,
    ['stone_hide']).ok, true, 'wood_sword — ок без рун');
  const wood = hero.inventory.slots.find((e) => e.id === 'wood_sword');
  assert.equal('runes' in wood, false, 'без rarity — runes не хранятся');
  // Деградация: каталог рун недоступен (vm без RunesData) — снос.
  const code = fs.readFileSync(path.join(ROOT, 'src', 'items.js'), 'utf8');
  const itemsData = fs.readFileSync(
    path.join(ROOT, 'src', 'items-data.js'), 'utf8');
  const sandbox = { console: { error: () => {}, warn: () => {}, log: () => {} },
    require: undefined };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(
    path.join(ROOT, 'src', 'skills-data.js'), 'utf8'), sandbox,
  { filename: 'skills-data.js' });
  vm.runInContext(itemsData, sandbox, { filename: 'items-data.js' });
  sandbox.Game.SECONDARY_SKILLS = sandbox.Game.SkillsData.SECONDARY_SKILLS;
  vm.runInContext(code, sandbox, { filename: 'items.js' });
  const vi = sandbox.Game.sanitizeInventory({
    slots: [{ id: 'steel_scyte', qty: 1, runes: ['stone_hide'] }],
  });
  assert.equal('runes' in vi.slots[0], false,
    'RED: без каталога рун — снос ключа (000053)');
});

// --- M8: канон equipmentBonus (runes-слой) ---

test('M8. sanitizeEquipmentBonus: {runes}/{bonus,runes} — каноны; мусор runes — при живом бонусе; equipCtx — кап; 18 ключей', () => {
  const SLOTS = I.EQUIP_PHYS_SLOTS;
  const eb = I.sanitizeEquipmentBonus({
    right_hand: { damage: 2, runes: ['stone_hide', 'нет_такой', 'stone_hide'] },
    torso: { runes: ['wall_plate'] },
    neck: { armor: 1, runes: ['глубокая', 'deep_spring'] },
    ears: { damage: 0, runes: ['stone_hide'] },
    head: { runes: [] },
  });
  assert.deepEqual(Object.keys(eb), SLOTS, '18 ключей EQUIP_PHYS_SLOTS');
  assert.deepEqual(eb.right_hand, { damage: 2, runes: ['stone_hide'] },
    'RED: бонус + очищенные runes (unknown/дубли снесены)');
  assert.deepEqual(eb.torso, { runes: ['wall_plate'] },
    'RED: runes без бонуса — легальный канон');
  assert.deepEqual(eb.neck, { armor: 1, runes: ['deep_spring'] },
    'мусор-элемент runes снесён, бонус жив');
  assert.equal(eb.ears, null,
    'мусор в бонусе (damage:0) → слот null как сегодня');
  assert.equal(eb.head, null, 'runes:[] → null');
  // equipCtx — каппа по лимиту редкости экипированного.
  const capped = I.sanitizeEquipmentBonus({
    right_hand: { runes: ['stone_hide', 'deep_spring', 'wall_plate'] },
  }, { right_hand: 'steel_scyte' }); // rare → limit 2
  assert.deepEqual(capped.right_hand,
    { runes: ['stone_hide', 'deep_spring'] },
    'RED: equipCtx — кап limit(rare)=2');
  const noRarity = I.sanitizeEquipmentBonus(
    { right_hand: { runes: ['stone_hide'] } },
    { right_hand: 'wood_sword' });
  assert.equal(noRarity.right_hand, null,
    'RED: equipCtx без rarity — руны снесены');
  // Без ctx — дедуп/известность БЕЗ каппы.
  const noCtx = I.sanitizeEquipmentBonus({
    right_hand: { runes: ['stone_hide', 'deep_spring', 'wall_plate'] },
  });
  assert.deepEqual(noCtx.right_hand.runes,
    ['stone_hide', 'deep_spring', 'wall_plate'], 'без ctx — без каппы');
  // Пины legacy-формы целы: пустой вход — 18 null.
  const empty = I.sanitizeEquipmentBonus(null);
  assert.equal(SLOTS.every((s) => empty[s] === null), true,
    'null → 18 null (регресс)');
});

// --- M9: сейв roundtrip (v1 без бампа) + equip/unequip-перенос ---

test('M9. сейв roundtrip: runes в equipmentBonus/inventory через JSON и санацию; equip↔unequip — руны ездят; v1 без бампа', () => {
  const hero = mkHero({ gold: 500 });
  hero.secondary = Object.assign({}, hero.secondary, { runes: 2 });
  assert.equal(I.addItem(hero, 'steel_scyte', 1, undefined,
    ['stone_hide', 'deep_spring']).ok, true, 'RED: addItem runes');
  assert.equal(I.equip(hero, 'steel_scyte').ok, true, 'экипировка');
  assert.ok(hero.equipmentBonus.right_hand,
    'RED: equip — в eb есть runes-слой');
  assert.deepEqual(hero.equipmentBonus.right_hand.runes,
    ['stone_hide', 'deep_spring'],
    'RED: equip — руны перешли в equipmentBonus');
  const dBefore = JSON.stringify(P.derived(hero));
  const snap = {
    hero: {
      inventory: clone(hero.inventory),
      equipment: clone(hero.equipment),
      equipmentBonus: clone(hero.equipmentBonus),
    },
  };
  const text = JSON.parse(JSON.stringify(snap));
  const inv = I.sanitizeInventory(text.hero.inventory,
    I.inventoryCapacity(hero));
  const eb = I.sanitizeEquipmentBonus(text.hero.equipmentBonus,
    text.hero.equipment);
  assert.deepEqual(eb.right_hand, { runes: ['stone_hide', 'deep_spring'] },
    'RED: roundtrip — eb.runes идентичны');
  const hero2 = mkHero();
  hero2.secondary = Object.assign({}, hero2.secondary, { runes: 2 });
  hero2.equipment = I.sanitizeEquipment(text.hero.equipment);
  hero2.equipmentBonus = eb;
  assert.equal(JSON.stringify(P.derived(hero2)), dBefore,
    'RED: derived после restore — идентичен');
  // unequip — руны ездят с копией назад.
  assert.equal(I.unequip(hero, 'right_hand').ok, true, 'снятие');
  const back = hero.inventory.slots.find((e) => e.id === 'steel_scyte');
  assert.deepEqual(back.runes, ['stone_hide', 'deep_spring'],
    'RED: unequip — руны вернулись на инстанс');
  assert.equal(hero.equipmentBonus.right_hand, null,
    'снятый слот — null');
  // Сейв v1: save.js НЕ читает/не пишет runes (версия не поднималась).
  const saveSrc = fs.readFileSync(path.join(ROOT, 'src', 'save.js'), 'utf8');
  assert.equal(saveSrc.includes('runes'), false,
    'save.js — 0 упоминаний runes (форма v1 не меняется, 000298)');
  // main.js — единственная точка equipCtx для eb-санации.
  const mainSrc = fs.readFileSync(path.join(ROOT, 'src', 'main.js'), 'utf8');
  assert.ok(mainSrc.includes(
    'G.sanitizeEquipmentBonus(d.hero.equipmentBonus, d.hero.equipment)'),
    'RED: main.js передаёт d.hero.equipment вторым аргументом');
});

// --- M10: derived-эффекты рун (scale × runePowerMult, округления) ---

function bearerWithRunes(runIds, secondaryOverride = {}) {
  const hero = mkHero();
  hero.secondary = Object.assign({}, hero.secondary, secondaryOverride);
  hero.equipment = {};
  hero.equipment.right_hand = 'steel_scyte';
  hero.equipmentBonus = { right_hand: { runes: runIds } };
  return hero;
}

test('M10. derived: armor/maxHP — целые после округления; rpm-масштаб (drunk_scribe); inventorySlots целое', () => {
  const base = P.derived(mkHero());
  const h1 = bearerWithRunes(['stone_hide', 'ox_strength']);
  const d1 = P.derived(h1);
  assert.equal(d1.armor, base.armor + 1,
    'RED: stone_hide — armor +round(1×1)=1; факт: ' + d1.armor);
  assert.equal(d1.maxHP, base.maxHP + 10,
    'RED: ox_strength — maxHP +10; факт: ' + d1.maxHP);
  // «Рунопись» 10 → runePowerMult 1.5 → armor round(1×1.5)=2,
  // slow_snail moveSpeedMult +round-НЕ-трогает (дробь 0.075).
  const h2 = bearerWithRunes(['stone_hide', 'slow_snail'], { runes: 10 });
  const d2 = P.derived(h2);
  assert.equal(d2.runePowerMult, 1 + 0.05 * 10, 'rpm = 1.5 (perLevel 0.05)');
  assert.equal(d2.armor, 0 + 2,
    'RED: armor base 0 (Голем 0) + round(1×1.5)=2; факт: ' + d2.armor);
  const d2base = P.derived(mkHero({
    secondary: Object.assign({}, mkHero().secondary, { runes: 10 }),
  }));
  assert.ok(Math.abs((d2.moveSpeedMult - d2base.moveSpeedMult) - 0.075) < 1e-9,
    'RED: slow_snail ×1.5 → +0.075 (без округления); факт: '
    + (d2.moveSpeedMult - d2base.moveSpeedMult));
  // endless_pocket: inventorySlots обязан остаться целым.
  const h3 = bearerWithRunes(['endless_pocket'], { runes: 3 });
  const d3 = P.derived(h3);
  const d3base = P.derived(mkHero({
    secondary: Object.assign({}, mkHero().secondary, { runes: 3 }),
  }));
  assert.ok(Number.isInteger(d3.inventorySlots),
    'RED: inventorySlots — целое (items.js inventoryCapacity!)');
  assert.equal(d3.inventorySlots, d3base.inventorySlots + 2,
    'endless_pocket ×rpm round(2×1.15)=2; факт: ' + d3.inventorySlots);
  // Незастывший набор: неизвестный stat не ломает derived.
  const fakeCat = [{ id: 'fake_rune', название: 'Ф', описание: 'О',
    эффект: { type: 'derived', stat: 'no_such_stat', amount: 5 } }];
  const hh = mkHero();
  hh.equipment = { right_hand: 'steel_scyte' };
  hh.equipmentBonus = { right_hand: { runes: ['fake_rune'] } };
  const gg = applyGame();
  gg.RunesData = { RUNES: RUNES.concat(fakeCat) };
  const dOk = withGame(gg, () => P.derived(hh));
  assert.ok(dOk && 'no_such_stat' in dOk === false,
    'неизвестный stat пропущен (defensive skip)');
});

// --- M11: skill-эффекты (pct-множитель) ---

test('M11. skill-руна: golem_touch ×(1+0.1) к per-уровневому эффекту «Голем»; freeCast не затронут', () => {
  // golem 10 / endurance 3 (perLevel 0.02/0.03): база round(25×1.29)=32,
  // со скидом руны round(25×1.31)=33 — округление РАЗЛИЧАЕТ формулы
  // (на golem 5 обе ветки дали бы 28 — ложная зелёная).
  const hero = bearerWithRunes(['golem_touch'], { golem: 10, endurance: 3 });
  const d = P.derived(hero);
  const baseForm = Math.round((20 + hero.primary.constitution * 5)
    * (1 + 0.03 * 3 + 0.02 * 10));
  // maxHP = round((20 + con×5) × (1 + pct(endurance) + pct(golem)×1.1))
  const S = (id) => hero.secondary[id] || 0;
  const sk = require('../src/skills-data.js').SECONDARY_SKILLS;
  const pg = sk.golem.effect.perLevel * S('golem');
  const pe = sk.endurance.effect.perLevel * S('endurance');
  const expected = Math.round((20 + hero.primary.constitution * 5)
    * (1 + pe + pg * (1 + 0.1)));
  assert.notEqual(expected, baseForm,
    'фикстура различима (иначе ассерд ложно-зелёный)');
  assert.equal(d.maxHP, expected,
    'RED: maxHP = base × (1+Σpct) со скидом руны; факт: ' + d.maxHP
    + ' vs ' + expected);
  const aff = I.equipmentAffixes(hero);
  assert.equal(aff.freeCast.size, 0, 'free_cast — не трогаем');
});

// --- M12: применение ТОЛЬКО на надетый предмет ---

test('M12. руны В ИНВЕНТАРЕ (не надеты) — derived бит-в-бит базовый', () => {
  assert.equal(typeof I.equipmentRunes, 'function',
    'RED: I.equipmentRunes нет');
  const hero = mkHero();
  const base = P.derived(hero);
  assert.equal(I.addItem(hero, 'steel_scyte', 1, undefined,
    ['stone_hide', 'ox_strength']).ok, true);
  assert.equal(I.equipmentRunes(hero), null,
    'equipmentRunes — только надетые (raw c.equipment)');
  assert.deepEqual(P.derived(hero), base,
    'RED: сток с рунами НЕ меняет носителя');
});

// --- M13: спец-модуль runecraft (node, явная регистрация на fake) ---

test('M13. building-effect-runecraft: register на чистый fake (2 id); ветки inscribe/erase — gold/канон/новый массив; деградации', () => {
  let RC = null;
  assert.doesNotThrow(
    () => { RC = require('../src/building-effect-runecraft.js'); },
    'RED: модуля спец-действия нет');
  assert.equal(typeof RC.handle, 'function', 'handle — экспорт');
  assert.equal(typeof RC.register, 'function', 'register(ctx) — экспорт');
  const reg = [];
  RC.register({
    buildingActions: {
      registerSpecial(id, fn) { reg.push([id, fn]); },
    },
  });
  assert.deepEqual(reg.map((p) => p[0]), ['40_inscribe', '40_erase'],
    'оба id: inscribe первым');
  assert.ok(reg.every((p) => p[1] === RC.handle), 'один хендлер на оба id');
  const game = { setItemRunes: I.setItemRunes };
  // inscribe-ветка: gold −cost, канон с НОВЫМ массивом.
  const hero = runeBearer({ right_hand: { runes: [] } });
  const curRef = hero.equipmentBonus.right_hand.runes;
  const okIn = RC.handle({
    hero, world: { game },
    r: { ok: true, success: true, inscribe: true, slot: 'right_hand',
      runeId: 'deep_spring', cost: 48 },
  });
  assert.deepEqual(okIn, { ok: true }, 'успех inscribe');
  assert.equal(hero.gold, 500 - 48, 'gold −cost');
  assert.deepEqual(hero.equipmentBonus.right_hand,
    { runes: ['deep_spring'] }, 'канон eb');
  assert.notEqual(hero.equipmentBonus.right_hand.runes, curRef,
    'RED: НОВЫЙ массив (снапшот-безопасность copyMercSheet)');
  // erase-ветка: LIFO, пусто → null.
  const hero2 = runeBearer({ right_hand: { runes: ['stone_hide'] } });
  const okEr = RC.handle({
    hero: hero2, world: { game },
    r: { ok: true, success: true, erase: true, slot: 'right_hand',
      runeId: 'stone_hide', cost: 24 },
  });
  assert.deepEqual(okEr, { ok: true }, 'успех erase');
  assert.equal(hero2.gold, 500 - 24, 'gold −eraseCost');
  assert.equal(hero2.equipmentBonus.right_hand, null,
    'последняя снята → слот null');
  // Отказы apply-результата и поломанного state.
  assert.equal(RC.handle({ hero: mkHero(), world: { game },
    r: { ok: false, message: 'x' } }).ok, false, '!r.ok → отказ');
  const hero3 = runeBearer();
  const g3 = hero3.gold;
  assert.equal(RC.handle({ hero: hero3, world: { game },
    r: { ok: true, success: true, inscribe: true, slot: 'right_hand',
      runeId: 'deep_spring' } }).ok, false, 'без cost → отказ');
  assert.equal(hero3.gold, g3, 'отказ — 0 мутаций золота');
  // Деградация: нет buildingActions — console.error, БЕЗ регистрации.
  const errs = [];
  const orig = console.error;
  console.error = (m) => errs.push(String(m));
  try {
    RC.register({});
  } finally {
    console.error = orig;
  }
  assert.equal(errs.length >= 1, true, 'деградация — console.error');
});

// --- Секция vm-e2e: полная цепочка index.html (паттерн B/R-секций
// tests/building-effects.test.js) ---

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CHAIN = Array.from(html.matchAll(/<script\s+src="([^"]+)"/g), (m) => m[1])
  .map((p) => p.replace(/^src\//, ''));
const NOW = 1000;

function makeGl() {
  const noop = () => {};
  const gl = {
    VERTEX_SHADER: 35633, FRAGMENT_SHADER: 35632,
    COMPILE_STATUS: 35713, LINK_STATUS: 35714,
    ARRAY_BUFFER: 34962, DYNAMIC_DRAW: 35048, FLOAT: 5126,
    COLOR_BUFFER_BIT: 1024, TRIANGLES: 4,
  };
  gl.createShader = () => ({});
  gl.shaderSource = noop;
  gl.compileShader = noop;
  gl.getShaderParameter = () => true;
  gl.getShaderInfoLog = () => '';
  gl.createProgram = () => ({});
  gl.attachShader = noop;
  gl.linkProgram = noop;
  gl.getProgramParameter = () => true;
  gl.getProgramInfoLog = () => '';
  gl.useProgram = noop;
  let attrib = 0;
  gl.getAttribLocation = () => attrib++;
  gl.getUniformLocation = () => ({});
  gl.enableVertexAttribArray = noop;
  gl.createBuffer = () => ({});
  gl.bindBuffer = noop;
  gl.bufferData = noop;
  gl.vertexAttribPointer = noop;
  gl.viewport = noop;
  gl.clearColor = noop;
  gl.clear = noop;
  gl.uniformMatrix4fv = noop;
  gl.drawArrays = noop;
  return gl;
}

function makeContext2d(el) {
  const calls = el.drawCalls = [];
  return new Proxy({}, {
    get: (t, k) => (k in t ? t[k] : (...args) => { calls.push([k, args]); }),
    set: (t, k, v) => { t[k] = v; return true; },
  });
}

function matchesSel(el, sel) {
  let rest = String(sel).trim();
  let tag = null;
  let cls = null;
  let attr = null;
  const bm = rest.match(/\[([^\]=]+)(?:="([^"]*)")?\]$/);
  if (bm) {
    attr = [bm[1], bm[2]];
    rest = rest.slice(0, bm.index);
  }
  const cm = rest.match(/\.([A-Za-z0-9_-]+)$/);
  if (cm) {
    cls = cm[1];
    rest = rest.slice(0, cm.index);
  }
  if (rest) tag = rest;
  if (tag && String(el.tagName || '').toLowerCase() !== tag.toLowerCase()) {
    return false;
  }
  if (cls &&
      !String(el.className || '').split(/\s+/).includes(cls)) {
    return false;
  }
  if (attr) {
    if (!attr[0].startsWith('data-')) return false;
    const v = el.dataset ? el.dataset[attr[0].slice(5)] : undefined;
    if (v === undefined) return false;
    return attr[1] === undefined ? true : String(v) === attr[1];
  }
  return true;
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
  const target = {
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
      const raw = ch && ch.__raw ? ch.__raw : ch;
      if (raw.parent) {
        raw.parent.children.splice(raw.parent.children.indexOf(raw), 1);
      }
      raw.parent = target;
      target.children.push(raw);
      return ch;
    },
    remove() {
      if (!target.parent) return;
      const i = target.parent.children.indexOf(target);
      if (i >= 0) target.parent.children.splice(i, 1);
      target.parent = null;
    },
    addEventListener(type, fn) {
      (target.listeners[type] || (target.listeners[type] = [])).push(fn);
    },
    removeEventListener(type, fn) {
      const a = target.listeners[type];
      if (!a) return;
      const i = a.indexOf(fn);
      if (i >= 0) a.splice(i, 1);
    },
    setAttribute(name, value) {
      if (name.startsWith('data-')) {
        target.dataset[name.slice(5)] = value;
      }
    },
    getContext(kind) {
      if (tag !== 'canvas') return null;
      return kind === 'webgl' ? makeGl() : makeContext2d(target);
    },
    getBoundingClientRect() { return { left: 0, top: 0 }; },
    blur() {},
    closest(sel) {
      let n = target;
      while (n) {
        if (matchesSel(n, sel)) return n;
        n = n.parent;
      }
      return null;
    },
    querySelector(sel) { return findAll(target, sel)[0] || null; },
    querySelectorAll(sel) { return findAll(target, sel); },
  };
  Object.defineProperty(target, 'textContent', {
    get() { return this._text; },
    set(v) {
      this._text = String(v);
      for (const ch of target.children) ch.parent = null;
      target.children.length = 0;
    },
  });
  target.__raw = target;
  return new Proxy(target, {
    get(t, k) {
      if (k in t) return t[k];
      return () => undefined;
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

function makeStorage(seed) {
  const m = new Map();
  if (seed != null) m.set(SAVE_KEY, JSON.stringify(seed));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

function seedSave(data) {
  return { version: 1, savedAt: new Date(0).toISOString(), data };
}

function bootSandbox(seed) {
  const winListeners = {};
  const raf = [];
  const errors = [];
  const gameCanvas = makeEl('canvas');
  const spriteCanvas = makeEl('canvas');
  const hud = makeEl('div');
  gameCanvas.getContext = (kind) => (kind === 'webgl'
    ? makeGl() : makeContext2d(gameCanvas));
  spriteCanvas.getContext = (kind) => (kind === '2d'
    ? makeContext2d(spriteCanvas) : null);
  const storage = makeStorage(seed);
  const body = makeEl('body');
  const document = {
    createElement: (tag) => makeEl(tag),
    getElementById: (id) => (
      id === 'game' ? gameCanvas
        : id === 'sprites' ? spriteCanvas
          : id === 'hud' ? hud
            : null),
    body,
    addEventListener() {},
    removeEventListener() {},
    querySelector: () => null,
    hidden: false,
  };
  const window = {
    innerWidth: 1280,
    innerHeight: 720,
    location: { search: '' },
    localStorage: storage,
    confirm: () => false,
    addEventListener: (t, f) => {
      const a = winListeners[t] || (winListeners[t] = []);
      if (!a.includes(f)) a.push(f);
    },
    removeEventListener: (t, f) => {
      const a = winListeners[t];
      if (!a) return;
      const i = a.indexOf(f);
      if (i >= 0) a.splice(i, 1);
    },
  };
  function Image() {
    const self = this;
    self.naturalWidth = 0;
    self.naturalHeight = 0;
    Object.defineProperty(self, 'src', {
      configurable: true,
      get() { return self.__src; },
      set(v) {
        self.__src = v;
        Promise.resolve().then(() => {
          if (v === 'assets/map.png') {
            if (typeof self.onerror === 'function') self.onerror();
          } else if (typeof self.onload === 'function') {
            self.onload();
          }
        });
      },
    });
  }
  const sandbox = {
    console: {
      warn: () => {},
      error: (m) => errors.push(String(m)),
      log: () => {},
    },
    document,
    window,
    Image,
    performance: { now: () => NOW },
    requestAnimationFrame: (fn) => { raf.push(fn); return raf.length; },
    setTimeout: () => 0,
    clearTimeout: () => {},
  };
  vm.createContext(sandbox);
  for (const f of CHAIN) {
    vm.runInContext(
      fs.readFileSync(path.join(ROOT, 'src', f), 'utf8'), sandbox,
      { filename: f });
  }
  return { sandbox, winListeners, raf, errors, storage, body, hud };
}

const drain = () => new Promise((r) => setImmediate(r));

async function boot(seed) {
  const h = bootSandbox(seed);
  await drain();
  await drain();
  await drain();
  return h;
}

function key(h, code, extra = {}) {
  const e = Object.assign({ code, preventDefault() {}, stopPropagation() {} },
    extra);
  for (const fn of (h.winListeners['keydown'] || []).slice()) fn(e);
  return e;
}

function frameAt(h, now) {
  h.raf[h.raf.length - 1](now);
}

function readSave(h) {
  const text = h.storage.getItem(SAVE_KEY);
  return text == null ? null : JSON.parse(text);
}

function findOverlay(h) {
  const all = findAll(h.body, '.combat-overlay');
  return all.find((o) => !String(o.className).includes('npc-overlay'))
    || null;
}

function findRow(overlay, id) {
  return findAll(overlay, '[data-buid]')
    .find((r) => r.dataset.buid === id) || null;
}

// e2e-герой на камне: золотой (-25,34), Рунопись 2, gold, стальная
// коса (rare) надета (pre-seed → sanitizeEquipment/Bonus при restore).
function e2eHero(overrides = {}) {
  const hero = Object.assign(P.createCharacter(), {
    gold: 500,
    secondary: Object.assign({}, P.createCharacter().secondary, { runes: 2 }),
    equipment: Object.assign({}, {
      head: null, ears: null, neck: null, torso: null, forearms: null,
      right_hand: 'steel_scyte', left_hand: null, palms: null, legs: null,
      feet: null,
      ring_left_1: null, ring_left_2: null, ring_left_3: null,
      ring_left_4: null, ring_right_1: null, ring_right_2: null,
      ring_right_3: null, ring_right_4: null,
    }, overrides.equipment || {}),
    equipmentBonus: overrides.equipmentBonus || {},
  });
  return hero;
}

test('M14. e2e: [E] на камне — 5 строк; Digit3 наносит (flash/золото/сейв/без daily-марки/повтор не disabled); Digit4 стирает', async () => {
  const h = await boot(seedSave({
    day: 1,
    position: { x: -25, y: 34 },
    hero: e2eHero(),
  }));
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет (новые теги чистые): ' + h.errors.join('; '));
  const gold0 = g.state.hero.gold;
  key(h, 'KeyE');
  assert.equal(G.buildingUI.isActive(), true, '[E] открывает оверлей');
  const ov = findOverlay(h);
  const rows = findAll(ov, '[data-buid]').map((r) => r.dataset.buid);
  assert.deepEqual(rows,
    ['40', '40_spell', '40_inscribe', '40_erase', 'craft'],
    'RED: строки камня — новые после 40_spell, «craft» хвостом; факт: '
    + JSON.stringify(rows));
  const BE = loadBE();
  const params = require('../src/buildings.js')
    .getBuilding(40).особые_параметры.эффект.нанесение;
  assert.ok(params, 'RED: каталог 40: эффект.нанесение нет');
  const insCost = BE.inscriptionCost(params, 'rare', 0, 2);
  assert.equal(findRow(ov, '40_inscribe').disabled, false,
    'inscribe доступно (нет daily)');
  key(h, 'Digit3');
  assert.equal(G.buildingUI.isActive(), false, 'оверлей закрылся');
  frameAt(h, NOW + 400);
  const hud1 = String(h.hud.textContent);
  assert.match(hud1, /Нанесено: «/,
    'RED: hudFlash успеха; факт: ' + hud1);
  assert.equal(g.state.hero.gold, gold0 - insCost, 'золото −inscriptionCost');
  const save1 = readSave(h);
  assert.ok(save1, 'saveNow после успеха');
  assert.equal(save1.data.hero.equipment.right_hand, 'steel_scyte',
    'экипировка восстановилась и сериализована');
  const inscribed = save1.data.hero.equipmentBonus.right_hand.runes;
  assert.deepEqual(inscribed, [GOLDEN_RUNE_MINUS25_34_DAY1],
    'RED: сейв — золотая руна на right_hand; факт: '
    + JSON.stringify(inscribed));
  assert.equal(save1.data.buildingOncePerDay
    ? save1.data.buildingOncePerDay['-25,34:40_inscribe'] : undefined,
  undefined, 'RED: ДНЕВНОЙ МАРКИ НЕТ (гейт — золото)');
  // Повтор в тот же день — строка НЕ disabled (лимитa нет).
  key(h, 'KeyE');
  assert.equal(findRow(findOverlay(h), '40_inscribe').disabled, false,
    'повтор в тот же день — доступен (без дневного лимита)');
  key(h, 'Escape');
});

test('M14b. e2e стирание: Digit4 — flash «Стёрта», золото −eraseCost, сейв без ключа runes', async () => {
  const h = await boot(seedSave({
    day: 1,
    position: { x: -25, y: 34 },
    hero: e2eHero({
      equipmentBonus: { right_hand: { runes: ['stone_hide'] } },
    }),
  }));
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  assert.equal(h.errors.length, 0, 'чистая загрузка');
  const ebLive = JSON.parse(JSON.stringify(g.state.hero.equipmentBonus));
  assert.deepEqual(ebLive.right_hand, { runes: ['stone_hide'] },
    'pre-seed руна прошла sanitize');
  assert.equal(Object.keys(ebLive).length, 18,
    'санация — полный набор слотов (18 ключей)');
  const BE = loadBE();
  const params = require('../src/buildings.js')
    .getBuilding(40).особые_параметры.эффект.нанесение;
  assert.ok(params, 'RED: каталог 40: эффект.нанесение нет');
  const eraCost = BE.eraseCost(params, 'rare', 0, 2);
  const gold0 = g.state.hero.gold;
  key(h, 'KeyE');
  key(h, 'Digit4');
  frameAt(h, NOW + 400);
  assert.match(String(h.hud.textContent), /Стёрта: «/,
    'RED: hudFlash стирания; факт: ' + String(h.hud.textContent));
  assert.equal(g.state.hero.gold, gold0 - eraCost, 'золото −eraseCost');
  const save1 = readSave(h);
  const eb = save1.data.hero.equipmentBonus.right_hand;
  assert.ok(eb == null || eb.runes == null || eb.runes.length === 0,
    'RED: сейв — руны сняты; факт: ' + JSON.stringify(eb));
});

// --- W: SPEC-тексты ---

test('W1. spec/runes.md — H2 «Нанесение и стирание рун»: камень, лимиты, стоимость, инстанс, сейв', () => {
  const src = fs.readFileSync(path.join(ROOT, 'spec', 'runes.md'), 'utf8');
  assert.ok(src.includes('## Нанесение и стирание рун'),
    'RED: H2 «Нанесение и стирание рун» нет');
  for (const ph of ['Нанести руну', 'Стереть руну', 'Рунический камень',
    'common', 'impossible', 'runePowerMult', 'редкость']) {
    assert.ok(src.includes(ph), 'фраза «' + ph + '» отсутствует');
  }
  assert.equal(src.includes('(v1)'), false, 'негатив-сканер: «(v1)»');
});

test('W2. spec/items.md — runes на инстансе в «Инвентарь» и «Снаряжение»', () => {
  const src = fs.readFileSync(path.join(ROOT, 'spec', 'items.md'), 'utf8');
  const h2 = (name) => {
    const i = src.indexOf('## ' + name + '\n');
    assert.notEqual(i, -1, 'H2 «' + name + '» нет');
    const j = src.indexOf('\n## ', i + 1);
    return src.slice(i, j === -1 ? src.length : j);
  };
  const inv = h2('Инвентарь');
  assert.ok(inv.includes('runes'),
    'RED: «Инвентарь» — буллет runes нет');
  const eq = h2('Снаряжение');
  assert.ok(eq.includes('runes'),
    'RED: «Снаряжение» — буллет runes нет');
});

// Задача 000347.01 (дочерняя 000347) — цена свитка заклинания растёт
// ×8^(уровень−1) заклинания (ТЗ tasks/pending/000347.01.md, контракт
// memory/000347-scroll-prices-magic.md).
//
// Контракт (резолвер spellScrollPriceMult в src/items.js, применён к
// БАЗЕ во всех четырёх ценовых точках цепочки 000346 — buyPrice/
// sellPrice и npcBuyPrice/npcSellPrice, включая ветку SELL_BASE_VALUE):
//   * kind !== 'spell_scroll' → ×1 (без обращения к каталогу);
//   * каталог Game.SpellsData.SPELLS_BY_ID читается ЛЕНИВО в момент
//     вызова (items.js грузится раньше spells-data.js — index.html
//     1327/1349; прецедент buildingsCatalogRef; node — require-фолбэк);
//   * hasOwnProperty-guard: неизвестный/прототипный effect.spell → ×1;
//   * уровень Number.isFinite ≥ 1 → ×8^(floor(уровень)−1) (floor —
//     конвенция decadanceLevels 000348); каталог/spell/уровень
//     недоступны (vm без spells-data) → ×1 — бит-в-бит старая цена;
//   * порядок «редкость → уровень → богатство/derived» (пин на value=1
//     — грабля 000346 T6); 8^n = 2^3n — точная степень двойки;
//   * ассортимент НЕ тронут (000347.02): численно двигаются РОВНО 2
//     цены Пергамента (fireball 60→480, light_heal 70→560; sell ×0.5),
//     frost_bolt ур1 → ×1 (45/23);
//   * golden-стоки (rng без цен) не двигаются (T6 — зелёный страж).
// Ожидания по диску: заклинаний 170, уровни 1..4 (макс ×512); свитков
// spell_scroll 161 — у всех валидный effect.spell, ни у одного нет
// rarity (резолвер редкости ортогонален и численно ×1).
//
// КРАСНЫЕ (осмысленные ERR_ASSERTION без краха загрузки): T1 (экспорт
// + свип каталога), T2 (vm таблица уровней 10/80/640/5120, ленивость),
// T3 (порядковый литерал value=1), T4 (Пергамент 480/240/560/280 +
// 34/28), T5 (ленивый каталог после items.js, floor 2.7→×8,
// SELL_BASE_VALUE ×8), T7 (редкость × редкость свитка одновременно).
// ЗЕЛЁНЫЕ с первого запуска: T6 (golden-стоки), ×1-guard'ы T5 (vm без
// SpellsData бит-в-бит, неизвестный spell, 'constructor', не-числовой
// уровень) и не-spell_scroll kinds в T7.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const I = require('../src/items.js');
const N = require('../src/npc.js');
const ND = require('../src/npc-data.js');
const P = require('../src/player.js');
const M = require('../src/map.js');
const B = M.BUILDING_TYPES;

const ITEM_DIR = path.join(ROOT, 'assets', 'items');
const SPELL_DIR = path.join(ROOT, 'assets', 'spells');
const diskItems = fs.readdirSync(ITEM_DIR)
  .filter((f) => /^\d{6}\.json$/.test(f))
  .map((f) => JSON.parse(fs.readFileSync(path.join(ITEM_DIR, f), 'utf8')));

// Локальные таблицы (НЕ через резолвер и НЕ через зеркала — ожидаемые
// значения независимы от реализации, иначе мутация резолвера не
// детектируется; паттерн RARITY_STEP_000346).
const STEP = { common: 0, rare: 1, epic: 2, legendary: 3, impossible: 4 };
const rarityMultOf = (rarity) => {
  const s = Object.prototype.hasOwnProperty.call(STEP, rarity)
    ? STEP[rarity] : 0;
  return Math.pow(8, s);
};
const SPELL_LVL = {};
for (const f of fs.readdirSync(SPELL_DIR)) {
  if (!f.endsWith('.json') || f === 'schema.json') continue;
  const s = JSON.parse(fs.readFileSync(path.join(SPELL_DIR, f), 'utf8'));
  SPELL_LVL[s.id] = s.уровень;
}
const scrollMultOf = (it) => {
  if (it.kind !== 'spell_scroll') return 1;
  const spell = it.effect && it.effect.spell;
  if (typeof spell !== 'string'
      || !Object.prototype.hasOwnProperty.call(SPELL_LVL, spell)) {
    return 1;
  }
  const lvl = SPELL_LVL[spell];
  if (!Number.isFinite(lvl) || lvl < 1) return 1;
  return Math.pow(8, Math.floor(lvl) - 1);
};

const charWithMerchant = (lvl) => {
  const c = P.createCharacter();
  c.secondary.merchant = lvl;
  return c;
};
const shopLit = (w) => ({ x: 0, y: 0, buildingType: B.APOTHECARY,
  wealth: w, stock: {} });

// vm-хелпер: дивергирующий каталог (паттерн
// tests/item-prices-rarity-000346.test.js divergedBoot); каталог
// заклинаний грузится ПОСЛЕ items.js (ловушка eager-кэша) или
// подсовывается фейковый через setSpells — резолвер обязан читать в
// МОМЕНТ ВЫЗОВА. sandbox.Game перечитывается свипом после каждой
// загрузки (UMD пересобирает Game через Object.assign).
function boot(probes, { npc = false } = {}) {
  const errors = [];
  const sandbox = {
    console: {
      warn: () => {},
      error: (m) => errors.push(String(m)),
      log: () => {},
    },
  };
  vm.createContext(sandbox);
  const run = (f) => vm.runInContext(
    fs.readFileSync(path.join(ROOT, 'src', f), 'utf8'), sandbox,
    { filename: f });
  for (const f of ['global-settings.js', 'perlin.js', 'map.js',
    'skills-data.js', 'items-data.js', 'sheet.js', 'player.js']) run(f);
  sandbox.Game.ITEMS = probes;
  run('items.js');
  if (npc) run('npc.js');
  return {
    errors,
    G: () => sandbox.Game,
    loadSpells: () => run('spells-data.js'),
    setSpells: (obj) => { sandbox.Game.SpellsData = obj; },
  };
}

const SCROLL = (id, spell, value, extra) => Object.assign(
  { id, kind: 'spell_scroll', name: 'Свиток-проба ' + id, weight: 0.2,
    value, effect: { kind: 'spell', spell } }, extra || {});

// ============================================================
// T1. Экспорт + не-свитки ×1 + ПОЛНЫЙ свип каталога 764 (RED)
// ============================================================

test('T1. spellScrollPriceMult экспортирован, не-spell_scroll → ×1; свип каталога: buy/sell(w0,Т0) === round(value×8^шаг_редкости×8^(ур−1)) для spell_scroll и прежняя формула 000346 для остальных', () => {
  assert.equal(typeof I.spellScrollPriceMult, 'function',
    'RED: spellScrollPriceMult не экспортирован (резолвер цены свитка 000347.01)');
  assert.equal(I.spellScrollPriceMult(null), 1, 'null → ×1');
  assert.equal(I.spellScrollPriceMult({}), 1, 'без kind → ×1');
  assert.equal(I.spellScrollPriceMult({ kind: 'weapon', value: 10 }), 1,
    'не spell_scroll → ×1 без обращения к каталогу');
  assert.equal(I.spellScrollPriceMult({ kind: 'resurrection_scroll',
    effect: { kind: 'spell', spell: 'fireball' } }), 1,
  'resurrection_scroll → ×1 (только spell_scroll)');
  assert.equal(I.spellScrollPriceMult({ kind: 'spell_scroll',
    effect: { kind: 'spell', spell: 'fireball' } }), 8,
    'spell_scroll на реальном каталоге (node require-фолбэк): ур2 → ×8');
  const c0 = charWithMerchant(0);
  const s0 = shopLit(0);
  let scrolls = 0;
  let boosted = 0;
  for (const it of diskItems) {
    const sm = scrollMultOf(it);
    const exp = Math.max(1, Math.round(
      it.value * rarityMultOf(it.rarity) * sm));
    assert.equal(I.buyPrice(s0, it.id, c0), exp,
      it.id + ': buy w0 = round(' + it.value + '×' +
      rarityMultOf(it.rarity) + '×свиток ' + sm + '); факт: ' +
      I.buyPrice(s0, it.id, c0));
    assert.equal(I.sellPrice(s0, it.id, c0), exp,
      it.id + ': sell w0 = round(' + it.value + '×' +
      rarityMultOf(it.rarity) + '×свиток ' + sm + '); факт: ' +
      I.sellPrice(s0, it.id, c0));
    if (it.kind === 'spell_scroll') scrolls++;
    if (sm > 1) boosted++;
  }
  assert.equal(scrolls, 161, 'свип覆盖 все 161 свитков spell_scroll');
  assert.equal(boosted, 133,
    'РОВНО 133 свитка численно дорожают (уровень ≥ 2 по диску)');
});

// ============================================================
// T2. vm таблица уровней: value=10, реальные спеллы уровней 1..4 →
// 10/80/640/5120, отношение соседей РОВНО 8; каталог подключён ПОСЛЕ
// items.js — цена всё равно растёт (ловушка eager-кэша) (RED)
// ============================================================

test('T2. vm: свитки value=10 на реальных спеллах frost_bolt/fireball/flame_burst/hellfire (уровни 1..4) — buy/sell(w0) = 10/80/640/5120, отношение соседей РОВНО 8; spells-data загружен ПОСЛЕ items.js — ленивость', () => {
  const byLevel = [
    ['probe_l1', 'frost_bolt', 10],
    ['probe_l2', 'fireball', 80],
    ['probe_l3', 'flame_burst', 640],
    ['probe_l4', 'hellfire', 5120],
  ];
  for (const [, spell] of byLevel) {
    assert.ok(Number.isInteger(SPELL_LVL[spell]) && SPELL_LVL[spell] >= 1,
      spell + ': уровень есть в локальной таблице с диска');
  }
  const h = boot(byLevel.map(([id, spell]) => SCROLL(id, spell, 10)));
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет: ' + h.errors.join('; '));
  h.loadSpells();
  const G = h.G();
  const hv = G.createCharacter('Проба');
  const s0 = { x: 0, y: 0, buildingType: 0, wealth: 0, stock: {} };
  const prices = [];
  for (const [id, spell, exp] of byLevel) {
    assert.equal(G.buyPrice(s0, id, hv), exp,
      'buy ' + spell + ' (ур ' + SPELL_LVL[spell] + ', value 10) === ' +
      exp + ' — каталог подключён ПОСЛЕ items.js (ленивый резолвер)');
    assert.equal(G.sellPrice(s0, id, hv), exp,
      'sell ' + spell + ' (value 10) === ' + exp);
    prices.push(G.buyPrice(s0, id, hv));
  }
  for (let i = 1; i < prices.length; i++) {
    assert.equal(prices[i] / prices[i - 1], 8,
      'отношение соседних уровней РОВНО 8 (8^n = 2^3n — точная двойка)');
  }
});

// ============================================================
// T3. Порядковый литерал value=1: уровень ДО богатства (RED)
// ============================================================

test('T3. vm округление на value=1: свиток ур2 buy(w3)=round(1×8×0.7)=6, sell(w3)=round(1×8×1.45)=12; свиток ур1 buy(w3)=max(1,round(0.7))=1 бит-в-бит старая цена', () => {
  const h = boot([
    SCROLL('probe_s1_l2', 'fireball', 1),
    SCROLL('probe_s1_l1', 'frost_bolt', 1),
  ]);
  h.loadSpells();
  const G = h.G();
  const hv = G.createCharacter('Проба');
  const s3 = { x: 0, y: 0, buildingType: 0, wealth: 3, stock: {} };
  assert.equal(G.buyPrice(s3, 'probe_s1_l2', hv), 6,
    'ур2: round(1×8×0.7) = 6 (уровень ДО богатства)');
  assert.equal(G.sellPrice(s3, 'probe_s1_l2', hv), 12,
    'ур2 sell: round(1×8×1.45) = 12');
  assert.equal(G.buyPrice(s3, 'probe_s1_l1', hv), 1,
    'ур1: max(1, round(1×1×0.7)) = 1 — бит-в-бит');
  assert.equal(G.sellPrice(s3, 'probe_s1_l1', hv), 1,
    'ур1 sell: round(1×1.45) = 1 — бит-в-бит');
});

// ============================================================
// T4. NPC-цепь (реальный Пергамент): РОВНО 2 предмета двигаются;
// прочие 70 входов торговли бит-в-бит старая формула (RED)
// ============================================================

test('T4. Пергамент: fireball 480/240 (T0), 360/300 (T5); frost_bolt 45/23, 34/28 (ур1 ×1) — РЕ-ПИН 000347.02: light_heal ПЕРЕНЕСЁН к жрецу солнца (пины 560/280/420/350 живут в scroll-trade-temples-000347.02 T5), ассортимент = огонь+лёд (54); прочие входы торговли — бит-в-бит max(1,round((base_price??value)×scroll-член×mult×derived)) по таблице 4 свитковых продавцов', () => {
  const scroll = ND.NPCS.find((n) => n.id === 'scroll_merchant');
  assert.ok(scroll && scroll.торговля, 'Пергамент в зеркале NPC');
  const shop = N.createNpcShop(scroll);
  const lit = {
    fireball_scroll: [480, 240, 360, 300],
    frost_bolt_scroll: [45, 23, 34, 28],
  };
  const c0 = charWithMerchant(0);
  const c5 = charWithMerchant(5);
  for (const [id, [b0, s0, b5, s5]] of Object.entries(lit)) {
    assert.equal(N.npcBuyPrice(shop, id, c0), b0,
      id + ': buy Торговец 0 === ' + b0);
    assert.equal(N.npcSellPrice(shop, id, c0), s0,
      id + ': sell Торговец 0 === ' + s0);
    assert.equal(N.npcBuyPrice(shop, id, c5), b5,
      id + ': buy Торговец 5 === ' + b5);
    assert.equal(N.npcSellPrice(shop, id, c5), s5,
      id + ': sell Торговец 5 === ' + s5);
  }
  const ids = scroll.торговля.предметы.map((e) => e.предмет);
  assert.equal(ids.length, 54,
    'ассортимент Пергамента — 54 (огонь+лёд; ре-пин 000347.02); '
    + 'факт: ' + ids.length);
  assert.ok(ids.includes('fireball_scroll')
      && ids.includes('frost_bolt_scroll'),
    '000043/000045 ОСТАЛИСЬ у Пергамента (переносились не они)');
  assert.ok(!ids.includes('light_heal_scroll'),
    'light_heal 000048 УБРАН из Пергамента (перенос к жрецу солнца, '
    + '000347.02 — строго один продавец на свиток)');
  const SCROLL_SELLERS = {
    scroll_merchant: 54,
    sun_priest: 26,
    moon_priestess: 27,
    mountain_priest: 54,
  };
  let other = 0;
  let scrolled = 0;
  for (const npc of ND.NPCS) {
    if (!npc.торговля) continue;
    const isSeller = Object.prototype.hasOwnProperty
      .call(SCROLL_SELLERS, npc.id);
    if (isSeller) {
      assert.equal(npc.торговля.предметы.length, SCROLL_SELLERS[npc.id],
        npc.id + ': витрина — ровно ' + SCROLL_SELLERS[npc.id]
        + ' свитковый вход (таблица 000347.02)');
    }
    const npcShop = N.createNpcShop(npc);
    for (const lvl of [0, 5]) {
      const c = charWithMerchant(lvl);
      const d = P.derived(c);
      for (const e of npc.торговля.предметы) {
        const it = I.getItem(e.предмет);
        assert.ok(it, npc.id + ': предмет в каталоге: ' + e.предмет);
        if (!isSeller) {
          assert.notEqual(it.kind, 'spell_scroll',
            npc.id + ': вне таблицы 4 свитковых продавцов свитков не '
            + 'торгуют (иначе формула ниже не покрыта): ' + e.предмет);
        }
        const base = (typeof it.base_price === 'number'
          ? it.base_price : it.value) * scrollMultOf(it);
        assert.equal(N.npcBuyPrice(npcShop, e.предмет, c),
          Math.max(1, Math.round(
            base * (e.mult_покупки || 1) * d.buyPriceMult)),
          npc.id + '/' + e.предмет + ': buy Торговец ' + lvl
          + ' бит-в-бит (scroll-член из локальной таблицы)');
        assert.equal(N.npcSellPrice(npcShop, e.предмет, c),
          Math.max(1, Math.round(
            base * e.mult_продажи * d.sellPriceMult)),
          npc.id + '/' + e.предмет + ': sell Торговец ' + lvl
          + ' бит-в-бит (scroll-член из локальной таблицы)');
        if (isSeller) scrolled++;
        else other++;
      }
    }
  }
  assert.equal(other, 146,
    'регресс-свип прочих входов — РОВНО 146 прогонов (73 не-свитковых '
    + 'входа × {Т0, Т5}); факт: ' + other);
  assert.equal(scrolled, 322,
    'свитковый свип таблицы 4 продавцов — РОВНО 322 (161 вход × {Т0, '
    + 'Т5}; покрытие 54+26+27+54 — T8 000347.02); факт: ' + scrolled);
});

// ============================================================
// T5. Guard'ы (×1-страховки зелёные с первого запуска; RED-часть —
// ленивость после items.js, floor, SELL_BASE_VALUE; экспорт — в конце,
// чтобы guard'ы прогнали зелёными и на красной базе)
// ============================================================

test('T5. guards: vm без SpellsData — свиток ×1 бит-в-бит; неизвестный spell и constructor → ×1; не-числовой/0/null уровень → ×1; уровень 2.7 → ×8 (floor); каталог после items.js → ×8; SELL_BASE_VALUE без value: sell(w0)=30×8=240', () => {
  const hNo = boot([SCROLL('probe_nospell', 'fireball', 100)]);
  const g0 = hNo.G();
  const hvNo = g0.createCharacter('Проба');
  const s0 = { x: 0, y: 0, buildingType: 0, wealth: 0, stock: {} };
  assert.equal(hNo.errors.length, 0, 'vm без spells-data грузится: ' +
    hNo.errors.join('; '));
  assert.equal(g0.buyPrice(s0, 'probe_nospell', hvNo), 100,
    'каталог недоступен (vm без spells-data) → ×1 бит-в-бит');
  assert.equal(g0.sellPrice(s0, 'probe_nospell', hvNo), 100,
    'sell без каталога → ×1 бит-в-бит');

  const hBad = boot([
    SCROLL('probe_unknown', 'no_such_spell', 100),
    SCROLL('probe_ctor', 'constructor', 100),
    SCROLL('probe_lvl_str', 'fake_str', 100),
    SCROLL('probe_lvl_0', 'fake_zero', 100),
    SCROLL('probe_lvl_null', 'fake_null', 100),
    SCROLL('probe_lvl_undef', 'fake_nolvl', 100),
    SCROLL('probe_lvl_neg', 'fake_neg', 100),
    SCROLL('probe_lvl_27', 'fake_27', 100),
  ]);
  hBad.setSpells({ SPELLS_BY_ID: {
    fake_str: { id: 'fake_str', 'уровень': 'x' },
    fake_zero: { id: 'fake_zero', 'уровень': 0 },
    fake_null: { id: 'fake_null', 'уровень': null },
    fake_nolvl: { id: 'fake_nolvl' },
    fake_neg: { id: 'fake_neg', 'уровень': -2 },
    fake_27: { id: 'fake_27', 'уровень': 2.7 },
  } });
  const gB = hBad.G();
  const hvB = gB.createCharacter('Проба');
  for (const id of ['probe_unknown', 'probe_ctor',
    'probe_lvl_str', 'probe_lvl_0', 'probe_lvl_null',
    'probe_lvl_undef', 'probe_lvl_neg']) {
    assert.equal(gB.buyPrice(s0, id, hvB), 100,
      id + ': недоступный/битый уровень → ×1 (дефолт НЕ затекает)');
  }
  assert.equal(gB.buyPrice(s0, 'probe_lvl_27', hvB), 800,
    'RED: уровень 2.7 → ×8^(floor(2.7)−1) = ×8 (конвенция decadanceLevels)');
  assert.equal(gB.buyPrice(s0, 'probe_ctor', hvB), 100,
    "'constructor' — hasOwnProperty-guard, прототип не протекает");

  const hLazy = boot([
    SCROLL('probe_lazy', 'fireball', 10),
    SCROLL('probe_noval_l2', 'fireball', NaN),
  ]);
  const gL0 = hLazy.G();
  const hvL = gL0.createCharacter('Проба');
  assert.equal(gL0.buyPrice(s0, 'probe_lazy', hvL), 10,
    'до загрузки каталога — ×1 (и кэш пустого вывода НЕ фиксируется)');
  hLazy.loadSpells();
  const gL = hLazy.G();
  assert.equal(gL.buyPrice(s0, 'probe_lazy', hvL), 80,
    'RED: каталог подключён ПОСЛЕ items.js — цена всё равно ×8');
  assert.equal(gL.sellPrice(s0, 'probe_noval_l2', hvL), 240,
    'RED: SELL_BASE_VALUE-ветка (value нет): sell(w0) = 30×8 = 240 — ' +
    'единство резолвера');
  const hPlain = boot([SCROLL('probe_noval_l2', 'fireball', NaN)]);
  const gP = hPlain.G();
  assert.equal(gP.sellPrice(s0, 'probe_noval_l2',
    gP.createCharacter('Проба')), 30,
    'без каталога SELL_BASE_VALUE — бит-в-бит 30');
  assert.equal(typeof I.spellScrollPriceMult, 'function',
    'RED: spellScrollPriceMult экспортирован (рядом с rarityPriceMult)');
  assert.equal(I.spellScrollPriceMult({ kind: 'spell_scroll' }), 1,
    'свиток без effect → ×1');
});

// ============================================================
// T6. Зелёный страж: golden-стоки (rng без цен) — множитель свитка
// не просочился в stock-rng (литералы 000346 T7, НЕ переснимать)
// ============================================================

test('T6. golden-стоки: makeShop(30,40,W=3) seed 3346526313 / 646 ключей / 1999 шт и makeCampShop(40,40,день1,w0) seed 1223027174 / 176 / 257 — множитель свитка НЕ в сид-формуле', () => {
  const s = I.makeShop(30, 40, B.WEAPONS_SHOP, 3);
  assert.equal(s.seed, 3346526313, 'universam seed (живой код базы)');
  const keys = Object.keys(s.stock);
  assert.equal(keys.length, 646, 'universam: ключей стока');
  let tot = 0;
  for (const k of keys) tot += s.stock[k];
  assert.equal(tot, 1999, 'universam: суммарное количество');
  const campRec = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'assets', 'buildings', 'camp.json'), 'utf8'));
  const cs = I.makeCampShop(40, 40, 1, 0, campRec);
  assert.equal(cs.seed, 1223027174, 'camp seed дня 1 (40,40)');
  const ckeys = Object.keys(cs.stock);
  assert.equal(ckeys.length, 176, 'camp: ключей стока');
  let ctot = 0;
  for (const k of ckeys) ctot += cs.stock[k];
  assert.equal(ctot, 257, 'camp: суммарное количество');
});

// ============================================================
// T7. Ортогональность цепей: rarity × свиток одновременно;
// не-spell_scroll kinds с effect.spell → уровень НЕ действует (RED по
// редкой свиток-половине)
// ============================================================

test('T7. vm: composition «редкость → уровень» (post-boot mutation rarity на свитке — валидатор при загрузке rarity на spell_scroll запрещает; моделирует будущий контент): round(10×8×8)=640; rare-кольцо и свиток ур2 в одном боте — каждый резолвер по своему полю; resurrection_scroll/craft_scroll/potion с effect.spell → ×1', () => {
  const h = boot([
    SCROLL('probe_comp_l2', 'fireball', 10),
    { id: 'probe_comp_ring', kind: 'ring', name: 'Проба кольцо rare',
      weight: 0.1, slot: 'ring', rarity: 'rare', value: 10 },
    { id: 'probe_res', kind: 'resurrection_scroll', name: 'Проба воскр.',
      weight: 0.2, value: 100, effect: { kind: 'resurrect' } },
    { id: 'probe_craft', kind: 'craft_scroll', name: 'Проба чертежа',
      weight: 0.2, value: 100,
      effect: { kind: 'craft_recipe', recipe: 'minor_healing' } },
    { id: 'probe_potion', kind: 'potion', name: 'Проба зелья',
      weight: 0.1, value: 100,
      effect: { kind: 'heal', amount: 5, spell: 'fireball' } },
  ]);
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет: ' + h.errors.join('; '));
  h.loadSpells();
  const G = h.G();
  const hv = G.createCharacter('Проба');
  const s0 = { x: 0, y: 0, buildingType: 0, wealth: 0, stock: {} };
  assert.equal(G.buyPrice(s0, 'probe_comp_ring', hv), 80,
    'rare-кольцо: round(10×8×1) = 80 — scroll-член его не касается');
  assert.equal(G.buyPrice(s0, 'probe_comp_l2', hv), 80,
    'свиток ур2 без rarity: round(10×1×8) = 80 — редкость ×1');
  G.getItem('probe_comp_l2').rarity = 'rare';
  assert.equal(G.buyPrice(s0, 'probe_comp_l2', hv), 640,
    'RED: composition round(10×8×8) = 640 — редкость ДО уровня');
  G.getItem('probe_comp_l2').rarity = undefined;
  assert.equal(G.buyPrice(s0, 'probe_res', hv), 100,
    'resurrection_scroll → уровень НЕ действует');
  assert.equal(G.buyPrice(s0, 'probe_craft', hv), 100,
    'craft_scroll → ×1');
  assert.equal(G.buyPrice(s0, 'probe_potion', hv), 100,
    'potion с чужим effect.spell → ×1');
});

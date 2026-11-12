// Задача 000346 — цена растёт ×8 на шаг редкости (геометрическая
// прогрессия, 5 редкостей; ТЗ tasks/done/000346.md, контракт
// memory/000346-rarity-prices.md).
//
// Контракт (единый резолвер в src/items.js, применён во ВСЕХ четырёх
// ценовых функциях — магазин buyPrice/sellPrice и NPC
// npcBuyPrice/npcSellPrice):
//   * RARITY_PRICE_STEPS = {common:0, rare:1, epic:2, legendary:3,
//     impossible:4}; rarityPriceMult(rarity) = 8^шаг; undefined /
//     неизвестная строка → 1 (дефолт НЕ затекает: без редкости — ×1);
//   * база = (base_price ?? value) в NPC-цепи (000322 не тронут),
//     value / SELL_BASE_VALUE[kind] в магазинной sell-ветке —
//     множитель редкости входит в БАЗУ ДО множителей богатства
//     (−10%/+15%), NPC-входов (mult_покупки/mult_продажи) и
//     «Торговца» активного (000299.03);
//   * ассеты НЕ переиздаются (base_price/value — не канон цены ×8;
//     прецедент 000322: base_price = цена продавца); множитель —
//     derived (в сейв не пишется);
//   * все 44 предмета NPC-торговли без rarity → NPC-витрина на
//     текущем контенте численно бит-в-бит (регресс-свип T4);
//   * golden-стоки (makeShop/makeCampShop — rng без цен) не двигаются
//     (T7 — зелёный страж протечки цены в stock-rng).
// Свитки (×8 по уровню) — РЕ-ПИН 000347.01: в свипы T1/T4 добавил
// ся ЛОКАЛЬНЫЙ scroll-член ×8^(уровень−1) (таблица уровней читается
// с диска, независимо от резолверов); spell_scroll без rarity — наш
// множитель по-прежнему ×1 (цепи ортогональны по полям).
//
// КРАСНЫЕ (осмысленные ERR_ASSERTION без краха загрузки): T1 (шаг-
// таблица + свип каталога), T2 (репрезентативы 5 редкостей × богатство
// × Торговец), T3 (vm дивергирующий каталог: цена value=10 по
// редкостям 10/80/640/5120/40960 и отношение ровно 8), T4 (vm-проба
// редкого торгуемого: base_price×8 внутри npcBuyPrice/npcSellPrice;
// real-свип ×1 — зелёная половина), T5 (SELL_BASE_VALUE ×8 для rare;
// common-проба бит-в-бит 000316), T6 (точные литералы округления на
// value=1). ЗЕЛЁНЫЕ с первого запуска (страховочные регресс-пины):
// T7 (стоки golden — цена не в rng), node-половина T4 (реальная NPC-
// торговля ×1), common/undefined-половины T1/T2/T5.

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
const NPC_DIR = path.join(ROOT, 'assets', 'npc');
const SPELL_DIR = path.join(ROOT, 'assets', 'spells');
const diskItems = fs.readdirSync(ITEM_DIR)
  .filter((f) => /^\d{6}\.json$/.test(f))
  .map((f) => JSON.parse(fs.readFileSync(path.join(ITEM_DIR, f), 'utf8')));
const itemById = (id) => diskItems.find((it) => it.id === id) || null;

// Локальная таблица (НЕ через экспорт — ожидаемые значения независимы
// от резолдера, иначе мутация шагов не детектируется).
const STEP = { common: 0, rare: 1, epic: 2, legendary: 3, impossible: 4 };
const multOf = (rarity) => {
  const s = Object.prototype.hasOwnProperty.call(STEP, rarity)
    ? STEP[rarity] : 0;
  return Math.pow(8, s);
};
// Локальная таблица уровней заклинаний (000347.01) — с диска, НЕ через
// spellScrollPriceMult и НЕ через зеркало (анти-самоуспокоение).
const SPELL_LVL_000347 = {};
for (const f of fs.readdirSync(SPELL_DIR)) {
  if (!f.endsWith('.json') || f === 'schema.json') continue;
  const s = JSON.parse(fs.readFileSync(path.join(SPELL_DIR, f), 'utf8'));
  SPELL_LVL_000347[s.id] = s.уровень;
}
const scrollMultOf = (it) => {
  if (it.kind !== 'spell_scroll') return 1;
  const spell = it.effect && it.effect.spell;
  if (typeof spell !== 'string'
      || !Object.prototype.hasOwnProperty.call(SPELL_LVL_000347, spell)) {
    return 1;
  }
  const lvl = SPELL_LVL_000347[spell];
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
// tests/shop-selltype-buyahead-000316.test.js divergedBoot: цепочка до
// player.js, Game.ITEMS подменяется ДО загрузки items.js), + npc.js
// поверх (UMD-ветка: factory(G0, G0) — P/I из Game).
function divergedBoot(probes, withNpc) {
  const errors = [];
  const sandbox = {
    console: {
      warn: () => {},
      error: (m) => errors.push(String(m)),
      log: () => {},
    },
  };
  vm.createContext(sandbox);
  const chain = ['global-settings.js', 'perlin.js', 'map.js',
    'skills-data.js', 'items-data.js', 'sheet.js', 'player.js'];
  for (const f of chain) {
    vm.runInContext(
      fs.readFileSync(path.join(ROOT, 'src', f), 'utf8'), sandbox,
      { filename: f });
  }
  sandbox.Game.ITEMS = probes;
  vm.runInContext(
    fs.readFileSync(path.join(ROOT, 'src', 'items.js'), 'utf8'),
    sandbox, { filename: 'items.js' });
  if (withNpc) {
    vm.runInContext(
      fs.readFileSync(path.join(ROOT, 'src', 'npc.js'), 'utf8'),
      sandbox, { filename: 'npc.js' });
  }
  return { G: sandbox.Game, errors };
}

const RING = (id, rarity, value, extra) => Object.assign(
  { id, kind: 'ring', name: 'Проба-' + rarity, weight: 0.1,
    slot: 'ring', rarity, value }, extra || {});

// ============================================================
// T1. Шаг-таблица резолвера + ПОЛНЫЙ свип каталога (RED)
// ============================================================

test('T1. RARITY_PRICE_STEPS/rarityPriceMult: 1/8/64/512/4096, без редкости и неизвестная — ×1; свип каталога: buyPrice(w0,Торговец 0) === round(value×8^шаг) точно; РЕ-ПИН 000347.01: свип ×8^(ур−1) для spell_scroll через ЛОКАЛЬНУЮ таблицу уровней', () => {
  assert.equal(typeof I.rarityPriceMult, 'function',
    'RED: rarityPriceMult не экспортирован (резолвер цены 000346)');
  assert.equal(typeof I.RARITY_PRICE_STEPS, 'object',
    'RED: RARITY_PRICE_STEPS не экспортирован');
  assert.notEqual(I.RARITY_PRICE_STEPS, null,
    'RED: RARITY_PRICE_STEPS null');
  assert.deepEqual({ ...I.RARITY_PRICE_STEPS },
    { common: 0, rare: 1, epic: 2, legendary: 3, impossible: 4 },
    'шаги редкости — 0/1/2/3/4 (×8^шаг, 5 редкостей)');
  const table = [
    ['common', 1], ['rare', 8], ['epic', 64], ['legendary', 512],
    ['impossible', 4096], [undefined, 1], ['nosuch_rarity', 1],
  ];
  for (const [r, exp] of table) {
    assert.equal(I.rarityPriceMult(r), exp,
      'rarityPriceMult(' + String(r) + ') === ' + exp);
  }
  const c0 = charWithMerchant(0);
  const s0 = shopLit(0);
  let withRarity = 0;
  for (const it of diskItems) {
    const exp = Math.max(1, Math.round(
      it.value * multOf(it.rarity) * scrollMultOf(it)));
    assert.equal(I.buyPrice(s0, it.id, c0), exp,
      it.id + ': buy w0 = round(' + it.value + '×' +
      multOf(it.rarity) + (it.rarity ? ' (' + it.rarity + ')' : '') +
      '×свиток ' + scrollMultOf(it) + '); факт: ' +
      I.buyPrice(s0, it.id, c0));
    assert.equal(I.sellPrice(s0, it.id, c0), exp,
      it.id + ': sell w0 = round(' + it.value + '×' +
      multOf(it.rarity) + '×свиток ' + scrollMultOf(it) +
      '); факт: ' + I.sellPrice(s0, it.id, c0));
    if (it.rarity) withRarity++;
  }
  assert.ok(withRarity >= 500,
    'свип覆盖 rarity-предметов (факт: ' + withRarity + ')');
});

// ============================================================
// T2. Репрезентативы 5 редкостей × богатство {0,1,3} × Торговец
// {0,5} — пересчёт из JSON-литералов 8^шаг (RED)
// ============================================================

test('T2. репрезентативы редкостей (adobe_shield/amethyst_band/archivist_staff/arcane_diadem/aegis_mantle): buy/sell при wealth {0,1,3} × Торговец {0,5} — value×8^шаг×(1∓wealth-множитель)×derived', () => {
  const reps = ['adobe_shield', 'amethyst_band', 'archivist_staff',
    'arcane_diadem', 'aegis_mantle'];
  for (const id of reps) {
    const it = itemById(id);
    assert.ok(it && it.rarity, id + ': предмет с rarity на диске');
    assert.ok(Object.prototype.hasOwnProperty.call(STEP, it.rarity),
      id + ': rarity «' + it.rarity + '» в таблице шагов');
    for (const w of [0, 1, 3]) {
      for (const lvl of [0, 5]) {
        const c = charWithMerchant(lvl);
        const d = P.derived(c);
        const base = it.value * multOf(it.rarity);
        const s = shopLit(w);
        const expBuy = Math.max(1,
          Math.round(base * (1 - 0.10 * w) * d.buyPriceMult));
        const expSell = Math.max(1,
          Math.round(base * (1 + 0.15 * w) * d.sellPriceMult));
        assert.equal(I.buyPrice(s, id, c), expBuy,
          id + ' (' + it.rarity + ') buy w' + w + ' T' + lvl +
          ' = round(' + base + '×' + (1 - 0.10 * w) + '×' +
          d.buyPriceMult + '); факт: ' + I.buyPrice(s, id, c));
        assert.equal(I.sellPrice(s, id, c), expSell,
          id + ' (' + it.rarity + ') sell w' + w + ' T' + lvl +
          ' = round(' + base + '×' + (1 + 0.15 * w) + '×' +
          d.sellPriceMult + '); факт: ' + I.sellPrice(s, id, c));
      }
    }
  }
});

// ============================================================
// T3. vm дивергирующий каталог: value=10 у всех пяти редкостей →
// цены 10/80/640/5120/40960, попарное отношение РОВНО 8 (RED)
// ============================================================

test('T3. vm: пять проб value=10 всех редкостей — buy/sell(w0) = 10·8^шаг точно (10/80/640/5120/40960), buy(w1) = round(база×0.9), отношение соседних редкостей РОВНО 8', () => {
  const rarities = ['common', 'rare', 'epic', 'legendary',
    'impossible'];
  const probes = rarities.map((r) => RING('probe_' + r, r, 10));
  const h = divergedBoot(probes, false);
  const G = h.G;
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет: ' + h.errors.join('; '));
  const hv = G.createCharacter('Проба');
  const s0 = { x: 0, y: 0, buildingType: 0, wealth: 0, stock: {} };
  const s1 = { x: 0, y: 0, buildingType: 0, wealth: 1, stock: {} };
  const litBuy0 = { common: 10, rare: 80, epic: 640, legendary: 5120,
    impossible: 40960 };
  const litBuy1 = { common: 9, rare: 72, epic: 576, legendary: 4608,
    impossible: 36864 };
  for (const r of rarities) {
    const id = 'probe_' + r;
    assert.equal(G.buyPrice(s0, id, hv), litBuy0[r],
      'buy w0 ' + r + ' (value 10) === ' + litBuy0[r]);
    assert.equal(G.sellPrice(s0, id, hv), litBuy0[r],
      'sell w0 ' + r + ' (value 10) === ' + litBuy0[r]);
    assert.equal(G.buyPrice(s1, id, hv), litBuy1[r],
      'buy w1 ' + r + ' === ' + litBuy1[r]);
  }
  for (let i = 1; i < rarities.length; i++) {
    const a = 'probe_' + rarities[i - 1];
    const b = 'probe_' + rarities[i];
    assert.equal(G.buyPrice(s0, b, hv) / G.buyPrice(s0, a, hv), 8,
      'шаг buy ' + rarities[i] + '/' + rarities[i - 1] + ' === 8');
    assert.equal(G.sellPrice(s0, b, hv) / G.sellPrice(s0, a, hv), 8,
      'шаг sell ' + rarities[i] + '/' + rarities[i - 1] + ' === 8');
  }
});

// ============================================================
// T4. NPC-цепь: real-свип 73 входов — РЕ-ПИН 000347.01: свитки
// Пергамента получают ЛОКАЛЬНЫЙ scroll-член ×8^(ур−1) (fireball/
// light_heal ур2 → ×8, frost_bolt ур1 → ×1), прочие торгуемые без
// rarity — ×1-регресс бит-в-бит + vm-проба редкого торгуемого:
// base_price×8^шаг внутри npcBuyPrice/npcSellPrice (RED)
// ============================================================

test('T4. NPC: свип всех входов торговли — npcBuyPrice/npcSellPrice бит-в-бит max(1,round((base_price??value)×8^(ур−1)×mult×derived)) (202 предмета без rarity → ×1 по редкости; свитки Пергамента и жрецов 000347.02 — scroll-член 000347.01); vm-проба: rarity rare → база×8, epic без base_price → value×64', () => {
  const npcFiles = fs.readdirSync(NPC_DIR)
    .filter((f) => /^\d{6}\.json$/.test(f));
  let entries = 0;
  const traded = new Set();
  for (const f of npcFiles) {
    const npc = ND.NPCS.find((n) => n.id ===
      JSON.parse(fs.readFileSync(path.join(NPC_DIR, f), 'utf8')).id);
    if (!npc || !npc.торговля) continue;
    const shop = N.createNpcShop(npc);
    for (const lvl of [0, 5]) {
      const c = charWithMerchant(lvl);
      const d = P.derived(c);
      for (const e of npc.торговля.предметы) {
        const it = itemById(e.предмет);
        assert.ok(it, npc.id + ': предмет в каталоге: ' + e.предмет);
        const base = (typeof it.base_price === 'number'
          ? it.base_price : it.value) * scrollMultOf(it);
        assert.equal(N.npcBuyPrice(shop, e.предмет, c),
          Math.max(1, Math.round(
            base * (e.mult_покупки || 1) * d.buyPriceMult)),
          npc.id + '/' + e.предмет + ': buy Торговец ' + lvl);
        assert.equal(N.npcSellPrice(shop, e.предмет, c),
          Math.max(1, Math.round(
            base * e.mult_продажи * d.sellPriceMult)),
          npc.id + '/' + e.предмет + ': sell Торговец ' + lvl);
      }
    }
    for (const e of npc.торговля.предметы) {
      entries++;
      traded.add(e.предмет);
      assert.equal(itemById(e.предмет).rarity, undefined,
        'реальная торговля ×1-регресс по РЕДКОСТИ: ' + e.предмет +
        ' не должен иметь rarity (свитки Пергамента и сети ' +
        'жрецов 000347.02 дорожены членом уровня 000347.01, ' +
        'не редкостью)');
    }
  }
  assert.equal(entries, 234,
    'свип покрывает ВСЮ торговлю — 234 входа (76 + 158 свитковых '
    + 'входов сети жрецов 000347.02); факт: ' + entries);
  assert.equal(traded.size, 202,
    'уникальных торгуемых — 202 (44 + 158 новых свитков 000347.02); '
    + 'факт: ' + traded.size);
  const probes = [
    RING('probe_npc_rare', 'rare', 50, { base_price: 100 }),
    RING('probe_npc_common', 'common', 50, { base_price: 100 }),
    RING('probe_npc_epic_value', 'epic', 20),
  ];
  const h = divergedBoot(probes, true);
  const G = h.G;
  assert.equal(h.errors.length, 0,
    'vm: npc.js поверх дивергирующего items.js грузится: ' +
    h.errors.join('; '));
  const hv = G.createCharacter('Проба');
  const npcShop = { npc: { торговля: { предметы: [
    { предмет: 'probe_npc_rare', mult_продажи: 0.5 },
    { предмет: 'probe_npc_common', mult_продажи: 0.5 },
    { предмет: 'probe_npc_epic_value', mult_покупки: 2,
      mult_продажи: 1 },
  ] } }, stock: {} };
  assert.equal(G.npcBuyPrice(npcShop, 'probe_npc_rare', hv), 800,
    'buy rare = round(100×8×1×1) = 800');
  assert.equal(G.npcSellPrice(npcShop, 'probe_npc_rare', hv), 400,
    'sell rare = round(100×8×0.5×1) = 400');
  assert.equal(G.npcBuyPrice(npcShop, 'probe_npc_common', hv), 100,
    'common — бит-в-бит прежняя цена (×1)');
  assert.equal(G.npcSellPrice(npcShop, 'probe_npc_common', hv), 50,
    'common sell — бит-в-бит прежняя цена (×1)');
  assert.equal(G.npcBuyPrice(npcShop, 'probe_npc_epic_value', hv),
    2560, 'epic без base_price: round(20×64×2) = 2560');
  assert.equal(G.npcSellPrice(npcShop, 'probe_npc_epic_value', hv),
    1280, 'epic без base_price sell: round(20×64×1) = 1280');
});

// ============================================================
// T5. sell-ветка SELL_BASE_VALUE (value неконечен): множитель
// применяется ЕДИНООБРАЗНО к базе; common — бит-в-бит 000316 (RED по
// rare-половине)
// ============================================================

test('T5. vm SELL_BASE_VALUE: rare-проба (value NaN, kind ring) — sell(w0)=40×8=320, sell(w2)=round(320×1.3)=416; common-проба — бит-в-бит 000316 (40)', () => {
  const probes = [
    RING('probe_ring_rare', 'rare', NaN),
    RING('probe_ring_common', 'common', NaN),
  ];
  const h = divergedBoot(probes, false);
  const G = h.G;
  const hv = G.createCharacter('Проба');
  const s0 = { x: 1, y: 1, buildingType: 1, wealth: 0, stock: {} };
  const s2 = { x: 1, y: 1, buildingType: 1, wealth: 2, stock: {} };
  const baseRing = I.SELL_BASE_VALUE.ring;
  assert.equal(G.sellPrice(s0, 'probe_ring_common', hv),
    Math.max(1, Math.round(baseRing * (1 + 0.15 * 0) * 1)),
    'common SELL_BASE_VALUE — бит-в-бит 000316 (base×1)');
  assert.equal(G.sellPrice(s0, 'probe_ring_rare', hv),
    baseRing * 8,
    'rare SELL_BASE_VALUE: base×8 = ' + (baseRing * 8));
  assert.equal(G.sellPrice(s2, 'probe_ring_rare', hv),
    Math.max(1, Math.round(baseRing * 8 * (1 + 0.15 * 2))),
    'rare SELL_BASE_VALUE w2: round(base×8×1.3)');
});

// ============================================================
// T6. Точные литералы округления на value=1 (RED по rare)
// ============================================================

test('T6. vm округление на value=1: common buy(w3)=max(1,round(0.7))=1; rare buy(w3)=round(8×0.7)=6, sell(w3)=round(8×1.45)=12', () => {
  const probes = [
    RING('probe_v1_common', 'common', 1),
    RING('probe_v1_rare', 'rare', 1),
  ];
  const h = divergedBoot(probes, false);
  const G = h.G;
  const hv = G.createCharacter('Проба');
  const s3 = { x: 0, y: 0, buildingType: 0, wealth: 3, stock: {} };
  assert.equal(G.buyPrice(s3, 'probe_v1_common', hv), 1,
    'common: max(1, round(1×0.7)) = 1');
  assert.equal(G.sellPrice(s3, 'probe_v1_common', hv), 1,
    'common sell: round(1×1.45) = 1');
  assert.equal(G.buyPrice(s3, 'probe_v1_rare', hv), 6,
    'rare: round(8×0.7) = 6');
  assert.equal(G.sellPrice(s3, 'probe_v1_rare', hv), 12,
    'rare sell: round(8×1.45) = 12');
});

// ============================================================
// T7. Зелёный страж: golden-стоки (rng без цен) — цена не просочилась
// в stock-rng (seed/состав — базовые литералы)
// ============================================================

test('T7. golden-стоки: makeShop(30,40,W=3) seed 3346526313 / 646 ключей / 1999 шт и makeCampShop(40,40,день1,w0) seed 1223027174 / 176 / 257 — множитель цены НЕ в сид-формуле', () => {
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

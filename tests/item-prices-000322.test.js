// Задача 000322 — базовая цена предмета в JSON предмета, а не в JSON NPC.
// Контракт: price = f(base_price, множители NPC, «Торговец» активного);
// формулы src/npc.js / src/items.js не меняются — меняется источник базы.
//   * base_price — ОПЦИОНАЛЬНОЕ целое 1..100000, ПОСЛЕ `value`
//     (assets/items + schema + зеркало src/items-data.js, KEYS синка);
//   * вход NPC «торговля»: {предмет, mult_покупки? (default 1),
//     mult_продажи, количество?}; цена_покупки/цена_продажи — УДАЛЕНЫ
//     (additionalProperties false);
//   * base = МИНИМАЛЬНАЯ цена покупки среди продавцов; отклонение
//     camp_wanderer — mult_покупки > 1 (5 предметов);
//   * магазин постройки — от `value` (не тронут, независим от NPC);
//   * цены НЕ в сейве (derived) — миграции нет; фолбэк base = value.
// Бит-в-бит доведено: base × mult === старая цена (точные двойки,
// 46×2), 0 флипов round(base×mult×M) vs round(price×M) (sweep R3).
// РЕ-ПИН 000320.01 (Корд/blade_merchant — 5 входов торговли): R1/R6
// входов 46→51 (уникальных предметов — те же 41), R7 торгующих NPC
// 7→8; R3 — Корд вне миграции 000322: OLD_PRICES его НЕ содержит
// (neg-пин) и свип его скипает (сравнение «бит-в-бит» к новой
// торговле неприменим; формула Корда покрыта R2).
// РЕ-ПИН 000320.06 (Дарн/blade_smith — 3 меча): R1/R6 входов 51→54
// (уникальных — те же 41), R7 торгующих 8→9, R3 — Дарн вне миграции
// (neg-пин + скип).
// РЕ-ПИН 000320.09 (Специалист по броне/armor_specialist — 3 брони
// 000008–000010): R1/R6 входов 54→57 (уникальных — те же 41: броня
// уже в множестве — её продаёт Грота), R7 торгующих 9→10, R3 —
// Specialist вне миграции 000322 (neg-пин + скип).
// РЕ-ПИН 000320.11 (Зельевар/brewer — 3 зелья 000012–000014):
// R1/R6 входов 57→60 (уникальных — те же 41: зелья уже в множестве —
// их продаёт Мила), R7 торгующих 10→11, R3 — Зельевар вне миграции
// 000322 (neg-пин + скип).
// РЕ-ПИН 000320.12 (Травница/herbalist — 3 травы 000039–000041):
// R1/R6 входов 60→63 (уникальных — те же 41: травы уже в множестве —
// их продаёт Мила), R7 торгующих 11→12, R3 — Травница вне миграции
// 000322 (neg-пин + скип).
// РЕ-ПИН 000320.13 (Алхимик-наставник/alchemy_instructor — 1 чертёж
// 000078; торговля обязательна D5/SRC-1 из 000232: наставник вида
// продаёт чертёж этого вида): R1/R6 входов 63→64 (уникальных — те же
// 41: blueprint_alchemy уже в множестве — его продаёт Мила), R7
// торгующих 12→13, R3 — Алхимик-наставник вне миграции 000322
// (neg-пин + скип).
// РЕ-ПИН 000320.15 (Торговец свитками/scroll_merchant — 3 свитка
// 000043/000045/000048; торговля — ПРОФИЛЬ ТЗ): R1/R6 входов 64→67
// (уникальных 41→44 — свитки НОВЫЕ: ни один NPC spell_scroll не
// продавал, в отличие от дедупов .09–.13; base_price=60/45/70 —
// ДОБАВЛЕН задачей в JSON свитков ПОСЛЕ value: у spell_scroll его не
// было, а R1 требует его у каждого торгуемого; base:=value сохраняет
// семантику цены — фолбэк R8, магазинные цены от value не двигаются),
// R7 торгующих 13→14, R3 — Торговец свитками вне миграции 000322
// (neg-пин + скип).
// РЕ-ПИН 000320.18 (Странствующий торговец/wanderer_trader — 3
// позиции 000035/000037/000038; торговля — ПРОФИЛЬ ТЗ): R1/R6 входов
// 67→70 (уникальных — те же 44: wood_log/hide/coal уже продаёт Хольд,
// дедуп по пути; base_price у всех трёх есть с миграции 000322 —
// JSON предметов НЕ трогается), R7 торгующих 14→15, R3 —
// Странствующий торговец вне миграции 000322 (neg-пин + скип).
// РЕ-ПИН 000320.19 (Торговец специями/spice_trader — 3 позиции
// 000036/000038/000055; торговля — ПРОФИЛЬ ТЗ, витрина ⊆ стока Хольда,
// отличается от Хомута): R1/R6 входов 70→73 (уникальных — те же 44:
// stone_chunk/coal/quartz уже продаёт Хольд, дедуп по пути (как у .18);
// base_price у всех трёх есть с миграции 000322 — JSON предметов НЕ
// трогается), R7 торгующих 15→16, R3 — Торговец специями вне миграции
// 000322 (neg-пин + скип).
// КРАСНЫЕ (до): R1 (нет base_price / есть цены в NPC), R2/R3 (нет
// mult_*, base undefined), R5 (старый формат валиден, base_price нет),
// R6 (зеркала без base_price / со старыми полями), R8 (фолбэк не читается).
// ЗЕЛЁНЫЕ с первого запуска (регрессия): R4, R7.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const P = require('../src/player.js');
const I = require('../src/items.js');
const N = require('../src/npc.js');
const ND = require('../src/npc-data.js');
const ID = require('../src/items-data.js');
const { validateData } = require('./json-schema.js');

const ROOT = path.join(__dirname, '..');
const NPC_DIR = path.join(ROOT, 'assets', 'npc');
const ITEM_DIR = path.join(ROOT, 'assets', 'items');

const npcFiles = fs.readdirSync(NPC_DIR).filter((f) => /^\d{6}\.json$/.test(f));
const itemFiles = fs.readdirSync(ITEM_DIR).filter((f) => /^\d{6}\.json$/.test(f));
const NPC_JSON = {};
for (const f of npcFiles) {
  NPC_JSON[f] = JSON.parse(fs.readFileSync(path.join(NPC_DIR, f), 'utf8'));
}
const ITEM_JSON = {};
for (const f of itemFiles) {
  ITEM_JSON[f] = JSON.parse(fs.readFileSync(path.join(ITEM_DIR, f), 'utf8'));
}
const itemRefToId = (ref) => ITEM_JSON[ref.split('/').pop()].id;

const OLD_PRICES = {
  weapons_merchant: {
    wood_sword: [10, 6], iron_sword: [42, 24], steel_sword: [126, 72],
    short_bow: [32, 18], hunting_bow: [95, 54], battle_axe: [158, 90],
    war_hammer: [263, 150],
  },
  armor_merchant: {
    leather_armor: [36, 21], chainmail: [147, 84], knight_plate: [420, 240],
    blueprint_enchant: [120, 60],
  },
  apothecary: {
    minor_healing: [4, 2], healing_potion: [11, 6], greater_healing: [37, 21],
    mana_potion: [13, 7], mana_elixir: [42, 24], bread: [2, 1],
    meat: [5, 3], honey_cake: [9, 5], herb_healing: [2, 1],
    herb_mana: [3, 2], herb_bitter: [2, 1], blueprint_alchemy: [120, 60],
  },
  magic_merchant: {
    sulfur: [3, 1], moonstone: [27, 15], phoenix_feather: [158, 90],
    alchemy_manual: [53, 30], sword_treatise: [63, 36],
    archery_manual: [63, 36], blueprint_runecraft: [120, 60],
  },
  blacksmith: { blueprint_forge: [120, 60] },
  wanderer_merchant: {
    wood_log: [3, 2], stone_chunk: [4, 2], hide: [5, 3], coal: [2, 1],
    iron_ore: [8, 4], copper_ore: [6, 3], silver_ore: [15, 8],
    quartz: [12, 6], blueprint_carving: [120, 60],
  },
  camp_wanderer: {
    bread: [3, 2], meat: [6, 4], honey_cake: [10, 6],
    minor_healing: [5, 3], healing_potion: [12, 8],
    blueprint_woodwork: [120, 60],
  },
};

const ITEMS = ID.ITEMS;
const M_GRID = [];
for (let m = 0.3; m <= 6.0000001; m += 0.05) {
  M_GRID.push(Number(m.toFixed(4)));
}
const itemById = (id) => ITEMS.find((it) => it.id === id);
const charWithMerchant = (lvl) => {
  const c = P.createCharacter();
  c.secondary.merchant = lvl;
  return c;
};

test('R1: SWEEP миграции — base_price в JSON у КАЖДОГО предмета торговли (73 входов: 46 миграции 000322 + 5 Корда 000320.01 + 3 меча Дарна 000320.06 + 3 брони Специалиста 000320.09 + 3 зелья Зельевара 000320.11 + 3 травы Травницы 000320.12 + 1 чертёж Алхимика-наставника 000320.13 + 3 свитка Торговца свитками 000320.15 + 3 позиции Странствующего торговца 000320.18 + 3 позиции Торговца специями 000320.19, 44 предмета — свитки 000043/000045/000048: первые продавцы spell_scroll, base_price=value добавлен задачей); цены УБРАНЫ из NPC-входов', () => {
  let entries = 0;
  const traded = new Set();
  for (const f of npcFiles) {
    const npc = NPC_JSON[f];
    const list = npc.торговля && npc.торговля.предметы;
    if (!Array.isArray(list)) continue;
    for (const e of list) {
      entries++;
      const item = ITEM_JSON[e.предмет.split('/').pop()];
      assert.ok(item, f + ': предмет резолвится: ' + e.предмет);
      traded.add(item.id);
      assert.ok(Number.isInteger(item.base_price) && item.base_price >= 1,
        f + ': ' + item.id + ': base_price — целое ≥ 1 в JSON предмета; '
        + 'факт: ' + JSON.stringify(item.base_price));
      assert.ok(!('цена_покупки' in e) && !('цена_продажи' in e),
        f + ': цены УБРАНЫ из входа (000322); факт: ' + JSON.stringify(e));
      assert.ok(typeof e.mult_продажи === 'number' && e.mult_продажи >= 0,
        f + ': mult_продажи — число ≥ 0; факт: ' + JSON.stringify(e));
      if ('mult_покупки' in e) {
        assert.ok(typeof e.mult_покупки === 'number' && e.mult_покупки >= 0,
          f + ': mult_покупки — число ≥ 0; факт: ' + JSON.stringify(e));
      }
    }
  }
  assert.equal(entries, 73, 'входов торговли — 73 (46 миграции 000322 '
    + '+ 5 Корда 000320.01 + 3 меча Дарна 000320.06 + 3 брони '
    + 'Специалиста 000320.09 + 3 зелья Зельевара 000320.11 + 3 травы '
    + 'Травницы 000320.12 + 1 чертёж Алхимика-наставника '
    + '000320.13 + 3 свитка Торговца свитками 000320.15 + 3 позиции '
    + 'Странствующего торговца 000320.18 + 3 позиции Торговца ' + 'специями 000320.19), а есть: '
    + entries);
  assert.equal(traded.size, 44,
    'уникальных предметов — 44 (Корд торгует тем же ассортиментом '
    + 'Оружейной; Дарн 000320.06 — мечи 000001–000003 уже в множестве 41; '
    + 'Специалист 000320.09 — броня 000008–000010 уже в множестве 41 — '
    + 'её продаёт Грота; Зельевар 000320.11 — зелья 000012–000014 уже '
    + 'в множестве 41 — их продаёт Мила; Травница 000320.12 — травы '
    + '000039–000041 уже в множестве 41 — их продаёт Мила; Алхимик-'
    + 'наставник 000320.13 — чертёж 000078 уже в множестве 41 — его '
    + 'продаёт Мила; Торговец свитками 000320.15 — свитки 000043/'
    + '000045/000048 НОВЫЕ в множестве: ни один NPC spell_scroll не '
    + 'продавал — 41+3=44; Странствующий торговец 000320.18 — '
    + 'wood_log/hide/coal 000035/000037/000038 уже продаёт Хольд, '
    + 'дедуп по пути — множество НЕ растёт; Торговец специями ' + '000320.19 — stone_chunk/coal/quartz 000036/000038/000055 уже ' + 'продаёт Хольд, дедуп по пути — множество НЕ растёт), а есть: '
    + traded.size);
});

test('R2: точная формула — npcBuyPrice/npcSellPrice = max(1, round(base × mult × derived)); base — из JSON предмета', () => {
  for (const f of npcFiles) {
    const npc = ND.NPCS.find((n) => n.id === NPC_JSON[f].id);
    assert.ok(npc, f + ': NPC в зеркале: ' + NPC_JSON[f].id);
    if (!npc.торговля) continue;
    const shop = N.createNpcShop(npc);
    for (const lvl of [0, 5]) {
      const c = charWithMerchant(lvl);
      const d = P.derived(c);
      for (const e of npc.торговля.предметы) {
        const it = itemById(e.предмет);
        assert.ok(it, f + ': предмет в каталоге: ' + e.предмет);
        const base = it.base_price;
        assert.ok(Number.isInteger(base) && base >= 1,
          f + ': ' + e.предмет + ': base_price в JSON; '
          + 'факт: ' + JSON.stringify(base));
        const expBuy = Math.max(
          1, Math.round(base * (e.mult_покупки || 1) * d.buyPriceMult));
        const expSell = Math.max(
          1, Math.round(base * e.mult_продажи * d.sellPriceMult));
        assert.equal(N.npcBuyPrice(shop, e.предмет, c), expBuy,
          f + ': ' + e.предмет + ' buy lvl' + lvl
          + ' = max(1, round(' + base + ' × ' + (e.mult_покупки || 1)
          + ' × ' + d.buyPriceMult + ')); факт: '
          + N.npcBuyPrice(shop, e.предмет, c));
        assert.equal(N.npcSellPrice(shop, e.предмет, c), expSell,
          f + ': ' + e.предмет + ' sell lvl' + lvl
          + ' = max(1, round(' + base + ' × ' + e.mult_продажи
          + ' × ' + d.sellPriceMult + ')); факт: '
          + N.npcSellPrice(shop, e.предмет, c));
      }
    }
  }
  const camp = ND.NPCS.find((n) => n.id === 'camp_wanderer');
  const cShop = N.createNpcShop(camp);
  const c0 = P.createCharacter();
  assert.equal(N.npcBuyPrice(cShop, 'bread', c0), 3,
    'camp bread buy = round(2 × 1.5) = 3 (mp > 1 — отклонение от базовой)');
  assert.equal(N.npcSellPrice(cShop, 'bread', c0), 2,
    'camp bread sell = round(2 × 1) = 2');
  const weapons = ND.NPCS.find((n) => n.id === 'weapons_merchant');
  const wShop = N.createNpcShop(weapons);
  const c5 = charWithMerchant(5);
  assert.equal(N.npcBuyPrice(wShop, 'war_hammer', c5), 197,
    'war_hammer buy lvl5 = round(263 × 0.75) = 197');
  assert.equal(N.npcSellPrice(wShop, 'war_hammer', c5), 188,
    'war_hammer sell lvl5 = round(150 × 1.25) = 188');
});

test('R3: БИТ-В-БИТ — base × mult === старая цена (точные двойки, 46×2 legacy; Корд 000320.01, Дарн 000320.06, Специалист 000320.09, Зельевар 000320.11, Травница 000320.12, Алхимик-наставник 000320.13, Торговец свитками 000320.15 и Странствующий торговец 000320.18 и Торговец специями 000320.19 — вне миграции, скип) + 0 флипов: уровни Торговца 0..100 (реальные derived) + сетка множителей 0.3..6.0', () => {
  let checked = 0;
  for (const f of npcFiles) {
    const npc = ND.NPCS.find((n) => n.id === NPC_JSON[f].id);
    assert.ok(npc, f + ': NPC в зеркале');
    if (!npc.торговля) continue;
    const shop = N.createNpcShop(npc);
    const oldMap = OLD_PRICES[npc.id];
    if (npc.id === 'blade_merchant') {
      assert.ok(!oldMap,
        f + ': Корд (000320.01) — НОВЫЙ NPC вне миграции 000322: '
        + 'OLD_PRICES НЕ содержит blade_merchant (сравнение «бит-в-бит» '
        + 'к новой торговле неприменимо); формула — регресс R2');
      continue;
    }
    if (npc.id === 'blade_smith') {
      assert.ok(!oldMap,
        f + ': Дарн (000320.06) — НОВЫЙ NPC вне миграции 000322: '
        + 'OLD_PRICES НЕ содержит blade_smith (сравнение «бит-в-бит» '
        + 'к новой торговле неприменимо); формула — регресс R2');
      continue;
    }
    if (npc.id === 'armor_specialist') {
      assert.ok(!oldMap,
        f + ': Специалист по броне (000320.09) — НОВЫЙ NPC вне миграции '
        + '000322: OLD_PRICES НЕ содержит armor_specialist (сравнение '
        + '«бит-в-бит» к новой торговле неприменимо); формула — регресс R2');
      continue;
    }
    if (npc.id === 'brewer') {
      assert.ok(!oldMap,
        f + ': Зельевар (000320.11) — НОВЫЙ NPC вне миграции '
        + '000322: OLD_PRICES НЕ содержит brewer (сравнение '
        + '«бит-в-бит» к новой торговле неприменимо); формула — регресс R2');
      continue;
    }
    if (npc.id === 'herbalist') {
      assert.ok(!oldMap,
        f + ': Травница (000320.12) — НОВЫЙ NPC вне миграции '
        + '000322: OLD_PRICES НЕ содержит herbalist (сравнение '
        + '«бит-в-бит» к новой торговле неприменимо); формула — регресс R2');
      continue;
    }
    if (npc.id === 'alchemy_instructor') {
      assert.ok(!oldMap,
        f + ': Алхимик-наставник (000320.13) — НОВЫЙ NPC вне миграции '
        + '000322: OLD_PRICES НЕ содержит alchemy_instructor (сравнение '
        + '«бит-в-бит» к новой торговле неприменимо); формула — регресс R2');
      continue;
    }
    if (npc.id === 'scroll_merchant') {
      assert.ok(!oldMap,
        f + ': Торговец свитками (000320.15) — НОВЫЙ NPC вне миграции '
        + '000322: OLD_PRICES НЕ содержит scroll_merchant (сравнение '
        + '«бит-в-бит» к новой торговле неприменимо); формула — регресс R2');
      continue;
    }
    if (npc.id === 'wanderer_trader') {
      assert.ok(!oldMap,
        f + ': Странствующий торговец (000320.18) — НОВЫЙ NPC вне '
        + 'миграции 000322: OLD_PRICES НЕ содержит wanderer_trader '
        + '(сравнение «бит-в-бит» к новой торговле неприменимо; у '
        + 'ХОЛЬДА его позиции в OLD_PRICES — он из миграции, а новый '
        + 'торговец дома 5 — нет); формула — регресс R2');
      continue;
    }
    if (npc.id === 'spice_trader') {
      assert.ok(!oldMap,
        f + ': Торговец специями (000320.19) — НОВЫЙ NPC вне ' + 'миграции 000322: OLD_PRICES НЕ содержит spice_trader ' + '(сравнение «бит-в-бит» к новой торговле неприменимо; его витрина — ' + 'из стока ХОЛЬДА, он в OLD_PRICES, а новый торговец дома 5 — ' + 'нет); формула — регресс R2');
      continue;
    }
    assert.ok(oldMap, f + ': OLD_PRICES для ' + npc.id);
    for (const e of npc.торговля.предметы) {
      const it = itemById(e.предмет);
      const old = oldMap[e.предмет];
      assert.ok(old, f + ': ' + e.предмет + ' в OLD_PRICES');
      const base = it.base_price;
      assert.ok(Number.isInteger(base),
        f + ': ' + e.предмет + ': base_price; факт: ' + base);
      const mp = e.mult_покупки || 1;
      const ms = e.mult_продажи;
      assert.equal(base * mp, old[0],
        f + ': ' + e.предмет + ': base × mult_покупки === цена_покупки '
        + '(точная двойка); факт: ' + base + ' × ' + mp + ' = '
        + base * mp + ' ≠ ' + old[0]);
      assert.equal(base * ms, old[1],
        f + ': ' + e.предмет + ': base × mult_продажи === цена_продажи '
        + '(точная двойка); факт: ' + base + ' × ' + ms + ' = '
        + base * ms + ' ≠ ' + old[1]);
      for (let lvl = 0; lvl <= 100; lvl++) {
        const c = charWithMerchant(lvl);
        const d = P.derived(c);
        checked++;
        assert.equal(
          N.npcBuyPrice(shop, e.предмет, c),
          Math.max(1, Math.round(old[0] * d.buyPriceMult)),
          f + ': ' + e.предмет + ' buy lvl' + lvl + ' — бит-в-бит');
        checked++;
        assert.equal(
          N.npcSellPrice(shop, e.предмет, c),
          Math.max(1, Math.round(old[1] * d.sellPriceMult)),
          f + ': ' + e.предмет + ' sell lvl' + lvl + ' — бит-в-бит');
      }
      for (const M of M_GRID) {
        checked++;
        assert.equal(
          Math.max(1, Math.round(base * mp * M)),
          Math.max(1, Math.round(old[0] * M)),
          f + ': ' + e.предмет + ' buy flip при M=' + M);
        checked++;
        assert.equal(
          Math.max(1, Math.round(base * ms * M)),
          Math.max(1, Math.round(old[1] * M)),
          f + ': ' + e.предмет + ' sell flip при M=' + M);
      }
    }
  }
  assert.equal(checked, 46 * 2 * (101 + M_GRID.length),
    'сравнений — ' + 46 * 2 * (101 + M_GRID.length) + ', а есть: '
    + checked);
});

test('R4: магазин постройки — от value, НЕ зависит от NPC-данных (мутация каталога NPC — 0 влияния); healing_potion: buy 10/9/8/7, sell 10/12/13/15 (wealth 0..3, hero)', () => {
  const c0 = P.createCharacter();
  const before = [];
  for (let w = 0; w <= 3; w++) {
    const shop = { x: 1, y: 1, buildingType: 2, wealth: w,
      stock: { healing_potion: 2 } };
    before.push([I.buyPrice(shop, 'healing_potion', c0),
      I.sellPrice(shop, 'healing_potion', c0)]);
  }
  assert.deepEqual(before, [[10, 10], [9, 12], [8, 13], [7, 15]],
    'healing_potion (value 10) — формула от value не менялась');
  const merc2 = charWithMerchant(2);
  const shop3 = I.makeShop(5, 7, 2, 3);
  assert.ok(shop3, 'makeShop(2, wealth 3) — магазин');
  assert.ok(shop3.stock.healing_potion >= 1, 'healing_potion в стоке');
  assert.equal(I.buyPrice(shop3, 'healing_potion', merc2), 6,
    'A6-инвариант: round(10 × 0.7 × 0.9) = 6');
  assert.equal(I.sellPrice(shop3, 'healing_potion', merc2), 16,
    'A6-инвариант: round(10 × 1.45 × 1.1) = 16');
  assert.equal(I.buyPrice(shop3, 'healing_potion', c0), 7,
    'hero: round(10 × 0.7) = 7');
  assert.equal(I.sellPrice(shop3, 'healing_potion', c0), 15,
    'hero: round(10 × 1.45) = 15');
  for (const f of npcFiles) {
    const npc = ND.NPCS.find((n) => n.id === NPC_JSON[f].id);
    if (!npc || !npc.торговля) continue;
    for (const e of npc.торговля.предметы) {
      const it = itemById(e.предмет);
      if (!it) continue;
      const oldStock = shop3.stock[it.id];
      const oldBuy = oldStock ? I.buyPrice(shop3, it.id, merc2) : null;
      const oldSell = I.sellPrice(shop3, it.id, merc2);
      const save = JSON.parse(JSON.stringify(e));
      e.mult_покупки = 0.123;
      e.mult_продажи = 0.456;
      const newBuy = oldStock ? I.buyPrice(shop3, it.id, merc2) : null;
      const newSell = I.sellPrice(shop3, it.id, merc2);
      e.цена_покупки = 9999;
      e.цена_продажи = 1;
      const newBuy2 = oldStock ? I.buyPrice(shop3, it.id, merc2) : null;
      const newSell2 = I.sellPrice(shop3, it.id, merc2);
      Object.keys(e).forEach((k) => { delete e[k]; });
      Object.assign(e, save);
      assert.equal(newBuy, oldBuy,
        f + ': ' + e.предмет + ': buyPrice магазина НЕ зависит от NPC');
      assert.equal(newSell, oldSell,
        f + ': ' + e.предмет + ': sellPrice магазина НЕ зависит от NPC');
      assert.equal(newBuy2, oldBuy,
        f + ': ' + e.предмет + ': buyPrice — цены NPC не читаются');
      assert.equal(newSell2, oldSell,
        f + ': ' + e.предмет + ': sellPrice — цены NPC не читаются');
    }
  }
});

test('R5: схемы — base_price в items schema (опциональное, integer); NPC-вход: mult_*, цены НЕВАЛИДНЫ (additionalProperties false)', () => {
  const itemsSchema = JSON.parse(fs.readFileSync(
    path.join(ITEM_DIR, 'schema.json'), 'utf8'));
  const npcSchema = JSON.parse(fs.readFileSync(
    path.join(NPC_DIR, 'schema.json'), 'utf8'));
  for (const f of itemFiles) {
    const errs = validateData(itemsSchema, ITEM_JSON[f]);
    assert.deepEqual(errs, [], f + ': валиден по новой схеме: '
      + JSON.stringify(errs));
  }
  for (const f of npcFiles) {
    const errs = validateData(npcSchema, NPC_JSON[f]);
    assert.deepEqual(errs, [], f + ': валиден по новой схеме: '
      + JSON.stringify(errs));
  }
  const bread = JSON.parse(JSON.stringify(ITEM_JSON['000016.json']));
  bread.base_price = 2;
  assert.deepEqual(validateData(itemsSchema, bread), [],
    'base_price (integer) — валидно');
  const badItem = JSON.parse(JSON.stringify(bread));
  badItem.base_price = '2';
  assert.ok(validateData(itemsSchema, badItem).length > 0,
    'base_price: "2" (string) — невалидно');
  const entryOk = {
    предмет: 'assets/items/000001.json', mult_продажи: 0.6, количество: 2,
  };
  const entryMp = { ...entryOk, mult_покупки: 1.5 };
  const tradeOf = (predmet) => validateData(
    npcSchema.properties.торговля,
    { предметы: [predmet] }).length;
  assert.equal(tradeOf(entryOk), 0, 'новый формат — валиден');
  assert.equal(tradeOf(entryMp), 0, 'mult_покупки — валиден');
  const legacy = {
    предмет: 'assets/items/000001.json',
    цена_покупки: 10, цена_продажи: 6, количество: 2,
  };
  assert.ok(tradeOf(legacy) > 0,
    'старый формат (цена_покупки/цена_продажи) — невалиден');
});

test('R6: зеркала — items-data: base_price ровно у 44 id ПОСЛЕ value, у 720 — нет (ре-пин 000333: каталог 511 → 513, свитки навигации без base_price; ре-пин 000321.01: 513 → 563, оружие без base_price; ре-пин 000321.02: 563 → 613, броня без base_price; ре-пин 000321.03: 613 → 663, щиты без base_price; ре-пин 000321.04: 663 → 713, артефакты без base_price; ре-пин 000321.05: 713 → 763, инструменты без base_price; ре-пин 000348: 763 → 764, свиток Декаданс без base_price; ре-пин 000320.15: base_price 41 → 44 — свитки 000043/000045/000048 получили base_price=value, первые продавцы spell_scroll); npc-data: новый формат входов (цены отсутствуют)', () => {
  let withBase = 0;
  for (const it of ITEMS) {
    if (it.base_price === undefined) continue;
    withBase++;
    const keys = Object.keys(it);
    assert.equal(keys.indexOf('base_price'),
      keys.indexOf('value') + 1,
      it.id + ': base_price ПОСЛЕ value; факт: ' + JSON.stringify(keys));
  }
  assert.equal(withBase, 44,
    'base_price ровно у 44 id, а есть: ' + withBase);
  assert.equal(ITEMS.length, 764, 'каталог — 764 предмета (ре-пин 000333: +2 свитка навигации; ре-пин 000321.01: +50 оружия; ре-пин 000321.02: +50 брони; ре-пин 000321.03: +50 щитов; ре-пин 000321.04: +50 артефактов; ре-пин 000321.05: +50 инструментов; ре-пин 000348: +1 свиток Декаданс); факт: ' + ITEMS.length);
  let entries = 0;
  for (const npc of ND.NPCS) {
    if (!npc.торговля) continue;
    for (const e of npc.торговля.предметы) {
      entries++;
      assert.ok(!('цена_покупки' in e) && !('цена_продажи' in e),
        npc.id + ': цены УБРАНЫ из зеркала; факт: ' + JSON.stringify(e));
      assert.ok(typeof e.mult_продажи === 'number',
        npc.id + ': mult_продажи в зеркале; факт: ' + JSON.stringify(e));
    }
  }
  assert.equal(entries, 73, 'входов в зеркале — 73 (46 + 5 Корда '
    + '000320.01 + 3 меча Дарна 000320.06 + 3 брони Специалиста '
    + '000320.09 + 3 зелья Зельевара 000320.11 + 3 травы Травницы '
    + '000320.12 + 1 чертёж Алхимика-наставника 000320.13 + 3 свитка '
    + 'Торговца свитками 000320.15 + 3 позиции Странствующего '
    + 'торговца 000320.18 + 3 позиции Торговца специями ' + '000320.19), а есть: '
    + entries);
  const weapons = ND.NPCS.find((n) => n.id === 'weapons_merchant');
  const wood = weapons.торговля.предметы
    .find((e) => e.предмет === 'wood_sword');
  assert.ok(!('mult_покупки' in wood),
    'mp = 1 — КЛЮЧ АБСЕНТ (зеркало печатает только присутствующие)');
});

test('R7: сейв — serializeNpcStocks: только {npcId:{itemId:qty}}, никаких ценовых полей; roundtrip полного стока идентичен', () => {
  const stocks = {};
  for (const npc of ND.NPCS) {
    const shop = N.createNpcShop(npc);
    if (shop) stocks[npc.id] = shop.stock;
  }
  assert.equal(Object.keys(stocks).length, 16, 'торгующих NPC — 16 '
    + '(7 миграции 000322 + Корд 000320.01 + Дарн 000320.06 '
    + '+ Специалист 000320.09 + Зельевар 000320.11 '
    + '+ Травница 000320.12 + Алхимик-наставник 000320.13 '
    + '+ Торговец свитками 000320.15 + Странствующий торговец '
    + '000320.18 + Торговец специями 000320.19)');
  const ser = N.serializeNpcStocks(stocks);
  assert.deepEqual(ser, stocks, 'сток — {npcId:{itemId:qty}} 1:1');
  for (const npcId of Object.keys(ser)) {
    for (const itemId of Object.keys(ser[npcId])) {
      assert.ok(Number.isInteger(ser[npcId][itemId]),
        npcId + '/' + itemId + ': qty — целое (ценовых полей нет)');
    }
  }
  assert.deepEqual(N.restoreNpcStocks(ND.NPCS, ser), stocks,
    'roundtrip полного стока — идентичен (цены не персистятся)');
  assert.deepEqual(
    N.serializeNpcStocks({ s: { bread: 3, moonstone: -1, x: 1.5 } }),
    { s: { bread: 3 } },
    'junk (отрицательное/не-целое) — отброшен');
});

test('R8: фолбэк — предмет БЕЗ base_price: цена = value × mult (поведение неторговых/будущих предметов сохранено)', () => {
  const traded = new Set();
  for (const npc of ND.NPCS) {
    if (!npc.торговля) continue;
    for (const e of npc.торговля.предметы) traded.add(e.предмет);
  }
  const free = ITEMS.find((it) => !traded.has(it.id));
  assert.ok(free, 'есть предмет вне торговли');
  assert.ok(free.base_price === undefined,
    free.id + ' — без base_price (краснота: поле у всех)');
  const npc = {
    id: 'fallback_test',
    торговля: { предметы: [{ предмет: free.id, mult_продажи: 0.5 }] },
  };
  const shop = N.createNpcShop(npc);
  const c0 = P.createCharacter();
  assert.equal(N.npcBuyPrice(shop, free.id, c0), free.value,
    'buy фолбэк = value × 1 (mp отсутствует); факт: '
    + N.npcBuyPrice(shop, free.id, c0));
  assert.equal(
    N.npcSellPrice(shop, free.id, c0),
    Math.max(1, Math.round(free.value * 0.5)),
    'sell фолбэк = round(value × 0.5); факт: '
    + N.npcSellPrice(shop, free.id, c0));
  const c5 = charWithMerchant(5);
  assert.equal(
    N.npcBuyPrice(shop, free.id, c5),
    Math.max(1, Math.round(free.value * 0.75)),
    'buy фолбэк lvl5 = round(value × 0.75)');
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const I = require('../src/items.js');
const M = require('../src/map.js');
const { createCharacter, SECONDARY_SKILLS } = require('../src/player.js');

const ITEMS_DIR = path.join(__dirname, '..', 'assets', 'items');

// --- Каталог ---

test('каталог: все предметы валидны, id уникальны', () => {
  const items = I.allItems();
  assert.ok(items.length >= 20, 'каталог разросся/уменьшился: ' + items.length);
  const ids = new Set();
  const kinds = new Set();
  for (const it of items) {
    assert.match(it.id, /^[a-z][a-z0-9_]*$/);
    assert.ok(!ids.has(it.id), 'дубликат id: ' + it.id);
    ids.add(it.id);
    kinds.add(it.kind);
    assert.equal(I.getItem(it.id), it, 'getItem находит предмет');
  }
  // Все типы из SPEC есть в каталоге.
  for (const k of ['weapon', 'armor', 'potion', 'food', 'skill_book', 'reagent']) {
    assert.ok(kinds.has(k), 'нет предметов типа ' + k);
  }
});

test('каталог: оружие/броня/зелья/книги семантически корректны', () => {
  for (const it of I.allItems()) {
    if (it.kind === 'weapon') {
      assert.ok(['sword', 'bow', 'heavy'].includes(it.subtype), it.id + ': подтип');
      assert.ok(it.stats && it.stats.damage >= 1, it.id + ': damage');
      assert.equal(it.effect, undefined, it.id + ': у оружия нет effect');
    }
    if (it.kind === 'armor') {
      assert.ok(it.stats && it.stats.armor >= 0, it.id + ': armor');
    }
    if (it.kind === 'potion') {
      assert.ok(['heal', 'mp'].includes(it.effect.kind), it.id + ': эффект зелья');
      assert.ok(it.effect.amount >= 1);
    }
    if (it.kind === 'food') {
      assert.equal(it.effect.kind, 'eat', it.id + ': эффект еды');
    }
    if (it.kind === 'skill_book') {
      assert.equal(it.effect.kind, 'skill_xp', it.id + ': эффект книги');
      assert.ok(SECONDARY_SKILLS[it.effect.skill], it.id + ': навык книги');
    }
    if (it.kind === 'reagent') {
      assert.equal(it.effect, undefined, it.id + ': у реагента нет effect');
    }
  }
});

test('JS-фолбэк идентичен JSON-каталогу assets/items (source of truth)', () => {
  const files = fs.readdirSync(ITEMS_DIR)
    .filter((f) => /^\d{6}\.json$/.test(f))
    .sort();
  assert.ok(files.length >= 20, 'мало JSON-файлов: ' + files.length);
  assert.equal(files.length, I.allItems().length,
    'число файлов != числу предметов в JS-модуле');
  const byId = new Map(I.allItems().map((it) => [it.id, it]));
  for (const f of files) {
    const raw = fs.readFileSync(path.join(ITEMS_DIR, f), 'utf8');
    const j = JSON.parse(raw);
    assert.ok(byId.has(j.id), f + ': предмет ' + j.id + ' нет в JS-модуле');
    assert.deepEqual(j, byId.get(j.id), f + ' расходится с JS-модулем');
    byId.delete(j.id);
  }
  assert.equal(byId.size, 0, 'в JS-модуле есть предметы без JSON-файла: '
    + Array.from(byId.keys()).join(', '));
});

// --- Инвентарь: добавление/удаление ---

test('addItem/removeItem: добавление, стопки, удаление', () => {
  const c = createCharacter();
  assert.equal(I.addItem(c, 'нет-такого').ok, false);
  assert.equal(I.addItem(c, 'healing_potion', 3).ok, true);
  assert.equal(I.totalQty(c, 'healing_potion'), 3);
  assert.equal(I.inventoryWeight(c), 1.5);

  // Стопка не растёт безлимитно: хлеб 0.2 кг, 150 шт = ровно 30 кг (лимит)
  // → 2 слота (99 + 51).
  const c2 = createCharacter();
  assert.equal(I.addItem(c2, 'bread', 150).ok, true, '150 хлеба = ровно 30 кг');
  const breadSlots = c2.inventory.slots.filter((e) => e.id === 'bread');
  assert.equal(breadSlots.length, 2, '150 = 99 + 51, два слота');
  assert.equal(breadSlots[0].qty, I.MAX_STACK);
  assert.equal(breadSlots[1].qty, 150 - I.MAX_STACK);
  assert.ok(Math.abs(I.inventoryWeight(c2) - I.BASE_CARRY_WEIGHT) < 1e-9);
  assert.equal(I.addItem(c2, 'bread').ok, false, '151-й хлеб уже не влезает');
  assert.match(I.addItem(c2, 'bread').reason, /тяжело/);

  assert.equal(I.removeItem(c2, 'bread', 150).ok, true);
  assert.equal(c2.inventory.slots.length, 0);
  assert.equal(I.inventoryWeight(c2), 0);

  // Удалить лишнего нельзя.
  assert.equal(I.removeItem(c, 'healing_potion', 4).ok, false);
  assert.match(I.removeItem(c, 'healing_potion', 4).reason, /не хватает/);
  assert.equal(I.totalQty(c, 'healing_potion'), 3);
  assert.equal(I.removeItem(c, 'healing_potion', 3).ok, true);
  assert.equal(I.totalQty(c, 'healing_potion'), 0);
});

test('addItem: оружие и броня не складываются, слоты ограничены', () => {
  const c = createCharacter();
  assert.equal(I.addItem(c, 'wood_sword').ok, true);
  assert.equal(I.addItem(c, 'wood_sword').ok, true); // два меча — два слота
  assert.equal(c.inventory.slots.filter((e) => e.id === 'wood_sword').length, 2);
  // Забить слоты оружием (не складывается — каждый меч в своём слоте).
  while (I.slotCount(c) < I.INVENTORY_SLOTS) {
    assert.equal(I.addItem(c, 'wood_sword').ok, true, 'слоты должны ещё быть');
  }
  assert.equal(I.slotCount(c), I.INVENTORY_SLOTS);
  const r = I.addItem(c, 'wood_sword');
  assert.equal(r.ok, false);
  assert.match(r.reason, /слотов/);
});

// --- Вес ---

test('лимит веса: базовый 30 кг, «Крепкая спина» +10% за уровень', () => {
  const c = createCharacter();
  assert.equal(I.maxCarryWeight(c), I.BASE_CARRY_WEIGHT);

  // Боевой молот 4 кг: 7 штук = 28 кг, 8-й не входит (32 > 30).
  for (let i = 0; i < 7; i++) assert.equal(I.addItem(c, 'war_hammer').ok, true, 'молот ' + (i + 1));
  const r = I.addItem(c, 'war_hammer');
  assert.equal(r.ok, false);
  assert.match(r.reason, /тяжело/);

  // «Крепкая спина» 5 → ×1.5 = 45 кг: 8-й молот (32 кг) уже можно.
  c.secondary.back = 5;
  assert.equal(I.maxCarryWeight(c), 45);
  assert.equal(I.addItem(c, 'war_hammer').ok, true);
  assert.equal(I.inventoryWeight(c), 32);
  assert.equal(I.maxCarryWeight(c), 45); // формула не зависит от ноши
});

// --- Применение предметов ---

test('useItem: зелье лечения (с «Алхимиком» ×1.5 на 10 ур.)', () => {
  const c = createCharacter();
  assert.equal(I.addItem(c, 'healing_potion', 2).ok, true);
  c.hp = 1;
  const r1 = I.useItem(c, 'healing_potion');
  assert.equal(r1.ok, true);
  assert.equal(r1.hp, 15);
  assert.equal(c.hp, 16);

  c.secondary.alchemy = 10; // potionPowerMult = 1.5
  c.hp = 1;
  const r2 = I.useItem(c, 'healing_potion');
  assert.equal(r2.hp, Math.round(15 * 1.5)); // 23
  assert.equal(c.hp, 1 + Math.round(15 * 1.5));
  assert.equal(I.totalQty(c, 'healing_potion'), 0, 'зелье потрачено');
  assert.equal(I.useItem(c, 'healing_potion').ok, false, 'больше нет');
});

test('useItem: зелье маны и еда (с «Сердцем природы»)', () => {
  const c = createCharacter();
  I.addItem(c, 'mana_potion');
  I.addItem(c, 'bread');
  c.mp = 0;
  assert.equal(I.useItem(c, 'mana_potion').mp, 10);
  assert.equal(c.mp, 10);

  c.secondary.nature = 10; // foodPowerMult = 1.5
  c.hp = 1;
  assert.equal(I.useItem(c, 'bread').hp, Math.round(4 * 1.5)); // 6
});

test('useItem: книга навыков даёт опыт навыка, реагент не применяется', () => {
  const c = createCharacter();
  I.addItem(c, 'alchemy_manual');
  const r = I.useItem(c, 'alchemy_manual');
  assert.equal(r.ok, true);
  assert.equal(r.skill.skill, 'alchemy');
  assert.equal(c.skillXp.alchemy, 10);
  assert.equal(I.totalQty(c, 'alchemy_manual'), 0, 'книга потрачена');

  I.addItem(c, 'sulfur');
  const rs = I.useItem(c, 'sulfur');
  assert.equal(rs.ok, false);
  assert.match(rs.reason, /применить/);
  assert.equal(I.totalQty(c, 'sulfur'), 1, 'реагент не потрачен');

  I.addItem(c, 'wood_sword');
  assert.match(I.useItem(c, 'wood_sword').reason, /экипируется/);
});

// --- Быстрые слоты ---

test('быстрые слоты: назначение, проверка наличия, очистка', () => {
  const c = createCharacter();
  assert.equal(I.setQuick(c, 0, 'bread').ok, false, 'нет предмета в инвентаре');
  I.addItem(c, 'bread');
  I.addItem(c, 'meat');
  assert.equal(I.setQuick(c, 0, 'bread').ok, true);
  assert.equal(I.quickItem(c, 0), 'bread');
  assert.equal(I.firstQuickSlot(c), 0);
  assert.equal(I.setQuick(c, 5, 'meat').ok, false, 'слот вне диапазона');
  assert.equal(I.setQuick(c, 1, 'meat').ok, true);
  assert.equal(I.firstQuickSlot(c), 0, 'первый занятый — 0');
  assert.equal(I.freeQuickSlot(c), 2);
  assert.equal(I.clearQuick(c, 0).ok, true);
  assert.equal(I.quickItem(c, 0), null);
  // Удалили предмет — его быстрый слот очищается.
  assert.equal(I.setQuick(c, 0, 'meat').ok, true);
  I.removeItem(c, 'meat');
  assert.equal(I.quickItem(c, 0), null, 'слот на удалённый предмет пуст');
});

// --- Снаряжение ---

test('снаряжение: экипировка, статы, снятие', () => {
  const c = createCharacter();
  assert.equal(I.equip(c, 'iron_sword').ok, false, 'меч не в инвентаре');
  I.addItem(c, 'iron_sword');
  I.addItem(c, 'leather_armor');
  assert.equal(I.equip(c, 'iron_sword').ok, true);
  assert.equal(I.equip(c, 'iron_sword').ok, false, 'уже экипировано');
  assert.equal(I.equip(c, 'leather_armor').ok, true);
  assert.equal(c.equipment.weapon, 'iron_sword');
  assert.equal(c.equipment.armor, 'leather_armor');
  // Снято с инвентаря.
  assert.equal(I.totalQty(c, 'iron_sword'), 0);
  assert.equal(I.totalQty(c, 'leather_armor'), 0);
  const st = I.equipmentStats(c);
  assert.equal(st.damage, 5);
  assert.equal(st.subtype, 'sword');
  assert.equal(st.armor, 2);
  // Снять обратно в инвентарь.
  assert.equal(I.unequip(c, 'weapon').ok, true);
  assert.equal(I.totalQty(c, 'iron_sword'), 1);
  assert.equal(I.unequip(c, 'armor').ok, true);
  assert.equal(I.unequip(c, 'armor').ok, false, 'уже снято');
});

test('снаряжение: смена оружия возвращает предыдущее в инвентарь', () => {
  const c = createCharacter();
  I.addItem(c, 'wood_sword');
  I.addItem(c, 'iron_sword');
  I.equip(c, 'wood_sword');
  assert.equal(I.equip(c, 'iron_sword').ok, true);
  assert.equal(c.equipment.weapon, 'iron_sword');
  assert.equal(I.totalQty(c, 'wood_sword'), 1, 'старый меч в инвентаре');
});

// --- Торговля ---

test('makeShop: не магазин — null, магазин — детерминированный ассортимент', () => {
  const B = M.BUILDING_TYPES;
  assert.equal(I.makeShop(1, 2, B.TEMPLE, 3), null, 'храм — не магазин');
  assert.equal(I.makeShop(1, 2, B.CAVE_ENTRANCE, 3), null, 'пещера — не магазин');
  const a = I.makeShop(10, 20, B.APOTHECARY, 2);
  const b = I.makeShop(10, 20, B.APOTHECARY, 2);
  assert.ok(a);
  assert.deepEqual(a.stock, b.stock, 'детерминированность витрины');
  assert.notDeepEqual(a.stock, I.makeShop(11, 20, B.APOTHECARY, 2).stock,
    'другие координаты — другая витрина');
  // Ассортимент аптекаря — зелья и еда.
  for (const id of Object.keys(a.stock)) {
    assert.ok(['potion', 'food'].includes(I.getItem(id).kind));
  }
  assert.ok(Object.keys(a.stock).length >= 1, 'магазин пуст');
});

test('makeShop: богатство 3 — универсам, смесь всего', () => {
  const B = M.BUILDING_TYPES;
  const shop = I.makeShop(30, 40, B.WEAPONS_SHOP, 3);
  const kinds = new Set(Object.values(shop.stock).length
    ? Object.keys(shop.stock).map((id) => I.getItem(id).kind) : []);
  assert.ok(kinds.has('weapon'), 'универсам продаёт оружие');
  assert.ok(kinds.size > 1, 'универсам — смесь типов');
});

test('расчёт цен: богатство постройки и навык «Торговец»', () => {
  const B = M.BUILDING_TYPES;
  const shop0 = I.makeShop(10, 20, B.APOTHECARY, 0);
  const shop3 = I.makeShop(10, 20, B.APOTHECARY, 3);
  const plain = createCharacter();
  const merchant = createCharacter();
  merchant.secondary.merchant = 10; // −50% покупка, +50% продажа

  const v = I.getItem('healing_potion').value; // 10
  // Торговец 0: покупка = value × (1 − 0.1×богатство).
  assert.equal(I.buyPrice(shop0, 'healing_potion', plain), v); // 10
  assert.equal(I.buyPrice(shop3, 'healing_potion', plain), Math.round(v * 0.7)); // 7
  // Торговец 10: ещё ×0.5.
  assert.equal(I.buyPrice(shop0, 'healing_potion', merchant), Math.round(v * 0.5)); // 5
  assert.equal(I.buyPrice(shop3, 'healing_potion', merchant), Math.max(1, Math.round(v * 0.7 * 0.5))); // 4
  // Продажа = value × (1 + 0.15×богатство) × (1 + 0.05×торговец).
  assert.equal(I.sellPrice(shop0, 'healing_potion', plain), v); // 10
  assert.equal(I.sellPrice(shop3, 'healing_potion', plain), Math.round(v * 1.45)); // 15
  assert.equal(I.sellPrice(shop0, 'healing_potion', merchant), Math.round(v * 1.5)); // 15
  assert.equal(I.sellPrice(shop3, 'healing_potion', merchant), Math.round(v * 1.45 * 1.5)); // 22
});

test('buyItem/sellItem: покупка и продажа меняют золото и инвентарь', () => {
  const B = M.BUILDING_TYPES;
  const shop = I.makeShop(10, 20, B.APOTHECARY, 2);
  shop.stock.healing_potion = 5;
  const c = createCharacter(); // gold = 100
  const price = I.buyPrice(shop, 'healing_potion', c);

  assert.equal(I.buyItem(shop, c, 'healing_potion', 2).ok, true);
  assert.equal(c.gold, 100 - 2 * price);
  assert.equal(I.totalQty(c, 'healing_potion'), 2);
  assert.equal(shop.stock.healing_potion, 3);

  // Нет в наличии (реагент в аптеке не продаётся вовсе).
  assert.equal(I.buyItem(shop, c, 'sulfur').ok, false, 'нет в наличии');
  // Мало золота.
  c.gold = 0;
  const poor = I.buyItem(shop, c, 'healing_potion');
  assert.equal(poor.ok, false);
  assert.match(poor.reason, /золота/);

  // Продажа: аптекарь скупает зелья.
  c.gold = 50;
  const sell = I.sellItem(shop, c, 'healing_potion', 1);
  assert.equal(sell.ok, true);
  assert.equal(c.gold, 50 + I.sellPrice(shop, 'healing_potion', c));
  assert.equal(I.totalQty(c, 'healing_potion'), 1);
  // Оружие аптекарь не скупает.
  I.addItem(c, 'wood_sword');
  assert.equal(I.sellItem(shop, c, 'wood_sword').ok, false, 'не скупают');
  const weaponsShop = I.makeShop(10, 21, B.WEAPONS_SHOP, 1);
  assert.equal(I.sellItem(weaponsShop, c, 'wood_sword').ok, true, 'оружейная скупает');
});

// --- Сундуки подземелий: предметы — id из каталога ---

test('сундуки: DUNGEON_ITEMS — id из каталога', () => {
  const D = require('../src/dungeon.js');
  for (const type of Object.keys(D.DUNGEON_TYPES)) {
    const t = D.DUNGEON_TYPES[type];
    for (const id of D.DUNGEON_ITEMS[t]) {
      assert.ok(I.getItem(id), 'неизвестный предмет каталога: ' + id + ' (' + type + ')');
    }
  }
  const px = M.syntheticPixels(8, 8, 128, 128, 128, 255);
  for (const terrain of [M.TERRAIN.GRASS, M.TERRAIN.FOREST, M.TERRAIN.SWAMP]) {
    const d = D.createDungeon(9, 9, px, terrain);
    const c = D.generateDungeonContents(d, { totalXp: 1234, level: 5 });
    for (const ch of c.chests) {
      if (ch.item) assert.ok(I.getItem(ch.item), 'сундук: неизвестный предмет ' + ch.item);
    }
  }
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
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

// --- Задача 000059: src/items-data.js генерируется из JSON-каталога ---
//
// Каталог assets/items — source of truth; src/items-data.js —
// сгенерированное зеркало (scripts/sync-items-data.js, npm sync:items),
// как npc-data.js/skills-data.js/dungeons-data.js: шапка GENERATED,
// повторный запуск byte-identical (идемпотентность — дрейф-гейт 000054),
// запись атомарная (конвенцию write-atomic.js автоматически проверяет
// tests/sync-all.test.js по имени sync-*.js).
// ВАЖНО: обёртка модуля остаётся ПЛОСКОЙ — root.Game.ITEMS (не
// Game.ItemsData): items.js и все vm-цепочки читают G.ITEMS. Контракт
// без изменений — ноль правок в потребителях, regressия — vm-тесты
// 000060 ниже и полная цепочка index.html (tests/main-visuals.test.js).
// Число записей в каталоге ДИНАМИЧЕСКОЕ (42 на момент написания,
// росло в 000044) — тесты считают его от каталога, не хардкодят.

test('src/items-data.js: шапка GENERATED (синхронизируется из assets/items)', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'items-data.js'), 'utf8');
  assert.ok(
    src.includes('GENERATED — не править руками, синхронизируется из assets/items (scripts/sync-items-data.js)'),
    'в шапке нет пометки «GENERATED — не править руками»');
});

test('sync-items-data.js: существует, exit 0, идемпотентен (повторный запуск — byte-identical)', () => {
  const ROOT = path.join(__dirname, '..');
  const script = path.join(ROOT, 'scripts', 'sync-items-data.js');
  assert.ok(fs.existsSync(script), 'scripts/sync-items-data.js не существует');
  const outFile = path.join(ROOT, 'src', 'items-data.js');
  const before = fs.readFileSync(outFile);
  const res = spawnSync(process.execPath, [script], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(res.status, 0,
    'скрипт завершился с ошибкой: ' + (res.stderr || res.stdout));
  assert.deepEqual(fs.readFileSync(outFile), before,
    'повторный запуск скрипта изменил src/items-data.js (не идемпотентно)');
});

test('package.json: npm-скрипт sync:items (интерфейс единый с sync:npc/skills)', () => {
  const pkg = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', 'package.json'), 'utf8'));
  assert.equal(pkg.scripts['sync:items'], 'node scripts/sync-items-data.js');
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

// --- Практика: источники опыта (задача 000013) ---

test('useItem: зелье — практика «Алхимик», еда — «Сердце природы»', () => {
  const c = createCharacter();
  I.addItem(c, 'healing_potion', 2);
  I.addItem(c, 'bread');
  const r1 = I.useItem(c, 'healing_potion');
  assert.equal(r1.practice.skill, 'alchemy');
  assert.equal(c.skillXp.alchemy, 2, 'опыт за применение зелья');
  const r2 = I.useItem(c, 'healing_potion');
  assert.equal(r2.practice.skill, 'alchemy');
  assert.equal(c.skillXp.alchemy, 4, 'опыт копится за каждое применение');
  const r3 = I.useItem(c, 'bread');
  assert.equal(r3.practice.skill, 'nature');
  assert.equal(c.skillXp.nature, 2);
});

test('каталог: новые книги и свитки — skill_book с эффектом skill_xp', () => {
  const expected = {
    stone_fist_grimoire: 'fists',
    iron_hide_tome: 'hide',
    fire_spellbook: 'firelord',
    ice_spellbook: 'icelord',
    heavy_tome: 'heavy',
    archer_scroll: 'archer',
    meditation_scroll: 'meditation',
    nature_scroll: 'nature',
  };
  for (const [id, skill] of Object.entries(expected)) {
    const it = I.getItem(id);
    assert.ok(it, 'нет предмета ' + id);
    assert.equal(it.kind, 'skill_book');
    assert.equal(it.effect.kind, 'skill_xp');
    assert.equal(it.effect.skill, skill);
    assert.ok(it.effect.amount >= 1, id + ': amount');
  }
});

test('каталог: сырьевые предметы присутствуют (задача 000044)', () => {
  // Сырьё для «с нуля»-рецептов крафта: руда, древесина, камень, кожа,
  // уголь, травы и резец. Вид — reagent (kind «tool»/«material» не
  // существует), effect у реагентов не бывает.
  const raw = [
    'iron_ore', 'copper_ore', 'wood_log', 'stone_chunk', 'hide',
    'coal', 'herb_healing', 'herb_mana', 'herb_bitter', 'stone_chisel',
  ];
  for (const id of raw) {
    const it = I.getItem(id);
    assert.ok(it, 'в каталоге нет сырьевого предмета: ' + id);
    assert.equal(it.kind, 'reagent', id + ': kind должен быть reagent');
    assert.equal(it.effect, undefined, id + ': у реагента не бывает effect');
    assert.ok(it.name && it.name.trim(), id + ': название не пустое');
    assert.ok(it.desc && it.desc.trim(), id + ': описание не пустое');
    assert.ok(it.weight >= 0.05 && it.weight <= 200, id + ': вес вне схемы');
    assert.ok(it.value >= 1 && it.value <= 100000, id + ': цена вне схемы');
  }
});

test('useItem: книга обходит потолок практикой, на максимуме — без опыта', () => {
  const c = createCharacter(); // сила 1 → потолок «Тяжёлого оружия» 2
  for (let i = 0; i < 3; i++) {
    assert.equal(I.addItem(c, 'heavy_tome').ok, true);
    const r = I.useItem(c, 'heavy_tome');
    assert.equal(r.ok, true);
    assert.equal(r.skill.ok, true);
  }
  // 3 тома × 30 = 90 опыта: 15 + 30 + 45 → уровень 3, выше потолка (2).
  assert.equal(c.secondary.heavy, 3, 'книги поднимают навык выше потолка');
  // На максимальном уровне — опыт не начисляется, сообщение об этом.
  c.secondary.heavy = 100;
  I.addItem(c, 'heavy_tome');
  const rMax = I.useItem(c, 'heavy_tome');
  assert.equal(rMax.ok, true, 'предмет всё равно применяется');
  assert.equal(rMax.skill.applied, 0);
  assert.match(rMax.message, /максимален/);
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

// --- sanitizeInventory / sanitizeEquipment (задачи 000029/000031) ---
// Ключевой сценарий: сейв в localStorage переживает апдейты каталога —
// слот с id, удалённым между сборками («призрак»), раньше давал
// `null.weight` в inventoryWeight и ронял старт игры; теперь отбрасывается.

test('sanitizeInventory: валидный инвентарь проходит без потерь', () => {
  const [a, b] = I.allItems();
  const inv = I.sanitizeInventory({
    slots: [{ id: a.id, qty: 3 }, { id: b.id, qty: 1 }],
    quick: [a.id, null, null],
  });
  assert.deepEqual(inv.slots, [{ id: a.id, qty: 3 }, { id: b.id, qty: 1 }]);
  assert.deepEqual(inv.quick, [a.id, null, null]);
  assert.equal(inv.slots.length, 2);
});

test('sanitizeInventory: «призрак»-предмет (id удалён из каталога) отбрасывается', () => {
  const [a] = I.allItems();
  const inv = I.sanitizeInventory({
    slots: [
      { id: 'removed_item_id', qty: 2 }, // такого предмета нет в каталоге
      { id: a.id, qty: 1 },
    ],
    quick: ['removed_item_id', null, null],
  });
  assert.deepEqual(inv.slots, [{ id: a.id, qty: 1 }]);
  assert.deepEqual(inv.quick, [null, null, null]);
  // И главное: инвентарь не роняет расчёт веса (регрессия critical-
  // сценария ревью: getItem(e.id) → null → null.weight).
  const c = createCharacter();
  c.inventory = inv;
  assert.doesNotThrow(() => I.inventoryWeight(c));
  assert.equal(I.totalQty(c, a.id), 1);
});

test('sanitizeInventory: мусорные записи отбрасываются, qty клэмпится', () => {
  const [a, b, c2] = I.allItems();
  const inv = I.sanitizeInventory({
    slots: [
      null,                    // null-запись (было: null.id → TypeError)
      42,                      // примитив
      'str',                   // строка
      { id: a.id },            // без qty → 1
      { id: a.id, qty: 0 },    // qty 0 → 1
      { id: a.id, qty: -3 },   // qty < 1 → 1
      { id: a.id, qty: '2' },  // нецелое → 1
      { id: a.id, qty: 9999 }, // qty > MAX_STACK → MAX_STACK
      { id: b.id, qty: 5 },
      { id: c2.id, qty: 2 },
    ],
    quick: [null, 42, 'junk'],
  });
  // a: 4 маленькие записи + крупная qty → стопка капится в MAX_STACK;
  // b и c2 — свои слоты.
  const slotA = inv.slots.find((x) => x.id === a.id);
  assert.ok(slotA);
  assert.equal(slotA.qty, I.MAX_STACK);
  assert.equal(inv.slots.length, 3);
  assert.ok(inv.slots.some((x) => x.id === b.id && x.qty === 5));
  assert.ok(inv.slots.some((x) => x.id === c2.id && x.qty === 2));
  assert.deepEqual(inv.quick, [null, null, null]);
});

test('sanitizeInventory: не больше INVENTORY_SLOTS слотов', () => {
  const many = I.allItems().slice(0, I.INVENTORY_SLOTS + 5)
    .map((it) => ({ id: it.id, qty: 1 }));
  const inv = I.sanitizeInventory({ slots: many, quick: null });
  assert.equal(inv.slots.length, I.INVENTORY_SLOTS);
  assert.ok(Array.isArray(inv.quick), 'quick восстанавливается как массив');
  assert.equal(inv.quick.length, I.QUICK_SLOTS);
});

test('sanitizeInventory: не-объект на входе → пустой инвентарь', () => {
  for (const junk of [null, undefined, 'str', 42, [{ id: 'x', qty: 1 }]]) {
    const inv = I.sanitizeInventory(junk);
    assert.deepEqual(inv.slots, []);
    assert.deepEqual(inv.quick, new Array(I.QUICK_SLOTS).fill(null));
  }
  // slots — не массив (было: inv.slots.reduce is not a function).
  const inv = I.sanitizeInventory({ slots: 'не массив', quick: 'нет' });
  assert.deepEqual(inv.slots, []);
  // inventory — truthy примитив (было: TypeError в ensureInventory).
  const c = createCharacter();
  c.inventory = 'примитив';
  c.inventory = I.sanitizeInventory(c.inventory);
  assert.doesNotThrow(() => I.inventoryWeight(c));
});

test('sanitizeEquipment: только id из каталога, прочее → null', () => {
  const [w, a] = I.allItems();
  assert.deepEqual(
    I.sanitizeEquipment({ weapon: w.id, armor: a.id }),
    { weapon: w.id, armor: a.id });
  assert.deepEqual(
    I.sanitizeEquipment({ weapon: 'nope', armor: 42, extra: w.id }),
    { weapon: null, armor: null });
  assert.deepEqual(
    I.sanitizeEquipment(null), { weapon: null, armor: null });
  assert.deepEqual(
    I.sanitizeEquipment('junk'), { weapon: null, armor: null });
  assert.deepEqual(
    I.sanitizeEquipment([w.id]), { weapon: null, armor: null });
});

test('сценарий ревью: битый персонаж из сейва не роняет старт (интеграция)', () => {
  // Воспроизведение critical-сценария: оболочка сейва валидна (status
  // 'ok'), но вложенные поля биты. Чистка через реальные модули должна
  // дать персонажа, с которым рендерные вызовы не бросают исключений.
  const P = require('../src/player.js');
  const [a] = I.allItems();
  const savedHero = {
    level: 3, xp: 0, gold: 10, hp: 20,
    primary: {
      strength: 2, dexterity: 1, constitution: 1,
      intelligence: 1, wisdom: 1, charisma: 1,
    },
    secondary: { endurance: '5' }, // нечисловой уровень (было: maxHP NaN)
    inventory: {
      slots: [
        { id: 'removed_between_builds', qty: 1 }, // призрак
        null,                                     // null-запись
        { id: a.id, qty: 2 },
      ],
      quick: 'битый',
    },
    equipment: { weapon: 'ghost_item', armor: 7 },
  };
  const clean = P.sanitizeSavedHero(savedHero);
  assert.ok(clean);
  const hero = P.createCharacter();
  Object.assign(hero, clean);
  hero.inventory = I.sanitizeInventory(savedHero.inventory);
  hero.equipment = I.sanitizeEquipment(savedHero.equipment);
  const dd = P.derived(hero);
  hero.hp = Math.min(Math.max(1, Math.round(hero.hp)), dd.maxHP);
  assert.ok(Number.isFinite(dd.maxHP), 'maxHP не NaN');
  assert.ok(Number.isFinite(hero.hp), 'hp не NaN');
  // Все вызовы, которые раньше бросали TypeError:
  assert.doesNotThrow(() => I.inventoryWeight(hero));
  assert.doesNotThrow(() => I.slotCount(hero));
  assert.doesNotThrow(() => I.equipmentStats(hero));
  assert.equal(I.totalQty(hero, a.id), 2);
  assert.deepEqual(hero.equipment, { weapon: null, armor: null });
});

// --- Задача 000060: единый источник ассортимента магазинов ---
//
// `особые_параметры.виды` каталога assets/buildings (5 «картовых»
// записей: Оружейная/Бронник/Аптекарь/Магазин магии/Таверна) — единый
// источник shopKindsFor. Таблица кода в items.js остаётся ТОЛЬКО
// фолбэком для vm-песочниц без каталога (combat-ui/dungeon-ui) —
// значения идентичны. Торговля (сток/seed/цены makeShop) не меняется —
// закреплена golden-пинами ниже.
// ВАЖНО: пятый магазин — ТАВЕРНА = запись 000044 (id 44, map_index 11);
// map_index 4 — Арена (id 7), НЕ магазин (→ null, без «виды»).

const BDIR = path.join(__dirname, '..', 'assets', 'buildings');
const bRec = (num) => JSON.parse(
  fs.readFileSync(path.join(BDIR, num + '.json'), 'utf8'));
// map_index → JSON-файл записи (независимый от src/buildings.js).
const SHOP_MAP_INDEX_TO_FILE = {
  0: '000001', 1: '000002', 2: '000003', 3: '000004', 11: '000044',
};

test('shopKindsFor: каталог (JSON assets/buildings) — источник истины (000060)', () => {
  const kindIds = Object.values(I.ITEM_KINDS);
  for (const [mi, file] of Object.entries(SHOP_MAP_INDEX_TO_FILE)) {
    const idx = Number(mi);
    const rec = bRec(file);
    assert.equal(rec.особые_параметры.map_index, idx, file + ': map_index = ' + idx);
    const виды = rec.особые_параметры.виды;
    assert.ok(Array.isArray(виды) && виды.length > 0,
      file + ': нет особых_параметры.виды (источник ассортимента)');
    for (const k of виды) {
      assert.ok(kindIds.includes(k), file + ': «' + k + '» не входит в ITEM_KINDS');
    }
    assert.deepEqual(I.shopKindsFor(idx), виды,
      'shopKindsFor(' + idx + ') == виды записи каталога (' + file + ')');
  }
});

test('shopKindsFor: не-магазины → null (без изменений, 000060)', () => {
  const B = M.BUILDING_TYPES;
  for (const idx of [
    B.ARENA, B.BLACKSMITH, B.ARCHERY_RANGE, B.ACADEMY,
    B.TEMPLE, B.CAVE_ENTRANCE, B.RUNE_STONE, B.NPC_HOUSE,
    B.NONE, 13,
  ]) {
    assert.equal(I.shopKindsFor(idx), null, 'тип постройки ' + idx + ' — не магазин');
  }
});

test('makeShop: golden (x, y, type, wealth) — сток БЕЗ ИЗМЕНЕНИЙ (000060)', () => {
  const B = M.BUILDING_TYPES;
  // Золотые снимки стоков, сделанные ДО правки: торговля не меняется
  // (seed = hash2(x,y)^(type+1), пул — тот же набор видов, цены те же).
  // Покрыты ВСЕ 5 «картовых» магазинов — включая ТАВЕРНУ (int 11) —
  // и универсам (богатство 3).
  const GOLDEN = [
    { x: 10, y: 20, type: B.WEAPONS_SHOP, w: 1, seed: 3248047077,
      stock: { wood_sword: 1, iron_sword: 2, steel_sword: 2, short_bow: 1, hunting_bow: 2, battle_axe: 2, war_hammer: 3 } },
    { x: 10, y: 20, type: B.ARMOR_SHOP, w: 2, seed: 3248047078,
      stock: { chainmail: 4, knight_plate: 3 } },
    { x: 10, y: 20, type: B.APOTHECARY, w: 2, seed: 3248047079,
      stock: { minor_healing: 3, greater_healing: 4, mana_potion: 3, mana_elixir: 3, bread: 1, meat: 2 } },
    { x: 30, y: 40, type: B.MAGIC_SHOP, w: 0, seed: 3346526316,
      stock: { sulfur: 2, moonstone: 2, phoenix_feather: 1, stone_fist_grimoire: 2, iron_hide_tome: 1, archer_scroll: 2, hide: 1, coal: 1, herb_healing: 2, stone_chisel: 2 } },
    { x: 5, y: 7, type: B.TAVERN, w: 0, seed: 766909004,
      stock: { healing_potion: 2, greater_healing: 2, mana_potion: 2, mana_elixir: 1, bread: 1, meat: 2 } },
    // Ре-пин 000133: универсам (wealth 3, пул allItems) — свитки
    // заклинаний (000043-000050) добавлены КОНЦОМ каталога →
    // существующие стоки не сдвинулись, += свитки, вытянутые rng-хвостом
    // (chill/magic_shield в этом (x,y) не выпали — и в золотом их нет).
    // Ре-пин 000165: свиток воскрешения (000051) — КОНЕЦ каталога
    // (rng-хвост пула allItems) → += resurrect_scroll: 5, остальные
    // ключи стока не сдвинулись (симуляция: seed/сток byte-identical).
    { x: 30, y: 40, type: B.WEAPONS_SHOP, w: 3, seed: 3346526313,
      stock: { iron_sword: 3, steel_sword: 3, hunting_bow: 5, battle_axe: 3, war_hammer: 3, leather_armor: 3, knight_plate: 2, healing_potion: 5, greater_healing: 4, mana_potion: 1, mana_elixir: 1, bread: 3, meat: 3, honey_cake: 1, alchemy_manual: 5, sword_treatise: 4, sulfur: 1, moonstone: 1, phoenix_feather: 2, stone_fist_grimoire: 1, iron_hide_tome: 2, fire_spellbook: 4, ice_spellbook: 2, heavy_tome: 4, archer_scroll: 3, copper_ore: 1, wood_log: 4, stone_chunk: 1, coal: 5, herb_healing: 5, herb_mana: 3, herb_bitter: 5, fireball_scroll: 5, flame_burst_scroll: 2, frost_bolt_scroll: 2, blizzard_scroll: 5, light_heal_scroll: 4, vine_scroll: 3, resurrect_scroll: 5 } },
  ];
  for (const g of GOLDEN) {
    const s = I.makeShop(g.x, g.y, g.type, g.w);
    assert.ok(s, 'магазин существует (' + g.x + ',' + g.y + ',' + g.type + ',' + g.w + ')');
    assert.equal(s.seed, g.seed, 'seed без изменений (' + g.type + ',' + g.w + ')');
    assert.deepEqual(s.stock, g.stock,
      'сток без изменений (x=' + g.x + ' y=' + g.y + ' type=' + g.type + ' wealth=' + g.w + ')');
  }
});

// --- Задача 000095: Барахолка лагеря (id 47) ---
//
// Сток стойки — формулой контракта
// memory/000095-camp-fire-bazaar.md §2.3:
//   seed = (hash2(x, y, CAMP_STOCK_SEED=0x43414d50)
//           ^ ((day+1) * 0x9E3779B9)) >>> 0;
//   rng  = mulberry32(seed);
//   пул  = allItems() видов особых_параметры.эффект.виды каталога
//          (000047: food/potion/weapon/armor);
//   if (rng() < 0.55 + 0.1*wealth) stock[id] = 1 + floor(rng()*(2+wealth));
//   пустой сток → пул[0].id = 1.
// wealth НЕ входит в сид (как makeShop — только type; у лагеря
// type = id каталога 47). BUY-ONLY: shopKindsFor(47) → null
// (нет map_index) → sellItem отказ, кнопок «продать» нет.

const campRec = bRec('000047');
const CAMP_KINDS = ['food', 'potion', 'weapon', 'armor'];

test('makeCampShop: golden (x, y, day, wealth) — формула контракта (000095)', () => {
  assert.equal(I.CAMP_STOCK_SEED, 0x43414d50,
    'CAMP_STOCK_SEED — 0x43414d50 (ASCII «CAMP»)');
  const PL = require('../src/perlin.js');
  const seedOf = (x, y, day) =>
    (PL.hash2(x, y, I.CAMP_STOCK_SEED) ^ ((day + 1) * 0x9E3779B9)) >>> 0;
  const GOLDEN_CAMP = [
    { x: 10, y: 20, day: 1, w: 2,
      stock: { iron_sword: 3, battle_axe: 3, war_hammer: 2,
        leather_armor: 4, chainmail: 2, knight_plate: 3,
        minor_healing: 4, healing_potion: 4, mana_potion: 1,
        bread: 3, meat: 4 } },
    { x: 10, y: 20, day: 2, w: 2,
      stock: { wood_sword: 1, steel_sword: 1, short_bow: 2,
        battle_axe: 1, war_hammer: 3, leather_armor: 1, chainmail: 1,
        minor_healing: 3, healing_potion: 4, greater_healing: 2,
        mana_potion: 1, mana_elixir: 3, bread: 3 } },
    { x: 10, y: 20, day: 1, w: 0,
      stock: { war_hammer: 2, leather_armor: 1, chainmail: 2,
        minor_healing: 1, greater_healing: 2, mana_potion: 2, meat: 2 } },
    { x: 10, y: 20, day: 1, w: 3,
      stock: { iron_sword: 4, hunting_bow: 2, battle_axe: 2,
        war_hammer: 2, leather_armor: 4, chainmail: 2, knight_plate: 2,
        minor_healing: 3, mana_potion: 1, bread: 3, meat: 5 } },
  ];
  for (const g of GOLDEN_CAMP) {
    const s = I.makeCampShop(g.x, g.y, g.day, g.w, campRec);
    assert.ok(s, 'барахолка существует (' + g.x + ',' + g.y + ',d' + g.day + ',' + g.w + ')');
    assert.equal(s.seed, seedOf(g.x, g.y, g.day),
      'seed = (tile, day) (' + g.x + ',' + g.y + ',d' + g.day + ')');
    assert.deepEqual(s.stock, g.stock,
      'golden-сток (x=' + g.x + ' y=' + g.y + ' day=' + g.day
      + ' wealth=' + g.w + ')');
    for (const id of Object.keys(s.stock)) {
      assert.ok(CAMP_KINDS.includes(I.getItem(id).kind),
        id + ': вид из каталога (000047)');
    }
  }
  // Форма обёртки — СОВМЕСТИМА с торговлей ядра (ui-tab-shop,
  // buyPrice/buyItem): { x, y, buildingType: 47 (id каталога),
  // wealth, stock, seed }.
  const s = I.makeCampShop(10, 20, 1, 2, campRec);
  assert.deepEqual(
    { x: s.x, y: s.y, buildingType: s.buildingType, wealth: s.wealth },
    { x: 10, y: 20, buildingType: 47, wealth: 2 },
    'обёртка { x, y, buildingType: 47, wealth }');
  // Детерминизм + wealth-кламп (1:1 makeShop).
  assert.deepEqual(I.makeCampShop(10, 20, 1, 2, campRec).stock,
    s.stock, 'повтор — тот же сток');
  assert.deepEqual(I.makeCampShop(10, 20, 1, 9, campRec).stock,
    I.makeCampShop(10, 20, 1, 3, campRec).stock, 'wealth 9 → 3');
  assert.equal(I.makeCampShop(10, 20, 1, 9, campRec).seed, s.seed,
    'seed не зависит от wealth');
  assert.notDeepEqual(I.makeCampShop(11, 21, 1, 2, campRec).stock,
    s.stock, 'другой тайл — другой сток');
});

test('makeCampShop: null-ветки fail-open (нет каталога/видов) (000095)', () => {
  assert.equal(I.makeCampShop(1, 2, 1, 1, null), null, 'record null — null');
  assert.equal(
    I.makeCampShop(1, 2, 1, 1,
      { id: 47, особые_параметры: {} }), null, 'без «эффект» — null');
  assert.equal(
    I.makeCampShop(1, 2, 1, 1,
      { id: 47, особые_параметры: { эффект: { respawn_days: 1 } } }),
    null, 'без «виды» — null');
  assert.equal(
    I.makeCampShop(1, 2, 1, 1,
      { id: 47, особые_параметры: { эффект: { виды: ['bogus'] } } }),
    null, 'все виды невалидны — null');
  // Невалидный вид ОТФИЛЬТРОВЫВАЕТСЯ (гард, не отказ): food остаётся.
  const s = I.makeCampShop(1, 2, 1, 1,
    { id: 47, особые_параметры: { эффект: { виды: ['food', 'bogus'] } } });
  assert.ok(s, 'один валидный вид — магазин');
  assert.ok(Object.keys(s.stock).length >= 1, 'не пуст');
  for (const id of Object.keys(s.stock)) {
    assert.equal(I.getItem(id).kind, 'food', id + ': только food');
  }
});

test('campStockDueRefresh: (day − entry.day) ≥ respawnDays, fail-open (000095)', () => {
  assert.equal(typeof I.campStockDueRefresh, 'function',
    'items.js: campStockDueRefresh — экспортирована');
  const fn = I.campStockDueRefresh;
  // Нет entry / мусор / не-int — ротация (fail-open).
  assert.equal(fn(null, 1, 1), true, 'entry null — ротация');
  assert.equal(fn('мусор', 5, 1), true, 'entry не-объект — ротация');
  assert.equal(fn({}, 5, 1), true, 'entry без day — ротация');
  assert.equal(fn({ day: 1 }, 0, 1), true, 'день 0 — ротация');
  assert.equal(fn({ day: '1' }, 5, 1), true, 'entry.day строка — ротация');
  // respawn_days из каталога (000047: 1): тот же день — НЕ, день+1 — ДА.
  assert.equal(fn({ day: 1 }, 1, 1), false, 'тот же день — НЕ');
  assert.equal(fn({ day: 1 }, 2, 1), true, 'день+1 — ДА (respawn 1)');
  // Общая формула: ≥, не >.
  assert.equal(fn({ day: 1 }, 3, 3), false, 'respawn 3: день 3 — НЕ');
  assert.equal(fn({ day: 1 }, 4, 3), true, 'respawn 3: день 4 — ДА');
});

test('serialize/restoreCampStocks: roundtrip, кламп, призраки, «будущий» день, мусор (000095)', () => {
  assert.equal(typeof I.serializeCampStocks, 'function',
    'items.js: serializeCampStocks — экспортирована');
  assert.equal(typeof I.restoreCampStocks, 'function',
    'items.js: restoreCampStocks — экспортирована');
  // tileAt — источник buildingWealth (в main.js — map.tileAt).
  const W = 2;
  const tileAt = (x, y) => ({ x, y, buildingId: 47, buildingWealth: W });
  const eA = I.makeCampShop(10, 20, 1, W, campRec);
  const eB = I.makeCampShop(11, 21, 1, W, campRec);
  // Сериализация: { 'x,y': { day, stock } }; seed НЕ пишется.
  assert.equal(I.serializeCampStocks(null), null, 'null — null');
  assert.equal(I.serializeCampStocks('мусор'), null, 'не-объект — null');
  assert.deepEqual(I.serializeCampStocks({}), {}, 'пусто — {}');
  assert.deepEqual(I.serializeCampStocks({
    '10,20': { day: 1, stock: Object.assign({}, eA.stock), seed: 999 },
    'мусор,ключ': 'не-объект',
    '3,4': { day: 0, stock: { bread: 1 } },
  }), { '10,20': { day: 1, stock: eA.stock } },
    'снимок: seed нет, entry-мусор и day<1 — skip');
  // Roundtrip: два ключа НЕЗАВИСИМО; seed воссоздан.
  const rt = I.restoreCampStocks(I.serializeCampStocks({
    '10,20': { day: 1, stock: Object.assign({}, eA.stock) },
    '11,21': { day: 1, stock: Object.assign({}, eB.stock) },
  }), 1, tileAt, campRec);
  assert.deepEqual(rt['10,20'].stock, eA.stock, 'roundtrip «10,20»');
  assert.deepEqual(rt['11,21'].stock, eB.stock, 'roundtrip «11,21»');
  assert.equal(typeof rt['10,20'].seed, 'number', 'seed воссоздан');
  // Кламп min(qty, initial); отсутствие — initial; призрак — отброс.
  const rp = I.restoreCampStocks({
    '10,20': { day: 1, stock: { bread: 0, meat: 99, ghost_item: 9 } },
  }, 1, tileAt, campRec);
  const init = eA.stock;
  for (const id of Object.keys(init)) {
    const saved = { bread: 0, meat: 99, ghost_item: 9 }[id];
    const expect = (Number.isInteger(saved) && saved >= 0)
      ? Math.min(saved, init[id]) : init[id];
    assert.equal(rp['10,20'].stock[id], expect, id + ': кламп/отсутствие');
  }
  assert.ok(!('ghost_item' in rp['10,20'].stock), 'призрак отброшен');
  // «Будущий» день (entry.day > day) и мусорные ключи — skip.
  assert.deepEqual(I.restoreCampStocks(
    { '10,20': { day: 99, stock: {} }, 'x,y': { day: 1, stock: {} },
      '10': { day: 1, stock: {} }, '10,20,3': { day: 1, stock: {} } },
    1, tileAt, campRec), {}, '«будущий» день и мусор — {}');
  assert.deepEqual(I.restoreCampStocks(null, 1, tileAt, campRec), {},
    'saved null — {}');
});

test('барахолка BUY-ONLY: sellItem отказ, buyPrice — wealth-скидка, buyItem мутирует сток (000095)', () => {
  const hero = createCharacter();
  hero.gold = 100;
  const s = I.makeCampShop(10, 20, 1, 2, campRec);
  // BUY-ONLY: 47 — не «картовый» индекс (нет map_index) →
  // shopKindsFor(47) → null → «продать» не с чего.
  assert.equal(I.shopKindsFor(47), null,
    'shopKindsFor(47) — null (нет map_index)');
  I.addItem(hero, 'bread', 1);
  assert.deepEqual(I.sellItem(s, hero, 'bread', 1),
    { ok: false, reason: 'магазин не скупает такие предметы' },
    'sellItem — отказ (buy-only)');
  // Цены — по wealth ОБОЛОЧКИ (1:1 buyPrice ядра): скидка 0.10×w.
  const bread = I.getItem('bread'); // value 2
  const w0 = I.makeCampShop(10, 20, 1, 0, campRec);
  const w3 = I.makeCampShop(10, 20, 1, 3, campRec);
  assert.equal(I.buyPrice(w0, 'bread', hero),
    Math.max(1, Math.round(bread.value * (1 - 0.10 * 0) * 1)),
    'buyPrice wealth 0 = value');
  assert.equal(I.buyPrice(w3, 'bread', hero),
    Math.max(1, Math.round(bread.value * (1 - 0.10 * 3) * 1)),
    'buyPrice wealth 3 = value × 0.7');
  assert.ok(I.buyPrice(w3, 'bread', hero) < I.buyPrice(w0, 'bread', hero),
    'богатство — дешевле');
  // buyItem: золото списано, сток мутирован in place, предмет добавлен.
  const qty0 = s.stock.bread;
  assert.ok(qty0 >= 1, 'bread в стоке (10,20,1,w2)');
  const invBefore = I.totalQty(hero, 'bread');
  const price = I.buyPrice(s, 'bread', hero);
  const r = I.buyItem(s, hero, 'bread', 1);
  assert.ok(r.ok, 'buyItem — ок');
  assert.equal(r.price, price, 'цена как buyPrice');
  assert.equal(hero.gold, 100 - price, 'золото списано');
  assert.equal(s.stock.bread, qty0 - 1, 'сток мутирован in place');
  assert.equal(I.totalQty(hero, 'bread'), invBefore + 1,
    'bread в инвентаре (+1)');
});

// vm-песочница: «браузерный» путь UMD (без module/exports, паттерн
// tests/map.test.js / tests/combat-ui.test.js). Цепочка — минимальная,
// БЕЗ buildings.js, как в tests/combat-ui.test.js.
const vm = require('node:vm');
function loadInSandbox(file, sandbox) {
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, '..', 'src', file), 'utf8'), sandbox);
}
// Меж-реальм: значения, созданные в vm-песочнице (массивы/объекты),
// имеют ЧУЖИЕ прототипы — deepStrictEqual (assert/strict) их отвергает.
// Нормализуем через JSON перед сравнением.
const fromVm = (v) => JSON.parse(JSON.stringify(v));
const ITEMS_CHAIN = [
  'global-settings.js', 'perlin.js', 'map.js',
  'skills-data.js', 'items-data.js', 'sheet.js', 'player.js', 'items.js',
];

test('vm-песочница: items.js без каталога — фолбэк-таблица, поведение идентично (000060)', () => {
  const sandbox = {};
  for (const f of ITEMS_CHAIN) loadInSandbox(f, sandbox);
  assert.equal(sandbox.Game.BUILDINGS, undefined, 'buildings.js не загружен');
  // Фолбэк — закреплённые значения (текущая таблица кода), без каталога.
  assert.deepEqual(fromVm(sandbox.Game.shopKindsFor(0)), ['weapon']);
  assert.deepEqual(fromVm(sandbox.Game.shopKindsFor(1)), ['armor']);
  assert.deepEqual(fromVm(sandbox.Game.shopKindsFor(2)), ['potion', 'food']);
  assert.deepEqual(fromVm(sandbox.Game.shopKindsFor(3)), ['reagent', 'skill_book']);
  assert.deepEqual(fromVm(sandbox.Game.shopKindsFor(11)), ['food', 'potion']);
  assert.equal(sandbox.Game.shopKindsFor(4), null, 'арена — не магазин');
  assert.equal(sandbox.Game.shopKindsFor(8), null, 'храм — не магазин');
  assert.equal(sandbox.Game.shopKindsFor(12), null, 'дом NPC — не магазин');
  // Торговля в песочнице — тот же сток, что в node (golden таверны).
  const s = sandbox.Game.makeShop(5, 7, 11, 0);
  assert.ok(s, 'таверна в песочнице — магазин');
  assert.equal(s.seed, 766909004, 'seed — как в node');
  assert.deepEqual(fromVm(s.stock),
    { healing_potion: 2, greater_healing: 2, mana_potion: 2, mana_elixir: 1, bread: 1, meat: 2 });
});

test('vm-песочница: каталог подхватывается лениво и является источником истины (000060)', () => {
  const sandbox = {};
  for (const f of ITEMS_CHAIN) loadInSandbox(f, sandbox);
  // Вызов ДО каталога: фолбэк. Результат не должен закэшироваться —
  // после подхвата каталога вывод обязан измениться.
  assert.deepEqual(fromVm(sandbox.Game.shopKindsFor(0)), ['weapon'], 'до каталога — фолбэк');
  loadInSandbox('buildings.js', sandbox);
  const G = sandbox.Game;
  // ДИВЕРГИРУЮЩАЯ фальшивая запись каталога: на каждом map_index
  // значение, ОТЛИЧНОЕ от кодовой таблицы (2 — мусор вне ITEM_KINDS).
  // Только реализация, читающая КАТАЛОГ (а не таблицу), даст эти
  // результаты; таблица кода — ['weapon'],['armor'],['potion','food'],
  // ['reagent','skill_book'],['food','potion'] для 0,1,2,3,11.
  const override = { 0: ['armor'], 1: ['weapon'], 2: ['мечи'], 3: ['reagent'], 11: ['food'] };
  G.BUILDINGS = G.BUILDINGS.map((b) => {
    const p = b && b.особые_параметры;
    const mi = p && p.map_index;
    if (typeof mi !== 'number') return b;
    const np = { ...p };
    if (Object.prototype.hasOwnProperty.call(override, mi)) np.виды = override[mi];
    else delete np.виды;
    return { ...b, особые_параметры: np };
  });
  G.buildingForMapIndex = (i) =>
    G.BUILDINGS.find((b) => b.особые_параметры
      && b.особые_параметры.map_index === i) || null;
  assert.deepEqual(fromVm(G.shopKindsFor(0)), ['armor'], 'map_index 0 — виды каталога (не таблица)');
  assert.deepEqual(fromVm(G.shopKindsFor(1)), ['weapon'], 'map_index 1 — виды каталога (не таблица)');
  assert.deepEqual(fromVm(G.shopKindsFor(3)), ['reagent'], 'map_index 3 — виды каталога (не таблица)');
  assert.deepEqual(fromVm(G.shopKindsFor(11)), ['food'], 'map_index 11 (таверна) — виды каталога');
  // Запись с невалидными «видами» — null (гард), НЕ таблица;
  // без «виды» — null (арена/храм не магазины). Мусор не роняет торговлю.
  assert.equal(G.shopKindsFor(2), null, 'мусорные «виды» — гард отклоняет (не таблица)');
  assert.equal(G.shopKindsFor(4), null, 'арена — без «виды»');
  assert.equal(G.shopKindsFor(8), null, 'храм — без «виды»');
  // makeShop в песочнице — пул из видов каталога.
  const s = G.makeShop(10, 20, 0, 1);
  assert.ok(s, 'магазин в песочнице (фальшивый каталог)');
  assert.ok(Object.keys(s.stock).length > 0, 'магазин не пуст');
  for (const id of Object.keys(s.stock)) {
    assert.equal(G.getItem(id).kind, 'armor', 'сток — только из видов каталога');
  }
});

test('vm-песочница: реальный каталог подхвачен лениво — shopKindsFor == виды JSON-записей (000060)', () => {
  const sandbox = {};
  for (const f of ITEMS_CHAIN) loadInSandbox(f, sandbox);
  // Вызов до загрузки каталога: фолбэк не должен закрепиться.
  assert.deepEqual(fromVm(sandbox.Game.shopKindsFor(11)), ['food', 'potion'], 'до каталога — фолбэк');
  loadInSandbox('buildings.js', sandbox);
  for (const [mi, file] of Object.entries(SHOP_MAP_INDEX_TO_FILE)) {
    const rec = bRec(file);
    assert.deepEqual(
      fromVm(sandbox.Game.shopKindsFor(Number(mi))),
      rec.особые_параметры.виды,
      'map_index ' + mi + ': shopKindsFor == виды записи каталога (JSON ' + file + ')');
  }
  assert.equal(sandbox.Game.shopKindsFor(4), null, 'арена — без «виды»');
  assert.equal(sandbox.Game.shopKindsFor(8), null, 'храм — без «виды»');
});

// --- Задача 000133: свитки заклинаний (kind spell_scroll, source 'scroll') ---
//
// КРАСНЫЕ тесты (TDD): написаны ДО реализации, падают на текущем
// (неизменённом) коде:
//   * assets/items/000043..000050.json отсутствуют (S1/S4-S8: нет
//     каталожных записей — addItem/useItem «неизвестный предмет»);
//   * kind 'spell_scroll' / effect.kind 'spell' не в schema.json (S2);
//   * пулы подземелий без свитков (S3);
//   * useItem — ветка spell_scroll отсутствует (S4: в красной стадии
//     свиток не изучает НИЧЕГО; S5-S8: отказ-пути не реализованы).
// Контракты — memory/000133-spell-scrolls-runes.md (§2) и
// memory/000133-spell-learning.md (§1-3). Ре-пины (дungeon-golden,
// зеркало items-data, A1-union) — стадия ЗЕЛЁНАЯ (§5), здесь — новые
// тесты только.

const SPELLS = require('../src/spells.js');

// Фиксированный состав (решение ТЗ, memory §2.2): файл → id → spell.
const SCROLLS_000133 = [
  { file: '000043.json', id: 'fireball_scroll', spell: 'fireball' },
  { file: '000044.json', id: 'flame_burst_scroll', spell: 'flame_burst' },
  { file: '000045.json', id: 'frost_bolt_scroll', spell: 'frost_bolt' },
  { file: '000046.json', id: 'blizzard_scroll', spell: 'blizzard' },
  { file: '000047.json', id: 'chill_scroll', spell: 'chill' },
  { file: '000048.json', id: 'light_heal_scroll', spell: 'light_heal' },
  { file: '000049.json', id: 'magic_shield_scroll', spell: 'magic_shield' },
  { file: '000050.json', id: 'vine_scroll', spell: 'vine' },
];

test('S1. 000133: каталог — 8 свитков, фиксированный состав (id/kind/effect/spell, 1-2 на школу, все 6 школ)', () => {
  const byFile = new Map();
  for (const f of fs.readdirSync(ITEMS_DIR)
      .filter((x) => /^\d{6}\.json$/.test(x))) {
    byFile.set(f, JSON.parse(
      fs.readFileSync(path.join(ITEMS_DIR, f), 'utf8')));
  }
  const jsById = new Map(I.allItems().map((it) => [it.id, it]));
  for (const e of SCROLLS_000133) {
    const j = byFile.get(e.file);
    assert.ok(j, e.file + ': файл в assets/items (red: файла нет)');
    assert.equal(j.id, e.id, e.file + ': id — ' + e.id + ' (red: записи нет)');
    const it = jsById.get(e.id);
    assert.ok(it, 'зеркало items-data.js: ' + e.id + ' (red: записи нет)');
    assert.deepEqual(it, j, e.id + ': зеркало ≡ JSON');
    assert.equal(it.kind, 'spell_scroll',
      e.id + ': kind — spell_scroll (red: kind неизвестен)');
    assert.equal(it.weight, 0.2, e.id + ': weight 0.2 (как книги/свитки)');
    assert.ok(it.value >= 45 && it.value <= 120,
      e.id + ': value 45..120 по уровню заклинания; факт: ' + it.value);
    assert.equal(it.effect.kind, 'spell', e.id + ': effect.kind «spell»');
    assert.equal(it.effect.spell, e.spell, e.id + ': effect.spell — ' + e.spell);
    assert.ok(SPELLS.SPELLS_BY_ID[e.spell],
      e.id + ': spell «' + e.spell + '» есть в каталоге заклинаний');
    assert.ok(String(it.name).startsWith('Свиток: '),
      e.id + ': имя «Свиток: <название>»; факт: ' + it.name);
  }
  // Состав ПОЛНЫЙ: ровно 8 предметов kind spell_scroll (ни больше,
  // ни меньше — решение ТЗ).
  const scrolls = I.allItems().filter((it) => it.kind === 'spell_scroll');
  assert.equal(scrolls.length, 8,
    'ровно 8 spell_scroll; факт: ' + scrolls.length);
  // 1-2 свитка на школу, все 6 школ (школа — по spell.школа).
  const bySchool = {};
  for (const it of scrolls) {
    const sch = SPELLS.SPELLS_BY_ID[it.effect.spell].школа;
    bySchool[sch] = (bySchool[sch] || 0) + 1;
  }
  assert.equal(Object.keys(bySchool).length, 6,
    'покрыты все 6 школ; факт: ' + JSON.stringify(bySchool));
  for (const [sch, n] of Object.entries(bySchool)) {
    assert.ok(n >= 1 && n <= 2,
      'школа «' + sch + '»: 1-2 свитка; факт: ' + n);
  }
});

// useItem (спелл-ветка) читает globalThis.Game ЛЕНИВО в момент ВЫЗОВА
// (паттерн G.Craft items.js:533-539): на время вызова Game =
// { Spells }, затем восстановление (как withGame в
// building-effects.test.js).
function withGame000133(game, fn) {
  const had = Object.prototype.hasOwnProperty.call(globalThis, 'Game');
  const prev = globalThis.Game;
  globalThis.Game = game;
  try {
    return fn();
  } finally {
    if (had) globalThis.Game = prev;
    else delete globalThis.Game;
  }
}

test('S4. 000133: useItem свиток — успех (INT 11): изучено, предмет списан', () =>
  withGame000133({ Spells: SPELLS }, () => {
    const c = createCharacter();
    c.primary.intelligence = 11; // Знаток (ранг 2) — fireball (ур. 2)
    const add = I.addItem(c, 'fireball_scroll', 1);
    assert.equal(add.ok, true,
      'выдача свитка (red: неизвестный предмет): ' + JSON.stringify(add));
    const res = I.useItem(c, 'fireball_scroll');
    assert.equal(res.ok, true,
      'useItem: ok (red: ' + JSON.stringify(res) + ')');
    assert.ok(c.spells.includes('fireball'),
      'заклинание изучено (red: useItem без ветки spell_scroll)');
    assert.equal(I.totalQty(c, 'fireball_scroll'), 0,
      'свиток тратится (ровно 1 шт.)');
    assert.match(res.message, /Изучено/i,
      'message «Изучено: …»; факт: ' + res.message);
  }));

test('S5. 000133: useItem свиток — низкий ранг (INT 10): отказ с причиной, предмет не тратится', () =>
  withGame000133({ Spells: SPELLS }, () => {
    const c = createCharacter();
    c.primary.intelligence = 10; // Ученик (ранг 1) < tier 2
    const add = I.addItem(c, 'fireball_scroll', 1);
    assert.equal(add.ok, true, 'выдача свитка (red: неизвестный предмет)');
    const res = I.useItem(c, 'fireball_scroll');
    assert.equal(res.ok, false,
      'отказ (red: свиток молча тратится без эффекта — ok:true)');
    assert.match(res.reason, /нужен ранг школы «Знаток»/,
      'причина из canLearn; факт: ' + res.reason);
    assert.ok(!c.spells.includes('fireball'), 'заклинание не изучено');
    assert.equal(I.totalQty(c, 'fireball_scroll'), 1,
      'предмет НЕ тратится (отказ — не расход)');
  }));

test('S6. 000133: useItem свиток — совершенствование без базового (INT 26, без fireball): «нужно базовое заклинание», не потрачен', () =>
  withGame000133({ Spells: SPELLS }, () => {
    const c = createCharacter();
    c.primary.intelligence = 26; // Мастер (ранг 3) — tier 3 открыт
    // fireball НЕ изучено — flame_burst (база fireball) отказывается.
    const add = I.addItem(c, 'flame_burst_scroll', 1);
    assert.equal(add.ok, true, 'выдача свитка (red: неизвестный предмет)');
    const res = I.useItem(c, 'flame_burst_scroll');
    assert.equal(res.ok, false, 'отказ (red: молча тратится — ok:true)');
    assert.match(res.reason, /нужно базовое заклинание: Огненный шар/,
      'причина из canLearn; факт: ' + res.reason);
    assert.ok(!c.spells.includes('flame_burst'), 'совершенствование не изучено');
    assert.equal(I.totalQty(c, 'flame_burst_scroll'), 1, 'предмет не тратится');
  }));

test('S7. 000133: useItem свиток — дубль: «уже изучено», предмет не тратится, дубля в книге нет', () =>
  withGame000133({ Spells: SPELLS }, () => {
    const c = createCharacter();
    c.primary.intelligence = 11;
    c.spells.push('fireball'); // уже изучено
    const add = I.addItem(c, 'fireball_scroll', 1);
    assert.equal(add.ok, true, 'выдача свитка (red: неизвестный предмет)');
    const res = I.useItem(c, 'fireball_scroll');
    assert.equal(res.ok, false, 'отказ (red: молча тратится — ok:true)');
    assert.match(res.reason, /уже изучено/, 'причина; факт: ' + res.reason);
    assert.equal(c.spells.filter((s) => s === 'fireball').length, 1,
      'дубля в книге заклинаний нет');
    assert.equal(I.totalQty(c, 'fireball_scroll'), 1, 'предмет не тратится');
  }));

test('S8. 000133: useItem свиток — без Game.Spells: без исключения, ok:false «заклинания недоступны», предмет цел (000053)', () => {
  const c = createCharacter();
  c.primary.intelligence = 11;
  const add = I.addItem(c, 'fireball_scroll', 1);
  assert.equal(add.ok, true, 'выдача свитка (red: неизвестный предмет)');
  let res = null;
  let threw = false;
  withGame000133({}, () => { // Game без Spells — деградация
    try {
      res = I.useItem(c, 'fireball_scroll');
    } catch (e) { threw = true; }
  });
  assert.equal(threw, false, 'без исключения (000053: игра не падает)');
  assert.equal(res.ok, false,
    'ok:false (red: свиток молча тратится — ok:true)');
  assert.equal(res.reason, 'заклинания недоступны',
    'причина деградации (контракт §2.4); факт: ' + res.reason);
  assert.ok(!c.spells.includes('fireball'), 'заклинание не изучено');
  assert.equal(I.totalQty(c, 'fireball_scroll'), 1, 'предмет цел');
});

// --- Задача 000165: Свиток воскрешения (kind resurrection_scroll,
// effect {kind:'resurrect'}) ---
//
// КРАСНЫЕ тесты (TDD): написаны ДО реализации, падают на текущем
// (неизменённом) коде:
//   * assets/items/000051.json отсутствует (I1: файл, schema.json,
//     зеркало items-data.js, нестаккуемость — «неизвестный предмет»);
//   * enum'ы schema.json без 'resurrection_scroll' / 'resurrect'
//     (I3 — tests/assets-schemas.test.js, прецедент 000133);
//   * ветка useItem (мир) для нового kind отсутствует (I2: в красной
//     стадии предмета нет в каталоге вовсе — «неизвестный предмет»;
//     зелёная — отказ ДО расхода, предмет не тратится).
// Контракты — memory/000165-resurrection-scroll.md (§3.1 форма 000051,
// §3.5 строки, Р-1..Р-12). Тех-ре-пин makeShop golden (универсам:
// += resurrect_scroll) — стадия ЗЕЛЁНАЯ (паттерн 000133): в красной
// фазе каталог не меняется — golden не падает.

const { validate: validateSchema165 } = require('./json-schema.js');

test('000165 I1: каталог 000051.json — 51-й файл, поля по ТЗ, schema.json, зеркало items-data.js, нестаккуемый', () => {
  // (a) Нумерация: 000051.json — 51-й файл, следующий свободный слот
  //     (краснота: файла нет).
  const files = fs.readdirSync(ITEMS_DIR)
    .filter((f) => /^\d{6}\.json$/.test(f)).sort();
  assert.equal(files.length, 51,
    'каталог — 51 файл (краснота: ' + files.length + ')');
  assert.equal(files[50], '000051.json',
    '000051.json — 51-й файл (краснота: файла нет)');
  const j = JSON.parse(
    fs.readFileSync(path.join(ITEMS_DIR, '000051.json'), 'utf8'));
  // (b) Поля по ТЗ (контракт §3.1): id/name/kind/weight/value/desc/
  //     effect. kind 'resurrection_scroll' — НОВЫЙ (не spell_scroll:
  //     тот = свиток-обучалка 000133); effect — ТОЛЬКО
  //     { kind: 'resurrect' } (полей нет: цель не выбирается,
  //     параметры — в ядре combat.js).
  assert.equal(j.id, 'resurrect_scroll');
  assert.equal(j.name, 'Свиток воскрешения');
  assert.equal(j.kind, 'resurrection_scroll',
    'НОВЫЙ kind (краснота: kind неизвестен)');
  assert.equal(j.weight, 0.5);
  assert.equal(j.value, 150);
  assert.equal(j.desc,
    'В бою (быстрый слот): возвращает первого погибшего союзника на поле боя (50% HP). Цель не выбирается.',
    'desc закреплён (контракт Р-8, тон = SPEC L1500)');
  assert.deepEqual(j.effect, { kind: 'resurrect' },
    'effect — { kind: resurrect } ТОЛЬКО (НОВЫЙ effect-kind)');
  // (c) Валиден по schema.json (enum'ы расширены — краснота: enum'ы
  //     не содержат новых значений).
  const schema = JSON.parse(
    fs.readFileSync(path.join(ITEMS_DIR, 'schema.json'), 'utf8'));
  const errors = [];
  validateSchema165(schema, j, '000051.json', errors);
  assert.deepEqual(errors, [], 'схема: ' + errors.join('; '));
  // (d) Зеркало src/items-data.js (реген npm run sync:items):
  //     getItem ≡ JSON, каталог — 51 предмет (краснота: записи нет).
  const it = I.getItem('resurrect_scroll');
  assert.ok(it, 'зеркало items-data.js: resurrect_scroll '
    + '(краснота: записи нет)');
  assert.deepEqual(it, j, 'зеркало ≡ JSON');
  assert.equal(I.allItems().length, 51, 'allItems — 51 предмет');
  // (e) Нестаккуемый (ВНЕ STACKABLE, паттерн spell_scroll 000133):
  //     addItem ×2 → 2 слота qty 1 (не стопка).
  const c = createCharacter();
  assert.equal(I.addItem(c, 'resurrect_scroll').ok, true,
    'выдача свитка (краснота: неизвестный предмет)');
  assert.equal(I.addItem(c, 'resurrect_scroll').ok, true,
    'второй свиток (краснота: неизвестный предмет)');
  const slots = c.inventory.slots
    .filter((e) => e.id === 'resurrect_scroll');
  assert.equal(slots.length, 2, '2 слота (нестаккуемый, паттерн 000133)');
  for (const e of slots) assert.equal(e.qty, 1, 'qty 1 (не стопка)');
  assert.equal(I.totalQty(c, 'resurrect_scroll'), 2, 'всего 2 шт');
});

test('000165 I2: useItem в мире — отказ «Свиток воскрешения можно применить только в бою», предмет не тратится', () => {
  const c = createCharacter();
  const add = I.addItem(c, 'resurrect_scroll');
  assert.equal(add.ok, true,
    'выдача свитка (краснота: неизвестный предмет): ' + JSON.stringify(add));
  const hp0 = c.hp, mp0 = c.mp;
  const res = I.useItem(c, 'resurrect_scroll');
  assert.equal(res.ok, false,
    'отказ: только в бою (краснота: ветки useItem для kind нет): '
    + JSON.stringify(res));
  assert.equal(res.reason, 'Свиток воскрешения можно применить только в бою',
    'строка отказа дословно из ТЗ (контракт §3.5); факт: ' + res.reason);
  assert.equal(I.totalQty(c, 'resurrect_scroll'), 1,
    'предмет НЕ тратится (отказ — не расход)');
  assert.equal(c.hp, hp0, 'hp не мутирует');
  assert.equal(c.mp, mp0, 'mp не мутирует');
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const I = require('../src/items.js');
const M = require('../src/map.js');
const { createCharacter, SECONDARY_SKILLS } = require('../src/player.js');
const SKILLS_DATA = require('../src/skills-data.js');
const { validateData } = require('./json-schema.js');

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
  const ROOT = path.join(__dirname, '..');
  const { resolveRef } = require(path.join(ROOT, 'scripts', 'lib', 'json-ref.js'));
  for (const f of files) {
    const raw = fs.readFileSync(path.join(ITEMS_DIR, f), 'utf8');
    const j = JSON.parse(raw);
    if (j.effect && j.effect.kind === 'craft_recipe'
        && typeof j.effect.recipe === 'string') {
      const rr = resolveRef(ROOT, j.effect.recipe);
      assert.ok(rr.ok, f + ': effect.recipe — битая ссылка: ' + j.effect.recipe);
      j.effect = { ...j.effect, recipe: rr.id };
    }
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

test('быстрые слоты: перенос, проверка наличия, возврат, независимость от запаса', () => {
  const c = createCharacter();
  assert.equal(I.setQuick(c, 0, 'bread').ok, false, 'нет предмета в инвентаре');
  I.addItem(c, 'bread');
  I.addItem(c, 'meat');
  assert.equal(I.setQuick(c, 0, 'bread').ok, true);
  assert.equal(I.quickItem(c, 0), 'bread');
  assert.equal(I.totalQty(c, 'bread'), 0, '000223: единица в слоте, не в запасах');
  assert.equal(I.firstQuickSlot(c), 0);
  assert.equal(I.setQuick(c, 5, 'meat').ok, false, 'слот вне диапазона');
  assert.equal(I.setQuick(c, 1, 'meat').ok, true);
  assert.equal(I.firstQuickSlot(c), 0, 'первый занятый — 0');
  assert.equal(I.freeQuickSlot(c), 2);
  assert.equal(I.clearQuick(c, 0).ok, true);
  assert.equal(I.quickItem(c, 0), null);
  assert.equal(I.totalQty(c, 'bread'), 1, '000223: «убрать» — единица вернулась');
  // 000223: удаление запаса занятый слот НЕ чистит (своя единица;
  // старая авто-очистка removeItem убрана).
  assert.equal(I.setQuick(c, 0, 'bread').ok, true);
  I.removeItem(c, 'bread');
  assert.equal(I.totalQty(c, 'bread'), 0, 'запас пуст');
  assert.equal(I.quickItem(c, 0), 'bread', 'запас удалён — слот СОХРАНЯЕТСЯ');
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
  // Ре-пин 000230.02 (форменный): канон-форма — физ. слоты + зеркала;
  // старая 2-слотовая форма — backfill weapon→right_hand /
  // armor→torso (каталог-чек сохранён).
  const canon = emptyEquipment();
  canon.right_hand = w.id; canon.torso = a.id;
  canon.weapon = w.id; canon.armor = a.id;
  assert.deepEqual(
    I.sanitizeEquipment({ weapon: w.id, armor: a.id }),
    canon);
  assert.deepEqual(
    I.sanitizeEquipment({ weapon: 'nope', armor: 42, extra: w.id }),
    emptyEquipment());
  assert.deepEqual(
    I.sanitizeEquipment(null), emptyEquipment());
  assert.deepEqual(
    I.sanitizeEquipment('junk'), emptyEquipment());
  assert.deepEqual(
    I.sanitizeEquipment([w.id]), emptyEquipment());
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
  // Ре-пин 000230.02 (форменный): канон-форма (18 физ. слотов +
  // зеркала weapon/armor) — семантика «призрак + не-строка → null».
  assert.deepEqual(hero.equipment, emptyEquipment());
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
    // Ре-пин 000230.08: head-предметы (000083-000107, kind armor) —
    // КОНЕЦ каталога, rng-хвост пула [armor] → += 16 новых head
    // (straw_hat/wanderer_cap/travel_cloth/copper_band/amethyst_band/
    // mystic_cloth/sapphire_helm/star_hoop/crown_flame в этом (x,y) не
    // выпали), остальные ключи стока не сдвинулись (симуляция:
    // seed/старые стоки byte-identical).
    // Ре-пин 000230.09: ears+neck (000158-000207, kind armor) —
    // КОНЕЦ пула [armor] (свитки волны Огонь не в пуле — kind
    // spell_scroll), rng-хвост → += 33 новых украшения (17 в этом
    // (x,y) не выпали: leather_loop/clay_dangle/wood_bead/
    // amethyst_dangle/sapphire_hoop/gold_dangle/copper_pendant/
    // leather_choker/stone_beads/silver_chain/quartz_amulet/
    // moonstone_chain/amethyst_choker/sapphire_pendant/emerald_amulet/
    // rune_necklace/star_pendant), остальные ключи стока не сдвинулись
    // (node-симуляция: seed/старые стоки byte-identical).
    // Ре-пин 000230.10: torso-предметы (000208-000232, kind armor) —
    // КОНЕЦ пула [armor], rng-хвост → += 14 torso (не выпали:
    // wool_shirt/rough_kaftan/cloth_sutan/linen_tunic/wool_sutan/leather_kaftan/cloth_robe/leather_gown/stone_robe/deep_breath_robe/void_robe), остальные ключи стока не
    // сдвинулись (node-симуляция: seed/старые стоки byte-identical).

    // Ре-пин 000230.11: руки (000283-000332, kind armor) — КОНЕЦ
    // пула [armor], rng-хвост → += 37 рук (не выпали: leather_garter/archer_brace/iron_elbow/steel_bracers/gold_brace/swift_brace/rune_bracers/leather_gloves/bone_grips/fine_gloves/copper_gauntlets/night_gloves/iron_wraps);
    // остальные ключи стока не сдвинулись (node-симуляция: seed/старые
    // стоки byte-identical).
    { x: 10, y: 20, type: B.ARMOR_SHOP, w: 2, seed: 3248047078,
      stock: { chainmail: 4, knight_plate: 3, wool_cap: 3,
        leather_cap: 3, fur_hat: 4, cloth_band: 1,
        hood_common: 2, linen_cloth: 4, felt_hat: 3,
        silver_band: 3, obsidian_cloth: 3,
        quartz_cloth: 3, bone_band: 4, silver_helm: 2,
        gold_helm: 2, mithril_helm: 2, emerald_helm: 4,
        rune_hoop: 4, copper_hoop: 3, bone_stud: 1,
        copper_dangle: 3, shell_hoop: 1, faith_stud: 2,
        twine_hoop: 1, antler_hook: 4, stone_bead: 4,
        silver_hoop: 1, moonstone_dangle: 4,
        quartz_bead: 1, silver_stud: 3, obsidian_stud: 1,
        emerald_stud: 3, ruby_bell: 3, mithril_hoop: 1,
        star_earring: 4, whisper_hoop: 1, soul_bell: 1,
        copper_chain: 4, bone_beads: 2, twine_amulet: 3,
        clay_pendant: 4, wood_pendant: 4, shell_beads: 2,
        faith_necklace: 1, bone_pendant: 1,
        faith_amulet: 4, obsidian_pendant: 1,
        ruby_pendant: 4, gold_chain: 1,
        mithril_choker: 2, dawn_pendant: 3,
        linen_shirt: 1, cloth_tunic: 1, linen_gown: 1,
        hemp_robe: 2, wool_gown: 2, wool_kaftan: 2,
        embroidered_kaftan: 1, monk_sutan: 1,
        fine_kaftan: 3, ember_robe: 1, shadow_robe: 4,
        meditating_robe: 4, pilgrim_sutan: 4,
        aegis_mantle: 2,
        cloth_cuff: 2,
        leather_cuff: 4,
        hemp_bracer: 2,
        rough_bracer: 2,
        cloth_wrap: 4,
        iron_cuff: 4,
        bone_bracer: 1,
        wood_brace: 4,
        hide_cuff: 4,
        studded_bracer: 1,
        copper_brace: 4,
        silver_cuff: 3,
        shadow_wrap: 4,
        runic_cuff: 2,
        sapphire_bracer: 2,
        ghost_cuff: 3,
        star_armguard: 2,
        titan_brace: 1,
        cloth_gloves: 4,
        hide_gloves: 1,
        rough_gauntlets: 1,
        archer_gloves: 4,
        linen_wraps: 1,
        iron_gauntlets: 3,
        wood_guards: 3,
        studded_gloves: 1,
        quiver_gloves: 3,
        silver_gauntlets: 3,
        wind_gloves: 1,
        steel_gauntlets: 3,
        gold_gloves: 2,
        emerald_gauntlets: 2,
        phantom_gloves: 1,
        haste_wraps: 2,
        rune_gauntlets: 2,
        star_gloves: 3,
        void_gauntlet: 3} },
    { x: 10, y: 20, type: B.APOTHECARY, w: 2, seed: 3248047079,
      stock: { minor_healing: 3, greater_healing: 4, mana_potion: 3, mana_elixir: 3, bread: 1, meat: 2 } },
    // Ре-пин 000157.01: руды/минералы/самоцветы (000052-000062) — КОНЕЦ
    // каталога, rng-хвост пула [reagent, skill_book] → += 6 новых
    // reagent, остальные ключи стока не сдвинулись (симуляция:
    // seed/старые стоки byte-identical).
    // Ре-пин 000158.02: природные ингредиенты (000063-000076) — КОНЕЦ
    // каталога, rng-хвост пула [reagent, skill_book] → += 8 новых
    // reagent (berry_red/root_moon/fruit_apple/fruit_plum/fruit_quince/
    // mushroom_glow в этом (x,y) не выпали), остальные ключи стока не
    // сдвинулись (симуляция: seed/старые стоки byte-identical).
    { x: 30, y: 40, type: B.MAGIC_SHOP, w: 0, seed: 3346526316,
      stock: { sulfur: 2, moonstone: 2, phoenix_feather: 1, stone_fist_grimoire: 2, iron_hide_tome: 1, archer_scroll: 2, hide: 1, coal: 1, herb_healing: 2, stone_chisel: 2, silver_ore: 2, gold_ore: 1, mithril_ore: 1, quartz: 1, ruby: 1, amethyst: 1, berry_blue: 2, berry_wild: 2, herb_sun: 1, herb_wind: 2, root_ember: 2, root_rock: 1, mushroom_grey: 1, mushroom_ink: 1 } },
    { x: 5, y: 7, type: B.TAVERN, w: 0, seed: 766909004,
      stock: { healing_potion: 2, greater_healing: 2, mana_potion: 2, mana_elixir: 1, bread: 1, meat: 2 } },
    // Ре-пин 000133: универсам (wealth 3, пул allItems) — свитки
    // заклинаний (000043-000050) добавлены КОНЦОМ каталога →
    // существующие стоки не сдвинулись, += свитки, вытянутые rng-хвостом
    // (chill/magic_shield в этом (x,y) не выпали — и в золотом их нет).
    // Ре-пин 000165: свиток воскрешения (000051) — КОНЕЦ каталога
    // (rng-хвост пула allItems) → += resurrect_scroll: 5, остальные
    // ключи стока не сдвинулись (симуляция: seed/сток byte-identical).
    // Ре-пин 000157.01: руды/минералы/самоцветы (000052-000062) —
    // КОНЕЦ каталога, rng-хвост пула allItems → += 10 новых reagent
    // (diamond в этом (x,y) не выпал), остальные ключи стока не
    // сдвинулись (симуляция: seed/старые стоки byte-identical).
    // Ре-пин 000158.02: природные ингредиенты (000063-000076) —
    // КОНЕЦ каталога, rng-хвост пула allItems → += 12 новых reagent
    // (fruit_plum/mushroom_ink в этом (x,y) не выпали), остальные
    // ключи стока не сдвинулись (симуляция: seed/старые стоки
    // byte-identical).
    // Ре-пин 000232: чертежи (000077-000082) — КОНЕЦ каталога,
    // rng-хвост пула allItems → += 5 новых чертежей (blueprint_forge
    // в этом (x,y) не выпал), остальные ключи стока не сдвинулись
    // (симуляция: seed/старые стоки byte-identical).
    // Ре-пин 000230.08: head-предметы (000083-000107) — КОНЕЦ
    // каталога, rng-хвост пула allItems → += 18 новых head (cloth_band/
    // copper_band/sapphire_helm/mithril_helm/emerald_helm в этом (x,y)
    // не выпали), остальные ключи стока не сдвинулись (симуляция:
    // seed/старые стоки byte-identical).
    // Ре-пин 000235.07: свитки волны Огонь (000108-00132) — КОНЕЦ
    // каталога, rng-хвост пула allItems → += 20 свитков (ember/
    // lava_burst/burning_ground/burning_cage/flame_step в этом
    // (x,y) не выпали), остальные ключи стока не сдвинулись
    // (симуляция: seed/старые стоки byte-identical).
    // Ре-пин 000235.08: свитки волны Лёд (000133-000157) — КОНЕЦ
    // каталога, rng-хвост пула allItems → += 21 свиток (ice_lance/
    // hail/arctic_touch/frost_wisp в этом (x,y) не выпали),
    // остальные ключи стока не сдвинулись (симуляция:
    // seed/старые стоки byte-identical).
    // Ре-пин 000230.09: ears+neck (000158-000207) — КОНЕЦ каталога
    // (ПОСЛЕ свитков волны Лёд — порядок каталога: огонь 108-132, лёд
    // 133-157, уши/шея 158-207, torso 208-232), rng-хвост пула allItems.
    // Ре-пин 000230.10: torso (000208-000232, kind armor) — rng-хвост
    // пула allItems.
    // Ре-пин 000235.09: свитки волны Тень (000233-000257) — КОНЕЦ
    // каталога, rng-хвост пула allItems → += 22 свитка (shadow_bind/
    // shroud_of_night/dark_presence на этой клетке не выпали), остальные
    // ключи стока не сдвинулись (node-симуляция: seed/старые стоки
    // byte-identical). Значения хвоста — по финальному каталогу 257
    // (node-симуляция: base + огонь + лёд + уши/шея + torso + тень).
    // Ре-пин 000230.11: руки (000283-000332, kind armor) — КОНЕЦ
    // пула allItems, rng-хвост → += 46 рук (не выпали: leather_garter/cloth_gloves/rough_gauntlets/archer_gloves);
    // остальные ключи стока не сдвинулись (node-симуляция: seed/старые
    // стоки byte-identical).
    { x: 30, y: 40, type: B.WEAPONS_SHOP, w: 3, seed: 3346526313,
      stock: { iron_sword: 3, steel_sword: 3, hunting_bow: 5, battle_axe: 3,
        war_hammer: 3, leather_armor: 3, knight_plate: 2,
        healing_potion: 5, greater_healing: 4, mana_potion: 1,
        mana_elixir: 1, bread: 3, meat: 3, honey_cake: 1,
        alchemy_manual: 5, sword_treatise: 4, sulfur: 1, moonstone: 1,
        phoenix_feather: 2, stone_fist_grimoire: 1, iron_hide_tome: 2,
        fire_spellbook: 4, ice_spellbook: 2, heavy_tome: 4,
        archer_scroll: 3, copper_ore: 1, wood_log: 4, stone_chunk: 1,
        coal: 5, herb_healing: 5, herb_mana: 3, herb_bitter: 5,
        fireball_scroll: 5, flame_burst_scroll: 2, frost_bolt_scroll: 2,
        blizzard_scroll: 5, light_heal_scroll: 4, vine_scroll: 3,
        resurrect_scroll: 5, silver_ore: 5, gold_ore: 4, mithril_ore: 5,
        quartz: 3, obsidian: 4, phosphorite: 3, ruby: 3, sapphire: 5,
        emerald: 3, amethyst: 5, berry_red: 3, berry_blue: 5,
        berry_wild: 3, herb_sun: 3, herb_wind: 4, root_moon: 1,
        root_ember: 3, root_rock: 3, fruit_apple: 1, fruit_quince: 1,
        mushroom_grey: 4, mushroom_glow: 3, blueprint_alchemy: 3,
        blueprint_carving: 3, blueprint_woodwork: 2, blueprint_enchant: 4,
        blueprint_runecraft: 4, straw_hat: 2, wool_cap: 4, leather_cap: 3,
        wanderer_cap: 2, hood_common: 4, linen_cloth: 2, felt_hat: 2,
        travel_cloth: 3, silver_band: 2, obsidian_cloth: 5,
        amethyst_band: 5, quartz_cloth: 4, bone_band: 2, mystic_cloth: 4,
        gold_helm: 4, rune_hoop: 4, star_hoop: 1, crown_flame: 3,
        ignite_scroll: 1, fire_nova_scroll: 2, meteor_scroll: 1,
        flame_strike_scroll: 4, hellfire_scroll: 5,
        phlogiston_blast_scroll: 2, wall_of_fire_scroll: 4,
        burning_haze_scroll: 3, blazing_speed_scroll: 4,
        fire_aura_scroll: 3, heat_shield_scroll: 3, sunfire_scroll: 5,
        scorch_scroll: 5, cinder_scroll: 2, ashen_debilitation_scroll: 1,
        lava_snare_scroll: 1, flame_imp_scroll: 1, phoenix_scroll: 2,
        firelight_scroll: 4, hearthfire_scroll: 1, rime_bolt_scroll: 2,
        shatter_scroll: 5, glacial_spike_scroll: 3, permafrost_scroll: 1,
        absolute_zero_scroll: 3, ice_field_scroll: 1,
        wall_of_ice_scroll: 1, blizzard_field_scroll: 5,
        frost_aura_scroll: 4, ice_armor_scroll: 5, winter_haste_scroll: 4,
        frostbite_blessing_scroll: 5, slow_scroll: 2, frostbite_scroll: 2,
        deep_freeze_scroll: 1, freeze_scroll: 5, glacier_grasp_scroll: 2,
        winter_elemental_scroll: 3, frost_walk_scroll: 4,
        cold_breath_scroll: 1, frozen_stillness_scroll: 4, copper_hoop: 1,
        bone_stud: 2, leather_loop: 5, clay_dangle: 5, shell_hoop: 4,
        faith_stud: 5, twine_hoop: 4, antler_hook: 1, stone_bead: 4,
        silver_hoop: 1, moonstone_dangle: 2, quartz_bead: 3,
        silver_stud: 3, obsidian_stud: 3, amethyst_dangle: 2,
        sapphire_hoop: 2, emerald_stud: 2, gold_dangle: 1, mithril_hoop: 5,
        star_earring: 3, whisper_hoop: 2, copper_chain: 4, bone_beads: 3,
        twine_amulet: 3, clay_pendant: 5, wood_pendant: 5,
        copper_pendant: 5, shell_beads: 5, faith_necklace: 3,
        stone_beads: 4, bone_pendant: 1, silver_chain: 2, quartz_amulet: 2,
        moonstone_chain: 3, faith_amulet: 4, obsidian_pendant: 3,
        amethyst_choker: 5, sapphire_pendant: 4, emerald_amulet: 3,
        gold_chain: 2, mithril_choker: 1, rune_necklace: 4,
        star_pendant: 5, dawn_pendant: 3, wool_shirt: 1, cloth_tunic: 3,
        linen_gown: 5, hemp_robe: 3, rough_kaftan: 1, wool_gown: 2,
        cloth_sutan: 3, linen_tunic: 4, wool_kaftan: 4, wool_sutan: 3,
        leather_kaftan: 4, embroidered_kaftan: 4, cloth_robe: 4,
        leather_gown: 3, monk_sutan: 1, fine_kaftan: 4, stone_robe: 2,
        shadow_robe: 1, deep_breath_robe: 5, pilgrim_sutan: 3,
        void_robe: 3, aegis_mantle: 2, umbra_bolt_scroll: 5,
        drain_life_scroll: 1, void_arrow_scroll: 3,
        night_strike_scroll: 4, soul_drain_scroll: 2,
        shadowflame_scroll: 2, dark_nova_scroll: 4, shroud_scroll: 5,
        night_blade_scroll: 5, vampire_touch_scroll: 1, fear_scroll: 4,
        doom_mark_scroll: 2, despair_scroll: 5, shadow_curse_scroll: 3,
        nightmare_scroll: 5, dark_ensnare_scroll: 2,
        shadow_pool_scroll: 2, veil_of_night_scroll: 3,
        shadow_wraith_scroll: 5, void_horror_scroll: 5,
        shadow_step_scroll: 1, invisibility_scroll: 2,
        cloth_cuff: 4,
        leather_cuff: 5,
        hemp_bracer: 4,
        rough_bracer: 3,
        cloth_wrap: 4,
        iron_cuff: 3,
        bone_bracer: 5,
        wood_brace: 4,
        hide_cuff: 2,
        studded_bracer: 4,
        copper_brace: 3,
        archer_brace: 1,
        silver_cuff: 4,
        shadow_wrap: 2,
        iron_elbow: 5,
        runic_cuff: 4,
        steel_bracers: 5,
        gold_brace: 1,
        sapphire_bracer: 5,
        ghost_cuff: 2,
        swift_brace: 4,
        rune_bracers: 2,
        star_armguard: 4,
        titan_brace: 4,
        leather_gloves: 2,
        hide_gloves: 4,
        linen_wraps: 5,
        iron_gauntlets: 4,
        bone_grips: 5,
        wood_guards: 2,
        fine_gloves: 1,
        studded_gloves: 4,
        copper_gauntlets: 4,
        quiver_gloves: 1,
        silver_gauntlets: 1,
        night_gloves: 5,
        iron_wraps: 1,
        wind_gloves: 4,
        steel_gauntlets: 5,
        gold_gloves: 4,
        emerald_gauntlets: 2,
        phantom_gloves: 3,
        haste_wraps: 4,
        rune_gauntlets: 5,
        star_gloves: 3,
        void_gauntlet: 4} },
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
  // Ре-пин 000230.08: head-предметы (000083-000107, kind armor) —
  // КОНЕЦ каталога, rng-хвост пула allItems → += новые head в каждом
  // (x,y,day,wealth); остальные ключи стоков не сдвинулись (симуляция:
  // seed/старые стоки byte-identical).
  // Ре-пин 000230.09: ears+neck (000158-000207, kind armor) — КОНЕЦ
  // пула [armor] барахолки (виды каталога 000047), rng-хвост →
  // += новые украшения в каждом (x,y,day,wealth); остальные ключи
  // стоков не сдвинулись (node-симуляция: seed/старые стоки
  // byte-identical).
  const GOLDEN_CAMP = [
    // Ре-пин 000230.10: torso (000208-000232, kind armor) — КОНЕЦ
    // пула барахолки, rng-хвост → += 19 torso (не выпали: cloth_tunic/linen_gown/cloth_sutan/wool_kaftan/embroidered_kaftan/ember_robe), остальные
    // ключи стока не сдвигаются (node-симуляция: seed/старые стоки
    // byte-identical).

    // Ре-пин 000230.11: руки (000283-000332, kind armor) — КОНЕЦ
    // пула барахолки, rng-хвост → += 41 рук (не выпали: studded_bracer/copper_brace/iron_elbow/steel_bracers/titan_brace/cloth_gloves/wind_gloves/steel_gauntlets/star_gloves);
    // остальные ключи стока не сдвинулись (node-симуляция: seed/старые
    // стоки byte-identical).
    { x: 10, y: 20, day: 1, w: 2,
      stock: { iron_sword: 3, battle_axe: 3, war_hammer: 2,
        leather_armor: 4, chainmail: 2, knight_plate: 3,
        minor_healing: 4, healing_potion: 4,
        mana_potion: 1, bread: 3, meat: 4, straw_hat: 2,
        wool_cap: 4, leather_cap: 3, fur_hat: 4,
        cloth_band: 3, wanderer_cap: 1, hood_common: 2,
        linen_cloth: 3, travel_cloth: 4, silver_band: 1,
        copper_band: 2, amethyst_band: 4,
        quartz_cloth: 2, bone_band: 2, mystic_cloth: 1,
        silver_helm: 2, gold_helm: 4, mithril_helm: 2,
        emerald_helm: 2, rune_hoop: 4, crown_flame: 4,
        copper_hoop: 4, bone_stud: 2, leather_loop: 2,
        clay_dangle: 3, wood_bead: 2, copper_dangle: 1,
        shell_hoop: 4, twine_hoop: 2, antler_hook: 2,
        silver_hoop: 1, moonstone_dangle: 3,
        quartz_bead: 4, silver_stud: 3, obsidian_stud: 4,
        sapphire_hoop: 3, emerald_stud: 1, ruby_bell: 2,
        gold_dangle: 3, mithril_hoop: 4, star_earring: 4,
        soul_bell: 1, twine_amulet: 1, clay_pendant: 4,
        wood_pendant: 2, faith_necklace: 1,
        leather_choker: 3, stone_beads: 4,
        bone_pendant: 3, quartz_amulet: 3,
        moonstone_chain: 1, obsidian_pendant: 1,
        amethyst_choker: 1, sapphire_pendant: 3,
        emerald_amulet: 2, ruby_pendant: 2,
        mithril_choker: 3, rune_necklace: 4,
        star_pendant: 1, linen_shirt: 4, wool_shirt: 1,
        hemp_robe: 1, rough_kaftan: 1, wool_gown: 1,
        linen_tunic: 1, wool_sutan: 3, leather_kaftan: 1,
        cloth_robe: 2, leather_gown: 1, monk_sutan: 3,
        fine_kaftan: 1, stone_robe: 4, shadow_robe: 1,
        deep_breath_robe: 2, meditating_robe: 1,
        pilgrim_sutan: 4, void_robe: 4, aegis_mantle: 3,
        cloth_cuff: 1,
        leather_cuff: 2,
        hemp_bracer: 4,
        rough_bracer: 4,
        leather_garter: 2,
        cloth_wrap: 2,
        iron_cuff: 2,
        bone_bracer: 3,
        wood_brace: 3,
        hide_cuff: 3,
        archer_brace: 3,
        silver_cuff: 3,
        shadow_wrap: 1,
        runic_cuff: 4,
        gold_brace: 1,
        sapphire_bracer: 1,
        ghost_cuff: 3,
        swift_brace: 4,
        rune_bracers: 4,
        star_armguard: 1,
        leather_gloves: 2,
        hide_gloves: 4,
        rough_gauntlets: 4,
        archer_gloves: 3,
        linen_wraps: 2,
        iron_gauntlets: 1,
        bone_grips: 3,
        wood_guards: 1,
        fine_gloves: 4,
        studded_gloves: 2,
        copper_gauntlets: 1,
        quiver_gloves: 2,
        silver_gauntlets: 1,
        night_gloves: 3,
        iron_wraps: 3,
        gold_gloves: 2,
        emerald_gauntlets: 2,
        phantom_gloves: 3,
        haste_wraps: 3,
        rune_gauntlets: 4,
        void_gauntlet: 1} },
    // Ре-пин 000230.10: torso (000208-000232, kind armor) — КОНЕЦ
    // пула барахолки, rng-хвост → += 17 torso (не выпали: wool_shirt/cloth_tunic/hemp_robe/embroidered_kaftan/cloth_robe/fine_kaftan/ember_robe/void_robe), остальные
    // ключи стока не сдвигаются (node-симуляция: seed/старые стоки
    // byte-identical).

    // Ре-пин 000230.11: руки (000283-000332, kind armor) — КОНЕЦ
    // пула барахолки, rng-хвост → += 31 рук (не выпали: leather_cuff/hemp_bracer/rough_bracer/iron_cuff/shadow_wrap/runic_cuff/sapphire_bracer/ghost_cuff/titan_brace/cloth_gloves/bone_grips/wood_guards/fine_gloves/silver_gauntlets/iron_wraps/wind_gloves/haste_wraps/rune_gauntlets/star_gloves);
    // остальные ключи стока не сдвинулись (node-симуляция: seed/старые
    // стоки byte-identical).
    { x: 10, y: 20, day: 2, w: 2,
      stock: { wood_sword: 1, steel_sword: 1, short_bow: 2,
        battle_axe: 1, war_hammer: 3, leather_armor: 1,
        chainmail: 1, minor_healing: 3,
        healing_potion: 4, greater_healing: 2,
        mana_potion: 1, mana_elixir: 3, bread: 3,
        leather_cap: 4, cloth_band: 3, hood_common: 4,
        linen_cloth: 4, felt_hat: 3, travel_cloth: 2,
        silver_band: 3, obsidian_cloth: 2,
        amethyst_band: 3, quartz_cloth: 4, gold_helm: 2,
        mithril_helm: 1, emerald_helm: 4, star_hoop: 3,
        copper_hoop: 3, bone_stud: 2, leather_loop: 3,
        clay_dangle: 1, copper_dangle: 3, shell_hoop: 1,
        faith_stud: 4, antler_hook: 2, stone_bead: 2,
        moonstone_dangle: 1, obsidian_stud: 3,
        amethyst_dangle: 3, sapphire_hoop: 2,
        emerald_stud: 4, gold_dangle: 2, star_earring: 3,
        whisper_hoop: 4, copper_chain: 2, bone_beads: 3,
        twine_amulet: 1, wood_pendant: 4, shell_beads: 3,
        leather_choker: 3, bone_pendant: 2,
        silver_chain: 1, quartz_amulet: 1,
        moonstone_chain: 1, faith_amulet: 3,
        obsidian_pendant: 3, amethyst_choker: 4,
        sapphire_pendant: 1, emerald_amulet: 1,
        ruby_pendant: 3, mithril_choker: 1,
        rune_necklace: 1, star_pendant: 3,
        dawn_pendant: 2, linen_shirt: 2, linen_gown: 2,
        rough_kaftan: 2, wool_gown: 4, cloth_sutan: 3,
        linen_tunic: 1, wool_kaftan: 2, wool_sutan: 4,
        leather_kaftan: 4, leather_gown: 2,
        monk_sutan: 2, stone_robe: 4, shadow_robe: 4,
        deep_breath_robe: 3, meditating_robe: 1,
        pilgrim_sutan: 3, aegis_mantle: 4,
        cloth_cuff: 4,
        leather_garter: 2,
        cloth_wrap: 4,
        bone_bracer: 2,
        wood_brace: 1,
        hide_cuff: 4,
        studded_bracer: 1,
        copper_brace: 3,
        archer_brace: 1,
        silver_cuff: 4,
        iron_elbow: 4,
        steel_bracers: 4,
        gold_brace: 2,
        swift_brace: 3,
        rune_bracers: 4,
        star_armguard: 3,
        leather_gloves: 2,
        hide_gloves: 2,
        rough_gauntlets: 4,
        archer_gloves: 2,
        linen_wraps: 3,
        iron_gauntlets: 4,
        studded_gloves: 3,
        copper_gauntlets: 2,
        quiver_gloves: 4,
        night_gloves: 3,
        steel_gauntlets: 3,
        gold_gloves: 2,
        emerald_gauntlets: 1,
        phantom_gloves: 1,
        void_gauntlet: 2} },
    // Ре-пин 000230.10: torso (000208-000232, kind armor) — КОНЕЦ
    // пула барахолки, rng-хвост → += 15 torso (не выпали: wool_shirt/cloth_tunic/rough_kaftan/linen_tunic/leather_kaftan/monk_sutan/fine_kaftan/ember_robe/pilgrim_sutan/void_robe), остальные
    // ключи стока не сдвигаются (node-симуляция: seed/старые стоки
    // byte-identical).

    // Ре-пин 000230.11: руки (000283-000332, kind armor) — КОНЕЦ
    // пула барахолки, rng-хвост → += 29 рук (не выпали: leather_cuff/wood_brace/copper_brace/archer_brace/silver_cuff/gold_brace/sapphire_bracer/swift_brace/titan_brace/hide_gloves/rough_gauntlets/bone_grips/fine_gloves/night_gloves/iron_wraps/steel_gauntlets/gold_gloves/emerald_gauntlets/haste_wraps/star_gloves/void_gauntlet);
    // остальные ключи стока не сдвинулись (node-симуляция: seed/старые
    // стоки byte-identical).
    { x: 10, y: 20, day: 1, w: 0,
      stock: { war_hammer: 2, leather_armor: 1, chainmail: 2,
        minor_healing: 1, greater_healing: 2,
        mana_potion: 2, meat: 2, straw_hat: 1,
        fur_hat: 1, silver_band: 2, copper_band: 1,
        obsidian_cloth: 1, mystic_cloth: 2,
        silver_helm: 1, gold_helm: 1, rune_hoop: 1,
        star_hoop: 1, crown_flame: 1, copper_hoop: 1,
        bone_stud: 2, wood_bead: 1, copper_dangle: 1,
        twine_hoop: 2, antler_hook: 2, stone_bead: 1,
        silver_hoop: 1, silver_stud: 1, obsidian_stud: 1,
        amethyst_dangle: 2, ruby_bell: 1, gold_dangle: 2,
        mithril_hoop: 1, star_earring: 2,
        whisper_hoop: 2, soul_bell: 2, copper_chain: 2,
        twine_amulet: 2, clay_pendant: 1,
        wood_pendant: 1, copper_pendant: 2,
        shell_beads: 2, faith_necklace: 2,
        stone_beads: 1, quartz_amulet: 1,
        amethyst_choker: 2, emerald_amulet: 1,
        mithril_choker: 2, rune_necklace: 2,
        dawn_pendant: 2, linen_shirt: 1, linen_gown: 1,
        hemp_robe: 2, wool_gown: 1, cloth_sutan: 1,
        wool_kaftan: 2, wool_sutan: 2,
        embroidered_kaftan: 2, cloth_robe: 2,
        leather_gown: 1, stone_robe: 1, shadow_robe: 1,
        deep_breath_robe: 2, meditating_robe: 1,
        aegis_mantle: 1,
        cloth_cuff: 2,
        hemp_bracer: 1,
        rough_bracer: 2,
        leather_garter: 1,
        cloth_wrap: 2,
        iron_cuff: 2,
        bone_bracer: 1,
        hide_cuff: 2,
        studded_bracer: 1,
        shadow_wrap: 2,
        iron_elbow: 1,
        runic_cuff: 1,
        steel_bracers: 2,
        ghost_cuff: 1,
        rune_bracers: 1,
        star_armguard: 2,
        cloth_gloves: 2,
        leather_gloves: 2,
        archer_gloves: 2,
        linen_wraps: 2,
        iron_gauntlets: 1,
        wood_guards: 2,
        studded_gloves: 1,
        copper_gauntlets: 1,
        quiver_gloves: 2,
        silver_gauntlets: 2,
        wind_gloves: 1,
        phantom_gloves: 1,
        rune_gauntlets: 2} },
    // Ре-пин 000230.10: torso (000208-000232, kind armor) — КОНЕЦ
    // пула барахолки, rng-хвост → += 21 torso (не выпали: cloth_tunic/hemp_robe/cloth_sutan/embroidered_kaftan), остальные
    // ключи стока не сдвигаются (node-симуляция: seed/старые стоки
    // byte-identical).

    // Ре-пин 000230.11: руки (000283-000332, kind armor) — КОНЕЦ
    // пула барахолки, rng-хвост → += 43 рук (не выпали: hide_cuff/copper_brace/gold_brace/swift_brace/studded_gloves/wind_gloves/phantom_gloves);
    // остальные ключи стока не сдвинулись (node-симуляция: seed/старые
    // стоки byte-identical).
    { x: 10, y: 20, day: 1, w: 3,
      stock: { iron_sword: 4, hunting_bow: 2, battle_axe: 2,
        war_hammer: 2, leather_armor: 4, chainmail: 2,
        knight_plate: 2, minor_healing: 3,
        mana_potion: 1, bread: 3, meat: 5, straw_hat: 3,
        wool_cap: 5, leather_cap: 3, fur_hat: 5,
        cloth_band: 4, wanderer_cap: 1, hood_common: 3,
        linen_cloth: 4, travel_cloth: 4, silver_band: 1,
        copper_band: 2, obsidian_cloth: 4,
        quartz_cloth: 2, bone_band: 3, mystic_cloth: 2,
        silver_helm: 2, gold_helm: 5, mithril_helm: 2,
        emerald_helm: 2, rune_hoop: 4, crown_flame: 5,
        copper_hoop: 5, bone_stud: 2, leather_loop: 2,
        clay_dangle: 4, wood_bead: 3, copper_dangle: 1,
        shell_hoop: 5, faith_stud: 4, twine_hoop: 1,
        antler_hook: 5, stone_bead: 2, silver_hoop: 3,
        moonstone_dangle: 4, quartz_bead: 4,
        silver_stud: 5, obsidian_stud: 3,
        amethyst_dangle: 3, sapphire_hoop: 2,
        emerald_stud: 3, ruby_bell: 2, gold_dangle: 2,
        star_earring: 2, whisper_hoop: 5, soul_bell: 2,
        copper_chain: 3, bone_beads: 4, twine_amulet: 4,
        wood_pendant: 1, copper_pendant: 3,
        shell_beads: 5, faith_necklace: 3,
        leather_choker: 1, stone_beads: 2,
        bone_pendant: 4, silver_chain: 1,
        quartz_amulet: 1, moonstone_chain: 3,
        faith_amulet: 2, obsidian_pendant: 3,
        sapphire_pendant: 4, emerald_amulet: 5,
        ruby_pendant: 1, gold_chain: 1, rune_necklace: 2,
        star_pendant: 4, dawn_pendant: 1, linen_shirt: 1,
        wool_shirt: 1, linen_gown: 1, rough_kaftan: 3,
        wool_gown: 1, linen_tunic: 2, wool_kaftan: 2,
        wool_sutan: 3, leather_kaftan: 1, cloth_robe: 4,
        leather_gown: 2, monk_sutan: 2, fine_kaftan: 2,
        ember_robe: 4, stone_robe: 5, shadow_robe: 3,
        deep_breath_robe: 2, meditating_robe: 2,
        pilgrim_sutan: 5, void_robe: 5, aegis_mantle: 2,
        cloth_cuff: 3,
        leather_cuff: 3,
        hemp_bracer: 3,
        rough_bracer: 4,
        leather_garter: 4,
        cloth_wrap: 5,
        iron_cuff: 3,
        bone_bracer: 3,
        wood_brace: 1,
        studded_bracer: 4,
        archer_brace: 1,
        silver_cuff: 2,
        shadow_wrap: 4,
        iron_elbow: 5,
        runic_cuff: 5,
        steel_bracers: 1,
        sapphire_bracer: 4,
        ghost_cuff: 1,
        rune_bracers: 5,
        star_armguard: 4,
        titan_brace: 2,
        cloth_gloves: 1,
        leather_gloves: 4,
        hide_gloves: 1,
        rough_gauntlets: 4,
        archer_gloves: 3,
        linen_wraps: 1,
        iron_gauntlets: 2,
        bone_grips: 1,
        wood_guards: 3,
        fine_gloves: 3,
        copper_gauntlets: 1,
        quiver_gloves: 3,
        silver_gauntlets: 2,
        night_gloves: 3,
        iron_wraps: 4,
        steel_gauntlets: 4,
        gold_gloves: 4,
        emerald_gauntlets: 1,
        haste_wraps: 5,
        rune_gauntlets: 3,
        star_gloves: 5,
        void_gauntlet: 1}
      },
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

test('S1. 000133: каталог — 83 свитка (8 фиксированных 000133 + 25 волны Огонь + 25 волны Лёд + 25 волны Тень — ре-пин 000235.09), фиксированный состав (id/kind/effect/spell), все 6 школ', () => {
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
  assert.equal(scrolls.length, 83,
    'ровно 83 spell_scroll (8 фиксированных + 25 волны Огонь + 25 волны Лёд + 25 волны Тень); факт: '
    + scrolls.length);
  // Свитки на школу: все 6 школ; per-school пин — наличие (n >= 1):
  // волна Огонь добавляет 25 свитков школы «огонь» (27 всего), фикс
  // «1-2» не выдерживает серийность волн (решение R12, 000235.07).
  const bySchool = {};
  for (const it of scrolls) {
    const sch = SPELLS.SPELLS_BY_ID[it.effect.spell].школа;
    bySchool[sch] = (bySchool[sch] || 0) + 1;
  }
  assert.equal(Object.keys(bySchool).length, 6,
    'покрыты все 6 школ; факт: ' + JSON.stringify(bySchool));
  for (const [sch, n] of Object.entries(bySchool)) {
    assert.ok(n >= 1,
      'школа «' + sch + '»: есть свитки; факт: ' + n);
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
  // Ре-пин 000157.01 (Р0): каталог растёт 51 → 62 (добавляются
  // 000052-000062 — руды/минералы/самоцветы); 000051.json остаётся
  // 51-м файлом (append-only, слоты не сдвигаются).
  // Ре-пин 000158.02: каталог растёт 62 → 76 (добавляются
  // 000063-000076 — природные ингредиенты); слоты не сдвигаются.
  // Ре-пин 000232: каталог растёт 76 → 82 (добавляются
  // 000077-000082 — чертежи изучения видов крафта); слоты не сдвигаются.
  // Ре-пин 000230.08: каталог растёт 82 → 107 (добавляются
  // 000083-000107 — head-предметы); слоты не сдвигаются.
  // Ре-пин 000235.07: каталог растёт 107 → 132 (добавляются
  // 000108-000132 — свитки волны Огонь); слоты не сдвигаются.
  // Ре-пин 000235.08: каталог растёт 132 → 157 (добавляются
  // 000133-000157 — свитки волны Лёд); слоты не сдвигаются.
  // Ре-пин 000230.09: каталог растёт 157 → 207 (добавляются
  // 000158-000207 — уши 25 + шея 25); слоты не сдвигаются.
  // Ре-пин 000230.10: каталог растёт 207 → 232 (добавляются
  // 000208-000232 — torso 25); слоты не сдвигаются.
  // Ре-пин 000235.09: каталог растёт 232 → 257 (добавляются
  // 000233-000257 — свитки волны Тень); слоты не сдвигаются.
  // Ре-пин 000230.11: каталог растёт 257 → 307 (добавляются
  // 000283-000332 — forearms 25 + palms 25); слоты не сдвигаются
  // (append-блок КОНЦОМ каталога, D-03).
  assert.equal(files.length, 307,
    'каталог — 307 файлов (краснота: ' + files.length
    + ' — каталог ещё не расширен, 000230.08/000235.07/000235.08/'
    + '000230.09/000230.10/000235.09/000230.11)');
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
    'desc закреплён (контракт Р-8, тон = spec/items.md «Типы предметов»)');
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
  //     getItem ≡ JSON, каталог — 307 предмета (краснота: записи нет).
  //     Ре-пин 000157.01 (Р0): 51 → 62 (конец каталога).
  //     Ре-пин 000158.02: 62 → 76 (конец каталога).
  //     Ре-пин 000232: 76 → 82 (конец каталога).
  //     Ре-пин 000230.08: 82 → 107 (конец каталога).
  //     Ре-пин 000235.07: 107 → 132 (конец каталога).
  //     Ре-пин 000235.08: 132 → 157 (конец каталога).
  //     Ре-пин 000230.09: 157 → 207 (конец каталога).
  //     Ре-пин 000230.10: 207 → 232 (конец каталога).
  //     Ре-пин 000235.09: 232 → 257 (конец каталога).
  //     Ре-пин 000230.11: 257 → 307 (000283-000332 — руки 50).
  const it = I.getItem('resurrect_scroll');
  assert.ok(it, 'зеркало items-data.js: resurrect_scroll '
    + '(краснота: записи нет)');
  assert.deepEqual(it, j, 'зеркало ≡ JSON');
  // Ре-пин 000230.08: 82 → 107 (конец каталога).
  // Ре-пин 000235.07: 107 → 132 (000108-000132 — свитки волны Огонь).
  // Ре-пин 000235.08: 132 → 157 (000133-000157 — свитки волны Лёд).
  // Ре-пин 000230.09: 157 → 207 (000158-000207 — уши 25 + шея 25).
  // Ре-пин 000230.10: 207 → 232 (000208-000232 — torso 25).
  // Ре-пин 000235.09: 232 → 257 (000233-000257 — свитки волны Тень).
  // Ре-пин 000230.11: 257 → 307 (000283-000332 — руки 50).
  assert.equal(I.allItems().length, 307,
    'allItems — 307 предмета (краснота: ' + I.allItems().length
    + ' — зеркало не регенерировано, 000230.08/000235.07/000235.08/'
    + '000230.09/000230.10/000235.09/000230.11)');
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

// --- Задача 000157.01: каталог — 11 reagent (руды, минералы, самоцветы) ---
//
// КРАСНЫЕ (R1/R3/R5; Р0 — ре-пин «000165 I1» выше, 51 → 62):
// файлов assets/items/000052.json … 000062.json НЕТ (ENOENT), в зеркале
// src/items-data.js записей нет, в схемах поля tier нет (R2 —
// tests/assets-schemas.test.js). Контракт —
// memory/000157.01-ores-minerals-gems.md (§2 таблица, §3.1 тесты,
// §7 tier = it.tier || 1). Порядок ключей JSON = канонический sync KEYS
// id,name,kind,weight,value,tier,desc (Q7). Без effect (reagent-контракт
// src/items.js L88). id append-only: следующий свободный слот = 000063.

const ORES_015701 = [
  { file: '000052.json', id: 'silver_ore', tier: 2, weight: 1, value: 15 },
  { file: '000053.json', id: 'gold_ore', tier: 3, weight: 1, value: 30 },
  { file: '000054.json', id: 'mithril_ore', tier: 4, weight: 0.5, value: 80 },
  { file: '000055.json', id: 'quartz', tier: 2, weight: 0.2, value: 12 },
  { file: '000056.json', id: 'obsidian', tier: 2, weight: 0.5, value: 18 },
  { file: '000057.json', id: 'phosphorite', tier: 3, weight: 0.3, value: 25 },
  { file: '000058.json', id: 'ruby', tier: 3, weight: 0.1, value: 40 },
  { file: '000059.json', id: 'sapphire', tier: 3, weight: 0.1, value: 40 },
  { file: '000060.json', id: 'emerald', tier: 3, weight: 0.1, value: 40 },
  { file: '000061.json', id: 'amethyst', tier: 2, weight: 0.1, value: 30 },
  { file: '000062.json', id: 'diamond', tier: 4, weight: 0.05, value: 100 },
];

// R1: fix-состав 11 файлов (таблица ТЗ/memory §2) + конец каталога 62.
test('000157.01 R1: каталог — 11 reagent 000052-000062 (id/kind/weight/value/tier, без effect, зеркало ≡ JSON)', () => {
  const schema = JSON.parse(
    fs.readFileSync(path.join(ITEMS_DIR, 'schema.json'), 'utf8'));
  const ids = new Set();
  for (const o of ORES_015701) {
    const p = path.join(ITEMS_DIR, o.file);
    assert.ok(fs.existsSync(p),
      o.file + ' существует (краснота: ENOENT — файла нет, каталог не расширен)');
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    assert.equal(j.id, o.id, o.file + ': id (таблица ТЗ)');
    assert.equal(j.kind, 'reagent', o.id + ': kind — reagent');
    assert.equal(j.effect, undefined,
      o.id + ': у реагента не бывает effect (src/items.js L88)');
    assert.equal(j.weight, o.weight,
      o.id + ': weight ' + o.weight + ' (таблица ТЗ; краснота: файла нет)');
    assert.equal(j.value, o.value,
      o.id + ': value ' + o.value + ' (таблица ТЗ)');
    assert.equal(j.tier, o.tier,
      o.id + ': tier ' + o.tier + ' (таблица ТЗ; краснота: поля tier нет)');
    assert.ok(typeof j.name === 'string' && j.name.length > 0,
      o.id + ': name непусто');
    assert.ok(typeof j.desc === 'string' && j.desc.length > 0,
      o.id + ': desc непусто (тон каталога «<Имя>: <строка>»)');
    assert.ok(!ids.has(j.id), 'дубликат id: ' + j.id);
    ids.add(j.id);
    const errors = [];
    validateSchema165(schema, j, o.file, errors);
    assert.deepEqual(errors, [],
      o.file + ': валиден по schema.json (краснота: лишнее поле tier): '
      + errors.join('; '));
    const it = I.getItem(j.id);
    assert.ok(it, 'зеркало items-data.js: ' + j.id +
      ' (краснота: записи нет — зеркало не регенерировано)');
    assert.deepEqual(it, j, o.id + ': зеркало ≡ JSON (mirror-пин)');
  }
  assert.equal(ids.size, 11, 'id 11 предметов уникальны');
  const files = fs.readdirSync(ITEMS_DIR)
    .filter((f) => /^\d{6}\.json$/.test(f)).sort();
  // Ре-пин 000158.02: каталог растёт 62 → 76 (добавляются
  // 000063-000076 — природные ингредиенты); 000062.json остаётся
  // 62-м файлом (append-only, слоты не сдвигаются).
  // Ре-пин 000232: каталог растёт 76 → 82 (000077-000082 —
  // чертежи изучения видов крафта); слоты не сдвигаются.
  // Ре-пин 000230.08: каталог растёт 82 → 107 (000083-000107 —
  // head-предметы); слоты не сдвигаются.
  // Ре-пин 000235.07: каталог растёт 107 → 132 (000108-000132 —
  // свитки волны Огонь); слоты не сдвигаются.
  // Ре-пин 000235.08: каталог растёт 132 → 157 (000133-000157 —
  // свитки волны Лёд); слоты не сдвигаются.
  // Ре-пин 000230.09: каталог растёт 157 → 207 (000158-000207 —
  // уши 25 + шея 25); слоты не сдвигаются.
  // Ре-пин 000230.10: каталог растёт 207 → 232 (000208-000232 —
  // torso 25); слоты не сдвигаются.
  // Ре-пин 000235.09: каталог растёт 232 → 257 (000233-000257 —
  // свитки волны Тень); слоты не сдвигаются.
  // Ре-пин 000230.11: каталог растёт 257 → 307 (000283-000332 —
  // forearms 25 + palms 25); слоты не сдвигаются.
  assert.equal(files.length, 307,
    'каталог — 307 файла (краснота: ' + files.length + ')');
  assert.equal(files[61], '000062.json',
    '000062.json — 62-й файл (краснота: файла нет)');
  assert.equal(I.allItems().length, 307,
    'allItems — 307 предмета (краснота: ' + I.allItems().length + ')');
});

// R3: магазины авто-подхватывают новые reagent — ноль правок src/items.js.
test('000157.01 R3: магазины — новые reagent авто-подхватываются (пул [reagent, skill_book] / allItems)', () => {
  // Магазин магии: пул [reagent, skill_book] (SHOP_KINDS_FALLBACK,
  // src/items.js:787-788) — filter по kind; универсам (wealth 3):
  // allItems() (makeShop L825). Новые предметы — в витринах САМИ;
  // членство в itemsOfKind('reagent') ⟹ и в allItems() тоже.
  const reagents = I.itemsOfKind('reagent');
  for (const o of ORES_015701) {
    assert.ok(reagents.some((it) => it.id === o.id),
      'id «' + o.id + '» ∈ itemsOfKind("reagent") — попадает в витрины '
      + '(краснота: предмета нет в каталоге)');
  }
});

// R5: шкала редкости — тиры 1..4 представлены reagent-каталогом.
test('000157.01 R5: шкала редкости — каждый тир 1..4 представлен хотя бы одним reagent-предметом каталога (tier = it.tier || 1)', () => {
  // «Набор» = ВСЕ reagent каталога (13 старых — отсутствие tier = 1
  // + 11 новых T2×4/T3×5/T4×2; среди 11 новых T1 НЕТ — интерпретация
  // зафиксирована memory §9/Q5). absence = 1 (memory §7).
  const tiers = Array.from(new Set(
    I.itemsOfKind('reagent').map((it) => it.tier || 1))).sort();
  assert.deepEqual(tiers, [1, 2, 3, 4],
    'тиры 1..4 представлены reagent-каталогом; факт: ['
    + tiers.join(', ') + ' (краснота: тиры 2/3/4 не представлены — '
    + 'новых 11 reagent нет)');
});

// --- Задача 000158.02: каталог — природные ингредиенты + поле `loot` ---
//
// КРАСНЫЕ (L1/L2/L3/L5/L6/L7a/L7b/L7c) — падают на текущем
// (неизменённом) коде:
//   * файлов assets/items/000063.json … 000076.json НЕТ (L1/L2 —
//     ENOENT/записи нет; L3 — у 14 СУЩЕСТВУЮЩИХ руд/самоцветов поля
//     `loot` нет);
//   * в assets/items/schema.json свойства `loot` НЕТ (L5/L6 —
//     properties.loot undefined);
//   * в items.js ветки валидации `loot` при загрузке НЕТ (L7a–c —
//     Missing expected exception: load-time-валидация не бросает).
// ГАРДЫ (L4/L8/L9) — зелёные с первого запуска (паттерн пинов
// 000157.01): анти-дубль nugget_*, happy-path без избыточной
// валидации, деградация без map.js (000053).
// Контракт — memory/000158.02-natural-ingredients-loot.md:
// §2.1 таблица 14 природных reagent (слоты 000063-000076),
// §2.2 пул самородков (14 СУЩЕСТВУЮЩИХ id, частота по тиру),
// §3.1 точная форма свойства `loot` в schema.json, §3.3 validateLoot
// (TERRAIN_NAMES — из mapmod-аргумента, деградация console.error).
// 6-й класс лута (руда-самоцвет) — БЕЗ новых предметов: лут
// песка/гор = существующие id (L3); анти-дубль — префикса `nugget_`
// нет (L4; SPEC: «отдельных "самородок"-предметов нет»).
// Тех-ре-пины счёта «62» → «76» («000165 I1» / «000157.01 R1») —
// выше, с комментариями «Ре-пин 000158.02» (паттерн 000157.01 Р0).
// Goldens (MAGIC_SHOP/универсам/cities) — стадия ЗЕЛЁНАЯ (§5
// контракта: значения только после каталога + симуляции).

// Фикс-состав (контракт §2.1, ФИНАЛ): file/id/cls/weight/value/
// terrains/freq (freq null = ОПУЩЕНА, default 0.1 — дефолт пути, D7).
// Тех-фикс 000158.02 (зелёная фаза): в закоммиченном красном фиксе не
// было weight/value, а L1 сравнивает их с фиксом И валидирует JSON по
// схеме (weight/value — required) → фикс дополнен значениями таблицы
// §2.1 (без них L1 не мог стать зелёным; семантика L1 не меняется).
const LOOT_00015802 = [
  { file: '000063.json', id: 'berry_red', cls: 'berry',
    weight: 0.05, value: 2,
    terrains: ['трава', 'болото', 'лес'], freq: 0.04 },
  { file: '000064.json', id: 'berry_blue', cls: 'berry',
    weight: 0.05, value: 3,
    terrains: ['болото', 'лес'], freq: 0.03 },
  { file: '000065.json', id: 'berry_wild', cls: 'berry',
    weight: 0.05, value: 2,
    terrains: ['трава', 'лес'], freq: null },
  { file: '000066.json', id: 'herb_sun', cls: 'herb',
    weight: 0.1, value: 4,
    terrains: ['трава', 'лес'], freq: 0.03 },
  { file: '000067.json', id: 'herb_wind', cls: 'herb',
    weight: 0.1, value: 4,
    terrains: ['трава', 'болото', 'лес'], freq: 0.03 },
  { file: '000068.json', id: 'root_moon', cls: 'root',
    weight: 0.2, value: 6,
    terrains: ['лес', 'болото'], freq: 0.02 },
  { file: '000069.json', id: 'root_ember', cls: 'root',
    weight: 0.2, value: 5,
    terrains: ['трава', 'лес'], freq: 0.03 },
  { file: '000070.json', id: 'root_rock', cls: 'root',
    weight: 0.3, value: 4,
    terrains: ['трава', 'болото'], freq: 0.03 },
  { file: '000071.json', id: 'fruit_apple', cls: 'fruit',
    weight: 0.1, value: 2,
    terrains: ['трава', 'лес'], freq: 0.04 },
  { file: '000072.json', id: 'fruit_plum', cls: 'fruit',
    weight: 0.1, value: 3,
    terrains: ['лес'], freq: 0.03 },
  { file: '000073.json', id: 'fruit_quince', cls: 'fruit',
    weight: 0.1, value: 4,
    terrains: ['трава', 'лес'], freq: 0.02 },
  { file: '000074.json', id: 'mushroom_grey', cls: 'mushroom',
    weight: 0.05, value: 2,
    terrains: ['лес'], freq: 0.04 },
  { file: '000075.json', id: 'mushroom_glow', cls: 'mushroom',
    weight: 0.05, value: 4,
    terrains: ['лес'], freq: 0.02 },
  { file: '000076.json', id: 'mushroom_ink', cls: 'mushroom',
    weight: 0.05, value: 3,
    terrains: ['лес'], freq: 0.03 },
];
// Пул самородков (контракт §2.2): id → tier → frequency. 14
// СУЩЕСТВУЮЩИХ файлов: moonstone/iron_ore/copper_ore (T1, tier-
// absence) + 000052-000062 (000157.01: T2×4/T3×5/T4×2).
const NUGGETS_00015802 = [
  ['moonstone', 1], ['iron_ore', 1], ['copper_ore', 1],
  ['silver_ore', 2], ['quartz', 2], ['obsidian', 2], ['amethyst', 2],
  ['gold_ore', 3], ['phosphorite', 3], ['ruby', 3], ['sapphire', 3],
  ['emerald', 3], ['mithril_ore', 4], ['diamond', 4],
];
const NUGGET_FREQ = { 1: 0.04, 2: 0.025, 3: 0.015, 4: 0.005 };

test('000158.02 L1: каталог — 14 природных reagent 000063-000076 (fix-состав: id/kind/weight/value/loot.terrains/frequency ≡ таблице, near_mountains и frequency-000065 ОПУЩЕНЫ, без effect/tier, schema-валиден, зеркало ≡ JSON)', () => {
  const schema = JSON.parse(
    fs.readFileSync(path.join(ITEMS_DIR, 'schema.json'), 'utf8'));
  const byFile = new Map();
  for (const f of fs.readdirSync(ITEMS_DIR)
      .filter((x) => /^\d{6}\.json$/.test(x))) {
    byFile.set(f, JSON.parse(
      fs.readFileSync(path.join(ITEMS_DIR, f), 'utf8')));
  }
  for (const e of LOOT_00015802) {
    const j = byFile.get(e.file);
    assert.ok(j, e.file + ': файл в assets/items (краснота: ENOENT — '
      + 'каталог не расширен)');
    assert.equal(j.id, e.id, e.file + ': id (таблица контракта §2.1)');
    assert.equal(j.kind, 'reagent', e.id + ': kind — reagent');
    assert.equal(j.weight, e.weight,
      e.id + ': weight ' + e.weight + ' (таблица §2.1)');
    assert.equal(j.value, e.value,
      e.id + ': value ' + e.value + ' (таблица §2.1)');
    assert.ok(typeof j.name === 'string' && j.name.length > 0,
      e.id + ': name непусто');
    assert.ok(typeof j.desc === 'string' && j.desc.length > 0,
      e.id + ': desc непусто (тон каталога «<Имя>: <строка>»)');
    assert.equal(j.effect, undefined,
      e.id + ': у реагента не бывает effect (src/items.js)');
    assert.equal(j.tier, undefined,
      e.id + ': tier ОПУЩЕН (absence = 1, паттерн 13 старых reagent)');
    // loot (краснота: поля нет):
    assert.ok(j.loot && typeof j.loot === 'object'
      && !Array.isArray(j.loot),
      e.id + ': loot — объект (краснота: поля loot нет)');
    assert.deepEqual(j.loot.terrains, e.terrains,
      e.id + ': loot.terrains (таблица §2.1, порядок — канон)');
    if (e.freq === null) {
      assert.equal(j.loot.frequency, undefined,
        e.id + ': loot.frequency ОПУЩЕНА (default 0.1 — дефолт пути)');
    } else {
      assert.equal(j.loot.frequency, e.freq,
        e.id + ': loot.frequency ' + e.freq + ' (таблица §2.1)');
    }
    assert.equal(j.loot.near_mountains, undefined,
      e.id + ': near_mountains ОПУЩЕНА (только для самородков, D6/D7)');
    const errors = [];
    validateSchema165(schema, j, e.file, errors);
    assert.deepEqual(errors, [],
      e.file + ': валиден по schema.json: ' + errors.join('; '));
    const it = I.getItem(j.id);
    assert.ok(it, 'зеркало items-data.js: ' + e.id +
      ' (краснота: записи нет — зеркало не регенерировано)');
    assert.deepEqual(it, j, e.id + ': зеркало ≡ JSON');
  }
});

test('000158.02 L2: loot-инварианты новых 14 — terrains непусто ⊆ 8 имён TERRAIN_NAMES, frequency ∈ [0,1], near_mountains bool/отс., class→terrain (SPEC: ягоды/травы/коренья/плоды ⊆ {трава, болото, лес}, грибы ⊆ {лес})', () => {
  const NAMES = Object.values(M.TERRAIN_NAMES);
  const byId = new Map(I.allItems().map((it) => [it.id, it]));
  for (const e of LOOT_00015802) {
    const it = byId.get(e.id);
    assert.ok(it, 'каталог: ' + e.id + ' (краснота: предмета нет)');
    assert.ok(it.loot && typeof it.loot === 'object'
      && !Array.isArray(it.loot),
      e.id + ': loot — объект (краснота: поля loot нет)');
    const t = it.loot.terrains;
    assert.ok(Array.isArray(t) && t.length > 0,
      e.id + ': loot.terrains — непустой массив');
    for (const x of t) {
      assert.ok(NAMES.includes(x),
        e.id + ': террейн «' + x + '» ∈ 8 имён TERRAIN_NAMES');
    }
    if (it.loot.frequency !== undefined) {
      assert.equal(typeof it.loot.frequency, 'number',
        e.id + ': loot.frequency — число');
      assert.ok(it.loot.frequency >= 0 && it.loot.frequency <= 1,
        e.id + ': loot.frequency ∈ [0,1]');
    }
    if (it.loot.near_mountains !== undefined) {
      assert.equal(typeof it.loot.near_mountains, 'boolean',
        e.id + ': near_mountains — boolean');
    }
    // class→terrain (SPEC world-map «Контент тайла»):
    const allowed = (e.cls === 'mushroom')
      ? ['лес'] : ['трава', 'болото', 'лес'];
    for (const x of t) {
      assert.ok(allowed.includes(x),
        e.id + ': «' + x + '» вне допустимых для класса «' + e.cls
        + '» (' + allowed.join('/') + ') — SPEC');
    }
  }
});

test("000158.02 L3: «самородки» — 14 СУЩЕСТВУЮЩИХ id несут loot { terrains: [песок], near_mountains: true, frequency по тиру }; ВСЕ ПРОЧИЕ 274 предмета — loot undefined (ре-пин 000230.08: +25 head; ре-пин 000232: +6 чертежей; ре-пин 000235.07: +25 свитков волны Огонь; ре-пин 000235.08: +25 свитков волны Лёд без loot; ре-пин 000230.09: +50 уши/шея без loot; ре-пин 000230.10: +25 torso без loot; ре-пин 000235.09: +25 свитков волны Тень без loot; ре-пин 000230.11: +50 руки без loot; пин «не тронуто»; 5 reagent'ов 000220 — в исключении)", () => {
  const byId = new Map(I.allItems().map((it) => [it.id, it]));
  const newIds = new Set(LOOT_00015802.map((e) => e.id));
  const nuggetIdSet = new Set(NUGGETS_00015802.map(([id]) => id));
  for (const [id, tier] of NUGGETS_00015802) {
    const it = byId.get(id);
    assert.ok(it, 'каталог: ' + id + ' (существующий предмет)');
    assert.deepEqual(it.loot, { terrains: ['песок'],
      near_mountains: true, frequency: NUGGET_FREQ[tier] },
      id + ': loot самородка (краснота: поля нет; tier ' + tier
      + ' → frequency ' + NUGGET_FREQ[tier] + ')');
  }
  // ВСЕ ПРОЧИЕ предметы (274 = каталог 307 − 14 самородков − 14 новых
  // − 5 reagent'ов 000220; ре-пин 000230.08: +25 head без loot;
  // ре-пин 000232: +6 чертежей без loot; ре-пин 000235.07: +25 свитков
  // волны Огонь без loot; ре-пин 000235.08: +25 свитков волны Лёд
  // без loot; ре-пин 000230.09: +50 уши/шея без loot; ре-пин
  // 000230.10: +25 torso без loot; ре-пин 000235.09: +25 свитков
  // волны Тень без loot; ре-пин 000230.11: +50 руки без loot):
  // loot ОТСУТСТВУЕТ — пин «остальные файлы не тронуты».
  const REAGENTS_000220 = new Set(['wood_log', 'hide', 'herb_healing',
    'herb_mana', 'herb_bitter']);
  let others = 0;
  for (const it of I.allItems()) {
    if (nuggetIdSet.has(it.id) || newIds.has(it.id)
        || REAGENTS_000220.has(it.id)) continue;
    assert.equal(it.loot, undefined,
      it.id + ': loot отсутствует (предмет не тронут, 000158.02)');
    others++;
  }
  assert.equal(others, 274, 'прочих предметов — ровно 274 (каталог 307 − 14 самородков − 14 новых − 5 исключений 000220; ре-пин 000230.08: +25 head; 000232: +6; 000235.07: +25 свитков; 000235.08: +25 свитков; 000230.09: +50; 000230.10: +25 torso; 000235.09: +25 свитков волны Тень; 000230.11: +50 руки — все без loot)');
});

test('000158.02 L4 (ГАРД): нет id с префиксом nugget_* + форма loot у ВСЕХ предметов с полем (kind reagent, terrains ⊆ 8 имён, minItems 1, frequency number [0,1]/отс., near_mountains bool/отс.)', () => {
  const NAMES = Object.values(M.TERRAIN_NAMES);
  for (const it of I.allItems()) {
    assert.ok(!it.id.startsWith('nugget_'),
      it.id + ': анти-дубль — предметов с префиксом nugget_* нет '
      + '(SPEC: «отдельных "самородок"-предметов нет» — лут = '
      + 'сами руды/самоцветы)');
    if (it.loot === undefined) continue;
    assert.equal(it.kind, 'reagent',
      it.id + ': loot — только у reagent');
    assert.ok(it.loot && typeof it.loot === 'object'
      && !Array.isArray(it.loot), it.id + ': loot — объект');
    const t = it.loot.terrains;
    assert.ok(Array.isArray(t) && t.length > 0,
      it.id + ': loot.terrains — непустой массив');
    for (const x of t) {
      assert.equal(typeof x, 'string',
        it.id + ': loot.terrains: не строка: ' + x);
      assert.ok(NAMES.includes(x),
        it.id + ': террейн «' + x + '» ∈ 8 имён TERRAIN_NAMES');
    }
    if (it.loot.frequency !== undefined) {
      assert.equal(typeof it.loot.frequency, 'number',
        it.id + ': loot.frequency — число');
      assert.ok(it.loot.frequency >= 0 && it.loot.frequency <= 1,
        it.id + ': loot.frequency ∈ [0,1]');
    }
    if (it.loot.near_mountains !== undefined) {
      assert.equal(typeof it.loot.near_mountains, 'boolean',
        it.id + ': near_mountains — boolean');
    }
  }
});

test('000158.02 L5: schema.json — ОПЦИОНАЛЬНОЕ свойство loot (точная форма контракта §3.1), «loot» НЕ в required, additionalProperties верхнего уровня false', () => {
  const s = JSON.parse(
    fs.readFileSync(path.join(ITEMS_DIR, 'schema.json'), 'utf8'));
  assert.deepEqual(s.properties.loot, {
    type: 'object',
    required: ['terrains'],
    properties: {
      terrains: {
        type: 'array',
        minItems: 1,
        items: {
          enum: ['глубокая вода', 'вода', 'песок', 'трава', 'лес',
                 'холмы', 'горы', 'болото'],
        },
      },
      near_mountains: { type: 'boolean' },
      frequency: { type: 'number', minimum: 0, maximum: 1 },
    },
    additionalProperties: false,
  }, 'properties.loot — объект {terrains, near_mountains, frequency} '
    + '(краснота: свойства loot в схеме нет); факт: '
    + JSON.stringify(s.properties.loot));
  assert.ok(!s.required.includes('loot'),
    'loot НЕ в required (старые предметы валидны без изменений); '
    + 'факт: ' + JSON.stringify(s.required));
  assert.equal(s.additionalProperties, false,
    'верхний additionalProperties остаётся false');
});

test('000158.02 L6: СВЯЗКА — sorted(enum loot.terrains.items) ≡ sorted(Object.values(M.TERRAIN_NAMES)) + minItems 1 + additionalProperties под-схемы loot false (падает при рассинхроне)', () => {
  const s = JSON.parse(
    fs.readFileSync(path.join(ITEMS_DIR, 'schema.json'), 'utf8'));
  const loot = s.properties.loot;
  assert.ok(loot && typeof loot === 'object' && !Array.isArray(loot),
    'properties.loot существует (краснота: свойства loot в схеме нет)');
  const sorted = (a) => Array.from(a).sort();
  assert.deepEqual(
    sorted(loot.properties.terrains.items.enum),
    sorted(Object.values(M.TERRAIN_NAMES)),
    'enum loot.terrains.items ≡ 8 именам TERRAIN_NAMES (связка: '
    + 'прецедент tests/sprites.test.js «enum террейны ≡ единой таблице»); '
    + 'факт: [' + JSON.stringify(loot.properties.terrains.items.enum)
    + '] vs [' + JSON.stringify(Object.values(M.TERRAIN_NAMES)) + ']');
  assert.equal(loot.properties.terrains.minItems, 1,
    'loot.terrains — minItems 1 (непусто)');
  assert.equal(loot.additionalProperties, false,
    'под-схема loot — закрытая (additionalProperties false)');
});

// L7a–L9 — механика (house-паттерн: цепочка ITEMS_CHAIN минус
// items.js; «браузерная» ветка UMD items.js читает G0.ITEMS при
// ЗАГРУЗКЕ → каталог подменяем синтетическим ДО loadInSandbox).
// sandbox-console — перехват ошибок деградации (000053).
const VM_ITEMS_CHAIN_NO_ITEMS = ['global-settings.js', 'perlin.js',
  'map.js', 'skills-data.js', 'items-data.js', 'sheet.js', 'player.js'];
function makeVmSandboxWithConsole() {
  const errors = [];
  const sandbox = {
    console: { log() {}, warn() {}, error: (m) => errors.push(String(m)) },
  };
  return { sandbox, errors };
}
function loadItemsVmChain(sandbox) {
  for (const f of VM_ITEMS_CHAIN_NO_ITEMS) loadInSandbox(f, sandbox);
}
// Синтетический reagent: проходит ВСЮ текущую валидацию
// validateItem (id/name/kind/weight/value, reagent без effect) —
// краснота L7a–c = ТОЛЬКО отсутствие ветки валидации loot.
function synthReagent(loot) {
  return { id: 'x_test', name: 'Тестовый реагент', kind: 'reagent',
    weight: 0.1, value: 1, desc: 'т', loot };
}

test('000158.02 L7a (vm): items.js при ЗАГРУЗКЕ — loot.terrains содержит имя вне TERRAIN_NAMES → Error (краснота: ветки валидации нет — Missing expected exception)', () => {
  const { sandbox } = makeVmSandboxWithConsole();
  loadItemsVmChain(sandbox);
  sandbox.Game.ITEMS = [synthReagent({ terrains: ['трава', 'марс'] })];
  assert.throws(
    () => loadInSandbox('items.js', sandbox),
    /террейн|TERRAIN_NAMES/i,
    'load-time-валидация бросает на неизвестном терреине (краснота: '
    + 'валидации loot в items.js нет)');
});

test('000158.02 L7b (vm): items.js при ЗАГРУЗКЕ — loot.frequency вне [0,1] (1.5 / -0.1 / «0.5») → Error', () => {
  for (const f of [1.5, -0.1, '0.5']) {
    const { sandbox } = makeVmSandboxWithConsole();
    loadItemsVmChain(sandbox);
    sandbox.Game.ITEMS = [synthReagent(
      { terrains: ['трава'], frequency: f })];
    assert.throws(
      () => loadInSandbox('items.js', sandbox),
      /frequency/i,
      'load-time-валидация бросает на frequency ' + f
      + ' (краснота: валидации loot в items.js нет)');
  }
});

test('000158.02 L7c (vm): items.js при ЗАГРУЗКЕ — loot.near_mountains без terrains → Error («near_mountains только с terrains»)', () => {
  const { sandbox } = makeVmSandboxWithConsole();
  loadItemsVmChain(sandbox);
  sandbox.Game.ITEMS = [synthReagent({ near_mountains: true })];
  assert.throws(
    () => loadInSandbox('items.js', sandbox),
    /terrains/i,
    'load-time-валидация бросает: near_mountains без непустых terrains '
    + '(краснота: валидации loot в items.js нет)');
});

test('000158.02 L8 (ГАРД, vm): ВАЛИДНЫЙ loot — загрузка без броска и без console.error, loot сохранён предмету (deepEqual) — гард от избыточно-жёсткой валидации', () => {
  const { sandbox, errors } = makeVmSandboxWithConsole();
  loadItemsVmChain(sandbox);
  const loot = { terrains: ['трава', 'болото'],
    near_mountains: false, frequency: 0.2 };
  sandbox.Game.ITEMS = [synthReagent(loot)];
  assert.doesNotThrow(() => loadInSandbox('items.js', sandbox),
    'валидный loot — без броска (гард от избыточной валидации)');
  assert.deepEqual(fromVm(sandbox.Game.getItem('x_test').loot), loot,
    'loot сохранён предмету (валидация не мутирует/не отбрасывает)');
  assert.equal(errors.length, 0,
    'console.error на валидном каталоге нет; факт: '
    + JSON.stringify(errors));
});

test('000158.02 L9 (ГАРД, vm): цепочка БЕЗ map.js — загрузка без краха, enum-проверка террейнов пропущена (terrains [«марс»] НЕ бросает), loot сохранён; console перехвачен в sandbox (деградация 000053: отсутствие mapmod.TERRAIN_NAMES — guard typeof === object, игра не падает)', () => {
  const errors = [];
  const sandbox = {
    console: { log() {}, warn() {}, error: (m) => errors.push(String(m)) },
  };
  // Цепочка = ITEMS_CHAIN минус map.js (global-settings ОБЯЗАТЕЛЕН:
  // player.js бросает без Game.GlobalSettings; TERRAIN* sheet/player
  // не требуют — проверено). Условие деградации: mapmod без
  // TERRAIN_NAMES.
  for (const f of ['global-settings.js', 'perlin.js', 'skills-data.js',
      'items-data.js', 'sheet.js', 'player.js']) {
    loadInSandbox(f, sandbox);
  }
  assert.equal(sandbox.Game.TERRAIN_NAMES, undefined,
    'map.js в цепочке нет (TERRAIN_NAMES недоступен — условие гарда)');
  sandbox.Game.ITEMS = [synthReagent(
    { terrains: ['марс'], frequency: 0.1 })];
  assert.doesNotThrow(() => loadInSandbox('items.js', sandbox),
    'без map.js — краха при загрузке нет (деградация 000053; гард '
    + 'ловит безусловное чтение mapmod.TERRAIN_NAMES)');
  const it = fromVm(sandbox.Game.getItem('x_test'));
  assert.deepEqual(it.loot.terrains, ['марс'],
    'enum-проверка пропущена — loot сохранён как есть (деградация)');
});

// --- Задача 000191.13: load-time-гард «loot — только у reagent» +
// мусор validateLoot (контракт — memory/000191-retro-20261012-coverage.md) ---

test('000191.13a (vm): items.js при ЗАГРУЗКЕ — weapon с ВАЛИДНЫМ loot → Error «loot — только у reagent» (load-time-гард src/items.js: поле loot ТОЛЬКО у reagent)', () => {
  const { sandbox } = makeVmSandboxWithConsole();
  loadItemsVmChain(sandbox);
  const weapon = { id: 'x_sword', name: 'Тестовый меч', kind: 'weapon',
    subtype: 'sword', stats: { damage: 5 }, weight: 2, value: 10,
    desc: 'т',
    loot: { terrains: ['трава'], near_mountains: false, frequency: 0.2 } };
  sandbox.Game.ITEMS = [weapon];
  assert.throws(
    () => loadInSandbox('items.js', sandbox),
    /loot — только у reagent/,
    'load-time-валидация бросает на weapon с loot (лоот-поле — '
    + 'прерогатива reagent; остальные проверки validateItem weapon '
    + 'проходят — падает именно на validateLoot)');
  // Контроль (анти-вакуумность): weapon БЕЗ loot — загрузка без броска.
  const { sandbox: s2, errors } = makeVmSandboxWithConsole();
  loadItemsVmChain(s2);
  s2.Game.ITEMS = [{ id: 'x_sword', name: 'Тестовый меч',
    kind: 'weapon', subtype: 'sword', stats: { damage: 5 },
    weight: 2, value: 10, desc: 'т' }];
  assert.doesNotThrow(() => loadInSandbox('items.js', s2),
    'weapon без loot — загрузка без броска (гард не избыточен)');
  assert.equal(errors.length, 0, 'console.error нет; факт: '
    + JSON.stringify(errors));
  assert.equal(s2.Game.getItem('x_sword').loot, undefined,
    'loot не появляется из ничего');
});

test('000191.13b (node): I.validateLoot — мусор (loot: строка/массив, terrains: [42], near_mountains: «yes») → точные сообщения', () => {
  const exact = (msg) => (e) =>
    e instanceof Error && e.message === msg;
  assert.throws(
    () => I.validateLoot({ id: 'x', kind: 'reagent', loot: 'x' }),
    exact('x: loot — объект'),
    'loot: строка — «loot — объект»');
  assert.throws(
    () => I.validateLoot({ id: 'x', kind: 'reagent', loot: [] }),
    exact('x: loot — объект'),
    'loot: массив — «loot — объект»');
  assert.throws(
    () => I.validateLoot({ id: 'x', kind: 'reagent',
                           loot: { terrains: [42] } }),
    exact('x: loot.terrains: не строка: 42'),
    'terrains: [42] — «loot.terrains: не строка: 42»');
  assert.throws(
    () => I.validateLoot({ id: 'x', kind: 'reagent',
                           loot: { terrains: ['трава'],
                                   near_mountains: 'yes' } }),
    exact('x: loot.near_mountains — boolean'),
    'near_mountains: «yes» — «loot.near_mountains — boolean»');
});

// --- Задача 000211.06: 33 лут-предмета — "icon": ссылка на svg в json ---
//
// Контракт — memory/000211.06-items-loot-icons.md §2.1 (RED-стадия):
//   * форма `"icon": "assets/sprites/loot/<id>.svg"` — КОНЕЦ JSON-
//     объекта (после "loot"); source of truth — assets/items/*.json
//     (зеркало src/items-data.js покрывается deepEqual :59);
//   * ВСЕ 33 лут-предмета (live-скан: объект loot + непустые
//     terrains + строковый id — тот же строгий фильтр, что map.js
//     lootCandidates / LOOT_ITEM_IDS tests/sprites.test.js; 000220:
//     +5 строительных reagent) — icon = конвенции, 33/33 svg существует;
//   * прочие 43 предмета — icon НЕ задан (пин «не тронуто», L3-форма;
//     5 reagent'ов 000220 — с loot+icon);
//   * schema.json — icon ОПЦИОНАЛЬНОЕ свойство: точная форма
//     {type, pattern} (паттерн — дословно ТЗ), НЕ в required, верхний
//     additionalProperties false (000141: именованное поле — в том же
//     коммите, иначе валидация краснеет молча).
// Краснота осмысленная: поля icon нет ни в одном из 76 JSON
// (grep '"icon"' = 0) и свойства icon нет в схеме
// (properties.icon === undefined) — функциональность ТЗ ещё
// не существует. svg-sweep «файл существует» — AR9 в
// tests/assets-refs.test.js автоподхватит 28 icon-строк (решение —
// memory §4.2), дублирующий sweep НЕ создаётся.

test("000211.06 I1: 33 лут-предмета — icon = assets/sprites/loot/<id>.svg (путь = конвенции), svg-файл существует; прочие 68 — icon undefined (ре-пин 000230.08: +25 head с icon в items/ — в исключении; ре-пин 000232: +6 чертежей с icon в items/ — в исключении; ре-пин 000230.09: +50 уши/шея с icon в items/ — в исключении; ре-пин 000230.10: +25 torso с icon в items/ — в исключении; пин «не тронуто»; 5 reagent'ов 000220 — с loot+icon)", () => {
  const files = fs.readdirSync(ITEMS_DIR)
    .filter((f) => /^\d{6}\.json$/.test(f))
    .sort();
  const byId = new Map();
  for (const f of files) {
    const j = JSON.parse(
      fs.readFileSync(path.join(ITEMS_DIR, f), 'utf8'));
    byId.set(j.id, j);
  }
  const lootIds = [...byId.values()]
    .filter((it) => {
      const L = it.loot;
      return L && typeof L === 'object'
        && Array.isArray(L.terrains) && L.terrains.length > 0
        && typeof it.id === 'string';
    })
    .map((it) => it.id);
  assert.equal(lootIds.length, 33,
    'лут-предметов — ровно 33 (live-скан JSON-каталога, фильтр '
    + 'map.js lootCandidates; 000220: +5 строительных reagent)');
  for (const id of lootIds) {
    const it = byId.get(id);
    assert.equal(it.icon, 'assets/sprites/loot/' + id + '.svg',
      id + ': icon = assets/sprites/loot/<id>.svg (краснота: '
      + 'свойства icon в JSON-записи нет); факт: '
      + JSON.stringify(it.icon));
    assert.ok(fs.existsSync(path.join(__dirname, '..', it.icon)),
      id + ': svg-файл существует по пути icon');
  }
  const BLUEPRINTS_000232 = new Set(['blueprint_forge', 'blueprint_alchemy',
    'blueprint_carving', 'blueprint_woodwork', 'blueprint_enchant',
    'blueprint_runecraft']);
  // Ре-пин 000230.08: 25 head-предметов (000083-000107) — icon в
  // assets/sprites/items/ (свойство icon легитимно, 000230.01) —
  // исключение из пина «icon НЕ задан» (паттерн BLUEPRINTS_000232).
  const HEAD_00023008 = new Set(['straw_hat', 'wool_cap', 'leather_cap',
    'fur_hat', 'cloth_band', 'wanderer_cap', 'hood_common', 'linen_cloth',
    'felt_hat', 'travel_cloth', 'silver_band', 'copper_band',
    'obsidian_cloth', 'amethyst_band', 'quartz_cloth', 'bone_band',
    'mystic_cloth', 'silver_helm', 'gold_helm', 'sapphire_helm',
    'mithril_helm', 'emerald_helm', 'rune_hoop', 'star_hoop',
    'crown_flame']);
  // Ре-пин 000230.09: 50 предметов уши/шея (000158-000207) — icon в
  // assets/sprites/items/ (паттерн HEAD_00023008) — исключение из
  // пина «icon НЕ задан».
  const EARSNECK_00023009 = new Set(['copper_hoop', 'bone_stud',
    'leather_loop', 'clay_dangle', 'wood_bead', 'copper_dangle',
    'shell_hoop', 'faith_stud', 'twine_hoop', 'antler_hook',
    'stone_bead', 'silver_hoop', 'moonstone_dangle', 'quartz_bead',
    'silver_stud', 'obsidian_stud', 'amethyst_dangle', 'sapphire_hoop',
    'emerald_stud', 'ruby_bell', 'gold_dangle', 'mithril_hoop',
    'star_earring', 'whisper_hoop', 'soul_bell', 'copper_chain',
    'bone_beads', 'twine_amulet', 'clay_pendant', 'wood_pendant',
    'copper_pendant', 'shell_beads', 'faith_necklace', 'leather_choker',
    'stone_beads', 'bone_pendant', 'silver_chain', 'quartz_amulet',
    'moonstone_chain', 'faith_amulet', 'obsidian_pendant',
    'amethyst_choker', 'sapphire_pendant', 'emerald_amulet',
    'ruby_pendant', 'gold_chain', 'mithril_choker', 'rune_necklace',
    'star_pendant', 'dawn_pendant']);
  // Ре-пин 000230.10: 25 torso-предметов (000208-000232) — icon в
  // assets/sprites/items/ (паттерн EARSNECK_00023009) — исключение из
  // пина «icon НЕ задан».
  const TORSO_00023010 = new Set(['linen_shirt', 'wool_shirt', 'cloth_tunic',
    'linen_gown', 'hemp_robe', 'rough_kaftan', 'wool_gown', 'cloth_sutan',
    'linen_tunic', 'wool_kaftan', 'wool_sutan', 'leather_kaftan',
    'embroidered_kaftan', 'cloth_robe', 'leather_gown', 'monk_sutan',
    'fine_kaftan', 'ember_robe', 'stone_robe', 'shadow_robe',
    'deep_breath_robe', 'meditating_robe', 'pilgrim_sutan', 'void_robe',
    'aegis_mantle']);
  // Ре-пин 000230.11: 50 предметов предплечья/ладони (000283-000332) —
  // icon в assets/sprites/items/ (паттерн TORSO_00023010) — исключение
  // из пина «icon НЕ задан».
  const HANDS_00023011 = new Set(['cloth_cuff', 'leather_cuff',
    'hemp_bracer', 'rough_bracer', 'leather_garter', 'cloth_wrap',
    'iron_cuff', 'bone_bracer', 'wood_brace', 'hide_cuff',
    'studded_bracer', 'copper_brace', 'archer_brace', 'silver_cuff',
    'shadow_wrap', 'iron_elbow', 'runic_cuff', 'steel_bracers',
    'gold_brace', 'sapphire_bracer', 'ghost_cuff', 'swift_brace',
    'rune_bracers', 'star_armguard', 'titan_brace', 'cloth_gloves',
    'leather_gloves', 'hide_gloves', 'rough_gauntlets', 'archer_gloves',
    'linen_wraps', 'iron_gauntlets', 'bone_grips', 'wood_guards',
    'fine_gloves', 'studded_gloves', 'copper_gauntlets', 'quiver_gloves',
    'silver_gauntlets', 'night_gloves', 'iron_wraps', 'wind_gloves',
    'steel_gauntlets', 'gold_gloves', 'emerald_gauntlets',
    'phantom_gloves', 'haste_wraps', 'rune_gauntlets', 'star_gloves',
    'void_gauntlet']);
  let others = 0;
  for (const it of byId.values()) {
    if (lootIds.includes(it.id) || BLUEPRINTS_000232.has(it.id)
        || HEAD_00023008.has(it.id)
        || EARSNECK_00023009.has(it.id)
        || TORSO_00023010.has(it.id)
        || HANDS_00023011.has(it.id)) continue;
    assert.ok(!('icon' in it),
      it.id + ': icon НЕ задан (предмет не тронут, 000211.06)');
    others++;
  }
  assert.equal(others, 118, 'прочих предметов — ровно 118 (ре-пин 000230.09: '
    + '50 уши/шея — в исключении; ре-пин 000230.10: 25 torso — в '
    + 'исключении (icon); ре-пин 000230.11: 50 рук — в исключении '
    + '(icon); ре-пин 000235.08: +25 свитков волны Лёд '
    + 'без icon — входят в счёт; ре-пин 000235.09: +25 свитков '
    + 'волны Тень без icon)');
  assert.equal(
    [...byId.values()].filter((it) => 'icon' in it).length, 189,
    'icon — ровно у 189 предметов (ре-пин 000230.08: 33 лут + 6 чертежей '
    + '+ 25 head; ре-пин 000230.09: +50 уши/шея; ре-пин 000230.10: '
    + '+25 torso; ре-пин 000230.11: +50 рук; пин: ни больше, ни меньше)');
});

test('000211.06 I2: schema.json — icon ОПЦИОНАЛЬНОЕ свойство {type: string, pattern: ^assets/sprites/(loot|items)/[\\w_]+\\.svg$} (дословно ТЗ), «icon» НЕ в required, additionalProperties верхнего уровня false', () => {
  const s = JSON.parse(
    fs.readFileSync(path.join(ITEMS_DIR, 'schema.json'), 'utf8'));
  assert.deepEqual(s.properties.icon, {
    type: 'string',
    // Ре-пин 000230.01: ОБЕ директории — loot/ + items/ (иконки
    // контента — assets/sprites/items/<id>.svg, волны .08–.15).
    pattern: '^assets/sprites/(loot|items)/[\\w_]+\\.svg$',
  }, 'properties.icon — точная форма {type, pattern} (краснота: '
    + 'свойства icon в схеме нет); факт: '
    + JSON.stringify(s.properties.icon));
  assert.ok(!s.required.includes('icon'),
    'icon НЕ в required (прочие 43 предмета остаются валидными); '
    + 'факт: ' + JSON.stringify(s.required));
  assert.equal(s.additionalProperties, false,
    'верхний additionalProperties остаётся false (000141)');
});

// --- Задача 000230.01: items-схема — ОПЦИОНАЛЬНЫЕ поля slot/rarity/
// set/affixes для экипировки + новые kind shield/artifact/tool/ring +
// subtype staff (P0; контракт — memory/000230.01-item-schema-
// slot-rarity-set-affixes.md §2/§5) ---
//
// RED (TDD; краснота осмысленная — функциональности ещё нет):
//   E1/E1b/E2–E7 — schema.json: properties.slot/rarity/set/affixes
//     отсутствуют (undefined), kind-enum 8 (не 12), subtype-enum 3
//     (не 4), icon-паттерн — только loot/ (не обе директории),
//     порядок properties — 12 ключей (не 16);
//   E8 — src/items.js: ITEM_KINDS.SHIELD/ARTIFACT/TOOL/RING,
//     WEAPON_SUBTYPES.STAFF, константы EQUIP_SLOTS/ITEM_RARITIES/
//     AFFIX_TYPES/EQUIP_KINDS — отсутствуют;
//   E10/E11 — doesNotThrow падает на СУЩЕСТВУЮЩИХ бросках
//     «неизвестный тип: shield» / «у оружия нужен подтип
//     sword|bow|heavy» (новые kind/subtype не в константах);
//   E12–E18/E21 — Missing expected exception: веток валидации
//     slot/rarity/set/affixes/«kind требует slot» в validateItem нет;
//   E20 — sync-items-data.js: KEYS без 4 новых ключей → tmp-репо:
//     «ключи вне схемы» → exit 1.
// Гарды (зелёные с первого запуска): E9 (каталог — 82 предмета без
// новых полей), E19 (armor со ВСЕМИ валидными новыми полями — без
// броска, без console.error, поля сохранены), E22 (D4-каталожность —
// в .01 вакуумно: предметов с affixes нет).

// 000230.08: head-волна (000083-000107) — 25 id с slot/rarity/set/
// affixes (исключение из гарда E9 «предметы не тронуты»).
// 000230.09: уши/шея-волна (000158-000207) — +50 id (каталожный
// порядок: уши 25, потом шея 25).
// 000230.10: torso-волна (000208-000232) — +25 id + 3 legacy-брони
// (leather_armor/chainmail/knight_plate, 000008-000010) — remap +=
// slot "torso" (T1; паттерн исключения REAGENTS_000220).
// 000230.11: руки-волна (000283-000332) — +50 id (каталожный
// порядок: forearms 25, потом palms 25).
const EQUIP_FIELDS_00023001 = new Set(['straw_hat', 'wool_cap',
  'leather_cap', 'fur_hat', 'cloth_band', 'wanderer_cap', 'hood_common',
  'linen_cloth', 'felt_hat', 'travel_cloth', 'silver_band', 'copper_band',
  'obsidian_cloth', 'amethyst_band', 'quartz_cloth', 'bone_band',
  'mystic_cloth', 'silver_helm', 'gold_helm', 'sapphire_helm',
  'mithril_helm', 'emerald_helm', 'rune_hoop', 'star_hoop',
  'crown_flame', 'copper_hoop', 'bone_stud', 'leather_loop',
  'clay_dangle', 'wood_bead', 'copper_dangle', 'shell_hoop',
  'faith_stud', 'twine_hoop', 'antler_hook', 'stone_bead',
  'silver_hoop', 'moonstone_dangle', 'quartz_bead', 'silver_stud',
  'obsidian_stud', 'amethyst_dangle', 'sapphire_hoop', 'emerald_stud',
  'ruby_bell', 'gold_dangle', 'mithril_hoop', 'star_earring',
  'whisper_hoop', 'soul_bell', 'copper_chain', 'bone_beads',
  'twine_amulet', 'clay_pendant', 'wood_pendant', 'copper_pendant',
  'shell_beads', 'faith_necklace', 'leather_choker', 'stone_beads',
  'bone_pendant', 'silver_chain', 'quartz_amulet', 'moonstone_chain',
  'faith_amulet', 'obsidian_pendant', 'amethyst_choker',
  'sapphire_pendant', 'emerald_amulet', 'ruby_pendant', 'gold_chain',
  'mithril_choker', 'rune_necklace', 'star_pendant', 'dawn_pendant',
  'linen_shirt', 'wool_shirt', 'cloth_tunic', 'linen_gown', 'hemp_robe',
  'rough_kaftan', 'wool_gown', 'cloth_sutan', 'linen_tunic',
  'wool_kaftan', 'wool_sutan', 'leather_kaftan', 'embroidered_kaftan',
  'cloth_robe', 'leather_gown', 'monk_sutan', 'fine_kaftan',
  'ember_robe', 'stone_robe', 'shadow_robe', 'deep_breath_robe',
  'meditating_robe', 'pilgrim_sutan', 'void_robe', 'aegis_mantle',
  'leather_armor', 'chainmail', 'knight_plate',
  'cloth_cuff', 'leather_cuff', 'hemp_bracer', 'rough_bracer',
  'leather_garter', 'cloth_wrap', 'iron_cuff', 'bone_bracer',
  'wood_brace', 'hide_cuff', 'studded_bracer', 'copper_brace',
  'archer_brace', 'silver_cuff', 'shadow_wrap', 'iron_elbow',
  'runic_cuff', 'steel_bracers', 'gold_brace', 'sapphire_bracer',
  'ghost_cuff', 'swift_brace', 'rune_bracers', 'star_armguard',
  'titan_brace', 'cloth_gloves', 'leather_gloves', 'hide_gloves',
  'rough_gauntlets', 'archer_gloves', 'linen_wraps', 'iron_gauntlets',
  'bone_grips', 'wood_guards', 'fine_gloves', 'studded_gloves',
  'copper_gauntlets', 'quiver_gloves', 'silver_gauntlets',
  'night_gloves', 'iron_wraps', 'wind_gloves', 'steel_gauntlets',
  'gold_gloves', 'emerald_gauntlets', 'phantom_gloves',
  'haste_wraps', 'rune_gauntlets', 'star_gloves', 'void_gauntlet']);

test('000230.01 E1: schema.json — slot ОПЦИОНАЛЬНО {type: string, enum: 11 значений в порядке ТЗ}, «slot» НЕ в required, верхний additionalProperties false', () => {
  const s = JSON.parse(
    fs.readFileSync(path.join(ITEMS_DIR, 'schema.json'), 'utf8'));
  assert.deepEqual(s.properties.slot, {
    type: 'string',
    enum: ['head', 'ears', 'neck', 'torso', 'forearms', 'right_hand',
           'left_hand', 'palms', 'ring', 'legs', 'feet'],
  }, 'properties.slot — {type, enum 11} (краснота: свойства slot в '
    + 'схеме нет); факт: ' + JSON.stringify(s.properties.slot));
  assert.ok(!s.required.includes('slot'),
    'slot НЕ в required (старые предметы валидны без изменений); '
    + 'факт: ' + JSON.stringify(s.required));
  assert.equal(s.additionalProperties, false,
    'верхний additionalProperties остаётся false (000141)');
});

test('000230.01 E1b: schema.json — порядок properties = 17 канонических ключей (связка с KEYS sync-items-data.js, E20)', () => {
  const s = JSON.parse(
    fs.readFileSync(path.join(ITEMS_DIR, 'schema.json'), 'utf8'));
  assert.deepEqual(Object.keys(s.properties),
    ['id', 'name', 'kind', 'subtype', 'weight', 'value', 'tier',
     'desc', 'stats', 'effect', 'loot', 'icon',
     'slot', 'rarity', 'set', 'affixes', 'set_bonus'],
    'порядок properties — append 5 новых ключей КОНЦОМ (после icon; '
    + 'set_bonus — 000230.04, ПОСЛЕ affixes); '
    + 'краснота: 12 ключей (slot/rarity/set/affixes/set_bonus нет); '
    + 'факт: '
    + JSON.stringify(Object.keys(s.properties)));
});

test('000230.01 E2: schema.json — rarity ОПЦИОНАЛЬНО {type: string, enum: common/rare/epic/legendary/impossible}, «rarity» НЕ в required', () => {
  const s = JSON.parse(
    fs.readFileSync(path.join(ITEMS_DIR, 'schema.json'), 'utf8'));
  assert.deepEqual(s.properties.rarity, {
    type: 'string',
    enum: ['common', 'rare', 'epic', 'legendary', 'impossible'],
  }, 'properties.rarity — {type, enum 5} (краснота: свойства rarity '
    + 'в схеме нет); факт: ' + JSON.stringify(s.properties.rarity));
  assert.ok(!s.required.includes('rarity'),
    'rarity НЕ в required (отдельное поле, НЕ tier — D3); '
    + 'факт: ' + JSON.stringify(s.required));
});

test('000230.01 E3: schema.json — set ОПЦИОНАЛЬНО {type: string, pattern: ^[a-z][a-z0-9_]*$} (id-regex), «set» НЕ в required', () => {
  const s = JSON.parse(
    fs.readFileSync(path.join(ITEMS_DIR, 'schema.json'), 'utf8'));
  assert.deepEqual(s.properties.set, {
    type: 'string',
    pattern: '^[a-z][a-z0-9_]*$',
  }, 'properties.set — {type, pattern id-regex} (краснота: свойства '
    + 'set в схеме нет); факт: ' + JSON.stringify(s.properties.set));
  assert.ok(!s.required.includes('set'),
    'set НЕ в required (наборы — 000230.04); '
    + 'факт: ' + JSON.stringify(s.required));
});

test('000230.01 E4: schema.json — affixes ОПЦИОНАЛЬНО {type: array, minItems 1, items: oneOf [skill-вариант, free_cast-вариант], каждый вариант additionalProperties false}, «affixes» НЕ в required', () => {
  const s = JSON.parse(
    fs.readFileSync(path.join(ITEMS_DIR, 'schema.json'), 'utf8'));
  assert.deepEqual(s.properties.affixes, {
    type: 'array',
    minItems: 1,
    items: {
      oneOf: [
        {
          type: 'object',
          required: ['type', 'skill', 'amount'],
          properties: {
            type: { const: 'skill' },
            skill: { type: 'string', pattern: '^[a-z][a-z0-9_]*$' },
            amount: { type: 'number' },
          },
          additionalProperties: false,
        },
        {
          type: 'object',
          required: ['type', 'spell'],
          properties: {
            type: { const: 'free_cast' },
            spell: { type: 'string', pattern: '^[a-z][a-z0-9_]*$' },
          },
          additionalProperties: false,
        },
      ],
    },
  }, 'properties.affixes — точная под-схема (amount БЕЗ границ — '
    + 'может быть отрицательным; oneOf — взаимоисключаемые варианты '
    + 'по const type; краснота: свойства affixes в схеме нет); '
    + 'факт: ' + JSON.stringify(s.properties.affixes));
  assert.ok(!s.required.includes('affixes'),
    'affixes НЕ в required (только у экипируемых); '
    + 'факт: ' + JSON.stringify(s.required));
});

test('000230.01 E5: schema.json — kind-enum — 13 значений: текущие 8 + shield/artifact/tool/ring + craft_scroll (ре-пин 000232, append концом)', () => {
  const s = JSON.parse(
    fs.readFileSync(path.join(ITEMS_DIR, 'schema.json'), 'utf8'));
  assert.deepEqual(s.properties.kind.enum,
    ['weapon', 'armor', 'potion', 'food', 'skill_book', 'reagent',
     'spell_scroll', 'resurrection_scroll',
     'shield', 'artifact', 'tool', 'ring', 'craft_scroll'],
    'kind-enum — 13 значений (краснота: 8 — новые kind нет); '
    + 'факт: ' + JSON.stringify(s.properties.kind.enum));
});

test('000230.01 E6: schema.json — subtype-enum — sword/bow/heavy + staff (append концом)', () => {
  const s = JSON.parse(
    fs.readFileSync(path.join(ITEMS_DIR, 'schema.json'), 'utf8'));
  assert.deepEqual(s.properties.subtype.enum,
    ['sword', 'bow', 'heavy', 'staff'],
    'subtype-enum — 4 значения (краснота: 3 — staff нет); '
    + 'факт: ' + JSON.stringify(s.properties.subtype.enum));
});

test('000230.01 E7: schema.json — icon-паттерн — ОБЕ директории loot/ и items/', () => {
  const s = JSON.parse(
    fs.readFileSync(path.join(ITEMS_DIR, 'schema.json'), 'utf8'));
  assert.deepEqual(s.properties.icon, {
    type: 'string',
    pattern: '^assets/sprites/(loot|items)/[\\w_]+\\.svg$',
  }, 'properties.icon — паттерн ОБЕХ директорий (краснота: только '
    + 'loot/); факт: ' + JSON.stringify(s.properties.icon));
});

test('000230.01 E8: src/items.js — ITEM_KINDS += SHIELD/ARTIFACT/TOOL/RING, WEAPON_SUBTYPES += STAFF; константы EQUIP_SLOTS/ITEM_RARITIES/AFFIX_TYPES/EQUIP_KINDS', () => {
  assert.equal(I.ITEM_KINDS.SHIELD, 'shield',
    'ITEM_KINDS.SHIELD (краснота: константы нет — 8 kind)');
  assert.equal(I.ITEM_KINDS.ARTIFACT, 'artifact',
    'ITEM_KINDS.ARTIFACT (краснота: константы нет)');
  assert.equal(I.ITEM_KINDS.TOOL, 'tool',
    'ITEM_KINDS.TOOL (краснота: константы нет)');
  assert.equal(I.ITEM_KINDS.RING, 'ring',
    'ITEM_KINDS.RING (краснота: константы нет)');
  assert.equal(I.WEAPON_SUBTYPES.STAFF, 'staff',
    'WEAPON_SUBTYPES.STAFF (краснота: константы нет — 3 subtype)');
  assert.deepEqual(I.EQUIP_SLOTS, {
    HEAD: 'head', EARS: 'ears', NECK: 'neck', TORSO: 'torso',
    FOREARMS: 'forearms', RIGHT_HAND: 'right_hand',
    LEFT_HAND: 'left_hand', PALMS: 'palms', RING: 'ring',
    LEGS: 'legs', FEET: 'feet',
  }, 'EQUIP_SLOTS — 11 слотов в порядке ТЗ (краснота: константы нет)');
  assert.deepEqual(I.ITEM_RARITIES, {
    COMMON: 'common', RARE: 'rare', EPIC: 'epic',
    LEGENDARY: 'legendary', IMPOSSIBLE: 'impossible',
  }, 'ITEM_RARITIES — 5 редкостей в порядке ТЗ (краснота: нет)');
  assert.deepEqual(I.AFFIX_TYPES,
    { SKILL: 'skill', FREE_CAST: 'free_cast' },
    'AFFIX_TYPES — 2 типа (краснота: константы нет)');
  assert.deepEqual(
    I.EQUIP_KINDS instanceof Set ? [...I.EQUIP_KINDS].sort() : null,
    ['armor', 'artifact', 'ring', 'shield', 'tool', 'weapon'],
    'EQUIP_KINDS — ровно 6 экипируемых kind (краснота: константы нет)');
});

test('000230.01 E9 (ГАРД): каталог — ровно 307 предметов (ре-пин 000230.08: +25 head; ре-пин 000232: +6 чертежей; ре-пин 000235.07: +25 свитков волны Огонь; ре-пин 000235.08: +25 свитков волны Лёд; ре-пин 000230.09: +50 уши/шея; ре-пин 000230.10: +25 torso + 3 legacy remap; ре-пин 000235.09: +25 свитков волны Тень; ре-пин 000230.11: +50 рук), у НОЛЬ предметов есть ЛЮБОЕ из slot/rarity/set/affixes (пин «существующие предметы не меняются», ТЗ «Что сделать» 4)', () => {
  const items = I.allItems();
  // Ре-пин 000230.11: каталог 257 → 307 (+50 рук).
  assert.equal(items.length, 307, 'каталог — ровно 307 предмета');
  let others = 0;
  for (const it of items) {
    if (EQUIP_FIELDS_00023001.has(it.id)) continue;
    assert.equal(it.slot, undefined,
      it.id + ': slot отсутствует (предмет не тронут, 000230.01)');
    assert.equal(it.rarity, undefined,
      it.id + ': rarity отсутствует (предмет не тронут, 000230.01)');
    assert.equal(it.set, undefined,
      it.id + ': set отсутствует (предмет не тронут, 000230.01)');
    assert.equal(it.affixes, undefined,
      it.id + ': affixes отсутствует (предмет не тронут, 000230.01)');
    others++;
  }
  assert.equal(others, 154, 'прочих предметов — ровно 154 (ре-пин 000230.09: '
    + '182 − 75 equip-исключений = 107 (25 head + 50 уши/шея); '
    + 'ре-пин 000230.10: +25 torso + 3 legacy remap; ре-пин 000235.09: '
    + '+25 свитков волны Тень → 257 − 103 equip-исключений = 154; '
    + 'ре-пин 000230.11: +50 рук → 307 − 153 equip-исключений = 154; '
    + '000232: +6 чертежей без equip-полей; 000235.07: +25 свитков '
    + 'без equip-полей; 000235.08: +25 свитков волны Лёд без '
    + 'equip-полей; 000235.09: +25 свитков волны Тень без '
    + 'equip-полей)');
});

test('000230.01 E10 (vm): НОВЫЕ kind shield/artifact/tool/ring — валидные фикстуры (id/name/kind/slot/weight/value/desc) грузятся БЕЗ броска, без console.error, поля сохранены', () => {
  const fixtures = [
    { id: 'x_shield', name: 'Тестовый щит', kind: 'shield',
      slot: 'left_hand', weight: 3, value: 50, desc: 'т' },
    { id: 'x_artifact', name: 'Тестовый артефакт', kind: 'artifact',
      slot: 'left_hand', weight: 0.5, value: 100, desc: 'т' },
    { id: 'x_tool', name: 'Тестовый инструмент', kind: 'tool',
      slot: 'right_hand', weight: 1, value: 20, desc: 'т' },
    { id: 'x_ring', name: 'Тестовое кольцо', kind: 'ring',
      slot: 'ring', weight: 0.1, value: 30, desc: 'т' },
  ];
  const { sandbox, errors } = makeVmSandboxWithConsole();
  loadItemsVmChain(sandbox);
  sandbox.Game.ITEMS = fixtures;
  assert.doesNotThrow(() => loadInSandbox('items.js', sandbox),
    'новые kind — без броска (краснота: СУЩЕСТВУЮЩИЙ бросок '
    + '«неизвестный тип: shield» — kind не в ITEM_KINDS)');
  assert.equal(errors.length, 0,
    'console.error нет; факт: ' + JSON.stringify(errors));
  for (const f of fixtures) {
    assert.deepEqual(fromVm(sandbox.Game.getItem(f.id)), f,
      f.id + ': поля сохранены (валидация не мутирует/не отбрасывает)');
  }
});

test('000230.01 E11 (vm): weapon с subtype «staff» + stats.damage — загрузка БЕЗ броска, без console.error', () => {
  const { sandbox, errors } = makeVmSandboxWithConsole();
  loadItemsVmChain(sandbox);
  sandbox.Game.ITEMS = [{ id: 'x_staff', name: 'Тестовый посох',
    kind: 'weapon', subtype: 'staff', stats: { damage: 7 },
    weight: 4, value: 80, desc: 'т' }];
  assert.doesNotThrow(() => loadInSandbox('items.js', sandbox),
    'staff — без броска (краснота: СУЩЕСТВУЮЩИЙ бросок «у оружия '
    + 'нужен подтип sword|bow|heavy» — staff не в WEAPON_SUBTYPES)');
  assert.equal(errors.length, 0,
    'console.error нет; факт: ' + JSON.stringify(errors));
  assert.equal(fromVm(sandbox.Game.getItem('x_staff').subtype), 'staff',
    'subtype сохранён');
});

test('000230.01 E12 (vm): armor с slot вне enum («wrist») → Error /неизвестный slot/ при загрузке', () => {
  const { sandbox } = makeVmSandboxWithConsole();
  loadItemsVmChain(sandbox);
  sandbox.Game.ITEMS = [{ id: 'x_armor', name: 'Тестовая броня',
    kind: 'armor', stats: { armor: 2 }, slot: 'wrist',
    weight: 5, value: 40, desc: 'т' }];
  assert.throws(
    () => loadInSandbox('items.js', sandbox),
    /неизвестный slot/,
    'load-time-валидация бросает на slot вне enum (краснота: ветки '
    + 'валидации slot в validateItem нет — Missing expected '
    + 'exception)');
});

test('000230.01 E13 (vm): armor с rarity вне enum («mythic») → Error /неизвестная редкость/ при загрузке', () => {
  const { sandbox } = makeVmSandboxWithConsole();
  loadItemsVmChain(sandbox);
  sandbox.Game.ITEMS = [{ id: 'x_armor', name: 'Тестовая броня',
    kind: 'armor', stats: { armor: 2 }, rarity: 'mythic',
    weight: 5, value: 40, desc: 'т' }];
  assert.throws(
    () => loadInSandbox('items.js', sandbox),
    /неизвестная редкость/,
    'load-time-валидация бросает на rarity вне enum (краснота: ветки '
    + 'нет — Missing expected exception)');
});

test('000230.01 E14 (vm): armor с set вне паттерна («Bad-Set» / «9set») → Error /set/ при загрузке', () => {
  for (const bad of ['Bad-Set', '9set']) {
    const { sandbox } = makeVmSandboxWithConsole();
    loadItemsVmChain(sandbox);
    sandbox.Game.ITEMS = [{ id: 'x_armor', name: 'Тестовая броня',
      kind: 'armor', stats: { armor: 2 }, set: bad,
      weight: 5, value: 40, desc: 'т' }];
    assert.throws(
      () => loadInSandbox('items.js', sandbox),
      /set/,
      'load-time-валидация бросает на set «' + bad + '» '
      + '(краснота: ветки нет — Missing expected exception)');
  }
});

test('000230.01 E15 (vm): armor с affixes — skill id вне формы («Fireball») и неизвестный type («bogus») → Error /affixes/ при загрузке (D4: валидатор — ФОРМА id)', () => {
  for (const affixes of [
    [{ type: 'skill', skill: 'Fireball' }],
    [{ type: 'bogus' }],
  ]) {
    const { sandbox } = makeVmSandboxWithConsole();
    loadItemsVmChain(sandbox);
    sandbox.Game.ITEMS = [{ id: 'x_armor', name: 'Тестовая броня',
      kind: 'armor', stats: { armor: 2 }, affixes,
      weight: 5, value: 40, desc: 'т' }];
    assert.throws(
      () => loadInSandbox('items.js', sandbox),
      /affixes/,
      'load-time-валидация бросает на affixes '
      + JSON.stringify(affixes) + ' (краснота: ветки нет — Missing '
      + 'expected exception)');
  }
});

test('000230.01 E16 (vm): armor с affixes [{type: skill, skill: «swordsman», amount: «5»/NaN/null}] (amount не число) → Error /amount/ при загрузке', () => {
  for (const amount of ['5', NaN, null]) {
    const { sandbox } = makeVmSandboxWithConsole();
    loadItemsVmChain(sandbox);
    sandbox.Game.ITEMS = [{ id: 'x_armor', name: 'Тестовая броня',
      kind: 'armor', stats: { armor: 2 },
      affixes: [{ type: 'skill', skill: 'swordsman', amount }],
      weight: 5, value: 40, desc: 'т' }];
    assert.throws(
      () => loadInSandbox('items.js', sandbox),
      /amount/,
      'load-time-валидация бросает на amount ' + String(amount)
      + ' (краснота: ветки нет — Missing expected exception)');
  }
});

test('000230.01 E17 (vm): armor с affixes [{type: free_cast, spell: «9bad»}] (spell вне формы) → Error /spell/ при загрузке', () => {
  const { sandbox } = makeVmSandboxWithConsole();
  loadItemsVmChain(sandbox);
  sandbox.Game.ITEMS = [{ id: 'x_armor', name: 'Тестовая броня',
    kind: 'armor', stats: { armor: 2 },
    affixes: [{ type: 'free_cast', spell: '9bad' }],
    weight: 5, value: 40, desc: 'т' }];
  assert.throws(
    () => loadInSandbox('items.js', sandbox),
    /spell/,
    'load-time-валидация бросает на spell «9bad» (краснота: ветки '
    + 'нет — Missing expected exception)');
});

test('000230.01 E18 (vm): reagent с ВАЛИДНЫМИ affixes и с ВАЛИДНЫМ slot → Error /только у экипируемых/ при загрузке (ТЗ: поля экипировки — только у 6 экипируемых kind)', () => {
  for (const extra of [
    { affixes: [{ type: 'skill', skill: 'swordsman', amount: 0.05 }] },
    { slot: 'torso' },
  ]) {
    const { sandbox } = makeVmSandboxWithConsole();
    loadItemsVmChain(sandbox);
    sandbox.Game.ITEMS = [{ id: 'x_test', name: 'Тестовый реагент',
      kind: 'reagent', weight: 0.1, value: 1, desc: 'т', ...extra }];
    assert.throws(
      () => loadInSandbox('items.js', sandbox),
      /только у экипируемых/,
      'load-time-валидация бросает на reagent с '
      + Object.keys(extra).join('/') + ' (краснота: ветки нет — '
      + 'Missing expected exception)');
  }
});

test('000230.01 E19 (ГАРД, vm): armor со ВСЕМИ валидными новыми полями (slot/rarity/set/affixes skill+free_cast) — загрузка БЕЗ броска, БЕЗ console.error, поля сохранены deepEqual (гард от избыточной валидации)', () => {
  const { sandbox, errors } = makeVmSandboxWithConsole();
  loadItemsVmChain(sandbox);
  const it = { id: 'x_guard', name: 'Тестовая броня', kind: 'armor',
    stats: { armor: 3 }, weight: 6, value: 60, desc: 'т',
    slot: 'torso', rarity: 'rare', set: 'guardian',
    affixes: [
      { type: 'skill', skill: 'swordsman', amount: 0.05 },
      { type: 'free_cast', spell: 'fireball' },
    ] };
  sandbox.Game.ITEMS = [it];
  assert.doesNotThrow(() => loadInSandbox('items.js', sandbox),
    'валидный armor со ВСЕМИ 4 полями — без броска (гард от '
    + 'избыточной валидации)');
  assert.deepEqual(fromVm(sandbox.Game.getItem('x_guard')), it,
    'поля сохранены (валидация не мутирует/не отбрасывает)');
  assert.equal(errors.length, 0,
    'console.error на валидном каталоге нет; факт: '
    + JSON.stringify(errors));
});

test('000230.01 E20: sync-items-data.js — новые поля slot/rarity/set/affixes проходят в зеркало в каноническом порядке (функциональный tmp-репо: fixture ring с ВСЕМИ 4 полями)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-items-00023001-'));
  try {
    fs.mkdirSync(path.join(dir, 'scripts', 'lib'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'assets', 'items'), { recursive: true });
    fs.copyFileSync(
      path.join(__dirname, '..', 'scripts', 'sync-items-data.js'),
      path.join(dir, 'scripts', 'sync-items-data.js'));
    fs.copyFileSync(
      path.join(__dirname, '..', 'scripts', 'lib', 'write-atomic.js'),
      path.join(dir, 'scripts', 'lib', 'write-atomic.js'));
    // Ре-пин 000232: sync-items-data.js резолвит effect.recipe через
    // scripts/lib/json-ref.js (конвенция 000211) — копировать lib.
    fs.copyFileSync(
      path.join(__dirname, '..', 'scripts', 'lib', 'json-ref.js'),
      path.join(dir, 'scripts', 'lib', 'json-ref.js'));
    fs.writeFileSync(path.join(dir, 'assets', 'items', '000001.json'),
      JSON.stringify({
        id: 'x_ring', name: 'Тестовое кольцо', kind: 'ring',
        weight: 0.1, value: 30, desc: 'т',
        icon: 'assets/sprites/items/x_ring.svg',
        slot: 'ring', rarity: 'rare', set: 'guardian',
        affixes: [{ type: 'skill', skill: 'swordsman', amount: 0.05 }],
      }, null, 2) + '\n', 'utf8');
    const run = () => spawnSync(process.execPath,
      [path.join(dir, 'scripts', 'sync-items-data.js')],
      { cwd: dir, encoding: 'utf8' });
    const mirrorFile = path.join(dir, 'src', 'items-data.js');
    const res = run();
    assert.equal(res.status, 0,
      'sync — exit 0 (краснота: KEYS без 4 ключей — «ключи вне '
      + 'схемы: slot, rarity, set, affixes» → exit 1); факт: '
      + (res.stderr || res.stdout));
    const mirror = fs.readFileSync(mirrorFile, 'utf8');
    for (const f of ['slot', 'rarity', 'set', 'affixes']) {
      assert.ok(mirror.includes(f + ': '),
        f + ' — в зеркале (краснота: ключа нет в KEYS — не выводится)');
    }
    const pos = (k) => mirror.indexOf(k + ':');
    assert.ok(pos('icon') !== -1 && pos('icon') < pos('slot')
      && pos('slot') < pos('rarity') && pos('rarity') < pos('set')
      && pos('set') < pos('affixes'),
      'канонический порядок icon < slot < rarity < set < affixes '
      + '(связка с порядком properties schema.json, E1); факт: '
      + JSON.stringify({
        icon: pos('icon'), slot: pos('slot'), rarity: pos('rarity'),
        set: pos('set'), affixes: pos('affixes'),
      }));
    const once = fs.readFileSync(mirrorFile);
    const res2 = run();
    assert.equal(res2.status, 0,
      'повторный запуск — exit 0; факт: ' + (res2.stderr || res2.stdout));
    assert.deepEqual(fs.readFileSync(mirrorFile), once,
      'повторный запуск — byte-identical (идемпотентность)');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('000230.01 E21 (vm): shield БЕЗ slot → Error /требует slot/ при загрузке (D1: новый kind экипировки — ВСЕГДА с явным slot)', () => {
  const { sandbox } = makeVmSandboxWithConsole();
  loadItemsVmChain(sandbox);
  sandbox.Game.ITEMS = [{ id: 'x_shield2', name: 'Щит без слота',
    kind: 'shield', weight: 3, value: 50, desc: 'т' }];
  assert.throws(
    () => loadInSandbox('items.js', sandbox),
    /требует slot/,
    'load-time-валидация бросает на shield без slot (краснота: ветки '
    + '«kind требует slot» нет — Missing expected exception)');
});

test('000230.01 E22 (ГАРД): D4-каталожность — каждый skill-affix: skill ∈ каталогу навыков (live), каждый free_cast: spell ∈ каталогу заклинаний (в .01 вакуумно: предметов с affixes нет; с волн .08+ — постоянный пин, прецедент S1 000133)', () => {
  const skillIds = new Set([
    ...SKILLS_DATA.PRIMARY_SKILLS.map((s) => s.id),
    ...Object.keys(SKILLS_DATA.SECONDARY_SKILLS),
  ]);
  for (const it of I.allItems()) {
    if (it.affixes === undefined) continue;
    for (const [i, a] of it.affixes.entries()) {
      if (a.type === 'skill') {
        assert.ok(skillIds.has(a.skill),
          it.id + ': affixes[' + i + '].skill «' + a.skill
          + '» — в каталоге навыков (D4: форма — валидатор, '
          + 'каталожность — тестом)');
      } else if (a.type === 'free_cast') {
        assert.ok(SPELLS.SPELLS_BY_ID[a.spell],
          it.id + ': affixes[' + i + '].spell «' + a.spell
          + '» — в каталоге заклинаний (D4)');
      }
    }
  }
});

// --- Задача 000230.02: экипировка — 2 слота → 11 частей тела +
// 8 слотов колец (P0) ---
//
// Контракт — memory/000230.02-multi-slot-equipment-model.md §2/§6:
//   * RING_SLOTS — 8 физ. слотов колец (ring_left_1..4, ring_right_1..4);
//     EQUIP_PHYS_SLOTS — 18 физ. слотов (10 одиночных в порядке ТЗ +
//     кольца концом) — ключи c.equipment;
//   * c.equipment — канон-форма: 18 физ. + зеркала weapon ≡ right_hand,
//     armor ≡ torso концом (20 ключей); c.equipmentBonus — 18 физ.
//     ключей, зеркал НЕТ (D-15);
//   * slotOf(item) — формула ТЗ дословно: item.slot || (weapon →
//     right_hand, armor → torso, иначе null);
//   * equip — по слоту (кольца: первый пустой из 8 в порядке
//     RING_SLOTS; все 8 заняты — «нет свободных слотов колец»);
//     unequip — алиасы 'weapon'/'armor';
//   * equipmentStats — интерфейс {damage, subtype, hitBonus, dmgBonus,
//     armor} НЕ меняется: урон из right_hand, armor — СУММА всех 18
//     слотов + бонус качества надетого (000046, raw-чтение eb);
//   * sanitizeEquipment/Bonus — новая форма + backfill старой
//     (weapon→right_hand, armor→torso); битое/неизвестное → null
//     (паттерн 000029); physical ПРЁТ над legacy (D-09);
//   * useItem/useQuickUnit — 6 kind'ов EQUIP_KINDS — отказ
//     «<имя> — экипируется» (после weapon/armor-веток; предмет НЕ
//     тратится, быстрый слот цел).
// RED (TDD): краснота осмысленная — в текущем коде нет
// slotOf/RING_SLOTS/EQUIP_PHYS_SLOTS, slot-мапы c.equipment,
// backfill, новой формы sanitize* и useItem-отказа; syntax/require-
// падений нет (хелперы уже в файле). Фикстуры проходят валидацию
// .01 (новый kind — ВСЕГДА с явным slot, E21; weight/value > 0, desc).

const PHYS_SLOTS_00023002 = ['head', 'ears', 'neck', 'torso', 'forearms',
  'right_hand', 'left_hand', 'palms', 'legs', 'feet',
  'ring_left_1', 'ring_left_2', 'ring_left_3', 'ring_left_4',
  'ring_right_1', 'ring_right_2', 'ring_right_3', 'ring_right_4'];
function emptyEquipment() {
  const o = {};
  for (const s of PHYS_SLOTS_00023002) o[s] = null;
  o.weapon = null; o.armor = null;
  return o;
}
function emptyEquipmentBonus() {
  const o = {};
  for (const s of PHYS_SLOTS_00023002) o[s] = null;
  return o;
}

test('000230.02 M1 (node): RING_SLOTS (8) / EQUIP_PHYS_SLOTS (18) — экспортированные константы; slotOf — формула ТЗ (явный slot в приоритете, weapon → right_hand, armor → torso, прочее → null)', () => {
  assert.deepEqual(I.RING_SLOTS, [
    'ring_left_1', 'ring_left_2', 'ring_left_3', 'ring_left_4',
    'ring_right_1', 'ring_right_2', 'ring_right_3', 'ring_right_4',
  ], 'RING_SLOTS — 8 физ. слотов колец, левая рука первой, 1..4 '
    + '(краснота: константы нет)');
  assert.deepEqual(I.EQUIP_PHYS_SLOTS, PHYS_SLOTS_00023002,
    'EQUIP_PHYS_SLOTS — 18 физ. слотов (10 одиночных + кольца концом) '
    + '(краснота: константы нет)');
  assert.equal(typeof I.slotOf, 'function',
    'slotOf экспортирован (краснота: функции нет)');
  assert.equal(I.slotOf(I.getItem('wood_sword')), 'right_hand',
    'weapon БЕЗ slot → right_hand (фолбэк — JSON не меняется)');
  assert.equal(I.slotOf(I.getItem('leather_armor')), 'torso',
    'armor с ЯВНЫМ slot "torso" (remap 000230.10) → torso');
  assert.equal(I.slotOf({ kind: 'armor' }), 'torso',
    'armor БЕЗ slot → torso (kind-фолбэк 000230.02 — синтетика: '
    + 'после remap 000230.10 ВСЕ armor каталога имеют явный slot)');
  assert.equal(I.slotOf(I.getItem('healing_potion')), null,
    'potion → null (не экипировка)');
  assert.equal(I.slotOf({ kind: 'armor', slot: 'head' }), 'head',
    'явный slot в приоритете над фолбэком kind-а');
});

test('000230.02 M2 (vm): equip по части тела — armor slot head → eq.head; shield → left_hand; tool → right_hand; ring → первый пустой ring-слот; weapon БЕЗ slot / armor с ЯВНЫМ slot "torso" (реальные wood_sword/leather_armor, remap 000230.10) → right_hand/torso; ответ {ok, slot: физический, item}', () => {
  const fixtures = [
    { id: 'x_head', name: 'Тестовый шлем', kind: 'armor',
      stats: { armor: 1 }, slot: 'head', weight: 2, value: 20, desc: 'т' },
    { id: 'x_shield', name: 'Тестовый щит', kind: 'shield',
      slot: 'left_hand', weight: 3, value: 50, desc: 'т' },
    { id: 'x_tool', name: 'Тестовый инструмент', kind: 'tool',
      slot: 'right_hand', weight: 1, value: 20, desc: 'т' },
    { id: 'x_ring', name: 'Тестовое кольцо', kind: 'ring',
      slot: 'ring', weight: 0.1, value: 30, desc: 'т' },
    I.getItem('wood_sword'),
    I.getItem('leather_armor'),
  ];
  const { sandbox } = makeVmSandboxWithConsole();
  loadItemsVmChain(sandbox);
  sandbox.Game.ITEMS = fixtures;
  loadInSandbox('items.js', sandbox);
  const G = sandbox.Game;
  const c = G.createCharacter();
  for (const id of ['x_head', 'x_shield', 'x_tool', 'x_ring',
      'wood_sword', 'leather_armor']) {
    G.addItem(c, id);
  }
  const r1 = G.equip(c, 'x_head');
  assert.equal(r1.ok, true, 'armor с slot head экипируется');
  assert.equal(r1.slot, 'head',
    'ответ — ФИЗИЧЕСКИЙ слот (краснота: слот только по kind — «armor»)');
  assert.equal(r1.item, 'x_head');
  assert.equal(c.equipment.head, 'x_head', 'шлем в слоте head');
  const r2 = G.equip(c, 'x_shield');
  assert.equal(r2.ok, true,
    'shield экипируется (краснота: «такое не экипируется» — kind shield)');
  assert.equal(r2.slot, 'left_hand');
  assert.equal(c.equipment.left_hand, 'x_shield');
  const r3 = G.equip(c, 'x_tool');
  assert.equal(r3.ok, true,
    'tool экипируется (краснота: «такое не экипируется» — kind tool)');
  assert.equal(r3.slot, 'right_hand');
  assert.equal(c.equipment.right_hand, 'x_tool');
  const r4 = G.equip(c, 'x_ring');
  assert.equal(r4.ok, true,
    'ring экипируется (краснота: «такое не экипируется» — kind ring)');
  assert.equal(r4.slot, 'ring_left_1', 'кольцо — первый пустой из 8');
  assert.equal(c.equipment.ring_left_1, 'x_ring');
  const r5 = G.equip(c, 'wood_sword');
  assert.equal(r5.ok, true);
  assert.equal(r5.slot, 'right_hand',
    'weapon БЕЗ slot → right_hand (пин ТЗ: JSON предметов не меняется)');
  assert.equal(c.equipment.right_hand, 'wood_sword',
    'реальный меч в right_hand (заменяет tool)');
  const r6 = G.equip(c, 'leather_armor');
  assert.equal(r6.ok, true);
  assert.equal(r6.slot, 'torso',
    'armor с ЯВНЫМ slot "torso" (remap 000230.10) → torso '
    + '(пин ТЗ: JSON предметов не меняется)');
  assert.equal(c.equipment.torso, 'leather_armor');
});

test('000230.02 M3 (vm): один предмет на слот — второй шлем заменяет первый; предыдущий возвращён в инвентарь (с бонусом качества, 000046); зеркала weapon/armor не тронуты; unequip по физическому слоту возвращает предмет', () => {
  const fixtures = [
    { id: 'x_head_a', name: 'Шлем A', kind: 'armor',
      stats: { armor: 2 }, slot: 'head', weight: 2, value: 20, desc: 'т' },
    { id: 'x_head_b', name: 'Шлем B', kind: 'armor',
      stats: { armor: 2 }, slot: 'head', weight: 2, value: 20, desc: 'т' },
  ];
  const { sandbox } = makeVmSandboxWithConsole();
  loadItemsVmChain(sandbox);
  sandbox.Game.ITEMS = fixtures;
  loadInSandbox('items.js', sandbox);
  const G = sandbox.Game;
  const c = G.createCharacter();
  G.addItem(c, 'x_head_a', 1, { armor: 2 });
  G.addItem(c, 'x_head_b');
  const rA = G.equip(c, 'x_head_a');
  assert.equal(rA.ok, true);
  assert.equal(rA.slot, 'head',
    'краснота: armor кладётся в «armor» независимо от slot');
  assert.equal(c.equipment.head, 'x_head_a');
  const rB = G.equip(c, 'x_head_b');
  assert.equal(rB.ok, true, 'та же часть тела — замена (один предмет на слот)');
  assert.equal(c.equipment.head, 'x_head_b', 'B в слоте, A снят');
  assert.equal(G.totalQty(c, 'x_head_a'), 1, 'A возвращён в инвентарь');
  const slotA = fromVm(c.inventory.slots).find((e) => e.id === 'x_head_a');
  assert.ok(slotA, 'слот A в инвентаре');
  assert.deepEqual(slotA.bonus, { armor: 2 },
    'бонус качества — с предметом (000046)');
  assert.equal(c.equipment.weapon, null,
    'зеркало weapon не тронуто (head ≠ right_hand)');
  assert.equal(c.equipment.armor, null,
    'зеркало armor не тронуто (head ≠ torso)');
  const rU = G.unequip(c, 'head');
  assert.equal(rU.ok, true,
    'unequip по физическому слоту (краснота: eq.head отсутствует — «ничего не экипировано»)');
  assert.equal(c.equipment.head, null);
  assert.equal(G.totalQty(c, 'x_head_b'), 1, 'B возвращён в инвентарь');
});

test('000230.02 M4 (vm): смена в одиночном слоте возвращает предыдущий (реальные предметы) — wood_sword → iron_sword: right_hand = iron_sword, зеркало weapon ≡ right_hand, старый меч в инвентаре', () => {
  const fixtures = [I.getItem('wood_sword'), I.getItem('iron_sword')];
  const { sandbox } = makeVmSandboxWithConsole();
  loadItemsVmChain(sandbox);
  sandbox.Game.ITEMS = fixtures;
  loadInSandbox('items.js', sandbox);
  const G = sandbox.Game;
  const c = G.createCharacter();
  G.addItem(c, 'wood_sword');
  G.addItem(c, 'iron_sword');
  G.equip(c, 'wood_sword');
  const r = G.equip(c, 'iron_sword');
  assert.equal(r.ok, true);
  assert.equal(c.equipment.right_hand, 'iron_sword',
    'краснота: оружие в «weapon», key right_hand отсутствует');
  assert.equal(c.equipment.weapon, 'iron_sword', 'зеркало weapon ≡ right_hand');
  assert.equal(G.totalQty(c, 'wood_sword'), 1, 'предыдущий меч — в инвентаре');
});

test('000230.02 M5 (vm): 4+4 кольца — 8 equip заполняют ring_left_1..4 + ring_right_1..4 (порядок RING_SLOTS); 9-е — отказ «нет свободных слотов колец»; освобождённый слот занимает следующее кольцо — первым пустым ПО ПОРЯДКУ', () => {
  const fixtures = [
    { id: 'x_ring', name: 'Тестовое кольцо', kind: 'ring',
      slot: 'ring', weight: 0.1, value: 30, desc: 'т' },
  ];
  const { sandbox } = makeVmSandboxWithConsole();
  loadItemsVmChain(sandbox);
  sandbox.Game.ITEMS = fixtures;
  loadInSandbox('items.js', sandbox);
  const G = sandbox.Game;
  const c = G.createCharacter();
  G.addItem(c, 'x_ring', 9);
  const order = ['ring_left_1', 'ring_left_2', 'ring_left_3',
    'ring_left_4', 'ring_right_1', 'ring_right_2', 'ring_right_3',
    'ring_right_4'];
  for (const slot of order) {
    const r = G.equip(c, 'x_ring');
    assert.equal(r.ok, true,
      'кольцо экипируется (краснота: «такое не экипируется» — kind ring)');
    assert.equal(r.slot, slot,
      'порядок — первый пустой по RING_SLOTS (левая рука первой)');
    assert.equal(c.equipment[slot], 'x_ring');
  }
  assert.equal(G.totalQty(c, 'x_ring'), 1, '8 надето, 1 в инвентаре');
  const r9 = G.equip(c, 'x_ring');
  assert.equal(r9.ok, false, '9-е кольцо — отказ (слотов 8)');
  assert.equal(r9.reason, 'нет свободных слотов колец');
  assert.equal(G.totalQty(c, 'x_ring'), 1, 'предмет не тратится');
  const rU = G.unequip(c, 'ring_left_2');
  assert.equal(rU.ok, true,
    'unequip конкретного ring-слота (краснота: слот не существует)');
  assert.equal(c.equipment.ring_left_2, null, 'слот освобождён');
  assert.equal(G.totalQty(c, 'x_ring'), 2);
  const r10 = G.equip(c, 'x_ring');
  assert.equal(r10.ok, true);
  assert.equal(r10.slot, 'ring_left_2',
    'следующее кольцо — первый пустой ПО ПОРЯДКУ (не конец, не right_*)');
  assert.equal(c.equipment.ring_left_2, 'x_ring');
  assert.equal(G.totalQty(c, 'x_ring'), 1);
});

test('000230.02 M6 (vm+node): equipmentStats — интерфейс {damage, subtype, hitBonus, dmgBonus, armor} не меняется: armor = СУММА stats.armor всех слотов (+ бонус качества надетого, 000046); damage/subtype/hitBonus/dmgBonus — ТОЛЬКО из right_hand; staff — damage без бонусов; tool БЕЗ stats.damage — 0/null без падения; ghost — вклад 0', () => {
  const fixtures = [
    { id: 'x_head6', name: 'Тестовый шлем', kind: 'armor',
      stats: { armor: 1 }, slot: 'head', weight: 1, value: 10, desc: 'т' },
    { id: 'x_torso6', name: 'Тестовая кираса', kind: 'armor',
      stats: { armor: 2 }, slot: 'torso', weight: 2, value: 20, desc: 'т' },
    { id: 'x_legs6', name: 'Тестовые поножи', kind: 'armor',
      stats: { armor: 3 }, slot: 'legs', weight: 3, value: 30, desc: 'т' },
    { id: 'x_staff6', name: 'Тестовый посох', kind: 'weapon',
      subtype: 'staff', stats: { damage: 7 }, weight: 4, value: 80,
      desc: 'т' },
    { id: 'x_tool6', name: 'Тестовый инструмент', kind: 'tool',
      slot: 'right_hand', weight: 1, value: 20, desc: 'т' },
    I.getItem('iron_sword'),
    I.getItem('short_bow'),
  ];
  const { sandbox } = makeVmSandboxWithConsole();
  loadItemsVmChain(sandbox);
  sandbox.Game.ITEMS = fixtures;
  loadInSandbox('items.js', sandbox);
  const G = sandbox.Game;
  const c = G.createCharacter();
  c.secondary.swordsman = 6;
  c.secondary.archer = 4;
  c.secondary.accuracy = 2;
  G.addItem(c, 'x_head6');
  G.addItem(c, 'x_torso6');
  G.addItem(c, 'x_legs6');
  // Тех-фикс (зелёная стадия): equip требует предмет в инвентаре
  // (hasItem) — оружие/посох/инструмент дописаны в инвентарь.
  G.addItem(c, 'iron_sword');
  G.addItem(c, 'short_bow');
  G.addItem(c, 'x_staff6');
  G.addItem(c, 'x_tool6');
  G.equip(c, 'x_head6');
  G.equip(c, 'x_torso6');
  G.equip(c, 'x_legs6');
  let st = G.equipmentStats(c);
  assert.equal(st.armor, 6,
    'armor — СУММА всех слотов 1+2+3 (краснота: только eq.armor — одно слагаемое)');
  assert.equal(st.damage, 0, 'нет оружия в right_hand — damage 0');
  assert.equal(st.subtype, null, 'нет оружия — subtype null');
  // Бонус качества надетого входит в сумму (000046; eb — raw-чтение).
  c.equipmentBonus = {};
  c.equipmentBonus.torso = { armor: 1 };
  st = G.equipmentStats(c);
  assert.equal(st.armor, 7, 'armor — сумма + бонус torso {armor:1} (000046)');
  // Урон — ТОЛЬКО из right_hand.
  G.equip(c, 'iron_sword');
  st = G.equipmentStats(c);
  assert.equal(st.damage, 5,
    'damage — из right_hand (краснота: читается eq.weapon)');
  assert.equal(st.subtype, 'sword');
  assert.equal(st.hitBonus, 0.05 * 6, 'sword — hitBonus = swordHitBonus');
  assert.equal(st.dmgBonus, 0, 'sword — без dmgBonus');
  G.equip(c, 'short_bow');
  st = G.equipmentStats(c);
  assert.equal(st.damage, 4, 'лук заменил меч (меч — в инвентаре)');
  assert.equal(st.hitBonus, 0.05 * 4, 'bow — hitBonus = archerHitBonus');
  assert.equal(st.dmgBonus, 0.05 * 2, 'bow — dmgBonus = rangedDamageBonus');
  G.equip(c, 'x_staff6');
  st = G.equipmentStats(c);
  assert.equal(st.damage, 7, 'staff — damage');
  assert.equal(st.subtype, 'staff');
  assert.equal(st.hitBonus, 0, 'staff — без hitBonus (карты бонусов нет)');
  assert.equal(st.dmgBonus, 0, 'staff — без dmgBonus');
  G.equip(c, 'x_tool6');
  st = G.equipmentStats(c);
  assert.equal(st.damage, 0,
    'tool БЕЗ stats.damage — damage 0 (гард; краснота: NaN/TypeError)');
  assert.equal(st.subtype, null, 'tool — subtype null');
  assert.ok(Number.isFinite(st.damage) && Number.isFinite(st.armor),
    'статы — числа, не NaN');
  // Ghost в слоте — вклад 0, без падения.
  G.unequip(c, 'right_hand');
  c.equipment.right_hand = 'ghost_00023002';
  assert.doesNotThrow(() => { st = G.equipmentStats(c); },
    'ghost id — без TypeError');
  assert.equal(st.damage, 0, 'ghost — вклад 0');
  assert.equal(st.subtype, null);
  // «Голый» персонаж (node) — дефолты интерфейса.
  const c0 = createCharacter();
  assert.deepEqual(I.equipmentStats(c0),
    { damage: 0, subtype: null, hitBonus: 0, dmgBonus: 0, armor: 0 },
    'голый персонаж — дефолты {0, null, 0, 0, 0}');
});

test('000230.02 M7 (node): backfill — старый сейв {weapon: iron_sword, armor: leather_armor} → right_hand/torso + зеркала; equipmentStats — бит-в-бит как в старой форме; legacy eb {weapon:{damage:2}} → right_hand → damage 7; ensureEquipment — защитный backfill', () => {
  const eq = I.sanitizeEquipment(
    { weapon: 'iron_sword', armor: 'leather_armor' });
  assert.equal(eq.right_hand, 'iron_sword',
    'weapon → right_hand (краснота: backfill нет — форма {weapon, armor})');
  assert.equal(eq.torso, 'leather_armor', 'armor → torso');
  assert.equal(eq.weapon, 'iron_sword', 'зеркало weapon ≡ right_hand');
  assert.equal(eq.armor, 'leather_armor', 'зеркало armor ≡ torso');
  const c = createCharacter();
  c.equipment = eq;
  const st = I.equipmentStats(c);
  assert.deepEqual(st,
    { damage: 5, subtype: 'sword', hitBonus: 0, dmgBonus: 0, armor: 2 },
    'equipmentStats — РОВНО значения старой 2-слотовой формы (пин ТЗ)');
  c.equipmentBonus = I.sanitizeEquipmentBonus({ weapon: { damage: 2 } });
  assert.deepEqual(c.equipmentBonus.right_hand, { damage: 2 },
    'legacy eb weapon → right_hand (краснота: backfill нет)');
  assert.equal(I.equipmentStats(c).damage, 7, 'damage — 5 + бонус 2 (000046)');
  const c2 = createCharacter();
  c2.equipment = { weapon: 'iron_sword' };
  I.ensureEquipment(c2);
  assert.equal(c2.equipment.right_hand, 'iron_sword',
    'ensureEquipment — legacy weapon → right_hand (защитный backfill)');
  assert.equal(c2.equipment.weapon, 'iron_sword', 'зеркало weapon');
});

test('000230.02 M8 (node): sanitize — битый/неизвестный слот → null, неизвестные ключи отброшены; legacy backfill weapon→right_hand / armor→torso; physical ПРЁТ над legacy; {weapon:null} → канон-пустота без падений', () => {
  const o1 = I.sanitizeEquipment({ right_hand: 'ghost_id_00023002' });
  assert.equal(o1.right_hand, null,
    'id вне каталога → null (краснота: ключа right_hand в форме нет)');
  const o2 = I.sanitizeEquipment({ head: 7 });
  assert.equal(o2.head, null, 'не-строка → null');
  const o3 = I.sanitizeEquipment({ head: 7, unknown_key: 'x', extra: 1 });
  assert.ok(!('unknown_key' in o3), 'неизвестный ключ — отброшен');
  assert.ok(!('extra' in o3), 'чужой ключ — отброшен');
  for (const junk of [null, 'junk', [1, 2], 42]) {
    assert.deepEqual(I.sanitizeEquipment(junk), emptyEquipment(),
      'не-объект → канон-пустота (краснота: форма {weapon, armor})');
  }
  assert.deepEqual(I.sanitizeEquipment(
    { weapon: 'ghost_item', armor: 7 }), emptyEquipment(),
    'legacy-бэкфилл не спасает призраков (каталог-чек)');
  const b1 = I.sanitizeEquipmentBonus({ right_hand: { damage: 2 } });
  assert.deepEqual(b1.right_hand, { damage: 2 },
    'right_hand — строго {damage} — сохраняется');
  const b2 = I.sanitizeEquipmentBonus({ right_hand: { armor: 1 } });
  assert.equal(b2.right_hand, null,
    'чужой стат для right_hand → null (старая семантика)');
  const b3 = I.sanitizeEquipmentBonus({ torso: { armor: 3 } });
  assert.deepEqual(b3.torso, { armor: 3 }, 'torso — строго {armor}');
  const b4 = I.sanitizeEquipmentBonus({ head: { armor: 2 } });
  assert.deepEqual(b4.head, { armor: 2 },
    'разрешительный слот: {armor} — сохраняется');
  const b5 = I.sanitizeEquipmentBonus({ head: { damage: 1 } });
  assert.deepEqual(b5.head, { damage: 1 },
    'разрешительный слот: {damage} — сохраняется (data loss запрещён)');
  const b6 = I.sanitizeEquipmentBonus({ extra: { damage: 1 } });
  assert.ok(!('extra' in b6), 'неизвестный ключ — отброшен');
  const b7 = I.sanitizeEquipmentBonus({ weapon: { damage: 2 } });
  assert.deepEqual(b7.right_hand, { damage: 2 },
    'legacy weapon → right_hand (backfill)');
  const b8 = I.sanitizeEquipmentBonus({ armor: { armor: 3 } });
  assert.deepEqual(b8.torso, { armor: 3 }, 'legacy armor → torso (backfill)');
  for (const junk of [{ weapon: null, armor: null }, {}, null, 'junk', [1]]) {
    assert.deepEqual(I.sanitizeEquipmentBonus(junk), emptyEquipmentBonus(),
      'пустой/битый legacy → канон-пустота БЕЗ падений');
  }
  const b9 = I.sanitizeEquipmentBonus(
    { right_hand: { damage: 1 }, weapon: { damage: 2 } });
  assert.deepEqual(b9.right_hand, { damage: 1 },
    'physical ПРЁТ над legacy (мешаный сейв)');
});

test('000230.02 M9 (vm): useItem/useQuickUnit — 4 новых kind (tool/shield/ring/artifact) → отказ «<имя> — экипируется»; weapon/armor — СТАРЫЕ сообщения бит-в-байт; предмет НЕ тратится, быстрый слот цел', () => {
  const fixtures = [
    { id: 'x_tool9', name: 'Тестовый инструмент', kind: 'tool',
      slot: 'right_hand', weight: 1, value: 20, desc: 'т' },
    { id: 'x_shield9', name: 'Тестовый щит', kind: 'shield',
      slot: 'left_hand', weight: 3, value: 50, desc: 'т' },
    { id: 'x_ring9', name: 'Тестовое кольцо', kind: 'ring',
      slot: 'ring', weight: 0.1, value: 30, desc: 'т' },
    { id: 'x_artifact9', name: 'Тестовый артефакт', kind: 'artifact',
      slot: 'left_hand', weight: 0.5, value: 100, desc: 'т' },
    I.getItem('iron_sword'),
    I.getItem('leather_armor'),
  ];
  const { sandbox } = makeVmSandboxWithConsole();
  loadItemsVmChain(sandbox);
  sandbox.Game.ITEMS = fixtures;
  loadInSandbox('items.js', sandbox);
  const G = sandbox.Game;
  const c = G.createCharacter();
  for (const id of ['x_tool9', 'x_shield9', 'x_ring9', 'x_artifact9',
      'iron_sword', 'leather_armor']) {
    G.addItem(c, id);
  }
  const r1 = G.useItem(c, 'x_tool9');
  assert.equal(r1.ok, false,
    'tool — отказ (краснота: old-код МОЛЧА тратит предмет)');
  assert.equal(r1.reason, 'Тестовый инструмент — экипируется',
    'сообщение — по ИМЕНИ предмета');
  assert.equal(G.useItem(c, 'x_shield9').reason, 'Тестовый щит — экипируется');
  assert.equal(G.useItem(c, 'x_ring9').reason, 'Тестовое кольцо — экипируется');
  assert.equal(G.useItem(c, 'x_artifact9').reason,
    'Тестовый артефакт — экипируется');
  const r5 = G.useItem(c, 'iron_sword');
  assert.equal(r5.ok, false);
  assert.equal(r5.reason, 'оружие — экипируется',
    'weapon — СТАРОЕ сообщение бит-в-байт');
  const r6 = G.useItem(c, 'leather_armor');
  assert.equal(r6.ok, false);
  assert.equal(r6.reason, 'броня — экипируется',
    'armor — СТАРОЕ сообщение бит-в-байт');
  for (const id of ['x_tool9', 'x_shield9', 'x_ring9', 'x_artifact9',
      'iron_sword', 'leather_armor']) {
    assert.equal(G.totalQty(c, id), 1, id + ' — предмет не тратится');
  }
  G.setQuick(c, 0, 'x_ring9');
  const q = G.useQuickItem(c, 0);
  assert.equal(q.ok, false, 'кольцо в быстром слоте — отказ');
  assert.equal(q.reason, 'Тестовое кольцо — экипируется');
  assert.equal(G.quickItem(c, 0), 'x_ring9',
    'быстрый слот цел (действие не сгорело)');
});

test('000230.02 M10 (node): канон-форма — sanitizeEquipment: ровно 20 ключей (18 физ. ПОРЯДКОМ EQUIP_PHYS_SLOTS + weapon/armor концом); ensureEquipment(fresh) — канон 20; ensureEquipmentBonus(fresh) — ровно 18 ключей, зеркал нет', () => {
  const eq = I.sanitizeEquipment(
    { weapon: 'iron_sword', armor: 'leather_armor' });
  assert.deepEqual(eq, {
    head: null, ears: null, neck: null, torso: 'leather_armor',
    forearms: null, right_hand: 'iron_sword', left_hand: null,
    palms: null, legs: null, feet: null,
    ring_left_1: null, ring_left_2: null, ring_left_3: null,
    ring_left_4: null, ring_right_1: null, ring_right_2: null,
    ring_right_3: null, ring_right_4: null,
    weapon: 'iron_sword', armor: 'leather_armor',
  }, 'канон: backfill + зеркала (краснота: форма {weapon, armor})');
  assert.deepEqual(Object.keys(eq),
    [...PHYS_SLOTS_00023002, 'weapon', 'armor'],
    'порядок ключей — 18 физ. + зеркала концом (детерминизм сейва, 000031)');
  const c = createCharacter();
  I.ensureEquipment(c);
  assert.deepEqual(c.equipment, emptyEquipment(),
    'ensureEquipment(fresh) — канон 20 ключей null');
  assert.deepEqual(Object.keys(c.equipment),
    [...PHYS_SLOTS_00023002, 'weapon', 'armor'], 'порядок ключей');
  const c2 = createCharacter();
  I.ensureEquipmentBonus(c2);
  assert.deepEqual(c2.equipmentBonus, emptyEquipmentBonus(),
    'ensureEquipmentBonus(fresh) — ровно 18 ключей, зеркал нет');
  assert.deepEqual(Object.keys(c2.equipmentBonus), PHYS_SLOTS_00023002,
    'порядок ключей — EQUIP_PHYS_SLOTS');
});

test('000230.02 M11 (vm, ре-пин 000230.20): equip с заменой тяжёлого на лёгкое при инвентаре у лимита веса — неудачный возврат prev: swap ОТКАТАН (все или ничего): {ok:false, reason} — словарь checkAdd (как unequip); prev НА МЕСТЕ в слоте, new в инвентаре; зеркала синхронны (D-01)', () => {
  const fixtures = [
    { id: 'x_ballast', name: 'Тестовый балласт', kind: 'food', weight: 4,
      value: 5, desc: 'т', effect: { kind: 'eat', amount: 1 } },
    I.getItem('war_hammer'),
    I.getItem('wood_sword'),
  ];
  const { sandbox } = makeVmSandboxWithConsole();
  loadItemsVmChain(sandbox);
  sandbox.Game.ITEMS = fixtures;
  loadInSandbox('items.js', sandbox);
  const G = sandbox.Game;
  const c = G.createCharacter();
  G.addItem(c, 'war_hammer');
  G.equip(c, 'war_hammer');
  for (let i = 0; i < 7; i++) G.addItem(c, 'x_ballast');
  G.addItem(c, 'wood_sword');
  assert.equal(G.inventoryWeight(c), 29, 'установка: 29/30 кг (war_hammer w4 надет)');
  const r = G.equip(c, 'wood_sword');
  assert.equal(r.ok, false,
    'все или ничего: возврат prev не прошёл — swap не совершён');
  assert.equal(r.reason, 'слишком тяжело (лимит веса)',
    'единый словарь checkAdd с unequip (28 + 4 = 32 > 30)');
  assert.equal(c.equipment.right_hand, 'war_hammer',
    'prev НА МЕСТЕ (краснота: prev перезаписан/потерян)');
  assert.equal(c.equipment.weapon, 'war_hammer',
    'зеркало D-01 синхронно на откате (syncEquipmentMirrors)');
  assert.equal(G.totalQty(c, 'wood_sword'), 1, 'new в инвентаре как был');
  assert.equal(G.totalQty(c, 'war_hammer'), 0,
    'prev не продублирован — единственный экземпляр в слоте');
});

// =====================================================================
// 000235.05. Тир свитков = уровень заклинания (ТЗ tasks/pending/
// 000235.05.md п.1: data-only, append-only; контракт —
// memory/000235.05-scroll-tier-loot.md).
//
// TDD-красное: поле `tier` у 8 свитков 000043–000050 ещё не проставлено
// (ITEM_TIER = it.tier || 1, dungeon.js:55-57 — все свитки tier 1);
// поле tier уже в schema.json (000157.01) — правки схемы не нужно.
// Зеркало src/items-data.js ре-генерируется (npm run sync:items) —
// существующий пин «зеркало ≡ JSON» (S1. 000133) остаётся несущим.
// =====================================================================

test('000235.05 I1: 8 свитков — tier = уровень соответствующего заклинания (JSON + зеркало + schema)', () => {
  const TIER_TABLE = {
    '000043.json': { id: 'fireball_scroll', tier: 2 },
    '000044.json': { id: 'flame_burst_scroll', tier: 3 },
    '000045.json': { id: 'frost_bolt_scroll', tier: 1 },
    '000046.json': { id: 'blizzard_scroll', tier: 3 },
    '000047.json': { id: 'chill_scroll', tier: 1 },
    '000048.json': { id: 'light_heal_scroll', tier: 2 },
    '000049.json': { id: 'magic_shield_scroll', tier: 1 },
    '000050.json': { id: 'vine_scroll', tier: 1 },
  };
  const schema = JSON.parse(
    fs.readFileSync(path.join(ITEMS_DIR, 'schema.json'), 'utf8'));
  for (const e of SCROLLS_000133) {
    const t = TIER_TABLE[e.file];
    const j = JSON.parse(
      fs.readFileSync(path.join(ITEMS_DIR, e.file), 'utf8'));
    // (a) JSON: tier проставлен = уровень заклинания (таблица ТЗ).
    assert.equal(j.tier, t.tier, e.file + ': tier = ' + t.tier
      + ' (краснота: tier нет — ' + JSON.stringify(j.tier) + ')');
    assert.ok(j.tier >= 1 && j.tier <= 4,
      e.file + ': tier в домене 1..4');
    // (b) tier = уровень заклинания из каталога spells (авто-связь,
    //     D8: ранг-гейт canLearn рангом школы).
    const spell = SPELLS.SPELLS_BY_ID[e.spell];
    assert.ok(spell, e.file + ': заклинание «' + e.spell + '» в каталоге');
    assert.equal(j.tier, spell['уровень'],
      e.file + ': tier (' + j.tier + ') = уровень «' + e.spell + '» ('
      + spell['уровень'] + ')');
    // (c) Зеркало items-data.js — то же значение.
    const it = I.getItem(e.id);
    assert.ok(it, e.file + ': зеркало items-data.js — «' + e.id + '»');
    assert.equal(it.tier, t.tier,
      e.file + ': зеркало tier = ' + t.tier + ' (краснота: ' + it.tier + ')');
    // (d) Валиден по schema.json (поле tier — уже в схеме, 000157.01).
    const errors = [];
    validateSchema165(schema, j, e.file, errors);
    assert.deepEqual(errors, [], e.file + ': schema.json — '
      + JSON.stringify(errors));
  }
});

// --- Задача 000230.03: equipmentAffixes — агрегат affixes надетых
// предметов (красные тесты TDD) ---
//
// Контракт — memory/000230.03-affixes-derived-free-cast.md §2.1:
//   * ЧИСТАЯ функция: НЕ вызывает ensureEquipment (side effects нет —
//     поле equipment НЕ создаётся);
//   * итерация ТОЛЬКО EQUIP_PHYS_SLOTS (18 физ. слотов; зеркальные
//     ключи weapon/armor — алиасы из 000230.02 — НЕ итерировать,
//     иначе двойной подсчёт);
//   * возврат {skills: {<id>: сумма amount}, freeCast: Set(<spell id>)};
//     пустая/отсутствующая экипировка → {skills: {}, freeCast: ∅};
//   * guards: id falsy → skip; getItem null (ghost) → skip;
//     affixes не массив → skip; amount не число → skip.
// RED: items.js НЕ ЭКСПОРТИРУЕТ equipmentAffixes → вызов в тесте
// бросает TypeError «not a function» (осмысленная краснота по
// прецеденту 000132/000193: падение в assert-вызове, НЕ load-ошибка).
// Фикстуры — ТОЛЬКО в vm (каталог items.js — Map, строится при
// загрузке; E9-пин 76/0-affixes жив — в каталог НЕ попадают).

function affixFixtures00023003() {
  return [
    { id: 'x_ring', name: 'Тестовое кольцо', kind: 'ring', slot: 'ring',
      weight: 0.1, value: 30, desc: 'т',
      affixes: [
        { type: 'skill', skill: 'swordsman', amount: 0.05 },
        { type: 'free_cast', spell: 'spark' },
      ] },
    { id: 'x_ring2', name: 'Тестовое кольцо 2', kind: 'ring', slot: 'ring',
      weight: 0.1, value: 30, desc: 'т',
      affixes: [{ type: 'skill', skill: 'swordsman', amount: 0.10 }] },
    { id: 'x_ring_two', name: 'Тестовое кольцо 3', kind: 'ring',
      slot: 'ring', weight: 0.1, value: 30, desc: 'т',
      affixes: [
        { type: 'skill', skill: 'endurance', amount: 0.10 },
        { type: 'skill', skill: 'endurance', amount: 0.25 },
      ] },
    { id: 'x_head', name: 'Тестовый шлем', kind: 'armor',
      stats: { armor: 1 }, slot: 'head', weight: 2, value: 20, desc: 'т',
      affixes: [{ type: 'skill', skill: 'endurance', amount: 0.10 }] },
    { id: 'x_art', name: 'Тестовый артефакт', kind: 'artifact',
      slot: 'left_hand', weight: 0.5, value: 100, desc: 'т',
      affixes: [{ type: 'free_cast', spell: 'mend' }] },
  ];
}

test('000230.03-A1 (vm): equipmentAffixes — сумма по слотам: x_ring (ring_left_1) + x_head (head) + x_art (left_hand) → skills {swordsman: 0.05, endurance: 0.10}, freeCast {spark, mend}', () => {
  const { sandbox } = makeVmSandboxWithConsole();
  loadItemsVmChain(sandbox);
  sandbox.Game.ITEMS = affixFixtures00023003();
  loadInSandbox('items.js', sandbox);
  const G = sandbox.Game;
  const c = G.createCharacter();
  for (const id of ['x_ring', 'x_head', 'x_art']) {
    G.addItem(c, id);
    const r = G.equip(c, id);
    assert.equal(r.ok, true, id + ': экипирование (' + (r.reason || '') + ')');
  }
  assert.equal(c.equipment.ring_left_1, 'x_ring', 'кольцо — ring_left_1');
  assert.equal(c.equipment.head, 'x_head', 'шлем — head');
  assert.equal(c.equipment.left_hand, 'x_art', 'артефакт — left_hand');
  const a = G.equipmentAffixes(c);
  assert.deepEqual(fromVm(a.skills), { swordsman: 0.05, endurance: 0.10 },
    'skills — сумма по слотам (краснота: equipmentAffixes не экспортирован)');
  assert.equal(a.freeCast.size, 2, 'freeCast — Set из 2 заклинаний');
  assert.ok(a.freeCast.has('spark'), 'free_cast кольца (spark)');
  assert.ok(a.freeCast.has('mend'), 'free_cast артефакта (mend)');
});

test('000230.03-A2 (vm): пустая экипировка → {skills: {}, freeCast: ∅}; ЧИСТАЯ — поле equipment НЕ создаётся (ensureEquipment не вызывается)', () => {
  const { sandbox } = makeVmSandboxWithConsole();
  loadItemsVmChain(sandbox);
  sandbox.Game.ITEMS = affixFixtures00023003();
  loadInSandbox('items.js', sandbox);
  const G = sandbox.Game;
  const c = G.createCharacter();
  assert.equal('equipment' in c, false, 'свежий персонаж — без поля equipment');
  const a = G.equipmentAffixes(c);
  assert.deepEqual(fromVm(a.skills), {},
    'skills — пустой объект (краснота: equipmentAffixes не экспортирован)');
  assert.equal(a.freeCast.size, 0, 'freeCast — пустой Set');
  assert.equal('equipment' in c, false,
    'чистая функция: поле equipment НЕ появилось (краснота: '
    + 'ensureEquipment лениво создаёт его)');
  const eq = {};
  for (const s of G.EQUIP_PHYS_SLOTS) eq[s] = null;
  c.equipment = eq;
  const a2 = G.equipmentAffixes(c);
  assert.deepEqual(fromVm(a2.skills), {}, 'канон-пустота (18 null) — пусто');
  assert.equal(a2.freeCast.size, 0, 'канон-пустота — freeCast пуст');
});

test('000230.03-A3 (vm): несколько affixes на ОДИН навык — суммируются: x_ring (+0.05) + x_ring2 (+0.10) в РАЗНЫХ слотах → swordsman 0.15; ДВЕ записи одного skill в affixes ОДНОГО предмета → сумма', () => {
  const { sandbox } = makeVmSandboxWithConsole();
  loadItemsVmChain(sandbox);
  sandbox.Game.ITEMS = affixFixtures00023003();
  loadInSandbox('items.js', sandbox);
  const G = sandbox.Game;
  const c = G.createCharacter();
  for (const id of ['x_ring', 'x_ring2']) {
    G.addItem(c, id);
    assert.equal(G.equip(c, id).ok, true, id + ': экипирование');
  }
  assert.equal(c.equipment.ring_left_1, 'x_ring');
  assert.equal(c.equipment.ring_left_2, 'x_ring2', 'кольца — РАЗНЫЕ слоты');
  const a = G.equipmentAffixes(c);
  assert.ok(Math.abs(a.skills.swordsman - 0.15) < 1e-12,
    '0.05 + 0.10 = 0.15 (краснота: equipmentAffixes не экспортирован; '
    + 'факт: ' + a.skills.swordsman);
  const c2 = G.createCharacter();
  G.addItem(c2, 'x_ring_two');
  assert.equal(G.equip(c2, 'x_ring_two').ok, true);
  const a2 = G.equipmentAffixes(c2);
  assert.ok(Math.abs(a2.skills.endurance - 0.35) < 1e-12,
    'один предмет, 2 записи endurance: 0.10 + 0.25 = 0.35');
  assert.equal(a2.freeCast.size, 0, 'free_cast у x_ring_two нет');
});

// --- Задача 000230.04: наборы экипировки — set-бонусы за 2/3/4+ предмета
// (красные тесты TDD) ---
//
// Контракт — memory/000230.04-set-bonuses.md §2:
//   * schema.json — ОПЦИОНАЛЬНОЕ свойство set_bonus КОНЦОМ properties
//     (ПОСЛЕ affixes): объект с ключами {2|3|4} (anyOf-непустота),
//     значение — oneOf [массив affixes (форма ДОСЛОВНО properties.affixes),
//     стат-объект {damage?: 1..100, armor?: 0..100} (anyOf-непустота)];
//     additionalProperties false на обоих уровнях; ключи "2"/"3"/"4" —
//     пороги ⊆ {2,3,4} на уровне схемы. Минивалидатор (000015) без $ref
//     → EFFECT инлайнится ×3.
//   * validateItem: equipment-only-гард += set_bonus (сообщение —
//     хвост «— только у экипируемых», E18-regex жив); set_bonus без set
//     → throw «set_bonus — только с set»; validateSetBonus: не объект →
//     throw, пустой → throw, порог ∉ {2,3,4} → throw, значение —
//     affix-массив (ядро validateAffixEntry, label set_bonus.N[i]) или
//     стат-объект {armor finite ≥ 0, damage finite ≥ 1} (пустой/лишний
//     ключ/не число → throw).
//   * activeSets(c) — НОВЫЙ чистый агрегатор → {counts: {<set>: n},
//     skills: {<id>: Σ amount}, freeCast: Set(<spell>), armor: n,
//     damage: n}; raw c.equipment (БЕЗ ensureEquipment), ТОЛЬКО
//     EQUIP_PHYS_SLOTS (зеркала weapon/armor не итерировать), кольцо =
//     1 предмет, ghost-id → skip, пороги [2,3,4] независимы и кумулятивны;
//     данные набора — representative per-порог (первый надетый по
//     порядку слотов с set_bonus[t] — анти-×count переучёт); runtime —
//     без throw (defensive skip).
//   * ЕДИНЫЙ пайплайн: equipmentAffixes (форма возврата {skills,
//     freeCast} НЕ меняется) сливает set-skill/free_cast;
//     equipmentStats (интерфейс {damage, subtype, hitBonus, dmgBonus,
//     armor} НЕ меняется): armor += set-armor БЕЗУСЛОВНО, damage +=
//     set-damage ТОЛЬКО в оружейной ветке (D-02 гейт: без оружия — не
//     «фантомное оружие»).
//   * sync-items-data.js: KEYS += 'set_bonus' КОНЦОМ (канон-порядок
//     pos(set) < pos(affixes) < pos(set_bonus)); .04 без контента →
//     зеркало items-data.js byte-identical, предметов с set_bonus — 0.
// RED: set_bonus в схеме нет (SB1, SB11); activeSets в items.js не
// экспортирован (SB2/SB3/SB5/SB15 — TypeError «not a function» в
// assert-контексте, НЕ load-ошибка); set-бонусы отсутствуют в
// equipmentStats (SB4 — deepEqual); веток валидации нет
// (SB6/SB7/SB8/SB14 — Missing expected exception); KEYS sync без
// set_bonus (SB12 — «ключи вне схемы» → exit 1).
// Фикстуры — ТОЛЬКО в vm (каталог items.js — Map, строится при
// загрузке; E9-пин 76/0-set жив — в каталог НЕ попадают). Set в vm —
// Set vm-реальма: .size/.has напрямую, НЕ fromVm (JSON-ранд-трип убил
// бы Set; паттерн A1/A2).

function setFixtures00023004() {
  const xguardBonus = {
    2: [{ type: 'skill', skill: 'endurance', amount: 0.05 }],
    3: { armor: 2 },
    4: [{ type: 'free_cast', spell: 'mend' }],
  };
  const xstatBonus = {
    2: { armor: 2 },
    3: { armor: 1, damage: 1 },
  };
  return [
    { id: 'xg_head', name: 'Тестовый шлем (xguard)', kind: 'armor',
      stats: { armor: 1 }, slot: 'head', set: 'xguard',
      set_bonus: xguardBonus, weight: 1, value: 20, desc: 'т' },
    { id: 'xg_ears', name: 'Тестовые серьги (xguard)', kind: 'armor',
      stats: { armor: 1 }, slot: 'ears', set: 'xguard',
      set_bonus: xguardBonus, weight: 1, value: 20, desc: 'т' },
    { id: 'xg_ring', name: 'Тестовое кольцо (xguard)', kind: 'ring',
      slot: 'ring', set: 'xguard', set_bonus: xguardBonus,
      weight: 0.1, value: 30, desc: 'т' },
    { id: 'xg_blade', name: 'Тестовый меч (xguard)', kind: 'weapon',
      subtype: 'sword', stats: { damage: 5 }, set: 'xguard',
      set_bonus: xguardBonus, weight: 4, value: 80, desc: 'т' },
    { id: 'xs_head', name: 'Тестовый шлем (xstat)', kind: 'armor',
      stats: { armor: 1 }, slot: 'head', set: 'xstat',
      set_bonus: xstatBonus, weight: 1, value: 20, desc: 'т' },
    { id: 'xs_torso', name: 'Тестовая кираса (xstat)', kind: 'armor',
      stats: { armor: 1 }, slot: 'torso', set: 'xstat',
      set_bonus: xstatBonus, weight: 2, value: 20, desc: 'т' },
    { id: 'xs_blade', name: 'Тестовый меч (xstat)', kind: 'weapon',
      subtype: 'sword', stats: { damage: 5 }, set: 'xstat',
      set_bonus: xstatBonus, weight: 4, value: 80, desc: 'т' },
    { id: 'xb_neck', name: 'Тестовый амулет (xbane)', kind: 'armor',
      stats: { armor: 3 }, slot: 'neck', set: 'xbane',
      set_bonus: { 2: { armor: 9 } }, weight: 1, value: 30, desc: 'т' },
  ];
}

test('000230.04-SB1 (node): schema.json — set_bonus: точная под-схема КОНЦОМ properties (ПОСЛЕ affixes): {2|3|4: oneOf[массив affixes (≡ properties.affixes дословно), стат {damage? 1..100, armor? 0..100}]}, anyOf-непустота обоих уровней, additionalProperties false; НЕ в required (краснота: свойства set_bonus в схеме нет)', () => {
  const s = JSON.parse(
    fs.readFileSync(path.join(ITEMS_DIR, 'schema.json'), 'utf8'));
  const affixes = s.properties.affixes;
  const effect = {
    oneOf: [
      affixes,
      {
        type: 'object',
        anyOf: [{ required: ['armor'] }, { required: ['damage'] }],
        properties: {
          damage: { type: 'number', minimum: 1, maximum: 100 },
          armor: { type: 'number', minimum: 0, maximum: 100 },
        },
        additionalProperties: false,
      },
    ],
  };
  const expected = {
    type: 'object',
    anyOf: [{ required: ['2'] }, { required: ['3'] }, { required: ['4'] }],
    properties: { 2: effect, 3: effect, 4: effect },
    additionalProperties: false,
  };
  assert.deepEqual(s.properties.set_bonus, expected,
    'properties.set_bonus — точная под-схема (контракт §2.1; '
    + 'краснота: свойства set_bonus в схеме нет); факт: '
    + JSON.stringify(s.properties.set_bonus));
  const sb = s.properties.set_bonus;
  assert.deepEqual(sb.properties['2'].oneOf[0], affixes,
    'аффикс-вариант — properties.affixes дословно (та же форма)');
  assert.deepEqual(sb.properties['3'], sb.properties['2'],
    'порог 3 — тот же EFFECT, что 2 (инлайн ×3: $ref в минивалидаторе нет)');
  assert.deepEqual(sb.properties['4'], sb.properties['2'],
    'порог 4 — тот же EFFECT, что 2 (инлайн ×3)');
  assert.ok(!s.required.includes('set_bonus'),
    'set_bonus НЕ в required (старые предметы валидны без изменений); '
    + 'факт: ' + JSON.stringify(s.required));
  assert.equal(s.additionalProperties, false,
    'верхний additionalProperties остаётся false (закрытая схема)');
  assert.equal(Object.keys(s.properties).indexOf('set_bonus'),
    Object.keys(s.properties).length - 1,
    'set_bonus — КОНЦОМ properties (ПОСЛЕ affixes — контракт .01 §4; '
    + 'связка с порядком KEYS sync, SB12)');
});

test('000230.04-SB2 (vm, ПИН ТЗ 2/2+3/2+3+4): xguard — 2 надето (xg_head + xg_ring — кольцо = 1 предмет) → активен порог 2: skills {endurance: 0.05}; 3 (+xg_ears) → +порог 3: armor 2 (skills БЕЗ изменения — порог 3 стат); 4 (+xg_blade) → +порог 4: freeCast {mend}, counts {xguard: 4} — пороги независимы, кумулятивны; set-skill/free_cast — в equipmentAffixes (единый пайплайн)', () => {
  const { sandbox } = makeVmSandboxWithConsole();
  loadItemsVmChain(sandbox);
  sandbox.Game.ITEMS = setFixtures00023004();
  loadInSandbox('items.js', sandbox);
  const G = sandbox.Game;
  const c = G.createCharacter();
  for (const id of ['xg_head', 'xg_ring']) {
    G.addItem(c, id);
    assert.equal(G.equip(c, id).ok, true, id + ': экипирование');
  }
  assert.equal(c.equipment.head, 'xg_head');
  assert.equal(c.equipment.ring_left_1, 'xg_ring',
    'кольцо — ring_left_1 (1 предмет набора)');
  let st = G.activeSets(c);
  assert.deepEqual(fromVm(st.counts), { xguard: 2 },
    'counts — 2 предмета набора (краснота: activeSets не экспортирован)');
  assert.deepEqual(fromVm(st.skills), { endurance: 0.05 },
    'порог 2 — skill-affix (краснота: set-бонусов в агрегате нет)');
  assert.equal(st.freeCast.size, 0, 'порог 4 не активен — freeCast пуст');
  assert.equal(st.armor, 0, 'порог 3 не активен — armor 0');
  assert.equal(st.damage, 0, 'урона в наборе нет — 0');
  let a = G.equipmentAffixes(c);
  assert.deepEqual(fromVm(a.skills), { endurance: 0.05 },
    'единый пайплайн: set-skill в equipmentAffixes');
  assert.equal(a.freeCast.size, 0, 'freeCast — пуст (2 предмета)');
  G.addItem(c, 'xg_ears');
  assert.equal(G.equip(c, 'xg_ears').ok, true, 'xg_ears: экипирование');
  st = G.activeSets(c);
  assert.deepEqual(fromVm(st.counts), { xguard: 3 });
  assert.equal(st.armor, 2, 'порог 3 АКТИВЕН: armor 2 (кумуляция 2+3)');
  assert.deepEqual(fromVm(st.skills), { endurance: 0.05 },
    'порог 3 — стат: skills БЕЗ изменения (каждый порог независимо)');
  assert.equal(st.freeCast.size, 0, 'порог 4 не активен (3 < 4)');
  G.addItem(c, 'xg_blade');
  assert.equal(G.equip(c, 'xg_blade').ok, true, 'xg_blade: экипирование');
  st = G.activeSets(c);
  assert.deepEqual(fromVm(st.counts), { xguard: 4 });
  assert.equal(st.armor, 2, 'armor — кумулятивны (порог 3: 2)');
  assert.ok(st.freeCast.has('mend'),
    'порог 4 АКТИВЕН: free_cast mend (2+3+4 — каждый независимо)');
  assert.deepEqual(fromVm(st.skills), { endurance: 0.05 });
  assert.equal(st.damage, 0);
  a = G.equipmentAffixes(c);
  assert.deepEqual(fromVm(a.skills), { endurance: 0.05 });
  assert.ok(a.freeCast.has('mend'),
    'единый пайплайн: set-free_cast в equipmentAffixes (4 предмета)');
});

test('000230.04-SB3 (vm, ТЗ «не смешиваются»): xg_head + xg_ears (xguard 2) + xb_neck (xbane 1) — наборы не смешиваются: counts {xguard: 2, xbane: 1}; активен ТОЛЬКО порог xguard.2: skills {endurance: 0.05}, armor 0 (xguard.3 не активен: 2 < 3; xbane.2 не активен: 1 < 2 — 3 предмета ВЕСЬМО не суммируются в чужой/свой порог); equipmentStats armor = 1+1+3 = 5', () => {
  const { sandbox } = makeVmSandboxWithConsole();
  loadItemsVmChain(sandbox);
  sandbox.Game.ITEMS = setFixtures00023004();
  loadInSandbox('items.js', sandbox);
  const G = sandbox.Game;
  const c = G.createCharacter();
  for (const id of ['xg_head', 'xg_ears', 'xb_neck']) {
    G.addItem(c, id);
    assert.equal(G.equip(c, id).ok, true, id + ': экипирование');
  }
  const st = G.activeSets(c);
  assert.deepEqual(fromVm(st.counts), { xguard: 2, xbane: 1 },
    'counts — каждый набор отдельно (краснота: activeSets не '
    + 'экспортирован)');
  assert.deepEqual(fromVm(st.skills), { endurance: 0.05 },
    'активен ТОЛЬКО порог xguard.2 (xbane.2 не активен: 1 < 2)');
  assert.equal(st.armor, 0,
    'xguard.3 не активен: 2 < 3 — 3 предмета не суммируются по наборам');
  assert.equal(st.damage, 0);
  assert.equal(st.freeCast.size, 0);
  const es = G.equipmentStats(c);
  assert.equal(es.armor, 5,
    'armor = 1 (xg_head) + 1 (xg_ears) + 3 (xb_neck) + 0 (set-бонусов '
    + 'активных нет) (краснота: set-бонусов нет в equipmentStats)');
  assert.equal(es.damage, 0, 'нет оружия — damage 0');
});

test('000230.04-SB4 (vm, стат-формат + D-02 гейт): xstat 2 (xs_head + xs_torso, БЕЗ оружия) → equipmentStats armor = 1+1+2 = 4, damage 0 (пин гейта: без оружия set-damage не входит); 3 (+xs_blade) → armor = 1+1+2+1 = 5, damage = 5+1 = 6 («в урон оружия»); интерфейс key-set deepEqual {damage, subtype, hitBonus, dmgBonus, armor} (M6)', () => {
  const { sandbox } = makeVmSandboxWithConsole();
  loadItemsVmChain(sandbox);
  sandbox.Game.ITEMS = setFixtures00023004();
  loadInSandbox('items.js', sandbox);
  const G = sandbox.Game;
  const c = G.createCharacter();
  for (const id of ['xs_head', 'xs_torso']) {
    G.addItem(c, id);
    assert.equal(G.equip(c, id).ok, true, id + ': экипирование');
  }
  let es = G.equipmentStats(c);
  assert.equal(es.armor, 4,
    'armor = 1 + 1 (слоты) + 2 (порог 2) (краснота: set-бонусов нет — '
    + 'факт ' + es.armor + ')');
  assert.equal(es.damage, 0,
    'БЕЗ оружия — set-damage НЕ входит (D-02 гейт; факт ' + es.damage + ')');
  G.addItem(c, 'xs_blade');
  assert.equal(G.equip(c, 'xs_blade').ok, true, 'xs_blade: экипирование');
  es = G.equipmentStats(c);
  assert.equal(es.armor, 5,
    'armor = 1 + 1 + 2 (порог 2) + 1 (порог 3) (краснота: факт '
    + es.armor + ')');
  assert.equal(es.damage, 6,
    'damage = 5 (оружие) + 1 (порог 3 «в урон оружия»); факт '
    + es.damage);
  assert.equal(es.subtype, 'sword');
  assert.deepEqual(Object.keys(es),
    ['damage', 'subtype', 'hitBonus', 'dmgBonus', 'armor'],
    'интерфейс equipmentStats НЕ меняется (M6-пин)');
  const st = G.activeSets(c);
  assert.deepEqual(fromVm(st.skills), {}, 'стат-формат — skills пуст');
  assert.equal(st.freeCast.size, 0, 'free_cast в наборе нет');
  assert.equal(st.armor, 3, 'set-armor: 2 (порог 2) + 1 (порог 3)');
  assert.equal(st.damage, 1, 'set-damage: 1 (порог 3)');
});

test('000230.04-SB5 (vm, ТЗ «без экипировки — бонусов нет» + ЧИСТАЯ): свежий персонаж → activeSets {counts: {}, skills: {}, freeCast ∅, armor: 0, damage: 0}; поле equipment НЕ создаётся (A2-паттерн: в c его нет ДО и ПОСЛЕ); equipmentAffixes пуст; канон-пустота (18 null) → то же', () => {
  const { sandbox } = makeVmSandboxWithConsole();
  loadItemsVmChain(sandbox);
  sandbox.Game.ITEMS = setFixtures00023004();
  loadInSandbox('items.js', sandbox);
  const G = sandbox.Game;
  const c = G.createCharacter();
  assert.equal('equipment' in c, false,
    'свежий персонаж — без поля equipment');
  const st = G.activeSets(c);
  assert.deepEqual(fromVm(st.counts), {},
    'counts — пусто (краснота: activeSets не экспортирован)');
  assert.deepEqual(fromVm(st.skills), {}, 'skills — пусто');
  assert.equal(st.freeCast.size, 0, 'freeCast — пустой Set');
  assert.equal(st.armor, 0, 'armor — 0');
  assert.equal(st.damage, 0, 'damage — 0');
  assert.equal('equipment' in c, false,
    'чистая функция: поле equipment НЕ появилось (ensureEquipment не '
    + 'вызывается)');
  const a = G.equipmentAffixes(c);
  assert.deepEqual(fromVm(a.skills), {}, 'equipmentAffixes — пусто');
  assert.equal(a.freeCast.size, 0);
  const eq = {};
  for (const s of G.EQUIP_PHYS_SLOTS) eq[s] = null;
  c.equipment = eq;
  const st2 = G.activeSets(c);
  assert.deepEqual(fromVm(st2.counts), {},
    'канон-пустота (18 null) — counts {}');
  assert.equal(st2.armor, 0, 'канон-пустота — armor 0');
  assert.equal(st2.damage, 0, 'канон-пустота — damage 0');
});

test('000230.04-SB6 (vm, ТЗ throw): armor с set_bonus БЕЗ set → Error при загрузке /set_bonus.*set/ (краснота: ветки «set_bonus — только с set» нет — Missing expected exception)', () => {
  const { sandbox } = makeVmSandboxWithConsole();
  loadItemsVmChain(sandbox);
  sandbox.Game.ITEMS = [{ id: 'x_noset', name: 'Тестовая броня',
    kind: 'armor', stats: { armor: 1 }, slot: 'head',
    set_bonus: { 2: { armor: 1 } }, weight: 1, value: 20, desc: 'т' }];
  assert.throws(
    () => loadInSandbox('items.js', sandbox),
    /set_bonus.*set/,
    'load-time-валидация бросает на set_bonus без set (краснота: '
    + 'Missing expected exception)');
});

test('000230.04-SB7 (vm, ТЗ throw): пороги set_bonus вне {2,3,4}: {1:{armor:1}}, {5:{armor:1}}, {2:{armor:1},7:{armor:1}} → Error при загрузке /порог|{2,3,4}/ (краснота: проверки порогов нет — Missing expected exception)', () => {
  for (const bonus of [
    { 1: { armor: 1 } },
    { 5: { armor: 1 } },
    { 2: { armor: 1 }, 7: { armor: 1 } },
  ]) {
    const { sandbox } = makeVmSandboxWithConsole();
    loadItemsVmChain(sandbox);
    sandbox.Game.ITEMS = [{ id: 'x_bad', name: 'Тестовая броня',
      kind: 'armor', stats: { armor: 1 }, slot: 'head', set: 'xset',
      set_bonus: bonus, weight: 1, value: 20, desc: 'т' }];
    assert.throws(
      () => loadInSandbox('items.js', sandbox),
      /порог|\{2,3,4\}/,
      'load-time-валидация бросает на пороги '
      + JSON.stringify(Object.keys(bonus)) + ' (краснота: Missing '
      + 'expected exception)');
  }
});

test('000230.04-SB8 (vm, throw, форма): значения set_bonus вне разрешённых форм → Error при загрузке: affix-массив с type «bogus» / amount «5» (не число) / пустой []; стат-объект с лишним ключом {hp:3} / armor «2» (не число) / пустой {} (краснота: веток validateSetBonus нет — Missing expected exception)', () => {
  // vm-реалм: брошенный Error — ЧУЖОЙ прототип (instanceof host Error
  // false) → предикат-regex на сообщение, house-паттерн (SB6/SB7/E18).
  for (const [bonus, re] of [
    [{ 2: [{ type: 'bogus' }] }, /\.type — skill\|free_cast/],
    [{ 2: [{ type: 'skill', skill: 'swordsman', amount: '5' }] },
     /\.amount — число/],
    [{ 2: [] }, /непустой массив/],
    [{ 2: { hp: 3 } }, /только armor\|damage/],
    [{ 2: { armor: '2' } }, /\.armor — число >= 0/],
    [{ 2: {} }, /объект \{armor\?, damage\?\}/],
  ]) {
    const { sandbox } = makeVmSandboxWithConsole();
    loadItemsVmChain(sandbox);
    sandbox.Game.ITEMS = [{ id: 'x_bad', name: 'Тестовая броня',
      kind: 'armor', stats: { armor: 1 }, slot: 'head', set: 'xset',
      set_bonus: bonus, weight: 1, value: 20, desc: 'т' }];
    assert.throws(
      () => loadInSandbox('items.js', sandbox),
      re,
      'load-time-валидация бросает на set_bonus ' + JSON.stringify(bonus)
      + ' (краснота: Missing expected exception)');
  }
});

test('000230.04-SB9 (ГАРД, vm, E19-паттерн): armor со ВСЕМИ валидными полями включая set_bonus (смешанный: 2 — affix-массив, 3 — стат, 4 — affix-массив) → загрузка БЕЗ броска, 0 console.error, поля сохранены deepEqual (гард от избыточной валидации; зелёный с начала)', () => {
  const { sandbox, errors } = makeVmSandboxWithConsole();
  loadItemsVmChain(sandbox);
  const it = { id: 'x_guard', name: 'Тестовая броня', kind: 'armor',
    stats: { armor: 3 }, weight: 6, value: 60, desc: 'т',
    slot: 'torso', rarity: 'epic', set: 'xguard9',
    affixes: [
      { type: 'skill', skill: 'swordsman', amount: 0.05 },
      { type: 'free_cast', spell: 'fireball' },
    ],
    set_bonus: {
      2: [{ type: 'skill', skill: 'swordsman', amount: 0.05 }],
      3: { armor: 2 },
      4: [{ type: 'free_cast', spell: 'mend' }],
    } };
  sandbox.Game.ITEMS = [it];
  assert.doesNotThrow(() => loadInSandbox('items.js', sandbox),
    'валидный armor со ВСЕМИ полями включая set_bonus — без броска');
  assert.deepEqual(fromVm(sandbox.Game.getItem('x_guard')), it,
    'поля сохранены (валидация не мутирует/не отбрасывает)');
  assert.equal(errors.length, 0,
    'console.error на валидном каталоге нет; факт: '
    + JSON.stringify(errors));
});

test('000230.04-SB10 (бит-в-бит, vm, ТЗ-инвариант): БЕЗ set_bonus — .03-фикстуры инвариантны: equipmentAffixes skills {swordsman: 0.05, endurance: 0.10}, freeCast {spark, mend}; x_head → equipmentStats armor 1, damage 0; activeSets (если экспортирован) → counts {} — в .03-фикстурах нет set (зелёный с начала)', () => {
  const { sandbox } = makeVmSandboxWithConsole();
  loadItemsVmChain(sandbox);
  sandbox.Game.ITEMS = affixFixtures00023003();
  loadInSandbox('items.js', sandbox);
  const G = sandbox.Game;
  const c = G.createCharacter();
  for (const id of ['x_ring', 'x_head', 'x_art']) {
    G.addItem(c, id);
    assert.equal(G.equip(c, id).ok, true, id + ': экипирование');
  }
  const a = G.equipmentAffixes(c);
  assert.deepEqual(fromVm(a.skills), { swordsman: 0.05, endurance: 0.10 },
    'affixes без set_bonus — бит-в-бит (пин A1)');
  assert.equal(a.freeCast.size, 2);
  assert.ok(a.freeCast.has('spark'));
  assert.ok(a.freeCast.has('mend'));
  const c2 = G.createCharacter();
  G.addItem(c2, 'x_head');
  assert.equal(G.equip(c2, 'x_head').ok, true, 'x_head: экипирование');
  const es = G.equipmentStats(c2);
  assert.equal(es.armor, 1, 'armor — x_head только (1)');
  assert.equal(es.damage, 0, 'нет оружия — damage 0');
  if (typeof G.activeSets === 'function') {
    const st = G.activeSets(c);
    assert.deepEqual(fromVm(st.counts), {},
      'без set_bonus — counts {} (бит-в-бит: в .03-фикстурах нет set)');
    assert.deepEqual(fromVm(st.skills), {}, 'skills — {}');
    assert.equal(st.freeCast.size, 0, 'freeCast — ∅');
    assert.equal(st.armor, 0, 'armor — 0');
    assert.equal(st.damage, 0, 'damage — 0');
  }
});

test('000230.04-SB11 (node, минивалидатор): validateData(schema.properties.set_bonus, v) — валидно → 0 ошибок: affix-массив; {armor:2}; {armor:2,damage:3}; смешанный {2:affix,3:стат}; {4:free_cast}. Невалидно → ошибки: {5:{armor:1}}; {armor:1} верхнего уровня; {}; {2:[]}; {2:{hp:1}}; {2:{armor:-1}}; {2:{damage:0}}; {2:5} (краснота: под-схемы нет — undefined)', () => {
  const s = JSON.parse(
    fs.readFileSync(path.join(ITEMS_DIR, 'schema.json'), 'utf8'));
  const sb = s.properties.set_bonus;
  assert.ok(sb && typeof sb === 'object' && !Array.isArray(sb),
    'в схеме есть свойства set_bonus (краснота: под-схемы нет — '
    + 'undefined; факт: ' + JSON.stringify(sb) + ')');
  const AFF = [{ type: 'skill', skill: 'swordsman', amount: 0.05 }];
  const ok = [
    { 2: AFF },
    { 2: { armor: 2 } },
    { 2: { armor: 2, damage: 3 } },
    { 2: AFF, 3: { armor: 1 } },
    { 4: [{ type: 'free_cast', spell: 'mend' }] },
  ];
  for (const v of ok) {
    const errs = validateData(sb, v, 'set_bonus');
    assert.deepEqual(errs, [],
      'валидно: ' + JSON.stringify(v) + ' → 0 ошибок; факт: '
      + JSON.stringify(errs));
  }
  const bad = [
    { 5: { armor: 1 } },
    { armor: 1 },
    {},
    { 2: [] },
    { 2: { hp: 1 } },
    { 2: { armor: -1 } },
    { 2: { damage: 0 } },
    { 2: 5 },
  ];
  for (const v of bad) {
    const errs = validateData(sb, v, 'set_bonus');
    assert.ok(errs.length > 0,
      'невалидно: ' + JSON.stringify(v) + ' → ошибки; факт: 0 ошибок');
  }
});

test('000230.04-SB12 (node, sync, E20-паттерн tmp-репо): ring с set + set_bonus (смешанные формы) → exit 0; зеркало содержит set_bonus; канон-порядок pos(set) < pos(affixes) < pos(set_bonus) (set_bonus КОНЦОМ — связка E1b/SB1); повторный запуск byte-identical (краснота: KEYS без set_bonus → «ключи вне схемы» → exit 1)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-items-00023004-'));
  try {
    fs.mkdirSync(path.join(dir, 'scripts', 'lib'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'assets', 'items'), { recursive: true });
    fs.copyFileSync(
      path.join(__dirname, '..', 'scripts', 'sync-items-data.js'),
      path.join(dir, 'scripts', 'sync-items-data.js'));
    fs.copyFileSync(
      path.join(__dirname, '..', 'scripts', 'lib', 'write-atomic.js'),
      path.join(dir, 'scripts', 'lib', 'write-atomic.js'));
    fs.copyFileSync(
      path.join(__dirname, '..', 'scripts', 'lib', 'json-ref.js'),
      path.join(dir, 'scripts', 'lib', 'json-ref.js'));
    fs.writeFileSync(path.join(dir, 'assets', 'items', '000001.json'),
      JSON.stringify({
        id: 'x_ring', name: 'Тестовое кольцо', kind: 'ring',
        weight: 0.1, value: 30, desc: 'т',
        icon: 'assets/sprites/items/x_ring.svg',
        slot: 'ring', rarity: 'rare', set: 'guardian',
        affixes: [{ type: 'skill', skill: 'swordsman', amount: 0.05 }],
        set_bonus: {
          2: [{ type: 'skill', skill: 'swordsman', amount: 0.05 }],
          3: { armor: 2 },
          4: [{ type: 'free_cast', spell: 'mend' }],
        },
      }, null, 2) + '\n', 'utf8');
    const run = () => spawnSync(process.execPath,
      [path.join(dir, 'scripts', 'sync-items-data.js')],
      { cwd: dir, encoding: 'utf8' });
    const mirrorFile = path.join(dir, 'src', 'items-data.js');
    const res = run();
    assert.equal(res.status, 0,
      'sync — exit 0 (краснота: KEYS без set_bonus — «ключи вне '
      + 'схемы: set_bonus» → exit 1); факт: ' + (res.stderr || res.stdout));
    const mirror = fs.readFileSync(mirrorFile, 'utf8');
    for (const f of ['set', 'affixes', 'set_bonus']) {
      assert.ok(mirror.includes(f + ': '),
        f + ' — в зеркале (ключа нет в KEYS — не выводится)');
    }
    const pos = (k) => mirror.indexOf(k + ':');
    assert.ok(pos('set') !== -1 && pos('set') < pos('affixes')
      && pos('affixes') < pos('set_bonus'),
      'канон-порядок set < affixes < set_bonus (set_bonus КОНЦОМ — '
      + 'связка с порядком properties schema.json, E1b/SB1); факт: '
      + JSON.stringify({
        set: pos('set'), affixes: pos('affixes'),
        set_bonus: pos('set_bonus'),
      }));
    const once = fs.readFileSync(mirrorFile);
    const res2 = run();
    assert.equal(res2.status, 0,
      'повторный запуск — exit 0; факт: ' + (res2.stderr || res2.stdout));
    assert.deepEqual(fs.readFileSync(mirrorFile), once,
      'повторный запуск — byte-identical (идемпотентность)');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('000230.04-SB13 (ГАРД, E22-паттерн, node, I.allItems()): предметы с ОДНИМ set → set_bonus deepEqual внутри набора (ре-пин 000230.08: 25 head — 4 предмета с set: straw_hat/fur_hat [traveller], silver_helm/gold_helm [mystic]; ре-пин 000230.09: +5 — faith ×3 + stage ×2; ре-пин 000230.10: +5 — penitent ×3 + hearth ×2; ре-пин 000230.11: +4 — nimble ×2 + blade_guard ×2); предметов с set_bonus — РОВНО 18 (ре-пин 000230.08: реальный кросс-пин; ре-пин 000230.09: 4 + 5; ре-пин 000230.10: +5; ре-пин 000230.11: +4)', () => {
  const bySet = new Map();
  let withSetBonus = 0;
  for (const it of I.allItems()) {
    if (it.set !== undefined) {
      if (bySet.has(it.set)) {
        assert.deepEqual(it.set_bonus, bySet.get(it.set).set_bonus,
          it.id + ': набор «' + it.set + '» — ОДИНАКОВЫЙ set_bonus '
          + 'во всех файлах (representative D-03)');
      } else {
        bySet.set(it.set, it);
      }
    }
    if (it.set_bonus !== undefined) withSetBonus++;
  }
  assert.equal(withSetBonus, 18,
    'предметов с set_bonus — 18 (ре-пин 000230.08: straw_hat/fur_hat '
    + '[traveller] + silver_helm/gold_helm [mystic]; ре-пин 000230.09: '
    + '+faith ×3 +stage ×2; ре-пин 000230.10: +penitent ×3 +hearth ×2; '
    + 'ре-пин 000230.11: +nimble ×2 +blade_guard ×2)');
});

test('000230.04-SB14 (vm, throw, E18-паттерн): reagent с set_bonus → Error /только у экипируемых/ при загрузке (equipment-only-гард покрывает set_bonus; краснота: гард без set_bonus — Missing expected exception)', () => {
  const { sandbox } = makeVmSandboxWithConsole();
  loadItemsVmChain(sandbox);
  sandbox.Game.ITEMS = [{ id: 'x_test', name: 'Тестовый реагент',
    kind: 'reagent', weight: 0.1, value: 1, desc: 'т',
    set_bonus: { 2: { armor: 1 } } }];
  assert.throws(
    () => loadInSandbox('items.js', sandbox),
    /только у экипируемых/,
    'load-time-валидация бросает на reagent с set_bonus (краснота: '
    + 'Missing expected exception)');
});

test('000230.04-SB15 (vm, generic — ТЗ п.4): merc-лист — set-бонусы через тот же агрегат для ЛЮБОГО объекта с .equipment (фундамент .06, 0 кода .04): raw-подвеска sheet.equipment (xguard 2: head + ring_left_1) → G.equipmentAffixes(mercSheet).skills ≡ {endurance: 0.05} И G.activeSets(mercSheet).counts ≡ {xguard: 2}; G.Sheet.derived(mercSheet) — (1+0.05) в endurance-вкладе maxHP (25·1.63 = 40.75 → 41; без set-экипировки — 25·1.6 = 40)', () => {
  const { sandbox } = makeVmSandboxWithConsole();
  loadItemsVmChain(sandbox);
  sandbox.Game.ITEMS = setFixtures00023004();
  loadInSandbox('items.js', sandbox);
  const G = sandbox.Game;
  const merc = G.Sheet.createSheet('merc');
  merc.secondary.endurance = 20;
  merc.equipment = { head: 'xg_head', ring_left_1: 'xg_ring' };
  const a = G.equipmentAffixes(merc);
  assert.deepEqual(fromVm(a.skills), { endurance: 0.05 },
    'тот же агрегат для ЛЮБОГО объекта с .equipment (краснота: '
    + 'set-бонусы отсутствуют в equipmentAffixes; факт: '
    + JSON.stringify(fromVm(a.skills)));
  const st = G.activeSets(merc);
  assert.deepEqual(fromVm(st.counts), { xguard: 2 },
    'activeSets на merc-листе (краснота: не экспортирован)');
  const d = G.Sheet.derived(merc);
  assert.equal(d.maxHP, 41,
    'maxHP = round(25 · (1 + 0.03·20·1.05 + 0)) = round(40.75) = 41 '
    + '(краснота: set-бонусы не доходят до derived — факт '
    + d.maxHP + ')');
  const merc0 = G.Sheet.createSheet('merc');
  merc0.secondary.endurance = 20;
  assert.equal(G.Sheet.derived(merc0).maxHP, 40,
    'контроль: без set-экипировки — base (25 · 1.6 = 40)');
});
// =====================================================================
// Задача 000230.06 — Экипировка наёмников: «персонаж» = композит
// (live-лист наёмника + инвентарь героя — общий, 000194).
// Контракты: memory/000230.06-ally-equipment.md §2.1/§6 (I1).
// items.js НЕ меняется — работает общий I.equip/I.unequip по
// live-ссылкам (паттерн 000194).
// КРАСНЫЙ: I1 — C.allyEquip/C.allyUnequip ещё не экспортированы
// (TypeError: не функция).
// Зелёный механический пин: общий equip/unequip на композите
// с pre-init {}/{} (000194) — уже работает на текущем коде.
// =====================================================================

const C = require('../src/companions.js');

// Живой лист наёмника (10 ключей; секции equipment* ДО init — нет).
const mercSheet00023006 = () => ({
  kind: 'merc', level: 1, xp: 0, totalXp: 0, points: 0,
  primary: { strength: 1, dexterity: 1, constitution: 1,
    intelligence: 1, wisdom: 1, charisma: 1 },
  secondary: {}, skillXp: {}, spells: [], npcId: 'merc_volk',
});

test('000230.06 I1: «персонаж» — наёмник (композит): предмет уходит из ОБЩЕГО инвентаря в live-лист наёмника; unequip — возвращает', () => {
  const hero = createCharacter();
  I.addItem(hero, 'iron_sword');
  const sheet = mercSheet00023006();
  assert.equal('equipment' in sheet, false, 'до — секции нет');
  const r1 = C.allyEquip(hero, sheet, 'iron_sword');
  assert.deepEqual(r1, { ok: true, slot: 'right_hand', item: 'iron_sword' },
    'RED: C.allyEquip — не функция на текущем коде');
  assert.equal(I.totalQty(hero, 'iron_sword'), 0,
    'предмет покинул общий инвентарь героя (000194)');
  assert.equal(sheet.equipment.right_hand, 'iron_sword',
    'live-лист наёмника записан (не одноразовый композит)');
  assert.equal(sheet.equipment.weapon, 'iron_sword', 'зеркало weapon');
  const r2 = C.allyUnequip(hero, sheet, 'right_hand');
  assert.deepEqual(r2, { ok: true, item: 'iron_sword' });
  assert.equal(I.totalQty(hero, 'iron_sword'), 1,
    'предмет вернулся в общий инвентарь героя');
  assert.equal(sheet.equipment.right_hand, null, 'слот пуст');
});

test('000230.06 (зелёный пин): общий equip/unequip работает на композите с pre-init {}/{} (000194) — items.js не меняется', () => {
  const hero = createCharacter();
  I.addItem(hero, 'iron_sword');
  const eq = {};
  const eb = {};
  const view = {
    inventory: hero.inventory, // владелец веса (000194)
    primary: hero.primary,
    secondary: hero.secondary,
    equipment: eq,        // live-ссылки (pre-init {})
    equipmentBonus: eb,
  };
  assert.equal(I.equip(view, 'iron_sword').ok, true);
  assert.equal(I.totalQty(hero, 'iron_sword'), 0);
  assert.equal(eq.right_hand, 'iron_sword', 'live-объект записан');
  assert.equal(eq.weapon, 'iron_sword', 'зеркало синхронизировано');
  assert.equal(I.unequip(view, 'right_hand').ok, true);
  assert.equal(I.totalQty(hero, 'iron_sword'), 1);
  assert.equal(eq.right_hand, null);
});

// =====================================================================
// known-issue 000230.06 → 000230.18 (ревью 2026-10-20, F1/major):
// вес-гейт возврата предмета в ОБЩИЙ инвентарь героя (checkAdd →
// maxCarryWeight) считается от derived КОМПОЗИТА (primary/secondary
// героя + equipment НАЁМНИКА — affixSkillsFor читает c.equipment),
// а не от фактического maxCarryWeight ГЕРОЯ (hero.equipment в гейт
// не участвует). СЕГОДНЯ влияние НОЛЬ (каталог: 0 affix-предметов,
// E9) — гейт идентичен геройскому; достижимо с волн .08–.15.
// ПИН ЗАКРЕПЛЯЕТ ТЕКУЩЕЕ (гибридное) поведение: когда 000230.18
// починит гейт (лимит = maxCarryWeight самого героя), тест падёт —
// принудительный осознанный пере-пин (схема ре-пинов репо).
// Воспроизведение: vm-фикстуры, 'back'-affix кольцо +50%,
// герой secondary.back = 2 (база 30 кг, +10%/уровень): фактический
// лимит героя = 30·(1+0.2·1.5) = 39, гейт композита (у наёмника
// affix'ов нет) = 30·(1+0.2) = 36.
// Контракты: memory/000230.06-ally-equipment.md §7/§10,
// tasks/pending/000230.18.md.
// =====================================================================

const VM_ALLY_WEIGHT_CHAIN = ['global-settings.js', 'perlin.js',
  'mapseed.js', 'skills-data.js', 'items-data.js', 'npc-data.js',
  'map.js', 'sheet.js', 'player.js', 'day.js'];

test('000230.18 (known-issue пин): вес-гейт allyUnequip — от derived композита (экипировка НАЁМНИКА), не от фактического лимита героя (до 000230.18)', () => {
  const { sandbox } = makeVmSandboxWithConsole();
  sandbox.Game = {};
  for (const f of VM_ALLY_WEIGHT_CHAIN) loadInSandbox(f, sandbox);
  sandbox.Game.ITEMS = [
    { id: 'x_ring_back', name: 'Кольцо спины', kind: 'ring',
      slot: 'ring', weight: 0.1, value: 30, desc: 'т',
      affixes: [{ type: 'skill', skill: 'back', amount: 0.5 }] },
    { id: 'x_sword', name: 'Меч', kind: 'weapon', subtype: 'sword',
      stats: { damage: 5 }, weight: 1, value: 50, desc: 'т' },
    { id: 'x_big', name: 'Тяжёлый реагент', kind: 'reagent',
      weight: 37, value: 1, desc: 'т' },
  ];
  for (const f of ['items.js', 'buildings.js', 'npc.js',
    'companions.js']) {
    loadInSandbox(f, sandbox);
  }
  const G = sandbox.Game;
  const Co = G.companions;
  const hero = G.createCharacter();
  hero.secondary.back = 2;
  // 'back'-affix на СОБСТВЕННОЙ экипировке героя:
  G.addItem(hero, 'x_ring_back');
  assert.equal(G.equip(hero, 'x_ring_back').ok, true);
  assert.equal(G.maxCarryWeight(hero), 39,
    'фактический лимит героя = 30·(1+0.2·1.5)');
  // Композит — форма allyView (memory 000230.06 §2.1):
  const merc = G.Sheet.createSheet('merc', { npcId: 'merc_volk' });
  const view = {
    inventory: hero.inventory,
    primary: hero.primary,
    secondary: hero.secondary,
    equipment: merc.equipment,
    equipmentBonus: merc.equipmentBonus,
  };
  assert.equal(G.maxCarryWeight(view), 36,
    'ГЕЙТ (known-issue): от экипировки НАЁМНИКА (affix'
    + 'ов нет) — 36, а не фактические 39 героя; до 000230.18');
  // e2e: предмет влезает по фактическому лимиту героя, но
  // НЕ возвращается с наёмника:
  G.addItem(hero, 'x_big');   // 37 ≤ 39
  G.addItem(hero, 'x_sword'); // 38 ≤ 39
  assert.equal(G.inventoryWeight(hero), 38, 'инвентарь легален (≤ 39)');
  assert.equal(Co.allyEquip(hero, merc, 'x_sword').ok, true);
  assert.equal(G.inventoryWeight(hero), 37);
  const r = Co.allyUnequip(hero, merc, 'right_hand');
  assert.deepEqual(fromVm(r),
    { ok: false, reason: 'слишком тяжело (лимит веса)' },
    'known-issue: 38 ≤ 39 (факт. лимит героя), но гейт = 36 — '
    + 'ложный отказ; до 000230.18');
  assert.equal(G.canAddItem(hero, 'x_sword').ok, true,
    'собственная проверка героя — предмет влезает (38 ≤ 39)');
  assert.equal(merc.equipment.right_hand, 'x_sword',
    'предмет ОСТАЁТСЯ надетым (failsafe) — застрял; до 000230.18');
});

test('000230.03.01-EM (vm): зеркальные ключи weapon/armor в equipmentAffixes (питфол двойного подсчёта): оружие со skill-affix в right_hand → точная сумма = вклад ОДНОГО слота (зеркальный ключ weapon НЕ итерируется — 0.2, не 0.4)', () => {
  const { sandbox } = makeVmSandboxWithConsole();
  loadItemsVmChain(sandbox);
  sandbox.Game.ITEMS = [
    { id: 'x_sword_fc', name: 'Тестовый меч', kind: 'weapon',
      subtype: 'sword', slot: 'right_hand', stats: { damage: 4 },
      weight: 2, value: 50, desc: 'т',
      affixes: [{ type: 'skill', skill: 'swordsman', amount: 0.2 }] },
  ];
  loadInSandbox('items.js', sandbox);
  const G = sandbox.Game;
  const c = G.createCharacter();
  G.addItem(c, 'x_sword_fc');
  assert.equal(G.equip(c, 'x_sword_fc').ok, true, 'меч экипируется');
  assert.equal(c.equipment.right_hand, 'x_sword_fc', 'физ. слот — right_hand');
  assert.equal(c.equipment.weapon, 'x_sword_fc',
    'зеркало — синхронно (syncEquipmentMirrors, precondition зеркала)');
  const a = G.equipmentAffixes(c);
  assert.equal(a.skills.swordsman, 0.2,
    'один физ. слот: (0||0)+0.2 = 0.2 точно (equipmentAffixes итерирует '
    + 'ТОЛЬКО EQUIP_PHYS_SLOTS — зеркальный ключ weapon не итерируется; '
    + 'ловушка — 0.4, двойной подсчёт)');
  assert.equal(a.freeCast.size, 0, 'free_cast у меча нет');
});

test('000230.03.01-GU (vm): guards equipmentAffixes на невалидные данные: slot с ghost-id → пустой результат без throw; предмет с affixes: \'x\' и affix {skill, amount: \'y\'} → пропускаются (тихий skip, без console.error)', () => {
  const { sandbox, errors } = makeVmSandboxWithConsole();
  loadItemsVmChain(sandbox);
  const ring = { id: 'x_ring_g', name: 'Тестовое кольцо', kind: 'ring',
    slot: 'ring', weight: 0.1, value: 30, desc: 'т',
    affixes: [{ type: 'skill', skill: 'swordsman', amount: 0.1 }] };
  sandbox.Game.ITEMS = [ring];
  loadInSandbox('items.js', sandbox);
  const G = sandbox.Game;
  const c = G.createCharacter();
  c.equipment = { ring_left_1: 'ghost_item' }; // свежий персонаж без
  // поля equipment — ручное присваивание (прецедент D4); прототип —
  // vm-песочница, node-каталог не трогается.
  let a;
  assert.doesNotThrow(() => { a = G.equipmentAffixes(c); });
  assert.deepEqual(fromVm(a.skills), {}, 'ghost-id — skip: skills пуст');
  assert.equal(a.freeCast.size, 0, 'freeCast — пустой Set');
  assert.deepEqual(errors, [], 'guards — тихий skip, без console.error');
  // Мутация каталога ПОСЛЕ загрузки (catalog Map держит те же ссылки
  // фикстур; validateAffixes сработала при загрузке и не вызывается
  // повторно):
  c.equipment = { ring_left_1: 'x_ring_g' };
  ring.affixes = 'x';
  const a2 = G.equipmentAffixes(c);
  assert.deepEqual(fromVm(a2.skills), {},
    'affixes: \'x\' (не массив) — skip');
  assert.equal(a2.freeCast.size, 0, 'freeCast — пустой Set');
  ring.affixes = [{ type: 'skill', skill: 'swordsman', amount: 'y' }];
  const a3 = G.equipmentAffixes(c);
  assert.deepEqual(fromVm(a3.skills), {},
    'amount: \'y\' (не finite-число) — skip');
  assert.equal(a3.freeCast.size, 0, 'freeCast — пустой Set');
  assert.deepEqual(errors, [], 'мутации каталога — без console.error');
});

// --- Задача 000230.04.01: ретро-правка 000230.04 — защитные пины
// (src 0-diff — зелёные с начала; findings 4/5 ретро-20261021) ---
// Контракт: memory/000230.04.01-retro-spec-set-pins.md §2
// (ФИНАЛЬНОЕ слово). RE — representative per-порог: данные у ПЕРВОГО
// надетого с set_bonus[t] по порядку EQUIP_PHYS_SLOTS (its.find) —
// РАСХОДЯЩИЕСЯ таблицы в пределах одного набора (все существующие
// фикстуры setFixtures00023004 — одна таблица на набор, регрессия
// find→findLast/сумма была незаметна). NS — предмет с set БЕЗ
// set_bonus (схема-валидно: set_bonus не в required): подсчёт ДО
// проверки set_bonus, skip в representative-поиске, runtime-без-throw.

test('000230.04.01-RE (vm): representative per-порог — данные у ПЕРВОГО надетого с set_bonus[t] по порядку EQUIP_PHYS_SLOTS: РАСХОДЯЩИЕСЯ таблицы одного набора (head {2:{armor:2}}, ears {2:{armor:99}}) → counts {xrep:2}, st.armor = 2 ТОЧНО (не 99 — find ≠ findLast; не 101 — не сумма), es.armor = 4', () => {
  const { sandbox } = makeVmSandboxWithConsole();
  loadItemsVmChain(sandbox);
  sandbox.Game.ITEMS = [
    { id: 'xrep_head', name: 'Тестовый шлем (xrep)', kind: 'armor',
      stats: { armor: 1 }, slot: 'head', set: 'xrep',
      set_bonus: { 2: { armor: 2 } }, weight: 1, value: 20, desc: 'т' },
    { id: 'xrep_ears', name: 'Тестовые серьги (xrep)', kind: 'armor',
      stats: { armor: 1 }, slot: 'ears', set: 'xrep',
      set_bonus: { 2: { armor: 99 } }, weight: 1, value: 20, desc: 'т' },
  ];
  loadInSandbox('items.js', sandbox);
  const G = sandbox.Game;
  const c = G.createCharacter();
  for (const id of ['xrep_head', 'xrep_ears']) {
    G.addItem(c, id);
    assert.equal(G.equip(c, id).ok, true, id + ': экипирование');
  }
  const st = G.activeSets(c);
  assert.deepEqual(fromVm(st.counts), { xrep: 2 },
    'counts — 2 предмета набора (счёт по слотам: head + ears)');
  assert.equal(st.armor, 2,
    'representative per-порог — данные у ПЕРВОГО надетого с ' +
      'set_bonus[2] по порядку EQUIP_PHYS_SLOTS (head; its.find, ' +
      'items.js): 2 ТОЧНО — findLast → 99, сумма → 101, обе ' +
      'регрессии ловятся (2 ≠ 99 ≠ 101)');
  assert.equal(st.damage, 0, 'урона в наборе нет — 0');
  assert.deepEqual(fromVm(st.skills), {}, 'skills пуст');
  assert.equal(st.freeCast.size, 0, 'freeCast — пустой Set');
  const es = G.equipmentStats(c);
  assert.equal(es.armor, 4,
    'единый пайплайн equipmentStats → activeSets: 1 + 1 (статы) ' +
      '+ 2 (set-armor) = 4');
  assert.equal(es.damage, 0, 'оружия нет — damage 0 (D-02 гейт)');
});

test('000230.04.01-NS (vm): предмет с set БЕЗ set_bonus (схема-валидно: set_bonus НЕ в required) — подсчитан в counts (до проверки set_bonus), пропущен в representative-поиске, runtime-без-throw: набор 3 предметов, БЕЗ set_bonus — ПЕРВЫЙ по порядку слотов (head), set_bonus только у 2 (ears {3:{armor:3}}, neck {3:{armor:99}}) → counts {xnset:3}, порог 3 активен, st.armor = 3 ТОЧНО (representative — ears; findLast → 99), es.armor = 6', () => {
  const { sandbox } = makeVmSandboxWithConsole();
  loadItemsVmChain(sandbox);
  sandbox.Game.ITEMS = [
    { id: 'xnset_head', name: 'Тестовый шлем (xnset)', kind: 'armor',
      stats: { armor: 1 }, slot: 'head', set: 'xnset',
      weight: 1, value: 20, desc: 'т' },
    { id: 'xnset_ears', name: 'Тестовые серьги (xnset)', kind: 'armor',
      stats: { armor: 1 }, slot: 'ears', set: 'xnset',
      set_bonus: { 3: { armor: 3 } }, weight: 1, value: 20, desc: 'т' },
    { id: 'xnset_neck', name: 'Тестовый амулет (xnset)', kind: 'armor',
      stats: { armor: 1 }, slot: 'neck', set: 'xnset',
      set_bonus: { 3: { armor: 99 } }, weight: 1, value: 30, desc: 'т' },
  ];
  loadInSandbox('items.js', sandbox);
  const G = sandbox.Game;
  const c = G.createCharacter();
  for (const id of ['xnset_head', 'xnset_ears', 'xnset_neck']) {
    G.addItem(c, id);
    assert.equal(G.equip(c, id).ok, true, id + ': экипирование');
  }
  let st;
  assert.doesNotThrow(() => { st = G.activeSets(c); },
    'runtime-без-throw: предмет без set_bonus — defensive skip ' +
      '(наивный its[0] упёрся бы в undefined.set_bonus)');
  assert.deepEqual(fromVm(st.counts), { xnset: 3 },
    'подсчёт ДО проверки set_bonus (counts[it.set]++ по слотам): ' +
      'предмет без таблицы СЧИТАЕТСЯ (иначе n=2 — порог 3 не ' +
      'активен)');
  assert.equal(st.armor, 3,
    'порог 3 активен (n=3): representative — ПЕРВЫЙ с ключом «3» ' +
      'по порядку слотов = ears (head пропущен предикатом find; ' +
      'findLast → 99); порог 2 ничего не даёт (ключа «2» нет)');
  assert.equal(st.damage, 0, 'урона в наборе нет — 0');
  assert.deepEqual(fromVm(st.skills), {}, 'skills пуст');
  assert.equal(st.freeCast.size, 0, 'freeCast — пустой Set');
  const es = G.equipmentStats(c);
  assert.equal(es.armor, 6,
    'единый пайплайн: 1 + 1 + 1 (статы) + 3 (set-armor) = 6');
  assert.equal(es.damage, 0, 'оружия нет — damage 0 (D-02 гейт)');
});

// =====================================================================
// Задача 000230.08 — предметы «Голова»: 25 (10/7/5/2/1) + иконки +
// рецепты (контентная волна 1 серии 000230; P2).
// Контракт — memory/000230.08-head-items-wave.md §2/§3 (ростер §2.1,
// матрица affixes §2.2, наборы §2.3, рецепты §2.4, иконки §2.6).
// RED (TDD): в каталоге 0 предметов slot 'head' (grep — 0), svg волны
// в assets/sprites/items/ нет, зеркало items-data.js не регенерировано
// — тесты ниже падают по ОСМЫСЛЕННОЙ причине «данные волны не
// добавлены» (нет id/файлов), а не по синтаксису. Тесты читают
// РЕАЛЬНЫЙ каталог (JSON + зеркало), а не фикстуры (отличие от
// M/A/SB-пинов). Технические репины существующих тестов (счётчики
// 82→107, 39→64 и т.д.) — стадия ЗЕЛЁНАЯ: в красной фазе каталог не
// меняется и фон остаётся зелёным.
// =====================================================================

// Ростер §2.1 (id фиксирован; «файл — до ребейза»: 000083–000107).
// [id, name, rarity, stats.armor, weight, value, affixes, set (null — поле нет)]
const HEAD_ROSTER_00023008 = [
  ['straw_hat', 'Соломенная шляпа', 'common', 0, 0.2, 10,
   [{ type: 'skill', skill: 'perception', amount: 0.03 }], 'traveller'],
  ['wool_cap', 'Вязаная шапка', 'common', 1, 0.3, 12,
   [{ type: 'skill', skill: 'precog', amount: 0.04 }], null],
  ['leather_cap', 'Кожаная кепка', 'common', 1, 0.3, 15,
   [{ type: 'skill', skill: 'perception', amount: 0.05 }], null],
  ['fur_hat', 'Меховая шапка', 'common', 1, 0.4, 18,
   [{ type: 'skill', skill: 'precog', amount: 0.03 }], 'traveller'],
  ['cloth_band', 'Тканый обод', 'common', 0, 0.2, 10,
   [{ type: 'skill', skill: 'meditation', amount: 0.05 }], null],
  ['wanderer_cap', 'Капюшон странника', 'common', 0, 0.3, 14,
   [{ type: 'skill', skill: 'elder', amount: 0.05 }], null],
  ['hood_common', 'Простой капюшон', 'common', 1, 0.3, 16,
   [{ type: 'skill', skill: 'scholar', amount: 0.04 }], null],
  ['linen_cloth', 'Льняной платок', 'common', 0, 0.2, 12,
   [{ type: 'skill', skill: 'perception', amount: 0.04 }], null],
  ['felt_hat', 'Фетровая шляпа', 'common', 1, 0.4, 20,
   [{ type: 'skill', skill: 'precog', amount: 0.05 }], null],
  ['travel_cloth', 'Путевой платок', 'common', 0, 0.2, 25,
   [{ type: 'skill', skill: 'meditation', amount: 0.03 }], null],
  ['silver_band', 'Серебряный обруч', 'rare', 1, 0.3, 60,
   [{ type: 'skill', skill: 'perception', amount: 0.07 }], null],
  ['copper_band', 'Медный обод', 'rare', 1, 0.4, 45,
   [{ type: 'skill', skill: 'precog', amount: 0.06 }], null],
  ['obsidian_cloth', 'Обсидиановый платок-амулет', 'rare', 2, 0.4, 70,
   [{ type: 'skill', skill: 'elder', amount: 0.08 }], null],
  ['amethyst_band', 'Аметистовый обруч', 'rare', 2, 0.4, 80,
   [{ type: 'skill', skill: 'perception', amount: 0.09 }], null],
  ['quartz_cloth', 'Кварцевый платок-амулет', 'rare', 1, 0.3, 55,
   [{ type: 'skill', skill: 'precog', amount: 0.07 }], null],
  ['bone_band', 'Костяной обод', 'rare', 1, 0.5, 40,
   [{ type: 'skill', skill: 'meditation', amount: 0.05 }], null],
  ['mystic_cloth', 'Мистический платок', 'rare', 2, 0.4, 100,
   [{ type: 'skill', skill: 'scholar', amount: 0.10 }], null],
  ['silver_helm', 'Серебряный шлем', 'epic', 2, 0.5, 150,
   [{ type: 'skill', skill: 'perception', amount: 0.15 }], 'mystic'],
  ['gold_helm', 'Золотой шлем', 'epic', 3, 0.6, 200,
   [{ type: 'skill', skill: 'precog', amount: 0.18 }], 'mystic'],
  ['sapphire_helm', 'Сапфировый шлем', 'epic', 3, 0.6, 180,
   [{ type: 'skill', skill: 'meditation', amount: 0.12 },
    { type: 'free_cast', spell: 'mend' }], null],
  ['mithril_helm', 'Мифриловый шлем', 'epic', 3, 0.7, 350,
   [{ type: 'skill', skill: 'elder', amount: 0.20 }], null],
  ['emerald_helm', 'Изумрудный шлем', 'epic', 2, 0.5, 220,
   [{ type: 'skill', skill: 'scholar', amount: 0.14 },
    { type: 'free_cast', spell: 'light_heal' }], null],
  ['rune_hoop', 'Рунический обруч', 'legendary', 3, 0.6, 400,
   [{ type: 'skill', skill: 'perception', amount: 0.30 }], null],
  ['star_hoop', 'Звёздный обруч', 'legendary', 3, 0.8, 700,
   [{ type: 'skill', skill: 'precog', amount: 0.25 }], null],
  ['crown_flame', 'Корона Пламени', 'impossible', 3, 1.5, 1200,
   [{ type: 'skill', skill: 'perception', amount: 0.40 },
    { type: 'skill', skill: 'meditation', amount: 0.35 }], null],
];
const HEAD_IDS_00023008 = HEAD_ROSTER_00023008.map((r) => r[0]);

// Live-скан JSON-каталога (паттерн 000211.06 I1): файлы/по id/по
// файлу/файл-по-id — без чтения зеркала (зеркало проверяет H7).
function catalogScan00023008() {
  const files = fs.readdirSync(ITEMS_DIR)
    .filter((f) => /^\d{6}\.json$/.test(f)).sort();
  const byId = new Map();
  const byFile = new Map();
  const fileById = new Map();
  for (const f of files) {
    const j = JSON.parse(
      fs.readFileSync(path.join(ITEMS_DIR, f), 'utf8'));
    byId.set(j.id, j);
    byFile.set(f, j);
    fileById.set(j.id, f);
  }
  return { files, byId, byFile, fileById };
}

// Id заклинаний каталога assets/spells (локальный хелпер — как
// loadSpellIds в tests/craft.test.js; src-модуля заклинаний нет).
function spellIds00023008() {
  const dir = path.join(__dirname, '..', 'assets', 'spells');
  const ids = new Set();
  for (const f of fs.readdirSync(dir)) {
    if (!/^\d{6}\.json$/.test(f)) continue;
    ids.add(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).id);
  }
  return ids;
}

test('000230.08 H1: 25 head-предметов — блок append-файлов: все 25 slot-head предметов каталога — ПОСЛЕДОВАТЕЛЬНЫЕ файлы (base = первый из них, rebase-робастно БЕЗ хардкода номера; ре-пин 000235.07: после волны .07 head НЕ конец каталога — позиция определяется по slot), редкости блока РОВНО 10 common / 7 rare / 5 epic / 2 legendary / 1 impossible в каталожном порядке, все kind armor + slot head (краснота: slot head — 0 предметов)', () => {
  const { files, byFile } = catalogScan00023008();
  const headCount = [...byFile.values()].filter((it) => it.slot === 'head').length;
  assert.equal(headCount, 25,
    'slot head — ровно 25 предмета (краснота: волна не добавлена; '
    + 'факт: ' + headCount + ')');
  const headFiles = files.filter((f) => byFile.get(f).slot === 'head');
  const base = parseInt(headFiles[0], 10);
  const tierByPos = (i) => i < 10 ? 'common' : i < 17 ? 'rare'
    : i < 22 ? 'epic' : i < 24 ? 'legendary' : 'impossible';
  for (let i = 0; i < 25; i++) {
    const f = headFiles[i];
    assert.equal(f, String(base + i).padStart(6, '0') + '.json',
      'блок волны — 25 последовательных файлов (base ' + base
      + '); позиция ' + i + ': ' + f);
    const it = byFile.get(f);
    assert.equal(it.kind, 'armor', f + ': kind armor');
    assert.equal(it.slot, 'head',
      f + ': slot head (краснота: волна не добавлена; факт: '
      + it.slot + ')');
    assert.equal(it.rarity, tierByPos(i),
      f + ': rarity ' + tierByPos(i) + ' (каталожный порядок = порядок '
      + 'тиров 10/7/5/2/1); факт: ' + it.rarity);
  }
});

test('000230.08 H2: roster — все 25 построчно (id/name/kind/slot/rarity/stats.armor/weight/value/affixes/set, §2.1); desc — непустая строка; subtype/tier/effect/loot отсутствуют (паттерн 000008; rarity вместо tier — D3)', () => {
  const { byId } = catalogScan00023008();
  for (const [id, name, rarity, armor, weight, value, affixes, set]
      of HEAD_ROSTER_00023008) {
    const it = byId.get(id);
    assert.ok(it, 'предмет "' + id + '" в каталоге (краснота: волна '
      + 'не добавлена)');
    assert.equal(it.name, name, id + ': name');
    assert.equal(it.kind, 'armor', id + ': kind armor');
    assert.equal(it.slot, 'head', id + ': slot head');
    assert.equal(it.rarity, rarity, id + ': rarity ' + rarity);
    assert.deepEqual(it.stats, { armor },
      id + ': stats — ровно { armor: ' + armor + ' }');
    assert.equal(it.weight, weight, id + ': weight');
    assert.equal(it.value, value, id + ': value');
    assert.deepEqual(it.affixes, affixes, id + ': affixes (§2.1)');
    assert.equal(it.set, set === null ? undefined : set,
      id + ': set ' + (set === null ? 'отсутствует' : '«' + set + '»'));
    assert.equal(typeof it.desc, 'string', id + ': desc — строка');
    assert.ok(it.desc.length > 0, id + ': desc — непустая строка');
    assert.equal(it.subtype, undefined,
      id + ': subtype отсутствует (у armor не бывает)');
    assert.equal(it.tier, undefined,
      id + ': tier отсутствует (редкость — отдельное поле rarity, D3)');
    assert.equal(it.effect, undefined, id + ': effect отсутствует');
    assert.equal(it.loot, undefined,
      id + ': loot отсутствует (loot — только у reagent)');
  }
});

// Матрица §2.2: Σ skill-записей 26 = 8/7/5/3/3; free_cast — ровно 2.
const SKILL_MATRIX_00023008 = {
  perception: 8, precog: 7, meditation: 5, elder: 3, scholar: 3,
};
// Шкала силы affix по редкости (memory/000230-equipment-research.md §6).
const RARITY_AFFIX_SCALE_00023008 = {
  common: [0.02, 0.05], rare: [0.05, 0.10], epic: [0.10, 0.20],
  legendary: [0.20, 0.35], impossible: [0.35, Infinity],
};

test('000230.08 H3: матрица affixes — покрытие skills РОВНО 8/7/5/3/3 (perception/precog/meditation/elder/scholar), Σ 26 skill-записей + 2 free_cast = 28; amounts в шкале редкости (§2.2); free_cast — ровно 2 (mend + light_heal), у epic; skill/spell id в live-каталогах', () => {
  const { byId } = catalogScan00023008();
  const wave = HEAD_IDS_00023008.map((id) => {
    const it = byId.get(id);
    assert.ok(it, 'предмет "' + id + '" в каталоге (краснота: волна '
      + 'не добавлена)');
    return it;
  });
  const coverage = {};
  let skillRecords = 0;
  const freeCast = [];
  const spells = spellIds00023008();
  for (const it of wave) {
    assert.ok(Array.isArray(it.affixes) && it.affixes.length >= 1,
      it.id + ': affixes — непустой массив (у каждого предмета ≥1)');
    for (const a of it.affixes) {
      if (a.type === 'skill') {
        skillRecords += 1;
        assert.ok(SECONDARY_SKILLS[a.skill] !== undefined,
          it.id + ': skill «' + a.skill + '» — в live skill-каталоге');
        coverage[a.skill] = (coverage[a.skill] || 0) + 1;
        const [lo, hi] = RARITY_AFFIX_SCALE_00023008[it.rarity];
        assert.ok(a.amount >= lo && a.amount <= hi,
          it.id + ': amount ' + a.amount + ' в шкале редкости '
          + it.rarity + ' [' + lo + ', ' + hi + ']');
      } else if (a.type === 'free_cast') {
        freeCast.push({ id: it.id, rarity: it.rarity, spell: a.spell });
        assert.ok(spells.has(a.spell),
          it.id + ': spell «' + a.spell + '» — в assets/spells');
      } else {
        assert.fail(it.id + ': неизвестный type affix: ' + a.type);
      }
    }
  }
  assert.equal(skillRecords, 26,
    'Σ skill-записей — ровно 26 (матрица §2.2); факт: ' + skillRecords);
  assert.deepEqual(
    { perception: coverage.perception || 0, precog: coverage.precog || 0,
      meditation: coverage.meditation || 0, elder: coverage.elder || 0,
      scholar: coverage.scholar || 0 },
    SKILL_MATRIX_00023008,
    'покрытие навыков — ровно 8/7/5/3/3 (матрица §2.2); факт: '
    + JSON.stringify(coverage));
  assert.equal(freeCast.length, 2,
    'free_cast — ровно 2 (ТЗ: 1–2 шт. на волну, у epic+); факт: '
    + freeCast.length);
  assert.deepEqual(freeCast.map((f) => f.spell).sort(),
    ['light_heal', 'mend'],
    'free_cast — существующие заклинания mend + light_heal');
  for (const f of freeCast) {
    assert.equal(f.rarity, 'epic',
      f.id + ': free_cast — у epic (контракт ТЗ); факт: ' + f.rarity);
  }
});

// Наборы §2.3: 2 наборы × 2 предмета, оба DORMANT (1 слот head < порога 2).
const HEAD_SETS_00023008 = [
  { set: 'traveller', members: ['straw_hat', 'fur_hat'],
    bonus: { 2: { armor: 1 } } },
  { set: 'mystic', members: ['silver_helm', 'gold_helm'],
    bonus: { 2: [{ type: 'skill', skill: 'meditation', amount: 0.05 }] } },
];

test('000230.08 H4: наборы — РОВНО 2: traveller {straw_hat, fur_hat} / set_bonus {2: {armor: 1}} (stat-объект, D-02) и mystic {silver_helm, gold_helm} / {2: [{skill meditation 0.05}]} (affix-массив; НЕ damage); set_bonus ОДИНАКОВ в паре (D-03); пороги ⊆ {2,3,4}; другие 21 предмет — без set/set_bonus', () => {
  const { byId } = catalogScan00023008();
  for (const s of HEAD_SETS_00023008) {
    for (const id of s.members) {
      const it = byId.get(id);
      assert.ok(it, 'предмет "' + id + '" в каталоге (краснота: волна '
        + 'не добавлена)');
      assert.equal(it.set, s.set, id + ': set «' + s.set + '»');
      assert.deepEqual(it.set_bonus, s.bonus,
        id + ': set_bonus (контракт §2.3; OДИНАКОВОЕ значение для '
        + 'всех участников — D-03)');
    }
    for (const k of Object.keys(s.bonus)) {
      assert.ok(['2', '3', '4'].includes(k),
        s.set + ': порог «' + k + '» ⊆ {2,3,4}');
    }
  }
  const members = new Set(
    HEAD_SETS_00023008.flatMap((s) => s.members));
  for (const id of HEAD_IDS_00023008) {
    const it = byId.get(id);
    assert.ok(it, 'предмет "' + id + '" в каталоге');
    if (!members.has(id)) {
      assert.equal(it.set, undefined,
        id + ': set отсутствует (в волне только 2 набора)');
      assert.equal(it.set_bonus, undefined, id + ': set_bonus отсутствует');
    }
  }
});

test('000230.08 H5: иконки — у всех 25 icon = assets/sprites/items/<id>.svg, svg-файл существует; 25 svg уникальны по содержимому (НЕ копии, §2.6); 25 id различны (анти-коллизия)', () => {
  const { byId } = catalogScan00023008();
  const ROOT = path.join(__dirname, '..');
  const seen = new Map();
  for (const id of HEAD_IDS_00023008) {
    const it = byId.get(id);
    assert.ok(it, 'предмет "' + id + '" в каталоге (краснота: волна '
      + 'не добавлена)');
    assert.equal(it.icon, 'assets/sprites/items/' + id + '.svg',
      id + ': icon = assets/sprites/items/<id>.svg');
    const p = path.join(ROOT, it.icon);
    assert.ok(fs.existsSync(p),
      id + ': svg-файл существует (краснота: иконка не создана)');
    const raw = fs.readFileSync(p, 'utf8');
    for (const [other, otherRaw] of seen) {
      assert.notEqual(raw, otherRaw,
        id + ' и ' + other + ': иконки уникальны (НЕ копии)');
    }
    seen.set(id, raw);
  }
  assert.equal(new Set(HEAD_IDS_00023008).size, 25,
    '25 id различны (анти-коллизия в волне)');
});

// 17 канонических KEYS sync-items-data.js (связка E1b/E20 —
// порядок properties schema.json; канон-порядок, append-only).
const KEYS_SYNC_00023008 = ['id', 'name', 'kind', 'subtype', 'weight',
  'value', 'tier', 'desc', 'stats', 'effect', 'loot', 'icon', 'slot',
  'rarity', 'set', 'affixes', 'set_bonus'];

test('000230.08 H6: порядок ключей JSON — подмножество 17 канонических KEYS sync-items-data.js в канон-порядке (E1b-паттерн: нарушение = неидемпотентная sync-дифф, ловят пины E1b/E20)', () => {
  const { byId, fileById } = catalogScan00023008();
  for (const id of HEAD_IDS_00023008) {
    const it = byId.get(id);
    assert.ok(it, 'предмет "' + id + '" в каталоге (краснота: волна '
      + 'не добавлена)');
    const f = fileById.get(id);
    const keys = Object.keys(JSON.parse(
      fs.readFileSync(path.join(ITEMS_DIR, f), 'utf8')));
    assert.ok(keys.length > 0, f + ': файл не пуст');
    let prev = -1;
    for (const k of keys) {
      const i = KEYS_SYNC_00023008.indexOf(k);
      assert.ok(i !== -1,
        f + ': ключ «' + k + '» — в канонических KEYS (краснота: '
        + 'ключа нет в схеме sync)');
      assert.ok(i > prev,
        f + ': ключ «' + k + '» — канон-порядок (E1b-паттерн; '
        + 'нарушение ломает идемпотентность sync)');
      prev = i;
    }
  }
});

test('000230.08 H7: все 25 — валидны по schema.json (минивалидатор 000015) И зеркало items-data.js ≡ JSON (getItem deepEqual) — регенерация sync сработала', () => {
  const { fileById } = catalogScan00023008();
  const schema = JSON.parse(
    fs.readFileSync(path.join(ITEMS_DIR, 'schema.json'), 'utf8'));
  for (const id of HEAD_IDS_00023008) {
    const f = fileById.get(id);
    assert.ok(f, 'файл предмета "' + id + '" (краснота: волна не '
      + 'добавлена)');
    const j = JSON.parse(fs.readFileSync(path.join(ITEMS_DIR, f), 'utf8'));
    const errors = validateData(schema, j, f);
    assert.deepEqual(errors, [],
      f + ': валиден по schema.json; факт: ' + errors.join('; '));
    const it = I.getItem(id);
    assert.ok(it, 'зеркало items-data.js: ' + id + ' (краснота: '
      + 'записи нет — зеркало не регенерировано)');
    assert.deepEqual(it, j, f + ': зеркало ≡ JSON');
  }
});

test('000230.08 H8 (vm, e2e): РЕАЛЬНЫЕ head-предметы из live-каталога (не фикстуры) — equip в слот head (M2-паттерн); affixes доходят до derived при S=10 по всем 5 навыкам: magicResistMult 1.50→1.515 (straw_hat, perception 0.03), dodgeBonus 0.50→0.52 (wool_cap, precog 0.04), mpRegenMult 0.30→0.306 (travel_cloth, meditation 0.03), dialogueBonus 10→11 (wanderer_cap, elder 0.05, round(10.5)), xpMult 1.20→1.208 (hood_common, scholar 0.04); sapphire_helm — free_cast mend в equipmentAffixes; crown_flame — 2 affixes суммируются (magicResistMult 1.70, mpRegenMult 0.37); set-дормант: 1 член traveller (порог 2) — бонуса НЕТ', () => {
  const { sandbox } = makeVmSandboxWithConsole();
  loadItemsVmChain(sandbox);
  loadInSandbox('items.js', sandbox);
  const G = sandbox.Game;
  const near = (a, b, msg) => assert.ok(
    Math.abs(a - b) < 1e-9, msg + ' (факт: ' + a + ')');
  const makeHero = () => {
    const c = G.createCharacter();
    c.secondary.perception = 10;
    c.secondary.precog = 10;
    c.secondary.meditation = 10;
    c.secondary.elder = 10;
    c.secondary.scholar = 10;
    return c;
  };
  const equipHead = (c, id) => {
    const ra = G.addItem(c, id);
    assert.equal(ra.ok, true, id + ': выдача (' + (ra.reason || '')
      + ') — предмет есть в live-каталоге (краснота: неизвестный '
      + 'предмет — волна не добавлена)');
    const r = G.equip(c, id);
    assert.equal(r.ok, true, id + ': equip (' + (r.reason || '') + ')');
    assert.equal(c.equipment.head, id, id + ': предмет в слоте head');
  };
  {
    const c = makeHero();
    const d = G.derived(c);
    near(d.magicResistMult, 1.5, 'база magicResistMult (1 + 0.05·10)');
    near(d.dodgeBonus, 0.5, 'база dodgeBonus (0.05·10)');
    near(d.mpRegenMult, 0.3, 'база mpRegenMult (0.10 + 0.02·10)');
    assert.equal(d.dialogueBonus, 10, 'база dialogueBonus (round(1·10))');
    near(d.xpMult, 1.2, 'база xpMult (1 + 0.02·10)');
  }
  {
    const c = makeHero();
    equipHead(c, 'straw_hat');
    near(G.derived(c).magicResistMult, 1.515,
      'straw_hat: magicResistMult = 1 + 0.05·10·1.03');
    assert.equal(G.equipmentStats(c).armor, 0,
      'straw_hat: stats.armor 0 — equipmentStats.armor += 0');
  }
  {
    const c = makeHero();
    equipHead(c, 'wool_cap');
    near(G.derived(c).dodgeBonus, 0.52,
      'wool_cap: dodgeBonus = 0.05·10·1.04');
  }
  {
    const c = makeHero();
    equipHead(c, 'travel_cloth');
    near(G.derived(c).mpRegenMult, 0.306,
      'travel_cloth: mpRegenMult = 0.10 + 0.02·10·1.03');
  }
  {
    const c = makeHero();
    equipHead(c, 'wanderer_cap');
    assert.equal(G.derived(c).dialogueBonus, 11,
      'wanderer_cap: dialogueBonus = round(10·1.05) = 11');
  }
  {
    const c = makeHero();
    equipHead(c, 'hood_common');
    near(G.derived(c).xpMult, 1.208,
      'hood_common: xpMult = 1 + 0.02·10·1.04');
  }
  {
    const c = makeHero();
    equipHead(c, 'sapphire_helm');
    const a = G.equipmentAffixes(c);
    assert.ok(a.freeCast.has('mend'),
      'sapphire_helm: free_cast mend в equipmentAffixes.freeCast');
  }
  {
    const c = makeHero();
    equipHead(c, 'crown_flame');
    const d = G.derived(c);
    near(d.magicResistMult, 1.7,
      'crown_flame: magicResistMult = 1 + 0.05·10·1.40 (perception 0.40)');
    near(d.mpRegenMult, 0.37,
      'crown_flame: mpRegenMult = 0.10 + 0.02·10·1.35 (meditation 0.35)');
  }
  {
    const c = makeHero();
    equipHead(c, 'straw_hat');
    const st = G.activeSets(c);
    assert.deepEqual(fromVm(st.counts), { traveller: 1 },
      'traveller — 1 надетый предмет');
    assert.equal(st.armor, 0, 'set-бонус НЕ активен (порог 2 > 1)');
    assert.deepEqual(fromVm(st.skills), {}, 'set-skill-бонусов нет');
    assert.equal(st.freeCast.size, 0, 'set-free_cast-бонусов нет');
    assert.equal(G.equipmentStats(c).armor, 0,
      'equipmentStats.armor — без set-бонуса (дормантность)');
  }
});

// =====================================================================
// Задача 000230.06.01 — ретро-правки 000230.06: пины allyDataForEntry
// с экипировкой (ТЗ п.2) и known-issue swap с неудачным возвратом
// (ТЗ п.3 → баг-задача 000230.20). Контракты:
// memory/000230.06.01-dismiss-equipment-return.md (§2.5, §2.6);
// ТЗ: tasks/pending/000230.06.01.md.
// Зелёные с первого запуска (код 000230.06 уже смержен): A1, I2.
// Фикстуры A1 — только в vm-подстановке Game.ITEMS (E9-пин реального
// каталога цел). I2 — БЕЗ подстановки: реальный каталог из цепочки.
// =====================================================================

test('000230.06.01 A1 (зелёный, vm, ТЗ п.2): allyDataForEntry С экипировкой — freeCast с кольца «mend», armor 1, maxHP не изменился, skill-affix heavy — через pipeline (строго >), set-damage в es.damage (8 = 5 оружия + 3 set)', () => {
  const { sandbox } = makeVmSandboxWithConsole();
  sandbox.Game = {};
  for (const f of VM_ALLY_WEIGHT_CHAIN) loadInSandbox(f, sandbox);
  sandbox.Game.ITEMS = [
    { id: 'x_t_blade', name: 'Тестовый меч (xt)', kind: 'weapon',
      subtype: 'sword', stats: { damage: 5 }, set: 'xt',
      set_bonus: { 2: { damage: 3 } },
      affixes: [{ type: 'skill', skill: 'heavy', amount: 0.2 }],
      weight: 2, value: 80, desc: 'т' },
    { id: 'x_t_head', name: 'Тестовый шлем (xt)', kind: 'armor',
      slot: 'head', stats: { armor: 1 }, set: 'xt',
      set_bonus: { 2: { damage: 3 } }, weight: 1, value: 20, desc: 'т' },
    { id: 'x_t_ring_fc', name: 'Тестовое кольцо (fc)', kind: 'ring',
      slot: 'ring', weight: 0.1, value: 30, desc: 'т',
      affixes: [{ type: 'free_cast', spell: 'mend' }] },
  ];
  for (const f of ['items.js', 'buildings.js', 'npc.js', 'companions.js']) {
    loadInSandbox(f, sandbox);
  }
  const G = sandbox.Game;
  const Co = G.companions;
  const hero = G.createCharacter();
  const merc = G.Sheet.createSheet('merc', { npcId: 'merc_volk' });
  merc.secondary.heavy = 2;
  merc.level = 3;
  const npc = G.NpcData.NPCS.find((n) => n.id === 'merc_volk');
  const entry = { npcId: 'merc_volk', sheet: merc, level: 3, xp: 0,
    loyalty: 51, hiredDay: 1 };
  const mercDamage = (b) => Math.max(1, Math.round(
    (2 + 0.7 * merc.level) * (npc.найм.dmg || 1) *
    (1 + b.fistDamageBonus + b.heavyDamageBonus + b.rangedDamageBonus)));
  const b0 = G.Sheet.derived(merc);
  const d0 = Co.allyDataForEntry(entry, npc);
  assert.deepEqual(fromVm(d0.freeCast), [],
    'контроль: без экипировки freeCast пуст');
  assert.equal(d0.armor, undefined,
    'контроль: Вольк без найм.armor и без экипировки — undefined');
  assert.equal(d0.damage, mercDamage(b0),
    'контроль: damage = формула mercModifier (без экипировки)');
  for (const id of ['x_t_blade', 'x_t_head', 'x_t_ring_fc']) {
    assert.equal(G.addItem(hero, id).ok, true, 'addItem ' + id);
  }
  for (const id of ['x_t_blade', 'x_t_head', 'x_t_ring_fc']) {
    assert.equal(Co.allyEquip(hero, merc, id).ok, true, 'allyEquip ' + id);
  }
  const b1 = G.Sheet.derived(merc);
  assert.ok(b1.heavyDamageBonus > b0.heavyDamageBonus,
    'skill-affix heavy 0.2 действует через pipeline: 0.05·2 = 0.1 → '
    + '0.1·1.2 = 0.12 (строго >; без affix — равенство)');
  const d1 = Co.allyDataForEntry(entry, npc);
  assert.deepEqual(fromVm(d1.freeCast), ['mend'],
    'freeCast — из free_cast-аффикса кольца (≠ [] без экипировки)');
  assert.equal(d1.armor, 1, 'armor = (h.armor||0) + es.armor (1)');
  assert.equal(d1.maxHP, d0.maxHP,
    'maxHP не изменился (endurance/golem-affix в фикстурах нет)');
  const es = G.equipmentStats(merc);
  assert.equal(es.damage, 8,
    'es.damage = 5 (оружие) + 3 (set-бонус 2 предмета; гейт 000230.04 '
    + 'D-02 — set-damage только в оружейной ветке)');
  assert.equal(es.armor, 1, 'es.armor — сумма по слотам');
  assert.equal(d1.damage, mercDamage(b1) + es.damage,
    'damage = база (с усиленным affix) + экипировка (формула §2.3)');
  assert.ok(d1.damage > d0.damage, 'экипировка повышает damage');
});

test('000230.06.01 I2 (vm, ре-пин 000230.20): swap с неудачным возвратом (ally-путь через allyEquip) — swap ОТКАТАН (все или ничего): ТОЧНАЯ форма {ok:false, reason} — словарь checkAdd; prev НА МЕСТЕ в слоте, new в инвентаре бит-в-бит; зеркала синхронны (D-01)', () => {
  const { sandbox } = makeVmSandboxWithConsole();
  sandbox.Game = {};
  for (const f of VM_ALLY_WEIGHT_CHAIN) loadInSandbox(f, sandbox);
  for (const f of ['items.js', 'buildings.js', 'npc.js', 'companions.js']) {
    loadInSandbox(f, sandbox);
  }
  const G = sandbox.Game;
  const Co = G.companions;
  const hero = G.createCharacter();
  for (const id of ['knight_plate', 'knight_plate', 'knight_plate',
    'war_hammer', 'short_bow', 'short_bow',
    'resurrect_scroll', 'resurrect_scroll', 'resurrect_scroll',
    'iron_sword']) {
    assert.equal(G.addItem(hero, id).ok, true, 'addItem ' + id);
  }
  assert.equal(G.inventoryWeight(hero), 30,
    'ровно 30 кг (10 слотов: 3×7 + 4 + 2×1 + 3×0.5 + 1.5)');
  const merc = G.Sheet.createSheet('merc', { npcId: 'merc_volk' });
  merc.equipment = { right_hand: 'battle_axe' };
  const r = Co.allyEquip(hero, merc, 'iron_sword');
  assert.deepEqual(fromVm(r),
    { ok: false, reason: 'слишком тяжело (лимит веса)' },
    'точная форма отказа: все или ничего (note-ветка убрана)');
  assert.equal(merc.equipment.right_hand, 'battle_axe',
    'prev НА МЕСТЕ (swap не совершён; краснота: перезаписан/потерян)');
  assert.equal(merc.equipment.weapon, 'battle_axe',
    'зеркало D-01 синхронно на откате (syncEquipmentMirrors)');
  assert.equal(G.totalQty(hero, 'iron_sword'), 1,
    'new в инвентаре как был');
  assert.equal(G.totalQty(hero, 'battle_axe'), 0,
    'prev не потерян и не продублирован');
  assert.equal(G.inventoryWeight(hero), 30,
    'инвентарь бит-в-бит: 30 кг');
  assert.equal(G.slotCount(hero), 10,
    'инвентарь бит-в-бит: 10 слотов (позиция new восстановлена)');
});

// --- 000230.20: swap-fail generic equip — откат swap (все или ничего).
// Позитивный пин success-ветки (контракт —
// memory/000230.20-equip-swap-rollback.md §3).

test('000230.20 S1 (node): успешный swap при свободном инвентаре — {ok:true, slot, item}: prev в инвентаре, new в слоте; зеркала weapon ≡ right_hand (D-01)', () => {
  const c = createCharacter();
  assert.equal(I.addItem(c, 'iron_sword').ok, true, 'addItem iron_sword');
  assert.deepEqual(I.equip(c, 'iron_sword'),
    { ok: true, slot: 'right_hand', item: 'iron_sword' },
    'форма успеха: пустой слот');
  assert.equal(I.addItem(c, 'battle_axe').ok, true, 'addItem battle_axe');
  assert.deepEqual(I.equip(c, 'battle_axe'),
    { ok: true, slot: 'right_hand', item: 'battle_axe' },
    'форма успеха: swap');
  assert.equal(c.equipment.right_hand, 'battle_axe', 'new в слоте');
  assert.equal(c.equipment.weapon, 'battle_axe', 'зеркало D-01');
  assert.equal(I.totalQty(c, 'iron_sword'), 1, 'prev в инвентаре');
  assert.equal(I.totalQty(c, 'battle_axe'), 0, 'new не продублирован');
});

// --- Задача 000235.07: 25 свитков волны Огонь (items 000083–00107;
// --- Задача 000235.07: 25 свитков волны Огонь (items 000108–00132;
// после ребейза конкурент 000232 занял 000077–000082) ---
// Контракт: memory/000235.07-fire-wave-content.md §1.3. RED: файлы/
// записи отсутствуют. id `<spell>_scroll`; tier = `уровень` спелла;
// value = {T1:45, T2:60, T3:115, T4:240}.

const FIRE07_SCROLLS = [
  ['ember', 1], ['ignite', 2], ['fire_nova', 2], ['lava_burst', 3],
  ['meteor', 3], ['flame_strike', 3], ['hellfire', 4],
  ['phlogiston_blast', 4], ['burning_ground', 2], ['wall_of_fire', 3],
  ['burning_haze', 3], ['blazing_speed', 1], ['fire_aura', 2],
  ['heat_shield', 2], ['sunfire', 3], ['scorch', 2], ['cinder', 3],
  ['ashen_debilitation', 4], ['lava_snare', 2], ['burning_cage', 3],
  ['flame_imp', 2], ['phoenix', 4], ['firelight', 1], ['hearthfire', 1],
  ['flame_step', 2],
];
const SCROLL_VALUE_07 = { 1: 45, 2: 60, 3: 115, 4: 240 };

test('000235.07 W-06: 25 свитков — id <spell>_scroll, kind spell_scroll, effect {kind:spell, spell:<id>}, tier = уровень спелла, weight 0.2, name «Свиток: …», value по тьеру, зеркало ≡ JSON', () => {
  const byFile = new Map();
  for (const f of fs.readdirSync(ITEMS_DIR)
      .filter((x) => /^\d{6}\.json$/.test(x))) {
    byFile.set(f, JSON.parse(
      fs.readFileSync(path.join(ITEMS_DIR, f), 'utf8')));
  }
  const jsById = new Map(I.allItems().map((it) => [it.id, it]));
  FIRE07_SCROLLS.forEach(([spellId, level], i) => {
    const file = String(108 + i).padStart(6, '0') + '.json';
    const j = byFile.get(file);
    assert.ok(j, 'W-06: ' + file + ' в assets/items (RED: файла нет)');
    assert.equal(j.id, spellId + '_scroll', file + ': id <spell>_scroll');
    assert.equal(j.kind, 'spell_scroll', spellId + ': kind spell_scroll');
    assert.equal(j.weight, 0.2, spellId + ': weight 0.2');
    assert.ok(String(j.name).startsWith('Свиток: '),
      spellId + ': имя «Свиток: …»; факт: ' + j.name);
    assert.ok(typeof j.desc === 'string' && j.desc.trim().length > 0,
      spellId + ': desc непустое');
    assert.deepEqual(j.effect, { kind: 'spell', spell: spellId },
      spellId + ': effect {kind:spell, spell:<id>}');
    assert.ok(SPELLS.SPELLS_BY_ID[spellId],
      spellId + ': effect.spell ∈ каталогу заклинаний (RED: нет)');
    assert.equal(j.tier, level,
      spellId + ': tier = уровень спелла (' + level + ')');
    assert.equal(j.value, SCROLL_VALUE_07[level],
      spellId + ': value по тьеру (' + SCROLL_VALUE_07[level] + ')');
    const it = jsById.get(spellId + '_scroll');
    assert.ok(it, 'W-06: зеркало items-data: ' + spellId + '_scroll (RED: нет)');
    assert.deepEqual(it, j, spellId + '_scroll: зеркало ≡ JSON');
  });
});

// =====================================================================
// Задача 000230.09 — предметы «Уши» + «Шея»: 50 (2×10/7/5/2/1) +
// иконки + рецепты (контентная волна 2 серии 000230, серийно после
// .08; P2).
// Контракт — memory/000230.09-ears-neck-items-wave.md (ростер §2.1,
// матрица affixes §2.2, наборы §2.3, рецепты §2.4, пулы §2.5,
// иконки §2.6; id 000158–000207).
// RED (TDD): в каталоге 0 предметов slot 'ears'/'neck', 50 иконок
// волны в assets/sprites/items/ нет, зеркало items-data.js не
// регенерировано — тесты ниже падают по ОСМЫСЛЕННОЙ причине «данные
// волны не добавлены» (нет id/файлов), а не по синтаксису. Тесты
// читают РЕАЛЬНЫЙ каталог (JSON + зеркало), а не фикстуры.
// Технические ре-пины существующих тестов (счётчики 132→182,
// 31→81 и т.д.) — стадия ЗЕЛЁНАЯ: в красной фазе каталог не
// меняется и фон остаётся зелёным.
// =====================================================================

// Ростер §2.1 (id фиксирован; файлы каталога: 000158–000207 —
// финальная нумерация после ребейза на мастер с 000235.07: 133–157
// отданы волне 000235.08 Лёд; ears — 25 (000158–000182),
// neck — 25 (000183–000207)).
// [id, name, slot, rarity, stats.armor, weight, value,
//  affixes, set (null — поле нет)]
const EARSNECK_ROSTER_00023009 = [
  ['copper_hoop', 'Медная петля', 'ears', 'common', 0, 0.05, 8,
   [{ type: 'skill', skill: 'perception', amount: 0.03 }], null],
  ['bone_stud', 'Костяной гвоздик', 'ears', 'common', 0, 0.05, 10,
   [{ type: 'skill', skill: 'precog', amount: 0.04 }], null],
  ['leather_loop', 'Кожаный лантух', 'ears', 'common', 0, 0.05, 12,
   [{ type: 'skill', skill: 'meditation', amount: 0.03 }], null],
  ['clay_dangle', 'Глиняный бубенчик', 'ears', 'common', 0, 0.1, 14,
   [{ type: 'skill', skill: 'orator', amount: 0.05 }], null],
  ['wood_bead', 'Деревянная бусина', 'ears', 'common', 0, 0.05, 16,
   [{ type: 'skill', skill: 'artist', amount: 0.04 }], null],
  ['copper_dangle', 'Медный подвес', 'ears', 'common', 0, 0.1, 18,
   [{ type: 'skill', skill: 'perception', amount: 0.05 }], null],
  ['shell_hoop', 'Раковинная петля', 'ears', 'common', 0, 0.1, 20,
   [{ type: 'skill', skill: 'elder', amount: 0.05 }], null],
  ['faith_stud', 'Гвоздик веры', 'ears', 'common', 0, 0.05, 22,
   [{ type: 'skill', skill: 'meditation', amount: 0.05 }], 'faith'],
  ['twine_hoop', 'Плетёная петля', 'ears', 'common', 0, 0.05, 24,
   [{ type: 'skill', skill: 'precog', amount: 0.05 }], null],
  ['antler_hook', 'Рогатый крючок', 'ears', 'common', 1, 0.1, 28,
   [{ type: 'skill', skill: 'orator', amount: 0.03 }], null],
  ['stone_bead', 'Каменная бусина', 'ears', 'rare', 0, 0.2, 45,
   [{ type: 'skill', skill: 'perception', amount: 0.06 }], null],
  ['silver_hoop', 'Серебряная петля', 'ears', 'rare', 1, 0.1, 50,
   [{ type: 'skill', skill: 'perception', amount: 0.07 }], null],
  ['moonstone_dangle', 'Лунный подвес', 'ears', 'rare', 0, 0.1, 65,
   [{ type: 'skill', skill: 'artist', amount: 0.08 }], null],
  ['quartz_bead', 'Кварцевая бусина', 'ears', 'rare', 0, 0.1, 60,
   [{ type: 'skill', skill: 'meditation', amount: 0.07 }], null],
  ['silver_stud', 'Серебряный гвоздик', 'ears', 'rare', 1, 0.1, 70,
   [{ type: 'skill', skill: 'elder', amount: 0.08 }], null],
  ['obsidian_stud', 'Обсидиановый гвоздик', 'ears', 'rare', 1, 0.1, 75,
   [{ type: 'skill', skill: 'precog', amount: 0.09 }], null],
  ['amethyst_dangle', 'Аметистовый подвес', 'ears', 'rare', 0, 0.1, 85,
   [{ type: 'skill', skill: 'orator', amount: 0.09 }], null],
  ['sapphire_hoop', 'Сапфировая петля', 'ears', 'epic', 1, 0.1, 160,
   [{ type: 'skill', skill: 'perception', amount: 0.15 }], null],
  ['emerald_stud', 'Изумрудный гвоздик', 'ears', 'epic', 1, 0.1, 180,
   [{ type: 'skill', skill: 'meditation', amount: 0.12 },
    { type: 'free_cast', spell: 'ward' }], null],
  ['ruby_bell', 'Рубиновый бубенчик', 'ears', 'epic', 1, 0.1, 200,
   [{ type: 'skill', skill: 'orator', amount: 0.20 }], null],
  ['gold_dangle', 'Золотой подвес', 'ears', 'epic', 1, 0.1, 220,
   [{ type: 'skill', skill: 'artist', amount: 0.18 }], 'stage'],
  ['mithril_hoop', 'Мифриловая петля', 'ears', 'epic', 1, 0.1, 320,
   [{ type: 'skill', skill: 'precog', amount: 0.16 }], null],
  ['star_earring', 'Звёздная серьга', 'ears', 'legendary', 1, 0.1, 450,
   [{ type: 'skill', skill: 'perception', amount: 0.30 }], null],
  ['whisper_hoop', 'Шепчущая петля', 'ears', 'legendary', 1, 0.1, 500,
   [{ type: 'skill', skill: 'elder', amount: 0.30 }], null],
  ['soul_bell', 'Колокол души', 'ears', 'impossible', 1, 0.2, 1000,
   [{ type: 'skill', skill: 'orator', amount: 0.40 },
    { type: 'skill', skill: 'artist', amount: 0.35 }], null],
  ['copper_chain', 'Медная цепочка', 'neck', 'common', 0, 0.1, 9,
   [{ type: 'skill', skill: 'precog', amount: 0.04 }], null],
  ['bone_beads', 'Костяное ожерелье', 'neck', 'common', 0, 0.1, 11,
   [{ type: 'skill', skill: 'perception', amount: 0.03 }], null],
  ['twine_amulet', 'Плетёный амулет', 'neck', 'common', 0, 0.1, 13,
   [{ type: 'skill', skill: 'meditation', amount: 0.04 }], null],
  ['clay_pendant', 'Глиняный подвес', 'neck', 'common', 0, 0.1, 15,
   [{ type: 'skill', skill: 'artist', amount: 0.05 }], null],
  ['wood_pendant', 'Деревянный амулет', 'neck', 'common', 0, 0.1, 17,
   [{ type: 'skill', skill: 'elder', amount: 0.05 }], null],
  ['copper_pendant', 'Медный амулет', 'neck', 'common', 0, 0.1, 19,
   [{ type: 'skill', skill: 'precog', amount: 0.05 }], null],
  ['shell_beads', 'Раковинный чокер', 'neck', 'common', 0, 0.15, 21,
   [{ type: 'skill', skill: 'orator', amount: 0.04 }], null],
  ['faith_necklace', 'Ожерелье веры', 'neck', 'common', 0, 0.1, 23,
   [{ type: 'skill', skill: 'meditation', amount: 0.05 }], 'faith'],
  ['leather_choker', 'Кожаный чокер', 'neck', 'common', 1, 0.1, 25,
   [{ type: 'skill', skill: 'precog', amount: 0.03 }], null],
  ['stone_beads', 'Каменный бисер', 'neck', 'common', 0, 0.2, 27,
   [{ type: 'skill', skill: 'perception', amount: 0.04 }], null],
  ['bone_pendant', 'Костяной подвес', 'neck', 'rare', 0, 0.1, 50,
   [{ type: 'skill', skill: 'orator', amount: 0.07 }], null],
  ['silver_chain', 'Серебряная цепочка', 'neck', 'rare', 1, 0.1, 55,
   [{ type: 'skill', skill: 'perception', amount: 0.07 }], null],
  ['quartz_amulet', 'Кварцевый амулет', 'neck', 'rare', 0, 0.1, 60,
   [{ type: 'skill', skill: 'meditation', amount: 0.08 }], null],
  ['moonstone_chain', 'Лунная цепочка', 'neck', 'rare', 0, 0.1, 65,
   [{ type: 'skill', skill: 'artist', amount: 0.08 }], null],
  ['faith_amulet', 'Амулет веры', 'neck', 'rare', 1, 0.1, 75,
   [{ type: 'skill', skill: 'elder', amount: 0.08 }], 'faith'],
  ['obsidian_pendant', 'Обсидиановый амулет', 'neck', 'rare', 1, 0.1, 80,
   [{ type: 'skill', skill: 'precog', amount: 0.10 }], null],
  ['amethyst_choker', 'Аметистовый чокер', 'neck', 'rare', 1, 0.1, 85,
   [{ type: 'skill', skill: 'precog', amount: 0.09 }], null],
  ['sapphire_pendant', 'Сапфировый амулет', 'neck', 'epic', 1, 0.1, 170,
   [{ type: 'skill', skill: 'perception', amount: 0.15 }], null],
  ['emerald_amulet', 'Изумрудный амулет', 'neck', 'epic', 1, 0.1, 200,
   [{ type: 'skill', skill: 'meditation', amount: 0.14 },
    { type: 'free_cast', spell: 'greater_heal' }], null],
  ['ruby_pendant', 'Рубиный подвес', 'neck', 'epic', 1, 0.1, 210,
   [{ type: 'skill', skill: 'precog', amount: 0.18 }], null],
  ['gold_chain', 'Золотая цепочка', 'neck', 'epic', 1, 0.2, 240,
   [{ type: 'skill', skill: 'orator', amount: 0.20 }], 'stage'],
  ['mithril_choker', 'Мифриловый чокер', 'neck', 'epic', 1, 0.1, 330,
   [{ type: 'skill', skill: 'elder', amount: 0.16 }], null],
  ['rune_necklace', 'Руническое ожерелье', 'neck', 'legendary', 1, 0.1, 480,
   [{ type: 'skill', skill: 'perception', amount: 0.28 }], null],
  ['star_pendant', 'Звёздный амулет', 'neck', 'legendary', 1, 0.1, 520,
   [{ type: 'skill', skill: 'precog', amount: 0.30 }], null],
  ['dawn_pendant', 'Рассветный амулет', 'neck', 'impossible', 1, 0.2, 1100,
   [{ type: 'skill', skill: 'elder', amount: 0.40 },
    { type: 'skill', skill: 'meditation', amount: 0.35 }], null],
];
const EARSNECK_IDS_00023009 = EARSNECK_ROSTER_00023009.map((r) => r[0]);
const EARSNECK_ID_SET_00023009 = new Set(EARSNECK_IDS_00023009);

// Матрица §2.2: Σ skill-записей 52 = 11/11/9/7/8/6 (6 ювелирных
// навыков research §6); free_cast — ровно 2 (ward + greater_heal).
const SKILL_MATRIX_00023009 = {
  perception: 11, precog: 11, meditation: 9, elder: 7, orator: 8,
  artist: 6,
};

// Наборы §2.3: 2 новых (faith 3-чл. + stage 2-чл.), ОБА активны
// (ears+neck — разные слоты, порог 2 накрывается парой).
const EARSNECK_SETS_00023009 = [
  { set: 'faith',
    members: ['faith_stud', 'faith_necklace', 'faith_amulet'],
    bonus: { 2: { armor: 1 } } },
  { set: 'stage', members: ['gold_dangle', 'gold_chain'],
    bonus: { 2: [{ type: 'skill', skill: 'artist', amount: 0.05 }] } },
];

test('000230.09 EN1: 50 предметов — append-блок: ПЕРВЫЕ 50 из последних 75 файлов каталога (base = files[len−75], rebase-робастно БЕЗ хардкода номера; ре-пин 000230.10: после .09-блока приписан torso-блок 25, окно 50 → 75); позиции 0–24 slot ears, 25–49 slot neck (каталожный порядок); редкости ears-блока РОВНО 10/7/5/2/1 И neck-блока РОВНО 10/7/5/2/1; все kind armor (краснота: slot ears/neck — 0 предметов)', () => {
  const { files, byFile } = catalogScan00023008();
  const earsCount = [...byFile.values()]
    .filter((it) => it.slot === 'ears').length;
  const neckCount = [...byFile.values()]
    .filter((it) => it.slot === 'neck').length;
  assert.equal(earsCount, 25,
    'slot ears — ровно 25 предмета (краснота: волна не добавлена; '
    + 'факт: ' + earsCount + ')');
  assert.equal(neckCount, 25,
    'slot neck — ровно 25 предмета (краснота: волна не добавлена; '
    + 'факт: ' + neckCount + ')');
  // Ре-пин 000235.09: блок НЕ конец каталога (после него — torso
  // 000208-000232 и свитки 000233-000257 волны Тень) — позиция
  // определяется по slot (паттерн H1, ре-пин 000235.07).
  const blockFiles = files.filter((f) =>
    byFile.get(f).slot === 'ears' || byFile.get(f).slot === 'neck');
  assert.equal(blockFiles.length, 50,
    'слот ears+neck — ровно 50 файлов (краснота: волна не добавлена; '
    + 'факт: ' + blockFiles.length + ')');
  const base = parseInt(blockFiles[0], 10);
  const slotByPos = (i) => (i < 25 ? 'ears' : 'neck');
  const tierByPos = (i) => {
    const j = i % 25;
    return j < 10 ? 'common' : j < 17 ? 'rare'
      : j < 22 ? 'epic' : j < 24 ? 'legendary' : 'impossible';
  };
  for (let i = 0; i < 50; i++) {
    const f = blockFiles[i];
    assert.equal(f, String(base + i).padStart(6, '0') + '.json',
      'блок волны — 50 последовательных файлов (base ' + base
      + '); позиция ' + i + ': ' + f);
    const it = byFile.get(f);
    assert.equal(it.kind, 'armor', f + ': kind armor');
    assert.equal(it.slot, slotByPos(i),
      f + ': slot ' + slotByPos(i) + ' (каталожный порядок = ears-блок '
      + '25, затем neck-блок 25); факт: ' + it.slot);
    assert.equal(it.rarity, tierByPos(i),
      f + ': rarity ' + tierByPos(i) + ' (каталожный порядок = тировый '
      + 'порядок 10/7/5/2/1 в каждом блоке); факт: ' + it.rarity);
  }
});

test('000230.09 EN2: ростер 50 построчно (§2.1: id/name/kind/slot/rarity/stats.armor (0–1)/weight (0.05–0.5)/value/affixes/set); desc — непустая строка; subtype/tier/effect/loot отсутствуют (паттерн 000008; rarity вместо tier — D3)', () => {
  const { byId } = catalogScan00023008();
  for (const [id, name, slot, rarity, armor, weight, value, affixes, set]
      of EARSNECK_ROSTER_00023009) {
    const it = byId.get(id);
    assert.ok(it, 'предмет "' + id + '" в каталоге (краснота: волна '
      + 'не добавлена)');
    assert.equal(it.name, name, id + ': name');
    assert.equal(it.kind, 'armor', id + ': kind armor');
    assert.equal(it.slot, slot, id + ': slot ' + slot);
    assert.equal(it.rarity, rarity, id + ': rarity ' + rarity);
    assert.deepEqual(it.stats, { armor },
      id + ': stats — ровно { armor: ' + armor + ' } (ювелирная '
      + 'группа: 0–1)');
    assert.equal(it.weight, weight, id + ': weight');
    assert.ok(it.weight >= 0.05 && it.weight <= 0.5,
      id + ': weight ' + it.weight + ' в диапазоне 0.05–0.5 (ТЗ)');
    assert.equal(it.value, value, id + ': value');
    assert.deepEqual(it.affixes, affixes, id + ': affixes (§2.1)');
    assert.equal(it.set, set === null ? undefined : set,
      id + ': set ' + (set === null ? 'отсутствует' : '«' + set + '»'));
    assert.equal(typeof it.desc, 'string', id + ': desc — строка');
    assert.ok(it.desc.length > 0, id + ': desc — непустая строка');
    assert.equal(it.subtype, undefined,
      id + ': subtype отсутствует (у armor не бывает)');
    assert.equal(it.tier, undefined,
      id + ': tier отсутствует (редкость — отдельное поле rarity, D3)');
    assert.equal(it.effect, undefined, id + ': effect отсутствует');
    assert.equal(it.loot, undefined,
      id + ': loot отсутствует (loot — только у reagent)');
  }
});

test('000230.09 EN3: матрица affixes — покрытие 6 ювелирных skills РОВНО 11/11/9/7/8/6 (perception/precog/meditation/elder/orator/artist, research §6), Σ 52 skill-записи + 2 free_cast = 54; amounts в шкале редкости (§2.2); free_cast — ровно 2 (ward + greater_heal), ТОЛЬКО у epic; skill в live skill-каталоге, spell в assets/spells', () => {
  const { byId } = catalogScan00023008();
  const wave = EARSNECK_IDS_00023009.map((id) => {
    const it = byId.get(id);
    assert.ok(it, 'предмет "' + id + '" в каталоге (краснота: волна '
      + 'не добавлена)');
    return it;
  });
  const coverage = {};
  let skillRecords = 0;
  const freeCast = [];
  const spells = spellIds00023008();
  for (const it of wave) {
    assert.ok(Array.isArray(it.affixes) && it.affixes.length >= 1,
      it.id + ': affixes — непустой массив (у каждого предмета ≥1)');
    for (const a of it.affixes) {
      if (a.type === 'skill') {
        skillRecords += 1;
        assert.ok(SECONDARY_SKILLS[a.skill] !== undefined,
          it.id + ': skill «' + a.skill + '» — в live skill-каталоге');
        coverage[a.skill] = (coverage[a.skill] || 0) + 1;
        const [lo, hi] = RARITY_AFFIX_SCALE_00023008[it.rarity];
        assert.ok(a.amount >= lo && a.amount <= hi,
          it.id + ': amount ' + a.amount + ' в шкале редкости '
          + it.rarity + ' [' + lo + ', ' + hi + ']');
      } else if (a.type === 'free_cast') {
        freeCast.push({ id: it.id, rarity: it.rarity, spell: a.spell });
        assert.ok(spells.has(a.spell),
          it.id + ': spell «' + a.spell + '» — в assets/spells');
      } else {
        assert.fail(it.id + ': неизвестный type affix: ' + a.type);
      }
    }
  }
  assert.equal(skillRecords, 52,
    'Σ skill-записей — ровно 52 (матрица §2.2); факт: ' + skillRecords);
  assert.deepEqual(
    { perception: coverage.perception || 0, precog: coverage.precog || 0,
      meditation: coverage.meditation || 0, elder: coverage.elder || 0,
      orator: coverage.orator || 0, artist: coverage.artist || 0 },
    SKILL_MATRIX_00023009,
    'покрытие навыков — ровно 11/11/9/7/8/6 (матрица §2.2); факт: '
    + JSON.stringify(coverage));
  assert.equal(freeCast.length, 2,
    'free_cast — ровно 2 (ТЗ: 1–2 шт. на волну, у epic+); факт: '
    + freeCast.length);
  assert.deepEqual(freeCast.map((f) => f.spell).sort(),
    ['greater_heal', 'ward'],
    'free_cast — существующие заклинания ward + greater_heal');
  for (const f of freeCast) {
    assert.equal(f.rarity, 'epic',
      f.id + ': free_cast — ТОЛЬКО у epic (контракт §2.1); факт: '
      + f.rarity);
  }
});

test('000230.09 EN4: наборы — РОВНО 2 новых: faith {faith_stud, faith_necklace, faith_amulet} / set_bonus {2: {armor: 1}} (stat-объект, D-02) и stage {gold_dangle, gold_chain} / {2: [{skill artist 0.05}]} (affix-массив; НЕ damage); set_bonus ОДИНАКОВ у участников (D-03); пороги ⊆ {2,3,4}; прочие 45 предметов волны — без set/set_bonus', () => {
  const { byId } = catalogScan00023008();
  for (const s of EARSNECK_SETS_00023009) {
    for (const id of s.members) {
      const it = byId.get(id);
      assert.ok(it, 'предмет "' + id + '" в каталоге (краснота: волна '
        + 'не добавлена)');
      assert.equal(it.set, s.set, id + ': set «' + s.set + '»');
      assert.deepEqual(it.set_bonus, s.bonus,
        id + ': set_bonus (контракт §2.3; ОДИНАКОВОЕ значение для '
        + 'всех участников — D-03)');
    }
    for (const [k, v] of Object.entries(s.bonus)) {
      assert.ok(['2', '3', '4'].includes(k),
        s.set + ': порог «' + k + '» ⊆ {2,3,4}');
      if (Array.isArray(v)) {
        for (const a of v) {
          assert.equal(a.type, 'skill',
            s.set + ': affix-форма set_bonus — type «skill»');
          assert.ok(typeof a.amount === 'number'
              && Number.isFinite(a.amount),
            s.set + ': affix-форма set_bonus — amount число');
        }
      } else if (v && typeof v === 'object') {
        assert.ok(!('damage' in v),
          s.set + ': set_bonus — БЕЗ damage (D-02: ювелирная '
          + 'группа)');
        if ('armor' in v) {
          assert.ok(Number.isFinite(v.armor),
            s.set + ': set_bonus.armor — число');
        }
      } else {
        assert.fail(s.set + ': неизвестная форма set_bonus[' + k + ']');
      }
    }
  }
  const members = new Set(
    EARSNECK_SETS_00023009.flatMap((s) => s.members));
  for (const id of EARSNECK_IDS_00023009) {
    const it = byId.get(id);
    assert.ok(it, 'предмет "' + id + '" в каталоге');
    if (!members.has(id)) {
      assert.equal(it.set, undefined,
        id + ': set отсутствует (в волне только 2 набора)');
      assert.equal(it.set_bonus, undefined, id + ': set_bonus отсутствует');
    }
  }
});

test('000230.09 EN5: иконки — у всех 50 icon = assets/sprites/items/<id>.svg, svg-файл существует; 50 svg УНИКАЛЬНЫ по содержимому (НЕ копии, §2.6); 50 id различны (анти-коллизия) и не пересекаются с остальным каталогом', () => {
  const { files, byId, byFile } = catalogScan00023008();
  const ROOT = path.join(__dirname, '..');
  const seen = new Map();
  for (const id of EARSNECK_IDS_00023009) {
    const it = byId.get(id);
    assert.ok(it, 'предмет "' + id + '" в каталоге (краснота: волна '
      + 'не добавлена)');
    assert.equal(it.icon, 'assets/sprites/items/' + id + '.svg',
      id + ': icon = assets/sprites/items/<id>.svg');
    const p = path.join(ROOT, it.icon);
    assert.ok(fs.existsSync(p),
      id + ': svg-файл существует (краснота: иконка не создана)');
    const raw = fs.readFileSync(p, 'utf8');
    for (const [other, otherRaw] of seen) {
      assert.notEqual(raw, otherRaw,
        id + ' и ' + other + ': иконки уникальны (НЕ копии)');
    }
    seen.set(id, raw);
  }
  assert.equal(new Set(EARSNECK_IDS_00023009).size, 50,
    '50 id различны (анти-коллизия в волне)');
  // Ре-пин 000235.09: «остальной каталог» = всё, кроме блока волны
  // (определяется по slot — блок НЕ конец каталога: после него
  // torso 000208-000232 и свитки 000233-000257; паттерн H1, ре-пин
  // 000235.07).
  for (const f of files) {
    const j = byFile.get(f);
    if (j.slot === 'ears' || j.slot === 'neck') continue;
    assert.ok(!EARSNECK_ID_SET_00023009.has(j.id),
      'id «' + j.id + '» (' + f + ') — НЕ пересекается с ростером '
      + 'волны (id уникальны в каталоге)');
  }
});

test('000230.09 EN6: порядок ключей JSON 50 файлов — подмножество 17 канонических KEYS sync-items-data.js в канон-порядке (E1b-паттерн: нарушение = неидемпотентная sync-дифф, ловят пины E1b/E20)', () => {
  const { byId, fileById } = catalogScan00023008();
  for (const id of EARSNECK_IDS_00023009) {
    const it = byId.get(id);
    assert.ok(it, 'предмет "' + id + '" в каталоге (краснота: волна '
      + 'не добавлена)');
    const f = fileById.get(id);
    const keys = Object.keys(JSON.parse(
      fs.readFileSync(path.join(ITEMS_DIR, f), 'utf8')));
    assert.ok(keys.length > 0, f + ': файл не пуст');
    let prev = -1;
    for (const k of keys) {
      const i = KEYS_SYNC_00023008.indexOf(k);
      assert.ok(i !== -1,
        f + ': ключ «' + k + '» — в канонических KEYS (краснота: '
        + 'ключа нет в схеме sync)');
      assert.ok(i > prev,
        f + ': ключ «' + k + '» — канон-порядок (E1b-паттерн; '
        + 'нарушение ломает идемпотентность sync)');
      prev = i;
    }
  }
});

test('000230.09 EN7: все 50 — валидны по schema.json (минивалидатор 000015) И зеркало items-data.js ≡ JSON (getItem deepEqual) — регенерация sync сработала', () => {
  const { fileById } = catalogScan00023008();
  const schema = JSON.parse(
    fs.readFileSync(path.join(ITEMS_DIR, 'schema.json'), 'utf8'));
  for (const id of EARSNECK_IDS_00023009) {
    const f = fileById.get(id);
    assert.ok(f, 'файл предмета "' + id + '" (краснота: волна не '
      + 'добавлена)');
    const j = JSON.parse(fs.readFileSync(path.join(ITEMS_DIR, f), 'utf8'));
    const errors = validateData(schema, j, f);
    assert.deepEqual(errors, [],
      f + ': валиден по schema.json; факт: ' + errors.join('; '));
    const it = I.getItem(id);
    assert.ok(it, 'зеркало items-data.js: ' + id + ' (краснота: '
      + 'записи нет — зеркало не регенерировано)');
    assert.deepEqual(it, j, f + ': зеркало ≡ JSON');
  }
});

test('000230.09 EN8 (vm, e2e): РЕАЛЬНЫЕ ears/neck-предметы из live-каталога (не фикстуры) — equip в слоты ears/neck (M2-паттерн); affixes доходят до derived при S=10 по ВСЕМ 6 навыкам: magicResistMult 1.5→1.515 (copper_hoop, perception 0.03), dodgeBonus 0.5→0.52 (bone_stud, precog 0.04), mpRegenMult 0.3→0.306 (leather_loop, meditation 0.03), dialogueBonus 20→21 (shell_hoop elder 0.05 / clay_dangle orator 0.05, round), performanceIncomeMult 2.0→2.04 (wood_bead, artist 0.04); emerald_stud — mpRegenMult 0.324 + free_cast ward в equipmentAffixes; soul_bell — 2 affixes суммируются (dialogueBonus 24, performanceIncomeMult 2.35); obsidian_stud — equipmentStats.armor 1; set faith АКТИВЕН (faith_stud+faith_necklace → count 2, armor 1) и set stage АКТИВЕН (gold_dangle+gold_chain → performanceIncomeMult 2.23) — сильнее дормантности H8', () => {
  const { sandbox } = makeVmSandboxWithConsole();
  loadItemsVmChain(sandbox);
  loadInSandbox('items.js', sandbox);
  const G = sandbox.Game;
  const near = (a, b, msg) => assert.ok(
    Math.abs(a - b) < 1e-9, msg + ' (факт: ' + a + ')');
  const makeHero = () => {
    const c = G.createCharacter();
    c.secondary.perception = 10;
    c.secondary.precog = 10;
    c.secondary.meditation = 10;
    c.secondary.elder = 10;
    c.secondary.orator = 10;
    c.secondary.artist = 10;
    return c;
  };
  const equipIn = (c, id, slot) => {
    const ra = G.addItem(c, id);
    assert.equal(ra.ok, true, id + ': выдача (' + (ra.reason || '')
      + ') — предмет есть в live-каталоге (краснота: неизвестный '
      + 'предмет — волна не добавлена)');
    const r = G.equip(c, id);
    assert.equal(r.ok, true, id + ': equip (' + (r.reason || '') + ')');
    assert.equal(c.equipment[slot], id, id + ': предмет в слоте '
      + slot);
  };
  {
    const c = makeHero();
    const d = G.derived(c);
    near(d.magicResistMult, 1.5, 'база magicResistMult (1 + 0.05·10)');
    near(d.dodgeBonus, 0.5, 'база dodgeBonus (0.05·10)');
    near(d.mpRegenMult, 0.3, 'база mpRegenMult (0.10 + 0.02·10)');
    assert.equal(d.dialogueBonus, 20,
      'база dialogueBonus (round(1·10 + 1·10))');
    near(d.performanceIncomeMult, 2.0,
      'база performanceIncomeMult (1 + 0.1·10)');
    assert.equal(G.equipmentStats(c).armor, 0,
      'база equipmentStats.armor — ничего не надето');
  }
  {
    const c = makeHero();
    equipIn(c, 'copper_hoop', 'ears');
    near(G.derived(c).magicResistMult, 1.515,
      'copper_hoop: magicResistMult = 1 + 0.05·10·1.03');
    assert.equal(G.equipmentStats(c).armor, 0,
      'copper_hoop: stats.armor 0 — equipmentStats.armor += 0');
  }
  {
    const c = makeHero();
    equipIn(c, 'bone_stud', 'ears');
    near(G.derived(c).dodgeBonus, 0.52,
      'bone_stud: dodgeBonus = 0.05·10·1.04');
  }
  {
    const c = makeHero();
    equipIn(c, 'leather_loop', 'ears');
    near(G.derived(c).mpRegenMult, 0.306,
      'leather_loop: mpRegenMult = 0.10 + 0.02·10·1.03');
  }
  {
    const c = makeHero();
    equipIn(c, 'shell_hoop', 'ears');
    assert.equal(G.derived(c).dialogueBonus, 21,
      'shell_hoop: dialogueBonus = round(10·1.05 + 10) = 21');
  }
  {
    const c = makeHero();
    equipIn(c, 'clay_dangle', 'ears');
    assert.equal(G.derived(c).dialogueBonus, 21,
      'clay_dangle: dialogueBonus = round(10 + 10·1.05) = 21');
  }
  {
    const c = makeHero();
    equipIn(c, 'wood_bead', 'ears');
    near(G.derived(c).performanceIncomeMult, 2.04,
      'wood_bead: performanceIncomeMult = 1 + 0.1·10·1.04');
  }
  {
    const c = makeHero();
    equipIn(c, 'emerald_stud', 'ears');
    near(G.derived(c).mpRegenMult, 0.324,
      'emerald_stud: mpRegenMult = 0.10 + 0.02·10·1.12');
    const a = G.equipmentAffixes(c);
    assert.ok(a.freeCast.has('ward'),
      'emerald_stud: free_cast ward в equipmentAffixes.freeCast');
  }
  {
    const c = makeHero();
    equipIn(c, 'soul_bell', 'ears');
    const d = G.derived(c);
    assert.equal(d.dialogueBonus, 24,
      'soul_bell: dialogueBonus = round(10 + 10·1.40) = 24 (orator '
      + '0.40; сумма 2 affixes по навыкам)');
    near(d.performanceIncomeMult, 2.35,
      'soul_bell: performanceIncomeMult = 1 + 0.1·10·1.35 (artist '
      + '0.35)');
  }
  {
    const c = makeHero();
    equipIn(c, 'obsidian_stud', 'ears');
    assert.equal(G.equipmentStats(c).armor, 1,
      'obsidian_stud: stats.armor 1 — equipmentStats.armor = 1');
  }
  {
    const c = makeHero();
    equipIn(c, 'faith_stud', 'ears');
    equipIn(c, 'faith_necklace', 'neck');
    const st = G.activeSets(c);
    assert.deepEqual(fromVm(st.counts), { faith: 2 },
      'faith — 2 надетых предмета (ears+neck — разные слоты)');
    assert.equal(st.armor, 1, 'set-бонус faith АКТИВЕН (порог 2 ≤ 2)');
    assert.equal(G.equipmentStats(c).armor, 1,
      'equipmentStats.armor = 0 + 0 + set-бонус 1');
  }
  {
    const c = makeHero();
    equipIn(c, 'gold_dangle', 'ears');
    equipIn(c, 'gold_chain', 'neck');
    near(G.derived(c).performanceIncomeMult, 2.23,
      'stage: performanceIncomeMult = 1 + 0.1·10·(1 + 0.18 + 0.05) '
      + '= 2.23 (set-бонус artist 0.05 АКТИВЕН)');
    const st = G.activeSets(c);
    assert.deepEqual(fromVm(st.counts), { stage: 2 },
      'stage — 2 надетых предмета');
  }
});

// --- Задача 000235.08: волна Лёд — 25 свитков (TDD, RED) ---
//
// Контракт: memory/000235.08-ice-wave-content.md §1.7. Свитки
// 000133–00157 (тот же порядок, что spell-файлы 000043–000067).
// tier = уровень спелла (D8-пин); value {T1:45, T2:60, T3:115, T4:240};
// rarity/icon/loot — НЕТ (пины RAR-G/I1/L3).

const ICE08_SCROLLS = [
  ['ice_lance', 'Ледяное копьё', 1],
  ['rime_bolt', 'Морозный снаряд', 2],
  ['hail', 'Град', 2],
  ['shatter', 'Расколоть', 3],
  ['glacial_spike', 'Ледяной пик', 3],
  ['permafrost', 'Вечная мерзлота', 4],
  ['absolute_zero', 'Абсолютный ноль', 4],
  ['ice_field', 'Ледяное поле', 2],
  ['wall_of_ice', 'Ледяная стена', 3],
  ['blizzard_field', 'Поле метели', 4],
  ['frost_aura', 'Морозная аура', 2],
  ['ice_armor', 'Ледяные латы', 2],
  ['winter_haste', 'Зимняя спешка', 3],
  ['frostbite_blessing', 'Благословение мороза', 1],
  ['slow', 'Морозное замедление', 1],
  ['frostbite', 'Обморожение', 2],
  ['arctic_touch', 'Полярное прикосновение', 2],
  ['deep_freeze', 'Глубокое замерзание', 3],
  ['freeze', 'Заморозить', 2],
  ['glacier_grasp', 'Ледниковая хватка', 3],
  ['frost_wisp', 'Морозный вестник', 2],
  ['winter_elemental', 'Зимний элементаль', 3],
  ['frost_walk', 'Ледяная походка', 2],
  ['cold_breath', 'Дыхание мороза', 1],
  ['frozen_stillness', 'Замершая неподвижность', 3],
];
const SCROLL_VALUE_08 = { 1: 45, 2: 60, 3: 115, 4: 240 };

test('000235.08 W-06: 25 свитков 000133–00157 — id <spell>_scroll, kind spell_scroll, effect {kind:spell, spell:<id>} ∈ каталогу, tier = уровень спелла (ПИН), weight 0.2, name/desc по конвенции, value 45/60/115/240, rarity/icon/loot НЕТ, зеркало ≡ JSON', () => {
  const byFile = new Map();
  for (const f of fs.readdirSync(ITEMS_DIR)
      .filter((x) => /^\d{6}\.json$/.test(x))) {
    byFile.set(f, JSON.parse(
      fs.readFileSync(path.join(ITEMS_DIR, f), 'utf8')));
  }
  const jsById = new Map(I.allItems().map((it) => [it.id, it]));
  const tierCount = {};
  ICE08_SCROLLS.forEach(([spellId, name, level], i) => {
    const file = String(133 + i).padStart(6, '0') + '.json';
    const j = byFile.get(file);
    assert.ok(j, 'W-06: ' + file + ' в assets/items (RED: файла нет)');
    assert.equal(j.id, spellId + '_scroll', file + ': id <spell>_scroll');
    assert.equal(j.name, 'Свиток: ' + name,
      spellId + ': name «Свиток: <название>»');
    assert.equal(j.kind, 'spell_scroll', spellId + ': kind spell_scroll');
    assert.equal(j.weight, 0.2, spellId + ': weight 0.2');
    assert.equal(j.desc,
      'Свиток: изучает «' + name + '» (нужен ранг школы.)',
      spellId + ': desc-конвенция');
    assert.deepEqual(j.effect, { kind: 'spell', spell: spellId },
      spellId + ': effect {kind:spell, spell:<id>}');
    assert.ok(SPELLS.SPELLS_BY_ID[spellId],
      spellId + ': effect.spell ∈ каталогу заклинаний (RED: нет)');
    assert.equal(j.tier, level,
      spellId + ': tier = уровень спелла (' + level + ')');
    assert.equal(j.value, SCROLL_VALUE_08[level],
      spellId + ': value по тьеру (' + SCROLL_VALUE_08[level] + ')');
    assert.equal(j.rarity, undefined, spellId + ': rarity НЕТ (пин RAR-G)');
    assert.equal(j.icon, undefined, spellId + ': icon НЕТ (пин I1)');
    assert.equal(j.loot, undefined, spellId + ': loot НЕТ (пин L3)');
    const it = jsById.get(spellId + '_scroll');
    assert.ok(it, 'W-06: зеркало items-data: ' + spellId + '_scroll (RED: нет)');
    assert.deepEqual(it, j, spellId + '_scroll: зеркало ≡ JSON');
    tierCount[level] = (tierCount[level] || 0) + 1;
  });
  assert.deepEqual(tierCount, { 1: 4, 2: 10, 3: 8, 4: 3 },
    'распределение по тирам: T1×4 / T2×10 / T3×8 / T4×3');
});
// =====================================================================
// Задача 000230.10 — предметы «Тело»: 25 (10/7/5/2/1) + иконки +
// рецепты + remap 3 существующих броней (000008 leather_armor /
// 000009 chainmail / 000010 knight_plate += явное "slot":"torso",
// всё остальное бит-в-бит). Контентная волна 3 серии 000230; P2.
// Контракт — memory/000230.10-torso-items-wave.md §2 (ростер §2.1,
// affix-матрица §2.2, наборы §2.3, иконки §2.6; решения D-01–D-17 §0).
// RED (TDD): в каталоге 0 предметов slot 'torso' (у 3 legacy-броней
// поля slot НЕТ — фолбэк slotOf 000230.02), файлов
// assets/items/000208–000232.json нет, зеркало не регенерировано —
// тесты ниже падают по ОСМЫСЛЕННОЙ причине («волна не добавлена» /
// «нет поля slot»), а не по синтаксису. Тесты читают РЕАЛЬНЫЙ
// каталог (JSON + зеркало), не фикстуры (паттерн .08/.09 H/EN).
// LОВУШКА (memory §5): НЕ пируем «ровно 25 torso» — в GREEN в
// каталоге 28 torso (25 новых + 3 remap); append-блок и remap
// пируем ОТДЕЛЬНО (T2 / T1). Технические репины существующих тестов
// (E9/EQUIP_FIELDS/SHOP_GOLDEN и т.д.) — стадия ЗЕЛЁНАЯ.
// =====================================================================

// ROSTER §2.1 (id фиксирован; файлы каталога 000208–000232 —
// append-only, D-04). Порядок = каталог = tier (D-05).
// [id, name, rarity, stats.armor, weight, value, affixes,
//  set (null — поле нет)]
const TORSO_ROSTER_00023010 = [
  ['linen_shirt', 'Льняная рубашка', 'common', 0, 0.5, 15,
   [{ type: 'skill', skill: 'endurance', amount: 0.03 }], null],
  ['wool_shirt', 'Шерстяная рубашка', 'common', 0, 0.6, 18,
   [{ type: 'skill', skill: 'golem', amount: 0.03 }], null],
  ['cloth_tunic', 'Тканая туника', 'common', 0, 0.5, 20,
   [{ type: 'skill', skill: 'hide', amount: 0.03 }], null],
  ['linen_gown', 'Льняной халат', 'common', 0, 0.6, 22,
   [{ type: 'skill', skill: 'breath', amount: 0.03 }], null],
  ['hemp_robe', 'Пеньмовая роба', 'common', 0, 0.7, 25,
   [{ type: 'skill', skill: 'endurance', amount: 0.04 }], null],
  ['rough_kaftan', 'Грубый кафтан', 'common', 1, 0.8, 28,
   [{ type: 'skill', skill: 'meditation', amount: 0.05 }], null],
  ['wool_gown', 'Шерстяной халат', 'common', 1, 0.9, 30,
   [{ type: 'skill', skill: 'golem', amount: 0.05 }], null],
  ['cloth_sutan', 'Тканая сутана', 'common', 1, 0.7, 32,
   [{ type: 'skill', skill: 'hide', amount: 0.05 }], 'penitent'],
  ['linen_tunic', 'Льняная туника', 'common', 0, 0.5, 35,
   [{ type: 'skill', skill: 'breath', amount: 0.05 }], null],
  ['wool_kaftan', 'Шерстяной кафтан', 'common', 1, 0.9, 40,
   [{ type: 'skill', skill: 'meditation', amount: 0.04 }], null],
  ['wool_sutan', 'Шерстяная сутана', 'rare', 1, 1.0, 60,
   [{ type: 'skill', skill: 'breath', amount: 0.06 }], 'penitent'],
  ['leather_kaftan', 'Кожаный кафтан', 'rare', 2, 1.5, 70,
   [{ type: 'skill', skill: 'endurance', amount: 0.07 }], null],
  ['embroidered_kaftan', 'Вышитый кафтан', 'rare', 1, 1.2, 75,
   [{ type: 'skill', skill: 'meditation', amount: 0.08 }], null],
  ['cloth_robe', 'Тканая роба', 'rare', 1, 1.0, 80,
   [{ type: 'skill', skill: 'golem', amount: 0.08 }], null],
  ['leather_gown', 'Кожаный халат', 'rare', 2, 1.5, 85,
   [{ type: 'skill', skill: 'hide', amount: 0.08 }], null],
  ['monk_sutan', 'Монашеская сутана', 'rare', 1, 1.1, 90,
   [{ type: 'skill', skill: 'breath', amount: 0.09 }], null],
  ['fine_kaftan', 'Тонкий кафтан', 'rare', 2, 1.3, 100,
   [{ type: 'skill', skill: 'golem', amount: 0.10 }], null],
  ['ember_robe', 'Тлеющая роба', 'epic', 3, 1.5, 180,
   [{ type: 'skill', skill: 'endurance', amount: 0.15 },
    { type: 'free_cast', spell: 'heat_shield' }], 'hearth'],
  ['stone_robe', 'Каменная роба', 'epic', 3, 2.0, 200,
   [{ type: 'skill', skill: 'golem', amount: 0.16 }], 'hearth'],
  ['shadow_robe', 'Теневая роба', 'epic', 2, 1.5, 220,
   [{ type: 'skill', skill: 'hide', amount: 0.18 },
    { type: 'free_cast', spell: 'stone_skin' }], null],
  ['deep_breath_robe', 'Роба Глубокого Дыхания', 'epic', 2, 1.5, 250,
   [{ type: 'skill', skill: 'breath', amount: 0.17 }], null],
  ['meditating_robe', 'Роба медитации', 'epic', 3, 1.8, 320,
   [{ type: 'skill', skill: 'meditation', amount: 0.20 }], null],
  ['pilgrim_sutan', 'Сутана паломника', 'legendary', 4, 2.5, 500,
   [{ type: 'skill', skill: 'endurance', amount: 0.30 }], 'penitent'],
  ['void_robe', 'Роба Пустоты', 'legendary', 4, 3.0, 650,
   [{ type: 'skill', skill: 'golem', amount: 0.32 }], null],
  ['aegis_mantle', 'Мантия Аргуса', 'impossible', 4, 3.5, 1200,
   [{ type: 'skill', skill: 'hide', amount: 0.40 },
    { type: 'skill', skill: 'breath', amount: 0.35 }], null],
];
const TORSO_IDS_00023010 = TORSO_ROSTER_00023010.map((r) => r[0]);
const TORSO_ID_SET_00023010 = new Set(TORSO_IDS_00023010);

// REMAP-пин (D-01/D-02): 3 legacy-брони — ровно одно новое поле
// "slot":"torso" СРАЗУ ПОСЛЕ stats, всё остальное бит-в-бит.
// [id, файл, name, stats.armor, weight, value, desc]
const TORSO_REMAP_00023010 = [
  ['leather_armor', '000008.json', 'Кожаный доспех', 2, 2, 35,
   'Мягкий кожаный доспех: защита без скрипа.'],
  ['chainmail', '000009.json', 'Кольчуга', 4, 4, 140,
   'Кольчуга: кольца, вплетённые мастерской рукой.'],
  ['knight_plate', '000010.json', 'Рыцарский доспех', 6, 7, 400,
   'Рыцарский латы: как ходячая крепость.'],
];

test('000230.10 T1: remap — 3 legacy-брони получают ЯВНОЕ "slot":"torso" (ТЗ п.1), всё остальное бит-в-бит: name/kind/weight/value/desc/stats; НОВЫХ полей нет (rarity/set/affixes/icon/subtype/tier/effect/loot — отсутствуют); порядок ключей = старые + slot сразу после stats (канон-субпоследовательность, D-02); позиции 8/9/10 каталога не сдвинулись; slotOf() → "torso" (краснота: у 3 броней поля slot нет)', () => {
  const { files } = catalogScan00023008();
  assert.equal(files[7], '000008.json',
    'позиция 8 каталога = 000008.json (не сдвинулась)');
  assert.equal(files[8], '000009.json',
    'позиция 9 каталога = 000009.json (не сдвинулась)');
  assert.equal(files[9], '000010.json',
    'позиция 10 каталога = 000010.json (не сдвинулась)');
  for (const [id, file, name, armor, weight, value, desc]
      of TORSO_REMAP_00023010) {
    const j = JSON.parse(
      fs.readFileSync(path.join(ITEMS_DIR, file), 'utf8'));
    assert.equal(j.id, id, file + ': id');
    assert.equal(j.slot, 'torso',
      file + ': ЯВНОЕ "slot":"torso" (краснота: у legacy-брони '
      + 'поля slot нет — фолбэк slotOf); факт: ' + j.slot);
    assert.equal(j.name, name, file + ': name бит-в-бит');
    assert.equal(j.kind, 'armor', file + ': kind armor');
    assert.equal(j.weight, weight, file + ': weight бит-в-бит');
    assert.equal(j.value, value, file + ': value бит-в-бит');
    assert.equal(j.desc, desc, file + ': desc бит-в-бит');
    assert.deepEqual(j.stats, { armor },
      file + ': stats — ровно { armor: ' + armor + ' } (бит-в-бит)');
    assert.equal(j.rarity, undefined,
      file + ': rarity отсутствует (ТЗ: ничего кроме slot не менять)');
    assert.equal(j.set, undefined, file + ': set отсутствует');
    assert.equal(j.set_bonus, undefined, file + ': set_bonus отсутствует');
    assert.equal(j.affixes, undefined, file + ': affixes отсутствуют');
    assert.equal(j.icon, undefined,
      file + ': icon отсутствует (прецедент REAGENTS_000220)');
    assert.equal(j.subtype, undefined, file + ': subtype отсутствует');
    assert.equal(j.tier, undefined, file + ': tier отсутствует');
    assert.equal(j.effect, undefined, file + ': effect отсутствует');
    assert.equal(j.loot, undefined, file + ': loot отсутствует');
    assert.deepEqual(Object.keys(j),
      ['id', 'name', 'kind', 'weight', 'value', 'desc', 'stats',
       'slot'],
      file + ': ключи = старые + ровно "slot" СРАЗУ ПОСЛЕ stats '
      + '(D-02); факт: ' + Object.keys(j).join(','));
    // Канон-субпоследовательность (E1b-паттерн).
    let prev = -1;
    for (const k of Object.keys(j)) {
      const i = KEYS_SYNC_00023008.indexOf(k);
      assert.ok(i !== -1,
        file + ': ключ «' + k + '» — в канонических KEYS');
      assert.ok(i > prev, file + ': ключ «' + k + '» — канон-порядок');
      prev = i;
    }
    assert.equal(I.slotOf(j), 'torso',
      file + ': slotOf() → "torso" (явное поле)');
  }
});

test('000230.10 T2: append-блок — 25 новых torso: блок 000208–000232 — 25 последовательных файлов каталога с фиксированной нумерацией (D-04); все kind armor + slot torso; редкости РОВНО 10 common / 7 rare / 5 epic / 2 legendary / 1 impossible в каталожном порядке (D-05); id волны не пересекаются с остальным каталогом (краснота: slot torso — 0 предметов, блок 000208–000232 не существует)', () => {
  const { files, byFile } = catalogScan00023008();
  // Ре-пин 000235.09: блок НЕ конец каталога (после него — свитки
  // Тени 000233-000257) — позиция по фиксированной нумерации (D-04),
  // а не files[len−25] (паттерн H1, ре-пины 000235.07/.09).
  const blockFiles = [];
  for (let i = 0; i < 25; i++)
    blockFiles.push(String(208 + i).padStart(6, '0') + '.json');
  const pos = new Map(files.map((f, i) => [f, i]));
  for (const f of blockFiles)
    assert.ok(pos.has(f),
      f + ' — в каталоге (краснота: волна не добавлена)');
  const p0 = pos.get(blockFiles[0]);
  for (let i = 0; i < 25; i++)
    assert.equal(pos.get(blockFiles[i]), p0 + i,
      'блок волны — 25 последовательных файлов каталога; позиция '
      + i + ': ' + blockFiles[i]);
  const tierByPos = (i) => i < 10 ? 'common' : i < 17 ? 'rare'
    : i < 22 ? 'epic' : i < 24 ? 'legendary' : 'impossible';
  for (let i = 0; i < 25; i++) {
    const f = blockFiles[i];
    const it = byFile.get(f);
    assert.equal(it.kind, 'armor', f + ': kind armor');
    assert.equal(it.slot, 'torso',
      f + ': slot torso; факт: ' + it.slot);
    assert.equal(it.rarity, tierByPos(i),
      f + ': rarity ' + tierByPos(i) + ' (каталожный порядок = '
      + 'порядок тиров 10/7/5/2/1); факт: ' + it.rarity);
  }
  // Анти-коллизия: id волны — только в блок-файлах.
  const blockSet = new Set(blockFiles);
  for (const f of files) {
    if (blockSet.has(f)) continue;
    assert.ok(!TORSO_ID_SET_00023010.has(byFile.get(f).id),
      'id волны «' + byFile.get(f).id + '» (' + f
      + ') — вне append-блока (id уникальны в каталоге)');
  }
});

test('000230.10 T3: ростер 25 построчно (§2.1: id/name/kind/slot/rarity/stats.armor (0–4)/weight (0.5–3.5)/value (15–1200)/affixes/set); desc — непустая RU-строка; subtype/tier/effect/loot отсутствуют (у equipment паттерн .08/.09; rarity вместо tier — D3); иконки icon = assets/sprites/items/<id>.svg существуют; 25 svg УНИКАЛЬНЫ по содержимому (краснота: предметов нет)', () => {
  const { byId } = catalogScan00023008();
  const ROOT = path.join(__dirname, '..');
  const seenSvg = new Map();
  for (const [id, name, rarity, armor, weight, value, affixes, set]
      of TORSO_ROSTER_00023010) {
    const it = byId.get(id);
    assert.ok(it, 'предмет "' + id + '" в каталоге (краснота: волна '
      + 'не добавлена)');
    assert.equal(it.name, name, id + ': name');
    assert.equal(it.kind, 'armor', id + ': kind armor');
    assert.equal(it.slot, 'torso', id + ': slot torso');
    assert.equal(it.rarity, rarity, id + ': rarity ' + rarity);
    assert.deepEqual(it.stats, { armor },
      id + ': stats — ровно { armor: ' + armor + ' } (0–4)');
    assert.ok(armor >= 0 && armor <= 4, id + ': armor в 0–4 (ТЗ)');
    assert.equal(it.weight, weight, id + ': weight');
    assert.ok(it.weight >= 0.5 && it.weight <= 3.5,
      id + ': weight ' + it.weight + ' в диапазоне 0.5–3.5 (ТЗ)');
    assert.equal(it.value, value, id + ': value');
    assert.ok(it.value >= 15 && it.value <= 1200,
      id + ': value ' + it.value + ' в диапазоне 15–1200 (ТЗ)');
    assert.deepEqual(it.affixes, affixes, id + ': affixes (§2.1)');
    assert.equal(it.set, set === null ? undefined : set,
      id + ': set ' + (set === null ? 'отсутствует' : '«' + set + '»'));
    assert.equal(typeof it.desc, 'string', id + ': desc — строка');
    assert.ok(it.desc.length > 0, id + ': desc — непустая строка');
    assert.equal(it.subtype, undefined,
      id + ': subtype отсутствует (у armor не бывает)');
    assert.equal(it.tier, undefined,
      id + ': tier отсутствует (редкость — отдельное поле rarity, D3)');
    assert.equal(it.effect, undefined, id + ': effect отсутствует');
    assert.equal(it.loot, undefined,
      id + ': loot отсутствует (loot — только у reagent)');
    assert.equal(it.icon, 'assets/sprites/items/' + id + '.svg',
      id + ': icon = assets/sprites/items/<id>.svg');
    const p = path.join(ROOT, it.icon);
    assert.ok(fs.existsSync(p),
      id + ': svg-файл существует (краснота: иконка не создана)');
    const raw = fs.readFileSync(p, 'utf8');
    for (const [other, otherRaw] of seenSvg) {
      assert.notEqual(raw, otherRaw,
        id + ' и ' + other + ': иконки уникальны (НЕ копии, §2.6)');
    }
    seenSvg.set(id, raw);
  }
});

// Матрица §2.2 (телесная группа, research §6): покрытие 5/6/5/6/4
// (endurance/golem/hide/breath/meditation), Σ 26 skill-записей
// (25 предметов + 1 двойной affix у aegis_mantle) + 2 free_cast.
const SKILL_MATRIX_00023010 = {
  endurance: 5, golem: 6, hide: 5, breath: 6, meditation: 4,
};
// Шкала силы affix по редкости — ТОЧНО значения волны §2.2.
const TORSO_AFFIX_SCALE_00023010 = {
  common: [0.03, 0.05], rare: [0.06, 0.10], epic: [0.15, 0.20],
  legendary: [0.30, 0.32], impossible: [0.35, 0.40],
};
const TORSO_SKILL_GROUP_00023010 = new Set(
  ['endurance', 'golem', 'hide', 'breath', 'meditation']);

test('000230.10 T4: affix-матрица — покрытие 5 телесных skills РОВНО 5/6/5/6/4 (endurance/golem/hide/breath/meditation, §2.2); Σ 26 skill-записей + 2 free_cast = 28; affix-иды ⊆ телесной группы; amounts в шкале редкости §2.2; free_cast — РОВНО 2 (heat_shield + stone_skin), ТОЛЬКО у epic (D-07); skill в live skill-каталоге, spell в assets/spells (краснота: предметов нет)', () => {
  const { byId } = catalogScan00023008();
  const wave = TORSO_IDS_00023010.map((id) => {
    const it = byId.get(id);
    assert.ok(it, 'предмет "' + id + '" в каталоге (краснота: волна '
      + 'не добавлена)');
    return it;
  });
  const coverage = {};
  let skillRecords = 0;
  const freeCast = [];
  const spells = spellIds00023008();
  for (const it of wave) {
    assert.ok(Array.isArray(it.affixes) && it.affixes.length >= 1,
      it.id + ': affixes — непустой массив (у каждого предмета ≥1)');
    for (const a of it.affixes) {
      if (a.type === 'skill') {
        skillRecords += 1;
        assert.ok(TORSO_SKILL_GROUP_00023010.has(a.skill),
          it.id + ': skill «' + a.skill + '» — в телесной группе §2.2');
        assert.ok(SECONDARY_SKILLS[a.skill] !== undefined,
          it.id + ': skill «' + a.skill + '» — в live skill-каталоге');
        coverage[a.skill] = (coverage[a.skill] || 0) + 1;
        const [lo, hi] = TORSO_AFFIX_SCALE_00023010[it.rarity];
        assert.ok(a.amount >= lo && a.amount <= hi,
          it.id + ': amount ' + a.amount + ' в шкале редкости '
          + it.rarity + ' [' + lo + ', ' + hi + '] (§2.2)');
      } else if (a.type === 'free_cast') {
        freeCast.push({ id: it.id, rarity: it.rarity, spell: a.spell });
        assert.ok(spells.has(a.spell),
          it.id + ': spell «' + a.spell + '» — в assets/spells');
      } else {
        assert.fail(it.id + ': неизвестный type affix: ' + a.type);
      }
    }
  }
  assert.equal(skillRecords, 26,
    'Σ skill-записей — ровно 26 (матрица §2.2: 25 предметов + 1 '
    + 'двойной affix у aegis_mantle); факт: ' + skillRecords);
  assert.deepEqual(
    { endurance: coverage.endurance || 0, golem: coverage.golem || 0,
      hide: coverage.hide || 0, breath: coverage.breath || 0,
      meditation: coverage.meditation || 0 },
    SKILL_MATRIX_00023010,
    'покрытие навыков — ровно 5/6/5/6/4 (матрица §2.2); факт: '
    + JSON.stringify(coverage));
  assert.equal(freeCast.length, 2,
    'free_cast — ровно 2 (D-07: 1–2 на волну, только epic); факт: '
    + freeCast.length);
  assert.deepEqual(freeCast.map((f) => f.spell).sort(),
    ['heat_shield', 'stone_skin'],
    'free_cast — ровно heat_shield + stone_skin (§2.2, D-07)');
  for (const f of freeCast) {
    assert.equal(f.rarity, 'epic',
      f.id + ': free_cast — ТОЛЬКО у epic (D-07); факт: ' + f.rarity);
  }
});

// Наборы §2.3: РОВНО 2 (D-08), оба DORMANT (1 слот торса, порог 2
// недостижим до 000230.19 — данные живут).
const TORSO_SETS_00023010 = [
  { set: 'penitent',
    members: ['cloth_sutan', 'wool_sutan', 'pilgrim_sutan'],
    bonus: { 2: { armor: 1 } } },
  { set: 'hearth', members: ['ember_robe', 'stone_robe'],
    bonus: { 2: [{ type: 'skill', skill: 'meditation', amount: 0.05 }] } },
];

test('000230.10 T5: наборы — РОВНО 2: penitent {cloth_sutan, wool_sutan, pilgrim_sutan} / set_bonus {2: {armor: 1}} (stat-объект) и hearth {ember_robe, stone_robe} / {2: [{skill meditation 0.05}]} (affix-массив; НЕ damage); set_bonus ОДИНАКОВОЕ у ВСЕХ участников (D-03); пороги ⊆ {2,3,4}; прочие 21 предмет волны — без set/set_bonus (краснота: предметов нет)', () => {
  const { byId } = catalogScan00023008();
  for (const s of TORSO_SETS_00023010) {
    for (const id of s.members) {
      const it = byId.get(id);
      assert.ok(it, 'предмет "' + id + '" в каталоге (краснота: волна '
        + 'не добавлена)');
      assert.equal(it.set, s.set, id + ': set «' + s.set + '»');
      assert.deepEqual(it.set_bonus, s.bonus,
        id + ': set_bonus (контракт §2.3; ОДИНАКОВОЕ значение для '
        + 'всех участников — D-03)');
    }
    for (const [k, v] of Object.entries(s.bonus)) {
      assert.ok(['2', '3', '4'].includes(k),
        s.set + ': порог «' + k + '» ⊆ {2,3,4}');
      if (Array.isArray(v)) {
        for (const a of v) {
          assert.equal(a.type, 'skill',
            s.set + ': affix-форма set_bonus — type «skill»');
          assert.ok(typeof a.amount === 'number'
              && Number.isFinite(a.amount),
            s.set + ': affix-форма set_bonus — amount число');
        }
      } else if (v && typeof v === 'object') {
        assert.ok(!('damage' in v),
          s.set + ': set_bonus — БЕЗ damage (телесная группа)');
        if ('armor' in v) {
          assert.ok(Number.isFinite(v.armor),
            s.set + ': set_bonus.armor — число');
        }
      } else {
        assert.fail(s.set + ': неизвестная форма set_bonus[' + k + ']');
      }
    }
  }
  const members = new Set(
    TORSO_SETS_00023010.flatMap((s) => s.members));
  for (const id of TORSO_IDS_00023010) {
    const it = byId.get(id);
    assert.ok(it, 'предмет "' + id + '" в каталоге');
    if (!members.has(id)) {
      assert.equal(it.set, undefined,
        id + ': set отсутствует (в волне только 2 набора, D-08)');
      assert.equal(it.set_bonus, undefined, id + ': set_bonus отсутствует');
    }
  }
});

// Минимальная структурная проверка SVG для T6 (well-formedness-full —
// гейт tests/svg.test.js, обход авто-покрывает новые файлы; здесь —
// корень svg + xmlns + viewBox 4 числа + без NaN, паттерн 000120).
function assertSvgTorsoOk(raw, where) {
  const t = raw.trim();
  assert.ok(t.startsWith('<svg'), where + ': корневой элемент <svg>');
  assert.ok(t.includes('xmlns="http://www.w3.org/2000/svg"'),
    where + ': xmlns="http://www.w3.org/2000/svg"');
  const m = /viewBox="([^"]*)"/.exec(t);
  assert.ok(m, where + ': атрибут viewBox');
  const nums = (m[1] || '').split(/[\s,]+/).filter(Boolean);
  assert.equal(nums.length, 4,
    where + ': viewBox — ровно 4 числа; факт: «' + m[1] + '»');
  for (const x of nums) {
    assert.ok(!Number.isNaN(Number(x)),
      where + ': в viewBox нет NaN/Infinity: «' + x + '»');
  }
  assert.ok(t.endsWith('</svg>'), where + ': корневой элемент закрыт');
}

test('000230.10 T6: иконки — 25 SVG assets/sprites/items/<id>.svg существуют, byte-УНИКАЛЬНЫ (НЕ копии, §2.6) и парсятся (корень svg + xmlns + viewBox ровно 4 числа + без NaN, паттерн 000120); 25 id различны и не пересекаются с остальным каталогом (краснота: предметов/иконок нет)', () => {
  const { files, byId, byFile } = catalogScan00023008();
  const ROOT = path.join(__dirname, '..');
  const seen = new Map();
  for (const id of TORSO_IDS_00023010) {
    const it = byId.get(id);
    assert.ok(it, 'предмет "' + id + '" в каталоге (краснота: волна '
      + 'не добавлена)');
    const p = path.join(ROOT, 'assets', 'sprites', 'items', id + '.svg');
    assert.ok(fs.existsSync(p),
      id + ': assets/sprites/items/' + id + '.svg существует '
      + '(краснота: иконка не создана)');
    const raw = fs.readFileSync(p, 'utf8');
    assertSvgTorsoOk(raw, id + '.svg');
    for (const [other, otherRaw] of seen) {
      assert.notEqual(raw, otherRaw,
        id + ' и ' + other + ': иконки byte-уникальны (§2.6)');
    }
    seen.set(id, raw);
  }
  assert.equal(new Set(TORSO_IDS_00023010).size, 25,
    '25 id различны (анти-коллизия в волне)');
  // Ре-пин 000235.09: «остальной каталог» — не files.slice(0, len−25)
  // (после блока 000208-000232 — свитки Тени 000233-000257), а всё
  // вне фиксированной нумерации D-04.
  const blockSet = new Set();
  for (let i = 0; i < 25; i++)
    blockSet.add(String(208 + i).padStart(6, '0') + '.json');
  for (const f of files) {
    if (blockSet.has(f)) continue;
    assert.ok(!TORSO_ID_SET_00023010.has(byFile.get(f).id),
      'id «' + byFile.get(f).id + '» (' + f
      + ') — НЕ пересекается с ростером волны');
  }
});

test('000230.10 T7: порядок ключей JSON — 25 новых + 3 remap: подмножество 17 канонических KEYS sync-items-data.js в канон-порядке (E1b-паттерн: нарушение = неидемпотентная sync-дифф, ловят пины E1b/E20); 3 remap — ровно старые 7 ключей + slot (краснота: файлов волны нет; у 3 броней slot отсутствует)', () => {
  const { byId, fileById } = catalogScan00023008();
  for (const id of TORSO_IDS_00023010) {
    const it = byId.get(id);
    assert.ok(it, 'предмет "' + id + '" в каталоге (краснота: волна '
      + 'не добавлена)');
    const f = fileById.get(id);
    const keys = Object.keys(JSON.parse(
      fs.readFileSync(path.join(ITEMS_DIR, f), 'utf8')));
    assert.ok(keys.length > 0, f + ': файл не пуст');
    let prev = -1;
    for (const k of keys) {
      const i = KEYS_SYNC_00023008.indexOf(k);
      assert.ok(i !== -1,
        f + ': ключ «' + k + '» — в канонических KEYS (краснота: '
        + 'ключа нет в схеме sync)');
      assert.ok(i > prev,
        f + ': ключ «' + k + '» — канон-порядок (E1b-паттерн)');
      prev = i;
    }
  }
  for (const [id, file] of TORSO_REMAP_00023010) {
    const j = JSON.parse(
      fs.readFileSync(path.join(ITEMS_DIR, file), 'utf8'));
    const keys = Object.keys(j);
    assert.deepEqual(keys,
      ['id', 'name', 'kind', 'weight', 'value', 'desc', 'stats',
       'slot'],
      file + ': 7 старых ключей + ровно "slot" (D-01); факт: '
      + keys.join(','));
    let prev = -1;
    for (const k of keys) {
      const i = KEYS_SYNC_00023008.indexOf(k);
      assert.ok(i > prev, file + ': ключ «' + k + '» — канон-порядок');
      prev = i;
    }
  }
});

test('000230.10 T8: все 25 новых — валидны по schema.json (минивалидатор 000015) И зеркало items-data.js ≡ JSON (getItem deepEqual) — регенерация sync сработала; 3 remap — в зеркале бит-в-бит с JSON (краснота: зеркало не регенерировано — записей волны нет)', () => {
  const { fileById } = catalogScan00023008();
  const schema = JSON.parse(
    fs.readFileSync(path.join(ITEMS_DIR, 'schema.json'), 'utf8'));
  for (const id of TORSO_IDS_00023010) {
    const f = fileById.get(id);
    assert.ok(f, 'файл предмета "' + id + '" (краснота: волна не '
      + 'добавлена)');
    const j = JSON.parse(fs.readFileSync(path.join(ITEMS_DIR, f), 'utf8'));
    const errors = validateData(schema, j, f);
    assert.deepEqual(errors, [],
      f + ': валиден по schema.json; факт: ' + errors.join('; '));
    const it = I.getItem(id);
    assert.ok(it, 'зеркало items-data.js: ' + id + ' (краснота: '
      + 'записи нет — зеркало не регенерировано)');
    assert.deepEqual(it, j, f + ': зеркало ≡ JSON');
  }
  for (const [id, file] of TORSO_REMAP_00023010) {
    const j = JSON.parse(
      fs.readFileSync(path.join(ITEMS_DIR, file), 'utf8'));
    const it = I.getItem(id);
    assert.ok(it, 'зеркало items-data.js: ' + id);
    assert.deepEqual(it, j, file + ': зеркало ≡ JSON (remap '
      + 'бит-в-бит, включая "slot":"torso")');
  }
});

// --- Задача 000235.09: волна Тень — 25 свитков 000233–000257 (TDD) ---
//
// Контракт: memory/000235.09-shadow-wave-content.md §1.7. RED: файлы/
// каталожные записи/зеркало отсутствуют (ENOENT / undefined) —
// осмысленно, не синтаксис. Шаблон свитка — дословно 000133+ (kind
// spell_scroll, weight 0.2, value по тьеру, rarity/icon/loot НЕТ).

const SHADOW09_SCROLLS = [
  // [spellId, название, уровень(=тир)]
  ['umbra_bolt', 'Умбровый снаряд', 1],
  ['drain_life', 'Пожизненная сила', 2],
  ['void_arrow', 'Стрела пустоты', 3],
  ['night_strike', 'Ночной удар', 3],
  ['soul_drain', 'Извлечение души', 4],
  ['shadowflame', 'Теневое пламя', 4],
  ['dark_nova', 'Тёмная нова', 4],
  ['shroud', 'Теневая вуаль', 1],
  ['night_blade', 'Ночное лезвие', 2],
  ['vampire_touch', 'Вампирское прикосновение', 3],
  ['fear', 'Страх', 2],
  ['doom_mark', 'Печать дурного предзнаменования', 3],
  ['despair', 'Отчаяние', 3],
  ['shadow_curse', 'Теневое проклятие', 4],
  ['shadow_bind', 'Теневые узы', 2],
  ['nightmare', 'Кошмар', 3],
  ['dark_ensnare', 'Тёмные оковы', 4],
  ['shadow_pool', 'Лужа тьмы', 2],
  ['veil_of_night', 'Покров ночи', 3],
  ['shadow_wraith', 'Теневой виверн', 3],
  ['void_horror', 'Ужас пустоты', 4],
  ['shadow_step', 'Теневой шаг', 1],
  ['invisibility', 'Невидимость', 2],
  ['shroud_of_night', 'Ночной покров', 3],
  ['dark_presence', 'Мрачное присутствие', 1],
];
const SCROLL_VALUE_09 = { 1: 45, 2: 60, 3: 115, 4: 240 };

test('000235.09 W-06: 25 свитков 000233–000257 — id <spell>_scroll, kind spell_scroll, effect {kind:spell, spell:<id>} ∈ каталогу, tier = уровень спелла (ПИН), weight 0.2, name/desc по конвенции, value 45/60/115/240, rarity/icon/loot НЕТ, зеркало ≡ JSON', () => {
  const byFile = new Map();
  for (const f of fs.readdirSync(ITEMS_DIR)
      .filter((x) => /^\d{6}\.json$/.test(x))) {
    byFile.set(f, JSON.parse(
      fs.readFileSync(path.join(ITEMS_DIR, f), 'utf8')));
  }
  const jsById = new Map(I.allItems().map((it) => [it.id, it]));
  const tierCount = {};
  SHADOW09_SCROLLS.forEach(([spellId, name, level], i) => {
    const file = String(233 + i).padStart(6, '0') + '.json';
    const j = byFile.get(file);
    assert.ok(j, 'W-06: ' + file + ' в assets/items (RED: файла нет)');
    assert.equal(j.id, spellId + '_scroll', file + ': id <spell>_scroll');
    assert.equal(j.name, 'Свиток: ' + name,
      spellId + ': name «Свиток: <название>»');
    assert.equal(j.kind, 'spell_scroll', spellId + ': kind spell_scroll');
    assert.equal(j.weight, 0.2, spellId + ': weight 0.2');
    assert.equal(j.desc,
      'Свиток: изучает «' + name + '» (нужен ранг школы.)',
      spellId + ': desc-конвенция');
    assert.deepEqual(j.effect, { kind: 'spell', spell: spellId },
      spellId + ': effect {kind:spell, spell:<id>}');
    assert.ok(SPELLS.SPELLS_BY_ID[spellId],
      spellId + ': effect.spell ∈ каталогу заклинаний (RED: нет)');
    assert.equal(j.tier, level,
      spellId + ': tier = уровень спелла (' + level + ')');
    assert.equal(j.value, SCROLL_VALUE_09[level],
      spellId + ': value по тьеру (' + SCROLL_VALUE_09[level] + ')');
    assert.equal(j.rarity, undefined, spellId + ': rarity НЕТ (пин RAR-G)');
    assert.equal(j.icon, undefined, spellId + ': icon НЕТ (пин I1)');
    assert.equal(j.loot, undefined, spellId + ': loot НЕТ (пин L3)');
    const it = jsById.get(spellId + '_scroll');
    assert.ok(it, 'W-06: зеркало items-data: ' + spellId + '_scroll (RED: нет)');
    assert.deepEqual(it, j, spellId + '_scroll: зеркало ≡ JSON');
    tierCount[level] = (tierCount[level] || 0) + 1;
  });
  assert.deepEqual(tierCount, { 1: 4, 2: 6, 3: 9, 4: 6 },
    'распределение по тирам: T1×4 / T2×6 / T3×9 / T4×6');
});

// =====================================================================
// Задача 000230.11 — предметы «Предплечья»+«Ладони»: 50 (2×10/7/5/2/1)
// + иконки + рецепты. Контентная волна 4 серии 000230 (экипировка); P2.
// Контракт — memory/000230.11-forearms-palms-items-wave.md §2 (ростер
// §2.1, affix-матрица §2.2, наборы §2.3, иконки §2.6; решения D-01–
// D-20 §0). RED (TDD): в каталоге 0 предметов slot 'forearms'/'palms',
// файлов assets/items/000283–000332.json нет, зеркало не
// регенерировано — тесты ниже падают по ОСМЫСЛЕННОЙ причине («волна не
// добавлена» / «нет файлов/иконок/записей»), а не по синтаксису.
// Тесты читают РЕАЛЬНЫЙ каталог (JSON + зеркало), не фикстуры
// (паттерн .08/.09/.10). e2e (T8) — в tests/ui.test.js.
// =====================================================================

// РOSTER §2.1: 50 предметов (forearms 000283–000307 + palms
// 000308–000332; порядок = каталог = тир, D-03).
// [id, name (RU), slot, rarity, stats.armor, weight, value, affixes,
//  set (null — поле нет)]; free_cast — внутри affixes (паттерн .10).
const HANDS_ROSTER_00023011 = [
  ['cloth_cuff', 'Льняная манжета', 'forearms', 'common', 1, 0.2, 10,
   [{ type: 'skill', skill: 'step', amount: 0.03 }], null],
  ['leather_cuff', 'Кожаная манжета', 'forearms', 'common', 1, 0.3, 12,
   [{ type: 'skill', skill: 'swordsman', amount: 0.04 }], 'nimble'],
  ['hemp_bracer', 'Пеньмовый браслет', 'forearms', 'common', 1, 0.3, 15,
   [{ type: 'skill', skill: 'fists', amount: 0.03 }], null],
  ['rough_bracer', 'Грубый браслет', 'forearms', 'common', 1, 0.6, 18,
   [{ type: 'skill', skill: 'heavy', amount: 0.04 }], null],
  ['leather_garter', 'Кожаный гетра', 'forearms', 'common', 1, 0.3, 20,
   [{ type: 'skill', skill: 'archer', amount: 0.04 }], null],
  ['cloth_wrap', 'Тканый бинт', 'forearms', 'common', 1, 0.2, 22,
   [{ type: 'skill', skill: 'thief', amount: 0.05 }], null],
  ['iron_cuff', 'Железная манжета', 'forearms', 'common', 1, 0.5, 25,
   [{ type: 'skill', skill: 'fists', amount: 0.05 }], null],
  ['bone_bracer', 'Костяной браслет', 'forearms', 'common', 1, 0.4, 28,
   [{ type: 'skill', skill: 'thief', amount: 0.04 }], null],
  ['wood_brace', 'Деревянная шина', 'forearms', 'common', 1, 0.4, 30,
   [{ type: 'skill', skill: 'step', amount: 0.04 }], null],
  ['hide_cuff', 'Шкурная манжета', 'forearms', 'common', 1, 0.3, 35,
   [{ type: 'skill', skill: 'archer', amount: 0.05 }], null],
  ['studded_bracer', 'Шипованный браслет', 'forearms', 'rare', 2, 0.5, 55,
   [{ type: 'skill', skill: 'swordsman', amount: 0.06 }], null],
  ['copper_brace', 'Медная шина', 'forearms', 'rare', 2, 0.6, 60,
   [{ type: 'skill', skill: 'heavy', amount: 0.06 }], null],
  ['archer_brace', 'Браслет лучника', 'forearms', 'rare', 1, 0.4, 70,
   [{ type: 'skill', skill: 'archer', amount: 0.08 }], null],
  ['silver_cuff', 'Серебряная манжета', 'forearms', 'rare', 2, 0.5, 80,
   [{ type: 'skill', skill: 'swordsman', amount: 0.07 }], null],
  ['shadow_wrap', 'Теневой бинт', 'forearms', 'rare', 1, 0.3, 85,
   [{ type: 'skill', skill: 'thief', amount: 0.09 }], null],
  ['iron_elbow', 'Железный налокотник', 'forearms', 'rare', 2, 0.8, 90,
   [{ type: 'skill', skill: 'fists', amount: 0.08 }], null],
  ['runic_cuff', 'Рунная манжета', 'forearms', 'rare', 2, 0.5, 100,
   [{ type: 'skill', skill: 'step', amount: 0.10 }], null],
  ['steel_bracers', 'Стальные брандыбурги', 'forearms', 'epic', 3, 1.0, 180,
   [{ type: 'skill', skill: 'swordsman', amount: 0.15 },
    { type: 'free_cast', spell: 'blazing_speed' }], 'blade_guard'],
  ['gold_brace', 'Золотая шина', 'forearms', 'epic', 3, 1.0, 200,
   [{ type: 'skill', skill: 'heavy', amount: 0.16 }], null],
  ['sapphire_bracer', 'Сапфировый браслет', 'forearms', 'epic', 2, 0.8, 220,
   [{ type: 'skill', skill: 'archer', amount: 0.18 }], null],
  ['ghost_cuff', 'Призрачная манжета', 'forearms', 'epic', 2, 0.6, 250,
   [{ type: 'skill', skill: 'thief', amount: 0.17 }], null],
  ['swift_brace', 'Браслет проворства', 'forearms', 'epic', 3, 0.9, 320,
   [{ type: 'skill', skill: 'step', amount: 0.20 }], null],
  ['rune_bracers', 'Рунические брандыбурги', 'forearms', 'legendary', 4,
   1.5, 500, [{ type: 'skill', skill: 'swordsman', amount: 0.30 }], null],
  ['star_armguard', 'Звёздный наруч', 'forearms', 'legendary', 4, 1.5,
   650, [{ type: 'skill', skill: 'fists', amount: 0.32 }], null],
  ['titan_brace', 'Шина Титана', 'forearms', 'impossible', 4, 2.0, 1200,
   [{ type: 'skill', skill: 'heavy', amount: 0.40 },
    { type: 'skill', skill: 'step', amount: 0.35 }], null],
  ['cloth_gloves', 'Тканые перчатки', 'palms', 'common', 1, 0.2, 10,
   [{ type: 'skill', skill: 'archer', amount: 0.03 }], null],
  ['leather_gloves', 'Кожаные перчатки', 'palms', 'common', 1, 0.3, 12,
   [{ type: 'skill', skill: 'swordsman', amount: 0.03 }], 'nimble'],
  ['hide_gloves', 'Шкурные перчатки', 'palms', 'common', 1, 0.3, 15,
   [{ type: 'skill', skill: 'thief', amount: 0.04 }], null],
  ['rough_gauntlets', 'Грубые наручники', 'palms', 'common', 1, 0.6, 18,
   [{ type: 'skill', skill: 'fists', amount: 0.04 }], null],
  ['archer_gloves', 'Перчатки лучника', 'palms', 'common', 1, 0.3, 20,
   [{ type: 'skill', skill: 'archer', amount: 0.05 }], null],
  ['linen_wraps', 'Льняные бинты', 'palms', 'common', 1, 0.2, 22,
   [{ type: 'skill', skill: 'step', amount: 0.04 }], null],
  ['iron_gauntlets', 'Железные наручники', 'palms', 'common', 2, 0.7, 25,
   [{ type: 'skill', skill: 'heavy', amount: 0.05 }], null],
  ['bone_grips', 'Костяные хваты', 'palms', 'common', 1, 0.4, 28,
   [{ type: 'skill', skill: 'swordsman', amount: 0.05 }], null],
  ['wood_guards', 'Деревянные накладки', 'palms', 'common', 1, 0.4, 30,
   [{ type: 'skill', skill: 'fists', amount: 0.03 }], null],
  ['fine_gloves', 'Тонкие перчатки', 'palms', 'common', 1, 0.3, 35,
   [{ type: 'skill', skill: 'step', amount: 0.05 }], null],
  ['studded_gloves', 'Шипованные перчатки', 'palms', 'rare', 2, 0.5, 55,
   [{ type: 'skill', skill: 'swordsman', amount: 0.07 }], null],
  ['copper_gauntlets', 'Медные наручники', 'palms', 'rare', 2, 0.6, 60,
   [{ type: 'skill', skill: 'heavy', amount: 0.07 }], null],
  ['quiver_gloves', 'Перчатки колчана', 'palms', 'rare', 1, 0.4, 70,
   [{ type: 'skill', skill: 'archer', amount: 0.09 }], null],
  ['silver_gauntlets', 'Серебряные наручники', 'palms', 'rare', 2, 0.5, 80,
   [{ type: 'skill', skill: 'fists', amount: 0.08 }], null],
  ['night_gloves', 'Перчатки ночи', 'palms', 'rare', 1, 0.3, 85,
   [{ type: 'skill', skill: 'thief', amount: 0.10 }], null],
  ['iron_wraps', 'Железные обмотки', 'palms', 'rare', 2, 0.7, 90,
   [{ type: 'skill', skill: 'heavy', amount: 0.08 }], null],
  ['wind_gloves', 'Перчатки ветра', 'palms', 'rare', 1, 0.3, 100,
   [{ type: 'skill', skill: 'step', amount: 0.09 }], null],
  ['steel_gauntlets', 'Стальные наручники', 'palms', 'epic', 3, 1.0, 180,
   [{ type: 'skill', skill: 'swordsman', amount: 0.15 },
    { type: 'free_cast', spell: 'invisibility' }], 'blade_guard'],
  ['gold_gloves', 'Золотые перчатки', 'palms', 'epic', 3, 0.9, 200,
   [{ type: 'skill', skill: 'heavy', amount: 0.17 }], null],
  ['emerald_gauntlets', 'Изумрудные наручники', 'palms', 'epic', 2,
   0.8, 220, [{ type: 'skill', skill: 'archer', amount: 0.19 }], null],
  ['phantom_gloves', 'Фантомные перчатки', 'palms', 'epic', 2, 0.5, 250,
   [{ type: 'skill', skill: 'thief', amount: 0.18 }], null],
  ['haste_wraps', 'Обмотки поспешности', 'palms', 'epic', 3, 0.8, 320,
   [{ type: 'skill', skill: 'step', amount: 0.20 }], null],
  ['rune_gauntlets', 'Рунические наручники', 'palms', 'legendary', 4,
   1.5, 500, [{ type: 'skill', skill: 'fists', amount: 0.30 }], null],
  ['star_gloves', 'Звёздные перчатки', 'palms', 'legendary', 4, 1.2, 650,
   [{ type: 'skill', skill: 'archer', amount: 0.32 }], null],
  ['void_gauntlet', 'Наручник Пустоты', 'palms', 'impossible', 4, 2.0,
   1200, [{ type: 'skill', skill: 'thief', amount: 0.40 },
   { type: 'skill', skill: 'step', amount: 0.35 }], null],
];
const HANDS_IDS_00023011 = HANDS_ROSTER_00023011.map((r) => r[0]);
const HANDS_ID_SET_00023011 = new Set(HANDS_IDS_00023011);
// Нумерация (D-01/D-04, append-only): forearms 000283–000307,
// palms 000308–000332; существующий каталог — 000001–000257 (257).
const HANDS_BLOCK_BASE_00023011 = 283;
const HANDS_PREFIX_LEN_00023011 = 257;

test('000230.11 T1: 50 предметов — append-блок 000283–000332 КОНЦОМ каталога (якорь files[len−50]="000283.json", files[len−1]="000332.json" — rebase-робастно: 000235.10 вставит 000258–000282 СРЕДИ, наша 50 остаётся концом, D-03); 50 последовательных; позиции 0–24 slot forearms, 25–49 slot palms (каталожный порядок); редкости forearms-блока РОВНО 10/7/5/2/1 И palms-блока РОВНО 10/7/5/2/1 (пин ×2 — ТЗ); все kind armor; существующие 257 бит-в-бит (append-only: префикс 000001–000257 не сдвинут); id волны не пересекаются с остальным каталогом (краснота: slot forearms/palms — 0 предметов, блока нет)', () => {
  const { files, byFile } = catalogScan00023008();
  // Append-only: существующие 257 файла — префикс каталога, не сдвинуты.
  assert.ok(files.length >= HANDS_PREFIX_LEN_00023011,
    'каталог содержит существующие 257 файлов; факт: ' + files.length);
  for (let i = 0; i < HANDS_PREFIX_LEN_00023011; i++) {
    assert.equal(files[i], String(1 + i).padStart(6, '0') + '.json',
      'позиция ' + (i + 1) + ': существующий файл не сдвинут '
      + '(append-only); факт: ' + files[i]);
  }
  const blockFiles = [];
  for (let i = 0; i < 50; i++)
    blockFiles.push(String(HANDS_BLOCK_BASE_00023011 + i)
      .padStart(6, '0') + '.json');
  const pos = new Map(files.map((f, i) => [f, i]));
  for (const f of blockFiles)
    assert.ok(pos.has(f),
      f + ' — в каталоге (краснота: волна не добавлена)');
  assert.equal(files[files.length - 50], '000283.json',
    'append-якорь: files[len−50] = "000283.json" (D-03); факт: '
    + files[files.length - 50]);
  assert.equal(files[files.length - 1], '000332.json',
    'append-якорь: files[len−1] = "000332.json" (D-03); факт: '
    + files[files.length - 1]);
  const p0 = pos.get(blockFiles[0]);
  for (let i = 0; i < 50; i++)
    assert.equal(pos.get(blockFiles[i]), p0 + i,
      'блок волны — 50 последовательных файлов каталога; позиция '
      + i + ': ' + blockFiles[i]);
  const slotByPos = (i) => (i < 25 ? 'forearms' : 'palms');
  const tierByPos = (i) => {
    const j = i % 25;
    return j < 10 ? 'common' : j < 17 ? 'rare'
      : j < 22 ? 'epic' : j < 24 ? 'legendary' : 'impossible';
  };
  for (let i = 0; i < 50; i++) {
    const f = blockFiles[i];
    const it = byFile.get(f);
    assert.equal(it.kind, 'armor', f + ': kind armor');
    assert.equal(it.slot, slotByPos(i),
      f + ': slot ' + slotByPos(i) + ' (каталожный порядок = forearms-блок '
      + '25, затем palms-блок 25); факт: ' + it.slot);
    assert.equal(it.rarity, tierByPos(i),
      f + ': rarity ' + tierByPos(i) + ' (тировой порядок 10/7/5/2/1 '
      + 'в КАЖДОМ блоке — пин ×2, ТЗ); факт: ' + it.rarity);
  }
  const blockSet = new Set(blockFiles);
  for (const f of files) {
    if (blockSet.has(f)) continue;
    assert.ok(!HANDS_ID_SET_00023011.has(byFile.get(f).id),
      'id волны «' + byFile.get(f).id + '» (' + f
      + ') — вне append-блока (id уникальны в каталоге)');
  }
});

test('000230.11 T2: ростер 50 построчно (§2.1: id/name/kind/slot/rarity/stats.armor (1–4)/weight (0.2–2.0)/value (10–1200)/affixes/set); desc — непустая RU-строка; subtype/tier/effect/loot отсутствуют (у equipment паттерн .08/.09/.10; rarity вместо tier); иконки icon = assets/sprites/items/<id>.svg существуют (краснота: предметов и иконок нет)', () => {
  const { byId } = catalogScan00023008();
  const ROOT = path.join(__dirname, '..');
  for (const [id, name, slot, rarity, armor, weight, value, affixes, set]
      of HANDS_ROSTER_00023011) {
    const it = byId.get(id);
    assert.ok(it, 'предмет "' + id + '" в каталоге (краснота: волна '
      + 'не добавлена)');
    assert.equal(it.name, name, id + ': name');
    assert.equal(it.kind, 'armor', id + ': kind armor');
    assert.equal(it.slot, slot, id + ': slot ' + slot);
    assert.equal(it.rarity, rarity, id + ': rarity ' + rarity);
    assert.deepEqual(it.stats, { armor },
      id + ': stats — ровно { armor: ' + armor + ' }');
    assert.ok(armor >= 1 && armor <= 4,
      id + ': armor ' + armor + ' в диапазоне 1–4 (ТЗ: группа брони рук)');
    assert.equal(it.weight, weight, id + ': weight');
    assert.ok(it.weight >= 0.2 && it.weight <= 2.0,
      id + ': weight ' + it.weight + ' в диапазоне 0.2–2.0 (контракт D-04)');
    assert.equal(it.value, value, id + ': value');
    assert.ok(it.value >= 10 && it.value <= 1200,
      id + ': value ' + it.value + ' в диапазоне 10–1200 (контракт D-04)');
    assert.deepEqual(it.affixes, affixes, id + ': affixes (§2.1)');
    assert.equal(it.set, set === null ? undefined : set,
      id + ': set ' + (set === null ? 'отсутствует' : '«' + set + '»'));
    assert.equal(typeof it.desc, 'string', id + ': desc — строка');
    assert.ok(it.desc.length > 0, id + ': desc — непустая строка');
    assert.equal(it.subtype, undefined,
      id + ': subtype отсутствует (у armor не бывает)');
    assert.equal(it.tier, undefined,
      id + ': tier отсутствует (редкость — отдельное поле rarity)');
    assert.equal(it.effect, undefined, id + ': effect отсутствует');
    assert.equal(it.loot, undefined,
      id + ': loot отсутствует (loot — только у reagent)');
    assert.equal(it.icon, 'assets/sprites/items/' + id + '.svg',
      id + ': icon = assets/sprites/items/<id>.svg');
    assert.ok(fs.existsSync(path.join(ROOT, it.icon)),
      id + ': svg-файл существует (краснота: иконка не создана)');
  }
});

// Матрица §2.2 (группа рук/точности, research §6): покрытие 9/9/8/8/10/8
// (swordsman/archer/heavy/fists/step/thief), Σ 52 skill-записи (50
// предметов + 2 двойных affix у titan_brace/void_gauntlet) + 2
// free_cast (D-06).
const HANDS_SKILL_GROUP_00023011 = new Set(
  ['swordsman', 'archer', 'heavy', 'fists', 'step', 'thief']);
const SKILL_MATRIX_00023011 = {
  swordsman: 9, archer: 9, heavy: 8, fists: 8, step: 10, thief: 8,
};

test('000230.11 T3: affix-матрица — покрытие 6 skills группы рук/точности РОВНО 9/9/8/8/10/8 (swordsman/archer/heavy/fists/step/thief, §2.2); Σ 52 skill-записи (50 предметов + 2 двойных affix: 000307 titan_brace, 000332 void_gauntlet) + 2 free_cast = 54; affix-иды ⊆ группы рук (анти-вылезание); amounts в шкале редкости RARITY_AFFIX_SCALE_00023008; free_cast — РОВНО 2 (blazing_speed + invisibility), ТОЛЬКО у epic (D-06; занятые 6 не дублируются); skill в live skill-каталоге, spell в assets/spells (краснота: предметов нет)', () => {
  const { byId } = catalogScan00023008();
  const wave = HANDS_IDS_00023011.map((id) => {
    const it = byId.get(id);
    assert.ok(it, 'предмет "' + id + '" в каталоге (краснота: волна '
      + 'не добавлена)');
    return it;
  });
  const coverage = {};
  let skillRecords = 0;
  const freeCast = [];
  const spells = spellIds00023008();
  for (const it of wave) {
    assert.ok(Array.isArray(it.affixes) && it.affixes.length >= 1,
      it.id + ': affixes — непустой массив (у каждого предмета ≥1)');
    for (const a of it.affixes) {
      if (a.type === 'skill') {
        skillRecords += 1;
        assert.ok(HANDS_SKILL_GROUP_00023011.has(a.skill),
          it.id + ': skill «' + a.skill + '» — в группе рук/точности §2.2 '
          + '(анти-вылезание)');
        assert.ok(SECONDARY_SKILLS[a.skill] !== undefined,
          it.id + ': skill «' + a.skill + '» — в live skill-каталоге');
        coverage[a.skill] = (coverage[a.skill] || 0) + 1;
        const [lo, hi] = RARITY_AFFIX_SCALE_00023008[it.rarity];
        assert.ok(a.amount >= lo && a.amount <= hi,
          it.id + ': amount ' + a.amount + ' в шкале редкости '
          + it.rarity + ' [' + lo + ', ' + hi + '] (§2.2)');
      } else if (a.type === 'free_cast') {
        freeCast.push({ id: it.id, rarity: it.rarity, spell: a.spell });
        assert.ok(spells.has(a.spell),
          it.id + ': spell «' + a.spell + '» — в assets/spells');
      } else {
        assert.fail(it.id + ': неизвестный type affix: ' + a.type);
      }
    }
  }
  assert.equal(skillRecords, 52,
    'Σ skill-записей — ровно 52 (матрица §2.2: 50 предметов + 2 '
    + 'двойных affix); факт: ' + skillRecords);
  assert.deepEqual(
    { swordsman: coverage.swordsman || 0, archer: coverage.archer || 0,
      heavy: coverage.heavy || 0, fists: coverage.fists || 0,
      step: coverage.step || 0, thief: coverage.thief || 0 },
    SKILL_MATRIX_00023011,
    'покрытие навыков — ровно 9/9/8/8/10/8 (матрица §2.2); факт: '
    + JSON.stringify(coverage));
  assert.equal(freeCast.length, 2,
    'free_cast — ровно 2 (D-06: 1–2 на волну, epic+); факт: '
    + freeCast.length);
  assert.deepEqual(freeCast.map((f) => f.spell).sort(),
    ['blazing_speed', 'invisibility'],
    'free_cast — ровно blazing_speed + invisibility (D-06; занятые '
    + 'mend/light_heal/ward/greater_heal/heat_shield/stone_skin не '
    + 'дублируются)');
  for (const f of freeCast) {
    assert.equal(f.rarity, 'epic',
      f.id + ': free_cast — ТОЛЬКО у epic (D-06); факт: ' + f.rarity);
  }
});

// Наборы §2.3: РОВНО 2, ОБА АКТИВНЫ (D-07): кросс-слот forearms+palms,
// порог 2 достижим в игре (пара надевается одновременно; прецедент
// .09 faith/stage).
const HANDS_SETS_00023011 = [
  { set: 'nimble',
    members: [{ id: 'leather_cuff', slot: 'forearms' },
              { id: 'leather_gloves', slot: 'palms' }],
    bonus: { 2: { armor: 1 } } },
  { set: 'blade_guard',
    members: [{ id: 'steel_bracers', slot: 'forearms' },
              { id: 'steel_gauntlets', slot: 'palms' }],
    bonus: { 2: [{ type: 'skill', skill: 'swordsman', amount: 0.05 }] } },
];

test('000230.11 T4: наборы — РОВНО 2, ОБА АКТИВНЫ (кросс-слот forearms+palms, порог 2, D-07): nimble {leather_cuff (forearms), leather_gloves (palms)} / set_bonus {2: {armor: 1}} (stat-объект) и blade_guard {steel_bracers (forearms), steel_gauntlets (palms)} / {2: [{skill swordsman 0.05}]} (affix-массив; НЕ damage); члены — в РАЗНЫХ слотах (активность); set_bonus ОДИНАКОВОЕ у всех участников (D-03, SB13-совместимо); пороги ⊆ {2,3,4}; прочие 46 предметов волны — без set/set_bonus (краснота: предметов нет)', () => {
  const { byId } = catalogScan00023008();
  const setMembers = new Set();
  for (const s of HANDS_SETS_00023011) {
    for (const m of s.members) {
      const it = byId.get(m.id);
      assert.ok(it, 'предмет "' + m.id + '" в каталоге (краснота: '
        + 'волна не добавлена)');
      assert.equal(it.set, s.set, m.id + ': set «' + s.set + '»');
      assert.equal(it.slot, m.slot,
        m.id + ': slot ' + m.slot + ' (кросс-слотная пара)');
      assert.deepEqual(it.set_bonus, s.bonus,
        m.id + ': set_bonus (контракт §2.3; ОДИНАКОВОЕ значение для '
        + 'всех участников — D-03)');
      setMembers.add(m.id);
    }
    const memberSlots = new Set(s.members.map((m) => m.slot));
    assert.equal(memberSlots.size, s.members.length,
      s.set + ': члены — в РАЗНЫХ слотах (набор АКТИВЕН: порог 2 '
      + 'достижим в игре, D-07)');
    for (const [k, v] of Object.entries(s.bonus)) {
      assert.ok(['2', '3', '4'].includes(k),
        s.set + ': порог «' + k + '» ⊆ {2,3,4}');
      if (Array.isArray(v)) {
        for (const a of v) {
          assert.equal(a.type, 'skill',
            s.set + ': affix-форма set_bonus — type «skill»');
          assert.ok(typeof a.amount === 'number'
              && Number.isFinite(a.amount),
            s.set + ': affix-форма set_bonus — amount число');
        }
      } else if (v && typeof v === 'object') {
        assert.ok(!('damage' in v), s.set + ': set_bonus — БЕЗ damage');
        if ('armor' in v) {
          assert.ok(Number.isFinite(v.armor),
            s.set + ': set_bonus.armor — число');
        }
      } else {
        assert.fail(s.set + ': неизвестная форма set_bonus[' + k + ']');
      }
    }
  }
  for (const id of HANDS_IDS_00023011) {
    const it = byId.get(id);
    assert.ok(it, 'предмет "' + id + '" в каталоге');
    if (!setMembers.has(id)) {
      assert.equal(it.set, undefined,
        id + ': set отсутствует (в волне только 2 набора, D-07)');
      assert.equal(it.set_bonus, undefined, id + ': set_bonus отсутствует');
    }
  }
});

// Минимальная структурная проверка SVG для T5 (well-formedness-full —
// гейт tests/svg.test.js; здесь — корень svg + xmlns + viewBox ровно
// 4 числа + без NaN, паттерн 000120).
function assertSvgHandsOk(raw, where) {
  const t = raw.trim();
  assert.ok(t.startsWith('<svg'), where + ': корневой элемент <svg>');
  assert.ok(t.includes('xmlns="http://www.w3.org/2000/svg"'),
    where + ': xmlns="http://www.w3.org/2000/svg"');
  const m = /viewBox="([^"]*)"/.exec(t);
  assert.ok(m, where + ': атрибут viewBox');
  const nums = (m[1] || '').split(/[\s,]+/).filter(Boolean);
  assert.equal(nums.length, 4,
    where + ': viewBox — ровно 4 числа; факт: «' + m[1] + '»');
  for (const x of nums) {
    assert.ok(!Number.isNaN(Number(x)),
      where + ': в viewBox нет NaN/Infinity: «' + x + '»');
  }
  assert.ok(t.endsWith('</svg>'), where + ': корневой элемент закрыт');
}

test('000230.11 T5: иконки — 50 SVG assets/sprites/items/<id>.svg существуют, byte-УНИКАЛЬНЫ (НЕ копии, §2.6) и парсятся (корень svg + xmlns + viewBox ровно 4 числа + без NaN, паттерн 000120; полный гейт — tests/svg.test.js, sweep 106→156); 50 id различны и не пересекаются с остальным каталогом (краснота: предметов/иконок нет)', () => {
  const { files, byId, byFile } = catalogScan00023008();
  const ROOT = path.join(__dirname, '..');
  const seen = new Map();
  for (const id of HANDS_IDS_00023011) {
    const it = byId.get(id);
    assert.ok(it, 'предмет "' + id + '" в каталоге (краснота: волна '
      + 'не добавлена)');
    const p = path.join(ROOT, 'assets', 'sprites', 'items', id + '.svg');
    assert.ok(fs.existsSync(p),
      id + ': assets/sprites/items/' + id + '.svg существует '
      + '(краснота: иконка не создана)');
    const raw = fs.readFileSync(p, 'utf8');
    assertSvgHandsOk(raw, id + '.svg');
    for (const [other, otherRaw] of seen) {
      assert.notEqual(raw, otherRaw,
        id + ' и ' + other + ': иконки byte-уникальны (§2.6)');
    }
    seen.set(id, raw);
  }
  assert.equal(new Set(HANDS_IDS_00023011).size, 50,
    '50 id различны (анти-коллизия в волне)');
  const blockSet = new Set();
  for (let i = 0; i < 50; i++)
    blockSet.add(String(HANDS_BLOCK_BASE_00023011 + i).padStart(6, '0')
      + '.json');
  for (const f of files) {
    if (blockSet.has(f)) continue;
    assert.ok(!HANDS_ID_SET_00023011.has(byFile.get(f).id),
      'id «' + byFile.get(f).id + '» (' + f
      + ') — НЕ пересекается с ростером волны');
  }
});

test('000230.11 T6: порядок ключей JSON — 50 новых: подмножество 17 канонических KEYS sync-items-data.js в канон-порядке (slot — позиция 13, D-11; E1b-паттерн: нарушение = неидемпотентная sync-дифф, ловят пины E1b/E20) (краснота: файлов волны нет)', () => {
  const { byId, fileById } = catalogScan00023008();
  for (const id of HANDS_IDS_00023011) {
    const it = byId.get(id);
    assert.ok(it, 'предмет "' + id + '" в каталоге (краснота: волна '
      + 'не добавлена)');
    const f = fileById.get(id);
    const keys = Object.keys(JSON.parse(
      fs.readFileSync(path.join(ITEMS_DIR, f), 'utf8')));
    assert.ok(keys.length > 0, f + ': файл не пуст');
    let prev = -1;
    for (const k of keys) {
      const i = KEYS_SYNC_00023008.indexOf(k);
      assert.ok(i !== -1,
        f + ': ключ «' + k + '» — в канонических KEYS (краснота: '
        + 'ключа нет в схеме sync)');
      assert.ok(i > prev,
        f + ': ключ «' + k + '» — канон-порядок (E1b-паттерн)');
      prev = i;
    }
  }
});

test('000230.11 T7: все 50 новых — валидны по schema.json (минивалидатор 000015) И зеркало items-data.js ≡ JSON (getItem deepEqual) — регенерация sync сработала; forearms 25 + palms 25 — 50 записей в зеркале (краснота: зеркало не регенерировано — записей волны нет)', () => {
  const { fileById } = catalogScan00023008();
  const schema = JSON.parse(
    fs.readFileSync(path.join(ITEMS_DIR, 'schema.json'), 'utf8'));
  let nForearms = 0;
  let nPalms = 0;
  for (const id of HANDS_IDS_00023011) {
    const f = fileById.get(id);
    assert.ok(f, 'файл предмета "' + id + '" (краснота: волна не '
      + 'добавлена)');
    const j = JSON.parse(
      fs.readFileSync(path.join(ITEMS_DIR, f), 'utf8'));
    const errors = validateData(schema, j, f);
    assert.deepEqual(errors, [],
      f + ': валиден по schema.json; факт: ' + errors.join('; '));
    const it = I.getItem(id);
    assert.ok(it, 'зеркало items-data.js: ' + id + ' (краснота: записи '
      + 'нет — зеркало не регенерировано)');
    assert.deepEqual(it, j, f + ': зеркало ≡ JSON');
    if (it.slot === 'forearms') nForearms += 1;
    if (it.slot === 'palms') nPalms += 1;
  }
  assert.equal(nForearms, 25,
    'зеркало: 25 forearms-предметов; факт: ' + nForearms);
  assert.equal(nPalms, 25,
    'зеркало: 25 palms-предметов; факт: ' + nPalms);
});

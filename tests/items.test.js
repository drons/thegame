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
    { x: 10, y: 20, type: B.ARMOR_SHOP, w: 2, seed: 3248047078,
      stock: { chainmail: 4, knight_plate: 3 } },
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
    { x: 30, y: 40, type: B.WEAPONS_SHOP, w: 3, seed: 3346526313,
      stock: { iron_sword: 3, steel_sword: 3, hunting_bow: 5, battle_axe: 3, war_hammer: 3, leather_armor: 3, knight_plate: 2, healing_potion: 5, greater_healing: 4, mana_potion: 1, mana_elixir: 1, bread: 3, meat: 3, honey_cake: 1, alchemy_manual: 5, sword_treatise: 4, sulfur: 1, moonstone: 1, phoenix_feather: 2, stone_fist_grimoire: 1, iron_hide_tome: 2, fire_spellbook: 4, ice_spellbook: 2, heavy_tome: 4, archer_scroll: 3, copper_ore: 1, wood_log: 4, stone_chunk: 1, coal: 5, herb_healing: 5, herb_mana: 3, herb_bitter: 5, fireball_scroll: 5, flame_burst_scroll: 2, frost_bolt_scroll: 2, blizzard_scroll: 5, light_heal_scroll: 4, vine_scroll: 3, resurrect_scroll: 5, silver_ore: 5, gold_ore: 4, mithril_ore: 5, quartz: 3, obsidian: 4, phosphorite: 3, ruby: 3, sapphire: 5, emerald: 3, amethyst: 5, berry_red: 3, berry_blue: 5, berry_wild: 3, herb_sun: 3, herb_wind: 4, root_moon: 1, root_ember: 3, root_rock: 3, fruit_apple: 1, fruit_quince: 1, mushroom_grey: 4, mushroom_glow: 3, blueprint_alchemy: 3, blueprint_carving: 3, blueprint_woodwork: 2, blueprint_enchant: 4, blueprint_runecraft: 4 } },
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
  // Ре-пин 000157.01 (Р0): каталог растёт 51 → 62 (добавляются
  // 000052-000062 — руды/минералы/самоцветы); 000051.json остаётся
  // 51-м файлом (append-only, слоты не сдвигаются).
  // Ре-пин 000158.02: каталог растёт 62 → 76 (добавляются
  // 000063-000076 — природные ингредиенты); слоты не сдвигаются.
  // Ре-пин 000232: каталог растёт 76 → 82 (добавляются
  // 000077-000082 — чертежи изучения видов крафта); слоты не сдвигаются.
  assert.equal(files.length, 82,
    'каталог — 82 файла (краснота: ' + files.length
    + ' — каталог ещё не расширен, 000232)');
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
  //     getItem ≡ JSON, каталог — 82 предметов (краснота: записи нет).
  //     Ре-пин 000157.01 (Р0): 51 → 62 (конец каталога).
  //     Ре-пин 000158.02: 62 → 76 (конец каталога).
  //     Ре-пин 000232: 76 → 82 (конец каталога).
  const it = I.getItem('resurrect_scroll');
  assert.ok(it, 'зеркало items-data.js: resurrect_scroll '
    + '(краснота: записи нет)');
  assert.deepEqual(it, j, 'зеркало ≡ JSON');
  assert.equal(I.allItems().length, 82,
    'allItems — 82 предмета (краснота: ' + I.allItems().length
    + ' — зеркало не регенерировано, 000232)');
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
  assert.equal(files.length, 82,
    'каталог — 82 файла (краснота: ' + files.length + ')');
  assert.equal(files[61], '000062.json',
    '000062.json — 62-й файл (краснота: файла нет)');
  assert.equal(I.allItems().length, 82,
    'allItems — 82 предмета (краснота: ' + I.allItems().length + ')');
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

test("000158.02 L3: «самородки» — 14 СУЩЕСТВУЩИХ id несут loot { terrains: [песок], near_mountains: true, frequency по тиру }; ВСЕ ПРОЧИЕ 49 предметов — loot undefined (ре-пин 000232: +6 чертежей; пин «не тронуто»; 5 reagent'ов 000220 — в исключении)", () => {
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
  // ВСЕ ПРОЧИЕ предметы (49 = каталог − 14 самородков − 14 новых
  // − 5 reagent'ов 000220; ре-пин 000232: +6 чертежей без loot):
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
  assert.equal(others, 49, 'прочих предметов — ровно 49 (ре-пин 000232: +6)');
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

test("000211.06 I1: 33 лут-предмета — icon = assets/sprites/loot/<id>.svg (путь = конвенции), svg-файл существует; прочие 43 — icon undefined (ре-пин 000232: +6 чертежей с icon в items/ — в исключении; пин «не тронуто»; 5 reagent'ов 000220 — с loot+icon)", () => {
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
  let others = 0;
  for (const it of byId.values()) {
    if (lootIds.includes(it.id) || BLUEPRINTS_000232.has(it.id)) continue;
    assert.ok(!('icon' in it),
      it.id + ': icon НЕ задан (предмет не тронут, 000211.06)');
    others++;
  }
  assert.equal(others, 43, 'прочих предметов — ровно 43');
  assert.equal(
    [...byId.values()].filter((it) => 'icon' in it).length, 39,
    'icon — ровно у 39 предметов (ре-пин 000232: 33 лут + 6 чертежей; '
    + 'пин: ни больше, ни меньше)');
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
// Гарды (зелёные с первого запуска): E9 (каталог — 76 предметов без
// новых полей), E19 (armor со ВСЕМИ валидными новыми полями — без
// броска, без console.error, поля сохранены), E22 (D4-каталожность —
// в .01 вакуумно: предметов с affixes нет).

const EQUIP_FIELDS_00023001 = new Set();
// .10/.12 заполнят (remap существующих 000001-000010 += slot; паттерн
// исключения REAGENTS_000220).

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

test('000230.01 E9 (ГАРД): каталог — ровно 82 предмета (ре-пин 000232: +6 чертежей), у НОЛЬ предметов есть ЛЮБОЕ из slot/rarity/set/affixes (пин «существующие предметы не меняются», ТЗ «Что сделать» 4)', () => {
  const items = I.allItems();
  assert.equal(items.length, 82, 'каталог — ровно 82 предмета');
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
  assert.equal(others, 82, 'прочих предметов — ровно 82 (ре-пин 000232: '
    + 'в .01 исключений нет, +6 чертежей без equip-полей)');
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
    'armor БЕЗ slot → torso (фолбэк)');
  assert.equal(I.slotOf(I.getItem('healing_potion')), null,
    'potion → null (не экипировка)');
  assert.equal(I.slotOf({ kind: 'armor', slot: 'head' }), 'head',
    'явный slot в приоритете над фолбэком kind-а');
});

test('000230.02 M2 (vm): equip по части тела — armor slot head → eq.head; shield → left_hand; tool → right_hand; ring → первый пустой ring-слот; weapon/armor БЕЗ slot (реальные wood_sword/leather_armor) → right_hand/torso; ответ {ok, slot: физический, item}', () => {
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
    'armor БЕЗ slot → torso (пин ТЗ: JSON предметов не меняется)');
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

test('000230.02 M11 (vm): equip с заменой тяжёлого на лёгкое при инвентаре у лимита веса — note-ветка (вернуть старое не удалось) синхронизирует зеркала: weapon ≡ right_hand (D-01 — ВСЕГДА синхронны); потеря старого предмета — пин ПРЕСУЩЕСТВУЮЩЕГО поведения', () => {
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
  assert.equal(r.ok, true, 'новая копия легче — экипирование проходит');
  assert.match(r.note, /war_hammer/);
  assert.match(r.note, /тяжело/);
  assert.equal(G.totalQty(c, 'war_hammer'), 0,
    'старый предмет потерян — пресуществующее поведение, НЕ регрессия');
  assert.equal(c.equipment.right_hand, 'wood_sword');
  assert.equal(c.equipment.weapon, 'wood_sword',
    'краснота: note-ветка уходила без syncEquipmentMirrors — '
    + 'зеркало weapon застревало на старом предмете (D-01)');
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

test('000230.04-SB13 (ГАРД, E22-паттерн, node, I.allItems()): предметы с ОДНИМ set → set_bonus deepEqual внутри набора (в .04 вакуумно: 0 предметов с set); предметов с set_bonus — РОВНО 0 (пин «контента нет»; .08 — ре-пин числа + реальный кросс-пин; зелёный с начала)', () => {
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
  assert.equal(withSetBonus, 0,
    'предметов с set_bonus — 0 (контента нет; .08 — ре-пин)');
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

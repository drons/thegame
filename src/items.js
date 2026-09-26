// Предметы, инвентарь, вес, быстрые слоты, снаряжение и торговля
// (задача 000009, SPEC.md — раздел «Предметы»).
//
// Каталог: assets/items/*.json (source of truth, схема —
// assets/items/schema.json); JS-фолбэк для file:// — src/items-data.js.
// Консистентность фолбэка с JSON проверяют тесты (tests/items.test.js).
//
// Чистое ядро без DOM — тестируется в node (tests/items.test.js).
// Униформный модуль: в браузере — globalThis.Game, в node — require().
// Зависимости: perlin.js (hash2/mulberry32), player.js (derived/heal),
// items-data.js (каталог), map.js (типы построек).

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('./perlin.js'),
      require('./player.js'),
      require('./items-data.js'),
      require('./map.js'));
  } else {
    const G0 = typeof root.Game === 'object' ? root.Game : {};
    root.Game = Object.assign({}, G0, factory(G0, G0, { ITEMS: G0.ITEMS }, G0));
  }
})(typeof globalThis !== 'undefined' ? globalThis : self, function (perlin, P, DATA, mapmod) {

  const hash2 = perlin.hash2;
  const mulberry32 = perlin.mulberry32;

  // --- Типы предметов (SPEC.md, «Предметы») ---
  const ITEM_KINDS = {
    WEAPON: 'weapon', ARMOR: 'armor', POTION: 'potion',
    FOOD: 'food', SKILL_BOOK: 'skill_book', REAGENT: 'reagent',
  };
  const WEAPON_SUBTYPES = { SWORD: 'sword', BOW: 'bow', HEAVY: 'heavy' };
  const EFFECT_KINDS = { HEAL: 'heal', MP: 'mp', EAT: 'eat', SKILL_XP: 'skill_xp' };

  // Параметры инвентаря и веса.
  const INVENTORY_SLOTS = 20;   // слоты инвентаря
  const QUICK_SLOTS = 3;        // закреплённые «быстрые» слоты для боя
  const MAX_STACK = 99;         // размер стопки в одном слоте (складываемые)
  const BASE_CARRY_WEIGHT = 30; // базовый переносимый вес, кг

  // Складываются в стопку: расходники; оружие и броня — по одному на слот.
  const STACKABLE = new Set(['potion', 'food', 'skill_book', 'reagent']);

  // --- Каталог: семантическая валидация при загрузке модуля ---
  // (структурная валидация по schema.json — задача 000015).

  function validateItem(it) {
    const idOk = typeof it.id === 'string' && /^[a-z][a-z0-9_]*$/.test(it.id);
    if (!idOk) throw new Error('предмет: неверный id: ' + it.id);
    if (typeof it.name !== 'string' || !it.name) throw new Error(it.id + ': нет имени');
    if (!Object.values(ITEM_KINDS).includes(it.kind)) throw new Error(it.id + ': неизвестный тип: ' + it.kind);
    if (typeof it.weight !== 'number' || it.weight <= 0) throw new Error(it.id + ': неверный вес');
    if (typeof it.value !== 'number' || it.value < 1) throw new Error(it.id + ': неверная цена');
    if (it.kind === 'weapon') {
      if (!['sword', 'bow', 'heavy'].includes(it.subtype)) {
        throw new Error(it.id + ': у оружия нужен подтип sword|bow|heavy');
      }
      if (!(it.stats && it.stats.damage >= 1)) throw new Error(it.id + ': у оружия нужен stats.damage');
    }
    if (it.kind === 'armor' && !(it.stats && it.stats.armor >= 0)) {
      throw new Error(it.id + ': у брони нужен stats.armor');
    }
    if (it.kind === 'potion' || it.kind === 'food' || it.kind === 'skill_book') {
      const e = it.effect;
      if (!e || !e.kind) throw new Error(it.id + ': нужен effect.kind');
      if ((it.kind === 'potion' && !['heal', 'mp'].includes(e.kind)) ||
          (it.kind === 'food' && e.kind !== 'eat') ||
          (it.kind === 'skill_book' && e.kind !== 'skill_xp')) {
        throw new Error(it.id + ': эффект не подходит типу предмета');
      }
      if (typeof e.amount !== 'number' || e.amount < 1) throw new Error(it.id + ': неверный effect.amount');
      if (it.kind === 'skill_book' && !P.SECONDARY_SKILLS[e.skill]) {
        throw new Error(it.id + ': книга на неизвестный навык: ' + e.skill);
      }
    }
    if (it.kind === 'reagent' && it.effect) throw new Error(it.id + ': у реагента не бывает effect');
  }

  const catalog = new Map();
  for (const it of DATA.ITEMS) {
    validateItem(it);
    if (catalog.has(it.id)) throw new Error('дублируется id предмета: ' + it.id);
    catalog.set(it.id, it);
  }

  function getItem(id) { return catalog.get(id) || null; }
  function allItems() { return Array.from(catalog.values()); }
  function itemsOfKind(kind) { return allItems().filter((it) => it.kind === kind); }

  // --- Инвентарь ---
  // slots: [{ id, qty }], quick: (itemId|null)[] — закреплённые быстрые слоты.

  function createInventory() {
    return { slots: [], quick: new Array(QUICK_SLOTS).fill(null) };
  }

  function ensureInventory(c) {
    if (!c.inventory) c.inventory = createInventory();
    if (!Array.isArray(c.inventory.quick) || c.inventory.quick.length !== QUICK_SLOTS) {
      c.inventory.quick = new Array(QUICK_SLOTS).fill(null);
    }
    return c.inventory;
  }

  function ensureEquipment(c) {
    if (!c.equipment) c.equipment = { weapon: null, armor: null };
    return c.equipment;
  }

  // Вес содержимого инвентаря (кг).
  function inventoryWeight(c) {
    const inv = ensureInventory(c);
    return inv.slots.reduce((s, e) => s + (getItem(e.id).weight || 0) * e.qty, 0);
  }

  // Максимальный вес: база × «Крепкая спина» (+10% за уровень, player.js).
  function maxCarryWeight(c) {
    return BASE_CARRY_WEIGHT * P.derived(c).carryWeightMult;
  }

  function slotCount(c) { return ensureInventory(c).slots.length; }

  function totalQty(c, itemId) {
    const inv = ensureInventory(c);
    return inv.slots.reduce((s, e) => (e.id === itemId ? s + e.qty : s), 0);
  }

  function hasItem(c, itemId, qty = 1) {
    return totalQty(c, itemId) >= qty;
  }

  /**
   * Добавляет предмет(ы) в инвентарь.
   * Проверяет свободные слоты и лимит веса (Крепкая спина).
   * @returns {{ok:boolean, reason?:string}}
   */
  function addItem(c, itemId, qty = 1) {
    const it = getItem(itemId);
    if (!it) return { ok: false, reason: 'неизвестный предмет: ' + itemId };
    if (!Number.isInteger(qty) || qty < 1) return { ok: false, reason: 'неверное количество' };
    const inv = ensureInventory(c);
    const stackable = STACKABLE.has(it.kind);

    // Сколько новых слотов понадобится (с учётом заполнения стопок).
    let left = qty;
    if (stackable) {
      for (const e of inv.slots) {
        if (e.id === itemId) left = Math.max(0, left - (MAX_STACK - e.qty));
      }
      const newSlots = Math.ceil(left / MAX_STACK);
      if (inv.slots.length + newSlots > INVENTORY_SLOTS) {
        return { ok: false, reason: 'нет свободных слотов инвентаря' };
      }
    } else if (inv.slots.length + qty > INVENTORY_SLOTS) {
      return { ok: false, reason: 'нет свободных слотов инвентаря' };
    }
    if (inventoryWeight(c) + it.weight * qty > maxCarryWeight(c) + 1e-9) {
      return { ok: false, reason: 'слишком тяжело (лимит веса)' };
    }

    // Заполняем существующие стопки, остаток — в новые слоты.
    let rest = qty;
    if (stackable) {
      for (const e of inv.slots) {
        if (e.id !== itemId) continue;
        const take = Math.min(rest, MAX_STACK - e.qty);
        e.qty += take;
        rest -= take;
      }
    }
    while (rest > 0) {
      const n = stackable ? Math.min(rest, MAX_STACK) : 1;
      inv.slots.push({ id: itemId, qty: n });
      rest -= n;
    }
    return { ok: true };
  }

  /**
   * Убирает предмет(ы) из инвентаря (снаряжение — через unequip).
   * @returns {{ok:boolean, reason?:string}}
   */
  function removeItem(c, itemId, qty = 1) {
    const it = getItem(itemId);
    if (!it) return { ok: false, reason: 'неизвестный предмет: ' + itemId };
    if (!Number.isInteger(qty) || qty < 1) return { ok: false, reason: 'неверное количество' };
    // Все или ничего: не хватает — инвентарь не трогаем.
    if (totalQty(c, itemId) < qty) return { ok: false, reason: 'не хватает: ' + it.name };
    const inv = ensureInventory(c);
    let left = qty;
    for (let i = inv.slots.length - 1; i >= 0 && left > 0; i--) {
      const e = inv.slots[i];
      if (e.id !== itemId) continue;
      const take = Math.min(e.qty, left);
      e.qty -= take;
      left -= take;
      if (e.qty === 0) inv.slots.splice(i, 1);
    }
    if (left > 0) return { ok: false, reason: 'не хватает: ' + it.name };
    // Пустые быстрые слоты на удалённый предмет очищаем.
    for (let i = 0; i < inv.quick.length; i++) {
      if (inv.quick[i] === itemId && totalQty(c, itemId) === 0) inv.quick[i] = null;
    }
    return { ok: true };
  }

  // --- Быстрые слоты (закреплённые для действий в бою) ---

  function setQuick(c, slot, itemId) {
    const inv = ensureInventory(c);
    if (!Number.isInteger(slot) || slot < 0 || slot >= QUICK_SLOTS) {
      return { ok: false, reason: 'неверный быстрый слот' };
    }
    if (itemId != null && !hasItem(c, itemId)) {
      return { ok: false, reason: 'предмета нет в инвентаре' };
    }
    inv.quick[slot] = itemId || null;
    return { ok: true };
  }

  function clearQuick(c, slot) {
    const inv = ensureInventory(c);
    if (!Number.isInteger(slot) || slot < 0 || slot >= QUICK_SLOTS) {
      return { ok: false, reason: 'неверный быстрый слот' };
    }
    inv.quick[slot] = null;
    return { ok: true };
  }

  function quickItem(c, slot) {
    const inv = ensureInventory(c);
    return (slot >= 0 && slot < QUICK_SLOTS) ? inv.quick[slot] : null;
  }

  // Первый занятый быстрый слот (null, если все пусты).
  function firstQuickSlot(c) {
    const inv = ensureInventory(c);
    for (let i = 0; i < inv.quick.length; i++) {
      if (inv.quick[i]) return i;
    }
    return null;
  }

  // Первый свободный быстрый слот (null, если заняты все).
  function freeQuickSlot(c) {
    const inv = ensureInventory(c);
    for (let i = 0; i < inv.quick.length; i++) {
      if (!inv.quick[i]) return i;
    }
    return null;
  }

  // --- Применение предметов ---

  /**
   * Опыт навыка от книг (практика; потолок практикой и превращение
   * опыта в уровни — задача 000013).
   */
  function addSkillXp(c, skillId, amount) {
    if (!P.SECONDARY_SKILLS[skillId]) return { ok: false, reason: 'неизвестный навык' };
    if (typeof amount !== 'number' || amount < 1) return { ok: false, reason: 'неверный опыт' };
    c.skillXp = c.skillXp || {};
    c.skillXp[skillId] = (c.skillXp[skillId] || 0) + amount;
    return { ok: true, skill: skillId, amount, total: c.skillXp[skillId] };
  }

  /**
   * Использует предмет из инвентаря (зелья, еда, книги).
   * Зелья — «Алхимик» (+5%/ур.), еда — «Сердце природы» (+5%/ур.).
   * @returns {{ok:boolean, reason?:string, message?:string, hp?:number, mp?:number, skill?:object}}
   */
  function useItem(c, itemId, qty = 1) {
    const it = getItem(itemId);
    if (!it) return { ok: false, reason: 'неизвестный предмет: ' + itemId };
    if (!hasItem(c, itemId, qty)) return { ok: false, reason: 'предмета нет в инвентаре' };
    if (it.kind === 'weapon' || it.kind === 'armor') {
      return { ok: false, reason: it.kind === 'weapon' ? 'оружие — экипируется' : 'броня — экипируется' };
    }
    if (it.kind === 'reagent') return { ok: false, reason: 'реагент нельзя применить (торговый товар)' };

    const d = P.derived(c);
    let hp = 0, mp = 0, skill = null;
    for (let n = 0; n < qty; n++) {
      const e = it.effect;
      if (it.kind === 'potion' && e.kind === 'heal') {
        const amt = Math.round(e.amount * d.potionPowerMult);
        P.heal(c, amt);
        hp += amt;
      } else if (it.kind === 'potion' && e.kind === 'mp') {
        const amt = Math.round(e.amount * d.potionPowerMult);
        const before = c.mp;
        c.mp = Math.min(d.maxMP, c.mp + amt);
        mp += c.mp - before;
      } else if (it.kind === 'food') {
        const amt = Math.round(e.amount * d.foodPowerMult);
        P.heal(c, amt);
        hp += amt;
      } else if (it.kind === 'skill_book') {
        skill = addSkillXp(c, e.skill, e.amount);
      }
    }
    removeItem(c, itemId, qty);

    const parts = [];
    if (hp) parts.push('+' + hp + ' HP');
    if (mp) parts.push('+' + mp + ' MP');
    if (skill && skill.ok) {
      const name = P.SECONDARY_SKILLS[skill.skill].name;
      parts.push(name + ': +' + skill.amount + ' опыта навыка');
    }
    return {
      ok: true, name: it.name, hp: hp || undefined, mp: mp || undefined,
      skill: skill || undefined,
      message: it.name + ': ' + parts.join(', '),
    };
  }

  // --- Снаряжение (оружие и броня) ---

  /**
   * Экипирует оружие/броню из инвентаря (текущее возвращается обратно).
   */
  function equip(c, itemId) {
    const it = getItem(itemId);
    if (!it) return { ok: false, reason: 'неизвестный предмет: ' + itemId };
    const eq = ensureEquipment(c);
    const slot = it.kind === 'weapon' ? 'weapon' : it.kind === 'armor' ? 'armor' : null;
    if (!slot) return { ok: false, reason: 'такое не экипируется' };
    if (eq[slot] === itemId) return { ok: false, reason: 'уже экипировано' };
    if (!hasItem(c, itemId)) return { ok: false, reason: 'предмета нет в инвентаре' };
    const prev = eq[slot];
    eq[slot] = itemId;
    removeItem(c, itemId);
    if (prev) {
      const back = addItem(c, prev);
      if (!back.ok) return { ok: true, note: 'вернуть ' + prev + ' не удалось: ' + back.reason };
    }
    return { ok: true, slot, item: itemId };
  }

  /**
   * Снимает снаряжение обратно в инвентарь.
   * @param {'weapon'|'armor'} slot
   */
  function unequip(c, slot) {
    const eq = ensureEquipment(c);
    const id = eq[slot];
    if (!id) return { ok: false, reason: 'ничего не экипировано' };
    eq[slot] = null;
    const r = addItem(c, id);
    if (!r.ok) {
      eq[slot] = id; // некуда положить — остаётся надетым
      return r;
    }
    return { ok: true, item: id };
  }

  /**
   * Боевые характеристики снаряжения (для combat.js):
   * { damage, subtype, hitBonus, dmgBonus, armor }.
   */
  function equipmentStats(c) {
    const eq = ensureEquipment(c);
    const d = P.derived(c);
    const out = { damage: 0, subtype: null, hitBonus: 0, dmgBonus: 0, armor: 0 };
    if (eq.weapon) {
      const it = getItem(eq.weapon);
      if (it) {
        out.damage = it.stats.damage;
        out.subtype = it.subtype;
        if (it.subtype === 'sword') out.hitBonus = d.swordHitBonus;
        else if (it.subtype === 'bow') {
          out.hitBonus = d.archerHitBonus;
          out.dmgBonus = d.rangedDamageBonus;
        } else if (it.subtype === 'heavy') out.dmgBonus = d.heavyDamageBonus;
      }
    }
    if (eq.armor) {
      const it = getItem(eq.armor);
      if (it && it.stats && it.stats.armor) out.armor = it.stats.armor;
    }
    return out;
  }

  // --- Торговля (SPEC.md, «Постройки» → «Магазины») ---
  // Цена = стоимость предмета × богатство постройки × навык «Торговец».
  // Богатство 0-3: −10% цена покупки за уровень, +15% цена продажи.
  // «Торговец»: −5% покупка, +5% продажа за уровень (player.js).

  const BUY_WEALTH_MULT = 0.10;
  const SELL_WEALTH_MULT = 0.15;

  // Тип постройки → типы предметов в ассортименте (map.js BUILDING_TYPES).
  function shopKindsFor(buildingType) {
    const B = mapmod.BUILDING_TYPES;
    if (buildingType === B.WEAPONS_SHOP) return ['weapon'];
    if (buildingType === B.ARMOR_SHOP) return ['armor'];
    if (buildingType === B.APOTHECARY) return ['potion', 'food'];
    if (buildingType === B.MAGIC_SHOP) return ['reagent', 'skill_book'];
    if (buildingType === B.TAVERN) return ['food', 'potion'];
    return null; // не магазин
  }

  /**
   * Магазин постройки: детерминированный ассортимент из координат,
   * типа постройки и богатства. Не магазин — null.
   * @returns {null|{x,y,buildingType,wealth,stock:{itemId:qty}}}
   */
  function makeShop(x, y, buildingType, wealth) {
    const kinds = shopKindsFor(buildingType);
    if (!kinds) return null;
    wealth = Math.max(0, Math.min(3, Math.floor(wealth || 0)));
    const seed = (hash2(x, y, 0x154075) ^ (buildingType + 1)) >>> 0;
    const rng = mulberry32(seed);
    // Универсам (богатство 3) — смесь всего (SPEC: «Универсам»).
    const pool = wealth === 3 ? allItems() : allItems().filter((it) => kinds.includes(it.kind));
    const stock = {};
    for (const it of pool) {
      if (rng() < 0.55 + 0.1 * wealth) {
        stock[it.id] = 1 + Math.floor(rng() * (2 + wealth));
      }
    }
    if (!Object.keys(stock).length) stock[pool[0].id] = 1; // магазин не пуст
    return { x, y, buildingType, wealth, stock, seed };
  }

  /** Цена покупки (за 1 шт.) в магазине. */
  function buyPrice(shop, itemId, c) {
    const it = getItem(itemId);
    if (!it) return null;
    const d = P.derived(c);
    return Math.max(1, Math.round(it.value * (1 - BUY_WEALTH_MULT * shop.wealth) * d.buyPriceMult));
  }

  /** Цена продажи (за 1 шт.) в магазине. */
  function sellPrice(shop, itemId, c) {
    const it = getItem(itemId);
    if (!it) return null;
    const d = P.derived(c);
    return Math.max(1, Math.round(it.value * (1 + SELL_WEALTH_MULT * shop.wealth) * d.sellPriceMult));
  }

  /** Покупка предмета в магазине. */
  function buyItem(shop, c, itemId, qty = 1) {
    const it = getItem(itemId);
    if (!it) return { ok: false, reason: 'неизвестный предмет: ' + itemId };
    const have = (shop.stock && shop.stock[itemId]) || 0;
    if (have < qty) return { ok: false, reason: 'нет в наличии' };
    const price = buyPrice(shop, itemId, c) * qty;
    if (c.gold < price) return { ok: false, reason: 'мало золота (нужно ' + price + ')' };
    const add = addItem(c, itemId, qty);
    if (!add.ok) return { ok: false, reason: add.reason };
    c.gold -= price;
    shop.stock[itemId] = have - qty;
    return { ok: true, item: itemId, qty, price };
  }

  /** Продажа предмета из инвентаря магазину (экипированное — нет). */
  function sellItem(shop, c, itemId, qty = 1) {
    const it = getItem(itemId);
    if (!it) return { ok: false, reason: 'неизвестный предмет: ' + itemId };
    const kinds = shopKindsFor(shop.buildingType);
    if (!kinds.includes(it.kind)) {
      return { ok: false, reason: 'магазин не скупает такие предметы' };
    }
    if (!hasItem(c, itemId, qty)) return { ok: false, reason: 'предмета нет в инвентаре' };
    const price = sellPrice(shop, itemId, c) * qty;
    removeItem(c, itemId, qty);
    c.gold += price;
    return { ok: true, item: itemId, qty, price };
  }

  return {
    ITEM_KINDS, WEAPON_SUBTYPES, EFFECT_KINDS,
    INVENTORY_SLOTS, QUICK_SLOTS, MAX_STACK, BASE_CARRY_WEIGHT,
    BUY_WEALTH_MULT, SELL_WEALTH_MULT,
    getItem, allItems, itemsOfKind,
    createInventory, ensureInventory, ensureEquipment,
    inventoryWeight, maxCarryWeight, slotCount, totalQty, hasItem,
    addItem, removeItem,
    setQuick, clearQuick, quickItem, firstQuickSlot, freeQuickSlot,
    addSkillXp, useItem,
    equip, unequip, equipmentStats,
    shopKindsFor, makeShop, buyPrice, sellPrice, buyItem, sellItem,
  };
});

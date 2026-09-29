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
// items-data.js (каталог), map.js (типы построек), buildings.js
// (каталог построек — источник видов ассортимента магазинов, 000060;
// в браузере грузится ПОСЛЕ items.js — доступ ленивый, см.
// buildingsCatalogRef).

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('./perlin.js'),
      require('./player.js'),
      require('./items-data.js'),
      require('./map.js'),
      require('./buildings.js'));
  } else {
    const G0 = typeof root.Game === 'object' ? root.Game : {};
    root.Game = Object.assign({}, G0,
      factory(G0, G0, { ITEMS: G0.ITEMS }, G0, null, root));
  }
})(typeof globalThis !== 'undefined' ? globalThis : self, function (perlin, P, DATA, mapmod, bld, rootRef) {

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

  // --- Бонус качества (задача 000046, SPEC.md «Крафт») ---
  // Слот с бонусом качества (поле bonus: {damage}|{armor}|{amount}) —
  // отдельный экземпляр предмета: не сливается с обычной стопкой того
  // же id и не заполняется обычной addItem (и наоборот).
  // Допустимый ключ бонуса — только ГЛАВНЫЙ стат kind-а:
  //   weapon → damage, armor → armor, potion/food → amount.
  // У реагентов и книг бонуса нет.

  function bonusKeyFor(it) {
    if (it.kind === 'weapon') return 'damage';
    if (it.kind === 'armor') return 'armor';
    if (it.kind === 'potion' || it.kind === 'food') return 'amount';
    return null;
  }

  // Валидный бонус для предмета: null/undefined — «без бонуса» (валидно),
  // объект — ровно один допустимый для kind-а ключ, целое значение >= 1.
  function validBonus(it, b) {
    if (b === null || b === undefined) return true;
    if (!b || typeof b !== 'object' || Array.isArray(b)) return false;
    const key = bonusKeyFor(it);
    if (!key) return false;
    const keys = Object.keys(b);
    return keys.length === 1 && keys[0] === key &&
      Number.isInteger(b[key]) && b[key] >= 1;
  }

  // Каноническая «состояние» бонуса слота (для сравнения/слияния):
  // бонус — одноключевой объект, так что «ключ:значение» однозначно.
  function bonusState(b) {
    if (!b) return null;
    const k = Object.keys(b)[0];
    return k + ':' + b[k];
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

  // Бонус качества надетого снаряжения (задача 000046):
  // {weapon: {damage:N}|null, armor: {armor:N}|null}.
  function ensureEquipmentBonus(c) {
    if (!c.equipmentBonus || typeof c.equipmentBonus !== 'object' ||
        Array.isArray(c.equipmentBonus)) {
      c.equipmentBonus = { weapon: null, armor: null };
    }
    if (c.equipmentBonus.weapon === undefined) c.equipmentBonus.weapon = null;
    if (c.equipmentBonus.armor === undefined) c.equipmentBonus.armor = null;
    return c.equipmentBonus;
  }

  /**
   * Чистка сохранённого инвентаря (восстановление сейва, задачи
   * 000029/000031): «битый сейв не роняет игру». Сейв живёт в
   * localStorage между сборками игры, поэтому:
   *   * слоты с id, УДАЛЁННЫМ из каталога («призраки» после апдейта
   *     данных — тот же сценарий, что «призрак»-предметы в
   *     restoreNpcStocks), отбрасываются;
   *   * записи не того формата (null, не-объект, нецелое/отрицательное
   *     qty) отбрасываются; qty клэмпится в [1, MAX_STACK], дубликаты
   *     одного id сливаются (лишнее — не больше MAX_STACK);
   *   * слотов не больше INVENTORY_SLOTS, quick — только id, которые
   *     есть в каталоге (иначе — null).
   * Возвращает НОВЫЙ инвентарь (вход не мутируется).
   * @param {object} inv инвентарь из сейва
   * @returns {{slots: {id: string, qty: number}[], quick: (string|null)[]}}
   */
  function sanitizeInventory(inv) {
    const out = createInventory();
    if (!inv || typeof inv !== 'object' || Array.isArray(inv)) return out;
    if (Array.isArray(inv.slots)) {
      for (const e of inv.slots) {
        if (!e || typeof e !== 'object' || Array.isArray(e)) continue;
        const it = getItem(e.id);
        if (!it) continue; // «призрак» — предмета нет в каталоге
        const qty = (Number.isInteger(e.qty) && e.qty >= 1) ? e.qty : 1;
        // Бонус качества (задача 000046): валидный для kind-а —
        // сохраняется; невалидный (чужой ключ, нецелое/отрицательное) —
        // отбрасывается, сам слот остаётся.
        const bonus = validBonus(it, e.bonus) ? (e.bonus || null) : null;
        // Слияние — только в стопку с тем же id И тем же состоянием
        // бонуса: bonus-слот не сливается с обычной стопкой.
        const st = bonusState(bonus);
        const ex = out.slots.find(
          (x) => x.id === it.id && bonusState(x.bonus) === st);
        if (ex) {
          ex.qty = Math.min(MAX_STACK, ex.qty + qty);
        } else if (out.slots.length < INVENTORY_SLOTS) {
          out.slots.push(bonus
            ? { id: it.id, qty: Math.min(qty, MAX_STACK), bonus }
            : { id: it.id, qty: Math.min(qty, MAX_STACK) });
        }
      }
    }
    if (Array.isArray(inv.quick)) {
      for (let i = 0; i < QUICK_SLOTS; i++) {
        const q = inv.quick[i];
        if (typeof q === 'string' && getItem(q)) out.quick[i] = q;
      }
    }
    return out;
  }

  /**
   * Чистка сохранённого снаряжения (задачи 000029/000031): только
   * строковые id, существующие в каталоге; прочее — null.
   * @returns {{weapon: string|null, armor: string|null}}
   */
  function sanitizeEquipment(eq) {
    const out = { weapon: null, armor: null };
    if (!eq || typeof eq !== 'object' || Array.isArray(eq)) return out;
    for (const slot of ['weapon', 'armor']) {
      const id = eq[slot];
      if (typeof id === 'string' && getItem(id)) out[slot] = id;
    }
    return out;
  }

  /**
   * Чистка сохранённого бонуса качества снаряжения (задача 000046,
   * задачи 000029/000031): {weapon, armor} — null либо одноключевой
   * валидный бонус слота (weapon → {damage}, armor → {armor}, целое
   * >= 1). Мусор в одном слоте не трогает другой.
   * @returns {{weapon: object|null, armor: object|null}}
   */
  function sanitizeEquipmentBonus(eq) {
    const out = { weapon: null, armor: null };
    if (!eq || typeof eq !== 'object' || Array.isArray(eq)) return out;
    for (const slot of ['weapon', 'armor']) {
      const b = eq[slot];
      if (b && typeof b === 'object' && !Array.isArray(b) &&
          validBonus({ kind: slot === 'weapon' ? 'weapon' : 'armor' }, b)) {
        const key = bonusKeyFor({ kind: slot });
        out[slot] = { [key]: b[key] };
      }
    }
    return out;
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

  // Стопки, куда добавляемый предмет влезает: тот же id и то же
  // состояние бонуса (обычный предмет не заполняет bonus-слот и
  // наоборот — бонусные экземпляры изолированы, задача 000046).
  function matchesSlot(e, itemId, st) {
    return e.id === itemId && bonusState(e.bonus) === st;
  }

  // Проверки добавления (слоты + вес) — общий для addItem/canAddItem.
  // Чисто: инвентарь не мутирует.
  function checkAdd(c, it, qty, st) {
    const inv = ensureInventory(c);
    const stackable = STACKABLE.has(it.kind);

    // Сколько новых слотов понадобится (с учётом заполнения стопок).
    let left = qty;
    if (stackable) {
      for (const e of inv.slots) {
        if (matchesSlot(e, it.id, st)) left = Math.max(0, left - (MAX_STACK - e.qty));
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
    return { ok: true };
  }

  /**
   * Добавляет предмет(ы) в инвентарь.
   * Проверяет свободные слоты и лимит веса (Крепкая спина).
   * bonus (задача 000046): бонус качества {damage}|{armor}|{amount} —
   * предмет кладётся отдельным бонусным экземпляром (не сливается с
   * обычной стопкой того же id; слияние — только в стопку с тем же
   * бонусом). Неверный bonus — отказ, инвентарь не трогается.
   * @returns {{ok:boolean, reason?:string}}
   */
  function addItem(c, itemId, qty = 1, bonus) {
    const it = getItem(itemId);
    if (!it) return { ok: false, reason: 'неизвестный предмет: ' + itemId };
    if (!Number.isInteger(qty) || qty < 1) return { ok: false, reason: 'неверное количество' };
    const b = (bonus === undefined) ? null : bonus;
    if (!validBonus(it, b)) {
      return { ok: false, reason: 'неверный бонус качества' };
    }
    const st = bonusState(b);
    const chk = checkAdd(c, it, qty, st);
    if (!chk.ok) return chk;

    // Заполняем подходящие стопки, остаток — в новые слоты.
    let rest = qty;
    const stackable = STACKABLE.has(it.kind);
    if (stackable) {
      for (const e of invSlots(c)) {
        if (!matchesSlot(e, itemId, st)) continue;
        const take = Math.min(rest, MAX_STACK - e.qty);
        e.qty += take;
        rest -= take;
      }
    }
    while (rest > 0) {
      const n = stackable ? Math.min(rest, MAX_STACK) : 1;
      invSlots(c).push(b
        ? { id: itemId, qty: n, bonus: b }
        : { id: itemId, qty: n });
      rest -= n;
    }
    return { ok: true };
  }

  function invSlots(c) { return ensureInventory(c).slots; }

  /**
   * Dry-run добавления (задача 000046): те же проверки, что addItem
   * (слоты + вес, с учётом бонуса), БЕЗ побочных эффектов. Используется
   * крафтом для атомарности (отказ — до расхода исходников).
   * @returns {{ok:boolean, reason?:string}}
   */
  function canAddItem(c, itemId, qty = 1, bonus) {
    const it = getItem(itemId);
    if (!it) return { ok: false, reason: 'неизвестный предмет: ' + itemId };
    if (!Number.isInteger(qty) || qty < 1) return { ok: false, reason: 'неверное количество' };
    const b = (bonus === undefined) ? null : bonus;
    if (!validBonus(it, b)) {
      return { ok: false, reason: 'неверный бонус качества' };
    }
    return checkAdd(c, it, qty, bonusState(b));
  }

  /**
   * Убирает предмет(ы) из инвентаря (снаряжение — через unequip).
   * bonusFirst (задача 000046): бонусные экземпляры уходят ПЕРВЫМИ
   * (качественная копия расходится/снимается в приоритете); порядок
   * внутри группы — как раньше (с конца).
   * @returns {{ok:boolean, reason?:string}}
   */
  function removeItem(c, itemId, qty = 1, bonusFirst = false) {
    const it = getItem(itemId);
    if (!it) return { ok: false, reason: 'неизвестный предмет: ' + itemId };
    if (!Number.isInteger(qty) || qty < 1) return { ok: false, reason: 'неверное количество' };
    // Все или ничего: не хватает — инвентарь не трогаем.
    if (totalQty(c, itemId) < qty) return { ok: false, reason: 'не хватает: ' + it.name };
    const inv = ensureInventory(c);
    let left = qty;
    // Порядок обхода: С КОНЦА, как раньше (совместимость). При
    // bonusFirst — сначала группа слотов с бонусом (с конца), затем
    // остальные (с конца). Снимаем по ссылкам — индексы после splice
    // не сдвигаются для оставшихся.
    const picks = [];
    const fromEnd = (pred) => {
      for (let i = inv.slots.length - 1; i >= 0; i--) {
        if (pred(inv.slots[i])) picks.push(inv.slots[i]);
      }
    };
    if (bonusFirst) fromEnd((e) => !!e.bonus);
    fromEnd((e) => !picks.includes(e));
    for (const e of picks) {
      if (left <= 0) break;
      if (e.id !== itemId || e.qty <= 0) continue;
      const take = Math.min(e.qty, left);
      e.qty -= take;
      left -= take;
      if (e.qty === 0) {
        const pos = inv.slots.indexOf(e);
        if (pos >= 0) inv.slots.splice(pos, 1);
      }
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

  // Опыт практики за успешное применение зелья (Алхимик) / еды (Сердце
  // природы) — задача 000013, SPEC.md «Повышение вторичных навыков».
  const USE_PRACTICE_XP = 2;

  /**
   * Опыт навыка от книг и свитков (задача 000013): опыт конвертируется
   * в уровни навыка и игнорирует «потолок практикой» (до максимума 100).
   */
  function addSkillXp(c, skillId, amount) {
    const r = P.skillReadBook(c, skillId, amount);
    if (!r.ok) return { ok: false, reason: r.reason };
    return {
      ok: true, skill: skillId, amount,
      applied: r.applied, level: r.level, leveledUp: r.leveledUp, total: r.total,
    };
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
    // Бонус качества (задача 000046): бонусный экземпляр тратится
    // первым, С КОНЦА группы бонусных слотов (removeItem bonusFirst
    // ниже — тот же порядок), и его бонус добавляется к эффекту за
    // ЕДИНИЦУ, снятую с бонусного слота. ВАЖНО: слот берём ПОСЛЕДНИЙ
    // с бонусом (не find-первый) — иначе при ДВУХ бонусных копиях с
    // разными значениями эффект считался бы по слабой, а снималась бы
    // сильная (ревью 000046, раунд 2). Цена предмета
    // (buyPrice/sellPrice) от бонуса НЕ зависит.
    let bonusSlot = null;
    {
      const slots = ensureInventory(c).slots;
      for (let i = slots.length - 1; i >= 0; i--) {
        if (slots[i].id === itemId && slots[i].bonus) { bonusSlot = slots[i]; break; }
      }
    }
    const bonusUnits = bonusSlot ? Math.min(qty, bonusSlot.qty) : 0;
    const bonusVal = bonusUnits > 0 ? (bonusSlot.bonus.amount || 0) : 0;
    let hp = 0, mp = 0, skill = null, craft = null, practice = null,
      practiceApplied = 0;
    for (let n = 0; n < qty; n++) {
      const e = it.effect;
      const bonus = (n < bonusUnits) ? bonusVal : 0;
      if (it.kind === 'potion' && e.kind === 'heal') {
        const amt = Math.round(e.amount * d.potionPowerMult) + bonus;
        P.heal(c, amt);
        hp += amt;
      } else if (it.kind === 'potion' && e.kind === 'mp') {
        const amt = Math.round(e.amount * d.potionPowerMult) + bonus;
        const before = c.mp;
        c.mp = Math.min(d.maxMP, c.mp + amt);
        mp += c.mp - before;
      } else if (it.kind === 'food') {
        const amt = Math.round(e.amount * d.foodPowerMult) + bonus;
        P.heal(c, amt);
        hp += amt;
      } else if (it.kind === 'skill_book') {
        skill = addSkillXp(c, e.skill, e.amount);
        // Хук крафта (задача 000046): книга даёт и опыт виду крафта
        // (Game.Craft при ВЫЗОВЕ — лениво; в node-тестах Game.Craft
        // нет — no-op). Вид определяется по навыку книги.
        const G = (typeof globalThis !== 'undefined' && typeof globalThis.Game === 'object')
          ? globalThis.Game : null;
        if (G && G.Craft && typeof G.Craft.bookCraftXp === 'function') {
          const cr = G.Craft.bookCraftXp(c, it);
          if (cr && cr.ok) {
            craft = { ok: true, applied: cr.applied, level: cr.level };
          }
        }
      }
      // Практика: успешное применение зелья/еды (задача 000013).
      if (it.kind === 'potion' || it.kind === 'food') {
        const pid = it.kind === 'potion' ? 'alchemy' : 'nature';
        const pr = P.skillPractice(c, pid, USE_PRACTICE_XP);
        practice = { skill: pid, xp: USE_PRACTICE_XP, level: pr.level };
        practiceApplied += pr.applied;
      }
    }
    // Бонусный экземпляр тратится первым (задача 000046).
    removeItem(c, itemId, qty, true);

    const parts = [];
    if (hp) parts.push('+' + hp + ' HP');
    if (mp) parts.push('+' + mp + ' MP');
    if (skill) {
      if (skill.ok && skill.applied) {
        const name = P.SECONDARY_SKILLS[skill.skill].name;
        parts.push(name + ': +' + skill.applied + ' опыта навыка');
      } else if (skill.ok) {
        parts.push('навык уже максимален');
      }
    }
    if (craft) parts.push('крафт: +' + craft.applied + ' опыта');
    if (practice && practiceApplied > 0) {
      const name = P.SECONDARY_SKILLS[practice.skill].name;
      parts.push(name + ': +' + practiceApplied + ' опыта за практику');
    }
    const out = {
      ok: true, name: it.name, hp: hp || undefined, mp: mp || undefined,
      skill: skill || undefined,
      practice: practice && practiceApplied > 0
        ? { skill: practice.skill, applied: practiceApplied, level: practice.level }
        : undefined,
      message: it.name + ': ' + parts.join(', '),
    };
    if (craft) out.craft = craft;
    return out;
  }

  // --- Снаряжение (оружие и броня) ---

  /**
   * Экипирует оружие/броню из инвентаря (текущее возвращается обратно).
   * Копия, которая надевается, — ПЕРВЫЙ слот инвентаря с этим id по
   * порядку слотов (задача 000046, НЕ bonusFirst): бонус качества
   * ЭТОЙ копии следует предмету в c.equipmentBonus. addItem дописывает
   * в конец, поэтому при нескольких копиях первая — добавленная раньше
   * (обычная, если она была ДО выкрафленной бонусной — бонусная копия
   * тогда надевается только после траты обычной; намеренный выбор,
   * см. memory/000046-craft-core.md). После unequip копия возвращается
   * КОНЦОМ списка.
   */
  function equip(c, itemId) {
    const it = getItem(itemId);
    if (!it) return { ok: false, reason: 'неизвестный предмет: ' + itemId };
    const eq = ensureEquipment(c);
    const eb = ensureEquipmentBonus(c);
    const slot = it.kind === 'weapon' ? 'weapon' : it.kind === 'armor' ? 'armor' : null;
    if (!slot) return { ok: false, reason: 'такое не экипируется' };
    if (eq[slot] === itemId) return { ok: false, reason: 'уже экипировано' };
    if (!hasItem(c, itemId)) return { ok: false, reason: 'предмета нет в инвентаре' };
    const inv = ensureInventory(c);
    const taken = inv.slots.find((e) => e.id === itemId);
    const prev = eq[slot];
    const prevBonus = prev ? (eb[slot] || null) : null;
    eq[slot] = itemId;
    eb[slot] = taken.bonus || null;
    // Снимаем именно эту копию (оружие/броня — 1 шт. на слот).
    const pos = inv.slots.indexOf(taken);
    if (pos >= 0) inv.slots.splice(pos, 1);
    if (prev) {
      const back = addItem(c, prev, 1, prevBonus || undefined);
      if (!back.ok) return { ok: true, note: 'вернуть ' + prev + ' не удалось: ' + back.reason };
    }
    return { ok: true, slot, item: itemId };
  }

  /**
   * Снимает снаряжение обратно в инвентарь (бонус качества — с ним,
   * задача 000046).
   * @param {'weapon'|'armor'} slot
   */
  function unequip(c, slot) {
    const eq = ensureEquipment(c);
    const eb = ensureEquipmentBonus(c);
    const id = eq[slot];
    if (!id) return { ok: false, reason: 'ничего не экипировано' };
    const bonus = eb[slot] || null;
    eq[slot] = null;
    eb[slot] = null;
    const r = addItem(c, id, 1, bonus || undefined);
    if (!r.ok) {
      // Некуда положить — остаётся надетым (бонус тоже на месте).
      eq[slot] = id;
      eb[slot] = bonus;
      return r;
    }
    return { ok: true, item: id };
  }

  /**
   * Боевые характеристики снаряжения (для combat.js):
   * { damage, subtype, hitBonus, dmgBonus, armor }.
   * damage/armor включают бонус качества надетого (задача 000046).
   */
  function equipmentStats(c) {
    const eq = ensureEquipment(c);
    const d = P.derived(c);
    const eb = (c.equipmentBonus && typeof c.equipmentBonus === 'object'
      && !Array.isArray(c.equipmentBonus)) ? c.equipmentBonus : null;
    const out = { damage: 0, subtype: null, hitBonus: 0, dmgBonus: 0, armor: 0 };
    if (eq.weapon) {
      const it = getItem(eq.weapon);
      if (it) {
        out.damage = it.stats.damage +
          ((eb && eb.weapon && eb.weapon.damage) || 0);
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
      if (it && it.stats && it.stats.armor) {
        out.armor = it.stats.armor +
          ((eb && eb.armor && eb.armor.armor) || 0);
      }
    }
    return out;
  }

  // --- Торговля (SPEC.md, «Постройки» → «Магазины») ---
  // Цена = стоимость предмета × богатство постройки × навык «Торговец».
  // Богатство 0-3: −10% цена покупки за уровень, +15% цена продажи.
  // «Торговец»: −5% покупка, +5% продажа за уровень (player.js).

  const BUY_WEALTH_MULT = 0.10;
  const SELL_WEALTH_MULT = 0.15;

  // Виды ассортимента магазина — ЕДИНЫЙ ИСТОЧНИК: каталог
  // assets/buildings (src/buildings.js), запись «картового» магазина
  // (map_index) → особых_параметры.виды = массив id из ITEM_KINDS
  // (задача 000060). Проза каталога `ассортимент` — описательная,
  // кодом не читается.
  //
  // Доступ ЛЕНИВЫЙ (паттерн catalogRef, 000055): в node приходит через
  // require; в браузере buildings.js грузится ПОСЛЕ items.js
  // (index.html 297/298), поэтому каталог берётся из root.Game в
  // МОМЕНТ ВЫЗОВА (функция переживает Object.assign({}, Game, …) —
  // см. 000055). Кэш ПУСТОГО вывода запрещён: первый вызов «до
  // загрузки» не должен зафиксировать фолбэк навсегда.
  function buildingsCatalogRef() {
    if (bld && Array.isArray(bld.BUILDINGS)) return bld;
    const g = rootRef && rootRef.Game;
    return g && Array.isArray(g.BUILDINGS) ? g : null;
  }

  // Фолбэк-таблица — ТОЛЬКО для vm-песочниц (combat-ui/dungeon-ui),
  // где items.js грузится БЕЗ buildings.js. Значения идентичны
  // каталогу (assets/buildings, «виды») — торговля не меняется.
  const SHOP_KINDS_FALLBACK = {
    0: ['weapon'],               // Оружейная
    1: ['armor'],                // Бронник
    2: ['potion', 'food'],       // Аптекарь
    3: ['reagent', 'skill_book'], // Магазин магии
    11: ['food', 'potion'],      // Таверна (map_index 11)
  };
  const KIND_IDS = Object.values(ITEM_KINDS);

  // Тип постройки → виды ассортимента. Каталог — источник истины:
  // у «картовой» записи без валидных `виды` — null (не магазин);
  // без каталога или для не-«картового» индекса — таблица-фолбэк.
  function shopKindsFor(buildingType) {
    const c = buildingsCatalogRef();
    if (c && typeof c.buildingForMapIndex === 'function') {
      const b = c.buildingForMapIndex(buildingType);
      if (b) {
        const виды = b.особые_параметры && b.особые_параметры.виды;
        if (Array.isArray(виды) && виды.length > 0 &&
            виды.every((k) => KIND_IDS.includes(k))) {
          return виды;
        }
        return null; // запись есть, «виды» нет/биты — не магазин
      }
    }
    // Каталог не подхвачен (vm-песочница) или индекс не «картовый»
    // (нет записи: NONE/13/… ) — таблица как есть.
    return SHOP_KINDS_FALLBACK[buildingType] || null;
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
    if (!kinds || !kinds.includes(it.kind)) {
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
    ensureEquipmentBonus,
    sanitizeInventory, sanitizeEquipment, sanitizeEquipmentBonus,
    inventoryWeight, maxCarryWeight, slotCount, totalQty, hasItem,
    addItem, canAddItem, removeItem,
    setQuick, clearQuick, quickItem, firstQuickSlot, freeQuickSlot,
    addSkillXp, useItem,
    equip, unequip, equipmentStats,
    shopKindsFor, makeShop, buyPrice, sellPrice, buyItem, sellItem,
  };
});

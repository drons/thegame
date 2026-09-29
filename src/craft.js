// Крафт в игровом коде (задача 000046): уровни видов крафта, рост
// (практика/книги/наставники), изготовление (атомарность, зеркало
// canCraft/craft), качество/выход, зачарование — по каталогу
// assets/craft (source of truth, задачи 000024/000044) и SPEC.md «Крафт».
//
// Чистое ядро без DOM — тестируется в node (tests/craft-core.test.js).
// Униформный модуль: в браузере — globalThis.Game.Craft (именованное
// пространство, НЕ распад в корень Game — паттерн 000045), в node —
// require(). Зависимости (ПОРЯДОК ВАЖЕН, UMD-ловушка 000038):
//   * craft-data.js (Game.CraftData — зеркало каталога, фолбэк file://);
//   * player.js (Game.createCharacter/derived/skillXpForNext);
//   * items.js (Game.addItem/removeItem/hasItem/getItem/QUICK_SLOTS —
//     инвентарь, бонусные слоты; canAddItem — в guard загрузки);
//   * buildings.js (Game.getBuilding — здания рецептов);
//   * spells.js (Game.Spells — зачарование: каталог и изученность).
//
// Числовые формулы (данные каталога описательные; формулы НЕ выносятся
// в SPEC — паттерн 000045: шапка модуля + красные тесты):
//   * пороги уровня вида: 15×(L+1) — та же формула, что у навыков
//     (P.skillXpForNext);
//   * опыт за успешное изготовление: 10 + уровень рецепта (виду);
//   * потолок практикой: уровень связанного навыка (CRAFT_TYPE_SKILL;
//     обычно вторичный, у столярного дела — ОСНОВНОЙ Ловкость) × 2;
//     выше потолка рост — только книгами/наставниками (ignoreCap);
//     на потолке практика — applied 0, копилка не меняется;
//   * качество (бонус к статам результата): только У ПОСТРОЙКИ —
//     min(0.5, 0.05 + 0.005×(L−1)); в поле — 0; рецепт с «база»
//     (улучшенный способ) — 1 (гарантия, даже в поле). Бонус: +1 к
//     главной стате результата (weapon → damage, armor → armor,
//     potion/food → effect.amount) × множитель навыка-потолка вида
//     (forge → equipmentDurabilityMult, alchemy → potionPowerMult,
//     runes → runePowerMult, dexterity → ×1), round, min 1; у
//     реагентов/книг бонуса нет;
//   * выход (доп. предмет, qty+1): min(0.25, 0.02 + 0.002×(L−1)) —
//     и у постройки, и в поле (SPEC: в поле вырезается только качество);
//     «база» — 1;
//   * зачарование: рецепт типа зачарование ОБЯЗАН применять заклинание
//     (по умолчанию — первое из recipe.заклинания); мана — spell.мани;
//     бонус по spell.действие: урон → weapon damage += степень,
//     защита → armor += степень, лечение → potion/food amount += 1+
//     степень; ослабление/контроль — без бонуса к предмету (мана
//     тратится). Бонус складывается с бонусом качества;
//   * наставник: +1 уровень виду за обучение.цена_за_уровень, без
//     потолка (до 100); NPC обязан обучать навык, маппящийся в вид,
//     и стоять в постройке этого вида.
// Роллы: rng вызывается СНАЧАЛА для качества, затем для выхода
// (порядок закреплён тестами; детерминированные тесты — scripted-rng).
// Атомарность: ВСЕ мутации — ПОСЛЕ всех проверок (при отказе
// исходники/мана/золото не тратятся); canCraft — зеркало craft
// (одна причина, без побочных эффектов — зеркало 000037).
// Ёмкость (зеркало): проверка — ХУДШИЙ СЛУЧАЙ последовательности
// мутаций на ТЕКУЩЕМ инвентаре (исходники ещё не сняты — консервативно:
// после расхода их место только прибавится, так что если влезает сейчас,
// мутации craft никогда не уткнутся в слоты/вес):
//   * результат — в обоих состояниях слота: с бонусом качества
//     (отдельный слот; состояние бонуса меняет слияние с существующими
//     стопками, расход слотов отличается) и без (только заклинание/
//     обычный) — проверяются оба, если качество МОЖЕТ выпасть;
//   * +1 выходной предмет поверх каждого (выход тоже ролл — худший
//     случай: оба ролла разом).
// Если худший случай влезает — craft не может ни «раздать бесплатно»
// (основной результат без выхода), ни отказать на слотах/весе, а
// canCraft и craft дают ОДНУ и ту же причину.

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('./craft-data.js'),
      require('./player.js'),
      require('./items.js'),
      require('./buildings.js'),
      require('./spells.js'));
  } else {
    // В браузере — пространство Game.Craft (не смешивать с Game).
    // Guard сбойного порядка (factory → undefined + console.error)
    // Game.Craft НЕ создаёт — «мёртвое ремесло» должно быть заметно.
    const Game = (typeof root.Game === 'object' && root.Game) || {};
    const api = factory(Game.CraftData, Game, Game, Game, Game.Spells);
    if (api) {
      root.Game = Object.assign({}, root.Game, {
        Craft: api,
        // Санитизеры — и в корне Game: main.js (IIFE) снимает G при
        // загрузке и читает их с G напрямую (паттерн hero.spells,
        // 000045) — restoreFromSave не ходит в Game.Craft.
        sanitizeCraftLevels: api.sanitizeCraftLevels,
        sanitizeCraftXp: api.sanitizeCraftXp,
      });
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : self,
  function (CraftData, P, I, B, Sp) {

  // Guards с console.error (паттерн 000038/000045): битый порядок
  // загрузки не должен оставлять «мёртвое ремесло» молча —
  // tests/index-order.test.js.
  if (!CraftData || !Array.isArray(CraftData.CRAFT) ||
      !CraftData.CRAFT_BY_ID || typeof CraftData.CRAFT_BY_ID !== 'object') {
    console.error('craft.js: не найден каталог крафта — загрузите ' +
      'src/craft-data.js до src/craft.js (задача 000046)');
    return;
  }
  if (!P || typeof P.createCharacter !== 'function' ||
      typeof P.derived !== 'function' ||
      typeof P.skillXpForNext !== 'function') {
    console.error('craft.js: не найден модуль персонажа — загрузите ' +
      'src/player.js до src/craft.js (задача 000046)');
    return;
  }
  if (!I || typeof I.addItem !== 'function' ||
      typeof I.canAddItem !== 'function' ||
      typeof I.removeItem !== 'function' ||
      typeof I.hasItem !== 'function' ||
      typeof I.getItem !== 'function') {
    console.error('craft.js: не найден модуль инвентаря — загрузите ' +
      'src/items.js до src/craft.js (задача 000046)');
    return;
  }
  if (!B || typeof B.getBuilding !== 'function') {
    console.error('craft.js: не найден модуль построек — загрузите ' +
      'src/buildings.js до src/craft.js (задача 000046)');
    return;
  }
  if (!Sp || typeof Sp.getSpell !== 'function') {
    console.error('craft.js: не найден модуль заклинаний — загрузите ' +
      'src/spells.js до src/craft.js (задача 000046, зачарование)');
    return;
  }

  // --- Каталог (зеркало assets/craft, src/craft-data.js) ---
  const CRAFT = CraftData.CRAFT;
  const CRAFT_BY_ID = CraftData.CRAFT_BY_ID;

  // --- Виды крафта и связанные навыки (SPEC «Виды крафта») ---
  const CRAFT_TYPES = [
    'кузнечное_дело', 'алхимия', 'резьба_по_камню',
    'столярное_дело', 'зачарование', 'рунопись',
  ];

  // Вид → навык-потолок (для потолка практикой И множителя бонуса
  // качества). Закрытый SPEC-разрыв: у столярного дела связанный
  // навык ОДИН и он ОСНОВНОЙ (Ловкость) — потолок = dexterity × 2.
  const CRAFT_TYPE_SKILL = {
    'кузнечное_дело': 'forge',
    'алхимия': 'alchemy',
    'резьба_по_камню': 'runes',
    'столярное_дело': 'dexterity',
    'зачарование': 'runes',
    'рунопись': 'runes',
  };

  // Навык → вид для книг/наставников: только ОДНОЗНАЧНЫЕ маппинги
  // (runes намеренно исключён — один навык на три вида: резать,
  // зачаровывать и начертать; в данных нет ни run-книги, ни run-NPC —
  // допущение future-задаче). heavy маппится в кузнечное дело (Торн/
  // мастер арены учат кузнечное).
  const SKILL_CRAFT_TYPE = {
    forge: 'кузнечное_дело',
    heavy: 'кузнечное_дело',
    alchemy: 'алхимия',
    nature: 'алхимия',
    dexterity: 'столярное_дело',
  };

  // Здания вида: union полей «здания» ВСЕХ рецептов вида (выводится
  // из зеркала, не хардкод).
  const TYPE_BUILDINGS = {};
  for (const r of CRAFT) {
    TYPE_BUILDINGS[r.тип] = TYPE_BUILDINGS[r.тип] || new Set();
    for (const b of r.здания) TYPE_BUILDINGS[r.тип].add(b);
  }
  function typeBuildings(type) {
    const set = TYPE_BUILDINGS[type];
    if (!set) return [];
    return [...set].sort((a, b) => a - b);
  }

  // --- Уровни видов крафта (объект {вид: 1..100}, отдельный от
  //     дерева навыков) и копилка опыта c.craftXp {вид: int >= 0} ---

  // Ленивая инициализация: «голый» персонаж без c.craft получает {}
  // (возвращает ТОТ ЖЕ объект, мутация — прямая).
  function craftOf(c) {
    if (!c.craft || typeof c.craft !== 'object' || Array.isArray(c.craft)) {
      c.craft = {};
    }
    if (!c.craftXp || typeof c.craftXp !== 'object' ||
        Array.isArray(c.craftXp)) {
      c.craftXp = {};
    }
    return c.craft;
  }

  // Текущий уровень вида (дефолт 1). Без побочных эффектов (c.craft
  // не создаёт — canCraft/canCraft-зеркало).
  function craftLevel(c, type) {
    return (c.craft && c.craft[type]) || 1;
  }

  // Порог уровня вида (та же формула, что у навыков, player.js).
  function craftXpForNext(level) {
    return P.skillXpForNext(level);
  }

  // «Потолок практикой»: уровень связанного навыка × 2 (SPEC).
  // Навык читается и из вторичных, и из основных (столярное дело —
  // основной Ловкость). Неизвестный вид — 0.
  function craftCap(c, type) {
    const skill = CRAFT_TYPE_SKILL[type];
    if (!skill) return 0;
    const lvl = ((c.secondary && c.secondary[skill]) ||
                 (c.primary && c.primary[skill]) || 0);
    return lvl * 2;
  }

  // Множитель бонуса качества по виду (навык-потолок): производные
  // характеристики player.js (1 + доля×уровень).
  function qualityMult(c, type) {
    const d = P.derived(c);
    switch (CRAFT_TYPE_SKILL[type]) {
      case 'forge': return d.equipmentDurabilityMult;
      case 'alchemy': return d.potionPowerMult;
      case 'runes': return d.runePowerMult;
      default: return 1; // dexterity и пр. — без усиления
    }
  }

  /**
   * Начисляет опыт виду крафта и конвертирует его в уровни
   * (зеркало _gainSkillXp из src/player.js, копилка — c.craftXp).
   * @param {boolean} ignoreCap книги/наставники: потолок практикой
   *   не учитывается (рост до максимума 100).
   * @returns {{ok:boolean, applied?:number, level?:number,
   *            leveledUp?:boolean, total?:number, reason?:string}}
   */
  function addCraftXp(c, type, amount, ignoreCap) {
    const fail = (reason) =>
      ({ ok: false, reason, applied: 0, level: 0, leveledUp: false,
         total: 0 });
    if (!CRAFT_TYPE_SKILL[type]) {
      return fail('неизвестный вид крафта: ' + type);
    }
    if (typeof amount !== 'number' || !Number.isInteger(amount) ||
        amount < 0) {
      return fail('неверный опыт');
    }
    if (!c.alive) return fail('персонаж погиб');
    craftOf(c);
    const level0 = craftLevel(c, type);
    const limit = ignoreCap
      ? 100
      : Math.min(100, craftCap(c, type));
    const bank0 = (c.craftXp && c.craftXp[type]) || 0;
    if (level0 >= limit) {
      c.craftXp[type] = bank0; // держим копилку числом (инвариант)
      return {
        ok: true, applied: 0, level: level0, leveledUp: false,
        total: bank0,
        reason: level0 >= 100 ? 'максимальный уровень' : 'потолок практикой',
      };
    }
    const gain = amount;
    let bank = bank0 + gain;
    let level = level0;
    let leveledUp = false;
    while (level < limit) {
      const need = craftXpForNext(level);
      if (bank < need) break;
      bank -= need;
      level += 1;
      leveledUp = true;
    }
    c.craft[type] = level;
    c.craftXp[type] = bank;
    return { ok: true, applied: gain, level, leveledUp, total: bank };
  }

  /**
   * Пересчёт копилки после повышения связанного навыка: «потолок
   * практикой» вырос, и опыт, застрявший в c.craftXp у уровня потолка,
   * конвертируется в уровни (до нового потолка). Зеркало
   * reprocessSkillXp (player.js). ВЫЗЫВАЕТСЯ при росте навыка из
   * player.js — очками (raiseSkill, основной и вторичный) и
   * практикой/книгами (_gainSkillXp) — и из npc.js schoolTrain
   * (школа), через ленивый хук globalThis.Game.Craft (player.js
   * загружается ДО craft.js — UMD-ловушка 000038; паттерн хука
   * bookCraftXp в items.js). Чисто: только c.craft/c.craftXp мутирует.
   * @returns {string[]} виды, чей уровень вырос
   */
  function reprocessCraftXp(c, skillId) {
    const leveled = [];
    for (const [type, s] of Object.entries(CRAFT_TYPE_SKILL)) {
      if (s !== skillId) continue;
      const bank0 = (c.craftXp && c.craftXp[type]) || 0;
      if (bank0 <= 0) continue;
      const level0 = craftLevel(c, type);
      const limit = Math.min(100, craftCap(c, type));
      let level = level0;
      let bank = bank0;
      while (level < limit) {
        const need = craftXpForNext(level);
        if (bank < need) break;
        bank -= need;
        level += 1;
      }
      if (level !== level0) {
        craftOf(c);
        c.craft[type] = level;
        c.craftXp[type] = bank;
        leveled.push(type);
      }
    }
    return leveled;
  }

  // --- Книги (skill_book → опыт виду крафта) ---

  /**
   * Опыт виду крафта от книги (задача 000046, SPEC «Навыки крафта»,
   * п. 2): книга даёт effect.amount опыта виду, которому маппится её
   * навык (SKILL_CRAFT_TYPE), обходя потолок практикой.
   * @param {object} book предмет-книга (из каталога items)
   */
  function bookCraftXp(c, book) {
    if (!book || book.kind !== 'skill_book' || !book.effect ||
        book.effect.kind !== 'skill_xp') {
      return { ok: false, reason: 'неверная книга' };
    }
    const type = SKILL_CRAFT_TYPE[book.effect.skill];
    if (!type) {
      return { ok: false, reason: 'книга не связана с видом крафта' };
    }
    return addCraftXp(c, type, book.effect.amount, true);
  }

  // --- Наставники (NPC обучение → +1 уровень виду) ---

  // Виды крафта, которые NPC обучает: маппинг навыков обучения.
  function npcCraftTypes(npc) {
    const out = new Set();
    const train = npc && npc.обучение;
    if (!train || !Array.isArray(train.навыки)) return out;
    for (const s of train.навыки) {
      const t = SKILL_CRAFT_TYPE[s];
      if (t) out.add(t);
    }
    return out;
  }

  /**
   * Можно ли обучиться у NPC виду крафта (проверки ПО ПОРЯДКУ).
   * Чисто: персонаж и NPC не мутирует.
   * @returns {{ok:boolean, reason?:string, price?:number}}
   */
  function canMentorCraft(npc, c, type) {
    if (!CRAFT_TYPE_SKILL[type]) {
      return { ok: false, reason: 'неизвестный вид крафта: ' + type };
    }
    const train = npc && npc.обучение;
    if (!train || !Array.isArray(train.навыки)) {
      return { ok: false, reason: 'не обучает крафт' };
    }
    if (!npcCraftTypes(npc).has(type)) {
      return { ok: false, reason: 'не обучает этот вид крафта' };
    }
    // Наставник обязан стоять в постройке этого вида (union зданий
    // рецептов вида и построек NPC).
    const blds = Array.isArray(npc.постройки) ? npc.постройки : [];
    const of = typeBuildings(type);
    if (!blds.some((b) => of.includes(b))) {
      return { ok: false, reason: 'нет постройки этого вида' };
    }
    if (craftLevel(c, type) >= 100) {
      return { ok: false, reason: 'максимальный уровень' };
    }
    const price = train.цена_за_уровень;
    if (typeof price !== 'number' || price < 0 || c.gold < price) {
      return { ok: false, reason: 'мало золота (нужно ' + price + ')' };
    }
    return { ok: true, price };
  }

  /**
   * Обучение у наставника: +1 уровень виду за обучение.цена_за_уровень
   * (без потолка практикой, до 100). Отказ — золото не тратится.
   * @returns {{ok:boolean, reason?:string, price?:number, level?:number}}
   */
  function mentorCraft(npc, c, type) {
    const check = canMentorCraft(npc, c, type);
    if (!check.ok) return { ok: false, reason: check.reason };
    c.gold -= check.price;
    craftOf(c);
    c.craft[type] = Math.min(100, craftLevel(c, type) + 1);
    return { ok: true, price: check.price, level: c.craft[type] };
  }

  // --- Изготовление (craft/canCraft) ---

  // Стат результата, на который ложится бонус (null — бонуса нет).
  function resultStatKey(it) {
    if (!it) return null;
    if (it.kind === 'weapon') return 'damage';
    if (it.kind === 'armor') return 'armor';
    if (it.kind === 'potion' || it.kind === 'food') return 'amount';
    return null;
  }

  // Бонус результата: качество (множитель навыка вида) + заклинание
  // (степень по spell.действие) складываются в ОДИН слот.
  // quality: выпало ли качество — в craft() результат ролла; в зеркале
  // ёмкости — «может ли выпасть» (худший случай). САМО значение
  // детерминировано (множитель — из навыка персонажа, степень — из
  // каталога), поэтому зеркало считает тот же бонус, что и craft.
  // null — бонуса нет (реагенты/книги; качество не выпало и без spell).
  function craftBonus(c, recipe, spell, quality) {
    const it = I.getItem(recipe.результат.предмет);
    const key = resultStatKey(it);
    if (!key) return null;
    let bonus = null;
    if (quality) {
      bonus = { [key]: Math.max(1, Math.round(1 * qualityMult(c, recipe.тип))) };
    }
    if (spell) {
      let add = 0;
      if (spell.действие === 'урон' && it.kind === 'weapon') {
        add = spell.степень;
      } else if (spell.действие === 'защита' && it.kind === 'armor') {
        add = spell.степень;
      } else if (spell.действие === 'лечение' &&
          (it.kind === 'potion' || it.kind === 'food')) {
        add = 1 + spell.степень;
      }
      if (add > 0) {
        bonus = bonus || {};
        bonus[key] = (bonus[key] || 0) + add;
      }
    }
    return bonus;
  }

  // Dry-run ОДНОГО сценария ёмкости на КЛОНЕ инвентаря: результат
  // (с бонусом b), затем +1 выходной (без бонуса). Использует реальный
  // addItem (те же проверки слотов/веса, то же заполнение стопок) —
  // на клоне: c не мутирует.
  function dryRunAdd(c, res, b, extra) {
    const inv0 = (c.inventory && Array.isArray(c.inventory.slots))
      ? c.inventory : null;
    const slots = inv0
      ? inv0.slots.map((e) => (e.bonus
          ? { id: e.id, qty: e.qty, bonus: e.bonus }
          : { id: e.id, qty: e.qty }))
      : [];
    const quick = (inv0 && Array.isArray(inv0.quick))
      ? inv0.quick.slice()
      : new Array(I.QUICK_SLOTS).fill(null);
    const tmp = Object.assign({}, c, { inventory: { slots, quick } });
    const r1 = I.addItem(tmp, res.предмет, res.количество,
      b === null ? undefined : b);
    if (!r1.ok) return r1;
    if (extra) {
      const r2 = I.addItem(tmp, res.предмет, 1);
      if (!r2.ok) return r2;
    }
    return { ok: true };
  }

  // Ёмкость инвентаря — зеркало (см. шапку модуля, «Ёмкость»): худший
  // случай последовательности мутаций на ТЕКУЩЕМ инвентаре.
  // Причины — те же, что у addItem/checkAdd: если какой-то сценарий не
  // влезает по СЛОТАМ — «нет свободных слотов инвентаря» (приоритет:
  // checkAdd проверяет слоты ДО веса), иначе по весу —
  // «слишком тяжело (лимит веса)». Чисто: c не мутирует.
  function capacityCheck(c, recipe, spell, building) {
    const res = recipe.результат;
    const qPossible = qualityChance(c, recipe.id, building) > 0;
    const yPossible = yieldChance(c, recipe.id, building) > 0;
    const bonuses = qPossible
      ? [craftBonus(c, recipe, spell, true),
         craftBonus(c, recipe, spell, false)]
      : [craftBonus(c, recipe, spell, false)];
    let slotFail = false;
    let weightFail = false;
    for (const b of bonuses) {
      const r = dryRunAdd(c, res, b, yPossible);
      if (!r.ok) {
        if (r.reason === 'нет свободных слотов инвентаря') slotFail = true;
        else if (r.reason === 'слишком тяжело (лимит веса)') weightFail = true;
        else return r; // непредвиденная причина — вернуть как есть
      }
    }
    if (slotFail) return { ok: false, reason: 'нет свободных слотов инвентаря' };
    if (weightFail) return { ok: false, reason: 'слишком тяжело (лимит веса)' };
    return { ok: true };
  }

  // Общие проверки крафта (зеркало 000037: craft и canCraft обязаны дать
  // ОДНУ и ту же причину). Чисто: инвентарь/мана/rng не трогаются,
  // c.craft/c.craftXp/p.spells не создаются.
  // Возврат: { fail: {ok:false, reason} } | { ok, recipe, spell }.
  function evalCraft(c, recipeId, opts) {
    const o = opts || {};
    const recipe = CRAFT_BY_ID[recipeId];
    if (!recipe) return { fail: { ok: false, reason: 'неизвестный рецепт' } };
    // Уровень вида.
    const need = recipe.уровень;
    if (craftLevel(c, recipe.тип) < need) {
      return {
        fail: { ok: false, reason: `недостаточный уровень (нужно ${need})` },
      };
    }
    // Здание: building=null/undefined — в поле (разрешено, но без
    // шанса качества); указанное — должно быть в recipe.здания.
    if (o.building != null && !recipe.здания.includes(o.building)) {
      return {
        fail: {
          ok: false,
          reason: 'в этом здании такой способ не изготавливается',
        },
      };
    }
    // Исходники: причина — ПЕРВОГО нехватившегося в списке рецепта.
    for (const inp of recipe.исходники) {
      if (!I.hasItem(c, inp.предмет, inp.количество)) {
        const it = I.getItem(inp.предмет);
        return {
          fail: { ok: false, reason: 'не хватает: ' + (it ? it.name : inp.предмет) },
        };
      }
    }
    // Зачарование: у типа зачарование заклинание ОБЯЗАТЕЛЬНО; у прочих
    // типов — опционально (spellId из рецепта, если передан).
    let spell = null;
    if (recipe.тип === 'зачарование' || o.spellId != null) {
      const spells = Array.isArray(recipe.заклинания)
        ? recipe.заклинания : [];
      const spellId = o.spellId != null ? o.spellId : (spells[0] || null);
      if (!spellId) {
        return {
          fail: { ok: false, reason: 'для этого рецепта нужно заклинание' },
        };
      }
      if (!spells.includes(spellId)) {
        return {
          fail: { ok: false, reason: 'в этом рецепте нет такого заклинания' },
        };
      }
      spell = Sp.getSpell(spellId);
      if (!spell) {
        return {
          fail: { ok: false, reason: 'неизвестное заклинание: ' + spellId },
        };
      }
      // Изученность — БЕЗ побочных эффектов (p.spells не создаётся —
      // зеркало canCastSpell, 000045).
      const book = Array.isArray(c.spells) ? c.spells : null;
      if (!book || !book.includes(spellId)) {
        return { fail: { ok: false, reason: 'заклинание не изучено' } };
      }
      if (c.mp < spell.мани) {
        return {
          fail: { ok: false, reason: `не хватает маны (${spell.мани})` },
        };
      }
    }
    // Ёмкость инвентаря (dry-run ТЕКУЩЕГО инвентаря, ДО расхода
    // исходников — атомарность: отказ = исходники не потрачены).
    // ХУДШИЙ СЛУЧАЙ: результат в обоих состояниях слота (с бонусом
    // качества — отдельный слот — и без) + 1 выходной (см. шапку
    // модуля): если он влез, craft не может ни отказать на слотах/весе,
    // ни «раздать» основной результат без выхода.
    const cap = capacityCheck(c, recipe, spell, o.building);
    if (!cap.ok) return { fail: cap };
    return { ok: true, recipe, spell };
  }

  /**
   * Предпросмотр изготовления (зеркало 00037): те же причины, что
   * craft, БЕЗ побочных эффектов (rng не вызывается, инвентарь/мана/
   * c.craft не трогаются).
   * opts: { building?: number|null, spellId?: string }
   * @returns {{ok:boolean, reason?:string}}
   */
  function canCraft(c, recipeId, opts) {
    const ev = evalCraft(c, recipeId, opts);
    if (ev.fail) return ev.fail;
    return { ok: true };
  }

  /**
   * Изготовить предмет по рецепту.
   * Расход: исходники (инвентарь), мана (если заклинание), опыт виду
   * (10 + уровень рецепта, с потолком практикой). Результат — в
   * инвентарь (бонус качества/зачарования — отдельный слот), выход —
   * +1 предмет. ВСЕ мутации — после всех проверок.
   * opts: { building?: number|null, spellId?: string, rng?: function }
   * @returns {{ok:boolean, reason?:string, item?:string, qty?:number,
   *            quality?:boolean, extra?:boolean, bonus?:object,
   *            spell?:object, xp?:object}}
   */
  function craft(c, recipeId, opts) {
    const o = opts || {};
    const ev = evalCraft(c, recipeId, o);
    if (ev.fail) return ev.fail;
    const { recipe, spell } = ev;
    const rng = typeof o.rng === 'function' ? o.rng : Math.random;
    // Роллы: СНАЧАЛА качество, затем выход (порядок закреплён).
    const qRoll = rng();
    const yRoll = rng();
    const quality = qRoll < qualityChance(c, recipeId, o.building);
    const extra = yRoll < yieldChance(c, recipeId, o.building);

    // Бонус результата: качество (множитель навыка вида) + заклинание
    // (степень по spell.действие) складываются в один слот.
    const res = recipe.результат;
    const bonus = craftBonus(c, recipe, spell, quality);

    // --- Мутации (все проверки прошли) ---
    // Отказ на этом этапе НЕДОСТИЖИМ: evalCraft/capacityCheck прошла
    // ХУДШИЙ случай (оба состояния бонуса + выход) на БОЛЕЕ тяжёлом
    // инвентаре (исходники ещё внутри), а бонус здесь — один из
    // проверенных. Атомарность на случай будущего рассогласования
    // сохраняем ПОЛНОЙ: при отказе инвентарь возвращается ТОЧНО к
    // состоянию до craft — исходники не потрачены И результат не
    // остался «в подарок» (отказ = ничего не изготовлено).
    // (Снимок слотов/quick, а не «вернуть исходники» точечно: бонусные
    // слоты изолированы, и точечный removeItem мог снять ЧУЖИЕ копии.)
    I.ensureInventory(c);
    const slotsBefore = c.inventory.slots
      .map((e) => (e.bonus
          ? { id: e.id, qty: e.qty, bonus: e.bonus }
          : { id: e.id, qty: e.qty }));
    const quickBefore = c.inventory.quick.slice();
    const restoreInventory = () => {
      c.inventory.slots = slotsBefore.map((e) => (e.bonus
        ? { id: e.id, qty: e.qty, bonus: e.bonus }
        : { id: e.id, qty: e.qty }));
      c.inventory.quick = quickBefore;
    };
    // Исходники.
    for (const inp of recipe.исходники) {
      I.removeItem(c, inp.предмет, inp.количество);
    }
    // Результат (с бонусом — отдельный слот).
    const addR = I.addItem(c, res.предмет, res.количество,
      bonus === null ? undefined : bonus);
    if (!addR.ok) {
      restoreInventory();
      return { ok: false, reason: addR.reason };
    }
    // Выход: +1 предмет-результат (без бонуса).
    if (extra) {
      const ex = I.addItem(c, res.предмет, 1);
      if (!ex.ok) {
        restoreInventory();
        return { ok: false, reason: ex.reason };
      }
    }
    // Мана (зачарование).
    if (spell) c.mp -= spell.мани;
    // Опыт виду: 10 + уровень рецепта (практика, с потолком).
    const xp = addCraftXp(c, recipe.тип, 10 + recipe.уровень, false);

    const out = {
      ok: true, item: res.предмет, qty: res.количество,
      quality, extra,
    };
    if (bonus) out.bonus = bonus;
    if (spell) out.spell = spell;
    out.xp = {
      applied: xp.applied, level: xp.level,
      leveledUp: xp.leveledUp, total: xp.total,
    };
    if (xp.reason) out.xp.reason = xp.reason;
    return out;
  }

  // --- Качество и выход (шансы) ---

  // Шанс бонуса качества: только у постройки (в поле — 0, SPEC);
  // улучшенный способ («база») — 1 (гарантия, даже в поле).
  function qualityChance(c, recipeId, building) {
    const recipe = CRAFT_BY_ID[recipeId];
    if (!recipe) return 0;
    if (recipe.база !== undefined) return 1;
    if (building == null) return 0;
    const L = craftLevel(c, recipe.тип);
    return Math.min(0.5, 0.05 + 0.005 * (L - 1));
  }

  // Шанс дополнительного предмета (выход): и у постройки, и в поле
  // (SPEC: в поле вырезается только качество); «база» — 1.
  function yieldChance(c, recipeId, building) {
    const recipe = CRAFT_BY_ID[recipeId];
    if (!recipe) return 0;
    if (recipe.база !== undefined) return 1;
    const L = craftLevel(c, recipe.тип);
    return Math.min(0.25, 0.02 + 0.002 * (L - 1));
  }

  // --- Сейв (опциональные поля hero.craft/hero.craftXp, без
  //     повышения версии, 000031) ---

  // {вид: целое 1..100} — прочее (неизвестный вид, нецелое, <1)
  // отбрасывается, >100 клампится; не-объект → {}.
  function sanitizeCraftLevels(v) {
    const out = {};
    if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
    for (const [t, lvl] of Object.entries(v)) {
      if (!CRAFT_TYPE_SKILL[t]) continue;
      if (!Number.isInteger(lvl) || lvl < 1) continue;
      out[t] = Math.min(100, lvl);
    }
    return out;
  }

  // {вид: целое >= 0} — прочее отбрасывается; не-объект → {}.
  function sanitizeCraftXp(v) {
    const out = {};
    if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
    for (const [t, x] of Object.entries(v)) {
      if (!CRAFT_TYPE_SKILL[t]) continue;
      if (!Number.isInteger(x) || x < 0) continue;
      out[t] = x;
    }
    return out;
  }

  return {
    CRAFT, CRAFT_BY_ID, CRAFT_TYPES,
    CRAFT_TYPE_SKILL, SKILL_CRAFT_TYPE, typeBuildings,
    craftOf, craftLevel, craftXpForNext, craftCap,
    addCraftXp, reprocessCraftXp,
    bookCraftXp, canMentorCraft, mentorCraft,
    canCraft, craft, qualityChance, yieldChance,
    sanitizeCraftLevels, sanitizeCraftXp,
  };
});

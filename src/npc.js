// NPC: диалоги, торговля, школы навыков, квесты (задача 000010,
// SPEC.md — раздел «NPC»).
//
// Чистое ядро без DOM — тестируется в node (tests/npc.test.js).
// Униформный модуль: в браузере — globalThis.Game, в node — require().
// Ядро не знает конкретных NPC: каталог NPC (модуль src/npc-data.js,
// source of truth — assets/npc/*.json) передаётся функциям аргументом.
// Зависимости: player.js (derived, навыки, опыт), items.js (инвентарь).

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./player.js'), require('./items.js'));
  } else {
    const G0 = typeof root.Game === 'object' ? root.Game : {};
    root.Game = Object.assign({}, G0, factory(G0, G0));
  }
})(typeof globalThis !== 'undefined' ? globalThis : self, function (P, I) {

  if (!P || typeof P.derived !== 'function' || typeof P.SECONDARY_SKILLS !== 'object') {
    throw new Error('npc.js: не найден player.js — загрузите player.js до npc.js');
  }
  if (!I || typeof I.addItem !== 'function' || typeof I.hasItem !== 'function') {
    throw new Error('npc.js: не найден items.js — загрузите items.js до npc.js');
  }

  // Лимит одновременных активных квестов (журнал, SPEC «NPC»).
  const MAX_ACTIVE_QUESTS = 5;

  // --- Справочные ---

  /** Находит NPC по id. @returns {object|null} */
  function npcById(npcs, id) {
    return npcs.find((n) => n.id === id) || null;
  }

  /** Все NPC, находящиеся в постройке, в порядке каталога. */
  function npcsForBuilding(npcs, buildingId) {
    return npcs.filter(
      (n) => Array.isArray(n.постройки) && n.постройки.includes(buildingId));
  }

  /** Первый NPC постройки (для HUD/открытия диалога). */
  function npcForBuilding(npcs, buildingId) {
    return npcsForBuilding(npcs, buildingId)[0] || null;
  }

  /** Уровень навыка: основной (character.primary) или вторичный. */
  function skillLevel(character, skillId) {
    const p = character.primary || {};
    if (p[skillId] != null) return p[skillId];
    return (character.secondary && character.secondary[skillId]) || 0;
  }

  // Имя навыка для сообщений: из каталога, при неизвестном id — сам id.
  function skillName(skillId) {
    if (P.SECONDARY_SKILLS[skillId]) return P.SECONDARY_SKILLS[skillId].name;
    const p = P.PRIMARY_SKILLS.find((x) => x.id === skillId);
    return p ? p.name : skillId;
  }

  // --- Диалоги ---

  /**
   * Опции диалога NPC: { option, доступен, причина } в порядке данных.
   * `option` — ссылка на объект опции из данных NPC. Причина — первое
   * невыполненное требование (порядок: харизма → навык → проверка).
   */
  function dialogOptions(npc, character) {
    return (npc.диалог || []).map((option) => {
      const req = option.требования || {};
      let причина = null;
      if (typeof req.харизма === 'number' && character.primary.charisma < req.харизма) {
        причина = 'нужна Харизма ' + req.харизма;
      } else if (req.навык && skillLevel(character, req.навык.id) < req.навык.уровень) {
        причина = 'нужен ' + skillName(req.навык.id) + ' ' + req.навык.уровень;
      } else if (typeof req.проверка === 'number' &&
          P.derived(character).dialogueBonus < req.проверка) {
        причина = 'бонус к диалогу меньше ' + req.проверка;
      }
      return { option, доступен: причина === null, причина };
    });
  }

  // --- Школы навыков (обучение за монеты, перенос очков) ---

  /** Список id вторичных навыков, которых обучает NPC. */
  function schoolSkills(npc) {
    return (npc.обучение && Array.isArray(npc.обучение.навыки))
      ? npc.обучение.навыки : [];
  }

  /** Цена 1 уровня обучения | null, если NPC не обучает. */
  function schoolTrainPrice(npc) {
    return npc.обучение ? npc.обучение.цена_за_уровень : null;
  }

  /** Цена возврата N уровней («перенос вложенных очков»). */
  function schoolRefundPrice(npc, levels) {
    if (!npc.обучение) return null;
    return npc.обучение.цена_переноса_за_уровень * levels;
  }

  /** Можно ли обучить навык. Проверки по порядку, первая неудача. */
  function canSchoolTrain(npc, character, skillId) {
    if (!schoolSkills(npc).includes(skillId)) {
      return { ok: false, reason: 'навык не обучается здесь' };
    }
    const s = P.SECONDARY_SKILLS[skillId];
    if (!s) return { ok: false, reason: 'не вторичный навык' };
    if (skillLevel(character, skillId) >= P.MAX_SKILL_LEVEL) {
      return { ok: false, reason: 'максимальный уровень' };
    }
    if (character.primary[s.primary] < 1) {
      return { ok: false, reason: 'недостаточно: ' + skillName(s.primary) };
    }
    if (s.requires && skillLevel(character, s.requires.skill) < s.requires.level) {
      return { ok: false, reason: 'нужен ' + skillName(s.requires.skill) + ' ' + s.requires.level };
    }
    const price = schoolTrainPrice(npc);
    if (character.gold < price) {
      return { ok: false, reason: 'мало золота (нужно ' + price + ')' };
    }
    return { ok: true };
  }

  /**
   * Прокачка за золото: +1 уровень, очки НЕ тратит (в отличие от P.raiseSkill).
   * @returns {{ok:boolean, level?:number, price?:number, reason?:string}}
   */
  function schoolTrain(npc, character, skillId) {
    const check = canSchoolTrain(npc, character, skillId);
    if (!check.ok) return { ok: false, reason: check.reason };
    const price = schoolTrainPrice(npc);
    character.gold -= price;
    character.secondary[skillId] = (character.secondary[skillId] || 0) + 1;
    return { ok: true, level: character.secondary[skillId], price };
  }

  /** Можно ли вернуть уровни в пул очков. Проверки по порядку. */
  function canSchoolRefund(npc, character, skillId, levels = 1) {
    if (!schoolSkills(npc).includes(skillId)) {
      return { ok: false, reason: 'навык не обучается здесь' };
    }
    if (!P.SECONDARY_SKILLS[skillId]) {
      return { ok: false, reason: 'не вторичный навык' };
    }
    if (!Number.isInteger(levels) || levels < 1) {
      return { ok: false, reason: 'неверное количество уровней' };
    }
    const lvl = character.secondary[skillId] || 0;
    if (lvl < levels) return { ok: false, reason: 'недостаточно уровней' };
    // Защита дерева: другие уже полученные навыки не должны оказаться
    // ниже требуемого уровня.
    for (const rId of Object.keys(P.SECONDARY_SKILLS)) {
      const r = P.SECONDARY_SKILLS[rId];
      if ((character.secondary[rId] || 0) <= 0) continue;
      if (!r.requires || r.requires.skill !== skillId) continue;
      if (lvl - levels < r.requires.level) {
        return { ok: false, reason:
          'навык «' + r.name + '» требует ' + skillName(skillId) + ' ' + r.requires.level };
      }
    }
    const price = schoolRefundPrice(npc, levels);
    if (character.gold < price) {
      return { ok: false, reason: 'мало золота (нужно ' + price + ')' };
    }
    return { ok: true };
  }

  /**
   * «Перенос вложенных очков»: возврат уровней обратно в пул свободных
   * очков за золото. @returns {{ok, level, points, price}|{ok:false, reason}}
   */
  function schoolRefund(npc, character, skillId, levels = 1) {
    const check = canSchoolRefund(npc, character, skillId, levels);
    if (!check.ok) return { ok: false, reason: check.reason };
    const price = schoolRefundPrice(npc, levels);
    character.gold -= price;
    character.secondary[skillId] = (character.secondary[skillId] || 0) - levels;
    character.points += levels;
    return { ok: true, level: character.secondary[skillId], points: levels, price };
  }

  // --- Торговля NPC (фиксированные цены из данных, «Торговец» действует) ---

  /**
   * Сток NPC-магазина (mutable-копия) | null, если NPC не торгует.
   */
  function createNpcShop(npc) {
    if (!npc.торговля || !Array.isArray(npc.торговля.предметы)) return null;
    const stock = {};
    for (const p of npc.торговля.предметы) {
      stock[p.предмет] = p.количество || 1;
    }
    return { npc, stock };
  }

  // Позиция предмета в списке торговли NPC.
  function tradeEntry(shop, itemId) {
    const list = shop.npc.торговля && shop.npc.торговля.предметы;
    if (!list) return null;
    return list.find((p) => p.предмет === itemId) || null;
  }

  /** Цена покупки 1 шт. у NPC с учётом «Торговца» | null. */
  function npcBuyPrice(shop, itemId, character) {
    const p = tradeEntry(shop, itemId);
    if (!p) return null;
    return Math.max(1, Math.round(p.цена_покупки * P.derived(character).buyPriceMult));
  }

  /** Цена продажи 1 шт. NPC с учётом «Торговца» | null. */
  function npcSellPrice(shop, itemId, character) {
    const p = tradeEntry(shop, itemId);
    if (!p) return null;
    return Math.max(1, Math.round(p.цена_продажи * P.derived(character).sellPriceMult));
  }

  /** Покупка предмета у NPC. Инварианты: gold ≥ 0, сток ≥ 0. */
  function npcBuy(shop, character, itemId, qty = 1) {
    if (!tradeEntry(shop, itemId)) {
      return { ok: false, reason: 'NPC не продаёт такой предмет' };
    }
    const have = shop.stock[itemId] || 0;
    if (have < qty) return { ok: false, reason: 'нет в наличии' };
    const price = npcBuyPrice(shop, itemId, character) * qty;
    if (character.gold < price) {
      return { ok: false, reason: 'мало золота (нужно ' + price + ')' };
    }
    const add = I.addItem(character, itemId, qty);
    if (!add.ok) return { ok: false, reason: add.reason };
    character.gold -= price;
    shop.stock[itemId] = have - qty;
    return { ok: true, item: itemId, qty, price };
  }

  /** Продажа предмета NPC. Инварианты: gold ≥ 0, сток ≥ 0. */
  function npcSell(shop, character, itemId, qty = 1) {
    if (!tradeEntry(shop, itemId)) {
      return { ok: false, reason: 'NPC не скупает такие предметы' };
    }
    if (!I.hasItem(character, itemId, qty)) {
      return { ok: false, reason: 'предмета нет в инвентаре' };
    }
    const price = npcSellPrice(shop, itemId, character) * qty;
    I.removeItem(character, itemId, qty);
    character.gold += price;
    return { ok: true, item: itemId, qty, price };
  }

  // --- Квесты (журнал — book: { active: {}, done: [] }) ---

  /** Создаёт журнал квестов: active — questId → инстанс, done — ids. */
  function createQuestBook() {
    return { active: {}, done: [] };
  }

  /** Определение квеста (из npc.квесты) | null. */
  function questDef(npcs, npcId, questId) {
    const npc = npcById(npcs, npcId);
    if (!npc || !Array.isArray(npc.квесты)) return null;
    return npc.квесты.find((q) => q.id === questId) || null;
  }

  /**
   * Квесты NPC, доступные к приёму: исключены уже взятые/выполненные и
   * следующие в цепочке, пока предыдущий не выполнен.
   */
  function availableQuests(npcs, book, npc) {
    if (!Array.isArray(npc.квесты)) return [];
    const done = new Set(book.done);
    return npc.квесты.filter((q) => {
      if (book.active[q.id]) return false;
      if (done.has(q.id)) return false;
      if (q.предыдущий && !done.has(q.предыдущий)) return false;
      return true;
    });
  }

  /**
   * Принимает квест. @returns {{ok:true, quest}|{ok:false, reason}}
   */
  function acceptQuest(book, npcs, npc, questId) {
    const quest = availableQuests(npcs, book, npc).find((q) => q.id === questId);
    if (!quest) return { ok: false, reason: 'квест недоступен' };
    if (Object.keys(book.active).length >= MAX_ACTIVE_QUESTS) {
      return { ok: false, reason: 'слишком много активных квестов (' + MAX_ACTIVE_QUESTS + ')' };
    }
    book.active[questId] = { npcId: npc.id, questId, status: 'active', progress: 0 };
    return { ok: true, quest };
  }

  /**
   * Победа над стационарной группой: продвигает kill_group-квесты.
   * @returns string[] ids квестов, ставших 'ready'
   */
  function notifyGroupDefeated(npcs, book, groupType) {
    const ready = [];
    for (const inst of Object.values(book.active)) {
      const def = questDef(npcs, inst.npcId, inst.questId);
      if (!def || !def.цель) continue;
      const goal = def.цель;
      if (goal.тип !== 'kill_group' || goal.группа !== groupType) continue;
      if (inst.status === 'ready') continue;
      inst.progress = Math.min((inst.progress || 0) + 1, goal.количество);
      if (inst.progress >= goal.количество) {
        inst.status = 'ready';
        ready.push(inst.questId);
      }
    }
    return ready;
  }

  /**
   * Обновляет bring_item-квесты по инвентарю.
   * @returns string[] ids квестов, ставших 'ready'
   */
  function refreshBringItems(npcs, book, character) {
    const ready = [];
    for (const inst of Object.values(book.active)) {
      const def = questDef(npcs, inst.npcId, inst.questId);
      if (!def || !def.цель) continue;
      const goal = def.цель;
      if (goal.тип !== 'bring_item' || inst.status === 'ready') continue;
      if (I.hasItem(character, goal.предмет, goal.количество)) {
        inst.status = 'ready';
        ready.push(inst.questId);
      }
    }
    return ready;
  }

  /**
   * Сдача квеста. Награда — ровно один раз: единственный путь к ней —
   * однократный переход active → done.
   * @returns {{ok:true, quest, reward:{xp,gold,items}}|{ok:false, reason}}
   */
  function turnInQuest(npcs, book, character, questId) {
    const inst = book.active[questId];
    if (!inst) return { ok: false, reason: 'квест не в работе' };
    const def = questDef(npcs, inst.npcId, questId);
    if (!def) return { ok: false, reason: 'квест не найден' };
    const goal = def.цель;
    if (goal.тип === 'kill_group') {
      if (inst.status !== 'ready') return { ok: false, reason: 'цель ещё не достигнута' };
    } else if (goal.тип === 'bring_item') {
      if (!I.hasItem(character, goal.предмет, goal.количество)) {
        return { ok: false, reason: 'цель ещё не достигнута' };
      }
      inst.status = 'ready';
    } else {
      return { ok: false, reason: 'цель ещё не достигнута' };
    }
    const reward = def.награда;
    // Награда-предметы атомарно: либо весь набор, либо ничего.
    const given = [];
    for (const g of (reward.предметы || [])) {
      const add = I.addItem(character, g.предмет, g.количество);
      if (!add.ok) {
        for (const d of given) I.removeItem(character, d.предмет, d.количество);
        return { ok: false, reason: 'инвентарь полон' };
      }
      given.push(g);
    }
    if (goal.тип === 'bring_item') {
      I.removeItem(character, goal.предмет, goal.количество);
    }
    character.gold += reward.золото;
    P.addXp(character, reward.опыт);
    delete book.active[questId];
    book.done.push(questId);
    return {
      ok: true,
      quest: def,
      reward: { xp: reward.опыт, gold: reward.золото, items: reward.предметы || [] },
    };
  }

  /** Активные квесты для журнала: [{ quest, instance }]. */
  function activeQuests(npcs, book) {
    return Object.values(book.active).map((instance) => ({
      quest: questDef(npcs, instance.npcId, instance.questId),
      instance,
    }));
  }

  return {
    MAX_ACTIVE_QUESTS,
    npcById, npcsForBuilding, npcForBuilding, skillLevel,
    dialogOptions,
    schoolSkills, schoolTrainPrice, schoolRefundPrice,
    canSchoolTrain, schoolTrain, canSchoolRefund, schoolRefund,
    createNpcShop, npcBuyPrice, npcSellPrice, npcBuy, npcSell,
    createQuestBook, questDef, availableQuests, acceptQuest,
    notifyGroupDefeated, refreshBringItems, turnInQuest, activeQuests,
  };
});

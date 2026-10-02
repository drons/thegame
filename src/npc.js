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

  /**
   * Кандидаты на найм (задача 000078, родитель 000065): NPC с
   * найм-данными (объект `найм`) — ЧИТАЕМЫЙ список для вкладки
   * «найм» (src/ui.js) и стабильный API для 000079/000083.
   * Кандидатом считается НАЛИЧИЕ найм-данных (building-фильтра нет:
   * целостность «все в таверне 44» держит тест каталога).
   * Порядок = порядок переданного массива (каталога), детерминированно
   * (возвращаются ссылки на те же записи); мусор (null, найм-не-объект)
   * отфильтрован.
   */
  function hireCandidates(npcs) {
    return npcs.filter((n) => n && n.найм && typeof n.найм === 'object');
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
   * Действие НЕ читается (задача 000078): любое действие — «торговля»,
   * «обучение», «квесты», «подсказка», «найм» — проходит через
   * существующий механизм требований, как «квесты»: доступ к найму —
   * требования найм-опции (паттерн Оратора), новой системы проверок нет.
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

  // Хук крафта (задача 000046): рост навыка в школе поднимает «потолок
  // практикой» привязанных к нему видов крафта — пересчёт копилки
  // c.craftXp. ЛЕНИВО (см. craftReprocessHook в player.js и хук
  // bookCraftXp в items.js): Game.Craft снимается при ВЫЗОВЕ; в node
  // без Game.Craft — no-op.
  function craftReprocessHook(c, skillId) {
    const G = (typeof globalThis !== 'undefined' &&
      typeof globalThis.Game === 'object') ? globalThis.Game : null;
    if (G && G.Craft && typeof G.Craft.reprocessCraftXp === 'function') {
      G.Craft.reprocessCraftXp(c, skillId);
    }
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
    // Крафт (000046): навык вырос — потолок видов крафта на нём вырос.
    craftReprocessHook(character, skillId);
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
   * Начальный сток NPC: { itemId: qty } | null, если NPC не торгует.
   */
  function defaultStock(npc) {
    if (!npc || !npc.торговля || !Array.isArray(npc.торговля.предметы)) {
      return null;
    }
    const stock = {};
    for (const p of npc.торговля.предметы) {
      stock[p.предмет] = p.количество || 1;
    }
    return stock;
  }

  /**
   * Сток NPC-магазина (mutable-копия) | null, если NPC не торгует.
   */
  function createNpcShop(npc) {
    const stock = defaultStock(npc);
    return stock ? { npc, stock } : null;
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
   * Принимает квест.
   * @param {number} [day] день мира при выдаче — пишется в инстанс
   *   (задача 000029): при восстановлении сейва состояние не должно
   *   противоречить датам (выдан в день N ⇒ текущий день ≥ N).
   * @returns {{ok:true, quest}|{ok:false, reason}}
   */
  function acceptQuest(book, npcs, npc, questId, day) {
    const quest = availableQuests(npcs, book, npc).find((q) => q.id === questId);
    if (!quest) return { ok: false, reason: 'квест недоступен' };
    // Лимит — только по NPC-квестам: building-инстансы (source
    // 'building', задача 000074) не считаются (зафиксированное
    // поведение: 5 NPC + 1 building сосуществуют; тесты
    // npc.test.js без building-инстансов — идентичное поведение).
    const activeNpc = Object.values(book.active).filter(
      (i) => i && i.source !== 'building').length;
    if (activeNpc >= MAX_ACTIVE_QUESTS) {
      return { ok: false, reason: 'слишком много активных квестов (' + MAX_ACTIVE_QUESTS + ')' };
    }
    const inst = { npcId: npc.id, questId, status: 'active', progress: 0 };
    if (Number.isInteger(day) && day >= 1) inst.day = day; // день выдачи
    book.active[questId] = inst;
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

  // --- Квесты постройки (задача 000074): новый источник 'building' ---
  // Определение квеста — из КАТАЛОГА постройки
  // (особые_параметры.квест записи обелиска: { id, название,
  // описание, цель, награда }), НЕ из npc.квесты; def передаёт
  // вызывающий (main.js) — каталог npc.js не нужен. ЛОГИКА
  // NPC-квестов (accept/turnIn/лимит/гигиена) — БЕЗ ИЗМЕНЕНИЙ;
  // единственная семантическая точка — лимит acceptQuest считает
  // только НЕ-building-инстансы (выше). Форма инстанса (book.
  // active[questId]): { source: 'building', tile: 'x,y', questId,
  // status: 'active', progress: 0, day? } — БЕЗ npcId (квест не
  // NPC-инициирован); следствие: строгий deserializeQuestBook его
  // отверг бы → building-инстансы НЕ ПИШУТСЯ в секцию quests
  // (guard serializeQuestBook ниже) и воссоздаются rehydrate из
  // раздела сейва buildingQuests (source of truth). Контракт —
  // memory/000074-rune-obelisk.md.

  // Ключ тайла 'x,y' (целые координаты, могут быть отрицательными) —
  // та же форма, что ключи раздела сейва buildingQuests
  // (building-effects.js).
  const BUILDING_TILE_KEY_RE = /^-?\d+,-?\d+$/;

  /**
   * Принимает квест постройки (source 'building'). БЕЗ лимит-
   * проверки (MAX_ACTIVE_QUESTS — для NPC-квестов; зафиксировано:
   * 5 NPC + 1 building сосуществуют). Повторная выдача — пока
   * active или после done — отказ (квест одноразовый). Мусорная
   * форма (book/questId/tileKey) — отказ, не TypeError (fail-open).
   * @param {object} book — журнал квестов (mutable)
   * @param {string} questId per-tile id (квест.id + '_' + x + '_' + y)
   * @param {string} tileKey ключ тайла 'x,y'
   * @param {number} [day] день мира при выдаче (гигиена 000029)
   * @returns {{ok:true}|{ok:false, reason}}
   */
  function acceptBuildingQuest(book, questId, tileKey, day) {
    if (!book || typeof book !== 'object' || Array.isArray(book) ||
        !book.active || typeof book.active !== 'object' ||
        Array.isArray(book.active)) {
      return { ok: false, reason: 'квест недоступен' };
    }
    if (typeof questId !== 'string' || questId === '') {
      return { ok: false, reason: 'квест недоступен' };
    }
    if (typeof tileKey !== 'string' ||
        !BUILDING_TILE_KEY_RE.test(tileKey)) {
      return { ok: false, reason: 'квест недоступен' };
    }
    if (book.active[questId] ||
        (Array.isArray(book.done) && book.done.includes(questId))) {
      return { ok: false, reason: 'квест недоступен' };
    }
    const inst = { source: 'building', tile: tileKey, questId,
      status: 'active', progress: 0 };
    if (Number.isInteger(day) && day >= 1) inst.day = day; // день выдачи
    book.active[questId] = inst;
    return { ok: true };
  }

  /**
   * Выполняет квест постройки (source 'building'). Награда — ровно
   * один раз: единственный путь к ней — однократный переход
   * active → done. def — определение ИЗ КАТАЛОГА (вызывающий);
   * предметы — атомарно (паттерн turnInQuest: инвентарь полон →
   * откат, квест остаётся active — повтор следующее прикосновение);
   * золото — напрямую; опыт — ШТАТНЫЙ P.addXp (с Учёным —
   * установленный паттерн turnInQuest для NPC-квестов).
   * @returns {{ok:true, quest, reward:{xp,gold,items}}|
   *          {ok:false, reason}}
   */
  function completeBuildingQuest(book, def, character, questId) {
    if (!book || typeof book !== 'object' || Array.isArray(book) ||
        !book.active || typeof book.active !== 'object' ||
        !book.active[questId]) {
      return { ok: false, reason: 'квест не в работе' };
    }
    if (!character || typeof character !== 'object' ||
        Array.isArray(character)) {
      return { ok: false, reason: 'квест недоступен' };
    }
    if (!def || typeof def !== 'object' || Array.isArray(def)) {
      return { ok: false, reason: 'квест не найден' };
    }
    const reward = def.награда;
    if (!reward || typeof reward !== 'object' || Array.isArray(reward)) {
      return { ok: false, reason: 'квест не найден' };
    }
    // Награда-предметы атомарно: либо весь набор, либо ничего.
    const items = Array.isArray(reward.предметы) ? reward.предметы : [];
    const given = [];
    for (const g of items) {
      if (!g || typeof g !== 'object' || Array.isArray(g) ||
          typeof g.предмет !== 'string') continue; // мусор — пропуск
      const add = I.addItem(character, g.предмет, g.количество);
      if (!add.ok) {
        for (const d of given) {
          I.removeItem(character, d.предмет, d.количество);
        }
        return { ok: false, reason: 'инвентарь полон' };
      }
      given.push(g);
    }
    character.gold += Number.isFinite(reward.золото) ? reward.золото : 0;
    P.addXp(character, Number.isFinite(reward.опыт) ? reward.опыт : 0);
    delete book.active[questId];
    if (!Array.isArray(book.done)) book.done = [];
    book.done.push(questId);
    return {
      ok: true,
      quest: def,
      reward: { xp: reward.опыт, gold: reward.золото, items },
    };
  }

  /**
   * Воссоздаёт 'active' инстансы квестов постройки в журнале из
   * раздела сейва buildingQuests (source of truth; секция quests
   * сейва содержит ТОЛЬКО NPC-инстансы — строгий deserialize).
   * Идемпотентно: существующие ключи НЕ затирает; done — не
   * зеркалируется; мусорный ввод (не Map / битая запись) —
   * отброс без исключений. Вызывается main.js ПОСЛЕ quests-блока
   * restoreFromSave (questBook должен быть восстановлен).
   * @param {object} book — журнал квестов (mutable)
   * @param {Map<string, {questId: string, day: number,
   *         status: 'active'|'done'}>} m
   */
  function rehydrateBuildingQuests(book, m) {
    if (!book || typeof book !== 'object' || Array.isArray(book)) return;
    if (!book.active || typeof book.active !== 'object' ||
        Array.isArray(book.active)) {
      book.active = {};
    }
    if (!Array.isArray(book.done)) book.done = [];
    if (!m || typeof m.forEach !== 'function') return;
    m.forEach((v, k) => {
      if (!v || typeof v !== 'object' || Array.isArray(v)) return;
      if (v.status !== 'active') return; // done — не зеркалируется
      if (typeof v.questId !== 'string' || v.questId === '') return;
      if (book.active[v.questId]) return; // идемпотентно: не затирает
      const inst = { source: 'building', tile: String(k),
        questId: v.questId, status: 'active', progress: 0 };
      if (Number.isInteger(v.day) && v.day >= 1) inst.day = v.day;
      book.active[v.questId] = inst;
    });
  }

  /** Активные квесты для журнала: [{ quest, instance }]. */
  function activeQuests(npcs, book) {
    return Object.values(book.active).map((instance) => ({
      quest: questDef(npcs, instance.npcId, instance.questId),
      instance,
    }));
  }

  // --- Персистентность (задача 000029): журнал квестов и сток NPC ---
  // Чистые сериализация/валидация для общего сейва (механизм —
  // src/save.js). Невалидная структура → null: вызывающий делает тихий
  // сброс с console.warn (игра не роняется).

  /**
   * Журнал квестов → JSON-безопасная структура
   * `{ active: { questId: {npcId, questId, status, progress, day?} },
   *    done: [questId] }`. Копия: мутации исходного не влияют на результат.
   * @returns {object|null} null, если book не объект.
   */
  function serializeQuestBook(book) {
    if (!book || typeof book !== 'object' || Array.isArray(book)) return null;
    const active = {};
    for (const [qid, inst] of Object.entries(book.active || {})) {
      if (!inst || typeof inst !== 'object' || Array.isArray(inst)) continue;
      // Квест постройки (source 'building', 000074) — НЕ в секцию
      // quests: строгий deserializeQuestBook его отверг бы (нет
      // npcId) — секция сбросила бы весь журнал. Source of truth
      // building-квестов — раздел сейва buildingQuests; на restore
      // инстанс воссоздаёт rehydrateBuildingQuests.
      if (inst.source === 'building') continue;
      const out = { npcId: inst.npcId, questId: inst.questId,
        status: inst.status, progress: inst.progress };
      if (inst.day != null) out.day = inst.day;
      active[qid] = out;
    }
    const done = Array.isArray(book.done)
      ? book.done.filter((id) => typeof id === 'string') : [];
    return { active, done };
  }

  /**
   * Структура из сейва → журнал квестов.
   * @returns {object|null} null, если структура некорректна.
   */
  function deserializeQuestBook(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
    if (!data.active || typeof data.active !== 'object' ||
        Array.isArray(data.active)) return null;
    if (!Array.isArray(data.done)) return null;
    const active = {};
    for (const [qid, inst] of Object.entries(data.active)) {
      if (!inst || typeof inst !== 'object' || Array.isArray(inst)) return null;
      if (typeof inst.questId !== 'string' || inst.questId !== qid) return null;
      if (typeof inst.npcId !== 'string') return null;
      if (inst.status !== 'active' && inst.status !== 'ready') return null;
      if (!Number.isInteger(inst.progress) || inst.progress < 0) return null;
      if (inst.day != null &&
          (!Number.isInteger(inst.day) || inst.day < 1)) return null;
      const out = { npcId: inst.npcId, questId: inst.questId,
        status: inst.status, progress: inst.progress };
      if (inst.day != null) out.day = inst.day;
      active[qid] = out;
    }
    const done = data.done.filter((id) => typeof id === 'string');
    return { active, done };
  }

  /**
   * Гигиена дат (задача 000029): из активных квестов исключаются те,
   * что выданы ПОЗЖЕ дня мира (состояние противоречило бы датам).
   * Квесты без метки дня и `done` не трогаем.
   * @param {object} book — результат deserializeQuestBook
   * @param {number} worldDay — текущий день мира
   * @returns {{book: object, dropped: string[]}}
   */
  function pruneQuestBookByDay(book, worldDay) {
    if (!book || !book.active || !Number.isInteger(worldDay)) {
      return { book: book || createQuestBook(), dropped: [] };
    }
    const active = {};
    const dropped = [];
    for (const [qid, inst] of Object.entries(book.active)) {
      if (inst.day != null && inst.day > worldDay) {
        dropped.push(qid);
        continue;
      }
      active[qid] = inst;
    }
    return { book: { active, done: book.done || [] }, dropped };
  }

  /**
   * Сток NPC → JSON-безопасное `{ npcId: { itemId: qty } }` (копия).
   * @returns {object|null} null, если stocks не объект.
   */
  function serializeNpcStocks(stocks) {
    if (!stocks || typeof stocks !== 'object' || Array.isArray(stocks)) {
      return null;
    }
    const out = {};
    for (const [npcId, stock] of Object.entries(stocks)) {
      if (!stock || typeof stock !== 'object' || Array.isArray(stock)) continue;
      out[npcId] = {};
      for (const [itemId, qty] of Object.entries(stock)) {
        if (Number.isInteger(qty) && qty >= 0) out[npcId][itemId] = qty;
      }
    }
    return out;
  }

  /**
   * Восстановление стока торговцев из сейва с проверкой по каталогу:
   *   * неизвестный NPC / NPC без торговли — пропускается;
   *   * предмет, которого нет в каталоге NPC, — отбрасывается;
   *   * qty > начального — сжимается до начального, qty < 0 — 0;
   *   * отсутствующий предмет — начальный сток.
   * @returns {object} `{ npcId: { itemId: qty } }` (может быть пустым)
   */
  function restoreNpcStocks(npcs, saved) {
    const out = {};
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return out;
    for (const [npcId, stock] of Object.entries(saved)) {
      if (!stock || typeof stock !== 'object' || Array.isArray(stock)) continue;
      const npc = npcById(npcs, npcId);
      const initial = npc && defaultStock(npc);
      if (!initial) continue;
      const restored = {};
      for (const [itemId, init] of Object.entries(initial)) {
        const q = stock[itemId];
        restored[itemId] = (Number.isInteger(q) && q >= 0)
          ? Math.min(q, init)
          : init;
      }
      out[npcId] = restored;
    }
    return out;
  }

  return {
    MAX_ACTIVE_QUESTS,
    npcById, npcsForBuilding, npcForBuilding, skillLevel, hireCandidates,
    dialogOptions,
    schoolSkills, schoolTrainPrice, schoolRefundPrice,
    canSchoolTrain, schoolTrain, canSchoolRefund, schoolRefund,
    defaultStock, createNpcShop, npcBuyPrice, npcSellPrice, npcBuy, npcSell,
    createQuestBook, questDef, availableQuests, acceptQuest,
    notifyGroupDefeated, refreshBringItems, turnInQuest, activeQuests,
    // Задача 000074: квесты постройки (source 'building', аддитивно).
    acceptBuildingQuest, completeBuildingQuest, rehydrateBuildingQuests,
    serializeQuestBook, deserializeQuestBook, pruneQuestBookByDay,
    serializeNpcStocks, restoreNpcStocks,
  };
});

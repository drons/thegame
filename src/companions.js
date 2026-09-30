// Спутники: ядро отряда (задача 000079, родитель 000065, SPEC.md
// «Спутники»): найм, отказ, лояльность, жалованье, увольнение, уход.
//
// ЧИСТЫЙ UMD-модуль без DOM/game-state (паттерн src/npc.js): в браузере —
// Game.companions (СТРОЧНОЕ имя — 000083/000087 вызывают G.companions),
// в node — require().
//
// Детерминизм (ЗАФИКСИРОВАНО): «мирового» rng нет и не вводится. Сид
// события = perlin.hash2(day, npcKey(npcId), константа_события), бросок
// = perlin.mulberry32(seed)() — одно значение [0,1) на новый генератор,
// без глобального состояния: тот же (день, npcId) — тот же исход.
// npcKey — детерминированное строка→uint32 (FNV-1a): perlin.hash2(day,
// строка) ВЫРОЖДАЕТСЯ (Math.imul(NaN)→0 — все наёмники имели бы ОДИН
// сид на день, отказы/уходы синхронизировались бы).
// Разные события — разные константы (3-й аргумент hash2).
// Повторная попытка найма в тот же день — тот же исход отказа
// (воспроизводимость, НЕ баг; UI-лог учитывает это — 000083).
//
// Форма записи отряда ЗАФИКСИРОВАНА под сейв 000085: ровно
// {npcId, level, xp, loyalty, hiredDay} (000082/000085 не меняют).
//
// Опыт и уровни (задача 000082, SPEC.md «Спутники» → «Опыт и уровни»):
// applyCombatXp — применяет c.result.allyXp (доля боевого xp, combat.js)
// к записям: xp += доля, повышение порогом xpForNext (while — один бой
// может дать несколько уровней; остаток копится между боями); тихий
// skip «призраков»/мусора; возврат {applied, levelUps, events}.
// allyDataForEntry — мост в бой (000087): данные makeAlly из записи +
// каталога найма (id — npcId, level — из записи; рост статов
// имплицитный — makeAlly пересчитывает из уровня; «призрак» → null).
// Контракт — memory/000082-companion-xp.md.
//
// Зависимости: global-settings.js (max_companions, companion_loyalty,
// companion_refusal — читаются ЖИВО при вызове, паттерн combat.js, не
// захват при загрузке), perlin.js (hash2/mulberry32),
// npc.js (skillLevel/hireCandidates — стабильный API 000078),
// player.js (xpForNext — порог уровня, 000082; в браузере — топовый
// ключ Game.xpForNext, в node — require).

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    // Порядок merge = порядок index.html (player.js ДО npc.js): у обоих
    // общий ключ skillLevel — побеждает версия npc.js (читает primary
    // ПЕРЕД secondary — refusalChance/loyalty от Харизмы, 000079).
    module.exports = factory(
      require('./global-settings.js'),
      Object.assign({}, require('./perlin.js'), require('./player.js'),
        require('./npc.js')));
  } else {
    const G0 = typeof root.Game === 'object' ? root.Game : {};
    root.Game = Object.assign({}, G0,
      { companions: factory(G0.GlobalSettings, G0) });
  }
})(typeof globalThis !== 'undefined' ? globalThis : self,
function (settings, G) {

  if (!settings || typeof settings.SETTINGS !== 'object') {
    throw new Error('companions.js: не найдены глобальные настройки — ' +
      'загрузите global-settings.js до companions.js');
  }
  if (typeof G.hash2 !== 'function' || typeof G.mulberry32 !== 'function') {
    throw new Error('companions.js: не найден perlin.js — ' +
      'загрузите perlin.js до companions.js');
  }
  if (typeof G.hireCandidates !== 'function' ||
      typeof G.skillLevel !== 'function') {
    throw new Error('companions.js: не найден npc.js — ' +
      'загрузите npc.js до companions.js');
  }
  // player.js (xpForNext — порог уровня, 000082): в браузере топовый
  // ключ Game.xpForNext (player.js разворачивает экспорты прямо в
  // Game, не в Game.Player).
  if (typeof G.xpForNext !== 'function') {
    throw new Error('companions.js: не найден player.js — ' +
      'загрузите player.js до companions.js');
  }

  // Разные события — разные константы-сиды (3-й аргумент hash2).
  const SEED_REFUSE = 0x72656675; // 'refu' — отказ при найме
  const SEED_QUIT = 0x71756974;   // 'quit' — уход при неоплате

  // npcId (строка) → uint32 (FNV-1a): без числового ключа hash2(day,
  // строка) вырождается (см. шапку) — наёмников по дням не отличить.
  function npcKey(id) {
    let h = 0x811c9dc5;
    const s = String(id);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  /** Сид события: (день, npcId, kind 'refuse'|'quit') → uint32. */
  function eventSeed(day, npcId, kind) {
    return G.hash2(day, npcKey(npcId),
      kind === 'refuse' ? SEED_REFUSE : SEED_QUIT);
  }

  // Одиночный бросок [0,1) на свежем генераторе (глобального состояния
  // нет — mulberry32 возвращает замыкание, оно тут же и выбрасывается).
  function roll(seed) {
    return G.mulberry32(seed)();
  }

  // --- Отряд ---

  /** Пустой отряд — массив записей спутника. */
  function createRoster() {
    return [];
  }

  // NPC записи в каталоге с найм-данными | null («призрак» — тихий
  // skip; окончательная валидация roster — 000085).
  function npcForEntry(npcs, entry) {
    const npc = (npcs || []).find((n) => n && n.id === entry.npcId) || null;
    return (npc && npc.найм && typeof npc.найм === 'object') ? npc : null;
  }

  // Шанс отказа: база − доля×Харизма − доля×Артист (min 0). Настройки
  // читаются ЖИВО (тесты меняют SETTINGS без перезагрузки модуля).
  function refusalChance(character) {
    const r = settings.SETTINGS.companion_refusal;
    const charisma = G.skillLevel(character, 'charisma');
    const artist = G.skillLevel(character, 'artist');
    return Math.max(0, r.base
      - r.charisma_per_level * charisma
      - r.artist_per_level * artist);
  }

  // --- Найм ---

  /**
   * Детерминированные проверки найма (для disabled-кнопок, 000083):
   * найм-данные → место в отряде → не дубль → золото ≥ цена.
   * @returns {{ok:boolean, reason?:string}} reason — человекочитаемая
   *   причина (первая невыполненная проверка).
   */
  function canHire(roster, npc, character) {
    if (!npc || !npc.найм || typeof npc.найм !== 'object' ||
        typeof npc.найм.цена !== 'number') {
      return { ok: false, reason: 'у NPC нет найм-данных' };
    }
    const max = settings.SETTINGS.max_companions;
    if (roster.length >= max) {
      return { ok: false, reason: 'отряд полный (максимум ' + max + ')' };
    }
    if (roster.some((e) => e.npcId === npc.id)) {
      return { ok: false, reason: 'NPC уже в отряде' };
    }
    if (character.gold < npc.найм.цена) {
      return { ok: false,
        reason: 'мало золота (нужно ' + npc.найм.цена + ')' };
    }
    return { ok: true };
  }

  /**
   * Найм NPC.
   * @param {number} day день мира — сид броска отказа: воспроизводимо
   *   по (день, npcId), без «мирового» rng.
   * @returns {{ok:true, entry, loyalty}
   *         |{refused:true, reason}
   *         |{ok:false, reason}}
   *   Отказ ({refused:true}) — не сбой canHire ({ok:false}): 000083 по
   *   флагу `refused` пишет текст в npcLog. При отказе золото НЕ
   *   списывается. Лояльность новичка: min(100, старт + Харизма, 1:1).
   */
  function hire(roster, npc, character, day) {
    const check = canHire(roster, npc, character);
    if (!check.ok) return { ok: false, reason: check.reason };
    const chance = refusalChance(character);
    if (chance > 0 && roll(eventSeed(day, npc.id, 'refuse')) < chance) {
      return { refused: true, reason: 'NPC отказался вступать в отряд' };
    }
    const loyalty = Math.min(100, Math.max(0,
      settings.SETTINGS.companion_loyalty.start
      + G.skillLevel(character, 'charisma')));
    const entry = { npcId: npc.id, level: 1, xp: 0, loyalty, hiredDay: day };
    roster.push(entry);
    character.gold -= npc.найм.цена;
    return { ok: true, entry, loyalty };
  }

  // --- Увольнение ---

  /** Можно ли уволить (NPC — член отряда). */
  function canDismiss(roster, npcId) {
    if (roster.some((e) => e.npcId === npcId)) return { ok: true };
    return { ok: false, reason: 'NPC не в отряде' };
  }

  /**
   * Увольнение: возврат денег НЕТ; повторный найм после увольнения
   * возможен (даже в тот же день — тот же (день, npcId)-сид отказа).
   * @returns {{ok:true}|{ok:false, reason}}
   */
  function dismiss(roster, npcId) {
    const check = canDismiss(roster, npcId);
    if (!check.ok) return { ok: false, reason: check.reason };
    const i = roster.findIndex((e) => e.npcId === npcId);
    roster.splice(i, 1);
    return { ok: true };
  }

  // --- Жалованье и лояльность (смена дня, 000087) ---

  /** Σ найм.жалованье по отряду («призраки» — тихий skip). */
  function wagesTotal(roster, npcs) {
    let total = 0;
    for (const e of roster || []) {
      const npc = npcForEntry(npcs, e);
      if (npc && typeof npc.найм.жалованье === 'number') {
        total += npc.найм.жалованье;
      }
    }
    return total;
  }

  /**
   * Жалованье при смене дня:
   *   * пусто (total = 0: пустой отряд или отряд из одних «призраков»)
   *     → {paid:true, total:0, events:[]} — БЕЗ события, чтобы 000087
   *     не написал «Жалованье выплачено» при нулевом жалованье;
   *   * gold ≥ Σ жалованье → списать, каждому реальному члену отряда
   *     +loyalty.paid (cap 100);
   *   * иначе → золото НЕ списывается, каждому −loyalty.unpaid
   *     (floor 0) и проверка ухода по НОВОЙ лояльности:
   *     ≤ quit_low — уйдёт верно, (quit_low…quit_high] —
   *     quit_chance_mid по сиду (день, npcId), > quit_high — остаётся.
   * «Призраки» (npcId нет в каталоге) — тихий skip, запись не
   * отбрасывается (валидация — 000085).
   * @returns {{paid:boolean, total:number, events:object[]}}
   *   events: [{type:'wages_paid'|'wages_unpaid', total}] +
   *   [{type:'left', npcId}] ушедших (в порядке отряда).
   */
  function payWages(roster, npcs, character, day) {
    const s = settings.SETTINGS.companion_loyalty;
    const total = wagesTotal(roster, npcs);
    const events = [];
    const real = [];
    for (const e of roster) {
      if (npcForEntry(npcs, e)) real.push(e);
    }
    if (total === 0) {
      // Пустой отряд / одни «призраки»: событий НЕТ (иначе 000087
      // написал бы «выплачено жалованье 0»). При total = 0 и инварианте
      // gold ≥ 0 unpaid-ветка недостижима — guard полный.
      return { paid: true, total: 0, events };
    }
    if (character.gold >= total) {
      character.gold -= total;
      for (const e of real) {
        e.loyalty = Math.min(100, e.loyalty + s.paid);
      }
      events.push({ type: 'wages_paid', total });
      return { paid: true, total, events };
    }
    for (const e of real) {
      e.loyalty = Math.max(0, e.loyalty - s.unpaid);
    }
    events.push({ type: 'wages_unpaid', total });
    for (const e of real) {
      let leaves = false;
      if (e.loyalty <= s.quit_low) {
        leaves = true; // уйдёт верно
      } else if (e.loyalty <= s.quit_high) {
        leaves = roll(eventSeed(day, e.npcId, 'quit')) < s.quit_chance_mid;
      }
      if (leaves) {
        roster.splice(roster.indexOf(e), 1);
        events.push({ type: 'left', npcId: e.npcId });
      }
    }
    return { paid: false, total, events };
  }

  // 000087 пишет «payWages / loyaltyTick» — экспорт-алиас.
  const loyaltyTick = payWages;

  // --- Кандидаты в таверне (каталог 000078) ---

  /**
   * Кандидаты вкладки «найм» (стабильный API 000078, Npc.hireCandidates):
   * найм-данные, не нанят сейчас, не мёртв (deadMercs). Порядок =
   * порядок каталога, возвращаются ССЫЛКИ на записи каталога.
   */
  function candidatesForTavern(npcs, roster, deadMercs) {
    const hired = new Set((roster || []).map((e) => e.npcId));
    const dead = new Set(deadMercs || []);
    return G.hireCandidates(npcs).filter(
      (n) => !hired.has(n.id) && !dead.has(n.id));
  }

  // --- Опыт и уровни (задача 000082) ---

  /**
   * Применяет долю боевого опыта к записям отряда (задача 000082,
   * SPEC.md «Спутники» → «Опыт и уровни»).
   * @param {Array} roster отряд (записи {npcId, level, xp, loyalty,
   *   hiredDay}) — мутируется.
   * @param {Array} gains c.result.allyXp = [{id, xp}] (000082: id —
   *   npcId, xp — доля каждого выжившего; «фолбэк-мусор» после
   *   сейва/UI допустим).
   * @returns {{applied:number, levelUps:number, events:object[]}}
   *   ЧИСТАЯ функция (без rng/DOM, паттерн payWages):
   *   * xp += доля; повышение уровня порогом xpForNext (src/player.js):
   *     while-цикл — один бой может дать НЕСКОЛЬКО уровней; остаток xp
   *     копится между боями (в записи). Потолка уровня в v1 нет (как у
   *     игрока — SPEC);
   *   * ТИХИЙ skip (без исключений, applied не считает): запись не
   *     найдена («призрак»/неизвестный id), xp ≤ 0, xp не число
   *     (NaN/«мусор»), gains не массив (null/строка/объект/undefined)
   *     → {applied:0, levelUps:0, events:[]}, roster без изменений;
   *   * events: [{type:'level_up', npcId, level}] — событие на каждое
   *     повышение (level — НОВОЕ значение), в порядке записей roster.
   *     Паттерн payWages.events: 000087 → hudFlash + saveNow.
   *     Отдельных xp-событий нет («+N опыта» 000087 строит из
   *     c.result.allyXp сам).
   *   Форма записи НЕМЕНЯЕТСЯ (сейв 000085): новых полей нет, очков
   *   навыков нет (v1).
   */
  function applyCombatXp(roster, gains) {
    const events = [];
    let applied = 0;
    let levelUps = 0;
    if (!Array.isArray(gains)) return { applied, levelUps, events };
    const entries = roster || [];
    for (const g of gains) {
      if (!g || typeof g.xp !== 'number' ||
          !Number.isFinite(g.xp) || g.xp <= 0) continue;
      const e = entries.find((x) => x && x.npcId === g.id);
      if (!e) continue;
      e.xp += g.xp;
      applied += 1;
      while (e.xp >= G.xpForNext(e.level)) {
        e.xp -= G.xpForNext(e.level);
        e.level += 1;
        levelUps += 1;
        events.push({ type: 'level_up', npcId: e.npcId, level: e.level });
      }
    }
    return { applied, levelUps, events };
  }

  /**
   * Мост в бой (задача 000082, для 000087): данные makeAlly из записи
   * отряда + каталога найма:
   *   {id: npc.id (— npcId), name, role, level: entry.level, dmg, hp,
   *   armor?, skills, spells, kind:'merc'}.
   * Рост статов ИМПЛИЦИТНЫЙ: в запись статы не пишутся (форма
   * зафиксирована) — makeAlly пересчитывает maxHP/damage/armor из
   * нового уровня при следующем createCombat (формулы makeMob).
   * «Призрак» (npc нет / найм-данных нет / entry.npcId ≠ npc.id) →
   * null (тихий skip — 000087 не шлёт таких в бой).
   */
  function allyDataForEntry(entry, npc) {
    if (!entry || !npc || npc.id !== entry.npcId) return null;
    const h = npc.найм;
    if (!h || typeof h !== 'object') return null;
    return {
      id: npc.id,
      name: npc.имя,
      role: h.роль,
      level: entry.level,
      dmg: h.dmg,
      hp: h.hp,
      armor: h.armor,
      skills: (h.skills || []).slice(),
      spells: (h.spells || []).slice(),
      kind: 'merc',
    };
  }

  return {
    createRoster, canHire, hire, canDismiss, dismiss,
    wagesTotal, payWages, loyaltyTick, candidatesForTavern, eventSeed,
    // Опыт и уровни (задача 000082): применение доли боевого xp и
    // мост roster → данные makeAlly (000087).
    applyCombatXp, allyDataForEntry,
  };
});

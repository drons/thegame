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
// Зависимости: global-settings.js (max_companions, companion_loyalty,
// companion_refusal — читаются ЖИВО при вызове, паттерн combat.js, не
// захват при загрузке), perlin.js (hash2/mulberry32),
// npc.js (skillLevel/hireCandidates — стабильный API 000078).

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('./global-settings.js'),
      Object.assign({}, require('./perlin.js'), require('./npc.js')));
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

  return {
    createRoster, canHire, hire, canDismiss, dismiss,
    wagesTotal, payWages, loyaltyTick, candidatesForTavern, eventSeed,
  };
});

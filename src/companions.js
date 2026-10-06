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
// Форма записи отряда (000143, 000139 C3): RUNTIME — ровно 6 ключей
// {npcId, sheet, level, xp, loyalty, hiredDay}, где sheet — единый
// лист наёмника (kind 'merc', 000140), а level/xp — ПЛОСКИЕ ЗЕРКАЛА
// sheet.level/sheet.xp (читатели — ui.js/rosterSummary — не меняем).
// Зеркала синхронизируются ровно в 3 точках: hire, applyCombatXp
// (после Sheet.addXp), deserializeRoster (backfill/sanitize).
// ФОРМА СЕЙВА — ровно 4 поля {npcId, sheet, loyalty, hiredDay}
// (level/xp — ВНУТРИ sheet, зеркала не сейвятся). Старая 5-полевая
// форма {npcId, level, xp, loyalty, hiredDay} (000082/000085) —
// НЕЛОМАННЫЙ вход: backfill при восстановлении (sheet из каталога
// найма, level/xp переносятся, totalXp = xp, points 0). Контракт —
// memory/000143-merc-sheet.md.
//
// Опыт и уровни (задача 000082, SPEC.md «Спутники» → «Опыт и уровни»;
// 000143: через единый лист): applyCombatXp — применяет
// c.result.allyXp (доля боевого xp, combat.js) к записям через
// Sheet.addXp (000140: порог 50/141/260 при xpMult 1, +2 очка за
// уровень — тратятся в UI, 000145); тихий skip «призраков»/мусора;
// возврат {applied, levelUps, events} без изменений.
// allyDataForEntry — мост в бой (000087): данные makeAlly из записи +
// каталога найма; боевые статы — maxHP/damage как OVERRIDES
// data.maxHP/data.damage из Sheet.derived + merc-модификатор
// (формулы makeAlly НЕ переписываются, явная damage × moraleMult —
// combat.js, 000112 D6); навыки/spells — из sheet. «Призрак»/запись
// без sheet → null. Контракт — memory/000082-companion-xp.md.
//
// Сериализация для сейва (задача 000085; 000143 — 4 поля):
// serializeRoster — чистая проекция {npcId, sheet, loyalty, hiredDay}
// (свежая копия sheet; запись без sheet — тихий skip);
// deserializeRoster — «призрак» (000029): {roster, dropped} | null,
// тихая (warn печатает main.js), каталог — ПАРАМЕТР (новых require
// НЕТ): старая форма — backfill, новая — sanitizeMercSheet (битое
// ядро → dropped, чистка полей — запись живёт). Контракт —
// memory/000085-save-party-efir.md (D2/D3) + 000143 §2.5/§2.6.
//
// Зависимости: global-settings.js (max_companions, companion_loyalty,
// companion_refusal — читаются ЖИВО при вызове, паттерн combat.js, не
// захват при загрузке), perlin.js (hash2/mulberry32),
// npc.js (skillLevel/hireCandidates — стабильный API 000078),
// player.js (порядок загрузки — guard: xpForNext топовый ключ Game,
// в node — require; порог уровня теперь — Sheet.addXp;
// SECONDARY_SKILLS — каталог вторичных навыков для sanitize),
// sheet.js (Game.Sheet — единый лист, 000140: createSheet/addXp/
// derived; в браузере — Game.Sheet, в node — require; порядок
// index.html: sheet.js → player.js → npc.js → companions.js).

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    // Порядок merge = порядок index.html (player.js ДО npc.js): у обоих
    // общий ключ skillLevel — побеждает версия npc.js (читает primary
    // ПЕРЕД secondary — refusalChance/loyalty от Харизмы, 000079).
    // sheet.js (000143): Game.Sheet — единый лист; циклов НЕТ (sheet.js
    // требует только global-settings/skills-data).
    module.exports = factory(
      require('./global-settings.js'),
      Object.assign({}, require('./perlin.js'), require('./player.js'),
        require('./npc.js'), { Sheet: require('./sheet.js') }));
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
  // sheet.js (Game.Sheet — единый лист, 000140/000143): лист наёмника
  // создаётся при найме, опыт — Sheet.addXp, боевые статы —
  // Sheet.derived + merc-модификатор. Гвард СТОИТ ПОСЛЕ player.js:
  // тест «без player.js» (tests/companions.test.js) не загружает ни
  // player.js, ни sheet.js — срабатывать должен player-гвард.
  if (!G.Sheet || typeof G.Sheet.createSheet !== 'function' ||
      typeof G.Sheet.addXp !== 'function' ||
      typeof G.Sheet.derived !== 'function') {
    throw new Error('companions.js: не найден Game.Sheet — ' +
      'загрузите sheet.js до companions.js (задача 000143)');
  }

  // Ключи базовых характеристик (000141: найм.базовые_характеристики)
  // — тот же набор id, что у PRIMARY_SKILLS (контракт каталога).
  const PRIMARY_IDS = ['strength', 'dexterity', 'constitution',
    'intelligence', 'wisdom', 'charisma'];

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
    // 000143 (000139 C3): запись — 6 ключей: sheet (канонический
    // merc-лист из каталога найма, 000141) + плоские зеркала level/xp
    // (1/0 при найме; читатели — ui.js/rosterSummary — не меняем).
    const sheet = createMercSheet(npc);
    const entry = { npcId: npc.id, sheet, level: 1, xp: 0, loyalty,
      hiredDay: day };
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

  // --- Сводка отряда (задача 000086, панель «Отряд» — src/ui.js) ---

  /**
   * Сводка отряда для панели «Отряд» (задача 000086): состав —
   * имя/уровень/лояльность/жалованье по записям + строка Эфира.
   * @param {Array|null} roster записи {npcId, sheet, level, xp,
   *   loyalty, hiredDay} (000143: 6 ключей; функция читает ТОЛЬКО
   *   плоские поля level/loyalty — плоская форма 000082/000085
   *   остаётся валидным входом) — READ-ONLY, функция не мутирует;
   *   не массив → тихий empty.
   * @param {Array|null} npcs каталог (Game.NpcData.NPCS): источник
   *   имени (npc.имя) и жалованья (npc.найм.жалованье — НЕ из
   *   записи, прецедент wagesTotal).
   * @param {null|{level:number, maxHP:number}} efirData строка Эфира
   *   ПАРАМЕТРОМ (не чтение G.efir внутри: UMD-ловушка 000038 —
   *   снапшот Game при загрузке companions.js НЕ содержит efir.js;
   *   вызывающий — ui.js render — вычисляет ЛЕНИВО через
   *   G.efir.efirStats). В результате КЛЮЧЕЙ loyalty/wage НЕТ
   *   (000081: Эфир — не наёмник).
   * @returns {{members:Array<{npcId:string, name:string,
   *   level:number, loyalty:number, wage:?number}>, empty:boolean,
   *   efir:null|{level:number, maxHP:number}}}
   *   members — порядок = порядок roster; «призрак» (id нет в
   *   каталоге) — ГОЛЫЙ npcId (тихий, паттерн 000029/000083),
   *   wage = null (НЕ 0 — «жалованье 0 з/день» не строка); мусорные
   *   записи (null / без npcId) — тихий skip. ЧИСТАЯ функция
   *   (без DOM/rng/console, паттерн payWages).
   */
  function rosterSummary(roster, npcs, efirData) {
    const members = [];
    for (const e of roster || []) {
      if (!e || !e.npcId) continue; // мусорная запись — тихий skip
      const npc = (npcs || []).find((n) => n && n.id === e.npcId) || null;
      const level = (Number.isFinite(e.level) && e.level >= 1)
        ? e.level : 1;
      const loyalty = (Number.isFinite(e.loyalty) && e.loyalty >= 0)
        ? e.loyalty : 0;
      const wage = (npc && npc.найм &&
          typeof npc.найм.жалованье === 'number')
        ? npc.найм.жалованье : null;
      members.push({
        npcId: e.npcId,
        name: npc ? npc.имя : String(e.npcId),
        level,
        loyalty,
        wage,
      });
    }
    // Строка Эфира: оба поля finite (level ≥1, maxHP ≥0) — как
    // переданы (таблицу функция НЕ пересчитывает); null/мусор —
    // как отсутствует.
    let efir = null;
    if (efirData != null && typeof efirData === 'object' &&
        Number.isFinite(efirData.level) && efirData.level >= 1 &&
        Number.isFinite(efirData.maxHP) && efirData.maxHP >= 0) {
      efir = { level: efirData.level, maxHP: efirData.maxHP };
    }
    return {
      members,
      empty: !Array.isArray(roster) || roster.length === 0,
      efir,
    };
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

  // --- Единый лист наёмника (задача 000143, родитель 000139) ---
  // Контракт: memory/000143-merc-sheet.md (§2.4/§2.5/§2.6/§2.8),
  // мердж с 000141: исходные данные — из каталога найма
  // (базовые_характеристики / начальные_навыки / spells).
  //
  // Канонический merc-лист — 10 ключей createSheet('merc') (000140):
  // {kind:'merc', level, xp, totalXp, points, primary{6}, secondary{},
  // skillXp{}, spells[], npcId}. level/xp меняются ТОЛЬКО через
  // Sheet.addXp; запись дублирует их плоскими зеркалами e.level/e.xp
  // (§2.1 — ровно 3 точки синхронизации: hire, applyCombatXp,
  // deserializeRoster).

  /**
   * Лист при найме (000143 §2.4, 000141): primary — по ключам из
   * найм.базовые_характеристики (finite ≥ 1; иначе 1 + console.error
   // ОДИН РАЗ за вызов — деградация 000038/000053; в игре недостижимо —
   // 000141 гарантирует полноту); secondary — явные уровни из
   // найм.начальные_навыки (только int ≥ 1); requires ПЕРЕПРОВЕРЯТЬСЯ
   // НЕ ДОЛЖНЫ (решение А 000141: heavy/swordsman и archer/accuracy —
   // намеренные). createSheet('merc', initial) НЕ читает initial.skills
   // (000140) — secondary ставится ПОСЛЕ createSheet.
   */
  function createMercSheet(npc) {
    const h = (npc && npc.найм && typeof npc.найм === 'object')
      ? npc.найм : {};
    const base = h.базовые_характеристики;
    const primary = {};
    let warned = false;
    for (const k of PRIMARY_IDS) {
      const v = (base && typeof base === 'object') ? base[k] : NaN;
      if (typeof v === 'number' && Number.isFinite(v) && v >= 1) {
        primary[k] = v;
      } else {
        primary[k] = 1;
        if (!warned) {
          warned = true;
          console.error('companions.js: каталог найма ' + npc.id +
            ' повреждён (базовые_характеристики) — деградация к 1 ' +
            '(000038/000053; полнота гарантирована 000141)');
        }
      }
    }
    const sheet = G.Sheet.createSheet('merc',
      { primary, spells: h.spells, npcId: npc.id });
    const init = h.начальные_навыки;
    if (init && typeof init === 'object') {
      for (const [id, lv] of Object.entries(init)) {
        if (Number.isInteger(lv) && lv >= 1) sheet.secondary[id] = lv;
      }
    }
    return sheet;
  }

  // Свежая глубокая копия 10 ключей (сериализация — fresh-copy-пин
  // T1/CS-5: мутация input не меняет снапшот).
  function copyMercSheet(s) {
    return {
      kind: s.kind,
      level: s.level,
      xp: s.xp,
      totalXp: s.totalXp,
      points: s.points,
      primary: Object.assign({}, s.primary),
      secondary: Object.assign({}, s.secondary),
      skillXp: Object.assign({}, s.skillXp),
      spells: (Array.isArray(s.spells) ? s.spells : []).slice(),
      npcId: s.npcId,
    };
  }

  /**
   * Санитизация листа из сейва (000143 §2.6; прецедент
   * sanitizeSavedHero src/player.js):
   *   * ЯДРО → null (запись уходит в dropped, значения НЕ чиним —
   *     000085 «невалидная запись — тихий сброс»): не-объект/массив,
   *     kind ≠ 'merc', npcId ≠ npcId записи (строка), level — int ≥ 1,
   *     xp — finite ≥ 0, primary — ВСЕ 6 ключей finite ≥ 1;
   *   * чистка ПОЛЕЙ (запись живёт): secondary/skillXp — только пары
   *     с id из каталога вторичных навыков и int ≥ 0; spells — только
   *     строки; totalXp — finite ≥ 0, иначе xp (инвариант
   *     totalXp ≥ xp, 000140); points — int ≥ 0, иначе 0.
   * @returns {object|null} канонические 10 ключей со свежими вложенными
   *   объектами | null (ядро битое).
   */
  function sanitizeMercSheet(s, npcId) {
    if (!s || typeof s !== 'object' || Array.isArray(s)) return null;
    if (s.kind !== 'merc') return null;
    if (typeof s.npcId !== 'string' || s.npcId !== npcId) return null;
    if (!Number.isInteger(s.level) || s.level < 1) return null;
    if (typeof s.xp !== 'number' || !Number.isFinite(s.xp) || s.xp < 0) {
      return null;
    }
    const P = s.primary;
    if (!P || typeof P !== 'object' || Array.isArray(P)) return null;
    const primary = {};
    for (const k of PRIMARY_IDS) {
      const v = P[k];
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 1) {
        return null;
      }
      primary[k] = v;
    }
    // Поля: G.SECONDARY_SKILLS — в node из merge, в браузере из
    // разворота player.js в Game; не-объект (недостижимо: skills-data.js
    // в index.html до player.js) — пустой каталог (строгая чистка).
    const sk = (G.SECONDARY_SKILLS &&
        typeof G.SECONDARY_SKILLS === 'object')
      ? G.SECONDARY_SKILLS : {};
    const secondary = {};
    const skillXp = {};
    for (const [id, lv] of Object.entries(s.secondary || {})) {
      if (id in sk && Number.isInteger(lv) && lv >= 0) secondary[id] = lv;
    }
    for (const [id, bank] of Object.entries(s.skillXp || {})) {
      if (id in sk && Number.isInteger(bank) && bank >= 0) skillXp[id] = bank;
    }
    const spells = Array.isArray(s.spells)
      ? s.spells.filter((x) => typeof x === 'string') : [];
    const totalXp = (typeof s.totalXp === 'number' &&
        Number.isFinite(s.totalXp) && s.totalXp >= 0)
      ? s.totalXp : s.xp;
    const points = (Number.isInteger(s.points) && s.points >= 0)
      ? s.points : 0;
    return {
      kind: 'merc',
      level: s.level,
      xp: s.xp,
      totalXp,
      points,
      primary,
      secondary,
      skillXp,
      spells,
      npcId: s.npcId,
    };
  }

  /**
   * Модификатор kind для Sheet.derived (000140 S-4: hook возвращает
   * ПОЛНЫЙ объект) — боевые статы наёмника из листа + каталог найма:
   *   maxHP  = max(1, round(base.maxHP · hp · roleMult));
   *   damage = max(1, round((2 + 0.7·ур) · dmg · (1 + бонусы кулаков/
   *            тяжёлого/дальнего))).
   * roleMult ОБЯЗАТЕЛЕН: override-ветка обходит формульную ветку
   * makeAlly, где живёт hpRoleMult. Базовые бонусы (fist/heavy/
   * ranged) — те же, что у героя (makeAlly, combat.js); каталожные
   * кнопки dmg/hp — дифференциатор баланса (000141), level — формула
   * makeAlly (2 + 0.7·ур) + вторичные навыки через base. maxHP наёмника
   * без потраченных очков — ПЛОСКИЙ (рост — через 000145: очки).
   */
  function mercModifier(base, sheet, ctx) {
    const h = (ctx && ctx.h) || {};
    const roleMult = { support: 0.7, shield: 1.8 }[h.роль] || 1.0;
    const maxHP = Math.max(1,
      Math.round(base.maxHP * (h.hp || 1) * roleMult));
    const damage = Math.max(1, Math.round(
      (2 + 0.7 * sheet.level) * (h.dmg || 1)
      * (1 + base.fistDamageBonus + base.heavyDamageBonus
         + base.rangedDamageBonus)));
    return Object.assign({}, base, { maxHP, damage });
  }

  // --- Опыт и уровни (задача 000082) ---

  /**
   * Применяет долю боевого опыта к записям отряда (задача 000082,
   * SPEC.md «Спутники» → «Опыт и уровни»; 000143 — через единый лист).
   * @param {Array} roster отряд (записи {npcId, sheet, level, xp,
   *   loyalty, hiredDay}) — мутируется (sheet + зеркала).
   * @param {Array} gains c.result.allyXp = [{id, xp}] (000082: id —
   *   npcId, xp — доля каждого выжившего; «фолбэк-мусор» после
   *   сейва/UI допустим).
   * @returns {{applied:number, levelUps:number, events:object[]}}
   *   ЧИСТАЯ функция (без rng/DOM/console, паттерн payWages):
   *   * XP/LEVEL — ТОЛЬКО через Sheet.addXp(e.sheet, xp) (000140 S-3:
   *     порог 50/141/260 при xpMult 1; +2 очка за уровень — тратятся
   *     в UI, 000145; один бой может дать НЕСКОЛЬКО уровней —
   *     while внутри addXp; остаток xp копится между боями). Зеркала
   *     e.level/e.xp синхронизируются ПОСЛЕ addXp (§2.1);
   *   * запись БЕЗ sheet (плоский тестовый фикстура / старый формат без
   *     backfill — в игре недостижимо: deserializeRoster всегда даёт
   *     sheet, 000139 C3) — sheet материализуется на месте (дефолтный
   *     merc-лист + перенос level/xp, totalXp = xp) — тихое, без
   *     console (прецедент 000082);
   *   * ТИХИЙ skip (без исключений, applied не считает): запись не
   *     найдена («призрак»/неизвестный id), xp ≤ 0, xp не число
   *     (NaN/«мусор»), gains не массив (null/строка/объект/undefined)
   *     → {applied:0, levelUps:0, events:[]}, roster без изменений;
   *   * events: [{type:'level_up', npcId, level}] — событие на каждое
   *     повышение (level — НОВОЕ значение, по одному на уровень,
   *     по возрастанию), в порядке записей roster. Паттерн
   *     payWages.events: 000087 → hudFlash + saveNow. Отдельных
   *     xp-событий нет («+N опыта» 000087 строит из c.result.allyXp
   *     сам).
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
      if (!e.sheet || typeof e.sheet !== 'object' ||
          Array.isArray(e.sheet)) {
        // Лазный backfill плоской записи (§2.1, 000139 C3): тот же
        // приём, что в deserializeRoster (totalXp = xp — инвариант
        // totalXp ≥ xp, 000140; points — 0: в плоской форме не
        // копился).
        e.sheet = G.Sheet.createSheet('merc', { npcId: e.npcId });
        e.sheet.level = e.level;
        e.sheet.xp = e.xp;
        e.sheet.totalXp = e.xp;
      }
      const res = G.Sheet.addXp(e.sheet, g.xp);
      e.level = e.sheet.level; // зеркала (§2.1: 3 точки синхронизации)
      e.xp = e.sheet.xp;
      applied += 1;
      levelUps += res.levelsGained;
      // Событие на каждое повышение (levelsGained может быть > 1):
      // уровень — новое значение, по возрастанию, как в 000082.
      const finalLevel = e.sheet.level;
      for (let i = 1; i <= res.levelsGained; i++) {
        events.push({
          type: 'level_up',
          npcId: e.npcId,
          level: finalLevel - res.levelsGained + i,
        });
      }
    }
    return { applied, levelUps, events };
  }

  /**
   * Мост в бой (задача 000082, для 000087; 000143 — статы из листа):
   * данные makeAlly из записи отряда + каталога найма:
   *   {id: npc.id (— npcId), name, role, level: entry.level, maxHP,
   *   damage, armor?, skills, spells, kind:'merc'}.
   * 000143 (000139 §6.5): боевые статы — maxHP/damage из
   * Sheet.derived(entry.sheet, {modifier: mercModifier, h}) — как
   * OVERRIDES data.maxHP/data.damage: makeAlly берёт их БЕЗ
   * формульных пересчётов (ветки формул НЕ переписаны — Эфир/
   * 000144/простые фикстуры идут через data без maxHP/damage).
   * Кнопки dmg/hp из каталога (дифференциатор баланса, 000141) —
   * ВНУТРИ mercModifier, в data отдельно НЕ уходят. skills — id-список
   * из sheet.secondary, spells — из sheet.spells (в боях 000144+).
   * «Призрак» (npc нет / найм-данных нет / entry.npcId ≠ npc.id /
   * запись БЕЗ sheet — инвариант, в игре недостижимо) → null (тихий
   * skip — 000087 не шлёт таких в бой).
   */
  function allyDataForEntry(entry, npc) {
    if (!entry || !npc || npc.id !== entry.npcId) return null;
    const h = npc.найм;
    if (!h || typeof h !== 'object') return null;
    if (!entry.sheet || typeof entry.sheet !== 'object' ||
        Array.isArray(entry.sheet)) return null;
    const dd = G.Sheet.derived(entry.sheet,
      { modifier: mercModifier, h });
    if (!dd) return null; // деградация каталога (000140) — тихий skip
    return {
      id: npc.id,
      name: npc.имя,
      role: h.роль,
      level: entry.level, // зеркало = sheet.level (§2.1)
      maxHP: dd.maxHP,
      damage: dd.damage,
      armor: h.armor,
      skills: Object.keys(entry.sheet.secondary || {}),
      spells: (Array.isArray(entry.sheet.spells)
        ? entry.sheet.spells : []).slice(),
      kind: 'merc',
    };
  }

  // --- Сериализация отряда (задача 000085, «призрак» 000029) ---
  // Контракт: memory/000085-save-party-efir.md (D2/D3). Функции
  // ТИХИЕ (без console) — warn печатает main.js по returned dropped
  // и битым разделам (паттерн pruneQuestBookByDay 000072). Каталог
  // NPC — ПАРАМЕТР deserialize (новых require НЕТ, чистый UMD).

  /**
   * Снапшот отряда для сейва (data.companions): ЧИСТАЯ проекция ровно
   * {npcId, sheet, loyalty, hiredDay} (000143, 000139 C3: level/xp —
   * ВНУТРИ sheet, плоские зеркала не сейвятся; лишние поля записи
   * отбрасываются). sheet — СВЕЖАЯ глубокая копия (fresh-copy-пин T1).
   * Нормализации значений НЕТ — runtime всегда well-formed (loyalty —
   * clamped 0..100, payWages; hiredDay — целое), единая точка ремонта
   * — deserializeRoster. Тихая (0 console).
   * @param {Array} roster отряд; не-массив → [].
   * @returns {object[]} записи ровно 4 полей; запись не-объект / без
   *   строки npcId / БЕЗ sheet (инвариант-нарушение, в игре
   *   недостижимо) — тихий skip (неидентифицируемо).
   */
  function serializeRoster(roster) {
    if (!Array.isArray(roster)) return [];
    const snap = [];
    for (const e of roster) {
      if (!e || typeof e !== 'object' || Array.isArray(e) ||
          typeof e.npcId !== 'string') continue;
      if (!e.sheet || typeof e.sheet !== 'object' ||
          Array.isArray(e.sheet)) continue; // без sheet — skip
      snap.push({
        npcId: e.npcId,
        sheet: copyMercSheet(e.sheet),
        loyalty: e.loyalty,
        hiredDay: e.hiredDay,
      });
    }
    return snap;
  }

  /**
   * Восстановление отряда из сейва (data.companions), «призрак»
   * (000029): каталог-первый (прецедент restoreNpcStocks, src/npc.js)
   * — запись валидна только если npcId в каталоге с найм-данными
   * (критерий npcForEntry: self-cleaning при правках каталога).
   * Тихая (0 console) — warn печатает main.js по returned.
   * @param {Array} npcs каталог NPC (src/npc-data.js).
   * @param {*} raw data.companions из сейва.
   * @returns {{roster:object[], dropped:string[]}|null}
   *   * raw == null (старый сейв, поля нет) → {roster:[], dropped:[]}
   *     ТИХО (ПУСТОЙ отряд ЗАФИКСИРОВАНО ТЗ; main.js дополнительно
   *     гвардит rawC != null);
   *   * !Array.isArray(raw) (битый раздел) → null (main.js: warn
   *     «раздел некорректен» + roster.length = 0 — игра НЕ падает);
   *   * иначе — {roster (валидные, порядок сохранён), dropped
   *     (строки npcId)}: «призрак» / дубликат npcId / сверх
   *     max_companions (LIVE-чтение, guard int ≥ 1 иначе 3 — иначе
   *     slice(0, NaN) → [] и отряд молча испарялся) / битое число /
   *     битое ядро sheet → запись в dropped.
   *   Числа (D3, сброс ЗАПИСИ, не починка значения — SPEC
   *   «невалидные записи — тихий сброс»): level — int ≥ 1 (forged
   *   2.5 НЕ floor'ится, прецедент hero.level); xp — finite ≥ 0 КАК
   *   ЕСТЬ (дроби легитимны — прецедент hero.xp, 000082) — ОБА только
   *   для СТАРОЙ формы (e.sheet == null: в новом формате level/xp в
   *   сейве НЕТ — они внутри sheet, валидирует sanitizeMercSheet);
   *   loyalty — finite → clamp 0..100 без округления (77.5 валиден),
   *   не-finite → drop; hiredDay — finite ≥ 1 → floor (2.7 → 2).
   *   Не-объект / npcId не строка — тихий skip (в dropped НЕ попадает).
   *   000143 (000139 C3 — НЕЛОМАННЫЙ сейв): после числовых проверок —
   *   * e.sheet == null (СТАРАЯ форма 000082/000085: ровно
   *     {npcId, level, xp, loyalty, hiredDay}) — BACKFILL: sheet из
   *     каталога найма (createMercSheet), level/xp ПЕРЕНОСЯТСЯ в sheet
   *     (sheet.level = e.level, sheet.xp = e.xp, sheet.totalXp = e.xp
   *     — инвариант totalXp ≥ xp, НЕ 0; sheet.points = 0: в старой
   *     форме не копился);
   *   * e.sheet есть — sanitizeMercSheet: битое ЯДРО (kind/npcId/
   *     level/xp/primary) → запись в dropped (сброс, БЕЗ fallback на
   *     плоские поля — ТЗ), чистка полей (secondary/skillXp/spells/
   *     totalXp/points) — запись живёт;
   *   зеркальные e.level/e.xp записи — из sheet (sheet.level/sheet.xp).
   */
  function deserializeRoster(npcs, raw) {
    if (raw == null) return { roster: [], dropped: [] };
    if (!Array.isArray(raw)) return null;
    const maxRaw = settings.SETTINGS.max_companions;
    const max = (Number.isInteger(maxRaw) && maxRaw >= 1) ? maxRaw : 3;
    const roster = [];
    const dropped = [];
    const seen = new Set();
    for (const e of raw) {
      if (!e || typeof e !== 'object' || Array.isArray(e) ||
          typeof e.npcId !== 'string') continue; // неидентифицируемо
      const npc = npcForEntry(npcs, e);
      if (!npc) { dropped.push(e.npcId); continue; }
      if (seen.has(e.npcId)) { dropped.push(e.npcId); continue; }
      if (roster.length >= max) { dropped.push(e.npcId); continue; }
      // 000143: плоские level/xp в СЕЙВЕ есть только в СТАРОМ формате
      // (новый — {npcId, sheet, loyalty, hiredDay}: level/xp ВНУТРИ
      // sheet, он канон; serializeRoster зеркала не пишет). Проверки
      // level/xp (000085) действуют на старую форму; новый формат —
      // level/xp валидирует sanitizeMercSheet (ядро).
      if (e.sheet == null) {
        if (!Number.isInteger(e.level) || e.level < 1) {
          dropped.push(e.npcId); continue;
        }
        if (typeof e.xp !== 'number' || !Number.isFinite(e.xp) ||
            e.xp < 0) {
          dropped.push(e.npcId); continue;
        }
      }
      if (typeof e.loyalty !== 'number' || !Number.isFinite(e.loyalty)) {
        dropped.push(e.npcId); continue;
      }
      if (typeof e.hiredDay !== 'number' || !Number.isFinite(e.hiredDay) ||
          e.hiredDay < 1) {
        dropped.push(e.npcId); continue;
      }
      // 000143 (000139 C3): sheet — backfill (старая форма) или
      // sanitize (новая); «warn» о проблемах — канал dropped[]
      // (main.js печатает).
      let sheet;
      if (e.sheet == null) {
        sheet = createMercSheet(npc);
        sheet.level = e.level;
        sheet.xp = e.xp;
        sheet.totalXp = e.xp; // инвариант totalXp ≥ xp
        sheet.points = 0;
      } else {
        sheet = sanitizeMercSheet(e.sheet, e.npcId);
        if (sheet === null) { dropped.push(e.npcId); continue; }
      }
      seen.add(e.npcId);
      roster.push({
        npcId: e.npcId,
        sheet,
        level: sheet.level, // зеркала (§2.1)
        xp: sheet.xp,
        loyalty: Math.min(100, Math.max(0, e.loyalty)),
        hiredDay: Math.floor(e.hiredDay),
      });
    }
    return { roster, dropped };
  }

  return {
    createRoster, canHire, hire, canDismiss, dismiss,
    wagesTotal, payWages, loyaltyTick, candidatesForTavern, eventSeed,
    // Опыт и уровни (задача 000082): применение доли боевого xp и
    // мост roster → данные makeAlly (000087).
    applyCombatXp, allyDataForEntry,
    // Сериализация отряда для сейва (задача 000085; контракт
    // memory/000085-save-party-efir.md D2/D3).
    serializeRoster, deserializeRoster,
    // Сводка отряда (задача 000086): чистая функция для панели
    // «Отряд» (src/ui.js) — состав + строка Эфира.
    rosterSummary,
  };
});

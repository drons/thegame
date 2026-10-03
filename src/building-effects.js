// Реестр эффектов построек (задача 000071 — основание цепочки 000064).
//
// Чистый UMD-модуль: node — require(), браузер — Game.buildingEffects
// (паттерн day.js/npc.js). В момент загрузки — НОЛЬ зависимостей: ни
// require, ни захват Game-функций (взаимных require в vm-песочницах
// при загрузке НЕТ — прецедент 000053). canUseToday (day.js) — лениво
// из globalThis.Game в момент ВЫЗОВА, fallback — last !== day: модуль
// обязан работать в песочнице без day.js.
//
// Задача 000075 (телепорт-круг, id 41): первые РЕАЛЬНЫЕ записи и
// ЧИСТЫЕ функции переноса:
//   * linkTeleportCircles(circles, x, y, R, tieHash) →
//     { pairId: 'x,y' | null, reason?: 'no_pair' } — ближайший другой
//     круг по РАССТОЯНИЮ CHEBYSHEV в радиусе R (граница включительно);
//     якорь (x, y) сам (если в списке) игнорируется; при равенстве
//     расстояний — MIN tieHash(x, y); финальный тай-брейк — лекс.
//     (x, затем y). Пары АССИМЕТРИЧНЫ: каждый круг — к СВОЕМУ
//     ближайшему (симметрия НЕ гарантируется — зафиксировано A25).
//   * teleportDestination(anchor, size, passable, tieHash) →
//     {x, y} | null — проходимый тайл в footprint-соседстве парного
//     круга (кольцо dx -1..width, dy -1..height; внутренние тайлы
//     footprint'а — не кандидаты); oracle passable(x, y) — мир-
//     предикат main.js; порядок: ближайшие к якорю по Чебышеву,
//     затем tieHash, затем лекс.; нет проходимых → null.
//   * teleportCharge(hero, active, cost) → { ok, gold, message? } —
//     первое использование списывает стоимость, повтор (active) —
//     НЕ списывает, мало золота — отказ БЕЗ списания; hero не
//     мутируется.
//   * serializeTeleports(Map) / restoreTeleports(объект) — раздел
//     сейва data.teleports (имя зафиксировано 000072): 'x,y' →
//     { pair: 'px,py'|null, dest: 'dx,dy'|null, active: boolean };
//     мусорный раздел — пустой Map без исключения; мусорная запись —
//     отброс (fail-open, 000029); roundtrip.
//   * TELEPORT_TIE_SEED — сид tieHash для main.js (golden-пины).
//   * EFFECTS['41'] — «Активировать/Телепорт», БЕЗ лимита раз-в-день;
//     available/apply — по СНИМКУ сейва (dest и стоимость читает
//     main.js — у apply мира и каталога НЕТ, контракт 000072).
//
// Задача 000074 (рунический камень id 40 / обелиск id 42): первые
// эффекты-«действия» с раз-в-день ИЗ КАТАЛОГА (раз_в_день):
//   * EFFECTS['40'] — «Расшифровать»: шанс stoneChance =
//     min(1, шанс_база + шанс_шаг·Рунопись); ролл детерминирован
//     по (tile, day) — deterministicRoll(x, y, day, STONE_ROLL_SEED,
//     hash); успех — XP stoneXp = round((опыт_база + опыт_шаг·R)·
//     runePowerMult) (xpMult Учёного к камню НЕ применяется) +
//     фрагмент pickFragment(тексты, ..., STONE_TEXT_SEED, hash);
//     провал — попытка сгорела (ok:true — daily-марка ставится).
//   * EFFECTS['42'] — «Прикоснуться»: XP obeliskXp =
//     round((опыт_база + опыт_шаг·hero.level)·xpMult) («уровень
//     мира» = hero.level — решение memory/000074-rune-obelisk.md) +
//     лор-фрагмент (OBELISK_TEXT_SEED) + ОДНОРАЗОВЫЙ квест постройки
//     (определение — каталог запись.особые_параметры.квест; r.quest
//     при пустом снимке buildingQuests, r.questComplete при active;
//     исполнение — main.js/npc.js, source 'building').
//   * Детерминизм: НИКАКОГО Math.random/Date — только (tile, day)-
//     сиды (свои ASCII-константы, паттерн TELEPORT_TIE_SEED;
//     hash — ЛЕНИВО G.hash2 (perlin.js) в момент apply).
//   * serializeBuildingQuests/restoreBuildingQuests — раздел сейва
//     buildingQuests (имя — 000072): 'x,y' → { questId, day,
//     status: 'active'|'done' }; паттерн teleports (fail-open).
//   * apply ЧИСТО: параметры ТОЛЬКО из st.catalog (РЕШЁННАЯ запись);
//     state/hero/save не мутирует; G.hash2/G.derived/G.skillLevel
//     отсутствуют — { ok:false, message:'недоступно' }.
//
// Задача 000077 (магический круг id 43 / заброшенный храм id 39):
// единый механизм «ежедневный контент» (ОБЩИЙ для обоих id):
//   * ОДИН детерминированный ролл по (tile, day) РАЗ В ДЕНЬ
//     (каталожный флаг раз_в_день): 'chest'|'boss'|'relic' (доли —
//     каталог особые_параметры.эффект.доли, 000053). Повтор в тот же
//     день — «круг молчит: содержимое уже получено» (available по
//     СНИМКУ buildingContent, ДО daily-лимита пайплайна); день D+1 —
//     новый ролл. Состояние — раздел сейва buildingContent ('x,y' →
//     { day, type }; имя — резерв 000072); лут НЕ храним (R-5).
//   * ЧИСТЫЕ (tile, day)-функции (hash — ПАРАМЕТР; мусор → null):
//     rollBuildingContent (доли), chestLoot (таблица подземелий —
//     передаёт вызывающий), bossGroup (ЧИСЛО — боевой сид для
//     createCombat), relicItem (каталог эффект.реликвии); 4 СВОИ
//     ASCII-сида (НЕ GLOBAL_SEED, паттерн
//     STONE_ROLL_SEED; экспорт — golden-пины).
//   * EFFECTS['43'] «Круг» / EFFECTS['39'] «Храм» — ОДНО apply
//     (applyDailyContent, имя действия — параметр): ЧИСТ (000071) —
//     только ВОЗВРАТ { ok, type, item|seed, message } (сундук —
//     1 предмет таблицей ПО ТАЙЛУ (dungeonTypeFor(terrain, альфа
//     pixelAt, fallback 255)), БЕЗ золота; босс — боевой сид;
//     реликвия — id из каталога). МИР-ЭФФЕКТЫ (addItem/бой/запись
//     buildingContent) — спец-хендлер src/building-content.js
//     (000128 §2.3: у apply на это НЕТ ссылок).
//   * serializeBuildingContent/restoreBuildingContent — ОБЩИЕ для
//     всех «ежедневных» эффектов (whitelist BUILDING_CONTENT_TYPES —
//     ОДНА константа; паттерн teleports/buildingQuests, fail-open).
//   * Контракты — memory/000077-building-content.md (конкретика) и
//     memory/000077-daily-content.md (переиспользуемый механизм).
//
// Контракты (зафиксированы tests/building-effects.test.js):
//   * РЕЕСТР EFFECTS — id → { имя, разВДень?, available?(state),
//     apply?(state) → { ok, message?, buffs? } }. Задача 000071 —
//     ПУСТОЕ основание; 000076 добавляет записи храмов '36'
//     (Благословение, kind 'damage'), '37' («Сон» — подсказка),
//     '38' (Благословение, kind 'armor'); подзадачи
//     000074/000075/000077/000091–000095 добавляют только СВОИ.
//     r.buffs — НОВЫЙ массив (grantBuff, 000072): apply не
//     мутирует СНИМОК — живой массив меняет main.js общим хуком.
//     available?(state) — НЕДНЕВНАЯ доступность (state — тот же
//     СНИМОК { day, tile, hero, save }): истина (не строка) —
//     доступно; false/null/undefined/'' — недоступно (reason
//     «недоступно»); непустая строка — недоступно, строка — reason
//     (пример: телепорт-круг без пары — «молчит»). buildingActions
//     опрашивает available ДО проверки лимита раз-в-день:
//     недоступная строка — disabled, нажатие не доходит до apply
//     (ревью раунда 2: дыра контракта — available задокументирован,
//     но никогда не опрашивался).
//   * Чистая buildingActions(building, npc, state) →
//     [{ id, имя, доступен, reason? }]: сначала «Диалог» (id 'dialog',
//     имя 'Диалог'; если npc != null), затем эффекты (порядок каталога).
//     state = { day, tile: {x, y}, hero, save } — save: СНИМОК
//     collectSaveData() (обычный объект, 000072); строка СНИМОК не
//     мутирует (чистота).
//   * Связка «постройка → эффекты»: массив особых_параметры.эффекты
//     (порядок из каталога) ИЛИ, если массива нет, запись
//     EFFECTS[String(building.id)] — обычный 1-к-1 (камень 40,
//     обелиск 42, круг 43, …). Id без записи в реестре — пропуск.
//   * «Раз в день»: флаг ЧИТАЕТСЯ ИЗ КАТАЛОГА (принцип 000053):
//     hasDailyLimit(building, effectId) — особые_параметры.раз_в_день
//     (boolean — каталог побеждает, включая явное false); fallback (в
//     каталоге флага нет) — запись реестра разВДень === true, либо
//     исполняемый эффект (есть apply) — лимит по умолчанию (в этой
//     задаче каталог ещё без пер-эффектных флагов; 000074+ дописывает
//     раз_в_день в каталог, 000092 расширяет hasDailyLimit).
//     Лимит — canUseToday + раздел сейва buildingOncePerDay (000072):
//     ключ 'x,y:effectId' (целые координаты, могут быть отрицательными),
//     значение — день. Мусорный/отсутствующий сейв — fail-open (000029).
//   * reason при сгоревшем лимите: «уже использовано сегодня».

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    const G0 = typeof root.Game === 'object' ? root.Game : {};
    root.Game = Object.assign({}, G0, { buildingEffects: factory() });
  }
})(typeof globalThis !== 'undefined' ? globalThis : self, function () {

  // Ключ раздела сейва teleports — 'x,y' (целые координаты, могут
  // быть отрицательными). pair/dest — те же строки или null.
  const XY_KEY_RE = /^-?\d+,-?\d+$/;

  // Сид тай-брейка парности/цели телепорт-круга (000075): ASCII
  // 'TELP' — прецедент SUBTYPE_SEED_CONST (000073): СВОЯ константа,
  // НЕ GLOBAL_SEED. main.js передаёт (x, y) => G.hash2(x, y,
  // TELEPORT_TIE_SEED); экспорт — для golden-пинов.
  const TELEPORT_TIE_SEED = 0x54454c50;

  // Сообщение успеха переноса (зафиксировано A32/тестом).
  const TELEPORT_MSG = 'телепорт: перенос к парному кругу';

  // Сиды детерминированных роллов/фрагментов 000074 (ASCII, СВОИ
  // константы, НЕ GLOBAL_SEED — паттерн TELEPORT_TIE_SEED): экспорт
  // — для golden-пинов тестов (A47/B21–B23). Формулы:
  //   roll      = hash(x, y, seed ^ day) / 2^32  ∈ [0, 1);
  //   фрагмент  = тексты[hash(x, y, seed ^ day) % тексты.length].
  const STONE_ROLL_SEED = 0x53544e52;   // 'STNR' — ролл успеха камня
  const STONE_TEXT_SEED = 0x53544e54;   // 'STNT' — фрагмент камня
  const OBELISK_TEXT_SEED = 0x4f424c54; // 'OBLT' — фрагмент обелиска

  // Сиды детерминированных роллов 000077 «ежедневный контент»
  // (магический круг 43 / заброшенный храм 39): СВОИ ASCII-константы,
  // НЕ GLOBAL_SEED (паттерн STONE_ROLL_SEED); экспорт — golden-пины
  // (A55–A57). Формулы (контракт §2):
  //   тип контента  = hash(x, y, CONTENT_ROLL_SEED ^ day) / 2^32
  //                   (deterministicRoll, переиспользуется);
  //   предмет сундука = table[hash(x, y, CHEST_LOOT_SEED ^ day) % len]
  //                   (pickFragment-паттерн);
  //   боевой сид босса = hash(x, y, BOSS_COMBAT_SEED ^ day) — ЧИСЛО,
  //                   → opts.seed createCombat (состав/уровень —
  //                   стандартные формулы ядра, рецепт BUILDING_BOSS);
  //   реликвия      = реликвии[hash(x, y, RELIC_ITEM_SEED ^ day) % len].
  const CONTENT_ROLL_SEED = 0x434f4e54; // 'CONT' — тип контента (доли)
  const CHEST_LOOT_SEED = 0x43484553;   // 'CHES' — предмет сундука
  const BOSS_COMBAT_SEED = 0x424f5353;  // 'BOSS' — боевой сид босса
  const RELIC_ITEM_SEED = 0x52454c49;   // 'RELI' — реликвия

  // Whitelist типов «ежедневного контента» (раздел сейва
  // buildingContent): ОДНА константа на весь механизм (000077:
  // 'chest'/'boss'/'relic') — ЕДИНСТВЕННАЯ точка расширения для
  // будущих «ежедневных» эффектов (контракт — memory/000077-
  // daily-content.md §3; restoreBuildingContent валидирует по ней).
  // ВНЕШНИЕ значения — латиница (кодовое конвенции сейва, паттерн
  // teleports/buildingQuests); КЛЮЧИ каталожных долей — русские
  // (сундук/босс/реликвия, 000053) — решение R-1.
  const BUILDING_CONTENT_TYPES = ['chest', 'boss', 'relic'];
  // Сиды детерминированных роллов развалин 000094 (ASCII, СВОИ
  // константы, НЕ GLOBAL_SEED — паттерн STONE_*/TELEPORT_TIE_SEED):
  // экспорт — для golden-пинов тестов (A57/B24–B25). Формулы:
  //   содержимое = hash(x, y, RUINS_ROLL_SEED ^ day) / 2^32
  //                → кумулятивные пороги каталога эффект.доли;
  //   предмет    = предметы[hash(x, y, RUINS_LOOT_SEED ^ day) % len];
  //   фрагмент   = тексты[hash(x, y, RUINS_NOTE_SEED ^ day) % len].
  const RUINS_ROLL_SEED = 0x5255494e;   // 'RUIN' — ролл содержимого
  const RUINS_LOOT_SEED = 0x52554c54;   // 'RULT' — выбор предмета лута
  const RUINS_NOTE_SEED = 0x52554e54;   // 'RUNT' — выбор фрагмента записи

  // Раздел сейва teleports (имя зафиксировано 000072): чтение
  // записи СНИМКА по ключу 'x,y' — прототип-безопасно, с лёгкой
  // проверкой формы (fail-open, 000029): раздела нет / не объект /
  // запись не той формы → null (для available/apply — «нет
  // записи»; мусорная pair/dest строка — «нет пары»/«нет
  // проходимого»). Снимок не мутируется.
  function readTeleportEntry(st, key) {
    const save = st && st.save;
    if (!save || typeof save !== 'object' || Array.isArray(save)) return null;
    const m = save.teleports;
    if (!m || typeof m !== 'object' || Array.isArray(m)) return null;
    if (!Object.prototype.hasOwnProperty.call(m, key)) return null;
    const e = m[key];
    if (!e || typeof e !== 'object' || Array.isArray(e)) return null;
    const pair = (typeof e.pair === 'string' && XY_KEY_RE.test(e.pair))
      ? e.pair : null;
    const dest = (typeof e.dest === 'string' && XY_KEY_RE.test(e.dest))
      ? e.dest : null;
    return { pair, dest, active: !!e.active };
  }

  // Ключ тайла героя в снимке: 'x,y'.
  function tileKeyOf(st) {
    const t = st && st.tile;
    return (t ? t.x : 0) + ',' + (t ? t.y : 0);
  }

  // Реестр эффектов: id → { имя, разВДень?, available?(state),
  // apply?(state) → { ok, message? } }. В 000071 ПУСТ — подзадачи
  // 000074–000077/000091–000095 добавляют только СВОИ записи
  // (в КОНЕЦ объекта; запись '41' — только 000075).
  const EFFECTS = {
    // 000075: телепорт-круг (id 41, подтип слота 10 — 000073).
    // Разовая оплата (каталог особые_параметры.эффект.стоимость),
    // дальше бесплатно — лимита раз-в-день НЕТ нигде (ни каталог,
    // ни запись). available/apply — по СНИМКУ сейва (раздел
    // teleports): СКАН пары и dest делает main.js при первом
    // подходе и кэширует в сейве; у apply мира и каталога НЕТ —
    // он НЕ перемещает и НЕ списывает (исполнение — ханк r.teleport
    // в onBuildingAction main.js; контракт — memory/000075-
    // teleport-circles.md).
    '41': {
      имя: 'Активировать/Телепорт',
      available: (st) => {
        const e = readTeleportEntry(st, tileKeyOf(st));
        return (e && e.pair) ? true : 'круг молчит: нет пары вблизи';
      },
      apply: (st) => {
        const e = readTeleportEntry(st, tileKeyOf(st));
        if (!e || !e.pair) {
          return { ok: false, message: 'круг молчит: нет пары вблизи' };
        }
        if (!e.dest) {
          return {
            ok: false,
            message: 'нет проходимого тайла рядом с парным кругом',
          };
        }
        const sep = e.dest.indexOf(',');
        return {
          ok: true,
          message: TELEPORT_MSG,
          // dest ИЗ СНИМКА сейва (кэш скана первого подхода).
          teleport: {
            x: Number(e.dest.slice(0, sep)),
            y: Number(e.dest.slice(sep + 1)),
          },
        };
      },
    },
  };

  // --- Группа 000076: храмы (подтипы слота 8, 000073) ---
  // Солнце (36) — «Благословение» kind 'damage' (+5% урона, 1 день);
  // Гора (38) — «Благословение» kind 'armor' (+1 броня, 1 день);
  // Луна (37) — «Сон» — подсказка (БЕЗ раз-в-день — подсказка
  // бесплатна, флага в каталоге 000037.json нет; лимит — из каталога,
  // 000053). Раз_в_день для 36/38 — в каталоге (000036/000038.json,
  // паттерн 000043). Заброшенный храм (39) — задача 000077.
  // Записи 000074/000075/000077 добавляются их задачами (полный
  // набор ключей тестами НЕ фиксируется — конфликты при ребазе
  // параллельных веток: memory/000076-temple-blessings.md).
  EFFECTS['36'] = {
    имя: 'Благословение (солнце)',
    apply: (st) => applyBlessing(
      st, 'damage', 'Благословение солнца: +5% урона на 1 день.'),
  };
  EFFECTS['37'] = {
    имя: 'Сон',
    apply: (st) => {
      // «Сон» читает карту (map в СНИМОК state добавлен main.js —
      // read-only ссылка, задокументировано memory/000076-…):
      // подсказка детерминированна (окно, центрированное на
      // постройке, без RNG — ревью раунда 1).
      if (!st.map || typeof st.map !== 'object') {
        return { ok: false, message: 'недоступно' };
      }
      const tile = st.tile || { x: 0, y: 0 };
      const hint = moonDreamHint(st.map, tile.x, tile.y);
      if (!hint.entrance) {
        // Входов нет — сообщение, а не ошибка (подсказка
        // «не видно», A26).
        return { ok: true, message: 'Сон: входы в пещеры не видны.' };
      }
      // Имя типа — из DUNGEON_NAMES (лениво, dungeon.js); без
      // каталога/типа — общее «подземелье».
      let name = 'подземелье';
      const G = lazyGame();
      const names = G && G.DUNGEON_NAMES;
      if (hint.dungeonType != null && names &&
          typeof names[hint.dungeonType] === 'string') {
        name = names[hint.dungeonType];
      }
      return {
        ok: true,
        message: 'Сон: ' + name + ' — вход (' +
                 hint.entrance.x + ', ' + hint.entrance.y + ').',
      };
    },
  };
  EFFECTS['38'] = {
    имя: 'Благословение (гора)',
    apply: (st) => applyBlessing(
      st, 'armor', 'Благословение горы: +1 броня на 1 день.'),
  };

  // --- Группа 000074: рунический камень (40) и обелиск (42) ---
  // Раз-в-день — ИЗ КАТАЛОГА (особые_параметры.раз_в_день, паттерн
  // 000072/000043): в записях реестра разВДень НЕ ставится — каталог
  // побеждает (hasDailyLimit, 000053). Параметры (шанс, база/шаг XP,
  // тексты, квест) — ТОЛЬКО из ст.catalog (РешёННАЯ каталожная запись,
  // main.js передаёт catalog: b; каталога ГЛОБАЛЬНО в apply НЕТ —
  // 000053: код читает каталог, не хардкодит). apply ЧИСТО (000071):
  // state/hero/save не мутирует, G.addXp/accept* не вызывает — только
  // ВОЗВРАЩАЕТ результат (исполнение — ханки main.js, паттерн
  // r.teleport/r.buffs). Детерминизм — (tile, day)-сиды, ГЛОБАЛЬНОГО
  // RNG НЕТ. Контракт — memory/000074-rune-stone-obelisk.md.
  EFFECTS['40'] = {
    имя: 'Расшифровать',
    apply: (st) => applyRuneStone(st),
  };
  EFFECTS['42'] = {
    имя: 'Прикоснуться',
    apply: (st) => applyObelisk(st),
  };

  // --- Задача 000093: смотровая башня (id 46, подтип слота 12 —
  // 000073) — «Взглянуть» (разведка, без миникарты) ---
  // Окно Чебышёва R вокруг башни (тайл ИГРОКА — конвенция [E]:
  // действие доступно только на тайле постройки) помечается
  // «исследованными» — раздел сейва explored (имя — 000072; данные —
  // memory/000093-explored.md). НЕЗАВИСИМО ОТ ПРОХОДИМОСТИ (данные
  // разведки, не проходимость — вода/горы/чужие постройки помечаются).
  // Повтор — ИДЕМПОТЕНТНО (объединение множеств, дубликатов нет).
  // Лимита раз-в-день НЕТ (взгляд бесплатен и идемпотентен, ТЗ):
  // флага раз_в_день в каталоге нет И разВДень в записи не ставится →
  // hasDailyLimit('46') === false. R — ТОЛЬКО из каталога
  // (особые_параметры.эффект.радиус, 000053); МИНИКАРТА — ОТСРОЧЕНА
  // (ТЗ: здесь — только данные + HUD-индикатор).
  EFFECTS['46'] = {
    имя: 'Взглянуть',
    apply: (st) => applyExplore(st),
  };
  // --- Группа 000077: магический круг (43) и заброшенный храм (39) —
  // «ежедневный контент» (ОБЩИЙ механизм, ОДНО apply на оба id;
  // мир-эффекты — спец-хендлер src/building-content.js, 000128 §2.3) ---
  // Раз-в-день — ИЗ КАТАЛОГА (особые_параметры.раз_в_день: у 43 уже,
  // у 39 добавлен 000077) — в записях реестра разВДень НЕ ставится
  // (каталог побеждает, hasDailyLimit). available — по СНИМКУ
  // buildingContent (повтор в тот же день — ТЗ-строка, ДО
  // daily-лимита); apply ЧИСТ (000071): { ok, type, item|seed,
  // message }, параметров из st.catalog.особые_параметры.эффект
  // (000053: доли/реликвии — каталог). Контракт — memory/000077-
  // building-content.md.
  EFFECTS['43'] = {
    имя: 'Круг',
    available: dailyContentAvailable,
    apply: (st) => applyDailyContent(st, 'Круг'),
  };
  EFFECTS['39'] = {
    имя: 'Храм',
    available: dailyContentAvailable,
    apply: (st) => applyDailyContent(st, 'Храм'),
  };
  // --- Группа 000094: развалины (подтип слота 9, buildingId 48,
  // 000073 — вход в подземелье на них закрыт гардом maybeEnterDungeon)
  // ---
  // «Осмотреть» — РАЗ В ДЕНЬ (флаг раз_в_день — в каталоге 000048,
  // 000053; в записи разВДень НЕ ставится — каталог побеждает).
  // apply ЧИСТО: детерминированный ролл содержимого по (tile, day)
  // (лут 40 / ловушка 30 / запись 30 — каталог эффект.доли),
  // лут — itemId, запись — расшифровка по Интеллекту (чистое
  // сравнение level >= порог), ловушка — ЗАЯВЛЕННЫЙ урон
  // (каталог эффект.урон_ловушки); МИР-«сторона» (hp, инвентарь)
  // исполняет спец-модуль src/building-effect-48.js (контракт
  // 000128 §2.3: саморегистрация registerSpecial('48') — main.js и
  // building-actions.js НЕ ПРАВЯТСЯ). ЛЮБОЙ валидный исход — ok:true
  // (попытка сгорела, R3: daily-марка + saveNow — роутером);
  // ok:false — только «недоступно». Контракт — memory/000094-
  // ruins-inspect.md; числа/формулы — memory/000094-ruins.md.
  EFFECTS['48'] = {
    имя: 'Осмотреть',
    apply: (st) => applyRuins(st),
  };

  /**
   * Ids эффектов постройки — только те, что есть в реестре; порядок —
   * из каталога (массив особых_параметры.эффекты) либо 1-к-1 запись
   * EFFECTS[String(building.id)]. Дешёвая проверка БЕЗ сейва —
   * безопасно на каждый кадр (HUD-хук 000092).
   * @param {object} building запись каталога (id, особые_параметры)
   * @returns {string[]}
   */
  function effectIds(building) {
    if (!building || typeof building !== 'object') return [];
    const op = building.особые_параметры;
    if (op && Array.isArray(op.эффекты)) {
      return op.эффекты.filter((id) => (
        typeof id === 'string'
        && Object.prototype.hasOwnProperty.call(EFFECTS, id)));
    }
    // 1-к-1: запись по id постройки (рунический камень 40, обелиск 42,
    // круг 43, …).
    const id = String(building.id);
    return Object.prototype.hasOwnProperty.call(EFFECTS, id) ? [id] : [];
  }

  /** Эффекты есть (подсказка HUD; без сейва, дешёвый lookup). */
  function hasEffects(building) {
    return effectIds(building).length > 0;
  }

  /**
   * «Раз в день»: у эффекта есть лимит?
   * Флаг читается из КАТАЛОГА (принцип 000053):
   * особые_параметры.раз_в_день (boolean — каталог побеждает, включая
   * явное false над записью реестра). Fallback (в каталоге флага нет):
   * ТОЛЬКО запись реестра разВДень === true. Эффект БЕЗ флага —
   * ВСЕГДА доступен (повторяем в тот же день сколько угодно):
   * контракт плана 000064 — «фонтан: исцеление лимит / монета — нет»
   * (закреплено тестом B3).
   * @param {object} building запись каталога (id, особые_параметры)
   * @param {string} effectId id эффекта (ключ реестра)
   */
  function hasDailyLimit(building, effectId) {
    const op = building && building.особые_параметры;
    if (op && typeof op.раз_в_день === 'boolean') return op.раз_в_день;
    const entry = EFFECTS[effectId];
    return !!(entry && entry.разВДень === true);
  }

  // Запись сейва 'x,y:effectId' → день. Отсутствует/мусор (не объект,
  // массив) — fail-open (000029): undefined. Прототип-безопасно.
  function readOncePerDay(save, key) {
    if (!save || typeof save !== 'object') return undefined;
    const m = save.buildingOncePerDay;
    if (!m || typeof m !== 'object' || Array.isArray(m)) return undefined;
    return Object.prototype.hasOwnProperty.call(m, key) ? m[key] : undefined;
  }

  // Game в момент ВЫЗОВА (ленивый захват, паттерн 000053): модуль
  // обязан грузиться с НОЛЕМ зависимостей (ни require, ни захват
  // Game-функций в момент загрузки); все Game-функции читаются из
  // globalThis.Game только когда их вызывают.
  function lazyGame() {
    return typeof globalThis !== 'undefined' ? globalThis.Game : null;
  }

  // canUseToday (day.js:105) — ЛЕНИВО из globalThis.Game в момент
  // вызова: модуль обязан грузиться в vm-песочнице БЕЗ day.js
  // (прецедент 000053); fallback — то же сравнение last !== day.
  function canUseTodayLazy(lastUsedDay, day) {
    const G = lazyGame();
    if (G && typeof G.canUseToday === 'function') {
      return G.canUseToday(lastUsedDay, day);
    }
    return lastUsedDay !== day;
  }

  // --- Задача 000076: благословения храмов (солнце 36 / гора 38) и
  // «Сон» храма луны (37). Заброшенный храм (39) — задача 000077.
  //
  // Благословение — МИРНОЕ состояние с дедлайном (000072): apply
  // ВЕРНЕТ НОВЫЙ массив благословений (Game.grantBuff — чистый,
  // ЛЕНИВО из globalThis.Game; паттерн canUseTodayLazy) — живой
  // массив buffs меняет main.js ОБЩИМ хуком «apply вернул новое
  // состояние» (r.buffs) ПЕРЕД saveNow. СНИМОК (state) не
  // мутируется (000071/A12). grantBuff отсутствует — fail-open
  // { ok:false, message:'недоступно' } (000029). Множители/сила
  // НЕ здесь: фиксированы на вид в day.js (SUN_DAMAGE_MULT /
  // MOUNTAIN_ARMOR, 000072) — каталог описывает эффект текстом +
  // раз_в_день.
  function applyBlessing(st, kind, message) {
    const G = lazyGame();
    if (!G || typeof G.grantBuff !== 'function') {
      return { ok: false, message: 'недоступно' };
    }
    const tile = st.tile || { x: 0, y: 0 };
    const save = st.save || {};
    const next = G.grantBuff(save.buffs, tile.x + ',' + tile.y, st.day, kind);
    return { ok: true, buffs: next, message };
  }

  // --- Задача 000074: рунический камень (40) и обелиск (42) ---
  // Чистые формулы/роллы — (tile, day)-СИДЫ (НИКАКОГО Math.random —
  // детерминизм, ТЗ); hash-функция — ПАРАМЕТР (в песочницах —
  // инъект perlin.hash2, в игре — ленивый G.hash2). Параметры (шанс,
  // база/шаг XP, тексты, квест) — ТОЛЬКО из ст.catalog (РешёННАЯ
  // каталожная запись, 000053 — код читает каталог, не хардкодит);
  // каталога ГЛОБАЛЬНО в apply НЕТ. apply НЕ мутирует state/hero/save
  // и НЕ вызывает G.addXp/accept* — только ВОЗВРАЩАЕТ результат
  // (исполнение — ханки main.js; контракт —
  // memory/000074-rune-stone-obelisk.md).

  /**
   * Детерминированный ролл по (tile, day) ∈ [0, 1):
   * `hash(x, y, seed ^ day) / 2^32` (day ВКЛЮЧЁН — детерминизм по
   * дню; вариант без day отвергнут). Чистый (hash — параметр).
   * @param {number} x координата тайла
   * @param {number} y
   * @param {number} day день мира
   * @param {number} seed сид (STONE_ROLL_SEED и пр.)
   * @param {(x: number, y: number, seed: number) => number} hash
   * @returns {number} [0, 1)
   */
  function deterministicRoll(x, y, day, seed, hash) {
    return hash(x, y, seed ^ day) / 4294967296;
  }

  /**
   * Детерминированный фрагмент по (tile, day):
   * `тексты[hash(x, y, seed ^ day) % тексты.length]`. Мусорные
   * тексты (не массив/пусто) → null (без исключения; apply сам
   * валидирует тексты). Чистый (hash — параметр).
   * @returns {string|null}
   */
  function pickFragment(texts, x, y, day, seed, hash) {
    if (!Array.isArray(texts) || texts.length === 0) return null;
    return texts[hash(x, y, seed ^ day) % texts.length];
  }

  /** Per-tile questId квеста постройки: `baseId + '_' + x + '_' + y`. */
  function questIdForTile(baseId, x, y) {
    return baseId + '_' + x + '_' + y;
  }

  /**
   * Шанс камня: `min(1, шанс_база + шанс_шаг·R)` (кап 1.0 — сырое
   * 1.25 при R=20). effect — объект каталога (валидирует apply).
   * @returns {number} [0, 1]
   */
  function stoneChance(effect, R) {
    const base = effect && effect.шанс_база;
    const step = effect && effect.шанс_шаг;
    if (!Number.isFinite(base) || !Number.isFinite(step)) return 0;
    return Math.min(1, base + step * (Number(R) || 0));
  }

  /**
   * XP камня: `round((опыт_база + опыт_шаг·R) · runePowerMult)`.
   * xpMult Учёного к камню НЕ применяется (решение —
   * memory/000074-rune-obelisk.md; существующий derived —
   * явный потребитель).
   * @returns {number}
   */
  function stoneXp(effect, R, runePowerMult) {
    const base = effect && effect.опыт_база;
    const step = effect && effect.опыт_шаг;
    const mult = Number(runePowerMult) || 0;
    if (!Number.isFinite(base) || !Number.isFinite(step)) return 0;
    return Math.round((base + step * (Number(R) || 0)) * mult);
  }

  /**
   * XP обелиска: `round((опыт_база + опыт_шаг·L) · xpMult)`.
   * «Уровень мира» = hero.level (решение —
   * memory/000074-rune-obelisk.md; 000092 — та же трактовка).
   * xpMult — существующий derived Учёного.
   * @returns {number}
   */
  function obeliskXp(effect, L, xpMult) {
    const base = effect && effect.опыт_база;
    const step = effect && effect.опыт_шаг;
    const mult = Number(xpMult) || 0;
    if (!Number.isFinite(base) || !Number.isFinite(step)) return 0;
    return Math.round((base + step * (Number(L) || 0)) * mult);
  }

  // Тексты каталога — ≥1 непустая строка (валидация apply).
  function validTexts(texts) {
    return Array.isArray(texts) && texts.length >= 1 &&
      texts.every((t) => typeof t === 'string' && t.length > 0);
  }

  // Эффект-ОБЪЕКТ решённой каталожной записи (000074, конвенция
  // 000075): ст.catalog.особые_параметры.эффект; отсутствует/мусор —
  // null (деградация «недоступно»).
  function catalogEffect(st) {
    const c = st && st.catalog;
    if (!c || typeof c !== 'object' || Array.isArray(c)) return null;
    const op = c.особые_параметры;
    if (!op || typeof op !== 'object' || Array.isArray(op)) return null;
    const eff = op.эффект;
    if (!eff || typeof eff !== 'object' || Array.isArray(eff)) return null;
    return eff;
  }

  /**
   * Раздел сейва buildingQuests (000074; source of truth): запись
   * СНИМКА по ключу 'x,y' — прототип-безопасно, fail-open (000029).
   * Возврат:
   *   null — раздела/ключа НЕТ (записи нет) — квест К ВЫДАЧЕ;
   *   { questId: string|null, status: 'active'|'done'|null } —
   *     запись ЕСТЬ: 'active' → к выполнению; 'done' ИЛИ мусор
   *     (status null) → ни выдачи, ни выполнения (повторно не
   *     выдаётся; мусор не даёт двойной награды).
   * Снимок не мутируется.
   * @returns {{questId: string|null, status: string|null}|null}
   */
  function readBuildingQuestEntry(st, key) {
    const save = st && st.save;
    if (!save || typeof save !== 'object' || Array.isArray(save)) {
      return null;
    }
    const m = save.buildingQuests;
    if (!m || typeof m !== 'object' || Array.isArray(m)) return null;
    if (!Object.prototype.hasOwnProperty.call(m, key)) return null;
    const e = m[key];
    if (!e || typeof e !== 'object' || Array.isArray(e)) {
      return { questId: null, status: null };
    }
    return {
      questId: (typeof e.questId === 'string') ? e.questId : null,
      status: (e.status === 'active' || e.status === 'done')
        ? e.status : null,
    };
  }

  /**
   * «Расшифровать» (рунический камень, 40): один раз в день (флаг
   * каталога раз_в_день — hasDailyLimit). Успех (ролл < шанс) —
   * XP + фрагмент зашифрованного текста (оба детерминированы по
   * (tile, day)); провал — попытка СГОРЕЛА: ok:true (R3: ok-ветка
   * main.js ставит daily-марку + saveNow — иначе повтор в тот же
   * день был бы доступен, а ТЗ: повтор → недоступно), БЕЗ
   * xp/fragment. Недневной отказ (нет Game-функций / мусор
   * каталога / невалидный hero — не-объект) — { ok:false,
   * message:'недоступно' }.
   * @returns {{ok: boolean, success?: boolean, xp?: number,
   *            fragment?: string, message?: string}}
   */
  function applyRuneStone(st) {
    const G = lazyGame();
    if (!G || typeof G.hash2 !== 'function' ||
        typeof G.derived !== 'function' ||
        typeof G.skillLevel !== 'function') {
      return { ok: false, message: 'недоступно' };
    }
    const eff = catalogEffect(st);
    if (!eff) return { ok: false, message: 'недоступно' };
    if (!Number.isFinite(eff.шанс_база) || !Number.isFinite(eff.шанс_шаг) ||
        !Number.isFinite(eff.опыт_база) || !Number.isFinite(eff.опыт_шаг)) {
      return { ok: false, message: 'недоступно' };
    }
    if (typeof eff.навык !== 'string') {
      return { ok: false, message: 'недоступно' };
    }
    const texts = eff.тексты;
    if (!validTexts(texts)) return { ok: false, message: 'недоступно' };
    const hero = st && st.hero;
    // Герой — объект (ревью: асимметрия с applyObelisk — null/
    // не-объект раньше уходил в TypeError из G.skillLevel/G.derived
    // вместо задокументированной деградации «недоступно»).
    if (!hero || typeof hero !== 'object' || Array.isArray(hero)) {
      return { ok: false, message: 'недоступно' };
    }
    const tile = st.tile || { x: 0, y: 0 };
    const x = tile.x, y = tile.y, day = st.day;
    // Уровень навыка ИЗ КАТАЛОГА (в игре — G.skillLevel из npc.js;
    // 'runes' — вторичный навык).
    const R = G.skillLevel(hero, eff.навык);
    const success = deterministicRoll(x, y, day, STONE_ROLL_SEED, G.hash2)
      < stoneChance(eff, R);
    if (!success) {
      return {
        ok: true,
        success: false,
        message: 'Расшифровка: руны молчат — попытка сгорела.',
      };
    }
    const xp = stoneXp(eff, R, G.derived(hero).runePowerMult);
    const fragment = pickFragment(texts, x, y, day, STONE_TEXT_SEED, G.hash2);
    return {
      ok: true,
      success: true,
      xp,
      fragment,
      message: 'Расшифровка: успех (+' + xp + ' оп.). «' + fragment + '»',
    };
  }

  /**
   * «Прикоснуться» (обелиск, 42): один раз в день (каталог).
   * Каждый прикосновение — XP по «уровню мира» (= hero.level) +
   * лор-фрагмент (детерминированы по (tile, day)). ОДНОРАЗОВЫЙ
   * квест постройки — по СНИМКУ buildingQuests (прототип-безопасно):
   *   * записи НЕТ + квест-определение валидно → r.quest
   *     { questId: questIdForTile(квест.id, x, y), day } — ВЫДАЧА
   *     (первое прикосновение);
   *   * запись status 'active' → r.questComplete = запись.questId
   *     (ПЕРСИСТИРОВАННЫЙ id — каталог мог измениться) — ВЫПОЛНЕНИЕ;
   *   * 'done' или мусор → ни того, ни другого (повторно не
   *     выдаётся).
   * Определение квеста — каталог записи (особые_параметры.квест:
   * { id, название, описание, цель, награда }); невалидное — квест
   * просто не в результате (XP/фрагмент — не бьёт).
   * @returns {{ok: boolean, xp?: number, fragment?: string,
   *            message?: string, quest?: {questId: string, day: number},
   *            questComplete?: string}}
   */
  function applyObelisk(st) {
    const G = lazyGame();
    if (!G || typeof G.hash2 !== 'function' ||
        typeof G.derived !== 'function') {
      return { ok: false, message: 'недоступно' };
    }
    const eff = catalogEffect(st);
    if (!eff) return { ok: false, message: 'недоступно' };
    if (!Number.isFinite(eff.опыт_база) || !Number.isFinite(eff.опыт_шаг)) {
      return { ok: false, message: 'недоступно' };
    }
    const texts = eff.тексты;
    if (!validTexts(texts)) return { ok: false, message: 'недоступно' };
    const hero = st && st.hero;
    // «Уровень мира» = hero.level (решение 000074; единая
    // трактовка с 000092).
    const L = hero && hero.level;
    if (!Number.isFinite(L)) return { ok: false, message: 'недоступно' };
    const tile = st.tile || { x: 0, y: 0 };
    const x = tile.x, y = tile.y, day = st.day;
    const xp = obeliskXp(eff, L, G.derived(hero).xpMult);
    const fragment = pickFragment(
      texts, x, y, day, OBELISK_TEXT_SEED, G.hash2);
    const out = {
      ok: true,
      xp,
      fragment,
      message: 'Обелиск: +' + xp + ' оп. «' + fragment + '»',
    };
    const c = st.catalog;
    const quest = c && c.особые_параметры && c.особые_параметры.квест;
    const questValid = quest && typeof quest === 'object' &&
      !Array.isArray(quest) &&
      typeof quest.id === 'string' && quest.id !== '' &&
      // название — непустая строка (ревью: main.js печатает
      // def.название в HUD при r.quest/r.questComplete — без
      // названия это было бы «Квест получен: undefined»;
      // невалидное определение — квест просто не в результате,
      // XP/фрагмент не бьёт, как при мусорной награде).
      typeof quest.название === 'string' && quest.название !== '' &&
      quest.награда && typeof quest.награда === 'object' &&
      !Array.isArray(quest.награда) &&
      Number.isFinite(quest.награда.опыт) &&
      Number.isFinite(quest.награда.золото);
    if (questValid) {
      const entry = readBuildingQuestEntry(st, x + ',' + y);
      if (entry === null) {
        // Первое прикосновение — выдача (per-tile questId).
        out.quest = { questId: questIdForTile(quest.id, x, y), day };
      } else if (entry.status === 'active') {
        // Следующее прикосновение — выполнение (персистированный
        // questId).
        out.questComplete = entry.questId;
      }
      // 'done'/мусор — ничего (повторной выдачи нет).
    }
    return out;
  }

  // --- Задача 000077: «ежедневный контент» (круг 43 / храм 39) ---
  // Единый детерминированный механизм для обоих id: ОДИН ролл по
  // (tile, day) РАЗ В ДЕНЬ (каталожный флаг раз_в_день):
  // 'chest'|'boss'|'relic' (доли — каталог особые_параметры.
  // эффект.доли, 000053). Чистый слой: НОЛЬ Math.random/Date —
  // только (tile, day)-сида (4 СВОИ ASCII-константы, НЕ
  // GLOBAL_SEED); hash — ПАРАМЕТР чистых функций (в песочницах —
  // инъект perlin.hash2, в apply — ленивый G.hash2). МИР-ЭФФЕКТЫ
  // (addItem/бой/запись buildingContent) — НЕ здесь: у apply на это
  // НЕТ ссылок (000071) — их исполняет спец-хендлер
  // src/building-content.js (000128 §2.3). Контракт —
  // memory/000077-building-content.md (§2/§4/§7), переиспользуемый
  // механизм — memory/000077-daily-content.md.

  /**
   * Раздел сейва buildingContent (имя — резерв 000072): запись
   * СНИМКА по ключу 'x,y' — прототип-безопасно, fail-open (000029):
   * раздела нет / запись не той формы (не объект; day не integer ≥
   * 1; type вне whitelist) → null (для available — «нет записи»;
   * лут НЕ храним — повтор «молчит», содержимое выдано, R-5).
   * Снимок не мутируется.
   * @returns {{day: number, type: string}|null}
   */
  function readBuildingContentEntry(st, key) {
    const save = st && st.save;
    if (!save || typeof save !== 'object' || Array.isArray(save)) {
      return null;
    }
    const m = save.buildingContent;
    if (!m || typeof m !== 'object' || Array.isArray(m)) return null;
    if (!Object.prototype.hasOwnProperty.call(m, key)) return null;
    const e = m[key];
    if (!e || typeof e !== 'object' || Array.isArray(e)) return null;
    if (!Number.isInteger(e.day) || e.day < 1) return null;
    if (typeof e.type !== 'string' ||
        BUILDING_CONTENT_TYPES.indexOf(e.type) === -1) {
      return null;
    }
    return { day: e.day, type: e.type };
  }

  // Доли каталога (000053): каждый ключ (сундук/босс/реликвия) —
  // finite число [0, 1]; мусор/отсутствие ключа → false (rollBuilding-
  // Content → null, apply деградирует «недоступно»).
  function validShares(доли) {
    if (!доли || typeof доли !== 'object' || Array.isArray(доли)) {
      return false;
    }
    return ['сундук', 'босс', 'реликвия'].every((k) => {
      const v = доли[k];
      return typeof v === 'number' && Number.isFinite(v) &&
        v >= 0 && v <= 1;
    });
  }

  /**
   * Тип «ежедневного контента» (000077): один детерминированный
   * ролл по (tile, day) → 'chest'|'boss'|'relic' по КУМУЛЯТИВНЫМ
   * долям в ФИКСИРОВАННОМ порядке каталога: roll <
   * доли.сундук → 'chest'; roll < доли.сундук + доли.босс → 'boss';
   * остаток → 'relic'. roll = hash(x, y, CONTENT_ROLL_SEED ^ day) /
   * 2^32 (deterministicRoll, переиспользуется; день ВКЛЮЧЁН —
   * день D+1 = новый ролл). Мусорные доли → null (без исключений;
   * apply сам деградирует). Чистый (hash — параметр).
   * @param {object} доли каталог эффект.доли
   * @returns {'chest'|'boss'|'relic'|null}
   */
  function rollBuildingContent(x, y, day, доли, hash) {
    if (!validShares(доли)) return null;
    const roll = deterministicRoll(x, y, day, CONTENT_ROLL_SEED, hash);
    if (roll < доли.сундук) return 'chest';
    if (roll < доли.сундук + доли.босс) return 'boss';
    return 'relic';
  }

  /**
   * Предмет сундука (000077): id из ТАБЛИЦЫ по (tile, day)
   * (pickFragment-паттерн): table[hash(x, y, CHEST_LOOT_SEED ^ day)
   * % table.length]. table — МАССИВ id (таблица подземелий) —
   * передаёт ВЫЗЫВАЮЩИЙ (apply) — чистота: без зависимостей от
   * dungeon.js в node-тесте. Мусорная/пустая таблица → null.
   * Чистый (hash — параметр).
   * @returns {string|null}
   */
  function chestLoot(x, y, day, table, hash) {
    if (!Array.isArray(table) || table.length === 0) return null;
    return table[hash(x, y, CHEST_LOOT_SEED ^ day) % table.length];
  }

  /**
   * Боевой сид босса (000077): ЧИСЛО hash(x, y, BOSS_COMBAT_SEED ^
   * day) — передаётся в createCombat (opts.seed); состав и уровень —
   * СТАНДАРТНЫЕ формулы ядра (рецепт GROUP_RECIPES.BUILDING_BOSS,
   * level = max(1, hero.level ± level_delta_max) — R-3), не
   * собственные. Тот же (tile, day) + тот же hero.level → тот же
   * босс (детерминизм по сиду). Чистый (hash — параметр).
   * @returns {number}
   */
  function bossGroup(x, y, day, hash) {
    return hash(x, y, BOSS_COMBAT_SEED ^ day);
  }

  /**
   * Реликвия (000077): id из каталожного списка эффект.реликвии по
   * (tile, day) (pickFragment-паттерн):
   * реликвии[hash(x, y, RELIC_ITEM_SEED ^ day) % len]. Мусорный/
   * пустой список → null. Чистый (hash — параметр).
   * @returns {string|null}
   */
  function relicItem(x, y, day, реликвии, hash) {
    if (!Array.isArray(реликвии) || реликвии.length === 0) return null;
    return реликвии[hash(x, y, RELIC_ITEM_SEED ^ day) % реликвии.length];
  }

  // available?(state) записей 43/39 (ОБЩИЙ механизм): повтор в тот
  // же день (запись buildingContent с day === ст.day) — reason-строка
  // ТЗ «круг молчит: содержимое уже получено» (ОДНА строка на оба
  // id — для 43 И 39); запись дня < today или её нет — доступно.
  // Пайплайн 000128 опрашивает available ПЕРВЫМ (до daily-лимита) —
  // игрок видит ТЗ-строку, а не generic «уже использовано сегодня»
  // (та — backstop: каталожный флаг раз_в_день, 000072).
  function dailyContentAvailable(st) {
    const rec = readBuildingContentEntry(st, tileKeyOf(st));
    if (rec && rec.day === st.day) {
      return 'круг молчит: содержимое уже получено';
    }
    return true;
  }

  // Имя предмета в success-сообщении: ЛЕНИВЫЙ G.getItem(id).name
  // (fallback — id; 000029). apply ЧИСТ — предмета в мире нет,
  // только название для сообщения.
  function itemDisplayName(G, id) {
    const it = (typeof G.getItem === 'function') ? G.getItem(id) : null;
    return (it && typeof it.name === 'string' && it.name !== '')
      ? it.name : id;
  }

  /**
   * «Круг» (43) / «Храм» (39) — «ежедневный контент» (000077):
   * ОБЩИЙ apply на обе записи (имя действия — параметр). Один
   * детерминированный ролл по (tile, day):
   *   * chest — 1 предмет БЕЗ золота (R-4) таблицой ПО ТАЙЛУ:
   *     dungeonTypeFor(terrain тайла, альфа pixelAt, fallback 255 —
   *     паттерн moonDreamHint; нет карты — default-ветка CAVE);
   *     таблица — G.DUNGEON_ITEMS[type] (dungeon.js, из каталога);
   *   * boss — БОЕВОЙ СИД (bossGroup) — состав/уровень — стандартные
   *     формулы createCombat по рецепту BUILDING_BOSS (R-2/R-3);
   *   * relic — id из каталога эффект.реликвии.
   * Success-сообщения СТРОЯТСЯ ЗДЕСЬ (чистый; хендлер сообщений не
   * строит — 000128 §2.4 приоритетизирует r.message):
   *   «<Действие>: сундук — „<название>“.» / «<Действие>: босс —
   *   к бою!» / «<Действие>: реликвия — „<название>“.».
   * apply ЧИСТ (000071): state/hero/save не мутирует; мир-действия —
   * спец-хендлер. Недневной отказ (нет G.hash2/G.dungeonTypeFor,
   * мусор каталога/долей/реликвий, нет таблицы/предмета) —
   * { ok:false, message:'недоступно' }.
   * @param {string} имяДействия имя из реестра («Круг»/«Храм»)
   * @returns {{ok: boolean, type?: 'chest'|'boss'|'relic',
   *            item?: string, seed?: number, message?: string}}
   */
  function applyDailyContent(st, имяДействия) {
    const G = lazyGame();
    if (!G || typeof G.hash2 !== 'function' ||
        typeof G.dungeonTypeFor !== 'function') {
      return { ok: false, message: 'недоступно' };
    }
    const eff = catalogEffect(st);
    if (!eff) return { ok: false, message: 'недоступно' };
    if (!validShares(eff.доли) ||
        !Array.isArray(eff.реликвии) || eff.реликвии.length === 0 ||
        !eff.реликвии.every((id) => typeof id === 'string')) {
      return { ok: false, message: 'недоступно' };
    }
    const tile = (st && st.tile) || { x: 0, y: 0 };
    const x = tile.x, y = tile.y, day = st && st.day;
    const type = rollBuildingContent(x, y, day, eff.доли, G.hash2);
    if (!type) return { ok: false, message: 'недоступно' };
    if (type === 'boss') {
      // Босс: БОЕВОЙ СИД — стандартный поток createCombat
      // (startCombat('BUILDING_BOSS', { seed }) — спец-хендлер).
      return {
        ok: true,
        type,
        seed: bossGroup(x, y, day, G.hash2),
        message: имяДействия + ': босс — к бою!',
      };
    }
    // Сундук/реликвия — 1 предмет (БЕЗ золота, R-4).
    let table = null;
    if (type === 'chest') {
      // Таблица ПО ТАЙЛУ (R-4): terrain тайла + альфа пикселя (нет
      // map/pixelAt/мусор — fallback, паттерн moonDreamHint, строки
      // ≈730–745 000076).
      let terrain = undefined;
      const map = st && st.map;
      if (map && typeof map.tileAt === 'function') {
        try {
          const t = map.tileAt(x, y);
          terrain = t && t.terrain;
        } catch (err) { terrain = undefined; }
      }
      let alpha = 255;
      if (map && typeof map.pixelAt === 'function') {
        let px = null;
        try { px = map.pixelAt(x, y); } catch (err) { px = null; }
        if (Array.isArray(px) && Number.isFinite(px[3])) alpha = px[3];
      }
      const dType = G.dungeonTypeFor(terrain, alpha);
      if (typeof dType === 'number' && G.DUNGEON_ITEMS &&
          Array.isArray(G.DUNGEON_ITEMS[dType]) &&
          G.DUNGEON_ITEMS[dType].length > 0) {
        table = G.DUNGEON_ITEMS[dType];
      }
    } else {
      table = eff.реликвии;
    }
    const item = (type === 'chest')
      ? chestLoot(x, y, day, table, G.hash2)
      : relicItem(x, y, day, eff.реликвии, G.hash2);
    if (!item) return { ok: false, message: 'недоступно' };
    return {
      ok: true,
      type,
      item,
      // Кавычки „…“ — зафиксировано тестом A60 (стиль сообщений).
      message: имяДействия + ': ' +
        (type === 'chest' ? 'сундук' : 'реликвия') + ' — „' +
        itemDisplayName(G, item) + '“.',
    };
  }

  // --- Задача 000094: развалины (48) — «Осмотр» ---
  // Чистые функции + apply ЧИСТО (000071): state/hero/save не
  // мутирует; МИР-«сторона» (урон ловушки, лут в инвентарь) — спец-
  // модуль src/building-effect-48.js (контракт 000128 §2.3; apply
  // только ВОЗВРАЩАЕТ результат). Детерминизм — (tile, day)-сиды
  // RUINS_*, НИКАКОГО Math.random/Date (ТЗ); hash — ПАРАМЕТР
  // (песочница — инъект perlin.hash2; игра — ленивый G.hash2).
  // Параметры — ТОЛЬКО из st.catalog.особые_параметры.эффект
  // (каталога ГЛОБАЛЬНО в apply НЕТ — 000053). Контракт —
  // memory/000094-ruins-inspect.md; числа/формулы — memory/
  // 000094-ruins.md.

  /**
   * Ролл содержимого осмотра развалин по (tile, day):
   * `r = hash(x, y, RUINS_ROLL_SEED ^ day) / 2^32` ∈ [0, 1) →
   * кумулятивные пороги каталога eff.доли, ПОРЯДОК ФИКСИРОВАН
   * КОДОМ (лут → ловушка → запись), нормализация по сумме
   * (Σ ≠ 100 не ломает формулу — решение D-ДОЛИ). Чистый
   * (hash — параметр).
   * @param {string} tileKey ключ тайла 'x,y' (XY_KEY_RE)
   * @param {number} day день мира
   * @param {object} eff эффект-объект каталога (поле доли)
   * @param {(x: number, y: number, seed: number) => number} hash
   * @returns {'loot'|'trap'|'note'|null} — null: мусор tileKey/доли
   */
  function rollRuinsContent(tileKey, day, eff, hash) {
    if (typeof tileKey !== 'string' || !XY_KEY_RE.test(tileKey)) {
      return null;
    }
    const parts = tileKey.split(',');
    const x = Number(parts[0]), y = Number(parts[1]);
    const d = eff && eff.доли;
    if (!d || typeof d !== 'object' || Array.isArray(d)) return null;
    const loot = d.лут, trap = d.ловушка, note = d.запись;
    if (!Number.isFinite(loot) || !Number.isFinite(trap) ||
        !Number.isFinite(note) || loot < 0 || trap < 0 || note < 0) {
      return null;
    }
    const sum = loot + trap + note;
    if (sum <= 0) return null;
    const r = deterministicRoll(x, y, day, RUINS_ROLL_SEED, hash);
    if (r < loot / sum) return 'loot';
    if (r < (loot + trap) / sum) return 'trap';
    return 'note';
  }

  /**
   * Предмет лута детерминированно по (tile, day):
   * `items[hash(x, y, RUINS_LOOT_SEED ^ day) % items.length]`
   * (паттерн pickFragment; порядок массива — индекс, не менять без
   * регенерации golden). Чистый (hash — параметр).
   * @param {string} tileKey ключ тайла 'x,y' (XY_KEY_RE)
   * @param {number} day день мира
   * @param {string[]} items id предметов (каталог эффект.предметы)
   * @param {(x: number, y: number, seed: number) => number} hash
   * @returns {string|null} — null: мусор tileKey/предметы
   */
  function ruinsLoot(tileKey, day, items, hash) {
    if (typeof tileKey !== 'string' || !XY_KEY_RE.test(tileKey)) {
      return null;
    }
    if (!Array.isArray(items) || items.length === 0 ||
        !items.every((id) => typeof id === 'string' && id !== '')) {
      return null;
    }
    const parts = tileKey.split(',');
    const x = Number(parts[0]), y = Number(parts[1]);
    return items[hash(x, y, RUINS_LOOT_SEED ^ day) % items.length];
  }

  /**
   * Расшифровка записи — проверкой ИНТЕЛЛЕКТА (ТЗ «проверка
   * Интеллекта: порог уровня»): ЧИСТОЕ сравнение
   * `level >= threshold` — детерминированно, НЕ ролл.
   * Мусор (оба — finite-числа) → false (без исключения).
   * @param {number} level уровень Интеллекта героя
   * @param {number} threshold порог (каталог эффект.порог_интеллект)
   * @returns {boolean}
   */
  function readNote(level, threshold) {
    if (!Number.isFinite(level) || !Number.isFinite(threshold)) {
      return false;
    }
    return level >= threshold;
  }

  /**
   * «Осмотр» (развалины, 48): один раз в день (каталог).
   * Детерминированный ролл содержимого по (tile, day) —
   * лут / ловушка / запись (доли — каталог):
   *   * лут — itemId (каталог эффект.предметы); message — имя
   *     предмета ИЗ Г.getItem (ОПЦИОНАЛЕН: без него — fallback
   *     «Осмотр развалин: лут.» — НЕ «недоступно»); в инвентарь
   *     кладёт спец-хендлер (отказ addItem — r.message, R6);
   *   * ловушка — ЗАЯВЛЕННЫЙ урон (каталог эффект.урон_ловушки,
   *     = 2, БЕЗ БОЯ, без Телосложения — формула фиксирована);
   *     исполнение (clamp HP ≥ 1 — НЕ УБИВАЕТ) — спец-хендлер;
   *   * запись — фрагмент (каталог эффект.тексты) + ЧИСТАЯ
   *     проверка Интеллекта readNote(G.skillLevel(hero,
   *     'intelligence'), порог): успех — fragment + message;
   *     провал — «Осмотр развалин: запись не читается.»
   *     (фрагмент НЕ выдаётся — ТЗ).
   * ЛЮБОЙ валидный исход — ok:true (попытка сгорела, R3: daily-
   * марка + saveNow — роутером); ok:false — только «недоступно»
   * (нет G.hash2/G.skillLevel, мусорный каталог, hero не-объект).
   * state/hero/save НЕ мутирует (000071/A12).
   * @returns {{ok: boolean, content?: 'loot'|'trap'|'note',
   *            itemId?: string, damage?: number, success?: boolean,
   *            fragment?: string, message?: string}}
   */
  function applyRuins(st) {
    const G = lazyGame();
    if (!G || typeof G.hash2 !== 'function' ||
        typeof G.skillLevel !== 'function') {
      return { ok: false, message: 'недоступно' };
    }
    const eff = catalogEffect(st);
    if (!eff) return { ok: false, message: 'недоступно' };
    const d = eff.доли;
    if (!d || typeof d !== 'object' || Array.isArray(d) ||
        !Number.isFinite(d.лут) || !Number.isFinite(d.ловушка) ||
        !Number.isFinite(d.запись) || d.лут < 0 || d.ловушка < 0 ||
        d.запись < 0 || (d.лут + d.ловушка + d.запись) <= 0) {
      return { ok: false, message: 'недоступно' };
    }
    if (!Array.isArray(eff.предметы) || eff.предметы.length < 1 ||
        !eff.предметы.every((id) => typeof id === 'string' &&
          id !== '')) {
      return { ok: false, message: 'недоступно' };
    }
    if (!validTexts(eff.тексты)) {
      return { ok: false, message: 'недоступно' };
    }
    if (!Number.isFinite(eff.порог_интеллект) ||
        !Number.isFinite(eff.урон_ловушки) || eff.урон_ловушки < 0) {
      return { ok: false, message: 'недоступно' };
    }
    const hero = st && st.hero;
    // Герой — объект (A53-паттерн: не-объект/массив — деградация
    // «недоступно», не TypeError).
    if (!hero || typeof hero !== 'object' || Array.isArray(hero)) {
      return { ok: false, message: 'недоступно' };
    }
    const tile = st.tile || { x: 0, y: 0 };
    const tileKey = tile.x + ',' + tile.y;
    const day = st.day;
    const content = rollRuinsContent(tileKey, day, eff, G.hash2);
    if (content === null) return { ok: false, message: 'недоступно' };
    if (content === 'loot') {
      const itemId = ruinsLoot(tileKey, day, eff.предметы, G.hash2);
      // Имя предмета — ОПЦИОНАЛЬНО (G.getItem отсутствует/неизвестен
      // id — fallback-строка, НЕ «недоступно»: исход валиден).
      const item = G.getItem
        && typeof G.getItem === 'function'
        ? G.getItem(itemId) : null;
      const name = item && typeof item.name === 'string' &&
        item.name !== '' ? item.name : null;
      return {
        ok: true,
        content: 'loot',
        itemId,
        message: name !== null
          ? 'Осмотр развалин: лут — «' + name + '».'
          : 'Осмотр развалин: лут.',
      };
    }
    if (content === 'trap') {
      // Урон ЗАЯВЛЁН (исполнение + clamp HP ≥ 1 — спец-хендлер;
      // apply hp НЕ меняет — чистота 000071/A12).
      return {
        ok: true,
        content: 'trap',
        damage: eff.урон_ловушки,
        message: 'Осмотр развалин: ловушка! −' +
          eff.урон_ловушки + ' HP.',
      };
    }
    // Запись: фрагмент детерминирован по (tile, day); расшифровка —
    // ЧИСТЫМ сравнением Интеллекта (level = G.skillLevel; 'intelligence'
    // — primary, skills-data.js; порог — каталог). Провал — фрагмент
    // НЕ выдаётся (ТЗ); повтор — новый день, новый ролл.
    const fragment = pickFragment(
      eff.тексты, tile.x, tile.y, day, RUINS_NOTE_SEED, G.hash2);
    const level = G.skillLevel(hero, 'intelligence');
    if (!readNote(level, eff.порог_интеллект)) {
      return {
        ok: true,
        content: 'note',
        success: false,
        message: 'Осмотр развалин: запись не читается.',
      };
    }
    return {
      ok: true,
      content: 'note',
      success: true,
      fragment,
      message: 'Осмотр развалин: запись: «' + fragment + '»',
    };
  }

  /**
   * «Сон» (задача 000076): ЧИСТАЯ подсказка о ближайшем входе в
   * пещеру и типе подземелья.
   *
   * Скан ОКНА 256×256 (side = max(width, height)), ЦЕНТРИРОВАННОГО
   * на тайле постройки (x, y) — ревью раунда 1: мир БЕСКОНЕЧЕН
   * (map.width/height — размер пиксельной сетки, а не мира; тайлы за
   * сеткой — уникальное содержимое), поэтому старое окно
   * [0,width)×[0,height) НЕ содержало окрестность храмов за границей
   * сетки (37 — (41,-19), 39 — (-42,-31)), и «ближайший» выполнялся
   * лишь внутри окна (замер: храм (41,-19) → истинный ближайший
   * (44,-1), д. Чебышёва 18, вне окна; старое окно давало (72,9),
   * д. 31). Окно центрированное: любой тайл ВНЕ окна дальше от
   * центра, чем любой тайл ВНУТРИ (д. ≥ R+1 > R), значит при
   * найденном входе результат — ИСТИННО ближайший в радиусе R
   * (R = floor(side/2)). Бюджет тот же — 65k tileAt, разовое
   * действие (НЕ per-frame; HUD-подсказка использует дешёвый
   * hasEffects):
   *   * вход = тайл hasBuilding && building === CAVE_ENTRANCE
   *     (ленивый Game.BUILDING_TYPES, fallback 9) && buildingId !== 48
   *     (развалины — 000073: гард-литерал, как main.js);
   *   * ближайший по Чебышеву (max(|dx|, |dy|)); тай-брейк при
   *     равенстве — ЛЕКСИКОГРАФИЧЕСКИ МЕНЬШИЙ (x, затем y) —
   *     детерминизм (решение НЕ задано ТЗ/SPEC, зафиксировано
   *     memory/000076-temple-blessings.md);
   *   * тип — ленивый Game.dungeonTypeFor(terrain входа, альфа
   *     map.pixelAt(ex, ey)[3], fallback 255) (dungeon.js); без
   *     dungeonTypeFor — тип null (вход всё равно виден, A25).
   *
   * map отсутствует/бит (нет width/height/tileAt) — { entrance:null,
   * dungeonType:null } без исключений (fail-open, 000029).
   * @param {object|null} map карта мира (width/height/tileAt/pixelAt)
   * @param {number} x координата тайла (построение, откуда «сон»)
   * @param {number} y
   * @returns {{entrance: {x: number, y: number}|null,
   *            dungeonType: number|null}}
   */
  function moonDreamHint(map, x, y) {
    const out = { entrance: null, dungeonType: null };
    if (!map || typeof map !== 'object') return out;
    const w = map.width;
    const h = map.height;
    if (!Number.isInteger(w) || !Number.isInteger(h) || w <= 0 || h <= 0) {
      return out;
    }
    if (typeof map.tileAt !== 'function') return out;
    const G = lazyGame();
    const cave = (G && G.BUILDING_TYPES &&
                  G.BUILDING_TYPES.CAVE_ENTRANCE != null)
      ? G.BUILDING_TYPES.CAVE_ENTRANCE : 9;
    // Окно ЦЕНТРИРОВАНО на тайле (x, y), side × side (ревью раунда
    // 1; см. JSDoc): мир бесконечен, [0,w)×[0,h) — НЕ мир, а пиксельная
    // сетка; храм за сеткой (41,-19) должен видеть окрестность, а не
    // чужой угол сетки. Координаты тайлов — целые; d. Чебышёва до
    // любого тайла вне окна ≥ R+1 > R — найденный вход в окне
    // истинно ближайший в радиусе R.
    const side = Math.max(w, h);
    const R = Math.floor(side / 2);
    const cx = Math.round(x);
    const cy = Math.round(y);
    let best = null;
    let bestDist = Infinity;
    for (let ty = cy - R; ty < cy + side - R; ty++) {
      for (let tx = cx - R; tx < cx + side - R; tx++) {
        let t;
        try { t = map.tileAt(tx, ty); } catch (err) { t = null; }
        if (!t || !t.hasBuilding || t.building !== cave) continue;
        if (t.buildingId === 48) continue; // развалины (000073)
        const dist = Math.max(Math.abs(tx - x), Math.abs(ty - y));
        if (best === null || dist < bestDist ||
            (dist === bestDist &&
             (tx < best.x || (tx === best.x && ty < best.y)))) {
          best = { x: tx, y: ty, terrain: t.terrain };
          bestDist = dist;
        }
      }
    }
    if (!best) return out;
    out.entrance = { x: best.x, y: best.y };
    if (G && typeof G.dungeonTypeFor === 'function') {
      let alpha = 255;
      if (typeof map.pixelAt === 'function') {
        let px = null;
        try { px = map.pixelAt(best.x, best.y); } catch (err) { px = null; }
        if (Array.isArray(px) && Number.isFinite(px[3])) alpha = px[3];
      }
      const type = G.dungeonTypeFor(best.terrain, alpha);
      if (typeof type === 'number') out.dungeonType = type;
    }
    return out;
  }

  // available?(state) — недневная доступность (контракт шапки,
  // зафиксирован тестами A15/A16/A17). Возвращает undefined, если
  // действие ДОСТУПНО, и строку-reason, если НЕТ:
  //   истина (не строка: true, 1, объект) — доступно;
  //   false / null / undefined / '' — недоступно, reason «недоступно»;
  //   непустая строка — недоступно, reason = эта строка (пример:
  //   телепорт-круг без пары — «круг молчит»).
  // st — тот же СНИМОК { day, tile, hero, save }; строка
  // buildingActions снимок не мутирует (available — код записи).
  function unavailableReason(entry, st) {
    if (typeof entry.available !== 'function') return undefined;
    const res = entry.available(st);
    if (typeof res === 'string') return res === '' ? 'недоступно' : res;
    return res ? undefined : 'недоступно';
  }

  /**
   * Список действий на тайле постройки (чистая, без DOM):
   * [{ id, имя, доступен, reason? }]. Порядок: сначала «Диалог»
   * (id 'dialog', если npc != null), затем эффекты (порядок каталога).
   * Доступность эффекта: СНАЧАЛА available?(state) (недневная), затем
   * лимит раз-в-день; reason — причина недоступности (виден в
   * оверлее; строка disabled — нажатие не доходит до apply).
   * building/npc/state (снимок сейва) не мутируются.
   * @param {object} building запись каталога (id, особые_параметры)
   * @param {object|null} npc запись каталога NPC (или null)
   * @param {{day: number, tile: {x: number, y: number}, hero: object,
   *         save: object}} state — save: снимок collectSaveData()
   */
  function buildingActions(building, npc, state) {
    const out = [];
    if (npc != null) {
      out.push({ id: 'dialog', имя: 'Диалог', доступен: true });
    }
    const st = state || {};
    const tile = st.tile || { x: 0, y: 0 };
    for (const id of effectIds(building)) {
      const entry = EFFECTS[id];
      const action = { id, имя: entry.имя, доступен: true };
      // Недневная доступность — ПЕРВОЙ: если эффект в принципе
      // недоступен (круг без пары «молчит»), лимитный reason не
      // важен (ревью раунда 2: дыра контракта — available не
      // опрашивался, оверлей показывал действие доступным, а
      // нажатие умирало молча).
      let reason = unavailableReason(entry, st);
      if (reason === undefined && hasDailyLimit(building, id)) {
        // Ключ 'x,y:effectId' — конвенция 000072 (целые координаты,
        // могут быть отрицательными; effectId — без ':'/',').
        const key = tile.x + ',' + tile.y + ':' + id;
        const last = readOncePerDay(st.save, key);
        if (!canUseTodayLazy(last, st.day)) {
          reason = 'уже использовано сегодня';
        }
      }
      if (reason !== undefined) {
        action.доступен = false;
        action.reason = reason;
      }
      out.push(action);
    }
    // Крафт (задача 000126): строка СИНТЕЗИРОВАНА ПОСЛЕ цикла эффектов
    // (концом списка — существующие строки не перенумеровываются),
    // НЕ запись EFFECTS и НЕ каталог (решение 1 контракта): доступность
    // строки НИКЕМ не гасится (марка раз-в-день 40/42 «осиротевшая» —
    // крафт у 40/42 не ограничен раз-в-день, решение 5). Ленивое
    // чтение Game.Craft в момент ВЫЗОВА (000053): без craft.js —
    // строки НЕТ (деградация; A2 {id:97} → []).
    if (building && building.id != null) {
      const G = lazyGame();
      if (G && G.Craft && Array.isArray(G.Craft.CRAFT)
          && G.Craft.CRAFT.some(
            (r) => r && Array.isArray(r.здания)
              && r.здания.includes(building.id))) {
        out.push({ id: 'craft', имя: 'Крафт', доступен: true });
      }
    }
    return out;
  }

  /**
   * Парность телепорт-кругов (000075): ближайший ДРУГОЙ круг по
   * РАССТОЯНИЮ CHEBYSHEV в радиусе R (граница включительно).
   * Чистая (мира нет): circles — список позиций кругов {x, y}
   * (в тесте — синтетический, в игре — результат скана tileAt
   * main.js). Якорь (x, y) сам, если в списке, игнорируется.
   * Равенство расстояний — MIN tieHash(px, py); финальный
   * тай-брейк — лексикографический (x, затем y): hash2 32-битный,
   * коллизия теоретически возможна. ПАРЫ АССИММЕТРИЧНЫ: каждый
   * круг — к СВОЕМУ ближайшему (симметрия НЕ гарантируется —
   * зафиксировано A25). Пары нет — «спит» (НЕ ошибка):
   * { pairId: null, reason: 'no_pair' }.
   * @param {Array<{x: number, y: number}>} circles
   * @param {number} x якорный тайл (круг, для которого ищем пару)
   * @param {number} y
   * @param {number} R радиус (Чебышев, граница включительно)
   * @param {(px: number, py: number) => number} tieHash
   * @returns {{pairId: string|null, reason?: string}}
   */
  function linkTeleportCircles(circles, x, y, R, tieHash) {
    let best = null;
    if (Array.isArray(circles)) {
      for (const c of circles) {
        if (!c || !Number.isInteger(c.x) || !Number.isInteger(c.y)) {
          continue; // мусорная позиция — пропуск (fail-open)
        }
        if (c.x === x && c.y === y) continue; // сам якорь — не пара
        const d = Math.max(Math.abs(c.x - x), Math.abs(c.y - y));
        if (d > R) continue;
        const h = Number(tieHash(c.x, c.y)) || 0;
        if (best === null || d < best.d ||
            (d === best.d && (h < best.h ||
              (h === best.h && (c.x < best.x ||
                (c.x === best.x && c.y < best.y)))))) {
          best = { d, h, x: c.x, y: c.y };
        }
      }
    }
    if (best === null) return { pairId: null, reason: 'no_pair' };
    return { pairId: best.x + ',' + best.y };
  }

  /**
   * Цель телепорта (000075): проходимый тайл в footprint-соседстве
   * парного круга — КОЛЬЦО: dx -1..width, dy -1..height вокруг
   * якоря (внутренние тайлы footprint'а — не кандидаты: в стену
   * не переносим). Порядок: ближайшие к якорю по Чебышеву, затем
   * tieHash, затем лекс. (x, затем y). passable(x, y) — мир-оракль
   * (main.js: t.passable && !t.inBuilding && !t.hasMobGroup &&
   * не тайл исходного круга). Нет проходимых → null (в игре:
   * переноса нет, золото не тратится).
   * @param {{x: number, y: number}} anchor якорь парного круга
   * @param {{width: number, height: number}} size footprint круга
   * @param {(px: number, py: number) => boolean} passable
   * @param {(px: number, py: number) => number} tieHash
   * @returns {{x: number, y: number}|null}
   */
  function teleportDestination(anchor, size, passable, tieHash) {
    const w = (size && Number.isInteger(size.width) && size.width > 0)
      ? size.width : 1;
    const h = (size && Number.isInteger(size.height) && size.height > 0)
      ? size.height : 1;
    const ax = anchor.x, ay = anchor.y;
    let best = null;
    for (let dy = -1; dy <= h; dy++) {
      for (let dx = -1; dx <= w; dx++) {
        // Внутренний тайл footprint'а — не кандидат (цель — кольцо
        // вокруг круга).
        if (dx >= 0 && dx < w && dy >= 0 && dy < h) continue;
        const px = ax + dx, py = ay + dy;
        if (!passable(px, py)) continue;
        const d = Math.max(Math.abs(px - ax), Math.abs(py - ay));
        const th = Number(tieHash(px, py)) || 0;
        if (best === null || d < best.d ||
            (d === best.d && (th < best.th ||
              (th === best.th && (px < best.x ||
                (px === best.x && py < best.y)))))) {
          best = { d, th, x: px, y: py };
        }
      }
    }
    return best ? { x: best.x, y: best.y } : null;
  }

  /**
   * Разовая активация телепорт-круга (000075): первое
   * использование списывает стоимость из золота, повтор
   * (active — круг уже активирован, сейв) — НЕ списывает,
   * мало золота — отказ БЕЗ списания. Чистая: hero НЕ
   * мутируется (возвращается новое золото).
   * @param {{gold: number}} hero
   * @param {boolean} active круг уже активирован (сейв)
   * @param {number} cost стоимость из каталога
   * @returns {{ok: boolean, gold: number, message?: string}}
   */
  function teleportCharge(hero, active, cost) {
    const gold = hero && Number.isFinite(hero.gold) ? hero.gold : 0;
    const c = Number.isFinite(cost) ? cost : 0;
    if (active) return { ok: true, gold }; // повтор — бесплатно
    if (gold >= c) return { ok: true, gold: gold - c };
    return { ok: false, message: 'недостаточно золота', gold };
  }

  /**
   * Раздел сейва teleports (имя — 000072): Map 'x,y' →
   * { pair: 'px,py'|null, dest: 'dx,dy'|null, active: boolean }
   * → обычный объект (JSON). Пустой Map — {}.
   * @param {Map<string, {pair: string|null, dest: string|null,
   *         active: boolean}>} m
   * @returns {object}
   */
  function serializeTeleports(m) {
    const out = {};
    if (m && typeof m.forEach === 'function') {
      m.forEach((v, k) => {
        out[String(k)] = {
          pair: (v && v.pair != null) ? String(v.pair) : null,
          dest: (v && v.dest != null) ? String(v.dest) : null,
          active: !!(v && v.active),
        };
      });
    }
    return out;
  }

  /**
   * Раздел сейва teleports → Map (fail-open, 000029): раздел
   * не объект/массив — пустой Map БЕЗ исключения; мусорная
   * запись — отброс ЗАПИСИ (ключ не 'x,y'; pair/dest не
   * 'x,y'|null; active не boolean или отсутствует), валидные
   * выживают. Roundtrip с serializeTeleports.
   * @param {*} raw раздел сейва (обычный объект)
   * @returns {Map<string, {pair: string|null, dest: string|null,
   *         active: boolean}>}
   */
  function restoreTeleports(raw) {
    const out = new Map();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    for (const k of Object.keys(raw)) {
      if (!XY_KEY_RE.test(k)) continue;
      const v = raw[k];
      if (!v || typeof v !== 'object' || Array.isArray(v)) continue;
      if (typeof v.active !== 'boolean') continue; // нет active — мусор
      // pair/dest — null ИЛИ строка 'x,y'; другое — мусорная запись
      // (отброс ЦЕЛИКОМ, A29 — не нормализуем к null: форма раздела
      // сейва зафиксирована).
      const xyOk = (p) => p === null ||
        (typeof p === 'string' && XY_KEY_RE.test(p));
      if (!xyOk(v.pair) || !xyOk(v.dest)) continue;
      out.set(k, { pair: v.pair, dest: v.dest, active: v.active });
    }
    return out;
  }

  /**
   * Раздел сейва buildingQuests (задача 000074, имя — 000072):
   * Map 'x,y' → { questId: string, day: integer ≥ 1,
   * status: 'active'|'done' } → обычный объект (JSON). Пустой Map —
   * {}. Квест постройки — ОДНОРАЗОВЫЙ: запись не истекает
   * (onDay-очистки НЕТ; done — навсегда, повторной выдачи нет).
   * @param {Map<string, {questId: string, day: number,
   *         status: 'active'|'done'}>} m
   * @returns {object}
   */
  function serializeBuildingQuests(m) {
    const out = {};
    if (m && typeof m.forEach === 'function') {
      m.forEach((v, k) => {
        out[String(k)] = {
          questId: (v && typeof v.questId === 'string') ? v.questId : null,
          day: (v && Number.isInteger(v.day) && v.day >= 1) ? v.day : 1,
          status: (v && v.status === 'done') ? 'done' : 'active',
        };
      });
    }
    return out;
  }

  /**
   * Раздел сейва buildingQuests → Map (fail-open, 000029): раздел
   * не объект/массив — пустой Map БЕЗ исключения; мусорная запись —
   * отброс ЗАПИСИ (ключ не 'x,y'; questId не строка; day не целое ≥
   * 1; status не 'active'/'done'), валидные выживают. Roundtrip с
   * serializeBuildingQuests.
   * @param {*} raw раздел сейва (обычный объект)
   * @returns {Map<string, {questId: string, day: number,
   *         status: 'active'|'done'}>}
   */
  function restoreBuildingQuests(raw) {
    const out = new Map();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    for (const k of Object.keys(raw)) {
      if (!XY_KEY_RE.test(k)) continue;
      const v = raw[k];
      if (!v || typeof v !== 'object' || Array.isArray(v)) continue;
      if (typeof v.questId !== 'string') continue;
      if (!Number.isInteger(v.day) || v.day < 1) continue;
      if (v.status !== 'active' && v.status !== 'done') continue;
      out.set(k, { questId: v.questId, day: v.day, status: v.status });
    }
    return out;
  }

  // --- Задача 000093: смотровая башня — «Взглянуть» (explored) ---
  //
  // Раздел сейва explored (имя — 000072; контракт данных —
  // memory/000093-explored.md): СНИМОК — plain object
  // { towerKey 'x,y' → 'x,y;x,y;…' } — ключи тайлов окна Чебышёва
  // башни, граница включительно. КАНОНИЧЕСКАЯ строка — row-major:
  // y по возрастанию, затем x, ЧИСЛЕННАЯ сортировка (строковая даёт
  // «10» < «9» при |координате| > 9 — баг); единая сериализация:
  // roundtrip serialize→restore byte-identical. Живая форма
  // (владеет main.js) — Map<towerKey, Set<tileKey>>. Ограничение
  // роста: R=20 → ≤ 41×41 = 1681 ключей на башню (ловушка
  // localStorage, ТЗ) — защитный R-фильтр markExplored держит кап
  // даже при «лишних» тайлах во входе.

  // Ключ 'x,y' → [x, y] ЧИСЛА (null — не ключ).
  function parseXYKey(s) {
    if (typeof s !== 'string' || !XY_KEY_RE.test(s)) return null;
    const sep = s.indexOf(',');
    return [Number(s.slice(0, sep)), Number(s.slice(sep + 1))];
  }

  // Row-major (y, затем x) сортировка канонических ключей.
  function sortTileKeys(keys) {
    return keys.slice().sort((a, b) => {
      const pa = parseXYKey(a), pb = parseXYKey(b);
      if (pa[1] !== pb[1]) return pa[1] - pb[1];
      return pa[0] - pb[0];
    });
  }

  /**
   * «Взглянуть» (000093): тайлы окна Чебышёва R вокруг башни —
   * исследованы. ВОЗВРАЩАЕТ НОВОЕ plain object (снимок) — входной
   * explored не мутируется (иммутабельно, паттерн 000072).
   *   explored: plain object {towerKey:'x,y;…'} | null/undefined →
   *     {}; не-object/Array → {} (fail-open, НЕ бросает).
   *   towerKey: строка 'x,y' (XY_KEY_RE) — иначе THROW (программная
   *     ошибка).
   *   R: integer ≥ 0 — иначе THROW (программная ошибка).
   *   tiles: массив {x: int, y: int} | null/undefined → []; элемент
   *     не {x,y}-целые-конечные → SKIP (fail-open); tile c
   *     Chebyshev-расстоянием > R от башни → SKIP (ЗАЩИТНЫЙ фильтр:
   *     вызовчик передаёт точное окно — поведение идентично; кап
   *     ≤1681 держится при «мусорном» входе).
   * Мерж: валидные сегменты старшего значения башни (XY_KEY_RE) ∪
   * новые тайлы (Set — дедупликация). Чужие башни копируются как
   * есть. Значение = канонический row-major, join(';').
   * @returns {object} новый plain object
   */
  function markExplored(explored, towerKey, tiles, R) {
    if (typeof towerKey !== 'string' || !XY_KEY_RE.test(towerKey)) {
      throw new TypeError(
        'markExplored: towerKey — строка «x,y» (программная ошибка)');
    }
    if (!Number.isInteger(R) || R < 0) {
      throw new TypeError(
        'markExplored: R — целое ≥ 0 (программная ошибка)');
    }
    const out = {};
    if (explored && typeof explored === 'object' &&
        !Array.isArray(explored)) {
      for (const k of Object.keys(explored)) out[k] = explored[k];
    }
    const sep = towerKey.indexOf(',');
    const tx = Number(towerKey.slice(0, sep));
    const ty = Number(towerKey.slice(sep + 1));
    // Башня: валидные сегменты старшего значения (union) + новые.
    const set = new Set();
    const prev = out[towerKey];
    if (typeof prev === 'string') {
      for (const s of prev.split(';')) {
        if (XY_KEY_RE.test(s)) set.add(s);
      }
    }
    if (Array.isArray(tiles)) {
      for (const t of tiles) {
        if (!t || typeof t !== 'object') continue;
        if (!Number.isInteger(t.x) || !Number.isInteger(t.y)) continue;
        // ЗАЩИТНЫЙ R-фильтр (ЧИСЛЕННЫЕ координаты): окно — данные
        // разведки башни, «лишние» тайлы вне Чебышёва ≤ R — SKIP.
        if (Math.max(Math.abs(t.x - tx), Math.abs(t.y - ty)) > R) continue;
        set.add(t.x + ',' + t.y);
      }
    }
    if (set.size === 0) {
      delete out[towerKey]; // пустая башня — не пишется
    } else {
      out[towerKey] = sortTileKeys(Array.from(set)).join(';');
    }
    return out;
  }

  /**
   * exploredCount(explored) → number — СУММА валидных сегментов ПО
   * БАШНЯМ (на башню: split(';'), фильтр XY_KEY_RE, дедупликация).
   * Пересечения окон двух башен СЧИТАЮТСЯ ДВАЖДЫ: union по башням —
   * решение БУДУЩЕЙ задачи миникарты (отсрочено, ТЗ). explored —
   * plain object (снимок) | null/undefined → 0; не-object → 0.
   * @returns {number}
   */
  function exploredCount(explored) {
    if (!explored || typeof explored !== 'object' ||
        Array.isArray(explored)) {
      return 0;
    }
    let n = 0;
    for (const k of Object.keys(explored)) {
      const v = explored[k];
      if (typeof v !== 'string') continue;
      const seen = new Set();
      for (const s of v.split(';')) {
        if (XY_KEY_RE.test(s)) seen.add(s);
      }
      n += seen.size;
    }
    return n;
  }

  /**
   * Раздел сейва explored: ЖИВАЯ форма Map<towerKey, Set<tileKey>>
   * → СНИМОК (plain object). Запись: ключ — строка; значение — Set
   * (не Set → SKIP); пустая башня (size 0) → НЕ пишется. Значение —
   * каноническая row-major строка (только валидные сегменты
   * XY_KEY_RE). m — Map | null/undefined → {}.
   * @returns {object}
   */
  function serializeExplored(m) {
    const out = {};
    if (m && typeof m.forEach === 'function') {
      m.forEach((v, k) => {
        if (!(v instanceof Set)) return;
        if (v.size === 0) return;
        const keys = [];
        for (const s of v) {
          if (typeof s === 'string' && XY_KEY_RE.test(s)) keys.push(s);
        }
        if (keys.length === 0) return;
        out[String(k)] = sortTileKeys(keys).join(';');
      });
    }
    return out
  }
  /**
   * Раздел сейва buildingContent (задача 000077, имя — резерв
   * 000072; ОБЩИЙ для всех «ежедневных» эффектов): Map 'x,y' →
   * { day: integer ≥ 1, type: 'chest'|'boss'|'relic' } → обычный
   * объект (JSON). Пустой Map — {}. Запись ПЕРЕЗАПИСЫВАЕТСЯ новым
   * роллом (день D+1) — рост Map ограничен числом посещённых
   * построек-контентников; очистки onDay НЕТ (запись сама по себе
   * наград не даёт, R-5).
   * @param {Map<string, {day: number, type: string}>} m
   * @returns {object}
   */
  function serializeBuildingContent(m) {
    const out = {};
    if (m && typeof m.forEach === 'function') {
      m.forEach((v, k) => {
        // Мусорная запись (не 'x,y' / не та форма) — не сериализуем
        // (fail-open; живой Map в игре — только валидные записи).
        if (!XY_KEY_RE.test(String(k))) return;
        if (!v || typeof v !== 'object' || Array.isArray(v)) return;
        if (!Number.isInteger(v.day) || v.day < 1) return;
        if (typeof v.type !== 'string' ||
            BUILDING_CONTENT_TYPES.indexOf(v.type) === -1) {
          return;
        }
        out[String(k)] = { day: v.day, type: v.type };
      });
    }
    return out;
  }

  /**
   * Раздел сейва explored → ЖИВАЯ форма Map<towerKey, Set<tileKey>>.
   * ТИХИЙ fail-open (000029, паттерн restoreTeleports/
   * restoreBuildingQuests): НЕ throw, НЕ console (warn — в main.js
   * restoreFromSave): раздел не-object/Array/null/undefined →
   * пустой Map; запись: ключ не 'x,y' ИЛИ значение не строка →
   * отброс; сегменты — фильтр XY_KEY_RE + дедупликация (Set);
   * пустой результат → запись отброшена.
   * @returns {Map<string, Set<string>>}
   */
  function restoreExplored(raw) {
    const out = new Map();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    for (const k of Object.keys(raw)) {
      if (!XY_KEY_RE.test(k)) continue;
      const v = raw[k];
      if (typeof v !== 'string') continue;
      const set = new Set();
      for (const s of v.split(';')) {
        if (XY_KEY_RE.test(s)) set.add(s);
      }
      if (set.size > 0) out.set(k, set);
    }
    return out
  }

  /**
   * Раздел сейва buildingContent → Map (fail-open, 000029): раздел
   * не объект/массив — пустой Map БЕЗ исключения (warn делает
   * main.js); мусорная запись — отброс ЗАПИСИ (ключ не 'x,y'; day не
   * integer ≥ 1; type вне whitelist BUILDING_CONTENT_TYPES),
   * валидные выживают. Roundtrip с serializeBuildingContent.
   * day < clock.day — НОРМА (запись прошлого дня не блокирует новый
   * ролл; повтор блокируется только в тот же день); day > clock.day
   * main.js отбрасывает при restore (подделка, 000031).
   * @param {*} raw раздел сейва (обычный объект)
   * @returns {Map<string, {day: number, type: string}>}
   */
  function restoreBuildingContent(raw) {
    const out = new Map();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    for (const k of Object.keys(raw)) {
      if (!XY_KEY_RE.test(k)) continue;
      const v = raw[k];
      if (!v || typeof v !== 'object' || Array.isArray(v)) continue;
      if (!Number.isInteger(v.day) || v.day < 1) continue;
      if (typeof v.type !== 'string' ||
          BUILDING_CONTENT_TYPES.indexOf(v.type) === -1) continue;
      out.set(k, { day: v.day, type: v.type });
    }
    return out;
  }

  /**
   * «Взглянуть» (000093): окрестности башни — исследованы. ЧИСТО
   * (паттерн applyRuneStone/applyObelisk): state не мутирует, мира и
   * каталога ГЛОБАЛЬНО нет — только СНИМОК st.save + READ-ONLY map +
   * каталожная запись st.catalog. Возврат:
   *   { ok: true, explored: <НОВОЕ значение раздела (снимок)>,
   *     message: 'Взгляд: исследовано N тайлов.' } — N = СУММА ПО
   *     ВСЕМ БАШНЯМ ПОСЛЕ пометки (согласовано с HUD-индикатором;
   *     повтор — та же строка, идемпотентно). Текст фиксирован
   *     (тест-пин): стиль «Префикс: результат.».
   * Деградации (000053): каталога/эффекта нет → { ok:false,
   * message:'недоступно' } (радиус НЕ гадаем без эффекта); гард
   * карты (нет map/tileAt) → то же.
   * @returns {{ok: boolean, explored?: object, message: string}}
   */
  function applyExplore(st) {
    const eff = catalogEffect(st);
    if (!eff) return { ok: false, message: 'недоступно' };
    const map = st && st.map;
    if (!map || typeof map !== 'object' ||
        typeof map.tileAt !== 'function') {
      return { ok: false, message: 'недоступно' };
    }
    // R — ТОЛЬКО из каталога (000053); фолбэк 20 — только когда
    // объект эффект ЕСТЬ, но радиус не integer ≥ 0 (ТЗ-фиксированный
    // R=20 — ловушка битого параметра, окно всё равно 41×41).
    const R = (Number.isInteger(eff.радиус) && eff.радиус >= 0)
      ? eff.радиус : 20;
    const tile = st.tile || { x: 0, y: 0 };
    const tx = tile.x, ty = tile.y;
    // Окно Чебышёва row-major (dy внешний, dx внутренний); 41×41 =
    // 1681 вызов tileAt разово (НЕ в кадре), кэш не нужен
    // (идемпотентно). ПРОХОДИМОСТЬ НЕ ЧИТАЕТСЯ (ТЗ: данные разведки).
    const tiles = [];
    for (let dy = -R; dy <= R; dy++) {
      for (let dx = -R; dx <= R; dx++) {
        let t;
        try { t = map.tileAt(tx + dx, ty + dy); } catch (err) { t = null; }
        if (!t) continue; // falsy — пропуск (fail-open)
        tiles.push({ x: tx + dx, y: ty + dy });
      }
    }
    // Башня = тайл ИГРОКА (конвенция [E]: действие доступно только
    // на тайле постройки — игрок И на башне).
    const towerKey = tileKeyOf(st);
    const next = markExplored(
      st.save && st.save.explored, towerKey, tiles, R);
    return {
      ok: true,
      explored: next,
      message: 'Взгляд: исследовано ' + exploredCount(next) + ' тайлов.',
    };
  }

  return {
    EFFECTS, buildingActions, effectIds, hasEffects, hasDailyLimit,
    linkTeleportCircles, teleportDestination, teleportCharge,
    serializeTeleports, restoreTeleports,
    TELEPORT_TIE_SEED,
    // Задача 000076: чистая подсказка «Сна» (скан карты + dungeonTypeFor).
    moonDreamHint,
    // Задача 000074: камень (40) / обелиск (42) — чистые формулы,
    // (tile, day)-сиды, квест постройки (снимок/раздел сейва).
    stoneChance, stoneXp, obeliskXp, deterministicRoll, pickFragment,
    questIdForTile, readBuildingQuestEntry,
    serializeBuildingQuests, restoreBuildingQuests,
    STONE_ROLL_SEED, STONE_TEXT_SEED, OBELISK_TEXT_SEED,
    // Задача 000093: смотровая башня (46) — explored: чистые
    // markExplored/exploredCount + ser/de раздела сейва (контракт —
    // memory/000093-explored-tower.md §2.2).
    markExplored, exploredCount, serializeExplored, restoreExplored,
    // Задача 000077: «ежедневный контент» (круг 43 / храм 39) —
    // чистые (tile, day)-функции, раздел сейва buildingContent,
    // свои ASCII-сида.
    rollBuildingContent, chestLoot, bossGroup, relicItem,
    readBuildingContentEntry,
    serializeBuildingContent, restoreBuildingContent,
    CONTENT_ROLL_SEED, CHEST_LOOT_SEED, BOSS_COMBAT_SEED,
    RELIC_ITEM_SEED,
    // Задача 000094: развалины (48) — «Осмотр»: чистые роллы
    // (tile, day) + порог Интеллекта; мир-сторона — спец-модуль
    // src/building-effect-48.js.
    rollRuinsContent, ruinsLoot, readNote,
    RUINS_ROLL_SEED, RUINS_LOOT_SEED, RUINS_NOTE_SEED,
  };
});

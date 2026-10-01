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

  return {
    EFFECTS, buildingActions, effectIds, hasEffects, hasDailyLimit,
    linkTeleportCircles, teleportDestination, teleportCharge,
    serializeTeleports, restoreTeleports,
    TELEPORT_TIE_SEED,
    // Задача 000076: чистая подсказка «Сна» (скан карты + dungeonTypeFor).
    moonDreamHint,
  };
});

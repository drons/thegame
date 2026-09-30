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
//   * РЕЕСТР EFFECTS = {} (в задаче 000071 ПУСТ — подзадачи
//     000074–000077/000091–000095 добавляют только СВОИ записи):
//     id → { имя, разВДень?, available?(state),
//     apply?(state) → { ok, message? } }.
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

  // canUseToday (day.js:105) — ЛЕНИВО из globalThis.Game в момент
  // вызова: модуль обязан грузиться в vm-песочнице БЕЗ day.js
  // (прецедент 000053); fallback — то же сравнение last !== day.
  function canUseTodayLazy(lastUsedDay, day) {
    const G = typeof globalThis !== 'undefined' ? globalThis.Game : null;
    if (G && typeof G.canUseToday === 'function') {
      return G.canUseToday(lastUsedDay, day);
    }
    return lastUsedDay !== day;
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
  };
});

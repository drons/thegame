// Игровое время (SPEC.md, раздел «Игровое время»): игровой день,
// смена дня при событиях, респауны групп, «раз в день» эффекты.
//
// Чистое ядро без DOM — тестируется в node (tests/day.test.js).
// Униформный модуль: в браузере — globalThis.Game, в node — require().
// Зависимости: global-settings.js (steps_per_day, respawn_days).

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./global-settings.js'));
  } else {
    root.Game = Object.assign({}, root.Game,
      factory(root.Game && root.Game.GlobalSettings));
  }
})(typeof globalThis !== 'undefined' ? globalThis : self, function (settings) {

  if (!settings || typeof settings.SETTINGS !== 'object') {
    throw new Error(
      'day.js: не найдены глобальные настройки — загрузите global-settings.js до day.js');
  }

  // Глобальные настройки (src/global-settings.js, SPEC.md).
  const STEPS_PER_DAY = settings.SETTINGS.steps_per_day;
  const RESPAWN_DAYS = settings.SETTINGS.respawn_days;

  // 000099: live-чтение настройки в момент ВЫЗОВА (паттерн 000020):
  // объект SETTINGS живёт, ссылка не меняется (000098: форма пишет в
  // place) → мутация вкладки «Игровые настройки» видна ядру без
  // перезагрузки. Guard — границы META 000098 (min 1); битое значение
  // → DEFAULTS, последняя опора — снапшот (подделанный settings без
  // DEFAULTS). Снапшоты выше — load-time API (экспорт-константы).
  // Ревью 000099: ЦЕЛИКОМ SETTINGS может быть заменён в рантайме
  // (null/undefined, devtools) — guard и на объект: NaN не пройдёт
  // guard значения → DEFAULTS (как main.js: gs && … → 140).
  function liveStepsPerDay() {
    const s = settings.SETTINGS;
    const v = (s && typeof s === 'object') ? s.steps_per_day : NaN;
    return (typeof v === 'number' && Number.isFinite(v) && v >= 1)
      ? v : (settings.DEFAULTS ? settings.DEFAULTS.steps_per_day : STEPS_PER_DAY);
  }
  function liveRespawnDays() {
    const s = settings.SETTINGS;
    const v = (s && typeof s === 'object') ? s.respawn_days : NaN;
    return (typeof v === 'number' && Number.isFinite(v) && v >= 1)
      ? v : (settings.DEFAULTS ? settings.DEFAULTS.respawn_days : RESPAWN_DAYS);
  }

  /**
   * Часы игрового дня.
   * День сменяется: каждые stepsPerDay шагов мира, или явно — event()/rest().
   * @param {{stepsPerDay?: number}} [opts]
   */
  function createClock(opts = {}) {
    let day = 1;
    let steps = 0;
    const listeners = [];

    // NOTE: advanceDay не трогает steps — перенос избытка шагов делает addStep.
    // События, забирающие целый день (rest/event), сбрасывают счётчик сами.
    function advanceDay(reason) {
      day += 1;
      for (const fn of [...listeners]) fn({ day, reason });
      return day;
    }

    return {
      get day() { return day; },
      get steps() { return steps; },
      // 000099: порог — на каждый вызов (opts > SETTINGS live >
      // DEFAULTS > снапшот): main.js создаёт часы один раз при старте,
      // поэтому только per-call даёт «изменение действует без
      // перезагрузки» на живых часах.
      get stepsPerDay() {
        return opts.stepsPerDay || liveStepsPerDay();
      },
      /** Подписка на смену дня: fn({ day, reason }). Возвращает часы. */
      onDay(fn) { listeners.push(fn); return this; },
      /** Шаги по основной карте: при пороге — новый день (избыток переходит). */
      addStep(n = 1) {
        // 000099: guard ≥ 1 — ДО while-цикла (битое steps_per_day 0 →
        // DEFAULTS 40, НЕ while-бесконечность).
        const perDay = opts.stepsPerDay || liveStepsPerDay();
        steps += n;
        while (steps >= perDay) {
          steps -= perDay;
          advanceDay('steps');
        }
        return day;
      },
      /** Событие, забирающее целый день (выход из подземелья, прочее). */
      event(reason = 'event') {
        steps = 0;
        return advanceDay(reason);
      },
      /** Отдых: день проходит. */
      rest() {
        steps = 0;
        return advanceDay('rest');
      },
      /**
       * Быстрый переход вперёд на n дней БЕЗ уведомлений слушателей.
       * Для восстановления сейва (задача 000031): сейв — СНИМОК
       * состояния на момент записи, все эффекты прошедших дней уже
       * учтены в данных (HP/MP, респауны), а оповещать слушателей
       * по разу на каждый день при day=100000 — это перерисовка DOM
       * ~100 000 раз и заморозка браузера.
       * Счётчик шагов сбрасывается (как в rest). n < 1 / нецелое — нет-оп.
       */
      fastForward(n) {
        const k = Number.isInteger(n) ? n : Math.floor(Number(n));
        if (k < 1) return day;
        day += k;
        steps = 0;
        return day;
      },
    };
  }

  /**
   * Группы, пора респауниться.
   * @param {object} defeatedAt {'x,y' → день поражения}
   * @param {number} day текущий день
   * @param {number} [respawnDays]
   * @returns {string[]} ключи тайлов
   */
  // 000099: default-параметр живёт — оценивается на ВЫЗОВЕ (live).
  function dueForRespawn(defeatedAt, day, respawnDays = liveRespawnDays()) {
    const out = [];
    for (const [key, defeatedDay] of defeatedAt) {
      if (day - defeatedDay >= respawnDays) out.push(key);
    }
    return out;
  }

  /**
   * Видима ли стационарная группа на глобальной карте (задача 000122).
   * false — в defeatedAt есть запись её тайла (повержена, ждёт
   * респауна); true — записи нет. Мусор вместо defeatedAt — fail-open
   * (true, спрайт рисуется — старое поведение, игра не ломается;
   * принцип 000029). Ключ — ТОЧНО формат main.js: `x + ',' + y`
   * (целые, без пробелов, отрицательные возможны). Принимает и Map
   * (рабочее состояние main.js), и обычный объект (сырой сейв до
   * restoreDefeatedAt); для объекта — hasOwnProperty, а не `in`
   * (прототип-безопасность: объект без прототипа / с чужими ключами в
   * прототипе не лжёт о записи). Чистая: вход не мутируется.
   * @param {object|Map} defeatedAt {'x,y' → день поражения}
   * @param {number} x координата тайла
   * @param {number} y координата тайла
   */
  function groupVisible(defeatedAt, x, y) {
    if (!defeatedAt || typeof defeatedAt !== 'object') return true;
    const key = x + ',' + y;
    if (typeof defeatedAt.has === 'function') return !defeatedAt.has(key);
    return !Object.prototype.hasOwnProperty.call(defeatedAt, key);
  }

  /** «Раз в день»: можно ли применить эффект (фонтан, круг, …). */
  function canUseToday(lastUsedDay, day) {
    return lastUsedDay !== day;
  }

  // --- Побеждённые группы в сейве (задача 000031) ---
  // defeatedAt — Map('x,y' → день поражения). JSON Map не сериализует,
  // поэтому в сейв идёт обычный объект; при восстановлении — валидация
  // (битый/подделанный сейв не роняет игру — принцип 000029).

  /** Map 'x,y' → день → JSON-объект { 'x,y': день }. */
  function serializeDefeatedAt(defeatedAt) {
    const out = {};
    if (!defeatedAt || typeof defeatedAt.entries !== 'function') return out;
    for (const [k, d] of defeatedAt.entries()) out[k] = d;
    return out;
  }

  /**
   * Обратное: объект сейва → Map. Берутся ТОЛЬКО валидные записи:
   * ключ — целые координаты 'x,y' (координаты мира — целые, могут быть
   * отрицательными), значение — целое ≥ 1 (день). Прочее отбрасывается.
   * @returns {Map<string, number>}
   */
  function restoreDefeatedAt(saved) {
    const out = new Map();
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return out;
    for (const [k, d] of Object.entries(saved)) {
      if (typeof k !== 'string' || !/^-?\d+,-?\d+$/.test(k)) continue;
      if (!Number.isInteger(d) || d < 1) continue;
      out.set(k, d);
    }
    return out;
  }

  // --- Состояние эффектов построек (задача 000072) ---
  // Обобщение паттерна defeatedAt на ключи 'x,y[:effectId]' (счёт на
  // ЭФФЕКТ, не на здание) + временные благословения { source, day, kind }
  // с АБСОЛЮТНЫМИ днями (сейв — СНИМОК: fastForward без слушателей,
  // 000031 — эффекты прошедших дней уже учтены в данных).

  // Ключ раздела «раз в день»: целые координаты (могут быть
  // отрицательными) + опциональный суффикс ':effectId' (без пробелов,
  // запятых и двоеточий). Конвенция effectId — латиница без ':'/','
  // (каталог 000073+); id с ':' или ',' — запись тихо отбрасывается
  // (fail-open: эффект снова доступен, игра не ломается).
  const DAY_MAP_KEY_RE = /^-?\d+,-?\d+(?::[^\s,:]+)?$/;
  const COORD_RE = /^-?\d+,-?\d+$/;

  // Виды благословений (зафиксировано в задаче 000072; потребление в
  // формулах боя — 000076). Множители ФИКСИРОВАНЫ на вид: два храма
  // солнца → 1.05, а НЕ 1.05×1.05; две горы → +1, а не +2.
  const SUN_DAMAGE_MULT = 1.05;
  const MOUNTAIN_ARMOR = 1;
  const BUFF_KINDS = { damage: 1, armor: 1 };

  /** Map 'x,y[:effectId]' → день → JSON-объект { 'x,y[:effectId]': день }. */
  function serializeDayMap(dayMap) {
    const out = {};
    if (!dayMap || typeof dayMap.entries !== 'function' ||
        Array.isArray(dayMap)) return out;
    for (const [k, d] of dayMap.entries()) out[k] = d;
    return out;
  }

  /**
   * Обратное: объект сейва → Map. Берутся ТОЛЬКО валидные записи:
   * ключ — целые координаты 'x,y' + опциональный суффикс ':effectId',
   * значение — целое ≥ 1 (день). Прочее отбрасывается.
   * @returns {Map<string, number>}
   */
  function restoreDayMap(saved) {
    const out = new Map();
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return out;
    for (const [k, d] of Object.entries(saved)) {
      if (typeof k !== 'string' || !DAY_MAP_KEY_RE.test(k)) continue;
      if (!Number.isInteger(d) || d < 1) continue;
      out.set(k, d);
    }
    return out;
  }

  /**
   * Выдать благословение (Чисто: новый массив, вход не мутируется).
   * Повтор того же (source, kind) — обновление дня (дублей нет);
   * разные (source, kind) сосуществуют. Не-валидные записи входа —
   * отбрасываются (принцип 000029).
   * @param {Array<{source: string, day: number, kind: string}>} buffs
   * @param {string} source координаты постройки 'x,y'
   * @param {number} day абсолютный день выдачи
   * @param {string} kind 'damage' | 'armor'
   * @returns {Array} новый массив благословений
   */
  function grantBuff(buffs, source, day, kind) {
    const out = [];
    for (const b of Array.isArray(buffs) ? buffs : []) {
      if (!b || typeof b.source !== 'string' || !COORD_RE.test(b.source) ||
          typeof b.kind !== 'string' || !BUFF_KINDS[b.kind] ||
          !Number.isInteger(b.day) || b.day < 1) continue;
      out.push({ source: b.source, day: b.day, kind: b.kind });
    }
    if (typeof source === 'string' && COORD_RE.test(source) &&
        typeof kind === 'string' && BUFF_KINDS[kind] &&
        Number.isInteger(day) && day >= 1) {
      const i = out.findIndex((b) => b.source === source && b.kind === kind);
      if (i >= 0) out[i] = { source, day, kind };
      else out.push({ source, day, kind });
    }
    return out;
  }

  /**
   * Активные благословения: активен, пока buff.day >= day (абсолютные
   * дни). Чисто: новый массив копий.
   * @returns {Array<{source: string, day: number, kind: string}>}
   */
  function activeBuffs(buffs, day) {
    const out = [];
    if (!Array.isArray(buffs)) return out;
    for (const b of buffs) {
      if (b && typeof b.source === 'string' && typeof b.kind === 'string' &&
          typeof b.day === 'number' && b.day >= day) {
        out.push({ source: b.source, day: b.day, kind: b.kind });
      }
    }
    return out;
  }

  /**
   * Модификаторы благословений для формул боя (потребление — 000076):
   * активный 'damage' → damageMult 1.05 (солнце), активный 'armor' →
   * armor 1 (гора, +1 к броне). Множители фиксированы на вид,
   * неизвестные kind игнорируются.
   * @returns {{damageMult: number, armor: number}}
   */
  function buffMods(buffs, day) {
    const mods = { damageMult: 1, armor: 0 };
    const active = activeBuffs(buffs, day);
    if (active.some((b) => b.kind === 'damage')) mods.damageMult = SUN_DAMAGE_MULT;
    if (active.some((b) => b.kind === 'armor')) mods.armor = MOUNTAIN_ARMOR;
    return mods;
  }

  /**
   * Обратное: массив сейва → массив валидных благословений. source —
   * координаты 'x,y', day — ТОЛЬКО текущий день мира: «будущее»
   * (b.day > day — подделка) и «прошлое» (b.day < day — уже истёкшее)
   * отбрасываются, т.к. очистка в onDay не пройдёт (fastForward без
   * слушателей, 000031); легитимное благословение — 1 день, поэтому
   * в сейве day === день мира. kind — whitelist. Не-массив/мусор → [].
   * @param {Array} saved раздел data.buffs из сейва
   * @param {number} day текущий день мира
   */
  function restoreBuffs(saved, day) {
    const out = [];
    if (!Array.isArray(saved)) return out;
    for (const b of saved) {
      if (!b || typeof b.source !== 'string' || !COORD_RE.test(b.source)) continue;
      if (typeof b.kind !== 'string' || !BUFF_KINDS[b.kind]) continue;
      if (!Number.isInteger(b.day) || b.day !== day) continue;
      out.push({ source: b.source, day: b.day, kind: b.kind });
    }
    return out;
  }

  /** Массив копий {source, day, kind} → JSON-массив; не-массив → []. */
  function serializeBuffs(buffs) {
    const out = [];
    if (!Array.isArray(buffs)) return out;
    for (const b of buffs) {
      if (!b || typeof b.source !== 'string' || typeof b.kind !== 'string' ||
          !Number.isInteger(b.day) || b.day < 1) continue;
      out.push({ source: b.source, day: b.day, kind: b.kind });
    }
    return out;
  }

  return {
    STEPS_PER_DAY, RESPAWN_DAYS,
    createClock, dueForRespawn, canUseToday,
    serializeDefeatedAt, restoreDefeatedAt, groupVisible,
    // Задача 000072: состояние эффектов построек.
    SUN_DAMAGE_MULT, MOUNTAIN_ARMOR,
    serializeDayMap, restoreDayMap,
    grantBuff, activeBuffs, buffMods, restoreBuffs, serializeBuffs,
  };
});

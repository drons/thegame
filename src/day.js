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

  /**
   * Часы игрового дня.
   * День сменяется: каждые stepsPerDay шагов мира, или явно — event()/rest().
   * @param {{stepsPerDay?: number}} [opts]
   */
  function createClock(opts = {}) {
    const perDay = opts.stepsPerDay || STEPS_PER_DAY;
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
      get stepsPerDay() { return perDay; },
      /** Подписка на смену дня: fn({ day, reason }). Возвращает часы. */
      onDay(fn) { listeners.push(fn); return this; },
      /** Шаги по основной карте: при пороге — новый день (избыток переходит). */
      addStep(n = 1) {
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
  function dueForRespawn(defeatedAt, day, respawnDays = RESPAWN_DAYS) {
    const out = [];
    for (const [key, defeatedDay] of defeatedAt) {
      if (day - defeatedDay >= respawnDays) out.push(key);
    }
    return out;
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

  return {
    STEPS_PER_DAY, RESPAWN_DAYS,
    createClock, dueForRespawn, canUseToday,
    serializeDefeatedAt, restoreDefeatedAt,
  };
});

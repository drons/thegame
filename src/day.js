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

  return {
    STEPS_PER_DAY, RESPAWN_DAYS,
    createClock, dueForRespawn, canUseToday,
  };
});

// Управление: маппинг клавиш → направление перемещения.
//
// Чистое ядро без DOM — тестируется в node (tests/controls.test.js).
//
// ВАЖНО (задача 000028): у клавишного события ДВЕ независимые системы
// идентификаторов, и их нельзя смешивать в одной таблице:
//   * event.code — ФИЗИЧЕСКАЯ клавиша, НЕ зависит от раскладки.
//     На русской раскладке та же физическая клавиша, что «W», даёт
//     code «KeyW» (а не «KeyЦ» — кириллических code не существует).
//   * event.key — СИМВОЛ в текущей раскладке (на «KeyW» в русской — «ц»).
// Раньше в main.js была одна таблица по e.code, куда попали «KeyЦ/Ф/Ы/В» —
// значения из мира e.key: они никогда не срабатывали (перепутанные связки).
//
// Маппинг здесь двухуровневый:
//   1) по e.code — стрелки и физические WASD (в русской раскладке это
//      и есть клавиши ЦФЫВ — работают без дополнительной поддержки);
//   2) по e.key — символы (русские ц/ф/ы/в, без учёта регистра): фолбэк
//      для сценариев, где code не несёт информации (виртуальные клавиатуры
//      отдают code «Unidentified») и явная поддержка по символу.
//
// Направления — в координатах мира: y растёт вниз (строки карты),
// поэтому «вверх» = [0, -1].
//
// Униформный модуль: в браузере — globalThis.Game, в node — require().
// Зависимостей нет.

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Game = Object.assign({}, root.Game, factory());
  }
})(typeof globalThis !== 'undefined' ? globalThis : self, function () {

  'use strict';

  // Имена направлений (порядок — незначащий, но стабилен для отладки).
  const DIRS = ['up', 'down', 'left', 'right'];

  // Дельты в координатах мира (y — вниз).
  const DIR_DELTA = {
    up: [0, -1],
    down: [0, 1],
    left: [-1, 0],
    right: [1, 0],
  };

  // event.code → направление. Только канонические code (без кириллицы!).
  // Стрелки + физические WASD: на любой раскладке это те же клавиши,
  // что ЦФЫВ в русской.
  const CODE_DIRS = {
    ArrowUp: 'up',
    ArrowDown: 'down',
    ArrowLeft: 'left',
    ArrowRight: 'right',
    KeyW: 'up',
    KeyA: 'left',
    KeyS: 'down',
    KeyD: 'right',
  };

  // event.key (в нижнем регистре) → направление. Русские символы —
  // фолбэк уровня символов (см. шапку файла).
  const KEY_DIRS = {
    'ц': 'up',
    'ф': 'left',
    'ы': 'down',
    'в': 'right',
  };

  /**
   * Идентификатор нажатой клавиши перемещения по событию.
   * Возвращаем сам e.code (если он распознан) или нормализованный
   * (lowercase) e.key — так keydown/keyup дают одинаковый id даже при
   * смене регистра (Shift), и Set «удерживаемых» в main.js согласован.
   * @param {{code?: string, key?: string}} e событие (или объект с полями)
   * @returns {string|null} id клавиши перемещения или null
   */
  function moveKeyForEvent(e) {
    if (!e) return null;
    if (e.code && CODE_DIRS[e.code]) return e.code; // физическая клавиша
    if (e.key) {
      const k = String(e.key).toLowerCase();
      if (KEY_DIRS[k]) return k; // символ раскладки
    }
    return null;
  }

  /**
   * Дельта [dx, dy] в координатах мира по id клавиши перемещения.
   * @param {string} id — результат moveKeyForEvent
   * @returns {[number, number]|null}
   */
  function deltaForMoveKey(id) {
    if (!id) return null;
    const dir = CODE_DIRS[id] || KEY_DIRS[id];
    return dir ? DIR_DELTA[dir] : null;
  }

  /**
   * Дельта [dx, dy] сразу по событию (удобно для виртуальных/тач-кнопок:
   * достаточно передать {key: 'ц'} или {code: 'ArrowUp'}).
   * @param {{code?: string, key?: string}} e
   * @returns {[number, number]|null}
   */
  function deltaForEvent(e) {
    return deltaForMoveKey(moveKeyForEvent(e));
  }

  return { DIRS, DIR_DELTA, CODE_DIRS, KEY_DIRS,
    moveKeyForEvent, deltaForMoveKey, deltaForEvent };
});

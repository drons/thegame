// Управление: маппинг клавиш → направление перемещения; тач-вариант
// контролов (задача 000018): детект устройства, выбор схемы, раскладка
// и хит-тест on-screen-кнопок.
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
   * Дельта [dx, dy] в координатах мира по id «удерживаемой клавиши».
   * Понимает: результат moveKeyForEvent (e.code / e.key) и виртуальные
   * тач-клавиши 'touch:<dir>' (задача 000018) — main.js кладёт их в тот
   * же Set удерживаемых, что и настоящие клавиши.
   * @param {string} id
   * @returns {[number, number]|null}
   */
  function deltaForMoveKey(id) {
    if (!id || typeof id !== 'string') return null;
    if (id.indexOf('touch:') === 0) {
      return DIR_DELTA[id.slice('touch:'.length)] || null; // 'touch:interact' → null
    }
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

  // --- Тач-вариант контролов (задача 000018) ---
  //
  // На тачскрине вместо клавиш — on-screen-контролы (DOM в src/ui.js):
  // D-pad (квадрат внизу слева; четыре направления вокруг центра, в
  // центре — мёртвая зона) и кнопка «действие» внизу справа — аналог
  // [E] (диалог NPC / вход в подземелье). Пальцем можно «скользить» по
  // D-pad — направление переключается.
  //
  // Всё чистое: детект — по СНИМКУ окружения (вызывающий сам собирает
  // navigator/matchMedia), раскладка — по размерам вьюпорта, хит-тест —
  // по точке. Ни document, ни navigator — не трогаем.

  // Все действия тач-контролов.
  const TOUCH_ACTIONS = ['up', 'down', 'left', 'right', 'interact', 'inventory'];

  // Радиус мёртвой зоны D-pad, доля от размера (центр — «никуда»).
  const TOUCH_DEADZONE = 0.18;

  // Зазор между кнопками [E] (action) и [I] (inventory), px (задача
  // 000123). ТЗ требует ≥ 8 — 12 даёт запас под пальцы. Приватная
  // константа: в экспорт не выносится, тесты пинят зазор по
  // прямоугольникам раскладки.
  const TOUCH_ACTION_GAP = 12;

  /**
   * Виртуальная «клавиша» для Set удерживаемых в main.js.
   * @param {'up'|'down'|'left'|'right'|'interact'|'inventory'|string} action
   * @returns {'touch:up'|'touch:down'|'touch:left'|'touch:right'|null}
   *          null — для 'interact'/'inventory' и неизвестных
   *          (не направление)
   */
  function touchMoveKeyForAction(action) {
    if (action && DIR_DELTA[action]) return 'touch:' + action;
    return null;
  }

  /**
   * Определение «устройство с тачскрином» по СНИМКУ окружения — чистая
   * функция: в node нет navigator, поэтому значения подставляет
   * вызывающий (браузерный код main.js).
   * @param {{maxTouchPoints?: number, touchEvents?: boolean,
   *          coarsePointer?: boolean}|null|undefined} env
   *   maxTouchPoints — navigator.maxTouchPoints (> 0 — есть);
   *   touchEvents — 'ontouchstart' in window;
   *   coarsePointer — matchMedia('(pointer: coarse)').matches
   * @returns {boolean}
   */
  function isTouchDevice(env) {
    if (!env || typeof env !== 'object') return false;
    // Строгая проверка: maxTouchPoints в браузерах — number, строка
    // '5' или -1/NaN — мусор, не считаем.
    if (Number.isFinite(env.maxTouchPoints) && env.maxTouchPoints > 0) {
      return true;
    }
    if (env.touchEvents === true) return true;
    if (env.coarsePointer === true) return true;
    return false;
  }

  /**
   * Выбор схемы контролов.
   * @param {object} env — снимок окружения (см. isTouchDevice)
   * @param {string|null|undefined} forced — явный выбор пользователя
   *   ('touch' | 'keyboard'); прочие значения игнорируются.
   * @returns {'touch'|'keyboard'}
   */
  function chooseControlsScheme(env, forced) {
    if (forced === 'touch' || forced === 'keyboard') return forced;
    return isTouchDevice(env) ? 'touch' : 'keyboard';
  }

  function _inRect(px, py, r) {
    return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
  }

  /**
   * Раскладка on-screen-контролов в координатах вьюпорта (CSS px,
   * начало — верхний левый угол):
   *   dpad      — квадрат внизу слева (размер от диагонали вьюпорта,
   *               96…220 px, не больше вьюпорта);
   *   action    — квадрат внизу справа (≈ половина D-pad, 56…96 px),
   *               при opts.bottomInset поднят вверх (под кнопку
   *               полноэкранного режима);
   *   inventory — квадрат ТОГО ЖЕ размера что action, над ним с
   *               зазором TOUCH_ACTION_GAP (задача 000123): пара
   *               [I] над [E]. Чтобы пара влезла с учётом inset,
   *               размер B дополнительно ограничен
   *               floor((availH − inset − GAP) / 2) (на низком
   *               вьюпорте B ужимается ниже 56, как сейчас).
   * ВСЕГДА возвращает три прямоугольника — независимо от того,
   * строится ли D-pad в DOM (схема 'keyboard' — только кнопки).
   * @param {number} width, height — вьюпорт (<= 0 / NaN → три нуля)
   * @param {{bottomInset?: number}} [opts]
   * @returns {{dpad: {x: number, y: number, w: number, h: number},
   *            action: {x: number, y: number, w: number, h: number},
   *            inventory: {x: number, y: number, w: number, h: number}}}
   */
  function layoutTouchControls(width, height, opts) {
    const w = Number(width), h = Number(height);
    const bad = !Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0;
    if (bad) {
      return {
        dpad: { x: 0, y: 0, w: 0, h: 0 },
        action: { x: 0, y: 0, w: 0, h: 0 },
        inventory: { x: 0, y: 0, w: 0, h: 0 },
      };
    }
    const M = 16; // отступ от краёв
    const inset = opts && Number.isFinite(opts.bottomInset)
      ? Math.max(0, Number(opts.bottomInset)) : 0;
    const availW = Math.max(0, w - 2 * M);
    const availH = Math.max(0, h - 2 * M);
    const S = Math.max(0, Math.min(
      220, Math.max(96, Math.floor(Math.min(w, h) * 0.4)), availW, availH));
    const dpad = { x: M, y: h - M - S, w: S, h: S };
    // Член floor((availH − inset − GAP) / 2) — пара action+inventory
    // влезает в вьюпорт с учётом bottomInset (задача 000123). На
    // типичных вьюпортах он не активен — action побайтово как раньше.
    const B = Math.max(0, Math.min(
      96, Math.max(56, Math.floor(S * 0.5)), availW, availH - inset,
      Math.floor((availH - inset - TOUCH_ACTION_GAP) / 2)));
    const action = { x: w - M - B, y: h - M - inset - B, w: B, h: B };
    // inventory — та же правая колонка, непосредственно над action.
    const inventory = {
      x: action.x, y: action.y - TOUCH_ACTION_GAP - B, w: B, h: B,
    };
    return { dpad, action, inventory };
  }

  /**
   * Действие по точке on-screen-контролов.
   * D-pad: направление — по ДОМИНИРУЮЩЕЙ оси от центра (по диагонали 45°
   * выигрывает горизонталь); в центре — мёртвая зона (null), снаружи —
   * null. Кнопки имеют приоритет перед D-pad: inventory ПЕРВАЯ (задача
   * 000123), затем action — формально приоритет, т.к. прямоугольники
   * не пересекаются (зазор > 0).
   * @param {number} x, y — CSS px вьюпорта
   * @param {{dpad: object, action: object, inventory?: object}} layout
   *   — layoutTouchControls; старое layout-объект без inventory —
   *   деградация (не крах): inventory просто не отвечает.
   * @returns {'up'|'down'|'left'|'right'|'interact'|'inventory'|null}
   */
  function touchActionAt(x, y, layout) {
    if (!layout || !Number.isFinite(x) || !Number.isFinite(y)) return null;
    const a = layout.action, d = layout.dpad, v = layout.inventory;
    if (v && v.w > 0 && v.h > 0 && _inRect(x, y, v)) return 'inventory';
    if (a && a.w > 0 && a.h > 0 && _inRect(x, y, a)) return 'interact';
    if (!d || d.w <= 0 || d.h <= 0 || !_inRect(x, y, d)) return null;
    const dx = x - (d.x + d.w / 2);
    const dy = y - (d.y + d.h / 2);
    if (Math.hypot(dx, dy) < d.w * TOUCH_DEADZONE) return null; // мёртвая зона
    if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left';
    return dy >= 0 ? 'down' : 'up';
  }

  // --- Роутинг тач-ввода (задача 000121) ---
  //
  // Единый D-pad (000018) маршрутизирует события в активный экран по
  // приоритету: бой > подземелье > карта. Решение «какой экран активен»
  // — чистая функция от СНИМКА оверлеев (клей main.js собирает снимок в
  // момент события). dialog/building — map-локальные оверлеи (npcUI/
  // buildingUI): принимаются в снимке, но НЕ ПОТРЕБЛЯЮТСЯ (поведение
  // при них = как на карте: движение подавит frame-гейт main.js,
  // [E] → buildingActions.toggle() закроет их сам). Контракт —
  // memory/000121-touch-dungeon-combat.md, memory/000121-dpad-routing.md.

  // Единая точка маппинга тач→e.code: направления D-pad дают те же
  // коды, что клавиатура (СТРЕЛКИ — каноничная половина CODE_DIRS;
  // стрелки и WASD дают один resolveCombatKey-результат — одна
  // таблица combat-keys.js, дублирования нет), [E] — 'KeyE' (в бою —
  // «Быстрый предмет», та же ветка, что клавиша). 'inventory' кода
  // не имеет — [I] НЕ роутится (000123; контракт-гард, а не крах).
  const TOUCH_KEY_CODES = {
    up: 'ArrowUp',
    down: 'ArrowDown',
    left: 'ArrowLeft',
    right: 'ArrowRight',
    interact: 'KeyE',
  };

  /**
   * e.code тач-действия — тот же, что у клавиатуры, или null.
   * @param {'up'|'down'|'left'|'right'|'interact'|string|null} action
   * @returns {'ArrowUp'|'ArrowDown'|'ArrowLeft'|'ArrowRight'|'KeyE'|null}
   *          null — для 'inventory'/неизвестных (не роутится)
   */
  function touchKeyCode(action) {
    return TOUCH_KEY_CODES[action] || null;
  }

  /**
   * Активный экран для тач-ввода по снимку оверлеев (ЧИСТАЯ функция:
   * без Game/document/navigator, аргумент не мутирует).
   * Приоритет (ТЗ 000121): бой > подземелье > карта.
   * @param {{combat?: boolean, dungeon?: boolean, dialog?: boolean,
   *          building?: boolean}|null|undefined} screens
   *   Снимок в МОМЕНТ события. dialog/building — map-локальные
   *   оверлеи: на результат не влияют.
   * @returns {'combat'|'dungeon'|'map'}
   *   Мусор/не-boolean (жёсткие === true) → 'map' — деградация к
   *   поведению карты, не крах.
   */
  function routeTouchScreen(screens) {
    if (screens && screens.combat === true) return 'combat';
    if (screens && screens.dungeon === true) return 'dungeon';
    return 'map';
  }

  /**
   * Видимость on-screen-контролов по снимку активных экранов
   * (ЧИСТАЯ функция: без Game/document, аргумент не мутирует).
   * ТЗ 000150 (задача 000154):
   *   Экран            | Кнопки [I]/[E] | D-pad
   *   -----------------+-----------------+--------
   *   бой              | СКРЫТЫ          | ОСТАЁТСЯ
   *   инвентарь [I]    | СКРЫТЫ          | СКРЫТ
   *   вход в здание [E]| СКРЫТЫ          | СКРЫТ
   *   карта (ничего)   | видимы          | виден
   * dungeon/dialog и прочие поля снимка — принимаются, но НЕ
   * ПОТРЕБЛЯЮТСЯ (ТЗ их не упоминает — «не больше и не меньше»).
   * Мусор/не-boolean (жёсткие === true, паттерн routeTouchScreen):
   * всё видимо — безопасное направление (игрок не теряет контролы).
   * @param {{combat?: boolean, inventory?: boolean,
   *          building?: boolean}|null|undefined} screens
   * @returns {{buttons: boolean, dpad: boolean}}
   *   buttons — пара кнопок [I]/[E] одной единицей (ТЗ скрывает их
   *   вместе), dpad — D-pad (в бою ДВИЖЕНИЕ по полю — 000121).
   */
  function touchControlsVisibility(screens) {
    const combat = !!(screens && screens.combat === true);
    const inventory = !!(screens && screens.inventory === true);
    const building = !!(screens && screens.building === true);
    return {
      buttons: !(combat || inventory || building),
      dpad: !(inventory || building),
    };
  }

  return { DIRS, DIR_DELTA, CODE_DIRS, KEY_DIRS,
    moveKeyForEvent, deltaForMoveKey, deltaForEvent,
    TOUCH_ACTIONS, TOUCH_DEADZONE,
    touchMoveKeyForAction, isTouchDevice, chooseControlsScheme,
    layoutTouchControls, touchActionAt,
    TOUCH_KEY_CODES, touchKeyCode, routeTouchScreen,
    touchControlsVisibility };
});

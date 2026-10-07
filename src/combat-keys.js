// Боевые клавиши (задача 000048): единая таблица биндингов боя.
//
// До 000048 биндинги боя задублированы в четырёх местах: keydown-цепочка,
// keyDir(), подписи кнопок ('Удар [A]') и шапка-комментарий
// src/combat-ui.js. Теперь ЕДИНЫЙ источник — эта таблица COMBAT_KEYS:
// keydown и подписи кнопок в combat-ui.js строятся из неё же.
//
// Модель клавиш (задача 000028, src/controls.js): e.code — ФИЗИЧЕСКАЯ
// клавиша, не зависит от раскладки. Кириллических code не существует —
// записей 'KeyЦ'/'KeyЫ'/'KeyФ'/'KeyВ' в таблице нет (они были мёртвым
// кодом). Русские буквы на тех же физических клавишах: KeyJ=О, KeyK=Л,
// KeyU=Г, KeyQ=Й, KeyR=К, KeyB=И, KeyE=У, KeyF=А(кир.), KeyW/A/S/D=ЦФЫВ.
//
// Движение в бою = движение в мире (решение 000048): движ. строки
// таблицы строятся из Game.CODE_DIRS/Game.DIR_DELTA (src/controls.js) —
// инвариант «одна таблица направлений» структурный, а не тестовый.
// WASD/ЦФЫВ в бою двигают ПОЛНОСТЬЮ (KeyA/Ф — влево, как в мире);
// «Удар» перенесён с KeyA на KeyJ (правая рука, «джойстик» у Space),
// дубли: KeyK (Л) → attack, KeyU (Г) → invItem. KeyQ/R — «Книга
// заклинаний» (задача 000149: действия fire/heal объединены в одно
// действие spellbook; KeyQ — primary, KeyR — дубль). Каждая клавиша —
// ровно одно назначение.
//
// resolveCombatKey(code, state) — ЧИСТАЯ функция: state — снимок окружения
// (phase, result, canDo — результат G.canDoAction, задача 000037), а не
// сам бой: непure-часть (canDoAction по живому c) делает UI и передаёт
// снимком. Невозможное действие → kind 'action' + reason (формулировка
// canDoAction; UI пишет её в журнал c.log, а не молчит).
//
// Чистый модуль без DOM — тестируется в node (tests/combat-keys.test.js).
// Униформный модуль: в браузере — Game.CombatKeys (globalThis.Game),
// в node — require(). Зависимость: controls.js (CODE_DIRS/DIR_DELTA).

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    const C = require('./controls.js');
    module.exports = factory(C.CODE_DIRS, C.DIR_DELTA);
  } else {
    // controls.js обязан быть загружен РАНЬШЕ (tests/index-order.test.js);
    // иначе factory вернёт undefined (с console.error) и Game.CombatKeys
    // не появится — combat-ui.js оставит свой след в консоли.
    const api = factory(root.Game && root.Game.CODE_DIRS,
      root.Game && root.Game.DIR_DELTA);
    if (api) root.Game = Object.assign({}, root.Game, { CombatKeys: api });
  }
})(typeof globalThis !== 'undefined' ? globalThis : self,
  function (CODE_DIRS, DIR_DELTA) {

  'use strict';

  if (!CODE_DIRS || !DIR_DELTA) {
    console.error('combat-keys.js: не найдены Game.CODE_DIRS/Game.DIR_DELTA ' +
      '(src/controls.js) — загрузите src/controls.js ДО src/combat-keys.js');
    return undefined;
  }

  // Русские имена действий (подписи кнопок; порядок — незначащий).
  const ACTION_LABELS = {
    attack: 'Удар',
    spellbook: 'Книга заклинаний',
    block: 'Блок',
    quickItem: 'Быстрый предмет',
    invItem: 'Предмет',
    flee: 'Побег',
    endTurn: 'Конец хода',
  };

  // Таблица боевой клавиатуры: e.code → запись.
  //   { type: 'move', dx, dy }               — шаг (дельта мира, y — вниз);
  //   { type: 'action', action, primary? }   — действие ядра (имя для
  //                                            canDoAction/кнопок).
  // ТОЛЬКО канонические e.code (кириллических кодов не существует).
  const COMBAT_KEYS = {};

  // Движение — из controls.js (CODE_DIRS × DIR_DELTA): 8 физических
  // клавиш (стрелки + WASD), те же коды, что в мире.
  for (const [code, dir] of Object.entries(CODE_DIRS)) {
    const d = DIR_DELTA[dir];
    COMBAT_KEYS[code] = { type: 'move', dx: d[0], dy: d[1] };
  }

  // Действия. primary — первичная клавиша для подписи кнопки; дубли
  // (KeyK, KeyQ, KeyU) — новые физические клавиши для русской раскладки
  // (на KeyJ — «О», на KeyK — «Л»; на KeyQ — «Й», на KeyR — «К»;
  // на KeyT — «Т», на KeyU — «Г»).
  for (const [code, action, primary] of [
    ['KeyJ', 'attack', true],
    ['KeyK', 'attack', false],
    ['KeyQ', 'spellbook', true],
    ['KeyR', 'spellbook', false],
    ['KeyB', 'block', false],
    ['KeyE', 'quickItem', false],
    ['KeyT', 'invItem', true],
    ['KeyU', 'invItem', false],
    ['KeyF', 'flee', false],
    ['Space', 'endTurn', false],
  ]) {
    const entry = { type: 'action', action };
    if (primary) entry.primary = true;
    COMBAT_KEYS[code] = entry;
  }

  /**
   * Клавиша → действие боя по СНИМКУ окружения (чистая функция).
   * @param {string} code — e.code
   * @param {{phase?: 'player'|'mob'|'over', result?: object|null,
   *          canDo?: {ok: boolean, reason?: string}|null|undefined}} state
   *   — снимок боя, который собирает UI: phase/result — поля c,
   *   canDo — результат G.canDoAction(c, <действие этой клавиши>,
   *   { targetId: c.targetId }) (только для клавиш действия; для
   *   движения не нужен — причины отклонения позиции-зависимы и
   *   проверятся ядром playerMove при c.move).
   * @returns {{kind: 'move', dx: number, dy: number}
   *          | {kind: 'action', action: string, reason?: string}
   *          | {kind: 'none'}}
   *   — 'none' — клавиша не боевая (или бой уже закончен: закрытие
   *     оверлея — Escape/Space/Enter — живёт в UI, вне таблицы);
   *   — 'action' + reason — действие невозможно (UI пишет reason в
   *     c.log; действие НИКОГДА не выполняется молча — без canDo
   *     fail-safe по phase).
   */
  function resolveCombatKey(code, state) {
    const st = state || {};
    const entry = COMBAT_KEYS[code];
    if (!entry || st.result) return { kind: 'none' };
    if (entry.type === 'move') {
      return { kind: 'move', dx: entry.dx, dy: entry.dy };
    }
    const canDo = st.canDo;
    if (canDo && canDo.ok) return { kind: 'action', action: entry.action };
    if (canDo) {
      return { kind: 'action', action: entry.action,
        reason: canDo.reason || 'сейчас нельзя' };
    }
    // canDo отсутствует — fail-safe: действие не выполняется, причина
    // по phase — теми же формулировками, что checkTurn в ядре
    // ('over' → «бой закончен», не-'player' → «не ваш ход»);
    // 'player' без canDo — «сейчас нельзя».
    let reason;
    if (st.phase === 'over') {
      reason = 'бой закончен';
    } else if (st.phase !== 'player') {
      reason = 'не ваш ход';
    } else {
      reason = 'сейчас нельзя';
    }
    return { kind: 'action', action: entry.action, reason };
  }

  /**
   * Данные для подписей кнопок — из одной таблицы (порядок = порядок
   * первого появления действия в COMBAT_KEYS = текущий порядок кнопок):
   * [{ action, label, primaryKey, keys: [code, ...] }, ...].
   * primaryKey — запись с флагом primary; без флага — единственная
   * клавиша действия; несколько клавиш без primary — ошибка таблицы.
   * @returns {Array<{action: string, label: string,
   *                  primaryKey: string, keys: string[]}>}
   */
  function describeCombatKeys() {
    const out = [];
    const byAction = {};
    for (const [code, entry] of Object.entries(COMBAT_KEYS)) {
      if (entry.type !== 'action') continue;
      let item = byAction[entry.action];
      if (!item) {
        item = { action: entry.action,
          label: ACTION_LABELS[entry.action] || entry.action,
          primaryKey: null, keys: [] };
        byAction[entry.action] = item;
        out.push(item);
      }
      item.keys.push(code);
      if (entry.primary) item.primaryKey = code;
    }
    for (const item of out) {
      if (item.primaryKey) continue;
      if (item.keys.length === 1) {
        item.primaryKey = item.keys[0];
        continue;
      }
      throw new Error('combat-keys: у действия «' + item.action +
        '» несколько клавиш, но ни одна не помечена primary: ' +
        item.keys.join(', '));
    }
    return out;
  }

  /**
   * Подпись клавиши в скобках кнопки: 'KeyJ' → 'J', 'Space' → 'Space'.
   * @param {string} code
   * @returns {string}
   */
  function keyLabel(code) {
    if (typeof code === 'string' && code.indexOf('Key') === 0
        && code.length === 4) {
      return code.slice(3);
    }
    return code;
  }

  return { COMBAT_KEYS, resolveCombatKey, describeCombatKeys, keyLabel };
});

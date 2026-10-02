// Эфир: постоянный союзник (задача 000081, родитель 000065, SPEC.md
// «Дух Эфира»): «мини-персонаж» со собственным НЕЗАВИСИМЫМ пулом
// уровень/xp — частный случай фреймворка «союзный юнит» (000080,
// kind 'efir'; в бою — данные makeAlly, src/combat.js — без изменений).
//
// ЧИСТЫЙ UMD-модуль, НОЛЬ зависимостей при загрузке (прецеденты
// 000053/000038/000127): node — module.exports = factory(); браузер —
// Game.efir. Взаимных require при загрузке нет (оба ветки): порог
// xpForNext (src/player.js) читается ЛЕНИВО в момент ВЫЗОВА
// (паттерн rootRef); снапшота Game при загрузке НЕТ (000038),
// throw на загрузке — НЕТ (мягкая зависимость).
//
// Состояние — форма ЗАФИКСИРОВАНА под сейв 000085: ровно
// {level, xp, skills}. HP/MP в состоянии НЕТ: каждый бой — новый
// makeAlly (hp = maxHP) → «возврат со 100% HP» — СТРУКТУРНО, кода
// восстановления нет (serializeEfir/deserializeEfir добавит 000085
// прямо в этот файл).
//
// Данные пула — В САМОМ МОДУЛЕ (SPEC: подзадачи 000035 правят только
// этот файл): v1 — скромный пул [spark, mend] («огонь/исцеление»);
// 000111 заменит таблицей открытий по уровням (механику xp/уровень
// не трогает).
//
// 100% боевого опыта: addEfirXp получает ВЕСЬ result.xp (тот же, что
// 100% игроку, ДО бонуса «Учёный»); companion_xp_share НЕ применяется
// (доля — для наёмников, 000082; Эфир в allyXp не попадает по
// построению — положительный фильтр kind === 'merc').
//
// Деградация (игра никогда не падает): Game.xpForNext недоступен на
// момент ВЫЗОВА addEfirXp/levelUp → console.error (один раз) + xp
// копится, уровень НЕ растёт, исключений 0. В браузере недостижимо
// (порядок закрепляет пин tests/index-order.test.js, R12).
//
// Контракты: memory/000081-efir.md (решения), memory/000081-efir-
// ally.md (стабильный API для 000084–000087, 000111–000119).
// Тесты: tests/efir.test.js (R1–R6).

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    // node: ноль взаимных require (чистый UMD, прецедент 000053).
    module.exports = factory();
  } else {
    const G0 = typeof root.Game === 'object' ? root.Game : {};
    root.Game = Object.assign({}, G0, { efir: factory() });
  }
})(typeof globalThis !== 'undefined' ? globalThis : self, function () {
  'use strict';

  // Скромный пул (ТЗ: «огонь/исцеление»): spark (огонь) / mend
  // (исцеление). v1 — константа на всех уровнях; 000111 — таблица
  // открытий (5 light_heal, 8 frost_bolt, …). ДАННЫЕ МОДУЛЯ, не
  // состояния: правятся без касания combat.js/наёмников.
  const EFIR_SPELLS = ['spark', 'mend'];

  // Книга уровня (v1: все уровни одинаковы; параметр — под 000111).
  // СВЕЖАЯ КОПИЯ на каждый вызов: мутация данных боя не ломает модуль
  // (контракт 000081 §3).
  function efirSpells() {
    return EFIR_SPELLS.slice();
  }

  // Game в момент ВЫЗОВА (ленивый захват, прецеденты 000127/000053):
  // модуль обязан грузиться с нулём зависимостей.
  function lazyGame() {
    return typeof globalThis !== 'undefined' ? globalThis.Game : null;
  }

  // Порог xpForNext (src/player.js: round(50·ур^1.5)) — ЛЕНИВО.
  // Деградация: порога нет на момент вызова → console.error ОДИН
  // раз (не спам при каждом бою; «видимая деградация», паттерн
  // 000053), xp копится, уровень не растёт, исключений 0.
  let xpWarned = false;
  function xpForNext() {
    const G = lazyGame();
    if (!G || typeof G.xpForNext !== 'function') {
      if (!xpWarned) {
        xpWarned = true;
        console.error('efir.js: Game.xpForNext недоступен (src/' +
          'player.js обязан грузиться до использования, задача ' +
          '000081) — xp Эфира копится, уровень не растёт');
      }
      return null;
    }
    return G.xpForNext;
  }

  /**
   * «Мини-персонаж» Эфира: состояние — ровно {level, xp, skills}
   * (форма ЗАФИКСИРОВАНА под сейв 000085). HP/MP в состоянии НЕТ:
   * каждый бой — новый makeAlly (hp = maxHP) → «возврат со 100% HP»
   * — структурно. skills — пул вторичных навыков (id → уровень);
   * v1: {} (000111: {firelord, icelord, perception, precog}).
   * @returns {object} НОВОЕ состояние (вызовы независимы).
   */
  function createEfir() {
    return { level: 1, xp: 0, skills: {} };
  }

  /**
   * Повышение по порогам xpForNext (src/player.js) БЕЗ нового xp:
   * while xp ≥ xpForNext(level) — списывает порог, +1 уровень.
   * Обрабатывает xp, накопленный в деградационном окне (R6) и при
   * нормализации сейва (000085/000115). Чистая по state-мутациям.
   * @returns {number} число набранных уровней; 0 — state null, xp
   *   ниже порога или порог недоступен (деградация: console.error,
   *   xp остаётся, исключений 0).
   */
  function levelUp(state) {
    if (!state || typeof state !== 'object') return 0;
    const xpForNextRef = xpForNext();
    if (!xpForNextRef) return 0;
    let n = 0;
    while (state.xp >= xpForNextRef(state.level)) {
      state.xp -= xpForNextRef(state.level);
      state.level += 1;
      n += 1;
    }
    return n;
  }

  /**
   * Начисляет xp: ВЕСЬ (100% боевого опыта — companion_xp_share НЕ
   * применяется: доля — для наёмников, 000082). while-цикл (levelUp):
   * один бой может дать НЕСКОЛЬКО уровней; остаток копится между
   * боями. Тихие skip: state null, amount не число/≤0/NaN → 0, state
   * не мутирован.
   * @returns {number} число набранных уровней; 0 — см. тихие skip или
   *   порог недоступен (деградация: xp копится, уровень не растёт).
   */
  function addEfirXp(state, amount) {
    if (!state || typeof state !== 'object') return 0;
    if (typeof amount !== 'number' || !Number.isFinite(amount) ||
        amount <= 0) {
      return 0;
    }
    state.xp += amount;
    return levelUp(state);
  }

  /**
   * Данные makeAlly (контракт 000081 §3): id 'efir' (дискриминатор),
   * kind строго 'efir' (НЕ 'ether'), name 'Эфир', role 'support',
   * level — из состояния. Явных maxHP/damage НЕТ — формульный путь
   * makeAlly: маркер морали (companionMoraleBonus, 000080, +5%/ур.
   * Предводителя) действует ЧЕРЕЗ формулу (явные статы придут с
   * 000111, правя только этот файл). attrs: {} — v1 (000111 —
   * атрибуты по таблице 000035).
   * @returns {object} данные makeAlly: {id, name, role, level, attrs,
   *   spells (свежая копия), skills: [], kind}.
   */
  function efirAllyData(state) {
    const level = (state && typeof state === 'object'
      && Number.isFinite(state.level) && state.level >= 1)
      ? state.level : 1;
    return {
      id: 'efir',
      name: 'Эфир',
      role: 'support',
      level,
      attrs: {},
      spells: efirSpells(),
      skills: [],
      kind: 'efir',
    };
  }

  return { createEfir, addEfirXp, levelUp, efirAllyData };
});

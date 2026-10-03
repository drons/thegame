// Таверна (44) «Отдых» — спец-модуль (задача 000091, 000064 §3.2.1;
// контракт — memory/000091-tavern-rest-rumors.md).
//
// ПЕРВЫЙ спец-модуль проекта (шаблон 000128 §2.3): «Отдых» —
// мир-действие со «стороной» (день проходит: clock.rest → day+1,
// шаги 0, onDay-подписчики main.js — restore/респауны/saveNow), его
// НЕ может нести чистый apply (снимок не мутирует) — обработчик
// живёт в отдельном модуле и СВОРГРУЖАЕТСЯ сам при загрузке:
// Game.buildingActions.registerSpecial('44_rest', (ctx) =>
// tavernRest(ctx && ctx.clock)). Запись реестра EFFECTS['44_rest']
// (src/building-effects.js) — только имя; message несёт спец-а
// (несёт НОВЫЙ день).
//
// Чистый UMD-модуль (паттерн src/building-actions.js): node —
// require() → { tavernRest } (без регистрации — в node Game нет;
// тесты регистрируют вручную: BA.registerSpecial('44_rest',
// (ctx) => mod.tavernRest(ctx && ctx.clock))). В момент загрузки —
// НОЛЬ зависимостей (ни require, ни чтения Game-функций —
// прецедент 000053). Гарды загрузки (деградация 000053 — игра не
// роняется, пин tests/index-order.test.js):
//   * Game отсутствует (standalone-загрузка) — тихий выход
//     (0 console.error);
//   * Game есть, но Game.buildingActions отсутствует (нарушен
//     порядок: building-actions.js должен грузиться РАНЬШЕ) —
//     console.error (фиксированный текст) + регистрация НЕ
//     происходит.
//
// UMD-ловушка (000038): main.js снимает снапшот `const G =
// globalThis.Game` ОДИН раз — модуль НИКОГДА не переприсваивает
// root Game и не создаёт новый Game-объект: только registerSpecial
// на СУЩЕСТВУЮЩЕМ buildingActions-объекте (specials-таблица живёт
// на модуле — регистрация работает и ДО init, 000128). Тег в
// index.html — ПОСЛЕ building-actions.js и ДО main.js (пин
// отиольный, tests/index-order.test.js).
//
// Лимита раз-в-день НЕТ (ТЗ): после отдыха в новый день — снова
// доступно; повтор в тот же день не запрещён (день всё равно
// проходит). НАЙМ — НЕ здесь (задача 000065, NPC-схема).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(null);
  } else {
    factory(root);
  }
})(typeof globalThis !== 'undefined' ? globalThis : self, function (root) {
  /**
   * «Отдых» (таверна, 44_rest): день проходит — СУЩЕСТВУЮЩИЙ
   * clock.rest() (src/day.js: steps = 0; advanceDay('rest'));
   * восстановление/респауны/saveNow — onDay-подписчики main.js.
   * Новых формул НЕТ (ТЗ). Чистый guard (без исключений, 000029):
   * clock отсутствует/нет rest — отказ «недоступно» (flash без
   * saveNow/отметки/render — семантика отказа 000128 §2.6).
   * @param {object|null} clock часы (createClock, src/day.js)
   * @returns {{ok: boolean, message?: string}}
   */
  function tavernRest(clock) {
    if (!clock || typeof clock.rest !== 'function') {
      return { ok: false, message: 'недоступно' };
    }
    clock.rest();
    // clock.day — LIVE (ctx.clock — живая ссылка, 000128 §5): после
    // rest — НОВЫЙ день (сообщение несёт его, «…— день N.»).
    return {
      ok: true,
      message: 'Отдых: вы выспались — день ' + clock.day + '.',
    };
  }
  if (root === null) {
    // node-ветка: чистый экспорт (регистрации нет — Game в node
    // отсутствует; тесты регистрируют вручную).
    return { tavernRest };
  }
  // Browser-ветка: саморегистрация в МОМЕНТ загрузки. Game — лениво
  // (в момент загрузки, не константа в шапке — UMD-ловушка 000038:
  // main.js грузится ПОСЛЕ этого модуля и снимет Game, в котором
  // specials уже на месте).
  const G = typeof root.Game === 'object' ? root.Game : null;
  if (!G) {
    return; // standalone (без Game) — тихий выход, 0 console.error.
  }
  if (!G.buildingActions ||
      typeof G.buildingActions.registerSpecial !== 'function') {
    console.error('building-effect-44_rest.js: Game.buildingActions ' +
      'отсутствует — src/building-actions.js обязан грузиться ДО ' +
      'этого модуля («Отдых» таверны не работает)');
    return;
  }
  G.buildingActions.registerSpecial(
    '44_rest', (ctx) => tavernRest(ctx && ctx.clock));
});

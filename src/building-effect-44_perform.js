// Таверна (44) «Выступление» — спец-модуль (задача 000137;
// контракт — memory/000137-tavern-perform-city-daily.md).
//
// Второй спец-модуль проекта (шаблон 1:1 —
// src/building-effect-44_rest.js, 000091/000128 §2.3): «Выступление»
// — МИР-ДЕЙСТВИЕ БЕЗ «стороны» (день НЕ проходит — в отличие от
// 44_rest: clock не трогать), но золото живому hero НАЧИСЛЯЕТ
// обработчик со «стороной» (h.gold += r.gold — паттерн handlerCoin
// building-effect-49.js, 000071/000092: apply → результат →
// исполнение ханками main.js). Хендлер саморегистрируется в МОМЕНТ
// загрузки: Game.buildingActions.registerSpecial('44_perform',
// (ctx) => tavernPerform(ctx && ctx.r, ctx && ctx.hero)). Запись
// реестра EFFECTS['44_perform'] (src/building-effects.js) — имя +
// available (строка ТЗ «выступал сегодня») + apply (applyTavernPerform
// — чистое ядро performGold + re-check марки).
//
// Чистый UMD-модуль (паттерн src/building-effect-44_rest.js): node —
// require() → { tavernPerform } (без регистрации — в node Game нет;
// тесты регистрируют вручную: BA.registerSpecial('44_perform',
// (ctx) => mod.tavernPerform(ctx && ctx.r, ctx && ctx.hero))). В
// момент загрузки — НОЛЬ зависимостей (ни require, ни чтения
// Game-функций — прецедент 000053). Гарды загрузки (деградация
// 000053 — игра не роняется, пин tests/index-order.test.js IO1):
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
// index.html — ПОСЛЕ building-effect-44_rest.js (рядом — слот
// спец-модулей таверны) и ДО main.js (пин tests/index-order.test.js).
//
// saveNow / daily-марка (ключ — якорь города, 000137) / flash /
// playerRender — АВТОМАТИКА роутера (onBuildingAction, 000128 §2.4) —
// в хендлере НЕТ (не дублировать).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(null);
  } else {
    factory(root);
  }
})(typeof globalThis !== 'undefined' ? globalThis : self, function (root) {
  /**
   * «Выступление» (таверна, 44_perform): золото НАЧИСЛИТЬ живому
   * hero (h — ЖИВАЯ ссылка hero бандла main.js — только при
   * r.success && r.gold > 0). h.gold не-числовой — ноль (битый
   * сейв не роняет, 000029 — паттерн handlerCoin). День НЕ проходит
   * (clock не трогать — в отличие от 44_rest).
   * Гард (!r || !r.ok || !h) — дефенсивный отказ: в корректной
   * цепочке apply-отказ роутер гасит ДО хендлера (ок-ветка specials
   * — только после r.ok); message «Таверна: выступление
   * недоступно.» (строка ТЗ-семантики отказа спец-а). Сообщение
   * успеха — из r.message (роутер: r.message ПЕРВЫМ).
   * @param {object|null} r результат applyTavernPerform
   * @param {object|null} h ЖИВАЯ ссылка на hero
   * @returns {{ok: boolean, message?: string}}
   */
  function tavernPerform(r, h) {
    if (!r || !r.ok || !h || typeof h !== 'object') {
      return { ok: false, message: 'Таверна: выступление недоступно.' };
    }
    if (r.success && r.gold > 0) {
      h.gold = (Number.isFinite(h.gold) ? h.gold : 0) + r.gold;
    }
    // Сообщение — из r.message (роутер: r.message ПЕРВЫМ).
    return { ok: true, message: r.message };
  }
  if (root === null) {
    // node-ветка: чистый экспорт (регистрации нет — Game в node
    // отсутствует; тесты регистрируют вручную).
    return { tavernPerform };
  }
  // Browser-ветка: саморегистрация в МОМЕНТ загрузки. Game — в момент
  // загрузки (не константа в шапке — UMD-ловушка 000038: main.js
  // грузится ПОСЛЕ этого модуля и снимет Game, в котором specials уже
  // на месте).
  const G = typeof root.Game === 'object' ? root.Game : null;
  if (!G) {
    return; // standalone (без Game) — тихий выход, 0 console.error.
  }
  if (!G.buildingActions ||
      typeof G.buildingActions.registerSpecial !== 'function') {
    console.error('building-effect-44_perform.js: Game.buildingActions ' +
      'отсутствует — src/building-actions.js обязан грузиться ДО ' +
      'этого модуля («Выступление» таверны не работает)');
    return;
  }
  G.buildingActions.registerSpecial(
    '44_perform', (ctx) => tavernPerform(ctx && ctx.r, ctx && ctx.hero));
});

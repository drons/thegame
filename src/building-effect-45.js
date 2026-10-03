// Спец-модуль 000092: колодец (постройка id 45) — спец-хендлер
// эффекта «Посмотреть на дно» ('45'; 1-к-1 по строковому id
// постройки, как '40'/'42').
//
// Само-регистрация в момент ЗАГРУЗКИ (браузерная ветка):
// Game.buildingActions.registerSpecial('45', …) — building-actions.
// js обязан загрузиться РАНЬШЕ (script-тег между building-actions.
// js и hud.js, пин tests/index-order.test.js; main.js снимает Game
// ОДИН раз при загрузке — UMD-ловушка 000038). registerSpecial
// отсутствует (битый порядок) — console.error + НЕ регистрировать:
// игра не роняется, B-тесты ловят h.errors.
//
// Хендлер мутирует ТОЛЬКО ctx.hero (ЖИВАЯ ссылка) через
// ctx.world.game.addItem (снапшот main.js: items.js в цепочке ДО
// main.js → addItem/getItem на месте, свойства в момент ВЫЗОВА):
//   * провал ролла (r.success false) — {ok:true}: попытка СГОРЕЛА,
//     марка раз-в-день СТАВИТСЯ роутером (D8);
//   * успех — addItem(hero, r.itemId, 1); ОТКАЗ addItem (полный
//     инвентарь / вес) — { ok:false, message }: семантика отказа
//     спец-а (000128 §2.6) — flash, БЕЗ марки/saveNow/render;
//     предмет НЕ теряется (остался на дне), ролл детерминирован по
//     (tile, day) → повтор в тот же день — тот же предмет.
// saveNow / daily-марка / flash / playerRender — АВТОМАТИКА
// роутера (onBuildingAction, 000128 §2.4) — в хендлере НЕТ.
//
// НОЛЬ зависимостей при загрузке (паттерн building-actions.js /
// 000053): ни require, ни DOM, ни console в node-ветке (A-тесты —
// без шума). Game-ссылка — только в браузерной ветке при загрузке;
// в хендлере — ТОЛЬКО ctx. Контекст ctx — форма 000128 §2.5:
// { day, tile, hero, save, map, r, action, b, t, npc, clock,
// moveHero, startCombat, world: deps }.

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    // node: ТОЛЬКО экспорт хендлера — БЕЗ side effects (без
    // console.error: иначе шум/фейлы в A-тестах).
    module.exports = factory();
  } else {
    const G0 = typeof root.Game === 'object' ? root.Game : {};
    const M = factory();
    // Браузер: само-регистрация в момент загрузки (ПОСЛЕ
    // building-actions.js — пин tests/index-order.test.js).
    const ba = G0.buildingActions;
    if (ba && typeof ba.registerSpecial === 'function') {
      ba.registerSpecial('45', M.handlerWell);
    } else {
      console.error('building-effect-45.js: Game.buildingActions.' +
        'registerSpecial отсутствует — «Посмотреть на дно» НЕ ' +
        'зарегистрирован (src/building-actions.js обязан грузиться ' +
        'ДО src/building-effect-45.js)');
    }
    root.Game = Object.assign({}, G0, { buildingEffect45: M });
  }
})(typeof globalThis !== 'undefined' ? globalThis : self, function () {

  // «Посмотреть на дно»: предмет ИЗ ЧИСТОГО apply (r.itemId —
  // детерминирован по (tile, day)) — В ИНВЕНТАРЬ живого hero.
  // Имя предмета — лениво (g.getItem(r.itemId).name, fallback — id);
  // reason — из items.js («нет свободных слотов инвентаря» /
  // «слишком тяжело (лимит веса)» / …).
  function handlerWell(ctx) {
    const r = ctx && ctx.r;
    const h = ctx && ctx.hero;
    if (!r || !r.ok || !h || typeof h !== 'object') {
      return { ok: false, message: 'Колодец: просмотр недоступен.' };
    }
    // Провал ролла — попытка сгорела (D8): марка ставится роутером.
    if (!r.success || !r.itemId) {
      return { ok: true, message: r.message };
    }
    const g = ctx.world && ctx.world.game;
    if (!g || typeof g.addItem !== 'function') {
      // Снапшот main.js бит (деградация 000053): предмет НЕ
      // добавлен — отказ БЕЗ марки (повтор в тот же день возможен).
      return { ok: false, message: 'Колодец: инвентарь недоступен.' };
    }
    let name = r.itemId;
    if (typeof g.getItem === 'function') {
      const it = g.getItem(r.itemId);
      if (it && typeof it.name === 'string' && it.name !== '') {
        name = it.name;
      }
    }
    const res = g.addItem(h, r.itemId, 1);
    if (!res || !res.ok) {
      // Инвентарь полон/вес — предмет остался на дне (повтор в тот
      // же день → тот же предмет, детерминизм (tile, day)).
      return {
        ok: false,
        message: 'Колодец: «' + name + '» не взять (' +
          ((res && res.reason) || 'недоступно') +
          ') — предмет остался на дне.',
      };
    }
    // Сообщение — из r.message (роутер: r.message ПЕРВЫМ).
    return { ok: true, message: r.message };
  }

  return { handlerWell };
});

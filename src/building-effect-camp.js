// Спец-модуль лагеря (задача 000095, постройка id 47): «Костёр»
// (отдых) и «Барахолка» (сток) — мир-«стороны», которые НЕ
// выражаются ЧИСТЫМ apply (контракт 000128 §2.3: apply обязан
// быть чистым по снимку, а clock в снимке нет; сток — живое
// состояние main.js). ОДИН модуль на ПОСТРОЙКУ (два хендлера) —
// минимальный merge-overlap с параллельными 000091–000094
// (каждая — свой файл).
//
// Чистый UMD (образец src/building-actions.js): node — require()
// → { fire, market, register } (без чтения Game); браузер —
// САМОРЕГИСТРАЦИЯ в Game.buildingActions.specials в момент СВОЕЙ
// загрузки: script-тег ПОСЛЕ building-actions.js (registerSpecial
// работает БЕЗ init — specials модульное поле, BA4) и ДО main.js
// (UMD-ловушка 000038: main.js снимает Game ОДИН раз при
// загрузке — тег после main.js зарегистрировал бы specials в НОВОМ
// Game, который снапшот main.js не видит). Пин порядка —
// tests/index-order.test.js; функционально — B24–B26.
//
// В момент загрузки — НОЛЬ зависимостей: ни require, ни DOM, ни
// чтения Game (кроме регистрации — модульное поле
// building-actions.js), ни console (кроме ветки деградации), ни
// RNG (000038/000053).
//
// Хендлеры НЕ снимают Game — только регистрация; весь доступ к
// миру — через ctx (узкие точки) + ctx.world (escape-hatch
// 000128 §2.5 «допуск, а не рекомендация»): playerUI/campShopFor
// нет в стандартных узких точках → world.
//
// «Костёр» (ctx.clock.rest()): день+1, steps 0, восстановление
// HP/MP по SPEC «Игровое время» через onDay (main.js: G.restoreDay)
// + flash «День N.» + saveNow. Лимита раз-в-день НЕТ (каталог
// 000047 без раз_в_день, записи без разВДень; прецедент 000091 —
// «Отдых» таверны): повтор в тот же день — ещё +1 день. Результат
// хендлера БЕЗ message — КРИТИЧНО: пайплайн
// msg = r.message || sres.message — свой flash ЗАТЯЛ бы
// onDay-flash «День N.» (hudFlash перезаписывается).
//
// «Барахолка» (ctx.world.campShopFor): сток по тайлу лагеря — ключ
// 'x,y' ТАЙЛА (несколько лагерей — независимые стойки), НЕ позиция
// игрока (в e2e — другое место, контракт §6.6). Респаун по дню —
// внутри campShopFor (respawn_days из каталога 000047); wrap
// передаётся setShop ССЫЛКОЙ (buyItem мутирует stock in place —
// campStocks актуален, ui.js L226). BUY-ONLY: shopKindsFor(47) →
// null → секция «продажа» в панели пуста (лагерь не скупает).
//
// Контракт — memory/000095-camp-fire-bazaar.md §2.5.

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    const G0 = typeof root.Game === 'object' ? root.Game : {};
    const mod = factory();
    mod.register(G0);
    root.Game = Object.assign({}, G0, { buildingEffectCamp: mod });
  }
})(typeof globalThis !== 'undefined' ? globalThis : self, function () {

  /**
   * «Костёр» (лагерь, id 47): отдых = clock.rest(). Гард (000053):
   * нет ctx.clock.rest — { ok:false, message } (не ожидается —
   * бандл проводки main.js); отказ — семантика отказа apply
   * (flash, без saveNow/маркировки). БЕЗ message в успехе —
   * onDay-flash «День N.» не затирается (контракт §2.5).
   * @param {object} ctx ctx спец-хендлера (building-actions.js)
   * @returns {{ok: boolean, message?: string}}
   */
  function fire(ctx) {
    if (!ctx || !ctx.clock || typeof ctx.clock.rest !== 'function') {
      return { ok: false, message: 'Костёр недоступен.' };
    }
    ctx.clock.rest();
    return { ok: true };
  }

  /**
   * «Барахолка» (лагерь, id 47): стойка тайла → вкладка «Магазин».
   * Ключ стойки = координаты ТАЙЛА-ЛАГЕРЯ (ctx.t — в живом потоке
   * tileAt под игроком, в e2e — синтетический тайл), НЕ позиция
   * игрока (ctx.tile = deps.player — в e2e другое место).
   * Деградация (000053): нет world.game.playerUI / campShopFor —
   * тихо { ok:true } (панель не открывается; игра не роняется).
   * БЕЗ message (панель = отклик, flash не нужен).
   * @param {object} ctx ctx спец-хендлера (building-actions.js)
   * @returns {{ok: boolean}}
   */
  function market(ctx) {
    const w = ctx && ctx.world;
    const g = w && w.game;
    if (!g || !g.playerUI) return { ok: true };
    const t = (ctx.t && typeof ctx.t === 'object') ? ctx.t : ctx.tile;
    const shop = (w && typeof w.campShopFor === 'function')
      ? w.campShopFor(t.x, t.y, t) : null;
    if (shop) g.playerUI.setShop(shop);
    g.playerUI.toggle(true, 'shop');
    return { ok: true };
  }

  // Саморегистрация (браузер, в момент загрузки тегом): specials —
  // модульное поле building-actions.js, registerSpecial работает
  // ДО init (BA4). buildingActions отсутствует (регрессия порядка
  // тегов, 000038) — console.error + БЕЗ регистрации, игра не
  // падает (000053). В node register не вызывается автоматически
  // (vm-тесты грузят реальную index.html-цепочку).
  function register(G) {
    const BA = G && G.buildingActions;
    if (BA && typeof BA.registerSpecial === 'function') {
      BA.registerSpecial('fire', fire);
      BA.registerSpecial('market', market);
    } else {
      console.error('src/building-effect-camp.js: Game.buildingActions '
        + 'не найден — src/building-actions.js обязан грузиться ДО '
        + 'спец-модулей (задачи 000128/000095)');
    }
  }

  return { fire, market, register };
});

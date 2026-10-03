// Спец-модуль 000092: фонтан (постройка id 49) — спец-хендлеры
// эффектов «Исцеление» ('heal') и «Монета» ('coin') — ПЕРВЫЕ спец-
// модули проекта (конвенция 000128 §2.3: файл building-effect-<id>.
// js; параллельные 000091/000093/000094/000095 — свои файлы).
//
// Само-регистрация в момент ЗАГРУЗКИ (браузерная ветка):
// Game.buildingActions.registerSpecial('heal', …) / ('coin', …) —
// building-actions.js обязан загрузиться РАНЬШЕ (script-тег между
// building-actions.js и hud.js, пин tests/index-order.test.js;
// main.js снимает Game ОДИН раз при загрузке — UMD-ловушка 000038).
// registerSpecial отсутствует (битый порядок) — console.error + НЕ
// регистрировать: игра не роняется, B-тесты ловят h.errors.
//
// Хендлеры мутируют ТОЛЬКО ctx.hero (ЖИВАЯ ссылка):
//   * 'heal' — h.hp/h.mp = r.heal (АБСОЛЮТЫ из ЧИСТОГО apply,
//     000092/D7);
//   * 'coin' — h.gold += r.gold (только при success && gold > 0;
//     провал — «ничего», gold 0).
// saveNow / daily-марка / flash / playerRender — АВТОМАТИКА роутера
// (onBuildingAction, 000128 §2.4) — в хендлерах НЕТ. Отказ хендлера
// { ok:false, message } — семантика отказа спец-а (000128 §2.6):
// flash, БЕЗ марки/saveNow/render (повтор в тот же день возможен).
//
// НОЛЬ зависимостей при загрузке (паттерн building-actions.js /
// 000053): ни require, ни DOM, ни console в node-ветке (A-тесты —
// без шума). Game-ссылка — только в браузерной ветке при загрузке;
// в хендлерах — ТОЛЬКО ctx (ctx.world.game — снапшот main.js).
// Контекст ctx — форма 000128 §2.5: { day, tile, hero, save, map,
// r, action, b, t, npc, clock, moveHero, startCombat, world: deps }.

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    // node: ТОЛЬКО экспорт хендлеров — БЕЗ side effects (без
    // console.error: иначе шум/фейлы в A-тестах).
    module.exports = factory();
  } else {
    const G0 = typeof root.Game === 'object' ? root.Game : {};
    const M = factory();
    // Браузер: само-регистрация в момент загрузки (ПОСЛЕ
    // building-actions.js — пин tests/index-order.test.js).
    const ba = G0.buildingActions;
    if (ba && typeof ba.registerSpecial === 'function') {
      ba.registerSpecial('heal', M.handlerHeal);
      ba.registerSpecial('coin', M.handlerCoin);
    } else {
      console.error('building-effect-49.js: Game.buildingActions.' +
        'registerSpecial отсутствует — «Исцеление»/«Монета» НЕ ' +
        'зарегистрированы (src/building-actions.js обязан грузиться ' +
        'ДО src/building-effect-49.js)');
    }
    root.Game = Object.assign({}, G0, { buildingEffect49: M });
  }
})(typeof globalThis !== 'undefined' ? globalThis : self, function () {

  // «Исцеление»: НАЗНАЧИТЬ живому hero абсолютные hp/mp из ЧИСТОГО
  // apply (r.heal). Гарды r/hero — отказ {ok:false} (в корректной
  // цепочке r.ok && r.heal гарантированы applyFountainHeal).
  function handlerHeal(ctx) {
    const r = ctx && ctx.r;
    const h = ctx && ctx.hero;
    if (!r || !r.ok || !r.heal || typeof r.heal !== 'object' ||
        !h || typeof h !== 'object') {
      return { ok: false, message: 'Фонтан: исцеление недоступно.' };
    }
    h.hp = r.heal.hp;
    h.mp = r.heal.mp;
    // Сообщение — из r.message (роутер: r.message ПЕРВЫМ).
    return { ok: true, message: r.message };
  }

  // «Монета»: золото НАЧИСЛИТЬ живому hero (только при успехе и
  // gold > 0; провал — «ничего»). h.gold не-числовой — ноль (битый
  // сейв не роняет, 000029).
  function handlerCoin(ctx) {
    const r = ctx && ctx.r;
    const h = ctx && ctx.hero;
    if (!r || !r.ok || !h || typeof h !== 'object') {
      return { ok: false, message: 'Фонтан: монета недоступна.' };
    }
    if (r.success && r.gold > 0) {
      h.gold = (Number.isFinite(h.gold) ? h.gold : 0) + r.gold;
    }
    // Сообщение — из r.message (роутер: r.message ПЕРВЫМ).
    return { ok: true, message: r.message };
  }

  return { handlerHeal, handlerCoin };
});

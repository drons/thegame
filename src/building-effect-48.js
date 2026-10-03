// Спец-действие «Осмотреть» (развалины, id 48; задача 000094):
// МИР-«сторона» эффекта, которой нет в ЧИСТОМ apply
// (src/building-effects.js, запись EFFECTS['48']):
//   * ловушка — урон по HP: `hero.hp = Math.max(1, hero.hp - damage)`
//     (clamp ≥ 1 — НЕ УБИВАЕТ: hp 2 → 1, герой жив; БЕЗ БОЯ —
//     startCombat НЕ вызывается; Телосложение/снаряжение НЕ
//     учитываются — формула фиксирована ТЗ; урон — ИЗ КАТАЛОГА
//     эффект.урон_ловушки, apply передаёт r.damage);
//   * лут — предмет в инвентарь: `G.addItem(hero, itemId, 1)`
//     (items.js, через ctx.world.game — снапшот main.js, 000038);
//     отказ (слоты/вес/неизвестный id) — message-причина в r.message
//     (МУТАЦИЯ r — объект по ссылке; роутер флэшит r.message ПЕРВЫМ),
//     попытка ВСЁ РАВНО сгорает ({ ok: true } — раз-в-день, повтор —
//     новый день; игрок с полным инвентарем не блокирует осмотр
//     навсегда — R6);
//   * запись — мир-сторон НЕТ (фрагмент/«не читается» — в r.message
//     из apply).
//
// Контракт 000128 §2.3: саморегистрация в момент СВОЕЙ загрузки —
// Game.buildingActions.registerSpecial('48', handleInspect); main.js
// и building-actions.js НЕ ПРАВЯТСЯ (маркировка раз-в-день/saveNow/
// flash/playerRender — АВТОМАТИЧЕСКИ роутером). Порядок script-тегов:
// ПОСЛЕ building-actions.js (реестр specials обязан существовать),
// ДО main.js (UMD-ловушка 000038: саморегистрация УЙТИ в main.js
// попадёт в НОВЫЙ объект Game — лут/ловушка молча не сработают;
// пин — tests/index-order.test.js).
//
// Чистый UMD (обёртка 1:1 по форме src/building-actions.js;
// factory() БЕЗ аргументов): node — require() → { handle, register }
// (тесты регистрируют явно); браузер — саморегистрация в момент
// загрузки (снапшот G0, прецедент src/ui-tab-*.js 000130). В момент
// загрузки — ноль require/DOM/console (B1-семантика: errors 0).
// Нет buildingActions/registerSpecial → console.error + БЕЗ
// регистрации (деградация 000053: эффект работает до сообщения из
// apply, мир-сторон нет — игра не падает; допустимо контрактом
// 000128). Хендлер: все Game-функции — через ctx.world.game в момент
// ВЫЗОВА; hero — ЖИВАЯ ссылка (мутирует hp); r — по ссылке (мутирует
// message при loot-отказе); map/save — read-only.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    const G0 = typeof root.Game === 'object' ? root.Game : {};
    factory().register(G0);
  }
})(typeof globalThis !== 'undefined' ? globalThis : self, function () {

  // Дефенсивный fallback урона ловушки при мусоре r.damage (2 —
  // каталожное значение; валидирован apply — мусор не ожидается).
  const TRAP_FALLBACK_DAMAGE = 2;

  /**
   * Спец-хендлер «Осмотреть» (ctx по контракту 000128 §2.5; роутер
   * вызывает ТОЛЬКО при r.ok):
   *   * content 'trap' — hero.hp = Math.max(1, hero.hp - r.damage);
   *   * content 'loot' — G.addItem(hero, r.itemId, 1); отказ →
   *     r.message = «Осмотр развалин: не удалось подобрать лут
   *     (<reason>).» (R6: попытка сгорела — { ok: true });
   *   * content 'note' (и любой другой) — { ok: true } (мир-сторон
   *     нет).
   * DEFENSIVE: !ctx / !ctx.r / ctx.r.ok !== true — no-op { ok: true }.
   * Отказ хендлера ({ ok: false }) НЕ предусмотрен: любая «сторона»
   * применима либо degrades в сообщение (контракт 000128 §2.6).
   * @param {object} ctx { hero, r, world: { game }, … }
   * @returns {{ok: true}}
   */
  function handleInspect(ctx) {
    if (!ctx || !ctx.r || ctx.r.ok !== true) {
      return { ok: true };
    }
    const r = ctx.r;
    if (r.content === 'trap') {
      const hero = ctx.hero;
      if (hero && typeof hero.hp === 'number') {
        const dmg = Number.isFinite(r.damage)
          ? r.damage : TRAP_FALLBACK_DAMAGE;
        hero.hp = Math.max(1, hero.hp - dmg);
      }
      return { ok: true };
    }
    if (r.content === 'loot') {
      const G = ctx.world && ctx.world.game;
      if (!G || typeof G.addItem !== 'function') {
        // без addItem — no-op (деградация 000053; message apply
        // уже описывает лут)
        return { ok: true };
      }
      const add = G.addItem(ctx.hero, r.itemId, 1);
      if (!add || add.ok !== true) {
        // Отказ (слоты/вес/неизвестный id) — попытка ВСЁ РАВНО
        // сгорает (ok:true → роутер ставит daily-марку + saveNow);
        // причина — в r.message (роутер флэшит r.message ПЕРВЫМ).
        const reason = add && typeof add.reason === 'string'
          && add.reason !== '' ? add.reason : 'неизвестная причина';
        r.message = 'Осмотр развалин: не удалось подобрать лут '
          + '(' + reason + ').';
      }
      return { ok: true };
    }
    // 'note' и любой другой content — мир-сторон нет (текст — в
    // r.message из apply).
    return { ok: true };
  }

  /**
   * Саморегистрация спец-действия (браузер: в момент загрузки;
   * node: тестами явно). Гард registerSpecial — уже в building-
   * actions.js (id/fn). Нет buildingActions/registerSpecial →
   * console.error + БЕЗ регистрации (000053, игра не падает).
   * @param {object} G снапшот Game в момент загрузки
   */
  function register(G) {
    const BA = G && G.buildingActions;
    if (!BA || typeof BA.registerSpecial !== 'function') {
      console.error('building-effect-48.js: Game.buildingActions ' +
        'не найден — спец-действие «Осмотреть» (развалины, id 48) ' +
        'НЕ зарегистрировано (src/building-actions.js обязан ' +
        'грузиться ДО)');
      return;
    }
    BA.registerSpecial('48', handleInspect);
  }

  return { handle: handleInspect, register };
});

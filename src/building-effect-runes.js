// Спец-действие «Расшифровка (заклинание)» (Рунический камень 40 /
// Обелиск 42; задача 000133): МИР-«сторона» эффекта, которой нет в
// ЧИСТОМ apply (src/building-effects.js, записи EFFECTS['40_spell']/
// ['42_spell'], ОДНО apply на оба id — пул из каталога, 000053):
//   * learn() — мутация hero.spells (книга заклинаний, задача 000045):
//     `S.learn(ctx.hero, r.spellId, 'rune')` (spells.js; source 'rune'
//     — Рунопись ≥ уровень заклинания УЖЕ в canLearn, spells.js:170-
//     176; learn повторно гоняет canLearn — чистый гард: apply ok:true
//     ⇒ успех гарантирован, отказ-ветка — теоретическая защита);
//   * успех → { ok: true } → роутер: марка 'x,y:40_spell'/'x,y:42_
//     spell' (per-effectId, 000072) + saveNow + flash(r.message
//     «Расшифровано: «Имя»» — из apply, приоритет) + playerRender —
//     АВТОМАТИЧЕСКИ (building-actions.js:337-351); hero.spells — в
//     сейве уже есть (000045) → saveNow пишет книгу;
//   * отказ хендлера { ok: false } → flash(sres.message), БЕЗ
//     марки/saveNow/render — день не сгорает (building-actions.js:
//     322-327). Сам apply с пустыми кандидатами ок:false — роутер
//     флэшит r.message ДО спец-а (apply-отказ возвращает раньше).
//
// Контракт 000128 §2.3: саморегистрация в момент СВОЕЙ загрузки —
// Game.buildingActions.registerSpecial('40_spell', handle) И
// ('42_spell', handle) — ОДИН хендлер на ОБА id (пул берётся из
// каталога, НЕ из id — хардкод по id НЕ нужен; мульти-id — прецедент
// src/building-content.js). main.js и building-actions.js НЕ ПРАВЯТСЯ.
// Порядок script-тегов: ПОСЛЕ building-actions.js (реестр specials
// обязан существовать), ПОСЛЕ spells.js (Game.Spells — при ВЫЗОВЕ, но
// в корректной цепочке — на месте), ДО main.js (UMD-ловушка 000038:
// саморегистрация УЙТИ в main.js попадёт в НОВЫЙ объект Game —
// действие молча мертво; пин — tests/index-order.test.js).
//
// Чистый UMD (обёртка 1:1 по форме src/building-effect-48.js;
// factory() БЕЗ аргументов): node — require() → { handle, register }
// (тесты регистрируют явно); браузер — саморегистрация в момент
// загрузки (снапшот G0, прецедент src/ui-tab-*.js 000130). В момент
// загрузки — ноль require/DOM (B1-семантика: errors 0); без
// buildingActions — console.error + БЕЗ регистрации (деградация
// 000053: apply/message работают, мир-стороны нет — игра не падает).
// Хендлер: Game.Spells — через ctx.world.game (снапшот main.js) в
// момент ВЫЗОВА; hero — ЖИВАЯ ссылка (мутирует spells); r — по ссылке
// (read-only: message — из apply). try/catch НЕТ (000128 §2.4: баг
// хендлера ловят его тесты).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    const G0 = typeof root.Game === 'object' ? root.Game : {};
    factory().register(G0);
  }
})(typeof globalThis !== 'undefined' ? globalThis : self, function () {

  /**
   * Спец-хендлер «Расшифровка (заклинание)» (ctx по контракту 000128
   * §2.5; роутер вызывает ТОЛЬКО при r.ok — apply-отказ флэшит и
   * возвращает раньше):
   *   * r.ok !== true / success !== true / spellId не строка —
   *     { ok: false, message } (теоретическая защита: apply ok:true
   *     всегда несёт success + spellId);
   *   * Game.Spells.learn нет (битый порядок загрузки) — console.error
   *     + { ok: false, message:'заклинания недоступны' } (000053);
   *   * learn(ctx.hero, r.spellId, 'rune') — hero ЖИВОЙ; отказ
   *     (повторный canLearn) — { ok: false, message: res.reason }
   *     (без марки — действие не тратится);
   *   * успех — { ok: true } (message — из apply: r.message —
   *     приоритет в роутере, 000128).
   * @param {object} ctx { hero, r, world: { game }, … }
   * @returns {{ok: boolean, message?: string}}
   */
  function handleRuneSpell(ctx) {
    const r = ctx && ctx.r;
    if (!r || r.ok !== true || r.success !== true ||
        typeof r.spellId !== 'string') {
      return {
        ok: false,
        message: (r && r.reason) || 'нет заклинания для расшифровки',
      };
    }
    const game = ctx.world && ctx.world.game;
    const S = game && game.Spells;
    if (!S || typeof S.learn !== 'function') {
      console.error('building-effect-runes.js: Game.Spells не найден — ' +
        'src/spells.js обязан грузиться до main.js (задача 000133)');
      return { ok: false, message: 'заклинания недоступны' };
    }
    // 000147: learn — на АКТИВНОГО (единая точка LearnTarget;
    // picked = learned: applyRuneSpell фильтровал кандидаты по
    // ТОМУ ЖЕ листу). Fallback — ctx.hero (live-ссылка, D3):
    // без LearnTarget / без __game — герой (поведение 000133).
    const LT = game && game.LearnTarget;
    const sheet = (LT && typeof LT.activeSheet === 'function')
      ? LT.activeSheet(ctx.hero) : ctx.hero; // live-лист
    const res = S.learn(sheet, r.spellId, 'rune');
    if (!res || !res.ok) {
      return { ok: false, message: res && res.reason };
    }
    // message — из apply (r.message — приоритет в роутере).
    return { ok: true };
  }

  /**
   * Саморегистрация спец-действия (браузер: в момент загрузки;
   * node: тестами явно). ОДИН хендлер на ОБА id: '40_spell'
   * (Рунический камень) И '42_spell' (Обелиск) — латиница+
   * подчёркивание, без ':'/','/пробелов (registerSpecial-гард,
   * building-actions.js:64). Нет buildingActions/registerSpecial →
   * console.error + БЕЗ регистрации (000053, игра не падает).
   * @param {object} G снапшот Game в момент загрузки
   */
  function register(G) {
    const BA = G && G.buildingActions;
    if (!BA || typeof BA.registerSpecial !== 'function') {
      console.error('building-effect-runes.js: Game.buildingActions ' +
        'не найден — спец-действие «Расшифровка (заклинание)» ' +
        '(камень 40 / обелиск 42, задача 000133) НЕ зарегистрировано ' +
        '(src/building-actions.js обязан грузиться ДО)');
      return;
    }
    BA.registerSpecial('40_spell', handleRuneSpell);
    BA.registerSpecial('42_spell', handleRuneSpell);
  }

  return { handle: handleRuneSpell, register };
});

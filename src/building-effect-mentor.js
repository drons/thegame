// Спец-действие «Обучение (наставник)» (задача 000147; 5 школ:
// 17 Лаборатория алхимика, 18 Башня мага, 19 Монастырь, 21 Храм
// исцеления, 38 Храм горы; SPEC «Книга заклинаний» L1074):
// МИР-«сторона» ЧИСТОГО apply (src/building-effects.js, запись
// EFFECTS['NN_mentor'], ОДНО apply на ВСЕ 5 id — пул/цена ИЗ
// КАТАЛОГА особые_параметры.наставник, 000053):
//   * learn() — мутация ЛИСТА АКТИВНОГО персонажа (000147: единое
//     изучение — на активного, не только героя): лист —
//     ctx.world.game.LearnTarget.activeSheet(ctx.hero) (единая
//     точка, задача 000147; fallback — ctx.hero — live-ссылка,
//     D3), `S.learn(sheet, r.spellId, 'mentor')` (spells.js;
//     source 'mentor' — только школьные проверки: ранг школы по
//     атрибуту + базовое — УЖЕ в canLearn; Рунопись НЕ нужна);
//   * успех → gold С ГЕРОЯ (общая казна партии: у наёмного/Эфира
//     gold-полей нет; D5, прецедент ctx.hero «gold — паттерн
//     000075») → { ok: true } → роутер: марка 'x,y:NN_mentor'
//     (per-effectId, 000072) + saveNow + flash(r.message
//     «Наставник передал: «Имя»» — из apply, приоритет) +
//     playerRender — АВТОМАТИЧЕСКИ (building-actions.js:337-351);
//   * отказ хендлера { ok: false } → flash(sres.message), БЕЗ
//     марки/saveNow/render — день не сгорает (building-actions.
//     js:322-327); gold НЕ списан (D5: повтор доступен).
//
// Контракт 000128 §2.3: саморегистрация в момент СВОЕЙ загрузки —
// Game.buildingActions.registerSpecial('NN_mentor', handle) — ОДИН
// хендлер на ВСЕ 5 id (пул/цена — из каталога, хардкод по id НЕ
// нужен; мульти-id — прецедент src/building-content.js и
// building-effect-runes.js '40_spell'/'42_spell'). main.js и
// building-actions.js НЕ ПРАВЯТСЯ. Порядок script-тегов: ПОСЛЕ
// building-actions.js (реестр specials обязан существовать),
// ПОСЛЕ spells.js (Game.Spells — при ВЫЗОВЕ, но в корректной
// цепочке — на месте), ДО main.js (UMD-ловушка 000038:
// саморегистрация УЙТИ в main.js попадёт в НОВЫЙ объект Game —
// действие молча мертво; пин — tests/index-order.test.js).
//
// Чистый UMD (обёртка 1:1 по форме src/building-effect-runes.js;
// factory() БЕЗ аргументов): node — require() → { handle,
// handleMentorSpell, register } (тесты регистрируют явно);
// браузер — саморегистрация в момент загрузки (снапшот G0). В
// момент загрузки — ноль require/DOM (errors 0); без
// buildingActions — console.error + БЕЗ регистрации (деградация
// 000053: apply/message работают, мир-стороны нет — игра не
// падает). Хендлер: Game.Spells/Game.LearnTarget — через
// ctx.world.game (снапшот main.js) в момент ВЫЗОВА; hero — ЖИВАЯ
// ссылка (gold списывается in place). try/catch НЕТ (000128 §2.4).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    const G0 = typeof root.Game === 'object' ? root.Game : {};
    factory().register(G0);
  }
})(typeof globalThis !== 'undefined' ? globalThis : self, function () {

  /**
   * Спец-хендлер «Обучение (наставник)» (ctx по контракту 000128
   * §2.5; роутер вызывает ТОЛЬКО при r.ok — apply-отказ флэшит и
   * возвращает раньше):
   *   * r.ok !== true / success !== true / spellId не строка —
   *     { ok: false, message } (теоретическая защита: apply
   *     ok:true всегда несёт success + spellId + price);
   *   * Game.Spells.learn нет (битый порядок загрузки) —
   *     console.error + { ok: false, message:'заклинания
   *     недоступны' } (000053);
   *   * learn(sheet, r.spellId, 'mentor') — sheet = активный
   *     (LearnTarget; fallback ctx.hero — live); отказ (повторный
   *     canLearn: «уже изучено»/ранг/база) — { ok: false, message:
   *     res.reason } (без марки — действие не тратится, gold не
   *     списан);
   *   * успех → gold -= r.price С ГЕРОЯ (D5) → { ok: true }
   *     (message — из apply: r.message — приоритет в роутере,
   *     000128).
   * @param {object} ctx { hero, r, world: { game }, … }
   * @returns {{ok: boolean, message?: string}}
   */
  function handleMentorSpell(ctx) {
    const r = ctx && ctx.r;
    if (!r || r.ok !== true || r.success !== true ||
        typeof r.spellId !== 'string') {
      return {
        ok: false,
        message: (r && r.reason) || 'нет заклинания для обучения',
      };
    }
    const game = ctx.world && ctx.world.game;
    const S = game && game.Spells;
    if (!S || typeof S.learn !== 'function') {
      console.error('building-effect-mentor.js: Game.Spells не найден — ' +
        'src/spells.js обязан грузиться ДО main.js (задача 000147)');
      return { ok: false, message: 'заклинания недоступны' };
    }
    // 000147: learn — на АКТИВНОГО (единая точка LearnTarget);
    // fallback — ctx.hero (live-ссылка, D3): без LearnTarget /
    // без __game — герой (поведение «до обобщения», пин-совместимо).
    const LT = game && game.LearnTarget;
    const sheet = (LT && typeof LT.activeSheet === 'function')
      ? LT.activeSheet(ctx.hero) : ctx.hero;
    const res = S.learn(sheet, r.spellId, 'mentor');
    if (!res || !res.ok) {
      return { ok: false, message: res && res.reason };
    }
    // Золото — С ГЕРОЯ (общая казна партии, D5): apply чистое —
    // списание — здесь, мир-сторона.
    if (typeof ctx.hero.gold === 'number' &&
        typeof r.price === 'number') {
      ctx.hero.gold -= r.price;
    }
    // message — из apply (r.message — приоритет в роутере).
    return { ok: true };
  }

  /**
   * Саморегистрация спец-действия (браузер: в момент загрузки;
   * node: тестами явно). ОДИН хендлер на ВСЕ 5 id: '17_mentor',
   * '18_mentor', '19_mentor', '21_mentor', '38_mentor' — латиница+
   * подчёркивание, без ':'/','/пробелов (registerSpecial-гард,
   * building-actions.js:64). Нет buildingActions/registerSpecial →
   * console.error + БЕЗ регистрации (000053, игра не падает).
   * @param {object} G снапшот Game в момент загрузки
   */
  function register(G) {
    const BA = G && G.buildingActions;
    if (!BA || typeof BA.registerSpecial !== 'function') {
      console.error('building-effect-mentor.js: Game.buildingActions ' +
        'не найден — спец-действие «Обучение (наставник)» (5 школ, ' +
        'задача 000147) НЕ зарегистрировано ' +
        '(src/building-actions.js обязан грузиться ДО)');
      return;
    }
    BA.registerSpecial('17_mentor', handleMentorSpell);
    BA.registerSpecial('18_mentor', handleMentorSpell);
    BA.registerSpecial('19_mentor', handleMentorSpell);
    BA.registerSpecial('21_mentor', handleMentorSpell);
    BA.registerSpecial('38_mentor', handleMentorSpell);
  }

  return { handle: handleMentorSpell, handleMentorSpell, register };
});

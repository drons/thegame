// «Ежедневный контент» построек (задача 000077: магический круг
// 43 / заброшенный храм 39): СПЕЦ-МОДУЛЬ (контракт 000128 §2.3) —
// саморегистрация ОДНОГО хендлера на ОБА id (общий механизм) в
// момент СВОЕЙ загрузки:
//
//   Game.buildingActions.registerSpecial('43', dailyContent);
//   Game.buildingActions.registerSpecial('39', dailyContent);
//
// Script-тег в index.html — ПОСЛЕ building-actions.js (зарезервированный
// слот спец-модулей), ДО main.js (UMD-ловушка 000038; пин —
// tests/index-order.test.js). main.js и building-actions.js НЕ
// правятся (критерий 000128; проводка — существующий init-бандл,
// строка buildingContent + extra.seed startCombatAt — 000077 R-8).
//
// Чистый UMD/IIFE (паттерн 000053/000038): НОЛЬ зависимостей при
// загрузке (vm-песочницы boot() грузят всю цепочку index.html);
// единственное чтение Game-свойства в момент загрузки —
// Game.buildingActions (регистрация — load-time обязанность спец-
// модуля, 000128 §2.3: спец-модули регистрируются ДО init). Модуль
// отсутствует (битый порядок загрузки) — console.error + деградация:
// действие остаётся «сухим» apply (ok-результат без мир-эффекта);
// игра не роняется (000053).
//
// Хендлер (контракт — memory/000077-building-content.md §4): ctx с
// ЖИВЫМИ ссылками (hero — мутация инвентаря; world.buildingContent —
// запись; startCombat — бой): то, что ЧИСТОМУ apply недоступно
// (000071). r.type — из ЧИСТОГО apply (type есть только у записей
// «ежедневного контента»): чужая запись EFFECTS['43']/['39']
// (временная тестовая — B3) → ПРОХОД {ok:true}: хендлер не
// отказывает, общий пайплайн (марка/saveNow/flash/render) работает
// как до 000077 (критерий: B3 НЕ ТРОГАТЬ, memory §11). Порядок:
//   * chest|relic: world.game.addItem(ctx.hero, r.item, 1) — ОТКАЗ
//     ДО ЗАПИСИ (000128 §2.6): без daily-марки/saveNow/render —
//     день НЕ сгорает (детерминированный ролл даст тот же предмет;
//     инвентарь разгрузили — пройдёт, R-7);
//   * boss: запись buildingContent ПЕРЕД startCombat — контент уже
//     явлен; исход боя (победа/побег/смерть) НЕ отменяет день;
//     startCombat('BUILDING_BOSS', { seed: r.seed }) — СТАНДАРТНЫЙ
//     поток (рецепт GROUP_RECIPES.BUILDING_BOSS, combat.js; Эфир/
//     buffMods/saveNow — существующие точки main.js, R-8/R-9);
//   * запись: world.buildingContent.set('x,y', { day, type }) —
//     раздел сейва (имя — резерв 000072; контракт —
//     memory/000077-daily-content.md §3);
//   * success-сообщение — из apply (r.message — приоритет пайплайна,
//     000128 §2.4); хендлер сообщений НЕ строит (кроме отказов).
// try/catch вокруг хендлера НЕТ (000128 §2.4 — 1:1: баг хендлера
// ловят его тесты).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(root);
  } else {
    factory(root);
  }
})(typeof globalThis !== 'undefined' ? globalThis : self, function (root) {
  const G0 = typeof root.Game === 'object' ? root.Game : null;
  const BA = G0 && G0.buildingActions;
  if (!BA || typeof BA.registerSpecial !== 'function') {
    // В корректной цепочке building-actions.js грузится ДО этого
    // модуля (000128 §2.3); в node-тестах модуль не require-ится
    // (vm-песочницы — полная цепочка index.html).
    console.error('building-content.js: Game.buildingActions ' +
      'отсутствует — src/building-actions.js обязан грузиться ДО ' +
      'спец-модуля (000128); обработчик НЕ зарегистрирован');
    return { registered: false };
  }

  /**
   * Общий хендлер «ежедневного контента» (43 «Круг» / 39 «Храм»).
   * ctx (000128 §2.5): r (результат apply — при вызове ok:true +
   * type ∈ {'chest','boss','relic'} + item/seed), tile {x, y},
   * hero (ЖИВАЯ ссылка), day, startCombat (= deps.startCombat —
   * узкая точка startCombatAt), world (deps-бандл: buildingContent —
   * live Map, game — полный Game-снапшот).
   * @returns {{ok: boolean, message?: string}}
   */
  function dailyContent(ctx) {
    const r = ctx && ctx.r;
    const type = r && r.type;
    if (type !== 'chest' && type !== 'boss' && type !== 'relic') {
      // НЕ действие «ежедневного контента» (r.type — из apply ЧИСТОЙ
      // записи; чужая запись EFFECTS['43']/['39'] — напр., временная
      // тестовая, B3) — ПРОХОД: хендлер не отказывает, общий
      // пайплайн (марка/saveNow/flash/render) работает как до 000077.
      return { ok: true };
    }
    const world = (ctx && ctx.world) || {};
    const content = world.buildingContent;
    if (!content || typeof content.set !== 'function') {
      return { ok: false, message: 'недоступно' };
    }
    const tile = ctx.tile || { x: 0, y: 0 };
    const key = tile.x + ',' + tile.y;
    if (type === 'chest' || type === 'relic') {
      // 1 предмет в инвентарь (стопки/слоты — правила items.js);
      // message — из apply (r.message — приоритет пайплайна).
      const game = world.game;
      if (!game || typeof game.addItem !== 'function') {
        return { ok: false, message: 'недоступно' };
      }
      const res = game.addItem(ctx.hero, r.item, 1);
      if (!res || !res.ok) {
        // R-7: отказ ДО ЗАПИСИ — день не сгорает (000128 §2.6:
        // без марки/saveNow/render — пайплайн до успешной точки
        // не доходит; повтор в тот же день — детерминированный
        // ролл даст тот же предмет).
        return {
          ok: false,
          message: (res && res.reason) || 'инвентарь полон',
        };
      }
      content.set(key, { day: ctx.day, type });
      return { ok: true };
    }
    // boss: запись ПЕРЕД боем — контент уже явлен; исход боя НЕ
    // отменяет день («содержимое уже получено»).
    if (typeof ctx.startCombat !== 'function') {
      return { ok: false, message: 'недоступно' };
    }
    content.set(key, { day: ctx.day, type: 'boss' });
    // Стандартный мир-бой: рецепт BUILDING_BOSS (combat.js), боевой
    // сид из apply (BOSS_COMBAT_SEED по (tile, day)) → extra.seed
    // (startCombatAt, 000077 R-8); onEnd — стандартный (R-9).
    ctx.startCombat('BUILDING_BOSS', { seed: r.seed });
    return { ok: true };
  }

  // ОДИН хендлер на ОБА id — общий механизм (000077 §1).
  BA.registerSpecial('43', dailyContent);
  BA.registerSpecial('39', dailyContent);
  return { registered: true, dailyContent };
});

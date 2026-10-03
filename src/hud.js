// HUD (задача 000129, разбиение main.js 3/4): строки мира/подземелья/
// города — «Флогистон, ур. …», «Здесь: …», хинты [E]/[I], top-строка,
// flash-строка. Домен вынесен из src/main.js (hudUpdate, база
// L1256–1358) в стабильный файл: ~10 будущих HUD-задач (имена подтипов,
// эффекты, города, индикаторы) правят ТОЛЬКО этот модуль — main.js не
// становится бутылочным горлышком (критерий ТЗ).
//
// Чистый UMD-модуль (паттерн src/building-effects.js): node —
// require(), браузер — Game.hud. В момент загрузки — НОЛЬ
// зависимостей: ни require, ни DOM, ни чтения Game, ни console, ни
// Math.random (000038/000053, прецеденты 000127/000128). Модуль НЕ
// дотягивается до globalThis.Game ни при загрузке, ни при вызове
// (осознанное отличие от lazyGame-паттерна locations.js): ВСЁ — через
// узкий per-call ctx, который main.js передаёт при каждом вызове
// (контракт §3 memory/000129-hud-module.md):
//   ctx = { hudEl, game, tile, map, player, hero, day, zoom,
//           spriteLoader, dungeonState, defeatedAt, npcs, flash,
//           flashUntil, exploredCount, campShopFor }
// campShopFor — ОПЦИОНАЛЬНОЕ поле ctx (задача 000095, 16-е):
// (x, y, tile) → wrap барахолки лагеря | null; нет поля — ветка
// лагеря мертва (1:1 с цепочкой без лагеря, HU9c).
// game — ЕДИНСТВЕННЫЙ снапшот main.js (const G = globalThis.Game,
// 000038); tile — main.js считает map.tileAt ОДИН раз на кадр (в
// модуле tileAt НЕ вызывается). СОСТОЯНИЕ flash
// (hudFlash/hudFlashUntil) — в main.js (пишут действия/бой); модуль
// получает ЗНАЧЕНИЯ в ctx.flash/ctx.flashUntil и только отрисовывает
// (§4 memory). Единственный вызов, не из ctx, — performance.now() в
// момент ВЫЗОВА (buildLine): в vm-песочницах часы заморожены (NOW),
// в node — глобальный (Node 18).
//
// Публичная поверхность Game.hud (контракт §2 memory):
//   * update(ctx) — полный кадр 1:1 hudUpdate: строка → setShop →
//     ctx.hudEl.textContent (порядок main.js L1350–1357 сохранён);
//     setShop — ЕДИНСТВЕННЫЙ side-эффект модуля (D9); исключение —
//     000095-ревью: смена seed лагеря → ctx.game.playerUI.render()
//     1× (дневная ротация стока барахолки, lastCampSeed, HU9).
//   * buildLine(ctx) → string — ЧИСТАЯ (DOM не трогает): вся строка
//     HUD, включая flash-строку (полный побайтовый снимок, HU4).
//   * eHint(npc, effects) → 4 ветки 1:1 (000071):
//     «  ([E] <имя>, действия)» / «  ([E] <имя>)» /
//     «  ([E] действия)» / «».
//   * buildingNameHint(g, t) → { name, hint } — имя/хинт тайла
//     постройки 1:1 (000073/000103/000105).
//   * hereLine(g, t, npc, effects) → «\nЗдесь: …» — ветка целиком.
//   * locationLine(g, ds) → «\n--- <имя> (x, y) ---\nДо выхода: ~N
//     клеток» (+ «  |  M групп(ы)» — только подземелье; город — БЕЗ
//     строк групп, 000106).
//   shopHint и mob-строка НЕ экспортируются (инлайн 1:1 — HU4
//   покрывает; минимальная поверхность = меньше имён для
//   расхождения, D2). Внутренний порядок определений: eHint →
//   buildingNameHint → hereLine → locationLine → buildLine → update.
//
// Перенос 1:1 (рефакторинг БЕЗ смены поведения: HUD побайтово —
// фиксаторы city-screen C1–C5 / building-effects E1–E6 зелёные без
// правок; гарды — дословно, новых гардов на общих API НЕТ).
// Исключение — ОДИН новый гард (000053, прецедент locations.js
// 000127): DUNGEON_NAMES отсутствует ИЛИ нет ключа типа —
// console.error (1×/вызов) + fallback «подземелье»; в норме
// недостижимо (dungeon.js пинан, DUNGEON_NAMES закрывает все типы).
// В main.js остаётся тонкая проводка: обёртка renderHud (ctx 16
// полей — exploredCount добавлен 000093, campShopFor — 000095,
// опциональное) + load-time гард (000038).

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    const G0 = typeof root.Game === 'object' ? root.Game : {};
    root.Game = Object.assign({}, G0, { hud: factory() });
  }
})(typeof globalThis !== 'undefined' ? globalThis : self, function () {

  // Хинт [E] в строке «Здесь:» — 4 ветки 1:1 (main.js база
  // L1299–1309). [E] — РОУТЕР: действия упоминаем ВСЕГДА, когда есть
  // эффекты (NPC не перекрывает их): «([E] имя, действия)» /
  // «([E] имя)» / «([E] действия)» (ревью раунда 3, 000071).
  function eHint(npc, effects) {
    if (npc && effects) {
      return '  ([E] ' + npc.имя + ', действия)';
    } else if (npc) {
      return '  ([E] ' + npc.имя + ')';
    } else if (effects) {
      return '  ([E] действия)';
    }
    return '';
  }

  // Имя/хинт тайла постройки (1:1 main.js база L1310–1340).
  function buildingNameHint(g, t) {
    let name = g.buildingNameUi(t.building);
    // Задача 000073: у подтипа слота 9 «развалины» (buildingId 48)
    // хинт подавлен — тайл не вход (пара с гардом
    // Game.locations.maybeEnterDungeon, src/locations.js, 000127);
    // остальные пещерные тайлы (базовая 31,
    // в т.ч. buildingId null без каталога) — как раньше.
    let hint = t.building === g.BUILDING_TYPES.CAVE_ENTRANCE
      && t.buildingId !== 48
      ? ' (вход — шагните)' : '';
    // Каталожная запись тайла: город (000103/000105 — building
    // NONE, buildingNameUi '') И подтипы слотов 8..12 (000073 —
    // building — обобщённое имя слота). Имя — из записи:
    // название_карты || название (тот же вывод, что заголовок
    // города в makeCityState), регистр — конвенция buildingNameUi
    // (первая буква в нижнем). У базовых подтипов строки те же,
    // что buildingNameUi(slot); у подтипов — своё имя (000073).
    // Слоты 0..7 и без каталога — buildingId null, ветка не
    // срабатывает (имя — имя слота, как до задачи).
    if (t.buildingId != null) {
      const rec = g.getBuilding(t.buildingId);
      if (rec) {
        const raw = (rec.особые_параметры &&
          rec.особые_параметры.название_карты) || rec.название;
        if (typeof raw === 'string' && raw !== '') {
          name = raw.charAt(0).toLowerCase() + raw.slice(1);
          // Хинт «(вход — шагните)» — у города (000105); у
          // слотовых — только пещера без подтипа-развалин (см.
          // выше).
          if (rec.категория === 'город') hint = ' (вход — шагните)';
        }
      }
    }
    return { name, hint };
  }

  // Ветка «Здесь: …» (1:1 main.js база L1297–1341): shopHint (L1298)
  // + eHint + name/hint.
  function hereLine(g, t, npc, effects) {
    const shopHint = g.shopKindsFor(t.building)
      ? '  (торговля — панель [I])' : '';
    const nh = buildingNameHint(g, t);
    return '\nЗдесь: ' + nh.name + shopHint + eHint(npc, effects)
      + nh.hint;
  }

  // Блок «--- <имя> (x, y) ---» (1:1 main.js база L1283–1296 +
  // ОДИН новый гард DUNGEON_NAMES, 000053, прецедент locations.js
  // 000127).
  function locationLine(g, ds) {
    // dist — ДО ветки по kind: ds.dg.exit есть у ОБОИХ kind'ов
    // (город — C5 city-screen).
    const dist = Math.abs(ds.x - ds.dg.exit.x)
      + Math.abs(ds.y - ds.dg.exit.y);
    if (ds.kind === 'city') {
      // Город (000105): заголовок — имя города; contents null
      // (000106) — строк групп/сундуков нет (ds.contents.mobs
      // упадёт — ветка по kind обязательна).
      return '\n--- ' + ds.name + ' (' + ds.x + ', ' + ds.y + ') ---' +
        '\nДо выхода: ~' + dist + ' клеток';
    }
    // Гард шире 1:1 (таблицы нет ИЛИ нет ключа типа — в 1:1 было бы
    // 'undefined' в строке): data-error-ветка, в норме недостижима
    // (dungeon.js пинан; DUNGEON_NAMES закрывает все типы —
    // dungeon.test.js).
    let name = g.DUNGEON_NAMES ? g.DUNGEON_NAMES[ds.dg.type] : null;
    if (!name) {
      console.error('hud.js: Game.DUNGEON_NAMES отсутствует (000129) ' +
        '— fallback «подземелье»');
      name = 'подземелье';
    }
    return '\n--- ' + name + ' (' + ds.x + ', ' + ds.y + ') ---' +
      '\nДо выхода: ~' + dist + ' клеток  |  ' +
      (ds.contents.mobs.filter((m) => !m.defeated).length) +
      ' групп(ы)';
  }

  // Вся строка HUD (ЧИСТАЯ: DOM не трогает) — 1:1 main.js база
  // L1256–1358: top-строка, ветки подземелья/города, «Здесь:»,
  // группы мобов, flash-аппенд в конце. setShop/textContent —
  // в update.
  function buildLine(ctx) {
    const g = ctx.game;
    const t = ctx.tile;
    const d = g.derived(ctx.hero);
    const key = ctx.player.x + ',' + ctx.player.y;
    // NPC постройки текущего тайла (задача 000010) — подсказка [E].
    // Задача 000076: подтип слота 8..12 (buildingId) — СВОЯ запись
    // (свои NPC/эффекты): храм горы (38) — «[E] действия» БЕЗ
    // «[E] диалог» (Элдира — только 20/36). Базовые слоты — как до.
    const bHere = g.buildingActions
      ? g.buildingActions.buildingRecForTile(t) : null;
    const npcHere = bHere && g.npcForBuilding
      ? g.npcForBuilding(ctx.npcs, bHere.id) : null;
    // Эффекты постройки (задача 000071): ПОДСКАЗКА «[E] действия» —
    // только когда NPC НЕТ (NPC без эффектов — ТЕКУЩИЙ текст,
    // регрессия). hasEffects — дешёвый lookup реестра/каталога БЕЗ
    // сейва (сериализация сейва на кадр НЕ вводится).
    const effectsHere = bHere && g.buildingEffects
      && typeof g.buildingEffects.hasEffects === 'function'
      ? g.buildingEffects.hasEffects(bHere)
      : false;
    let line = 'Флогистон, ур. ' + ctx.hero.level + '  (' + ctx.player.x + ', ' + ctx.player.y + ')\n' +
      'HP ' + ctx.hero.hp + '/' + d.maxHP + '  |  Золото: ' + ctx.hero.gold + '  |  Очки: ' + ctx.hero.points + '\n' +
      'Местность: ' + g.TERRAIN_NAMES[t.terrain] + '\n' +
      'День: ' + ctx.day + '  |  Масштаб: ' + ctx.zoom + 'px  |  карта: ' + ctx.map.width + 'x' + ctx.map.height +
      (ctx.map.fromPng ? ' (map.png)' : ' (пересчёт)') +
      (ctx.spriteLoader ? '  |  графика: ' + ctx.spriteLoader.readyCount() + '/' + ctx.spriteLoader.totalCount() : '') + '\n' +
      '[I] персонаж' + (npcHere ? '  |  [E] диалог'
        : (effectsHere ? '  |  [E] действия' : ''));
    // Задача 000093: «Исследовано: N тайлов» (сумма по explored,
    // main.js) — отдельная строка ПОСЛЕ top-блока, ДО веток
    // dungeonState/hereLine/mobgroup; ТОЛЬКО при N>0 (0/NaN/нет
    // поля — строки нет; гард — Number.isFinite); грамматика БЕЗ
    // склонений (ТЗ-текст «исследовано N тайлов»).
    const exploredCount = Number.isFinite(ctx.exploredCount)
      ? ctx.exploredCount : 0;
    line += (exploredCount > 0)
      ? '\nИсследовано: ' + exploredCount + ' тайлов' : '';
    if (ctx.dungeonState) {
      line += locationLine(g, ctx.dungeonState);
    } else if (t.hasBuilding) {
      line += hereLine(g, t, npcHere, effectsHere);
    } else if (t.hasMobGroup) {
      // Имя группы — из каталога лениво (задача 000057): map.js
      // грузится ДО main.js, G.mobGroupName всегда на месте.
      line += ctx.defeatedAt.has(key)
        ? '\nГруппа ' + g.mobGroupName(t.mobGroup) + ' повержена.'
        : '\nОсторожно: ' + g.mobGroupName(t.mobGroup) + '!';
    }
    // flash: ЗНАЧЕНИЯ из ctx (состояние — main.js, §4 memory); часы —
    // в момент вызова (в песочницах заморожены — NOW).
    if (performance.now() < ctx.flashUntil) line += '\n' + ctx.flash;
    return line;
  }

  // 000095 (правка по итогам ревью): сток барахолки лагеря РОТАЦИЯ
  // по дню — seed wrap'а меняется, а key setShop (x, y, 47, wealth)
  // дня НЕ содержит → пока панель открыта на тайле лагеря, вкладка
  // «Магазин» держит количества предшествующего дня до СЛЕДУЮЩЕГО
  // render-события (покупка читает живой сток — данные не ломаются,
  // DOM просрочен). Смена seed лагеря — ОДИН повторный render()
  // (1 раз/день, а не каждый кадр: seed стабилен в пределах дня;
  // seed «картового» магазина дня не содержит — для него ветка
  // мертва).
  let lastCampSeed = null;

  // Полный кадр 1:1 hudUpdate (main.js база L1256–1358): строка →
  // setShop → запись textContent (порядок L1350–1357; setShop —
  // ЕДИНСТВЕННЫЙ side-эффект, D9; исключение — 000095-ревью: смена
  // seed лагеря → ctx.game.playerUI.render() 1×, HU9).
  function update(ctx) {
    const line = buildLine(ctx);
    // Магазин текущего тайла → вкладка «Магазин» в панели персонажа.
    if (ctx.game.playerUI) {
      const isShop = !ctx.dungeonState && ctx.tile.hasBuilding
        && ctx.game.shopKindsFor(ctx.tile.building);
      // Лагерь (задача 000095): лагерь — НЕ «картовый» магазин
      // (shopKindsFor(47) → null → isShop мертва), поэтому wrap
      // барахолки БЕЗ makeShop; isShop ПЕРЕБИВАЕТ лагерь;
      // dungeonState — null на обеих ветках (гард 1:1). Вызов
      // campShopFor — ТОЛЬКО при !isShop (паттерн 1:1, без
      // лишних вызовов на магазинных тайлах).
      const campShop = !isShop
        && !ctx.dungeonState && typeof ctx.campShopFor === 'function'
        ? ctx.campShopFor(ctx.player.x, ctx.player.y, ctx.tile)
        : null;
      const shop = isShop
        ? ctx.game.makeShop(ctx.player.x, ctx.player.y,
          ctx.tile.building, ctx.tile.buildingWealth)
        : campShop;
      ctx.game.playerUI.setShop(shop);
      // 000095 (ревью): сток лагеря подменён на дневной — key setShop
      // не изменился, render() не шёл; setShop ОБНОВИЛ ссылку shop →
      // перерисовываем вкладку ОДИН раз на смену seed. Свой wrap —
      // ТОЛЬКО лагерь (shop === campShop; «картовый» wrap другой
      // объект, seed стабилен на тайле).
      if (shop === campShop && shop && shop.seed != null
          && shop.seed !== lastCampSeed) {
        lastCampSeed = shop.seed;
        if (typeof ctx.game.playerUI.render === 'function') {
          ctx.game.playerUI.render();
        }
      }
    }
    ctx.hudEl.textContent = line;
  }

  return { update, buildLine, eHint, buildingNameHint, hereLine,
    locationLine };
});

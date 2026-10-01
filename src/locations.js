// src/locations.js (задача 000127, разбиение main.js 1/4): домен
// «состояние и переходы подземелья/города».
//
// Чистый UMD-модуль: node — module.exports (взаимных require в момент
// загрузки НЕТ — прецедент 000053/000071), браузер — Game.locations.
// В браузере ОБЯЗАН грузиться ДО main.js (UMD-ловушка 000038: main.js
// снимает const G = globalThis.Game ОДИН раз при загрузке) — порядок
// закреплён tests/index-order.test.js.
//
// БЕЗ снапшота Game в момент загрузки (000038 — строже, чем «один
// раз»): все Game-функции читаются ЛЕНИВО в момент ВЫЗОВА (rootRef,
// прецедент building-effects 000071): createMover, DUNGEON_NAMES,
// CELL_FLOOR, BUILDING_TYPES, createDungeon, contentValid,
// generateDungeonContents, openChest, wanderStep, getBuilding,
// Cities.createCityLayout. Нет зависимости — console.error +
// деградация, игра НЕ падает (все недостижимы в браузере — пины
// index-order). Загрузка чистая: 0 исключений, 0 console.error.
//
// Движение — ВОЗВРАТ СОБЫТИЙ (чистые функции, решение D3): UI/состояние
// (dungeonUI, saveNow, hudFlash, hero, бой) — тонкая проводка main.js.
//   L.makeDungeonState(d, contents, worldKey, env) → ds
//   L.makeCityState(layout, buildingRec, worldKey, env) → ds
//   L.maybeEnterDungeon(ctx) / L.maybeEnterCity(ctx) → ds | null
//   L.exitDungeon(ds, { day, memory, clock }) → void
//   L.exitCity(ds) → void                      // без дня, без памяти
//   L.dungeonMove(ds, dx, dy, now, { inCombat }) → null | event
//   L.cityMove(ds, dx, dy, now, { inCombat })  → null | event
//   L.debugEnterDungeon(ctx, terrain) → ds | null
// Форма ds — поле-в-поле как dungeonState main.js (инвариант
// сейва/HUD/«__game.dungeon»).
//
// Детерминизм (инвариант): в файле НЕТ новых вызовов RNG — весь поток
// случайности живёт в ядрах (createDungeon, generateDungeonContents,
// wanderStep, createCityLayout) в ТЕХ ЖЕ вызовах и в ТОМ ЖЕ порядке,
// что до переноса (createDungeon → memory.get → contentValid →
// generateDungeonContents; шаг: mover.step → моб → openChest →
// wanderStep).
//
// Контракт: memory/000127-locations-module.md (§4 API, §8 инварианты).
// Тесты: tests/locations.test.js (LOC-1..LOC-12), пин порядка —
// tests/index-order.test.js.

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();               // node: ноль взаимных require
  } else {
    const G0 = typeof root.Game === 'object' ? root.Game : {};
    root.Game = Object.assign({}, G0, { locations: factory() });
  }
})(typeof globalThis !== 'undefined' ? globalThis : self, function () {
  'use strict';

  // Game в момент ВЫЗОВА (ленивый захват, паттерн 000053/000071):
  // модуль обязан грузиться с нулём зависимостей; все Game-функции
  // читаются из globalThis.Game только когда их вызывают.
  function lazyGame() {
    return typeof globalThis !== 'undefined' ? globalThis.Game : null;
  }

  // Имя подземелья для строк лога/flash: DUNGEON_NAMES[type]
  // (dungeon.js). Деградация (D13): таблицы нет — console.error +
  // fallback-литерал «подземелье» (недостижимо в браузере — dungeon.js
  // пинан ДО этого модуля).
  function dungeonName(d) {
    const G = lazyGame();
    const names = G && G.DUNGEON_NAMES;
    if (!names) {
      console.error('locations.js: Game.DUNGEON_NAMES отсутствует ' +
        '(src/dungeon.js обязан грузиться ДО src/locations.js, 000127) ' +
        '— fallback «подземелье»');
      return 'подземелье';
    }
    return names[d.type];
  }

  // Мувер + дробная позиция (000068, паттерн мира 000033): ОТДЕЛЬНЫЙ
  // мувер от entrance, защитный снап, ds.pos(now) для dungeon-ui
  // (спрайт/ромб + цель камеры). intervalMs — ПАРАМЕТРОМ (D1: единый
  // источник — MOVE_INTERVAL_MS в main.js). Деградация: нет
  // createMover (как в main.js без motion.js) / нет env.intervalMs
  // (D12 — console.error) → ds.mover = null, ds.pos → { x, y }.
  function attachMover(ds, x, y, env) {
    const G = lazyGame();
    const intervalMs = env && env.intervalMs;
    if (intervalMs == null) {
      console.error('locations.js: env.intervalMs отсутствует (000127 ' +
        'D12) — ds.mover = null, ds.pos — целая позиция');
      ds.mover = null;
    } else if (!G || typeof G.createMover !== 'function') {
      ds.mover = null;   // деградация без motion.js — как в main.js
    } else {
      ds.mover = G.createMover({ x, y, intervalMs });
      // Защитный снап в entrance (ТЗ: формальность — новый мувер уже
      // там; деградация без motion.js — ds.mover = null, как мировой).
      if (ds.mover) ds.mover.teleport(x, y);
    }
    // Дробная позиция для dungeon-ui.
    ds.pos = (now) => (ds.mover
      ? ds.mover.position(now)
      : { x: ds.x, y: ds.y });
    return ds;
  }

  // Состояние подземелья (задача 000068) + ОТДЕЛЬНЫЙ мувер
  // (src/motion.js, паттерн мира 000033): дробная позиция ds.pos(now)
  // для рендера — глейд prev→next за интервал шага (MOVE_INTERVAL_MS —
  // тот же источник, что мировой мувер; «Ловкий шаг» в подземелье НЕ
  // применяется — шаг на keydown, троттлинг мира не переносится,
  // ограничение ТЗ). Мувер живёт в dungeonState и умирает вместе с
  // ним (exitDungeon — без изменений).
  function makeDungeonState(d, contents, worldKey, env) {
    const ds = {
      dg: d, contents,
      kind: 'dungeon', // 000105: ветка состояния (город — 'city')
      x: d.entrance.x, y: d.entrance.y,
      prevX: d.entrance.x, prevY: d.entrance.y,
      worldKey,
      log: [dungeonName(d) + ': вход.'],
    };
    return attachMover(ds, d.entrance.x, d.entrance.y, env);
  }

  // Состояние города (задача 000105, подзадача 000052) — та же форма,
  // что makeDungeonState (000068): ОТДЕЛЬНЫЙ мувер + дробная позиция
  // ds.pos(now) для рендера. Город пока ПУСТО (содержимое — 000106,
  // взаимодействие [E] — 000107): contents — null.
  function makeCityState(layout, buildingRec, worldKey, env) {
    const name = (buildingRec.особые_параметры &&
      buildingRec.особые_параметры.название_карты)
      || buildingRec.название;
    const ds = {
      dg: layout,
      contents: null, // город пуст (содержимое — 000106)
      kind: 'city',
      name,
      x: layout.entrance.x, y: layout.entrance.y,
      prevX: layout.entrance.x, prevY: layout.entrance.y,
      worldKey,
      log: [name + ': вход.'],
    };
    return attachMover(ds, layout.entrance.x, layout.entrance.y, env);
  }

  // Шаг на тайл с входом в пещеру → лабиринт (ядро: src/dungeon.js).
  // Предусловие: НЕ в локации (гард держит проводка — enterLocation,
  // D10). ctx = { map, mapPixels, player, hero, day, memory,
  // intervalMs }.
  function maybeEnterDungeon(ctx) {
    const G = lazyGame();
    const map = ctx && ctx.map;
    const player = ctx && ctx.player;
    const memory = ctx && ctx.memory;
    if (!map || typeof map.tileAt !== 'function' || !player) {
      console.error('locations.js: ctx.map/ctx.player отсутствуют ' +
        '(проводка main.js, 000127) — вход не открывается');
      return null;
    }
    const t = map.tileAt(player.x, player.y);
    // Задача 000073: развалины (подтип слота 9, buildingId 48) —
    // ПОСТРОЙКА, а не вход: шаг на тайл НЕ открывает лабиринт
    // (пара с подавлением хинта «(вход — шагните)» в hudUpdate).
    // buildingId null (без каталога — фолбэк) — вход сохраняется
    // (fail-open).
    const cave = G && G.BUILDING_TYPES && G.BUILDING_TYPES.CAVE_ENTRANCE;
    if (!cave) {
      console.error('locations.js: Game.BUILDING_TYPES.CAVE_ENTRANCE ' +
        'отсутствует (src/map.js должен грузиться ДО src/locations.js, ' +
        '000127) — вход не открывается');
      return null;
    }
    if (!t.hasBuilding || t.building !== cave || t.buildingId === 48) {
      return null;
    }
    if (!G || typeof G.createDungeon !== 'function') {
      console.error('locations.js: Game.createDungeon отсутствует ' +
        '(src/dungeon.js должен грузиться ДО src/locations.js, 000127) ' +
        '— вход не открывается');
      return null;
    }
    if (!memory) {
      console.error('locations.js: ctx.memory отсутствует (проводка ' +
        'main.js, 000127) — вход не открывается');
      return null;
    }
    const worldKey = player.x + ',' + player.y;
    const d = G.createDungeon(player.x, player.y, ctx.mapPixels, t.terrain);
    const saved = memory.get(worldKey);
    // Содержимое живёт, пока внутри + dungeon_memory_days (SPEC).
    let contents = null;
    if (saved) {
      if (typeof G.contentValid === 'function') {
        contents = G.contentValid(saved.lastVisitDay, ctx.day)
          ? saved.contents
          : null;
      } else {
        console.error('locations.js: Game.contentValid отсутствует ' +
          '(src/dungeon.js должен грузиться ДО src/locations.js, ' +
          '000127) — содержимое будет пересоздано');
      }
    }
    if (!contents) {
      if (typeof G.generateDungeonContents === 'function') {
        contents = G.generateDungeonContents(d, ctx.hero);
      } else {
        console.error('locations.js: Game.generateDungeonContents ' +
          'отсутствует (src/dungeon.js должен грузиться ДО ' +
          'src/locations.js, 000127) — вход не открывается');
        return null;
      }
    }
    const ds = makeDungeonState(d, contents, worldKey,
      { intervalMs: ctx.intervalMs });
    if (saved) saved.lastVisitDay = ctx.day; // продлить память
    return ds;
  }

  // Шаг на тайл постройки с каталожной записью категории «город»
  // (000102/000103: buildingId 51..54; у города building — NONE,
  // опознаётся по buildingId) → экран города.
  // Предусловие: НЕ в локации (гард держит проводка — enterLocation,
  // D10). ctx — тот же, что maybeEnterDungeon.
  function maybeEnterCity(ctx) {
    const G = lazyGame();
    const map = ctx && ctx.map;
    const player = ctx && ctx.player;
    if (!map || typeof map.tileAt !== 'function' || !player) {
      console.error('locations.js: ctx.map/ctx.player отсутствуют ' +
        '(проводка main.js, 000127) — город не открывается');
      return null;
    }
    const t = map.tileAt(player.x, player.y);
    if (!t.hasBuilding || t.buildingId == null) return null;
    if (!G || typeof G.getBuilding !== 'function') {
      console.error('locations.js: Game.getBuilding отсутствует ' +
        '(src/buildings.js должен грузиться ДО src/locations.js, ' +
        '000127) — город не открывается');
      return null;
    }
    const rec = G.getBuilding(t.buildingId);
    if (!rec || rec.категория !== 'город') return null;
    if (!G.Cities || typeof G.Cities.createCityLayout !== 'function') {
      console.error('locations.js: Game.Cities.createCityLayout ' +
        'отсутствует (src/cities.js должен грузиться ДО ' +
        'src/locations.js, 000127) — город не открывается');
      return null;
    }
    // Layout — от ЯКОРЯ, не от входного тайла (000104).
    const [ax, ay] = t.buildingAnchor;
    const layout = G.Cities.createCityLayout(ax, ay, rec.размер.ширина);
    return makeCityState(layout, rec, player.x + ',' + player.y,
      { intervalMs: ctx.intervalMs });
  }

  // Шаг внутри лабиринта (вызывается dungeon-ui по клавише). Чистая:
  // ds — АРГУМЕНТ, не замыкание; события возврата применяет проводка
  // main.js. null — !ds / inCombat / за границы / стена (mover.step НЕ
  // вызывается); { type: 'exit', name } — выходная клетка (позиция НЕ
  // сдвинута); { type: 'combat', group } — группа (wanderStep НЕ
  // вызывается — ранний return); { type: 'moved', chest: null |
  // { gold, item } }.
  function dungeonMove(ds, dx, dy, now, opts) {
    if (!ds) return null;
    if ((opts || {}).inCombat) return null; // гард — как первый в main.js
    const G = lazyGame();
    const d = ds.dg, c = ds.contents;
    const nx = ds.x + dx, ny = ds.y + dy;
    if (nx < 0 || ny < 0 || nx >= d.width || ny >= d.height) return null;
    if (!G || G.CELL_FLOOR === undefined) {
      console.error('locations.js: Game.CELL_FLOOR отсутствует ' +
        '(src/dungeon.js должен грузиться ДО src/locations.js, 000127) ' +
        '— шаг заблокирован');
      return null;
    }
    if (d.cells[ny * d.width + nx] !== G.CELL_FLOOR) return null; // стена
    if (nx === d.exit.x && ny === d.exit.y) {
      // Выход: позиция НЕ сдвинута; exitDungeon + flash — проводка.
      return { type: 'exit', name: dungeonName(d) };
    }
    ds.prevX = ds.x; ds.prevY = ds.y;
    ds.x = nx; ds.y = ny;
    // Глейд prev→next (000068, паттерн мира 000033): ставится ДО
    // проверок моб/сундук — бой начинается с клетки, к которой игрок
    // ДОХОДИТ глейдом. Заблокированные шаги (стена/граница/выход) —
    // ранний return выше, мувер не вызывается.
    if (ds.mover) {
      ds.mover.step({ x: ds.prevX, y: ds.prevY }, { x: nx, y: ny }, now);
    }
    // Блуждающая группа на клетке → бой (startDungeonCombat —
    // проводка).
    const g = c.mobs.find((m) => !m.defeated && m.x === nx && m.y === ny);
    if (g) {
      return { type: 'combat', group: g }; // wanderStep НЕ вызывается
    }
    // Сундук на клетке → открыть (награда — hero/log/hudFlash —
    // проводка; решение D9: применяется ПОСЛЕ этого шага, состояние
    // дизджойнтно, порядок вызовов RNG не меняется).
    let chest = null;
    const ch = c.chests.find((x) => !x.opened && x.x === nx && x.y === ny);
    if (ch) {
      if (typeof G.openChest === 'function') {
        const r = G.openChest(c, ch.id);
        chest = (r && r.ok) ? { gold: r.gold, item: r.item } : null;
      } else {
        console.error('locations.js: Game.openChest отсутствует ' +
          '(src/dungeon.js должен грузиться ДО src/locations.js, ' +
          '000127) — сундук не открывается');
      }
    }
    // Каждый шаг игрока — шаг блуждания мобов (ровно раз на успешный
    // шаг).
    if (typeof G.wanderStep === 'function') {
      G.wanderStep(c, d);
    } else {
      console.error('locations.js: Game.wanderStep отсутствует ' +
        '(src/dungeon.js должен грузиться ДО src/locations.js, 000127) ' +
        '— блуждание пропущено');
    }
    return { type: 'moved', chest };
  }

  // Шаг внутри города (вызывается dungeon-ui по клавише). Город пуст
  // (до 000106): мобов/сундуков/wanderStep нет. Чистая: ds — АРГУМЕНТ,
  // события возврата — как dungeonMove (exit/moved).
  function cityMove(ds, dx, dy, now, opts) {
    if (!ds) return null;
    if (ds.kind !== 'city') return null; // kind-гард — как в main.js
    if ((opts || {}).inCombat) return null;
    const G = lazyGame();
    const d = ds.dg;
    const nx = ds.x + dx, ny = ds.y + dy;
    if (nx < 0 || ny < 0 || nx >= d.width || ny >= d.height) return null;
    if (!G || G.CELL_FLOOR === undefined) {
      console.error('locations.js: Game.CELL_FLOOR отсутствует ' +
        '(src/dungeon.js должен грузиться ДО src/locations.js, 000127) ' +
        '— шаг заблокирован');
      return null;
    }
    if (d.cells[ny * d.width + nx] !== G.CELL_FLOOR) return null; // стена
    if (nx === d.exit.x && ny === d.exit.y) {
      // Выход: позиция НЕ сдвинута; exitCity + flash — проводка.
      return { type: 'exit', name: ds.name };
    }
    ds.prevX = ds.x; ds.prevY = ds.y;
    ds.x = nx; ds.y = ny;
    // Глейд prev→next (000068, паттерн dungeonMove): шаг ДО конца.
    if (ds.mover) {
      ds.mover.step({ x: ds.prevX, y: ds.prevY }, { x: nx, y: ny }, now);
    }
    return { type: 'moved' };
  }

  // Выход из подземелья: доменная семантика (D5) — подземелье тратит
  // ДЕНЬ (SPEC «Игровое время») и пишется память содержимого.
  // dungeonState=null / dungeonUI.close() / saveNow() — проводка
  // (exitLocation в main.js).
  function exitDungeon(ds, opts) {
    const o = opts || {};
    o.memory.set(ds.worldKey,
      { contents: ds.contents, lastVisitDay: o.day });
    o.clock.event('dungeon'); // вылазка забирает день (SPEC «Игровое время»)
  }

  // Выход из города: no-op маркер с инвариантами (D5/D6) — ДЕНЬ НЕ
  // проходит (SPEC «Города и деревни»): clock.event НЕ вызывается,
  // память НЕ пишется (dungeonMemory — 000109). Симметричный API с
  // exitDungeon; close/saveNow — проводка.
  function exitCity(ds) {
    void ds;
  }

  // Отладочный вход: подземелье из текущего тайла (не требует входа в
  // пещеру; __game.actions.enterDungeon). Тело старой действия
  // (решение D8): ОДИН хелпер на ОБА входа — одна форма состояния
  // (000068). dungeonMemory НЕ consultится (как сейчас);
  // dungeonState/оверлей — проводка.
  // ctx = { map, mapPixels, player, hero, intervalMs }.
  function debugEnterDungeon(ctx, terrain) {
    const G = lazyGame();
    const map = ctx && ctx.map;
    const player = ctx && ctx.player;
    if (!map || typeof map.tileAt !== 'function' || !player) {
      console.error('locations.js: ctx.map/ctx.player отсутствуют ' +
        '(проводка main.js, 000127) — отладочный вход недоступен');
      return null;
    }
    if (!G || typeof G.createDungeon !== 'function'
        || typeof G.generateDungeonContents !== 'function') {
      console.error('locations.js: Game.createDungeon/' +
        'generateDungeonContents отсутствуют (src/dungeon.js должен ' +
        'грузиться ДО src/locations.js, 000127) — отладочный вход ' +
        'недоступен');
      return null;
    }
    const t = map.tileAt(player.x, player.y);
    const d = G.createDungeon(player.x, player.y, ctx.mapPixels,
      terrain != null ? terrain : t.terrain);
    const ds = makeDungeonState(
      d, G.generateDungeonContents(d, ctx.hero),
      player.x + ',' + player.y, { intervalMs: ctx.intervalMs });
    return ds;
  }

  return {
    makeDungeonState, makeCityState,
    maybeEnterDungeon, maybeEnterCity,
    exitDungeon, exitCity,
    dungeonMove, cityMove,
    debugEnterDungeon,
  };
});

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
// CELL_FLOOR, BUILDING_TYPES, createDungeon, dungeonMemoryKey,
// contentValid, generateDungeonContents, openChest, wanderStep,
// getBuilding, Cities.createCityLayout. Нет зависимости —
// console.error + деградация, игра НЕ падает (все недостижимы в
// браузере — пины index-order). Загрузка чистая: 0 исключений,
// 0 console.error.
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
//   L.interactExit(ds) → null | { type: 'exit', name } |
//       { type: 'descend' } | { type: 'ascend' }  // 000177/000153.03
//   L.descendFloor(ds, ctx) → ds | null          // 000153.03: спуск
//   L.ascendFloor(ds, ctx) → ds | null           // 000153.03: подъём
//   L.floorStatusLine(d, x, y) → string          // 000153.03: HUD (G)
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
  // ds.pos(now) для рендера. ds.contents — ВСЕГДА null (ловушка
  // __game.dungeon: mobs/chests по ds.contents); содержимое города —
  // ОТДЕЛЬНЫЕ поля cityContents/cityShops/cityWealth (заполняет
  // maybeEnterCity, 000106/000108; interaction [E] — 000107).
  function makeCityState(layout, buildingRec, worldKey, env, savedName) {
    // 000148.05 (D-.05h): сохранённое имя города (persistent-поле
    // data.cities) ПЕРЕБИВАЕТ каталог: saved > название_карты >
    // название. whitespace/не-строка → default (typeof-проверки
    // достаточны — LOC-2: новых require/зависимостей НЕТ). log — из
    // ФИНАЛЬНОГО имени.
    const name = (typeof savedName === 'string' &&
      savedName.trim() !== '')
      ? savedName
      : ((buildingRec.особые_параметры &&
        buildingRec.особые_параметры.название_карты)
        || buildingRec.название);
    const ds = {
      dg: layout,
      contents: null, // ЛОВУШКА __game.dungeon: ОБЯЗАТЕЛЬНО null (000107)
      kind: 'city',
      name,
      x: layout.entrance.x, y: layout.entrance.y,
      prevX: layout.entrance.x, prevY: layout.entrance.y,
      worldKey,
      log: [name + ': вход.'],
      // Задача 000107: содержимое города (000106) + стоки лавок
      // (000108) + богатство якоря — заполняются maybeEnterCity ПОСЛЕ
      // создания ds (имена полей ЗАФИКСИРОВАНЫ для 000109 — restore
      // подменит те же поля в той же точке). null — генерация не
      // сработала (деградация); {} — пусто легитимо (хутор).
      cityContents: null, // {buildings:[{x,y,buildingId}], seed} | null
      cityShops: null,    // {'tx,ty': makeCityShop 6-полевой} | null
      cityWealth: null,   // 0..3 | null
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
    // 000153.01: единственный этаж — ПЕРВАЯ глубина (000153.03 введёт
    // depth+1 через тот же 5-й аргумент createDungeon).
    const depth = 1;
    const d = G.createDungeon(player.x, player.y, ctx.mapPixels,
      t.terrain, depth);
    // Ключ памяти — вход + глубина (000153.01): единый источник —
    // dungeon.js; инлайн-fallback строкой (без реинжениринга формы
    // ключа — LOC-2: ноль RNG/require в source).
    const memKey = G.dungeonMemoryKey
      ? G.dungeonMemoryKey(worldKey, depth)
      : worldKey + ':' + depth;
    const saved = memory.get(memKey);
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
        // 000157.02: реальная глубина этажа — d.depth (000153.01):
        // формулы залежей nDeposits/T/amount работают от неё (до
        // 000153.03 глубина всегда 1 — поведение не меняется).
        // debugEnterDungeon (000151) — БЕЗ opts (depth=1 по
        // умолчанию, debug-контент не зависит от глубины).
        contents = G.generateDungeonContents(d, ctx.hero,
          { depth: d.depth });
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
    // 000153.01: восстановление СПАВНА из сохранённой позиции
    // (пишется ТОЛЬКО in-flight-сейвом, «активный поверх»): FLOOR-
    // проверка (бит/за границей/не FLOOR/нет pos — молча entrance,
    // ядро не логирует) + mover.teleport (глейд dungeon-ui).
    // FLOOR-клетка достижима по построению (карта выкапывается от
    // entrance; reachableFrom пинит связность) — BFS не нужен.
    const p = saved && saved.pos;
    if (p && Number.isInteger(p.x) && Number.isInteger(p.y) &&
        p.x >= 0 && p.y >= 0 && p.x < d.width && p.y < d.height &&
        G.CELL_FLOOR !== undefined &&
        d.cells[p.y * d.width + p.x] === G.CELL_FLOOR &&
        !(contents && contents.mobs.some((m) => m && !m.defeated
          && m.x === p.x && m.y === p.y))) {
      ds.x = ds.prevX = p.x; ds.y = ds.prevY = p.y;
      if (ds.mover) ds.mover.teleport(p.x, p.y);
    }
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
    // 000148.05 (D6/D-.05h): сохранённая запись города (persistent-
    // поля name/built) из ctx.cityStates (проводка main.js: live-Map,
    // ключ — ЯКОРЬ; без проводки — savedRec null → default-имя + occ
    // null — деградация как до .05). Двухуровневый поиск: якорь
    // (production — всегда попадает) → входной тайл (worldKey —
    // fallback, LOC-19).
    const anchorKey = ax + ',' + ay;
    let savedRec = null;
    if (ctx.cityStates && typeof ctx.cityStates.get === 'function') {
      savedRec = ctx.cityStates.get(anchorKey) || null;
      if (!savedRec)
        savedRec = ctx.cityStates.get(player.x + ',' + player.y) || null;
    }
    // 000222 (§8): канонизация ЖИВОЙ built-записи на входе — пустой
    // storage:[] (ленивая материализация storageAt, 000221)
    // удаляется: live-запись становится равной форме сейва
    // (validateCityState omitted-пустой storage, 000221 D4/D7).
    // prepareCityState (main.js, заморожен) держит built ПО ССЫЛКЕ —
    // in-place-чистка видна g.cities (пин R14: после выхода/возврата
    // запись = 4 ключа + level, storage:[] НЕТ). Ненулевой storage
    // и прочее — БИТ-В-БИТ.
    if (savedRec && Array.isArray(savedRec.built)) {
      for (const e of savedRec.built) {
        if (e && typeof e === 'object' && !Array.isArray(e)
            && Array.isArray(e.storage) && e.storage.length === 0)
          delete e.storage;
      }
    }
    // 000222 (D-D): реестр уровней лавок — из built-записи ДО
    // стоков (makeCityShop 6-арг. ниже и prepareCityState main.js
    // читают shopLevels → effWealth по уровню).
    if (G.Cities && typeof G.Cities.syncShopLevels === 'function')
      G.Cities.syncShopLevels(ax, ay, savedRec || {});
    // occupied (клетки built) — ОДИН источник для обеих точек
    // генерации (контракт §3.5): базовый набор НЕ занимает
    // player-клетки. try/catch — деградация 000053 (в production
    // недостижимо: getBuilding выше прошёл).
    let occ = null;
    if (savedRec && typeof G.Cities.builtOccupied === 'function') {
      try { occ = G.Cities.builtOccupied(savedRec); }
      catch (err) { occ = null; }
    }
    // Задача 000107: содержимое (000106) + стоки лавок (000108) —
    // ЖЁСТКАЯ (eager) генерация при ВХОДЕ (не ленивая): 000109
    // (restore) подменит те же поля в той же точке. Порядок
    // makeCityShop = порядок buildings из generateCityContents
    // (детерминирован; RNG — только в ядрах, в ТЕХ ЖЕ вызовах:
    // createCityLayout → generateCityContents → makeCityShop×N).
    // Хутор (fp1): buildings: [] → cityShops = {} (ПУСТОЙ объект,
    // не null — содержимое сгенерировано, построек нет).
    const wealth = t.buildingWealth;
    let cityContents = null, cityShops = null, cityWealth = null;
    if (Number.isInteger(wealth) && wealth >= 0 && wealth <= 3 &&
        typeof G.Cities.generateCityContents === 'function') {
      // 000148.05 (D10/§3.5): occupied — 6-й аргумент (клетки built:
      // базовый набор НЕ занимает player-клетки). absent/пусто —
      // БИТ-В-БИТ с прежним вызовом (деградация как до .05).
      cityContents = G.Cities.generateCityContents(
        layout, ax, ay, rec, wealth, occ);
      cityWealth = wealth;
      cityShops = {};
      if (typeof G.Cities.makeCityShop === 'function') {
        for (const bl of cityContents.buildings) {
          const s = G.Cities.makeCityShop(
            ax, ay, bl.x, bl.y, bl.buildingId, wealth);
          if (s) cityShops[bl.x + ',' + bl.y] = s; // null (не 1/44) — мимо
        }
      }
    } else {
      // Деградация (000053): wealth не 0..3 или cities.js не дотянул
      // функции 000106 — город без содержимого ([E] в городе no-op);
      // мир не роняется. validateWealth/throw функций НЕ достижим:
      // входы проверены.
      console.error('locations.js: содержимое города не сгенерировано ' +
        '(000107: Game.Cities.generateCityContents отсутствует или ' +
        'wealth вне 0..3) — город без построек/лавок');
    }
    // 000148.05 (D-.05h): сохранённое имя (persistent) — 5-й аргумент
    // makeCityState; typeof-проверка (не-строка/absent → default).
    const savedName = (savedRec && typeof savedRec.name === 'string')
      ? savedRec.name : null;
    const ds = makeCityState(layout, rec, player.x + ',' + player.y,
      { intervalMs: ctx.intervalMs }, savedName);
    ds.cityContents = cityContents;
    ds.cityShops = cityShops;
    ds.cityWealth = cityWealth;
    return ds;
  }

  // Шаг внутри лабиринта (вызывается dungeon-ui по клавише). Чистая:
  // ds — АРГУМЕНТ, не замыкание; события возврата применяет проводка
  // main.js. null — !ds / inCombat / за границы / стена (mover.step НЕ
  // вызывается); { type: 'combat', group } — группа (wanderStep НЕ
  // вызывается — ранний return); { type: 'moved', chest: null |
  // { gold, item } }. 000177: шага «на выход» НЕТ — шаг на единый
  // тайл входа-выхода = обычный moved; выход — ТОЛЬКО [E]
  // (interactExit, проводка exitLocation main.js).
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
    ds.prevX = ds.x; ds.prevY = ds.y;
    ds.x = nx; ds.y = ny;
    // Глейд prev→next (000068, паттерн мира 000033): ставится ДО
    // проверок моб/сундук — бой начинается с клетки, к которой игрок
    // ДОХОДИТ глейдом. Заблокированные шаги (стена/граница) —
    // ранний return выше, мувер не вызывается.
    if (ds.mover) {
      ds.mover.step({ x: ds.prevX, y: ds.prevY }, { x: nx, y: ny }, now);
    }
    return dungeonPostMove(ds);
  }

  function dungeonPostMove(ds) {
    const G = lazyGame();
    const d = ds.dg, c = ds.contents;
    // Блуждающая группа на клетке → бой (startDungeonCombat —
    // проводка).
    const g = c.mobs.find((m) => !m.defeated && m.x === ds.x
      && m.y === ds.y);
    if (g) {
      return { type: 'combat', group: g }; // wanderStep НЕ вызывается
    }
    // Сундук на клетке → открыть (награда — hero/log/hudFlash —
    // проводка; решение D9: применяется ПОСЛЕ этого шага, состояние
    // дизджойнтно, порядок вызовов RNG не меняется).
    let chest = null;
    const ch = c.chests.find((x) => !x.opened && x.x === ds.x
      && x.y === ds.y);
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
  // события возврата — как dungeonMove (moved). 000177: шага «на
  // выход» НЕТ — шаг на дверь = обычный moved; выход — ТОЛЬКО [E]
  // (interactExit, проводка exitLocation main.js).
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
    ds.prevX = ds.x; ds.prevY = ds.y;
    ds.x = nx; ds.y = ny;
    // Глейд prev→next (000068, паттерн dungeonMove): шаг ДО конца.
    if (ds.mover) {
      ds.mover.step({ x: ds.prevX, y: ds.prevY }, { x: nx, y: ny }, now);
    }
    return { type: 'moved' };
  }

  // 000177/000153.03: ЕДИНСТВЕННЫЙ доменный решатель «что делает [E]
  // на этой клетке» (клавиша/тач/debug → locationOnInteract — три
  // канала, один код). События (клетки взаимоисключаются —
  // stairsDown ≠ exit по построению, 000153.02 — max BFS-дистанции):
  //   { type: 'exit', name }  — на d.exit: город / подземелье
  //                             depth=1 (БИТ-В-БИТ текущее
  //                             поведение; exit-ПЕРВЫМ);
  //   { type: 'ascend' }      — на d.exit, подземелье depth>1
  //                             (подъём на depth−1, 000153.03);
  //   { type: 'descend' }     — на d.stairsDown (только подземелье;
  //                             спуск на depth+1, 000153.03);
  //   null                    — !ds / !ds.dg / kind вне {city,
  //                             dungeon} / герой вне обеих клеток /
  //                             stairsDown null (fail-open 000153.02
  //                             — дегенеративная форма без лестницы).
  // Чистая: без мутаций, без RNG, без мувер'ов; name: город —
  // ds.name, подземелье — DUNGEON_NAMES[type] (та же строка, что в
  // flash). Проводка (exitLocation/transitionFloor, день, UI, сейв) —
  // main.js.
  function interactExit(ds) {
    if (!ds || !ds.dg) return null;
    if (ds.kind !== 'city' && ds.kind !== 'dungeon') return null;
    const d = ds.dg;
    if (ds.x === d.exit.x && ds.y === d.exit.y) {
      const depth = (Number.isInteger(d.depth) && d.depth >= 1)
        ? d.depth : 1;
      if (ds.kind === 'dungeon' && depth > 1) return { type: 'ascend' };
      return { type: 'exit', name: ds.kind === 'city'
        ? ds.name : dungeonName(d) };
    }
    // 000153.03: лестница вниз (только подземелье; null — fail-open
    // 000153.02 §4 — дегенеративная форма без лестницы). kind-гард
    // обязателен: у layout города stairsDown/depth — нет, но
    // тестовые/дегенеративные city-фикстуры могут нести чужие поля.
    if (ds.kind === 'dungeon' && d.stairsDown &&
        ds.x === d.stairsDown.x && ds.y === d.stairsDown.y) {
      return { type: 'descend' };
    }
    return null;
  }

  // 000153.03 (D3): запись памяти этажа — ВЫНЕСЕНА из exitDungeon
  // (поведение БИТ-В-БИТ: тот же ключ, та же форма записи, тот же
  // обход memoryBanned). opts = { day, memory }.
  // Ключ — вход + глубина (ТОТ ЖЕ источник, что maybeEnterDungeon:
  // dungeonMemoryKey + инлайн-fallback). ds.dg.depth — поле
  // createDungeon (debug-вход — дефолт 1).
  // Ревью 000153.01: debug-вход с вынужденным terrain ≠ тайла —
  // память НЕ пишется (memoryBanned, debugEnterDungeon): запись
  // под мирским ключом переживёт перезагрузку (секция
  // dungeonMemory) и сломает мирской вход на тот же тайл.
  function writeFloorMemory(ds, opts) {
    const G = lazyGame();
    const depth = ds.dg && Number.isInteger(ds.dg.depth) && ds.dg.depth >= 1
      ? ds.dg.depth : 1;
    const memKey = G && typeof G.dungeonMemoryKey === 'function'
      ? G.dungeonMemoryKey(ds.worldKey, depth)
      : ds.worldKey + ':' + depth;
    if (!ds.memoryBanned) {
      opts.memory.set(memKey,
        { contents: ds.contents, lastVisitDay: opts.day });
    }
  }

  // 000157.03: [E] на залежи — доменное событие «собери» (чистая:
  // без мутаций, без rng; null — !ds / !ds.dg / не-dungeon / нет
  // НЕСобранной залежи под ногами). СОБРАННАЯ не рисуется (000157.02)
  // → no-op, как «пустая клетка». Развод [E] (выход vs залежь) — НЕ
  // на уровне функций (независимы; конфликт исключён по построению —
  // залежь ≠ выходная клетка), а проводкой locationOnInteract (порядок
  // if-веток: выход > город > залежь > no-op).
  function interactDeposit(ds) {
    if (!ds || !ds.dg || ds.kind !== 'dungeon') return null;
    const deps = (ds.contents && Array.isArray(ds.contents.deposits))
      ? ds.contents.deposits : [];
    const dp = deps.find((x) => x && !x.gathered
      && x.x === ds.x && x.y === ds.y);
    if (!dp) return null;
    return { type: 'deposit', id: dp.id };
  }

  // Выход из подземелья: доменная семантика (D5) — подземелье тратит
  // ДЕНЬ (SPEC «Игровое время») и пишется память содержимого.
  // dungeonState=null / dungeonUI.close() / saveNow() — проводка
  // (exitLocation в main.js).
  function exitDungeon(ds, opts) {
    const o = opts || {};
    // 000153.03 (D3): запись — writeFloorMemory (вынесена, бит-в-бит).
    writeFloorMemory(ds, o);
    o.clock.event('dungeon'); // вылазка забирает день (SPEC «Игровое время»)
  }

  // 000153.03 (D2.3): сборка ОДНОГО этажа для ПЕРЕХОДОВ (спуск/
  // подъём). maybeEnterDungeon НЕ рефакторится под этот помощник —
  // мирской вход (визит из мира) — самое пинаное поведение проекта;
  // 15 строк дублирования дешевле риска (контракт §D2.3).
  // { wx, wy, terrain, depth, worldKey, ctx, logLine } → ds | null.
  // layout — createDungeon (бит-в-бит по (wx, wy, пиксели, terrain,
  // depth)); содержимое — из dungeonMemory (worldKey+глубина,
  // 000153.01), иначе детерминированная регенерация; valid-память —
  // REUSE того же live-объекта (+ продление lastVisitDay, как
  // мирской вход). logLine — строка лога НОВОГО этажа («Спуск:
  // глубина N.» / «Подъём: глубина N.», D2/D7 — НЕ «: вход.»).
  // Ошибки — отсутствующие Game-API (console.error + null;
  // деградация 000053; в браузере недостижимо — index-order).
  function buildFloor(o) {
    const G = lazyGame();
    if (!G || typeof G.createDungeon !== 'function') {
      console.error('locations.js: Game.createDungeon отсутствует ' +
        '(src/dungeon.js должен грузиться ДО src/locations.js, ' +
        '000127) — этаж не построен');
      return null;
    }
    const d2 = G.createDungeon(o.wx, o.wy, o.ctx.mapPixels,
      o.terrain, o.depth);
    // Ключ памяти — вход + глубина (Тот же источник, что
    // maybeEnterDungeon: dungeonMemoryKey + инлайн-fallback).
    const memKey = G.dungeonMemoryKey
      ? G.dungeonMemoryKey(o.worldKey, o.depth)
      : o.worldKey + ':' + o.depth;
    const saved = o.ctx.memory.get(memKey);
    // Содержимое живёт, пока внутри + dungeon_memory_days (SPEC).
    let contents = null;
    if (saved) {
      if (typeof G.contentValid === 'function') {
        contents = G.contentValid(saved.lastVisitDay, o.ctx.day)
          ? saved.contents : null;
      } else {
        console.error('locations.js: Game.contentValid отсутствует ' +
          '(src/dungeon.js должен грузиться ДО src/locations.js, ' +
          '000127) — содержимое будет пересоздано');
      }
    }
    if (!contents) {
      if (typeof G.generateDungeonContents === 'function') {
        // 000157.02: реальная глубина этажа — d2.depth (КАНОНИЧЕСКИЙ
        // вызов, тот же, что maybeEnterDungeon: формулы залежей
        // nDeposits/T/amount работают от него). Review-фикс: без
        // opts ЛЮБАЯ регенерация этажа depth>=2 (первый спуск,
        // expired-память) давала залежи depth=1 (другой rng_dep-
        // поток, T1-only, 1 залежь) — асимметрия с мирским входом.
        contents = G.generateDungeonContents(d2, o.ctx.hero,
          { depth: d2.depth });
      } else {
        console.error('locations.js: Game.generateDungeonContents ' +
          'отсутствует (src/dungeon.js должен грузиться ДО ' +
          'src/locations.js, 000127) — этаж не построен');
        return null;
      }
    }
    const ds2 = makeDungeonState(d2, contents, o.worldKey,
      { intervalMs: o.ctx.intervalMs });
    // Переход — не вход из мира: строка «…: вход.» makeDungeonState
    // ЗАМЕНЯЕТСЯ (D2) — единая формулировка с flash (D7).
    ds2.log = [o.logLine];
    if (saved) saved.lastVisitDay = o.ctx.day; // продлить память
    return ds2;
  }

  // 000153.03 (D2/D3): СПУСК — [E] на stairs-down: этаж depth+1.
  // Спавн — на клетке-выходе НОВОГО этажа (= entrance, 000177;
  // makeDungeonState САМ спавнит на entrance — re-anchor НЕ нужен;
  // entrance гарантированно свободен: safe-зона 5×5, все глубины,
  // 000153.02). terrain — тайла-пещеры (player в мире НЕ двигается
  // во время вылазки → terrain детерминирован; определяет ТИП и
  // РАЗМЕР этажа — dungeonTypeFor, dungeon.js). ДЕНЬ не тратится:
  // clock НЕТУДАРСТВУЕТ (ТЗ пп.1–2; +1 день — только exitDungeon).
  // ctx = { map, mapPixels, player, hero, day, memory, intervalMs }
  // (ТОТА ЖЕ форма, что maybeEnterDungeon).
  // null: memoryBanned (D12 — debug-вход: запись этажа под мирским
  // ключом = контаминация dungeonMemory, прецедент CB-9 000153.01) /
  // отсутствующие Game-API. Мутации при успехе: ТОЛЬКО запись памяти
  // СТАРОГО этажа (ctx.memory) + продление saved.lastVisitDay.
  function descendFloor(ds, ctx) {
    if (!ds || ds.kind !== 'dungeon' || !ctx || !ctx.map ||
        typeof ctx.map.tileAt !== 'function' || !ctx.player ||
        !ctx.memory) return null;
    if (ds.memoryBanned) {
      console.error('locations.js: переход этажей из debug-входа ' +
        '(memoryBanned, 000153.01) запрещён (000153.03 D12) — ' +
        'запись под мирским ключом контаминирует dungeonMemory');
      return null;
    }
    const d = ds.dg;
    const depth = Number.isInteger(d.depth) && d.depth >= 1
      ? d.depth : 1;
    const parts = String(ds.worldKey).split(',');
    const wx = Number(parts[0]), wy = Number(parts[1]);
    const nextDepth = depth + 1;
    // (а) память СТАРОГО этажа — ДО сборки нового (D3): сейв ПОСЛЕ
    // перехода содержит ОБА этажа; инвариант «память этажа пишется
    // при каждом уходе с него».
    writeFloorMemory(ds, { day: ctx.day, memory: ctx.memory });
    // (б) новый этаж — из памяти/детерминированная регенерация.
    return buildFloor({
      wx, wy,
      terrain: ctx.map.tileAt(ctx.player.x, ctx.player.y).terrain,
      depth: nextDepth,
      worldKey: ds.worldKey,
      ctx,
      logLine: 'Спуск: глубина ' + nextDepth + '.',
    });
  }

  // 000153.03 (D2/D10): ПОДЪЁМ — [E] на d.exit (depth>1): этаж
  // depth−1. Спавн — на stairs-down этажа depth−1 (клетка
  // детерминирована сидом — без сохранения позиции, 0 rng,
  // 000153.02) re-anchor-паттерном 000153.01. ГВАРД (D10):
  // stairsDown null / клетка не FLOOR / живой моб на клетке (возможен
  // ТОЛЬКО при depth−1 = 1: content-safe-зона вокруг stairsDown —
  // только depth>1) → console.error + спавн на entrance (fail-open,
  // детерминированно). depth=1 → null (этажа выше нет — выход в
  // мир, exit-ветка). ДЕНЬ не тратится. ctx — как descendFloor.
  function ascendFloor(ds, ctx) {
    if (!ds || ds.kind !== 'dungeon' || !ctx || !ctx.map ||
        typeof ctx.map.tileAt !== 'function' || !ctx.player ||
        !ctx.memory) return null;
    const d = ds.dg;
    const depth = Number.isInteger(d.depth) && d.depth >= 1
      ? d.depth : 1;
    if (depth <= 1) return null;
    if (ds.memoryBanned) {
      console.error('locations.js: переход этажей из debug-входа ' +
        '(memoryBanned, 000153.01) запрещён (000153.03 D12) — ' +
        'запись под мирским ключом контаминирует dungeonMemory');
      return null;
    }
    const parts = String(ds.worldKey).split(',');
    const wx = Number(parts[0]), wy = Number(parts[1]);
    const prevDepth = depth - 1;
    writeFloorMemory(ds, { day: ctx.day, memory: ctx.memory });
    const ds2 = buildFloor({
      wx, wy,
      terrain: ctx.map.tileAt(ctx.player.x, ctx.player.y).terrain,
      depth: prevDepth,
      worldKey: ds.worldKey,
      ctx,
      logLine: 'Подъём: глубина ' + prevDepth + '.',
    });
    if (!ds2) return null;
    // re-anchor (паттерн 000153.01 maybeEnterDungeon :242-249) +
    // ГВАРД D10 (тот же predicate занятости, что projection-тесты).
    const G = lazyGame();
    const d2 = ds2.dg;
    const sd = d2.stairsDown;
    const free = sd &&
      Number.isInteger(sd.x) && Number.isInteger(sd.y) &&
      sd.x >= 0 && sd.y >= 0 && sd.x < d2.width && sd.y < d2.height &&
      !!G && G.CELL_FLOOR !== undefined &&
      d2.cells[sd.y * d2.width + sd.x] === G.CELL_FLOOR &&
      !(ds2.contents && Array.isArray(ds2.contents.mobs)
        && ds2.contents.mobs.some((m) => m && !m.defeated
          && m.x === sd.x && m.y === sd.y));
    if (free) {
      ds2.x = ds2.prevX = sd.x; ds2.y = ds2.prevY = sd.y;
      if (ds2.mover) ds2.mover.teleport(sd.x, sd.y);
    } else {
      console.error('locations.js: клетка stairs-down этажа ' +
        prevDepth + ' недоступна для спавна (null / не FLOOR / ' +
        'занята живым мобом, 000153.03 D10) — спавн на entrance');
    }
    return ds2;
  }

  // 000153.03 (D5, finding G): ОДИН источник строки состояния
  // локации; единственный потребитель — locationLine hud.js
  // (000247: consumer dungeon-ui.js удалён). Чистая: (d, x, y) только. Формат:
  //   (depth>1 ? «Глубина: N\n» : '') + «До выхода: ~M клеток»
  // «Глубина» — ТОЛЬКО depth>1 (depth=1 / нет поля — города,
  // legacy-фикстуры — строки НЕТ: legacy-байты пинов). Тихий гард
  // (нет d / нет d.exit → ''): рендер-пути — без console.error
  // (FOG-B1/B6 errors===0).
  function floorStatusLine(d, x, y) {
    if (!d || !d.exit) return '';
    const dist = Math.abs(x - d.exit.x) + Math.abs(y - d.exit.y);
    const depth = (Number.isInteger(d.depth) && d.depth > 1)
      ? d.depth : 0;
    return (depth ? 'Глубина: ' + depth + '\n' : '') +
      'До выхода: ~' + dist + ' клеток';
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
    // Ревью 000153.01: вынужденный terrain ≠ terrain тайла →
    // подземелье ЧУЖОЙ формы/типа (DUNGEON_SIZE/type другие), а ключ
    // памяти — мирской 'x,y:depth': такая запись переживёт
    // перезагрузку (секция dungeonMemory), и мирской вход на тайл
    // прочитает контент вне своей сетки (позиции > width/height).
    // memoryBanned — exitDungeon (ниже) и activeDungeonMemoryRec
    // (main.js, in-flight-сейв) запись пропускают. Без аргумента /
    // при совпадении — флага НЕТ: контент = как у мирского входа
    // (§5.3, CB-9) — запись остаётся допустимой.
    if (terrain != null && terrain !== t.terrain) ds.memoryBanned = true;
    return ds;
  }

  return {
    makeDungeonState, makeCityState,
    maybeEnterDungeon, maybeEnterCity,
    exitDungeon, exitCity,
    dungeonMove, cityMove, dungeonPostMove,
    interactExit,
    // 000153.03: переходы этажей (только подземелье) + единая
    // строка состояния (finding G).
    descendFloor, ascendFloor,
    floorStatusLine,
    // 000157.03: 11-й экспорт — [E] на залежи (доменное событие).
    interactDeposit,
    debugEnterDungeon,
  };
});

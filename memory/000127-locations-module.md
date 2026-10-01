# 000127: src/locations.js — домен «состояние подземелья/города» (контракт)

Станция Проектирование, 2026-10-01. Базовый master 6874050 (worktree
task-000127, ветка task/000127). Базовый прогон: 1200/1200 зелёных
(46.3 c, exit 0 — замерено на станции). Все имена/строки сверены с
актуальным кодом (мастер ушёл от плана 2026-09-30: смержены
000075/000076/000100, ренеймов не было). Разделы «фактический замер» —
дописать на стадии реализации. Сёстры: 000128 (building-actions.js),
000129 (hud.js), 000130 (вкладки ui.js). Общий план —
memory/main-js-split-plan.md.

## 1. Что перенесено/создано

НОВЫЙ модуль `src/locations.js` (UMD, `Game.locations` в браузере /
`module.exports` в node). Из `src/main.js` (1979 строк на 6874050)
переносятся (по ИМЕНАМ; строки — на момент 6874050):

| Функция | main.js | Роль |
|---|---|---|
| `makeDungeonState(d, contents, worldKey)` | 1102–1123 | фабрика состояния подземелья |
| `maybeEnterDungeon()` | 1125–1156 | вход на шаге (тайл → лабиринт + содержимое) |
| `exitDungeon()` | 1203–1210 | выход: память содержимого + день |
| `dungeonMove(dx, dy)` | 1212–1265 | шаг в лабиринте (стены/выход/моб/сундук/wanderStep) |
| `makeCityState(layout, buildingRec, worldKey)` | 1282–1306 | фабрика состояния города |
| `maybeEnterCity()` | 1311–1330 | вход в город на шаге |
| `exitCity()` | 1332–1338 | выход (БЕЗ дня/памяти) |
| `cityMove(dx, dy)` | 1340–1363 | шаг в городе (без мобов/сундуков) |
| тело `__game.actions.enterDungeon(terrain)` | 1913–1934 | отладочный вход (→ `debugEnterDungeon`) |

Сноски блоков уходят вместе с кодом: `// --- Подземелье ---` + коммент
формы (1091–1101), `// --- Город (задача 000105, …) ---` + комменты
(1266–1278). Итого ~249 строк чистого блока.

НЕ переносится (остаётся в main.js, регионы НЕ ТРОГАТЬ):
* `startDungeonCombat(g)` (1158–1201) — боевая проводка (combatUI,
  `currentBuffMods()` 000076, `hero`, `saveNow`, `G.dungeonUI.render`);
  не в списке функций ТЗ. Читает `dungeonState` через переменную
  main.js — как раньше.
* `MOVE_INTERVAL_MS` (59–62) + `stepIntervalMs()` (70–75) + мировой
  мувер (227–230) — общее с циклом шагов мира.
* `hudUpdate` (1602–1703) — 000129; `toggleNpcDialog`/`onBuildingAction`
  + keydown-гарды `dungeonUI.isActive` (869–885, 919–942) — 000128.
* Объявления `let dungeonState` (584) / `const dungeonMemory` (585) +
  коммент формы (578–583) — ВЛАДЕНИЕ проводкой.
* `collectSaveData`/`saveNow` (307–339) — сейв-механика.

## 2. Разграничение «чистое vs проводка» (финальное)

ЧИСТОЕ (`src/locations.js`, экспорт, node-тесты):
* фабрики `makeDungeonState` / `makeCityState` — форма ds, мувер
  (ленивый `G.createMover`), защитный снап, `ds.pos(now)`;
* логика входа `maybeEnterDungeon` / `maybeEnterCity` — гарды тайла
  (вход пещеры + развалины 48 / город по каталогу), `G.createDungeon`,
  `dungeonMemory` (.get / продление `lastVisitDay`), `G.contentValid`,
  `G.generateDungeonContents`, порядок вызовов Game-функций СОВЕРШЕННО
  как в main.js (детерминизм: ноль новых RNG, те же вызовы в том же
  порядке);
* логика шага/выхода ОТ ПЕРЕДАНОГО СОСТОЯНИЯ `dungeonMove` /
  `cityMove` — гарды, границы, стены, выходная клетка, `mover.step`
  ДО конца (глейд 000068), поиск моба, `G.openChest` (мутирует
  contents), `G.wanderStep` (ровно раз на успешный шаг) — события
  возврата (см. §4);
* логика выхода `exitDungeon` / `exitCity` — доменная семантика:
  подземелье тратит ДЕНЬ (`clock.event('dungeon')`) и пишется
  `memory.set`; город — ничего (инварианты 000105/000109 в одном
  месте, закрывается тестами);
* `debugEnterDungeon` — тело отладочного входа (Решение D8).

ПРОВОДКА (остаётся в main.js, §5 — точный код):
1. `dungeonState` / `dungeonMemory` — владение переменными;
2. `G.dungeonUI.start` (3 точки 1146/1321/1924 схлопнуты в ОДИН
   helper `startLocationUI(onMove)`) и `G.dungeonUI.close` (в
   `exitLocation`);
3. `saveNow()` — точки НЕ меняются: frame-цикл (после входа, 1730),
   exitDungeon, exitCity; НЕТ saveNow в ветке сундука (как сейчас);
4. `hudFlash` / `hudFlashUntil` — строки СЛОВО В СЛОВО:
   `'Вы вышли из ' + <имя> + '.'`, `'Сундук: +' + gold + ' золота' +
   itemMsg`; `hudFlashUntil = performance.now() + 5000`;
5. `startDungeonCombat(ev.group)` — по событию 'combat';
6. сундук: `hero.gold += r.gold`, `G.getItem` / `G.addItem(hero, …)`,
   `itemMsg`-строки, `ds.log.push(msg)` — строка пишется РЯДОМ с
   hudFlash (как сейчас, в одном месте проводки);
7. `G.playerUI && G.playerUI.render()` после сундука (как сейчас);
8. `MOVE_INTERVAL_MS` — передаётся модулю значением
   (`ctx.intervalMs` / `env.intervalMs`);
9. новые: `enterLocation()` (frame-цикл), `exitLocation(ds)`,
   `dungeonOnMove` / `cityOnMove` (onMove-обработчики),
   `startLocationUI(onMove)`; debug-акция — одна строка вызова модуля.

## 3. Решения (openQuestions ТЗ + аналитик) — решение — почему

D1. **`MOVE_INTERVAL_MS` остаётся в main.js**, фабрики/входы получают
интервал ПАРАМЕТРОМ (`env.intervalMs` / `ctx.intervalMs`). — Условие ТЗ
«если используется только здесь» НЕ выполняется: константа ещё в
`stepIntervalMs` (72/74) и мировом мувере (229); плюс фиксатор
tests/global-settings.test.js (277–294) требует в ТЕКСТЕ main.js строк
`GlobalSettings` / `move_interval_ms`. Единый источник — main.js
(000063), дублирования фолбэка 140 в модуле нет.

D2. **Имя пространства — `Game.locations` (строчное).** — Ближайший
прецедент buildingEffects (000071 — «самый чистый» UMD по плану) и
все функциональные модули строчные (buildingUI/playerUI/npcUI/
combatInternals); заглавные — data-каталоги/настройки (Cities,
GlobalSettings, DUNGEON_NAMES). Коллизий нет (grep src/index.html/
tests — пусто).

D3. **Движение — ВОЗВРАТ СОБЫТИЙ (чистые функции), не ctx-колбэки.**
`dungeonMove/cityMove` возвращают `null | {type:'exit'|'combat'|
'moved', …}`; `maybeEnter*` возвращают `ds | null`. — UI/состояние
(dungeonUI, saveNow, hudFlash, hero) остаются проводкой main.js (ТЗ:
«присвоение dungeonState, hudFlash-сообщения» — проводка); node-тесты
без моков колбэков; прецедент building-effects (apply возвращает —
main.js применяет).

D4. **`G.dungeonUI.start` — проводка (helper `startLocationUI(onMove)`
в main.js), не модуль.** — УИ не входит в домен; 3 точки вызова
схлопываются в одну; модуль остаётся свободным от УИ (vm-песочницы,
node). `onMove` выбирает проводка по `ds.kind` в момент входа.

D5. **`clock.event('dungeon')` + `memory.set` — в модуле
(`exitDungeon(ds, {day, memory, clock})`).** — «подземелье тратит день
и помнит содержимое, город — нет» — ДОМЕННАЯ инварианта 000105/000109,
живёт в одном месте и закрывается RED-тестами (LOC-7/LOC-10);
проводка делает только state=null/close/saveNow.

D6. **`exitCity` — no-op маркер с комментом инварианты.** —
симметричный API, семантика «без дня/без памяти» видна в домене,
тестируется (LOC-10).

D7. **ctx — НОВЫЙ явный объект в каждой точке вызова, НЕ постоянный
`locCtx` с геттерами.** — Явные зависимости (тестируемость), нет
скрытых биндингов `let` main.js (map/mapPixels/zoom/spriteLoader —
null/старт-значения до инициализации), значения свежие на момент
вызова (`day: clock.day`), код — 2 строки на точку.

D8. **Тело `__game.actions.enterDungeon` переносится в модуль как
`debugEnterDungeon(ctx, terrain)`.** — Коммент ТЗ 1099–1101 «ОДИН
хелпер на ОБА входа»: оба конструктора входа в одном доменном файле;
акция main.js — ~9 строк проводки; dungeonMemory НЕ consulted (как
сейчас).

D9. **Осознанное безопасное переупорядочивание: применение наград
сундука (hero/log/hudFlash/playerUI) теперь ПОСЛЕ `G.wanderStep`**
(в main.js — ДО). — Состояния дизджойнтные: wanderStep мутирует
`contents.mobs` + `contents.step`, награды мутируют hero/log/
hudFlash — ничего не читается в обе стороны; RNG в промежутке НЕТ
(openChest без RNG, wanderStep — СОБСТВЕННЫЙ детерминированный поток
`mulberry32(hash2(contents.step, seed, 0x7777))`, КОЛИЧЕСТВО вызовов
не меняется — ровно раз на успешный шаг); HUD перерисовывается
следующим кадром. Наблюдаемого отличия нет; зафиксировано здесь и в
отчёте.

D10. **Гард `if (dungeonState) return` — в проводке
(`enterLocation`, debug-акция).** — Переменная владение проводки
(ТЗ: «присвоение dungeonState» — проводка); модуль предпологает, что
не в локации (контракт §4).

D11. **`tileAt` вызывается внутри модуля в каждой maybeEnter\***
(как сейчас — по одному в каждой функции; при промахе по подземелью —
2 вызова, как сейчас). — Структура кода 1:1; tileAt кэширован
(000019) и детерминирован — наблюдаемого отличия нет.

D12. **`env.intervalMs` — ОБЯЗАТЕЛЕН; отсутствует → `console.error` +
`ds.mover = null`** (та же деградация, что без motion.js; `ds.pos`
падает в `{x, y}`). — Единственный источник интервала — main.js;
скрытый фолбэк 140 в модуле не дублируется (аудит 000053).

D13. **Деградация имени подземелья: `Game.DUNGEON_NAMES` отсутствует →
`console.error` + фолбэк-литерал `'подземелье'`.** — Паттерн 000053
(fallback-литералы, прецедент building-effects); недостижимо в
браузере (dungeon.js пинан ДО).

## 4. API модуля (контракт — для 000128/000129, волн 000107/000109/
000110 и dungeon-задач)

Экспорт (9 функций):
```
L = require('../src/locations.js')          // node
root.Game = Object.assign({}, G0, { locations: factory() })  // браузер
L = { makeDungeonState, makeCityState, maybeEnterDungeon,
      maybeEnterCity, exitDungeon, exitCity, dungeonMove,
      cityMove, debugEnterDungeon }
```

Форма ds — НЕ МЕНЯЕТСЯ (инвариант сейва/HUD/`__game.dungeon`/тестов),
литерал повторяется ПОЛЕ-В-ПОЛЕ в том же порядке:
```
makeDungeonState(d, contents, worldKey, env) → ds
  env = { intervalMs }
  ds = { dg: d, contents, kind: 'dungeon',
         x: d.entrance.x, y: d.entrance.y,
         prevX: d.entrance.x, prevY: d.entrance.y,
         worldKey,
         log: [DUNGEON_NAMES[d.type] + ': вход.'] }   // D13 при отсутствии
  ds.mover = G.createMover ? G.createMover({ x: d.entrance.x,
      y: d.entrance.y, intervalMs: env.intervalMs }) : null   // D12
  if (ds.mover) ds.mover.teleport(d.entrance.x, d.entrance.y)
  ds.pos = (now) => (ds.mover ? ds.mover.position(now)
                              : { x: ds.x, y: ds.y })
makeCityState(layout, buildingRec, worldKey, env) → ds
  name = (buildingRec.особые_параметры &&
          buildingRec.особые_параметры.название_карты)
         || buildingRec.название
  ds = { dg: layout, contents: null,   // город пуст (000106)
         kind: 'city', name,
         x/y/prevX/prevY: layout.entrance,
         worldKey, log: [name + ': вход.'] }
  + mover/pos — то же, что makeDungeonState
```

Входы (предусловие: НЕ в локации — гард держит проводка, D10):
```
maybeEnterDungeon(ctx) → ds | null
  ctx = { map, mapPixels, player, hero, day, memory, intervalMs }
  t = ctx.map.tileAt(ctx.player.x, ctx.player.y)   // D11
  гард (порядок/литералы НЕ менять, fail-open 000073):
    if (!t.hasBuilding || t.building !== CAVE_ENTRANCE
        || t.buildingId === 48) return null
  worldKey = player.x + ',' + player.y
  d = G.createDungeon(player.x, player.y, ctx.mapPixels, t.terrain)
  saved = ctx.memory.get(worldKey)
  contents = saved && G.contentValid(saved.lastVisitDay, ctx.day)
             ? saved.contents : null
  if (!contents) contents = G.generateDungeonContents(d, ctx.hero)
  ds = makeDungeonState(d, contents, worldKey, { intervalMs: ctx.intervalMs })
  if (saved) saved.lastVisitDay = ctx.day          // продлить память
  return ds
  // Порядок Game-вызовов = main.js:1127–1145 дословно.
maybeEnterCity(ctx) → ds | null   // тот же ctx
  t = ctx.map.tileAt(player.x, player.y)
  if (!t.hasBuilding || t.buildingId == null) return null   // == (loose) — как сейчас
  rec = G.getBuilding(t.buildingId)
  if (!rec || rec.категория !== 'город') return null
  [ax, ay] = t.buildingAnchor
  layout = G.Cities.createCityLayout(ax, ay, rec.размер.ширина)
  return makeCityState(layout, rec, player.x + ',' + player.y,
                       { intervalMs: ctx.intervalMs })
```

Шаги (чистые; ds — АРГУМЕНТ, не замыкание):
```
dungeonMove(ds, dx, dy, now, { inCombat }) → null | event
  null — !ds / inCombat / за границы / стена (mover.step НЕ вызывается)
  { type: 'exit', name: dungeonName(ds.dg) }   // позиция НЕ сдвинута
  // иначе: ds.prevX/prevY = ds.x/y; ds.x/y = nx/ny;
  // if (ds.mover) ds.mover.step({prev}, {next}, now)   // глейд ДО конца (000068)
  g = ds.contents.mobs.find(!defeated && on (nx,ny))
  → { type: 'combat', group: g }        // wanderStep НЕ вызывается (ранний return)
  ch = ds.contents.chests.find(!opened && on (nx,ny))
  r = ch ? G.openChest(ds.contents, ch.id) : null
  chest = (ch && r && r.ok) ? { gold: r.gold, item: r.item } : null
  G.wanderStep(ds.contents, ds.dg)      // ровно раз на успешный шаг
  → { type: 'moved', chest }
cityMove(ds, dx, dy, now, { inCombat }) → null | event
  null — !ds / ds.kind !== 'city' / inCombat / за границы / стена
         (kind-гард — в том же месте логики, что main.js:1344)
  { type: 'exit', name: ds.name } | { type: 'moved' }
  // мобов/сундуков/wanderStep в городе НЕТ (пусто до 000106)
```

Выходы:
```
exitDungeon(ds, { day, memory, clock }) → void
  memory.set(ds.worldKey, { contents: ds.contents, lastVisitDay: day })
  clock.event('dungeon')      // вылазка забирает день (SPEC «Игровое время»)
  // (dungeonState=null / dungeonUI.close() / saveNow() — проводка, §5)
exitCity(ds) → void           // no-op: БЕЗ clock.event, БЕЗ memory (D5/D6)
```

Отладочный вход (D8):
```
debugEnterDungeon(ctx, terrain) → ds | null
  ctx = { map, mapPixels, player, hero, intervalMs }
  t = ctx.map.tileAt(player.x, player.y)
  d = G.createDungeon(player.x, player.y, ctx.mapPixels,
        terrain != null ? terrain : t.terrain)
  ds = makeDungeonState(d, G.generateDungeonContents(d, ctx.hero),
        player.x + ',' + player.y, { intervalMs })
  return ds   // dungeonMemory НЕ consulted (как сейчас); state/оверлей — проводка
```

Деградации (паттерн 000053/000071 — `console.error` + деградация, игра
НЕ падает; все недостижимы в браузере — пины index-order):
* `maybeEnterDungeon`: нет `ctx.map` / `BUILDING_TYPES.CAVE_ENTRANCE` /
  `createDungeon` / `generateDungeonContents` → console.error + null
  (вход не открывается, мир продолжается). Нет `contentValid` →
  console.error + contents = null (пересоздание).
* `maybeEnterCity`: нет `getBuilding` / `Cities.createCityLayout` →
  console.error + null.
* фабрики: нет `createMover` / `env.intervalMs` → `ds.mover = null`
  (деградация рендера, `ds.pos` — `{x, y}`) — как в main.js сейчас.
* `dungeonMove`: нет `CELL_FLOOR` → console.error + null (шаг
  заблокирован); нет `openChest`/`wanderStep` → console.error +
  пропуск (шаг завершается).
* console.error — только в момент ВЫЗОВА, НИКОГДА при загрузке
  (vm-тесты утверждают 0 ошибок загрузки).

## 5. Проводка main.js (замена удалённых блоков — точный код)

Размещение: на месте старого блока 1091–1156 (после ВСЕХ используемых
объявлений: MOVE_INTERVAL_MS 59, hero 196, map/mapPixels 193/195,
zoom 218, clock 240, dungeonState/dungeonMemory 584/585, saveNow 337 —
function-декларации хоистятся). `startDungeonCombat` (1158–1201)
остаётся на месте; блоки 1203–1265 и 1266–1363 удаляются.

```
// --- Подземелье/город (задача 000127): домен — src/locations.js ---
// Проводка: владение dungeonState/dungeonMemory, оверлей, saveNow,
// flash-строки СЛОВО В СЛОВО, бой — startDungeonCombat (ниже).
function enterLocation() {
  if (dungeonState) return;
  const L = G.locations;
  if (!L) {
    console.error('main.js: Game.locations отсутствует — ' +
      'src/locations.js обязан грузиться ДО src/main.js (000127)');
    return;
  }
  const ctx = { map, mapPixels, player, hero, day: clock.day,
    memory: dungeonMemory, intervalMs: MOVE_INTERVAL_MS };
  const ds = L.maybeEnterDungeon(ctx) || L.maybeEnterCity(ctx);
  if (ds) {
    dungeonState = ds;
    startLocationUI(ds.kind === 'city' ? cityOnMove : dungeonOnMove);
  }
}
function startLocationUI(onMove) {
  G.dungeonUI.start({
    get state() { return dungeonState; },
    onMove,
    // ОДИН общий zoom (задача 000066): колесо поверх оверлея меняет
    // тот же zoom, что мир (мировой слушатель на #game накрыт) —
    // hudUpdate («Масштаб: Xpx») остаётся корректным без изменений.
    zoom,
    onZoom: (z) => { zoom = z; },
    spriteLoader,
  });
}
function exitLocation(ds) {
  if (ds.kind === 'city') G.locations.exitCity(ds);
  else G.locations.exitDungeon(ds, { day: clock.day,
    memory: dungeonMemory, clock });
  dungeonState = null;
  G.dungeonUI.close();
  saveNow();
}
function dungeonOnMove(dx, dy) {
  const ds = dungeonState;
  if (!ds) return;
  const ev = G.locations.dungeonMove(ds, dx, dy, performance.now(),
    { inCombat: !!(G.combatUI && G.combatUI.isActive()) });
  if (!ev) return;
  if (ev.type === 'exit') {
    exitLocation(ds);
    hudFlash = 'Вы вышли из ' + ev.name + '.';
    hudFlashUntil = performance.now() + 5000;
    return;
  }
  if (ev.type === 'combat') { startDungeonCombat(ev.group); return; }
  const chest = ev.chest;
  if (chest) {
    hero.gold += chest.gold;
    // Предмет в сундуке — id из каталога (assets/items) → в инвентарь.
    let itemMsg = '';
    if (chest.item) {
      const it = G.getItem(chest.item);
      const add = G.addItem(hero, chest.item);
      itemMsg = add.ok
        ? ', ' + it.name
        : ' (инвентарь полон: ' + it.name + ' потерян)';
    }
    const msg = 'Сундук: +' + chest.gold + ' золота' + itemMsg;
    ds.log.push(msg);
    hudFlash = msg;
    hudFlashUntil = performance.now() + 5000;
    G.playerUI && G.playerUI.render();
  }
}
function cityOnMove(dx, dy) {
  const ds = dungeonState;
  if (!ds) return;
  const ev = G.locations.cityMove(ds, dx, dy, performance.now(),
    { inCombat: !!(G.combatUI && G.combatUI.isActive()) });
  if (!ev || ev.type !== 'exit') return;
  exitLocation(ds);
  hudFlash = 'Вы вышли из ' + ev.name + '.';
  hudFlashUntil = performance.now() + 5000;
}
```

Frame-цикл (1728–1729 → одна строка на той же позиции):
```
        enterLocation(); // 000127: домен — src/locations.js (подземелье/город)
```
(семантика 1:1: dungeon приоритетнее — при успехе maybeEnterDungeon
maybeEnterCity не вызывается, как раньше умирала на `if (dungeonState)
return`).

Debug-акция (1913–1934 → проводка):
```
      enterDungeon: (terrain) => {
        if (dungeonState || !G.locations) return null;
        // Тот же хелпер, что maybeEnterDungeon (000068): одна форма
        // состояния (000127: домен — src/locations.js).
        const ds = G.locations.debugEnterDungeon(
          { map, mapPixels, player, hero, intervalMs: MOVE_INTERVAL_MS },
          terrain);
        if (!ds) return null;
        dungeonState = ds;
        startLocationUI(dungeonOnMove);
        return ds;   // = dungeonState (как раньше)
      },
```

## 6. UMD-паттерн (src/locations.js)

```
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();               // node: НОЛЬ require (000053/000071)
  } else {
    const G0 = typeof root.Game === 'object' ? root.Game : {};
    root.Game = Object.assign({}, G0, { locations: factory() });
  }
})(typeof globalThis !== 'undefined' ? globalThis : self, function () {
  'use strict';
  function lazyGame() {   // прецедент building-effects 000071/000076
    return typeof globalThis !== 'undefined' ? globalThis.Game : null;
  }
  // все Game-функции — лениво в момент ВЫЗОВА: createMover, DUNGEON_NAMES,
  // CELL_FLOOR, contentValid, generateDungeonContents, createDungeon,
  // openChest, wanderStep, BUILDING_TYPES, getBuilding,
  // Cities.createCityLayout.
  return { …9 функций… };
});
```
* НОЛЬ require во ВСЁМ файле (структурный ассерт LOC-2).
* БЕЗ снапшота Game при загрузке (000038 — сильнее, чем «один раз»):
  полностью лениво; загрузка чистая — 0 исключений, 0 console.error
  (vm-цепочки city-screen/main-visuals/save-restore/building-effects/
  sprites подхватят тег через CHAIN из index.html АВТОМАТИЧЕСКИ —
  правок этих тестов НЕТ).
* node-тесты: `globalThis.Game = fake` с finally-restore (паттерн
  `withGame` tests/building-effects.test.js:877–887).

## 7. index.html + pin

Слот: НОВЫЙ тег сразу ПОСЛЕ `<script src="src/cities.js"></script>`
(текущая строка 407), ДО `src/dungeon-ui.js` (432) и `src/main.js`
(436) + 2 строки коммента (по образцу соседей):
```
  <script src="src/cities.js"></script>
  <!-- Локации (задача 000127, разбиение main.js): состояние и
       переходы подземелья/города. После dungeon.js/cities.js
       (доменная группа), ДО main.js (UMD-ловушка 000038: main.js
       снимает Game ОДИН раз — const G = globalThis.Game). Чистый
       модуль — ноль зависимостей в момент загрузки (000053/000071),
       Game-функции лениво в момент вызова. -->
  <script src="src/locations.js"></script>
```
Почему: ТЗ «ПОСЛЕ cities.js и dungeon.js, ДО main.js»; ДО main.js —
ОБЯЗАТЕЛЬНО (иначе `G.locations` в снапшоте main.js undefined
навсегда); группировка dungeon.js → cities.js → locations.js держит
домен вместе; слот не смещает другие теги. ВАЖНО: motion.js в
index.html стоит ПОЗЖЕ locations.js (перед main.js) — безопасно:
locations.js читает `G.createMover` лениво в момент вызова.

Pin — tests/index-order.test.js:
1. НОВЫЙ тест ORD-1:
```
test('index.html: src/locations.js подключён; dungeon.js → locations.js, cities.js → locations.js → main.js (задача 000127)', () => {
  assert.notEqual(pos('src/locations.js'), -1, '…не подключён…');
  assert.ok(pos('src/dungeon.js') < pos('src/locations.js'), '…');
  assert.ok(pos('src/cities.js') < pos('src/locations.js'), '…');
  assert.ok(pos('src/locations.js') < pos('src/main.js'), '…');
});
```
2. В список «нужные модули подключены» (33–48) добавить
`'src/locations.js'` (технический пин присутствия).

## 8. Инварианты (рефакторинг БЕЗ смены поведения)

* Детерминизм: в locations.js НЕТ Math.random/mulberry32/hash2/
  generateSeedPixels (структурный ассерт LOC-2/LOC-4). Game-вызовы —
  те же, тот же порядок: createDungeon → memory.get → contentValid →
  generateDungeonContents → фабрика → продление lastVisitDay (вход);
  mover.step → mob → openChest → wanderStep (шаг). Свой поток у
  createDungeon (seed от позиции/пикселей/terrain), generateDungeon
  Contents (totalXp), wanderStep (contents.step), createCityLayout
  (якорь) — независимы, вызовы в тех же местах.
* Сейвы: `collectSaveData` НЕ содержит dungeonState (проверено) —
  формат localStorage не меняется; `dungeonMemory` — session-only Map
  (в сейв не сериализуется); форма ds (worldKey/prevX/prevY/…) —
  поле-в-поле. Точки `saveNow()` — те же: frame (после входа),
  exitDungeon, exitCity; НЕТ в ветке сундука.
* HUD — побайтово: `hudUpdate` НЕ правится (000129); flash-строки и
  строки `ds.log` — дословно; `hudFlashUntil = performance.now() +
  5000` — дословно.
* [E]-путь: toggleNpcDialog/onBuildingAction (000128) и гарды
  `dungeonUI.isActive` (872/940) — строки НЕ трогаются. Гард
  `combatUI.isActive` в переносимом коде — дословно (первый гард
  dungeonMove/cityMove).
* Порядок: `ctx.dungeonState = ds` (т.е. `dungeonState = ds`) ДО
  `dungeonUI.start` (как сейчас: 1144/1146, 1320/1321, 1921/1924);
  выход: memory.set → clock.event → state=null → close → saveNow
  (dungeon); state=null → close → saveNow (city); шаг: prev → pos →
  mover.step → mob → chest → wanderStep (D9).

## 9. Контракт для будущих задач

* **000128** (building-actions.js): пересечение — НОЛЬ (регионы
  [E]-wiring не трогаются). Если спец-действие со стороны захочет
  открыть подземелье/город — точка входа: `G.locations.maybeEnter*` /
  фабрики (формы ds — §4).
* **000129** (hud.js): `hudUpdate` переезжает в hud.js; читает
  `dungeonState` — форма ds НЕ меняется (инвариант §8), правок модуля
  не потребует. Известный stale-коммент hudUpdate 1658
  («maybeEnterDungeon») — поправить при 000129 (функция уже не в
  main.js).
* **Волны 000107/000109/000110 (города)** правят `makeCityState` /
  `cityMove` / `maybeEnterCity` в locations.js (маленький стабильный
  файл): содержимое города (000106) — расширение `contents`
  (сейчас null), [E]-взаимодействие — спец-обработчики 000128.
* **Dungeon-задачи** — `makeDungeonState` / `dungeonMove` /
  `maybeEnterDungeon` в locations.js.
* Новый kind локации (если появится): фабрика + move + exit в
  locations.js, проводка-обёртка в main.js по образцу
  `startLocationUI`/`exitLocation` (ветка по `ds.kind`).

## 10. Подводные камни

1. **UMD-ловушка 000038 (обратная)**: locations.js ОБЯЗАН стоять ДО
   main.js (снапшот `const G = globalThis.Game` в main.js:13) — pin
   ORD-1.
2. **motion.js грузится ПОСЛЕ locations.js** в index.html —
   `G.createMover` только лениво (фабрики); vm-тест LOC-11 включает
   motion.js в свою цепочку ДО locations.js (безопасно: module чистый).
3. **map/mapPixels — `let`, null до `loadMapPixels().then`** (1963–
   1978): проводка передаёт ТЕКУЩЕЕ значение (`ctx = { map, … }` —
   ссылка на значение на момент вызова); enterLocation исполняется
   только после `tryMove()` (map гарантированно есть), деградация —
   гард в модуле.
4. **`t.buildingId === 48` (развалины, 000073) и `t.buildingId ==
   null` (loose, город)** — литералы/операторы ПОВТОРЯТЬ ДОСЛОВНО
   (fail-open без каталога).
5. **`inCombat` вычисляется проводкой в момент нажатия** и
   передаётся значением — гард в том же логическом месте (первая
   строка move).
6. **wanderStep — КОЛИЧЕСТВО вызовов — детерминизм**: ровно раз на
   успешный dungeon-шаг (в ветках combat/exit — НЕТ); не переносить
   в проводку и не дублировать.
7. **Строковый формат**: `'Вы вышли из ' + name + '.'`, `'Сундук: +'
   + gold + ' золота' + itemMsg`, `name + ': вход.'` — побайтово
   (HUD-ассерты city-screen — фиксаторы).
8. **`__game.dungeon` getter (1821–1847) НЕ трогать** — читает форму
   ds (останется зелёным).

## 11. Ожидаемые дельты по файлам (до реализации)

| Файл | Дельта |
|---|---|
| src/locations.js | НОВЫЙ, ~230–270 строк (блок 229 + UMD-обёртка ~15 + гарды/комменты) |
| src/main.js | 1979 → ~1800–1825 (−155..−180): уходит 249 (1091–1156: 66; 1203–1265: 63; 1266–1363: 98; debug 1913–1934: 22), прирастает проводка ~80 (§5) |
| index.html | +3 строки (тег + 2 коммент) |
| tests/locations.test.js | НОВЫЙ, ~300–400 строк (12 тестов LOC-1..LOC-12) |
| tests/index-order.test.js | +~15 строк (ORD-1 + строка в списке) |
| memory/000127-locations-module.md | НОВЫЙ (этот файл) |
| memory/main-js-split-plan.md | статус 000127 |

ОТКЛОНЕНИЕ от ТЗ «main.js уменьшается ~250–350 строк»: чистый БЛОК
уходит 249 строк (в пределах оценки), но СЕТЕВОЕ уменьшение меньше —
проводка ~+80 строк остаётся в main.js (ТЗ: main.js хранит тонкую
проводку), а `startDungeonCombat` (44 строки, боевая проводка — НЕ в
списке функций ТЗ) и `MOVE_INTERVAL_MS` (~10, условие «только здесь»
не выполняется) НЕ переносятся. Условие «main.js уменьшается»
выполняется; фактический замер — в отчёте (раздел 12).

## 12. RED-план (13 тестов) и фактический замер

RED (до правки): 13 новых тестов падают осмысленно («src/locations.js
не существует» / «Game.locations отсутствует» / «тег не подключён»),
старые 1200 — зелёные БЕЗ правок:
* LOC-1..LOC-12 — tests/locations.test.js (новый; API/UMD-чистота/
  формы фабрик/детерминизм+ноль RNG/стены-границы/exit-клетка+
  memory+clock.event/моб-сундук-wanderStep/cityMove/exitCity без
  дня/vm-реальм Game.locations/полная vm-цепочка);
* ORD-1 — tests/index-order.test.js (пин порядка + присутствие).
После правки: 1200 + 13 = 1213/1213.

Фактический замер (ДОПОЛНИТЬ на стадии реализации):
* `wc -l src/main.js` до: 1979; после: ______ (ожидание ~1800–1825);
* `wc -l src/locations.js`: ______ (ожидание ~230–270);
* итог npm test: ______/______ (ожидание 1213/1213).

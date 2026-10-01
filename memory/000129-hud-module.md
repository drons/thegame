# 000129: src/hud.js — HUD (строки мира/подземелья/города)

Статус: ПРОЕКТИРОВАНИЕ завершено (контракт зафиксирован до кода,
2026-10-02). Реализация — стадии красных/зелёных тестов ветки
task/000129 (worktree .worktrees/task-000129, база master 7564e91 —
после мержа 000128; master на момент анализа = 9a7920d, 000130 уже
смёрджено — §10, п. 11).
План: memory/main-js-split-plan.md (серия 000127 → 000128 → 000129;
000130 — параллельная, ui.js).
Третья из серии разбиения main.js. Рефакторинг БЕЗ смены поведения:
детерминизм (ноль новых RNG), сейвы (не трогаются), HUD-вывод
побайтово (фиксаторы city-screen C1–C5 / building-effects E1–E6 —
зелёные без правок), [E]-путь и гарды — та же семантика.

## 1. Статус / файлы / порядок загрузки / пины

* `src/hud.js` — НОВЫЙ. Чистый UMD по образцу src/building-effects.js
  (обёртка идентична по форме; имя в Game — `hud`, нижний регистр —
  конвенция серии: locations/buildingActions/buildingEffects;
  коллизий нет — проверено grep: `Game.hud`/`G.hud` нигде не
  упоминается; `hud` в main.js — локальный DOM-var L16, в Game не
  живёт):

      (function (root, factory) {
        if (typeof module === 'object' && module.exports) {
          module.exports = factory();
        } else {
          const G0 = typeof root.Game === 'object' ? root.Game : {};
          root.Game = Object.assign({}, G0, { hud: factory() });
        }
      })(typeof globalThis !== 'undefined' ? globalThis : self,
      function () { ... });

  * factory() БЕЗ аргументов, БЕЗ init. В момент загрузки — НОЛЬ
    зависимостей: ни require, ни DOM, ни чтения Game, ни console, ни
    Math.random (000038/000053). vm-цепочки подхватывают скрипт без
    ошибок (HU5: errors.length === 0).
  * Модуль НЕ дотягивается до globalThis.Game ни при загрузке, ни
    при вызове (в отличие от lazyGame-паттерна locations.js/
    building-effects.js): ВСЁ — через ctx (D4). Это осознанное
    отличие: HUD — per-frame код, и его юнит-тесты (HU2–HU4/HU6)
    исполняются в чистом node со stub-Game, не трогая
    globalThis.
  * Единственное исключение из «чистоты» — `performance.now()`
    внутри buildLine (D8): вызов в МОМЕНТ ВЫЗОВА (не при загрузке);
    во всех vm-песочницах performance есть (заморожен NOW=1000 —
    проверено), в node — глобальный (Node 18).
* `src/main.js` — hudUpdate (L1256–1358, 103 строки) заменяется
  тонкой проводкой (§5); load-time гард (D12); вызов в frame-цикле
  переименован (D11).
* `index.html` — `<script src="src/hud.js"></script>` СРАЗУ ПОСЛЕ
  тега building-actions.js (база L560 → новая L561; на master после
  000130 — после L572), т.е. ВЕРХНЕЙ точкой свободного слота между
  building-actions.js и main.js, ДО visuals-data.js (D13).
* Пины tests/index-order.test.js (D14):
  (а) 'src/hud.js' в массив теста «нужные модули подключены»
      (техническая правка, прецедент 000128);
  (б) новый тест (блок в конце файла, ПОСЛЕ блока 000130 после
      ребейза):
      pos('src/hud.js') !== -1;
      pos('src/building-actions.js') < pos('src/hud.js');
      pos('src/hud.js') < pos('src/main.js').
      Adjacency к main.js НЕ закрепляется — слот для будущих
      спец-модулей (000077/000091–95) остаётся открытым (прецедент
      000128: будущие спец-модули встают МЕЖДУ building-actions.js
      и hud.js — пин не ломается).
* Порядок загрузки (контракт):
  building-effects.js → building-ui.js → building-actions.js →
  [спец-модули] → hud.js → visuals-data.js → … → main.js.
  hud.js читает buildingActions.buildingRecForTile /
  buildingEffects.hasEffects / npcForBuilding — но ЛЕНИВО в момент
  вызова через ctx.game, поэтому твёрдое требование только «ДО
  main.js» (UMD-ловушка 000038: снапшот main.js L13); позиция
  после building-actions.js — доменная конвенция серии + ТЗ.

## 2. Публичная поверхность Game.hud (контракт для HU-тестов)

| Экспорт | Подпись | Покрытие |
|---|---|---|
| `update(ctx)` | полный кадр 1:1 hudUpdate: строка → setShop → `ctx.hudEl.textContent` (порядок L1350–1357 сохранён) | hudUpdate целиком |
| `buildLine(ctx)` | → string, ЧИСТАЯ (DOM не трогает): вся строка HUD включая flash-строку — полный побайтовый снимок | HU4 (вкл. топ-строку, «Осторожно:», «Группа … повержена.») |
| `eHint(npc, effects)` | → `''` / `'  ([E] <имя>)'` / `'  ([E] <имя>, действия)'` / `'  ([E] действия)'` — 4 ветки 1:1 | 000071, HU2 |
| `buildingNameHint(g, t)` | → `{ name, hint }` — имя/хинт тайла постройки 1:1 | 000073/000103/000105, HU3 |
| `hereLine(g, t, npc, effects)` | → `'\nЗдесь: ' + name + shopHint + eHint + hint` — ветка «Здесь:» целиком | HU4-компонент |
| `locationLine(g, ds)` | → `'\n--- <имя> (x, y) ---\nДо выхода: ~N клеток'` (+ `  |  M групп(ы)` для подземелья; город — БЕЗ строк групп) | 000105/000106, HU4 |

* `shopHint` ('  (торговля — панель [I])') и mob-строка
  ('Осторожно: …!' / 'Группа … повержена.') НЕ экспортируются
  отдельно: shopHint — внутри hereLine, mob-строка — внутри
  buildLine (инлайн 1:1 с комментом L1343–1344). Полносострочный
  снимок buildLine их покрывает; минимальная поверхность = меньше
  имён для расхождения (решение D2).
* Внутренний порядок определений в модуле (для читаемости):
  eHint → buildingNameHint → hereLine → locationLine → buildLine →
  update.

### 2.1 buildingNameHint — 1:1 семантика (main.js L1310–1340)

```
name = g.buildingNameUi(t.building);
hint = (t.building === g.BUILDING_TYPES.CAVE_ENTRANCE
        && t.buildingId !== 48) ? ' (вход — шагните)' : '';
if (t.buildingId != null) {
  rec = g.getBuilding(t.buildingId);
  if (rec) {
    raw = (rec.особые_параметры &&
           rec.особые_параметры.название_карты) || rec.название;
    if (typeof raw === 'string' && raw !== '') {
      name = raw.charAt(0).toLowerCase() + raw.slice(1);
      if (rec.категория === 'город') hint = ' (вход — шагните)';
    }
  }
}
return { name, hint };
```

* Подмена имени каталогом — только при непустой строке (C1: НЕТ
  «Здесь: \n»). Литерал `48` и loose-оператор `!= null` —
  ПОВТОРЯТЬ ДОСЛОВНО (000073, прецедент locations.js §10.4).
* Комменты L1311–1314 (000073) и L1318–1326 (000103/000105)
  переносятся ВМЕСТЕ; stale-фраза «(пара с гардом
  maybeEnterDungeon)» переформулируется на
  Game.locations.maybeEnterDungeon (src/locations.js, 000127) —
  задание 000127 §9, только коммент (D15).

### 2.2 locationLine — 1:1 семантика + ОДИН новый гард

```
dist = Math.abs(ds.x - ds.dg.exit.x) + Math.abs(ds.y - ds.dg.exit.y);
if (ds.kind === 'city') {
  // коммент 000105/000106 переносится ВМЕСТЕ
  return '\n--- ' + ds.name + ' (' + ds.x + ', ' + ds.y + ') ---' +
         '\nДо выхода: ~' + dist + ' клеток';
}
name = g.DUNGEON_NAMES ? g.DUNGEON_NAMES[ds.dg.type] : null;
if (!name) {
  console.error('hud.js: Game.DUNGEON_NAMES отсутствует (000129) ' +
                '— fallback «подземелье»');
  name = 'подземелье';
}
return '\n--- ' + name + ' (' + ds.x + ', ' + ds.y + ') ---' +
       '\nДо выхода: ~' + dist + ' клеток  |  ' +
       (ds.contents.mobs.filter((m) => !m.defeated).length) +
       ' групп(ы)';
```

* dist вычисляется ДО ветки по kind — 1:1 (L1285), работает и для
  города (ds.dg.exit есть в ds города — C5 зелёный).
* Городская ветка НЕ читает ds.contents (null, 000106) — ветка по
  kind обязательна (коммент L1287–1289 переносится).
* Новый гард (единственное отступление от побайтового 1:1 —
  правило 000053): `!name` (таблицы нет ИЛИ ключа типа нет/пусто)
  → console.error (1×/вызов) + fallback `'подземелье'` — прецедент
  D13 (locations.js:60–74, тот же fallback-литерал). Шире D13:
  ловит и отсутствующий ключ типа (в 1:1 было бы 'undefined' в
  строке) — data-error-ветка, в норме недостижима (dungeon.js
  пинан; DUNGEON_NAMES закрывает все типы — dungeon.test.js
  L240). В браузере недостижимо: dungeonState ≠ null подразумевает
  dungeon.js (фабрика locations.js без createDungeon деградирует).

## 3. Контракт ctx (14 полей; свежий объект КАЖДЫЙ кадр)

Строится в main.js (обёртка §5). Явные зависимости, нет скрытых
let-связываний (паттерн 000127 D7), юнит-тестируемо в чистом node
со стабами:

```
ctx = {
  hudEl,            // DOM #hud (main.js владеет ссылкой, L16)
  game: G,          // ЕДИНСТВЕННЫЙ снапшот main.js (L13, 000038)
  tile,             // map.tileAt(player.x, player.y) — main.js считает
                    // ОДИН раз на кадр (как L1257); в модуле tileAt
                    // НЕ вызывается
  map,              // только width/height/fromPng (топ-строка)
  player,           // {x, y} (hero-позиция)
  hero,             // level/hp/gold/points + аргумент g.derived
  day,              // clock.day — ЗНАЧЕНИЕ (не объект clock, D6)
  zoom,             // число px (var main.js L218, меняется колёсом)
  spriteLoader,     // nullable → фрагмент «графика: a/b» опускается (1:1)
  dungeonState,     // null | ds — форма ds НЕ меняется (000127 §9)
  defeatedAt,       // Map 'x,y' → «Группа … повержена.» (1:1 L1345)
  npcs,             // NPCS — аргумент g.npcForBuilding(npcs, bHere.id)
  flash,            // ЗНАЧЕНИЕ hudFlash (состояние — main.js, D7)
  flashUntil,       // ЗНАЧЕНИЕ hudFlashUntil (flat-поля, не вложенный
                    // объект)
}
```

* Все Game-API — через ctx.game: derived, TERRAIN_NAMES,
  DUNGEON_NAMES, buildingNameUi, BUILDING_TYPES, getBuilding,
  shopKindsFor, makeShop, mobGroupName, npcForBuilding,
  buildingActions, buildingEffects, playerUI. main.js сегодня
  вызывает G.X, после переноса hud.js вызывает game.X на ТОМ ЖЕ
  объекте — порядок и аргументы вызовов совпадают (D4).
* ТЗ перечисляет в чтении ctx buildingUI/npcUI.isActive — текущий
  hudUpdate их НЕ читает (D1-уточнение); чтения НЕ добавляем
  (no behavior). Для будущих HUD-задач — расширение ctx
  (добавлять поля, старые не ломать, §8).

## 4. Владелец flash — ФИНАЛЬНОЕ решение (D7)

* СОСТОЯНИЕ flash (`let hudFlash`/`let hudFlashUntil`, L575–576) и
  ВСЕ точки записи ОСТАЮТСЯ в main.js: clock.onDay (L598–599),
  flash() (L629–632, замыкание проводки 000128), combat onEnd
  (L867–886), выход/сундук (L939–971). Ни одна точка записи не
  меняется.
* hud.js получает значЕНИЯ через ctx.flash/ctx.flashUntil и
  ОТРИСОВЫВАЕТ: в конце buildLine —
  `if (performance.now() < ctx.flashUntil) line += '\n' + ctx.flash;`
  Модуль не имеет собственного состояния flash → init/deps —
  антипаттерн (паттерн 000127: без init).
* Подтверждает memory/000128 §5: «модуль не знает про hudFlash».
* Новое место записи flash (если появится у будущего эффекта) —
  main.js/роутер 000128 (deps.flash), НЕ hud.js (§8).

## 5. 1:1-маппинг (main.js L1256–1358 → модуль) и проводка

### 5.1 Куда уехало

| main.js (база) | Станет в hud.js |
|---|---|
| L1257 `t = map.tileAt(...)` | ОБЁРТКА main.js (ctx.tile, D5) |
| L1258–1259 derived/key | buildLine |
| L1260–1274 bHere/npcHere/effectsHere + комменты 000010/000076/000071 | buildLine, гарды 1:1 |
| L1275–1282 топ-строка (ур/HP/Местность/День/Масштаб/графика/[I][E]) | buildLine |
| L1283–1296 ветка подземелья/города + коммент 000105/000106 | locationLine |
| L1297–1341 ветка «Здесь:» (shopHint L1298, eHint L1299–1309 + коммент 000071 раунд-3, name/hint L1310–1340 + комменты 000073/000103/000105, append L1341) | hereLine + eHint + buildingNameHint |
| L1342–1347 ветка группы мобов + коммент 000057 | buildLine (инлайн) |
| L1348–1355 setShop (playerUI) + коммент | update (D9) |
| L1356 flash-аппенд | buildLine (конец строки, D8) |
| L1357 `hud.textContent = line` | update (`ctx.hudEl.textContent`) |

Все исходные комменты переносятся ВМЕСТЕ (прецедент 000127: файл
вырос оценке из-за сохранённых комментов + гардов).

### 5.2 Порядок эффектов в update (1:1 наблюдаемое)

```
function update(ctx) {
  const line = buildLine(ctx);        // строка ВКЛЮЧАЯ flash-аппенд
  if (ctx.game.playerUI) {            // 1:1 L1350–1355
    const isShop = !ctx.dungeonState && ctx.tile.hasBuilding
      && ctx.game.shopKindsFor(ctx.tile.building);
    ctx.game.playerUI.setShop(isShop
      ? ctx.game.makeShop(ctx.player.x, ctx.player.y,
        ctx.tile.building, ctx.tile.buildingWealth)
      : null);
  }
  ctx.hudEl.textContent = line;       // 1:1 L1357
}
```

* Наблюдаемый порядок сохранён: строка построена → setShop →
  запись textContent (HU4 фиксирует setShop ДО записи).
* МИКРО-РАЗНЦИЯ (документирована, не наблюдаема): read
  performance.now() и flash-аппенд теперь ДО setShop, а не после
  (L1356 была после L1350–1355). Почему не влияет: в vm-песочницах
  часы заморожены (NOW=1000); в браузере difference < 1 мс при
  монотонных часах — flash может показаться на < 1 мс раньше
  границы, логику не меняет. derived/buildingRecForTile/
  npcForBuilding/hasEffects — чистые — их перенос в buildLine
  наблюдаемого не меняет.

### 5.3 Тонкая проводка main.js (остаётся)

1. Load-time гард (D12) — в wiring-зоне СРАЗУ ПОСЛЕ блока
   building-actions init (после L708, перед `// --- Ввод ---`
   L710), один раз при загрузке:

       if (!G.hud) {
         console.error('main.js: Game.hud отсутствует — src/hud.js ' +
           'обязан грузиться ДО src/main.js (000129)');
       }

2. L1256–1358 (hudUpdate) → тонкая обёртка, ПЕРЕИМЕНОВАНА в
   renderHud (D11):

       // 000129: строки HUD — src/hud.js (Game.hud). Владелец
       // hudFlash/hudFlashUntil — main.js (пишут действия/бой);
       // модуль получает значения в ctx.
       function renderHud() {
         if (!G.hud) return;  // тихий per-frame гард (ошибка уже
                              // видна при загрузке)
         G.hud.update({
           hudEl: hud, game: G,
           tile: map.tileAt(player.x, player.y),
           map, player, hero,
           day: clock.day, zoom, spriteLoader,
           dungeonState, defeatedAt, npcs: NPCS,
           flash: hudFlash, flashUntil: hudFlashUntil,
         });
       }

3. frame-цикл: ТОЛЬКО переименование вызова L1413
   `hudUpdate();` → `renderHud();` (та же позиция, та же частота
   1×/кадр; структура frame() не трогается).
4. Механические правки КОММЕНТАРИЕВ (main.js — разрешён):
   L916–917 «hudUpdate («Масштаб: Xpx»)» → «renderHud/Game.hud».
   Комменты locations.js:161 и building-actions.js:370 упоминают
   hudUpdate — ФАЙЛЫ НЕ ТРОГАТЬСЯ по ТЗ — остаются (D15).
5. НЕ ТРОГАТЬ: `const hud` (L16), `hud.textContent = 'WebGL…'`
   (L98 — ранний экран, не HUD-цикл), hudFlash/hudFlashUntil/
   flash() (L575–576/L629–632), `globalThis.__game` (L1418+).

## 6. UMD-паттерн и чистая загрузка

* Загрузка: ноль console/DOM/require/Game (HU1: require в чистом
  node + голая vm-песочница Game={} БЕЗ require/module → Game.hud
  создан, 0 ошибок; браузерная ветка merge без потери чужих
  ключей).
* Гарды (1:1 перенос + один новый): `g.buildingActions ? … : null`;
  `bHere && g.npcForBuilding ? … : null`; `bHere && g.buildingEffects
  && typeof g.buildingEffects.hasEffects === 'function'`;
  `if (ctx.game.playerUI)`; `ctx.spriteLoader ? … : ''`;
  `ctx.dungeonState ? … : else if …`. НОВЫХ гардов вокруг
  G.derived/G.TERRAIN_NAMES/прочих ОБЩИХ API НЕТ (R6: изменится
  путь ошибки — crash vs тихо). Исключение — DUNGEON_NAMES (§2.2,
  000053-обязательное).
* Деградация: нулевые/отсутствующие ссылки в ctx.game → строка
  строится БЕЗ [E]-хинтов, БЕЗ setShop, без исключений (HU6 —
  регрессия текущего поведения main.js при отсутствующих API).
  Отсутствие модуля в целом → load-time console.error (один раз,
  R2 — НЕ per-frame) + тихий return в обёртке; игра не падает
  (000053).

## 7. Инварианты (рефакторинг БЕЗ смены поведения)

* HUD-выводы побайтово: фиксаторы city-screen C1–C5 и
  building-effects E1–E6 — БЕЗ правок (зелёная регрессия =
  побайтово). Топ-строка и mob-строки ДОСЬЮ не зафиксированы
  существующими тестами — теперь фиксированы HU4 (зазор a3 §2).
* Детерминизм: в блоке L1256–1358 ноль Math.random/
  generateSeedPixels/c._rng (проверено grep); перенос не вносит
  RNG; число вызовов map.tileAt — 1×/кадр (в обёртке).
* Сейвы: hud.js сейвы не читает/не пишет; формат v1 без изменений
  (hudFlash — только память).
* Форма ds (dungeonState) — без изменений (000127 §9, 000106).
* Пути [E] и гарды isActive — та же семантика (hudUpdate НЕ
  читает dungeonUI/buildingUI/npcUI — D1; перенос 1:1).
* Порядок вызовов Game-функций на кадр: tileAt (main.js, 1×) →
  buildLine: derived → buildingRecForTile → npcForBuilding →
  hasEffects → [TERRAIN_NAMES/buildingNameUi/getBuilding/
  shopKindsFor/mobGroupName/DUNGEON_NAMES] → performance.now() →
  setShop → textContent.
* Не трогать: ui.js, combat.js, locations.js, building-actions.js,
  building-effects.js, dungeon-ui.js, CHANGELOG.md (чистый
  рефакторинг: не игровой процесс, не графика, не управление),
  .merge-pending (только стадия мержа), remote (нуль push).

## 8. Контракт для будущих ~10 HUD-задач

Критерий ТЗ: «HUD-правки — в hud.js, main.js НЕ правится».

* **Имена подтипов (000073)** — `buildingNameHint` (каталожная
  ветка: название_карты || название, первая буква в нижнем).
* **Эффекты/хинты [E] (000071/000076/000092+)** — `eHint` /
  `hereLine` (строка «Здесь:») и фрагмент топ-строки
  `'[I] персонаж' + (npcHere ? '  |  [E] диалог' : …)` — в
  buildLine (единственная точка композиции топ-строки).
* **Города (000105/000107/000109/000110)** — `buildingNameHint`
  (городская ветка: имя + хинт) и `locationLine` (городской блок
  «--- … ---», «До выхода: ~N клеток»).
* **Индикаторы (графика a/b, масштаб, день, новые метрики)** —
  топ-строка в buildLine.
* **Новое per-frame состояние** — расширение ctx: ДОБАВЛЯТЬ поля
  (свежее значение на кадр из main.js), старые поля НЕ переименовать/
  не убирать; обёртка renderHud получает одно новое поле — это
  ЕДИНСТВЕННЫЙ случай правки main.js под HUD-задачу.
* **Новые точки записи flash** — main.js / роутер 000128
  (deps.flash), НЕ hud.js (владелец состояния — §4).
* buildLine — ЧИСТАЯ: будущие правки не вводят в неё DOM/RNG;
  side-эффекты — только в update (setShop-модель D9).

## 9. Отклонения от ТЗ (фиксируются в отчёте)

* **Размер (D16)**: переносимый блок = 103 строки; сетевое
  уменьшение ≈ −85 (−103 + ~18 проводки) → main.js ≈ 1504 (точнее —
  замер на зелёной стадии). ТЗ-оценка «ещё ~100–150 строк; ИТОГО
  серии 1150–1300» устарела: считалась от master 1885163 (1979) и
  недостижима уже после 000127/000128 (1979−157−233=1589).
  Прецеденты фиксации: 000127 §11 «ОТКЛОНЕНИЕ», 000128 §3.3.
* **ТЗ-перечень чтений ctx** включает buildingUI/npcUI.isActive —
  текущий hudUpdate их не читает; чтения НЕ добавляются (no-op →
  no behavior, §3).
* **Числа строк в планах устарели** (000127 §9 «L1658», план
  «1602–1703»): актуально после 000128 — L1256–1358, stale-коммент
  L1311–1314.
* **ctx.game (снапшот main.js) вместо lazyGame()/rootRef** —
  осознанно (D4): прецедент 000128 (deps.game = G) + чистые
  node-тесты со stub-Game.

## 10. Подводные камни

1. **UMD-ловушка 000038**: hud.js ПОСЛЕ main.js → G.hud в снапшоте
   main.js undefined ВЕЧНО (тихий HUD-loss). Защита: пин IO
   (000129) + load-time гард (D12) + HU5 (errors 0 + Game.hud в
   realm).
2. **Чистая загрузка КРИТИЧНА**: console.error при загрузке hud.js
   сделает errors===0 красным во ВСЕХ vm-цепочках сразу
   (city-screen/building-effects/main-visuals/BA5/LOC-12/save/
   sprites) — весь набор падает разом (R8).
3. **Flash**: значения в ctx, состояние в main.js (§4). Часы —
   performance.now() (в песочницах заморожен NOW=1000; rAF-аргумент
   frameFn(NOW+400) — НЕ часы, flash-проверка от него не зависит —
   иначе frameFn(NOW+100000) спрятал бы flash, которого ждут
   E4/B10/B13/B17).
4. **setShop 1×/кадр**, позиция: строка → setShop → запись
   textContent (R4); дублирование/сдвиг → поедет состояние
   playerUI (vm-тесты вызывают frameAt многократно).
5. **Побайтовые детали**: двойные пробелы '  |  ', «(вход —
   шагните)», «групп(ы)», «~» в «До выхода: ~N клеток» — 1:1,
   «без улучшений» (R5).
6. **Новые гарды на общих API — НЕ добавлять** (R6): тернарник
   buildingActions, `bHere && g.npcForBuilding`, typeof-гард
   hasEffects, `if (playerUI)`, `spriteLoader ?` — дословно.
7. **ds-форма**: городская ветка НЕ читает ds.contents (null,
   000106); dist — ds.dg.exit для ОБЕИХ kind'ов.
8. **Статические пины main.js** не бьют по hudUpdate (проверено:
   map.test.js L829–842/L1346+, day.test.js L412+, cities.test.js
   L1420, global-settings, ui-panel); BA7 'G.buildingActions' +
   '.toggle(' в main.js остаётся (wiring L683–708 + keydown L726) —
   зелёные без правок. Новый пин — HU7.
9. **Комменты-упоминания hudUpdate** в locations.js:161 и
   building-actions.js:370 — файлы ТЗ НЕ трогаются — остаются как
   есть (упоминание «вызовы из main.js» остаётся правдой на уровне
   проводки; точное местопребитование — здесь).
10. **Ребейз на master (9a7920d, 000130 в мастер)**: 000130 НЕ
    трогает main.js (0 строк) и hud-слот index.html — теги чистые;
    ОЖИДАЕМЫЕ конфликты: (а) Статус-секция
    memory/main-js-split-plan.md — рецепт: объединить статусы всех
    четырёх (000127/000128/000130 — смёрджено + 000129 — свой
    блок); (б) tests/index-order.test.js — обе ветки дописывают
    блоки в КОНЕЦ файла (у 000130 блок L730+, у нас — новый блок)
    — рецепт: сохранить ОБА блока (000130 + 000129). Прецедент —
    000128 §8.
11. **npm test — ВНУТРИ worktree** (memory/test-runner-worktrees.md:
    node --test сканирует .worktrees/ рекурсивно). База: 1233/1233
    (замер анализа 2026-10-02). Флейк — перепуск + запись в отчёт.

## 11. Тесты (RED-план согласован с a3; имена экспортов финальны)

Файл: **tests/hud.js.test.js (НОВЫЙ)** — шаблон 000128
(building-actions.test.js) + vm-харнес bootSandbox/CHAIN (BA5-
паттерн, city-screen CHAIN). 8 RED-тестов (HU1–HU7 + IO1):

* **HU1** модуль на месте: `require('../src/hud.js')` — поверхность
  ровно { update, buildLine, eHint, buildingNameHint, hereLine,
  locationLine }; голая vm-песочница (Game={}, БЕЗ require/module)
  — загрузка чистая (0 ошибок), Game.hud создан; браузерная ветка
  merge без потери чужих ключей. RED: MODULE_NOT_FOUND.
* **HU2** eHint: 4 ветки побайтово (stub-объект npc с полем «имя»).
* **HU3** buildingNameHint: базовая пещера (hint ' (вход — шагните)');
  buildingId 48 — hint '' (000073); подтипы 37/38/39 — каталожные
  имена (НЕ 'храм солнца'); город (категория 'город') — имя +
  hint; getBuilding → null — имя слота, hint по типу. Реальные
  каталожные записи — require('../src/buildings.js').getBuilding(id)
  (прецедент building-effects.test.js L780; city-screen берёт их
  через G.getBuilding в vm-песочнице) — в stub-Game { getBuilding,
  buildingNameUi, BUILDING_TYPES }.
* **HU4** buildLine(ctx) — полный побайтовый снимок: топ-строка
  (ур/HP/Золото/Очки/Местность/День/Масштаб/карта (map.png|
  пересчёт) с/без spriteLoader) + '[I] персонаж' + [E]-хинты +
  «Здесь:» + mob-ветки ('Осторожно: …!' / 'Группа … повержена.')
  + подземный блок + городская ветка (имя, БЕЗ строк групп) +
  flash (now < until → '\n'+text; now >= until → нет); update():
  setShop РОВНО 1× (payload makeShop / null / без playerUI) и ДО
  записи ctx.hudEl.textContent (fake hudEl — фиксатор порядка).
  Закрывает зазор a3 §2 (топ-строка, «Осторожно:» — доселе 0
  фиксаторов).
* **HU5** vm full-chain (вся цепочка index.html): Game.hud в
  браузерном realm (вся поверхность), загрузка чистая (errors 0),
  игра стартовала (__game, карта, спавн), HUD-строки без
  изменений. RED: Game.hud === undefined (остальной boot зелёный).
* **HU6** деградация: ctx.game без buildingActions/
  buildingEffects/npcForBuilding — без исключений, [E]-хинтов НЕТ
  (регрессия поведения main.js L1264–1274); подкейс:
  dungeonState + без DUNGEON_NAMES → console.error +
  'подземелье' в строке.
* **HU7** структурный: main.js НЕ содержит `function hudUpdate`
  (домен в hud.js — критерий «~10 HUD-задач без правок main.js»,
  прецедент BA7); содержит 'G.hud.update(' + строку load-time
  гарда (D12); `hudFlash`/`hudFlashUntil`/`flash()` ОСТАЮТСЯ в
  main.js (владелец — §4). RED: main.js ещё содержит
  `function hudUpdate`.
* **IO1 (000129)** в tests/index-order.test.js (новый блок после
  блока 000130): pos-пины D14 + 'src/hud.js' в «нужные модули».
  RED: pos('src/hud.js') = −1.

РЕГРЕССИЯ БЕЗ правок: city-screen C1–C5, building-effects E1–E6
(B3/B4/B5 [E]-хинты, B10/B13/B17 flash), main-visuals, BA5,
LOC-12, save/save-restore, sprites, dungeon-ui (своя цепочка
без main.js), dungeon (DUNGEON_NAMES-данные), статические читалки
main.js. Все CHAIN-тесты подхватывают тег автоматически
(matchAll). Ожидание: 1233 + 8 = 1241; на RED-стадии падают ТОЛЬКО
8 новых.

### 11.1 Правка HU5-фиксатора (зелёная стадия, 2026-10-02)

RED-регулярка топ-строки требовала `\n` сразу после «(пересчёт)»
— т.е. АБСЕНС фрагмента «  |  графика: a/b». Это НЕ вывод
оригинала: в полной цепочке spriteLoader ≠ null (s2-стаб +
sprites.js; Image-стаб onload по всем ассетам), и hudUpdate
ОРИГИНАЛА всегда печатает фрагмент (L1280). Проверено
прямой прогонкой исходного main.js (git show HEAD) в той же
vm-песочнице: вывод побайтово тот же, что с модулем (фрагмент
«  |  графика: 282/282» присутствует). Правка (только
tests/hud.js.test.js, HU5): фрагмент вынесен из строки в
отдельный ПИН `\(пересчёт\)  \|  графика: \d+\/\d+\n` (базовая
регулярка — опциональная группа). Фиксатор стал СТРОЖЕ, не
слабее; поведенческой правки модуля нет — перенос 1:1
подтверждён побайтово. Семантика «топ-строка побайтово»
сохранена.

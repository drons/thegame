# 000212: подземелье — единое информационное окно (#hud)

Статус: выполнено (реализация + ревью + правки по итогам ревью;
worktree task/000212, ветка от master c2a1ebc (000203 лундж-гейт);
на момент правок master = 3ee134e — rebase чистый, см.
tasks/result/000212.md). ТЗ: tasks/done/000212.md
(5 строк, без секций «Тесты»/«Файлы» — все решения зафиксированы
здесь). Дельты ТЗ vs код: «боковое окно» = `.combat-side`
(dungeon-ui.js), «окно глобальной карты» = `#hud` (hud.js) — в
подземелье `#hud` уже заполняется каждый кадр, но НЕВИДИМ
(z-auto под непрозрачным оверлеем z-20); «клетки до выхода» и
«этажи» уже считаются единым helper'ом floorStatusLine.

## 1. Механизм бага (сверено с кодом)

* «Боковое инфо-окно» = панель `.dungeon-overlay .combat-side`
  (src/dungeon-ui.js `build()` L392-448): absolute top:16px
  right:16px width:270px, фон rgba(16,18,24,0.85) (index.html
  L563-569) — висит в правом верхнем углу ПОВЕРХ канваса
  подземелья (жалоба ТЗ). Внутри три узла:
  * stateEl (.combat-state) — `render()` пишет каждый кадр:
    подземелье: `DUNGEON_NAMES[d.type] + '  (x, y)\n' +
    floorStatusLine + '\nГруппы: N  |  Сундуки: N  |  Залежи: N'`;
    город: `s.name + '  (x, y)\n' + floorStatusLine`;
  * logEl (.combat-log) — последние 8 строк `s.log`;
  * hint (.combat-state) — строки управления (depth-aware,
    000153.03; контекстная «Залежь — [E]» — 000157.03).
* «Окно глобальной карты» = `#hud` (index.html L32-43: fixed
  left:12 top:12, rgba(0,0,0,0.45), pointer-events:none, БЕЗ
  z-index → auto; элемент L891). Рисуется ЕДИНЫМ блоком кода
  КАЖДЫЙ кадр: main.js `frame()` → `renderHud()` (L3181-3205) →
  `G.hud.update(ctx)` → `buildLine()` (src/hud.js, 000129).
* Почему `#hud` невидим в подземелье: z-лестница (index.html
  L188-194) `.char-panel 10 < .fs-btn 15 < оверлеи 20 <
  #touch-controls 30 < .start-window 40`; `.dungeon-overlay`
  (z-20, непрозрачный фон #0a0d12, L550-554) пришивается к body
  ПОСЛЕ `#hud` (он — в разметке) → `#hud` (z-auto) целиком под
  оверлеем. `renderHud()` пишет текст (PE-10/PE-11 уже читают
  `h.hud.textContent` в подземелье) — окно живо, только скрыто.
* Мир-координаты героя в подземелье ЗАМРОЖЕНЫ на входе
  (dungeonMove двигает ds.x/ds.y, player.x/y — вход) → 1-я строка
  `#hud` в подземелье = СТАРЫЕ координаты карты — то, что ТЗ
  заменяет.
* «Этажи»/«клетки до выхода» — ЕДИНЫЙ источник
  `g.locations.floorStatusLine(dg, x, y)` (src/locations.js
  L740-749, 000153.03 D5):
  `(depth>1 ? 'Глубина: N\n' : '') + 'До выхода: ~M клеток'`
  (M — Манхэттен ds→dg.exit; тихий гард `''` при !d/!d.exit).
  Потребители ДО задачи: hud.js `locationLine` + dungeon-ui.js
  stateEl (дубль — суть жалобы).

## 2. Решения (D1-D10) — все открытые вопросы закрыты

* **D1 — единое окно = `#hud`** (Design II; Design I «оставить
  .combat-side, рисовать buildLine» — отклонён): ТЗ буквально
  «унифицировать… рисовать тем же блоком кода» — блок =
  renderHud→buildLine; `#hud` в подземелье уже живёт каждый кадр —
  нужно (а) поднять визуально, (б) починить контент, (в) убрать
  дубль.
* **D2 — панель в подземелье ХРАНИТ logEl + hint; убирается ТОЛЬКО
  stateEl (только city).** → УСТАРЕЛО с 000229: панель в подземелье
  убрана ЦЕЛИКОМ (logEl + hint тоже — чистое удаление) — см.
  memory/000229-dungeon-side-panel-removed.md. Закрытие
  a2-open-question #1 (судьба лога вылазки и подсказок) и разнобоя
  a2 (панель целиком не создавать) vs a3 (log+hint остаются): жалоба
  ТЗ — про ИНФО-окно (дубль #hud); лог и подсказки управления — не
  инфо-окно; их удаление — регресс функций 000157.03 («Залежь —
  [E]» — отдельная завершённая задача) и 000107; тест-план a3 (R4)
  фиксирует «hint на месте». Город ПОЛНОСТЬЮ вне скоупа (ТЗ:
  «В подземельях и пещерах») — его панель/окно byte-в-байт.
* **D3 — видимость: frame-driven z-lift `#hud`, значение '25'**
  (паттерн 000206 `applyLayer`: идемпотентная запись инлайн
  `zIndex`, `''` — снятие в CSS-базу). Точка: src/main.js
  `frame()`, СРАЗУ ПОСЛЕ блока `G.playerUI.applyLayer(...)`
  (L3256-3262), ДО `const stepMs` (L3267):
  ```
  const hudOver = inDungeon && dungeonState.kind === 'dungeon'
    && !inCombat && !inNpc && !inBuilding && !inCraft
    && !inResurrect;
  if (hud && hud.style) {
    const z = hudOver ? '25' : '';
    if (hud.style.zIndex !== z) hud.style.zIndex = z;
  }
  ```
  Условие: `kind==='dungeon'` (город — вне скоупа) + ПЛАНКА
  конъюнкты (паритет с applyLayer сверху; в подземелье сегодня
  достижим только inCombat — остальные защитные, belt-and-
  suspenders по прецеденту 000206). '25' — ОБЩИЙ динамический
  слот 000206+000212; лестница 10/15/20/30/40 и комменты
  index.html НЕ меняются (прецедент 000206: динамические слоты —
  в memory, не в CSS). Одновременный подъём (подземелье + открытая
  панель персонажа): оба '25' — панель ВЫШЕ (в DOM позже) —
  корректно (активный UI поверх пассивного). Статический
  `#hud{z-index:25}` — ОТКЛОНЁН (HUD плавал бы над боем/городом;
  vm-стабы CSS не исполняют).
* **D4 — новый dungeon-формат `#hud` (kind==='dungeon')** — см.
  точные байты §3.1. 1-я строка: имя подземелья ВМЕСТО координат
  карты; строки 2-5 (HP/Золото/Очки; Местность; День/Масштаб/
  карта/графика; [I] персонаж) и «Исследовано: N тайлов» —
  БАЙТ-В-БАЙТ (ТЗ заменяет только «информацию про координаты на
  карте»); flash-хвост — байт-в-байт, ПОСЛЕДНИЙ (PE-10/PE-11
  endsWith-пины).
* **D5 — dungeon-ветка `locationLine` = `'\n' + status`** (status
  = floorStatusLine, fallback `'До выхода: ~' + dist + ' клеток'`).
  Убирается: рамка `--- <имя> (x, y) ---` (имя — в 1-й строке;
  клеточные координаты дублируют карту), счётчик
  `  |  N групп(ы)`. Счётчики Сундуки/Залежи/Группы из dungeon-UI
  исчезают ПОЛНОСТЬЮ (закрытие a1-D4 = вариант (А): строго по ТЗ —
  «подземелье и его этажи, и сколько клеток до выхода»; вернуть,
  если понадобится — в #hud, не в панель). «Глубина: N» — ТОЛЬКО
  depth>1 через floorStatusLine (PE-11 пин
  `!hudText.includes('Глубина')` на depth=1 держится — «Глубина»
  в верхний блок НЕ вводится).
* **D6 — гард DUNGEON_NAMES** (000053/000129: console.error
  1×/вызов + fallback «подземелье») ПЕРЕНОСИТСЯ из locationLine в
  buildLine — в новый внутренний хелпер `dungeonName(ctx)`
  (НЕ экспортируется; вызывается 1× на buildLine в подземелье —
  пин «1×/вызов» HU6(b) жив). Сообщение гарда — ДОСЛОВНО (пин
  проверяет подстроку 'DUNGEON_NAMES').
* **D7 — НЕТ нового модуля/экспорта/<script>/CSS**: правки в
  hud.js + dungeon-ui.js + main.js frame(); index.html не
  трогается (пины index-order / combat-layout / craft-layout G2 /
  npc-layout 000125 — CSS `.dungeon-overlay .combat-side` 270px/
  absolute — зелёные); поверхность Game.hud — РОВНО 6 экспортов
  (HU1). Сейвы/RNG/боевая детерминизма — не затрагиваются (чистый
  UI; zIndex — инлайн, не сериализуется).
* **D8 — комментарии**: по CLAUDE.md новых комментариев в код НЕ
  ПИСАТЬ; исключение — ПРАВКА уже существующих, ставших
  неактуальными после изменения (доки-заголовки hud.js
  L41-42/L53-55/L144-146, dungeon-ui.js L41/L404, dungeon-
  ui.test.js L1986-1988) + короткие указатели «000212» в местах
  новых веток — конвенция кодовой базы (каждая задача маркирует
  изменения номером, прецеденты 000071/000126/000206 в тех же
  файлах). Вся важная информация — здесь (memory).
* **D9 — тесты**: НОВЫЙ файл tests/dungeon-info-window.test.js
  (самодостаточный full-chain vm-харнес, прецедент 000206 —
  tests/city-inventory-e2e.test.js; хелперы входа/этажей/боя —
  паттерн tests/portal-exit-e2e.test.js): DH-1..DH-6 RED +
  DH-7 гард (зелёный сейчас) — §4.1. Ожидаемое число красных —
  6.
* **D10 — CHANGELOG.md**: ОТДЕЛЬНЫЙ коммит «Задача 000212:
  CHANGELOG — …», дата = дата мержа (на этапе проектирования —
  2026-10-13; на момент мержа — 2026-10-14, буллет пере-
  размещён правками по итогам ревью) — буллет в «### Интерфейс»
  под «## 2026-10-14» (изменение UI, видимое игроку; программная
  часть не перечисляется):
  «**Подземелье: единое информационное окно.** В подземельях и
  пещерах боковая информационная панель убрана: название
  подземелья, глубина и клетки до выхода теперь рисуются в общем
  окне слева (тем же кодом, что и на глобальной карте); журнал
  и подсказки управления в панели сохранены.»

## 3. Контракты

### 3.1 Точные байты dungeon-HUD (kind==='dungeon')

Фикстура (hero 3/42/100/5, maxHP 50, player 5,7 — заморожен,
terrain 3=трава, день 5, zoom 28, карта 40x40 пересчёт, без
spriteLoader, exploredCount 0, flash истёк; dg.type=0, dg.exit
(0,0), ds (2,3), depth=1):

```
Флогистон, ур. 3  (простая пещера)
HP 42/50  |  Золото: 100  |  Очки: 5
Местность: трава
День: 5  |  Масштаб: 28px  |  карта: 40x40 (пересчёт)
[I] персонаж
До выхода: ~5 клеток
```

depth=2 — ВСТАВКА строки `Глубина: 2` ПОСЛЕ `[I] персонаж`
(целиком — floorStatusLine): `…[I] персонаж\nГлубина: 2\nДо
выхода: ~5 клеток`. exploredCount>0 — `Исследовано: N тайлов`
ПОСЛЕ `[I] персонаж`, ДО блока локации (позиция/условия
не меняются). Loot-строка — за мёртвой в подземелье (входной
тайл — с постройкой; контент взаимоисключающий, 000158.03).
flash: `performance.now() < flashUntil` → `\n<flash>` ПОСЛЕДНЕЙ.

Мир (dungeonState null) — НЕ МЕНЯЕТСЯ байт-в-байт (1-я строка
`(player.x, player.y)`, пины TOP_BASE/HU5). Город — НЕ МЕНЯЕТСЯ
байт-в-байт (HU4(k), city-screen C5): 1-я строка с координатами
карты + `--- <name> (x, y) ---\n<status>`.

### 3.2 hud.js

* `locationLine(g, ds)`: city — `'\n--- ' + ds.name + ' (' +
  ds.x + ', ' + ds.y + ') ---\n' + status` (НЕ МЕНЯЕТСЯ);
  dungeon — `'\n' + status`, где `status = g.locations &&
  typeof g.locations.floorStatusLine === 'function' ?
  g.locations.floorStatusLine(ds.dg, ds.x, ds.y) : null ??
  'До выхода: ~' + dist + ' клеток'` (dist — Манхэттен до
  ds.dg.exit, как сейчас). Dungeon-ветка НЕ читает
  DUNGEON_NAMES/contents.mobs.
* `dungeonName(ctx)` — новый внутренний (между locationLine и
  buildLine; внутренний порядок: eHint → buildingNameHint →
  hereLine → locationLine → dungeonName → buildLine → update):
  `ctx.game.DUNGEON_NAMES ? ctx.game.DUNGEON_NAMES[ctx.dungeon-
  State.dg.type] : null`; нет/нет ключа → console.error
  (1×/вызов, сообщение дословно) + 'подземелье'.
* `buildLine(ctx)`: 1-я строка — `'Флогистон, ур. ' +
  ctx.hero.level + '  (' + where + ')\n'`, где
  `where = (ctx.dungeonState && ctx.dungeonState.kind ===
  'dungeon') ? dungeonName(ctx) : ctx.player.x + ', ' +
  ctx.player.y`. Всё остальное (строки 2-5, explored, цепь
  dungeonState/hereLine/mob/zone, loot, flash) — не меняется.
* update/setShop — не меняются (setShop уже требует
  !dungeonState). Поверхность — ровно 6 экспортов. buildLine —
  ЧИСТАЯ (side-эффекты только в update).

### 3.3 dungeon-ui.js

* `build()`: панель `.combat-side` создаётся в ОБОИХ kind'ах
  (как сейчас); `const s0 = state();` читается ДО создания
  stateEl (переместить вверх); `stateEl` — создаётся ТОЛЬКО при
  `s0 && s0.kind === 'city'`; logEl + hint — всегда; текст hint —
  байт-в-байт в обоих kind'ах (depth-aware 000153.03; city —
  CI-V3).
* `render()`: запись stateEl — В ЦЕЛОМ под `if (stateEl)`
  (только city, байт-в-байт: `s.name + '  (' + s.x + ', ' +
  s.y + ')\n' + status`, status — `live.locations.floorStatus-
  Line` с fallback `'До выхода: ' + dist + ' клеток (на глаз)'`);
  dungeon-ветка stateEl (со строкой 'Группы: ') УДАЛЯЕТСЯ —
  строка 'Группы: ' исчезает из dungeon-ui.js. Написание hint
  (включая контекстную «Залежь — [E]», 000157.03 — на
  `(c.deposits || [])`) и logEl (`(s.log || []).slice(-8).
  join('\n')`) — НЕ МЕНЯЮТСЯ в обоих kind'ах.
* DOM-контракт оверлея: dungeon — ровно 1 `.combat-state` (hint)
  + 1 `.combat-log`; city — 2 `.combat-state` (stateEl, hint) +
  1 `.combat-log`. close() уже обнуляет все ссылки (не
  меняется); start()/transitionFloor/keydown [E]/wheel/raf — не
  меняются.

### 3.4 z-лестница (index.html НЕ ТРОГАЕТСЯ)

10 (.char-panel база) < 15 (.fs-btn) < 20 (.combat-overlay/
.dungeon-overlay/.resurrect-overlay) < **25 — ОБЩИЙ динамический
слот** (000206: подъём .char-panel via applyLayer; 000212:
подъём #hud via frame()) < 30 (#touch-controls) < 40
(.start-window). #hud — pointer-events:none (клики проходят
сквозь). При обоих подъёмах — DOM-порядок решает (панель
сверху).

### 3.5 Совместимость с пинами (зелёные БЕЗ правок)

PE-10/PE-11/N2 (portal-exit): «Глубина: 2» (depth=2),
!«Глубина» (depth=1), «До выхода: ~», flash endsWith — через
НЕМЕНИРОВАННЫЙ floorStatusLine + НЕМЕНИРОВАННЫЙ flash-хвост.
HU4(k) (city), HU5 (world), HU1 (6 экспортов), explored/loot/
flash-пины hud.js.test.js, save.test.js `'G.hud.update({'` +
collectedLoot (L2138-2141), movement-freeze T2 (per-frame
G.hud.update переживает кадр), city-screen C1-C5, city-interact
CI-V1..V8 (семантика — см. re-pin §4.2), CSS-пины
`.dungeon-overlay .combat-side` 270px/absolute (combat-layout
L66, craft-layout G2, npc-layout 000125), index-order — зелёные.

## 4. Тесты

### 4.1 НОВЫЙ файл tests/dungeon-info-window.test.js

Харнес — копия конвенции tests/city-inventory-e2e.test.js
(bootSandbox: CHAIN-скрипты из index.html, Proxy-DOM makeEl с
`style: {}`, WebGL/Image-стабы, h.hud — тот же элемент, что
getElementById('hud'), h.frameFn — последний rAF-колбэк,
drain/setImmediate). Вход в подземелье — `g.actions.enterDungeon()`
(отладочный, как CI-2/CI-6); debug-бой — `g.actions.startCombat()`
+ resolveCombat (мобы 9999 → Space, паттерн CI-6); спуск/подъём —
walkDungeonTo + [E] (паттерн PE-10/PE-11).

* **DH-1 (RED, fullchain)** — подъём: enterDungeon + frameFn →
  `h.hud.style.zIndex === '25'` (master: в main.js НЕТ логики
  подъёма #hud — undefined).
* **DH-2 (RED, fullchain)** — контент: 1-я строка ===
  `'Флогистон, ур. ' + hero.level + '  (' + G.DUNGEON_NAMES[dg.
  type] + ')'`; `!includes('---')`; `!includes('групп(ы)')`;
  `/До выхода: ~\d+ клеток/`; блок героя (HP/Золото/Очки) и
  `'Местность: '` НА МЕСТЕ (байт-в-байт, D4). (master: 1-я
  строка = координаты карты; рамка + счётчики есть.)
* **DH-3 (RED, node)** — байты buildLine: fixture-ctx (паттерн
  makeCtx tests/hud.js.test.js: hero 3/42/100/5, player 5,7,
  terrain 3, день 5, zoom 28, карта 40x40) + dungeonState
  (type 0, exit (0,0), ds (2,3)) → deepEqual строке §3.1
  (depth=1) И depth=2 (вставка 'Глубина: 2'); city-вариант —
  deepEqual городскому байту (гард). (master: world-top + рамка
  + счётчик.)
* **DH-4 (RED, fullchain)** — нет дубля в оверлее: в
  `.dungeon-overlay` ровно 1 `.combat-state` (= hint) и 1
  `.combat-log`; ни один `.combat-state` НЕ содержит
  'До выхода: '/'Группы: '/'Сундуки: '/'Залежи: '; hint содержит
  'Стрелки/WASD — шаг.' + 'Сундук и мобы'. (master: 2
  .combat-state, states[0] — вся инфо + счётчики.)
* **DH-5 (RED, node, структурный)** — `src('dungeon-ui.js')` НЕ
  содержит строку `'Группы: '` (потребитель инфо удалён);
  `src('hud.js')` И `src('dungeon-ui.js')` содержат
  'floorStatusLine' (последний — city-ветка stateEl).
* **DH-6 (RED, fullchain)** — конъюнкция боя: dungeon → '25' →
  startCombat + frameFn → `zIndex !== '25'` (HUD под боевым
  оверлеем, регрессия 000197/000203 исключена) → resolveCombat +
  frameFn → '25' снова; локация цела (kind 'dungeon',
  dungeonUI.isActive()).
* **DH-7 (гард, ЗЕЛЁНЫЙ сейчас)** — границы: (а) выход из
  подземелья ([E] на едином тайле-выхода, 000177) + frameFn →
  `zIndex !== '25'` + world-HUD восстановлен (1-я строка =
  координаты карты, 'Местность: ' есть); (б) город: `zIndex !==
  '25'` + 2 `.combat-state` + city-HUD байт-в-байт
  ('--- <name> (x, y) ---' + status). (ТЗ: только подземелья/
  пещеры.)

expectedRedCount = 6 (DH-1..DH-6). RED обязан падать ОСМЫСЛЕННО
(нет lift-логики в main.js / нет dungeon-ветки в buildLine /
stateEl на месте), не синтаксисом.

### 4.2 ТЗ-вынужденные re-pins (семантические — ТЗ меняет поведение)

* **tests/hud.js.test.js**: HU4(j) (L375-389) → новый dungeon-
  байт (§3.1: 1-я строка — имя, блок `До выхода: ~5 клеток`
  без рамки/счётчика); HU6(b) (L918-941) → fallback «подземелье»
  В 1-й строке (`'(подземелье)'`), `!includes('---')`,
  'До выхода: ~2 клеток' БЕЗ групп, console.error 1×/вызов —
  сохранено (гард теперь в buildLine, 1 вызов на 1 buildLine);
  HU6(c) (L943-961) → то же (нет ключа типа); шапка файла
  (описание подземного блока, L41-42) — обновить под D5.
* **tests/dungeon-ui.test.js**: UI-DEP-2 (L3079-3106) → в
  подземелье stateEl НЕТ: ровно 1 `.combat-state` (hint),
  счётчиков 'Группы: 1'/'Сундуки: 1'/'Залежи: 2' в оверлее нет;
  UI-DEP-3 (L3108-3130): dungeon-hint — индекс [1]→[0]
  (city-часть [1] — не трогать); UI-GRD-1 (L3140-3187):
  dungeon-hint [1]→[0] в 3 местах (L3152/L3171/L3184);
  000153.03 stateEl (L3204-3232) → dungeon: в `.combat-state`
  НЕТ 'Глубина'/'До выхода'/'Группы' (инфо — в #hud), city-часть
  (L3222-3231) — не трогать; 000153.03 locationLine-node
  (L3234-3288) → dungeon depth=1 — deepEqual
  `'\nДо выхода: ~5 клеток'`, depth=2 — deepEqual
  `'\nГлубина: 2\nДо выхода: ~5 клеток'` (city-байты и
  структурный пин floorStatusLine-в-двух-файлах — НЕ трогать);
  dungeon-hint [1]→[0]: L2281, L3297, L3316 (city-индексы
  L2027/L2268/L3126/L3228/L3333 — не трогать); комментарии
  L1986-1988 («combat-state — ДВА») → «city: stateEl + hint;
  dungeon: hint (000212)».
* **tests/deposit-e2e.test.js** (L418-432, L492, L546-552):
  `hintText` → `states[0]` (assert ≥1); `stateText` — УДАЛИТЬ
  (хелпер + ассерт DE-1 «Залежи: 0» — счётчик Залежи из dungeon-
  UI ушёл, ТЗ: только подземелье/этажи/клетки до выхода);
  остальные ассерты DE-1 (hint «Залежь — [E]», инвентарь, log,
  flash-endsWith через h.hud) — зелёные без правок.
* **tests/city-interact.test.js** (L1451-1458): `hintOf` →
  ПОСЛЕДНИЙ `.combat-state` в оверлее (city: [stateEl, hint] →
  hint; dungeon: [hint] → hint) + assert ≥1 — технический re-pin
  (индексация), семантика CI-V1..V8 не меняется.

### 4.3 Гарантийный список (зелёные БЕЗ правок)

portal-exit PE-1..PE-12/N2; hud.js.test.js (HU1, HU2, HU3,
HU4(a-i,l,m…), HU5, HU6(a, world), HU7, explored/loot/flash);
city-screen C1-C5; city-inventory CI-0..CI-8 (000206);
combat-layout/craft-layout/npc-layout (CSS); save.test.js;
movement-freeze; index-order; dungeon.js/locations.js/map.js/
sync-all/combat (данные/детерминизма); остальные fullchain-
файлы — фон. Финальный прогон — ОДИН полный `node --test tests/`
в конце (1 worktree = 1 полный прогон, memory
no-parallel-full-tests; перед ним — чистый git status; флейк —
1 перепуск + запись в отчёт).

## 5. План по файлам (дельты)

| Файл | Что | Дельта |
|---|---|---|
| src/hud.js | dungeonName (гард перенесён) + 1-я строка buildLine (where) + dungeon-ветка locationLine → '\n'+status; устаревшие доки L41-42/L53-55/L144-146 — правка | +~14/−~8 |
| src/dungeon-ui.js | build(): s0 выше + stateEl city-only; render(): stateEl под if(stateEl), dungeon-ветка удалена; доки L41 — правка | +~6/−~14 |
| src/main.js | frame() после applyLayer: hudOver + идемпотентный zIndex '25'/'' | +~7 |
| index.html | — (без изменений) | 0 |
| tests/dungeon-info-window.test.js | НОВЫЙ: харнес + DH-1..DH-7 | ~400 новых |
| tests/hud.js.test.js | HU4(j)/HU6(b,c) + шапка | ~20 |
| tests/dungeon-ui.test.js | UI-DEP-2, 000153.03 (stateEl/locationLine), hint-индексы ×7, комментарии | ~60 |
| tests/deposit-e2e.test.js | хелперы + DE-1 «Залежи: 0» | ~15 |
| tests/city-interact.test.js | hintOf | ~5 |
| memory/000212-dungeon-hud-window.md | новый (этот файл) | +~200 |
| CHANGELOG.md | буллет «Интерфейс» 2026-10-13 (отдельный коммит) | +~5 |

Порядок: (1) RED-коммит — tests/dungeon-info-window.test.js +
этот memory (падение на master — осмысленное); (2) зелёная фаза —
src (3 файла) + re-pins §4.2; (3) полный node --test — зелёный;
(4) CHANGELOG — отдельный коммит; (5) финал — ОДИН коммит задачи
(squash по memory one-commit-per-task-squash: reset --soft +
commit на ветке, потом ff-only), первая строка «Задача 000212:
…», последняя (отдельный параграф) — Co-Authored-By: Claude Code
<noreply@anthropic.com>. Перед мержем — rebase на свежий master +
повторный полный прогон (§6).

## 6. Ловушки и подводные камни

* Lift — ТОЛЬКО из frame() (per-frame, идемпотентен), НЕ из
  start()/close() dungeonUI: владелец — main.js (единственная
  ссылка на #hud — L19); watchdog 000170 жив. transitionFloor
  (спуск/подъём) — СИНХРОНЕН (close→state→start в одном [E]-
  событии) — условие lift не рвётся между этажами; вход/выход —
  lift сходится ≤1 кадра. `inDungeon` ⇔ `dungeonState !== null`
  (main.js L3232) — `dungeonState.kind` читается после проверки.
* Конъюнкты — из УЖЕ ВЫЧИСЛЕННОГО снимка кадра (L3231-3236) —
  новых состояний/вызовов isActive() нет.
* vm-стабы: makeEl с `style: {}` — запись `hud.style.zIndex`
  стаб-безопасна (паттерн 000206); CSS-движка в песочнице НЕТ →
  инлайн-стиль, не CSS-правило. `h.hud` — в return харнеса.
* Гард DUNGEON_NAMES — console.error: vm-сбор h.errors — на
  ЧИСТЫХ переходах (dungeon.js в цепочке, все типы закрыты) —
  0 новых ошибок; тесты обязаны пинить `h.errors.length` не
  растёт на чистых путях.
* В подземелье ctx.tile — ВХОДНОЙ мир-тайл (player заморожен):
  «Местность:» — terrain входа (байт-в-байт по дизайну, не
  баг); ветки hereLine/mob/zone/loot в подземелье МЁРТВЫ
  (dungeonState приоритетен в цепи buildLine) — не менять.
* REBASE-РИСК (главный): src/main.js frame() — горячая зона:
  параллельно в работе 000194/000196 (combat UI) и 000202
  (city building UI); master УЖЕ принял 000203 (main.js +
  combat-ui.js — лундж-гейт). Перед мержем: rebase на свежий
  master, точку вставки ВЫБРАТЬ СНОВА ПО ФАКТУ (после блока
  applyLayer, до `const stepMs`), полный node --test. hud.js
  top-блок — тоже горячая зона для HUD-задач — байты §3.1 —
  якорь мержа.
* 000038 (UMD): нового модуля НЕТ → script-тегов/порядка загрузки
  не меняется; dungeonName — в closure hud.js, без Game при
  загрузке (всё — через ctx per-call).
* Не путать: `.combat-state` БОЕВОГО оверлея (combat-ui.js) и
  панели персонажа (ui.js) — НЕ ТРОГАТЬ; правится только
  dungeon-оверлей (dungeon-ui.js).
* Fallback «(на глаз)» в dungeon-ui (city stateEl, цепочки без
  locations.js) — НЕ МЕНЯЕТСЯ.
* Для будущих задач: '25' — ОБЩИЙ динамический слот
  (000206+000212) — новый подъём над локацией — тот же слот или
  другой номер + обновление этой секции и memory/000206. Байты
  dungeon-HUD — заперты DH-2/DH-3 + PE-10/PE-11. Счётчики
  Группы/Сундуки/Залежи из UI удалены — возврат (если понадобится)
  — в #hud (buildLine), не в боковую панель.

## 7. Что важно будущим задачам (ссылки ТЗ/контракта)

* «Глубина» — каноническое слово (spec/world-map.md); строка
  только depth>1 — floorStatusLine (000153.03 D5) — ЕДИНЫЙ
  источник, потребители: hud.js (дungeon-ветка locationLine) +
  dungeon-ui.js (city stateEl).
* Имена подземелий — G.DUNGEON_NAMES (src/dungeon.js
  DUNGEON_TYPES): 0 «простая пещера», crypt «склеп», ruins «руины
  замка», drowned «затопленная пещера», abyss «бездна».
* «Подземелья и пещеры» = ВСЕ kind==='dungeon' (любое dg.type);
  город (kind==='city') — вне скоупа (панель/окно — как есть).
* HUD — единый блок buildLine (000129): будущие HUD-задачи
  правят ТОЛЬКО src/hud.js; ctx — 18 полей (main.js renderHud).

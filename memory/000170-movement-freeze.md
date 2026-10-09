# Задача 000170 — «Иногда зависает движение персонажа» (мержи 2026.10.07): диагностика и контракты (дизайн)

Станция: ПРОЕКТИРОВАНИЕ (workflow 000170). Входы: ТЗ `tasks/pending/000170.md`,
/tmp/thegame-wf-000170/a1-domain.md, a2-arch.md (кратко), a3-tests.md, пробы
PV-1..PV-6 (/tmp/thegame-wf-000170/probe-freeze.test.js), harness v2
(/tmp/thegame-wf-000170/repro-master.js).

Базис анализа: worktree `.worktrees/task-000170`, ветка task/000170,
мастер в момент анализа **09ffa25** (= 3d5bac4 + e80a737 000168 + f751298 000178
+ 09ffa25 000169). Все номера строк ниже — **3d5bac4** (верифицировано
grep-ом в этом worktree); к мастеру 09ffa25 сдвиг: combat-ui.js +≈58 строк
от 000168/000178 (finish ≈1461, ctx-присваивание ≈1584, build/render ≈1600),
main.js/ui.js/controls.js/dungeon-ui.js/resurrect — БЕЗ СДВИГА (000168/000178
меняли combat.js/combat-ui.js, 000169 — ui.js). Перед фиксом — РЕБЕЙЗ на
фактический мастер (ОБЯЗАТЕЛЬНО, master сдвигался 3 раза во время анализа)
и перепроверка номеров grep-ом.

## 0. Диагностика: какой мерж, какой механизм, file:line

**Корень — ОДНА баг-класс «заморозка ввода без механизма восстановления»,
ДВА независимых бага внутри неё:**

### Баг 1 (ДЕТЕРМИНИРОВАННЫЙ, воспроизводится в vm, 100% на тач): пикер «Воскрешение» (000162)

Мерж **9768efe (000162, 2026-10-07)** добавил единственное НОВОЕ состояние,
блокирующее ввод/движение (дифф 10-07 против предбаза 080c106: controls.js,
dungeon-ui.js, locations.js, motion.js, dungeon.js, map.js, world.js НЕ
менялись; единственный новый window-keydown-слушатель — в resurrect-модуле).
Механизм (все шаги верифицированы по строкам):

1. Пикер открывается ТОЛЬКО на храме (buildingId 36/37/38) ГЛОБАЛЬНОЙ карты:
   [E] → строка «Воскрешение» → `resurrectUI.open()` (building-effect-resurrect.js:257-314).
   Городские пулы построек храмы не содержат; в подземельях/лагерях пикера нет.
   Отсюда «иногда» — только при храме с погибшим наёмником.
2. `main.js frame()` L2511: `inResurrect = resurrectUI.isActive()`; L2528:
   `building: !!inBuilding || !!inResurrect` → `controls.js
   touchControlsVisibility` (L346-354) → `{buttons:false, dpad:false}` →
   `ui.js applyVisibility` (L1614-1632) прячет D-pad и кнопки [E]/[I]
   (`style.display='none'`).
3. DOM пикера (open() L257-314) — **нуль кликабельных элементов**: title +
   строки `.resurrect-row` + hint; ввод — СВОЙ window-keydown (L280-311):
   ArrowUp/Down, Enter/NumpadEnter, Escape. Клик-обработчиков и кнопки закрытия НЕТ.
4. Тап D-pad всё равно маршрутизируется: `routeTouchScreen` (controls.js L320-325)
   НЕ знает resurrect → 'map' → `main.js onHold` (L1708-1712) →
   `keys.add('touch:<dir>')` — но гейт `frame()` L2535-2537
   (`!inCombat && !inDungeon && !inNpc && !inBuilding && !inCraft && !inResurrect`)
   блокирует `tryMove()`. Клавиша в keys, персонаж стоит.
5. Закрыть пикер тачем НЕВОЗМОЖНО → **постоянная заморозка мира** (оба канала
   тач-ввода: и D-pad, и кнопки скрыты; ввод в keys не потребляется).
   Отказ в confirm (Q-2 000162: «мало золота»/«отряд полон» — пикер остаётся)
   продлевает заморозку.

Десктоп: все клавиши блокируются первым гейтом keydown (main.js L1596), но
**Esc закрывает** (PV-2 green) → состояние снимаемо; уязвим детерминированно
только тач (PV-3 — **RED на master**, воспроизведено в vm).

### Баг 2 (НЕНДЕТЕРМИНИРОВАННЫЙ, только реальный браузер): исключение в input-критичной точке жизненного цикла ВЕЧНО убивает/отравляет ввод

В игре НЕТ механизмов восстановления: rAF-цепь frame, ctx боя, флаг пикера,
dungeonState — при исключении в моменте жизненного цикла состояние застревает
навсегда (до перезагрузки). Пачка 10-07 (13 мержей, см. §2) + 000168/000178
(10-09) существенно УВЕЛИЧИЛА исключительную поверхность ровно в этих точках.
«Иногда» = зависимость конкретного DOM/canvas-исключения от состояния/ассетов/
DPR/resize в реальном браузере; vm-песочница (Proxy-DOM, L6 §7) его не
воспроизводит, т.к. стабы не бросают. Детерминированного логического бага
движения на мастере НЕТ (10 vm-сценарий a1/a2 — все консистентны, ERRLOG=0).

### Почему выходной тайл стал недостижим

Три независимых механизма (все — следствие двух багов; путь выхода САМ intact:
`locations.dungeonMove` L307-368 проверка выхода → `{type:'exit'}` ДО смены
позиции; dungeon.js с 080c106 не менялся; PV-4 green — 4 шага):
- **B**: stuck `combatUI.isActive()` → `dungeonMove` получает
  `{inCombat: true}` (main.js dungeonOnMove L2074-2076) → `null` →
  выходная клетка не срабатывает, движение в подземелье мёртво;
- **C**: исключение в onDay (вызывается из `exitDungeon` → `clock.event` —
  L5) пропускает `dungeonState=null + dungeonUI.close()` → застряли в
  подземельи; КАЖДАЯ повторная попытка на выходной клетке снова срабатывает
  `{type:'exit'}` → exitDungeon → день +1 (заметный побочный эффект: дни
  уходят, пока персонаж «не может выйти»), позиция при этом не сдвигается
  (проверка выхода ДО мутации) — «не может зайти на тайл выхода» буквально;
- **A**: то же исключение, если пришло через frame (мировой шаг на смене дня)
  — убивает rAF мира; в подземелье движение event-driven (dungeon-ui keydown,
  dungeon-ui.js L269-291 — НЕ зависит от rAF main) → A само по себе только
  карту; но A+B/C-комбинация покрывает все 5 каналов симптомов ТЗ.

**Единственное состояние, гейтящее ВСЕ 5 каналов ТЗ одновременно (мир×2 +
подземелье×2 + exit-тайл): `combatUI.isActive()`** — отсюда fix обязан кроить
и ctx-жизнь боя, и rAF-цепь, и пикер — а не только frame (а1 §3).

## 1. Цепи зависания (номера строк — 3d5bac4)

### A. Смерть rAF-цепи мира (мир: клавиши + джойстик, ВЕЧНО)
`frame()` main.js L2505-2588: нигде нет try/catch; последняя инструкция —
`requestAnimationFrame(frame)` (L2587). ЛЮБОЕ исключение в кадре убивает цикл
навсегда: `saveNow` (L2557→collectSaveData), `maybeStartCombat→startCombat`
(L2554-2555→L1864→build/render), `enterLocation`, `onDay` (через
`clock.addStep` L2553: `G.playerUI.render` L1356 — DOM, новый с 000145/146/152;
`saveNow` L1363), `drawSprites`, `renderHud` (вызов в frame L2586;
`G.hud.update` — L2486),
`applyVisibility` (000150, каждый кадр, L2513-2531). Listener'ы keydown
живы, но Set keys не потребляется — «игра не реагирует на нажатия»
(ТЧ ТЗ: это НЕ hang, а мёртвый цикл при живых listener'ах).

### B. Висячий combatUI (мир + подземелье + exit-тайл, все 4 пути ввода)
`startCombat` combat-ui.js L1445-1544: **`ctx = {combat, …, open: true, …}`
(L1526-1539) присваивается ДО `build(); render();` (L1541-1542)**. Исключение
build/render в реальном DOM (null-элементы, canvas-context, combat-scale
getBoundingClientRect 000151) оставляет `isActive()===true` (L126-128) БЕЗ
рабочего оверлея. `ctx` обнуляется ТОЛЬКО в `finish()` (L1403-1431). Все три
вызова в main.js (L1449, L1864, L2161) — без гарда: исключение улетает вверх
(по frame → цепь A = двойная заморозка; по dungeon keydown → умирает событие).
`isActive()` гейтит: мир keydown (L1628), мир frame (`inCombat` L2506/L2535),
dungeon keydown (dungeon-ui.js L271), dungeon touchHold (dungeon-ui.js L327)
+ `dungeonMove {inCombat}` → null (locations.js L307-368) → **exit-тайл**.

### B2. finish() бросает (мобайл мёртв + onEnd потерян)
`finish()` combat-ui.js L1403-1431: guard → `caf(rafId)` → `ended=true;
ctx.open=false` (L1409-1410 — гейты ОТКРЫВАЮТСЯ) → **`G.efir.addEfirXp`
(L1419, THROWABLE**: abnormal sheet → S.addXp/appendSpells/reprocessEfirSkills)
→ `overlay.remove()` (L1421) … `ctx=null; ended=false` (L1427-1428) →
`onEnd && onEnd(result)` (L1429). Исключение в addEfirXp: оверлей остаётся в
DOM (тач-ввод сворачивается оверлеем — МОБАЙЛ мёртв), onEnd НЕ вызван
(награды/подъём-после-смерти/dead-mercs-записи 000161 не применены), ctx не
обнулён (`current()` != null). Десктоп-клавиатура работает.

### C. Выходной тайл / onDay (застревание в подземельи + «дни уходят»)
`exitLocation` main.js L2063-2070: `G.locations.exitDungeon(ds, {day, memory,
clock})` (L2066) → locations.js L402-408: `memory.set` → **`clock.event(
'dungeon')`** → day.js L59-62: `day += 1;` (L60, ДО listener'ов!) → синхронные
listener'ы → main.js onDay (L1319-1364): `G.restoreDay`, `payWages`,
`G.squadUI.render`, **`G.playerUI.render` (L1356, БЕЗ ГАРДА — максимальная
новая DOM-поверхность 000145/146/152: партия/портреты)**, `saveNow` (L1363).
Исключение в onDay пропускает `dungeonState = null; G.dungeonUI.close();
saveNow()` (L2067-2069) → dungeonUI.isActive() гейтит мир keydown (L1633)
и frame (`!inDungeon` L2535) + выход повторяется безрезультатно (см. §0).

### R1. resurrectUI stuck (мир: оба канала)
`confirmResurrect` building-effect-resurrect.js L173-218: ранние гварды
(мало золота/отряд полон/битая запись) возвращают БЕЗ close (Q-2 — по
дизайну 000162); затем МУТАЦИИ (L208-211) → **`w.saveNow()` (L213) →
`w.flash` (L214) → `w.playerRender()` (L215) → `close()` (L216)**: исключение
в любом из трёх ДО close оставляет `active=true` (L77) ВЕЧНО → гейты
main.js L1596 (keydown) + L2511/L2535 (frame) закрываются навсегда.
close() сам безопасен (L224-240, `if (!active) return`).

### Отсечённые (доказательно, a1 §4 / a3 §0)
stuck dungeonUI (close L797-815 гардирован), цикл очереди 000167/000168
(buildTurnOrder ВСЕГДА содержит 'player'; startRound сбрасывает turnIndex=0;
эмпирика K), NaN stepMs (гарды L82-90), генерация выхода (exit — вырубленный
пол + 5×5 safe-зона), бой-без-result (endTurn без гвард; result-ветка
handleCode Space/Enter/Esc→finish).

## 2. Поверхность исключений, добавленная мержами 06–09.10

| мерж (дата) | что добавил в input-критичные точки |
|---|---|
| 000145/000146 (10-07, f4fd4e3/7306ca3) | `G.playerUI.render` — партия/портреты (DOM) — вызывается в onDay (L1356) на КАЖДУЮ смену дня (каждые steps_per_day шагов мира + каждый выход из подземелья) |
| 000161 (10-07, 0c47f71) | раздел сейва dead_mercs в collectSaveData → saveNow на каждом шаге |
| 000149 (10-07, 88a1253) | combat-ui build/render +197 (книга заклинаний: renderBook/spellBookWarned) |
| 000151 (10-07, 7652cf9) | combat-scale: setTransform/resize/getBoundingClientRect в build+onResize |
| 000152 (10-07, 6047b1c) | портреты NPC в бою (mercFrames) + playerUI |
| 000166 (10-07, 4feb564) | цель-мёртвый-союзник: +104 строки рендера/подсветки |
| 000162 (10-07, 9768efe) | **пикер: новое гейтящее состояние + свой keydown + маппинг resurrect→building (frame L2528)** |
| 000167 (10-07, ec08e19) | перестройка очереди (advanceQueue) — поверхность finish/onEnd |
| 000164 (10-07, ab6c08d) | окно смерти: partyLost-ветка onEnd (combat.js onPlayerDeath 946-979) |
| 000168 (10-09, e80a737) | ввод союзников: handleKey-диспатч player/ally, cast/heal-ветки |
| 000178 (10-09, f751298) | тач-кнопки «Каст»/«Лечение» в build() — больше DOM в бросаемой зоне |
| 000150 (10-06) | applyVisibility КАЖДЫЙ кадр (frame L2513-2531) |

Бой перерисовывается каждый tick БЕЗ защиты (combat-ui.js L1397-1401:
`render(); rafId=raf(tick)`); экран onDay — новый DOM без гарда. Фикс =
укрепление этих точек (деградация без краха, console.error-одноразово) +
красные тесты, доказывающие exception-безопасность каждой точки.

## 3. Решение (9 точек, все — «деградация без краха», паттерн saveWarned main.js L717)

### D-решения (openQuestions → конкретика)

**D1. Форма тач-фикса пикера = КНОПКА ЗАКРЫТИЯ в DOM пикера** (не «не прятать
D-pad» — D-pad бы остался, но тапы всё равно не закрыли бы пикер и не
повели бы персонажа (frame-гейт) — заморозка осталась бы; не «маршрутизировать
тапы в пикер» — пришлось бы менять контракты ЧИСТЫХ функций routeTouchScreen/
touchControlsVisibility + их пины (tests/controls.test.js, TV1..TV7) + onHold
main.js — шире область и чужие файлы). Кнопка само-содержится в модуле-
владельце пикера.

**D2. Форма кнопки: `div.resurrect-close` (НЕ `<button>`), прямой
`addEventListener('click', () => close())`** — единый DOM-стиль игры
(buildingUI строки — div'ы с кликами); close() идемпотентен (L224) →
двойное закрытие (Esc+клик) безопасно. Позиция: ПОСЛЕДНИЙ ребёнок оверлея
(после hint L277-278) — thumb-friendly. Текст: `✕ Отмена` (аффирданс сам по
себе; hint L277 НЕ меняем — минимальный дифф, hint не пинан тестами).
Состояние: модульное, НОВЫХ экспортов Game НЕТ (resurrectUI.{open,close,
isActive} — без изменений). CSS `.resurrect-close` — в `<style>` index.html
(после .resurrect-hint L829): как строки (border/padding) + align-self:flex-end
+ cursor:pointer. Никаких <script>-тегов → tests/index-order.test.js не трогать.

**D3. Watchdog frame() (цепь A): try/catch вокруг тела + ВСЕГДА
`requestAnimationFrame(frame)` в finally**; `console.error` ОДИН раз
(флаг `frameErrLogged`). НЕ делать `keys.clear()` в catch: заклинившая
клавиша повторится при следующем keydown, а сброс потеряет удержание
(решение a1 §6.1). Частичный кадр само-исцеляется: canvas.width/height
пересет каждый кадр (L2558-2560 сбрасывает контекст).

**D4. startCombat — САМОИСЦЕЛЕНИЕ в catch, `combatUI.abort()` НЕ нужен**
(вопрос координации с 000171 → решён: не нужен). Единственный stuck-path —
throw build/render ПОСЛЕ ctx-присваивания; healeм его НА МЕСТЕ:
try { build(); render(); if (raf) rafId = raf(tick); } catch { caf(rafId);
rafId=null; try{overlay.remove()}catch{} overlay=…=null (ВСЕ DOM-ссылки
build: canvas/g2/stateEl/logEl/bannerEl/turnorderEl/hpbar*/bookBox/bookSig);
ctx=null; ended=false; console.error once; return null; }. Вызывающие уже
null-safe (СВЕРЕНО: noteEfirCombat `if (combat && …)` L1417-1423;
maybeStartCombat `noteEfirCombat(combat); return true` L1935-1937 — true:
enterLocation откладывается на следующий кадр, гейт уже открыт — безопасная
деградация, ПОВТОР боя при новом входе в зону; startDungeonCombat — без
return L2212-2214). Публичный abort() отклоняется: расширяет API поверх
000171-зоны, а stuck-path закрыт самоисцелением. Self-heal ОБЯЗАН сбрасывать
`ended=false; ctx=null` — зеркало post-state finish(), иначе следующий
startCombat ломается (guard isActive() пройдёт, но ended=true отравит finish).

**D5. finish() — ДВА try/catch: (а) `G.efir.addEfirXp` (L1419) — при throw:
xp-начисление пропущено (logged once), поток продолжается; (б)
`onEnd && onEnd(result)` (L1429) — при throw: side effects onEnd потеряны
(logged once), но оверлей снят и ctx обнулён**. Порядок happy path НЕ
меняется; catch-ветки не мутируют игровое состояние сверх восстановления.

**D6. exitLocation (цепь C): try/catch вокруг exitCity/exitDungeon + finally
{ dungeonState=null; G.dungeonUI.close(); saveNow(); }**. finally (а не
reorder): гарантированность очистки при ЛЮБОМ исходе дня-цепи. Полуприменён-
ный день (day+=1 ДО listener'ов — day.js L60; memory.set до event — L406)
— приемлемая деградация (лог + выход завершён), НАМНОГО лучше вечного
застревания. dungeonUI.close() уже exception-safe (L797-815).

**D7. saveNow: try/catch ТОЛЬКО вокруг `collectSaveData()` (L730)** —
G.save/save.js уже ловит setItem (save.js L177-185) — второй try не нужен.
Кроет: каждый мировой шаг (L2557), onDay (L1363), onEnd (L1519/L1931/L2209),
exitLocation (L2069), beforeunload.

**D8. onDay: try/catch ОКРУЖАЕТ ВЕСЬ ТЕЛО listener'а** (L1319-1364), logged
once. Почему весь, а не точечно: максимальная 10-07 поверхность (playerUI
L1356, squadUI L1355, saveNow L1363), и защита БУДУЩИХ caller'ов event()/
rest() (в т.ч. 000177 [E]-выход). Все МУТАЦИИ тела (restoreDay, respawn,
buffs, payWages) идут ДО DOM-вызовов в порядке тела → throw в render теряет
только hudFlash-строку и сейв, логику дня не теряет.

**D9. confirmResurrect (R1): try/catch вокруг ЗАВЕРШЕНИЯ (w.saveNow/w.flash/
w.playerRender L213-215), `close()` — СНАРУЖИ try (ВСЕГДА выполняется)**.
Мутации (L208-211) остаются применёнными (воскрешение в памяти, сейв потерян —
logged once) — деградация лучше застрявшего флага. Ранние гварды (Q-2) НЕ
меняем (контракт 000162) — теперь тач-снимаемы кнопкой D1/D2.

**D10. Ассеты и раскладка: НОВЫХ SVG/ассетов НЕТ** (кнопка — текст
`✕ Отмена`, как строки buildingUI — текстовый аффирданс; svg.test.js
не задевается, assets/ не трогается); **НОВЫХ брейкпоинтов НЕТ**:
кнопка позиционируется flex-ом внутри существующего .resurrect-overlay
(align-self:flex-end, после hint) — раскладка оверлея инвариантна по
размерам экрана (overlay уже position:fixed inset:0 padding:24px).

**D11. НЕ ТРОГАТЬ**: dungeon-ui.js (close уже гардирован), controls.js,
locations.js, motion.js, world.js (000176), ui.js (000169), combat.js
(000168 уже в мастере), day.js, save.js, SPEC.md, index.html-скрипты.
tick()/render() боевого rAF — НЕ гардим: при throw умернет только АНИМАЦИЯ,
ввод (handleCode — event-driven) и выход из боя (Space/Esc) живы → не freeze
(документировано, а не scope-ползание в 000171-зону).

### Что добавлено/перенесено (итоги дизайна)
Добавлено: 9 точек (D1-D9 выше: 1 тач-кнопка + 8 exception-гардов) в
3 файлах, 1 CSS-класс, 1 новый тест-файл, эта память. Перенесено: ничего (никаких рефакторингов/переездов
кода — только обёртки тел функций + один DOM-элемент).

## 4. Красные тесты T1–T6 (+ защитные пины T7–T10)

Файл: **tests/movement-freeze-e2e.test.js** (ОДИН новый файл, vm-полная
цепочка index.html, harness по образцу tests/resurrect-e2e.test.js:
boot/drain/key/mainFrameAt/findAll/makeEl + тач-хелперы из пробы
dpadTap/dpadRelease/dpadPoint по G.layoutTouchControls). ТЧ ТЗ «персонаж
движется по клавише (vm) и входит на exit-тайл» = пины T7/T8 (на master
уже green — контроль регрессий фикса) + T1 (реальная детерминированная
регрессия 10-07).

**Техника инъекций (ВАЖНО, UMD-ловушка 000038)**: main.js/combat-ui/
resurrect держат СВОИ снапшоты G; перезапись свойства НА ОБЪЕКТЕ-ЭКСПОРТЕ
(G.hud.update, G.efir.addEfirXp, G.playerUI.render) действует на всех
(Object.assign копирует ссылки); перезапись свойства на КОНЕЧНОМ
globalThis.Game — НЕ действует. document — общий объект closure всех модулей
→ обёртка document.createElement действует на build() боя.

| id | Тест | Механизм RED на master | GREEN после |
|---|---|---|---|
| **T1** | пикер (тач): тач-бут → храм → [E] → «Воскрешение» → пикер открыт → **клик `.resurrect-close`** → `G.resurrectUI.isActive()===false` → тап D-pad → персонаж сдвинулся | RED: элемента .resurrect-close НЕТ (open() L257-314 — только title/rows/hint; сканер PV-3: кликабельных элементов 0) | пикер закрыт тачем, frame-гейт открыт, движение шло |
| **T2** | watchdog frame: после boot `G.hud.update = () => { throw }` (объект экспорта hud.js — общий для снапшота main.js; renderHud вызывает `G.hud.update` L2486 КАЖДЫЙ кадр) → кадр → rAF-цепь жива (raf.length вырос: в harness rAF пушит в массив, reschedule frame — новая запись) → клавиша → шаг | RED: исключение в frame (L2586) до `requestAnimationFrame(frame)` L2587 → reschedule не случился (raf.length не вырос) → movement=false, навсегда | цикл жив, console.error раз, движение работает |
| **T3** | startCombat: обёртка `document.createElement` бросает для 'canvas' (build() L208 — единственный canvas через createElement; мир/спрайты — getElementById) → `g.actions.startCombat(6)` (try/catch в тесте) → assert: исключение НЕ улетело вызывателю, `G.combatUI.isActive()===false`, `current()===null`, в body нет `.combat-overlay--combat`; ВОССТАНОВИТЬ createElement → повторный startCombat(6) работает (self-heal: ended=false) | RED: ctx={open:true} (L1526) ДО throw build (L1541) → isActive()===true, current()!=null, оверлей-обломок в DOM; исключение улетело (threw=true) | бой не начался чисто (return null), повторный бой стартует |
| **T4** | finish: startCombat(6) → `c.phase='over'; c.result={outcome:'victory',xp:50,gold:1,defeated:1,allyXp:[]}` → `Game.efir.addEfirXp = () => { throw }` (объект экспорта efir.js — общий для снапшота combat-ui) → `handleCode('Escape')` (try/catch) → assert: `isActive()===false`, `current()===null`, оверлей снят, **onEnd сработал** (кадр → HUD «Победа! +50 опыта» — onEnd startCombatAt, hudFlash L1487) | RED: throw в addEfirXp (L1419) → onEnd (L1429) не вызван (нет flash), ctx не обнулён (current()!=null), оверлей в DOM (тач мёртв), исключение улетело | бой закрыт, onEnd применён, xp-начисление пропущено но logged once |
| **T5** | exit-тайл: бут → BFS-клавишами до пещеры (buildingId≠48, паттерн PV-4) → в подземелье: `Game.playerUI.render = () => { throw }` (общий экспорт ui.js; onDay L1356) → BFS-шаг на выходную клетку (try/catch) → assert: `g.dungeon===null` (getter main.js L2689), dungeonUI закрыт, `day === dayBefore+1`, движение мира возобновилось | RED: throw в onDay → exitLocation L2067-2069 не выполнен → dungeonState!=null, dungeonUI.isActive()===true, персонаж на клетке ПЕРЕД exit (exit-проверка ДО мутации — locations.js L321-326: позиция НЕ сдвинута), ДЕНЬ +1 (advanceDay day+=1 ДО listener'ов — day.js L60: даже на master день ушёл — «дни уходят, пока не выйти») | выход завершён принудительно, очистка в finally, день +1 |
| **T6** | confirmResurrect: `G.resurrectUI.open({world}, [{record, цена:25}])` с world-бандлом {hero:{gold:100}, roster:[], deadMercs:[record], npcs, game, flash, **saveNow: ()=>{throw}**, playerRender} (record — valid 000161-форма через deadRecord-паттерн; w.game.companions.reviveEntryFromRecord реальный) → `key(h,'Enter')` (listener пикера виден СЛЕДУЮЩЕМУ диспетчу — harness-семантика) → assert: пикер ЗАКРЫТ, roster 1 запись, gold 75 | RED: throw в w.saveNow (L213) → close() (L216) не достигнут → isActive()===true ВЕЧНО, мир не ходит | try/catch завершения, close снаружи → мутации применены, пикер закрыт |

**Защитные пины (GREEN до и после — фикс не должен их сломать):**
- **T7** — карта: keydown направления → ≤12 кадров → персонаж сдвинулся; rAF жив (PV-1).
- **T8** — подземелье: BFS-клавишами до exit-клетки → `g.dungeon===null`, dungeonUI закрыт, день+1 (PV-4; ТЧ ТЗ «входит на выходную клетку»).
- **T9** — пикер (десктоп): пока открыт — keys пуст/движение 0 (модал-семантика НЕ деградирует: тач-кнопка не разблокирует клавиши при открытом пикере); Esc → закрыт → движение возобновилось (PV-2).
- **T10** — окно смерти 000164: startCombat(6) → `c.ps.poison=99` (яд-тик startRound, 000164 точка 2; 0 RNG, «Несокрушимость» в яд-путь не входит) → Space-луп → `result {outcome:'dead',partyLost:true}` → Space (finish) → alive, −20% золота → движение возобновилось (PV-6; яд, НЕ симуляция ударов — мобы в арене могут быть замурованы препятствиями, пассивный бой вечен).

ПРОВЕРКА RED: в worktree ДО фикса `npm test` — падают осмысленно ровно
T1..T6 (каждый на своём механизме), всё остальное (1905 baseline на 3d5bac4;
на f751298/09ffa25 пересчитать) green. ПОСЛЕ фикса — все зелёные. Флейк чужого
теста → перепуск `node --test tests/файл` + запись в отчёт.

## 5. Контракты и границы (для станции фикса и будущих задач)

- **main.js frame()**: цикл гарантированно продолжается при ЛЮБОМ исключении
  в кадре (watchdog, logged once). Новые точки в frame могут бросать без
  убийства мира — но НЕ опираться на catch для корректности.
- **main.js exitLocation**: после ЛЮБОЙ попытки выхода `dungeonState=null +
  dungeonUI.close() + saveNow()` выполняются (finally) — даже если day-event
  бросил. **000177** (тайл входа-выхода + [E]) ОБЯЗАН вести [E]-выход через
  тот же exitLocation (сохранить finally-инвариант).
- **combat-ui startCombat**: возвращает null при неудаче build/render и НЕ
  оставляет активного состояния (ctx=null, ended=false, оверлей снят) —
  «бой не начался» = идентично состоянию «боев нет»; повторный вызов стартует
  норм. **combat-ui finish**: ВСЕГДА снимает оверлей, обнуляет ctx и вызывает
  onEnd (каждый guard — logged once; пропуск addEfirXp/onEnd при throw —
  документированная деградация).
- **resurrect-пикер (изменение контракта 000162 §4)**: DOM оверлея = title +
  rows + hint + **`div.resurrect-close` (click → close())**. Гейты R-3
  (keydown L1596 / frame inResurrect / visibility building) — БЕЗ ИЗМЕНЕНИЙ.
  Q-2 (отказ — пикер открыт) — БЕЗ ИЗМЕНЕНИЙ (теперь тач-снимаемо кнопкой).
  Файл 000162 в done менять нельзя — правка контракта фиксируется только здесь.
- **Общий инвариант для НОВЫХ интерактивных оверлеев**: оверлей, скрывающий
  D-пад/кнопки (mapping в building/inventory), ОБЯЗАН давать тач-путь снятия
  (кнопка/клик) — иначе = баг-класс 000170/000171. Расширить tests/
  ui-touch-visibility.test.js контрактом «скрыл ввод — есть альтернативный
  тач-путь» (для будущих задач; в 000170 — только T1/T9).
- **Ленивые ссылки и guards**: правки — ТОЛЬКО внутри тел функций (никаких
  новых require-путей, новых модулей, новых <script>); флаги «logged once» —
  модульные `let xErrLogged = false` (паттерн saveWarned L717, spellBookWarned
  combat-ui L118). УМД-порядок (000038/000053) не меняется →
  tests/index-order.test.js не трогать.
- **Детерминизм**: catch-ветки не мутируют игровое состояние сверх
  восстановления (close/ctx-очистка); порядок happy path во ВСЕХ 8 точках —
  бит-в-бит; боевые пины 000163/000164/000167/000168 не сдвигаются.
- **Что важно будущим задачам**: 000171 (combat-ui resurrect-button): мои
  combat-ui-ханки = ТОЛЬКО тела finish() (2 обёртки) и startCombat()
  (1 обёртка + cleanup) — не задевают build()/renderBook/кнопки; при
  конфликте на ребейзе — приоритет структуре 000171, переносить мои
  обёртки. 000177 — см. exitLocation выше. 000176 (world.js) — пересечений
  нет. 000171-принцип («все кнопки UI — с визуальным тач-элементом»):
  resurrect-close — его первая реализация для мира-UI (отметить в ретро).

## 6. Ограничения VM (честная граница доказательной базы)

Proxy-DOM harness (makeEl): стабы не бросают исключений, никогда не возвращают
null, getContext — Proxy-глотатель → естественные браузерные исключения
(null-элементы build/render, canvas/WebGL context loss, resize-гонки 000151)
в vm НЕ ВОСПРОИЗВОДИТСЯ. Красные T2–T6 инъектируют throw в точной точке —
доказывают СОБСТВЕННО property, которого игре не было (exception-безопасность
input-критичных точек), а не конкретный браузерный триггер. **Ручной
браузер-чек ПОСЛЕ мержа (рекомендация, не гейт)**: (1) храм + погибший
наёмник, тач-схема: открыть пикер → тап «Отмена» → закрыт, движение возобновилось;
(2) resize окна в середине боя (combat-scale); (3) выход из подземелья при
полной квоте localStorage; (4) tab-switch в середине боя (blur→keys.clear
уже есть). Записать результат в tasks/result/000170.md.

## 7. Координация с параллельными задачами

- **000168** (в мастере, e80a737): учтён как база (очередь/ввод союзников);
  combat.js НЕ трогаю.
- **000171** (в полёте, combat-ui.js resurrect-button + тач-элементы): мой
  дифф в combat-ui.js минимален (D4/D5) и не пересекается с её ханками
  (build()/кнопки) — ДЕРЖАТЬ ВЕЕР УЗКИМ; ребейз на фактический мастер
  ПЕРЕД МЕРЖЕМ ОБЯЗАТЕЛЕН (мастер сдвинулся: 3d5bac4 → e80a737 → f751298 →
  09ffa25); при конфликте — ревью обоих диффов, приоритет структуре 000171.
- **000176** (в полёте, world.js global-map render): пересечений файлов нет.
- **000177** (pending, тайл входа-выхода + [E]-выход): выходной механизм
  переделают — мой finally-инвариант exitLocation механизм-независим,
  контракт зафиксирован (§5).
- **000178** (в мастере, f751298): тач-кнопки боя — база. **000169** (в
  мастере, 09ffa25): ui.js [I] — не трогаю ui.js.

## 8. Побочная находка — «бесконечный RESCUE» 000164 (НЕ баг)

Сценарий a2: окно смерти (000164) допускает воскрешение ИГРОКА серединой боя
(RESCUE «Воскрешением»/свитком) — проверен цикл смерть↔воскрешение: терминируется
(заклинание/свиток одноразовы, состояние партии консистентно, бой продолжается);
partyLost-путь (не спасён) → подъём −20% золота → движение возобновилось (PV-6,
пин T10). Заморозок не оставляет. Зафиксировано как верифицированное, НЕ
создаётся подзадача.

## 9. Подводные камни (для станции фикса)

1. UMD-ловушка 000038: инъекции тестов — через свойства ОБЪЕКТОВ-ЭКСПОРТОВ
   (G.hud/G.efir/G.playerUI — общие ссылки), НЕ переприсваиванием Game.X;
   resurrect-модуль при загрузке переприсваивает root.Game (Object.assign-
   КОПИЯ) — снапшоты main.js живут через общие ссылки на под-объекты.
2. harness key(): массив listener'ов СНАПШОТИТСЯ до диспетча — listener
   пикера (вешается при open) виден ТОЛЬКО следующим нажатиям.
3. rAF в harness пушит ВСЕ записи: raf[0] = main frame (reschedule той же
   fn), боевой tick — ПОЗЖЕ в массиве; детектор смерти цикла — рост
   raf.length после mainFrameAt (для T2/T3 без боя).
4. `advanceDay` (day.js L59-62): day += 1 (L60) ДО listener'ов → бросивший onDay
   ВСЁ РАВНО сдвигает день: T5 ассертит day+1 (не day===dayBefore).
5. dungeonMove (locations.js L321-324): проверка выхода ДО мутации позиции —
   неудавшийся выход оставляет героя НА выходной клетке (повтор безопасен;
   на master — день+1 за каждый повтор).
6. Q-2 гварды confirmResurrect (мало золота/отряд полон) возвращают БЕЗ close
   ПО ДИЗАЙНУ (000162) — НЕ «чинить» их закрыванием; тач-снимает кнопкой.
7. Self-heal startCombat обязан сбрасывать ended=false И ctx=null (D4) —
   забытый ended=true отравит finish() следующего боя.
8. canvas.width/height пересет каждый кадр (main.js L2558-2560) — частичный
   кадр watchdog-сценария само-исцеляется (не нужен отдельный рендер-гард).
9. Тач-бут в harness: `boot(seed, '?controls=touch')` + тапы по
   G.layoutTouchControls (dpadTap/dpadRelease из пробы); dpadTap работает и
   при display:none (harness не считает CSS) — T1 ассертит ПОДЛИННОЕ
   поведение (клик кнопки + движение после), не «видимость».
10. SEMANTIC-правок существующих тестов НЕТ (инвариант); новый файл —
    единственный тест-артфакт.
11. Коммиты: «Задача 000170: …» (рус.), последний параграф —
    Co-Authored-By: Claude Code <noreply@anthropic.com>. CHANGELOG —
    ОТДЕЛЬНЫЙ коммит (дата 2026-10-10 — фактическая, коммит 4eb8255;
    прежняя пометка 2026-10-09 неточна, исправлено по ревью 2026-10-10,
    формат существующих записей,
    программная часть не перечисляется: «фикс зависаний движения +
    тач-закрытие пикера воскрешения»).

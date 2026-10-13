# 000206: инвентарь (панель персонажа) поверх экрана города/подземелья

Статус: выполнено (реализация + ревью + фикс CI-8 + Finalize;
worktree task/000206, ветка от master e6fcbab; на момент Finalize
master = 2f707dd — rebase-проверка чистая, 2326/2326, см.
tasks/result/000206.md). ТЗ: tasks/done/000206.md (2 строки: баг
«инвентарь проваливается под экран города»; подземелье — проверить,
инвентарь должен быть доступен).
Анализы: а1-домен, а2-архитектура, а3-тесты (разнобой трёх вариантов
решения снят на этой станции — решение и отклонения ниже).

## Баг-механика (корневая причина, сверено с кодом)

* Экран ГОРОДА и экран ПОДЗЕМЕЛЬЯ — ОДИН оверлей dungeonUI:
  `div.combat-overlay.dungeon-overlay` (src/dungeon-ui.js build(), L394),
  `document.body.appendChild(overlay)`. CSS: `.combat-overlay` z-index 20
  (index.html L246), `.dungeon-overlay` — непрозрачный фон #0a0d12
  (index.html L550-554, z-index не переопределяет — 20).
* «Инвентарь» — вкладка панели персонажа `.char-panel`: buildPanel()
  (src/ui.js L111), `document.body.appendChild(panel)` (L229), CSS
  z-index 10 (index.html L62).
* Оба узла — дети body в root stacking context: оверлей (20) > панель (10)
  → панель РЕНДЕРИТСЯ ПОД непрозрачным экраном города/подземелья и
  невидима. [I] (KeyI) обрабатывается в main.js:1821 ДО всех гейтов
  (коммент L1849-1855 документирует намерение «панель поверх ОТКРЫТОГО
  оверлея (боевого/подземелья/NPC/постройки)») — панель реально
  открывается (`isOpen() === true`), но не видна → «проваливается».
* Подземелье — тот же оверлей (kind 'dungeon') — тот же баг (ТЗ п.2:
  подтверждено, чиним оба одним решением).
* Тач-dead-end (бонус, устраняется фиксом): скрытая открытая панель
  скрывает ВСЕ on-screen-контролы (touchControlsVisibility: inventory →
  buttons:false, dpad:false — src/controls.js L346; applyVisibility —
  src/ui.js L1614) → на чистом таче игрок застревает (закрыть нечем:
  ни клавиатуры, ни видимых кнопок). После фикса панель видна, у неё
  своя кнопка «закрыть [I]/[Esc]» (.cp-close).
* Прочие z-20 оверлеи: бой (combat-ui), NPC-диалог (npc-overlay,
  src/ui.js L984), постройка (building-ui L186), крафт (craft-ui L355),
  пикер «Воскрешение» (.resurrect-overlay, index.html L873).

## Что добавлено / перенесено

НОВОГО МОДУЛЯ НЕТ, ПЕРЕНОСА КОДА НЕТ (moveList пуст), index.html НЕ
ТРОГАЕТСЯ (нет новых <script>, нет новых CSS-правил; базовый
`.char-panel` z-10 НЕ МЕНЯЕТСЯ → пин tests/ui-panel.test.js:487-519
зелёный БЕЗ правок; tests/index-order.test.js — без изменений).

* **src/ui.js** (closure playerUI, рядом с isOpen/toggle):
  * `const Z_OVER_LOCATION = 25;`
  * `function applyLayer(overLocation) { if (!panel) return; const z =
    (overLocation && isOpen()) ? String(Z_OVER_LOCATION) : ''; if
    (panel.style.zIndex !== z) panel.style.zIndex = z; }`
  * `G.playerUI`: + `applyLayer` (конец объекта; пина surface'а в
    тестах НЕТ — проверено grep: deepEqual/Object.keys по playerUI
    отсутствуют).
* **src/main.js** `frame()` — ОДИН вызов сразу после блока 000150
  (touchControls.applyVisibility, L3226-3242), ДО `const stepMs`:
  `if (G.playerUI && typeof G.playerUI.applyLayer === 'function')
  { G.playerUI.applyLayer(!!inDungeon && !inCombat && !inNpc &&
  !inBuilding && !inCraft && !inResurrect && !(G.buildingActions &&
  typeof G.buildingActions.renameInputActive === 'function' &&
  G.buildingActions.renameInputActive())); }` — шесть полей из
  УЖЕ ВЫЧИСЛЕННОГО снимка кадра (L3219-3224) + СЕДЬМОЙ конъюнкт
  (правки по итогам ревью — input-оверлей переименования города,
  000148.05, не покрывался 6 флагами): СУЩЕСТВУЮЩИЙ фасад
  (renameInputActive — чистое чтение module-level фазы, ноль новых
  состояний), тот же typeof-паттерн, что main.js применяет для
  этого гейта в keydown (L1818-1820/L2561-2562/L2600-2601).

## Контракты и границы

* **applyLayer(overLocation: boolean)** — контекстный подъём панели:
  * ленивая панель (buildPanel — при первом toggle) — до сборки no-op;
  * идемпотентен: запись `panel.style.zIndex` ТОЛЬКО при смене значения
    (0 DOM-записей в стабильном кадре — паттерн applyVisibility 000150);
  * `'25'` — подъём; `''` — снимает инлайн, действует базовый CSS z-10;
  * подъём СВЯЗАН с открытостью (isOpen()): панель закрыта — `''`,
    даже в локации (CI-2: закрытие — подъём снят, локация цела;
    подъём — свойство ВИДИМОЙ панели, а не экрана);
  * пишет ТОЛЬКО в `panel.style` (stub-safe: DOM-стаб имеет `style: {}`;
    classList НЕ используется — его в стабах нет).
* **Кондиция подъёма** — локация (город/подземелье) ЕДИНСТВЕННЫЙ верхний
  оверлей: `inDungeon && !inCombat && !inNpc && !inBuilding &&
  !inCraft && !inResurrect && !renameInputActive()` — СЕДЬМОЙ
  конъюнкт (правки по итогам ревью): input-оверлей переименования
  города (000148.05) — СЕДЬМОЙ z-20 оверлей, не покрываемый 6
  флагами снимка (фаза — module-level renameInput, фасад
  buildingActions.renameInputActive(); см. «Правки по итогам
  ревью»). Обоснование — паритет с миром «открытый
  ПОЗЖЕ оверлей — СВЕРХУ» (в мире панель z-10 уходит ПОД dialog
  z-20 — закреплённая семантика 000096: Esc-стек — диалог закрывается
  первым, гард escHandler ui.js — npcUI.isActive() +
  combatUI.isActive()&&current().result — НЕ ТРОНУТЫ).
  ДОСТИЖИМЫЕ комбо, где конъюнкты работают:
  * ручной [I] ВО ВРЕМЯ боя — панель переключается (KeyI выше гейтов),
    но остаётся СКРЫТА под боевым оверлеем (z-10 < 20) — поведение БЕЗ
    ИЗМЕНЕНИЙ (до и после; ТЗ бой не касается); авто-закрытие панели
    при старте боя (000096: main.js L1630/2071/2684) не тронут;
  * город + NPC-диалог (таверна → строка «Диалог» → npcUI; [I] поверх
    диалога возможен) — панель ПОД диалогом (паритет с миром);
  * buildingUI.open ЗАКРЫВАЕТ панель перед открытием (000071:
    src/building-ui.js L249-261) — комбо «город + панель + buildingUI»
    НЕДОСТИЖИМО; craft/resurrect — те же гейты/закрытия — конъюнкты
    защитные (belt-and-suspenders).
* **z-лестница** (новый ДИНАМИЧЕСКИЙ слот 25): базовая `.char-panel`
  10 (не меняется) < `.fs-btn` 15 < оверлеи
  `.combat-overlay`/`.dungeon-overlay`/`.resurrect-overlay` 20 <
  **подъём панели (inline zIndex '25')** < `#touch-controls` 30 <
  `.start-window` 40. Базовая лестница 10/15/20/30/40 НЕ ИЗМЕНЕНА →
  комменты index.html (L191-194, L725-727) и лестницы в
  memory/000096, 000086, 000150 остаются точными — править их не надо.
* **inDungeon ⇔ оверлей виден** на границах кадров: все точки входа/
  выхода — синхронные пары (state=ds → startLocationUI /
  state=null → close): enterLocation (main.js L2223/L2231),
  exitLocation (finally L2435-2436), transitionFloor (close → state →
  start — ОДНО синхронное [E]-событие, кадров между ними нет,
  L2476-2478; срыв — ВСЕ-ИЛИ-НИЧЕГО: восстановление/last-resort
  L2490-2496), debug enterDungeon (L3521-3523). Дир нет; в случае
  исключения lift сходилится ≤1 кадра (watchdog 000170 жив).
* **Границы поведения (НЕ МЕНЯЕТСЯ)**: мир (без локации — подъёма нет,
  панель z-10 ПОД диалогом z-20, как раньше); бой (ручной [I] — панель
  скрыта, как раньше); Esc-стек (000096/000086); [E]-путь (000107/
  000177) и гарды isActive (dungeonUI/buildingUI/npcUI) — код не
  тронут; сейвы (collectSaveData/validate — не тронуты, zIndex —
  инлайн-стиль, не сериализуется); RNG — НОЛЬ новых вызовов; вывод
  HUD/панели — побайтово (DOM панели и HTML не меняются, меняется
  только инлайн-стиль); .squad-panel (KeyC) — не тронут (см. ниже).

## Ленивые ссылки и guards

* applyLayer — closure-ссылка на ЛЕНИВУЮ панель (глобальных ссылок
  нет); до buildPanel — no-op.
* typeof-guard на call-site в frame() — деградация mixed-версий
  (паттерн TV7, tests/ui-touch-visibility.test.js:652): ui.js без
  applyLayer → frame не падает.
* Снапшот G.playerUI в main.js (UMD 000038): applyLayer — метод
  ТОГО ЖЕ объекта (ui.js загружен ДО main.js) — нового снапшота нет
  (ловушка 000038 не затрагивается).
* Full-chain vm-песочницы (city-screen/city-interact harness):
  `document.addEventListener` — NO-OP (документные слушатели
  ОТБРАСЫВАЮТСЯ) → в e2e панель закрывается [I], НЕ [Esc] (Esc-
  семантику пинят partial-chain тесты tests/ui-panel.test.js).

## Тесты (НОВЫЙ файл tests/city-inventory-e2e.test.js)

Харнес — копия конвенции tests/city-screen.test.js + helpers
tests/city-interact.test.js (bootSandbox/CHAIN из index.html,
walkTiles с резолвом zone-боя, findCityFor/walkCity/cityStepsTo,
findAll по слову className). Дублирование харнессов — принятая
конвенция (000157.03 D11, 000083/000087).

RED (3 — падают на master осмысленно, зеленеют после фикса):
* **CI-0 surface**: `typeof Game.playerUI.applyLayer === 'function'`
  (full-chain; master: undefined).
* **CI-1 город (ТЗ п.1)**: findCityFor (fp>=2, buildings>=1 —
  протокол CI-V1) + walkTiles; страховка: если после walkTiles
  g.dungeon === null (zone-бой «съел» входной шаг — 000135) —
  bounded re-entry loop ≤3 (резолв → шаг от входа → шаг назад →
  кадр); детерминированный сид боев на финальном шаге НЕ имеет
  (city-screen.test.js зелёный на этом же городе). KeyI → панель
  открыта (isOpen, display 'flex', корень в body) + `.dungeon-
  overlay` в body + dungeonUI.isActive + kind 'city' → кадр →
  `panel.style.zIndex === '25'` (master: undefined — осмысленный
  красный).
* **CI-2 подземелье (ТЗ п.2)**: `g.actions.enterDungeon()`
  (debug-вход) → KeyI → кадр → zIndex '25' + kind 'dungeon' +
  оверлей; KeyI (закрыть) → кадр → подъём снят + локация ЦЕЛА
  (isActive, kind, клетка героя (x,y) не сдвинулись).

Зелёные гварды (6 — фиксируют ГРАНИЦЫ: CI-3..CI-7 проходят ДО и
ПОСЛЕ; CI-8 — правки по итогам ревью, красный до фикса / зелёный
после):
* **CI-3 мир**: KeyI → кадр → подъёма НЕТ (zIndex falsy: undefined
  на master, '' после) + панель открыта; KeyI — закрыла.
* **CI-4 выход из города с открытой панелью** (lift '25'): [E] на
  ЕДИНОМ тайле-двери (000177, спавн на двери) → выход (g.dungeon
  null, isActive false) → кадр → подъём снят + панель ЕЩЁ открыта
  (выход панель не закрывает — существующее поведение).
* **CI-5 город + панель (lift) + [E] на постройке**: walkCity к
  первой постройке (000106: таверна 44, NPC Берта) → KeyE →
  панель ЗАКРЫТА (000071: buildingUI.open закрывает её ПЕРВОЙ —
  состояние «город+панель+buildingUI» недостижимо — фиксируем
  ФАКТ) + buildingUI.isActive → кадр → подъёма нет.
* **CI-6 подземелье + бой (конъюнкт !inCombat)**: enterDungeon →
  KeyI (lift '25') → `g.actions.startCombat()` (debug-бой; ЗАКРЫВАЕТ
  панель) → KeyI (открыл снова, скрыт под боевым оверлеем) → кадр
  → подъёма НЕТ (zIndex falsy) → резолв (combatInternals.
  dealDamageToMob 9999 по живым мобам + Space) → бой закрыт.
  Fallback, если startCombatAt в подземелье нестабилен в песочнице:
  шаг по dg.mobs на клетку моба (реальный startDungeonCombat).
* **CI-7 мир + NPC-диалог (паритет)**: KeyI → кадр (подъёма нет) →
  `G.npcUI.open({ npc: G.NpcData.NPCS[0], character:
  G.createCharacter(), book: G.createQuestBook() })` → кадр →
  подъёма всё ещё НЕТ (мир не изменился; приоритет Esc не тронут).
* **CI-8 город + buildingUI + [I] + «Переименовать город» (правки по
  итогам ревью, major; красный до фикса)**: город СО СВОБОДНОЙ
  клеткой (строка rename есть ТОЛЬКО в меню «Строительство» пустой
  клетки — openCityBuildMenu) → walkCity к ней → [E] (buildingUI;
  000071: панель закрыта ПЕРВОЙ) → [I] (панель открыта, СКРЫТА под
  меню; кадр — подъёма нет, !inBuilding) → клик строки rename-city
  (onOverlayClick → executeAction: close ДО onAction — buildingUI
  закрылся сам; renameCityAt → openCityRenameInput — input-оверлей
  z-20 в body, renameInputActive()) → кадр → подъёма НЕТ
  (falsy). До фикса — осмысленный красный: z-25 (панель накрывала
  input-оверлей — смена поведения, введённая изменением; паритет с
  master: панель z-10 ПОД оверлеем, строка-черновик имени видна;
  эталон CI-V16).

Существующие тесты НЕ правятся (инвариант). Базелн master:
2307 pass / 0 fail (~123 с). Ожидание RED-фазы: падают ТОЛЬКО
CI-0..CI-2 (3 теста нового файла), остальные 2307 + CI-3..CI-7
зелёные. После реализации: всё зелёное (2307 + 9; CI-8 — правки по
итогам ревью).

## Отклонённые альтернативы (решения Проектирования)

* **(a1) базовый z `.char-panel` 10 → 25 (CSS-only)**: меняет мир
  (панель z-25 ВИШЕ диалога NPC z-20 — нарушает визуальную
  закреплённую паритет-семантику 000096) и бой (ручной [I] в бою —
  панель становится ВИДНА поверх боя — вне скоупа ТЗ); требует
  правки СУЩЕСТВУЮЩИХ пинов tests/ui-panel.test.js:507/509
  (zP===10, zP<zF) — инвариант «существующий набор остаётся
  зелёным» соблюдён жёстче у принятого решения.
* **(a3) статический класс `.char-panel--over { z-index: 25 }` на
  корне панели**: те же две layering-смены, что у (a1) — статический
  класс поднимает панель ВЕЗДЕ при открытии (мир: выше диалога;
  бой: выше боя); ТЗ просит город/подземелье — подъём обязан быть
  КОНТЕКСТНЫМ.
* **CSS `body:has(.dungeon-overlay) .char-panel`**: в vm-харнесе
  (node + DOM-стаб) CSS-движика НЕТ — проверка только текстовым
  пином (слабый «красный» без поведения); наивный :has() даёт
  регресс «диалог под панелью» в городе; культура проекта —
  явная проводка с гардами (000150, TV7), не clever CSS.
* **Маркерный класс на body (dungeon-ui start/close + CSS-правило)**:
  DOM-стаб makeEl БЕЗ classList (`classList.add` — TypeError во
  ВСЕХ full-chain песочницах, где start/close исполняются);
  прецедента класса на body нет (grep: 0 uses); риск stale-маркера
  на exception-paths (transitionFloor close→start, debug-вход,
  last-resort).
* **Перенос панели внутрь оверлея**: пин «панель .char-panel
  подвешена к body» (tests/ui-panel.test.js) + ломает DOM-контракт.
* **Подъём .squad-panel (KeyC)**: ВНЕ скоупа ТЗ («инвентарь» =
  .char-panel); 000086 задокументировал squad ПОД оверлеями z-20
  как осознанное решение → кандидат фоллоуп (ниже).

## Правки по итогам ревью (1 major, РЕАЛЕН)

**Finding: поднятая панель (z-25) накрывает input-оверлей
переименования города (z-20) — инверсия layering относительно
master в достижимом состоянии.** Корень: кондиция подъёма исходит
из инварианта «локация — ЕДИНСТВЕННЫЙ верхний оверлей» (6 флагов
снимка кадра), но z-20 оверлеев 7: input-оверлей переименования
(000148.05: div.combat-overlay z-20, child body,
openCityRenameInput building-actions.js L1046/L1074) активен, пока
module-level renameInput !== null — НИ ОДИН из 6 флагов его НЕ
отражает (buildingUI к тому моменту ЗАКРЫТ — executeAction: close
ДО onAction). Достижимое состояние: город → [E] на пустой клетке
(меню «Строительство» — buildingUI; 000071: панель закрыта
ПЕРВОЙ) → [I] (KeyI выше ВСЕХ гейтов — панель открыта, СКРЫТА под
меню, подъёма нет: inBuilding) → клик «Переименовать город»
(renameCityAt → openCityRenameInput) → кадр: inDungeon &&
!inBuilding → applyLayer(true) → z-25: полноэкранная почти
непрозрачная панель (rgba(16,18,24,0.92)) СВЕРХ input-оверлея
z-20 — строка-черновик имени и подсказка «Enter — сохранить,
Esc — отмена» перекрыты, игрок вводит имя вслепую. На master в
этом состоянии панель z-10 — оверлей СВЕРХУ, полностью
виден/используем (эталон CI-V16, tests/city-interact.test.js).
[I] под input-оверлеем заблокирован гейтом renameInputActive
(000148.05, keydown main.js L1818-1820) — панель повторным [I] НЕ
закрыть (видимость — только .cp-close самой панели, которая теперь
сверху); данных не теряется (клавиатурный транспорт — window) —
но видимый input-UI перекрыт = СМЕНА поведения, введённая
изменением. Остальные 6 z-20 оверлеев (combat/building/dungeon/
npc/craft/resurrect) в кондиции покрыты — проверено по ВСЕМ
createElement+className 'combat-overlay' в src/ (dungeon-ui
L394, building-ui L186, ui.js L984, building-actions L1046,
craft-ui L355 + .resurrect-overlay building-effect-resurrect L280).

**Фикс (минимальный)**: седьмой конъюнкт в вызове frame()
(src/main.js): `!(G.buildingActions && typeof
G.buildingActions.renameInputActive === 'function' &&
G.buildingActions.renameInputActive())` — СУЩЕСТВУЮЩИЙ фасад
000148.05 (чистое чтение module-level фазы — ноль новых
состояний), тот же typeof-паттерн, что main.js уже применяет для
этого гейта в keydown (L1818-1820/L2561-2562/L2600-2601). Ноль
новых вызовов RNG; сейвы не тронуты (zIndex — инлайн-стиль).
Тест: **CI-8** (tests/city-inventory-e2e.test.js) — сценарий выше,
гвард «кадр → подъёма НЕТ» (красный до фикса — z-25 подтверждён
прогоном; зелёный после). Набор: 2315 → 2316.

## Что важно будущим задачам

* **.squad-panel (KeyC) — латентный близнец того же бага** (z-10:
  в городе/подземелье/бою панель «Отряд» невидима под оверлеем;
  тач-dead-end там невозможен — тач-кнопки [C] нет). НЕ исправлен
  здесь (расширение скоупа = смена поведения сверх ТЗ). Если
  захотят — отдельная задача: аналог applyLayer для squadUI либо
  вынесение общего lift-хелпера.
* **Внутреннее противоречие документов РАЗРЕШЕНО**: main.js
  L1849-1855 (намерение ввода «панель поверх ОТКРЫТОГО оверлея»)
  vs старая лестница 10<20 (index.html L191-194, memory/000096) —
  выбрано намерение ввода, НО контекстно: панель над ЛОКАЦИЕЙ,
  но ПОД другими z-20 оверлеями, открытыми позже. Если в будущем
  придёт требование «панель ВСЁГДА сверху» — это отдельная задача
  (менится кондиция + гварды CI-3/CI-6/CI-7).
* **НЕ «упрощать» lift в статический z/класс** — гварды CI-3/CI-6/
  CI-7/CI-8 фиксируют границы (мир/бой/диалог/rename-input без
  подъёма).
* **Точка вставки в frame()** — после блока 000150 (до stepMs).
  Волна 1 (000191/000192/000200/000201/000203/000193.02) может
  добавить frame()-кода — после rebase на свежий master точку
  пере-выбрать по факту.
* **Full-chain песочницы отбрасывают document-слушатели** — в новых
  e2e [Esc] не работает (панель закрывать повторным [I]); Esc-
  семантика по-прежнему пинится в partial-chain (tests/ui-panel.
  test.js).
* Тач-dead-end в городе/подземелье УСТРАНЁН этим фиксом (панель
  видна, у неё кнопка «закрыть») — для будущих тач-задач:
  touchControlsVisibility-логика (controls.js L346) не тронута.

## Подводные камни

* render() playerUI НЕ вызывается при входе/выходе из локации —
  render-driven z-index дал бы ДЫРУ (панель, открытая в мире,
  «провалилась» бы при входе в город до следующего render()) —
  поэтому frame-driven подъём.
* transitionFloor (close → state → start) — синхронно в одном
  [E]-событии: межкадровых «state без оверлея» НЕТ; при срыве —
  ВСЕ-ИЛИ-НИЧЕГО (восстановление на старый этаж / last-resort) —
  lift сходилится ≤1 кадра.
* zone-бой «съедает» вход в локацию (в frame бой приоритетнее
  enterLocation; вход откладывается на следующий успешный шаг —
  000135) — в e2e: резолв боя в walkTiles после каждого шага +
  re-entry loop в CI-1.
* В городе [E] на клетке постройки — buildingUI.open ЗАКРЫВАЕТ
  панель ПЕРВОЙ (000071) — не путать с CI-5 («панель открыта
  поверх buildingUI» — недостижимо; пин — факт закрытия).
* Пин базового z-10 (tests/ui-panel.test.js:507) — ГРАНИЦА
  решения: обязан остаться зелёным БЕЗ правок; любой «лишний»
  подъём базового z сломает его и гварды CI-3/CI-6/CI-7.
* В песочнице performance.now() заморожен (NOW=1000) — кадры
  вызывать h.frameFn(now) с управляемым now; боевой резолв —
  handleCode('Space'), кадры для боя не нужны.
* Комментов в src/ НЕТ (CLAUDE.md e6fcbab): весь контекст — здесь
  + текст задачи + компактный хедер нового тест-файла со ссылкой на
  этот файл (конвенция тестов).

## План реализации (файлы, дельта)

* src/ui.js: +~8 строк (константа Z_OVER_LOCATION, applyLayer,
  экспорт в G.playerUI).
* src/main.js: +~3 строки (один guarded call в frame()).
* tests/city-inventory-e2e.test.js: НОВЫЙ, ~900 строк (харнес +
  helpers + 9 тестов CI-0..CI-8).
* memory/000206-inventory-over-city.md: этот файл.
* tasks/pending/000206.md → tasks/done/000206.md (git mv) +
  tasks/result/000206.md (отчёт).
* index.html: 0. CHANGELOG.md: 0 (по harness: не игровой процесс,
  не графика, не управление).
* Порядок: RED-стадия коммитит тесты + memory (3 красных) →
  реализация → полный `node --test tests/` (2307 + 8 зелёных) →
  rebase на свежий master (волна 1) → перепрогон → финальный
  единый коммит «Задача 000206: …» + Co-Authored-By.

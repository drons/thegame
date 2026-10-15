# 000217: панель «Отряд» (KeyC) — подъём z-25 в городе/подземелье/бою

Статус: ВЫПОЛНЕНО (финализация 2026-10-15; отчёт tasks/result/000217.md;
задача в tasks/done/). Реализация 4a0aefd (rebase на 4ffb9f5 чистый, 0
конфликтов), правки ревью efcfa66 (кода не потребовалось). Финальный
npm test на станции финализации: 2530/2530, 0 fail, EXIT 0. Ребейз на
master финализации (9931226) — стадия мержа: ожидаемый конфликт ТОЛЬКО
CHANGELOG.md (объединить «## 2026-10-15» с подзаголовками «### Игровой
процесс» 000216 + «### Интерфейс» 000217). База Проектирования: master
60f2dda (worktree task/000217, ветка task/000217; src/ui.js, src/main.js,
index.html сверены с основным репозиторием — идентичны). Базелн npm test:
2509 (2508 зелёных + 1 флейк tests/map.test.js perf-tileAt — тайминг-тест
под нагрузкой; перепуск файла 74/74; к задаче не относится).
ТЗ: tasks/pending/000217.md. База-близнец: memory/000206-inventory-over-
city.md (.squad-panel там зафиксирован «кандидатом фоллоуп»); баг найден:
tasks/result/000206-retro-20261014.md (finding major #1); контракт панели:
memory/000086-squad-panel.md; условие frame() после 000195:
memory/000195-combat-inventory-panel.md; тестовый прецедент:
tests/city-inventory-e2e.test.js (000206/000195, CI-0..CI-11).
Анализы: a1-домен, a2-архитектура, a3-тесты. Разнобой трёх вариантов
(имя/место хелпера, hunk frame(), имя тест-файла, набор гвардов) снят на
станции Проектирования — решения и отклонения ниже.

## Корень бага (верифицировано по коду 60f2dda)

* `.squad-panel` (KeyC): CSS index.html L761-775, `z-index: 10` (L774;
  в ТЗ «L761-774» — off-by-one на закрывающую скобку, суть верна). Панель —
  child body: ленивый buildSquad() (src/ui.js L1207),
  `document.body.appendChild(panel)` (L1270).
* Экран ГОРОДА и ПОДЗЕМЕЛЬЯ — ОДИН оверлей `div.combat-overlay.dungeon-
  overlay` (src/dungeon-ui.js build(), child body), `.combat-overlay`
  z-20 (index.html L251); боевой оверлей — тот же класс z-20
  (src/combat-ui.js). Root stacking context: 20 > 10 → в городе/подземелье/
  бою панель РЕНДЕРИТСЯ ПОД непрозрачным оверлеем и невидима.
* KeyC (src/main.js L1892-1894) — СВОБОДНА, выше ВСЕХ гейтов (после
  resurrect/rename-гейтов, после KeyI, до KeyE) — панель РЕАЛЬНО
  открывается (isOpen true, display 'flex') в городе/подземелье/бою, но
  «провалена» — точный близнец бага 000206 (там [I], .char-panel).
* В бою main.js-ключи доходят: combat-ui keydown (зарегистрирован ДО
  main.js, тот же target window) при consumed вызывает stopPropagation() —
  на слушатели ТОГО ЖЕ target не действует → KeyC исполняется в бою (KeyI —
  установлено 000195). В фазе c.result прочее кроме Space/Enter —
  consumed=false → [C] тоже доходит.
* Тач: кнопки [C] нет (000086) → touch-dead-end невозможен;
  touchControlsVisibility (controls.js) не трогается.
* Авто-закрытие squad-панели — ТОЛЬКО 3 входа боя (000086: main.js
  L1693/2137/L2767). Выход из локации панель НЕ закрывает (exitLocation
  finally: только dungeonUI.close + saveNow) → при выходе панель остаётся
  открытой (CI-4-семантика, зеркало char-panel).
* buildingUI.open (src/building-ui.js L266-269) закрывает ТОЛЬКО playerUI —
  состояние «город + squad открыта + buildingUI» ДОСТИЖИМО (в отличие от
  char, 000071) — подъёма там быть НЕ должно (!inBuilding); панель z-10
  ПОД buildingUI z-20 — паритет с master (смен поведения нет).

## Что добавлено / перенесено (точный код)

Новых модулей/файлов/<script>/CSS НЕТ. index.html — 0 изменений.

### src/ui.js (3 точки, всё внутри существующего файла)

(1) playerUI-регион L497-502 — const НА СВОЕЙ строке (не переносится),
тело старого applyLayer переезжает в хелпер БИТ-В-БИТ, applyLayer — делегат:
```js
  const Z_OVER_LOCATION = 25;
  function applyPanelLayer(panel, isOpen, overLocation) {
    if (!panel) return;
    const z = (overLocation && isOpen()) ? String(Z_OVER_LOCATION) : '';
    if (panel.style.zIndex !== z) panel.style.zIndex = z;
  }
  function applyLayer(overLocation) {
    applyPanelLayer(panel, isOpen, overLocation);
  }
```
(2) squad IIFE — между закрывающей скобкой toggle (L1402-1417) и
`G.squadUI = {` (L1418):
```js
    function applyLayer(overLocation) {
      applyPanelLayer(panel, isOpen, overLocation);
    }
```
(closure-ссылка на ЛЕНИВУЮ squad-панель — паттерн playerUI; до buildSquad —
no-op).
(3) объект G.squadUI — `applyLayer,` ПОСЛЕ `isOpen,` (L1434) — АДДИТИВНО:
точного пина набора ключей НЕТ (P1 tests/squad-panel.test.js проверяет
typeof по 4 методам init/toggle/render/isOpen, не исчерпывающий список;
grep по tests/: 0 deepEqual/Object.keys по squadUI/playerUI).

Game-поверхность: +G.squadUI.applyLayer. Топ-уровневых Game.* экспорта НЕТ
(хелпер приватен) → снапшот 000038 и load-purity ui.js не затронуты
(только const+function, ноль side effects; index-order зелёный).

### src/main.js — frame(), ОДНА вставка после playerUI-блока (L3376),
до hudOver (000212) и stepMs:
```js
      // 000217: панель «Отряд» — тот же подъём, что 000195/000206
      // (баг-близнец: z-10 под оверлеем z-20 в городе/подземелье/бою).
      if (G.squadUI && typeof G.squadUI.applyLayer === 'function') {
        G.squadUI.applyLayer(!!(inDungeon || inCombat) && !inNpc
          && !inBuilding && !inCraft && !inResurrect && !(
            G.buildingActions
            && typeof G.buildingActions.renameInputActive === 'function'
            && G.buildingActions.renameInputActive()));
      }
```
* playerUI-блок (L3367-3376, коммент 000195) — БЕЗ ИЗМЕНЕНИЙ (byte-стабиль
ность 000206/000195 → нулевой регресс-поверхности на char-стороне,
минимальный rebase-поверхность).
* Кондиция повторяет 7 конъюнктов Дословно: 6 флагов из УЖЕ ВЫЧИСЛЕННОГО
снимка кадра (inCombat/inDungeon/inNpc/inBuilding/inCraft/inResurrect,
L3342-3347) + фасад 000148.05 renameInputActive (building-actions.js
L1007-1009 — чистое чтение module-level фазы `renameInput !== null`,
ноль новых состояний). ИСТОЧНИК ПРАВДЫ кондиции — playerUI-блок: будущее
изменение кондиции — в ОБА вызова (поведение char запинено CI-*/195-LIFT).
* typeof-гард — паттерн TV7 (mixed-версии «ui.js без squadUI.applyLayer» →
frame не падает; деградация = нет подъёма, как на master). В mixed-версии
без playerUI renameInputActive() вызываться НЕ начинает (аргумент вычис-
ляется только при проходе гарда — в отличие от hoisted-const-варианта).
* hudOver (000212, L3377-3387) — НЕ ТРОГАЕТСЯ (у него своя
6-конъюнктная кондиция, инлайн — прецедент стиля файла).

### index.html — 0 ИЗМЕНЕНИЙ
Базовый `.squad-panel` z-10 (L774) НЕ МЕНЯЕТСЯ (ТЗ п.1, паттерн 000206);
новых <script>/CSS НЕТ → tests/index-order.test.js без правок. Сталый
коммент L754-760 («ниже боевых/подземельных оверлеев (z-20)») после фикса
стёрт — КОСМЕТИКА, НЕ правим (прецедент 000206 оставил свой стёртый коммент
L191-194; территория ретро-пинов) — зафиксировано как фоллоуп ниже.

## Контракты и границы

* **applyPanelLayer(panel, isOpen, overLocation)** — общий подъём:
  * ленивая панель — до сборки no-op (`if (!panel) return`);
  * идемпотентен: запись `panel.style.zIndex` ТОЛЬКО при смене значения
    (0 DOM-записей в стабильном кадре — паттерн applyVisibility 000150);
  * `'25'` — подъём; `''` — снимает инлайн, действует базовый CSS z-10;
  * подъём СВЯЗАН с isOpen(): панель закрыта — `''`, даже в локации
    (подъём — свойство ВИДИМОЙ панели);
  * пишет ТОЛЬКО в `panel.style` (DOM-стабы имеют `style: {}`;
    classList НЕ используется — его в стабах нет).
* **G.squadUI.applyLayer(overLocation: boolean)** — тот же контракт для
  squad-панели (замыкание: панель + isOpen из squad-IIFE).
* **Кондиция подъёма** — та же, что playerUI после 000195:
  `!!(inDungeon || inCombat) && !inNpc && !inBuilding && !inCraft
  && !inResurrect && !renameInputActive()` И панель открыта. Следствия:
  * город/подземелье — '25' (видима над .dungeon-overlay z-20);
  * бой (в любом контексте) — '25' (видима над боевым оверлеем — паритет
    char-panel 000195/CI-9; ТЗ-запас «если бой вне скоупа» не сработал);
  * мир — '' (подъёма нет; панель z-10 ПОД NPC-диалогом z-20 — паритет
    000096; панель и так видима — оверлея нет);
  * NPC-диалог/постройка/крафт/воскрешение/rename-input — '' (открытый
    позже оверлей — СВЕРХУ; Esc-стек 000096/000086 не тронут);
  * закрытая панель — '' даже в локации/бою.
* **z-лестница НЕ ИЗМЕНЕНА**: базовая 10 < .fs-btn 15 < оверлеи
  (.combat-overlay/.dungeon-overlay/.resurrect-overlay) 20 < ДИНАМИЧЕСКИЙ
  слот 25 (inline; общий: char-panel 000206/000195, squad-panel 000217,
  #hud 000212) < #touch-controls 30 < .start-window 40. Пины базовой
  лестницы (tests/ui-panel.test.js: z-10 .char-panel; DH-1 000212: #hud
  '25'; CI-*) — зелёные БЕЗ правок.
* **Сброс подъёма (ТЗ п.2)** — АВТОМАТИЧЕСКИЙ, frame-driven: выход из
  города/подземелья (inDungeon false) и конец боя (inCombat false) → ''
  в ≤1 кадре. Входы/выходы — синхронные пары state→UI (watchdog 000170).
  НОВЫХ close-правил НЕТ: выход из локации панель НЕ закрывает
  (CI-4-семантика); 3 close-точки боя 000086 (main.js L1693/L2137/L2767)
  не тронуты.
* **Достигаемые граничные состояния**: город + squad открыта + buildingUI
  (buildingUI.open закрывает только char — 000071) — подъёма НЕТ
  (!inBuilding), панель ПОД buildingUI z-20, как на master;
  мир + NPC-диалог — подъёма нет; rename-input — подъёма нет (7-й конъюнкт).
* Сейвы: zIndex — инлайн-стиль, не сериализуется (collectSaveData/
  validate не тронуты); RNG — НОЛЬ новых вызовов; вывод панели побайтово
  (DOM/HTML не меняются — только инлайн zIndex).

## Ленивые ссылки и guards

* Оба applyLayer — closure-ссылки на ЛЕНИВУЮ панель; на загрузке ui.js —
  НОЛЬ чтений G (UMD-ловушка 000038). applyPanelLayer — function-декларация
  внешнего IIFE (hoisted), видна вложенному squad-IIFE; Z_OVER_LOCATION
  читается ТОЛЬКО в момент вызова.
* typeof-гард в frame() — TV7 (mixed-версии → деградация без падения).
* Снапшот G.squadUI в main.js (000038): applyLayer — метод ТОГО ЖЕ объекта
  (ui.js грузится ДО main.js) — нового снапшота нет.
* Full-chain vm-песочницы: document-слушатели NO-OP (отбрасываются) →
  в e2e панель закрывать повторным KeyC, НЕ [Esc] (Esc-семантика пинится
  partial-chain tests/squad-panel.test.js).

## Ограничение c.result (баннер результата боя) + кандидат фоллоуп

* Фаза c.result (баннер «ПОБЕДА!/гибель» z-20): [C] доходит до main.js
  (consumed=false) → панель открывается И ПОДНИМАЕТСЯ (z-25) — баннер
  перекрыт до ручного закрытия. У char-panel такого состояния нет
  (правка ревью 000195: авто-закрытие playerUI в combat-ui render,
  каждый кадр). Зеркало для squad НЕ переносится: код — в src/combat-ui.js
  (ФАЙЛ параллельной 000216 — вне скоупа), вариант в main.js frame() —
  поведение сверх ТЗ. Состояние узкое (ручной [C] в фазе результата),
  dead-end НЕТ (у панели кнопка «закрыть [C]/[Esc]» и [C] работают;
  баннер вернётся после закрытия), данных не теряется.
* Кандидат фоллоуп: при следующей правке src/combat-ui.js (000216+)
  рядом с playerUI-авто-закрытием добавить guarded
  `if (G.squadUI && G.squadUI.isOpen()) G.squadUI.toggle(false);`
  + пин авто-закрытия (паттерн SQ-7). 2026-10-15: 000216 в master
  (6f0b843) — блок «файл параллельной задачи» СНЯТ, файл свободен;
  вердикты станции ревью — tasks/result/000217.md §«Правки по
  итогам ревью».
* SQ-7 гвардит ТОЛЬКО сброс zIndex + работоспособность, НЕ авто-закрытие
  (асимметрия — существующее поведение, вне скоупа ТЗ).

## Тесты (НОВЫЙ файл tests/squad-panel-e2e.test.js; тест-карта SQ-0..SQ-7)

Харнес — КОПИЯ конвенции tests/city-inventory-e2e.test.js (принятая
конвенция дублирования харнессов, 000157.03 D11): vm-песочница, полный
CHAIN из index.html (автоматически подхватывает изменённые src/ui.js +
src/main.js), WebGL-стаб, «снисходительный» DOM, winListeners, drain ×3,
key() со снапшотом слушателей, frameFn из raf, NOW=1000 заморожен,
walkTiles с resolveCombat zone-боя (000135) + findCityFor/enterCity
(bounded re-entry ≤3) + cityStepsTo, resolveCombat (dealDamageToMob 9999
по живым мобам + Space). `panelOf(h) = findAll(h.body, '.squad-panel')[0]`.
Компактный хедер файла — со ссылкой на этот memory-файл (конвенция 000206).
document-слушатели в full-chain ОТБРАСЫВАЮТСЯ → закрывать KeyC, не Esc.

RED (4 — падают на 60f2dda ОСМЫСЛЕННО: нет метода/подъёма, не синтаксис):
* **SQ-0 (surface)**: полный бут → `typeof G.squadUI.applyLayer ===
  'function'` (master: undefined).
* **SQ-1 (город, ТЗ п.1)**: enterCity (fp>=2, buildings>=1; walkTiles +
  bounded re-entry ≤3) → assert `.dungeon-overlay` в body +
  G.dungeonUI.isActive() + kind 'city' → KeyC → панель ОТКРЫТА
  (isOpen true, display 'flex', корень .squad-panel в body) → кадр →
  **`panel.style.zIndex === '25'`** (master: undefined).
* **SQ-2 (подземелье, ТЗ п.1)**: `g.actions.enterDungeon()` (debug) →
  kind 'dungeon' + оверлей → KeyC → открыта → кадр → **'25'** → KeyC
  (закрыть) → кадр → подъём снят (falsy) + локация ЦЕЛА (isActive, kind,
  клетка героя (x,y) не сдвинулась).
* **SQ-3 (бой, ТЗ п.1 «в бою — то же»)**: мир → KeyC (открыта) →
  `g.actions.startCombat()` (debug) → assert панель АВТО-ЗАКРЫТА
  (isOpen false — поведенческий пин close-точки 000086) → KeyC
  (открыла СВОБОДНА в бою) → кадр → **'25'** (паритет 000195/CI-9: панель
  СВЕРХ боевого оверлея) → KeyC (закрыть) → кадр → falsy.

Зелёные гварды (4 — проходят ДО и ПОСЛЕ; фиксируют ГРАНИЦЫ, ТЗ п.2/п.3):
* **SQ-4 (мир, ТЗ п.3)**: KeyC → кадр → подъёма НЕТ (zIndex falsy —
  базовый z-10) + панель открывается/закрывается (KeyC ×2) (паритет CI-3).
* **SQ-5 (выход из города с открытой панелью, ТЗ п.2, паттерн CI-4)**:
  enterCity → KeyC → кадр '25' → [E] на ЕДИНОМ тайле-двери (000177, спавн
  на двери) → выход (g.dungeon null, isActive false) → кадр → **lift снят**
  + панель ЕЩЁ открыта (выход не закрывает — существующее поведение) +
  работает (KeyC закрывает).
* **SQ-6 (выход из подземелья, ТЗ п.2)**: enterDungeon → KeyC → кадр '25'
  → герой к exit-клетке (dungeonMove; при мобах на пути — resolveCombat,
  протокол 000135) → [E] → выход → кадр → **lift снят** + панель открыта
  и работает. (Прецедент [E]-выхода из подземелья: T-7
  tests/dungeon-city-time-e2e.test.js.)
* **SQ-7 (конец боя, ТЗ п.2)**: мир → startCombat → KeyC → кадр '25' →
  resolveCombat (9999+Space) → кадр → **lift снят** (inCombat false) +
  панель ЕЩЁ открыта и работает (конец боя squad не закрывает — см.
  «Ограничение c.result»: гвард НЕ ассертит авто-закрытие).

Итого 8 тестов. Базелн 2509 → RED-фаза: падают ТОЛЬКО SQ-0..SQ-3 (4);
SQ-4..SQ-7 + остальные ~2509 зелёные. Финал: **2517 pass / 0 fail**.
Существующие тесты НЕ правятся (инвариант); технических правок НЕТ (новых
модулей/файлов/<script>/require-путей нет, пинов на ключи нет).
Обязаны остаться зелёными БЕЗ правок: CI-0..CI-11, 195-LIFT, DH-*,
000214/000215, squad-panel P1-P6/S1-S3 (hunk в frame() не задевает
keydown/init/close-точки), ui-panel (CSS z-лестница), index-order, TV-*,
svg, goldens (main-visuals/global-map-draw), combat-детерминизм, save-*.

## Отклонённые альтернативы (решения Проектирования)

* (a) копия applyLayer в squadUI closure (5 строк) — ТЗ «Цель» дословно:
  «без дублирования логики applyLayer».
* (b) хелпер на Game-поверхности (G.applyPanelLayer) — расширяет
  Game-снимок/поверхность без нужды: обе панели в ОДНОМ файле;
  приватного хелпера достаточно (SQ-0 пинит G.squadUI.applyLayer).
* (c) базовый CSS .squad-panel z-10→25 или статический класс — меняет мир
  (панель ВЫШЕ диалога NPC z-20 — паритет 000096) и бой; ТЗ: базовый
  z-10 НЕ менять, нового CSS-класса нет.
* (d) CSS body:has() / маркерный класс на body — vm-песочница БЕЗ
  CSS-движка (красный без поведения) + classList в DOM-стабах отсутствует
  (TypeError) — аргументы 000206 переносятся как есть.
* (e) перенос панели внутрь оверлея — ломает DOM-контракт (child body;
  пины squad-panel.test.js P2/P6).
* (f) общий `const overLocation` в frame() (вариант a2: hunk-перезапись
  playerUI-блока) — переписывает byte-стабильный 000195 call-site; в
  mixed-версии без playerUI renameInputActive() начался бы вызываться
  каждый кадр ДО typeof-гардов (сдвиг деградации относительно master);
  прецедент файла — hudOver (000212) инлайнит кондицию в соседнем блоке.
* (g) имя applyOverLocationLayer + перенос const на вершину IIFE (a2) —
  без выигрыша: in-place версия — минимальный diff (const на той же
  строке, тело хелпера бит-в-бит), hoisted-функция видна во всём IIFE.
* (h) расширение tests/city-inventory-e2e.test.js — 000219 (зависимая
  задача) пинит city-inventory-e2e/ui-panel/city-interact СТРОГО ПОСЛЕ
  мержа 000217 → новый файл = нулевой merge-overlap.
* (i) авто-закрытие squad-панели в c.result (зеркало 000195) — код в
  combat-ui.js (фаил 000216) + поведение сверх ТЗ → «Ограничение» +
  кандидат фоллоуп.
* (j) опциональные гварды конъюнктов (buildingUI/NPC-диалог/rename),
  unit-якорь идемпотентности squad applyLayer, CSS-пин .squad-panel z-10
  (раздел a3 «Опциональные») — за пределами минимума ТЗ: не включены
  (8 тестов покрывают ТЗ-раздел «Тесты» 1:1; конъюнкты покрыты дословно
  той же кондицией, что запинена CI-5/CI-7/CI-8 на char-стороне).

## Что важно будущим задачам

* **Единая точка lift**: applyPanelLayer (src/ui.js) — любой БУДУЩЕЙ
  панели, которой нужен подъём z-25 над оверлеем локации/боя: тонкое
  замыкание applyLayer (паттерн playerUI/squadUI) + guarded call в
  frame() по той же
  7-конъюнктной кондиции. НЕ «упрощать» в статический z/класс — гварды
  фиксируют границы контекстности (мир/диалог/rename — без подъёма; бой —
  с). Кондиция живёт в 2 вызовах frame() (byte-стабильность playerUI-блока)
  — изменение — в ОБА.
* **000219** (ретро-пины city-inventory-e2e/ui-panel/city-interact)
  зависит от мержа 000217/000216 — строго ПОСЛЕ; отсюда НОВЫЙ тест-файл,
  не расширение чужого.
* **Коммент index.html L754-760** (squad «ниже оверлеев z-20») — стёрт
  после фикса — косметика, НЕ правим (прецедент 000206; ретро-территория).
* **Full-chain песочницы отбрасывают document-слушатели** — в новых e2e
  закрывать панель KeyC, не Esc (Esc — partial-chain).
* **Один worktree = ОДИН полный node --test** (memory: 000054 мутирует
  src/npc-data.js; проверять ps перед полным прогоном; после —
  git status --porcelain пуст).
* **Динамический z-25 слот общий** (char-panel/squad-panel/#hud) — новым
  поверхностям при необходимости — СВОЙ уровень, не 25 (hudOver 000212 —
  своя кондиция, город вне скоупа).
* **Кандидаты фоллоупов**: (1) c.result-авто-закрытие squad — в
  combat-ui.js при 000216+; (2) стёртый CSS-коммент index.html;
  (3) z-20 «оверлейная» сторона лестницы .squad-panel не запинена тестами
  (ретро 000206: аналог для .combat-overlay) — при желании — CSS-пин.

## Подводные камни

* render() squad вызывается при hire/dismiss/init, но НЕ при входе/выходе
  из локации/боя → render-driven z-index дал бы ДЫРУ (панель, открытая в
  мире, «провалилась» бы при входе в город до следующего render) —
  подъём frame-driven (прецедент 000206).
* transitionFloor (close → state → start) — синхронно в одном [E]-событии:
  межкадровых «state без оверлея» нет; при срыве — ВСЕ-ИЛИ-НИЧЕГО; lift
  сходится ≤1 кадра (watchdog 000170).
* zone-бой «съедает» вход в локацию (000135) — в e2e: resolveCombat в
  walkTiles после каждого шага + bounded re-entry ≤3 (SQ-1).
* В городе [E] на клетке постройки — buildingUI.open закрывает ТОЛЬКО char
  (в отличие от CI-5: squad-состояние «город+панель+buildingUI»
  ДОСТИЖИМО) — паритет с master: подъёма нет (!inBuilding), панель под
  оверлеем z-20.
* Пин базового z (tests/ui-panel.test.js:507) — про .char-panel;
  CSS-пина .squad-panel z-10 в тестах НЕТ — базовая лестница не тронута,
  существующие пины зелёные без правок (см. фоллоуп (3)).
* В песочнице performance.now() заморожен (NOW=1000) — кадры через
  h.frameFn(now); боевой резолв — dealDamageToMob 9999 + handleCode('Space').
* Комменты в src/ — только короткий task-указатель в новой ветке frame()
  (2 строки; конвенция D8 000212: «короткие указатели в местах новых
  веток — конвенция кодовой базы»); в ui.js НОВЫХ комментариев НЕТ
  (helper без комментария — контекст здесь + хедер тест-файла).
* Rebase: master мог уйти — точку вставки frame() пере-выбрать ПО ФАКТУ
  (анкоры: конец playerUI.applyLayer-блока + коммент 000212 hudOver);
  мерж-конфликты memory-сносок (000206/000086) — re-apply после rebase
  (000216/000218/000211.x/000209 эти файлы не трогают — риск низкий).

## План реализации (файлы, дельта)

| Файл | Действие | Дельта |
|---|---|---|
| src/ui.js | helper в L497-502 (1 строка изменена +3) + squad-closure applyLayer (+3) + экспорт (+1) | ~+7 |
| src/main.js | frame(): систерский guarded-блок после L3376 (2 строки комментария + 7 кода) | +9 |
| tests/squad-panel-e2e.test.js | НОВЫЙ: харнес (копия city-inventory-e2e) + SQ-0..SQ-7 | ~+1000 |
| memory/000217-squad-panel-over-location.md | НОВЫЙ (этот файл) | ~+210 |
| memory/000206-inventory-over-city.md | строка-сноска (squad-bullet: «исправлено 000217») | ±1 |
| memory/000086-squad-panel.md | строка-сноска в §3 (+applyLayer; z-10-дизайн переписан) | +1 |
| CHANGELOG.md | новый раздел `## 2026-10-15` / `### Интерфейс` (панель «Отряд» видна в городе/подземелье/бою) | ~+5, ОТДЕЛЬНЫЙ коммит |
| tasks/pending/000217.md → tasks/done/000217.md + tasks/result/000217.md | git mv + отчёт (на финале) | — |
| index.html | — | 0 |

Порядок: (1) RED-коммит — тест-файл + этот memory + 2 сноски (красные ТОЛЬКО
SQ-0..SQ-3) → (2) реализация — src/ui.js + src/main.js → полный прогон
(2517/0; ОДИН serial в worktree) → (3) rebase на свежий master (точку
frame()-hunk и memory-сноски пере-сверить по факту) → перепрогон →
(4) CHANGELOG — отдельный коммит «Задача 000217: CHANGELOG — …» (дата
2026-10-15, формат по существующим записям, программная часть не
перечисляется) → (5) отчёт + pending→done → финальный ЕДИНЫЙ коммит
«Задача 000217: …» + Co-Authored-By (squash: reset --soft + commit на
ветке, потом ff-only — memory one-commit-per-task-squash).

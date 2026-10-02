# 000123 — Кнопки [E] и [I] на глобальной карте: обе схемы + SVG-иконки

Дата: 2026-10-02. Worktree: .worktrees/task-000123, ветка task/000123,
база master 85fdc3e (база npm test 1311/1311). Статус: стадия
«Проектирование» завершена — архитектура и контракты финальны; реализация
по плану в конце. ТЗ: tasks/pending/000123.md (сверено с master e08e7b0 —
ДЕЛЬТЫ: assets/ui/ уже существует (000124), toggleNpcDialog убран
(000071/000128), вкладки панели — UMD-модули 000130; строковые ссылки ТЗ
сдвинуты — фактические номера строк ниже актуальны).

## Что добавлено / перенесено

* НОВЫХ JS-МОДУЛЕЙ НЕТ, новых `<script>` в index.html НЕТ (прецедент
  000124) → новых пинов tests/index-order.test.js НЕТ; vm-песочницы
  грузят цепочку из index.html и подхватывают правки автоматически.
* src/controls.js (чистое ядро, L131/199-217/228-238): `layoutTouchControls`
  возвращает `{dpad, action, inventory}`; `touchActionAt` → 'inventory';
  `TOUCH_ACTIONS` += 'inventory'.
* assets/ui/: ДВЕ новые иконки — `icon_action.svg` (дверь),
  `icon_inventory.svg` (сундук). Каталог СУЩЕСТВУЕТ (000124: 8 файлов
  combat_*.svg) — общий; счётчик tests/svg.test.js `'ui': 8` → `10`
  (L450; всего 295 → 297 файлов).
* src/ui.js: IIFE тач-контролов (L820-985) — вторая кнопка [I] с иконкой,
  D-pad по флагу `h.dpad === true`, перестройка `applyLayout` (ранний
  return по dpadEl убивает кнопки в keyboard-схеме — см. Подводные камни);
  ядро панели (000130) — `toggle(force, tabId)` (ТЗ п. 6 — ДЕЛАЕМ).
* src/main.js (блок тач-инициализации L845-887): `init()` + `show()` в
  ОБЕИХ схемах; `onInventory`.
* index.html: CSS блока #touch-controls (L205-216) — flex-центрирование
  `.tc-action` + новое правило `.tc-action img`.
* tests/controls.test.js: 4 красных теста R1-R4 (node, require
  src/controls.js) + 1 техправка deepEqual; tests/ui-panel.test.js: блок
  toggle(force, tabId); tests/svg.test.js: `'ui': 10`.

## Контракты и границы

### Раскладка — контракт ядра (controls.js)

`layoutTouchControls(width, height, {bottomInset}) → {dpad, action,
inventory}` — ВСЕГДА три прямоугольника (не зависит от dpad-флага DOM):

* M = 16; `S = max(0, min(220, max(96, floor(min(w,h)*0.4)), availW,
  availH))`; `dpad = {x: M, y: h-M-S, w: S, h: S}` — ФОРМУЛА БЕЗ
  ИЗМЕНЕНИЙ.
* `GAP = 12` — ПРИВАТНАЯ константа controls.js (зазор пары; ТЗ требует ≥ 8
  — 12 даёт запас под пальцы между кнопками; в экспорт не выносится —
  тесты пинят зазор по прямоугольникам: gap ≥ 8 + точные координаты).
* `B = max(0, min(96, max(56, floor(S*0.5)), availW, availH - inset,
  floor((availH - inset - GAP) / 2)))` — текущая формула + НОВЫЙ член
  (пара влезает с учётом bottomInset).
* `action = {x: w-M-B, y: h-M-inset-B, w: B, h: B}` — без изменений
  (кроме нового члена в B).
* `inventory = {x: action.x, y: action.y - GAP - B, w: B, h: B}` — того же
  размера, та же правая колонка, непосредственно над action (зазор ровно
  GAP).
* ИНВАРИАНТ: на типичных вьюпортах (800×600, 390×844, 320×240,
  568×748+inset45, 1280×720+inset45, 300×200, 360×640) новый член НЕ
  активен → action БИТЕВО идентичен старой формуле (проверено
  расчётом) → существующие deepEqual-пины (controls.test.js L153-185,
  map.test.js L716-736) зелёные БЕЗ правок.
* Эталон 800×600: `dpad {16,364,220,220}`, `action {688,488,96,96}`,
  `inventory {688,380,96,96}`. bottomInset=48: action.y=440 (как раньше),
  inventory.y=332, dpad без изменений.
* Низкий вьюпорт (h ≈ < 140 px без inset): B падает НИЖЕ 56 («уменьшение
  B как сейчас» — ТЗ); на 100×120 пара МОЖЕТ пересекаться с D-pad —
  существующее поведение для action; хит-тест кнопок приоритетен (проверка
  ДО D-pad). Тест «без пересечений» — на типичном вьюпорте (800×600), как
  в существующем тесте.
* Невалидные (≤0/NaN) → ТРИ нулевых прямоугольника (ранний return
  расширен); гигантский bottomInset → B=0 (как у action сейчас).

### Хит-тест (controls.js)

`touchActionAt(x, y, layout)`:
* inventory ПЕРВАЯ (перед action, перед D-pad):
  `if (v && v.w > 0 && v.h > 0 && _inRect(x, y, v)) return 'inventory';`
  (v = layout.inventory). Прямоугольники не пересекаются (зазор > 0) —
  приоритет формальный; защитный guard допускает старые layout-объекты
  без поля (деградация, не крах).
* затем `action → 'interact'`, затем D-pad — без изменений.
* `deltaForMoveKey('touch:inventory') → null` и
  `touchMoveKeyForAction('inventory') → null` — УЖЕ ТАК РАБОТАЕТ на master
  (DIR_DELTA.inventory undefined) — код НЕ ТРОГАЕТСЯ, запирается тестами
  (зелёные с первого запуска — контракт-пин).

`TOUCH_ACTIONS = ['up','down','left','right','interact','inventory']` —
'inventory' В КОНЕЦ (порядок «незначащий, но стабилен»).

### DOM — IIFE `Game.touchControls` (ui.js ~L820-985)

`init(h)` — документированный контракт:

```
h = {
  dpad: boolean,        // СТРОГО === true строит D-pad (ТЗ)
  onHold(dir), onRelease(dir),   // как сейчас ('up'|'down'|'left'|'right')
  onInteract(),                     // кнопка [E] (БЕЗ ИЗМЕНЕНИЙ)
  onInventory(),                    // НОВОЕ: кнопка [I]
}
```

* `build()`: обе кнопки — ОДИН класс `.tc-action` (ТЗ «реюз»),
  `<button>` с содержимым `<img>` (НЕ инлайн-SVG, НЕ textContent):
  `img.src = 'assets/ui/icon_action.svg'` / `'assets/ui/icon_inventory.svg'`,
  `img.alt = ''` (паттерн 000124: img + alt + aria-label). ТЕКСТОВЫХ
  букв «E»/«I» больше нет.
* aria-label: [E] — `'Действие (диалог NPC / постройка)'` (формулировка
  актуализирована: после 000071/000128 [E] = действия постройки; в тестах
  пина НЕТ), [I] — `'Инвентарь'`.
* pointerdown на ОБЕИХ кнопках — копия (как у actionEl L938-942):
  `e.preventDefault(); if (onX) onX(); btn.blur();` — blur() для гибридных
  устройств (прецедент 000018).
* D-pad — УСЛОВНО: `if (h.dpad === true) { …dpadEl, стрелки,
  обработчики… }`; при false — dpadEl null, arrows {}, heldPointer-
  механика инертна (всё null-guard-ится).
* `applyLayout()` — ПЕРЕСТРОЙКА: guard `if (!root || !actionEl) return;`
  (НЕ dpadEl!); `place(actionEl, layout.action); place(inventoryEl,
  layout.inventory);` — ВСЕГДА; `if (dpadEl) { place(dpadEl, …); …цикл
  стрелок… }`.
* `bottomInset()` (L845-848) — БЕЗ ИЗМЕНЕНИЙ: пара поднимается раскладкой
  (action.y уже с учётом inset, inventory — от action.y).
* Guard загрузки IIFE (L830-834, console.error про controls.js) —
  ДОСЛОВНО (пин tests/index-order.test.js «битый порядок»); `build()`
  только в `init()` (чистота загрузки — vm-тесты).
* show/hide/isActive/releaseAll — без изменений.

### Панель персонажа — `G.playerUI` (ui.js ядро, 000130)

`toggle(force)` → `toggle(force, tabId)` (ТЗ п. 6 — ДЕЛАЕМ; L346-363):

* в ветке `if (show)`, ПЕРЕД `render()`:
  `if (tabId) { for (let i = 0; i < columnState.length; i++) { const
  rec = columnState[i]; if (rec && rec.panes[tabId]) { activateTab(i,
  tabId); break; } } }` — используется СУЩЕСТВУЮЩИЙ `activateTab`
  (L96-101) + closure `columnState` (L59); неизвестный id — ТИХО
  игнорируется (панель открывается на текущей вкладке, без краха).
* СОВМЕСТИМОСТЬ: все существующие вызовы `toggle()` / `toggle(false)`
  (KeyI main.js L805-806, closeBtn L108, Esc L332, тесты ui-panel) —
  tabId undefined → поведение БЕЗ ИЗМЕНЕНИЙ (нулевая регрессия клавиши).
* Состояние вкладки ЖИВЁТ в `columnState` (семантика 000130): после
  переключения на «Инвентарь» повторное открытие без tabId остаётся на
  той же вкладке — штатно.
* Esc/attachEsc/render/setCharacter/setShop/setQuests/isOpen — без
  изменений; поверхность `G.playerUI` та же (`toggle` остаётся toggle).

### Проводка — main.js (блок L845-887)

Блок «Тач-вариант контролов» ПЕРЕФОРМИРОВАН (было — только `if
(controlsScheme === 'touch')`):

```js
if (G.touchControls) {
  G.touchControls.init({
    dpad: controlsScheme === 'touch',   // 'touch' → D-pad + [E] + [I];
                                        // 'keyboard' → ТОЛЬКО [E] + [I]
    onHold: (dir) => keys.add('touch:' + dir),
    onRelease: (dir) => keys.delete('touch:' + dir),
    onInteract: () => { G.buildingActions && G.buildingActions.toggle(); },
    onInventory: () => {
      if (G.playerUI) G.playerUI.toggle(undefined, 'inventory');
    },
  });
  G.touchControls.show();
} else {
  // console.error СОХРАНЯЕТСЯ (ТЗ) — теперь для ОБЕИХ схем
  // (кнопки нужны и на десктопе); сообщение без «схема touch».
}
```

* `onInventory` — эквивалент KeyI (L805-806) + авто-вкладка «Инвентарь».
  `toggle(undefined, …)` — переключение: первый клик открывает, повторный
  закрывает (ТЗ ручной чек).
* `onInteract` — БЕЗ ИЗМЕНЕНИЙ (контракт 000128/000071:
  `G.buildingActions.toggle()`; гарды оверлеев — внутри toggle).
* KeyI/KeyE-обработчики (L804-835), гейты оверлеев, tryMove — НЕ
  ТРОГАЮТСЯ. Коммент-блок обновлён: обе схемы, dpad-флаг.

### CSS — index.html (блок #touch-controls, L178-216)

* `.tc-action` (L205-215): УБРАТЬ мёртвые `color: #e8dcc0; font: 700
  18px/1 ui-monospace, monospace;` (буквы ушли), ДОБАВИТЬ `padding: 0;
  display: flex; align-items: center; justify-content: center;`
  (центрирование иконки).
* НОВОЕ правило ПРЯМО ПОСЛЕ `.tc-action:active` (L216):
  `.tc-action img { width: 60%; height: 60%; display: block; }` — 60% =
  верх границы диапазона ТЗ (50…60%); минимальная иконка ≈ 34 px при
  B=56. НЕ путать с `.combat-actions button img { 68% }` (L336-340) —
  другие кнопки.
* pointer-events / z-index / `#touch-controls.visible` — НЕ ТРОГАТЬ (ТЗ).
* Модификатора контейнера «без D-pad» НЕТ — dpadEl просто не создаётся.
* Чужие CSS-зоны и script-теги НЕ ТРОГАТЬ (единственный hunk — L205-216).

### Иконки — assets/ui/ (каталог ОБЩИЙ с 000124)

* ИМЕНА (зафиксировано): `icon_action.svg`, `icon_inventory.svg`
  (префикс icon_ не пересекается с combat_ — memory/000124).
* СИСТЕМА (обязательна, memory/000124-combat-layout.md §Иконки):
  `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"
  viewBox="0 0 24 24">` + единый fill `#e8dcc0`; fill-only (без
  stroke/градиентов/фильтров/`<text>`/xlink); структура — как у
  combat_*.svg (корневой `<g fill="#e8dcc0">`).
* СИЛУЭТЫ (решение Проектирования):
  * icon_action.svg — ДВЕРЬ (вход в постройку): рама со скруглённым
    верхом, внешний контур + внутренний «просвет» (path
    `fill-rule="evenodd"`) + ручка-точка (`<circle>` в зоне просвета).
    Дверь ≠ шевроны combat_flee.svg — не перепутать.
  * icon_inventory.svg — СУНДУК: крышка (округлый верх) + корпус с
    ПРОЗРАЧНЫМ ШВOM между ними (~1.5 px — отрицательное пространство,
    без второго цвета) + замок-плашка.
  * Рюкзак ОТКЛОНЁН: combat_invitem.svg уже рюкзак (тот же каталог) —
    два одинаковых силуэта в одной иконной системе — нет.
* Читаемость: 60% от 56…96 px = 34…58 px — жирные детали (мин. толщина
  ≥ 1.5 в 24-единичной сетке); ручная проверка ТЗ — 56 px и 96 px.
* ГЕЙТ (правило 000120): ОБЕ иконки проходят `checkSvg` (module.exports
  tests/svg.test.js) на временных копиях ДО добавления в assets/;
  счётчик `'ui': 8 → 10` (svg.test.js L450) правится В ТОМ ЖЕ КОММИТЕ,
  что и файлы (иначе обход-тест красный в обе стороны).
* Самотест «заведомо сломанная иконка» — НЕ добавляется: правило 000120
  уже покрыто 9 самопроверками парсера + обходом ВСЕХ assets/**; временный
  дефектный файл в assets/ — антипаттерн (production-ассеты).

## Тесты

* КРАСНЫЕ (tests/controls.test.js, node, require src/controls.js) —
  падают на текущем master, зелёные после реализации:
  * R1 layout: `L.inventory` существует; 800×600 → deepEqual
    `{x:688, y:380, w:96, h:96}`; `inventory.w/h === action.w/h`;
    `inventory.x === action.x`; gap = action.y − (inventory.y +
    inventory.h) ≥ 8 (и строго > 0 — без пересечения); нет пересечения
    с dpad (overlap-проверка, паттерн L164-169); пара в вьюпорте на
    800×600 и 800×600+bottomInset=48 (inventory.y ≥ 0; action.y = base −
    inset). Красный: `L.inventory` undefined → TypeError.
  * R2 layout низкий/узкий: 800×140 и 100×120 — пара в вьюпорте
    (y ≥ 0), зазор ≥ 8 сохраняется, B может быть < 56; невалидные
    ([0,600], [−5,600], [NaN,600], [800,0]) и гигантский inset →
    dpad/action/inventory ВСЕ нулевые (расширение цикла L195-199).
    Красный: `bad.inventory` undefined.
  * R3 touchActionAt: центр и угол (x+2, y+2) inventory → 'inventory';
    точка в зазоре (y = inventory.y + inventory.h + 4) → null; центр
    action → 'interact' (регрессия); компактные регрессии D-pad (луч,
    центр → null, NaN/null → null) — полное покрытие в существующем
    L202-232 (не трогается). Красный: TypeError / null вместо
    'inventory'.
  * R4: `TOUCH_ACTIONS.includes('inventory')`;
    `deltaForMoveKey('touch:inventory') === null`;
    `touchMoveKeyForAction('inventory') === null` (эти ДВЕ null — УЖЕ
    зелёные на master: регрессионные гарды в одном блоке, отдельными
    красными не считаются). expectedRedCount = 4.
* ТЕХПРАВКИ существующих тестов — ровно ДВА (вынуждены контрактом ТЗ):
  1. tests/controls.test.js L114-118: deepEqual TOUCH_ACTIONS +=
     'inventory' — вносится в ЗЕЛЁНОМ коммите (в красной фазе тест обязан
     быть зелёным, чтобы красная фаза падала ТОЛЬКО R1-R4).
  2. tests/svg.test.js L450: `'ui': 8 → 10` (+ коммент «+ 2 иконки 000123»
     — сумма 000124+000123) — в коммите с иконками.
* tests/ui-panel.test.js (vm, CHAIN L264-273 до ui.js; DOM-стаб makeEl
  L202-257 уже несёт style/dataset/children — pane ищется по
  `dataset.tabid`): НОВЫЙ блок toggle(force, tabId): setCharacter +
  `toggle(true, 'inventory')` → pane «Инвентарь» видим (display !==
  'none'), pane «Персонаж» скрыт; повторный `toggle(true)` без tabId —
  вкладка «Инвентарь» ЖИВА (статус columnState); `toggle(true, 'shop')` —
  правый столбец (column 1); `toggle(true, 'nope')` — без краха, панель
  открыта на дефолтной вкладке; `toggle()` без аргументов — поведение без
  изменений (якорь). ДОБАВЛЯЕТСЯ В ЗЕЛЁНОЙ ФАЗЕ (коммит 4, вместе с
  реализацией) — иначе красная фаза будет иметь 5-й красный тест и сломает
  контракт a3 «fail = 4 (ТОЛЬКО R1-R4)» (в красной фазе toggle(true,
  'inventory') игнорирует аргумент → pane «Инвентарь» скрыт → падение).
* tests/index-order.test.js — БЕЗ ИЗМЕНЕНИЙ (новых script-тегов нет;
  IIFE-guard L830-834 дословно — vm-тест «битый порядок» зелёный;
  поверхность touchControls init/show/hide/isActive/releaseAll — та же).
* vm-boot-тесты (main-visuals / hud.js / city-screen / save /
  save-restore): в ВСЕХ пяти песочницах схема 'keyboard' → впервые
  выполняется НОВЫЙ путь main.js: `init({dpad:false, …}) + show()`.
  Стабы: в 5 из них document — Proxy (неизвестный член → `() =>
  undefined`), в остальных — makeEl. `style` = {} — place() жив;
  innerWidth/innerHeight есть; document.querySelector → null; blur()/
  setAttribute no-op. ВАЖНО (опыт реализации): `root.classList` у
  Proxy-стаба — ФУНКЦИЯ-заглушка, и `classList.add` БРОСАЕТ TypeError
  («p.classList.add is not a function») — classList НЕ no-op. Поэтому
  show()/hide() — typeof-guard: `if (typeof root.classList ===
  'object' && root.classList) { … }` (прецедент проекта: typeof-guards
  на стабы в ui.js attachEsc/bottomInset). УСЛОВИЕ прожитости пути:
  guard стрелок/place по dpadEl в applyLayout (arrows={} → TypeError
  иначе) + typeof-guard classList + БЕЗ console.error (пин
  errors.length===0). Чистота загрузки IIFE (build только в init) —
  не менять.
* Побайтовые/структурные пины — проходят БЕЗ правок (проверено):
  deepEqual dpad/action 800×600 (L153-170), bottomInset action −48
  (L172-185), 100×120 bounds (L187-193), touchActionAt-точки (L202-232 —
  ни одна не попадает в inventory {688,380,96,96}), 360×640 map.test.js
  (B=72, пара 152 ≤ 608 — не ужимается), структурные пины main.js
  (keydown-обработчик, «Проход 3», restoreFromSave, `function
  hudUpdate`-отсутствие).
* Набор: 1311 база → красная фаза: всего тестов 1315, pass 1311,
  fail 4 (ТОЛЬКО R1-R4) → зелёная фаза: ВСЁ зелёное (1311 + 4
  controls + блок tabId в ui-panel), обход svg — 297 файлов.

## Ленивые ссылки и guards

* IIFE ui.js: guard загрузки `!G.layoutTouchControls || !G.touchActionAt`
  → console.error + return (дословно, пин index-order); дальше — только
  ленивое чтение в applyLayout/dirAt (G.layoutTouchControls,
  G.touchActionAt, G.DIRS) в момент вызова, не при загрузке.
* main.js: `G.touchControls` (init+show только при наличии, иначе
  console.error — обе схемы), `G.buildingActions &&` в onInteract,
  `if (G.playerUI)` в onInventory — существующие ленивые паттерны, новых
  Game-ссылок не появляется.
* `toggle(force, tabId)`: tabId ищется в `columnState` (closure) —
  без новых Game-ссылок; неизвестный id — тихо; вызов ДО setCharacter
  безопасен (`if (!character) return` раньше — panelTabs/columnState
  пустые → find не находит → игнор).
* НОВЫХ JS-МОДУЛЕЙ НЕТ → UMD-ловушек нет (праваются уже загруженные
  controls.js/ui.js/main.js; main.js читает touchControls/playerUI/
  buildingActions лениво в момент вызова, а не снапшотом).

## Что важно будущим задачам

### Контракт кнопок для 000121 (тач-D-pad в подземелье и на поле боя —
идёт ПОСЛЕ, последовательная лейна; правит ту же IIFE ui.js и controls.js)

* `Game.touchControls.init(h)`: `h = { dpad: true|false, onHold,
  onRelease, onInteract, onInventory }`. D-pad строится ТОЛЬКО при
  `h.dpad === true`. Для подземелья/боя в touch-схеме — `dpad: true`;
  кнопки [E]/[I] УЖЕ ЕСТЬ в обеих схемах — 000121 не строит их заново,
  при необходимости переиспользует колбэки onInteract/onInventory
  (назначаются main.js, не «пер-скрин»).
* `layoutTouchControls` ВСЕГДА возвращает `{dpad, action, inventory}` —
  три прямоугольника; inventory над action, тот же размер/колонка,
  GAP = 12 (приватная константа), кап B = `floor((availH - inset -
  GAP) / 2)`. Если 000121 добавляет СВОИ кнопки — новые прямоугольники
  в ядре (тот же паттерн: в вьюпорте, с учётом bottomInset, невалидные
  → нули) + класс `.tc-action` для DOM.
* `applyLayout` работает с `dpadEl === null` (кнопки размещаются ВСЕГДА;
  цикл стрелок — только при dpadEl) — 000121 опирается на это.
* `touchActionAt`: кнопки ПЕРВЫЕ (inventory, затем action), затем D-pad;
  новое действие → в конец `TOUCH_ACTIONS` + для не-направлений
  `'touch:<action>'` обязан давать null из `deltaForMoveKey` (пин-паттерн
  R4).
* main.js: onInteract → `G.buildingActions.toggle()` (000128),
  onInventory → `G.playerUI.toggle(undefined, 'inventory')` (эквивалент
  KeyI + авто-вкладка). 000121 НЕ переправляет эти строки — роутинг по
  экранам расширяется ВНУТРИ buildingActions/combat/dungeon, не в
  проводке main.js (минимальное пересечение зон).
* РЕБАЗ ОБЯЗАТЕЛЕН: зоны пересечения — IIFE ui.js (~L820-985),
  controls.js (L131/199-238), main.js тач-блок (~L845-887), index.html
  CSS (~L205-216).

### 000071 (в ТЗ — pending; ФАКТ: уже в master через 000128)

* Роутинг [E] — в `G.buildingActions.toggle()` (src/building-actions.js);
  onInteract у 000123 НЕ меняется. Если 000071(+) правит keydown-область
  (main.js L804-835) — тач-блок (L845-887) ниже неё, пересечение
  минимальное.

### SVG-ассеты (любая задача, добавляющая файлы)

* assets/ui/ — ОБЩИЙ каталог: счётчик `'ui'` в EXPECTED_SVG_BY_DIR
  (svg.test.js L450) — СУММА задач (сейчас 10 = 8×000124 + 2×000123);
  правка — ровно одна строка таблицы В ТОМ ЖЕ КОММИТЕ, что и файлы
  (контракт 000120). Система иконок assets/ui/ — по
  memory/000124-combat-layout.md §Иконки.

### Панель персонажа (000086/000116 и будущие вкладки)

* `toggle(force, tabId)` — tabId = id вкладки из реестра Game.uiTabs
  (src/ui-tab-*.js); неизвестный id — игнор (панель на текущей вкладке);
  состояние вкладок — closure `columnState` (живёт через render).

## Подводные камни

1. **Ранний return applyLayout по dpadEl (текущий ui.js L851)** —
   «просто добавить inventory» с сохранённым условием `!dpadEl` УБИВАЕТ
   обе кнопки в keyboard-схеме (x/y не стелятся → CSS absolute без
   координат). Перестройка ОБЯЗАТЕЛЬНА: guard `!root || !actionEl`,
   кнопки — всегда, dpad+стрелки — под `if (dpadEl)`.
2. **Строгость `h.dpad === true`** — main.js обязан передавать флаг ЯВНО
   в обеих схемах (`dpad: controlsScheme === 'touch'`); забудут → D-pad
   исчезнет на тач-устройствах (регрессия 000018). Проводка main.js не
   node-тестируется (клей) — фиксация: коммент + этот файл + ручная
   проверка.
3. **deepEqual TOUCH_ACTIONS (controls.test.js L114-118)** — падает при
   добавлении 'inventory' без техправки; техправка — в ЗЕЛЁНОМ коммите
   (иначе красная фаза краснеет не только R1-R4).
4. **Счётчик `'ui'` (svg.test.js L450)** — 8→10 строго в коммите с
   иконками; в одну сторону «ожидается 295, найдено 297», в другую —
   «ожидается 297, найдено 295».
5. **vm-boot-тесты прогоняют НОВЫЙ путь** ('keyboard'-схема в 5
   песочницах): TypeError в applyLayout (arrows={}, цикл стрелок без
   guard), TypeError `root.classList.add` (Proxy-стаб: classList —
   функция-заглушка, НЕ no-op —typeof-guard в show()/hide(), см.
   «Тесты») и ЛЮБОЙ console.error (пин errors.length===0) — всё это
   ломает набор. Чистота загрузки IIFE не менять (build только в
   init).
6. **B ужимается НИЖЕ 56** на очень низком вьюпорте (новый член min) —
   существующие точные пины не бьются (800×600, 360×640 проверены
   арифметически), но новые тесты R2 — с ассертами «пара в вьюпорте»,
   не с точными размерами.
7. **Иконки при малом размере** — 60% от 56 px = 34 px: детали жирнее
   1.5 в 24-сетке, иначе нечитабельно (ручной чек ТЗ: 56/96 px).
8. **Мерж-пересечения** — зоны см. «Контракт для 000121»; параллельные
   pending 000083 (npcUI ui.js), 000086/000116 (панель/вкладки),
   000085/000087/000115 (main.js сейв/цикл) — в других регионах,
   append-конфликты маловероятны, но ребаз перед мержем обязателен.
9. **Детерминизм/сейвы/RNG — НЕ ТРОГАЮТСЯ**: новых данных в сейве нет,
   раскладка — детерминированная функция размеров вьюпорта, иконки —
   статичные ассеты, onInventory/onInteract — существующие колбэки.
10. **z-порядок**: touch-controls z-5 < панели z-10 < оверлеи z-20 —
    под открытым оверлеем (бой/подземелье/диалог/постройка) кнопки
    ПОД оверлеем и НЕКЛИКАЕЛЫ (как [E] сегодня — РЕГРЕССИИ НЕТ);
    «кнопка = клавиша» ТЗ — про ВЫЗЫВАЕМОГО: G.playerUI.toggle открывает
    панель поверх оверлея (то же, что [I]; коммент main.js L819-823).
    Маршрутизация тача в бой/подземелье — 000121.
11. **fs-btn (z-15)** перекрывает правый нижний угол — bottomInset()
    поднимает ПАРУ (без изменений); при недоступном Fullscreen API
    fs-btn нет → inset 0.
12. **Флейки** — npm test мерить ВНУТРИ worktree
    (memory/test-runner-worktrees.md: node --test рекурсивно сканирует
    .worktrees/); флейк чужого теста — перепуск `node --test
    tests/<файл>` + запись в отчёт.

## Отметки исполнения (стадия РЕАЛИЗАЦИЯ, 2026-10-02)

* По регламенту workflow стадия реализации — ОДИН коммит: шаги 2-5 плана
  ниже сбиты в один коммит «Задача 000123: …» (красный коммит b14b454 —
  отдельный, стадия «Красные тесты»). Класс-лист guard show()/hide() —
  отклонение от контракта в «Тесты» (там же — причина).

## План реализации (коммиты, ветка task/000123)

1. «Задача 000123: красные тесты и память» — tests/controls.test.js
   (R1-R4; deepEqual-правку НЕ вносить), memory/000123-touch-buttons.md
   (этот файл). Красных ТОЛЬКО 4 (контракт a3 «fail = 4»): блок tabId
   в ui-panel и счётчик svg в красную фазу НЕ входят. npm test:
   pass 1311, fail 4 (R1-R4), осмысленные причины (нет поля inventory /
   нет 'inventory' в TOUCH_ACTIONS).
2. «Задача 000123: SVG-иконки (assets/ui/, 2 шт, правило 000120)» —
   assets/ui/icon_action.svg + icon_inventory.svg (checkSvg ДО коммита)
   + tests/svg.test.js L450 `'ui': 10`.
3. «Задача 000123: controls.js — inventory в раскладке/хит-тесте/
   TOUCH_ACTIONS» — ядро (TOUCH_ACTIONS L131, layout L199-217: GAP, кап
   B, inventory, невалидные; touchActionAt L228-238; jsdoc) + ТЕХПРАВКА
   deepEqual (L114-118) в том же коммите. controls.test.js — зелёные.
4. «Задача 000123: ui.js — кнопка [I], иконки, D-pad по флагу,
   playerUI.toggle(force, tabId)» — IIFE (let, applyLayout, build,
   init, коммент) + toggle L346-363 + НОВЫЙ блок tabId в
   tests/ui-panel.test.js (см. «Тесты»). ui-panel.test.js — зелёные.
5. «Задача 000123: main.js — обе схемы + onInventory; CSS пары кнопок»
   — main.js L845-887 + index.html CSS L205-216. npm test — ВСЁ
   зелёное (1311 + 4 controls + tabId-блок, svg 297).
6. (стадия мержа) «Задача 000123: CHANGELOG — …» — запись в
   CHANGELOG.md: под существующий `## 2026-10-02`, раздел `###
   Интерфейс`: кнопки действия [E] и инвентаря [I] на карте видны и на
   телефоне, и на компьютере (внизу справа); вместо букв — понятные
   иконки (дверь / сундук); [I] — панель персонажа, сразу на вкладке
   «Инвентарь». (программной части — нет)
7. (стадия мержа) отчёт tasks/result + перенос задачи в done +
   CHANGELOG-коммит + мерж + .merge-pending.

Дельта: ~10 файлов, ≈ +250/−30 строк: tests/controls.test.js +≈95,
tests/ui-panel.test.js +≈55, tests/svg.test.js ±1, icon_action.svg
+≈15, icon_inventory.svg +≈15, src/controls.js +≈25/−8, src/ui.js
+≈75/−12, src/main.js +≈15/−8, index.html +≈10/−3, memory +≈140.

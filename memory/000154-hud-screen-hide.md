# 000154 (регистр: 000150) — Скрытие кнопок [I]/[E] и джойстика (D-pad) на экранах боя/инвентаря/входа (контракт)

Workflow 000154 (ветка `task/000154`, worktree task-000154), база master `3c0e1b4`,
дата 2026-10-06. **Файл ТЗ — `tasks/pending/000150.md`** (2 строки; номер 000154.md
— ДРУГАЯ задача «инициатива», не выполняется в этом workflow — см.
memory/000154-initiative.md и отчёт). ТЗ дословно:

> При активации экранов боя, инвентаря [I], и входа в здание [E] должны
> скрываться кнопки [I] и [E] с экрана.
> При активации экранов инвентаря [I], и входа в здание [E] джойстик
> движения должен скрываться.

Красное подтверждено (grep `touchControlsVisibility|setVisibility|isVisible` по
src/ и tests/ — пусто; `touchControls.show()` вызывается ОДИН РАЗ при загрузке,
main.js L1666; механизма per-screen скрытия нет). Базовый набор 1732 pass / 0 fail.
В «Джойстик» в коде — **D-pad** `.tc-dpad` (000018; слова «joystick» нет).

## Что добавлено (footprint — строго 3 src-файла + 1 тестовый)

1. **src/controls.js** — чистая функция `touchControlsVisibility(screens)`
   (вставка ПОСЛЕ `routeTouchScreen`, L320-324) + строка в экспорт
   (L326-331, браузерная ветка UMD мержит в `Game` — `G.touchControlsVisibility`).
2. **src/ui.js** — IIFE `Game.touchControls` (L1270-1489): closure-состояние
   `parts` + метод `applyVisibility(v)` в API-объекте (после `releaseAll`,
   L1485-1487) + строка 000150 в коммент-шапке IIFE.
3. **src/main.js** — клей в `frame()` СРАЗУ ПОСЛЕ блока in*-констант
   (L2424-2428) + 1 строка про 000150 в коммент-блоке «Тач-вариант контролов»
   (L1578-1594).
4. **tests/ui-touch-visibility.test.js** — НОВЫЙ файл, 6 тестов (TV1-TV6).
5. **НЕТ**: новых JS-модулей, script-тегов, CSS-правил, ассетов, правок
   index.html, новых require. → tests/index-order.test.js и tests/svg.test.js
   НЕ трогаются.

## Где создаются кнопки и джойстик (состояние master 3c0e1b4)

* **DOM** — IIFE в src/ui.js: контейнер `#touch-controls` (`root`, appendChild
  на body L1434); **D-pad** `.tc-dpad` (`dpadEl`, строится ТОЛЬКО при
  `init({dpad: true})` = схема 'touch', L1359-1399); **кнопки** `.tc-action` —
  `actionEl` [E] (L1406, иконка `assets/ui/icon_action.svg`) и `inventoryEl`
  [I] (L1418, `icon_inventory.svg`) — ОБЕ схемы (000123). **Порядок children:
  [dpad?, action, inventory]** (по appendChild в build).
* **CSS** — index.html: `#touch-controls { display:none }` /
  `.visible { display:block }` (z-30, pointer-events:none); `.tc-action` —
  **display:flex** (критично для restore); `.tc-dpad` — position:absolute.
* **Проводка** — main.js L1578-1674: `touchScreens()` (L1595-1603) — снимок
  `{combat, dungeon, dialog, building}` ТОЛЬКО для роутинга (контракт 000121 —
  НЕ расширять); `init` L1622 (`dpad: controlsScheme === 'touch'`); `show()`
  L1666 — единственный вызов. Схема: `chooseControlsScheme` (controls.js L184,
  forced 'touch'/'keyboard' из `?controls=`; main.js читает
  `window.location.search` при ЗАГРУЗКЕ L1617-1618 и НЕ перечитывает).
* **Чистое ядро** — controls.js (UMD, без зависимостей): `layoutTouchControls`,
  `touchActionAt`, `routeTouchScreen` (L320, жёсткие `=== true`, мусор → 'map'),
  `touchKeyCode`, экспорт L326-331.

## Экраны → видимость (семантика ТЗ, строго «не больше и не меньше»)

| Экран | Геттер (лениво, в момент кадра) | Кнопки [I]/[E] | D-pad |
|---|---|---|---|
| бой | `G.combatUI.isActive()` (combat-ui.js L86) | **скрыты** | **остаётся** (движение по полю, 000121) |
| инвентарь [I] | `G.playerUI.isOpen()` (ui.js L306: `panel.style.display === 'flex'`) | **скрыты** | **скрыт** |
| вход в здание [E] | `G.buildingUI.isActive()` (building-ui.js L54) | **скрыты** | **скрыт** |
| карта (ничего не активно) | — | видны | виден |

* «Экран боя» ВКЛЮЧАЕТ оверлей результата (победа/поражение): `combatUI.
  isActive()` до Space — кнопки остаются скрытыми до закрытия.
* **Подземелье, диалог NPC, крафт — НЕ скрывают** (ТЗ молчит; D-pad в
  подземелье НУЖЕН для движения, 000121). city-screen-тест — живой
  фиксатор «не больше ТЗ».
* **Скрыть ≠ запретить**: frame-гейт движения (main.js L2433) НЕ расширяется —
  герой может ходить по клавишам с открытым инвентарём (существующее
  поведение; ТЗ просит только скрытие).

## Контракт: touchControlsVisibility(screens) — src/controls.js (ЧИСТАЯ)

```
touchControlsVisibility(screens) → { buttons: boolean, dpad: boolean }
  combat    = screens && screens.combat === true      (жёстко)
  inventory = screens && screens.inventory === true
  building  = screens && screens.building === true
  buttons   = !(combat || inventory || building)
  dpad      = !(inventory || building)   // в бою D-pad ЖИВ
```

* **Форма `{buttons, dpad}` (решение):** не per-button `{action, inventory}` —
  ТЗ скрывает пару кнопок ОДНОЙ ЕДИНИЦЕЙ; один флаг кодирует семантику ТЗ и не
  допускает будущего рассогласования пары (вне ТЗ). Меньше ключей = меньше
  пинов.
* **Тотальность:** `dungeon`/`dialog`/любые доп. поля — принимаются в снимке,
  но **НЕ ПОТРЕБЛЯЮТСЯ** (ТЗ их не упоминает; пины «не влияют на результат»).
* **Мусор/деградация** (паттерн routeTouchScreen 000121): `null`/`undefined`/
  строка/число/не-boolean-поля (`'yes'`, `1`, `NaN`) → `{buttons: true,
  dpad: true}` — всё видимо (безопасное направление: игрок не теряет
  контролы). Исключений нет.
* **Чистота:** без Game/document, аргумент **не мутируется** (пин-тест).
* jsdoc — в стиле routeTouchScreen (таблица экрана→видимость + 000150).

## Контракт: applyVisibility(v) — Game.touchControls (src/ui.js)

* `v = {buttons?: boolean, dpad?: boolean}` (выход touchControlsVisibility).
* **Состояние:** closure `let parts = { buttons: true, dpad: true }`
  (последнее применённое) рядом с `let shown = false` (L1291).
* **Нормализация:** `buttons = v.buttons !== false; dpad = v.dpad !== false`
  (отсутствует/мусор → видимо — безопасное направление; с frame() всегда
  приходят строгие boolean).
* **Идемпотентность:** `if (buttons === parts.buttons && dpad === parts.dpad)
  return;` — ДОМ-записи только при смене; frame-луп звонит каждый кадр → в
  steady-state 0 записей. Первый кадр ВСЕГДА early return (parts старт =
  «всё видимо») → все существующие 1732 теста проходят без изменений.
* **Механизм — инлайн `style.display`** (решение):
  `actionEl.style.display = inventoryEl.style.display = buttons ? '' : 'none'`;
  `if (dpadEl) dpadEl.style.display = dpad ? '' : 'none'`.
  * **Restore = `''`, НЕ 'block'** (правка к первой версии анализа):
    `.tc-action` в CSS — `display:flex`; `''` снимает инлайн-оверрайд и
    возвращает каскад (корректно и в браузере, и в vm-стабах: makeEl даёт
    реальный `style: {}`; чистый Proxy — запись на функцию безобидна).
  * Не CSS-классы: classList в vm-стабах — no-op/функция (typeof-guard уже в
    show/hide); класс-подход потребовал бы classList в каждом стабе; CSS/index.
    html не меняется. Симметрия с `applyLayout` (тоже инлайн-стили).
* **Guards:** `if (!root) return` (pre-init — как show/hide); `!dpadEl` →
  dpad-часть no-op (схема 'keyboard': dpadEl === null — НЕ крах; кнопки
  скрываются/показываются — ТЗ про кнопки в ОБЕИХ схемах).
* **Имя — `applyVisibility`** (решение): та же семья, что `applyLayout` в той
  же IIFE («применить вычисленное состояние к DOM»). **`isVisible()` НЕ
  добавляется** (решение): единственный потребитель — e2e-ассерты, читают
  `style.display` напрямую в стабе; лишний метод = лишний пин.
* `show()/hide()/isActive()/releaseAll()/build()/applyLayout()` — **БЕЗ
  ИЗМЕНЕНИЙ**. `applyLayout` (resize) НЕ сбрасывает display (ставит только
  left/top/width/height).

## Клей: src/main.js — frame()

Вставка СРАЗУ ПОСЛЕ in*-констант (L2424-2428):

```js
    // 000150: видимость on-screen-контролов по активным экранам:
    // кнопки [I]/[E] — бой/инвентарь/вход; D-pad — инвентарь/вход
    // (в бою остаётся). Чистая touchControlsVisibility (controls.js)
    // от снимка кадра; applyVisibility идемпотентна (0 DOM-записей
    // без смены состояния).
    if (G.touchControls && typeof G.touchControls.applyVisibility === 'function') {
      G.touchControls.applyVisibility(G.touchControlsVisibility({
        combat: !!inCombat,
        inventory: !!(G.playerUI && G.playerUI.isOpen()),
        building: !!inBuilding,
      }));
    }
```

* **Почему frame-луп, а не хуки переходов:** все переходы рождаются ВНУТРИ
  модулей (старт боя: startCombatAt/maybeStartCombat/zone/dungeon; панель:
  KeyI/тач-кнопка/стек 000096; buildingUI: buildingActions/interactCity) —
  >5 точек против 1; in*-флаги уже снимаются каждый кадр (существующий
  паттерн L2424-2428); клей без состояния; стоимость — 3 чтения геттеров +
  идемпотентный early return.
* **Гард в frame — МОЛЧИТ** (решение): регрессия порядка загрузки уже
  логируется при загрузке (main.js L1672 console.error); спам в лупе не
  нужен. Деградация = текущее поведение (контролы всегда видимы).
* **`touchScreens()` (L1595) НЕ расширяется** (решение): её контракт 000121
  (роутинг) заперт тестами 8 комбинаций; снимок видимости собирается отдельно.

## Тесты (красные — новый файл, правки существующих — НОЛЬ)

**tests/ui-touch-visibility.test.js** — 6 тестов:

* **TV1** (node + голой vm-realm): экспорт на месте — node-ветка
  (`require('../src/controls.js')` → typeof function) и браузерная ветка
  (после controls.js в realm `Game.touchControlsVisibility` есть, чужие ключи
  Game не потеряны — паттерн HU1/index-order). Красное: undefined.
* **TV2** (node): таблица истинности — ВСЕ 8 комбинаций `{combat, inventory,
  building}` (ключевой пин: **бой → `{buttons:false, dpad:true}`**);
  `{dungeon:true}`/`{dialog:true}`/комбинации с ними — без изменений;
  мусор (`null`/`undefined`/`'x'`/`1`/`{combat:'yes'}`/`{combat:1}`/`NaN`) →
  всё видимо; аргумент не мутирован; повторный вызов — тот же результат
  (пин-паттерн routeTouchScreen, controls.test.js L363+).
* **TV3** (node, минимальный vm controls.js+ui.js + DOM-стаб — паттерн
  index-order L280-300): `init({dpad:true})` + `show()` → всё видимо
  (`display !== 'none'`); `applyVisibility({buttons:false, dpad:false})` →
  `style.display === 'none'` у ВСЕХ ТРЁХ элементов; restore `{buttons:true,
  dpad:true}` → `!== 'none'` (в стабе `''`); `init({dpad:false})` +
  `applyVisibility({dpad:false})` → без исключений (null-guard); идемпотентно;
  root `show()/hide()/isActive()` — как до изменений. Красное: метод нет.
* **TV4-TV6** (vm-e2e, ПОЛНАЯ цепочка index.html): песочница — КОПИЯ
  bootSandbox (main-visuals L158; дублирование стабов принято, 000083/000087):
  (a) **`window.location.search = '?controls=touch'` — В КОНСТРУКТОРЕ
  window-стаба ДО прогона CHAIN** (main.js читает search при загрузке и не
  перечитывает; forced-схема гарантирует dpadEl — все существующие harness'ы
  keyboard, без forced dpad не проверить); (b) CHAIN динамический (regex из
  index.html, main-visuals L47). Идентификация DOM: `document.body.children`
  → элемент `id === 'touch-controls'` → children `[0]=.tc-dpad, [1]=.tc-action
  ([E]), [2]=.tc-action ([I])`. Ассерты — ТОЛЬКО `style.display` (classList/
  setAttribute в стабах no-op → aria-label не использовать).
  Активация экранов — **ПУБЛИЧНЫЕ API** (по плану оркестратора):
  * **TV4 бой**: `__game.actions.startCombat(0)` (паттерн save.test.js L1504;
    startCombatAt L1354) → precond `combatUI.isActive() === true` →
    `frameOnce` → обе `.tc-action` `'none'`, **`.tc-dpad` НЕ `'none'`** →
    резолв (паттерн resolveCombatVictory, mob-zones-e2e L333:
    `combatInternals.dealDamageToAlly(c, uEfir, 9999)` + `dealDamageToMob(c,
    m, 9999)` по мобам → victory → `combatUI.handleCode('Space')` → панель
    закрыта) → `frameOnce` → все контролы видны СНОВА.
  * **TV5 инвентарь**: `G.playerUI.toggle(true)` (паттерн camp-map-e2e L573) →
    precond `isOpen() === true` → frame → **ВСЁ ТРИ** `'none'` →
    `toggle(false)` → frame → все видны.
  * **TV6 вход в здание**: `G.buildingUI.open({title:'Смоук',
    actions:[{id:'a', имя:'А', доступен:true}], onAction(){}})` (публичный API,
    building-ui.js L250; стек 000096) → precond `isActive() === true` →
    frame → всё `'none'` → `close()` → frame → все видны.
  * **frameOnce после КАЖДОГО события** (glue пересчитывает видимость в
    кадре; ассерт до кадра невалиден). Преконы «экран открыт» — ОБЯЗАТЕЛЬНЫ
    до ассертов видимости (красное падает именно по видимости, не по
    «сценарий не собрался»). `errors.length === 0` (пин всех vm-тестов).
* **Красное:** 6/6 падают с осмысленными причинами (TV1/TV2 —
  `touchControlsVisibility` undefined; TV3 — `applyVisibility` undefined;
  TV4-TV6 — `display !== 'none'` при АКТИВНОМ экране). Не синтаксис: файл
  парсится, цепочка грузится без ошибок.
* **npm test:** 1732 зелёных + 6 красных = 1738 total / 6 fail.

## Фиксаторы «без правок» (обязаны пройти)

* tests/controls.test.js — добавочный экспорт, декомпозиция (L12-20) по
  подмножеству не ломается; вся геометрия/роутинг — как был.
* tests/index-order.test.js — новых тегов нет; поверхностный цикл touchControls
  (L290: `['init','show','hide','isActive','releaseAll']`) — итерация по
  подмножеству, новый метод не ломает; guard console.error при битом порядке.
* tests/ui-panel.test.js — HARDCODED CHAIN (L264-273) без правок; CSS-regex
  `#touch-controls\s*{([^}]*)}` (z-index 30, L508-515) не матчит правила
  дочерних элементов; .cp-* DOM-контракт.
* tests/hud.js.test.js — HUD-строки побайтово: хинты «[I] персонаж»/«[E] …» —
  ТЕКСТ HUD, не кнопки — НЕ меняются.
* tests/city-screen.test.js — локационные экраны (город/подземелье) НЕ
  скрывают контролы — регрессии-фиксатор «не больше, чем просит ТЗ».
* tests/combat*/save*/loot*/companions* — детерминизм боя, сейвы, RNG —
  не затрагиваются (видимость — UI-state, в сейв не пишется; startCombat-
  сценарии не читают display контролов).
* **Риск (проверить полным прогоном):** ВСЕ существующие e2e гонят frame() —
  applyVisibility выполнится в их песочницах: первый кадр — early return;
  кадры после открытия боя/панели/оверлея пишут `style.display` в стабы
  (makeEl — реальный `style:{}`; Proxy — запись на функцию, безбоязненно).

## Ленивые ссылки и guards

* Новых require/модулей НЕТ (расширение существующих — UMD-правила 000038/
  000053 не возникают).
* Ленивые чтения `G.playerUI`/`G.buildingUI`/`G.combatUI` — в момент кадра
  (не при загрузке) — паттерн frame()/touchScreens() (защита от порядка
  загрузки и от песочниц без модуля).
* `applyVisibility`: `!root` → return; `!dpadEl` → skip; нормализация
  `!== false`. `touchControlsVisibility`: тотальна на мусоре.

## Что не тронуто (инварианты)

* Frame-гейт движения (скрыть ≠ запретить); роутинг touchScreens()/onHold/
  onInteract (000121); раскладка/иконки/порядок кнопок (000123); root
  show/hide/blur (releaseAll); детерминизм/сейвы/RNG (0 данных сейва);
  index.html (0 тегов, 0 CSS); assets (0 новых SVG).
* Регионы параллельных задач (рестарт-волна, номера ПЕРЕСВЕДЕНЫ с 3c0e1b4):
  000145 — src/ui.js панель-ядро (L100-420) + buildSquad (~L1051) +
  src/ui-tab-skills.js — **НЕ пересекается** с нашими ханками (ui.js L1289 +
  L1442-1487, controls.js хвост, main.js L1578-1594 + frame L2424+), но
  общий файл ui.js → при ребейзе смотреть оба ханка. 000151 (рендер текстур
  боя) / 000152 (ассеты наёмников) / 000155 (A* в combat.js) / 000156
  (воскрешение) — пересечений нет. Ребаз на актуальный мастер перед мержем —
  обязателен.

## Что важно будущим задачам

* `touchControlsVisibility` — ЕДИНАЯ точка «экран → видимость»: расширение
  скрытия на новые экраны (если ТЗ изменится) = дописать поле в формулу +
  строку в frame-снимок (снимок уже тотален по доп. полям — dungeon/dialog).
* `applyVisibility` — единственная точка per-control видимости (идемпотентна,
  состояние `parts`); будущие «показывать/скрывать X» идут через неё.
* Инлайн display на children `#touch-controls` — НЕ сбрасывается ни
  applyLayout (resize), ни show(); root-видимость (.visible) — независима.
* **E2E-паттерн `?controls=touch` в full-chain песочнице** (search в
  конструкторе window-стаба ДО CHAIN) — ПЕРВЫЙ прецедент в проекте;
  переиспользовать для любых будущих touch-тестов (все существующие
  harness'ы — keyboard).
* Оверлей результата боя — часть «экрана боя» (кнопки скрыты до Space) —
  при будущих задачах по боевому UI не сломать.

## Подводные камни

1. **Restore = `''`, не 'block'** — `.tc-action` в CSS `display:flex`;
   'block' перебил бы flex-центрирование иконки.
2. **`?controls=touch` — ДО загрузки цепочки** (main.js L1617-1618 читает при
   загрузке и не перечитывает) — поставить В КОНСТРУКТОРЕ window-стаба.
3. **dpadEl === null в 'keyboard'** (все существующие e2e-песочницы) —
   null-guard обязателен; кнопки в тех же песочницах скрываются/показываются
   реально (applyVisibility в их frame() выполняется).
4. **Идентификация DOM в стабах:** Proxy `get` возвращает no-op-функцию для
   неизвестных свойств — classList/setAttribute assert-непригодны; только
   `style.display` (makeEl: реальный объект) и порядок children.
5. **Номер ТЗ:** специ-файл — tasks/pending/000150.md; при мерже переносится
   000150.md → done (с пометкой о рассогласовании реестра оркестратора);
   000154.md (инициатива) ОСТАЁТСЯ в pending; коммиты — workflow-номер
   «Задача 000154: …».
6. **npm test — только ВНУТРИ worktree** (memory/test-runner-worktrees.md:
   node --test рекурсивно сканирует .worktrees/).
7. **Старые строковые ссылки memory 000123/000121 устарели** (мастер двигался):
   актуально — ui.js L1270-1489, main.js L1578-1674; все контракты (init(h),
   layout, routeTouchScreen, z-лестница 10/15/20/30) — живы.

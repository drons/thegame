# 000018: вариант контролов для тачскрина

Статус: выполнено и закоммичено (тесты 222 → 230 pass, +8 в tests/controls.test.js).

## Решения

* **Чистое ядро — в src/controls.js** (UMD, как и клавишный маппинг 000028);
  DOM-привязка — в src/ui.js (`Game.touchControls`), CSS — в index.html.
  Ядро НЕ трогает navigator/document: всё — по значениям-аргументам.
* **Детект устройства — `isTouchDevice(env)`**, чистая функция по
  СНИМКУ окружения: `{ maxTouchPoints, touchEvents, coarsePointer }`
  (navigator.maxTouchPoints / `'ontouchstart' in window` /
  `matchMedia('(pointer: coarse)')`). Снимок собирает браузерный код
  main.js (`touchEnvSnapshot()`). Строгая проверка: `maxTouchPoints`
  должен быть `number > 0` (строка '5' / -1 / NaN — мусор → false).
* **Выбор схемы — `chooseControlsScheme(env, forced)`** → `'touch'` |
  `'keyboard'`: по детекту, либо ЯВНО (`forced` — 'touch'/'keyboard';
  прочее игнорируется). main.js читает `?controls=touch|keyboard` из URL
  — вариант переопределяется для теста на десктопе и наоборот.
* **Одна дорожка движения для клавиатуры и таца.** Тач-кнопки дают
  виртуальные id `'touch:up'/'touch:down'/'touch:left'/'touch:right'`,
  main.js кладёт их в ТОТ ЖЕ Set `keys`, что и настоящие клавиши;
  `deltaForMoveKey` расширен так, чтобы понимать `touch:<dir>`
  (`'touch:interact'` → null, не направление). Цикл кадра / `tryMove()`
  не изменены — и клавиша, и палец идут через `G.deltaForMoveKey(k)`.
* **D-pad — хит-тест по ДОМИНИРУЮЩЕЙ оси от центра** (`touchActionAt`):
  `|dx| >= |dy|` → горизонталь (на диагонали 45° выигрывает горизонт),
  иначе вертикаль. В центре — мёртвая зона (радиус `TOUCH_DEADZONE` =
  0.18 от размера D-pad) → null. Это лучше 2×2-квадрантов (неоднозначно
  по диагонали) и 3×3-сетки (мёртвые углы). Палец можно «скользить» по
  D-pad — направление переключается (ui.js).
* **Кнопка «E» (действие)** — аналог клавиши [E]: открывает/закрывает
  диалог NPC. Обработчик E вынесен в main.js в `toggleNpcDialog()` и
  вызывается И с клавиатуры, И с тач-кнопки.
* **Раскладка — `layoutTouchControls(width, height, {bottomInset})`**:
  D-pad — квадрат внизу слева (96…220 px, от 0.4×меньшей стороны),
  кнопка — круг внизу справа (56…96 px, ≈ половина D-pad).
  `bottomInset` поднимает ТОЛЬКО кнопку вверх — под кнопку
  полноэкранного режима (её высоту меряет ui.js: `bottomInset()`).
  Невалидные размеры (≤0/NaN) → нулевые прямоугольники (контролы
  невидимы, не ловят события).
* **DOM (ui.js)**: Pointer Events (`pointerdown/move/up/cancel`) —
  работает и для пальца, и для мыши. `setPointerCapture` на D-pad:
  `pointerup` доедет до D-pad даже под оверлеем боя/диалога —
  «залипший» палец не останется. Второй палец на D-pad игнорируется.
  `blur()` после нажатия «E» — чтобы Enter/Space на гибридных
  устройствах не «перепечатывали» сфокусированную кнопку.
* **index.html**: `<meta viewport ... maximum-scale=1, user-scalable=no>`
  — браузерный pinch-zoom ломает on-screen-контролы (зум в игре — свой).
  z-index контролов — 5 (под панелями 10 и оверлеями 20). Контейнер на
  весь экран, но `pointer-events: none` — колесо/жесты идут к канвасу.

## Тесты

tests/controls.test.js +8 (222 → 230 pass): TOUCH_ACTIONS/DEADZONE;
isTouchDevice (каждый сигнал, мусор → false); chooseControlsScheme
(детект + переопределение + невалидное); layoutTouchControls
(позиции/размеры/влезание в вьюпорт/непересечение, bottomInset, узкий
экран, невалидные размеры → нули); touchActionAt (лучи, мёртвая зона,
диагонали, кнопки, мусор); touchMoveKeyForAction + deltaForMoveKey
(`touch:<dir>`, 'touch:interact' → null).

## Ограничения

* On-screen-контролы (ui.js) и привязка в main.js — браузерный клей,
  не покрыт node-тестами (паттерн проекта: чистое ядро тестируется,
  DOM-клей — нет).
* Управление в БОЮ и ПОДЗЕМЕЛЬЕ — у combat-ui.js / dungeon-ui.js
  свои локальные таблицы клавиш — под тач НЕ вынесено (это задача
  000041, в pending). Здесь тач-вариант — для ХОДА ПО МИРУ и диалога.

# 000295: на-экранная кнопка «Отряд» [C] (src/controls.js + src/ui.js + src/main.js + assets/ui/icon_squad.svg) — контракт

Задача: кнопка активации панели «Отряд» — иконка, БЕЗ текстовой
буквы (как кнопки [I]/[E]) — рядом с [I] и [E]; видима во всех
трёх контекстах: глобальная карта, подземелья, города. Родитель —
запрос пользователя 2026-11-02 (tasks/pending/000295.md).

Панель «Отряд» (G.squadUI) и клавиша C — СУЩЕСТВУЮТ: создала
000086 (memory/000086-squad-panel.md: IIFE G.squadUI в src/ui.js,
KeyC в keydown main.js ДО гейтов, паритет семантики с KeyI).
000295 добавил на-экранную КНОПКУ (якорь к существующему
поведению) и зафиксировал 3 контекста в SPEC (spec/companions.md
«## UI»). Downstream — 000304 (вкладка «Отряд [C]» — порядок
расстановки в существующем оверлее; контракт — §4).

## 1. Решение: кнопка-якорь в touchControls (000018/000123/000121)

Кнопки [I]/[E] — DOM-элементы `button.tc-action` в IIFE
`G.touchControls` (src/ui.js), раскладка — чистое ядро
`G.layoutTouchControls` (src/controls.js), хит-тест —
`G.touchActionAt`, видимость — `G.touchControlsVisibility` +
`applyVisibility` (000150/000154). Кнопка «Отряд» — ТОТ ЖЕ
механизм: 4-я кнопка-иконка в той же правой колонке (над [I]),
тот же размер B, тот же зазор TOUCH_ACTION_GAP = 12, та же
единица видимости `buttons`, pointerdown → callback в main.js.
Панель и клавишу НЕ трогали: G.squadUI (IIFE src/ui.js
L1549–1848), ветка KeyC (main.js L2210–2213) — бит-в-бит.

## 2. Контракты

### (а) DOM

* Кнопка — `button.tc-action` (общий CSS, flex-центрирование
  иконки), 4-й (КОНЕЧНЫЙ) ребёнок `#touch-controls`; порядок
  детей: `[dpad?, action, inventory, squad]` (порядок
  appendChild в build, ui.js).
* Содержимое — `img` c `src = 'assets/ui/icon_squad.svg'`,
  `alt = ''` (презентационная, паттерн 000124),
  `aria-label = 'Отряд'`, `pointerdown` → `preventDefault()` +
  `onSquad()` + `blur()` (паттерн [E]/[I]).
* Идентификация в vm-тестах — ТОЛЬКО по
  `img.src === 'assets/ui/icon_squad.svg'` (стабы setAttribute
  роняют aria-label — он в тестах не читается).
* Расположение в браузере — через `applyLayout()`:
  `place(squadEl, layout.squad)` (left/top/width/height inline) —
  без него кнопка рендерилась бы в (0,0) (.tc-action —
  position:absolute без дефолтной геометрии).

### (б) Раскладка (src/controls.js, layoutTouchControls)

* Та же правая колонка над inventory, зазор TOUCH_ACTION_GAP = 12:
  `squad = { x: action.x, y: inventory.y − GAP − B, w: B, h: B }`.
* Размер B — прежняя формула + член тройки:
  `B = max(0, min(96, max(56, floor(S*0.5)), availW,
  availH − inset, floor((availH − inset − GAP)/2),
  floor((availH − inset − 2*GAP)/3)))` — тройка кнопок
  (3×B + 2×зазор) влезает в вьюпорт с учётом bottomInset (на
  низком вьюпорте B ужимается ниже 56, как пара).
* Эталон 800×600 (бит-в-бит по action/inventory — без изменений):
  action `{x:688, y:488, w:96, h:96}`, inventory `{x:688, y:380,
  w:96, h:96}`, squad `{x:688, y:272, w:96, h:96}`; эталон
  1280×720: squad `{x:1168, y:392, w:96, h:96}`.
* RETURN: `{ dpad, action, inventory, squad }` (4 прямоугольника);
  невалидные размеры → ВСЕ ЧЕТЫРЕ нулевые; bottomInset ≥ availH
  → B = 0.

### (в) Хит-тест (touchActionAt)

* Приоритет: squad → inventory → action → dpad (прямоугольники
  не пересекаются — зазор > 0; приоритет формальный).
* Null-гарды: `w > 0 && h > 0` (B = 0 — не отвечает); старый
  layout-объект без squad — деградация (не крах), как без
  inventory.
* Возврат `'squad'`.

### (г) Действия

* `TOUCH_ACTIONS = ['up','down','left','right','interact',
  'inventory','squad']`.
* `'touch:squad'` — НЕ направление: `deltaForMoveKey('touch:squad')
  === null`, `touchMoveKeyForAction('squad') === null` (generic
  null-паттерн, как 'interact'/'inventory').
* TOUCH_KEY_CODES squad НЕ имеет — кнопка НЕ роутится в
  e.code (как [I]; роутинг — зона 000121, паритет).

### (д) Поведение

* `pointerdown` → `G.squadUI.toggle()` — паритет с клавишей C
  (main.js keydown L2210–2213) и с [I]-кнопкой (onInventory).
* БЕЗ маршрутизации по экранам: G.squadUI — глобальный оверлей
  (как playerUI), KeyC работает на всех экранах ДО гейтов —
  кнопка делает то же (main.js onSquad).
* main.js: `onSquad` в `G.touchControls.init({...})` (после
  onInventory); ui.js: `onSquad = h.onSquad` в init (без присваивания
  в init кнопка мёртвая — пин CB-4).

### (е) Видимость (контракт 000150, без изменений)

* Одна единица `buttons`: скрыто — бой/инвентарь/постройка
  (000154: + resurrection-пикер), видимо — карта/подземелье/город.
  3 контекста из ТЗ получены БЕСПЛАТНО от существующей логики
  frame() (main.js: applyVisibility от снимка кадра).
* `applyVisibility`: `squadEl.style.display = buttons ? '' : 'none'`
  (инлайн, идемпотентность parts — без изменений).

### (ж) Сейв

* Полей НЕТ: состояние панели не персистится (как playerUI —
  паттерн 000086/000085); save.js не тронут.

### (з) Ассет

* `assets/ui/icon_squad.svg` — 24×24, viewBox «0 0 24 24»,
  fill `#e8dcc0` (паттерн icon_action/icon_inventory): два
  силуэта (круги-головы + дуги-плечи). tests/svg.test.js
  `'ui': 13` (12 → 13).

## 3. Ре-пины (green-коммит) и границы

Ре-пины (том же коммите, что код):
* tests/controls.test.js L120–124: deepEqual TOUCH_ACTIONS 6 → 7
  (+ 'squad');
* tests/ui-touch-visibility.test.js: TV3 L209 3 → 4 детей
  (touch-схема) + L258 2 → 3 (keyboard-схема); хелпер touchDom:
  3 → 4 + 4-й ребёнок (TV4–TV7 через него — не правятся);
* tests/portal-exit-e2e.test.js PE-8: «2 кнопки» → «3 кнопки»,
  btns.length 2 → 3 (btns[0] — по-прежнему actionEl: порядок
  appendChild);
* tests/svg.test.js: `'ui': 12` → `13`;
* tests/spec-split.test.js: `"companions.md": 152` → `156`.

НЕ ТРОГАЛОСЬ (0-diff): src/spells.js, src/ally-spells.js,
src/combat.js, src/combat-ui.js, IIFE G.squadUI (src/ui.js
L1549–1848), src/save.js, index.html (CSS .tc-action общий —
кнопка в него вписалась без правок), hud.js, ветка KeyC
main.js L2210–2213, COMBAT_KEYS, CODE_DIRS/KEY_DIRS,
TOUCH_KEY_CODES, routeTouchScreen/touchKeyCode,
tests/squad-panel.test.js (P1–P6, S1–S3), D-pad-тесты,
ui-panel.test.js, формула S (D-pad) и размер/позиции action/
inventory в controls.js (бит-в-бит).

## 4. КОНТРАКТ ДЛЯ 000304

Вкладка "Отряд [C]" (000304) = существующий оверлей `G.squadUI`
(src/ui.js IIFE L1549–1848): заголовок «Отряд», открытие —
клавишей [C] (main.js keydown) или на-экранной кнопкой «Отряд»
(кнопка добавлена 000295, иконка icon_squad.svg, конечный ребёнок
`#touch-controls`, поведение = `G.squadUI.toggle()`). Точка
расширения 000304 (порядок расстановки) — строки `render()` в
`.squad-body`; 000295 НЕ ТРОГАЕТ IIFE squadUI (L1549–1848),
combat-ui.js и формат сейва — rebase 000304 тривиален.
Единственное пересечение: ре-пин `companions.md` в
tests/spec-split.test.js (000304 добавит строки в раздел «Сейв»
и ре-пиннет count, который 000295 сдвинул 152→156).

## 5. Тесты

* tests/controls.test.js: R1 (TOUCH_ACTIONS 7), R2 (эталон
  800×600 + бит-в-бит action/inventory + зазор 12), R3 (низкий/
  узкий вьюпорт + невалидные → нули + bottomInset 1e6 → B = 0),
  R4 (hit-тест squad + зазор → null + регрессии inventory/
  action), R5 ('touch:squad' — не направление; зелёный уже на
  red-стадии — generic null-путь, осознанно);
* tests/ui-touch-visibility.test.js: TV8 (e2e touch-схема:
  кнопка в DOM — по img.src, 4-й ребёнок, геометрия applyLayout
  1280×720; бой: display none с [E]/[I]; после victory —
  восстановлено);
* tests/squad-panel-e2e.test.js: CB-1 (карта: 3 кнопки, все
  видны после кадра), CB-2 (город: видима), CB-3 (подземелье:
  видима), CB-4 (клик = toggle; повторный клик — закрыто;
  паритет KeyC), CB-5 (регрессия [I]: playerUI + вкладка
  «Инвентарь»; squad-клик при закрытом playerUI — только
  squadUI);
* tests/spec-000295-wording.test.js: W1 (6 фраз раздела «## UI»
  spec/companions.md + guard 156 строк).

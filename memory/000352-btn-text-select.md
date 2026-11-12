# 000352 — выделение текста на экранных кнопках движения (D-pad)

## Баг и механизм

При нажатии на некоторые кнопки движения глифы ▲▼◀▶ подсвечивались как
текст. Экранные КНОПКИ ДВИЖЕНИЯ — ровно D-pad: `div.tc-dpad` с четырьмя
`span.tc-arrow` с ТЕКСТОВЫМИ глифами (src/ui.js build(), единственные
▲▼◀▶ во всём src). В схеме 'keyboard' экранных кнопок движения нет
вообще (000123). Тот же D-pad двигает на карте, в бою (000121) и в
подземелье.

Причина: полное отсутствие `user-select:none` в каскаде D-pad при
текстовых потомках. Три пути выделения, из которых `preventDefault()`
на `pointerdown` НЕ закрывает НИ ОДНОГО:

1. мышь: выделение стартует default-действием compatibility `mousedown`,
   который в Chrome диспатчится независимо от preventDefault на
   pointerdown; штатный жест D-pad «зажать и увести» = drag по тексту;
2. двойное нажатие — выделение «слова»-глифа;
3. long-press (iOS/Safari) — selection UI.

Отсюда «НЕКОТОРЫЕ кнопки» в ТЗ: выделение жестозависимо (drag/dblclick),
а не привязано к направлению; одиночный тап не красит. Отдельных
«невыделенных» направлений не существует — фикс покрывает весь D-pad.
`.tc-arrow { pointer-events: none }` не спасает: mousedown приземляется
на `.tc-dpad` (pointer-events:auto), а выделение с предка захватывает
текст потомков.

## Фикс

ОДНА декларация `user-select: none;` в правило `.tc-dpad` (index.html,
первый `<style>`). Свойство НАСЛЕДУЕМОЕ ⇒ покрывает все 4 `.tc-arrow` и
любой будущий текст D-pad — «единый механизм без дублей на каждую
кнопку» из ТЗ. Без `-webkit-`-префикса: index.html не содержит ни одного
`-webkit-` (house-style, T3); прецедент мира — `.combat-placebar-btn`
(index.html, `user-select: none`, тоже без префикса). Остаточный риск:
старые iOS Safari (<16.4) понимают только `-webkit-user-select` — если
понадобится, префиксная волна отдельной задачей (пострадает и placebar —
консистентно).

CSS-фикс инертен к pointer-подсистеме: user-select влияет только на
selectability; pointerdown/move/up, setPointerCapture, touch-action:none,
клики — ортогональны, обработчики НЕ тронуты (пинованы тестами).

## Отвергнутый путь «обработчик»

preventDefault на mousedown: дублирует существующий preventDefault на
pointerdown, НЕ покрывает dblclick/long-press по умолчанию, врезает
JS-правку в параллельно живой ui.js. T2 пинует отсутствие
mousedown-слушателя на `.tc-dpad` — соблазн «фикса обработчиком» красит
тест; смена механизма требует осознанного ре-пина T2.

## Сверка «заодно» (НЕ фиксить; из ТЗ)

- `.tc-action` [E]/[I]/«Отряд» (ui.js): нативные `<button>`, содержимое
  ТОЛЬКО `<img>` — выделять физически нечего; pointerdown
  preventDefault+blur. T3 пинует img-only содержимое.
- Кнопка [книга] — после 000351 это 4-я `.tc-action` в #touch-controls
  (ui.js): `<button>+<img>` — нечего выделять; прежняя
  `.spellbook-oc-btn` (main.js) УДАЛЕНА 000351, актуальный контракт —
  memory/000351-button-b-block.md (ре-пин 000362).
- `.fs-btn` (main.js): `<button>` С ТЕКСТОМ «⛶ полный экран», только
  click; на десктопе нативные button-метки не выделяются, long-press
  iOS — ВНЕ scope ТЗ (не кнопка движения).
- `.combat-placebar-btn`: УЖЕ `user-select: none` — единственный
  прецедент мира до 000352.
- `.combat-actions button` / `.combat-flee-btn`: текстовые нативные
  button — вне scope ТЗ (не экранные кнопки движения).
- Итог: выделяемым оставался ТОЛЬКО D-pad — ровно scope ТЗ.

## Тесты

tests/ui-btn-text-select-000352.test.js — 3 (computed-стили DOM-стабами
недоступны ⇒ пин CSS-источника легализован ТЗ; образец regex-пина —
tests/ui-panel.test.js #touch-controls/z-index; vm-харнес — образец
tests/ui-touch-visibility.test.js TV3):

- T1 (RED на HEAD): правило одного из D-pad-селекторов
  (#touch-controls/.tc-dpad/.tc-arrow) объявляет user-select; ВСЕ такие
  декларации — 'none' (негатив: text/auto/all красят). Пин семантический
  (по набору селекторов), а не по конкретному — Green-вариант на
  `.tc-arrow` или `#touch-controls` тоже проходит (риск пере-сужения).
 Regex толерантный; при переносе D-pad CSS в отдельный файл/блок — ре-пин.
- T2 (guard, зелёный всегда): фикс не имел права сломать конвейер —
  pointerdown → preventDefault+onHold, pointermove → onRelease+onHold
  (скольжение, точки из layoutTouchControls + оффсет 0.30·w как
  applyLayout), pointerup → onRelease; разметка: 4 span.tc-arrow с
  ▲▼◀▶ внутри dpad (лечить вырезанием текста нельзя), .tc-action ×3
  preventDefault+blur+callback; у dpad НЕТ mousedown-слушателя.
- T3 (скоуп-регистр): прецедент placebar цел; `-webkit-` в index.html
  нет; содержимое .tc-action — только img (выделять нечего ⇒ вне скоупа).
  НЕ пинит негативом отсутствие user-select у .tc-action: 000356
  легитимно вернёт туда ТЕКСТ ['I'/'C'/'E'/'B'] — 000356 обязан тогда
  сам подавить выделение СВОЕЙ правкой (ре-пин T3 не нужен; T1 его не
  касается — D-pad-селекторы другие).
  ЭРРАТА (000366): ре-пин T3 ВСЁ ЖЕ ПОНАДОБИЛСЯ — код T3
  (tagName==='img' для всех детей) краснел на span.tc-key-hint;
  T3 ре-пиннут в f7ab1f01 (+40/−14); источник правды —
  tests/ui-btn-text-select-000352.test.js:38-39 и memory/000356
  §«Находка». Исторический текст выше не переписан (форма 000362 П.3).

Мутации (/tmp/000352-m*.tap, откат через git checkout по СТАДДЖЕННОМУ
индексу — реализацию сначала стэйджить, память commit-before-mutation-checks):
M1 убрать строку → только T1; M2 `user-select: auto` на .tc-arrow →
только T1 (негатив работает); M3 убрать preventDefault из
dpad-pointerdown → только T2; M4 перенос декларации на #hud → только T1
(пин именно по D-pad-селекторам).

## Коллизии мержа

Соседи по index.html: 000351 (размер/блок .tc-action — смежные правила
ниже), 000356 (текст на .tc-action — см. выше про ре-пин). Конфликт-
поверхность этого фикса — одна добавленная строка в .tc-dpad.

# 000356 — подсказки клавиш [E]/[I]/[C]/[B] на экранных кнопках

## Что сделано

На четырёх кнопках `button.tc-action` в `#touch-controls` (блок 000351,
стопка снизу вверх E,I,C,B) — подсказка клавиши в правом нижнем углу:
`span.tc-key-hint` последним ребёнком кнопки с точным текстом
`'[E]'/'[I]'/'[C]'/'[B]'` (маппинг по иконке: icon_action.svg→[E],
icon_inventory.svg→[I], icon_squad.svg→[C],
combat_spellbook.svg→[B]).

- src/ui.js: хелпер `keyHint(btn, letter)` (el('span','tc-key-hint',
  '['+letter+']') + appendChild) в IIFE touchControls + 4 вызова сразу
  после навески pointerdown на каждую кнопку. applyVisibility, show/
  hide, root appendChild-и — 0-diff.
- index.html: в `.tc-action` добавлены `overflow: hidden` (клампинг
  подсказки на вырожденных вьюпортах B=13–18 из 000351-формулы —
  11px-текст шире кнопки; геометрию/хит-тест не меняет) и
  `user-select: none` (наследуется на span — расширение контракта
  000352 с D-pad на кнопки, «подсказка тоже не должна выделяться»);
  после `.tc-action img` — новое ГОЛОЕ правило `.tc-key-hint`
  (position:absolute; right:6%; bottom:4%; font-size:11px; line-height:1;
  color: rgba(232,220,192,0.75); pointer-events:none; user-select:none).
- src/controls.js, src/main.js, assets/, spec/, сейв, JSON-зеркала — 0-diff.
  Золотые layout 800×600 {688,488}/{688,380}/{688,272}/{688,164,96,96},
  low 18px, narrow 13px — не двигались (absolute-ребёнок не участвует в
  flex-центрировании img; хит-тест — прямоугольники кнопки).

## Дизайн-вилка (закрыта в пользу внутреннего span)

Варианты были: span ВНУТРИ кнопки / отдельный слой-обёртка / CSS ::after.
Внутренний span строго лучше:

1. `display:none` единицей buttons в applyVisibility скрывает подсказку
   автоматически — applyVisibility 0-diff;
2. дети `#touch-controls` не растут — пины children.length (TV3 5/4,
   TV8, 000332-B1, 000351-T4, e2e-счётчики 4) зелёные без правок;
3. новой ступени z-лестницы нет (коммент-пины «Лестница: .char-panel
   10 < .fs-btn 15 < … 20 < #touch-controls 30 < .spellbook-oc 35» —
   текстовые пины 000332-B2); оверлей книги z-35 остаётся над
   подсказкой; z-index подсказке НЕ задавать (рисуются поверх img
   порядком документа);
4. ::after отвергнут: потребовал бы modifier-класс на кнопке, а
   `className === 'tc-action'` — строгое равенство в пинах (TV3,
   000332-B1, 000351-T4).

## Контракт переиспользования для 000357 (боевые кнопки)

Класс `.tc-key-hint` — ГОЛЫЙ селектор (без `.tc-action`-скоупинга) и
без z-index: боевые кнопки 000357 кладут тот же span своим кнопкам и
получают стиль/угол/невыделяемость/pointer-events бесплатно. Негатив
`.tc-action .tc-key-hint` и запрет z-index запинены (T3 нового файла) —
скоупинг или z-ступень покраснят тест. Единственная точка правки стиля
— правило `.tc-key-hint` в index.html.

## Инвариант хит-теста

`pointer-events: none` на `.tc-key-hint` — ядро: мишень pointerdown
остаётся кнопка, тап по подсказке даёт ТОТ ЖЕ роут; слушателей на span
нет (пин T5 негативом). Без него span стал бы мишенью и оживил бы
выделение/перетаскивание текста. Позиционирование absolute — хитбокс и
центрирование иконки (flex, img 60%) не меняются.

## Находка: память 000352 врала про ре-пин

memory/000352-btn-text-select.md (и шапка T3) утверждали: «000356…
ре-пин T3 не нужен». Код T3 требовал `tagName==='img'` для ВСЕХ детей
кнопки — span красил его. Источник правды — код: T3 ре-пиннут честно
(содержимое = ровно [img, span.tc-key-hint] с текстом по иконке +
CSS-гард `user-select:'none'` у `.tc-action`). Исторический текст в
памяти 000352 НЕ переписывался (её «Сверка заодно» фиксировала факт
того дня); противоречие снимается этим файлом.

## Ре-пины по диску (база dbd238bf)

- tests/ui-btn-text-select-000352.test.js T3 + шапочные комментарии —
  ПЕРЕСМОТРЕНЫ (единственный покрасневший существующий тест).
- Зелёные без правок (проверено срезом): controls.test.js,
  ui-button-b-block-000351 T1–T6 (imgs-фильтр по tagName),
  spellbook-oc-button-000332 B1/B2 (imgs-фильтр; src-строка ui.js
  «Книга заклинаний» не менялась), ui-touch-visibility TV3/TV8
  (children root), squad-panel-e2e / portal-exit-e2e (root.children по
  className includes 'tc-action'; byIcon по ch.src — span.src
  undefined), ui-panel, fullscreen-button-overlay, spellbook-oc-e2e.
- Счётных пинов CSS-правил в index.html нет (regex-поиски);
  SPEC_FILE_LINES не двигался (spec/ 0-diff).

## Терминология и docs-дрейф (НЕ трогать/не блокер)

- «key-hint-строка» в HUD (hud.js buildLine «[B] книга», тест
  hud.js.test.js) — ДРУГАЯ поверхность (текстовая строка HUD), не
  путать с CSS-классом tc-key-hint.
- spec/companions.md:174 «на-экранная кнопка Отряд (иконка, без
  текстовой буквы)» после этой задачи семантически устаревает; spec/
  0-diff по брифу — решение об docs-эррате за оркестратором (по
  прецеденту spells.md-дрейфа 000351; следующая цифра задач 000361).
  — ИСПОЛНЕНО в 000366: скобка переписана по действующему контракту
  (иконка + подсказка клавиши [C] в углу, тап по ней = тап кнопки),
  иглы W1 в tests/spec-000295-wording.test.js ре-пинуты синхронно;
  перезапись line-neutral — 214 строк companions.md сохранены.
- Иероглифы ▲▼◀▶ (span.tc-arrow, D-pad) — не трогать (000352-T2).

## Тесты/мутации

tests/ui-button-key-hints-000356.test.js — 6 (T1 обе схемы сборки,
T2 children-страж, T3 CSS-пины+негативы, T4 user-select:.tc-action,
T5 полная цепочка: слушателей на span нет + роуты книга/инвентарь,
T6 гард геометрии). Матрица мутаций — tasks/result/000356.md
(/tmp/000356-m*.tap).

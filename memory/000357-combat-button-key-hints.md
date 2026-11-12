# 000357 — подсказки клавиш на боевых кнопках; «[Space]» → «[ ]»

## Что сделано

На боевых кнопках панели `.combat-actions` (src/combat-ui.js build()) —
подсказка клавиши по образцу/контракту 000356: `span.tc-key-hint`
ПОСЛЕДНИМ ребёнком кнопки. index.html 0-diff: ГОЛОЕ правило
`.tc-key-hint` (position:absolute; right:6%; bottom:4%; 11px;
pointer-events:none; user-select:none) переиспользуется бесплатно
(контракт переиспользования memory/000356); скоуп-якорь
`.combat-overlay--combat .combat-actions button { position: relative }`
(000199, под actcount) уже обеспечивал позиционирование.

Хелпер `keyHint(btn, code)` в src/combat-ui.js (перед build()):
`'[' + (code === 'Space' ? ' ' : G.CombatKeys.keyLabel(code)) + ']'`.
Маппинг Space→' ' — ЧАСТНЫЙ КЕЙС ОТОБРАЖЕНИЯ на стороне view;
src/combat-keys.js 0-diff (`keyLabel('Space') === 'Space'` — контракт
tests/combat-keys.test.js, правка покраснила бы его).

## Таблица «кнопка → код → текст» (по диску, combat-keys.js + ветки keydown)

| кнопка | primaryKey / ветка | текст |
|---|---|---|
| attack | KeyJ | [J] |
| spellbook | KeyQ | [Q] |
| block | KeyB | [B] |
| quickItem | KeyE | [E] |
| invItem | KeyT | [T] |
| flee | KeyF | [F] |
| endTurn | Space | [ ] (НЕ [Space]) |
| cast (условная, гейт — Эфир) | KeyK (ветка keydown 000168) | [K] |
| heal (условная, гейт — merc/summon с книгой) | KeyH (ветка keydown 000168) | [H] |
| lastSpell | нет клавиши (таблица заморожена, «кнопка — свой путь») | БЕЗ подсказки |
| resurrect | нет клавиши (мобильный путь) | БЕЗ подсказки |

«Кнопка = клавиша»: подсказки [K]/[H] ровно отражают существующие
ветки keydown (KeyK активен только на ходу Эфира — кнопка видима ровно
там же; KeyH на ходу игрока — фоллбук в таблицу, где KeyH отсутствует).
Новых клавиш/маршрутов нет.

## DOM-контракт

- attack/spellbook/endTurn/cast/heal: `[img, span.combat-actcount,
  span.tc-key-hint]` (подсказка — ПОСЛЕДНИЙ ребёнок, после бейджа);
- block/quickItem/invItem/flee: `[img, span.tc-key-hint]`;
- lastSpell: `[img, span.combat-actcount]`; resurrect: `[img]`.
- span персистентный, как actcount (ОДИН раз в build; render обновляет
  только disabled/title/display у кнопок и textContent/display у
  бейджей — урок 000149). Скрытие cast/heal/lastSpell (display none в
  render) скрывает подсказку автоматически (дети) — механизм видимости
  0-diff.
- Хит-тест: pointer-events:none уже в голом правиле — мишень клика
  остаётся кнопка; слушателей на span НЕТ (пин T4; тап по подсказке
  даёт тот же роут). Стаб НЕ агрегирует textContent кнопки — пинить
  тексты только у span (кнопочный `textContent === ''` в
  combat-ui.test.js зелёный и в реальном DOM он стал бы '[J]' — это
  ожидаемо, нигде не пиновать).

## Что устарело семантически (НЕ переписано, снимается этим файлом)

- Комментарий 000124-эпохи в build() («клавиша-подсказка с кнопок
  убрана (сами клавиши работают)») — оставлен байт-в-байт базовым:
  переформулировка откатана (запрет проекта на comment-строки в diff
  src; правка существующего комментария = новые comment-строки в
  добавленном). Устаревание формулировки снимается этим файлом:
  подсказки ЕСТЬ — span.tc-key-hint последним ребёнком кнопки;
  источник правды — код (CLAUDE.md).
- Комментарий теста «без текстовой подписи (000124)» про «клавиши-
  подсказки [J] НЕТ» — обновлён: подсказка — span-ребёнок, НЕ словесная
  подпись; словесных подписей по-прежнему нет, базовое правило
  `.combat-actions button` (запрет правок index.html:660) не тронут,
  overflow:hidden НЕ добавлял (кнопки квадратные aspect-ratio 1/1,
  11px-подсказка помещается; clamp-кейс 000356 касался только
  узких tc-action).
- «[B]» на боевой «Блок» и мировой [B] кнопки книги (000351) — разные
  поверхности (слой боя поверх экранных кнопок), контекстного конфликта
  нет.

## Ре-пины по диску (база f7ab1f01)

Единственный покрасневший существующий файл — tests/combat-ui.test.js:
- CU178-CAST (cast.children.length 2→3, РЕ-ПИН-комментарий);
- CU178-HEAL (heal 2→3);
- CU227-BADGE: цикл cast/heal/lastSpell разведён (cast/heal 3,
  lastSpell остаётся 2) + ИМЯ теста очищено от ставшей лживой скобки
  «(children [img, span])» → «бейдж .combat-actcount на каждой из ТРЕХ
  кнопок» (имя 000227-эпохи, маркером базы волн не является).
Зелёные без правок (срез 356/356): :1213 «без текстовой подписи»
(imgs-фильтр + badge по className + стаб-ловушка textContent),
:4355 resurrect 1, :7381 lastSpell 2, все buttons.length-пины (span не
button), combat-layout (index.html 0-diff), combat-keys (модуль 0-diff),
quicklist/inventory-panel/fled-banner/side-панели/resurrect-e2e/
000356/000352/ui.test.

## Тесты

НОВЫЙ tests/ui-combat-button-key-hints-000357.test.js — 6 (харнесс —
самодостаточный дубль loadCombatUi с withEfir/withSpells): T1 табличные
тексты + «[ ]» (негатив «Space»), T2 [K]/[H] + негативы lastSpell/
resurrect, T3 CSS-guard (ровно одно правило, скоуп-якорь, негативы
скоупинга/z-index — зелёный на RED, правило из базы), T4 слушателей нет
+ роут клика unchanged, T5 композиция детей, T6 персистентность span +
наследование скрытия. RED: красны ровно T1/T2/T4/T5/T6 (ERR_ASSERTION
«подсказка отсутствует»), GREEN 6/6; срез 14 файлов 356/356.

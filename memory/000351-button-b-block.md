# 000351 — кнопка книги [B] в общем блоке экранных кнопок

## Корень (двойственность — не «двойная инициализация»)

[E]/[I]/[C] — три `button.tc-action` в контейнере `#touch-controls`
(сборка src/ui.js, раскладка `G.layoutTouchControls` — src/controls.js:
квадрат B×B правой колонки, стопка снизу вверх E,I,C, зазоры
TOUCH_ACTION_GAP=12). [B] жила ОТДЕЛЬНЫМ миром: `button.spellbook-oc-btn`
создавался JS в `document.body` (src/main.js, click-слушатель), CSS
`position:fixed; top/right:12px; 36×36; z-15` (отсюда «выбивается
размером/контейнером»), + frame-lift z-25 в frame-хуке (fsOver) и свой
сегмент в лестничном комментарии index.html.

## Фикс

- **controls.js:** `TOUCH_ACTIONS` += `'spellbook'`; в раскладку — 5-й
  прямоугольник `spellbook` (та же колонка, над squad); в формулу B —
  4-й член `Math.floor((availH − inset − 3*GAP) / 4)`; `touchActionAt`
  проверяет spellbook ПЕРВОЙ (прямоугольники не пересекаются —
  приоритет формален); `TOUCH_KEY_CODES`/`routeTouchScreen`/
  `touchControlsVisibility` — 0-diff (spellbook НЕ роутится в бой, как
  inventory/squad).
- **ui.js:** 4-я `button.tc-action` (иконка
  `assets/ui/combat_spellbook.svg` — переиспользование, `alt=''`,
  aria-label через setAttribute; pointerdown → preventDefault →
  `onSpellbook` → blur — ИДЕНТИЧНЫЙ слушатель сиблингов, иначе
  ui-btn-text-select-000352 T2 с парами [[1,1]…] покраснеет);
  `root.appendChild(spellbookEl)` последней; `place(spellbookEl, …)`;
  `applyVisibility`: та же единица `buttons` (бой — display:none).
- **main.js:** удалены `sbBtn` (создание/click/appendChild) и блок
  frame-lift `sbBtn`; в `G.touchControls.init` —
  `onSpellbook: () => { if (G.spellbookOC) G.spellbookOC.toggle(); }`
  (тот же роут, что KeyB; keydown-блоки и combat KeyB='block' — 0-diff).
- **index.html:** правило `.spellbook-oc-btn` (+hover/img) и лестничный
  сегмент «`.spellbook-oc-btn 15 <`» удалены; гварды #touch-controls
  z-30 / .tc-action / .spellbook-oc (оверлей книги) z-35 — целы.

## Геометрия (пересчёт по формулам; пины)

- 800×600: B=96 (новый /4-член = 133 НЕ активен) — action {688,488},
  inventory {688,380}, squad {688,272}, spellbook {688,164} — верхние
  ТРИ бит-в-бит прежние (хитбоксы E/I/C не двигались).
- 1280×720: spellbook {1168,284}, squad остаётся {1168,392}.
- 800×140: B 28→18 (активен /4-член): squad {766,46,18,18},
  spellbook {766,16,18,18}; 100×120: B 21→13: squad {71,41,13,13},
  spellbook {71,16,13,13}.
- bottomInset-кейс: стопка поднимается целиком, B не меняется (130>96).

## Бой / оверлеи

Кнопка скрыта единицей `buttons` (ui.js applyVisibility) — доступ
исчезает физически; второй эшелон — `blocked()` (combatUI.isActive)
внутри `spellbookOC.toggle()` (политика 000332 B4 сохранена семантически).
Над dungeon/combat-оверлеями (z-20) в локациях — контейнер
`#touch-controls` z-30 (прецедент 000121), frame-lift НЕ нужен. Оверлей
книги `.spellbook-oc` z-35 > 30 — «кнопка под открытой книгой» как
раньше.

## Удалённые контракты 000332 (пересняты в том же коммите)

B1 (body-кнопка, type/title/ariaLabel-свойства, click-слушатель) →
4-я .tc-action + pointerdown; B2 (правило .spellbook-oc-btn 4 свойства +
лестничный сегмент) → НЕГАТИВ (правила и упоминаний нет); B4 (inline z
''/'25' по экранам) → inline zIndex не задаётся никогда + z-30/20 CSS-
гарды + display:none в бою.

## Ре-пины (ловятся красным срезом до коммита)

controls.test.js (TOUCH_ACTIONS ×2 → 8; low.squad → {766,46,18,18};
narrow.squad → {71,41,13,13}); ui-touch-visibility (TV3 children 4→5 и
keyboard 3→4 + spellbook в display-циклах; touchDom 4→5; TV8 4→5,
squad=children[3], книга=children[4] {1168,284,96,96} + бою/рестору);
squad-panel-e2e `touchButtons` 3→4; portal-exit-e2e PE-8 3→4;
ui-btn-text-select-000352 T2 4 кнопки / 4 пары / fired += spellbook;
spellbook-oc-button-000332 (см. выше). НЕ двигались: R6/R7… не было —
ethalon 800×600 action/inventory/squad, map/movement-freeze dpad-сканы,
combat-keys, ui-panel z-пины, city-inventory CI-13, index-order.

## Ловушки

- **Двойной роут:** click-слушатель обязан исчезнуть — в живом браузере
  click после pointerdown повторно дёрнул бы toggle (открыл/закрыл за
  тап). Гард — T4 (click undefined) + grep 'spellbook-oc-btn' main.js
  (T6).
- **makeEl-стабы:** `setAttribute` роняет aria-* (только data-*) —
  идентификация кнопки по img.src (прецедент squad-panel/TV8); blur
  счётен только в stubEl-харнессе 000352, в makeEl — no-op.
- **frame-lift:** не путать с подъёмом #hud/.fs-btn (fsOver остаётся для
  них; удалён только сегмент sbBtn).
- **Расширение стопки (5-я кнопка) = ре-пин:** золотые low/narrow
  (controls.test + наши T2), TV3/TV8 children-длины, e2e-счётчики,
  TOUCH_ACTIONS ×2, новый /5-член B.

## Docs-дрейф

`spec/spells.md` §«Каст вне боя» (~183-190) описывает СТАРУЮ кнопку:
правый верхний угол `.spellbook-oc-btn`, frame-lift z-25 — после фикса
устарело. spec/ 0-diff по бриферу (spec-split/SPEC_FILE_LINES пины);
эррата — отдельной docs-errata задачей (оркестратор; на диске свободен
000361+).

## Фиксы ревью (тот же коммит)

Удалены ВСЕ добавленные комментарии в src/ (правило «без комментариев»,
прецедент 000359.01): ui.js — 5-строчный блок перед `spellbookEl`;
main.js — 2 строки перед `onSpellbook`; controls.js — 2 строки перед
`spellbook`-прямоугольником и переписанный комментарий членов B (база
имела свой 5-строчный — удалён вместе с переизданием). Обоснование
формулы (5 прямоугольников, три clamp-члена, неактивность на типичных
вьюпортах) несёт JSDoc `layoutTouchControls` + раздел «Геометрия» выше.
Поведение кода не менялось; после правок — пересрез UI-среза.

## Мутации (матрица — tasks/result/000351.md)

M1 вернуть CSS-правило → красные T5 + 000332-B2; M2 снять /4-член →
T2 + controls.test low/narrow; M3 не прятать spellbook в
applyVisibility → T6 + TV3/TV8; M4 appendChild в body → T4 + счётчики
e2e + TV3; M5 поставить без зазора → T1 (+T3); M6 снять spellbook-ветку
touchActionAt → T3; финал — 6/6.

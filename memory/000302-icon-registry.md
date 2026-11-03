# 000302 — реестр дочерних + конвенция генерации предметных иконок + формула ре-пина

Задача: tasks/pending/000302.md → tasks/done/ (в коммите сплита).
Дата: 2026-11-03, master 77578ff (база 3635/3635). Код НЕ меняется —
декомпозиция.

## 1. Реестр дочерних (порядок = нумерация; финальная .08)

| номер | группа | K | id-диапазоны | exclusion-набор (items.test.js) | тест-файл |
|---|---|---|---|---|---|
| 000302.01 | свитки Огонь | 25 | 000108–000132 | SCROLLS_FIRE_00030201 | tests/item-icons-000302.01.test.js |
| 000302.02 | свитки Лёд | 25 | 000133–000157 | SCROLLS_ICE_00030202 | tests/item-icons-000302.02.test.js |
| 000302.03 | свитки Тень | 25 | 000233–000257 | SCROLLS_SHADOW_00030203 | tests/item-icons-000302.03.test.js |
| 000302.04 | свитки Исцеление | 25 | 000258–000282 | SCROLLS_HEALING_00030204 | tests/item-icons-000302.04.test.js |
| 000302.05 | свитки Защита | 25 | 000460–000484 | SCROLLS_PROTECTION_00030205 | tests/item-icons-000302.05.test.js |
| 000302.06 | свитки Природа | 25 | 000487–000511 | SCROLLS_NATURE_00030206 | tests/item-icons-000302.06.test.js |
| 000302.07 | книги + legacy-свитки + resurrect | 20 | 000019–000032 (11), 000043–000051 (9) | BOOKS_LEGACY_00030207 | tests/item-icons-000302.07.test.js |
| 000302.08 | legacy-снаряжение/расходники + SWEEP | 23 | 000001–000022 (15), 000024, 000036, 000038, 000042 | LEGACY_GEAR_00030208 | tests/item-icons-000302.08.test.js |

Итог .08: каталог 511 = 511 с icon + 0 без; sweep-тест «0 без».

## 2. Конвенция генерации (Д1)

Стиль — ПРЕДМЕТНЫЙ (не spell 24×24): ВСЕ 285 существующих
assets/sprites/items/*.svg — viewBox "0 0 64 64" (100%), flat-полигоны
(polygon/path/circle/ellipse), среднее 8.3 элемента (4–21),
тень-эллипс внизу fill="rgba(0,0,0,0.18…0.22)", акцент цвета предмета
(семейство ниже) + базовые пергаментные/металлические тоны
(#e8dcc0, #d9c9a3, #c9b98f, #6a7480, #8d8fa0). Без градиентов, обводок
по контуру, текста, NaN/Infinity. Прецеденты: memory/000232-craft-
learned-kinds.md D-icons; образцы assets/sprites/items/straw_hat.svg,
blueprint_forge.svg, berry_red.svg (loot/).
Мандат валидности: каждый SVG — sweep tests/svg.test.js (well-formed,
корень svg, xmlns, viewBox 4 конечных числа, без NaN/пустых значений
атрибутов; строгий парсер — без неэкранированных &</DOCTYPE/CDATA)
ДО добавления в assets/. Имя файла = <id>.svg в assets/sprites/items/.

## 3. Палитра акцентов (семейства, по школам/видам)

* Огонь: #c96f3b (forge-прецедент), #f08050, #e87820.
* Лёд: #4a94c8, #8ab8e8, #b8d8f0.
* Тень: #563a82, #8888e8, #3a2e5a.
* Исцеление: #5aa469, #8ab4e8, #e0e8f0.
* Защита: #8a744c, #c9a86a, #8d8fa0 (камень).
* Природа: #5a8a44, #85b771, #4a6a34.
* Книги/свитки legacy: пергамент #d9c9a3/#e8dcc0 + акцент эффекта.
* Оружие: сталь #6a7480/#8a8a9a, дерево #a07c4f/#7c6a4c.
* Броня: кожа #8a6f4a, металл #8a8a9a/#b8b8c8.
* Зелья: heal #a03040/#c04858, mana #5a7fd6/#88a8e8.
* Еда: #c9a23c (хлеб), #a05838 (мясо), #c9b98f (пирог).
* Реагенты: камень #6a6472, уголь #3a3a44, сера #c96f3b.

## 4. Формула ре-пина (пересчёт ПО ДИСКУ, memory/000284-spec-items-
microdrift.md §2 — числа ТЗ = снапшоты)

W = count(icon) по assets/items/*NNNNNN.json; U = 511 − W;
S = count(assets/sprites/items/*.svg). После дочерней с K:
W′ = W+K, U′ = U−K, S′ = S+K (511 константа).
Места ре-пина (каждой дочерней):
1. tests/items.test.js: :2524 (шапка I1, токены U/W; ровно одна
   строка с «прочие»), :2538 (title I1: «прочие U′ — icon undefined /
   W′ с icon» + «ре-пин 000302.YY …»; сохранить «000243: финальный,
   каталог 511»), +exclusion-набор (уникальное имя, §1) + if-цепочка,
   :2700 (others = U′), :2719 (icon = W′), :2743 (I2-сообщение:
   «прочие U′ предмет(а/ов) … каталог 511 = W′ с icon + U′ без; ре-пин
   000302.YY: …»; сохранить «000243.01»/«511»; .08 — финальная
   формулировка «без icon — 0 предметов; финал 000302.08: каталог
   511 = 511 с icon; финал 000243.01: 318 с icon + 193 без»).
2. tests/final-repins-000243.test.js: I1-T :151/:154/:170/:172, I1-H
   :191/:193.
3. tests/i2-message-000243.01.test.js: :61 (U′), :72 (W′), :85 (W′),
   :87 (U′).
4. tests/svg.test.js:472: 'sprites/items' = S′.
5. .08 ТОЛЬКО: tests/ui-panel.test.js (237-INV-1/2/G),
   tests/combat-ui.test.js (237-CU-LOOT-1) — bread/iron_sword/
   sulfur получили icon: «без img» → «img первым (src из каталога)».

Падеж U′: 168/118/68/0 «предметов»; 143/93/43/23 «предмета».
Backstop-маскировка: U′=43/23 (⊂ «000243.01»), U′=0 — несущий пин =
regex /(\d+)\s*предмет[аов]/ = live (memory/000243.03-i2-message-
matchers.md).

## 5. Подводные камни

* schema.json НЕ трогать (icon optional, паттерн (loot|items) —
  ре-пин 000230.01).
* spec/items.md НЕ трогать (318/193 не ведёт; 511 стабильно) →
  spec-split items.md:366 (tests/spec-split.test.js:132) и canon-sync
  000284.02 T10 (366 строк/30973 байт) — цёлы.
* src/items-data.js — ТОЛЬКО через node scripts/sync-items-data.js
  (deepEqual-тест items.test.js:65).
* Зеркало и JSON — один коммит; CHANGELOG — отдельный (000232/000237).
* 000308 (tooltip) безопасен: «без иконки» — FX-фикстура (tests/
  tooltip-item-icon-000308.test.js:31-32).
* 511/478/222-пины (items.test.js:1815/2273/3057, spells.test.js:3366,
  assets-schemas.test.js:252, rar-g, spec-wording) — не двигаются.

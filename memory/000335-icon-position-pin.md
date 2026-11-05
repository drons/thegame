# 000335 — позиционный пин «icon КОНЦОМ объекта» + sweep flat-SVG

Дата: 2026-11-05. Worktree task-000335; база master 97bf78f (ретро-
фиксы b2-20261105). tests-only: JSON assets/ и src/items-data.js
НЕ тронуты (факт позиции уже верен на диске).

## Контракт позиционного пина

Системная finding ретро b2-20261105 (все 8 волн 000302.01–.08 +
000302.02 minor): требование «icon КОНЦОМ объекта» (НЕ-экипировка)
не было закреплено ни одним тестом — перестановка icon в JSON+
зеркале проходила бы тихо (deepEqual нечувствителен к порядку
ключей; зеркало пишет sync-items-data.js в канон-порядке KEYS).

Пин: `assert.equal(Object.keys(j).at(-1), 'icon', ...)` — в тела
существующих test()-блоков files item-icons-000302.0{1..8}.test.js,
рядом с icon-ассертами. Механика: JSON.parse сохраняет порядок
вставки для non-integer string keys — зелёный с первого запуска
(факт на диске: 183/183 lastKey='icon' проверено на базе).
Осмысленность — мутацией БЕЗ коммита: перестановка icon в один
JSON + зеркало src/items-data.js → пин красный → `git restore`.

Состав НЕ-экипировки (183 id = 150 + 20 + 13):
* 000302.01–.06 — ВСЕ 25 свитков школы на волну (150): списки в
  константах SCROLLS_*/BOOKS_LEGACY/LEGACY_GEAR соответствующих
  тест-файлов (id = <spell>_scroll);
* 000302.07 — 20: 11 книг (alchemy_manual, sword_treatise,
  archery_manual, stone_fist_grimoire, iron_hide_tome,
  fire_spellbook, ice_spellbook, heavy_tome, archer_scroll,
  meditation_scroll, nature_scroll) + 9 legacy-свитков (000043–
  000051: fireball…resurrect_scroll);
* 000302.08 — 13 НЕ-экипировки legacy (000011–000018: 5 зельй +
  3 еды; 000022/000024/000036/000038/000042: 5 реагентов) — в
  .08 зафиксированы Set NON_EQUIP_000335 + if в per-item-цикле.

ЛОВУШКА .08 (прецедент): у 10 ЭКИПИРОВКИ 000001–000010 (wood_sword…
knight_plate) lastKey='slot' (порядок ...,stats,icon,slot — канон
000284, memory/000302.08-legacy-gear-icons.md «РЕШЕНИЕ», пинят
T1/R7/T7 deepEqual Object.keys) — naive-ассерт по всем 23 пошёл бы
в RED. Экипировку НЕ трогать.

## Stale-коммент W-06 (000302.02 minor)

tests/items.test.js (шапка секции 000235.08): «// rarity/icon/
loot — НЕТ (пины RAR-G/I1/L3).» → «// rarity/loot — НЕТ (пины
RAR-G/L3); icon = assets/sprites/items/<id>.svg (ре-пин 000302).»
(дословно по ТЗ; атрибуция 000302 — ре-пин ассерта icon = path
сделан волной 000302.02, не этой задачей). Одна строка, line-count
не меняется; пины e9-header-canary/final-repins/i2-message
привязаны к другим секциям — 0 пересечений.

## Sweep: tests/item-svg-flat-000335.test.js (решение — ДЕЛАТЬ)

Единственный незакрытый info-разрыв всех 8 ретро: стиль 218 SVG
волн 000302 живёт только в memory/000302-icon-registry.md §2/§3.
Не дублирует svg.test.js — тот по явной шапке «ЧТО НАМЕРЕННО НЕ
ПРОВЕРЯЕТСЯ ЗДЕСЬ» проверяет только well-formedness/корень/
viewBox-4-числа/NaN/счёт; размеры viewBox и теги — нет.

checkFlatItemSvg(text) → массив нарушений:
* viewBox="0 0 64 64" — точная подстрока ровно 1 (svg.test.js
  знает только «4 конечных числа»);
* запрещённые маркеры flat-SVG-контракта: /<linearGradient[\s>\/]/,
  /<radialGradient[\s>\/]/, /<text[\s>\/]/ (НЕ матчит <textPath),
  /<path[\s>\/]/, /<use[\s>\/]/, /stroke=/.

Краснота осмысленна БЕЗ фиксации кривого файла: тест-чекер пишет
8 кривых фикстур (viewBox-32, viewBox-none, 5 тегов, stroke) в
ос.tmpdir() (mkdtempSync, очистка в finally) и требует непустой
список нарушений с соответствующим маркером; чистая фикстура → [].

SWEEP каталога assets/sprites/items (478 = S-пин svg.test.js,
который sweep НЕ дублирует — счёт файлов в sweep не пинится):
* у каждого файла нарушения, кроме stroke=, — 0;
* stroke= легален ТОЛЬКО для 46 legacy-файлов 000230.x (снаряжение:
  <line>-ленты/шнуровка, ring-обводки) — заморозка
  LEGACY_STROKE_000335 (конвенция exclusion-списков проекта,
  паттерн LEGACY_GEAR_00030208/BOOKS_LEGACY_00030207);
* канарейка (отклонение от «статичного без канарейки» анализа):
  strokeSeen === 46 — перегенерация legacy-файла без stroke= (или
  новый файл с stroke=) красит sweep и требует ре-пина заморозки;
* ни один из 218 SVG волн 000302 stroke= не содержит (проверено
  по диску на 97bf78f).

0-diff: assets/ (478 SVG + 511 JSON), src/, spec/, svg.test.js
сам не изменён, EXPECTED_SVG_BY_DIR['sprites/items']=478 цёл.

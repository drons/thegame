# 000329 — перенос SVG-иконок/текстур в assets/sprites/*

Карточка: tasks/done/000329.md; приёмка: tasks/result/000329.md;
свип: tests/assets-sprites-integrity-000329.test.js (T1–T7).

## 1. Маппинг (диск на момент переноса, 446 SVG, контент 0-diff, R100)

| было (assets/) | стало (assets/sprites/) | файлов |
|---|---|---|
| building-icons | building (ЕД. число!) | 26 |
| city/walls | city/walls | 20 |
| combat/bg, combat/obstacles | combat/bg, combat/obstacles | 11 + 3 |
| dungeon, dungeon/floor, dungeon/walls | dungeon, dungeon/floor, dungeon/walls | 7 + 40 + 60 |
| portraits/*.svg (ТОЛЬКО SVG) | portraits | 8 |
| school-icons | skills | 6 |
| spell-icons | spells | 222 |
| tiles | tiles | 30 |
| ui | ui | 13 |

Итого SVG в assets/ неизменно 1872 (сумма таблицы EXPECTED_SVG_BY_DIR в
tests/svg.test.js не двигалась — имя теста «ровно 1872» стабилен и
переживает перенос; это маркер базы TAP).

- `sprites/building` (ед. число, numeric NNNNNN.svg — иконки меню
  «Строительство», 000293) СОСУДЕСТВУЕТ с `sprites/buildings` (мн. число,
  slug-спрайты построек 53) — НЕ сливать; схема buildings — union
  `^assets/(sprites/(buildings|cities)|sprites/building)/[\w]+\.svg$`
  (старая ветка building-icons из union снята; BI-3 пинует её дословно).
- `assets/dungeons` (JSON-каталог типов, 44 файла) НЕ переносился —
  ложный друг `assets/dungeon`; все правки только с завершающим слэшем
  или `\b`, `git diff | grep assets/dungeons/` пуст.
- Портреты: JSON-каталог assets/portraits/ остаётся (схема 000142,
  icon — голое имя `<basename>.svg`); перенесены только 8 SVG. Префикс
  пути у ПОТРЕБИТЕЛЕЙ: src/ui.js, src/building-ui.js,
  src/ui-tab-skills.js (`'assets/sprites/portraits/' + p.icon`), плюс
  scripts/sync-portraits.js (два каталога: PDIR=JSON, SDIR=SVG; канон
  8 JSON и 8 SVG проверяются раздельно, зеркало portraits-data.js байт-
  в-байт не изменилось — icon там голый).

## 2. Мёртвых файлов НЕТ (0 из 446)

Ветка карточки «найти JSON / удалить мёртвый SVG» — no-op. Скан
src+tests+scripts+spec+index.html+assets-JSON: каждая из 446 иконок
ссылаема. 77 «кандидатов в мёртвые» разрешаются динамической сборкой:

- 80 стен (city/walls + dungeon/walls): `<префикс стиля>_<имя>.svg`,
  имена — src/sprites.js WALL_AUTOTILE_NAMES × константы префиксов;
- 11 combat/bg: таблицы COMBAT_BG_TERRAIN / COMBAT_BG_DUNGEON + plain
  (чистая функция combatBackground);
- 40 dungeon/floor: DUNGEON_FLOOR_FRAMES;
- combat_<action>.svg (ui): src/combat-ui.js конкатенация по действию.

Свип T4 кодирует ровно эти правила резолвинга (литерал basename в
код-корпусе src/scripts/index.html/assets-JSON ИЛИ таблица модуля
sprites.js ИЛИ префикс×конкатенация для ui combat_*); список исключений
T4 — пуст.

## 3. Схема spells

assets/spells/schema.json pattern icon: `^assets/[a-z0-9_-]+/[a-z]`
`[a-z0-9_]*\\.svg$` (односегментный — перенос в двухсегментный
sprites/spells его ломал) → `^assets/sprites/spells/[a-z][a-z0-9_]*\\.svg$`;
дословный пин tests/spellbook.test.js переехал в том же коммите.
Схемы skills (icon без path-паттерна), items, runes — не тронуты.

## 4. Точки downstream (для следующих волн)

- Новые спелл-иконки (.321.12/.13 и т.п.) кладутся в
  assets/sprites/spells/, правятся: строка таблицы `'sprites/spells': N`
  в tests/svg.test.js, dir-аргументы W-05 блоков (`path.join(ROOT,
  'assets', 'sprites', 'spells')`), message «sprites/spells — N файла».
  Иконки школ — assets/sprites/skills/; иконки построек-меню —
  assets/sprites/building/.
- Формы устаревших путей запрещены свипом T3 (сканирует src/tests/
  scripts/spec/index.html/assets-JSON на `assets/<старый каталог>\b` и
  join-форму `'assets', '<старый сегмент>'`; литералы собираться
  динамически, чтобы не пилить ложных хитов).
- tests/assets-refs.test.js намеренно СОХРАНЯЕТ негативную форму
  `assets/portraits/efir.svg` (AR3) — это fixture шейпа имени JSON-
  каталога (SVG-строка обязана НЕ считаться ref), а не ссылка на файл;
  каталог JSON на месте, свип portraits-литералы не сканирует.
- Зеркала src/spells-data.js (222), src/buildings.js (26),
  src/skills-data.js (6) — РЕГЕН (sync-spells-data/sync-buildings-data/
  sync-skills-data), не ручная правка; sync:check=0 на чистом дереве.
- spec правки line-neutral (spells.md, skills.md, world-map.md,
  dungeons-storage.md, companions.md) — таблица SPEC_FILE_LINES в
  tests/spec-split.test.js не двигалась; wording-игла
  spec-000235-wording.test.js про `icon` — …assets/sprites/spells/
  <id>.svg… переехала вместе со spec в том же коммите.

## 5. Приёмка

RED /tmp/sprites-mv329-red.tap — свип 7/7 осмысленными ERR_ASSERTION
(каталоги живы/новых нет/устаревшие литералы/схемы) без краха загрузки;
GREEN — 7/7. Матрица мутаций M1–M6 — в tasks/result/000329.md.
CHANGELOG не нужен: путь-косметика без геймплея (свип пользовательского
эффекта не нашёл — ни один ассерт о рендере не изменил поведения).

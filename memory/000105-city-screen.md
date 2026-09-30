# 000105: вход/выход в город и экран города — ключевые решения

Создано на раунде 3 ревью (до него решения жили только в
код-комментариях — не принято: «Важную информацию записывай в
каталог memory» — CLAUDE.md). Сёстры: 000102/000103/000104/000106/
000108. Родитель: 000052 (города и деревни). Отчёт —
tasks/result/000105.md.

## Состояние: dungeonState обобщена полем kind: 'dungeon' | 'city'

* dungeonState — ОДИН (src/main.js), ветка по kind. Пути
  подземелья БЕЗ ИЗМЕНЕНИЙ (kind: 'dungeon' добавлен в
  makeDungeonState — 000068).
* `makeCityState(layout, buildingRec, worldKey)` — та же форма, что
  makeDungeonState (000068): dg, contents: **null** (город пуст —
  содержимое 000106), kind: 'city', name, x/y/prevX/prevY (entrance),
  worldKey, log, **mover + pos(now)** (тот же движок 000068:
  G.createMover null-гард, защитный снап в entrance,
  ds.pos = (now) => mover.position(now) | {x, y}).
* `maybeEnterCity()` — на шаге на тайл с каталожной записью
  категории «город» (000102/000103: buildingId 51..54; у города
  building — NONE, опознаётся по buildingId). Layout —
  `G.Cities.createCityLayout(ax, ay, rec.размер.ширина)` (000104)
  от **ЯКОРЯ** (t.buildingAnchor), а не от позиции героя: один
  якорь → один layout навсегда.
* `exitCity()` — по шагу на выходную клетку layout'а (cityMove):
  dungeonState = null + G.dungeonUI.close() + saveNow().
* **РЕШЕНИЕ (SPEC «Города и деревни»)**: вход/выход из города НЕ
  тратит игровой день — clock.event НЕ вызывается (правило
  подземелья «день проходит» на города НЕ переносится: город —
  локация поверх мира, а не «подземная экспедиция»). Герой выходит
  в тот же день, в который зашёл. dungeonMemory/contentValid для
  города НЕ применяются (персистентность — сейв, 000109).

## __game.dungeon для города (контракт, src/main.js)

* `get dungeon()` возвращает `{ kind, type, name, width, height,
  cells, entrance, x, y, exit, mobs, chests, day }`.
* Для города: **type/mobs/chests — null, а не undefined** (ревью
  раунда 1): у layout города (createCityLayout) поля type нет —
  undefined JSON-сериализация тихо drop'ит, null — явный «типа
  нет» как у mobs/chests (contents города null). name —
  название_карты каталога. Закреплено тестами
  (tests/dungeon-ui.test.js, секция города).

## Экран города — режим dungeon-ui (src/dungeon-ui.js)

* Режим по `state.kind === 'city'`: заголовок — имя города
  (s.name), БЕЗ строк групп/сундуков (contents null) и БЕЗ
  DUNGEON_NAMES (type null).
* **СВОИ тайлы** (не 5 типов подземелий): `CITY_FLOOR_VARIANTS =
  ['#b3a284', '#a5947a', '#c0b090']`, `CITY_WALL_VARIANTS =
  ['#77685a', '#66594c']` — табличная структура, чтобы 000110 мог
  подменить цвета на SVG-пути (визуальное доведение).
  **РЕШЕНИЕ (ревью раунда 3)**: палитра живёт в dungeon-ui.js, а
  НЕ в src/cities.js: cities.js — чистый модуль данных/layout
  (000104/000106, node-require-тесты), палитра — РЕНДЕРНАЯ
  забота оверлея (как палитра 5 типов подземелий уже в
  dungeon-ui.js); cities.js из-за этого не трогаем вовсе.
* Стены города (периметр layout) РИСУЮТСЯ (в подземелье
  стена-клетки не рисуются); выходная клетка — маркер.
* Движение/зум/камера — общий движок 000066 (тот же zoom, что мир).

## Соль CITY_TILE_SEED = 0x43495459 (ASCII «CITY»)

* НОВАЯ константа (src/dungeon-ui.js) — выбор варианта городского
  тайла. НЕ GLOBAL_SEED, НЕ CITY_SEED_CONST (000103 — канал/
  wealth), НЕ CITY_LAYOUT_CONST (000104 — layout), НЕ сиды
  dungeon.js: смена любой из них ломает свои золотые; соль города
  раздельная (смена CITY_TILE_SEED после мержа = перекраска ВСЕХ
  городов — недопустима, паттерн CITY_SEED_CONST/CITY_LAYOUT_CONST).
* `cityTileVariant(count, x, y, seed)` — чистая функция:
  hash2(x, y, seed + CITY_TILE_SEED) % count (hash2 — perlin.js,
  из ЖИВОГО Game в момент вызова — UMD-ловушка 000038); фолбэк
  без perlin.js `((x*73856093) ^ (y*19349663) ^ salt) >>> 0` %
  count — тоже зависит от seed (регрессия ревью 000105: иначе
  разные города (разные layout.seed) окрасились бы ОДИНАКОВО).
* **GOLDEN-ПИН литерала** — tests/dungeon-ui.test.js (раунд 3):
  как CITY_SEED_CONST 000103 / CITY_LAYOUT_CONST 000104.

## HUD (src/main.js)

* Внутри города: заголовок `--- <имя города> (x, y) ---` +
  «До выхода: ~N клеток» (БЕЗ строк групп — contents null; ветка
  по kind обязательна, иначе ds.contents.mobs упадёт).
* Мир, герой на городском тайле: строка «Здесь: <имя города>
  (вход — шагните)» — FALLBACK (ревью раунда 1): у города
  building — NONE → buildingNameUi '' → строка «Здесь: » с пустым
  именем видна после выхода, пока герой стоит на тайле. Имя — из
  каталожной записи (000102): название_карты || название (тот же
  вывод, что заголовок в makeCityState), регистр — конвенция
  buildingNameUi (первая буква в нижнем).
* [E]-гард (toggleNpcDialog: dungeonUI.isActive → return) НЕ
  менялся — взаимодействие в городе — 000107 (через buildingUI
  000071).

## Ограничения для подзадач

* 000106 (содержимое): генерирует содержимое ГОРОДА (000108 —
  лавки), но состояние города здесь: contents у города null ДО
  000106; после 000106 — заполняется (форма — по 000106/000109).
* 000107 (взаимодействие [E] в городе) — поднимет гард
  dungeonUI.isActive в toggleNpcDialog (путь через buildingUI).
* 000109 (сейв состояния города) — персистентность вместо
  dungeonMemory.
* 000110 (визуал) — подменит CITY_*_VARIANTS на SVG-пути (табличная
  структура под это).

# 000104: layout города — src/cities.js (чистый модуль)

Дочерняя к 000052 (города и деревни), П1; зависимости 000103
(городской канал) и 000058 (каталог подземелий) — в master.

## Зафиксированные решения (golden-пины в tests/cities.test.js)

* **Внутренний размер = footprint × 2 — УНИФОРМНО**: 1→2x2, 2→4x4,
  5→10x10, 7→14x14 (пример из задачи). Хутор (footprint 1) —
  вырожденный 2x2: ВСЕ 4 клетки — периметр, внутренности НЕТ
  (000102: хутор «без внутренностей», мин_постройки=0 — доли_типов
  {44:1} фактически не размещаются; противоречие «таверна в каждом
  городе» уже разрешено 000102 нулём минимума). Альтернатива
  max(3, 2×footprint) ОТКЛОНЕНА: ломает униформность формулы и
  пример задачи; вырожденный случай задокументирован и покрыт
  тестом.
* **CITY_LAYOUT_CONST = 0x4c41594f** (ASCII «LAYO») — НОВАЯ соль:
  не GLOBAL_SEED (0xf10c7a26, слоты), не CITY_SEED_CONST
  (GLOBAL_SEED^0x43495459, тип города 000103), не сиды dungeon.js
  (0xd0d6b5e5 форма, 0x5e11c3a7/0x0c9f4b2d стены, 0x5e11 контент,
  GLOBAL_SEED^0xabcdef моб-группы, 0x7777 wander). GOLDEN-ПИН
  (тест: литерал 0x4c41594f): смена константы после мержа = смена
  ВСЕХ городских layout'ов — НЕДОПУСТИМА (прецедент CITY_SEED_CONST
  000103). GLOBAL_SEED в константу НЕ смешивается: cities.js не
  тянет map.js (взаимных require в момент загрузки нет; цепочка
  tests/dungeon-ui.test.js грузит dungeon.js без cities.js), а
  дублировать 0xf10c7a26 нельзя (аудит 000053).
* **seed = hash2(cityX, cityY, CITY_LAYOUT_CONST) >>> 0** — от
  ПОЗИЦИИ города. НЕ totalXp (город не меняется с опытом — в
  отличие от generateDungeonContents), НЕ террейн, НЕ map.png.
  Layout СТАТИЧЕН: один якорь → один layout навсегда.
* **Вход/выход**: entrance — ЮЖНЫЙ периметр (y = height−1),
  exit — СЕВЕРНЫЙ (y = 0). x — из rng(mulberry32(seed)) по
  колоннам 1..W−2 (порядок вызовов rng: СНАЧАЛА entrance.x,
  затем exit.x — golden-пин); при W=2 (хутор) оба x=0 — клетки
  смежные по вертикали, BFS проходит. «Сторона захода героя» в
  функцию НЕ передаётся (сигнатура createCityLayout(cityX, cityY,
  footprint) — ровно 3 параметра): направление захода — проблема
  экрана 000105 (state), layout — статичная функция позиции.
* **Клетки**: периметр = CELL_WALL (0), внутренность — сплошное
  открытое пространство CELL_FLOOR (1) — город НЕ лабиринт;
  «улицы/кварталы» по умолчанию НЕ делаются (решение задачи);
  000106 разместит постройки на FLOOR-клетках паттерном takeSpot.
  Значения 0/1 = значения dungeon.js (dungeon-ui/000066 рисует
  без изменений); константы ПЕРЕОПРЕДЕЛЕНЫ в cities.js (взаимный
  require невозможен) — равенство закреплено тестом.
* **Форма layout**: `{ width, height, cells, entrance:{x,y},
  exit:{x,y}, seed, kind:'city' }` — ровно 7 полей, БЕЗ
  type/rooms/wallObjs (город — НЕ тип подземелья). 000105
  переиспользует dungeonState: У ГОРОДА НЕТ DUNGEON_NAMES[type],
  rooms (для generateDungeonContents) и wallObjs — не читать эти
  поля у kind==='city'.
* **Валидация footprint**: целое ≥ 1, иначе throw (каталог может
  добавлять новые размеры — 4 значения 1/2/5/7 НЕ хардкодим;
  город fp13 → 26x26 работает).
* **Сейв**: src/save.js НЕ трогать — layout НИКОГДА не
  персистится (перегенерируется из позиции; прецедент dungeonMemory
  main.js — in-memory Map, не сейв). data.cities появится в 000109
  без повышения версии (000031).

## API (src/cities.js, чистый UMD по паттерну day.js/npc.js)

* node: `module.exports = factory(require('./perlin.js'))` —
  ЕДИНСТВЕННЫЙ require (взаимных require в момент загрузки нет;
  закреплено grep-тестом).
* браузер: `root.Game = Object.assign({}, root.Game,
  factory(root.Game))` — из Game читает hash2/mulberry32 (perlin.js
  кладёт их плоскими полями). Нет perlin.js → THROW с сообщением
  «cities.js: … perlin.js …» (паттерн гарда day.js; тихий fallback
  запрещён — UMD-ловушка 000018/000038).
* Экспорт → **Game.Cities** (неймспейс, как Game.Dungeon у
  dungeon.js; имя свободно — grep по src/ пуст). day.js/npc.js
  экспортируют плоское (Game.createClock) — cities.js ИМЕННО
  неймспейс: 000105/000106 обратятся к Game.Cities.
* API: CELL_WALL, CELL_FLOOR, CITY_LAYOUT_CONST,
  cityLayoutSize(footprint) → footprint*2,
  cityLayoutSeed(cityX, cityY) → hash2(…) >>> 0,
  createCityLayout(cityX, cityY, footprint). Экспорт — именованный
  объект (расширяемый: 000105 городские тайлы, 000106
  generateCityContents со СВОЕЙ CITY_CONTENT_CONST — она должна
  отличатся от CITY_LAYOUT_CONST и тоже попасть в memory).
* Загрузка: DOM не трогает, console.warn/error не пишет (контракт
  tests/main-visuals.test.js — полная цепочка index.html в vm).

## index.html

Слот: `<script src="src/cities.js"></script>` сразу ПОСЛЕ
src/dungeon.js (строка 363 master d096381) — и до dungeon-ui.js
(строка 383), и до main.js (строка 387). perlin.js (строка 341)
всё равно раньше. Пин порядка — tests/index-order.test.js.
После вставки cities.js автоматически попадёт в vm-цепочки
tests/sprites.test.js (префикс до sprites.js) и
tests/main-visuals.test.js (полная цепочка) — оба обязаны
остаться зелёными без правок (модуль чистый).

## Якоря golden (tests/cities.test.js, GOLDEN)

Реальные городские якоря из ре-пинов 000103
(tests/map.test.js GOLDEN_TILES): хутор 51 — (−119,−104) и
(−118,33); деревня 52 — (−114,−119). Для 5x5/7x7 — фикс.
произвольные: (100,−40), (101,−40) (пара «разные якоря → разные
layout»: у них различны И колонны входа (7/5), И колонны выхода
(7/3)), (−37,21).

## Для исполнителей 000105/000106/000110

* **000105 (экран/состояние)**: Game.Cities.createCityLayout —
  статичная функция (кэш по якорю — в main.js, паттерн
  dungeonMemory). Читай ТРОНЕ поля city-shape (см. выше);
  DUNGEON_NAMES/dungeonFloorFrame — ТОЛЬКО для подземелий
  (kind !== 'city'). Направление захода героя — твой state.
* **000106 (содержимое)**: generateCityContents(layout, …) —
  СВОЯ CITY_CONTENT_CONST (≠ 0x4c41594f), кладь постройки на
  FLOOR-клетки паттерном takeSpot (не на периметр/вход/выход).
  Хутор 2x2: FLOOR-клеток во внутренности НЕТ (мин_постройки=0).
  Сидить содержимое НЕ totalXp (город статичен).
* **000110 (спрайты)**: до появления спрайтов городов
  main-visuals.test.js держит исключения city-входов
  (findNearestMulti/expectedBuildings) — пометки 000103.

## Что НЕ трогаем

src/map.js (зона anchorAt — 000073), src/dungeon.js, main.js,
dungeon-ui.js, sprites.js, global-settings.js (НОВЫХ ключей
SETTINGS НЕТ — global-settings.test.js занят 000050; cities.js их
не требует), assets/dungeons (DUNGEON_TYPES/DUNGEON_SIZE/
dungeonShapeSeed/COMBAT_BG_DUNGEON — город НЕ тип подземелья;
инварианты 000049/000058), SPEC.md, save.js. Регрессия: полный
npm test (база 897 pass на d096381), tests/dungeon.test.js —
dungeon.js не тронут, tests/map.test.js — городской канал не
затронут.

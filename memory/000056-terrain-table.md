# 000056: единая таблица террейнов TERRAIN_DATA (src/map.js)

Статус: выполнено (отчёт — tasks/result/000056.md, задача — tasks/done/).
Дочерняя к 000053 (аудит дублирования данных); делалась ПОСЛЕ 000055 (общие
файлы map.js/buildings.js), мерж — после 000059 (пересечение в sprites.js,
порядок из memory/000053-data-duplication-audit.md: 000055 → 000059 → 000056).

## Что сделано

* `src/map.js` — ЕДИНАЯ таблица `TERRAIN_DATA` (экспорт):
  `{ [id]: { name, passable, dense, base, rgb } }` для всех 8 террейнов,
  рядом с enum TERRAIN. `TERRAIN_NAMES` и `PASSABLE` — ПРОВОДНЫЕ от неё
  (Object.fromEntries / Set по записи.passable), собственные литеральные
  имена удалены. Генерация мира (createMap/tileAt/terrainAt) не тронута —
  golden-пин 40 координат (tests/map.test.js) не сдвинулся.
* `src/buildings.js` — литералы `T`/`ALL_PASSABLE`/`DENSE` УДАЛЕНЫ
  (DENSE вообще не использовался логикой — мёртвая константа). Вместо них
  ленивое `terrainTable()`: node — `require('./map.js')` в момент ВЫЗОВА
  (циклический require map↔buildings: топ-уровневый require дал бы пустой
  модуль, пока map.js грузится), browser/vm — `root.Game` (map.js раньше
  по index.html: 294 < 298). Пустой вывод не кэшируется (паттерн 000055).
  Экспорт: `passableTiles()` / `denseTiles()` (имена записей по возрастанию
  id) вместо константы `ALL_PASSABLE` (единственный потребитель был
  tests/buildings.test.js — обновлён; браузерных потребителей не было).
  UMD-фабрика теперь `function (root)` (браузерная ветка передаёт root —
  паттерн map.js): factory определяется ВНЕ IIFE-обёртки, обёрточный
  `root` в её области видимости НЕТ — без аргумента `root is not defined`.
  GENERATED-блок и scripts/sync-buildings-data.js не тронуты (идемпотентность
  подтверждена тестом).
* `src/sprites.js` — `TILE_BASE` выводится из `deps.TERRAIN_DATA` (поле
  base): `const TERRAIN_DATA = deps.TERRAIN_DATA;` + цикл по ключам.
  Формат #rrggbb и экспорт не изменились. VISUALS/MOB_FRAMES не тронуты
  (000059/000062).
* `src/main.js` — `TILE_COLORS` выводится из `G.TERRAIN_DATA` (поле rgb),
  литеральный блок удалён. drawSprites не тронут (000042). main.js —
  browser-IIFE, в node не грузится: покрыт структурным тестом
  (tests/map.test.js «TILE_COLORS выводится из G.TERRAIN_DATA») +
  vm-прогоном всей цепочки index.html (tests/main-visuals.test.js).
* SPEC.md — раздел «Карта мира»: пункт про единую таблицу (два
  представления цвета, производные TERRAIN_NAMES/PASSABLE, потребители
  без копий, копии имён на стороне данных связаны тестами).

## Ключевые решения

* **Одна таблица, два представления цвета.** `base` (hex) и `rgb` (0..1)
  хранятся ВМЕСТЕ в записи; согласованы соотношением
  `rgb[i] = round(hex[i]/255·100)/100` — все 8 пар текущих значений
  этому удовлетворяют (проверено), закреплено тестом. rgb — ТОЧНЫЕ
  старые литералы main.js, НЕ пересчёт из hex (чистая конверсия
  сдвинула бы WebGL-цвета на ~0.0002 — «визуально мир не меняется»).
* **Формат — код в map.js, не JSON-каталог assets/terrains.** 8 записей —
  ядро генерации; JSON-каталог дал бы зеркало + sync-скрипт, т.е. перенёс
  бы дублирование, а не убрал. Копии имён на стороне ДАННЫХ (enum
  assets/buildings/schema.json, enum assets/visuals/schema.json, имена
  файлов assets/tiles/*.svg) связаны с таблицей тестами, данные не
  трогаются.
* **Ленивое разрешение в buildings.js** — циклический require в node
  (map.js уже требует buildings.js) разрешается в момент вызова: к тому
  моменту кэш require содержит полный map.js. Пустой вывод не
  кэшируется (паттерн 000055: buildingDerived).
* **API: `ALL_PASSABLE` (константа) → `passableTiles()`/`denseTiles()`
  (функции)** — функция переживает `Object.assign({}, Game, …)` между
  скриптами (ловушка UMD 000038) и лениво берёт таблицу.
* **vm: buildings.js без map.js** — грациозно `passableTiles() === []`
  (без собственных фолбэк-литералов — их отсутствие закрепляет grep-тест
  «вне GENERATED нет литералов имён»).

## Ловушки (зафиксированы)

* **Cross-realm в vm-тестах:** массив, созданный в vm-песочнице, НИКОГДА
  не пройдёт `assert.deepStrictEqual` против массива внешнего realm
  (разные Array.prototype) — проверено экспериментом. В red-стадии
  tests/buildings.test.js:481 было `assert.deepEqual(sandbox.Game.
  passableTiles(), [])` — невосполнимо при любой реализации; исправлено
  на JSON-нормализацию vm-стороны (установленный паттерн
  tests/map.test.js, следующая проверка того же теста та же).
* **UMD-фабрика buildings.js** не видит `root` обёртки (выражение
  функции — аргумент IIFE, определяется в наружной области видимости):
  браузерная ветка ОБЯЗАНА передавать root в фабрику (как map.js).
* **Grep-тест литералов** ограничен частью файла вне маркеров
  BEGIN/END GENERATED: в GENERATED-блоке имена террейнов — данные
  каталога (допустимые_тайлы из JSON), их удаление нельзя.
* **Порядок index.html** закреплён tests/index-order.test.js
  «map.js ДО buildings.js и ДО sprites.js» (класс бага 000018):
  потребители читают таблицу из Game, map.js обязан дать её первым.

## Регрессия

* npm test — 577 тестов зелёные (до задачи 560 + красные 000056),
  включая vm-песочницы (main-visuals — вся цепочка index.html со
  WebGL-стабом, combat-ui) и sync-идемпотентность buildings.js.
* Golden-пин tileAt (40 координат, node + vm) без изменений —
  генерация не сдвинулась.

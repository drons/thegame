# 000108: городские лавки — свои стоки по (город, клетка)

Дочерняя к 000052 (города и деревни), подзадача П2, в перепривязке
000052-анализа №000102 → 000108 (memory/task-numbering-conflicts.md).
Зависимость 000106 (содержимое города: где стоят лавки) — в master;
000060 (ассортимент: единый источник — каталог) — в master.
Реализация — src/cities.js `makeCityShop`, раздел «Лавки города
(задача 000108)» в tests/cities.test.js (golden-литералы вычислены
ЗАРАНЕЕ из существующего закреплённого makeShop, items.test.js 000060).

## Зафиксированные решения

* **Лавка = обёртка СУЩЕСТВУЮЩего items.makeShop** с офсетом
  координат города (SPEC.md, «Содержимое города», уже фиксирует
  дизайн): `makeCityShop(cityX, cityY, tx, ty, buildingId, wealth)`
  → `items.makeShop(cityX*256+tx, cityY*256+ty, map_index, wealth)`.
  seed/сток/ассортимент/универсам-w3 — семантика makeShop БЕЗ
  дублирования логики (items.js НЕ тронут; его 6 golden-снимков
  makeShop в items.test.js зелёные без правок). Формула seed
  зафиксирована тестом: `hash2(cityX*256+tx, cityY*256+ty, 0x154075)
  ^ (map_index+1) >>> 0` — т.е. «makeShop с офсетом координат
  города» буквально по SPEC.
* **CITY_SHOP_CELL_BASE = 256 (GOLDEN-ПИН литерала)** — инъективная
  кодировка (город, клетка) → координаты makeShop: x′ =
  cityX*256+tx, y′ = cityY*256+ty. 256 > максимального layout
  (2×footprint−1 ≤ 14; каталог fp ≤ 7). x1′=x2′ ⇔ cx1=cx2 и
  tx1=tx2 (при |tx1−tx2|<256) — исключает «все города делят один
  сток», ВКЛЮЧАЯ СОСЕДНИЕ якоря: наивная сумма cityX+tx дала бы
  коллизию (100,−40)+tx=1 и (101,−40)+tx=0 — оба x′=101 → общий
  сток (ловит тест «анти-прецедент инъективной кодировки»).
  Смена константы после мержа = смена ВСЕХ городских стоков —
  НЕДОПУСТИМА (паттерн CITY_CONTENT_CONST). Guard: tx/ty вне
  [0,256) → throw (защищает кодировку, а не layout).
* **Кросс-ссылка buildingId → запись каталога** (assets/buildings,
  buildings.js) → `особые_параметры.map_index` — это id КАТАЛОГА
  (1..54), НЕ map_index (типичная ошибка: 44 (Таверна) → 11, 1
  (Оружейная) → 0; shopKindsFor(44) — null). Нет записи в
  каталоге → throw (ошибка вызывающего, /cities\.js/); map_index
  нет (города 51..54) или «виды» нет (Арена 7 / Стрельбище 10 /
  Дом кузнеца 25) → **null** (не лавка). Реальный пул городов
  {1,7,10,25,44}: лавки дают 1 и 44.
* **Формат shop-объекта — РОВНО 6 полей makeShop/setShop-формата**:
  `{x: tx, y: ty, buildingType: map_index, wealth, stock, seed}`.
  x/y = ЛОКАЛЬНАЯ клетка города (ключ состояния 000109 «tx,ty»),
  а НЕ смещённые координаты makeShop. Никаких доп. полей —
  «влезает» в существующий playerUI.setShop (ui.js) и в
  buyItem/sellItem/buyPrice/sellPrice (читают shop.stock/
  buildingType/wealth) без изменений.
* **wealth — cities.js-конвенция: throw** (целое 0..3, как
  generateCityContents), а НЕ clamp makeShop'а. Расхождение
  конвенций зафиксировано: в проде вызывающий (000105) передаёт
  tileAt().buildingWealth — уже 0..3 (map.js).
* **Каждый вызов — НОВЫЕ объекты**: stock — новый plain-объект при
  каждом makeCityShop (мутация a.stock buyItem'ом не трогает
  b.stock) — прямой анти-прецедент npcStocks (main.js, ключ npcId,
  «все тайлы храма солнца делят один сток») на уровне ссылок.
* **UMD cities.js**: node — factory(require('./perlin.js'),
  require('./items.js'), require('./buildings.js')); браузер —
  factory(G0, null, null, root) с ЛЕНИВЫМИ референсами в момент
  вызова (rootRef.Game; паттерн buildingsCatalogRef items.js,
  000055/000060). Load-time-гарда на items.js/buildings.js НЕТ —
  цепочки vm-песочниц perlin→cities (000104/000106, dungeon-ui/
  sprites) обязаны грузиться без них; гард срабатывает на первом
  вызове makeCityShop: throw, сообщение называет И cities.js,
  И items.js (гард порядка: items.js ПЕРВЫМ). index.html:
  items.js (391) и buildings.js (392) и так раньше cities.js
  (402) — ленивость переживает любую перегрузку Game.
* **Ослабление пина 000104 (осознанное)**: grep-тест «структура
  исходника» теперь допускает require ТОЛЬКО ['./perlin.js',
  './items.js', './buildings.js'] (было «ЕДИНСТВЕННЫЙ
  ./perlin.js»). Обоснование: vm-цепочки без cities.js
  (dungeon-ui/sprites) проверены grep — cities.js в них не
  грузится; items.js/buildings.js в node чистые (циклический
  map↔buildings уже обработан ленивым require в buildings.js);
  items.js/buildings.js cities.js НЕ требуют (цикла нет);
  браузерная ветка при ЗАГРУЗКЕ ничего не требует (ленивость).

## Контракты для параллельных задач

* **000105 (городское состояние)**: данные — tileAt:
  buildingAnchor → cityX/cityY; buildingWealth → wealth (0..3);
  buildingId 51..54 → cityRecord (каталог). makeCityShop НЕ
  принимает layout/cityRecord — данные только из (город, клетка)
  и каталога по buildingId (ровно 6 параметров).
* **000109 (стейт/сейв, data.cities)**: ФОРМАТ СОСТОЯНИЯ ДЛЯ
  СЕЙВА: `{'cx,cy': {lastVisitDay, stock: {'tx,ty': {itemId:
  qty}}}}` — ключ стока «tx,ty» = ЛОКАЛЬНАЯ клетка (поле x/y
  shop-объекта); 000109 НЕ переименовывает формат. Сток НЕ
  мировой npcStocks (ключ npcId — прецедент).
* **000107 (вкладка «торговля»)**: получает shop-объект в
  setShop-формате (6 полей) — влезает в существующий
  playerUI.setShop. ВНИМАНИЕ: setShop-ключ ui.js
  ('x,y,buildingType,wealth') МОЖЕТ совпасть у лавок ДВУХ
  городов (одна клетка/тип/wealth): ранний return render-гарда
  безопасен в текущем потоке (между городами всегда
  setShop(null) из мирового тайла), но 000107 обязан это знать.

## НЕ трогаем (этой задачей)

* src/items.js (makeShop L740-756, shopKindsFor, buy/sell) —
  только читать; src/main.js (npcStocks L205-218 — регрессионный
  структурный тест в конце раздела 000108); src/npc.js,
  src/buildings.js, src/ui.js, src/map.js, SPEC.md, items.test.js
  (зелёные без правок).
* Реальное хранение стока в сейве и «первое посещение» — 000105/
  000109; экран/подключение shop — 000107.

## Отклонение от текста задачи

* «продажа — увеличивает сток» — НЕТ: существующая семантика
  sellItem (items.js) — скупленный товар исчезает, в сток НЕ
  возвращается. Тесты пиннят ФАКТИЧЕСКОЕ (рефакторинг-безопасное)
  поведение; расхождение зафиксировано для отчёта.

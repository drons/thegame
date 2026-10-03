# 000109: сейв и респаун состояния города — контракты и границы

Дочерняя к 000052 (города и деревни), P3, ПОСЛЕ 000072,
зависимость 000108 — ВСЁ в master (05c9214). Родительская: 000052.
Перепривязка 000103 → 000109 (memory/task-numbering-conflicts.md).
Сёстры: 000105 (экран/состояние), 000106 (содержимое),
000108 (лавки/стоки). Отчёт — tasks/result/000109.md.
Краткое дубль-заключение (формат/параметр/обрезка/дни) —
memory/000109-city-save.md.

## Что добавлено

* Раздел сейва `data.cities` (неломкое расширение v1: версию НЕ
  поднимаем — CURRENT_VERSION = 1, MIGRATIONS пустые; 000031/000029).
  Формат ЗАФИКСИРОВАН контрактом 000108 (memory/000108-city-shops.md)
  и НЕ переименовывается:
  ```
  data.cities = {
    'cx,cy': {                     // КЛЮЧ = ЯКОРЬ города (buildingAnchor)
      lastVisitDay: <int, день>,   // АБСОЛЮТНЫЕ дни (000031)
      stock: {
        'tx,ty': { <itemId>: <qty> },   // 'tx,ty' — ЛОКАЛЬНАЯ клетка
      },                                // (x/y shop-объекта, 000108)
    },
  }
  ```
  Ключ города — ЯКОРЬ (`t.buildingAnchor`), НЕ тайл входа:
  многотайловый город (fp 5 = до 49 входных тайлов) входишь с любой
  клетки footprint'а, якорь стабилен и — те же координаты, что у
  generateCityContents/makeCityShop (000104/000106/000108).
* Параметр `city_respawn_days` (src/global-settings.js): int,
  дефолт **3** («несколько игровых дней» — SPEC «Города и деревни»
  → «Состояние, сейв, респаун»; симметрия respawn_days=3 /
  dungeon_memory_days=3), запись в META `{ label: 'Респаун города
  (дн.)', type: 'int', min: 1 }` (обязательна — существующий тест
  S1 «META 1:1 с SETTINGS»), ре-пин списка ключей
  tests/global-settings.test.js:36 (15 → 16, единственный
  технический твик существующего теста; прецедент ре-пинов
  000050/000079/000082/000103 — пометка в тесте).
* Состояние в main.js: `const cityStates = new Map()`
  (паттерн defeatedAt/000072: объявление, serialize в
  collectSaveData, try/catch-восстановление в restoreFromSave) —
  `'cx,cy' → { lastVisitDay, stock }`, где stock — LIVE-объекты
  (тот же объект, что у shop-объекта сессии; мутации 000107
  попадают в сейв).
* Чистые функции валидации/сериализации — **src/cities.js** (не
  day.js — см. «Где валидация» ниже), новые плоские экспорты
  `Game.Cities.*`:
  * `validateCityStock(stock) → { 'tx,ty': {itemId: qty} }` —
    чистая, НОВАЯ копия; не-объект/массив → {}; ключ 'tx,ty' —
    целые координаты (ре `/^-?\d+,-?\d+$/`); qty — целое ≥ 0
    (0 легитимно: buyItem доводит сток до 0, items.js:785);
    мусорные записи — отброс (000029); вход не мутируется.
  * `serializeCityStates(cityStates, day, respawnDays) → object` —
    вход: Map (живое состояние) или plain-объект; выход: JSON-
    объект раздела (копии); **ОБРЕЗКА при сейве**: истёкшие
    (`day − lastVisitDay >= respawnDays`) и «будущие»
    (`lastVisitDay > day` — подделка) отбрасываются; невалидные
    записи — отброс; мир БЕСКОНЕЧЕН — без обрезки раздел раздует
    localStorage до квоты (save() → false).
  * `restoreCityStates(saved, day, respawnDays) → Map` — как
    restoreDayMap/restoreTeleports/restoreBuildingQuests,
    возвращает Map; не-объект/массив → пустой Map (тихо, 000029);
    те же правила валидации и ОБРЕЗКА при восстановлении
    (fastForward без слушателей — onDay-очистка не пройдёт,
    000031: restore сам отбрасывает «будущее» и «истёкшее»).
  * `day`/`respawnDays` — ПАРАМЕТРАМИ (конвенция 000072:
    restoreBuffs(saved, day)), дефолтов НЕТ (не дрейфуют от
    настроек); main.js всегда передаёт clock.day / cityRespawnDays().

## Контракты и границы

* **Респаун при входе** (TZ p.3; формула — dueForRespawn
  day.js:96): `clock.day − lastVisitDay >= city_respawn_days` →
  ПЕРЕГЕНЕРАЦИЯ стока; иначе — ВОССТАНОВЛЕНИЕ из сейва;
  `lastVisitDay = clock.day` при входе. Перегенерация = НОВЫЙ
  ПОЛНЫЙ сток (ресток) БЕЗ соли по дню: makeCityShop/
  generateCityContents детерминированы по (якорь, клетка) —
  golden-пины 000106/000108 (CITY_CONTENT_CONST /
  CITY_SHOP_CELL_BASE); соль ломала бы ВСЕ городские стоки.
* **Вход (main.js, enterLocation → prepareCityState)**: контент
  (buildings) ВСЕГДА перегенерируется (детерминирован — один
  результат), сток — ветка fresh/реген: для каждой лавочной
  клетки `saved && fresh && saved.stock['tx,ty']` →
  `shop.stock = saved.stock` (LIVE-ссылка), иначе — fresh-сток
  makeCityShop. Сохранённый сток АВТОРИТЕТЕН (кламп по
  начальному стоку НЕ делаем — в отличие от restoreNpcStocks:
  TZ «проверка структуры»; чужой валидный сток переживает
  roundtrip — тест-фиксатор R6). Клетки в сейве без здания —
  отброс (итерация по перегенерированным buildings); здание без
  клетки в сейве (fresh или подделка) — fresh-сток.
  Хутор (fp1) — buildings: [] → stock {} (000102/000104).
* **saveNow() без явного вызова при входе**: frame() (main.js)
  вызывает saveNow() ПРЯМО ПОСЛЕ enterLocation() — сейв входного
  шага уже содержит состояние города (тестам не надо выходить);
  плюс saveNow на выходе (exitLocation) и на смене дня (onDay).
* **false-возврат save() (квота localStorage, save.js:177-184)** —
  в saveNow: `console.warn` ОДИН раз за сессию (флаг `saveWarned`
  — saveNow на каждом мировом шаге, спам нельзя); падений/
  confirm НЕТ (confirm — только migration_failed/corrupt при
  загрузке); паттерн «тихий» catch save.js.
* **restoreFromSave — паттерн 000072/teleports/buildingQuests**:
  СВОЙ try/catch; ЯВНАЯ проверка формы ДО restore
  (не-объект/массив → console.warn «Сейв: раздел cities
  некорректен — сбрасываю.» + clear); restoreCityStates сама
  отбрасывает мусор/будущее/истёкшее; валидных 0 при непустом
  разделе → console.warn; catch → console.warn. (restore-функции
  НЕ бросают на мусоре — try/catch сам по себе warn не даёт,
  прецедент 000072.)
* **collectSaveData**: `cities: G.Cities.serializeCityStates ?
  …(cityStates, clock.day, cityRespawnDays()) : {}` — пишется
  ВСЕГДА (пустой — `{}`), версия НЕ поднимается.
* **`__game.cities` getter** (main.js, рядом с `get npcStocks()`):
  поверхностная копия записей — значения LIVE-объекты. Контракт
  для параллельного 000107 (вкладка «торговля»: buildingUI →
  npcUI собирает shop-объект makeCityShop и splice'ит сессионный
  сток ИЗ `__game.cities[anchorKey].stock` — мутация попадает в
  cityStates → в сейв). Без него у 000107 нет доступа к
  состоянию (порядок мержей 05c9214).

## Где валидация (и почему не day.js)

ТЗ: «валидация через serializeDayMap/restoreDayMap (000072) +
проверка структуры stock (чистые функции — в src/day.js или
src/cities.js, решать в задаче)». Решение: **stock-валидация и
составные serialize/restoreCityStates — в src/cities.js**.

* day.js-требования cities.js НЕВОЗМОЖНЫ: require-пин
  tests/cities.test.js:180 — ровно `['./perlin.js',
  './items.js', './buildings.js']` (+ vm-цепочки perlin→cities
  без day.js обязаны грузиться).
* Прецедент 000072: section-валидаторы живут в ДОМЕННЫХ
  модулях (npc.js — serializeNpcStocks/restoreNpcStocks;
  building-effects.js — serializeTeleports/restoreTeleports,
  serializeBuildingQuests/restoreBuildingQuests); day.js —
  только общий dayMap-слой. cities.js — домен города; cities.
  test.js — назначенный ТЗ тест-файл.
* Слой 000072 использован на границе композиции (SPEC: «свой
  слой НЕ изобретается»): проводка main.js — тот же паттерн, что
  для buildingOncePerDay/buffs/teleports/buildingQuests;
  семантика ДНЕЙ идентична 000072-слою (ключ 'x,y' — те же
  целые координаты, день — целое ≥ 1, «будущее» и «истёкшее»
  отбрасываются, формула респауна — dueForRespawn
  `day − last >= respawnDays`); АБСОЛЮТНЫЕ дни — 000031.

## Ленивые ссылки и guards

* cities.js — НОВЫХ require НЕТ (только локальные regex'ы —
  функции чистые, items/buildings не нужны); браузерная ветка —
  как есть (ленивые itemsRef/buildingsRef в момент вызова
  makeCityShop; load-time гард — только perlin).
* main.js: `cityRespawnDays()` — ЖИВОЕ чтение
  `G.GlobalSettings.SETTINGS.city_respawn_days` в момент ВЫЗОВА
  (000099 live-паттерн: снапшот при загрузке УБРАН — настройка из
  вкладки действует без перезагрузки); guard: global-settings.js
  не загрузился / значение некорректно — 3 (недостижимо в браузере
  — index-order). Все `G.Cities.*`/`G.getBuilding` —
  гарды в момент вызова (prepareCityState: нет API →
  console.error + деградация, город остаётся пустым как до
  000109, игра не падает — паттерн 000053/000071).

## Подводные камни

* **ds.contents у города — null. ВСЕГДА.** ЛОВУШКА-КРАШ
  (обойдён архитектурой): `__game.dungeon` (main.js:1573-1578) и
  dungeon-ui.js:318 (`s.contents || {chests:[],mobs:[]}`) читают
  `.mobs`/`.chests` — truthy contents без этих полей = TypeError
  на каждом кадре города; пины city-screen `dg.mobs===null /
  dg.chests===null` сломались бы. Строка 000105-memory
  «после 000106 — заполняется» — ПЕРЕОБЫЗАНА этим решением
  (dungeon-ui.js не в файловой части ТЗ). Состояние — в
  cityStates Map; buildings для рендера/взаимодействия
  перегенерируются детерминированно (000107/000110).
* **АБСОЛЮТНЫЕ дни (000031)**: fastForward НЕ оповещает
  слушателей → onDay-очистка НЕ пройдёт при restore. Забыть
  обрезку в restore = просроченные города вернутся после
  перезагрузки (регрессия). Забыть обрезку в serialize = раздел
  растёт бесконечно → квота → save() false. ОБЕ ОБЯЗАТЕЛЬНЫ.
* **Ключ = якорь, не worldKey**: ds.worldKey — тайл входа
  (нестабилен); `map.tileAt(ax, ay)` не нужен — якорь берётся из
  `t.buildingAnchor` входного тайла (тот же, что в maybeEnterCity).
* **Стоки НЕ в npcStocks** (ловушка-прецедент 000029: мировой
  npcStocks ключируется по npcId — «все тайлы храма солнца делят
  один сток»); городские стоки — только (якорь, клетка) в
  data.cities. items.js/npc.js НЕ трогаем.
* **lastVisitDay обновляется при входе**, даже если сток
  восстановлен (визит = визит); повторный вход в тот же день —
  fresh (diff 0 < 3) → тот же сток, регенерации нет.
* **Параллельный 000085** (companions/efir/dead_mercs) правит те
  же регионы main.js (collectSaveData/restoreFromSave/saveNow) —
  hunk'и 000109 минимальны и локализованы; при ребейзе — union;
  после мержа 000085 — полный npm test.
* **VM-тесты**: vm-цепочки index.html автоподхватывают новые
  экспорты (script-тег НЕ добавляется); стабы WebGL/DOM не
  меняются; полный npm test после ребейза ОБЯЗАТЕЛЕН (параллельные
  workflow правят другие регионы main.js).

## Что важно будущим задачам

* **000107** (вкладка «торговля», [E] в городе): получает
  shop-объект (6 полей, 000108) + СЕССИОННЫЙ сток — из
  `__game.cities[anchorKey].stock[cellKey]` (LIVE; splice, не
  копия — мутация buyItem/sellItem попадает в cityStates → в
  сейв). setShop-ключ ui.js ('x,y,buildingType,wealth') может
  совпасть у лавок ДВУХ городов — между городами всегда
  setShop(null) из мирового тайла (000108). buildings города —
  перегенерировать детерминированно (generateCityContents).
* **000110** (визуал): buildings — generateCityContents;
  сток-состояние на спрайты не влияет (но «пустая лавка» — по
  stock).
* **000052 (родитель)**: имена разделов НЕ менять (зафиксировано:
  `cities`, memory/000052-cities-plan.md:110); SPEC «Города и
  деревни» — не трогаем (подраздел уже добавлен родителем).
* Формат стока/якоря — НЕ переименовывать (контракт 000108);
  golden-константы cities.js НЕ трогать.

## НЕ трогаем

src/locations.js (домен 000127; правит 000107 — проводка в
main.js), src/save.js (механизм без изменений), src/items.js,
src/npc.js, src/dungeon-ui.js, src/buildings.js, SPEC.md,
index.html (script-тег не нужен —cities.js уже в цепочке до
main.js), day.js (общий слой без изменений — новые функции в
cities.js).

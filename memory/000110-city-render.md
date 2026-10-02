# 000110: контракт спрайтов городов (глобальная карта) — для следующих городских задач

Статус: контракт (000110 — глобальная карта: footprint w×h + HUD-имя).
Полная архитектура — memory/000110-city-map-sprites.md. Адресаты:
000105-фоллов업 (внутренний экран), 000107 (взаимодействие в городе)
и любые будущие задачи городовой графики/UI.

## Канал разделения (главное правило)

* **Город НЕ слот** (000103): type тайлов = BUILDING_TYPES.NONE,
  запись размещения — по buildingId (id каталога 51..54). Поэтому:
  * свой каталог ассетов `assets/sprites/cities/` — НЕ
    `assets/sprites/buildings/` (тот — 13 слотовых иконок);
  * своя таблица `CITY_SPRITES` в src/sprites.js (ключи — id
    каталога, ЧИСЛОВЫЕ 51..54) — НЕ расширение BUILDING_SPRITES
    (ключи — BUILDING_TYPES);
  * свой селектор `Game.citySprite(buildingId)` (Number.isInteger →
    путь или null) — параллельно `Game.buildingSprite(buildingType)`;
  * **`buildingSprite(BUILDING_TYPES.NONE) === null` — ЗАПИНЕНО
    тестами (tests/sprites.test.js) и НЕ «чинится»**: городские
    спрайты идут только через citySprite.
* Спрайты городов подхватываются vm-песочницами автоматически: пути в
  `allAssetPaths()` → очередь spriteLoader в main.js; index.html не
  меняется (таблица — литерал в sprites.js, без require buildings.js —
  UMD-чистота 000038/000053).

## Каталог и геометрия (source of truth: assets/buildings/00005{1..4}.json)

| id | тип | footprint | вход (каталог) | файл | viewBox |
|---|---|---|---|---|---|
| 51 | Хутор | 1×1 | (0,0) | assets/sprites/cities/city_51.svg | 0 0 64 64 |
| 52 | Деревня | 2×2 | (1,1) | assets/sprites/cities/city_52.svg | 0 0 128 128 |
| 53 | Город | 5×5 | (2,4) | assets/sprites/cities/city_53.svg | 0 0 320 320 |
| 54 | Столица | 7×7 | (3,6) | assets/sprites/cities/city_54.svg | 0 0 448 448 |

* **viewBox = 64w × 64w** (w — ширина каталога; все 4 типа квадратные):
  64 art-px на тайл, 1:1 при растяжке drawImage до w·zoom × h·zoom.
* **Композиция**: периметральная стена по КРАЯМ viewBox (вариант
  «стена footprint'а» — не отдельный ассет, а часть силуэта типа;
  отдельного тайла/файла стены НЕТ — footprint рисуется одним
  прямоугольником, механизм 000042). Ворота — тёмный проём на нижней
  кромке в позиции каталожного входа: `x_art = (вход[0]+0.5)·64`:
  51 → (32,32) (вся плитка — башня-воротца), 52 → x=96, 53 → x=160,
  54 → x=224 (входы всех типов — на последней строке каталога).
  Внутренности различают типы: хутор — 1 хижина; деревня — 2-3 дома;
  город — ряд домов + шпиль; столица — донжон + 2 башни + ряды домов;
  угловые башни у 53/54.
* **Палитра** (семья 13 спрайтов построек, эталон rune_stone.svg):
  камень #8a8494/#7a7484/#6a6472, roofs #96793f-тоны, мох #4f7a3a,
  портал ворот #3a3542. Прозрачный фон, статика, без SMIL/внешних
  ссылок — требования svg.test.js (000120).
* Новые городские типы (id > 54) в будущем: + запись CITY_SPRITES +
  SVG в каталог + пин EXPECTED_SVG_BY_DIR ('sprites/cities': N);
  citySprite(неизвестный) → null — деградация без падения.

## Точки интеграции

* **Рендер** — main.js drawSprites, проход 2 (000042): якоря видимых
  тайлов → `buildingRec` (map.buildingAt, ОДИН источник геометрии) →
  `asset = G.buildingSprite(rec.type) || (rec.buildingId != null &&
  typeof G.citySprite === 'function' ? G.citySprite(rec.buildingId)
  : null)` → один `drawImage(asset, worldToScreen(rec.x, rec.y),
  rec.w·zoom, rec.h·zoom)`. typeof-гард — деградация под старый
  sprites.js (город не рисуется, игра не падает).
* **HUD** — имя города + «(вход — шагните)»: `Game.hud.buildingNameHint`
  (src/hud.js, 000129) через t.buildingId → getBuilding →
  название_карты; строка — только на hasBuilding-тайле (у города —
  вход). buildingNameUi (map.js) — слотовые 13 map_index, городами НЕ
  расширяется.
* **Вход в город** — шаг на входной тайл → maybeEnterCity (locations.js,
  000105) → dungeonState kind 'city'; глобальный рендер не
  затрагивается. Walk-тесты: городские входы — препятствия BFS
  (экрaн блокирует world-движение).
* **Регрессии**: buildingDraws-фильтр `assets/sprites/buildings/` —
  слотовый; GOLDEN_TILES / CITY_SEED_CONST / city-секция map.test.js —
  генерация не меняется.

## Внутренний экран города — НЕ этот каталог (важно для 000105-фолловэпа)

* Внутренний экран (dungeon-ui.js) рисует клетки города ЦВЕТОВЫМИ
  палитрами `CITY_FLOOR_VARIANTS` / `CITY_WALL_VARIANTS` (L92-93) с
  CITY_TILE_SEED-вариантами — 000110 их НЕ менял (ТЗ исключает
  внутренний экран). Если будущая задача заменит их на SVG — это
  ОТДЕЛЬНАЯ задача со своим каталогом (масштаб подземелья ≠ глобальной
  карты: клетка dungeon-ui ≈ 1 тайл, свои варианты по CITY_TILE_SEED):
  не смешивать с assets/sprites/cities/ (там — фронтальный силуэт
  города на w тайлов для глобального view, viewBox 64w×64w).
* Устаревшее ожидание: строка в memory/000105-city-screen.md «000110
  подменит CITY_*_VARIANTS на SVG-пути» снята ТЗ 000110 — не
  ориентироваться.

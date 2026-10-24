# 000258 — Автотайлинг кромки стены (вариант A). Контракты и решения

Задача: плавный переход между тайлами — границу «пол–стена» в городах и
подземельях рисуют краевые спрайты стены (автотайлинг, вариант A: границу
рисует стена). Пол НЕ меняется. ТЗ: tasks/pending/000258.md.
Анализы: a1-домен, a2-архитектура, a3-тесты (сверены; расхождения сняты
на станции Проектирование).

## 1. Что добавлено / перенесено / убрано

Добавлено:
* `src/dungeon.js`: чистые функции `wallMask`, `wallTileIndex`,
  `wallKindFor` (в существующий модуль — НОВОГО МОДУЛЯ НЕТ, script-тега
  в index.html НЕТ, пины index-order НЕ нужны, CSS НЕ нужен).
* `src/sprites.js`: таблица `WALL_AUTOTILES` (литерал, без require
  dungeon.js — паттерн DUNGEON_FLOOR_FRAMES/COMBAT_BG_DUNGEON) +
  `WALL_AUTOTILE_NAMES` (порядок 20 имён); allAssetPaths +80 путей.
* `scripts/gen-wall-autotiles.js` — детерминированный генератор 80 SVG
  (образец gen-dungeon-walls.js: mulberry32, сид на (стиль, idx),
  округление 0.1 px, без дат → byte-identical реран); `npm run
  gen:wallautotiles`. Экспорт `{ TILES, buildTile }` для теста
  детерминизма.
* Ассеты: `assets/city/walls/city_{m00..m15,cSE,cSW,cNE,cNW}.svg` (20,
  НОВЫЙ каталог) + `assets/dungeon/walls/{rock,column,stalactite}_{m00..m15,
  cSE,cSW,cNE,cNW}.svg` (60) — 64×64, viewBox «0 0 64 64», xmlns,
  прозрачный фон, ОБЯЗАТЕЛЬНО прошли tests/svg.test.js ДО фиксации.
* Красные тесты: `tests/wall-autotile.test.js` (AT-1..AT-7) +
  `tests/spec-000258-wording.test.js` (W1..W3) — 10 red.

Убрано (осознанная полная замена фасада 000070):
* `d.wallObjs` (предвычисленный фасад 8-соседства Чебышёва,
  dungeon.js createDungeon) — НЕ персистится сейвами (serializeDungeon-
  Memory хранит только contents/lastVisitDay/pos) — сейвы не ломаются.
* `wallObjFor` (экспорт −), `WALL_VARIANT_SALT` (0x0c9f4b2d — убит вместе
  с вариантом _1/_2; `WALL_KIND_SALT = 0x5e11c3a7` СОХРАНЁН дословно).
* Слой wallObjs в render (dungeon-ui.js, отдельный проход после
  floor-pass) — рендер стены переезжает В floor-pass.
* `DUNGEON_WALL_FRAMES` (6 ключей) из sprites.js + экспорт; npm-скрипт
  `gen:dungeonwalls` + `scripts/gen-dungeon-walls.js` + 6 старых SVG
  `assets/dungeon/walls/{rock,column,stalactite}_{1,2}.svg` (мёртвые
  ассеты; источник правды — код).

## 2. Маска (контракт)

```
wallMask(cells, W, H, x, y) -> 0..15
  биты: N=1 (y−1), E=2 (x+1), S=4 (y+1), W=8 (x−1)
  бит = 1 ТОЛЬКО если сосед в границах И cells[ny*W+nx] === CELL_FLOOR
  за границей карты = стена (бит не ставится)
  сама клетка НЕ проверяется (вызователь гарантирует === CELL_WALL)

wallTileIndex(cells, W, H, x, y) -> 0..19
  m = wallMask; m !== 0 -> m
  m === 0 и ровно ОДИН диагональный FLOOR-сосед -> 16 + k,
    k: SE(x+1,y+1)=0, SW(x-1,y+1)=1, NE(x+1,y-1)=2, NW(x-1,y-1)=3
  иначе (m === 0 и 0 или ≥2 диагонали) -> 0

wallKindFor(x, y, d) -> 'rock'|'column'|'stalactite'|null
  = kind-часть бывшего wallObjFor ДОСЛОВНО:
  DUNGEON_WALL_KINDS[d.type][hash2(x, y, WALL_KIND_SALT ^ d.seed)
  % kinds.length]; null — если у типа нет набора
```

ИНВЕРСИЯ (ключевая): в плане пользователя «0=пол, 1=стена»; в КОДЕ
`CELL_WALL = 0, CELL_FLOOR = 1` (dungeon.js:62-63 ≡ cities.js:49-50,
равенство пинано). Бит маски «сосед — пол» = `=== CELL_FLOOR` (== 1).
Соседство маски — 4 (план) + 4 диагональных угла. Полный 47-плиточный
автотайл ОТКЛОНЁН (объём ×2.5, 188 файлов) — +4 угловых спрайта, вариант
прямо предложенный планом.

АРТЕФАКТ «ВЫРЕЗ» (осознан, Q3): wall-клетка с mask 0 и ≥2 диагональными
полами (внутренний угол L-коридора) — рисуется БЕЗ кромки (в городе —
m00-плитка, в подземелье — фон #0a0d12). Старый фасад 8-соседства рисовал
там объект — осознанный ре-пин теста :584-611 tests/dungeon.test.js.

## 3. Плитки и стили (контракт)

* 20 плиток на стиль: idx 0..15 = mask, idx 16..19 = углы
  (порядок имён = cSE, cSW, cNE, cNW — закреплён тестом).
* `WALL_AUTOTILE_NAMES = ['m00','m01',…,'m15','cSE','cSW','cNE','cNW']`.
* `WALL_AUTOTILES = { city:[20], rock:[20], column:[20], stalactite:[20] }`
  — массивы путей: city → `assets/city/walls/city_<имя>.svg`; виды →
  `assets/dungeon/walls/<kind>_<имя>.svg`. idx 0..19 ↔ NAMES[idx]
  (опечатка-ловля тестом «4 стиля × 20, имя = паттерн, файл существует»).
* 4 стиля: город (1) + 3 вида из каталога `объекты_стен`
  (rock/column/stalactite — ровно 3 различных по 5 типам, матрица
  тип→виды 000070 СОХРАНЕНА 1:1). Варианты «16+16 универсальное» и
  «5×16+16 по типам» отклонены: теряется per-type флейвор / двойной
  объём арта без нового флейвора (ruins — column только, drowned — rock
  только).
* Вид на клетке — `wallKindFor` (kind-формула как у фасада — «один вход —
  один вид» не ломается); variant _1/_2 ЗАМЕНЁН mask-индексом.
* m00 (idx 0) генерируется для полноты всех 4 стилей: в ГОРОДЕ
  РИСУЕТСЯ (сплошная стена — периметр остаётся сплошным, как было
  fillRect); в ПОДЗЕМЕЛЬЕ не рисуется (idx 0 → фон, Q4).
* Генератор: базовый градиент вида идентичен во ВСЕХ 20 плитках вида
  (бесшовность 000069: детали — только в центральной области, внешние
  ~8 px — чистая база); кромка (светлый свес/bevel + тонкая тёмная
  линия шва) рисуется ВГЛУБЬ к краю по битам маски; углы — диагональная
  кромка угла. Палитры: city #77685a→#66594c (близко к фолбэк-
  CITY_WALL_VARIANTS), rock #7d7468→#4e463d, column #7a7164→#4c453b,
  stalactite #7d7468→#4e463d (из старых wall-SVG); фасетки/крапинки —
  #948a7b / #332c25 (как в старых стенах).
* Пер-cell kind-швы: соседние wall-клетки разных видов — цветовая
  ступенька на общем крае. УЖЕ существовало у фасадов (объекты разных
  видов рядом); не новшество.

## 4. Рендер (контракт, src/dungeon-ui.js floor-pass)

ОДИН обход клеток (cyclic `for y/x`, зона 000215 snappedTileRect):
* fog-гейт 000136 `if (!isCity && mask[y*W+x] === 0) continue;` — ТЕПЕРЬ
  первый (применяется и к полу, и к стенам подземелья; город — без
  тумана, mask === null).
* ГОРОД: floor-клетка — fillRect CITY_FLOOR_VARIANTS (НЕ МЕНЯЕТСЯ);
  wall-клетка — ВСЕГДА рисуется: `idx = wallTileIndex(…)` →
  drawImage(`WALL_AUTOTILES.city[idx]`) при `live.WALL_AUTOTILES &&
  table.city && loader && isReady && image`; иначе — СТАРЫЙ fillRect
  `CITY_WALL_VARIANTS[cityTileVariant(2, x, y, d.seed)]` (байт-в-байт:
  CITY_WALL_VARIANTS + cityTileVariant + CITY_TILE_SEED ОСТАЮТСЯ).
* ПОДЗЕМЕЛЬЕ: wall-клетка — `idx = wallTileIndex(…)`; `idx !== 0` →
  `kind = wallKindFor(x, y, d)` → drawImage(`WALL_AUTOTILES[kind][idx]`)
  при table/loader/isReady/image; иначе — ничего (фон #0a0d12, как было
  для внутренних стен). idx 0 — никогда.
* Z-порядок СОХРАНЁН: стена в floor-pass — ПОД постройками/дверью/
  лестницей/сундуками/залежами/мобами/игроком (клетки не пересекаются
  1×1: оверлеи — только на FLOOR); FOG_DIM_FILL остаётся ПОСЛЕ всех
  слоёв → затемняет и автотайл-стены.
* Фолбэки ТИХИЕ (без console.error — паттерн live-гардов render): город
  → fillRect; подземелье → стена не рисуется. Благодаря этому городские
  тесты в песочницах БЕЗ sprites.js/лоадера (dungeon-ui 2051/2094/
  2133/2163/2206-2240, TS-11, city-screen 1095-1108) остаются ЗЕЛЁНЫМИ
  БЕЗ ПРАВКИ (байт-в-байт fallback-ветка + пины пола).
* ЛУЧШЕЕ ПОБОЧНОЕ: wall-drawImage идёт через тот же `cr` =
  snappedTileRect, что и пол (000215 — без AA-шва на дробном зуме).

## 5. Ленивые ссылки и guards (UMD)

* `wallMask/wallTileIndex/wallKindFor` — закрывают на CELL_FLOOR/
  DUNGEON_WALL_KINDS/hash2 из ЗАКРЫТИЯ dungeon.js (тестируемы в node
  require'ом; hash2 — из perlin.js в цепочке, в node-тесте dungeon.js
  уже работает с fallback — как у wallObjFor).
* dungeon-ui.js читает `live.WALL_AUTOTILES`, `live.wallTileIndex`,
  `live.wallKindFor` из liveGame() В МОМЕНТ ВЫЗОВА (не из снапшота —
  UMD-ловушка 000038, паттерн live.DUNGEON_WALL_FRAMES до фикса).
  sprites.js — ЛИТЕРАЛ-таблица БЕЗ require dungeon.js (vm-песочница).
* Отсутствие зависимости — тихая деградация (нет table/loader/kind/
  image → fallback/ничего), игра не падает.
* 0 новых rng-вызовов в createDungeon (старый цикл wallObjs — только
  hash2) → бит-в-бит cells/rooms/entrance/exit/seed/stairsDown/
  generateDungeonContents.

## 6. SPEC (зелёная стадия, wording-пины W1..W3)

* W1 — spec/buildings.md «Вход и внутреннее пространство»: строка
  «стены города (периметр) рисуются автотайлом по маске соседей (000258)
  …»; пол остаётся плоским; фолбэк fillRect (hash2+соль).
* W2 — spec/world-map.md буллет подземелий: «кромка стены подземелья —
  автотайл по маске 4 соседей (000258) …»; внутренние стены без
  floor-соседа — фон; fog-гейт 000136 на стены.
* W3 — spec/dungeons-storage.md: переписать буллет «предметы_стен»
  (wallObjFor/_1/_2/8-соседство/d.wallObjs → wallKindFor/wallTileIndex/
  4-маска; без floor-соседа — не рисуется) + буллет экспортов
  («…+wallObjFor» → «…000258: +wallMask/+wallTileIndex/+wallKindFor,
  −wallObjFor»). Дословных «wallObjFor»/«d.wallObjs» в spec ПОСЛЕ
  правки НЕТ (пин-отсутствие).
* RE-PIN ОБЯЗАТЕЛЕН: tests/spec-split.test.js SPEC_FILE_LINES — точные
  строки 3 файлов (buildings.md 522, world-map.md 76, dungeons-storage.
  md 175 → пересчёт по протоколу memory/000159-spec-split.md §5.1 В ТОМ
  ЖЕ коммите). Число файлов spec (R1 = 23) НЕ меняется.

## 7. Список ре-пинов (зелёная стадия, в том же коммите)

Осознанные (ТЗ-авторизованные):
1. tests/dungeon.test.js блок 000070 (~429-760): edgeWallSet (8-
   соседство) → новое множество {mask≠0} ∪ {mask 0 + ровно 1 диагональ};
   биекция — по wallTileIndex/wallKindFor на клетках; тест :584-611
   «диагональ → объект» ПЕРЕВОРАЧИВАЕТСЯ (диагональ → угловой тайл
   16+k; ≥2 диагонали → idx 0, «вырез»); детерминизм/«один вход — один
   вид»/матрица видов — сохраняются (по cells/rooms/kind/idx); golden
   CAVE (37,−12) seed 2658571374 — ПЕРЕСЧЁТ снапшота (kind прежний,
   _1/_2 → idx; снимается с рабочего кода на стадии реализации);
   wallObjFor-тесты → wallKindFor.
2. tests/dungeon.test.js :1204/:1673/:1726 — `wallObjs.length` 75/156 →
   пересчёт числа рисуемых wall-клеток нового множества.
3. tests/dungeon-ui.test.js ~1060-1116: wallObjs-фасад → масочный
   клеточный путь (слой ПОД мобами/игроком сохраняется); шапка файла
   (:34-35, :362).
4. tests/sprites.test.js ~1892-1985 (000070): DUNGEON_WALL_FRAMES(6) →
   WALL_AUTOTILES (4×20, имена/пути ≡ каталог objects_стен × 20, файлы,
   allAssetPaths +80, детерминизм gen-wall-autotiles, «базовый градиент
   вида идентичен в 20 плитках»).
5. tests/svg.test.js: EXPECTED_SVG_BY_DIR — 'dungeon/walls' 6→60,
   + 'city/walls': 20 (строка + комментарий-шапка файла :11).

Технические (без смены смысла):
6. tests/dungeon-vision.test.js:237 — `if (opts.wallObjs) …` убрать
   (поле не существует) + комменты :875.
7. tests/tile-seam.test.js:28 — коммент-шапка (ассерты TS-11 БЕЗ ПРАВК —
   fallback, цепочка без sprites.js).
8. tests/dungeon-ui.test.js makeState — +additive `opts.seed`
   (dg.seed для wallKindFor; паттерн 000153.03 additive-opts).

НЕ ре-пины (подтверждено доменом): dungeon-ui 2051/2094/2133/2163/
2206-2240 (fallback байт-в-байт), city-screen 1095-1108 (пины пола),
cities 7-поле layout, index-order (тега нет), harness-цепочки (модуля
нет).

## 8. НОЛЬ-список (инварианты ТЗ)

Пол (15 SVG + dungeonFloorFrame + CITY_FLOOR_VARIANTS), глейд (motion.js,
move_interval_ms 420), коллизии (проходимость по cells), RNG
генерации/layout города/этажей, fog-логика (maskFor/FOG_DIM_FILL),
маркеры двери/выхода/лестницы, сейвы, мировая карта, двери/постройки/
сундуки (оверлей на FLOOR — маска считается по cells БЕЗ учёта оверлея).
Не смешивать с 000247 (уже в мастере), 000259 (размеры городов —
cities.js), 000263 (чанковый рендер — floor-pass dungeon-ui.js!),
000264 (здания 3×3 — floor-pass/город!).

## 9. Что важно будущим задачам

* КОНФЛИКТНАЯ ЗОНА REBASE: floor-pass src/dungeon-ui.js (цикл клеток
  ~:531-560, до фикса — city fillRect + dungeon floor) — пересекается с
  000263 (чанковый рендер 16×16) и 000264 (3×3 здания одним спрайтом).
  Rebase на свежий мастер: сначала посмотреть эти два файла.
  src/sprites.js — тоже (все +80 путей в allAssetPaths).
* TS-6..12 (tile-seam) фильтруют только fillRect: шов wall-drawImage при
  дробном зуме не закреплён старыми пинами — новые AT-3/AT-4 частично
  закрывают; при правке floor-pass (000263/000264) проверять
  snappedTileRect для wall-drawImage.
* Маска считается ПО cells БЕЗ оверлеев — если когда-нибудь появятся
  динамические изменения тайлов, пересчёт 3×3 (план пользователя)
  вернётся актуальным: сейчас layout иммутабилен, маска = чистая
  функция на кадр (4 чтения + bounds — пренебрежимо).
* Городские маски у двери: достижимы {0,1,2,3,4,8,9} (у двух wall-
  клеток по бокам южной двери — 3 и 9, НЕ «ровно {0,1,2,4,8}» из ТЗ) —
  тесты не должны пинить этот набор как исчерпывающий.
* Фолбэк-ветка города (fillRect CITY_WALL_VARIANTS) — НЕ РЕФАКТОРИТЬ:
  golden-пины (dungeon-ui 2206-2240, TS-11, city-screen) живут, пока
  fallback = те же hex + та же cityTileVariant + CITY_TILE_SEED.
* EXPECTED_SVG_BY_DIR (tests/svg.test.js) — единственная точка, которую
  правит задача, добавляющая SVG (общий total-guard по таблице).

## 10. Подводные камни

* ИНВЕРСИЯ значений клеток (код: 0=стена, 1=пол) — все биты маски
  `=== CELL_FLOOR`.
* Байт-в-байт фолбэк — любые «оптимизации» формулы/палитры fallback-
  ветки сносят золотые (risk 2 a1).
* 80 SVG обязаны существовать ДО e2e-прогона: allAssetPaths — полный
  pre-лоад; load-clean (0 console.*) обязателен. Генератор прогнать и
  svg.test.js прогнать ДО фиксации assets.
* Z-порядок: переход стены в floor-pass — проверить, что floor-спрайт
  не перекрывается стеной (клетки не пересекаются — перекрытий нет) и
  FOG_DIM_FILL поверх (risk 6 a1).
* Red-стадия: 3105 существующих зелёных не должны дрогнуть — guard'ы
  «нет функции/файла» (typeof/existsSync/assert.fail), НЕ syntax error;
  harness-цепочки НЕ трогаем (модуля нет).
* spec-split SPEC_FILE_LINES — пересчёт В ТОМ ЖЕ коммите (иначе R7
  падает тихо).

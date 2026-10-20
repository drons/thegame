# 000238 — Здания: анимация — расширение на остальные здания, город 53, лагерь (волна 1)

Статус: РЕАЛИЗОВАНО (волна 1, 2026-10-20 — результаты в §10; ветка
task/000238, base master 14631d5 — механизм 000224 уже в master).
Follow-up к 000224: механизм кадр-свитча (строка в BUILDING_FRAMES +
4 SVG + re-pin svg.test.js) расширить на прочие здания и типы городов.
Все координаты/шаги ниже — пробами (node, read-only) на детерминированном
мире (assets/map.png — неизменён со скелета,
G.generateSeedPixels ≡ map.png).

## 0. Скоуп

* ВОЛНА 1 (эта задача): слот 2 «Аптекарь» (id 3) + слот 7 «Школа
  акробатов»/ACADEMY (id 11) на карте и в городе; город 53 на карте
  (citySprite-канал); лагерь 47 (костёр, campSprite-канал). 16 новых SVG:
  apothecary_1..4 (64×64), academy_1..4 (64×64), city_53_1..4 (320×320),
  camp_1..4 (64×64).
* ВОЛНА 2 (follow-up tasks/pending/000238.01.md): слот 0 «Магазин оружия»
  (id 1) + слот 11 «Таверна» (id 44) + города 51/52/54 + прочие здания.
  Механизм готов (волна 1), волна 2 — контент + семантическая синхронизация
  фикстур 000148.02/city-screen G1 (см. §8). Re-pin svg: buildings 34→42,
  cities 8→20.
* Механизм НЕ ДУБЛИРУЕТСЯ: buildingFrameIndex(now, x, y, n) +
  BUILDING_FRAME_MS = 800 переиспользуются всеми каналами (слоты/города/
  лагерь) — новых формул/констант/RNG НЕТ (D10: кадр = f(now, x, y)).

## 1. Почему слоты 2/7, а не 0/11 (fixture-перпись)

ТЗ-кандидаты: 11 Таверна, 7 Академия, 0 Магазин оружия, 2 Аптека (2–3 на
волну). Выбрано 2+7, потому что слоты 0/11 прошивают СУЩЕСТВУЮЩИЕ тесты:

* id 44/45 (таверна/колодец, слот 11) и id 1 (оружейная, слот 0) — в 5
  тестах 000148.02 tests/dungeon-ui.test.js: L2463 (базовая id 44),
  L2502 (субтип id 45 + id 37), L2622 (базовые id 1/25/36/44 + 999),
  L2671 (viewport-клип id 44), L2758–2765 (ретро 000191, id 44/5) — ассерты
  ТОЧНОГО базового пути (хелпер buildingSpritePath L2443 = id→слот→
  G.buildingSprite, БЕЗ frames-ветки; makeSpriteLoader только с базами).
* id 44/1 — в e2e tests/city-screen.test.js G1 (000148.02): реальная
  деревня 52 (якорь (20,−16)) = 3 постройки (4,4) 44, (2,3) 1, (2,2) 44;
  ассерт мультимножества путей = resolve() → G.buildingSprite (базы),
  «ровно 3 спрайта».
* Анимация 0/11 → cityBuildingPath/buildingAsset вернут КАДР, а ассерты
  ждут БАЗУ → семантическая правка существующих тестов — ЗАПРЕЩЕНА
  инвариантом (только технические под новый путь).
* id 3/11 (слоты 2/7) отсутствуют во ВСЕХ городских фикстурах (grep
  buildingId по tests/) → ноль последствий; оба записания каталога
  buildable (.стройка есть) → городские каналы 2/7 реально достижимы
  (игрок строит аптекаря/школу) и покрыты CU-BA-3/4.

Слоты 0/11 отложены на волну 2; её подзадача сама несёт синхронизацию
000148.02 (makeSpriteLoader + кадры, buildingSpritePath + frames-ветка) и
G1 (resolve → зеркало cityBuildingPath) как СВОЙ скоуп.

## 2. Ошибка ТЗ: «город 53 (город 3×3)»

В каталоге и коде город 53 = «Город» 5×5 (assets/buildings/000053.json:
размер 5×5, вход (2,4) → мировой вход (ax+2, ay+4)); city_53.svg viewBox
0 0 320 320; в мире ±256 — 19 записей 5×5 (290 городов всего: 51:177,
52:89, 53:19, 54:5). Размеры по каталогу: 1×1/2×2/5×5/7×7 — 3×3 НЕ
СУЩЕСТВУЕТ. Кадры city_53 — 320×320. Дизайн следует коду (код — источник
правды; в коммите 000102 город 53 уже был 5×5).

## 3. Дизайн таблиц (src/sprites.js)

* CITY_FRAMES = { 53: ['assets/sprites/cities/city_53_1.svg', …_2, …_3,
  …_4] } — ЛИТЕРАЛ, ключ — buildingId (НЕ слот): город НЕ слот (000103:
  type = NONE, buildingId 51..54) — зеркало CITY_SPRITES (000110).
* CAMP_FRAMES = { 47: ['assets/sprites/buildings/camp_1.svg', …_4] } —
  ЛИТЕРАЛ, семья buildings/ (прецедент 000131: camp.svg — там же, 64×64 —
  размер слотовой иконки), не cities/.
* CITY_SPRITES/CAMP_SPRITES НЕ расширяются: SP-C1/SP-C2 (CITY_SPRITES ≡
  каталогу «город», 4 РАЗНЫХ пути) и SP-47 (CAMP_SPRITES deepEqual ≡
  {47: camp.svg} — пин отсутствия лишних id) упали бы.
* cityFrames(buildingId) / campFrames(buildingId) → string[] | null:
  Number.isInteger-гард + таблица + `|| null` (конвенция
  buildingFrames/citySprite/campSprite). НЕ читают spriteForId (у городов/
  лагеря подтипов нет — подтипы только у слотов 8..12 (000073); 47 и
  51..54 не пересекаются с buildingId слотовых записей).
* citySprite/campSprite/buildingSprite — НЕ ТРОГАТЬСЯ (базы; пины
  SP-B1/B2/F-B и зеркало каталога «спрайт»).
* Индекс кадра — ПЕРЕИСПОЛЬЗОВАНИЕ buildingFrameIndex(now, tx, ty, n)
  (BUILDING_FRAME_MS = 800, та же фазовая схема (tx*5+ty*9)%n — соседи
  рассинхронизированы). tx/ty = rec.x/rec.y — топ-левый тайл footprint =
  точка отрисовки worldToScreen(rec.x, rec.y) — то же, что слотовая ветка.
  Ноль нового RNG (D10).

## 4. buildingAsset (src/main.js, L2992)

Порядок веток: слотовые кадры → городские кадры → лагерные кадры →
статичная цепочка (buildingSprite || citySprite || campSprite):

```
if (rec.buildingId != null && typeof G.buildingFrameIndex === 'function') {
  const nf = (typeof G.cityFrames === 'function'
    ? G.cityFrames(rec.buildingId) : null) ||
    (typeof G.campFrames === 'function'
     ? G.campFrames(rec.buildingId) : null);
  if (nf && nf.length > 1)
    return nf[G.buildingFrameIndex(now, rec.x, rec.y, nf.length)];
}
```

* typeof-гарды — тихая деградация (UMD-ловушка 000038, RM-8: старое
  sprites.js без cityFrames/campFrames → игра не падает, 0 console.error).
* СТРОГАЯ готовность (инвариант 000224): кадр не загрузился →
  spriteLoader.image → null → legacy-маркер (гейт buildFrame) / skip
  (проход 2 — здание не рисуется). FALLBACK НА БАЗУ ЗАПРЕЩЁН (прецедент
  воды 000025; fallback ломал бы семантику RM-9(c)/reject-сценариев).
* ОДИН now на кадр (frame(now) → buildFrame + drawSprites) — XOR-паритет
  000176 цел. z-порядок не меняется (тот же единственный drawImage на
  том же прямоугольнике rec.w×rec.h×zoom).
* Неспорность ключей: у слотовых записей buildingId = null (слоты 0..7)
  или id каталожной записи слота 8..12 (000073: subtypeTable = базовая
  запись «остатком» + подтипы с долей > 0; в текущем каталоге —
  25/31/36..46/48/49, id 55 не возвращается — доля 0); 47 и 51..54 в
  этом наборе не бывают (только города/лагерь, type NONE). Слотовая
  ветка ПЕРВАЯ: если в будущем слот 8..12 анимируется — запись
  анимированного слота берёт кадр (верно).
* src/dungeon-ui.js — ПРАВКИ НЕТ: cityBuildingPath(live, buildingId, now,
  x, y) уже generic по слоту (live.buildingFrames(slot), 000224) → новые
  строки 2/7 подхватятся в городе автоматически.

## 5. Мир и сценарии (дет. мир; спавн (0,0), ZOOM_START 80, view 1280×720)

* Видимый диапазон в спавне (cam 0.5,0.5, zoom 80): x −9..8, y −5..5.
  Спавн-кадр: cave_entrance id 48 (2,−4), АКАДЕМИЯ слот 7 (3,−4) 1×1,
  rune_stone id 43 (4,3). → Анимация слота 7 меняет дефолтный спавн-кадр
  (academy_N.svg вместо academy.svg): СТАТИЧЕСКИХ пинов academy.svg в
  кадре нет (только зеркала каталога/слотов — статичные селекторы),
  RM-9-базлайн динамический → зелёный. (memory/000224 «спавн-кадр:
  cave_entrance/arena/rune_stone» неточно — ИСПРАВЛЕНО здесь: академия,
  не арена.)
* walkToMulti (main-visuals «footprint»/«стены»/«слои»): ближайшая
  multi = храм id 36 (6,28) 3×3, вход (7,30), 39 шагов; оконный кадр
  x −2..15, y 25..35 содержит храм 36 + КУЗНИЦУ слот 5 (2,31) —
  expectedBuildings уже обрабатывает (frames-ветка generic, 000224);
  лагерей/городов/академии в окне НЕТ.
* Входы слотов от спавна (BFS, мобы = стены): слот 7 → (3,−4), 7 шагов;
  слот 2 → (2,−36), 38 шагов. (Волна 2: слот 0 → (−6,−14), 20; слот 11
  → (41,2), 43.)
* Город 53: 23 якоря в ±300 / 19 в ±256 (реже всех после 54). Сценарные
  якоря: (93,18) вход (95,22) и (61,−72) вход (63,−68) — оба 5×5.
  Цель MV-C3 = (95,23) — тайл ПОД входом, ВНЕ 5×5-футпринта (93..97 ×
  18..22), с которого весь footprint в кадре (диапазон x 86..103,
  y 18..28 ⊇ bbox); 118 шагов по правилам cityRoute (тело города =
  препятствие, вход — НЕ цель; MV-C1-прецедент 133 шага — допустимо).
  Альтернатива (89,17) — 106 шагов.
* Город 53 НЕ в окнах main-visuals: MV-C1 (−95..−78 × −52..−42) =
  только 54@−84,−48; MV-C2 (12..29 × −19..−9) = 52@20,−16 + 51@19,−12
  → эти тесты пробегут без смены ассетов.
* Лагерь: golden (−18,−12) (CP-6/CP-10) — 30 шагов; второй (8,22) — 30
  шагов (вне окна walkToMulti). Лагерь = ЦЕЛЬ, не препятствие.

## 6. Карта тестов

### Новые RED (11)

node — tests/building-anim.test.js (паттерн BA-1..3):
* BA-4: строки BUILDING_FRAMES[2]/[7] — apothecary_1..4 / academy_1..4
  (4 РАЗНЫХ), файлы, ∈ allAssetPaths, без дублей; остальные слоты
  (0,1,4,6,8,9,10,11,12) — null.
* BA-5: cityFrames(53)/CITY_FRAMES — city_53_1..4 (320×320), файлы,
  allAssetPaths; cityFrames(51/52/54/47/999/−1/0..12/'53'/53.5) → null;
  ЛИТЕРАЛ (мутация «спрайт» каталога 53 не меняет); citySprite(53) =
  БАЗА city_53.svg.
* BA-6: campFrames(47)/CAMP_FRAMES — camp_1..4, файлы, allAssetPaths;
  campFrames(0..12/41..46/51..54/999/'47'/47.5) → null; ЛИТЕРАЛ;
  campSprite(47) = БАЗА camp.svg (SP-47 интактен).

vm — карта, tests/global-map-draw.test.js (паттерн RM-BA-1/2; BFS-хелпер
findNearestAnimated238 по слотам 2/7 — найдётся академия (3,−4), 7 шагов):
* RM-BA-3: на якоря drawImage КАДРА (не база), rec.w×rec.h×zoom; +800 мс
  — кадр ДРУГОЙ; тот же now — идентично (D10); тайлы/мобы/герой интактны;
  errors 0.
* RM-BA-4: СТРОГАЯ готовность — reject ТЕКУЩЕГО кадра → legacy-маркер
  (6 вершин) на якоря, СПРАЙТА нет (база загрузилась — fallback
  ЗАПРЕЩЁН); остальной кадр интактен (XOR).
* RM-CAMP-1 (в camp-map-e2e как CP-12): лагерь (−18,−12) — костёр:
  drawImage camp_N.svg (не camp.svg) РОВНО 1× на worldToScreen(якоря)
  1·zoom; +800 мс — кадр другой; D10; errors 0.
* RM-CAMP-2: СТРОГАЯ готовность лагеря — reject текущего camp-кадра →
  лагерного спрайта НЕТ (skip), маркер, остальной кадр интактен.

vm — город НА КАРТЕ, tests/main-visuals.test.js (паттерн MV-C1; именование
a1 — RM-C53-1/2):
* MV-C3 (RM-C53-1): город 53, якорь (93,18), цель (95,23), steps = 118
  (hard-ассерт, гвард дрейфа мира); на якоря drawImage city_53_N.svg (не
  база), 5z×5z; bbox 25 тайлов покрыт, не выходит; +800 мс — кадр другой;
  D10; errors 0.
* MV-C4 (RM-C53-2): СТРОГАЯ — reject текущего city_53-кадра
  (boot(rejectSet)) → городского спрайта НЕТ (skip), fallback на базу
  ЗАПРЕЩЁН; остальной кадр интактен.

vm — город (ЭКРАН), tests/dungeon-ui.test.js (паттерн CU-BA-1/2):
* CU-BA-3: город (деревня 6×6) с Аптекарем (id 3, map_index 2) — на
  клетке drawImage КАДРА таблицы (не статичная база apothecary.svg),
  zoom×zoom на угле; +800 мс — кадр другой; тот же now — идентично (D10);
  hex-пол сохранён; errors 0. Городской канал generic — код НЕ меняется.
* CU-BA-4: СТРОГАЯ в городе — loader БЕЗ кадров (ready только база) →
  building-спрайта НЕТ (skip, клетка — пол, 000148.02), без console.error.

### Технические синки (только под новый путь)

1. tests/building-anim.test.js BA-1: null-лист слотов
   [0,1,2,4,6,7,8,9,10,11,12] → [0,1,4,6,8,9,10,11,12].
2. tests/svg.test.js EXPECTED_SVG_BY_DIR: 'sprites/buildings' 22 → 34
   (+12: apothecary 4 + academy 4 + camp 4), 'sprites/cities' 4 → 8
   (+4 city_53).
3. tests/main-visuals.test.js: walkToCity() → возвращать now (сейчас
   {calls, steps}; прецедент walkToMulti {calls, found, now});
   expectedCities(G, myMap, cam, zoom) → (…, now) + ветка cityFrames 1:1
   с селектором main.js (typeof-гард, строгие кадры, иначе citySprite);
   expectedBuildings() — camp-ветка → строгий campFrames-селектор 1:1
   (+cityFrames-ветка для полного зеркала) — СЕЙЧАС НО-ОП (лагерей/городов
   в окне нет), защита контракта «зеркало = точная копия селектора».
4. tests/camp-map-e2e.test.js CP-10: фильтр `__asset === CAMP_SVG` →
   текущий camp-кадр `G.campFrames(47)[G.buildingFrameIndex(now + 200,
   −18, −12, 4)]` (now кадра = frameAt(h, now + 200)); позиция/размер —
   без изменений.

### Затронуты НЕ БУДУТ (проверено)

dungeon-ui 000148.02 (фикстуры 44/45/37/1/25/36/5/999 — слоты 11/8/0/12,
без 2/7), city-screen G1 (44/1 — без 2/7), CI-B5 (иконки buildIconPath —
СТАТИЧЕСКИЕ БАЗЫ), SP-C1/C2/SP-47 (базы не трогаются), buildings.test.js
(каталог не расширяется), MV-C1/MV-C2 (53 в окнах нет), RM-9/RM-10
(динамические), GOLDEN_TILES (map.js не меняется), index.html/index-order
(новых тегов НЕТ — всё в sprites.js/main.js, уже в цепочке).

## 7. Подводные камни

* CROSS-REALM: таблицы/массивы из vm-песочницы сравнивать только через
  Array.from (или JSON/length-цикл) — deepEqual на чужом Array.prototype
  никогда не падает (ловушка 000224, CU-BA-1). CU-BA-3 — паттерн
  Array.from.
* КАДР 1 = БАЙТ-КОПИЯ базы (cp; проверка fs.readFileSync +
  Buffer.compare в тесте BA-4/5/6) — идеология 000224: кадры 2–4 — та же
  композиция, движется только анимированный элемент (аптекарь — пар из
  котла; академия — свечи/свечение окон; city_53 — огни окон/копоть;
  лагерь — языки/искры костра).
* checkSvg (экспорт tests/svg.test.js) — ДО каталога (правило 000120):
  well-formed + корень svg + xmlns + viewBox + без NaN; без SMIL/
  <animate>/<text>/<image>/ссылок (SPEC/MOBS.md: анимация по кадрам).
* Кириллица в SVG-комментариях — проверять hexdump, не на глаз (артефакт
  000224: арабские глифы, визуально похожие на кириллицу, в
  blacksmith_3.svg; Edit-тул такие строки не матчит).
* buildingAnchor = МАССИВ [x, y], не объект (map.js).
* city_53-кадры — 320×320 (viewBox 0 0 320 320 = базе), НЕ 64×64/192×192.
* allAssetPaths — ЕДИНСТВЕННЫЙ pre-лоад: кадр вне списка = вечный
  legacy-маркер/skip в браузере (тесты не упадут) → обязательны циклы
  Object.values(CITY_FRAMES)/CAMP_FRAMES + пины allAssetPaths в BA-4/5/6.
* Один полный node --test в worktree (память no-parallel-full-tests; тест
  000054 мутирует src/npc-data.js); чужой флейк — перепуск
  node --test tests/<файл> + запись в отчёт.
* Хот-споты мержа (параллельные workflow): строки BUILDING_FRAMES +
  CITY_SPRITES/CAMP_SPRITES в sprites.js, buildingAsset в main.js, пины
  svg.test.js — те же, что 000224 → при перебазировании ручной union +
  полный прогон.
* Мировые пины (GOLDEN_TILES, сейвы, RNG, детерминизм боя) — ИНТАКТНЫ:
  map.js не меняется, новых RNG нет (кадр = f(now, x, y)).

## 8. Волна 2 (000238.01) — границы

* Слоты 0/11 требуют семантической синхронизации как часть СВОЙ подзадачи:
  dungeon-ui 000148.02 ×5 (makeSpriteLoader + кадры слотов; хелпер
  buildingSpritePath + frames-ветка по now) и city-screen G1 (resolve() →
  зеркало cityBuildingPath со строгими кадрами). Поэтому 0/11 вне волны 1.
* Города 51 (1×1, 64×64) / 52 (2×2, 128×128) / 54 (7×7, 448×448) — тот же
  паттерн CITY_FRAMES (строка + 4 SVG + BA/RM-тесты); re-pin cities 8→20.
* Городской экран (ревью волны 1): CU-BA-паттерн волны 2 (слоты 0/11)
  покрывает ОБА слота волны в одном тесте (образец CU-BA-1 000224:
  id 4 + id 8) — волна 1 оставила слот 7 (id 11) в городе покрытым
  только глобальной картой (RM-BA-3/4); городской канал generic и не
  менялся (риск минимален, но не запитинен).
* Механизм от волны 1 не меняется: строки в таблицах + SVG + пины.

## 9. Что важно будущим задачам (из ТЗ-ссылок)

* 000110 (citySprite-канал): городские кадры — отдельная таблица по
  buildingId; расширение на 51/52/54 — добавление строк CITY_FRAMES.
* 000131 (лагерь): CAMP_FRAMES — отдельная таблица; механика лагеря
  (костёр/сток/полный отдых, CP-6/CP-11) не меняется.
* 000120 (SVG-схема): каждый новый SVG — checkSvg ДО каталога.
* 000224 (механизм): строгая готовность, один now на кадр, XOR-паритет,
  формула buildingFrameIndex — НЕ трогать, переиспользовать.
* Каталог assets/buildings/*.json + schema.json (additionalProperties:
  false + sync-гейт) — НЕ расширять НИ В КАКОЙ волне (кадры не в каталог).
* Если будущая волна анимирует слот 4 (арена) или 8 (храм): тест
  main-visuals «footprint рисуется ОДИН раз» пинит found.rec по СТАТИЧНОЙ
  базе (L823 `G.buildingSprite(rec.type)`; сейчас found = храм 36 (6,28)
  + кузница (2,31) в окне) — слотовая frames-ветка зеркала уже generic,
  но atAnchor-пин по базе сломается → синхронизировать как в этой волне.

## 10. GREEN (результаты реализации, 2026-10-20)

* Статус: РЕАЛИЗОВАНО, весь набор 2798/2798 (один полный прогон в
  worktree; RED-база — 2787 зелёных + 11 красных).
* 16 SVG в каталогах (checkSvg 16/16 ДО каталога): apothecary_1..4 /
  academy_1..4 / camp_1..4 (64×64), city_53_1..4 (320×320). Кадр 1 —
  БАЙТ-копия базы (cp); кадры 2–4 — та же композиция, движется только
  анимированный элемент: аптекарь — пар из ступки-котла (струйки,
  3 фазы); академия — свечение окон (ореолы 1/2 окна + шашка);
  костёр — языки пламени (наклон влево/вправо, высота) + искры;
  город 53 — огни окон (2/3/2 окна, разная яркость) + копоть от
  шпиля (1/2/1 струйка).
* src/sprites.js: строки BUILDING_FRAMES[2]/[7] (APOTHECARY/ACADEMY
  — computed-ключи, как 3/5), литералы CITY_FRAMES {53} /
  CAMP_FRAMES {47} (ключ — buildingId), селекторы
  cityFrames/campFrames (Number.isInteger-гард + `|| null`, НЕ
  spriteForId — у городов/лагеря подтипов нет), allAssetPaths +2
  цикла Object.values, +4 экспорта (CITY_FRAMES/cityFrames,
  CAMP_FRAMES/campFrames). CITY_SPRITES/CAMP_SPRITES/citySprite/
  campSprite/buildingSprite — НЕТРОНУТЫ.
* src/main.js buildingAsset: ветка город/лагерь МЕЖДУ слотовой
  веткой и статичным return — typeof-гарды cityFrames/campFrames/
  buildingFrameIndex, rec.buildingId != null, nf.length > 1 →
  nf[buildingFrameIndex(now, rec.x, rec.y, nf.length)]; один now;
  строгая готовность (spriteLoader.image → null → legacy-маркер /
  skip; fallback на базу запрещён). dungeon-ui.js — НЕТРОНУТ
  (cityBuildingPath generic по слоту — строки 2/7 подхватились
  сами, CU-BA-3/4 зелёные).
* tests/svg.test.js репин: sprites/buildings 22 → 34,
  sprites/cities 4 → 8 (total 384 → 400; сумма считается из
  таблицы — отдельного числа нет).
* ЛОВУШКА CROSS-REALM №2 (дополнение к §7): MV-C4 в RED сравнивал
  `assert.deepEqual(hb.sandbox.__game.state.player, {x, y})` —
  sandbox-объект (чужой Object.prototype) vs литерал:
  deepStrictEqual падает НА ПРОТОТИПЕ, даже при равных значениях
  (ошибка показывает expected == actual). В GREEN исправлено
  технически: вынести примитивы `{ x: st.player.x, y: st.player.y }`
  (паттерн MV-C3) — семантика ассерта не менялась. Правило: из
  vm-песочницы в deepEqual — ТОЛЬКО примитивы/Array.from, объекты —
  никогда.
* Волна 2 — tasks/pending/000238.01.md (слоты 0/11 + города
  51/52/54; несёт СЕБЕ синхронизацию фикстур 000148.02/G1 — см.
  §1, §8).

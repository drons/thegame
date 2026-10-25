# 000263: чанковый рендер (16×16) с кэшем чанков — мир + города/подземелья

Статус: ДИЗАЙН + РЕАЛИЗАЦИЯ + ФИНАЛИЗАЦИЯ (2026-10-25; эратум — §15,
правки по итогам ревью — §16, отчёт — tasks/result/000263.md).
Задача: tasks/pending/000263.md. Ветка task/000263, база master 85d7bcb.
Анализ: /tmp/thegame-wf-000263/a1-domain.md, a2-arch.md, a3-tests.md —
все открытые вопросы решены ниже (§3); расхождения между анализами —
примечания «почему» в каждом решении.

## 1. ТЗ / цель

Снизить число draw-операций на кадр на мировой карте и в
городах/подземельях: статическая часть кадра (тайлы/пол/стены)
запекается 1 раз в offscreen-чанк 16×16 (canvas) и переиспользуется из
кэша; каждый кадр — 1 drawImage на видимый чанк + прежние динамические
слои. Результат пиксель-в-пиксель как раньше (кроме задокументированного
подпиксельного угла §3.10). Ограничения ТЗ: ноль изменений логики
tileAt/RNG/сейвов/ввода/камеры/данных построек/combat-ui; не смешивать с
000258/000259/000264/000247.

## 2. Архитектура

### 2.1 Новый модуль src/chunk-cache.js (UMD, ноль зависимостей при загрузке)

Образец: src/cities.js / src/dungeon.js / src/building-effects.js
(UMD, чистые функции, никаких require/ссылок на Game при загрузке;
потребители берут через `globalThis.Game.ChunkCache` — в main.js из
снапшота G (L14-16), в dungeon-ui.js лениво через liveGame()).

Экспорты (все чистые, с гардами-зеркалами snappedTileEdges:
невалидные аргументы → NaN-результат, без исключения):

    CHUNK_SIZE = 16
    chunkRange(x0, y0, x1, y1, size=16)
      → {cx0, cy0, cx1, cy1}  // Math.floor на каждой границе —
      // корректно для отрицательных координат мира
    zoomBucket(zoom, start=80, step=1.2)
      → Math.round(Math.log(zoom/start)/Math.log(step))
      // каноническая сетка 1.2^k от ZOOM_START=80 (map.js:1164-1170)
    worldChunkLocalEdges(cx, cy, zoom, size=16)
      → {ex[17], ey[17], w[16], h[16]}
      // local edge j = Math.round((16·cx+j)·zoom) − Math.round(16·cx·zoom)
      // — НЕ зависит от камеры (мир-якорная сетка 000228)
    worldChunkBlitRect(cx, cy, zoom, camX, camY, viewW, viewH, size=16)
      → {x, y, w, h}
      // x = Math.round(viewW/2 − camX·zoom) + Math.round(16·cx·zoom)
      // (тот же anchor, что worldAnchoredTileEdges map.js:1393-1418)
    camAnchoredChunkRect(cx, cy, zoom, camX, camY, viewW, viewH, size=16)
      → {origin: {x, y}, ex[17], ey[17], w[16], h[16]}
      // origin.x = Math.round(viewW/2 + (16·cx − camX)·zoom)
      // local edge j = Math.round(viewW/2 + (16·cx+j − camX)·zoom) − origin.x
      // — камерно-якорная сетка, ПОПиксельно равна последовательности
      //   snappedTileRect(x, y, ...) (map.js:1346) для всех 256 клеток
    createChunkCache({ maxPixels = 16·1024·1024 } = {})
      → { get(key), put(key, entry), clear(), stats() }
      // entry = {canvas, w, h, pixels, zoom, ex, ey, readyAtBake,
      //          nullCount, ...meta} — ключ строит ПОТРЕБИТЕЛЬ:
      //   `${cx}:${cy}:${zoomBucket(zoom)}`
      // LRU по порядку вставки Map: get-хит пере-insert'ит (перенос в
      // хвост); вытеснение — с начала, пока pixels > maxPixels;
      // canvas не удерживается (GC); stats {chunks, pixels, evictions}

Почему не нужен createCanvas-инъект: offscreen-canvas создаётся
потребителем (document.createElement('canvas') в браузере / stub в
тесте) и передаётся в put(); кэш хранит и высвобождает, не создаёт.

### 2.2 Точка привязки МИР: src/main.js, drawSprites (L3518-3760)

Сейчас: clearRect → pass 1 ОДИН цикл по frameTiles (текстура тайла через
snapTile из worldAnchoredTileEdges L3542-3554, затем showVisuals
(zoom≥VISUALS_MIN_ZOOM=24), затем showLoot (zoom≥LOOT_MIN_ZOOM=16) —
все три в одной итерации) → pass 2 постройки (1 drawImage w×h от
якоря) → 2.5 агро-окружности → 3 мобы → герой.

Новый порядок (слои — тот же z-порядок):
clearRect → [чанки: bake/guard/blit] → pass воды (по тайлу) → pass
декораций (по тайлу, zoom≥24) → pass лута (по тайлу, zoom≥16) →
постройки → агро → мобы → герой.

Механика:
- `nTiles = (tileRange.x1−x0+1)·(tileRange.y1−y0+1)` (tileRange
  L3542-3552, видимый диапазон visibleTileRange).
- `useChunks = G.ChunkCache && tileEdges && spriteLoader
  && nTiles > WORLD_CHUNK_MIN_TILES (8192)`.
- Чанк-pass: для (cx, cy) ∈ chunkRange(tileRange, 16):
  key = `${cx}:${cy}:${zoomBucket(zoom)}`; entry = cache.get(key);
  guard (entry !== null && |entry.zoom − zoom| ≤ 1e-6 &&
  edgesEqual(entry, worldChunkLocalEdges(cx, cy, zoom)) &&
  readinessOk(entry)) → blit: g2.drawImage(entry.canvas,
  worldChunkBlitRect(...)); иначе → bake: новый offscreen-canvas
  размером w[15]×h[15] (= сумма локальных ширин/высот), цикл по 256
  тайлам row-major: ТО ЖЕ вызов текстуры, что в pass 1 (spriteLoader.
  image + drawImage в локальные координаты cr = [ex[j],ex[j+1]]×[ey[k],
  ey[k+1]]); неразрешённый спрайт → SKIP (прозрачное окно) + nullCount
  ++, readyAtBake = spriteLoader.readyCount(); cache.put(key, entry).
- Guard провал → re-bake (put поверх; старый canvas высвобождается).
- Pass воды: цикл по frameTiles; terrain ∈ {вода, глубокая вода}
  (единственные мультикадровые, WATER 4 / DEEP_WATER 2 фрейма,
  frameIndex от времени) → drawImage по ТАК ЖЕ snapTile-прямоугольнику,
  как сейчас (код переносится из тела pass 1 без изменений).
- Passы декораций/лута: ТЕ ЖЕ тела, что в pass 1 (tileVisuals /
  loot-логика со ВСЕМИ условиями — skip в постройке и т.д.), только
  вынесены в отдельные циклы (код перенос, не перепись).
- При !useChunks — старый pass 1 СТОИТ БЕЗ ИЗМЕНЕНИЙ (единый цикл).
- Debug: `__game.state.chunkCache = cache.stats()` (read-only
  {chunks, pixels, evictions}) — зеркалирование, как соседние state.

### 2.3 Точка привязки ПОДЗЕМЕЛЬЯ/ГОРОДА: src/dungeon-ui.js, render (L445-925)

Сейчас: floor/wall-pass L552-621 — ОДИН цикл row-major по видимым
клеткам (y0..y1, x0..y1 — viewport ∩ границ сетки L499-504):
mask==0 → continue; город: пол → fillRect CITY_FLOOR_VARIANTS[
cityTileVariant(len, x, y, d.seed)], стена → drawImage
WALL_AUTOTILES.city[cidx] (фолбэк fillRect CITY_WALL_VARIANTS);
подземелье: стена (wallTileIndex≠0) → drawImage
WALL_AUTOTILES[wallKindFor(x,y,d)][idx], idx==0 → Ничего (фон); пол →
drawImage dungeonFloorFrame(d.type, x, y) (фолбэк fillRect '#182029').
Вся содержимое — ЧИСТАЯ функция (cells, seed, d.type, loader-ready,
cam, zoom) → запекается.

Новый: тот же участок, но
`useChunks = live.ChunkCache && nCells > DUNGEON_CHUNK_MIN_CELLS (1024)`,
nCells = (x1−x0+1)·(y1−y0+1) ПОСЛЕ обрезки. Чанк-pass: для (cx, cy) ∈
chunkRange: key по bucket(zoom); guard: |entry.zoom − zoom| ≤ 1e-6 &&
edgesEqual(entry, camAnchoredChunkRect(...).ex/ey — ПЕРЕСЧИТАНО от
текущей камеры, 34 roundings/чанк) && fogGuard(entry) && readinessOk;
blit drawImage(entry.canvas, origin.x, origin.y). Bake = Тело floor/
wall-pass, перенесённое на 16×16 с локальными cr и локальными
координатами; mask==0 клетки → SKIP (прозрачно) + contentBaked[i]=0;
клетка с not-ready fallback'ом (fillRect вместо drawImage) → nullCount++.
fogGuard: ∀i: contentBaked[i] !== 0 || mask[i] === 0 (explored растёт
монотонно — ре-бейк только 0→1/0→2, 1→2 НЕ требует — контент один,
FOG_DIM — динамический pass). readinessOk: nullCount === 0 ||
перепроверка сохранённых not-ready путей через loader.isReady
(≤256 проверок, только у чанков с дырами).
При !useChunks — старый цикл СТОИТ БЕЗ ИЗМЕНЕНИЙ.

Кэш — инстанс на start(): создаётся в start() (L972-1005), clear() в
start() (новый инстанс) и close() (L1006-1021). Render без start
(тесты) — кэш не создаётся → useChunks false (тихий guard, как все
live-гарды render).

НЕ ТРОГАТЬ (остаётся динамическим, порядок слоёв не меняется):
постройки города (000264!), портал/stairs-маркеры, сундуки, залежи,
мобы, FOG_DIM (mask==1, после мобов до игрока), игрок. Фон
'#0a0d12' fillRect (L462-463) — каждый кадр, не в чанк.

### 2.4 WebGL-слой (#game, buildFrame L3296-3385) — НЕ ТРОГАТЬ

XOR-контракт 000176: WebGL рисует legacy-квады ТОЛЬКО для
неразрешённых спрайтов; в steady state 0 вершин. Чанк-pass прозрачные
дыры для not-ready тайлов → квады ниже видны ЧЕРЕЗ #sprites — ровно как
сейчас (skip в 2D pass). buildFrame/frameTiles/tileFrameImg — без
изменений (цикл frameTiles 131k итераций/кадр — будущее, §9).

## 3. Решения (все открытые вопросы ТЗ + а1/a2/a3)

### 3.1 Гейт активации — ПО ЧИСЛУ ВИДИМЫХ КЛЕТОК, не по зуму

WORLD_CHUNK_MIN_TILES = 8192, DUNGEON_CHUNK_MIN_CELLS = 1024 (константы
рядом с точками привязки). Почему: окно выбора жёстко задано
существующими пинами: мир — «чанки ВКЛ» только на RM-10 (1280×720,
z=4: 322×182 = 58 604 тайла — единственный сценарий с z < 15.5;
худший случай 1920×1080 z=4 = 131 104 — новый CC-5) и «чанки ВЫКЛ»
на ВСЕХ остальных: максимум — LM8 «zoom < 16» (колесо останавливается
на z = 80/1.2^9 ≈ 15.5045 → 85×49 = 4165 тайлов — проверено),
main-visuals z≈22.33 → 2100, TS-6 z≈115.2 → 126, tile-pulse z=80 →
126. Порог T: 4165 ≤ T < 58 604 → 8192 (середина логарифмически).
(a3 привела окно (4165, 59 248) — верхняя граница — арифметическая
опечатка a3 по Y (184 вместо 182); на выбор 8192 не влияет.)
Подземелье/город — ВСЕ существующие тестовые сцены ≤676 клеток
(26×26 город — максимум), 63×63=3969 — цель; 1024 ∈ (676, 3969] даёт
НОЛЬ ре-пинов на dungeon/city-стороне. Гейт по зуму (<8, a1) ОТКЛОНЁН:
расширяет фронт ре-пинов (сцены с z<8 на маленьких сетках) без
выигрыша. Города НИКОГДА не чанкуются (≤676 < 1024) — «тот же
паттерн» ТЗ = общая кодовая ветвь dungeon-ui.js с нулевым эффектом для
городов; задокументировано в SPEC.

### 3.2 Состав чанка МИРА — ТОЛЬКО однокадровые текстуры тайлов

Запекается: текстура тайла (tileFrameImg → spriteLoader.image, тот же
XOR-селектор, что в pass 1). НЕ запекается:
- вода/глубокая вода — мультикадровые (4/2 фрейма, бегущая волна
  frameIndex) — запекание ЗАМОРОЗИТ анимацию → per-tile pass после
  блитов, побитово как сейчас (R5);
- декорации tileVisuals — НЕ в чанк (a2 предлагала запекать) → ОТКЛОНЕНО:
  (a) вода ИМЕЕТ декорации (visuals-data.js id 13, террейны: ["вода"]) —
  baked-декор под per-tile водой перестал бы рисоваться (в старом
  порядке декор НАД frame воды); (b) перенос в пер-tile pass после
  воды сохраняет точный z-порядок «текстура < декор < лут» (лоут 0.25
  centered — без оверханга; декор ≤0.03 тайла оверханг — §3.10);
  (c) на ≤1080p чанк-pass активен только при z ≲ 14.8 < 24 → декорации
  в нём НЕ рисуются вообще — единый простой код;
- лут — 3 канала мутации (collect building-actions.js:1809, respawn
  main.js:1657, save-restore main.js:1261-1282) → per-tile pass;
- постройки — уже 1 drawImage w×h на anchor (не per-tile) → не трогать.

Результат: p-в-p для ВСЕХ тестовых окон (1280×720: чанк-pass + декорации
никогда не совпадают — z-границы разделены).

### 3.3 Ключ кэша мира — (cx, cy, bucket) + identity-гарды

Зум колёсный непрерывный (×1.2, clamp [4,128], main.js:2274 — НЕ
трогаем, инвариант ввода) с FP-дрейфом (80→96→80.00000000000001).
Ключ: bucket = zoomBucket(zoom) — каноническая сетка 1.2^k; FP-дрейф
не меняет bucket (|ln(1.2)|-шаг >> ulp). Повторное использование entry —
ТРИ гарда: (1) |entry.zoom − zoom| ≤ 1e-6 (точная идентичность зума;
колесо НЕ попадает в 1e-6 от порогов 24/16 — ближайшие 1.2^k: 22.33/
26.79; z=4 clamp и z=4.33 разделяются этим гардом, хотя bucket один);
(2) edgesEqual — биту-в-бит сравнение сохранённых локальных рёбер с
пересчитанными (сетка 16×16 не сместилась ни на 1px — наследие
000215/000228: ни зазоров, ни наложений); (3) readiness (§3.8).
Камера в ключе НЕ входит: локальные рёбра мира камеро-независимы,
позиция блита (anchor) пересчитывается каждый кадр — это и есть
lockstep 000228 (панорама = 0 re-bake'ов, 1 blit-пересчёт/чанк/кадр).
Invalidation по ТЗ: (a) смена зума через bucket → новый ключ;
(b) «смена данных тайла» = readiness (§3.8) — сам мир статичен
(map+save загружены ДО первого кадра main.js:4207-4223; «Начать
заново» = reload).

### 3.4 Подземелье — камерно-якорная сетка СОХРАНЯЕТСЯ (НЕ worldAnchored)

ПЕРЕКЛЮЧЕНИЕ на worldAnchored ОТКЛОНЕНО с доказательством (a2,
проверено численно): cam (4.5, 4.5), zoom 57.6, viewW 800:
камерно-якорный snappedTileRect: round(400 + (1−4.5)·57.6) =
round(198.4) = 198; мир-якорный: round(400 − 4.5·57.6) + round(1·57.6)
= round(140.8) + round(57.6) = 141 + 58 = 199 → сдвиг 1px → ломает
TS-12 (tests/tile-seam.test.js). Камерно-якорные рёбра зависят от
камеры → guard edgesEqual пересчитывает их каждый кадр (34 roundings/
чанк — дёшево); при шаге снап-сетки (глайд камеры, px-скачок) →
целевой re-bake (контент тот же, только координаты — без швов: blit
всегда = точная снап-сетка текущего кадра). При ПОЛНОМ вхождении
сетки во вьюпорт камера ЗАКРЕПЛЕНА (clampCam L286-290: extent·z ≤
viewPx → cam = extent/2) → 0 шагов сетки → 0 re-bake'ов → полный
выигрыш кэша (63×63@z4: 3 969 draw → 16 blit'ов).

### 3.5 Fog (подземелье) — прозрачный bake + снапшот маски

mask==0 (скрыто) → в чанке ПРОЗРАЧНО (skip) — совпадает с сегодняшним
«continue» (фон '#0a0d12' заливается каждый кадр L462-463 — пиксели
одни). В entry — снапшот contentBaked[i] (mask на момент bake > 0 ? 1 : 0).
Guard: contentBaked[i]===0 && mask[i]!==0 → re-bake. Explored-union
000136 монотонен (mask только 0→1/0→2, никогда обратно) → число
re-bake'ов на клетку ≤ 2 за сессию, суммарно ≤ 2·256 на чанк —
ограничено. mask 1→2: re-bake НЕ нужен (контент пола/стены один;
затемнение FOG_DIM 'rgba(10,13,18,0.65)' — ДИНАМИЧЕСКИЙ pass поверх,
после мобов до игрока — не трогается). Город: mask === null → fogGuard
тривиально истинный. Отклонён вариант a1 (per-frame opaque fillRect
по mask==0): +до 3 969 fill'ов/кадр в полностью explored подземелье.

### 3.6 WebGL / buildFrame / frameTiles — НЕ ТРОГАТЬ

XOR 000176 сохранён (§2.4). Цикл frameTiles (131k итераций/кадр в
худшем случае) — оптимизировать отдельно (белая задача, §9). bufferData
каждый кадр — как есть (steady state: 1 пустая + 1 drawArrays(0) —
пин RM-10).

### 3.7 Память — LRU по пикселям, maxPixels = 16 MP на инстанс

a1 предлагала счётчик чанков (768–1024) → ОТКЛОНЕНО: на 4K@z4 чанков
2135 > 1024 → трэш; на 1080p@z4 527 < 768 → мёртвый запас. Пиксели
честная мера: 1080p пик ≈ 2.5 MP, 4K пик ≈ 10 MP (расчёт по
w[15]·h[15]·число чанков при максимальном z активации) — 16 MP не
трэшит до 4K. Вытеснение — pixel-sum с начала Map (LRU-хвост через
get-реinsert). Константа настраиваемая (createChunkCache({maxPixels}))
— 8K+ окна будут трэшить (допустимо; §9). Мировой кэш — ОДИН глобальный
инстанс (мир статичен за сессию — clear-хук НЕ нужен; readyCount-гард
покрывает load-time дыры). Dungeon-кэш — на start() (§2.3).

### 3.8 Readiness — readyCount (мир) / nullCount (подземелье)

Мир: spriteLoader.readyCount() — монотонно неубывает (sprites.js
loader API), есть в реальном лоадере. entry.readyAtBake + nullCount
(число not-ready тайлов в bake). Reuse: nullCount === 0 ||
readyAtBake === spriteLoader.readyCount(). Not-ready тайл в bake =
прозрачное окно → WebGL legacy-квад ниже (XOR 000176, §2.4) — ровно
как текущий skip в 2D pass. Мир создаётся ОДИН раз (loadMapPixels →
createMap ДО rAF, main.js:4207-4223) → после загрузки nullCount→0
навсегда.
Подземелье: тестовые fake-лоадеры могут НЕ ИМЕТЬ readyCount → entry
хранит nullCount (число fillRect-fallback'ов) + списки not-ready путей;
nullCount===0 → стабилен навечно; >0 → перепроверка loader.isReady по
сохранённым путям (≤256, только у чанков с дырами). Реальный браузер:
после загрузки assets nullCount→0.

### 3.9 Деградация — паттерн 000038, без краха

main.js: G.ChunkCache — из load-time снапшота (тег ДО main.js, §5);
отсутствие → console.error ОДИН раз + per-tile путь (стандартное UMD
правило; fires только в гипотетической цепи без chunk-cache.js —
все world-тесты получают его через CHAIN из index.html автоматически).
dungeon-ui.js: live.ChunkCache — ЛЕНИВО (liveGame() в render);
отсутствие ИЛИ nCells ≤ 1024 → тихий guard БЕЗ console.error (установленный
паттерн live-гардов render — городские тесты без sprites.js утверждают
errors.length === 0); console.error — только в случае РЕАЛЬНОЙ
деградации (nCells > 1024 && !live.ChunkCache, один раз на инстанс) —
в существующих тестах недостижимо (все сцены ≤676 клеток). useChunks =
chunkCache && tileEdges && spriteLoader (мир) — тот же стиль, что
tileEdges-guard L3542-3554.

### 3.10 Известное отклонение (документировано, не баг)

При ОДНОВРЕМЕННО (а) чанк-pass активен (nTiles > 8192) И (b) zoom ≥ 24
(декорации рисуются). Окно открывается при площади вьюпорта ≳ 4.5 MP
(16:9): на 4K (3840×2160, 8.3 MP) — при зумах колёса 80·1.2^k = 26.79
(nTiles 12118) и 32.15 (8540); гейт закрывается при z ≳ 32.6. На 1080p
(2.1 MP) и 1440p (3.7 MP) окно ЗАКРЫТО (границы разделены: чанки
z≲16.4 / z≲21.2, декорации z≥24; в тестовых окнах 1280×720 / 800×600 —
НИКОГДА). Между 1440p и 4K (нпр. 3200×1800, 5.8 MP) окно тоже открыто
(z ∈ [24, ≲26.5)) — квалификатор SPEC «до 4K (не включительно)» — по
стандартным 16:9 разрешениям. В этом углу: в старом порядке текстура
соседнего тайла (рисуется позже в row-major) ПОКРЫВАЕТ оверханг
декорации (≤0.05 тайла ≈ 1.3–1.6px; центр x,y ∈ [0.08,0.92], size ≤
0.26); в новом (декор-pass после блитов) оверханг ВИДИМЕН поверх
соседа. Разница — кончик спрайта 1–2px в окне (а)+(б). Тесты это НЕ
покрывают (всё ≤1280×720); SPEC-фраза «результат идентичен» — с
квалификатором «на рабочих разрешениях до 4K (не включительно)» (+
ссылка на §3.10).

## 4. Цифры до/после (зафиксировать baseline в отчёте)

Мир, худший случай 1920×1080 @ z=4 (seed-мир, spawn (0,0)):
- ДО: 482×272 = 131 104 drawImage тайлов/кадр (+ декорации/лут/
  постройки) — baseline (зафиксировать в tasks/result при замерах).
- ПОСЛЕ: 527 блитов чанков (31×17) + 17 993 per-tile воды (13.7%
  тайлов, измерено a2) ≈ 18.6k draw-оп (~7× ниже). Сухопутное окно:
  ~530 draw-оп (~250×).
- 1280×720 @ z=4 (RM-10): 58 604 → 252 блита (21×12) + вода.
Подземелье 63×63 @ z=4 (целиком на экране, камера закреплена):
3 969 → 16 блитов (4×4). Город 26×26 (676 клеток): НИКОГДА не
чанкуется — пер-cell, как сейчас (0 изменений).
Память: пик 1080p ≈ 2.5 MP, 4K ≈ 10 MP < 16 MP (нет вытеснений в
обычной игре).

## 5. index.html + пины index-order

Один новый тег: `<script src="src/chunk-cache.js"></script>` —
POS = ПОСЛЕ `<script src="src/combat-ui.js"></script>` (:1403), ПЕРЕД
`<script src="src/dungeon-ui.js"></script>` (:1404). Почему: main.js
берёт `const G = globalThis.Game` снапшотом на L14 → тег ОБЯЗАТЕЛЕН до
main.js (:1413); dungeon-ui.js — ленивый liveGame() (порядок не
критичен, но единый тег до обоих потребителей). a3 предлагала между
motion.js (:1407) и start-window.js (:1412) — противоречие с её же
перечнем (dungeon-ui.js :1404 < motion.js :1407) → ОТКЛОНЕНО.
CSS — не нужен.
tests/index-order.test.js: 'src/chunk-cache.js' в membership-список +
pos('src/chunk-cache.js') < pos('src/dungeon-ui.js') && pos('src/
chunk-cache.js') < pos('src/main.js').

## 6. Технические (НЕ семантические) правки существующих тестов

Минимальный фронт (следствие решений §3.1/§3.9):
1. tests/global-map-draw.test.js — RM-10 (:838-872): ЕДИНСТВЕННЫЙ
   world-ре-пин. Расширить фильтр tileDraws: (drawImage c,
   c.__asset?.startsWith('assets/tiles/')) → ∪ (drawImage c,
   c instanceof canvas-stub БЕЗ __asset) — т.е. тайлы ∪ чанк-блиты.
   Механика: N_tile = tileDraws при спавне (z=80: 14×9 = 126);
   при z=4 assertion tileDraws(f.draw).length > N_tile формально
   проходит и БЕЗ расширения (per-tile вода — assets/tiles/*,
   ~13.7% × 58 604 ≈ 8k > 126), НО смысл пина («2d-проход рисует
   весь видимый мир») ослабнет — статичные тайлы перестанут
   учитываться → расширение фильтра сохраняет смысл: 252 блита
   (+ вода) > 126. Остальные пины (0 WebGL-вершин, 1 bufferData
   пустой, 1 drawArrays(0), 1 герой) — не меняются.
2. tests/spec-split.test.js — 1 строка: 'world-map.md': 83 → 83+N
   (N = строк нового SPEC-буллета, §8) — ОБЯЗАТЕЛЬНО в том же коммите.
3. tests/chunk-render.test.js (НОВЫЙ) — свой harness: stub
   createElement('canvas') трекит созданные canvases (сегодня в
   harness'ах трекятся только кнопки) — техническое расширение
   harness-образа main-visuals/global-map-draw; z-order между
   канвасами — индекс блита/глобальное время; локальные→глобальные
   координаты: blitX + localEdge_j == worldAnchored global edge
   (целочисленное сложение, §2.2).
4. Dungeon/city-тесты — НОЛЬ правок: все сцены ≤676 клеток < 1024 →
   per-cell путь, байт-в-байт; тихий guard (§3.9) не трогает
   errors.length === 0.
Семантика ВСЕХ пинов (координаты, цвета, счётчики, порядок слоёв)
сохраняется; снап-формулы (snappedTileRect/worldAnchoredTileEdges)
НЕ МЕНЯЮТСЯ — меняется только источник координат для статичного
контента (чанк-канвас вместо per-tile вызовов) с целочисленной
идентичностью (§2.1).

## 7. Красные тесты (до фикса — RED; expectedRedCount = 8)

Сопоставление с a2 R1–R7: R1→CC-2, R2→CC-2, R3→CC-3/CC-4, R4→CC-2
(координаты+слои), R5→CC-2 (вода per-tile, фрейм по wavePhase) +
белый пер-tile путь при z=4, R6→CC-6/CC-7, R7(PERF)→CC-5;
SPEC-wording — CC-8 (по образцу 000259).

tests/chunk-cache.test.js — unit (node, без vm):
 CC-1: require('../src/chunk-cache.js') → RED (MODULE_NOT_FOUND);
       геометрия: worldChunkLocalEdges ≡ worldAnchoredTileEdges
       попиксельно (свойство разделимости: local edge j == global
       edge[16cx+j] − global edge[16cx] для 200k случайных камер/
       зумов, зеркало метода 000228); camAnchoredChunkRect ≡
       snappedTileRect попиксельно (тот же метод); отрицательные
       cx/cy (chunkRange floor); zoomBucket: bucket(80)=0,
       bucket(96)=1, bucket(80.00000000000001)=0, bucket(4) =
       bucket(4.33) (гард 1e-6 разделяет); createChunkCache:
       LRU-вытеснение по maxPixels (3 put'а по 6 MP при maxPixels 16
       MP → 2 entry, evictions=1), get-хит продлевает (не вытесняется),
       clear, stats.
tests/chunk-render.test.js — vm integration (harness по образцу
main-visuals/global-map-draw; мир 1280×720, NOW фиксирован):
 CC-2 (кэш существует + блит из кэша + результат как раньше): z=4
       (колесо вниз до ZOOM_MIN=4: 17 шагов от ZOOM_START=80,
       последний — clamp), тёплый кадр: ≥1 offscreen-canvas
       (зафиксированный createElement) с записанными drawImage; на
       SPRITES-канвасе число drawImage == число видимых чанков 252
       (blit-пин); per-tile drawImage статичных тайлов на
       sprites-канвасе == 0 (только вода/лоут/постройки/мобы);
       КООРДИНАТЫ блита (R4): x == round(viewW/2 − camX·z) +
       round(16cx·z), y — аналог, w/h == суммы локальных рёбер —
       попиксельно == worldAnchored-сетка (проверка по каждому из
       252 чанков); СЛОИ (R4): порядок вызовов на sprites-канвасе —
       блиты чанков → вода → (декор: при z=4 нет) → лут → постройки
       → агро → мобы → герой (структурный пин, глобальное время);
       ВОДА (R5): per-tile drawImage воды ЕСТЬ на sprites-канвасе,
       фрейм следует frameIndex — сдвиг NOW → другой WATER-фрейм
       (биту-в-бит со старым путём; в чанк-канвасах воды НЕТ).
 CC-3 (reuse + 0 re-bake): 2-й кадр с тем же cam/zoom → 0 новых bake
       (число записей на чанк-канвасах не растёт), блиты те же;
       z=80 (ZOOM_START) → nTiles = (1280/80+2)·(720/80+2) =
       18·11 = 198 < 8192 → per-tile путь, чанков нет — guard гейта.
 CC-4 (invalidation по зуму): колесо до z=4 (bucket −16) → warm
       (первый кадр — 252 bake); 1 up (z≈4.8, bucket −15) → другой
       bucket → новые ключи → ~190 bake; 1 down (z≈4.000000000000001,
       bucket −16) → entry из шага «warm» ЕЩЁ В КЭШЕ (16 MP, суммарно
       ~2.2 MP — вытеснения нет) → 0 re-bake, 252 blit — пин
       SURVIVAL entry + гарда 1e-6 (|z−4| ≤ 1e-6) + edgesEqual.
       (bucket(4) = round(ln(0.05)/ln 1.2) = −16; bucket(4.8) =
       round(ln(0.06)/ln 1.2) = −15 — проверено численно. Примечание:
       a2 ожидала «возврат → повторный re-bake» — неверно при 16 MP
       (нет вытеснения); тест пиныт фактическое поведение.)
 CC-5 (PERF-пин, отдельный sandbox 1920×1080, z=4, тёплый кэш):
       total drawImage (sprites-канвас + чанк-блиты) ≤
       waterTiles + 527 + 250 И < 40 000 абсолютно. Baseline ДО
       фикса = 131 104+ → RED. Бюджет СТРУКТУРНЫЙ (a3 предлагала
       2000 — ОТКЛОНЕНО: одна вода ≈ 17 993 per-tile draw при
       1920×1080 z=4).
 CC-6 (подземелье): 63×63 @ z=4 (камера закреплена): блитов ==
       ceil(63/16)² == 16; floor/wall per-cell draw на основном
       канвасе == 0; fog: explored 0→1 (игрок прошёл) → targeted
       re-bake ТОЛЬКО затронутых чанков (≤4), остальные entry
       переиспользуются; cam-anchored сетка: координаты блитов +
       локальные рёбра ≡ snappedTileRect попиксельно (TS-10/11/12
       сохраняются по смыслу — формулы НЕ меняются).
 CC-7 (город-интеграция): 26×26 @ z=20 (800×600): 676 клеток ≤ 1024
       → per-cell путь (блитов 0) — guard-пин «город не чанкуется»;
       9×9/25×25 сцены — как в dungeon-ui.test.js (нетронуто).
 CC-8 (SPEC-wording): tests/spec-000263-wording.test.js (НОВЫЙ,
       паттерн spec-*wording*, norm() + includes/regex,
       expectedRedCount по образцу 000259): фразы §8.
Бит-в-бит (обязан сохраниться, уже зелёные): tileAt, RNG, сейвы,
input/камера, tile-seam (TS-1..14), tile-pulse (PW-1..3),
global-map-draw (RM-1..11 — RM-10 через технический ре-пин §6),
main-visuals, main-loot, dungeon-ui (80), wall-autotile,
dungeon-vision, city-screen, svg. node --test tests/ — полный
зелёный (160k tileAt-перф может фликать под нагрузкой — перезапуск
файла одиночно, записать в отчёт).

## 8. SPEC — spec/world-map.md, новый буллет «Чанковый рендер (000263)»

Место: рядом с буллетом «Рендер подземелья (000258)» (один markdown-
буллет, как 000228/000258; N строк → ре-пин SPEC_FILE_LINES §6).
Фразы (пины CC-8): «Чанковый рендер», «чанки 16×16», «offscreen»
(или «офскрин»/«буфер чанка»), «кэш чанков» (+ «LRU»), «только
видимые чанки», «1 drawImage на чанк», «вода — по тайлу» (анимация
не запекается), «инвалидация» + («зум» / «данные тайла» / «explored»),
«динамические слои» поверх (мобы/игрок/эффекты), «результат идентичен
предыдущему рендеру» (квалификатор §3.10), «города не чанкуются
(≤ 1024 клеток)».
CHANGELOG: ДА — рендер пиксель-в-пиксель, но ИГРОКУ ВИДИМО (плавность
на низком зуме) → bullet в существующий раздел ## 2026-10-24 /
### Графика, формат как у соседних (жирный лид-ин). ОТДЕЛЬНЫЙ коммит
(не в коммите задачи), дата = день мержа (2026-10-24).

## 9. Будущее (НЕ в этой задаче — записать, не делать)

- Цикл frameTiles/buildFrame (main.js L3296-3385): 131k итераций
  ДАННЫХ/кадр в худшем случае — отдельная оптимизация (кэш range,
  dirty-проверка).
- FOG_DIM-pass (dungeon-ui L878-889) на низком зуме: до 3 969
  fillRect'ов mask==1/кадр — кандидат на чанк/viewport-culling.
- CHUNK maxPixels = 16 MP — константа; при 8K+ окнах трэш (re-bake'и
  512 draw-опов, однократно) — допустимо; пересмотр при жалобах.
- Подпиксельный угол §3.10 (чанк-гейт + z≥24; на стандартных 16:9 —
  4K+) — если станет актуальным:
  bake декораций в чанк с padding 0.04 тайла + row-major
  interleave (сложнее; сейчас не нужно).

## 10. Что добавлено/перенесено, контракты и границы

ДОБАВЛЕНО: src/chunk-cache.js (новый UMD-модуль, ~150-200 строк);
чанк-ветвь в drawSprites (main.js, pass 1 → чанки+вода+декор+лоут);
чанк-ветвь в floor/wall-pass (dungeon-ui.js); 3 новых test-файла;
SPEC-буллет; тег index.html.
ПЕРЕНЕСЕНО (не переписано): тела текстуры/декора/лута из pass 1 — в
отдельные циклы (мир); тело floor/wall-pass — в bake (подземелье).
КОНТРАКТЫ (не нарушить): XOR 000176 (WebGL квады только not-ready);
снап-сетки 000215/000228 (формулы — в map.js, НЕ трогать); explored-
union 000136 (монотонность); z-порядок слоёв (мир: тайл<декор<лоут<
постройка<агро<моб<герой; подземелье: пол→постройки→стены→маркеры→
сундуки→залежи→мобы→FOG_DIM→игрок); UMD-правила 000038.
ГРАНИЦЫ (не смешивать): 000258 (автотайлинг — данные/таблицы, не
рендер-слои), 000259 (layout городов), 000264 (рендер зданий города —
параллельная волна, правит dungeon-ui.js render() ДРУГИЙ участок —
постройки-слой L638-656; merge station: rebase + полный node --test
ДО мержа), 000247 (зона оверлея).

## 11. Ленивые ссылки и guards

- main.js: G.ChunkCache — из load-time снапшота (тег до main.js);
  useChunks = G.ChunkCache && tileEdges && spriteLoader &&
  nTiles > 8192; отсутствие ChunkCache → console.error 1× + per-tile.
- dungeon-ui.js: live.ChunkCache — liveGame() в render (НЕ при
  загрузке — UMD-ловушка 000038, таблица/модуль появляются ПОСЛЕ);
  useChunks = live.ChunkCache && nCells > 1024; тихий guard при
  отсутствии (паттерн live-гардов render — wallTable/wallTileIndexFn/
  snappedTileRect L499-511), console.error только при РЕАЛЬНОЙ
  деградации (>1024 && !module, 1× на инстанс).
- spriteLoader.readyCount — мир (есть в API, монотонен); dungeon —
  nullCount + isReady-перепроверка (fake-лоадеры без readyCount).
- __game.state.chunkCache — read-only зеркало stats() для отладки.

## 12. Что важно будущим задачам

- 000264 (здания города) правит dungeon-ui.js render() — чанк-pass и
  постройки-слой — РАЗНЫЕ участки (постройки НИКОГДА не в чанк);
  conflict в render() вероятен → ручной merge + полный тест.
- Любой будущий мультикадровый terrain (как вода) → НЕ в чанк,
  per-tile pass (иначе заморозка анимации) — паттерн §3.2.
- Новые mутационные данные тайлов (кроме fog/explored) → либо в
  динамический pass, либо новый guard в key/invalidation (сейчас мир
  статичен за сессию).
- frameTiles-цикл — белая оптимизация (§9); чанки НЕ уменьшают
  frameTiles (он — данные, не пиксели).
- SPEC_FILE_LINES: world-map.md — ре-пин в каждом SPEC-коммите.

## 13. Подводные камни

- FP-дрейф зума: bucket НЕ гарантирует идентичность (80.00000000000001
  vs 80 — тот же bucket) → ОБЯЗАТЕЛЕН гард 1e-6 (без него — микросдвиг
  сетки на < 1px → швы).
- worldAnchored в подземельи — 1px сдвиг (доказательство §3.4, TS-12) —
  не «обобщать» сетки.
- Чанк на границе viewport: bake ВСЕГДА полный 16×16 (даже если 1
  тайл виден) — ограничение: ≤1 чанк-маржа по оси; НЕ пытаться
  partial-bake (сложность без выигрыша — крайние чанки ≤ 2·31/кадр).
- drawImage offscreen canvas — БЕЗ scale (bake на текущем зуме,
  canvas.width == целевая ширина) → no smoothing артефакты; при
  добавлении scale в future — imageSmoothingEnabled учитывать.
- Лут в постройке — skip-условие (LM10/000042) — переносится в loot-
  pass БЕЗ ИЗМЕНЕНИЙ (не «оптимизировать» — ломает пин).
- explored — Set в closure start(); render без start (тесты) —
  explored === null → mask === null → fogGuard тривиален; НЕ
  лениво-инициализировать explored в chunk-pass (изменит пин
  explored-union).
- 16 MP на dungeon-инстанс × несколько одновременных подземелий — каждый
  start() свой кэш (close() → clear() — память не течёт).
- node --test: один полный запуск за раз в worktree (память
  VM-harness'ов); 160k tileAt-перф фликит под нагрузкой — одиночный
  перезапуск, запись в отчёт.

## 14. Разбивка и план файлов

ОДНА задача (связное изменение; фронт ре-пинов минимален — RM-10 +
SPEC_FILE_LINES; dungeon-изменение локализовано в floor-pass,
дисjoint от 000264). a1 рекомендовала .1/.2 — ОТКЛОНЕНО: разделение
миром/подземельем усложнит merge 000264 (двойной конфликт в
dungeon-ui.js) без выигрыша (dungeon-ветвь ~80-100 строк).

План по файлам (для станции реализации):
1. src/chunk-cache.js — НОВЫЙ, ~150-200 строк (UMD; §2.1 API;
   JSDoc-зеркала гардов snappedTileEdges).
2. index.html — +1 строка (тег, §5).
3. src/main.js — drawSprites pass 1: +~70-90 строк (гейт, чанк-pass
   bake/guard/blit, вынос воды/декора/лута в отдельные циклы,
   __game.state.chunkCache; старый цикл — ветка !useChunks).
4. src/dungeon-ui.js — floor/wall-pass: +~80-100 строк (гейт,
   чанк-pass, cache в start()/close(); старый цикл — ветка
   !useChunks).
5. tests/chunk-cache.test.js — НОВЫЙ, ~120-180 строк (CC-1).
6. tests/chunk-render.test.js — НОВЫЙ, ~400-600 строк
   (CC-2..CC-7; harness с canvas-tracking; CC-5 — sandbox 1920×1080).
7. tests/spec-000263-wording.test.js — НОВЫЙ, ~60-90 строк (CC-8).
8. spec/world-map.md — +N строк (буллет §8).
9. tests/spec-split.test.js — 1 строка (83 → 83+N).
10. tests/global-map-draw.test.js — RM-10 фильтр, ~5-10 строк (§6.1).
11. tests/index-order.test.js — membership + 2 order-пина, ~4-6 строк.
12. memory/000263-chunked-render.md — ЭТОТ файл.
13. CHANGELOG.md — +1 bullet (§8) — ОТДЕЛЬНЫЙ коммит.
14. tasks/pending/000263.md → tasks/done/ + tasks/result/000263.md
    (станция отчёта/мержа).

## 15. Эратум реализации (2026-10-25)

1. tests/chunk-cache.test.js (L139/L155, RED-коммит) — ТЕХНИЧЕСКИЙ
   опечаточный фикс на зелёной стадии: вызовы
   MAP.worldAnchoredTileEdges / MAP.snappedTileEdges получили y-границы
   `0, 1` вместо `16*cy, 16*cy+16` → сетка давала 3 y-края, а циклы
   ассертят 17 (j=0..16) → gw.y[3..16] === undefined →
   assert.equal(real, NaN) бросал исключение — тест НЕ МОГ стать
   зелёным как закоммичен (semantics строгих assert). Пиксельный цикл
   (L183) уже использовал правильные границы — авторский замысел
   подтверждён; правка только в границах вызова, ассерты не тронуты.
2. UMD-гнездование: browser-ветка —
   `root.Game = Object.assign({}, root.Game, { ChunkCache: factory() })`
   (паттерн combat-scale.js). Плоский spread `Object.assign({}, root.Game,
   factory())` раскладывает exports в Game.chunkRange/... — у ПОТРЕБИТЕЛЕЙ
   G.ChunkCache === undefined (снапшот main.js / live dungeon-ui.js) и
   вся интеграция молча деградирует. Поймано на первом интеграционном
   прогоне (CC-2..CC-6 красные с console.error-следом).
3. chunkFogOk(entry, mask, d, cx, cy) проверяет ТОЛЬКО КЛЕТКИ СОБСТВЕННОГО
   ДИАПАЗОНА чанка (wx+jx, wy+jy в границах d.width/d.height).
   contentBaked — массив на ВСЮ сетку w·h, но bake помечает только 256
   клеток чанка; целосеточный скан делал re-bake ВСЕХ чанков КАЖДЫЙ кадр
   (любой чанк без видимых клеток «имеет» cb[i]===0 && mask[i]!==0 на
   чужих клетках). Поймано на CC-6: 16 re-bake на тёплом кадре (33
   createElement-канваса вместо 17).
4. Мир (main.js pass 1): ИНЛАЙН-гейт статических отрисовок — внутри
   СТАРОГО per-tile цикла строка
   `if (!(useChunks && !isWater))` пропускает drawImage НЕ-ВОДНЫХ
   тайлов; вода/декор/лут рисуются в СВОИХ позициях цикла без изменений.
   Отклонение от скетча §2.2 («отдельные циклы воды/визуалов/лута»):
   инлайн сохраняет старый interleave z-порядка попиксельно (порядок
   вызовов drawImage по тайлам идентичен старому пути за вычетом
   пропущенных статик); CC-2 z-пин (блиты → вода → постройки → агро →
   мобы → герой) держится.
5. tests/global-map-draw.test.js — ИЗМЕНЕНИЙ НЕТ (пункт 10 плана §14
   консервативен): RM-10 на z=4 ассертит tileDraws(f.draw) > N_tile
   (198) — per-tile вода (10139 drawImage assets/tiles/water_*) сама
   по себе больше порога; статичные не-водные текстуры в чанковом
   режиме = 0, но tileDraws считает ВСЁ assets/tiles/* (вода входит).
6. Скоуп деградационных console.error (один раз на инстанс,
   chunkErrLogged): main.js — только когда nTiles > 8192 И модуля нет
   (сцены с малым зумом не логируют); dungeon-ui.js — только
   nCells > 1024 && !isCity && !live.ChunkCache. Существующие тесты
   (все ≤ 8192 тайлов / ≤ 676 клеток) лог не видят.
7. Позиция тега index.html: ПОСЛЕ combat-ui.js, ДО dungeon-ui.js
   (оба потребителя + main.js — после; пины tests/index-order.test.js:
   membership + pos < dungeon-ui && pos < main).

## 16. Правки по итогам ревью (2026-10-25)

7 findings трёх ревьюеров (все minor; 1 процессный — закрыт без
действий). Коммит «Задача 000263: правки по итогам ревью»:

1. Wording SPEC про инвалидацию (spec/world-map.md): «бакет» — КЛЮЧ
   кэша, а не гранулярность переиспользования — код re-bake'ит при
   ЛЮБОМ смене зума (гард 1e-6, чанк-ветвь drawSprites). Документ
   приведён к контракту: «ключ кэша чанка — канонический бакет зума
   1.2^k от ZOOM_START; переиспользование запечённого канваса — только
   при ТОЧНО совпавшем зуме (гард 1e-6), ЛЮБОЕ изменение зума →
   re-bake». CC-8 (wording-тест) бакетную гранулярность не пинит.
2. Квалификатор «до 4K включительно» лжен НА РОВНО 4K: окно §3.10
   открывается при 3840×2160 (nTiles(26.79) = 12118 и nTiles(32.15) =
   8540 > 8192 при z ≥ 24). SPEC/CHANGELOG/memory согласованы: «до 4K
   (не включительно)» + явная ссылка на §3.10; окно §3.10 пересчитано
   (претензия «≥4K» уточнена: окно открывается и НИЖЕ 4K на нестандартных
   16:9 с площадью ≳ 4.5 MP, нпр. 3200×1800 при z ∈ [24, ≲26.5);
   граница 1080p — z≲16.4, а не 14.8; оверханг — ≤0.05 тайла ≈ 1.3–1.6px
   (центр x,y ∈ [0.08,0.92], size ≤ 0.26), а не ≤0.03). Re-pin
   SPEC_FILE_LINES: world-map.md 100 → 105.
3. Гейт мира (src/main.js): useChunks дополнительно требует
   typeof G.worldAnchoredTileEdges === 'function' — геометрия чанков
   (worldChunkLocalEdges/worldChunkBlitRect) мир-якорная, а legacy-
   фолбэк snappedTileEdges камерно-якорный: при срабатывании фолбэка
   (урезанный map.js) per-tile вода и запечённые соседи рассинхронизировались
   бы (round(A+B) vs round(A)+round(B), шов ≤1px). На master
   недостижимо (map.js экспортирует worldAnchoredTileEdges с 000228) —
   дефенсивная правка, поведение в текущих конфигурациях не меняется
   (условие уже истинно во всех тестовых цепочках).
4. Readiness re-bake закреплён тестом: CC-9 (tests/chunk-render.test.js)
   — мир (readyCount-гард: bake с дырой (nullCount > 0) → 0 re-bake,
   пока лоадер не догрузился → после готовности re-bake ТОЛЬКО чанков с
   дырой → warm-кадр 0 re-bake) и подземелье (notReadyPaths через
   loader.isReady: тот же паттерн; re-bake — ТОЛЬКО 4 центральных чанка
   с дырой, остальные 12 переиспользуются — не глобальный сброс кэша).
5. Статус-строка шапки обновлена (было «ДИЗАЙН» — код уже закоммичен).
6. Опечатка RED-коммита (CC-1, y-границы 0,1 вместо 16*cy, 16*cy+16) —
   закрыт без действий: исправлено технически в 00a28ea и раскрыто
   в §15.1.

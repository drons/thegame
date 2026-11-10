# 000339 — пропуск legacy XOR-гейта 000176 в steady state (RENDER-OPTIMIZE §5A)

## Что сделано

Одна правка в `src/main.js` (`buildFrame` → `legacyTileVerts`):

- в `buildFrame` после вычисления `range` считается ОДНО значение на кадр:
  `const gateSkip = !!spriteLoader && spriteLoader.totalCount() > 0 && spriteLoader.readyCount() === spriteLoader.totalCount();`
- передаётся 6-м аргументом `skipBase` в `legacyTileVerts` (обе ветки — hit
  по frameTiles и rebuild-обход range);
- в `legacyTileVerts` тело БАЗОВОГО ТАЙЛОВОГО КВАДА обёрнуто
  `if (!skipBase && !tileFrameImg(t, now))` — при skip НЕ выполняются ни
  `tileFrameImg` (G.tileFrames + frameIndex + image), ни `map.brightness`
  (единственный вызов brightness во всём main.js был именно здесь).

Маркерные ветки (`t.hasBuilding` → buildingRec/buildingAsset, `t.hasMobGroup`
→ groupVisible-паритет + mobFrameImg), ромб героя и `gl.bufferData(
new Float32Array(verts), DYNAMIC_DRAW)` — БЕЗ ИЗМЕНЕНИЙ.

## ГЛАВНОЕ ОГРАНИЧЕНИЕ: пропускать можно ТОЛЬКО базовый квад

Буквальное «пропустить цикл гейта целиком» из RENDER-OPTIMIZE §5A/ТЗ
НЕВЫПОЛНИМО: XOR-гейт рисует маркеры и при ВСЕХ ready, если элемент не
резолвится в спрайт — пин FT-6 (tests/frame-tiles-cache-000276.test.js):
`actions.spawnBuildingTile` на тайле без записи в сид-реестре → buildingRec
даёт rec, buildingAsset не находит кадр → на hit-кадре при ready===total
РОВНО 6 вершин BUILDING_COLOR и totalVerts===6. Пропуск всего цикла убивает
маркер (мутация M3 — ЕДИНСТВЕННЫЙ красный FT-6, 60/59/1; T2 зелёный: при
частичной загрузке gateSkip ложен, мутация наблюдаема только в steady).
Цикл по frameTiles структурно
СОХРАНЁН (нужен и для маркеров, и для наполнения frameTiles на miss —
FT-7/000276-контракт; drawSprites/bake читают тот же массив).

## Оба guard'а условия обязательны

- `!!spriteLoader` — цепочка без sprites.js (RM-8): spriteLoader null →
  без guard'а TypeError в buildFrame → смерть rAF-цикла (мутация M5 —
  красные RM-8).
- `totalCount() > 0` — гипотетический пустой каталог (allAssetPaths = []):
  readyCount()===totalCount()===0 было бы ложно-истинным равенством и
  стёрло весь legacy-слой (до правки сцена рисовалась полностью). Харнесом
  недостижимо (reject помечает failed, entries.size не уменьшает) —
  защищено условием, отдельной мутацией НЕ проверяется.

## Детерминизм / отсутствие пофликерности

queue — единственный, на старте (`for (const p of G.allAssetPaths())
spriteLoader.queue(p)`); записи loading→ready|failed однократно, назад нет
(memory/000263-chunked-render.md §3.8) → readyCount монотонен при
фиксированном totalCount → равенство, выполнившись, не нарушается.
Хотя бы один failed-ассет (любой) навсегда держит ready<total → полный
путь гейта (фолбэк 000011 не «выключается»; RM-4/RM-5/RM-8/RM-9/MV-C7/
MV-C8 — частичная загрузка через reject-предикат Image-стаба).

## Наблюдаемость в тесте (без правки продакшн-кода)

tests/render-steady-gate-skip-000339.test.js — копия vm-харнеса
global-map-draw.test.js; spy-обёртки ТОЛЬКО в харнесе:
- `Game.tileFrames` — ЕДИНСТВЕННЫЙ читатель этого свойства — селектор
  `tileFrameImg` (main.js читает `G.tileFrames` в момент вызова → обёртку
  можно навесить в любой момент). Дельта за кадр: ДО правки 2N (цикл гейта
  + спрайт-проход), ПОСЛЕ N (только спрайт-проход), N = |frameTiles|
  (спавн-харнес 1280×720@80 → N=198, дельта 396 → 198). Порог T1 —
  1.5×N (двукратный запас; bakeWorldChunk на спавн-зуме выключен —
  N ≤ 8192, CC-3).
- `map.brightness` — единственный вызов во всём main.js (тело базового
  квада); обёртка навешивается через подмену `Game.createMap` ДО промывки
  микротасков (main.js создаёт мир асинхронно в `loadMapPixels().then`).

## Подводный камень: ±0 в WebGL-буфере (НЕ регресс 000339)

hit-ветка гейта берёт координаты из `t.x/t.y` (кэшированный тайл-объект;
для спавн-тайла (0,0) первый создатель передал −0 — знак из вычисленного
диапазона), rebuild-ветка — целые цикла (`0`) → SameValue-различие
`Object.is(0,−0)` в Float32 при ИДЕНТИЧНОЙ геометрии (−0≡0 после
орто-матрицы). Существующее поведение мастера (T5 сверяет буферы после
нормализации нуля `v === 0 ? 0 : v`). Не путать с регрессом: визуально и
численно (==) нули совпадают.

## Нумерация RM (несоответствие текста задачи)

Текст задачи/RENDER-OPTIMIZE говорит «пин RM-6 = bufferData каждый кадр».
ФАКТ: в tests/global-map-draw.test.js RM-6 — «1 rAF + 1 clearRect»;
фактический пин «ровно 1 bufferData + 1 drawArrays count=0» — RM-10
(ZOOM_MIN). Ре-пин RM-6 НЕ делался; новый T4 дублирует контракт bufferData.

## Матрица мутаций (поверх единого коммита, git restore после каждой)

TAP: /tmp/000339-m<N>.tap (см. tasks/result/000339.md — фактические красные).

Набор каждого прогона: 5 файлов (новый + chunk-render +
frame-tiles-cache-000276 + global-map-draw + main-visuals), 60 тестов.

- M1 инверсия равенства (`!==`) — 6 красных (60/54/6): T1 (steady не
  пропущен, 2N), T2 (partial пропущен → 0 brightness/квадов), T4
  (частичная ветка), T5, RM-4, RM-9. Зелёные RM-3/RM-10/FT-6 (steady-
  вывод не меняется).
- M2 безусловный `gateSkip = true` — 6 красных (60/54/6): T2, T4, T5,
  RM-4, RM-8 (цепочка без sprites.js теряет legacy-слой), RM-9.
  T1/FT-6 зелёные (steady/маркеры целы).
- M3 пропуск ВСЕГО цикла при gateSkip (буквальное чтение ТЗ) —
  ЕДИНСТВЕННЫЙ красный FT-6 (маркер 6→0), 60/59/1; T2 зелёный (при
  частичной gateSkip ложен) — доказательство области «только базовый
  квад» именно пина FT-6.
- M4 удаление `gl.bufferData(...)` из buildFrame — 15 красных (60/45/15):
  T2, T4, T5, FT-6, RM-4, RM-5, RM-8, RM-9, RM-10, RM-BA-2/4/6,
  RM-CAMP-2, MV-C7/C8 — все читатели буфера; T4 живой пин RM-6/RM-10.
- M5 снятие `!!spriteLoader` — ЕДИНСТВЕННЫЙ красный RM-8 (TypeError в
  buildFrame при цепочке без sprites.js), 60/59/1 — живой null-guard.

## Носители и приёмка

tests/global-map-draw / main-visuals / frame-tiles-cache-000276 /
chunk-render + sprites + index-order + sync-all + assets-schemas +
canvas-resize-000289 + camp-map-e2e — зелёные БЕЗ ПРАВОК (попиксельный
эталон legacy-слоя). CHANGELOG не тронут (визуал бит-в-бит). 0-diff вне
SCOPE: src/map.js (000341), spec/, index.html, save.js, ассеты.

Порядок RENDER-OPTIMIZE §7: B (000340, subset-списки) — СТРОГО после мержа
этой задачи (тот же rebuild-регион buildFrame); C (000341) — src/map.js,
независима.

# 000049: фоновые SVG поля боя (подзадача 000030, направление 3)

Статус: выполнено (код + ассеты + тесты; коммит — оркестратор).

## Состав 11 ассетов (assets/combat/bg/, каталог новый)

| файл | контекст | палитра (top → bottom) |
|---|---|---|
| sand.svg | TERRAIN.SAND | #cabf94 → #b0a06d |
| grass.svg | TERRAIN.GRASS | #5c9145 → #45713a |
| forest.svg | TERRAIN.FOREST | #35713c → #234e28 |
| hill.svg | TERRAIN.HILL | #7d7852 → #615c3d |
| swamp.svg | TERRAIN.SWAMP | #556a44 → #3c4f30 |
| cave.svg | DUNGEON_TYPES.CAVE | #6e655a → #4b443b |
| crypt.svg | DUNGEON_TYPES.CRYPT | #5a6170 → #3a404e |
| ruins.svg | DUNGEON_TYPES.RUINS | #7a6f60 → #544c41 |
| drowned.svg | DUNGEON_TYPES.DROWNED | #2a5494 → #16295c |
| abyss.svg | DUNGEON_TYPES.ABYSS | #171221 → #0a0713 |
| plain.svg | фолбэк (неизвестный/нет лоадера) | #141922 → #0a0d12 (≈ #0d1117) |

Вода/глубокая вода/горы — непроходимы, боя там нет → plain.svg (осознанный
фолбэк зафиксирован тестом).

## Ключевые решения

* **Стиль/палитра** — единый, как assets/tiles/*.svg: вертикальный
  linearGradient из двух близких тонов (базовые тона — TILE_BASE в
  sprites.js), мягкая текстура — 16 пятен света/тени через radialGradient
  (fade до opacity 0), мелкие детали со stroke-linecap round (травинки,
  камешки, волны-дюны, сосульки, кости, руны, столбы, тростник, кувшинки,
  кроны, грибы, туман, свечения). Единая виньетка (radialGradient, краям
  −30%): центр светлее — зона юнитов чище.
* **Размер** — viewBox 0 0 336 336 = 7×7×CELL(48), боевой canvas в device
  px, CSS-апскейла нет (.combat-box canvas без width/height). «Рисовать с
  запасом 768×768» из файла задачи НЕ применено: для векторного SVG
  бессмысленно — браузер растеризует SVG под размер drawImage, а canvas
  масштабируется целиком. Отклонение зафиксировано в tasks/result/000049.md.
* **Период текстуры** — тесселяций с периодом НЕТ (мягкая нетекстура) →
  конфликта/интерференции с сеткой 48 px нет. Жёсткие детали — только на
  внешнем кольце (1 клетка по периметру), центр 3×3 клеток — без деталей.
* **Препятствия в фон НЕ запекаются** — их рисует 000050 отдельными
  спрайтами поверх (слой между сеткой и юнитами).
* **Генератор** — scripts/gen-combat-bg.js (npm run gen:combatbg):
  mulberry32 с фиксированным сидом на фон, стабильный порядок элементов,
  округление до 0.1 px, без дат → повторный запуск byte-identical
  (проверено: второй запуск — git diff пуст; детерминизм + viewBox
  закрывают тесты). Сгенерированные SVG — статичные ассеты в git (игра
  работает по file://).
* **combatBackground(bg)** (src/sprites.js) — чистая функция:
  `{terrain:<TERRAIN>}` → свой файл; иначе `{dungeon:<DUNGEON_TYPES>}` →
  свой файл; `{}`/null/неизвестный/непроходимый → plain.svg. terrain
  приоритетнее dungeon (зафиксировано тестом).
* **DUNGEON_TYPES — литеральное зеркало** `COMBAT_BG_DUNGEON = {0:'cave',
  …4:'abyss'}` в sprites.js, БЕЗ зависимости от dungeon.js: vm-песочница
  tests/combat-ui.test.js не грузит dungeon.js (Game.DUNGEON_TYPES там
  undefined), а require в node-ветке UMD дал бы рассинхрон node/браузер
  веток. Равенство зеркала с оригиналом проверяет тест
  (tests/sprites.test.js: ключи = значения DUNGEON_TYPES, имена файлов
  совпадают).
* **allAssetPaths()** — +11 путей (из двух карт + фолбэк); main.js
  грузит их тем же spriteLoader (queue по allAssetPaths).
* **Передача контекста** (src/main.js, 3 места — все):
  maybeStartCombat: `terrain: t.terrain, spriteLoader`;
  startDungeonCombat: `dungeonType: ds.dg.type, spriteLoader`;
  actions.startCombat (отладочный): `terrain: map ? map.tileAt(...).terrain
  : undefined, spriteLoader`. Ядро combat.js НЕ тронут.
* **Отрисовка** (src/combat-ui.js): порядок слоёв — 1) сплошной #0d1117
  (ВСЕГДА, база + фолбэк), 2) drawImage(фон, 0,0, w,h) — ищется в
  spriteLoader КАЖДЫЙ render (Map.get дёшев): фон, загрузившийся после
  старта, подхватывается без рестарта; 3) сетка; 4) мобы → герой →
  миниполоса (без изменений). bgPath считается ОДИН раз в startCombat;
  spriteLoader может быть null (нет s2) — null-guard; G.combatBackground
  — guard (УМД-ловушка «G снимается один раз», паттерн hpBarColor из
  000038): без sprites.js → bgPath=null → сплошной фон, рендер не падает.
* **Цвет сетки** — был #2a3140 (сплошной). Стал `rgba(255,255,255,0.18)`:
  тёмная полупрозрачная (план предлагал rgba(18,22,30,0.55)) пропала бы
  на тёмных фонах (plain/abyss) — как раз полюс, который план выделял;
  светлая линия читается и на sand (самый светлый), и на abyss (самый
  тёмный), и на фолбэке #0d1117 даёт ≈ старый вид (57,60,65 против
  #2a3140 = 42,49,64). Решение «на глаз», расчёт в tasks/result/000049.md.
* **Порядок загрузки** — index.html НЕ менялся: sprites.js (318) уже до
  combat-ui.js (319), закреплено tests/index-order.test.js; G.combatBackground
  есть в момент загрузки combat-ui.js.

## Тесты (npm test — 425 зелёных; база 415 + 10 новых)

* tests/sprites.test.js: 5 террейнов → свои файлы; 5 DUNGEON_TYPES →
  свои файлы + сверка литерального зеркала с dungeon.js; фолбэки
  ({}, null, undefined, 99, −1, вода/глубокая вода/горы, лишнее поле) →
  plain.svg + чистота + приоритет terrain; allAssetPaths содержит 11
  путей и файлы существуют; генератор детерминирован и даёт 11 ключей.
* tests/combat-ui.test.js: стаб canvas-2d теперь записывает вызовы методов
  в canvas.drawCalls; 5 тестов — фон первым слоем (после базового fillRect,
  до сетки), dungeonType → abyss.svg, подхват загруженного после старта
  фона, без sprites.js terrain не ломает бой (drawImage не вызывается),
  spriteLoader=null — null-guard.

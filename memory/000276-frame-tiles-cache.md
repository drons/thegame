# 000276: frameTiles/buildFrame — кэш видимого range (белая оптимизация 000263 §9)

Статус: ЗАВЕРШЕНО (реализация в коммите task/000276; замер ПОСЛЕ и
финальный бюджет — §5; технические правки RED-тестов — §12;
отчёт — tasks/result/000276.md; финализация: задача перенесена
pending→done, свежий полный прогон сьута — tasks/result/000276.md).
Задача: tasks/done/000276.md. Ветка task/000276, база master d8c4aa4.
Анализ: /tmp/thegame-wf-000276/a1-domain.md, a2-arch.md, a3-tests.md —
все открытые вопросы решены ниже (§3); расхождения между анализами —
примечания «почему» в каждом решении. HEAD-координаты сверены
пункт-в-пункт (дрейфа нет — a1 §6.4).

Тип: рефакторинг БЕЗ смены поведения (рендер БИТ-В-БИТ, ноль новых
RNG, сейвы/ HUD/ [E]-гарды — без изменений).

## 1. ТЗ / цель / шов

Шов дословно: memory/000263-chunked-render.md §9 — «Цикл
frameTiles/buildFrame (main.js L3296-3385): 131k итераций ДАННЫХ/кадр
в худшем случае — отдельная оптимизация (кэш range, dirty-проверка)».
frameTiles — ДАННЫЕ (список объектов тайлов), не пиксели: чанки 000263
его НЕ уменьшают (000263:536-537). HEAD-факты (a1 §2, сверено):
декларация main.js:3293 (`const frameTiles = []`, замыкание IIFE);
buildFrame :3468 (сброс :3471, range :3484 `G.visibleTileRange` —
чистая, map.js:1184, целочисленные границы; цикл :3485-3488
`tileCache.tile(tx,ty)` + push — ПЕРЕСБОРКА КАЖДЫЙ КАДР; legacy-гейт
:3489-3530 в том же цикле; герой-ромб :3534-3549; gl-вызовы
:3551-3555); потребители — ровно 4 обхода drawSprites
(:3707/:3761/:3809/:3839) — grep-исчерпывающе.

Выходной клаус (ТЗ п.4): замер ДО (§5) многократно ВЫШЕ любого
бюджета → клаус «закрыть отчётом без кода» НЕ СРАБАТЫВАЕТ —
реализация идёт.

## 2. Архитектура (решения)

НОВОГО МОДУЛЯ НЕТ (ТЗ-файл-план: src/main.js + тест + memory).
Кэш — в замыкании main.js рядом с frameTiles: UMD-паттерн неприменим
(нужен доступ к frameTiles/tileCache/canvas/zoom — только замыкание).

### 2.1 Ключ (решение D1)

`key = (range.x0, range.y0, range.x1, range.y1, worldVersion,
exploredVersion)` — «простой robust-вариант» ТЗ п.2 БУКВАЛЬНО,
6 целых.

* range-четвёрка — точная функция (cam.x, cam.y, canvas.width,
  canvas.height, zoom) через чистую `G.visibleTileRange` (map.js:1184;
  margin 2; `x0 = floor(camX − countX/2)`, `countX = ceil(viewW/zoom)+2`)
  → шаг-функция от камеры/окна/зума на ТИЛ-точности; целочисленные
  границы → FP-дрейф зума (000263 §13: 80.00000000000001) безопасен —
  в ключ НЕ идёт сырой zoom.
* zoomBucket (chunk-cache.js:30, 1.2^k от 80) в ключ НЕ входит:
  bucket СТРОЖЕ range не гарантирует (000263 §13 — тот же bucket при
  разных зумах; гард 1e-6 — chunk-bake-специфичен для re-bake'ов —
  НЕ СМЕШИВАТЬ с frameTiles-кэшем). range-четвёрка строже bucket'а,
  потому что IS range. zoomBucket остаётся только у чанк-кэша
  (main.js:3675).
* worldVersion/exploredVersion — §3. Почему НЕ минимальный 4-поле
  ключ a1 §4 ((x0,y0,x1,y1)): ТЗ-тест требует «при сдвиге
  cam/zoom/explored/появлении здания — пересборка (инвалидация
  работает)» — world/explored-каналы обязаны быть НАБЛЮДАЕМЫМИ в
  ключе; альтернатива a1 зафиксирована как «рассмотрена, отклонена
  (ТЗ-тесты)». Стоимость — 6 сравнений целых на кадр = 0.

### 2.2 Форма кэша: single-entry, frameTiles const в замыкании (D2/D3)

```
const frameTiles = [];              // :3293 — const, переиспользуется
let frameTilesKey = null;           // {x0,y0,x1,y1,worldVersion,exploredVersion} | null
let frameTilesRebuilds = 0;
let frameTilesHits = 0;
let worldVersion = 0;
```

* frameTiles — `const`-массив, переиспользуется НА МЕСТЕ: miss →
  `frameTiles.length = 0` + push (тело цикла :3485-3488 БЕЗ
  ИЗМЕНЕНИЙ), hit → не трогать. ИДЕНТИЧНОСТЬ ССЫЛКИ стабильна на
  всю сессию (сильнее «состав неизменен» — тесты пилят `===`).
  a1-вариант «const → let» НЕ нужен: реассайн не требуется.
* Single-entry (ОДНА запись). LRU N≤4 (a1 §5.3) ОТКЛОНЁН: панирование
  камеры меняет range КАЖДЫЙ кадр глейда (cam = renderPos(now)+0.5,
  frame :4023-4024) → LRU-миссы = пересборка как СЕЙЧАС (выигрыша во
  времени НЕТ), а память ×4 (массив ~1 МБ на zoom 4/1080p); miss =
  ТЕКУЩЕЕ поведение (ноль регрессий), eviction-код = 0.
* Хит-ветка НЕ вызывает `tileCache.tile` (ни look-up'ов, ни
  регенераций) — переиспользует сохранённые объекты.

### 2.3 Hit/miss + legacy-гейт каждый кадр (D4/D5 — ключевое)

Новая структура buildFrame (:3468):

```
verts.length = 0;                          // :3470 — НЕУСЛОВНО
range = G.visibleTileRange(...)            // :3484 — каждый кадр (чистая)
hit = frameTilesKey
      && frameTilesKey.x0 === range.x0 && frameTilesKey.y0 === range.y0
      && frameTilesKey.x1 === range.x1 && frameTilesKey.y1 === range.y1
      && frameTilesKey.worldVersion === worldVersion
      && frameTilesKey.exploredVersion === exploredSize()
if (hit) {
  frameTilesHits += 1;
  // frameTiles НЕ трогать; НИКАКИХ tileCache.tile
  for (const t of frameTiles) legacyTileVerts(t, t.x, t.y, now, verts);
} else {
  frameTiles.length = 0;                   // сброс :3471 — только в пересборке
  for (let ty = range.y0; ty <= range.y1; ty++)
    for (let tx = range.x0; tx <= range.x1; tx++) {
      const t = tileCache.tile(tx, ty);
      frameTiles.push(t);
      legacyTileVerts(t, tx, ty, now, verts);
    }
  frameTilesKey = { x0: range.x0, y0: range.y0, x1: range.x1,
                    y1: range.y1, worldVersion, exploredVersion: exploredSize() };
  frameTilesRebuilds += 1;
}
// герой-ромб :3534-3549 — КАЖДЫЙ кадр (now/rp-зависим, вне кэша)
// gl.bindBuffer/bufferData/vertexAttribPointer×2 :3551-3555 —
// КАЖДЫЙ кадр (DYNAMIC_DRAW-семантика фолбэка, пины RM-6)
```

`legacyTileVerts(t, tx, ty, now, verts)` — тело legacy-гейта
:3489-3530 (тайл-квад `!tileFrameImg(t,now)` + `map.brightness(tx,ty)`;
маркер постройки `t.hasBuilding` → `t.buildingAnchor`/`buildingRec`/
`buildingAsset`/`spriteLoader.image` → `pushQuad(BUILDING_COLOR)`;
маркер моба `t.hasMobGroup` → `G.groupVisible(defeatedAt,t.x,t.y)`/
`mobFrameImg`/mobCharge-дробная точка → `pushQuad(MOB_COLOR)`) —
ПЕРЕНЕС 1:1 в хелпер (между buildingRec :3444 и buildFrame :3468),
БЕЗ «улучшений»: `t.x === tx`, `t.y === ty` (объект хранит свои
координаты — map.js:1072-1131) → значения бит-в-бит; порядок вызовов
в miss-цикле сохранён (push → гейт, как :3488→:3489).

ПОЧЕМУ гейт КАЖДЫЙ кадр (hit и miss), а не кэшируется:
* XOR 000176: legacy-вершины = функция (тайлы, now, readySet). При
  ЧАСТИЧНОЙ загрузке (frames.length>1, часть кадров не ready) выбор
  кадра `G.frameIndex(now, t.x, t.y, len)` меняется от now БЕЗ смены
  readyCount → «key-readyCount» не закрыл бы; пропуск гейта на hit =
  замёрзший фолбэк/пропавшая фигура (RM-4/RM-5/RM-8 требуют ПОЛНОЙ
  legacy-сцены в КАЖДОМ pumped-кадре).
* Steady state (все ready — штат): гейт детерминирован (0 вершин;
  маркеры — `bimg` готов) → hit/miss идентичны, пины RM-3/RM-10
  (bufferData.length) держатся.
* VERTEX-КЭШ ЗАПРЕЩЁН: заморозил бы анимации/фолбэки — сломал бы
  RM-BA-*/000265 W1-W2 (кадры построек по `G.buildingFrameIndex(now)`),
  CC-9 (readiness re-bake), RM-7 (defeatedAt читается в кадре).
4 прохода drawSprites + герой (:3856) — НЕ ТРОГАТЬ: читают frameTiles
(на hit — сохранённый массив), все их фильтры (defeatedAt/
collectedLoot/mobCharge/clock) — live-чтения каждый кадр →
корректность не зависит от кэша. Подземелье: buildFrame/drawSprites
зываются и под оверлеем (гард inDungeon — только tryMove/stepMs
:3997-3999), cam статичен → hit каждый кадр — выгода и там,
поведение то же.

### 2.4 Тестовые хуки (аддитивные) (D8/D9)

`__game.state` (getter :4065+, новый object literal на каждый доступ;
аддитивное поле безопасно — ни один тест не делает исчерпывающий
deepEqual ЦЕЛОГО state, a3 grep-проверка): рядом с `chunkCache`
(:4088):

```
frameTilesCache: {
  size: frameTiles.length,
  hits: frameTilesHits,
  rebuilds: frameTilesRebuilds,
  key: frameTilesKey,          // {…} | null до первого кадра
  tiles: frameTiles,           // ЖИВАЯ ссылка (read-only контрактом)
}
```

* Имя: `frameTilesCache` (а2-рабочее `state.frameTiles` ОТКЛОНЕНО):
  прецедент зеркала `state.chunkCache` (main.js:4088) + конкретнее.
* `tiles` — живая ссылка на const-массив (0 затрат на каждый доступ
  state — state читают КАЖДЫЙ кадр e2e-тестами; прецеденты живых
  ссылок: state.roster :4138, state.hero.inventory.slots :4102);
  read-only — КОНТРАКТ (тест-коммент + этот файл), как у mobCharge
  (:4076 «мутации запрещены»).
* key до первого кадра — null (map==null-гард не нужен: frameTiles
  пуст, size=0).

`__game.actions` (:4246+, аддитивные; существующие тесты действиям не
исчерпывают):

* `bumpWorldVersion()` — `worldVersion += 1`. Пин world-канала
  (FT-2); реальных бамп-сайтов на HEAD нет (§3) — контрактный хук.
* `spawnBuildingTile(x, y)` — сигнал-заглушка ТОЧКИ МУТАЦИИ (FT-6):
  `const t = tileCache.tile(x, y); t.hasBuilding = true;
  t.buildingAnchor = [x, y]; t.inBuilding = true; bumpWorldVersion();`.
  Наблюдаемо в steady state: legacy-маркер BUILDING_COLOR (ровно
  6 вершин bufferData; `buildingRec(anchor)` →
  `map.buildingAt(x,y)` → null — якоря нет в сид-реестре) + прох.2 —
  без спрайта (rec null → skip) → XOR 000176 цел (элемент 1×).
  t.building не выставляется — гейт/проходы его НЕ читают
  (маркер — по hasBuilding+anchor; реестр — по buildingAt).
* `buildFrameOnce(now = performance.now())` — ИЗОЛИРОВАННЫЙ замер
  (a1 §5.11: frame() включает drawSprites+renderHud — они дороже
  пересборки и размывают сигнал): ровно то, что frame() :4041 —
  `buildFrame(renderPos(now), now)`; возвращает
  `{ verts: verts.length, size: frameTiles.length,
     hits: frameTilesHits, rebuilds: frameTilesRebuilds }`.
  now — ЯВНЫЙ аргумент (в vm performance.now() заморожен NOW=1000 —
  внутренний замер дал бы 0); идемпотентен (те же cam/zoom → тот же
  hit/miss).
* `exploredAdd` (a2-рабочее имя) ОТКЛОНЁН: FT-5 — реальный e2e-флоу
  (D10, паттерн B24) — реальный ханк pinned, лишний debug-хвост не
  нужен.

## 3. Источники инвалидации + результат поиска мутаций

* **runtime-мутаций world-тайлов на HEAD НЕТ (grep-доказательство):**
  grep всего src/ на присваивания полей тайла
  (`(t|tile|tl).(hasBuilding|hasMobGroup|mobGroup|building|
  buildingAnchor|inBuilding|isEntrance|loot|terrain|passable|
  buildingId) =[^=]` + Object.assign на тайлах) — **0 совпадений**
  (a1 §2 + перепроверка Проектирования). Мир статичен за сессию
  (000019 «tileAt — чистая функция координат»; 000263 §12).
  «Стройка» в игре = cityStates/ANCHOR-записи 000148.05 (городское
  подземелье, НЕ world-тайлы); «исчезновение» групп = defeatedAt-
  фильтр (live-Map, ЧТЕНИЕ). → Расхождение ТЗ-пункта «tile-объекты
  мутабельны…» с HEAD — зафиксировано (a1 §6.1).
* **КОНТРАКТ БУДУЩИХ МУТАЦИЙ:** первый код, мутирующий поля
  world-тайла (или читающий explored в проходах frameTiles), ОБЯЗАН
  вызывать `bumpWorldVersion()` в той же точке (иначе кэш отдаст
  состав по старому ключу). Точка для бампа — рядом с записью поля.
  `exploredVersion` — самообновляющийся (§3.2), ханк explored не
  трогается.
* worldVersion — бамп при создании map/tileCache (a3 «вторая точка»)
  НЕ ВВОДИТСЯ: первый кадр — структурный miss (key=null) → бамп на
  создании = мёртвый код; tileCache присваивается ровно один раз
  (:4322, до первого rAF :4332).
* explored (main.js:671, `'x,y' башни → Set<'x,y'>`; данные
  000093): live-мутации — ровно ДВЕ: restoreFromSave :1386-1403
  (clear+set; только при СТАРТЕ, до requestAnimationFrame) и
  tower-ханк building-actions.js :295-307 (clear+set из
  `BE.restoreExplored(r.explored)`; `r.explored = markExplored(…)` —
  UNION: чужие башни копируются как есть, башня — объединение
  (building-effects.js:2721-2760) → монотонность). explored в
  проходах frameTiles НЕ читается НИГДЕ (a1 §6.2; единственные
  чтения: сейв :794, restore :1386, tower-ханк, HUD-строка
  renderHud :3878-3882) → поле = future-proof по ТЗ.
* **exploredVersion := exploredSize() = Σ Set.size по explored** —
  ТО ЖЕ выражение, что HUD-счётчик renderHud :3880-3881 (ОДИН
  источник формулировки); пересчитывается каждый кадр в buildFrame
  (O(башен) — HUD уже платит это). Почему НЕ bump-счётчик в двух
  ханках: union-монотонность ⇒ размер = версия; идемпотентный
  повтор «Взглянуть» → тот же размер → НИЧЕЮ не пересборка (данные
  не изменились); 0 новой проводки в building-actions.js (не в
  ТЗ-файл-плане) и 0 риска «забыли бамп» (версия — чистое значение
  из live-Map, а не побочный эффект ханка). `G.buildingEffects.
  exploredCount` (building-effects.js:2772) не подходит напрямую —
  принимает plain object сейва (строки), не live Map с Set-ами →
  3-строчный хелпер `exploredSize()` в замыкании main.js.
* **ПОДВОДНЫЙ КАМЕНЬ (D16, найдено Проектированием):** при N > maxSize
  tileCache (65536, map.js:1203) FIFO ТРАШИТСЯ: при N=131 104
  (ZOOM_MIN/1080p) ~65 568 тайлов range вне кэша → полная регенерация
  tileAt (fbm/nearMountain/pixelAt) КАЖДЫЙ rebuild-кадр —
  ДОМИНИРУЮЩАЯ стоимость (hot 12.3 с в vm под нагрузкой, a2 §1).
  Побока: REBUILD при N>65536 ВЫТИСКАЕТ недавно смутационные
  tile-объекты (tile() на хит не реинсертирует — Map-order не
  сдвигается, map.js:1216-1226; при >131k insert'ах oldest-
  вытеснение проходит всю пре-ребилд-кучу) → RUNTIME-МУТАЦИЯ тайла
  через tileCache при N>65536 НЕ ПЕРЕЖИВЕТ следующий rebuild
  (тайл перегенерируется чистым tileAt). Значения для FT-6: FT-6
  гоняется при N ≤ 65536 (D10) — кэш стабилен, мутация переживает
  rebuild и hit-кадры (гейт читает поля live). Будущая реальная
  мутация-точка при min-zoom обязана это учитывать (§3-контракт:
  bumpWorldVersion в ТОМ ЖЕ кадре, где мутация, ДО следующего
  rebuild — или инвалидация по содержимому).

## 4. zoomBucket — не в ключе

Фиксация (D1-2-я строка): `G.ChunkCache.zoomBucket` остаётся только
у чанк-кэша (main.js:3675 + reuse-гард `Math.abs(entry.zoom − zoom)
> 1e-6` :3683 — 000263 §13). Формула ВТОРАЯ не плодится; frameTiles-
ключ целочисленный (range-границы) — FP-дрейф зума в нём не
проявляется (границы — floor/ceil от zoom → шаг-функция).

## 5. Замеры (ДО — станция Проектирования; ПОСЛЕ — реализация)

МАШИНА СТАНЦИИ: общая машина, load 13–16 на 12 ядрах, 5 параллельных
workflow (vm-наценка ~3-6× к браузеру — абсолютные цифры завышены,
ОТНОСИТЕЛЬНЫЕ валидны). Viewport 1920×1080, harness — копия
tests/global-map-draw.test.js (vm, полная цепочка index.html,
performance.now заморожен NOW=1000, 2d/gl no-op — изоляция ДАННОГО
цикла от пикселей). Скрипты: /tmp/thegame-wf-000276/baseline-
{perf.js,2.js} (read-only по worktree).

| Сценарий | N тайлов | Медиана (vm, под нагрузкой) |
|---|---|---|
| tileCache.tile+push, все хиты (zoom ≈ 6.23, 14 wheel-out) | 54 736 | 63.4 мс (1 158 нс/тайл) |
| полный hot-кадр (pumped frame, zoom ≈ 6.23) | 54 912 | 151 мс |
| COLD-кадр, ZOOM_MIN=4 (генерация 131k) | 131 104 | 54 400 мс |
| **HOT-кадр, ZOOM_MIN=4** | **131 104** | **12 300 мс** |

* N=131 104 = 482×272 = (ceil(1920/4)+2)×(ceil(1080/4)+2) —
  вычисляется в тесте `MAP.visibleTileRange`, не хардкод.
* Факт сверх шва §9: «131k итераций данных» = на деле «65k
  РЕГЕНЕРАЦИЙ + 131k look-up'ов» (FIFO-трэш, §3-камень). frameTiles-
  кэш на hit УБИРАЕТ это целиком (hit-ветка не ходит в tileCache).
  При N ≤ 65536 выигрыш hit = look-up+push (~1.2 мкс/тайл vm;
  ~200-400 нс браузер) — скромно; значимый выигрыш — худший случай.
* ВЫХОДНОЙ КЛАУС (ТЗ п.4): НЕ СРАБАТЫВАЕТ — ДО многократно выше
  любого бюджета (16.7 мс/кадр @60 fps; даже 1000 мс/кадр превышен
  в худшем случае).
* БАЗОВЫЙ ПРОГОН СУЬТА (worktree, до изменений): 3321/3322 pass,
  350 с под нагрузкой. 1 FAIL — tests/map.test.js:1943 «перформанс:
  160k tileAt … в тайм-бюджете» (7824 мс > 5000 мс) — ИЗВЕСТНЫЙ
  load-флейк (коммент теста: «5000 мс покрывает медленный CI»;
  load 13–16; код не менялся). ПРОТОКОЛ: перепуск
  `node --test tests/map.test.js` + запись в отчёт (не блокирует).
* **ПОСЛЕ (станция реализации, 2026-10-26; тем же harness, ТЕМ ЖЕ
  тестом FT-1, изолированный замер actions.buildFrameOnce):**
  hot-медиана K=5 warm-вызовов @ ZOOM_MIN, N=131 104, ВСЕ hit, wall
  (process.hrtime.bigint; sandbox performance.now заморожен) =
  **33,4 мс** (times = [40,5; 33,6; 33,4; 32,7; 32,9] мс; rebuilds не
  растут — сдвигов нет). Машинa НЕ свободная (load 13–18 на 12
  ядрах, 5 параллельных workflow — как на замере ДО) — цифры
  завышены, относительные валидны (как в ДО-таблице).
  **DIFF ДО/ПОСЛЕ:** steady-state кадр (без сдвигов) — 12 300 мс →
  33,4 мс (vm, та же машина/класс нагрузки, ~370×): hit-ветка не ходит
  в tileCache (FIFO-трэш ~65 568 регенераций tileAt/кадр — убран
  целиком). REBUILD-кадр (miss: сдвиг cam/zoom/mutation/explored) —
  стоимость НЕ ИЗМЕНИЛАСЯ (miss-ветка = дословно прежний цикл;
  по D5 кэш не должен делать rebuild быстрее, только реже).
* **БЮДЖЕТ (D11):** FT-1 (PERF) — медиана wall-time K=5 warm-вызовов
  `actions.buildFrameOnce` (сдвигов НЕТ) @ ZOOM_MIN, N=131 104 ≤
  BUDGET_MS, где `BUDGET_MS = max(10 × ПОСЛЕ_hot(dev-машина), 2000)`
  (маржа 10×: общая машина, 5 параллельных workflow, vm 3–6×;
  прецедент map.test.js — 5000 мс на «ожидается <1 с»). РАЗДЕЛЕНИЕ
  РОЛЕЙ (запись при реализации: сюда ДО_hot и ПОСЛЕ_hot): регрессия
  «кэш убран» закреплена FT-2 СТРУКТУРНО (rebuilds растёт на каждом
  кадре — детерминированно, БЕЗ тайминга) — перф-бюджет FT-1 —
  СМОК против катастрофической регрессии (O(N²), случайный
  vertex-кэш с аллоками), а не дискриминатор «с кэшем/без» (ПОСЛЕ
  при N=131k — сам гейт ~131k×tileFrameImg — не даёт 5×-разрыва с
  ДО на свободной vm; дискриминировать FT-2).
  РЕЗЕРВ: если cold-кадр ZOOM_MIN (генерация 131k + chunk-bake
  в warm-up) > ~60 с на dev-машине под обычной нагрузкой — FT-1
  переводится в N-класс 54.7k (14 wheel-out, z≈6.23; N < 65536 —
  все хиты; hot ДО = 151 мс здесь) с записью решения в этом же
  разделе. Бюджет в тесте — КОНСТАНТА с комментом-ссылкой на этот
  файл.
* **БЮДЖЕТ — ФИНАЛ (реализация):** ПОСЛЕ_hot = 33,4 мс (см. выше) →
  10 × ПОСЛЕ_hot = 334 мс < 2000 мс → **BUDGET_MS = 2000** (константа
  в тесте подтверждена замером, менять не нужно).
* **РЕЗЕРВ-КЛАУЗА (N-класс 54,7k) — НЕ СРАБАТЫВАЕТ:** cold-кадр
  ZOOM_MIN на замере = 54,4 с (vm, load 13–18 — НЕ «обычная
  нагрузка»); полный FT-1 под load 18 = 84 с (включая boot-цепочку
  и chunk-bake warm-up), под меньшим load run2-прогон = 36,5 с
  (FT-3; FT-1 быстрее). Бюджет-ассерт FT-1 не зависит от cold-кадра
  (медиана warm) — стоимость лишь wall-time теста. N=131 104
  сохранён — это худший случай шва §9 («131k итераций»).

## 6. Бит-в-бит инварианты (НЕ трогать)

* Состав frameTiles (порядок + ссылки) — чистая функция (integer-
  range, содержимое тайлов, exploredVersion): экранная геометрия
  (toPt/снап-сетки 000215/000228 — формулы в map.js), now-зависимое
  (frameIndex воды/построек, heroFrameImg, mobCharge-глейд) и
  readiness-зависимое (tileFrameImg-гейт) — ПЕРЕСЧИТЫВАЮТСЯ В КАДРЕ
  из frameTiles + live cam/zoom/now → при идентичном составе рендер
  бит-в-бит (пинится существующими тестами БЕЗ их правок: RM-1..10/
  RM-BA-*/CC-2..5/main-visuals/aggro/lunge/mob-chase/city-screen).
* XOR 000176 (legacy-вершины только not-ready; штат — 0); селекторы
  готовности :3358-3436 — ОДИН источник для обоих слоёв, инлайн
  запрещён — НЕ ТРОГАТЬ; 4 прохода + герой — НЕ ТРОГАТЬ;
  gl.bufferData/vertexAttribPointer×2 — каждый кадр; чанк-гейт
  :3295 (8192) и чанк-ветвь drawSprites :3645-3697 (reuse-гарды
  zoom 1e-6/edgesEqual/readiness) — НЕ ТРОГАТЬ; drawSprites-своя
  tileRange :3593-3597 — НЕ ТРОГАТЬ (независимый пересчёт — «диапазон
  ТОТ ЖЕ, что buildFrame — чистая, пересчёт бит-в-бит»); frame()
  порядок :4041→:4042→:4049→:4051 — НЕ ТРОГАТЬ; гарды isActive
  (dungeonUI/buildingUI/npcUI/craftUI/resurrectUI) и [E]-путь —
  не тронуты; сейвы — без новых полей (кэш ВНЕ сейва, как chunkCache);
  HUD — побайтово (exploredCount-выражение то же, что раньше);
  0 новых RNG (tileAt — hash/fbm/noise по GLOBAL_SEED).
* index.html — НЕ меняется (новых <script>/классов нет) →
  tests/index-order.test.js без правок.

## 7. Риски-документальные

* tileCache-FIFO side-effect на hit (a1 §5.4): hit не вызывает
  tileCache.tile → вытесненные тайлы не переинсертятся → порядок
  eviction в tileCache ДРУГОЙ (рендер НЕ меняется — regen чистый;
  тестов tileCache-внутри-frame() нет — state.map даёт только
  width/height/fromPng; map.test.js гоняет createTileCache
  изолированно). Не наблюдаемо — зафиксировано.
* Identity тайл-объектов (a1 §5.5): закэшированный массив может
  держать объекты, которые tileCache потом вытеснил и перегенерировал
  (содержимое идентично — tileAt чистая). Identity-зависимостей нет:
  единственное `t === pt` (main.js:2583, startCombat-заряд) —
  сравнение ДВУХ СВЕЖИХ вызовов tileCache.tile, кэшем не затронуто.
* Miss-кадр при N>65536 остаётся дорогим (65k регенераций) — как ДО;
  не регрессия (выигрыш — hit-кадры).
* FT-6-мутабельность при N>65536 — §3-камень (FT-6 при N ≤ 65536).
* Окно/resize: canvas.width/height переписываются каждый кадр
  (:4026-4027) ДО buildFrame → новый range → miss — корректно.
* Комменты: новых НЕ пишется (CLAUDE.md); существующий блок
  :3473-3483 — проверять на устаревшие строки при реализации
  (источник правды — код).

## 8. Тесты (tests/frame-tiles-cache-000276.test.js — НОВЫЙ, 7 test())

Харнес — копия мир-харнеса tests/chunk-render.test.js (bootSandbox/
boot/frameAt/wheelN/assertReady; vm, ВСЯ <script>-цепочка index.html,
map.png ВСЕГДА onerror → G.generateSeedPixels — детерминированный
мир; NOW=1000 заморожен) + node-МОДЕЛЬ мира
(`MAP = require src/map.js`, `SEED = require src/mapseed.js`,
`WORLD = MAP.createMap(SEED.generateSeedPixels())` — паттерн
worldScene chunk-render:93-97). Корневая причина красноты ВСЕХ 7:
`__game.state.frameTilesCache` / `__game.actions.{…}` отсутствуют
(ERR_ASSERTION/TypeError на осмысленном ассерте, НЕ синтаксис;
цепочка index.html не меняется).

Сценарий-база (FT-1..FT-4, FT-7): 1920×1080, спавн (0,0), cam
(0.5,0.5); 22 wheel-out → z = 4.0 ТОЧНО (ZOOM_MIN, FP-инвариант как
в CC-3/CC-4: 4·1.2/1.2 === 4); N = 131 104 (вычисляется от
state.cam/state.zoom через MAP.visibleTileRange, не хардкод);
steady state — assertReady.

* FT-1 PERF-бюджет: зеркало — size === N, key.{x0,y0,x1,y1} ===
  MAP.visibleTileRange(state.cam, …), key.worldVersion === 0,
  key.exploredVersion === 0; медиана K=5 wall-time warm-вызовов
  actions.buildFrameOnce (сдвигов НЕТ) ≤ BUDGET_MS (§5).
* FT-2 тёплые кадры БЕЗ сдвигов: 3 warm-кадра — rebuilds НЕ РОСТУТ,
  hits += 3, key стабилен, `s.tiles === s'.tiles` (ИДЕНТИЧНОСТЬ
  ССЫЛКИ), drawCalls спрайт-канваса между кадрами deepEqual
  (биту-в-бит вывод).
* FT-3 сдвиг cam: 1 шаг героя (walker-паттерн global-map-draw) →
  key.{x0..y1} === MAP.visibleTileRange(НОВЫЙ state.cam, …),
  rebuilds +1, ПОЛНЫЙ список 'x,y' (порядок прохода: ty-внешний,
  tx-внутренний) === золотому; золотой = row-major-перебор range
  (список x,y = перебор СТРУКТУРНО — tileAt не нужен; т.к. t.x===tx,
  t.y===ty, map.js:1072-1131) + СПОТ-чек 3 контрольных тайлов
  (terrain/hasBuilding/hasMobGroup) по WORLD.tileAt.
* FT-4 зум: 4.0 → 1 wheel-in z = 4.8 ТОЧНО (4·1.2) → N = 91 254
  (402×227, выч.), rebuilds +1, список === золотому@4.8; 1 wheel-out
  z = 4.0 ТОЧНО → N = 131 104, rebuilds +1, список === золотому@4.0
  (бит-в-бит НЕЗАВИСИМО от hit/miss — структурно по ключу range;
  FP-инвариант 4·1.2/1.2 === 4 — паттерн CC-3/CC-4).
* FT-5 explored (РЕАЛЬНЫЙ e2e, паттерн B24 building-effects:6846):
  seedSave position (36,−21) — игрок НА смотровой башне (id 46;
  золотой факт B24) — БЕЗ 57-шаговой ходьбы; кадр 1 (ev=0, miss);
  [E] → строка «Взглянуть» → Digit1 → explored-окно 1681 →
  key.exploredVersion 0→1681, rebuilds +1, список === тому же
  золотому (range не менялся — бит-в-бит), HUD «Исследовано: 1681
  тайлов» (pinned B24, повтор — привязка к кэшу); следующий warm-
  кадр — hit (rebuilds не растёт).
* FT-6 появление здания (worldVersion): z = 14 wheel-out (z≈6.23,
  N = 54 736 < 65536 — ВСЕ ХИТЫ, FIFO стабилен; N вычисляется,
  ассерт N ≤ 65536) → steady state (assertReady, bufferData пуст —
  RM-3-режим) → тайл T: первый в range (row-major) с
  !hasBuilding (по WORLD-модели) → actions.spawnBuildingTile(T.x,T.y)
  → key.worldVersion ИЗМЕНИЛСЯ, rebuilds +1; bufferData — ровно
  6 вершин (BUILDING_COLOR-маркер: buildingRec→null для несидового
  якоря; terrain-квады 0 — все ready; герой ready — ромба нет);
  прох.2 — без спрайта (rec null → skip, XOR 1×); СЛЕДУЮЩИЙ warm-
  кадр — hit И маркер всё ещё 6 вершин (мутация переживает hit —
  гейт читает поля live; при N ≤ 65536).
* FT-7 золотой состав (пин рефакторинга): ПОЛНЫЙ список 'x,y' для
  фиксированного (cam спавн, ZOOM_MIN, explored=∅) === золотому
  (row-major перебор range) — старый per-frame пересчёт ≡ новый кэш;
  ДО и ПОСЛЕ фикса — одно и то же.

expectedRedCount = 7. Технических правок СУЩЕСТВУЮЩИХ тестов —
НИ ОДНОЙ (a3 §5: нет нового модуля/UMD/require-пути, index.html не
меняется, vm-харнесы подхватывают main.js автоматически, исчерпывающего
deepEqual state нет, actions не исчерпываются, dungeon-домен не
тронут). Верификация RED: `npm test` в worktree — падают ТОЛЬКО 7
новых; остальное зелёное (кроме задокументированного load-флейка
map.test.js:1943 — перепуск файла + запись в отчёт).

## 9. Границы (что НЕ это)

* НЕ повтор R7 (RETRO-20261025 §4.2): FOG_DIM-pass и 16 MP-кап LRU
  чанков отклонены «только с профайлингом и жалобой» (000263:483-486);
  000276 — фикс-идея шва §9 («кэш range, dirty-проверка» — записана,
  не отклонена).
* Чанки ≠ frameTiles (000263:536-537): чанки — пиксели (offscreen-
  bake), frameTiles — данные (список объектов); чанки frameTiles
  НЕ уменьшают.
* SPEC — изменений нет (wording-тест не нужен).

## 10. Что НЕ менять / коммит

* CHANGELOG.md — НЕ ТРОГАТЬ (чистый рефакторинг: не игровой
  процесс, не графика, не управление).
* src/map.js, src/chunk-cache.js, src/dungeon-ui.js,
  src/building-actions.js, src/building-effects.js — НЕ ТРОГАТЬ
  (проводки нет: exploredVersion — чистое значение; worldVersion —
  замыкание main.js).
* index.html, tests/index-order.test.js — НЕ ТРОГАТЬ.
* .merge-pending — стадия мержа.
* 1 коммит на ветке task/000276: первая строка «Задача 000276: …»
  (по реальному diff), последний параграф — Co-Authored-By:
  Claude Code <noreply@anthropic.com>.

## 11. Что важно будущим задачам

* Первый RUNTIME-код, мутирующий поля world-тайла — ОБЯЗАН бампить
  worldVersion в той же точке (§3-контракт; grep-доказательство
  «0 точек» в §3). При N > 65536 (min-zoom) мутация через
  tileCache НЕ ПЕРЕЖИВАЕТ следующий rebuild (FIFO-вытеснение,
  §3-камень) — планировать инвалидацию accordingly.
* explored-потребители (МИНИКАРТА — отсрочена, 000093): если проход
  frameTiles начнёт читать explored — exploredVersion уже в ключе
  (самообновляющийся, Σ Set.size) — менять ничего не нужно.
* Зеркало state.frameTilesCache — read-only (живая ссылка tiles —
  мутации запрещены контрактом, как mobCharge).
* Бюджет/замеры — §5 (ПОСЛЕ дополняет реализация); perf-сигнал
  мерить через actions.buildFrameOnce (wall-clock вокруг вызова),
  НЕ через полный frame (drawSprites+renderHud дороже пересборки).
* 000271-000275 не трогали main.js — пересечений нет (ТЗ).

## 12. Итог реализации: технические правки RED-теста (стадия GREEN)

RED-файл (коммит «красные тесты») содержал 7 дефектов ТЕСТОВОГО
КОДА, не дефектов функциональности — все найдены при GREEN-прогоне,
все правки СОХРАНЯЮТ СМЫСЛ АССЕРТОВ (прецеденты memory/000149
«4 ТЕХНИЧЕСКИЕ правки ... смысл ассертов не изменён»,
memory/000076-temple-blessings.md, memory/000082-companion-xp.md —
кросс-realm-нормализация). Семантических
правок НИ ОДНОЙ; существующих тестов не тронуты.

* **Кросс-realm-ловушка (системная, 3 проявления).** Node 18
  `assert/strict`: `deepStrictEqual` сравнивает прототипы —
  объекты/массивы, созданные в vm-realm (main.js/map.js в
  песочнице), НЕ ПРОХОДЯТ сравнение с host-литералами даже при
  идентичной структуре («Values have same structure but are not
  reference-equal»); loose `deepEqual` при этом проходит (прототипы
  не проверяет) — НО в этом файле `require('node:assert/strict')`,
  где deepEqual === deepStrictEqual (ловушка №3). Проверено
  эмпирически на этой машине (vm-vs-host strict FAIL, vm-vs-vm
  PASS, loose cross-realm PASS). ПРАВКИ:
  (a) `vmKey(k)` — JSON-roundtrip ключа (6 целых, без потерь) перед
  сравнением с expectedKey — 7 call-site;
  (b) `tilesList()` — массив строится for-ом в host-realm (было
  `tiles.map(...)` — vm-массив; deepStrictEqual(vm-массив,
  goldenList-host-массив) падал, хотя СОСТАВ был идентичен —
  бит-в-бит-пин FT-3/4/5/7 «падали» ложно);
  (c) `spotCheckTiles` — `JSON.parse(JSON.stringify(t))` перед
  deepEqual с WORLD.tileAt (тайл — плоские данные, потерь нет).
* **Image-стаб без `self.__asset = v;`** — assetOf() всегда '' →
  фильтры building/hero-спрайтов считали 0 (прецедент:
  tests/chunk-render.test.js:356 ставит __asset в src-setter).
* **makeEl canvas без `getContext('2d')`** — bakeWorldChunk
  (main.js, чанковый путь N>8192) падал TypeError
  (cv.getContext → undefined → .drawImage) — падение глотало
  frame-watchdog, все N>8192-сценарии (FT-1/FT-6) ломались
  (прецедент: chunk-render.test.js:274-277).
* **buildingDrawsOf без семейства cities/** — города (buildingId
  51..54, CITY_SPRITES/CITY_FRAMES src/sprites.js) рисуются из
  `assets/sprites/cities/`, фильтр по buildings/ недосчитывал 57
  якорей (440 vs 497); expectedBuildingDraws считает ВСЕ
  inBuilding-якоря — фильтр по обоим семействам.
* **FT-2: арифметика RED-стадии** — assert `c0.hits === 0` стоял
  после ВТОРОГО кадра (f1 = hit #1) — по замыслу теста (rebuild #1
  + hit #1) hits обязан быть 1; исправлено на `c0.hits === 1`
  (последующий `c1.hits === c0.hits + 3` = 4 — не тронут).

Итог GREEN-прогона: 7/7 pass (FT-1..FT-7), 0 fail; полный сьют —
tasks/result/000276.md.

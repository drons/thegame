# Задача 000183: пины задекларированных гардов (карта/подземелья/портал) + фикс спавна ABYSS

ТЗ: tasks/pending/000183.md. Источники findings: tasks/result/000172/000173/000176/000177-retro-20261010.md.
Краткая карта пинов и решение по тайлу босса ABYSS — в companion-файле `000183-map-dungeon-pins.md`.

## Что добавлено / перенесено

- **19 новых тестов** (красная стадия: 17 зелёных регрессионных пинов + 1 красный
  D-BOSS-1 = 18; с фиксом добавлен D-BOSS-2 — репин post-fix, итого 19):
  | Файл | Тесты | Область |
  |---|---|---|
  | tests/dungeon.test.js | D-BOSS-1 (красный), D-BOSS-2 (репин) | ТЗ-4: фикс спавна ABYSS |
  | tests/mob-aggro-circle.test.js | M6–M10 | ТЗ-1: 000172, pass 2.5 agro-кругов |
  | tests/mob-chase-e2e.test.js | MC7–MC12 | ТЗ-2: 000173, заряжание моба |
  | tests/global-map-draw.test.js | RM-9, RM-10 | ТЗ-3: 000176, WebGL-фолбэк / обзорный зум |
  | tests/portal-exit-e2e.test.js | PE-6–PE-9 | ТЗ-4: 000177, выход/flash/тач/дебаг |
- **1 файл src**: src/dungeon.js (generateDungeonContents) — клетка босса ABYSS исключена
  из точек спавна блуждающих групп и сундуков + переписан комментарий о safe-зоне.
- **0 семантических правок существующих тестов**; харнес-правки только аддитивные
  (tests/mob-chase-e2e.test.js: `makeGl(glCalls)`, `bootSandbox(seed, reject)` — см. «Подводные камни»).
- **0 новых модулей, 0 ассетов, 0 тегов `<script>`** в index.html.

## Контракты и границы

### C1. Фикс ABYSS (единственная src-изменённость)

`generateDungeonContents` (src/dungeon.js): `const far = d.rooms[d.rooms.length - 1]`
вынесена выше цикла блуждающих групп, и перед первым `takeSpot()`:

```js
// 000183: клетка босса ABYSS — не точка спавна для блуждающих групп и
// сундуков (wanderStep уже не пускает группы на занятую клетку босса —
// taken-сет; асимметрия генерации — регрессия 000177, когда safe-зона 5×5
// переехала из дальней комнаты с боссом в комнаты входа-выхода).
if (d.type === DUNGEON_TYPES.ABYSS) {
  occupied.add(far.cx + ',' + far.cy);
}
```

- **Почему клетка босса должна быть чистой** (ТЗ-4, опция «красный тест»):
  `dungeonMove` обрабатывает на тайле только ПЕРВУЮ группу — блуждающая группа на тайле
  босса заслоняет босса; сундук на тайле босса недосягаем до смерти босса. `wanderStep`
  уже блокирует вход в клетку босса (`taken` строится из всех непобеждённых мобов,
  включая босса) — асимметрия между генерацией и движением = регрессия, а не дизайн.
  До 000177 exit стоял в дальней комнате, т.е. клетка босса лежала внутри 5×5 safe-зоны
  вокруг выхода и спавниться там было невозможно.
- **Почему `occupied`, а не `safe`**: эффект на распределение одинаков (отвергающая
  выборка равномерна по оставшимся клеткам), но `occupied` — минимум (1 Set.add,
  `floorCells`/`safe` не трогаются), guard `d.type === ABYSS` делает остальные типы
  подземелий бит-в-бит неизменными (проверено).
- **Детерминизм**: новых вызовов rng() НЕТ, кроме отклонённых повторов `takeSpot`
  (≤200 на попытку — как и для любой занятой клетки). Порядок остальных rng()-вызовов
  не меняется (комментарий 000099 про single live read сохранён).
- **Проверенные числа** (пробы в /tmp/thegame-wf-000183/, в коммит не входят):
  - реплика generateDungeonContents в пробной версии === реальный
    D.generateDungeonContents на золотом пине (11,3)/totalXp=2000/level=10;
  - золотой ABYSS (11,3), MOUNTAIN, seed 2941640529, босс (14,6): контент ПОСЛЕ
    фикса бит-в-бит тот же, что ДО → **репин золотого пина НЕ требуется**;
  - сетка 80 входов × 16 xp: 1280 ABYSS-подземелий, на мастере 35 с коллизией
    (сундук или блуждающий моб на клетке босса) → после фикса 0; сменили контент
    ровно эти 35 подземелий (влияние локализовано);
  - свип xp=1..3000 (3000 подземелий, ~168 мс): 69 коллизий на мастере, первая —
    xp=18, сундук c3 (14,6) → после фикса 0.
- **Сейвы**: контент подземелья сессионный, в сейв не пишется
  (dungeonMemory — сессионный Map src/main.js; collectSaveData dungeon-полей
  не имеет; src/save.js — 'dungeon' отсутствует; spec/dungeons-storage.md) —
  фикс НЕ инвалидирует и НЕ мигрирует старые сейвы (контракт: миграция не
  требуется, не делать — и не будет, пока подземелья не персистятся; это
  отдельная задача с повышением версии сейва). Коррекция 000157 (аудит:
  исходная формулировка «персистентен/живёт в сейве» была ложной — вывод о
  миграциях случайно верен, причина исправлена; доказательство —
  memory/000157-ore-deposits-audit.md §8).

### C2. Д-BOSS-2: репин зафиксированного (post-fix) контента

Три ABYSS-подземелья, полный deepEqual {seed, mobs, chests, createdAtXp}:

- **(11,3), totalXp=18, level=1** (случай, где на мастере была коллизия: c3 на (14,6)):
  seed 4033219701;
  mobs: g0 (5,23,l4,[lower_demon,abomination,succubus]), g1 (3,13,l1,[lower_demon,lower_demon]),
  g2 (7,5,l3,[lower_demon]), g3 (13,7,l1,[abomination,abomination]),
  boss (14,6,l4,[abomination,lower_demon,lower_demon]);
  chests: c0 (17,23,20,null), c1 (13,11,12,war_hammer), c2 (13,13,14,blizzard_scroll),
  c3 (11,12,28,blizzard_scroll)  [до фикса c3 было (14,6,20,null) — НА клетке босса];
  createdAtXp 18.
- **Case A (−25,−20), xp=100, level=1** (другая форма подземелья):
  seed 3522625240; mobs g0 (27,26,l1), g1 (24,28,l1), g2 (16,7,l1), g3 (16,8,l2),
  boss (24,24,l4); chests c0 (22,24,21,heavy_tome), c1 (14,13,27,null),
  c2 (20,8,28,null), c3 (10,10,11,null), c4 (17,7,20,greater_healing).
- **Case B (−15,−20), xp=321, level=1**:
  seed 1222898703; mobs g0 (14,25,l1), g1 (21,26,l4), g2 (18,30,l1), boss (21,29,l4);
  chests c0 (20,29,15,null), c1 (14,26,25,null).

**Правило**: на красной стадии значения репина ПЕРЕПРОВЕРИТЬ против реальной
исправленной функции (node-пробой) перед захардкоживанием в тест.

### C3. Пины = регрессионная сеть

Все новые пины (кроме D-BOSS-1) **зелёные на мастере**: они фиксируют текущее
поведение и краснеют только при регрессии. Если пин стал красным без изменения
поведения — баг в тесте, а не в коде. Пины не добавляют функциональности
(НОВЫЙ функционал = только фикс ABYSS, строгие по ТЗ: не больше и не меньше).

### C4. Границы (НЕ трогать в этой задаче)

- `exitLocation` (main.js) и его finally-инвариант 000170 — код не менять, только
  пин flash (PE-6/7) и e2e-проход по каналам (PE-8/9).
- Регионы 000182 (тесты combat-ui/movement-freeze/efir) — не трогать.
- CHANGELOG.md — не трогать (инструкция workflow на эту стадию; упоминание
  не вносится).
- .merge-pending — НЕ создавать (не стадия мержа); push в remote — запрещён.

## Ленивые ссылки и guards (что именно зафиксировано пинами)

### ТЗ-1: 000172 — agro-круги (main.js pass 2.5, ~L2689-2704) → M6–M10

- **M6**: фильтр `G.groupVisible` (повержена сегодня → нет круга): шпион оборачивает
  оригинальный groupVisible (захватывает live Map defeatedAt из 1-го аргумента,
  возвращает orig(D,x,y)); D.set(key триггерящей группы, state.day) → frameOnce →
  arc на её тайле исчез (arcs === expected−1, остальные группы интактны);
  `g.actions.setDay(state.day + G.RESPAWN_DAYS)` → onDay → dueForRespawn → delete →
  frameOnce → окружность вернулась.
- **M7**: масштабирование радиусом зума r = info.radius * zoom при зуме ≠ ZOOM_START:
  колесо по `h.gameCanvas.listeners['wheel'][0]({deltaY:-1, preventDefault(){}})` →
  `st.zoom === G.ZOOM_START * 1.2` (бит-в-бит та же операция); пересчитать expected
  agro-круги при st.zoom; явный радиус для (2,3) = 2*96 ≠ 160; обратное колесо
  deltaY:1 → `Math.abs(st.zoom − G.ZOOM_START) < 1e-9` (FP-терпимость) и arcs
  === пересчитанному expected.
- **M8**: мусорные данные groupZoneInfo — только для целевого gid:
  `{triggers:true, radius:0}` → null → `{radius:2}` (без triggers) → в каждом фазе
  arc целевого тайла отсутствует, остальные группы интактны, h.errors не меняется (0),
  tileDraws > 0; после — восстановление оригинала.
- **M9**: «без fill» (Д4 ТЗ 000172): ассерт `calls.filter(c => c[0]==='fill').length === 0`
  И count fillRect === 0 в кадре (main.js в pass 2.5 рисует только arc+stroke, без
  заливки); пре-кондиция arcs ≥ 1 (иначе тест вакуумный).
- **M10**: тихий гард `typeof G.groupZoneInfo === 'function'` — `delete G.groupZoneInfo`
  → frameOnce → h.errors не меняется (0), 0 agro-арков, tileDraws > 0, отрисовка
  мобов (pass 3) интактна — проход тихо пропущен, игра не падает.

### ТЗ-2: 000173 — заряжание моба → MC7–MC12

- **MC7** (гард `G.createMover`, деградация D8): delete G.createMover ПОСЛЕ boot
  (mover героя уже создан на загрузке) → зональный бой стартует бит-в-бит
  (seed/tile/terrain как без деградации), `g.state.mobCharge === null`, спрайт
  каждый кадр ровно на якорях, h.errors === 0; после victory — всё ещё null, спрайт скрыт.
- **MC8** (гард `from == to`): boot со спавном игрока НА тайле группы:
  `seedSave({day:1, position:{x:2,y:3}})` (формат {version:1, savedAt, data});
  drain boot идёт дальше `loadMapPixels().then` → **бой уже начался на boot**:
  h.raf.length === 2 (combatTick, worldFrame); worldFn = h.raf[1] (без pumpAll);
  prevPos снапится на (2,3) == t → mobCharge === null каждый кадр, бой активен,
  seed hash2(2,3, SALT), спрайт бит-в-бит на якорях; victory → скрыт.
- **MC9** (WebGL-фолбэк-слой, контракт «оба слоя — одна точка»): boot с
  Image-reject по префиксу спрайта таргетного моба (спидер) → зональная атака;
  каждый кадр окна: `countColor(MOB_COLOR) === 6` (6 floats/вершинку, квадрат
  маркера [pos+0.30..pos+0.70]², EPS 1e-6 — float32-квантизация bufferData,
  ulp ≈ 2.4e-7 при координатах ~2) с координатами, совпадающими
  с `state.mobCharge.pos` (ДРОБНЫЕ — assert non-integer в средних кадрах,
  анти-вакуум); спрайтовый канал: 4 прочих моба рисуются, спидера нет;
  victory → маркер исчез.
- **MC10** (1500 мс MOB_CHARGE_MS + кламп на цели до onEnd): pump T+1450 →
  НЕ на цели (offTarget > 1e-3 тайла; residual smoothstep ≈ 0.0093 тайла);
  pump T+1500 → РОВНО на цели (p≥1 кламп stepProgress → position() = exactly to,
  hostPt deepEqual {x:0,y:1}); T+1550/T+1600/T+1650 — постоянны; victory → null.
  Диапазон пина D∈(1450,1501).
- **MC11** (исход 'dead', контракт D5): `const c = G.combatUI.current();
  c.result={outcome:'dead', partyLost:true}` (dealDamageToPlayer
  НЕ экспортирован — паттерн PC-1) → handleCode('Space') → onEnd: isActive false,
  mobCharge null, player возвращён на prevPos (0,0), hero.alive === true,
  hp === max(1, round(maxHP/2)), золото −20%, flash 'Вы очнулись. −20% золота.';
  группа g4 ЖИВА (defeatedAt НЕ записан при dead) → спрайт на (2,3), НЕ скрыт.
- **MC12** (frameIndex — по ЦЕЛОМУ тайлу): для КАЖДОГО кадра окна
  `__asset === G.mobFrames(4)[G.frameIndex(now_k, 2, 3, G.mobFrames(4).length)]`
  (переучёт от целотайловой координаты — ловит и дробный выбор кадра);
  анти-вакуум: G.mobFrames(4).length ≥ 2.

### ТЗ-3: 000176 — глобальная карта → RM-9 / RM-10

- **RM-9** (смешанное частичное состояние загрузки, пер-элементный фолбэк):
  3 субфазы, цель reject выбирается из drawCalls ПРОБНОГО кадра (double-boot
  паттерн: пробный запуск собирает пути — реальный boot с reject-предикатом):
  (a) тайлы: reject пути P, ≥1 тайл кадра использует его, остальные — другие →
  tileDraws === N_ready − count(P), tileVerts > 0, heroDraws 1, счётчики
  мобов/построек и countColor(MOB/BUILDING) === 0;
  (b) мобы: reject префикс спрайта спидера → mobDraws === groups−1,
  markerVerts(MOB_COLOR, 2, 3) === 6, countColor(MOB_COLOR) === 6;
  (c) постройки: reject единственного видимого файла постройки (предпочитать
  1×1 footprint → ровно 6 маркерных вершин; иначе 6×F по тайлам footprint) →
  buildingDraws === N_b − 1.
- **RM-10** (перфоманс-заявка ТЗ при обзорном зуме, худший случай постмортема):
  22 wheel-out события {deltaY:100} → `st.zoom === G.ZOOM_MIN` (4; 80/1.2^22 < 4);
  frameAt: totalVerts === 0; bufferData ровно 1× c пустым буфером + единственный
  drawArrays count 0 (WebGL-проход ВЫПОЛНИЛСЯ с пустым буфером — анти-вакуум,
  защита от «проход просто исчез»); tileDraws > 198 (видимая область выросла).

### ТЗ-4: 000177 — портал входа-выхода → PE-6..PE-9

- **PE-6** (flash, город): сценарий как PE-1 (выход [E] из города), затем
  `h.frameFn(NOW+200)` → `h.hud.textContent.endsWith('Вы вышли из ' + dg.name + '.')`.
- **PE-7** (flash, подземелье): сценарий как PE-2 (выход [E] из пещеры),
  name = `D.DUNGEON_NAMES[dg.dg.type]`; тот же endsWith-ассерт.
  Flash наблюдаем, т.к. performance.now() заморожен на 1000 < flashUntil 6000,
  и hud.js дописывает flash ПОСЛЕДНЕЙ строкой (line += '\n' + ctx.flash).
- **PE-8** (тач-канал e2e): `root.id = 'touch-controls'` найден среди детей
  document.body по `ch.id === 'touch-controls'`; actionBtn = первый button с
  className 'tc-action' (alt: img src 'assets/ui/icon_action.svg'); вызов
  `actionBtn.listeners['pointerdown'][0]({preventDefault(){}})`; под-сценарий
  подземелье (тап вне тайла выхода — no-op: dungeon жив, pos/day неизменны;
  тап по тайлу — выход: g.dungeon null, UI закрыт, day+1, player на тайле пещеры,
  flash) + под-сценарий город (выход, day НЕ сдвигается, flash с именем города).
- **PE-9** (debug-канал e2e): `const ds = g.actions.enterDungeon()` (без terrain →
  terrain тайла спавна) → assert ds; g.dungeon — ПРОЕКЦИЯ (свежий объект при
  каждом доступе), пин по ПОЛЯМ, не по identity (identity ds не гарантируется):
  kind 'dungeon', name = D.DUNGEON_NAMES[type], exit deepEqual entrance,
  player на совмещённом тайле, dungeonUI активен; затем KeyE → выход, day+1,
  player на исходном мировом тайле, flash 'Вы вышли из <DUNGEON_NAMES[ds.dg.type]>.
  Контракт «три канала, один код» (клавиатура/тач/дебаг сходятся в
  locationOnInteract/interactExit).

## Что важно будущим задачам

- **Новый тип подземелья с боссом** → обобщить исключение: сейчас guard
  `d.type === DUNGEON_TYPES.ABYSS`; при добавлении босса в другой тип его клетку
  тоже нужно добавлять в `occupied` до takeSpot (иначе та же асимметрия).
- **Не менять форму mobs/chests** (id 'g'N/'c'N, флаг `boss`, порядок полей) и
  **порядок генерации** (блуждающие группы → босс → сундуки): от этого зависят
  D-BOSS-2, пины 000173 (MC7-MC12) и существующие пины 000180.
- **hud.js: flash — последняя строка** textContent → endsWith-пины PE-6/PE-7
  сломаются, если после flash допишется ещё строка.
- **Совмещённый тайл входа-выхода (000177)**: interactExit/exitLocation —
  отдельная область; задача 000183 её код НЕ меняет (только flash-пин и e2e-проход
  каналов). finally-инвариант 000170 (exitLocation) не тронут.
- **dungeon_memory (сессионность)**: контент подземелья в сейв не пишется
  (dungeonMemory — сессионный Map src/main.js; collectSaveData без
  dungeon-полей; src/save.js — 'dungeon' отсутствует) — любые будущие
  изменения generateDungeonContents НЕ инвалидируют сейвы; миграции не
  требуется и не делать (и не будет, пока подземелья не персистятся —
  отдельная задача, версия сейва повышается). Коррекция 000157 (аудит):
  исходное «контент живёт в сейве» — ложно, вывод о миграциях случайно верен.
- **Харнес mob-chase аддитивен**: `makeGl(glCalls)` / `bootSandbox(seed, reject)` —
  дефолтное поведение (без аргументов) сохранено; другие 3 e2e-файла харнес не
  меняли (у global-map-draw makeGl(glCalls) уже был).
- **Пробные скрипты** (не коммитятся, /tmp/thegame-wf-000183/): probe-abyss.js
  (валидация реплики vs реальная функция на золотом пине + сетка 35/1280),
  probe-abyss4.js (Case A/B post-fix + свип 5084), xp18.js (pre/post контент
  (11,3)/xp=18), sweep-time.js (3000 итераций ~168 мс, 69 коллизий на мастере).

## Подводные камни (детали харнесов)

- **groupVisible-шпион (M6)**: оборачивать ОРИГИНАЛ, а не переимплементировать
  (варианты а1/а2 переимплементировали — хуже: пин должен прогонять реальный код
  pass 2.5). Захватить live Map D (defeatedAt) из 1-го аргумента первого вызова.
- **MC8 boot**: boot() дренирует setImmediate ×3 и идёт дальше
  `loadMapPixels().then` → комбат стартует в микрозадачах, ЕЩЁ ДО первого явного
  pump; h.raf = [combatTick, worldFrame] (combat-ui raf'ится при startCombat —
  typeof-гард L129-135 src/combat-ui.js, в песочнице requestAnimationFrame есть).
  Assert h.raf.length === 2; worldFn = h.raf[h.raf.length - 1].
  Формат сейва: `{version:1, savedAt:new Date(0).toISOString(), data}` (seedSave,
  паттерн tests/mob-zones-e2e.test.js L150).
- **MC9**: маркер = 6 floats на вершину, границы [t+0.30..t+0.70]² относительно
  ДРОБНОЙ позиции, EPS 1e-6 (float32-квантизация bufferData: ulp ≈ 2.4e-7 при
  координатах ~2 — не 1e-9); MOB_COLOR [0.85,0.30,0.25];
  assert non-integer позиций в средних кадрах (иначе тест не различает
  «маркер на цели» от «маркер на дробной точке»).
- **MC10**: easeInOut — smoothstep tt·tt·(3−2tt): ease(0.9667)≈0.9933 (T+1450),
  ease(0.9933)≈0.9999 (T+1490 — НАИВНАЯ проверка «ещё не на цели» ЛОЖНО-КРАСНАЯ),
  p≥1 → exactly to (T+1500). Порог offTarget > 1e-3 тайла.
- **MC11**: dealDamageToPlayer не экспортирован в UMD — прямой ассайн c.result
  (паттерн PC-1 из tests/combat-ui.test.js). При 'dead' defeatedAt НЕ пишется →
  группа видна (groupVisible true) — спрайт на якорях, НЕ скрыт.
- **MC12**: FRAME_MS=480 < 700 мс окна сэмплирования → суффикс кадра ЛЕГИТИМНО
  меняется РАЗО В ОКНЕ (now=1440); ассерт «все 14 кадров идентичны» (а1/а2)
  неверен — переучитывать __asset на КАЖДЫЙ кадр от целотайловой координаты.
- **M7**: формула зума `zoom * (deltaY<0 ? 1.2 : 1/1.2)`, clamp [4,128],
  ZOOM_START=80. Прямой ассерт — бит-в-бит `st.zoom === G.ZOOM_START * 1.2`
  (та же операция); обратное колесо — FP-терпимость < 1e-9 (цепочка делений
  не гарантированно точна).
- **M10**: load-time гарды main.js L1856-1857 проверяют typeof findZoneCombat/
  groupZoneInfo — delete после boot не вызывает ошибок загрузки; pass 3 (мобы)
  НЕ зависит от groupZoneInfo — mob-отрисовка должна остаться интактной.
- **RM-9**: reject-цели брать из drawCalls пробного кадра (double-boot: первый
  boot без reject собирает списки путей, второй — с предикатом); предикат
  Image-stub: `v === 'assets/map.png' || (reject != null && reject(v))`
  (map.png всегда отклоняется → детерминированные G.generateSeedPixels).
  Постройка-маркер — 6 вершин на ТАЙЛ footprint (1×1 → 6; иначе 6×F).
- **RM-10**: 22 wheel-out события нужны, т.к. 80/1.2^21 > 4 (одним меньше не хватит);
  анти-вакуум: bufferData 1× + drawArrays count 0 — WebGL-проход выполнен с пустым
  буфером (иначе тест пройдёт, если проход просто исчезнет из кода).
- **PE-6/7**: flash видно только в следующем мировом кадре (h.frameFn(NOW+200));
  performance.now() заморожен на NOW=1000 < 6000 = flashUntil. hud.js
  `if (performance.now() < ctx.flashUntil) line += '\n' + ctx.flash` — flash
  ПОСЛЕДНИЙ, поэтому endsWith (не includes).
- **PE-8**: makeEl.setAttribute() — no-op, НО `root.id = 'touch-controls'` в ui.js
  — прямое присваивание свойства → работает через Proxy и находится среди детей
  body по `ch.id`. Тап: `listeners['pointerdown'][0]({preventDefault(){}})`
  (handler привязан на pointerdown, не click).
- **PE-9**: `g.actions.enterDungeon()` без terrain → `terrain ?? t.terrain`
  (terrain тайла спавна, src/locations.js L436-456) — не передавать terrain,
  чтобы пин зафиксировал дефолтную ветку.
- **−0 нормализация**: сравнения позиций координат — через hostPt/deepEqual-паттерн
  (host-side нормализация −0), не JSON-строки.
- **Красная стадия**: ровно ОДИН фейл — D-BOSS-1 (первый провал xp=18, сундук
  c3 (14,6)); остальные 17 новых пинов зелёные на мастере (17+1 = 18 тестов,
  D-BOSS-2 на красной стадии ещё не существует); все 2012 существующих
  зелёные. После фикса + D-BOSS-2: 0 fail (в ветке 19 новых).

## Статус / план

- Красная стадия: 17 пинов + D-BOSS-1 (красный) = 18 тестов + эти memory-файлы,
  коммит один.
- Имплементация: фикс src/dungeon.js + D-BOSS-2 (репин, значения переверифицировать
  против реальной исправленной функции) → npm test 0 fail.
- npm test на каждом шаге зелёный (кроме единственного красного D-BOSS-1 на
  красной стадии); флейк → перепуск `node --test tests/файл` + запись в отчёт.

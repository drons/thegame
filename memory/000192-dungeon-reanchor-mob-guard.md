# 000192 — Подземелье: re-anchor входного спавна — гард занятости клеткой живого моба

Статус: станция Проектирование завершена — решения финальны (Д1–Д10, §2–§5).
База: master **e6fcbab**, worktree `.worktrees/task-000192`, ветка
task/000192. Baseline от факта (worktree, e6fcbab):
**`node --test tests/` = 2307/2307 зелёных, 0 fail, ~124 с**.
ТЗ: tasks/pending/000192.md (переезжает в tasks/done на мерже).
Исход: tasks/result/000153.01-retro-20261012.md, finding №1 (линза
000153.01). Родительские контракты: memory/000153.01-dungeon-depth-
save.md (§2.4 re-anchor, «Fallback … молча»), memory/000153.03-
floor-transitions.md (D10 — образец predicate). Анализы: /tmp/
thegame-wf-000192/a1-domain.md, a2-arch.md, a3-tests.md (расхождения
между ними разрешены в §2 с обоснованием).

## 1. Что добавлено / перенесено

* **Добавлено** (единственный src-ханк): occupancy-условие в
  re-anchor-условии `maybeEnterDungeon` (src/locations.js:260-267) —
  +2 строки в той же `&&`-цепочке, ПОСЛЕ FLOOR-проверки (§2, Д1).
* **Добавлено**: новый тест-файл tests/dungeon-reanchor.test.js
  (self-contained vm-песочница; RA-1 RED + RA-2/RA-3 контроли).
* **Добавлено**: этот memory-файл, tasks/result/000192.md, перенос
  задачи pending → done. Всё — ОДИН коммит.
* **Перенесено**: ничего — это НЕ вынос модуля. Ни одного нового
  <script>/CSS в index.html, ни одного нового пина index-order,
  ни одного нового UMD-модуля. Шаблон станции «новый UMD-модуль»
  к задаче неприменим (ТЗ «Границы» = 2 файла).
* **НЕ меняется**: ни одной строки в src/dungeon.js, src/main.js,
  dungeon-ui, hud; ascendFloor/D10 (образец — только читать),
  exitDungeon, transitionFloor, spec/. CHANGELOG.md — НЕ трогать
  (внутренняя корректность спавна: не игровой процесс, не графика,
  не управление — обоснование строкой в tasks/result/000192.md).

## 2. Контракты и границы

### Д1. GUARD — точный predicate (ФОРМА: сниппет ТЗ дословно)
Добавляется к re-anchor-условию (src/locations.js:260-267) после
FLOOR-проверки, в конец `&&`-цепочки (порядок как в D10: FLOOR &&
!занято):
```
        d.cells[p.y * d.width + p.x] === G.CELL_FLOOR &&
        !(contents && contents.mobs.some((m) => m && !m.defeated
          && m.x === p.x && m.y === p.y))) {
```
* **Заметка (станция Реализация)**: сниппет ТЗ — самобалансный
  выраженный-операнд (`!(` и `some(` закрываются его собственными
  `))`); при вставке в КОНЕЦ `&&`-цепочки `if` дополнительно нужен
  закрывающий `)` самого `if` — итоговая строка в коде `...p.y))) {`
  (первоначальная транскрипция этого блока Д1 была без этого `)` —
  SyntaxError; исправлено на станции Реализация, код — источник
  правды).
* **Почему сниппет ТЗ дословно, а не полная D10-форма с
  `Array.isArray(contents.mobs)`** (разрешено «решить в анализе»):
  на этой точке `contents` может быть только (a) `saved.contents` —
  прошедший `validateDungeonContents` (dungeon.js:835-843 ТРЕБУЕТ
  `Array.isArray(mobs)`) или (b) результат `generateDungeonContents`
  (всегда строит массив) → `mobs` гарантированно массив на ВСЕХ
  достижимых состояниях; `Array.isArray` добавлял бы защиту только
  от TypeError на не-достоигаемом битом contents (enterLocation
  main.js:2207 без try/catch — throw упал бы в last-resort frame-лупа
  как console.error и сломал ассерт «0 ошибок»). Сниппет ТЗ —
  нормативен и проверен эмпирически (shadow-прогоны: pre-fix RED,
  post-fix GREEN, 0 ошибок).
* **МОЛЧА fail-open** (Д2): else-ветки НЕТ, console.error НЕТ —
  это НОРМАЛЬНАЯ ветка (память истекла к входу, контент
  регенерирован от текущего totalXp, раскладка мобов некоррелирована
  с сохранённым pos), а не деградация/повреждение. Контраст: D10
  (ascendFloor:722-725) ЛОГИРУЕТ — там «клетка лестницы недоступна»
  = аномалия. Родительский контракт молчания:
  memory/000153.01-dungeon-depth-save.md:233 «Fallback: pos
  отсутствует/бит/не FLOOR/за границей → спавн в entrance (молча,
  без warn)» — наша ветка ДОБАВЛЯЕТ причину «занята живым мобом» в
  список молчаливого fallback; SPEC правка не нужна (семантика уже
  задокументирована — ТЗ).
* **Детерминизм** (Д3): условие — чистое сравнение; 0 новых вызовов
  RNG (c._rng / Math.random / generateSeedPixels — нет; regex-пин
  LOC-2 по источнику locations.js остаётся зелёным); сейв-форма НЕ
  тронута (re-anchor — только чтение; запись `saved.lastVisitDay =
  ctx.day`, locations.js:253 — выполняется при ЛЮБОМ исходе
  re-anchor, как сейчас); порядок вызовов на пути
  maybeEnterDungeon не меняется (createDungeon → memory.get →
  contentValid → generateDungeonContents (если истекла) →
  makeDungeonState → re-anchor).
* **Комментариев НЕТ** (Д4, CLAUDE.md e6fcbab): ханк = +2 строки в
  if-условии; существующий коммент-блок locations.js:254-259 НЕ
  редактируется — он станет неполным (не перечисляет occupancy-
  причину); полный контракт живёт здесь + `git blame`.

### Д5. Что не трогаем (границы ТЗ)
ascendFloor/D10 (только читать), exitDungeon, transitionFloor,
src/main.js, spec/, index.html, tests/index-order.test.js, все
существующие тесты (НИКАКИХ семантических или технических правок —
пины RD-1..6, PE-*, LOC-* зелёные без изменений: наша ветка добавлена
в конец цепочки, на покрываемых состояниях ни один существующий пин
не имеет pos под живым мобом).

## 3. Ленивые ссылки и guards

* `maybeEnterDungeon` — `lazyGame()` в начале функции; ctx-гарды
  (map/player/memory отсутствуют) — console.error + return null —
  это ДЕГРАДАЦИЯ, не наш путь. `G.CELL_FLOOR !== undefined` в
  условии — существующий, не меняется.
* Новый гард НЕ вводит новую ленивую ссылку и новую зависимость:
  `contents` — локальная переменная maybeEnterDungeon, в точке
  re-anchor ВСЕГДА ≠ null (восстановлена из валидной записи ИЛИ
  регенерирована; неуспех регенерации — return null раньше).
  `ds.contents === contents` (makeDungeonState вызван до re-anchor,
  :251).
* D10 (ascendFloor:707-718) — тот же predicate занятости, но над
  `ds2.contents` (контент нового этажа) и с `Array.isArray`; НЕ
  трогаем.

## 4. Реальный путь бага + ЛОВУШКИ (подводные камни)

1. **ТЗ-конструкция «досеянная ИСТЁКШАЯ запись» НЕ красная** (главный
   delta, доказан прогоном). `restoreDungeonMemory` при boot
   (main.js:1343) отбрасывает записи, где `!contentValid(lastVisitDay,
   day, window)` (validateDungeonMemoryRec, dungeon.js:913/918) →
   запись, истёкшая на момент boot, НЕ доходит до re-anchor:
   `saved = null` → `p = undefined` → спавн на entrance И ДО фикса →
   тест ложно-зелёный. RD-4 — пин ровно этого поведения.
2. **Единственный достижимый RED-путь**: запись ВАЛИДНА на boot
   (lastVisitDay в окне) и истечает IN-SESSION к моменту входа.
   RAM-Map НЕ обрезается ничем в сессии: serializeDungeonMemory
   (dungeon.js:947) — чистая («НЕ мутирует вход») — обрезает только
   то, что пишется в файл сейва; restore — только при boot; onDay
   (main.js:1500-1560: restoreDay/респауны/buffs/жалованье/render/
   saveNow) dungeonMemory НЕ трогает. День двигается `g.actions.rest()`
   (= clock.rest()) либо `g.actions.setDay(n)` (main.js:3527-3531 —
   это ЦЕПОЧКА clock.rest(): `while (clock.day < target) clock.rest()`).
   contentValid(last, day, 3) = `day <= last + 3` (dungeon.js:813;
   окно = live SETTINGS.dungeon_memory_days, дефолт 3, main.js:95).
3. **Второй достижимый вариант бага (reuse, НЕ посев)**: wanderStep
   (dungeon.js) НЕ исключает клетку игрока из candidates (taken —
   только mob-mob) → живой моб может заблудиться на клетку pos из
   in-flight-сейва → повторный вход с ВАЛИДНОЙ памятью → спавн на
   моба. Фикс покрывает оба варианта ОДНИМ predicate над локальной
   `contents` (в reuse-ветке это saved.contents, в expired-ветке —
   регенерация).
4. **B2-усиление посева** (ловит некорректный фикс): в посеянных
   contents моб на клетке pos помечен `defeated: true` (contents3:
   g0 (12,5) defeated). Тогда (а) сейв легитимен (герой стоял на
   своей клетке после победы), (б) некорректный фикс, проверяющий
   `saved.contents` (там mob defeated), даст спавн (12,5) — останется
   RED; корректный фикс смотрит локальную `contents` (регенерация —
   mob жив) → entrance → GREEN. Доказательство «регенерация
   действительно случилась»: `g.dungeon.contents.mobs.filter(
   m => m.defeated).length === 0` + `g.dungeon.chests === 2` (сеянные
   flags стёрты).
5. **Вход — ТОЛЬКО world-step** (шаг OUT_TILE → CAVE): debug-вход
   `g.actions.enterDungeon` → `debugEnterDungeon` (locations.js:761)
   память НЕ consultит (CB-9) — через него re-anchor с pos
   недостижим.
6. **Анти-провал (ложно-зелёный) запинан node-пре-ассертами** в
   тест-файле до boot (§6): один и тот же посеянный рекорд жив на
   boot-день и мёртв на день входа. Если эти пре-ассерты провалились
   — тест перестал быть красным, ЧИНИТЬ КОНСТРУКЦИЮ, а не фикс.
7. **Рабочие строки ТЗ устарели** (master двигался): re-anchor —
   :260-267 (ТЗ ~:252-259), D10 — :711-718 (ТЗ ~:674-689). Смысл-
   регионы совпадают.
8. **Рабочая область**: ВСЕ команды (тесты, git) — только в worktree
   task-000192; .merge-pending — НЕ создавать/удалять до стадии
   мержа; remote — не трогать.

## 5. Тесты (tests/dungeon-reanchor.test.js — НОВЫЙ файл, префикс RA-)

Self-contained harness — КОПИЯ 1:1 из tests/save-restore.test.js
(конвенция дублирования: 000083/000087/000186): requires (node:test,
assert/strict, fs, path, vm, ../src/save.js SAVE_KEY, ../src/dungeon.js
D, ../src/map.js M, ../src/mapseed.js PS, ../src/player.js P), CHAIN из
index.html, makeGl, makeContext2d, makeEl, makeStorage, seedSave,
bootSandbox, drain, boot, keydownFor, press, release, walkTiles,
assertRestored. НЕ копируются (не нужны — в сценариях нет ни боя, ни
движения в подземелье, ни наблюдения сейва): readSave,
fireBeforeUnload, stepDungeon, winCombat, dungeonBfs, dungeonWalkTo,
neighborFloor, arriveAtChest, killNearestGroup.
expectedRedCount = 1 (только RA-1 — поведенческий RED: deepEqual
спавна (12,5) vs (5,15); RA-2/RA-3 — зелёные и до, и после фикса).

* **RA-1 (флагман, RED→GREEN)** — «клетка pos занята живым мобом
  (память истекла к входу — регенерация) → спавн на entrance, 0
  ошибок». Конструкция (сценарий B2, Д6): seed v1
  `{ day: 7, position: CAVE, dungeonMemory: { [MEM_KEY]: { contents:
  contents3, lastVisitDay: 4, pos: {x:12, y:5} } } }` → boot →
  assertRestored(h, 7) + errors 0 → `g.actions.rest()` (день 7→8;
  8−4 = 4 > 3 — истекла К МОМЕНТУ ВХОДА, буква ТЗ «дней >
  dungeon_memory_days») → walkTiles [OUT_TILE] → [CAVE] (авто-вход).
  Ассерты: `h.errors.length === 0` (МОЛЧА fail-open — НИКАКОГО
  console.error); `g.dungeon.depth === 1`; `g.state.day === 8` (после
  rest) и `g.dungeon.day === 8` (после входа);
  `g.dungeon.mobs.some(m => m.x===12 && m.y===5)` (живой моб на pos —
  ситуация гарда реально материализована, entrance — не случайный);
  `g.dungeon.contents.mobs.filter(m => m.defeated).length === 0` И
  `g.dungeon.chests === 2` (регенерация: сеянные defeated/opened
  стёрты — фикс обязан смотреть локальную contents, не
  saved.contents); `g.dungeon.mobs.length === 3`;
  `deepEqual({x: g.dungeon.x, y: g.dungeon.y}, {x: 5, y: 15})`
  (entrance = exit — ТЗ: g.dungeon.x/y === d.exit) + prevX/prevY на
  той же клетке (контракт спавна 000177). ДО фикса: спавн (12,5) →
  RED. ПОСЛЕ: GREEN.
* **RA-2 (контроль, зелёный до/после)** — «та же конструкция, клетка
  pos ПУСТА → спавн на pos». ТО ЖЕ, но pos = (6,15) (FLOOR, внутри
  5×5 safe-зоны entrance → структурно без моба в регенерации) →
  `deepEqual({x,y}, {x: 6, y: 15})`; `g.dungeon.mobs.length === 3`
  (регенерация: в сеянных contents живых было бы 2 — один defeated);
  errors 0. Пинит: новое условие не перекрывает легитимный
  re-anchor под регенерацией (регрессия контракта RD-3 под новым
  гардом; (6,15) — та же клетка, что в RD-3).
* **RA-3 (контроль, зелёный до/после)** — «mob на pos уже defeated
  (валидная память, reuse) → спавн на pos». Seed
  `{ day: 7, position: CAVE, dungeonMemory: { [MEM_KEY]: { contents:
  contents3, lastVisitDay: 7, pos: {x:12, y:5} } } }` — rest НЕ
  вызывается (вход в день 7: contentValid(7,7) = true → contents =
  saved.contents, reuse) → `deepEqual({x,y}, {x: 12, y: 5})`;
  `g.dungeon.mobs.length === 2` (побеждённая группа не в живых);
  `!g.dungeon.mobs.some(m => m.x===12 && m.y===5)`; errors 0. Пинит
  УСЛОВИЕ ИМЕННО `!m.defeated` (дизайн «занятость ЛЮБЫМ мобом»
  сломал бы этот контроль). Трактовка ТЗ (Д7): «моб на pos уже
  defeated» достижим ТОЛЬКО с неистёкшей памятью (в регенерированном
  контенте ВСЕ mobs живы) — ТЗ валидность записи не фиксирует;
  дизайн берёт ВАЛИДНУЮ (lastVisitDay = день boot, без сдвига дня).

**Д6. Почему именно rest() и lv=4 (выбор конструкции, разрешение
расхождения a2 vs a3)**: a3 предлагала seed lv=7 + setDay(11)
(4 раза clock.rest()); a2 — seed lv=4 + ОДИН rest(). Выбран a2:
минимальный in-session сдвиг (один цикл onDay вместо четырёх —
меньше движущихся частей: payWages/saveNow один раз); анти-провал
запинан ровно на краях окна ОДНИМ рекордом (жива на 7: 7 ≤ 4+3;
мёртва на 8: 8 > 4+3); реалистичнее (посещал 3 дня назад, прошёл
день, вернулся). Оба варианта эмпирически верифицированы; буква ТЗ
(«дней > dungeon_memory_days» на момент входа) соблюдена.

## 6. Детерминистичные пре-контракты сцены (node-реплика, e6fcbab,
hero-дефолты totalXp 0 — сверено прогоном)

* Мир (mapseed 20260926): CAVE = (−20,−20) — passable, hasBuilding,
  !hasMobGroup, terrain GRASS (3); OUT_TILE = (−19,−20) — passable,
  !hasMobGroup, не пещера. MEM_KEY = '−20,−20:1'.
* Пещера: 25×25; entrance = exit = (5,15) (000177: выход = вход).
* Контент при totalXp=0 (сид зависит ТОЛЬКО от totalXp,
  generateDungeonContents): g0 (12,5) lv2, g1 (11,16) lv4, g2 (16,9)
  lv1 — ВСЕ defeated:false; c0 (21,11) gold 34, c1 (13,4) gold 20;
  залежь d0 (17,8). (6,15) — FLOOR, safe-зона entrance; (12,5) — FLOOR
  под g0.
* Регенерация в vm с hero-дефолтами БИТ-В-БИТ node-реплке (в vm:
  map.png → onerror → G.generateSeedPixels() ≡ PS.generateSeedPixels()).
* Окно: dungeon_memory_days = 3 (дефолт global-settings.js:68;
  main.js:95-101 int≥1 иначе 3). contentValid(4,7,3)=true,
  contentValid(4,8,3)=false.
* SEED-РЕКОРД RECUR = { contents: contents3 (deep-copy реплики:
  c0.opened=true, g0.defeated=true, step=3), lastVisitDay: 4,
  pos: {x:12, y:5} } — валидна на boot-день 7, истёкшая на день
  входа 8.
* **Анти-провал пре-ассерты (module-level, node, до boot)**:
  `D.restoreDungeonMemory({ [MEM_KEY]: RECUR }, 7, 3).has(MEM_KEY)`
  === true (запись ДОЖИЛА до boot — иначе re-anchor не увидит pos и
  тест ложно-зелёный) И
  `D.restoreDungeonMemory({ [MEM_KEY]: RECUR }, 8, 3).has(MEM_KEY)`
  === false (запись истекла К ДНЮ ВХОДА — иначе регенерации не будет).

## 7. Что важно будущим задачам

* Список причин молчаливого fallback re-anchor (entrance): pos
  отсутствует / битый / за границей / не FLOOR / **занята живым
  мобом**. Если в будущем появится телеметрия/логи этих причин —
  отдельная задача; контракт «молча» (SPEC-правки не нужно —
  семантика задокументирована в 000153.01).
* Координация: 000191 (волна 1) расширяет save-restore/locations-
  тесты (fail-open пины pos за границей / WALL — ретро finding №4) —
  ДРУГОЙ файл (tests/save-restore.test.js / locations-тесты) и другая
  ветка условия (FLOOR-гард стоит ДО нашего occupancy) —
  ханк-пересечений НЕТ; 000148.05 (общий src/locations.js) УЖЕ
  смержен (c19bcfb; правит регион makeCityState/maybeEnterCity
  ~:131-366, мы ~:260-267) — зависимость «после 000148.05»
  удовлетворена, rebase на свежий master перед мержем ОБЯЗАТЕЛЕН.
* Если в будущем появится ТРЕТИЙ источник `contents` в
  maybeEnterDungeon без гарантии «mobs — массив» — predicate
  `contents.mobs.some` бросит TypeError (enterLocation без try/catch)
  → ready-made hardening — D10-форма с `Array.isArray` (сейчас не
  нужна: оба источника гарантируют массив).
* explored-маска не персистируется (000153.01 §2.4): после re-anchor
  (на pos И на entrance) туман пуст и перестраивается вокруг
  восстановленного спавна — косметика, поведение не меняется.
* pos пишется ТОЛЬКО in-flight (activeDungeonMemoryRec, main.js:
  1477-1491, «активный поверх» в serialize); writeFloorMemory
  (exitDungeon, locations.js:517-528) pos НЕ несёт → re-anchor с pos
  возможен только для записи, прошедшей вайер save-file → restore.
* wanderStep не исключает клетку игрока (taken — только mob-mob) —
  второй достижимый вариант бага (§4.3); если в будущем mob-движение
  изменят — гард останется актуальным (смотрит раскладку на момент
  входа).

## 8. Мерж (только стадия мержа)

* Полный прогон `node --test tests/` (НЕ голый npm test — подхватит
  в-полёте worktrees) — до и после rebase на свежий master.
  Ожидаемо: baseline 2307 + 3 новых = 2310/2310 зелёных (RA-1 RED до
  фикса locations.js, GREEN после).
* .merge-pending (с номером задачи) — создать на стадии мержа,
  удалить после; НЕ трогать на стадиях Проектирование/красная.
* ОДИН коммит ветки task/000192: первая строка «Задача 000192:
  …» (рус.), последний параграф — Co-Authored-By: Claude Code
  <noreply@anthropic.com>. Состав: src/locations.js (+2 строки),
  tests/dungeon-reanchor.test.js (новый, ~300-330 строк), этот
  memory-файл, tasks/result/000192.md (с обоснованием отсутствия
  CHANGELOG и строкой о трактовке RA-3), перенос
  tasks/pending/000192.md → tasks/done/000192.md.
* Мерж в master БЕЗ отдельного мерж-коммита; CHANGELOG.md — НЕ
  трогать (см. §1).

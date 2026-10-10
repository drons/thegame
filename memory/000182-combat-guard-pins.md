# 000182 — Пины задекларированных гардов: боевая область (ретро-20261010) — КОНТРАКТЫ

**Тип задачи: ТОЛЬКО ТЕСТЫ (pin/restore, рефакторинг без смены поведения).**
src/ НЕ МЕНЯЕТСЯ. Все 18 целевых гардов уже существуют в src (проверено построчно)
→ все новые тесты ЗЕЛЁНЫЕ на master, **expectedRedCount = 0**. «Краснота» каждого пина =
coverage gap (пин отсутствовал в тест-файле), доказуемая удалением соответствующего
guard'а в src (см. `memory/000182-combat-test-pins.md`, раздел 3).
Если при реализации пин окажется красным на неменявшемся master — реальный баг:
НЕ чинить src, оставить тест, задача в `tasks/pending` со ссылкой на 000182 + отчёт (ТЗ L32).

ТЗ: `tasks/pending/000182.md`. Worktree `.worktrees/task-000182`, ветка `task/000182`,
старт master head 14d2cd6. Источники пинов — findings «Тесты» в
`tasks/result/000170-retro-20261010.md` … `000180-retro-20261010.md` (7 групп:
000170 e2e, 000171 книга/кнопки, 000174 глейд, 000175 штриховка, 000178 VIS/DOM,
000179 гейт книги, 000180 формула лечения).

Ребейз на свежий master ОБЯЗАТЕЛЕН перед мержем (PARALLEL 000183/000184 пишут в
СВОИ файлы; возможный add/add-конфликт — только хвосты tests/combat-ui.test.js /
tests/movement-freeze-e2e.test.js, если 000183 добавит туда тесты — конвенция:
сохранить все блоки, CU182 — после CU178).

## 1. Что добавлено (18 новых тестов + 2 коммент-правки + 5 аддитивных строк хелперов)

### 1.1 tests/movement-freeze-e2e.test.js — 3 теста В КОНЕЦ (после T10, L1222; EOF = L1260)

| id | гард | что пинит |
|---|---|---|
| MF182-D5B | D5b try/catch вокруг `onEnd` в `finish()` (combat-ui.js L1938-1995, catch L1983-1994, флаг `onEndErrLogged` L162) | инъекция `G.playerUI.render = throw` → `handleCode('Escape')` НЕ бросает наружу, оверлей снят, `current()===null`, `isActive()===false`, `h.errors.length===1` (`/исключение в onEnd/`), мир идёт дальше |
| MF182-D7 | D7 try/catch `collectSaveData` в `saveNow()` (main.js L762-786, catch L773-781, флаг `saveDataErrLogged` L753) | инъекция `G.serializeBuffs = throw` (шов main.js L681) + `G.GlobalSettings.SETTINGS.steps_per_day = 2` → движение и смена дня работают, `h.errors.length===1` (`/collectSaveData/`), после restore новые ошибки не появляются |
| MF182-ONCE | контракт «logged once» (флаг `frameErrLogged` main.js L2785, catch frame L2877-2883) | `G.hud.update = throw`, 3 кадра (`tryMainFrameAt`) → исключение не улетает ни из одного, rAF-цепь жива, `h.errors.length===1` (`/исключение в кадре/`) — ровно 1 на 3 кадра (без флага было бы 3) |

Инъекции — ТОЛЬКО через свойства ОБЪЕКТОВ-ЭКСПОРТОВ на `h.sandbox.Game` (правило
файла L79-83, UMD-ловушка 000038), restore ПЕРЕД ассертами состояния (паттерн T2/T4/T5).

### 1.2 tests/combat-ui.test.js — блок CU182 В КОНЕЦ файла (после CU178-GATE, EOF = L4742)

Уникальный префикс `CU182-`. 14 тестов:

| id | группа ТЗ | гард |
|---|---|---|
| CU182-D10 | 000175 | деградация без `G.mobReachCells`: 1× console.error `/mobReachCells/`, 0 штрихов, drawCalls непусто, 2-й render → по-прежнему 1 (`reachWarned` combat-ui.js L179/L1291-1299) |
| CU182-LW | 000175 | lineWidth===1 на каждом штрихе штриховки (декодер; «стиль один раз до цикла» combat-ui.js L1303; пин — ЭФФЕКТИВНАЯ толщина в момент stroke, не строка L1303 изолированно — combat-test-pins.md §CU182-LW) |
| CU182-H1-2X2 | 000175 | H1 «нарисовано == ядро» для 2×2 (cave_bear): `hatchTiles175` == `G.mobReachCells(c, bear)` |
| CU182-BOOK | 000171 | книга закрывается при успешном тапе (`bookOpen=false` только при успехе castRow L1748 / resurrectCast L1822), остаётся открытой при отказе |
| CU182-BTN8 | 000171 | положительный счётчик: герой со знанием «Воскрешение» → ровно 8 кнопок (7 табличных + resurrect) — зеркало CU171-GATE (отрицательное 7) |
| CU182-NOSP | 000171 | деградация без `G.Spells`: кнопка resurrect ЕСТЬ (canResurrect — чистое чтение знаний), disabled, title/строка «Заклинания недоступны» (resurrectChk L1784-1786), стаб-клик → 1 строка лога, трат НЕТ, книга «—» (entriesFor(unit, null) → []) |
| CU182-NOMOTION | 000174 | тихий фолбэк без motion.js: якорь = модельный тайл, 2 Space без TypeError, `c._uiMoves===null`, **0** console.error (контракт тишины) |
| CU182-PRUNE | 000174 | prune entry мёртвого/сбежавшего юнита (startMoveAnims L610-616) + якорь трупа `!u.alive → {x:u.x,y:u.y}` (mobAnchor L571): труп dead-кадр ровно на модели, сбежавший НЕ рисуется вообще, 2-й Space без TypeError |
| CU182-FRAC | 000174 | Space внутри живого глейда: `from = текущий ДРОБНЫЙ якорь` (startMoveAnims L636-649) — ассерт по КООРДИНАТЕ спрайта (дробной), не только по наличию |
| CU182-UIMOVES | 000174 | инвариант `c._uiMoves`: после КАЖДОЙ endTurn поле содержит только шаги текущего вызова (или null) — сброс `c._uiMoves=null` combat.js L2622, drain startMoveAnims L607-609 |
| CU182-2X2 | 000174 | глейд мультиклеточного 2×2 (cave_bear): весь прямоугольник 2×CELL движется как ОДИН (якорь верхний-левый, mobAnchor L569-590) |
| CU182-VIS-MOB | 000178 | CU178-VIS субкейс: активный юнит = моб (m0) → ОБЕ кнопки (cast+heal) `display==='none'` (castHealVis L1850-1852, activeUnit L1596-1600) |
| CU182-ORDER | 000178 | DOM-порядок `.combat-actions`: последовательность `dataset.act` = [attack, spellbook, block, quickItem, invItem, flee, endTurn, cast, heal, resurrect] (memory/000178 §3.3 — дотягиваемость тапа) |
| CU182-GATE-ORDER | 000179 | фиксированный порядок `spellbookUnitGate` (L1653-1662): c.result → «бой закончен» ПЕРВЫМ; c.phase≠'player' → «не ваш ход» вторым (зеркало resurrectChk, закреплённое у CU171; у книги таких кейсов не было) |

### 1.3 tests/efir.test.js — 1 тест (группа 000180)

**000182-HEAL** — АДДИТИВНЫЕ субкейсы (c) и (d) ВНУТРИ существующего try-блока
теста «000180 HEAL-1» (L1131-1206; вставка после закрывающего `}` субкейса (b) L1202,
до `} finally {` L1203). Ни одна существующая строка не меняется; каталог
`C.combatInternals.allySpells = SPELLS_BY_ID` уже save/set/restored в этом try.

Формула (combat.js allyHeal L1894-1896):
`amount = Math.round((4 + 0.5·(u.attrs[spell['атрибут']]||0) + u.level) · (1 + 0.15·(spell['степень']−1)))`.
Все существующие пины — mend (степень 1 → множитель 1.0) или attrs {} →
**дегенеративная пересборка «сложение вместо произведения»**
(`round(4 + 0.5·a + lvl + 0.15·(степень−1))`) проходит ВСЕ: 7/5/6 — те же.
- (c) `MIRA_180` + `spells:['greater_heal']` (степень 2, атрибут wisdom — spells-data.js
  L195-209), attrs {wisdom:4,dexterity:4,intelligence:4} (инициатива 8 → pre-roll стоп
  на a0, `c.heal()` напрямую), p полный HP, a1.hp=3, `c._rng=()=>0.99`:
  `round(7 · 1.15) = round(8.05) = 8` → «Мира лечит Вольк (+8).» побайтово, a1.hp = 11.
  (Сложение: round(7.15) = 7 ≠ 8 — ловит.)
- (d) тот же greater_heal, `attrs:{}` (инициатива 0 → стоп на ИГРОКЕ → `c.endTurn()` → a0,
  паттерн субкейса (b) L1189-1193): `round(5 · 1.15) = round(5.75) = 6` → «+6.», a1.hp = 9.
  (Сложение: round(5.15) = 5 ≠ 6 — ловит.)
- MP-вобокса НЕ НУЖНО: `allyHeal` НЕ проверяет ману (код L1874-1903 — только
  каталог/спелл/пул раненых) — проверено; `greater_heal.мани=11` ядром не читается.
- Уровень спелла (уровень 3) тоже ядром НЕ читается — только действие/степень/атрибут.

### 1.4 Правки ТОЛЬКО комментариев (ассерты не трогать — ТЗ «правки НЕПРАВДИВЫХ КОММЕНТАРИЕВ»)

1. **000050-пин** (combat-ui.test.js L973-976): «Сетка — единственные g2.stroke() в
   render» — ЛОЖЬ с 000175: `drawMobReachHatch` вызывается в render ПОСЛЕ сетки
   (L1387) и добавляет 'stroke' при targetId → живой non-fled моб (авто-таргет).
   Замена (смысл сохранить): «последний 'stroke' СЕТИ (grid-секция: lineWidth L1367,
   strokes L1373/L1379); после
   сетки идут штрихи штриховки досягаемости (000175) — общий последний 'stroke' сцены
   может быть штрихом штриховки; пин `iObs > lastGridStroke` валиден: штриховка идёт
   МЕЖДУ сеткой и препятствиями». Тест L982-1022 остаётся зелёным без правок
   (hatch-stroke < obstacles-drawImage). Имя переменной `lastGridStroke` (L1002)
   сохраняется.
2. **CU180-EFIR-ROW** (combat-ui.test.js L4306-4307): «(инициатива Эфира 6 > волк 3 >
   игрок 2)» — 6 НЕВЕРНО: `EFIR_START_PRIMARY` (efir.js L150-157) dexterity 1 +
   intelligence 3, `unitInitiative` = dex + int (combat.js) → **4**. Замена:
   «инициатива Эфира 4 > волк 3 > игрок 2». Тест byte-exact (L4303) зелёный и без правки.

## 2. Контракты и границы

### 2.1 UMD-ловушка 000038 — механика, от которой зависит весь дизайн

Каждый UMD-модуль: `root.Game = Object.assign({}, root.Game, factory())` — новый
объект на каждую загрузку. Следствия:

- **combat-ui.js снимает `const G = globalThis.Game` ОДИН раз при загрузке (L80).**
  Поздние модули (motion.js — последним в цепочке) недоступны через G, только
  ЛЕНИВО через `liveGame()` (L96-98) в момент вызова.
- **Две категории инъекций:**
  - свойства, читаемые из СНЯТОГО СНАПШОТА G → инъекция «отсутствия» только
    load-time (до загрузки модуля, снимающего снапшот) — поэтому `withoutMobReach`
    (см. 2.2): `delete sandbox.Game.mobReachCells` ДО `vm.runInContext(src('combat-ui.js'))`.
  - свойства, читаемые в МОМЕНТ ВЫЗОВА через shared-объекты-экспорты
    (`G.playerUI.render`, `G.serializeBuffs`, `G.hud.update`, `G.efir.addEfirXp`)
    → инъекция через свойства ОБЪЕКТОВ на финальном `sandbox.Game` (e2e: `h.sandbox.Game`)
    + ОБЯЗАТЕЛЬНЫЙ restore.
- **Whitebox-мутации** боевого объекта `c` (c.phase/c.result/c.turnIndex/u.alive/
  u.fled) и вызов `c.endTurn()`/`c.heal()` — легитимный путь (прецеденты
  combat-ui.test.js L1582/2710/2728; efir.test.js L1192), не требует shared-инъекции.

### 2.2 loadCombatUi (L141-245) — 2 новые аддитивные опции (дефолт бит-в-бит)

- **`withoutMobReach: true`** — `delete sandbox.Game.mobReachCells;` ПОСЛЕ загрузки
  combat.js (экспорт mobReachCells, combat.js L430) и ДО загрузки combat-ui.js
  (L229). combat-ui.js снимет снапшот G БЕЗ mobReachCells → `drawMobReachHatch`
  (L1287-1313) пойдёт в D10-ветку `typeof G.mobReachCells !== 'function'`.
  ПЕРЕ load-time опцией host-удаление бесполезно (снапшот уже снят).
- **`withoutMotion: true`** — пропуск последней строки
  `vm.runInContext(src('motion.js'), …)` (L238, сейчас БЕУСЛОВНЫЙ). liveGame()
  не найдёт motion → оба фолбэка: `mobAnchor` (L576-581: `!motion || typeof
  motion.stepProgress !== 'function' || segs<=0` → SELF-CLEAN delete entry →
  модельный тайл) и `startMoveAnims` (L636-649: `oldAlive ? mobAnchor : beforePos`,
  oldAlive — false при self-clean).

Прочие опции loadCombatUi: withEfir/withSpells/performance/rAF-стабы (L141-245).

### 2.3 makeContext2d (L28-55) — lineWidth: ОТДЕЛЬНЫЙ массив (критично)

Стаб НЕ записывает lineWidth (set-trap логирует только fillStyle/strokeStyle).
Решение: `el.lineWidthSets = []` — push `[value, evIdx]` при `k === 'lineWidth'`.
**НЕ в `events` и НЕ в `styleCalls`** — иначе `styledCalls` (L1463-1477, else-ветка
`else strokeStyle = ev.s[1]`) сочтёт его strokeStyle, `hatchCallIdx175` (L3268)
сошлёт его вызовом → сдвинут ВСЕ существующие z-порядок-пины (000050 lastGridStroke,
H1/H6, R5-слайсы). Декодер CU182-LW читает из `lineWidthSets` действовавшее
lineWidth на каждом hatch-stroke-индексе (стиль ставится ОДИН раз до цикла —
combat-ui.js L1298-1303: strokeStyle HATCH175 + lineWidth 1; штрих = moveTo(px+8,py+40)
→ lineTo(px+40,py+8) → stroke).

### 2.4 Аддитивные опции сцен (по 1 строке, дефолт бит-в-бит)

- **scene166** (L2770): `spells = true` → `{ withSpells: spells }` (сейчас хардкод
  `withSpells: true`). Для CU182-NOSP: `scene166({deadAllies:1, spells:false})`.
  Без withSpells: spellbook.js грузится ВСЕГДА (existsSync) → G.SpellBook ЕСТЬ,
  G.Spells/G.SpellsData НЕТ → `entriesFor(unit, null)` → `[]` (пустая книга «—»,
  БЕЗ console.error — `spellBookWarned` L157 срабатывает только при отсутствии
  G.SpellBook); кнопка resurrect ВСЁ ЕЩЁ строится (canResurrect — чистое чтение
  unitOf(c).spells).
- **scene178** (L4389): `if (opts.resurrect) hero.spells = ['resurrect'];` (до
  build) — прецедент scene84 L1431 (assignment, не push: hero — свежий
  G.createCharacter(), дефолтный spells перезаписан целиком). Для CU182-ORDER.
- **ROSTER_MEDIC** (L4419) — уже есть (support-наёмник для heal).
- scene166(): hero.spells=['resurrect'] (по прецеденту opts.resurrect=true),
  hero.mp=50, rosterData = Volk melee L1 (хардкод), БЕЗ efir → gates: cast НЕТ
  (нет efir), heal НЕТ (нет merc), resurrect ЕСТЬ → **8 кнопок** (CU182-BTN8).

### 2.5 e2e-инъекции (messages дословно, restore обязателен)

- `G.playerUI.render = () => { throw new Error('MF182-D5B-inject') }` — onEnd
  (main.js L1547-1587) вызывает `G.playerUI.render()` L1584 ПОСЛЕ hudFlash
  («Победа! +50 опыта, +1 золота.» вычислен ДО броска) и ПОСЛЕ combatEndLoot/
  combatEndCompanions (они отработают нормально) → catch D5b.
  Сообщение гарда дословно (combat-ui.js L1989):
  `«combat-ui.js: исключение в onEnd — побочные эффекты конца боя потеряны (повторные предупреждения подавлены).»`
- `G.serializeBuffs = () => { throw new Error('MF182-D7-inject') }` — collectSaveData
  main.js L681: `buffs: G.serializeBuffs ? G.serializeBuffs(buffs) : []` → catch D7.
  Сообщение (main.js L775-776):
  `«main.js: исключение в collectSaveData — сейв не записан (повторные предупреждения подавлены).»`
  saveNow — ТОЛЬКО на успешном шаге (frame L2833-2843: `if (keys.size && tryMove())`
  → … → `saveNow()`), НЕ каждый кадр → ошибка ровно на первом мирном шаге.
- **T12-последовательность** (шаги = кадры с зажатым 'ArrowLeft',
  holdUntilStep): шаг 1 → clock.addStep(1): steps 1<2, дня нет, saveNow →
  ошибка #1; шаг 2 → steps 2≥2 → advanceDay('steps') (day.js L82-88: while
  steps≥perDay — избыток переходит) → onDay (day 2): restoreDay/payWages/
  G.playerUI.render (реальный)/hudFlash «День 2.»/saveNow → подавлен
  saveDataErrLogged (НЕ 2-я ошибка); restore G.serializeBuffs +
  SETTINGS.steps_per_day=40 (ОБЯЗАТЕЛЬНО — SETTINGS живой объект); шаг 3 →
  saveNow реально, ошибок не добавилось (=== 1 суммарно).
  addStep-семантика проверена: perDay читается per-call (liveStepsPerDay).
- `G.hud.update = () => { throw new Error('MF182-ONCE-inject') }` — renderHud каждый
  кадр → catch frame-watchdog. Сообщение (main.js L2879):
  `«main.js: исключение в кадре — главный цикл продолжает (повторные предупреждения подавлены).»`
- **Смена дня в MF182-D7:** `G.GlobalSettings.SETTINGS.steps_per_day = 2` — экспорт
  `G.GlobalSettings` (global-settings.js L61: `{ GlobalSettings: factory() }`),
  `SETTINGS` — живой объект (L53 «SETTINGS — БЕЗ ИЗМЕНЕНИЙ (тот же живой объект)»),
  `day.js liveStepsPerDay()` ЧИТАЕТ `settings.SETTINGS.steps_per_day` В МОМЕНТ
  ВЫЗОВА (контракт 000099, «изменение действует без перезагрузки») → мутация
  после boot() видна следующему `clock.addStep`. steps_per_day=2 → смена дня на
  2-м шаге (onDay L1375-1432: restoreDay → payWages → G.playerUI.render →
  hudFlash «День N.» → saveNow — подавлен тем же флагом D7, НЕ 2-я ошибка).
- e2e-бой ВСЕГДА включает Эфир (main.js L1537-1545 «постоянный союзник — ВСЕГДА,
  включая отладочный бой») → в MF182-D5B ctx.efir != null → D5a (addEfirXp)
  отработает нормально ДО D5b (мы туда не инжектим) → ошибок ровно 1.
- **Мировое движение в MF182-D5B/D7:** `holdUntilStep` (L659) с
  **dir (−1,0) = 'ArrowLeft' ЗАДАЁТСЯ ЯВНО** (не passableDir): SPAWN = (−0,−0)
  (findSpawn — спираль от (0,0)); (−1,0) проверено ДИНАМИЧЕСКИ (реальное
  holdUntilStep ×3: moved=true, combatUI.isActive()=false, день не сдвинулся —
  16.10.2026, seed-карта детерминирована). Zone-бой 000135 (5×5-зона живой
  группы) passableDir НЕ ВИДИТ (фильтрует только hasMobGroup целевого тайла) —
  поэтому «чисто» = проверено ходом, а не статикой.
- MF182-D5B whitebox: `c.phase='over'; c.result={outcome:'victory',xp:50,gold:1,
  defeated:1,allyXp:[]}` → `handleCode('Escape')` (паттерн T4 L935-981).

### 2.6 Дробные якоря re-timing (CU182-FRAC) — математика (детерминированно)

Геометрия R8 (tests/combat-ui.test.js L3749-3822 — БУКВАЛЬНАЯ, не из анализа):
rider (0,0) orc_rider FAST (movePerTurn 2), wolf (3,3) movePerTurn 1, player
(3,6), obstacles.clear(), `c._rng=()=>0.99`, mutable `let T` +
`performance.now: () => T`. Волна 1 (Space T=0): rider path [(0,0),(1,0),(2,0)]
(2 сегмента, 2·MOB_MOVE_MS = 600 мс); wolf path [(3,3),(3,4)] (1 сегмент,
300 мс). Кадр T=150 (rider tAll=0.25, wolf 0.5 — оба живы). Space при **T=550**
(БЕЗ тика между 150 и 550) → волна 2: rider (3,0),(3,1); wolf (3,5).

Формула mobAnchor (combat-ui.js L578-590): `tAll = stepProgress(now, entry.at,
segs·MOB_MOVE_MS)` (линейный, ВЕГО по пути); `raw = tAll·segs`; `i = floor(raw)`;
`lerpPos(path[i], path[i+1], easeInOut(raw−i))`; easeInOut = t²(3−2t);
lerp(a,b,t) = a+(b−a)·t.

- **rider** (entry ЖИВ: T=550 < 600) → `oldAlive=true` → `from = mobAnchor(rider, 550)`:
  tAll = 550/600 = 11/12; raw = 11/12·2 = 11/6; i = floor(11/6) = 1;
  easeInOut(11/6−1 = 5/6) = (25/36)·(3−5/3) = (25/36)·(4/3) = **25/27**;
  from = lerpPos(path[1]=(1,0), path[2]=(2,0), 25/27) = **(52/27, 0) ≈ (1.9259, 0)**.
  СИНХРОННЫЙ render сразу после Space (progress волны 2 = 0): спрайт rider
  x = **8 + 48·(52/27) = 8 + 2496/27 ≈ 100.4444**, y = 8.
  Ассерт: `Math.abs(di[1] − (8 + 48 * (52/27))) < 1e-9` (порядок операций lerp —
  как в src) + дробность (`di[1] % 48 !== 8` — не только «наличие»). Пин
  ОТЛИЧАЕТ альтернативы: `from = beforePos` (снимок (0,0) до endTurn) → x=8;
  `from = модель` (u.x,u.y после волны 1 = (2,0)) / «волна от первой точки
  пути» → x = 8+48·2 = 104. Только re-timing даёт ≈100.4444.
- **wolf** (entry истёк: stepProgress(550, 0, 300) = 1 → oldAlive=false; entry
  НЕ self-cleaned — рендера после T=150 не было, mobAnchor на волка не зовётся;
  startMoveAnims entry ЗАМЕНЯЕТ, не добавляет) → `from = beforePos.get('wolf')`
  = (3,4) (финал волны 1) → спрайт (152, 200) — зеркало пина R8 L3811.
- Окно: T строго < 600 для rider (иначе tAll≥1 → self-clean, окно R7).

### 2.7 Whitebox-паттерны (чистые чтения, не shared-инъекция)

- `c.turnIndex = c.turnOrder.indexOf('m0')` — activeUnitId (combat.js) — ЧИСТОЕ
  чтение `c.turnOrder[c.turnIndex]` БЕЗ phase-гейта → CU182-VIS-MOB: на ходу
  моба activeUnit() → null (find(side==='ally') не находит 'm0') → cast+heal
  `display==='none'`. Инъекция в shared-объект НЕ нужна (замена fixSuggestion
  «стаб G.activeUnitId» — осознанно: whitebox чище и без restore).
- `c.endTurn()` из теста (хост) — CU182-UIMOVES: ядро ПИШЕТ c._uiMoves
  (то-тайлы волны, форма `{id,x,y}`, combat.js L1767-1775), endTurn сбрасывает
  `c._uiMoves = null` ДО advanceQueue (L2622) → после каждой endTurn поле =
  шаги ТОЛЬКО текущего вызова (или null без движения). Волны: wolf (3,2)
  movePerTurn 2 → волна 1 `[{id:'m0',x:3,y:3},{id:'m0',x:3,y:4}]`; волна 2
  (wolf (3,4)) → `[{id:'m0',x:3,y:5}]` (старых записей НЕТ); волна 3 (d=1 →
  атака) → `null` (не пустой массив, не чужие шаги).
- Геометрия UIMOVES: wolf.x = c.px, wolf.y = c.py − 4, obstacles.clear(),
  movePerTurn=2, `c._rng=()=>0.99`; startCombat → pre-roll сброс `c._uiMoves=null`
  (решение C 000174) — первый ассерт.

### 2.8 Чек-поинты реализации (пинить РЕАЛЬНОЕ поведение ядра)

1. **CU182-2X2:** bear (1,3) 2×2 (cave_bear combat.js L157: size {w:2,h:2},
   НЕ fast → movePerTurn 1, инициатива dex1+int1 = 2), player (3,6),
   obstacles.clear(), fake loader `p.startsWith('assets/sprites/mobs/cave_bear_')`,
   `c._rng=()=>0.99`, геометрия ПОСЛЕ startCombat (pre-roll-паттерн R5: bear может
   pre-roll — инициатива 2 = как у player). stepTowardRect (combat.js L669-686):
   bear (1,3) 2×2 (x1=2, y1=4) → player rect (3,6): sx=1 (3>2), sy=1 (6>4);
   adx=ady=1 → TIE → x-first → **шаг (2,3)** (проверено по коду; rectFree —
   поле чистое). Пины: T=0 Space →
   diOf(bear) `[img, 56, 152, 80, 80]` (якорь (1,3), 2×CELL = 96−16 = 80);
   T=150 → `[img, 80, 152, 80, 80]` (якорь (1.5,3), easeInOut(0.5)=0.5,
   дробный x); T=300 → `[img, 104, 152, 80, 80]` (якорь (2,3) — self-clean,
   модель). РОВНО ОДИН drawImage (весь прямоугольник как одно; fallback fillRect
   без loader — 80×80, COLOR по роли).
   Если реальный шаг ядра окажется иным (y-first → (1,4)) — пересчитать координаты,
   СУТЬ пина (дробный якорь + единый 2×CELL-прямоугольник) не меняется.
2. **CU182-BTN8:** scene166() = ровно 8 (проверено: без efir → cast нет;
   rosterData хардкод Volk melee L1 → heal нет; hero.spells=['resurrect']
   + deadAllies 1 → canResurrect true). deepEqual последовательности
   dataset.act 7+resurrect + `S.buttons.length===8`.
3. **CU182-BOOK:** (a) success: scene166({deadAllies:1}) → KeyQ (книга открыта:
   `bookBox.style.display !== 'none'`) → `c.targetId = ally.id` →
   `byAct.resurrect.listeners.click[0]()` → каст (hp=round(maxHP/2), mp−15,
   pool−1) → `bookBox.style.display === 'none'`. (b) deny: СВЕЖАЯ сцена,
   `c.player.mp = 0` (проверенная строка CU171-OFF кейс (b): 'не хватает маны (15)')
   → KeyQ → click → ровно 1 строка лога, трат НЕТ, `display !== 'none'`
   (книга ОСТАЛАСЬ открыта). Выбран mp=0 (простой, проверенный) вместо
   whitebox turnIndex.
4. **CU182-PRUNE:** (a) труп: R8-геометрия; T=0 Space; T=150 sanity-пины живых
   глейдов; `G.combatInternals.dealDamageToMob(c, wolf, 9999)` (экспортированный
   ядерный путь) → T=300: труп dead-кадр РОВНО на модели (152,200) (нужен fake
   loader с '_dead_' фреймом — иначе труп без drawImage), глейд-кадра волка НЕТ;
   T=450 Space doesNotThrow → prune (entry удалён), rider re-timed от дробного
   (1.5,0) → (80,8). (b) fled: `wolf.fled = true` → T=300: drawImage волка
   НЕТ ВООБЩЕ (drawUnits `if (u.fled) continue` L893-896 — даже труп не рисуется);
   T=450 Space doesNotThrow.
5. **CU182-GATE-ORDER:** scene84({spells:true}); KeyQ ДО всех мутаций (R9: иначе
   canDoAction может заблокировать); строки ищутся ПОСЛЕДНИМИ детьми с
   dataset.spell (VM-stub innerHTML='' — no-op → строки ВСЕГДА append в хвост,
   никогда не чистятся). (a) `c.result = {outcome:'victory',xp:0,gold:0,defeated:0,
   allyXp:[]}` → tickSlice → ВСЕ строки −off, title «бой закончен», click → 1 строка,
   трат НЕТ; (b) СВЕЖАЯ: `c.phase='mob'` → «не ваш ход», click → 1 строка;
   (в) ОБА (result + phase='mob') → «бой закончен» — доказательство ПОРЯДКА
   (result ПЕРВЫМ). Сигнатура строки включает chk.ok/reason → мутация c ОБЯЗАТЕЛЬНО
   пересобирает строки.
6. **CU182-NOMOTION:** loadCombatUi(true, {withoutMotion:true, performance:{now:()=>T}});
   R5-геометрия (wolf (3,3)→(3,5), fast, obstacles.clear()); Space T=0 doesNotThrow
   → спрайт на МОДЕЛИ (3,5) — «телепорт»-фолбэк (задокументировано), НЕ дробный;
   `c._uiMoves === null` (drain); T=150 tick → всё ещё модель (нет lerp); 2-й Space
   doesNotThrow; host console.error total === **0** (контракт тишины — в ветке
   фолбэка НЕТ console.error).
7. **CU182-D10:** loadCombatUi(true, {withoutMobReach:true, performance:{now:()=>NOW175},
   …}); авто-таргет = одиночный живой wolf → hatch-секция вызывается (render L1387).
   host console.error wrap/restore try/finally (L165: sandbox console = HOST):
   1-й tickSlice → errors===1 && /mobReachCells/; hatchTiles175 → [] (0 штрихов,
   нет strokeStyle HATCH175 в styleCalls); drawCalls НЕПУСТО (сетка/wolf — рендер
   не упал); 2-й tickSlice → errors ВСЁ ЕЩЕ 1 (reachWarned). Sanity:
   final `sandbox.Game.mobReachCells === undefined`.
8. **CU182-ORDER:** scene178({efir:true, spells:true, roster:ROSTER_MEDIC,
   resurrect:true}) → acts deepEqual `['attack','spellbook','block','quickItem',
   'invItem','flee','endTurn','cast','heal','resurrect']` (порядок build() L250-420:
   7 табличных в порядке first-appearance describeCombatKeys → cast (efir-ally) →
   heal (support-merc) → resurrect (canResurrect)).

## 3. Ленивые ссылки и guards (что читать будущим правкам)

- **liveGame()** (combat-ui.js L96-98) — единственный легитимный путь к поздним
  модулям (motion.js) из combat-ui.js. `motion.stepProgress`/`easeInOut`/`lerp`
  — контракт motion.js (L68-103).
- **combatInternals** (combat.js экспорт L3161+): `allySpells` (ленивый каталог,
  ставится spells.js), `dealDamageToMob`, `mobReachCells` (чистая BFS L430),
  `activeUnitId` — пины ядра идут через них (efir.test.js: save/set/restore).
- **Флаги «logged once»** (все — по 1 console.error на сессию/контекст):
  `onEndErrLogged` (combat-ui.js L162, D5b), `saveDataErrLogged` (main.js L753, D7),
  `frameErrLogged` (main.js L2785, frame), `reachWarned` (combat-ui.js L179, D10),
  `spellBookWarned` (combat-ui.js L157 — только отсутствие G.SpellBook).
- **G.GlobalSettings.SETTINGS** — живой объект; day.js читает live (000099);
  mутации в e2e видны без перезагрузки (T12).

## 4. Что важно будущим задачам (из ТЗ-ссылок и ретро)

1. **Регрессия пинов = баг:** каждый пин 000182 краснеет при удалении своего
   guard'а (карта «что краснеет» — `memory/000182-combat-test-pins.md` §3).
   Рефакторинг combat-ui.js finish()/saveNow()/frame-watchdog/drawMobReachHatch/
   mobAnchor/startMoveAnims/allyHeal ОБЯЗАН пропустить полный набор 000182.
2. **memory/000178 §3.3** — DOM-порядок = дотягиваемость тапа (CU182-ORDER).
   Любая новая кнопка в .combat-actions ОБЯЗАНА встать в конец (после resurrect)
   и попасть в deepEqual CU182-ORDER.
3. **Контракт «тихий фолбэк»** (CU182-NOMOTION): деградация без motion.js —
   МОЛЧИТ (0 console.error) — в отличие от D10 (1 error) и spellBookWarned.
   Новые деградационные ветки combat-ui: решать «молчит или логит» явно.
4. **Контракт «logged once»** (MF182-ONCE): все *ErrLogged/reachWarned-флаги —
   ровно 1 предупреждение. Новая обёртка try/catch в горячем пути (кадр/сейв/конец
   боя) ОБЯЗАНА получить такой флаг.
5. **Произведение в формуле лечения** (000182-HEAL c/d): `(база+0.5·attr+lvl) ×
   (1+0.15·(степень−1))` — произведение, НЕ сложение. Новые степпи лечения
   ОБЯЗАНЫ проходить c/d (при степени 1 они дегенеративны — как 000180).
6. **Дробный re-timing** (CU182-FRAC): `from = mobAnchor(u, now)` внутри живого
   глейда — НЕ beforePos, НЕ модель. Любая правка startMoveAnims/mobAnchor
   сохраняет координату 52/27 (T=550, R8-геометрия).
7. **c._uiMoves** (CU182-UIMOVES): ядро пишет, UI дрейнит (null после каждой
   endTurn/startMoveAnims). Новые потребители — только читать; запись — только
   в endTurn.

## 5. Подводные камни

1. **lineWidth → events/styleCalls = ЛОМАЕТ ВСЕ z-пины** (R1). Только отдельный
   `el.lineWidthSets`. Проверить после правки: 000050 lastGridStroke, H1/H6,
   R5-слайсы зелёные без изменений.
2. **UMD-снапшот** (R2): post-boot `delete G.mobReachCells` бесполезен; только
   load-time опция ДО L229.
3. **host console в loadCombatUi** (L165): D10/NOMOTION-пины — wrap/restore
   try/finally в КАЖДОМ тесте; node --test — файлы в отдельных процессах, внутри
   файла последовательно → утечка исключена при корректном finally.
4. **T12 dir**: (1,0) от SPAWN (0,0) — mobGroup → зональный бой; только 'ArrowLeft'
   (проверено 3 шага).
5. **T12 steps_per_day=2** сработает restoreDay (respawn/лоот) — детерминировано
   (MAP_PNG_SEED), но не трогать ассерты позиции на чётных шагах.
6. **Ридер-волна 2** (CU182-FRAC/PRUNE): путь (3,0),(3,1) — time-independent
   (A* не зависит от T); если ядро даст иной шаг — пересчитать координаты,
   суть пина (дробный from) не меняется.
7. **PRUNE-труп без loader НЕ ВИДИМ** (dead-frame drawImage только if img) →
   нужен fake loader с '_dead_' фреймом (паттерн 000174-блок).
8. **BOOK-кейсы: KeyQ ДО мутаций c** (R9) — иначе canDoAction заблокирует
   открытие; строки книги ВСЕГДА append в хвост (innerHTML no-op) → искать
   ПОСЛЕДНИЕ dataset.spell-дети.
9. **pre-roll** (bear init 2 = player init 2, MIRA init 8): геометрию ставить
   ПОСЛЕ startCombat (паттерн R5), до Space; c._rng=()=>0.99 страховка.
10. **Без нового RNG** (R14): ноль Math.random/c._rng/generateSeedPixels в новых
    тестах (c._rng=()=>0.99 — страховка, не вызов); save shape не меняется;
    HUD/панель byte-exact; [E]-path/isActive (dungeonUI/buildingUI/npcUI) — не
    задеты (боевая область).
11. **000183/000184 регионы** — не трогать (mob-aggro-circle/mob-chase/
    global-map-draw/portal-exit, возможно src/dungeon.js; SPEC.md + spec-тесты).
    CHANGELOG.md — НЕ трогать (чистый рефакторинг). index.html — НЕ трогать
    (новых модулей нет → пины index-order не нужны). .merge-pending — НЕ
    создавать/удалять (стадия мержа).
12. **Коммит** (поздняя стадия): одна строка «Задача 000182: пины задекларированных
    гардов боевой области (ретро-20261010) — только тесты», последний абзац
    «Co-Authored-By: Claude Code <noreply@anthropic.com>»; ребейз на свежий
    master ОБЯЗАТЕЛЕН; push — только локальный master.

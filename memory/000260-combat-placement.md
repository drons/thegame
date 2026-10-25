# 000260 — Расстановка перед боем: Флогистон, Эфир, союзники — в первых двух линиях

ТЗ — `tasks/pending/000260.md` (запрос пользователя 2026-10-23, P1). Тип:
новая функциональность. Worktree: `.worktrees/task-000260`, ветка
`task/000260`. База: master efdec7a (000257 смержен — мягкая зависимость
исполнена). Актуальный master на старте: 9dab04d (сверху 000261) — перед
мержем обязателен rebase одного коммита (зоны пересечения — см. «Подводные
камни», п. 9). Дата: 2026-10-24. Базовый сьют: 3199 pass / 0 fail (замерено
на чистом worktree).

## Архитектура (финальное решение стадии Проектирование)

**Inline-режим (латентное окно) внутри боевого оверлея + пересоздание
c0 → c1.** startCombat строит c0 = makeCore() ИМЕННО как сейчас (якоря,
бит-в-бит, pre-roll отработан — c0 — ЖИВОЙ бой, `current()` сразу после
startCombat). Окно расстановки открыто с момента startCombat и закрывается
ПО ПЕРВОМУ действию (или явным подтверждением). Если финальные позиции
отличаются от якорей — c1 = makeCore(moved) (свежий createCombat с тем же
seed; позиции применяются ДО generateObstacles — reserved/BFS/targetId/
pre-roll — автоматически по новым позициям) + rescue строки первой встречи
Эфира + ctx.combat = c1. Без изменений — c0 остаётся (бит-в-бит).
main.js — НОЛЬ изменений.

Реши openQuestions (решение — почему):
1. ДВА варианта ядра (a1: один вызов + черновик + finalizePlacement;
   arch: c0 → c1) — ВЫБРАН c0 → c1. e2e-сетка (a3 §1.3): current() жив
   СРАЗУ после startCombat, ОДИН Space закрывает завершённый бой, режим НЕ
   блокирует ввод и НЕ откладывает createCombat — черновик (turnOrder=null
   до finalize) ломает это и требует 7 SEMANTIC-ре-пинов e2e + рендер-режим
   «половинчатого» боя (утечка гейта canDoAction в черновике:
   flee/endTurn/spellbook → ok:true). Дефолтный путь в c0-дизайне —
   ЛИНЕЙНО НЕ ТРОНУТ (без выноса хвоста — 0 рефакторинга запиненного
   кода).
2. Pre-экран (отдельный экран до боя) — ОТКЛОНЁН: те же e2e-требования +
   потребовал бы main.js-проводку и новый оверлей (против «минимальная
   проводка»).
3. opts-поле — `placement`, ПЛОСКОЕ `{id: [x,y]}`, id = 'player' или id
   союзника ('efir', 'a1', …). Почему: плоская карта = прямое соответствие
   UI-селекции, без вложенности (a3-вариант `positions: {player, allies[]}`
   отклонён — форма зафиксирована harness-резюме «opts.placement
   {id:[x,y]}»).
4. Частичный placement ДОПУСКАЕТСЯ (не перечисленные = якоря): UI двигает
   по одному; передаётся ТОЛЬКО изменённые id.
5. Точка применения — ПОСЛЕ placeAllies/concat (combat.js :3481), ДО
   generateObstacles (:3485): чисто-детерминированная точка, 0 вызовов RNG
   → запиненный поток не меняется; всё, что читает c.px/c.py и c.units
   ПОЗЖЕ (reserved, mobReachable-BFS, nearestMob/targetId, pre-roll) —
   автоматически «по новым позициям».
6. Нарушение валидации — throw (стиль placeUnits/placeAllies). UI шлёт
   только валидные (подсветка = только допустимые клетки) → throw —
   defensive-гард (a1-вариант «деградация в якоря + reason в log» отклонён:
   маскирует ошибку; C2-тест пинит throw).
7. UI мутирует ЖИВОЙ c0 напрямую (игрок — c.px/c.py, союзник — u.x/u.y), а
   НЕ карту overrides: drawUnits подхватывает позиции без правок,
   free-клетки считаются из живых позиций, «moved» = diff живых против
   снапшота в момент подтверждения. (arch-вариант placeOv-карта + override
   в draw отклонён: два источника правды + override-aware occupancy.)
8. UI-элемент — ОДИН div-бар `.combat-placebar`, ПОСЛЕДНИЙ child
   .combat-actions (grid-column 1/-1): текстовая подсказка + 2 div-чипа
   «В бой [Enter]» (confirm) и «По умолчанию» (reset в якоря). DIV, не
   button — пины buttons.length===8/9/11 (10+ мест) и deepEqual
   dataset.act целы; паттерн 000171/flee-confirm (видимый кликабельный
   элемент, ТОЛЬКО нативный click, pointerdown НЕ добавлять). Отдельного
   чипа «Расстановка» НЕТ (бар и индикатор, и управление — меньше DOM).
9. Клавиатура: Enter = подтверждение (Enter ВНЕ COMBAT_KEYS — свободна);
   Escape (только в selected) — откат к снапшоту + снять выбор, окно
   остаётся. ОКНО ЗАКРЫВАЕТ ТОЛЬКО ПРИНЯТОЕ ЯДРОМ ДЕЙСТВИЕ (правка по
   итогам ревью 2026-10-25 — см. «Правки по итогам ревью», п. 2):
   таблица-ветки — move: c.move сначала, closePlacementWindow() ТОЛЬКО
   при mv.ok (отклонённый шаг — reason в log, окно живёт; после свапа
   шаг повторять на c1 — edge: c1-препятствие → rejection в log, окно
   закрыто); action: r.reason → ТОЛЬКО c.log.push (окно НЕ закрывает),
   иначе closePlacementWindow() + runAction на c1. Ветки KeyH/KeyK и
   клики по action-кнопкам (включая «Побег») — БЕЗ ПРАВОК (ревью-решение
   «принято как есть»): closePlacementWindow() ПЕРЕД исполнением —
   runtime-отказ inside (нет цели и пр.) окно уже не вернёт (позиции
   зафиксированы, ход НЕ потрачен; lastSpellPress/book-state не
   ретраивается на c1 — риск > польза). (a1-формула «action-клавиши
   (кроме Space) авто-подтверждают, Space — no-op» — принадлежит дизайну
   A и НИЧТОЖНА: в B Space — тот же endTurn что и сейчас, «ловушка
   первого хода» не возникает, т.к. окно не блокирует ход — без участия
   игрока всё бит-в-бит.)
10. Выбор цели кликом (моб / мёртвый союзник / мёртвый игрок) НЕ закрывает
    окно (выбор ≠ действие, a3 §3.2): canvas-ветка fall-through'ит в
    существующую логику без изменений.
11. c0.result (pre-roll убил игрока) → окно закрыто и невидимо
    (гейт !c.result), пересоздания НЕТ: бой идёт как сейчас (pre-roll уже
    отработан на якорях — ТЗ «могут его убить» — существующая механика).
12. НЕТ новых SVG (текстовые div-чипы) → tests/svg.test.js 'ui':12 не
    ре-пинится, паттерн 000124 «иконка + aria-label» кнопок не ломается;
    НЕТ новых <script> → tests/index-order.test.js без правок.
13. main.js — НОЛЬ изменений: окно ВСЕГДА открыто в каждом startCombat,
    игрок вправе игнорировать (любое действие закрывает). (a1-вариант
    «placement:true в startCombatAt» отклонён — флага не нужно.)
14. E2E-ре-пины — ОЖИДАЕТСЯ 0 (a1-список из 7 — для дизайна A). В idle
    ввод боя работает 100% как сейчас (Space = endTurn, KeyW = move,
    result+Space = finish). На стадии реализации — ОБЯЗАТЕЛЬНЫЙ sweep
    (grep по первому взаимодействию после startCombat во всех e2e).

## Что добавлено/перенесено

### Ядро (src/combat.js, 3707 строк)
* `validatePlacement(c, placement)` — ЧИСТАЯ функция, НОВЫЙ ЭКСПОРТ
  (return-объект, рядом с allyRoom): `{ok:true} | {ok:false,
  reason:string}`. Зона: y ∈ [max(0, height−2), height−1] (7×7 → 5..6;
  height 4 → 2..3; height 1 → 0 — формула от height), x ∈ [0, width−1],
  целые; ключ — 'player' или id союзника из c.units (side 'ally');
  финальная конфигурация = игрок (новый или c.px/c.py) + ВСЕ союзники
  (свои новые или якоря) + ВСЕ прямоугольники мобов (зафиксированы) —
  дубликат клетки → reason. BFS НЕ дублируется: существующий гард
  generateObstacles (mobReachable, :3294-3306) покрывает достижимость —
  reserved строится из НОВЫХ позиций.
* `applyPlacement(c, placement)` — модульно-локальная: 'player' → c.px/
  c.py; id союзника → u.x/u.y. (Позиция игрока — ПОЛЕ БОЯ c.px/c.py,
  hero-объект по позиции НЕ мутируется — задокументировано в ТЗ/ядре:
  playerMove :1557+.)
* createCombat: МЕЖДУ `if (allies.length) { placeAllies; concat }` (:3478-
  3481) и `generateObstacles(c)` (:3485) — вставка 3-4 строки:
  `if (opts.placement) { const chk = validatePlacement(c, opts.placement);
  if (!chk.ok) throw new Error(chk.reason); applyPlacement(c,
  opts.placement); }`. Без placement — ветка не выполняется, дефолтный
  путь НИЧЕГО не меняется (все goldens бит-в-бит, C0-гард).
* Wording reason (внутренний — throw + C2-ассерты «non-empty string»):
  'расстановка: <id>: клетка вне поля';
  'расстановка: <id>: вне первых двух линий';
  'расстановка: <id>: клетка занята';
  'расстановка: неизвестный юнит <id>';
  'расстановка: <id>: некорректные координаты'.
* НОЛЕВЫЕ изменения: placeUnits, placeAllies, allyRoom,
  generateObstacles, buildTurnOrder/advanceQueue, nearestMob, refillPools,
  log-блок, retarget, якоря, pre-roll-механика, сейвы, статы союзников/
  Эфира.

### UI (src/combat-ui.js, 3359 строк)
* Модульное состояние (рядом с fleeBox/fleeOpen): `let placebarEl = null,
  placeOpen = false, placeSel = null, placeAnchors = null;`
  `placeTargetPick` (правка ревью — id явной цели, клик по мобу в
  окне). placeGate() = `placeOpen && !!ctx && !ctx.combat.result`.
* startCombat: фабрика `makeCore(placement)` (замыкает ТЕКУЩИЕ аргументы
  createCombat: player: opts.hero, groupType, mobs, mobLevel, groupName,
  seed, day, buffMods, allies: alliesArr, efirMet + buildEfirUnit +
  _allyQuickLive); `const combat = makeCore();` вместо прямого вызова —
  дефолтный путь: тот же вызов, те же аргументы (бит-в-бит). alliesArr
  переиспользование БЕЗОПАСНО (makeAlly ТОЛЬКО ЧИТАЕТ data — проверено;
  unit-объекты новые на каждый createCombat). ctx += makeCore и
  heroSnap = {hp, mp, _lastUnkillDay} героя, снятый ДО makeCore()
  («Подводные камни», п. 1); ctx += efirSnap = {skillXp, secondary,
  skills} сейва Эфира ДО makeCore() (правка ревью — симметрия
  heroSnap: pre-roll c0 practiceEfir'ит ОБЩИЙ сейв) и baseCombat
  = null (правка ревью — c0 при свапе; finish() зеркалирует
  союзников в него перед onEnd — main.js читает c0.units, см.
  «Правки по итогам ревью», п. 1).
* build(): ПОСЛЕ resurrect-блока, в .combat-actions — бар: div
  `.combat-placebar` > span `.combat-placebar-hint` (текст «Расстановка:
  клик по юниту, затем по клетке (строки N–M)», N=c.height−2, M=c.height−1)
  + div `.combat-placebar-btn combat-placebar-btn--reset` («По умолчанию»)
  + div `.combat-placebar-btn combat-placebar-btn--go` («В бой [Enter]»).
  Слушатели (нативный click, pointerdown НЕТ): --go →
  closePlacementWindow() + render(); --reset → resetToAnchors() +
  placeSel=null + render(). display:'none' до render. placeOpen = true
  (окно существует с момента боя; видимость — через гейт).
* Canvas-клик (после нормализации cx/cy :624-643, ПЕРЕД mob-веткой :645):
  если placeGate(): клик по ЖИВОЙ клетке героя (cx===c.px && cy===c.py &&
  c.player.alive) → toggle выбора 'player'; клик по ЖИВОМУ союзнику
  (side 'ally', alive, !fled, rect-формула как в mob-ветке) → toggle
  выбора u.id; если placeSel && (cx,cy) ∈ placeFreeCells(c) → перенос
  (c.px/c.py = cx/cy ИЛИ u.x/u.y = cx/cy); если placeSel && клетка
  невалидна → reason в c.log + no-op; ИНАЧЕ (моб/мёртвый/мимо) —
  fall-through в существующую логику (selectTarget/canResurrectPick —
  окно НЕ закрывается). Снапшот: при ПЕРВОМ переходе idle→selected
  placeAnchors = {player:[c.px,c.py], <allyId>:[u.x,u.y], …} (до первого
  выбора переносить нечего → эквивалентно снапшоту на open).
* handleCode: `const c` → `let c`; новые ветки/хуки (порядок):
  (a) Escape-ветка: `if (c.result) finish(); else if (placeGate() &&
  placeSel) { resetToAnchors(); placeSel = null; }` (без selected —
  прежний no-op);
  (b) НОВАЯ ветка МЕЖДУ c.result-веткой и KeyH: `else if (code ===
  'Enter' && placeGate()) { closePlacementWindow(); render(); return true;
  }` (окно закрыто → Enter фоллбук в таблицу → {kind:'none'} — как
  сейчас, consumed=false);
  (c) в KeyH-ветке, KeyK-ветке и в r.kind==='move' / r.kind==='action' —
  ПЕРЕД исполнением: `closePlacementWindow(); c = ctx.combat;`
  (lungeGate-гард ОСТАЁТСЯ НА ВЕРХУ — инертен в лундж-окне; fleeOpen —
  раньше всех; c.result-ветка — выше placement-ветки, кроме Escape-
  подветки, где гейт placeGate() сам включает !c.result).
* closePlacementWindow(): guard (!placeOpen || !ctx → return false;
  ctx.combat.result → снять состояние, return false); moved = diff живых
  позиций (c.px/c.py; u.x/u.y союзников) против placeAnchors — только
  изменённые id; moved пуст → c0 остаётся; иначе: ВОССТАНОВИТЬ heroSnap
  (p.hp/p.mp/p._lastUnkillDay) И efirSnap (skillXp/secondary/skills —
  pre-roll c0 practiceEfir'ит общий сейв Эфира, п. ревью 3) →
  c1 = ctx.makeCore(moved) в try/catch (console.error once + остаётся
  c0 — паттерн 000170 D4; при throw — restore hero AND efir pre-state)
  → rescueEfirLine(c0, c1) → ctx.combat = c1 → ctx.baseCombat = c0
  (правка ревью — для зеркала в finish) → c1.selectTarget(
  placeTargetPick), если есть (правка ревью — явная цель переживает
  свап; selectTarget самовалидирует — цель мертва в c1 → авто).
  Возврат: true ⇔ бой пересоздан (правка ревью — move-ветка handleCode
  закрывает окно ТОЛЬКО при возвращённом true и повторяет шаг на c1).
  Затем placeOpen=false, placeSel=null, placeAnchors=null,
  placeTargetPick=null.
* rescueEfirLine(c0, c1): L = G.efir && G.efir.breathInfo &&
  G.efir.breathInfo.firstEncounter (ленивое чтение в момент вызова);
  i = c0.log.indexOf(L); если i >= 0 && c1.log.indexOf(L) < 0 →
  c1.log.splice(i, 0, L). Индекс стабилен: строки ДО i идентичны по сиду
  («Бой: …» — тот же groupName/level/mobs.length из тех же opts/rng-
  префикса + лидер-строка). Без G.efir / opts.efirMet / без Эфира —
  no-op (тихо).
* resetToAnchors(): if (placeAnchors): c.px/c.py = снапшот игрока; каждый
  союзник u.x/u.y = снапшот. Мутирует живой c0.
* placeFreeCells(c) — модульно-локальная, чистая: строки
  max(0, c.height−2)..c.height−1 ∩ поле ∩ НЕ занято (игрок c.px/c.py +
  ВСЕ rect'ы c.units, включая мобо-rect'ы) ∩ !c.obstacles (UI-строгость
  для визуальной согласованности; ядро obstacles НЕ проверяет — клетка
  юнита в c1 reserved и НИКОГДА не станет препятствием).
* UI-отказы (в c.log, паттерн «отказ — в журнал, а не тишина», 000037/
  000048): 'Расстановка: вне первых двух линий.'; 'Расстановка: клетка
  занята.'; 'Расстановка: клетка занята препятствием.'
* render(): (1) ПОСЛЕ drawUnits + drawBreathFx/drawCastFx/syncAttackFx —
  СТРОГО УСЛОВНЫЙ блок `if (placeGate() && placeSel)`: свободные клетки
  (placeFreeCells) — `g2.fillStyle = ALLY_MARKER_UNDERLAY` ('rgba(140,
  242, 252, 0.25)' — СУЩЕСТВУЮЩИЙ const :124) + fillRect(x*CELL, y*CELL,
  CELL, CELL) на клетку; кольцо выбора — strokeStyle '#ffe27a', lineWidth
  2, strokeRect(px+4.5, py+4.5, w−9, h−9) (стиль существующего
  target-кольца :1217-1220). В дефолтном состоянии — 0 вызовов (goldens
  000084/000151-A1/000175-з-порядок целы). (2) Бар:
  `if (placebarEl) placebarEl.style.display = placeGate() ? '' : 'none';`
  (рядом с fleeBox-гейтом). (3) Кнопки: `b.disabled = c.phase !== 'player'
  || !!c.result || !ok || (placeGate() && placeSel !== null);` — в
  selected action-кнопки гашены (в idle — как сейчас, бой работает).
* Ленивое чтение ctx.combat в build()-замыканиях (механика; без свапа —
  no-op, бит-в-бит): 7 табличных кнопок (`runAction(ctx.combat, …)`),
  «Каст»/«Лечение»/«Последнее заклинание» (`lastSpellPress(ctx.combat, …)`),
  «Воскрешение» (`resurrectCast(ctx.combat)`), fleeYes
  (`confirmFlee(ctx.combat)`) — в каждом: ПЕРЕД исполнением
  closePlacementWindow(); canvas-клик — fresh `const c = ctx.combat;`
  в начале обработчика (внешнее c build-области — только для
  build-решений: canvas.width, гейты кнопок — состав юнитов не меняется
  между c0/c1). fleeNo/bannerEl.onclick — c не используют, без правок.
* Teardown — ОБЕ ТОЧКИ (правило 000170/000199/000227/000237): в finish()
  (:3084-3104 список) И в catch startCombat (:3296-3341 список) —
  placebarEl = null; placeOpen = false; placeSel = null; placeAnchors =
  null. (makeCore/heroSnap — на ctx → умирают с ctx=null.)

### CSS (index.html) — ТОЛЬКО в скоупе .combat-overlay--combat
После flee-confirm-блока (:494-540). Базовые .combat-overlay/
.combat-side/.combat-actions/.combat-log — без правок (стражи 000124/
000246/000254). Все цвета — СУЩЕСТВУЮЩИЕ в файле (проверено):
```
.combat-overlay--combat .combat-placebar {
  grid-column: 1 / -1; display: flex; align-items: center; gap: 8px;
  padding: 6px 8px; border: 1px solid #6b6248; border-radius: 6px;
  background: #2c3040;
}
.combat-overlay--combat .combat-placebar-hint {
  flex: 1; font: 11px ui-monospace, monospace; color: #e8dcc0;
}
.combat-overlay--combat .combat-placebar-btn {
  padding: 8px 12px; border-radius: 6px; font: 700 12px ui-monospace,
  monospace; cursor: pointer; user-select: none;
}
.combat-overlay--combat .combat-placebar-btn--go {
  background: #6fdc6f; color: #101418;
}
.combat-overlay--combat .combat-placebar-btn--go:hover {
  background: #8bf58b;
}
.combat-overlay--combat .combat-placebar-btn--reset {
  background: #2c3040; color: #e8dcc0;
}
.combat-overlay--combat .combat-placebar-btn--reset:hover {
  background: #3a4150;
}
```
(пары #6fdc6f/#8bf58b и #2c3040/#3a4150 — существующие hover-паттерны
flee-btn--no и obstacle-фолбэка; L1-пин: ВСЕ правила новых классов — с
префиксом .combat-overlay--combat.)

### SPEC (spec/combat.md, 24 строки)
Новый h2 «## Расстановка перед боем» в КОНЦЕ файла (первый h2 в файле;
срезы h1/h2-хелперов wording-теста не конфликтуют). Дословно:
```
## Расстановка перед боем

Между началом боя и первым ходом игрок может переставить Флогистона,
Эфир и союзников в пределах первых двух линий карты со стороны игрока
(при 7×7 — строки y=5 и y=6). Без перекрытий и без выхода за границу.
Мобы не расставляются (их сторона и якоря — как есть).
По подтверждению (кнопка «В бой» / Enter) бой стартует с текущими
позициями; по умолчанию — якоря как сейчас.
Режим действует до первого действия игрока: шаг или действие,
принятые ядром, закрепляют позиции и закрывают режим.
```
(правка ревью: финальная фраза переформулирована LINE-NEUTRAL —
«любое действие» противоречило новой семантике отклонённого ввода;
36-строчный пин spec-split цел.)
S1 wording-пины (дословно, norm-белые): 'первые две линии';
'строки y=5 и y=6'; 'Без перекрытий'; 'Мобы не расставляются';
'по умолчанию — якоря как сейчас'; 'до первого действия';
'принятые ядром' (правка ревью).

### Тесты (RED — EOF-блоки; имена префикс 000260-)
tests/combat.test.js (+1 символ в require-шапке: validatePlacement —
краснота = осмысленный TypeError «not a function», паттерн 000132):
* C0 (ГАРД, зелёный сразу): без placement — дефолт = якоря бит-в-бит
  (игрок (3,6), Эфир (px−1,py−1), союзники по якорям; точный набор
  obstacles по сиду).
* C1: createCombat({placement:{player:[1,5], efir:[3,5], a1:[2,6]}}) —
  юниты на переданных клетках; мобы deepEqual с боем без placement
  (тот же seed). Краснота: поле игнорируется → c.px=3/c.py=6.
* C2: validatePlacement — y=4, y=7, x=width, перекрытия (игрок↔союзник,
  союзник↔моб-rect), неизвестный id → {ok:false, reason}; y=5..6 → ok;
  height 4 → y=1 отказ / y=2 ок; assert.throws(() => createCombat({…,
  placement:{player:[3,4]}})). Краснота: экспорт отсутствует.
* C3: obstacles — reserved из НОВЫХ позиций (явный opts.rng: камня на
  новых клетках нет; старый якорь игрока больше не reserved → набор ≠
  якорному; 2 прогона seed+rng+placement → deepEqual c.obstacles).
* C4: targetId = nearestMob от НОВОЙ клетки игрока; pre-roll-снимок
  (log/позиции/turnOrder) по новым позициям; 2 прогона → deepEqual.
tests/combat-ui.test.js (vm, loadCombatUi; сцены scene84 {efir}/rosterData;
клик — canvas.listeners.click[0], CELL=48):
* U1: бар — ПРЯМО ПОСЛЕ startCombat: findByClass('combat-placebar')
  существует, display '', в скоупе .combat-overlay--combat, у чипов
  нативный click (listeners.click ≥ 1), pointerdown НЕТ; в дефолтном
  startCombat (без c.result) — виден. Краснота: элемента нет.
* U2: клик по клетке героя (3,6) → selected (подсветка free-клеток
  строк 5–6 в drawCalls: fillRect fillStyle 'rgba(140, 242, 252, 0.25)');
  клик (1,5) → c.px=1, c.py=5; клик по Эфиру → клик (4,5) → efir (4,5);
  подтверждение (Enter / клик «В бой») → G.combatUI.current(): позиции
  закреплены, мобы на якорях, targetId по новому месту, c.obstacles
  построены (reserved из новых). Краснота: режима нет — клик = no-op.
* U3: клик (3,4) / на занятой союзником / на клетке моба — позиция НЕ
  меняется, режим жив (допустимая клетка — перенос).
* U4: после первого действия (например, endTurn) — позиции закреплены:
  повторный клик НЕ двигает, клик по волку = selectTarget как прежде,
  бар display none, в drawCalls 0 подсветочных вызовов.
* U5: teardown ОБЕ ТОЧКИ: finish (победа) и catch-ветка — следующий
  startCombat стартует чисто (режим выключен, 0 подсветки в первом
  render, бар новый, на якорях).
tests/combat-layout.test.js: L1 — CSS режима: cssRule('.combat-overlay--
combat .combat-placebar') есть (grid-column '1 / -1', background
'#2c3040'); ВСЕ правила, содержащие 'combat-place', имеют префикс
'.combat-overlay--combat'; стражи баз (320px/170px/margin-bottom 0) —
зелёные.
tests/spec-combat-wording.test.js: S1 — h2(h1('# Боевая система'),
'Расстановка перед боем') + norm-фразы выше.
ИТОГО: 11 RED + 1 гард C0. Верификация: npm test → 3200 зелёных + ровно
11 красных (каждое падение — осмысленное отсутствием); зелёная стадия →
3211/3211; изоляция `node --test --test-name-pattern "000260"`.
TECH-ре-пины — ОЖИДАЕТСЯ 0 (нет <button>, нет SVG, нет <script>,
e2e-поток не тронут). Если sweep найдет случай — только технический
(под новый путь), с записью в отчёт.

### CHANGELOG.md
«## 2026-10-25» → «### Игровой процесс»: буллет «Расстановка перед
боем. До первого хода можно переставить Флогистона, Эфира и союзников
в пределах первых двух линий своей стороны (строки 5–6); без изменения
бой стартует, как раньше.» (программная часть не перечисляется; дата
— дата мержа, правка по итогам ревью: в рабочем черновике стояло
2026-10-24).

## Контракты и границы

* Бит-в-бит: без placement — код-путь не тронут (ветка не выполняется;
  дефолт НЕ рефакторится — в отличие от a1, хвост createCombat НЕ
  выносится). Игрок не участвовал (ничего не трогал / любое первое
  действие без переноса) → c0 остаётся, hero-состояние — ровно как сейчас
  (урон pre-roll c0 — реальный, как в production сегодня).
* Детерминизм с placement: seed+placement → идентичный c (C3/C4).
  Разные позиции → ВОЗМОЖНЫ другие obstacles (reserved другой) и другой
  pre-roll (мобы из новых позиций) — это ТЗ («препятствия генерируются
  с reserved из новых позиций», «targetId/pre-roll по новым позициям»),
  не баг.
* Зона: y ∈ [max(0, height−2), height−1] — формула от height; ВСЕ
  дефолтные якоря ВНУТРИ зоны (игрок (3,6); союзники y=5..6) →
  «ничего не трогать» всегда легально.
* Мобы — НИКОГДА не расставляются (placeUnits не тронут; их rect'ы —
  фиксированный фон валидации).
* Бар: div (не button — пины), нативный click только (000171), видим
  только при placeGate(); после подтверждения / при c.result — display
  none; после первого действия — навсегда скрыт (окно однократное).
* Окно: в idle ввод боя 100% как сейчас (e2e-сетка a3 §1.3 цела); в
  selected — action-кнопки disabled + canvas-подсветка; выбор цели ≠
  действие (не закрывает окно); Escape в selected — откат, окно живёт.
* Hero-объект: позиции — поля боя (c.px/c.py, u.x/u.y), НЕ поля героя;
  hp/mp/_lastUnkillDay — поля героя, общие для c0/c1 → пересоздание ТОЛЬКО
  после восстановления снапшота (см. п. 1 «Подводных камней»).
* Сейвы: бой не сейвится — схема сейва не меняется. allyQuickLive/
  lastSpells — live-карты main.js по ссылке (те же объекты — c1
  re-sync'ит syncAllyQuickLive как c0).
* E2E: zero re-pins ОЖИДАЕТСЯ; sweep по первому взаимодействию после
  startCombat — обязательный этап реализации.

## Ленивые ссылки и guards

* Г-снапшот один раз при загрузке (000038): G.createCombat /
  G.efir.buildEfirUnit / G.efir.breathInfo — вызовы в момент
  makeCore/rescue через модульный G (combat.js и efir.js грузятся ДО
  combat-ui.js — порядок пинен tests/index-order.test.js). Новых
  загрузочных зависимостей НЕТ.
* G.efir в rescue — ленивое чтение в момент вызова; без G.efir —
  rescue no-op (тихо, не крах — паттерн 000112/000113).
* closePlacementWindow → ctx.makeCore(moved) в try/catch: console.error
  ОДИН раз + c0 остаётся (паттерн 000170 D4 — игра не падает).
* placeFreeCells — null-guard c.obstacles (production — всегда Set).
* heroSnap-restore — простые присваивания (undefined-толерантно).
* validatePlacement — чистая (0 c._rng, 0 мутаций) — единый источник
  правды для createCombat; UI валидирует перенос сам (placeFreeCells),
  throw в UI-потоке недостижим.

## Что важно будущим задачам

* Единственный прецедент «пересоздания» живого боя (свап ctx.combat):
  closePlacementWindow + makeCore (фабрика в startCombat, НЕ второй
  startCombat — isActive()-гард его заблокировал бы). Будущие до-боевые
  режимы строить на makeCore-паттерне.
* Любые будущие ИЗМЕНЕНИЯ позиций до боя — ТОЛЬКО в чистой точке между
  placeAllies и generateObstacles (combat.js :3481-3485); позже — сломает
  запиненный RNG-поток (goldens combat.test.js) и reserved/BFS.
* Лог «Бой: …» + one-shot Эфира живут в createCombat (сессионный флаг
  efir.js, НЕ сейв): любое повторное createCombat той же сессии строки
  не получит — rescue-сплайс обязателен для ЛЮБОГО пересоздания.
* Бар — grid-ребёнок .combat-actions: будущие панели-кнопки — ПЕРЕД ним
  (иначе — ре-пин DOM-порядка / бейдж-обхода :7041).
* Ссылки ТЗ: memory/000124 (CSS-скоуп), 000171 (touch-кнопка), 000178
  (кнопки каст/лечение), 000167 (инициатива/pre-roll), 000170/000199/
  000227/000237 (teardown обе точки), 000203 (lungeGate — выше всего),
  000175 (z-порядок рендера), 000151 (бэкинг, 0 безусловных вызовов
  render), 000113/000118 (Эфир: одна встреча, Вдох).

## Правки по итогам ревью (2026-10-25)

Коммит «Задача 000260: правки по итогам ревью». Вердикты: blocker ×2,
minor ×7. Правки — src/combat-ui.js (код), spec/combat.md (line-neutral
переформулировка), CHANGELOG.md (дата), tests (новые тесты ниже).
main.js — по-прежнему НОЛЬ изменений (фикс blocker'а — зеркало в
finish(), а не в main.js).

1. **(blocker) Stale c0 в main.js — гибель союзника в живом бою невидима.**
   main.js (контракт 000087/000161) держит c0 (return startCombat) и в
   onEnd → combatEndCompanions(res, combat) читает c0.units
   (`u.side==='ally' && u.kind==='merc' && !u.alive` → deadMercs +
   splice + «X погиб в бою.»). При свапе c0→c1 гибель/бегство/урон
   союзника в живом бою c1 c0 не отражал. Фикс: ctx.baseCombat = c0 при
   свапе (closePlacementWindow); в finish() ПЕРЕД onEnd — зеркало
   союзников live(c1)→base(c0) ПО ID (alive/fled/hp; id уникален —
   npcId). Без свапа baseCombat=null → ноль эффектов. НЕ «зеркало в
   момент свапа» (решение ревью): гибель в c1 ПОСЛЕ свапа (реальный
   бой) всё равно была бы невидима — только finish-time mirror
   закрывает. Тест: e2e в tests/companions-cycle.test.js (паттерн V5 +
   canvas-клики расстановки + Enter-свап + мутация merc1.alive=false +
   Escape → deadMercs/splice/hud/сейв; RED-проверено: без зеркала
   падает на ассерте merc0.alive).
2. **(minor ×2) Отклонённый ввод НЕ закрывает окно** (SPEC-противоречие
   «любое действие закрепляет»): handleCode move-ветка — c.move СНАЧАЛА,
   closePlacementWindow() ТОЛЬКО при mv.ok (reason в log, окно живёт);
   после свапа шаг повторять на c1 (closePlacementWindow возвращает
   true/false — true ⇔ пересоздал). r.reason-ветка action — ТОЛЬКО
   c.log.push (окно не закрывает). KeyH/KeyK и action-кнопки — БЕЗ
   ПРАВОК (решение: close first, runtime-отказ после — позиции
   зафиксированы, ход не потрачен; lastSpellPress/book-state не
   ретраивается на c1 — риск > польза; задокументировано как остаток).
   SPEC переформулирован line-neutral: «шаг или действие, принятые
   ядром, закрепляют позиции и закрывают режим» (36-строчный пин
   spec-split цел; новый wording-пин 'принятые ядром'). Edge (документ):
   шаг принят в c0, но c1-препятствие на той же клетке → повтор
   отклонён в log, окно уже закрыто (клетка free в c0 по
   placeFreeCells, но obstacles c1 генерируются заново — reserved
   другой). Тесты: U7 (wall-шаг + KeyE «быстрые слоты пусты» — окно
   живёт, без свапа; Space — свап+close).
3. **(minor) Утечка практики Эфира c0→c1.** pre-roll c0 practiceEfir'ит
   ОБЩИЙ сейв Эфира (opts.efir — тот же объект; skillXp/secondary/
   skills мутированы, 000117) — buildEfirUnit c1 читал бы НАКРУЧЕННЫЕ
   уровни (эфира c1 — «сильнее», чем сейв игрока; несимметрия против
   heroSnap). Фикс: ctx.efirSnap = {skillXp, secondary, skills} ДО
   makeCore() в startCombat (копии, efirData-гейт); restore ПЕРЕД
   makeCore(moved) (на c0.efirState — тот же объект), при throw —
   restore pre-state (симметрия hero). c1 pre-roll допустим: практика
   ≤2 bank не дотягивает до следующего уровня (cost 15×(lv+1) ≥ 30).
   Тест: U8 (white-box practiceEfir +100 → secondary.perception 3;
   свап → c1 efirSkills.perception 1 И сейв 1).
4. **(minor) Явная цель терялась при свапе.** Клик по мобу в окне —
   selectTarget в c0; c1 пересоздавался с авто-целью (nearestMob от
   новых позиций). Фикс: placeTargetPick (модульный; запись в
   canvas-fall-through при placeGate); closePlacementWindow после
   ctx.combat=c1 → c1.selectTarget(placeTargetPick) (selectTarget
   самовалидирует: цель мертва/сбежала в c1 → авто). Ресет:
   closePlacementWindow (все выходы), finish, catch startCombat.
   Тест: U6 (2 волка; клик по дальнему m1; от (1,5) авто = m0 —
   c1.targetId остаётся 'm1').
5. **(minor) CHANGELOG-дата** 2026-10-24 → 2026-10-25 (дата мержа):
   буллет перенесён в НОВЫЙ раздел «## 2026-10-25» (над 2026-10-24;
   «Дальность хода Флогистона в бою» остаётся в 2026-10-24).
6. **(minor, принято без правки) ТЗ «выбор юнита (в очереди)» не
   реализован** — осознанное решение стадии Проектирования: ВСЕ
   расставляемые юниты видны и кликабельны НА ПОЛЕ (canvas-ветка
   player/ally); очередь ходов (turnorder-токены) — декоративна и
   клики не получает (контракт 000167/000175: токены не интерактивны).
   Ре-интерпретация ТЗ-буллета «выбор юнита» = выбор на поле.
7. **(minor, окружение, без кода) perf-flake tests/map.test.js
   tileAt (бюджет 5000 ms, load-зависим).** Полный npm test на этой
   машине (тихая) — 3211/3211 зелёный; флейк ревью не воспроизвёл.
   Если упадёт под нагрузкой — re-run одиночного файла
   (node --test tests/map.test.js) + запись в tasks/result. Усиление
   бюджета — отдельная задача (не в скоупе 000260).
8. **Rebase (стадия мержа, НЕ правки ревью):** коммиты правок — на базе
   efdec7a; на момент правок master = 46cf74b (+6: 000230.15, 000252,
   000253, 000250, 000230.17.01, 000251 — spec/items|spells|craft|
   dungeons-storage + tests). Зоны пересечения: CHANGELOG.md (верх —
   новые секции; наша правка добавляет «## 2026-10-25» сверху),
   tests/spec-split.test.js (SPEC_FILE_LINES — если master менял
   pinned-файлы; наш line-neutral), combat-ui.test.js (000261
   renderVictoryLoot-пины — выше, не конфликт), CSS index.html.
   Rebase → полный npm test → .merge-pending → ff-only.

Новые тесты (правки): tests/combat-ui.test.js U6 (цель переживает
свап) / U7 (отклонённый ввод) / U8 (утечка практики Эфира);
tests/companions-cycle.test.js e2e «гибель наёмника в ЖИВОМ бою после
свапа» (blocker, паттерн V5); tests/spec-combat-wording.test.js S1
+пин 'принятые ядром'. Все RED-проверены (отключение фикса →
осмысленное падение).

## Подводные камни

1. **HERO ОБЩИЙ МЕЖДУ c0 И c1** (opts.hero — тот же объект; c.player = p).
   Pre-roll c0 (быстрые мобы/Эфир действуют ДО первого действия игрока)
   МУТИРУЕТ героя: P.takeDamage → p.hp/p.alive; «Несокрушимость» →
   p._lastUnkillDay (combat.js:1029-1032). Без снапшота пересоздание
   после «бесплатного» pre-roll c0 стартует реальный бой УВЕРОШЕННЫМ
   героем (и потраченным Несокрушимостью). Фикс: heroSnap = {hp, mp,
   _lastUnkillDay} ДО makeCore() в startCombat; restore ПЕРЕД
   makeCore(moved) в closePlacementWindow. (arch.md это ПРОПУСТИЛ —
   поймано на Проектировании, верифицировано по dealDamageToPlayer :999 /
   takeDamage sheet.js:530.)
2. **One-shot Эфира** (efir.js:867-870, сессионный флаг, не сейв): c0
   потребляет; без rescue строка «Эфир материализуется…» теряется в c1
   (save.test.js CU118-SAVE пинит строку в c0.log — пройдёт, но c1.log
   обязан её содержать — U2/U5-тесты).
3. **Подсветка — СТРОГО условная** (placeGate() && placeSel): 000084-
   golden рендера — в КЛЕТКЕ ЭФИРА (2,5) = строка 5; безусловная
   подсветка строк 5–6 на старте сломает drawCalls-golden; 000151-A1 —
   НИКАКИХ безусловных вызовов в render.
4. **buttons.length пины** (8/9/11 в 10+ местах) + deepEqual dataset.act:
   бар и все будущие чипы панели — div, НЕ <button> (стаб makeEl
   считает только tag==='button', combat-ui.test.js:181).
5. **.combat-side (7 детей) / .combat-box (4)** пинены deepEqual —
   новых элементов там НЕТ; бар — в .combat-actions (селекторы пинов
   фильтруют 'button'; тест-обход всех children :7041 проверяет только
   бейдж .combat-actcount — у бара его нет — зелёный).
6. **handleCode: const c → let c** + свежее чтение ПОСЛЕ
   closePlacementWindow (иначе действие исполнится на отброшенном c0).
   Точек исполнения 4: KeyH-ветка, KeyK-ветка, r.kind 'move', r.kind
   'action'. Enter-ветка — ДО них (return true).
7. **c.result — ПЕРЕВЕС** над placement-веткой (кроме Escape-подветки,
   где placeGate() сам несёт !c.result): white-box e2e (мутация result +
   Space/Escape → finish) — без правок.
8. **lungeGate (000203)** — гард ОСТАЁТСЯ ПЕРВЫМ в handleCode (окно
   лунджа инертно и в режиме расстановки; overlay pointer-events:none —
   бар инертен). LV3 e2e (KeyW после окна = move) — зелёный: lunge-гард
   раньше placement, после окна — move как сейчас.
9. **Rebase перед мержем**: база efdec7a; master 9dab04d (000261 —
   renderVictoryLoot + CSS .combat-victory-loot + баннер-пины). Зоны
   пересечения ханков: хвост render() (вызов renderVictoryLoot),
   CSS index.html (victory-loot-блок рядом с flee-confirm),
   combat-ui.test.js (баннер-пины). 1 коммит → rebase → полный npm test.
10. **alliesArr в makeCore** — переиспользование безопасно (makeAlly
    :361-… только читает data; unit-объекты новые на каждый
    createCombat); efirData — один раз до makeCore.
11. **«Бой: …» строка идентична в c0/c1** (groupName/level/mobs.length —
    из тех же opts и rng-префикса: delta-roll и count-roll — первые два
    броска) — основа стабильности splice-индекса rescue.
12. **Свapped-бой и анимации**: свап происходит ДО первого действия
    игрока → moveAnims/atkLayer/atkKids пусты (pre-roll не анимируется —
    c._uiMoves=null всегда на выходе createCombat) — артефактов анимации
    нет.
13. **Свайп-порядок в canvas-клике**: placement-ветка ПЕРЕД mob-веткой,
    НО fall-through обязан сохранить порядок живой > мёртвый союзник >
    мёртвый игрок (000166/000193.02) — ветка только ЗАБИРАЕТ
    player-side живых + переносы, остальное — как было.

## План реализации (по файлам; оценка дельты)

* RED-стадия (только тесты + memory, 1 коммит): tests/combat.test.js
  (+~120 строк, C0–C4 + require-символ), tests/combat-ui.test.js
  (+~200, U1–U5), tests/combat-layout.test.js (+~30, L1),
  tests/spec-combat-wording.test.js (+~25, S1), memory/000260-combat-
  placement.md. → npm test: 3200 зелёных + ровно 11 красных.
* GREEN-стадия (1 коммит, всё вместе — атомарно; разбивка на подзадачи
  НЕ рекомендуется: ядро+UI без друг друга не работают и красят e2e):
  * src/combat.js: +~90 строк (validatePlacement, applyPlacement,
    вставка createCombat, экспорт).
  * src/combat-ui.js: +~170 строк + ~10 механических правок (lets,
    makeCore+heroSnap в startCombat, бар в build, canvas-ветка,
    handleCode-хуки ×5 точек, render: подсветка+бар+терм кнопок,
    closePlacementWindow/resetToAnchors/rescueEfirLine/placeFreeCells,
    teardown ×2, ленивые чтения в 7 замыканиях).
  * index.html: +~40 строк CSS (после flee-confirm-блока).
  * spec/combat.md: +~10 строк (h2).
  * CHANGELOG.md: +~5 строк (буллет, дата 2026-10-24).
  * e2e-sweep: grep по первому взаимодействию после startCombat (Space/
    KeyW/Enter/click) во всех e2e-файлах; найденное — только
    технические правки + запись в tasks/result/000260.md.
  → npm test: 3211/3211.
* Мерж: rebase на master (9dab04d+), полный тест, .merge-pending,
  ff-only; после — ретро-агенты по правилу CLAUDE.md п. 3.
* ИТОГО: ~+650 строк, 9 файлов (8 + memory); НЕТ новых файлов в src/,
  <script>, SVG; main.js — 0 правок.

## Финализация (2026-10-25)

* Статус: выполнено, задача в tasks/done; мерж в master — стадия
  мержа (rebase → полный npm test → .merge-pending → ff-only).
* Цифры (свежие): npm test в worktree — **3215/3215, 0 fail**;
  база efdec7a — 3199, +16 новых top-level тестов; полный сьют
  master 46cf74b — 3252/3252 (после ребейза ожидается 3252+16=3268).
* Коммиты (ветка task/000260): 06cc5dd (красные тесты), fbbec70
  (реализация), a2a0904 (правки по итогам ревью — финальный).
* CHANGELOG — «## 2026-10-25» закоммичен вместе с a2a0904 (не
  отдельным коммитом): дата = дата мержа = 2026-10-25.
* Новый риск ребейза (в §8 выше его нет): tests/spec-split.test.js
  — master (000252) уже перевёл H2 62→63 (items.md «Редкость и
  дроп»), мы — 62→63 (combat.md) → ПОСЛЕ РЕБЕЙЗА счётчик = 64
  (заголовок теста + assert); SPEC_FILE_LINES — наша строка
  combat.md 24→36 соседствует с ре-пинами master (000259/000252/
  000230.17.01/000251). Полный список зон (6 шт., по ханкам) —
  tasks/result/000260.md, «Подводные камни».

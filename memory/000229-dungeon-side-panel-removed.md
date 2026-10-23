# 000229: правое информационное окно подземелья — убрать совсем

Статус: ЗАВЕРШЕНО (реализация + красные→зелёные + ревью + правки;
финализация — отчёт tasks/result/000229.md; ждёт мержа в master).
Полный сьют на финализации: 2607/2607 pass, 0 fail, exit 0.
ТЗ: tasks/pending/000229.md (1 строка: «Цели задачи 000212 достигнуты не
полностью. Правое информационное окно нужно совсем убрать.») →
tasks/done/000229.md. База: master 28fb20a; на момент финализации master
сдвинулся (d77f798 = 000225, тот же src/dungeon-ui.js + тот же раздел
CHANGELOG 2026-10-16) — перебазировка и разрешение конфликтов — на
стадии мержа (§8, п. 8). Входы: a1-domain.md, a2-arch.md (арбитраж),
a3-tests.md — все строки ниже пересверены с кодом worktree.

## 0. Что такое «правое информационное окно»

Панель `.dungeon-overlay .combat-side` (CSS: index.html L640-646 —
`position: absolute; top: 16px; right: 16px; width: 270px;
background: rgba(16,18,24,0.85)`), создаваемая `build()` в
src/dungeon-ui.js (L395-456) для ОБОИХ kind'ов оверлея локации
(подземелье и город — один оверлей `.combat-overlay dungeon-overlay`).
После 000212 в подземелье (kind==='dungeon') в ней остались только
logEl (`.combat-log` — последние 8 строк `s.log`) и hint (`.combat-state`
— строки управления + контекстная «Залежь — [E]» 000157.03): stateEl
(инфо) из подземелья уже убран (city-only, 000212 D2). Окно всё ещё
висит справа поверх канваса подземелья → цель 000212 достигнута не
полностью. `#hud` (left:12 top:12) — НЕ «правое окно» — это единое
инфо-окно 000212, оно ОСТАЁТСЯ. Боевой `.combat-side` (в
`.combat-overlay--combat`, combat-ui.js) — ДРУГОЙ оверлей, не
затрагивается. `.char-panel`/`.squad-panel` — не «правое окно»
(fixed inset 12px).

## 1. Решения (D1-D14) — все открытые вопросы закрыты

* **D1 — скоуп и смысл «совсем»**: в подземельях панель НЕ СОЗДАЁТСЯ
  ВООБЩЕ (элемент `side` целиком: stateEl-ветка + logEl + hint), включая
  лог и hint. ПЕРЕНОС лога/хинта в `#hud` НЕ ДЕЛАЕТСЯ — чистое удаление.
  Город (kind==='city') — БАЙТ-В-БАЙТ (тот же скоуп, что 000212: «В
  подземельях и пещерах»; город — вне скопа). Почему: ТЗ «убрать
  СОВСЕМ» + цель 000212 (окно перекрывает подземелье — ЛЮБОЕ содержимое
  панели перекрывает) + принцип «не больше и не меньше».
* **D2 — условие в build()**: `if (s0 && s0.kind === 'city')` вокруг
  L408-452 (создание `side` → `overlay.appendChild(side)`). Почему:
  legacy-фикстура makeState (tests/dungeon-ui.test.js L365) БЕЗ поля
  kind = dungeon — негативная форма («нет kind = город») дала бы панель
  в подземелье; production dungeonState — kind:'dungeon'
  (src/locations.js L120), city — kind:'city' (L150).
* **D3 — гард render()**: единственная незащищённая запись — L942
  `logEl.textContent = ...` → `if (logEl) logEl.textContent = ...`.
  stateEl — уже под `if (stateEl)` (L927), hintEl — уже под
  `if (hintEl)` (L940). Почему: забыть гард → TypeError в render() при
  ЛЮБОМ входе в подземелье (frame → watchdog 000170; в node-тестах —
  crash).
* **D4 — вычисления dist/floorStatusLine/onDeposit в render()
  ОСТАЮТСЯ НА МЕСТЕ** (L909, L918-922, L938-939): не переносятся в
  `if (stateEl)`. Почему: минимальный diff, O(1) на кадр, и строка-
  литерал 'floorStatusLine' ОБЯЗАТЕЛЬНО остаётся в src/dungeon-ui.js —
  структурные пины DH-5 (dungeon-info-window) и 000153.03
  locationLine (dungeon-ui.test.js L3305-3351).
* **D5 — новые RED-тесты — НОВЫЙ файл tests/dungeon-side-panel.
  test.js** (RW-1..RW-4 RED + RW-G1 гард, expectedRedCount = 4); в
  tests/dungeon-info-window.test.js правится ТОЛЬКО ТЗ-вынужденный
  DH-4 + шапка. Почему: dungeon-info-window.test.js — зона возможного
  оверлапа с параллельной 000225 (тот же файл dungeon-ui.js render());
  отдельный файл минимизирует зону мержа; прецедент — свой файл на
  задачу (000212 → dungeon-info-window.test.js).
* **D6 — SPEC в задаче НЕ ПРАВЛЕТСЯ**: spec/dungeons-storage.md
  L138-139, хвост буллета «Рендер» («…строка hint „Залежь — [E]" — как
  есть.») ПОСЛЕ мержа устаревает (хинт исчезает с панелью). Почему:
  (а) ТЗ 1 строка — «не больше и не меньше»; (б) формулировка ЗАПИНАНА
  дословно tests/spec-000218-wording.test.js W2 (L105-124) — правка
  SPEC = семантический re-pin чужого pin-теста, не вынужденный ТЗ;
  (в) прецедент проекта (ретро-000212 major finding → док-задача
  000218). НУЖЕН follow-up док-задача на синхронизацию SPEC (создать
  после мержа / в ретро). Побочное: message W2 цитирует
  «dungeon-ui.js:941» — информационный текст assert'а, НЕ ассертируется
  → файл 000218 не трогаем, пометка здесь.
* **D7 — index.html 0 diff**: CSS-правило `.dungeon-overlay
  .combat-side` (L640-646) ОБЩЕЕ с городом (один класс оверлея у обоих
  kind'ов) — остаётся. Почему: удаление = сломан город + CSS-стражи
  combat-layout.test.js L66-70 (270px/absolute), craft-layout G2 (L182),
  build-menu-layout, npc-layout.
* **D8 — main.js / hud.js / locations.js 0 diff**: пуши в `ds.log`
  (main.js L2613/L2730/L2800/L2811/L2817/L2822) НЕ удаляются — данные
  сохраняются (из подземелья уходит только ОТОБРАЖЕНИЕ logEl); `ds.log`
  не персистится (serializeDungeonMemory — только contents/
  lastVisitDay/pos) → сейвы не затронуты. z-lift `#hud` '25' (main.js
  frame() L3386-3396, общий динамический слот 000206) — интактен;
  dungeon-формат #hud (hud.js buildLine 000212) — интактен — это
  ЕДИНСТВЕННОЕ инфо-окно подземелья (RW-2 фиксирует «инфо осталось»).
  hudFlash (5 с) — события (сундук/залежь/победа) по-прежнему видны.
* **D9 — действие [E] НЕ ТРОГАЕТСЯ**: keydown → ctx.onInteract →
  locationOnInteract (main.js: сбор залежи/лестница/выход) работает как
  раньше; исчезает только DOM-подсказка «Залежь — [E]» (000157.03) и
  строки управления. Почему: подсказка — рендер панели, действие —
  main.js; ТЗ — про окно.
* **D10 — re-pins (4 файла, ТЗ меняет поведение; прецедент 000212 §4.2;
  городские части везде БЕЗ ПРАВК)**:
  1. tests/dungeon-info-window.test.js — шапка (L1-59: «log+hint —
     сохранены») + DH-4 (L707-743: «ровно 1 .combat-state + 1
     .combat-log» → «в .dungeon-overlay НЕТ .combat-side/.combat-
     state/.combat-log; оверлей = canvas»). DH-1/2/3/5/6/7/8 — без
     правок.
  2. tests/dungeon-ui.test.js — 6 мест: L1990-1993 (коммент
     allByClass), L2283-2292 (city-тест, dungeon-регрессия dHint),
     UI-DEP-2 (L3143-3172), UI-DEP-3 dungeon-часть (L3174-3197),
     UI-GRD-1 (L3200-3255, 3 субкейса a/b/c), 000153.03 stateEl
     dungeon-фаза (L3272-3303; титл описывает ДО-000212 — finding
     ретро), 000153.03 depth-aware hint обе dungeon-фазы (L3353-3404).
     000153.03 locationLine (L3305-3351) — БЕЗ ПРАВК.
  3. tests/deposit-e2e.test.js — шапка; helper hintText (L418-426,
     assert states.length >= 1 → dungeon: 0); DE-1 hint-ассерты
     (L509-511 «Залежь — [E]», L544-545 «строк НЕТ после ухода») →
     0 .combat-state в оверлее. ОСТАЛЬНОЕ DE-1 без правок (+2
     инвентарь, ds.log «Залежь: +2 <имя>», gathered:true, hud-flash
     endsWith, повторный [E] no-op); DE-2..DE-5 — без правок.
  4. tests/city-interact.test.js — hintOf (L1685-1697, assert >= 1 —
     dungeon-вызов упадёт: helper город-смысл, assert ≥1 только для
     города) + CI-V3 dungeon-субблок (L1833-1840) → 0 .combat-state;
     город-часть (L1816-1824) — без правок.
* **D11 — comments**: новых комментариев к новым строкам НЕ пишется
  (CLAUDE.md); устаревшие блоки, описывающие ИЗМЕНЁННОЕ поведение —
  правка-минимум (000212-прецедент): шапка L41-46 («панель подземелья
  хранит только log + hint»), build() L410-412 (000212-нота),
  L231-234 (hintEl/hintBase), render() L923-926 (000212-нота),
  L935-937 (000157.03-нота — 000229: строка контекста «Залежь — [E]»
  — ТОЛЬКО город, в подземелье панели нет).
  Полное обоснование — в этом файле.
* **D12 — pointer-пометка в memory/000212-dungeon-hud-window.md**
  (L60, §D2 «панель в подземелье ХРАНИТ logEl + hint» — устарело с
  000229: панель в подземельи убрана целиком → указатель на
  memory/000229-*.md). Почему: прецедент 000212-ревью (устаревший
  статус = finding).
* **D13 — CHANGELOG.md**: задача меняет экран игрока (в подземелье
  исчезают журнал и подсказки) → отдельный коммит «Задача 000229:
  CHANGELOG — …», дата = дата мержа, секция «### Интерфейс» (формат по
  записи 2026-10-15), программная часть не перечисляется.
* **D14 — инварианты поверхности**: G.dungeonUI (start/close/vision/
  isActive/render/touchHold/touchRelease) — без изменений; 0 новых
  полей модуля (в подземелье stateEl/logEl/hintEl = null, hintBase = ''
  — то, что даёт close() L1024-1041; close() не меняется); 0 новых
  SVG/модулей/script-тегов (index-order зелёный), 0 RNG, 0 сейв-
  форматов, 0 боевых правок, 0 полей ctx renderHud.

## 2. Что добавлено/перенесено

Добавлено: 0 элементов, 0 модулей, 0 ассетов. Убрано (только DOM-
рендер подземелья): создание элемента `side` (`.combat-side`) в
build() — весь блок L408-452 уходит в `if (s0 && s0.kind === 'city')`;
запись logEl в render() — под `if (logEl)`. Ничего не переносится:
журнал и подсказки в подземелье исчезают, данные `ds.log` продолжают
житься в состоянии (main.js), отображение — только город. Инфо
(имя подземелья/«Глубина: N»/«До выхода: ~N клеток») уже в `#hud` с
000212 — остаётся единственным инфо-окном.

## 3. Контракты и границы

* **DOM-контракт оверлея локации** (после 000229):
  * подземелье (kind==='dungeon' или kind отсутствует — legacy):
    `.dungeon-overlay` = canvas ТОЛЬКО (1 прямой ребёнок);
    `findAll('.combat-side' | '.combat-state' | '.combat-log')` = 0.
  * город (kind==='city'): `.dungeon-overlay` = canvas + `side`
    [stateEl (.combat-state, имя города + status), logEl (.combat-
    log), hint (.combat-state, текст БИТ-В-БАЙТ: «Стрелки/WASD — шаг.
    \nДверь — вход и выход: встаньте на неё и нажмите [E].\n[E] —
    постройки.»)] — байт-в-байт до 000229.
    → УСТАРЕЛО с 000247: город — canvas ТОЛЬКО (правая панель
    убрана совсем, включая лог/хинт); см.
    memory/000247-city-dungeon-panels.md.
  * боевой оверлей (.combat-overlay--combat, combat-ui.js) — свои
    .combat-side/.combat-actions/.combat-log — не тронуты.
* **Условие build()** — ИМЕННО `s0 && s0.kind === 'city'` (D2).
* **rebuild-путь** (transitionFloor: close→start→build): панель
  отсутствует и после перехода этажей (RW-3) — удаление структурное
  в build() по kind, а не точечное.
* **Граница города**: байт-в-байт (DH-7(b), city-screen C1-C5, RW-G1).
  → УСТАРЕЛО с 000247: оверлей города = canvas ТОЛЬКО (панель
  убрана совсем; новые тесты — tests/city-side-panel.test.js).
* **Граница боя**: боевой .combat-side не тронут (RW-4, все combat-*).
* **Граница данных**: ds.log пишется, не персистится; сейвы/RNG/
  детерминизм боя — интактны.
* **Граница SPEC**: текст spec/dungeons-storage.md L138-139 не
  меняется (W2 000218 зелёный); рассинхрон → follow-up док-задача.

## 4. Ленивые ссылки и guards

* `live.locations.floorStatusLine` (render() L918-920, live-чтение по
  паттерну 000038) — не меняется; consumer'ы теперь только городские
  (stateEl/status), строка-литерал остаётся в файле (DH-5,
  000153.03).
* Гарды render(): `if (stateEl)` (L927, есть), `if (hintEl)` (L940,
  есть), НОВЫЙ `if (logEl)` (L942) — в подземелье все три null;
  hintBase = '' (close()); вычисления dist/floorStatusLine/onDeposit
  без гардов (чистые, O(1), D4).
* `close()` (L1024-1041) — не меняется: уже обнуляет overlay/canvas/
  g2/stateEl/logEl/hintEl/hintBase/ctx.
* Тач-D-pad — виртуальный (touchstart на оверлее, L317-361), DOM-
  элементов панели не использует; keydown на window — оба не
  затронуты.

## 5. Тесты

* **НОВЫЙ tests/dungeon-side-panel.test.js** — RW-1 (RED, node:
  makeState 5×5 → start → 0 .combat-side/.combat-state/.combat-log,
  canvas + drawCalls > 0, errors 0); RW-2 (RED, fullchain: enterDungeon
  + кадр → оверлей = canvas; #hud zIndex '25', 1-я строка имя,
  «До выхода: ~N», без «---»/«групп(ы)»); RW-3 (RED, fullchain:
  переход этажей → НОВЫЙ оверлей тоже без панели, «Глубина: 2»);
  RW-4 (RED, fullchain: no over-fix — боевой .combat-side есть в бое,
  после боя dungeon-оверлей снова 0 .combat-side + '25'); RW-G1
  (гард, node, ЗЕЛЁНЫЙ: makeCityState → 1 .combat-side + 2 .combat-
  state + 1 .combat-log, stateEl/hint-байты). expectedRedCount = 4.
  Харнес — конвенция tests/dungeon-info-window.test.js (full-chain vm:
  CHAIN из index.html, Proxy-DOM, frameFn, h.hud; вход
  g.actions.enterDungeon(); спуск walkDungeonTo по DH-8; бой
  9999→Space по DH-6; node-часть — частичная цепочка
  loadDungeonUi + makeState/makeCityState, фабрики дублируются).
* **Re-pins** — D10 (4 файла). Всё остальное — зелёное БЕЗ правок
  (гарантийный список a3 §6.5: hud.js.test.js, portal-exit PE-*/N2,
  city-screen, city-inventory-e2e, squad-panel-e2e, dungeon-loot-e2e,
  save, locations, index-order, CSS-стражи, все combat-*,
  spec-000218-wording, mob-*, lunge-visibility, movement-freeze,
  dungeon-city-time, camp-map, main-loot/loot-e2e и пр.).

## 6. План по файлам (дельты)

* **src/dungeon-ui.js** (ЕДИНСТВЕННЫЙ src-файл): build() — L408-452
  внутрь `if (s0 && s0.kind === 'city')` (сдвиг индента; мёртвая
  dungeon-ветка hint-тернарника + dDepth — удалены на стадии
  правок по итогам ревью, §10); render() — L942 `if (logEl)`;
  comments — правка-минимум (D11). Итого ~±20 строк.
* **tests/dungeon-side-panel.test.js** — новый, ~350-450 строк.
* **Re-pins** — tests/dungeon-info-window.test.js (DH-4 + шапка),
  tests/dungeon-ui.test.js (6 мест), tests/deposit-e2e.test.js
  (helper + DE-1), tests/city-interact.test.js (hintOf + CI-V3) —
  ~80-120 строк суммарно.
* **memory/000229-dungeon-side-panel-removed.md** — этот файл (новый).
* **memory/000212-dungeon-hud-window.md** — pointer-пометка (§D2) ~3-5
  строк.
* **CHANGELOG.md** — отдельный коммит, ~3-5 строк.
* **0 diff**: index.html, src/main.js, src/hud.js, src/locations.js,
  src/combat-ui.js, spec/*.

## 7. SPEC-статус и follow-up

* spec/dungeons-storage.md L138-139: «HUD — счётчик „Залежи: N" в
  инфо-окне НЕ выводится (000212); строка hint „Залежь — [E]" — как
  есть.» — ПОСЛЕ 000229 вторая часть устаревает (строка hint исчезает
  вместе с панелью). В задаче НЕ правится (D6). Follow-up: док-задача
  на синхронизацию (создать после мержа/в ретро; оформить в
  tasks/pending + tasks/result ссылки).
Статус: ВЫПОЛНЕНО — задача 000234 (2026-10-17): хвост буллета «Рендер» переписан по факту (строка недостижима; hint —
только город), W2 re-pin (прецедент W1 000223), SPEC_FILE_LINES 144→146; контракты —
memory/000234-dungeon-deposit-hint-city-only.md.

## 8. Ловушки и подводные камни

1. **Условие именно `s0 && s0.kind === 'city'`**: legacy makeState БЕЗ
   kind = dungeon; ошибка «нет kind = город» → город без панели
   (CI-V1..V8, city-screen C1-C5, DH-7(b)) или подземелье с панелью
   (RW-1..4).
2. **Единственная незащищённая запись — render() L942 (logEl)**:
   забыть `if (logEl)` → TypeError при ЛЮБОМ входе в подземелье.
3. **CSS `.dungeon-overlay .combat-side` ОБЩЕЕ с городом** — из
   index.html НЕ удалять (город + 4 CSS-стража).
   → УСТАРЕЛО с 000247: правило УДАЛЕНО (мёртвый CSS — панель
   исчезла в обоих kind'ах); CSS-стражи (combat-layout/
   craft-layout/npc-layout) ре-пиннуты.
4. **z-lift '25' (main.js L3386-3396, слот 000206) — не трогать**:
   DH-1/2/6/8, PE-10/11, HU* — зелёные без правок.
5. **Строка 'floorStatusLine' ОБЯЗАТЕЛЬНО остаётся в dungeon-ui.js**
   (city-ветка) — структурные пины DH-5 + 000153.03-locationLine.
6. **Rebuild-путь (transitionFloor close→start→build)**: удаление — в
   build() по kind (RW-3), не точечно.
7. **SPEC W2 (000218)** pin'ит «строка hint — как есть» — текст после
   мержа устаревший; follow-up док-задача; в задаче SPEC не трогать;
   файл 000218 не трогать (цитата «dungeon-ui.js:941» —
   информационная).
8. **Параллельные задачи**: 000225 правит render() dungeon-ui.js (цикл
   мобов L793-853) — ТОТ ЖЕ файл, соседние регионы (поэтому RED-тесты
   — в своём файле, D5); 000228 правит main.js/map.js (000229 main.js
   не трогает). Ребейз-зона: src/dungeon-ui.js (build L395-456,
   render L909-942), 4 тест-файла, CHANGELOG.md. Перед мержем —
   rebase + полный прогон.
9. **1 worktree = 1 полный `node --test tests/`** (не параллельно —
   тест 000054 мутирует src/npc-data.js); флейк map.test.js perf →
   протокол перепуск + запись в отчёт.
10. **under-fix**: убрать только «информационную» часть (stateEl) —
    уже сделано 000212; ТЗ — убрать ВЕСЬ элемент (log+hint): RW-1/
    RW-4 пинят именно .combat-side/.combat-log. **over-fix**: трогать
    CSS/combat-ui.js/main.js — не надо (стражи зафиксируют).

## 9. Что важно будущим задачам (из ТЗ-ссылок/контракта)

* 000212 (tasks/done/000212.md, memory/000212-dungeon-hud-window.md):
  единое инфо-окно `#hud` (z-lift '25', dungeon-формат buildLine) —
  ЕДИНСТВЕННОЕ окно подземелья после 000229; pointer-пометка §D2.
* 000157.03 (контекстная строка «Залежь — [E]»): строка в подземельи
  УБРАНА с панелью; механизм (hintBase + onDeposit в render()) жив для
  ГОРОДА (hintEl-гард); действие [E] — locationOnInteract (main.js) —
  интактно; пины DE-1 (deposit-e2e) фиксируют сбор.
  → УСТАРЕЛО с 000247: механизм (hintBase/onDeposit/hintEl) УДАЛЁН
  целиком — панель города тоже убрана; действие [E] интактно.
* 000153.03 (floorStatusLine/D8 depth-aware hint): helper-контракт
  интактен; depth-aware тексты hint'а — теперь только город (в
  подземелье hint не создаётся).
* 000206 (общий динамический слот z-lift'ов, main.js frame()):
  конъюнкты подъёма #hud — интактны.
* 000218 (spec-pins): W2 — второй пример «SPEC застарел относительно
  кода» → при ретро проверить, создана ли follow-up док-задача по
  spec/dungeons-storage.md L138-139.
* 000225 (мобы вне радиуса не показывать): правит ТОТ ЖЕ файл
  dungeon-ui.js (render, цикл мобов) — при мерже/ребейзе 000225
  учитывать зону build/render 000229.

## 10. Правки по итогам ревью (2026-10-16)

Файдинги двух ревьюеров (minor, один и тот же — дубликат): внутри
городского блока build() dungeon-ветка hint-тернарника и `dDepth` —
мёртвый код (недостижимы: внешний `if (s0 && s0.kind === 'city')`
гарантирует city; s0 — const-локал, код синхронный). В D11 тело
блока было сохранено бит-в-бит ради минимальной зоны re-pin — после
завершённых re-pin и зелёного полного сьута мёртвая ветка УДАЛЕНА
на станции правок: тернарник → городские литералы (байт-в-байт),
`dDepth` — убран, коммент-блок над hint — правка-минимум (D11-
прецедент: описание dungeon-поведения устарело). Пины НЕ
затронуты: RW-G1/CI-V3 — городские DOM-байты (не изменились);
DH-5 — строка 'floorStatusLine' (render(), не тронут); source-
пинов dungeon-литералов в src/ НЕТ (grep по тестам). `onDeposit`/
`hintBase` в render() НЕ тронуты (D4): строка «Залежь — [E]»
недостижима ВЕЗДЕ (город — `!isCity` = false, подземелье —
hintEl = null) — факт зафиксирован для follow-up док-задачи (§7).

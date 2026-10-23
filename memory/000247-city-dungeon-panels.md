# 000247: Город/подземелье — правая инфопанель убрана совсем, левая панель (#hud) видна в обоих

Статус: ВЫПОЛНЕНО (финализация 2026-10-23: squash в ОДИН коммит
ветки task/000247 — код + тесты + memory + CHANGELOG + отчёт +
перенос задачи в done; полный набор зелёный — см. отчёт
tasks/result/000247.md «Как проверяли»; координаты пересверены
с кодом worktree). Ожидается: rebase на свежий master + мерж
(зоны — §8.7, §7).
ТЗ: tasks/done/000247.md. База: master 0136281 (= 000246 +
задачи 000250-000253); базовый сьют — 3068/3068 (лог
/tmp/thegame-wf-000247/baseline-full.log; повторный прогон на
станции — /tmp/thegame-wf-000247/design-baseline.log). Входы:
a1-domain.md, a2-arch.md, a3-tests.md.

## 0. Идентификация панелей (ТЗ п.1а) — РЕШЕНО

### «Левая панель» = `#hud` — единое инфо-окно главного интерфейса

* index.html: CSS L32-43 (`position: fixed; left: 12px; top: 12px;
  pointer-events: none;` — БЕЗ z-index → auto), элемент — L1065
  (в body, ПОСЛЕ canvas#game L1063). Содержимое строится ЕДИНЫМ
  блоком КАЖДЫЙ кадр: main.js `frame()` → `renderHud()` (L3592) →
  `G.hud.update(ctx)` → hud.js `buildLine()` (000129).
* Строки города/подземелья УЖЕ существуют и пишутся каждый кадр
  (000106 город, 000212 подземелье): город — «Флогистон, ур. N
  (x, y)» + блок героя + «--- <имя> (x, y) ---\n<status>» (status
  = floorStatusLine → «До выхода: ~N клеток»); подземелье — 1-я
  строка = имя подземелья + «Глубина: N» (depth>1) + «До выхода:
  ~N».
* Почему в городе СКРЫТО (ТЗ «overlay-логика 000229 или иная» —
  НЕ 000229; 000229 касался только правой панели):
  (а) z-лифт 000212 в main.js frame() (L3689-3694, общий
      динамический слот 000206) требует
      `dungeonState.kind === 'dungeon'` — город (kind 'city')
      исключён явно (коммент L3685-3688 «Город — вне скоупа»);
  (б) #hud без z-index (auto) → целиком под непрозрачным оверлеем
      `.combat-overlay.dungeon-overlay` (z-20, фон #0a0d12).
  Текст в городе пишется — окно живо, только под оверлеем.
* В ПОДЗЕМЕЛЬЕ левая панель УЖЕ видна (z '25' с 000212 — пины
  DH-1/2/8, RW-2/3) и правая УЖЕ удалена (000229 — пины
  RW-1..4, DH-4): половина ТЗ выполнена раньше → в задаче —
  город + гарды подземелья.
* Отклонённые кандидаты: `.char-panel` ([I], fullscreen,
  user-toggled, z-10 — УЖЕ поднимается до '25' в городе/
  подземелье, 000195/000206, CI-1/CI-2) и `.squad-panel` ([C],
  user-toggled, подъём 000217) — обе РАБОТАЮТ в городе/
  подземелье (не «сейчас её нет») и не «левые» (fixed inset /
  центрированная колонка); `#touch-controls` (z-30 — всегда над
  оверлеем); `.fs-btn` (правый нижний угол).
* Линейка запросов подтверждает: 000212 («единое инфо-окно слева
  в подземельях») → 000229 («правое окно совсем убрать» —
  подземелье) → 000247 (город/подземелье) — та же пара: левая =
  #hud, правая = .combat-side в оверлее локации.

### «Правая панель» = `.combat-side` внутри `.dungeon-overlay`

* ОДНОВРЕМЕННО у города и подземелья — один оверлей локации
  (`.combat-overlay.dungeon-overlay`, src/dungeon-ui.js
  `build()` L397-442).
* Создаётся ТОЛЬКО в городе (условие `s0 && s0.kind === 'city'`,
  build() L414-438; с 000229 подземелье — canvas только):
  stateEl (`.combat-state`: имя города + клетка +
  floorStatusLine), logEl (`.combat-log`: последние 8 строк
  s.log), hint (`.combat-state`: «Стрелки/WASD — шаг.\nДверь —
  вход и выход: встаньте на неё и нажмите [E].\n[E] —
  постройки.»).
* CSS: index.html L672-678 `.dungeon-overlay .combat-side`
  (absolute, top/right 16px, width 270px, rgba(16,18,24,0.85));
  коммент-блок L653-658 упоминает панель (L656-657).
* ЕДИНСТВЕННЫЙ создатель — dungeon-ui.js. src/cities.js — ЧИСТЫЙ
  data-модуль (layout), DOM не создаёт (0 createElement).
  src/building-ui.js L188 — оверлей «действия постройки»
  (.combat-overlay--build, CSS L115) — ДРУГОЙ функциональный
  экран (меню [E]-действий), НЕ инфо-панель. src/building-
  actions.js L1319 — диалог переименования города — ДРУГОЙ
  оверлей. Боевой `.combat-side` (combat-ui.js,
  .combat-overlay--combat) — бой, бит-в-бит (000246).

## 1. Решения (D1-D13) — все открытые вопросы закрыты

* **D1 — «левая панель» = #hud** (см. §0). Почему: единственное
  перманентное левое инфо-окно; «показать» = поднять над
  оверлеем, а не создавать новое (строки города/подземелья уже
  считаются каждый кадр — 000106/000212).
* **D2 — видимость: ОДНА точка в src/main.js `frame()`** —
  `hudOver` (L3689-3691): УБРАТЬ конъюнкт
  `dungeonState.kind === 'dungeon' &&`; остальные конъюнкты
  (!inCombat/!inNpc/!inBuilding/!inCraft/!inResurrect — снимок
  кадра L3641-3646) и идемпотентная запись '25'/'') БЕЗ
  ИЗМЕНЕНИЙ. `inDungeon` (L3642) ⇔ `dungeonState !== null` —
  покрывает ОБА kind'а (locations.js L120 'dungeon' / L150
  'city'). Статический CSS `#hud{z-index:25}` — ОТКЛОНЁН
  (прецедент 000212 D3: vm-стабы CSS не исполняют; подъём
  frame-driven, идемпотентен, слот '25' — общий динамический
  000206; новый подъём — тот же слот). Новые исключения НЕ
  нужны: бой в городе, диалог NPC, оверлеи постройки/крафта —
  те же конъюнкты, что в подземелье → #hud под ними (паритет).
* **D3 — правая панель: ЧИСТОЕ УДАЛЕНИЕ** (город — единственный
  оставшийся создатель; подземелье — 000229): в dungeon-ui.js —
  (а) build() L409-438 целиком (`const s0 = state();` + коммент +
  `if (s0 && s0.kind === 'city') { … }` — s0 используется ТОЛЬКО
  в L414 → dead после удаления); (б) render() хвост L920-957
  (см. D4); (в) модульные переменные L230-236 (stateEl/logEl из
  строки L230, коммент L231-235, hintEl/hintBase L236); (г)
  close() L1044-1046 → `overlay = canvas = g2 = null;` (строки
  hintEl/hintBase — убрать). В index.html — правило L672-678 +
  коммент-фраза L656-657 (D7). ПЕРЕНОСА в #hud НЕТ.
* **D4 — мёртвый хвост render() (L920-957) — УДАЛИТЬ ЦЕЛИКОМ**
  (расхождение a3 «оставить вычисления dist/fsLive/status как
  O(1)-гарды» ОТОРВАН… ОТКЛОНЁН): после D3 у вычислений НОЛЬ
  потребителей (dist → status → stateEl; fsLive → status;
  onDeposit → hintEl; logEl — элемент) = мёртвый код; ТЗ «включая
  мёртвый CSS/элементы, если остаются»; прецедент 000229 §10
  (мёртвая ветка city-блока build() — УДАЛЕНА на стадии
  правок, а не сохранена). `isCity` (L526) ОСТАЁТСЯ — использует
  canvas-секция render (~20 мест: туман/стены/палитра/маркеры).
  Строка-литерал 'floorStatusLine' из dungeon-ui.js ИСЧЕЗАЕТ
  (была ТОЛЬКО в хвосте: L922/L930/L931) → 2 структурных пина
  ре-пинятся в отрицание (DH-5 + dungeon-ui.test.js L3289-3290;
  единый потребитель helper'а — теперь hud.js L163-164; helper и
  его контракт — locations.js L760, пины N2 — интактны).
* **D5 — лог и hint (ТЗ п.1б): полное удаление ОТОБРАЖЕНИЯ**
  (пользователь — «совсем убрать»; прецедент 000229 D1 — чистое
  удаление без переноса). Данные: пуши `ds.log` ЖИВУТ — город:
  ровно ОДНА строка «<имя>: вход.» (locations.js L155);
  подземелье: «<имя>: вход.» / «Спуск/Подъём: глубина N.»
  (locations.js L642) / сундук/залежь/бой (main.js
  L2867/2984/3055/3066/3072/3077); ds.log НЕ персистится
  (serializeDungeonMemory — только contents/lastVisitDay/pos,
  000229) → сейв v1, RNG, детерминизм боя — ИНТАКТНЫ. Рендера
  лога больше нет нигде (город — logEl ушла; подземелье — уже с
  000229). Видимые события (сундук/залежь/победа/выход) и так
  в #hud через hudFlash (flash-строка 5 с, ПОСЛЕДНИЙ) — канал не
  ломается. Городские хинты-литералы и контекстная «Залежь —
  [E]» (000157.03) исчезают с панелью; ДЕЙСТВИЕ [E] —
  locationOnInteract (main.js: постройки/выход) — ИНТАКТНО;
  тач-D-pad — #touch-controls z-30 (над оверлеем) — интактен.
* **D6 — SPEC в задаче НЕ ПРАВЛЕТСЯ** (line-neutral-план a1
  ОТОРВАН… ОТКЛОНЁН): spec/dungeons-storage.md L167-170 (хвост
  буллета «Рендер»: «механизм render() сохранён — hintBase +
  onDeposit = !isCity (src/dungeon-ui.js), строка недостижима
  (город — false, подземелье — hintEl = null)») ПОСЛЕ 000247
  УСТАРЕВАЕТ (механизм удалён; панель города нет). Почему не
  правим: (а) ТЗ не упоминает SPEC — «не больше и не меньше»;
  (б) формулировка ЗАПИНАНА дословно ДВУМЯ pin-тестами — W2
  (tests/spec-000218-wording.test.js L108-135) и guard 000235
  (tests/spec-000235-wording.test.js L319-331: «строка
  недостижима (город — false, подземелье — hintEl = null)» +
  «hint — только город») — правка SPEC = семантический re-pin
  чужих pin-тестов ×2; (в) прецедент 000229 D6 (там — W2 только;
  follow-up → задача 000234). FOLLOW-UP док-задача — создать
  после мержа/в ретро (протокол CLAUDE.md п.3): синхронизация
  SPEC L167-170 + re-pin W2 И 000235-guard В ТОМ ЖЕ коммите +
  SPEC_FILE_LINES (сейчас 175 — tests/spec-split.test.js L120;
  в задаче 0 diff).
* **D7 — index.html: ТОЛЬКО мёртвое правило** `.dungeon-overlay
  .combat-side` (L672-678) + коммент-фраза L656-657 («панель
  .combat-side — плавающая справа» → правка-минимум). НЕ ТРОГАТЬ
  (живые потребители): база `.combat-side` L262-268 (320px —
  бой + building-ui + rename), `.combat-state` L269-273 (бой +
  NPC-диалог ui.js L1334 + крафт craft-ui.js L379), база
  `.combat-log` L368-375 (170px — бой; combat-скоуп переопределяет
  height → flex:1), `.combat-overlay--combat .combat-side`
  L424/L631 (256px), `.combat-overlay--build .combat-side` L115,
  `.dungeon-overlay` L659-663 + `.dungeon-overlay canvas`
  L664-671, ВЕСЬ боевой скоуп (000124/000246).
* **D8 — новый RED-файл tests/city-side-panel.test.js**
  (имя a2 «city-dungeon-panels» ОТКЛОНЁНО: прецедент 000229 D5 —
  sibling-название dungeon-side-panel.test.js; минимальная зона
  мержа — свой файл на задачу). 7 тестов (харнес — самодостаточ-
  ный дубль конвенций: fullchain vm-песочница по
  dungeon-info-window.test.js — CHAIN из index.html, Proxy-DOM,
  h.hud, frameFn, walkTiles/findCityFor/enterCity, resolveCombat
  9999→Space; node-часть — loadDungeonUi + makeState/
  makeCityState по dungeon-side-panel.test.js):
  * CR-1 (RED, node) — город: в .dungeon-overlay 0 .combat-
    side/.combat-state/.combat-log; оверлей = canvas (1 прямой
    ребёнок); рендер жив (canvas, drawCalls > 0); errors 0.
    (master: факт 1/2/1 — зонд a3 §8.)
  * CR-2 (гард, node, ЗЕЛЁНЫЙ с 1-й стадии) — подземелье: 0
    панель (000229); canvas; errors 0.
  * CL-1 (RED, fullchain) — авто-вход в город (enterCity) +
    кадр: в .dungeon-overlay 0 .combat-side/.combat-
    state/.combat-log; canvas на месте; errors не растут.
  * CL-2 (RED, fullchain) — город + кадр: h.hud.style.zIndex ===
    '25'; city-HUD цел (1-я строка «Флогистон, ур. N  (x, y)»,
    «--- <имя> (x, y) ---», «До выхода: ~», «[I] персонаж»);
    выход ([E] на едином тайле-двери, 000177 — герой НА тайле
    после авто-входа) + кадр → zIndex falsy + world-HUD
    (1-я строка — мир-координаты). (master: z '' + 1 .combat-
    side.)
  * CL-3 (гард, fullchain, ЗЕЛЁНЫЙ с 1-й стадии) — подземелье
    (enterDungeon) + кадр: 0 панель (000229) + #hud '25' (000212)
    + биты dungeon-HUD.
  * CL-4 (гард, fullchain, ЗЕЛЁНЫЙ с 1-й стадии) — no over-fix
    + конъюнкт боя в городе (НОВОЕ состояние после 000247):
    город → g.actions.startCombat() (debug, работает из города —
    startCombatAt location-независим) + кадр: боевой .combat-
    side ЕСТЬ (7 детей [turnorder, hpbar, mpbar, state, log,
    quicklist, actions], .combat-actions — последний — 000246);
    h.hud.style.zIndex !== '25' (в бою подъём СНЯТ — конъюнкт
    !inCombat в городе); город под боем цел (оверлей в body,
    canvas на месте); resolveCombat + кадр: локация цела (kind
    'city', dungeonUI.isActive()).
    РЕШЕНИЕ СТАНЦИИ REDS (2026-10-23): исходный черновик D8
    имел в хвосте CL-4 «после боя zIndex '25', city-оверлей =
    canvas только» — ОБА факта ЛОЖНЫ на master (зонд: город z
    '' + canvas+side) → гард был бы красным, нарушая
    expectedRedCount = 4. Эти два факта заперты RED-тестами
    CL-2 (z '25') и CL-1 (canvas только) — повторять в CL-4
    нельзя (зелёность 1-й стадии).
  * CSS-1 (RED, node-статика) — правило `.dungeon-overlay
    .combat-side` ОТСУТСТВУЕТ; НА МЕСТЕ: база .combat-side
    320px, база .combat-log 170px, .combat-overlay--combat
    .combat-side 256px, .combat-overlay--build .combat-side
    (min(520px,94vw)), .dungeon-overlay (display block, фон
    #0a0d12), .dungeon-overlay canvas. (master: правило есть —
    270px.)
  expectedRedCount = 4 (CR-1, CL-1, CL-2, CSS-1); CR-2/CL-3/CL-4
  — зелёные гарды (прецедент RW-G1). Боевой бит-в-бит НЕ
  дублируем сверх CL-4: держат пины 000124/000171/000178/
  000199/000246/000252-нейтральные (combat-*, ui.test.js,
  combat-layout). Гард постройского оверлея (.combat-overlay-
  --build) — уже держат существующие build-menu-layout/
  building-actions + CSS-1 positive. Ошибки на чистых путях —
  errors не растут.
* **D9 — re-pins (ТЗ меняет поведение; прецеденты 000229 D10 /
  000212 §4.2; В ТОМ ЖЕ коммите реализации):**
  1. tests/dungeon-side-panel.test.js — RW-G1 (L835-872: город
     1/2/1 + stateEl/hint-байты → город: 0 .combat-side/
     .combat-state/.combat-log, оверлей = canvas (1 ребёнок),
     рендер жив (drawCalls > 0), errors 0) + шапка (L5-19:
     «город — байт-в-байт» → «город — панель убрана (000247)»;
     «CSS — общее с городом — остаётся» → «правило удалено
     (000247: мёртвый CSS)»).
  2. tests/dungeon-info-window.test.js — DH-5 (L741-751:
     «dungeon-ui.js содержит floorStatusLine» → «НЕ содержит
     (000247: хвост render() с consumer'ом удалён; единый
     потребитель — hud.js)»; «'Группы: '»-ассерт + hud.js-ассерт
     — без правок); DH-7(b) (L808-829: «город: подъёма НЕТ
     (zIndex falsy)» → «город: подъём ЕСТЬ (zIndex '25',
     000247)»; «2 .combat-state» → «0 .combat-state/.combat-
     side (000247)»; city-HUD-байты textContent — БЕЗ правок)
     + шапка (L46-52: «город — подъёма нет, 2 .combat-state» →
     новое). DH-1/2/3/4/6/7(a)/8 — БЕЗ правок.
  3. tests/dungeon-ui.test.js — ТОЛЬКО городские части (6 мест):
     L1990-1993 (коммент allByClass «город: ДВА» → «город: 0
     (000247)»); L2027-2052 (city stateEl-байты → 0 .combat-
     state/.combat-side, оверлей = canvas, рендер жив); L2260-
     2291 (city hint-байты states[1] → 0 .combat-state; canvas/
     фолбэк-ассерты + dungeon-регрессия 000229 — сохранить);
     L3177-3193 (UI-DEP-3 city-часть cHint [1] → 0 .combat-
     state); L3259-3282 (000153.03 city-фаза textC [0] → 0
     .combat-state); L3284-3290 (структурный пин: dungeon-ui.js
     floorStatusLine → doesNotMatch); L3332-3363 (000153.03
     depth-aware hint city-фаза [1] → 0 .combat-state). Dungeon-
     части (000229-пины 0) — БЕЗ правок.
  4. tests/city-interact.test.js — hintOf (L1686-1696: helper
     «последний .combat-state, assert ≥1» — используется ТОЛЬКО
     CI-V3 → перевесить на «в .dungeon-overlay города 0 .combat-
     side/.combat-state (000247)» или удалить helper вместе с
     ассертами); CI-V3 city-часть (L1807-1825: hint-байты → 0
     элементов + #hud zIndex '25' видим); dungeon-субблок
     (L1827-1843, 000229) — БЕЗ правок; шапка.
  5. tests/combat-layout.test.js — L66-70 (стража «правило на
     месте 270px/absolute» → «правило УБРАНО (000247: панели в
     оверлее локации нет в обоих kind'ах)» — assert absence
     (cssRule → null)); L58-61 (база .combat-log 170px — ассерт
     без правок, сообщение «плавающая панель подземелья» →
     «бой» (старое)); шапка L9.
  6. tests/craft-layout.test.js — G2 (L181-186: ruleExact('.
     dungeon-overlay .combat-side') 270px → absence 000247;
     база 320px / бой 256px / .npc-panel / .cp-* — без правок).
  7. tests/npc-layout.test.js — 000125-стража (L200-204: то же →
     absence; остальные ассерты — без правок).
* **D10 — комментарии**: новых комментариев НЕ писать
  (CLAUDE.md); устаревшие блоки — правка-минимум (прецеденты
  000229 D11 / 000212 D8): (а) main.js L3685-3688: «в
  подземельях/пещерах» → «в локации (город/подземелье)»,
  «Город — вне скоупа» → «000247: город — в скоупе (подъём в
  обоих kind'ах)»; (б) index.html L653-658: фраза «панель
  .combat-side — плавающая справа» → правка-минимум (000247:
  панели в оверлее локации нет — canvas); (в) dungeon-ui.js
  шапка L37-50: абзац «stateEl — имя города … 000229: панель
  .combat-side … ГОРОД ТОЛЬКО» → «000247: панель .combat-side
  (stateEl/logEl/hint) в оверлее локации удалена СОВСЕМ в обоих
  kind'ах (000212: инфо — единое окно #hud, main.js renderHud →
  hud.js buildLine); оверлей = canvas». Комменты удалённых
  блоков (build L410-413/L425-433, render L921-928/L934-940/
  L949-952, переменные L231-235) уходят вместе с кодом.
* **D11 — pointer-пометки в memory** (прецедент 000229 D12):
  (а) memory/000229-dungeon-side-panel-removed.md — устарело:
  §0/§3 «город — байт-в-байт (1 .combat-side + 2 .combat-state +
  1 .combat-log)», ловушка #3 «CSS .dungeon-overlay .combat-
  side НЕ удалять», §9 «механизм жив для ГОРОДА (hintEl-гард)» →
  указатель на этот файл (000247: город — canvas только, CSS-
  правило удалено, механизм удалён); (б) memory/000212-dungeon-
  hud-window.md — устарело: D3 «kind==='dungeon' (город — вне
  скоупа)» + §7 «город (kind 'city') — вне скоупа (панель/окно
  — как есть)» → 000247: подъём — ОБА kind'а; «панель» —
  убрана (указатель).
* **D12 — CHANGELOG.md**: задача меняет экран (правая панель
  исчезла, инфо-окно слева видно в городе) → отдельный коммит
  «Задача 000247: CHANGELOG — …», дата = дата мержа (на момент
  проектирования 2026-10-23 — под существующий «## 2026-10-23»),
  секция «### Интерфейс» (вместе с «### Управление» от 000246),
  1 буллет (UI, видимый игроку; программная часть не
  перечисляется), формат по существующим записям:
  «**Город/подземелье: правая инфопанель убрана.** Плавающая
  справа панель (название города, журнал, подсказки управления)
  в городах и подземельях убрана совсем (в подземелье — с
  000229); окно слева (состояние героя и локации) теперь видно
  и в городе, и в подземелье.»
* **D13 — инварианты поверхности**: 0 новых модулей/UMD/
  <script>/CSS-правил/SVG-ассетов (index-order зелёный);
  G.dungeonUI (start/close/vision/isActive/render/touchHold/
  touchRelease) — БЕЗ ИЗМЕНЕНИЙ, 0 новых полей; 0 RNG, 0
  сейв-форматов (ds.log не персистится), 0 боевых правок
  (combat-ui.js 0 diff — 000246 не смешивать), 0 полей ctx
  renderHud. 0 diff: src/hud.js, src/locations.js, src/cities.
  js, src/building-ui.js, src/building-actions.js, src/combat-
  ui.js, src/ui.js, src/craft-ui.js, spec/*.

## 2. Что добавлено/перенесено

* Добавлено: 0 элементов, 0 модулей, 0 ассетов, 0 CSS. Убрано:
  (а) создание `.combat-side` (stateEl/logEl/hint) в build() —
  city-ветка целиком (последний создатель — оба kind'а: оверлей
  локации = canvas ТОЛЬКО); (б) механизм render(): вычисления
  dist/fsLive/status/onDeposit + записи if(stateEl)/if(hintEl)/
  if(logEl) + модульные переменные stateEl/logEl/hintEl/hintBase
  (мёртвое после (а) — D4); (в) CSS-правило .dungeon-overlay
  .combat-side (мёртвое после (а)). (г) Из main.js — ОДИН
  конъюнкт условия подъёма #hud (вид-клауза kind). Ничего НЕ
  переносится: лог/хинт города исчезают («совсем убрать»); инфо
  города (имя/клетка/«До выхода: ~N») УЖЕ есть в #hud (000106/
  000129: locationLine city-ветка) — окно лишь становится
  видимым (z '25').

## 3. Контракты и границы

* **DOM-контракт оверлея локации (после 000247)**: ОБА kind'а
  (city/dungeon/legacy) — `.dungeon-overlay` = canvas ТОЛЬКО (1
  прямой ребёнок); `findAll('.combat-side' | '.combat-state' |
  '.combat-log')` = 0. Rebuild-путь (transitionFloor:
  close→start→build) — то же (удаление структурное в build()).
* **Подъём #hud (main.js frame())**: `hudOver = inDungeon &&
  !inCombat && !inNpc && !inBuilding && !inCraft && !inResurrect`
  (inDungeon ⇔ dungeonState !== null — ОБА kind'а); z = hudOver ?
  '25' : ''; запись идемпотентная. '25' — ОБЩИЙ динамический
  слот (000206: .char-panel; 000217: .squad-panel; 000212+000247:
  #hud). Одновременный подъём #hud и открытой .char-panel/.squad-
  panel в городе — оба '25' → DOM-порядок решает (панели —
  динамически позже #hud в DOM → поверх — активный UI над
  пассивным) — УЖЕ работает так в подземелье (000212 D3) →
  паритет, нового конфликта нет.
* **HUD-байты**: мир — бит-в-байт (HU5); город — бит-в-байт
  («--- <имя> (x, y) ---\nДо выхода: ~N», «[I] персонаж» — HU4,
  city-screen C1-C5); подземелье — бит-в-байт (000212 §3.1,
  DH-2/3, PE-10/11). Меняется ТОЛЬКО inline zIndex #hud в городе.
* **Граница боя**: боевой .combat-side — бит-в-бит (7 детей,
  .combat-actions последний — 000246; пины 000124/000171/
  000178/000199/000246/000252); в бою (из города ИЛИ подземелья)
  подъём #hud снят (конъюнкт !inCombat).
* **Граница построек**: .combat-overlay--build (меню действий
  [E], building-ui.js L188) и rename-диалог (building-actions.js
  L1319) — не инфо-панели, НЕ ТРОНУТЫ; без них город неиграбелен.
* **Граница данных**: ds.log пишется (города — 1 строка
  «<имя>: вход.»), не персистится, НЕ рендерится; сейвы v1 /
  RNG / детерминизм боя — интактны.
* **Граница SPEC**: spec/dungeons-storage.md L167-170 — 0 diff
  (W2 + 000235-guard зелёные); рассинхрон → follow-up док-задача
  (D6).
* **Граница canvas-рендера**: city/dungeon-отрисовка (пол,
  стены, постройки, маркер двери/портала, лестница, сундуки,
  залежи, мобы, туман, игрок) — бит-в-бит; GOLDEN-ПИН
  CITY_TILE_SEED + палитры — зелёные.

## 4. Ленивые ссылки и guards

* `live.locations.floorStatusLine` — consumer'ы после 000247:
  ТОЛЬКО hud.js locationLine (L162-166, live-чтение g.locations);
  dungeon-ui.js — НЕТ (хвост render() удалён, D4).
* Гардов DOM-записей в dungeon-ui.js render() больше НЕТ (элементы
  не создаются) — render() рисует ТОЛЬКО на canvas (g2).
* `close()` — обнуляет overlay/canvas/g2 (stateEl/logEl/hintEl/
  hintBase — переменные удалены).
* z-подъём #hud — frame-driven (idempotent) из frame() main.js
  (единственная точка; watchdog 000170 жив); НЕ из dungeon-ui.js
  (прецедент 000212).
* Тач-D-pad — виртуальный (touchstart на оверлее, L317-361) —
  DOM-элементов панели не использует; keydown на window — оба не
  затронуты.
* main.js: `hud` — единственная ссылка на #hud (L19) + запись
  zIndex (L3692-3694) + textContent (L154, WebGL-гард).

## 5. Тесты (план)

* **НОВЫЙ tests/city-side-panel.test.js** — 7 тестов (D8):
  CR-1/CR-2 (node) + CL-1..CL-4 (fullchain) + CSS-1 (статика);
  expectedRedCount = 4. Красные обязаны падать ОСМЫСЛЕННО
  (ERR_ASSERTION по факту: 1/2/1 вместо 0; z '' вместо '25';
  правило найдено вместо «отсутствует»), не синтаксисом.
  Базовый сьют 3068 → красная стадия: 3075, ровно 4 «not ok»;
  зелёная: 3075/3075.
* **Re-pins** — D9 (7 файлов). Всё остальное — зелёное БЕЗ
  правок: бой (combat-*, ui.test.js 000246, combat-layout
  320/170/256/flex), подземелье 000212/000229 (RW-1..4,
  DH-1/2/3/4/6/7(a)/8, PE-10/11, DE-*), мир/город-текст (city-
  screen C1-C5 + L780, hud.js.test.js HU*, city-inventory-e2e,
  squad-panel-e2e, dungeon-city-time, camp-map, portal-exit,
  save*, locations, index-order, spec-split 175, spec-000218-
  wording W2, spec-000235-wording, mob-*, lunge, movement-freeze,
  GOLDEN-ПИН CITY_TILE_SEED).
* Флейк-протокол (memory): 1 worktree = 1 полный `node --test
  tests/` (не параллельно — 000054 мутирует src/npc-data.js);
  случайный провал чужого теста → перепуск `node --test
  tests/<файл>` + запись в отчёт.

## 6. План по файлам (дельты)

| Файл | Что | Дельта |
|---|---|---|
| src/dungeon-ui.js | build() L409-438 −; render() L920-957 −; переменные L230-236 −; close() L1044-1046 → 1 строка; шапка L37-50 правка-минимум | ~−75/±5 |
| src/main.js | frame() L3689-3691: − конъюнкт kind; коммент L3685-3688 правка | ±2 |
| index.html | правило L672-678 −; коммент L656-657 правка | ~−9/±2 |
| tests/city-side-panel.test.js | НОВЫЙ: харнес + 7 тестов | ~+500 |
| tests/dungeon-side-panel.test.js | RW-G1 + шапка | ±30 |
| tests/dungeon-info-window.test.js | DH-5, DH-7(b) + шапка | ±20 |
| tests/dungeon-ui.test.js | 6 city-мест + коммент allByClass | ±60 |
| tests/city-interact.test.js | hintOf + CI-V3 + шапка | ±30 |
| tests/combat-layout.test.js | стража L66-70 → absence; msg L58-61; шапка | ±10 |
| tests/craft-layout.test.js | G2 → absence | ±8 |
| tests/npc-layout.test.js | 000125-стража → absence | ±8 |
| memory/000247-city-dungeon-panels.md | новый (этот файл) | ~+250 |
| memory/000229-dungeon-side-panel-removed.md | pointer-пометки (D11а) | ~+6 |
| memory/000212-dungeon-hud-window.md | pointer-пометки (D11б) | ~+6 |
| CHANGELOG.md | «### Интерфейс» (отдельный коммит) | ~+5 |
| spec/*, src/hud.js, src/locations.js, src/cities.js, src/building-*.js, src/combat-ui.js, src/ui.js, src/craft-ui.js | — | 0 |

Порядок станций: (1) RED — tests/city-side-panel.test.js +
memory (этот файл + pointers); npm test — ровно 4 «not ok».
(2) GREEN — src (3 файла) + re-pins (D9); npm test — 3075/3075.
(3) CHANGELOG — отдельный коммит. (4) ревью-правки +
tasks/result/000247.md + git mv tasks/pending/000247.md
tasks/done/000247.md. Финал — squash в ОДИН коммит «Задача
000247: …» + Co-Authored-By: Claude Code <noreply@anthropic.
com> (memory one-commit-per-task-squash); перед мержем — rebase
на свежий master + повторный полный прогон.

## 7. SPEC-статус и follow-up

* spec/dungeons-storage.md L167-170 (хвост буллета «Рендер») —
  ПОСЛЕ 000247 УСТАРЕВАЕТ: «механизм render() сохранён —
  hintBase + onDeposit = !isCity (src/dungeon-ui.js)» — механизм
  УДАЛЁН; «hint — только город» — hint больше нет ни в городе,
  ни в подземелье. В задаче НЕ правится (D6). FOLLOW-UP: док-
  задача на синхронизацию (создать после мержа/в ретро):
  переписать хвост + re-pin ДВУХ pin-тестов В ТОМ ЖЕ коммите —
  W2 (tests/spec-000218-wording.test.js L108-135) и guard
  (tests/spec-000235-wording.test.js L319-331) + SPEC_FILE_LINES
  при смене числа строк (сейчас 175, tests/spec-split.test.js
  L120). Прецедент: 000229 → 000234.

## 8. Ловушки и подводные камни

1. **Хвост render() (L920-957) — удалять ЦЕЛИКОМ**: неполное
   удаление = мёртвый код (нарушение прецедента 000229 §10);
   полное без 2 репинов (DH-5 + dungeon-ui L3289) = 2 падения
   (строка 'floorStatusLine' исчезает из dungeon-ui.js).
   `isCity` (L526) НЕ трогать (canvas-секция).
2. **SPEC — не трогать**: W2 И 000235-guard пинят старое слово
   дословно; правка = 2 семантических re-pin'а чужих pin-тестов.
   SPEC_FILE_LINES (175) — зелёный только при 0 diff.
3. **CSS: ТОЛЬКО правило L672-678**: базы .combat-side/.combat-
   log/.combat-state + скоупы combat/build — живые (бой/
   постройки/диалог/крафт); over-fix — 3 CSS-стража + CL-4/CSS-1
   зафиксируют.
4. **hudOver — ОДИН конъюнкт**: после удаления kind-клаузы НЕ
   читать dungeonState.kind в блоке; конъюнкты — из снимка кадра
   L3641-3646. Новые состояния-исключения НЕ добавлять (паритет
   с подземельем).
5. **z-слот '25' общий** (000206/000217/000212): город #hud +
   открытая .char-panel — оба '25', DOM-порядок — паритет с
   подземельем (работает); новый подъём над локацией — тот же
   слот.
6. **vm-стабы**: makeEl с style:{} — запись hud.style.zIndex
   стаб-безопасна (000206/000212); CSS-движка нет → «видимость»
   = inline zIndex, не computed style. h.hud — тот же элемент,
   что getElementById('hud').
7. **Rebase-зоны**: src/dungeon-ui.js build()/render() (файл
   горячий — 000225 цикл мобов), src/main.js frame() (hot),
   index.html (000248 боевые анимации — регион далёк, но file-
   level конфликт возможен), 7 test-файлов, CHANGELOG. Перед
   мержем: rebase + полный прогон (протокол 000246).
8. **Не смешивать с 000246** (бой — другие элементы/файлы):
   combat-ui.js, боевой скоуп CSS — 0 diff.
9. **1 worktree = 1 полный node --test** (000054 мутирует
   src/npc-data.js); флейк → перепуск + запись в отчёт.
10. **CL-2 выход из города**: авто-вход оставляет героя НА
    едином тайле-двери (000177) → [E] сразу выводит; после
    выхода dungeonState = null → z '' на следующем кадре.

## 9. Что важно будущим задачам

* «Левая панель» = #hud — ЕДИНСТВЕННОЕ инфо-окно локации
  (город И подземелье): будущие HUD-задачи правят ТОЛЬКО
  src/hud.js (buildLine/locationLine) + при необходимости
  условие hudOver в frame() main.js; байты города/подземелья/
  мира — заперты DH-2/3, PE-10/11, HU*, city-screen.
* Правой панели в оверлее локации БОЛЬШЕ НЕТ (оба kind'а) —
  возврат (если понадобится) — в #hud, не в боковую панель
  (прецеденты 000212/000229). ds.log — данные без рендера;
  события — hudFlash.
* floorStatusLine — ЕДИНЫЙ источник (locations.js L760);
  потребитель — ТОЛЬКО hud.js (dungeon-ui.js — с 000247 НЕТ);
  пины: N2 (контракт helper), DH-5/dungeon-ui L3284 (единый
  потребитель — отрицательная форма).
* 000218/000235 SPEC-пины (W2 + 000235-guard) — СТАЛЫЕ после
  мержа 000247 (текст «механизм сохранён/hint — только город»):
  при ретро проверить, создана ли follow-up док-задача (§7);
  оба пина ре-пинить в одном коммите со SPEC-правкой.
* .combat-side в building-ui.js/building-actions.js — ФУНКЦИОНАЛЬ-
  НЫЕ оверлеи (меню постройки, rename) — не инфо-панели; их
  CSS-скоупы (.combat-overlay--build) — не трогать.
* z-лестница: 10 (.char-panel/.squad-panel база) < 15 (.fs-btn)
  < 20 (оверлеи) < **25 — ОБЩИЙ динамический слот** (000206/
  000217/000212/000247: char-panel/squad-panel/#hud) < 30
  (#touch-controls) < 40 (.start-window).

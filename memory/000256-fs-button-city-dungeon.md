# 000256 — Кнопка полноэкранного режима (.fs-btn) видима в городах и подземельях

Станция ПРОЕКТИРОВАНИЕ (2026-10-23). Worktree
/home/sas/Documents/Art/thegame/.worktrees/task-000256, ветка task/000256,
HEAD = 7508f0f (000252; УЖЕ содержит мерж 000247, 6d9175f — REBASE-факт
§7). ТЗ — tasks/pending/000256.md (написан по master 7c1619d — дельты
§7). Анализы — /tmp/thegame-wf-000256/a1-domain.md, a2-arch.md,
a3-tests.md. expectedRedCount = 6 (FS-1…FS-6; до ревью 2026-10-24 —
5 + FS-4 «зелёный гард», см. §9). Файл закоммитится вместе с
красными тестами
(RED-станция); финал — один коммит (squash, memory
one-commit-per-task-squash).

Статус: ВЫПОЛНЕНО (Finalize 2026-10-24). Коммиты ветки: 57a656c
(реализация), b72ba5d (CHANGELOG → дата мержа 2026-10-24), c535426
(правки по итогам ревью — строгие сбросные пины, §9). Задача перенесена
в tasks/done; отчёт — tasks/result/000256.md. Свежий полный прогон на
Finalize: 3111/3111 pass, 0 fail (load 0.68; флейк map.test.js — см. §9,
повтор при load < ~3 на стадии мержа).

## 1. Механизм бага

* Кнопка .fs-btn создаётся ОДИН раз при загрузке (src/main.js:31-46,
  топ-уровень IIFE: `if (G.createFullscreenController) { if
  (fullscreen.supported) { const fsBtn = … } }`), глиф «⛶», append к
  body, живёт в DOM на всех экранах. CSS (index.html:174-189):
  `position: fixed; right: 12px; bottom: 12px; z-index: 15`.
* Экраны города И подземелья — ОДИН оверлей `.combat-overlay
  .dungeon-overlay` (src/dungeon-ui.js build(), непрозрачный фон
  #0a0d12, fixed inset 0, z-20 — index.html:243-251 + 659-671).
  z-15 < z-20 → кнопка целиком под оверлеем: невидима и некликабельна.
  display:none/медиазапросов у .fs-btn НЕТ.
* Бой — 000017, осознанно: в бою кнопка под оверлеем («не мешает в
  бою», memory/000017-fullscreen-button.md) — НЕ ТРОГАТЬ.

## 2. Решение (контракт)

* (a) ХОИСТИНГ — src/main.js:31-46: `let fsBtn = null;` на топ-уровне
  ПЕРЕД блоком `if (G.createFullscreenController)`; в ветке supported —
  назначение `fsBtn = document.createElement('button')` (const убран).
  Остальной код блока (fsLabel/onChange/click/appendChild) —
  БАЙТ-В-БАЙТ. Почему: frame() (тот же IIFE-closure) видит fsBtn
  напрямую; supported=false (vm-песочницы, браузеры без API) —
  fsBtn === null → frame-блок no-op (деградация, игра не падает —
  прецедент CI-12).
* (b) ПОДЪЁМ В frame() — src/main.js, СРАЗУ ПОСЛЕ блока подъёма #hud
  (main.js:3744-3750), ПЕРЕД блоком «000235.02: книга» (main.js:3751):
    ```
    const fsOver = inDungeon
      && !inCombat && !inNpc && !inBuilding && !inCraft
      && !inResurrect;
    if (fsBtn && fsBtn.style) {
      const z = fsOver ? '25' : '';
      if (fsBtn.style.zIndex !== z) fsBtn.style.zIndex = z;
    }
    ```
  * Условие: ОБА kind'а (город + подземелье, БЕСКОНДОВОЕ — ТЗ п.1);
    планка конъюнктов идентична текущему hudOver (000247-факт §7).
  * РЕШЕНИЕ (a1/a2-расхождение): условие — ОТДЕЛЬНЫЙ const `fsOver`,
    НЕ переиспользование переменной hudOver. Почему: у двух функций
    разное происхождение в спеках (#hud — 000212/000247, .fs-btn —
    000256); будущее ре-скоупирование #hud (напр. возврат исключения
    kind) не должно молча менять .fs-btn и наоборот; sibling-паттерн —
    playerUI/squadUI applyLayer (main.js:3720-3738) каждый
    пересчитывает конъюнкт САМИ от снимка кадра. Сейчас fsOver и
    hudOver — банковская копия: при изменении одного — проверить
    другое (§8).
  * '25'/'': '25' — ОБЩИЙ динамический слот (000206 .char-panel /
    000212 #hud / 000256 .fs-btn); вне условия — '' (базовые 15 из
    CSS). CSS-лестница 10/15/20/30/35/40 — НОЛЬ изменений (конвенция
    000206/000212: динамические слоты — inline + memory, не CSS).
  * Идемпотентность: запись ТОЛЬКО при смене (`!== z`) — повторный
    кадр = 0 DOM-записей (пин FS-6).
  * Флаги inCombat/inDungeon/inNpc/inBuilding/inCraft/inResurrect —
    снимок кадра main.js:3695-3700, только чтение.
* (c) index.html:174-175 — правка УСТАРЕВШЕГО комментария: базовый
  z-15 (выше панели персонажа 10); в городах/подземельях frame-подъём
  до 25 (000256); в бою и вне локации — базовые 15 под оверлеем
  (000017). CSS-правила .fs-btn (z-15, right/bottom 12px) и
  .fs-btn:hover (:189) — НЕ ТРОГАТЬ (пины CI-13, ui-panel:485-509).
  Прочие комменты лестницы (:45, :198, :783, :830) — НЕ ТРОГАТЬ
  (базовый 15 в силе).
* НОЛЬ изменений: src/fullscreen.js (ядро, 8 тестов), бой, #hud-блок
  (main.js:3744-3750 байт-в-байт, DH-1..DH-8), dungeon-ui.js,
  controls.js, ui.js, CSS-значения z, сейвы/RNG/детерминизм (zIndex —
  inline, не сериализуется), цепочка <script> (index-order не
  затрагивается).

## 3. z-лестница (обновлённая, дубль memory/000212 §3.4)

10 (.char-panel база, index.html:62; панель :802) < 11 (внутри
.char-panel) < 15 (.fs-btn БАЗА, :180) < 20 (.combat-overlay :251,
.resurrect-overlay :1000) < 25 (ОБЩИЙ динамический слот: 000206
.char-panel applyLayer, 000212 #hud, 000256 .fs-btn — в CSS НЕТ)
< 30 (#touch-controls :203) < 35 (.spellbook-oc :1019) < 40
(.start-window :839).
При равенстве z-25 (#hud/.fs-btn/.char-panel в локации) — DOM-порядок:
#hud (разметка) < .fs-btn (body, при загрузке) < .char-panel (body,
при открытии) < .dungeon-overlay (body, при входе) — активный UI
сверху пассивных (прецедент 000212 §3.4). Геометрических пересечений
НЕТ: .fs-btn — правый НИЖНИЙ угол, #hud — левый ВЕРХНИЙ, .char-panel
bottom:56px (нижняя кромка выше кромки кнопки).

## 4. Бой — НЕ тронут (000017)

В бою fsOver = false → zIndex '' → базовые 15 < 20 — кнопка под боевым
оверлеем («не мешает в бою», memory/000017). После боя, в мире, на
NPC-окне/постройке/крафте/воскрешении — '' (reset, ТЗ п.1 «вне
условия — сброс»). В городе/подземелье вне этих экранов — '25'. Ноль
правки боевого кода.

## 5. Тач-решение — ПРИНЯТО, НОЛЬ правок (ТЗ п.3)

Зона перекрытия, заявленная ТЗ, в коде НЕ существует:
* #touch-controls (z-30) — pointer-events: none (index.html:198-206) —
  прозрачный для хит-теста: клик проходит СКОЗЬ него к .fs-btn (z-25);
  z-30 > z-25 влияет только на transparent-фон.
* Кнопки [E]/[I] УЖЕ раскладываются ВЫШЕ зоны .fs-btn: bottomInset()
  (src/ui.js:1748-1750) = fsBtn.offsetHeight + 12
  (document.querySelector('.fs-btn') : 0) → layoutTouchControls
  opts.bottomInset (src/controls.js:226-227, guard
  Number.isFinite — нечисло → 0): [E] поднят на inset, [I] над ним;
  D-pad — левый нижний (конфликта нет).
* vm-харнес: document.querySelector → null → inset 0 — тач-раскладка
  в vm не меняется; в браузере без fullscreen-API кнопки нет → inset 0
  — как сейчас.
* Альтернатива «сдвинуть .fs-btn» ОТКЛОНЕНА: потребовала бы
  семантической правки пина ui-panel:494-497 (bottom ≥ 56px) —
  запрещено инвариантом.
* Ограничение ТЗ «тач-контролей — не трогать (если решение — принять
  перекрытие)» выполнено: правок тач-контролей НЕТ.

## 6. Тесты (tests/fullscreen-button-overlay.test.js — НОВЫЙ файл)

Харнес: САМОДОСТАТОЧНАЯ full-chain vm-песочница — копия конвенции
tests/dungeon-info-window.test.js (CHAIN-скрипты из index.html,
Proxy-DOM makeEl с style:{}, WebGL/Image-стабы, frameFn = последний
rAF-колбэк, drain, h.errors; хелперы findCityFor/walkCity/
cityStepsTo/walkTiles — дубли из tests/city-interact.test.js) +
ЕДИНСТВЕННОЕ отличие: МОК стандартного Fullscreen API в
sandbox.document (паттерн makeDoc('std') из tests/fullscreen.test.js):
documentElement.requestFullscreen/exitFullscreen → Promise.resolve(),
document.fullscreenElement, document.exitFullscreen. Тогда
fullscreen.supported === true и main.js СОЗДАЁТ .fs-btn (кнопка —
findAll(h.body, '.fs-btn')). Мок ЛОКАЛЕН новому файлу: просочится в
чужие харнесы → кнопка появится в DOM 62 песочниц (риск a1 §3.2) —
запрещено; documentElement в src/ читает только fullscreen.js.

RED (6; падают на master ОСМЫСЛЕННО: fsBtn.style.zIndex ===
undefined — нет блока подъёма в frame() и хоистинга; boot чист:
h.errors 0, кнопка в body; сбросные кейсы — строгий пин '',
ревью 2026-10-24, §9):
* FS-1 — подземелье (debug g.actions.enterDungeon, main.js:4035) +
  кадр → zIndex '25' (кнопка ПОВЕРХ непрозрачного оверлея z-20).
* FS-2 — город (walkTiles-протокол, findCityFor предикат fp >= 2,
  kind 'city') + кадр → '25'; в body ровно одна .fs-btn.
* FS-3 — конъюнкция боя (дубль DH-6): dungeon '25' →
  g.actions.startCombat (main.js:4019) + кадр → '' (бой скрыт,
  000017) → resolveCombat (мобы 9999 → Space) + кадр → '25' снова;
  локация цела.
* FS-5 — город: '25' → KeyE на Оружейной (buildingId 1, NPC Бренн —
  «Диалог» гарантирован; протокол CI-V2: findCityFor предикат
  fp >= 2 && buildings.some(buildingId === 1), walkCity, KeyE,
  Digit1, Escape — winListeners keydown) → buildingUI.isActive() +
  кадр → '' (!inBuilding) → npcUI.isActive() + кадр → '' (!inNpc) →
  Escape + кадр → '25' снова.
* FS-6 — идемпотентность: подземелье, '25' установлен →
  counting-Proxy над fsBtn.style (set-трап) → ПОВТОРНЫЙ кадр →
  sets === 0 (без лишней записи), значение '25'.
RED (1; до ревью 2026-10-24 — «зелёный гард», см. §9):
* FS-4 — (a) свежий boot (мир) + кадр → '' (базовые 15 из CSS);
  (b) выход из подземелья ([E] на едином тайле, 000177) + кадр → ''
  (сброс — «вне условия — сброс», ТЗ п.1). Красный на master
  (undefined ≠ ''), зелёный после фикса.
inCraft/inResurrect — отдельными тестами НЕ покрываются (ТЗ-красный
список: бой/мир/NPC; конъюнкты — защитные, прецедент DH-6).

Бит-в-бит (зелёные БЕЗ правок): CI-13 (city-inventory-e2e:1116-1136,
CSS-лестница; комментарий :174-175 вне regex-захвата `.fs-btn\s*{…}`),
ui-panel:485-509 (.fs-btn z-15, bottom ≥ 56), DH-1..DH-8 (#hud-блок
не тронут), RW-2/RW-3 (dungeon-side-panel: оверлей = canvas, #hud
'25'), fullscreen.test.js (8), hud.js.test.js HU4/HU5, index-order
(новых скриптов НЕТ), TV-тесты тач-раскладки (0 правок controls/
ui). Технических правок существующих тестов — НИ ОДНОЙ.
Гард деградации: 62 fullchain-сьюта БЕЗ fullscreen-мока прогоняют
frame() с fsBtn === null — блок обязан быть no-op (гард
`if (fsBtn && fsBtn.style)`); зелёный полный набор = пин деградации
(прецедент CI-12).
Верификация RED: node --test tests/ — падают ровно 6 новых
('25'/'': undefined vs expected; FS-4 — '' vs undefined), остальные
зелёные; полный прогон — ОДИН (memory no-parallel-full-tests);
флейк чужого теста — перепуск файла + запись в отчёт.

## 7. REBASE-факты (ТЗ vs кодовое состояние worktree)

* ТЗ по master 7c1619d: там подъём #hud имел исключение города
  (`kind === 'dungeon'`, «город — вне скоупа»). Worktree УЖЕ содержит
  000247 (6d9175f): исключение УБРАНО — hudOver = оба kind'а
  (main.js:3744-3746, коммент «000247: город — в скоупе»).
  Формулировка ТЗ «БЕЗ исключения kind, в отличие от #hud» УСТАРЕЛА —
  условие .fs-btn = банковская копия текущего hudOver (отдельный
  const, §2b). Решение ТЗ (frame-driven подъём до z-25, оба kind'а,
  сброс '' вне условия, бой — не трогать) НЕ ИЗМЕНЯЕТСЯ.
* ТЗ: «город: .combat-side — правый ВЕРХНИЙ угол (index.html:672-678)»
  — УСТАРЕЛО: панель убрана СОВСЕМ в обоих kind'ах (000229/000247,
  оверлей = только canvas, пины RW-2/DH-4). Вывод «правый нижний угол
  свободен» сохранён.
* ТЗ: «зона перекрытия [E]/[I] с .fs-btn на таче» — уже решено в коде
  (bottomInset, §5) — решение «принять», ноль правок.
* HEAD worktree ушёл от базы аналитики (1555088 → 7508f0f, 000252):
  коммит трогает только spec/, memory/, tasks/,
  tests/rar-g-heading-000252.test.js, tests/spec-split.test.js,
  tests/ui.test.js — наши зоны (src/main.js, index.html) — НОЛЬ.
* Перед мержем: rebase на свежий master + повторный полный прогон
  (стандартный протокол; frame() — горячая зона, точка вставки — по
  факту кода).

## 8. Важно будущим задачам

* '25' — ОБЩИЙ динамический слот: 000206 .char-panel / 000212 #hud /
  000256 .fs-btn. Новый подъём над локацией — тот же слот + обновление
  этого §3 и memory/000212 §3.4.
* fsOver (000256) и hudOver (000212/000247) — сейчас банковская
  копия. Ре-скоупирование одного (напр. возврат исключения kind для
  #hud, расширение .fs-btn на бой) — проверить другое и обновить этот
  файл.
* Точка вставки в frame() — сразу после #hud-блока, перед «000235.02:
  книга» (сейчас main.js:3751) — горячая зона (каждая UI-задача
  добавляет сюда applyLayer/подъёмы: 000195/000206/000212/000217/
  000235.02) — при rebase выбирать по факту.
* Fullscreen-мок (documentElement.requestFullscreen) — ЛОКАЛЕН
  tests/fullscreen-button-overlay.test.js — не вносить в другие
  харнесы: кнопка появится в DOM 62 сьютов.
* Click-пин (клик кнопки → requestFullscreen) — НЕ в ТЗ; в
  fullchain-харнесе document.addEventListener — no-op, кликовый пин
  потребует хранения listener'ов. ТЗ покрывает только z-состояния.
* В vm-песочнице style — ПРОСТОЙ объект (makeEl style: {}), НЕ
  CSSStyleDeclaration: незасланный zIndex === undefined (не '').
  Поэтому сбросные кейсы «''» красны на master СТРОГИМ пин
  assert.equal(zIndex, '') (undefined ≠ ''), а falsy-пин (!zIndex)
  на master был тривиально зелёным — урок ревью 2026-10-24, §9.

## 9. Правки по итогам ревью (2026-10-24, станция «правки по
итогам ревью»)

Три finding, вердикты:
* (minor) Сбросные пин были falsy (!zIndex) — тривиально истинны на
  master, тогда как ТЗ-красный список требует кейсы «''» (бой/мир/
  NPC-окно). РЕАЛЬНО, ИСПРАВЛЕНО: 5 ассертов (FS-3 бой, FS-4
  мир/выход, FS-5 buildingUI/npcUI) заменены на
  assert.equal(zIndex, '') — зафиксирован факт записи '' (а не
  просто отсутствие '25'). FS-4 стал красным на master (undefined ≠
  '') → expectedRedCount 5 → 6. Под-ассерты «''» в FS-3/FS-5 на
  master не наблюдаемы (тесты падают раньше на `=== '25'`) — новый
  красный именно FS-4. Ре-верификация RED — временный DETACHED
  worktree на 1555088 с копией тестового файла, удалён сразу после
  (урок по finding 2: red-check без ветки и без остатка).
* (minor) Остаточный worktree /tmp/wt-000256-red + ветка
  red-check-000256 (созданы RED-станцией). ЛОЖНОЕ на момент
  станции: каталога в /tmp НЕТ, регистрации в .git/worktrees НЕТ,
  ref'а red-check-000256 НЕТ — уже очищено; действий нет.
* (blocker) tests/map.test.js «перформанс: 160k tileAt … в
  тайм-бюджете» (бюджет 5000 мс) упал в полном прогоне при
  load avg 8.6–27.5 (замер 8046–8828 мс) — флейк ОТ НАГРУЗКИ
  ХОСТА, не от изменений задачи: файлы задачи (src/main.js,
  index.html) вне пути теста; standalone при load 1.25 — PASS;
  флейк задокументирован в коммите 57a656c. Кодовых правок НЕТ.
  Протокол: полный node --test повторно при load < ~3 (станция
  мержа); при воспроизведении на чистой нагрузке — отдельная
  задача по тайм-бюджету (базовые ~200 мс при бюджете 5000 мс —
  запас >25x).
* CHANGELOG — буллет «Интерфейс» под «## 2026-10-24» (дата мержа;
  станция доработки 2026-10-24: перенесён из «## 2026-10-23», где его
  закоммитила станция РЕАЛИЗАЦИЯ, до пересечения полуночи): кнопка
  полноэкранного режима теперь видна и кликабельна в городах и
  подземельях (в бою — как раньше, скрыта); программная часть не
  перечисляется.

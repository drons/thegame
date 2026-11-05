# 000331 — Боевая книга заклинаний: вкладки по школам (баг 000301)

Статус: ВЫПОЛНЕНО (2026-11-05). Worktree task/000331, база = master
f5b6d91. ТЗ tasks/pending/000331.md → tasks/done/000331.md, отчёт
tasks/result/000331.md. spec/ — 0-diff (решение анализа: 000301
смержен без правок spec, контракт 000301 уже описан в
memory/000301-spellbook-school-tabs.md; ре-пинов spec-split НЕТ —
spells.md остаётся 435).

## 1. Корень бага

000301 добавил вкладки по школам ТОЛЬКО в книгу вне боя
(src/spellbook-oc.js): локальная константа SCHOOLS, inline-строка
кнопок в ensureDom, локальный refreshTabs, локальный activeSchool.
Боевая книга (src/combat-ui.js: renderBook) строит строки СПЛОШНЫМ
списком (bookRows = SpellBook.entriesFor всего листа) — никаких
вкладок и фильтра. ТЗ 000301 (и его память §4) явно предписывали
вкладки для ОБОИХ книг через ОДИН общий рендер — боевая книга
осталась без них.

## 2. Унификация (ЕДИНЫЙ рендер вкладок)

Модуль-хозяин — src/spellbook.js (Game.SpellBook): уже общий для
обоих книг (entriesFor), load-clean, ПЕРЕД обоими потребителями в
index.html (снапшот-ловушка 000038: combat-ui снимает Game один раз
на загрузке; spellbook-oc читает лениво через curGame()).

Новый surface (существующий entriesFor НЕ тронут):
* `SCHOOLS` — константа 6 школ (id/название/иконка), ПЕРЕНЕСЕНА из
  spellbook-oc.js байт-в-байт (единый источник, 000301 §2.3). id =
  поле «школа» каталога заклинаний; иконки assets/school-icons/*.svg
  (на диске с 000301, 0 новых файлов).
* `buildTabs(d, tag, onSelect)` — строит ряд вкладок: контейнер
  div.spoc-tabs + 6 элементов `tag` (класс spoc-tab, title = имя,
  ariaLabel, dataset.school = id, img.spoc-tab-icon (src/alt),
  click → onSelect(id)). `tag === 'button'` → type='button'
  (книга вне боя); боевая книга передаёт 'div' (R9-паттерн:
  DOM-счётчики кнопок в тестах — SB1 buttons.length === 8).
  Две реализации, давших баг (inline-строка в spellbook-oc +
  «ничего» в combat-ui) заменены ОДНОЙ.
* `refreshTabs(tabsEl, activeSchool)` — применяет класс
  spoc-tab--active (000301: повторный клик = «все» = активной нет).
  Индексная итерация children (браузер: HTMLCollection — не Array;
  регресс-пин 000301 T6) — код ПЕРЕНЕСЕН из spellbook-oc.js.

Потребители:
* src/spellbook-oc.js — ensureDom вызывает
  `G.SpellBook.buildTabs(d, 'button', (id) => selectSchool(id))`
  (typeof-гард: без buildTabs — пустой div.spoc-tabs, деградация
  тихая, 0 console.error — сценарии OC17(c)/(d) index-order);
  refreshTabs делегирует `G.SpellBook.refreshTabs(tabsEl,
  activeSchool)` (typeof-гард → no-op); empty-текст школы читает
  `G.SpellBook.SCHOOLS` (Array.isArray-гард → фолбэк на
  activeSchool-строку). ЛОКАЛЬНЫЕ SCHOOLS/строка/refreshTabs
  удалены. Surface spellbookOC — РОВНО 6, как был (OC17-пин).
* src/combat-ui.js — build():
  `bookTabsEl = (G.SpellBook && typeof G.SpellBook.buildTabs ===
  'function') ? G.SpellBook.buildTabs(document, 'div',
  selectBookSchool) : null` → className 'combat-spellbook-tabs'
  (перезаписывает 'spoc-tabs' — свой класс, стиль вкладки .spoc-tab
  — переиспользуется), display 'none'; appends в .combat-box ПОСЛЕ
  bookBox (порядок детей: [canvas, bookBox, bookTabsEl, fleeBox,
  bannerEl] — 5). renderBook: display вкладок из bookOpen
  (''→'flex'/'none'), refreshTabs ДО sig-ранлифта. selectBookSchool
  — семантика 000301: `if (!bookOpen) return; bookSchool =
  (bookSchool === id) ? null : id; render();` — чистый UI, 0 ядра,
  0 c._rng, 0 лога.

Фильтр строк (renderBook): `rows.filter((row) => bookSchool ===
null || !catalog || (catalog[row.id] && catalog[row.id]['школа']
=== bookSchool))` — catalog = G.SpellsData.SPELLS_BY_ID; сигнатура
пересобирается из ОТФИЛЬТРОВАННЫХ пар → смена школы всегда
перестраивает строки (включая случай «две школы дали одинаковый
набор строк» — здесь это невозможно, школы не пересекаются, но
sig честен). Пустой фильтр — строка-маркер «—» (паттерн 000145, тот же
sentinel 'empty' что и пустая книга). Без каталога (деградация) —
фильтр inert, книга бит-в-бит master.

## 3. Путь каста — НЕ тронут

castRow/resurrectCast/spellBtnOf/lastSpells/seededSelectionOf —
0 правок логики. Каст — кликом по строке (слушатель строки), строки
строит тот же buildSpellRow(c, row, rowChk) с теми же данными;
фильтр выбирает ПОДМНОЖЕСТВО строк, а не меняет их. Единственные
правки в castRow/resurrectCast — сброс `bookSchool = null` в ветке
r.ok ПРЯМО ПОСЛЕ `bookOpen = false` (6 точек сброса bookOpen:
toggleBook-закрытие, castRow r.ok, resurrectCast r.ok — книга
после каста/воскрешения открывается сразу в «все», состояние
вкладки не течёт между боями/кастами). finish/catch (правило
000170 — ОБЕ точки) + bookSchool = null; bookTabsEl = null.

## 4. CSS (index.html)

* `.combat-overlay--combat .combat-spellbook` — padding `10px` →
  `54px 10px 10px` (место под ряд вкладок: вкладка 32px + 10px
  сверху + 12px зазор). Прочие поля правила НЕ тронуты (гард
  CU196-CSS-OVERLAY/NOCAP/PORTRAIT цёлы: padding не был закреплён).
* `.combat-overlay--combat .combat-spellbook-tabs` — НОВОЕ:
  position absolute; top = calc(50% − H/2 + 10px), где H =
  min(100vh − 32px, 100vw − 304px) (зеркало формулы книги: ряд —
  10px НИЖЕ верхнего края книги); left 50% + translateX(-50%);
  display flex; flex-wrap wrap; gap 8px (метрики .spoc-tabs);
  max-width = H − 20px (ширина книги − padding 10×2);
  pointer-events none (контейнер).
* `.combat-overlay--combat .combat-spellbook-tabs .spoc-tab` —
  pointer-events auto (клик-фильтр поверх pass-through; контейнер
  книги pointer-events none — гард CU196).
* portrait @media (max-width 640px + portrait): зеркало
  .combat-spellbook-tabs с portrait-формулой H = min(100vw − 16px,
  100vh − 16px − 520px).
* Правила .spoc-tab* (000301) — НЕ тронуты (глобальные, не
  scoped к .spellbook-oc) — переиспользуются обеими книгами.

## 5. Тесты

* tests/combat-spellbook-tabs-000331.test.js (НОВЫЙ, 4): 331-CBT-1
  (ряд .combat-spellbook-tabs — сиблинг книги, порядок детей box;
  6 вкладок div в порядке ТЗ с иконками/alt/title; дефолт «все»;
  кнопки = 8; строки spark/mend бит-в-бит), 331-CBT-2 (клик =
  фильтр по школе; переключение; toggle off; пустая школа —
  маркер «—» -off, ровно +1 строка), 331-CBT-3 (каст из
  отфильтрованного вклада — c._fx.action cast; после каста книга
  закрыта + вкладка сброшена к «все»; фикстура: m0.hp = 9999 —
  каст НЕ завершает бой), 331-CBT-CSS (правила row + portrait,
  pointer-events, гард .combat-spellbook). Краснота на master —
  осмысленная: 4/4 fail (отсутствующий DOM/CSS, не краш).
* Регрессия «книга вне боя бит-в-бит» (б ТЗ) —
  tests/spellbook-oc-tabs.test.js (000301 T1-T6) — без единой
  правки, зелёный с первого прогона (6/6): DOM вне боя не изменился
  (buildTabs 'button' даёт тот же button/type/title/dataset/img).
* Ре-пины (техника, тот же коммит) tests/combat-ui.test.js — 4
  места .combat-box-детей: CU196-POS (4→5 + класс-список),
  237-CU-LOOT-1 victory (5→6 + список), 237-CU-LOOT-4 fled (4→5),
  261-CU-LOOT-RAR (5→6 + список; МЕСТО, ПОПРАВЛЕННОЕ АНАЛИЗОМ).
* Срез GREEN: 354/354 (новое 4 + oc-tabs 6 + spellbook +
  combat-ui + index-order + combat-layout + ally-spells).

## 6. Подводные камни

* UMD-ловушка 000038: combat-ui читает buildTabs из СНАПШОТА G
  (снят на загрузке) — spellbook.js обязан быть ДО combat-ui.js
  (пин index-order; в harness — existsSync-гард). spellbook-oc —
  лениво (curGame).
* vm-стаб боевого UI (tests/combat-ui.test.js makeEl) — БЕЗ
  setAttribute/innerHTML/removeChild: buildTabs — только прямые
  присвоения (dataset.school/title/ariaLabel/src/alt); перестроение
  книги ДОБАВЛЯЕТ строки (innerHTML-чистка только для «реального»
  DOM, typeof-гард) — тесты читают хвост children.slice(-N).
* Стаб-детали: children — накапливающийся Array → assertion
  «пустая школа» — по DIFF длины (+1), НЕ по «последняя строка —
  маркер среди спеллов» (спелловые строки прежних перестроений
  остаются в хвосте под маркером).
* Каст завершает бой: сценарий «книга после каста» требует
  m0.hp = 9999 (волк L1 — 5 hp; spark убивает при c._rng = 0.99) —
  иначе result = victory и KeyQ — «бой закончен».
* Сброс bookSchool — ВЕЗДЕ, где сбрасывается bookOpen (6 точек:
  toggleBook-закрытие, castRow r.ok, resurrectCast r.ok — analysis
  упустил resurrectCast: без сброса там фильтр вытечет в след.
  бой/каст). finish/catch — обе точки (000170).
* refreshTabs — ДО sig-ранлифта в renderBook (steady-state):
  иная школьная сигнатура всё равно перестроит строки, но класс
  вкладки обновляется всегда.
* Ряд вкладок — СИБЛИНГ bookBox (не дочерник): bookBox.children —
  только строки (SB2 === 2 и все slice(-N)-пины цёлы).
* Счёт DOM-кнопок: вкладки боя — div (R9); buttons.length === 8
  (SB1) цёл.
* master ушёл вперёд от базы (f5b6d91 → 000323/000283.01.01/000335):
  финализация — ребаз; конфликт CHANGELOG «## 2026-11-05»
  ожидается (буллеты 000324/000283.01.01/000323-Графика): порядок
  секций «Игровой процесс» ПЕРЕД «Графика», буллет 000331 — ПОСЛЕ
  буллета 000324.

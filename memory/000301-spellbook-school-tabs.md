# 000301 — Книга заклинаний: вкладки по школам магии с иконками (книга вне боя)

Статус: ВЫПОЛНЕНО (станция реализации 2026-11-02): GREEN — код + 6 SVG +
CSS + CHANGELOG, полный сьют 3465/3465 (база 3460 + 5 T1-T5), отчёт
tasks/result/000301.md, задача в tasks/done/000301.md. Ревью-правки
2026-11-03 (§8): refreshTabs — индексная итерация (HTMLCollection в
браузере — НЕ Array, Array.isArray-guard молча глушил активный класс
в production; T6 — регресс-пин) + W-05-пин уникальности 6 school-
icons; полный сьют 3467/3467. Финализация 2026-11-03: свежий
полный прогон 3467/3467, отчёт/memory обновлены (актуальный
GREEN-SHA 5ae2280 — исходный b5bdc51 заменён внешним amend;
§6-ребаз — tip master 3c15913, 9 коммитов впереди базы). Ниже —
контракт Проектирования (без изменений: реализация прошла ровно по
нему; §3-строка refreshTabs обновлена ревью-правкой).

Статус: ПРОЕКТИРОВАНИЕ завершено (2026-11-02). Worktree task/000301, ветка
task/000301, база = master 9ef5821. На момент Проектирования master уже
710dcfd — 3 коммита впереди (0312ad4 000290, 2259085 000308, 710dcfd 000296;
см. §6 «Ребаз»).
Вход: ТЗ tasks/pending/000301.md, анализы a1 (домен) / a2 (архитектура) /
a3 (тесты), контракты memory/000235.02-spellbook-out-of-combat.md (книга),
memory/000120-svg-schema.md (SVG), memory/000149-* (spell-icons/entriesFor).
Все номера строк сверены с кодом worktree на 2026-11-02 (база 9ef5821); при
ребазе ориентироваться по контексту (маркеры-селекторы/комментарии), а не по
номерам.

## 1. Что добавлено / перенесено

* src/spellbook-oc.js — ЕДИНСТВЕННАЯ правка JS (+≈55 строк): константа
  SCHOOLS (6 школ: id/название/иконка), модульное состояние activeSchool /
  tabsEl, вкладки в ensureDom (между .spoc-title и rowsEl), selectSchool,
  refreshTabs, 2-я строка условия в существующем outside-фильтре render(),
  динамический empty-текст, сброс activeSchool/tabsEl в close().
* assets/school-icons/ — НОВЫЙ каталог, 6 SVG (protection/healing/ice/fire/
  nature/shadow .svg; 24×24, #e8dcc0, §2.5).
* index.html — только 5 НОВЫХ CSS-правил в конце блока 000235.02 (после
  правила .spoc-hint, перед </style>; база: .spoc-hint :1208, </style>
  :1209). НОВЫХ <script> НЕТ.
* tests/spellbook-oc-tabs.test.js — НОВЫЙ самодостаточный файл (дубль
  харнеса spellbook-oc-e2e), T1–T5 (§5).
* tests/svg.test.js — ОДНА техническая строка: EXPECTED_SVG_BY_DIR
  +'school-icons': 6 (рядом со 'spell-icons': 167, база :501).
* CHANGELOG.md — новая подсекция «### Интерфейс» в ## 2026-11-02 (упоминание
  вкладок; программная часть не перечисляется; формат по записям 2026-10-24/
  2026-10-23 «Интерфейс»).
* tasks/pending/000301.md → tasks/done/ + tasks/result/000301.md (отчёт).

НЕ ТРОГАЕТСЯ: src/spellbook.js (entriesFor — без поля «школа», deepEqual-пин
SB6), src/combat-ui.js (боевая книга — вне скоупа, §2.1), src/ui-tab-skills.js
(read-only секция [I]), src/save.js (сейв v1 append-only — вкладки НЕ
персистятся), tests/spellbook-oc-e2e.test.js (2326 строк; параллельные
000235.08.01/000235.12.02 могут его трогать — не доращивать), остальной
контент assets/spell-icons/ (167, пин W-05), все существующие CSS-правила
(.spoc-row и др. — гарды OC18/T5).

## 2. Контракты и границы

### 2.1 Целевая книга — ВНЕБОЕВАЯ (ключевое решение, Д)

Вкладки ставятся в src/spellbook-oc.js (оверлей .spellbook-oc, z-35, KeyB,
заголовок .spoc-title «Книга заклинаний (вне боя)»). В игре ТРИ поверхности
«книга»: боевая (combat-ui.js, .combat-spellbook, кнопка «Книга заклинаний»
Q/R), внебоёвая (эта) и read-only секция [I]-панели (ui-tab-skills.js).
Выбор внебоёвой — по совокупности:
1. это единственный экран-«книга» (полноэкранный оверлей с заголовком «Книга
   заклинаний (вне боя)»); боевая «книга» — коробка строк внутри боевого
   quick-cast UI;
2. ТЗ-минимализм + инвариант «боевые механики не трогаются»: spellbook-oc.js
   — самодостаточный 298-строчный модуль; combat-ui.js — горячая зона
   (параллельные pending 000291, 000227.01 правят тот же файл — риск
   merge-конфликта) с UMD-ловушкой 000038 и плотными пинами;
3. гард OC18 в index-order прямо фиксирует «.combat-spellbook … боевая
   книга — вне скоупа» для смежной задачи 000235.02 — дисциплина: не
   «помогаем» боевой книге.
a1 рекомендовал боевую (точное имя кнопки, длинный список) — зафиксировано
как FOLLOW-UP (§7): если drons уточнит, что хотел боевую — отдельная задача
(карта правок 4 зон — a1 §4: state/build/renderBook/finish; там обязателен
split bookBox → tabsEl+rowsEl, т.к. renderBook чистит bookBox.innerHTML).

### 2.2 Вкладки: поведение и состояние

* РОВНО 6 вкладок, вкладки «Все» НЕТ (7-й элемент — дублирование режима,
  ТЗ требует только 6 школ). Порядок ТЗ: [защита, исцеление, лёд, огонь,
  природа, тень].
* Состояние — модульное в spellbook-oc.js: `let activeSchool = null`
  (null = «все») + `let tabsEl = null` (ленивая DOM). НЕ в opts, НЕ в
  сейве, НЕ в hero (сейв v1 append-only не трогаем; ТЗ не требует).
* Дефолт (и после close) — «все»: НИ ОДНОЙ активной вкладки
  (active-класс = видимый маркер выбора; отсутствие = «все» — однозначное
  состояние без 7-го таба).
* Клик: `selectSchool(id)`: `if (!open || !rootEl) return; activeSchool =
  (activeSchool === id) ? null : id; render();` — повторный клик по
  АКТИВНОЙ вкладке = снять фильтр (toggle); клик по другой = ПЕРЕКЛЮЧЕНИЕ
  (не toggle!). Точные семантики зафиксированы в T2 (§5) — а3-формулировка
  «клик по «огню» снова → 6 строк» читается именно как «повторный клик по
  активной».
* close(): + `activeSchool = null; tabsEl = null;` (рядом с существующим
  rootEl/rowsEl = null) → повторное открытие = дефолт «все».
* Активный класс синхронизирует refreshTabs() (переопределяет className
  вкладки «spoc-tab» ↔ «spoc-tab spoc-tab--active» по dataset.school ===
  activeSchool) — вызывается на ОБА выхода render(): после цикла строк И в
  ветке empty (до return). Причины: applyVisibility() re-render при смене
  дня и cast()-fallback re-render должны держать классы в синхроне.
* DOM вкладки: `<button type="button" class="spoc-tab" data-school="<id>">`
  + внутри `<img class="spoc-tab-icon" src="<icon>" alt="<name>">`;
  button.title = name (property — читаемо в vm-стабах), aria-label через
  setAttribute. button (не div) — a11y: иконка-без-текста обязана иметь имя;
  сборка — createElement/appendChild (R11: innerHTML запрещён).
* Позиция в DOM: .spoc-panel > [.spoc-title, .spoc-tabs, div(rowsEl, без
  класса), .spoc-hint] — вкладки СВЕРХУ списка, как требует ТЗ. rowsEl
  остаётся голым div БЕЗ класса (комментарий OC17(d) :1918).

### 2.3 SCHOOLS — единственный источник мапы школа→(название, иконка)

Константа модуля (верх фабрики, load-clean — чистые данные):
  id 'защита' → name 'Защита', assets/school-icons/protection.svg
  id 'исцеление' → name 'Исцеление', assets/school-icons/healing.svg
  id 'лёд' → name 'Лёд', assets/school-icons/ice.svg
  id 'огонь' → name 'Огонь', assets/school-icons/fire.svg
  id 'природа' → name 'Природа', assets/school-icons/nature.svg
  id 'тень' → name 'Тень', assets/school-icons/shadow.svg
id = ЗНАЧЕНИЕ поля «школа» из JSON-каталога (с ё: 'лёд'; enum
schema.json :28-30 ровно эти 6). name — для title/aria-label/empty-текста
(капитализировано). Порядок массива = порядок вкладок = порядок ТЗ.
НОВЫХ публичных экспортов НЕТ: surface Game.spellbookOC остаётся РОВНО 6
{init, toggle, isOpen, close, applyVisibility, render} — deepEqual-пин OC17
(index-order :1781-1786). Тесты ходят через DOM (data-school + click),
публичный API не требуется.

### 2.4 Фильтр и empty-текст (render())

* Фильтр — ВТОРОЕ условие в СУЩЕСТВУЮЩЕМ outside-фильтре (база
  spellbook-oc.js :136-140), ДО entriesFor:
  `if (activeSchool !== null && s["школа"] !== activeSchool) return false;`
  (s = SPELLS_BY_ID[id] — уже получен тем же фильтром; когда
  activeSchool === null поведение БИТ-В-БИТ как master).
* Неизвестные id школы не имеют — НО их уже отсекает 1-е условие
  (`s && s["вне_боя"] === true`: нет записи в каталоге → false). Строка
  «деградации» entriesFor в этой книге недостижима; повторного lookup'а не
  нужно. Без каталога (g/SpellsData null) — outside=[] как на master
  (empty-ветка).
* entriesFor НЕ расширяется полем «школа» (src/spellbook.js) — deepEqual-
  пин SB6 (spellbook.test.js :484-527) на ВЕСЬ объект строки; семантических
  правок существующих тестов нет (инвариант).
* empty-текст: activeSchool === null → «Нет изученных заклинаний вне боя»
  БЕЗ ИЗМЕНЕНИЙ (существующий текст, пин-контекст OC12 :675); фильтр
  активен → «Нет изученных заклинаний школы «<name>»» (name из SCHOOLS;
  «Огонь» и т.д.; кавычки «»).
* cast() по клику строки — не меняется: кастуется то, что видно.

### 2.5 Источник иконок: assets/school-icons/ (6 SVG)

* Каталог: assets/school-icons/ — НОВЫЙ (конвенция: иконки-сущности в своём
  верхнем каталоге — spell-icons для заклинаний; assets/ui/ — action-иконки
  боя, пин 'ui': 12 — НЕ ТРОГАТЬ; spell-icons: 167 пин W-05 — туда школы
  НЕ добавлять).
* Имена: protection.svg (защита), healing.svg (исцеление), ice.svg (лёд),
  fire.svg (огонь), nature.svg (природа), shadow.svg (тень) — латиница,
  по аналогии spell-icons; мапа в SCHOOLS (§2.3).
* Формат (конвенция icon_prompt + образец assets/spell-icons/fireball.svg):
  корневой `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"
  viewBox="0 0 24 24">` + один `<path fill="#e8dcc0" d="…">` (несколько
  подпутьев в одном d допустимо — паттерн fireball.svg); без фона, обводки,
  градиентов, текста. Все координаты в 0..24.
* Силуэты (эмблемы школ; отличимы друг от друга И от per-spell иконок).
  d-атрибуты ПРЕДПОЧИСЛЕНЫ на стадии Проектирования (GREEN их только
  выкладывает; проверка — checkSvg solo ДО git add):
  * protection — щит:
    `M12 1.5 L20 4.5 V12 C20 17.5 16.5 21 12 22.5 C7.5 21 4 17.5 4 12 V4.5 Z`
  * healing — крест (плюс 6×18, центр (12,12)):
    `M9 3 H15 V9 H21 V15 H15 V21 H9 V15 H3 V9 Z`
  * ice — снежинка: 3 перекрестных бруса 1.8×20 (вертикальный + тот же
    через rotate(±60° 12 12), координаты ВРАЩЕНИЯ предвычислены —
    transform-атрибут НЕ используется, остаётся 1 path / 3 подпути):
    `M11.1 2 H12.9 V22 H11.1 Z M20.21 6.22 L21.11 7.78 L3.79 17.78 L2.89
    16.22 Z M2.89 7.78 L3.79 6.22 L21.11 16.22 L20.21 17.78 Z`
  * fire — пламя-капля (симметричный силуэт, 24×24):
    `M12 2 C13 6.5 16.5 8.5 16.5 13.5 C16.5 18.5 14.5 21.5 12 22 C9.5
    21.5 7.5 18.5 7.5 13.5 C7.5 8.5 11 6.5 12 2 Z`
  * nature — лист-линза по диагонали (19,3)→(4,19.5) из 2 дуг r=11.5 +
    черешок-слитер от кончика (4.5,19.5) к (3,21):
    `M19.5 3 A11.5 11.5 0 0 1 4.5 19.5 A11.5 11.5 0 0 1 19.5 3 Z M4.5 18.5
    L2.5 20.5 L3.5 21.5 L5.5 19.5 Z`
  * shadow — полумесяц, рогом вправо (внешняя дуга r=9.62 до x=4, внутренняя
    r=9.75 до x=11; толщина ≈7 в середине; чётка ≠ 2r — без вырожденной
    полуокружности):
    `M17 3 A9.62 9.62 0 1 0 17 21 A9.75 9.75 0 0 1 17 3 Z`
* КАЖДЫЙ файл проходит tests/svg.test.js (well-formedness + корень svg +
  xmlns + viewBox + без NaN/пустых значений — 000120) ДО добавления в
  каталог (инвариант; прогон solo). 6 штук парно-уникальны по смыслу
  (щит/крест/снежинка/пламя/лист/месяц).
* Пин: EXPECTED_SVG_BY_DIR+'school-icons': 6 (tests/svg.test.js :435-511) —
  авторитетная таблица, итог считается из неё автоматически; без строки
  обход-тест красный «school-icons: ожидается 0, найдено 6» (и наоборот
  в red-фазе: «ожидается 6, найдено 0»).

### 2.6 CSS (index.html, блок 000235.02)

Позиция: КОНЕЦ блока — после правила .spoc-hint, перед </style> (база
:1208/:1209). Маркер-комментарий `/* 000301 — … */` (конвенция CSS-
комментариев блока). 5 правил, свои классы (чужие правила НЕ модифицировать
— гарды OC18; дисциплина first-occurrence cssRule):
  .spoc-tabs { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 8px; }
  .spoc-tab { display: flex; align-items: center; justify-content: center;
    width: 32px; height: 32px; padding: 0; border: 1px solid #3a3f4a;
    background: rgba(255, 255, 255, 0.03); cursor: pointer; }
  .spoc-tab:hover { background: rgba(255, 255, 255, 0.07); }
  .spoc-tab--active { border-color: #d8c27a;
    background: rgba(255, 255, 255, 0.07); }
  .spoc-tab-icon { width: 24px; height: 24px; display: block; }
* Палитра — СТРОГО существующие цвета блока .spoc-*/лестницы: #3a3f4a,
  rgba(255,255,255,0.03), rgba(255,255,255,0.07), #d8c27a (конвенция
  000124). rgba(216,194,122,0.15) из черновика a2 ОТКЛОНЕНО — новая rgba-
  форма, в index.html не существует (акцент-актив — по прецеденту
  .cp-portrait-active :1079: border-color #d8c27a + существующий фон).
* pointer-events в .spellbook-oc ВКЛЮЧЕНЫ (unlike #hud) — доп. auto не
  нужен (отличие от боевой книги, где контейнер none, Д3 000196).
* button-сброс: UA-декларации перекрываются (border/background/padding/
  display); font не важен (иконка без текста); focus-outline по умолчанию
  (a11y) не глушится.
* Регресс-гард T5: .spoc-row НЕ изменён (display flex / border / cursor
  pointer — CSS union, паттерн rules() OC18).

### 2.7 Инварианты (что остаётся)

* Surface Game.spellbookOC ровно 6 (OC17 deepEqual).
* НОВЫХ <script> НЕТ → CHAIN vm-песочниц (67 штук) и пины index-order
  (spellbook-oc.js :1283 ПОСЛЕ spellbook.js, ДО ally-spells.js/main.js —
  :1737-1753) не трогаются; load-clean сохранён (ноль чтений Game/require на
  загрузке; SCHOOLS — константа; каталог — только в render, как сейчас).
* Семантика строки (клик = каст), Esc/KeyB, applyVisibility, blocked() —
  без изменений; боевой путь каста, сейв, RNG, детерминизм — не трогать.
* Семантических правок существующих тестов НЕТ (svg.test.js — только строка
  таблицы).

## 3. Ленивые ссылки и guards

* curGame()/curDoc() (паттерн 000038/000053) — как есть: каталог
  SPELLS_BY_ID читается в render() при вызове (лениво); на загрузке —
  ничего.
* selectSchool guard `if (!open || !rootEl) return` + render() сам
  guard'ится (open/rootEl/rowsEl) — двойная страховка: клик-листер живёт
  только пока DOM существует (close() выносит rootEl), но render из
  applyVisibility/cast может прийти в любое состояние.
* refreshTabs guard: `const kids = tabsEl ? tabsEl.children : null;
  if (!kids || typeof kids.length !== "number") return;` + индексная
  итерация `for (i < kids.length) kids[i]` + `t.dataset &&
  t.dataset.school === undefined` (vm-стабы OC17 минимальные —
  dataset есть, но читаем через &&). Индексная итерация (НЕ
  `Array.isArray`/`for…of`) — ревью-правка 2026-11-03 (§8): в
  реальном браузере `element.children` — HTMLCollection (НЕ Array,
  `Array.isArray` === false) — старый guard глушил refreshTabs()
  целиком в production (активный класс не ставился), а vm-стабы
  (children — обычный Array) маскировали; индекс + length работает
  и для HTMLCollection (браузер), и для Array (все vm-стабы).
* activeSchool принимает ТОЛЬКО id из SCHOOLS (источник — клик по вкладке,
  которая создана из SCHOOLS) → find по name в empty-тексте формально
  недостижим не нашедшим; деградация всё равно предусмотрена (fallback на
  activeSchool-строку), игра не падает.
* Совместимость с МИНИМАЛЬНЫМИ vm-стабами OC17 (mkEl без Proxy): button —
  createElement («button» стаб игнорирует), tab.type/tab.title — экспандо,
  setAttribute('data-school') → dataset (стаб обрабатывает),
  setAttribute('aria-label') — no-op в стабе (в реальном DOM — ок),
  img.src/img.alt — экспандо, addEventListener — записывается. OC17(d)
  находит строки через flatten grandchildren .spoc-panel + filter
  className==='spoc-row' — вкладки ('spoc-tab'/'spoc-tab-icon') фильтром
  исключаются, смежность детей НЕ проверяется (проверено по тексту :1911-
  1934).
* Без каталога (degrad. sandbox OC17(c): гость oc_guest_d без поля «школа»):
  activeSchool === null → 2-е условие не срабатывает → поведение как на
  master; клик по вкладке в этом сценарии тестами не делается.

## 4. Что важно будущим задачам (из ТЗ-ссылок)

* ТЗ ссылался на assets/spells/*.json (поле «школа»), assets/spell-icons/,
  «src (книга заклинаний — поиск)». Поиск дал 3 поверхности (§2.1) — решение
  зафиксировано: внебоёвая книга. Боевая книга (combat-ui.js) — follow-up
  (§7), если пользователь подтвердит: там своя карта (a1 §4: 4 зоны state/
  build/renderBook/finish; split bookBox → tabsEl+rowsEl ОБЯЗАТЕЛЕН —
  renderBook чистит bookBox.innerHTML :3193-3194; sig должен включать
  bookSchool; pointer-events:auto ОБЯЗАТЕЛЕН — контейнер боевой книги
  pointer-events:none, Д3 000196).
* СЕКЦИЯ [I]-панели (ui-tab-skills.js, read-only имена) — вкладки НЕ
  получала (не «книга» в смысле каста, ТЗ-наименование не совпадает).
* Добавление 7-й школы в enum schema.json — точки синхронизации: SCHOOLS в
  spellbook-oc.js (мапа+порядок), файл иконки + EXPECTED_SVG_BY_DIR
  'school-icons': N, T1 (порядок/список иконок).
* Иконки школ — теперь СУЩНОСТИ с каталогом: если появится экран «все
  школы» (магазин/академия) — источник иконок тот же (assets/school-icons/,
  стиль 24×24 #e8dcc0), не плодить вторые наборы.

## 5. Тесты (красные пишутся ПЕРВЫМИ)

* НОВЫЙ tests/spellbook-oc-tabs.test.js — самодостаточный (дубль харнеса
  spellbook-oc-e2e: full-chain vm из CHAIN index.html, makeEl/matchesSel/
  findAll, WebGL/Image-стабы, NOW=1000, boot/drain/key, dismissStartWindow,
  learn; + clickTab-хелпер по data-school — паттерн clickRow :591). Фикстуры
  — 6 РЕАЛЬНЫХ вне_боя заклинаний по одному на школу (сверено с каталогом
  на 2026-11-02): warding_circle (000142, защита), prayer (000114,
  исцеление), frost_walk (000065, лёд), firelight (000040, огонь),
  wild_growth (000165, природа), shadow_step (000089, тень).
  * T1 — 6 вкладок: boot → dismissStartWindow → learn(все 6) → KeyB →
    .spoc-tabs есть; ровно 6 .spoc-tab c data-school в порядке ТЗ [защита,
    исцеление, лёд, огонь, природа, тень]; у каждой img.spoc-tab-icon c
    src = assets/school-icons/{protection,healing,ice,fire,nature,shadow}.
    svg (1:1 со SCHOOLS, файлы существуют на диске) и alt = name; title =
    name; НИ ОДНОЙ .spoc-tab--active (дефолт «все»); строк .spoc-row ровно
    6 (поведение книги не изменилось); h.errors не растут. RED на master:
    .spoc-tabs отсутствует.
  * T2 — фильтр + ТОГГЛ: клик «огонь» → ровно 1 строка (data-spell-id =
    firelight) + «огонь» активна, остальные нет; клик «лёд» → ровно
    frost_walk (ПЕРЕКЛЮЧЕНИЕ: «лёд» активна, «огонь» нет); клик «лёд»
    Снова → 6 строк, активной вкладки НЕТ (toggle off). RED: вкладок нет /
    без фильтра при клике 6 строк.
  * T3 — сброс при закрытии: состояние T2 с активной школой → KeyB (close)
    → KeyB (open) → дефолт: 6 строк, активной вкладки нет.
  * T4 — пустая книга / пустая школа: свежий герой (дефолтные боевые
    spark/mend, вне_боя НЕТ) → KeyB → «все»: .spoc-empty «Нет изученных
    заклинаний вне боя» (текст БЕЗ ИЗМЕНЕНИЙ); 0 строк; клик «огонь» →
    .spoc-empty «Нет изученных заклинаний школы «Огонь»», 0 строк. RED:
    вкладок нет; empty-текст один для обоих режимов.
  * T5 — CSS-пины (чистый fs-read index.html, паттерн rules() OC18):
    правила .spoc-tabs/.spoc-tab/.spoc-tab--active/.spoc-tab-icon
    существуют (у .spoc-tab: border + cursor pointer + width 32px; у
    --active: border-color #d8c27a); гард: .spoc-row НЕ изменён
    (display flex / border / cursor pointer — CSS union).
* tests/svg.test.js — строка 'school-icons': 6 (красный до создания файлов,
  зелёный в том же коммите; дальше — охрана обходом).
* Верификация RED: solo `node --test tests/spellbook-oc-tabs.test.js`
  (T1–T5 fail осмысленно: нет .spoc-tabs/файлов/CSS-правил, не
  синтаксис) + solo `node --test tests/svg.test.js` (обход: «school-
  icons: ожидается 6, найдено 0»); остальные 3460 (база 9ef5821) — зелёные.
* Полный прогон: ТОЛЬКО `cd /home/sas/Documents/Art/thegame/.worktrees/
  task-000301 && npm test` + ps-проверка до пуска (memory/test-runner-
  worktrees.md; 000054 мутирует src/npc-data.js; голый npm test из корня
  основного репо ЗАПРЕТ — сканирует .worktrees/*, инцидент 2026-10-27).
  Флейк — перепуск solo + запись в отчёт.

## 6. Подводные камни

* Surface deepEqual OC17 — НОВАЯ публичная функция = красный (вкладки —
  внутренний DOM+состояние, API не растёт).
* refreshTabs — на ОБА выхода render() (строки + empty-ветка): забыть
  empty-ветку = T4 провалится на классе/а синхронизация сломается на
  пустой книге.
* Чистка строк — rowsEl.textContent = '' (R11), НОУЖЕ innerHTML; вкладки —
  отдельный ребёнок .spoc-panel и пересборками строк НЕ затрагиваются
  (в отличие от боевой книги, где bookBox.innerHTML — там свой split).
* rowsEl — БЕЗ класса; классы только .spoc-tabs/.spoc-tab/.spoc-tab--
  active/.spoc-tab-icon (T5-пины и OC18-first-occurrence чувствительны к
  именам: .spoc-tab и .spoc-tabs различаются regex-ом `sel[ \t]*\{` —
  оба правила писать, каждое своим селектором).
* Палитра — только существующие цвета (§2.6); rgba(216,194,122,*) не
  вводить.
* svg-таблица — забыть строку = красный обход; иконки школ НЕ в
  spell-icons (пин 167 W-05) и НЕ в ui (пин 12).
* e2e-файл spellbook-oc-e2e.test.js НЕ доращивать (параллельные задачи
  000235.08.01/000235.12.02 могут его трогать — merge-конфликт).
* Ребаз перед мержем: на момент финализации (2026-11-03) tip
  master = 3c15913 — 9 коммитов впереди базы 9ef5821 (0312ad4/
  2259085/710dcfd/9852ba4/861d057/5c0b88a/52a9041/b4d9a65 000235.08.
  01/3c15913 000292). Ожидаемый конфликт — CHANGELOG.md (master
  расширил ## 2026-11-02 «Игровой процесс» до 5 буллетов + подсекция
  «Графика» 4 буллета; наша «Интерфейс» вставлена после буллета
  «Свет обители» — резолв: «Интерфейс» поставить ПОСЛЕ «Графика»).
  index.html: чужой ханк только :160 (000308) — далеко от :1206+,
  чисто. svg.test.js: 000293 'building-icons': 26 (:452) vs наш
  'school-icons': 6 (:509) — за пределами контекста, авто-склейка +
  перепроверить ОБЕ строки. tests/spellbook-oc-e2e.test.js master
  модифицировал (861d057) — у нас нулевой diff, конфликта нет.
  spellbook-oc.js / index-order / tasks/pending/000301.md — чужие
  коммиты НЕ трогают. После ребейза — полный прогон в worktree
  заново (счётчики пересчитать: база сьюта выросла).
* НЕ «помогать» боевой книге (combat-ui.js) вкладками — вне скоупа; в этом
  файле параллельные 000291/000227.01.
* Один коммит задачи (прецеденты 000290/000235.07.01 + CLAUDE.md «один
  коммит, содержащий все изменения»): код+тесты+ассеты+memory+CHANGELOG+
  перенос задачи+отчёт — всё в ОДНОМ коммите (станционный текст «отдельный
  коммит CHANGELOG» overridden репозиториевой практикой).

## 7. Открытые вопросы / follow-up-кандидаты

1. Боевая книга (combat-ui.js, Q/R в бою) — тоже получить вкладки?
   Решение этой задачи — только книга вне боя (§2.1). Если drons имел в
   виду боевую — отдельная follow-up (больший скоуп: 4 зоны, pointer-
   events, sig; карта — a1 §4).
2. Персистентность выбранной вкладки (между close/резогрузкой) — НЕ
   персистим (дефолт «все», сейв v1 не трогаем; ТЗ не требует).
   Мелкая follow-up при запросе.

## 8. Ревью-правки (2026-11-03)

Три ревьюера — findings: 1 major + 1 minor. Оба РЕАЛЬНЫ; major —
исправлен + regression-тест, minor — добавлен пин (по усмотрению,
выбрано добавить: уровень собственного прецедента W-05).

* MAJOR — `refreshTabs()`: guard `!Array.isArray(tabsEl.children)` —
  в реальном браузере `element.children` = HTMLCollection (НЕ Array)
  → `Array.isArray` === false → refreshTabs() ВСЕГДА выходил на guard
  в production: класс `.spoc-tab--active` НИКОГДА не применялся
  (клик фильтровал список — render() не зависит от children — НО
  активной вкладки не подсвечивалась: состояние «фильтр активен»
  визуально неотличимо от «все» — нарушение §2.2 «active-класс =
  видимый маркер выбора»). Тесты T1-T4 зелёные ТОЛЬКО из-за
  расхождения стаб/production: makeEl (tests/spellbook-oc-
  tabs.test.js + tests/spellbook-oc-e2e.test.js) держит children
  обычным Array. ДОКАЗАНО: репро
  в node-sandbox с двумя DOM-вариантами (Array: класс ставится;
  HTMLCollection-подобный: не ставится). ФИКС: guard
  `const kids = tabsEl ? tabsEl.children : null;
  if (!kids || typeof kids.length !== "number") return;` + индексная
  итерация (совместимо и с HTMLCollection, и с Array — все vm-стабы).
  REGRESSION: T6 (tests/spellbook-oc-tabs.test.js) — harness-вариант,
  где .spoc-tabs.children — НЕ Array (объект с length/индекс/
  итератором, как HTMLCollection), assert после click на «spoc-tab
  spoc-tab--active» + toggle off → стаб больше не маскирует.
* MINOR — uniqueness-пин для 6 школьных иконок: проект-конвенция
  W-05 (tests/svg.test.js) пинит sha256-парную уникальность ВСЕХ
  167 spell-icons, но для assets/school-icons/ пин только на счёт
  ('school-icons': 6) + well-formedness/схему — копия одной иконки
  в чужой файл не поймаема. ТЗ уникальность явно не требует, d-
  атрибуты различны — но покрытие было ниже уровня собственного
  прецедента. ФИКС: тест W-05.000301 (sha256-парная уникальность 6
  school-icons, одна строка цикла поверх существующей инфраструктуры).
  (Ревьюер допускал follow-up-задачу; выбрано до-мержа — тест-only,
  не блокирует, уровень W-05.)

Полный сьют после правок: 3467/3467 pass, 0 fail (база 3465 + T6 +
W-05.000301).

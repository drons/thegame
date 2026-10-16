# 000231 — Страница персонажей: не показывать неизученные заклинания

Статус: ВЫПОЛНЕНО (Finalize 2026-10-16): 2611/2611 зелёных, отчёт
tasks/result/000231.md, задача в tasks/done. Ребейз на свежий
master — на стадии мержа (единственный конфликт-кандидат —
CHANGELOG.md, §2 D13/§8.7).
Станция: ПРОЕКТИРОВАНИЕ (финальная архитектура и контракты).
ТЗ: `tasks/pending/000231.md` (одна строка: «На странице персонажей не
показывать неизученные заклинания» — без разделов, решения фиксированы
в этом файле). Анализы: a1-domain / a2-arch / a3-tests
(/tmp/thegame-wf-000231/).
Контракты-родители: memory/000145-active-character.md, memory/000146-
efir-tab-removal.md, memory/000147-unified-spell-learning.md (§3.6/D7/§9 —
частично SUPERSEDED, см. §5).

## §1 Что добавлено / перенесено / удалено

* **Удалено (UI-часть 000147)**: avail-блок «Доступно к изучению:»
  секции «Книга заклинаний» на странице «Персонаж» — функции
  `availSources` + `renderAvailBook` (src/ui-tab-skills.js,
  модуль-внутренние, в exports НЕТ — публичного API не было),
  вызов в renderBook, коммент-контракт 000147; мёртвый CSS
  `.cp-availrow`/`.cp-availrow .cp-itemname`/`.cp-avail-title`
  (index.html L112-117: 3 строки коммента + 3 правила).
* **Удалено (UI-часть 000145/146)**: строки НЕИЗУЧЕННЫХ канонических
  заклинаний Эфира с меткой «откроется на N-м уровне» (renderBook,
  efir-ветка) — каноника теперь фильтруется по learned.
* **Добавлено**: learned-фильтр в efir-ветке renderBook (1 guard),
  плейсхолдер «—» при нуле строк (паттерн renderLearnedBook), новый
  RED-файл tests/unlearned-spells-hidden.test.js (U-1..U-3), 4
  осознанных ре-пина (B6/R3/AP-6/AP-6B — §6).
* **Перенесено**: ничего; механика изучения, боевая книга, тултипы,
  формат сейва — НЕ ТРОГАЮТСЯ (§4).

## §2 Решения (D1-D13)

* **D1. Скоуп = ОБА источника неизученных на странице: (a) avail-блок
  000147 + (b) неизученные канонические строки Эфира «откроется на
  N-м уровне» (000145/146).** Почему: ТЗ буквально запрещает
  показывать неизученные — при удалении только (a) у fresh-Эфира в
  книге остаётся 9 из 11 строк неизученными (нарушение ТЗ);
  spec/spells.md «Книга заклинаний» = «Известные персонажу
  заклинания» — 000231 возвращает страницу в рамки SPEC (доводка, не
  откат механики); a1-domain и a2-arch независимо пришли к (a)+(b)
  (a3-tests рекомендовал (a), но явно передал решение Проектированию
  — §6 a3).
* **D2. Метка «уровень N» У СОХРАНЁННЫХ (learned) канонических строк
  Эфира остаётся.** Почему: это метапро данные ИЗУЧЕННОГО (когда
  авто-разблокировалось), не показ неизученного. fresh-Эфир L1 —
  2 строки («Искра»/«Заговора», «уровень 1»); live L5 — 3 строки
  («Свет исцеления» = «уровень 5»). DOM-форма строки не меняется
  (cp-itemrow > cp-itemname + cp-itemmeta).
* **D3. Ноль строк после фильтра → строка-плейсхолдер «—»** (паттерн
  renderLearnedBook L220-224). Почему: консистентная деградация с
  hero/merc-ветками; в игре недостижимо (createEfir/restore всегда
  ⊇ EFIR_SPELL_START), но пустая секция без строки — артефакт.
  Проверка — `book.children.length === 0` (работает и в DOM-стабе,
  и в браузере).
* **D4. Удаление avail-функций ПОЛНОЕ + обновление ВСЕХ устаревших
  комментариев.** renderAvailBook + availSources + коммент-блок
  L312-335 — удалить; вызов L309 — удалить; `let canon = null`
  (L254) — убить, `canon` становится локальным const внутри
  efir-ветки (после удаления renderAvailBook единственный
  потребитель — цикл learned-не-каноников). Обновить: документация
  renderBook (L234-248: убрать «откроется…», «avail-блок»),
  комментарий learned-не-каноника (L286-293: убрать «avail-блок
  learned-строки пропускает (renderAvailBook)»), комментарий
  «раннего return НЕТ» (L301-302 — мёртв).
* **D5. index.html — ТОЛЬКО удаление CSS-блока L112-117** (мёртвый
  после D1). Почему: тестов, пинящих наличие этих правил, НЕТ
  (build-menu-layout.test.js упоминает .cp-availrow только в
  КОММЕНТЕ-якоре L9 — не-семантическое обновление); других правок
  НЕТ → пины tests/index-order.test.js не трогать.
* **D6. Новый RED-файл: tests/unlearned-spells-hidden.test.js.**
  Почему: имя по ТЗ-глаголу (hidden unlearned); a3-альтернатива
  character-unlearned-spells.test.js отклонена (длиннее, тот же
  смысл). Механика — дубль лоадера/хелперов/makePartyEnv из
  tests/spells-any-party.test.js (opts-версия: heroScroll —
  источник свитка в инвентаре героя; у наёмного Рунопись 1 —
  максимально провокационный кейс «руна: доступно»).
* **D7. RED-план = СТРОГО 3 vm-теста U-1/U-2/U-3 (expectedRedCount=3).**
  Почему: соответствие redPlan a3 (workflow верифицирует счёт);
  опциональный U-4 (статический source-пин «литерала нет») НЕ в
  файле — анти-возвратный guard покрывается негативными ассертами
  U-1..U-3 (`.cp-availrow` = 0, `.cp-avail-title` = 0, текста
  «Доступно к изучению» в pane НЕТ) + ре-пиннутым AP-6 (0 avail
  на всех kinds).
* **D8. Ре-пины — только 4 теста: B6, R3, AP-6, AP-6B (§6).**
  Почему: grep-перескрётом подтверждено, что это ЕДИНСТВЕННЫЕ
  фиксаторы, пинящие убираемое повед (`.cp-availrow`/«Доступно к
  изучению» → spells-any-party + коммент build-menu-layout;
  «откроется на» → ui-tab-skills-active + ui-tabs-efir-removed).
  Это ОСОЗНАННОЕ отклонение от инварианта «семантических правок
  существующих тестов нет» — исключение «если ТЗ не предписывает
  иное» (ТЗ снимает зафиксированное 000147-D7/000145-поведение).
  Дисциплина: менять ТОЛЬКО book-ассерты, остальное в каждом тесте
  побайтово; коммент «Ре-пин 000231: неизученные скрыты» на каждом;
  список — в result + этот файл. Data-пин порогов UNLOCKS
  [5,8,10,12,15,20,22,25,30] в R3 СОХРАНИТЬ (пин данных G.efir,
  не UI).
* **D9. Механика изучения — НОЛЬ правок**: src/spells.js
  (canLearn/learn), src/learn-target.js, src/items.js (useItem-4-й-
  арг), src/building-effects.js (applyRuneSpell), src/building-
  effect-runes.js, src/building-effect-mentor.js, src/efir.js
  (EFIR_SPELL_UNLOCKS/efirSpellsByLevel — data-источник книги),
  src/party.js, формат сейва (sheet.spells уже персистируется),
  RNG, детерминизм. Почему: ТЗ — display-фильтрация страницы;
  обучаемость не ломается (свиток [I], руна [E], наставник [E],
  flash-сообщения — intact).
* **D10. Out of scope (осознанно)**: тултипы свитков «Эффект:
  изучает «Имя»» — вкладка «Инвентарь» (ui.js itemTipText, 000133,
  S-пины items.test.js) — описание ПРЕДМЕТА, другая вкладка;
  боевая книга (src/spellbook.js/combat-ui.js, KeyQ, 000149 —
  entriesFor уже только sheet.spells; 000227 параллельно правит
  combat-ui — не трогать); панель «Отряд» (другая вкладка).
* **D11. UMD/загрузочные инварианты**: новых модулей/`<script>`/
  CSS-классов НЕТ (только УДАЛЕНИЕ); правка — внутри тела factory
  src/ui-tab-skills.js, при загрузке ничего не добавляется; снапшот
  G один (000038) + ленивые ссылки (rootRef) — паттерн не меняется;
  литерал 'saveNow' НЕ вводить (сканнер ui-panel.test.js readdir
  src/ui-tab-*.js); деградация efir-ветки — тихий fallback на
  renderLearnedBook (как сейчас; НОВОГО console.error НЕ вводить).
* **D12. CHANGELOG.md**: под существующим «## 2026-10-16» — НОВЫЙ
  подраздел «### Интерфейс» (сегодня у даты только «Игровой
  процесс»), буллет для игрока: книга на странице персонажей —
  только выученные; список «Доступно к изучению» и пометки
  «откроется на N-м уровне» убраны; у Эфира — уровень
  авто-разблокировки у выученных; само изучение — без изменений.
  Отдельный коммит «Задача 000231: CHANGELOG — …», дата = день
  мержа. Почему: задача меняет игровой UI (инвариант workflow).
* **D13. Мерж**: файлового пересечения с 5 параллельными задачами
  (000221/223/227/228/233) НЕТ (diff --name-only по worktrees: ни
  один не трогает src/ui-tab-skills.js, tests/ui-tab-skills-
  active, tests/ui-tabs-efir-removed, tests/spells-any-party,
  CSS-регион index.html) — общее только CHANGELOG.md (механический
  union). РЕБЕЙЗ на свежий master ПЕРЕД мержЕМ ОБЯЗАТЕЛЕН
  (master двигался с базы 96c06dc). Никаких push в remote.

## §3 Контракты и границы (книга после 000231)

* Носители стабильны (000146 §8, НЕ ТРОГАТЬ): секция
  «Книга заклинаний» (div.cp-section > div.cp-items → ctx.panel.
  _book, rebuild in place: `book.textContent = ''`),
  `_breath`/`_breathSec`, имена секций, read-only (кнопок у строк
  НЕТ).
* **hero/merc** — renderLearnedBook БЕЗ ИЗМЕНЕНИЙ: по c.spells,
  имена из G.SpellsData.SPELLS_BY_ID.название, меток НЕТ; пусто →
  1 строка «—».
* **efir** — learned-фильтр: порядок каноники — старт
  (efirSpellsByLevel(1)) сперва, затем UNLOCKS в порядке массива
  (каноническое возрастание порогов), строка — ТОЛЬКО если
  id ∈ c.spells, метка «уровень N» (N = 1 для старта / порог
  UNLOCKS); ПОСЛЕ каноники — learned НЕ-канонические (id ∈
  c.spells, не в canon) — метка «изучено» (контракт AP-6B:
  выученное через свиток/руну/наставника ВИДИМО); 0 строк → «—».
  Деградация (G.efir/efirSpellsByLevel/EFIR_SPELL_UNLOCKS
  отсутствуют) — renderLearnedBook (тихо).
* **Невидимо на странице (000231)**: всё неизученное — avail-строки
  (.cp-availrow/.cp-avail-title больше НЕ СУЩЕСТВУЮТ) и
  «откроется на N-м уровне».
* **Видимо (intact)**: learned-строки всех kinds, «Вдох Эфира»
  (только для active «Эфир»), «уровень N»/«изучено»-метки,
  портреты/статы/таблицы навыков/raiseSkill.
* Контент-граница SPEC: spec/spells.md — книга = «Известные
  персонажу заклинания: список id из каталога assets/spells» —
  страница после 000231 в рамках SPEC.

## §4 Ленивые ссылки и guards

* НОВЫХ ленивых ссылок/guards НЕТ: правка внутри существующего
  модуля; снапшот G0 один раз (000038), все G.* — при вызове;
  rootRef (partySource/squadLive) — не меняется.
* Доступные в efir-ветке провайдеры — только G.efir
  (efirSpellsByLevel, EFIR_SPELL_UNLOCKS) + G.SpellsData
  (spellName) — те же, что ДО; чтения из G.ITEMS/G.BUILDINGS/
  G.Spells (были в availSources) — УБРАНЫ вместе с функциями.
* Guards: existing partyErrorShown/portraitsErrorShown/
  sheetErrorShown — не трогать; НОВЫХ console.error НЕТ (D11).
* Cross-realm (правило 000082) для новых/ре-пиннутых пинов:
  примитивы/текст/длины; массивы vm — [...arr].

## §5 Что важно будущим задачам

* **Контракт 000147 §9 «UI-паттерн avail-строк … будущие
  «доступно»-списки — этот класс» — SUPERSEDED** (и §3.6/D7 в части
  UI): паттерн .cp-availrow/.cp-avail-title УБРАН со страницы
  персонажей вместе с CSS. Будущий «доступно»-список (или другой
  способ показать «что можно выучить») — НОВОЕ проектирование/
  новая задача; механика источников 000147 (canLearn/learn,
  каталоги 40/42, 17/18/19/21/38, learn-target) ЦЕЛА — можно
  переиспользовать.
* Механизмы 000147 (D1-D8, D10-12) — без изменений;
  memory/000147-unified-spell-learning.md действует полностью,
  кроме UI-пункта D7/§3.6/§9 (см. выше).
* «Изучено» = sheet.spells (источник правды) — hero/merc/efir
  единообразно; Эфир-книга data-driven (efirSpellsByLevel(1) +
  EFIR_SPELL_UNLOCKS — хардкода 2/11 НЕТ; после 000163 — 11
  канонических; будущие unlock'и паттерном 000163 [N, id] —
  автоматически появляются в книге при learned).
* Data-пин порогов UNLOCKS [5,8,10,12,15,20,22,25,30] живёт в R3
  (ui-tabs-efir-removed) — пин ДАННЫХ G.efir, не UI; ре-пины UI
  строк его не трогают.
* tests/spells-any-party.test.js — остаётся базой семейства
  «изучение партией» (000147 §9); AP-6/AP-6B после ре-пина пинят
  learned-only контракт страницы (негатив avail) — новые
  «доступно»-поверхности тестировать ДОБАВЛЕНИЕМ, не переписывая.
* learn() дублей не создаёт (canLearn «уже изучено») — learned-
  строка «изучено» для не-каноника ЕДИНСТВЕННА.

## §6 Карта тестов

* **НОВЫЙ RED-файл tests/unlearned-spells-hidden.test.js**
  (D6/D7; паттерн — дубль ЧАСТИ B tests/spells-any-party.test.js:
  makeEl/findAll/matchesSel, loadEnv с ДИНАМИЧЕСКИМ CHAIN до ui.js,
  makePartyEnv(opts) с `__game.state`-инжекцией ДО openPanel):
  * **U-1** (hero, makePartyEnv({heroScroll:'fireball_scroll'}),
    дефолтный активный): ровно 2 .cp-itemrow («Искра»/«Заговора»,
    имена из G.SpellsData, .cp-itemmeta нет, button === null);
    .cp-availrow = 0; .cp-avail-title = 0; текста «Доступно к
    изучению» в pane нет. RED сейчас: avail-строки эмитятся
    («Огненный шар» — «свиток: нужен ранг школы «Знаток»» и т.п.).
  * **U-2** (merc_volk, toggle('character','merc_volk'), env {} —
    Рунопись 1, spells []): ровно 1 .cp-itemrow «—»; .cp-availrow
    = 0; заголовка нет; «Хлад» в секции НЕТ (руна 40 — источник
    в каталоге всегда). RED сейчас: avail-строки на наёмном
    («Хлад» — «руна: доступно», «Огненный шар» — свиток).
  * **U-3** (efir, toggle('character','efir')): до — .cp-itemrow =
    G.efir.efirSpellsByLevel(1).length (2, data-driven), ВСЕ метки
    «уровень 1»; текста «откроется» в секции НЕТ; «Теневой сгусток»
    в секции НЕТ; .cp-availrow = 0. Затем G.Spells.learn
    (efirSheet,'chill','scroll') (t1, INT 3 — Ученик — ok) +
    re-render (toggle): .cp-itemrow = 3; «Хлад» — .cp-itemrow с
    меткой «изучено» ПОСЛЕ каноники, button === null; «откроется»
    всё ещё нет; «Теневой сгусток» всё ещё нет; .cp-availrow = 0.
    RED сейчас: 11 канон. строк + avail.
  * expectedRedCount = 3. Падение — по наличию/счёту/тексту
    (assertion), не SyntaxError (ошибок при загрузке цепочки — 0
    первым ассертом каждого теста).
* **Ре-пины (D8; каждый — с комментом «Ре-пин 000231: …»):**
  1. tests/ui-tab-skills-active.test.js **B6** (L693-743): 11 →
     **2** строки; expect = [['Искра','уровень 1'],['Заговора',
     'уровень 1']]; + негатив: секция НЕ содержит «откроется»;
     заголовок теста обновить. (2)-часть efirMet=false (2 иконки)
     — intact. B7 — intact (счёт по .cp-itemrow; avail был другим
     классом).
  2. tests/ui-tabs-efir-removed.test.js **R3**: L1 — 11 → **2**
     (expect = только старт, «уровень 1»); live L5 — 11 → **3**
     (rows5.length; «Свет исцеления» = «уровень 5» — intact);
     data-пин UNLOCKS [5,8,10,12,15,20,22,25,30] — СОХРАНИТЬ;
     hero-часть (2 строки без .cp-itemmeta), дедупликация паней,
     breath, «Открытия»-отсутствие, D2/D3-части — intact.
  3. tests/spells-any-party.test.js **AP-6**: (1) наёмный —
     learned 1 «—» intact + НЕГАТИВ: .cp-availrow = 0,
     .cp-avail-title = 0 (ассерты «Огненный шар»/«Хлад» avail —
     удалить); (2) Эфир — rows2 = efirSpellsByLevel(1).length
     (fresh-Эфир: learned-only; было efirSpellsByLevel(100).
     length), «Теневой сгусток» — негатив (не в .cp-itemrow,
     avail = 0). Заголовок теста + хедр-комменты файла (L16-18,
     L54-57) — обновить (avail-упоминания).
  4. tests/spells-any-party.test.js **AP-6B**: (1) до изучения —
     «Хлад» НЕ ВИДИМ НИГДЕ (rows0 = efirSpellsByLevel(1).length,
     нет ни learned-, ни avail-строки); (2) learn — intact;
     (3) после — 3 строки (2 + «Хлад» «изучено» — intact);
     (4) → негатив .cp-availrow = 0 (дубля нет — тривиально);
     (5) «Искра» «уровень 1» — intact. Заголовок — обновить.
* **НЕ ТРОГАТЬ**: AP-1..AP-5, AP-7, AP-M1..M4 (механика), B7,
  Б1-Б5/Б8/Б9, R1/R2/R4-R5, ui-skills, ui-panel, squad-panel/
  npc-hire-*, spellbook/combat-*, efir-тесты (модель), save*,
  companions*, items S-пины, index-order.
* tests/build-menu-layout.test.js — ТОЛЬКО хедр-коммент L9
  (якорь «ДО блока 000147 (.cp-availrow)» — блок удалён →
  «ПОСЛЕ .cp-itemrow .cp-btn»): не-семантическая правка, assert-ы
  (cssRule по селекторам 000202) — зелёные без правок.

## §7 Состав диффа (по файлам)

* src/ui-tab-skills.js — ЕДИНСТВЕННЫЙ функциональный файл: −вызов
  renderAvailBook (L309), −availSources (L336-371) −renderAvailBook
  (L373-402) −коммент-блок (L312-335) −«раннего return НЕТ» (L301-
  302), `let canon = null` → локальный const; +learned-guard в
  цикле каноники, +«—»-fallback; переписаны комменты renderBook
  (L234-248) и learned-не-каноника (L286-293). Нетто ≈ −85 строк.
* index.html — −6 строк (CSS-блок L112-117).
* tests/unlearned-spells-hidden.test.js — НОВЫЙ ≈ +300 строк
  (лоадер/хелперы-дубль + U-1..U-3).
* tests/ui-tab-skills-active.test.js — B6 ≈ ±20.
* tests/ui-tabs-efir-removed.test.js — R3 ≈ ±15.
* tests/spells-any-party.test.js — AP-6/AP-6B + комменты ≈ ±45.
* tests/build-menu-layout.test.js — коммент-якорь ≈ ±1.
* memory/000231-hidden-unlearned-spells.md — НОВЫЙ (этот файл;
  коммит на красной стадии вместе с тестами).
* CHANGELOG.md — «### Интерфейс» под «## 2026-10-16» ≈ +8
  (ОТДЕЛЬНЫЙ коммит, день мержа).
* tasks/pending/000231.md → tasks/done/000231.md + отчёт
  tasks/result/000231.md (финальная стадия).

## §8 Подводные камни

1. Пин «11 строк Эфира» — в ТРЁХ местах (B6, R3, AP-6B) —
   ре-пинять ВСЁ; пропуск одного = красный сьют.
2. Текст «откроется на» / «Доступно к изучению» / .cp-availrow —
   grep-список (сверено с кодом 96c06dc): src/ui-tab-skills.js,
   index.html (CSS), tests/ui-tab-skills-active.test.js,
   tests/ui-tabs-efir-removed.test.js, tests/spells-any-party.
   test.js, tests/build-menu-layout.test.js (коммент только).
   Перескрестить grep'ом ДО коммита (master мог сдвинуться).
3. Эфир-деградация — тихий fallback (console.error НЕ вводить).
4. Rebuild in place + имена _book/_breath/_breathSec — стабильный
   контракт 000146 §8 — не ломать; `book.children.length === 0` —
   корректно и в DOM-стабе (children — массив), и в браузере
   (HTMLCollection).
5. saveNow-сканнер (ui-panel.test.js readdir src/ui-tab-*.js) —
   литерал не вводить (правка — чистое удаление, риска нет).
6. F-лейк: tests/map.test.js:1943 (тайминг 160k tileAt, бюджет
   5000 мс) — базовый прогон: 2607 тестов, 2606 pass, 1 fail =
   именно он (под нагрузкой); перепуск файлом — 74/74. Политика:
   перепуск + запись в tasks/result, НЕ регрессия 000231.
7. Ребейз на свежий master ПЕРЕД мержЕМ (D13); CHANGELOG —
   union-конфликт с 5 параллельными — разбирать по буллетам.
8. a3-U-3 в исходной формулировке (scope (a)) — «100-level»-
   каноника INTACT — НЕПРИМЕНИМ к принятому D1: GREEN-ожидаемое
   U-3 = learned-only (efirSpellsByLevel(1).length) — §6.

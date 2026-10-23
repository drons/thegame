# 000246: Экран боя — кнопки управления в самый низ правой панели;
# info о выделенном существе + лог боя — всё оставшееся пространство

Статус: ВЫПОЛНЕНО (станция финализации, 2026-10-23): свежий
полный npm test в worktree 3062/3062/0 (база bce455e: 3058/3058),
ревью пройдено (ce8b185), отчёт tasks/result/000246.md, задача
перенесена в done; мерж — на стадии мержа (master ушёл от базы
на +4 коммита: 000240/000241 tests-only, ретро, 000250-000253 —
пересечений с файлами задачи нет).
Статус: ПРОЕКТИРОВАНИЕ завершено (станция «Проектирование», 2026-10-22).
Файл коммитится на красной стадии вместе с красными тестами; ветка
task/000246, worktree .worktrees/task-000246, база master bce455e.
ТЗ — tasks/pending/000246.md (запрос пользователя 2026-10-22, P2).
Анализы: /tmp/thegame-wf-000246/{a1-domain.md, a2-arch.md, a3-tests.md}.

## Задача и цель

Три зоны правой панели боя (.combat-side, боевой скоуп
.combat-overlay--combat):
* ВЕРХ — state-блок: .combat-turnorder (000036) + .combat-hpbar
  (000038) + .combat-mpbar (линейка маны, 000199 — Позиция НЕ
  меняется, ТЗ п.2) + .combat-state (выделенное существо, 000118/000199);
* СЕРЕДИНА — .combat-log: ВСЁ оставшееся пространство между линейкой
  маны и кнопками (flex-grow, внутренний скролл);
* НИЗ — .combat-actions (фиксированный grid-блок, в самый низ,
  не растягивается).
НОЛЬ изменений поведения: диспетчер действий, кнопки, книга, лог —
бит-в-бит; детерминизм/сейвы/RNG/combat.js не трогать.

## Что добавлено / перенесено

Перенесено (src/combat-ui.js, build()): ДВЕ строки appendChild —
`side.appendChild(actions)` (L521) и `side.appendChild(quickBox)`
(L532) — переезжают в КОНЕЦ сборки панели, после
`side.appendChild(logEl)` (L542). Создание элементов и наполнение
кнопок (L363–520) — на тех же местах. render()/диспетчер (~L820+) —
НИЧЕГО.

Итоговый DOM-порядок детей .combat-side (7 элементов):
  [turnorder, hpbar, mpbar, state, log, quicklist, actions]
(было: [turnorder, hpbar, mpbar, state, actions, quicklist, log]).

РЕШЕНИЕ ПО .combat-quicklist (000194; ТЗ молчит — зафиксировано
здесь): МЕЖДУ .combat-log и .combat-actions (лог → quicklist →
кнопки). Почему:
* контракт 000194 «контейнер строк — МЕЖДУ .combat-actions и
  .combat-log» сохраняется ВЕРБАТИМ (quicklist по-прежнему между
  ними, изменилась только сторона — лог теперь сверху);
* кодовый комментарий combat-ui.js L523–525 остаётся истинным
  БЕЗ правки (правило CLAUDE.md: код и комментарий не
  расходятся);
* UX: пикер предметов (KeyE) появляется ПРЯМО НАД рядом кнопок,
  которым он подкармливается (quickItem/invItem/Каст);
* открытым (max-height 40% панели, flex: 0 1 auto) список сжимает
  лог (flex-grow), кнопки остаются на дне — ровно по ТЗ-зонам.

CSS index.html — НОЛЬ diff правил. Все нужные свойства УЖЕ в
боевом скоупе (см. «Контракты и границы»). Единственная правка
index.html — ТЕКСТ комментария 000124-блока (L390–403): «лог —
flex: 1 (всё оставшееся место ПОД кнопками)» → «…МЕЖДУ state и
кнопками» (фраза «под кнопками» после фикса ложна; правила
не меняются, CSS-парсеры тестов комментарии не читают).

Тесты: НОВАЯ самостоятельная секция в tests/ui.test.js (ТЗ
назначает этот файл) — своя боевая vm-песочница + 3 пина (2
красных + 1 гард, детали — «Красные пины и ре-пины»); 4
ТЕХНИЧЕСКИХ ре-пина существующих порядка-пина (ТЗ сам меняет
layout; поведенческие ассерты бит-в-бит).

memory: правка memory/000124-combat-layout.md §«Состав боевого
оверлея (build())» — там порядок устарел ещё ДО этой задачи
(нет mpbar/quicklist) — новый порядок + ссылка на 000246
(коммитится на красной стадии с этим файлом).

CHANGELOG.md — отдельный коммит «Задача 000246: CHANGELOG — …»
(задача меняет управление/раскладку для игрока): `### Управление`
— «Экран боя: раскладка правой панели…» (программная часть не
перечисляется). Дата секции = дата мержа: `## 2026-10-23`
(ревью 2026-10-23: блок перенесён из `## 2026-10-22` в новую
секцию `## 2026-10-23` над ней — CLAUDE.md «упоминание по дате
мержа»; все коммиты задачи датированы 2026-10-23).

## Контракты и границы

* DOM .combat-side — 7 детей в порядке выше; книга
  (.combat-spellbook) и flee-подтверждение/баннер/лута-лента —
  НЕ в side, а в .combat-box (absolute поверх canvas, 000196/
  000210/000237) — их порядок от reorder НЕ зависит (пин
  CU196-POS: box = [canvas, spellbook, flee, banner] — не
  трогать).
* Layout даёт ТОЛЬКО существующие правила скоупа
  .combat-overlay--combat (index.html):
  * .combat-side — flex-колонка, min-height 0, width 256px
    (L424–430);
  * .combat-log — `flex: 1 1 auto; min-height: 0; height: auto`
    (L432–436) — это и есть «flex-grow на всё оставшееся
    место»; ШОРТКАТ ОБЯЗАТЕЛЕН — пин combat-layout.test.js
    L81–85 читает decls['flex'];
  * .combat-quicklist — flex: 0 1 auto, min-height 0,
    max-height 40% (L963–970) — позиционно-независимые правила,
    новым слотом не затрагиваются;
  * .combat-actions — база (L344–349): grid repeat(4, 1fr),
    gap 6px, margin-bottom 10px; в flex-колонке flex-grow по
    умолчанию 0 → «фиксированный блок, не растягивается» (ТЗ
    п.1) — явный flex: 0 0 auto НЕ добавляем.
* margin-bottom 10px базового .combat-actions ПОД кнопками
  (последний ребёнок, до padding панели 12px) — РАЗРЕШЕНО
  скоуп-правилем `.combat-overlay--combat .combat-actions {
  margin-bottom: 0 }` (ревью 2026-10-23: ТЗ — «кнопки в САМЫЙ
  НИЗ»; без правки — 22px пустоты до низа (10 + padding 12) при
  12px прочих краях). База .combat-actions НЕ тронута (контракт
  000124) — обнуление ТОЛЬКО в боевом скоупе; пин —
  tests/combat-layout.test.js (секция 000246: margin-bottom 0 в
  скоупе + стража base 10px).
* ГРАНИЦА БАЗЫ (контракт 000124, не нарушать): базовые
  .combat-side (320px), .combat-log (170px + border-top),
  .dungeon-overlay .combat-side (270px absolute) — ОБЩИЕ с
  подземельем/постройкой/NPC-диалогом — НЕ ТРОГАТЬ; стражи —
  combat-layout.test.js L52–78, build-menu-layout, craft-layout
  (L189: скоуп-ширина 256px). .combat-actions — боевой класс
  (единственный потребитель combat-ui.js, grep'ом; контракт
  000124 разрешает правку в базе) — ЭТОЙ задачей не правится.
* Город/подземелье (000229, задача 000247) — НЕ ТРОГАТЬ: свой
  build-путь (src/dungeon-ui.js), класс .combat-overlay--combat
  не несётся → бит-в-байт (стражи dungeon-side-panel RW-*).
* Поведение БИТ-В-БИТ: диспетчер (runAction ~L820, keydown),
  состав/порядок КНОПОК внутри .combat-actions (CU182-ORDER,
  включая «Последнее заклинание» 000227 — 8-я условная клетка;
  ТЗ-список кнопок устарел), aria-label/dataset.act, бейджи
  .combat-actcount (000199), гейты Каст/Лечение (000178)/
  Воскрешение (000171), enabled/:disabled, алиасы клавиш
  (combat-keys.js), книга (000149/000196), лог c.log.slice(-9),
  canDoAction, клик по клеткам.
* Мана: .combat-mpbar — 3-й элемент (turnorder, hpbar, mpbar, …)
  — позиция НЕ меняется (ТЗ п.2; memory/000199-combat-
  {hud-compact,info-block}.md — «третий элемент» остаётся
  правдой — правок НЕ требуются).
* Новых JS-модулей / <script>-тегов / CSS-классов / SVG-ассетов
  НЕТ (ТЗ: «Новые CSS-классы НЕ нужны»). main.js, combat.js,
  сейвы, детерминизм, RNG — без изменений → пины
  index-order.test.js не нужны.

## Красные пины и ре-пины

Красные (НОВЫЕ, tests/ui.test.js, самостоятельная секция в КОНЦЕ
файла; главный CHAIN ui.test.js — до ui.js — и 14 его тестов НЕ
трогаются):
* 000246-ACT-LAST (КРАСНЫЙ на master): последний ребёнок
  .combat-side — .combat-actions (+ фикстура: 7 детей).
  Краснота осмысленная: сейчас lastChild = .combat-log,
  actions — 5-й из 7 (build() L521).
* 000246-LOG-FLEX (КРАСНЫЙ по DOM-части; CSS-часть — зелёный
  гард): (a) DOM: idx(.combat-log) < idx(.combat-actions)
  (сейчас ложь: log 6 > actions 4); (b) CSS-статика (паттерн
  cssRule combat-layout.test.js): правило
  `.combat-overlay--combat .combat-log` декларирует рост —
  flex-шорткат начинается с 1 ИЛИ явный flex-grow ≥ 1 (робаст к
  шорткату/лонгхэнду; на master — зелёный страж, не даёт
  потерять рост при будущих правках).
* 000246-TOP-4 (гард, зелёный с master): первые 4 элемента
  .combat-side = [combat-turnorder, combat-hpbar, combat-mpbar,
  combat-state] (мана остаётся 3-й — инвариант ТЗ п.2).
Полный порядок всех 7 детей пинят ре-пинами deepEqual (ниже) —
в ui.test.js его НЕ дублируем (один факт — один пин).

Сандбокс новой секции: vm-песочница + ДИНАМИЧЕСКИЙ CHAIN = ВСЕ
<script src> index.html ДО combat-ui.js включительно
(`all.slice(0, all.indexOf('combat-ui.js') + 1)`) — идиома
самого ui.test.js (динамический CHAIN — «подхватит любой новый
тег сам»); прецеденты, что префикс грузится чисто:
combat-inventory-panel.test.js (CHAIN_195 — до ui.js +
combat-ui.js), dungeon-info-window.test.js (ПОЛНАЯ цепочка
включая main.js). Проверено: модули диапазона ui.js..combat-
ui.js (building-ui, building-effect-*, hud, craft-ui,
visuals-data, sprites, combat-scale) load-time DOM/window/
localStorage НЕ трогают; localStorage в префиксе — только
player/items/building-effects/cities (до ui.js — уже грузятся
существующим CHAIN'ом ui.test.js без storage-стаба). DOM-стаб —
снисходительный (Proxy, неизвестный метод — no-op, дубль
convention dungeon-info-window/city-interact) + canvas с
getContext('2d') → 2d no-op-прокси (build()/render() зовут
canvas.getContext) + getBoundingClientRect lenient ({left:0,
top:0} → 1:1-фолбэк measureBacking/computeBacking).
window.addEventListener — no-op (keydown не нужен),
performance/rAF/devicePixelRatio — не нужны (typeof-гарды
combat-ui.js L154–159, L263–265). Фикстура сцены:
G.createCharacter() + G.combatUI.startCombat({hero,
mobs:['wolf'], mobLevel:1, seed:42}) (паттерн scene84,
combat-ui.test.js L333/L1617); оверлей ищется под document.body
песочницы (findByClass).

expectedRedCount = 2 (ACT-LAST, LOG-FLEX). После фикса: 3058 +
3 новых = 3061 тестов, все зелёные (4 ре-пина зелёные).

ТЕХНИЧЕСКИЕ ре-пины (ТЗ 000246 переносит .combat-actions в
конец — layout сам меняется; именно 4 порядка-пина, полный
grep по tests/ подтверждён):
1. tests/combat-ui.test.js L6752 (CU199-MPBAR-1): deepEqual
   [turnorder, hpbar, mpbar, state, actions, quicklist, log] →
   [turnorder, hpbar, mpbar, state, log, quicklist, actions];
   сообщение — переписать с отсылкой на 000246.
2. tests/combat-ui.test.js L8214 (CU196-POS): тот же deepEqual-
   массив; счётчик «7 элементов» и box-пины НЕ меняются.
3. tests/combat-ui-quicklist.test.js L171–188 (194-QUI-BUILD):
   `iA < iQ && iQ < iL` → `iL < iQ && iQ < iA`; заголовок
   «МЕЖДУ .combat-actions и .combat-log» остаётся ИСТИННЫМ
   (quicklist между ними — лог сверху, кнопки снизу).
4. tests/combat-ui-quicklist.test.js L408–416 (194-QUI-FINISH,
   якорь): `idx(actions)<idx(quicklist)`, `idx(quicklist)<
   idx(log)` → `idx(log)<idx(quicklist)`,
   `idx(quicklist)<idx(actions)` (+ заголовок/сообщения).
НЕ трогаются: CU182-ORDER (порядок КНОПОК), все
enabled/disabled-пины и бейджи, клавиши, книга в .combat-box,
тексты лога, CSS-стражи баз (combat-layout L52–85: база
.combat-side 320px / .combat-log 170px / .dungeon-overlay
.combat-side / 4 колонки / flex:1 шорткат), build-menu-layout,
craft-layout, npc-layout, dungeon-side-panel (RW-4 пинит только
ЧИСЛО .combat-actions/.combat-log в боевом оверлее — порядок
не пинит), combat-scale P1–P7, index-order, ядро/сейвы.

## Ленивые ссылки и guards

* НОВЫХ JS-МОДУЛЕЙ НЕТ → новых <script> НЕТ → UMD-ловушки
  000038/000053 не возникают (combat-ui.js и так снимает G один
  раз при загрузке; build() меняется только порядком append).
  index-order.test.js — 0 правок.
* render()/диспетчер — ТОЛЬКО по ссылкам (stateEl/logEl/
  hpbarFillEl/mpbarFillEl/turnorderEl,
  querySelectorAll('.combat-actions button')) — НИКАКОЙ
  позиции-зависимой логики (проверено grep'ом): порядок детей
  на рендер/диспетчер не влияет — это и есть гарантия
  «бит-в-бит».
* combat-scale.js — ЧИСТАЯ функция computeBacking над rect
  CANVAS (measureBacking → canvas.getBoundingClientRect,
  combat-ui.js L252) — не панели: «кнопки внизу на всех
  размерах» (ТЗ п.3) даёт CSS-колонка скоупа, не JS:
  * десктоп/row — align-items:stretch → панель на всю высоту
    оверлея, лог (flex:1) реально заполняет остаток;
  * portrait (≤640px) — панель content-высотой (кап 512px),
    лог = высота контента (свой portrait-правило .combat-log
    НЕТ — пин combat-layout), кнопки = ПОСЛЕДНИЙ блок колонки.
  Формулы 304/520 и кап 512px НЕ трогать: сумма естественных
  высот содержимого панели при перестановке НЕ МЕНЯЕТСЯ
  (расчёт 000124-ревью остаётся верным).
* Существующие guards combat-ui.js (G.createCombat/G.
  CombatKeys/G.SpellBook/G.AllySpells/G.combatScale —
  console.error + деградация, игра не падает) — без изменений.

## Что важно будущим задачам

* 000247 (город/подземелье: убрать правую панель, показать
  левую; мягкая зависимость «общий CSS .combat-side»):
  пересечений НЕТ — она правит src/dungeon-ui.js + CSS
  .dungeon-overlay/городских скоупов; 000246 базовое
  .combat-side/.combat-log и .dungeon-overlay НЕ трогает (0
  diff правил) → «мягкая зависимость» становится vacuous.
  Мержить 000246 ПЕРВЫМ в серии (так и задумано: 000248/
  000249 — серийно за 000246/000248).
* 000248/000249 (анимации атак и др.; общие файлы src/
  combat-ui.js + index.html): конфликтные зоны — хвост
  build() (L510–542: resurrect-кнопка/quickBox/log) и боевой
  CSS-скоуп; при ребайзе сохранять порядок side
  [.., log, quicklist, actions] — он закреплён 3 пины 246-* +
  4 re-pin (см. список).
* Контракты ТЗ-ссылок: 000124 (скоуп-контракт — базовые
  правила не трогаем; .combat-actions — боевой класс,
  единственное базовое, которое МОЖНО править — этой задачей
  НЕ правится), 000171/000178 (кнопки Воскрешение/Каст-
  Лечение — гейты и :disabled бит-в-бит, элементы двигаются
  ЦЕЛИКОМ), 000199 (mpbar — 3-й элемент — не меняется;
  бейджи .combat-actcount персистентные span'ы build() —
  не пересоздаются render'ом, паттерн 000149).
* memory/000124-combat-layout.md §«Состав боевого оверлея
  (build())» ОБНОВЛЯЕТСЯ этой задачей (старый порядок там
  turnorder → hpbar → state → actions → log — без mpbar/
  quicklist); 000199-файлы памяти и 000194-файл — правок НЕ
  требуют (положения остаются истинными: «mpbar — третий»,
  «quicklist — между actions и log»).
* Если в будущем править .combat-overlay--combat .combat-log —
  сохранить шорткат `flex: 1 1 auto` (пин combat-layout
  L81–85 читает decls['flex'], не flex-grow).

## Подводные камни

1. 4 порядка-пина станут красными ПОСЛЕ reorder и ДО ре-пина —
   ожидаемый TDD-поток; ре-пины ОБЯЗАТЕЛЬНЫ в той же задаче
   (иначе «весь набор зелёный» недостижим). Других
   позиционных пинов .combat-side нет (полный grep:
   deepEqual/lastChild/idx-сравнения).
2. Шорткат flex: 1 1 auto у скоуп-лога — закреплён пином
   (decls['flex']) — лонгхэнд-перезапись без шортката
   уронит зелёного стража.
3. ТЗ-«Состояние сейчас» устарело (a1 §5): первый элемент —
   turnorder (не state); не упомянуты mpbar/quicklist; книга —
   в .combat-box, а не в side (с 000196); в списке кнопок нет
   «Последнее заклинание» (000227). Источник правды — код
   master bce455e.
4. Портрет-мобайл: «всё оставшееся пространство» — это
   десктоп-row (панель stretch до высоты оверлея); в portrait
   панель content-высотой (кап 512px) — flex-grow лога не
   растягивает auto-контейнер, лог = высота контента — как
   сейчас, только порядок блоков новый. Визуальная проверка
   желательна (тесты пиксели не рендерят).
5. Открытый quicklist (max-height 40% панели) в новом слоте
   сжимает лог снизу, кнопки на дне — проверить вручную в
   браузере (KeyE при открытом списке).
6. margin-bottom 10px базового .combat-actions теперь под
   кнопками — РЕШЕНО в ревью 2026-10-23: скоуп-правило
   .combat-overlay--combat .combat-actions { margin-bottom: 0 }
   + пин combat-layout (ТЗ «кнопки в САМЫЙ НИЗ»). База
   .combat-actions — контракт 000124 — НЕ тронута; любые
   будущие правки геометрии кнопок — ТОЛЬКО скоупом
   .combat-overlay--combat.
7. Комментарий 000124 в index.html (L390–403) — правка только
   фразы «под кнопками» → «между state и кнопками» (текст, не
   правила); комментарии в коде не плодить (CLAUDE.md).
8. npm test мерить ВНУТРИ worktree (node --test рекурсивно
   сканирует .worktrees/ — memory/test-runner-worktrees.md).
   Флейк — перепуск node --test tests/<файл> + запись в отчёт
   (база bce455e: 3058/3058, 2 прогона).

## Ревью 2026-10-23 (правки по findings)

Три ревьюера, 4 findings (все minor; 3 из них — один факт,
сообщённый тремя ревьюерами).
* Дата CHANGELOG 2026-10-22 → 2026-10-23 (3 findings): РЕАЛЕН —
  мерж и все коммиты задачи датированы 2026-10-23 (02:25–03:05);
  CLAUDE.md — «упоминание по дате мержа», станция — «дата =
  сегодня». Исправлено: блок `### Управление` перенесён из
  `## 2026-10-22` в новую секцию `## 2026-10-23` (над ней).
* margin-bottom 10px базового .combat-actions ПОД кнопками —
  22px пустоты до низа при 12px прочих краях (1 finding): РЕАЛЕН
  (косметика, но противоречит ТЗ «в САМЫЙ НИЗ»); «нулевой
  CSS-diff» отменён осознанно — 000124 прямо разрешает правку
  .combat-actions в базе, а скоуп-правило безопаснее и её не
  требует. Исправлено: скоуп-правило margin-bottom: 0 (ТОЛЬКО
  .combat-overlay--combat) + пин tests/combat-layout.test.js
  (секция 000246: скоуп 0 + стража базы 10px) + правки §Контракты
  и «Подводные камни» 6.
* Правки — 4 файла: index.html, tests/combat-layout.test.js,
  CHANGELOG.md, этот memory. Коммит — «Задача 000246: правки по
  итогам ревью».

## План реализации (файлы / ожидаемая дельта)

1. КРАСНЫЙ коммит «Задача 000246: красные тесты …»:
   * tests/ui.test.js — новая секция в конце файла: сандбокс
     (Proxy makeEl + makeContext2d + document/window-стабы) +
     динамический CHAIN до combat-ui.js + сцена + 3 пина
     (000246-ACT-LAST RED, 000246-LOG-FLEX RED+гард,
     000246-TOP-4 гард) — ~+200 строк;
   * memory/000246-combat-side-actions-bottom.md (этот файл);
   * memory/000124-combat-layout.md — §Состав: новый порядок +
     ссылка на 000246 — ~±3 строки.
   npm test: 3058 зелёных + 2 красных (3060).
2. «Задача 000246: кнопки — в низ панели, лог — на остаток»:
   * src/combat-ui.js — build(): перенос 2 appendChild
     (actions, quickBox) после logEl; порядок log →
     quicklist → actions — ±0 строк (перестановка);
   * index.html — текст комментария 000124 (L398) — 1 строка;
   * ре-пины: tests/combat-ui.test.js L6752/L8214 (deepEqual +
     сообщения), tests/combat-ui-quicklist.test.js L186/
     L413–416 (ассерты + заголовки) — ~±10 строк.
   npm test: 3061/3061 зелёных.
3. «Задача 000246: CHANGELOG — …» (отдельный коммит):
   CHANGELOG.md → ## 2026-10-22 → новый подзаголовок
   `### Управление` — 1 пункт.
4. Коммиты ветки task/000246: первая строка «Задача 000246: …»
   (рус.), последний параграф — Co-Authored-By: Claude Code
   <noreply@anthropic.com>. Финальный squash — на стадии
   мержа (memory/one-commit-per-task-squash).

Итого 7 файлов: ~+230/−10 строк; 0 новых модулей/классов/
ассетов/script-тегов.

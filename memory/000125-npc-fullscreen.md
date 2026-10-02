# 000125: Диалог NPC на весь экран — контракт layout (декэплинг от .combat-side)

Статус: РЕАЛИЗОВАНО (task/000125, коммит cd60ba3; npm test 1315/1315).
Правки по итогам ревью (станция «Правки», 2026-10-02): статусная
шапка обновлена — файл был закоммичен на красной стадии (db2cfc3),
после коммита реализации cd60ba3 строка «Код не изменялся,
коммитов нет» устарела; контракт, решения и карта тестов — без
изменений. Worktree .worktrees/task-000125, ветка task/000125, база
master db99913 (000101 смержен; 000124 СМЕРЖЕН — скоуп
`.combat-overlay--combat` живёт в index.html).
Анализы: /tmp/thegame-wf-000125/{a1-domain.md, a2-arch.md, a3-tests.md}.
Базовый npm test: 1305/1305 (проверено 2026-10-02 в worktree).

## Что добавлено / перенесено

Переносов нет (граница «ядро/UI» сохраняется: механики диалога
000010/000029/000078, onChange/сейв, Esc — НЕ ТРОГАЮТСЯ). Добавлено:
* СВОЙ класс панели `.npc-panel` (вместо переиспользованной боевой
  `.combat-side`) — одна строка в `npcBuild()`, src/ui.js:728
  (регион npcBuild — 725–774 на базе db99913; номера 844–892 в ТЗ —
  от master a2c040e, устарели).
* CSS-блок полноэкранного диалога в index.html (НА МЕСТЕ старых
  NPC-правил: после `.dungeon-overlay .combat-side`, перед `</style>`,
  база db99913: строки 497–500): свои правила `.npc-overlay` /
  `.npc-panel …` / `.npc-log`; УБИРАЮТСЯ `.npc-overlay .combat-side
  { max-height: 84vh; overflow-y: auto; }` и `.npc-log
  { max-height: 140px; overflow-y: auto; }` (ТЗ п. 3).
* Тесты: секция «000125» в tests/ui-panel.test.js (vm-песочница,
  R1 + G1) и НОВЫЙ tests/npc-layout.test.js (статика index.html и
  src/ui.js: R2–R8 + G2 + стражи общих `.cp-*`).
* Новая функциональность — ТОЛЬКО layout: ни одного нового
  JS-модуля/скрипта/SVG-ассета (→ UMD-ловушки нет, пины
  tests/index-order.test.js и tests/svg.test.js НЕ нужны).

## Контракт и границы

### DOM-контракт (npcBuild, src/ui.js:725–774 — состав и обработчики
ИНВАРИАНТНЫ, меняется только класс панели)

```
оверлей  el('div', 'combat-overlay npc-overlay')   (ui.js:727 — НЕ ТРОГАТЬ)
панель   el('div', 'npc-panel')                    (ui.js:728 — БЫЛО combat-side)
  ├─ .cp-title: span (имя — роль) + button .cp-close «закрыть [Esc]»
  │     (data-npcact='close')
  ├─ .cp-itemrow — 5 кнопок .cp-btn[data-npcact='tab'][data-tab]:
  │     dialog/trade/train/quests/hire  (hire — 000078; ТЗ «4 кнопки»
  │     устарело — состав БЕЗ ИЗМЕНЕНИЙ, см. «Отклонения»)
  ├─ .cp-items — тело (списки опций/предметов/навыков/квестов/найм)
  └─ .combat-state.npc-log — лог (Последний ребёнок панели)
```
* Оверлей сохраняет ОБА класса (решение 1): база `.combat-overlay`
  (fixed/inset:0/фон/z-20/font 13px #e8dcc0) — ровно то, что нужно
  полноэкранному слою; `.npc-overlay` — маркер-фильтр (building-
  effects: `findAll('.combat-overlay')` + `!includes('npc-overlay')`)
  и точка скоупа нового CSS.
* Лог ДЕРЖИТ оба класса `combat-state npc-log`: `.combat-state` —
  текстовое оформление (pre-line/цвет, база), не геометрия.
* onOverlayClick (delegation по `button[data-npcact]`), escHandler,
  npcUI.open/close/isActive/render, автораскрутка лога
  (renderTab, ui.js:780: `logEl.scrollTop = logEl.scrollHeight`) —
  БЕЗ ИЗМЕНЕНИЙ. JS нигде не querySelector'ит 'combat-side'/'npc-
  overlay' для NPC (grep по src/) — смена класса панели безопасна.

### CSS-контракт (итоговый блок, index.html, место 497–500 базы)

```css
.npc-overlay {
  display: block;            /* отсечение от flex-center+gap базы */
  background: #101418;       /* непрозрачная подложка — «рамка» не видна */
}
.npc-panel {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  padding: 12px 14px;               /* перенос из базы .combat-side */
  background: rgba(16, 18, 24, 0.95); /* перенос из базы .combat-side */
}
.npc-panel .cp-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex: 0 0 auto;
}
.npc-panel > .cp-itemrow {
  flex: 0 0 auto;
  flex-wrap: wrap;
}
.npc-panel .cp-items {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
}
.npc-panel > .cp-itemrow,
.npc-panel .cp-items,
.npc-log {
  width: 100%;
  max-width: 680px;
  margin-left: auto;
  margin-right: auto;
}
.npc-log {
  flex: 0 0 auto;
  max-height: 30vh;
  overflow-y: auto;
}
```
* Блок ИДЁТ ПОСЛЕ dungeon-правил (конец `<style>`) — позиция
  каскада: `.npc-overlay { display: block }` перебивает
  `display: flex` базы `.combat-overlay` (одинаковая специфичность
  0,1,0 — победа по порядку), тот же механизм, что у
  `.dungeon-overlay` (000066).
* Бой/подземелье/постройка — НЕ ТРОГАЮТСЯ: база `.combat-overlay`
  (217–228), база `.combat-side` (320px, 236–242), `.combat-state`
  (243–247), скоуп `.combat-overlay--combat` (378–470),
  `.dungeon-overlay*` (477–496), все общие `.cp-*` (87–105).
* Строка index.html:727 (классы оверлея) — НЕ ПРАВИТСЯ.

### Границы (что НЕ входит)
* `src/building-ui.js` (000071, СМЕРЖЕН): оверлей `combat-overlay` +
  `combat-side` (строка 187) — остаётся 320px-коробкой ВНЕ СКОУПА
  («не больше и не меньше ТЗ»); паттерн подхватит будущий ребайз
  (раздел «Для Game.buildingUI»).
* `.dungeon-overlay .combat-side` (270px absolute) — НЕ ТРОГАТЬ
  (модель мини-панели подземелья — своя, 000066).
* Детерминизм боя/сейвы/RNG — файлы не трогаются вовсе.

## Решения (открытые вопросы ТЗ — закрыты)

1. **Класс оверлея — ОСТАВЛЯЕМ `combat-overlay npc-overlay`**
   (ТЗ: «можно оставить — либо заменить; итог зафиксировать в
   памяти»). Почему: база даёт fixed/inset:0/z-20/фон — ровно
   полноэкранный слой; дельта минимальна (строка ui.js:727 не
   правится); building-effects-фильтр корректен; замена потребовала
   бы дублирования fixed/inset/z-20/фона в `.npc-overlay` — больший
   hunk без выигрыша. Отсечение от flex-center базы и «тёмной
   рамки» — отдельным скоупом `.npc-overlay { display: block;
   background: #101418 }` (прецедент `.dungeon-overlay`, 000066).
2. **Полноэкранность — `width/height: 100%` на `.npc-panel`**
   (относительно fixed inset:0 оверлея), не 100vh. Почему: следует
   визуальным вьюпортам мобильных и конвенции 000124 (vh-единицы
   согласованы с fixed inset:0).
3. **Заголовок — ВЕСЬ ЭКРАН** (не в колонке), «закрыть» — у ПРАВОГО
   КРАЯ. Почему: ТЗ в «колонке» явно перечисляет «(вкладки, тело,
   лог)» — заголовок не в списке; база `.cp-title` не flex-ряд,
   поэтому скоуп-правило `display: flex; justify-content:
   space-between` (иначе кнопка «закрыть» стоит вплотную к имени —
   не тапабельно-удобно на мобильном, а ТЗ требует тапабельность);
   `.cp-close { align-self: flex-end }` (база) в flex-ряду не
   мешает.
4. **Вкладки при 320px — `flex-wrap: wrap`** (ТЗ: «wrap или
   компактные подписи — на усмотрение»). Почему: 5 подписей
   (включая «найм») зафиксированы тестами npc-hire — «компактные
   подписи» потребовали бы изменения состава (запрещено), wrap —
   единственное проверяемое решение; content 320−28(padding)=292px,
   5 кнопок ≈290–305px — впритык, обёртка в 2 ряда страхует.
5. **Колонка контента — 680px** (ТЗ: ~640…720px). Почему: середи-
   на диапазона; при 13px ui-monospace (~7.8px/символ) ≈87 символов/
   строка — читабельно; тест пинит ДИАПАЗОН 640…720 — ревью-правка
   внутри диапазона не рвёт тест. Центрирование — `margin-left/right:
   auto` (flex-column + align-items:stretch). Заголовок в колонке
   НЕ участвует (решение 3).
6. **Лог — 30vh** (ТЗ: ~25…35vh). Почему: середина диапазона; тест
   допускает коридор 20–40vh; `flex: 0 0 auto` — лог не сжимается
   телом (тело flex:1+min-height:0+overflow — сжимается само),
   автораскрутка (ui.js:780) работает с любым max-height.
7. **Панель — СВОЙ фон** `rgba(16,18,24,0.95)` (перенос из
   `.combat-side`), border/radius НЕ переносятся. Почему: панель =
   весь экран, рамка/скругление не нужны (ТЗ: «рамочный» фон не
   остаётся); непрозрачная подложка `.npc-overlay` #101418 (= фон
   html/body) гасит 5% просвета альфы — мир позади не видно.
8. **Скоуп-дисциплина**: ВСЕ новые правила — селекторы
   `.npc-overlay` / `.npc-panel …` / `.npc-log`; строка вкладок —
   `.npc-panel > .cp-itemrow` (child-комбинатор: прямые в
   теле `.cp-items .cp-itemrow` и чужие панели НЕ затрагиваются).
   Общие `.cp-*`/.combat-* — НОЛЬ правок. Критерий «layout диалога
   не ломается при ЛЮБОМ порядке мержей 000124/000125» выполнен:
   CSS диалога не зависит от `.combat-side`/`.combat-overlay`
   (кроме позиции каскада после базы).
9. **Старые правила УБИРАЮТСЯ** (84vh/140px) — ТЗ п. 3; единствен-
   ный фиксатор — стража 000124 (tests/combat-layout.test.js:66) —
   правится ТЕХНИЧЕСКИ одним коммитом с CSS (см. «Карта тестов»).

## Ленивые ссылки и guards

* НОВЫХ JS-МОДУЛЕЙ НЕТ → новых `<script>` НЕТ → пин tests/index-
  order.test.js не нужен; UMD-ловушки нет (правки — 1 строка в
  существующем browser-only ui.js + CSS).
* Ленивых ссылок (rootRef) новых НЕТ (модули не добавляются);
  существующие guards ui.js — без изменений.
* SVG: новых ассетов НЕТ → tests/svg.test.js не трогается.
* Страховки CSS (guards в tests/npc-layout.test.js, G2):
  `.dungeon-overlay .combat-side` 270px/absolute; база
  `.combat-side` 320px; `.combat-overlay--combat .combat-side`
  256px; общие `.cp-title`/`.cp-itemrow`/`.cp-items` — базовые
  декларации на месте.

## Карта тестов

База: npm test в worktree — 1305/1305. Красные падают ОСМЫСЛЕННО
(нет правила/класса, присутствует то, что обязано быть убрано; не
синтаксис/ENOENT).

* **tests/ui-panel.test.js** — новая секция «000125» В КОНЕЦ файла,
  лоадер `loadTabsUi()` (CHAIN_000130 — динамическая цепочка из
  index.html до ui.js; лоадер между фазами НЕ правится — новых
  script-тегов нет):
  * R1 (vm, КРАСНЫЙ): `G.npcUI.open({npc, character, book})` →
    оверлей `.npc-overlay` (регрессия-якорь); панель =
    `overlay.children[0]` несёт класс `npc-panel` и НЕ несёт
    `combat-side`; в поддереве оверлея `findAll(overlay,
    '.combat-side').length === 0`. (Красный: ui.js:728 —
    `el('div', 'combat-side')`.)
  * G1 (vm, зелёный с первого запуска): состав панели — ровно 4
    прямых ребёнка по порядку: `.cp-title` (span + button
    `.cp-close` «закрыть [Esc]», data-npcact='close') →
    `.cp-itemrow` (5× .cp-btn[data-npcact='tab'], data-tab =
    dialog/trade/train/quests/hire) → `.cp-items` → `.npc-log`
    (Последний ребёнок, несёт и `.combat-state`).
* **tests/npc-layout.test.js (НОВЫЙ)** — статика (паттерн
  tests/combat-layout.test.js; хелпер-дубль принят в проекте):
  разбор ВСЕХ правил `<style>` (regex по тексту style-блока;
  @media-блок 000124 даёт «мусорный» матч с селектором
  '@media …' — фильтром «селектор содержит npc» отбрасывается):
  * R2 (КРАСНЫЙ): правило `.npc-panel` — width 100% И height 100%
    (или inset:0) + display flex + flex-direction column;
    overflow-y НЕ задан (скролл — только тело и лог).
  * R3 (КРАСНЫЙ): правило `.cp-items` в npc-скоупе (селектор
    содержит 'npc-panel'/'npc-overlay' и '.cp-items') — flex
    (начинается с 1), min-height 0, overflow-y auto.
  * R4 (КРАСНЫЙ): среди правил `.npc-log` — ≥1 с max-height
    `/^\d+vh$/` в 20…40vh + overflow-y auto; НИ ОДНОГО с
    max-height 140px. (Красный: текущее 140px без npc-скоупа.)
  * R5 (КРАСНЫЙ): колонка — правило в npc-скоупе (.cp-items/
    .cp-itemrow) — max-width 640…720px + margin-left/right auto.
  * R6 (КРАСНЫЙ): `.cp-itemrow` в npc-скоупе — flex-wrap: wrap.
  * R7 (КРАСНЫЙ): старые правила УБРАНЫ — html не матчит
    /\.npc-overlay\s+\.combat-side/ и нет .npc-log с 140px.
  * R8 (КРАСНЫЙ, static-src): src/ui.js — `el('div', 'npc-panel')`
    есть; `el('div', 'combat-side')` в ui.js отсутствует.
  * G2 (зелёный): стража — `.dungeon-overlay .combat-side`
    270px/absolute; база `.combat-side` 320px;
    `.combat-overlay--combat .combat-side` 256px; базовые
    `.cp-title`/`.cp-itemrow`/`.cp-items` — декларации на месте
    (общие классы не тронуты).
* **tests/combat-layout.test.js — ТЕХНИЧЕСКАЯ правка** (стрелок
  000124, строки 9–14/49/62/66): убрать ассерт
  `cssRule('.npc-overlay .combat-side')['max-height'] === '84vh'`
  (правило удалено 000125 по ТЗ — декэплинг СИЛЬНЕЕ обещанного
  000124: диалог больше не переиспользует `.combat-side`) и
  упоминания NPC-правила в заголовках/комментах; ассерт
  `.dungeon-overlay .combat-side` (270px/absolute) ОСТАЁТСЯ;
  тест переименовать «… .dungeon-overlay .combat-side на месте».
  Правка — в GREEN-коммите ВМЕСТЕ с index.html (в RED-фазе стража
  ещё зелёная — правило живёт).
* expectedRedCount = **8** (R1–R8; 1315 тестов на RED-фазе, 1307
  зелёных). Регрессия БЕЗ изменений: npc-hire 4/4 (5 вкладок,
  подписи), building-effects 78/78 (единый путь [E]→buildingUI→
  npcUI; findOverlay корректен), combat-layout 7/7 (до правки),
  combat-ui, dungeon-ui, npc.test, main-visuals, save-restore.
* Ручная (браузер): 390×844 / 844×390 — весь экран, 5 вкладок
  влезли (wrap) и тапабельны, торговля скроллится в теле, лог внизу
  подскролливает, «закрыть»/Esc; 1920×1080 — колонка 680px по
  центру; сделки/обучение/квесты — onChange и сейв как раньше
  (000029); боевой/подземельный/построечный оверлеи — визуально не
  изменились.

## Что важно будущим задачам (из ссылок ТЗ)

### Для Game.buildingUI (SPEC.md «Постройки») — контракт
полноэкранного layout диалога

SPEC «Эффекты построек → Модель взаимодействия»: единый оверлей
«действия постройки» `Game.buildingUI` (аналог `Game.npcUI`).
Состояние на базе: 000071 СМЕРЖЕН — src/building-ui.js существует,
оверлей `combat-overlay` + панель `combat-side` (строка 187,
320px-коробка) — ВЫНЕСЕН ИЗ СКОУПА 000125 (не трогать). Если
будущая задача сделает диалог постройки полноэкранным — подхватить
ПАТТЕРН этой задачи:
* СВОЙ класс панели (например `.building-panel`) — НЕ переис-
  пользовать `.npc-panel` (селекторы `.npc-*` — NPC-специфичные;
  скоуп-дисциплина та же, что здесь).
* Оверлей — `combat-overlay` + СВОЙ модификатор (например
  `.building-overlay`) со скоупом `{ display: block; background:
  #101418 }` по образцу `.npc-overlay` (отсечение от flex-center
  базы, «рамка» не остаётся).
* ТОЖЕ flex-контракт: панель 100%×100% flex-колонка (padding/фон —
  свои); заголовок + ряд действий — фиксированные (flex: 0 0 auto,
  wrap если кнопок много); тело — flex:1 + min-height:0 +
  overflow-y:auto (единственный основной скролл); лог/статус —
  flex:0 0 auto + max-height (vh) + свой скролл; колонка контента
  — max-width 640…720px + margin auto (фон — весь экран).
* CSS — ТОЛЬКО в своём скоупе (`.building-*`), после dungeon-
  блока, в конце `<style>`; общие `.cp-*`/.combat-* — не трогать.
* Красные тесты — по образцу секции 000125 (ui-panel-vm: класс
  панели + состав; новый static-файл: CSS-правила + стражи чужих
  оверлеев).
* Декэплинг от `.combat-side` — обязательный шаг (стража 000124
  «любой порядок мержей» уже не покрывает чужие панели).

### Прочее
* `.npc-log` — NPC-специфичный класс (единственный потребитель
  ui.js:756); правило топ-уровневое (как до 000125) — допустимо
  (класс чужой оверлей не несёт).
* 000124 (смержен): контракт его памяти (000124-combat-layout.md)
  «диалог NPC не затрагивается при любом порядке мержей» — ВЫПОЛ-
  НЕН декэплингом; её стража на `.npc-overlay .combat-side`
  утратила объект — технически исправлена (см. «Карта тестов»).
* 000123 (параллельная, pending): правит ui.js в IIFE тач-контролов
  (826–985) + CSS #touch-controls (178–216) — наш hunk ui.js
  725–774 / index.html 497+ (конец `<style>`) — пересечение НУЛЕВОЕ.
* 000010 (done): базовый диалог — от него состав панели (инвариант
  G1); 000029 — onChange/сейв (не тронут); 000078 — вкладка «найм»
  (состав).

## Подводные камни

1. **Стража 000124 на `.npc-overlay .combat-side`** (combat-layout.
   test.js:66) — без тех-правки в GREEN-коммите npm test красный
   (единственное фактическое пересечение с 000124; порядок: RED —
   правило живёт, стража зелёна; GREEN — CSS и стража ОДНИМ
   коммитом).
2. **Общие `.cp-*` классы** (панель персонажа ui-tab-*.js,
   постройка building-ui.js, квесты): любой нескаупленный right в
   `.cp-title/.cp-itemrow/.cp-items/.cp-btn` ломает чужие оверлеи
   (пины ui-panel/ui-skills/building-effects). Строка вкладок vs
   item-строки в теле — только `> .cp-itemrow`.
3. **Позиция CSS-блока** — конец `<style>`, ПОСЛЕ dungeon-правил:
   `.npc-overlay { display: block }` побеждает по ПОРЯДКУ каскада
   (специфичность равна базе) — перенос блока вверх/в середину
   ломает отсечение от flex-center.
4. **5 вкладок, а не 4** (найм — 000078; ТЗ «4 кнопки» устарело;
   пин npc-hire.test.js:273): подписи менять НЕЛЬЗЯ, wrap
   обязателен.
5. **Устаревшие номера ТЗ** (master a2c040e): npcBuild —
   ui.js:725–774 (не 844–892); CSS NPC — index.html:497–500 (не
   327–331); автораскрутка — ui.js:780 (не 897–898).
6. **`> *`-селектор ОТКЛОНЁН** (вариант а2-arch): колонка — явный
   список `.npc-panel > .cp-itemrow, .npc-panel .cp-items,
   .npc-log` — заголовок ТЗ не включает в колонку (решение 3);
   явный список не захватит будущий 5-й ребёнок панели молча.
7. **Стат-тест .npc-log** — формулировка «среди правил .npc-log
   ≥1 с max-height vh + overflow-y; нет 140px» — устойчива к
   порядку/слиянию правил (два .npc-log-правила в итоговом CSS:
   колонка + геометрия).
8. **npm test мерить ВНУТРИ worktree** (node --test рекурсивно
   сканирует .worktrees/ — memory/test-runner-worktrees.md).

## План реализации (файлы / дельта)

1. «Задача 000125: красные тесты + память» (один коммит):
   tests/ui-panel.test.js (+секция 000125: R1 + G1, ~60 строк),
   tests/npc-layout.test.js (новый, ~130 строк: хелпер + R2–R8 +
   G2 + cp-стражи), memory/000125-npc-fullscreen.md.
   npm test: 1305 зелёных + 8 красных (R1–R8).
2. «Задача 000125: диалог NPC на весь экран (.npc-panel, декэплинг
   от .combat-side)» (один коммит): src/ui.js (1 строка: 728
   `combat-side` → `npc-panel` + комментарий), index.html (CSS
   497–500 → новый блок, ~+38/−4), tests/combat-layout.test.js
   (правка стражи: ~+3/−4). npm test — весь зелёный (1315/1315).
3. (стадия мержа) CHANGELOG.md — `## 2026-10-02` → `### Интерфейс`
   (секция существует): «Диалог NPC — на весь экран: вкладки/тело/
   лог, на широких экранах колонка контента по центру; „закрыть“ и
   Esc — как раньше» (без программной части); отдельный коммит
   «Задача 000125: CHANGELOG — …». tasks/pending/000125.md →
   tasks/done/ + tasks/result/000125.md.

Итого ~6 файлов, +~230/−10 строк. Модулей/ассетов/скриптов — НЕТ.

## Отклонения (для ревью)

1. ТЗ: «4 кнопки» вкладок — на master 5 (найм, 000078). Реализуем
   как есть (состав «без изменений»); расхождение состава ТЗ, не
   отклонение механики.
2. ТЗ указывает 000071 как pending — на базе он СМЕРЖЕН;
   building-ui.js не трогаем, контракт — в разделе «Для
   Game.buildingUI».
3. Точные константы: 680px (в 640…720) и 30vh (в 25…35) — середины
   диапазонов; тесты пинят ДИАПАЗОНЫ.

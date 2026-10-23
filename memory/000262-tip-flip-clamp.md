# 000262: тултипы .cp-tip у верхнего края — flip вниз + clamp

Статус: выполнено (Finalize). ТЗ — tasks/done/000262.md
(отчёт — tasks/result/000262.md). Домен/архитектура/тесты —
анализы a1/a2/a3
(зафиксированы ниже; расхождения между анализами разрешены в пользу
этого файла). База: master 186bcdb / worktree f84cc58, `node --test
tests/` = 3098 (1 known-flake perf map.test.js «160k tileAt 7969 мс >
5000» — в изоляции 74/74 зелёный).

## Решения (открытые вопросы ТЗ/анализов — закрыты)

1. **Механизм — JS-замер в обработчиках событий + CSS-класс flip.
   Чистый CSS невозможен**: в CSS нет условия «позиция якоря во
   вьюпорте» для общего абсолютного якоря (position-try/anchor — не
   базовая линия проекта, не тестируемо в DOM-стабе). Показ/скрытие
   ОСТАЁТСЯ чистым CSS (:hover/:focus-within — правила НЕ тронуты);
   JS только решает, есть ли класс flip на .cp-tip (и clamp-margin в
   дегенеративном случае).
2. **Имя класса flip: `cp-tip--down`** (BEM-модификатор: тултип под
   строкой). Ставится ТОЛЬКО на узле .cp-tip (НЕ на строке — пин
   RAR-G ui.test.js: у ряда без rarity className побайтово
   «cp-itemrow»). Не матчит regex-пин cssRule('cp-tip')
   (/\.cp-tip\s*{/ — после .cp-tip идёт «-», не « {») и regex-пины
   :hover/:focus-within.
3. **CSS-правило (один hunk в index.html ПОСЛЕ правила
   `.char-panel .cp-itemrow > .cp-tip { left: 0; }` (~:153), ДО
   правил показа :hover/:focus-within)**:
   `.char-panel .cp-tip.cp-tip--down { bottom: auto; top: calc(100% + 4px); }`
   — специфичность (0,3,0) бьёт базовое (0,1,0); 4px — зеркало
   отступа «над»; покрывает ОБА янкоря (.cp-tipcell .cp-tip и
   .cp-itemrow > .cp-tip) — horizontal-правила (right:0 / left:0)
   свойство другие, конфликтуют не могут.
4. **Граница видимости — .cp-tabpane ∩ вьюпорт**: vTop = max(0,
   paneTop), vBottom = min(innerHeight, paneBottom); pane нет →
   (0, innerHeight). Пани (overflow-y:auto) — РЕАЛЬНЫЙ клиппер
   (строже вьюпорта: тултип навыка ~76px у первой видимой строки
   обрезается пани, даже если top ≥ 0 во вьюпорте). .char-panel
   НЕ клиппит (overflow visible) → панель границей не является.
   Цель ТЗ — «полностью видима» ⇒ граница = самый строгий клиппер.
5. **Решение позиции (арифметика, ОДИН замер за вызов, без
   пере-замера после смены класса)**: GAP = 4 (зеркало CSS);
   H = tip.height; aboveFits = ownerTop − H − GAP ≥ vTop;
   belowTop = ownerBottom + GAP; belowFits = belowTop + H ≤
   vBottom. Приоритет: (а) выше влезает → «над» (базовая позиция,
   бит-в-бит — класс/марджин не ставятся/снимаются); (б) выше не
   влезает, ниже влезает → flip; (в) никуда не влезает
   (дегенеративный низкий вьюпорт/пани) → flip + CLAMP:
   tip.style.marginTop = (vBottom − belowTop − H) + 'px' (≤ 0) —
   нижний край прижат к границе. ТЗ «flip и/или clamp» ⇒ clamp
   включён (TF-4 остаётся в a3-формулировке, без реформата).
6. **События (все — делегированные, как click-ветка :182-242)**:
   `mouseover` + `focusin` на panel (o = e.target,
   owner = o.closest('.cp-itemrow') || o.closest('tr') — дословный
   паттерн :237; focusin — клавиатура, :focus-within показывает
   tip); `scroll` на КАЖДЫЙ .cp-tabpane (вешается в makeColumn при
   создании pane); `resize` на window (typeof-guard) — пересчёт
   hovered-тултипа (ресайз под курсором). mouseout/mouseleave НЕ
   обрабатываются: stale-класс безопасен (tip виден только под
   :hover/:focus-within, каждый вход пересчитывает ДО показа).
   Re-render строит строки заново — чистый класс 'cp-tip' (дефолт
   «над») — корректно.
7. **Горизонталь — ИЗМЕНЕНИЙ НЕТ (проверено по ТЗ «по
   необходимости»)**: тултип навыка right:0 — от 1px-td в КОНЦЕ
   строки, растёт ВЛЕВО; правый край ≤ правый край строки ≤ правый
   край пани < правый край вьюпорта (панель right:12px + border
   1px) → правый край НЕ МОЖЕТ обрезаться. Тултип предмета left:0
   растёт вправо ≤300px — выход за правый край вьюпорта только при
   экстремально узком вьюпорте (< ~400px, правый столбец) —
   ПРЕСУЩЕСТВУЮЩЕЕ, не сообщено (сообщён ВЕРХНИЙ край), вне скоупа.
   TF-7 (гориз. кламп) НЕ создаётся.
8. **Состояние**: `hoveredTipOwner` — closure-переменная IIFE ui.js
   (уровня с panel/character), ставится в onTipPointer, читается в
   refreshHoveredTip (scroll/resize) с проверкой живости
   tipStillIn (обход n.parent || n.parentNode до panel — работает и
   в стабе, и в браузере; отсечённые render'ом узлы → no-op, плюс
   нулевой rect детаченного узла — двойной гард).
9. **Манипуляция классом — className-строкой** (split(/\s+/) /
   filter / join; push/splice по TIP_DOWN). classList НЕ
   используется (нет в DOM-стабе — конвенция ui-panel.test.js:13,
   «classList в DOM-стабе нет»).
10. **Инлайн-стили — только clamp** (tip.style.marginTop) и только
    когда нужен; запись «очистки» — NO-OP, если marginTop уже
    пуст/undefined (`if (tip.style.marginTop) ...`) — строка в
    СЕРЕДИНЕ после hover имеет ПОЛНОСТЬЮ ПУСТОЙ style (бит-в-бит,
    TF-6). Никаких инлайнов left/right/top.
11. **Деградация (гарды, порядок)**: tip/owner →
    typeof getBoundingClientRect === 'function' → поля rect
    number (top/bottom/height; у owner — top/bottom) → H > 0
    (скрытый пани display:none → нулевой rect → пропуск) →
    window.innerHeight number, иначе vh = Infinity → pane-rect
    полево (pr.top/pr.bottom number, иначе 0/vh). Старые стабы
    (rect {left:0,top:0} без height) → no-op БЕЗ ОДНОГО изменения →
    весь существующий набор бит-в-бит (ни один тест не шлёт
    mouseover/focusin/scroll на панель — grep).
12. **НОВЫХ МОДУЛЕЙ/ТЕГОВ НЕТ**: всё в IIFE src/ui.js (buildPanel
    строится ОДИН раз за сессию — `if (!panel) buildPanel()` —
    слушатели не накапливаются); index-order.test.js не тронут;
    ОДИН click-слушатель (пин :973-974 length===1) — новые типы
    mouseover/focusin/scroll, click не добавляется.
13. **Скоуп**: слушатели на .char-panel/её панях — NPC-оверлей
    (переиспользует .cp-itemrow вне .char-panel) исключён
    автоматически; CSS-правило flip scoped под .char-panel
    (пин npc-layout не смещается).
14. **Тесты**: НОВЫЙ файл tests/tooltip-flip-000262.test.js (vm,
    ДИНАМИЧЕСКИЙ CHAIN до src/ui.js — паттерн ui.test.js; СОБСТВЕННЫЙ
    стаб с деревом — дублирование конвенция) + ТОЛЬКО два
    расширения стаба: (а) makeEl:
    `getBoundingClientRect() { return this._rect || { left: 0, top: 0 }; }`
    (дефолт {left:0,top:0} сохранён — без height → гард 11 → no-op),
    (б) sandbox window с innerWidth/innerHeight = 1280/720 (как
    main-visuals). Техправок существующих тестов — НЕТ (список a3 §5
    пуст при этом дизайне).
15. **CHANGELOG**: ДА (UX-изменение для игрока) — отдельный коммит
    «Задача 000262: CHANGELOG — …», дата 2026-10-23, секция
    «Графика»: «Тултипы у верхнего края. Подсказки по навыкам и
    предметам больше не обрезаются у верхнего края панели: если над
    строкой нет места, тултип раскрывается под ней; в узком окне
    дополнительно прижимается к границам (clamp).»

## Контракты для RED-стадии (точные символы — пины по ним)

* Класс: `cp-tip--down` на узле .cp-tip. До: className === 'cp-tip'.
  После flip: 'cp-tip cp-tip--down' (строкой, порядок: cp-tip
  первый).
* JS-символы (closure ui.js, НЕ экспортируются): TIP_DOWN =
  'cp-tip--down'; TIP_GAP = 4; hoveredTipOwner; tipHasDown(tip);
  tipSetDown(tip, on); tipStillIn(o); placeTip(tip, owner);
  refreshHoveredTip(); onTipPointer(e). Вешаются в buildPanel:
  panel.addEventListener('mouseover', onTipPointer),
  panel.addEventListener('focusin', onTipPointer),
  window.addEventListener('resize', refreshHoveredTip) (typeof-
  guard); в makeColumn: pane.addEventListener('scroll',
  refreshHoveredTip) — на каждый pane.
* Синтетика: panel.listeners.mouseover[0]({ target: X }),
  panel.listeners.focusin[0]({ target: X }),
  pane.listeners.scroll[0]({}) — паттерн click-тестов ui-panel.
* Решающие величины: owner — closest('.cp-itemrow') ||
  closest('tr') (навык → tr; предмет → .cp-itemrow); tip =
  owner.querySelector('.cp-tip'); H = tip rect height; GAP = 4;
  vTop = max(0, paneRect.top); vBottom = min(window.innerHeight,
  paneRect.bottom) (pane — owner.closest('.cp-tabpane'); pane/rect
  без полей → 0/Infinity).
* Clamp: tip.style.marginTop = String(vBottom − ownerBottom − 4 − H)
  + 'px'; очистка — no-op, если уже пуст.
* CSS (index.html): ПРАВИЛО `.char-panel .cp-tip.cp-tip--down {
  bottom: auto; top: calc(100% + 4px); }` — ПИН: regex по html +
  cssRule('cp-tip') базовое правило НЕ смещено (bottom:
  calc(100% + 4px), position: absolute, z-index: 11, max-width:
  300px, pointer-events: none, opacity: 0); regex :hover /
  :focus-within opacity:1 — не тронуты.
* Красные (TF-1..TF-5, падают до фикса) + гварды:
  - TF-1 (RED): item-строка у верхнего края (owner _rect
    {top:60,bottom:85}, tip _rect {top:-84,bottom:81,height:140},
    pane _rect {top:90,bottom:600}, window 1280×720) → mouseover →
    className 'cp-tip cp-tip--down', style ПУСТ (below влезает:
    85+4+140=229 ≤ 600). Красный: слушателя mouseover нет / класса
    нет.
  - TF-2 (RED): строка НАВЫКА (tr с td.cp-tipcell; target — tr или
    ячейка внутри) у верхнего края → mouseover → flip-класс (тот же
    owner-паттерн, второй янкор).
  - TF-3 (RED): после flip (условия TF-1) — owner _rect
    {top:300,bottom:325}, tip _rect {top:220,bottom:296,height:76}
    (средина) → pane.listeners.scroll[0]({}) → класс СНЯТ
    (aboveFits: 300−76−4=220 ≥ 90), marginTop пуст. Красный:
    pane.listeners.scroll пуст.
  - TF-4 (RED, clamp): owner _rect {top:55,bottom:85}, tip _rect
    {top:-289,bottom:71,height:340}, pane _rect {top:50,bottom:400},
    vh=720 → vBottom=400; aboveFits: 55−344<50 (нет); belowFits:
    85+4+340=429>400 (нет) → mouseover → flip-класс +
    style.marginTop === '-29px' (400−429); эффективный rect
    [60,400] ⊆ [50,400]. Красный: clamp-логики нет.
  - TF-5 (RED, CSS-пин): flip-правило есть в index.html (оба
    свойства) + базовое правило .cp-tip побайтово на месте +
    :hover/:focus-within не тронуты. Красный: правила нет.
  - TF-6 (ЗЕЛЁНЫЙ гвард, в red-счёт НЕ входит): строка в СЕРЕДИНЕ
    (TF-3-геометрия, без flip) → mouseover → className === 'cp-tip'
    (точно), Object.keys(tip.style).length === 0.
  - TF-7 (ЗЕЛЁНЫЙ гвард, деградация): tip _rect БЕЗ height (стаб по
    умолчанию {left:0,top:0}) → mouseover/scroll → исключений нет,
    className не меняется, style пуст.
  - Структурные (в TF-1/TF-3): panel.listeners.mouseover.length
    === 1; panel.listeners.focusin.length === 1; у каждого
    .cp-tabpane — scroll.length === 1; panel.listeners.click.length
    === 1 (не растёт).
* focusin-путь (в TF-2 или отдельно): target = button.cp-btn внутри
  tr → closest('.cp-itemrow') = null → closest('tr') = owner → tip
  из tipcell → flip по той же геометрии.

## Подводные камни (для реализации и будущих задач)

* render() НЕ сбрасывает className TIP'а (узел живёт через render —
  пин «тот же узел» ui-panel :1030-1053; textContent-перезапись
  className не трогает). Флип-класс переживает render до
  пересчёта; строки, ПЕРЕСОБРАННЫЕ render'ом (инвентарь/снаряжение
  после действий) — заново с чистым 'cp-tip' (дефолт «над») —
  корректно.
* getBoundingClientRect на СКРЫТОМ пани (display:none у неактивной
  вкладки) — нулевой rect → гард H>0 пропускает. hoveredTipOwner из
  скрытой вкладки — no-op (нулевой rect + tipStillIn).
* Замер — ТОЛЬКО в обработчиках: buildPanel/render rect НЕ
  считают (main-visuals boot со стабами — обязан остаться
  зелёным; NaN в инлайнах = баг фикса, не техправка теста).
* Не добавлять flip-класс на СТРОКУ (RAR-G), не второй click
  (пин length===1), не менять базовое правило .cp-tip и правила
  показа (regex-пины), не трогать .cp-tipcell/.cp-itemrow
  position:relative, z-index 11, pointer-events: none,
  geometry .char-panel, z-лестницу, тексты 000097, touch-fallback,
  магазин, NPC-оверлей, squad-панель (вторая IIFE с
  ОДНОИМЕННЫМ `panel` в ui.js ~:1418+ — НЕ путать; flip живёт
  только в closure панели персонажа).
* Конфликты параллельной волны (000258-000265): общие регионы —
  CSS-блок index.html ~:100-200 и buildPanel в ui.js; hunk
  маленький (1 правило + ~70 строк JS) — снимается rebase-стадией.
* «Выше влезает, ниже не влезает» (строка у НИЗНЕГО края): flip НЕ
  ставится — «над» (бит-в-бит) — предпочтительная позиция;
  «ниже влезает, выше не влезает» (строка у верхнего): flip.
  «Обе влезют»/«обе нет» — см. решение 5 (приоритет «над»; clamp
  при обеих-нет).

## Что важно будущим задачам

* Если появятся тултипы вне .char-panel (например, у NPC-оверлея —
  сегодня у строк магазина/ NPC НЕТ .cp-tip) — механизм flip
  scope-объёмный только .char-panel; для NPC нужен отдельный
  скоуп/вешание (слушатели на panel не ловят oверлей).
* Если 000255-000261-волна поменяет geometry .char-panel (панель
  12px/56px) — граница читается из rect в момент события,
  хардкода геометрии НЕТ — адаптивно.
* Класс .cp-tip--down можно расширять: будущий гориз. кламп —
  тот же механизм (onTipPointer/placeTip), новые поля rect.
* SPEC.md тултипы не упоминает (фича 000097) — контракт — здесь +
  memory/000097-char-panel-tooltips.md (показ/скрытие, тексты,
  touch-fallback — НОЛЬ изменений этой задачей).

## Файлы и дельта (план реализации)

* index.html — +3 строки: hunk (комментарий-ссылка 1 строка +
  правило 1-2 строки) ПОСЛЕ :153 (`.char-panel .cp-itemrow > .cp-tip
  { left: 0; }`), ДО :154 (правила показа).
* src/ui.js — ~+70-80 строк: IIFE-уровень (TIP_DOWN/TIP_GAP/
  hoveredTipOwner + 6 функций: tipHasDown, tipSetDown, tipStillIn,
  placeTip, refreshHoveredTip, onTipPointer — после flashNotice
  или перед buildPanel); buildPanel — вешание mouseover/focusin +
  window-resize (typeof-guard) после click-слушателя; makeColumn —
  1 строка scroll на pane.
* tests/tooltip-flip-000262.test.js — НОВЫЙ ~330-400 строк
  (стаб с деревом + _rect + window 1280×720; динам. CHAIN;
  TF-1..TF-7 + структурные).
* memory/000262-tip-flip-clamp.md — этот файл.
* CHANGELOG.md — +3-4 строки (отдельный коммит, 2026-10-23).
* tasks: pending→done, tasks/result/000262.md (в стадии мержа).
* Коммиты ветки task/000262: (1) «Задача 000262: flip/clamp
  тултипов у верхнего края (.cp-tip--down; JS-замер mouseover/
  focusin/scroll/resize; граница pane∩viewport; память + тесты)»
  [красные→фикс одним коммитом вместе с memory]; (2) «Задача
  000262: CHANGELOG — тултипы у верхнего края». Финал — один
  коммит на задачу (squash при мерже: reset --soft + ff-only).

## Итог (Finalize)

* Факт (план → факт): index.html +2 (комментарий 1 строка +
  правило 1 строка; план +3 — правило влезло в 1 строку),
  src/ui.js +119, tests/tooltip-flip-000262.test.js +615,
  memory +257, CHANGELOG.md +4 — всего +997/−0 (чисто
  аддитивный дифф).
* Коммиты ветки: 8f40148 (красные TF-1..TF-7 + контракты),
  b69e213 (реализация), afa08f2 (CHANGELOG), 4742b38 (правки
  ревью: формулировка clamp — «если и сверху, и снизу не
  хватает места, тултип прижимается к границам панели»;
  ветка срабатывает при нехватке ВЕРТИКАЛЬНОГО места —
  aboveFits и belowFits оба false — а не «в узком окне»),
  коммит Finalize (отчёт + статус этой записи + pending→done).
* npm test на Finalize (worktree): полный прогон 3105/3105,
  0 fail. Предыдущий полный прогон — 3104/3105: единственный
  fail — known-flake perf tests/map.test.js:1958 «160k tileAt»
  (бюджет 5000 мс) под нагрузкой (параллельный npm test в
  чужом worktree); НЕ в диффе задачи, в изоляции map.test.js
  74/74, tooltip-файл в изоляции 7/7.
* Мерж: master с базы f84cc58 сдвинулся (000247 — 6d9175f:
  index.html ~:653-675 dungeon-CSS + src/dungeon-ui.js +
  CHANGELOG «Интерфейс» :49-55) — НЕ пересекается с ханками
  000262 (index.html :151-158; src/ui.js — не тронут
  master'ом; CHANGELOG «Графика» :13-16) — rebase ожидается
  чистый; после — ОБЯЗАТЕЛЕН полный npm test.

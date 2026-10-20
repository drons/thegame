# 000237: Победа — иконки выпавших предметов + иконки в строках инвентаря/снаряжения (стиль один — ядро itemRow + cp-классы)

Дата: 2026-10-19 (станция Проектирование — дизайн зафиксирован, код ещё не
писался). Worktree `.worktrees/task-000237`, ветка `task/000237`, база =
master `3c66d33` (чистый; все line-якоря ТЗ перепроверены дословно,
расхождений нет — а1 §4). ТЗ — `tasks/pending/000237.md`. Анализы:
a1-домен, a2-архитектура, a3-тесты. Базовая линия — 2714 теста / 2713 pass
(1 known-флейк нагрузки tests/map.test.js:1943 — solo 74/74 pass). Статус:
дизайн зафиксирован; коммитов ещё нет (memory коммитится на красной стадии
вместе с тестами).

## 1. Что добавлено/изменено (план, все изменения — ОДИН коммит +
отдельный коммит CHANGELOG)

* `src/ui.js` — `itemRow(name, meta, buttons, tip)` (:363) → ПЯТЫЙ
  опциональный аргумент `icon`. Ненулевая строка → строка получает
  `el('img', 'cp-itemicon')` (src = icon, alt = '') ПЕРВЫМ ребёнком, ДО
  `span.cp-itemname`. 4-аргументные вызовы — icon === undefined → 0 DOM-diff
  (вызовы: ui-tab-inventory.js:86/124/130/152, ui-tab-shop.js:89/103).
  Комментарий 000097/000130 над itemRow НЕ ТРОГАЕТСЯ (CLAUDE.md — новых
  комментариев нет; контракт — в этом файле, git blame → tasks/done/000237.md).
* `src/ui-tab-inventory.js` — локальный помощник в теле фабрики
  `iconOf(it)` (it и typeof it.icon === 'string' && it.icon !== '' → it.icon,
  иначе null) + ПЕРЕДАЧА 5-го аргумента в 4 строках: «Инвентарь»
  (iconOf(it)), «Снаряжение»-оружие (wep ? iconOf(wep) : null),
  «Снаряжение»-броня (arm ? iconOf(arm) : null), быстрые слоты
  (q ? iconOf(q) : null). Вкладка «Магазин» (ui-tab-shop.js) — НЕ ТРОГАЕТСЯ
  (зона 000101, ТЗ не требует).
* `src/combat-ui.js` — узел лута победы `.combat-victory-loot` (§2.2) +
  closure `boxEl` (ссылка на .combat-box — box в build() ЛОКАЛЕН, :308) и
  `lootEl`; вызов `renderVictoryLoot(c)` в render() ПОСЛЕ блока `if
  (c.result)` баннера (:2061-2079); обнуление boxEl/lootEl в ОБЕИХ точках
  teardown (finish :2844, catch startCombat :3055).
* `index.html` — ДВА новых CSS-правила (аддитивно; базовые
  .cp-itemrow/.cp-itemicon/.cp-itemname :98-100 и .combat-banner :370-383/
  :438-446 — БЕЗ ИЗМЕНЕНИЙ): скоуп-правило ПОСЛЕ `.combat-overlay--combat
  .combat-banner` (:446) + portrait-правило (только width) КОНЦОМ
  portrait-медиаблока (ПОСЛЕ правила .combat-flee-confirm :613). НОВЫХ
  script-тегов НЕТ → tests/index-order.test.js не трогается.
* `tests/combat-ui.test.js` — блок «000237» концом файла: 237-CU-LOOT-1/2/3
  (красные) + 237-CU-LOOT-4 (зелёный гвард) (§4).
* `tests/ui-panel.test.js` — блок «000237» концом файла: 237-INV-1/2
  (красные) + 237-INV-G (зелёный гвард) (§4).
* `tests/combat-layout.test.js` — 237-CSS (красный, статика): cssRule +
  portraitRule нового правила (§4).
* `memory/000237-victory-loot-icons.md` — этот файл.
* `CHANGELOG.md` — отдельный коммит «Задача 000237: CHANGELOG — …»,
  раздел `## 2026-10-20`, подраздел «### Графика» (§7).
* Финализация (не эта станция): `git mv tasks/pending/000237.md
  tasks/done/000237.md` + `tasks/result/000237.md`.

**Без изменений (ТЗ-ограничения + анализ):** src/combat.js (c.result.items
уже есть: rollVictoryLoot :1216-1237, victory-ветка :1285), каталог
предметов и зеркала (76 предметов, у 33 icon — ВСЕ
`assets/sprites/loot/<id>.svg`, 33 SVG на месте), src/main.js/hud.js/
save.js/спеллы, NEW SVG-ассетов НЕТ (tests/svg.test.js не задействован).

## 2. Контракты и границы

### 2.1 itemRow + icon (src/ui.js) — единый механизм предметной строки

* Подпись: `itemRow(name, meta, buttons, tip, icon)`. img — ПЕРВЫМ
  ребёнком строки, ДО span.cp-itemname (паттерн 000152: src/ui.js:829-833;
  деградация — building-ui.js:211-215: img ТОЛЬКО при
  `typeof icon === 'string' && icon !== ''`).
* 4 аргумента = 0 DOM-diff (все существующие строки панелей/магазина
  бит-в-байт; ассерты существующих тестов — через querySelector
  name/meta/tip/data-act, ни один НЕ пиннит порядок/число детей строки —
  a3 §1.2).
* Правило деградации: у 43 из 76 legacy-предметов (оружие/броня/зелья/еда/
  книги/свитки) icon НЕТ → null → строка текстовая, как на master. Иконки
  для них — возможная БУДУЩАЯ контентная задача (волны 000230.08–.15
  создадут assets/sprites/items/ — строки data-driven от it.icon, этот
  код их переживёт без правок).
* Фолбэк-конвенция `assets/sprites/loot/<id>.svg` — ТОЛЬКО карта
  (sprites.js lootSprite :856-872), в UI НЕ ИСПОЛЬЗУЕТСЯ (файл может не
  существовать — битый img недопустим).
* itemRow НЕ выводится на Game-уровень: остаётся механизмом вкладки
  (000130: вкладкам — через ctx.itemRow). Экспорт в G.* — не нужен (§2.2,
  решение D3).

### 2.2 Узел лута победы (src/combat-ui.js) — .combat-victory-loot

* **Класс — `combat-victory-loot`** (решение D1; отклонены `.combat-loot`
  — слишком широко, домен карты/lootSprite чужой, и `.combat-banner-loot` —
  узел СИБЛИНГ баннера, а не его ребёнок, префикс «banner-» врёт о DOM).
  Конвенция классов модуля `.combat-*` (banner/spellbook/flee-confirm/
  quicklist).
* **Позиция в DOM — 5-й ребёнок .combat-box, appendChild ПОСЛЕ
  .combat-banner** (DOM-порядок → рисуется НАД фоном баннера; bannerEl и
  его textContent НЕ ТРОГАТЬ — пин точного текста victory/fled/dead; если бы
  узел был РЕБЁНКОМ баннера, `bannerEl.textContent = …` в render его
  стирал).
* **ЛЕНИВАЯ сборка (решение D2)**: узел строится ОДИН РАЗ — при ПЕРВОМ
  render(), где `c.result.outcome === 'victory'`, и кэшируется (closure
  `lootEl`; guard `if (lootEl) return` — далее кадры no-op). НЕ строится
  в build() — пин CU196-POS (tests/combat-ui.test.js:8207-8233) фиксирует
  .combat-box РОВНО 4 ребёнка в сцене без c.result → ленивая сборка его
  НЕ ЗАДЕВАЕТ (технический ре-пин 4→5, который планировал a1/a2 для
  build()-варианта, НЕ НУЖЕН — ни одного существующего теста не правится).
  c.result иммутабелен после установки (checkVictory :1240 `if (c.result)
  return`) → исходknown на первом victory-render'е, перестроение
  невозможно.
* **Видимость (буквальное ТЗ)**:
  * victory + items непустой → узел виден (inline display НЕ ставится —
    flex даёт CSS-правило);
  * victory + items пустой/отсутствует → узел СУЩЕСТВУЕТ, скрыт
    (style.display = 'none' — ТЗ «items пусто/отсутствует — узел скрыт
    (display none)»);
  * 'fled'/'dead' → узла в DOM НЕТ вовсе (ТЗ «outcome 'fled'/'dead' —
    узла нет»; гвард-тест 237-CU-LOOT-4 — селектор → null).
* **Строки лута (решение D3 — self-contained в combat-ui.js)**: по каждому
  `{id, qty}` из c.result.items (порядок первого появления — ядро 000132) —
  `div.cp-itemrow` (те же классы, что в инвентаре):
  * `img.cp-itemicon` ПЕРВЫМ ребёнком (src = it.icon из каталога, alt = '')
    — ТОЛЬКО при `typeof it.icon === 'string' && it.icon !== ''` (тот же
    guard, что itemRow/000152/building-ui);
  * `span.cp-itemname` — `(it ? it.name : String(e.id)) + (e.qty > 1 ?
    ' ×' + e.qty : '')` — формат имени = инвентарь (« ×N» при qty > 1);
  * meta/кнопки/tip — НЕТ (read-only строка).
  «Один общий механизм» (ТЗ-цель) — СТРУКТУРНО: те же CSS-классы
  cp-itemrow/cp-itemicon/cp-itemname, та же иконка 22×22 (index.html:100),
  тот же источник иконки (it.icon каталога, без фолбэка), тот же формат
  « ×N» — визуально строка лута и строка инвентаря НЕ МОГУТ разойтись.
  Строка строится document.createElement (как ВСЕ строки combat-ui:
  buildQuickRow :2700, renderBook) — прецеденты «строка того же стиля»
  за пределами вкладок: building-ui.js:207-220 (строки строительства),
  ui.js:828-835 (строка наёмника 000152).
* **Деградация**: неизвестный id / G.getItem отсутствует → строка
  ТЕКСТОВАЯ (name = id), без img, без краха (паттерн :2706
  `G.getItem ? G.getItem(itemId) : null`; console.error НЕ нужен — это не
  битый порядок загрузки, а защитная ветка: id'ы на практике всегда из
  каталога — пулы 000132/таблицы мобов).
* **Клик по строке лута — НЕТ** (read-only; ТЗ не требует). Узел —
  pointer-events: none (§2.3) → клик ПРОХОДИТ в баннер → finish()
  (bannerEl.onclick = finish, :572) — без pointer-events:none узел
  перекрывал бы кликабельную зону баннера.
* Teardown (ОБЕИХ точки, паттерн 000170 D5b «обе точки (finish/catch)»):
  finish() :2844 — `boxEl = null` в длинную цепочку `overlay = canvas = …
  = null`, `lootEl = null` рядом с `quickBox = null`; catch startCombat
  :3055 — то же. Оверлей снимается (overlay.remove()) — узел уходит с DOM.

### 2.3 CSS (index.html) — два новых правила, только скоуп .combat-overlay--combat

```
.combat-overlay--combat .combat-victory-loot {
  position: absolute;
  top: 50%; left: 50%;
  transform: translate(-50%, calc(50% + 28px));
  box-sizing: border-box;
  width: min(100vh - 32px, 100vw - 304px);
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 2px 8px;
  padding: 0 12px;
  pointer-events: none;
}
```
portrait-медиа (конец блока, ПОСЛЕ .combat-flee-confirm):
```
.combat-overlay--combat .combat-victory-loot {
  width: min(100vw - 16px, 100vh - 16px - 520px);
}
```
Обоснование:
* position: absolute — узел НЕ влияет на in-flow размер .combat-box
  (иначе центр 50% баннера сдвинулся бы — контракт layout 000124;
  canvas не сдвигается).
* top/left 50% + translate(-50%, calc(50% + 28px)) — лента центрирована по
  box (≡ центр canvas, конвенция 000124/000196/000210 — ВСЕ absolute-
  элементы боя центрируются так); верх ленты на 28px НИЖЕ центра:
  victory-баннер ВСЕГДА 2 строки 22px (≈53px → низ текста ≈26px ниже
  центра) — 28px прячет ленту под текстом. Визуальная константа —
  проверяется только в браузере (vm layout не считает).
* width = формула canvas `min(100vh - 32px, 100vw - 304px)` — конвенция:
  каждый absolute-элемент боя зеркалит геометрию canvas (banner/spellbook/
  flee-confirm несут ту же формулу + portrait-перебивку) — wrap-граница
  ленты = область canvas, детерминировано.
* flex/wrap/center — строки-чипы [иконка 22px + имя] центрированным
  рядом с переносом под текстом баннера (лут = 1..~5 строк — помещается).
* pointer-events: none — клик проходит в баннер → finish (§2.2).
* БЕЗ background — фон баннера rgba(10,12,16,0.85) ЗА узлом (узел —
  СИБЛИНГ ПОСЛЕ баннера в DOM → рисуется над его фоном); двойной фон
  не нужен. БЕЗ color/font — наследуется от базы .combat-overlay
  (color #e8dcc0, font 13px/1.5 ui-monospace, :240-248) — тот же стиль
  текста, что остальной боевой UI.
* Селекторы — ТОЧНО в начале строки (статический cssRule — первое
  вхождение; main-правило раньше portrait-медиа в файле → cssRule
  берёт main, portraitRule — медиа-тело).
* Новых script-тегов НЕТ → index-order не трогается. 000235.02 правит
  index.html в ДРУГИХ регионах (script-теги/HUD) — наш ханк :446/:613 —
  чистый ребейз.

## 3. Ленивые ссылки и guards (UMD-ловушка 000038)

* НОВЫХ модулей НЕТ — снапшоты не пересобираются. G.getItem в снапшоте
  combat-ui.js ЕСТЬ: items.js (index.html :1019) грузится ДО combat-ui.js
  (:1197) — порядок закреплён tests/index-order.test.js; и в статической
  цепочке loadCombatUi items.js перед combat-ui.js (tests/combat-ui.
  test.js :221). Чтение — ЛЕНИВО в момент вызова (renderVictoryLoot) с
  typeof-гардом, образец :2706.
* G.getItem в снапшоте ui.js/ui-tab-inventory.js ЕСТЬ (items.js выше —
  текущий код уже вызывает G.getItem в render'ах вкладок) — проводок нет.
* boxEl — closure-ссылка на ЛОКАЛЬНЫЙ box из build() (:308): присваивание
  `boxEl = box` в build(), обнуление в ОБЕИХ точках teardown (все DOM-refs
  обнуляются — паттерн 000170/000199 «обе точки»).
* Итерации: for-of по c.result.items (Array); .children Array-методами НЕ
  трогаем (контракт ui-panel-htmlcollection — узел строится appendChild'ом,
  чтение — querySelector/findByClass).

## 4. Тесты (RED-план: 6 красных + 2 зелёных гварда; expectedRedCount = 6)

Все — vm-e2e / статика; НОВЫХ файлов, модулей, require-путей, script-тегов
НЕТ; харнесы БЕЗ ПРАВОК (loadCombatUi/scene84/tickSlice, loadPanelUi/
openPanel, cssRule/portraitRule — все уже существуют). Краснота
ОСМЫСЛЕННАЯ (отсутствующий DOM-узел/img/правило), не SyntaxError/ENOENT.

### tests/combat-ui.test.js (scene84 + tickSlice; конец файла, блок «000237»)

Сцена победы с принудительным лутом (паттерн 000132-N2(в)): мутация
`mob.loot = […]` ЖИВО (поле читается в checkVictory live, ДО ролла) +
очередь c._rng + `G.combatInternals.dealDamageToMob(c, mob, 9999)`
(0 c._rng, c.result — синхронно) + tickSlice (rAF-tick → render).
Порядок c._rng в checkVictory ФИКСИРОВАН (000132-N5): gold-роллы
(1 на моба, порядок c.units: round(3 + 2·lvl + r·lvl)), затем на каждого
убитого: записи таблицы по порядку (1 ролл на запись), базовый ролл
(0.25); КОНЦОМ — 1 общий редкий (0.05 + 0.01·maxLvl, +1 на выбор при
попадании). Волк L1: xp = 8+4·1 = 12; таблица [{leather_armor, 0.1}].
Очередь — массив значений, при исчерпании fallback 0.99 (лут-роллы мимо;
gold уже потреблён первым).

* **237-CU-LOOT-1 (RED)** — 1 волк; mob.loot = [{item:'iron_ore',
  chance:1}, {item:'bread', chance:1}]; очередь [0.25, 0, 0, 0.99, 0.99]
  → gold round(5.25)=5, iron_ore+bread дропают, base/rare мимо; items
  [{iron_ore,1},{bread,1}] (deepEqual — пин ядра). После tickSlice:
  banner.style.display 'block', banner.textContent ===
  `'ПОБЕДА!\n+12 опыта, +5 золота'` (ТОЧНО — НОВЫЙ точный пин
  victory-текста; сейчас есть только includes 'ПОБЕДА' в CI-11);
  banner.children.length === 0 (узел лута баннер НЕ ТРОНУЛ); box.children
  === 5, className ['','combat-spellbook','combat-flee-confirm',
  'combat-banner','combat-victory-loot'] (структурный пин); узел лута
  виден (style.display !== 'none'), 2 строки .cp-itemrow: строка 0 —
  children[0] = img.cp-itemicon, img.src === 'assets/sprites/loot/
  iron_ore.svg' (=== G.getItem('iron_ore').icon), img.alt === '',
  children[1] = span.cp-itemname 'Железная руда'; строка 1 — img НЕТ
  (children[0] — cp-itemname 'Хлеб').
* **237-CU-LOOT-2 (RED)** — 2 волка (mobs ['wolf','wolf']), ОБА u.loot =
  [{item:'iron_ore', chance:1}]; очередь [0.25, 0.25, 0, 0.99, 0, 0.99,
  0.99] → gold 10, xp 24, items [{iron_ore, qty:2}] (слияние qty ядра
  000132) → ровно ОДНА строка: 'Железная руда ×2' + img первым.
* **237-CU-LOOT-3 (RED)** — 1 волк, СТАНДАРТНАЯ таблица (не мутирована),
  c._rng = () => 0.99 (gold 6; таблица 0.1/base 0.25/rare 0.06 — мимо) →
  items []; banner 'ПОБЕДА!\n+12 опыта, +6 золота' block; узел лута
  СУЩЕСТВУЕТ (селектор найден) и style.display === 'none' (буква ТЗ),
  строк .cp-itemrow в нём 0.
* **237-CU-LOOT-4 (зелёный гвард)** — паттерн CU210-YES-OK (:9041):
  кнопка flee → 'да' + c._rng 0.0 → 'fled'; banner 'Вы ушли из боя.'
  block; узла лута в DOM НЕТ (findByClass → null); box.children === 4.

### tests/ui-panel.test.js (loadPanelUi + openPanel; конец файла, блок «000237»)

CHAIN файла СОДЕРЖИТ ui-tabs.js/ui-tab-inventory.js/ui.js + items.js
(:264-275) — харнес не правится.

* **237-INV-1 (RED)** — c = G.createCharacter(); G.addItem(c,
  'iron_ore'); G.addItem(c, 'bread'); openPanel. Строка 'Железная руда'
  (_invBody): children[0] = img.cp-itemicon, img.src ===
  'assets/sprites/loot/iron_ore.svg' (=== G.getItem('iron_ore').icon),
  img.alt === ''; ОСТАЛЬНОЕ 0-diff: span.cp-itemname 'Железная руда',
  .cp-itemmeta '1.0 кг, 8 з', кнопки ['быстр.'], ['−1'] (реагент —
  без «исп.»/«надеть»), .cp-tip БЕЗ строки «Эффект» (реагент). Строка
  'Хлеб': img НЕТ (children[0] — cp-itemname), .cp-itemmeta '0.2 кг,
  2 з', кнопки ['исп.'], ['быстр.'], ['−1'], .cp-tip — как на master.
* **237-INV-2 (RED)** — G.addItem(c, 'iron_ore') + делегированный клик
  по кнопке 'быстр.' (паттерн файла: panel.listeners.click[0]({target:
  btn})) → inventory.quick[0]; G.equip(c, 'iron_sword'); openPanel.
  _quickBody строка 'Слот 1: Железная руда' — img.cp-itemicon первым
  (src из каталога); 'Слот 2/3: — пусто —' — img НЕТ, .cp-tip НЕТ
  (существующий контракт пустых строк). _equipBody строка 'Железный
  меч' (оружие — icon в каталоге НЕТ): img НЕТ (деградация, единый
  механизм), ОСТАЛЬНОЕ 0-diff (meta 'урон 5', кнопка 'снять', .cp-tip).
* **237-INV-G (зелёный гвард)** — 4-аргументный itemRow: для строк
  предметов БЕЗ иконки (Хлеб) и пустых строк children[0].className ===
  'cp-itemname', img среди детей НЕТ (0 diff существующих вызовов).

### tests/combat-layout.test.js (статика CSS; конец файла)

* **237-CSS (RED)** — cssRule('.combat-overlay--combat
  .combat-victory-loot'): position 'absolute', pointer-events 'none',
  width 'min(100vh - 32px, 100vw - 304px)', display 'flex', transform
  'translate(-50%, calc(50% + 28px))'; portraitRule(тот же селектор):
  width 'min(100vw - 16px, 100vh - 16px - 520px)'. Стражи базовых
  правил (.cp-itemicon 22px — build-menu-layout.test.js:69,
  .combat-banner — combat-layout.test.js :152-169) — существуют, не
  дублируются.

### Верификация RED и регрессия

1. Красная фаза: ТОЛЬКО тесты (§4), src/ не трогать. Быстрый срез:
   `node --test tests/combat-ui.test.js tests/ui-panel.test.js
   tests/combat-layout.test.js` → падают ТОЛЬКО 6 новых 237-* (CU-LOOT-
   1/2/3, INV-1/2, CSS). Полный `node --test tests/` → только 6 новых
   (+ known-флейк map.test.js:1943 под нагрузкой — перепуск solo
   `node --test tests/map.test.js` и запись в отчёт).
2. Зелёная: реализация по §1-§3 → тот же срез 0 падений; полный прогон
   зелёный (2714 + 8 новых).
3. Существующие пины — зелёные БЕЗ ПРАВОК (единственный задеванный
   структурный пин CU196-POS спасён ленивой сборкой, D2).

## 5. Что важно будущим задачам (из ТЗ-ссылок и зон)

* 000097 (itemRow/itemTipText — ядро строк): ядро получило 5-й аргумент —
  добавляя строки в НОВЫЕ вкладки, иконку передавать 5-м аргументом по
  правилу §2.1 (guard, деградация).
* 000152 (иконка первым ребёнком строки): паттерн — src/ui.js:829-833;
  000237 расширил его на ядро itemRow и на боевой оверлей.
* 000132 (лут победы): c.result.items = [{id, qty}] (слияние qty, порядок
  первого появления, может быть пустым); 'fled'/'dead' — поля items НЕТ.
  UI data-driven от каталога (G.getItem + it.icon) — расширение поля
  (000230.05 редкость лута, новые пулы) переживётся БЕЗ правок UI.
* 000195/000194/000149 (контракты render'а combat-ui): новый узел
  добавлен ПОСЛЕ блока баннера, guard'ится closure-флагом (паттерн
  bookBox/bookSig), teardown в ОБЕИХ точках — новые элементы боя обязаны
  следовать тем же правилам (обе точки, guard в render, нет DOM-мутаций
  до build()).
* sprites.js lootSprite (:856-872) — конвенция loot/<id>.svg ТОЛЬКО для
  карты; UI-иконки — ТОЛЬКО явное it.icon каталога.
* **Зоны для будущих мержей**: ui.js/ui-tab-inventory.js/index.html
  общие с 000230.07 (UI экипировки, будущая) — 000237 МЕНЬШЕ — мержить
  РАНЬШЕ .07 (ТЗ). 000235.02 — index.html script-теги/HUD (разные
  регионы). 000230.02 (P0, идёт) — модель экипировки 11 слотов: при
  ребае 5-й аргумент icon на переписанных строках «Снаряжение» —
  повторное применение (жёсткой зависимости НЕТ).
* Волны 000230.08–.15 (иконки экипировки, assets/sprites/items/):
  строки «Снаряжение»/инвентаря/лута data-driven — иконки появятся
  автоматически, код 000237 не правится.

## 6. Подводные камни

1. **bannerEl.textContent = … стирает ВСЕХ детей баннера** — узел лута
   СИБЛИНГ, а не ребёнок, баннера (D1/D2). Проверять при любых будущих
   правках баннера.
2. **Ленивая сборка в render()** — не раньше build() (CU196-POS: 4
   ребёнка без c.result) и не «только при непустых items» (ТЗ-буква:
   victory+пусто → узел ЕСТЬ, display none). Guard `if (lootEl) return`
   — сборка ровно ОДИН раз за бой.
3. **vm-стаб**: innerHTML='' НЕ чистит children (ловушка renderQuickList)
   — наш узел НОВЫХ строк после сборки НЕ ДОБАВЛЯЕТ (нет перестроения) —
   хвост-дублей не будет; makeEl img — обычный объект (src/alt/className/
   style — записи); querySelector в стабе НЕТ — ассерты через children/
   findByClass.
4. **render() — каждый кадр** (до c.result, после, после finish'а-
   мутаций) — renderVictoryLoot идемпотентен и нулевой стоимости
   (один guard).
5. **Две точки teardown** (finish :2844, catch :3055) — boxEl/lootEl
   обнулять в ОБЕИХ (паттерн 000170 D5b); забытая ссылка = живой DOM-
   фрагмент между боями.
6. **pointer-events: none ОБЯЗАТЕЛЕН** — иначе лента блокирует клик по
   баннеру (finish) на своей площади.
7. **CSS-порядок**: main-правило ДО portrait-медиа в файле (cssRule —
   первое вхождение); portrait-правило — КОНЦОМ медиаблока (каскад:
   перебивает width). Селектор — в начале строки (regex cssRule).
8. **Флейк map.test.js:1943** (тайм-бюджет 160k tileAt) — known, solo
   перепуск + запись в отчёт (базовая линия a3).
9. **Один worktree = один полный node --test** (память: 000054 мутирует
   src/npc-data.js) — параллельных полных прогонов не запускать.
10. **Фолбэк loot/<id>.svg в UI — НЕ ДЕЛАТЬ** (ТЗ-ограничение):
    неизвестный id → текстовая строка (name = id), битый img
    недопустим.

## 7. CHANGELOG (отдельный коммит, дата = дата мержа)

Раздел `## 2026-10-20`, подраздел «### Графика» (формат — по
существующим записям; программная часть не перечисляется): при победе в
бою под баннером «ПОБЕДА!» теперь показаны выпавшие предметы (иконка +
название + количество), а предметы с иконками в каталоге получили
иконки 22×22 в панели персонажа — вкладки «Инвентарь», «Снаряжение» и
«Быстрые слоты».

## 8. Решения Проектирования (openQuestions a1/a2/a3 — зафиксированы)

* **D1. Класс узла — `.combat-victory-loot`** — конвенция `.combat-*`;
  «victory» документирует единственный видимый исход; не «banner-»
  (сИБЛИНГ, а не ребёнок), не «.combat-loot» (домен карты/lootSprite).
* **D2. ЛЕНИВАЯ сборка узла — на первом victory-render, НЕ в build()** —
  буква ТЗ ('fled'/'dead' → узла нет; пусто → display none) + 0 ре-пинов
  существующих тестов (CU196-POS цёл) + паттерн renderBook/renderQuickList
  (строки в render, кэш — closure-флаг). Цена — closure-ref boxEl (box в
  build() локален).
* **D3. Строки лута — self-contained в combat-ui.js (вариант б a3), НЕ
  itemRow через Game-уровень (вариант а)** — прецеденты кодовой базы для
  «строки того же стиля» за пределами вкладок — ручные cp-itemrow
  (building-ui.js:207-220, ui.js:828-835); ВСЕ строки combat-ui —
  document.createElement; itemRow остаётся механизмом вкладок (000130);
  вариант (а) добавлял бы API-поверхность (G.itemRow), которой ТЗ не
  требует («не больше и не меньше»), + additive-опцию харнеса
  loadCombatUi (a3 §5) — при (б) ни один харнес не правится; «один общий
  механизм» выполнен структурно (те же классы/22px/источник иконки/
  « ×N» — визуальный дрейф невозможен).
* **D4. itemRow 5-й аргумент + guard-иконки в 4 строках
  ui-tab-inventory.js; магазин НЕ ТРОГАЕТСЯ** — ТЗ п.1/п.2 дословно;
  guard building-ui.js:211-215; legacy без icon → null → 0 diff.
  Комментарий 000097/000130 над itemRow — не трогать (а1; CLAUDE.md).
* **D5. CSS — ДВА правила (скоуп + portrait-width), absolute под
  центрированным баннером (28px), pointer-events:none, без фона/цветов
  (фон баннера за узлом; текст наследует базу .combat-overlay)** —
  TZ п.4 «только если нужно» — нужно (in-flow сдвинул бы центр
  000124); конвенция зеркалирования формулы canvas; клик — в finish.
* **D6. renderVictoryLoot — guard-функция ПОСЛЕ блока баннера в render();
  display: пусто → inline 'none', непусто → CSS flex (inline не
  ставится); без сигнатур/innerHTML (перестроений нет)** — c.result
  иммутабелен → строк строится один раз; vm-ловушка innerHTML не
  задевается.
* **D7. Teardown — boxEl/lootEl в ОБЕИХ точках (finish :2844 + catch
  :3055)** — паттерн «обе точки» 000170/000199/000227.
* **D8. Тесты — 6 красных + 2 гварда (expectedRedCount = 6):
  CU-LOOT-1/2/3 (combat-ui.test.js), INV-1/2 (ui-panel.test.js),
  CSS (combat-layout.test.js) + гварды CU-LOOT-4/INV-G; точные
  RNG-очереди — §4** — а3-план (5) + статический CSS-пин (a2 T8).
  INV-тесты — в ui-panel.test.js (канонический файл панельных строк,
  CHAIN уже содержит всё; отклонены сцены combat-inventory-panel —
  тот же механизм, избыточно — и full-chain city-inventory-e2e —
  тяжелее, тот же механизм).

## 9. Finalize (2026-10-20) — статус ЗАКРЫТО

Статус (заменяет строку «дизайн зафиксирован» в шапке): реализовано,
ревью пройдено, задача перенесена в done. Коммиты ветки task/000237
(база 3c66d33): 1605016 (красные тесты + этот файл), 1967105
(реализация), 223f457 (CHANGELOG — entry `## 2026-10-20` «Графика»;
правка даты 00019→00020 — 5aa705a), 5aa705a (правки по итогам ревью),
коммит finalize (отчёт tasks/result/000237.md + этот раздел + git mv в
done). Тесты на finalize: **2722/2722 green, 0 fail** (база 2714 + 8
новых; known-флейк map.test.js:1943 на финальном прогоне не
воспроизвёлся). Существующие тесты — БЕЗ ПРАВОК (0 семантических
ре-пинов).

Master к моменту finalize УШЁЛ с базы 3c66d33 на 3 коммита (ребейз —
на стадии мержа; полный анализ — tasks/result/000237.md
«Подводные камни»):
* **000235.02 (2e21b19)** — index.html: script-тег spellbook-oc.js +
  HUD (регионы ~:190/:795/:976-1086) + CHANGELOG entry `## 2026-10-19`.
  Наши ханки (CSS ~:446/:631) — ДРУГИЕ регионы → чистый ребейз
  ожидается; **CHANGELOG.md — конфликт ОЖИДАЕМЫЙ** (оба вставки в
  шапку) → решение: обе записи, по убыванию даты (наша 2026-10-20
  выше их 2026-10-19).
* **000230.05 (333703a)** — src/combat.js rollVictoryLoot: +ролл
  редкости экипировки ПОСЛЕ редкого ролла, НО EQUIP_POOLS ПУСТ (все 5
  тиров []) → 0 доп. вызовов c._rng, бит-в-бит (их пин N2/EQ4) →
  наши queue-пины 237-CU-LOOT-1/2/3 валидны. Контентные волны
  000230.08–.15 наполнят пулы → +rng на победу; ТА задачу волн
  обновит очереди (не наш ребейз).
* **000230.02 (ffc4b15)** — src/items.js: 18 физ. слотов + зеркала
  weapon/armor (syncEquipmentMirrors; unequip-алиасы 'weapon'/'armor' —
  «старые UI-кнопки и пины работают без изменений») → контракт
  237-INV-2 (G.equip('iron_sword') → eq.weapon → строка «Снаряжения»)
  сохранён; ui-tab-inventory.js ими НЕ тронут.
* tests/index-order.test.js расширен ими (script-пин) — мы его не
  трогаем (новых script-тегов нет).

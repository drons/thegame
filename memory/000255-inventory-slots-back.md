# 000255 — Слоты инвентаря растут с «Крепкой спиной»: +2 за уровень

Задача: вместимость инвентаря = функция героя. База c694320 (master),
ветка task/000255. ТЗ: tasks/pending/000255.md (координаты ТЗ сняты на
7c1619d — все перепривязаны на c694320; drift: checkAdd :656/:659 →
:661/:664, slotCount :621 → :626, main.js :948-949 → :988-989,
spec/items.md :127 → :168, B27 «:8286-8294» → :8465-8540).

## 1. Формула и решения (проектирование)

- **`inventorySlots = 20 + 2·S('back')`** — flat, целое, в `derived()`
  (src/sheet.js, секция «Карта мира и приключения», СРАЗУ ПОСЛЕ
  `carryWeightMult: 1 + pct('back'),` :496). Почему: ТЗ дословно
  («целочисленность обязательна: дробных слотов не существует»);
  `S(id) = sheet.secondary[id] || 0` — целое 0..100.
- **Affix-компонент ОТКЛОНЁН** (ТЗ допускал подтвердить/отклонить):
  `pct('back') = 0.1·S·(1+affix)` — дробный при 'back'-аффиксе кольца
  (tests/items.test.js:4497-4620) → нарушает целочисленность. Прецедент
  flat-полей, НЕ affix-масштабируемых: moveCells/attackActions/
  spellActions*/`armor = S('golem')` (memory/000230.03-affixes-
  derived-free-cast.md §2.2). 'back'-аффикс кольца НЕ меняет слоты —
  только вес (независимые два эффекта навыка, ТЗ).
- **Капа НЕТ**: back=100 → 220 слотов принимается как есть (ТЗ: кап —
  только отдельное решение пользователя).
- **Имя поля derived — `inventorySlots`** (ТЗ-предложение): коллизий
  НЕТ (grep src/+tests/+spec/ — нуль вхождений до правки).
- **База 20 — ОДИН источник правды: `INVENTORY_SLOTS` (src/items.js:120)**.
  sheet.js литерал НЕ дублирует: новый внутренний хелпер
  `baseInventorySlots()` рядом с `affixSkillsFor` (:84-102) читает
  `api.INVENTORY_SLOTS` через СУЩЕСТВУЮЩИЙ ленивый канал (node —
  `itemsThunk()` = `require('./items.js')` — UMD-хвост sheet.js уже
  передаёт; browser — `rootRef.Game`; общий кэш `itemsApi`, тот же
  try/catch). Fallback — литерал 20 (деградация, 000053). Пин
  консистентности в красном D1: `derived(база-герой).inventorySlots ===
  I.INVENTORY_SLOTS`.
- **Имя хелпера ёмкости — `inventoryCapacity(c)`** (items.js, рядом с
  `maxCarryWeight` :614-623). Отклонено `maxInventorySlots` (a1):
  «max»-префикс намекает на кап (капа нет); «ёмкость» — термин ТЗ.
- **Санитайзер: новый ОПЦИОНАЛЬНЫЙ 2-й аргумент** `sanitizeInventory
  (inv, maxSlots)` (см. §2). Почему параметр, а не вывод из героя:
  `sanitizeInventory` — чистая функция каталога (items.js не знает
  sheet'а на входе; прецедент — вызов из main.js с hero).
- **SPEC-правки — line-neutral (ОДНА строка на строку)**, оба файла:
  items.md остаётся 225 строк (счёт split('\n') без trailing-\n,
  spec-split R7), skills.md — 100 → **tests/spec-split.test.js НЕ
  правится** (протокол 000159 §5.1: репин только при смене числа строк).

## 2. Контракты и границы

### src/sheet.js
- `derived()` :456 — новое flat-поле в base-объекте после
  `carryWeightMult` (:496): `inventorySlots: baseInventorySlots() +
  2 * S('back')`. ctx.modifier-хуки (mercModifier companions.js:667-677,
  efir EFIR_DERIVED_CTX) — `Object.assign({}, base, …)` → поле
  унаследовывается автоматически (контракт полного объекта 000143/144).
- player.js — БЕЗ ИЗМЕНЕНИЙ (derived = реэкспорт sheet.derived :195).
- player.js `sanitizeSavedHero` — вторичные навыки: известное id +
  целое >= 0 (back проходит) — ядро сейва не меняется.

### src/items.js
- `inventoryCapacity(c)` — экспорт; resolve владельца ДОСЛОВНО
  maxCarryWeight (000230.18):
  `owner = (c && c.carryOwner && typeof c.carryOwner === 'object' &&
  !Array.isArray(c.carryOwner)) ? c.carryOwner : c` — инвентарь ОБЩИЙ
  (allyView companions.js:1048-1057 носит carryOwner: hero) → ёмкость
  считаем от «Крепкой спины» ГЕРОЯ. Затем
  `d = (typeof P.derived === 'function') ? P.derived(owner) : null`;
  возврат `(d && Number.isInteger(d.inventorySlots) &&
  d.inventorySlots >= 0) ? d.inventorySlots : INVENTORY_SLOTS`.
  Деградация (нет каталога/derived в песочнице) → 20 = СТАРОЕ
  поведение, игра не падает (000053). Жёсткой зависимости на P.derived
  НЕТ (guard) — в отличие от maxCarryWeight (там P.derived уже
  обязательный путь).
- `checkAdd(c, it, qty, st)` :650-666 — в начале `const cap =
  inventoryCapacity(c);`; обе ветки отказа: :661 (stackable:
  `inv.slots.length + newSlots > cap`) и :664 (non-stackable:
  `inv.slots.length + qty > cap`). **Строка отказа БЕЗ ИЗМЕНЕНИЙ —
  «нет свободных слотов инвентаря»** (байт-в-байт; пинят
  companions D2s/W3/failsafe, city-storage:1046, quick-panel/quick-slot,
  craft-core, building-effects B27, npc, quest).
- `sanitizeInventory(inv, maxSlots)` :504-537 — сигнатура + опциональный
  2-й аргумент: `const cap = (Number.isInteger(maxSlots) &&
  maxSlots >= 0) ? maxSlots : INVENTORY_SLOTS;` кап :523 →
  `out.slots.length < cap`. **ДЕФОЛТ = INVENTORY_SLOTS** — держит
  одноаргументные пины items.test.js:558-563 и craft-core.test.js:
  1211-1245 (инвариант: семантических правок существующих тестов нет).
  JSDoc (:490-502): «слотов не больше INVENTORY_SLOTS» → «слотов не
  больше вместимости (по умолчанию INVENTORY_SLOTS; caller —
  restoreFromSave — передаёт ёмкость героя)».
- Экспорт (:1731-1759): `+ inventoryCapacity` (рядом с
  maxCarryWeight/slotCount). `INVENTORY_SLOTS` остаётся экспортом
  (база 20: тесты, UI не используют его больше в строках, но экспорт
  не ломаем).
- НЕ ТРОГАТЬ: QUICK_SLOTS=3, MAX_STACK=99, BASE_CARRY_WEIGHT/вес
  (carryWeightMult — независимый эффект навыка), slotCount, каталоги.

### src/main.js
- `restoreFromSave` :988-989:
  `hero.inventory = G.sanitizeInventory
    ? G.sanitizeInventory(d.hero.inventory,
        G.inventoryCapacity ? G.inventoryCapacity(hero) : undefined)
    : G.createInventory();`
  Момент вызова: `Object.assign(hero, clean)` уже выполнен (:987) →
  hero.secondary.back восстановлен (sanitizeSavedHero) → derived
  работает. G — снапшот const globalThis.Game (:16), main.js —
  ПОСЛЕДНИЙ скрипт → экспорт items.js в снапшоте. = ЗАКРЫТИЕ
  sanitize-бага ТЗ: герой с back>0 и >20 слотами больше НЕ отсёкается
  до 20 при загрузке сейва.

### UI
- `src/ui-tab-inventory.js:118` (пустой инвентарь; c = ctx.character
  в скоупе :106): `'пусто (' + G.INVENTORY_SLOTS + ' слотов)'` →
  `'пусто (' + G.inventoryCapacity(c) + ' слотов)'` — СТРУКТУРА
  МАСТЕРА СОХРАНЕНА: `panel._invBody.textContent = ''` +
  `appendChild(ctx.el('div', 'cp-itemmeta', …))` (стиль серый 11px,
  index.html:101; мастер-паттерн плейсхолдеров). Ревью 2026-10-25
  (3×minor): первая правка подсовывала текст в `_invBody.textContent`
  (голый текстовый узел) — продакшн подогнан под ограничение DOM-стаба
  (textContent стаба не агрегирует текст дочерних узлов) — визуальная
  регрессия сверх ТЗ; фикс: дочерник вернули, U1 наблюдает дочерник —
  `findAll(_invBody, '.cp-itemmeta')[0].textContent` (реальный DOM
  агрегирует текст детей — стаб-ограничение ушло в сторону теста).
  Склонение
  «слотов» ВСЕГДА верно: ёмкость всегда чётная (20, 22, 24, …) →
  род. мн. **Решение по non-hero**: c = ЛЮБОЙ активный персонаж (ТЗ
  буквально: «Все проверки вместимости и строки UI должны читать новую
  вместимость»); у merc/efir инвентарь-объекта в игре нет (общий —
  через carryOwner) → значение чисто визуальный плейсхолдер
  (20+2·back самого merc). Отклонён gate «только герой» —
  консервативнее, но против буквального ТЗ.
- `src/ui-tab-skills.js:549` (hero-ветка; `d = G.derived(c)` уже
  посчитан :543 и используется в той же строке — d.maxHP):
  `Слоты: ${G.slotCount(c)}/${G.INVENTORY_SLOTS}` →
  `Слоты: ${G.slotCount(c)}/${d.inventorySlots}`. 4-строчный hero-
  шаблон .cp-stats ПОБАЙТОВО пинится существующими тестами (коммент
  :532-537) — при back=0 значение 20 НЕСМЕНИМО → вывод бит-в-бит;
  литерал «Слоты:» в тестах НЕ зашит (grep-аудит).

### SPEC (wording-пины, протокол 000218; В ТОМ ЖЕ коммите что и тесты)
- **spec/items.md:168** (раздел «## Инвентарь» :167) — ОДНА строка,
  line-neutral:
  - ДО: ` * Инвентарь — INVENTORY_SLOTS (20) слотов. Складываемые предметы`
  - ПОСЛЕ (дословно):
    ` * Инвентарь — (20 + 2 × уровень «Крепкая спина») слотов; база — INVENTORY_SLOTS (20). Складываемые предметы`
  - знак «×» U+00D7 — единообразие со строкой ВЕСА :172 («30 кг ×
    множитель «Крепкая спина»») — та строка НЕ ТРОГАЕТСЯ (два
    независимых эффекта навыка).
- **spec/skills.md:43** (H2 «## Вторичные навыки» → H3 «### Сила»,
  строка таблицы) — ОДНА строка, line-neutral:
  - ДО: ` | Крепкая спина | +10% к максимальному весу | Карта |`
  - ПОСЛЕ (дословно):
    ` | Крепкая спина | +10% к максимальному весу, +2 слота инвентаря за уровень | Карта |`
- Уникальность токенов (проверено grep): «INVENTORY_SLOTS» в items.md —
  ровно 1 вхождение (:168); строка skills.md — ровно 1; «Крепкая
  спина» в items.md — только :172 (вес).

### НОЛЬ новых модулей/ассетов/CSS/script-тегов
- index.html — БЕЗ правок → tests/index-order.test.js зелёный;
  svg.test.js не требуется (SVG нет); каталог skills (assets/skills/
  000011.json desc «+10% к максимальному весу за уровень»,
  src/skills-data.js:131-140) — НЕ ТРОГАТЬ (asset-freeze ТЗ).

## 3. Тесты

### Красные (НОВЫЕ файлы; expectedRedCount = 7)
- **tests/inventory-slots-000255.test.js** (5 красных; имя по
  конвенции `<фича>-<задача>` — паттерн quick-panel-000223/
  tooltip-flip-000262). Почему НОВЫЙ файл, а не items.test.js:
  items.test.js — горячая зона волн 000230.12–.15 (ТЗ: «Не смешивать
  с волнами 000230.12–.15 (items.test.js, items-data.js)»).
  - **D1** (node: require sheet.js + player.js + items.js):
    `derived(h).inventorySlots` — back=0 → 20; back=5 → 30;
    back=100 → 220; `Number.isInteger`; pin-консистентность базы:
    back=0 → `=== I.INVENTORY_SLOTS`. Красный: поле undefined.
  - **A1** (node: items.js, герой = player.createCharacter()):
    back=0: 20×wood_sword → 21-й `{ok:false, reason:'нет свободных
    слотов инвентаря'}`; back=1 (ёмкость 22): 21-й `{ok:true}`,
    23-й — отказ. Красный: back=1 → 21-й отклоняется (checkAdd читает
    константу).
  - **S1** (node: items.js): 25 УНИКАЛЬНЫХ нескладываемых слотов
    (weapon/armor из allItems, filter по kind не в
    [potion, food, skill_book, reagent]) + quick=null:
    `I.sanitizeInventory(inv, 26)` → 25 слотов (26 = 20+2·3 — ёмкость
    героя back=3); регрессия: одноаргументный → кап 20 (пин items
    :558). Красный: 2-й аргумент игнорируется → 20.
  - **S2** (vm, ПОЛНАЯ ЦЕПОЧКА index.html, паттерн tests/save-restore.
    test.js: makeGl/makeContext2d/makeEl/makeStorage/seedSave/
    bootSandbox/drain/boot — дублируются в файл; localStorage-мок с
    досеянным сейвом): hero-ядро по sanitizeSavedHero (level/xp/
    gold/hp + primary все шесть >= 1) + `secondary: { back: 3 }` +
    `inventory: { slots: 25×{id, qty:1} (некладываемые), quick:
    [null,null,null] }` → `boot(seedSave({day: 2, hero: …}))` →
    `h.sandbox.__game.state.hero.inventory.length === 25`
    (state.hero.inventory — МIRROR-массив slots, main.js:~3992).
    Красный: main.js:988 вызывает sanitizeInventory БЕЗ ёмкости →
    25 отсечены до 20.
  - **U1** (vm, ДИНАМИЧЕСКИЙ CHAIN index.html до ui.js включительно —
    паттерн tests/ui.test.js:162-168 / ui-tab-skills-active): герой
    `G.createCharacter()`, `hero.secondary.back = 1`,
    `__game.state = {efir, efirMet: true, roster:[Вольк-merc]}`
    (инжект ДО toggle — паттерн makePartyEnv:422-448),
    `G.playerUI.setCharacter(hero); G.playerUI.toggle(true)` →
    ВСЕ tab-panes строятся ПЕРЕД (makeColumn ui.js:92 —
    `t.build(pane)` на каждую вкладку) и рендерятся (ui.js:775) →
    `panel._stats.textContent` contains `Слоты: 0/22` И
    `panel._invBody.textContent === 'пусто (22 слотов)'`. Красный:
    UI читает G.INVENTORY_SLOTS → `0/20` / `(20 слотов)`.
- **tests/spec-000255-wording.test.js** (2 красных; имя задано ТЗ;
  паттерн tests/spec-000230.03.01-wording.test.js — 2× readFileSync
  ОТДЕЛЬНО, хелперы esc/h2/norm 1:1 из tests/spec-combat-wording.
  test.js:41-66; h1 НЕ нужен — срезы H2-уровня; norm() ОБЯЗАТЕЛЕН
  (SPEC переносит ~64-70 кол.); в файле НЕТ литерала «SPEC» +
  «453» (SPEC-453-GONE сканит tests/+src/ — spec-split.test.js:
  288-306)):
  - **W1** — spec/items.md, срез H2 «Инвентарь»: ПОЗИТИВ
    `norm`-включение `(20 + 2 × уровень «Крепкая спина») слотов`;
    НЕГАТИВ `Инвентарь — INVENTORY_SLOTS (20) слотов` (1 вхождение →
    0); КОНТРОЛЬ (зелёный всегда): строка веса на месте —
    `базовый переносимый вес (30 кг) × множитель «Крепкая спина»`
    (вес не смешался со слотами).
  - **W2** — spec/skills.md (file-wide includes — строка таблицы
    уникальна, H3-среза в хелперах нет): ПОЗИТИВ `+10% к
    максимальному весу, +2 слота инвентаря за уровень`; НЕГАТИВ
    `+10% к максимальному весу | Карта` (1 → 0).
- Все красноты осмысленные ERR_ASSERTION (отсутствующее ПОЛЕ/
  ПАРАМЕТР/ТЕКСТ/значение — не синтаксис: все файлы существуют и
  читаются).

### Зелёный наблюдение-тест (ревью 2026-10-25)
- **AFF** (node, тот же файл): 'back'-аффикс кольца НЕ масштабирует
  `inventorySlots` — flat-решение зафиксировано против будущей
  правки, переделающей формулу через pct. Реальный каталог-предмет:
  `bone_ring` (ring, slot 'ring', affix back +3%) — vm-цепочка с
  каталогом-заменой (рецепт 000230.18 E2) НЕ нужна. Пины: back=5 +
  bone_ring надето → `derived.inventorySlots === 30` (= 20 + 2·5,
  аффикс не меняет), `Number.isInteger`; контроль — тот же аффикс
  масштабирует ВЕС: `carryWeightMult === 1 + 0.1·5·1.03` (bit-exact:
  порядок операций совпадает с pct() sheet.js; `(1+0.03) === 1.03`).

### РЕ-ПИНЫ (технические, в том же коммите что и fix; зелёные стадией)
1. **tests/npc.test.js:443-457** (в ТЗ) — «Полный инвентарь»:
   `c3.secondary.back = 10` (60 кг) → ёмкость 40. Старый цикл
   «уникальные предметы до I.INVENTORY_SLOTS» (20) больше НЕ полный →
   npcBuy УСПЕШЕН → ломается. Фикс (рецепт D2s, memory/000241 §4):
   `while (I.slotCount(c3) < I.inventoryCapacity(c3))
   I.addItem(c3, 'wood_sword', 1)` → 40×1 кг = 40 кг ≤ 60 (слотовая
   ветка checkAdd гарантированно ДО весовой);
   `assert.equal(I.slotCount(c3), I.inventoryCapacity(c3))` (40).
   npcBuy('moonstone') → 41 > 40 → тот же отказ. Ассерты
   npcBuy/сток/золото — без изменений.
2. **tests/building-effects.test.js:~1744-1778 (A51 «Атомарность
   предметов») — НЕ В СПИСКЕ РЕ-ПИНОВ ТЗ (найдено анализом, delta)**:
   `heroFull = mkHero({secondary: {back: 50}})` → ёмкость 120.
   Старое заполнение до 20 → НЕ полный → reward moonstone добавится →
   квест выполнится (rFull.ok true) → тест ждёт
   `{ok:false, reason:'инвентарь полон'}` → ломается. Фикс тем же
   рецептом: wood_sword × 120 (120 кг ≤ 180 = 30·(1+0.1·50));
   устаревший комментарий :1746-1748 («заполнить все 20 слотов
   уникальными предметами») → обновить на ёмкость 120 / рецепт
   wood_sword. Ассерты отказа квеста — без изменений.
3. **tests/spec-split.test.js — НЕ ПРАВИТСЯ** (SPEC-правки
   line-neutral: items.md 225, skills.md 100 — без изменений).

### Проверено — зелёные БЕЗ ИЗМЕНЕНИЙ (back=0 → ёмкость 20 = база)
items.test.js:172-175/183-200/558-563/4499-4640 (000230.18 E2/E2b —
вес-гейт, ≤3 слотов, back=2 → 24 не достигается); sheet.test.js
SH-5/D1-D4 (полевые пины, НЕТ deepEqual по объекту — новое поле не
ломает); companions D2s :1703-1733 / W3 :1949-1965 / failsafe
:1495-1525; city-storage :838-840 / :1025-1060; craft-core :593-665 /
:1211-1245; quick-panel-000223 :296-305/:372/:387; quick-slot-000223
:27-31/:112-133; building-effects B27-колодец :8465-8540 (hero
{thief:4}, back=0, литерал 20 = ёмкость — валиден); loot-e2e:439
(весовой гейт — не трогать); ui-panel-htmlcollection (подстроковые
пины «Уровень 1»/«Золото:»; «Слоты:» не зашит). grep-аудит: все
`INVENTORY_SLOTS` в tests/ (4 файла) + все герои back>0 (npc:447,
building-effects:1751, items:194/4536/4598) — других точек НЕТ.

## 4. Ленивые ссылки и guards

- **sheet.js → items.js**: СУЩЕСТВУЮЩИЙ канал (000230.03) — `itemsApi`
  (кэш) через `itemsThunk` (node: UMD-хвост sheet.js передаёт
  `() => require('./items.js')`) / `rootRef.Game` (browser, вызов в
  МОМЕНТ derived() — runtime, цепочка к тому моменту загружена:
  index.html — sheet.js :1202 → player.js :1203 → items.js :1213).
  Новый хелпер `baseInventorySlots()` — тот же кэш `itemsApi` (общий
  с affixSkillsFor), тот же try/catch → `Number.isInteger(api.
  INVENTORY_SLOTS) && > 0 ? api.INVENTORY_SLOTS : 20`.
- **items.js → player.js (derived)**: `P.derived` уже в use в
  maxCarryWeight (P = require('./player.js') node / G0-снапшот
  browser). `inventoryCapacity` — guard `typeof P.derived ===
  'function'` + Number.isInteger — деградация → INVENTORY_SLOTS.
- **main.js**: G — ОДИН снапшот globalThis.Game (:16), main.js
  последний скрипт → `G.inventoryCapacity` всегда в снапшоте (тернарный
  guard — стилистически, как G.sanitizeInventory).
- **Порядок загрузки (UMD-ловушка 000038)**: все правки в СУЩЕСТВУЮЩИХ
  модулях; новых script-тегов/снапшотов нет; все vm-цепочки уже
  грузят sheet.js → player.js → items.js → … → ui.js → main.js.

## 5. Сейв

- Миграции НЕ БУДЕТ (ТЗ подтверждено): вместимость НЕ пишется в сейв —
  выводится из hero.secondary.back (в hero, main.js:723). Старые сейвы
  (≤20 слотов) читаются: лимит на restore только РАСТЁТ. Версия v1
  не меняется; save.test.js/save-restore.test.js — без правок.

## 6. Подводные камни (будущим задачам)

1. **ЛОВАУШКА moonstone в ре-пинах**: награда обелиска / покупка NPC —
   stackable reagent `moonstone` (idx 22 allItems). Наивное «заполнить
   до N уникальными» ВКЛЮЧАЕТ его → grant/buy сложится в стопку →
   ожидание отказа ломается ТИХО (ok:true). Рецепт заполнения —
   НЕскладываемое wood_sword (1 кг) × ёмкость; слотовая ветка checkAdd
   гарантированно ДО весовой (40×1 ≤ 60; 120×1 ≤ 180).
2. **Обелиск-репин (A51 building-effects) ОПУЩЕН в ТЗ** — без него
   полный набор НЕ зелёный.
3. **Опциональность 2-го аргумента sanitizeInventory ОБЯЗАТЕЛЬНА**
   (default INVENTORY_SLOTS) — семантических правок существующих
   тестов нет (инвариант).
4. **Non-hero «пусто (N слотов)»**: merc с back>0 — плейсхолдер
   20→20+2·back (визуально; инвентарь у них объективно нет — общий
   через carryOwner). Если будущая задача введёт у merc свой
   инвентарь — пересмотреть решение §2 UI.
5. **Ассеты заморожены ТЗ**: desc assets/skills/000011.json
   («+10% к максимальному весу за уровень») и src/skills-data.js НЕ
   правятся → в-игровой tooltip навыка НЕ упоминает слоты, а
   spec/skills.md — упоминает. Расхождение осознанное (asset-freeze
   ТЗ) — материал для ретро/фоллоу-задачи.
6. **Rebase перед мержем ОБЯЗАТЕЛЕН** (master движется): волны
   000230.12–.15 (spec/items.md, items-data.js, items.test.js),
   000235.10/000260/000263/000264 (building-effects.test.js, main.js),
   000260 (sheet.js derived-регион, соседние строки base).
   Резолв-семантика: «заполнение до фактической ёмкости» / «ёмкость
   из героя» / «сохранить формулу слотов» (spec).
7. **Фулл-тесты**: один полный `node --test tests/` в worktree за раз
   (memory: no-parallel-full-tests-in-worktree); базовая линия
   c694320 — 3242 pass / 0 fail (измерено).

## 7. CHANGELOG

Отдельный коммит «Задача 000255: CHANGELOG — …», раздел «##
2026-10-25» (НОВЫЙ, вверху файла — дата мержа; формат —
по существующим записям; программная часть не перечисляется).
Ревью 2026-10-25 (3×minor): коммит c2894a8 первоначально вставил
буллет в существующий «## 2026-10-24» (решение §7 было принято
24-го, до смены даты) — протокол станции «дата = сегодня/мержа»
(2026-10-25) — правка по итогам ревью перенесла буллет в новый
«## 2026-10-25»; на момент правки на master такого раздела не было
(если параллельная задача создаст его до мержа — на ребейзе
буллет вливается в существующий, без дубля секции):
- **«Крепкая спина» расширяет инвентарь.** Каждый уровень навыка
  «Крепкая спина» добавляет 2 слота инвентаря (база — 20; на
  100-м уровне навыка — до 220).

## 8. Статус финализации (2026-10-25)

- Задача ВЫПОЛНЕНА и перенесена в tasks/done (коммит Finalize);
  отчёт — tasks/result/000255.md. Коммиты ветки (база c694320):
  c0321b5 (красные + эта memory), af9256c (зелёные + spec +
  ре-пины), c2894a8 (CHANGELOG), 37c72ef (ревью 3×minor + AFF +
  CHANGELOG → «## 2026-10-25»).
- npm test (worktree, Finalize): **3250 / 3250 / 0 fail**
  (база c694320 — 3242; +7 красных → зелёные +1 AFF).
- Master на момент Finalize — 46cf74b (+000253, +000250,
  +000230.17.01, +000251 к базе): файловых перекрытий с нашей
  веткой НЕТ; spec-split пины per-file, наш spec line-neutral.
- Конкретный риск мержа: task/000260 (живой) тоже создаёт раздел
  «## 2026-10-25» CHANGELOG в том же месте — кто смержится
  первым, создаёт раздел; второй вливает буллет, без дубля
  секции. Ребейз + полный npm test перед мержем — обязательны.

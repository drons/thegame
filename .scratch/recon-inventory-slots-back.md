# Отчёт: материал для ТЗ «слоты инвентаря растут с уровнем навыка „Крепкая спина“»

## 1. INVENTORY_SLOTS (src/items.js)

- **Определение** — `src/items.js:120`:
  ```js
  const INVENTORY_SLOTS = 20;   // слоты инвентаря
  ```
  Блок «Параметры инвентаря и веса» — `src/items.js:118-123`: `INVENTORY_SLOTS = 20`, `QUICK_SLOTS = 3` (:121), `MAX_STACK = 99` (:122), `BASE_CARRY_WEIGHT = 30` (:123).
- **Места использования**:
  - `src/items.js:523` — `sanitizeInventory`: при загрузке сейва новые слоты кладутся только пока `out.slots.length < INVENTORY_SLOTS` (лишние отбрасываются после слияния стопок).
  - `src/items.js:656` — `checkAdd`, складываемые: `if (inv.slots.length + newSlots > INVENTORY_SLOTS) return { ok: false, reason: 'нет свободных слотов инвентаря' }`.
  - `src/items.js:659` — `checkAdd`, нескладываемые: `else if (inv.slots.length + qty > INVENTORY_SLOTS)` — та же строка отказа.
  - `src/items.js:497` — doc-комментарий `sanitizeInventory`.
  - `src/items.js:1734` — экспорт в return-объекте модуля (`INVENTORY_SLOTS, QUICK_SLOTS, MAX_STACK, BASE_CARRY_WEIGHT`).
  - `src/ui-tab-inventory.js:118` — строка панели, когда инвентарь пуст: `'пусто (' + G.INVENTORY_SLOTS + ' слотов)'`.
  - `src/ui-tab-skills.js:549` — стат-строка панели персонажа: `` `Вес: …/… кг  |  Слоты: ${G.slotCount(c)}/${G.INVENTORY_SLOTS}` ``.
- `slotCount(c)` — `src/items.js:621`: `return ensureInventory(c).slots.length;` (текущее число занятых слотов; экспорт :1742).
- В `index.html` константа не упоминается.

## 2. Навык «Крепкая спина»

- **id = `back`**.
- **Каталог (source of truth)** — `assets/skills/000011.json`:
  ```json
  { "id": "back", "type": "secondary", "name": "Крепкая спина",
    "primary": "assets/skills/000001.json",
    "effect": { "stat": "carryWeightMult", "perLevel": 0.1 },
    "effectType": "Карта", "desc": "+10% к максимальному весу за уровень",
    "names": ["Носильщик", "Ученик грузчика", "Знаток ноши", "Мастер ноши", "Гроссмейстер ноши", "Легенда крепкой спины"] }
  ```
- **Сгенерированный JS-фолбэк** — `src/skills-data.js:132-141` (запись `back:`; name :134, effect `carryWeightMult`/0.1 :137). Генерируется из JSON (`spec/skills-storage.md:30-40`, скрипт `scripts/sync-skills-data.js`).
- **Текущий эффект — только максимум веса** (`carryWeightMult`), на слоты навык нигде не влияет.
- **Макс. уровень** — `src/sheet.js:54`: `const MAX_SKILL_LEVEL = 100;`
- **Механика прокачки** (src/sheet.js):
  - XP до следующего уровня: `skillXpForNext(level) = 15 * (level + 1)` — `sheet.js:190-192`.
  - Потолок практикой: `practiceCap = primary[связанный основной] * 2` — `sheet.js:318-323`; функция `practice` — `sheet.js:350`; на потолке опыт переливается в bank (комментарий C1, :341-349).
  - Очки: `pointsPerLevel()` — по умолчанию 2 — `sheet.js:197-208`; `canRaise` `sheet.js:252`, `raiseSkill` `sheet.js:293` (каскад `reprocessSkillXp` :305-306).
  - Ранги: 1–10 Новичок … 100 Легенда (`spec/skills.md:23-32`).
- **Где навык набирается в игре**:
  - Кузница тренирует `["forge", "back"]` — `src/buildings.js:202` (`особые_параметры.тренирует`).
  - Наставник-кузнец: `обучение: { навыки: ["forge", "back"], цена_за_уровень: 20, ... }` — `src/npc-data.js:81` (диалог «Кузнечное дело» :80). Кросс-чек «тренирует = обучение» — `tests/npc-data.test.js:299`.
  - Книги навыков: `skill_book` → `addSkillXp` — `src/items.js:881, 931`; книги с `back` в каталоге предметов нет (в `src/items-data.js` «back» не встречается).
- **Влияние на производные**: `derived()` — `src/sheet.js:456`; строка `carryWeightMult: 1 + pct('back')` — `src/sheet.js:496`, где `pct(id) = perLevel * S(id) * (1 + affix-бонус)` (`sheet.js:464-469`, affix-кольца, 000230).
- **Потребитель эффекта**: `maxCarryWeight(c) = BASE_CARRY_WEIGHT * P.derived(c).carryWeightMult` — `src/items.js:614-617`; используется в `checkAdd` (`items.js:662`).
- Упоминание в контенте: диалог NPC-бронника «проверь „Крепкую спину“» с требованием `{навык: {id: "back", уровень: 3}}` — `src/npc-data.js:40`, `assets/npc/000002.json:10`.

## 3. Производные характеристики

- **Файл/функция**: `src/sheet.js`, `function derived(sheet, ctx)` — `sheet.js:456` (экспорт через `player.js:195` → `Game.derived`, `player.js:276`).
- **Поля** (base-объект, `sheet.js:467-503`): `maxHP, maxMP, armor`, ход в бою (`moveCells, attackActions, spellActionsInt/Wis`), точность/урон (`swordHitBonus, archerHitBonus, heavyDamageBonus, fistDamageBonus, rangedDamageBonus, fire/iceDamageBonus`), защита (`damageTakenMult, dodgeBonus, survivalChance, magicResistMult`), карта (`carryWeightMult, moveSpeedMult, caveVisionMult, acroBonus, thiefBonus, dialogueBonus, companionMoraleBonus, performanceIncomeMult, fearChance`), зелья/опыт (`potionPowerMult, foodPowerMult, runePowerMult, xpMult`), экономика (`buyPriceMult, sellPriceMult`), `equipmentDurabilityMult`, реген (`hpRegenMult, mpRegenMult`).
- **Поля про слоты инвентаря в derived НЕТ** — только `carryWeightMult` (вес).
- `ctx.modifier` — hook kind-а (000143/000144) может переопределить полный объект (`sheet.js:504-507`).

## 4. UI (отображение слотов)

- **Панель инвентаря** — `src/ui-tab-inventory.js` (вкладка playerUI, `ui.js:762` `G.playerUI`):
  - Рендер списка — `ui-tab-inventory.js:109-160`: инвентарь рисуется **строками предметов** (`itemRow`), а не сеткой слотов; счётчика «x/y» в строках нет.
  - Пустой инвентарь — `ui-tab-inventory.js:116-118`: `'пусто (' + G.INVENTORY_SLOTS + ' слотов)'`.
  - Секция quick-слотов — `ui-tab-inventory.js:150-170` (`_quickBody`).
- **Стат-строка панели персонажа** — `src/ui-tab-skills.js:538-550`: 4-я строка (hero-вариант, байт-пин «ui-panel/ui-skills», комментарий :532-537):
  ```js
  `Вес: ${w.toFixed(1)}/${maxW.toFixed(1)} кг  |  Слоты: ${G.slotCount(c)}/${G.INVENTORY_SLOTS}`;  // :549
  ```
  Здесь и единственный на экране «x/y слотов».
- **Боевой [I]-панель** — тот же playerUI-инвентарь (задача 000195, `tests/combat-inventory-panel.test.js:1-30`); quick-список в бою — `src/combat-ui.js:2678-2807` (`inventory.quick`).
- HUD/подсказки: «Вес: X кг» в `src/ui.js:643` — вес отдельного предмета, не инвентаря.

## 5. Сейв (обратная совместимость)

- `src/save.js`: `SAVE_KEY = 'phlogiston.save'` (:36), `CURRENT_VERSION = 1` (:41), `MIGRATIONS = {}` — пустая (:50-52), `makeSave`/`serialize` — JSON-оболочка `{version, savedAt, data}` (:67-83), миграции при загрузке (:90-170). Правило бампа версии — только для «ломающих» изменений (:13-20).
- **Сборка данных** — `src/main.js:717` `collectSaveData()`: поле `hero,` — **:723**, т.е. в сейв пишется **целый live-объект героя**, включая `inventory = { slots: [{id, qty, bonus?}, …], quick: (string|null)×3 }`. Поля «вместимость/максимум слотов» в сейве **нет**.
- **Восстановление** — `src/main.js:915` `restoreFromSave()`; персонаж :939-950: `G.sanitizeSavedHero(d.hero)` + `hero.inventory = G.sanitizeInventory(d.hero.inventory)` (:948-949).
- **sanitizeInventory** — `src/items.js:503-537`: «призрак»-id отбрасываются, qty клэмпа в [1, MAX_STACK], дубли сливаются, **слотов не больше `INVENTORY_SLOTS`** (:523), quick — каталог-чек в 3 слота (:526-530).
- Следствие: старые сейвы (≤20 слотов) читаются без миграции; рост константы обратно совместим — лимит на :523 станет выше, старые 20 слотов сохранятся. Отдельный debug/тест-снапшот `state.hero.inventory = slots-массив` — `src/main.js:3861-3863` (`weight`, `maxWeight`, `inventory`).

## 6. Тесты, зашивающие 20 слотов / вместимость

- `tests/items.test.js`:
  - :164-176 — «addItem: оружие и броня не складываются, слоты ограничены»: заполняет до `I.INVENTORY_SLOTS` (через константу), проверка отказа с reason `/слотов/`.
  - :179-197 — лимит веса: база 30, `back=5 → 45` (пин `I.maxCarryWeight(c) === 45`).
  - :556-562 — «sanitizeInventory: не больше INVENTORY_SLOTS слотов».
  - :564-570 — мусор на входе → пустой инвентарь.
  - :4130-4200 — known-issue пин 000230.18: вес-гейт `allyUnequip` от derived композита (back=2: 39 vs 36) — про вес, не про слоты.
- `tests/companions.test.js`:
  - :1499-1529 — failsafe `allyUnequip` при полном **20/20** (19 реагентов + `iron_sword`, список id :1504-1510).
  - :1703-1733 — **D2s** (000230.06.01/000241): `dismiss` при полных 20/20 `wood_sword`, «вес 20 кг < лимита 30»; использует константу `I.INVENTORY_SLOTS` (:1711-1714, :1729).
  - :1950-1965 — **000242 W3**: `payWages`, переполнение слотов (рецепт D2s: 20/20 `wood_sword`), `left_blocked` (:1954-1958).
- `tests/npc.test.js:443-453` — `npcBuy` при полном инвентаре: `back=10` (60 кг, чтобы вес не мешал), заполнение до `I.INVENTORY_SLOTS`.
- `tests/building-effects.test.js`:
  - :1745-1760 — квест-обелиск: `back=50`, «заполнить все 20 слотов уникальными предметами», через константу.
  - :8273-8300 — **B27** (колодец): **литерал 20** — `for (let i = 0; i < 20; i++) slots.push({id:'wood_sword', qty:1})`, `assert.equal(slots.length, 20, 'инвентарь: 20 слотов (полон)')` (:8294); mутация живого массива через debug-хук (комментарий :8289-8292 — pre-seed не подходит: sanitizeInventory слиял бы).
- `tests/quick-panel-000223.test.js`: :299-305 `REAG19` (19 реагентов; «+ 1 предмет = 20»), использование :372, :387 («инвентарь снова полный (20 слотов)»).
- `tests/city-storage.test.js`: :840 «20 put-строк (инвентарь 20 слотов)», :1040 «полный инвентарь (20 слотов) → „Вынуть“ disabled».
- `tests/craft-core.test.js`: :600, :648 — «20/20 слотов: honey_cake ×2, moonstone ×2, sulfur ×17…» (вместимость при выдаче крафта).
- `tests/loot-e2e.test.js:439` — вес-гейт (`carryWeightMult` 1 + knight_plate 7 кг → 35 > 30).
- Memory-пін: `memory/000241-dismiss-ui-wiring-pins.md:108-115` — D2s-рецепт и факт «INVENTORY_SLOTS = 20 (items.js:120) **с 000009**»; :250 «адаптируется к смене INVENTORY_SLOTS через константу».

## 7. SPEC

- `spec/items.md:126-135` — раздел «## Инвентарь»:
  - :127 «Инвентарь — INVENTORY_SLOTS (20) слотов. Складываемые предметы … стопкой до MAX_STACK (99)…»
  - :129-131 «Лимит веса: … базовый переносимый вес (30 кг) × множитель „Крепкая спина“ (+10% за уровень).»
  - :132-134 «„Быстрые предметы“ — QUICK_SLOTS (3)…»
  - :138-147 «## Снаряжение» — 18 физических слотов экипировки (отдельная механика, 000230.02 — не путать).
- `spec/skills.md:43` — строка таблицы Сила: «Крепкая спина | +10% к максимальному весу | Карта». Ранги и макс. 100 — :23-32.
- `spec/skills-storage.md:13-24` — структура файла навыка (`effect.stat`/`perLevel`, `names` — ровно 6); JSON-каталог = source of truth, `skills-data.js` генерируется.
- `spec/buildings.md:40` — Кузница: «Кузнечная рука, Крепкая спина».
- `SPEC.md` (корень) — только оглавление (задача 000159, разделы в `spec/*.md`); прямых упоминаний инвентаря/слотов нет.

## Ключевые факты для ТЗ (сводно)

1. Вместимость — единственная константа `INVENTORY_SLOTS = 20` (`src/items.js:120`), используется в 2 проверках `checkAdd` (:656/:659), в `sanitizeInventory` (:523) и в 2 UI-местах (:118, :549).
2. «Крепкая спина» = `back` (`assets/skills/000011.json`, `src/skills-data.js:132-141`), эффект только `carryWeightMult = 1 + 0.1·уровень` (`src/sheet.js:496` → `src/items.js:614-617`), макс. уровень 100 (`src/sheet.js:54`), в derived поля «слоты» нет.
3. Сейв v1 хранит только фактические слоты (целиком `hero`), вместимости как поля нет; рост константы не требует миграции (лимит на загрузке — `sanitizeInventory`).
4. Большинство тестов использует константу `I.INVENTORY_SLOTS` (портативны), но есть литералы 20: `tests/building-effects.test.js:8286-8294` (B27), `tests/quick-panel-000223.test.js:299-305` (REAG19 — 19+1), `tests/city-storage.test.js:840/1040`, `tests/craft-core.test.js:600/648`; «20/20»-сценарии companions (D2s :1703, W3 :1950) формально через константу, но рецептами 20 `wood_sword` (1 кг) с весом 20 < 30.
# 000347.01 — ценовой резолвер свитка ×8^(уровень−1)

Задача tasks/done/000347.01.md (дочерняя 000347; ассортиментная часть —
tasks/pending/000347.02.md, НЕ сделана: там 3 NPC-жреца + base_price Е1).
Профиль-прецедент: memory/000346-rarity-prices.md (тот же паттерн резолвера).

## Модель резолвера (единая точка — src/items.js)

- `spellCatalog()` — ленивый доступ к каталогу заклинаний: в момент
  ВЫЗОВА читается `rootRef.Game.SpellsData.SPELLS_BY_ID` (в браузере
  spells-data.js грузится ПОСЛЕ items.js — index.html 1327/1349), фолбэк
  `require('./spells-data.js')` при `typeof require === 'function'`
  (в node UMD-фабрика вызывается 5 аргументами ⇒ rootRef === undefined —
  require-фолбэк ОБЯЗАТЕЛЕН; в vm-песочницах require нет → null → ×1).
  Кэш ТОЛЬКО успешного значения (паттерн runeCatalog/buildingsCatalogRef:
  «кэш ПУСТОГО вывода запрещён» — иначе первый вызов до загрузки
  spells-data зафиксировал бы ×1 навсегда).
- `spellScrollPriceMult(it)` — kind !== 'spell_scroll' → 1 БЕЗ обращения
  к каталогу; hasOwnProperty-guard SPELLS_BY_ID (прототип не протекает:
  spell='constructor' → ×1); уровень `Number.isFinite && ≥ 1` →
  `Math.pow(8, Math.floor(lvl) − 1)` (floor — конвенция decadanceLevels
  000348); всё мимо → ×1 (бит-в-бит старая цена).
- Экспорт рядом с `rarityPriceMult` (строка `RARITY_PRICE_STEPS,
  rarityPriceMult, spellScrollPriceMult,`); npc.js получает через
  I-снапшот Game.Items (npc.js грузится после items.js — функция есть).

## Применение к БАЗЕ (4 точки, порядок «редкость → уровень → богатство/derived»)

- buyPrice: `value × rarityPriceMult × spellScrollPriceMult(it) ×
  (1−0.10·wealth) × derived.buyPriceMult`.
- sellPrice: множитель в базе ПОСЛЕ ветки `(value ?? SELL_BASE_VALUE[kind])`
  — единство резолвера (vm: свиток без value ур2 → sell(w0) = 30×8 = 240).
- npcBuyPrice/npcSellPrice (src/npc.js): база `(base_price ?? value) ×
  rarityPriceMult × spellScrollPriceMult(it)`; ветка `!it → base 0`
  сохранена (`!it → kind undefined ≠ spell_scroll → ×1`).
- 8^n = 2^3n — точная степень двойки, round не дрейфует; отношение
  соседних уровней РОВНО 8 (пин T2).

## Факты диска (пересчитаны на базе 68db9214)

- Заклинаний 170, «уровень» целый 1..4 (30/60/57/23 — уровня 5 нет,
  макс множитель ×512). Предметов 764, spell_scroll 161 — у ВСЕХ
  валидный effect.spell→известный спелл, НИ У ОДНОГО нет rarity
  (валидатор и так запрещает rarity не-экипируемым — см. ловушки).
- Уровни свитков: 28×ур1 (×1), 57×ур2 (×8), 54×ур3 (×64), 22×ур4 (×512)
  ⇒ РОВНО 133 свитка численно дорожают (пин свипа T1).
- base_price ровно у 3 свитков = три входа Пергамента (scroll_merchant,
  npc-data строка ~349, mult_продажи 0.5, mult_покупки нет):
  - fireball_scroll ур2: 60→480 buy / 30→240 sell (Т0); 360/300 (Т5)
  - light_heal_scroll ур2: 70→560 / 35→280 (Т0); 420/350 (Т5)
  - frost_bolt_scroll ур1: 45/23 (Т0, ×1 НЕ двигается); 34/28 (Т5 —
    округления derived, Math.round(22.5)=23)
- Ассортимент 0-diff (это 000347.02): свитки в стоках построек — только
  у универсама (w3, пул=allItems); ни одна постройка не имеет spell_scroll
  в «виды». Боевой auto-loot/тултипы/сейв — raw value, не тронуты.
- Минимальный value свитка 45 ⇒ свитки никогда не «дешевлей всех» —
  сортировки cheapestStockItem (000319) не пересадлены.

## Ре-пины (уточнение, не ослабление)

- tests/item-prices-rarity-000346.test.js: T1/T4 формулы += ЛОКАЛЬНЫЙ
  scroll-член (таблица уровней — assets/spells/*.json с диска, НЕ через
  резолвер и не через зеркало — анти-самоуспокоение, паттерн
  RARITY_STEP_000346); assert «торгуемые без rarity» ОСТАВЛЕН (факт не
  меняется), комментарий уточнён (×1-регресс по РЕДКОСТИ).
- tests/item-prices-000322.test.js: R2 формула-свип += тот же локальный
  член; R1/R3/R6 НЕ двигались (base_price 0-diff, счётчики 73/44/44).
- Spec line-neutral: items.md буллет «Базовая цена предмета» (5→5 строк)
  + «Цена такой продажи» (3→3), npc-storage.md буллет `торговля`
  (10→10, игла W8 «формулы — src/npc.js (NPC), src/items.js (магазины
  построек)» целая), buildings.md «Цены магазина» (1 строка).
  SPEC_FILE_LINES 467/108/572 НЕ двинулись. КАНОН §2 c9: items.md
  39940→40229 байт (+289, line-neutral) переснят живым Buffer.byteLength
  (canon-items-sync 10/10).
- НЕ двигались: 000316/000317/000319 (в стоках срезов свитков нет /
  сортировки динамические), cities.test (SHOP_GOLDEN — сток-literals rng,
  цены в них не участвуют), 000299.03/items.test/npc.test/trade-tabs/
  ui-panel/city-interact/loot-e2e/craft-core (см. срез).

## Мутационная матрица (после коммита; git restore между)

см. tasks/result/000347.01.md (финальные цифры — там же).

## Ловушки

- Валидатор каталога (validateItem при загрузке items.js): свитку
  ОБЯЗАТЕЛЕН effect {kind:'spell', spell:<форма id>} — проба «свиток без
  effect» НЕ грузится (только прямой вызов резолвера); `value` обязан
  быть числом ≥1 по typeof, но NaN ПРОХОДИТ (typeof NaN==='number',
  NaN<1 false) — vm-проба SELL_BASE_VALUE ветки = value:NaN (паттерн
  .346 T5), undefined — крах «неверная цена».
- rarity на spell_scroll запрещён валидатором при загрузке (поля
  экипировки — только у EQUIP_KINDS) ⇒ composition «редкость×свиток»
  проверяется мутацией КАТАЛОГА ПОСЛЕ загрузки: getItem(id).rarity='rare'
  → buyPrice читает rarity в момент вызова → round(10×8×8)=640 (T7).
- W-08: sync:check на грязном src/*-data.js/assets краснит — src/items.js
  и src/npc.js НЕ генерируемые, sync:check=0 и до коммита.
- Тестовые ЛОКАЛЬНЫЕ таблицы уровней обязательны в ре-пиннутых тестах:
  без них мутация резолвера не детектируется (самоуспокоение).
- golden-стоки (T6 страж): makeShop(30,40,W=3) seed 3346526313/646/1999,
  makeCampShop(40,40,1,0,campRec) 1223027174/176/257 — rng без цен,
  литералы НЕ переснимать; поплывут — задет rng-путь, искать баг в
  резолвере.
- Пергамент 45/23: Math.round(45×0.5)=Math.round(22.5)=23 — JS-округление
  половины вверх, финальные литералы только живым прогоном.

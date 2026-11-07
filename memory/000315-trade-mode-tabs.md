# 000315 — режим торговли NPC: две колонки «Инвентарь | Магазин», dnd с подтверждением продажи

ТЗ: tasks/done/000315.md. Тесты: tests/trade-mode-tabs-000315.test.js (10).
Только src/ui.js (IIFE «Диалог NPC») — ядро цен/мутаций src/npc.js НЕ
тронуто; магазин построек (src/ui-tab-shop.js, src/items.js makeShop) и
книга/склад — НЕ тронуты; index.html 0-diff.

## 1. Контракт экрана (renderTradeTab, src/ui.js)

- Порядок содержимого body вкладки «торговля»: meta «Золото: N» —
  ПЕРВЫЙ ВНЕ колонок (бит-в-бит legacy), затем `.storage-cols` → РОВНО
  2 `.storage-col`: слева `storage-col--inv` (заголовок «Инвентарь»),
  справа `storage-col--shop` (заголовок «Магазин»). Классы —
  ГЛОБАЛЬНЫЕ правила 000313 (index.html:118-121) — НЕ дублируются,
  CSS-секции склада не тронуты; шириной оверлей не управляет (нет
  --storage-модификатора) — стандартная ширина npc-overlay.
- Заголовки колонок — `div.cp-section` (НЕ cp-itemname/cp-itemmeta —
  не попадают в DOM-пины строк 000314/000315).
- Магазин-колонка: строки — legacy бит-в-бит («имя (ост. N)», meta
  «покупка B з / продажа S з», «купить» npcact='buy', «продать»
  npcact='sell' + disabled «предмета нет в инвентаре»), сток < 1 —
  строки нет (000314) + НОВОЕ: row.draggable=true, кнопка «Купить»
  npcact='trade-buy' (disabled+title «мало золота (нужно B)» при
  c.gold < buy — НЕЙТРАЛЬНО к старой «купить», которая не
  дизейблится по факту кода), dragstart/dragend на строке.
- Инв-колонка: слот-агрегация hero (`Array.isArray(c.inventory) ?
  c.inventory : c.inventory.slots` — legacy-массив тоже ок), первый
  порядок слотов, «имя ×N»; meta «продажа S з» только если NPC скупает
  (npcSellPrice != null); кнопка «Продать» npcact='trade-sell';
  не-торгуемое → disabled + title «NPC не скупает такие предметы» +
  draggable=false + drag-слушателей нет.
- Инв-пустой → 0 строк (только заголовок).

## 2. Действия (onOverlayClick, data-npcact)

- 'buy' и 'trade-buy' → doNpcTrade('buy', …); 'sell' (старая кнопка)
  → doNpcTrade('sell', …) БЕЗ подтверждения (бит-в-бит контракт
  B5 000299.03 / sellItem в building-levels).
- 'trade-sell' → pendingSell={item} + renderTab (без мутаций).
- 'sell-yes' → pendingSell=null + doNpcTrade('sell', item) — цена/
  мутация перечитываются через ядро (stale-предмет → причина ядра в
  логе, 0 сейвов — T4b).
- 'sell-no' → pendingSell=null + renderTab (0 мутаций/сейвов).
- 'tab' (смена вкладки) и npcClose() → pendingSell=null,
  npcClose() + tradeDrag=null.
- doNpcTrade — ЕДИНСТВЕННАЯ точка buy/sell (вынесена из legacy-ветки
  1:1: activeSheetNow, npcBuy/npcSell, лог «Куплено:/Продано: … за N
  з», onChange, renderTab, playerUI.render).

## 3. Подтверждение продажи

renderTab: `if (tab === 'trade' && pendingSell && renderSellConfirm())
return;` СРАЗУ после `body.textContent = ''` — пока подтверждение
активно, вкладки нет, обход кнопок невозможен (делегированный клик).
Блок `.cp-itemrow.trade-confirm`: meta-текст ПОБАЙТОВО «Вы хотите
продать 'Имя' за X золота?» (ASCII-апострофы `'` вокруг имени — ТЗ) +
«Да»(sell-yes)/«Нет»(sell-no). Цена перечитывается КАЖДЫЙ рендер через
G.npcSellPrice(npcShop, item, activeSheetNow()) — паттерн stale-цены
000299.03; it/price пропали → pendingSell сбрасывается и рисуется
вкладка (stale-состояние). Золото/мутации — всегда c (hero, 000194);
цена — по активному (000299.03) — T8: merc Торговец 2 → «за 7».

## 4. dnd (паттерн 000313, НЕ dataTransfer)

- onTradeDragStart: tradeDrag={item:String(id), from:'inv'|'shop'} +
  setData('text/plain', id) + effectAllowed='move' — для совместимости;
  ЧТЕНИЕ всегда из tradeDrag (в vm-стабе getData бросает).
- onTradeDragOver(side): preventDefault ТОЛЬКО если tradeDrag и
  from !== side.
- onTradeDrop(side): no-op без drag / в свою колонку; inv→shop →
  guards (npcShop, npcSellPrice != null, hasItem) → ТОТ ЖЕ confirm,
  что кнопка (deep-equal state — T5); shop→inv → doNpcTrade('buy')
  БЕЗ подтверждения, deep-equal клику «купить» (T6).
- onTradeDragEnd: tradeDrag=null.

## 5. Ре-пины и потребители

- tests/shop-zero-stock-000314.test.js A1/A2/A2b: deepEqual списков
  .cp-itemname дополнены инв-строкой «Деревянный меч ×2» В НАЧАЛЕ
  (инв-колонка раньше в DOM); контрактные ассерты («ост. 0» нет, 0
  buy/sell-кнопок) не тронуты.
- spec/npc-storage.md 92→98 (+6 в буллет «Экран»); ре-пины В ТОМ ЖЕ
  коммите: spec-split SPEC_FILE_LINES, spec-000296 R4, spec-000297 W2
  (цепи атрибуций расширены). Фразы 000314/000312 в буллете целы —
  wording-гарды зелёные.
- Новые npcact ('trade-buy'/'trade-sell'/'sell-yes'/'sell-no') НЕ
  пересекаются со старыми селекторами пинов — 'buy'/'sell' сохранены.

## 6. Подводные камни

- row.draggable обязан ставиться ЯВНО (vm-стаб Proxy читает
  недеф-свойство как function — truthy): не-торгуемой инв-строке —
  `false`, остальным — `true`.
- В vm-стабе draggable НЕ равен атрибуту HTML — пины только по полю.
- Агрегация инвентаря: НЕ трогать items.js; форма hero — slots.
- `git restore` НЕЛЬЗЯ делать на незакоммиченную реализацию — до
  мутационных проверок реализации ОБЯЗАТЕЛЬНО коммит/stage
  (прецедент этой задачи: реализация ui.js была утрачена restore'ом
  и восстановлена из снапшотов сессии).
- Полный прогон — только в этом worktree и один за разом (000054
  мутирует npc-data.js); база db9ddf9 = 3976, +10 новых = 3986.
- index.html НЕ трогать: .storage-cols/.storage-col — глобальные из
  000313; скролл-контракт колонок получает и trade-оверлей (max-height
  + overflow-y:auto).

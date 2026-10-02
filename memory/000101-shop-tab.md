# 000101 — Вкладка «Магазин»: строка «Магазина здесь нет» при shop === null (контракт вкладки)

Дополнение к memory/000130-ui-tabs.md (контракт вкладок-модулей) и
memory/000051-char-panel-plan.md §«МАГАЗИН (000101)» (перенос торговли).
Здесь — контракт САМОЙ вкладки «Магазин» (src/ui-tab-shop.js) в её
ИТОГОВОМ виде после 000101 + решение placeholder-дизайна.
Статус: проектирование выполнено (2026-10-02, worktree
.worktrees/task-000101, ветка task/000101, база = master 5ff7405 —
мерж 000098, ПОСЛЕ 000130; базовый npm test — 1298/1298 зелёный,
замерено на станции; working tree чист).

## 1. Что добавлено / перенесено (итог задачи)

**Перенос «Торговли» во вкладку «Магазин» выполнен ДОСРОЧНО — задача
его НЕ переносит заново.** Факты, сверенные с кодом master:
* 000096 (ревью раунд 1, зафиксировано в плане 000051): живая торговля
  (000009) перенесена КАК ЕСТЬ в pane «Магазин» (правый столбец,
  средняя вкладка); одноколоночной секции «Торговля» в DOM НЕТ
  (grep «Торговля» по src/index.html — только комментарии и
  каталогное описание buildings.js; npcUI-вкладка 'торговля' — другой
  объект, диалог NPC, не касается).
* 000130 (смержен): торговля — саморегистрирующийся UMD-модуль
  src/ui-tab-shop.js (запись { column: 1, id: 'shop', label:
  'Магазин', build, render }); ядро ui.js сохранило setShop
  (shopKey-гард) + doItemAction (buy/sell) + делегированный click,
  renderItems/секции НЕТ.

**Остаток 000101 (строго по ТЗ, «не больше и не меньше»):**
* shop === null — placeholder-строка «Магазина здесь нет» (по образцу
  .cp-itemmeta) ВМЕСТО скрытия секции (было: `panel._shopSec.style.
  display = 'none'; return;` + stale-строки в _shopBody — проверено
  прогоном: после setShop(null) в скрытом body 8 детей / 7 .cp-itemrow).
* Регрессия-тесты (секция 000101 в tests/ui-panel.test.js).
* memory + CHANGELOG (видимый UI для игрока).

Дельты «Состояние сейчас» ТЗ против master (все УСТАРЕЛИ —
не переносить заново):
* d1: «секция Торговля src/ui.js 91-96, renderItems 183, setShop
  343-351» → нет: торговля в src/ui-tab-shop.js (000130); setShop —
  ui.js (shopKey-гард, ~L374-380).
* d2: «main.js:1010 — G.playerUI.setShop(…)» → call-site переехал в
  src/hud.js update() (серия 000127–000129; ~L216-223: `setShop(isShop
  ? makeShop(x, y, building, buildingWealth) : null)`); main.js
  setShop НЕ содержит. Инвариант «точка вызова без изменений» —
  hud.js/main.js НЕ трогаем.
* d3: «Зависимость: 000096 (placeholder-вкладка)» → вкладка
  полноценный модуль build+render; отсутствует только строка.
* d4: «Файлы: src/ui.js, index.html (style)» → правится
  src/ui-tab-shop.js (НЕ ui.js — анти-прецедент 000130); index.html —
  БЕЗ правок (ни script, ни CSS — см. §5).
* d5: harness-заметка «000098 параллельно расширяет ui-panel» →
  000098 УЖЕ в master (5ff7405); общий append-хвост теста — единственная
  конфликтная поверхность.

## 2. Контракт вкладки «Магазин» (итоговый, после 000101)

Запись реестра Game.uiTabs (контракт 000130):
`{ column: 1, id: 'shop', label: 'Магазин', build(pane, ctx), render(ctx) }`
— ПОБАЙТОВО (пины 000130 R2 + index-order L765). ЗАПИСЬ НЕ МЕНЯЕТСЯ.

### 2.1 build (ОДИН раз в buildPanel — БЕЗ ИЗМЕНЕНИЙ)

* `div.cp-section` «Магазин» (заголовок — установившийся паттерн:
  каждый pane несёт СВОЮ .cp-section) > `div.cp-items`;
  имена `ctx.panel._shopSec` / `ctx.panel._shopBody` — ЗАФИКСИРОВАНЫ
  (контракт 000130 §4.3 + прямые доступы тестов) — НЕ менять.

### 2.2 render(ctx) — in place, пишется ТОЛЬКО в _shopBody (+display)

* Ранний `if (!ctx.character) return;` — сохраняется (до shop-логики).
* **shop ≠ null** (БЕЗ ИЗМЕНЕНИЙ, «как есть» 000096/000130):
  * `panel._shopSec.style.display = ''`; `_shopBody.textContent = ''`;
  * мета-строка: голый `div.cp-itemmeta` «<buildingNameUi(shop.
    buildingType) || 'магазин'>, богатство <shop.wealth>/3»;
  * buy-строки: ПО КАЖДОМУ [id, qty] из shop.stock (qty ≥ 1, getItem
    нашёл) — `ctx.itemRow(name + ' ×' + qty, 'покупка ' + G.buyPrice(
    shop, id, c) + ' з', [['купить', 'buy', { item: id }]])`;
  * sell-строки: sellable = инвентарь c по kinds из
    G.shopKindsFor(shop.buildingType) — `ctx.itemRow(name + ' ×' + qty,
    'продажа ' + G.sellPrice(shop, id, c) + ' з', [['продать', 'sell',
    { item: id }]])`.
  * Строки — `div.cp-itemrow > span.cp-itemname + span.cp-itemmeta +
    button.cp-btn[data-act][data-item]`; **У СТРОК МАГАЗИНА .cp-tip
    НЕТ** (пин ui-panel L980; 000097: «магазин — зона 000101» про
    absence tip'ов) — 000101 tip'ов НЕ ДОБАВЛЯЕТ (ТЗ «содержимое — то
    же, что сейчас в „Торговле“»).
* **shop === null — ПРАВКА 000101 (решение §3.1):**
  * секция ОСТАЁТСЯ ВИДИМОЙ: `panel._shopSec.style.display = ''`
    (ранее 'none');
  * `_shopBody.textContent = ''` (обязательная очистка — стаб сбрасывает
    children; убирает stale-строки — баг-пробег зафиксирован прогоном);
  * `panel._shopBody.appendChild(ctx.el('div', 'cp-itemmeta',
    'Магазина здесь нет'))` — ГОЛЫЙ div (не .cp-itemrow);
  * return.
* Текст «Магазина здесь нет» — ПОБАЙТОВО по ТЗ.

### 2.3 Кнопки и обратная связь — ЯДРО ui.js (НЕ переносить)

* Кнопки — только существующие `.cp-btn[data-act]` (buy/sell); НОВЫХ
  data-act НЕТ (Ограничения ТЗ).
* Обработчик — ЕДИНСТВЕННЫЙ делегированный click панели (ui.js
  L156-195): ветка .cp-btn[data-act] → `doItemAction(btn)` + `render()`.
* doItemAction (ui.js L210-235): buy → `G.buyItem(shop, c, id, 1)`,
  sell → `G.sellItem(shop, c, id, 1)`; успех → flashNotice «Куплено:
  <name> за <price> з» / «Продано: <name> за <price> z» (price — из
  результата ядра, NOT из цены-функции); неудача → r.reason.
* Ядро торговли — src/items.js (makeShop/buyPrice/sellPrice/buyItem/
  sellItem/shopKindsFor) — ЧИСТОЕ, НЕ ТРОГАТЬ (ТЗ); регрессия —
  tests/items.test.js без изменений.

### 2.4 setShop — ядро, shopKey-гард (НЕ переносить)

* `G.playerUI.setShop(s)`: closure-переменная ядра; key = `s ? x+','+
  y+','+buildingType+','+wealth : ''`; key === shopKey → return
  (гард: hud.js зовёт setShop КАЖДЫЙ кадр — перенос гарда в модуль =
  render() 30 раз/с, контракт 000130 §6.5).
* Повторные setShop(null) — гард (key '' === '') — render НЕ шлётся.
* API playerUI (setCharacter/setShop/setQuests/toggle/render/isOpen) —
  БЕЗ ИЗМЕНЕНИЙ (ТЗ).

## 3. Решения openQuestions/ТЗ (решение — почему)

1. **Placeholder: строка ВНУТРИ _shopBody, секция ВИДИМА (variant A)** —
   а не скрытие секции (вариант B: hidden + pane-элемент):
   * конвенция кодовой базы 1:1 — «Квесты» (ui-tab-quests.js L136-140:
     при !book — голый .cp-itemmeta «Журнал квестов недоступен.»,
     секция не прячется; L151-152 «нет активных квестов»; L164 «пока
     ничего») и деградация 000098 («Настройки недоступны»);
   * ТЗ буквально: «placeholder-строка „Магазина здесь нет“ (по образцу
     .cp-itemmeta)» — СТРОКА, а не пустой pane;
   * pane не теряет заголовок секции (каждая вкладка всегда несёт
     .cp-section — «Снаряжение» показывает «— без оружия —» и т.п.);
   * минимальный diff: правится ТОЛЬКО !shop-ветка render; имена
     _shopSec/_shopBody не меняются; вариант B требовал бы новое
     panel._* + дублирование механизма.
2. **Форма placeholder — голый `div.cp-itemmeta` (НЕ .cp-itemrow)** —
   ТЗ «по образцу .cp-itemmeta»; все прецеденты-плейсхолдеры проекта —
   голые .cp-itemmeta; .cp-itemrow — контракт строк ПРЕДМЕТОВ
   (name+meta+кнопки), для строки-заглушки избыточен; CSS .cp-itemmeta
   существует (index.html L100) → index.html НЕ правится.
3. **display-твинг: симметричный `display = ''` в обеих ветках, строка
   shop-ветки НЕ трогается** — минимальный diff (shop-ветка «как
   есть» по ТЗ); после правки display='none' ни одной строкой НЕ
   пишется → секция не скрывается НИКОГДА (по умолчанию видима с
   build). Эквивалентный вариант (удалить обе записи display) отклонён
   как более широкий diff без выигрыша.
4. **Секция «Торговля» НЕ восстанавливается НИГДЕ** — ТЗ «секция
   „Торговля“ в одноколоночной раскладке УБИРАЕТСЯ» выполнено досрочно
   (000096/000130); 000101 добавляет только тест-фиксатор S3
   (DOM-отрицательный ассерт), чтобы не вернулась.
5. **index.html — БЕЗ правок** (ТЗ разрешало ТОЛЬКО <style>) —
   не понадобилось: ни script-тега (новых модулей НЕТ), ни CSS-правила
   (.cp-itemmeta/.cp-section/.cp-items/.cp-btn существуют) → пины
   tests/index-order.test.js без изменений, мерж-поверхность
   index.html пуста.
6. **Имена строк/цены в тестах — из фикстуры, НЕ хардкод** —
   makeShop-сток детерминирован (seed = f(x, y, buildingType,
   wealth)); ассерты вычисляют ожидаемое через G.getItem(id).name /
   G.buyPrice / G.sellPrice от того же shop-объекта — устойчиво к
   изменениям каталога/цен (прецедент golden-тестов items 000060).
7. **Лоадер тестов — ПЕРЕИСПОЛЬЗОВАНИЕ loadTabsUi + CHAIN_000130**
   (динамическая цепочка из index.html, ui-tab-shop.js в ней уже есть)
   — НОВЫХ стабов/CHAIN/лоадеров НЕТ (у вкладки нет input'ов, в отличие
   от 000098, где понадобился makeElS); лоадер МЕЖДУ ФАЗАМИ не
   правится (паттерн 000130/000098).
8. **Комментарии-шапки src/ui-tab-shop.js обновить** (L1-3 «добавит
   задача 000101» → «добавлено (000101)», L50-54 build-комментарий) —
   не оставлять stale-«добавит»; текстовые пины на комментарии НЕТ
   (проверено: пин L2035 — only /saveNow/, L1866 — форма экспорта).
   Ловушка: литерал «Магазина здесь нет» УЖЕ ЕСТЬ в шапке-комментарии
   (L2) — структурный пин S7 (match по файлу) зелёный С ПЕРВОГО
   запуска; истинно красные — поведенческие S1/S2 (см. §6).
9. **CHANGELOG — ДА, один пункт** (видимое UI-изменение для игрока;
   прецедент 000098 — только-интерфейсная задача получила запись):
   `## 2026-10-02 / ### Интерфейс`: «Вкладка „Магазин“. Во вкладке
   „Магазин“ панели персонажа ([I]) вне магазина теперь строка
   „Магазина здесь нет“ (раньше вкладка была пустой).» Программная
   часть (перенос, setShop) — НЕ перечисляется. Отдельный коммит.

## 4. Ленивые ссылки и guards (UMD-чистота — сохраняется)

* Правка — ТОЛЬКО в теле render (момент ВЫЗОВА): при загрузке НОЛЬ
  DOM / НОЛЬ require / НОЛЬ RNG / НОЛЬ console.error (R6 000130,
  sprites-песочница { console } без DOM, main-visuals errors.length===0).
* Снапшот `G = G0` ОДИН (L44) — не трогать; все G.* (getItem/
  buildingNameUi/buyPrice/sellPrice/shopKindsFor) — при ВЫЗОВЕ;
  rootRef/ленивый Game НЕ нужен (все провайдеры выше в index.html,
  контракт 000130 §3).
* Живое состояние — closure ядра: shop читается через getter `ctx.shop`
  (null если нет); модуль БЕЗСОСТОЯТЕЛЕН (никакого module-level shop).
* Литерал 'saveNow' НЕ вводится (readdirSync-скан 000130 L2035 по
  каждому src/ui-tab-*.js).
* УMD-ветка node: `module.exports = factory(null, null)` → `{ tab }` —
  форма НЕ меняется (пин L1866).

## 5. Фикстуры / детерминизм (проверено прогоном на станции, node)

* `makeShop(0, 0, APOTHECARY, 2)` — детерминированно (равные аргументы
  → равный сток, разные координаты → разные): stock =
  { minor_healing:1, greater_healing:3, mana_potion:3, mana_elixir:2,
  bread:3, honey_cake:4 } (6 buy-строк); цены покупки: 3/28/10/32/2/6 з
  (порядок Object.entries — порядок вставки).
* `makeShop(1, 1, APOTHECARY, 3)` — универсам (wealth 3): **37 позиций**
  (ВСЕ предметы каталога; a2-анализ писал 36 — НЕ ВЕРНО, тест обязан
  брать `Object.keys(shop.stock).length` ДИНАМИЧЕСКИ, не число).
* `buildingNameUi(APOTHECARY)` = «аптекарь» (map.js L167, на Game в
  браузере). `shopKindsFor(APOTHECARY)` = ['potion', 'food'].
* `createCharacter()` → gold = 100. healing_potion: kind 'potion',
  value 10 → sellPrice в s1 = 13; buyPrice(s1, 'minor_healing') = 3.
* buyItem/sellItem возвращают { ok, item, qty, price } — price в
  notice берётся из результата.
* Панель — DOM-оверлей, НЕ canvas → golden-детерминизм
  (main-visuals/save-restore/city-screen) не затрагивается; новых
  RNG-вызовов НЕТ.

## 6. Тесты (секция «000101» — APPEND В КОНЕЦ tests/ui-panel.test.js,
после секции 000098; лоадеры/CHAIN/стабы НЕ правятся)

Лоадер — `loadTabsUi()` + `CHAIN_000130` (L1674/1688, переиспользуем);
help'еры — openPanel/colsOf/panesOf/clickTab/findAll/noticeOf/textOf +
`src()` (L151). Помощник секции: `shopPane = panesOf(colsOf(panel)[1])[1]`
(правый столбец, 2-й pane — вкладка «Магазин»; порядок закреплён
пинами 000096/000130). Имена — канон «000101 RED: …» / «000101 GREEN: …».

1. **S1 `000101 RED: shop = null — секция видима, строка «Магазина
   здесь нет» (.cp-itemmeta), строк/кнопок нет`** — ИСТИННО КРАСНЫЙ.
   openPanel без setShop: `panel._shopSec.style.display !== 'none'`;
   в pane .cp-itemmeta с ТОЧНЫМ текстом «Магазина здесь нет»;
   `_shopBody.children.length === 1`; 0 .cp-itemrow / 0 .cp-btn в
   pane; errors.length === 0. До: display 'none', body пуст.
2. **S2 `000101 RED: setShop → строки магазина; setShop(null) →
   плейсхолдер снова, старые строки очищены`** — ИСТИННО КРАСНЫЙ
   (краснеет на ПЕРХОДЕ). Фаза 1 (зелёна с 1-го — фиксатор досрочного
   переноса 000096/000130): персонаж с healing_potion ×2; setShop(s1):
   мета .cp-itemmeta содержит «аптекарь» + «богатство 2/3»; ПО КАЖДОМУ
   [id, qty] stock — .cp-itemrow с .cp-itemname = G.getItem(id).name +
   ' ×' + qty и .cp-btn[data-act=buy, data-item=id]; sell-строка
   healing_potion (data-act=sell); ВСЕ .cp-btn в pane — data-act ∈
   {buy, sell}; текста «Магазина здесь нет» в pane НЕТ. Фаза 2
   (красная): setShop(null) → плейсхолдер ВЕРНУЛСЯ, _shopBody — ровно
   1 ребёнок, 0 .cp-itemrow/0 .cp-btn, текст «покупка»/«продажа»
   ОТСУТСТВУЕТ (stale убран). До: display 'none' + 8 stale-детей.
3. **S3 `000101 RED: секции «Торговля» в панели НЕТ; _shopBody живёт в
   pane вкладки «Магазин»`** (зелёный с 1-го — фиксатор ТЗ). НЕТ
   .cp-section с textContent === 'Торговля' по всей панели;
   _shopBody.parent === _shopSec (секция «Магазин»), _shopSec.parent
   === shopPane.
4. **S4 `000101 GREEN: клик data-act buy через panel.listeners.click[0]
   — покупка (регрессия ядра items.js)`**. c (gold 100); setShop(s1);
   [id] = ПЕРВЫЙ stock с qty ≥ 1; price = G.buyPrice(s1, id, c); клик
   по buy-кнопке data-item=id через ЕДИНСТВЕННЫЙ делегированный
   `panel.listeners.click[0]({ target: btn })` → c.gold === 100 −
   price; G.totalQty(c, id) === 1; s1.stock[id] === qty − 1;
   noticeOf(panel).textContent === «Куплено: <name> за <price> з»;
   строка предмета (qty−1 < 1) УБРАНА после ре-рендера в обработчике.
5. **S5 `000101 GREEN: клик data-act sell — продажа (регрессия)`**.
   addItem(c, 'healing_potion', 2); setShop(s1); gold0 = c.gold;
   price = G.sellPrice(s1, 'healing_potion', c); клик по sell-кнопке →
   c.gold === gold0 + price; totalQty === 1; notice «Продано: … за
   <price> з»; продажная строка обновлена in place (×2 → ×1, тот же
   _shopBody).
6. **S6 `000101 GREEN: смена setShop (shop → другой shop → null) —
   остальные вкладки сохранены`**. c: iron_sword (addItem + equip —
   строка «Снаряжение») + healing_potion ×2 (строка «Инвентарь»);
   openPanel; clickTab(right, 1) → активен «Магазин». Записать: узлы
   rp = panesOf(right) / lp = panesOf(left), тексты строк чужих паней.
   setShop(s1) → buy-строк 6; setShop(s2 = makeShop(1,1,APOTHECARY,3))
   → мета «богатство 3/3», buy-строк === Object.keys(s2.stock).length
   (37 — ДИНАМИЧЕСКИ); setShop(null) → плейсхолдер. Инварианты: rp/lp —
   ТЕ ЖЕ DOM-узлы; активный правый — ВСЁ ЕЩЁ «Магазин» (rp[1].display
   !== 'none', rp[0]/rp[2] === 'none' — render НЕ переключает вкладки);
   левый — «Персонаж» активен; строки «Снаряжение»/«Инвентарь» —
   прежние тексты.
7. **S7 `000101 GREEN: фиксаторы — плейсхолдер в ui-tab-shop.js, НЕ в
   ядре`** (зелёный с 1-го — литерал уже в шапке-комментарии, §3.8):
   `assert.match(src('ui-tab-shop.js'), /Магазина здесь нет/)`;
   `assert.doesNotMatch(src('ui.js'), /Магазина здесь нет/)` (аналог
   анти-прецедента 000130 R4). saveNow — НЕ повторять (общий
   readdirSync-скан 000130 L2035).

### 6.1 Верификация RED (корректировка плана a3)

* `npm test` после RED-коммита: **1305 тестов, fail — ТОЛЬКО S1 и S2**
  (имена «000101 RED: …»). a3-ожидание «3 fail (R1-R3)» УСТАРЕЛО:
  литерал «Магазина здесь нет» уже есть в шапке-комментарии
  ui-tab-shop.js (L2) → структурный R3/S7 НЕ краснеет; истинно
  красных ровно 2 (поведенческих). Причины падений — отсутствующий
  плейсхолдер/скрытая секция/stale-строки, НЕ SyntaxError/
  MODULE_NOT_FOUND (новых файлов/тегов/require НЕТ).
* GREEN-фаза (правка src/ui-tab-shop.js): npm test — 1305/1305.
* Тех. правок СУЩЕСТВУЮЩИХ тестов: НИ ОДНОЙ (CHAIN уже содержит
  ui-tab-shop.js; новых путей/тегов/стабов нет).
* Флейк (1.5-с асинхронные тесты): при случайном падении — перепуск
  `node --test tests/ui-panel.test.js` + запись в отчёт (инвариант).

### 6.2 Регрессия БЕЗ ИЗМЕНЕНИЙ (пройдут без правок)

* tests/items.test.js (ядро), tests/cities.test.js, tests/hud.js.test.
  js (проводка setShop — hud.js не правится), tests/ui-skills.test.js
  (CHAIN L127 содержит ui-tab-shop.js), tests/index-order.test.js (пины
  L750/L765/L824 — новых тегов НЕТ), tests/npc-hire.test.js (CHAIN
  без вкладочных модулей — не затрагивается), vm-песочницы с
  динамической цепочкой (main-visuals/city-screen/building-actions/
  save-restore/locations/hud.js/save/building-effects/index-order —
  подхватят изменённый ui-tab-shop.js сами; панель в них не
  открывается — buildPanel ленив), sprites (чистота загрузки).
* Критическая проверка (выполнена): НИ ОДИН существующий тест НЕ
  фиксирует скрытие секции «Магазин» при shop=null (grep _shopSec в
  tests — 0 вхождений; display==='none' — только pane-уровень) ⇒
  «секция скрыта → видима с плейсхолдером» не ломает ничего.
* Побайтовые: подписи/порядок вкладок (L386, 000130 R2), node-форма
  require ui-tab-shop.js (L1866), строки магазина при shop ≠ null
  (L980/L1075), отсутствие .cp-tip у строк магазина, saveNow-скан,
  CSS .cp-*, квест/настройки-паней (чужие тела), проводка setShop.

## 7. НЕ трогалось (явно)

* src/ui.js — 0 строк (анти-прецедент 000130 закреплён тестом:
  doesNotMatch /LEFT_TABS|RIGHT_TABS/ + пин «записи вкладок НЕ в
  ui.js»). Комментарий ui.js L186-188 «магазин — зона 000101» (о
  .cp-tip) остаётся: tip'ы по-прежнему отсутствуют, задачи на них НЕТ.
* src/items.js (ядро торговли), src/main.js, src/hud.js (call-site
  setShop), src/ui-tabs.js, прочие ui-tab-*.js.
* index.html — ни <script>, ни <style>. assets/ — новых SVG НЕТ
  (правило 000120/svg.test.js не активируется).
* .merge-pending — НЕ создавать (только стадия мержа). Пуш — ЗАПРЕЩЁН.

## 8. Коммиты (ветка task/000101; порядок по паттерну 000098)

1. `Задача 000101: красные тесты` — секция 000101 (S1–S7) в
   tests/ui-panel.test.js (append) + этот memory-файл. Красный: S1+S2.
2. `Задача 000101: вкладка «Магазин» — строка «Магазина здесь нет»
   при shop === null (placeholder, секция видима)` — src/ui-tab-shop.js
   (render-хук !shop-ветка + комментарии-шапки). npm test — 1305/1305.
3. `Задача 000101: CHANGELOG — …` — один пункт (§3.9).
4. `Задача 000101: отчёт, перенос задачи в done` — tasks/result/
   000101.md + `git mv tasks/pending/000101.md tasks/done/000101.md`
   (правило tasks/CLAUDE.md: перемещение — ОБЯЗАТЕЛЬНО с коммитом).
Все: первая строка «Задача 000101: …» (рус.), последний параграф —
Co-Authored-By: Claude Code <noreply@anthropic.com>.

## 9. Подводные камни (фиксаторы)

1. **Stale-_shopBody** — прежний ранний return НЕ чистил тело: после
   setShop(null) скрытая секция хранила 8 детей (прогон). Плейсхолдер-
   ветка ОБЯЗАНА чистить (`textContent = ''` в обеих ветках — симметрия;
   стаб сбрасывает children — контракт 000130 §6.3).
2. **Литерал в шапке-комментарии** — «Магазина здесь нет» присутствует
   в src/ui-tab-shop.js L2 ДО реализации → любой структурный pinn по
   строке зелёный с 1-го; красный статус секции дают ТОЛЬКО
   поведенческие S1/S2. Не «чинить» S7, делая его искусственно
   красным.
3. **37, а не 36** позиций у универсама wealth 3 — числа в тестах из
   фикстуры (Object.keys(shop.stock).length), не из аналитики.
4. **Рендер скрытых pane** — hook-цикл ядра рендерит ВСЕ pane;
   placeholder рисуется в СКРЫТОМ «Магазине» при setShop(null) —
   поведение по ТЗ («смена shop при СКРЫТОЙ вкладке — просто
   renderItems в её pane»); query стаба на скрытых pane работает
   (паттерн 000096).
5. **display-твинг** — после правки display='none' не пишется НИГДЕ;
   ни один тест не читает _shopSec.style (0 вхождений) — безопасное
   изменение видимости.
6. **UMD-чистота** — правка строго внутри render (момент вызова);
   R6 000130 / sprites / main-visuals (errors.length===0) сохраняются.
7. **Мерж-поверхность** — КОНЕЦ tests/ui-panel.test.js (append; общая
   точка для параллельных задач — ребейз поглощает append-конфликт,
   000098 уже в базе) + src/ui-tab-shop.js (чужих задач в зоне НЕТ —
   контракт 000130 §1). Прочие живые worktrees (task-000074/000081/
   000110/000129) — без немерженных коммитов (git log master..HEAD
   пуст) → пересечений нет.
8. **Тултипы строк магазина** — вне 000101 («не больше ТЗ»): пин L980
   «у строки магазина НЕТ .cp-tip» обязан остаться зелёным; комментарий
   ui.js «зона 000101» (L188) — маркер будущей (не заведённой) работы,
   не обещание 000101.
9. **saveNow** — литерал не вводить ни в код, ни в комментарии
   (скан 000130 по readdirSync).

## 10. Важно будущим задачам

* Вкладка «Магазин» — зона ЗАКРЫТА: строки магазина (buy/sell, цены,
  мета) + плейсхолдер живут в src/ui-tab-shop.js; ядро (setShop/
  shopKey-гард, doItemAction, делегированный click, flashNotice) — в
  ui.js. Новая вкладка — по рецепту 000130 §5 (новый файл, ui.js НЕ
  правится).
* Тултипы (.cp-tip) для строк магазина — при появлении задачи:
  itemRow уже принимает tip (4-й аргумент) — но пин ui-panel L980
  и комментарии (ui.js L186-188, ui-tab-shop.js L16) нужно будет
  править ВМЕСТЕ с поведением.
* Точка вызова setShop — hud.js update() (НЕ main.js:1010 — ссылка
  ТЗ устарела); тесты проводки — tests/hud.js.test.js.
* Дочерняя 000051 (редизайн панели): 000101 — последняя из серии
  вкладок (000096/000097/000098/000100/000130/000101); parent-отчёт
  — tasks/result/000051.md.

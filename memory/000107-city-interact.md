# Задача 000107 — взаимодействие в городе через buildingUI

Дата: 2026-10-03. Станция: проектирование (архитектура зафиксирована
до кода; красные тесты и реализация — следующие стадии).
Родитель: 000052 (города и деревни). TZ: tasks/pending/000107.md
(сквозная нумерация, перепривязка с №000101 — см. файл).
Зависимости (уже в master): 000052, 000071 (Game.buildingUI),
000105 (экран города), 000106 (постройки в городе), 000108 (стоки
лавок), 000125, 000128 (Game.buildingActions — домен [E]).
Параллельно (координация, без правок): 000065/000078/000083 (найм).

## Состояние на master (до 000107)

* [E] в мире: main.js L804 keydown (window) → KeyE →
  `G.buildingActions.toggle()` (000128; `toggleNpcDialog` переименован,
  строки main.js:495/498/757 в TZ устарели) → гарды: !npcUI → return;
  combatUI.isActive → return; **dungeonUI.isActive → return (L469)**;
  → openBuildingUI → buildingUI.open (000071) → «Диалог» →
  onBuildingAction L307 (fallback, СУЩЕСТВУЕТ) → openNpcDialog →
  npcUI.open.
* В городе [E] молчал: dungeon-ui не имел ветки KeyE, a toggle() умирал
  на гарде dungeonUI.isActive (в городе dungeonUI активен).
* Город (000105): ds.kind='city', **ds.contents === null** (город «пуст»),
  hint без «[E] — постройки» и без «Сундук и мобы», выход по жёлтой клетке.
* 000106: `G.Cities.generateCityContents(layout, cityX, cityY, cityRecord,
  wealth)` → {buildings:[{x,y,buildingId}], seed} (хутор fp1 → [];
  count = мин_постройки+wealth; ТАВЕРНА 44 ВЕРХНЕЙ).
* 000108: `G.Cities.makeCityShop(cityX, cityY, tx, ty, buildingId, wealth)`
  → 6-полевой {x,y,buildingType,wealth,stock,seed} | null (сток ТОЛЬКО
  у 1 Оружейная и 44 Таверна/прод-пotion).
* ОБЕ функции — чистые, на master БЫЛИ БЕЗ production-вызовчиков
  (000106/000108 доставили только функции). 000107 — ПЕРВЫЙ
  production-вызов generateCityContents.
* ЛОВУШКА: `__game.dungeon` (main.js L1555+) читает
  `ds.contents ? ds.contents.mobs : ...` — ds.contents ОБЯЗАНА
  остаться null в городе (иначе TypeError + пин city-screen C1).
* npcUI.shop-формат = {npc, stock} (ui.js renderTradeTab L467-498);
  у NPC без торговля L475 `npc.торговля.предметы` = TypeError,
  ЕСЛИ shop передан.
* npcForBuilding(NPCS, 44) = Берта (первый в каталоге) — торговля
  и найм У НЕЁ НЕТ (найм — у других NPC, 000083).

## Ключевое (TZ-инварианты)

1. **[E] в городе — ТОЛЬКО через buildingUI** (единый путь, TZ):
   `interactCity` → `buildingUI.open` → «Диалог» → `npcUI.open`.
   `toggle()` (world-путь) в городе НЕ вызывается — гард
   `dungeonUI.isActive` в toggle() **СОХРАНЁН** (TZ: «гард
   main.js:498 сохраняется»; на master это building-actions.js L469).
2. **НИКАКОГО обхода**: прямого npcUI.open из города нет НИГДЕ —
   даже при деградации без buildingUI (console.error + no-op;
   намеренная АСИММЕТРИЯ с деградацией мира, где прямой
   openNpcDialog допустим — в городе обход запрещён категорически).
3. **Интерфейс стока** (TZ: «объект сток-лавки по (город, клетка)»):
   ds.cityShops['tx,ty'] (см. §Контракты, п. 2).
4. Клетка без постройки → [E] ничего не делает.
5. HUD: подсказка города получает строку «[E] — постройки».
6. Найм — НЕ ЗАВИСИМЫЙ: таверна 44 открывает обычный диалог Берты;
   вкладка «найм» работает через npcUI, если NPC имеет поле `найм`;
   КОД НАЙМА НЕ ПРАВИТЬ.

## Что добавлено / перенесено

### 1. src/dungeon-ui.js — ветка KeyE (единый вход [E] в локации)

keydown-обработчик (L186, window) — вставить ПЕРЕД `deltaForEvent`:

```js
// Задача 000107: [E] в городе — единый путь buildingUI (000071).
// onInteract передаётся ТОЛЬКО для города (main.js); в подземелье
// ветка мёртвая (000121: [E] в подземелье — no-op).
if (e.code === 'KeyE' && typeof ctx.onInteract === 'function') {
  e.preventDefault();
  e.stopPropagation();
  ctx.onInteract();
  return;
}
```

* Охрана `typeof ctx.onInteract === 'function'` — ВЕДОМАЯ: в
  подземелье/тестовых хостах onInteract не передаётся → ветка
  не существует → пин 000121 (KeyE в подземелье = no-op, byte-в
  точности: без preventDefault/stopPropagation) сохранён.
* stopPropagation на window НЕ гасит второй window-слушатель
  (main.js L804) — гасит только другие NODE; это НЕ проблема:
  main.js KeyE → toggle() → гард dungeonUI.isActive → return.
* Порядок скриптов: dungeon-ui (674) РЕГИСТРИРУЕТСЯ ДО main.js (678)
  → в городе dungeon-ui ветка срабатывает первой (открывает),
  main.js гард гасит дубль.
* City hint (L295-304): строка города =
  `'Стрелки/WASD — шаг.\nЖёлтая клетка «X» — выход.\n[E] — постройки.'`
  + обновление комментария (строка про «без [E] — 000107» устарела).
  Dungeon hint — БЕЗ ИЗМЕНЕНИЙ.

### 2. src/building-actions.js — домен города (000128-паттерн)

Новая функция `interactCity()` (БЕЗ аргументов; состояние — через
deps, как toggle()):

```
needDeps() → return            (deps не инициализированы)
!deps.game.npcUI → return      (как toggle: без npcUI [E] инертен)
combatUI.isActive → return     (бой выше по стеку)
ds = deps.cityState ? deps.cityState() : null
  ; !ds || ds.kind !== 'city' → return
стек (паритет с toggle):
  buildingUI.isActive → close() → return
  npcUI.isActive      → close() → return          (buildingUI уже закрыт executeAction 000071)
cell = ds.cityContents && Array.isArray(ds.cityContents.buildings)
       ? ds.cityContents.buildings.find(p => p.x === ds.x && p.y === ds.y)
       : null
  ; !cell → return      (клетка без постройки — НИЧЕГО: ни buildingUI, ни npcUI)
b = deps.game.getBuilding ? deps.game.getBuilding(cell.buildingId) : null
  ; !b → console.error + return
!deps.game.buildingUI → console.error('[E] в городе — обход запрещён') + return
npc = deps.game.npcForBuilding ? deps.game.npcForBuilding(deps.npcs, b.id) : null
t = { x: cell.x, y: cell.y, buildingId: cell.buildingId,
      building: b.особые_параметры && b.особые_параметры.map_index != null
               ? b.особые_параметры.map_index : null,
      buildingWealth: ds.cityWealth }
openBuildingUI(t, b, npc)     (СУЩЕСТВУЮЩАЯ — buildingUI.open + actions)
```

* Координаты — ЦЕЛОЧИСЛЕННЫЕ ds.x/ds.y (логическая позиция после
  шага), НЕ ds.pos (glide-рендер 000105).
* buildingUI-список: `buildingEffects.buildingActions(b, npc, state)`
  ВСЕГДА ставит «Диалог» первым при npc != null (building-effects.js
  L777-781); городские записи 1/7/10/25/44 БЕЗ эффектов → ровно
  одна строка «Диалог». npc == null и без эффектов → actions.length
  0 → openBuildingUI false → [E] ничего (CI-U6).
* «Диалог» → onBuildingAction L307 (fallback `action.id==='dialog'
  && npc → openNpcDialog(npc, t)`) — СУЩЕСТВУЮЩИЙ код, городским
  путём достижим (в отличие от apply/specials — они у городских
  записей отсутствуют).
* Экспорт: `interactCity` добавить в exports (L520-530).

Рефакторинг D4 — т.к. t становится ЕДИНСТВЕННЫМ источником координат
(behavior-preserving для мира: tileAt(x,y) возвращает {x,y} = запрос,
map.js — в мире t.x/t.y === player.x/player.y ВСЕГДА; BA2 fake t(5,7)
=== player(5,7)):

* `openNpcDialog`: `tile: { x: t.x, y: t.y, building: t.building,
  buildingWealth: t.buildingWealth }` (было deps.player.x/y);
  `shop: deps.shopFor ? deps.shopFor(npc, t) : deps.npcShopFor(npc.id)`.
* `openBuildingUI` L402 (state для эффектов): `tile: { x: t.x, y: t.y }`
  (было deps.player.x/y). Для города — семантически верная клетка
  (world-якорь входа был бы неверен); дневные ключи эффектов
  'x,y:effectId' (000072) в городе становятся ключами «клетка
  города» — см. §Подводные камни п. 7 (000091).
* `toggle()` — НЕ ТРОГАЕТСЯ (гард L469 сохранён, пин CI-U9 зелёный).

### 3. src/locations.js — генерация содержимого при входе

`makeCityState` — +3 поля по умолчанию (форма ds стабильна;
LOC-5 проверяет только СУЩЕСТВУЮЩИЕ поля — безопасно):

```js
cityContents: null,  // {buildings:[{x,y,buildingId}], seed} | null (000107)
cityShops: null,     // {'tx,ty': makeCityShop 6-полевой} | null (000107)
cityWealth: null,    // 0..3 | null (000107)
```

`maybeEnterCity` — ПОСЛЕ `createCityLayout` (layout существует;
ax/ay — ЯКОРЬ, как в layout):

```js
const wealth = t.buildingWealth;
let cityContents = null, cityShops = null, cityWealth = null;
if (Number.isInteger(wealth) && wealth >= 0 && wealth <= 3 &&
    G.Cities && typeof G.Cities.generateCityContents === 'function') {
  cityContents = G.Cities.generateCityContents(layout, ax, ay, rec, wealth);
  cityWealth = wealth;
  cityShops = {};
  if (typeof G.Cities.makeCityShop === 'function') {
    for (const bl of cityContents.buildings) {   // Фикс. порядок = порядок generateCityContents
      const s = G.Cities.makeCityShop(ax, ay, bl.x, bl.y, bl.buildingId, wealth);
      if (s) cityShops[bl.x + ',' + bl.y] = s;   // null-записи (не 1/44) пропускаем
    }
  }
} else {
  console.error('locations.js: generateCityContents/wealth отсутствуют — город без содержимого');
}
const ds = makeCityState(layout, rec, player.x + ',' + player.y,
  { intervalMs: ctx.intervalMs });
ds.cityContents = cityContents; ds.cityShops = cityShops; ds.cityWealth = cityWealth;
return ds;
```

* ЖЁСТКАЯ (eager) генерация стоков при ВХОДЕ — не ленивая:
  000109 (restore) подменит те же поля в той же точке; порядок
  детерминирован (порядок buildings из generateCityContents).
* Хутор (51, fp1): generateCityContents → {buildings: []} →
  cityShops = {} (ПУСТОЙ объект, не null — содержимое есть,
  построек нет); [E] в хуторе — ничего.
* ds.contents — НЕ ЗАДОЛГАСЯ (null) — ловушка __game.dungeon.
* generateCityContents/makeCityShop THROW на невалидных входах
  — вызываем только при проверенном wealth и typeof-гардах.
* exitCity — НЕ ТРОГАТЬ (000109 добавит свой механизм сохранения).

### 4. src/main.js — проводка (тонко, 000128-паттерн)

* `function cityOnInteract() { if (G.buildingActions) G.buildingActions.interactCity(); }`
  (hoisted; в разделе локации рядом с cityOnMove).
* `function shopFor(npc, t)` (hoisted) — ЕДИНСТВЕННЫЙ решатель
  shop-формата {npc, stock} для npcUI:
  ```js
  function shopFor(npc, t) {
    const ds = dungeonState;
    if (ds && ds.kind === 'city' && ds.cityShops && t) {
      const s = ds.cityShops[t.x + ',' + t.y];
      if (!s) return null;
      // Таверна (44): у Берта НЕТ торговля — гасим null ДО npcUI
      // (иначе TypeError в ui.js renderTradeTab L475).
      if (!npc || !npc.торговля || !Array.isArray(npc.торговля.предметы)) return null;
      return { npc, stock: s.stock };
    }
    return npcShopFor(npc.id);   // мир — как было (КЛЮЧЕВОЙ)
  }
  ```
* deps bundle (L757) +2 поля:
  `cityState: () => dungeonState` (getter-замыкание; `let dungeonState`
  объявлено L655 ДО wiring — валидно) и `shopFor`.
* `startLocationUI(onMove, onInteract)` — 2-й аргумент опционален;
  `G.dungeonUI.start({... onMove, onInteract, ...})`.
  enterLocation: `startLocationUI(ds.kind === 'city' ? cityOnMove : dungeonOnMove,
  ds.kind === 'city' ? cityOnInteract : undefined)` — в подземелье
  onInteract === undefined → ветка dungeon-ui мёртвая (000121).
  Debug-вызов `startLocationUI(dungeonOnMove)` (L1622) — НЕ ТРОГАТЬ.
* cityOnMove — гейт оверлеев (паритет с миром, main.js L826-827):
  ```js
  if ((G.buildingUI && G.buildingUI.isActive()) ||
      (G.npcUI && G.npcUI.isActive())) return;
  ```
  (обиде каналы: keyboard dungeon-ui ctx.onMove и touch D-pad
  main.js touchMove → onMove).
* `__game.dungeon` + `buildings: ds.cityContents ? ds.cityContents.buildings : null`
  (тесты/отладка; mobs/chests по-прежнему null; хендофф 000109).
* Комментарий KeyE-ветки (L808) — уточнить: в городе реальный путь —
  dungeon-ui → interactCity; здесь гард toggle() гасит дубль.
* main.js НЕ ДОЛЖЕН содержать строку `onBuildingAction` (BA7 static
  pin) и ДОЛЖЕН содержать `G.buildingActions` + `.toggle(` (у нас:
  G.buildingActions.interactCity — пинов не ломает).

### 5. НЕ ТРОГАТЬ

src/building-ui.js, src/ui.js, src/npc.js, src/hud.js, src/items.js,
src/map.js, src/dungeon.js, src/cities.js (функции 000106/000108 —
чистые, вызываем, не правим), index.html (НЕТ новых скриптов —
UMD-правило 000038), SPEC.md (TZ), код найма 000078/000083 (TZ),
touch [E] (000121 — остаётся no-op в городе, расширение — отдельная
задача), ds.contents, dungeonMemory формат, exitCity, save-формат
(000109).

## Контракты и границы

1. **interactCity()** — без аргументов; вызывается ТОЛЬКО из
   cityOnInteract (main.js) по KeyE в городе. Возвращает void.
   Небывалые ситуации = console.error + no-op (игра не падает,
   UMD-деградация 000053).
2. **Сток (TZ: «объект сток-лавки по (город, клетка)»)**:
   * Хранение: `ds.cityShops['tx,ty']` → 6-полевой makeCityShop
     `{x:tx, y:ty, buildingType, wealth, stock:{itemId:qty}, seed}` | null.
     Ключ 'tx,ty' — координаты КЛЕТКИ В ГОРОДЕ; «город» кодируется
     идентификатором ds (ds — инстанс города на визит).
   * Подача в npcUI: `deps.shopFor(npc, t)` → `{npc, stock}` | null.
     Формат у npcUI ВСЕГДА {npc, stock} (6-полевой — только в
     cityShops).
   * Сток в npcUI виден ТОЛЬКО у NPC с торговля (Бренн, Оружейная 1).
     Таверна 44: Берта без торговля → shop null → вкладка «торговля»
     «Этот NPC не торгует.» (как таверна в мире; TZ: код NPC не править).
   * 000108 (параллельная): интерфейс зафиксирован — 000108
     ДОБАВЛЯЕТ сохранение/восстановление этих же объектов
     (формат dungeonMemory['cx,cy'] = {lastVisitDay, stock:
     {'tx,ty': {itemId: qty}}}), НЕ МЕНЯЕТ форму 6-полевого.
3. **Координаты [E]**: ds.x/ds.y (целые). Синтетический tile t:
   `{x, y, buildingId, building: map_index|null, buildingWealth}`.
   hasBuilding/inBuilding не нужны (openBuildingUI/onBuildingAction
   читают t.buildingId/t.building/t.buildingWealth + b из каталога).
4. **Стек-семантика [E]** (паритет с миром): buildingUI открыт →
   закрыть; npcUI открыт → закрыть; иначе открыть buildingUI.
5. **Гарды**: combatUI.isActive (и в dungeon-ui, и в interactCity);
   needDeps; !npcUI. Гард dungeonUI.isActive — в toggle() (L469),
   НЕ УБИРАТЬ, НЕ ПЕРЕНОСИТЬ.
6. **Найм**: таверна 44 → Берта → buildingUI → «Диалог» → npcUI;
   вкладка «найм» — если NPC с полем `найм` (000083); найм НЕ
   обходит buildingUI (кода найма в городе нет — он в npcUI).
7. **HUD hint**: город = 3 строки (вкл. «[E] — постройки.»);
   подземелье — БЕЗ ИЗМЕНЕНИЙ.
8. **Движение**: заблокировано при открытом buildingUI/npcUI
   (cityOnMove гейт) — паритет с миром.

## Ленивые ссылки и guards

* interactCity: ВСЕ Game-рефы через deps (deps.game.getBuilding /
  buildingUI / npcUI / combatUI / npcForBuilding, deps.npcs,
  deps.cityState()) — вызов только по keydown после инициализации;
  needDeps() на входе.
* deps.cityState — getter `() => dungeonState` (let L655, замыкание
  валидно при wiring L757).
* shopFor — обычная функция main.js, видна wiring-у (объявлена
  hoisted-комментарием до использования в bundle).
* maybeEnterCity: typeof-гарды на G.Cities.generateCityContents /
  makeCityShop ПЕРЕД вызовом (деградация: console.error + поля null
  → [E] в городе no-op; мир не падает).
* dungeon-ui KeyE-ветка охранена `typeof ctx.onInteract === 'function'`
  (дungeon-хосты без onInteract — ветка не существует).
* shopFor: guard `npc.торговля && Array.isArray(npc.торговля.предметы)`
  — ЗАЩИТА ОТ TypeError в ui.js renderTradeTab (L475) — ОБЯЗАТЕЛЬНА
  (не только наличие entry в cityShops: entry есть у 44, а Берта
  не торгует).

## Что важно будущим задачам

* **000109 (сохранение/респаун города)**: ИМЕНА ПОЛЕЙ ЗАФИКСИРОВАНЫ —
  `ds.cityContents`, `ds.cityShops`, `ds.cityWealth` (НЕ переименовывать).
  Точка расширения — maybeEnterCity: ветка «восстановить из
  dungeonMemory вместо generateCityContents» (сейчас — генерация).
  Сток восстанавливать в те же 6-полевые cityShops по ключам 'tx,ty'
  (поле stock = сохранённое {itemId: qty}); seed/wealth/buildings —
  из сохранения. Формат (000108): dungeonMemory['cx,cy'] =
  {lastVisitDay, stock: {'tx,ty': {itemId: qty}}}. exitCity
  расширит 000109 (000107 НЕ трогает).
* **000091 (эффекты таверны)**: apply/specials state и дневные ключи
  'x,y:effectId' (000072) читают state.tile — после D4 в городе это
  КЛЕТКА ГОРОДА (правильная семантика), НО ключ ГЛОБАЛЬНЫЙ по сейву:
  два города с одинаковыми клетками (3,4) и одинаковым эффектом
  СПОРИЛИ бы. В 000107 городские эффекты ОТСУТСТВУЮТ (пул 1/7/10/25/44
  без эффектов) — 000107 НЕ ЛОМАЕТ; 000091 ОБЯЗАН переделать ключ
  на (город, клетка), добавляя первые городские эффекты. НЕ решено
  здесь (TZ не требует).
* **000078 (таверна в городе, найм)**: путь готов — таверна 44 → Берта
  → buildingUI → npcUI; если Берте дадут поле `найм` — вкладка «найм»
  заработает без правок 000107.
* **000121 (touch [E])**: touch-ветка в городе НЕ трогается — no-op;
  расширение на interactCity — отдельная задача (пины controls byte-в
  точности). Ревью 2026-10-03 зафиксировало UX-разрыв как вход
  для дочерней задачи: в тач-схеме города видны и строка hint
  «[E] — постройки.» (000107) и тач-кнопка [E] (000123 — кнопки
  [E]/[I] в обеих схемах), но ТАП [E] — no-op: routeTouchScreen
  (000121) гасит город в ветку 'dungeon' (город рендерится
  dungeonUI) → else-ветка onInteract main.js пуста. Варианты
  дочерней задачи: (а) city-ветка в routeTouchScreen/touchScreens
  (kind='city' из dungeonState) или в ветке screen==='dungeon'
  onInteract → buildingActions.interactCity() + красный тест;
  (б) приглушить строку hint для тач-схемы. Пинов controls
  byte-в-точности (000121) НЕ сломать.
* **Коррекция memory/000105**: строка «000107 — поднимет гард
  dungeonUI.isActive в toggleNpcDialog» УСТАРЕЛА — гард НЕ ПОДНИМАЕТСЯ,
  а СОХРАНЯЕТСЯ (toggle в городе не вызывается; путь — interactCity
  через dungeon-ui). [ПРИМЕНЕНО в правках по ревью 2026-10-03:
  строка в memory/000105-city-screen.md заменена.]
* **000106**: generateCityContents теперь имеет production-вызовчик
  (maybeEnterCity) — её контракт (детерминизм, порядок, исключение
  хутора) — см. memory/000106; golden-пины cities НЕ ТРОГАТЬ.
* **000128**: deps bundle +2 поля (cityState, shopFor) — контракт
  §2.2 memory/000128 расширяется; surface building-actions +interactCity.

## Подводные камни

1. **__game.dungeon**: `ds.contents ? ds.contents.mobs : ...` —
   ds.contents ОСТАЁТСЯ null (cityContents — ОТДЕЛЬНОЕ поле).
   Заполнение ds.contents = TypeError в городе + ломает city-screen C1.
2. **ui.js renderTradeTab L475**: `npc.торговля.предметы` у не-торгующего
   NPC = TypeError, если shop передан. shopFor обязан гасить null по
   guard-у торговля (entry в cityShops ЕСТЬ у таверны 44!).
3. **BA7 static pin**: main.js НЕ содержит `onBuildingAction`, содержит
   `G.buildingActions` + `.toggle(`. cityOnInteract —
   G.buildingActions.interactCity (ок); строку `onBuildingAction`
   в main.js НЕ ИСПОЛЬЗОВАТЬ.
4. **000121 pin** (controls + dungeon-ui host): KeyE в подземелье =
   no-op (без preventDefault/stopPropagation, winListeners length 1).
   Ветка dungeon-ui охранена onInteract; в dungeon-хосте onInteract
   НЕ ПЕРЕДАЁТСЯ (2-й аргумент startLocationUI — только для города).
5. **ЕДИНСТВЕННОЕ санкционированное правление теста**:
   tests/dungeon-ui.test.js L2184-2212 — инверсия пина hint
   `!hint.includes('[E]')` → `hint.includes('[E] — постройки')` +
   переименование теста. ВСЁ ОСТАЛЬНОЕ (C1-C5, B1-B23, BA1-BA7,
   LOC-*, cities golden, index-order, controls) — БЕЗ ИЗМЕНЕНИЙ.
6. **BA2 deepEqual пин** (p.tile, p.shop): D4 безопасен — fake t(5,7)
   === player(5,7); shop: fake deps БЕЗ shopFor → fallback npcShopFor
   → {shopFor:'npc_x'} как было (BA2 зелёный без правок).
7. **Дневные ключи 000072**: 'x,y:effectId' глобальные по сейву —
   для города (после D4) = ключи клетки города; междугородний СПОР
   — зона 000091 (см. §Важное). НЕ решено в 000107.
8. **Порядок listener'ов**: dungeon-ui (674) ДО main.js (678) на window.
   В городе: dungeon-ui открывает (interactCity), main.js гард гасит.
   stopPropagation (window) НЕ гасит window — не полагаться на него
   против main.js; полагаться на гард toggle().
9. **Хутор fp1**: buildings: [] → cityShops: {} (не null) → [E] —
   ничего. НЕ путать «пустой объект» (содержимое сгенерировано,
   построек нет) с null (генерация не сработала).
10. **Не добавлять скрипты в index.html** (UMD 000038) — все
    изменения в существующие файлы.

## Тесты (план)

**Новый tests/city-interact.test.js**:

Юнит (fake deps, паттерн makeEnv из building-actions.test.js):
* CI-U1: [E] на клетке с постройкой (npc у неё есть) → buildingUI.open
  ровно 1 раз (title — из b.название lowercased); onAction({id:'dialog'})
  → npcUI.open payload: {npc, character, book, tile:{x,y,building,
  buildingWealth}, shop:{npc, stock: городской 6-полевой→stock},
  onChange: saveNow, day}; fake npcShopFor НЕ вызывается (city-ветка
  shopFor).
* CI-U2: клетка без постройки → ничего (buildingUI/npcUI не вызваны).
* CI-U3: cityContents null → ничего.
* CI-U4: стек: buildingUI.isActive → [E] закрывает (npcUI НЕ открывается);
  npcUI.isActive → [E] закрывает.
* CI-U5: combatUI.isActive → [E] ничего.
* CI-U6: npc == null и эффектов нет → actions пусто → openBuildingUI
  false → buildingUI.open НЕ вызывается.
* CI-U7: таверна (44, Берта без торговля) → shop в npcUI payload = null;
  оружейная (1, Бренн) → shop = {npc, stock} (stock из cityShops).
* CI-U8: needDeps (deps не инициализированы) → no-op, не падает.
* CI-U9 (ЗЕЛЁНЫЙ ПИН, регрессия): toggle() при активном dungeonUI →
  return (гард L469 НЕ тронут).

VM full-chain (index.html CHAIN, host-паттерн city-screen.test.js
+ building-actions BA5; NOW=1000; map.png onerror → generateSeedPixels):
* CI-V1 (КРАСНЫЙ): зайти в город (findNearest isCity, ширина >= 2),
  дойти до клетки с постройкой (walkTiles по __game.dungeon.buildings),
  KeyE → buildingUI открыт (spy/состояние).
* CI-V2 (КРАСНЫЙ): Enter/Digit1 «Диалог» → npcUI.open (вкладка
  «торговля» видима у Бренна; у Берты — «не торгует»).
* CI-V3 (КРАСНЫЙ): hint города содержит «[E] — постройки»; hint
  подземелья БЕЗ изменений.
* CI-V4 (ЗЕЛЁНЫЙ ПИН): клетка без постройки → [E] ничего.
* CI-V5 (ЗЕЛЁНЫЙ ПИН): KeyE в НАСТОЯЩЕМ подземелье → ничего (000121).
* CI-V6: повторный [E] закрывает buildingUI; ещё [E] (npcUI открыт)
  → закрывает npcUI.
* CI-V7: с открытым buildingUI/npcUI — движение (WASD/стрелки)
  НЕ двигает героя (cityOnMove гейт).
* CI-V8: содержимое на входе: __game.dungeon.buildings deepEqual
  generateCityContents реcompute; на entrance/exit клетках постройки
  НЕТ; все buildingId ∈ {1,7,10,25,44}.

**Правления существующих** (санкционированные/технические):
* tests/dungeon-ui.test.js L2184-2212: инверсия hint-пина +
  переименование (TZ санкционирует).
* tests/building-actions.test.js: BA1 surface list + 'interactCity';
  BA5 surface list + 'interactCity' (техническое).

**Регрессия**: npm test (node --test) — ВСЕ зелёные (1356+ тестов;
в т.ч. city-screen C1-C5, B1-B23, BA1-BA7, LOC-*, cities golden,
controls, index-order, 000121).

## Файлы и ожидаемая дельта

| Файл | Изменение | Дельта (строк) |
|---|---|---|
| src/building-actions.js | + interactCity() (~45 + комментарии); export +1; openNpcDialog tile/shop (~3 стр); openBuildingUI state tile (1 стр) | +~52 / −4 |
| src/locations.js | makeCityState +3 поля; maybeEnterCity генерация (~18) | +~25 |
| src/main.js | + shopFor (~18); + cityOnInteract (~5); startLocationUI +onInteract (~2); enterLocation onInteract (~2); cityOnMove гейт (~4); deps +cityState/+shopFor (+2); __game.dungeon +buildings (+2); комментарий KeyE (~1) | +~36 |
| src/dungeon-ui.js | KeyE-ветка (+7 вкл. комментарий); city hint (1 стр); комментарий hint (~2) | +~10 / −1 |
| tests/city-interact.test.js | НОВЫЙ: CI-U1..U9 + CI-V1..V8 | +~500 |
| tests/dungeon-ui.test.js | инверсия hint-пина + переименование (L2184-2212) | ±4 |
| tests/building-actions.test.js | surface + 'interactCity' (2 места) | +2 |
| memory/000107-city-interact.md | этот файл | новый |
| CHANGELOG.md | (факт: правки по ревью 2026-10-03, секция 2026-10-03) | +9 |
| index.html / SPEC.md / остальные src | НЕ ТРОГАТЬ | 0 |

## Коммиты (стадии)

1. Красный (с памятью): memory/000107-city-interact.md +
   tests/city-interact.test.js (красные CI-V1..V3, V6..V8 + юнит
   CI-U1..U8) + правления dungeon-ui/building-actions тестов.
   → «Задача 000107: красные тесты»
2. Реализация: src/building-actions.js, src/locations.js,
   src/main.js, src/dungeon-ui.js. → «Задача 000107: [E] в городе
   через buildingUI»
3. Отчёт/память/done: «Задача 000107: отчёт, память, перенос задачи
   в done»
4. CHANGELOG (игровой процесс): «Задача 000107: CHANGELOG — [E] в
   городе открывает постройки (диалог/торговля)» — 2026-10-03.
   [ФАКТ: запись внесена в коммит «правки по итогам ревью»
   2026-10-03 — раньше стадии мержа (мажорное finding ревью;
   прецедент 000093).]

## Ревью 2026-10-03 (правки по итогам ревью)

7 findings трёх ревьюеров (пара дублей: touch-[E] ×2, memory/000105
×2). Вердикты и действия:

* MAJOR (исправлено): запись CHANGELOG отсутствовала, хотя задача
  меняет gameplay (игроковое [E] в городе + строка hint). Добавлена
  секция «## 2026-10-03 / ### Игровой процесс» — «[E] в городе»
  (формат по существующим записям; программная часть не
  перечисляется). После ребейза секция 2026-10-03 существует на
  master (000083/000093) — при мерже записи ОБЕИХ сторон остаются
  под одной секцией.
* MAJOR (исправлено): CI-U1 полным deepEqual payload-а
  гарантированно падал ПОСЛЕ ребейза на master — 000083 добавил в
  тот же npcUI.open-payload ключи roster/deadMercs (strict
  deepEqual чувствителен к extra-ключам с undefined — проверено).
  Подтверждено эмпирически на trial-merge-дереве (task/000107 +
  master, merge-tree чистый): 16/17, падает ровно CI-U1. Фикс:
  сравнение ПОЛЕ-В-ПОЛЕ 7 полей контракта 000107 (npc, character,
  book, tile, shop, onChange, day) — пин roster/deadMercs за
  тестами 000083; зелёно и на базе ветки, и на merged-дереве.
  Альтернатива из finding (roster: [] в фейковых deps + expected)
  отклонена: красила бы текущую базу ветки.
* MINOR (исправлено): устаревшая строка в memory/000105-city-
  screen.md («000107 поднимет гард dungeonUI.isActive в
  toggleNpcDialog») — заменена на «гард СОХРАНЁН; путь —
  interactCity() через dungeon-ui ctx.onInteract, только для
  города» (обещанная здесь коррекция применена). tasks/result/
  000105.md (та же строка) НЕ трогаем — отчёт завершённой задачи
  (задачи в master менять нельзя).
* MINOR (исправлено): деградационная ветка interactCity «!Game.
  buildingUI → обход запрещён» (ТЗ §2) была единственной из пяти
  деградационных веток без пина — добавлен CI-U10 (hook
  makeDeps {noBuildingUI: true}; assert: buildingUI.open/npcUI.
  open не вызваны, console.error содержит «обход запрещён»,
  исключений нет).
* MINOR ×2 (дубль; без правок — осознанное решение scope): ТАП
  [E] в городе — no-op, хотя hint «[E] — постройки.» и тач-кнопка
  [E] видны в тач-схеме. ТЗ предписывает только keydown-путь
  («dungeon-ui keydown → callback») и «НЕ ТРОГАТЬ» controls.js;
  регрессии нет (до 000107 тап [E] в городе тоже был no-op, и hint
  не было). Зафиксировано как вход дочерней задачи — пункт 000121
  в «Что важно будущим задачам».

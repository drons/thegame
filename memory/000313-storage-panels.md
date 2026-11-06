# 000313 — склад: прокрутка + панели «инвентарь | склад», dnd + кнопки

## Контракт оверлея (payload buildingUI.open)

`openOverlay` (src/building-effect-storage.js) передаёт buildingUI:
`{ title: 'Хранилище', actions, onAction, layout: 'storage',
capacity: { n, m } }`. Поля `layout`/`capacity` — ADDITIVE (000313);
`title`/`actions`/`onAction` — бит-в-бит 000221/000222 (контракты
city-storage R7/R8/R9 и building-levels R14 цёлы — полного
deepEqual payload'а нигде нет, только `.map(a => a.id)` и
по-полевые ассерты). `capacity.n` = `res.storage.length`, `m` =
ёмкость по уровню (40 + 20×(L−1), 000222) — заголовок правой панели
«Склад (N/M)».

## Две панели (src/building-ui.js)

`o.layout === 'storage'` — отдельная ветка buildDom:
- оверлей — класс `combat-overlay combat-overlay--storage`;
- `.storage-cols` — ровно 2 `.storage-col`: слева
  `storage-col--inv` (заголовок «Инвентарь»), справа
  `storage-col--stock` (заголовок «Склад (N/M)», фолбэк «Склад»
  без capacity);
- строки actions распределяются по панелям по `a.side`
  ('inv' → левая, 'stock' → правая); пустое состояние — ОДНА
  disabled-строка `id:'empty'` в ПРАВОЙ панели (строки-put/take
  обе пусты).

## Строка (ADDITIVE поля в buildRows)

`side` ('inv'/'stock'), `btn` («Сложить»/«Вынуть»),
`icon`/`rarity`/`meta` — из каталога через `g.getItem(e.id)`
(`itemFields`): нет каталожной записи — поля отсутствуют
(деградация строки без меток). Формат `meta` — формат вкладки [I]:
`(weight × qty).toFixed(1) + ' кг, ' + value + ' з'`. Рендер —
ОДИН общий конструктор `makeItemRow(a, i, o, opts)` (building-ui.js,
используется в ОБЕИХ ветках buildDom — дефолтная `cp-items`:
`opts = {}`, storage-панели: `{rarity, meta, btn, draggable: true,
dimAlways: true}`): div.cp-itemrow (+ `cp-rarity-<rarity>`),
data-buid, disabled, icon → `img.cp-itemicon` (иначе числовой чип
span.cp-btn), `span.cp-itemname`, meta → `span.cp-itemmeta`,
reason-спэн (`cp-itemreason` при reasonRed), btn → `button.cp-btn`
(disabled = !доступен), `row.draggable = !!a.доступен` (ЯВНО —
см. подводные камни) + dragstart/dragend-слушатели — только при
`opts.draggable` (storage); disabled-строка — opacity 0.3
(storage — ВСЕГДА: `dimAlways`; дефолт — подавляется reasonRed —
бит-в-бит поведение дефолтной ветки master до 000313).

**itemRow (src/ui.js:679) — НЕ переиспользуется (решение,
ретро-фикс 000313, закрывает ТЗ п.4 «не дублировать»):**
closure-внутренняя функция IIFE ui.js — публичного экспорта нет,
вкладкам доступна только через ctx (000130); сигнатура
`(name, meta, buttons, tip, icon, rarity, tipIcon)` НЕ совпадает
с контрактом строки building-ui (data-buid, disabled, чип-фолбэк
номера, reason-спэн, draggable/drag-слушатели; tip в оверлее нет);
building-ui.js — самостоятельный IIFE (000071) БЕЗ зависимостей на
внутренности ui.js (горячий файл, зона 000097). Экспорт itemRow из
ui.js — вне SCOPE. Дедупликация — В РАМКАХ building-ui.js: удалён
`makeStorageRow` (побайтовая копия дефолтной ветки + storage-
дополнения) — построение строки ЕДИНОЕ. Статический пин — S8
(storage-panels-000313: определение makeItemRow = 1, makeStorageRow
отсутствует, setAttribute data-buid / cp-itemname / rarity-класс /
dragstart — по ОДНОМУ вхождению; обе ветки — общий конструктор).

## ОДНА мутация (transferWith)

`transferWith(res, spec)`, `spec = { from: 'inv' | 'storage',
index, itemId? }` — ЕДИНЫЙ путь переноса. ВСЕ входы сходятся в
него:
- кнопка `button.cp-btn` → executeAction → onAction → perform;
- клик по строке (o.click → executeAction) → тот же путь;
- dnd-drop → executeAction(findAction(id)) → тот же путь;
- put-*/take-* строки [E]-меню (storageMenuRows 000221) — пайплайн
  делегирует спец-у 'storage' → perform.

`perform(ctx, a)` — пере-резолв LIVE (resolveCtx), transferWith,
reopen ВСЕГДА, возврат пайплайну `{ok:false}` БЕЗ message
(«спец обработал сам» — §2.6 000128). save/flash/render — сам
хендлер, не пайплайн.

put (`from:'inv'`): индекc-гард (integer ≥ 0) → itemId-гард →
`storagePut` (ЧИСТЫЙ, src/cities.js: merge по (id, bonusState),
стек ≤ 99; полный — когда нужен НОВЫЙ entry и out.length > cap →
`{ok:false}`) → полный: flash «Хранилище полное», `{ok:false,
reason:'full'}`, НИЧЕГО не мутировано, сейва нет → успех: СЛОТ
СПЛАЙСНУТ (`slots.splice(at, 1)` — quick НЕ трогается: 000223 —
быстрый слот своя единица), `assignStorage` (замена массива
storage на LIVE built-записи), saveNow, flash «Сложено: <имя>
×<qty> (улучш.)», playerRender, `{ok:true}`.

take (`from:'storage'`): индекс-гард → `storageTake` (ЧИСТЫЙ,
точный индекс) → itemId-гард → dry-run `canAddItem` (отказ —
flash reason, all-or-nothing, сейва нет) → `addItem` (merge) →
assignStorage + saveNow + flash «Вынуто: <имя> ×<qty> (улучш.)»
+ playerRender + `{ok:true}`.

stale-индекс / stale-itemId / не-ок-резолв / битый spec —
`{ok:false}` ТИХО (ни flash, ни сейв). doPut/doTake 000221 —
удалены (заменены transferWith). Node-экспорт —
`{ storageHandler, transfer }`, где `transfer(ctx, spec)` =
resolveCtx + transferWith (000313 — новый экспорт; 000221
экспортировал только storageHandler).

## Kонтракт drag-n-drop (building-ui.js)

Состояние — МЕНДЛЕР-ПЕРЕМЕННАЯ `dragging = { id, side } | null`
(не dataTransfer!):
- `dragstart` (строка): гард `a.доступен` (disabled-строку не
  тащить); `dragging = { id: String(a.id), side }`;
  `dataTransfer.effectAllowed = 'move'`,
  `dataTransfer.setData('text/plain', id)`;
- `dragover` (панель): `preventDefault` ТОЛЬКО если
  `dragging && dragging.side !== колСайд` (бросок в свою же
  колонку — запрещён на уровне dragover);
- `drop` (панель): no-op, если `!dragging || dragging.side ===
  колСайд`; иначе preventDefault + `executeAction(findAction(id))`
  + `dragging = null`;
- `dragend` (строка): `dragging = null`; `close()` тоже
  `dragging = null`.

`dataTransfer.getData` — НИГДЕ не читается: валидность переноса —
по модульному состоянию, не по dataTransfer (тестовый fake-
событие делает getData BРОСАЮЩИМ — доказательство). Drop по
stale-строке (findAction → null) — no-op: 0 мутаций/флэшей/сейвов.

## CSS (index.html, <style>, после правила 000299.01
.combat-overlay--build .cp-itemrow .cp-itemname)

```
.combat-overlay--storage .combat-side { width: min(720px, 94vw); }
.storage-cols { display: flex; gap: 8px; }
.storage-col { flex: 1; min-width: 0; max-height: calc(100vh - 190px);
  overflow-y: auto; }
.storage-col .cp-itemrow .cp-itemname { min-width: 0;
  overflow-wrap: break-word; }
```

Скролл-контракт — `.storage-col`: max-height + overflow-y auto
(каждая панель скроллится ОТДЕЛЬНО). Пины — статический парсинг
cssRule (первое совпадение точного селектора), паттерн
build-menu-layout.

## Сейвы (семантика)

saveNow — ТОЛЬКО при успешном put/take. Открытие оверлея — без
сейва. Мир-шаги в vm-тесте сейвятся сами (saveNow →
localStorage) → ВСЕ сейв-пины в тесте РЕЛЯТИВНЫЕ (счётчик
setItem до/после операции — `storage.saves`).

## Spec-пины (тот же коммит)

- spec/buildings.md 546 → 552: буллет в H3 «Модель взаимодействия»
  ПОСЛЕ буллета 000312 (ряд портретов) и ДО «Постройка без NPC и
  без эффектов — [E] ничего не делает (как сейчас).» — «Хранилище»
  (000313): две панели, dnd + кнопки — ОДНА мутация, строка —
  иконка/rarity/«X.X кг, Y з», прокрутка. W7-пин
  spec-000312-wording — phrase-based (не позиционный) — цёл.
- RE-PIN (тот же коммит): tests/spec-split.test.js
  SPEC_FILE_LINES buildings.md 546 → 552 (коммент-цепочка +000313).

## Тесты (tests/storage-panels-000313.test.js, 15)

S1a–S1e CSS (cssRule), S2 (структура панелей, строки, иконки,
кнопки, заголовки, empty-строка, открытие без сейва/флэша),
S3 (кнопки: put/take — мутация + flash + сейв + reopen), S4 (dnd:
паритет с кликом по state+flash+сейвам, no-op-кейсы, ровно 6
сейвов на 6 переносов), S5 (ёмкость 40/40: disabled/draggable
false/«(40/40)»/drop no-op), S6a–d (node-экспорт transfer: put
ok/full/stale, take ok/merge/stale, полный инвентарь all-or-
nothing, прямой onAction-обход — паттерн R8(g) 000221), S7
(payload: бит-в-бит 000221 + additive layout/capacity/icon/
rarity/meta, onAction put, [E]-инлайн-делегирование), S8
(ретро-фикс — статический пин дедупликации строки: ОДИН общий
makeItemRow в обеих ветках buildDom, см. § «Строка»).
RED-коммит — 13 осмысленных красных (не краш загрузки),
S1e-гард зелёный; S8 на префиксовом источнике — осмысленный
красный (14/15 — только S8).

## Подводные камни

- **vm-realm deepStrictEqual**: объекты vm-песочницы — с
  ПРОТОТИПОМ песочницы; deepStrictEqual с host-литералом падает
  («identical» содержимым). Пины состояния — через JSON-копию
  (`copyOf = (v) => JSON.parse(JSON.stringify(v))`) — конвенция
  building-levels R14.
- **flash и кадр**: `flash()` (main.js) только ставит
  hudFlash/hudFlashUntil — текст появляется НА СЛЕДУЮЩЕМ кадре.
  До любого hudText-ассерта — `hudFrames(h, now)`.
- **порядок put-строк после отката**: addItem ДОПИСЫВАЕТ в КОНЕЦ
  slots — после take-отката put-0 = ПЕРВЫЙ слот, а не последний
  перенесённый предмет. Тест пинит setData-id явно (S4(c) — put-1
  = Сера, S4(f) — put-0 = Кожа).
- **setQuick (000223)** физически снимает 1 предмет из
  inventory-слота: put предмета с quick-слотом переносит qty−1
  (S6a: wood_log ×3 → на складе ×2, quick[0] не тронут).
- **DOM-стаб Proxy**: чтение НЕПОСТАВЛЕННОГО свойства возвращает
  `() => undefined` (truthy!) → makeEl хардкодит `draggable:
  false` по умолчанию; реализация ставит row.draggable ЯВНО на
  каждой storage-строке (дефолтные строки — как в master, без
  свойства; иначе NEG-пины «draggable false» ложно-зелёные).
- **onAction не на DOM-элементе**: onAction — поле PAYLOAD'а
  (модульная переменная building-ui), у оверлей-элемента в DOM
  её нет. Прямой onAction-обход (R8(g) 000221) пинится ТОЛЬКО в
  node-фикстуре (buildingUI-стаб собирает payload'ы в `opens`).
- **master впереди base**: base worktree f5b6d91, master
  (на момент финализации) 2935705+ — rebase на финализации.
  spec-split: строка buildings.md (546→552) НЕ пересекается со
  строками мастера (spells 439 / npc 41 / skills 132 /
  dungeons-storage 213) → авто-мерж чистый. CHANGELOG 2026-11-05
  «### Игровой процесс» — ВЕРОЯТНЫЙ конфликт (мастер добавил
  буллет 000283.01.01 суккуба) — разрешить сохранением обоих
  буллетов.

## 0-diff (проверено)

src/ кроме building-effect-storage.js + building-ui.js; spec/
кроме buildings.md; tests/ кроме storage-panels-000313 +
spec-split; index.html — 4 CSS-правила (в SCOPE); CHANGELOG —
буллет (в SCOPE); tasks/ pending→done + result; memory/ — новый
файл. assets/; schema.json; сейв-форматы; прочие тесты — 0-diff.

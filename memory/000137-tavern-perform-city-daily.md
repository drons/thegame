# 000137: Таверна «Выступление» (44_perform) + городской daily-ключ

Статус: ВЫПОЛНЕНО (финализация 2026-10-05, отчёт tasks/result/
000137.md), ждёт мержа. Архитектура зафиксирована анализами a1/a2/a3
+ ПОЛНОЙ сверкой с кодом (станция Проектирование, 2026-10-05); файл
коммичен красной стадией вместе с тестами.
Сверка (2026-10-05, worktree-база 375c0f4 = master; ТЗ писали на 6231447 —
ВСЕ цитаты ТЗ перепроверены по коду, точны): building-actions.js
(onBuildingAction L167-352: apply-state L176-191, спец-ctx L301-321,
маркировка L341-345, openBuildingUI L419-465, interactCity L568-627,
comment L133-145), building-effects.js (EFFECTS 44-блок L451-477,
hasDailyLimit L564-577, readOncePerDay L579-586, canUseTodayLazy L596-605,
catalogEffect L725-733, coinGold L1385-1390, applyFountainCoin L1447-1490,
applyTavernRumors L1578-1618, buildingActions L1780-1828, unavailableReason
L1760-1765, exports L2312-2350), day.js (DAY_MAP_KEY_RE L203,
restoreDayMap L228+), building-effect-44_rest.js (91 стр. — ШАБЛОН),
building-effect-49.js (handlerCoin L74-85), main.js prepareCityState
L1715-1755 (резолв якоря — ЗЕРКАЛИТСЯ, не ссылка), player.js
(derived L247 performanceIncomeMult = 1 + pct('artist'); skillLevel L373
= c.secondary[id] || 0), skills-data.js L431-441 (artist: secondary,
primary charisma, perLevel 0.1), locations.js makeCityState (ds.worldKey
L140 — 'x,y'), kаталоги 000044/000049.json, index.html L754-807,
tests: building-actions.test.js (makeEnv L82-127, BA2 L182-244, BA4 L271+,
BA4(e) L397 пин '5,7:ba4_ok'), building-effects.test.js (makeState L114,
mkHero L1229, A1 L128-180, A65 L3114-3165, A66 L3165+ (require-в-теле
теста — паттерн red-модуля), B26 L6878-6950, B27 L6953+),
city-interact.test.js (makeCityDs L139-157 — БЕЗ worldKey!, makeDeps
L160-230 — getMap захардкожен без buildingAnchor; CI-U1 deepEqual n.tile
L264), index-order.test.js (список L35-59, пин 44_rest L995-1003,
vm-load L1006-1052), day.test.js L196 (джанк-пин '1,2:heal:sub'),
building-ui.js executeAction L107-110 (оверлей закрывается САМ после
onAction + повторная проверка action.доступен).

Родитель: 000001 (волна аудита 1, P3). Зависимости (смержены): 000091
(таверна), 000128 (шаблон спец-модулей), 000072 (ключ 'x,y:effectId'),
000013 (derived live). Контракты: 000053 (каталог-драйвен + деградации),
000038 (UMD-ловушка: снапшот Game один раз, не переприсваивать),
000092 (per-эффектный раз_в_день, fail-open).
Ловушка: memory/000107-city-interact.md:147-148, :382 (локальные
координаты; междугородний спор — зона 000091, «НЕ решено в 000107»).
Якорь для будущих: memory/000001-improvement-audit.md §3/§6/§7.
Файл задачи tasks/pending/000137.md → tasks/done + отчёт tasks/result
на стадии finalize.

## Что добавлено (область задачи)

* `src/building-effect-44_perform.js` (НОВЫЙ, ~95 стр.) — спец-модуль
  «Выступления» (шаблон 44_rest; см. «Контракты», п.4).
* `src/building-effects.js`:
  * `EFFECTS['44_perform'] = { имя:'Выступление', available, apply }` —
    вставка ПОСЛЕ `EFFECTS['44_rumors']` (L474-477), групповой
    комментарий «000137»; ВНЕ зоны 000133 (записи 40/42 L383-390);
  * `dailyKeyFor(tile, effectId)` — рядом с readOncePerDay/canUseTodayLazy
    (L581-605, зона daily-инфраструктуры);
  * `performGold`, `applyTavernPerform`, `performAvailable` — рядом с
    applyTavernRumors (после L1618, зона таверны);
  * `buildingActions` L1799: `const key = dailyKeyFor(tile, id);`
    (единственная правка существующей строки: было
    `tile.x + ',' + tile.y + ':' + id`);
  * exports: + performGold, applyTavernPerform, performAvailable,
    dailyKeyFor (комментарий «Задача 000137»).
* `src/building-actions.js`:
  * interactCity (L610-622): резолв якоря (см. п.3) + поле `cityAnchor`
    в синтетическом t;
  * openBuildingUI L432: state.tile + `cityAnchor: t.cityAnchor || null`;
  * onBuildingAction L176-191 (apply-state): + отдельное поле
    `cityAnchor: t.cityAnchor || null` (НЕ внутри tile — пин BA2(b));
  * onBuildingAction L341-345 (маркировка): `BE.dailyKeyFor(t, action.id)`
    (было deps.player.x/y);
  * комментарий L135-137 — формат ключей (город — якорь, мир — тайл).
* `assets/buildings/000044.json` — 3 правки (п.5) + РЕГЕНЕРАЦИЯ зеркала
  `src/buildings.js` (npm run sync:buildings; entry 44 — GENERATED-блок).
* `index.html` — тег ПОСЛЕ building-effect-44_rest.js (L755), ДО
  building-content.js (L761); комментарий 000137.
* Тесты: 6 красных (DK1, PF1-PF4, IO1) + техправки A1/A65/B26/B27/
  index-order (см. «Подводные камни», п.3).
* memory: этот файл + 000137-tavern-perform.md (шпаргалка: формула,
  формат ключа, спец-модуль).
* CHANGELOG.md — раздел 2026-10-05 «Игровой процесс» (отдельный коммит).

НЕ ТРОГАЕТСЯ: day.js (DAY_MAP_KEY_RE!), main.js, locations.js, player.js,
skills-data.js, cities.js, hud.js, building-ui.js, building-effect-
44_rest.js, SPEC.md, schema.json (особые_параметры — loose object),
44_rest/44_rumors (эффекты, сиды RUMC/RUMT/RUM2), apply-state tile
({x: player.x, y: player.y}) и спец-ctx tile (BA2(b)/BA4(c) пины +
сиды 44_rumors), .merge-pending (только стадия мержа), push.

## Контракты и границы

### 1. Формат городского daily-ключа (ЯКОРЬ ДЛЯ ВСЕХ БУДУЩИХ
ГОРОДСКИХ ЭФФЕКТОВ С ЛИМИТОМ — audit §7)

**Ключ раз-в-день ВСЕГДА = `<целое_X>,<целое_Y>:<effectId>`** (2 целых
координаты + ОДИН суффикс без пробелов/запятых/двоеточий — форма
DAY_MAP_KEY_RE day.js:203):
* **мир** — (X,Y) = тайл постройки (deps.player.x/y === t.x/t.y —
  инвариант 000107 D4); поведение БЕЗ ИЗМЕНЕНИЙ, байт-в-байт (пин
  BA4(e) '5,7:ba4_ok'→5);
* **город** — (X,Y) = **якорь города** = `buildingAnchor` входного
  тайла (`ds.worldKey` → `map.tileAt(ex,ey).buildingAnchor`; тот же
  ключ, что cityStates/anchorKey 000109). Якорь стабилен на весь
  footprint города (все тайлы делят cover.anchor, map.js:978) и
  уникален на город (51..54: хутор 1×1 … столица 7×7).

Почему НЕ `<ax>,<ay>:<tx>,<ty>:<effectId>` (вариант А ТЗ): ДВА
двоеточия не проходят DAY_MAP_KEY_RE → restoreDayMap (day.js:228)
МОЛЧА отбросил бы марку при загрузке сейва (лимит сбрасывался;
смысловой регресс, тестами не ловится); day.test.js:196 фиксирует
двуточие-джанк; src/day.js не в файлах ТЗ. Вариант Б — единственный.

**Семантика — per-(город, эффект)**: в одном городе несколько таверн
(generateCityContents pickType может повторить TAV_ID; деревня
wealth 0 — все постройки таверны) шарят ОДИН раз-в-день на
«Выступление» — допустимо («герой выступает один раз в день в
городе», зафиксировано). Future per-клетка — ТОЛЬКО расширением
DAY_MAP_KEY_RE (осознанный прецедент, не в этой задаче).

**Столкнений мир/город НЕТ**: мирный ключ — координаты тайла
таверны, городской — координаты якоря города (тайл постройки
51..54); на тайле одна buildingId (tileAt) → таверна никогда не
стоит на якорном тайле города → пары различны.

**Миграции НЕТ**: ни одна городская постройка (1,7,10,25,44)
не имеет раз_в_день → городские ключи никогда не писались.

### 2. ЕДИНАЯ точка построения ключа — dailyKeyFor

`dailyKeyFor(tile, effectId)` (building-effects.js, export):
tile.cityAnchor — непустая строка → `cityAnchor + ':' + effectId`;
иначе → `tile.x + ',' + tile.y + ':' + effectId` (мир — дословно
текущий формат). Четыре стороны идут через ОДНУ строку (текущий
баг = расхождение write/read):
* **mark** — onBuildingAction (building-actions.js L341):
  `BE.dailyKeyFor(t, action.id)` (t — тот же объект замыкания
  openBuildingUI; в мире t.x/t.y === player.x/y → behavior-preserving);
* **read (оверлей)** — buildingActions (L1799):
  `dailyKeyFor(tile, id)`, tile = st.tile (cityAnchor внутри);
* **available** — performAvailable (st.tile, тот же ключ);
* **re-check в apply** — applyTavernPerform (см. п.4, ключ из
  st.tile + отдельного st.cityAnchor).

### 3. cityAnchor: резолв и прокладка

* **Резолв — interactCity (building-actions.js)** (единственная точка;
  зеркало prepareCityState main.js:1726-1745, НЕ ссылка):
  `ds.worldKey` → 'ex,ey' → `deps.getMap().tileAt(ex,ey)` →
  `buildingAnchor` → `cityAnchor = 'ax,ay'` (строка) в синтетическом
  t (рядом с x/y/buildingId/building/buildingWealth). Гарды:
  worldKey == null / не 'целое,целое' (parts.length===2 +
  Number.isInteger) → **тихо null** (fake ds тестов CI-U не имеют
  worldKey — без console.error шума); map/tileAt/buildingAnchor
  (Array, length 2, оба Number.isInteger) отсутствует → **console.
  error + null** (wiring-сбой 000053; в production недостижимо —
  cityContents генерируются только из якоря).
* **Прокладка**: t.cityAnchor → openBuildingUI: state.tile.cityAnchor
  (для buildingActions/performAvailable) И apply-state.cityAnchor
  ОТДЕЛЬНО (для re-check в apply). `t.buildingAnchor` НЕ использовать
  (в мире это якорь САМОЙ постройки — другое понятие; синтетический
  городской t его не имеет).
* **Деградация** (cityAnchor = null): mark (onBuildingAction)
  И read (оверлей buildingActions + performAvailable) деградируют
  на ключ по КЛЕТКЕ ГОРОДА ОДИНАКОВО (dailyKeyFor без якоря →
  «cellX,cellY:44_perform») — согласованно, игра не падает (как
  до фикса на деградации); лимит на этом пути держит read-сторона
  (строка оверлея disabled). RE-CHECK В APPLY на этом пути
  деградирует ИНАЧЕ (ревью 2026-10-05 — осознанный допуск):
  apply-state.tile зафиксирован пином BA2(b) как тайл героя
  ({x: player.x, y: player.y} — в городе это МИРОВОЙ тайл ВХОДА:
  cityMove мутирует только ds.x/ds.y, player.x/y не меняются), а
  КЛЕТКУ ГОРОДА из apply-state восстановить невозможно (t — только
  в замыкании onBuildingAction) → ключ re-check =
  «entryWX,entryWY:44_perform» ≠ ключ марки → марку re-check НЕ
  ВИДИТ: защита «stale-повтор = отказ в apply» на этом пути молча
  отключается. Путь НЕДОСТИЖИМ в production: worldKey всегда
  «целое,целое» (locations.js:292 — player.x+','+player.y при
  входе); входной тайл всегда имеет buildingAnchor (maybeEnterCity
  требует t.hasBuilding — map.js:978); из UI недостижим (оверлей
  закрывается сам после onAction, строка затем disabled —
  building-ui executeAction). Альтернатива (клетка города в
  apply-state) ломает пин BA2(b) — НЕ ДЕЛАТЬ.
* Целочисленный Number('') === 0 — ловушка: worldKey проверяется
  ДО Number() (parts.length + isInteger), не `String(wk||'')`.

### 4. Эффект 44_perform (реестр + apply + available + спец-модуль)

* Реестр: `EFFECTS['44_perform'] = { имя:'Выступление',
  available: (st) => performAvailable(st), apply: (st) =>
  applyTavernPerform(st) }`.
* **Формула** (чистая `performGold(eff, level, mult)`, export,
  паттерн coinGold; не-числа → 0):
  `Math.round(Math.round(база + шаг × level) × mult)`.
  eff = ст.catalog.особые_параметры.эффект.выступление
  `{ база: 10, шаг: 2, навык: 'artist' }` (из каталога — 000053;
  навык в каталоге — паттерн фонтана 000049.json). level =
  G.skillLevel(hero, eff.навык). mult = G.derived(hero).
  performanceIncomeMult — **LIVE-чтение** (000013) в apply,
  не-finite → 1 (fail-open 000029). НЕТ Math.random/Date/(tile,day)-
  сидов — функция ТОЛЬКО (каталог, level, mult) (ТЗ «детерминизм»).
  Outer round — ЦЕЛОЕ золото (combat.js:706, coinGold): mult =
  1+0.1L даёт дробь при L=1,2,3,4,7,8,9 (L=1: 12×1.1=13.2→13).
  Золотые пины (реальный каталог): L=0→10, L=5→30, L=10→60.
* **applyTavernPerform(st)** (паттерн applyFountainCoin; ЧИСТО —
  снапшот не мутирует): гарды → `{ ok:false, message:'недоступно' }`:
  нет G/G.skillLevel/G.derived; каталог-мусор (выступление не объект /
  база/шаг не-finite / навык не строка); нет hero. Успех —
  `{ ok:true, success:true, gold, message:'Выступление: +N золота.' }`.
  **RE-CHECK марКИ В APPLY** (защита в глубину, отличие от
  существующих эффектов — осознанное): ключ (st.tile + st.cityAnchor)
  + readOncePerDay(st.save, key) + canUseTodayLazy(last, st.day) —
  уже сегодня → `{ ok:false, message:'выступал сегодня' }` (роутер:
  flash, БЕЗ марки/saveNow/render). Почему: золото — НЕ clamp-аемо
  (в отличие от исцеления фонтана): stale-повторный вызов обязан
  быть отказом на ВСЕХ путях; оверлей в игре закрывается сам
  (building-ui executeAction) — stale-вызов недостижим, но гарантия
  состояния — в apply.
* **performAvailable(st)** (паттерн dailyContentAvailable L1028):
  hasDailyLimit(st.catalog,'44_perform') === false → true; иначе
  key = dailyKeyFor(st.tile,'44_perform'), last = readOncePerDay,
  !canUseTodayLazy(last, st.day) → **'выступал сегодня'** (строка ТЗ —
  видна в оверлее; unavailableReason опрашивается ДО generic «уже
  использовано сегодня» — generic для 44_perform недостижим).
* **Спец-модуль** `src/building-effect-44_perform.js` (шаблон 44_rest
  1:1; НЕ Object.assign-паттерн 49): UMD; node — factory(null) →
  `{ tavernPerform }` (без регистрации, тихо); browser —
  G = root.Game: нет G → тихий выход; нет
  G.buildingActions.registerSpecial → console.error (фикс. текст:
  'building-effect-44_perform.js: Game.buildingActions отсутствует —
  src/building-actions.js обязан грузиться ДО этого модуля
  («Выступление» таверны не работает)') + НЕ регистрировать;
  `registerSpecial('44_perform', (ctx) => tavernPerform(ctx && ctx.r,
  ctx && ctx.hero))`.
* **tavernPerform(r, h)** (паттерн handlerCoin 49): (!r || !r.ok ||
  !h || typeof h !== 'object') → `{ ok:false, message:'Таверна:
  выступление недоступно.' }` (дефенсивный — apply-отказ роутер
  гасит ДО хендлера); при r.success && r.gold > 0 →
  `h.gold = (Number.isFinite(h.gold) ? h.gold : 0) + r.gold`
  (h — ЖИВАЯ ссылка hero бандла main.js — «исполнение ханками
  main.js», 000071); возврат `{ ok:true, message: r.message }`
  (r.message ПЕРВЫМ — роутер). **День НЕ проходит**: clock не
  трогать (в отличие от 44_rest). saveNow/марка/flash/playerRender —
  АВТОМАТИКА роутера (onBuildingAction L337-351) — хендлер не дублирует.

### 5. Каталог 000044.json (3 правки, остальное — НЕ ТРОГАТЬ)

* `эффекты: ["44_rest", "44_rumors", "44_perform"]` — АППЕНД (порядок
  оверлея dialog/44_rest/44_rumors/44_perform; Digit2/3 B26/B27 не
  сдвигаются; Digit4 = 44_perform);
* `раз_в_день: { "44_perform": true }` — per-эффектный объект
  (000092): 44_rest/44_rumors — ключа нет → лимита НЕТ (как до);
  BOOLEAN нельзя (поставил бы лимит на rest/rumors задним числом —
  регресс B24/B25/A65);
* `эффект.выступление: { "база": 10, "шаг": 2, "навык": "artist" }` —
  рядом с эффект.слухи (8 строк текстов — НЕ ТРОГАТЬ).
  База/шаг 10/2 — МАСШТАБ золотого дохода фонтана (000049.json
  золото_база 10 / золото_шаг 2); L=0 → ровно 10 = база одной
  монеты (якорь баланса).
* `даёт`, `малая`, `map_index`(11), `название_карты`, `виды`,
  `функция` — НЕ ТРОГАТЬ (строго по ТЗ). Зеркало — sync:buildings
  (см. «Подводные камни»).

## Ленивые ссылки и гарды (000053)

* Все Game-функции — lazyGame() (globalThis.Game) в МОМЕНТ ВЫЗОВА:
  G.skillLevel, G.derived (applyTavernPerform), G.canUseToday (в
  canUseTodayLazy). Модуль грузится с НОЛЕМ зависимостей.
* 44_perform: не-числовые каталожные поля → 'недоступно' (apply);
  mult не-finite → 1; hasDailyLimit без каталога → запись реестра
  разВДень (нет) → false; readOncePerDay мусор → undefined (fail-open:
  доступно).
* cityAnchor: см. п.3 (тихо null на отсутствующий worldKey;
  console.error на wiring-сбой; null → mark/read/available — ключ
  по клетке города ОДИНАКОВО, re-check в apply — ключ мирового
  тайла входа: марку не видит — осознанный допуск, недостижимо в
  production; §3).
* Спец-модуль: standalone — 0 console.error; без buildingActions —
  console.error + без регистрации (игра не падает); BE отсутствует в
  deps (маркировка) — `if (BE && BE.hasDailyLimit(...))` сохранён —
  марки нет, как до.
* h.gold не-числовой → 0 (битый сейв не роняет, 000029).

## Что важно будущим задачам

1. **Городской daily-ключ — этот формат для ВСЕХ будущих городских
   эффектов с лимитом** (audit §7; ловушка 000107 закрыта):
   `<cityAnchorX>,<cityAnchorY>:<effectId>`, якорь = buildingAnchor.
   interactCity УЖЕ доводит cityAnchor в t → новые городские эффекты
   получают ключ БЕЗ новой проводки: mark (BE.dailyKeyFor(t, id)) +
   read (dailyKeyFor(st.tile, id)) работают автоматически; лимит —
   в каталог per-эффектным объектом.
2. **Dead-stat performanceIncomeMult ЗАКРЫТ** (первый потребитель).
   Dead-stat-пин «каждый stat имеет потребителя» (audit §5) — только
   после ВСЕХ 4 (caveVisionMult 000136, fearChance §4.8,
   magicResistMult §4.1) — не заводить в этой задаче.
3. **index.html — слот спец-модулей** (между building-actions.js и
   main.js): параллельные задачи/онбординг §4.6 (audit §6) добавляют
   теги в тот же слот — правило: спец-модули ДО main.js, пин
   не-смежный (union).
4. **Re-check в apply** — паттерн для будущих ГРОТОВЫХ эффектов
   с лимитом (gold/предметы без clamp): если повторный вызов
   опасен — apply перечитывает марку из снапшота. Clamp-аемые
   эффекты (исцеление) re-check не требуют.
5. **Ключ всегда `<int>,<int>:<id>`** — единый контракт
   DAY_MAP_KEY_RE; per-клеточные городские лимиты потребуют
   расширения regex + новых пинов day.test.js (прецедент решения —
   осознанно НЕ делать, пока не потребуется).

## Подводные камни

1. **apply-state tile и спец-ctx tile — НЕ ТРОГАТЬ**
   ({x: player.x, y: player.y}): BA2(b) deepEqual(state.tile,
   {x:5,y:7}), BA4(c) deepEqual(ctx.tile, {x:5,y:7}) — пины формы;
   В ГОРОДЕ это входной мир-тайл = сиды 44_rumors (тексты слухов
   менялись бы = смена игрового контента, анти-ТЗ). cityAnchor —
   ОТДЕЛЬНОЕ поле state (BA2-совместимо: пин — по полям, не
   по всему объекту).
2. **boolean раз_в_день у 44** — регресс лимитов 44_rest/44_rumors
   (B26/B27 «повтор в тот же день — доступно», A65 hasDailyLimit
   false) — только per-эффектный объект.
3. **Регенерация пинов (техническая, не семантическая)** — прецедент
   «пин регенерирован по фактическому коду» в каждом ребейзе:
   A1 MERGED/UNION += '44_perform' (+стр. комментария); A65 —
   эффекты/effectIds/оверлей deepEqual += '44_perform' (аппенд),
   пин p44.раз_в_день undefined → { '44_perform': true }, +
   hasDailyLimit(44,'44_perform')===true; B26/B27 rows +=
   '44_perform' (аппенд, Digit2/3 не сдвигаются); index-order —
   список модулей.
4. **Зеркало src/buildings.js** — GENERATED-блок, ТОЛЬКО
   `npm run sync:buildings` (byte-пин tests/buildings.test.js +
   drift-гейт npm run sync:check); JSON + зеркало — ОДИН коммит.
   schema.json — НЕ менять (особые_параметры — open object).
5. **UMD-ловушка (000038)**: тег ПОСЛЕ building-actions.js и ДО
   main.js; модуль НИКОГДА не переприсваивает root Game (шаблон
   44_rest, НЕ 49). Битый порядок = console.error + «Выступление»
   не работает тихо → ловят пин index-order + vm-тест IO1.
6. **day.js не трогать**: двухдвоеточные ключи — мусор
   (day.test.js:196); формат города обязан проходить ТЕКУЩИЙ
   regex.
7. **CI-U fake ds БЕЗ worldKey** (makeCityDs city-interact.test.js)
   и getMap без buildingAnchor → резолв якоря обязан тихо
   деградировать (null) на отсутствующий worldKey — иначе
   console.error в каждом CI-U прогоне.
8. **Конфликты волны**: building-effects.js — общий с 000133
   (записи 40/42 L383-390): вставка 44_perform — ПОСЛЕ 44_rumors
   (L477+), ВНЕ зоны 40/42; index.html — только 000137 в волне
   тегирует (audit §6); building-actions.js — только 000137.
9. **Red-тесты не require() новый файл на верхнем уровне** —
   require в теле теста (паттерн A66: MODULE_NOT_FOUND = осмысленный
   красный) или readFileSync+vm (IO1: ENOENT).
10. **Порядок каталога эффектов** определяет номера строк оверлея
    (Digit2/3/4) — сдвиг порядка = дрейф e2e (A65 фиксирует порядок).

## Ревью (2026-10-05, станция «правки по итогам ревью»)

Три ревьюера, 6 findings (все minor) — вердикты и фиксы:

1. **CHANGELOG: гарантированный конфликт «## 2026-10-05» при
   ребейзе — РЕАЛЕН.** master сдвинут с базы ветки (375c0f4 →
   0397799: смержен 000132; git merge-tree — единственный конфликт
   CHANGELOG.md): ОБЕ ветки добавили раздел «## 2026-10-05» на
   ОДНОМ месте (после шапки) — лут 000132 (уже в master) и таверна
   000137 (в ветке). **НА СТАДИИ РЕБЕЙЗА**: разрешить ТОЛЬКО
   объединением в ОДИН раздел «## 2026-10-05» с подгруппой
   «### Игровой процесс» и двумя пунктами: «Лут с мобов при
   победе» (000132 — как в master) + «Выступление в таверне»
   (000137); формат/подгруппы 1:1 с существующими записями;
   ours/theirs целиком НЕ использовать (потеря player-facing
   записи / дублирующий заголовок).
2. **Re-check в apply на деградированном городском пути (cityAnchor
   = null) строит ключ не по той клетке — РЕАЛЕН (неточность
   контракта, zero-поведение).** mark/read — по клетке города,
   re-check — по мировому тайлу входа (apply-state.tile пин
   BA2(b)) → марку не видит. Фикс — ДОКУМЕНТАЦИЯ (§3, «Ленивые
   ссылки и гарды», JSDoc dailyKeyFor/applyTavernPerform):
   осознанный допуск, путь недостижим в production (locations.
   js:292, map.js:978, building-ui executeAction); лимит держит
   read-сторона (строка disabled). Клетку города в apply-state —
   НЕ передавать (ломает BA2(b)).
3. **CHANGELOG-вход не в отдельном коммите — РЕАЛЕН
   (процедурный).** Исправлено пересборкой ветки: e24be12
   (реализация+CHANGELOG) заменён на 652c2e8 (реализация, БЕЗ
   CHANGELOG.md) + b1ecfa9 «Задача 000137: CHANGELOG — …»
   (прецеденты волны 000132/000135/000136).
4. (= 2, второй ревьюер) — фикс общий с 2.
5. (= 3, третий ревьюер) — фикс общий с 3.
6. **Деградация «спец-модуль 44_perform отсутствует» (тег удалён
   из index.html — сценарий заперт пином IO1 + vm-self-
   registration тестом): apply-успех с gold, но specials нет →
   марка + saveNow + flash «Выступление: +N золота.» БЕЗ
   начисления h.gold, без console.error — РЕАЛЕН, принят как
   ОСОЗНАНАЯ ТИХАЯ ДЕГРАДАЦИЯ (кода не менять): ТЗ ограничивает
   правки роутера (ключ + cityAnchor-проводка — не больше); игра
   не падает, сейв не ломается; аналог 44_rest (без спец-а
   действие тихо не срабатывает — ветка «НЕТ ДЕЙСТВИЯ»).
   console.error в РОУТЕРЕ не добавлять: (а) вне ТЗ; (б) путь
   легитимно проходит node-тест DK1 (спец-модуль в node-ветке не
   регистрируется) — лог «битая проводка» в корректном тесте =
   ложный сигнал; (в) в production недостижим (IO1).

# 000221 — Город: здание «Хранилище» (склад предметов из инвентаря)

Задача (tasks/pending/000221.md, неизменяемый master-документ): «Добавить
возможность строить в городах особый вид здания - хранилище, куда персонаж
может сложить предметы из инвентаря.»

Стадия Проектирование, 2026-10-16, workflow task-000221 (worktree
`.worktrees/task-000221`, ветка task/000221). Анализы: a1-domain (домен),
a2-arch (архитектура, черновик), a3-tests (карта тестов). Анализы расходились
по 4 ключевым вопросам (слот 12 vs 13; поле storage vs vault; хранение
per-building vs per-city; цена 100 vs 75) — ниже ФИНАЛЬНЫЕ решения, каждое
с обоснованием. Все якоря (строки кода) проверены по коду worktree.

## 1. Финальные решения (D1–D12)

### D1. Каталог: `assets/buildings/000055.json` (id 55 «Хранилище»)
```json
{
  "id": 55,
  "название": "Хранилище",
  "категория": "прочее",
  "функция": "Склад: персонаж может сложить предметы из инвентаря и вынуть их обратно.",
  "типичный_npc": null,
  "допустимые_тайлы": ["песок", "трава", "лес", "холмы"],
  "особые_параметры": {
    "даёт": "склад предметов (сложить/вынуть из инвентаря)",
    "малая": true,
    "эффекты": ["storage"],
    "размещение": { "слот": 12, "доля": 0 },
    "хранилище": { "слоты": 40 },
    "стройка": {
      "золото": 100,
      "исходники": [
        { "предмет": "assets/items/000035.json", "количество": 2 },
        { "предмет": "assets/items/000036.json", "количество": 2 }
      ]
    }
  }
}
```
Почему: id 55 = следующий свободный (каталог 1..54; инвариант sync-скрипта
id = номер файла). `категория: "прочее"` (7→8, EXPECTED_COUNTS).
`типичный_npc: null` — прецедент 48/49 (player-buildable без NPC; «Диалог»-
строки не будет). `малая: true` + без `.размер` — конвенция 1×1
player-buildable (44/45/46/49; buildingSize дефолт 1×1). `допустимые_тайлы`
— 4 тайла как у 48: формальное поле (canBuildAt его НЕ читает; мир-генерация
типом 55 не пользуется — D2). `эффекты: ["storage"]` — строка [E]
data-driven (D8). `хранилище.слоты: 40` — базовая ёмкость (D5, задел 000222).
`стройка` — строго по под-схеме schema.json (000207: ссылка
"assets/items/NNNNNN.json"; sync запекает в id). Цена/исходники — D12.
СХЕМУ НЕ ТРОГАТЬ: `особые_параметры` — свободный object (additionalProperties
не false; «хранилище»/«размещение»/«эффекты» проходят как есть), assets-
schemas/assets-refs — авто-свип.

### D2. Мир бит-в-бит: НЕТ `map_index` + ЯВНОЕ `доля: 0` (решение против
варианта «нет поля доля» a1)
Почему: (a) без map_index — buildingCount() = 13 не меняется (map.test.js
:887/:942/:948/:964), `hash2(x,y,GLOBAL_SEED) % buildingCount()` и ВСЕ
мировые goldens — побайтово; (b) map.js subtypeTable (:595) фильтрует
`Number.isInteger(r.доля) && r.доля > 0` → 55 НИКОГДА не выбирается
подтипом слота 12; (c) ЯВНОЕ `доля: 0` (а не отсутствие поля) — тестовые
хелперы map.test.js subtypeSetFor/subtypeTableFor (:1823/:1834) суммируют
доли АРИФМЕТИЧЕСКИ (30 + 0 = 30, без NaN) и проверяют Членство (set.has) →
map.test.js проходит БЕЗ ПРАВКИ; (d) единственным местом правки 000073-
семейства становится tests/buildings.test.js:920 (см. §7): 10→11
записей-подтипов, SUBTYPE_PLACEMENT_0073[12] = {46:30, 55:0}, диапазон доли
1..100 → 0..100; «сумма долей < 100» итетирует ЗАКРЕПЛЁННУЮ таблицу (30+0=30
< 100 — зелёный).

### D3. Спрайт — слот 12 (npc_house.svg), НОВЫХ SVG НЕТ (решение против
слота 13 + storage.svg a3)
Почему: cityBuildingPath (dungeon-ui.js:468) и buildIconPath
(building-actions.js:589) резолвят слот = map_index | размещение.слот →
buildingSprite(12) → npc_house.svg (базовый BUILDING_SPRITES[12] ИЛИ
slotSpriteTable[12] — запись 25 «Дом кузнеца» несёт тот же путь). Контракт
000202 (memory/000202-building-menu-ui.md R4: «иконки — СУЩЕСТВУЮЩИЕ
слотовые спрайты, 0 новых SVG», иконка меню = 1:1 cityBuildingPath)
сохранён 1:1. Слот 13 требовал бы правок src/map.js (BUILDING_TYPES) +
src/sprites.js (литерал BUILDING_SPRITES) + новый SVG + репины svg/
000211.07/allAssetPaths при нулевой пользе для ТЗ — отвергнуто
(минимальный diff, «не больше, чем просит ТЗ»). Семантика: склад = «дом»
(погреб/казна) — допустимо. Следствие: «спрайт»-поле у 55 НЕТ (000211.07 —
«ровно 18 из 55 записей с "спрайт"» — числитель НЕ меняется, знаменатель
54→55).

### D4. Состояние: `storage` ВНУТРИ built-записи (per-building), ПЕРСИСТЕНТНО
Форма (та же, что c.inventory.slots — 000046):
```
record.built[i] = { x, y, buildingId: 55, player: true,
                    storage: [ {id, qty, bonus?}, … ] }   // qty 1..99
```
Почему per-building (решение против city-level `vault` a2): (a) 000222
(«чем выше уровень — в хранилище помещается больше предметов») — ёмкость
естественно пер-building (уровень здания → его ёмкость); city-level vault,
делённый между несколькими зданиями, делает вторую постройку бесполезной
(общие 40 слотов) и размывает 000222; (b) main.js НЕ ТРОГАЕТСЯ —
prepareCityState (main.js ~:2455, ЛОВУШКА-ЗАМЕНА 000148.05) копирует
`saved.built` ЦЕЛИКОМ (`...(saved.built ? { built: saved.built } : {})`) →
вложенное поле storage едет существующим spread'ом (верифицировано по коду);
city-level поле, наоборот, СГОРЕЛО бы без правки spread'а; (c) семантика:
здание = сам склад, [E] на здании — его содержимое; жизненный цикл привязан
к постройке (разборка непустого — отказ, D10). Bonus-формат: {damage|armor|
amount} — один ключ, int ≥ 1 (000046); merge-ключ = (id, bonusState)
(bonusState items.js:224 — канонический ключ).

### D5. Ёмкость: 40 ЗАПИСЕЙ (catalog-driven), стак ≤ 99
`особые_параметры.хранилище.слоты: 40` — int ≥ 1 (иначе 0 → здание строится,
склад недоступен, flash — дефенсивный случай). 40 — произвольный
дизайн-выбор: 40×99 = 3960 ≈ 2× макс. инвентаря (20 слотов × 99 = 1980);
число в каталоге — меняется JSON'ом без кода (принцип 000053); 000222
наращивает через уровень (модель готова: ёмкость = f(каталог, уровень)).
Стак ≤ 99 = MAX_STACK (items.js) — паритет с инвентарём.

### D6. Ядро — 5 ЧИСТЫХ функций в СУЩЕСТВУЮЩЕМ src/cities.js
```
storageCapacity(buildingId) → int
  // каталог: особые_параметры.хранилище.слоты (int ≥ 1), иначе 0;
  // id ∉ каталогу — 0 (НЕ throw: гард, не ошибка вызывающего)
storageSanitize(storage) → array
  // чистая КОПИЯ; запись валидна ⇔ id — непустая строка, qty — int 1..99,
  // bonus — plain-object (не массив/null) ИЛИ отсутствует; битая ЗАПИСЬ →
  // console.warn (msg содержит «cities», 000029) + отброс ЗАПИСИ (не поля);
  // не-массив на входе → [] (WARN выдает вызывающий — validateCityState)
storageAt(record, x, y) → array | null
  // built-запись на клетке (x, y) (player-якорь) → её storage (чистая
  // ссылка на живой массив) | null (нет записи / нет поля / не-player)
storagePut(storage, id, qty, bonus, capacity) →
  { ok: true, storage: array } | { ok: false, reason: 'full' }
  // merge по (id, bonusState): в существующий стак — до 99, остаток —
  // новая запись; число записей ≤ capacity; чистая: НОВЫЙ массив, вход
  // не мутируется
storageTake(storage, index) →
  { ok: true, storage: array, entry: {id, qty, bonus?} } | { ok: false }
  // точный индекс (перенос ЦЕЛОЙ записью); out-of-range — { ok: false };
  // чистая: новый массив
```
Почему cities.js: city-data concern; node-ветка уже требует buildings.js
(каталог — лениво buildingsRef, :426) и items.js → require-пин
tests/cities.test.js (строго ['./perlin.js','./items.js','./buildings.js'])
НЕ ломается — НОЛЬ новых require; node-тесты через loadCities() (прямой
require) — ядро покрывается без vm. 5 имён — в return-блок (:1099-1125,
после builtOccupied). Browser-ветка — те же функции (каталог лениво
rootRef.Game в момент вызова — паттерн buildingsRef).

### D7. validateCityState (cities.js:630) — сохранение storage в built-
записях (ИНАЧЕ — TИХАЯ ПОТЕРЯ при каждой загрузке сейва)
В built-цикле (:657-668), где сейчас `built.push({ x, y, buildingId,
player: true })`: если `e.storage !== undefined` — `const s =
Array.isArray(e.storage) ? C.storageSanitize(e.storage) : null`;
- s !== null (включая пустой результат) → push `{ x, y, buildingId,
  player: true, ...(s.length ? { storage: s } : {}) }` (пустой storage —
  поле omitted, как built.length 0 → D-.05f);
- s === null (битое ПОЛЕ: не-массив) → console.warn («cities» — 000029) +
  4-ключевая запись (поле отброшено, запись жива — паттерн 000148.05).
Записи БЕЗ storage (все существующие) → ровно 4 ключа — byte-совместимо
(R22-R26 000148.05 и 000109 R1-R3 — зелёные без правок). serialize/
restoreCityStates — НЕ меняются (валидация — единая точка).

### D8. Строка [E] «Хранилище» — data-driven, через каталог (решение
против синтетической строки extraActions a2)
Каталог `эффекты: ["storage"]` → effectIds (building-effects.js:640) →
строка `{ id: 'storage', имя: 'Хранилище', доступен: true }` в
buildingActions (:2384). Реестр: `EFFECTS['storage'] = { имя: 'Хранилище' }`
— запись-«сторона» (ТОЛЬКО имя, apply НЕТ) — дословный прецедент лагеря 47
('fire'/'market', building-effects.js ~:615-623, контракт 000128 §2.3).
Точка приложения — КОНЕЦ реестра, после `EFFECTS['fullrest']` (до JSDoc
effectIds). Почему: принцип 000053 (код каталог-драйвен, хардкода id 55 в
building-actions.js НЕТ); строка появляется ПЕРЕД «Разобрать»
(extraActions — конец списка); hasDailyLimit(55,'storage') = false (нет
раз_в_день в каталоге, нет разВДень в записи) → безлимитное пользование,
марка НЕ пишется; id 'storage' — конвенция 000072 (латиница, без
':'/','/пробелов) ✓.

### D9. Спец-модуль `src/building-effect-storage.js` (UMD, паттерн
building-effect-fullrest.js; саморегистрация, НОЛЬ правок main.js)
- UMD: node-ветка `module.exports = factory(null)` → `{ storageHandler }`
  (node-тесты гардов); browser — саморегистрация `G.buildingActions.
  registerSpecial('storage', storageHandler)`. Гарды загрузки: root === null
  → export; !Game → ТИХО return; Game без buildingActions/registerSpecial →
  console.error('building-effect-storage.js: …') + без регистрации
  (деградация 000053 — [E]-строка «умрёт молча» только при wiring-сбое;
  пин index-order держит порядок).
- `storageHandler(ctx)`: гарды в порядке: ctx.t.cityAnchor → ctx.world.
  cityStates (Map) → record = cityStates.get(anchor) → entry =
  C.storageAt(record, t.x, t.y) (нет → {ok:false, message:'Постройка не
  найдена'} — fail-open) → capacity = C.storageCapacity(ctx.b.id) (≤ 0 →
  {ok:false, message:'Хранилище недоступно'}) → world.game.buildingUI
  (нет → console.error + {ok:false, message}). ИТОГ: строит строки,
  `world.game.buildingUI.open({ title: 'Хранилище', actions, onAction,
  scroll: true })` и возвращает `{ ok: false }` БЕЗ message → pipeline
  onBuildingAction молчит (flash/марк/saveNow/render НЕ стреляют — семантика
  «спец обработал сам»; §2.6 memory 000128).
- Строки (FLAT-модель buildingUI: строка = атомарное действие; building-
  ui.js:254 — {id, имя, доступен, reason?}; курсор ↑↓ + 1..9 + Enter + клик
  + Esc — готовый):
  * «Сложить»: по каждой hero.inventory.slots[i] → `{ id: 'put-'+i, имя:
    'Сложить: <имя> ×<qty>' + (bonus ? ' (улучш.)' : ''), доступен:
    storage.length < capacity, reason?: 'хранилище полное (N/M)' }`.
  * «Вынуть»: по каждой entry.storage[j] → `{ id: 'take-'+j, имя: 'Вынуть:
    <имя> ×<qty>' + (bonus ? ' (улучш.)' : ''), доступен: dry-run
    Game.canAddItem(hero, id, qty, bonus).ok, reason? }` (dry-run при
    сборке строк + ПОВТОРНЫЙ dry-run в onAction — состояние между не
    меняется, повтор — дешёвая страховка).
  * Оба списка пусты → одна disabled-строка `{ id: 'empty', имя:
    'Хранилище и инвентарь пусты', доступен: false, reason: 'пусто' }`.
  * Имя предмета — world.game.getItem(id).name (items.js), fallback
    String(id) + console.error (паттерн reagentName).
- `onAction(a)` — СВОЙ замыкатель модуля (НЕ executeAction — строки put-*/
  take-* не идут через pipeline): пере-резолв record/entry LIVE;
  * put-i: identity-проверка slots[i] (e.id === id И bonusState совпадает —
    иначе: без мутации, просто reopen с актуальными строками);
    res = C.storagePut(entry.storage, e.id, e.qty, e.bonus, capacity);
    'full' → world.flash('Хранилище полное') + reopen (без мутации/сейва);
    успех → СПЛИС slots[i] ПО ИДЕНТИЧНОСТИ (НЕ removeItem — R-REMOVEITEM) +
    очистка quick (для каждого quick[k] === id: totalQty(hero, id) === 0 →
    null — прецедент items.js:498-499) + entry.storage = res.storage (мута-
    ция ЛИВ-записи cityStates — точка персиста) + world.saveNow() +
    world.flash('Сложено: <имя> ×<qty>') + world.playerRender() + reopen.
  * take-j: C.storageTake → {ok:false} (индекс сдвинулся) → reopen без
    мутации; dry-run Game.canAddItem → отказ: world.flash(res.reason) +
    reopen (vault НЕ трогается — all-or-nothing); успех → Game.addItem(hero,
    id, qty, bonus) (merge id+bonusState внутри items.js) + entry.storage =
    res.storage + saveNow + flash('Вынуто: …') + playerRender + reopen.
  * Re-open безопасен: buildingUI.open() начинается с close() (:261) и
    executeAction закрывает оверлей ДО onAction (:107-111) → дублей
    оверлея нет; Esc в любой момент — тихое закрытие (без save/flash).
- ГЕЙТЫ main.js — НЕ ТРОГАЮТСЯ: keydown :1922, touchControlsVisibility
  :1974, step-гейт frame :3345 уже гейтят `G.buildingUI.isActive()` →
  пока оверлей открыт — движение/[E]/UI-слои заморожены (тот же механизм,
  что у [E]-меню).

### D10. Разборка непустого хранилища — ОТКАЗ (гард в special 'demolish')
В building-actions.js:1243 (special 'demolish'), после получения record
(:1267), ДО `C.demolishCity` (:1268):
```js
const st = C.storageAt ? C.storageAt(record, t.x, t.y) : null;
if (st && st.length)
  return { ok: false, message: 'Хранилище не пусто — сначала выньте предметы' };
```
Почему: D4 — предметы привязаны к постройке; альтернатива (автовозврат по
R10 refundItems) ОТКЛОНЕНА: риск «инвентарь полон → предметы потеряны» vs
тривиальность отказа; ТЗ не требует разрушать непустой склад. Отказ —
flash БЕЗ saveNow (стандартная семантика specials §2.6). Гард ОБЩИЙ (любая
built-запись со storage — без хардкода id 55). ОГРАНИЧЕНИЕ для 000222:
гард читает (t.x, t.y) — якорную клетку; 55 = 1×1 → верно; если 000222
сделает хранилище >1×1 — гард обязан обходить ВСЕ built-записи footprint
(см. §4). Это ЕДИНСТВЕННОЕ изменение building-actions.js.

### D11. Персонаж — hero (deps.hero — главный персонаж)
Почему: ТЗ «персонаж», игра имеет ОДНОГО игрока; строительство уже тратит
gold/предметы hero (buildCityAt); активный персонаж (000145 activeCharId)
НЕ используется. Наёмники/партия — не ТЗ (задел: onAction получает hero из
ctx — переключение на activeChar — одна точка).

### D12. Цена: 100 з. + wood_log×2 + stone_chunk×2 (решение против 75 з. +
4×wood_log a2)
Почему: R2 (cities.test.js ~:1881): gold(3×3) (400/500) > gold(любого 1×1)
попарно → 100 < 400 ✓; 100 — середина 1×1-диапазона 30..120 (макс сейчас
120, id 42), склад 40 слотов — одна из дорогих 1×1-услуг, 100 уместно;
исходники: ОБА ∈ REAGENTS_000044 (hard-пул 13, R14: «из них и только из
них») — wood_log = assets/items/000035.json, stone_chunk =
assets/items/000036.json (REF_PIN_0000207); два РАЗНЫХ предмета —
уникальность в записи (R13-ревью); ссылка-файл — формат 000207.

## 2. Контракты и границы

* Формата записи storage: `{id: string (непустой id предмета из
  assets/items), qty: int 1..99, bonus?: {damage|armor|amount: int ≥ 1}}` —
  та же форма, что inventory.slots (000046). Merge-ключ (id, bonusState).
* Семантика переноса: ЦЕЛОЙ ЗАПИСЬЮ (ТЗ не требует частичных количеств;
  выбор qty — 000222+/отдельная задача). Equipment (c.equipment) НЕ
  складывается (в slots нет; ТЗ — «предметы из инвентаря»).
* Отказ — всегда БЕЗ мутации и БЕЗ saveNow (flash + reopen); успех —
  saveNow + flash + playerRender + reopen. RNG НЕТ (детерминированные
  переносы — R-DETERM).
* Смерть героя/грабёб: НИКАКОГО влияния на storage (механики разграбления
  в проекте нет; смерть = 000008: инвентарь intact).
* Строка [E] «Хранилище» ВСЕГДА доступна (вынуть можно даже при полном
  инвентаре — отказ будет в оверлее; при полном хранилище «Сложить»
  disabled с reason, «Вынуть» — по dry-run).
* Снос здания → его storage исчезает (garbage с записью) — только через
  пустое (гард D10).
* per-cell view (ds.cityContents.buildings) — БЕЗ storage (только {x, y,
  buildingId, player}) — render/[E]-поиск не меняется; модуль читает
  storage ТОЛЬКО из record.built (cityStates).

## 3. Ленивые ссылки и guards

* building-effect-storage.js: НОЛЬ require (UMD, паттерн fullrest); каталог/
  функции/hero — ИЗ ctx (спец-ctx 000128: {t, b, hero, world: deps}) и
  world.game (СНАПШОТ 000038 — getItem/addItem/canAddItem/totalQty/
  buildingUI); cityStates — world.cityStates (LIVE Map); saveNow/flash/
  playerRender — world.*; catalog-функции ядра — world.game.Cities.
* cities.js: каталог — buildingsRef() лениво (rootRef.Game в момент вызова);
  НОВЫХ require НЕТ (require-пин).
* Гарды деградации: отсутствие record/entry/capacity/buildingUI →
  {ok:false, message} (видимый отказ) или console.error (wiring-сбой);
  игра не падает (000053).

## 4. Важно будущим задачам

* **000222 (уровни зданий)**: «В хранилище помещается больше предметов» —
  ёмкость = `C.storageCapacity(buildingId)` (сейчас: каталог 40); 000222
  добавляет уровень (поле built-записи/каталога) и формулу ёмкости — точка
  расширения ОДНА (storageCapacity + аргумент capacity в storagePut).
  Ограничение D10: при >1×1 footprint гард demolish обязан обходить ВСЕ
  built-записи footprint (сейчас — якорная клетка; 55 = 1×1).
* **000223 (баг quick-move)**: put-ветка quick-слоты НЕ трогает
  (своя единица, 000223 D5; прецедент «totalQty 0 → null» УБРАН
  самими 000223 — items.js:498-500; cleanQuick удалён правкой по
  итогам ревью — §9.8). Игрок снимает закрепленную единицу «убрать»
  как обычно.
* **000230.* (items/экипировка)**: новых предметов я НЕ добавляю; storage
  хранит id+bonus по формату 000046 — новые бонусные поля 000230
  автоматически поддерживаются merge-ключом bonusState (канонический JSON).
* Параллельные workflow: хотспоты — GENERATED-блок src/buildings.js, конец
  реестра EFFECTS, index.html (слот спец-модулей), re-пины тестов —
  стандартный rebase (задачи 000222-000233 не трогают storage).

## 5. Подводные камни

1. **R-VALIDATE**: без D7 storage ТИХО СГОРИТ при restoreCityStates
   (validateCityState нормализует built к 4 ключам). Красный round-trip
   тест — ОБЯЗАТЕЛЕН до кода.
2. **R-REPLACE-TRAP НЕ актуален**: storage внутри built — едет spread'ом
   main.js:2455; city-level поле сгорело бы (отвергнутый вариант a2).
3. **R-REMOVEITEM**: «Сложить» — ТОЛЬКО точный splice по идентичности
   (id + bonusState); removeItem снимает qty по ВСЕМ записям id — при
   смешанных бонусах унесёт чужую запись. Тест: 2 entry одного id
   (bonus/no-bonus) → сложить bonus → no-bonus цел.
4. **R-NAN НЕ актуален**: явное `доля: 0` — хелперы map.test.js суммируют
   30+0 без NaN; map.test.js НЕ правится.
5. **R-UMD-ORDER**: тег — ПОСЛЕ building-actions.js (registerSpecial),
   ПОСЛЕ fullrest.js, ДО hud.js (пин IO4); иначе silent degradation →
   «умершее молча» действие (класс 000128).
6. **R-REPIN-SET**: полный список в §7 — пропуск одного (напр. :164
   getBuilding(55)===null в buildings.test.js) = красный сьют.
7. **R-VM-E2E**: re-open buildingUI из onAction в vm-песочнице — проверить
   в e2e (при foreign-flaky — повтор + отметка в отчёте).
8. **R-STALE-DOC**: spec/buildings.md:387 «21 тип» → 22 (in-place, 466
   строк сохраняется); memory-файлы задач НЕ правятся ретроспективно.

## 6. Карта файлов (план, дельты)

НОВОЕ:
| Файл | Дельта |
|---|---|
| assets/buildings/000055.json | ~30 строк (D1) |
| src/building-effect-storage.js | ~170 строк (D9: UMD + handler + строки + onAction) |
| tests/city-storage.test.js | ~300 строк (красные D-R1..R11 + ядро + vm-e2e) |
| memory/000221-city-storage.md | этот файл |

МЕНИМ:
| Файл | Что |
|---|---|
| src/buildings.js | sync-регенерация GENERATED (+запись 55) + ручные шапка :104 «55 типов»/(прочие (8)) + JSDoc «1..55» (~3 строки) |
| src/cities.js | validateCityState-ветка storage (~12) + 5 чистых функций (~80) + 5 экспортов (~5) |
| src/building-effects.js | `EFFECTS['storage'] = { имя: 'Хранилище' };` после 'fullrest' (2 строки) |
| src/building-actions.js | гард demolish D10 (~4 строки) — ЕДИНСТВЕННОЕ изменение |
| index.html | `<script src="src/building-effect-storage.js">` после fullrest.js, до hud.js (1 тег + комментарий) |
| spec/buildings.md:387 | «Итог — 21 тип (000148.03)» → «Итог — 22 типа (000148.03, 000221)» (in-place) |
| CHANGELOG.md | отдельный коммит, 2026-10-16, «Игровой процесс»: новое здание |

РЕ-ПИНЫ (технические, семантика не меняется):
| Файл | Что |
|---|---|
| tests/buildings.test.js | :87 прочее 7→8; :98-101/:142-145/:696-698/:861-865/:1159 54→55; :164 getBuilding(55)→getBuilding(56); :920 000073: 10→11, [12] {46:30,55:0}, доля 0..100; :977 D3_IDS_03 +55 (21→22, контур 33); :1052/R13 заголовки 21→22; R1 000207: 54→55 файлов, «21 здание, 22 позиции» → «22 здания, 24 позиции»; R5 :1379 «все 55»; 000211.07 :1543/:1550 «18 из 55» |
| tests/cities.test.js | :1864 D3_IDS +55; R1 «ровно 22 id» (R2/R3 динамические — 100<400 само) |
| tests/city-interact.test.js | :538 D3_IDS_03 +55; «21 строка»→«22 строка», «22 строки (21 D3 + rename)»→«23 строки (22 D3 + rename)» (CI-U2 :373/:383, CI-U12 :551/:570/:573, :739/:775/:991, CI-B5 :1006 + icon build-55 = npc_house.svg, CI-V4 :1846/:1879, CI-V12 :2046/:2070, :2574/:2593-2596); комментарии-заголовки :9/:31/:47/:79/:369. REAGENT_SEED_202 — НЕ МЕНЯТЬ (wood_log 3≥2, stone_chunk 3≥2, gold 1000≥100 → строка 55 доступна) |
| tests/city-screen.test.js | :1153 D3_202 +55; rows 22→23 (:1201); chip rename '22'→'23' (:1242); цикл по D3_202 (автоматически от длины); wording :1146/:1150/:1170 |
| tests/index-order.test.js | required-список + 'src/building-effect-storage.js' (между fullrest и hud.js) + пин IO4: pos(building-actions) < pos(storage) && pos(fullrest) < pos(storage) < pos(hud.js) |

НЕ ТРОГАЕМ: main.js, map.js, sprites.js, dungeon-ui.js, building-ui.js,
items.js, schema.json, assets/sprites/**, scripts/sync-buildings-data.js,
map.test.js, GOLDEN_CONTENT/GOLDEN_CONTENT_OCC, мировые goldens,
require-пины, REAGENT_SEED_202, REF_PIN_000207 (зафиксированные 21 здание —
содержание не меняется; 55 не входит в пин-таблицу).

## 7. Красные тесты (000221-R*, имена — для отчёта)

* R1 (node, tests/buildings.test.js): каталог 55 «Хранилище» — JSON 000055
  + зеркало getBuilding(55): прочее, npc null, размещение {слот:12, доля:0},
  БЕЗ map_index, БЕЗ «спрайт», эффекты ["storage"], хранилище.слоты 40,
  .стройка {100, [wood_log×2, stone_chunk×2]} (ссылки резолвятся).
* R2 (node, tests/cities.test.js): buildableBuildingIds — 22 id (D3+55);
  buildCost(55) = {золото:100, исходники 2 позиции}.
* R3 (node, tests/cities.test.js): ядро — storageCapacity/
  storageSanitize/storageAt/storagePut/storageTake — typeof function
  (экспорт в return-блоке).
* R4 (node, tests/cities.test.js): семантика — merge (id+bonusState),
  стак 99, capacity 40 → 'full', purity (вход не мутируется), storageTake
  out-of-range, storageAt null-случаи.
* R5 (node, tests/cities.test.js): персист — roundtrip
  validate→serialize→restoreCityStates с storage (живёт при истёкшем окне
  stock); битое ПОЛЕ (не-массив) → warn «cities» + отброс поля, запись
  жива; битая ЗАПИСЬ (qty 0 / id число) → warn + отброс записи; storage
  без → 4 ключа (byte-совместимость).
* R6 (vm, tests/city-interact.test.js): [E] на клетке построенного 55
  (per-cell {buildingId:55, player:true}) → buildingUI.open: строки
  [{id:'storage', имя:'Хранилище', доступен:true}, {id:'demolish',…}];
  title «хранилище».
* R7 (vm, tests/city-interact.test.js): гарды модуля — standalone тихо;
  без Game.buildingActions → console.error + specials['storage'] отсутствует;
  с — function. onAction('storage') → buildingUI.open (title «Хранилище»,
  строки put-*/take-*), возврат {ok:false} без message → pipeline без
  saveNow/flash.
* R8 (vm, e2e, city-interact): построить 55 (строка 22 в меню, сиды
  REAGENT_SEED_202 + gold) → [E] → «Хранилище» → «Сложить» → запись
  инвентаря исчезает (totalQty 0, quick очищен), entry.storage растёт,
  saveNow, flash, reopen; заполнение до 40 → «Сложить» disabled +
  отказ-flash.
* R9 (vm, double-boot по CI-134B): save → reload → storage жив в
  data.cities (built-запись), «Вынуть» возвращает (merge id+bonus в
  инвентаре); all-or-nothing: полный инвентарь → flash, storage нетронут.
* R10 (vm, city-interact): demolish непустого 55 → {ok:false} +
  flash-отказ, built/record НЕ изменены, saveNow не стреляет.
* R11 (node, tests/index-order.test.js): тег src/building-effect-storage.js
  + порядок IO4.

## 8. Порядок работ (красный → зелёный)

1. tests/city-storage.test.js — красные R1-R11 (падают по СУЩЕСТВУ:
   нет файла/записи/экспорта/регистрации/строки/ассета — не по синтаксису).
2. 000055.json + `node scripts/sync-buildings-data.js` + ручные шапки
   buildings.js (54→55) — каталог 55.
3. cities.js: D7 (validateCityState) + D6 (5 функций + экспорт).
4. building-effects.js: EFFECTS['storage'] (конец реестра).
5. building-effect-storage.js + index.html (тег) + index-order (список+IO4).
6. building-actions.js: гард demolish D10.
7. Ре-пины §7 (buildings/cities/city-interact/city-screen + spec:387).
8. `node --test tests/` ПОЛНЫЙ прогон в worktree (один полный — память
   «один worktree = один node --test»): базовые 2607 + новые — зелёные;
   foreign-flaky — перепуск файла + отметка в отчёте.
9. Отчёт tasks/result/000221.md; CHANGELOG отдельным коммитом.

## 9. Дельты реализации (красный e714af2 → зелёный, 2026-10-17)

Планы D1–D12/§2–§8 НЕ переписываются (подводный камень 8): ниже — ЧТО
оказалось иначе при реализации.

### 9.1 Ребейз на efade7c
Master сдвинулся после старта workflow (000223 quick-перенос, 000228,
000231, 000235). Worktree перебазирован на efade7c ДО зелёной стадии.
Зависимость: R8(d) — quick-слоты — использует МОДЕЛЬ 000223
(IT.setQuick в фикстуре; слот — СВОЯ единица). ВАЖНО (правка по итогам
ревью): в плане D9 и в первой версии кода put-ветка чистила quick по
прецеденту «totalQty 0 → null» (items.js:498-499 ДО 000223) — но
000223 сам УБРАЛ этот прецедент (контракт D5: авто-очистка пинов
убрана, слот НЕЗАВИСИМ от запаса; на items.js:498-500 теперь
КОММЕНТАРЬ «removeItem/sellItem занятый слот не трогают»). cleanQuick
в put-ветке УДАЛЕН (блок-файдинг ревью: складывание последней записи
id обнуляло quick[k] и УНИЧТОЖАЛО свою единицу слота — потеря
предмета; R8(d) зафиксировал неверное поведение). Теперь put слоты
НЕ трогает: R8(d) — quick[0] === 'sulfur' (своя единица) + сохранение
0+1+9 = 10; R8(e) — quick сохранён ['sulfur','hide',null]. Подробности
— §9.8.

### 9.2 Физическое место красных тестов
Все 11 R-тестов — В ОДНОМ файле tests/city-storage.test.js (коммит
e714af2), а не размазаны по buildings/cities/city-interact/index-order.
§7 (атрибуция R1 → buildings.test.js и т.п.) — ЛОГИЧЕСКАЯ группировка
по домену; физический план — §6 (файл-карта: «tests/city-storage.
test.js | ~300 строк (красные D-R1..R11 + ядро + vm-e2e)»). Ре-пины в
чужих файлах — ЧИСТО технические (цифры/списки), НОЛЬ новой логики
тестов там.

### 9.3 Архитектурная дельта: building-actions.js ≠ «только гард demolish»
План D10: «гард demolish — ЕДИНСТВЕННОЕ изменение building-actions.js».
Реализация — ТРИ точки (кроме гарда):
* (a) ПАЙПЛАЙН (onBuildingAction, сразу после `sp = specials[action.
  id]`): `action.id` с префиксом 'put-'/'take-' И specials['storage']
  function → `sp = specials['storage']`. save/flash/render — внутри
  модуля, пайплайн получает {ok:false} БЕЗ message (§2.6 000128).
* (b) `storageMenuRows(cell, cityAnchor)` — строки put-*/take-*
  ПРЯМО В [E]-МЕНЮ постройки игрока-хранилища. Форма строки = оверлей
  1:1 (id/itemId/bonus/qty/имя/доступен/reason?). Гард-цепочка:
  Cities.storageAt+storageCapacity → cityStates (Map) + cityAnchor →
  каталог pp.хранилище → LIVE record (cityStates.get) → storageAt
  !== null → capacity > 0; оба списка пусты → [] (меню как без
  хранилища: эффекты + «Разобрать»).
* (c) `extraActions = cell.player === true ? storageMenuRows(…)
  .concat([demolishActionRow(cell)]) : []` — put/take ПОСЛЕ строк
  эффектов, ПЕРЕД «Разобрать».
* (d) гард demolish D10 — как в плане.
Почему (b)+(c): R8(d) исполняет put-0 ИЗ [E]-МЕНЮ (после close +
interactCity lastOverlay = ВЫЗОВ [E]-МЕНЮ, его onAction — РЕАЛЬНЫЙ
pipeline onBuildingAction) — строки обязаны быть ВИДНЫ в меню, а
пайплайн обязан их РоУТИТЬ, иначе — мёртвые видимые строки. Специ-
хендлер диспатчит по ctx.action.id: put-*/take-* → perform (прямое
исполнение БЕЗ оверлея); 'storage'/отсутствие action → openOverlay +
{ok:false}. onAction оверлея — ЗАМЫКАНИЕ модуля, захватившее pipeline-
ctx: `(a) => perform(ctx, a)`. Оба входа сходятся в doPut/doTake
(identity-проверки itemId, all-or-nothing canAddItem ДО мутации,
saveNow/flash/playerRender/reopen).
Семантика reopen: buildingUI.open() начинается с close() → put из
[E]-МЕНЮ после успеха открывает оверлей «Хранилище» (меню ЗАМЕНЯЕТСЯ);
цикл R8(e) (19 put без нажатий [E]) продолжается ВНУТРИ оверлея.

### 9.4 storageAt — ЛЕНИВАЯ МАТЕРИАЛИЗАЦИЯ (cities.js)
`storageAt` для найденной player-записи: `if (!Array.isArray(e.storage))
e.storage = [];` ПЕРЕД возвратом. Почему: путь постройки (placeBuilding/
buildCityAt) создаёт built-запись БЕЗ поля storage → без материализации
storageAt → null → сразу после постройки «Хранилище» в [E] молчит с
ВИДИМЫМ flash «Постройка не найдена» (красная протечка R8). Пустой
массив: validateCityState omits (s.length ? {storage} : {}),
serializeCityStates ре-валидирует → в сейв НЕ попадает → byte-
совместимость R5(e) (4 ключа) сохранена. МУТАЦИЯ LIVE-записи —
сознательная (та же точка персиста, что assignStorage).

### 9.5 Баг-фиксы моих же красных тестов (семантика сохранена)
* R4: арифметика storagePut 99+6 → ДВЕ записи (99 + 6) — консервация
  предметов при стак-капе, не 105 в одной (макс 99).
* R5: built-запись фикстуры — ключ `input['20,-16'].built` (keying
  cityStates в тесте), не ссылка на выходной объект.
* R7: локальный `regC` в mini-vm-секции (TDZ-ловушка: harness-
  переменная `reg`, объявленная ПОСЛЕ вызова mini-vm → ReferenceError).
* R9: бонусный предмет wood_log → battle_axe → **mana_potion
  {amount: 2}**: reagent НЕ несёт бонус (validBonus требует ровно 1
  совпавший ключ int ≥ 1 — у reagents поле другое), weapon НЕ в
  STACKABLE. mana_potion (potion ∈ STACKABLE, bonusKey 'amount', имя
  «Зелье маны», вес 0.5, в BATCH_A, который R9 НЕ сидит → столкновений
  стаков нет; boot A 12.9 кг, boot B — в пределах).

### 9.6 Доп. ре-пин, НЕ в списке §7
tests/building-effects.test.js: контур-тест реестра требует
Object.keys(BE.EFFECTS) ⊆ ЗАРЕГИСТРИРОВАННОГО UNION-списка → UNION +=
`'storage'` (строка после `'fullrest'`) + уточнение
union-комментария (000147/000162/000200/000221). Паттерн добавления
эффекта-«стороны» (000147/000162/000200) — каждый новый EFFECTS-
id ОБЯЗАН ре-пинить UNION, иначе красный сьют.

### 9.7 Прочее
* CHANGELOG: дата записи — **2026-10-17** (день мержа; план §6
  записывал 2026-10-16 — день планирования).
* Подтверждено при реализации: `малая: true` у 55 не читается НИМ
  (buildings.test.js:199 итерирует фиксированные [44,45,46,49]);
  buildIconPath(55) = npc_house.svg (нет map_index → размещение.слот
  12); city-screen e2e: герой 50 з. → строка 55 (100 з.) disabled →
  ассерт «ВСЕ строки disabled» устоялся; map.js subtypeTable (:607)
  `доля > 0` → 55 вне таблицы подтипов (бит-в-бит, D2), map.test.js
  без правок (74/74).
* Файловые прогоны (до полного): city-storage 11/11, buildings 63/63,
  cities 83/83, city-interact 46/46, city-screen 12/12, index-order
  61/61, building-effects 174/174, map 74/74. Полный прогон + итоговые
  цифры — tasks/result/000221.md.

### 9.8 Правки по итогам ревью (2026-10-17)
* BLOCKER — `cleanQuick` УДАЛЕН из doPut (src/building-effect-storage.js):
  складывание записи id, после которого totalQty(id) = 0, обнулял
  quick[k] === id. Но после 000223 quick-слот = СВОЯ ЕДИНИЦА
  (setQuick физически снял 1 шт. из inventory.slots; totalQty считает
  ТОЛЬКО slots — items.js:356-358) → обнуление выбрасывало единицу
  без возврата в инвентарь и без записи в хранилище: ПОТЕРЯ ПРЕДМЕТА
  (нарушение 000223 D2/D3 «предмет не теряется никогда» и D5 —
  паритет removeItem/sellItem, занятый слот не трогают). Прецедент
  items.js:498-499 (totalQty 0 → null), на который опирался план D9,
  УБРАН самими 000223 (на тех строках теперь комментарий с
  противоположным контрактом). Достижимо в игре: запинить 1 шт. из
  стака, сложить остаток (оверлей ИЛИ [E]-меню — обе маршрутизируются
  в doPut). Поведение после фикса: put слоты НЕ трогает (единица
  остаётся закреплённой; игрок снимет её «убрать» как обычно). Тесты:
  R8(d) перебинен (quick[0] === 'sulfur' + сохранение 0+1+9 = 10 из
  исходных 10 серы), R8(e) перебинен (quick ['sulfur','hide',null]).
* MINOR — R-REMOVEITEM (подводный камень 3, §5.3) закреплен тестом:
  R9 boot A — ДВЕ записи одного id (mana_potion plain ×2 + bonus ×3
  {amount:2}), сложена ТОЛЬКО bonus-запись → plain-стопка цела (qty 2),
  recA.storage — только bonus-запись (deepEqual 3 записей). Защита от
  будущего «упрощения» splice по идентичности (slots.indexOf(e)) до
  removeItem(hero, id, qty) — в таком случае no-bonus-стопку унесло бы
  по id, и этот сценарий покраснел бы.

## 10. Finalize (2026-10-17)

* Свежий полный `npm test` в worktree: 2671 tests / 2671 pass / 0
  fail (exit 0). Флейков чужих тестов нет.
* Финальные коммиты ветки task/000221 (база efade7c): красная
  стадия e714af2 (сожата в e21975b), e21975b (реализация: код +
  ассет + репины + spec/buildings.md + git mv pending→done + отчёт
  v1), d208cd7 (CHANGELOG — новое здание, 2026-10-17), ba87d8f
  (ревью: BLOCKER cleanQuick удалён + MINOR R-REMOVEITEM закреплен),
  коммит Finalize (отчёт v2 + этот §10).
* Master на момент Finalize сдвинулся от базы: +07dd63d (000235 —
  только tasks/memory, без кода). Хотспоты ребейза — в отчёте
  (раздел «Подводные камни») и §4/§9.6.
* Задача перенесена в tasks/done/000221.md. Статус: ВЫПОЛНЕНО.

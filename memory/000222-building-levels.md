# 000222 — Города: уровни зданий (улучшение, стоимость ×2, макс 7)

Задача (tasks/pending/000222.md, неизменяемый master-документ): «Добавить
возможность повышать уровень зданий в городах, чем выше уровень, тем в
здании больше возможностей, больший уровень товаров продаётся, изучаются
заклинания большего уровня (за золото). В хранилище помещается больше
предметов. Стоимость улучшения должна удваиваться (по всем необходимым
ресурсам) с каждым уровнем, максимальный уровень 7».

Стадия Проектирование, 2026-10-19, workflow task-000222 (worktree
`.worktrees/task-000222`, ветка task/000222, base 38dbd89 = master).
Анализы: a1-domain (домен), a2-arch (архитектура — сводка в запуске
workflow; файл /tmp/thegame-wf-000222/a2-arch.md отсутствует), a3-tests
(карта тестов). Анализы расходились по 6 ключевым вопросам (scope
base+player vs player-only; хранение buildingLevels-карта vs поле в
built-записи; правка main.js vs frozen+реестр; формула хранилища
×level vs слоты+прирост; ментор-каталог уровни vs гейт spell.уровень;
позиция строки и поведение на макс-уровне) — ниже ФИНАЛЬНЫЕ решения
(а2-архитектура подтверждена по коду 38dbd89; все якоры сверены),
каждое с обоснованием.

ЗАМОРОЖЕНО в этой задаче (ноль правок): src/main.js, src/items.js,
src/spells.js, src/map.js, бой/дungeon-UI. index.html — без правок
(НОВЫХ JS-МОДУЛЕЙ И SCRIPT-ТЕГОВ НЕТ).

## 1. Финальные решения (D-A..D-J)

### D-A. Модель уровня: append-only `level` в built-записи (player-постройки)
* Ключ — `level` (латиница, паритет x/y/buildingId/player/storage),
  значение int 1..7, живёт ВНУТРИ built-записи cityStates:
  `{ x, y, buildingId, player: true, level? }` (5-й ключ, optional).
  built — ANCHOR-записи (000148.03 D-C: одна запись на постройку,
  верхний-левый угол; все 7 улучшаемых типов — 1×1 → anchor = клетка).
* **absent = 1** — бит-в-бит: запись без level остаётся 4-ключевой
  (deepEqual-пины 000148.05 R22-R24, 000221 R5(e)/R10 — без правок);
  level НЕ материализуем in place (только канон-копии — иначе те же
  пины).
* SCOPE — player-постройки ТОЛЬКО (решение против a1 base+player):
  формула стоимости опирается на `.стройка` — есть у 23 buildable-типов;
  базовые постройки генерируются «бесплатно» → стоимость улучшения для
  них неопределима; примеры ТЗ (лавки/ментор 38/хранилище 55) — все
  player-buildable. Базовые здания — extraActions `[]` без изменений.
* Sanitize — validateCityState (cities.js, вставка в цикл built ВПЛОТНУЮ
  ПОСЛЕ storage-блока, до `built.push(entry)`): `e.level !== undefined`
  → int 1..MAX_BUILDING_LEVEL → `entry.level = e.level`; иначе
  console.warn (msg содержит «cities», 000029): «cities.js: города —
  level некорректно (1–7): … — поле отброшено (000222)» + поле отброшено,
  ЗАПИСЬ жива (паттерн 000148.05/000221). absent → поле omitted.
* ПЕРСИСТЕНТНО: запись built в prepareCityState (main.js, frozen)
  распространяется ЦЕЛИКОМ (`{ built: saved.built }`) → уровень живёт
  вне окна респауна АВТОМАТИЧЕСКИ (ловушки R-REPLACE1 нет — она для
  top-level полей). serializeCityStates/restoreCityStates ОБА идут
  через validateCityState (cities.js:712/:736) → round-trip покрыт
  ОДНОЙ точкой. Сейв v1, версия НЕ поднимается (000031).
* `MAX_BUILDING_LEVEL = 7` — константа + экспорт cities.js.

### D-B. Стоимость: `upgradeCost(buildingId, level)` в cities.js (рядом с buildCost)
* Л→L+1 = `buildCost(buildingId)` × 2^(L−1) ПО ВСЕМ ресурсам:
  золото × 2^(L−1) И количество КАЖДОГО исходника × 2^(L−1) — целочисленно
  (целое × степень двойки — точная арифметика, паттерн 000148.04).
  1→2 = базовая цена; 2→3 = ×2; …; 6→7 = ×32. «Удваивается с каждым
  уровнем» ✓.
* Форма — та же, что buildCost: `{ золото: number, исходники:
  {предмет, количество}[] }`.
* level ≥ 7 (MAX) → **null** (макс — улучшения нет; UI — disabled-строка,
  D-F). level < 1 / не-целые id/level — throw (ошибка вызывающего —
  меню отдаёт только levelable id, строка не предлагается на макс).
  id ∉ каталогу — throw (через buildCost).
* **КАКОЙ level передавать — РЕШЕНО в §7 (GREEN + ПРАВКА ПО ИТОГАМ
  РЕВЬЮ 2026-10-20)**: уровень ЗАПИСИ для ВСЕХ 7 levelable-типов
  (ровно по ТЗ). Первая GREEN-версия делила (магазин/наставник —
  реестр + 1, кламп MAX−2) — правка ревью убрала upgradeCostLevel;
  реестр shopLevels остался питать ТОЛЬКО wealth-бамп makeCityShop
  при перестройке.

### D-C. Хранилище: `слоты + прирост×(L−1)`, каталог 000055 + строгая под-схема
* 000055.json: `хранилище: { слоты: 40, прирост: 20 }` → ёмкость по
  уровням: L1=40, L2=60, L3=80, L4=100, L5=120, L6=140, L7=160.
  Формула против a1 «слоты×level» (40/80/…/280): прирост — каталожные
  данные (000053), базовые 40 — бит-в-бит 000221 (R1/R3/R8 пины
  `storageCapacity(55) === 40`, «40/40» — без правок).
* Schema: НОВАЯ строгая под-схема `хранилище` в
  assets/buildings/schema.json `особые_параметры.properties` (паттерн
  `.стройка` 0000207): `{ type: object, additionalProperties: false,
  required: ["слоты"], properties: { слоты: {integer, min 1},
  прирост: {integer, min 0} } }`. Рationale: capacity fail-open на
  мусоре (→0) — строгая схема ловит битые данные на тестовом уровне.
* Зеркало — `npm run sync:buildings-data` (000055-вход в GENERATED-
  секцию src/buildings.js + прирост); идемпотентность byte-identical.
* `storageCapacity(buildingId, level)` (cities.js:1149) — 2-й ОПЦИОНАЛЬНЫЙ
  аргумент: `L = (int 1..MAX) ? level : 1` (null/0/8/2.5/undefined → 1);
  результат = `слоты + прирост×(L−1)` (прирост не int≥0 → 0 — обратно-
  совместимо); слоты не int≥1 → 0 (дефенсивный кейс, как сейчас).
  1-арг. вызовы бит-в-бит (default → L=1).
* Потребители передают level (record уже резолвлен в обеих точках):
  * building-effect-storage.js resolveCtx:
    `C.storageCapacity(b && b.id, C.buildingLevelAt &&
     C.buildingLevelAt(record, t.x, t.y))` (buildingLevelAt может дать
    null → кламп ВНУТРИ storageCapacity — единая точка клампа).
  * building-actions.js storageMenuRows (:715): то же с
    `C.buildingLevelAt(record, cell.x, cell.y)`.

### D-D. Магазин: effWealth в makeCityShop (7-й арг) + реестр уровней; main.js frozen
* `makeCityShop(cityX, cityY, tx, ty, buildingId, wealth, level?)` —
  7-й опциональный аргумент (length 6→7 — ЕДИНСТВЕННЫЙ технический
  ре-пин cities.test.js:1295). items.js frozen — makeShop остаётся
  4-арг.: effWealth считается в makeCityShop и уходит в makeShop как
  wealth.
* `effWealth = min(3, floor(wealth) + floor((L−1)/2))`: L1/L2 = wealth,
  L3/L4 = +1, L5/L6 = +2, L7 = +3 (универсам: пул allItems — существ.
  поведение makeShop при w=3). wealth_eff — int 0..3 ДО validateWealth
  (не throw, ловушка a1-риск-2). L1 → wealth → 6-арг. вызовы и golden
  стоки бит-в-бит (wealth НЕ входит в сид makeShop — сид = (x,y,type)).
* MAIN.JS FROZEN (6 аргументов в prepareCityState :2431) → level
  доходит через МОДУЛЬНЫЙ РЕЕСТР в cities.js: `shopLevels` (Map, ключ
  `'cityX,cityY:tx,ty'` — ровно аргументы makeCityShop):
  * makeCityShop резолвит: `L = (явный арг int 1..7) || (реестр.get(key)
    int 1..7) || 1` — явный арг победит; невалидный явный арг →
    реестр (fail-soft, без throw).
  * `setShopLevel(cityX, cityY, tx, ty, level)` — установка ОДНОЙ
    клетки (level int 1..7 → set; иное → delete ключа).
  * `syncShopLevels(cityX, cityY, record)` — очистка ВСЕХ ключей
    префикса `'cityX,cityY:'` + по каждой валидной built-записи (int
    x/y/buildingId) для КАЖДОЙ клетки footprint (каталог-размер,
    fail-open 1×1): уровень = entry.level int 1..7, иначе 1. record
    null/не-объект → только очистка. ИДИМПотентна.
  * ТОЧКА СИНХРОНИЗАЦИИ — locations.js maybeEnterCity: ПОСЛЕ резолва
    savedRec, ДО stock-цикла makeCityShop (порядок верифицирован:
    main.js enterLocation :2296 maybeEnterCity → :2301
    prepareCityState; cityShops-цикл maybeEnterCity :347 идёт между
    ними): `if (G.Cities && typeof G.Cities.syncShopLevels === 'function')
    G.Cities.syncShopLevels(ax, ay, savedRec || {});`
    → ОБЕ точки makeCityShop (maybeEnterCity + prepareCityState)
    получают level БЕЗ правок main.js.
* Эффект при улучшении МАГАЗИНА (хендлер, D-G): реестр
  syncShopLevels + in-place бамп ЦЕНЫ: `shop.wealth = min(3,
  shop.wealth + f(newL) − f(oldL))`, f(L) = floor((L−1)/2), shop =
  ds.cityShops[cellKey] (живой объект). Точность при любом капе:
  newL > oldL → f(newL) ≥ f(oldL); при капе (wealth=3) min(3, 3+δ≥0)=3
  ✓; без капа — точная сумма ✓. buyPrice/sellPrice читают shop.wealth
  live → цены обновляются В ТОМ ЖЕ визите.
* СТОК НЕ регенерируется при улучшении (решение против a1 D-SHOP
  «регенерация стока при upgrade»): сток живёт до респауна (окно
  3 дня — существ. механика 000109); prepareCityState пересчитывает
  shop-объект при КАЖДОМ входе (wealth из реестра) → цены при
  ре-энтри, сток-пул/штук — при фрэше. Регенерация при upgrade —
  осознанный сброс недокупленного (user-surprise; прецедент 000148.01
  применяется ТОЛЬКО к респауну layout).

### D-E. Ментор: гейт `spell.уровень ≤ max(4, level)`; каталог 000038 НЕ тронут
* applyMentorSpell (building-effects.js:1132) — ОДИН гейт поверх
  школьного (canLearn frozen, spells.js НЕ трогаем):
  `picked = info.pool.find((id) => mentorLevelOk(G, id, cap) &&
   G.Spells.canLearn(learner, id, 'mentor').ok) || null`,
  `cap = Math.max(4, Number.isInteger(st.level) && st.level >= 1
   ? st.level : 1)`.
  mentorLevelOk (внутр. функция, НЕ экспорт): `sp =
  G.Spells.getSpell(id)`; `уровень` не число → **true (fail-open:
  spell не найден / без уровня)**; иначе `уровень <= cap`.
* **4 = legacy-max**: все 17 заклинаний текущего каталога ≤ L4
  (6×L1 + 5×L2 + 5×L3 + 1×L4; 1 без уровня → fail-open) → при любом
  текущем состоянии cap ≥ 4 → поведение бит-в-бит (AP-M2 с реальным
  каталогом и БЕЗ level в state — зелёный без правок). L5–L7
  откроют будущие L5+ заклинания 000235 (расширение пулов
  наставника отложено ПОСЛЕ 000222).
* Против a3 `наставник.уровни {2:[…]}` в 000038.json: ОТВЕРГНУТО —
  (a) ноль каталожных правок (000038.json/зеркало/schema — без
  изменений), (b) гейт data-driven по СУЩЕСТВУЮЩЕМУ spell.уровень
  (000053), (c) 38 — единственный player-ментор (17/18/19/21 — только
  мир; у них t.cityAnchor null → level null → cap 4 — бит-в-бит).
* Цена — каталожная `наставник.цена` (50) — НЕ масштабируется
  (ТЗ «за золото» — механизм 000147 без изменений).
* Пул/mentorSpellPool — БЕЗ ИЗМЕНЕНИЙ (каталог only; AP-M2-пины).
* Проводка: onBuildingAction (building-actions.js) в apply-state
  ДОБАВЛЯЕТ ключ `level: int | null` (рядом с cityAnchor):
  `t.cityAnchor && deps.cityStates.get → C.buildingLevelAt(record,
  t.x, t.y)`; мир (cityAnchor null) → null; wiring-сбой → null.
  ПИНА key-set apply-state НЕТ (верифицировано — purity-пины
  «state не мутирован» не затронуты; tile = {x,y} — отдельно).

### D-F. UI: строка «Улучшить» ПЕРВОЙ в extraActions; на макс — disabled
* `upgradeActionRow(cell, cityAnchor)` (building-actions.js, рядом со
  storageMenuRows/demolishActionRow) → **null** если: Cities-API не
  цело (тихо — деградация 000053, как storageMenuRows) / каталог b
  нет / `!C.isLevelableBuilding(b)` / `cell.player !== true`
  (базовые — строки НЕТ) / record не найден. Иначе:
  level = `C.buildingLevelAt(record, cell.x, cell.y) || 1`.
* level ≥ 7 → disabled-строка: `{ id: 'upgrade',
  имя: 'Улучшить: <название>', доступен: false,
  reason: 'максимальный уровень (7)' }` (решение против a1/a3
  «строки НЕТ»: игрок видит, что здание улучшаемо, но на максимуме).
* level < 7 → строка формата build-меню (000148.04 R4, «×» U+00D7,
  «—» U+2014): `имя: 'Улучшить до уровня ' + (level + 1) + ' — ' +
  cost.золото + ' з.' + (исходники.length ? ' (' +
  исходники.map(e => reagentName(e.предмет) + ' ×' + e.количество)
  .join(', ') + ')' : '')`, cost = `C.upgradeCost(buildingId, level)`;
  `доступен: buildShortageReason(deps.hero, cost) === null`
  (+reason «Не хватает …» — единый источник текстов, как build-меню).
* ПОЗИЦИЯ — ПЕРВОЙ в extraActions игрока (до storage-строк put/take и
  «Разобрать»; строки эффектов идут ПЕРЕД extraActions, как сейчас):
  interactCity: `cell.player === true ?
  [upgradeActionRow(cell, cityAnchor)].filter((r) => r !== null)
   .concat(storageMenuRows(cell, cityAnchor))
   .concat([demolishActionRow(cell)]) : []`.
  Итоговые порядки: игрок-55 (пустой инвентарь) →
  [storage (ЭФФЕКТ), upgrade, demolish]; игрок-магазин с NPC →
  [dialog, upgrade, demolish]; базовое → [] (как сейчас).
* Ежедневная марка: условие :394 `action.id !== 'demolish' &&`
  ДОПИСЫВАЕТ `action.id !== 'upgrade'` — ИНАЧЕ у зданий с boolean
  `раз_в_день: true` (39/40/42/43/45/48 — верифицировано по каталогу)
  hasDailyLimit(id) = true на ЛЮБОЙ id → джанк-марка
  'ax,ay:upgrade' без читателя (ловушка a2; на практике 48 не
  levelable — защита от дрейфа каталога).

### D-G. Хендлер: `registerSpecial('upgrade')` в building-actions.js (рядом с 'demolish' :1314)
Саморегистрация при загрузке; ctx = {t (синте-тайл города: x,y
клетки, cityAnchor), b (каталог), hero, world (deps-бандл)}.
Последовательность — зеркало buildCityAt :861 (атомарность R20):
1. гарды-отказы (все — `{ok:false, message}` — flash пайплайном, БЕЗ
   saveNow, 000128 §2.6; тексты): t/anchor нет → «Город не найден
   (якорь не решён) — улучшение невозможно»; cityStates нет →
   «Состояние города недоступно — улучшение невозможно»;
   C/upgradeCost/upgradeBuildingAt/buildingLevelAt/isLevelableBuilding
   нет → console.error (wiring-сбой) + «Каталог построек недоступен —
   улучшение невозможно»; record нет → «Запись города отсутствует».
2. `level = C.buildingLevelAt(record, t.x, t.y)`; null (нет записи
   built на клетке — строка не могла открыться) → «Эту постройку
   нельзя улучшить».
3. Re-check levelable: entry-запись found (через buildingLevelAt),
   `b2 = w.game.getBuilding(entry.buildingId)` + `C.isLevelableBuilding(b2)`
   → иначе «Эту постройку нельзя улучшить».
4. `level >= MAX_BUILDING_LEVEL` → «максимальный уровень (7)».
5. `cost = C.upgradeCost(entry.buildingId, level)` (не-null: level<7).
6. ПРОВОЧКА ЗОЛОТА gold-first (hero-гард, как buildCityAt):
   «мало золота (нужно N)».
7. Гард items-API (hasItem/removeItem — console.error + «Предметы
   недоступны — улучшение невозможно»).
8. hasItem по ВСЕМ исходникам (первая нехватка в каталожном порядке):
   «мало: <имя>» — ДО ЛЮБОГО списания.
9. `BE.teleportCharge(hero, false, cost.золото)` (гард — console.error
   + отказ) — отказ-ветка защитная (провочка выше): «мало золота
   (нужно N)».
10. removeItem по ВСЕМ (all-or-nothing) ДО присвоения hero.gold —
    защитный отказ НЕ мутирует ничего.
11. `ctx.hero.gold = ch.gold` (live, паттерн 000075).
12. `res = C.upgradeBuildingAt(record, t.x, t.y)` → null (недостижимо:
    запись проверена в 2 — между 2 и 12 ничего не мутирует; защита от
    дрейфа) → console.error + «Эту постройку нельзя улучшить»
    (списания произошли — тот же профиль риска, что buildCityAt).
13. `w.cityStates.set(t.cityAnchor, res.record)`.
14. Если МАГАЗИН (`isShopBuilding`-проверка — см. D-H, или
    `w.game.Cities.makeCityShop`-null-проверка НЕ используется):
    pax/pay из t.cityAnchor; `C.syncShopLevels(pax, pay, res.record)`;
    ds = w.cityState(); для клеток footprint: `shop =
    ds.cityShops?.[cellKey]` → `shop.wealth = min(3, shop.wealth +
    f(res.newLevel) − f(res.oldLevel))` (D-D).
15. `{ok: true, message: 'Улучшено: <название> (уровень ' +
    res.newLevel + ') (−' + cost.золото + ' з.' +
    (исходники ? ', ' + Σ '−<имя> ×<Q>' : '') + ')' }` (− U+2212,
    × U+00D7 — формат flash build-меню, паттерн CI-U14) → стандартный
    хвост пайплайна: saveNow + flash + playerRender.

### D-H. Levelable-предикат: `isLevelableBuilding(rec)` в cities.js (экрпорт)
Данные-драйвен, ноль хардкода id (000053): `pp.стройка.золото` int>0
(форма buildCost) И (магазин ИЛИ наставник ИЛИ хранилище):
* магазин: `pp.map_index` — number И `itemsRef().shopKindsFor(pp.map_index)
  != null` (экспортировано items.js; зеркало условий makeCityShop
  non-null: Арена 7/Стрельбище 10/Дом кузнеца 25/… — без «виды» →
  НЕ магазин);
* наставник: `pp.наставник` — объект И `заклинания` — непустой массив
  строк (зеркало валидности mentorSpellPool);
* хранилище: `pp.хранилище` — объект (не массив/null).
Результат на каталоге 38dbd89 — ровно 7 типов {1,2,3,4,44,38,55}
(все 1×1, все с .стройка). Здания с .стройка БЕЗ level-эффекта
(7,8,10,11,25,36,37,39,40,42,43,45,46,48,49) — строки НЕТ
(«больше возможностей» не возникает). items.js у cities.js уже в
require-пине (perlin/items/buildings) — нового require НЕТ.

### D-I. Чтение: `buildingLevelAt(record, x, y)` в cities.js (рядом со storageAt)
→ int 1..7 | null: record не-объект / built не-массив → **null**;
поиск записи built — footprint-покрытие (каталог-размер entry,
fail-open 1×1; id ∉ каталогу → 1×1) — С КОНЦА массива (верхняя
постройка, зеркало demolishCity); не найдена → **null**; найдена →
`entry.level` int 1..7 ? level : **1** (мусор в live-памяти
недостижим — канон-копии; fail-open без warn — warn при валидации
сейва). Все потребители null-safe: storageCapacity клампит, ментор-гейт
null → cap 4, UI `|| 1`.

### D-J. Тесты: tests/building-levels.test.js (16 RED: 13 node + 3 vm)
Имя файла — по a2 (против a3 building-level-000222.test.js). Конвенция
1 файл на задачу; шаблон city-storage.test.js (node-хелперы fake deps +
реальные модулы + vm-секция full-chain). Формулы — по D-B/D-C/D-D/D-E
(закреплены выше; значения в а3 «рабочие примеры» — ОТМЕНЕНЫ, кроме
структуры сценариев).
1. R1 upgradeCost: L=1 ≡ buildCost (deepEqual); L=2 ×2, L=3 ×4, L=6 ×32
   (золото И исходники; фикс-ид: 48 {30 з., stone_chunk×1}, 55
   {100 з., wood_log×2, stone_chunk×2}, 38 {80 з., herb_bitter×2});
   L=7 → null; не-целые/id ∉ каталогу → throw.
2. R2 MAX_BUILDING_LEVEL === 7 + buildingLevelAt: record null/{} → null;
   без записи на (x,y) → null; запись без level → 1; level:3 → 3;
   мусор (0/8/2.5/'три'/null) → 1.
3. R3 upgradeBuildingAt: чистота (вход deepEqual до/после), НОВЫЙ
   record, entry.level = old+1, результат {record, buildingId, x, y,
   oldLevel, newLevel}; (x,y) не покрыт → null; запись без level →
   oldLevel 1 → newLevel 2.
4. R4 storageCapacity(55, L): 40/60/80/100/120/140/160 (L1..7);
   1-арг === 40 (регрессия 000221); id ∉ каталогу → 0; level
   null/0/8/2.5 → 40 (кламп).
5. R5 [E]-меню player-55 c level:2 (node-хелпер): строки «Сложить»
   доступны до 60 (40 записей → доступно, reason НЕТ; 60 →
   «хранилище полное (60/60)»); contrast без level — 40/40.
6. R6 makeCityShop: length 7; 6-арг. deepEqual 7-арг. c level
   absent/1 (бит-в-бит, защищает golden :1478); level 7 →
   wealth = min(3, w+3) = 3 (универсам — пул allItems); детерминизм
   (2 вызова deepEqual), новый объект; РЕЕСТР: syncShopLevels(ax,ay,
   record{built:[{x,y,buildingId:1,player:true,level:5}]}) → 6-арг.
   вызов на этой клетке → wealth min(3, w+2); чужая клетка/город —
   бит-в-бит; setShopLevel delete (level 0/null).
7. R7 syncShopLevels: очистка префикса (stale-ключи после demolition
   исчезают); по всем клеткам footprint; мусорный level → 1; record
   null → только очистка; идемпотентность.
8. R8 ментор-гейт (node, фейк Spells: getSpell → {уровень: 5},
   canLearn ok; фейк-каталог наставник {заклинания:['fake_l5'],
   цена: 50}): БЕЗ st.level → отказ «…заклинаний нет (ранг школы/
   базовое)» (cap 4); st.level 7 → picked 'fake_l5', price 50,
   message «Наставник передал: …»; ст.level 4 → cap 4 → отказ;
   spell без уровня / не найден → fail-open (picked).
9. R9 проводка level в apply-state: fake BE.EFFECTS entry (apply
   захватывает state); onBuildingAction c t.cityAnchor + cityStates
   built level:3 → state.level === 3; мир (cityAnchor null) →
   state.level === null; record без built → null.
10. R10 персист: validateCityState — built c level:3 → канон-копия
    c level:3; level 8/0/2.5/'три' → console.warn («cities») + поле
    отброшено (запись жива, 4 ключа); без level → ровно 4 ключа
    (бит-в-бит 000221 R5(e)); roundtrip serialize→restore: level жив
    (в т.ч. persistent-only, без transient-пары).
11. R11 [E]-меню строка: player-55 (level absent) →
    actions.map(id) ['storage','upgrade','demolish'], upgrade
    {имя:'Улучшить до уровня 2 — 100 з. (Бревно ×2, Каменный обломок ×2)',
    доступен:true}; c level:2 → «уровня 3 — 200 з. (Бревно ×4, Каменный
    обломок ×4)»; level:7 → disabled, reason 'максимальный уровень
    (7)'; player-48 (нет level-эффекта) → строки НЕТ; базовое здание
    (player не true) → НЕТ; cityStates нет → НЕТ; нехватка →
    доступен:false + reason «Не хватает …».
12. R12 onAction('upgrade') успех: списание РОВНО (gold 1000→900,
    wood_log 3→1, stone_chunk 3→1 — L1 55); entry.level = 2; per-cell
    ключи (x/y/buildingId/player/storage) НЕ изменены; saveNow=1,
    playerRender=1, flash 'Улучшено: Хранилище (уровень 2) (−100 з.,
    −Бревно ×2, −Каменный обломок ×2)'; ре-энтри [E] — строка уже
    «уровня 3 — 200 з.»; реестр: shop-клетка (если магазин) —
    syncShopLevels + wealth-бамп.
13. R13 onAction('upgrade') отказы атомарно: (a) gold 90 → «мало
    золота (нужно 100)» (gold-first); (b) gold ок, wood_log 1 →
    «мало: Бревно»; ВСЕ: built/record/gold/инвентарь НЕ изменены,
    saveNow=0.
14. R14 vm e2e: build-55 (23 строки, списание) → [E] → upgrade
    (gold/предметы) → выход/ВОЗВРАТ (prepareCityState: запись
    c level:2 — persistent) → [E]: строка «Улучшить до уровня 3 —
    200 з.», «Сложить» до 60 (40/60); double boot (bootWithSave):
    level:2 жив в cityStates И в сейве, ёмкость 60 после restore.
15. R15 vm e2e магазин: build-1 (Оружейная, map_index 0) → upgrade
    до уровня 5 (2 улучшения: 1→2, 2→3… до 5 — либо цепочка) → В ТОМ
    ЖЕ визите: ds.cityShops shop.wealth = min(3, w+2) (in-place бамп —
    цены обновлены); (re)вход: shop.wealth тот же (реестр из записи),
    при фрэше — сток по wealth min(3,w+2) «богаче» L1-стока
    (детерминированный фикс-якорь: (ax,ay,tx,ty,map_index)); до
    upgrade (L1/L2) — сток/wealth бит-в-бит L1 (floor((L−1)/2)=0).
16. R16 vm e2e ментор 38: build-38 (80 з. + горечавка ×2) → upgrade
    (L2) → [E] → «Обучение (наставник)» — picked из БАЗОВОГО пула
    (все текущие заклинания ≤ L4 — гейт не сужает), gold −50, flash
    «Наставник передал: …» (регрессия проводки: level передан,
    ничего не сломано; разблокирование L5+ — R8 на фейк-спелле).

GREEN-фаза — ТОЛЬКО 3 технических правки:
1. tests/city-storage.test.js R6 (:549): deepEqual ids
   `['storage','demolish']` → `['storage','upgrade','demolish']`
   (прямое следствие ТЗ — новая строка в меню; остальное в R6 —
   без правки).
2. tests/cities.test.js :1291-1304: заголовок + `makeCityShop.length`
   6 → 7 (7-й арг = level, optional; коммент «layout/cityRecord-
   аргументов НЕТ» сохраняется — данные по-прежнему из (город,
   клетка), каталога и реестра).
3. tests/spec-split.test.js :103: `"buildings.md": 466` → 466+N
   (N = добавленные строки прозы; считается после правки spec).

Не требуются правок (проверено по коду тестов): require-пин
cities.test.js:219 (новых require нет); 23-строчные пины build-меню
(строка upgrade — в [E]-меню постройки, не в build-меню); CI-U1
(базовая без cityStates → extraActions [] — upgrade player-only);
CI-V2 Digit1 (первая строка базовой — «Диалог» — effects ПЕРЕД
extraActions); R8 e2e «40/40» (level absent → 40); R10 deepEqual
built (level absent → 4 ключа); 000148.05 R22-R26; 000147 AP-M2
(без level → cap 4 → бит-в-бит, реальный каталог ≤ L4); items.test.js
:674 (makeShop 4-арг. golden — items.js frozen); buildings.test.js
(000055 + прирост — JSON↔JS deepEqual обновляются ПАРОЙ через sync;
EXPECTED_COUNTS/22 D3/18 спрайтов — без изменений; schema-пины —
проверяют конкретные свойства, под-схема хранилище не затронута);
save.test.js (level optional, absent → omit); svg.test.js (новых
SVG нет); index-order.test.js (новых тегов/модулей нет);
build-menu-layout (новых CSS нет).

## 2. Контракты и границы (сигнатуры)

cities.js (все — чистые, ноль новых require — пин :219):
* `MAX_BUILDING_LEVEL = 7` (константа + экспорт).
* `isLevelableBuilding(rec) → boolean` (D-H; rec — каталожная запись).
* `upgradeCost(buildingId, level) → {золото, исходники[]} | null`
  (D-B; level ≥ 7 → null; не-целые/id∉каталогу — throw).
* `upgradeBuildingAt(record, x, y) → {record, buildingId, x, y,
  oldLevel, newLevel} | null` (D-G.12; x/y — клетка footprint;
  record не-объект/built нет/запись не найдена/level ≥ 7 → null;
  не-целые x/y — throw).
* `buildingLevelAt(record, x, y) → int 1..7 | null` (D-I).
* `storageCapacity(buildingId, level = 1) → int` (D-C; 1-арг.
  бит-в-бит).
* `setShopLevel(cityX, cityY, tx, ty, level)` (D-D; level int 1..7 →
  set ключа 'cityX,cityY:tx,ty', иначе delete).
* `syncShopLevels(cityX, cityY, record)` (D-D; очистка префикса +
  запись уровней всех built-записей; record null → только очистка).
* `makeCityShop(cityX, cityY, tx, ty, buildingId, wealth, level?)` —
  7-й арг optional (D-D); effWealth = min(3, floor(wealth) +
  floor((L−1)/2)); L = явный int 1..7 ?? реестр ?? 1; результат —
  те же 6 полей, wealth = effWealth.
* `validateCityState` — +level в канон-копии built-записи (D-A).
* Экспорт-блок: + MAX_BUILDING_LEVEL, isLevelableBuilding,
  upgradeCost, upgradeBuildingAt, buildingLevelAt, setShopLevel,
  syncShopLevels (рядом со storageCapacity :1301).

building-actions.js:
* `upgradeActionRow(cell, cityAnchor) → row | null` (D-F).
* registerSpecial('upgrade', handler) (D-G; саморегистрация).
* onBuildingAction state: + `level: int | null` (D-E).
* daily-марка: + `action.id !== 'upgrade'` (D-F).
* storageMenuRows: capacity c level (D-C).
* interactCity: extraActions игрока — upgrade ПЕРВОЙ (D-F).

building-effects.js:
* applyMentorSpell: + cap/mentorLevelOk (D-E); экспорт-блок и
  mentorSpellPool — БЕЗ ИЗМЕНЕНИЙ.

building-effect-storage.js: resolveCtx capacity c level (D-C).
locations.js: maybeEnterCity + syncShopLevels (D-D).

Каталог/схема:
* 000055.json `хранилище.прирост: 20` (+1 строка).
* schema.json — под-схема `хранилище` (D-C).
* src/buildings.js — зеркало через sync (000055 + прирост).
* 000038.json — БЕЗ ИЗМЕНЕНИЙ (D-E).

Тексты (дословно, пины R11/R12/R13):
* Строка (level < 7): `Улучшить до уровня <L+1> — <G> з.`
  (+ ` (<имя> ×<Q>[, <имя> ×<Q>])` — формат build-меню).
* Строка (level 7): имя `Улучшить: <название>`, reason
  `максимальный уровень (7)`.
* Отказы хендлера: «Город не найден (якорь не решён) — улучшение
  невозможно» / «Состояние города недоступно — улучшение невозможно»
  / «Каталог построек недоступен — улучшение невозможно» / «Запись
  города отсутствует» / «Эту постройку нельзя улучшить» /
  «максимальный уровень (7)» / «мало золота (нужно N)» / «мало:
  <имя>» / «Предметы недоступны — улучшение невозможно».
* Успех: `Улучшено: <название> (уровень <L>) (−<G> з.`
  (`, −<имя> ×<Q>[, …]`) + `)`.

spec/buildings.md — проза ВНУТРИ существующих секций (НОВЫХ H2/H3 НЕТ
→ пин h2/h3-списка spec-split :67 без правок; меняется ТОЛЬКО
line-count :103):
* «### Строительство и цены» — абзац «Уровни зданий»: улучшать
  можно постройки игрока с level-эффектом (лавка/наставник/
  хранилище — data-driven из каталога); [E]-меню — строка
  «Улучшить до уровня N+1» (первой в доп.строках); цена N→N+1 =
  .стройка × 2^(N−1) по ВСЕМ ресурсам; макс 7 (строка disabled);
  эффекты: лавка — больший уровень товаров (effWealth min(3,
  wealth + floor((L−1)/2))), наставник — заклинания уровня ≤ max(4, L)
  (цена — наставник.цена), хранилище — больше предметов
  (слоты + прирост×(L−1)).
* «### Содержимое города» — 1-2 строки: лавки player-построек —
  уровень влияет на богатство/ассортимент; сток обновляется при
  респауне, цены — сразу при улучшении.
* «### Состояние, сейв, респаун» — 1 строка: built-записи + PERSISTENT-
  поле level (1..7, absent = 1) — вне окна респауна.

## 3. Ленивые ссылки и guards (деградация 000053)

* cities.js: ноль НОВЫХ require (пин :219: perlin/items/buildings).
  itemsRef() (shopKindsFor) и buildingsRef() — существующие ленивые.
  shopLevels — модульный Map (создаётся при загрузке; vm-boot =
  fresh; очистка префикса при sync — нет утечки между городами).
* building-actions.js: upgradeActionRow — ТИХИЙ null (no
  console.error) при неполном Cities-API (паттерн storageMenuRows);
  хендлер — console.error ТОЛЬКО на wiring-сбое Cities-API (как
  buildCityAt).
* building-effect-storage.js / building-actions storageMenuRows:
  `C.buildingLevelAt && C.buildingLevelAt(...)` — нет API → undefined
  → кламп 1 в storageCapacity.
* building-effects.js: mentorLevelOk — getSpell нет/не найден/без
  уровня → true (fail-open); lazyGame() — существующий.
* locations.js: syncShopLevels — typeof-гард (нет → город без
  уровней, бит-в-бит как до 000222).
* onBuildingAction: level — цепочка &&-гардов → null при любом
  пропуске проводки.

## 4. Что важно будущим задачам

* 000235 (25 заклинаний в каждую школу): новые заклинания с
  `уровень` 5..N автоматически разблокируются наставником
  (гейт D-E) при level buildings ≥ уровню заклинания — НИКАКИХ
  правок 000222-кода; расширение БАЗОВЫХ пулов наставников
  (наставник.заклинания/уровни каталога) — отдельная задача ПОСЛЕ
  000222 (отложено сознательно).
* MULTI-CELL levelable buildings (если появятся): buildingLevelAt /
  upgradeBuildingAt / syncShopLevels — footprint-корректны (каталог-
  размер); built — anchor-записи (level в ANCHOR-записи, не per-cell).
* Новый уровень-эффект типа здания = поле каталога + ветка в
  isLevelableBuilding (000053); формулы эффектов — каталожные данные
  (паттерн прирост D-C).
* Реестр shopLevels — единственный модульный state в cities.js
  (помимо функций): тесты, вызывающие makeCityShop с реестром,
  обязаны syncShopLevels/setShopLevel САМИ (в node-песочнице
  модуль fresh → реестр пуст → level 1).
* CHANGELOG — ОТСДЕЛЬНЫЙ коммит «Задача 000222: CHANGELOG — …»
  (дата 2026-10-19, секция «Игровой процесс»: уровни зданий в
  городах — лавки/наставник/хранилище, стоимость ×2, макс 7;
  программная часть не перечисляется).

## 5. Подводные камни

1. **НЕ материализовать level in place** (storageAt `e.storage=[]` —
   единственная in-place точка 000221): deepEqual-пины R10 city-storage
   / R22-R24 cities падут. upgradeBuildingAt — чистый (новый record).
2. **main.js frozen**: уровень ДОТЯГИВАЕТСЯ до стоков ТОЛЬКО через
   реестр (D-D) — правка makeCityShop-вызовов в main.js ЗАПРЕЩЕНА
   (конфликт с 000235.02 в main.js).
3. **wealth-throw** (validateWealth cities.js:473 / makeShop clamp):
   effWealth обязан быть int 0..3 ДО вызова makeShop (min(3, …) —
   всегда; floor — целое).
4. **daily-марка 'upgrade'** (D-F): без исключения — джанк-марка у
   boolean раз_в_день (39/40/42/43/45/48).
5. **L2 магазина = L1 по стокам** (floor((L−1)/2): L1/L2 → +0) —
   e2e-тесты магазина (R15) обязаны использовать level ≥ 3;
   «улучшил магазин — ассортимент тот же» при L2 — КОРРЕКТНО
   (цены — тоже те же при +0 wealth; эффект L3+).
6. **Stale-ключи реестра** после demolition — ВРЕДЯТ (правка по
   итогам ревью 2026-10-20, пин R17): makeCityShop 6-арг. при
   ПЕРЕСТРОЙКЕ на той же клетке читает реестр → перестроенная лавка
   наследует wealth-бамп сломанной постройки (cityShops.wealth 2
   вместо 1). РЕШЕНИЕ: demolish-хендлер синкает syncShopLevels ПОСЛЕ
   записи нового record (как upgrade; синк чистит префикс и
   перезаписывает footprint ОСТАВШИХСЯ built-записей). Инвариант:
   запись в реестре ↔ built-запись в ячейке.
7. **Регрессия 1-арг. storageCapacity / 6-арг. makeCityShop** —
   default-аргументы обязаны давать бит-в-бит (пины :331-335 /
   golden :1478).
8. **Сиды**: level/effWealth НЕ входят ни в один сид (makeShop-сид =
   (x,y,type); layout/content-сиды не тронуты) — детерминизм
   сохранён; ноль нового RNG (улучшение — ввод игрока; цена —
   каталог × 2^k; реестр — без RNG).
9. **AP-M2 / RES-A1** — applyMentorSpell-подпись и пул НЕ меняются;
   гейт — внутренность find-предиката (state без level → cap 4 →
   бит-в-бит).
10. **Rebase-риск** (master активен): горячие участки — interactCity
    / extraActions / daily-марка building-actions.js, built-цикл
    validateCityState cities.js, 000055.json+schema+зеркало,
    R6-репин city-storage; зоны 000235.02 (main.js HUD/кнопка +
    spells.js) — непересекающиеся (main.js frozen).
11. **vm-секции**: полный прогон — ОДИН worktree = ОДИН node --test
    (память: 000054 мутирует src/npc-data.js при параллельном
    прогоне); флейк чужого теста — перепуск файла + запись в отчёт.

## 6. План реализации (красная/зелёная станции)

Красная: tests/building-levels.test.js (16 RED по D-J) + этот файл.
Коммит: память вместе с тестами (статус RED: ровно 16 fail в новом
файле, 2687 pass — верифицировать npm test).

Зелёная (код, порядок — ядро → проводка → UI → данные → spec):
1. src/cities.js: MAX_BUILDING_LEVEL; validateCityState +level;
   isLevelableBuilding; upgradeCost; upgradeBuildingAt;
   buildingLevelAt; storageCapacity +level; shopLevels +
   setShopLevel + syncShopLevels; makeCityShop +level/effWealth;
   экспорт-блок. (ядро — все чистые)
2. src/building-effect-storage.js: resolveCtx capacity +level.
3. src/building-effects.js: applyMentorSpell +mentorLevelOk/cap.
4. src/locations.js: maybeEnterCity +syncShopLevels.
5. src/building-actions.js: upgradeActionRow; interactCity
   extraActions; onBuildingAction +level; daily-марка +upgrade;
   storageMenuRows +level; registerSpecial('upgrade').
6. assets/buildings/000055.json +прирост; assets/buildings/schema.json
   +под-схема хранилище; `npm run sync:buildings-data` (зеркало).
7. spec/buildings.md — проза (3 секции); ре-пин spec-split :103.
8. Технический ре-пин: city-storage R6 ids; cities.test.js
   makeCityShop.length 7.
Коммит задачи — ОДИН: все изменения (код+тесты+память+spec+каталог+
зеркало), первая строка «Задача 000222: …» (рус.), Co-Authored-By.
CHANGELOG.md — отдельный коммит «Задача 000222: CHANGELOG — …».

Ожидаемая дельта: +~360 строк src (cities.js ~+170,
building-actions.js ~+150, building-effects.js ~+25,
building-effect-storage.js ~+3, locations.js ~+5), +~1 строк
000055.json, +~15 строк schema.json, зеркало +~1, spec +~12,
тесты +~800 (новый файл) + ~6 (репины). Файлов: ~15 (без CHANGELOG).

## 7. GREEN: уровень СТОИМОСТИ строки/хендлера «Улучшить» (решено; ПРАВКА ПО ИТОГАМ РЕВЬЮ 2026-10-20)

Первая GREEN-версия делила уровень стоимости (черновик D-B):
хранилище — уровень ЗАПИСИ; магазин/наставник — уровень РЕЕСТРА + 1,
кламп MAX−2 (`costLevel = min(regL + 1, MAX_BUILDING_LEVEL − 2)`,
upgradeCostLevel в building-actions.js).

**Правка по итогам ревью: цена — по уровню ЗАПИСИ для ВСЕХ 7
levelable-типов** — ровно по ТЗ: L→L+1 = buildCost × 2^(L−1) по
ВСЕМ ресурсам. upgradeCostLevel УДАЛЕН; строка (upgradeActionRow)
и хендлер ('upgrade') вызывают `C.upgradeCost(b.id, levelЗаписи)`.

Почему запись, а не реестр:
* ТЗ/контракт (spec/buildings.md «Строительство и цены», зафиксирован
  в задаче) задаёт ОДНУ формулу — buildCost × 2^(L−1), L — уровень
  здания (записи). Двухуровневая формула со «стагнирующим» реестром
  этим контрактом не обоснована.
* Реестр по дизайну лагает за записью (синк — при входе + после
  улучшения лавки) — цена от лагающего значения неверна (после
  улучшения лавки запись на L+1, реестр на L).
* Реестр (shopLevels) остаётся питать ТОЛЬКО makeCityShop (6-арг.
  в buildCityAt — wealth-бамп f(L) при перестройке лавки); для цены
  shopLevelAt не читается (doc-комментарий shopLevelAt обновлён).

Репины пинов (технические, по ТЗ):
* R15 (shop-1, база 50 з. + Бревно ×2): 4 шага 50/100/200/400 з.
  (Бревно ×2/×4/×8/×16), gold 1750→950; wood 62 → 30. Финальная
  строка L5→6 — 800 з. (Бревно ×32) = 50 × 2^4 — БЕЗ ИЗМЕНЕНИЙ
  (замечание к правке ревьюера «1600 з. (Бревно ×64)» — арифметическая
  ошибка: после 4 улучшений здание на L5, и L5→6 = 50 × 2^4 = 800).
* R16 (наставник 38, база 80 з. + Горечавка ×2): L1→2 — 80 з.
  (Горечавка ×2), не 160 з. (×4).
* R11/R12(a)/R13/R14 (хранилище 55, база 100 з.) — БЕЗ ИЗМЕНЕНИЙ
  (хранилище и так считалось по записи).
* R12(b) (shop-1, запись L2, ПУСТОЙ реестр) — БЕЗ ИЗМЕНЕНИЙ: обе
  формулы дают 100 з. ×4 (старая: regL 1 → costLevel 2; новая:
  запись L2).

Механика (остаётся из первой GREEN-версии):
* `shopLevelAt(cityX, cityY, tx, ty)` (cities.js, экспорт) — чтение
  реестра: int 1..7 | null (absent/мусор).
* **Синк после улучшения — ТОЛЬКО лавка** (`особые_параметры.map_index`
  — number): syncShopLevels пишет footprint ВСЕХ built-записей города.
  Теперь синк — для ПЕРЕСТРОЙКИ (wealth-бамп makeCityShop), а не для
  цены. Синк при ВХОДЕ (locations.js maybeEnterCity) — БЕЗУСЛОВНЫЙ.
* **Синк ПОСЛЕ сноса** (правка по итогам ревью, пин R17): demolish-
  хендлер вызывает syncShopLevels ПОСЛЕ записи нового record — иначе
  реестр держит СТАРЫЙ уровень, и перестроенная в слоте лавка
  наследует wealth-бамп сломанной постройки (makeCityShop 6-арг.),
  а строка улучшения дорожала бы по стагнувшему реестру. Инвариант:
  запись в реестре есть, ТОЛЬКО если ячейка содержит built-запись
  (вход/улучшение/снос покрывают все мутации built).
* In-place wealth-бамп лавок footprint (`shop.wealth = min(3, w +
  f(newL) − f(oldL))`, f(L) = floor((L−1)/2)) — как в draft D-D
  (по cityShops — лавкам; у не-лавок клеток там нет — no-op).
* Макс: L7 — строка disabled «максимальный уровень (7)» (без клампа —
  формула доходит до L6→7 = buildCost × 2^5; R1/R15-финал).

## 8. GREEN: канонизация ЖИВОЙ built-записи при входе в город (решено)

R14 (vm): build-55 → [E]-меню → upgrade → выход/возврат →
`g.cities[anchor].built` deepEqual [{x, y, buildingId, player, level:2}]
— БЕЗ storage. R3 (node, чистая): upgradeBuildingAt(запись с ЯВНЫМ
storage:[]) → storage:[] СОХРАНЯЕТСЯ («прочее сохранено»).

Корень: storageAt (cities.js, 000221) ЛЕНИВО материализует
`e.storage = []` на ЖИВОЙ записи при ЧТЕНИИ ([E]-меню —
storageMenuRows → storageAt). upgradeBuildingAt копирует запись
БИТ-В-БИТ (R3) — storage:[] попадает в новый record. exitCity —
no-op; prepareCityState (main.js, FROZEN) держит built ПО ССЫЛКЕ —
мусор переживает выход/возврат.

РЕШЕНИЕ (не в upgradeBuildingAt — R3 запрещает): **maybeEnterCity
(locations.js)** — при входе в город, после резолва savedRec и ДО
syncShopLevels: in-place обход built — `storage` = ПУСТОЙ массив →
`delete e.storage`. Живая запись становится равной форме СЕЙВА
(validateCityState, 000221 D4/D7: пустой storage omitted при сейве).
prepareCityState (заморожен, читает тот же live-Map ПОСЛЕ
maybeEnterCity — enterLocation main.js:2296 → 2301) видит чистый
built. Ненулевой storage, level и прочее — не тронуты (R14-boot2:
storage 42 жив). Мировые/чистые пути (node-фикстуры без
maybeEnterCity) — БИТ-В-БИТ. Детерминизм: без RNG, без новых сидов.

## 9. ПРАВКА ПО ИТОГАМ РЕВЬЮ (2026-10-20): подавление 1-к-1 эффектов в городе УБРАНО

Первая GREEN-версия подавляла 1-к-1 эффекты (постройки БЕЗ массива
`особые_параметры.эффекты` — «Осмотреть» 48, «Посмотреть на дно» 45,
«Взглянуть» 46, круг/храм 39/43) в ГОРОДЕ (tile.cityAnchor): в [E]-
меню таких построек строки эффектов не было. R11(e) пинновал ids
['demolish'].

**Правка: подавление УДАЛЕНО** (building-effects.js buildingActions —
`effIds = effectIds(building)` без city-условия). Причины:
* Существующий ДО задачи контракт spec/buildings.md («Эффекты
  построенных в городе») гласит: «действия постройки (диалог/лавка/
  NPC) — как у базовых; … эффекты, требующие мирового тайла, в городе
  недоступны» — т.е. эффекты в городе действуют как в мире.
  Подавление убрало ДО-ЗАДАЧНУЮ функциональность, которую ТЗ не
  просило убирать.
* «Эффекты, требующие мирового тайла» — отдельный пункт контракта
  (и отдельная зона для будущих задач); blanket-подавление всех 1-к-1
  его не реализует (46/39/43 читают map.tileAt и в городе деградруют
  fail-open/quirk'ом, 45/48 — чистые hero-операции).

Репин (технический): R11(e) — player-48 в городе → ids
['48', 'demolish'] (эффект «Осмотреть» ЕСТЬ, строки upgrade НЕТ).
Мир (B24) — без изменений (условия cityAnchor в effectIds/
buildingActions больше нет вовсе).

ЗАМЕТКА ДЛЯ РЕТРО (вне scope 000222, до-задачное поведение):
эффект 46 («Взглянуть», applyExplore) в городе читает map.tileAt в
окне Чебышёва вокруг якоря — помечает «мусорные» мировые тайлы
исследованными. Это поведение 46 в городе существовало ДО задачи
(подавление — артефакт 000222, теперь удалён); кандидат на
отдельную задачу «эффекты, требующие мирового тайла, в городе
недоступны» (буква контракта spec).

## 10. ФИНАЛИЗАЦИЯ (2026-10-20)

Статус: ВЫПОЛНЕНО — задача в tasks/done (git mv — da301f7), отчёт
tasks/result/000222.md. Коммиты ветки task/000222: fc6e693 (красные
тесты + этот файл), da301f7 (реализация), ac17866 (CHANGELOG),
0d72431 (правки по итогам ревью — 6 замечаний: синк после сноса,
цена по уровню записи, подавление убрано, CHANGELOG-дата, R18),
коммит финализации (отчёт + этот раздел). npm test на момент
финализации: 2705/2705 pass, 0 fail (139 c; 2687 базы + 18 новых).
Мастер сдвинулся +14 коммитов от базы 38dbd89 (000224, 000230.01/
02/03/05, 000235.02/03/05, 000236, 000237, ретро 33c3a4b). Файловое
пересечение с master ВНЕ CHANGELOG.md — НУЛЬ (проверено
name-only-пересечением). CHANGELOG — суперсет-форма (правка
ревью #4): версия ветки = версия master + наш 8-строчный вход
«Улучшение зданий в городе» под «## 2026-10-20» → мерж СКАШЕМ
(reset --soft на master + один коммит + ff-only): diff vs master =
только наш вход, конфликтов нет; коммит-по-коммиту ребейз НЕ
делать (секция «## 2026-10-20» конфликтует); секция выросла к
мержу — регенерировать суперсет; мерж не сегодня — вход под
реальную дату. После любого перебазирования — ОБЯЗАТЕЛЕН полный
npm test (vm-песочницы). Ветки в полёте (000230.04/06, 000232,
000235.06, 000238) — файловых пересечений с нашей задачей нет.

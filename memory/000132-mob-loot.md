# 000132 — Лут с мобов при победе: контракты

Победа над группой даёт предметный лут (SPEC.md «Лут» L217-221):
per-mob таблицы (данные assets/mobs, зеркало MOB_TYPES) + базовый и
редкий пулы (данные модуля combat.js). Выдача — в инвентарь героя во
ВСЕХ 3 местах победы main.js. Сегодня победа даёт только xp+gold.
Родитель 000001 (волна аудита 1, P1). Дата: 2026-10-05.
Файлы: src/combat.js, src/main.js, tests/combat.test.js (блок 000132),
tests/loot-e2e.test.js (НОВЫЙ), CHANGELOG.md. НОВЫХ МОДУЛЕЙ НЕТ
(index.html — без изменений, tests/index-order.test.js — без правок),
SVG/ассетов НЕТ (лут = существующие 42 предмета каталога).

## Что добавлено / перенесено

* **src/combat.js** — данные пулов (константы + 2 массива id, рядом с
  GROUP_RECIPES / до checkVictory) + чистая функция `rollVictoryLoot(c,
  killed)` + вызов в `checkVictory` ВНУТРИ victory-ветки + расширение
  `c.result` полем `items` + поправка устаревшего комментария :1720
  про «Удачу» (techTweaks 000001 §8).
* **src/main.js** — ОДИН хелпер `combatEndLoot(res)` (wiring-секция,
  сразу ПОСЛЕ combatEndCompanions :421-449 — тот же паттерн: гвард →
  строки[]) + 3 точки вызова в onEnd побед (startCombatAt :1308,
  maybeStartCombat :1632, startDungeonCombat :1905).
* **Красные тесты** (TDD, стадия red): tests/combat.test.js N1-N6 +
  tests/loot-e2e.test.js V1/V2/S1. Ожидаемо падает ровно 8 (N5 —
  зелёный защитный пин gold-потока), остальные 1617 — зелёные
  (базлайн 1616 + N5; всего 1625 — как в коммите 0ef4709).

## Пулы и шансы (данные модуля combat.js — ФИКСИРОВАННЫЕ списки)

Решение ТЗ «список пула — данные модуля, паттерн текстов efir.js»
(efir.js: EFIR_SPELL_START/EFIR_SPELL_UNLOCKS/EFIR_SKILLS — фиксированные
массивы). Пулы НЕ производятся из каталога в рантайме:
* каталог растёт параллельно (000133 — assets/items) — фиксированные
  пулы = нулевое файловое/рантайм-пересечение, пины не сдвигаются;
* состав пула — осознанное игровое решение, авто-включение новых
  предметов = тихий сдвиг баланса (без решения по задаче);
* целостность (все id существуют в каталоге, кинды/границы) — пин N6.

* **Предметный пул** — не массив: собственная таблица моба `u.loot`
  (MOB_TYPES :109-151, зеркало assets/mobs; поле на юните — makeMob
  :280 `loot: t.loot || []`). Каждая запись `{item, chance}` —
  НЕЗАВИСИМЫЙ ролл `c._rng() < chance`, порядок = порядок таблицы.
  Пустые таблицы (orc_mad :116, centipede :138) — цикл 0 итераций,
  базовый/редкий роллятся (деградация, без краша).
* **Базовый пул** — ВСЕ предметы каталога kind food/potion, 8 id,
  порядок файлов каталога (000011..000018):
  `minor_healing, healing_potion, greater_healing, mana_potion,
  mana_elixir, bread, meat, honey_cake`. Шанс **0.25** (решение ТЗ) —
  `LOOT_BASE_CHANCE`, 1 ролл на каждого поверженного моба; попадание →
  выбор `pool[floor(c._rng() * len)]`.
* **Редкий пул** — ВСЕ skill_book (11) + weapon/armor ВЕРХНЕЙ половины
  каталога по value (7) = 18 id, порядок файлов каталога:
  `iron_sword, steel_sword, hunting_bow, battle_axe, war_hammer,
  chainmail, knight_plate, alchemy_manual, sword_treatise,
  archery_manual, stone_fist_grimoire, iron_hide_tome, fire_spellbook,
  ice_spellbook, heavy_tome, archer_scroll, meditation_scroll,
  nature_scroll`. Шанс **0.05 + 0.01 × maxLevel** (maxLevel — уровень
  СТАРШЕГО из killed) — 1 ОБЩИЙ ролл на БОЙ (решение ТЗ; реализация
  SPEC «уровень лута = моб+дельта»: дельта влияет на ШАНС пула, не на
  предмет — каталог БЕЗ уровней, open question аудита закрыт).
* **Граница редкого**: «верхняя половина каталога по value» —
  медиана каталога (42 шт.) = **35** (пара greater_healing/
  leather_armor) — фикс: **value > 35 СТРОГО**. leather_armor (35,
  общий ранний доспех, уже в per-mob таблицах) — ВНЕ редкого пула;
  iron_sword (40) — внутри. «Чертёж» в SPEC-пуле — каталога чертежей
  НЕТ (ограничение каталога, 000133).
* Выбор из пула — равномерный `pool[floor(c._rng() * len)]` (ТЗ
  механизм не фиксировал — зафиксировано здесь, пин N2).

## Порядок вызовов c._rng в checkVictory (ДЕТЕРМИНИЗМ — ФИКСИРОВАН)

checkVictory :694-740: `killed = c.units.filter(side==='mob' &&
!alive)` (только МЁРТВЫЕ — сбежавшие alive+fled вне, как и для
xp/gold) → xp reduce (без rng) → **gold reduce :706 (N вызовов, N =
killed.length)** → `if (killed.length > 0)` { addXp, gold, allyXp
(000082, ноль rng) → **НОВЫЙ БЛОК: `const items = rollVictoryLoot(c,
killed)`** → `c.result = {outcome:'victory', xp, gold, defeated,
allyXp, items}` → log :730 }.

Последовательность внутри rollVictoryLoot (порядок — суть
детерминизма; фиксируется пином N2):
```
для КАЖДОГО u из killed (порядок c.units):
  для КАЖДОЙ записи e из (u.loot || []) (порядок таблицы):
    if (c._rng() < e.chance) drop(e.item)      // 1 вызов на запись
  if (c._rng() < 0.25)                                  // 1 на моб
    drop(BASE_POOL[floor(c._rng() * len)])   // +1 на выбор (при попадании)
1 общий ролл на бой (ПОСЛЕ цикла):
  if (c._rng() < 0.05 + 0.01 * maxLvl(killed))
    drop(RARE_POOL[floor(c._rng() * len)])   // +1 на выбор (при попадании)
```
* drop(id) — слияние: запись с тем id → qty++, иначе новая `{id,
  qty:1}` (порядок ПЕРВОГО появления).
* Вызовы — ТОЛЬКО в victory-ветке (killed.length > 0) и СТРОГО ПОСЛЕ
  gold-роллов :706 (прецедент 000082: новые rng — только после
  существующих) — бит-в-бит поток createCombat/gold-пинов сохранён.
  'fled' (:733) и 'dead' (:1704) — роллов НЕТ, поля items НЕТ.
* Роллы ВЫБОРА (floor(rng*len)) — только при попаданиях (поток
  детерминирован по сиду, но разный на разные промахи — норма).
* c.log «Победа! +xp опыта, +gold золота.» (:730) — БЕЗ ИЗМЕНЕНИЙ
  (имена предметов — только flash/ds.log; меньше пинов ломается).

## c.result.items (контракт поля)

* ФОРМАТ: массив `{id, qty}` (id — string из каталога, qty — int ≥ 1,
  повторяющиеся id — слиты). ТОЛЬКО в outcome 'victory' (шаблон
  allyXp 000082): 'fled'/'dead' — поля НЕТ. Мог БЫТЬ пустым `[]`
  (все роллы мимо) — в отличие от allyXp, где [] = 0 союзников.
* Читатели ОДНОГО — main.js (combatEndLoot гвардит
  `outcome==='victory' && Array.isArray(res.items)`); обработчики,
  мутирующие c.result руками (combat-ui.test.js, companions-cycle
  V4/V5) — БЕЗ items → хелпер no-op (байт-в-байт HUD-пины
  сохранены).

## Хелпер main.js — combatEndLoot(res) → string[]

* **no-op guard (ОБЯЗАТЕЛЕН)**: `!res || res.outcome !== 'victory' ||
  !Array.isArray(res.items) || res.items.length === 0 → []` — иначе
  ломается байт-в-байт пин companions-cycle V4 «Победа! +50 опыта,
  +1 золота.» (мутация result без items).
* УMD-guard (паттерн 000038/000053): `typeof G.addItem !== 'function'
  || typeof G.getItem !== 'function'` → console.error (ОДИН раз,
  флаг) + `[]` — игра не падает.
* Выдача (порядок res.items): `it = G.getItem(rec.id); if (!it)
  continue;` (тихий skip — деградация); qty — `Number.isInteger && >0`
  иначе 1; `add = G.addItem(hero, rec.id, qty)` — **плоский API**
  (ТЗ «G.items.addItem» — неточное имя; реально G.addItem/G.getItem —
  items.js экспортирует flat на Game; прецедент сундука main.js:1818).
* **Авто-золото (решение ТЗ)**: при ЛЮБОМ отказе addItem (
  «слишком тяжело (лимит веса)» И «нет свободных слотов») — предмет
  НЕ теряется: `overflow += it.value * qty` (value — базовая цена
  каталога, НЕ sellPrice лавки: в бою лавки нет; sellPrice строится
  от value — items.js:767-771). ПОСЛЕ цикла: `hero.gold += overflow`
  (hero — ЖИВАЯ ссылка, мутация — паттерн спец-хендлеров).
* Строки (порядок): `['Лут: Имя1, Имя2 ×2.', 'не влезло: +N золота']`
  (каждая — только если есть): Лут — ОДНА строка по всем выданным
  (имена в порядке c.result.items, qty>1 — « ×N»); не влезло — ОДНА
  АГРЕГИРОВАННАЯ строка с суммой (ТЗ цитирует одну строку; flash
  компактный; dungeon — 1 push). Формулировка «не влезло: +N золота»
  — дословно из ТЗ (строчная «не», БЕЗ точки).
* НОЛЬ rng (детерминизм выдачи — выдача чистая функция от res.items).

## 3 точки вызова (main.js, минимальные hunk'и)

1. **startCombatAt onEnd :1308** (боссы building-content 000077 +
   debug `__game.actions.startCombat` :2414) — ПЕРЕД блоком
   000087 `const compLines = ...` (:1337):
   `const lootLines = combatEndLoot(res); if (lootLines.length)
   hudFlash = hudFlash + '\n' + lootLines.join('\n');`
   (порядок строк: «Победа!…» → лут → отряд; hudFlash —
   мультистрочный, механика работает — compLines).
2. **maybeStartCombat onEnd :1632** (группа на тайле мира) — ПЕРЕД
   `const compLines = ...` (:1667) — тот же блок (лут — ПОСЛЕ
   квест-строки, последняя до-отрядная строка).
3. **startDungeonCombat onEnd :1905** (блуждающая группа/босс
   seed 999) — ПЕРЕД for-циклом companion-строк (:1926):
   `for (const l of combatEndLoot(res)) ds.log.push(l);` — паттерн
   000066: ПО ОДНОЙ строке на push (НЕ join('\n')); порядок:
   «…повержена. +N опыта.» → лут → отряд.
* Новые боевые награды-предметы (будущие задачи) — через ЭТОТ же
  хелпер (контракт расширения 000001 §7 «Лут-канал боя»).

## Ленивые ссылки и guards

* **main.js**: G — единственный снапшот :13 (000038);
  G.addItem/G.getItem читаются ЛЕНИВО в момент вызова хелпера +
  guard → console.error (one-shot) + []. hero — live-ссылка (мутирует
  gold/inventory через items.js).
* **combat.js**: пулы — фиксированные данные (каталог в рантайме НЕ
  нужен — `I` (items.js, UMD-аргумент фабрики :67) для ролла НЕ
  используется; валидация id — тестами N6 + существующий тест
  ссылочной целостности loot→items combat.test.js:255). I уже
  аргумент фабрики (perlin/P/I/settings/mobGroups :77) — изменения
  сигнатуры НЕТ.
* items.js: `addItem(c, itemId, qty, bonus)` — bonus НЕ передаём
  (обычные предметы, не крафт-экземпляры); отказ-строки:
  «неизвестный предмет: …» / «неверное количество» / «нет свободных
  слотов инвентаря» / «слишком тяжело (лимит веса)» — авто-золото
  срабатывает на ЛЮБОМ (в т.ч. «неверное количество» — qty
  нормализован хелпером, защита от мусора в res.items).

## Тесты (красные) — ожидаемо падает ровно 8

* tests/combat.test.js (блок «000132» в конец файла, паттерн 000082):
  * N1 детерминизм: сиды 5..10, волк L2, 2 прогона →
    Array.isArray(c.result.items) (guard ДО сравнения!) +
    deepEqual(items1, items2).
  * N2 точные составы (после createCombat — `c._rng = () => const`,
    убийство ударом, паттерн :2745): rng→0, 2×волк L2 →
    `[{leather_armor,2},{minor_healing,2},{iron_sword,1}]`, xp 32,
    gold 14 (round(3+4+0·2)=7 ×2); rng→0.99, 2×волк L2 → `[]`;
    rng→0.99 + мутированный 100%-пул `u.loot=[{item:'meat',chance:1}]`
    (поле читается живьём — мутация ДО ролла действует) → `[{meat,1}]`;
    2 волка × 100%-пул meat → `[{meat,2}]` (слияние); 2 записи
    [{sulfur,1},{meat,1}] → порядок таблицы `[sulfur, meat]`.
  * N3 пустые таблицы (orc_mad L3 seed 5; centipede L2 seed 5) —
    victory, items — массив (любой), БЕЗ краша.
  * N4 'fled'/'dead' — `!('items' in c.result)`; victory —
    `'items' in c.result` + Array.isArray (сценарии — готовые :2807-2826).
  * N5 gold-поток БЕЗ ИЗМЕНЕНИЙ (защитный, ЗЕЛЁНЫЙ с red-фазы):
    волк L2 — seed 5 → xp 16/gold 8, seed 7 → 16/7, seed 9 → 16/9;
    orc_mad L3 seed 5 → 20/10 (сверено на мастере 375c0f4 —
    скриптом, 2026-10-05). Ловит реализацию, поставившую лут-роллы
    до/вместо gold-ролла.
  * N6 пулы — данные: deepEqual точных списков (8/18, порядок файлов
    каталога) + ЦЕЛОСТНОСТЬ в одну сторону (каждый id ∈ каталогу;
    базовый — kind ∈ {food,potion}; редкий — kind skill_book или
    weapon/armor с value > 35) + размеры 8/18. ОБРАТНОГО
    set-equality с выводом из каталога НЕТ (000133 растит каталог —
    фиксированные пулы не обязаны за ним следить; дрейф состава =
    отдельная задача). Пулы вычитаются в-тесте через
    `require('../src/combat.js')` (новый экспорт LOOT_BASE_POOL /
    LOOT_RARE_POOL — паттерн экспорта MOB_TYPES/GROUP_RECIPES).
* tests/loot-e2e.test.js (НОВЫЙ, vm-песочница — дубль bootSandbox
  из tests/companions-cycle.test.js; цепочка index.html):
  * V1 «победа → предмет в инвентаре»: boot(seedSave) →
    `g.actions.startCombat(0)` (место 1308) → мутация
    `c.phase='over'; c.result={outcome:'victory', xp:16, gold:8,
    defeated:1, allyXp:[], items:[{id:'sulfur',qty:1}]}` →
    `G.combatUI.handleCode('Escape')` → onEnd → асерты:
    `__game.state.hero.inventory` = `[{id:'sulfur',qty:1}]` (live
    slots; getter main.js:2290-2301), hud: базовая «Победа! +16
    опыта, +8 золота.» НЕ тронута + «Лут: Сера.», gold НЕ изменился
    (мутационный бой — core не гоняется, дельта = только авто-золото
    = 0).
  * V2 «переполнение → авто-золото»: ДО боя `g.actions.giveItem
    ('wood_log', 14)` (14×2 кг = 28 кг, 1 слот; лимит 30) →
    items:[{id:'knight_plate',qty:1}] (7 кг → 35 > 30 → отказ по
    весу) → gold +**400** РОВНО (value knight_plate), slots
    БЕЗ knight_plate (wood_log на месте), hud строка
    «не влезло: +400 золота».
  * S1 структурный скан main.js (node, паттерн S2
    companions-cycle): хелпер combatEndLoot в wiring-секции +
    ВЫЗОВ во ВСЕХ 3 onEnd-окнах (startCombatAt/maybeStartCombat/
    startDungeonCombat) + в хелпере: G.addItem, hero.gold,
    «не влезло», guard outcome/items. Закрывает 3-е место
    (подземелье) без дорогого dungeon-e2e (ТЗ «мир и/или подземелье»
    = и/или).
* Мутируемый подход e2e (НЕ реальный бой в vm): onEnd реальный,
  checkVictory покрыт node-тестами N1-N6; байт-в-байт HUD-пин V4
  (companions-cycle) сохраняется (no-op guard).

## Что важно будущим задачам (из ТЗ-ссылок / 000001 §3/§4/§6/§7)

* Серия combat.js: «моб-магия» (§4.1) и «Предмет [T]» (§4.9) —
  ПОСЛЕ мержа 000132 (конфликт в одном файле — последовательность).
* 000133 (каталог items, параллельно): пулы 000132 фиксированные —
  файловое/рантайм-пересечение НЕТ; новые предметы каталога в пулы
  НЕ попадают автоматически (состав пула = решение новой задачи).
* 000135 (main.js, параллельно): зона — тело maybeStartCombat
  :1595-1629 (зоны); наша зона — onEnd-окна (1632+) + хелпер + 2
  других onEnd. Ребейз — чистый; при конфликте ревьюить блоками.
* Новые боевые награды-предметы — через c.result.items +
  combatEndLoot (НЕ обходить хелпер).
* Сейвы: inventory — существующий раздел (ensureInventory,
  sanitizeInventory :676-677, дамп :2297-2299) — предметов сейва
  НЕТ, версия НЕ повышается.
* SPEC-«уровни лута» — каталог БЕЗ уровней (value только) —
  реализовано через шанс редкого; «чертежи» — нет в каталоге;
  «тип лута по роду моба» — уже в per-mob таблицах (данные).

## Подводные камни

1. **rng-поток**: лут-роллы ДО gold-ролла :706 = сдвиг ВСЕХ
   существующих createCombat-пинов (gold/xp-значения). Пин N5 —
   защитный. gold/xp reduce — не трогать.
2. **no-op guard хелпера** — критичен: все существующие
   мутационные e2e (combat-ui L660/1146/2067, combat.test.js L1199,
   companions-cycle V4/V5) мутируют c.result БЕЗ items.
3. **fled-мобы не дают лута**: killed = только !alive (сбежавшие —
   alive+fled=true) — лут/xp/gold — один и тот же список.
4. **value, не sellPrice**: авто-золото — базовая цена каталога
   (sellPrice = value × wealth-множители лавки — items.js:767-771;
   в бою лавки нет).
5. **мультистрочность**: мир — hudFlash join('\n') (работает —
   compLines); dungeon — ds.log по ОДНОЙ строке на push (000066) —
   НЕ join('\n').
6. **UMD**: в браузерной ветке combat.js `I = root.Game` (не модуль
   items) — но для ролла пулов I не нужен (фиксированные данные);
   в main.js — ленивые G.* + guard (000038/000053).
7. **сундук подземелья при отказе addItem — «предмет потерян»
   (main.js:1816-1825) — ИНАЯ семантика, не трогаем** (000132 —
   авто-золото только для боевого лута).
8. **Порядок пулов = порядок файлов каталога** (не по value, не
   food-сначала) — пины N2/N6 привязаны к этому; изменение порядка =
   изменение дропа при том же сииде (не «рефакторинг»).
9. **qty-слияние в c.result.items** — один {id, qty} на id; хелпер
   выдаёт qty целиком (addItem сам стокует: potion/food/skill_book/
   reagent — STACKABLE, weapon/armor — по слоту).

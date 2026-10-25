# 000251 — Сундуки подземелий: фантомные legacy-брони из пулов CRYPT/RUINS + раздел «Лут» в SPEC: контракты

Станция ПРОЕКТИРОВАНИЕ (2026-10-24). Статус: дизайн завершён; RED-стадия
коммитит новые тесты (000251-P1/P2/S1) вместе с этой памятью, GREEN-стадия —
данные + ре-пины + spec + отчёт. Worktree `.worktrees/task-000251`, ветка
task/000251, база master dd36eea (000230.15). ТЗ — tasks/pending/000251.md
(source of truth). Источник: finding #2 (major) ретро-анализа 2026-10-22b
(000230.10) — tasks/result/000230.10-retro-20261022b.md. Мягкая зависимость
ТЗ «ПОСЛЕ 000230.11–.15/000235.10» выполнена — всё уже в master.
Станция FINALIZE (2026-10-25): статус — ВЫПОЛНЕНО (отчёт/память/
CHANGELOG/перенос в done), ждёт стадию мержа: rebase на master
e5b1c24 (000252/000253/000250/000230.17.01) — текстовый конфликт
ТОЛЬКО CHANGELOG.md (буллеты 000250 и наши — в одну точку,
сохранить оба); spec-split — чистый 3-way (разные строки);
ре-симуляция НЕ нужна (master не трогал CRYPT/RUINS-пулы,
dungeons-JSON, dungeon.js, EQUIP_POOLS); после ребейза — полный
`node --test tests/` (набор вырос тестами master) — подробности в
отчёте, «Подводные камни».
Анализы: /tmp/thegame-wf-000251/a1-domain.md, arch-design.md, a3-tests.md
(+ node-симуляции sim-*.js; green-sim полного сьюта со ВСЕМИ ре-пинами —
3241/3241, план верифицирован эмпирически).

## 1. Что добавлено / перенесено (карта изменений)

### Данные (source of truth)
* `assets/dungeons/000002.json` (CRYPT, id 1): из пула «предметы» (58→57)
  убрать 2-ю запись (индекс 1) — `"assets/items/000009.json"` (chainmail,
  T1, slot torso).
* `assets/dungeons/000003.json` (RUINS, id 2): из пула «предметы» (33→32)
  убрать 2-ю запись (индекс 1) — `"assets/items/000010.json"` (knight_plate,
  T1, slot torso).
* `assets/dungeons/schema.json` — НЕ ТРОГАТЬ (minItems 1 выполняется).
* Item-файлы `assets/items/000009.json` / `000010.json` — ОСТАЮТСЯ: каталог,
  рецепт craft/000007, buildings 000039/000043, тесты companions/craft/
  cities/squad-panel — без изменений.

### Зеркало и fallback (обязательные следствия, ТОТ ЖЕ коммит)
* `src/dungeons-data.js` — РЕГЕНЕРАЦИЯ `node scripts/sync-dungeons-data.js`
  (byte-идемпотентный, атомарная запись), не руками: зеркальный тест
  tests/dungeon.test.js ~L367 (deepEqual D.DUNGEON_ITEMS[t] ↔ каталог) и
  дрейф-гейт W-08 (tests/sync-all.test.js: `sync:check` exit 0).
* `src/dungeon.js` FALLBACK_DUNGEONS — данные-литералы только:
  L118 (CRYPT.предметы) −`'chainmail'`; L156 (RUINS.предметы) −`'knight_plate'`.
  Механика (chest-equip-блок ~L903-924, CHEST_EQ_SALT L513, все rng-формы) —
  дословно, БИТ-В-БИТ.

### SPEC
* `spec/dungeons-storage.md` «## Лут» (L104-132): НОВЫЙ буллет
  «Снаряжение сундуков…» — дословный текст §6.3, вставка ПОСЛЕ буллета
  «Сундуки» (L123-131), ПЕРЕД «## Залежи» (L133). N = 16 строк →
  re-pin tests/spec-split.test.js `"dungeons-storage.md": 184 → 200`
  (комментарий «000251: +16 (буллет chest-equip…)»; точное N — по факту
  написанного текста, текст закреплён пинами S1). H2-состав
  ["## Лут", "## Залежи"] — без нового H2/H3; SPEC_ROOT_LINES — не трогать.
  9 закреплённых фраз spec-000235-wording («Лут») — НЕ ПРАВИТЬ.
* НОВЫЙ файл `tests/spec-000251-wording.test.js` — S1: ОДИН test с 5
  assert.ok (W1-W5, §6.4), секция h2('Лут') + norm() (паттерн
  spec-000235/000259-wording).

### Тесты
* Новые RED (RED-коммит): tests/dungeon.test.js `000251-P1` (CRYPT-пул:
  нет chainmail + нет предмета с явным slot — контракт C-2) и `000251-P2`
  (RUINS-пул: нет knight_plate) — размещение рядом с S3 (~L800), через
  loadDungeonCatalog (L238) + resolvedDungeonRecord (L2473) + ITEMS-
  синглтон (L11); tests/spec-000251-wording.test.js S1. expectedRedCount = 3
  (P1, P2, S1; строго по разделу ТЗ «Тесты» — 2, P1+P2).
* Технические ре-пины (GREEN-коммит) — полный список:
  1. tests/dungeon.test.js S3 (L800): EXPECTED['000002.json'] −'chainmail'
     (57), EXPECTED['000003.json'] −'knight_plate' (32) + комментарий
     «ре-пин 000251».
  2. tests/dungeon.test.js DUN-REF-2 (DUN_REF_PREV ~L2521/2559): те же
     −2 id (57/32).
  3. tests/dungeon.test.js W-07 000235.07 (~L3400, RUINS): список
     −'knight_plate'; `33 → 32`; «27 свитков из 32»; название; FALLBACK 1:1
     (следует за п. данных).
  4. tests/dungeon.test.js W-07 000235.09 (~L3558, CRYPT): список
     −'chainmail'; `58 → 57`; T1-баланс `15/58 → 14/57` (chainmail — T1);
     название.
  5. tests/dungeon.test.js W-07 000235.10 (~L3625, CRYPT): список
     −'chainmail'; `58 → 57`; T1 `14/57`; пин «50 свитков волн» НЕ
     ТРОГАЕТСЯ; название.
  6. tests/dungeon.test.js 000230.10-CH5 (~L3156) — РЕДИЗАЙН (D-5, §5);
     единственный семантический сдвиг.
  7. tests/dungeon-loot-e2e.test.js: ТРИ CRYPT-теста — 000235.05 E1 (~L693),
     000235.09 W-09 (~L997), 000235.10 W-09 (~L1091): c0-пин item
     'faith_shield_scroll' → 'prayer_scroll' (x=12, y=4, gold=29,
     opened=false — БИТ-В-БИТ) + комментарий «ре-пин 000251» (T1-фильтр
     15→14; prayer_scroll — тоже волна Исцеление, семантика «свиток
     исцеления из CRYPT» сохраняется). 000235.07 W-09 RUINS (~L815) — БЕЗ
     ИЗМЕНЕНИЙ (hearthfire_scroll — последний T1-элемент пула, бит-в-бит).
  8. tests/spec-split.test.js (L120): line-count 184 → 200 (D-12).
* НЕ ТРОГАТЬ (проверено прогоном): CH1-CH4 (000230.05; ABYSS + данные
  loot-equip-data), 000230.12-CH (CAVE iron_sword), G2-1/G2-2/D-BOSS
  (CAVE/ABYSS), ORE-1..8, X1 (tier-инварианты — T1-пулы непусты), DUN-REF-1/
  3/4, DUNGEON_MOBS, 000186-A1/B1/P1 (B1 — fixture сундука с
  knight_plate, генерация пула не участвует), W-09 RUINS e2e, AR8,
  assets-schemas, sync-all (после регенерации), spec-000235/depth-wording,
  index-order, svg, building-effects A62 (property id ∈ таблицы — пройдёт).

### Прочее
* `memory/000251-chest-phantoms.md` (этот файл) — коммитится на RED-стадии.
* `CHANGELOG.md` — отдельный коммит: в существующий блок `## 2026-10-24` →
  `### Игровой процесс` (текст §6.5).
* `tasks/result/000251.md` — краткий отчёт; `tasks/pending/000251.md` →
  `tasks/done/000251.md` (GREEN-коммит).
* Новых JS-модулей / SVG / script-тегов / CSS — НЕТ (UMD-инварианты,
  svg.test.js, index.html, index-order — неприменимы).

## 2. Почему записи фантомные (подтверждено кодом)

* remap 000230.10 (D-12, memory/000230.10-torso-items-wave.md) дал chainmail
  и knight_plate ЯВНОЕ `slot: "torso"` (assets/items/000009/000010.json).
* chest-equip-блок (000230.05, src/dungeon.js ~L903-924; триггер
  `if (!it || it.slot === undefined) continue;` ~L917, замена ~L921): для
  сундука, у которого роулнутый предмет имеет явный slot → СВОЙ поток
  mulberry32(hash2(seed, depth, CHEST_EQ_SALT=0x0E5C) >>> 0) → tier =
  pickRarityTier (плоская RARITY 50/30/15/4.9/0.1, данные
  src/loot-equip-data.js) → `ch.item = EQUIP_POOLS[tier][floor(rng_eq()·len)]`
  — IN-PLACE (новых ключей в объекте сундука нет). Legacy-броня никогда
  не доходит до игрока из сундуков подземелий.
* Scan (ретро + повторный): legacy-брони в «предметы» dungeons — ТОЛЬКО
  000002 (chainmail) и 000003 (knight_plate).
* ВАЖНЫЙ нюанс (ripple): здание-сундук (building 000077) —
  src/building-effects.js chestLoot: `table[hash(x, y, CHEST_LOOT_SEED^day)
  % table.length]`, где table = G.DUNGEON_ITEMS[dungeonTypeFor(terrain,
  alpha)] — тот же пул БЕЗ chest-equip-замены. До 000251 chainmail/
  knight_plate реально выпадали из СТРОИТЕЛЬНЫХ сундуков на CRYPT/RUINS-
  тайлах. После 000251 — перестают; плюс renumeration mod (58→57 / 33→32)
  сдвигает соответствие (tile, day) → предмет для части тайлов. Ripple —
  ЗАФИКСИРОВАН (эта строка), кодом НЕ чинится (ТЗ: ноль изменений механик;
  тест A62 — property, пройдёт). CHANGELOG (§6.5) говорит об этом честно.

## 3. ОПРОВЕРГНУТАЯ гипотеза «фантомы не роллятся» (ТЗ п.1а)

Фантомы УЧАСТВУЮТ в роллинге: chainmail — idx 1 raw-пула CRYPT,
knight_plate — idx 1 raw-пула RUINS; оба без tier-поля → T1 → в effective-
пуле depth-1 (T = min(4, 1 + floor((depth−1)/2))). Уменьшение длины пула
(raw 58→57 / 33→32; T1-фильтр 15→14 / 11→10) ПЕРЕСЧИТЫВАЕТ
`floor(r·len)`-индекс: метки item меняются для большинства r, даже если
число вызовов главного rng не изменилось. seed/позиции/gold/mobs/deposits —
БИТ-В-БИТ везде (вызовов rng не добавилось/убрано); сдвигаются ТОЛЬКО
значения chests[].item — ровно по паттерну «Сдвиг goldens (000235.05)» из
SPEC. Метод верификации: node-пробы /tmp/thegame-wf-000251/sim-*.js —
mutate D.DUNGEON_ITEMS in-memory (dungeon.js читает таблицу на вызове
generateDungeonContents) до генерации; BEFORE воспроизвёл действующие
goldens 1:1 (сиды 2983680956 / 801567646 / 820179115, все позиции/gold/
items) — харнесс верен; green-sim (JSON −2 + зеркало + FALLBACK + все
ре-пины + CH5-фикстура, закоммичено) — 3241/3241.

Таблица сдвигов (полная):
| Сценарий | сундук | Было | Станет |
|---|---|---|---|
| CH5 CRYPT (seed 2983680956, alpha255, xp1) | c0 | iron_tongs (chainmail→замена) | alchemy_manual (slot-предметов в пуле НЕТ → замена не триггерится; rng_eq: 0 вызовов) |
| CH5 CRYPT | c1 | dark_presence_scroll | без изменений |
| CH5 RUINS (seed 801567646, alpha128, xp3) | c1 | blueprint_forge | blueprint_woodwork |
| CH5 RUINS | c3 | wool_sutan (knight_plate→замена) | wool_sutan БИТ-В-БИТ (ролл теперь war_hammer — ТА ЖЕ позиция idx 1, явный slot right_hand (000230.12) → те же r1/r2 → тот же rare-агрегат; hash2(801567646,1,0x0E5C)=0x2fb95446, r1=0.6180662265978754, r2=0.2789345800410956→floor(·77)=21) |
| E2E CRYPT (вход (0,0), FOREST, xp1, dseed 820179115) | c0 (12,4) g29 | faith_shield_scroll | prayer_scroll (3 теста: E1, W-09 .09, W-09 .10) |
| E2E RUINS (вход (0,0), HILL, xp1, dseed 820179115) | c0 (19,4) g29 | hearthfire_scroll | без изменений (последний T1-элемент: floor(r·10)=9 при любом r зоны) |
| все seed/позиции/gold/mobs/deposits (все сценарии) | — | бит-в-бит | бит-в-бит |

## 4. Решения (вопросы ТЗ «решить в анализе/памяти»)

* **D-1 (ТЗ п.1а, «укорочение пула изменило бы ре-симуляции»)** — ДА,
  частично: сдвинулись ТОЛЬКО метки chests[].item в 3 точках (таблица §3);
  re-пины — в ТОМ ЖЕ коммите. «Бит-в-бит» держится для
  seed/позиций/gold/mobs/deposits — закрепить assert'ами. — Почему: ТЗ
  прямо разрешает («CH4/CH5 — держатся или ре-пины по решению анализа
  п.1а»); сценарии CH5 строятся из ФАКТИЧЕСКОГО пула (не фикстуры) →
  ре-пины обязаны сопровождать данные.
* **D-2 (ТЗ п.1б, глубина)** — ПРИНЯТЬ текущую плоскую модель как
  принятую и ЗАДОКУМЕНТИРОВАТЬ в SPEC «Лут» (буллет: «глубина не участвует
  в редкости (принятая модель сундуков)»); отдельную задачу на учёт глубины
  НЕ создавать. — Почему: scope П2 = чистка данных + документация; ТЗ:
  «НЕ смешивать»; depth-зависимость лута подземелий уже есть в tier-поле
  T(depth) первичного пула и залежей; глубина в редкости — gameplay-дизайн
  будущего (если задача создастся — обновить тот же абзац SPEC и эту
  память).
* **D-3 (ТЗ п.1в, «куда деваются записи»)** — просто убрать из пула
  «предметы» (JSON); item-файлы/каталог/крафт/зачарования — без изменений.
  — Почему: ТЗ п.1в; предметы живы в других системах (catalog/craft/
  buildings/тесты).
* **D-4 (интерпретация «НОЛЬ изменений src/dungeon.js»)** — механика
  (chest-equip-блок, все rng, CHEST_EQ_SALT, CHEST_ITEM_CHANCE) —
  дословно; FALLBACK_DUNGEONS-литералы (L118/L156) — данные-таблица,
  ОБЯЗАНЫ следовать каталогу (пины W-07 «FALLBACK 1:1» + SRC-2); прецедент —
  re-пины FALLBACK в 000235.07–.10. — Почему: без правки литералов
  W-07/SRC-2 красные; «механика» в ограничении ТЗ = chest-equip-блок +
  rng, а не данные.
* **D-5 (000230.10-CH5 — РЕДИЗАЙН, единственный семантический сдвиг)** —
  in-place фикстура для ОБОИХ кейсов (паттерн D7/CH1: `pool[idx] =
  cs.armor`, restore в finally): CRYPT — `D.DUNGEON_ITEMS[1][0] =
  'chainmail'` (позиция alchemy_manual), RUINS — `D.DUNGEON_ITEMS[2][1] =
  'knight_plate'` (позиция war_hammer — фикстура ЗАМЕНЯЕТ war_hammer,
  T1-пул остаётся 10). Голдены: CRYPT — ВОССТАНОВЛЕН бит-в-бит с текущим
  (c0 = iron_tongs: фикстура возвращает исходный ролл — elig-idx0 →
  chainmail → замена r1=0.02278→common, r2=0.6040→floor(·110)=66 →
  iron_tongs; c1 = dark_presence_scroll без изменений); RUINS — c1 РЕ-ПИН
  blueprint_forge→blueprint_woodwork, c0/c2/c3/c4 БЕЗ ИЗМЕНЕНИЙ (c3 =
  wool_sutan: позиция триггера и eq-поток те же). Части (б) «БЕЗ slot»
  ЖИВУТ в обоих кейсах БЕЗ ПРАВОК КОДА (роллуетcя именно фикстурная
  броня; `delete it.slot` → броня остаётся в сундуке; restore finally).
  Standalone-ассерты (hash2/r1/r2/pickRarityTier/принадлежность
  EQUIP_POOLS, `it.slot === 'torso'`) — без изменений (item-файлы не
  тронуты). Имя теста: префикс «000230.10-CH5» ХРАНИМ (house-конвенция
  re-пинов), описание ОБНОВИТЬ (сценарий фикстурный: фантомы удалены из
  реального пула в 000251; реальный триггер RUINS — war_hammer/steel_sword
  (000230.12); устаревшая формулировка «ЕДИНСТВЕННЫЕ предметы этих пулов
  с явным slot» правится — она устарела ещё с 000230.12), комментарий
  истории «Ре-пин 000251». — Почему: минимальный diff (ровно 1
  re-pin-значения во всём CH5; CRYPT-голден — бит-в-бит с текущим),
  механизм «slot→замена / без slot→броня остаётся» остаётся покрытым в
  обоих кейсах; контракт реального пула (в CRYPT нет slot-предметов)
  вынесен в 000251-P1 (C-2). Альтернатива (CRYPT-кейс → отрицательный с
  real-golden alchemy_manual и B-веткой без CRYPT) отклонена: больший
  diff, асимметрия кейсов, потеря б.б. CRYPT-голдена. Верифицировано:
  dungeon.test.js 112/112.
* **D-6 (красные гарды P1/P2)** — P1: «предметы» CRYPT (000002.json) —
  НЕТ chainmail И НЕТ предмета с явным slot (скан пула × ITEMS); P2:
  «предметы» RUINS (000003.json) — НЕТ knight_plate (скан slot НЕ
  ставится — в RUINS легитимные slot-предметы steel_sword/war_hammer).
  Размещение: tests/dungeon.test.js рядом с S3 (~L800); ассерты §6.1. —
  Почему: house-конвенция «каждой задаче — свой пин» + раздел ТЗ «Тесты»
  (красные пин-данные); slot-скан — новый контракт C-2 (dormant CRYPT),
  если волна добавит slot-предмет в CRYPT — пин упадёт и напомнит о
  re-симуляции.
* **D-7 (S1, spec-wording)** — ПРИНЯТЬ: новый файл tests/spec-000251-
  wording.test.js, ОДИН test «000251-S1» с 5 assert.ok (W1-W5, §6.4) на
  секцию h2('Лут'). expectedRedCount = 3 (P1+P2+S1). — Почему:
  repo-конвенция spec-*-wording для каждого spec-артефакта (прецеденты
  000235/000258/000259/000266); ТЗ п.3 ОБЯЗЫВАЕТ абзац — пин делает
  требование проверяемым; один test с несколькими assert'ами — по счёту
  a3 (иначе red-счёт растёт без причины).
* **D-8 (e2e re-пины)** — 3 CRYPT-теста (000235.05 E1, 000235.09 W-09,
  000235.10 W-09): c0 item → 'prayer_scroll' (x=12, y=4, gold=29 — б.б.),
  заголовок + re-пин-комментарий; 000235.07 W-09 RUINS — без изменений. —
  Почему: единственные e2e-сдвиги по симуляции; e2e-бут грузит ту же
  dungeons-data.js (один mirror с node-симуляцией) — расхождений
  невозможно; верифицировано 10/10.
* **D-9 (S3 + DUN-REF-2 + W-07×3)** — механические re-пины списков/счётов:
  S3 −2 id; DUN_REF_PREV 57/32; W-07.07 RUINS 32 + «27 свитков из 32»;
  W-07.09/.10 CRYPT 57 + T1 14/57 (chainmail — T1); пин «50 свитков волн»
  (000235.10) НЕ трогать; названия тестов + комментарий «ре-пин 000251». —
  Почему: данные следуют каталогу; порядок id после удаления 2-го
  элемента (сдвиг индексов 2..N на −1).
* **D-10 (зеркало + FALLBACK)** — регенерация scripts/sync-dungeons-data.js
  (не руками) + FALLBACK-литералы — ТОТ ЖЕ коммит, что JSON. — Почему:
  зеркальный тест + W-08 drift-гейт (проверено: незакоммиченное зеркало в
  /tmp-копии → W-08 падает; committed → 112/112).
* **D-11 (CHANGELOG)** — ВНОСИТЬ: отдельный коммит ветки «Задача 000251:
  CHANGELOG — …», в блок `## 2026-10-24` → `### Игровой процесс` (текст
  §6.5). — Почему: протокол станции (игровой процесс для игрока изменился);
  формулировка ЧЕСТНАЯ про строительный сундук (там набор дропа реально
  меняется — §2), а не «набор не изменился».
* **D-12 (spec-split)** — re-pin `"dungeons-storage.md": 184 → 200`
  (N = 16 строк буллета §6.3; точное N — по факту текста, текст закреплён
  S1), в том же коммите со spec-правкой. — Почему: конвенция
  memory/000159-spec-split.md §5.1 (пересчёт в том же коммите).
* **D-13 (коммиты ветки)** — RED: «Задача 000251: красные тесты —
  фантомные брони вне пулов CRYPT/RUINS + абзац chest-equip в SPEC «Лут»
  (000251-P1/P2/S1)» + этот memory-файл. GREEN: «Задача 000251:
  фантомные legacy-брони из пулов CRYPT/RUINS (chainmail/knight_plate) +
  chest-equip-блок в SPEC «Лут»» (JSON −2 + зеркало + FALLBACK + все
  re-пины + spec-абзац + tasks/result/000251.md + pending→done).
  CHANGELOG — отдельный коммит. Последняя строка каждого сообщения:
  Co-Authored-By: Claude Code <noreply@anthropic.com>. Финальный мерж —
  squash в один коммит (merge-станция; memory one-commit-per-task-squash).
  — Почему: протокол станции + house-конвенции.
* **D-14 (НЕ ТРОГАТЬ)** — механика src/dungeon.js (chest-equip ~L903-924,
  CHEST_EQ_SALT L513, CHEST_ITEM_CHANCE L323), src/loot-equip-data.js,
  сейв v1 (сериализатор {id,x,y,opened,gold,item}), index.html (новых
  модулей/тегов/CSS НЕТ), пулы CAVE/DROWNED/ABYSS, assets/items/
  000009/000010.json, schema.json. — Почему: ТЗ «Ограничения» (ноль
  изменений механик/своев/UI/боя).

## 5. Контракты и границы (на будущее)

* **C-1**: предмет с явным slot в dungeon-пуле «предметы» → chest-equip
  АКТИВЕН для него: в сундуках подземелий он ВСЕГДА заменяется предметом
  EQUIP_POOLS роулнутой редкости. Пины: CH5 (фикстура) + 000230.12-CH (CAVE
  iron_sword, реальный пул).
* **C-2**: пул CRYPT — БЕЗ предметов с явным slot → chest-equip DORMANT
  (0 вызовов rng_eq на CRYPT-этажах). Пин: 000251-P1 (slot-скан). Если
  будущая волна добавит slot-предмет в CRYPT: обновить P1 + re-симулировать
  CH5/e2e/CHEST-гольдены (паттерн §8) + проверить, не сломал ли новый
  триггер golden (дополнительные вызовы rng_eq не сдвигают main-rng, но
  меняют метки item в CRYPT).
* **C-3**: пул RUINS — реальные slot-триггеры: steel_sword, war_hammer
  (slot right_hand, remap 000230.12); брони в реальном пуле нет (000251).
  chest-equip активен — пин CH5 RUINS (c3 wool_sutan, б.б.).
* **C-4**: плоская RARITY 50/30/15/4.9/0.1 снаряжения сундуков — ПРИНЯТАЯ
  МОДЕЛЬ: глубина НЕ участвует в редкости (SPEC «Лут», данные
  src/loot-equip-data.js). Depth-зависимость лута подземелий — через
  tier-потолок T(depth) первичного выбора пула и залежей. Будущая задача
  «учёт глубины в редкости» — обновляет тот же абзац SPEC + эту память.
* **C-5**: FALLBACK_DUNGEONS (src/dungeon.js) — данные-литералы 1:1 с
  каталогом assets/dungeons: ЛЮБАЯ правка пула → правка литералов в ТОМ
  ЖЕ коммите (пины W-07 «FALLBACK 1:1» + SRC-2).
* **C-6**: src/dungeons-data.js — зеркало, правится ТОЛЬКО
  scripts/sync-dungeons-data.js (byte-идемпотентно, атомарно); дрейф-гейт —
  W-08 (sync:check) в tests/sync-all.test.js.
* **C-7**: замена chest-equip IN-PLACE: новых ключей в объекте сундука НЕТ
  → сейв v1 {id,x,y,opened,gold,item} не тронут; openChest — только
  выдача, без RNG.
* **C-8**: SPEC «## Лут»: фразы буллета «Сундуки» закреплены
  spec-000235-wording (CHEST_ITEM_CHANCE = 0.4, T = min(4, 1 +
  floor((depth−1)/2)), chests[].item, «5 репинов tests/dungeon.test.js»,
  «бит-в-бит», SALT_SCROLL и др.) — не править; фразы нового буллета
  закреплены S1 (W1-W5, §6.4). H2-состав ["## Лут", "## Залежи"] и
  line-count (200) — spec-split.
* **C-9**: индекс-мэппинг `floor(r·len)`: ЛЮБОЕ изменение длины CRYPT/
  RUINS-пула (любая контентная волна) сдвигает метки item во ВСЕХ
  re-симуляциях с тем же seed — сверять re-симуляцией (паттерн §8), а не
  рассуждением; seed/позиции/gold/mobs/deposits при этом бит-в-бит
  (число вызовов main-rng не меняется), сдвигаются только значения
  chests[].item.
* **C-10**: здание-сундук (000077) читает тот же пул БЕЗ chest-equip —
  при любой правке CRYPT/RUINS-пула проверять ripple на
  building-effects (A62 — property; CHANGELOG-честность — §6.5).

## 6. Ключевые фрагменты (дословно)

### 6.1 Aссерты P1/P2 (tests/dungeon.test.js, рядом с S3)
* P1: `const rec = resolvedDungeonRecord(data, '000002.json')` (data из
  loadDungeonCatalog, file '000002.json'):
  `assert.ok(!rec.предметы.includes('chainmail'), …)`; затем скан:
  `for (const id of rec.предметы)` → `const it = ITEMS.find(x => x.id ===
  id)`; `assert.equal(it.slot, undefined, …)` (C-2: dormant CRYPT).
  Краснота до фикса: chainmail на индексе 1 (оба ассерта падают).
* P2: то же для '000003.json': `!rec.предметы.includes('knight_plate')`.
  Краснота до фикса: индекс 1.

### 6.2 CH5-фикстура (форма; текущая структура A/B-ветки сохраняется)
```
const pool = D.DUNGEON_ITEMS[cs.type];        // 1 = CRYPT, 2 = RUINS
const idx = cs.type === 1 ? 0 : 1;            // CRYPT: поз. alchemy_manual;
                                              // RUINS: поз. war_hammer
const saved = pool[idx];
pool[idx] = cs.armor;                         // 'chainmail' / 'knight_plate'
try {
  // A-ветка (как сейчас): createDungeon + generateDungeonContents,
  // golden deepEqual, standalone hash2/r1/r2/pickRarityTier-ассерты
  // B-ветка (как сейчас): delete it.slot → генерация → броня ОСТАЛАСЬ,
  // позиции/gold б.б.
} finally {
  pool[idx] = saved;
  it.slot = 'torso';
}
```
Gолдены: CRYPT — CH5_CRYPT_CHESTS БЕЗ ИЗМЕНЕНИЙ (c0 iron_tongs, c1
dark_presence_scroll); RUINS — CH5_RUINS_CHESTS: c1.item
'blueprint_forge' → 'blueprint_woodwork' (остальные — б.б.). Поле cases:
`armor` → переименовать в `trigger` (значения 'chainmail'/'knight_plate' —
фикстурные id), `replaced` без изменений. Комментарий истории — «Ре-пин
000251: фантомы удалены из реального пула (000251) — сценарий фикстурный
(in-place, паттерн D7/CH1); реальный триггер RUINS — war_hammer/steel_sword
(000230.12), CRYPT — dormant (000251-P1)».

### 6.3 SPEC-буллет (дословно, 16 строк; реализовать ТАК, чтобы S1
прошёл; переносы свободны, порядок слов — закреплён W1-W5)
```
* Снаряжение сундуков (000230.05; 000251 — задокументировано): роулнутый
  предмет с ЯВНЫМ `slot` (брони 000230.10, оружие 000230.12) ЗАМЕНЯЕТСЯ
  предметом роулнутой редкости из EQUIP_POOLS (данные
  src/loot-equip-data.js): СВОЙ rng-поток mulberry32(hash2(seed, depth,
  CHEST_EQ_SALT = 0x0E5C) >>> 0) — блок ПОСЛЕ залежей (000157.02), вызовы
  строго по порядку сундуков c0..cN, только триггернутые: 1 (tier) + 1
  (select, если тир-пул не пуст); редкость — ПЛОСКАЯ RARITY 50/30/15/
  4.9/0.1: глубина НЕ участвует в редкости (принятая модель сундуков —
  в отличие от tier-потолка T(depth) первичного выбора пула и залежей);
  замена IN-PLACE (НОВЫХ КЛЮЧЕЙ В ОБЪЕКТЕ СУНДУКА НЕТ — сейв v1 не
  тронут). Главный rng / seed / mobs / gold / deposits не трогается
  (000251: бит-в-бит, кроме значений chests[].item). 000251:
  фантомные legacy-брони — chainmail (CRYPT, dungeons/000002.json) и
  knight_plate (RUINS, dungeons/000003.json) — УБРАНЫ из пулов
  «предметы»: у них явный slot, и выпасть из сундуков они не могут
  (замена всегда действовала).
```
Вставка: ПОСЛЕ буллета «Сундуки» (L123-131), ПЕРЕД «## Залежи» (L133).
N = 16 → spec-split 184 → 200.

### 6.4 Pины S1 (tests/spec-000251-wording.test.js; h2('Лут') + norm())
* W1 (триггер): «Снаряжение сундуков (000230.05; 000251 —
  задокументировано): роулнутый предмет с ЯВНЫМ `slot`»
* W2 (поток/порядок): «СВОЙ rng-поток mulberry32(hash2(seed, depth,
  CHEST_EQ_SALT = 0x0E5C) >>> 0) — блок ПОСЛЕ залежей»
* W3 (плоская модель, D-2): «редкость — ПЛОСКАЯ RARITY 50/30/15/4.9/0.1:
  глубина НЕ участвует в редкости (принятая модель сундуков»
* W4 (сейв): «замена IN-PLACE (НОВЫХ КЛЮЧЕЙ В ОБЪЕКТЕ СУНДУКА НЕТ — сейв
  v1 не тронут)»
* W5 (чистка 000251): «chainmail (CRYPT, dungeons/000002.json) и
  knight_plate (RUINS, dungeons/000003.json) — УБРАНЫ из пулов
  «предметы»»
Каждый assert.ok — с ошибкой-подсказкой в стиле 000259-wording
(«отсутствует — абзац chest-equip ещё не добавлен (000251)»).

### 6.5 CHANGELOG (блок `## 2026-10-24` → `### Игровой процесс`)
```
- **Сундуки склепа и руин — чистка пулов.** Из пулов предметов сундуков
  склепа и руин убраны две legacy-брони (кольчуга, рыцарский доспех).
  В сундуках подземелий эти брони уже с обновления экипировки всегда
  заменялись предметом роулнутой редкости — набор дропа подземелий
  не изменился; в строительных сундуках на тайлах склепа/руин брони
  больше не выпадают, дроп перераспределён между остальными предметами.
```

## 7. Ленивые ссылки и guards

Новых модулей НЕТ → новых ленивых ссылок (rootRef) НЕТ. Существующие
guards, на которые опирается задача (НЕ ТРОГАТЬ):
* chest-equip: `eqOk` (lootEquipData жив: RARITY/EQUIP_POOLS/
  pickRarityTier) + `eqTotal > 0` (агрегат пулов по тирам) — guard ДО
  ЛЮБОГО вызова rng_eq: eqTotal = 0 → 0 вызовов (dormant, деградация
  без падения). После 000251 CRYPT-scenarios — «dormant по пулу» (нет
  триггерных сундуков), НЕ «dormant по eqTotal» (EQUIP_POOLS живы —
  RUINS/CAVE-триггеры работают).
* building-effects chestLoot: `!Array.isArray(table) ||
  table.length === 0` → null (мусорная/пустая таблица — деградация).
* FALLBACK-ветка file:// (src/dungeon.js) — data-таблица; её guards —
  те же, что и у catalog-ветки (механика общая, одна функция).

## 8. Что важно будущим задачам (из ТЗ-ссылок)

* Родительский контракт: tasks/result/000230.10-retro-20261022b.md
  (finding #2 major — источник задачи); memory/000230.10-torso-items-
  wave.md (D-12 — remap брони, причина фантомности); memory/000230.05-
  loot-rarity.md (chest-equip: соль 0x0E5C, плоская RARITY, IN-PLACE,
  guard eqTotal); memory/000159-spec-split.md §5.1 (re-pin line-count в
  том же коммите); memory/000235.05-scroll-tier-loot.md (паттерн «сдвиг goldens»
  — число вызовов main-rng не меняется, сдвигаются только метки
  chests[].item).
* Любая будущая правка CRYPT/RUINS-пулов или EQUIP_POOLS: (1) re-симуляция
  паттерном /tmp/thegame-wf-000251/sim-*.js — mutate D.DUNGEON_ITEMS /
  L.EQUIP_POOLS in-memory до вызова generateDungeonContents (без правок
  файлов), сверить BEFORE с текущими голденами 1:1, потом AFTER; (2)
  re-пины CH5 (если тронуты позиции CRYPT-idx0 / RUINS-idx1 /
  T1-состав) + e2e c0-пины (dseed 820179115) + W-07×3/S3/DUN-REF-2 +
  spec-split (если spec тронут); (3) зеркало sync:dungeons + FALLBACK 1:1
  в том же коммите; (4) ripple building-effects chestLoot (C-10).
* Если создастся задача «учёт глубины в редкости сундук-экипа»:
  обновить абзац SPEC «Лут» (W3/S1-пин!), re-симулировать CH5
  (r1/pickRarityTier изменятся) и эту память (C-4).
* Конфликты мержа: на мерже master может сдвинуться EQUIP_POOLS (новая
  волна экипа) → wool_sutan/rare-пин CH5 RUINS и r2-вычисления
  пересчитать (паттерн истории ре-пинов в комментарии CH5); контентные
  волны CRYPT/RUINS → таблица §3.

## 9. Подводные камни

1. **Забытый re-pin spec-split (184 → 200)** — классический пропуск;
   чек-лист GREEN-коммита (C-8/D-12).
2. **Забытая регенерация src/dungeons-data.js** или **забытые
   FALLBACK-литералы** (L118/L156) — красные зеркало-тест, W-08 drift-
   гейт, W-07 FALLBACK 1:1, SRC-2. Оба — ТОТ ЖЕ коммит, что JSON.
3. **CH5-фикстура без restore в finally** — мутирует D.DUNGEON_ITEMS-
   синглтон для последующих тестов файла (паттерн D7/CH1 — restore
   ОБЯЗАТЕЛЕН; RUINS-фикстура заменяет war_hammer — живой предмет).
4. **e2e-флейки** (vm-бут, тайминги микротасков): при случайном падении —
   перепуск `node --test tests/dungeon-loot-e2e.test.js` + запись в
   отчёт (протокол станции). Флейк перформанс tileAt (map.test.js,
   паралл. загрузка двух полных сьютов) — не связан с задачей
   (одиночный прогон 74/74).
5. **W-08 sync:check в /tmp-копиях** — падает на git-дрейфе
   незакоммиченного зеркала; в committed-состоянии зелёный (112/112).
   Верифицировать только в committed worktree.
6. **Мерж**: rebase на master + re-симуляция на мерж-каталоге (если master
   тронет CRYPT/RUINS/EQUIP_POOLS) + sync:dungeons + `node --test tests/`
   в worktree (один worktree = один полный прогон; main-repo npm test
   сканирует .worktrees/* — верификация master = `node --test tests/`).
7. **Детерминизм НЕ тронут**: главный rng, rng_dep, rng_eq,
   CHEST_EQ_SALT — формулы и порядок вызовов без изменений; изменения —
   ТОЛЬКО метки пулов (данные). Сейв v1 — без изменений (сериализатор не
   читает пулы).

## 10. План реализации (по файлам)

RED-коммит (новый тесты + память; данные НЕ трогаются; падают ТОЛЬКО
новые — 3):
1. tests/dungeon.test.js: +000251-P1, +000251-P2 (рядом с S3, ~L800) —
   ~+45 строк.
2. tests/spec-000251-wording.test.js — новый файл ~+85 строк (S1, W1-W5).
3. memory/000251-chest-phantoms.md — этот файл.

GREEN-коммит (данные + все ре-пины + spec + отчёт):
4. assets/dungeons/000002.json: −1 строка (−"assets/items/000009.json").
5. assets/dungeons/000003.json: −1 строка (−"assets/items/000010.json").
6. src/dungeons-data.js: регенерация (2 массива: ±2 строки).
7. src/dungeon.js: FALLBACK −'chainmail' (L118) / −'knight_plate'
   (L156) (±2 строки, данные только).
8. spec/dungeons-storage.md: +16 строк (буллет §6.3).
9. tests/dungeon.test.js: S3 (±2) + DUN_REF_PREV (±2) + W-07×3 (±15) +
   CH5-редайзайн (±25: фикстура, c1-ре-пин, имя/комментарий) — всего
   ~+35/−15.
10. tests/dungeon-loot-e2e.test.js: 3× c0 'faith_shield_scroll' →
    'prayer_scroll' + 3 комментария (±6).
11. tests/spec-split.test.js: 184 → 200 (±1).
12. tasks/result/000251.md: новый отчёт ~+40.
13. tasks/pending/000251.md → tasks/done/000251.md (git mv).

CHANGELOG-коммит:
14. CHANGELOG.md: +6 строк (буллет §6.5 в блок 2026-10-24).

Итого ~15 файлов. Верификация GREEN: `node --test tests/` в worktree —
весь набор зелёный (3241 + 3 новых; green-sim уже подтвердил 3241/3241 по
этой же схеме).

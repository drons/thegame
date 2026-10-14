# 000211 — Верификация находок аудита (контракт станции ВЕРИФИКАЦИЯ)

Дата: 2026-10-14. Задача 000211 — umbrella «JSON-справочники». Станция:
ВЕРИФИКАЦИЯ НАХОДОК (аналог RED: каждое утверждение проверено кодом).
Базовая линия: worktree task/000211, HEAD 9e1fd7a; master 7f61aee.
Игровой код не тронут (src/, tests/, assets/, index.html, SPEC.md, CHANGELOG.md —
ноль изменений; изменения — только tasks/pending/ (8 новых файлов задач) и memory/).

Метод: read-only grep/sed/node -e по worktree; независимый ре-аудит всех
межкаталожных ссылок (10 каталогов) и scan якорного паттерна по 11 каталогам;
dry-run validateData(assets/mobs/schema.json) по 36 mob-файлам; проверка занятости
(git worktree list, tasks/pending, tasks/done, git log). Факты ниже — с
доказательствами; не подтверждённое не использовалось.

## 1. Вердикт по набору: ПРИНЯТО 8 из 8, ОТКЛОНЕНО 0

Каждая задача 000216-000223 проверена: (а) утверждения реальны (file:line),
(б) НЕ сделано уже (git log, tasks/done, grep полей-признаков), (в) не дублирует
другую задачу набора и существующие 000207/000208/000209.

| № | Каталог | Вердикт | Ключевые доказательства (сверено 2026-10-14) |
|---|---------|---------|----------------------------------------------|
| 000216 | формат + общий тест + mobs в CATALOGS | ПРИНЯТО | CATALOGS = 7 каталогов (tests/assets-schemas.test.js:32); mobs-схема мёртвая (exists: assets/mobs/schema.json, 000022; в CATALOGS нет); dry-run 36/36 — 0 ошибок; битых межкаталожных ссылок 0; строк под якорным паттерном 0 (общий тест зелёный с первого коммита); scripts/lib/json-ref.js и tests/assets-refs.test.js отсутствуют; прецедент пути — assets/visuals/000001.json:7 |
| 000217 | skills | ПРИНЯТО | 37 файлов = 6 primary + 31 secondary; primary у 31/31, requires (skill+level) у 14 (всего 45 ссылок); зеркало src/skills-data.js (id-форма, sync-skills-data.js); дерево закреплено tests/skills.test.js:117-121,155; пример id-ссылки: assets/skills/000009.json («fists», "primary": "strength") |
| 000218 | mobs | ПРИНЯТО | 36 файлов; поля skills[]/spells[]/loot[].item есть (тест ссылок tests/combat.test.js:275); битых 0; MOB_TYPES — ручное зеркало src/combat.js:141; mirror-тест tests/combat.test.js:251; sync-mobs отсутствует (ls scripts/sync-*) |
| 000219 | spells | ПРИНЯТО | 17 файлов; icon — svg-путь 17/17; базы: 12 null + 5 id (все резолвятся); здания[] у 17; range-ассерт 1..50 — tests/spells.test.js:211 (и tests/craft.test.js:189); каталог зданий — 54 (51-54 города); sync-spells-data.js + src/spells-data.js существуют |
| 000220 | dungeons | ПРИНЯТО (с исправлением F1) | 5 файлов; постройка = 31..35 (биекция tests/dungeon.test.js:363); «предметы_стен» = wall-типы rock/stalactite/column (5 json, schema.json, src/dungeon.js:89,110,128,147,167 + :200 + DUNGEON_WALL_KINDS :230/:241); deepEqual-зеркало :347; id ≠ номер файла: assets/dungeons/000001.json — id 0 |
| 000221 | items (28 лута → svg) | ПРИНЯТО | 76 предметов, 28 с `loot`, 28/28 svg в assets/sprites/loot/; поля `icon` в items НЕТ (grep — 0); lootSprite — src/sprites.js:802 (док :783-801), live-root lootItemsRef :776-781, factory :26-50 (000158.05); поборт src/main.js:3136 |
| 000222 | buildings (18 спрайтов + «тренирует») | ПРИНЯТО (с исправлением F5) | 54 здания; 18 школ id 7-24; «тренирует» — имена: 34 вхождения (30 уникальных), все резолвятся в id навыков (0 нерезолвящихся); поля «спрайт»/«icon» в buildings НЕТ (grep — 0); литералы src/sprites.js :287-300/:311-316/:324-326; 13+4+1 svg на месте; cross-check tests/npc-data.test.js:271 (сравнение по именам через SECONDARY_SKILLS); map_index — см. F5; 21 здание с «стройка.исходники» — это 000207, не дублируем (tests/buildings.test.js:1014) |
| 000223 | mob_groups | ПРИНЯТО | 7 файлов; состав.мобы 7/7 резолвятся; «спрайт» = 6 видов (orc×2, skeleton, wolf, spider, elemental, abyss); поля «кадры»/«icon» НЕТ (grep — 0); MOB_FRAMES :210-217, mobFrames :621-624, MOB_KINDS :198-209 (fallback :185), MOB_SPRITE_KINDS :229 (не трогаем); 12 group-svg на месте; sync-mob-groups-data.js существует |

Не дублирование: 000207 (buildings исходники→items), 000208 (craft→
items/skills/buildings), 000209 (npc→items/buildings) — области не пересекаются с
набором, кроме ЯВНЫХ зависимостей: 000222 → после 000207 (общие buildings
json/schema/sync) и после 000223 (общие src/sprites.js + tests/sprites.test.js);
000223 → после 000221 (тот же общий файл); 000219 → после 000208 (ОБЩИЙ
tests/craft.test.js:177-191: 000208 мигрирует craft-предметы/навыки/здания
на ссылки и переписывает тот же блок «ссылки»-теста, 000219 правит там же
range-ассерт :188-189). Волна A: 000216, 000217, 000218, 000219 (ПОСЛЕ 000208
либо rebase с адаптацией), 000220 (+207/208/209); волна B:
000221 → 000223 → 000222.

Занятость: 000214/000215 — worktrees заняты (.worktrees/task-000214, task-000215,
задачи в master-7f61aee); 000216-000223 — ни веток, ни worktrees, ни pending, ни
done — номера свободны. 000216-000223 НЕ сделаны: признак-полей нет (icon в items —
0, «спрайт» в buildings — 0, «кадры» в mob_groups — 0, assets-refs.test.js и
json-ref.js отсутствуют, mobs не в CATALOGS).

## 2. ОТКЛОНЁННЫЕ/ИСПРАВЛЕННЫЕ утверждения контракта (5)

F1. 000220: «∈-проверки мобы→mobs НЕТ, провисший id моба не ловится ни одним
тестом» — ЛОЖНО. Проверка существует с 000022 (commit ca5533f):
tests/dungeon.test.js:146-153 «DUNGEON_MOBS: все id мобов описаны в каталоге»
(каждый id ∈ C.MOB_TYPES) + tests/combat.test.js:251 (MOB_TYPES ≡ assets/mobs —
двунаправленный mirror). Провисший id ловится транзитивно. Задача 000220 остаётся
в наборе (ссылки + переименование валидны по ТЗ 000211), обоснование исправлено в
tasks/pending/000220.md: после миграции проверка резолвит ссылки → id перед
сравнением.

F2. Skills: «26 secondary» — ЛОЖНО. Факт (2026-10-14): 37 = 6 primary + 31
secondary; `primary` у 31/31, `requires` (skill + level) у 14 → 45 ссылок.
Исправлено в tasks/pending/000217.md.

F3. «тренирует»: «ВСЕ 31 имя» — счёт неточен. Факт: 34 вхождения (30 уникальных
имён), все резолвятся в id каталога навыков (0 нерезолвящихся; таблица name→id —
§3 контракта). Исправлено в tasks/pending/000222.md.

F4. НОМЕРА СТРОК (контракт → факт):
* tests/combat.test.js:252 → :251 (декларация mirror-теста).
* src/sprites.js CITY_SPRITES :325-331 → :311-316.
* src/sprites.js CAMP_SPRITES :334-336 → :324-326.
* src/sprites.js lootSprite() :791 → :802 (док-блок :783-801; lootItemsRef :776-781).
* scripts/sync-portraits.js CANON_FILES :26-33 → :35-40 (KIND_BY_FILE :40).
* spec/ci-github-pages.md:33-36 → утверждение «mobs/craft — данные живут в коде»
  на :35 (абзац :33-38).
* src/sprites.js MOB_KINDS :194-209 → :198-209 (MOB_GROUPS_DATA :194).
* src/dungeon.js DUNGEON_WALL_KINDS «:200,241» → const :230, присвоение :241
  (:200 — проверка fallback-записи).
СОВПАЛО (без правки): CATALOGS :32; craft :95/:125; spells :211; combat.js:141;
combat.test.js:275; buildings :287-300; MOB_FRAMES :210-217; mobFrames :621-624;
map.js:286; npc-data.test.js:271; buildings.test.js:1014; index.html :997/:1009/
:1026/:1040/:1191/:1208; sync-items-data.js:20-23 (фраза «id предметов НЕ
перенумеруются» на :20); memory/000015:24-25; tests/dungeon.test.js:347/:363;
tests/index-order.test.js (104662 байт).

F5. 000222: «slot i ↔ buildingId i+1 (остальное 1..13 закрепит задача)» —
УПРОЩЕНИЕ НЕВЕРНОЕ для части id. Факт (из данных, 2026-10-14): map_index есть
ровно у 13 записей — представители ВСЕХ 13 slot-типов: 1→0, 2→1, 3→2, 4→3,
7→4 (ARENA), 8→5 (BLACKSMITH), 10→6 (ARCHERY_RANGE), 11→7 (ACADEMY), 31→9
(CAVE_ENTRANCE, Простая пещера), 36→8 (TEMPLE, Храм солнца), 40→10
(RUNE_STONE, Рунический камень), 25→12 (NPC_HOUSE, Дом кузнеца),
44 (TAVERN)→11; записи 5, 6, 9, 12, 13 map_index НЕ имеют (не размещаются в
сетке города — см. cities.js:454-481). Слот — типу (BUILDING_TYPES,
src/map.js:286-301), не id-1. Связь slot→id выводится из данных
(map_index + типы), закреплена в tasks/pending/000222.md (a) и §3/§4
контракта.

## 3. Независимый ре-аудит (свой скрипт, 2026-10-14)

* Межкаталожные ссылки 10 каталогов (mobs: skills/spells/loot; mob_groups: мобы;
  dungeons: мобы/предметы/постройка/руда; craft: результат/исходники/навыки/
  здания/заклинания/база; spells: база/предметы/здания; npc: постройки/торговля/
  обучение): БИТЫХ 0.
* Строки под якорным паттерном `^assets/<каталог>/<file>.json$` (включая portraits
  и visuals) во всех 11 каталогах: 0 → общий тест 000216 зелёный с первого коммита.
* Dry-run mob-схемы: 36/36 валидны (validateData, tests/json-schema.js).
* Loot-svg: 28/28 (assets/sprites/loot/); group-svg 12/12; building/city/camp svg
  13+4+1 на месте; portraits 8 именованных json без schema.json.
* Счета каталогов: items 76, skills 37, spells 17, mobs 36, mob_groups 7,
  buildings 54, craft 31, dungeons 5, npc 18, visuals 13, portraits 8.
* logo.json — 490605 байт, не referenced (grep src/tests/scripts/index.html/
  package.json — 0); первый коммит 529234d. spec/ci-github-pages.md:35 — устарело
  (src/craft-data.js существует, MOB_TYPES существует; mob_groups/dungeons не в
  списке зеркал). memory/000015-json-schema-validator.md:24-25 — старые счёты
  32/10/50 (факт 76/18/54; skills 37 — совпадает).

## 4. npm test

Базовая линия (контракт, 14.10.2026, тот же HEAD): 2454/2454 pass, 0 fail.
Прогон станции (один полный, после создания файлов; код не тронут —
git status чистый, кроме 10 новых файлов): **2454/2454 pass, 0 fail**
(134 с) — ЦИФРЫ БЕЗ ИЗМЕНЕНИЙ. Флейков не было, перепусков не потребовалось;
после прогона git status --porcelain — только новые файлы (drift-маркер 000054
восстановлен, src/npc-data.js нетронут).

## 5. Материалы станции

* Созданы tasks/pending/000216.md ... 000223.md (8 новых файлов — «набор задач
  (ПРИНЯТЫ) — создать в tasks/pending», §4 контракта; содержание — по верифицированным
  фактам, с поправками F1-F5).
* Контракт ПРОЕКТИРОВАНИЯ: memory/000211-spec-coverage-audit.md (входная, был
  неоткоммичен — закоммичен этой станцией).

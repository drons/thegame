# 000211 — Аудит покрытия SPEC и JSON-домена (контракт консолидации)

Дата: 2026-10-14. Задача 000211 — umbrella «JSON-справочники: ссылки на дочерние
json + svg, запекание js, тесты целостности». Станция: ПРОЕКТИРОВАНИЕ
(консолидация аудита в набор задач). Тип: исследование/аудит — игровой код
не тронут (src/, tests/, assets/, index.html, SPEC.md, CHANGELOG.md — ноль
изменений).

Вход: /tmp/thegame-wf-000211/a1-domain.md (история/швы), a3-tests.md
(тесты/код/опыт), SPEC (spec/*.md, 22 файла), код. Файл a2-arch.md на входе
ОТСУТСТВУЕТ — раздел «ПОКРЫТИЕ SPEC» взят из саммари в постановке; решение по
формату ссылки (формально за a2-arch) ПРинято на этой станции по ограничениям
a3 §3 и зафиксировано в §2 ниже.

Базовая линия: npm test в worktree — 2454/2454 pass, 0 fail, 235 с
(14.10.2026, /tmp/thegame-wf-000211/baseline-full.log); worktree чистый
(ветка task/000211, база 9e1fd7a); master на момент аудита — 7f61aee
(+000214, +000215 — уже в работе, worktrees заняты; номера детей —
шаблон 000211.YY; первоначально ошибочно сквозные с 000216).

Статус (ФИНАЛИЗАЦИЯ, 2026-10-14 — финальная версия контракта):
задача 000211 завершена, ТЗ перенесён tasks/pending → tasks/done;
набор финализирован — 8/8 принято (000211.01-000211.08 в tasks/pending),
правки F1-F5 применены (memory/000211-findings-verified.md §2);
master на момент финализации — 589e2c4 (000214 и 000215
смержены; 000215 — уже во время финализации): rebase чистый
(файловых пересечений 0), ожидаемые цифры после rebase —
2476/2476 (2454 + 11 тестов tests/dungeon-city-time-e2e.test.js
+ 11 тестов tests/tile-seam.test.js). Отчёт — tasks/result/
000211.md.

## 1. Методология

1. Три агента-аналитика (a1 — история/швы/кандидаты 000001 §4; a2 — покрытие
   SPEC; a3 — карта тестов/кода/опыт). Каждое утверждение — с доказательством:
   file:line, номер задачи, memory-файл, секция SPEC.
2. Станция ПРОЕКТИРОВАНИЯ повторно прогнала ключевые факты по коду
   (read-only): см. §3 «перепроверено».
3. Набор задач выбран по критериям: самодостаточность (красный тест
   определяется внутри задачи), минимальное пересечение файлов (параллельные
   workflow; пересечение — только заявлённые зависимости), охват ТЗ 000211
   (все 11 каталогов + все svg-разрывы + запекание + общий тест).
4. Формат ссылки зафиксирован ЗАРАНЕЕ (§2) — все подзадачи стартуют по одному
   контракту, параллельность не блокируется ожиданием 000211.01.

## 2. Формат ссылки (контракт, ЗАФИКСИРОВАН для всех подзадач)

* Ссылка — строка: путь к целевому JSON-файлу ОТНОСИТЕЛЬНО корня репозитория:
  `"assets/<каталог>/<файл>.json"` (каталоги с именованными файлами —
  portraits: `"assets/portraits/npc-000012.json"`).
* `id` целевого файла === прежнее ссылочное значение (items/craft/npc —
  строковый id; buildings/dungeons/mob_groups — числовой; skills/spells/mobs —
  строковый).
* Якорный паттерн (общий тест): `^assets/(items|skills|spells|mobs|mob_groups|buildings|craft|dungeons|npc)/\d{6}\.json$`
  + portraits: `^assets/portraits/(efir|flogiston|npc-\d{6})\.json$`.
* Почему путь к файлу, а не id: (а) dungeons — id 0 в файле 000001 (id ≠
  номер файла, проверено: assets/dungeons/000001.json); (б) portraits —
  именованные файлы; (в) формат единый для всех 11 каталогов; (г) прецедент
  в проекте: assets/visuals уже хранит прямой путь (спрайт:
  "assets/sprites/visuals/grass_blades_light.svg", 13/13); (д) file:// —
  fetch невозможен (memory/000053), резолюция только в sync (время сборки).
* Запекание: sync-*.js резолвит ссылки; JS-зеркала ОСТАЮТСЯ в id-форме
  (контракт потребителей Game.ITEMS / MOB_TYPES / SPELLS / getBuilding… +
  дрейф-гейт sync-all.js --check). Сейв v1 ссылается на id предметов
  (memory/000031; sync-items-data.js:21-23 «id предметов НЕ перенумеруются»)
  — нарушать нечем: id в зеркалах и в играх не меняется.
* Схемы: после миграции поле-ссылка закрепляется `pattern` (якорный
  паттерн); additionalProperties:false — новое поле = расширение schema.json
  в ТОМ ЖЕ коммите (000141).

## 3. Факты, перепроверенные станцией (доказательства)

* Общий schema-цикл — 7 каталогов: tests/assets-schemas.test.js:32
  CATALOGS = items, npc, skills, buildings, dungeons, mob_groups, visuals.
  craft/spells — свои секции (craft.test.js:95,125; spells.test.js). mobs —
  схема СУЩЕСТВУЕТ (assets/mobs/schema.json, 000022), но тестом НЕ
  используется; при этом dry-run `validateData(schema, mob)` по всем 36
  файлам — 0 ошибок (проверено станцией): добавление 'mobs' в CATALOGS —
  низкий риск (gap именно в отсутствии теста, не в дрейфе схемы).
* Диапазон 1..50: tests/craft.test.js:188-189 `b >= 1 && b <= 50`
  (блок «ссылки: ...» :177-191) и tests/spells.test.js:211 —
  каталог зданий 54 (51-54 — города).
* MOB_TYPES — ручное зеркало в src/combat.js:141; mirror-тест
  tests/combat.test.js:251 (deepEqual JSON-моб (без полей
  «описание»/«art» — ART_ONLY, :257) с записью MOB_TYPES, «в
  combat.js есть мобы без JSON-файла» → 0). sync-mobs ОТСУТСТВУЕТ
  (ls scripts/sync-*).
* mobs: ссылки skills[]/spells[]/loot[].item уже есть (tests/combat.test.js:
  275+); битых ссылок в каталогах 0 (аудит /tmp/thegame-wf-000211/
  audit-refs2.js, 10 каталогов).
* mobs: art — явные пути в json (36/36, move/attack 2 кадра +
  dead 1, напр. assets/mobs/000001.json), но в рантайме НЕ
  читается: зеркало MOB_TYPES исключает «описание»/«art»
  (ART_ONLY, tests/combat.test.js:257), кадры строит конвенцией
  mobArtFrames() (src/sprites.js:275-284; MOB_ART_DIR :261 + id +
  '_' + action + '_' + i) — двойной источник правды, удерживаемый
  тестом tests/sprites.test.js:1313. Кандидат — §5.6 (волна 2).
* buildings: `тренирует` (18 школ, id 7-24) — ИМЕНА навыков на русском, НЕ id
  (000009: «каменные кулаки» = id `fists` — assets/skills/000009.json).
  34 вхождения (30 уникальных имён) — ВСЕ резолвятся в id каталога навыков
  (проверено станцией по всем
  18 школам — таблица name→id: мечник→swordsman, тяжёлое оружие→heavy,
  кузнечная рука→forge, крепкая спина→back, каменные кулаки→fists,
  меткость→accuracy, стрелок→archer, акробатика→acro, ловкий шаг→step,
  тать→thief, кошачий глаз→catseye, железная кожа→hide, выносливость→
  endurance, голем→golem, несокрушимость→unkill, глубокий вдох→breath,
  учёный→scholar, рунопись→runes, алхимик→alchemy, повелитель огня→firelord,
  повелитель льда→icelord, медитация→meditation, зоркость→perception,
  старейшина→elder, ясновидение→precog, сердце природы→nature, оратор→orator,
  артист→artist, предводитель→leader, торговец→merchant). Runtime-потребителей
  building.тренирует НЕТ (grep src: только данные в buildings.js) —
  потребует лишь перестроить cross-check tests/npc-data.test.js:271
  («школы: тренирует = обучение.навыки NPC» — сейчас сравнение по ИМЕНАМ;
  npc.обучение.навыки — id, резолвятся через SECONDARY_SKILLS).
* buildings: `стройка.исходники` — 21 здание (1,2,3,4,7,8,10,11,25,36,37,38,
  39,40,42,43,44,45,46,48,49); покрыто тестом только здание 44
  (tests/buildings.test.js:1014). `навык` уже id-строки (40: runes, 44:
  artist, 49: dexterity). `типичный_npc` — имя РОЛИ (не ссылка; не принято —
  см. §6).
* craft (31): результат.предмет/исходники[].предмет (item id), навыки[]
  (skill id), здания[] (число), заклинания[] (spell id: 000002 steel_sword +
  зачарования 000007/000008/000029/000030), база (id рецепта).
* spells (17): база (id|null), предметы[] (item id), здания[] (число),
  icon — уже путь svg (17/17).
* dungeons (5): мобы[] (mob id — ∈-проверка ЕСТЬ с 000022:
  tests/dungeon.test.js:146-153 «DUNGEON_MOBS: все id мобов описаны
  в каталоге» + mirror tests/combat.test.js:251 — после миграции
  000211.05 проверка резолвит ссылки → id перед сравнением;
  deepEqual-зеркало таблиц — tests/dungeon.test.js:347),
  предметы[] (item id), постройка (число 31..35, биекция
  tests/dungeon.test.js:363), руда[].предмет (item id), `предметы_стен` —
  НЕ предметы: типы объектов стен rock/stalactite/column
  (src/dungeon.js:230 const DUNGEON_WALL_KINDS, :241 присвоение;
  fallback-литералы src/dungeon.js:89-167).
* npc (18): постройки[] (число), торговля.предметы[].предмет (item id),
  обучение.навыки[] (skill id), квесты.*. Связь npc↔portraits (000012..17)
  — ТОЛЬКО по имени файла: sync-portraits.js:35-40 CANON_FILES (8 имён) +
  KIND_BY_FILE (:40); portraits БЕЗ schema.json.
* mob_groups (7): состав.мобы[] (mob id), `спрайт` — КЛЮЧ таблицы
  MOB_FRAMES (src/sprites.js:210-217: 6 видов × 2 кадра, пути по конвенции
  assets/sprites/mobs/<kind>_<1|2>.svg); MOB_KINDS строится из данных
  (sprites.js:198-209, MOB_GROUPS_DATA :194, fallback FALLBACK_MOB_KINDS
  :185); боевой пер-моб-спрайт —
  ОТДЕЛЬНОЕ маппинг MOB_SPRITE_KINDS (36 id → 6 видов) в sprites.js —
  не трогаем (не входит в набор).
* items (76): 28 предметов с полем `loot`, у всех 28 svg на месте
  (assets/sprites/loot/, проверено станцией); конвенция lootSprite()
  'assets/sprites/loot/' + id + '.svg' — src/sprites.js:802
  (документация :783-801; lootItemsRef :776-781). sprites.js уже лениво
  читает Game.ITEMS (lootItemsRef,
  000158.05, live-root-паттерн: factory(..., root, itemsData) —
  sprites.js:26-50).
* buildings svg: BUILDING_SPRITES (13 slot-типов → assets/sprites/
  buildings/<type>.svg, sprites.js:287-300), CITY_SPRITES (51-54 →
  cities/city_51..54.svg, :311-316), CAMP_SPRITES (47 → buildings/camp.svg,
  :324-326). Ключ — int-индекс слота (BUILDING_TYPES, map.js:286-301:
  NONE -1, 0..12), НЕ id каталога; slot→id — ИЗ ДАННЫХ: map_index есть
  ровно у 13 записей (представители ВСЕХ 13 slot-типов): 1→0, 2→1, 3→2,
  4→3, 7→4, 8→5, 10→6, 11→7, 31→9 (CAVE_ENTRANCE), 36→8 (TEMPLE), 40→10
  (RUNE_STONE), 25→12 (NPC_HOUSE), 44→11 (TAVERN); у 5/6/9/12/13 его нет
  (закреплено в tasks/pending/000211.07.md).
  Порядок загрузки index.html: items-data :997 → map.js :1009 → buildings.js
  :1026 → combat.js :1040 → sprites.js :1191 → main.js :1208: buildings.js
  И items-data.js доступны sprites.js до инициализации; live-root-паттерн
  (Game.* в момент вызова) — прецедент для ленивого чтения данных.
* skills (37): primary (skill id), requires.skill (skill id + level) —
  6 primary + 31 secondary (primary у 31/31, requires у 14 → 45
  ссылок); дерево закреплено tests/skills.test.js.
* visuals (13): спрайт — уже путь svg (единственный каталог с прямыми
  ссылками) — прецедент формата.
* logo.json (490 КБ, дамп LLM-диалога) в корне — не referenced нигде (grep
  src/tests/scripts/index.html/package.json — 0), первый коммит 529234d.
* spec/ci-github-pages.md:33-36 — УСТАРЕЛО: «mobs/craft — данные живут в
  коде, зеркал не имеют» (craft-data.js существует; mobs-зеркало — MOB_TYPES
  в combat.js), список зеркал не включает mob_groups и dungeons.
* memory/000015-json-schema-validator.md:24-25 — СТАРЫЕ СЧЁТЫ: «items 32,
  npc 10, skills 37, buildings 50»; факт: 76/18/37/54.
* Ключевые ограничения для запекания (a3 §3, подтверждено): data-модули
  без require внутри (vm-песочницы) → резолюция ссылок в sync, НЕ в рантайме;
  дрейф-гейт sync-all.js --check подхватывает sync-*.js по конвенции
  (workflow править не надо); порядок <script> закреплён tests/
  index-order.test.js (104 КБ) — НОВЫЕ скрипты/теги = правка пина (риск).

## 4. Набор задач (ПРИНЯТЫ) — создать в tasks/pending

Существующие дочерние umbrella (уже в pending, НЕ дублировать):
000207 (buildings: стройка.исходники → ссылки на items), 000208 (craft:
предметы/навыки/здания → ссылки), 000209 (npc: предметы/здания → ссылки).
Каждая новая задача ссылается на родителя 000211 и на формат §2.

### 000211.01 — P1 — «JSON-справочники: формат ссылки + общий тест целостности + mobs в CATALOGS»
Основа umbrella: зафиксировать формат ссылки (§2) в
memory/000211.01-json-ref-format.md; создать общий резолвер
scripts/lib/json-ref.js (проверка «я ссылка», резолюция: файл существует,
парсится, есть id) и ОБЩИЙ тест tests/assets-refs.test.js: по ВСЕМ 11
каталогу каждая строка, подходящая под якорный паттерн ссылки, резолвится
(сейчас таких строк нет — тест зелёный и служит гейтом для всех
последующих миграций; отрицательный контроль — резолвер на битых/чужих
путиях). Добавить 'mobs' в CATALOGS tests/assets-schemas.test.js:32
(схема мобов сейчас мёртвая; dry-run: 36/36 проходят — если выявится дрейф,
исправить схему в том же коммите). Файлы: scripts/lib/json-ref.js (new),
tests/assets-refs.test.js (new), tests/assets-schemas.test.js,
assets/mobs/schema.json (если нужно), memory/000211.01-json-ref-format.md.
Зависимости: нет. Приоритет P1: прямое требование ТЗ («в тестах проверять
целостность ссылок и соответствие json схемам всех json файлов») +
разблокирует остальные (хотя формат уже зафиксирован §2 — код можно мерджить
в любом порядке).

### 000211.02 — P1 — «skills: primary/requires → ссылки на json навыков»
37 файлов: primary и requires.skill — ссылки на файлы assets/skills/
(таблица id→файл 1:1); sync-skills-data.js резолвит при сборке (зеркало
src/skills-data.js остаётся в id-форме — deepEqual-пин не тронут); схема:
pattern-закрепление; тесты: ссылки резолвятся, id целевого = прежнее
значение, дерево навыков цело. Файлы: assets/skills/*.json (37),
schema.json, scripts/sync-skills-data.js, src/skills-data.js,
tests/skills.test.js, memory. Зависимости: 000211.01 (контракт). P1:
самый маленький чистый каталог — ранняя проверка паттерна на всех уровнях
(json→схема→sync→зеркало→тест).

### 000211.03 — P1 — «mobs: skills/spells/loot → ссылки на json (зеркало combat.js остаётся в id-форме)»
36 файлов: skills[], spells[], loot[].item — ссылки; src/combat.js НЕ
тронут (MOB_TYPES — id-форма, ручное зеркало; sync-mobs НЕ создаётся —
решение зафиксировано в §7); mirror-тест tests/combat.test.js:251 резолвит
ссылки→id ПЕРЕД deepEqual (ART_ONLY-поля по-прежнему исключаются);
новый тест: id каждого целевого = прежнее значение; schema.json закрепляет
паттерн полей (после 000211.01 схема жива через CATALOGS). Файлы:
assets/mobs/*.json (36), schema.json, tests/combat.test.js, memory.
Зависимости: 000211.01. P1: каталог с мёртвой схемой и самым хрупким
зеркалом (3 контракта: A* 000155, шаги 000174, reach 000175) — решается
БЕЗ правки combat.js, риск минимален.

### 000211.04 — P2 — «spells: база/предметы/здания → ссылки на json»
17 файлов: база (→файл spells или null), предметы[] (→items),
здания[] (число → файл buildings); sync-spells-data.js резолвит;
tests/spells.test.js:211 — диапазон 1..50 заменяется membership по
каталогу зданий (54); tests/craft.test.js:188-189 — тот же range-ассерт
в блоке :177-191 — синхронно (ОБЩИЙ файл с 000208 — мерж ПОСЛЕ 000208
либо rebase с адаптацией: резолв ссылки → id, затем membership);
icon — уже svg, не трогаем. Файлы: assets/spells/*.json (17),
schema.json, scripts/sync-spells-data.js, src/spells-data.js,
tests/spells.test.js, tests/craft.test.js, memory. Зависимости: 000211.01 +
000208 (строго ПОСЛЕ либо rebase — общий tests/craft.test.js:177-191).
P2: средний каталог, закрывает устаревший range-ассерт.

### 000211.05 — P2 — «dungeons: мобы/предметы/постройка/руда → ссылки на json + «предметы_стен» → «объекты_стен»»
5 файлов: мобы[] → файлы mobs (∈-проверка уже ЕСТЬ с 000022:
tests/dungeon.test.js:146-153 + mirror tests/combat.test.js:251 — после
миграции проверка резолвит ссылки → id перед сравнением),
предметы[] → items, постройка → файл buildings (биекция 31..35
сохранить), руда[].предмет →
items; переименовать поле «предметы_стен» → «объекты_стен» (это типы
объектов стен rock/stalactite/column, НЕ предметы — опасное называние для
общего ссылочного теста): json + schema + sync + src/dungeon.js
(fallback-литералы :89-167 + DUNGEON_WALL_KINDS const :230/
присвоение :241) + tests/dungeon.test.js в одном коммите. Файлы:
assets/dungeons/*.json (5), schema.json, scripts/sync-dungeons-data.js,
src/dungeons-data.js,
src/dungeon.js, tests/dungeon.test.js, memory. Зависимости: 000211.01. P2.

### 000211.06 — P2 — «items: 28 лута — ссылки на svg в json, уходит конвенция lootSprite()»
28 предметов с полем `loot` (все 28 svg на месте, проверено) получают
"icon": "assets/sprites/loot/<id>.svg"; lootSprite() (src/sprites.js:802)
читает icon из Game.ITEMS (live-root-паттерн, прецедент lootItemsRef
000158.05), fallback — старая конвенция (гард «нет иконки», D1); схема:
icon — опциональное поле (48 предметов без svg); append-only инвариант
ИНДЕКСА предмета в ITEMS (000157.01/000158.02, seed loot-визуалов) НЕ
нарушается — добавлено ПОЛЕ, не файл. Файлы: assets/items/*.json (28),
schema.json, scripts/sync-items-data.js, src/items-data.js, src/sprites.js
(только регион lootSprite), tests/sprites.test.js, tests/items.test.js,
memory. Зависимости: 000211.01. P2: закрывает svg-разрыв items (0/76 → 28/28
лута).

### 000211.07 — P2 — «buildings: 18 спрайтов — svg-ссылки + «тренирует» (имена!) → ссылки на навыки»
(a) 18 записей (13 slot-зданий — представители ВСЕХ 13 slot-типов,
id 1,2,3,4,7,8,10,11,25,31,36,40,44 + лагерь 47 + города 51-54)
получают "спрайт" (путь svg); literals BUILDING_SPRITES/CITY_SPRITES/
CAMP_SPRITES (src/sprites.js:287-300/:311-316/:324-326) уходят —
чтение из каталога лениво (в момент вызова, live-root; slot→id —
из данных: map_index 13 представителей, §3), fallback-literals
сохраняем для
vm-песочниц без data-модулей (прецедент visuals/mobgroups). (b) 18 школ
(id 7-24): «тренирует» — имена на русском → ссылки на файлы skills
(таблица name→id — §3); cross-check tests/npc-data.test.js:271
перестраивается на сравнение id целевого ссылки с npc.обучение.навыки
(сейчас — по именам через SECONDARY_SKILLS). Файлы: assets/buildings/
*.json (18+18 с пересечением), schema.json, scripts/sync-buildings-data.js,
src/buildings.js, src/sprites.js (регион building/city/camp sprites),
tests/buildings.test.js, tests/sprites.test.js, tests/cities.test.js,
tests/npc-data.test.js, memory. Зависимости: 000211.01 + 000207 (ОБЩИЕ файлы
каталога: json/schema/sync/src-buildings.js — строго ПОСЛЕ 000207) +
000211.08 (общие tests/sprites.test.js + sprites.js — строго ПОСЛЕ 000211.08).
P2: закрывает svg-разрыв buildings (0/54 → 18/18) и двойной дефект
«тренирует» (имена вместо id, id вместо ссылки).

### 000211.08 — P2 — «mob_groups: состав.мобы → ссылки на мобы + «кадры» — svg-ссылки группы»
7 файлов: состав.мобы[] → ссылки на файлы mobs; добавить "кадры":
["assets/sprites/mobs/<kind>_1.svg", "..._2.svg"] (явные пути по
существующей конвенции); «спрайт» (kind-ключ) ОСТАЁТСЯ — пер-моб боевой
маппинг MOB_SPRITE_KINDS (36 id → 6 видов, sprites.js) не входит в
набор; mobFrames() (sprites.js:621-624) читает кадры из данных,
MOB_FRAMES-literals (sprites.js:210-217) уходит на пути группы
(fallback-литерал для vm-песочниц без данных). sync-mob-groups-data.js —
аддитивное поле. Файлы: assets/mob_groups/*.json (7), schema.json,
scripts/sync-mob-groups-data.js, src/mob-groups-data.js, src/sprites.js
(регион MOB_FRAMES/mobFrames), tests/mob-groups.test.js,
tests/sprites.test.js, memory. Зависимости: 000211.01 + 000211.06 (общие
tests/sprites.test.js + sprites.js — строго ПОСЛЕ 000211.06); ссылки на
мобы корректны независимо от 000211.03 (файлы мобов существуют) — жёсткой
зависимости нет, но рекомендовано после. P2.

Схема запуска (параллельность):
* Волна A (параллельно): 000211.01, 000211.02, 000211.03, 000211.04, 000211.05 +
  существующие 000207, 000208, 000209 (000211.04 пересекается с 000208
  по tests/craft.test.js:177-191 — 000211.04 ПОСЛЕ 000208 либо rebase
  с адаптацией проверки: резолв ссылки → id, затем membership).
* Волна B: 000211.06 (после 000211.01) → 000211.08 (после 000211.06) → 000211.07
  (после 000207 и 000211.08). Тройка 000211.06/000211.08/000211.07 СЕРИЙНАЯ:
  общие src/sprites.js + tests/sprites.test.js.
* Охват каталогов: skills 000211.02; mobs 000211.03; spells 000211.04; dungeons
  000211.05; items 000211.06; buildings 000211.07+000207; mob_groups 000211.08;
  npc 000209 (+волна 2 — portraits); craft 000208 (+волна 2 —
  заклинания); visuals — ссылки уже есть (покрывается общим тестом
  000211.01); portraits — волна 2.

## 5. Волна 2 (отложены, поднимать ПОСЛЕ готовности условий)

1. craft: «заклинания» → ссылки на файлы spells (после 000208; малое поле:
   000002 steel_sword + зачарования 000007/000008/000029/000030; те же
   файлы каталога, что 000208).
2. npc ↔ portraits: ссылка в npc json (000012..17) на файл портрета +
   создать assets/portraits/schema.json (схемы НЕТ) + уйти от
   CANON_FILES-конвенции (sync-portraits.js:35-40); закрывает svg-связь
   npc (0/18 → через portraits). После 000209 (общие npc json/schema/sync).
3. Доксы/гигиена: spec/ci-github-pages.md:33-36 (mirror-список:
   «mobs/craft — данные живут в коде» — неверно; не хватает mob_groups/
   dungeons), memory/000015:24-25 (счёты 32/10/50 → 76/18/54), удалить
   logo.json (490 КБ мусора, не referenced).
4. sync-mobs: генерация зеркала из JSON (src/mobs-data.js) вместо ручного
   MOB_TYPES в combat.js. РИСК: новый <script> в index.html + пин
   tests/index-order.test.js (104 КБ) + правка крупнейшего файла (3
   контракта). Отдельное решение — НЕ в наборе.
5. buildings «типичный_npc» → ссылки: отклонено в наборе (§6) — роль не
   инстанс NPC; сначала нужен каталог ролей.
6. Двойной источник арта мобов: json `art` (явные пути 36/36) +
   конвенция mobArtFrames() (src/sprites.js:275-284; зеркало MOB_TYPES
   исключает art — в рантайме json не читается, тест
   tests/sprites.test.js:1313) — оставить ОДИН источник (json),
   конвенцию убрать. После 000211.03 (ссылки mobs на месте). ТЗ-требование
   по svg-ссылкам уже выполнено (art в json есть) — пункт
   рефакторинг sprites.js по образцу 000211.06/000211.08 (live-root).

## 6. ОТКЛОНЁННЫЕ кандидаты (следующий аудит 000211 НЕ повторяет)

* Иконки предметов в UI (инвентарь/крафт/магазин — только текст; svg есть
  лишь у 28 лута) — легитимная UX-задача, но ВЫХОДИТ за JSON-umbrella
  (изменение игрового кода за пределами data-контрактов + генерация ~48
  отсутствующих svg). Кандидат в отдельный UX-umbrella; условие — после
  000211.06.
* Справочник клавиш в UI (help-вкладка/строка в настройках; управление
  задокументировано только в комментариях: src/main.js:11, src/
  combat-ui.js:6, src/combat-keys.js:12) — то же: UX-umbrella, не 000211.
* [I] в бою — уже pending 000195. Не дублировать.
* Игровые кандидаты 000001 §4 (магия мобов 0/36, fearChance орфан
  sheet.js:479, magicResistMult орфан, школы 9-24 без map_index,
  NPC-дома 26-30 + 5 ролей, квест-цепочка «Орочий набег», onboarding,
  миникарта/наблюдательная (000093), [T]-меню combat-ui.js:803,
  персист настроек, QuotaExceeded main.js:613-626, buildingUI fullscreen
  (000125), touch [E] в городе, крафт в поле craft.js:522-530,
  не-зачарование магические рецепты, кадры Эфира combat-ui.js:1195,
  SVG интерьера города (только city_51..54), дельта уровня мобов
  combat.js:3086/3115, c._uiEvents (есть c._uiMoves 000174), стрелы/ammo,
  вода 4 кадра sprites.js:571-584, квесты на постройки, D-pad × combat
  canvas (000121), разрешение canvas (000124)) — это игровые/UX-кандидаты
  umbrella 000001 (или нового umbrella), НЕ дефекты JSON-справочников;
  перечислены в a1 §2.1/§4 с доказательствами — повторная аудитация не
  даст новых фактов для домена 000211.
* Lottie, «Удача» как 7-й навык, износ экипировки, «Акробатика» как
  отдельный навык, лор-механики мобов — отклонены правилом
  повторяемости (memory/000001-improvement-audit.md §5): новых фактов нет.
* «Удача» в таблице действий combat.js — плейсхолдер, задокументирован
  (combat.js:1495 «(SPEC: Удача)» — вешняя ссылка на дорефакторинг
  SPEC.md); новых фактов нет.
* .squad-panel z-10 (латентный близнец, memory/000206) — намеренно
  отложен, не JSON-домен.
* Guard ABYSS-босса не обобщён (memory/000183) — боевой домен.
* Две разные формулы активного юнита в боевом инфо-блоке (memory/000199) —
  боевой домен.
* HACKING.md verbatim-долг (memory/000160: структура проекта / тесты и
  утилиты, 13 нетестовых скриптов) — доковый долг, кандидат в
  documentation-umbrella, не 000211.
* memory/000148.02 §5 — устаревшие соседи (формат built, ds.cityBuilt) —
  уже флаг ретро-finding от 000190.
* buildings «типичный_npc» → ссылки — роль (класс) не инстанс: ссылка на
  одного NPC семантически неверна; сначала каталог ролей (§5.5).
* Переименование/объединение MOB_SPRITE_KINDS (36 id → 6 видов,
  sprites.js) с mob_groups.спрайт — два разных маппинга (пер-моб бой vs
  пер-группа мир); объединение без новой информации о потребностях рендера
  не обосновано.

## 7. Что важно будущим задачам (подводные камни)

1. additionalProperties:false — новое поле = расширение schema.json в ТОМ
   ЖЕ коммите (000141); молчаливо красная валидация иначе.
2. JSON + schema + зеркало — ОДИН коммит; deepEqual-пины + byte-в-byte
   идемпотентность sync (000158.06 п.1: npm sync:* → повторный запуск →
   node --test).
3. Сгенерированный data-модуль НЕ содержит require внутри (000049/000053;
   vm-песочницы исполняют без module-окружения) → резолюция ссылок ТОЛЬКО
   в sync-скрипте (время сборки), НО не в рантайме.
4. JS-зеркала — id-форма: контракт потребителей (Game.ITEMS, MOB_TYPES,
   getBuilding…) + сейв v1 (id предметов, memory/000031). Ссылки
   существуют ТОЛЬКО в json и в схемах.
5. items — append-only: индекс предмета в ITEMS стабилен (000157.01/
   000158.02, seed loot-визуалов); менять можно ПОЛЯ, не порядок файлов.
6. sync-all.js --check — дрейф-гейт CI; новый sync-*.js подхватывается
   автоматически по конвенции (workflow не править).
7. МОБЫ: зеркало MOB_TYPES — ручное (combat.js:141); при любой правке —
   mirror-тест :251 (с ссылками: резолвить ПЕРЕД deepEqual, ART_ONLY
   поля исключить); 3 контракта combat.js (A* 000155, запись шагов 000174,
   reach 000175) — не рефакторить мимо них.
8. sprites.js: fallback-literals (FALLBACK_MOB_KINDS, visuals, и новые
   building/city/camp/loot) — ДЕРЖАТЬ для vm-песочниц без data-модулей;
   чтение данных — лениво (в момент вызова, live-root-паттерн
   lootItemsRef 000158.05), НЕ при инициализации модуля.
9. index.html + tests/index-order.test.js (104 КБ) — НОВЫЙ <script> =
   правка пина; в наборе 000211.01-000211.08 новых скриптов НЕТ (все baking —
   в существующие зеркала).
10. Полный npm test — строго ОДИН за раз в worktree (тест 000054 мутирует
    src/npc-data.js; memory: no parallel full tests).
11. tests/combat-ui.test.js — EOF-якорная дисциплина при rebase (урок
    000199 п.9); после ЛЮБОГО rebase — полный node --test в worktree.
12. tests/map.test.js — GOLDEN_TILES deepEqual + «160k tileAt» load-флейк
    при параллельных workflow (перепуск одиночного файла + пометка в
    отчёт).
13. Занимает/занято (финализация 2026-10-14): 000214 (время в
    подземельях/городах) — смержена; 000215 (тёмные линии тайлов)
    — смержена (master 589e2c4, во время финализации; worktrees
    000214/000215 убраны); 000195 — worktree в работе; номера детей
    — шаблон 000211.YY (первоначально ошибочно сквозные 000216+).
14. Детерминизм: не итерировать Map в AI (000155); vm без opts.performance
    = реальный Date.now (000174); performance.now() = NOW=1000 в e2e
    (000206).
15. CSS index.html: «*/» в комментарии убивает следующее правило (000201);
    пины CSS только comment-aware.

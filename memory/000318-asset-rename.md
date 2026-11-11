# 000318 — переименование JSON-каталогов assets/ по id: реестр и правила

Родительская задача: tasks/pending/000318.md; разбивка —
tasks/result/000318-split-20261108.md (дочерние 000318.01–.11).
Этот файл — инфраструктурная память .01: формы имён становятся per-catalog,
переименований в .01 НЕТ (все каталоги — number).

## 1. Реестр каталогов и шейпов (scripts/lib/json-ref.js: ASSET_NAME_SHAPES)

| каталог | шейп | файлов | мишень ссылок |
|---|---|---|---|
| items | number | 513 | да |
| skills | number | 44 | да |
| spells | slug (000318.05; было number) | 169 — <id>.json (id строка === basename) | да |
| mobs | slug (000318.04; было number) | 36 — <id>.json (id строка === basename) | да |
| mob_groups | slug (000318.04; было number) | 7 — рукописный slug (id 1..7 числовой в JSON — НЕ basename) | да |
| buildings | slug (000318.06; было number) | 55 — рукописный slug (id 1..55 числовой в JSON — НЕ basename; 29 = basename «спрайт», 26 — таблица) | да |
| craft | number | 343 (max 000419 — СЕГМЕНТАМИ, дыры) | да |
| dungeons | slug (000318.04; было number) | 5 — рукописный slug (id 0..4 числовой в JSON — НЕ basename) | да |
| npc | number | 22 | да |
| runes | slug (000318.02; было number) | 55 — <id>.json | НЕТ (никогда не был в REF_RE) |
| visuals | slug (000318.03; было number) | 13 — <slug>.json по basename «спрайт» (id 1..13 числовой в JSON — НЕ basename) | НЕТ (каталог прямых svg-путей, AR2/AR5) |
| portraits | named | efir/flogiston/npc-NNNNNN | только PORTRAITS_RE |

REF_LINKED_CATALOGS = РОВНО 9 мишеней (REF_CATALOGS минус visuals/portraits).
Ключевое разделение осей: ref-eligibility (в REF_LINKED_CATALOGS или нет) ≠
name-shape ('number'/'slug') ≠ 'named' (portraits). Переименование visuals
(.03) или runes (.02) меняет ТОЛЬКО ASSET_NAME_SHAPES — мишени не трогаются;
негативы AR2/AR5/AR14 («assets/visuals/… — не ref») — навсегда.

## 2. Формы и резолвер (json-ref.js)

* SHAPE_BASENAME_RES: number `^\d{6}\.json$`, slug `^[a-z][a-z0-9_]*\.json$`
  (slug с буквы — отсекает и «голое число», и заглавную, и слеши/расширения).
* `refPath(catalog, basename)` — сборка корневого пути;
  `isRefPath(catalog, basename)` — членство в мишенях + regex шейпа;
  `isRefPathFull(p)` — парсинг `^assets/([^/]+)/([^/]+)$` (слэш в basename
  отсекается автоматически). `isRef` = isRefPathFull ∪ PORTRAITS_RE —
  читает ASSET_NAME_SHAPES ЖИВО (тесты могут временно флипать шейп в
  try/finally; фикстуры обеих форм — AR13/AR14, RN4).
* REF_RE ВЫВОДИТСЯ из шейпов группами по форме, порядок каталогов =
  REF_CATALOGS. При всех 'number' source ПОБайтово равен прежнему литералу
  (пин AR11) — рантайм-носитель строки: pattern в assets/skills/schema.json
  (SR5, skills.test.js сверяют с REF_RE.source; дрейп вывода красит сьюту;
  schema.json в .01 не тронут). ПОСЛЕ 000318.04 флипы НЕ «не-мишеней»
  (runes/visuals) — мишеней mobs/mob_groups/dungeons: source ДРЕЙФУЕТ;
  ПОСЛЕ 000318.05 кslug-группе добавился spells (тоже мишень). Текущий
  source — ДВЕ группы `…(items|skills|buildings|craft|npc)/\d{6}…` +
  `…(spells|mobs|mob_groups|dungeons)/[a-z][a-z0-9_]*…`; AR11 пере-пинут
  побайтово (цепочка .04 → .05), носители pattern (skills/dungeons/
  mob_groups/spells/mobs schema.json) обновлены в тех же коммитах
  (memory/000318-mobs-mobgroups-dungeons.md §3, memory/000318-spells.md).
  ПОСЛЕ 000318.06 кslug-группе добавился buildings (третья флипающаяся
  МИШЕНЬ): текущий source — `…(items|skills|craft|npc)/\d{6}…` +
  `…(spells|mobs|mob_groups|buildings|dungeons)/[a-z][a-z0-9_]*…`;
  AR11 + побайтовые дубли .02/.03/.04/.05 + носители pattern
  skills/craft/spells/npc/dungeons/mob_groups schema.json — ре-пин в том
  же коммите (memory/000318-buildings.md).
* Lib обязан остаться ОДНИМ файлом без внутренних require-соседей:
  tests/items.test.js копирует в tmp ровно файл json-ref.js.
* Производительность: ни одного new RegExp на вызов (isRef гоняется по
  ~900 JSON в AR8/AR9/RN3 и sync) — все regex — константы модуля, REF_RE
  собирается один раз при загрузке.

## 3. Sync-скрипты: перевод чужих REF_* на общий lib

В sync-{craft,spells}-data.js refId(ref, catalog, where) проверяет
`startsWith('assets/<catalog>/') + isRefPath(catalog, basename)`; в
sync-buildings-data.js хелпер isCatalogRef; в sync-mob-groups-data.js —
инлайн для 'mobs'. СООБЩЕНИЯ ОБ ОШИБКАХ и exit-коды сохранены дословно
(пины R4/R5/SR8: «не по формату», «(формат "assets/items/NNNNNN.json")»,
«нет цели ссылки», «без id» — формат-строки НЕ «улучшать» до shape-aware:
они пин-поверхность и читабельность отказов).

СЛЕДСТВИЕ перевода: tmp-«репозитории» makeTmpSpellsRepo (tests/spells.test.js)
и makeTmpCraftRepo (tests/craft.test.js) копируют из scripts/lib теперь и
json-ref.js (иначе MODULE_NOT_FOUND в запускаемом sync). tmp-билдеры
buildings/skills-refs копируют ВЕСЬ scripts/lib — их трогать не нужно.

НЕ переведены и НЕ должны: `.filter(/^\d{6}\.json$/).sort()` в 10+
sync-скриптах — ЭТО КОНТРАКТ ПОРЯДКА зеркала (позиционные MOB_GROUP_TYPES
src/map.js и формулы визуалов/сидов); перевод сортировки на по-id — задача
соответствующих дочерних .YY при переименовании каталога.

## 4. Правила переименований для дочерних 000318.02+

* Правило имени: slug-шейп каталога ⇒ basename === id + '.json' (свип
  renameViolations в tests/assets-renames-000318.test.js — эталон семантики;
  number-шейп НЕ требует basename == id: dungeons — id 0..4 при файлах
  000001..000005; рукописный slug-шейп тем более: buildings — id 1..55
  при slug-именах с 000318.06).
* Rename — отдельным `git mv` (R100, контент 0-diff) от M-правок строк
  referrer-ов (проверять `git show -M`); правки ссылок в JSON — тот же
  коммит или следующий, но диффы не смешивать по типу.
* Зеркала содержат пути файлов в комментариях/шапках (craft/spells — шапки
  `// <file>`, dungeons/items и др.) ⇒ ПЕРЕГЕНЕРАЦИЯ ЗЕРКАЛ обязательна
  В ТОМ ЖЕ коммите; проверка — `node scripts/sync-all.js --check` = 0 на
  чистом дереве ПОСЛЕ коммита (до коммита транзиентно красен — конвенция).
* Сейвы путей не содержат — миграция сейвов только в .11.
* Счётчики ссылок/файлов в чужих тестах — анти-вакуум пины (craft 343,
  spells 169, ссылки 1259/477/473 и т.п.) — при переименовании НЕ должны
  меняться (rename не меняет число ссылок); сменятся только path-строки.
* craft-дыры: непрерывность 1..N пиннится для 10 каталогов, craft —
  явное пин-исключение «с дырами» (RN2).

## 4.1. Переименованные каталоги (итоги дочерних)

* runes → slug (000318.02, 55 файлов <id>.json): контракт, решение о
  порядке зеркала (по id — прежний числовой порядок файлов переименованием
  УНИЧТОЖЕН, 53 из 55 позиций сдвинулись), честный ре-пин golden-замера
  M6 и грабли (slug-regex ловит schema.json — исключать руками; tmp-копирка
  json-ref.js; REF_RE не дрейфует) — memory/000318-runes.md.
  НЕ путать с memory/000318-skills-nature.md (000318.11, деанон id в skills).
* visuals → slug (000318.03, 13 файлов <slug>.json по basename «спрайт»):
  имя-носитель — slug = basename(data.спрайт, '.svg'), НЕ id (id числовой
  1..13 остался в JSON) — порядок зеркала ПО ID сохраняет прежний файтовый
  порядок БИТ-В-БИТ (diff src/visuals-data.js — только comment-строки),
  CHANGELOG не требовался. Свип имени — NameOf-таблица в
  tests/assets-renames-000318.test.js (runes: id; visuals: спрайт) —
  НЕ ослабление. Ростер номер→slug:
  1 grass_blades_light, 2 grass_blades_dark, 3 flower_red, 4 flower_yellow,
  5 flower_white, 6 bush, 7 mushroom, 8 rock, 9 pebble, 10 snow_patch,
  11 dry_tuft, 12 reed, 13 lily_pad. Детали — memory/000318-visuals.md.
* mobs + mob_groups + dungeons → slug (000318.04, 36+7+5 файлов, ОДИН
  коммит вместе с перезаписью ссылок mob_groups→mobs 24 и dungeons→mobs 21):
  ЕДИНСТВЕННЫЕ дочерние, где флипаются МИШЕНИ ⇒ REF_RE дрейфует (ДВЕ группы;
  пин AR11 и pattern в skills/dungeons/mob_groups schema.json — ре-пин в том
  же коммите). Mob — <id>.json (NameOf по умолчанию); mob_groups/dungeons —
  рукописные таблицы id→slug (числовые id 1..7 / 0..4 = ПОЗИЦИИ зеркал
  MOB_GROUP_TYPES / DUNGEON_* → сортировка syncs по data.id, зеркала
  побайтово прежние вне comment-строк, CHANGELOG не требовался):
  mob_groups 1 orc_camp, 2 orc_raiders, 3 skeleton_den, 4 wolf_pack,
  5 spider_nest, 6 elemental_circle, 7 abyss_spirit;
  dungeons 0 simple_cave, 1 crypt, 2 castle_ruins, 3 flooded_cave, 4 abyss.
  Детали — memory/000318-mobs-mobgroups-dungeons.md.
* spells → slug (000318.05, 169 файлов <id>.json, контент 0-diff кроме 34
  self-ссылок «база»): вторая после .04 флипающаяся МИШЕНЬ ⇒ REF_RE дрейфует
  (spells переехал в slug-группу; AR11 + побайтовые дубли в тестах .02/.03/
  .04 + носители pattern skills/mobs/dungeons/spells schema.json — ре-пин в
  том же коммите). NameOf по умолчанию (id === basename, как runes/mobs —
  NAME_OF_000318 не расширялся). Порядок зеркала spells-data — по data.id
  (лекс. имя = id ⇒ компаратор наблюдаем tmp-свопом контентов, не имен);
  169/169 позиций сменились, но рантайм порядок SPELLS НЕ читает
  (0 индексных/rng-выборов) ⇒ golden-пересимуляции и CHANGELOG НЕ
  потребовались (мутация M4: ручной shuffle зеркала — позиционные тесты
  красные, поведенческие зелёные). Детали — memory/000318-spells.md.
* buildings → slug (000318.06, 55 файлов <slug>.json, контент 0-diff;
  750 referrer-JSON / 1045 вхождения: craft 725, spells 280, npc 35,
  dungeons 5 — свип повторён после ре-базы на 000320.15): ТРЕТЬЯ
  флипающаяся МИШЕНЬ. Имя — ГИБРИД (29 = basename
  «спрайт», 26 — таблица id→slug; ТЗ-премисса «55 уникальных спрайтов»
  ЛОЖНА); sync-buildings-data — сортировка по data.id + исключение
  schema.json (главная ловушка: slug-regex матчит schema.json);
  sync-npc-data buildRefMap — shape-aware (иначе numeric-имена зданий
  теряются в маппинге). Порядок зеркала BUILDINGS по id = прежний
  файтовый ⇒ 635 non-comment строк блока бит-в-бит, CHANGELOG не
  требовался. Детали, ростер и матрица — memory/000318-buildings.md.

## 5. Памятка оркестратору волн

Тексты закоммиченных pending-задач 000320.x/000321.x цитируют старые пути
«assets/…/NNNNNN.json» — при переименованиях дочерними 000318.YY эти
ЗАКОММИЧЕННЫЕ тексты не правятся (задачи в master не меняются).

С 000318.06 в волнах: здания — `assets/buildings/<slug>.json` (ростер
id→slug — в memory/000318-buildings.md и тестах
buildings-rename-000318.06/assets-renames-000318); numeric-путь
`assets/buildings/000NNN.json` — НЕ ref (REF_RE/sync-резолюции/schema-
паттерны его не принимают; AR8/AR9 его НЕ видят — guard'ы только
перевёрнутые pattern'ы схем + zero-sweep T5 в buildings-rename-тесте).
spec/runes.md:47 остаётся устаревшим (числовой naming руны) — 0-diff по
решению 000318.02, не «чинить» попутно.

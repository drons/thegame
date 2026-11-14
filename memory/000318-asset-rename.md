# 000318 — переименование JSON-каталогов assets/ по id: реестр и правила

Родительская задача: tasks/pending/000318.md; разбивка —
tasks/result/000318-split-20261108.md (дочерние 000318.01–.11).
Этот файл — инфраструктурная память .01: формы имён становятся per-catalog,
переименований в .01 НЕТ (все каталоги — number).

## 1. Реестр каталогов и шейпов (scripts/lib/json-ref.js: ASSET_NAME_SHAPES)

| каталог | шейп | файлов | мишень ссылок |
|---|---|---|---|
| items | slug (000318.08; было number) | <id>.json (id строка === basename; 513 на момент .01, 864 на rename 9a08623a — эррата 000373 Р.2, дальше растёт волнами 000321.YY: 914 на базе 52b75f90 — счётчик БОЛЬШЕ НЕ пинится памятью и тестами, живой состав сторожат tests/items-rename-000318.08 с 000379: живые предикаты + append-only реестр) | да |
| skills | slug (000318.09; было number) | 44 — <id>.json (id строка === basename; школа «Природа» — nature_school после 000318.11) | да |
| spells | slug (000318.05; было number) | 172 — <id>.json (id строка === basename; 169 на момент .05, цепочка +1 74766f68 → +1 79ae2641 → +1 98eec709 — актуально с 98eec709, эррата 000373 Р.2) | да |
| mobs | slug (000318.04; было number) | 36 — <id>.json (id строка === basename) | да |
| mob_groups | slug (000318.04; было number) | 7 — рукописный slug (id 1..7 числовой в JSON — НЕ basename) | да |
| buildings | slug (000318.06; было number) | 55 — рукописный slug (id 1..55 числовой в JSON — НЕ basename; 29 = basename «спрайт», 26 — таблица) | да |
| craft | slug (000318.07; было number — «сегментами с дырами», ТЗ-число 343 устарело) | 693 — <id>.json (id строка === basename; 643 на момент .07, +50 алхимии 74f4ab53 — актуально с 74f4ab53, эррата 000373 Р.2) | да |
| dungeons | slug (000318.04; было number) | 5 — рукописный slug (id 0..4 числовой в JSON — НЕ basename) | да |
| npc | number | 47 (22 на момент .01; +25 волнами .320.x — актуально с 6330d2ec, эррата 000373 Р.2) | да |
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
  ПОСЛЕ 000318.07 кslug-группе добавился craft (ЧЕТВЁРТАЯ флипающаяся
  МИШЕНЬ): текущий source — `…(items|skills|npc)/\d{6}…` +
  `…(spells|mobs|mob_groups|buildings|craft|dungeons)/[a-z][a-z0-9_]*…`
  (в number-ветке осталось ТРИ каталога); AR11 + схемы-носители
  craft/schema.json («база»), items/schema.json (`effect.recipe`),
  skills ×2 + dungeons ×4 (≡ живому source) — ре-пин в том же коммите;
  побайтовые дубли в тестах .02…/.06 заменены ПРОИЗВОДНЫМИ от
  `mod.REF_RE.source` (memory/000318.07-craft-slug-rename.md §1).
  — ЭРРАТА 000373 (П.1): ЛОЖНО — механизма производных (разреза source)
  на диске НЕТ; source пинится ЛИТЕРАЛОМ `assert.equal((mod|JR).REF_RE.source,
  …)` в ВОСЬМИ файлах: runes .02, visuals .03, mobs .04, spells .05,
  buildings .06, craft .07, items .08 (восьмой добавлен 000318.08 — b21
  считала СЕМЬ на 6330d2ec) и assets-refs AR11. Флип ЛЮБОГО из 9 мишеней
  ASSET_NAME_SHAPES красит все восемь — пересчитывать дисковым grep по
  `REF_RE.source,` с фильтром assert.equal, не по числу из памяти.
  Полный диск-факт и живой source — memory/000373-b21-errata.md.
  ПОСЛЕ 000318.08 кslug-группе добавился items (ПЯТАЯ флипающаяся
  МИШЕНЬ): текущий source — полная строка в
  memory/000318.08-items-slug-rename.md «Механизм» — в number-ветке
  осталось ДВА каталога
  (skills|npc); носители pattern — items/{craft,spells,mobs,buildings,
  npc}/schema.json + dungeons ×4 (юнион) + skills ×2 — сведены к ≡
  живому REF_RE в том же коммите, плюс покаталожные литеральные пины
  (паттерн items-схемы в combat, ITEM_REF_RE/лоот-сканы в
  building-effects/combat) — ре-пин на slug-форму; приёмочный гейт
  «`assets/items/` + цифра» по всем дерева = 0 (конкат-форма и
  bare-ординалы гейт-легальны). Детали, реестр и матрица —
  memory/000318.08-items-slug-rename.md.
  ПОСЛЕ 000318.09 к slug-группе добавился skills (ШЕСТАЯ флипающаяся
  МИШЕНЬ): живой source — полная строка в «1. Механизм»
  memory/000318.09-skills-slug-rename.md — в number-ветке ОСТАЛСЯ ОДИН
  каталог (npc); носители pattern ≡ живому REF_RE — skills schema ×2 +
  dungeons UNION ×4 + mobs:46 + craft:81 + buildings:108 — ре-пин в том
  же коммите; приёмочный гейт «`assets/skills/` + цифра» = 0
  (конкат-форма негативов легальна). Механизм, грабли (коллизия refNum/
  «hide», дисциплина комментариев), карта ре-пинов —
  memory/000318.09-skills-slug-rename.md.
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
соответствующих дочерних .YY при переименовании каталога. ПЕРЕВЕДЁН
sync-craft-data.js (000318.07): фильтр — форма из живого реестра +
исключение `schema.json`, порядок — по `data.id` (единственный потребитель
порядка `DISASSEMBLY_BY_ITEM` не изменился: единственный тай разрешается
прежнему победителю). эррата 000373 (П.3): ВТОРОЙ потребитель — src/craft-ui.js;
как общий тезис «единственный
потребитель порядка» — ЛОЖНО (рендер списка рецептов `C.CRAFT.filter(...)` в порядке
массива БЕЗ `.sort(` в файле; при .318.07 сменились 641/643 позиций —
порядок UI-списка поехал вместе с зеркалом; поведение не сломано, но
«единственного» больше нет). Утверждение верно только для коллизий
`DISASSEMBLY_BY_ITEM` (при равенстве уровней побеждает первый в порядке).
ПРЕЦЕДЕНТ .06 НЕСИММЕТРИЧЕН: у buildings lex ≡ файтовый порядок.
ПЕРЕВЕДЁН sync-items-data.js (000318.08): фильтр —
slug-форма + исключение `schema.json`, порядок — по `data.id`; guard
пустого каталога → exit 1 (иначе пустой каталог молча «очистил» бы
зеркало); компаратор по данным, НЕ по имени файла.

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
  явное пин-исключение «с дырами» (RN2). ИСПОЛНЕНО 000318.07: с переходом
  craft в slug-шейп файловых номеров нет вовсе — исключение снято
  (`GAPPED` = пустое множество, механизм оставлен для будущих number-
  каталогов), сегментный пин заменён свипом `basename === id` — в ДВУХ
  носителях: `tests/craft.test.js` и `tests/assets-schemas.test.js`
  (последний до .07 craft в `CATALOGS` НЕ содержал ⇒ его крафтовая
  сегментная ветка была мертва; теперь `CATALOGS += craft` и ветка
  `SLUG_SWEEP_000318` — memory/000318.07-craft-slug-rename.md §3).

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
* craft → slug (000318.07, 643 файла <id>.json: 600 R100 + 43 с правкой
  self-«база»; + 6 `effect.recipe` в assets/items 000077–000082): ЧЕТВЁРТАЯ
  флипающаяся МИШЕНЬ, `NameOf === id` (не рукописный, как .06). ТЗ-премисса
  «343 файла» устарела (000321.01…06 долили 5×50 — последние 50
  переименованы этим же коммитом). Зеркало `src/craft-data.js` — lex по id
  (`adobe_shield … yew_longbow`), порядок сменился ЦЕЛИКОМ (6206/6206
  строк), но `src/items-data.js` 0-diff и тай `DISASSEMBLY_BY_ITEM`
  (единственный) разрешается победителю — эррата 000373 (П.3), src/craft-ui.js:
  «единственный» лишь для коллизий DISASSEMBLY_BY_ITEM, второй потребитель
  порядка CRAFT — craft-ui (см. §3) ⇒ golden/rng 0-diff,
  CHANGELOG не требовался. Сегментный пин «с дырами» → свип basename === id,
  `GAPPED` пуст. Формула 000230.11 T9 (`parseInt` от имени файла → NaN)
  переведена на порядок ростера. Сегментный пин из ТЗ жил в
  `tests/assets-schemas.test.js`, но craft в `CATALOGS` там не было —
  ветка мертва; с .07 `CATALOGS += craft` + свип-ветка `SLUG_SWEEP_000318`
  (+4 теста: craft получил общую сетку покрытия, включая валидность всех
  643 файлов по своей схеме). Карта ре-пинов и грабли
  (`$'` в `String.replace`, slug-regex ловит `schema.json`, позиционные
  окна `files.length − K + i` в пяти wave-тестах, локальные имена
  `craftFiles`) — memory/000318.07-craft-slug-rename.md. Пометка эрраты
  000373 (П.2): ЛОЖНО «пяти» — вырезаны из ШЕСТИ (шесть файлов
  items-{weapon,armor,shield,artifact,tool,ring}-000321.01…06;
  `git show --stat 9d41e9f8 -- 'tests/items-*000321*'` — ровно 6).
* items → slug (000318.08, 864 файла <id>.json, контент файлов 0-diff —
  только имена; + перепись 942 referrer-файлов / 3163 вхождений в
  assets/{craft,npc,dungeons,spells,mobs,buildings}): ПЯТАЯ флипающаяся
  МИШЕНЬ, `NameOf === id`. ГЛАВНОЕ ОТЛИЧИЕ от .05/.07: allItems-порядки
  УЧАСТВУЮТ в rng (магазины/лут/кемп-стоки) ⇒ зеркало лекс-по-id
  перемешивает пулы ЦЕЛИКОМ (не хвостом) — массовый golden-ре-шут ЖИВЫМ
  кодом при неизменных сидах (пример: солёный свиток seed 6 →
  ice_field_scroll вместо frost_wisp_scroll); пины «пул ≡ каталог в
  каталожном порядке» ослаблены до множеств (F2-P1, src/loot-equip-data.js
  0-diff); позиционные пины волн 000321.0{1..7} сохранены через реестр
  «номер→id» tests/scripts/items-num2id-000318.08.json (Append-only с
  000379: существующие строки неизменны, длина растёт вместе с каталогом)
  + хелперы FILES_I08/DISKF_I08. Механизм, ловушки, матрица, долги (lootSprite
  index-формула SP-LOOT-3, makeShop top-N) — memory/000318.08-items-slug-rename.md.
* skills → slug (000318.09, 44 файла <id>.json, контент файлов 0-diff —
  ШЕСТАЯ флипающаяся МИШЕНЬ; зависимость 000318.11 «nature_school»
  удовлетворена): referrers по ФАКТУ ДИСКА — craft 693/954, mobs 27/27,
  buildings 18/34; зеркало перегенерировано в том же коммите (лекс по id);
  golden НЕ переснимались — skills-порядки НЕ входят в rng (принципиальное
  отличие от .08); реестр номер→id tests/scripts/skills-num2id-000318.09.json
  (44 пары, НЕ расширять); грабли: items-refNum() переконвертирует
  skills-слоги-коллизии («hide»→000037) — на skills-местах path.basename;
  assets-schemas переведён в SLUG_SWEEP (44). Механизм, карта ре-пинов,
  негативы-concat — memory/000318.09-skills-slug-rename.md.

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
С 000318.07 в волнах: рецепты — `assets/craft/<id>.json` (self-«база» и
`effect.recipe` чертежей); numeric-путь `assets/craft/000NNN.json` — НЕ ref
(REF_RE/схема/sync-резолвция его не принимают), а числовые «номера рецептов»
в текстах задач и тестов — история, а не путь. Долг: `spec/items.md:305`
всё ещё описывает `assets/craft/NNNNNN.json` — docs-эррата отдельной задачей
(scope .07 — только line-neutral `spec/craft.md`).
С 000318.08 в волнах: предметы — `assets/items/<id>.json`; numeric-путь
`assets/items/000NNN.json` — НЕ ref (REF_RE/схема/sync-резолвция не
принимают). Реестр «номер→id» — tests/scripts/items-num2id-000318.08.json
растёт вместе с каталогом построчно append-only (эррата 000379: прежняя
директива «не расширять» была ложна и диском, и канон-плечом —
canon-items-sync берёт num только из этого реестра и требует nums ≡ {1..N};
волна 000321.08 уже дописала 000865–000914). Неприкосновенны СУЩЕСТВУЮЩИЕ
строки (пере-нумерация/удаление красят зуб append-only в items-rename T11);
правильный рост = дописать pad(N+1)…pad(N+k) + regen src/items-data.js в
том же коммите, а tests/items-rename-000318.08.test.js НЕ править (живые
предикаты, self-gate T12 не вернёт литерал) — рецепт целиком в
memory/000379-items-registry-unfetter.md; любые golden, где участвуют
allItems-порядки (магазины/лут/кэмпы), — переснимать ЖИВЫМ кодом с гейтом
«сид не дрейфует».
С 000318.09 в волнах: навыки — `assets/skills/<id>.json`; numeric-путь
`assets/skills/000NNN.json` — НЕ ref (REF_RE/схема/sync-резолвция не
принимают); замороженный реестр «номер→id» —
tests/scripts/skills-num2id-000318.09.json (НЕ расширять); ПОСЛЕДНИЙ
number-каталог — npc (`assets/npc/000NNN.json` живёт numeric-ветвью REF_RE
до своей задачи цепочки 000318); skills-порядки в rng НЕ входят — golden
на skills-волнах не переснимать.

spec/runes.md:47 оставался устаревшим (числовой naming руны) — 0-diff по
решению 000318.02, не «чинить» попутно. ИСПРАВЛЕНО 000360 (errata): путь →
`assets/buildings/rune_stone.json`, line-neutral, SPEC_FILE_LINES=68 не двигался.

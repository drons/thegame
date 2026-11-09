# 000318.04 — mobs / mob_groups / dungeons → slug: ростеры, порядок, REF_RE

Дочерняя 000318.04 родителя tasks/pending/000318.md (реестр —
memory/000318-asset-rename.md). ОДИН коммит: 48× git mv R100 (36+7+5,
контент 0-diff на момент mv; в ИТОГЕ diff — 49 R-хэнков: 37×R100 =
mobs 36 + tasks/done, и 12×R063–R094 для mob_groups/dungeons —
git mv + M-правка ссылок в одном коммите снижают similarity)
+ ПЕРЕЗАПИСЬ межкаталожных ссылок в тех же JSON
(mob_groups→mobs 24, dungeons→mobs 21) + флип ASSET_NAME_SHAPES трёх
каталогов 'number'→'slug' + дрейф REF_RE + пересинк двух зеркал.

## 1. Носители имени и ростеры

* mobs (36): id — СТРОКА, basename === id + '.json' (совпадает с runes .02 —
  NameOf по умолчанию; sweep в assets-renames зелёный без таблицы).
  Файлы: orc_grunt, orc_warrior, orc_archer, orc_shaman, orc_rider, orc_mad,
  orc_captain, orc_chief, skeleton, skeleton_archer, crawling_bones,
  giant_larva, vampire, rot, bone_coloss, wolf, wolf_pack, boar, cave_bear,
  spider, troll, ant, ant_queen, scorpion, centipede, fire_elemental,
  water_elemental, wind_elemental, earth_elemental, imp, salamander, fairy,
  stone_golem, lower_demon, succubus, abomination
  (= прежние файлы 000001..000036 по порядку).
* mob_groups (7): id ЧИСЛОВОЙ 1..7 остался в JSON; имя — РУКОПИСНАЯ таблица:
  1 orc_camp, 2 orc_raiders, 3 skeleton_den, 4 wolf_pack, 5 spider_nest,
  6 elemental_circle, 7 abyss_spirit.
* dungeons (5): id ЧИСЛОВОЙ 0..4 (в файле простого_cave id = 0 — контракт
  000211 «id ≠ номер файла»); таблица: 0 simple_cave, 1 crypt,
  2 castle_ruins, 3 flooded_cave, 4 abyss.
  Числовой id и имя — РАЗНЫЕ носители (как visuals .03): честные пины —
  таблицы id→slug и сеты имён, НЕ basename==id.

## 2. Контракт порядка зеркал (главная ловушка)

src/mob-groups-data.js: позиция записи = id − 1 = кодовый индекс группы
(MOB_GROUP_TYPES / hash2 % N в src/map.js). src/dungeons-data.js: позиция =
id (0..4, DUNGEON_FLEX-индексы src/sprites.js COMBAT_BG_DUNGEON /
DUNGEON_FLOOR_FRAMES). Lex-порядок slug-имён НЕ равен id-порядку
(mob_groups по имени: abyss_spirit, elemental_circle, orc_camp, orc_raiders,
skeleton_den, spider_nest, wolf_pack → ids [7,6,1,2,3,5,4]; dungeons:
abyss, castle_ruins, crypt, flooded_cave, simple_cave → [4,2,1,3,0]).
⇒ sync-mob-groups-data.js и sync-dungeons-data.js сортируют ПО ЧИСЛОВИЧ
data.id (`sort((a, b) => a.data.id - b.data.id)`), как runes .02 / visuals .03.
Следствие: зеркала перегенерированы, но данные БИТ-В-БИТ прежние —
`git diff -U0` по НЕ-comment строкам обоих зеркал пуст (меняются только
шапка-диапазон путей и построчные `// <slug>.json`). Игроки видят те же
группы/подземелья в тех же позициях ⇒ CHANGELOG НЕ требовался (мутация M1
— сортировка обратно по имени — сдвигает позиции и красит позиционные
тесты: наблюдаемость компаратора).
Проверка «id = номер файла» в syncs УБРАНА (номера в имени нет), заменена
целочисленностью id + точным множеством {1..N} / {0..4} (grep-пин T5).

## 3. REF_RE ДРЕЙФУЕТ (отличие от runes .02 и visuals .03)

mobs/mob_groups/dungeons — мишени REF_LINKED_CATALOGS (9 шт. не изменилось,
состав тот же). После флипа REF_RE = ДВЕ группы (порядок REF_CATALOGS):
`^assets\/(items|skills|spells|buildings|craft|npc)\/\d{6}\.json$`
`^assets\/(mobs|mob_groups|dungeons)\/[a-z][a-z0-9_]*\.json$`
Носители строки, обновлены в том же коммите: побайтовый пин AR11
(tests/assets-refs.test.js), pattern в assets/skills/schema.json (SR5 /
skills.test сверяют с живым REF_RE.source — рантайм-носитель), объединённый
pattern в assets/dungeons/schema.json (поле ссылки на mobs), pattern поля
состава в assets/mob_groups/schema.json, пин T4 в runes-rename-000318.02 и
visuals-000318.03 (ре-пин ЧЕСТНЫЙ — пины остаются побайтовыми, сообщение
пинует «ДВЕ группы после 000318.04»). assets/mobs/schema.json 0-diff (у
mobs нет поля-ссылки). Ссылочные counter-пины НЕ двигались: переименование
не меняет ЧИСЛО ссылок (24/21 и общие счётчики).

## 4. Syncs / потребители

* sync-mob-groups-data.js, sync-dungeons-data.js: фильтр — ЧЕРЕЗ
  ./lib/json-ref.js (SHAPE_BASENAME_RES[ASSET_NAME_SHAPES.<cat>]) + явное
  исключение schema.json (slug-regex матчит его — грабель .02/.03, повторён
  во ВСЕХ тестовых фильтрах: assets-schemas, mob-groups, dungeon, combat,
  npc-data, cave-tiles-000294, reagents-000220, craft-scroll-sources,
  index-order ×2, mob-art, sprites, sprites mobJsons/WALL_AUTOTILES);
  сортировка по id; шапки/сообщения — slug-формулировки; зеркало — id-форма
  (резолюция ссылок mobs в id как раньше — значение id не менялось ⇒
  данные зеркал цёлы).
* gen-mob-art.js: фильтр каталога mobs — тоже через реестр (не \d{6}).
* src/dungeon.js — только комментарий пути.
* tmp-харнессы (T6 нового теста, dungeon.test.js loadDungeonCatalog):
  копировать scripts/lib/{json-ref,write-atomic}.js — MODULE_NOT_FOUND
  грабель .01–.03.

## 5. Ре-пины (честные) и нетронутые ловушки

Новый tests/mobs-mobgroups-dungeons-rename-000318.04.test.js (T1 ростеры/
таблицы/id-множества, T2 позиционные зеркала + notDeepEqual(lex,id) стражи
+ запись ≡ резолвленному каталогу, T3 ровно 24+21 slug-ссылок, isRef/
resolveRef, numeric-ссылок 0, items/buildings остаются number, T4 побайтовый
REF_RE + таблица истинности, T5 grep-пины syncs, T6 tmp-дерево → распарсенный
tmp ≡ закоммиченному зеркалу).
Ре-пины: assets-renames-000318 (SHAPES_EXPECTED += 3 slug; NAME_OF +=
таблицы mob_groups/dungeons; RN1/RN4/RN5), assets-refs (AR1/AR2/AR4/AR10/
AR11/AR12), assets-schemas (PIN-сеты slug-имён для 3 каталогов + анти-вакуум
guard), mob-groups.test (каталог-файлы через реестр, таблица, R1/R3, ярлыки
зеркала), dungeon.test (каталог-фильтр+сортировка по id, S3/P1/P2/DUN_REF_*/
lookups — slug; исторические комментарии leave), combat.test (mobFiles,
GROUP_RECIPES по id, литералы abomination/orc_warrior), sprites.test
(COMBAT_BG_DUNGEON и DUNGEON_FLOOR_FRAMES — цикл по РАЗОБРАННЫМ записям,
отсортированным по id; set-пин 5 имён; mobJsons/WALL_AUTOTILES через реестр;
в циклах подписи по data.id — `f` в них больше нет), npc-data, cave-tiles-000294,
reagents-000220 (T1_TABLE), craft-scroll-sources (SRC-2/SRC-3), index-order
(×2 dfiles + фикстура), mob-art, spells (заголовок W-08 не менялся; ре-пин
только заголовка stone_golem/bone_coloss wording в spells.test), spec-000251-wording
(W5 needles), runes-000318.02 T4 / visuals-000318.03 T4 (REF_RE-пин).
Spec: spec/MOBS.md, spec/mob-groups-storage.md, spec/dungeons-storage.md —
line-neutral (199/64/247 строк сохранены).
НЕ потребовали ре-пина: spec-split (число файлов spec/ не менялось), счётчики
ссылок 000211-серии (число ссылок то же), portraits-ветки, combat MOB_TYPES
(id моба = строка и раньше — ключи не двигались).

## 6. Мутации (поверх закоммиченной реализации, git restore; матрица в
tasks/result/000318.04.md)

* M1 сортировка syncs обратно по имени файла + перегенерация → зеркала
  сдвигаются (25 и 30 строк), красные: mob-groups «зеркало ≡ JSON …
  позиция = id−1» + T2 (страж lex≠id). Замечание: тесты sprites/dungeon
  читают КАТАЛОГ (сортировка по id в самом тесте), а не зеркало — M1 бьёт
  по зеркальным позиционным пинам.
* M2 вернуть ОДНУ ссылку mob_groups в numeric-форму → sync exit 1
  (fail-closed isRefPath, «не ссылка на файл mobs») + T2/T3/T6 +
  mob-groups «зеркало ≡ JSON».
* M3 ручная правка src/dungeons-data.js → sync:check exit 1 (после restore 0).

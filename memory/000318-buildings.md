# 000318.06 — buildings → slug: ростер, решения, ловушки

Дочерняя 000318.06 (родитель tasks/pending/000318.md). 55 файлов
`assets/buildings/000NNN.json` → `<slug>.json` (git mv R100, контент
0-diff) + пересылка 750 referrer-JSON (1045 вхождения: craft 543 файла/
725, spells 169/280, npc 33/35, dungeons 5/5 — ре-пин после ре-базы на
000320.15: Пергамент assets/npc/000033.json → magic_shop.json) + флипа реестра
`ASSET_NAME_SHAPES.buildings = 'slug'` (ОДНО слово в
scripts/lib/json-ref.js) + перегенерация зеркала `src/buildings.js`.

## 1. Ростер id→slug (носители: этот файл,
## tests/buildings-rename-000318.06.test.js, NAME_OF в assets-renames)

1 weapons_shop, 2 armor_shop, 3 apothecary, 4 magic_shop,
5 wanderer_shop, 6 universam, 7 arena, 8 blacksmith, 9 gladiator_yard,
10 archery_range, 11 academy, 12 hunting_estate, 13 gymnasium,
14 gladiator_camp, 15 bathhouse, 16 library, 17 alchemy_lab,
18 mage_tower, 19 monastery, 20 elders_hut, 21 healing_temple,
22 tavern_school, 23 theater, 24 town_hall, 25 npc_house,
26 healer_house, 27 scribe_house, 28 merchant_house, 29 hermit_hut,
30 orc_pagan_house, 31 cave_entrance, 32 crypt, 33 castle_ruins,
34 flooded_cave, 35 abyss, 36 temple, 37 moon_temple,
38 mountain_temple, 39 abandoned_temple, 40 rune_stone,
41 teleport_circle, 42 obelisk, 43 magic_circle, 44 tavern, 45 well,
46 watchtower, 47 camp, 48 ruins, 49 fountain, 50 bridge_gate,
51 city_51, 52 city_52, 53 city_53, 54 city_54, 55 storage.

ИМЯ — ГИБРИД (NAME_OF в tests/assets-renames-000318.test.js):
29 записей (1,2,3,4,7,8,10,11,25,31,36–49,51–55) — basename поля
«спрайт»; 26 без «спрайт» — таблица выше. ПРЕМИССА ТЗ «55 уникальных
спрайтов» ЛОЖНА: «спрайт» ровно у 29 (факт 000211.07/000265 — 29 из 55).
Иконки `assets/building-icons/0000NN.svg` (26, имя по id) и
`assets/sprites/buildings/*.svg` — 0-diff, НЕ переименовывались.
Иконки: 26 numeric + 53 спрайт-svg; уникальность иконок — по 55 записям
(29 ссылаются на спрайт-путь, T9 в .06-тесте).

## 2. REF_RE и schema-носители (перевёрнуты в том же коммите)

Текущий REF_RE source: `^assets\/(items|skills|craft|npc)\/\d{6}\.json$`
`|^assets\/(spells|mobs|mob_groups|buildings|dungeons)\/[a-z][a-z0-9_]*\.json$`
(pin AR11 byte; побайтовые дубли — в тестах .02/.03/.04/.05). Носители
pattern: assets/skills/schema.json (главный рантайм-носитель REF_RE —
сверяется с живым source), assets/dungeons/schema.json (UNION из 4
composites), «здания»/«постройка» в craft/spells/npc schema.json.

СЛЕДСТВИЕ флипа: numeric-путь `assets/buildings/000NNN.json` больше НЕ
ref — isRef ложен ⇒ свипы AR8/AR9 (реф-целостность) его НЕ видят.
Guard'ы возврата к numeric: только перевёрнутые pattern'ы схем (данные
с numeric-ссылками падают на валидации) + zero-sweep T5 в
buildings-rename-000318.06 (assets/src/scripts/index.html — numeric-
имён зданий нет нигде). Намеренные негативы в тестах собираются
КОНКАТЕНАЦИЕЙ (`'assets/buildings/' + '000054' + '.json'`), чтобы
zero-sweep их не ловил.

## 3. Зеркало src/buildings.js — блок BUILDINGS (НЕ buildings-data.js!)

Сортировка sync-buildings-data.js — по `data.id` (лекс slug ≠ id-порядок;
компаратор обязателен, иначе 55 comment-строк перемешиваются вместе с
записями). Итог: 635 non-comment строк GENERATED-блока бит-в-бит
(игла в .06 T7: non-comment строки блока ≡ прежним), изменились только
`// <file>.json` comment-строки. Referrer-зеркала src/craft-data.js,
src/spells-data.js, src/npc-data.js — 0-diff (хранят РАЗРЕШЁННЫЕ int
id: resolveRef читает data.id цели, для slug-каталога basename ≠ id).
Порядок записей не менялся ⇒ рантайм/rng/golden не тронуты,
CHANGELOG БЕЗ буллета (rename без смены визуала/геймплея).

## 4. Ловушки

* slug-regex `^[a-z][a-z0-9_]*\.json$` МАТЧИТ schema.json — исключать
  ЯВНО во всех фильтрах (sync-buildings-data, sync-npc-data, все тесты;
  прецедент 000318.02).
* sync-npc-data.js buildRefMap — ГЛАВНАЯ ЛОВУШКА: строил map
  numeric-базнейдов для ВСЕХ каталогов ⇒ для slug-buildings ссылки
  перестали бы резолвиться. Починен shape-aware
  (`SHAPE_BASENAME_RES[ASSET_NAME_SHAPES[name]]` + исключение schema.json).
* Тесты с tmp-деревьями обязаны копировать ОБА файла lib
  (write-atomic.js + json-ref.js) — sync-npc теперь требует json-ref
  (MODULE_NOT_FOUND прецедент 000208).
* Тесты, читающие каталог зданий по «номер файла = id»
  (`parseInt(f,10)`/`padStart(6)`/`/^\d{6}\.json$/`) — переведены на
  slug-фильтр + ключ data.id: buildings.test.js (хелперы
  buildingsFiles_00031806/buildingsRawById_00031806/
  buildingFileById_00031806 — образец), assets-schemas (SLUG_PINNED_000318
  += фикс. сет 55 имён), building-icon, cities (catalogAll), craft/
  spells (BUILDING_IDS + REF_BUILDINGS + tmp-фикстуры: имя файла-цели =
  slug), dungeon (биекция пещеры 31..35), npc-data (REF_MAPS +
  BUILDINGS_RAW), sprites (SP-B1), items (SHOP_MAP_INDEX_TO_FILE +
  campRec), shop-selltype-buyahead-000316 (campRec), npc-000320.02–.14
  (по одной readJson-строке на файл: weapons_shop/armor_shop/apothecary),
  spells-any-party (buildingJson — собирал имя padStart-ом, вне свипа
  литералов; починен сканом по data.id — поймано только полным прогоном).
* M-sweep referrer-ов — ЖИВОЙ ФОРМУЛОЙ (через isRef/REF_RE после флипа),
  НЕ фикс-списком; неизвестные numeric-ссылки (npc-refs негатив
  `assets/buildings/000099.json`, id ∉ ростер) — обрабатывать вручную
  (→ конкатенация `'camp99'`).
* spec/buildings-storage.md — Δ0 (45 строк, pin spec-split НЕ двигать):
  naming-буллет → `<slug>.json` + «`id` … уникально в каталоге (не номер
  файла)». spec/buildings.md 0-diff (только номера задач). spec/runes.md:47
  — устаревший numeric-naming руны, 0-diff по решению 000318.02.
* sync:check на грязном дереве транзиентно красен (конвенция W-08) —
  сверять = 0 на чистом ПОСЛЕ коммита.

## 5. Матрица мутаций (факт по TAP /tmp/00031806-m*.tap; база среза
## 13 файлов = 634/634/0, /tmp/00031806-baseline-slice.tap)

M1 sync сортирует по имени → 5 (.06 T6/T7, sync идемпотентность,
000148.03 R1 — позиционный контракт BUILDINGS, W-08); M2 misnamed
city_51→city51 (файл БЕЗ ссылок — изолирует нарушение имени) → 6
(RN2 NAME_OF, ростер assets-schemas, .06 T1/T7, sync, W-08); M3 реестр
обратно 'number' → 33 (AR2/AR4/AR8–AR11, RN1/RN2, схемы, ВЕСЬ .06 T1–T9,
sync всех четырёх, W-08, CLI-drift); M4 убрать исключение schema.json →
5 (.06 T6/T7, sync, W-08, CLI); M5 одна numeric-ссылка в craft-рецепте →
10 (.06 T5 zero-sweep, assets-schemas ×2, craft ×5, W-08, CLI) — AR8 при
этом ЗЕЛЁНЫЙ: подтверждение §2 (numeric не ref, guard'ы = схемы+T5);
M6 AR11 на прежний literal → РОВНО 1 AR11 (byte-pin не вакуумный).
Приёмка: засчитанный полный прогон 4297/4297/0 exit 0 (первая попытка
4296/1 — пропущенный ре-пин spells-any-party.test.js, хелпер читал
padStart-имя; урок: свип ре-пинов обязан ловить СПОСОБЫ СБОРКИ имени
(`String(id).padStart(6,'0')+'.json'`), а не только литералы
'000NNN.json' — grep по padStart+buildings).

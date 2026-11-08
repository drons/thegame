# 000321.01 — оружие right_hand: 50 предметов (000514–000563)

Первая из 13 дочерних родителя tasks/pending/000321.md (батч предметов по видам).
Сводная таблица батча: memory/000321-items-batch.md (создана здесь).

## 1. Каталог: 50 предметов assets/items/000514–000563.json

- kind `weapon`, slot `right_hand`; подтипы: sword 18 / bow 11 / heavy 12 / staff 9.
- rarity ровно 20/14/10/4/2 (common/rare/epic/legendary/impossible):
  - common 20: copper_short_sword, drill_sword, poacher_dirk, kopis_curved, legion_sword,
    battered_falx, merchant_sword, patrol_sword, lumber_machete, sapling_bow, trade_bow,
    patrol_bow, poacher_bow, yew_longbow, copper_maul, stone_mace, flanged_mace, lumber_axe,
    miner_pickaxe, campaign_maul
  - rare 14: silvered_sword, legion_gladius, arming_sword, rebel_brand, warder_sword,
    silver_inlaid_bow, long_warbow, scout_bow, silvered_mace, storm_maul, siege_axe,
    silver_bound_staff, warden_quarterstaff, vine_staff
  - epic 10: gilded_broadsword, damascus_blade, gilt_war_hammer, thunder_maul, goldstring_bow,
    windfletch_bow, tempest_staff, pyre_staff, hoarfrost_staff, archivist_staff
  - legendary 4: dawnedge_blade, gate_hammer, aurora_bow, starvault_staff
  - impossible 2: fate_cleaver, genesis_staff
- Ровно 1 skill-аффикс на предмет: sword→swordsman, bow→archer, heavy→heavy — строго,
  staff — школы {firelord, icelord, alchemy, runes, scholar} (матрица 000230.03 §6,
  магическая right_hand-часть) + nature (исключение — ниже); amount-полосы по
  редкости common 0.02–0.05 … impossible 0.35–0.42. free_cast — РОВНО 2 эпика:
  tempest_staff → hurricane, pyre_staff → wall_of_fire (аффикс {type:'free_cast',spell}).
- **Исключение nature для посохов (раунд 3; оформление по прецеденту D8 forge@tool).**
  Матрица 000230.03 §6 не содержит nature в группе right_hand. На диске существует
  школа «Природа» (assets/skills/000042 — «урон и бафы природы, контроль, создание и
  призыв»), и из заклинательных школ она единственная без своего школьного
  вторичного навыка-мастера (firelord↔fire, icelord↔ice); тематические посохи
  волны аффиксятся вторичным id nature (000031 «Сердце природы», foodPowerMult —
  sheet.affixSkillsFor не фильтрует аффиксы по слоту, бонус рабочий). Три посоха
  с nature: tempest_staff (free_cast hurricane — спелл школы «природа»),
  genesis_staff (создание/призыв — тема школы дословно), warden_quarterstaff
  (ясеневое древко — живое дерево). Побочный эффект — покрытие nature в equip
  раньше волн колец; целью не являлось. T2 пинит множество ЯВНО
  (STAFF_SKILLS_00032101) + равенство аффикса колонке ростера; ветка
  «любой навык каталога» для staff удалена.
- УНИКАЛЬНЫЕ описания (sweep по всем описаниям каталога). БЕЗ base_price/set/tier
  (цена — вычисляемая, сеты — не в этом виде).
- Поля items JSON — англоязычные: `affixes:[{type:'skill',skill,amount}]`;
  free_cast — аффикс-объект, НЕ поле верхнего уровня (подводный камень замера).
- Иконки: 50 flat-SVG 64×64 assets/sprites/items/<id>.svg (паттерн 000302/000335,
  имя — id, НЕ номер; пин tests/svg.test.js 'sprites/items' 480 → 530).

## 2. Рецепты assets/craft/000420–000469.json (50)

- типы: кузнечное_дело 30 / зачарование 15 / столярное_дело 5;
- здания: common-smith [8] — 15 (обычное/простое), [8,25] — 15 (rare+ кузнечные),
  carp [5] — 5, ench [18] — 15;
- у всех 15 зачарований `заклинания` ≥1 (поле-массив ID спеллов — схема требует
  pattern ^[a-z][a-z0-9_]*$ в assets/craft/schema.json, НЕ пути assets/spells;
  все 15 новых и прежние рецепты — ID-форма; проверка «≥1 заклинание» = поле,
  НЕ навыки);
- навыки зачарований: 000027 runes во всех 15 + второй по тематике
  (15 рецептов × 2 навыка = +65 skill-ссылок батча);
- уровень — по пину RARITY_LEVEL_RANGE_00023008 (tests/craft.test.js:1158 — факт
  кода; в src/loot*.js такой константы НЕТ; диапазоны common [1,10] / rare
  [10,30] / epic [30,60] / legendary [60,90] / impossible [90,100]; наши
  рецепты попадают: common 2–8, rare 13–22, epic 36–48, legendary 68–74,
  impossible 96–97);
- «база» — существующий улучшаемый предмет (паттерн 000230.11) только где требуется
  схемой улучшения; исходники — существующие реагенты/материалы (НОВЫХ реагентов НЕ
  создавали — 38 вида reagent целы).
- Зеркала: node scripts/sync-items-data.js + npm run gen:craft в ТОМ ЖЕ коммите;
  sync:check зелёный только на чистом дереве ПОСЛЕ коммита (W-08).

## 3. Пулы дропа — append-only

НОВЫЕ id ДОПИСАНЫ КОНЦОМ каждого тира EQUIP_POOLS (src/loot-equip-data.js)
в каталожном порядке. RARITY/pickRarityTier/rollVictoryLoot/DROP — 0-diff
(дроп по виду автоматически). Итог пулов: 132/91/67/26/13 (Σ 329 equip-редких;
было 112/77/57/22/11). Сдвиг хвостовых окон тестов: common +20, rare +14,
epic +10, legendary +4, impossible +2 за любым прежним «tail-» блоком
(combat T7: окно колец сдвинулось на n32101 = WEAPONS_TAIL_COUNTS_00032101).

## 4. Golden-пересимуляции (append-only пулы сдвигают floor(r·len))

Все — ЧЕСТНЫЕ пересимуляции живым кодом, seed/соли 0-diff:
- combat N2 (б–д): legendary pool[21] rune_boots → pool[25] starvault_staff
  (floor(0.99·26)=25); S3: epic[floor(0.2691·67)]=deep_breath_robe (было epic[15]
  ember_robe при 57), b → starvault_staff.
- dungeon D-BOSS-2 c1: linen_trousers → travel_boots (floor(0.8092278488911688·132)=106).
- dungeon G2-1 и 000230.12-CH c3: cloth_gloves → fine_gloves
  (floor(0.4499427538830787·132)=59; узкая граница 50/112 → 59/132).
- dungeon 000230.10-CH5: CRYPT c0 clay_crucible → clay_buckler
  (floor(0.6040003078524023·132)=79); RUINS c3 wool_sutan → leather_gown
  (rare-пул 77 → 91: floor(0.2789345800410956·91)=25; RUINS всплыл только после
  починки CRYPT — первая красная маска вторичной, прецедент cities).
- Camp-shop (000095): стоки makeCampShop append-only — ПУЛ 237 → 287 видов
  (72 weapon), старые ключи bit-identical, += новые rng-хвостом:
  items.test.js GOLDEN_CAMP, building-effects A57 (+37), B26 (+24), B27 (+27).
  Формула seed 0-diff.

## 5. Счётные ре-пины (тот же коммит, пересчёт по диску)

- Каталог: 563 файлов (511→563; ПЛЮС schema.json в каталоге — исключать из
  sweep'ов: 564/394 dir entries); weapon 72; rarity-множество 329 (132/91/67/26/13);
  right_hand 75 (weapon sword 18 + bow 11 + heavy 20 + staff 16 + tool 10);
  right_hand-тиры 30/21/15/6/3; affixes 339 skill-аффиксов / 31 навык;
  free_cast 18 (17 epic + 1 legendary), 15 спеллов; count1-навыков 8
  (nature ПОТЕРЯЛ уникальность — warden_quarterstaff/tempest_staff/genesis_staff);
- Craft: 393 рецепта (343→393); типы ПО КАТАЛОГУ: зачарование 141 / кузнечное 107 /
  столярное 80 / резьба_по_камню 53 / алхимия 10 / рунопись 2 (Σ 393); в подмножестве
  rarity-equip (362 — результат предмет с rarity) те же типы дают 137 / 98 / 78 /
  46 / 3 (Σ 362); покрытие 329 (296 — 1 рецепт, 33 — 2);
  ссылки itemRefs 1462 (+203: 50 результатов + 153 исходника), skillRefs 542 (+65),
  buildingRefs 538 (+65 — 15 рецептов [8,25]).
- Файлы ре-пинов: items (тело E9 + шапка-коммент 513→563 — canary 000274 читает
  шапку отдельной регуляркой; шапка обязана быть «N предметов» дословно, падеж
  «563 предмета» ломает canary)/cities/svg/assets-schemas/item-icons-000302.08/item-prices-000322/
  final-repins-000243/i2-message-000243.01/rar-g-heading-000252/craft/
  craft-ui (Кузница 8: 77→107 — +15×[8] +15×[8,25])/craft-ui-learned (здание 25
  кузнечное: 65→80 — +15×[8,25])/spells (W-08 items-data: 513→563)/
  shop-upgrade-assortment-000317 (страж-точка (-5,9)→(-4,9): при +50 оружия
  расширение уровня ПОГЛОЩЕНО потоком 57≡57 — перепикинована, рост каталога
  разрешён комментарием теста)/combat/dungeon/
  building-effects/canon-items-sync-000284.02/spec-000230.16-wording/spec-split +
  канон memory/000230.16-spec-equipment-doc.md (ре-синхрон в том же коммите —
  контракт 000284.01: C1/D/E-блоки ≡ spec, §2 счётчики, §4.2 иглы W7F/W8A/W8C/W8D/W8F;
  notes — ВНЕ backticks; игла — одна строка, обе backticks обязательны).
- spec/items.md +3 строки (описательно, БЕЗ number-пинов) → spec-split
  SPEC_FILE_LINES items.md 400 (финальная база a06a4b3: 397 мастера + наши +3;
  split+pop — НЕ wc -l, items.md без trailing-\n); meta-строка канона 000230.16 —
  строки/байты по финальному диску.

## 6. Подводные камни

- index-shift golden'ов: при append пула floor(r·112)→floor(r·132) меняет предмет
  при НЕизменном r — чинится пересимуляцией ПИНА, никогда seed'ом.
- Тест с несколькими assert в цикле падает на первом — второй golden (RUINS,
  скрытый CRYPT) всплывает только после починки первого: после каждой правки —
  полный перезапуск файла.
- Camp-стоки: JSON-сравнение через JSON.parse(JSON.stringify(...)) — cross-realm.
- dir-файлы assets/items|craft включают schema.json (564/394) — свипы исключают.
- sync:check на грязном src/ отказывается (W-08) — проверять после коммита.
- Именованный срез НЕ покрывает все счётные consumers каталога: рост +50/+50
  покрасил в ПОЛНОМ прогоне craft-ui, craft-ui-learned, spells W-08, шапку E9
  (canary) и страж-точку shop-000317 — для каталожных волн обязателен полный
  прогон, срез по списку файлов задачи недостаточен.
- Страж-точки makeShop (000317-T2) СЛЕПНУТ при росте пула видов: расширение
  уровня попадает на ключ, уже занятый потоком (57≡57) — точка перепикиновывается
  сканом живым кодом, а тест/ослабление не правятся.

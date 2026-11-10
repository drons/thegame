# 000321.03 — волна щитов (shield, left_hand): 000614–000663

Дочерняя .03 родителя tasks/pending/000321.md (сводка — memory/000321-items-batch.md).
Тест-контракт волны: tests/items-shield-000321.03.test.js (ROSTER_00032103 —
источник истины по строкам; этот файл — решения и подводные камни).

## 1. Ростер

50 предметов kind shield, номера подряд 000614–000663, слот РОВНО left_hand у всех
(щит/тарга/буклер — одно семейство, в отличие от 8 слотов брони .02), редкость
РОВНО 20 common / 14 rare / 10 epic / 4 legendary / 2 impossible
(aegis_shield 000662, lastwall_shield 000663). stats.armor — envelope по тирам
(ARMOR_BAND_00032103; якорь — факт старых 12 щитов 000230.13: common 1 / rare 2;
масштаб 000230.08: epic 3, legendary 3–4, impossible 4): common [1,1], rare [2,2],
epic [3,3], legendary [3,4], impossible [4,4]. value/weight — полосы тира
(покрывают факт старых: value common 15–40, rare 60–65; weight старых 0.8–3.0).
По 1 skill-аффиксу на предмет — навык ∈ ЯВНОЕ множество SHIELD_SKILLS_00032103 =
{endurance, golem, hide, breath} (research §6 «left_hand — shield: endurance, golem,
hide, breath» — memory/000230-equipment-research.md:164; урок раунда 3 .01 — ветвь
«любой навык каталога» запрещена, только явное множество; ротация по 4 навыкам
каталожным порядком). amount — шкала research §6 (канон .01/.02): common 0.02–0.05,
rare 0.05–0.10, epic 0.10–0.20, legendary 0.20–0.35, impossible 0.35–0.45.
Факт после волны: epic min 0.10 (carved_shield 000657; был 0.12), legendary max
0.34 (dawnwall_shield 000661; был 0.32) — обе величины ВНУТРИ дизайн-шкалы SPEC;
канон-«факт» полос в memory/000230.16 §2 обновлён по диску (честный ре-пин,
не ослабление).

free_cast — РОВНО 2 epic-аффикс-объекта: bulwark_shield 000652 (epic) → shield_wall,
sentinel_shield 000656 (epic) → iron_bulwark. НЕ поле верхнего уровня (паттерн .01/.02).
Каталог free_cast после волны: 22 (21 epic + 1 legendary), 18 разных спеллов.

## 2. Наборы

- bulwark ПРОДОЛЖЕН (+3 члена, решение ТЗ «продолжить bulwark или новый»):
  новых 3 — bulwark_shield 000652 (epic), ironbulwark_shield 000660 (legendary),
  aegis_shield 000662 (impossible); старых 3 — wooden_buckler 000358 (common),
  horn_shield 000365 (common), iron_round 000372 (rare). Итог 6 членов.
  set_bonus НОВЫХ членов deepEqual существующим: {2:{armor:1}} (SB13/D-03).
- DORMANT зафиксирован ЯВНО (T6): все 6 членов в ОДНОМ слоте left_hand — порог «2»
  неактивируем экипировкой; диск-факт 000230.13 D-07, прецеденты arcane_focus/
  penitent/ember/rime — лестница тиров «для коллекционера», НЕ регресс.
- других новых наборов в волне нет. Итог: 18 наборов / 54 предмета (51 + 3).

## 3. Рецепты 000520–000569

1:1 на предметы (тот же порядок; id рецепта = id предмета; результат — тот же файл).
Тип-состав РОВНО столярное_дело 20 / кузнечное_дело 30 (факт старых щитов 000260–000271:
кузнечное 2 / столярное 10 — масштабировано то же семейство; зачарования/резьбы в волне НЕТ).
Здания: столярка [5] на всех 20; кузнечное rare+ — [8], epic+ — [8,25] (факт старых
щитов: вторая постройка кузнечного). Навыки по типу: dexterity (столярка 20),
forge (кузнечное 30). «заклинания» отсутствуют (не зачарование); «база» НЕ используется
(1:1-диапазон, improved-семантика 000230.11 не нужна). Уровни — полосы
RARITY_LEVEL_RANGE (tests/craft.test.js): common 2–9, rare 11–26, epic 32–52,
legendary 62–80, impossible 94–98. Исходники — ТОЛЬКО старый каталог 000001–000613
(НОВЫХ реагентов НЕ создавали — прецедент .01/.02). «название»/«описание» рецептов
уникальны по каталогу craft; roundtrip-канон (Node JSON.stringify, не Python — §6).

## 4. Пулы дропа

EQUIP_POOLS (src/loot-equip-data.js — данные): id дописаны КОНЦОМ тиров каталожным
порядком: common +20, rare +14, epic +10, legendary +4, impossible +2 → 172/119/87/34/17
(Σ 429). RARITY / pickRarityTier / DROP 50/30/15/4.9/0.1 / rollVictoryLoot — 0-diff,
0 новых RNG (попадание в лут — автоматически по виду/rarity).

## 5. Иконки

50 flat-SVG 64×64 assets/sprites/items/<id>.svg (имя = id, паттерн 000302/000335) —
в ЭТОЙ дочерней (решение ТЗ п.3: >40 — «решение в анализе»; вынесение 000321.03.01 НЕ
понадобилось). ПЕРВЫЙ элемент — тень-эллипс rgba(0,0,0,0.22); только polygon/rect(rx)/
circle/ellipse; без path/use/text/градиентов/stroke=; sha256-уникальны против всех
630 файлов каталога (stroke= остался ровно 46 legacy). Форма — по подвиду
(круглый/каплевидный/буклер/тау-щит) + уникальные детали (шипы, зеркало, насечки,
заклёпки), палитра по редкости как в .02.

## 6. Подводные камни

- Формат JSON-канона: weight 1.0 сериализуется «1» (генератор — Node, JSON.stringify;
  «1.0» от Python ломает roundtrip T1). Проверялось свипом всех 100 файлов (items+craft).
- Имена id — коллизии с диском проверялись ДО генерации (sweep по 613 id + 613 имён +
  описаний, включая броню .02 и оружие .01).
- Сет bulwark DORMANT (один слот) — ассерт T6 фиксирует это ЯВНО, иначе ретро-агент
  завтра напишет «набор сломан».
- Хвосты EQUIP_POOLS двигают floor(r·len)-голдены combat N2/S3 и dungeon — пересимулированы
  ЧЕСТНЫМ прогоном (seed/соли 0-diff, старые ключи bit-identical, новые rng-хвостом).
- Универсам cities SHOP_GOLDEN (wealth 3 = allItems): += 42 щита rng-хвостом в ключ
  «100,-40,7,5,44,3» (511 → 553 ключей; seed byte-identical; 8 щитов в ролл не попали —
  rattan_buckler, stitched, antler, riveted, crown, thorn, garrison, sentinel).
  Camp-стоки/ARMOR_SHOP щитов НЕ видят (вид shield ∉ их виды) — GOLDEN_CAMP 0-diff.
- CANON memory/000230.16: C1/D/E-блоки побайтовать с обновлённым spec/items.md
  (канарейка canon-items-sync-000284.02); счётчики §2 и полосы amount — по диску;
  иглы §4.2 ≡ константам tests/spec-000230.16-wording.test.js. Регулярки T6 канона
  завязаны на ФОРМУ текста §2 — при смене формулировки («left_hand/ring — вектор»
  → раздельные left_hand/ring, «51 предмета» → «54 предмета», «20 предметов =» →
  «22 предмета =») ре-пинятся сами тесты в том же коммите.
- spec/items.md БЕЗ trailing newline; specLines = split('\n')+pop('') = 450 (было 443).

## 7. Ре-пины (пересчёт по диску, честные)

Счётчики: items.test.js (каталог 663, rarity-множество 429, GOLDEN_CAMP не тронут),
items-weapon-000321.01 / items-armor-000321.02 (каталог 663; у armor — ещё заголовок
T7 «630 иконок»), final-repins-000243, i2-message-000243.01, rar-g-heading-000252
(663; «прочие 224» НЕ двигался — у щитов есть slot), assets-schemas (663/493/иконки),
item-icons-000302.08 (630), svg.test.js (580→630), item-prices-000322, craft.test.js
(493+полосы), craft-ui / craft-ui-learned, spells.test.js (W-08 items-data 613→663),
ui.test.js, index-order, combat.test.js (голдены N2/S3), dungeon.test.js, cities.test.js
(гоldenUniversam += 42). Spec: spec/items.md описательно (+7 строк), spec-split.test.js
(items.md 443→450), spec-000230.16-wording (W7A 54, W7F 22, W8A 429/663/щиты, W8C пулы
429, W8F 429), canon-items-sync-000284.02 (c4 split left_hand/ring, c5a «предмета»,
c10c «предмета», c10f полосы amount). НЕ потребовали ре-пина: loot-e2e/camp-placement
(формула, не литералы), shop-point-stock-000319, shop-upgrade-assortment-000317,
building-effects (A60 — NPC), NPC/rename-кластеры 0-diff.

## 8. Мутации

(матрица — tasks/result/000321.03.md; поверх закоммиченной реализации, git restore,
финальное дерево чистое) — M1 дубль id (000615←000614) → T1,T2,T9; M2 сдвиг
rarity 000614 common→rare → T2,T3,T5,T9 + canon-sync T6,T7,T9 (amount 0.03
выпал из rare-полосы — сработала и шкала T5); M3 добавление «база» в рецепт
000520 → ТОЛЬКО T8 (схема «база» допускает — отсутствие пинует только волновой
тест); M4 дрейф зеркала (value splint_shield в items-data) → T9 + sync:check
exit 1; M5 удаление предмета 000630+иконка → 9/10 красных (зелёный T8);
M6 третий free_cast 000653 → T2,T5,T9 + canon T7 (T10 пинует free_cast по
зеркалу — без регенерации зелёный); M7 set_bonus bulwark_shield ≠ существующим
→ T6,T9; M8 stroke= в иконку → T7 + T10 (stroke legacy 46→47; svg.test и
item-icons-000302.08 — зелёные, strokes-иглы для новых файлов у них нет).

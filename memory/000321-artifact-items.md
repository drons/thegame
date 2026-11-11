# 000321.04 — волна артефактов (000664–000713): контракт и решения

Дочерняя tasks/done/000321.04.md (4-я из 13 родителя tasks/pending/000321.md).
Вид artifact, слот РОВНО left_hand (щит/артефакт одним слотом — research §6).
Тираж 50 = 20/14/10/4/2 (common/rare/epic/legendary/impossible — пропорция батча).

## Ростер (id | name | rarity | set | armor | free_cast)

| № | id | имя | rarity | set | armor | free_cast |
|---|---|---|---|---|---|---|
| 000664 | bone_charm | Костяной оберег | common | | | |
| 000665 | ash_charm | Зольный оберег | common | | | |
| 000666 | reed_charm | Камышовый оберег | common | | ARM | |
| 000667 | pebble_charm | Галечный оберег | common | | | |
| 000668 | tin_charm | Оловянный оберег | common | | | |
| 000669 | shell_charm | Ракушечный оберег | common | | | |
| 000670 | straw_idol | Соломенный идол | common | | | |
| 000671 | flint_idol | Кременевой идол | common | | | |
| 000672 | bark_idol | Корьяной идол | common | | | |
| 000673 | dew_fetish | Росный фетиш | common | | | |
| 000674 | bone_fetish | Костяной фетиш | common | | | |
| 000675 | amber_bead | Янтарная бусина | common | | | |
| 000676 | jet_bead | Гагатовая бусина | common | | | |
| 000677 | resin_bead | Смолистая бусина | common | | | |
| 000678 | salt_eye | Соляной глаз | common | | | |
| 000679 | moss_eye | Мховой глаз | common | | | |
| 000680 | clay_lens | Глиняная линза | common | | | |
| 000681 | wood_lens | Деревянная линза | common | | | |
| 000682 | wool_tassel | Шерстяной султан | common | | ARM | |
| 000683 | hide_tassel | Кожаный султан | common | | ARM | |
| 000684 | ember_bead | Тлеющая бусина | rare | | | |
| 000685 | frost_bead | Морозная бусина | rare | | | |
| 000686 | rune_stone | Рунный камень | rare | | | |
| 000687 | scholar_lens | Линза учёного | rare | | | |
| 000688 | hawk_eye | Ястребиный глаз | rare | | | |
| 000689 | seer_stone | Камень провидца | rare | | | |
| 000690 | cinder_charm | Пепельный оберег | rare | | ARM | |
| 000691 | rime_charm | Инейный оберег | rare | | ARM | |
| 000692 | ward_stone | Обережный камень | rare | | | |
| 000693 | ink_tablet | Чернильная дощечка | rare | | | |
| 000694 | watch_stone | Дозорный камень | rare | | | |
| 000695 | spark_totem | Искрящийся тотем | rare | | | |
| 000696 | chill_totem | Студящий тотем | rare | | | |
| 000697 | glass_eye | Стеклянный глаз | rare | | ARM | |
| 000698 | runeglass | Руническое стекло | epic | | | |
| 000699 | prism_focus | Призматический фокус | epic | arcane_focus | | |
| 000700 | ward_prism | Обережная призма | epic | | ARM | |
| 000701 | seer_monocle | Монокль провидца | epic | | | |
| 000702 | ember_core | Углевое ядро | epic | | ARM | |
| 000703 | frost_core | Морозное ядро | epic | | | |
| 000704 | mind_lattice | Решётка разума | epic | | | shroud |
| 000705 | flame_sigil | Печатка пламени | epic | | | |
| 000706 | ice_sigil | Ледяная печатка | epic | | ARM | chill |
| 000707 | rune_tablet | Рунная дощечка | epic | | | |
| 000708 | archmage_eye | Око архимага | legendary | | ARM | |
| 000709 | arcane_diadem | Венец тайн | legendary | arcane_focus | ARM | |
| 000710 | star_compass | Звёздный компас | legendary | | | |
| 000711 | sun_reliquary | Солнечный реликварий | legendary | | | fire_aura |
| 000712 | arcane_nexus | Арканный узел | impossible | arcane_focus | ARM | |
| 000713 | crown_of_ages | Корона веков | impossible | | | meteor |

## Решения (зафиксированы тестами tests/items-artifact-000321.04.test.js T1–T10)

- **Set — ПРОДОЛЖЕНИЕ arcane_focus +3** (prism_focus epic / arcane_diadem
  legendary / arcane_nexus impossible), set_bonus новых членов deepEqual
  существующим {2:[{skill:runes,0.05}]} (SB13). ГЛАВНЫЙ ПОДВОДНЫЙ КАМЕНЬ:
  все 5 членов arcane_focus в ОДНОМ слоте left_hand — порог «2» DORMANT
  (неактивируем); закреплён ЯВНО в T6 как лестница тиров, НЕ регресс
  (прецеденты bulwark .03, arcane_focus-исток 000230.13, penitent).
  НОВЫХ наборов нет; итог 18 наборов / 57 предметов.
- **stats.armor — 12 из 50** (решение анализа: «у части», факт старых 3/13;
  итог left_hand 125 = shield 62 + artifact 63, у 15 из 63 armor).
- **free_cast — РОВНО 4** (ТЗ «1–2» — минимум; epic+): mind_lattice →
  shroud, ice_sigil → chill (epic), sun_reliquary → fire_aura (legendary),
  crown_of_ages → meteor (impossible). ОБЪЕКТ В МАССИВЕ affixes
  ({type:'free_cast',spell}), НЕ поле верхнего уровня (паттерн .01/.02).
- **Skill-аффиксы** — навык ∈ ЯВНОЕ ARTIFACT_SKILLS_00032104 =
  {firelord, icelord, runes, scholar, perception, precog} (1 аффикс на
  предмет; amount по шкале .01–.03; ветвь «любой навык» запрещена уроком
  раунда 3 — прецедент .01/.03).
- **Рецепты 000570–000619**: 1:1 на артефакты, id = id результата, тип
  РОВНО «зачарование» (факт вида артефактов), здания [000018], 2 навыка
  [runes 000027 + навык-аффикс результата] (runes-аффикс → scholar; «зачарование» — ТИП,
  навыка enchanting в assets/skills НЕТ — запинено T8), исходники ∈ СТАРЫЙ каталог
  (НОВЫХ реагентов нет — решение анализа), «база» НЕ используется
  (1:1-диапазон), уровень ∈ полосы RARITY_LEVEL_RANGE результата.
- **Иконки — В ЭТОЙ дочерней** (50 flat-SVG 64×64, имя = id; вынос
  000321.04.01 НЕ понадобился).
- **EQUIP_POOLS** (src/loot-equip-data.js, данные): id дописаны КОНЦОМ
  тира каталожным порядком → 192/133/97/38/19 (Σ 479). DROP/pickRarityTier/
  rollVictoryLoot 0-diff.
- Имена/описания уникальны свипом по каталогу 713; у несето нет
  base_price/set/tier; roundtrip-канон stringify(…,2)+'\n'.

## Ре-пины и golden (итоговые счётчики)

items 713; craft 543; иконки sprites/items 680 (rarity-с-иконой 479);
rarity 479; slot у 489; base_price 41; free_cast 26 (23 epic +
2 legendary + 1 impossible, 22 разных спеллов); craft «зачарование» 206;
spec/items.md 458 строк / 39172 байт. Golden-пересимуляции ЧЕСТНЫЕ
(seed/соли 0-diff): cities universam += 45 артефактов, makeShop
WEAPONS_SHOP += 42, combat N2 (legendary-хвост pool[37]=sun_reliquary),
S3 (epic[26]=gold_gloves, pool[37]=sun_reliquary), T7 пулы 192/133/97/
38/19; dungeon D-BOSS-2→pine_shield, G2-1/CH→wood_ring, CH5 CRYPT→
kopis_curved, RUINS→quiver_gloves; GOLDEN_CAMP 0-diff.
Канон memory/000230.16 ре-синхрон в том же коммите (контракт 000284.01):
§2 счётчики, C1/D/E блоки — вербатим-копия свежего spec, §4.2 иглы
W3/W7A/W7F/W8A/W8C/W8F (игла ⊆ norm(spec) — внимание: в spec перенос
строки после «глаза/» даёт «глаза/ линзы» — игла/константа обязаны
совпадать с norm-формой); c4-ассертов в canon-sync-тесте хардкорный
вектор left_hand += ещё один +20/14/10/4/2 (ре-пин .04 — 50/35/25/10/5).

## Подводные камни для 000321.05+

- craft.test.js R2 анти-вакуум: item 1966 / skill 757 / building 725
  (дельта .04: +139/+100/+50 — зачарование ×2 навыка ×[18]); R13-цепочка
  дельт — ре-пин построчно.
- W-08 (spells.test.js) sync:check красный на ГРЯЗНОМ дереве — конвенция,
  зелёный только на чистом после коммита.
- Артефакты падают в universam-магазин (богатство 3) — SHOP_GOLDEN ключ
  cities пересимулирован; в камповые стоки и ARMOR_SHOP вид не попадает.
- Следующей волне left_hand НЕ бывать без пересчёта слот-сводки
  «left_hand 125 = shield 62 + artifact 63» в spec/каноне.

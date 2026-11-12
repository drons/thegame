# 000321.06 — волна колец (000765–000814): контракт и решения

Дочерняя tasks/done/000321.06.md (6-я из 13 родителя tasks/pending/000321.md).
Вид ring, слот РОВНО ring (первый свободный из 8 — 000230.02). Тираж 50 =
20/14/10/4/2 (common/rare/epic/legendary/impossible — пропорция батча).

## Ростер (id | имя | rarity | set | аффикс-навык)

| № | id | имя | rarity | set | аффикс |
|---|---|---|---|---|---|
| 000765 | tin_band | Оловянный ободок | common | | step |
| 000766 | antler_band | Олений ободок | common | | back |
| 000767 | woven_ring | Плетёное кольцо | common | | endurance |
| 000768 | amber_disc | Янтарный диск | common | | merchant |
| 000769 | glass_band | Стеклянный ободок | common | | catseye |
| 000770 | resin_ring | Смоляное кольцо | common | | acro |
| 000771 | wire_ring | Проволочное кольцо | common | | thief |
| 000772 | sinew_knot | Сухожильный узел | common | | hide |
| 000773 | pumice_ring | Пемзовое кольцо | common | | perception |
| 000774 | fluorite_seal | Флюоритовая печать | common | | orator |
| 000775 | smoky_signet | Дымчатый перстень | common | | breath |
| 000776 | pebble_ring | Галечное кольцо | common | | artist |
| 000777 | flint_ring | Кремнёвое кольцо | common | | archer |
| 000778 | bronze_loop | Бронзовый ободок | common | | fists |
| 000779 | cast_iron_ring | Чугунное кольцо | common | | heavy |
| 000780 | brass_signet | Латунный перстень | common | | swordsman |
| 000781 | blackened_band | Воронёный ободок | common | | accuracy |
| 000782 | forge_washer | Кузнечная шайба | common | | forge |
| 000783 | etched_seal | Травлёная печать | common | | alchemy |
| 000784 | chief_signet | Начальственный перстень | common | | leader |
| 000785 | garnet_band | Гранатовый ободок | rare | | elder |
| 000786 | jade_signet | Нефритовый перстень | rare | | golem |
| 000787 | moon_setting | Лунная оправа | rare | moonlight | meditation |
| 000788 | tide_knot | Приливный узел | rare | tide | breath |
| 000789 | serpent_signet | Змеиный перстень | rare | | scholar |
| 000790 | dread_seal | Ворожбина печать | rare | | fright |
| 000791 | thorn_band | Терновый ободок | rare | | nature |
| 000792 | windwalker_ring | Ветроступ | rare | | step |
| 000793 | hawk_eye_ring | Кольцо ястреба | rare | | catseye |
| 000794 | blade_braid | Клинковая лента | rare | | swordsman |
| 000795 | whetstone_ring | Оселковый перстень | rare | | accuracy |
| 000796 | umbral_band | Тенистый обруч | rare | | hide |
| 000797 | marksman_loop | Дальнобой | rare | | archer |
| 000798 | trade_seal | Товарная печать | rare | | merchant |
| 000799 | rune_alloy | Рунный сплав | epic | | runes |
| 000800 | ash_band | Пепельный обод | epic | | firelord |
| 000801 | silver_frost | Иней на серебре | epic | | icelord |
| 000802 | icewalker | Ледоход | epic | | endurance + free_cast frost_walk |
| 000803 | clay_warden | Глиняный страж | epic | | golem + free_cast aegis |
| 000804 | ink_signet | Чернильный перстень | epic | | scholar |
| 000805 | root_braid | Корневая оплётка | epic | | nature |
| 000806 | augur_band | Вещий ободок | epic | | precog |
| 000807 | selenite_ring | Лунный селенит | epic | moonlight | meditation |
| 000808 | tidebreath | Дыхание прилива | epic | tide | breath |
| 000809 | moon_crown | Лунный венец | legendary | moonlight | elder |
| 000810 | frost_squall | Ледяной шквал | legendary | tide | icelord |
| 000811 | undying_bough | Бессмертный сук | legendary | | unkill |
| 000812 | forewarning | Предвещание | legendary | | precog |
| 000813 | eclipse_band | Затмение | impossible | moonlight | fright |
| 000814 | caldera_core | Сердце кальдеры | impossible | | firelord |

## Решения (зафиксированы тестами tests/items-ring-000321.06.test.js T1–T10)

- **Skill-аффиксы** — РОВНО 1 на предмет; amount 0.03–0.40 — шкала
  старых 25 колец (.14); покрытие — ВСЕ 31 secondary-навык ≥1 (волна
  сознательно затёрла уников: back/merchant/catseye/acro/leader/
  accuracy/unkill/fright получили вторые (третьи) предметы, nature —
  раньше). СЛЕДСТВИЕ: канон memory/000230.16 §2 «ровно по 1 предмету»
  переписан в «0 навыков — пустой список», а якорь c10b в
  tests/canon-items-sync-000284.02.test.js ре-пинут В ТОМ ЖЕ коммите
  (контракт 000284.02): было `(\d+) навыков — ровно по 1 предмету
  \(([^)]*)\)` со сверкой имён, стало `(\d+) навыков — ровно по 1
  предмету` + только счётчик-vs-диск. Все 6 приоритетных навыков
  (.14 §2.2) представлены.
- **free_cast — РОВНО 2 в волне, ТОЛЬКО epic**: icewalker → frost_walk,
  clay_warden → aegis (спеллы НЕ пересекаются со спеллами старых
  колец). Глобально free_cast 28 = 25 epic + 2 legendary + 1
  impossible, 24 разных спелла.
- **Sets — ДВА НОВЫХ набора** (не продолжение старых): moonlight —
  4 кольца rare/epic/legendary/impossible, set_bonus {2:{armor:1},
  4:[skill meditation 0.10]} — паттерн порогов {2,4} как fate; tide —
  3 кольца rare/epic/legendary, {2:[skill breath 0.05], 3:[skill
  icelord 0.08]}. set_bonus ОДИНАКОВ у всех членов (SB13/D-03).
  ГЛАВНОЕ ОТЛИЧИЕ от bulwark/arcane_focus/forger: все члены в ОДНОМ
  kind ring, но слотов колец 8 — пороги ДОСТИЖИМЫ, наборы НЕ DORMANT.
  Итог 20 наборов / 67 предмета; старые 3 набора .14 не тронуты.
- **stats(кроме armor:0)/subtype/base_price/tier/effect/loot — НЕТ** у
  всех 50; stats.armor === 0 у ВСЕХ 75 колец (canon c11g ре-пин
  25→75); value 12–1500 / weight 0.05–0.2 — полосы старых 25 (T4),
  value строго неубывает внутри тира волны.
- **Рецепты 000670–000719**: 1:1 на кольца, результат тем же порядком,
  id рецепта = id результата. Состав: резьба_по_камню 25 (результаты
  000765–000789, уровень 2..20) / зачарование 25 (000790–000814,
  уровень 22..100) — масштаб факта старых базовых рецептов .14
  (15/13). Здания: резьба [rune_stone, ruins], зачарование
  [mage_tower]. Навыки: резьба [runes], зачарование [runes +
  навык-аффикс результата]. «заклинания» РОВНО 1 ∈ assets/spells
  только у зачарования (контракт типа «зачарование ⇒ ≥1»); у
  free_cast-колец заклинание = САМ free_cast (000707 frost_walk,
  000708 aegis — прецедент T9 базовых 25). «база» НЕ используется;
  исходники ∈ СТАРЫЙ каталог (НОВЫХ реагентов нет — прецедент .01–.05);
  «название»/«описание» уникальны по craft.
- **Иконки — В ЭТОЙ дочерней**: 50 flat-SVG 64×64 (assets/sprites/items/
  <id>.svg, биекция json↔svg по basename; паттерн 000302/000335:
  тень-эллипс rgba(0,0,0,0.22) первым элементом, без градиентов/text/
  path/use/stroke=; sha256-уникальны против всех 781). Вынос
  000321.06.01 НЕ понадобился.
- **EQUIP_POOLS** (src/loot-equip-data.js, данные): id дописаны КОНЦОМ
  тира каталожным порядком → 232/161/117/46/23 (Σ 579). ring был в
  пулах с 000230.14 (25 старых) — append легитимен. DROP 50/30/15/
  4.9/0.1, pickRarityTier, rollVictoryLoot 0-diff. Универсам
  (makeShop wealth 3, allItems-пул) видит кольца без правки кода —
  rng-хвост allItems пересимулирован ЖИВЫМ кодом: += 42 кольца
  byte-identical к старым 643 ключам (643 → 685; из 50 колец в срезе
  богатства 3 оказались 42 — остальные 8 не выбраны rng, не дефект);
  ARMOR_SHOP, Оружейная (w<3) и барахолка кампа — НЕ видят.

## Итоговые счётчики и ре-пины

items 814 (ring 75, weapon 72, armor 257, shield 62, artifact 63,
tool 60); rarity 579 = 232/161/117/46/23; craft 643 (equip-виды:
зачарование 240 / кузнечное 164 / столярное 112 / резьба 79 /
алхимия 17, Σ 612 = rarityEquip; покрытие у всех 579: 546×1 + 33×2);
иконки 781; наборы 20 / 67; free_cast 28; слот-таблица ring 75 —
30/21/15/6/3; skill-аффиксы 589 на 31 навык; base_price 44 не вырос;
stroke-frozen legacy 46 иконок цел.

РЕ-ПИНЫ (по финальному диску): tests/items.test.js (счётчики/пулы);
tests/cities.test.js (universam +42 ключа); golden combat/dungeon
(rng-хвост — пересимуляция живым кодом, seed 0-diff);
final-repins-000243, i2-message-000243.01, item-icons-000302.08,
item-prices-000322, spells.test, svg.test, ui.test, assets-schemas;
sibling-файлы .01/.02/.03/.04/.05 (цепочки счётчиков); craft.test;
spec-split (items.md 467 → 477); wording-тест 000230.16 (константы
W7A/W7B2/W7F/W8A/W8C/W8F = НОВЫЕ иглы §4.2, titles/messages);
canon-items-sync (якорь c10b — см. «Решения»).

Канон memory/000230.16 ре-синхрон в том же коммите (контракт
000284.01): §2 c1–c12, C1/D/E вербатим-копии свежего spec, §4.2 иглы;
иглы W8A/W8C/W8F — ПОЛНЫЕ norm'd-спаны spec, перегенерированы
программно из spec-текста (T2 сверяет константы теста с иглами канона
ОБОЮДНО; при reflow буллета — пересоздавать обоим, прецедент «петля/
диск» = norm-пробел после «/»).

## Подводные камни

- Иглы §4.2 нормализуются (spec-переносы): «глаза/ линзы», «молоток/
  наковальня», «петля/ диск», «кузнечное_дело/ резьба» — фиксировать
  norm-форму, не гадать по перенесённому тексту.
- c10b (см. «Решения») — при любом изменении уник-списка ре-пинить
  И канон, и якорь теста в одном коммите.
- Универсамский rng-хвост доснимать ТОЛЬКО живым makeShop (old-keys
  byte-identical проверка), не «на глаз».
- Счётные свипы волны ОБЯЗАНЫ включать canary-файлы вне «очевидного»
  списка (урок .06: полный прогон-1 красным 4 теста, отсутствовавших
  в срезе из 23 файлов): tests/e9-header-canary-000274.test.js
  (regex «E9 (каталог — N предметов» по items.test.js),
  tests/rar-g-heading-000252.test.js (H1-игла «каталог N шт.» по
  заголовку 230.07-RAR-G в ui.test.js),
  tests/item-prices-rarity-000346.test.js T7 +
  tests/scroll-prices-magic-000347.01.test.js T6 (golden-стоки
  universam — при любом росте allItems-хвоста переснимать ОБА
  синхронно: после .06 это 688 ключей / 2124 шт при седах-константах;
  camp 176/257 не двигается без изменения camp-пула).
- Живые числа в ШАПКАХ items.test.js (head-строки): «E9 (каталог — N
  предметов», «прочие 0 предметов — … N с icon» — ре-пинит каждый
  рост каталога вместе с телом (I1-H пин в final-repins-000243
  следует за head); исторические транзакты вида «остальные 646
  ключей стока не сдвинулись» (646 старых + 42 новых = 688) — НЕ
  трогать, это не дрейф.
- CHANGELOG: база содержала только «## 2026-11-12»; буллет волны —
  там же («### Игровой процесс»); при мерже в другую дату оркестратор
  переносит его в секцию фактической даты (прецедент 000358: буллет
  «## 2026-11-12» → «## 2026-11-13» при ре-базе; тесты CHANGELOG.md
  не читают).

# 000321.05 — волна инструментов (000714–000763): контракт и решения

Дочерняя tasks/done/000321.05.md (5-я из 13 родителя tasks/pending/000321.md).
Вид tool, слот РОВНО right_hand. Тираж 50 = 20/14/10/4/2
(common/rare/epic/legendary/impossible — пропорция батча).

## Ростер (id | name | rarity | set | аффикс)

| № | id | имя | rarity | set | аффикс |
|---|---|---|---|---|---|
| 000714 | ash_mallet | Пепельная колотушка | common | | forge |
| 000715 | clay_anvil | Глиняная наковальня | common | | forge |
| 000716 | copper_tongs | Медные клещи | common | | forge |
| 000717 | iron_punch | Железное пробойное | common | | forge |
| 000718 | forge_bellows | Кузнечные мехи | common | | forge |
| 000719 | slag_rake | Шлаковая грабелька | common | | forge |
| 000720 | quench_pail | Закалочное ведро | common | | forge |
| 000721 | cross_file | Надфиль-крестовка | common | | forge |
| 000722 | rawhide_mallet | Сыромятная колотушка | common | | forge |
| 000723 | tin_solder | Оловянная паялка | common | | forge |
| 000724 | clay_funnel | Глиняная воронка | common | | alchemy |
| 000725 | wood_pestle | Деревянный пест | common | | alchemy |
| 000726 | reed_sieve | Тростниковое сито | common | | alchemy |
| 000727 | bark_tray | Лоток из коры | common | | alchemy |
| 000728 | wax_jar | Восковка | common | | alchemy |
| 000729 | linen_filter | Льняной фильтр | common | | alchemy |
| 000730 | salt_scales | Соляные весы | common | | alchemy |
| 000731 | shell_spoon | Ложка из раковины | common | | alchemy |
| 000732 | flint_burner | Огонь-каменка | common | | alchemy |
| 000733 | dew_measure | Росная мерка | common | | alchemy |
| 000734 | steel_chisel | Стальное зубило | rare | | forge |
| 000735 | forge_hook | Кузнечный крюк | rare | | forge |
| 000736 | bronze_bellows | Бронзовые мехи | rare | | forge |
| 000737 | swage_block | Штамп-подкладка | rare | | forge |
| 000738 | iron_drill | Железное сверло | rare | | forge |
| 000739 | forge_stake | Рогач | rare | | forge |
| 000740 | fuller | Валок | rare | | forge |
| 000741 | glass_retort | Стеклянная реторта | rare | | alchemy |
| 000742 | bronze_alembic | Бронзовый алембик | rare | | alchemy |
| 000743 | quartz_muller | Кварцевый мусер | rare | | alchemy |
| 000744 | silver_spatula | Серебряная лопатка | rare | | alchemy |
| 000745 | brass_tongs | Латунные щипцы | rare | | alchemy |
| 000746 | oil_lamp | Жаровня-лампада | rare | | alchemy |
| 000747 | glass_measure | Мерное стекло | rare | | alchemy |
| 000748 | damascus_hammer | Дамасский молот | epic | forger | forge |
| 000749 | great_bellows | Двукрылые мехи | epic | | forge |
| 000750 | forge_hardy | Харди | epic | | forge |
| 000751 | blacksteel_tongs | Черностальные клещи | epic | | forge |
| 000752 | diamond_file | Алмазный надфиль | epic | | forge |
| 000753 | silver_alembic | Серебряный алембик | epic | | alchemy |
| 000754 | glass_athanor | Стеклянный афанор | epic | | alchemy |
| 000755 | silver_retort | Серебряная реторта | epic | | alchemy |
| 000756 | moon_balance | Равновесие | epic | | alchemy |
| 000757 | cinder_lamp | Жар-лампада | epic | | alchemy |
| 000758 | meteor_hammer | Метеорный молот | legendary | forger | forge |
| 000759 | magma_hammer | Магмовая кувалда | legendary | | forge |
| 000760 | golden_athanor | Золотой афанор | legendary | | alchemy |
| 000761 | phoenix_still | Феникс-перегон | legendary | | alchemy |
| 000762 | worldforge_hammer | Молот Мировой Кузни | impossible | forger | forge |
| 000763 | prima_vessel | Сосуд Первоматерии | impossible | | alchemy |

## Решения (зафиксированы тестами tests/items-tool-000321.05.test.js T1–T10)

- **Skill-аффиксы** — РОВНО 1 на предмет, навык ∈ ЯВНОЕ
  TOOL_SKILLS_00032105 = {forge, alchemy} (паттерн iron_hammer; runes у
  3 старых инструментов ЕСТЬ, волной НЕ продолжается — фикс первичен).
  Покрытие РОВНО 25/25, оба навыка в каждом тире
  (10/10 · 7/7 · 5/5 · 2/2 · 1/1); amount по шкале .01–.04.
- **free_cast — РОВНО 0** в волне (факт старых 10 инструментов — 0;
  глобальные 26 не двигаются). Ветвь со «спелл-свободой» для tools —
  не в резерве.
- **Set — ПРОДОЛЖЕНИЕ forger +3** (damascus_hammer epic / meteor_hammer
  legendary / worldforge_hammer impossible), set_bonus новых членов
  deepEqual существующим SB13 {2:[{skill:forge,0.05}]}. ПОДВОДНЫЙ КАМЕНЬ
  (как arcane_focus .04): все 5 членов forger в ОДНОМ слоте right_hand —
  порог «2» DORMANT, закреплён ЯВНО в T6 (лестница тиров для
  коллекционера, НЕ регресс; прецеденты bulwark .03 / arcane_focus .04).
  Итог 18 наборов / 60 предметов; новых наборов нет.
- **stats/subtype/base_price/tier — НЕТ** у всех 50 (факт старых 10 —
  цены вычисляемые); value/weight в тировых полосах, покрывающих факт
  старых 10 (T4). base_price счётчик 44 не вырос (пометка эрраты 000368:
  актуально 202 с `6098d6db` — E1 000347.02 дал base_price=value оставшимся
  158 spell_scroll, влился ПОЗЖЕ этой задачи — факт строки верен на базе
  записи; без base_price — 612 при каталоге 814 с `c0013918`; пересчёт
  свипом assets/items/*.json).
- **Рецепты 000620–000669**: 1:1 на инструменты, id = id результата;
  тип-состав — масштаб факта старых рецептов: кузнечное_дело 23 /
  алхимия 14 / зачарование 13. Здания: кузнечное common/rare [8],
  epic+ [8,25]; алхимия [17]; зачарование [18]. Навыки: кузнечное
  [forge], epic+ [forge,heavy] (факт mithril_hammer), алхимия
  [alchemy], зачарование [runes + навык-аффикс результата].
  «заклинания» РОВНО 1 SLAG-формы только у зачарования; «база» НЕ
  используется (1:1-диапазон); исходники ∈ СТАРЫЙ каталог
  000001–000713 (НОВЫХ реагентов нет — прецедент .01–.04).
- **Иконки — В ЭТОЙ дочерней**: 50 flat-SVG 64×64 (assets/sprites/items/
  <id>.svg, биекция по basename; flat-паттерн 000302/000335: тень-эллипс
  rgba(0,0,0,0.22) первым элементом, без градиентов/text/path/use/stroke;
  sha256-уникальны против всех 730). Вынос 000321.05.01 НЕ понадобился.
- **EQUIP_POOLS** (src/loot-equip-data.js, данные): id дописаны КОНЦОМ
  тира каталожным порядком → 212/147/107/42/21 (Σ 529). tool был в
  пулах с 000230.12 (10 старых) — append легитимен. DROP/
  pickRarityTier/rollVictoryLoot 0-diff. Универсам (makeShop wealth 3,
  пул allItems) видит инструменты без правки кода; ARMOR_SHOP,
  Оружейная (w<3) и барахолка кампа — НЕ видят (вид tool ∉ их виды;
  GOLDEN_CAMP/видовые стоки 0-diff).
- Имена/описания уникальны свипом по каталогу 763; roundtrip-канон
  stringify(…,2)+'\n'; порядок ключей = канон (set/set_bonus только у
  сетовых).

## Ре-пины и golden (итоговые счётчики)

items 763 (tool 60, artifact 63, shield 62, armor 257, weapon 72);
craft 593 (зачарование 219 / кузнечное 173 / столярное 114 / резьба 61 /
алхимия 24 / рунопись 2); иконки sprites/items 730 (с icon 763);
rarity 529 (212/147/107/42/21); slot у 539, «прочих» без slot 224;
base_price 44 (актуально 202 с `6098d6db` — 000347.02 E1; без — 612 при
каталоге 814 с `c0013918`; свип assets/items/*.json — пометка эрраты 000368);
free_cast 26; right_hand Σ 75 → 125 (вектор
50/35/25/10/5); наборы 18 / 60; stroke= legacy 46. spec/items.md 467 строк
(k=N−458=+9) / 39947 байт; spec-split ре-пин. Канон memory/000230.16
ре-синхрон в том же коммите (контракт 000284.01): §2 счётчики, C1/D/E
вербатим-копии, §4.2 иглы; игла tool-списка в ЕДНОЙ строке — перенос
spec после «молоток/» даёт «молоток/ наковальня» — norm-форма с пробелом
(прецедент «глаза/ линзы» .04); орфография в каталоге — «печатки» (НЕ
«печятки» — по ней написаны иглы, опечатка роняет count-паттерны).
c4-ассертов канона: вектор right_hand 30/21/15/6/3 → **50/35/25/10/5**
(волна 000230.12 + оружие .01 + инструменты .05, каждая 10/7/5/2/1 или
20/14/10/4/2), regex c4rh расширен группой «инструменты 000321.05
(5×\d+)» (m[16..20]), ассерт rhv ≡ wave+wpn+tls.

Golden-пересимуляции ЧЕСТНЫЕ (seed/соли 0-diff, сняты живым кодом):
- combat N2: legendary-пул 38 → 42, хвост = star_compass, sun_reliquary,
  **meteor_hammer, magma_hammer, golden_athanor, phoenix_still**;
  pool[floor(0.99·42)=41] = **phoenix_still** (5 литералов).
- combat C6: common 212, select floor(0.01·212)=2 = **leather_cap**
  (wool_cap держался ре-пинами .01–.04, сдвинулся только сейчас).
- combat S3: epic-пул 97 → 107, epic[floor(0.2691·107)=28] =
  **phantom_gloves**; (б) legendary → **phoenix_still**.
- combat T7: размеры пулов 212/147/107/42/21; окно хвостов RING_POOL —
  обе границы сдвинуты на Σ всех хвостовых констант, добавлена
  TOOLS_TAIL_COUNTS_00032105 {20/14/10/4/2}.
- dungeon G2-1/CH: common[floor(0.4499427538830787·212)=95] =
  **traveler_breeches**; CH5 CRYPT: floor(0.6040003078524023·212)=128 =
  **flanged_mace**; RUINS: rare[floor(0.2789345800410956·147)=41] =
  **wind_gloves**; D-BOSS-2 c1: floor(r2·212)=171 = **hidefaced_shield**.
- cities SHOP_GOLDEN '100,-40,7,5,44,3': seed byte-identical, 0 дрейфа
  старых ключей, 598 → 642 ключа — инструменты += **44 из 50**, НЕ
  выпали: ash_mallet, clay_funnel, dew_measure, blacksteel_tongs,
  moon_balance, meteor_hammer.
- wording W6C/W8E — живые факты: каталог 529 (armor 254, weapon 65,
  shield 62, artifact 63, tool 60, ring 25; вне rarity 234, consumables
  224), «дроп — все 529».

## Матрица мутаций (поверх закоммиченного/заитексенного дерева;
`git checkout -- <файл>` возврат из индекса; /tmp/00032105-mN.tap)

| М | мутация | покраснение |
|---|---|---|
| M1 | дубль id (000715 → ash_mallet) | T1,T2,T9 |
| M2 | сдвиг rarity (000714 common→rare) | T2,T3,T5,T9 |
| M3 | аффикс вне {forge,alchemy} (000724 → runes) | T2,T5,T9 |
| M4 | дрейф зеркала (items-data name) | T9 (изолированно) |
| M5 | удаление хвостового 000763.json | T1–T6,T9 (7) |
| M6 | stroke= в иконке ash_mallet.svg | T7,T10 |
| M7 | «база» в рецепт 000620 | T8 (изолированно) |
| M8 | set_bonus drift 000748 (0.05→0.1) | T6,T9 |

После всех возвратов — 10/10 зелёные, worktree ≡ индексу.

## Поглощено из реестра b16 (отложенные фиксы ретро-b15/b16 «при касании»)

- tests/items-artifact-000321.04.test.js: из ряда disk-прецедентов
  «penitent/ember/rime/bulwark» (шапка FOCUS_BONUS_00032104 + T6) убраны
  ember/rime — ложный DORMANT-прецедент: ember = ruby_ring + phoenix_ring,
  rime = glacier_ring + frost_ring — 2-членные КОЛЬЦЕВЫЕ наборы
  (slot=ring), а кольца АКТИВНЫ (EQUIP_PHYS_SLOTS, мощность >1 —
  факт b14 №2), порог «2» достижим; переписаны по факту.
- tests/items-shield-000321.03.test.js T6: удалён мёртвый блок
  `const newIds = members.filter(...); void newIds;` — newIds нигде не
  ассертится (недостигаемая ветка, рекомендация b14); ассерты bulwark
  и DORMANT-слот не затронуты.
- Оба файла касались задачи (счётные ре-пины каталога), фиксы — в этом
  же коммите; объём SCOPE не расширялся.

## Ре-пины craft-UI (полный прогон выявил 3 красных — дофинаны в этом коммите)

- tests/craft-ui-learned.test.js UCL-3: строки здания 25 (кузнечное)
  109 → **115** (+6 кузнечных рецептов волны [8,25]: 000655, 000656,
  000657, 000658, 000664, 000665) — счётчик в имени теста и в ассерте.
- tests/craft-ui.test.js CU-4: рецепты здания 8 (Кузница) 150 → **173**
  (+23 кузнечных рецептов волны, все [8], из них 6 ещё и [25]).
- tests/items.test.js: шапка E9 возвращена к канонической форме
  «763 предметов» — волновая правка «763 предмета» ломала regex
  канарейки tests/e9-header-canary-000274.test.js
  (/E9 \(каталог — (\d+) предметов/ требует именно «предметов»,
  грамматически «некрасивая» форма закреплена контрактом canary-000274).

## Подводные камни для 000321.06+

- M4-грабля: в src/items-data.js полное имя встречается ДВАЖДЫ (name и
  префикс desc) — мутация зеркала бьёт по `name: "…"`, не по подстроке.
- cwd сбрасывается между вызовами bash — только абсолютные пути/`git -C`
  (прецедент merge-ops-absolute-paths).
- W-08 (spells.test.js) sync:check красный на ГРЯЗНОМ дереве — конвенция,
  зелёный только на чистом после коммита.
- Инструменты падают в universam (богатство 3) — SHOP_GOLDEN пересимулирован;
  в камповые стоки/ARMOR_SHOP/Оружейную вид tool не попадает.
- ТЗ-числа (.04-эпохи) устарели — счётчики пересчитывать по диску
  (node-симуляции живого кода), ТЗ-пропорции тиражей — единственные
  неизменные константы батча.

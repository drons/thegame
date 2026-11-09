# 000321.02 — волна брони (armor, 8 слотов): 000564–000613

Дочерняя .02 родителя tasks/pending/000321.md (сводка — memory/000321-items-batch.md).
Тест-контракт волны: tests/items-armor-000321.02.test.js (ROSTER_00032102 —
источник истины по строкам; этот файл — решения и подводные камни).

## 1. Ростер

50 предметов kind armor, номера подряд 000564–000613, слоты (по 7 head/ears/neck/legs/feet,
3 torso, 6 forearms/palms = 50), редкость РОВНО 20 common / 14 rare / 10 epic / 4 legendary /
2 impossible (golem_gauntlets 000599 palms, lostroad_boots 000613 feet — обе impossible).
stats.armor — по околослотовой шкале (тест ARMOR_BAND_00032102): trinket (ears/neck) 0–1,
torso 0–4, feet/palms до 4 (impossible 4). По 1 skill-аффиксу на предмет — матрица
слот→навыки (SLOT_SKILLS_00032102 в тесте): head — perception/precog/meditation/elder/scholar;
ears/neck += orator/artist; torso — endurance/golem/hide/breath/meditation; forearms/palms —
swordsman/archer/heavy/fists/step/thief; legs/feet — step/endurance/hide/breath/golem.
ОТСТУПЛЕНИЕ от матрицы 000230.03 §6 (формулировка — «приоритет», не жёсткий контракт):
ювелирная группа ears/neck РАСШИРЕНА scholar относительно §6 (там ears/neck =
perception/precog/meditation/elder/orator/artist); несут его два предмета — 000580
copper_beads и 000583 warder_pendant (scholar из группы head). Прецеденты того же
класса на диске: 000458 traveler_cloak step@torso (torso — без step) и 000486
mystic_wraps meditation@palms (forearms/palms — без meditation). Расширение пинится
явным множеством SLOT_SKILLS_00032102 (T5) — не молчаливое самопоглощение §6.
Полосы amount — общий канон .01 (0.02–0.05 / 0.05–0.10 / 0.10–0.20 / 0.20–0.35 / 0.35–0.45).

free_cast — РОВНО 2 epic-аффикс-объекта: warder_pendant 000583 (neck, epic) → magic_shield,
thorn_boots 000611 (feet, epic) → thorns. НЕ поле верхнего уровня (паттерн .01).
Каталог free_cast после волны: 20 (19 epic + 1 legendary).

## 2. Наборы

- НОВЫЙ набор vigil — 4 члена в ЧЕТЫРЁХ РАЗНЫХ слотах, каталожный порядок тиров:
  vigil_vambrace 000594 (palms, common) → vigil_greaves 000603 (legs, rare) →
  vigil_plate 000587 (torso, epic) → vigil_helm 000570 (head, legendary).
  set_bonus ОДИНАКОВ у всех: {2:{armor:2},3:{armor:3},4:{armor:4}} — пороги {2,3,4}
  достижимы чистыми 4 слотами.
- traveller достроен до порога 4: traveler_boots 000609 (feet, common) — 4-й СЛОТ (feet);
  бонус байт-в-бит ≡ traveler_cloak 000458 ({2:{armor:1},3:{armor:2},4:{armor:3}}) —
  контракт SB13/D-03 «set_bonus ОДИНАКОВ у всех членов».
- mystic достроен до порога 4: mystic_earring 000576 (ears, epic) — 4-й слот (ears:
  были head/torso/palms); бонус — affix-массив meditation 5/10/15%, байт-в-бит ≡
  silver_helm 000100.
- penitent НЕ тронут (его пороги пинуются ui.test.js).
- Итог: 18 наборов / 51 предмет (45 + vigil 4 + traveller 1 + mystic 1).

## 3. Рецепты 000470–000519

1:1 на предметы (тот же порядок; id рецепта = id предмета; результат — тот же файл).
Типы (факт диска для брони, ОТЛИЧАЕТСЯ от оружия .01): кузнечное_дело 13 — здания
[8,25] на ВСЕХ редкостях (в .01 legendary/impossible кузнечного не было); зачарование 15
(здание [18], навыки runes + тематический, «заклинания» ≥1 в ID-форме); столярное 14
(здание [5], dexterity — валяные/плетёные доспехи); резьба_по_камню 8 (здания [40,48],
runes — траурная/обереговая мелочь из кости/ракушки). Названия: «Ковка X» / «Зачарование X»
/ «Плетение X» / «Резьба X» — префиксы по типу (факт диска). Уровни — полосы
RARITY_LEVEL_RANGE_00023008 (tests/craft.test.js), волна: common 2–6, rare 14–22,
epic 37–47, legendary 69–73, impossible 96/97. Исходники — ТОЛЬКО старые реагенты
000033–000062 (НОВЫХ реагентов НЕ создавали — ограничение ТЗ); «база» не используется.

## 4. Пулы дропа

EQUIP_POOLS (src/loot-equip-data.js — данные): id дописаны КОНЦОМ тиров каталожным
порядком: common +20, rare +14, epic +10, legendary +4, impossible +2 → 152/105/77/30/15
(Σ 379). RARITY / pickRarityTier / DROP 50/30/15/4.9/0.1 / rollVictoryLoot — 0-diff,
0 новых RNG (попадание в лут — автоматически по виду/rarity).

## 5. Иконки

50 flat-SVG 64×64 assets/sprites/items/<id>.svg (имя = id, паттерн 000302/000335):
ПЕРВЫЙ элемент — тень-эллипс rgba(0,0,0,0.22); только polygon/rect(rx)/circle/ellipse;
без path/use/text/градиентов/stroke=; sha256-уникальны против всех 580 файлов каталога
(stroke= остался ровно 46 legacy). Палитра по редкости (common кожа/сукно, rare серебро,
epic аметист+золото, legendary золото, impossible багрово-фиолетовая), форма — по слоту
(шлем/серьга/ожерелье/кираса/наручи/рукавицы/штаны/сапог) + уникальные детали на предмет.

## 6. Подводные камни

- Формат JSON-канона: weight 1.0 ОБЯЗАТЕЛЬНО сериализуется «1» (генератор — Node,
  JSON.stringify — не Python: «1.0» сломает roundtrip). Проверялось roundtrip-свипом
  всех 100 файлов.
- Имена id/названия — коллизии с диском проверялись ДО генерации (linen_trousers →
  coarse_trousers, rune_greaves → sigil_greaves, felt_boots → tar_boots — занятые
  имена переименованы).
- Слот-матрица аффиксов: frostgrip_gauntlets (palms) — archer, НЕ breath (breath вне
  матрицы forearms/palms) — отловлено самопроверкой ростера.
- Тир-хвосты EQUIP_POOLS меняют floor(r·len)-голдены combat N2/S3 и окно T7 —
  пересимулированы ЧЕСТНЫМ прогоном (пины, seed/соли 0-diff).
- Camp-стоки makeCampShop: новые armor-виды дописываются rng-хвостом (старые ключи
  bit-identical) — GOLDEN_CAMP/A57/B26/B27 пересняты прогоном.
- CANON memory/000230.16: C1/D/E-блоки обязаны побайтовать с обновлённым spec/items.md
  (канарейка canon-items-sync-000284.02); счётчики §2 — по диску, НЕ по памяти.

## 7. Мутации (поверх закоммиченной реализации, git restore; финальное дерево зелёное)

M1 rarity 000564 common→rare → armor T2,T3,T5,T9 + canon-sync T6,T7,T9;
M2 удаление иконки patched_helm.svg → armor T7 + item-icons-000302.08 SWEEP;
M3 дубль ИМЕНИ (000565←000564) → armor T2,T9 (+T1 — ПОБОЧНЫЙ эффект
python-пересериализации weight 1→«1.0», грабля §6; сама коллизия — T2);
M4 skill 000594 fists→meditation (вне матрицы palms) → T2,T5,T9;
M5 set_bonus vigil_greaves {2:armor 3} → T6,T9;
M6 удаление рецепта 000470 → T8,T9,T10 (assets-schemas — зелёный,
счётчика craft в нём нет);
M7 результат 000471 → 000564 (нарушение 1:1) → T8,T9;
M8 уровень рецепта 000470 = 90 (common полоса 2–6) → T8;
M9 дрейф зеркала (value patched_helm +1 в items-data.js) → T9;
M10 удаление golem_gauntlets из impossible-пула EQUIP_POOLS → T3;
M11 третий free_cast (000564) → T2,T5,T9 (T10 читает зеркало — зелёный);
M12 weight «1» строкой → T1,T2,T9 + assets-schemas(items);
M13 отступ JSON 4 пробела → T1 (roundtrip-канон);
M14 stats.armor 000585 = 9 (вне envelope torso) → T2,T4,T9;
M15 дубль desc (000566←000564) → T2,T9;
M16 идентичная иконка (копия vigil_helm.svg → patched_helm.svg) → T7 (sha256);
M17 «заклинания» 000488 в path-форме → T8 (assets-schemas — зелёный,
паттерн craft-схемы свипом не задет — фиксируем);
M18 spec/items.md «152/105/77/30/15»→старое → wording W8 + canon-sync T1,T5,T10
(C1/E-блоки и иглы; spec-split — зелёный: номер-дрейф не меняет specLines).
Все 18 — redConfirmed.

# 000321.12 — 50 свитков воскрешения (resurrection_scroll), вариант (a)

Задача: tasks/done/000321.12.md. Тест: tests/items-resurrectscroll-000321.12.test.js
(10 тестов, маркёр «000321.12 T1..T10»).

## 1. Вариант (a) — почему без полей и без правки src

effect = {kind:'resurrect'} БЕЗ полей. Валидатор src/items.js:437–442 уже принимает
resurrection_scroll с effect.kind ∈ {resurrect} без обязательных полей — рантайм-обработчик
(оживление первого павшего союзника с 50% HP) живёт в combat-слое и читает ТОЛЬКО effect.kind.
Код src/ НЕ тронут; из src изменён только генерируемый зеркалом src/items-data.js
(npm run sync:items). Никаких новых веток в src — источник семантики «50% HP / первый
павший» — текст задачи и этот файл, не поля JSON.

## 2. Ростер и лекс-хвост

50 id `zyv_<слово>_scroll`, слова на zi/zl/zm/zn/zo/zv/zy — 2-я буква > h ⇒ все строго
после прежнего хвоста `zyv_zhizni_scroll` (ре-пин .11) ⇒ все allItems rng-пулы
additions-only, сиды byte-identical, золотые дописываются хвостом:
- items.test.js universam (30,40,WEAPONS_SHOP,3) seed 3346526313: 898→944 ключей,
  2736→2878 шт (+46 выпало, 4 нет) — литерал дописан после `zyv_zhizni_scroll: 2,`;
- cities.test.js '100,-40,7,5,44,3' seed 3425630131: 903→944 (+41 хвостом);
- 000346 T7 / 000347.01 T6: 898→944 / 2736→2878 (переснято ЖИВЫМ кодом, clauses в именах);
- camp-пул (food/potion/weapon/armor) NOT contains resurrection_scroll — 227/335 инертны,
  GOLDEN_CAMP и building-effects не переснимались.
Диапазон реестра 001065–001114 (резерв при старте волны, исчерпан точно); append в
лекс-порядке внутри блока (ASCII: '_' < буквы ⇒ zmeev_ перед zmei? нет — zmei < zmeev;
порядок = [..IDS].sort(), сверен T7 .11-миграции).
Цены 130–220, вес 0.4–0.6 (ТЗ-вилка); base_price/tier/rarity/slot НЕТ (стоп-лист T1
FORBIDDEN_KEYS); desc = префикс «В бою (быстрый слот): возвращает первого погибшего
союзника на поле боя (50% HP). » + вкус. Имена «Зов …» — схема .11 «Свиток: Зов X» не
коллизит (её name-префикс с «Свиток: »).

## 3. Иконки — 50 flat-SVG в этой же волне

assets/sprites/items/zyv_<id>.svg, каркас = тело resurrect_scroll.svg (рамка свитка 8
строк verbatim + тень-эллипс ПЕРВЫМ элементом), эмблема — 6 родов seeded (FNV-1a(id) →
mulberry32), палитры по 2-й букве слова (zi синий / zl золото / zm зелёный / zn бронза /
zo янтарь / zv фиолет / zy уголь). sha256-уникальность vs весь каталог (свои файлы первого
прогона генератор исключает по ownSet — грабля «icon hash clash» при повторном запуске).
sprites/items 981→1031: svg.test.js таблица + 9 семейных держателей (T7 «против всех N
иконок», allSvg/hashes asserts, T10 icon-assert у shield/artifact/tool, message «иконок —
N; факт:» у ring/potion/food, items.test.js:2688 L3 «прочих — ровно N»). skillbook .09
message-иголки не было (только hashes/name).

## 4. Ре-пин-карта (финал — живой диск)

icons 981→1031 (см. §3); без slot 475→525: ui.test.js (шапка :49 + name/message +
«1114 − 589»), 5 fam withSlot asserts + ring/food/potion `in it)).length`, items.test.js:3869
L3-message, 000252 заголовок-пин (5 иголок; НЕгативы «прочие 425»/«104» живут), 000243
(7 иголок, name-prefix clause); без base_price 712→762: potion/food T8 (assert+message+name),
000322 R6 name-chain (историческое «712 НЕ двинулся» в .11-clause — НЕ трогать); каталог
1064→1114: items.test.js «= 1064 » equality-message ×2 (8225 floor «= 1064)» НЕ тронут —
ls-пол), ls-предикаты ≥1064 СТОЯТ (items.test floors, assets-schemas minCount, e9-canary,
item-icons .302.08). I1 (items.test.js «000211.06 I1»): RESURRECTSCROLLS_00032112 exclusion
set + цепочка `.has(it.id)) continue;` + clause в имени.

## 5. Миграция сиблинговых хвостовых гардов (ГРАБЛЯ для следующей волны)

Хвостовые assertions сиблингов переписаны в successor-tolerant форму (иначе красны любой
следующей append-волной):
- .09/.10 T7: `ids.slice(-150,-100)` / `slice(-200,-150)` — хвост = N×(блоков после них);
- .11 T7: вместо `slice(total-N)` — блок по первому вхождению (`findIndex(k=>blockSet.has)`),
  «префикс ≡ диску без новых И БЕЗ поздних волн» (laterVals), зеркало — подряд по лекси
  от `indexOf(sorted[0])`;
- .11 T8: дельта spell_scroll над префиксом ДО блока (prefixScrolls = slice(0, firstIdx8));
- .11 T9: spec-счётчик — живая сверка по regex `/Каталог assets\/items — (\d+) файлов
  \(на момент ([0-9.]+)\):/` + `cm[2] >= '000321.11'` (паттерн .10; литерал «1064 файлов
  (на момент 000321.11)» умер).
c9-преемственность (takenLater) у .10/.11 уже была — мои «42412» их не красит.

## 6. Commit-gated красные (не баг)

«000318.08 T9» (spec/canon ≡ `git show HEAD:`) и 000386 T2/T3/T4 (P1 биекция entry↔коммиты
«Задача <id>», трогавшие spec) красны до финального коммита волны и зеленеют на нём;
после любого amend, двигающего spec (ре-база!), ОБЯЗАТЕЛЕН re-замер c9 «000321.12: N (+Δ)»
(память memory/000386-c9-bytes-log.md §3).

## 7. Гейты формы (пинятся чужими тестами — соблюдать в правках этого класса)

head-guard-000395 T7: RAW-свип всех tests/ — ни в коде, ни в комментариях форм «HEAD:src»
(мои файлы не используют); 000386 T7: запрет исполняемых «NNN файлов (на момент» — мои
счётчики живые (needles собираются конкатенацией), self-gate в T8 пинит это и отсутствие
литералов живых счётчиков; 000329 T-серия: SVG живут в assets/sprites/items (новый путь
из каталога-справочника .329) — наши 50 иконок записаны уже по новому пути; 000389
changelog-day-structure: буллет в СУЩЕСТВУЮЩУЮ секцию «## 2026-11-16 / ### Игровой
процесс» (keep-both, заголовок не дублировать); зуб changelog-merge-date-000408:
каждый буллет ВЕРХНЕГО дня требует строку в тестовом манифесте
tests/data/changelog-merge-dates.json ({title:{date,sha?}}, sha informational —
для будущего мержа sha неизвестна до мержа, дописывается приёмкой оркестратора в
ff-amend; после такого аменда — обязательный пересрез 000408+000389, post-TAP
инертность tests/data НЕ покрывает — протокол 11-16).

## 8. RED/GREEN/мутации

RED /tmp/resurrect12-red.tap: 8 ERR_ASSERTION (T1,T2,T3,T5,T7,T8,T9,T10), T4/T6 зелены
на RED (инвариантные гарды — прецедент .11). GREEN: 10/10. Матрица (клоны /tmp, ПОСЛЕ
стейджа — прецедент 000315): M1 rarity-поле → крах валидатора схемы (T1/T2); M2 base_price
→ 000322 R6- holders + свои T8; M3 effect+spell → T3 + контракт spelleffects; M4 битая
иконка → T5 + svg-family; M5 правка хвоста реестра → T4/T7 + сиблинги .11 T7; M6 off-by-one
в spec-цепочке → T9 + wording + .386; M7 id раньше лекс-хвоста → golden-краснота (все три
стока) + T2 lex-гейт; M8 комментарий с формой HEAD:src → head-guard T7.

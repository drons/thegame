# 000337 — практика за удары посохом: навык «Владение посохом» (staff)

Источник: ретро b5-20261107 (задача 000325, tasks/result/000325-retro-b5-20261107.md).
ТЗ: tasks/pending/000337.md (после задачи — tasks/done/000337.md).

## 1. РЕШЕНИЕ ДИЗАЙНЕРА — вариант (a): новый secondary-навык

`assets/skills/000044.json` — id `staff`, имя «Владение посохом», type
secondary, primary = 000001 «Сила», БЕЗ requires (прецедент swordsman/
fists/heavy — у «Каменных кулаков» и «Мечника» requires нет), эффект
`{ stat: "staffHitBonus", perLevel: 0.05 }` (паттерн swordHitBonus у
«Мечника»), **effectType: "ОТСРОЧЕНО"**, desc «ОТСРОЧЕНО: потребителей
стата в коде нет» (точный прецедент «Акробатика» 000016 / тест
000273-W2), 6 имён по рангам, roundtrip-канон stringify(obj,null,2)+'\n'.

Обоснование (прецедент фиксации кастомного решения — 000283.01.01):

1. **Семантическая честность прогрессии (модель 000013).** Каждый
   боевой подтип имеет СВОЙ навык практики (combat.js attackSkillId):
   sword→swordsman, bow→archer, heavy→heavy, без оружия→fists. Посох —
   пятый подтип (attackSkillId src/combat.js:270). Заимствование
   существующего id (вариант b) лило бы XP за посох в чужую прогрессию
   (meditation → hp/mp-реген от ударов посохом; swordsman →
   swordHitBonus от посоха) — кросс-доменный протёк против ТЗ.
2. **Цена перепина документирована** прецедентом 000324 (школы 37→43
   + вся count-цепь) и 000235.x (spells-цепь). Перепин механический
   (таблица §3), GUARD 000336 усилен честно: 44 файла / 43 уникальных
   id, дуп по-прежнему ровно [['nature', 2]].
3. **Вариант (b) НЕ спасал от перепина**: пины «навыка staff в
   каталоге нет» (W5A tests/spec-000230.16-wording + spec/items.md:6,
   combat.test.js R10, заголовок Д-02) лгали бы при ЛЮБОМ фиксе.
4. **src/ = 0-diff (+ зеркало)**: combat.js уже слал 'staff' — код
   менять не нужно.

## 2. ПУТЬ XP (факт кода, база fb344d5)

playerAttack src/combat.js:1467 → hit → src/combat.js:1534–1537
`skillPractice(p, attackSkillId(eq), PRACTICE_XP.hit)`;
PRACTICE_XP.hit = 3 (src/combat.js:263). Sheet.practice src/sheet.js:369:
SECONDARY_SKILLS[skillId] отсутствует → fail «неизвестный навык:
staff», applied 0 (:377–378) — ТИХИЙ отказ (было). После (a): навык
резолвится; practiceCap = primary(Сила)·2 (src/sheet.js:337); gain 3 <
skillXpForNext(0) = 15 → applied 3 в копилку sheet.skillXp.staff,
level 0. Сейв: src/player.js:156/:169 фильтруют secondary/skillXp по
SECONDARY_SKILLS — 'staff' принимается автоматически, миграция v1 НЕ
нужна (до фикса записей не возникало). Единственный вызов
attackSkillId — combat.js:1534.

## 3. ПЕРЕПИН-ЦЕПЬ (все правки — в ТОМ ЖЕ коммите, «ре-пин 000337»)

Числа: 44 файла / 43 уникальных id / 38 EFIR-каталог (6+32) / 32 secondary.

| Файл | Что |
|---|---|
| tests/efir.test.js | :170 коммент 43→44; :832/:833 SKILL_CATALOG 43→44, msg «6 primary + 32 secondary + 6 school»; заголовок GUARD :2044 «остальные 36 id»→37; :2046–2053 коммент+SKILL_FILES 43→44, SKILL_META 42→43; :2083 коммент «ВСЕ 37 id»→38; :2089/:2090 catalog 37→38. dups-ассерт :2060 НЕ менялся ([['nature',2]] — усиление честное) |
| tests/efir-sheet.test.js | :102 коммент 43→44 (ассертов нет) |
| tests/save.test.js | :1563–1565 коммент (32/38); :1571/:1572 EFIR_SKILL_CATALOG 37→38 + msg; внутренний коммент «(37 + 42 id)»→38 |
| tests/skills.test.js | заголовок :93 «31 вторичный»→32; :104 secondary 31→32 |
| tests/skills-refs.test.js | :3–4 коммент 45→46 ссылок; SR1 заголовок+assert 31→32; SR2 заголовок «31 primary-ссылка»→32; SR4 заголовок «ровно 45»→46; asserts byPath primary 31→32, requires.skill 14 БЕЗ изменений (у staff requires нет), всего 45→46 |
| tests/magic-schools-000324.test.js | :28 коммент; C2 заголовок «37 .cp-btn (6+31)»→38 (6+32); assert 6+31→6+32. Школьный A2-набор НЕ затронут (школ не добавлялось) |
| tests/ui-panel.test.js | :68/:797 комменты; заголовок :818 «все 31»→32; assert :823 skills.length 31→32 |
| tests/combat.test.js | R10: коммент «Д-02» (шапка блока) — навык ∈ каталог; заголовок теста applied 0→3; assert applied 0→PRACTICE_XP.hit; p.skillXp.staff undefined→3; practice.skill==='staff' и level 0 СОХРАНЕНЫ (новый id = 'staff'; 3 < порог 15 ⇒ level 0 верен) |
| tests/spec-000230.16-wording.test.js | W5A-игла :167 + заголовок W5 + why-текст — синхронно с line-neutral правкой spec/items.md:6 (см. §5) |
| memory/000230.16-spec-equipment-doc.md | **канон-ре-синхрон (контракт 000284.01 §3 — в том же коммите, что и правка spec/items.md)**: §2 «staff — D-02» («навыка НЕТ / assets/skills 43 — нет» → «навык ЕСТЬ / assets/skills 44 — есть, 000044»); §2 мета items.md 32461→32470 байт + атрибуция «000337: +9 байт line-neutral строка 6»; §3.1 и §3.5 (КАНОН-строка ряда Оружие) — прежняя цитата → текущий текст spec :6; §4.2 игла W5A (a) — новый текст побайтово ≡ константе wording-теста |
| tests/canon-items-sync-000284.02.test.js | шапка :34 «43 нумерованных»→44 (+staff); c10e якорь «— 'staff' нет»→«— 'staff' есть» + ассерт names инвертирован (skill ОБЯЗАН быть в каталоге — ЧЕСТНОЕ усиление: D-02 «навыка нет» отменён решением дизайнера; прецедент инверсии пинов — combat R10). T1/T2/T10 зелёные ПРАВКОЙ КАНОНА БЕЗ правки теста (самоадаптивный контракт 000284.02) |
| tests/spec-000273-wording.test.js | **найдено НЕ по плану**: W2 — LINE-INDEX игла rows[51]→rows[52] (строка «Акробатика» сдвинута +1 строкой таблицы «Сила»; skills.md:52→:53 в заголовке/комментариях/сообщениях). W1 rows[41] («Кузнечная рука», :42) НЕ сдвинулась (вставка ПОСЛЕ строки 43 «Крепкая спина»); CRAFT rows[81] — другой файл |
| tests/spec-split.test.js | :134 SPEC_FILE_LINES skills.md 133→135 + атрибуция «000337: +2» в начало цепи. items.md 383 НЕ ре-пинится (правка line-neutral; файл без trailing-\n — пиновое 383 = wc 382) |
| tests/spec-000297-wording.test.js | W3 заголовок «guard 133»→135; assert specLines 133→135 + история цепи «000337: +2» + строка «line-index-пины SKILLS[41]/[52]» |

НЕ затрагиваются (проверено): tests/svg.test.js (у навыков иконок-каталога
НЕТ — assets/sprites не содержит skills/), skill-tree-audit-000325
(динамические sweep, «без канареек»), player.test.js «вторичные
переименовываются» (итерация по SECONDARY_SKILLS — names/primary,
автоматически включает staff), spec-000255/000271/000307/000312-wording
(file-wide includes / H2-срезы — line-neutral), spec-combat-wording.

## 4. ОТСРОЧЕНО — почему без wiring

Stат `staffHitBonus` НЕ заведён в derived() (src/sheet.js): точечный
прецедент acroBonus («Акробатика» 000016 — effectType ОТСРОЧЕНО, desc
«ОТСРОЧЕНО: потребителей стата в коде нет»). Wiring в derived()
ЗАПРЕЩЁН скоупом задачи: src/sheet.js = параллельная 000328.02
(руны-механика). ЦЕЛЬ задачи — XP практики — работает без wiring
(combat.js слал 'staff' всегда; Sheet.practice резолвит SECONDARY_SKILLS.staff
→ applied 3). Тестов, требующих effect.stat ∈ keys(derived()) для
навыков, НЕТ (DERIVED enum — только для рун,
runes-catalog-000328.01). Точность от навыка — задача-потомок
(создать при закрытии: derived staffHitBonus + потребитель в
equipmentStats/hitChance по паттерну swordHitBonus src/items.js:1350).

## 5. ВЫНУЖДЕННОЕ РАСШИРЕНИЕ SCOPE — spec/items.md:6

Строка таблицы «Типы предметов» пинила «маркер практики 'staff' —
навыка в каталоге нет, 000230.12» (игла W5A
tests/spec-000230.16-wording). После фикса текст ЛЖЁТ; игла обязана
переехать вместе со spec (line-neutral: 383 пина spec-split сохранена).
Обоснование: ложь в SPEC под тестом хуже, чем +1 файл правки вне SCOPE
(прецедент вынужденной правки — SPEC.md TOC в 000328.01). Новая
формулировка: «практика — навык «Владение посохом» (staff, 000044),
000230.12/000337».

## 6. ПОПРАВКА К ФАКТАМ ТЗ/РЕТРО — «13 посохов»

ТЗ 000337 и ретро b5 пишут «13 предметов assets/items/000345–000357
(subtype staff)». Факт диска (fb344d5):subtype 'staff' — **7** файлов:
000345, 000346, 000347, 000351, 000352, 000355, 000357 (ровно ростер
R10 combat.test.js). «13» — промер ДИАПАЗОНА 000345..000357 по
количеству файлов, НЕ по subtype (000348/349 — не оружие staff,
000350 — heavy, 000353/354/356 — другое). Тест T4
tests/staff-attack-practice-000337 динамический (все subtype staff с
диска) — не зависит от ростера и не воспроизведёт ошибку ретро.

## 7. ПОДВОДНЫЕ КАМНИ

- R10 `level 0` после фикса ВЕРЕН: skillXpForNext(0) = 15 > 3 — рост
  уровня из одного попадания не следует; не «чинить».
- skillXp.staff в сейв-миграции НЕ нужен: фильтр player.js по
  SECONDARY_SKILLS открывается новым навыком автоматически.
- Зеркало src/skills-data.js — ТОЛЬКО `node scripts/sync-skills-data.js`
  (npm-алиаса sync:skills нет — не добавлять; sync-all подхватывает
  скрипт по /^sync-.+\.js$/). JSON + зеркало — один коммит, иначе
  sync:check/items-снимок красные.
- sync:check на ГРЯЗНОМ src/ отказывается проверять («не переписываю
  молча») — проверять ПОСЛЕ коммита (transient-краснота до коммита —
  норма, прецеденты 000322/000327/000320.01).
- spec/items.md — файл БЕЗ trailing-'\n': wc -l = 382 при пине 383
  (split+pop-счётчик R7); line-neutral правка это сохраняет.
- Вставка строки таблицы «Сила» — ПОСЛЕ «Крепкая спина» (не после
  «Каменных кулаков»): иначе сдвигается строка 42 и ломается W1
  (rows[41]) — вторая line-index игла той же задачи.
- Свип T2 ловит РАЗРЫВ (id вне каталога), а не подмену: 'staff'→'sword'
  в attackSkillId дал бы зелёный T2, но красные T1/R10 (skill не
  «staff») — осознанно.

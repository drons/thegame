# 000325 — аудит: навыки механик изучения заклинаний / разборки предметов

Задача = ЗАКРЕПЛЕНИЕ (pin, прецедент 000327): sweep по ФАКТУ КОДА показал,
что ДИФФ пуст — все навык-id, резолвимые механиками, существуют в каталоге
assets/skills. Ни нового навыка, ни канон-переименований. Гард —
tests/skill-tree-audit-000325.test.js (T1–T5).

## §1 Таблица аудита (имя → источник → резолвер → статус)

| Имя (id) | Источник (file:line) | Резолвер | Статус |
|---|---|---|---|
| firelord, icelord, meditation, nature | src/spells.js:319 PRACTICE_BY_SCHOOL (значения); src/ally-spells.js:60 (те же 4) | SECONDARY_SKILLS (src/sheet.js: skillPractice/навык-практика) | существуют: «Повелитель огня» / «Повелитель льда» / «Медитация» / «Сердце природы» (secondary) |
| intelligence, wisdom | src/spells.js canLearn `p.primary[spell.атрибут]`; ATTR_POOL src/spells.js:309; значения «атрибут» всех assets/spells | PRIMARY_SKILLS | существуют: 000004 «Интеллект» / 000005 «Мудрость»; enum-пин 000327 S2 |
| runes (гейт «руна») | src/spells.js canLearn `source === 'rune'` → `p.secondary.runes < spell.уровень` | SECONDARY_SKILLS | существует: «Рунопись» (secondary) |
| alchemy, nature (практика за зелья/еду) | src/items.js USE_PRACTICE (`it.kind === 'potion' ? 'alchemy' : 'nature'` → `P.skillPractice`) | SECONDARY_SKILLS | существуют: «Алхимик» / «Сердце природы» |
| forge, heavy, alchemy, nature, dexterity | src/craft.js:176 SKILL_CRAFT_TYPE (ключи — книги/наставники → вид; потребитель bookCraftXp ← src/items.js skill_book) | каталог (primary/secondary) | существуют: «Кузнечная рука», «Тяжёлое оружие», «Алхимик», «Сердце природы», «Ловкость» (primary) |
| forge, alchemy, runes, dexterity | src/craft.js:162 CRAFT_TYPE_SKILL (значения — потолок/качество вида; и разборка 000309 — шанс по уровню вида) | каталог | существуют |
| огонь, лёд, тень, исцеление, защита, природа | src/combat.js:1290 SCROLL_SCHOOLS (лутирование свитков → последующее изучение) | JSON школы assets/skills по name.toLowerCase() (контракт 000327 S1) | ровно по 1 школе 000038–000043; НЕ дублировать (000324 смержена) |

ТЗ-примеры «кузнечное_дело», «алхимия», «зачарование» — это ВИДЫ КРАФТА
(CRAFT_TYPES src/craft.js:154), НЕ навыки и НЕ синонимы (см. §2).

## §2 Дифф пуст: «виды крафта» ≠ навыки дерева

* Домен прогрессии видов — `c.craft` (уровни/опыт/изученные виды в сейве),
  отдельный от `c.primary`/`c.secondary` (дерево [I], ui-tab-skills.js).
* Связанный навык вида — таблица CRAFT_TYPE_SKILL (src/craft.js) и канон
  spec/craft.md «Вид крафта | Связанный навык» (000046). Навык-потолок уже
  есть у всех 6 видов (forge/alchemy/runes/dexterity) — новый навык
  дублировал бы c.craft-прогрессию и сломал бы: spec/craft.md, 343+ recipe
  (тип), ключи сейва c.craft, desc чертежей, UI-строку «Разборка: <тип> —
  возврат X%» (src/ui.js:894 — печатает rc.тип).
* Омонимия: ВИД «рунопись» (кириллица, CRAFT_TYPES) ≠ НАВЫК «Рунопись»
  (id `runes`). Дизъюнктивность доменов пинится по ID-домену:
  ids(каталога) ∩ CRAFT_TYPES = ∅ (T3), а не по именам.
* Разборка предметов (000309) не вводит новых навык-id: шанс — по уровню
  ВИДА (тип канон-рецепта → тот же CRAFT_TYPE_SKILL).

## §3 Решения

* НОВЫХ навыков: 0 (GUARD 000336 43/42, A2, L832, efir-sheet, svg-пины —
  НЕ трогать и не перепинивать; искушение добавить файлами «кузнечное_дело
  / алхимия / зачарование» ЗАПРЕЩЕНО — потянет перепин-цепь + дубль
  прогрессии c.craft vs c.secondary).
* ПЕРЕИМЕНОВАНИЙ: 0 (синонимов нет; имена навыков уникальны в каталоге —
  пин T4).
* `nature` — задокументированная id-коллизия 000324/000336 (secondary
  «Сердце природы» 000031 + school «Природа» 000042). Практика резолвит
  SECONDARY_SKILLS (не SKILL_META!) → семантика корректна; НЕ
  переименовывать (решение 000336).

## §4 Пин-поверхность (tests/skill-tree-audit-000325.test.js)

* T1 существование: практика (text-extract PRACTICE_BY_SCHOOL ОБОИХ файлов
  + USE_PRACTICE pids) ⊆ вторичные; атрибуты (ATTR_POOL + значения
  «атрибут» assets/spells) ⊆ первичные; гейт (.secondary.<id> literals) /
  значения CRAFT_TYPE_SKILL / ключи SKILL_CRAFT_TYPE ⊆ каталог.
* T2: SCROLL_SCHOOLS (live require combat.js) → ровно 1 школа по
  name.toLowerCase() (зеркало 000327 S1).
* T3 контракт домена: CRAFT_TYPES ≡ ключи CRAFT_TYPE_SKILL (двусторонне);
  типы рецептов — SWEEN ПО ДИСКУ assets/craft/*.json (НЕ зеркало
  craft-data.js — оно bake-нутый, мутация JSON без sync его не красит) ⊆
  CRAFT_TYPES; таблица spec/craft.md ≡ коду по id И имени JSON (имя
  с пометкой вида «Ловкость, основной» — часть до первой запятой);
  дизъюнктивность ids ∩ CRAFT_TYPES = ∅.
* T4 каноничность: зеркало src/skills-data.js {id,name} по контейнерам
  PRIMARY/SECONDARY/SCHOOLS ≡ диск 1:1 (тип файла = контейнер — иначе
  'nature' дал бы ложный дрейф из-за last-wins Map); имена уникальны.
* T5 self-check: чистая фикстура → []; кривые (практика blacksmithing /
  навык вида alchemy2 / гейт lockpicking / атрибут agility / школа взрыв /
  дубль школы / вид-омоним alchemy / имя-дрейф и пропуска зеркала / тип
  файла вне контейнеров) — нарушения с маркером подстроки; фикстуры
  fs.mkdtempSync(os.tmpdir()), кривой РЕАЛЬНЫЙ файл не фиксируется
  (паттерн 000327 S4/000335).
* ДИНАМИЧЕСКИЙ sweep — без канареек 43/42/167/343 (каталоги растут —
  000332/000333; счётные пины: GUARD 000336, A2/A3, W-08).

## §5 Смежные проверенные точки

* src/items.js:905 skill_book → Craft.bookCraftXp → SKILL_CRAFT_TYPE
  (навык книги → опыт виду) — ключи ∈ каталогу (T1/T3).
* src/learn-target.js — только резолвер носителя изучения, навык-id НЕ
  резолвит (шапка модуля: canLearn generic — p.primary[spell.атрибут],
  p.secondary.runes).
* Изучение свитков (kind spell_scroll → canLearn/learn) навыков НЕ
  резолвит — только гейты canLearn (атрибут/Рунопись).
* SR-контракт 000211.02 (навыки) — не перекрывать.
* Сейвы: новых полей нет (виды уже в v1 hero.craft/craftXp/craftTypes) —
  миграции НЕТ.
* СМЕЖНАЯ НАХОДКА раунда 2 (вне SCOPE 000325, НЕ исправлена задачей):
  `attackSkillId` (src/combat.js:270) для оружия subtype 'staff' (посохи
  000345–000357, волна 000230.12 — kind weapon, stats.damage > 0)
  возвращает навык-id 'staff' — его НЕТ в assets/skills;
  `Sheet.practice` (src/sheet.js:369) на неизвестный id тихо отказывает
  (`reason «неизвестный навык: staff»`, applied 0 — без краша), т.е.
  практика-опыт за удар посохом НЕ начисляется. Это домен практики за
  УДАРЫ оружием (000013), НЕ изучение заклинаний / разборка предметов
  (скоуп задачи) ⇒ в аудит-дифф 000325 НЕ входит; spec/skills.md «Практикой»
  упоминает только «попадание мечом → Мечник» — для посоха навык не
  описан. Нужна ОТДЕЛЬНАЯ задача-фикс (решение: навык-файл в assets/skills
  ⟹ перепин GUARD 000336 43/42 + count-пинов, ИЛИ замена id на
  существующий — по факту кода и решению дизайнера).

## §6 Подводные камни

* text-extract PRACTICE_BY_SCHOOL / ATTR_POOL / гейта / USE_PRACTICE —
  таблицы НЕ экспортированы; regex по литеральному `const X = {…}` и
  `.secondary.<id>`/`it.kind === 'potion' ? …` — при реформате точки тест
  красный с явным сообщением «sweep надо обновить» (не тихий пропуск).
* T3 читает типы рецептов с ДИСКА assets/craft, а не из зеркала
  src/craft-data.js (bake) — иначе мутация JSON без sync не красится.
* GUARD 000336 и счётные пины — вне SCOPE (0 новых файлов каталога);
  ЛЮБОЙ новый assets/skills/*.json красит GUARD 43/42 + count-пины —
  если будущее решение «новый навык» потребуется, перепинивать честно всё.
* Зеркало src/skills-data.js НЕ регенерировать (каталог 0-diff);
  W-08 sync:check не задействован (src/assets 0-diff) — транзиенты до
  коммита (прецеденты 000302.08/000322).
* Ре-пин-цепочка spec/skills.md: 132→133 (буллет 000325) — В ТОМ ЖЕ
  коммите tests/spec-split.test.js (SPEC_FILE_LINES) и
  tests/spec-000297-wording.test.js W3 (specLines + заголовок guard);
  wording-иглы 000312 W5 / 000307 / 000273 (SKILLS[41]/[51]) / 000271 /
  000255 / 000280 режут по H2/сочетаниям — добавление ОДНОЙ строки в
  конец файла их не сдвигает (подтверждено срезом).
* Файл-гард 000280 W1: ни одна строка spec/skills.md не содержит
  «Карта/Бой» — новый буллет это соблюдает.
* Мутационные проверки (БЕЗ коммита, git restore): (1) spells.js
  'meditation'→'meditacio' → T1 red «meditacio»; (2) ally-spells.js
  'firelord'→'fireling' → T1 red; (3) assets/craft/000001.json тип →
  «портняжное_дело» → T3 red; (4) src/skills-data.js «Медитация» →
  «Медитація» → T4 red (дрейф по container secondary); (5) spec/craft.md
  «(Алхимик)»→«(Алхимия)» → T3 red. После каждого restore — срез зелёный;
  efir/efir-sheet (GUARD) на restore-состоянии 40/40 зелёные (0 новых
  файлов).

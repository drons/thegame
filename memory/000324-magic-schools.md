# 000324 — школы магии: JSON в assets/skills + видимость в дереве [I]

## Контракт
Школа магии — свойство заклинания (поле «школа» assets/spells, enum
000301), НЕ навык. Задача — каталогизация 6 школ (факт диска: 167
заклинаний, 28/29/27/29/27/27) + видимость в дереве навыков [I].
Фундамент для 000327 (ссылки школа/атрибут заклинаний →
assets/skills — её выполнять ПОСЛЕ мержа этой).

## Список id школ (каталог, порядок = порядок вкладок книги 000301)
| файл | id | name (байт-в-байт SCHOOLS) | icon |
|---|---|---|---|
| 000038.json | protection | Защита | assets/school-icons/protection.svg |
| 000039.json | healing | Исцеление | assets/school-icons/healing.svg |
| 000040.json | ice | Лёд | assets/school-icons/ice.svg |
| 000041.json | fire | Огонь | assets/school-icons/fire.svg |
| 000042.json | nature | Природа | assets/school-icons/nature.svg |
| 000043.json | shadow | Тень | assets/school-icons/shadow.svg |

* id — латиница `^[a-z][a-z0-9_]*$` (как у навыков), = имя иконки
  без расширения; имена/иконки — ИСТОЧНИК src/spellbook-oc.js
  (закрытая SCHOOLS-константа 000301) — байт-в-байт; иконки уже на
  диске (000301), здесь только ССЫЛКА.
* desc — одно предложение по факту распределения действий школы в
  каталоге spells (урон/лечение/баф/дебаф/контроль/создание/призыв/
  телепорт/невидимость/воскрешение/внебой).
* JSON-формат каталога: 2-space indent, хвост `}\n`, канон-порядок
  ключей id, type, name, desc, icon; type — const «school».

## Schema (assets/skills/schema.json)
oneOf 2 → 3 ветви. Третья: type object, additionalProperties false,
required [id, type, name, desc, icon] (канон-порядок), id — тот же
паттерн, type — const «school», name/desc/icon — string. Валидатор
tests/json-schema.js поддерживает (const уже использовался).

## Sync-зеркало (src/skills-data.js — ГЕНЕРАЦИЯ, не руками)
scripts/sync-skills-data.js: type-чек += «school» (stderr
`"primary", "secondary" или "school"`), массив `schools`, блок
`const SCHOOLS = [...]` ПОСЛЕ SECONDARY_SKILLS (порядок файлов
каталога, `// <file>`-комментарии, канон-порядок ключей через
ordered-объект — детерминированно, не от порядка JSON), return
`{ PRIMARY_SKILLS, SECONDARY_SKILLS, SCHOOLS }`, log += школ.
Guard «каталог должен содержать основные и вторичные» НЕ тронут
(школы — опциональны для скрипта). REF_RE-ссылки школы НЕ образуют:
icon `assets/school-icons/*.svg` не матчит REF_RE (не в allow-листе
каталогов и не .json) — skills-refs SR4 (45 ссылок) без изменений.

## Контракт представления в дереве [I] (src/ui-tab-skills.js)
Секция «Школы магии» (div.cp-section) МЕЖДУ группами вторичных
навыков (цикл по G.PRIMARY_SKILLS) и «Книга заклинаний»
(до bookSec в build). 6 строк tr: td.cp-name (name),
td.cp-level («—» — уровень у школы НЕТ), td.cp-tipcell >
div.cp-tip (desc — записан в BUILD, render() не трогает —
итерации render() только по .cp-btn). КНОПОК .cp-btn НЕТ: школа —
не навык (ни уровня, ни копилки skillXp, ни canRaise, ни
raiseSkill) — строки не участвуют в делегированном клике панели.
Дегенерация: `!G.SkillsData || !Array.isArray(G.SkillsData.SCHOOLS)`
— console.error ОДИН раз (once-флаг schoolsErrorShown, паттерн
partyErrorShown 000145) + секция пропускается; SCHOOLS = [] (пустой
каталог) — секция тихо не рисуется. G — снапшот модуля (000038):
skills-data.js грузится ДО ui-tab-skills.js в index.html →
G.SkillsData в снапшоте есть; НОВЫХ <script> не потребовалось
(index.html 0-diff).

## Наблюдаемость (tests/magic-schools-000324.test.js, 11 тестов)
A1–A5 каталог/схема (6 файлов, id-набор/порядок 000301, icon-путь +
файл на диске, name байт-в-байт, кросс-чек 167 spells ↔ школы
каталога по name.toLowerCase() — ровно одна, schema-ветвь school),
B1–B3 зеркало/sync (SCHOOLS deepEqual каталогу в порядке файлов +
канон-порядок ключей; дрейф-пин tmp-копия реального каталога;
tmp-миникаталог 1 primary + 2 secondary + 1 школа → exit 0 +
SCHOOLS), C1–C3 дерево [I] (секция на месте 6 строк name/«—»/desc
без кнопок, 0 console.error; регресс: portraits первым, 6 основных,
37 .cp-btn = 6 + 31, книга/вдох на месте, строки книги = c.spells;
setCharacter — секция переживает re-render).

## Ре-пины (значения по диску в коммите)
* tests/skills.test.js: «6 основных, 31 вторичный и 6 школ»;
  SCHOOL_FIELDS в «каждый файл»; SCHOOLS-блок в зеркальном тесте;
  schema oneOf 2 → 3 + ассерты ветви.
* tests/spec-split.test.js: SPEC_SECTIONS skills.md += «## Школы
  магии (каталог)»; nH2 69 → 70 (+ title 70 H2); SPEC_FILE_LINES
  skills.md 113 → 132 (+19, история в комменте).
* tests/spec-000297-wording.test.js W3: guard 113 → 132 (+ title
  «guard 132» + история).
* tests/assets-schemas.test.js: только комментарий (oneOf primary |
  secondary | school) — generic-цикл 37 → 43 файлов сам,
  negative-control files[0] (primary) не тронут.
* skills-refs (SR1–SR8) — ре-пинов НЕТ (45 ссылок не изменилось).
* spec-000273-wording SKILLS[41]/[51] line-index-пины — НЕ сдвинулись
(вставка в КОНЕЦ файла).

## Подводные камни
* spec H2 назван «Школы магии (КАТАЛОГ)» — суффикс намеренный:
  spec/spells.md уже имеет H2 «## Школы магии» (там — enum школ
  заклинаний); глобального теста уникальности h2 нет, но
  однозначность важнее. Секция в UI — «Школы магии» (без суффикса).
* src/skills-data.js — ТОЛЬКО `node scripts/sync-skills-data.js`
  (не руками); JSON и зеркало — ОДИН коммит (0-дрейф = B2/SR7).
* W-08 sync:check — транзиент ДО коммита (незакоммиченное
  src/skills-data.js), зелёный после (прецедент 000302.01–.06/
  000235.07).
* Новый герой (createCharacter) имеет старт-заклинания c.spells =
  ['spark', 'mend'] (src/sheet.js:170) — книга «—» только при c.spells
  = [] (C2 пинит строки = c.spells, не «—»).
* VM-тесты: deepEqual cross-realm массивов (c.spells из песочницы)
  падает — брать `[...c.spells]`.
* Кнопка .cp-btn в школьных строках = ловушка: панель делегирует
  клик по .cp-btn → raiseSkill; отсутствие кнопки = школа не
  повышается (контракт ТЗ «отдельная ветка/группа» — решение:
  секция-просмотр без механики).
* 000327 — ссылаться на assets/skills/000038–000043 по id (не по
  номеру файла); поле «школа» spells хранит кириллическое имя
  (enum 000301) — резолв = name.toLowerCase() (A3).

## Уникальность id — ВНУТРИ type (коллизия «nature», 000336)

id уникальны ВНУТРИ type, НЕ по всему каталогу (факт master: 000042
{id nature, type school, «Природа»} и 000031 {id nature, type
secondary, «Сердце природы»} — два файла на один id). Формулировка
ТЗ 000324 «id уникальны (sweep каталога)» невалидна по master —
фиксируем фактическую семантику. Функционального слома НЕТ: зеркало
— отдельные контейнеры (SECONDARY_SKILLS-карта vs SCHOOLS-массив,
src/skills-data.js); EFIR_SKILL_CATALOG (src/main.js:310-317) школы
НЕ включает — 37 = 6 primary + 31 secondary; schema.json без unique;
A2 пинит набор id.

РЕШЕНИЕ 000336 — НЕ переименовывать (rename рванул бы mirror/
иконки/spec/ссылки 000327). SKILL_META (tests/efir.test.js:146-165:
Map по id по 43 файлам, порядок readdirSync, last-wins; 000031 —
idx 30, 000042 — idx 41): выигрывает школа — SKILL_META.get('nature')
= {type: 'school', name: 'Природа'} — задокументировано + GUARD
000336 (последний test-блок tests/efir.test.js; «nature» —
ЕДИНСТВЕННОЕ задокументированное исключение + shape-пин: ровно 1
secondary + 1 school).

[info] Байт-байтность SCHOOLS с src/spellbook-oc.js (000301) —
СВОЙСТВО ДАННЫХ (пин A2): scripts/sync-skills-data.js КОПИРУЕТ из
JSON-файлов каталога и НЕ сравнивает со spellbook-oc.js —
формулировка коммита f5b6d91 («блок SCHOOLS … байт-в-байт»)
приписывает свойство данных синхронизации; история master не
переписывается — фиксация здесь (000336).

## Следующая задача
000327 (ссылки школа/атрибут заклинаний на assets/skills): после
мержа этой. Имена школ/иконки — НЕ менять без синхронизации
spellbook-oc.js + каталога + SPEC.

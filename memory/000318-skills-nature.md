# 000318.11 — деаноним коллизии id «nature» в assets/skills (school → nature_school)

НЕ путать с memory/000318-asset-rename.md — тот файл параллельной дочерней
000318.01 (инфраструктура json-ref/свипов каталогов).

## 1. Контракт решения (вариант (а))

Коллизия: assets/skills/000031.json «Сердце природы» (type secondary) и
assets/skills/000042.json «Природа» (type school) оба имели id `nature`.
Предусловие 000318.09 (инвариант basename==id для каталога skills)
невыполним при двух `nature` — коллизия устранена ПЕРЕИМЕНОВАНИЕМ ШКОЛЫ:

| файл | поле | было | стало |
|---|---|---|---|
| assets/skills/000042.json | id | nature | nature_school |
| assets/skills/000042.json | icon | assets/school-icons/nature.svg | assets/school-icons/nature_school.svg |
| assets/school-icons/nature.svg | путь файла | — | git mv → nature_school.svg (R100, контент 0-diff) |
| src/spellbook.js (SCHOOLS, вкладка «природа») | icon | …/nature.svg | …/nature_school.svg |
| src/skills-data.js (SCHOOLS[4]) | id/icon | перегенерация sync-skills-data.js в том же коммите | |

Вторичный `nature` (000031) НЕ меняется: живой рантайм-id (PRACTICE_BY_SCHOOL
значения, foodPowerMult src/sheet.js:571, SKILL_CRAFT_TYPE src/craft.js,
affix/skill_xp предметов, MOB_TYPES fairy src/combat.js:184) и КЛЮЧ В СЕЙВЕ
(hero.secondary[id]/hero.skillXp[id], санитайзер player.js отбрасывает
неизвестные id — переименование вторичного молча стёрло бы прогресс).

## 2. Почему school-id невидим рантайму (обоснование варианта (а))

Английский id ШКОЛЫ не имеет ни одного runtime-потребителя:
- школы в рантайме — ТОЛЬКО русские строки: поле «школа» каталога spells
  (29× «природа»), SCROLL_SCHOOLS (src/combat.js:1290), CAST_FX_SCHOOLS
  (src/combat-ui.js:132), вкладки SCHOOLS (src/spellbook.js:44 — id=рус.);
- резолвинг школа→JSON — по name.toLowerCase() (magic-schools A3,
  skill-tree-audit T2, spell-links-000327), НЕ по id;
- зеркало SCHOOLS в UI читают только name/desc (src/ui-tab-skills.js:419–425);
- Путь assets/skills/000042.json не ссылается НИКТО (grep «skills/000042»
  — 0 hits вне самого файла); школьный свип «спеллы/крафт по slug школы»
  на диске не существует — спеллы используют русскую «школа».

Иконка: coupling «icon = assets/school-icons/<id>.svg» — контракт спеки
spec/skills.md H2 «Школы магии (каталог)» («id (латиница, = имя иконки)»,
«icon — assets/school-icons/<id>.svg») и пин A2 magic-schools-000324.
Переименование файла ИКОНКИ вместе с id оставляет спеку ИСТИННОЙ →
spec/ 0-diff (в т.ч. skills-storage.md — о школах молчит, line-neutral
выполняется тривиально). Вариант «id nature_school, иконка осталась
nature.svg» врёт спеке — отвергнут.

СЕЙВ: миграция/алиас НЕ нужны и не делались: школа в сейве не хранится
вовсе (книга заклинаний — по spell-id, школа берётся из каталога по-русски;
activeSchool — сессионное UI-состояние, в collectSaveData не попадает;
efir-раздел хранит id пула firelord/icelord/perception/precog). В файлах
save-пайплайна (save.js/player.js/main.js/companions.js) ссылка на
school-контейнер отсутствует (запинено T3). сейв v1, CURRENT_VERSION==1,
MIGRATIONS==[] целы (пины сохранены тестом). Пустой MIGRATIONS + конвенция
«неломкое расширение v1» — алиас-паттернов в сейве на диске нет.

Отмена 000336: memory/000336-retrofix-b3.md («НЕ переименовывать — rename
рванул бы mirror/иконки») закоммичен и НЕ правится; решение ОТМЕНЕНО
настоящей задачей осознанно (ради предусловия 000318.09; цена отмены —
ровно те «рванувшие» mirror/иконки, обновлённые в этом же коммите).

## 3. Отказ от readdir-winner

Механизм «победитель коллизии = позднее в readdirSync» (школа 000042
перетирала вторичного в Map tests/efir.test.js SKILL_META) УНИЧТОЖЕН
вместе с коллизией: 44 файла → 44 уникальных id, карта id→запись
инвариантна к порядку обхода (пин T2 нового файла). GUARD-тест
«000336 GUARD» в tests/efir.test.js перепинен ЧЕСТНО: заголовок помечен
«перепин 000318.11», SKILL_META.size 44, dups deepEqual [], winner-ассерты
по readdir заменены явными id-проверками (nature→secondary 000031,
nature_school→school 000042), skip `if (id === 'nature') continue` снят;
анти-drift часть (38 id каталога efir не перекрыты school) сохранена.

## 4. Ре-пины и потребители старого school-id (все в том же коммите)

- tests/efir.test.js — GUARD 000336 (см. §3); прочее (SKILL_META usage
  только для 4 id пула efir, SKILL_CATALOG 44) — без правок;
- tests/magic-schools-000324.test.js — SCHOOLS_EXPECTED 000042 «nature» →
  «nature_school», A2 (id-набор deepEqual + иконка-деривация сама выводит
  nature_school.svg); A1/A3/A4 — динамические, без правок;
- tests/spellbook-oc-tabs.test.js и tests/combat-spellbook-tabs-000331.test.js —
  фикстурные строки icon → nature_school.svg (иначе пин «1:1 со SCHOOLS»
  краснеет);
- НЕ потребовали правок (проверено прогонами): skills.test.js (зеркало≡
  каталог динамически), skill-tree-audit-000325 (свипы динамические;
  «ловушка nature» в шапках остаётся историческим комментарием — names
  не менялись), runes-catalog-000328.01 (анти-коллизия-пин
  !usedSkills.has('nature') остаётся ИСТИННЫМ), svg.test.js (счёт 6 и
  sha256-уникальность — имен-пинов нет), items/player/craft-тесты (всюду
  ВТОРИЧНЫЙ nature), skills-refs (школ не касается), spec-split/wording
  (spec 0-diff).

## 5. Подводные камни

- Тест T5 нового файла сканирует репозиторий на вложения старого пути
  «school-icons/nature.svg» и ИСКЛЮЧАЕТ сам себя (в шапке/сообщениях
  ассертов игла есть); memory/*.md и tasks/*.md вне скана (закоммиченные
  тексты 000301/000324 содержат старый путь и не правятся).
- Иконки школ (PNG/SVG) НЕ перегенерировались — git mv с контентом
  бит-в-бит; игрок не видит ничего (name «Природа» и картинка те же,
  id невидим) → CHANGELOG без буллета.
- sync:check до коммита транзиентно красный (зеркало регенерировано,
  коммита нет) — конвенция 000322/000327; после коммита = 0.
- efir НЕ затрагивался: пул EFIR = {firelord, icelord, perception, precog},
  «nature» вне пула; nature_blessing (efir.js) — id СПЕЛЛА, другой домен.
- Гипотетический rename ВТОРИЧНОГО id обнаружился бы сейв-тестом Т3 ТОЛЬКО
  после перегенерации зеркала: src/player.js читает SECONDARY_SKILLS из
  src/skills-data.js, а не из JSON (мутация M3 без sync оставила Т3
  зелёной — краснели только каталожные свипы). Любой будущий rename
  вторичного навыка ОБЯЗАН делаться с sync-skills-data + алиасом чтения в
  санитайзере (паттерна алиасов в сейве нет — MIGRATIONS пуст с v1).

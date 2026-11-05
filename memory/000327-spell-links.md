# 000327 — ссылки тэгов assets/spells на каталоги (школа/атрибут/summon)

Дата: 2026-11-05. Worktree task-000327; база master 4234a98.
Аудит данных: сломанных ссылок НЕТ — фикс = ЗАКРЕПЛЕНИЕ (pin), 0-diff
всех 167 JSON assets/spells + assets/spells/schema.json + зеркала
src/spells-data.js (данных правок нет — roundtrip-риск отсутствует).

## Форматы ссылок (решение)

Формат ссылки = **id каталога** (НЕ путь файла, НЕ номер файла):

* `школа` — кириллический id школы (enum 000301: огонь/лёд/тень/
  исцеление/защита/природа) — резолв в JSON школы assets/skills
  (000324: 000038–000043, type school) по `name.toLowerCase()`
  (контракт 000324, memory/000324-magic-schools.md, тест A3
  tests/magic-schools-000324.test.js).
* `атрибут` — id навыка assets/skills (000004 intelligence /
  000005 wisdom — оба primary; 000325 не нужна: навыки существуют).
* `параметры.summon` (только у «действие» «призыв») — id моба
  assets/mobs. Движковый гейт: `MOB_TYPES[pa.summon]` — fail-closed
  ДО расхода маны (src/spells.js:497) и makeAlly (src/spells.js:800,
  `u.mobId = pa.summon`).

ОБоснование (факт потребителей — ни один НЕ резолвит эти тэги по
пути): «школа» читается строковым сравнением / ключом карты —
SCHOOL_BONUS/PRACTICE_BY_SCHOOL (src/spells.js:619/908),
`s['школа']==='лёд'/'огонь'` (src/combat.js:2548/2560/2988,
src/ally-spells.js:319–320), фильтр книги 000301
(`s["школа"]!==activeSchool`, src/spellbook-oc.js:189, activeSchool
= кириллический id SCHOOLS 000301), SCROLL_SCHOOLS (src/combat.js:
1290), CAST_FX_SCHOOLS (src/combat-ui.js:132); «атрибут» — ключ
`p.primary`/`u.attrs` + ATTR_POOL (src/spells.js:426) + выбор пула
spellInt/spellWis (src/combat.js:2833). Пути в JSON заклинаний
используются ТОЛЬКО у файла-ссылок (база/предметы/здания/icon,
паттерн `^assets/...` — резолв по файлу).

НЕ «нормализовать» `школа` в латиницу: смена значений =
механический рефактор ~10 точек src + schema enum + UI 000301 +
каскад тестов/spec — потенциальная отдельная задача, вне SCOPE
000327. ДВЕ id-системы школ — принятый контракт: SCHOOLS 000301
(src/spellbook-oc.js:36 — id КИРИЛЛИЦЕЙ: значение «школа» в spells)
и SCHOOLS 000324 (src/skills-data.js:458 — id ЛАТИНИЦЕЙ + name
кириллица ЗАГЛАВНОЙ); «школа» spells = id 000301 = name 000324
в нижнем регистре (Огонь→огонь).

## Sweep-факты (полный sweep на базе)

* assets/spells: 167 заклинаний (000001–000167, сквозная нумерация)
  + schema.json (схема В КАТАЛОГЕ, не в корне).
* У ВСЕХ 167: «школа» (6 значений: огонь 29, лёд 27, тень 27,
  исцеление 29, защита 28, природа 27) и «атрибут» (intelligence
  83, wisdom 84) — пропусков/чужих значений нет; каждое «школа»
  резолвится в ровно ОДИН школьный JSON (name.toLowerCase()).
* 13 заклинаний «действие» «призыв»: 000038 flame_imp(imp),
  000039 phoenix(fire_elemental), 000063 frost_wisp
  (wind_elemental), 000064 winter_elemental(water_elemental),
  000087 shadow_wraith(vampire), 000088 void_horror(bone_coloss),
  000109 light_sprite(fairy), 000110 spirit_healer(orc_shaman),
  000111 holy_guardian(earth_elemental), 000137 stone_golem
  (stone_golem), 000138 iron_sentinel(bone_coloss), 000163
  forest_beast(wolf), 000164 treant(earth_elemental) — у ВСЕХ
  параметры.summon + параметры.turns=4; 11 distinct mob-id, 11/11
  в assets/mobs (36 JSON) и в MOB_TYPES-зеркале. Биекция цела:
  у НЕ-призывов параметров.summon нет.

## Schema / зеркало — 0-diff (решения)

* assets/spells/schema.json — все три поля УЖЕ описаны: «школа» —
  enum ровно 6 кириллических id; «атрибут» — enum
  [intelligence, wisdom]; «параметры.summon» — {type: string,
  pattern ^[a-z][a-z0-9_]*$} (паттерн пинит S2
  tests/spells.test.js:2169). Схема self-contained (JSON Schema не
  резолвит каталоги) — ссылочная семантика закреплена sweep-тестом
  + spec, в схему НЕ дублируется. Закрытый enum для summon НЕ
  добавляется: каталог mobs растёт — enum хрупок, паттерн + sweep =
  правильное разделение.
* src/spells-data.js (зеркало, генерация
  scripts/sync-spells-data.js) — везёт «школа»/«атрибут»/
  «параметры» ПОЛНОСТЬЮ КОРРЕКТНО как есть (L130 списка полей;
  параметры:{summon:"imp",turns:4} и т.п.) — движок читает из
  зеркала в том же формате; данных правок нет → перегенерация НЕ
  нужна (иначе W-08 sync:check покрасил бы «зеркало ≠ каталог»).

## Тесты — tests/spell-links-000327.test.js (5)

* S1 — «школа» каждого заклинания → ровно 1 JSON школы
  (name.toLowerCase(), уникальность совпадения) + значения ⊆ enum
  схемы;
* S2 — «атрибут» → id JSON assets/skills + ⊆ enum схемы;
* S3 — биекция гейта: «действие» «призыв» ⇔ параметры.summon,
  summon → id assets/mobs; у НЕ-призывов нет;
* S4 — self-check чекера: чистая фикстура → []; кривые школа
  «взрыв» / атрибут «agility» / summon «dragon» / биекция / дубль
  школы → нарушения с маркером (os.tmpdir(), mkdtempSync, очистка
  finally — паттерн 000335: осмысленная краснота БЕЗ фиксации
  кривого реального файла);
* S5 — roundtrip-заморозка: множество файлов assets/spells/*.json,
  где JSON.stringify(obj,null,2)+'\n' ≠ исходник, = exclusion-
  списку БИТ-В-БИТ.

Сweep ДИНАМИЧЕСКИЙ — без канареек счёта заклинаний/призывов
(000332/000333 добавят заклинания — покрываются автоматически;
счётные пины 167 — A3 000324 и W-08 spells.test.js).

## ЛОВУШКА S5 — 18 legacy-файлов с inline-массивами

000001–000017.json + schema.json написаны ДО канона 2-пробельного
формата: короткие массивы (предметы/здания) inline
(`"предметы": ["assets/items/000022.json"],`) —
JSON.stringify(obj,null,2) их РАЗНОСИТ по строкам. Эти 18 файлов —
exclusion-список FORMAT_EXCEPTIONS_000327 (конвенция 000335
LEGACY_STROKE: заморозка исключения с канарейкой). Заморозка
двусторонняя: нормализация legacy-файла в канон-формат ИЛИ
побитие формата нормального файла — красят S5 (заморозка требует
ре-пина). Остальные 150 файлов каталога (167−17 legacy-спеллов) —
канон stringify(obj,null,2)+'\n'.

## Подводные камни

* Мутационные проверки — БЕЗ коммита (прецедент 000335): мутация
  «школа»/«summon» в реальном JSON → sweep ровно красный на
  соответствующем S-блоке → `git restore` → зелёный; мутация
  попадает вне финального diff.
* git stash запрещён — восстановление `git -C <worktree> restore
  <file>`.
* spec-split — только «spells.md» 439→445 (skills.md 132 НЕ
  трогать: line-neutral замена); wording-тесты строк этих секций не
  пинят (проверено grep'ом).
* W-08 sync:check-транзиент НЕ ожидается: src/ не тронут.
* spec/spells.md H2 «Каст вне боя»/«Книга заклинаний» — перо
  параллельных 000331/000332; при rebase пин 445 ре-пинить ими,
  не мной (секции разные, конфликт текстовый, разрешим).

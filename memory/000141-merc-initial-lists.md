# 000141: начальные списки 6 наёмных (базовые_характеристики + начальные_навыки) — контракт данных

Задача: начальные списки навыков/характеристик 6 наёмных (ДАННЫЕ), P2,
волна A, родитель 000139 (memory/000139-skill-unification.md §2/§3, §9.1),
блокирует 000143. Станция «Проектирование» (2026-10-06), база = master
45bbada (мердж 000139). Данные-задача: игровой код (src/npc.js,
src/companions.js, src/combat.js) и index.html НЕ трогаются — чтение новых
полей появится в 000143. Красное ДО сверено с кодом: у всех 6 (000012-17)
`найм.базовые_характеристики` и `найм.начальные_навыки` отсутствуют.

## Что добавлено (и чего НЕ будет)

Добавляется (всё — внутри объекта `найм`):
* `найм.базовые_характеристики = {strength, dexterity, constitution,
  intelligence, wisdom, charisma}` — 6 целых ≥ 1 (граница схемы 1..10).
* `найм.начальные_навыки = {id: level}` — явные уровни начальных навыков;
  id из каталога skills (основные ИЛИ вторичные).
* assets/npc/schema.json: найм.properties += 2 под-схемы (после "spells").
* Регенерация зеркала src/npc-data.js (скрипт sync-нпc-data НЕ меняется —
  generic deep-copy).
* tests/npc-data.test.js: +T1..T7 (append, новая подсекция «--- Начальные
  списки (задача 000141) ---» в конце файла; НОВЫЙ файл НЕ создаётся — ТЗ).

НЕ трогается: найм.required, scripts/sync-npc-data.js, игровой код,
index.html, tests/index-order.test.js, CHANGELOG.md (P2 — геймплей не
меняется до 000143), .merge-pending (только стадия мержа).

## Контракты и границы

* Смешанная номенклатура СОХРАНЯЕТСЯ (как у найма 000078): ключи
  характеристик — англ. id PRIMARY_SKILLS (src/skills-data.js:
  strength/dexterity/constitution/intelligence/wisdom/charisma); ключи
  найм-объекта — рус. (цена/жалованье/роль/базовые_характеристики/
  начальные_навыки) + англ. dmg/hp/armor/skills/spells.
* Новые поля в схеме ОПЦИОНАЛЬНЫЕ (НЕ в найм.required): существующий
  тест «schema.json: найм — отрицательная валидация»
  (npc-data.test.js L470-506, фикстура okHire БЕЗ новых полей) обязан
  остаться валидным — инвариант: семантические правки существующих тестов
  запрещены. «Все 6 наёмных ИМЕЮТ поля» закрывается на уровне ДАННЫХ
  (T4-T6 по hireCandidates() — ровно 6).
* Роль → главная характеристика — strict max (T4): melee→strength,
  ranged→dexterity, shield→constitution, support→intelligence (главная
  строго больше КАЖДОЙ из остальных 5). Для support дополнительно
  wisdom ≥ 2: ТЗ «support→intelligence/wisdom» = двойное отображение
  (int — главная, wis — вторичная); вариант «tie int==wis» ОТКЛОНЁН —
  strict-max правило едино для всех 4 ролей.
* Границы: характеристики — целые 1..10 в схеме (НАЧАЛЬНЫЕ значения
  наёмника; ТЗ требует только ≥ 1; 1..100 не нужны — осознанное
  отклонение от предложения a1 (100), паттерн «разумный максимум» dmg/
  hp ≤ 10 у найма). Уровни навыков — целые ≥ 1 (maximum в схеме нет —
  ограничение валидатора, D6; точные уровни зафиксированы T6).
* начальные_навыки: объект {id: level}; КЛЮЧИ = МНОЖЕСТВО найм.skills
  ДВУСТОРОННЕ (keys == set(skills[]) — строже ТЗ «skills[] ⊆ keys»):
  плоский skills[] (implicit level 1, читают существующие makeAlly/
  companions) не должен расходиться со «списком» — иначе два источника
  одного списка. Конфликт уровней при слиянии (000143): ЯВНЫЕ
  (начальные_навыки) побеждают implicit 1.
* Skill-ид — из каталога (хелпер knownSkillId, npc-data.test.js L419-422:
  SECONDARY_SKILLS || PRIMARY_SKILLS); у текущих 6 — все вторичные
  (swordsman, archer, accuracy, heavy, meditation, fists).
* Позиция в JSON: оба новых ключя — в КОНЦЕ найм-объекта (после "spells")
  — минимальный дифф; deepEqual не зависит от порядка ключей.

## Ограничения валидатора (tests/json-schema.js) — почему схема именно так

* ALLOWED_SCHEMA_KEYS: type/required/properties/additionalProperties/
  items/enum/const/minimum/maximum/minItems/maxItems/pattern/anyOf/oneOf.
* `additionalProperties` поддерживается ТОЛЬКО как `false`; как под-схема
  ИГНОРИРУЕТСЯ; `patternProperties` — вне допущенного набора (walk-тест
  «только ключи минимального валидатора», npc-data.test.js L90-128,
  отловит). Следовательно:
  * базовые_характеристики — закрытый объект (additionalProperties false
    + required 6 + properties 6 × {integer, minimum 1, maximum 10}) —
    проверяется схемой ПОЛНОСТЬЮ;
  * начальные_навыки — в схеме ТОЛЬКО {type: object}: значения {id: level}
    схемой НЕ проверяются (неподдерживаемая под-схема); фиксация — в
    данных-тесте T6 (id из каталога, целое ≥ 1, keys == set(skills[])).
* Писать ключи вне ALLOWED_SCHEMA_KEYS — нельзя: walk-тест схемы и
  assets-schemas.test.js упадут (мёртвая схема-декорация = регресс).

## Зафиксированные цифры (решение D3; фиксируются T5/T6)

| id (файл)         | роль    | str | dex | con | int | wis | cha | начальные_навыки          |
|-------------------|---------|-----|-----|-----|-----|-----|-----|---------------------------|
| merc_volk (000012)   | melee   | 3   | 1   | 2   | 1   | 1   | 1   | {swordsman: 2}            |
| merc_ashka (000013)  | ranged  | 1   | 3   | 1   | 1   | 1   | 1   | {archer: 2, accuracy: 1}  |
| merc_baldor (000014) | shield  | 2   | 1   | 3   | 1   | 1   | 1   | {heavy: 2}                |
| merc_mira (000015)   | support | 1   | 1   | 1   | 3   | 2   | 1   | {meditation: 2}           |
| merc_torga (000016)  | melee   | 4   | 1   | 2   | 1   | 1   | 1   | {fists: 2}                |
| merc_rena (000017)   | ranged  | 1   | 3   | 1   | 2   | 1   | 1   | {archer: 2}               |

Обоснование (ТЗ: «цифры задаёт реализация, фиксируются тестом»): Торга —
сильнейший melee (dmg 1.5, контракт 100 з) → str 4; Вольк — самый дешёвый
(40 з, hp 1.1) → str 3 + con 2; Рена — ranged-кастер (spark/frost_bolt —
школа intelligence, 120 з) → dex 3 + int 2; Мира — support по ТЗ
«intelligence/wisdom» → int 3 (главная) + wis 2 (школа mend/light_heal —
wisdom); Бальдор — «стена» (armor 3, hp 1.5) → con 3 + str 2; Ашка —
чистый ranged (50 з, accuracy в skills) → dex 3. Уровни: главный навык
роли = 2, дополнительный (accuracy у Ашки) = 1. Пересмотр баланса =
осознанная правка таблиц EXPECTED в T5/T6 (паттерн золотого сценария
000087) — данные, не механика.

## Ленивые ссылки и guards

* НОВОГО JS-МОДУЛЯ НЕТ → ленивых ссылок (rootRef) и guards НЕ возникает:
  нет UMD, нет новых <script>, нет межимодульных require.
* Данные читаются через СУЩЕСТВУЮЩЕЕ зеркало src/npc-data.js (тег
  index.html L750, Game.NpcData в браузере / require в node) — тег и цепочка
  не меняются (пины tests/index-order.test.js L253/L370 — без правок).
* Guard в 000143 (на будущее): поля гарантированы тестами T4-T6 у всех 6,
  но защитный guard при отсутствии (console.error + деградация — паттерн
  000038/000053) — решение той задачи.

## Контракт слияния для 000143 (ВАЖНО)

* 000143: найм создаёт sheet kind 'merc' (000139 §2): createSheet('merc',
  initial), где initial.primary = найм.базовые_характеристики (6 статов),
  initial.skills = найм.начальные_навыки (на уровнях, skillXp = 0),
  initial.spells = найм.spells.
* Конфликт уровней: явные (начальные_навыки) ПОБЕЖДАЮТ implicit 1
  (плоский skills[]). Благодаря двустороннему пину keys == set(skills[])
  слияние тривиально: initial.skills = начальные_навыки; плоский skills[]
  — legacy-форма для текущего кода (makeAlly combat.js L334 — id-список).
* 000143 обязан создавать sheet из начального списка БЕЗ ревалидации
  requires (000139 §2: initial — ПАРАМЕТР createSheet, не результат
  валидации дерева). Известная requires-несогласованность СОХРАНЯЕТСЯ
  осознанно (решение A, «не больше и не меньше ТЗ»): heavy requires
  swordsman 5 (skills-data.js L100), archer requires accuracy 5 (L184) —
  она уже существует сегодня при implicit 1 (Бальдор — без swordsman;
  Ашка — accuracy 1). Практика НЕ проверяет requires (_gainSkillXp,
  player.js L389-409; cap = primary×2, все primary ≥ 1 ⇒ cap ≥ 2) — путь
  прокачки существует; canRaise проверяет requires только при росте
  очками (L270-293). Альтернатива B (додавать swordsman:5/accuracy:5 в
  начальные списки) отклонена: расширение данных за рамками ТЗ + уровни 5
  противоречат профилю «главный 2, доп. 1».

## Что НЕ менялось (для ревьюера)

* Игровой код — byte-нетронут: src/npc.js, src/companions.js,
  src/combat.js, src/player.js, src/main.js, src/ui.js (git diff).
* Runtime-потребители найма читают свои поля (companions.js —
  цена/жалованье/роль; combat.js makeAlly — dmg/hp/armor/skills/spells;
  ui.js — цена/жалованье/роль) — новые поля для них ИНЕРТНЫ (аддитивные;
  allyDataForEntry — явная проекция, не spread).
* Сейвы: запись roster {npcId, level, xp, loyalty, hiredDay}
  (companions.js L185, ПИН companions.test.js L725) НЕ меняется; новых
  полей в сейв 000141 не добавляет (форму сейва перепиняет 000143).
* RNG/детерминизм — не затронуты (данные).
* src/npc-data.js — только через регенерацию скриптом (byte-стабильный
  генератор, writeFileAtomic).

## Подводные камни

1. assets/npc/schema.json — СКРЫТАЯ ОБЯЗАТЕЛЬНАЯ правка (ТЗ её не
   называет): найм закрыт (additionalProperties false, schema.json L164)
   — без расширения properties существующий тест «каждый файл: валиден по
   schema.json» (npc-data.test.js L130-140 + assets-schemas.test.js)
   УПАДЁТ на новых JSON.
2. найм.required — НЕ трогать: анти-тест L475-506 (okHire без новых полей
   обязан оставаться валидным).
3. Регенерация зеркала — ПОСЛЕДНИЙ шаг перед коммитом, JSON + зеркало — в
   ОДНОМ коммите: иначе «зеркало: точная копия каталога JSON»
   (L75-86) и CI-гейт sync:check (закреплён ci.test.js L215-222) красные.
4. scripts/sync-npc-data.js — НЕ править: generic-копия ВСЕХ Object.keys
   (jsValue/jsObjectAt), новые поля переносятся автоматически (прецедент
   memory/000078-npc-hire-data.md: «менять НЕЧЕГО»). Пункт ТЗ «переносить
   новые поля в зеркало» исполняется конструктом.
5. Новый тест-файл НЕ создавать (ТЗ) — T1..T7 append в tests/npc-data.
   test.js; все импорты уже в шапке (NPCS, PRIMARY/SECONDARY_SKILLS,
   SPELLS_BY_ID, validate/validateData, fs/path).
6. Волна A: 000140/000142 правят index.html + index-order — набор файлов
   000141 (assets/npc/*, src/npc-data.js, tests/npc-data.test.js, memory/)
   с ними НЕ пересекается (000139 §9.4).
7. Валидатор: patternProperties / additionalProperties-под-схема —
   неподдерживаемы; схема для значений {id: level} была бы мёртвой
   декорацией — значения фиксировать только данными-тестом.
8. Push в remote — запрещён; коммиты — только ветка task/000141;
   .merge-pending — только стадия мержа (эта стадия не создаёт).

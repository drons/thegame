# 000141: данные — найм.базовые_характеристики / найм.начальные_навыки (шпаргалка)

Полный контракт решений — memory/000141-merc-initial-lists.md. Это файл —
формат данных, таблица значений и процедура sync. Задача P2 (данные),
родитель 000139, блокирует 000143; игровой код не трогается.

## Схема найма (расширение assets/npc/schema.json, найм.properties, после "spells")

```json
"базовые_характеристики": {
  "type": "object",
  "additionalProperties": false,
  "required": ["strength", "dexterity", "constitution",
               "intelligence", "wisdom", "charisma"],
  "properties": {
    "strength":     { "type": "integer", "minimum": 1, "maximum": 10 },
    "dexterity":    { "type": "integer", "minimum": 1, "maximum": 10 },
    "constitution": { "type": "integer", "minimum": 1, "maximum": 10 },
    "intelligence": { "type": "integer", "minimum": 1, "maximum": 10 },
    "wisdom":       { "type": "integer", "minimum": 1, "maximum": 10 },
    "charisma":     { "type": "integer", "minimum": 1, "maximum": 10 }
  }
},
"начальные_навыки": { "type": "object" }
```

* найм.required (цена/жалованье/роль/dmg/hp/skills/spells) — НЕ
  расширяется: новые поля ОПЦИОНАЛЬНЫ в схеме (иначе сломается
  существующий анти-тест okHire, npc-data.test.js L475-506); присутствие
  у всех 6 наёмных фиксируется данными-тестами T4-T6.
* Значения начальные_навыки ({id: level}) в схему НЕ входят: минимальный
  валидатор (tests/json-schema.js) не поддерживает additionalProperties
  как под-схему и не знает patternProperties (допущенные ключи —
  ALLOWED_SCHEMA_KEYS, L21-25). Фиксация значений — в T6: id из каталога
  skills (knownSkillId), level — целое ≥ 1, keys == set(найм.skills).
* Все ключи под-схем — из ALLOWED_SCHEMA_KEYS → walk-тест схемы
  (npc-data.test.js L90-128) и assets-schemas.test.js без правок.

## Формат полей в JSON (в конце объекта найм, после "spells")

```json
"найм": {
  "цена": 40, "жалованье": 1, "роль": "melee", "dmg": 1.2, "hp": 1.1,
  "skills": ["swordsman"], "spells": [],
  "базовые_характеристики": { "strength": 3, "dexterity": 1,
    "constitution": 2, "intelligence": 1, "wisdom": 1, "charisma": 1 },
  "начальные_навыки": { "swordsman": 2 }
}
```

## Значения (зафиксированы тестами T5/T6)

| id (файл)         | роль    | str | dex | con | int | wis | cha | начальные_навыки          |
|-------------------|---------|-----|-----|-----|-----|-----|-----|---------------------------|
| merc_volk (000012)   | melee   | 3   | 1   | 2   | 1   | 1   | 1   | {swordsman: 2}            |
| merc_ashka (000013)  | ranged  | 1   | 3   | 1   | 1   | 1   | 1   | {archer: 2, accuracy: 1}  |
| merc_baldor (000014) | shield  | 2   | 1   | 3   | 1   | 1   | 1   | {heavy: 2}                |
| merc_mira (000015)   | support | 1   | 1   | 1   | 3   | 2   | 1   | {meditation: 2}           |
| merc_torga (000016)  | melee   | 4   | 1   | 2   | 1   | 1   | 1   | {fists: 2}                |
| merc_rena (000017)   | ranged  | 1   | 3   | 1   | 2   | 1   | 1   | {archer: 2}               |

Правила (T4): ровно 6 ключей = id PRIMARY_SKILLS; все целые ≥ 1; главная
по роли — strict max: melee→strength, ranged→dexterity, shield→
constitution, support→intelligence; у support дополнительно wisdom ≥ 2.
Уровни: главный навык роли = 2, дополнительный (accuracy) = 1.

## Sync-зеркало / sync:check

* Source of truth — assets/npc/*.json; зеркало — src/npc-data.js
  (ГЕНЕРИРУЕТСЯ, в ручную не править; тег index.html L750).
* scripts/sync-npc-data.js — БЕЗ ПРАВОК: generic deep-copy всех ключей
  (jsValue/jsObjectAt, Object.keys), whitelist'а нет — новые поля
  переносятся автоматически (прецедент memory/000078-npc-hire-data.md:
  «scripts/sync-npc-data.js менять НЕЧЕГО»).
* Процедура: правка JSON → `node scripts/sync-npc-data.js` (идемпотентно,
  writeFileAtomic) → `npm run sync:check` (= node scripts/sync-all.js
  --check, exit 0 «синхронно») → коммит JSON + зеркала ВМЕСТЕ.
* Гейты синхронности: тест «зеркало: src/npc-data.js — точная копия
  каталога JSON» (npc-data.test.js L75-86, deepEqual по ВСЕМ полям) +
  новый T7 (явный дрейф двух новых полей: зеркало == каталог) + CI-гейт
  sync:check (закреплён ci.test.js L215-222). В dev-состоянии «JSON
  правлен, зеркало старое» — L75-86 и T7 красные (ожидаемо, фиксатор
  синхронности); после регенерации — зелёные.

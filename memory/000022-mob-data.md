# 000022: описания мобов в assets/mobs (JSON)

Статус: выполнено и закоммичено (тесты 211 → 216 pass).

## Решения

* **assets/mobs/000001–000036.json** — по одному файлу на каждый из 36
  типов мобов (все id из MOB_TYPES в src/combat.js; DUNGEON_MOBS в
  src/dungeon.js — подмножество, ничего не добавлялось).
  Поля: `id, name, role, aggro, dmg, hp` (+опц. `armor, fast, traits`) —
  боевые параметры (раньше были в MOB_TYPES), плюс новые:
  - `xp: { base: 8, perLevel: 4 }` — опыт за убийство
    (base + perLevel * уровень моба; = прежней формуле `8 + 4*level`);
  - `skills: [id…]` — ссылки на assets/skills (тематическое
    соответствие: орк-лучник → archer, вампир → endurance, фей → nature…);
  - `spells: []` — ссылки на assets/spells; каталог появится с задачей
    000023 (другая цепь), поэтому пока пусто;
  - `loot: [{ item, chance }]` — ссылки на assets/items (шанс 0..1).
* **assets/mobs/schema.json** — схема: обязательные id/name/role/aggro/
  dmg/hp/xp/skills/spells/loot; enum role {melee, ranged, support,
  leader, shield, swarm}, aggro {aggressive, neutral, territorial,
  timid}; additionalProperties: false.
* **src/combat.js** — MOB_TYPES теперь ЗЕРКАЛО JSON (source of truth —
  assets/mobs; паттерн как у items/skills: JSON + JS-зеркало для
  file://, консистентность держат тесты). В новом src-файле не было
  нужды (ограничение цепи: без index.html). `makeMob` кладёт в юнит
  `xp/skills/loot` из описания; опыт победы считается из данных:
  `Σ round(u.xp.base + u.xp.perLevel * u.level)` (поведение то же).
* Ссылки валидируются тестами: все skills ∈ assets/skills, весь loot ∈
  assets/items; spells проверяются, если assets/spells существует.
* Размер мобов (size) — был вынесен в задачу 000040: поле добавлено в
  schema + данные (см. memory/000040-mob-size.md).

## Тесты

tests/combat.test.js: 4 новых — структура/уникальность id по схеме;
зеркало combat.js ≡ JSON-каталогу (как тест фолбэка предметов);
ссылки skills/loot/spells разрешаются; юнит несёт xp/skills/loot и
опыт победы = 8 + 4*5 для волка 5-го уровня. tests/dungeon.test.js: 1 —
все id из DUNGEON_MOBS описаны в каталоге.

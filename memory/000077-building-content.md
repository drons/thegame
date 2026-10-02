# 000077: магический круг (43) / заброшенный храм (39) — «ежедневный контент»

Статус: СТАДИЯ ПРОЕКТИРОВАНИЯ (итоговая архитектура зафиксирована
анализами a1/a3 + сводкой a2 + сверкой с кодом master f0e0c20).
Красная стадия коммитит этот файл вместе с тестами.
Родитель: 000064 (memory/000064-building-effects-plan.md);
имя раздела сейва buildingContent — резерв 000072
(memory/000072-building-effect-state.md L49); контракт спец-
модулей/ctx/wiring — memory/000128-building-actions.md (§2.3/§2.5/
§2.6/§2.7); паттерны apply/сидов/сейв-секций — memory/000074-
rune-stone-obelisk.md; золотые координаты — memory/000076-temple-
blessings.md (круг (4,3) id 43 — B3 golden; храм (-42,-31) id 39,
73 шага от (0,0)). Переиспользуемый контракт механизма —
memory/000077-daily-content.md.
Файл задачи tasks/pending/000077.md НЕ ИЗМЕНЯЕТСЯ (правило tasks/
CLAUDE.md); решения — здесь.

## 1. Механизм: единый «ежедневный контент» для 43/39

Один детерминированный ролл по (tile, day), РАЗ В ДЕНЬ (каталожный
флаг `раз_в_день`): 'chest'|'boss'|'relic' (доли — каталог
`особые_параметры.эффект.доли`: 0.6/0.3/0.1). Повтор в тот же
день — «круг молчит: содержимое уже получено»; состояние в сейве
`buildingContent` ('x,y' → { day, type }).

Два слоя (НЕ дублируем):

* **Чистый слой — src/building-effects.js** (паттерн 000074):
  4 ASCII-сида + 4 чистые (tile,day)-функции (hash — ПАРАМЕТР)
  + `EFFECTS['43']`/`EFFECTS['39']` (available/apply по СНИМКУ,
  apply ЧИСТ — 000074: не мутирует hero/save, не трогает
  инвентарь/бой — у apply на это НЕТ ссылок) + serialize/
  restoreBuildingContent (паттерн teleports/buildingQuests).
* **Исполнение — спец-модуль src/building-content.js** (НОВЫЙ,
  паттерн 000128 §2.3): саморегистрация при загрузке
  `Game.buildingActions.registerSpecial('43', fn)` +
  `registerSpecial('39', fn)` — ОДИН хендлер на ОБА id (общий
  механизм). Хендлер получает ctx с ЖИВЫМИ ссылками (hero —
  мутация gold/инвентаря; world.buildingContent — запись;
  startCombat — бой) — то, что чистому apply недоступно.

Общий пайплайн building-actions.js НЕ ТРОГАЕТСЯ (контракт 000128:
available-reason → apply → спец-хендлер → daily-марка (каталог) →
saveNow → flash → render). main.js правится ТОЛЬКО проводкой
(4 точки, §5). building-ui.js/combat-ui.js/items.js/dungeon.js/
map.js — без правок.

Две защиты от повтора (замок на два засова):

1. **available() по снимку buildingContent** — запись с
   `day === st.day` → reason-строка **«круг молчит:
   содержимое уже получено»** (ТЗ-текст, для 43 И 39). Пайплайн
   опрашивает available ПЕРВЫМ (до daily-лимита) — игрок видит
   ТЗ-строку, а не generic «уже использовано сегодня».
2. **daily-марка buildingOncePerDay** (000072/000128) — BACKSTOP:
   каталожный флаг `раз_в_день` (у 43 уже, у 39 добавляем) →
   после успеха пайплайн маркует 'x,y:43'/'x,y:39' = день;
   'уже использовано сегодня' видно, если запись buildingContent
   утеряна/сбита (мусорный сейв, ручная правка).

День D+1 — НОВЫЙ ролл (запись { day: D, type } не блокирует:
сравнение `rec.day === today`). fastForward/rest — без повтора
(день В СРАВНЕНИИ, не в ключе марки). Лут НЕ храним (повтор —
«молчит», содержимое уже выдано; a1 §6.5).

## 2. Сиды и формулы (детерминизм — ТОЛЬКО (tile, day)-сиды)

Сиды — СВОИ ASCII-константы (паттерн TELEPORT_TIE_SEED/
STONE_ROLL_SEED 000074/000075: НЕ GLOBAL_SEED; экспорт — для
golden-пинов тестов):

| Константа | Значение | Назначение |
|---|---|---|
| `CONTENT_ROLL_SEED` | 0x434f4e54 ('CONT') | тип контента (доли) |
| `CHEST_LOOT_SEED` | 0x43484553 ('CHES') | предмет сундука |
| `BOSS_COMBAT_SEED` | 0x424f5353 ('BOSS') | боевой сид босса |
| `RELIC_ITEM_SEED` | 0x52454c49 ('RELI') | реликвия |

Чистые функции (building-effects.js, рядом с блоком 000074;
все — hash ПАРАМЕТР; мусор входных данных → null, без исключений;
apply сам деградирует «недоступно»):

* `rollBuildingContent(x, y, day, доли, hash)` →
  `'chest'|'boss'|'relic'|null`. roll = deterministicRoll(x, y,
  day, CONTENT_ROLL_SEED, hash) = hash(x, y, seed ^ day)/2^32
  (дета-402, ПЕРЕИСПОЛЬЗУЕТСЯ). Кумулятивные доли в ФИКСИРОВАННОМ
  порядке каталога: `сундук` → 'chest' (roll < 0.6), `босс` →
  'boss' (roll < 0.9), остаток → 'relic'. Каждая доля — finite
  число [0,1], иначе null. (Имена КЛЮЧЕЙ доли — русские, стиль
  каталога; ВНЕШНИЕ типы — английские — значения сейва/кода.
  Решение R-1, §9.)
* `chestLoot(x, y, day, table, hash)` → id предмета|null.
  `table[hash(x, y, CHEST_LOOT_SEED ^ day) % table.length]`
  (паттерн pickFragment, деталь 413). table — МАССИВ id (таблица
  подземелий) — передаёт вызывающий (apply): ЧИСТОТА — без
  зависимостей от dungeon.js в node-тесте.
* `bossGroup(x, y, day, hash)` → ЧИСЛО (0..2^32−1) — БОЕВОЙ
  СИД: `hash(x, y, BOSS_COMBAT_SEED ^ day)`. Состав и уровень —
  НЕ здесь: СТАНДАРТНЫЕ формулы createCombat по этому сиду
  (§5, рецепт BUILDING_BOSS).
* `relicItem(x, y, day, реликвии, hash)` → id|null —
  `реликвии[hash(x, y, RELIC_ITEM_SEED ^ day) % len]`
  (паттерн pickFragment).

Правила (зафиксировано — ТЗ «зафиксировать правило»):

* **Сундук — «уровень по тайлу» = тип таблицы по тайлу**:
  `type = G.dungeonTypeFor(terrain тайла, альфа)`;
  `terrain = st.map.tileAt(x, y).terrain` (нет карты — undefined
  → default-ветка dungeonTypeFor = CAVE);
  `альфа = st.map.pixelAt(x, y)[3]`, **fallback 255** (нет
  pixelAt/мусор — прецедент moonDreamHint, строки ≈730–745).
  Таблица — `G.DUNGEON_ITEMS[type]` (dungeon.js, из каталога
  assets/dungeons; 5 типов 0..4, все не пусты). **1 предмет,
  БЕЗ золота** (ТЗ — только таблицы; wealth-вариант и золотая
  формула dungeon.js:408 ОТВЕРГНУТЫ — золотая формула
  принадлежит сундукам подземелий и не используется самими
  подземельями для «уровня по тайлу»).
* **Босс — «уровень по тайлу» через БОЕВОЙ СИД**: группа/
  уровень — СТАНДАРТНЫЕ формулы createCombat (рецепт-путь:
  level = max(1, hero.level + delta), delta ∈ [−level_delta_
  max, +level_delta_max] — SPEC «в среднем можно победить»;
  count [1,3] → 1–3 'troll'). Тот же (tile, day) + тот же
  hero.level → ТОТ ЖЕ босс (детерминизм по сиду). Формула по
  wealth (a1 §6.3 `max(1, hero.level + floor(wealth/2))`)
  ОТВЕРГНУТА: wealth — единственная тайловая величина, но
  стандартная формула единообразна со ВСЕМИ мировыми группами
  (SPEC) и не вводит частного правила.
* **Реликвия** — каталожный массив `эффект.реликвии` (8 id, §6).
* НОЛЬ Math.random/Date — только сиды (R8); hash — лениво
  G.hash2 (perlin.js) в момент apply (паттерн 000074).

## 3. Раздел сейва buildingContent

* Имя — резерв 000072 (000072 L49; план 000064 L60). ФОРМА:
  `'x,y' → { day: integer ≥ 1, type: 'chest'|'boss'|'relic' }`
  (ТЗ). Ключ — XY_KEY_RE (целые, отрицательные — храм (-42,-31)).
* Владелец — main.js: `const buildingContent = new Map();`
  (после строки buildingQuests, ≈L280). ЖИВАЯ ссылка: в init-
  бандл building-actions (одна строка, §5) → хендлер пишет
  `ctx.world.buildingContent.set('x,y', { day, type })`
  (escape-hatch world — 000128 §2.5 «допуск»).
* `serializeBuildingContent(Map)` → объект (JSON);
  `restoreBuildingContent(raw)` → Map — building-effects.js
  (после restoreBuildingQuests, ≈L1012): fail-open (000029) —
  раздел не объект/массив → пустой Map БЕЗ исключения; мусорная
  запись (ключ !~ XY_KEY_RE; value не объект; day не integer ≥ 1;
  type вне whitelist) — отброс записи, валидные выживают;
  roundtrip (тест A63). **Whitelist type — ОДНА константа в
  building-effects.js** (массив допустимых типов) — точка
  расширения для будущих «ежедневных» эффектов (контракт —
  memory/000077-daily-content.md).
* main.js: ПОЛЕ collectSaveData ПОСЛЕ buildingQuests (L356–358)
  с гардом `G.buildingEffects.serializeBuildingContent` (паттерн
  351–358, неломко v1 — 000031: версию НЕ поднимаем; старый сейв
  без раздела → пустой Map, БЕЗ warn — паттерн raw == null);
  СВОЙ try/catch-блок restore ПОСЛЕ buildingQuests-блока (≈L585,
  паттерн 559–584): раздел не объект → warn + clear; restore;
  запись с `day > clock.day` → ОТБРОС + warn (подделка, 000031 —
  дни абсолютные; day < clock.day — НОРМА, храним — повтор
  блокируется только в тот же день).
* Рост Map ОГРАНИЧЕН: ключ 'x,y' перезаписывается новым роллом —
  ≤ числа посещённых построек 39/43; очистки onDay НЕТ (не
  нужны: запись не даёт награды сама по себе).

## 4. Контракт спец-хендлера (src/building-content.js)

Модуль: UMD/IIFE (паттерн 000053/000038), **чист при загрузке**
(ноль require/DOM/чтения Game-свойств в момент загрузки — vm-
песочницы boot() грузят всю цепочку index.html, R6); при
отсутствии Game.buildingActions — console.error + деградация
(действие остаётся «сухим» apply без мир-эффекта; игра не
роняется — 000053). Регистрация: `registerSpecial('43', fn)` +
`registerSpecial('39', fn)` — ОДИН fn на оба id.

Поля ctx (000128 §2.5), используемые хендлером: `r` (результат
apply), `tile` {x,y}, `hero` (ЖИВАЯ ссылка), `day`,
`startCombat` (= deps.startCombat — узкая точка), `world`
(escape-hatch: `world.buildingContent`, `world.game`).

Порядок (контакт-по-контакт):

```
r = ctx.r;  // apply гарантирует ok:true + type при вызове
guard: r.type ∈ {chest, boss, relic}; world.buildingContent — Map
key = tile.x + ',' + tile.y
chest | relic:
  res = world.game.addItem(ctx.hero, r.item, 1)   // items.js: {ok, reason?}
  if (!res.ok) return { ok:false, message: res.reason || 'инвентарь полон' }
      // ОТКАЗ ДО ЗАПИСИ (000128 §2.6): без daily-марки/saveNow/
      // render — день НЕ сгорает, повтор доступен (детерминированный
      // ролл даст тот же предмет; инвентарь разгрузили — пройдёт)
  world.buildingContent.set(key, { day: ctx.day, type: r.type })
  return { ok: true }      // message — из apply (r.message — приоритет
boss:                                  // пайплайна, 000128 §2.4)
  if (typeof ctx.startCombat !== 'function')
      return { ok: false, message: 'недоступно' }
  world.buildingContent.set(key, { day: ctx.day, type: 'boss' })
  ctx.startCombat('BUILDING_BOSS', { seed: r.seed })   // стандартный
  return { ok: true }                     // поток (Эфир/buffMods/saveNow —
                                         // существующие точки)
```

* apply СТРОИТ message (чистый — имя предмета через ленивый
  G.getItem(id).название, fallback id); хендлер сообщений НЕ
  строит.
* Успех хендлера → общий пайплайн: hasDailyLimit (каталог — 43
  уже/39 с этой задачи) → марка 'x,y:43'|'x,y:39' = день →
  **saveNow СРАЗУ** (персиистирует buildingContent И марку —
  одна запись) → flash(r.message) → playerRender.
* Босс: запись ПЕРЕД startCombat — контент уже явлен; исход боя
  (победа/побег/смерть) НЕ отменяет день («содержимое уже
  получено»). onEnd стандартный startCombatAt (§5).
* try/catch вокруг хендлера НЕТ (000128 §2.4 — 1:1; баг хендлера
  ловят его тесты).

## 5. Проводка и рецепт босса

* **src/combat.js — рецепт (КОД, не каталог)**: после const
  GROUP_RECIPES (≈L160), ДО остальных потребителей:
  `GROUP_RECIPES.BUILDING_BOSS = { name: 'building_boss',
  count: [1, 3], mobs: ['troll'] };`
  Каталог assets/mob_groups ЗАПРЕЩЁН: schema (000057) — id 1..7,
  `число` 2..6, спрайт enum — 1–3 моба не проходят; альтернатива
  «8-я группа в каталоге» ТОЖЕ запрещена: mobGroupCount() 7→8
  ломает генерацию карт (hash2 % N, МОБИЛЬНЫЕ группы) и пины
  «ровно 7» — новый map_index ЗАПРЕТ (000064, R1). wolf_pack-
  паттерн: count → n копий mobs[0] (createCombat L1592–1594).
  'troll' — СУЩЕСТВУЮЩИЙ id (MOB_TYPES, leader, 2×2, нейтральный,
  dmg 1.5/hp 2.5 — «босс-достойный» существующих); 3×2×2 вписаны
  в 7×7: placeUnits (L1356) big-first, scan row-major → (0,0),
  (2,0), (4,0) (проверено).
* **createCombat (groupType-путь, L1589–1594)** — без правок:
  `GROUP_RECIPES['BUILDING_BOSS']` найден строковым ключом;
  rng = mulberry32(seed): ПЕРВЫЙ бросок — delta уровня, ВТОРОЙ —
  count (1–3); level = max(1, hero.level + delta). Имя в логе
  боя — recipe.name 'building_boss' (combat-ui L808:
  G.mobGroupName('BUILDING_BOSS') → '' — гард не-integer
  map.js L374 → falsy → recipe.name).
* **src/main.js — 4 МИНИМАЛЬНЫЕ точки** (D4/R2):
  1. `const buildingContent = new Map();` (≈L280);
  2. collectSaveData: + поле `buildingContent` (гард serialize,
     ПОСЛЕ buildingQuests) + СВОЙ try/catch-блок restore
     (ПОСЛЕ buildingQuests-блока ≈L585, §3);
  3. init-бандл: + `buildingContent` (1 строка, после
     buildingQuests ≈L777);
  4. `startCombatAt(groupType = 0, extra = null)`:
     `seed: (extra && extra.seed != null) ? extra.seed : 42`
     (одна строка). ОДНОАРГУМЕНТНЫЕ вызовы (debug-бой,
     __game.actions.startCombat — делегация L1597) — БЕЗ
     ИЗМЕНЕНИЙ (seed 42). 000128 §2.7 прямо разрешает:
     «расширение wiring-бандла … решается в 000077». НОВОЙ
     функции startBuildingCombat НЕ СДЕЛАНО (вариант a1
     отклонён: одна точка истины для мир-боя сохраняется;
     startDungeonCombat — подземельный поток, не подходит:
     dungeonState/prevX).
* **onEnd босса (R3) — безопасен БЕЗ ПРАВОК**: startCombatAt НЕ
  пишет defeatedAt (это другой бой — блуждающая группа тайла,
  L984–999, ключ тайла героя — босс НЕ скрывает её);
  notifyGroupDefeated(NPCS, questBook, 'BUILDING_BOSS') —
  no-op: kill_group-цели НЕсут ТОЛЬКО числа 0..6 (каталог
  assets/npc), `goal.группа !== groupType` (npc.js L359) —
  строка не совпадёт никогда.
* **index.html**: script-тег `src/building-content.js` СРАЗУ ПОСЛЕ
  тега building-actions.js (L664) — зарезервированный слот
  спец-модулей (комментарий L660–663: «спец-модули (000077/
  000091–95) и hud.js»); ДО hud.js (L670) и main.js (L678).
  Пин tests/index-order.test.js: + файл в список «нужные модули»
  + порядок `building-actions.js < building-content.js <
  main.js` (adjacency НЕ фиксировать — между ними hud.js).

## 6. Каталог (assets/buildings)

* **000043.json**: `эффект` строка «редкий сундук или спавн
  босса (раз в игровой день)» → ОБЪЕКТ (конвенция 000074/000075):
  ```json
  "особые_параметры": {
    "эффект": {
      "доли": { "сундук": 0.6, "босс": 0.3, "реликвия": 0.1 },
      "реликвии": ["phoenix_feather", "heavy_tome",
        "stone_fist_grimoire", "knight_plate", "moonstone",
        "fire_spellbook", "ice_spellbook", "iron_hide_tome"]
    },
    "раз_в_день": true,
    "размещение": { "слот": 10, "доля": 15 }
  }
  ```
  (раз_в_день уже true; размещение НЕ ТРОГАТЬ — пин 000073,
  tests/buildings.test.js L857+).
* **000039.json**: + `раз_в_день: true` + `эффект` (ОБЪЕКТ ТОЙ
  ЖЕ формы, те же доли/реликвии); `даёт` (строка) СОХРАНЕН —
  потребителей НЕТ (free-form, schema открытая — assets/
  buildings/schema.json L70–72), `размещение { слот: 8, доля: 10 }`
  НЕ ТРОГАТЬ (пин 000073).
* **Реликвии — 8 СУЩЕСТВУЮЩИХ id** (проверено по assets/items,
  ТЗ: новых предметов НЕТ): phoenix_feather (000024),
  heavy_tome (000029), stone_fist_grimoire (000025),
  knight_plate (000010), moonstone (000023), fire_spellbook
  (000027), ice_spellbook (000028), iron_hide_tome (000026).
* **Зеркало src/buildings.js — РЕГЕНЕРАЦИЯ** `npm run sync:
  buildings` (scripts/sync-buildings-data.js) ПОСЛЕ правки JSON
  (НЕ руками: byte-тест tests/buildings.test.js L96–109 +
  sync-all drift-gate). Записи 39/43 — ≈L511/≈L556.
* **000053**: доли/реликвии код читает ТОЛЬКО из st.catalog.
  особые_параметры.эффект (catalogEffect, строка ≈475) — НИЧЕГО
  не хардкодит (fallback'ов для долей НЕТ — мусор → «недоступно»).
* Readers `op.эффект` проверены (R5): building-actions.js L198/
  L342 — ханки телепорта id 41 (typeof 'object' guard — для 43
  объект — телепорт-ханк НЕ срабатывает: r.teleport от 43
  отсутствует); building-effects.js catalogEffect — общий.
  `grep -rn "эффект" src/` — при реализации.

## 7. Тексты (что в коде, что в каталоге)

* Имена действий — **реестр** (ТЗ/SPEC): `'43'` → **«Круг»**,
  `'39'` → **«Храм»** (паттерн 000074 «Расшифровать»).
* Повтор в тот же день — **ТЗ-текст** (reason disabled-строки
  available, ДО daily-лимита; для 43 И 39): **«круг молчит:
  содержимое уже получено»** (стиль 000075 «круг молчит: нет
  пары вблизи»).
* Success-сообщения — **В КОДЕ** (ТЗ не фиксирует каталожные
  ключи; 000053 соблюдён для ЧИСЕЛ — доли/реликвии в каталоге):
  * сундук:  `«<Действие>: сундук — „<название предмета>“.»`
  * босс:    `«<Действие>: босс — к бою!»`
  * реликвия:`«<Действие>: реликвия — „<название>“.»`
  где `<Действие>` — имя из реестра (applyDailyContent(st,
  имяДействия) — общий apply на обе записи, имя-параметр);
  название — ленивый G.getItem(id).название (fallback — id).
* Отказ apply (нет hash2/dungeonTypeFor, мусор каталога, нет
  таблицы/предмета) — «недоступно» (паттерн 000074).

## 8. Тесты (красные — 12; технические твики — 6; процесс — 2)

**Красные (RED-причины — отсутствующий символ/запись/поле):**

* A55–A63 (node, tests/building-effects.test.js, loadBE/withGame
  — паттерн A42–A54): A55 экспорты (4 чистые + serialize/
  restore + 4 сида); A56 доли N=10000 (tile,day) — 60/30/10
  ±2%; A57 детерминизм (тот же (tile,day) → тот же тип+лут;
  другой — может отличаться); A58 каталог (39: раз_в_день +
  эффект.доли/реликвии; 43: эффект-объект; зеркало BUILDINGS[
  38]/[42] deepEqual JSON); A59 реестр (имя/apply у '39'/'43';
  buildingActions по записям каталога даёт строки «Храм»/«Круг»);
  A60 повтор (снимок {day: сегодня} → ok:false + reason; день
  D+1/нет записи → новый ролл ok:true); A61 босс (recipe: id ∈
  MOB_TYPES, count [1,3], createCombat({player, groupType:
  'BUILDING_BOSS', seed}) smoke + состав 1–3); A62 сундук/
  реликвия (id ∈ DUNGEON_ITEMS[type]; id ∈ эффект.реликвии ∩
  assets/items); A63 roundtrip serialize/restore + fail-open
  (мусор — warn + пусто, не роняет).
* C1 (tests/combat.test.js): GROUP_RECIPES.BUILDING_BOSS —
  { name: string, mobs: [id ∈ MOB_TYPES], count: [1,3] } +
  РЕГРЕССИЯ: 7 каталожных (0..6) — name/mobs/count ≡ каталогу
  (защита от переделки при добавлении).
* S1 (tests/assets-schemas.test.js): 39/43 — schema.json (проходят
  и до, и после — free-form) + форма НОВЫХ полей (эффект —
  object: доли {сундук/босс/реликвия: числа, сумма 1}, реликвии
  — array id; 39: раз_в_день true).
* B24 (vm, boot() — полная цепочка index.html): e2e [E] у 43
  (golden (4,3)) и 39 ((-42,-31), BFS-предикат по buildingId):
  HUD «[E] действия» (hasEffects → true — НОВОЕ поведение); [E]
  → строка «Круг»/«Храм»; выбор → ролл: chest/relic — предмет в
  инвентаре, boss — бой стартует (стандартный поток); сейв
  СРАЗУ: buildingContent['x,y'] = { day, тип } + daily-марка
  'x,y:43'|'x,y:39'; повтор в день D — строка disabled
  («круг молчит: содержимое уже получено»), apply повторно НЕ
  вызывается; день D+1 (fastForward) — новый ролл.

**Технические твики (смысл НЕ меняется; семантических правок
существующих тестов НЕТ):**

1. A1 (L136–138): deepEqual → `['36','37','38','39','40','41',
   '42']` (комментарий пина L133 ПРЕДПИСЫВАЕТ union).
2. A1 (L144–145): отрицательный ассерт `hasOwnProperty('39')
   === false` — инвертировать/убрать + обновить комментарий
   (запись '39' теперь в реестре — это и есть 000077).
3. B5 (L2681): findBuilding(..., false) → + предикат
   `!G.buildingEffects.hasEffects(b)` — первая постройка без NPC
   (4,3) id 43 ПОСЛЕ изменений имеет эффекты; смысл («без NPC и
   без эффектов — ничего») сохраняется.
4. combat.test.js L161 («2-6 мобов, ±3»): итерация GROUP_RECIPES
   — ТОЛЬКО числовые ключи (filter: `String(type) === String(
   Number(type))`) — строковый 'BUILDING_BOSS' дал бы
   `Number → NaN → throw «неизвестный тип группы»`.
5. combat.test.js L860 («побеждает ВСЕ стандартные группы»): тот
   же фильтр (смысл «стандартные = 7 каталожных»).
6. combat.test.js L883 («безопасная зона»): тот же фильтр
   (боссовый состав НЕ заносить молча в «все группы»).
   + mob-groups.test.js L269–274 («зеркало ≡ каталогу»): фильтр
   числовых ключей ДО map(Number) (иначе NaN в deepEqual [0..6]).

**Процессные шаги:** `npm run sync:buildings` после правки JSON
(иначе buildings.test.js L102 + sync-all); index-order-пин —
вместе с тегом (зелёная стадия: пин добавленного тега —
фиксатор, не red-тест — RED-проверка остаётся ровно 12).

НЕ ТРОГАТЬ: B3/B10/B11/B12 (save/restore временных записей и
BFS без флага устоят), mob-groups GOLDEN_COMPOSITIONS (seed 42,
числовые ключи), combat L188/L227/L648/L665 (фиксаторы
кастомного состава), save*/building-actions BA1–BA7 (deps-бандл
проверяется ПОДМНОЖЕСТВОМ ключей L347–353 — +buildingContent
не ломает), hud.js (мок hasEffects), main-visuals/city-screen.

## 9. Решения открытых вопросов (a1 §6 → финал)

| # | Вопрос | Решение | Почему |
|---|---|---|---|
| R-1 | Ключи доли | русские `сундук/босс/реликвия` (каталог) + английские типы 'chest'/'boss'/'relic' (код/сейв) | каталог целиком на русском (000053); значения сейва — код-конвенция (teleports/buildingQuests — латиница) |
| R-2 | Состав босса | фикс в КОДЕ: 'troll', count [1,3] | каталог mob_groups запрещён схемой (id≤7, число 2..6, 000057); 8-я группа ломает карты (000064); troll — leader, 3×2×2 в 7×7 (placeUnits) |
| R-3 | Уровень босса | стандартная формула createCombat (hero.level ± level_delta_max) по БОЕВОМУ СИДУ (tile,day) | SPEC «в среднем можно победить» единообразно; wealth-формула отклонена (частное правило без выгоды) |
| R-4 | Правило сундука | 1 предмет, БЕЗ золота; таблица по dungeonTypeFor(terrain тайла, альфа pixelAt, fallback 255 — moonDreamHint) | ТЗ «лут таблицами подземелий» — предметы; «уровень по тайлу» = тип таблицы по тайлу (как реальные пещеры); wealth/золото — не у самих подземелий |
| R-5 | Содержимое buildingContent | { day, type } — лут НЕ храним | повтор — «молчит», содержимое выдано; рост Map ограничен (перезапись ключа) |
| R-6 | Имя спец-модуля | src/building-content.js | один модуль на общий механизм (оба id); имя = имя механизма (daily content) |
| R-7 | Отказ addItem | {ok:false} ДО записи — день не сгорает (000128 §2.6) | отказ = «эффект не сработал» — повтор в тот же день (детерминированный ролл → тот же предмет) |
| R-8 | startCombatAt vs startBuildingCombat | расширение startCombatAt(groupType, extra=null): seed extra.seed ?? 42 | 000128 §2.7 разрешает wiring-расширение в 000077; одна точка истины мир-боя; debug-вызовы без изменений |
| R-9 | onEnd босса | без правок | defeatedAt — чужой бой; notifyGroupDefeated('BUILDING_BOSS') — no-op (kill_group: только 0..6) |

## 10. Файлы и точки (file:line по baseline f0e0c20)

| Файл | Точка | Что |
|---|---|---|
| src/building-effects.js | шапка (L1–95) | комментарий-блок 000077 (паттерн 000074/000075) |
| src/building-effects.js | L132–134 (сиды) | + 4 ASCII-сида (export) |
| src/building-effects.js | ≈L281 (после EFFECTS['42']) | + EFFECTS['43'] «Круг», EFFECTS['39'] «Храм» + групповой комментарий |
| src/building-effects.js | ≈L470 (блок 000074) | + readBuildingContentEntry, rollBuildingContent, chestLoot, bossGroup, relicItem, applyDailyContent (+ validShares/whitelist-константа) |
| src/building-effects.js | ≈L1012 (после restoreBuildingQuests) | + serializeBuildingContent/restoreBuildingContent |
| src/building-effects.js | L1014–1027 (export) | + 4 чистые + readBuildingContentEntry + serialize/restore + 4 сида |
| src/combat.js | ≈L160 (после const GROUP_RECIPES) | + GROUP_RECIPES.BUILDING_BOSS (1 рецепт, коммент 6–8 строк) |
| src/main.js | ≈L280 | + `const buildingContent = new Map();` |
| src/main.js | L356–358 (collectSaveData) | + поле buildingContent (гард serialize, ПОСЛЕ buildingQuests) |
| src/main.js | ≈L585 (после buildingQuests-блока) | + СВОЙ try/catch-блок restore buildingContent |
| src/main.js | L718 (startCombatAt) | сигнатура + seed из extra (1 строка) |
| src/main.js | ≈L777 (init-бандл) | + buildingContent (1 строка) |
| src/building-content.js | НОВЫЙ | спец-модуль: саморегистрация '43'/'39' + хендлер (§4) |
| index.html | после L664 (тег building-actions.js) | + script-тег + комментарий (слот спец-модулей L660–663) |
| assets/buildings/000043.json | особые_параметры.эффект | string → объект { доли, реликвии } |
| assets/buildings/000039.json | особые_параметры | + раз_в_день: true, + эффект (тот же объект) |
| src/buildings.js | ≈L511/≈L556 | РЕГЕНЕРАЦИЯ `npm run sync:buildings` |
| tests/building-effects.test.js | L136–145 (A1) | технический union + снятие отрицательного '39' |
| tests/building-effects.test.js | L2681 (B5) | технический предикат «без эффектов» |
| tests/building-effects.test.js | конец секций A/B | A55–A63, B24 |
| tests/combat.test.js | L161/L860/L883 | технический фильтр числовых ключей |
| tests/combat.test.js | новый тест | C1 |
| tests/mob-groups.test.js | L269–274 | технический фильтр числовых ключей |
| tests/assets-schemas.test.js | новый тест | S1 |
| tests/index-order.test.js | L35–49 + новый порядок-тест | + src/building-content.js; building-actions < building-content < main |
| memory/ | НОВЫЕ | 000077-building-content.md (этот), 000077-daily-content.md |
| CHANGELOG.md | 2026-10-02 | упоминание (игровой процесс — отдельный коммит) |
| tasks/ | done-стадия | pending→done + tasks/result/000077.md |

НЕ ТРОГАТЬ: src/building-actions.js, src/building-ui.js,
src/combat-ui.js, src/items.js, src/dungeon.js, src/map.js,
src/npc.js, src/save.js (v1), assets/buildings/schema.json,
assets/mob_groups/, assets/dungeons/, SPEC.md, .merge-pending,
push; новые ассеты/мобы/предметы — НЕ ВВОДИТЬ (ТЗ); чужие записи
EFFECTS ('91'–'95' — параллельные P3; union-пин A1 беречь при
ребейзе по факту состава master, паттерн 000074 R9).

## 11. Ленивые ссылки и guards (паттерны, соблюдение)

* building-effects.js: hash/dungeonTypeFor/DUNGEON_ITEMS/getItem
  — ЛЕНИВО из globalThis.Game в момент apply (canUseTodayLazy-
  паттерн); нет G.hash2 или G.dungeonTypeFor → «недоступно»
  (node-тесты — withGame-инъект; vm — полная цепочка).
* building-content.js: Game.buildingActions — ЧИТАЕТСЯ при
  загрузке (регистрация — load-time обязанность, паттерн 000128
  §2.3: спец-модули регистрируются ДО init); нет модуля →
  console.error + деградация. Внутри хендлера — guards на
  world.buildingContent/world.game/ctx.startCombat (вызов, не
  загрузка).
* main.js: гард serialize/restore (G.buildingEffects && …) —
  модуль эффектов отсутствует → раздел {} / секция пропущена
  (000053); own try/catch — битый раздел не роняет загрузку.
* restore: `raw == null` (старый сейв) — без warn; мусор —
  warn + пусто/отброс (000029).

## 12. Важно будущим задачам (000091–000095 и после)

* Механизм «ежедневный контент» — переиспользуемый контракт:
  memory/000077-daily-content.md (сиды/роллы, buildingContent,
  whitelist type, повтор-защита, семантика отказа).
* EFFECTS-реестр — записи добавляются в КОНЕЦ (R9: параллельные
  000091/000092 правят ту же зону ≈L281, A1-пин, init-бандл,
  слот index.html L660–663, зеркало src/buildings.js — минимизировать
  правки; все новое — в конец своих секций).
* startCombatAt — теперь принимает extra { seed }; новые
  боевые точки — расширяют extra, НЕ создают параллельных
  функций (одна точка истины).
* GROUP_RECIPES — строковый ключ 'BUILDING_BOSS' легален;
  ЧИСЛОВЫЕ итерации по GROUP_RECIPES (тесты) обязаны фильтровать
  числовые ключи — паттерн закреплён 4 твиками (не «лечить»
  обратным путём — рецепт не двигать в каталог).
* buildingContent — общий раздел для «ежедневных» эффектов:
  новый тип контента — расширить whitelist-константу в
  building-effects.js (ОДНО место) — контракт §3/
  memory/000077-daily-content.md.

## 13. Подводные камни

* **R1-остаток**: строковый ключ в GROUP_RECIPES — 4 итерации
  (combat ×3 + mob-groups ×1) обязаны фильтровать числовые
  ключи; «8-я группа в каталоге» — запрещена (карты).
* **B5** — единственная жертва появления EFFECTS['43'] (первая
  постройка без NPC = (4,3) id 43): предикат «без эффектов».
* **A1** — union по факту: при ребейзе на мастер с записями
  000091/000092 пин = union по факту состава (паттерн 000074).
* **Зеркало** — БЕЗ `npm run sync:buildings` после JSON провалят
  buildings.test.js L102 + sync-all (процессный шаг, не правка
  теста).
* **vm boot()** — новый модуль обязан быть чист при загрузке
  (R6): нет console/require/чтения Game-свойств в момент
  загрузки (кроме Game.buildingActions для регистрации — как у
  всех спец-модулей 000128).
* **Сообщения**: pайплайн приоритизирует r.message над
  sres.message — success-тексты строятся в apply; хендлер
  message НЕ возвращает (кроме отказов).
* **Сейв-раздел в collectSaveData** — ПОСЛЕ buildingQuests
  (порядок полей не фиксирован тестами, но паттерн — кластер
  building*-разделов подряд).
* **Каталог 39 'даёт'** — сохраняем (нет потребителей, free-
  form schema); НЕ удалять (пин 000073 читает только
  размещение, но 'даёт' — часть записи; удаление = лишний diff).
* **Тест A61**: createCombat smoke — ОБА пути: groupType-путь
  ('BUILDING_BOSS') — тот, что использует игра; mobs-путь
  (opts.mobs) — существующий фиксатор L665 (не трогать).

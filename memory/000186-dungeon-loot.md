# 000186 — Согласованность лута подземелья: золото в тексте победы + сундук overflow → авто-золото — КОНТРАКТЫ

**Тип задачи: НОВАЯ ФУНКЦИОНАЛЬНОСТЬ** — две точечные правки проводки в `src/main.js`
(dungeon-регион) + e2e-пины. Источник: аудит 000158 (finding a3-tests §3.3,
`tasks/result/000158.md`, `memory/000158-world-loot.md` §2 строка 000186 / §3 / §7).
Семантика overflow — прецедент задачи **000132** (`tasks/done/000132.md`, хелпер
`combatEndLoot` в main.js, пины `tests/loot-e2e.test.js` V1/V2/S1).

База (измерена в worktree, 2026-10-11): master **3ce98ad** (000153.01 смержен —
main.js сдвинут, ВСЕ строки ТЗ устарели), `npm test` = **2077/2077** зелёных
(ТЗ «2060» устарело). → После фикса: **2080/2080** (+3 теста).

**Номера строк — на 3ce98ad; при rebase искать ТОЛЬКО текстовыми якорями** (§7).

## 1. Что добавлено / перенесено

| Файл | Изменение |
|---|---|
| `src/main.js` | 2 ханка (якоря текстом): **(a)** dungeon-строка победы — якорь `(g.boss ? 'Босс' : 'Группа') + ' повержена. +' + res.xp + ' опыта.'` (onEnd `startDungeonCombat`, victory-ветка, L2410) → `… +' опыта, +' + res.gold + ' золота.'`; **(b)** chest-ветка `dungeonOnMove` — якорь `' (инвентарь полон: ' + it.name + ' потерян)'` (L2305-2307) → if/else по 000132: `add.ok` → `', ' + it.name` (без изменений); `!add.ok` → `overflow = typeof it.value === 'number' ? it.value : 0` → `hero.gold += overflow` → `itemMsg = ' (не влезло: +' + overflow + ' золота)'` |
| `tests/dungeon-loot-e2e.test.js` | **НОВЫЙ ФАЙЛ** (НЕ добавление в `loot-e2e.test.js` — см. решение 1, §8): harness = дубль `bootSandbox` из `tests/loot-e2e.test.js` (дублирование харнессов — принятая конвенция 000083/000087/сам loot-e2e) + хелперы `asideDir`/`stepTo` + 3 теста A1/B1/P1 (§5) |
| `memory/000186-dungeon-loot.md` | этот файл |
| `tasks/pending/000186.md` → `tasks/done/000186.md` | перенос (git mv) — в главном коммите |
| `tasks/result/000186.md` | краткий отчёт |
| `CHANGELOG.md` | **ОТДЕЛЬНЫЙ коммит**: `## 2026-10-11` → `### Игровой процесс`, 2 пункта (a)+(b) — для игрока, без программной части (задача меняет игровой процесс) |

**НЕ делается** (строго по ТЗ — не больше): новых src-модулей НЕТ; index.html —
без правок (0 script-тегов → `tests/index-order.test.js` не трогаем); ассетов НЕТ
(`svg.test.js` не трогаем); SPEC НЕ меняется (overflow-семантики сундука нет;
`spec/` — «сундук» только генерация/хранение, семантика = прецедент 000132);
`combat.js` (начисление — ядро), `combatEndLoot` (паттерн, НЕ вызывать из chest-
ветки), мирские victory-строки, каталог items, `chest.gold` — **НЕ ТРОГАТЬ**.
**techTweaks = []** — единой правки существующих тестов: grep-аудит доказал, что
оба пути НЕ запинены (в tests/ `повержена. +` / `Сундук: +` / chest-«потерян» —
0 совпадений; `tests/hud.js.test.js` L372 «Группа … повержена.» — ДРУГОЙ контекст:
мирский HUD `hud.js` L216, строка без «+N опыта»).

## 2. Контракты и границы

### 2.1 (a) Строка победы в подземелье
- **Формат**: `Босс/Группа повержена. +X опыта, +Y золота.` — Y = `res.gold`.
- **Граница**: префикс «Босс/Группа» — БЕЗ изменений. Золото ВСЕГДА начислялось
  в ядре: `combat.js` `checkVictory` L1183 `c.player.gold += gold` (live-ссылка
  на hero; ВСЕ контексты боя, включая подземелье) — фикс меняет ТОЛЬКО текст.
- **Инвариант `res.gold`**: в victory — ВСЕГДА число ≥ 3: `gold = Σ round(
  3 + 2·level + rng·level)` по поверженным (combat.js L1180); victory ⇒
  killed ≥ 1 (0 поверженных = `'fled'`, L1211) → «+0 золота» невозможен.
- **Паритет** (образец, не трогать): мирские hudFlash `Победа! +X опыта,
  +Y золота.` (main.js L1638 `startCombatAt`, L2081 `maybeStartCombat`) и
  core-лог combat.js L1208.
- **Строка НЕ обязательно последняя в `ds.log`**: за ней идут «Лут: …»
  (000132; в РЕАЛЬНОМ бою `c.result.items` может быть непуст) и строки отряда
  (000087) → ассерт по ПРЕФИКСУ `Группа повержена. +` (`find`), НЕ
  `ds.log[ds.log.length-1]`.
- Комментарии L2426/L2431 (цитируют «…повержена. +N опыта.») — **НЕ меняем
  осознанно**: многоточие остаётся верным после фикса, ТЗ правку комментариев
  не требует (минимальный дифф; решение 7, §8).

### 2.2 (b) Сундук overflow → авто-золото (семантика 000132)
- **Поведение**: `const add = G.addItem(hero, chest.item)` — ВСЕГДА возвращает
  `{ok, reason?}`, никогда null (items.js L340) →
  * `add.ok` → `itemMsg = ', ' + it.name` — **без изменений**;
  * `!add.ok` (ЛЮБОЙ отказ: вес / слоты / неизвестный id):
    - `overflow = (typeof it.value === 'number' ? it.value : 0)` — **ОДИН
      предмет, qty = 1** (сундук даёт ровно один предмет — в отличие от
      боевого лута, где Σ value×qty);
    - `hero.gold += overflow` — live-ссылка (паттерн 000132, combatEndLoot
      L588);
    - `itemMsg = ' (не влезло: +' + overflow + ' золота)'` — словесность
      000132 дословно (combatEndLoot L589).
- **Предмет НЕ теряется** — конвертируется в золото по каталожному **value**
  (НЕ sellPrice лавки — паритет 000132).
- **Итоговый формат строки**: `Сундук: +G золота (не влезло: +V золота)`
  (V = `it.value`); при успехе — `Сундук: +G золота, <name>` (без изменений).
- **Границы — НЕ ТРОГАТЬ**: `hero.gold += chest.gold` (L2293 — золото сундука
  ВСЕГДА, отдельный член, как раньше); ghost-гард `if (it)` (000153.01:
  `it === null` → не начисляется, сообщений нет, fallback НЕТ); проводка
  `ds.log.push(msg)` + `hudFlash = msg` + `playerUI.render()` (L2310-2315).
- **`it.value`** — required в `assets/items/schema.json` (number, 1..100000);
  у всех **62** предметов — число (000157.01 смержен: +11 reagent; ТЗ «51»
  устарело). Тестовые: `knight_plate` — value **400**, weight 7, armor;
  `wood_log` — value 3, weight 2, reagent (стопится, 1 слот на 14 шт).
- **Детерминизм**: 0 новых rng-вызовов (`overflow` — чистая функция от
  `it.value`; строка — от `res.xp/res.gold`) — потоки RNG боя/сундуков не
  меняются (`openChest` — без rng, уже).

## 3. Ленивые ссылки и guards
- **Новых модулей НЕТ** → UMD-ловушки 000038/000053 не касаются; script-тегов
  нет → vm-песочницы цепочку не меняют.
- `G.getItem`/`G.addItem` — уже читаются **лениво в момент вызова** в
  chest-ветке (L2297/2304) — структура не меняется.
- Guard `typeof it.value === 'number'` — дословно 000132 (в каталоге
  недостижим: 62/62 number; призрак → `it === null` → не входит в `if (it)`;
  guard — паттерн хелпера, не новая ветка поведения).
- `add.ok` — безопасно: `G.addItem` не возвращает null.

## 4. vm-e2e механика подземелья (переиспользовать будущим dungeon-задачам)
- **Harness**: дубль `bootSandbox` из `tests/loot-e2e.test.js` (полная
  `<script>`-цепочка index.html, localStorage-мок, `NOW = 1000`, `drain × 3`);
  `assets/map.png` → ВСЕГДА `onerror` → `G.generateSeedPixels`
  (детерминированно, фиксированный seed мира).
- **Вход**: `const ds = g.actions.enterDungeon()` — **БЕЗ аргумента**
  (прецедент CB-9, main-visuals L1902; флаг `memoryBanned` НЕ ставится; тест
  НЕ выходит из подземелья → dungeonMemory не пишется — взаимодействие с
  000153.01 нулевое). Возвращает **ЖИВОЙ** `dungeonState`: `ds.log`
  (журнал — ассерт НАПРЯМУЮ), `ds.dg` (cells/width/height/entrance/exit),
  `ds.contents` (mobs/chests — **заменяются ПОСЛЕ входа**), `ds.x/ds.y`.
  Accessor `__game.dungeon` (main.js L3091-3127) `log` НЕ выставляет —
  использовать возвращаемый `ds` (accessor расширять нельзя: строго по ТЗ).
- **Детерминизм — клетка**: `asideDir(d)` — первый FLOOR-сосед `d.entrance`
  в порядке `[[1,0],[-1,0],[0,1],[0,-1]]` (`d.cells[ny*w+nx] ===
  G.CELL_FLOOR`, skip `d.exit`). **НЕ хардкодить `entrance.x+1`** — может быть
  стеной (шаг = no-op). (Черновик a3 с x+1 — отвергнут.)
- **Шаг**: диспатч `keydown {code:'Arrow*'|…, preventDefault, stopPropagation}`
  в `h.winListeners['keydown']` — dungeon-ui L276 (гейты `isActive()` +
  `!combatUI.isActive()` → `ctx.onMove`); мир НЕ сдвигается: keydown main.js
  L1743 имеет гейт `G.dungeonUI.isActive() → return` (L1781). 1 клавиша =
  1 клетка (`dungeonMove` синхронен).
- **Реальный бой** (НЕ мутация `c.result` — решение 2): группа на клетке →
  `ev.type 'combat'` → `startDungeonCombat` → `G.combatUI.isActive() === true`
  → `c = G.combatUI.current()` (live; accessor `g.combat` — то же) → для
  КАЖДОГО живого моба `G.combatInternals.dealDamageToMob(c, m, 9999)` →
  `checkVictory` срабатывает (все мобы мертвы; **Эфир НЕ убивать** — ядро
  считает только мобов; `dealDamageToAlly` — сценарий самого CB-9, нам не
  нужен) → `c.result = { outcome:'victory', xp, gold, defeated, allyXp, items }`
  (**Y = `c.result.gold` ЧИТАЕТСЯ из результата** — ручного расчёта ролла не
  требуется; seed боя детерм.: `hash2(17, level, 0xb055)` для id 'g0') →
  `G.combatUI.handleCode('Space')` → finish → onEnd (CB-9; 'Escape' — тоже
  закрывает, V1/V2, но пин — 'Space' по CB-9).
- **Форма группы** (дословно `generateDungeonContents`, dungeon.js L424+):
  `{ id:'g0', mobIds:['skeleton'], x, y, level:1, defeated:false }`. `skeleton`
  — в `assets/mobs` (36 id, проверено); `'cave_beast'` из черновика a3 в
  каталоге **НЕТ** — не использовать.
- **Сундук**: `ds.contents = { mobs:[], chests:[{ id:'c1', x, y, opened:false,
  gold:37, item:'knight_plate' }], seed:1, step:0 }` — `openChest`
  (dungeon.js L697-703) возвращает СОБСТВЕННЫЕ gold/item сундука БЕЗ rng и
  ставит `opened = true`; **`mobs: []` ОБЯЗАТЕЛЕН** — `dungeonMove` проверяет
  мобов ДО сундука (locations.js L358+), а `wanderStep` с пустыми mobs —
  no-op (только `step++`; `seed` — number для `hash2` в wanderStep).
- **Полный инвентарь**: `g.actions.giveItem('wood_log', 14)` — 28 кг ≤ 30
  (прецедент V2; `maxCarry = BASE_CARRY_WEIGHT 30 × carryWeightMult 1` —
  items.js L51/284-285); `knight_plate` 7 кг → 28+7 = 35 > 30 → отказ по весу
  (`checkAdd`, items.js L325).

## 5. Красные / зелёные (3 новых теста в `tests/dungeon-loot-e2e.test.js`)

| id | тест | почему красный СЕЙЧАС | зелёный ассерт |
|---|---|---|---|
| **A1** | dungeon-победа → золото в строке | в строке L2410 нет члена `+' +' + res.gold + ' золота'` | `ds.log.find(l => l.startsWith('Группа повержена. +'))` содержит `+${c.result.xp} опыта, +${c.result.gold} золота.`; бонус: Δhero.gold = +Y (ядро L1183) |
| **B1** | сундук при полном инвентаре → авто-золото | ветка `!add.ok` — `'(инвентарь полон: … потерян)'`, начисления `hero.gold += it.value` в chest-ветке НЕТ | строка ПОБАЙТОВО `Сундук: +37 золота (не влезло: +400 золота)`; Δhero.gold = 37 + 400; slots `[{wood_log, qty:14}]` (knight_plate НЕ добавлен — предмет НЕ в инвентаре и НЕ потерян: конвертирован); «потерян»/«инвентарь полон» в строке НЕТ; бонус: hudFlash = строка после `mainFrameAt` |
| **P1** | паритет-пин (буллет 3 ТЗ) | в dungeon-ветке onEnd НЕТ шаблона `опыта, +N золота` (только мир/combat.js) | строка === `/^Группа повержена\. \+(\d+) опыта, \+(\d+) золота\.$/` и числа === `c.result.xp` / `c.result.gold` — хвост идентичен мирскому `Победа! +X опыта, +Y золота.` |

Сценарии A1/P1: `boot(seedSave({day:2, hero: mkHero({gold:100})}))` →
`enterDungeon()` → замена `ds.contents.mobs = [группа на asideDir-клетке]`,
`chests = []` → шаг → реальный бой → Space. B1: `gold:50` → `giveItem
('wood_log', 14)` → замена `ds.contents` (мобы `[]`, сундук на asideDir-клетке)
→ шаг. Каждый тест — СВОЙ boot (изоляция).

- **RED**: до фикса падают ТОЛЬКО A1/B1/P1 (осмысленно — несовпадение
  текста/Δgold, НЕ синтаксически); остальные 2077 — зелёные.
- **GREEN**: полный `npm test` = **2080/2080**. Быстрая итерация:
  `node --test tests/dungeon-loot-e2e.test.js` (до: 3 fail; после: 3 pass).
- **Флейк-протокол**: `tests/map.test.js` «160k tileAt в тайм-бюджете»
  (5000 мс) при высокой load — предсуществующий master-тест
  (`memory/000158-world-loot.md` §9.12): перепуск `node --test
  tests/map.test.js` / ожидание спада load + запись в `tasks/result/000186.md`.
- `npm test` мерить **ВНУТРИ worktree** (рекурсия `.worktrees/` дублирует
  набор — `memory/test-runner-worktrees.md`).

## 6. Что важно будущим задачам
- **Единая семантика overflow лута** (бой 000132 + сундук 000186): предмет
  НЕ теряется; авто-золото по каталожному `value` (НЕ `sellPrice`);
  словесность «не влезло: +N золота».
- Строка «(инвентарь полон: … потерян)» исчезла из поведения dungeon-сундука —
  если ретро найдёт её в `dungeonOnMove` — регрессия 000186.
- Dungeon-строка победы теперь содержит золото — будущие dungeon-victory e2e
  пинят «опыта, +N золота».
- `npm test` — внутри worktree; rebase + полный тест перед мержем
  (main.js — горячий файл, §7).
- Ссылки: `memory/000158-world-loot.md` (§2 строка 000186 — источник задачи;
  §7 якоря — на СТАРОЙ базе 04a2063, **устарели**; §9.2 волны горячего файла
  04 → 05 → 000186), `tasks/result/000158.md`, `tasks/done/000132.md`
  (семантика 000132), `tests/loot-e2e.test.js` (harness + пины V1/V2/S1),
  `tests/main-visuals.test.js` (CB-9 — прецедент РЕАЛЬНОГО dungeon-боя e2e;
  `stepDungeon` L1751 / `resolveCombatVictory` L1526),
  `memory/test-runner-worktrees.md`.

## 7. Горячий файл и rebase
- **main.js — горячий файл** (000158 §9.2): перед мержем — **ОБЯЗАТЕЛЕН
  rebase на актуальный master + полный npm test** (baseline сдвинется;
  ориентир — 2080 + чужие).
- Ханки ищутся **якорями ТЕКСТА** (строки сдвигаются):
  * (a) `повержена. +` в victory-ветке onEnd — единственный
    `ds.log.push` с ним; комментарии L2426/L2431 тоже содержат
    «повержена. +N опыта.», но это комментарии с многоточием (не push);
  * (b) `потерян` в `dungeonOnMove` — единственное вхождение в `src/`.
- **In-flight не пересекаются** (сверено): 000153.02 (dungeon.js +
  dungeon.test.js), 000189 (dungeon.test.js), 000157.02 (dungeon.js/
  dungeon-ui.js; возможная однострочная wiring depth в locations.js — не
  наши ханки), 000148.02/03 (dungeon-ui/cities/building-actions/buildings),
  000157.04 (craft), 000158.02 (items), 000187 (spec), 000188 (combat-тесты).
  Имя `tests/dungeon-loot-e2e.test.js` не конфликтует ни с одним worktree.
- `.merge-pending` — только стадия мержа (создавать/удалять на этой стадии
  нельзя).

## 8. Ключевые решения Проектирования (вопросы ТЗ/анализов закрыты)
1. **НОВЫЙ файл** `tests/dungeon-loot-e2e.test.js` (НЕ добавление в
   `loot-e2e.test.js`) — ноль пересечения с in-flight (add/add исключён);
   файл 000132 остаётся байт-стабильным (структурный скан S1 без правок);
   дублирование harness — принятая конвенция (loot-e2e сам дублирует
   companions-cycle).
2. **Реальный бой** через `dealDamageToMob(9999)` + `Space` (CB-9), НЕ
   мутация `c.result` — честный `startDungeonCombat`-канал + ядровой
   gold-ролл; Y читается из `c.result` (ручного расчёта нет); Эфир не
   убивается (ядро считает только мобов) — `dealDamageToAlly` не нужен.
3. **`enterDungeon()` БЕЗ аргумента** (CB-9) — доказанный канал; нет
   `memoryBanned`; тест не выходит → взаимодействие с 000153.01-памятью
   нулевое. (Вариант a2 `enterDungeon(G.TERRAIN.GRASS)` — отклонён:
   memoryBanned при ≠-тайле без пользы, детерминизм не хуже.)
4. **Клетка — первый FLOOR-сосед входа** (порядок → skip exit) — а не
   хардкод x+1 (может быть стеной → шаг no-op → тест падает синтаксически,
   а не по существу).
5. **Моб `skeleton`, level 1, ОДНА группа, 1 моб** — форма дословно
   генератора; id в каталоге (проверено); seed боя детерм.; «+0 золота»
   невозможен (gold ≥ 3).
6. **Сундук: gold 37 / knight_plate (value 400) / 14×wood_log (28 кг)** —
   G ≠ V (числа не смешиваются в ассертах); полный инвентарь — доказанный
   V2-набор (35 > 30 → отказ по весу).
7. **Комментарии L2426/L2431 НЕ менять** — многоточие остаётся верным, ТЗ не
   требует, минимальный дифф.
8. **P1 — ОТДЕЛЬНЫЙ тест** — буллет 3 ТЗ = свой пин (3 буллета = 3 пина);
   regex-форма (не точная строка) — суть паритета с мирской строкой.
9. **Harness — копия loot-e2e** (ТЗ-прецедент), С localStorage-моком (onEnd →
   `saveNow` пишет в мок; B1 chest-ветка saveNow не вызывает — неважно).
10. **CHANGELOG — отдельный коммит** (игровой процесс для игрока изменился),
    дата 2026-10-11, формат — по существующим записям дня.

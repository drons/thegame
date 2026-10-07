# 000167 — Бой: инициатива (ядро) — порядок хода по Ловкости + Интеллекту

**СТАТУС: реализация + правки по итогам ревью + финализация завершены
(станции Проектирование/Реализация/Ревью/Финализация, 2026-10-07;
база master 6fcb664, тесты 1771/1771 зелёных, свежий прогон перед
переносом в done).** Контракт для станций Реализация/Ревью.
На СТАНЦИИ МЕРЖА довести статус до «done»: дата мержа, полный список
коммитов (0615235 красные, 94c2844 реализация, 96b6fb5 правки по
итогам ревью, + коммит финализации), факт подтверждения orc_mad/ГЕП
(§6 — подтверждено), фактические значения ре-пинов (§14 — финальные
факты).

Родительская: 000154 (дизайн-контракт memory/000154-initiative.md, D1–D8+D12+
D13 — пересверен с кодом 6fcb664, актуален). Дочерняя: 000168 (управление
спутниками — СТРОГО ПОСЛЕ этой). Рекомендуемый порядок мержей:
**000167 → 000149 → 000168** (000149 — книга заклинаний, тоже combat.js).
Параллельно: 000155 (A* — регион mobAct/stepToward combat.js — НЕ ТРОГАТЬ;
диффы в разных регионах, rebase перед мержем), 000145/000151 — без пересечения.

## 1. Что добавлено / перенесено (карта изменений)

| Файл | Что |
|---|---|
| src/combat.js | НОВЫЕ: `unitInitiative(c,u)`, `activeUnitId(c)` (оба — экспорт), внутренние `advanceQueue(c)`, `startRound(c)`; ЗАМЕНА тела `buildTurnOrder`; `endPlayerTurn` → переименована в `endTurn` + реорганизация (цикл мобов + round-блок разложены в `advanceQueue`/`startRound`); pre-roll в `createCombat`; D6-гварды на публичных обёртках (тела playerX — БЕЗ ИЗМЕНЕНИЙ); exports +2; `playerFlee` — `endPlayerTurn(c)` → `endTurn(c)` |
| src/companions.js | `allyDataForEntry` + `attrs` (снапшот `entry.sheet.primary`, все 6) |
| src/efir.js | `efirAttrs` + dexterity (sheet-ветка `num(p.dexterity)`; legacy-ветка `{...efirStats(level), dexterity: 1}` — сам `efirStats` НЕ ТРОГАТЬ), `efirAllyData` attrs 3→4 ключа |
| assets/mobs | 36 × JSON + `schema.json` + зеркало `MOB_TYPES` + `makeMob` (`u.attrs`) — **ОДИН коммит** (consistency deepEqual combat.test.js ~L240) |
| SPEC.md | 2 правки (D12): «Боевая система» + правило инициативы; «Спутники → Бой» — «Очередь хода: по инициативе» |
| CHANGELOG.md | 1 упоминание (2026-10-06, «Игровой процесс»), отдельный коммит |
| tests | 10 новых (9 красных + 1 белый гвард; 9 node в combat.test.js + 1 vm TOKEN-1 в паттерне combat-ui) + ре-пины (§10) |
| НЕТ | новых модулей/script-тегов/классов/точек проводки (D11): index.html, main.js, combat-ui.js, combat-keys.js, save.js — БЕЗ ИЗМЕНЕНИЙ; tests/index-order.test.js не трогать |

## 2. Где живут новые функции (src/combat.js, scope factory)

* `unitInitiative(c, u)` — рядом с `buildTurnOrder` (~L544), ПУСТАЯ функция
  (0 rng, 0 побочных эффектов), экспорт.
* `activeUnitId(c)` — рядом же; экспорт.
* `buildTurnOrder(c)` (L544-548) — **замена ТЕЛА** (единая точка, резерв
  memory/000036-turn-order: «все читатели идут через c.turnOrder/c.turnIndex»).
* `startRound(c)` — НОВЫЙ внутренний хелпер = ПРЕЖНИЙ round-блок endPlayerTurn
  (L1797-1848) **дословно** (см. §4).
* `advanceQueue(c)` — НОВЫЙ внутренний хелпер (см. §4); вызывается из `endTurn`
  и из `createCombat` (pre-roll).
* `endTurn(c)` — replaces `endPlayerTurn` (переименование внутренней;
  публичный `c.endTurn = () => endTurn(c)`).
* `createCombat` (хвост L2224-2238): после `c.turnOrder = buildTurnOrder(c);
  c.turnIndex = 0;` → `advanceQueue(c)` (pre-roll) → освежить `c.targetId`
  при `!c.result`. Комментарий «игрок ходит первым» — обновить.
* exports (return factory, ~L2258-2274): + `unitInitiative`, + `activeUnitId`
  (пина на число экспортов нет — только typeof-проверки отдельных имён).

## 3. Формула и тай-брейк (D1–D3)

```js
function unitInitiative(c, u) {
  if (u === c.player)
    return c.player.primary.dexterity + c.player.primary.intelligence;
  return ((u.attrs || {}).dexterity || 0) + ((u.attrs || {}).intelligence || 0);
}
function buildTurnOrder(c) {
  const base = ['player',
    ...livingAllies(c).map((u) => u.id),
    ...livingMobs(c).map((u) => u.id)];
  const idUnit = (id) => (id === 'player') ? c.player
    : c.units.find((u) => u.id === id);
  return base.map((id) => [id, unitInitiative(c, idUnit(id))])
    .sort((a, b) => b[1] - a[1])
    .map((p) => p[0]);
}
function activeUnitId(c) {
  return (c.turnOrder && c.turnOrder[c.turnIndex]) || 'player';
}
```

* Стабильная сортировка (Array.sort, ES2019+ — гарантированно стабильна)
  канонической базы ПО УБЫВАНИЮ; **тай-брейк = порядок в базе** (игрок →
  союзники → мобы, внутри — порядок c.units) = семантика до 000154 при
  равенстве.
* Пересчёт — в `createCombat` и в начале каждого нового раунда
  (`startRound`). Мёртвые/сбежавшие исключены при пересчёте; **слоты в
  текущем раунде сохраняются** (серый токен — renderTurnOrder берёт
  `u.alive/u.fled`, UI не меняется).
* Игрок: `c.player.primary.dexterity + intelligence` (сильный герой
  старт — 1+1 = 2; midGameHero — 4+1 = 5).

## 4. advanceQueue / endTurn / startRound — интерлевинг, round-rollover, тики

```js
function startRound(c) {
  // БИТ-В-БИТ прежний блок L1797-1848 (порядок выражений ТОТ ЖЕ):
  c.round += 1; c.phase = 'player'; c.ps.blocked = false; refillPools(c);
  if (c.ps.shield && c.ps.shield.turns > 0) c.ps.shield.turns -= 1;
  if (c.efirShield && c.efirShield.turns > 0) c.efirShield.turns -= 1;
  for (const m of livingMobs(c))
    if (m.weakened && m.weakened.turns > 0) m.weakened.turns -= 1;
  if (c.efir && c.efs) { /* рефилл spellInt/spellWis/touch/move — дословно */ }
  c.turnOrder = buildTurnOrder(c);
  c.turnIndex = 0;
  if (c.ps.poison > 0) { /* тик яда; смерть → c.result = {outcome:'dead'},
    c.phase = 'over', log, return c */ }
  c.targetId = (nearestMob(c) || {}).id || null;
}

function advanceQueue(c) {
  for (;;) {
    if (c.result) return;
    if (c.turnIndex >= (c.turnOrder || []).length) {
      startRound(c);
      if (c.result) return;
    }
    const id = c.turnOrder[c.turnIndex];
    if (id === 'player') {
      c.targetId = (nearestMob(c) || {}).id || null; // свежая цель на входе
      c.phase = 'player';
      return;
    }
    const u = c.units.find((x) => x.id === id);
    if (!u || !u.alive || u.fled) { c.turnIndex += 1; continue; } // серый слот
    c.phase = 'mob';
    if (u.side === 'ally') allyAct(c, u); else mobAct(c, u);
    if (c.result) return;        // turnIndex ЗАМИРАЕТ (как сейчас)
    c.turnIndex += 1;
  }
}

function endTurn(c) {
  if (checkTurn(c)) return;
  c.turnIndex += 1;
  advanceQueue(c);
}
```

* **Ключевое системное следствие — pre-roll:** в `createCombat` и после
  каждого rollover юниты с инициативой ВЫШЕ игрока действуют синхронно ДО
  первого действия игрока. На возврате — либо `phase='player'`
  (turnIndex = слот игрока), либо `c.result`.
* Инвариант 000036 сохранён: `turnIndex` присваивается/сохраняется ДО
  `mobAct`/`allyAct` — в момент действия `c.turnOrder[c.turnIndex]` = id
  действующего.
* Тики «1 раз за раунд» сохранены: `startRound` вызывается ровно один раз
  между пересчётами очереди; в round 1 тика НЕТ (rollover — только при
  исчерпании очереди). Порядок тиков (щит игрока → щит Эфира → ослабление →
  рефилл c.efs → пересчёт очереди → тик яда → targetId) — дословно.
* `playerFlee` (неудача, L1052) — «ход сгорает» = `endTurn(c)` = продвижение
  очереди. Семантика сохранена (проверять тесты побега).
* `checkTurn` (L879-883), `canDoAction`, значения phase, читатели phase
  (combat.js/combat-keys.js/combat-ui.js `disabled`) — **БЕЗ ИЗМЕНЕНИЙ** (D5).
  В 000167 в покое активен только игрок → `b.disabled = c.phase !== 'player'`
  работает без правок.
* `createCombat` теперь МОЖЕТ вернуть бой с `c.result` (fast-моб убил раненого
  игрока / союзник убил последнего моба): UI startCombat → render —
  end-state показывается существующим путём (render читает c.result);
  buildEfirUnit null-safe. Игрок flee в pre-roll невозможна (playerFlee —
  только публичный API).

## 5. Три шова атрибутов (D7) — форматы u.attrs в бою

| Кто | Формат u.attrs | Источник | Деградация |
|---|---|---|---|
| Игрок | (нет u.attrs — вне c.units) | `c.player.primary` напрямую в `unitInitiative` | — |
| Моб | `{dexterity, intelligence}` — ровно 2 ключа | `makeMob`: `attrs: {dexterity: t.dexterity \|\| 0, intelligence: t.intelligence \|\| 0}` (t — запись MOB_TYPES) | поля опциональны в JSON; `|| 0` |
| Наёмник | СВЕЖИЙ снапшот `entry.sheet.primary` — **все 6** (strength, dexterity, constitution, intelligence, wisdom, charisma) | `allyDataForEntry`: `Object.assign({}, entry.sheet.primary)` (КОПИЯ, не ссылка) | нет primary/мусор → `{}` (makeAlly `data.attrs \|\| {}`) |
| Эфир | `{dexterity, intelligence, wisdom, constitution}` — 4 ключа | `efirAllyData` через `efirAttrs` | sheet-ветка: `num(p.dexterity)` (floor, <1→1); legacy: `efirStats(level)` + `dexterity: 1` |

* `efirStats` (замороженная legacy-таблица) НЕ ТРОГАТЬ — потребители вне боёв
  (ui.js, ui-tab-efir.js, T1 efir.test.js). SPEC «Дух Эфира»: остальные
  характеристики = 1 → legacy dexterity = 1.
* Рефилл `c.efs` в `startRound` (spellInt/spellWis из `c.efir.attrs`) —
  без изменений: 000112 читает intelligence/wisdom; dexterity — аддитивен.
* Потребители `efirAttrs` вне боёв (efirSkillCap, reprocessEfirSkills) читают
  только intelligence/wisdom — dexterity не влияет.
* **ПОБОЧНЫЙ ЭФФЕКТ (решено, §9 D-8):** `allyHeal` (combat.js ~L1451) —
  формула `round((4 + 0.5·u.attrs[spell.атрибут] + ур)·(1+0.15·(степень−1)))`
  ЧИТАЕТ attrs наёмника: до 000167 attrs = {} (член «уровень»), после —
  реальные значения листа. Это ПОСЛЕДСТВИЕ прямого контракта D7.2 («свежий
  снапшот entry.sheet.primary (все 6)»), а не баг — лечение поддержки
  масштабируется от характеристик (по задумке spells.js-формулы). Комментарий
  «у наёмника attrs пуст → уровень» ОБНОВИТЬ. Тесты Мира/Вольк (combat.test.js
  L2404-2470) используют makeAlly-фикстуры БЕЗ attrs → не затрагиваются;
  детерминизм-сценарий companions (Вольк melee, Ашка ranged — heal-пути НЕТ) →
  абсолютные пины [8,8]/victory ожидаются стабильными (проверить прогоном).

## 6. Таблица инициативы 36 мобов (D8) — фактические значения

init = dex + int. Группы сверены с MOB_TYPES (role/fast/traits), 36/36:

| init | dex+int | Мобы (id) |
|---|---|---|
| **2** | 1+1 | orc_warrior, bone_coloss, cave_bear, earth_elemental, stone_golem (5, shield) |
| **3** | 2+1 | orc_grunt, **orc_mad**, skeleton, giant_larva, vampire, rot, wolf, boar, scorpion, fire_elemental, water_elemental, salamander, lower_demon (13, melee-база) |
| **4** | 3+1 | orc_archer, skeleton_archer, imp (3, ranged) |
| **4** | 2+2 | orc_captain, orc_chief, troll, ant_queen, abomination (5, leader) |
| **4** | 3+1 | crawling_bones, wolf_pack, spider, ant (4, swarm) |
| **5** | 1+4 | orc_shaman, fairy, succubus (3, support/маги) |
| **6** | 5+1 | orc_rider, centipede (2, fast) |
| **7** | 5+2 | wind_elemental (1, ranged+fast) |

* **ГЕП orc_mad ПОДТВЕРЖДЁН на коде 6fcb664:** MOB_TYPES — role melee,
  fast отсутствует, traits ∅, dmg 1.4 → базовая melee-группа = 3 (13 мобов).
* Контрольные точки: старт-герой (init 2) = tier shield, медленнее ВСЕХ
  остальных групп (тай с shield-тяжёлыми → игрок первым); midGameHero (5) —
  быстрее melee/ranged/leader/swarm, **тай с магами (5) → ИГРОК ПЕРВЫЙ**
  (тай-брейк), медленнее fast (6) и wind (7).
* Тесты пиняют ОТНОСИТЕЛЬНЫЕ порядки (fast > basic > shield; shaman > grunt;
  rider > chief) + конкретные значения (orc_grunt=3, orc_rider=6, orc_shaman=5,
  midGameHero=5) — не всю таблицу.
* JSON: поля `dexterity`/`intelligence` — ПОСЛЕ `"hp"` (косметика;
  consistency deepEqual не зависит от порядка). schema.json: оба —
  `"type": "integer", "minimum": 0, "maximum": 30`, ОПЦИОНАЛЬНЫЕ (не в
  required; additionalProperties:false обязывает добавить). Зеркало
  MOB_TYPES — те же поля/значения во ВСЕХ 36 записях (deepEqual полного
  объекта без «описание»/«art»). mobs НЕ в CATALOGS assets-schemas.test.js —
  единственный машинный фиксатор = consistency deepEqual + ручной
  structural-тест (новые опциональные поля его не ломают).

## 7. Контракты и границы (D5, D6, D13)

* **D6 — игрок-путь БИТ-В-БИТ:** все `playerX` (L885-1116) — БЕЗ ИЗМЕНЕНИЙ
  ТЕЛА. Диспатч — гварда на публичных обёртках:
  `c.attack = (t) => { if (activeUnitId(c) !== 'player') return null; return
  playerAttack(c, t); }` — то же для c.spell/c.block/c.move/c.flee/
  c.quickItem/c.invItem/c.selectTarget. `c.endTurn` — БЕЗ гварды (действие
  активного юнита; в 000168 — любой player-side). В 000167 в покое активен
  ТОЛЬКО игрок → гварды НИКОГДА не срабатывают — это структурное резервирование
  под 000168 (там вместо `return null` — союзный путь).
* **D5 — фаз:** новых значений НЕТ. 'player' = «ждём ввод (в 000167 — только
  игрока)», 'mob' — синхронный промежуточный (только внутри advanceQueue),
  'over'. `b.disabled = c.phase !== 'player' || …` (combat-ui L942) — работает.
* **D13 — детерминизм:** 0 новых вызовов c._rng в unitInitiative/
  buildTurnOrder/advanceQueue/startRound/D7-шовах. ПОРЯДОК RNG-стрима
  меняется (AI-броски до действий игрока) — это и есть новая механика (ТЗ).
  Инвариант: фикс. сид + фикс. вводы → фикс. исход/логи (self-детерминизм
  тесты combat L668/L2280/L2997/L3153, companions L881 — зелёные без правок).
* Границы: НЕ ТРОГАТЬ — `checkTurn`, `canDoAction`, `mobAct` (L1319) и вся
  логика движения моба (регион 000155!), `allyAct` (L1474-1516, вызывается
  как есть), `efirTurn`, `refillPools`, тики (выражения — дословно в
  startRound), renderTurnOrder (combat-ui), buildEfirUnit (efir.js).

## 8. Ленивые ссылки и guards

* Новых модулей НЕТ (D11) → новых ленивых ссылок на Game.* не добавляется;
  UMD-ловушки (000038/000053) не затронуты; vm-цепочки (index.html regex +
  HARDCODED-список combat-ui.test.js) без изменений.
* Guard `c.efir && c.efs` в рефилле startRound — без изменений (см. §9 D-1).
* Guard `activeUnitId(c) !== 'player'` — единственный новый guard публичного
  API (D6; §7). Деградация makeAlly `data.attrs || {}` — без изменений.
* `unitInitiative` — `|| 0` по ключам attrs (юнит без attrs → 0; деградация
  по D1).

## 9. Решения, принятые на стадии Проектирования (open questions)

* **D-1 (R1, главный — был НЕ в дизайн-контракте): Эфир в round 1 без c.efs.**
  buildEfirUnit остаётся в combat-ui ПОСЛЕ createCombat (контракт 000112:
  createCombat независим от efir.js; НЕ переносим). Если init игрока < 4
  (Эфир: dex1+int3=4), первый ход Эфира — в pre-roll createCombat БЕЗ c.efs →
  `allyAct` не заходит в efirTurn → **задокументированная ветка 000080**
  (support → allyHeal «самый раненый»; frac>=1 → melee-фолбэк: подход+удар).
  **РЕШЕНИЕ: принять 000080-fallback для round 1** — это описанный
  бит-в-бит fallback allyAct (опция Y, D3 000112); альтернатива (ленивый
  buildEfirUnit в ядре / вынос pre-roll из createCombat) — вне ТЗ, ломает
  контракт 000112; с раунда 2 — полный efirTurn. Детерминировано,
  запинено (EF-1 — §10). 000168 перекроет путь (игрок управляет Эфиром).
* **D-2 (ГЕП a2-arch): orc_mad = базовая melee-группа, init 3** (dex 2 + int 1)
  — подтверждено на коде (role melee, fast:false, traits ∅).
* **D-3 (имена/владение):** `advanceQueue` (продвижение до слота игрока,
  включая rollover; вызов из endTurn и createCombat — ОДИН алгоритм, 0
  дублирования циклов) + `startRound` (round-блок дословно) + `endTurn`
  (переименование endPlayerTurn — имя честное: «конец хода активного»,
  не «конец хода игрока»).
* **D-4 (targetId):** освежается при КАЖДОМ входе игрока (ветка
  `id === 'player'` в advanceQueue + хвост createCombat) — бит-в-бит текущая
  семантика «цель свежа, когда действует игрок»; pre-roll мог убить/сдвинуть
  цель.
* **D-5 (activeUnitId):** defensive fallback `'player'` (нет очереди/индекса
  — legacy-поведение: игрок действует; читатели не получают null).
* **D-6 (schema):** dexterity/intelligence — integer 0..30, опциональные
  (таблица баланса — целые; required не расширять — старые JSON остаются
  валидными).
* **D-7 (JSON/зеркало):** поля после `"hp"`; ОДИН коммит с MOB_TYPES + makeMob
  (иначе consistency deepEqual красный).
* **D-8 (побочный эффект allyHeal):** принять (контракт D7.2 — «все 6»);
  обновить комментарий формулы; абсолютные пины companions проверять прогоном
  (§5). Мира/Вольк-фикстуры не затрагиваются.
* **D-9 (якорь 000081, combat.test.js L2904-2921):** Эфир в pre-roll проходит
  3 клетки к врагу (d 9 > movePerTurn 1×3 шага allyAct) → пин «рядом с игроком
  (px−1, py−1) на старте» ломается. **РЕШЕНИЕ: ассерт размещения (placeAllies,
  px−1/py−1) проверить ДО pre-roll** (смысл пина — якорь размещения 000080);
  позицию ПОСЛЕ pre-roll не пинить (зависит от пошагового пути allyStepToward
  — хрупко). Зафиксировать в отчёте.
* **D-10 (EF-1, efir.test.js L908-953):** пин «u.mp 11→8 после endTurn» →
  **mp остаётся 11** (round 1: Эфир действует через 000080-ветку, mend не
  кастится; allyHeal mana-бесплатный до-лечивает игрока выше порога).
  Ре-пин + документация (следствие D-1).
* **D-11 (порядок коммитов):** assets/mobs ДО ядра — инициативы мобов
  питают ре-пины; швы (companions/efir) ДО ре-пинов, ссылающихся на
  init союзников/Эфира; финальный коммит стадии — ВЕСЬ набор зелёный.
* **D-12 (CHANGELOG):** отдельный коммит, дата 2026-10-06, секция
  «Игровой процесс», 1-2 player-facing пункта (бой по инициативе; быстрые
  мобы могут ходить первыми); программная часть не перечисляется.

## 10. Ре-пины — что и почему (технические, ТЗ разрешает: «пины порядка
очереди/лога обновляются под новый порядок»; игрок-поведение НЕ перемогается)

**tests/combat.test.js (~15+ блоков).** Причины — ровно три: (а) очередь
теперь ОТСОРТИРОВАНА по убыванию init (были канонические ['player',…]);
(б) pre-roll «съедает» round 1 ДО первого endTurn → round-маппинг пинов
сдвигается на раунд; (в) союзники из тестовых фикстур (makeAlly без attrs) —
init 0, Эфир — 4.

1. L1484 «buildTurnOrder: игрок первым…» → `['m1','m2','m0','player']`
   (spider 4, troll 4 — тай: порядок c.units; wolf 3; strongHero 2).
2. L1491 «мёртвые/fled исключены» → `['m2','player']`; «все мертвы → ['player']»
   — остаётся.
3. L1501 «начало боя: turnOrder/turnIndex» → отсортированная очередь +
   turnIndex = индекс игрока (+ pre-roll уже отработал).
4. L1509 «после endTurn очередь пересчитана» → `['m1','player']` и т.д.
5. L1530 «turnIndex: в phase mob ходит по очереди — лог» → лог:
   шаман(5) → лучник(4) → [игрок] → воин(2); очередь `['m2','m1','player','m0']`;
   turnIndex в events: 1, 2, 4.
6. L1582 «конец боя в цикле — замирает» → смерть игрока в PRE-ROLL (2×skeleton
   3 > 2): c.result из createCombat, очередь `['m0','m1','player']`, turnIndex 1.
7. L1602 «смерть от яда в начале хода игрока» → очередь `['m0','player']`,
   turnIndex 1 (тик яда теперь в startRound).
8. L1624 «игрок убил моба — слот сохраняется» → `['m1','m0','player']`
   (archer 4, мёртвый grunt-слот 1, игрок 2).
9. L2063 «createCombat({allies})» → `['m1','m2','m0','player','a0','a1','a2']`
   (spider 4, troll 4, wolf 3, игрок 2, наёмники без attrs = 0).
10. L2115 «без мобов» → **ЗЕЛЁНЫЙ БЕЗ ПРАВКИ** (игрок 2 > союзники 0).
11. ~L2196 «союзники в порядке c.units (a1 dead, a2 fled)» →
    `['m1','m2','m0','player','a0']`.
12. L2219 «союзник действует — инвариант 000036» → `['m1','m0','player','a0']`
    (spider 4, wolf 3, игрок 2, Вольк 0); события: волк ti 2, Вольк ti 3.
13. L2904 «000081: Эфир в allies» → `['efir','m0','player']` (Эфир 4 > wolf 3 >
    игрок 2) + якорь L2920-2921 — по D-9 (перенос ассерта размещения ДО
    pre-roll).
14. L2501 «гибель союзника ≠ поражение» → `['m0','player']`.
15. **000112 CB-1..CB-7 / 000113 BR-2..BR-5 — round-маппинг** (pre-roll):
    значения сдвигаются на раунд, напр. CB-7(a) hpAfter `[270,267,264,254]` →
    `[270,264,254,244]`; BR-2(b) golden-log строки «Вдох Эфира!» сохраняются
    (Вдох теперь в pre-roll), но «Эфир НЕ сдвинулся» (u.x/u.y) ломается —
    в round 2 (после endTurn) Эфир идёт 3 клетки (c.efs.move рефилл, d 9 > 3);
    CB-2 (turns: каст−тик) — проверить расчётом. Self-снимки (deepEqual двух
    прогонов) в этих блоках — зелёные.
16. L2499 «000080: melee-ветка (шаг)» — союзник init 0 действует ПОСЛЕ мобов —
    вероятно зелёный (1 шаг за endTurn сохраняется) — проверить.
17. Сценарии «Несокрушимость» (L554-609) и e2e с low-init героями — мобы с
    init > игрока бьют ПЕРВЫМИ в каждом раунде: проверять каждый исход
    («win»→«dead» — ре-пин ПО ТАБЛИЦЕ D8, НЕ «подгонкой» статов героя —
    перемогать игрок-поведение запрещено).

**tests/combat-ui.test.js (vm):** 18. L225 Space-волна → pre-roll уже
  отстрелял round 1 (мобы «промахиваются» в стартовом логе); волна round 2 в
  новом порядке (spider 4 → wolf 3); `round 2`/`phase 'player'` без изменений.
  19. L815 `_unitFx` → pre-roll меняет FX-состояние до Space (волк: move→
  attack-FX после сближения) + hp игрока — ре-пин эвристик. 20. L1833 CU118-FX
  «Вдох Эфира» — вероятно зелёный (триггер — в pre-roll round 2 при Space;
  edge-detect c.efirBreathed при render) — проверить. White-box 000084
  (L1463-1485/L1703-1730): мутации phase/turnIndex без публичных действий —
  D6-гварда не срабатывает (turnIndex вручную на юните, но действия не
  вызываются); **порядок токенов `tail` в scene84 — ре-пин** (очередь
  [Эфир, волк, герой] вместо [герой, Эфир, волк]; --acted/--current-классы).

**tests/efir.test.js:** 21. deepEqual attrs 3→4 ключа: L285 (+dexterity 1,
  sheet p.dexterity=1), L466 (efirAllyData), L789 T9 (ур. 5:
  {intelligence:3, wisdom:12, constitution:3, dexterity:1}). 22. Сценарные
  пины 000112/000113 (mp/hp/turns) — round-маппинг как п. 15 (self-снимки —
  зелёные). 23. **EF-1 L908-953 — по D-10** (mp 11→8 → mp 11). T9 логи —
  includes()-ассерты, строки те же (лечение раньше — в pre-roll) — вероятно
  зелёные.

**tests/efir-sheet.test.js:** 24. ES-4 (L284/L294/L305) attrs 3→4 ключа
  (+dexterity 1).

**tests/companions.test.js:** поле-в-поле пины allyDataForEntry — новые
  attrs-ключи аддитивны (full deepEqual объекта НЕТ) — зелёные; детерминизм
  L881 (allyXp [8,8]) — attrs это данные, не RNG; Вольк/Ашка без heal-пути —
  ожидается зелёным (проверить прогоном; при сдвиге — ре-пин значения,
  механизм тот же).

**НЕ требуют правок (проверить при прогоне):** spells, global-settings,
building-effects, mob-zones-e2e, loot-e2e, index-order, combat-layout,
combat-keys, mob-groups, assets-schemas, hud/save-restore/dungeon-ui,
mob-art/sprites.

## 11. Что важно будущим задачам

* **000168 (управление спутниками, СТРОГО ПОСЛЕ):** точка развилки —
  D6-гварды публичного API (`return null` → союзный путь по activeUnitId) и
  ally-ветка `advanceQueue`: вместо `allyAct(c, u)` — `c.phase = 'player'` +
  остановка (ждём ввод игрока на ход союзника); «Вдох Эфира» (D9 000154) —
  авто-триггер в НАЧАЛЕ хода Эфира (до allyAct; сработал → ход сгорает =
  continue продвижения). Пулы u.moveLeft/u.attackLeft — в round-rollover
  (Эфир — c.efs, уже на месте). canDoAction — контекстный (reason
  «недоступно активному персонажу» для блока/предметов/побега у союзника).
  Экспорт activeUnitId — готов. Атрибуты: наёмник 6/Эфир 4/моб 2 ключа (§5).
  SPEC «Дух Эфира → Бой» — правка 000168 (не этой задачей).
* **000149 (книга заклинаний):** тоже combat.js — мержить ПОСЛЕ 000167
  (rebase). Её ТЗ уже считает «активного персонажа» — совместимо.
* Ссылки: memory/000036-turn-order (резерв замены buildTurnOrder —
  реализован), memory/000140-sheet-model (sheet.primary),
  memory/000143-merc-sheet (attrs наёмника — лист), memory/000144-efir-sheet
  (efirAttrs/efirStats), memory/000112-efir-combat (c.efs/buildEfirUnit —
  контракт «после createCombat» сохранён), memory/000080-ally (ветка
  000080 fallback — опция Y, D3).

## 12. Подводные камни

1. **assets/mobs — ОДИН коммит** (36 JSON + schema.json + MOB_TYPES + makeMob)
   — иначе consistency deepEqual (combat.test.js ~L240) красный. mobs НЕ в
   CATALOGS — schema не машинно-валидируется; фиксаторы — deepEqual-зеркало +
   ручной structural-тест.
2. **Ре-пин-поверхность шире ТЗ** («~10 блоков» → ~15+ блоков combat.test.js +
   combat-ui + efir + efir-sheet, §10). Митигация: каждый ре-пин — значение
   ИЗ ТАБЛИЦЫ D8 (не подгонка); после каждой пачки — полный npm test; тест,
   переставший тестировать механизм, — переписать, не убирать;
   self-детерминизм-снимки не трогаются.
3. **Регион 000155 (A*):** mobAct/stepToward НЕ ТРОГАТЬ; диффы 000167 —
   buildTurnOrder/endTurn/startRound/advanceQueue/createCombat/makeMob/
   MOB_TYPES; rebase на свежий master перед мержем (и против 000145/000151).
4. **Эфир round 1 без c.efs** (D-1) — задокументировать в отчёте + EF-1
   ре-пин; не «чинить» переносом buildEfirUnit (контракт 000112).
5. **createCombat возвращает c.result** — новый путь; проверить, что
   startCombat/render не падают на result-бое (buildEfirUnit null-safe).
6. **Сдвиг тиков:** тики «в начале хода игрока» → «в начале раунда» (посреди
   endTurn); быстрый моб может действовать СРАЗУ после тика — семантика
   «1 раз за раунд» та же; двойного тика на round 1 нет (rollover — только
   при исчерпании очереди).
7. **RNG-стрим** (D13): порядок бросков изменился — это новая механика;
   0 новых c._rng в новом коде; self-детерминизм-тесты — фиксатор.
8. **Тестовые герои init 2** (strongHero/newHero/hero112) — медленнее всех
   групп, кроме shield (тай → игрок первым): почти все crafted-сценарии
   изменят очерёдность — НАИБОЛЬШАЯ площадь регрессии (§10 п. 17).
9. **playerFlee** — «сгоревший ход» теперь = продвижение очереди (быстрые
   юниты доходят до игрока); проверить тесты побега.
10. **Fлейки vm-тестов** (setTimeout/rAF-стабы): перепуск
    `node --test tests/<файл>` + запись в отчёт.

## 13. Детерминизм (D13) — чек-лист реализации

* grep `c._rng` в unitInitiative/buildTurnOrder/advanceQueue/startRound —
  0 совпадений; в D7-шовах (makeMob/allyDataForEntry/efirAttrs/efirAllyData) —
  0.
* Array.sort — стабилен (ES2019+) — канонический тай-брейк детерминирован.
* Существующие self-детерминизм-тесты (combat L668 play(31)≡play(31), L2280,
  L2997 000081, L3153 000076, snap112/113, efir T2, companions L881) —
  зелёные БЕЗ ПРАВОК.
* Фикс. сид + фикс. вводы → фикс. исход/логи (e2e outcome-only пины —
  сверить по таблице D8).

## 14. Итоги реализации (РЕАЛИЗАЦИЯ) — финальные факты

* **Финальные значения ре-пинов — из прогонов** (harness /tmp/trace167b.js,
  /tmp/trace-br3.js, /tmp/trace-efir.js — одноразовые, вне репо). Примеры §10
  уточнены: CB-7(a) hpAfter `[270,267,257,247]` (не `[270,264,254,244]`);
  Вдох Эфира — НЕ в pre-roll, а в round 2 (pre-roll — без c.efs, это
  000080-ветка: мана-бесплатный allyHeal либо 1 шаг к врагу; breath-проверка
  в efirTurn без c.efs недостижима) — golden-логи BR-2(b)/BR-3/BR-6
  сохраняются строка-в-строку.
* **Сдвиг тиков (п. 6 §12):** старый код тикал ps.shield/efirShield/weakened
  в КОНЦЕ цикла endTurn (поглощение в раунде каста + в следующем); новый
  startRound — в НАЧАЛЕ раунда (поглощение только со следующего за кастом) →
  все пины `turns` +1 после одного endTurn (CB-2(a), EF-3(D), BR-2(b),
  BR-5(a) [2,1,0], BR-6, CB-7(d)); CB-7(a) [270,267,257,247], CB-7(d)
  p.hp 97 (щит игрока протикан в r2 (1→0) до удара: 100 − (10−7)).
* **D-9 (якорь 000081):** combat.test.js — turnOrder `['efir','m0','player']`
  + ассерт размещения ДО pre-roll (как решено); combat-ui.test.js
  000081-wiring (L1123) — ассерт якоря ре-пинут в (px−2, py−1): pre-roll
  шаг Эфира по x (000080 allyStepToward: ось x приоритетнее):
  (px−1, py−1) → (px−2, py−1); y — якорь py−1 без изменений.
* **D-10 (EF-1):** u.mp БЕЗ РЕГЕНА = 11 (контракт 000112 держится; pre-roll
  allyHeal +7 поднял игрока выше порога 0.7 → mend в round 2 не кастится →
  spellInt/spellWis остаются 1); move 3 → 0 (эскорт-шаги в раунде сжигают;
  рефилл — в след. startRound). EF-3(A) efs.touch 1 → 0 (потрачен; рефилл —
  след. startRound).
* **Паттерн «p.hp ПОСЛЕ buildEfirUnit»:** pre-roll (000080-ветка) лечит
  РАНЕНОГО игрока мана-бесплатно ДО buildEfirUnit и ломает границы
  триггеров breath (frac 0.4) / mend (frac 0.7). Техника: присваивание
  `p.hp = X` переносится ПОСЛЕ `E.buildEfirUnit(state, c)` с комментарием
  000167 (игрок в pre-roll полный — heal не кастится; граница ставится на
  момент хода Эфира). Применено: BR-2(a/b/c), BR-4, BR-5(a/b), BR-7
  (combat.test.js). Сценарии с пустой книгой (BR-3, BR-6) — перенос не нужен.
* **vm-реальный-прототип ловушка (combat-ui.test.js):** `assert.deepEqual`
  на МАССИВЕ из vm-песочницы падает (deepStrictEqual: чужой Array.prototype),
  даже при идентичных содержимом — читать/сравнивать через spread
  `[...c.turnOrder]`. Применено: 000167-TOKEN-1 (2 ассерта). Примитивы
  (строки) через vm-границу — без проблем.
* **combat-ui.test.js — итоги ре-пинов:** Space-волна (L225): pre-roll
  отстрелял долю мобов round 1 (спавн не вплотную — шаги, без лога); волна
  round 2 — в порядке инициативы (паук 4 → волк 3); `round 2`/`phase
  'player'` без изменений. 000084 ring (L1467): «не Эфир» = слот героя
  (`turnOrder.indexOf('player')`; старый индекс 0 теперь = Эфир). 000084 row
  (L1703): хвост токенов [Эфир, волк, герой]; при ti=0 у волка/героя НЕТ
  `--acted` (i > turnIndex). CU118-LOG (3) touch: pre-roll сдвинул Эфира
  (px−2, py−1) → волк «вплотную» = (px−1, py−1). CU118-FX и `_unitFx`
  (п. 19/20 §10) — зелёные БЕЗ ПРАВКИ. 000167-TOKEN-1 (новый красный) —
  зелёный: очередь [m0(паук 4), m1(волк 3), player(2)], ti 2, слот убитого —
  `--dead` до конца раунда, `--current` на слоте действующего (не на слоте
  мёртвого), в round 2 мёртвый вне очереди.
* **efir-sheet ES-4:** attrs 3 → 4 ключа (+dexterity 1) — 3 deepEqual
  (L1/L3/L3-с-очками). efir.test.js: R2/T1/T9 attrs +dexterity 1; EF-1/EF-3
  по D-10/рефиллам.
* **companions.test.js:** 55/55 зелёные БЕЗ ПРАВКИ (детерминизм L881
  allyXp [8,8] — attrs это данные, не RNG).
* **Финал: npm test 1768/1768 зелёные, ДВА последовательных прогона,
  флейков не обнаружено.**
* **Асимметрия «Сдвига тиков» при интерлевинге (правки по итогам
  ревью, 2026-10-07):** вынужденное следствие D4 (интерлевинг) + тика
  в начале раунда; ЧИСЛО тиков не изменилось (turns: 2 / −1 за раунд),
  изменилось, на чьих ударах тик «приходится»:
  * «Вдох Эфира» (000113): «2 хода» = 2 ослабленных удара для мобов с
    init ≤ инициативе Эфира (в раунде триггера атакуют ПОСЛЕ хода
    Эфира — при равенстве союзник раньше моба); мобы с init ВЫШЕ
    (маги 5, fast 6, wind_elemental 7 — при L1-Эфире 4) в раунде
    триггера уже атаковали ДО хода Эфира — ослабление с СЛЕДУЮЩЕГО
    раунда, ровно 1 ослабленный удар. Пины: 000167-WEAK-1 (orc_rider:
    hpAfter [110, 102, 92], turns [2,1,0]) против BR-5(a) (волк:
    [112, 104, 94] — 2 ослабленных удара). SPEC «их урон ×0.8 на 2
    хода» — семантика «2 тика» сохранена; «2 удара» — для медленных
    мобов (до 000167 все мобы были медленнее — фаза мобов целиком).
  * Щит игрока (000045): каст в фазе игрока против моба с init ВЫШЕ
    игрока — ровно 2 защищённых удара (тик startRound — ДО фазы моба
    того же раунда), до 000167 — 3; против моба с init ≤ игрока
    (тай) — без изменений: 3 (пин «ровно 3 раунда защиты»,
    orc_warrior). Пин: «щит против БОЛЕЕ БЫСТРОГО моба» (orc_grunt:
    дельты [0, 0, −2, −2]).
  * `buildEfirUnit` (efir.js): гвард `if (!u.alive) return null;` —
    Эфир, погибший в pre-roll (теоретический hazard: createCombat
    действует юнитами быстрее игрока ДО buildEfirUnit), НЕ
    «воскрешается» статами (alive остаётся false — серый токен;
    исход боя при этом был бы корректен — аномалия визуальная).
    По текущей таблице урона недостижимо (единственный pre-roll-
    ranged wind_elemental: урон < maxHP Эфира на всех уровнях).
    Пин: 000112 EF-G.
* **Правки по итогам ревью (2026-10-07):** комменты startRound/
  mobAttack/mobAttackAlly/efir.js — «тик — startRound» (endPlayerTurn
  удалён); шапка combat.js — endTurn (до 000167 — endPlayerTurn);
  INIT-2 + orc_chief (4) — пара таблицы D8 «rider > chief» закрыта
  значением; CHANGELOG — запись перенесена в секцию даты мержа
  (2026-10-07) + примечание о длительности эффектов против быстрых
  врагов.

# 000080: фреймворк «союзные юниты» в бою — закреплённые решения

Задача: общий слой «союзники» (side 'ally') в src/combat.js, на котором
сидят Эфир (000081) и наёмники из отряда (000078/000079). Красные тесты
закоммичены (e86dd38): 19 в tests/combat.test.js, 1 в tests/spells.test.js.
Родительская архитектура — аналитика задачи 000080.

## API (000081/000082/000112/000113 опираются)

* Экспорт combat.js: `makeAlly` (чистая функция, тестируется) +
  `createCombat({player, groupType|mobs, …, allies, …})` — новый
  параметр `opts.allies` (массив данных makeAlly; [] по умолчанию).
* **Ленивый каталог заклинаний** (UMD-ловушка 000038: combat.js грузится
  ДО spells-data.js/spells.js): src/spells.js одной строкой в общем
  фабричном теле (обе UMD-ветки) ставит
  `internals.allySpells = SPELLS_BY_ID` — объект combatInternals ОДНОБАЗОВЫЙ
  (node-require кэш и Game.combatInternals — одна ссылка). allyHeal читает
  `combatInternals.allySpells` в момент хода; нет каталога → false →
  melee-фолбэк (задокументированное деградирование). Тест
  tests/spells.test.js фиксирует `combatInternals.allySpells === SPELLS_BY_ID`;
  тест-ленивость сам сохраняет/восстанавливает значение.

## makeAlly(data, idx, moraleMult = 1) — формат данных (000081 по нему)

Поле | Правило
id | `data.id || 'a'+idx` (дискриминатор Эфира — 000081)
side | всегда 'ally' (у мобов 'mob' — добавлено в makeMob)
name/role/level | `data.role`, `data.level || 1`
maxHP | `data.maxHP != null ? data.maxHP : max(1, round((8+4·ур)·hp·hpRoleMult))`
hp | = maxHP (свежий союзник)
armor | `(data.armor || 0) + floor(ур / 10)`
damage | `data.damage != null ? data.damage : max(1, round((2+0.7·ур)·dmg·moraleMult))`
damageTakenMult | `1` (раунд ревью 1: тотальная модель урона — dealDamageToMob умножает на это; без него уронный каст давал hp = NaN)
moraleMult | 1 + companionMoraleBonus (см. ниже); хранится на юните
size/movePerTurn | 1×1 / 1; x=y=0 (расставит placeAllies)
traits | {} (v1: poison/lifesteal/debuff мобов — ТОЛЬКО против игрока)
skills/spells | `(data.X || []).slice()` — СПИСОК id заклинаний союзника
attrs | `data.attrs || {}` (атрибуты для формулы лечения; у наёмника {})
kind | `data.kind || 'merc'` (маркер Эфира — 000081)

**ЯВНЫЕ maxHP/damage переопределяют формулу** (Эфир 000081 передаёт свои).
hpRoleMult — те же, что у мобов: {support: 0.7, shield: 1.8}, иначе 1.0.
Формула БЕЗ множителей сложности (друзья — не «содержимое бездны»).

## Мораль (НЕ hasLeader)

`moraleMult = 1 + P.derived(p).companionMoraleBonus` (src/player.js,
навык ПРЕДВОДИТЕЛЬ, +5%/уровень; `pct('leader') = perLevel × уровень`).
Применяется к damage ВСЕХ союзников в makeAlly. **Не путать** с вражеским
`hasLeader` (бафф ГРУППЫ МОБОВ, LEADER_DMG_MULT — другая сущность,
регрессионный тест). 000112/000113 (урон-касты) берут u.moraleMult с юнита.

## Модель целей (расширение)

* `livingMobs` — фильтр `side==='mob' && alive && !fled` (союзники НЕ
  цели игрока/спеллов; при 0 союзников — ровно прежний набор).
* `livingAllies` — симметричный.
* `nearestMob` — дополнительно отбрасывает `side !== 'mob'`.
* `nearestEnemy(c, u)` — ближайший живой МОБ от союзника (rectDist,
  тай-брейк — порядок c.units, строгий <); null — врагов нет.
* `nearestPlayerSide(c, u)` — **ключ к гибельности союзника**: ближайшая
  цель СТОРОНЫ ИГРОКА от моба = игрок ИЛИ живой союзник. Возврат
  `{x,y,w,h,isPlayer}` | `{x,y,w,h,unit:ally}`; тай-брейк — ИГРОК
  (строгий <). При 0 союзников — всегда игрок.
* `checkVictory` — «побеждены» только `side==='mob'` (xp/loot/defeated).
  Гибель СОЮЗНИКА — НИКАКОГО checkVictory/поражения (dealDamageToAlly:
  hp=0, alive=false, лог «X пал в бою!», клетка освобождается).
* mobAct переписан на closure-ы `stepToTarget/stepFromTarget/attackTarget`
  поверх nearestPlayerSide: `attackTarget = target.isPlayer ? mobAttack
  (игрок) : mobAttackAlly(c, u, target.unit)`. Все ветки (melee-подход,
  ranged в даль, default-цикл с `rectDist(u, target) <= 1`-break) — через
  них. При 0 союзников бит-в-бит (rectDist(моб, игрок 1×1) ≡ unitDist).

## rectDist / шаги

* `rectDist(a, b)` — манхэттен-гАП между прямоугольками (rectOf
  нормализует {x,y,size}|{x,y,w,h}); 0 — пересечение/соседство по оси.
  Формула gap-based (ВАЖНО, первый вариант с «дистанцией до дальнего
  края» ломал бой 2×2-демоном против игрока — моб не подходил):
  `dx = ax1 < B.x ? B.x - ax1 : (bx1 < A.x ? A.x - bx1 : 0)`.
* `stepToward/stepAway` → тонкие обёртки над `stepTowardRect/stepAwayRect`
  (оригинальный порядок осей сохранён: большая ось, тай — x; бит-в-бит).
* `allyStepToward(c, u, r)` — союзник: СНАЧАЛА ось x (dx≠0), потом y;
  направление к цели; первая rectFree-клетка (1×1 — клетка).
* `allyStepAway(c, u, r)` — порядок →, ↑, ↓, ←; первая rectFree-клетка,
  где rectDist выРОС. (Не «зеркало» stepAway: пиннуты красными тестами.)

## ИИ союзника (allyAct)

Цель — nearestEnemy; врагов нет — return (бой кончается чужим
checkVictory). `d = rectDist(u, t)`.

* **ranged**:
  * d ≤ 1 — **ПАНИКА**: цикл `while (dNow <= 2) allyStepAway`, затем
    лог «X отступает.» (лог независимо от успеха шага — как у моба).
    Одного шага НЕДОСТАТОЧНО: за ход между враг тоже сдвинется, и красный
    тест пинит рост дистанции к концу раунда — отступление идёт до d ≥ 3.
  * 1 < d ≤ RANGED_MAX_DIST (4) — `allyAttack` БЕЗ сближения.
  * d > 4 — **один** `allyStepAway` («кайтинг»-шаг). Пин красным тестом:
    из (5,4) к волку (0,0) шаг в (6,4) — «к цели» математически невозможно
    ни для какого toward-правила; поведение зафиксировано тестом, не
    менять без изменения теста.
* **support** — `allyHeal` (ниже); true → return. Нет раненого/спеллов/
  каталога → **melee-фолбэк**.
* **melee/shield/swarm/support-фолбэк**: d ≤ 1 → allyAttack; иначе цикл
  movePerTurn × allyStepToward (break при d ≤ 1).
* endPlayerTurn: `u.side === 'ally' ? allyAct : mobAct` — инвариант 000036
  (c.turnOrder[c.turnIndex] = id действующего) сохранён; очередь
  `['player', ...союзники, ...мобы]` (buildTurnOrder, порядок c.units).

## allyAttack / dealDamageToAlly / mobAttackAlly

* `allyAttack(c, u, t)` — t = МОБ: ролл `c._rng() >= hitChance(u.level, 0,
  t.level, 0)` → «X промахивается.»; иначе `dealDamageToMob(c, t,
  u.damage)` (ВНИМАНИЕ: 2-й аргумент dealDamageToMob — ПОЛУЧАЮЩИЙ;
  ошибка «бьёт себя NaN» была здесь) → «X бьёт Y: N.»
* `dealDamageToAlly(c, t, raw)` — `max(1, round(raw) - armor)`; гибель —
  см. выше. Никаких c.ps-эффектов (щит/блок/Несокрушимость — игрок, v1).
* `mobAttackAlly(c, u, t)` — ролл промаха (level моба/0 vs level
  союзника/0), тик ослабления, dealDamageToAlly; **без** трейтов моба.

## Лечение (allyHeal)

* Каталог ЛЕНИВО: `combatInternals.allySpells`; нет → false.
* Спелл — сильнейшая **степень** «лечение» из СПИСКА СОЮЗНИКА u.spells
  (тай — порядок списка).
* Пул — [игрок, ...живые союзники]; **самый раненый** = мин. доля
  hp/maxHP; frac ≥ 1 исключается (включая «пере-HP» 9999/270 = 3.7);
  тай — порядок пула (игрок первым). Никто не ранен → false.
* Формула — формула лечения spells.js с attrs СОЮЗНИКА:
  `round((4 + 0.5·(attrs[спелл.атрибут]||0) + u.level) · (1 + 0.15·(степень−1)))`
  (у наёмника attrs {} → уровень). Игрок — `P.heal` (через maxHP/эффекты);
  союзник — прямой `a.hp = min(maxHP, a.hp + amount)`.
* Лог: «X лечит Y (+N).»

## Расстановка (placeAllies)

* БЕЗ RNG (бит-в-бит при 0 союзников тривиален: не вызывается).
* occ-сетка = игрок + все клетки c.units (мобы уже расставлены).
* Якоря ПО ПОРЯДКУ: (px−1,py−1), (px+1,py−1), (px,py−1), (px−1,py),
  (px+1,py); каждый союзник — первая свободная; занятые якоры
  добавляются в occ (не стоят на друг друге).
* Фолбэк — скан снизу вверх: y от height−1 до 0, x 0→width (союзники —
  внизу поля). Не нашлось → **throw** «нет места для союзника N».
* В createCombat: ПОСЛЕ placeUnits(мобы), **ДО generateObstacles**
  (клетки союзников попадают в reserved). Поток c._rng не меняется.
* **Порядок (раунд ревью 2): placeAllies — ДО `c.units.concat(allies)`.**
  makeAlly инициализирует x=0, y=0 — при конкатенации раньше
  расстановки клетка (0,0) ложно попала бы в occ-сетку (скан снизу
  вверх: (0,0) — последняя клетка) и createCombat бросал «нет места»
  при свободной (0,0) (демо 4×1). Регрессионный тест — «расстановка:
  клетка (0,0) НЕ ложно занята…».

## Отказ от целей игроком (пинуты)

* playerAttack / playerSpell(огонь) / canDoAction(attack/fire) —
  союзник-цель → `{ok:false, reason:'нет цели'}` (плюс !alive/fled).
* playerSelectTarget — союзник → `{ok:false, reason:'недоступная цель'}`.
* playerMove на клетку союзника → `{ok:false, reason:'тут стоит союзник'}`
  (у мобов «тут стоит моб» — прежний текст сохранён).
* evalSpell (core-API spells.js, 000045): явный targetId = союзник →
  `{ok:false, reason:'нет цели'}` для ВСЕХ целевых веток (урон/
  ослабление/контроль) — раунд ревью 1: это был единственный путь
  прицеливания игрока без side-проверки (каст ставил союзнику hp = NaN).
  canCastSpell — зеркало, отказ ДО расхода пула/маны. Тест —
  tests/spells.test.js «castSpell: союзник как цель».

## Бит-в-бит (при 0 союзников) — ГАРАНТИИ

1. makeMob — только добавлено поле `side:'mob'` (на логику не влияет).
2. rectDist(моб, игрок 1×1) ≡ unitDist; stepToward/stepAway — обёртки,
   порядок осей и тай-брейк (большая ось, тай — x) не тронуты.
3. nearestPlayerSide при 0 союзников — всегда игрок → mobAct по прежней
   траектории; livingMobs/nearestMob — прежние наборы.
4. placeAllies/allyAct/makeAlly не вызываются; очередь — тот же состав.
5. ПОДТВЕРЖДЕНО (сценарный diff /tmp/bfb-check, 6 боёв без союзников:
   groupType 0/2/3/6/5 с сидами 3/33/9/8/7 + явный mobs-состав, seed 42):
   result, hp, позиции/состояние всех юнитов, ПОЛНЫЕ логи, turnOrder,
   obstacles — идентичны старой и новой версии combat.js.

## Риски / фоллоу-апы

* 000081 (Эфир): данные makeAlly c id/kind/'ether', явными maxHP/damage,
  attrs и spells; каталог уже лениво доступен.
* 000082 (наёмники в бою): opts.allies = записи отряда (000079) →
  makeAlly; мораль уже учитывает уровень Предводителя.
* 000112/000113 (урон-касты): читать `u.moraleMult` с юнита, не
  пересчитывать.
* rectFree блокирует союзников стенами/мобами — паника/кайтинг могут
  «застыть» (break, лог сохраняется) — приемлемо для v1.
* Тай-брейки (порядок c.units, «игрок первым») — намеренно простые;
  при росте отряда 000082 проверить, что не возникают дегенеративные
  «все лезут к самому».
* Трейты мобов против союзников (яд/вампиризм) — НЕ v1, по пину теста.

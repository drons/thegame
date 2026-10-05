# 000135: Зоны групп 3×3/5×5 и раннее предупреждение боя (контракт)

Станция Проектирование, 2026-10-05. Worktree task-000135, ветка
task/000135, база master 375c0f4. Базовый прогон: 1616/1616 зелёных
(log /tmp/thegame-wf-000135/baseline-test.log, ~102 c). Все
имена/строки сверены с актуальным кодом. Ссылки: ТЗ
tasks/pending/000135.md; memory/000001-improvement-audit.md §3 (000135),
§4.8 (Застращивание — ПОСЛЕ мержа). Краткая карточка правила —
memory/000135-group-zones.md.

## 1. Что добавлено (файлы, области)

НОВОГО МОДУЛЯ НЕТ. НОВОГО <script>-ТЕГА НЕТ. CSS/SVG/ASSET'ОВ НЕТ
(предупреждение — текстовая строка HUD). ТЗ-список файлов: main.js +
hud.js (+ assets/mob_groups — только в варианте B, ОТКЛОНЁН — §3 D1).

### src/combat.js — ЧИСТОЕ ЯДРО ЗОНЫ (+~55 строк)

combat.js уже владеет MOB_TYPES, AGGRO, GROUP_RECIPES (и
FALLBACK_GROUP_RECIPES), require-абелен в node (tests/combat.test.js
паттерн), при загрузке — ноль обращений к Game. Новые чистые функции
(без rng, без map/Game в момент вызова) + 2 экспорта:

```
groupZoneInfo(groupType) → { radius: 1|2, triggers: boolean }
  recipe = GROUP_RECIPES[groupType]; first = recipe.mobs[0];
  aggro = MOB_TYPES[first] ? MOB_TYPES[first].aggro : null;
  triggers = aggro === AGGRO.AGGRESSIVE || aggro === AGGRO.TERRITORIAL;
  → triggers ? { radius: 2, triggers: true }
             : { radius: 1, triggers: false }
  (нет recipe / mobs / aggro → консервативно { 1, false } —
  бой только на тайле, как до 000135)

findZoneCombat(px, py, groupTiles, defeatedAt)
  → { x, y, mobGroup } | null
  groupTiles: hasMobGroup-тайлы окрестности ИГРОКА (окно Чебышёва
    ≤ 2 = максимум радиуса; собирает ВЫЗЫВАЮЩИЙ из tileCache —
    combat.js НЕ знает про map/tileCache); тайл = { x, y,
    hasMobGroup, mobGroup, … } (формат map.tileAt).
  defeatedAt: Map 'x,y'→день (ключ = ТАЙЛ ГРУППЫ) или null.
  ЛОГИКА (чистая, детерминированная, без rng):
  1) группа НА ТАЙЛЕ ИГРОКА (dist 0, ЛЮБОЙ класс, !defeatedAt) →
     она — приоритет, ТЕКУЩЕЕ поведение бит-в-бит;
  2) иначе по кандидатам dist>0: groupZoneInfo(t.mobGroup).triggers
     === true && dist ≤ radius && !defeatedAt.has('t.x,t.y') →
     минимальный (dist, x, y) по Чебышёву, tie-break (x, y)
     лексикографически (детерминизм при множестве зон);
  3) иначе null.
```

Экспорт — в return-блок ПОСЛЕ `reachableCells`, ДО
`combatInternals`, с комментом «// Зоны (задача 000135): …».
Поверхность экспорта combat.js НИГДЕ не зашита тестами (проверено
grep: тесты деструктируют конкретные ключи) — добавление безопасно.
Семантика «тайл-группа всегда побеждает» — осознанная: стоя на своём
тайле герой дерётся со СВОЕЙ группой (как сейчас), зона чужой группы
не перехватывает.

### src/main.js — проводка (ОДНА область + 2 микро-хунка, +~60/−8)

(a) **Load-time гард + хелперы** — топовый уровень ПРЯМО ПЕРЕД
`function maybeStartCombat()` (сегодня :1595; коммент «// Шаг на
тайл с группой…» :1594) — в пределах ТЗ-области:

```js
// 000135: зоны групп — чистое ядро в combat.js. combat.js обязан
// грузиться ДО main.js (UMD-ловушка 000038: снапшот const G снят
// вверху, :13). Модуль/экспорт отсутствует (регрессия порядка) —
// видимая ошибка ОДИН раз + поведение ДО 000135 (бой только на
// тайле — деградация, не крах; паттерн 000053/000071).
if (typeof G.findZoneCombat !== 'function'
    || typeof G.groupZoneInfo !== 'function') {
  console.error('main.js: Game.findZoneCombat/Game.groupZoneInfo ' +
    'отсутствуют — src/combat.js обязан грузиться ДО src/main.js ' +
    '(000135) — зоны групп отключены (бой только на тайле)');
}

// 000135: hasMobGroup-тайлы окрестности игрока — окно Чебышёва
// ≤ 2 = максимум радиуса зоны. tileCache (000019) — шум НЕ
// пересчитывается (map.tileAt — fbm на каждый вызов).
function nearbyGroupTiles() { /* ±2 по dx/dy, tileCache.tile,
  фильтр t.hasMobGroup, список */ }

// 000135: зона для текущей позиции (тайл группы или null) —
// ОДИН общий скан (бой + HUD). Тихий гард — ошибка уже видна
// при загрузке.
function zoneCombatInfo() {
  if (typeof G.findZoneCombat !== 'function') return null;
  return G.findZoneCombat(player.x, player.y,
    nearbyGroupTiles(), defeatedAt);
}

// Тайл zone-боя (тайл ГРУППЫ) или null.
function zoneCombatTile() {
  const z = zoneCombatInfo();
  return z ? tileCache.tile(z.x, z.y) : null;
}

// Группа зоны для HUD (ВНЕ тайла группы) или null — ЗНАЧЕНИЕ для
// ctx (000129: hud.js не дотягивается до Game/map). dist 0 → null:
// на тайле группы — существующая ветка (пин).
function zoneGroupForHud() {
  const z = zoneCombatInfo();
  return z && (z.x !== player.x || z.y !== player.y)
    ? z.mobGroup : null;
}
```

(b) **maybeStartCombat — реструктура** (:1595-1676; onEnd-блок
:1616-1650 — НИ ОДНОЙ СТРОКИ НЕ ТРОГАЕМ, это главное ограничение
для чистого ребейза с 000132):

* Сигнатура: `function maybeStartCombat(scanZones)`.
* Гварды (combatUI.isActive, закрытие оверлеев) — без изменений,
  `return` → `return false`.
* Замена :1606-1610 — переменная `t` ПЕРЕИМЕНОВАНА В «ТАЙЛ БОЯ»
  (тайл группы): на тайле — тайл игрока (БИТ-В-БИТ), в зоне —
  тайл группы. ВСЁ, что читает `t` дальше (tile/terrain в opts,
  `t.mobGroup` в onEnd-закрытии :1641) — БЕЗ ПРАВOK:
```js
const pt = tileCache.tile(player.x, player.y); // кэш (тот же тайл)
const t = pt.hasMobGroup                        // тайл-путь
  ? pt                                          // (как сейчас)
  : (scanZones ? zoneCombatTile() : null);      // зона-путь (5×5)
if (!t) return false;
const key = t.x + ',' + t.y;   // 000135: ключ ТАЙЛА ГРУППЫ
if (defeatedAt.has(key)) return false; // ОБЩИЙ guard (ТЗ)
```
* Единственная правка в startCombat-литерале — seed :1628:
  `G.hash2(t.x, t.y, 0x5eedc0de)` (было player.x/y — на тайле
  значения ИДЕНТИЧНЫ: существующие createCombat-пины не
  сдвигаются; salt 0x5eedc0de — единственное вхождение в репо,
  тестами не пинится — a3 §1). `tile: t, terrain: t.terrain` —
  строки БЕЗ ИЗМЕНЕНИЙ (t = тайл группы).
* Возврат: `return true` ПОСЛЕ `noteEfirCombat(combat)`; ВСЕ ранние
  выходы — `return false`. Чужих потребителей возврата нет
  (вызовы — frame :2241 и спавн :2483).

(c) **frame** :2241-2242 — 2 строки → 4:
```js
// 000135: скан зон — ТОЛЬКО на успешном шаге (ТЗ); бой > вход в
// локацию (два оверлея в одном кадре — сломанное состояние;
// вход откладывается на следующий шаг — герой на тайле входа,
// побег/смерть — возврат на prevPos).
if (!maybeStartCombat(true)) enterLocation(); // 000127
```

(d) **renderHud** :2199-2216 — в ctx-литерал +1 ОПЦИОНАЛЬНОЕ поле
(17-е, паттерн exploredCount 000093 / campShopFor 000095):
`zoneGroup: dungeonState ? null : zoneGroupForHud(),` — в
подземелье/городе скан не гоняем (цепь hud.js и так гасит
ветку по dungeonState). ЗНАЧЕНИЕ (не функция) — контракт 000129.
Пересчёт на КАДР — намеренный: defeatedAt живая (победа /
респаун на смене дня → строка уходит без доп. инвалидаций).

(e) **НЕ ТРОГАЕМ**: findSpawn (:1194-1211 — спираль обходит только
group-тайлы; решение D2 делает спавн чистым), старт-вызов
:2483 `maybeStartCombat()` (без аргумента = tile-only: «телепорт/
старт — не шаг», фиксатор Z6б), moveHero (:1227 — телепорт
построек без скана; первый успешный шаг — скан), onEnd (:1616-1650),
сейв-механику (defeatedAt — тот же Map 'x,y' → день, схема 000085
без правок).

### src/hud.js — ОДНА новая ветка (+~10 строк)

Цепочка if/else-if buildLine НЕ ТРОГАТЬ (пины HU4 h/i побайтово).
ПОСЛЕ ветки `else if (t.hasMobGroup)` (:212-218), ДО flash:
```js
} else if (ctx.zoneGroup != null) {
  // 000135: зона триггерящей группы (ВНЕ тайла группы) — раннее
  // предупреждение ДО боя. zoneGroup — ЗНАЧЕНИЕ из ctx (main.js:
  // findZoneCombat по живому defeatedAt, dist > 0 — только
  // aggressive/territorial 5×5). На тайле группы — ветка выше
  // (без изменений, пин). Поверженная сегодня группа — ТИШИНА
  // (main.js фильтрует defeatedAt). Нет поля / undefined / null —
  // ветка мертва (000129, паттерн campShopFor — существующие
  // строки побайтово).
  line += '\nОсторожно: ' + g.mobGroupName(ctx.zoneGroup) + ' — зона';
}
```
Формулировка — по главному кандидату ТЗ: «Осторожно: <группа> — зона»
(тире с пробелами, без «!»). Приоритеты цепи (детерминированно):
dungeonState > hasBuilding (hereLine) > hasMobGroup (старые строки,
пин) > zoneGroup > flash. Поверхность экспорта hud.js НЕ
МЕНЯЕТСЯ (6 экспортов, пин HU1).

### index.html / tests/index-order.test.js — БЕЗ ИЗМЕНЕНИЙ

combat.js (:699) грузится ДО hud.js (:790) и main.js (:807) — порядок
уже корректен. НОВОГО модуля нет (решение D3).

### assets/mob_groups — НЕ ТРОГАЕМ

Выбран вариант A (aggro MOB_TYPES, без изменения данных) — D1.

## 2. Контракты детерминизма

* **Триггер — чистая функция** (позиции + состав + defeatedAt):
  rng НЕТ (groupZoneInfo/findZoneCombat — без seed/случайности, без
  обращений к Game/map в момент вызова). Два вызова с теми же
  аргументами → идентичный результат (deepEqual); аргументы не
  мутируются.
* **Seed боя**: НА ТАЙЛЕ — hash2(player) = hash2(группа) — значение
  НЕ МЕНЯЕТСЯ (tests/combat.test.js — явные сиды — проходят;
  world-e2e 000112 — та же формула). ZONE-СТАРТ — hash2(gx, gy,
  0x5eedc0de) — новая точка; первый rng-вызов createCombat —
  уровень-дельта (combat.js) → всё downstream (уровни/обstacles)
  детерминировано от тайла группы.
* **Якоря боя — тайл ГРУППЫ (gt)**: key='gx,gy', seed, terrain,
  t.mobGroup (groupType/groupName в combat-ui.js:1050-1054),
  defeatedAt, quest notifyGroupDefeated — ВСЁ от тайла группы.
  На тайле группы gt = тайл игрока → БИТ-В-БИТ как сегодня.
* **defeatedAt**: формат 'x,y' И ключ = ТАЙЛ ГРУППЫ — без
  изменений; победа в zone-бое ставит тот же ключ; «повержена
  сегодня» — зона И тайл не триггерят (общий guard :1610-экивалент
  в начале). Респаун (dueForRespawn, day.js) — без изменений:
  группа «вернулась» → следующий шаг в зоне → бой (корректно).
* **Поведение нейтральных/трусливых**: БИТ-В-БИТ (бой только на
  тайле; 3×3-зона без триггера).
* **Триггер — только на успешном шаге** (frame, после tryMove):
  старт/restore/телепорт (moveHero) — tile-only; «первый успешный
  шаг в зоне» → бой (фиксатор Z6б). Стоять в зоне, не двигаясь, —
  боя нет (keys пуста — шагов нет).
* **Сейвы**: схема НЕ меняется. Сейв в зоне → restore → на буте
  боя нет; первый шаг → бой (детерминированно, не краш).
* **Зона-боев при спавне НЕТ** (D2): фолбэк-мир детерминирован,
  spawn (0,0) вне всех триггерящих зон (ближайшая — spider (2,3),
  Чебышёв 3; skeleton (1,0) — нейтральная 3×3, без триггера).
  Регресс-пин — Z7 (e2e: boot → combatUI неактивен).

## 3. Решения (openQuestions закрыты)

* **D1 — источник размера зоны: ВАРИАНТ A + FIRST-правило**
  (aggro mobs[0] рецепта; без правки assets/mob_groups).
  Почему: ТЗ разрешает «выбор при реализации», скобка «по aggro
  доминирующего/первого моба» — FIRST-реализация; альтернатива
  «есть aggressive» (ANY) ломает БУТ — skeleton_den (1,0) становится
  5×5 и spawn (0,0) оказывается в её зоне → бой при старте →
  ВСЕ full-chain vm-тесты (проверено вычислением, a1 §2.2);
  вариант B (поле «агрессивность» в особые_параметры) = 7 JSON +
  regen sync-mob-groups-data.js + ре-пины — ноль выигрыша в
  детерминизме. Итог: 5×5+триггер = {0 orc_camp, 1 orc_raid,
  4 spider_nest, 5 elemental_circle, 6 abyss_spirit};
  3×3 без триггера = {2 skeleton_den, 3 wolf_pack}. Обратимость:
  смена правила later = 1 строка groupZoneInfo + ре-пин
  unit-таблицы Z1.
* **D2 — findSpawn НЕ ТРОГАЕМ** (следствие D1). Почему: спавн чистый
  в обоих мирах (фолбэк — вычислено; реальный map.png — спавн
  обходит group-тайлы как раньше; «бой на старте» возможен только
  при спавне ВНУТРИ зоны — регресс-пин Z7 ловит деградацию).
  Альтернатива (спираль обходит зоны) — отклонена: сдвигает spawn →
  золотые пины, зависимые от spawn.
* **D3 — чистая функция в ЭКСПОРТАХ combat.js** (не новый модуль,
  не локальные функции main.js). Почему: ТЗ-список файлов —
  main.js + hud.js (+опц. assets) — новый UMD-модуль + <script>-тег
  + пин index-order = больше, чем просит ТЗ (инвариант «не больше
  и не меньше»); combat.js уже владеет MOB_TYPES/AGGRO/GROUP_
  RECIPES, node-тестируем (красные Z1/Z2 — node-таблицы по
  прямому require), ноль новых require (UMD-ловушка 000038 не
  затронута), экспортная поверхность не пинится; локальные
  функции main.js (вариант a1) требовали бы __game-крючка и
  тестирования только через vm.
* **D4 — скан зон ТОЛЬКО на успешном шаге**:
  `maybeStartCombat(scanZones)` — frame передаёт `true`; старт
  :2483 — без аргумента (tile-only); restore/телепорт — не шаг.
  Почему: ТЗ-формулировка «скан зон на каждом успешном шаге»;
  телепорт в зону — предупреждение HUD + бой на первом шаге
  (осознано, зафиксировано); фиксатор Z6б (seedSave в зоне →
  на буте боя нет, первый шаг → бой).
* **D5 — «бой > локация»**: `if (!maybeStartCombat(true))
  enterLocation()` — бой побеждает, вход в пещерю/город
  откладывается на следующий шаг. Почему: зона делает возможной
  новую ситуацию — тайл ВХОДА (hasBuilding) внутри 5×5-зоны
  триггерящей группы (тайл ГРУППЫ постройкой быть не может —
  map.js: hasMobGroup = passable && !cover); без приоритета в
  одном кадре открылись бы ДВА оверлея (бой + dungeon/city UI —
  сломанное состояние). Альтернатива (enterLocation-гард
  combatUI.isActive) — отвергнута: шире семантический след.
  ТЗ молчит — зафиксировано здесь.
* **D6 — формулировка HUD-строки**: «Осторожно: <группа> — зона»
  (основной кандидат ТЗ). Почему: ТЗ прямо предлагает; побайтовый
  пин Z4; не требует «!» (боя ещё нет — предупреждение).
* **D7 — приоритет zone-строки: else-if В КОНЦЕ ЦЕПИ** (после
  hasMobGroup, до flash). Почему: состояние «на тайле постройки
  ВНУТРИ живой триггерящей зоны» недостижимо в обычной игре (бой
  начинается на шаге входа) — дублирующая строка не нужна;
  единый детерминированный приоритет «одна предупреждающая
  строка»; минимальный дифф цепочки (пины HU4 h/i побайтово).
  Поверженная группа в зоне — ТИШИНА (findZoneCombat фильтрует
  defeatedAt; «повержена.» — только на тайле, как сейчас).
* **D8 — тайл в startCombat = тайл ГРУППЫ** (tile/terrain/
  groupType/groupName/seed/key/quest — ВСЁ от gt). Почему: ТЗ
  явно (seed — от тайла группы); единый якорь «бой с группой на
  её территории»; на тайле — бит-в-бит.
* **D9 — мульти-зона**: ближайшая по Чебышёву, tie-break (x, y)
  лекс. Почему: чистая функция (в фолбэк-мире 202 пересечения
  зон — выбор обязан быть детерминирован).
* **D10 — prevPos в zone-бое** — тайл ДО шага входа (обычно вне
  зоны): побег/смерть → teleport назад, re-trigger loop НЕТ
  (tryMove :1579-1592 не тронут). Исключение — сейв ВНУТРИ зоны:
  побег → prevPos тоже в зоне → следующий шаг → бой снова
  (группа не повержена) — консистентно с тайл-поведением
  (документировано, не баг).

## 4. Ленивые ссылки и гарды

* `const G = globalThis.Game` (main.js:13) — снапшот ОДИН раз
  (000038). G.findZoneCombat/G.groupZoneInfo/G.MOB_TYPES/
  G.AGGRO/G.GROUP_RECIPES — на месте в момент вызова (combat.js
  :699 < main.js :807 — проверено).
* **Load-time гард** (main.js, перед maybeStartCombat):
  typeof-проверка обоих экспортов → console.error ОДИН раз
  (паттерн 000129 D12 / 000053; vm-песочницы собирают console.
  error в errors[] — HU5/errors.length === 0 остаётся зелёным).
* **Per-call гарды** (zoneCombatTile/zoneGroupForHud): тихий
  `return null` — деградация = поведение ДО 000135 (бой только на
  тайле, строки HUD как до), игра НЕ падает.
* tileCache (main.js:222, заполнен :2474 ДО findSpawn/старт-
  вызова :2483) — на всех точках вызова non-null; `tileCache.
  tile` вместо `map.tileAt` в maybeStartCombat (тот же тайл, кэш;
  fbm-шум не пересчитывается). 25 кэш-lookup'ов на шаг + 25 на
  кадр — O(1), пренебрежимо (buildFrame гоняет те же тайлы).
* hud.js: `g.mobGroupName` — лениво из ctx.game (map.js :681 <
  hud.js :790 — на месте всегда; коммент :214).
* combat.js: groupZoneInfo — null-safe (нет recipe/mobs/aggro →
  { 1, false }); findZoneCombat — null-safe defeatedAt,
  пропускает не-group тайлы в списке.

## 5. Что важно будущим задачам

* **СЕРИЯ зон — «Застращивание» (fearChance, audit §4.8) —
  СЛЕДУЮЩАЯ задача ПОСЛЕ мержа 000135**: «группа уровнем ниже
  разбегается при входе в зону». Шов уже проложен: триггер —
  вызов findZoneCombat в maybeStartCombat (точка входа в зону =
  момент, когда scanZones-путь вернул тайл группы);
  groupZoneInfo.radius уже несёт 3×3 для нейтральных — «разбега-
  ется при входе в зону» встанет в тот же шов (до startCombat,
  после нахождения gt); боя-на-тайле нейтральных НЕ трогаем.
* **000132 (параллельный workflow)**: правит 3 onEnd-победы
  (1308/1633/1905) — наша область :1595-1650 пересекается с её
  строкой :1633; НАШ diff в onEnd = ПУСТОЙ (0 строк) → чистый
  ребейз; при конфликте ревьюить БЛОКАМИ.
* **Зона-осведомлённость мир-walk e2e (все БУДУЩИЕ задачи с
  пешей ходьбой по миру)**: вход в 5×5-зону триггерящей группы =
  бой посреди маршрута (inCombat → tryMove заморожен → guard
  ходьбы истекает). Правила: (а) BFS-хелперы обязаны останавливать
  маршрут на первом тайле с `G.findZoneCombat(x, y, nearby, new
  Map()) !== null` (тайл группы ЛИБО край зоны); (б) walk-
  хелперы (walkTo/walkTiles/walkWorldRoute) обязаны
  авторазрешать zone-бой после шага (dealDamageToMob 9999 по
  мобам → Space), ИНАЧЕ бой по дороге; (в) ассерты тестов
  НЕ меняются — мир стал опаснее, маршруты учли (ТЗ-инвариант
  «технические правки, семантика сохранена»).
* **HUD ctx (000129)**: zoneGroup — 17-е ОПЦИОНАЛЬНОЕ поле
  (ЗНАЧЕНИЕ, не функция); hud.js НЕ знает про map/tileAt/зоны —
  строит строку из ctx; поверхность = 6 экспортов (пин HU1).
* **Соль 0x5eedc0de** — единственное вхождение в репо (main.js,
  seed строки); тестами НЕ пинится (tests/combat.test.js — явные
  сиды). Не пинать в новых тестах — сверять через G.hash2.

## 6. Подводные камни

* **main.js — горячий файл**: все правки — 4 хунка (гард+хелперы
  перед maybeStartCombat, тело maybeStartCombat, frame :2241-2242,
  renderHud ctx). onEnd-блок :1616-1650 БИТ-В-БИТ (0 строк).
* **Окно ±2 — ровно максимум радиуса**: радиус 2 → группа-кандидат
  находится в ±2 от игрока (симметрия Чебышёва); шире окна —
  лишний fbm, уже — пропуск зон. НЕ расширяйте без изменения
  radii в groupZoneInfo.
* **tileCache vs map.tileAt**: map.tileAt — fbm-шум на каждый
  вызов (дорого); в хелперах — ТОЛЬКО tileCache.tile. (renderHud
  для ТАЙЛА ИГРОКА продолжает map.tileAt — один раз на кадр,
  существующее поведение, не трогаем.)
* **Группа и постройка на одном тайле невозможны** (map.js:
  hasMobGroup = passable && !cover) — «тайл группы = вход» —
  несуществующий кейс; «вход ВНУТРИ зоны» — только зона-путь
  (D5).
* **HU4 h/i (hud.js.test.js:354-373) — побайтовые пины ТИЛ-строк**:
  в тех ctx нет поля zoneGroup → зона-ветка мертва → пины зелёные
  БЕЗ правок. Новые HUD-кейсы — ДОБАВЛЕНИЕ (не правка).
* **CB-8 (main-visuals :1742)**: бой-2 (spider_nest, territorial)
  начнётся на шаге ВХОДА В ЗОНУ (вычислено: (1,1), Чебышёв 2 от
  (2,3)), а не на тайле (2,3) — техническая правка
  worldGroupRoute (стоп на краю зоны) + подписи; ассерты
  group-агностичны (Эфир/xp) — проходят. Бой-1 (skeleton_den
  (1,0), neutral) — без изменений (BFS DIRS112: [[1,0],…] —
  (1,0) находит раньше (0,1), который в зоне).
* **Затронуты walking-e2e** (маршруты пересекают зоны; вычислено
  на фолбэк-мире, a3 §5): building-effects B3/B4/B7/B10/B11/B13/
  B17/B18/B19 (цели circle 43 (4,3) / слот 7 (3,-4) САМИ в зонах
  — обойти невозможно, авторазрешение боя; B24 — дистанция 3,
  без правки), main-visuals CB-8, city-screen HUD 000073 (храм
  38, маршрут через (0,1) ∈ зоне). city-interact/camp-map-e2e —
  безопасны (дистанции 3-4) — правка хелпера всё равно общая.
  Pre-seed тесты (B21/B22, seedSave) — без ходьбы → без правки.
* **Флейки** vm-набора (известные) — перепуск + запись в отчёт.
* **000081 e2e** (отладочный startCombat(0), seed от тайла игрока)
  — другой путь (debug), НЕ меняется. Подземелья (startDungeon-
  Combat, CB-9) — НЕ меняется (зоны — только мировой триггер).

## 7. Тесты (красные Z1..Z7 + технические правки)

* **tests/mob-zones.test.js (НОВЫЙ, node)**: Z1 — таблица
  groupZoneInfo (все 7 типов + мусор 99/undefined → {1,false});
  Z2 — таблица findZoneCombat (синтетические groupTiles:
  агрессивная — в 5×5 бой / d=3 нет / углы; нейтральная — в 3×3
  тишина / на тайле бой; defeatedAt — зона И тайл; приоритет
  тайла; мульти-зона min(dist,x,y); чистота — deepEqual при
  повторе, аргументы не мутируются); Z2-св — фолбэк-мир:
  findZoneCombat(spawn) → null. RED: экспорта нет.
* **tests/hud.js.test.js (+кейсы, существующие НЕ ТРОГАТЬ)**:
  Z4a — buildLine(makeCtx({ zoneGroup: 0, game: {mobGroupName:
  …} })) → побайтово содержит '\nОсторожно: <имя> — зона';
  Z4b — t.hasMobGroup + zoneGroup → СТАРАЯ строка (приоритет);
  Z4c — без zoneGroup (текущий makeCtx) — без изменений
  (существующие HU4-пины = пин тишины); Z4d — dungeonState +
  zoneGroup → строка локации (цепь).
* **tests/mob-zones-e2e.test.js (НОВЫЙ, vm, full-chain)**:
  SEED-ПИН — spy-обёртка G.combatUI.startCombat ДО шага (тест
  владеет sandbox-G): `G.combatUI = Object.assign({}, orig, {
  startCombat: (opts) => { captured = opts; return orig.startCombat
  (opts); } })` — main.js читает свойство G.combatUI ДИНАМИЧЕСКИ
  (G = тот же объект, property-замена работает; замыкания
  оригинала цела). ВАЖНО (поправка к a3): c.seed НА ОБЪЕКТЕ БОЯ
  НЕТ (createCombat не хранит opts.seed; combat-ui.js:1055 —
  литерал opts) — opts-захват ЕДИНСТВЕННЫЙ путь пинить
  seed/tile/terrain. Живой c несёт c.groupType/c.groupName
  (доп. ассерты).
  Z5 — фланг: BFS к краю зоны триггерящей группы (не на тайл) →
  на шаге входа бой: combatUI.isActive(), игрок НЕ на тайле
  группы, c.groupType === mobGroup тайла группы; captured:
  opts.seed === G.hash2(gx, gy, 0x5eedc0de), opts.tile.x/y ===
  gx/gy, opts.terrain === terrain тайла ГРУППЫ; победа →
  поведение (Z6a). Z3 — seed: бой НА тайле (нейтральная, 1 шаг) →
  captured: opts.seed === G.hash2(player.x, player.y, salt)
  (поведение без изменений; тайл группы = тайл игрока). Z6a — повтор входа в
  ту же зону после победы — НЕ-бой + HUD без «— зона». Z6б —
  seedSave с position ВНУТРИ зоны (0,1) → рестарт → на буте боя
  НЕТ; первый успешный шаг ВЗОНЕ (вниз, (0,2), d=2) → бой.
  Z7 — spawn-инвариант: boot → combatUI неактивен +
  findZoneCombat(spawn) → null.
* **Технические правки (ассерты НЕ меняются)**: main-visuals —
  worldGroupRoute (стоп на первом тайле с findZoneCombat !== null)
  + walkWorldRoute (авторазрешение боя на НЕПОСЛЕДНИХ шагах) +
  подписи CB-8; building-effects walkTo (~:4894), city-screen
  walkTiles (:333), city-interact walkTiles (:727) —
  авторазрешение zone-боя после КАЖДОГО шага (dealDamageToMob 9999
  по живым мобам → Space; Эфир НЕ убиваем — отличие от
  resolveCombatVictory, где гибель Эфира — ассерт).
* **expectedRedCount (красная стадия)**: Z1..Z7 (node + vm) —
  падают осмысленно (нет экспорта/ветки/поведения), остальные
  1616 зелёные.

## 8. Ожидаемая дельта

| Файл | Дельта |
|---|---|
| src/combat.js | +~55 (2 функции + комменты + 2 экспорта) |
| src/main.js | +~60/−8 (гард 8, хелперы ~30, реструктура maybeStartCombat, frame 4 строки, renderHud +1) |
| src/hud.js | +~10 (1 ветка else-if + коммент) |
| tests/mob-zones.test.js | НОВЫЙ ~180 |
| tests/hud.js.test.js | +~40 (4 кейса) |
| tests/mob-zones-e2e.test.js | НОВЫЙ ~300 |
| tests/main-visuals.test.js | ±~30 (2 хелпера + подписи CB-8) |
| tests/building-effects.test.js | ±~15 (walkTo) |
| tests/city-screen.test.js / city-interact.test.js | ±~10/±~10 (walkTiles) |
| memory/000135-*.md | 2 НОВЫХ файла |
| CHANGELOG.md | +~4 (отдельный коммит, 2026-10-05) |
| index.html, index-order, assets/mob_groups | 0 |

## 9. Чек-лист реализации (кратко)

1. combat.js: groupZoneInfo + findZoneCombat + 2 экспорта.
2. tests/mob-zones.test.js (Z1/Z2) — RED.
3. hud.js: зона-ветка; tests/hud.js.test.js +4 кейса (Z4) — RED.
4. main.js: гард + nearbyGroupTiles/zoneCombatTile/zoneGroupForHud;
   maybeStartCombat(scanZones) (tile/zone-пути, общий guard,
   gt-якоря, boolean-возврат); frame hunk; renderHud ctx.zoneGroup.
5. tests/mob-zones-e2e.test.js (Z3/Z5/Z6/Z7) — RED.
6. Технические правки walk-хелперов (main-visuals,
   building-effects, city-screen, city-interact).
7. Полный npm test — зелёный (флейки — перепуск + отчёт).
8. memory/000135-*.md (эта станция) + отчёт tasks/result/000135.md.
9. CHANGELOG (отдельный коммит). Ребейз на master; блок onEnd
   (:1633, 000132) — ревью блоками. Мерж — стадия мержа
   (.merge-pending — только там).

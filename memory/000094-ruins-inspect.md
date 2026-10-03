# 000094: развалины (id 48) — «Осмотр»: лут / ловушка / запись — контракты и границы

Статус: СТАДИЯ ПРОЕКТИРОВАНИЯ (итоговая архитектура зафиксирована
анализами a1/a2/a3 + сверкой с кодом worktree HEAD cab0d27). Красная
стадия коммитит этот файл вместе с тестами.
Родитель: 000064 (план P4 — memory/000064-building-effects-plan.md).
Дизайн-док (числа каталога, формулы, «развалины ≠ вход») — ОТДЕЛЬНО:
memory/000094-ruins.md. Контракт specials — memory/000128-building-
actions.md §2.3/§2.5/§2.6. Паттерны (tile, day)-роллов — memory/
000074-rune-stone-obelisk.md.
Файл задачи tasks/pending/000094.md НЕ ИЗМЕНЯЕТСЯ (закоммичен в master):
решения фиксируются здесь.

## Что добавлено (область задачи)

* Реестр src/building-effects.js: запись EFFECTS['48'] «Осмотреть»
  (apply — ЧИСТЫЙ, ок:true во ВСЕХ валидных исходах — попытка
  сгорает, R3) + ЧИСТЫЕ rollRuinsContent / ruinsLoot / readNote +
  сиды RUINS_ROLL/LOOT/NOTE_SEED (экспорт — golden-пины).
* НОВЫЙ спец-модуль src/building-effect-48.js (UMD): «сторона»
  эффекта — урон ловушки (clamp HP ≥ 1) и лут (addItem) — по
  контракту 000128 §2.3 (саморегистрация registerSpecial('48', …)
  в момент СВОЕЙ загрузки; node-экспорт { handle, register }).
* Каталог assets/buildings/000048.json: + раз_в_день: true +
  эффект-объект { доли, урон_ловушки, порог_интеллект, предметы,
  тексты }; зеркало src/buildings.js — РЕГЕНЕРАЦИЯ
  `npm run sync:buildings` (НЕ руками; byte-тесты).
* index.html: тег building-effect-48.js в слоте спец-модулей (ПОСЛЕ
  building-actions.js L664, ДО hud.js L670, ДО main.js L678).
* Тесты: A55–A61 (node) + B24/B25 (vm e2e, новый хелпер findRuins)
  в tests/building-effects.test.js; S1 в tests/assets-schemas.
  test.js; пере-пин A1 (union + '48') + пин порядка в tests/
  index-order.test.js.

НЕ ТРОГАТЬ: src/main.js (0 строк — «wiring» ТЗ реализовано контрактом
000128 §2.3: маркировка/saveNow/flash — АВТОМАТИЧЕСКИ роутером),
src/building-actions.js (контракт 000128 §2.3), src/building-ui.js
(«реестр buildingUI» ТЗ = реестр EFFECTS — UI подхватывает через
effectIds/hasEffects автоматически), src/player.js, src/items.js,
src/locations.js (гард 000073 maybeEnterDungeon 48 → null —
РЕГРЕССИЯ), src/hud.js (хинт «([E] действия)» — автоматически через
hasEffects), src/day.js, src/map.js, assets/buildings/schema.json
(особые_параметры — ОТКРЫТЫЙ объект — новые поля проходят БЕЗ правки
схемы), assets/items/* (НОВЫХ предметов НЕТ — 16 СУЩЕСТВУЮЩИХ id),
NPC-каталог/схему, moonDreamHint (48-skip, building-effects.js:723),
чужие записи EFFECTS ('39' — 000077; '44'/'45'/'46'/'47'/'49' —
000091/92/93/95 — параллельные, свои hunk'и), .merge-pending, push,
чужие worktrees.

## Файлы и точки (worktree HEAD cab0d27)

| Файл | Точка | Что |
|---|---|---|
| src/building-effects.js | после OBELISK_TEXT_SEED (L134) | 3 сида RUINS_ROLL/LOOT/NOTE_SEED + комментарий 000094 |
| src/building-effects.js | после EFFECTS['42'] (L277-280) | `EFFECTS['48'] = { имя: 'Осмотреть', apply: (st) => applyRuins(st) }` + групповой комментарий |
| src/building-effects.js | после applyObelisk (L654) | секция 000094: rollRuinsContent, ruinsLoot, readNote, applyRuins (JSDoc + валидации) |
| src/building-effects.js | export (L1014-1027) | + rollRuinsContent, ruinsLoot, readNote, RUINS_ROLL_SEED, RUINS_LOOT_SEED, RUINS_NOTE_SEED |
| src/building-effect-48.js | НОВЫЙ файл | спец-модуль (≈100 строк): UMD, handleInspect, register |
| index.html | после L664 (building-actions.js), ДО L665-670 (коммент+hud.js) | свой тег + свой комментарий (слот спец-модулей 000128 §5) |
| assets/buildings/000048.json | особые_параметры | + раз_в_день: true + эффект (§Каталог); порядок ключей: даёт, раз_в_день, эффект, размещение |
| src/buildings.js | GENERATED id 48 (≈605) | ТОЛЬКО `npm run sync:buildings` |
| tests/building-effects.test.js | A1 (L125-140) | пере-пин union: ['36','37','38','40','41','42','48'] (единственная семантическая правка существующего теста; «кто смержился первым» — при rebase union с 000077/000091–95) |
| tests/building-effects.test.js | конец секции A (после A54, ≈1848) | A55–A61 |
| tests/building-effects.test.js | рядом findBuilding (≈2226) | хелпер findRuins (BFS БЕЗ пропуска слота 9) |
| tests/building-effects.test.js | конец файла (после B23, ≈3721) | B24, B25 |
| tests/index-order.test.js | «нужные модули» (≈34) | + 'src/building-effect-48.js' (техническая) |
| tests/index-order.test.js | после пина 000128 (≈724-733) | новый пин IO-000094 (§Пины) |
| tests/assets-schemas.test.js | конец | S1 (явная проверка записи 48 — ниже) |
| memory/000094-ruins.md | НОВЫЙ | дизайн-док (числа, формулы) |
| CHANGELOG.md | стадия мержа | «Игровой процесс», дата = день мержа (player-facing; программной части в записи НЕТ) |

## Контракты и границы

### Каталог 000048.json (имена ПОЛЕЙ ЗАФИКСИРОВАНЫ; форма — дизайн-док)

    "особые_параметры": {
      "даёт": "лут, ловушки, записи (интеллект)",   // СУЩЕСТВУЕТ
      "раз_в_день": true,
      "эффект": {
        "доли": { "лут": 40, "ловушка": 30, "запись": 30 },
        "урон_ловушки": 2,
        "порог_интеллект": 5,
        "предметы": [ 16 существующих id — см. 000094-ruins.md ],
        "тексты": [ 8 фрагментов — см. 000094-ruins.md ]
      },
      "размещение": { "слот": 9, "доля": 20 }       // СУЩЕСТВУЕТ
    }

* `доли` — ЦЕЛЫЕ ПРОЦЕНТЫ (ТЗ «40/30/30%»); код нормализует по сумме
  (Σ ≠ 100 не ломает формулу) — решение D-ДОЛИ (000094-ruins.md).
* `предметы` — СТРОКИ id из assets/items (все 16 СУЩЕСТВУЮТ —
  сверено с каталогом master; НОВЫХ предметов НЕ ВВОДИТЬ — ТЗ).
  Сверка id с каталогом — тест A56 (fs), НЕ в apply (у apply
  каталога items ГЛОБАЛЬНО нет — 000053).
* `особые_параметры.эффект` — ОБЪЕКТ (конвенция 000040/000075);
  строковых потребителей у 48 НЕТ (main-ханк 41 / scanTeleportPair
  читают op.эффект.стоимость/радиус — 48 не затронуты).

### apply — EFFECTS['48'] «Осмотреть»

state — тот же контракт 000071/000074: { day, tile: {x, y}, hero,
save: СНИМОК, map, catalog } (pipeline building-actions.js:162-178
передаёт catalog: b — РЕШЁННАЯ запись getBuilding(48)). applyRuins
читает ТОЛЬКО st.catalog.особые_параметры.эффект (каталога глобально
НЕТ — 000053).

Валидация (нарушение → { ok: false, message: 'недоступно' } —
паттерн applyRuneStone/applyObelisk):
* G = lazyGame(); нужны G.hash2 И G.skillLevel (perlin.js L583 /
  npc.js L598 — ОБА ДО building-effects.js L610 в CHAIN);
* eff = catalogEffect(st) — объект;
* eff.доли — объект: лут/ловушка/запись — конечные числа ≥ 0,
  сумма > 0;
* eff.предметы — массив ≥ 1 непустых строк;
* eff.тексты — validTexts (существующий хелпер);
* eff.порог_интеллект — конечное число;
* eff.урон_ловушки — конечное число ≥ 0;
* hero — объект (не-объект/массив — «недоступно», паттерн A53).
G.getItem — ОПЦИОНАЛЕН (имя предмета в message; отсутствует —
fallback-строка, НЕ «недоступно»).

Результат (ВСЕГДА ok:true при валидном входе — попытка сгорает в
ЛЮБОМ исходе; R3/D-СЕМАНТИКА):
* **лут**: `{ ok:true, content:'loot', itemId, message }`
  message = «Осмотр развалин: лут — «<name>».», name —
  G.getItem(itemId).name (без G.getItem/неизвестного id —
  «Осмотр развалин: лут.»);
* **ловушка**: `{ ok:true, content:'trap', damage: eff.урон_ловушки,
  message }` message = «Осмотр развалин: ловушка! −2 HP.»
  (Unicode-минус '−' — конвенция кодовой базы, main.js:1018);
* **запись, успех**: `{ ok:true, content:'note', success:true,
  fragment, message }` message = «Осмотр развалин: запись:
  «<фрагмент>»»;
* **запись, провал**: `{ ok:true, content:'note', success:false,
  message }` message = «Осмотр развалин: запись не читается.»
  (фрагмент в результате НЕ ВЫДАЁТСЯ — ТЗ; строка ТЗ дословно
  внутри сообщения).

Чистота (инвариант 000071/A12): deepEqual state/hero/save
ДО/ПОСЛЕ (тест A59). Урон/лут — НЕ в apply (исполнение —
спец-хендлер; apply не мутирует СНИМОК).

### Чистые функции (сигнатуры ЗАФИКСИРОВАНЫ)

* `rollRuinsContent(tileKey, day, eff, hash)` →
  'loot'|'trap'|'note'|null.
  tileKey — строка 'x,y' (XY_KEY_RE, существующий; мусор → null);
  x, y — разбор; r = deterministicRoll(x, y, day, RUINS_ROLL_SEED,
  hash) (= hash(x, y, seed ^ day) / 2^32, существующий хелпер);
  кумулятивные пороги, ПОРЯДОК ФИКСИРОВАН КОДОМ:
  r < лут/Σ → 'loot'; r < (лут+ловушка)/Σ → 'trap'; иначе 'note'
  (Σ = лут+ловушка+запись). Мусорные доли → null.
* `ruinsLoot(tileKey, day, items, hash)` → itemId|null.
  items[hash(x, y, RUINS_LOOT_SEED ^ day) % items.length] (паттерн
  pickFragment — переиспользуется, НЕ дублировать);
  не-массив/пусто/не-строки → null; мусорный tileKey → null.
* `readNote(level, threshold)` → boolean. Чистое сравнение
  level >= threshold (ОБА finite; иначе false). ДЕТЕРМИНИРОВАННО,
  НЕ вероятностный ролл (ТЗ «проверка Интеллекта: порог уровня»;
  тесты — кейсы на границе: порог−1 → false, порог → true).

Где берётся level: в apply — G.skillLevel(st.hero, 'intelligence')
(npc.js:48; 'intelligence' — primary, skills-data.js; стартовое
значение 1 — createCharacter, player.js:83-96). Отдельного
каталожного поля «навык» НЕТ — skill id ЗАДАНО ТЗ полем
порог_интеллект (формула фиксирована).

### Детерминизм (tile, day) — НИКАКОГО Math.random/Date

Сиды — СВОИ ASCII-константы (паттерн TELEPORT_TIE_SEED/STONE_*;
НЕ GLOBAL_SEED), ЭКСПОРТИРУЮТСЯ для golden-пинов:
* RUINS_ROLL_SEED = 0x5255494e  // 'RUIN' — ролл содержимого
* RUINS_LOOT_SEED = 0x52554c54  // 'RULT' — выбор предмета лута
* RUINS_NOTE_SEED = 0x52554e54  // 'RUNT' — выбор фрагмента записи
(различны между собой и со STNR/STNT/OBLT/TELP/SUBT — сверено).

hash — ПАРАМЕТР (паттерн 000074: песочница — инъект perlin.hash2,
игра — ленивый G.hash2 в момент apply).

### Раз-в-день (из каталога — принцип 000053)

* Флаг `особые_параметры.раз_в_день: true` — в КАТАЛОГЕ (ТЗ
  «флаг добавить в каталог id 48»); в записи EFFECTS['48']
  разВДень НЕ ставится (каталог побеждает — фиксатор A55).
* hasDailyLimit/buildingActions/readOncePerDay — БЕЗ ИЗМЕНЕНИЙ:
  ключ 'x,y:48' — из коробки (effectIds 1-к-1 подхватит '48';
  массив особых_параметры.эффекты в каталоге НЕ нужен — паттерн
  000074).
* Маркировка buildingOncePerDay.set + saveNow + flash + playerRender
  — АВТОМАТИЧЕСКИ роутером (pipeline building-actions.js:314-324,
  только при r.ok / sres.ok) — «wiring» ТЗ пункта 4 ЗАКРЫТ без
  правок main.js/building-actions.js (критерий 000128 BA7).

### Спец-модуль src/building-effect-48.js

Чистый UMD (обёртка 1:1 по форме building-actions.js; factory() БЕЗ
аргументов). Node-ветка: `module.exports = factory()` →
{ handle: handleInspect, register } (тесты регистрируют явно).
Browser-ветка: саморегистрация в момент загрузки:

    const G0 = typeof root.Game === 'object' ? root.Game : {};
    factory().register(G0);

register(G): G.buildingActions.registerSpecial('48', handleInspect)
(гард registerSpecial — уже в building-actions.js:63-77); НЕТ
buildingActions/registerSpecial → console.error('building-effect-
48.js: Game.buildingActions не найден — спец-действие «Осмотреть»
(развалины, id 48) НЕ зарегистрировано (src/building-actions.js
обязан грузиться ДО)') + БЕЗ регистрации (деградация 000053:
эффект работает до сообщения из apply, мир-сторон нет — игра не
падает; допустимо контрактом 000128). В момент загрузки — ноль
require/DOM/console (B1-семантика: errors.length === 0).

handleInspect(ctx) — ctx по 000128 §2.5 (роутер вызывает ТОЛЬКО при
r.ok; hero — ЖИВАЯ ссылка, r — объект apply по ССЫЛКЕ, world.game —
снапшот Game main.js):
* DEFENSIVE: !ctx || !ctx.r || ctx.r.ok !== true → { ok: true }
  (no-op).
* content === 'trap': ctx.hero.hp = Math.max(1, ctx.hero.hp -
  r.damage) (clamp ≥ 1 — НЕ УБИВАЕТ; hp=2 → 1, hp=1 → 1;
  r.damage — валидировано apply; дефенсивный fallback 2 при
  мусоре). БЕЗ боя (startCombat НЕ вызывается), БЕЗ учёта
  Конституции (ТЗ: формула фиксирована). → { ok: true }.
* content === 'loot': G = ctx.world.game (гард: G и
  typeof G.addItem === 'function', иначе no-op { ok: true });
  add = G.addItem(ctx.hero, r.itemId, 1) (items.js:315 —
  ДО main.js в CHAIN, в снапшоте ВСЕГДА в игре).
  * add.ok → { ok: true } (message — УЖЕ в r.message с именем
    из apply; флэш роутера msg = r.message || sres.message).
  * отказ (reason: 'нет свободных слотов инвентаря' /
    'слишком тяжело (лимит веса)' / 'неизвестный предмет: …')
    → r.message = «Осмотр развалин: не удалось подобрать лут
    (<reason>).» (МУТАЦИЯ r — объект по ссылке, роутер флэшит
    r.message ПЕРВЫМ) + { ok: true }. Р6: попытка ВСЁ РАВНО
    сгорает (маркировка/saveNow — роутером).
* content === 'note' (и любой другой) → { ok: true } (мир-сторон
  НЕТ; текст — в r.message).
* Отказ хендлера ({ ok: false }) НЕ предусмотрен: любая «сторона»
  применима либо degrades в сообщение (контракт 000128 §2.6 —
  для будущих задач).

### Пины index.html / index-order.test.js

Тег (СВОЙ hunk; чужие спец-теги 000091/92/93/95/000077 — свои,
порядок «каждый спец-модуль сразу после предыдущего» — 000128 §5;
при ребейзе — после чужих, если смержатся первыми):

    <script src="src/building-actions.js"></script>
    <!-- Развалины «Осмотр» (задача 000094): спец-действие id 48 —
         саморегистрация в Game.buildingActions.specials в момент
         загрузки (контрат 000128 §2.3: ПОСЛЕ building-actions.js,
         слот спец-модулей; ДО main.js — UMD-ловушка 000038). -->
    <script src="src/building-effect-48.js"></script>
    <!-- HUD (задача 000129 …) -->
    <script src="src/hud.js"></script>

CSS — НЕТ (строка оверлея/flash — существующие стили).
tests/index-order.test.js: (1) «нужные модули» += строка; (2) новый
пин (паттерн IO1/000128):

    pos('src/building-effect-48.js') !== -1
    pos('src/building-actions.js') < pos('src/building-effect-48.js')
    pos('src/building-effect-48.js') < pos('src/hud.js')
    pos('src/building-effect-48.js') < pos('src/main.js')   // UMD-ловушка 000038

АВТОМАТИЧЕСКАЯ РЕГРЕССИЯ: CHAIN в tests/building-effects.test.js
(L1858) парсит ВСЕ script-теги — весь секция B (B1..B25) подхватит
новый скрипт; B1 (errors.length === 0) — фиксатор чистой загрузки.

## Тесты (красные — падают ПО СУЩЕСТВУ, не по синтаксису)

* A55. реестр + раз-в-день: EFFECTS['48'] — имя «Осмотреть»,
  apply функция, в записи разВДень НЕ стоит; hasDailyLimit(
  getBuilding(48), '48') === true (каталог); buildingActions(c48,
  null, {day:1, tile:{x:5,y:7}, save:{buildingOncePerDay:{'5,7:48':1}}})
  → { id:'48', доступен:false, reason:'уже использовано сегодня' };
  day 2 → доступен (A48-паттерн на реальных записях).
* A56. каталог 48: раз_в_день true; эффект — объект: доли
  {лут:40, ловушка:30, запись:30} (целые, сумма 100),
  урон_ловушки 2, порог_интеллект 5, предметы — deepEqual точный
  список 16 id И каждый ∈ assets/items (fs-сверка id),
  тексты — deepEqual точный список 8 строк; зеркало
  src/buildings.js deepEqual JSON (A43-паттерн).
* A57. доли + детерминизм (реальный perlin.hash2): N=10000 —
  сетка x=i, y=j (i, j ∈ 0..99), day = i*100 + j: |лут−4000| ≤ 200,
  |ловушка−3000| ≤ 200, |запись−3000| ≤ 200 (ТЗ ±2%; замер на
  этой сетке: 4004/2951/3045); тот же (tileKey, day) → тот же
  content И тот же itemId И тот же fragment (два вызова + две
  сессии через очистку require.cache, A47-паттерн); разные
  (tile, day) → ≥ 2 различных content/itemId/fragment; сиды-
  экспорт (RUINS_*_SEED — значения pin-фиксатор); мусор:
  tileKey 'abc' → null, доли {} → null, предметы [] → null.
* A58. readNote — граница: порог−1 → false; порог → true
  (ГРАНИЦА — ТЗ «кейсы на границе»); порог+1 → true;
  NaN/не-числа → false. Реальное значение порога — из каталога 48.
* A59. apply('48') (withGame { hash2: PL.hash2, skillLevel:
  N.skillLevel }, catalog — реальный getBuilding(48), hero —
  mkHero с primary.intelligence): golden (tile '2,-4', замерено):
  день 1 → content 'loot', itemId 'meat', message содержит
  «Жареное мясо»; день 2 → content 'trap', damage 2, message
  «Осмотр развалин: ловушка! −2 HP.»; день 5 → content 'note':
  intelligence 5 (=== порога) → success:true, fragment ===
  тексты[7], message ⊃ fragment; intelligence 4 → success:false,
  message «Осмотр развалин: запись не читается.», БЕЗ поля
  fragment. PURITY: deepEqual state/hero/save ДО/ПОСЛЕ (hp НЕ
  меняет apply). Деградация: withGame({}) → «недоступно»
  (A36-паттерн: нет Game-функций); catalog без эффекта →
  «недоступно»; hero null → «недоступно».
* A60. спец-хендлер (require('../src/building-effect-48.js').handle,
  fake ctx { hero, r, world: { game } }): trap — hero {hp:10} → 8;
  {hp:4} → 2; {hp:2} → 1 (clamp, ТЗ-кейс); {hp:1} → 1 (не убивает);
  loot — spy G.addItem вызван (hero, itemId, 1), add.ok → r не
  мутирован, {ok:true}; add = {ok:false, reason:'нет свободных
  слотов инвентаря'} → r.message === 'Осмотр развалин: не удалось
  подобрать лут (нет свободных слотов инвентаря).' (R6-фиксатор);
  note — hero/r не мутированы; ctx без world.game / ctx.r null →
  {ok:true}, без краха.
* A61. vm-загрузка спец-модуля: (а) пара building-actions.js +
  building-effect-48.js в песочнице { console } → ошибки 0,
  Game.buildingActions.specials['48'] — функция (саморегистрация
  БЕЗ правок main.js — критерий 000128); (б) building-effect-48.js
  БЕЗ building-actions.js → без краша, console.error ⊃
  'Game.buildingActions не найден', specials пуст (000053-паттерн).
* B24. e2e (пре-сид, паттерн B21): seedSave({ day:1,
  position:{x:2,y:-4}, hero: mkHero() }) — развалины (2,-4) —
  ближайшие от спавна (0,0): 6 шагов BFS (findRuins — golden-пин
  достижимости: tile (2,-4), 6 шагов; ХОД НЕ используется —
  pre-seed держит день). HUD «([E] действия)» (red: до реализации
  у 48 нет эффектов → хинта нет); [E] → оверлей «развалины»,
  строка '48' «Осмотреть» доступна; Digit1 → Голден день 1 = ЛУТ:
  инвентарь + 'meat', flash «Осмотр развалин: лут — «Жареное
  мясо».», saveNow: readSave(h).data.buildingOncePerDay['2,-4:48']
  === 1; повтор в тот же день → строка disabled «уже
  использовано сегодня»; g.actions.setDay(2) → строка доступна.
* B25. e2e ловушка (ТЗ-кейсы, два пре-сида, день 2 = Голден
  ЛОВУШКА — замерено): сценарий 1 — seedSave({ day:2,
  position:{x:2,y:-4}, hero: mkHero() }) (hp 25) → [E]/Digit1 →
  g.state.hero.hp === 23 (HP −2, ТЗ «ловушка: HP −2 (кейс)»);
  сценарий 2 — seedSave({ day:2, position:{x:2,y:-4},
  hero: mkHero({ hp: 2 }) }) (свежий boot) → [E]/Digit1 →
  g.state.hero.hp === 1 (clamp ≥ 1, НЕ смерть — герой жив, игра
  идёт). Оба: flash «Осмотр развалин: ловушка! −2 HP.»,
  readSave(h).data.hero.hp соответствует, buildingOncePerDay
  ['2,-4:48'] === 2. (restore-clamp main.js ~L442 сохраняет hp=2
  при загрузке сейва — проверено tests/save-restore.test.js.)
* S1. tests/assets-schemas.test.js: явный тест «каталог 000048:
  запись проходит schema.json + новые поля на месте» — reuse
  существующего общего цикла валидации (схема открыта для
  особых_параметров — ПРАВОК СХЕМЫ НЕТ) + assert раз_в_день/
  эффект. Общий цикл — регрессия БЕЗ правок (ТЗ «запись 48
  проходит схему» закрыто ОБИМИ).

Голден (измерено на детерминированном тест-мире, CHAIN, map.png
onerror → generateSeedPixels, сид 20260926; фиксировать при
первом зелёном build — паттерн 000074):
* ближайшая развалина от spawn (0,0) — тайл (2,-4), 6 шагов
  (BFS 4 направления, passable, без mob-групп/городов; НЕ пропуск
  слота 9). Тайл: passable, inBuilding, building 9, buildingId 48,
  isEntrance: true (map-флаг слота 9) НО buildingId 48 → вход в
  подземелье НЕ открывается (гард 000073 — регрессия city-screen
  e2e + locations.js:171).
* '2,-4', день 1: roll 0.363997696666047 → лут, itemId 'meat'
  (hash2(2,-4,RUINS_LOOT_SEED^1) % 16 = 4).
* '2,-4', день 2: roll 0.48308982164599 → ловушка.
* '2,-4', день 5: roll 0.7590089330915362 → запись, fragIdx 7.
* Н=10000 (сетка A57): 4004/2951/3045 (в ±200).

## Ленивые ссылки и guards

* Загрузка building-effects.js: ноль чтения Game/DOM/require (как
  сейчас; B1 errors===0). applyRuins — lazyGame() в момент ВЫЗОВА:
  G.hash2 + G.skillLevel обязательны (иначе «недоступно»);
  G.getItem — опционален (fallback message).
* Загрузка building-effect-48.js: ноль require/DOM; чтение Game —
  ТОЛЬКО register в момент своей загрузки (снапшот G0, прецедент
  ui-tab-*.js 000130); порядок тегов (ПОСЛЕ building-actions.js,
  ДО main.js) — pin index-order + A61 + B1.
* Хендлер: все Game-функции — через ctx.world.game (снапшот
  main.js, 000128 §2.5; world.game — допущенный escape-hatch)
  в момент ВЫЗОВА; hero — живая ссылка (мутирует hp); r — по
  ссылке (мутирует message при loot-отказе); map/save — read-only.
* register(G): нет buildingActions/registerSpecial → console.error
  + без регистрации (000053, игра не падает). registerSpecial
  сам — с гардами id/fn (building-actions.js:63-77) — работаем с
  id '48' (строка, без ':'/','/пробелов — конвенция 000072).
* 000073-гарды (locations.js:171, hud.js:91, moonDreamHint
  building-effects.js:723) — НЕ ТРОГАТЬ: регрессия «развалины ≠
  вход в подземелье» (e2e tests/city-screen.test.js, golden
  tests/map.test.js '-252,87').

## Что важно будущим задачам (000091/000092/000093/000095/000077)

* **Слот спец-модулей в index.html установлен ЭТОЙ задачей**:
  первый тег building-effect-48.js сразу после building-actions.js
  (до hud.js). Чужие спец-модули (000091–95: 44/45/46/47/49;
  000077: 39/43) — СРАЗУ ПОСЛЕ предыдущего спец-модуля, до main.js
  (000128 §5); при мерже «кто первый» — свой тег после чужих, пин —
  свой. ИМЯ ФАЙЛА по контракту 000128: src/building-effect-
  <effectId>.js.
* **Шаблон спец-модуля**: src/building-effect-48.js — ОБРАЗЕЦ
  (UMD + register(G) + node-экспорт { handle, register } для
  A-тестов + console.error-деградация). 000092 (исцеление/монета/
  предмет) и 000095 (костёр) — по этому образцу; heal — ctx.hero +
  G.derived clamp (000128 §5).
* **A1-пин union**: ['36','37','38','40','41','42','48'] — каждая
  задача расширяет при своём мерже (конфликт 1 строка, правило
  «кто смержился первым» — memory/000074/000076).
* **Лут-паттерн для 000092 (предмет на дне колодца)**: чистый apply
  возвращает itemId + name-строку (опциональный G.getItem), сторона
  — G.addItem(hero, itemId, 1) в спец-хендлере, отказ addItem →
  r.message + { ok:true } (R6) — переиспользовать, не изобретать.
* **000073-гарды** (locations.js:171, hud.js:91, moonDreamHint
  48-skip) — регрессия для ВСЕХ 000091–95 (развалины — подтип
  слота 9; у новых подтипов слота 9 — свои buildingId ≠ 48).
* r.*-ханки ОБЩЕГО пайплайна (r.teleport/r.buffs/r.xp/r.quest) —
  НЕ трогать; спец-хендлер 000094 использует только СВОИ поля
  r.content/r.itemId/r.damage (общих полей r.* НЕТ).
* Нумерация тестов: A54 — последняя в master; A55+ — свои; после
  rebase на мерже чужих A/B-номера — реденумерация (не семантика,
  прецедент 000076).

## Подводные камни

1. **UMD-ловушка 000038**: тег ПОСЛЕ main.js → саморегистрация
   уйдёт в НОВЫЙ объект Game, снапшот main.js не увидит specials →
   лут/ловушка молча не сработают (message будет, мир — нет).
   Защита: index-order-пин + B1 errors===0 + A61.
2. **main.js НЕ ПРАВИТЬ** (критерий 000128 BA7: main.js без
   onBuildingAction): «wiring» ТЗ = спец-модуль + автоматика
   роутера (марка/saveNow/flash). При соблазне «вот один ханк в
   onBuildingAction» — НЕТ: контракт §2.3 + параллельные 000091–95
   правят бы ту же функцию (конфликты).
3. **Провал записи / loot-отказ = ok:true** (R3/R6): ок-ветка
   роутера ставит daily-марку + saveNow ТОЛЬКО при ok. ok:false
   означало бы «повтор в тот же день» — против ТЗ («повтор — новый
   день, новый ролл»).
4. **Чистота apply**: урон/лут в apply = нарушение 000071/A12
   (снимок мутируется — сейв/тесты ловят). apply — только ВОЗВРАТ.
5. **buildings.js — ТОЛЬКО sync:buildings** (byte-тесты
   tests/buildings.test.js + дрейф-гейт tests/sync-all.test.js;
   руками — NEVER; при конфликте генблока на ребейзе —
   перегенерировать).
6. **Чужие hunk'и**: параллельные 000091/92/93/95 правят
   building-effects.js (СВОИ EFFECTS/функции/экспорты/сиды),
   index.html (СВОИ теги), A1-пин, tests/index-order (СВОИ пины) —
   ханки вставочные и компактные: свои сиды — после своих
   констант, запись EFFECTS — после EFFECTS['42'], функции — после
   applyObelisk, тег — после building-actions.js. Полный npm test
   ПОСЛЕ перебазирования на актуальный master.
7. **findBuilding (BFS) СКИБАЕТ слот 9** (CAVE_ENTRANCE-пропуск
   000073) — развалины НЕ найдёт: новый хелпер findRuins (без
   пропуска слота 9, цель buildingId === 48) — golden-пин
   достижимости (6 шагов до (2,-4)); ХОД не используется
   (pre-seed — паттерн B21/B14: ХОД 6 шагов безопасен по дням
   (steps_per_day 40), но pre-seed — установленный паттерн
   golden-сценариев).
8. **isEntrance: true у развалин** (map-флаг слота 9): НЕ повод
   «чинить» — вход в подземелье исключён Гардом 000073
   (maybeEnterDungeon buildingId===48 → null; e2e city-screen).
   Тесты НЕ должны начинать проверять isEntrance.
9. **Голден-значения** (tile (2,-4), дни 1/2/5, roll-значения,
   'meat', fragIdx 7) — измерены на HEAD cab0d27; при ребейзе,
   меняющем карту (mapseed/map.js НЕ в файлах задачи — менять
   НЕ могут), регенерировать только при фактическом сдвиге.
10. **Каталог-значения** (доли 40/30/30, урон 2, порог 5, 16
    предметов, 8 текстов) — решения дизайна, НЕ зафиксированы ТЗ;
    зафиксированы memory/000094-ruins.md — при конфликте мержа
    брать значения этого каталога (у каждой задачи — свой каталог).
11. **save-формат НЕ меняется** (buildingOncePerDay уже существует
    — 000072; v1 совместим).
12. **main.js не меняется** → статические пины (map.test.js
    828/1346, day.test.js:412, cities.test.js:1420) — риск нулевой.
13. **npm test — ВНУТРИ worktree** (memory/test-runner-
    worktrees.md: node --test сканирует .worktrees/ рекурсивно).

## Коммиты (ветка task/000094; последняя строка — Co-Authored-By)

1. «Задача 000094: красные тесты + память — осмотр развалин: ролл
   40/30/30 по (tile, day), порог Интеллекта, ловушка (урон 2,
   clamp HP ≥ 1), раз-в-день» (A55–A61 + S1 + пере-пин A1 +
   findRuins + index-order-пин + memory/000094-ruins*.md).
2. «Задача 000094: каталог id 48 — раз_в_день + эффект (доли,
   предметы, тексты, порог_интеллект, урон_ловушки) + зеркало
   buildings.js» (JSON + `npm run sync:buildings`).
3. «Задача 000094: building-effects.js — запись «48», чистые
   rollRuinsContent/ruinsLoot/readNote, applyRuins, сиды RUINS_*».
4. «Задача 000094: спец-модуль building-effect-48.js — лут
   (addItem) и ловушка (clamp HP ≥ 1); index.html — тег, пин
   порядка».
5. «Задача 000094: правки по итогам ревью» (при наличии).
6. «Задача 000094: CHANGELOG — развалины: осмотр (лут, ловушка,
   записи)» (стадия мержа; дата = день мержа).
7. «Задача 000094: отчёт, память, перенос задачи в done»
   (tasks/pending → tasks/done + tasks/result/000094.md).

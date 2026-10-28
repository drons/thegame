# 000244 — SPEC-синхронизация внебоевых механик волн .07–.12 + docs-долг — КОНТРАКТ (проектирование)

Статус: ВЫПОЛНЕНО (Finalize 2026-10-28; итог — §12). Коммиты ветки
task/000244: 03953a1 (красные тесты + этот файл), a131722 (5
spec-файлов + ре-пины + tasks-переезд pending→done), 61fbe72 (правки
по итогам ревью, §11), Finalize (отчёт + этот файл, §12). База —
6ac25db; на момент Finalize master = 7a974cf (+9a9f6d7/000243
tests-only, +7a974cf/000284 spec/items.md + tests) — перебазировка на
стадии мержа. Все координаты/факты ниже — ПРОВЕРЕНЫ ЧТЕНИЕМ
КОДА/КАТАЛОГОВ/СПЕЦ-ФАЙЛОВ НА HEAD (не по ТЗ волн, не по
ретро-координатам 3e76a12/ff7d0c1). Анализы: /tmp/thegame-wf-000244/
a1-domain.md, a3-tests.md (a2-arch — в ТЗ-сводке). ТЗ:
tasks/done/000244.md.

=====================================================================
§1. СТАТУС / ДОКУМЕНТ-СКЛЕЙКА
=====================================================================

* DOCS-ONLY: НОЛЬ изменений src/, assets/, index.html, CHANGELOG.md
  (чистый рефакторинг документации: не игровой процесс, не графика,
  не управление — CHANGELOG не нужен по ТЗ «Ограничения»). Allow-list
  файлов: spec/*.md (5), tests/spec-*.test.js (2), memory/, tasks/
  (pending→done + result). Финальная проверка — git diff --stat
  до коммита.
* ZERO BEHAVIOR: ноль новых вызовов RNG, сейвы те же поля/формы
  (outOfCombatEffects/portal_marker не трогаются), HUD/панель —
  побайтово — гарантировано allow-list'ом (src/ не в diff'е).
* Протоколы: 000218/D11 (wording-пины В ТОМ ЖЕ коммите; пины — только
  positive-фразы нового текста; self-scan needle'ов ОБЯЗАТЕЛЕН —
  «зелёные с рождения» не пины; нормализация белых ОБЯЗАТЕЛЬНА;
  unicode-канон «·» U+00B7, «−» U+2212, «–» U+2013) + 000159 §5.1
  (SPEC_FILE_LINES — пересчёт ОТ ФАКТА ТЕМ ЖЕ счётчиком specLines
  (split('\n') + pop хвостового ''), НЕ wc -l, В ТОМ ЖЕ коммите,
  зелёная стадия).
* ТЗ УСТАРЕЛО относительно HEAD (сверка a1 §4, подтверждена этой
  стадией): .09-зоны (shroud_of_night/dark_presence) и .12 (Природа)
  УЖЕ в SPEC; причина «замерзание» УЖЕ в списке (spells.md L234-235,
  не :172 как в ТЗ); 000239 (flame_step-фикс) и 000268 (miracle →
  spec/companions.md «Воскрешение») УЖЕ в master; волна .11 внебоевых
  заклинаний НЕ ИМЕЕТ (каталог: 21 OOC spell, ни одного в диапазоне
  .11) — по .11 писать нечего.
* Коммиты: 2 стадии в worktree (красная: пин-тест + memory; зелёная:
  5 spec-файлов + re-pin spec-split + tasks-переезд) → на мерже
  SQUASH в ОДИН коммит «Задача 000244: …» + Co-Authored-By
  (отдельный абзац). Перед мержем — rebase на свежий master
  (§10). .merge-pending — только стадия мержа.

=====================================================================
§2. GAP-КАРТА (факт на HEAD 6ac25db)
=====================================================================

Каталог (src/spells-data.js, вычислено node): ровно 21 spell с
`вне_боя: true` (mp/days/radius — факт каталога):
  firelight {4/1/5}; hearthfire {5/1/5}; flame_step {7/—/—, телепорт};
  frost_walk {7/1/—}; cold_breath {5/1/5}; frozen_stillness {15/1/5};
  shadow_step {5/—/—, телепорт}; invisibility {7/1/—};
  shroud_of_night {15/3/5}; dark_presence {5/1/5}; prayer {4/1/—};
  divine_protection {7/1/—}; holy_light {7/1/5}; miracle {20/—/—,
  воскрешение}; stone_anchor {7/—/—}; recall {7/—/—}; gate
  {12/—/—}; warding_circle {10/1/5}; wild_growth {4/1/—};
  beast_friend {7/3/3}; path_of_vines {15/1/—}.

В «Каст вне боя» (spec/spells.md, H2 L150, секция L150-253, 317 строк
в файле) ЗАДОКУМЕНТИРОВАНО 9: invisibility (.03); gate/stone_anchor/
recall/warding_circle (.04; контент каталога — волна .11);
shroud_of_night/dark_presence (.09, блок «Зональные эффекты волны
Тень» L212-231); wild_growth/beast_friend/path_of_vines (.12, блок
L240-252).

НЕ ЗАДОКУМЕНТИРОВАНО (красное; grep id по spec/spells.md = 0/0/0):
* .07 Огонь: flame_step, firelight, hearthfire — 3.
* .08 Лёд: frost_walk, cold_breath (собственного буллета НЕТ — только
  кросс-ссылка в буллете dark_presence L230-231), frozen_stillness — 3.
* .09 Тень: shadow_step — 1 (зональная пара .09 — уже есть).
* .10 Исцеление: prayer (только кросс-ссылка L244 «OR с camp/prayer»),
  divine_protection, holy_light, miracle — 4.
* 5-я причина подавления «свет обители» (holy_light) — отсутствует в
  списке zoneSuppressedReason-буллета (L234-235 — 4 причины; в коде —
  5). ТЗ (написано до .10-мержей) её не знало — описываем ФИНАЛЬНОЕ.
* spec/world-map.md: hero-level проходимость (heroPassable +
  frost_walk, WATER/DEEP_WATER) — отсутствует (есть только статичный
  TERRAIN_DATA-буллет L10-19).
* spec/game-time.md (20 строк): onDay-инвариант (heroPassable-тайл в
  конце смены дня + relocateToNearestPassable) — отсутствует.
* spec/mobs.md (118 строк, H2 «Состав групп» L97, зона-буллет
  L107-115): модификация радиуса триггера внебоевым эффектом —
  отсутствует.
* spec/craft.md:10: ряд «Зачарование» ячейка «Постройки» = «Башня
  мага, Обелиск» — СТАЛЕ. Факт на HEAD (вычислено по assets/craft,
  126 рецептов тип=зачарование; 4 рецепта со 2 постройками
  (000007/000029: 000018+000025; 000008/000030: 000018+000012)):
  union = {000012 Охотничья усадьба, 000018 Башня мага, 000025 Дом
  кузнеца}; Обелиск (000042) — НЕ входит (он в union рунописи — ряд
  L11 «Рунический камень, Библиотека, Обелиск» НЕ ТРОГАЕТСЯ).
  Совпадает со значением из ТЗ на ff7d0c1.

=====================================================================
§3. КАРТА ИЗМЕНЕНИЙ ПО 5 spec-ФАЙЛАМ (точки вставки; дельты —
     пересчёт ТЕМ ЖЕ счётчиком specLines на GREEN; здесь — оценки)
=====================================================================

NOVЫХ H2/H3 НЕ СОЗДАЁТСЯ (иначе SPEC_SECTIONS nH2=66/nH3=41
краснеют); все вставки — буллеты/вложенные буллеты/продолжения
буллетов внутри существующих H2. Корневой SPEC.md (TOC, 31 строка) —
НЕ ТРОГАЕТСЯ (правки spec/*.md его не затрагивают — ТЗ «Ограничения»
«проверить пин» = no-op по факту, зафиксировать в отчёте).

3.1 spec/spells.md (317) — 2 правки:
  A) LINE-NEUTRAL L235: 5-я причина. Строка
     `  «круг защиты», «замерзание», «покров ночи») →` →
     `  «круг защиты», «замерзание», «покров ночи», «свет обители») →`
     (+6 символов, Δ0 строк). Порядок = порядок проверки в коде
     (§4, zoneSuppressedReason).
  B) ЧЕТЫРЕ волновых буллет-блока — вставка ПЕРЕД «* Волна Природа
     (000235.12; …)» (L240), волновой порядок .07 → .08 → .09
     (shadow_step) → .10, формат 1:1 с блоком .12 (`* Волна …:` +
     вложенные `  * id («Имя», {параметры каталога}, мп N): …`).
     Блок .09 НЕ дублирует зональную пару — только shadow_step с
     кросс-ссылкой на существующий блок «Зональные эффекты волны
     Тень» (решение §8.4).
     * .07: flame_step (resolveTeleportStep ≤10, 3 reason-строки
       дословно, лучи мира/подземелья, post-landing 000239:
       dungeonPostMove/addStep/combat+chest/saveNow — подземелье;
       addStep/maybeStartCombat/enterLocation/saveNow — мир; мана
       после cb; луч НЕ учитывает frost_walk — pre-existing
       memory/000239; skeleton-контракт tests/spells.test.js
       W-04/W-10a 000235.07); firelight (vision-floor,
       parameters.radius БЕЗ ДЕФОЛТА, VISION_BASE_RADIUS=5 → no-op
       на базовой видимости, tasks/pending/000235.07.01.md);
       hearthfire (restoreDay ×1.1, OR camp/prayer/wild_growth
       без стекания, граница expiresDay >= day; radius каталога —
       no-op, §8.1).
     * .08: frost_walk (heroPassable WATER/DEEP_WATER, TERRAIN_DATA
       статична, сейв-гард «остаюсь на спавне», кросс-ссылка на
       game-time.md); cold_breath (собственный буллет: 5-й аргумент
       findZoneCombat, eff = Math.max(1, info.radius − 1),
       non-trigger/dist-0 не трогает, legacy бит-в-бит,
       coldBreathRadius, стек cb = max(…, darkPresenceRadius) — −1,
       не −2, HUD-окружность тем же eff); frozen_stillness
       (зональное ПОДАВЛЕНИЕ, «замерзание» — 3-я в порядке проверки,
       frozenStillnessRadius, ТАЙЛ-БОЙ сохраняется).
     * .09: shadow_step («третий внебоевой»: тот же
       resolveTeleportStep; луч мира ТОЛЬКО t.passable — БЕЗ
       building/entrance/mob-group исключений; ПОСТ-ЛЕНДИНГА НЕТ —
       teleпорт бесплатен по игровому времени, pre-existing, 000239
       D1 — shadow явно НЕ синхронизирован по ТЗ 000239; кросс-
       ссылка на «Зональные эффекты волны Тень»).
     * .10: prayer (та же ветка onDay ×1.1, >= day);
       divine_protection (currentBuffMods: incomingMult 0.85, все
       3 точки создания боя); holy_light (5-я причина «свет
       обители» + vision-floor max с firelight); miracle
       (cross-ref spec/companions.md «Воскрешение» 000268 — НЕ
       дублировать; отказы дословно: «нет погибших»/«отряд полон»/
       «недоступно»; flash «Чудо: партия вернулась.», §8.2).
     Оценка ΔB ≈ +110..120 строк (317 → ~430).
3.2 spec/world-map.md (105) — 1 правка: НОВЫЙ буллет ПОСЛЕ
  TERRAIN_DATA-буллета (L10-19), ПЕРЕД «* Процедурно генерируемый
  лабиринт…» (L21). Файл без H2 (только H1) — пин читает весь файл.
  Текст: hero-level проходимость (frost_walk, 000235.08): статичное
  passable НЕ меняется — heroPassable(t, day) (src/main.js):
  t.passable ИЛИ (frost_walk активен, expiresDay > day, И
  t.terrain ∈ {WATER, DEEP_WATER}); через heroPassable — tryMove и
  позиция-сейв (не heroPassable → console.warn «Сейв: позиция
  непроходима — остаюсь на спавне.», герой на спавне); деградация
  без G.Spells — passable-only; подземелья не затрагивает; при
  смене дня — spec/game-time.md «При смене дня»; TERRAIN_DATA и
  потребители (passableTiles/denseTiles, TILE_BASE, TILE_COLORS) —
  статичны. Оценка ΔW ≈ +9.
3.3 spec/game-time.md (20) — 1 правка: новый буллет в КОНЦЕ списка
  «При смене дня» (после L19), формат `   * …` (3 пробела). Текст:
  Инвариант конца дня (frost_walk, 000235.08): ПОСЛЕ истечения
  внебоевых эффектов, если герой на тайле, где heroPassable(t, новый
  день) = false, — перенос на ближайший проходимый тайл БЕЗ группы:
  relocateToNearestPassable (спираль по Чебышёву r = 1..200,
  статичный t.passable && !t.hasMobGroup, moveHero; фолбэк
  findSpawn) + flash-строка «Позиция непроходима — перенос на
  ближайший проходимый тайл.» (1-я строка, D1-порядок строк flash:
  relocated → «Мобилизуются…» → отряд → «День N.»). Это ПЕРЕНОС, не
  телепорт-спавн (main.js:1683-1686, 1723-1725, 1766-1782). Оценка
  ΔG ≈ +7.
3.4 spec/mobs.md (118) — 1 правка: ДОПИСАННЫЙ абзац в конец зона-
  буллета (после L115 «…но триггерят бой.»), отступ 3 пробела (та же
  линия-продолжение буллета, не новый маркер). Текст: внебойные
  эффекты сужают радиус триггера (000235.08 cold_breath, 000235.09
  dark_presence): 5-й аргумент findZoneCombat (aggroReduceRadius) —
  для триггерящей группы, чей тайл в Чебышёве ≤ радиуса эффекта от
  героя: eff = Math.max(1, info.radius − 1); два источника — max,
  не сумма (−1, не −2); dist 0 (свой тайл) и non-trigger-группы не
  трогаются; вызов без 5-го аргумента — бит-в-бит; HUD-окружность —
  тем же eff (UI не врёт про радиус триггера); механика —
  spec/spells.md «Каст вне боя». Оценка ΔM ≈ +7.
3.5 spec/craft.md (149) — 1 правка, LINE-NEUTRAL L10: ряд
  «Зачарование» ячейка «Башня мага, Обелиск» → «Охотничья усадьба,
  Башня мага, Дом кузнеца» (Δ0 строк). Решение — явный union, не
  «union по каталогу» (§8.3).
3.6 tests/spec-split.test.js — РЕ-ПИН SPEC_FILE_LINES В ТОМ ЖЕ
  коммите (зелёная стадия): spells.md 317→317+ΔB, world-map.md
  105→105+ΔW, game-time.md 20→20+ΔG, mobs.md 118→118+ΔM — значения
  ПО ФАКТУ после вставок; craft.md 149 — Δ0, re-pin НЕ нужен
  (пересчитать и подтвердить). SPEC_SECTIONS (nH2=66/nH3=41),
  SPEC_ROOT_LINES=31, R1 (23 файла), R5 (MOBS.md=199) — НЕ
  меняются (новых H2/H3/файлов нет; MOBS.md — legacy-файл, не
  трогается).
3.7 tests/spec-000244-wording.test.js — НОВЫЙ файл, 13 тестов
  T1–T13 (§5).
3.8 memory/000244-ooc-spec-sync.md — этот файл (красная стадия).
3.9 tasks: pending/000244.md → done/000244.md + tasks/result/
  000244.md (зелёная стадия, ОБЯЗАТЕЛЬНО по tasks/CLAUDE.md).

=====================================================================
§4. КОДЫ-АНКОРЫ (ВСЕ ПРОВЕРЕНЫ НА HEAD 6ac25db)
=====================================================================

src/spells.js:
  DURATION_ACTIONS:335 = {'невидимость','внебой'} (телепорт/
  воскрешение — дней НЕТ → записей НЕТ); outOfCombatDays:946;
  castOutOfCombat:967 — проверки по порядку: каталог → книга → мана
  → вне_боя → days; flame_step/shadow_step early-exit 987-1003
  (ctx !== undefined → cb по cbKey 'flameStep'/'shadowStep';
  cb отсутствует → «телепорт недоступен здесь»; r.ok === false →
  reason cb, мана НЕ списана (castFail-откат); ctx === undefined →
  skeleton: ok, мана списана, телепорта НЕТ); miracle early-exit
  1004-1019 (ctx.miracle; отказ cb → «воскрешение недоступно здесь»);
  общий хвост: мутац ПОСЛЕ всех проверок, мана списана, запись
  in-place/пUSH; switch по spellId (1036-1058) — для всех
  не-телепорт NO-OP (эффект — от состояния при потреблении);
  castFail:1061 (self-rollback); radius-helper'ы — НЕЗАВИСИМЫЕ
  КОПИИ (общего helper нет): wardRadius:1209, coldBreathRadius:1251,
  frozenStillnessRadius:1274, shroudOfNightRadius:1297,
  darkPresenceRadius:1320, holyLightRadius:1492 — все: max
  параметров.radius по АКТИВНЫМ записям (expiresDay > day), целое
  1..5, невалидное/отсутствующее → ДЕФОЛТ 5, нет активных → 0;
  isHeroLit:1400 (> day), isHeroFrostWalk:1233 (> day),
  isHeroCamped:1413 / isHeroPrayer:1426 / isHeroWildGrowth:1439 /
  isHeroBeastFriend:~1452 / isHeroPathOfVines:~1465 — ГРАНИЦА
  >= day («утро эффекта» живёт), isHeroDivineProtected:1478 (> day).
src/main.js:
  onDay:1649 — restoreDay ×1.1 (1652-1657: isHeroCamped ||
  isHeroPrayer || isHeroWildGrowth ? 1.1 : 1 — OR БЕЗ стекания;
  считается ДО expireOutOfCombatEffects 1671-1674 → «утро эффекта»)
  → relocate-гард 1683-1686 (!heroPassable → relocateToNearestPassable)
  → payWages → render → flash 1722-1725 (D1-порядок: relocated →
  «Мобилизуются…» → compLines → «День N.») → saveNow;
  relocateToNearestPassable:1766 — спираль r = 1..200 (статичный
  t.passable && !t.hasMobGroup), moveHero (телепорт-снап 000033);
  фолбэк findSpawn (его throw — в onDay-вочдог);
  currentBuffMods:706 — при isHeroDivineProtected → Object.assign
  ({}, m, {incomingMult: 0.85}); точки создания боя — ОДНА (мир/
  подземелье/отладочный: 1888/2631/3242);
  save-позиция-гард:1551-1555 (!heroPassable → console.warn «Сейв:
  позиция непроходима — остаюсь на спавне.»);
  heroPassable:2385 — t.passable → true; иначе isHeroFrostWalk &&
  terrain ∈ {T.WATER, T.DEEP_WATER}; tryMove:2396 (через
  heroPassable);
  zoneSuppressedReason:2440 — 5 веток В ПОРЯДКЕ: «невидимость»
  (2441, без zone) → «круг защиты» (2450) → «замерзание» (2462) →
  «покров ночи» (2472) → «свет обители» (2480-2487); все zone-
  ветки: r = helper(hero, day) > 0 && Чебышёв(зона, герой) ≤ r;
  zoneCombatInfo:2497 — cb = Math.max(coldBreathRadius,
  darkPresenceRadius) → 5-й аргумент findZoneCombat;
  dungeonCellPassableAt:2019 (только CELL_FLOOR, за краем false),
  tileLandingPassable:2027 (passable && (!inBuilding ||
  allowEntrance && isEntrance) && !(hasMobGroup && !defeatedAt)),
  shadowStepPassable:2034 (мир — ТОЛЬКО t.passable; подземелье —
  dungeonCellPassableAt), flameStepPassable:2042 (мир —
  tileLandingPassable(…, true); подземелье — dungeonCellPassableAt);
  performMiracle:2048 — deadMercs; отказы ДОСЛОВНО: «нет погибших»
  (нет dead), «отряд полон» (roster.length + dead.length >
  max_companions, дефолт 3), «недоступно» (G.companions /
  reviveEntryFromRecord нет ИЛИ entries.some(!e) — pre-validation
  ВСЕХ ДО применения); успех: splice/push, saveNow, flash «Чудо:
  партия вернулась.», playerRender;
  resolveTeleportStep:2077 — город (dungeonState.kind === 'city') →
  «в городе телепорт недоступен» (2078-2080); направление —
  |dx|+|dy| === 1 из (dungeonState.prevX/prevY | prevPos), иначе
  «нет направления движения» (2089-2091); луч k = 1..10 до
  непроходимого, landing = макс k; landing 0 → «некуда шагнуть»
  (2098-2100);
  performShadowStep:2118 — resolve + applyTeleportPlacement; ПОСТ-
  ЛЕНДИНГА НЕТ (ни addStep, ни зональный скан, ни enterLocation,
  ни saveNow, ни dungeonPostMove);
  performFlameStep:2124 — resolve + placement + ПОСТ-ЛЕНДИНГ
  (000239): подземелье — G.locations.dungeonPostMove(ds) (typeof-
  гард: отсутствует → console.error ОДИН раз + пропуск —
  деградация, не крах) → clock.addStep(1) → ev.combat →
  startDungeonCombat / ev.chest → applyDungeonChest → saveNow;
  мир — clock.addStep(1) → if (!maybeStartCombat(true, now))
  enterLocation() → saveNow;
  ctx-проводка:2163-2165 (flameStep/shadowStep/miracle);
  visionRadiusFloor:2901 — floorR = 0; isHeroLit → sp.параметры.
  radius: typeof number && r ≥ 1 → floorR = r (ДЕФОЛТА НЕТ —
  невалидное/отсутствующее → 0; НЕ integer-check, НЕ 1..5→5 — в
  отличие от radius-helper'ов) → floorR = max(floorR,
  holyLightRadius);
  HUD-агро-окружность pass:3843-3877 — cbR = max(coldBreathRadius,
  darkPresenceRadius); для триггерящей группы в Чебышёве ≤ cbR:
  r = Math.max(1, info.radius − 1) (локальная переменная, info НЕ
  мутируется).
src/combat.js:
  groupZoneInfo:525 — aggro ПЕРВОГО МОБА: агрессивный/
  территориальный → {radius: 2, triggers: true}, иначе {radius: 1,
  triggers: false};
  findZoneCombat:552 — 1) dist-0 (свой тайл, !defeatedAt) —
  приоритет; 2) триггерящие dist > 0: eff = (typeof
  aggroReduceRadius === 'number' && aggroReduceRadius > 0 && dist ≤
  aggroReduceRadius) ? Math.max(1, info.radius − 1) : info.radius
  (undefined/0 → бит-в-бит legacy); dist > eff → continue; tie —
  (x, y) лексико.
src/dungeon-ui.js:
  VISION_BASE_RADIUS:160 (=5; radiusFor(mult) = ceil(5·mult − 1e-9)
  ≥ 5 при mult ≥ 1); vision floor/bonus:655-676 — floorR (функция,
  typeof-гарды, throw → 0, !isFinite/<0 → 0, Math.floor), bonusR;
  maskFor(…, Math.max(radiusFor(mult), floorR) + Math.floor(bonusR));
  волк (beast_friend) — спрайт 1215.
src/map.js: TERRAIN:211-212 (DEEP_WATER: 0, WATER: 1);
  TERRAIN_DATA:240 — DEEP_WATER 240-243 / WATER 244-247 — passable:
  false (статично; consumers — buildings.js passableTiles/denseTiles,
  sprites.js TILE_BASE, main.js TILE_COLORS — без копий).
src/locations.js: dungeonPostMove:429.

=====================================================================
§5. ПИН-ПЛАН (tests/spec-000244-wording.test.js; expectedRedCount = 13)
=====================================================================

Формат: node, readFileSync каждого правимого файла ОТДЕЛЬНО (ОДИН
раз); хелперы esc/h2/norm — 1:1 из tests/spec-000235.04.01-wording.
test.js (h2 = срез «## <имя>» до следующего '\n## '; norm =
\s+ → ' — ОБЯЗАТЕЛЬНА, SPEC переносит строки ~64-70 кол.). Срезы:
OC = h2(spells.md, «Каст вне боя»); WM = весь world-map.md (без H2);
GT = весь game-time.md (без H2); MG = h2(mobs.md, «Состав групп»);
CR = h2(craft.md, «Виды крафта»). Краснота ОСМЫСЛЕННАЯ: все 5
файлов существуют, падения — ERR_ASSERTION «фраза не найдена» /
T13 — «старая фраза на месте» (neg-пин).

ВСЕ needle'ы НИЖЕ СВЕРЯНЫ С ТЕКУЩИМИ СРЕЗАМИ (self-scan, эта стадия)
— ОТСУТСТВУЮТ (иначе «зелёные с рождения» = не пины, протокол
000218). Столкновения, ИСКЛЮЧЁННЫЕ из needle'ов (УЖЕ в срезах):
OC — 'prayer' (L244 «OR с camp/prayer»), '×1.1'/'restoreDay' (L244
wild_growth), 'cold_breath'/'coldBreathRadius'/'aggroReduceRadius'
(L230-231 dark_presence), 'dist 0'/'non-trigger'/'НЕ −2'/'eff = max'
(.09-блок), '«замерзание»' (L234), 'Чебышёв(зона'/'≤ радиус'
(.04/.09), 'no-op' (L252 path_of_vines), '{days: 1, radius: 5}'
(L219 shroud), '{days: 1}' ×2/.12, 'три внебоевых'/.12, 'четыре
внебоевых'/.04, 'TERRAIN_DATA' — НЕТ в OC (пин в T4 — в spells-
буллете frost_walk — допустим); WM — 'TERRAIN_DATA' (L10); MG —
'окружность' (L113), 'Чебышёв' (L109); CR — 'Обелиск' ×2 (L10+L11)
→ в T13 — ROW-SCOPED neg-пин.

* T1 spells OC — flame_step (000239-финал): needles 'flame_step',
  '≤ 10 клеток', 'направление последнего движения', «в городе
  телепорт недоступен», «нет направления движения», «некуда
  шагнуть», 'dungeonPostMove', 'saveNow', 'frost_walk' (луч не
  учитывает).
* T2 spells OC — firelight: 'firelight', 'visionRadiusFloor',
  'ДЕФОЛТА НЕТ', 'VISION_BASE_RADIUS', '000235.07.01'.
* T3 spells OC — hearthfire: 'hearthfire', 'isHeroCamped',
  'camp/prayer/wild_growth', 'expiresDay >= day'.
* T4 spells OC — frost_walk: 'frost_walk', 'heroPassable', 'WATER',
  'DEEP_WATER', 'TERRAIN_DATA', 'остаюсь на спавне'.
* T5 spells OC — cold_breath (собственный буллет): 'cold_breath («Дыхание
  мороза»' (в срезе — 'cold_breath' без имени), 'Math.max(1,
  info.radius' (в срезе — 'eff = max(1, radius−1)' — другая форма),
  'бит-в-бит'.
* T6 spells OC — frozen_stillness: 'frozen_stillness',
  'frozenStillnessRadius', '3-я в порядке проверки' (в срезе —
  «4-я в порядке проверки» shroud).
* T7 spells OC — shadow_step: 'shadow_step', 'третий внебоевой',
  't.passable', 'ПОСТ-ЛЕНДИНГА', 'бесплатен по игровому времени'.
  (Umbrella .09 «два внебоевых заклинания» L213 НЕ ПЕРЕПИНАЕТСЯ —
  §8.4.)
* T8 spells OC — Волна Исцеление .10: 'Волна Исцеление', «Молитва»,
  'divine_protection', 'currentBuffMods', 'incomingMult', '0.85',
  'holy_light', 'miracle', 'spec/companions.md', «Воскрешение»,
  «нет погибших», «отряд полон», «Чудо: партия вернулась.»
  ('prayer' — НЕ пин, §5-столкновения).
* T9 spells OC — 5-список причин (norm): 'порядок проверки:
  «невидимость», «круг защиты», «замерзание», «покров ночи», «свет
  обители»' (ломана переносом L234-235 — только через norm()).
* T10 world-map (весь файл): 'heroPassable', 'frost_walk', 'WATER',
  'DEEP_WATER'.
* T11 game-time (весь файл): 'Инвариант конца дня', 'heroPassable',
  'relocateToNearestPassable', 'r = 1..200', «Позиция непроходима —
  перенос на ближайший проходимый тайл.» (flash-строка дословно —
  byte-пин надувается в spellbook-oc-e2e :1230).
* T12 mobs MG: 'aggroReduceRadius', 'Math.max(1, info.radius − 1)'
  (U+2212, с пробелами — канон формулы из кода), '−1, не −2'
  (lowercase 'не' — в MG такого нет; в OC — «НЕ −2» — другой
  срез), 'бит-в-бит'.
* T13 craft CR: positive 'Охотничья усадьба, Башня мага, Дом
  кузнеца'; NEG-пин ROW-SCOPED: строка, начинающаяся '| Зачарование'
  (CR-срез), НЕ содержит 'Обелиск' (ряд L11 «Рунопись … Обелиск» —
  НЕ задевается: пин — по строке, не по срезу).

Существующие пины, КОТОРЫЕ НЕ ЛОМАЮТСЯ (проверено чтением тестов):
* spec-000235 S3: needle'ы — существующие строки (не редактируются);
  count-равенство корня «кулдаун» file-wide (сейчас 1 = 1): ОГРАНИЧЕНИЕ
  НА ЗЕЛЁНУЮ ПРАВДУ — в новый текст spells.md корень «кулдаун» в
  ЛЮБОЙ форме НЕ ВВОДИТЬ (иначе cdAll ≠ cdNo).
* spec-000235.04.01 P1–P5: loose-субстринги ('zoneSuppressedReason',
  'круг защиты', 'ТАЙЛ-БОЙ', 'НЕ подавляется кругом защиты') —
  line-neutral правка L235 все сохраняет; P4 'дефолт 5' — не трогается.
* spec-000230.17.01 W1–W3: цельные строки буллетов «Мана»/
  «КУЛДАУНОВ НЕТ»/gate — не редактируются; neg-пины OLD_TAIL/OLD_BR
  file-wide — новый текст их не вводит.
* spec-mobs-companions-efir (000184): субстринги зона-буллета —
  вставка ПОСЛЕ L115, существующие строки не редактируются.
* spec-resurrection (000268 W1) — spec/companions.md не трогается.
* spec-000273 W3 — таблица «Навыки крафта» (craft.md:82), не «Виды
  крафта».
* tests/spells.test.js W-04/W-10a/W-11a — source-пины src/ — не
  трогаются (src/ вне diff'а).
* SPEC-453-GONE (spec-split:302): скан 'SPEC 453' (из частей) по
  tests/+src/ — новый тест-файл литерала НЕ содержит.
* spec-combat-wording:151: /\(v1\)/g = 0 по ВСЕМ spec/*.md — новый
  spec-текст «(v1)» НЕ содержит.

=====================================================================
§6. SPEC_FILE_LINES ДЛЯ РЕ-ПИНА (зелёная стадия, тот же коммит)
=====================================================================

Счётчик — specLines из tests/spec-split.test.js (split('\n') + pop
хвостового ''; НЕ wc -l). Значения ПО ФАКТУ после вставок:
  spells.md: 317 → 317 + ΔB (ΔB ≈ 110..120 — пересчёт на GREEN);
  world-map.md: 105 → 105 + ΔW (≈ 9);
  game-time.md: 20 → 20 + ΔG (≈ 7);
  mobs.md: 118 → 118 + ΔM (≈ 7);
  craft.md: 149 → 149 (Δ0 — re-pin НЕ нужен; пересчитать/подтвердить).
НЕ ТРОГАЮТСЯ: SPEC_SECTIONS (nH2=66/nH3=41 — новых H2/H3 нет;
проверить grep '^##' до/после), SPEC_ROOT_LINES=31 (корневой
SPEC.md вне diff'а), R1 (23 файла в spec/ — новых нет), R5
(MOBS.md=199 — legacy-файл вне diff'а).

=====================================================================
§7. STAGING RED → GREEN → SQUASH
=====================================================================

1. КРАСНАЯ (commit #1 в task/000244): tests/spec-000244-wording.
   test.js + memory/000244-ooc-spec-sync.md. Верификация: cd
   .worktrees/task-000244 && npm test (= node --test) → 3432 базовых
   + 13 = 3445, ровно 13 «not ok» — ВСЕ в новом файле (ERR_ASSERTION
   «фраза не найдена» / T13 «старая фраза на месте»); остальные
   3432 — зелёные. Синтаксис файла чистый (загружается node --test).
   expectedRedCount = 13.
2. ЗЕЛЁНАЯ (commit #2): 5 spec-файлов + tests/spec-split.test.js
   (re-pin §6) + tasks (pending/000244.md → done/000244.md,
   tasks/result/000244.md). Верификация: npm test → 3445/3445;
   self-check: grep '^##' spec/*.md до/после (без новых H2/H3);
   git diff --stat — только allow-list; needle-ре-скан: все 13
   needle'ов в срезах, 0 «кулдаун» в spells.md, 0 «(v1)» в spec/.
   Флейк (если чужой тест упал случайно) — перепуск cd
   .worktrees/task-000244 && node --test tests/<файл> + запись в
   отчёт.
3. МЕРЖ (отдельная стадия, не эта): .merge-pending → rebase на
   свежий master (§10) → npm test повторно → SQUASH в ОДИН коммит
   «Задача 000244: …» + Co-Authored-By → ff-only → удалить
   .merge-pending. CHANGELOG.md — НЕ трогать.

=====================================================================
§8. ГРАНИЦЫ И РЕШЕНИЯ ОТКРЫТЫХ ВОПРОСОВ (каждое — с почему)
=====================================================================

8.1 hearthfire.parameters.radius — РЕШЕНИЕ: дописать в буллет
  {days: 1, radius: 5} (каталог дословно) + явная пометка «радиус —
  поле каталога, кодом НЕ потребляется (no-op; эффект — реген)».
  Почему: siblings (firelight/cold_breath/frozen_stillness/
  holy_light) пишут параметры каталога дословно; документирование
  dead-поля с объяснением — прецедент path_of_vines («эффект —
  no-op… реальное — tasks/pending/…», L251-252); без пометки будущий
  читатель/задача «почему у hearthfire radius?». НЕ расхождение
  ТЗ↔код (каталог — данные, механик радиуса нет) → отдельная задача
  НЕ создаётся.
8.2 miracle — РЕШЕНИЕ: в spells.md ТОЛЬКО cross-ref-буллет на
  spec/companions.md «Воскрешение» (H2, L116; собственость 000268,
  уже запинан spec-resurrection W1) + ссылочные факты (отказы
  дословно, flash, all-or-nothing-указание). Почему: дубль
  механики = второй источник правды; ТЗ «Ограничения» — описывать
  факт, а механика воскрешения — у 000268.
8.3 craft.md «Зачарование» — РЕШЕНИЕ: явный union «Охотничья
  усадьба, Башня мага, Дом кузнеца» (не «union по каталогу»).
  Почему: ВСЕ остальные ячейки таблицы перечисляют конкретные
  постройки; L13-15 уже делегирует «конкретные связи — рецептам … и
  проверяются тестом» (tests/craft.test.js); явный union даёт
  точный row-scoped neg-пин (Обелиск) вместо непинового
  прилагательного.
8.4 Umbrella .09 «два внебоевых заклинания» (spells.md L213) —
  РЕШЕНИЕ: НЕ переписывать (решение расхождения a1/a3: a3 T7
  «три внебоевых заклинания» ОТКЛОНЯЕТСЯ). Почему: субъект блока —
  «Зональные эффекты волны Тень», а зональных — ровно два
  (shroud_of_night/dark_presence); shadow_step — НЕ зональный;
  новый .09-буллет «третий внебоевой — shadow_step» + кросс-ссылка
  снимает неоднозначность без правки существующей строки (минимал).
  T7 пины — на shadow_step-буллете, не на umbrella.
8.5 +10% дневной реген (hearthfire/prayer/wild_growth) — РЕШЕНИЕ:
  только в spells.md (волновые буллеты + onDay-ветка). Почему:
  game-time.md документирует МЕХАНИКУ смены дня (базовая формула
  регена — уже в первом буллете «При смене дня»); ×1.1 — эффект
  спеллов (outOfCombatEffects), не механизм onDay; ТЗ п.4 просит
  только relocate-инвариант в game-time.md.
8.6 Typo ТЗ «Каст вне бой» (п.1) — РЕШЕНИЕ: канон — фактический H2
  «Каст вне боя» (pinned S3/P1–P5/W1–W3 через h2()-lookup; новый
  тест использует ТОЛЬКО «Каст вне боя»).
8.7 firelight — ГРАНИЦА-ФАКТ (документировать как есть): radius БЕЗ
  ДЕФОЛТА (typeof r === 'number' && r ≥ 1 → floorR, иначе 0; НЕ
  integer-check, НЕ 1..5→5 — отличие от radius-helper'ов); на
  базовой видимости (visionMult ≥ 1 → radiusFor ≥ 5 =
  VISION_BASE_RADIUS) floor 5 — no-op — tracked в
  tasks/pending/000235.07.01.md (ссылка в буллете, прецедент .12).
8.8 flame_step: луч НЕ учитывает frost_walk (вода — стена; луч —
  passable-функции, а не heroPassable) — pre-existing
  непоследовательность (memory/000239 §5/§8 «отдельная задача при
  необходимости» — НЕ создаётся) — зафиксировать в буллете как
  ФАКТ.
8.9 ГРАНИЦЫ-ФАКТЫ (документировать, не сглаживать): >= day
  (hearthfire/prayer/wild_growth/beast_friend/path_of_vines — «утро
  эффекта»: onDay restoreDay ДО expire) vs > day (всё остальное,
  включая divine_protection); shadow_step — t.passable only (мир) +
  ПОСТ-ЛЕНДИНГА НЕТ (бесплатное игровое время — pre-existing, 000239
  D1: «shadow_step — НЕ трогать и НЕ синхронизировать» по ТЗ 000239;
  провал НЕ зафиксирован, pending-задачи НЕТ); flame_step —
  allowEntrance=true, лендинг на тайл НЕПобеждённой группы в
  ПОДЗЕМЕЛЬЕ разрешён (бой/сундук — ПОСЛЕ лендинга, dungeonPostMove),
  в МИРЕ луч останавливается на живой группе (tileLandingPassable);
  mана списывается ПОСЛЕ успешного cb (отказ cb → reason cb, откат);
  skeleton (ctx === undefined) — ok + мана списана, телепорта нет
  (W-04/W-10a 000235.07; W-10a 000235.09).
8.10 «свет обители» — 5-я причина — ГЛАВНЫЙ микро-дрейф, которого
  нет даже в ТЗ (ТЗ писали до .10-мержей): описываем ФИНАЛЬНОЕ
  (5 причин) — ТЗ п.2 прямо покрывает («+ причины волн .09–.12
  (shroud и др., если появляются)»).

=====================================================================
§9. OPEN ITEMS
=====================================================================

* hearthfire radius — РЕШЕНО (§8.1): дописать + пометка no-op.
* Расхождений ТЗ↔код при сверке НЕ найдено (все ТЗ-координаты
  сдвинуты/закрыты мержами .10/.11/.12/000239/000268 — семантика
  цела, a1 §4 подтверждено этой стадией) → отдельные задачи НЕ
  создавать.
* shadow_step post-landing — НАМЕРЕННО не фиксировался (000239 D1);
  pending-задачи нет; SPEC документирует факт. Если будущая задача
  починит — буллет shadow_step + T7-пины ('ПОСТ-ЛЕНДИНГА',
  'бесплатен по игровому времени') станут красными → re-pin в той
  задаче.
* flame_step-луч × frost_walk — pre-existing (000239 §8) —
  зафиксировано, задача при необходимости.
* Волна .11 — внебоевых НЕТ (каталог) — ничего писать; буллет .04
  уже говорит «контент каталога — волна .11».

=====================================================================
§10. REBASE-ЗАМЕТКИ (перед мержем)
=====================================================================

* Общие файлы с параллельными ветками: spec/spells.md +
  tests/spec-split.test.js (самые проходимые: все волны серии
  правили; SPEC_FILE_LINES — общий re-pin-конвейер). Риск: чужой
  коммит после rebase добавит строки в spells.md → re-pin станет
  неактуальным; вставка .07–.10-блоков упрётся в сдвинувшийся
  контекст (L235/L240).
* После rebase ОБЯЗАТЕЛЬНО: (a) пересчёт SPEC_FILE_LINES ТЕМ ЖЕ
  счётчиком (4 файла; craft Δ0 подтвердить); (b) ре-сверка точек
  вставки: spells.md — строка «круг защиты», «замерзание», «покров
  ночи»)» (suppression-буллет) и «* Волна Природа (000235.12»
  (якорь вставки); world-map.md — конец TERRAIN_DATA-буллета;
  game-time.md — конец списка «При смене дня»; mobs.md — хвост
  зона-буллета «…но триггерят бой.»; craft.md — строка '|
  Зачарование'; (c) needle-ре-скан (13 needle'ов — не появились ли
  от чужих вставок: если какой-то needle появился до нашей правки —
  перефразировать needle, НЕ править чужой текст).
* На момент анализа (00:33): живые worktrees task-000230.12/
  task-000235.10/task-000243/task-000284 — tips ВСЕх
  merge-base-анцестры master (уже смержены) — конкурирующих правок
  spec/ на момент старта НЕТ; master сдвинулся с ff7d0c1:
  6ac25db = 000235.12 (последний relevant-мерж).
* Протокол: mерж ТОЛЬКО через .merge-pending-лок (эта стадия файл
  НЕ создаёт); ff-only; squash — reset --soft + один коммит на
  ветке.

=====================================================================
§11. РЕВЬЮ 2026-10-28 (правки по итогам ревью — второй коммит)
=====================================================================

Findings трёх ревьюеров — вердикты: 6/6 РЕАЛЬНЫ (3 major + 3 minor;
major ×3 — один корень, дубль-отчёты: 4 display-имени буллетов
.07/.08 не из каталога).

1. MAJOR (×3) — 4 имени в буллетах .07/.08 не совпадали с каталогом
   assets/spells (поле «название» — source of truth, раздел
   «Архитектура хранения»): flame_step «Огненный шаг» → «Пламенный
   шаг» (000042), firelight «Огни» → «Свет пламени» (000040),
   hearthfire «Костёр» → «Очаговый огонь» (000041),
   frozen_stillness «Морозная неподвижность» → «Замершая
   неподвижность» (000067). Имена — не из каталога и не из таблиц ТЗ
   волн (tasks/done/000235.07/.08 — каталожные); wording-пины
   T1–T13 имена НЕ покрывали (кроме совпавших), SELF-SCAN (c)
   result/000244.md проверял дельты строк, но не фактологичность
   имён. Корневая причина: контракт §1–§10 не содержал сверки
   display-имён по каталогу. Фикс: 4 строки line-neutral (Δ0) +
   НОВЫЕ positive-пины T1/T2/T3/T6 (ид + канон-имя в ОДНОМ needle:
   'flame_step («Пламенный шаг»' и т.д. — дрейф имени на буллете
   теперь ловится пином). Коллизия «Костёр» с лагерной постройкой
   (000095, spec/buildings.md) устранена следствием.
2. MINOR — «ОБАХ» (frost_walk) → «обоих»: единичная опечатка нового
   текста; тот же word был в title T4 (tests/spec-000244-wording) —
   исправлен там же (assertions/needle'ы не тронуты — на слово
   пина не было).
3. MINOR — цепочка flame_step-пост-лендинга: locations.dungeonPostMove
   ОПРЕДЕЛЯЕТ событие (тайл-бой/сундук), а startDungeonCombat /
   applyDungeonChest идут ПОСЛЕ clock.addStep(1) (src/main.js
   performFlameStep: ev = dungeonPostMove(ds) → addStep(1) → if
   ev.type==='combat' → startDungeonCombat / if ev.chest →
   applyDungeonChest → saveNow); мир — enterLocation УСЛОВНЫЙ:
   if (!maybeStartCombat(true, now)) enterLocation(). Буллет
   переписан 6 → 8 строк: SPEC_FILE_LINES spells.md 407 → 409 (re-pin
   000159 §5.1 в том же коммите); T1-needle'ы 'dungeonPostMove' /
   'saveNow' не тронуты, T1-заголовок — точный порядок.
4. MINOR — «отказ cb — reason cb, откат» → «каст не состоялся: мана
   НЕ списана, перемещения нет»: cb вызывается ДО списания маны
   (src/spells.js castOutOfCombat, flame_step-ветка: r = cb() →
   if (!free) p.mp -= …); при отказе cb — ранний return БЕЗ мутации
   (отката нет — rollback castFail — только порталы .04).

НЕ тронуто: src/, assets/, index.html, CHANGELOG.md, корневой
SPEC.md, прочие spec/*.md; H2/H3 (nH2=66/nH3=41),
SPEC_ROOT_LINES=31, R1 (23 файла), R5 (MOBS.md=199), 000275 G2
(mobs 126); «откат маны» W3 (spec-000230.17.01, порталы .04
castFail) — другой буллет, не задет.

=====================================================================
§12. FINALIZE 2026-10-28 (статус + master-дрейф + rebase-факты)
=====================================================================

* Тесты на Finalize: полный прогон (cd .worktrees/task-000244 &&
  npm test) — 3445 / 3445 / 0 (exit 0, ~4.7 мин), БЕЗ правок.
* Файлы ветки (git diff master...task/000244): spec/spells.md
  (317→409), spec/world-map.md (105→116), spec/game-time.md
  (20→29), spec/mobs.md (118→126), spec/craft.md (Δ0, 149),
  tests/spec-split.test.js (SPEC_FILE_LINES ×4: spells/world-map/
  game-time/mobs), tests/spec-000275-wording.test.js (G2: mobs
  118→126), tests/spec-000244-wording.test.js (T1–T13; по §11.1 —
  +4 канон-имени в needle'ах T1/T2/T3/T6), memory/000244-ooc-
  spec-sync.md, tasks (done/000244.md + result/000244.md). НОЛЬ
  src/, assets/, index.html, CHANGELOG.md, корневой SPEC.md.
* specLines (split('\n')+pop; НЕ wc -l) сверены с пином на
  Finalize: spells 409, world-map 116, game-time 29, mobs 126,
  craft 149, items 365 (ветка items.md НЕ трогает; trailing-\n в
  items.md НЕТ — wc -l даёт 364, счётчик specLines — 365).
* MASTER-ДРЕЙФ (база 6ac25db → 7a974cf на момент Finalize):
  9a9f6d7 (000243) — tests-only: final-repins-000243 (контент
  items: src/items.js, src/items-data.js, assets/items,
  комментарий ui.test.js — НЕ spec-линии), items.test.js,
  ui.test.js (комментарий), memory, tasks; 7a974cf (000284) —
  spec/items.md +1 (365→366), tests/spec-split.test.js (пин
  items.md 365→366, ханк ~L125), tests/spec-000230.16-wording.
  test.js, memory, tasks.
* REBASE (стадия мержа): ханки tests/spec-split.test.js НЕ
  пересекаются — наша сторона меняет строки L107–124 (world-map
  105→116, mobs 118→126, game-time 20→29, spells 317→409; обе
  правки Δ0 строк), 000284 — L125–131 (items 365→366, Δ0);
  spec/*.md — общих файлов НЕТ (000284 — items.md, ветка —
  spells/world-map/game-time/mobs/craft) → чистый rebase ОЖИДАЕТСЯ
  (проверено git diff обеих сторон на базе 6ac25db). После rebase —
  §10: (a) пересчёт SPEC_FILE_LINES (4 файла; craft Δ0), (b)
  ре-сверка точек вставки, (c) needle-ре-скан T1–T13, (d) полный
  npm test. Новые тесты master (final-repins-000243) пинуют только
  контент items — с нашей веткой НЕ взаимодействуют.

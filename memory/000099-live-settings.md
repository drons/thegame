# 000099 — Настройки применяются НА ЛЕТУ: чтение SETTINGS в момент вызова (контракт)

Статус: выполнено (перенесена в tasks/done, отчёт —
tasks/result/000099.md; финал 2026-10-03; workflow задачи 000099; worktree
.worktrees/task-000099, ветка task/000099, база = master cab0d27 —
000098 СМЕРЖЕН, его память 000098-* авторитетна; 2026-10-02). Текст
АВТОРИТЕТЕН для следующих стадий workflow (красные тесты → реализация →
мерж). База тестов: **1345/1345 зелёные** (44–52 с). После задачи —
1353 (1345 + 8 новых красных, становящихся зелёными).
Дополнительно: memory/000099-settings-live.md (само live-паттерн:
opts > SETTINGS > снапшот, guard → DEFAULTS, карта модулей).

Подзадача 000051 (P1, после 000098). Цель: изменение значения во вкладке
«Игровые настройки» (000098) действует БЕЗ перезагрузки: ядро читает
`Game.GlobalSettings.SETTINGS.*` в момент ВЫЗОВА, а не снапшоты при
загрузке модуля. 000098 дал форму, пишащую в живой SETTINGS; 000099
делает ядро, которое этот SETTINGS читает.

## 1. Что добавлено / перенесено

1. **src/day.js** (+~20/−~4): локальные хелперы `liveStepsPerDay()`,
   `liveRespawnDays()` (не экспортируются); `createClock` — closure-const
   `perDay` (L32) УБРАН, getter `stepsPerDay` (L48) и тело `addStep`
   (L52-59) резолвят `opts.stepsPerDay || liveStepsPerDay()` НА КАЖДЫЙ
   вызов; `dueForRespawn` (L96) — default-параметр
   `respawnDays = liveRespawnDays()` (оценивается на ВЫЗОВЕ).
   Снапшоты L23-24 и экспорт L303-311 — БЕЗ ИЗМЕНЕНИЙ.
2. **src/player.js** (+~8/−~2): хелпер `livePointsPerLevel()`;
   `addXp` (L320-334) — ОДНО чтение `const ppl = livePointsPerLevel()`
   в теле; L327 `c.points += ppl` и L333 `pointsGained: levelsGained *
   ppl` (одна значимость на вызов — начисление и возврат). Снапшот L51
   и экспорт L512 — БЕЗ ИЗМЕНЕНИЙ.
3. **src/dungeon.js** (+~18/−~4): хелперы `liveLevelDeltaMax()`,
   `liveMemoryDays()`; `generateDungeonContents` (L349) — ОДНО чтение
   `const delta = liveLevelDeltaMax()` в начале тела (детерминизм);
   `mobLevel` (L374) и ABYSS-босс (L396) — через `delta`;
   `contentValid` (L430) — `memoryDays = liveMemoryDays()`. Снапшоты
   L160-161 и экспорт L495 — БЕЗ ИЗМЕНЕНИЙ.
4. **src/main.js** (+~14/−~8): `const gs` (L58) и `const MOVE_INTERVAL_MS`
   (L59-62) УБРАНЫ; тело `stepIntervalMs()` (L70-75) — live-чтение
   `G.GlobalSettings.SETTINGS.move_interval_ms` ПРЯМО В ТЕЛЕ (каждый
   кадр) с guard'ом 000063 БЕЗ ИЗМЕНЕНИЙ (finite && > 0 → v; иначе 140);
   НОВЫЙ хелпер `moveIntervalBase()` (тот же guard, БЕЗ «Ловкого шага») —
   замена 3 call-sites (L241 createMover, L1049 enterLocation-ctx,
   L1618 debugEnterDungeon-ctx). Литералы 'move_interval_ms' и
   'GlobalSettings' в файле ОСТАЮТСЯ (структурный тест L281-298).
5. **tests/global-settings.test.js** (+~180, секция «000099» в конце):
   8 КРАСНЫХ тестов (7 vm-песочниц + 1 структурный) — см. §4.
   ВСЕ существующие тесты — БЕЗ ИЗМЕНЕНИЙ.
6. Память: этот файл + memory/000099-settings-live.md.
7. CHANGELOG.md — 1 строка на стадии мержа (дата = день мержа):
   «настройки из вкладки «Игровые настройки» действуют на лету, без
   перезагрузки».

НЕ ТРОГАТЬ (ТЗ + анализ): src/motion.js (кламп 60/базы, L134-154),
src/combat.js (live при создании боя — уже жив), src/companions.js,
src/map.js (уже live), src/building-actions.js (§5 known gap),
src/locations.js, src/dungeon-ui.js, index.html (script-тегов НЕТ),
tests/index-order.test.js (пинов не нужно), ВСЕ существующие тесты.

## 2. Контракты и границы

### 2.1 Таблица live-точек (функция → ключ → guard → fallback)

| точка (файл:функция) | ключ SETTINGS | guard (иначе → fallback) | fallback |
|---|---|---|---|
| day.js createClock: getter `stepsPerDay` + тело `addStep` | steps_per_day | число, finite, **≥ 1** | DEFAULTS (40) → снапшот |
| day.js dueForRespawn (default-параметр) | respawn_days | finite, **≥ 1** | DEFAULTS (3) → снапшот |
| player.js addXp (1 чтение на вызов) | points_per_level | finite, **≥ 1** | DEFAULTS (2) → снапшот |
| dungeon.js generateDungeonContents (1 чтение на генерацию) | level_delta_max | finite, **≥ 0** (0 ВАЛИДНО — META 000098 min 0) | DEFAULTS (3) → снапшот |
| dungeon.js contentValid (default-параметр) | dungeon_memory_days | finite, **≥ 1** | DEFAULTS (3) → снапшот |
| main.js stepIntervalMs (тело, каждый кадр) | move_interval_ms | finite, **> 0** (guard 000063 БЕЗ ИЗМЕНЕНИЙ) | **140** (деградация) |
| main.js moveIntervalBase (3 call-sites) | move_interval_ms | тот же (documented copy, синхрон) | **140** |

### 2.2 Цепочка резолва (НЕ ПЕРЕВОРАЧИВАТЬ — паттерн 000020)

**opts-оверрайд > SETTINGS (live) > DEFAULTS > снапшот-экспорт.**

* opts — публичные оверрайды (`createClock({stepsPerDay})`,
  `dueForRespawn(…, respawnDays)`, `contentValid(…, memoryDays)`) —
  приоритет НАД настройкой (ТЗ «Ограничения», прецеденты 000020/000033;
  combat.js уже так: opts.levelDeltaMax над SETTINGS).
* SETTINGS — live-чтение в момент вызова (тело функции).
* DEFAULTS (000098: frozen клон значений при загрузке) — значение guard'а
  при невалидном SETTINGS (ТЗ п.3: «нечисло/≤ 0 → DEFAULTS-значение»).
  В node и в браузере DEFAULTS есть (экспорт global-settings.js; vm-цепочки
  грузят его ПЕРВЫМ — index.html).
* Снапшот-экспорт (const при загрузке модуля) — последняя опора
  (belt-and-suspenders: подделанный settings-объект без DEFAULTS).
  В практике DEFAULTS === снапшот по значению (оба = загрузочные 40/3/2/3/3).

### 2.3 Границы = кламп 000098 (СМЕРЕЖЕН, сверено с META)

steps_per_day/respawn_days/dungeon_memory_days/points_per_level — int
**min 1**; level_delta_max — int **min 0** (0 валидно — combat «±0»);
move_interval_ms — int **[60, 10000]** (60 = MIN_MOVE_INTERVAL_MS).
UI-форма (000098 clampValue) ЭТИХ границ не выходит — guard'ы ядра
гарантируют, что ЛЮБОЕ допустимое формой значение проходит; подделка
(devtools/мусор) → fallback, игра не падает и НЕ ЗАВИСАЕТ
(steps_per_day 0 → 40, НЕ while-бесконечность в addStep).

### 2.4 Формы хелперов (контракт реализации)

```js
// day.js (аналогично player/dungeon, свои ключи/min/снапшоты)
function liveStepsPerDay() {
  const v = settings.SETTINGS.steps_per_day;
  return (typeof v === 'number' && Number.isFinite(v) && v >= 1)
    ? v : (settings.DEFAULTS ? settings.DEFAULTS.steps_per_day : STEPS_PER_DAY);
}
```
```js
// main.js — ПРЯМО В ТЕЛЕ stepIntervalMs (ТЗ: «каждый кадр»)
function stepIntervalMs() {
  const gs = G.GlobalSettings && G.GlobalSettings.SETTINGS;
  const base = (gs && Number.isFinite(gs.move_interval_ms)
    && gs.move_interval_ms > 0)
    ? gs.move_interval_ms
    : 140;
  return G.moveIntervalMs
    ? G.moveIntervalMs(base, (G.derived(hero) || {}).moveSpeedMult)
    : base;
}
// moveIntervalBase() — ТОТ ЖЕ guard (копия задокументирована
// комментарием «в синхроне со stepIntervalMs, 000099»), БЕЗ
// G.moveIntervalMs (без «Ловкого шага»).
```

## 3. Ленивые ссылки и guards

* **Новых модулей НЕТ** — UMD-ловушек/порядка index.html не меняется.
  Live-чтение работает на СУЩЕСТВУЮЩИХ ссылках-ленивцах:
  * day/player/dungeon — параметр фабрики UMD `settings` = ССЫЛКА на
    живой экспорт global-settings.js (в node — require, в браузере —
    `Game.GlobalSettings`); объект SETTINGS живёт, ссылка не меняется
    (000098: форма пишет в place, setByPath) → чтение `.SETTINGS.<ключ>`
    в теле функции видит мутацию БЕЗ re-require (в обоих средах).
  * main.js — `G = globalThis.Game` (L13) — снапшот ОДНОГО объекта;
    `G.GlobalSettings` и `G.GlobalSettings.SETTINGS` читаются в теле
    функций при вызове (лениво). `const gs`/`const MOVE_INTERVAL_MS`
    (load-time захват) — удалены.
* Guards: §2.1/§2.4. Load-гарды day/dungeon (throw без
  global-settings.js, L17-20/L154-157) — БЕЗ ИЗМЕНЕНИЙ (тест
  «понятная ошибка» L102-111).
* main.js без global-settings.js: `G.GlobalSettings` undefined →
  `gs` undefined → base = 140 (деградация 000033/000063 — старое
  поведение; структурный тест допускает литерал 140 как fallback).
* «Ловкий шаг» (moveSpeedMult) применяется ТОЛЬКО в stepIntervalMs
  (главная карта + окно walk/idle); moveIntervalBase (муверы
  подземелья/города/фабрика) — БЕЗ навыка. Окно walk/idle
  (`G.walkWindowMs(stepIntervalMs())`, L1401-1404) подхватывает live
  автоматически — инвариант 000063 (окно следует за шагом; фикс 260 не
  восстанавливается).

## 4. Тесты (красные — ПЕРВЫМИ, в tests/global-settings.test.js)

Секция «000099» в конце файла. Прототип проверен ДВУСТОРОННЕ:
/tmp/thegame-wf-000099/proto-red.js — на master 8/8 падают по
семантической причине (возвращён снапшот), на эталонной live-реализации
(/tmp/thegame-wf-000099/ref-src) 8/8 зелёные + полный набор 1344/1345
(единственный fail — sync-all.test.js «требует доступный git», артефакт
копии в /tmp без .git; в настоящем worktree зелёный).

Паттерн: **vm-песочница (loadInSandbox, L22-25), мутация
sandbox.Game.GlobalSettings.SETTINGS БЕЗ re-require** (тот же объект,
что удерживает модуль; vm realm изолирован от node-SETTINGS →
t.after-restore НЕ нужен — в отличие от node-тестов файла).

| id | тест (коротко) | RED на master |
|---|---|---|
| T1 | live day: createClock/addStep (steps_per_day) — цепочка global-settings+day; 40 → 7 → порог 7 (addStep 6→д1, 1→д2); затем =5 → addStep(5) → д3 (live в ТЕЛЕ addStep на СУЩЕСТВУЮЩИХ часах) | снапшот 40 ≠ 7 |
| T2 | live day: dueForRespawn (respawn_days=1): (M[['1,1',5]], 6)=['1,1'], (…, 5)=[]; JSON-roundtrip (кросс-realm массив) | снапшот 3 → [] |
| T3 | live player: addXp (points_per_level=5): levelsGained 1, pointsGained 5, c.points 5 | снапшот 2 |
| T4 | live dungeon: generateDungeonContents (level_delta_max=0): createDungeon(37,−12, syntheticPixels(8,8,128,128,128,10), TERRAIN.HILL) → ABYSS (босс есть, детерминирован: level = player.level + delta, без RNG); ВСЕ мобы и босс = 15 | снапшот 3 → 12–18 |
| T5 | live dungeon: contentValid (dungeon_memory_days=9): (1,10)=true, (1,11)=false | снапшот 3: (1,10)=false |
| T6 | guard day, ДВУХЭТАПНЫЙ: ДО загрузки day.js SETTINGS=7/1 (снапшот ≠ DEFAULTS — иначе тест не дискриминирует); ПОСЛЕ =0/0 → stepsPerDay 40 (DEFAULTS), addStep(41) → д2/steps 1 (НЕ зависание), dueForRespawn(…, 6) = [] (guard 3) | снапшот 7 ≠ 40 |
| T7 | guard player/dungeon, ДВУХЭТАПНЫЙ: ДО загрузки 5/5/9; ПОСЛЕ 0/−1/0 → pointsGained 2; ABYSS-босс 18 (15+3 DEFAULTS); contentValid(1,5)=false | снапшот 5/5/9 |
| T8 | структурный main.js: `!/\bMOVE_INTERVAL_MS\b/.test(text)` (const и ВСЕ call-sites убраны; word-boundary — подстрока в MIN_MOVE_INTERVAL_MS не считается); slice от 'function stepIntervalMs' до первого '\n  }' содержит 'move_interval_ms' И '140' (live-чтение + fallback в теле, каждый кадр) | const на L59-61 |

Существующий структурный тест L281-298 (GlobalSettings ✓,
move_interval_ms ✓, !«const MOVE_INTERVAL_MS = 140» ✓) — зелёный до/после
БЕЗ ИЗМЕНЕНИЙ. GREEN-регрессия: ВСЕ 1345 без изменений (проверено полным
прогоном на эталоне; ключевые: re-require-тесты L113-185, day/player/
dungeon/motion/combat, bootSandbox-цепочки index.html — main.js обязан
грузиться без load-time-краха; moveIntervalBase/stepIntervalMs —
function declarations, хостятся до L241).

## 5. Известные границы (принято; кандидаты в follow-up)

* **grantXpRaw (src/building-actions.js:147, 000074/000128)** — «ТОЧНОЕ
  ЗЕРКАЛО addXp» через СНАПШОТ `deps.game.POINTS_PER_LEVEL`. После 000099:
  штатный левел-ап — live-очки, левел-ап руническим камнем/обелиском —
  load-time-очки (расходится, если игрок менял points_per_level в сессии).
  Файл ВНЕ списка «Файлы» ТЗ → НЕ ТРОГАЕМ (строго по ТЗ). Кандидат в
  follow-up (привести grantXpRaw к live через player.js или общий
  резолвер).
* **main.js: подделка move_interval_ms в (0, 60)** — guard 000063
  (`> 0`) пропускает; `G.moveIntervalMs(base, mult) = min(max(60, raw),
  base)` при base < 60 СЪЕДАЕТ нижний кламп (инвариант 000063 «база > 60»).
  Только подделка (UI клампит [60, 10000]); прецедент touchStepMs
  (dungeon-ui.js, 000121) имеет свой Math.max(60, base) для своего
  потребителя. Фолбэк main.js при битом значении = 140 (не 420) — guard
  000063 без изменений (решение D-main-guard, §6).
* **Сталые комментарии** «MOVE_INTERVAL_MS в main.js»: src/locations.js
  L79/L106, tests/locations.test.js L387, tests/dungeon-ui.test.js L84 —
  только комментарии, не ассерты; вне файлов ТЗ → НЕ ТРОГАЕМ.
* **Секция S6** global-settings (L588) — фиксатор «live-чтение SETTINGS
  ядром — НЕ ЭТОЙ задачей (000099)» — наша задача закрывает эту дыру;
  тест остаётся зелёным БЕЗ ИЗМЕНЕНИЙ (комментарий станет историческим —
  осознанно, семантических правок существующих тестов нет).
* **main.js параллельно правят 000042/000085/000087** (ТЗ «Ограничения»):
  при мерже — ребейз на актуальный master + перепроверка stepIntervalMs/
  moveIntervalBase/3 call-sites + полный npm test. Hunk узкий (L53-75 +
  3 однотипные строки).

## 6. Решения, зафиксированные на стадии Проектирования

* **D-main-guard**: guard move_interval_ms в main.js — БЕЗ ИЗМЕНЕНИЙ
  (000063: finite && > 0 → v; иначе 140), только ПЕРЕНЕС в тело
  stepIntervalMs. ПЕРЕЧЕРКНУТ вариант а1-анализа (guard ≥ 60 + битое →
  DEFAULTS 420): ТЗ п.2 буквально предписывает «guard + fallback 140»
  (существующий guard), «нечисло/≤ 0 → DEFAULTS» в п.3 scoped «в ядре»
  (day/player/dungeon); 000098-кламп [60, 10000] — граница ФОРМЫ (UI не
  выходит); смена invalid→420 = поведенческое изменение сверх ТЗ («не
  больше и не меньше»); 140 закреплён структурным тестом L281-298 +
  память 000063; эталонная реализация с этим guard'ом проверена зелёной.
* **D-main-callsites**: L241/L1049/L1618 → `moveIntervalBase()` (live
  база БЕЗ «Ловкого шага»), НЕ `stepIntervalMs()` (вариант эталона
  /tmp): «Ловкий шаг» в подземелье НЕ применяется — задокументированное
  ограничение 000066/000067 (dungeon-ui.test.js L84); stepIntervalMs()
  на L1049/L1618 масштабирует скорость подземелья/города Ловкостью =
  изменение геймплея сверх ТЗ; L241 — мёртвый factory-интервал (main.js
  всегда передаёт stepMs явно, L1454-1455) → moveIntervalBase() там
  no-op; бонус: нет load-time-зависимости от hero/G.derived.
* **D-live-per-call**: day.js — резолв в getter И в теле addStep на
  КАЖДЫЙ вызов (не на создание часов): main.js создаёт createClock() ОДИН
  раз при старте (L252) — только per-call даёт «изменение действует без
  перезагрузки» на живых часах. player/dungeon/main — в телах функций.
* **D-default-args**: dueForRespawn/contentValid — default-параметры
  `= liveRespawnDays()` / `= liveMemoryDays()` (JS оценивает на ВЫЗОВЕ —
  live; семантика ТОЧНО как раньше — дефолт только для undefined;
  явный null ведёт себя как до рефакторинга — НИКАКИХ вызовов с null в
  коде/тестах, проверено). Перечеркнут a1-вариант `!= null` (менял бы
  null-путь).
* **D-fallback-chain**: ядро — SETTINGS (valid) → DEFAULTS[key] → снапшот
  (ТЗ п.3 «→ DEFAULTS-значение»; DEFAULTS есть в обоих средах; хвост —
  belt-and-suspenders). Двухэтапность guard-тестов (T6/T7) ВОЗМОЖНА
  только благодаря DEFAULTS-стадии (снапшот ≠ DEFAULTS при мутации до
  загрузки).
* **D-delta-0**: level_delta_max guard **≥ 0** (0 валидно — META 000098
  min 0, тест combat «±0»; формула ТЗ «≥ 1 и пр.» — shorthand для
  остальных 4 ключей; 000098 смержен — границы авторитетны).
* **D-single-read**: generateDungeonContents — ОДНО чтение delta на
  генерацию (детерминизм задокументирован: один поток, одна значимость;
  порядок rng() НЕ меняется — только замена константы на локальную
  переменную; раскладка/позиции/сундуки/босс-позиция bitwise-stable при
  неизменном SETTINGS — goldens зелёные). Эталон читал per-call —
  поведенчески эквивалентно (нет точек мутации внутри функции).
* **D-red-form**: 8 тестов по прототипу (7 vm + 1 структурный); vm-мутации
  без restore (изоляция realm); кросс-realm массивы — JSON-roundtrip
  (T2/T6); R8 — word-boundary regex + body-slice.
* **D-scope**: building-actions.js, stale-комментарии, S6 — НЕ трогаем
  (§5). index.html/index-order — 0 строк (новых модулей/ассетов нет).
* **D-changelog**: да (видимо игроку: «настройки действуют без
  перезагрузки») — отдельный коммит на стадии мержа, дата = день мержа.

## 7. Подводные камни (для реализации и мержа)

1. **while-зависание** (критичный hazard): addStep при perDay ≤ 0 —
   guard (≥ 1 → DEFAULTS 40) ОБЯЗАТЕЛЕН до входа в цикл; T6 составлен так,
   что в red-фазе падает на assert ДО addStep (npm test не виснет).
2. **Кросс-realm массивы**: vm-песочница создаёт собственный Array —
   `assert.deepEqual(vmArray, hostArray)` падает ДАЖЕ после реализации —
   только JSON-roundtrip или попунктно (устоявшийся паттерн файла, L97-99).
3. **Подстрока MOVE_INTERVAL_MS ⊂ MIN_MOVE_INTERVAL_MS**: в main.js
   останутся комментарии с G.MIN_MOVE_INTERVAL_MS (L67/L1445) — наивный
   `includes('MOVE_INTERVAL_MS')` остался бы красным; пинить
   `/\bMOVE_INTERVAL_MS\b/` (граница слова между _ и M отсутствует).
4. **Дискриминация guard-тестов**: fallback при битом значении равен
   дефолту (40/3/2/3) — однотактная схема (дефолт → 0) была бы зелёной и
   ДО реализации; обязательны ДВЕ стадии (мутация ДО загрузки модуля).
5. **opts-приоритет** — не переворачивать: публичные параметры (opts /
   respawnDays / memoryDays) остаются НАД SETTINGS; live-тесты
   намеренно не передают параметры (попасть в live-день-по-умолчанию).
6. **Load-time call-site L241**: moveIntervalBase() — function
   declaration (хостится), не требует hero/G.derived — main.js грузится
   без краха во ВСЕХ bootSandbox-цепочках (проверено полным прогоном).
7. **Семантика L1049/L1618**: интервал мувера подземелья/города теперь
   снимается ВХОДЕ (live-at-entry) вместо load-time — та же величина при
   неизменном SETTINGS (420), только живая; «Ловкий шаг» туда НЕ попал
   (D-main-callsites) — dungeon-глейд без изменений.
8. **Детерминизм**: live delta меняет ТОЛЬКО уровни мобов/босса при
   перегенерации (сид = totalXp — invariant); 1 rng() на группу
   независимо от delta. Сейвы/файт-детерминизм — не затронуты
   (SETTINGS session-only, в сейв не пишется — 000098).
9. **Флейки**: прогон ~45–52 с; при случайном падении ЧУЖОГО теста —
   перепуск `node --test tests/<файл>` + запись в отчёт (прецедент 000130).
10. **Мерж**: hunk main.js узкий (L53-75, 241, 1049, 1618), но main.js
    параллельно правят 000042/000085/000087 — ребейз + перепроверка
    stepIntervalMs/moveIntervalBase + полный npm test; .merge-pending —
    только стадия мержа.

## 8. Правки по итогам ревью (2026-10-03)

Два findings (3 ревьюера), оба minor, оба РЕАЛЕН, оба закрыты:

* **F1 — live-хелперы бросают TypeError, если ЦЕЛИКОМ SETTINGS
  заменён на null/undefined в рантайме.** ТЗ п.3 («подделанный/битый
  SETTINGS не роняет и не зависает игру») и guard main.js в той же
  задаче уже null-safe (`gs && …` → 140) — несогласованность внутри
  новой функциональности. Игровая кодовая тропа такого состояния не
  создаёт (000098 пишет per-key setByPath; SETTINGS session-only) —
  devtools/ручная подмена → minor. ИСПРАВЛЕНО: в каждом из 5
  хелперов (day.js liveStepsPerDay/liveRespawnDays, player.js
  livePointsPerLevel, dungeon.js liveLevelDeltaMax/liveMemoryDays)
  — `const s = settings.SETTINGS; const v = (s && typeof s ===
  'object') ? s.<ключ> : NaN;` — NaN не проходит guard значения →
  DEFAULTS → снапшот (та же цепочка, что при битом значении;
  while-зависания в addStep нет). combat.js/companions.js НЕ
  тронуты (задача запрещает; устоявшаяся проектная модель —
  битые ЗНАЧЕНИЯ, а не замена объекта) — кандидат в follow-up.
  Тест R9 (tests/global-settings.test.js, vm, цепочка
  global-settings+perlin+mapseed+map+skills-data+dungeons-data+
  day+player+dungeon): SETTINGS = null → stepsPerDay 40, addStep(41)
  → день 2 без зависания, dueForRespawn → DEFAULTS 3, addXp →
  pointsGained 2, contentValid(1,4)=true/(1,5)=false, ABYSS-босс
  15+3; SETTINGS = undefined → та же ветка. До фикса R9 красный
  (TypeError), 30/31 зелёные; после — 31/31. Полный набор 1354/1354.
* **F2 — отсутствует CHANGELOG-упоминание 000099** (запланировано
  на стадию мержа, §1.7/§6 D-changelog). Задача меняет поведение,
  видимое игроку. По прецеденту 000121 (finding #4 — та же
  ситуация, выполнена на станции ревью) и инструкции станции —
  выполнено СЕЙЧАС отдельным коммитом «Задача 000099: CHANGELOG — …»
  (дата 2026-10-03, раздел «Интерфейс», рядом с записью 000098);
  на стадии мержа добавлять нечего — строка уже в ветке.

# 000099 — live-паттерн «снапшот → live» (дополнение к 000020)

Статус: выполнено (перенесена в tasks/done, отчёт —
tasks/result/000099.md; workflow 000099, ветка task/000099, база
master cab0d27, 2026-10-02; финал 2026-10-03, тесты 1354/1354).
Главное — memory/000099-live-settings.md (контракт
задачи: точки, guard'ы, тесты, решения). Этот файл — само ПАТТЕРН-описание
для будущих задач, которые переводят другие модули на live-чтение.

## 1. Паттерн: «снапшот → live» (расширение 000020)

000020: зависимые модули получают настройки через параметр UMD-фабрики и
захватывают значения в const ПРИ ЗАГРУЗКЕ (снапшот). «Единый источник»
тогда достигался ТОЛЬКО через re-require в тестах — игровую сессию
перезагрузка не обновляла.

000099: ключевой механизм — **объект SETTINGS живёт, ссылка не меняется**
(000098: форма вкладки пишет в place, setByPath; `resetAll` — Object.assign
того же объекта). Поэтому достаточно читать `settings.SETTINGS.<ключ>`
**в теле публичной функции в момент вызова** — и мутация формы видна ядру
БЕЗ перезагрузки и БЕЗ re-require, в node (require) и в браузере (UMD/vm):

```js
function liveKey() {                       // локальный хелпер, НЕ экспорт
  const v = settings.SETTINGS.<ключ>;      // живое чтение при вызове
  return (typeof v === 'number' && Number.isFinite(v) && v >= <min>)
    ? v : (settings.DEFAULTS ? settings.DEFAULTS.<ключ> : <СНАПШОТ>);
}
function publicFn(opts = {}) {
  const val = opts.<оверрайд> || liveKey(); // на КАЖДЫЙ вызов
  ...
}
```

* Снапшот-const при загрузке ОСТАВЛЯЕТСЯ (экспорт-константы — API,
  «единый источник»-тесты с re-require зелёные в любом варианте).
* main.js (не UMD, `G = globalThis.Game`) — то же самое:
  `G.GlobalSettings.SETTINGS.<ключ>` в теле функции (G — снапшот одного
  объекта, мутации SETTINGS видны через него).
* Прецеденты live-чтения ДО 000099 (на master): combat.js (level_delta_max
  и др. в createCombat), companions.js, map.js, dungeon-ui.js touchStepMs
  (move_interval_ms, 0000121-ревью, фолбэк 420 + Math.max(60, base)).

## 2. Иерархия значения: opts > SETTINGS (live) > DEFAULTS > снапшот

* **opts** — публичные оверрайды функций (`createClock({stepsPerDay})`,
  `dueForRespawn(…, respawnDays)`, `contentValid(…, memoryDays)`,
  combat: `createCombat({levelDeltaMax})`) — приоритет НАД настройкой;
  настройка задаёт только значение по умолчанию (000020, ТЗ 000099
  «Ограничения» — НЕ ПЕРЕВОРАЧИВАТЬ).
* **SETTINGS** — live, в момент вызова.
* **DEFAULTS** (000098, frozen клон загрузочных значений) — fallback
  guard'а при невалидном SETTINGS (ТЗ: «нечисло/≤ 0 → DEFAULTS-значение»).
  Для ядра: 40/3/2/3/3.
* **снапшот-экспорт** — последняя опора (подделанный settings без
  DEFAULTS). В практике DEFAULTS ≡ снапшот по значению.

## 3. Guard в ядре: границы = META 000098, fallback = DEFAULTS

Значение принимается, только если: число, finite, и не ниже min ключа
(META global-settings.js — ЕДИНЫЙ источник границ формы и ядра):

* steps_per_day ≥ 1, respawn_days ≥ 1, dungeon_memory_days ≥ 1,
  points_per_level ≥ 1, level_delta_max ≥ **0** (0 валидно — «±0»).
* Валидно → берём; невалидно (мусор/0/−1/NaN/бесконность) → DEFAULTS.
* Инвариант: guard ДО side-effects — steps_per_day 0 → 40, НЕ
  while-бесконечность в addStep; игра не падает.
* main.js — исключение со своим guard'ом (000063, без изменений):
  move_interval_ms finite && > 0 → v; иначе **140** (деградация без
  global-settings.js / битое значение); «Ловкий шаг» только в
  stepIntervalMs (G.moveIntervalMs), не в moveIntervalBase.
* UI (clampValue 000098: [60, 10000] для move_interval_ms и пр.) за
  пределами этих диапазонов значения не выдаёт — guard'ы ядра
  страхуют только подделку/devtools.

## 4. Какие модули переведены на live (карта)

| модуль | статус | ключи |
|---|---|---|
| day.js | **000099: live** (getter+addStep, dueForRespawn) | steps_per_day, respawn_days |
| player.js | **000099: live** (addXp, 1 чтение на вызов) | points_per_level |
| dungeon.js | **000099: live** (generateDungeonContents 1 чтение на генерацию, contentValid) | level_delta_max, dungeon_memory_days |
| main.js | **000099: live** (stepIntervalMs в теле + moveIntervalBase, const УБРАН) | move_interval_ms |
| combat.js | уже live (создание боя) — НЕ ТРОГАТЬ | difficulty, level_delta_max, combat_difficulties, obstacle_frac |
| companions.js | уже live — НЕ ТРОГАТЬ | max_companions, loyalty, refusal, xp_share |
| map.js | уже live — НЕ ТРОГАЕТСЯ | city_channel |
| building-actions.js grantXpRaw | **снапшот** (Game.POINTS_PER_LEVEL) — known gap, follow-up (кандидат на live) | points_per_level |

Всего ключей SETTINGS — 15; скоуп 000099 — 6 (day/player/dungeon/main).
Остальные 9 уже live — «не больше и не меньше, чем просит ТЗ».

## 5. Чек-лист перевода модуля на live (для будущих задач)

1. Снапшот-const оставить (экспорт-API + re-require-тесты).
2. Локальный live-хелпер: `typeof v === 'number' && Number.isFinite(v) &&
   v >= min ? v : (settings.DEFAULTS ? settings.DEFAULTS.k : SNAPSHOT)`;
   min — из META 000098 (0 — ВАЛИДНО, если META min 0).
3. Чтение — в теле публичной функции (per-call), один раз на вызов
   (детерминизм внутри вызова); default-параметры `= liveKey()` — live
   (оцениваются на вызове).
4. opts-приоритет НЕ переворачивать.
5. Порядок вызовов rng()/side-effects НЕ менять (замена константы на
   локальную переменную — только она).
6. Красные тесты: vm-песочница (loadInSandbox), мутация
   sandbox.Game.GlobalSettings.SETTINGS БЕЗ re-require (vm realm изолирован
   → restore не нужен); кросс-realm массивы — JSON-roundtrip; guard-тесты
   — ДВУХЭТАПНЫЕ (мутация ДО загрузки: снапшот ≠ DEFAULTS → дискриминация;
   затем битое значение → DEFAULTS).
7. Полный npm test: существующие тесты БЕЗ ИЗМЕНЕНИЙ.

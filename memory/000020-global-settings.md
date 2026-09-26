# 000020: глобальные настройки игры в src/global-settings.js

Статус: выполнено и закоммичено (тесты 178 → 186 pass).

## Решения

* **`src/global-settings.js`** — UMD-модуль без зависимостей, в index.html
  подключается ПЕРВЫМ среди src-скриптов. Экспорт: `{ SETTINGS }`, где
  `SETTINGS` — объект со ВСЕМИ «настраиваемыми» числовыми параметрами
  SPEC.md: `steps_per_day = 40`, `respawn_days = 3`,
  `dungeon_memory_days = 3`, `level_delta_max = 3`, `points_per_level = 2`.
  Браузер — `Game.GlobalSettings`, node — require.
* Зависимые модули получают настройки через параметр фабрики UMD
  (в браузере — `root.Game && root.Game.GlobalSettings`, в node —
  require) и захватывают значения в константы при загрузке:
  day.js (STEPS_PER_DAY/RESPAWN_DAYS), dungeon.js (DUNGEON_MEMORY_DAYS/
  LEVEL_DELTA_MAX), player.js (POINTS_PER_LEVEL), combat.js (N в
  createCombat). Публичные оверрайды сохранены (stepsPerDay/respawnDays/
  levelDeltaMax в опциях) — настройка задаёт только значения по умолчанию.
* day.js/dungeon.js/combat.js бросают понятную ошибку, если
  global-settings.js не загружен (в стиле player.js для skills-data.js).
* Подловленный баг начальной версии: combat.js принимал `settings`,
  но `createCombat` по-прежнему хардкодил N=3 — исправлено на
  `settings.SETTINGS.level_delta_max`.
* Тест «единого источника»: mutации `SETTINGS` + delete require.cache +
  re-require зависимого модуля — значения пересчитываются (кэш
  global-settings.js при этом не чистится — общий объект виден всем).
* «Браузерный» путь UMD тестируется в node через `vm.runInNewContext`
  без `module` — так проверяется порядок загрузки и ошибки при пропуске
  global-settings.js. Осторожно: объекты из чужого realm не проходят
  `deepStrictEqual` (прототип из другого realm) — сравнивать через
  JSON-конвертацию.

## Тесты

tests/global-settings.test.js: 8 тестов — форма экспорта/ключи,
значения по умолчанию = SPEC.md, браузерный путь (vm) без поломки Game,
понятные ошибки зависимых модулей без настроек, «единый источник» для
day/player/dungeon/combat (включая уровни мобов при level_delta_max = 0).

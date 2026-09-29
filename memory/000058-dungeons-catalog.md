# 000058: подземелья — каталог assets/dungeons (JSON + схема)

Статус: реализация (задача в tasks/pending; отчёт и перенос в done —
стадия Finalize). Дочерняя к 000053 (аудит дублирования данных).

## Что сделано

* `assets/dungeons`: `000001..000005.json` (5 типов подземелий, данные
  1:1 из `src/dungeon.js`) + `schema.json` (валидатор
  `tests/json-schema.js`, русские имена полей, additionalProperties
  false — стиль `assets/buildings`).
* `src/dungeons-data.js` (новый, ГЕНЕРИРУЕМЫЙ целиком) — униформный
  фолбэк-модуль: браузер — `Game.DungeonsData`, node — `require()`.
  `{ DUNGEONS (в порядке файлов), DUNGEONS_BY_ID (по id 0..4) }`.
* `scripts/sync-dungeons-data.js` (новый) + npm `sync:dungeons`:
  идемпотентно (byte-identical), CI-готовый (000054), паттерн
  `sync-spells-data.js`; проверка `id = номер файла − 1` и множества
  id = {0..4}, ключи вне схемы — exit 1.
* `src/dungeon.js`: `DUNGEON_NAMES/MOBS/ITEMS/SIZE` выведены из
  каталога — node-ветка `require('./dungeons-data.js')`, браузерная —
  `Game.DungeonsData` + `validDungeonCatalog`-гард: без data-модуля
  (vm-песочница `tests/dungeon-ui.test.js` его не грузит) —
  FALLBACK-литералы 1:1 с каталогом (прецедент `FALLBACK_BUILDING_COUNT`
  из `src/map.js`, 000055); битый data-модуль — `console.warn` +
  fallback. `DUNGEON_TYPES` (0..4), `dungeonTypeFor`, `createDungeon`,
  `generateDungeonContents` и форма экспортов — БЕЗ ИЗМЕНЕНИЙ
  (`main.js`/`dungeon-ui.js` не тронуты).
* `index.html`: `<script src="src/dungeons-data.js">` ДО `dungeon.js`
  (УМД-ловушка 000038 — данные должны быть в Game раньше, чем dungeon.js
  их снимает; порядок закреплён тестом).
* `src/sprites.js`: ТОЛЬКО комментарий к `COMBAT_BG_DUNGEON` —
  source of truth зеркала теперь каталог; зеркало остаётся
  ЛИТЕРАЛЬНЫМ (sprites.js без require dungeon.js и без data-модулей —
  vm-песочница combat-ui, 000049); тест зеркало ≡ каталог усилен.
* `SPEC.md`: новый раздел «Архитектура хранения подземелий».

## Ключевые решения

1. **Конвенция id (разрез противоречия текста задачи)**: файл
   `0000NN.json` хранит `id = NN−1`, то есть значения `DUNGEON_TYPES`
   0..4. Перенумерации НЕТ (фон боя `assets/combat/bg` — по этим
   числам, 000049; `DUNGEON_TYPES` — публичный API). Множество id по
   файлам — ровно {0..4}; уникальность схемой не выразима — проверяется
   тестом и sync-скриптом.
2. **Связь «подземелье ↔ вход в мире» — ОДНОНАПРАВЛЕННАЯ**: поле
   `постройка` (31..35, категория «пещера») живёт ТОЛЬКО в
   `assets/dungeons`; в `assets/buildings/31..35` ОБРАТНОГО поля НЕТ
   (рекомендуемый вариант задачи, меньше пересечения с 000055/000060).
   `sync-buildings-data.js` перезапускать НЕ нужно. Дублирование прозы
   `особые_параметры.содержимое` пещер (vs id мобов/предметов)
   сознательно остаётся: связь кодом — только через `постройка` + имена
   (без учёта регистра: buildings — заглавная, dungeons — строчная).
3. **Регистр `название`**: кодовый (строчный) — строки HUD/логов
   `DUNGEON_NAMES` не меняются; в dungeons-каталоге зафиксирован
   строчный (аналог защиты от «исправления» регистра, как в buildings).
4. **Сейв**: подземелья в `src/save.js` НЕ пишутся (проверено по коду:
   `dungeonMemory` — локальная переменная `src/main.js`, в save.js
   dungeon отсутствует) → версия сейва НЕ повышена.
5. **Детерминизм**: golden-тесты (CAVE seed 2658571374; ABYSS
   seed 2941640529, contents seed 3935780563) сняты ДО переноса —
   перенос 1:1, генерация не изменилась.

## Мерж

000058 мержится ПОСЛЕ 000057 (порядок из 000053: … → 000057 → 000058 →
000060). Возможные аддитивные конфликты (мелкие): `package.json`
(sync:*-скрипты — 000057/000059), `tests/assets-schemas.test.js`
(CATALOGS — 000057/000059), `src/sprites.js`/`tests/sprites.test.js`
(000056/000057). `assets/buildings/31..35` намеренно НЕ тронуты.
Перед мержем обязательна ре-база на актуальный мастер.

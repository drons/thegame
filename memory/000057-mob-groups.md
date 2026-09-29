# 000057: стационарные группы мобов — каталог assets/mob_groups

Статус: реализовано (стадия реализации; отчёт и done — стадия Finalize).
Дочерняя к 000053 (аудит дублирования данных).

## Что сделано

* `assets/mob_groups`: 7 файлов `000001.json`…`000007.json` +
  `schema.json` (ключи валидатора — tests/json-schema.js; поля `id`,
  `название`, `состав {название, число?, мобы}`, `спрайт`,
  `особые_параметры`). Данные 1:1 из кода master: MOB_GROUP_NAMES
  (map.js), GROUP_RECIPES (combat.js), MOB_KINDS (sprites.js).
* `scripts/sync-mob-groups-data.js` (новый) — генерирует ЦЕЛИКОМ
  `src/mob-groups-data.js` (паттерн sync-npc-data.js, не блок между
  маркерами как sync-buildings-data.js — файл чисто данные). Шапка —
  «GENERATED — не править руками, синхронизируется из
  assets/mob_groups (scripts/sync-mob-groups-data.js)»; форматирование
  детерминировано; идемпотентно (byte-identical, закреплено тестом).
  npm `sync:mobgroups` (интерфейс единый с sync:buildings, CI 000054).
* `src/mob-groups-data.js` (новый, генерируемый) — униформный UMD:
  браузер — `Game.MobGroupsData`, node — `require()`. ВНУТРИ модуля
  НОЛЬ require (тест проверяет `!code.includes('require(')` — даже в
  комментариях): vm-песочницы combat-ui/sprites исполняют файл без
  module-окружения (паттерн 000049).
* `src/map.js`: константы `MOB_GROUP_COUNT`/`MOB_GROUP_NAMES` УДАЛЕНЫ.
  `MOB_GROUP_TYPES` оставлен (идентификаторы 0..6 + NONE, как
  BUILDING_TYPES). Новые ЛЕНИВЫЕ `mobGroupCount()` / `mobGroupName(i)`
  (паттерн buildingCount/buildingNames из 000055: `mobGroupsRef()` —
  инъекция (node, 3-й аргумент UMD) / `Game.MobGroupsData` в момент
  ВЫЗОВА; кэш; пустой вывод НЕ кэшируется). Фолбэк без каталога —
  ровно 7 и 7 текущих имён (FALLBACK_*), иначе мир в песочнице уедет.
  `tileAt`: `hash2(x, y, GLOBAL_SEED ^ 0xabcdef) % mobGroupCount()` —
  значения не меняются. Экспорт: −MOB_GROUP_COUNT/MOB_GROUP_NAMES,
  +mobGroupCount/mobGroupName.
* `src/combat.js`: `GROUP_RECIPES` — из каталога при ЗАГРУЗКЕ (5-й
  аргумент UMD; браузер — `Game.MobGroupsData`), `FALLBACK_GROUP_RECIPES`
  = старый литерал (vm-песочницы combat-ui). Таблица MOB_TYPES и
  createCombat НЕ тронуты (000062 смержит зеркало MOB_TYPES — diff
  combat.js держим фокусированным: только UMD + блок GROUP_RECIPES +
  экспорт). Имя рецепта (`состав.название`) живёт в логе боя
  (`Бой: orc_camp (уровень …)`) — сохранено 1:1.
* `src/sprites.js`: `MOB_KINDS` — из каталога при загрузке (node — 2-й
  аргумент UMD; браузер — `deps.MobGroupsData` из Game), гард —
  `FALLBACK_MOB_KINDS` = старый литерал. Зависимости не добавлены
  (паттерн 000049: нет require combat.js/dungeon.js).
* Потребители имён (UMD-ловушка «G снимается один раз» — map.js
  грузится раньше всех трёх, функции переживают копирование Game):
  `src/main.js` (HUD «Осторожно: …»), `src/combat-ui.js`
  (startCombat → groupName, с гардом), `src/ui.js` (журнал квестов
  kill_group, с гардом) — `G.mobGroupName(i)`.
* `index.html`: `src/mob-groups-data.js` ПОСЛЕ `npc-data.js` и ДО
  `map.js` (~строка 294); порядок закреплён в
  tests/index-order.test.js. `loadBrowserChain` в tests/map.test.js —
  тоже с новым модулем (реальный порядок index.html).
* SPEC.md: новый top-level раздел «Архитектура хранения групп мобов»
  после «Состав групп» (раздел «Мобы»).
* Тесты: tests/mob-groups.test.js (каталог/схема/1:1/целостность/
  GENERATED/зеркала/GROUP_RECIPES/MOB_KINDS/ленивые функции/golden
  createCombat seed 42 — все 7 типов, волчья стая seed 1→3, seed 5→6),
  assets-schemas (CATALOGS += mob_groups), index-order, map (vm-фолбэк
  7/имена + ленивый подхват + инъекция искажённого каталога), sprites
  (vm-фолбэк MOB_KINDS + виды из каталога), npc-data (kill_group-квесты
  ∈ каталогу).

## Ключевые решения

1. **id = кодовый индекс группы + 1** (файл 000001 = тип 0 =
   ORC_CAMP). Индексы 0..6 — в генерации (hash2 % 7), квестах
   kill_group («группа: 0…6») и MOB_GROUP_TYPES; +1 — только в
   каталоге (паттерн assets/buildings: id = номер файла).
2. **`состав.название` = имя рецепта** ('orc_camp', …) — это строка в
   логе боя и в тестах, НЕ русское название группы. Русское имя —
   верхнеуровневое `название`.
3. **ПОРЯДОК `состав.мобы` критичен**: индекс юнита → makeMob/
   placeUnits → расстановка и очередь в бою → детерминизм. Перенос
   1:1; golden-тесты createCombat (seed 42 — все 7 типов; волчья
   стая seed 1→3 / seed 5→6) зафиксированы ДО миграции и проходят
   без изменений.
4. **Фолбэки = ровно значения master** (7/7 имён; 7 рецептов; 7
   видов) — прецедент 000055 (фолбэк 13/3/3). Кэш ПУСТОГО вывода
   запрещён (map.js): первый вызов до загрузки каталога не должен
   зафиксировать фолбэк.
5. **Сейв v1 не тронут**: проверено — группы в сейв не пишутся
   (defeatedAt — сессионный Map в main.js; квест-прогресс kill_group —
   число типа группы; grep mobGroup/group в save.js пуст) →
   CURRENT_VERSION не поднимать.
6. **Модуль данных в index.html ДО map.js**: потребители (map/combat/
   sprites/ui/combat-ui/main) обязаны видеть Game.MobGroupsData; при
   этом ленивость map.js + гарды combat.js/sprites.js делают порядок
   избыточно безопасным (vm-песочницы без модуля — фолбэки).
7. **Держать diff combat.js фокусированным ради 000062** (зеркало
   MOB_TYPES): только UMD-обёртка + блок GROUP_RECIPES; таблица
   MOB_TYPES и createCombat не трогать → rebase чистый.
8. map.js общий с параллельным 000056 (TERRAIN_NAMES/PASSABLE) —
   порядок мержа по memory/000053: 000056 ДО 000057, 000057
   ребейзится поверх 000056.

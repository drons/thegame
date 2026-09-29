# 000059: items/visuals — JS-зеркала генерируются из JSON-каталогов

Статус: выполнено (отчёт — tasks/result/000059.md, задача —
tasks/done/). Дочерняя к 000053 (аудит дублирования данных).

## Что сделано

* `scripts/sync-items-data.js` (новый) — перегенерирует
  `src/items-data.js` ЦЕЛИКОМ из `assets/items/0000*.json` (source of
  truth). Шапка «GENERATED — не править руками». Идемпотентен
  (byte-identical), атомарная запись `writeFileAtomic` (конвенция
  000054), читабельные ошибки (id не по паттерну `[a-z][a-z0-9_]*`,
  дубли id, ключи вне схемы → exit 1). npm `sync:items`.
* `scripts/sync-visuals-data.js` (новый) — генерирует
  `src/visuals-data.js` из `assets/visuals/0000*.json`. Конвенция
  `id = номер файла` (000001.json → id 1); множество id — ровно
  {1..N} (уникальность схемой не выразима). npm `sync:visuals`.
* `src/items-data.js` — перегенерирован (42 записи 1:1; id НЕ
  перенумерованы — сейв v1, 000031). **Контракт модуля — плоское
  `Game.ITEMS`** (не ItemsData): items.js и все vm-цепочки читают
  G.ITEMS — ноль правок в потребителях.
* `src/visuals-data.js` (новый) — униформный `{ VISUALS }`: браузер —
  `Game.VisualsData`, node — `require()`.
* `src/sprites.js` — литерал `const VISUALS = [...]` УБРАН; данные —
  из data-модуля (node: 3-й аргумент UMD; браузер: `deps.VisualsData`
  при загрузке). Гард без data-модуля — ТИХАЯ деградация до пустого
  каталога (паттерн 000058): `tileVisuals → []`, `allAssetPaths`
  работает, warn/error нет. VISUALS_SEED / MAX_VISUALS_PER_TILE /
  VISUALS_MIN_ZOOM — логика рендера, ОСТАЛИСЬ в sprites.js; формулы
  tileVisuals не тронуты (детерминизм — golden).
* `index.html` — `visuals-data.js` ДО `sprites.js` (закрыто
  tests/index-order.test.js).
* `package.json` — `sync:items`, `sync:visuals`. tests/sync-all.test.js
  (000054) подхватывает их АВТОМАТИЧЕСКИ по конвенции sync-*.js —
  CI-дрейф-гейт без правок.
* `SPEC.md` — «Предметы» (items-data генерируется) + новый раздел
  «Архитектура хранения (каталог assets/visuals)».

## Ключевые решения

1. **Плоский Game.ITEMS сохранён** для items (контракт не менялся),
   но для visuals введён namespace `Game.VisualsData` (новый модуль,
   единственный потребитель — sprites.js). Не смешивать: G.ITEMS —
   плоское поле, G.VisualsData — объект-модуль.
2. **Гард без data-модуля — пустой каталог, молча** (не fallback-
   копия и не console.error): vm-песочницы (tests/combat-ui.test.js,
   tests/map.test.js) грузят sprites.js без data-модулей. Fallback-
   копия = возврат дублирования данных (анти-дрейф grep-тест запрещает
   спрайт-пути каталога в источнике sprites.js); console.error = шум
   в npm test. Реальный браузер в гард не попадает: порядок
   index.html закреплён тестом, а «вакуумность» цепочки — тестом
   «vm, цепочка index.html» (S.VISUALS == JSON-каталогу, tileVisuals
   не пуст на сетке трав).
3. **Числа записей — ДИНАМИЧЕСКИЕ** (items — 42, visuals — 13 на
   момент задачи): тесты считают от каталога. Текст задачи говорил
   «32» — устарело (каталог рос после аудита 000053).
4. **Данные 1:1, id без изменений**: сейв v1 (npcStocks/quests по id
   предмета) не ломается; визуалы в сейв не пишутся (разброс
   детерминирован seed VISUALS_SEED + id) — версию сейва НЕ
   поднимали.
5. **UMD-ловушка (000038)**: sprites.js снимает `Game.VisualsData`
   ОДИН раз при загрузке — visuals-data.js обязан стоять в index.html
   ДО sprites.js (тест index-order). Сдвиг порядка = пустой каталог
   МОЛЧА (декорации пропадут; регрессию ловит только тест цепочки).

## Мерж

После старта ветки (база 483df47) на master смержились 000035,
000069, 000102, 000070. Пересечения: `src/sprites.js` (000069 добавил
DUNGEON_FLOOR_FRAMES/dungeonFloorFrame — регион ДРУГОЙ, чем VISUALS),
`tests/sprites.test.js` (+283 строки 000069), `package.json`,
`SPEC.md`. Конфликты ожидаются аддитивные. Перед мержем — ребейз на
актуальный мастер + полный `npm test`.

# 000043: клавиши подземелья — маппинг из src/controls.js

Задача: заменить локальные таблицы клавиш в src/dungeon-ui.js и
src/combat-ui.js на маппинг из src/controls.js (000028).

## Что осталось фактически

Файл задачи говорил «в обоих файлах», но боевая часть закрылась
задачей 000048 ДО 000043 (мердж в master): локальный `keyDir` в
src/combat-ui.js удалён вовсе, движение боя строится структурно из
`Game.CODE_DIRS × Game.DIR_DELTA` (src/combat-keys.js). Поэтому 000043
коснулась ТОЛЬКО src/dungeon-ui.js; по бою — только проверка
(тесты combat-keys.test.js + index-order.test.js это уже фиксировали).

## Решение (src/dungeon-ui.js)

* `keydown`: `keyDir(e.code)` → `G.deltaForEvent(e)` (эквивалент
  `G.deltaForMoveKey(G.moveKeyForEvent(e))`), локальная таблица
  `keyDir` и устаревший комментарий удалены.
* Поведение: стрелки / физические WASD (=ЦФЫВ по e.code) — без
  изменений; ПЛЮС фолбэк по `e.key` (ц/ф/ы/в, без учёта регистра)
  для виртуальных клавиатур (code «Unidentified») — подземелье
  согласовано с миром (tryMove в main.js, 000028).
* Приоритет — `e.code` над `e.key` (физическая клавиша авторитетнее
  символа раскладки); латинские символы НЕ в KEY_DIRS (фолбэк только
  на ц/ф/ы/в).
* Семантика `preventDefault/stopPropagation` не менялась: вызывается
  ТОЛЬКО на распознанных клавишах перемещения (main.js ранним
  return'ит при активном dungeonUI — не ломать, иначе двойной шаг
  или проглоченные клавиши).

## Страховка порядка загрузки

UMD-ловушка: `const G = globalThis.Game` снимается ОДИН раз при
загрузке; если controls.js загрузился ПОЗЖЕ, `G.deltaForEvent` через
захваченный G недоступен НАВСЕГДА — тихо сломанное управление.
Домашний паттерн (ui.js, combat-keys.js, combat-ui.js):

* guard в dungeon-ui.js: `!G || !G.createDungeon || !G.deltaForEvent`
  → `console.error` (видимая ошибка, не молчание) + return;
* `tests/index-order.test.js`: ассерт `src/controls.js` ДО
  `src/dungeon-ui.js` (порядок 315→320 в index.html ранее не был
  закреплён транзитивно) + dungeon.js/dungeon-ui.js в списке
  «нужные модули подключены».

## Тесты

* `tests/dungeon-ui.test.js` (новый; vm-песочница + DOM-стаб по
  паттерну combat-ui.test.js, state — минимальный литерал, ядро
  покрыто dungeon.test.js):
  - красные (до реализации): фолбэк e.key ц/ф/ы/в (code
    «Unidentified»), регистр e.key не важен (Shift+Ц), структурный
    (нет `function keyDir`, есть `deltaForEvent`), битый порядок
    (без controls.js → console.error);
  - регрессия: стрелки/WASD по e.code (одно нажатие = один шаг,
    preventDefault+stopPropagation), приоритет e.code над e.key
    (KeyW с key «я» — вверх), не-перемещающие клавиши — без onMove/
    preventDefault/ререндера, до start()/после close() — не
    обрабатывается, активный бой выше по стеку — не перехватывается
    (реальная боевая цепочка combat-ui.js в том же Game).

## SPEC.md

Не описывает биндинги клавиш (только [E] для диалога NPC) — изменений
нет; клавиши живут в комментариях источников и в memory.

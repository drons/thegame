# 000048: боевые клавиши — единая таблица (src/combat-keys.js)

Единый источник биндингов боя: `src/combat-keys.js` — UMD-модуль без DOM
(браузер: `Game.CombatKeys`, node: `require`). `COMBAT_KEYS` —
e.code → `{type:'move', dx, dy}` | `{type:'action', action, primary?}`;
`resolveCombatKey(code, state)` — чистая функция по СНИМКУ
`{phase, result, canDo}` (canDo — результат `G.canDoAction`, 000037);
`describeCombatKeys()` — данные для подписей кнопок; `keyLabel()`.
keydown и кнопки combat-ui.js строятся ИЗ таблицы — хардкода нет.

## Итоговая таблица клавиш боя

| e.code | значение | рус. буква | примечание |
|---|---|---|---|
| ArrowUp/Down/Left/Right | move | — | те же коды, что в мире (000028) |
| KeyW / KeyA / KeyS / KeyD | move (Ц/Ф/Ы/В) | | KeyA — влево, как в мире (ОСВОБОЖДЕН от «Удара») |
| KeyJ | action attack | О | ПЕРВИЧНЫЙ «Удар» (перенесён с KeyA) |
| KeyK | action attack | Л | дубль KeyJ |
| KeyQ | action fire | Й | |
| KeyR | action heal | К | |
| KeyB | action block | И | |
| KeyE | action quickItem | У | в бою НЕ диалог NPC (toggleNpcDialog гасится боем) |
| KeyT | action invItem | Т | ПЕРВИЧНЫЙ «Предмет» |
| KeyU | action invItem | Г | дубль KeyT |
| KeyF | action flee | А(кир.) | |
| Space | action endTurn | — | после боя — закрытие (ветка UI ДО таблицы) |

Вне таблицы (UI combat-ui.js): Escape — закрыть, только если c.result;
Enter — закрыть, только если c.result (как Space).

Подписи кнопок (из таблицы): Удар [J], Огонь [Q], Исцел. [R], Блок [B],
Быстрый предмет [E], Предмет [T], Побег [F], Конец хода [Space].

## Решения

* **KeyA → движение** (полностью, как в мире); «Удар» → KeyJ (правая
  рука, «джойстик» у Space). Дубли: KeyK=KeyJ (attack), KeyU=KeyT
  (invItem) — новые физические клавиши для русской раскладки. Каждая
  клавиша — ровно одно назначение.
* **ВАЖНО (противоречие файла задачи)**: строка 50 tasks/pending/
  000048.md говорит про J «на русской раскладке это клавиша Л» — НЕВЕРНО
  по собственной же модели задачи (строка 17: Л=KeyK). Решение — по
  модели: **на KeyJ в русской раскладке «О», «Л» — на KeyK**.
* **Движ. строки — переиспользование controls.js** (`CODE_DIRS ×
  DIR_DELTA`, node — require, браузер — `Game.CODE_DIRS`), не
  дублирование: инвариант «движение в бою = движение в мире»
  структурный. Порядок index.html: controls.js → combat-keys.js →
  combat-ui.js (регрессия — tests/index-order.test.js, vm-симуляция;
  битый порядок — console.error в обоих модулях).
* **resolveCombatKey**: `state` — СНИМОК (плоский объект: phase, result,
  canDo), чистота — детерминированна в node; непure-часть (canDoAction
  по живому c) делает UI. Move не спрашивает canDo/phase — причины
  отклонения позиции-зависимы, их возвращает ядро playerMove
  (`c.move` → reason → c.log). Fail-safe без canDo — формулировки те же,
  что checkTurn в ядре: 'over' — «бой закончен», фаза не 'player' —
  «не ваш ход», 'player' без canDo — «сейчас нельзя»; действие НИКОГДА
  не выполняется молча. result → 'none' (закрытие — логика UI).
* **Невозможное действие/шаг — reason в c.log** (интеграция 000037);
  неудачный шаг раньше был тихим — теперь «стена»/«тут стоит моб»/
  «шаги на ход исчерпаны» и т.д. видны в журнале.
* **dungeon-ui.js — только 4 мёртвые записи удалены** (кириллические
  e.code не существуют). Полный перевод на Game.moveKeyForEvent/
  deltaForMoveKey — задача 000043; после 000048 в 000043 фактически
  остаётся только dungeon-ui.js (боевой keyDir удалён вовсе).
* **После боя** не-закрытые не-мапнутые клавиши не «проглатываются»
  (handled=false) — без влияния на геймплей (main.js ранним return'ит).

## Наблюдение (вне скоупа)

main.js: `KeyI → playerUI.toggle()` стоит ДО раннего return по
`combatUI.isActive()` — в бою Ш переключает панель персонажа поверх
оверлея. Отдельная задача, если решим чинить.

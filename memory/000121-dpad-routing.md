# 000121 — Контракт тач-роутинга (для будущих тач-фоллов-апов)

Краткий контракт маршрутизации on-screen-D-pad (задача 000121) для
будущих задач: новые экраны тач-роутинга, кнопка «Блок», подписи
кнопок по экранам, переносы/рефакторинг. Полный контекст —
memory/000121-touch-dungeon-combat.md.

## Модель

ОДИН D-pad (000018) на вьюпорте. Маршрутизация — ЧИСТАЯ функция в
src/controls.js; main.js — только КЛЕЙ (колбэки touchControls.init).
Роутинг решается в МОМЕНТ СОБЫТИЯ по СНИМКУ активных оверлеев.
Новых модулей/скриптов нет (прецедент 000123/000124).

## Функции ядра (src/controls.js, экспорт плоский: Game.*)

* `routeTouchScreen(screens) → 'combat' | 'dungeon' | 'map'`
  * screens — снимок `{combat?, dungeon?, dialog?, building?}`
    (boolean). Приоритет: **combat > dungeon > map**.
  * dialog/building — map-локальные оверлеи (npcUI/buildingUI):
    принимаются в снимке, НО НЕ ПОТРЕБЛЯЮТСЯ (поведение при них =
    как на карте: движение гейтится frame-циклом main.js
    `!inNpc && !inBuilding`, [E] закрывает их через
    buildingActions.toggle()). Тесты пинят: dialog не меняет
    результат (3 пары из 8 комбинаций).
  * Мусор/не-boolean → 'map' (жёсткие `=== true`; деградация, не
    крах). Чистая: без Game/DOM, без мутации аргумента.
* `touchKeyCode(action) → string|null` + таблица `TOUCH_KEY_CODES`:
  * up/down/left/right → 'ArrowUp'/'ArrowDown'/'ArrowLeft'/
    'ArrowRight' (КАНОН направлений — стрелки; WASD — физический
    алиас, resolveCombatKey для всех 8 кодов движения идентичен);
  * interact → 'KeyE' (в бою = quickItem, как клавиша [E]);
  * 'inventory'/неизвестные/null → null ([I] НЕ роутится —
    onInventory = эквивалент KeyI, панель поверх любого оверлея).
  * Инвариант: `CODE_DIRS[touchKeyCode(dir)] === dir` (пин R2).

## Снимок экранов (клей main.js, в момент события)

```
touchScreens() = {
  combat:   !!(G.combatUI && G.combatUI.isActive()),
  dungeon:  !!(G.dungeonUI && G.dungeonUI.isActive()),
  dialog:   !!(G.npcUI && G.npcUI.isActive()),
  building: !!(G.buildingUI && G.buildingUI.isActive()),
}
```
Ленивое чтение + guards; вызывается ТОЛЬКО в колбэках (не при
загрузке — пин vm-boot errors.length===0).

## Диспетч по экранам (клей main.js, тач-блок L845-891)

| Колбэк | combat | dungeon | map (включая dialog/building) |
|---|---|---|---|
| onHold(dir) | `G.combatUI.handleCode(G.touchKeyCode(dir))` — тап = ОДНО действие, БЕЗ повтора | `G.dungeonUI.touchHold(dir)` — тап = шаг, удержание = повтор (rAF, move_interval_ms) | `keys.add('touch:' + dir)` — как 000018 (frame-гейт) |
| onRelease(dir) | (нечего останавливать) | `G.dungeonUI.touchRelease(dir)` | — |
|   | ВСЕГО: `touchRelease(dir)` + `keys.delete('touch:'+dir)` — БЕУСЛОВНО, оба идемпотентны (клей БЕЗ СОСТОЯНИЯ) | | |
| onInteract | `G.combatUI.handleCode('KeyE')` — quickItem | явный no-op (кнопка не скрывается) | `G.buildingActions && G.buildingActions.toggle()` |
| onInventory | БЕЗ ИЗМЕНЕНИЙ (000123): `G.playerUI.toggle(undefined, 'inventory')` | | |

Входы UI-модулей:
* `G.combatUI.handleCode(code) → bool` (consumed) — ЕДИНСТВЕННЫЙ
  путь «code → действие боя» (клавиатура + тач, 1:1 из keydown,
  000121). render() внутри при consumed.
* `G.dungeonUI.touchHold(dir)` / `touchRelease(dir)` — тап = один шаг
  (тело keydown 1:1: deltaForMoveKey('touch:'+dir) → ctx.onMove →
  render); повтор — в rAF-цикле dungeon-ui (интервал — live
  move_interval_ms, дефолт 420, кламп ≥ 60; «Ловкий шаг» НЕ
  применяется); гарды каждого шага: isActive + combatUI.isActive.
  Состояние (touchHoldDir/lastTouchHoldStepAt) — в dungeon-ui,
  сброс в start()/close().

## Инварианты роутинга

* БОЙ: повтор НЕТ (каждое действие тратит ход); slide = одно
  действие на каждое новое направление (аналог keydown-цепочки).
* ПОДЗЕМЕЛЬЕ: повтор ДА (аналог OS auto-repeat клавиатуры); при
  начале боя повтор стоптится гардом БЕЗ выпуска боевого действия.
* КАРТА: виртуальные клавиши 'touch:<dir>' в том же Set, что
  настоящие (deltaForMoveKey понимает префикс); frame-гейт
  (!inCombat/!inDungeon/!inNpc/!inBuilding) — без изменений.
* z-лестница: .char-panel 10 < .fs-btn 15 < оверлеи 20 <
  #touch-controls 30 (пин ui-panel.test.js: 30 > 20). Оверлей с
  z > 30 перекроет контролы — осознанный выбор. ОСОЗНАННЫЕ
  следствия (ревью 2026-10-02): (а) в ROW (альбомных) вьюпортах
  D-pad перекрывает левый нижний угол боевого canvas (3.5–21% поля
  в типовых вьюпортах): конкретный клик-выбор цели в этой зоне
  невозможен, тап там = движение (в бою — тратит ход) — отклонение
  ТЗ 000121 п.3, принятое осознанно (вариант (c) ревью); правка —
  отдельная UI-задача; (б) открытая .char-panel (z-10) частично
  перекрыта кнопками [E]/[I] (и D-pad) — не ломает панель.
  Детали: memory/000121-touch-dungeon-combat.md, раздел «Известное
  ограничение (осознанное отклонение)».
* Клей БЕЗ СОСТОЯНИЯ: onRelease — два идемпотентных вызова; таймеров
  в main.js НЕТ (повтор — в rAF owning-модуля; setInterval в
  vm-песочницах dungeon-ui нет — это НЕ опция).

## Рецепт: новый экран в тач-роутинге

1. Снимок: новое поле в touchScreens() (main.js) + в jsdoc/схеме
   routeTouchScreen.
2. Приоритет: если экран выше карты — добавить проверку в
   routeTouchScreen (ПОСЛЕ combat/dungeon, если он ниже их) + красные
   тесты всех новых комбинаций (tests/controls.test.js).
   Если экран map-локальный оверлей (тип dialog/building) — поле в
   снимке, роутер игнорирует (пин «не меняет результат»).
3. Маппинг: если экрану нужны коды — новые коды в TOUCH_KEY_CODES
   (только если это реальные e.code; иначе свой чистый маппинг в
   controls.js) + структурный тест-инвариант.
4. Вход UI-модуля: handleCode-подобная функция (1:1 из keydown,
   consumed-bool, render внутри) — паттерн G.combatUI.handleCode;
   для «шаговых» экранов — touchHold/touchRelease-паттерн
   G.dungeonUI (повтор в rAF-цикле модуля, гарды на каждый шаг,
   сброс в start/close).
5. Клей: ветки в onHold/onRelease/onInteract (+guards
   `typeof … === 'function'`); onRelease — идемпотентные вызовы,
   без нового состояния.
6. Красные тесты: роутер (controls), маппинг (combat-keys/controls),
   vm-песочница UI-модуля (тап = одно действие/шаг; гарды).
   npm test внутри worktree.

## Ссылки

* ТЗ: tasks/pending/000121.md; память: memory/000121-touch-
  dungeon-combat.md; предшественники: memory/000018-touch-controls.
  md, memory/000123-touch-buttons.md (контракт init(h) кнопок),
  memory/000048-combat-keys.md (единая таблица боя),
  memory/000063-base-move-speed.md (move_interval_ms).
* Пины: tests/index-order.test.js (порядок скриптов), tests/
  building-actions.test.js BA7 ('G.buildingActions' + '.toggle('),
  tests/ui-panel.test.js (z-лестница 10/15, + 30 > 20 — 000121),
  tests/combat-keys.test.js (структурный main.js keydown).

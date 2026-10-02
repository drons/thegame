# 000121 — Тач-D-pad: роутинг combat > dungeon > map (чистая функция роутера)

Дата: 2026-10-02. Worktree: .worktrees/task-000121, ветка task/000121,
база master 2b4aa92 («Мердж: task/000123»). Статус: стадия
«Проектирование» завершена — архитектура и контракты финальны (три
анализа a1/a2/a3 согласованы; расхождения закрыты решениями D1-D12,
см. «Решения»). Базовый npm test в worktree: 1329/1329 (замер a3;
повторно проверять в красной фазе). ТЗ: tasks/pending/000121.md
(сверено с master: строки ТЗ актуальны после 000123/000124/000125/
000127/000128/000129; дельты ТЗ↔код — раздел «Дельты ТЗ ↔ код»).
Контракт роутинга для будущих тач-задач — отдельный файл
memory/000121-dpad-routing.md.

## Решения (ТЗ «решить и задокументировать» + расхождения a1/a2/a3)

* **D1. Роутер — `routeTouchScreen(screens) → 'combat'|'dungeon'|'map'`
  в src/controls.js** (чистая функция, аргумент-снимок). Почему: ТЗ
  требует «решение — чистая функция, main.js — только клей»; controls.js
  — беззависимое ядро, грузится ПЕРВЫМ (index.html L636), вся тач-
  лексика (DIRS/TOUCH_ACTIONS/CODE_DIRS) уже там; трёхзначного
  результата достаточно, т.к. маппинг действия→код — отдельная чистая
  функция (D2). Отклонено: a1 `routeTouchAction(action, screens)` с
  богатым результатом {screen, code|dir|action} (связывает экраны и
  клавиши в одной функции; матрица тестов ТЗ — про ЭКРАНЫ), a3
  `touchScreenFor → …|null` c dialog→null (см. D8).
* **D2. Маппинг тач→code — `touchKeyCode(action)` + таблица
  `TOUCH_KEY_CODES` в src/controls.js** (НЕ в combat-keys.js):
  up/down/left/right → ArrowUp/ArrowDown/ArrowLeft/ArrowRight,
  interact → 'KeyE', 'inventory'/неизвестные/null → null. Почему:
  «какой code-клавиатуры соответствует тач-действию» — лексика ввода
  (controls.js владеет CODE_DIRS/DIR_DELTA), структурный тест
  `CODE_DIRS[touchKeyCode(dir)] === dir` живёт в одном модуле;
  combat-keys.js НЕ ТРОГАЕТСЯ (ТЗ «без дублирования таблицы» выполнено
  тем, что возвращаемые коды идут в существующую resolveCombatKey).
  Канон направлений — СТРЕЛКИ: CODE_DIRS имеет 8 кодов на 4 направления
  (стрелки+WASD); resolveCombatKey для всех 8 идентичен (одна таблица),
  стрелки — каноничная половина «того же code, что клавиша» (ТЗ п.3).
* **D3. Вход в бой — `G.combatUI.handleCode(code)`**: тело keydown
  (combat-ui.js L296-339) выносится 1:1 в handleCode (consumed =
  прежний handled; `if (consumed) render()` ВНУТРИ), keydown — тонкая
  обёртка `if (handleCode(e.code)) { e.preventDefault();
  e.stopPropagation(); }`; handleCode в экспорт (поверхность
  { startCombat, handleCode, isActive, current }). Почему: единый путь
  «code → действие боя» для клавиатуры и тача (ТЗ п.3); имя handleCode
  (отклонено a1 pressCode/handleCombatCode: нейтральное имя единого
  пути; render в ОДНОМ месте, а не в двух обёртках).
* **D4. Подземелье: `G.dungeonUI.touchHold(dir)` /
  `G.dungeonUI.touchRelease(dir)`; тап = 1 шаг, повтор при удержании —
  в СУЩЕСТВУЮЩЕМ rAF-цикле dungeon-ui.js** (hook в tick() перед
  step()). Почему: (а) setInterval в vm-песочнице dungeon-ui НЕТ
  (проверено a1), rAF/performance-стабы УЖЕ ЕСТЬ (T.t управляем) →
  повтор vm-тестируем, а не «клей + коммент»; (б) состояние удержания
  (touchHoldDir/lastTouchHoldStepAt) и rAF-цикл — в одном модуле
  (инкапсуляция); main.js остаётся без таймеров (glue-only, ТЗ).
  Интервал — глобальная настройка move_interval_ms (000063), ЖИВОЕ
  чтение liveGame() в момент вызова (дефолт 420 мс; кламп ≥ 60 =
  MIN_MOVE_INTERVAL_MS, motion.js L134). «Ловкий шаг» (stepIntervalMs)
  повтор НЕ ускоряет — как клавиатура: подземелье не consume'ит
  навык-интервал (осознанно; точка расширения — touchStepMs()).
  Гарды НА КАЖДЫЙ шаг (и тап, и повтор): isActive() +
  liveGame().combatUI.isActive() (бой выше по стеку, паттерн keydown
  L188) — бой начался во время удержания → повтор СТОПТИТСЯ и боевые
  действия НЕ выпускаются (ТЗ п.3: в бою повтор НЕЛЬЗЯ — каждое
  действие тратит ход; игрок тапает).
* **D5. Клей main.js — БЕЗ СОСТОЯНИЯ**: onHold → маршрутизация в МОМЕНТ
  события (снапшот touchScreens()): combat → handleCode(touchKeyCode
  (dir)) — тап = одно действие, повтора нет; dungeon → touchHold(dir);
  map → keys.add('touch:'+dir) (как 000018). onRelease →
  `G.dungeonUI.touchRelease(dir)` + `keys.delete('touch:'+dir)` —
  БЕУСЛОВНО, оба вызова идемпотентные no-op на «чужом» экране (нет
  отслеживания маршрута, нет утечек: повтор живёт в dungeon-ui и
  гаснет там же при close()/бое; 'touch:'+dir из keys — удалён всегда).
  onInteract → combat: handleCode('KeyE') (quickItem); dungeon: явный
  no-op; map: `G.buildingActions && G.buildingActions.toggle()` (как
  сейчас; литерал `.toggle(` — пин BA7). onInventory — БЕЗ ИЗМЕНЕНИЙ
  (000123). Почему без route-tracking (отклонено a2 touchHoldRoute):
  D-pad держит ОДНО направление (ui.js heldPointer), оба вызова
  onRelease безопасны на любом экране — меньше состояния в клею.
* **D6. [E] в подземелье — NO-OP, кнопка НЕ скрывается.** Почему:
  скрытие = новый per-screen DOM-API в ui.js (зона 000123) + проводка
  в 4 точках (старт/конец боя, вход/выход подземелья/города) —
  node-нетестируемый клей без функциональной выгоды; текущее поведение
  УЖЕ no-op (self-gate buildingActions.toggle()); игрок понимает [E] =
  «действие на тайле», в подземелье действий нет; [I] работает поверх
  (эквивалент KeyI — осознанное поведение 000048/000123).
* **D7. Отдельная кнопка «Блок» — НЕТ** (ТЗ п.3 «при необходимости»):
  боевой UI уже имеет 8 кликабельных кнопок всех действий (000124,
  сетка .combat-actions: Удар/Огонь/Исцел./Блок/Быстрый предмет/
  Предмет/Побег/Конец хода) — «прочие действия — клики» выполнено;
  новых кнопок/ассетов НЕТ (deepEqual TOUCH_ACTIONS 000123 — зелёный).
* **D8. Диалог/оверлей постройки НЕ меняют роутинг** (отклонено a3
  dialog→null): это map-локальные оверлеи — поведение при них = как на
  карте: направление ложится в keys (frame-гейт !inNpc && !inBuilding
  в main.js L1392 сам подавляет движение), [E] → toggle() сам
  закрывает диалог/оверлей (эквивалент клавиши: KeyE-ветка main.js
  L809-812 стоит ДО гейтов). Почему: ТОЧНОЕ сохранение текущего
  поведения (dialog→null делало [E] no-op под диалогом — РЕГРЕССИЯ
  против клавиши); frame-гейт не дублируется в роутере (разделение:
  роутер — экран, frame-гейт — движение карты). Снимок ВСЁ ЖЕ несёт
  поля dialog/building — роутер их игнорирует (жёсткие `=== true`),
  тесты пинят «dialog не меняет результат» (3 пары из 8 комбинаций).
* **D9. z-index #touch-controls 5 → 30** (лестница: .char-panel 10 <
  .fs-btn 15 < .combat-overlay/.dungeon-overlay 20 < #touch-controls
  30). Почему: ТЗ п.5 — оверлеи боя/подземелья не перекрывают
  контролы. Контейнер pointer-events: none — события перехватывают
  ТОЛЬКО .tc-dpad/.tc-action (auto) → кнопки оверлеев, canvas выбора
  цели, канвас подземелья кликабельны, кроме самих контролов. fs-btn
  не перекрывается (bottomInset раскладки, 000123). Документированное
  визуальное следствие (не баг): в бою контролы лежат поверх НИЖНЕЙ
  части боевой панели (журнал — read-only текст); панель подземелья
  (top-right, L501-507) с контролами не пересекается; D-pad под
  диалогом — инертен (frame-гейт) — идентично клавиатуре. ЕЩЁ два
  осознанных следствия лестницы (ревью 2026-10-02): (а) в ROW
  (альбомных) вьюпортах D-pad перекрывает левый нижний угол боевого
  CANVAS (портретные не задеты) — измерено, ОСОЗНАННОЕ ОТКЛОНЕНИЕ от
  ТЗ п.3, раздел «Известное ограничение (осознанное отклонение)»;
  (б) .char-panel (z-10) НИЖЕ 30: при открытой панели персонажа/
  инвентаря кнопки [E]/[I] (и D-pad в схеме touch) рисуются поверх
  её правого нижнего угла и перехватывают тапы в этой зоне (напр.,
  390×844: [I] x[296..374] y[660..738] целиком, [E] y[750..828] —
  частично, над нижней кромкой панели y ≤ 788). Не ломает панель
  (остаётся рабочей; тап [I] = toggle — закрывает, согласованно) —
  следствие того, что ТЗ требует z > 20, а панель 10; смягчение
  (скрытие контролов при открытой панели) — новая проводка main.js,
  ТЗ не требует — НЕДЕЛАНО осознанно.
* **D10. НОВЫХ МОДУЛЕЙ / СКРИПТОВ / АССЕТОВ / SETTINGS-КЛЮЧЕЙ НЕТ**:
  роутер+маппинг — в controls.js (ТЗ допускает «controls.js или новый
  модуль» — выбран существующий), повтор — в существующем rAF-цикле,
  интервал — существующий move_interval_ms (контракт 000098: ключи
  SETTINGS — явные решения; новый ключ не нужен), маппинг боя —
  существующие коды. Почему: минимум дельты, нет новых пинов
  index-order, нет UMD-ловушек (000038), vm-песочницы подхватывают
  правки автоматически (цепочка из index.html).
* **D11. Детерминизм/сейвы/RNG — НЕ ТРОГАЮТСЯ**: тач вызывает те же
  пути ядра (ctx.onMove → main.js dungeonOnMove →
  G.locations.dungeonMove; handleCode → resolveCombatKey →
  c.move/runAction) с теми же аргументами; содержимое шага
  время-независимо (now в dungeonMove — только глейд мувера, L286);
  порядок RNG-вызовов (wanderStep/сундуки) не зависит от ИСТОЧНИКА
  шага; новых полей сейва нет.
* **D12. [I] НЕ роутится**: onInventory без изменений (000123) —
  эквивалент KeyI: панель поверх ЛЮБОГО оверлея (main.js L805-808 —
  KeyI выше всех гейтов; задокументировано 000048/000123). В
  touchKeyCode('inventory') → null — контракт-гард, не крах.

## Что добавлено / перенесено

* **Добавлено:**
  * src/controls.js (вставка ПОСЛЕ touchActionAt L271, ПЕРЕД return
    L273; +≈55 строк): `TOUCH_KEY_CODES` (таблица),
    `touchKeyCode(action)`, `routeTouchScreen(screens)` + jsdoc;
    экспорт L273-277 += 3 имени. TOUCH_ACTIONS/layoutTouchControls/
    touchActionAt/deltaForMoveKey/остальное — НЕ ТРОГАЮТСЯ.
  * src/combat-ui.js (+≈28/−≈14): `handleCode(code)` (тело keydown
    L296-339 ПЕРЕНОСИТСЯ, не переписывается; render() перенесён внутрь
    — `if (consumed) render(); return consumed;`), keydown — обёртка;
    G.combatUI (L755-840) += handleCode.
  * src/dungeon-ui.js (+≈60): модульные `let touchHoldDir/
    lastTouchHoldStepAt`, `touchStepMs()`, `touchHoldStep(dir, now)`,
    `touchHold(dir)`, `touchRelease(dir)` + hook в tick() (L532-535,
    ПЕРЕД step()) + сбросы в start() (L558) и close() (L571) +
    G.dungeonUI (L537-575) += touchHold, touchRelease. keydown
    L186-195 — БУКВАЛЬНО НЕ ТРОГАЕТСЯ.
  * src/main.js (+≈35/−≈6): ПЕРЕПИСАН ТОЛЬКО тач-блок L845-891 (коммент
    000121 + `touchScreens()` + onHold/onRelease/onInteract под
    роутер; onInventory — дословно как 000123). keydown/keyup/blur
    (L804-843), tryMove (L898), enterLocation/startLocationUI/
    exitLocation/dungeonOnMove/cityOnMove (L985-1060), frame-гейт
    (L1383-1436), MOVE_INTERVAL_MS (L58-62) — НЕ ТРОГАЮТСЯ.
  * index.html (±2): L188 `z-index: 5` → `z-index: 30` + обновление
    коммент-блока L178-184 (лестница 10/15/20/30, 000121).
    Script-тегов/классов/ассетов НЕТ.
* **Перенесено:** тело keydown combat-ui L296-339 → handleCode (1:1,
  см. D3).
* **НЕ ТРОГАЕТСЯ:** src/combat-keys.js (единая таблица), src/ui.js
  (IIFE touchControls — контракт init(h) без изменений),
  src/building-actions.js (self-gate toggle), tests: все пины
  (см. «Тесты» — идут без правок, кроме техправки коммента + нового
  z-пина).

## Контракты и границы

### `routeTouchScreen(screens)` — src/controls.js (ЧИСТАЯ)

* screens — СНИМОК (обычный объект) активных оверлеев в МОМЕНТ
  СОБЫТИЯ (собирает клей): `{combat?, dungeon?, dialog?, building?}`.
  Поля dialog/building — map-локальные оверлеи: принимаются, НО НЕ
  ПОТРЕБЛЯЮТСЯ (D8) — результат с ними = без них.
* Приоритет (ТЗ): `combat === true` → 'combat'; иначе
  `dungeon === true` → 'dungeon'; иначе → 'map'.
* Мусор/не-boolean ({combat:'yes'}, 42, 'x', null, undefined) →
  'map' (жёсткие `=== true`, стиль isTouchDevice L169; деградация к
  текущему поведению — карта, НЕ крах).
* Возврат — ровно 3 значения: 'combat' | 'dungeon' | 'map'.
* ЧИСТО: без Game/document/navigator, без мутации аргумента.

### `touchKeyCode(action)` / `TOUCH_KEY_CODES` — src/controls.js

* `TOUCH_KEY_CODES = { up: 'ArrowUp', down: 'ArrowDown', left:
  'ArrowLeft', right: 'ArrowRight', interact: 'KeyE' }` — ЕДИНАЯ
  точка маппинга тач→e.code.
* `touchKeyCode(action)` → TOUCH_KEY_CODES[action] || null.
  'inventory', неизвестные, null/''/42 → null (D12/контракт-гард).
* Канон направлений — СТРЕЛКИ (D2): стрелки и WASD дают ОДИН
  resolveCombatKey-результат (одна таблица combat-keys), стрелки —
  каноничные.

### `G.combatUI.handleCode(code)` — src/combat-ui.js

* ЕДИНСТВЕННЫЙ путь «code → действие боя» для клавиатуры и тача.
* 1:1 с прежним keydown: guard `!isActive()` → false; Escape →
  finish if c.result; c.result → Space/Enter finish, иначе consumed
  false; иначе `G.CombatKeys.COMBAT_KEYS[code]` + снимок st
  {phase, result, canDo? (G.canDoAction)} → resolveCombatKey → move →
  logRejection(c, c.move(dx,dy)) / action → c.log.push(reason) |
  runAction / none → consumed false.
* `if (consumed) render(); return consumed;` — keydown-обёртка делает
  preventDefault/stopPropagation при consumed (поведение 1:1).
* Тап D-pad = ОДНО нажатие handleCode — БЕЗ повтора (ТЗ п.3). Slide
  (скольжение пальца: onRelease(old)+onHold(new)) = одно действие на
  каждое новое направление — аналог последовательности keydown
  (документация, не баг; каждое действие тратит ход — ответственность
  игрока).

### `G.dungeonUI.touchHold(dir)` / `touchRelease(dir)` — src/dungeon-ui.js

* `touchHold(dir)` — ТАП: один вызов touchHoldStep(dir, nowMs()); при
  успехе запоминает holdDir/lastHoldStepAt. Повтор — в tick():
  `t − lastHoldStepAt >= touchStepMs()` → touchHoldStep; неудача
  гарда → touchHoldDir = null (стоп).
* `touchHoldStep(dir, now)` — тело keydown 1:1 (без события):
  guard isActive(); guard liveGame().combatUI.isActive() (бой выше по
  стеку); `live.deltaForMoveKey('touch:' + dir)` (та же функция, что
  карта-tryMove и keydown; 'touch:interact'/'touch:inventory'/
  неизвестное → null → нет шага, нет краха); `ctx.onMove(d[0], d[1])`
  (тот же колбэк, что keydown L193 = main.js dungeonOnMove) +
  render(now).
* `touchStepMs()` — liveGame().GlobalSettings.SETTINGS.move_interval_ms
  (ЖИВОЕ чтение в момент вызова — 000063; дефолт 420 при отсутствии;
  кламп ≥ 60 — MIN_MOVE_INTERVAL_MS, motion.js L134).
* Сброс touchHoldDir = null / lastTouchHoldStepAt = 0 в start() и
  close() — утечек между подземельями нет; close() и так гасит rAF
  (caf(rafId) ДО ctx = null).
* Повтор живёт ДОЛЬШЕ смены экрана? НЕТ: при переходе подземелье→бой
  close() (exitLocation L1014-1021) сбрасывает состояние и цикл; при
  бое БЕЗ выхода из подземелья (dungeonMove → {type:'combat'}) — гард
  combatUI.isActive() в каждом шаге стоптит повтор.

### Клей — main.js тач-блок (L845-891)

```
touchScreens() = { combat: !!(G.combatUI && G.combatUI.isActive()),
                   dungeon: !!(G.dungeonUI && G.dungeonUI.isActive()),
                   dialog: !!(G.npcUI && G.npcUI.isActive()),
                   building: !!(G.buildingUI && G.buildingUI.isActive()) }
onHold(dir):   r = G.routeTouchScreen(touchScreens())
               combat  → code = G.touchKeyCode(dir);
                        if (code && G.combatUI) G.combatUI.handleCode(code)
               dungeon → if (G.dungeonUI && typeof G.dungeonUI.touchHold
                             === 'function') G.dungeonUI.touchHold(dir)
               map     → keys.add('touch:' + dir)
onRelease(dir): if (G.dungeonUI && typeof G.dungeonUI.touchRelease
                     === 'function') G.dungeonUI.touchRelease(dir)
               keys.delete('touch:' + dir)        // оба — идемпотентно
onInteract():  r = G.routeTouchScreen(touchScreens())
               combat  → code = G.touchKeyCode('interact') // 'KeyE'
                        if (code && G.combatUI) G.combatUI.handleCode(code)
               dungeon → (no-op — D6)
               map     → G.buildingActions && G.buildingActions.toggle()
onInventory(): без изменений (000123): if (G.playerUI)
               G.playerUI.toggle(undefined, 'inventory')
```

* [E] по экранам (ТЗ п.4): бой → quickItem (handleCode('KeyE') — та
  же ветка, что клавиша KeyE у combat-ui); подземелье → no-op (D6);
  карта → buildingActions.toggle() (диалог/постройка — как сейчас,
  self-gate).
* blur (L840-843) без изменений: keys.clear() + releaseAll() → IIFE
  onRelease по каждому удержанию → touchRelease + keys.delete —
  повтор останавливается (существующая механика ui.js).
* vm-boot-песочницы: новые замыкания не вызываются при загрузке
  (колбэки — только по событиям) → errors.length===0 цел.

### CSS — index.html

* #touch-controls (L185-192): z-index 5 → 30; pointer-events: none /
  display — без изменений. Коммент-блок L178-184 — актуализирован
  (лестница 10/15/20/30, 000121; перехватывают только .tc-dpad/
  .tc-action).

## Тесты

### Красные (6 тестов; падают на master, зелёные после реализации)

* **R1** tests/controls.test.js (node, require src/controls.js; блок
  в конец файла; `routeTouchScreen, TOUCH_KEY_CODES, touchKeyCode` —
  в деструктурирующий require в шапке, неопределённые = undefined,
  падение ТОЛЬКО в телах): routeTouchScreen — ВСЕ 8 комбинаций
  {combat, dungeon, dialog}: {c,d}→'combat' (ПРИОРИТЕТ, явный
  ассерт), {c}→'combat', {d}→'dungeon', {dialog}→'map', {}→'map',
  {c,dialog}→'combat', {d,dialog}→'dungeon', {c,d,dialog}→'combat'
  (dialog не меняет результат — 3 пары); мусор null/undefined/42/'x'/
  {combat:'yes'}/{combat:1} → 'map' (не крах); чистота (повторный вызов
  — тот же результат, аргумент не мутирован — deepEqual до/после).
  Красный: routeTouchScreen undefined → TypeError. [ТЗ «Тесты» п.1]
* **R2** tests/controls.test.js: touchKeyCode — 4 направления →
  ArrowUp/ArrowDown/ArrowLeft/ArrowRight; 'interact' → 'KeyE';
  'inventory'/'jump'/null/''/42 → null; СТРУКТУРНО: для каждого DIRS —
  `CODE_DIRS[touchKeyCode(dir)] === dir` (код возвращается в то же
  направление) + канон `/^Arrow(Up|Down|Left|Right)$/`; TOUCH_KEY_CODES
  экспортирован. Красный: touchKeyCode undefined. [ТЗ п.2]
* **R3** tests/combat-keys.test.js (block в конец; Controls уже в
  шапке require): «маппинг тач→бой» — для каждого DIRS:
  `resolveCombatKey(Controls.touchKeyCode(dir), {phase: 'player'})`
  deepEqual `{kind: 'move', dx, dy}` И deepEqual
  `resolveCombatKey('Arrow<Dir>', {phase: 'player'})` И [dx, dy] ===
  `Controls.deltaForMoveKey('touch:' + dir)` (тап = то же действие,
  что клавиша — ТАБЛИЦА ОДНА); interact:
  `resolveCombatKey(Controls.touchKeyCode('interact'),
  {phase: 'player', canDo: {ok: true}})` deepEqual
  `{kind: 'action', action: 'quickItem'}`. Красный:
  Controls.touchKeyCode undefined. [ТЗ п.2]
* **R4** tests/combat-ui.test.js (vm, loadCombatUi + press — паттерны
  файла; блок в конец): handleCode — `typeof G.combatUI.handleCode
  === 'function'`; до startCombat → false, без лога/рендера; активно:
  handleCode('KeyB') → ровно одна строка ['Вы ставите блок.'] (как
  press(keydown,'KeyB'), L183-203); handleCode('ArrowUp') → один шаг
  (строка лога/позиция как у keydown ArrowUp); handleCode('KeyE') →
  ровно ОДНА строка лога (quickItem либо canDo-reason — ТОЧНЫЙ текст
  не пиним; фаза/раунд не сдвинуты); handleCode('Digit1') → false
  (none — не проглатывается); result-фаза (паттерн L1102-1128:
  startCombat c onEnd + `c.result = {outcome: 'victory'}`):
  handleCode('Space') → finish (onEnd вызван), handleCode('KeyJ') →
  false. Существующие keydown-тесты (press) — страховка 1:1, НЕ
  трогаются. Красный: G.combatUI.handleCode undefined. [ТЗ п.3]
* **R5** tests/dungeon-ui.test.js (vm, loadDungeonUi + openDungeon(G,
  moves) — L388-390; блок в конец): touchHold/touchRelease —
  (а) тап: touchHold('up'/'down'/'left'/'right') → moves deepEqual
  [[0,-1]]/[[0,1]]/[[-1,0]]/[[1,0]] РОВНО ОДИН шаг (rAF-стабов нет →
  повтора нет); (б) до start()/после close() → onMove не вызывается;
  'interact'/'inventory'/неизвестное → onMove не вызывается;
  (в) повтор (стабы makeRafStubs + performance: {now: () => T.t},
  паттерн L584-607): touchHold → шаг 1; T.t += 420; tick() → шаг 2;
  T.t += 419; tick() → третьего НЕТ; touchRelease('up'); T.t += 420;
  tick() → нет (стоп); (г) withCombat + активный бой (startCombat
  {hero: G.createCharacter(), mobs: ['wolf'], mobLevel: 1, seed: 42},
  паттерн L473-487): touchHold → onMove НЕ вызывается, errors.length
  === 0. Красный: G.dungeonUI.touchHold undefined. [ТЗ п.3]
* **R6** tests/controls.test.js (vm-блок, паттерн loadInSandbox
  tests/global-settings.test.js L22-24 — чистый контекст без module →
  браузерная UMD-ветка): controls.js в ЧУЖОМ realm —
  Game.routeTouchScreen({combat: true}) === 'combat',
  Game.touchKeyCode('up') === 'ArrowUp', Game.touchKeyCode('interact')
  === 'KeyE' (UMD-обёртка работает вне хоста). Красный:
  Game.routeTouchScreen undefined.

### Техправки существующих тестов (1 коммент + 1 новый пин — ЗЕЛЁНЫЙ коммит 5)

* tests/ui-panel.test.js L503: сообщение ассерта «лестница 5/10/15/20»
  → актуальная лестница «10/15/20/30» (ассерты zP=10/zF=15/zP<zF —
  БЕЗ ИЗМЕНЕНИЙ; #touch-controls НИГДЕ не пинился — поднятие
  z-index тестопрозрачно для них).
* tests/ui-panel.test.js: НОВЫЙ ассерт в том же z-тесте:
  `parseFloat(cssRule(html, 'touch-controls')['z-index']) === 30` И
  > 20 (z-index 'combat-overlay') — пин лестницы для нового пути.
* Семантических правок существующих тестов НЕТ. deepEqual TOUCH_ACTIONS
  (L114-118) — TOUCH_ACTIONS не расширяется (D7) → без правок.
  Пины index-order — новых script-тегов нет → без правок.

### Ревью-раунд (2026-10-02) — доборное покрытие touchStepMs

* tests/dungeon-ui.test.js (НОВЫЙ тест в конец файла): ветки
  touchStepMs() — live move_interval_ms = 100 → повтор через 100 мс
  (не 420); move_interval_ms = 10 → кламп 60 мс (MIN_MOVE_INTERVAL_MS,
  motion.js); мусор ('junk'/0/−5/NaN) → фолбэк 420 (граница 419/420
  пинится); delete G.GlobalSettings → 420. Каждый кейс — своя
  песочница (loadDungeonUi — новый контекст; global-settings.js —
  ПЕРВЫЙ в цепочке, G.GlobalSettings.SETTINGS — живой объект,
  перезапись в песочнице чужих тестов не трогает). ТЗ этого не
  требует — доборная робастность (finding minor, «не блокирует
  мерж» — сделано).

### Зелёные без правок (обязаны пройти)

* index-order (пины порядка + 5 vm-boot: цепочка до ui.js, схема
  'keyboard', dpad:false, errors.length===0 — тач-колбэки чисты при
  init).
* controls (22): TOUCH_ACTIONS/layout 800×600/touchActionAt/DELTA/
  CODE_DIRS/кириллица.
* combat-keys (19): таблица 8 движ. записей = CODE_DIRS×DIR_DELTA,
  8 строк describeCombatKeys, source-регрессии кириллицы
  (combat-ui/dungeon-ui), структурный main.js (ранний return combatUI
  ДО moveKey — keydown НЕ ТРОГАЕТСЯ).
* dungeon-ui (51 = 50 + 1 ревью-раунд touchStepMs): keydown 1:1
  (один нажатие = один шаг, preventDefault/stopPropagation,
  code>key, не-перемещающие, до start/после close, бой выше по
  стеку, битый порядок), вьюпорт/камера/зум/спрайты/город, rAF.
* combat-ui: 8 кнопок, одно нажатие = одно действие (deepEqual строк
  c.log) — страховка 1:1-рефакторинга.
* map (touch-лучи 360×640), building-actions (BA7: 'G.buildingActions'
  + '.toggle(' в main.js — литерал в onInteract-ветке map сохраняется),
  global-settings (main.js: GlobalSettings/move_interval_ms, без
  `const MOVE_INTERVAL_MS = 140`), cities (npcStocks), day («Проход 3»),
  save (restoreFromSave), ui-panel (z 10/15), hud.js, save-restore,
  city-screen, main-visuals, locations.

### Верификация RED (красная фаза)

1. npm test ВНУТРИ worktree (memory/test-runner-worktrees.md) →
   1329 + 6 = 1335 тестов, pass 1329, fail 6 (ТОЛЬКО R1-R6), причины
   осмысленные (TypeError: … is not a function), не синтаксис/флейк.
2. Пофайло: controls 25 (3 fail), combat-keys 20 (1 fail),
   combat-ui +1 (1 fail), dungeon-ui 51 (1 fail); остальные — без
   изменений. (Точные базовые счётчики — замерить в красной фазе.)
3. Зелёная фаза: после коммитов 2-5 — 1335/1335 ВСЁ зелёное.
4. Чужой флейк → перепуск `node --test tests/<файл>` + запись в отчёт.

## UMD / порядок загрузки

* НОВЫХ МОДУЛЕЙ НЕТ → новых <script> НЕТ → новых пинов
  tests/index-order.test.js НЕТ (прецедент 000123).
* controls.js (L636) — самый ранний из затронутых, нулевые новые
  зависимости (чистое добавление; в node — require-ветка без require
  новых файлов).
* UMD-ловушка 000038 (снапшот G в main.js): все вызываемые из тач-
  колбэков функции в цепочке ДО main.js (L675): controls.js L636
  (routeTouchScreen/touchKeyCode), combat-ui.js L670 (handleCode —
  после добавления), dungeon-ui.js L671 (touchHold/touchRelease —
  после добавления). При любом будущем переносе скриптов — новый
  пин index-order.
* combat-ui.js — IIFE без UMD-ветки: handleCode использует closures
  модуля + G.CombatKeys/G.canDoAction (снапшот) — новых зависимостей
  НЕТ.

## Ленивые ссылки и guards

* controls.js — ГЛЮБООК Game (чистая; снапшот — аргумент).
* combat-ui.js — handleCode: closures (isActive/ctx/render/finish/
  runAction/logRejection) + G.CombatKeys (снапшот, combat-keys.js ДО
  combat-ui.js — пин index-order) + G.canDoAction (снапшот, боевая
  цепочка ДО). Новых Game-ссылок нет.
* dungeon-ui.js — touchHoldStep: liveGame() в момент ВЫЗОВА
  (live.deltaForMoveKey, live.GlobalSettings, live.combatUI — паттерн
  cityTileVariant L105-112 для поздно доигрывающихся модулей); guard
  `live.deltaForMoveKey ? … : null` (отсутствие → нет шага, не крах);
  touchStepMs: `Number.isFinite(v) && v > 0 ? v : 420`, кламп
  `Math.max(60, …)`.
* main.js — ленивое чтение в колбэках: `G.combatUI &&`,
  `G.dungeonUI && typeof G.dungeonUI.touchHold === 'function'`
  (typeof-guard на случай битой загрузки — деградация, не крах),
  `G.buildingActions &&` (BA7), `if (G.playerUI)`; G.routeTouchScreen/
  G.touchKeyCode — прямое использование (controls.js гарантирован:
  гард touchControls в том же блоке + пин index-order; паттерн
  G.moveKeyForEvent L802).
* vm-boot: колбэки НЕ вызываются при загрузке → DOM/Game в замыканиях
  не трогаются при init (пин errors.length===0).

## Что важно будущим задачам

* **Контракт роутинга** (для тач-фоллов-апов: новые экраны, кнопка
  «Блок», подписи) — memory/000121-dpad-routing.md: форма снимка,
  приоритет, коды, рецепт «новый экран».
* **000018/000123 (D-pad/кнопки)**: `touchControls.init(h)` — БЕЗ
  ИЗМЕНЕНИЙ: h = {dpad === true, onHold, onRelease, onInteract,
  onInventory}; layoutTouchControls {dpad, action, inventory};
  TOUCH_ACTIONS = 6 (не расширяется); applyLayout при dpadEl===null.
* **000048 (боевые клавиши)**: единая таблица COMBAT_KEYS не
  расширяется; handleCode — ЕДИНСТВЕННЫЙ вход «code → действие боя»
  (клавиатура + тач). Новая боевая связь тача — через touchKeyCode
  (новый code-маппинг) → handleCode.
* **000063 (move_interval_ms)**: интервал повтора подземельного
  тача — live-чтение; будущий «подземельный» навык скорости — точка
  touchStepMs() в dungeon-ui.js (сейчас навык не применяется — как
  клавиатура).
* **000124 (кнопки боя)**: прочие боевые действия (блок/заклинания/
  цель) — клики по .combat-actions (8 кнопок) + canvas; тач-D-pad
  даёт только move/quickItem.
* **000098 (настройки)**: новых SETTINGS-ключей НЕТ.
* **z-лестница 10/15/20/30** (установлено 000121): новый оверлей с
  z > 30 ПЕРЕКРОЕТ контролы — осознанный выбор, если нужен; пин —
  ui-panel.test.js (30 > 20). Следствия лестницы, задокументировано:
  в ROW-вьюпортах D-pad перекрывает левый нижний угол боевого canvas
  (кандидат на отдельную UI-задачу — раздел «Известное ограничение
  (осознанное отклонение)»); открытая .char-panel (z-10) частично
  перекрыта кнопками [E]/[I] (и D-pad) — не ломает панель.
* **Детерминизм/сейвы**: новых данных в сейве нет; тач — только
  ИСТОЧНИК шагов/действий, содержимое — время-независимо.

## Дельты ТЗ ↔ код (сверено с master 2b4aa92)

1. ТЗ «Состояние сейчас: onInteract: toggleNpcDialog» — УСТАРЕЛО
   (000071/000128): факт — `G.buildingActions.toggle()` (self-gate
   боем/подземельем, L465-518 building-actions.js). «карта → как
   сейчас» = toggle().
2. ТЗ п.1 приоритет «бой > подземелье > карта» — в коде ЕЩЁ два
   экрана (npcUI-диалог, buildingUI-оверлей): в снимке, но НЕ
   ПОТРЕБЛЯЮТСЯ (D8; поведение = карта; тесты пинят 8 комбинаций
   c/d/dialog).
3. Примечание memory/000123 «000121 НЕ переправляет строки
   onInteract/onInventory» — НЕВЫПОЛНИМО в части [E] в бою (quickItem
   требует переиспользования handleCode): D5 — onHold/onRelease/
   onInteract перебираются под роутер; onInventory — БЕЗ ИЗМЕНЕНИЙ.
4. ТЗ п.3 «тот же code, что клавиатура (ArrowUp/KeyW, …)» —
   CODE_DIRS: 8 кодов на 4 направления; канон — стрелки (D2);
   «без дублирования таблицы» — коды идут в существующую
   resolveCombatKey (combat-keys.js не правится).
5. Клавиша [E] в бою работает через слушатель combat-ui.js (main.js
   KeyE-ветка гасится self-gate'ом toggle) — тач-путь эквивалентен:
   роутер → handleCode('KeyE'); двойного срабатывания нет (тач в бою
   НЕ идёт через buildingActions).
6. «Повтор» в подземелье: клавиатура — OS auto-repeat удержанной
   клавиши; тач — свой tick с move_interval_ms (420 мс) — источники
   различаются (ТЗ допускает: «интервал — глобальные настройки,
   000063»); ОС-повтор в бою ПОВТОРЯЕТ действия (клавиатура), тач —
   НЕ ПОВТОРЯЕТ (осознанно: каждое действие тратит ход; удержание при
   переходе подземелье→бой стоптится гардом без выпуска боевого
   действия — D4).

## Известное ограничение (осознанное отклонение, ревью 2026-10-02)

В ROW (альбомных) вьюпортах D-pad (раскладка 000018: левый нижний
угол, x: 16…16+S, y: H−16−S…H−16, S = 96…220 px) ПЕРЕКРЫВАЕТ левый
нижний угол боевого canvas (000124: центрированная row-пара
canvas+gap+panel, canvas = min(H−32, W−304)). Измерено (node, точное
воспроизведение layoutTouchControls + формул CSS 000124; пересчёт
major-файнда ревью подтверждён): 844×390 — 65×156 px (≈ 8% поля),
667×375 — 140×150 (≈ 18%), 740×360 — 90×144 (≈ 12%), 1280×720 —
76×220 (≈ 3.5%), 568×320 — 128×116 (≈ 21%). Последствия в зоне
перекрытия: (1) конкретный выбор цели кликом по canvas (000040,
c.selectTarget) недостижим — клик перехватывает .tc-dpad
(pointer-events: auto); «атака ближайшего» (fallback nearestMob,
combat.js) работает, конкретный targetId/заклинание по конкретной
цели в этой зоне — нет; (2) pointerdown по D-pad = onHold(dir) →
в бою handleCode(ArrowX) → move — ОДНО действие, тратит ход: тап
по «видимому» (полупрозрачный фон D-pad) полю может непреднамеренно
потратить ход. Портретные вьюпорты НЕ задеты (поле сверху, D-pad
снизу — не пересекаются). Природа: пересечение решений ТРЁХ
смерженных задач — 000018 (D-pad в левом нижнем углу вьюпорта),
000124 (центрирование row-пары боя), 000121 (z-30 — ТЗ п.5 «оверлеи
не перекрывают контролы» — условие ОДНОСТОРОННЕ, выполнено; ТЗ
обратного — «контролы не перекрывают canvas» — не требует).
Решение ревью: вариант (c) — ограничение ПРИНЯТО и зафиксировано как
осознанное отклонение ТЗ п.3 («выбор цели — кликами по элементам
боевого UI»); полная правка — ОТДЕЛЬНАЯ UI-задача (кандидат в
tasks/pending): в touch-схеме сдвигать row-пару боя вправо (новый
класс body + media-query + пересчёт формулы canvas, закреплённой
пинами tests/combat-layout.test.js) ИЛИ переносить D-pad при активном
бою (новое состояние ui.js ← боевой оверлей + правка закреплённой
layoutTouchControls, пин 800×600) — оба варианта выходят за скоуп
роутинговой задачи («строго по ТЗ: не больше и не меньше»).

## Подводные камни

1. **UMD-снапшот G в main.js (000038)**: G.routeTouchScreen/
   G.touchKeyCode/G.combatUI.handleCode/G.dungeonUI.touchHold обязаны
   быть в цепочке ДО main.js — так и есть (L636/L670/L671 < L675);
   любой будущий перенос скриптов — новый пин index-order.
2. **Пин BA7** (tests/building-actions.test.js L831-840): main.js
   обязан содержать 'G.buildingActions' И литерал '.toggle(' —
   onInteract-ветка map сохраняет `G.buildingActions.toggle()`
   (не переименовывать, не выносить в хелпер).
3. **Структурные пины main.js** (не трогать): keydown-обработчик
   (combat-keys.test.js L266-277: ранний return combatUI ДО
   `const k = moveKey(e)`), MOVE_INTERVAL_MS-блок (global-settings:
   GlobalSettings/move_interval_ms присутствуют, `const
   MOVE_INTERVAL_MS = 140` НЕТ), npcStocks (cities L1420), «Проход 3»
   (day L417), restoreFromSave (save L318).
4. **keydown dungeon-ui L186-195 — БУКВАЛЬНО не трогать**: 50
   существующих тестов (включая сверки drawCalls по не-перемещающим
   клавишам) — страховка; touchHoldStep — ОТОБРАЖЕНИЕ тела, не
   перенос (keydown остаётся, как есть).
5. **tick()-hook инертен при touchHoldDir === null** — существующие
   rAF-тесты (камера/спрайты/город) не бьются; блок НЕ добавляет
   рендера при null.
6. **1:1-рефакторинг keydown combat-ui**: существующие press()-тесты
   (один нажатие = одна строка c.log, rAF-старт/стоп в finish,
   result-фаза) — страховка; если тест бьётся — причина СТРУКТУРНАЯ
   (рефакторинг изменил семантику) — требует обоснования, не
   «починить» правкой теста.
7. **vm-boot-песочницы (5 шт.)**: новый тач-блок main.js отработает в
   схеме 'keyboard' (init + show; замыкания не вызываются); ЛЮБОЙ
   доступ к DOM/Game при загрузке или console.error — ломает пин
   errors.length===0.
8. **z-30 — визуальные пересечения в бою**: контролы над НИЖНЕЙ частью
   боевой панели (журнал — read-only); .combat-actions (ВВЕРХУ
   .combat-side) — не пересекается; панель подземелья (top-right) —
   не пересекается. CANVAS: портретные вьюпорты — не пересекаются
   (поле сверху, D-pad снизу); ROW (альбомные) — D-pad перекрывает
   левый НИЖНИЙ УГОЛ canvas (844×390 — 65×156 px ≈ 8% поля,
   667×375 — ≈ 18%, 740×360 — ≈ 12%, 1280×720 — ≈ 3.5%): конкретный
   клик-выбор цели в этой зоне невозможен, тап там = движение
   (в бою — тратит ход). ОСОЗНАННОЕ ОТКЛОНЕНИЕ ТЗ п.3 — раздел
   «Известное ограничение (осознанное отклонение)», не баг.
9. **Slide в бою = новое действие на направление** (onRelease(old)+
   onHold(new) из ui.js IIFE) — аналог клавиатурных keydown; в бою
   каждое действие тратит ход (документация, не баг).
10. **Повтор подземелья живёт в dungeon-ui (rAF), НЕ в main.js**
    (setInterval в vm-песочнице dungeon-ui нет): будущая задача,
    «переносящая» шаги в main.js, обязанa сохранить повтор в rAF
    (иначе — нетестируемый клей + утечка таймеров).
11. **Флейки** — npm test мерить ВНУТРИ worktree
    (memory/test-runner-worktrees.md); чужой флейк — перепуск +
    запись в отчёт.

## План реализации (коммиты, ветка task/000121)

1. «Задача 000121: красные тесты и память» — R1-R6 +
   memory/000121-touch-dungeon-combat.md + memory/000121-dpad-routing.
   npm test: 1335 тестов, pass 1329, fail 6 (ТОЛЬКО R1-R6).
2. «Задача 000121: controls.js — роутер экранов и маппинг тач→code» —
   TOUCH_KEY_CODES + touchKeyCode + routeTouchScreen + jsdoc +
   экспорт. → R1, R2, R3 (нужен только touchKeyCode), R6 зелёные.
3. «Задача 000121: combat-ui.js — handleCode (1:1 из keydown) +
   экспорт» — рефакторинг L296-339 + G.combatUI.handleCode. → R4
   зелёный.
4. «Задача 000121: dungeon-ui.js — touchHold/touchRelease + повтор в
   rAF» — touchStepMs/touchHoldStep/touchHold/touchRelease +
   tick-hook + сбросы start/close + экспорт. → R5 зелёный.
5. «Задача 000121: main.js — роутинг тача (бой/подземелье/карта);
   z-index контролов 30» — тач-блок L845-891 + index.html L178-188 +
   техправка коммента и z-пин ui-panel.test.js. npm test — ВСЁ
   зелёное (1335/1335).
6. (стадия мержа) «Задача 000121: CHANGELOG — тач-D-pad в подземелье и
   на поле боя» (2026-10-02, раздел «Интерфейс», формат — по
   существующим записям) + tasks/result/000121.md + перенос задачи в
   done + .merge-pending + ребаз на актуальный master + мерж +
   удаление .merge-pending.

Дельта: ~13 файлов, ≈ +700/−25 строк: src/controls.js +≈55,
src/combat-ui.js +≈28/−≈14, src/dungeon-ui.js +≈60, src/main.js
+≈35/−≈6, index.html ±2, tests/controls.test.js +≈110,
tests/combat-keys.test.js +≈30, tests/combat-ui.test.js +≈70,
tests/dungeon-ui.test.js +≈80, tests/ui-panel.test.js +≈6/−1,
memory ×2 +≈280, CHANGELOG +≈4. Новых JS-модулей/скриптов/ассетов/
SETTINGS-ключей — НЕТ.

## Ручная проверка (ТЗ)

?controls=touch (десктоп-браузер): карта (D-pad: удержание =
движение, как 000018; [E] = диалог/постройка) → вход в подземелье
(D-pad: тап = шаг, удержание = повтор 420 мс, выход; [E] — ничего) →
бой (D-pad: тап = шаг, удержание НЕ повторяет; [E] = быстрый предмет —
строка в журнале; блок/заклинания/цель — клики; баннер/клик — выход)
→ карта. ?controls=keyboard — регрессия: D-pad нет, клавиатура как
раньше, [E]/[I] — как 000123.

Статус (станция «Правки по итогам ревью», 2026-10-02): браузерный
прогон НЕ выполнялся — в окружении станции браузера нет
(проверено: нет chromium/firefox, node --test покрывает только
vm-песочницы). Автоматический набор покрывает: роутинг (R1/R2/R6),
маппинг тач→бой (R3), handleCode (R4), тап = один шаг + повтор
420 мс + стоп + гард боя (R5) + live move_interval_ms/кламп/
фолбэк (добавлено станцией ревью) + 5 vm-boot-песочниц
(errors.length===0). npm test в worktree — зелёный (1336/1336).
СТАДИЯ МЕРЖА: прогнать ручную проверку в браузере (она требует
человека/эмулятора) ИЛИ честно зафиксировать в tasks/result/
000121.md, что браузерная ручная проверка не прогонялась (автоматический
набор — зелёный).

## Зоны ребеза (для стадии мержа)

* src/controls.js (вставка L271-273 + экспорт L273-277)
* src/combat-ui.js (L296-339 рефакторинг + экспорт L755-840)
* src/dungeon-ui.js (tick L532-535, start L558, close L571,
  экспорт L537-575, новые функции)
* src/main.js (ТОЛЬКО тач-блок L845-891)
* index.html (CSS L178-188 + коммент .cp-tip-блока L112-118
  (один комментарий 000097: «лестница 5/10/15/20» → «10/15/20/30»,
  правка по итогам ревью))
* tests/dungeon-ui.test.js — блок touchStepMs (ревью) — в КОНЦЕ файла
* CHANGELOG.md (запись в `### Интерфейс` под `## 2026-10-02` —
  добавка ПОСЛЕ записи «Кнопки [E] и [I] на карте»; master ушёл
  вперёд (000111 — «Эфир растёт» в «Игровой процесс» — другой
  раздел, контекст нашего ханка не меняется) — конфликт маловероятен,
  но проверить на ребазе)
* memory/000121-* (новые)
* Параллельные pending с пересечениями: main.js (000085/000087/000115
  — другие регионы), controls.js (возможно 000126), index.html CSS
  (000123 уже в master). РЕБАЗ на актуальный master перед мержем —
  ОБЯЗАТЕЛЕН.

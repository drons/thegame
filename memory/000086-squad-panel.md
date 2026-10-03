# 000086: панель «Отряд» (G.squadUI, src/ui.js + src/main.js) — контракт

Задача: глобальная панель «Отряд» — состав спутников ВНЕ диалога таверны
(вкладка «найм» 000083 — это слой диалога; панель — отдельный оверлей,
как панель персонажа). Родитель — 000065. Ядро отряда — 000079/000082
(memory/000079-companions-core.md), наём/сводка — 000083
(memory/000083-hire-tab-ui.md), Эфир — 000081/000111
(memory/000081-efir-ally.md, СТАБИЛЬНЫЙ КОНТРАКТ), панель персонажа —
000051 (серия 000096–000101 + 000130).

Статус: ВЫПОЛНЕНО (Finalize 2026-10-03): 4b81785 (красные тесты +
этот контракт), c645fe7 (реализация), c91448c (CHANGELOG),
Finalize (отчёт tasks/result/000086.md, перенос в done). npm test
на Finalize: **1391/1391/0** (база 1377). Контракт §1–10 — как
реализовано; отклонений не было.
Статус до кода: ПРОЕКТИРОВАНИЕ завершено (контракт зафиксирован до
кода).
База worktree: master 7ab2c03 (после мержа 000083). Базовый прогон
npm test: 1377 pass / 0 fail (2026-10-03 — сверено повторно на
станции Проектирование). ВСЕ сигнатуры/регионы/строки этого файла
пере-верифицированы в коде worktree 2026-10-03 (efirStats(level) —
чистая функция от уровня, 000111; keydown main.js L835-867;
roster-блок L298-309; playerUI-закрыватели L752/L1005/L1156;
__game.state.efir L1560; npcUI-npcs() L432; buildPanel/closeBtn
своим слушателем + 1 делегированный click; .char-panel CSS L48-63;
</style> L574; скрипты companions L599 → efir L605 → ui.js L653 →
main.js L678; API_KEYS L125; структурные пины ui.js: «saveNow НЕТ»
(ui-panel L1554) и «combat-side НЕТ» (npc-layout L190) — squad-блок
их не нарушает; regex playerUI-закрывателей не совпадает с
squadUI-строками).

## 1. Решение: ОТДЕЛЬНЫЙ глобальный оверлей (НЕ вкладка панели персонажа)

ТЗ: «если 000051 уже мержена — решение (блок в панели персонажа или
отдельный оверлей) фиксировать ПО ЕЁ ИТОГУ». 000051 СМЕРЖЕНА
(000096–000101 + 000130 data-driven вкладки). Решение: **ОТДЕЛЬНЫЙ
оверлей `G.squadUI` в src/ui.js**. Цепочка:

1. ТЗ фиксирует **отдельную хоткей KeyC** — у вкладки панели
   персонажа хоткея нет (открытие [I] + переключение вкладки);
   KeyC имеет смысл только у собственного оверлея.
2. После 000130 вкладки — САМОРЕГИСТРИРУЮЩИЕСЯ модули
   (src/ui-tab-*.js + script-тег + пин index-order, рецепт
   memory/000130-ui-tabs.md §5: «ui.js НЕ правится» — закреплён
   тестом-антипрецедентом). Новая вкладка = новый модуль-файл +
   новый `<script>` в index.html — ТЗ-файлы (только src/ui.js +
   src/main.js) этого НЕ предусматривают.
3. Состав панели персонажа ЗАПИНЕН tests/ui-panel.test.js
   (2×3 вкладки, ОДИН делегированный click, CSS .char-panel) —
   7-я вкладка ломала бы пины.
4. memory/000083-hire-tab-ui.md §9 прямо проектировала 000086:
   «ОТДЕЛЬНЫЙ оверлей… ui.js — РАЗНЫЕ регионы; main.js — KeyC в
   keydown».
5. 000116 (pending) и SPEC.md (L758, L865-866) трактуют панель
   «Отряд» и вкладку «Эфир» как ДВА РАЗНЫХ UI-поверхности; переход
   из строки Эфира на вкладку — зона 000116 («строку НЕ
   переделывать»).
6. SPEC L758: «Панель «Отряд» (после редизайна панели персонажа)» —
   глобальная панель «как панель персонажа» (стилистически).

## 2. Что добавлено (карта изменений)

| Файл | Тип | Регион | Что |
|---|---|---|---|
| src/companions.js | ДОБАВЛЕНО | после `dismiss` (~L204, до раздела «Жалованье и лояльность») + хвост return-объекта | чистая `rosterSummary(roster, npcs, efirData)` + экспорт |
| src/ui.js | ДОБАВЛЕНО | новый вложенный IIFE между концом блока npcUI (~L971) и IIFE touchControls (~L983) | `G.squadUI` (build/render/Esc/click) |
| src/ui.js | ИЗМЕНЕНО (2 строки) | блок npcUI, `onOverlayClick`: ветка hire r.ok — после `G.playerUI && G.playerUI.render();`; ветка dismiss r.ok — после `renderTab();` | `G.squadUI && G.squadUI.render();` (панель под диалогом не устаревает; без панели — no-op `if (!panel) return`) |
| src/main.js | ИЗМЕНЕНО | keydown (~L836): СРАЗУ ПОСЛЕ ветки KeyI, ДО ветки KeyE, ДО гейтов | `if (e.code === 'KeyC' && G.squadUI) { G.squadUI.toggle(); return; }` |
| src/main.js | ИЗМЕНЕНО | сразу ПОСЛЕ блока roster/deadMercs — после `if (!hasCompanions)` console.error-блока (~L309), ДО блока «Задача 000076» (~L310) | `if (G.squadUI && typeof G.squadUI.init === 'function') G.squadUI.init({ roster, efir, onChange: saveNow }); else console.error(...)` |
| src/main.js | ИЗМЕНЕНО (3×1 строка) | сразу ПОСЛЕ существующей `if (G.playerUI && G.playerUI.isOpen()) G.playerUI.toggle(false);` в startCombatAt (~L752), maybeStartCombat (~L1005), startDungeonCombat (~L1156) | `if (G.squadUI && G.squadUI.isOpen()) G.squadUI.toggle(false);` |
| index.html | ИЗМЕНЕНО (аддитивный CSS-чанк) | КОНЕЦ `<style>` (прецедент 000125) | .squad-panel / .squad-body / .squad-xp / .squad-xp-fill |
| tests/companions.test.js | ДОБАВЛЕНО | конец файла (секция «000086») + константа API_KEYS | 5 node-тестов сводки; API_KEYS += 'rosterSummary' (ТЕХНИЧЕСКАЯ правка — пин API расширяется новым экспортом; два deepEqual-теста проходят без семантических правок) |
| tests/squad-panel.test.js | НОВЫЙ | — | vm-тесты P1–P6 + структурные пины main.js S1–S3 |

НЕ МЕНЯЕТСЯ: SPEC.md; index.html `<script>`-теги (новых НЕТ —
панель внутри ui.js, сводка внутри companions.js) →
tests/index-order.test.js не трогать; .char-panel/.cp-* CSS-правила
(пины ui-panel.test.js); COMBAT_KEYS/CODE_DIRS/TOUCH_KEY_CODES
(KeyC НЕ добавляется ни в одну таблицу — tests/combat-keys.test.js
`describeCombatKeys()` бросит при дубле, а KeyC должна остаться
СВОБОДНОЙ в бою); collectSaveData/restoreFromSave (зона 000085);
renderHud/hud.js (000093; [C]-хинт в HUD ТЗ не требует — «не
больше и не меньше»); buildingActions-бандл (000107); src/efir.js
(000085 параллельно добавляет serializeEfir/deserializeEfir —
конфликт хвоста factory); playerUI-ядро (L39–409) и npcUI-логика
(кроме 2 строки render выше).

### 2.1 План реализации — ожидаемые дельты

| Файл | Действие | Ожидаемая дельта |
|---|---|---|
| src/companions.js | rosterSummary + экспорт | ~+40 строк (381 → ~421) |
| src/ui.js | squad-IIFE + 2 строки render в onOverlayClick | ~+160 строк (1192 → ~1352) |
| src/main.js | init-проводка + KeyC-ветка + 3× close-on-combat | ~+17 строк (1700 → ~1717) |
| index.html | CSS-чанк в конце <style> | ~+18 строк (680 → ~698) |
| tests/companions.test.js | секция 000086 (5 тестов) + API_KEYS | ~+65 строк (972 → ~1037) |
| tests/squad-panel.test.js | НОВЫЙ (DOM-стаб + CHAIN A + P1–P6 + S1–S3) | ~+450 строк (объём ~ npc-hire-ui, 896) |
| memory/000086-squad-panel.md | НОВЫЙ (этот файл) | ~+580 строк |
| tasks/result/000086.md | НОВЫЙ (отчёт) | ~+40 строк |
| tasks/pending/000086.md → tasks/done/000086.md | перемещение (на мерже) | 0 |
| CHANGELOG.md | упоминание (на мерже, отдельный коммит) | ~+3 строки |

Порядок коммитов: (1) memory + красные тесты (S1–S5, P1–P6, S1–S3);
(2) src/companions.js (rosterSummary) + src/ui.js (squad-IIFE + 2
строки) + src/main.js (3 ханка) + index.html (CSS); (3) отчёт +
перенос задачи. Весь набор зелёный между коммитами не требуется
(красные падают до (2)), но ПОСЛЕ (2) — 1391 pass / 0 fail.

## 3. Контракт `G.squadUI` (src/ui.js)

Вложенный IIFE внутри верхнего ui.js (видит общий `const G` —
снапшот 000038 — и фабрику `el()`). На загрузке ui.js — НОЛЬ чтений
Game.companions/Game.efir/Game.NpcData (UMD-ловушка 000038; все
гарды ЛЕНИВЫЕ, в момент вызова).

```
G.squadUI = {
  init({ roster, efir, onChange })   // ЖИВЫЕ ссылки (main.js, один
                                     // раз; идемпотентно —
                                     // перезапись); roster:
                                     // Array.isArray ? r : null;
                                     // efir: e || null; onChange:
                                     // typeof fn ? fn : null;
                                     // если панель открыта — render()
  toggle(force)                      // KeyC / close-кнопка / Esc;
                                     // до init — no-op; ленивый build
  render()                           // no-op, если панель не
                                     // построена (if (!panel) return)
  isOpen()                           // !!panel &&
                                     // panel.style.display === 'flex'
}
```

* **npcs НЕ передаётся в init** — читается лениво внутри ui.js:
  `function npcs() { return (G.NpcData && G.NpcData.NPCS) || []; }`
  (паттерн npcUI; npc-data.js грузится ДО ui.js — снапшот содержит
  G.NpcData). Меньше проводки в main.js и меньше setters.
* **init вызывается в main.js сразу после блока roster/deadMercs
  (~L309, после `if (!hasCompanions)` console.error-блока, ДО
  блока «Задача 000076»)** — СВОЯ зона, не пересекается с
  collectSaveData (000085, ~L355+), buildingActions.init
  (000107, ~L786+), keydown. saveNow — function-декларация (L391,
  hoisted, тот же IIFE-scope main.js) — ссылаться можно до
  объявления.
* **toggle(force)**: `if (!panel) buildSquad(); if (!initialized)
  return;` (форма playerUI: buildPanel → `if (!character) return`);
  `panel.style.display = show ? 'flex' : 'none'` ('flex', НЕ
  'block' — прецедент 000096: CSS .squad-panel display:flex обязан
  действовать); при show — render() + attachEsc(), при hide —
  detachEsc().
* **buildSquad()** (ленивый, при первом toggle):
  ```
  div.squad-panel (style.display = 'none')
    button.cp-close «закрыть [C]/[Esc]»   — СВОЙ слушатель click →
                                             toggle(false) (паттерн
                                             close-кнопки playerUI)
    div.cp-title «Отряд»
    div.squad-body
      (render() пересобирает содержимое in place:
       body.textContent = '' → строки)
  document.body.appendChild(panel)
  ```
  Класс .squad-panel — НОВЫЙ (не .char-panel, не .npc-panel):
  геометрия 1:1 .char-panel (fixed; top/left/right: 12px;
  bottom: 56px; z-index: 10; тот же фон rgba(16,18,24,.92), рамка
  #4a4433, radius 12px, шрифт, padding), display:flex +
  flex-direction:column. **БЕЗ** class combat-overlay (z-20) —
  панель НИЖЕ боевых/подземельных оверлеев, как .char-panel.
  .squad-body: flex:1; overflow-y:auto; min-height:0; max-width:
  560px (узкая колонка — ≤4 строки, полноэкранное поле без
  смысла); margin-left/right auto (по центру, паттерн .npc-panel).
* **render()**:
  1. interactive-условие (ленивое, в момент render, паттерн
     000083): `C = G.companions; haveCore = !!C && typeof
     C.rosterSummary === 'function' && typeof C.dismiss ===
     'function'`.
  2. haveCore: `s = C.rosterSummary(roster, npcs(), efirData())` →
     строки из s.
  3. !haveCore (регрессия порядка — в игре НЕВОЗМОЖНО, пин
     index-order: companions.js < ui.js): ОДИН раз (флаг)
     console.error('ui.js: Game.companions отсутствует —
     src/companions.js обязан грузиться ДО src/ui.js (задача
     000079); панель «Отряд» — read-only') + read-only строки из
     сырых записей (имя из каталога/голый id, «уровень N ·
     лояльность L», БЕЗ хвоста жалованья, БЕЗ кнопок); строка
     Эфира и «Отряд пуст…» не зависят от ядра.
  4. Пустой отряд (s.empty / roster пустая): ОДНА строка
     `div.cp-itemmeta` «Отряд пуст. Наймите спутников в таверне.»
     (.cp-itemrow НЕТ — прецедент 000083 «Отряд пуст.»).
  5. Строка наёмника (каждая из s.members, в порядке roster):
     `div.cp-itemrow` >
       span.cp-itemname — s.name (каталог; «призрак» — голый npcId);
       span.cp-itemmeta — «уровень N · лояльность L» + (s.wage —
       number → « · жалованье W з/день») — **ТА ЖА строка, что блок
       «Отряд» вкладки 000083** (консистентность слоёв);
       button.cp-btn «уволить» — dataset.squadact='dismiss',
       dataset.npcid=s.npcId (ТОЛЬКО при haveCore).
  6. Строка Эфира (s.efir — НЕ null) — ПОСЛЕ блока наёмников:
     `div.cp-itemrow` >
       span.cp-itemname «Эфир»;
       span.cp-itemmeta «уровень N · HP M/M · всегда со мной»
       (M = s.efir.maxHP; Эфир всегда 100% HP — структурно,
       000081: HP в state нет, каждый бой — новый makeAlly);
       div.squad-xp > div.squad-xp-fill (style.width = pct%,
       pct = clamp(round(efir.xp / G.xpForNext(level) * 100), 0,
       100) — xp-бар; БЕЗ него, если G.xpForNext недоступен).
       БЕЗ лояльности/жалованья/кнопки «уволить» (000081: Эфир —
       НЕ наёмник).
* **efirData()** (ленивое, в момент render): `efir` (live-объект
  main.js, поставлен init) — null → null; иначе
  `G.efir && typeof G.efir.efirStats === 'function'` →
  `{ level: lv, maxHP: G.efir.efirStats(lv).maxHP }` (lv =
  Number.isFinite(efir.level) && efir.level >= 1 ? efir.level : 1)
  — ЧТЕНИЕ G.efir ЛЕНИВОЕ (rootRef-паттерн 000053), обходит
  снапшот-ловушку 000038. Деградация: G.efir
  отсутствует → строка Эфира БЕЗ части HP (level + «всегда со
  мной»), xp-бара нет.
* **Клик — ОДИН делегированный слушатель на panel** (кроме
  close-кнопки со своим слушателем):
  `const btn = e.target.closest('button[data-squadact]')` →
  act 'dismiss':
  ```
  C = G.companions; guard (C && typeof C.dismiss === 'function'
                           && Array.isArray(roster)) → return
  r = C.dismiss(roster, btn.dataset.npcid)   // re-check
                                              // canDismiss ВНУТРИ
                                              // (stale-кнопка,
                                              // паттерн 000083)
  r.ok:  if (onChange) onChange();  // = saveNow в игре; ровно ×1
         render()
  иначе: render()                   // тихо (панель БЕЗ .npc-log —
                                    // ТЗ не требует логов)
  ```
  **Литерал saveNow в src/ui.js НЕ ВСТРЕЧАЕТСЯ** (фиксатор
  tests/ui-panel.test.js 000100: `/saveNow/` not in src/ui.js) —
  в комментариях писать «хук на изменение состояния (сейв в
  main.js)».
* **Esc** — document-слушатель, живёт только пока открыта
  (attachEsc/detachEsc в toggle), **ТОЧНАЯ копия цепочки гардов
  playerUI** (memory/000096-char-panel.md «Цепочка гардов [Esc]»,
  ui.js L308-344):
  1. `if (e.code !== 'Escape' || !isOpen()) return;`
  2. `G.npcUI && G.npcUI.isActive()` → return (диалог z-20 —
     верхний слой; его Esc-слушатель на window закроет его —
     bubble document → window);
  3. `G.combatUI && G.combatUI.isActive()` && `current().result`
     → return (оверлей РЕЗУЛЬТАТА боя z-20);
  4. иначе `toggle(false)`. typeof-гарды, терпимость к стабам.
  **Замечение (зафиксировано)**: открыты ОДНОВРЕМЕННО панель
  персонажа И панель «Отряд» (обе z-10) — одно Esc закрывает обе
  (два document-слушателя). Допустимый крайний случай (обе панели
  одного уровня; верхнего слоя между ними нет) — не чинить.
  Поведение KeyC поверх открытых оверлеев — как KeyI (документ.
  прецедент main.js: ветки KeyI/KeyE ДО всех гейтов).

## 4. Контракт `rosterSummary` (src/companions.js, ЧИСТАЯ функция)

```
rosterSummary(roster, npcs, efirData) →
  { members: [{npcId, name, level, loyalty, wage}],
    empty: boolean,
    efir: null | { level, maxHP } }
```

* `roster` — записи {npcId, level, xp, loyalty, hiredDay} (форма
  зафиксирована под сейв 000085 — НЕ трогать); функция НЕ
  мутирует (чистая: без DOM/Math.random/console/SETTINGS-мутаций).
* `npcs` — каталог (Game.NpcData.NPCS): источник имени
  (npc.имя) и жалованья (npc.найм.жалованье — НЕ из записи,
  прецедент wagesTotal L208-217).
* **`efirData` — ПАРАМЕТР** (не чтение G.efir внутри): null |
  {level, maxHP}. Почему: (а) ТЗ требует «строка Эфира» в чистой
  функции (tests/companions.test.js), но (б) контракт 000081:
  «Вне отряда companions — в companions.js НЕ добавлять» (Эфир —
  не член roster) и (в) UMD-ловушка 000038: снапшот Game при
  загрузке companions.js НЕ содержит efir.js (index.html:
  companions L599 → efir L605). Параметр разрешает всё: функция
  чистая, node-тест без efir.js, контракты не рвутся.
  ВЫЗЫВАЮЩИЙ (ui.js render) вычисляет efirData лениво через
  G.efir.efirStats.
* Строка members (порядок = порядок roster):
  * `npcId` — pass-through entry.npcId;
  * `name` — каталог `npcs.find(x => x && x.id === e.npcId)` →
    n.имя; «призрак» (нет в каталоге) → ГОЛЫЙ npcId (тихий,
    паттерн 000029/000083);
  * `level` / `loyalty` — pass-through с клампом:
    Number.isFinite && ≥0 (level: ≥1) → value, иначе 1 / 0
    (панель не рендерит «undefined»);
  * `wage` — `n && n.найм && typeof n.найм.жалованье === 'number'`
    → value, иначе **null** (ghost ИЛИ NPC без найм-данных —
    хвост «жалованье W з/день» в UI отсутствует; null, не 0 —
    0 было бы «жалованье 0 з/день»).
  * Мусорные записи (null / без npcId) — тихий skip (запись не
    даёт строку).
* `empty` — `!Array.isArray(roster) || roster.length === 0`
  (состояние отряда; Эфир НЕ делает отряд непустым — «Отряд
  пуст…» про спутников; строка Эфира показывается независимо,
  если efirData — не null).
* `efir` — `efirData == null` → null; иначе оба поля — finite
  number (level ≥1, maxHP ≥0) → `{level, maxHP}` (числа как
  переданы); иначе null (мусорный efirData — как отсутствует).
  КЛЮЧЕЙ loyalty/wage в efir-объекте НЕТ (000081: не наёмник).
* **totalWagePerDay НЕ добавляется** — ТЗ не требует (в UI сумма
  не показывается); сумма уже покрыта существующим экспортом
  wagesTotal — не дублировать.
* Регион вставки: после `dismiss` (~L204, перед разделом «---
  Жалованье и лояльность»); экспорт — в хвост return-объекта
  (L376-380) с комментарием (паттерн 000082). Конфликт хвоста
  с 000085 (serializeRoster/deserializeRoster) — ожидаемый,
  аддитивный, резолвится при ребейзе.

## 5. Проводка main.js (ханки, разнесённые по зонам)

1. **A. init** (сразу после блока roster/deadMercs — после
   `if (!hasCompanions)` console.error-блока, ~L309, ДО блока
   «Задача 000076» ~L310):
   ```js
   // Панель «Отряд» (задача 000086): ЖИВЫЕ ссылки — мутация
   // roster (hire/dismiss/payWages) и efir (addEfirXp) видна
   // панели без re-wiring; onChange — сейв (saveNow, hoisted).
   if (G.squadUI && typeof G.squadUI.init === 'function') {
     G.squadUI.init({ roster, efir, onChange: saveNow });
   } else {
     console.error('main.js: Game.squadUI отсутствует — src/ui.js ' +
       'обязан грузиться ДО src/main.js (000086) — панель ' +
       '«Отряд» отключена');
   }
   ```
   В ВСЕХ существующих vm-бутах с main.js (полная цепочка
   index.html: building-actions BA5, main-visuals) ui.js на месте
   → console.error НЕ срабатывает → errors.length === 0 держится.
2. **B. KeyC в keydown** — СРАЗУ ПОСЛЕ ветки KeyI (~L836-838),
   ДО ветки KeyE, ДО гейтов combatUI/dungeonUI/npcUI/buildingUI:
   ```js
   if (e.code === 'KeyC' && G.squadUI) { // C (С) — панель «Отряд» (000086)
     G.squadUI.toggle();
     return;
   }
   ```
   * **KeyC СВОБОДНА — СВЕРЕНО В КОДЕ**: main.js keydown — только
     KeyI/KeyE/moveKey; COMBAT_KEYS (src/combat-keys.js) —
     движение+J/K/Q/R/B/E/T/U/F/Space (KeyC нет); controls.js
     CODE_DIRS/KEY_DIRS/TOUCH_KEY_CODES — нет; grep `KeyC` по
     src/+tests/ — только ложные срабатывания подстроки в
     touchKeyCode. 000048/000052 — не заняли (проверено).
     ТЗ: «если заняли — выбрать новую и зафиксировать в отчёте» —
     НЕ заняли, KeyC остаётся.
   * Позиция ПОСЛЕ KeyI (не после KeyE): ветка KeyE — зона
     параллельной 000107 ([E]/buildingUI) — ханк держим вдали.
   * Семантика = KeyI: работает поверх ОТКРЫТЫХ оверлеев
     (документ. прецедент, observation 000048/000071 — не
     регрессия, общий keydown).
   * НЕ добавлять KeyC в COMBAT_KEYS (в бою [C] не боевое
     действие; describeCombatKeys бросит при дубле; в бою KeyC
     доходит до main.js-ветки только если combat-ui не
     consumed — комбат-таблица её не знает → main.js переключит
     панель — ровно как KeyI; допустимо).
3. **C. Закрытие при старте боя** — в ВСЕХ ТРЁХ входах (паттерн
   000096: «панель ЗАКРЫВАЕТСЯ при старте боя во ВСЕХ входах»),
   СРАЗУ ПОСЛЕ существующей playerUI-строки:
   ```js
   if (G.squadUI && G.squadUI.isOpen()) G.squadUI.toggle(false);
   ```
   Обоснование (ТЗ молчит, но «паттерн панели персонажа
   G.playerUI» включает это задокументированное поведение):
   боевой оверлей z-20 непрозрачный (000125) — панель под ним
   устаревает (000087 в onEnd мутирует уровни roster; Эфир
   addEfirXp в finish).
   Структурный пин tests/ui-panel.test.js
   (`/isOpen…playerUI.toggle(false)/g` ≥ 3) НЕ ломается:
   squadUI-строка НЕ соответствует regex (ищет 'playerUI') и
   не создаёт новых совпадений.
4. **D. 2 строки render в npcUI.onOverlayClick** (src/ui.js):
   * hire, r.ok: ПОСЛЕ `G.playerUI && G.playerUI.render();`
   * dismiss, r.ok: ПОСЛЕ `renderTab();` (там playerUI.render
     сознательно нет — прецедент «accept»: возврата денег нет;
     для squadUI render НУЖЕН — состав панели изменился)
   ```js
   G.squadUI && G.squadUI.render();
   ```
   Диалог z-20 поверх, панель z-10 под ним: без строк панель под
   открытым диалогом устаревала бы после найма/увольнения. Для
   тестов 000083 (U5/U8) — no-op (в их песочницах панель не
   инициализирована: render() → `if (!panel) return`).

НЕ ТРОГАТЬ: `__game.state` getter (roster НЕ добавлять — ТЗ не
требует; efir-коммент «точка для 000086/000116» остаётся —
000116 использует; панель берёт данные через init-проводку);
collectSaveData/restoreFromSave (000085); hud (000093);
buildingActions-бандл (000107).

## 6. CSS (index.html, аддитивный чанк в КОНЦЕ <style>)

```css
/* Панель «Отряд» (задача 000086): глобальный оверлей уровня
   .char-panel (z-10) — ниже боевых/подземельных оверлеев (z-20);
   .fs-btn (z-15) панель НЕ перекрывает: bottom 56px — выше
   верхней кромки кнопки (как .char-panel). Контент — узкая
   колонка (≤3 наёмника + Эфир). Чужие .cp-* правила не
   переопределяются; строки переиспользуют СУЩЕСТВУЮЩИЕ глобальные
   .cp-itemrow/.cp-itemname/.cp-itemmeta/.cp-btn (index.html
   L91-111) — тултипы .cp-tip скоуплены под .char-panel и в
   .squad-panel НЕ действуют (у панели нет .cp-tip — корректно). */
.squad-panel { position: fixed; top: 12px; left: 12px; right: 12px;
  bottom: 56px; display: flex; flex-direction: column;
  color: #e8dcc0; font: 13px/1.45 ui-monospace, monospace;
  background: rgba(16, 18, 24, 0.92); border: 1px solid #4a4433;
  border-radius: 12px; padding: 12px 14px; z-index: 10; }
.squad-body { flex: 1; overflow-y: auto; min-height: 0;
  max-width: 560px; margin-left: auto; margin-right: auto; }
.squad-xp { width: 100%; height: 4px; background: #2c3040;
  border-radius: 2px; margin-top: 2px; }
.squad-xp-fill { height: 100%; width: 0; background: #d8c27a;
  border-radius: 2px; }
```
SVG-ассетов НЕТ (кнопки текстовые — как все кнопки npcUI/
playerUI) → tests/svg.test.js не затронут.

## 7. ТОЧНЫЕ литералы (пины vm-тестов — не переименовывать)

* заголовок: «Отряд»;
* close-кнопка: «закрыть [C]/[Esc]» (паттерн «закрыть [I]/[Esc]»);
* пустой отряд: «Отряд пуст. Наймите спутников в таверне.»
  (ТОЧНО строка ТЗ; ДРУГОЙ слой, чем «Отряд пуст.» вкладки 000083
  — НЕ путать);
* строка наёмника: «уровень N · лояльность L» (+ при wage —
  « · жалованье W з/день») — та же, что у 000083;
* кнопка: «уволить» (data-squadact='dismiss', data-npcid);
* строка Эфира: имя «Эфир», «уровень N · HP M/M · всегда со
  мной» (M = maxHP: L1=16, L3=18, L5=20… — efirStats);
* XP-бар — по КОНТРАКТУ 000081 §6 («000086: … xp-бар до
  xpForNext(level)» — стабильный контракт смерженной задачи
  явно назначает 000086); ТЗ 000086 перечисляет минимум
  («уровень, HP «всегда со мной»») с отсылкой «(000081)». Бар —
  данные только (efir.xp + G.xpForNext, уже существуют), новых
  механик НЕТ. Если ревью откажет — удаляется одной строкой
  render + 2 CSS-правилами (риск зафиксирован).

## 8. Тесты (красные) — 14: 5 node + 9 vm/структурных

### tests/companions.test.js (node; секция «000086» в конце)
* ТЕХНИЧЕСКАЯ правка: `API_KEYS += 'rosterSummary'` (дин.
  deepEqual-пин API в 2 тестах — node L137 и браузерная цепочка
  L648 — проходит без семантических правок).
* **S1** — `typeof C.rosterSummary === 'function'` + ключ в
  API_KEYS (сейчас: undefined).
* **S2** — 2 записи (merc_volk + merc_ashka, реальный каталог
  npc-data) → members: имя из каталога (Вольк/Ашка), level,
  loyalty, wage (1/1 — найм.жалованье); порядок = порядок
  roster; ЧИСТОТА: JSON-снимок roster до/после — не мутирован.
* **S3** — ghost (npcId не в каталоге) → name = голый npcId,
  wage = null, без броска; + NPC из каталога БЕЗ найм-данных
  (например, тавернщик Берта) → wage = null (не 0).
* **S4** — efirData {level:1, maxHP:16} → efir: {level:1,
  maxHP:16}; в efir-объекте КЛЮЧЕЙ loyalty/wage НЕТ; efirData
  null → efir: null.
* **S5** — пустой roster → members: [], empty: true, efir на
  месте (если efirData передан); empty НЕ зависит от Эфира.

### tests/squad-panel.test.js (НОВЫЙ файл)
* **CHAIN (цепочка A)** = CHAIN tests/npc-hire-ui.test.js +
  **'efir.js' ПОСЛЕ 'companions.js'** (зеркало index.html
  L599→L605; пин index-order L843-849 подтверждает порядок).
  DOM-стаб — дубль стаба tests/npc-hire-ui.test.js (дублирование
  стабов принято в проекте). Cross-realm: пины — примитивы/
  JSON/текст, НЕ deepStrictEqual на объекты песочницы.
  Запись отряда — литерал в ЗАФИКСИРОВАННОЙ форме
  {npcId, level, xp, loyalty, hiredDay} (роster через
  G.companions.createRoster() + push — hire-машина не нужна,
  найм покрывают тесты 000083).
* **P1** — цепочка грузится чисто (errors === 0); G.squadUI
  существует (init/toggle/render/isOpen — function); до init
  toggle — no-op (isOpen false, body пуст).
* **P2** — init({roster: live(2 записи), efir: G.efir.
  createEfir(), onChange: stub}) → toggle() → div.squad-panel
  в body, display 'flex', isOpen() true; у каждой строки
  наёмника: .cp-itemname = имя каталога, .cp-itemmeta содержит
  «уровень N», «лояльность L», «жалованье W з/день», button
  «уволить» [data-squadact='dismiss'][data-npcid].
* **P3** — строка Эфира: «Эфир», «уровень 1», «HP 16/16»,
  «всегда со мной»; .squad-xp/.squad-xp-fill (width '0%' при
  xp=0); В СТРОКЕ ЭФИРА НЕТ: «лояльность», «жалованье»,
  button[data-squadact]. init с efir: null → строки «Эфир»
  НЕТ, наёмники рендерятся, errors не растут.
* **P4** — пустой roster → ТОЧНАЯ строка «Отряд пуст. Наймите
  спутников в таверне.»; .cp-itemrow в блоке наёмников НЕТ;
  строка Эфира ЕСТЬ (efir передан).
* **P5** — увольнение из панели: клик button[data-squadact=
  'dismiss'] (panel.listeners.click[0]({target: btn}), паттерн
  ui-panel) → live-roster мутирован (splice: ТА ЖА ссылка,
  length −1), onChange ровно ×1, панель перерисована (строки
  нет; при пустом — «Отряд пуст…», Эфир строка осталась);
  повторный клик по отсутствующему id — краха нет, onChange
  НЕ вызван.
* **P6** — полный бут (паттерн bootSandbox tests/
  building-actions.test.js: WebGL-стаб, winListeners, drain
  setImmediate ×3 — игра стартует, errors.length === 0):
  keydown {code:'KeyC'} через winListeners → div.squad-panel
  в body (пустой отряд: «Отряд пуст…» + строка Эфира),
  isOpen() true; повторный KeyC → display 'none', isOpen
  false. РЕГРЕССИЯ в том же тесте: keydown {code:'KeyI'} →
  панель персонажа .char-panel открывается (KeyI жив).
* **S1** — структурный main.js (чтение текста, паттерн
  tests/combat-keys.test.js L267): в keydown —
  `e.code === 'KeyC'` → `G.squadUI.toggle()` + return; позиция:
  МЕЖДУ ветками KeyI и KeyE (ПОСЛЕ `e.code === 'KeyI'`, ДО
  `e.code === 'KeyE'`, ДО `const k = moveKey(e);`).
* **S2** — структурный main.js: `G.squadUI.init(` с
  'roster', 'efir', 'saveNow' внутри объекта аргументов.
* **S3** — структурный main.js:
  `/isOpen\s*\(\s*\)[\s\S]{0,120}?squadUI\s*\.\s*toggle\s*\(
  \s*false\s*\)/g` ≥ 3 (закрытие во ВСЕХ входах боя — зеркало
  ui-panel-пина playerUI).
* (Опционально, НЕ входит в 14) — CHAIN без companions.js:
  read-only строки, кнопок dismiss НЕТ, ОДНА console.error
  (деградация, паттерн tests/npc-hire.test.js).
* **RED-проверка**: npm test → падают ТОЛЬКО 14 новых
  (S1-S5: `C.rosterSummary is not a function`/AssertionError —
  экспорт отсутствует; P1-P6: G.squadUI undefined / элемента
  нет / ветки KeyC нет — осмысленные падения, НЕ синтаксис;
  цепочка A грузится чисто); остальные 1377 — зелёные.
  GREEN: 1377 + 14 = **1391 pass, 0 fail**. Flake чужого
  vm-бута — перепуск `node --test tests/<файл>` + запись в
  отчёт.
* **Ручной сценарий** (в отчёт tasks/result): мир → [C]/[С] →
  состав (имя/уровень/лояльность/жалованье) + Эфир (ур/HP/
  «всегда со мной», xp-бар); [C] → «уволить» → сейв (saveNow);
  таверна [E] → найм/увольнение в диалоге → открытая панель
  под диалогом перерисована; пустой отряд — строка; [C] в бою/
  подземелье — переключает как [I]; старт боя закрывает панель;
  Esc — цепочка (диалог z-20 закрывается первым); WASD/стрелки —
  движение не задето.

## 9. Что важно будущим задачам (из ТЗ-ссылок)

* **000116 (вкладка «Эфир» панели персонажа — downstream)**:
  точка расширения — СТРОКА ЭФИРА в панели «Отряд» (стаб
  000086): 000116 добавит ТОЛЬКО переход (data-атрибут +
  click-ветка в делегированном обработчике — аддитивно),
  «строку НЕ переделывать». Строку Эфира НЕ переименовывать/
  переносить; хоткей KeyC — стаб, не трогать. Кнопку-переход в
  000086 НЕ делать (scope 000116).
* **000085 (сейв отряда/Эфира — параллельно)**: roster/efir в
  main.js — const/live-ссылки, панель держит их ЖИВЫМИ через
  init — restoreFromSave ОБЯЗАН восстанавливать СТРОГО in place
  (roster: length=0 + push; efir: Object.assign в тот же объект
  — НЕ заменять ссылки, иначе панель потеряет данные). Конфликт
  мержа: src/companions.js (хвост return-объекта: rosterSummary
  vs serializeRoster/deserializeRoster — аддитивный) +
  tests/companions.test.js (API_KEYS — обе задачи расширяют);
  main.js — регионы разведены (init ~L309 vs collectSaveData
  ~L355+).
* **000087 (опыт/гибель спутников в бою)**: панель ЗАКРЫВАЕТСЯ
  при старте боя (3× close) → onEnd НЕ обязан звать
  G.squadUI.render(); после боя повторный [C] — свежие данные
  (live-ссылки). Мутирование roster в onEnd (applyCombatXp)
  видно панели через ту же ссылку.
* **000107/000093 (параллельно, main.js)**: зоны разведены —
  наш keydown-ханк (KeyC после KeyI) не задевает KeyE-ветку
  (000107) и hud (000093); мелкие аддитивные ханки решаются
  ребейзом.
* **SPEC.md** — раздел «Спутники» → «UI» пункт 2 («Панель
  «Отряд»… задача 000051») и «Дух Эфира» → «UI» (строка Эфира)
  — реализуются 000086; правок SPEC.md НЕТ (не в файлах ТЗ).
* **CHANGELOG.md** (на мерже): «### Интерфейс»: панель «Отряд»
  — клавиша [C]/«С»: состав отряда (имя/уровень/лояльность/
  жалованье), Эфир «всегда со мной», «уволить» из панели.
  Программа (rosterSummary/проводка) НЕ перечисляется.

## 10. Подводные камни

1. **UMD-ловушка 000038 (×3)**: (а) ui.js снимает G при
   загрузке — на загрузке НОЛЬ чтений companions/efir/NpcData
   (vm-песочницы без модулей обязаны грузить ui.js чисто);
   (б) снапшот companions.js НЕ содержит efir.js (L599 < L605) —
   rosterSummary НЕ читает G.efir (efirData — параметр);
   (в) efirStats/xpForNext читаются в ui.js ЛЕНИВО в момент
   render (rootRef) — даже при смене порядка цепочки деградация
   тихая, краха нет.
2. **Состав панели персонажа ЗАПИНЕН** (tests/ui-panel.test.js:
   2×3 вкладки, ОДИН click, CSS, структурные main.js-пины) —
   .squad-panel — СВОЙ класс, чужие правила не трогаем;
   squadUI-строки в main.js НЕ ломают regex playerUI-закрывателей
   (≥3) — добавлены ПОСЛЕ playerUI-строк.
3. **Литерал saveNow в src/ui.js — НЕТ** (фиксатор
   tests/ui-panel.test.js 000100) — в комментариях squad-блока
   формулировка «сейв в main.js», не saveNow.
4. **Форма roster-entry заморожена** (deepEqual L719, сейв
   000085) — rosterSummary read-only; запись НЕ расширять/НЕ
   мутировать. Детерминизм-золота (REFUSE_DAYS/SEED_PIN) —
   панель не вносит RNG (dismiss — детерминирован, без сида).
5. **Строка Эфира ≠ вкладка «Эфир»**: панель «Отряд» (000086) —
   ур/HP/«всегда со мной»/xp-бар; вкладка персонажа (000116) —
   атрибутика/пул/книга. Два разных UI; строку НЕ переделывать
   под 000116 — только аддитивный переход.
6. **Esc-стек**: squad-гарды = точная копия playerUI (npcUI →
   combatUI.result); обе z-10 панели разом — Esc закрывает обе
   (документ. крайний случай, не чинить). Диалог/бой z-20 —
   верхний слой, его Esc закрывается своим window-слушателем.
7. **Cross-realm (vm)**: объекты песочницы — чужой realm — пины
   примитивами/текстом/длинами, НЕ deepStrictEqual/instanceof
   (правило 000082).
8. **main-visuals/BA5 (errors.length === 0)**: G.squadUI
   определяется при загрузке ui.js БЕЗ load-time зависимостей →
   load-time console.error main.js не срабатывает в полных
   бут-тестах; init вызывается до загрузки карты, DOM — только
   на toggle (в «снисходительном» Proxy-DOM бута безопасно).
9. **npc-hire(-ui).test.js**: 2 строки `G.squadUI &&
   G.squadUI.render()` в onOverlayClick — no-op (панель не
   инициализирована в их песочницах); деградационный рендер
   000078 побайтово не меняется (squad-блок не трогает
   renderHireTab).
10. **Мерж**: master ушёл (7ab2c03 → …) — ребейз обязателен;
    горячие файлы: ui.js (squad-блок L972-982 — своя зона;
    npcUI — 2 строки), main.js (4 зоны, разведены с
    000085/000093/000107), companions.js (хвост — с 000085),
    index.html (CSS-чанк в конце <style>), CHANGELOG.md (union).
    .merge-pending — стадия мержа, на проектировании НЕ создаётся.

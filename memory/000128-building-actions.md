# 000128: src/building-actions.js — роутер [E] + таблица спец-действий

Статус: ПРОЕКТИРОВАНИЕ завершено (контракт зафиксирован до кода).
Реализация — стадии красных/зелёных тестов ветки task/000128 (worktree
.worktrees/task-000128, база master 1885163).
План: memory/main-js-split-plan.md (000127 → 000128 → 000129).
Родительская цепочка: 000064 (эффекты); контракт — для подзадач
000074/000077/000091–000095.
Рефакторинг БЕЗ смены поведения: детерминизм (ноль новых RNG), сейвы
(те же поля/формы v1), HUD-вывод побайтово, [E]-путь и гарды isActive
(000071/000105) — та же семантика.

## 1. Статус / файлы / порядок загрузки / пины

* `src/building-actions.js` — НОВЫЙ. Чистый UMD по образцу
  src/building-effects.js (обёртка идентичная по форме):

      (function (root, factory) {
        if (typeof module === 'object' && module.exports) {
          module.exports = factory();
        } else {
          const G0 = typeof root.Game === 'object' ? root.Game : {};
          root.Game = Object.assign({}, G0, { buildingActions: factory() });
        }
      })(typeof globalThis !== 'undefined' ? globalThis : self,
      function () { ... });

  * factory() БЕЗ аргументов. В момент загрузки — НОЛЬ зависимостей:
    ни require, ни DOM, ни чтения Game, ни console (000038/000053:
    гарды — только на вызове). vm-песочницы цепочек подхватывают
    скрипт без ошибок (B1-семантика: errors.length === 0).
  * Game-ссылки — ОДИН снапшот (000038): модуль НЕ снимает
    globalThis.Game; весь доступ к Game — через deps.game (снапшот
    main.js `const G = globalThis.Game`, строка 13), лениво в момент
    вызова. Node-ветка: `module.exports = factory()`; node-тесты
    проходят fake deps.game — globalThis.Game в тестах НЕ
    трогается (в отличие от withGame-паттерна building-effects).
* `index.html` — `<script src="src/building-actions.js"></script>` —
  СРАЗУ ПОСЛЕ тега building-ui.js (master L428), т.е. новая строка
  429, ДО visuals-data.js/main.js. Решение (a2-архитектура):
  доменная группа building-effects(399) → building-ui(428) →
  building-actions(429); свободный слот 430..436 — под hud.js
  (000129, «после building-actions.js») и будущие спец-модули.
  CSS — нет нового.
* Пины tests/index-order.test.js:
  (а) тест «index.html: нужные модули подключены» — добавить
      'src/building-actions.js' в массив (техническая правка);
  (б) новый тест IO1: pos('src/building-actions.js') !== -1;
      pos('src/building-ui.js') < pos('src/building-actions.js');
      pos('src/building-actions.js') < pos('src/main.js').
      НЕ закреплять adjacency к main.js: будущие спец-модули
      вставляются МЕЖДУ building-actions.js и main.js (свой пин —
      своя задача).
* Порядок загрузки (контракт):
  building-effects.js (399) → … → building-ui.js (428) →
  building-actions.js (429) → [спец-модули 000077/000091–95 —
  сразу после предыдущего спец-модуля] → … → main.js (437).
  main.js в wiring-блоке (~L620, ДО секции «Ввод») вызывает
  G.buildingActions.init(deps). Саморегистрация спец-модулей —
  в момент СВОЕЙ загрузки (между building-actions.js и main.js):
  registerSpecial работает БЕЗ init (таблица — модульное поле;
  dispatch читает её в момент вызова — init к тому моменту
  сработан main.js).

## 2. Контракты и границы

### 2.1 Публичная поверхность Game.buildingActions

| Поле | Назначение |
|---|---|
| `init(deps)` | проводка main.js (load-time, один раз); deps — бандл §2.2 |
| `toggle()` | роутер [E] (1:1 перенос toggleNpcDialog); вызывается KeyE и touch onInteract |
| `openBuildingUI(t, b, npc)` | 1:1; возвращает false при пустом списке/без buildingEffects |
| `onBuildingAction(action, t, b, npc)` | 1:1 + dispatch specials (§2.4) |
| `buildingRecForTile(t)` | 1:1; ЭКСПОРТИРОВАНА — её вызывает main.js (hudUpdate, debug openNpc) |
| `openNpcDialog(npc, t)` | 1:1; экспорт — делегация debug openNpc (дедуп) |
| `scanTeleportPair(x, y, b)` | 1:1; экспорт — прямой пин скана для 000093+ |
| `specials` | ТАБЛИЦА спец-действий `{ effectId: fn(ctx) }` — обычный объект, self-registration в момент загрузки спец-модулей |
| `registerSpecial(id, fn)` | гард-регистрация (§2.6); работает ДО init |

Имена — 1:1 по перенесённым функциям (кроме toggleNpcDialog →
toggle — имя зафиксировано ТЗ: «KeyE → Game.buildingActions.
toggle()»).

### 2.2 deps-бандл init (явные ссылки из main.js-проводки)

Точка wiring-блока в main.js: сразу ПЕРЕД `// --- Ввод ---`
(master L622), после findSpawn (L620). Все зависимости
инициализированы (hero 196, NPCS 200, questBook 201, npcShopFor
206, player 216, prevPos 217, mover 227, clock 240,
buildingOncePerDay 255, buffs 256, teleports 261, collectSaveData
307, saveNow 337, hudFlash 575); до keydown (919) и touch-init
(984) — первое нажатие [E] работает. Замыкания ссылаются на
let-переменные (map L193, spriteLoader L81) — TDZ не нарушается
(вызов позже инициализации).

    G.buildingActions.init({
      game: G,               // снапшот main.js (L13, 000038) — единственный Game
      clock,                 // live clock (.day; .fastForward/.rest — доступны)
      hero,                  // ЖИВАЯ ссылка (спец-хендлеры мутируют: gold и пр.)
      player,                // live { x, y }
      prevPos,               // live { x, y } (escape-hatch в world)
      getMap: () => map,     // GETTER: map — let, назначается L1965 после асинхр. загрузки
      mover,                 // const (L227) — live-ссылка, НИКОГДА не перезаписывается
      npcs: NPCS,            // каталог (зеркало assets/npc, L200)
      questBook,             // nullable (createQuestBook нет → null)
      npcShopFor,            // (npcId) → { npc, stock } | null (сток npcStocks — main.js)
      collectSaveData,       // () → снимок сейва (чистая)
      saveNow,               // () → запись в localStorage
      flash,                 // (msg) → hudFlash = msg; hudFlashUntil = performance.now() + 5000
      buildingOncePerDay,    // live Map 'x,y:effectId' → день (000072; restore in place L458–460)
      buffs,                 // live Array (000072/000076; restore in place L482–483)
      teleports,             // live Map 'x,y' → { pair, dest, active } (000075; restore L512–514)
      playerRender,          // () → G.playerUI && G.playerUI.render()
      moveHero,              // (x, y) → player.x/y = x/y; prevPos-синк; if (mover) mover.teleport
      startCombat,           // (groupType = 0) → бой на текущем тайле (sem §2.7)
    });

* flash/moveHero/playerRender/startCombat — именованные
  замыкания, определённые в wiring-секции main.js (рядом с
  init-вызовом). flash — ПОБайТОВО эквивалентен 4 инлайновым
  местам onBuildingAction (константа 5000, оба let) — иначе
  HUD-тайминг флэшей сдвинется (инвариант).
* moveHero — 1:1 телепорт-ханк L711–714 (снап мувера 000033).
* Ссылки live безопасны: restoreFromSave восстанавливает ВСЕ
  разделы in place (buildingOncePerDay.clear()+set; buffs.
  length=0+push; teleports.clear()+set; hero — Object.assign) —
  живые ссылки не устаревают. Единственный перезаписываемый
  let — map → getter ОБЯЗАТЕЛЕН (без него после загрузки карты
  [E] сломан/ошибка — риск a1#2).
* Отсутствие модуля при загрузке main.js (регрессия порядка):
  `if (G.buildingActions) { init } else { console.error('main.js:
  [E] — Game.buildingActions отсутствует — src/building-actions.js
  обязан грузиться ДО src/main.js') }` (стиль L903) — [E] инертен,
  игра не роняется (000053).

### 2.3 Как добавить спец-действие (контракт для 000077/000091–000095)

Три правки, main.js и building-actions.js НЕ правятся (критерий
ТЗ; regression-тест: main.js не содержит onBuildingAction — BA7):

1. **Чистая запись EFFECTS** в src/building-effects.js (в КОНЕЦ
   объекта): `{ имя, разВДень?, available?(state), apply?(state)
   → { ok, message?, teleport?, buffs? } }` — по снимку, как
   000075/000076 (state = { day, tile, hero, save, map } — тот же
   контракт 000072; apply ЧИСТЫЙ — мутирует только world-ссылки,
   которые у него есть).
2. **Спец-модуль** (если есть «сторона» — мир-действие, которого
   нет в apply): НОВЫЙ файл src/building-effect-<id>.js (UMD/IIFE,
   чист при загрузке) с саморегистрацией в момент загрузки:

       Game.buildingActions.registerSpecial('<effectId>', function (ctx) {
         // мир-действие через ctx (узкие точки) — без копаний по Game
         return { ok: true, message: '…' };   // или { ok: false, message }
       });

3. **Script-тег** в index.html — ПОСЛЕ building-actions.js (сразу
   после предыдущего спец-модуля), ДО main.js + пин порядка в
   tests/index-order.test.js.

* Ключ — **effectId** (= action.id из оверлея = ключ EFFECTS-
  реестра), НЕ buildingId: действия листятся по effectIds(b),
  dispatch — по action.id. Конвенция 000072: латиница, БЕЗ
  ':'/','/пробелов (критично: маркировка сейва
  'x,y:effectId' — мусорный ключ restoreDayMap молча отбрасывает
  → потеря раз-в-день состояния).
* Если «стороны» нет (чистый apply + r.teleport/r.buffs) — п. 2
  НЕ нужен: существующие стороны работают из общего пайплайна
  (§2.5).

### 2.4 Пайплайн onBuildingAction (1:1 + specials)

Точная последовательность (контракт для зелёной стадии):

    entry = game.buildingEffects.EFFECTS[action.id]   // РЕЕСТР ПЕРВЫМИ (000071 раунд-3)
    r = null
    if (entry && typeof entry.apply === 'function') {
      r = entry.apply({ day, tile: {x, y}, hero, save: collectSaveData(), map: map || null })
      if (!r || !r.ok) { if (r && r.message) flash(r.message); return }   // отказ apply — 1:1
      if (r.teleport)      { …ханк 000075 1:1: teleportCharge (каталог.стоимость),
                            отказ → flash(ch.message)+return; hero.gold, info.active,
                            moveHero(r.teleport.x, r.teleport.y) (player+prevPos+mover)… }
      if (r.buffs)         { …хук 000076 1:1: buffs.length = 0; push все… }
    }
    sres = null
    sp = specials[action.id]
    if (typeof sp === 'function') {
      sres = sp(ctx)                                            // ctx — §2.5
      if (!sres || !sres.ok) { if (sres && sres.message) flash(sres.message); return }
      // отказ спец-а = семантика отказа apply: flash, БЕЗ маркировки/saveNow/render
    }
    if (!r && !sres) {
      // «НЕТ ДЕЙСТВИЯ»: entry без apply и без спец-а (и без записи).
      // 'dialog' — Фолбэк NPC-диалога (1:1: без save/flash/маркировки):
      if (action.id === 'dialog' && npc) openNpcDialog(npc, t);
      return;
    }
    if (game.buildingEffects.hasDailyLimit(b, action.id))
      buildingOncePerDay.set(player.x + ',' + player.y + ':' + action.id, clock.day)
    saveNow()
    msg = (r && r.message) || (sres && sres.message); if (msg) flash(msg)
    playerRender()

* ПРОВЕРКА 1:1 на текущих эффектах ('36'/'37'/'38'/'41' — все с
  apply, specials ПУСТА): ветки отказ/teleport/buffs/маркировка/
  save/flash/render — те же строки в том же порядке; msg =
  r.message (sres === null) — совпадает; «37» (без apply) —
  !r && !sres → не 'dialog' → молча return (1:1).
* ВАЖНО (поправка к псевдокоду a2-анализа): фолбэк 'dialog' —
  ВНУТРИ ветки «нет действия» (!r && !sres), а НЕ после неё.
  Иначе диалог никогда не открылся бы (ветка return'ила бы до
  него). Приоритет: запись EFFECTS['dialog'] (если появится)
  ПЕРЕБЬЁТ фолбэк (000071 раунд-3); спец-а на 'dialog' (если
  зарегистрируют) — тоже перебивает фолбэк (явный выбор задачи).
* try/catch вокруг спец-хендлера НЕ добавляется (1:1: выброс из
  apply и сегодня роняет так же; баг хендлера — баг задачи,
  который ловят ЕЁ тесты).

### 2.5 Форма ctx (собирается в момент dispatch specials)

    ctx = {
      day,        // clock.day (число, на момент вызова — ПОСЛЕ apply-сторон)
      tile,       // { x, y } — НОВЫЙ объект (снимок; после moveHero — новая позиция)
      hero,       // ЖИВАЯ ссылка: хендлер МОЖЕТ мутировать персонажа (gold — паттерн 000075)
      save,       // collectSaveData() — СВЕЖИЙ снимок на момент вызова
                  // (ПОСЛЕ apply-сторон: r.buffs/teleport уже в живом состоянии)
      map,        // live-ссылка (getMap() || null) — READ-ONLY по контракту (000076)
      r,          // результат apply (null — если записи нет apply'а)
      action,     // { id, имя, доступен, reason? } — строка оверлея
      b, t, npc,  // каталожная запись / тайл постройки / NPC | null
      clock,      // live clock (узкая точка: .day; .fastForward/.rest — резерв 000092)
      moveHero,   // (x, y) — перенос героя (player + prevPos + mover-снап)
      startCombat,// (groupType = 0) — бой на текущем тайле (резерв 000077)
      world,      // ВЕСЬ deps-бандл — escape-hatch (flash, saveNow, getMap,
                  // mover, prevPos, teleports, buffs, buildingOncePerDay, npcs,
                  // questBook, npcShopFor, collectSaveData, playerRender, game)
    }

* Снимок НЕ мутируется (000072): ctx.save — обычный объект;
  карта — read-only. ИСКЛЮЧЕНИЕ, зафиксированное 000075: hero —
  живая ссылка (телепорт-ханк пишет hero.gold).
* ctx.save — СВЕЖИЙ снимок (не объект state.apply): хендлер видит
  МИР ПОСЛЕ apply-сторон. Цена — одна лишняя сериализация на
  клик (не на кадр) — пренебрежимо.
* Узкие точки — явные ссылки из main.js-проводки (ТЗ: «не копает
  по Game»): стандартный хендлер использует поля ctx; world —
  только escape-hatch для будущих узких точек БЕЗ правок
  building-actions.js (в т.ч. world.game — полный Game-снапшот;
  документировано как допуск, а не рекомендация).
* Хендлеру, который хочет открыть диалог из спец-обработчика
  (гипотетическая «сторона диалога»), — G.buildingActions.
  openNpcDialog(npc, ctx.t) (экспорт).

### 2.6 Результат хендлера и guard'ы registerSpecial

* Результат: `{ ok: boolean, message?: string }` — тот же
  контракт, что apply (000071/000072). Отказ: message (если есть)
  → flash; БЕЗ маркировки раз-в-день, БЕЗ saveNow, БЕЗ
  playerRender (эффект не сработал — семантика отказа apply).
* registerSpecial(id, fn):
  * id — непустая STRING; fn — FUNCTION; id НЕ содержит ':'/','/
    пробелов (критично для ключа сейва 'x,y:effectId'). Нарушение
    → console.error + НЕ регистрировать (игра не роняется —
    000053).
  * Дубликат id → ПЕРЕЗАПИСЬ (last-wins, без ошибки) — зафиксировать
    тестом (BA4).
  * registerSpecial работает ДО init (саморегистрация спец-модулей
    при загрузке — раньше main.js-init) — init-гард на него НЕ
    распространяется.
* init-гард (000053): любой РОУТЕРНЫЙ вызов без init (toggle/
  openBuildingUI/onBuildingAction/openNpcDialog/buildingRecForTile/
  scanTeleportPair) → console.error('building-actions.js: init не
  вызван — проводка main.js отсутствует') + return (toggle —
  undefined; openBuildingUI — false; buildingRecForTile — null;
  остальное — undefined). Чистая сетка безопасности: в корректной
  цепочке init сработан load-time main.js.

### 2.7 startCombat — сигнатура и точка определения

* `startCombatAt(groupType = 0)` — ИМЕНОВАННАЯ функция main.js
  (hoisted), тело — ПОБайТОВО текущий __game.actions.startCombat
  (master L1861–1891: гард combatUI.isActive → null; закрытие
  playerUI.isOpen; закрытие buildingUI.isActive (стек 000096);
  combatUI.startCombat({ hero, tile: { mobGroup: groupType },
  terrain: map ? tileAt(...).terrain : undefined, spriteLoader,
  prev: {x, y}, seed: 42, day: clock.day, buffMods:
  currentBuffMods(), onEnd: (victory && questBook &&
  notifyGroupDefeated → notify; playerUI.render) })).
  Определение — в wiring-секции (рядом с init-блоком);
  __game.actions.startCombat → делегирование `startCombat:
  startCombatAt,` (одна точка истины; семантика debug-боя
  без изменений).
* Сигнатура зафиксирована под debug-старт (groupType = 0). Если
  000077 (босс) потребует другой onEnd/seed — расширение wiring-
  бандла (одна строка в main.js init) решается в 000077; контракт
  это допускает (world-escape-hatch в ctx + startCombat в бандле).

### 2.8 Существующие стороны r.teleport (000075) / r.buffs (000076)

Остаются в ОБЩЕМ пайплайне onBuildingAction (1:1-ханки после
apply) — это и есть их «вешалка» в building-actions.js после
переноса. Миграция в per-id specials — НЕ эта задача (сменила бы
семантику для будущих эффектов, возвращающих те же поля без
регистрации; building-effects.js не в Файлах ТЗ). Если
понадобится — отдельный поведенчески-нейтральный рефакторинг.

## 3. Что перенесено 1:1 / что остаётся в main.js

### 3.1 Перенесено в модуль (master L632–917, 286 строк с doc)

| Функция | master | Примечание |
|---|---|---|
| openNpcDialog(npc, t) | 633–645 | payload npcUI.open 1:1 (контракт 000010) |
| onBuildingAction(action, t, b, npc) | 655–743 | + dispatch specials (§2.4); маркировка L726–730, saveNow L731, flash L732–734, playerUI.render L736 — внутри |
| scanTeleportPair(x, y, b) | 756–800 | ноль RNG (hash2/TELEPORT_TIE_SEED — детерминизм; golden B13–B16) |
| openBuildingUI(t, b, npc) | 805–842 | скан 41 при первом подходе; buildingUI.open(onAction) |
| buildingRecForTile(t) | 852–859 | RESOLVE по buildingId (000076) |
| toggleNpcDialog() → toggle() | 869–917 | гарды 1:1: !npcUI → return; combatUI.isActive; **dungeonUI.isActive (000105) — в том же месте**; стек: buildingUI.isActive → close; npcUI.isActive → close (регрессия B4); деградация без buildingUI — console.error + прямой npcUI |

Смежное, переезжает ВМЕСТЕ (внутри тел): hudFlash при отказах
(L671–674, L705–706, L731–733) → deps.flash; saveNow (L731, L799);
G.playerUI.render (L736) → deps.playerRender; телепорт-перенос
player/prevPos/mover (L711–714) → deps.moveHero.

НЕ переносится (остаётся в main.js): npcShopFor + npcStocks
(cities.test.js:1420 фиксирует npcStocks в main.js — передать
явной ссылкой); состояние hero/NPCS/questBook/player/prevPos/
mover/clock/map/buildingOncePerDay/buffs/teleports; сейв-домен
(collectSaveData/saveNow/restoreFromSave — формат v1 без
изменений); HUD (hudFlash/hudFlashUntil/hudUpdate — 000129).

### 3.2 Тонкая проводка main.js (остаётся)

* УДАЛЯЕТСЯ: L632–917 (6 функций + doc) ≈ 286 строк.
* НОВЫЙ wiring-блок (~L620, перед «Ввод»): именованные замыкания
  flash/moveHero/playerRender + function startCombatAt +
  `G.buildingActions.init({...})` / console.error при отсутствии
  модуля. ≈ 40–45 строк с комментариями.
* keydown KeyE (L924–927): `if (e.code === 'KeyE' && G.npcUI) {
  if (G.buildingActions) G.buildingActions.toggle(); return; }`
  (гард && G.npcUI — 1:1; модуля нет → [E] инертен).
* touch (L991): `onInteract: () => { G.buildingActions &&
  G.buildingActions.toggle(); }` (возврат не потребляется —
  ui.js:1287).
* hudUpdate (L1610): `const bHere = G.buildingActions ?
  G.buildingActions.buildingRecForTile(t) : null;` —
  000053-деградация (модуля нет → нет [E]-хинта, игра не падает в
  HUD-кадре). САМ HUD не редактируется (000129).
* debug openNpc (L1893–1912): `if (!G.npcUI || !map ||
  !G.buildingActions) return false;` + `const b =
  G.buildingActions.buildingRecForTile(t);` + делегирование
  `G.buildingActions.openNpcDialog(npc, t);` (тела дублировались
  ПОБАЙТОВО — проверено; иначе во main.js остался бы второй
  [E]-подобный путь — нарушение критерия ТЗ).
* debug startCombat (L1861): `startCombat: startCombatAt,`.
* Механические правки КОММЕНТАРИЕВ (не поведение, тесты их не
  пиныли — проверено grep): L260 (openBuildingUI →
  building-actions.js), L932 (toggleNpcDialog →
  G.buildingActions.toggle()).
* НЕ ТРОГАТЬ: гейт движения L942 (`G.buildingUI &&
  G.buildingUI.isActive() return`), inBuilding в frame (L1711),
  buildingUI.close в боях (L1033/L1164/L1868), KeyI выше всех
  гейтов (L920), eHint HUD (L1606–1654 — 000129), locations-блок
  (000127: makeDungeonState/maybeEnterDungeon/exitDungeon/
  dungeonMove/makeCityState/maybeEnterCity/exitCity/cityMove —
  ~L1102–1363 ещё в main.js — НЕ перемещать, НЕ перестраивать),
  блок npcStocks, маркеры '// Проход 3' / '// Флогистон: idle/
  walk' (day.test.js:412), подстроки '(cam.y - ty)'/'(cam.y −
  ty)' и rgb-литералы НЕ вносить (map.test.js:828/1346).

### 3.3 Размер

* main.js: 1979 (master 1885163) → ≈ 1735–1760 (−286 + ~40 wiring;
  точная цифра — после зелёной стадии, фиксируется в отчёте).
  ТЗ «ещё 120–180» — оценка на старом master; направление верное,
  цифра выше (переезжают и длинные doc-комментарии) — не дефект.
* src/building-actions.js: ≈ 300–340 строк (286 перенос + UMD-
  обёртка + guards + specials-механизм + doc).

## 4. Ленивые ссылки и guards (сводка)

* Загрузка модуля: ноль чтения Game/DOM/require/console (000053;
  B1/B13–B16 errors.length === 0; vm-загрузка в одиночку — BA1).
* Game — через deps.game (снапшот main.js) лениво в момент вызова;
  свойства читаются при вызове (G.npcUI, G.buildingUI,
  G.dungeonUI, G.combatUI, G.buildingEffects, G.npcForBuilding,
  G.getBuilding, G.buildingForMapIndex, G.hash2, G.GLOBAL_SEED,
  G.buildingCount, G.buildingSize, G.buildingNameUi).
* Мир — через deps-ссылки (явные, из wiring); map — GETTER.
* Гарды на вызове: deps не инициализирован → console.error +
  return (§2.6); отсутствие buildingUI при toggle → 1:1-деградация
  (console.error-ТЕКСТ без изменений: 'main.js: [E], но
  Game.buildingUI отсутствует — src/building-ui.js обязан
  грузиться ДО src/main.js' — не «чинить» префикс, 1:1; test-pin
  на текст НЕТ — проверено grep); отсутствие buildingEffects при
  openBuildingUI → return false (1:1 L806).
* main.js: отсутствие модуля → console.error + [E] инертен +
  HUD-гард (§3.2).

## 5. Что важно будущим задачам

* **000077 (босс/buildingContent)**: спец-модуль + registerSpecial;
  мир-бой — ctx.startCombat (сигнатура §2.7); расширение бандла —
  в 000077. Резервный раздел сейва buildingContent — 000072.
* **000091–000095 (лечение/монета/отдых/…)**: heal/gold — ctx.hero
  (живая) + ctx.save (свежий снимок для проверок); отдых/смена дня
  — ctx.clock (live; fastForward); перенос — ctx.moveHero.
  Маркировка раз-в-день — АВТОМАТИЧЕСКИ роутером при hasDailyLimit
  (каталог.раз_в_день / запись.разВДень, 000072/000092) — хендлеру
  её НЕ нужно делать.
* **000093+ (новые телепорт-эффекты)**: стандартный путь — r.
  teleport из ЧИСТОГО apply (контракт 000075 — общий пайплайн,
  спец-модуль НЕ нужен); свой спец-обработчик — только при
  нестандартной стороне. scanTeleportPair — экспорт (прямой пин).
* **000129 (hud.js)**: hudUpdate переедет в hud.js ПОСЛЕ этой
  задачи — шов: замыкание flash в main.js init меняется (модуль не
  знает про hudFlash); buildingRecForTile — уже через
  G.buildingActions (hud.js унаследует ссылку).
* **Спец-модули**: порядок тегов — после building-actions.js, до
  main.js, каждый новый — сразу после предыдущего; пин порядка —
  обязательный (иначе UMD-ловушка 000038: модуль после main.js
  создаст НОВЫЙ объект Game, снапшот main.js его не увидит).

## 6. Подводные камни

1. **UMD-ловушка 000038**: building-actions.js ПОСЛЕ main.js →
   G.buildingActions в снимке main.js undefined → [E] молча
   деградирует. Защита: index-order-пин IO1 + vm-тест BA5
   (Game.buildingActions на месте в full-chain).
2. **map- getter**: `let map = null` до async-загрузки (L1965) —
   wiring по значению сломал бы [E] после загрузки карты.
3. **flash побайтово**: инкапсуляция 4 мест — константа 5000,
   оба let (hudFlash/hudFlashUntil) — иначе HUD-тайминг.
4. **Диалог-фолбэк ВНУТРИ «нет действия»**: псевдокод a2 был с
   недостижимым fallback — контракт §2.4 (поправка зафиксирована).
5. **registerSpecial ДО init**: init-гард не распространяется
   (саморегистрация при загрузке спец-модулей).
6. **Спец-а после apply-сторон**: ctx.save/ctx.tile — ПОСЛЕ
   apply (свежий снимок/новая позиция) — семантика зафиксирована,
   чтобы 000093+ не «расходились» с r.teleport.
7. **Стек оверлеев 1:1**: порядок гардов в toggle — npcUI →
   combatUI → dungeonUI (000105!) → buildingUI.isActive → close →
   npcUI.isActive → close — НЕ «улучшать» (B4).
8. **Детерминизм**: переносимый код — ноль Math.random/c._rng/
   generateSeedPixels; scanTeleportPair — hash2(x, y,
   GLOBAL_SEED)/TELEPORT_TIE_SEED; golden B13–B16 (окно ±R,
   предфильтр якоря, порядок cy→cx) — 1:1.
9. **Ребейз на мерже**: 000127 (locations ~L1102–1363) и 000129
   (HUD L1602–1703) правят тот же main.js — регионы не
   пересекаются с L632–917; последовательность 000127 → 000128 →
   000129 обязательна; 000128 мержится ПОСЛЕ 000127 с ребейзом на
   актуальный мастер.
10. **Статические фиксаторы main.js**: map.test.js:828/1346,
    day.test.js:412, cities.test.js:1420 — не двигать маркеры и
    npcStocks, не вносить запрещённые подстроки; пересечения с
    [E]-регионом НЕТ — зелёные без правок.
11. **BA7-критерий (ТЗ)**: main.js НЕ содержит подстроки
    'onBuildingAction' (closure L839 ушла); проводка на месте —
    'G.buildingActions' + '.toggle('; имена 6 функций в main.js —
    ТОЛЬКО как G.buildingActions.<имя> (hudUpdate, debug) и в
    обновлённых комментариях.
12. **console.error-текст деградации** — 1:1 (префикс 'main.js:'
    остаётся в модуле; сообщение по-прежнему верно).
13. **npm test — ВНУТРИ worktree** (memory/test-runner-worktrees.md:
    node --test сканирует .worktrees/ рекурсивно). Базовый замер:
    1200/1200 зелёных (~51 с).

## 7. Тесты (RED — 9 падений до реализации)

tests/building-actions.test.js (НОВЫЙ): BA1 (модуль на месте,
чистая загрузка, ноль зависимостей при загрузке), BA2 (маршрут
dialog vs effects: payload openNpcDialog 1:1; EFFECTS-запись →
apply(снимок) один раз, диалог не открывается), BA3 (реестр
ПЕРВЫМИ: EFFECTS['dialog'] перебивает спецкейс), BA4 (specials:
registerSpecial guards — плохой id/fn → console.error + не
зарегистрирован, дубликат → перезапись; вызов с ctx-контрактом;
отказ {ok:false} → flash без saveNow/маркировки; успех →
saveNow+render; entry без apply + спец → ctx.r === null;
саморегистрация vm-скриптом БЕЗ правок main.js — критерий
000074+), BA5 (vm full-chain index.html: Game.buildingActions —
вся поверхность, загрузка чистая, игра стартовала), BA6 (vm,
000053: модуль без buildingEffects/buildingUI — загрузка чистая;
toggle → console.error + деградация без исключения), BA7
(статика: main.js без /\bonBuildingAction\b/, с 'G.buildingActions'
и '.toggle(').
tests/index-order.test.js: IO1 + строка в «нужные модули».
Регрессия БЕЗ правок: building-effects.test.js (секция B — весь
[E]-путь: B3 «([E] действия)»/«  |  [E] действия», B4 «  |  [E]
диалог», saveNow сразу, маркировки, B13–B16 телепорт-golden,
B17–B20 храмы), npc-data, main-visuals, save-restore, city-screen
(vm-цепи подхватывают тег автоматически; boot errors===0).
Флейк: перепуск node --test tests/<файл> + запись в отчёт.

## 8. Ревью (раунд 1, 2026-10-01)

Finding (minor): к моменту мержа 000127 уже в master (6c76e7b;
main.js 1979 → 1822 строки) — обе задачи переписали Статус-секцию
memory/main-js-split-plan.md (каждая добавила блок в конец файла).
Вердикт: РЕАЛЕН. Сам ребейз — действие стадии мержа (ТЗ,
подводный камень 9), на стадии ревью проверен пробным ребейзом в
временном клоне (2026-10-01, ветка на master 6c76e7b):
* Конфликт — ТОЛЬКО в memory/main-js-split-plan.md, в ПЕРВОМ
  коммите (красные тесты): Статус-секция, оба блока вписаны в одно
  место (конец файла). Второй коммит (код: src/main.js,
  src/building-actions.js, index.html) накладывается ЧИСТО;
  tests/index-order.test.js — auto-merge без конфликта (регионы
  правок не пересекаются — подтверждено: ханки 000127 вне
  L632–917; дельта main.js та же — 103+/336− против обеих баз).
* Рецепт разрешения: объединить оба статус-блока — блок 000127 из
  master («ждёт мержа» → «смёрджено в master (6c76e7b)») + блок
  000128 из ветки (устаревшие ссылки «000127 ещё не в master» /
  «000127 — в работе» заменить фактом: 000127 в master 6c76e7b;
  размеры — ПОСЛЕ 1746 (база 1885163), 1589 (после ребейза)).
* После разрешения — полный npm test на ребейзном дереве:
  1221/1221 зелёных (1213 = master с 000127 + 8 новых: BA1–BA7 +
  IO1).
* Итоговый размер: src/main.js — 1589 строк после ребейза
  (1822 − 233; 233 — чистое уменьшение 000128: 1979 → 1746 на
  старой базе 1885163). ЗАФИКСИРОВАТЬ в отчёте tasks/result/
  000128.md (стадия Finalize).

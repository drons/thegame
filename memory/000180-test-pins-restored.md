# 000180 — Восстановление ослабленных/пропущенных тестовых пинов (ретро 000168/000169)

Контракт решения (станция Проектирование, 2026-10-10; worktree
`.worktrees/task-000180`, ветка `task/000180`, база master `0f18ed0`).
Тип задачи — **рефакторинг без смены поведения: ТОЛЬКО ТЕСТЫ**. src/,
index.html, CHANGELOG.md НЕ ТРОГАЮТСЯ НИ ПРИ КАКИХ ОБСТОЯТЕЛЬСТВАХ
(включая временные revert-проверки). Новых модулей/скрипт-тегов/
require-путей НЕТ. Базлайн: `npm test` → **1978/1978** (прогон #1 —
1977/1978, флейк не воспроизведён, лог /tmp/thegame-wf-000180/
baseline-full.log). После задачи: **1982** (1978 + 4 пина).

Источники находок: `tasks/result/000168-retro-20261009.md`
(2 major-по-тестам + 2 minor) и `tasks/result/000169-retro-20261009.md`
(1 major). Почему пины ослабли/пропали — `memory/000180-test-pins.md`.

## 1. Что добавлено (3 файла региона, 4 новых test + 1 точечный
фикс комментария)

| # | id | Файл / место | Что пинит |
|---|----|--------------|-----------|
| 1 | `000180 HEAL-1` | tests/efir.test.js, ПОСЛЕ «000112 EF-3» (после L1088, перед EF-4) | член `0.5·attrs[атрибут]` формулы allyHeal — support-наёмник с НЕНОЛЕВЫМ атрибутом |
| 2 | `000180 MOVE-1` | tests/efir.test.js, сразу после HEAL-1 | проверка allyMove «тут стоит игрок» (добавлена в 000168, unitAt игрока НЕ видит) |
| 3 | `000169 R8` | tests/ui-panel-htmlcollection.test.js, в конец (после R7) + R8 в header-комментарий | закрытие панели [I] по [Esc] через document-слушатель под HTMLCollection-стабом |
| 4 | `CU180-EFIR-ROW` | tests/combat-ui.test.js, НОВЫЙ блок в КОНЕЦ файла (после CU171-EFIR, L4098) | строка активного Эфира в stateEl (Д10 000168) побайтово + fallback c.efs=null |
| 5 | фикс комментария | tests/efir.test.js L1079-1083 (внутри EF-3) | замена недостоверного «покрыто тестами 000080/000113» на реальные пины + HEAL-1. ТОЛЬКО комментарий, ассерты EF-3 не тронуты |

### 1.1 HEAL-1 (node, прямой require src/combat.js)

* Фикстура (локальные константы — ALLY_* живут в combat.test.js, в
  efir.test.js их НЕТ):
  * `MIRA_180 = {name:'Мира', role:'support', level:1, dmg:0.5, hp:0.8,
    skills:[], spells:['mend'], attrs:{wisdom:4, dexterity:4,
    intelligence:4}}` — attrs НЕ `{wisdom:4}` из примера ретро:
    solo-wisdom даёт инициативу 0 (init = dex+int, combat.js:625-628)
    → pre-roll встанет на игроке → `c.heal()` уйдёт в player-defensive
    («используйте книгу заклинаний»). dex/int 4 → init 8 > волк 3 >
    игрок 2 > Вольк 0 → очередь `['a0','m0','player','a1']`, pre-roll
    СРАЗУ стоп на a0 (endTurn не нужен). Сумма лечения зависит ТОЛЬКО
    от атрибута СПЕЛЛА (wisdom, assets/spells/000009.json) → «+7»
    из fixSuggestion ретро сохраняется дословно.
  * `VOLK_180 = {name:'Вольк', role:'melee', level:1, dmg:1.2, hp:1.1,
    skills:['swordsman'], spells:[]}` (attrs {} — в формулу не входит;
    maxHP 13 по формуле makeAlly).
  * игрок — `hero112()` (efir.test.js:901) + `p.hp = P.derived(p).maxHP`
    (270 — полный, frac 1 → вне пула «самый раненый»).
* Сцена: `createCombat({player, allies:[MIRA_180, VOLK_180],
  mobs:['wolf'], mobLevel:2, seed:5})`; `c.obstacles.clear()`;
  `a1.hp = 3` (frac ≈ 0.23 — самый раненый); `c._rng = () => 0.99`
  (страховка; на пути 0 бросков — волк не действует, pre-roll стоп
  на a0). Каталог — save/set/restore
  `C.combatInternals.allySpells = require('../src/spells-data.js')
  .SPELLS_BY_ID` (паттерн EF-1/EF-3, L911-912/L1023-1024) — БЕЗ него
  allyHeal тихо вернёт false («без каталога — melee-фолбэк»).
  `withGame(gameWithXp())` НЕ НУЖЕН (efir.js не участвует; см. §4).
* Ассерты (субкейс a): `C.activeUnitId(c) === 'a0'`;
  `c.heal() → {ok:true}`; `a1.hp === 10` (3 + **7** =
  round((4 + 0.5·4 + 1)·1) — ЧЛЕН 0.5·attrs); лог побайтово
  `«Мира лечит Вольк (+7).»`; `p.hp === 270` (не тронут);
  `a0.attackLeft === 0` (лечение заняло слот, 000168 P8).
* Субкейс (b) — якорь: та же сцена, Мира БЕЗ attrs → `+5`
  (`«Мира лечит Вольк (+5).»`, a1.hp 3→8). Защита от дегенератного
  фикса «заменить формулу на хардкод 7» — субкейс (a) бы остался
  зелёным. Здесь очередь `['m0','player','a0','a1']` (init 0) →
  pre-roll стоп на player → `c.endTurn()` → a0 (паттерн
  combat.test.js:2541-2567, 1:1).
* Чувствительность: откат члена 0.5·attrs → +5 вместо +7, byte-exact
  ассерт лог-строки падает.

### 1.2 MOVE-1 (node)

* Фикстура: один наёмник `attrs {dexterity:4, intelligence:4}`
  (init 8 → pre-roll стоп на a0, паттерн 000168-ALLY-1); волк
  унести в (0,0) (чистый контроль-ход); игрок по умолчанию (3,6)
  (createCombat, 7×7: px=floor(7/2)=3, py=height-1); `a0.x = c.px,
  a0.y = c.py - 1` → (3,5) — вплотную над игроком;
  `c._rng = () => 0.99`.
* Ассерты: `C.activeUnitId(c) === 'a0'`;
  `c.move(0, 1)` → `{ok:false, reason:'тут стоит игрок'}` (побайтово);
  позиция `[a0.x, a0.y]` deepEqual ДО (неизменна — проверка
  combat.js:1965-1967 ДО записи позиции); `a0.moveLeft === 1`
  (не расходован). Контроль-субкейс: `c.move(0, -1)` → `ok:true`,
  (3,4), moveLeft 0 — блок именно по игроку, не по unitAt/стене.
* Чувствительность: удаление проверки (откат 000168) → c.move на
  клетку игрока `ok:true` + позиция (3,6) → AssertionError.

### 1.3 R8 (vm-цепочка index.html до ui.js, HTMLCollection-стаб)

* `makePartyEnv()` (hero + Вольк roster, `__game.state`) →
  `openPanel(env)` (toggle(true) БЕЗ выброса — первый ассерт
  openPanel; на баговом pre-000169 коде render() бросает
  row.children.slice ДО attachEsc → осмысленная краснота).
* (а) `env.G.playerUI.isOpen() === true`;
  (б) `env.sandbox.document.listeners.keydown.length === 1` —
  attachEsc вызван ПОСЛЕ render (ui.js:439-440); в CHAIN
  (скрипты до ui.js) document-keydown-слушатель активен ТОЛЬКО
  от playerUI: esc у npcUI — на WINDOW (src/ui.js:1015-1022,
  вешается при открытии диалога — в R8 не открыт);
  squadUI-attachEsc (src/ui.js:1307-1322, экспорт G.squadUI L1349)
  — на DOCUMENT, но только пока открыта панель «Отряд» (в R8
  закрыта — почему ассерт ===1 и верен); combat-ui.js
  index.html ПОСЛЕ ui.js — в CHAIN нет;
  (в) dispatch: `for (const fn of kd.slice()) fn({code:'Escape'})` —
  ОБЯЗАТЕЛЬНО `{code:'Escape'}` (гард escHandler по `e.code`,
  не `e.key`);
  (г) `isOpen() === false`;
  (д) `listeners.keydown.length === 0` (detachEsc на close,
  ui.js:442/398-404).
* Форма доступа: **`env.sandbox.document`** (loadEnv возвращает
  `{G, body, errors, sandbox}`) — псевдокод ретро
  `env.document.listeners.keydown` не существует.
* Гарды escHandler пусты в песочнице: `G.npcUI.isActive() === false`
  (диалог не открыт, npc.js: `!!overlay`); `G.combatUI === undefined`
  (typeof-гард ui.js:386 пропущен). Если будущая задача добавит
  combat-ui.js в CHAIN этого теста — пересмотреть (см. §6).

### 1.4 CU180-EFIR-ROW (vm-цепочка loadCombatUi, полная до combat-ui.js)

* Сцена: `scene84({efir:true, spells:true})` (паттерн 000168-UI-2(b)
  :3175+; Эфир L1 через G.efir.createEfir → buildEfirUnit в
  startCombat) + `tickSlice` → `S.G.activeUnitId(S.c) === 'efir'`
  (pre-roll стоп на слоте Эфира; волк m0 ещё не действовал; игрок
  полный → Вдох НЕ срабатывает, frac 1.0 > 0.4).
* (а) `findByClass(S.body,'combat-state').textContent` включает:
  `«Ход: Эфир»` (первая строка) и побайтово
  `«Эфир: HP 16/16  |  Мана: 11  |  Шаги: 3  |  Касание: 1»`
  (L1-профиль: maxHP=hp=16, mp=11 — EF-1; c.efs {spellInt:1,
  spellWis:1, touch:1, move:3} → move 3, touch 1; имя «Эфир» —
  src/efir.js; разделитель `  |  ` — два пробела/pipe/два пробела).
* (б) fallback: white-box `S.c.efs = null` + `tickSlice` (re-render)
  → `«Эфир: HP 16/16  |  Мана: 11  |  Шаги: 0  |  Касание: 0»`
  (документированная защитная ветка D10: «без c.efs — fallback-
  цифры 0, строка рисуется», combat-ui.js:1417-1418). Мутация
  ПОСЛЕ основных ассертов в той же сцене (валидировано: ререндер
  без краха).
* Чувствительность: откат Д10 (000168) → строки Эфира нет в stateEl
  → includes падает.

## 2. Контракты пинов (точные точки src на master 0f18ed0 — строки
сдвинулись после ретро, семантика верифицирована без изменений)

* **allyHeal** — src/combat.js:1874-1906; формула L1894-1896:
  `Math.round((4 + 0.5*((u.attrs && u.attrs[spell['атрибут']])||0)
  + u.level) * (1 + 0.15*(spell['степень']-1)))`. attrs доходят
  `makeAlly` L336 → L378 `attrs: data.attrs || {}` (у реальных
  наёмников attrs — снапшот sheet.primary, companions.js). Цель —
  самый раненый пула [игрок, живые союзники] по frac<1, тай-брейк —
  порядок пула. Лог L1903: `${u.name} лечит ${a.name} (+${amount}).`
  Диспетчер c.heal L3101-3111 (игрок → defensive; support+merc →
  allyHealAction L2026, расход u.attackLeft).
  Ретро-строка 1833 устарела (базлайн e80a737).
* **allyMove «тут стоит игрок»** — src/combat.js:1947-1971;
  проверка L1965-1967 ПОСЛЕ inBounds/obstacles/unitAt (игрок НЕ в
  c.units — unitAt его не видит, отсюда отдельная проверка), ДО
  записи позиции → при отказе позиция и moveLeft не тронуты.
  Диспетчер c.move L3060-3065 (activeUnitId==='player' → playerMove,
  иначе activeAlly() → allyMove). Пул: hasEfs ? c.efs.move :
  u.moveLeft. Ретро-строка 1904 устарела.
* **playerUI [Esc]** — src/ui.js: isOpen L354-356
  (`panel.style.display === 'flex'`); attachEsc L368-397
  (escHandler L370-392: гард `e.code!=='Escape' || !isOpen()` →
  `G.npcUI.isActive()` → `G.combatUI.isActive() && current().result`
  → `toggle(false)`; typeof-гард addEventListener L394); detachEsc
  L398-404; toggle: render() L439 → attachEsc() L440 (порядок —
  СУТЬ бага 000169: на баге render() бросает ДО attachEsc →
  слушатель не вешается), на close — detachEsc() L442; экспорт
  toggle/render/isOpen L478-480.
* **stateEl строка активного Эфира** — src/combat-ui.js:1419-1438:
  `const au = activeUnit(c)` L1419; Эфир-ветка L1421-1424
  (разделители `  |  `); `stateEl.textContent = «Ход: …»\n + … +
  allyLine + …` L1428-1438. Чтение c.efs в render — ТОЛЬКО L1423-
  1424 (оба null-guarded). Ретро-строка 1189 устарела (область
  меняли 000171/000173/000174/000176) — пинит ТЕКУЩИЙ фактический
  текст.

## 3. Границы и инварианты

* **Регион — ровно 3 тест-файла**: tests/efir.test.js,
  tests/ui-panel-htmlcollection.test.js, tests/combat-ui.test.js.
  tests/combat.test.js (естественный дом пина allyMove — блок
  000168-ALLY) и ui-panel.test.js — ВНЕ региона, не трогать.
* **src/ не трогать НИ ПРИ КАКИХ ОБСТОЯТЕЛЬСТВАХ** (вкл. временные
  revert-проверки чувствительности — чувствительность валидирована
  прототипами/чтением, не revert-ом). Если пин на стадии кода выявит
  РЕАЛЬНЫЙ баг src (красный не объясним пином) — НЕ чинить код:
  оставить тест + новая задача в tasks/pending (следующий свободный
  номер, ссылка на 000180) + упоминание в отчёте.
* **Детерминизм**: 0 новых вызовов RNG (c._rng/Math.random/
  generateSeedPixels) на всех пиновых путях; c._rng=()=>0.99
  ставится до любых возможных бросков; seed фиксирован (5 / 42 в
  scene84); NOW84=1000. Сейвы не задеты (только тесты). Вывод
  HUD/панели — НЕ меняется (пины только фиксируют СОСТОЯЩИЕСЯ
  побайтовые строки). [E]-путь и гарды isActive (dungeonUI/
  buildingUI/npcUI) — не тронуты (R8 только читает/диспатчит).
* **Семантических правок существующих тестов НЕТ** — только
  аддитивные блоки + 1 точечный фикс комментария (EF-3 L1079-1083)
  + 1 строка в header-комментарии ui-panel-htmlcollection (R8 в
  список). Все 1978 существующих остаются зелёными.
* **Новых модулей НЕТ** → нет UMD/rootRef/снапшотов Game/script-
  тегов/CSS → index.html не трогается, tests/index-order.test.js
  не трогается.
* **CHANGELOG.md НЕ трогать** (чистый рефакторинг: не игровой
  процесс, не графика, не управление).
* **ОДИН коммит** (ветка task/000180): первая строка «Задача 000180:
  …» (рус.), последний параграф — `Co-Authored-By: Claude Code
  <noreply@anthropic.com>`. .merge-pending — только стадия мержа.
* **Rebase на свежий master ОБЯЗАТЕЛЕН** перед мержем: master
  двигался (0f18ed0); параллельно в полёте 000170 (main.js/world),
  000178 (combat-ui.js castRow/rowChk + CU178), 000179 (combat-ui.js
  + CU179 в конец combat-ui.test.js). После rebase: `npm test`
  заново + проверить хвост combat-ui.test.js (см. §6.1). CU180-
  тест пинит stateEl (combat-ui.js:1419-1438) — 000178/000179 его
  не трогают (кнопки castRow/rowChk — другие области), пины не
  зависят от нумерации строк.

## 4. Ленивые ссылки и гарды (зачем тестам эти обвязки)

* `combatInternals.allySpells` — ЛЕНИВЫЙ (UMD-ловушка 000038):
  ставится при загрузке spells.js в браузере; в node-тесте combat.js
  грузится БЕЗ spells.js → каталог undefined → allyHeal
  `if (!catalog) return false` (тихий melee-фолбэк). HEAL-1
  ОБЯЗАН save/set/restore (паттерн EF-1/EF-3/EF-4, restore в
  finally). MOVE-1 каталог не нужен (c.move не читает spells).
* `withGame(gameWithXp())` в новых тестах НЕ нужен: efir.js не
  участвует (нет loadEfir/efirAllyData/buildEfirUnit), а combat.js
  на путях createCombat/heal/move globalThis.Game не читает
  (единственное чтение — first-encounter-строка, гейт
  `c.units.some(x.id==='efir')` — ложный). Валидировано
  прототипом без Game. (Существующие EF-тесты используют withGame
  из-за efir.js — не копировать слепо.)
* R8-гарды (см. §1.3) — зависят от порядка index.html: npc.js
  (L872, в CHAIN) и combat-ui.js (L1035, ПОСЛЕ ui.js L939 — вне
  CHAIN). esc у npcUI — на WINDOW (src/ui.js:1015-1022, вешается
  при открытии диалога, снимается в npcCloseDom L950-953) —
  document-keydown-слушателей не создаёт → длина === 1 устойчива
  при любом состоянии диалога. НЕ путать: ui.js:1307-1345 — это
  attachEsc/detachEsc/toggle squadUI (панель «Отряд», экспорт
  G.squadUI L1349), чей слушатель — на DOCUMENT, но только пока
  панель открыта (сценарий R8 «открыта только панель персонажа»
  его не затрагивает).

## 5. Что важно будущим задачам (ссылки ТЗ/ретро)

* Ретро-находки по тестам — это КОНТРАКТ покрываемости: любой
  будущий рефактор, трогающий формулу allyHeal / allyMove /
  attachEsc-toggle-порядок / stateEl-строку Эфира, ОБЯЗАН оставить
  эти 4 пина зелёными (byte-exact ассерты). Карта «почему
  ослабли» — memory/000180-test-pins.md.
* Ретро 000168/000169 оставили ДРУГИЕ незакрытые findings (каст из
  книги на ходу спутника — major 000168; defensive-отказы c.cast/
  c.heal; round-rollover attackLeft; FX-гвард P11/R15; rAF-заморозка
  — info 000169) — НЕ в регионе 000180; кандидаты в отдельные
  подзадачи (нумерация — по порядку в pending).
* 000168-UI-1 (combat-ui.test.js:3096+) пинит строку НАЁМНИКА;
  CU180 — строку ЭФИРА: вместе — полная Д10-пара. 000168-UI-2(b)
  пинит pre-roll стоп на 'efir' (использован CU180 как данность —
  не дублировать).
* ui-panel.test.js:524/560/600/640 (Esc-пины) — plain-Array-стаб,
  СЛЕПЫ к классу бага 000169 (были зелёными на баговом базлайне
  1905/1905) — обязаны остаться зелёными; R8 — единственный пин
  этого класса под HTMLCollection-семантикой.

## 6. Подводные камни

1. **add/add-конфликт хвоста tests/combat-ui.test.js** с CU178
   (task/000178) и CU179 (task/000179): все три задачи добавляют
   блоки в конец. Резолв (указание оркестратора): сохранить ВСЕ
   блоки, **CU180 — последним**; имена тестов уникальны (префикс
   CU180/000180) → дублей test() нет. При mерже/ребейзе НЕ бросать
   чужие блоки.
2. **Пример ретро `{wisdom:4}` недостаточен** — см. §1.1 (init 0 →
   pre-roll на игроке → c.heal в player-defensive). attrs
   `{wisdom:4, dexterity:4, intelligence:4}` — решение
   Проектирования, «+7» от этого не зависит.
3. **`env.document` не существует** в loadEnv-результате — только
   `env.sandbox.document` (форма ретро-псевдокода невалидна).
4. **R8 — строгая длина слушателей (===1 / ===0)**: пин закреплён
   за ТЕКУЩИМ CHAIN (до ui.js). Если в CHAIN появится ещё один
   document-keydown-слушатель — пин упадёт осмысленно; обновить
   длину + проверить, что dispatch по ВСЕМ слушателям не ломает
   сценарий (dispatch — по `.slice()`-копии, как в DOM).
5. **TDD-красноты НЕТ** (expectedRedCount = 0): все 4 поведения
   существуют в master — задача ВОССТАНОВЛЕНИЯ ПИНОВ (регрессионных).
   «Краснота» ретро = сам пробел покрытия. Один коммит, всё зелёное
   (1982). Не пытаться «сделать тест красным» — он и есть
   регрессионный.
6. **Флейк-база**: полный прогон #1 базлайна — 1 недетерминированное
   падение (прогон #2 — 1978/1978). Если в ходе работ полный набор
   покажет 1 падение — взять файл из TAP («not ok N - имя»),
   `node --test tests/<файл>` ре-ран и запись в отчёт (правило
   workflow).
7. **stateEl менялся после ретро** (область 000168 правили
   000171/000173/000174/000176): пины пишутся по ТЕКУЩЕМУ
  фактическому тексту (валидировано proto2/scratch на 0f18ed0), не
   по ретро-цитатам.
8. **Недостоверность «тестов 000080 в сюйте нет» (ретро 000168)**:
   тесты 000080 ЕСТЬ (tests/spells.test.js:927/949 — каталог
   allySpells + guard castSpell; tests/combat-ui.test.js:1815 —
   токен очереди), но НИ ОДИН не пинит формулу allyHeal — вывод
   ретро (член без ненулевых пинов) верен; комментарий правится с
   точной формулировкой (без «тестов нет»).

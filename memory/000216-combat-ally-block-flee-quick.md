# 000216 — БОЙ: два бага — союзник не кастует под блоком игрока; быстрый предмет под диалогом побега

Станции «Проектирование» + «Реализация» (2026-10-15). Worktree:
`/home/sas/Documents/Art/thegame/.worktrees/task-000216`, ветка
`task/000216`. База worktree = **60f2dda** (= master на момент
анализов; git status чист). ТЗ (source of truth):
`tasks/pending/000216.md` — два точечных фикса P1, найденных
ретро-анализом 20261014 (`tasks/result/000193-retro-20261014.md`
major ①, `tasks/result/000210-retro-20261014.md` major + minor ②).
Анализы: /tmp/thegame-wf-000216/{a1-domain.md, a2-arch.md,
a3-tests.md} — все строки ниже сверены прямым чтением кода
worktree (60f2dda).

**Станция «Реализация» (ФАКТ)**: красные подтверждены осмысленным
падением — B1 (node, tests/ally-spells.test.js): `canCast —
{ok:true} … (факт: {"ok":false,"reason":"блок — только последнее
действие"})`; B2 (vm, tests/combat-ui-quicklist.test.js): «клик по
строке под диалогом = no-op (предмет не применён, бит-в-бит)» —
снимок расходится (qty 1→0, ps.quickItem 1→0, hp +15, лог +1, список
закрыт). После двух фиксов — точечные прогоны 9/9 + 9/9 зелёные.
Семантических правок существующих тестов — 0 (append-only).

**Baseline (ФАКТ, 60f2dda, ОДИН прогон за раз — память
no-parallel-full-tests)**: прогон 1 `npm test` = 2508/2509 (1 fail
— фЛЕЙК, имя в tail потеряно); прогон 2 с полным логом
(`/tmp/thegame-wf-000216/baseline-full.log`) = **2509/2509, fail 0,
EXIT=0** — флейк не воспроизведён, база зелёная. Протокол: запись
в tasks/result/000216.md; при повторном падении — одиночный
`node --test tests/map.test.js` (perf «160k tileAt», 5000 мс) +
запись (паттерн 000210 §6.8).

**Master на момент Проектирования = 8d6a53a** (смержен 000211.06:
items — 28 лута, svg-ссылки в json); **на момент Реализации =
c80c740** (смержен 000211.03: mobs — skills/spells/loot как ссылки
на json-файлы; тесты/combat.test.js изменён — НЕ наша территория).
Файлы ДИЗЬЮНКТИВНЫ с нашими (grep 60f2dda..c80c740 по
ally-spells/combat-ui/ally-spells.test/combat-ui-quicklist.
test/000193/000210/CHANGELOG/000216 = 0) → rebase чистый; к
моменту мержа сверять по факту. src/sprites.js (изменён 000211.06)
входит в цепь loadCombatUi194 — после rebase покрывает полный
прогон.

**Baseline Реализации (ФАКТ, ОДИН прогон за раз — память
no-parallel-full-tests)**:
* База 60f2dda + наши 2: `npm test` = **2511** (2509 + 2, как
  ожидание плана §9) → после фиксов **2510 pass / 1 fail** —
  единственный fail = ФЛЕЙК `перформанс: 160k tileAt`
  (tests/map.test.js, тайм-бюджет; нагрузка — параллельный
  прогон чужого worktree). Одиночный `node --test
  tests/map.test.js` = 74/74 → реально 2511/2511.
* После rebase на c80c740 (master = 2517): `npm test` =
  **2519** (2517 + 2); два полных прогона (2-й с полным логом
  /tmp/thegame-wf-000216/post-rebase-full.log) = 2518/2519,
  `not ok` ровно один — тот же ФЛЕЙК map perf → одиночный
  re-run 74/74 → реально **2519/2519, 0 fail**. Rebase — 0
  конфликтов; content-маркеры подтверждены (§6 п. 1).
Запись в tasks/result/000216.md.

Все номера строк — по базе **60f2dda** (после rebase смещаются —
сверять по content-маркерам, §6).

---

## 1. Что добавлено/перенесено (скоуп)

ДВА точечных фикса боевого поведения. **НОВЫХ МОДУЛЕЙ НЕТ**:
ни одного `<script>`/index.html/CSS/save-поля/spec-правки/ассета/
поля c/точки c._rng (ТЗ: «Границы»). Изменения:

| # | файл | операция | Δ |
|---|---|---|---|
| 1 | src/ally-spells.js | УДАЛИТЬ ровно 2 строки L193-194 (`const blocked = I.checkBlocked(c);` / `if (blocked) return { fail: blocked };`) из evalAllySpell | −2 |
| 2 | src/combat-ui.js | +1 строка `if (fleeOpen) return;` — ПЕРВАЯ строка quickUseRow (L2388) | +1 |
| 3 | tests/ally-spells.test.js | append тест **000216-B1** (node; red→green) — в node-секцию, после N5, до vm-блока | +~45 |
| 4 | tests/combat-ui-quicklist.test.js | append тест **000216-B2** (vm; red→green) — в конец файла | +~90 |
| 5 | memory/000193-ally-spell-mechanics.md | строка 2 таблицы §2 (L56) — «— (000216: УДАЛЕНА)» + факт | ±1 |
| 6 | memory/000210-flee-confirm.md | НОВЫЙ раздел «## 9. Додатка 000216» | +~25 |
| 7 | memory/000216-combat-ally-block-flee-quick.md | этот файл (новый) | — |
| 8 | CHANGELOG.md | НОВЫЙ раздел `## 2026-10-15` (ПОСЛЕ 3 строк интро, ПЕРЕД `## 2026-10-14`) → `### Игровой процесс` — 2 буллета | +~8 |
| 9 | tasks/pending/000216.md → tasks/done/000216.md | git mv | — |
| 10 | tasks/result/000216.md | краткий отчёт (решения §3, baseline от факта, флейки) | +~60 |

### Баг 1 (000193) — факт и фикс

* `src/ally-spells.js:186` evalAllySpell: L191-192 checkTurn →
  **L193-194 checkBlocked** (УДАЛЯЕТСЯ) → L195+ каталог/книга/
  действие/цепочка/пул/мана/цель — как есть (ТЗ: «остальные
  проверки пайплайна — как есть»).
* `checkBlocked` — combat.js **L1390-1391**: читает
  `c.ps.blocked` — флаг блока **ИГРОКА**: ставится ТОЛЬКО
  playerBlock (combat.js **L1399**, «блок — только последнее
  действие»), сбрасывается ТОЛЬКО startRound (combat.js **L2711**),
  init false — createCombat L3186. Мобового «блока игрока» нет.
* Сценарий бага: игрок ставит блок в раунде → очередь (000168 Д9:
  союзник = ход игрока, phase 'player') — на СОЮЗНИКА →
  evalAllySpell → checkBlocked → `c.ps.blocked === true` → отказ
  «блок — только последнее действие» до следующего раунда. K/H/
  quick/inv/attack/move — РАБОТАЮТ (асимметрия).
* Контракт ядра: combat.js **L1525** — «checkBlocked НЕ вызывается
  (c.ps.blocked — флаг игрока; все существующие союзные ядра его не
  гоняют)»; grep по телам: allyQuickItem/allyInvItem/allyStrike/
  allyHealAction/efirCastAction — 0 вызовов. evalAllySpell —
  ЕДИНСТВЕННАЯ точка, где союзный каст гонял чужой блок.
* Игрок-путь бит-в-бит: castSpell (spells.js L325) checkBlocked
  не трогается — игрок по-прежнему не кастует под СВОИМ блоком
  (SB1-SB14, playerSpell-пины зелёные).

### Баг 2 (000210) — факт и фикс

* `src/combat-ui.js:2376` (buildQuickRow):
  `el.addEventListener('click', () => quickUseRow(c, slot));`
  (слушатель НЕ трогается — Д1). `quickUseRow` **L2388**: тело —
  `spellbookUnitGate(c)` (result/phase) → `c.quickItem(slot)` —
  БЕЗ fleeOpen-гарда. quickBox (.combat-quicklist) живёт в
  `.combat-side` — модал-подложка `.combat-flee-confirm`
  (в `.combat-box`, 000210 Д9) НЕ накрывает его в обеих
  ориентациях; vm-dispatch обходит display всегда → клик под
  диалогом применяет предмет и сжигает ход.
* **Полный список гардов fleeOpen ПОСЛЕ фикса (8 точек, строки
  60f2dda)**: L359 (общий click 7 табличных кнопок), L533
  (canvas-клик), L819 (flee-thunk `!fleeOpen` — идемпотентность),
  L870 (handleCode: `if (fleeOpen) return true;` — ВСЕ клавиши,
  после lungeGate-гарда, ДО `let consumed` и таблицы ключей),
  L2060 (allyBtn), L2151 (resurrectCast), L2207 (castRow),
  quickUseRow (НОВЫЙ — Д1). Состояние `let fleeOpen = false;`
  L175 (closure, 000210 Д11); resets: build L483, finish L2501,
  catch L2710; render-гейт L1799; open L2219, close L2223.
* **KeyE/клавиатура под диалогом — глоталась ВСЕГДА** (гард L870,
  000210 Д7 blanket-ветка): toggleQuickList не вызывается, список
  не открывается/не закрывается повторным KeyE. Гарды 2060/2151/
  2207 — это КЛИК-пути (castRow/resurrectCast/allyBtn), не
  клавиатура. ТЗ «проверить KeyE-канал … если да — зафиксировать
  тестом» → ЗАФИКСИРОВАНО в 000216-B2 (шаг 6).

## 2. Контракты и границы (что где после задачи)

1. **Союзный ход НЕЗАВИСИМ от блока игрока**: ВСЕ союзные входы
   (книга/K/H/quick/inv/attack/move) — 0 checkBlocked. Блок
   (c.ps.blocked) — состояние ТОЛЬКО хода игрока: отказывает
   playerAttack/playerSpell/playerMove/playerQuickItem/
   playerInvItem/canDoAction-ветки игрока; сброс — startRound.
   Каст союзника НЕ сбирает и НЕ трогает c.ps.blocked.
2. **Модал-контракт 000210 (неизменён, расширен)**: под открытым
   диалогом побега ВСЕ JS-точки входа боя — ТИХИЙ no-op (0 ядра,
   0 строк c.log, 0 c._rng, 0 мутаций); закрытие — ТОЛЬКО «да»/
   «нет»; **Escape-поведение НЕИЗМЕННО** (Д8 000210: под диалогом
   глотается, НЕ закрывает — пин CU210-MODAL интактен).
3. **Бит-в-бит (НЕ ТРОГАЕТСЯ)**: src/combat.js, src/spells.js,
   src/combat-keys.js, src/main.js, src/save.js, index.html,
   <script>-теги, CSS, spec/*, SPEC.md, assets/*; детерминизм-
   золото (tests/combat.test.js — территория 000211.03: :251/:275
   — НЕ трогать); сейвы (0 новых полей c: fleeOpen — closure,
   c.ps.blocked — существующее поле); index-order (0 `<script>`);
   svg (0 ассетов).
4. **Технические правки существующих тестов — НЕТ** (пустой список;
   баг-поведение не закреплено НИ ОДНИМ пином: grep 'blocked'
   tests/ally-spells.test.js = 0; grep 'quick' в CU210-блоке = 0).

## 3. Решения станции (каждое — с причиной)

| # | решение | почему |
|---|---|---|
| Д1 | гард бага 2 — **ПЕРВАЯ строка quickUseRow** (L2388, до spellbookUnitGate), не в click-слушателе :2376 (ТЗ допускает оба) | (а) паттерн 6 существующих гардов (первая строка функции — castRow :2060/resurrectCast :2151/allyBtn :2207, fix-класс ревью 000210 §7 Finding 1); (б) function-level закрывает ВСЕХ текущих и будущих вызывающих; (в) возврат ДО spellbookUnitGate/logRejection → тихий no-op, 0 строк лога — «глотание» модала, не «отказ ядра» (000210 Д6/Д7) |
| Д2 | ТЗ «после **Esc** — клик работает» → тест закрывает диалог кнопкой **«нет»**; Esc — отдельный no-op-пин (диалог остаётся открыт, клик no-op) | Esc диалог НЕ закрывает — 000210 Д8 («Escape закрывать НЕ добавляем…», прецедент 000196 Д7), код: handleCode L870 ДО Escape-ветки; пин CU210-MODAL (L8151, Escape в списке глотаемых, диалог открыт) — под защитой ТЗ 000216 («пины не ломать: CU210-*»); литеральное Esc-закрытие = слом пи + изменение смерженного контракта = больше ТЗ; интент ТЗ («после закрытия канал снова жив») сохранён шагом «после „нет" — клик работает» |
| Д3 | тест бага 1 — **node** (tests/ally-spells.test.js), НЕ vm | ТЗ предписывает exactly API модуля (canCastAllySpell/castAllySpell + deepEqual); UI-путь castRow идёт через тот же evalAllySpell — покрытие модуля = покрытие бага; vm-тест ТЗ не требует |
| Д4 | таблица §2 memory/000193: **строка 2 ОСТАЁТСЯ** (не удаляется), союзная ячейка → «— (000216: УДАЛЕНА)» + факт в ячейке причины | таблица = «порядок проверок»; удаление строки сдвигает нумерацию 3-9d (на которую ссылаются текст/тесты/зеркало evalSpell); «—» читается как «проверки нет — и вот почему»; порядок: `| 2 | checkBlocked(c) | — (000216: УДАЛЕНА) | c.ps.blocked — флаг ИГРОКА (playerBlock, сброс startRound); союзный ход независим — конвенция союзных ядер (combat.js:1525); 000216 |` |
| Д5 | CHANGELOG — **в ОДИН финальный коммит** (не отдельный) | CLAUDE.md «финально оформна в виде одного коммита, содержащего все изменения» + прецеденты 000196 Д11 / 000210 Д15 (приоритет зафиксирован 000193.02 §7) > станционное «отдельный коммит CHANGELOG» (generic-шаблон); при мерже и так один squash-коммит (память one-commit-per-task-squash). Текст — §7 |
| Д6 | id новых тестов — **000216-B1** (node) / **000216-B2** (vm) — единая пара | git blame → задача; файлы-хозяева уже имеют именованную историю (N1-N5, CU193-*, CU210-*, 194-QUI-*) — 000216-* не коллидирует и атрибутирует регрессию; альтернативы a3 (000216-N1 / 000216-QUI-FLEE) отклонены — пара B1/B2 читаемее, детали — в заголовках тестов |
| Д7 | `internalsNow()` :163 (`typeof I.checkBlocked === 'function'`) — **НЕ трогать** | ТЗ-граница «src/ally-spells.js (2 строки)»; combat.js ПО-ПРЕЖНЕМУ экспортирует checkBlocked в combatInternals (L3372) — проверка истинна; удаление = лишний ханк без изменения поведения |
| Д8 | в ally-spells.js — **строго 2 строки**, коммент-блок L181-185 («зеркало evalSpell … таблица 000193 §2 … тот же порядок») — НЕ трогать | ТЗ-граница «2 строки»; коммент ссылается на ТАБЛИЦУ 000193 §2, которая правится (Д4) → после правки ссылки остаются точными (зеркало с задокументированным исключением) |
| Д9 | файл бага 2 — **tests/combat-ui-quicklist.test.js** (append в конец), не combat-ui.test.js | scene() этого файла УЖЕ несёт героя с healing_potion в quick-слоте 0 (меньше фикстурного кода, чем scene84 + addItem/setQuick); файл — дом quick-строк (194-QUI-*); цепь loadCombatUi194 грузит полный combat-ui.js (диалог побега на месте); идея ретро-000210 «расширить CU210-MODAL-VM» отклонена — инвариант «семантических правок существующих тестов нет», новый тест самодостаточен |

Новых модулей/ассетов/иконок/брейкпоинтов НЕТ (ТЗ-границы) —
решений по формам/сигнатурам/владению состоянием сверх таблицы
нет: состояние fleeOpen — существующее closure (000210 Д11),
сигнатуры не меняются.

## 4. Контракты тестов (красные; append)

### 000216-B1 — node — tests/ally-spells.test.js (после N5, до vm-блока)

Фикстуры — существующие: `loadAllySpells193()`,
`makeCombat193([MIRA193])` (pre-roll стоп: init 8 > волк 3 >
игрок 2; MIRA193 — support, [light_heal], mp 13, spellWis 1,
maxHP 40), `hero193()`, счётчик `c._rng` (паттерн N1).

1. `c = makeCombat193([MIRA193])`; `u = c.units.find(id==='a0')`;
   `assert.equal(activeUnitId(c), 'a0')` (ход СОЮЗНИКА).
2. `u.hp = u.maxHP - 7;` (33; light_heal +7 → 40 — формула N1).
3. `c.ps.blocked = true;` — white-box (игрок заблокировался
   раньше в том же раунде; флаг жив до startRound L2711).
4. `assert.deepEqual(AS.canCastAllySpell(c, u, 'light_heal'),
   { ok: true })` — **RED до фикса**: `{ ok: false, reason:
   'блок — только последнее действие' }` (осмысленный value
   mismatch, не синтаксис/ENOENT).
5. `const r = AS.castAllySpell(c, u, 'light_heal')` → `r.ok` true;
   `r.healed === 7`; `u.hp === 40`; `u.mp === 7` (13−6);
   `u.spellWis === 0`; `u.spellInt === 1` (нетронут);
   `u.attackLeft === 1` (Д-D); `c.player.mp`/`c.ps.spellWis`
   нетронуты (снимки до); лог `['Мира лечит себя (+7).']`;
   `c.ps.blocked === true` (каст союзника НЕ сбирает блок игрока);
   rngCalls === 0.
6. Зеркало 000037 (одна причина — одно поведение): после расхода
   (spellWis 0) `deepEqual(canCastAllySpell(...), { ok: false,
   reason: 'действий «Заклинание» (Мудрость) больше нет' })` И
   `deepEqual(castAllySpell(...), {ok:false, reason: …та же…})`
   — canCast и cast дают ОДНУ причину, каст не расходует.

Стражи без правок: N1-N5, CU193-BOOK/EFIR/OFF, CU193.01-*,
CU193.02-*, CU179-* (все фикстуры без c.ps.blocked=true),
194-CORE-*/194-CANDO-*, EF-*, SB1-SB14, playerSpell-пины
(combat.test.js/spells.test.js — путь ИГРОКА), 194-QUI-BLOCK
(блок ИГРОКА на ходу ИГРОКА — canDoAction, НЕ ally-путь).

### 000216-B2 — vm — tests/combat-ui-quicklist.test.js (в конец)

Сцена — существующая `scene()` (hero + healing_potion в
quick-слоте 0, волк, ход героя; цепь loadCombatUi194 с полным
combat-ui.js); хелперы `press/findByClass/byAct` — существующие;
снимок `snap()` = `{ c.player.hp, c.player.mp, ps: {...c.ps}
(quickItem и пр.), qty: S.G.totalQty(c.player,'healing_potion'),
logLen: c.log.length, round: c.round, phase: c.phase,
quick: ql.style.display, flee: fleeBox.style.display,
units: c.units.map(u => [u.id,u.x,u.y,u.hp]) }` + счётчик c._rng.
Строки — `ql.children.filter(ch => className включает
'combat-quickrow')`; строка 0 — ПОСЛЕДНЯЯ с
`dataset.slot === '0'` (vm-ловушка: перестроение ДОБАВЛЯЕТ
строки, innerHTML='' не чистит children — 194-паттерн).

1. `press(keydown, 'KeyE')` → ql display '' (открыт, 3 строки —
   паттерн 194-QUI-OPEN).
2. `press(keydown, 'KeyF')` → `fleeBox = findByClass(S.body,
   'combat-flee-confirm')`, display ≠ 'none' (открыт; 0 c._rng,
   round нетронут — паттерн CU210-OPEN); список НЕ закрывается
   (quickOpen не тронут).
3. `before = snap()`.
4. **КЛИК ПО СТРОКЕ** `row.listeners.click[0]({ target: row })` →
   `assert.deepEqual(snap(), before)` — **RED до фикса**: qty
   1→0, ps.quickItem 1→0, hp +15, лог +1, ql display 'none'.
   rngCalls === 0; ql display '' (список открыт); flee display
   ≠ 'none' (диалог открыт).
5. **KeyE-повтор под диалогом** `press(keydown, 'KeyE')` →
   deepEqual(snap(), before) — список НЕ закрылся (гард L870
   глотает — пин KeyE-канала, ТЗ «зафиксировать тестом»; зелёный
   и до фикса).
6. **Escape под диалогом** `press(keydown, 'Escape')` →
   deepEqual(snap(), before), диалог ОТКРЫТ (Д8-пин; замена
   литерального «после Esc — клик работает» — Д2; зелёный и до
   фикса).
7. **Закрытие «нет»**: `fleeBox.children[1].children[1].listeners.
   click[0]()` (ans.children[1] — «нет», паттерн CU210-POS) →
   flee display 'none'; snap без изменений, кроме flee (Д6: 0
   ядра).
8. **Клик ПОСЛЕ закрытия РАБОТАЕТ**: та же строка click →
   qty 0, ps.quickItem 0, hp +15, лог +1 (строка применения
   «Зелье лечения»), ql display 'none' (194-QUI-CLICK-поведение
   восстановлено).

Стражи без правок: CU210-POS/OPEN/NO/YES-OK/YES-FAIL/MODAL/GATE/
RESULT/MODAL-VM (диалог), CU210-CSS-* (CSS), 194-QUI-BUILD/OPEN/
CLICK/REJ/ALLY/BLOCK/ALLY-STALE/FINISH (quick при закрытом
диалоге — fleeOpen false → гард no-op), CU182-ORDER, CU196-POS,
combat-keys.test.js (таблица KeyE/KeyF), CU201-CSS-*, svg,
index-order, save/save-restore, spec-wording, детерминизм-золото.

## 5. Ленивые ссылки и guards

* **Новых модулей НЕТ** → новых UMD/снапшотов Game/деградаций/
  console.error нет (combat-ui.js уже снимает G один раз —
  000038; ally-spells.js — internalsNow/catalogNow ленивые —
  не трогается).
* Новый гард читает **существующее** closure-состояние `fleeOpen`
  (000210 Д11) — новых полей c/состояния НЕТ.
* Удаление checkBlocked из evalAllySpell — удаление ЧИСТОГО
  чтения (0 c._rng) — потоки детерминизма/золото бит-в-бит;
  гард — ранний return (0 c._rng, 0 мутаций, 0 лога).
* `internalsNow()` :163 по-прежнему проверяет
  `I.checkBlocked` (Д7) — combat.js L3372 экспортирует его.

## 6. Подводные камни

1. **Rebase-маркеры (content)**: `const blocked = I.checkBlocked(c);`
   в src/ally-spells.js (удаление) и `function quickUseRow(c,
   slot) {` в src/combat-ui.js (вставка ПЕРВОЙ строкой после
   сигнатуры, ДО `const g = spellbookUnitGate(c);`). Все номера
   строк — по 60f2dda; после rebase — по маркерам.
2. **Master ушёл: 60f2dda → 8d6a53a** (000211.06, items-лут:
   assets/items/*, items-data.js, sprites.js, sync-items-data.js,
   items/sprites-тесты) — дизъюнктивен (clean rebase), НО
   sprites.js — в цепи loadCombatUi194 → после rebase ОБЯЗАТЕЛЕН
   полный прогон; baseline пересчитать от факта (оценка: 2509 +
   N 000211.06 + 2 наших).
3. **В полёте (чужие worktrees — не пересекаться)**:
   * 000219 (P2, пины таблицы): append в tests/ally-spells.
     test.js (тот же хвост, что B1 — union-конфликт при
     мерже) + tests/combat-ui.test.js; их табличный список
     причин НЕ включает блок-строку (неизвестное/не изучено/
     неизвестное действие/нет цели/далеко/нет пула/не ваш ход)
     → пины пишутся под пост-фикс-поведение, семантической
     коллизии НЕТ (порядок мержа не критичен).
   * 000199.01 (P2, бейджи кнопок): combat-ui.js регион
     build-кнопок/countEls L340-470 — ДИЗЬЮНКТИВЕН с L2388;
     CHANGELOG — union.
   * 000217 (P1, .squad-panel z-index): index.html/main.js —
     дизъюнктивны. 000218 (P2, SPEC): spec/* — дизъюнктивны
     (спец-правка companions.md «блок/предметы/побег» — за
     000218, НЕ за нас). 000220 (P2, loot): дизъюнктивны.
   * 000211.02-.09/000209: assets/data/sync + свои тесты —
     дизъюнктивны (000211.06 уже в master — п. 2).
4. **vm-стаб**: innerHTML='' НЕ чистит children при
   перестроении quick-списка — строку брать ПОСЛЕДНЕЙ с
   dataset.slot === '0'; dispatchEvent обходит display/CSS
   (поэтому JS-гард обязателен — не «CSS закроет»).
5. **Сталый fleeOpen** (reset только build/finish/catch —
   info-файдинг ретро 000210): новый гард использует то же
   состояние → профиль риска идентичен 6 существующим; фикс
   — ВНЕ скоупа 000216.
6. **[T]-панель 000195 под диалогом** — тот же класс
   негардированности (z-25 над оверлеем z-20) — ВНЕ скоупа
   ТЗ (ТЗ: только quick-строки + KeyE); зафиксировано как
   risk/фоллоу-ап (ретро 000195/000210 note «проверить в
   ретро 000195»), не чиним.
7. **tests/combat.test.js — НЕ трогать** (детерминизм-золото —
   территория 000211.03).
8. **Один полный `node --test tests/` на worktree за раз**
   (память no-parallel-full-tests; тест 000054 мутирует
   src/npc-data.js); флейк-протокол — п. 2 шапки + §4
   (000210 §6.8): одиночный re-run упавшего файла + запись в
   tasks/result/000216.md.
9. **Никаких push в remote**; основной репозиторий
   /home/sas/Documents/Art/thegame — только для чтения;
   чужие worktrees (.worktrees/*, кроме task-000216) — не
   трогать; `.merge-pending` — ТОЛЬКО стадия мержа (не
   создавать сейчас — на момент Проектирования в главном
   репо он есть от чужого workflow).
10. **Коммит**: один (Д5); первая строка «Задача 000216: …»
    (рус.), последний параграф — `Co-Authored-By: Claude Code
    <noreply@anthropic.com>`; текст — от фактического diff
    ПОСЛЕ rebase (память commit-message-from-final-diff),
    не от черновика ТЗ.

## 7. CHANGELOG (текст, в ОДИН коммит — Д5)

НОВЫЙ раздел `## 2026-10-15` (дата = сегодня/мердж; после
3 строк интро, ПЕРЕД существующим `## 2026-10-14`) →
`### Игровой процесс` → 2 буллета (формат «**Жирный
заголовок.** Текст.», без программных частей):

```
- **Заклинания спутников при блоке игрока.** Теперь союзники
  кастуют заклинания из книги на СВОЕМ ходу, даже если игрок
  стоит в блоке: блок — только последнее действие ХОДА
  ИГРОКА и на ход спутника не влияет.
- **Быстрый предмет — только вне диалога побега.** Под
  открытым подтверждением побега («Вы точно хотите сбежать?»)
  клик по строке быстрого предмета больше не применяется —
  диалог закрывается только «да» или «нет».
```

## 8. Что важно будущим задачам

1. **Каждая новая JS-точка входа боя обязана получать первую
   строку `if (fleeOpen) return;`** (8-я точка — quickUseRow,
   000216): модал-инвариант 000210 Д7 «под диалогом ВСЁ
   глотается» — тихий no-op (0 ядра/0 лога), не отказ ядра;
   клавиатура закрыта blanket-гардом handleCode L870 (новые
   КЛАВИШИ не нужны); клик-пути — по одной строке на функцию.
2. **c.ps.blocked — флаг ТОЛЬКО хода игрока**: любая будущая
   механика «блок/оглушение союзника» — НОВОЕ поле (u.blocked
   или аналог), не переиспользовать c.ps.blocked для союзных
   ядер (контракт combat.js L1525 + 000216).
3. **Красный-тест-паттерн «white-box флаг + deepEqual no-op
   снимка»** (B1: c.ps.blocked=true → canCast {ok:true};
   B2: snap-бит-в-бит) — переиспользовать для будущих
   «действие X доступно/недоступно в состоянии Y».
4. **Таблица §2 memory/000193 — живая**: строки 3-9d
   ссылаются на нумерацию; правки только «ячейка → — +
   причина» (Д4), не удаление строк.
5. **Сцены quick-списка**: scene() combat-ui-quicklist.test.js
   (зелье в слоте 0) — готовая фикстура для будущих
   quick-поведений; диалог побега в этой цепи НА МЕСТЕ
   (loadCombatUi194 грузит полный combat-ui.js).
6. **Ретро-фоллоу-апы вне 000216**: [T]-панель 000195 под
   диалогом (п. 6 §6); сталый fleeOpen (п. 5 §6) — отдельные
   задачи, если ретро подтвердит.

## 9. План реализации (по файлам; порядок)

1. **Красные** (append, 0 правок существующего): 000216-B1
   (tests/ally-spells.test.js, +~45) + 000216-B2 (tests/
   combat-ui-quicklist.test.js, +~90) → точечные прогоны
   (`node --test tests/ally-spells.test.js`, `node --test
   tests/combat-ui-quicklist.test.js`) → КРАСНЫЕ падают
   осмысленно (B1: reason «блок — только последнее действие»
   вместо {ok:true}; B2: предмет применён под диалогом —
   снимок расходится), остальные — зелёные.
2. **Фиксы**: src/ally-spells.js −2 (L193-194); src/
   combat-ui.js +1 (первая строка quickUseRow) → точечные
   прогоны зелёные.
3. **Документы**: memory/000193 (строка 2, ±1), memory/000210
   («## 9. Додатка 000216», +~25), этот файл (уже создан на
   станции — доработать по фактам красной/зелёной стадий),
   CHANGELOG (§7), tasks (git mv pending→done,
   tasks/result/000216.md +~60) → **один** полный `node --test
   tests/` (ожидаемо: база + 2 = 2511 на 60f2dda).
4. **Rebase** на свежий master (на момент Проектирования
   8d6a53a — дизъюнктивен; к мержу — по факту) → сверить
   content-маркеры (§6 п. 1) → **один** полный прогон +
   baseline ОТ ФАКТА → один коммит: «Задача 000216: БОЙ: два
   бага — союзник кастует из книги при заблокированном
   игроке; быстрый предмет не применяется под диалогом
   побега» + `Co-Authored-By: Claude Code
   <noreply@anthropic.com>`.

**Ожидаемая итоговая дельта (по файлам)**: src/ally-spells.js
−2; src/combat-ui.js +1; tests/ally-spells.test.js +~45;
tests/combat-ui-quicklist.test.js +~90; memory/000193 ±1;
memory/000210 +~25; memory/000216-… (этот, новый);
CHANGELOG +~8; tasks (mv + result ~+60). Итого: 2 файла src
(3 строки), 2 файла тестов, 3 memory, 1 CHANGELOG, 2 tasks.
НИЧЕГО больше.

# 000248 — Бой: анимация стрельбы из лука и удара оружием ближнего боя

Контракт стадии Проектирование (2026-10-23). ТЗ: tasks/pending/000248.md.
Worktree `.worktrees/task-000248` на master после мержа 000246
(000248 — серийно ПОСЛЕ 000246, общие файлы src/combat-ui.js + CSS index.html).
Анализы: домен / архитектура / карта тестов (согласованы, расхождения закрыты ниже).

## Что добавлено

- Транзиентный DOM-слой `.combat-atk-layer` над полем боя (ребёнок
  `.combat-box`; создаётся при первом активном FX атаки, удаляется когда
  все истекли). Внутри — маркеры-клетки:
  `.combat-atk-lunge` (melee-атака: выпадение к цели),
  `.combat-atk-draw` (дальний: «взвус»/спуск),
  `.combat-atk-arrow` (снаряд-дротик стрелок→цель, только ranged с целью),
  `.combat-atk-hit` (вспышка удара на цели).
- Три источника FX — НОЛЬ правок ядра:
  герой — runAction (вместе с существующей записью c._fx),
  союзник — НОВАЯ ветка runAction,
  мобы — read-only reuse существующей эвристики 000062 (c._unitFx).
- Новое состояние `c._attackFx {at, until, kind, from, toId, hit}` —
  UI-поле (ядро combat.js не читает; паттерн c._fx/c._unitFx/c._uiMoves).
  `c._fx` НЕ перезаписывается и НЕ расширяется (отдельное поле — контракт).
- CSS index.html: новый блок ПОСЛЕ правила `.combat-overlay--combat
  .combat-actions { margin-bottom: 0 }` (конец боевого скоупа) + 1 override
  внутри существующего portrait-медиа (после `.combat-victory-loot`).
  ПЕРВЫЕ @keyframes проекта: combat-atk-lunge / combat-atk-draw /
  combat-atk-arrow / combat-atk-hit (сейчас в index.html 0 keyframes;
  ТЗ-ссылка «паттерн „здания ожили"» неточна — здания ожили 000224/000238
  это SVG-кадр-свитчи, не CSS).
- Тесты: новый раздел 000248 в КОНЦЕ tests/ui.test.js
  (bootCombat000248 с мутабельным performance.now; 8 красных + 1 guard).
- CHANGELOG.md — отдельный коммит (2026-10-23, подзаголовок «Графика»).

## Контракты (решения анализа — финальные)

D1. **FX = DOM-слой, не canvas.** Юниты рисуются на canvas (g2-контекст),
   «класс-маркер» ТЗ реализуется элементами DOM-оверлея над клетками.
   Steady-state (без атаки) — НОЛЬ новых операций canvas/DOM:
   drawCalls/styleCalls goldens (000084/000151/000175) не задеты.
   pointer-events: none — клики (выбор цели, баннер-finish, книга) проходят.
   Новых rAF НЕТ (playback на существующем tick-цикле 000047), ход не
   блокируется (декоративная, паттерн startMoveAnims).

D2. **Геометрия слоя 1:1 с `.combat-banner`** (position:absolute;
   top/left 50%; right/bottom auto; transform translate(-50%,-50%);
   width/height: min(100vh - 32px, 100vw - 304px); overflow: hidden;
   portrait: min(100vw - 16px, 100vh - 16px - 520px)) → бокс слоя ≡ бокс
   canvas → анимация масштабируется с полем АВТОМАТИЧЕСКИ (п.3 ТЗ),
   combat-scale.js и его JS-расчёты НЕ используются. Canvas border 2px
   (border-box) — слой на 4px больше грида → смещение маркеров ≤2px:
   НЕ компенсируется (конвенция 000124: border < 0.1 клетки — «не
   усложняем»; маркеры декоративные, ~полклетки).

D3. **Геометрия маркеров — проценты** (масштабно-инвариантно):
   - rect-маркер (lunge/draw/hit): left = x/W·100%, top = y/H·100%,
     width = w/W·100%, height = h/H·100% от слоя (W = c.width, H = c.height;
     герой — (c.px, c.py, 1, 1); юнит — (u.x, u.y, size.w, size.h)).
   - снаряд (дротик): left/top = центр стрелка (%), размер в % слоя
     (3% × 0.6%), направление `rotate(var(--fx-angle))` — угол = Math.atan2
     в клеточных единицах (слой КВАДРАТНЫЙ — аспект сохраняется),
     полёт — @keyframes анимирует left/top от --fx-x0/--fx-y0 до
     --fx-x1/--fx-y1 (центры в %), 400ms linear.
   - выпадение: translate в % ОТ СОБСТВЕННОГО размера маркера = 0.5 клетки
     (LUNGE_CELLS = 0.5) в направлении цели (own% = 0.5/w·100; 1×1 → 50%,
     3×3 → ~16.7%); цели нет → 0 (пульс scale, без NaN: dist=0 → offset 0).
   Пин 000248-SC держит именно %-форму + тождество формул с баннером —
   это и есть контракт «масштабируется с полем» (см. D-тесты: отклонён
   вариант displaySize — vm-стаб не вычисляет CSS %-layout, а displaySize
   масштабирует canvas-бэкинг, к DOM % отношения не имеет).

D4. **Различение kind — без побочных эффектов, только снапшот G:**
   - герой: зеркало canDoAction (combat.js): прямое чтение
     `c.player.equipment.weapon` → `G.getItem(w).subtype === 'bow'` →
     'ranged', иначе 'melee'. **equipmentStats НЕ вызывается** — тот через
     ensureEquipment лениво СОЗДАЁТ/мутирует p.equipment (canDoAction
     обязан быть без побочных эффектов — прямой комментарий ядра).
   - союзник: `u.role === 'ranged' ? 'ranged' : 'melee'` (зеркало
     maxDist allyStrike; Эфир role 'support' → melee — совпадает:
     Касание духа всегда d≤1).
   - моб: `u.role === 'ranged' ? 'ranged' : 'melee'` (зеркало фазы мобов
     RANGED_MAX_DIST; у мобов оружия нет — общий силуэт, ТЗ).

D5. **ОДИН melee-силуэт для ВСЕХ melee** (герой: swordsman/heavy/fists/
   staff/кулаки; союзники; мобы) — различение по subtype НЕ вводится:
   в бою нет арта оружия (общие спрайты ролей), ТЗ допускает «единая для
   всех melee», инвариант «не больше ТЗ».

D6. **Цель: `victim || intended || null`** (ядро НЕ возвращает id цели:
   playerAttack → {ok,hit,dmg,killed,practice}; allyStrike efir →
   {ok,dmg,killed} БЕЗ hit):
   - victim — ПЕРВЫЙ в порядке c.units моб с `before > 0 &&
     (!u.alive || u.hp < before)`, где before — снимок HP (Map по c.units)
     ДО `run()` (снимок берётся ТОЛЬКО при action === 'attack'). Покрывает
     АВТО-таргет ядра nearestMob (не экспортируется — дублировать
     пространственную логику нельзя) и явную цель.
   - intended — c.targetId, если валиден (side==='mob', alive, !fled).
   - Промасх (r.ok, r.hit === false) — маркер атакующего + стрела (если
     toId), но `.combat-atk-hit` НЕ создаётся (паттерн комментария ядра
     runAction L910-912: действие потрачено, удар есть, цель не задета).
   - toId = null (промах без выбранной цели) — только маркер атакующего.
   - Unit-решение в render: цели нет в c.units (труп/флид в окне FX) →
     только src-маркер (null-guard, паттерн castFxCenter).

D7. **Источники (ноль правок ядра):**
   - a) герой — runAction, `action==='attack' && r.ok && !activeUnit(c)`:
     существующая запись `c._fx = {action:'attack', until:n+FX_MS}` НЕ
     трогается; рядом `c._attackFx = attackFxOf(c, 'player', n,
     heroBowKind(c))`.
   - b) союзник — НОВАЯ ветка `else if (action === 'attack')`
     (достигается только если activeUnit(c) ≠ null):
     `c._attackFx = attackFxOf(c, u, nowMs(), u.role==='ranged' ? 'ranged'
     : 'melee')`. c._fx НЕ трогается (P11/R15 000168: спрайт героя не
     анимируется на ударе союзника; чужой castFx не сбиваем).
   - c) мобы — READ-ONLY c._unitFx (эвристика 000062 в
     unitFxAfterMobPhase: `hurt && inStance` — именно этот моб уронил
     ИГРОКА и стоит в ударной позиции): from=u.id, toId='player',
     kind по u.role, hit=true (запись есть только при реальном уроне).
     Атака моба по СОЮЗНИКУ — без FX (прежнее ограничение 000226,
     эвристика до игрока; не расширяется — «не больше ТЗ»).

D8. **Длительность:** `ATTACK_FX_MS = 600` мс — верхняя граница (решение
   анализа; ритм BREATH_FX_MS/SPELL_FX_MS = 600; декоративна, не
   блокирует ход). Окно моба — его c._unitFx.until (300, СУЩЕСТВУЮЩЕЕ —
   НЕ расширяется: общее с canvas-позой моба). Внутренние тайминги CSS:
   lunge/draw 300ms ease-out both; стрела 400ms linear; hit — melee
   delay 100ms/dur 200ms (влезает в окно моба 300), ranged delay
   380ms/dur 220ms (дротик ~400, конец ровно 600). Всё ≤ 600.
   ДОПОЛНЕНИЕ (ревью 2026-10-23): ranged-ТАЙМИНГИ (стрела 400, hit
   380+220) — только для героя/союзника (окно ATTACK_FX_MS 600);
   для МОБА (окно c._unitFx = 300) — стрела --fx-arrow-dur 300ms,
   hit 100+200 (конец ровно 300): до фикса ranged-моб (orc_archer /
   skeleton_archer / wind_elemental / imp) терял стрелу на 75% полёта
   и не показывал вспышку (ревью-файдинг; пин 000248-MOBR).
   Таймаут-пин: T+601 (> любого until) + ре-рендер → маркеров нет.

D9. **Снятие — по render-tick, БЕЗ setTimeout** (vm-песочница без
   контроля таймеров; паттерн кода: c._fx/castFx/c._fx.breath/moveAnims —
   until + добор в render). `syncAttackFx(c, now)` — вызов в render()
   ПОСЛЕ `drawCastFx(c, now)`:
   - сбор источников: c._attackFx (now < until) + по c._unitFx:
     action==='attack', now < until, u.alive, !u.fled, side==='mob';
   - ленивый слой (D10) + маркеры по КЛЮЧАМ:
     `src-<from>-<at|until>`, `arrow-<from>-<toId>-<at>`,
     `hit-<toId>-<at>` (ключ несёт время → новый удар перезапускает
     CSS-анимацию; mob-ключ — по until, т.к. в c._unitFx записи нет at);
   - просроченные ключи — el.remove(); источников нет — слой remove(),
     atkKids = {};
   - идемпотентно (повторный render при том же now — no-op; «потерянный»
     tick безопасен — как тик после finish).

D10. **Слой — ленивый** (НЕ персистентный): создание при первом активном
   FX, удаление когда все источники истекли. В покое у .combat-box ровно
   4 ребёнка — пины CU196-POS (L8222), 237-CU-LOOT-1 (L10487, 5 с лутом),
   237-CU-LOOT-4 (L10621) проходят БЕЗ единой технической правки:
   ПРОВЕРЕНО — во всех трёх сценах нет UI-атаки (victory через
   G.combatInternals.dealDamageToMob — без runAction/фазы мобов; fled —
   диалог побега). Отклонён вариант «персистентный слой ребёнком box»
   (3 техре-пина) и «транзиентные маркеры прямо в box» (при фикс. now
   vm until не истекает — семантический провал 000237-пинов).
   z-порядок: слой — ПОСЛЕДНИЙ ребёнок box (appendChild; поверх баннера
   результата ≤600 мс на добивающем ударе — прецедент: узел лута 000237
   тоже sibling ПОСЛЕ баннера и целенаправленно над ним); z-index НЕ
   вводится. insertBefore НЕ используется: в стабе makeEl000246 он
   no-op (Proxy отдаёт неизвестным методам `() => undefined`) — красные
   пины DOM никогда не найдут слой; прецедента insertBefore в кодовой
   базе нет.

D11. **Кастом-свойства — инлайн, ТОЛЬКО bracket-присвоение:**
   `el.style['--fx-x0'] = '12.5%'` (работает и на реальном CSSOM, и на
   пустом объекте style стаба; `el.style.setProperty` в стабе БРОСИТ
   TypeError — НЕ используется). Свойства: --fx-lx/--fx-ly (% собственного
   размера маркера), --fx-x0/--fx-y0/--fx-x1/--fx-y1 (% слоя),
   --fx-angle (deg), --fx-hit-delay/--fx-hit-dur (ms).

D12. **Имена (NEW, grep-проверены свободны):** .combat-atk-layer,
   .combat-atk (базовый: position:absolute; box-sizing:border-box;
   pointer-events:none), .combat-atk-lunge, .combat-atk-draw,
   .combat-atk-arrow, .combat-atk-hit; @keyframes combat-atk-lunge /
   combat-atk-draw / combat-atk-arrow / combat-atk-hit — ПЕРВЫЕ в проекте.
   Палитра — существующие цвета (ROLE_COLORS melee #d9483b / ranged
   #e08a3c, подсветка цели #ffe27a, #e8dcc0) — «новых цветов не вводим»
   (паттерн 000038/000084).

## Границы и инварианты

- src/combat.js — НОЛЬ diff (формулы/ход/сид — бит-в-бит; 247
  детерминизм-голденны combat.test.js + guard 000248-DET).
- В FX-пути НЕТ Date.now/Math.random/c._rng (nowMs — UI-only; atan2 —
  чистая геометрия). НОЛЬ новых бросков c._rng.
- Сейв v1: сейва боя в полёте НЕТ (saveCombat отсутствует) →
  c._attackFx не сериализуется; поле на боевом объекте, не на герое.
- c._fx НЕ трогать (пины L681/719/747, CU118-FX, ally-spells, spellbook —
  все полевые; контракт: не расширять даже аддитивно).
- НОВЫХ canvas draw calls НЕТ (DOM/CSS-only).
- .combat-side / .combat-banner — новых детей НЕТ.
- CSS: ОДИН <style>; новый блок после .combat-actions (конец скоупа) +
  override внутри СУЩЕСТВУЮЩЕГО portrait-медиа; базовые правила intact
  (стражи 000124/000246); NEW-классы только; @keyframes — parse-чистые
  для cssRulesCommentAware (at-правила обходятся, в теле — декларации).
- НОВЫХ <script> НЕТ (index-order — 0 правок), НОВЫХ SVG-АССЕТОВ НЕТ
  (снаряд/выпадение — чистый CSS: svg.test.js/assets-refs — 0 diff).

## Ленивые ссылки и guards

- G.getItem — из снапшота на загрузку (items.js index.html L1100 <
  combat-ui.js L1290; в test-цепях CHAIN). Зависимостей на модули ПОСЛЕ
  combat-ui.js НЕ вводится (liveGame() не нужен). Нет items.js →
  typeof-guard → 'melee' (тихий фолбэк, паттерн G.hpBarColor).
- c.attack/c.endTurn/c.selectTarget — ядро (снапшот); activeUnit(c) —
  свой (G.activeUnitId с typeof-guard).
- syncAttackFx guards: нет boxEl/bannerEl (finish) → no-op; toId-юнита
  нет в c.units → только src-маркер; dist=0 → offset 0 (без NaN);
  c.units без side==='mob' → victim null.
- console.error в новом пути НЕТ (тихие фолбэки; пины errors.length===0
  держатся).
- atkLayer/atkKids сбрасываются в трёх точках (паттерн moveAnims):
  startCombat (рядом с `moveAnims = null`, L2954), finish (L2894),
  catch startCombat (L3107).

## Контракты тестов (tests/ui.test.js, раздел 000248 — append в EOF)

- Переиспользовать БЕЗ ПРАВОК (module-level): CHAIN_000246,
  makeEl000246, findAll000246, findByClass000246, cssDecl000246,
  makeStorage000246, page/src.
- НОВОЕ: `bootCombat000248` — дубль bootCombat000246 + `let T = 1000;`
  `performance: { now: () => T }`, возврат {G, body, errors, setT}.
  bootCombat000246 НЕ правим (семантических правок чужих тестов нет; его
  песочница без performance — nowMs упал бы в реальный Date.now,
  непригодно для пина истечения).
- `sceneAttack000248({bow, ally})`: startCombat({hero, mobs:['wolf'],
  mobLevel:1, seed:42[, efir: G.efir.createEfir()]}); позиции прямым
  присвоением после startCombat (melee: m0.x=c.px, m0.y=c.py-1; bow:
  c.py-3 — даль 4); bow — G.addItem(hero,'hunting_bow') + G.equip ДО
  startCombat (паттерн combat.test.js «лук: атака в даль»);
  c._rng = () => 0.0 (все попадания); c.selectTarget(m0.id).
- Действия — G.combatUI.handleCode (публичный экспорт; keydown в песочнице
  НЕ перехватывается — window.addEventListener no-op). Ре-рендер после
  setT — consumed-действие (даже отклонённое: `if (consumed) render()`;
  движение в стену — consumed).
- КРАСНЫЕ (8 — падают на master осмысленно: нет элемента/класса/keyframe,
  цепочка грузится чисто, errors.length===0 — первый ассерт):
  1. 000248-LNG — melee: слой есть, .combat-atk-lunge на клетке героя
     (left/top/width/height = % клетки), .combat-atk-arrow НЕТ,
     c._attackFx.kind === 'melee'.
  2. 000248-HIT — .combat-atk-hit на клетке цели (% волны).
  3. 000248-ARW — bow: .combat-atk-draw + .combat-atk-arrow ЕСТЬ,
     .combat-atk-lunge НЕТ (отличие от melee), .combat-atk-hit на цели;
     стрела: --fx-x0/--fx-y0 = центр стрелка, --fx-x1/--fx-y1 = центр
     цели (%); вторая сцена (c._rng 0.99 — промах): стрела ЕСТЬ, hit НЕТ.
  4. 000248-END — после атаки setT(T+601) + ре-рендер → .combat-atk в
     оверлее НЕТ (слой удалён), steady-state — слой отсутствует.
  5. 000248-MOB — Space (фаза мобов синхронна), волк в упор, c._rng 0.0 →
     .combat-atk-lunge на тайле моба + .combat-atk-hit на тайле игрока
     (общий силуэт; триггер — эвристика 000062).
  6. 000248-ALLY — efir (opts.efir), позиция: волк d≤1 от Эфира, НЕ d≤1
     от игрока; Space (ход игрока → фаза мобов → очередь) → фикстура
     activeUnitId = эфир (seed детерминирован; если порядок очереди
     иной — manipulate c.turnOrder/c.turnIndex, паттерн прямых мутаций
     c в vm-тестах); KeyJ → Касание (всегда hit) → lunge на тайле
     союзника + hit на тайле волка, kind 'melee'; c._fx НЕ 'attack'
     (P11/R15 — герой не анимируется).
  7. 000248-CSS (node) — правило .combat-overlay--combat
     .combat-atk-layer: position absolute, pointer-events none,
     width/height ТОЖДЕСТВЕННЫ формулам .combat-banner; 4 @keyframes
     (regex); 4 правила маркеров с animation; NEW-only-стража — базовые
     правила intact (cssDecl первого вхождения).
  8. 000248-SC — %-пины геометрии (style.left/top/width/height строк с
     %; лунж --fx-lx/--fx-ly %; стрела --fx-* %) + тождество формул
     слоя и баннера ВКЛЮЧАЯ portrait-override (контракт масштабирования).
- GUARD (зелёный с master, в red-счёт НЕ входит): 000248-DET — один сценарий
  (KeyJ + Space) в ДВУХ песочницах с тем же сидом → deepEqual
  [c.log, c.player.hp, units hp, c.result]; анимация не добавляет бросков
  c._rng (поток не растёт — побайтовые строки лога = голден ядра).
- expectedRedCount = 8.

## Что важно будущим задачам

- MERGE-ЗОНА: src/combat-ui.js и index.html общие с параллельными волнами
  (000247 города/подземелья и др.) — hunk'и разнесены по точкам:
  константа (~L170), refs (~L206), runAction (~L915-945), helpers
  (после castFxCenter ~L1586), syncAttackFx (после drawCastFx ~L1663),
  вызов в render (~L1847), три сброса (~L2894/2954/3107); CSS — один блок
  + одно медиа-правило; тесты — append в EOF. ПЕРЕБАЗИРОВАНИЕ на свежий
  master перед мержем ОБЯЗАТЕЛЬНО (000246 только что мержен; его
  side-порядок и пины не трогаем — build() не меняется).
- Слой ЛЕНИВЫЙ: будущий тест, пишащий box.children ПОСЛЕ UI-атаки, увидит
  5 детей ([canvas, spellbook, flee-confirm, banner, atk-layer]) —
  фикстура должна знать про слой (текущие 3 пина — сцены без атак).
- Формула баннера (100vh-32/100vw-304; portrait 520) — геометрия 000124/
  000246: при её изменении .combat-atk-layer меняется ВМЕСТЕ (пин
  000248-SC на тождество формул защитит от рассинхрона).
- Задача «события ядра боя» (крючок c._uiEvents — упомянут в комментарии
  unitFxAfterMobPhase): станет возможна точная атрибуция атак мобов
  (вкл. по союзникам) — точка расширения syncAttackFx (сбор источников).
- Боевой оверлей: слой — последний ребёнок .combat-box; новые absolute-
  слои, добавляемые в box, должны учитывать z (порядок детей).

## Подводные камни

- makeEl000246 (tests/ui.test.js): insertBefore — NO-OP (Proxy);
  style — ПУСТОЙ объект (bracket только, setProperty бросит); remove() —
  РЕАЛЬНЫЙ splice (пин истечения работает). makeEl (tests/combat-ui.
  test.js): remove() — NO-OP (слой в children доживёт до finish — пинов
  box.children там нет).
- Песочницы combat-ui.test.js — now ФИКСИРОВАН (performance.now =
  NOW84) → слой, созданный после атаки в них, НИКОГДА не истекает
  (until = NOW84+600): сцены с атакой не должны пинить box.children
  (существующие 3 — не атакуют, проверено).
- CSS keyframes с var() тестами НЕ исполняются → ВИЗУАЛЬНЫЙ QA-чекпоинт
  в браузере обязателен (полёт дротика, glow поверх баннера, масштаб).
- Запись c._fx у героя ПЕРЕЗАПИСЫВАЕТСЯ каждым новым действием
  (существующее) — c._attackFx так же (один активный FX; второй удар
  в том же окне — новый ключ → маркер пересоздан, анимация restarted).
- Касание Эфира возвращает {ok, dmg, killed} БЕЗ hit → r.hit !== false
  = true (всегда попадает — верно).
- Снимок HP — ДО run(), только для attack; before > 0 — защита: труп
  предыдущего раунда (before = 0) — НЕ victim.
- 000246-сэндбокс без performance — не переиспользовать для пина
  истечения (отдельный bootCombat000248).
- deepStrictEqual МЕЖДУ двумя vm-песочницами ложно-красный: c.log /
  c.units — массивы из vm-контекста, и Array.prototype каждого
  контекста СВОЙ — прототипы не равны, значения идентичны (проверено:
  «Values have same structure but are not reference-equal»). Снимок
  для 000248-DET — JSON.parse(JSON.stringify(...)) — realm-агностичен
  (undefined → null — симметрично в обоих прогонах).

## План реализации (для красной/зелёной стадии)

1. tests/ui.test.js: раздел 000248 (красные 8 + guard DET) — append в EOF,
   по контрактам выше. npm test → ровно 8 красных, остальное зелёное.
   (Сделано: раздел добавлен; DET-гард зелёный с master — snapshot —
   JSON-рандтрип из-за cross-realm прототипов, см. подводные камни.)
2. src/combat-ui.js (+~120 строк, ТОЛЬКО вставки, без коментариев):
   - после L170: `const ATTACK_FX_MS = 600; const LUNGE_CELLS = 0.5;`
   - после L206: `let atkLayer = null; let atkKids = {};`
   - runAction: снимок hpMap ДО `const r = run()` (только attack);
     hero-ветка: + c._attackFx; НОВАЯ ветка ally (else if action==='attack');
   - после castFxCenter (~L1586): attackFxOf / heroBowKind /
     attackVictimId / attackIntendedId;
   - после drawCastFx (~L1663): syncAttackFx (сбор источников, ленивый
     слой, маркеры по ключам, чистка);
   - render: `syncAttackFx(c, now);` после drawCastFx (L1847);
   - сбросы: startCombat L2954, finish L2894, catch L3107.
3. index.html (+~95 строк CSS): блок после `.combat-actions
   { margin-bottom: 0 }` (конец боевого скоупа): .combat-atk-layer,
   .combat-atk, .combat-atk-lunge/--draw/--arrow/--hit, 4 @keyframes;
   override .combat-atk-layer внутри portrait-медиа после
   .combat-victory-loot. Скрипты не трогаются.
4. npm test → всё зелёное (800+ тестов сьют); один полный прогон в worktree.
5. memory/000248-combat-attack-fx.md (этот файл) — коммитится ВМЕСТЕ
   с кодом/тестами (один коммит: «Задача 000248: …»).
6. CHANGELOG.md — отдельный коммит «Задача 000248: CHANGELOG — …»
   (2026-10-23, «Графика»: анимация атаки в бою — стрела из лука,
   выпадение в ближнем; без программных деталей).

## Ревью 2026-10-23 (правки по итогам ревью)

- F1 (fixed): ranged-моб обрезан (стрела 400ms и hit 380+220=600 не
  влезали в 300-мс окно c._unitFx; стрела исчезала на 75% полёта,
  вспышка не стартовала). Фикс: источник моба в syncAttackFx помечен
  `mob: true`; стрела моба — `el.style['--fx-arrow-dur'] = '300ms'`
  (CSS: `animation: combat-atk-arrow var(--fx-arrow-dur, 400ms)
  linear both` — дефолт героя не изменился); hit моба — melee-тайминги
  (100+200, конец ровно 300) через `tightHit = s.kind === 'melee' ||
  s.mob`. Окно c._unitFx и canvas-позу (000062) НЕ трогали. Новый пин
  000248-MOBR (имп, d=3, Space: draw + arrow 300ms + hit 100/200).
- F2 (fixed): 2 строки чужого гард-теста 000246-TOP-4 (заголовок +
  сообщение assert) правились в red-коммите косметически («элемента»
  → «элементы») — восстановлен МАСТЕРСКИЙ текст побайтово (дифф блока
  против master: 0 отличий). Дисциплина: чужие тесты не трогаем, даже
  косметически.
- F3 (fixed): 000248-CSS теперь пинит центрирование слоя:
  layer.top/left/transform === banner.top/left/transform (D2: бокс
  слоя ≡ бокс canvas — от этого выравнивание маркеров с клетками).
- F4 (skipped, задокументированное ограничение): атака моба по
  СОЮЗНИКУ без FX — эвристика 000062 пишет 'attack' только когда
  урон получил ИГРОК (hurt). Точная атрибуция (вкл. по союзникам)
  требует события ядра (c._uiEvents) — нарушение ограничения ТЗ
  «НОЛЬ изменений боевого ядра» + «не больше ТЗ»; отложено в задачу
  «события ядра боя» (см. «Что важно будущим задачам»).

## Финализация (2026-10-23)

- Статус: ВЫПОЛНЕНО. Отчёт: tasks/result/000248.md; задача
  перенесена в tasks/done/000248.md.
- Свежий полный npm test на финализации: **3078/3078/0** (база
  0136281: 3068; +10 пинов: 9 красных + гард 000248-DET; MOBR —
  ревью). RED: 8 красных на e8ff33c, все зелёные после 2040683.
- Master ушёл от базы на +10 коммитов (000230.11, 000242, 000239,
  000247, ретро, новые задачи). Dry-run `git merge-tree`:
  конфликты при ребейзе в CHANGELOG.md (мой «### Графика» — в тот
  же раздел `## 2026-10-23`; разрешение: пункт в существующий
  заголовок «### Графика» 000230.11, всё сохранить) и
  tests/ui.test.js (000230.11 и я — оба append в EOF; разрешение:
  оба раздела). index.html — auto-merge (000247 — dungeon-CSS).
  После ребейза — полный npm test.

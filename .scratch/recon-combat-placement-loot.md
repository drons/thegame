# Разведка (a759e212, завершена): (A) расстановка перед боем + (B) лут на экране итога

## (A) 000260 — расстановка Флогистона/Эфира/союзников в первых двух линиях

**Карта/старт (src/combat.js):**
- Размер: `:3370-3371` `width = opts.width || 7`, `height || 7` (7×7; memory/000124: 336×336, CELL=48, «НЕ ПОДНИМАТЬСЯ»).
- Игрок: `:3416-3417` `px = floor(w/2), py = h-1` → (3,6).
- Мобы: `placeUnits` `:3120-3166` — крупные первыми построчно сверху; 1×1 якоря `xs=[1,3,5,0,2,4], y = i<3 ? 0 : 1` → мобы на y=0..1. Без RNG; throw 'нет места для моба'.
- Союзники: `placeAllies` `:3176-3207` — якоря в порядке allies: `[px-1,py-1],[px+1,py-1],[px,py-1],[px-1,py],[px+1,py]` → y=5..6. Эфир ПЕРВЫМ (combat-ui.js:2957-2958) → всегда (2,5). Фолбэк — скан снизу; throw 'нет места для союзника'. `allyRoom` `:3214-3234`.
- Порядок createCombat `:3361-3623` (= порядок RNG-потока, ЗАПИНЕН): delta-roll → placeUnits (без RNG) :3464 → placeAllies :3472-3475 → generateObstacles :3479 (reserved из c.px,c.py + стартовые прямоугольники мобов :3274-3283 + BFS) → refillPools :3480 → c.targetId=nearestMob :3503 → buildTurnOrder+advanceQueue :3513-3515 (pre-roll: юниты с ини выше игрока синхронно ДО хода игрока, могут убить).
- Этапа «перед боем» НЕТ. Вызовы: main.js:1766 (startCombatAt), :2490 (мир, seed hash2(t.x,t.y,0x5eedc0de)), :3082 (подземелье); combat-ui.js:2951 startCombat → :2993 createCombat → build+render :3048. Позиции из UI НИКОГДА не передаются.

**UI (src/combat-ui.js):**
- CELL=48 :111; canvas c.width*CELL :316-317; бэкинг combat-scale.js (MAX_SCALE=8, BASE=336).
- build() :299-652: overlay .combat-overlay--combat :308; .combat-side колонка :327/341/357/361/540-542 (turnorder→hpbar→mpbar→state→log→quicklist→actions); кнопки G.CombatKeys.describeCombatKeys() :373-405; .combat-banner :572-576 (onclick=finish); .combat-flee-confirm :546-570.
- render() :1710-2084: фон→сетка→штриховка досягаемости→препятствия→юниты→эффекты; баннер :2064-2083.
- Клик canvas :598-651: нормализация :614-619; живой моб → c.selectTarget :621-627; canResurrectPick :637-648. РЕЖИМА РАССТАНОВКИ НЕТ. Паттерн 000171: только нативный click, pointerdown НЕ добавлять.
- turnorder :1043-1089 (.turn-token, ROLE_COLORS, title «имя (ур. N) — состояние»).
- finish() :2844-2913: teardown ВСЕХ DOM-refs (:2879-2895) + onEnd; зеркальный teardown в catch startCombat :3053-3116 (правило «обе точки», memory/000170/000199/000227/000237).

**Тесты-пины (tests/combat.test.js):** 1223-1245 (размер/без перекрытий), 2230-2252 (союзники d≤2 манхэттен), 2254-2287 (3/4 союзника «у старта»), 2289-2316 (reg (0,0) + 4×1 + throw), 3244-3284 (Эфир (px−1,py−1)), 2012-2039 (препятствия вне стартов + BFS), 1571-1581 (очередь на старте), 5139-5190 (goldens c.result.items).

**Ключевые ограничения (A):**
- Перестановка ДО generateObstacles не сдвигает RNG-поток; ПОСЛЕ — сдвинет (репин N5/D-BOSS-2 goldens).
- «Первые две линии» со стороны игрока = y=5,6; мультиселловые мобы (до 3×3) — со стороны мобов, в расстановке игрока не участвуют.
- Контракт 000124: геометрия — только в скоупе .combat-overlay--combat.

## (B) 000261 — лут на экране окончания боя

**Сейчас:**
- Баннер: combat-ui.js:2065-2073 `ПОБЕДА!\n+${r.xp} опыта, +${r.gold} золота` (fled/dead — свои тексты); CSS .combat-banner index.html:376-389 → **font-size: 22px** (:384) — это и есть «шрифт золота/опыта».
- Лут: renderVictoryLoot(c) :2088-2115 (000237): ленивая сборка, кэш lootEl, guard; строка = div.cp-itemrow → img.cp-itemicon (22×22, index.html:100; it.icon из каталога, у материалов assets/sprites/loot/) + span.cp-itemname `it.name (×qty)`. НИ rarity-класса, НИ цвета текста, НИ тултипа.
- CSS .combat-overlay--combat .combat-victory-loot — index.html:459-472: position absolute; top/left 50%; transform translate(-50%, calc(50% + 28px)); width min(100vh-32px, 100vw-304px); display flex; flex-wrap wrap; justify-content CENTER; gap 2px 8px; pointer-events none (клик → баннер → finish). font/color НЕ заданы → наследует .combat-overlay: **13px/1.5 ui-monospace, #e8dcc0** (index.html:244-253).
- Шов: bannerEl.textContent стирает детей — узел лута СИБЛИНГ баннера (memory/000237 §6.1).
- Ядро: c.result = {outcome, xp, gold, defeated, allyXp, efirXp, items:[{id,qty}]} — combat.js:1345-1399 (rollVictoryLoot :1297-1343, слияние qty, редкость-ролл в конце 000230.05). Редкость НЕ в result — только каталог it.rarity (экипировка; расходники БЕЗ rarity → нужен фолбэк-цвет).
- Редкость→цвет: ТОЛЬКО border-классы index.html:108-112: .cp-itemrow.cp-rarity-{common #a39b8b, rare #58a858, epic #5b8fd4, legendary #9b6bd4, impossible #e0952f}; класс ставит itemRow() ui.js:455-457; RARITY_NAMES ui.js:478-481; RARITY loot-equip-data.js:22-28.
- SPEC: экрана итога в spec/*.md НЕТ; контракт = код + memory/000237 + тесты. spec/combat.md — 24 строки (без карты/расстановки/итога).

**Тесты-пины (B):** combat-ui.test.js 10480/10557/10590 — ТОЧНЫЕ баннер-пины ('ПОБЕДА!\n+12 опыта, +5 золота' и т.д.); 10492-10510 — структура box.children===5 + классы + img.src; 10536+ ×2-слияние; 10576+ пустой лут display:none; 10604+ fled — 4 ребёнка; CU196-POS 8207-8233 (без c.result — ровно 4 ребёнка); combat-layout.test.js 237-CSS 424-449 (transform/width/pointer-events + portrait); ui.test.js 230.07-RAR-1 399-428 (5 классов + 5 hex), 739+ (расходники без рамки).

**Целевое по ТЗ:** лут — в столбик, align-left, font-size 22px (= .combat-banner), текст каждой строки предмета — цветом редкости (5 hex из :108-112), расходники без rarity — фолбэк-цвет (решение анализа; например #e8dcc0 база).

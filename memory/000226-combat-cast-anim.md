# 000226 — БОЙ: анимация применения заклинаний (контракт станции Проектирование)

**СТАТУС: ВЫПОЛНЕНО (Finalize, 2026-10-17).** Задача в tasks/done;
отчёт — tasks/result/000226.md. Итоговое решение по расхождениям
a1-domain / a2-arch / a3-tests — этот файл контракт и источник
правды станций Красные тесты / Разработка / Ревью; реализация
соответствует контракту. Финал: **2663/2663 зелёные** (красных
5 → 0; ревью-фикс 79ca4be — +CU226-NOMOTION; CHANGELOG 7b1854f).
Worktree `.worktrees/task-000226`, ветка `task/000226`, база master
4d75aab (baseline 2655/2655).
ТЗ `tasks/pending/000226.md` (1 строка): «Добавить анимацию
применения заклинаний в бою».

## 0. Итоговые решения (расхождения анализов решены)

* **R1. Точки записи FX — ТРИ (a1/a3), не две (a2).** castRow +
  resurrectCast + legacy-ветка runAction ('cast'/'heal'), ВСЕ только при
  `r.ok`. Почему: legacy-кнопки/клавиши K (Эфир) и H (наёмник) — путь
  применения БЕЗ выбора из книги (fallback 000227, дефолтный тач-путь);
  «анимация применения заклинаний в бою» без них = дыра на основных
  клавишах. Комментарий 000227 «свою строку/FX НЕ вводить» — про строки
  ЛОГА (строку строит ядро, бит-в-бит — пины CU178-CAST/HEAL держим) и про
  то, что lastSpellPress сам не дублирует воронку; UI-FX-состояние он не
  запрещает. Строки лога 000226 НЕ добавляет.
* **R2. Поза каста — ЭФИР играет существующие кадры cast_{1,2} (a1/a3),
  герой гейтится по кастеру (фикс QUIRK), наёмник — ВЕЗДЕ 'idle' (Q2 = НЕТ
  новых SVG).** Почему: кадры efir/cast_*.svg существуют (000034, каталог
  8 файлов, пин svg.test.js), но ни разу не использовались — используем
  мёртвый ассет, 0 новых ассетов; наёмников cast-ассетов НЕТ,
  mercFrames(id,'cast') → [] → ORC-fallback = смена идентичности (ЗАПРЕЩЕНО,
  пины 000084) — поэтому строгий `u.kind === 'efir'`-гейт; ТЗ ассетов не
  просит («не больше и не меньше»). QUIRK «герой кастует за союзника»
  чиним: hero-ветвь 'cast' ТОЛЬКО при castFx.from === 'player';
  семантика СОСТОЯНИЯ c._fx.action='cast' после каста союзника НЕ меняется
  (пины CU179-EFIR L4721 / CU166 L3178 / CU171 L4331 зелёные); рисунка
  hero-cast-кадра и efir-cast-кадра НЕТ ни в одном тесте (grep по tests/
  пуст) → 0 ре-пинов.
* **R3. FX-форма — гибрид a1+a2: полёт снаряда + импакт (a1) + кольцо на
  кастере + всплывающее имя (a2). 600 мс (a1, прецедент BREATH_FX_MS=2×FX_MS),
  НЕ 300 (a2).** Почему: «анимация ПРИМЕНЕНИЯ» = виден перелёт до цели и
  удар по цели (а2-статика без полёта — лишь вспышка; a1 без имени — не
  видно КАКОЕ заклинание); окно 600 = 2× окно позы (поза 300 мс — kaster
  держит позу в фазе полёта, импакт — в момент возврата в idle, паттерн
  000118 «эффект дольше герой-кадра»).
* **R4. Палитра — ТОЛЬКО значения существующих боевых констант (a1), НЕ
  новые hex (a2).** огонь '#e08a3c' (ROLE_COLORS.ranged), лёд '#8cf2fc'
  (ALLY_MARKER), тень '#b06ad4' (ROLE_COLORS.leader), исцеление '#6fdc6f'
  (HP-зелёный L1271/L1327), природа '#5cb85c' (ROLE_COLORS.support),
  защита '#e0b13c' (ROLE_COLORS.swarm); fallback неизвестной школы
  '#ffe27a' (подсветка цели). Производные rgba(те же RGB, α) для
  свечения/подложек — паттерн ALLY_MARKER_UNDERLAY / MOB_REACH_HATCH
  («производное существующего, не новый цвет»); a2-прецедент MOB_REACH_HATCH
  разрешал новые hex, но строгое чтение паттерна 000038/000084 —
  «новых цветов не вводим» — выбираем a1.
* **R5. toId — явные цели зеркалируются, ПРОСТРАНСТВЕННЫЕ автоцели ядра —
  НЕТ (a2-правило для nearestMob/nearestEnemy/nearestMobFor).** Явная
  цель (c.targetId, переданная в каст) + r.ok ⟺ ТО САМАЯ цель ядра
  (ok:true ⟹ прошёл весь гейт evalSpell на этом targetId) → рисуем точно.
  c.targetId === null (ядро само нашло ближайшего моба — пространственная
  эвристика) → toId = null → маркера на цели НЕТ (кольцо кастера + имя +
  поза рисуются; не ложимся на чужую клетку — урок 000037: не дублируем
  механику). НЕ-пространственные зеркала (простые, детерминированные,
  LOW-риск) ДОПУСКЕНЫ: воскрешение (мёртвый игрок приоритетно → первый
  мёртвый союзник в порядке c.units) и legacy-лечение (mostWounded).
* **R6. Имя заклинания — ВКЛЮЧАЕМ (a2), font '6px ui-monospace, monospace'
  (СУЩЕСТВУЮЩИЙ размер canvas-текста combat-ui — уровень L1279/L1333),
  НЕ '7px' (a2-вариант) — не вводим новый размер.** Имя над кастером,
  цвет школы: связывает «какое заклинание» с цветом (школа) — книга после
  успеха ЗАКРЫВАЕТСЯ (атомарность 000037), без имени применение
  самореферентно. Аудит: ни один существующий тест не ассертит
  fillText-состав после успешного каста → 0 ре-пинов.
* **R7. Еasing — liveGame().motion.easeInOut (patern mobAnchor 000174/
  L724-741), деградация — линейная.** motion.js грузится ПОСЛЕ combat-ui
  (index.html 1202; vm-цепочка — тоже в конце, loadCombatUi L283-291) →
  в снапшоте G НЕТ, только лениво в момент вызова (UMD-ловушка 000038).
  В песочнице motion есть → ease; без него — линейный k (краха нет).
* **R8. Имя под-объекта — `c._fx.castFx` (a2-имя, специфичнее a1 'spell');
  поля {at, until, spellId, name, school, from, toId}.** c._fx — runtime-
  only (save.js полей боя не сериализует — факт a1/a3); ключи action/until
  НЕСМЕННЫ (пины), castFx — additive.

## 1. Что добавлено (контракты)

ОДИН файл src — **src/combat-ui.js**. 0 правок ядра (combat.js/
spells.js/ally-spells.js/motion.js/sprites.js), 0 модулей, 0 index.html,
0 SVG, 0 CSS, 0 c._rng, 0 строк лога.

### 1.1 Константы (вставки H1)
* `SPELL_FX_MS = 600` (рядом с BREATH_FX_MS, ~L154-158) — окно castFx.
* `CAST_FX_SCHOOLS` (6 школ → R4-значения), `CAST_FX_FALLBACK = '#ffe27a'`,
  `CAST_FX_TARGETED = { 'урон': 1, 'ослабление': 1, 'контроль': 1 }`,
  `CAST_FX_TEXT = '6px ui-monospace, monospace'` — рядом с палитрой
  (L112-131).
* `rgba(hex, a)` — чистый хелпер (6 цифр hex → 'rgba(r, g, b, a)'), рядом
  с draw-хелперами.

### 1.2 Заявка FX — `c._fx.castFx`
* `castFxOf(c, u, spell, toId, now)` — чистый паковщик:
  `{ at: now, until: now + SPELL_FX_MS, spellId: spell.id, name:
  spell['название'], school: spell['школа'], from: (u === c.player)
  ? 'player' : u.id, toId: toId || null }`; `!spell` → null.
* `toId` (решается НА ТОЧКЕ ЗАПИСИ, до/после ядра — только из данных
  до-состояния, 0 новых вызовов ядра):
  * урон/ослабление/контроль: `c.targetId || null` (castRow И legacy
    'cast' — ядро получает ТОТ ЖЕ targetId);
  * лечение/защита (книга): `'self'` (ядро: player P.heal / союзник t=u);
  * воскрешение: `явная (c.targetId / resurrectTargetId(c)) ||
    autoResurrectId(c)`;
  * legacy 'heal' (c.heal): `healFxTargetId(c) || null`.
* Зеркала (чистые, 0 c._rng):
  * `autoResurrectId(c)` = `c.player && !c.player.alive ? 'player' :
    (первый c.units: side 'ally' && !alive && !fled).id || null` —
    зеркало spells.js L393-405 / ally-spells.js L246-259;
  * `healFxTargetId(c)` = зеркало mostWounded(c, 1) (combat.js
    L2538-2549): игрок первым (frac = p.hp / G.derived(p).maxHP — ТОТ ЖЕ
    источник, что render() L1628-1630; G.derived — жёсткая зависимость
    render, guard не нужен), затем живые не-fled союзники в ПОРЯДКЕ
    c.units (side 'ally', u.maxHP > 0); eligible — frac < 1; лучший —
    мин. frac (строгое <) → тай = игрок. Возврат 'player' | id | null.

### 1.3 Точки записи (все — только при `r.ok`)
1. **castRow** (L2186-2189): `const n = nowMs(); c._fx = { action: 'cast',
   until: n + FX_MS, castFx: castFxOf(c, u, r.spell, toIdOf(c, r.spell,
   c.targetId), n) }; bookOpen = false;` — `u = unitOf(c)` (уже в скоупе);
   форма {action, until} сохранена (пины зелёные).
2. **resurrectCast** (L2258-2264): `tid = resurrectTargetId(c)` выносится
   в переменную (уже считается; передать и в каст, и в castFx); кастер =
   c.player (кнопка гейтится гейтом 3 000168 на игрока);
   `toId = tid || autoResurrectId(c)`.
3. **runAction** (L899-906), legacy: после attack-ветки —
   `else if (action === 'cast' || action === 'heal') { const u =
   activeUnit(c); if (u) { … } }`: `sid = G.autoSpellFor ?
   G.autoSpellFor(u, action === 'heal' ? 'лечение' : 'урон') : null`
   (ТОТ ЖЕ strongestKnown, что ядро — детерминизм; прецедент выбора —
   spellBtnOf 000227), `entry = G.SpellsData.SPELLS_BY_ID[sid]`
   (typeof-guard; r.ok ⟹ entry есть — ядро успехом подтвердило
   strongestKnown, degrading-ветка недостижима, но `!entry` → castFx
   null, краха нет), `toId = (action === 'heal') ? healFxTargetId(c) :
   c.targetId`; `c._fx = { action: 'cast', until: n + FX_MS, castFx:
   entry ? castFxOf(c, u, entry, toId, n) : null }`.
   Отказ (r.ok false) — НУЛЬ записей (пины «cast-FX нет» L4494/L4525/
   L4623/L760 держатся).

### 1.4 Слой `drawCastFx(c, now)` (вставка H5, вызов H8)
Вызов — в render() **СРАЗУ ПОСЛЕ `drawBreathFx(c, now)`** (L1669; z-порядок
000114 §4: фон → сетка → штриховка → препятствия → юниты → эффекты; слот
«будущие боевые эффекты вызываются здесь» L1666-1668). Без `c._fx.castFx`
/ `now >= until` — ранний возврат, **0 draw-вызовов** (негативные пины).
`t = (now - at) / (until - at)` ∈ [0,1). `color = CAST_FX_SCHOOLS[fx.school]
|| CAST_FX_FALLBACK`.
* Центры: кастер — 'player' → `((c.px+0.5)*CELL, (c.py+0.5)*CELL)`,
  иначе юнит c.units по id → breath-формула `((u.x + w/2)*CELL, …)`;
  цель — 'player' → hero-клетка, id → юнит (мёртв/сбежал — x,y заморожены,
  рисуем туда), не найден → маркера цели нет.
* (1) ИМЯ (ВСЕГДА): `g2.font = CAST_FX_TEXT; g2.textAlign = 'center';
  g2.fillStyle = color; g2.fillText(fx.name, ccx, max(2, ccTop - 6 - 10t))`
  (ccTop = верха клетки кастера; кламп ≥2 — верхний ряд, паттерн 000047).
* (2) SELF (toId 'self'): аура на кастере — ОДНА пара: `arc(cc,
  CELL*(0.3 + 0.3t))` fill `rgba(color, 0.25)` + stroke color lw 2
  (паттерн drawBreathFx(1)).
* (3) Кольцо на кастере (targeted и null-цель): `arc(cc, CELL*(0.3+0.3t))`
  stroke color lw 2 (без fill) — маркер «кто кастует» (у наёмника —
  единственный; в фазе импакта — держит кастера, пока цель засвечена).
* (4) Полёт (t < 0.5): `k = motion.easeInOut(t/0.5)` (liveGame(),
  деградация — t/0.5); `pos = lerp(cc, tc, k)`:
  * свечение: `arc(pos, CELL*0.16)` fill rgba(color, 0.3);
  * ядро: `arc(pos, CELL*0.07)` fill color;
  * кольцо: `arc(pos, CELL*0.12)` stroke color lw 2;
  * хвост: `arc(pos − dir*CELL*0.14, CELL*0.06)` fill rgba(color, 0.18)
    (dir — нормаль к вектору cc→tc; dist 0 → хвост нет).
* (5) Импакт (t ≥ 0.5): `q = (t−0.5)*2`, на цели: `r = CELL*(0.25+0.45q)`;
  вспышка: `arc(tc, r)` fill rgba(color, 0.35*(1−q)); кольцо: `arc(tc, r)`
  stroke color lw 2.
* 0 мутаций c, 0 c._rng, только beginPath/arc/fill/stroke/fillText
  (0 SVG, 0 drawImage).

### 1.5 Позы (правки drawUnits)
* **ally-ветвь** (L1261): `const cfx = c._fx && c._fx.castFx; const
  allyAction = (c._fx && c._fx.action === 'cast' && now < c._fx.until
  && cfx && cfx.from === u.id && u.kind === 'efir') ? 'cast' : 'idle';
  const img = allyFrames(u, now, allyAction);` — Эфир: cast-кадры
  (EFIR_FRAMES.cast — 2 кадра, G.frameIndex как idle); наёмник: ВСЕГДА
  'idle' (СТРОГИЙ kind-гейт — 'cast' у наёмника упал бы на ORC-fallback =
  смена идентичности).
* **hero-ветвь** (L1349-1350): `const cfx = c._fx && c._fx.castFx; const
  action = (c._fx && c._fx.action && now < c._fx.until &&
  !(c._fx.action === 'cast' && cfx && cfx.from !== 'player'))
  ? c._fx.action : 'idle';` — 'attack' без изменений (у attack castFx нет);
  cast без castFx (defensive) → 'cast' (старое поведение).

## 2. Ленивые ссылки и guards (UMD-ловушка 000038)

* Sнапшот G НЕ меняется (0 новых скриптов). В снапшоте уже есть:
  G.SpellsData (spells-data.js 1041), G.autoSpellFor (combat.js 1040,
  экспорт 000227), G.derived (sheet.js — render() L1628 зовёт БЕЗ гарда →
  жёсткая зависимость, используем так же).
* НЕ в снапшоте: motion (motion.js ПОСЛЕ combat-ui) — только
  `liveGame().motion` с typeof-гардом → линейный fallback (паттерн
  mobAnchor L724-741).
* G.autoSpellFor/G.SpellsData — typeof-guard → entry null → castFx null
  (деградация: без FX-маркеров, поза/состояние как есть, краха нет,
  0 console.error — это НЕ нарушение порядка загрузки: модули core,
  порядок закреплён index-order.test.js; one-shot console.error — только
  для ОПЦИОНАЛЬНЫХ модулей, паттерн spellBookWarned).
* finish()/build(): новых module-level состояний НЕТ (FX живёт в c._fx —
  свежий объект на бой) → сбросов добавлять НЕ нужно (паттерн 000118/
  000227: c._fx не сериализуется, save.js полей боя не имеет).

## 3. Карта тестов (станция Красные тесты)

Блок `// ===== Задача 000226` — **EOF** tests/combat-ui.test.js (после
L9288, блока 000210; блок 000227 — в СЕРЕДИНЕ у якоря 000193.01 — append-
конфликт исключён, контракт 000227 §6). Фикстура **scene226** = копия
scene227 + `opts.loader` → `spriteLoader` (паттерн fakeLoader84 L1573,
префиксы для дистинкции кадров по __path/__fake — vm-правило 000082):
'efir/cast_' → efirCast, 'efir/' → efir, 'phlogiston/cast_' → heroCast,
'phlogiston/' → hero, 'mobs/orc_' → orc, 'mercs/' → merc. Фазы — mutable
`let T` + `performance:{now:()=>T}` (паттерн 000174 L3930-3960).

8 test(): **5 красных + 3 зелёных guard (expectedRedCount = 5)**
(8-й — CU226-NOMOTION, добавлен правкой по итогам ревью: линейный
фолбэк без motion.js, R7 — см. §3-сноску ниже).

1. **CU226-CAST** (красный). Каст ИГРОКА из книги (spark: огонь/урон):
   guard-зелёные (строка ядра, c._fx {action 'cast', until NOW+300} —
   регрессия 000149, hero-кадр cast в окне / idle после — паттерн 000047,
   книга закрыта); RED: `c._fx.castFx === {at: NOW, until: at+600,
   spellId 'spark', name 'Искра', school 'огонь', from 'player', toId
   wolf.id}`; T+150: orb-вызовы (arc stroke/fill '#e08a3c') в СРЕДНЕЙ
   точке кастер→цель (easeInOut(0.5)=0.5 — robust к формуле), имя
   fillText 'Искра' (font '6px ui-monospace, monospace', textAlign
   'center', fillStyle '#e08a3c'); T+450: импакт-arc на ЦЕЛИ
   ((wolf.x+0.5)*48, (wolf.y+0.5)*48), r = 48*(0.25+0.45*0.5) = 22.8;
   T+650: 0 school-arc / 0 fillText имени (ранний возврат).
2. **CU226-EFIRBOOK** (красный). Книжный каст Эфира (scene226 {efir,
   spells, allySpells, loader}; pre-roll стоп 'efir' — паттерн CU179
   L4659): guard (лог «Эфир: «Искра» — Волк: 6.», efs.spellInt 1→0,
   u.mp 11→8, c._fx.action 'cast' — пин L4721 ДИЗАЙН СОХРАНИЛ, 0 c._rng);
   RED: drawImage __path 'assets/sprites/efir/cast_*' в окне (today —
   allyFrames 'idle' хардкод L1268), после until — 'idle'; FX-орб — ОТ
   клетки Эфира, импакт — на волке; RED (quirk-фикс): drawImage
   'phlogiston/cast_*' в окне НЕТ (today герой играет cast — пин
   «не рисуется» падает сегодня, зелёный после R2-гейта).
3. **CU226-EFIRLEGACY** (красный). Legacy «Каст» кнопкой без выбора
   (сцена CU178-CAST + loader): guard (лог/мана/пул/0 c._rng бит-в-бит —
   CU178-CAST строки ядра НЕ тронуты); RED: Эфир-кадры 'cast' + FX на
   клетке волка (today: runAction legacy c._fx НЕ пишет вовсе — анимации
   нет).
4. **CU226-MERC** (красный). Legacy «Лечение» медика (CU178-HEAL + loader,
   player 15/25 → mostWounded = игрок): guard (лог «Медик лечит
   Флогистон (+6).», hp 15→21, mp 5→2, spellWis 1→0; спрайт наёмника —
   idle-путь (орк/mercs idle), cast-пути НЕТ — guard скоупа Q2); RED:
   FX на клетке ИГРОКА (toId 'player' — зеркало mostWounded).
5. **CU226-RES** (красный). Воскрешение кнопкой (паттерн scene227yield:
   мёртвый союзник, hero.spells ['resurrect','spark']): guard (строка
   ядра + 50% HP, c._fx.action 'cast' — L3178, hero-кадр cast); RED:
   toId = id воскрешённого, импакт-FX на ЕГО клетке.
6. **CU226-REJ** (зелёный guard). Отказы → БЕЗ FX: (a) Эфир mp=0,
   (b) игрок spellInt=0, (c) медик без раненых: под-объект castFx НЕ
   записан (c._fx undefined / action !== 'cast'), 0 FX-вызовов в
   render-срезе, ровно ОДНА строка причины, трат НЕТ, книга открыта
   (a/b), 0 c._rng.
7. **CU226-PURE** (зелёный guard). Чистота: deep-снапшот c (кроме
   c._fx/c._unitFx/c._uiMoves) ДО/ПОСЛЕ 2 render-tick'ов в окне FX —
   идентичны; счётчик c._rng на рендерах не меняется; 0 console.error.
8. **CU226-NOMOTION** (зелёный guard, добавлен ревью 000226).
   `scene226({spells, withoutMotion})` (опция loadCombatUi — прецедент
   CU182-NOMOTION 000182, L295; фикстура scene226 пропускает опцию —
   техническая проводка, дефолт бит-в-бит): успешный каст ИГРОКА
   (spark, как CU226-CAST), T+150: рендер полёта БЕЗ краха, ядро орба
   (r 0.07·CELL), свечение (r 0.16·CELL) и кольцо (r 0.12·CELL) в
   СЕРЕДИНЕ кастер→цель, имя fillText; 0 console.error. Покрывает
   линейную ветку `k = t / 0.5` (R7, combat-ui.js drawCastFx) — все
   7 прежних тестов исполняли только ease-ветку (motion.js в песочнице).
   Мидпоинт-пин ветки не различает (easeInOut(0.5) = 0.5 = t/0.5) —
   ассерт «рисуется + тишина» (формат CU182-NOMOTION).

Краснота осмысленная: падение — на assert контракта (c._fx.castFx
undefined / drawImage idle-__path вместо cast / отсутствие arc школы),
не на ReferenceError/ENOENT (цепочка без изменений, 0 новых скриптов).

## 4. Аудит регрессий (почему 2655 базелаин зелёный без правок)

* АУДИТ (grep): ни один существующий тест НЕ ассертит СОДЕРЖИМОЕ
  drawCalls/styleCalls ПОСЛЕ успешного каста — CU179-EFIR/CU178-*/
  CU227-*/000149/000166/000171 читают после каста лог/ману/пулы/кнопки/
  c._fx-поля. Новый слой гейтирован СВОИМ состоянием (нет castFx → 0
  вызовов) → в чужих сценах невидим.
* Точные count-пины стилей (L1748-1851 golden 000084, L2134 CU118-FX,
  L2778 000204, L6138-6300 CU197-*, L7204 CU199.01, L8621 CU213-A) —
  ВСЕ в сценах БЕЗ каста → castFx нет → 0 наших stroke'ов. Проверено
  по контексту каждого.
* z-порядок: пин 000050 «iObs > последний stroke сетки» — сцена без
  каста (наш слой после юнитов, в сцене молчит); пин 000174 — lastGrid
  считается в ОГРАНИЧЕННОМ цикле до firstHatch → к новым stroke'ам после
  юнитов нечувствителен.
* c._fx-пины: ключи action/until сохранены (additive castFx); отказы —
  ноль записей (ветки отказа не тронуты); семантика «cast после каста
  СОЮЗНИКА» (L4721) сохранена — меняется только РИСУНОК hero-ветви
  (никакой пин на hero-cast drawImage — grep пуст).
* Golden 000084 (детерминизм отрисовки + порядок слоёв клетки Эфира) —
  сцена без каста: ally-ветвь по умолчанию 'idle' бит-в-бит.
* SVG/index-order — 0 новых ассетов/скриптов → пины без правок.
* ЕСЛИ при прогоне что-то всё же упадёт — только ТЕХНИЧЕСКИЙ ре-пин с
  обоснованием в tasks/results (семантических правок существующих тестов
  нет — инвариант).

## 5. Что важно будущим задачам

* **Мерж-зона** — src/combat-ui.js (общий фронт): 000235 (исследование
  школ) и 000234 правят каст-регион combat-ui ПАРАЛЛЕЛЬНО (tasks/pending/
  000235.md L37) — ханки 000226 держать минимальными (8 вставок, §8);
  тест-блок — ОДИН append в EOF (шов один; 000210/000216-блоки — хвост).
* **Зеркала ядра** (визуально-LOW, при правке ядра перепроверять):
  autoResurrectId (spells.js L393-405 / ally-spells L246-259) и
  healFxTargetId (combat.js mostWounded L2538-2549) — UI-копии правил
  ЦЕЛЕЙ; расхождение = FX на неверной клетке, ядро не задето. Пины —
  CU226-MERC / CU226-RES. ЯВНОЕ РАСХОЖДЕНИЕ ГЕЙТОВ (зафиксировано
  ревью 000226): healFxTargetId пропускает союзников с maxHP = 0
  (`u.maxHP > 0`), ядро (livingAllies combat.js L616-618) maxHP НЕ
  проверяет — при maxHP = 0 ядро даёт frac NaN (сравнения с NaN
  ложны, NaN-юнит выигрывает в consider() только при пустом
  bestFrac — крайний случай), UI — просто пропускает. На достижимых
  состояниях (алли-юниты всегда maxHP > 0) поведение идентично;
  при будущей правке mostWounded/livingAllies гейты зеркал
  синхронизировать явным образом.
* **Правило «явная цель» (R5)**: toId = targetId, ПЕРЕДАННЫЙ ядру;
  пространственные автоцели (nearestMob/nearestEnemy/nearestMobFor) в UI
  НЕ дублируются (toId null → без маркера цели) — при будущих
  пространственных FX не нарушать (урок 000037).
* **Позы**: cast-кадры Эфира теперь ИСПОЛЬЗУЮТСЯ (были мёртвыми);
  наёмники намеренно БЕЗ cast-кадров (Q2) — если задача попросит кадры
  наёмников: 12 SVG + MERC_FRAMES.cast + re-pin svg.test.js
  'sprites/mercs' 12→24 (первое — tests/svg.test.js, правило 000120).
* **c._fx-контракт** (000047/000118/000227/000226): {action, until} —
  слот действия (300 мс), под-объекты {breath, castFx} — эффекты
  (600 мс); полная замена c._fx новым действием прерывает активный
  эффект (существующий паттерн, визуальный, LOW).
* Спек: spec/spells.md «Книга заклинаний» — буллет 000226 ДОБАВЛЕН
  (SPEC_FILE_LINES re-pin — технический).

## 6. Подводные камни

* Вставки в drawUnits — в ДВУХ ветвях (ally L1261 / hero L1349):
  ally-гейт ОБЯЗАТЕЛЬНО с `u.kind === 'efir'` (наёмник 'cast' → ORC-
  fallback = смена идентичности, пины 000084).
* runAction-вставка — ПОСЛЕ attack-ветки как `else if` (атака героя и
  каст — взаимоисключающие действия; `!activeUnit(c)` у attack НЕ
  переносить на каст-ветку — каст СОЮЗНИКА и должен записываться).
* resurrectCast: `tid = resurrectTargetId(c)` вынести в переменную ДО
  каста (значение ПЕРЕДАЁТСЯ ядру — та же переменная в castFx; не
  пересчитывать после — состояние могло измениться? Нет — каст синхрон,
  но одно вычисление = один источник).
* t-разделители: полёт/импакт — `t < 0.5` / `t >= 0.5`; при t=0 орб —
  ТОЧНО на кастере (k=0) — пинать середину (t=0.25, k=0.5), а не крайние
  значения ease.
* textAlign 'center' в drawCastFx — не восстанавливать (последний
  canvas-слой; следующие fillText каждый задают свой align — паттерн
  уровень L1279/L1333).
* Тестовые сцены с frozen now (NOW84=1000): castFx-окно «вечно открыто»
  (until=1600) — в наших тестах фазы через mutable T; в чужих (frozen)
  наши arc'и рисуются каждый render — НО ни одна чужая сцена не кастует
  (аудит §4) → не задеты.
* expectedRedCount = 5 — 000235/000234 параллельные задачи свои
  expectedRedCount считают на СВОЕЙ базе; наш блок в EOF — не пересекает
  их вставки (они — в середине).
* CHANGELOG — ОТДЕЛЬНЫЙ коммит (формат: секция ## 2026-10-16,
  подраздел ### Графика, буллет «для игроков», программное не
  перечислять).

## 7. План реализации (по файлам)

1. **src/combat-ui.js** (единственный src; ~+180 строк):
   * H1: константы (SPELL_FX_MS/CAST_FX_SCHOOLS/CAST_FX_FALLBACK/
     CAST_FX_TARGETED/CAST_FX_TEXT) — L112-158;
   * H2: хелперы castFxOf/autoResurrectId/healFxTargetId/rgba +
     drawCastFx — после drawBreathFx (~L1490);
   * H3: castRow запись (L2186-2189);
   * H4: resurrectCast (tid + запись, L2258-2264);
   * H5: runAction legacy-ветка (L899-906);
   * H6: ally-ветвь drawUnits (L1261);
   * H7: hero-ветвь drawUnits (L1349-1350);
   * H8: render() — `drawCastFx(c, now);` после drawBreathFx (L1669).
2. **tests/combat-ui.test.js** (~+500 строк): EOF-блок `// ===== Задача
   000226` — scene226 + 7 тестов (§3). Красная фаза: ровно 5 красных.
3. **spec/spells.md** (+3 строки): буллет «Книга заклинаний» (после
   буллета 000227).
4. **tests/spec-split.test.js** (1 строка): SPEC_FILE_LINES
   'spells.md' 104 → факт (технический re-pin).
5. **memory/000226-combat-cast-anim.md** — этот файл (красная стадия
   коммитит вместе с тестами).
6. **CHANGELOG.md** (+5 строк, ОТДЕЛЬНЫЙ коммит «Задача 000226:
   CHANGELOG — …»).
НЕ ТРОГАТЬ: index.html, tests/index-order.test.js, assets/,
tests/svg.test.js, src/combat.js, src/spells.js, src/ally-spells.js,
src/motion.js, src/sprites.js, .merge-pending (стадия мержа).

## 8. Зелёная фаза — итоги и ловушки (реализация)

* **Результат: 2662/2662 зелёные** (красных 5 → 0, регрессий 0).
* **Ловушка 1 — cross-realm deepStrictEqual.** tests/combat-ui.test.js
  импортирует `node:assert/strict` → `assert.deepEqual` =
  deepStrictEqual → проверка ПРОТОТИПА: объект из vm-рема
  (c._fx.castFx, прототип = Object.prototype vm-контекста) ≠ литерал
  outer-рема — «Values have same structure but are not reference-equal»
  (Node 18). Семантика (7 полей, значения) при этом верна. Фикс —
  ТОЛЬКО технический, в красном тесте CU226-CAST: JSON-раундтрип
  `JSON.parse(JSON.stringify(c._fx.castFx))` — устоявшийся паттерн
  файла (прецеденты L1137/L3605, vm-правило 000082: «не deepEqual/
  identity на объектах»). Ассерт-контракт (форма castFx) не изменён.
* **Ловушка 2 — стиль ДО arc.** Хелпер теста arcsAt226 берёт
  fillStyle/strokeStyle ОБРАТНЫМ обходом events ДО события arc (и это
  каноническая canvas-конвенция: задать стиль, потом рисовать).
  Первый вариант drawCastFx ставил `g2.fillStyle = …` ПОСЛЕ `arc` —
  CU226-EFIRBOOK ловил чужой (glow) стиль на core-орбе. Все пары
  стиль→arc в drawCastFx — в порядке fillStyle/strokeStyle → beginPath
  → arc → fill/stroke.
* **healFxTargetId — бит-в-бит зеркало mostWounded(c, 1)**
  (combat.js L2538-2549): игрок рассматривается БЕЗ alive-гейта
  (frac 0 мёртвого игрока — eligible, как в ядре; на практике
  лечебный каст при мёртвом игроке невозможен — бой окончен),
  союзники — `side 'ally' && alive && !fled && maxHP > 0` (fled —
  через livingAllies L616-618; u.maxHP — ПОЛЕ юнита, не G.derived —
  как в ядре), игрок ПЕРВЫМ, лучший — мин. frac СТРОГИМ <, тай =
  порядок пула. Вызывается ДО c.heal() (pre-state: heal мутирует hp,
  зеркало после каста дало бы другую цель).
* **motion — плоский экспорт** (Game.easeInOut, не Game.motion):
  `liveGame().easeInOut` с typeof-гардом (паттерн mobAnchor);
  mid-point-пин T+150 робастен: easeInOut(0.5) = t/0.5 = 0.5.
* **toId resurrect из книги** (castRow): act 'воскрешение' —
  `c.targetId || autoResurrectId(c)` (кнопка воскрешения —
  resurrectTargetId — то же правило в H4).
* **CHANGELOG-дата**: workflow — «дата = сегодня» → секция
  ## 2026-10-17 (прогноз 2026-10-16 из §6 — устарел, мерж 17.10).

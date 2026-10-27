# 000285 — 000271-шов (4): post-combat hudFlash-субъект + FP-7 guard + CHANGELOG-уточнение

База: HEAD **c803b16** (все координаты — по состоянию на c803b16,
конвенция 000287). Родитель: RETRO-20261027 (findings: 000278-retro
minor ×2, 000279-retro minor+info ×3; отчёты tasks/result/
000278-retro-20261027.md, 000279-retro-20261027.md). ТЗ:
tasks/pending/000285.md. Франчайзинг 000271: 000271 = базовый
потребитель (fear-механика + баннер-текст), 000278 = шов 1 (баннер
«Противники разбежались.» + поле `by`), 000279 = шов 2 (практик-XP
«Застращивание»), 000285 = шов 4 (hudFlash-субъект post-combat).

## 1. Что добавлено (карта файлов, ожидаемая дельта)

| Файл | Что | Дельта |
|------|-----|--------|
| src/main.js | :1910 (onEnd `startCombatAt`) и :2661 (onEnd `maybeStartCombat`) — else-ветка: тернарник по `res.by` (ТЗ дословно, ОБЕИХ местах) | 2 строки, 0 комментов, 0 c._rng |
| tests/fled-hudflash-000285.test.js | НОВЫЙ vm-e2e: самодостаточный полный boot-харнесс + HF-1…HF-4 | новый, ~350–400 строк |
| tests/fright-practice-000279.test.js | +FP-7 guard (append в конец, после FP-6 :201) + шапки :9/:21 «FP-1…FP-6»→«FP-1…FP-7» (технически) | +~28 строк |
| CHANGELOG.md | секция «## 2026-10-26», буллет 000271 (:28-31): «не даёт ни / опыта, ни лута.» → «не даёт ни / боевого опыта, ни лута.» (1 слово, перенос строки сохраняется) | 1 строка |
| memory/000279-fright-practice.md | §2.4: FLB-1-пометка + L-координаты re-grep + прецедент «практика при бой-финише»; §5: строка FP-7 в карте (cross-ref шапки теста) | ~+18 строк |
| tasks/ | pending/000285.md → done/000285.md + tasks/result/000285.md | перенос + отчёт |

НОВЫХ МОДУЛЕЙ/ЭКСПОРТОВ/`<script>`-тегов/CSS/SVG **НЕТ** →
index.html, tests/index-order.test.js, tests/svg.test.js, spec/ —
0 правок. НОВОГО c._rng НЕТ (тернарник — чистые строковые литералы).
Save-формат — 0 изменений (c.result транзиент, `by`-поле — 000278).

Счётчики: база 3393/3393/0 (замер на c803b16) → +5 тестов (HF-1..4
+ FP-7) = **3398**; RED: ровно 2 not ok (HF-1, HF-3); GREEN:
3398/3398/0.

Коммиты ветки task/000285 (squash в ОДИН при мерже, протокол
one-commit-per-task-squash): (1) RED — T1+T2+этот файл; (2) фикс —
main.js + memory/000279; (3) CHANGELOG — отдельный коммит «Задача
000285: CHANGELOG — …» (docs-only, в СУЩЕСТВУЮЩЕЙ датированной
секции, НОВОЙ записи нет — §2.5); (4) tasks pending→done + result.

## 2. Контракты и границы

### 2.1 Δ1 — hudFlash-субъект в ДВУХ else-ветках onEnd (main.js)

* Фикс (ТЗ дословно, ОБЕ else-ветки — :1910 и :2661):
  `hudFlash = res && res.by === 'mobs' ? 'Противники разбежались.' : 'Вы ушли от боя.';`
* Семантика: else-ветка = ЛЮБОЙ исход, не victory/не dead (в
  реальности — только 'fled' от обоих писателей 000271/000278).
  Субъект флэша определяется полем `by` (000278): mobs — группа
  врагов разбежалась, player — убежал герой.
* Дефолт = player-текст («Вы ушли от боя.») — то же решение, что
  000278 §2.2: legacy/ручные result БЕЗ `by` (B24/B25
  building-effects инъецируют `{outcome:'fled'}`) → старый текст,
  поведение этих тестов инвариантно. `res &&` — null-гард (в onEnd#1
  res может быть falsy — ветки выше гвардятся `res &&`).
* Текст «Противники разбежались.» — ДОСЛОВНО как баннер
  (combat-ui.js:2590) и лог checkVictory (combat.js:1429) — один
  субъект в трёх UI-слоях (баннер в бою / лог боя / флэш мира).
* Точка 1: `startCombatAt` (main.js:1834; onEnd :1894) — мир-бой и
  отладочный бой (`__game.actions.startCombat`, :1988/:4302).
* Точка 2: `maybeStartCombat` (main.js:2539; onEnd :2630) — шаг на
  тайл/зону группы. Здесь ветки БЕЗ `res &&` (:2639 прямое
  `res.outcome`) — тернарник всё равно с `res &&` (ТЗ — единое
  выражение; защитно, безвредно).
* **Третья точка боя — startDungeonCombat (:3190, onEnd ~:3230) —
  НЕ ТРОГАЕТСЯ**: её канал — ds.log, для 'fled' строку НЕ пишет
  (только телепорт), субъекта там нет. В src/ 'ушли от боя' — ровно
  2 вхождения; dungeon не «унифицировать» без ТЗ.
* Rebase-якоря: фраза `hudFlash = 'Вы ушли от боя.';` (ровно 2
  вхождения в src/); ДИЗАМБИГУАЦИЯ идентичных веток — по
  последующему коммент-блоку («…назад на тайл, где начался бой
  (1:1 с боем мира…» / «…назад на тайл, с которого зашёл в бой.») и
  предшествующей dead-ветке «Вы очнулись. −20% золота.» (обе).
  Ребазить по якорям, не по номерам строк.

### 2.2 Δ1 — что НЕ меняется (границы)

* Писатели `by`: checkVictory fled-ветка (combat.js:1428, 5 полей
  {outcome,by,xp:0,gold:0,defeated:0}) и playerFlee (:1624, 2 поля
  {outcome,by}) — бит-в-бит (пины FLB-1/FR-2).
* Баннер combat-ui.js:2590 — ДРУГАЯ строка («из» vs «от») и ДРУГОЙ
  слой — не трогать (пины combat-ui.test.js :9164/9298/9318/9481/
  10906, fled-banner-000278.test.js:289 — «Вы ушли ИЗ боя.»).
* Флэш-пайплайн (hudFlash→G.hud.update→hud.js:298/351), saveNow в
  onEnd, телепорт на prev, lootLines/compLines-аппенды — читать, не
  менять.
* 0 новых c._rng — все c._rng-голены (FR-2 «ровно 2», FP-счётчики)
  и бит-в-бит детерминизм не задеты.

### 2.3 FP-7 — guard «летальное попадание → нет практик fright»

* Механика (HEAD c803b16, live-проб): гейт страха
  `if (t.alive && t.level < p.level && d.fearChance > 0 && c._rng()
  < d.fearChance)` (combat.js:1499-1500) — `t.alive` ПЕРВЫМ —
  короткое замыкание → 0 fear-роллов на трупе; prFright-вызов
  :1505 ВНУТРИ блока; weapon-практика :1508-1509 ПОСЛЕ блока (удар
  был — начисляется всегда). Летальный удар: dealDamageToMob
  (:981) hp≤0 → alive=false → checkVictory (:991) → c.result =
  victory (все victory-роллы ВНУТРИ checkVictory ДО присвоения
  c.result :1389-1431) → гейт short-circuit'ится.
* **ОТКЛОНЕНИЕ ОТ ТЗ (зафиксировано в memory + tasks/result):**
  ТЗ-«calls === 1» (общий счётчик c._rng) **недостижимо**: летальное
  попадание проходит victory-ветку checkVictory — gold-ролл (1 на
  поверженного, :1389) + 7 лут-роллов rollVictoryLoot — ВСЕ до
  fear-гейта (stack-trace-проб: total = 9 = hit 1 + gold 1 + loot 7,
  живьём на c803b16). Пин реализован как **«0 c._rng ПОСЛЕ
  постановки c.result»**: `Object.defineProperty(c, 'result', …)`
  ловит индекс счётчика в момент set; ассерт
  `calls === resultSetAt`. Почему так: (а) семантика скобки ТЗ
  («гейт t.alive ДО fear-броска») — fear-ролл на мёртвой цели
  обязательно был бы ПОСЛЕ c.result (dealDamageToMob→checkVictory
  раньше гейта) → регрессия = late-ролл = RED; (б) общий голден 9
  лопался бы от любого изменения лут-стрима (контентные волны
  000230.x/000235.x) — ложная краснота на ребейзе; late-пин
  имунен (лут-роллы — ДО c.result). Зелёный и на пути паники
  (2 вызова, late 0 — проверено).
* Поведенческие ассерты (ТЗ дословно, основная ловушка):
  `p.skillXp.fright === undefined`, `!('frightPractice' in atk)`,
  `w.alive === false`, `c.result.outcome === 'victory'` + `ok(!w.fled)`
  (труп не маркируется fled) + `atk.killed === true` +
  `atk.practice` deepEqual `{ skill:'fists', xp:3, applied:3,
  level:0 }` — **прецедент «практика при бой-финише»**: бой
  кончился в ТОМ ЖЕ попадании, weapon-практика начислена (защита
  от «чинильщиков» порядка :1503-1509).
* SEMANTICS: GREEN-GUARD с RED-стадии (как FP-4/5/6): зелёный сразу,
  красный ТОЛЬКО при мутации — (i) `t.alive` убран из гейта /
  reorder `c._rng()` первым → late-ролл → late-ассерт + skillXp +
  ключ + w.fled RED; (ii) P.skillPractice вынесен за гейт
  (неусловно) → skillXp.fright=3 + ключ RED (роллов нет — late-
  ассерт зелёный, поведение ловит). expectedRedCount файла
  fright-practice НЕ меняется (3 = FP-1/FP-2(а)/FP-3).
* Фикстура: reuse panicFixture(15) (fearHero L5 int11→инит 12>3,
  str10→dmg 13, wolf L1 seed 13) + `w.hp = 1` (дословно ТЗ; 13
  летален) + c._rng ≡ 0.01.

### 2.4 vm-e2e (tests/fled-hudflash-000285.test.js) — 4 пина, expectedRedCount = 2

* **Трактовка ТЗ «vm-e2e по паттерну 000278-FLB» (зафиксировано):**
  FLB-цепочка КОНСТРУКТИВНО НЕ грузит main.js (коммент
  fled-banner-000278.test.js:18-20: «main.js НЕ нужен — пин баннер,
  не onEnd/мир»), а Δ1 живёт в onEnd main.js; main.js — IIFE
  full-boot (карта, DOM, WebGL, спавн, rAF) → грузится ТОЛЬКО
  полной цепочкой `<script>` из index.html. «Паттерн FLB» =
  дисциплина: самодостаточный vm-e2e, red/green-счёт, realm-
  безопасные ассерты. Харнесс — урезанная самодостаточная копия
  протокола mob-zones-e2e (makeGl/makeContext2d/makeEl/makeStorage/
  bootSandbox/drain/boot/frameAt/key/keyup/makeWalker; CHAIN —
  авто-pickup из index.html, не хардкод) + mainFrameAt из
  movement-freeze-e2e (`h.raf[0](now)` — главный кадр).
* **Мир (детерминирован, фолбэк generateSeedPixels):** спавн (0,0);
  (1,0) — g2 логово скелетов (neutral, 3×3, бой ТОЛЬКО на тайле —
  прецедент Z3b: walk(0,0)→(1,0), c.groupType === 2).
* **Схема (паттерн movement-freeze T4 + Z3b):** boot →
  (A: `c = g.actions.startCombat(6)` — отладочный бой на тайле;
  B: `walk(1,0)` → maybeStartCombat, `c = G.combatUI.current()`) →
  `c.phase = 'over'; c.result = <ручной shape>` →
  `G.combatUI.handleCode('Space')` (→ finish() :3381: guard
  `ctx.open && ctx.combat.result && !ended` → onEnd СИНХРОННО) →
  `mainFrameAt(h, NOW + 600)` (мир-кадр; performance.now заморожен
  NOW=1000, hudFlashUntil = 6000 → окно открыто) →
  `String(h.hud.textContent)` (String-примитив, realm-безопасен).
* **Ручной result вместо реальной паники (зафиксировано):** юнит
  Δ1 = маппинг `res.by` → текст в onEnd; писатель `by` уже запитан
  FLB-1/FLB-2 (vm) и FR-2 (node) — реальным мультимоб-сценарием не
  дублировать. Реальный all-fled хрупок: ВСЕ группы 3–6 мобов,
  каждому нужен live-override m.level=1 (в боях main.js
  mobLevel = p.level±delta, combat.js:3561/3568 — гейт `t.level <
  p.level` по умолчанию ЗАКРЫТ) + детерминизация fear-роллов/ходов
  нескольких мобов = flake-риск без прироста покрытия. Прецеденты
  инъекции host-литерала в vm-объект: T4 (victory), B24/B25
  (fled). onEnd из result читает только строки/числа →
  JSON-рондтрип НЕ нужен (улучшение к FLB-требованию).
* Матрица (2 onEnd-ветки × 2 субъекта):
  * **HF-1** (RED, корень main.js:1910): startCombat(6) +
    `{outcome:'fled', by:'mobs', xp:0, gold:0, defeated:0}` (5 полей
    = shape checkVictory) → HUD `includes('Противники разбежались.')`
    && `!includes('Вы ушли от боя.')`.
  * HF-2 (GREEN-guard, :1910 дефолт): startCombat(6) +
    `{outcome:'fled', by:'player'}` (2 поля = shape playerFlee) →
    HUD «Вы ушли от боя.» && без mobs-текста — защита от
    over-fix «всегда mobs-текст»/«инверсия ветки».
  * **HF-3** (RED, корень main.js:2661): walk(1,0) + c.groupType===2
    + 5-поле mobs → тот же ассерт.
  * HF-4 (GREEN-guard, :2661 дефолт): walk(1,0) + 2-поле player →
    «Вы ушли от боя.».
  4 пина (а не 3) — симметричная 2×2-покрытость ДВОЙНЫХ onEnd:
  анти-«починили одно, забыли второе» (§4.1).
* Ручной result БЕЗ efirXp — ок: efir-ветка finish — victory-only
  (`ctx.efir && result.outcome === 'victory' && result.efirXp > 0`,
  :3398); manual-legacy без поля — тихий skip (коммент finish).
* combatEndLoot — victory-only guard (`res && res.outcome ===
  'victory'`, :631) → [] на fled; combatEndCompanions — fresh boot:
  `!hasCompanions` → [] (:544). Флэш однострочен, но ассерт —
  `.includes` (форма устойчива к lootLines/compLines-аппендам).

### 2.5 CHANGELOG + memory/000279 (docs-only)

* CHANGELOG: ТОЛЬКО уточнение буллета 000271 в СУЩЕСТВУЮЩЕЙ секции
  2026-10-26 («опыта» → «боевого опыта»). НОВОЙ датированной записи
  за Δ1 НЕТ: Δ1 = багфикс UI-текста (игрок видел чужой субъект),
  прецедент 000278 («CHANGELOG — НЕТ (багфикс/UI-микродрейф, явное
  ТЗ, прецедент 000274)» + ТЗ скоупит CHANGELOG-дельту как
  docs-only fix; инвариант «не больше и не меньше, чем просит ТЗ»).
  Соседний буллет 000279 («даёт опыт навыка») — НЕ ТРОГАТЬ
  (теперь непротиворечив: боевой опыт vs опыт навыка).
* memory/000279-fright-practice.md §2.4 (ТЗ п.4, re-grep на
  c803b16): (а) «sheet.practice (sheet.js:364-420)» → **:364-425**;
  (б) «reprocessCraftXp craft.js:332» → **:330**; (в) «единственный
  rng в craft.js — rollCraft :663» → функция rollCraft УДАЛЕНА
  (фантом), ро́ллы в `craft(c, recipeId, opts)` (:658; `const rng`
  :663, qRoll/yRoll :665-666); (г) «Гейт страха (&&, :1498-1499)» →
  **:1499-1500**; (д) устаревшая фраза «боевой фикстуры с fright вне
  tests/fright-000271.test.js НЕТ (items.test.js:8211/8263,
  ui.test.js:2162+ T8)» → после 000278 fear-ветку исполняет и
  **tests/fled-banner-000278.test.js FLB-1** (vm-e2e полная
  цепочка combat-ui: удар → паника → checkVictory → баннер; прогоняет
  и P.skillPractice 000279 в том же попадании) — второй независимый
  исполнитель вне node-сьюта; координаты items.test.js:
  **8308/8360**, ui.test.js T8 — заголовок **:2166** (c.secondary.
  fright=10 на :2181, ассерт fearChance 0.675 :2258-2259).
* Прецедент-НОРМА в §2.4 (ТЗ п.4, ретро-инфо 000279): «практика
  начисляется даже при бой-финише в том же попадании» — вызовы
  практик ПОСЛЕ возможного checkVictory (fright :1503-1505 внутри
  fear-ветки; weapon :1507-1509 после блока): удар, завершивший бой
  (kill → victory внутри dealDamageToMob; паника → fled в ветке) —
  практики ВСЁ РАВНО начислены (удар был). weapon-практик — тот же
  паттерн (прецедент ДО 000279) — НОРМА, не баг. Будущим задачам НЕ
  «чинить» порядок в combat.js:1503-1509 в сторону «практика до
  checkVictory». Пины: FP-1/FP-2 (паника — бой окончен, ОБЕ записи)
  + FP-7 (kill — weapon на месте, fright-нет).
* Границы правки memory/000279 (решение Q4): ТОЛЬКО §2.4 (ТЗ) +
  строка FP-7 в §5-карте (cross-ref обновлённой шапки теста —
  иначе «FP-1…FP-7» вешается на карту, кончающуюся FP-6).
  ОСТАЛЬНЫЕ устаревшие координаты файла (§1 :1494-1510→:1494-1514,
  §2.1 early-return :1482-1483→:1481-1482, §4 :1494-1497→:1495-1498)
  НЕ ПРАВИМСЯ (строго по ТЗ) — зафиксированы в tasks/result/000285.
  md как наблюдения.

## 3. Ленивые ссылки и guards

* НОВЫХ ленивых ссылок НЕТ (правки внутри существующих замыканий
  main.js; UMD-новых модулей нет). onEnd уже читает G.* лениво
  (G.playerUI, G.notifyGroupDefeated, G.hud, G.addItem — существующее).
* Guards, на которые опираются пины:
  * `res && res.by === 'mobs'` — null-safe для legacy/ручных result
    без `by` (дефолт = player-текст).
  * finish() :3381 — `ctx.open && ctx.combat.result && !ended`:
    инъекция c.result ДО handleCode обязательна.
  * finish() efir-ветка — victory-only; `result.efirXp > 0` —
    manual-fled без поля — skip.
  * combatEndLoot :631 / combatEndCompanions :544 — early-return
    на non-victory / no-companions → ручной fled-shape не роняет
    onEnd.
  * handleCode: `c.result` truthy → Space/Enter/Escape = finish()
    (ветка ДО COMBAT_KEYS-таблицы; Space=«конец хода» конфликта нет).
* Кросс-realm (конвенция 000276/FLB): ассерты — примитивы
  (String(h.hud.textContent), boolean, число c.groupType);
  инъектируемый c.result — host-литерал (onEnd читает строки/числа)
  → JSON-рондтрип НЕ нужен.

## 4. Что важно будущим задачам

* 4.1 **ДВОЙНЫЕ onEnd** (startCombatAt :1894 / maybeStartCombat
  :2630) — текст else-ветки ДУБЛИРУЕТСЯ (сейчас и тернарник
  идентичен): ЛЮБОЕ изменение else-ветки требует пинов ОБОИХ мест
  (HF-1…HF-4; анти-«починили одно, забыли второе»). dungeon-путь
  (startDungeonCombat :3190) — третий onEnd, НО канал ds.log,
  fled-строки нет — не «унифицировать» без ТЗ.
* 4.2 ТРИ слоя субъекта fled: баннер в бою (combat-ui.js:2590,
  «из»/«от»-различие — ИСТОРИЧЕСКОЕ, не «чинить»), лог боя
  (combat.js:1429), флэш мира (main.js:1910/2661 — с 000285
  согласованы). Текст «Противники разбежались.» — один канон.
* 4.3 Прецедент «практика при бой-финише» — memory/000279 §2.4
  (cross-ref; weapon + fright — один паттерн; пин FP-7).
* 4.4 FLB-1 = второй независимый исполнитель fear-ветки (vm-e2e) —
  изменения :1494-1514 combat.js проверять И node-пины (FP/FR), И
  fled-banner-000278.
* 4.5 Rebase-якоря Δ1 — §2.1 (фраза, ровно 2 вхождения;
  коммент-блоки onEnd). CHANGELOG-верх — известная конфликт-зона
  (волны 000235.x); наша правка — в секции 2026-10-26 (не верх) →
  ребаза по якорю-фразе «не даёт ни боевого опыта, ни лута».
* 4.6 FP-7: НЕ голденить ОБЩИЙ счётчик c._rng летального удара
  (lут-стрим — территория контентных волн); только «0 после
  c.result» + поведение (§2.3).
* 4.7 Шов-серия 000271 после 000285: баннер (000278), практика
  (000279), hudFlash-субъект (000285) закрыты; оставшийся ретро-
  хвост 000279 — устаревшие координаты вне §2.4 (наблюдение в
  tasks/result/000285.md).

## 5. Подводные камни

* **calls === 1 недостижимо** (§2.3): total = 9 (hit + gold 1 +
  loot 7 — все ДО fear-гейта). Ловушка для будущих «уточнителей»
  FP-7: менять ассерт на общий счётчик нельзя (ложная краснота на
  ребейзе от лут-волн).
* **Флэш-окно**: performance.now заморожен (NOW=1000) — ок, НО кадр
  mainFrameAt ОБЯЗАТЕЛЕН ПОСЛЕ finish (renderHud — в кадре);
  пропуск → пустой hud → ложная краснота. hudFlashUntil = 6000.
* **mainFrameAt = raf[0]** (главный кадр, self-rescheduling), НЕ
  raf[last] (могут лежать тики боевого оверлея) — D-протокол
  000173, прецедент movement-freeze T4.
* **c.phase = 'over'** в фикстуре — для фидельности реальному
  состоянию (checkVictory/playerFlee ставят ДО finish); finish()
  phase не читает, но не отклоняться от T4-формы.
* **−0-спавн** (конвенция mob-zones): сравнения координат —
  `=== 0`, не strictEqual(-0-подвоха) — только если появятся
  числовые ассерты по тайлам.
* **Один полный npm test за worktree** (000054 мутирует
  src/npc-data.js); known-флейк tileAt (tests/map.test.js) —
  solo-перепуск упавшего файла + запись в отчёт.
* **В боях main.js mobLevel = p.level(±delta)** (combat.js:
  3561/3568) — если в будущем появится REАЛЬНЫЙ e2e all-fled:
  без live-override m.level=1 гейт `t.level < p.level` закрыт →
  тихий провал на assert w.fled (ложный сигнал «регрессия
  000271»).
* **Группы многомобные** (3–6 мобов, solo-групп нет): реальная
  pаника ОДНОГО мобов ≠ конец боя (checkVictory требует
  livingMobs ПУСТО + killed.length === 0; убийство чужих мобов →
  'victory', не 'fled').
* c.result транзиент — в сейвы не идёт (src/save.js grep 0).
* Флэш мультистрочный в общем случае (lootLines/compLines-аппенды
  :1921-1930/:2671-2680) — e2e-ассерт .includes, не точное
  равенство (наш fresh-boot-флэш однострочен, но форма — общая).

# Задача 000162 — «Воскрешение в храме»: архитектура и контракты (дизайн)

Станция: ПРОЕКТИРОВАНИЕ (workflow 000162). Входы: ТЗ tasks/pending/000162.md,
/tmp/thegame-wf-000162/a1-domain.md, a2-arch.md, a3-tests.md.
Все вопросы a2 (Q-1..Q-5) и ТЗ «решить в анализе/памяти» — решены (§9, R-1..R-7).

## 1. Статус / базис

- Базис: master **0c47f71** = «Мердж: task/000161» (worktree
  .worktrees/task-000162, ветка task/000162, чистое дерево).
- Фундамент 000161 (done, merged):
  - live `deadMercs` — live-массив записей сейва ровно 4 поля
    `{npcId, sheet, loyalty, hiredDay}`; level/xp ВНУТРИ sheet
    (`record.sheet.level/xp/totalXp`);
  - `companions.reviveEntryFromRecord(npcs, raw)` (src/companions.js
    L906-940, экспорт) → runtime-запись 6 ключей
    `{npcId, sheet, level, xp, loyalty, hiredDay}` (зеркала = sheet.level/xp)
    | null (подделка/призрак → null; строка-legacy → backfill
    createMercSheet/loyalty 50/hiredDay 0); тихо (0 console);
  - сейв: `collectSaveData()` (src/main.js L604) — top-level поля
    `hero`, `companions` (serializeRoster → те же 4-полевые записи),
    `dead_mercs`, `buildingOncePerDay` ('x,y:effectId' → день, 000072),
    `buffs`…; оболочка `{version:1, data:{…}, savedAt}` (G.save, src/save.js).
- `__game` (src/main.js L2556+): `state.hero.gold`, `state.roster` (LIVE),
  `state.deadMercs` (LIVE) — точки e2e.
- SPEC.md уже описывает воскрешение (L787-809 «Спутники → Воскрешение»,
  L519) — 000156; менять SPEC не нужно.
- schema.json: `особые_параметры` — свободный объект → новые ключи
  проходят без правки схемы.
- НЕ ТРОГАТЬ (параллельные задачи/бриф): ui.js, combat.js, efir.js,
  assets/spells, building-ui.js, building-actions.js, controls.js,
  companions.js (используем reviveEntryFromRecord — только ЧИТАЕМ),
  SPEC.md, schema.json, другие спец-модули.

## 2. Контракт: каталоги храмов 36/37/38

assets/buildings/000036.json / 000037.json / 000038.json
(новые ключи ДОБАВЛЯЮТСЯ В КОНЕЦ объекта особые_параметры — порядок
сохраняется в регенерируемом зеркале src/buildings.js):

| каталог | эффекты | раз_в_день | воскрешение |
|---|---|---|---|
| 36 (Солнце) | `["36", "resurrect"]` | `true` → `{"36": true}` | `{"база": 20, "за_опыт": 0.05}` |
| 37 (Луна) | `["37", "resurrect"]` | (флага НЕТ — не трогать) | `{"база": 20, "за_опыт": 0.05}` |
| 38 (Гора) | `["38", "resurrect"]` | `true` → `{"38": true}` | `{"база": 20, "за_опыт": 0.05}` |

Семантика (000092, hasDailyLimit L608-621 — сверено по коду):
- boolean `true` — лимит на ВСЕ эффекты; объект `{id: bool}` — лимит
  ТОЛЬКО на перечисленные `=== true` ключи, фолбэка на реестр НЕТ;
  ключа `"resurrect"` НЕТ = лимита НЕТ (fail-open). Явный
  `"resurrect": false` НЕ нужен (ТЗ).
- Благословения 36/38 сохраняют лимит (ключ `"36"`/`"38": true`);
  «Воскрешение» — без лимита (услуга платная — ограничитель цена, R-4).
- 36: оба id — ключи EFFECTS (фильтр effectIds L573-585:
  `hasOwnProperty(EFFECTS, id)`), порядок = порядок в массиве:
  строки buildingUI: «Благословение» (36) → «Воскрешение».
- 39 (заброшенный) и 21 («Храм исцеления» — школа_навыков) — НЕ трогать.

Дисциплина синка: JSON + регенерация src/buildings.js
(`node scripts/sync-buildings-data.js`, маркеры BEGIN/END GENERATED,
идемпотентно, порядок ключей = порядок JSON) — В ОДНОМ коммите;
`npm run sync:check` — чисто.

## 3. Контракт: EFFECTS['resurrect'] (src/building-effects.js)

Точка вставки: ПОСЛЕ блока EFFECTS['38'] (текущий L337-379), ДО
комментария группы 000074 (L381). Комментарий «000162».

```js
EFFECTS['resurrect'] = {
  имя: 'Воскрешение',
  available: resurrectAvailable,
  apply: applyResurrect,
};
```
Ключа `разВДень` в записи реестра НЕТ (совместно с каталогом →
always available, R-4).

Чистое ядро — рядом с performGold (L1806) / applyTavernPerform (L1837) /
performAvailable (L1885), паттерн «guard → return reason / true»:

1. `resurrectPrice(totalXp, params)` → целое ≥ 0:
   `Math.round(params.база + params.за_опыт * totalXp)`.
   Стражи (fail-open, 0 console): totalXp не finite или < 0 → 0;
   params не объект или поля не finite → 0 (цена 0, услуга не падает).
   **Золотые пины**: (0, {база:20, за_опыт:0.05}) → 20;
   (1, …) → 20 (20.05 round 20); (10, …) → 21 (20.5 → 21, round half
   away от нуля — зафиксировано); (100, …) → 25.
2. `resurrectList(st)` → массив из СНИМКА `st.save.dead_mercs`
   (НИКАКИХ мутаций, 0 console, 0 RNG):
   `[{record, цена}]`, `totalXp = (record && typeof record === 'object'
   && record.sheet && typeof record.sheet.totalXp === 'number'
   && Number.isFinite(record.sheet.totalXp)) ? record.sheet.totalXp : 0`
   (legacy-строка / мусор → 0). Порядок = порядок массива.
3. `resurrectAvailable(st)` →
   `resurrectList(st).length ? true : 'нет погибших'`.
   ЗОЛОТО здесь НЕ проверяется (R-2) — строка не гаснет от нехватки
   золота; золото ловят apply (мин. цена) и confirm (цена выбранного).
4. `applyResurrect(st)` — ЧИСТО:
   - список пуст → `{ok:false, message:'нет погибших'}`;
   - `gold = st.hero && st.hero.gold`; finite && `gold < min(цена по
     списку)` → `{ok:false, message:'мало золота'}`;
   - иначе → `{ok:true, candidates: список}` — **УСПЕХА БЕЗ message**
     (flash приходит из confirm-а пикера, R-1).

Экспорт (L2602+, блок 000137 — добавить, коллизий имён нет):
`applyResurrect, resurrectAvailable, resurrectList, resurrectPrice`.
Хедер-документация (L1-158) — строка про 000162.

Следствия (без правки кода): effectIds (L573) сам подхватит
`"resurrect"` → строка «Воскрешение» появится в buildingUI-оверлее
автоматически (как 44_rest); buildingActions (L2074+) строит строки в
порядке каталога, available — ПЕРЕД проверкой daily-лимита;
hasDailyLimit(b,'resurrect') = false → строка не гаснет лимитом.

## 4. Контракт: спец-модуль src/building-effect-resurrect.js (НОВЫЙ)

~250-300 строк. Паттерн camp/49/45 (интерактивный спец; 44_perform —
неинтерактивный). UMD:

```js
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(null);          // node: чистые функции,
                                             // НЕТ саморегистрации
  } else {
    const G0 = root.Game;
    const mod = factory();
    mod.register(G0);
    root.Game = Object.assign({}, G0, {
      buildingEffectResurrect: mod,
      resurrectUI: { open: mod.open, close: mod.close, isActive: mod.isActive },
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : self, factory);
```

- **Переназначение root.Game ДОПУСТИМО** — прецедент:
  building-effect-camp.js L55, building-effect-49.js L51,
  building-effect-45.js L52 (`Object.assign({}, G0, {…})`). 44_perform
  не делает этого только потому, что новых свойств не выставляет.
  main.js L13 `const G = globalThis.Game` выполняется ПОСЛЕ нашего тега
  → `G.resurrectUI` видим (ловушка 000038 не срабатывает — тег до
  main.js, §5).
- `register(G)`: `if (!G || !G.buildingActions || typeof
  G.buildingActions.registerSpecial !== 'function')` →
  `console.error('building-effect-resurrect.js: Game.buildingActions
  отсутствует — src/building-actions.js обязан грузиться ДО этого
  модуля («Воскрешение» храма не работает)')` + return (без
  регистрации, игра не падает); иначе
  `G.buildingActions.registerSpecial('resurrect', resurrectPick)`.
  (registerSpecial L63-78: id по /^[^:,\\s]+$/ — 'resurrect' проходит.)

### resurrectPick(ctx) — синхронный обработчик роутера

ctx от роутера (building-actions.js L305-331):
`{hero — LIVE, save — СНИМОК, r (результат entry.apply — у нас
{ok:true, candidates}), world — deps-бандл main.js (roster/deadMercs —
LIVE ссылки, npcs, hero, game:G, saveNow, flash, playerRender, …)}`.

1. `candidates = (ctx && ctx.r && Array.isArray(ctx.r.candidates))
   ? ctx.r.candidates : []`; пусто →
   `{ok:false, message:'нет погибших'}` (двойная страховка — apply
   уже отфильтровал).
2. `roster = ctx.world && ctx.world.roster`;
   `Array.isArray(roster) && roster.length >= maxCompanions(ctx.world)`
   → `{ok:false, message:'отряд полон'}` — роутер flash'ит message и
   выходит БЕЗ mark/saveNow/render (L331-336) — отказ виден, лимит не
   сгорает.
3. DOM-стража: `typeof window === 'undefined' || !window.document` →
   `{ok:false, message:'недоступно'}` (в браузере недостижимо).
4. `openPicker(ctx, candidates)` → return **`{ok:false}` БЕЗ message**
   — отложенный результат (R-1): роутер — молчаливый no-op (нет
   flash/mark/saveNow/render — зафиксировано BA4(d),
   tests/building-actions.test.js: `assert.deepEqual(e.log, [])`);
   пикер перехватывает ввод (гейты §7).

`maxCompanions(w)`: ленивое чтение —
`gs = w && w.game && w.game.GlobalSettings; raw = gs && gs.SETTINGS
&& gs.SETTINGS.max_companions; return (Number.isInteger(raw) &&
raw >= 1) ? raw : 3;` (зеркало src/companions.js deserializeRoster
L812-813; GlobalSettings — `root.Game.GlobalSettings`,
src/global-settings.js L61).

### Пикер (самодостаточный DOM-оверлей; НЕ buildingUI, НЕ controls)

- DOM: `div.resurrect-overlay` (СОБСТВЕННЫЙ класс, НЕ .combat-overlay —
  R-12: чужие findOverlay/обработчики ищут .combat-overlay) внутри:
  `div.cp-title` «Воскрешение» (СУЩЕСТВУЮЩИЙ класс — не трогаем чужое
  CSS) + по кандидату `div.resurrect-row` + `div.resurrect-hint`
  «↑↓ — выбор · Enter — подтвердить · Esc — отмена».
- Строка: курсор-префикс `'▸ '` (text-маркер, паттерн building-ui) +
  `имя · ур. N · M оп.` + `span.resurrect-price` `−K зол.`.
  Имя: `world.npcs.find((n) => n && n.id === record.npcId)?.имя ??
  String(record.npcId)` (npcs = live NPCS — чистый lookup, без
  Game.npcById). `N = record.sheet && record.sheet.level ? … : 1`;
  `M = record.sheet && record.sheet.xp ? … : 0`; `K = кандидата.цена`.
- Cursor: индекс в замыкании; ArrowUp/ArrowDown — с wrap-around;
  Enter/NumpadEnter → confirm; Escape → тихое close (без flash, без
  save).
- keydown на window: добавляется при open, УБИРАЕТСЯ при close
  (собственный обработчик модуля). main.js-гейт (§7) делает главный
  обработчик no-op на время пикера; оба window-слушателя срабатывают
  в порядке регистрации, `return` в одном не блокирует другой —
  stopPropagation НЕ нужен.
- **Отказ в confirm'е — пикер ОСТАЁТСЯ ОТКРЫТЫМ** (Q-2): flash
  «мало золота» / «отряд полон», пользователь выбирает дешевле или
  Esc. `isActive()` → boolean. `close()` — remove listener + DOM,
  0 console.

### confirmResurrect(ctx, record, price) — мутационное ядро (без DOM)

Порядок — КРИТИЧЕН (регидратация ПЕРЕД мутациями — при null
нулевые мутации):

1. `dead = ctx.world.deadMercs` (live); `i = dead.indexOf(record)`;
   `i < 0` → `i = dead.findIndex((r) => r && r.npcId === record.npcId)`;
   `i < 0` → `{ok:false, message:'недоступно'}` (запись исчезла —
   страховка).
2. Золото: `g = ctx.world.hero && ctx.world.hero.gold`;
   `Number.isFinite(g) && g < price` → `ctx.world.flash('мало золота')`;
   return `{ok:false}` (без saveNow, без мутаций).
3. Cap повторно: `roster.length >= maxCompanions` →
   `ctx.world.flash('отряд полон')`; `{ok:false}`.
4. `entry = ctx.world.game.companions.reviveEntryFromRecord(
   ctx.world.npcs, record)`; null → `{ok:false, message:'недоступно'}`
   (ноль мутаций).
5. Мутации (инвариант 000085: **splice/push, ПЕРЕЗАПИСЫВАТЬ const-
   ссылки НЕЛЬЗЯ**): `ctx.world.hero.gold -= price;
   dead.splice(i, 1); roster.push(entry);`.
6. Завершение (роутер уже no-op'нул — модуль завершает САМ, единственное
   место saveNow/flash на успех; НЕ дублировать, если позже кто-то
   «починит» роутер — см. §11): `ctx.world.saveNow();
   ctx.world.flash(имя + ' снова в отряде.');
   ctx.world.playerRender();` + close пикера; `{ok:true}`.

- Flash-строка ПОВЛАСТНО-НЕЙТРАЛЬНА (Q-4): наёмники смешанного пола
  (Берта f, Вольк m, Ашка f, Бальдор m, Мира f, Торга f, Рена f —
  5 из 7 женские) → «<имя> снова в отряде.» (никакого
  «вернулся/возвращён»).
- Фиксированные строки: `'нет погибших'` / `'мало золота'` /
  `'отряд полон'` / `'недоступно'` / `<имя> снова в отряде.`.
- Детерминизм: 0 Math.random, 0 Date; цена — только Math.round.

## 5. Контракт: index.html (тег + пин IO1)

- Тег: `<script src="src/building-effect-resurrect.js"></script>` +
  1 строка комментария, ПОСЛЕ тега `src/building-effect-runes.js`
  (L916), ДО `src/hud.js` (L922) и ДО `src/main.js` (L950).
  Строже: ПОСЛЕ `src/building-actions.js` (L869) и
  `src/building-effects.js` (L806) — оба выполняются раньше.
- **Пин tests/index-order.test.js** (стиль IO1, шаблон L1129-1197;
  список модулей L34-79 — добавить `'src/building-effect-resurrect.js'`
  ПОСЛЕ `'src/building-effect-runes.js'`):
  (a) тег существует; порядок: building-actions.js <
  building-effect-resurrect.js < hud.js < main.js (и после runes);
  (b1) standalone-песочница {console} → doesNotThrow, 0 ошибок;
  (b2) {Game:{}, console} → ≥1 console.error, текст включает
  'Game.buildingActions отсутствует', регистрации нет, краха нет;
  (b3) песочница с кодом building-actions.js + модуля → 0 ошибок,
  `specials['resurrect']` — function. Паттерн mkConsole(sink).

## 6. Контракт: хвост CSS (index.html)

ПОСЛЕ `.cp-portrait-active { border-color: #d8c27a; }` (L759), ПЕРЕД
`</style>` (L760). ТОЛЬКО 4 класса из ТЗ, чужие не трогать:

```css
/* 000162 — «Воскрешение» храма: пикер погибших (самодостаточный оверлей) */
.resurrect-overlay { position: fixed; inset: 0; z-index: 20;
  display: flex; flex-direction: column; gap: 4px; padding: 24px;
  box-sizing: border-box; background: rgba(16, 18, 24, 0.95);
  color: #e8dcc0; font: 14px/1.4 "Courier New", monospace; }
.resurrect-row { display: flex; align-items: baseline; gap: 8px;
  padding: 4px 8px; border: 1px solid #3a3f4a;
  background: rgba(255, 255, 255, 0.03); }
.resurrect-price { margin-left: auto; color: #d8c27a; }
.resurrect-hint { margin-top: 8px; color: #9a9484; }
```

z-index 20 = та же ступень, что .combat-overlay (L239); оверлеи
взаимоисключающи (гейты §7). Заголовок — существующий `div.cp-title`
(без правки чужого CSS); курсор — text-префикс `'▸ '` (без доп.
класса).

## 7. Контракт: гейты ввода в main.js (R-3)

main.js НЕ в списке «не трогать». 000128-принцип «спец-модули не
правят main.js» про НЕинтерактивные эффекты; для ПЕРВОГО интерактивного
спеца берётся УСТАНОВЛЕННЫЙ паттерн гейтов оверлеев (combatUI/
dungeonUI/npcUI/buildingUI/craftUI). 3 минимальные точки:

1. keydown (L1565, ПЕРВОЙ строкой — ДО `KeyI`):
   ```js
   if (G.resurrectUI && G.resurrectUI.isActive()) return; // 000162
   ```
   Блокирует KeyI/KeyC/KeyE/движение на время пикера; R-6: `[E]` под
   открытым пикером → гейт → buildingUI НЕ открывается (нет двойного
   оверлея).
2. frame (L2473+): рядом с inCombat/inDungeon/inNpc/inBuilding/inCraft:
   `const inResurrect = !!(G.resurrectUI && G.resurrectUI.isActive());`
   и в условие tryMove добавить `&& !inResurrect`
   (текущее: `if (!inCombat && !inDungeon && !inNpc && !inBuilding &&
   !inCraft && now - lastMove >= stepMs)`).
3. touchControlsVisibility (L~2500):
   `building: !!inBuilding || !!inResurrect` — R-5: controls.js
   ЧИТАЕТ только {combat, inventory, building}; новое поле
   проигнорировано → мапим в существующее, controls.js не трогаем.

Альтернатива (capture/stopImmediatePropagation на стороне пикера) —
отклонена: невидимая и хрупкая (порядок регистрации слушателей).

## 8. Красные тесты (14) + зелёные пере-пины

### Красные (RED: падают по СМЫСЛУ на чистом 0c47f71; остальной
свита — зелёный; протокол: ровно 14 fail)

**src/building-effects.test.js** (node, существующий harness):
- **RES-A1** — каталог: `B.getBuilding(36/37/38)`: эффекты-массивы
  `["36","resurrect"] / ["37","resurrect"] / ["38","resurrect"]`;
  раз_в_день `{'36':true}` / (37 — флага нет) / `{'38':true}`;
  `воскрешение deepEqual {база:20, за_опыт:0.05}` у всех трёх;
  `effectIds` — `['36','resurrect'] / ['37','resurrect'] /
  ['38','resurrect']` (порядок!).
- **RES-A2** — hasDailyLimit per-эффект: 36: `'36'`→true,
  `'resurrect'`→false; 38: `'38'`→true, `'resurrect'`→false;
  37: `'37'`→false, `'resurrect'`→false.
- **RES-A3** — запись реестра: `EFFECTS['resurrect']` — имя
  'Воскрешение', apply/available — function, `разВДень` — нет.
- **RES-A4** — ЧИСТОЕ apply: st с двумя записями dead_mercs (sheet
  totalXp 100 и 0), hero.gold 500 → `{ok:true, candidates:[
  {record, цена:25}, {record, цена:20}]}` (100→25: 20+5; 0→20);
  `st.save.dead_mercs` не мутирован (length 2, те же ссылки),
  `st.hero.gold` не тронут; два вызова — deepEqual (детерминизм).
- **RES-A5** — available: без погибших → `'нет погибших'`; с погибшими
  → true, ДАЖЕ при hero.gold 0 (R-2: золото не в available).
- **RES-A6** — apply: gold 10 < min(цена) 20 → `{ok:false,
  message:'мало золота'}`; стейт не мутирован.

**tests/building-actions.test.js** (vm, существующий harness):
- **RES-BA1** — деградация: (b1) модуль standalone в {console} →
  doesNotThrow, 0 ошибок; (b2) {Game:{}, console} → ≥1 console.error
  с текстом 'Game.buildingActions отсутствует', specials пуст, краха
  нет.
- **RES-BA2** — с building-actions: песочница (actionsCode +
  moduleCode) → 0 ошибок, `G.buildingActions.specials['resurrect']` —
  function.

**tests/resurrect-e2e.test.js** (НОВЫЙ ФАЙЛ, R-7: собственный vm-
harness в прецеденте camp-map-e2e / loot-e2e / companions-cycle;
CHAIN из index.html; drain = setImmediate; mainFrameAt = raf[0];
SAVE_KEY из src/save.js; NOW=1000; host(o) = JSON round-trip для
live-массивов (кросс-реалм));
seed = оболочка {version:1, data:{day:5, hero, companions:[],
dead_mercs:[…], …}} (форма — как seed в companions-cycle):
- **RES-E1** — полный цикл: seed dead_mercs [запись merc_volk: sheet
  {level:3, xp:100, totalXp:100, points:0, primary, secondary,
  skillXp, spells, npcId}, loyalty:70, hiredDay:5], gold 100 →
  walkTo храма 36 (7,30) → `[E]` → buildingUI → clickRow
  data-buid='resurrect' → `.resurrect-overlay` открыт → Enter →
  assert: `__game.state.hero.gold` = 75 (100−25);
  `readSave(h).data.dead_mercs` — []; `readSave(h).data.companions` —
  1 запись {npcId:'merc_volk', sheet.level 3, sheet.xp 100, loyalty 70,
  hiredDay 5}; live `__game.state.roster` — 1 запись 6 ключей
  (level/xp зеркало 3/100); live `__game.state.deadMercs` — [];
  `readSave(h).data.buildingOncePerDay` — без ключей ':resurrect'
  (R-4: отказ/успех не жгут mark).
- **RES-E2** — повторная гибель: после воскрешения (сценарий E1) →
  V5-смерть в бою (паттерн companions-cycle L499+: startCombat(0),
  u.alive=false, u.hp=0, c.phase='over', c.result, Escape) →
  deadMercs снова получает запись (новое поле, не «призрак»
  воскрешённого — npcId-уникальность 000161 не сломана).
- **RES-E3** — «мало золота» в confirm: 2 кандидата (цены 25 и 70),
  gold 50 → пикер → ArrowDown (к кандидату за 70) → Enter → flash
  'мало золота'; deadMercs=2, gold=50, roster=0 (НУЛЕВЫЕ мутации);
  пикер ОТКРЫТ (Q-2) → ArrowUp → Enter (кандидат за 25) → успех:
  gold 25, deadMercs=1 (остался дорогой), roster=1.
- **RES-E4** — «отряд полон»: roster 3 (cap max_companions=3) + 1
  погибший, gold ок → walkTo → [E] → строка 'resurrect' доступна →
  нажатие → flash 'отряд полон'; roster=3, deadMercs=1, gold без
  изменений; buildingOncePerDay — без ':resurrect' (отказ не жжёт).
- **RES-E5** — «нет погибших»: dead_mercs=[] → buildingUI: строка
  'resurrect' — class disabled + reason; нажатие (Digit/click) →
  ничего: оверлей пикера нет, сейв не писан, flash нет.

**tests/index-order.test.js**:
- **RES-IO1** — тег существует; порядок building-actions.js <
  building-effect-resurrect.js < hud.js < main.js (и после runes);
  vm-гарды b1/b2/b3 (§5).

### Зелёные пере-пины (технические, смысл НЕ ослаблять)

- **A33** (L966-985): `assert.equal(p36.раз_в_день, true)` →
  `assert.deepEqual(p36.раз_в_день, { '36': true })`;
  `assert.equal(p38.раз_в_день, true)` →
  `assert.deepEqual(p38.раз_в_день, { '38': true })`; строка 37
  `assert.ok(!p37.раз_в_день)` — не трогать (проходит).
- **B17** (L~6032): `['dialog', '36']` → `['dialog', '36',
  'resurrect']`; **B18**: `['38']` → `['38', 'resurrect']`;
  **B19**: `['37']` → `['37', 'resurrect']`; **B20** (L~6048):
  `['dialog', '36']` → `['dialog', '36', 'resurrect']`.
  (Digit2 в B17/B20 — по-прежнему «Благословение»: порядок строк
  dialog, 36, resurrect.)
- **findBuildingNoDailyLimit** (L5048-5092, B12): заменять
  ```js
  const flag = !!(b.особые_параметры
    && b.особые_параметры.раз_в_день === true);
  ```
  на per-эффект:
  ```js
  const flag = G.buildingEffects.effectIds(b).some(
    (id) => G.buildingEffects.hasDailyLimit(b, id));
  ```
  Почему КРИТИЧНО: после смены флага 38 на объект старый boolean-
  чек (`=== true`) не увидит лимит → храм 38 (55 шагов BFS, без NPC)
  вытеснит башню 46 (57 шагов) → B12 сломается. Per-эффект: у 38
  hasDailyLimit('38')=true → исключается, как ДО; башня 46 —
  бит-в-бит та же (у неё флага нет и у эффекта в реестре нет
  разВДень). effectIds/hasDailyLimit — в экспорте (L2602).

## 9. Решения (R-1..R-7 + ответы на Q)

- **R-1. Пикер — ИНТЕРАКТИВНЫЙ (вне синхронного роутера).**
  Обработчик возвращает `{ok:false}` БЕЗ message → роутер молчаливо
  no-op (нет flash/mark/saveNow/render — зафиксировано BA4(d));
  confirm делает мутации + saveNow/flash/playerRender сам через
  ctx.world. ПОЧЕМУ: конвейер onBuildingAction синхронный, выбор
  пользователя в него не влезает; `{ok:false}` без message —
  единственный канал «отложить» без side-effects (проверено по коду
  L331-336).
- **R-2. Золото НЕ в available()** (строка не гаснет от нехватки
  золота). ПОЧЕМУ: ТЗ в available требует только «нет погибших»;
  e2e «мало золота» (пикер открыт, выбран дорогой кандидат)
  невозможно, если строка загашена; проверка — в apply (min-цена)
  и confirm (цена выбранного).
- **R-3. main.js получает 3 минимальные точки гейта** (§7).
  ПОЧЕМУ: все интерактивные оверлеи сидят на этом паттерне; без
  гейта пикер перекрыт [I]/[C]/[E]/движением; main.js не в
  no-touch; альтернатива (stopImmediatePropagation) — невидимая и
  хрупкая. Это ОСОЗНАННОЕ отклонение от 000128-принципа,
  ограниченное 3 точками.
- **R-4. Раз-в-день на resurrect НЕТ**: нет `разВДень` в реестре +
  нет ключа `"resurrect"` в объекте каталога (fail-open). ПОЧЕМУ:
  услуга платная — ограничитель цена; mark не должен жечься на
  отказах (E4) и на повторных использованиях (E2-цикл).
- **R-5. Touch-видимость — через существующее поле `building`**
  (`!!inBuilding || !!inResurrect`). ПОЧЕМУ:
  touchControlsVisibility (controls.js L346) читает только
  {combat, inventory, building}; новое поле не будет прочитано.
- **R-6. Гейт блокирует [E] под открытым пикером.** ПОЧЕМУ: двойной
  оверлей = два потребителя keydown = непредсказуемый ввод.
- **R-7. e2e — НОВЫЙ файл tests/resurrect-e2e.test.js** (собственный
  harness). ПОЧЕМУ: building-effects.test.js — 8476 строк, горячий
  для параллельных задач (000146/000149/000163/000152) — новый файл
  = нулевые merge-конфликты; прецеденты: camp-map-e2e, loot-e2e,
  companions-cycle (harness уже дублируется по e2e-файлам).

Ответы a2-архитектуре: **Q-1** (золото в available?) = НЕТ (R-2).
**Q-2** (пикер при отказе?) = ОСТАЁТСЯ открытым + flash (строки:
'мало золота' / 'отряд полон'). **Q-3** (гейты в main.js допустимы?)
= ДА, 3 точки (R-3). **Q-4** (flash-строка успеха?) =
«<имя> снова в отряде.» — повластно-нейтральная (5 из 7 наёмников —
женщины; «вернулся/возвращён» — грамматически неверно). **Q-5**
(touch-видимость?) = R-5.

Доп. зафиксированное: (а) переназначение root.Game в UMD допустимо
(camp/49/45) — для resurrectUI; (б) порядок мутаций confirm:
ре-гидратация (чистая) ПЕРЕД gold/splice/push — при null ноль
мутаций; (в) flash/saveNow/playerRender на успех — ТОЛЬКО в
confirm'е (роутер на этом пути уже no-op); (г) ЕФИР не подлежит
(не в deadMercs — auto-возрождение D4, 000156).

## 10. План реализации (по файлам, порядок коммитов в task/000162)

| # | Файл | Изменение | ~Δ строк |
|---|---|---|---|
| 1 | memory/000162-temple-resurrection.md | этот файл (в коммите красных) | +~300 |
| 1 | tests/building-effects.test.js | RES-A1..A6 (в конец файла) | +~150 |
| 1 | tests/building-actions.test.js | RES-BA1/BA2 | +~80 |
| 1 | tests/resurrect-e2e.test.js | НОВЫЙ: harness + RES-E1..E5 | +~400 |
| 1 | tests/index-order.test.js | RES-IO1 + модуль в список | +~120 |
| 2 | assets/buildings/000036.json, 000037.json, 000038.json | эффекты/раз_в_день/воскрешение (§2) | +3×2..3 |
| 2 | src/buildings.js | РЕГЕНЕРАЦИЯ sync-скриптом (один коммит с JSON) | ~+9 |
| 3 | src/building-effects.js | EFFECTS['resurrect'] + 4 функции ядра + 4 экспорта + строка хедера | +~75 |
| 4 | src/building-effect-resurrect.js | НОВЫЙ спец-модуль (§4) | +~280 |
| 4 | index.html | тег (+комментарий) между runes и hud.js; CSS-хвост (§6) | +~9 |
| 4 | src/main.js | 3 гейта (§7) | +~6 |
| 5 | tests/building-effects.test.js | A33 (2 строки), B17..B20 (4 строки), findBuildingNoDailyLimit (1-2 строки) | ±~6 |
| 6 | — | `npm test` — ВСЁ зелёное; `npm run sync:check` — чисто | — |
| 7 | CHANGELOG.md | отдельный коммит, `## 2026-10-07` → `### Игровой процесс`: «**Воскрешение в храме.** Погибший в бою наёмник может быть воскрешён в храмах Солнца, Луны и Горы. Услуга появляется в оверлее постройки храма; цена зависит от опыта погибшего. Выбор погибшего — пикером со списком (имя, уровень, опыт, цена).» (без программных деталей, дата = день мержа) | +2 |
| 8 | tasks/result/000162.md + pending→done | отчёт (разделы «Файлы», «Как проверяли» — структура 000076) + перенос | ~+60 |

Формат коммитов: первая строка «Задача 000162: …» (рус.), последняя
строка отдельным параграфом `Co-Authored-By: Claude Code
<noreply@anthropic.com>`. Красные: ровно 14 fail, остальные зелёные.
ПУШ В ДИСТАНТ — ЗАПРЕЩЁН; мерж/`.merge-pending` — не эта станция.

## 11. Подводные камни

1. **UMD-ловушка 000038**: тег ОБЯЗАТЕЛЬНО до main.js (L13 `const G =
   globalThis.Game` — снапшот один раз); переназначение root.Game —
   через `Object.assign({}, G0, {…})` (копируем, не мутируем
   оригинал).
2. **000085**: deadMercs/roster — const live-ссылки из deps-бандла;
   только length/push/splice; ПЕРЕЗАПИСЫВАТЬ (`deadMercs = …`,
   `roster = …`) — НЕТ.
3. **Порядок мутаций confirm**: ре-гидратация (чистая, может дать
   null) ПЕРЕД списанием золота/splice/push — иначе при null
   «списали золото, запись не удалена».
4. **B12 (HIGH)**: findBuildingNoDailyLimit с boolean-чеком —
   регрессия после смены 38 на объект; фикс — per-эффект
   hasDailyLimit (§8). Без фикса B12 ломается (храм 38, 55 шагов,
   вытесняет башню 46).
5. **vm-key() снапшотит слушателей** на момент вызова (браузерная
   семантика): пикер добавляет keydown при open → e2e-кадр
   нажатия ПОСЛЕ open — ключ пройдёт (прецедент: building-ui в
   B-тестах так и работает).
6. **Кросс-реалм** (e2e): live-массивы vm-области — читать через
   `host(o)` (JSON round-trip; Array.isArray ДО вызова — паттерн
   companions-cycle).
7. **Детерминизм**: 0 Math.random/Date в новом коде; Math.round(20.5)
   = 21 — зафиксировать золотым пином (A4).
8. **Собственный класс оверлея** (.resurrect-overlay, НЕ
   .combat-overlay): чужие findOverlay и W2-тесты ищут .combat-
   overlay; e2e — свой findResurrectOverlay.
9. **saveNow в confirm'е** пишет сейв ПОСЛЕ push'а в roster —
   readSave сразу после confirm видит уже воскресшего
   (companions[0]), а НЕ в dead_mercs.
10. **Не дублировать flash/saveNow**: на успех — ТОЛЬКО confirm
    (роутер no-op); если «улучшатель» заставит роутер flashить r/
    sres на этом пути — появится двойной flash (E-тесты ловят).
11. **A33/B17-20 — пере-пины, а не ослабления**: те же ассерты,
    только значение каталога стало объектом/строки больше.
12. **39/21 — не трогать**; 37 — флаг не трогать (у Луны его нет —
    «подсказка бесплатна»).
13. **Пол**: flash «<имя> снова в отряде.» (нейтрально) — не
    «вернулся/возвращён».
14. **Генерация**: src/buildings.js — РЕГЕНЕРИРУЕМОЕ зеркало;
    править руками нельзя; JSON+JS — один коммит; sync:check.

## 12. Что НЕ трогаем (явно)

- ui.js, combat.js, efir.js, assets/spells (параллельные задачи
  000146/000149/000163/000152).
- building-ui.js, building-actions.js (используем registerSpecial/
  specials — только ЧИТАЕМ), controls.js, companions.js
  (reviveEntryFromRecord — только вызываем), npc.js, save.js.
- SPEC.md (воскрешение описано в 000156), schema.json (особые_
  параметры — free-form), assets/buildings/000039.json, 000021.
- Другие спец-модули (44_perform/45/48/camp/49/runes/rest).
- Карта, бой, сейвы (кроме использования существующих разделов),
  RNG, существующие тесты (кроме технических пере-пинов §8).
- main.js — ТОЛЬКО 3 точки гейта (§7), ничего более.

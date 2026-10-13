# Задача 000200 — «Полный отдых» в таверне (44) и лагере (47): архитектура и контракты (дизайн)

ТЗ (tasks/pending/000200.md, одна строка):
«В тавернах и лагерях добавить возможность отдохнуть (за золото) с целью
полного воссановления HP и MP».

Станция: ПРОЕКТИРОВАНИЕ. Worktree .worktrees/task-000200, ветка task/000200,
базис master = e6fcbab (2307 pass / 0 fail, ~124 s). Анализы: a1-domain,
a2-arch, a3-tests (три расходящихся предложения — примирены ниже, §9).
НОВАЯ функциональность: платное действие «Полный отдых» — полное
восстановление HP и MP героя за золото. БЕСПЛАТНЫЙ отдых (44_rest/«Отдых»
таверны, «Костёр»/fire лагеря: день проходит + частичное восстановление)
НЕ трогается (инвариант — существующие B24/B25/A66 и др. зелёные без
смысловых правок).

## 1. Статус / базис

- Базис: master e6fcbab, `npm test` (node --test) в worktree — 2307 pass /
  0 fail (~124 s), флейков нет.
- В работе (волна 1, параллельные worktrees): 000191, 000192, 000201,
  000203, 000206, 000193.02 — прогноз: файловых пересечений с нами НЕТ
  (combat-ui/combat/locations/cities/map). ПРОВЕРИТЬ на rebase: конец
  EFFECTS + хвост экспорта (src/building-effects.js), слот спец-модулей
  (index.html), A1-юнион (tests/building-effects.test.js), CHANGELOG
  «## 2026-10-13» (общая секция — пуллеты-юнион).
- Домен (выверено по коду master):
  * Таверна 44: `особые_параметры.эффекты = ["44_rest","44_rumors",
    "44_perform"]`; раз_в_день = {"44_perform":true}. «Отдых» (44_rest) —
    мир-«сторона»: clock.rest() (день+1, шаги 0) + частичное восстановление
    onDay-подписчиками main.js (restoreDay(hero)). Спец-модуль
    src/building-effect-44_rest.js. БЕЗ apply в реестре.
  * Лагерь 47: `особые_параметры.эффекты = ["fire","market"]`; раз_в_день
    НЕТ. «Костёр» (fire) — тот же мир-паттерн (clock.rest, спец-модуль
    src/building-effect-camp.js). Лагерь генерируется на карте (000131).
  * Роутер onBuildingAction (src/building-actions.js): чистый
    entry.apply(state) → при ok: спец-хендлер specials[action.id](ctx) →
    при успехе: daily-марка (ТОЛЬКО если hasDailyLimit) + saveNow +
    flash(r.message || sres.message) + playerRender. При отказе apply ИЛИ
    спец-а: flash(message) БЕЗ марки/saveNow/render (000128 §2.6).
  * apply-state: { day, tile:{x,y}, hero (ЖИВАЯ ссылка), save (СНИМОК),
    map, catalog: b, cityAnchor }. specials-ctx: { day, tile, hero (ЖИВАЯ),
    save, map, r, action, b, t, npc, clock, moveHero, startCombat,
    world: deps }.
  * HP/MP персистентны ТОЛЬКО у hero (c.player = живой лист, бой мутирует
    in place; restoreDay — только hero). Союзники/Эфир — каждый бой
    makeAlly hp=maxHP / mp из атрибутов (персистентного урона нет).
  * maxHP/maxMP: Game.derived(hero) → { maxHP, maxMP } (sheet.js L443-450:
    level-1 герой 25/16).
  * Золото: hero.gold (live-ссылка в ctx.hero). Отказ-текст плоской цены —
    «мало золота (нужно N)» (items.js:925, npc.js, craft.js:382,
    building-actions.js:738/780). «−» — U+2212 (building-actions.js:846,
    формат «… (−N з.)»).

## 2. Что добавлено (список файлов, 1:1 §10)

- `assets/buildings/000044.json` — эффекты += "fullrest" (append); эффект.
  полный_отдых = { цена: 10 }.
- `assets/buildings/000047.json` — эффекты += "fullrest" (append); эффект.
  полный_отдых = { цена: 10 }.
- `src/buildings.js` — РЕГЕНЕРАЦИЯ `npm run sync:buildings` (зеркало; один
  коммит с JSON).
- `src/building-effects.js` — запись EFFECTS['fullrest'] (имя + apply),
  ЧИСТОЕ ядро fullRestPrice/applyFullRest, экспорт в хвост.
- `src/building-effect-fullrest.js` — НОВЫЙ спец-модуль (UMD, саморегистрация
  'fullrest').
- `index.html` — один тег <script src="src/building-effect-fullrest.js">.
- `tests/building-effects.test.js` — A1-юнион, re-пины A65/A55/A56/B26/B27/
  PF4, новые RG1–RG5 (node) + RG-E1/RG-E3 (vm).
- `tests/camp-map-e2e.test.js` — re-пин CP-7 (3→4 строки), новый CP-11 (vm).
- `tests/index-order.test.js` — список += тег, новый IO3 (pos-пин; UMD-гарды — RG4).
- `CHANGELOG.md` — пуллет в СУЩЕСТВУЮЩУЮ секцию «## 2026-10-13».
- Перенос задачи pending→done + tasks/result/000200.md.
- НОВЫХ SVG/ассетов НЕТ. НОВОГО save-раздела НЕТ. SPEC не правится.

## 3. Контракты и границы

### 3.1 Каталог (source of truth, 000053)
- 000044.json: `особые_параметры.эффекты` = ["44_rest","44_rumors",
  "44_perform",**"fullrest"**] (append в КОНЕЦ — позиции цифр 2/3/4
  НЕ сдвигаются, новая строка — 5-я). `особые_параметры.эффект.
  полный_отдых = { "цена": 10 }`. НЕ трогать: раз_в_день (остаётся
  {"44_perform":true}), слухи, выступление, даёт/малая/map_index/виды/
  стройка.
- 000047.json: `особые_параметры.эффекты` = ["fire","market",**"fullrest"**]
  (append — строка 4-я). `особые_параметры.эффект.полный_отдых = { "цена":
  10 }`. НЕ трогать: respawn_days, виды, даёт. absence-лист A56 (map_index/
  размещение/размер/вход/раз_в_день) НЕ меняется — новое поле ВНУТРЬ
  существующего «эффект», не в особые_параметры.
- schema.json — НЕ трогать (особые_параметры — open object).
- Зеркало src/buildings.js — regen `npm run sync:buildings` (byte-пины
  tests/buildings.test.js L812 + идемпотентность L498 + sync-all —
  автопройдут). ОБЯЗАТЕЛЬНО в том же коммите, что и JSON (иначе
  buildings/sync-all красные).

### 3.2 Реестр EFFECTS['fullrest'] (src/building-effects.js)
ОДНА запись (общий id на оба здания — прецедент 'resurrect' 000162: один ид
на 3 постройки). Вставка — в КОНЕЦ EFFECTS (после последней группы, перед
комментарием effectIds L637):
```
EFFECTS['fullrest'] = {
  имя: 'Полный отдых',
  apply: applyFullRest,
};
```
- available НЕ пишется (золото строку НЕ гасит — прецедент R-2 воскрешения
  000162: строка всегда доступна, отказ «мало золота» — в момент действия).
- разВДень НЕ пишется (лимит раз-в-день НЕТ — как у бесплатного отдыха;
  каталог без ключа 'fullrest' → hasDailyLimit false).
- Строка оверлея (buildingActions) — АВТОМАТИЧЕСКИ из effectIds(building)
  (массив каталога ∩ реестр): { id:'fullrest', имя:'Полный отдых', доступен:
  true } — КОНЦОМ эффекта-блока (после 44_perform / market). Крафт-строка
  (если есть) остаётся последней — «fullrest» до неё.

### 3.3 ЧИСТОЕ ядро (src/building-effects.js, паттерн applyTavernPerform /
applyResurrect / mentor)
```
// Цена «Полного отдыха» из СНИМКА каталога
// (ст.catalog.особые_параметры.эффект.полный_отдых.цена);
// не-число / <0 → null (fail-closed: битый каталог НЕ даёт
// бесплатный полный отдых). Прототип-безопасно.
function fullRestPrice(st) {
  const eff = catalogEffect(st);               // существующий helper (L871)
  const p = eff && eff.полный_отдых;
  const price = p && p.цена;
  return (typeof price === 'number' && Number.isFinite(price)
    && price >= 0) ? price : null;
}

// apply(state) «Полный отдых» — ЧИСТОЕ (снимок не мутирует).
// Успех — { ok:true, success:true, цена, maxHP, maxMP,
//   message:'Полный отдых: HP и MP восстановлены (−N з.)' }
//   (АБСОЛЮТЫ maxHP/maxMP из derived — хендлер присвоит на live hero).
// Отказы: нет G/G.derived / каталог-мусор / нет hero → 'недоступно';
//   hero.gold < цена → 'мало золота (нужно N)'. hero.alive===false →
//   'недоступно' (отдых НЕ воскрешает — своя система 000156/000162;
//   дефенсивный гард — в игре оверлей мертвому недоступен).
function applyFullRest(st) {
  const G = lazyGame();
  if (!G || typeof G.derived !== 'function')
    return { ok: false, message: 'недоступно' };
  const price = fullRestPrice(st);
  if (price === null) return { ok: false, message: 'недоступно' };
  const hero = st && st.hero;
  if (!hero || typeof hero !== 'object' || Array.isArray(hero))
    return { ok: false, message: 'недоступно' };
  if (hero.alive === false) return { ok: false, message: 'недоступно' };
  const gold = Number.isFinite(hero.gold) ? hero.gold : 0;
  if (gold < price)
    return { ok: false, message: 'мало золота (нужно ' + price + ')' };
  const d = G.derived(hero);
  if (!d || !Number.isFinite(d.maxHP) || !Number.isFinite(d.maxMP))
    return { ok: false, message: 'недоступно' };
  return {
    ok: true, success: true, цена: price,
    maxHP: d.maxHP, maxMP: d.maxMP,
    message: 'Полный отдых: HP и MP восстановлены (−' + price + ' з.)',
  };
}
```
- Экспорт — в хвост объекта (после строки resurrect, L2929):
  `fullRestPrice, applyFullRest,`
- Детерминизм: 0 Math.random/Date (цена — каталожная константа; maxHP/maxMP —
  чистые от листа). Два вызова — deepEqual.

### 3.4 Спец-модуль src/building-effect-fullrest.js (НОВЫЙ, UMD 1:1 по форме
building-effect-44_perform.js / building-effect-mentor.js)
- node-ветка: `module.exports = factory(null)` → `{ fullRest }` (без
  регистрации — в node Game нет; тесты регистрируют вручную).
- browser-ветка (в МОМЕНТ загрузки): ленивое `const G = typeof root.Game ===
  'object' ? root.Game : null`:
  * G отсутствует (standalone) → тихий выход (0 console.error);
  * G есть, но нет G.buildingActions.registerSpecial → console.error
    (ФИКСИРОВАННЫЙ текст: 'building-effect-fullrest.js: Game.buildingActions
    отсутствует — src/building-actions.js обязан грузиться ДО этого модуля
    («Полный отдых» не работает)') + регистрация НЕ происходит (000053);
  * иначе: `G.buildingActions.registerSpecial('fullrest', (ctx) =>
    fullRest(ctx))`.
- В момент загрузки — НОЛЬ зависимостей (ни require, ни DOM, ни чтения
  Game-функций, ни console вне деградации). НИКОГДА не переприсваивает root
  Game (UMD-ловушка 000038: main.js снимает Game один раз). try/catch НЕТ
  (000128 §2.4).
- **Контракт `fullRest(ctx) → { ok: boolean, message?: string }`** (порядок
  гардов; ctx — specials-ctx роутера):
  1. `r = ctx && ctx.r`; `!r || r.ok !== true || r.success !== true` →
     `{ ok:false, message:'недоступно' }` (дефенсивный: роутер вызывает
     спец-а ТОЛЬКО при r.ok).
  2. `h = ctx && ctx.hero`; `!h || typeof h !== 'object'` → 'недоступно'.
  3. ДЕФЕНСИВНЫЙ gold-ре-чек (apply уже проверял; защита от битого сейва,
     000029 — списание не уводит gold в отрицательное):
     `g = Number.isFinite(h.gold) ? h.gold : 0;`
     `g < r.цена` → `{ ok:false, message:'мало золота (нужно ' + r.цена + ')' }`.
  4. МУТАЦИИ live-ссылки (в этом порядке): `h.gold = g - r.цена;
     h.hp = r.maxHP; h.mp = r.maxMP;`
  5. return `{ ok: true }` (message — из r.message, роутер: r.message
     ПЕРВЫМ).
- clock НЕ вызывается (ДЕНЬ НЕ ПРОХОДИТ — решение D3): day/steps/buffs/
  респауны/жалованье/dungeon_memory — не трогаются. saveNow/flash/render —
  АВТОМАТИКА роутера (не дублировать).

### 3.5 index.html
ОДИН тег в слоте спец-модулей: СРАЗУ ПОСЛЕ
`<script src="src/building-effect-mentor.js"></script>` (L1074), ДО
комментария+тега `src/hud.js` (L1080). Комментарий слота по образцу соседей
(задача 000200, 000128 §2.3, ПОСЛЕ building-actions.js, ДО main.js —
UMD-ловушка 000038).

### 3.6 Файлы, которые НЕ трогаются (нулевая проводка)
main.js, building-actions.js, hud.js, day.js, player.js, sheet.js,
combat.js, SPEC. Всё несёт ctx + штатный хвост роутера (контракт 000128
§2.3: задача-эффект = только запись EFFECTS + спец-модуль + тег + каталог).

## 4. Ленивые ссылки и guards

- Цена — из СНИМКА каталога в apply (st.catalog = b — READ-ONLY запись
  каталога, которую роутер кладёт в apply-state; special получает ту же b
  через ctx.b). Код каталог-драйвен (000053) — НИЧЕГО не хардкодит; цена 10
  — только значение каталога.
- maxHP/maxMP — `G.derived(hero)` в ЧИСТОМ apply (lazyGame() — лениво,
  в момент вызова, не в шапке; паттерн applyTavernPerform L2003). АБСОЛЮТЫ
  передаются хендлеру через r (r-объект, паттерн 000137/000147) — special
  остаётся тонким.
- live-ссылки: st.hero / ctx.hero — ЖИВАЯ ссылка hero бандла main.js (роутер
  передаёт deps.hero); apply её НЕ мутирует (чистота), special МУТИРУЕТ
  (gold−, hp/mp=). gold NaN/не-число → 0 (fail-open 000029) → «мало золота».
- Guards (деградация, игра не падает): нет G/G.derived → 'недоступно';
  каталог-мусор (нет полный_отдых / цена не-число) → 'недоступно'
  (fail-closed — НЕ бесплатный отдых); нет hero / hero.alive===false →
  'недоступно'; special: !r/!r.ok/!h → 'недоступно'; special: нормализованное
  gold < r.цена → 'мало золота (нужно N)' (дефенсивный ре-чек, §3.4 п.3).
- available() НЕТ: строка активна ВСЕГДА (gold строку не гасит); клик без
  золота → flash «мало золота (нужно N)» БЕЗ saveNow/марки/render
  (семантика отказа 000128 §2.6).
- Лимит раз-в-день НЕТ → марки buildingOncePerDay НЕ пишется (hasDailyLimit
  false) → формат сейва НЕ меняется (нет нового раздела/ключа).

## 5. Что важно будущим задачам (из ТЗ-ссылок и решений)

- Цена 10 з. — РЕШЕНИЕ АНАЛИЗА (не ТЗ), catalog-driven → тюнинг БЕЗ кода
  (поменять `цена` в 000044/000047.json + regen). Механизм ПОЗВОЛЯЕТ разные
  цены в таверне и лагере (сейчас обе 10 — решение D5).
- Hero-only: восстанавливается ТОЛЬКО Флогистон. Если будущая задача сделает
  персистентный урон/ману у наёмных/Эфира — «Полный отдых» придётся
  расширять (сейчас restore союзников был бы no-op: makeAlly всегда
  hp=maxHP). Ограничение зафиксировано — не «баг».
- Городская таверна: новое действие появляется АВТОМАТИЧЕСКИ (тот же
  каталожный рекорд 44, пайплайн interactCity → openBuildingUI; лимита нет →
  cityAnchor-ключ не участвует). Отдельного city-e2e не требуется (CI-U уже
  гоняет [E] в таверне). Лагерь в городах НЕ строится.
- SPEC game-time.md знает «явный отдых (таверна…)» как триггер смены дня, но
  НЕ содержит платного отдыха — задача РАСШИРЯЕТ SPEC. Кандидат на будущую
  ретро-задачу: зафиксировать цену/механику в SPEC после мержа (НЕ в этой
  задаче — ТЗ не требует).
- Заметка memory/000095 «лагерь не генерируется на карте» УСТАРЕЛА —
  000131-camp-placement слит (лагеря генерируются; camp-map-e2e ходит 30
  шагов). CP-11 использует РЕАЛЬНЫЙ мировой путь (bootAndWalkToCamp).

## 6. Красные тесты (RED: падают осмысленно на чистом worktree; остальные
2307 зелёные)

9 новых (6 node + 3 vm). Нумерация по конвенции PF*/RES* (секция
«Задача 000200», после RES-A6 в A-секции / в конце B-секции / в
camp-map-e2e / index-order):

- RG1 — node (building-effects.test.js): реестр EFFECTS['fullrest'] {имя:
  'Полный отдых', apply: function, БЕЗ разВДень/available}; каталог 44:
  deepEqual эффекты == ['44_rest','44_rumors','44_perform','fullrest'],
  эффект.полный_отдых == {цена:10}, раз_в_день БЕЗ изменений {44_perform:true};
  каталог 47: эффекты == ['fire','market','fullrest'], полный_отдых ==
  {цена:10}; зеркало src/buildings.js ≡ JSON (обе записи, deepEqual
  особых_параметры); effectIds(44/47) несут fullrest; hasDailyLimit(44|47,
  'fullrest') === false. КРАСНЫЙ: нет EFFECTS['fullrest']/каталожных полей.
- RG2 — node: ЧИСТОЕ apply — ПОЛНОЕ восстановление. withGame({derived:
  P.derived}) + hero {hp:1,mp:1,gold:500} + catalog B.getBuilding(44) →
  {ok:true, success:true, цена:10, maxHP: P.derived(hero).maxHP, maxMP:
  P.derived(hero).maxMP, message:'Полный отдых: HP и MP восстановлены (−10
  з.)'}; та же проверка с catalog B.getBuilding(47) → цена 10 (ОБЕ 10 —
  catalog-driven; apply ЧИСТАЯ — gold в результат не входит, списание делает
  спец-хендлер h.gold −= r.цена); snapshot НЕ мутирован; два вызова —
  deepEqual (детерминизм, 0 RNG). КРАСНЫЙ: нет applyFullRest.
- RG3 — node: apply — отказы/деградации БЕЗ исключений. (a) gold 9 →
  {ok:false, message:'мало золота (нужно 10)'}; (b) gold 10 → ok (граница:
  ровно хватает); (в) каталог-мусор (нет полный_отдых / цена не-число) →
  'недоступно'; (г) hero.alive===false → 'недоступно'; (д) withGame(null) →
  'недоступно' без throw; (е) во ВСЕХ отказах snapshot не мутирован.
  КРАСНЫЙ: как RG2.
- RG4 — node: спец-модуль UMD-гарды + self-registration (шаблон
  RES-BA1/RES-BA2 + IO1). (a) require() в node → { fullRest: function }
  чистая загрузка (0 console.error); (б) fullRest({r:{ok:true,success:true,
  цена:10,maxHP:25,maxMP:16}, hero:{hp:1,mp:1,gold:500}}) → hero.gold 490,
  hero.hp 25, hero.mp 16, {ok:true} (message из r); (в) гарды (!r / !r.ok /
  !hero) → {ok:false, message:'недоступно'} БЕЗ мутаций; (в2) дефенсивный
  gold-ре-чек: r ок + hero.gold NaN → {ok:false,
  message:'мало золота (нужно 10)'} БЕЗ мутаций (gold не уходит в минус);
  (г) standalone-
  песочница {console} → 0 ошибок, без краха; (д) песочница building-
  actions.js + модуль → 0 ошибок, Game.buildingActions.specials['fullrest']
  — function (self-registration); (е) песочница БЕЗ building-actions.js →
  console.error (текст §3.4) + регистрация НЕ произошла. КРАСНЫЙ: файла
  src/building-effect-fullrest.js НЕТ (require падает).
- RG5 — node: полный путь onBuildingAction (таверна) — makeFullRestDeps по
  шаблону makePerformDeps (L8211; clock со spy-методом rest;
  BA.registerSpecial('fullrest', (ctx)=>mod.fullRest(ctx)) вручную, паттерн
  PF1): action {id:'fullrest'} + b44 + hero {hp:1,mp:1,gold:500} →
  hero.gold 490, hero.hp===P.derived(hero).maxHP, hero.mp===P.derived(hero).
  maxMP, calls.flash==['Полный отдых: HP и MP восстановлены (−10 з.)'],
  calls.saveNow==1, calls.playerRender==1, buildingOncePerDay.size==0 (БЕЗ
  марки — лимита нет), clock.rest НЕ вызван (spy 0) и clock.day не изменился.
  ОТКАЗ: hero.gold 0 → calls.flash==['мало золота (нужно 10)'], saveNow 0,
  playerRender 0, hero не мутирован, size 0. КРАСНЫЙ: specials['fullrest']
  не зарегистрирован → ветка «НЕТ ДЕЙСТВИЯ».
- IO3 — node (index-order.test.js): тег 'src/building-effect-fullrest.js'
  pos !== -1; pos(building-actions) < pos(fullrest) < pos(main.js) (отдельный
  пин, слот общий — прецедент 000091 §2.2). КРАСНЫЙ: тега нет.
  (Имя IO3: IO2 в index-order.test.js ЗАНЯТ 000162 (resurrect) — в
  реализации 2026-10-13 тест назван IO3, содержательный состав пина
  без изменений.)
- RG-E1 — vm (building-effects.test.js B): таверна e2e (41,2) —
  boot(seedSave({day:1, position:{x:41,y:2}, hero: mkHero({hp:1,mp:1,
  gold:500})})); [E] → deepEqual rows buid == ['dialog','44_rest','44_rumors',
  '44_perform','fullrest'] (имя «Полный отдых»); все доступны; Digit5 →
  день ОСТАЁТСЯ 1 (g.state.day==1, stepsToday без изменений), g.state.hero.
  hp===derived.maxHP, mp===derived.maxMP ТОЛЬКО ЧЕРЕЗ readSave (g.state.hero.
  mp отсутствует — §8), g.state.hero.gold 490, flash == точная
  строка, readSave: day 1, gold 490, hp/mp полные, buildingOncePerDay БЕЗ
  '41,2:fullrest'; повтор [E]+Digit5 в тот же день → gold 480, день ЕЩЁ 1
  (лимит НЕТ). КРАСНЫЙ: 4 строки (нет fullrest) — deepEqual падает первым.
- RG-E2 / CP-11 — vm (camp-map-e2e.test.js): лагерь e2e (мировой путь,
  (−18,−12)) — bootAndWalkToCamp(); hero pre-seed {hp:1,mp:1,gold:100}; [E]
  → rows dialog/fire/market/fullrest (4); Digit4 → день НЕ изменился
  (КЛЮЧЕВОЕ отличие от Костра — CP-8-семантика НЕ переносится), stepsToday
  без изменений, g.state.hero.hp полный, mp полный ЧЕРЕЗ readSave (§8),
  g.state.hero.gold 90, flash, saveNow (save day тот же), БЕЗ
  '−18,-12:fullrest' в buildingOncePerDay. КРАСНЫЙ: 3 строки (нет fullrest).
- RG-E3 — vm (building-effects.test.js B): таверна e2e — МАЛО ЗОЛОТА: boot
  (41,2) hero {hp:1,mp:1,gold:0}; [E] → Digit5 → flash 'мало золота (нужно
  10)', день 1, hero hp1/mp1/gold0, save day 1, НИКАКОЙ новой записи
  buildingOncePerDay (отказ — flash БЕЗ saveNow, 000128 §2.6). КРАСНЫЙ:
  строки fullrest нет.

### Re-пины (ТОЛЬКО технические — append строки/элементов, смысл НЕ
ослаблять)
- A1 (L125+): ОБА списка — MERGED += 'fullrest' И UNION += 'fullrest'
  (запись наша — merged; union-цикл ловит чужие id) + строка-комментарий
  «000200: +'fullrest' (таверна 44 / лагерь 47 «Полный отдых» — общая
  услуга, не 1-к-1 по id; пин регенерирован по фактическому коду)»
  (формат — по соседям '44_perform'/'resurrect').
- A65 (L3139): p44.эффекты deepEqual += 'fullrest'; effectIds(44) += 'fullrest';
  buildingActions(44,npc) ids += 'fullrest' (4→5 строк). Пины
  раз_в_день/map_index/виды/малая — БЕЗ изменений.
- A55 (L3511): effectIds(47) deepEqual ['fire','market'] → += 'fullrest';
  buildingActions(camp,npc) 3→4; buildingActions(camp,null) 2→3; имена
  [1]='Костёр',[2]='Барахолка' СОХРАНЯЮТСЯ (append); имя [3]='Полный отдых'.
- A56 (L3558): op.эффекты += 'fullrest'; op.эффект deepEqual → добавить
  `полный_отдых: {цена:10}`; absence-лист ключей НЕ меняется.
- B26 (L7286): rows buid deepEqual (L7321) += 'fullrest' (4→5). Digit2
  (44_rest) и вся семантика — без изменений.
- B27 (тест «Слухи»; rows buid deepEqual — L7380): += 'fullrest' (4→5).
  Digit3 (44_rumors) и золотой фрагмент — без изменений. (Был ПРОПУЩЕН в
  a3-анализе и первом черновике — найден полным перебором deepEqual по
  '44_perform'.)
- PF4 (L8431): rows buid deepEqual (L8459) += 'fullrest' (4→5). Digit4
  (44_perform) — без изменений.
- CP-7 (camp-map-e2e L515): `findAll(ov,'[data-buid]').length === 3` → 4 +
  проверка строки 'fullrest' (имя «Полный отдых»). Digit1/2/3 позиции НЕ
  сдвигаются (append).
- index-order (L34-95): список «нужные модули подключены» += 'src/
  building-effect-fullrest.js' (строка ПОСЛЕ mentor, ДО hud).

### Остаются зелёными БЕЗ правок (регрессия)
B24 (чистая загрузка цепочки — новый тег обязан грузиться тихо, UMD-гарды),
B25 (Костёр: день+1, БЕЗ марки), B26-семантика-отдыха (rows re-пин — выше),
B27-семантика (Digit3/золотой фрагмент; rows re-пин — выше),
A66 (node 44_rest), A67/A68, PF1–PF3, RES-*, DK1, CI-*, CP-6/CP-8/CP-9/CP-10,
buildings/cities/sync-all (после regen), save/save-restore (нет нового
раздела), day (clock не трогается), svg (новых ассетов нет), camp-placement.

## 7. Merge-notes (rebase на свежий master перед мержем — ОБЯЗАТЕЛЬНО)

- 6 задач волны 1 в полёте (000191/000192/000201/000203/000206/000193.02) —
  по прогнозу файловых пересечений НЕТ. ПРОВЕРИТЬ на rebase: конец EFFECTS +
  хвост экспорта (src/building-effects.js — union), слот спец-модулей
  (index.html — union), A1-юнион (tests/building-effects.test.js — union),
  CHANGELOG «## 2026-10-13» (общая секция — пуллеты-юнион). После rebase —
  ПОЛНЫЙ `node --test tests/` (голый npm test не использовать) + baseline от
  факта.
- НИКАКИХ push в remote. Не трогать основной репозиторий и чужие worktrees.
- .merge-pending — ТОЛЬКО на стадии мержа (не здесь).

## 8. Подводные камни

- UMD-ловушка 000038: тег ОБЯЗАТЕЛЬНО между building-actions.js и main.js —
  иначе саморегистрация уйдёт в НОВЫЙ объект Game main.js и specials молча
  мертво. Ловят: IO3 (pos-пин) + RG4(г/д/е) (UMD-гарды) + B24 (чистая
  загрузка).
- e2e: hero.mp читается через readSave(h).data.hero.mp (g.state.hero.mp
  отсутствует — 000091 §9.4). Таверна — pre-seed position ОБЯЗАТЕЛЕН (43 шага
  от спавна > steps_per_day 40 — иначе случайная смена дня). seedSave-hero
  ОБЯЗАТЕЛЬНО несёт gold (sanitizeSavedHero: gold — number ≥ 0, иначе
  restore null).
- single-flash (000128): конфликта НЕТ (день не проходит → onDay-flash нет;
  r = результат apply → msg = r.message).
- Аппенд в конец массива эффектов — позиции цифр НЕ сдвигаются (44:
  Dialog1/Rest2/Rumors3/Perform4 → FullRest5; 47: Dialog1/Fire2/Market3 →
  FullRest4) — существующие digit-пины (B26 Digit2, PF4 Digit4, CP-8 Digit2/3)
  не трогаются.
- Fail-closed: битый каталог (цена не-число) → «недоступно» (НЕ бесплатный
  полный отдых); no Game.derived → «недоступно»; gold NaN → 0 → «мало золота».
- Детерминизм/RNG/сейв: нового RNG НЕТ; нового save-раздела НЕТ (v1, без
  version-bump); марки daily не пишется (no limit) — формат сейва не меняется.
- Платный отдых день НЕ проходит → НЕ задевает onDay-цепь (респауны/
  жалованье payWages/buffs/dungeon_memory/saveNow-порядок — инварианты
  детерминизма НЕ трогаются).

## 9. Решения (примирение a1/a2/a3 + ответы на Q)

- D1. effectId `fullrest` — ОДИН общий на таверну (44) И лагерь (47). Почему:
  прецедент 'resurrect' (000162: один ид на 3 постройки, одна запись
  EFFECTS, один спец-модуль, один хендлер); лимита нет → ключи раз-в-день не
  пишутся (различать здания не нужно); цена каталог-драйвен (per-здание),
  так что общий id НЕ мешает разной цене. Отклонены: `44_inn`/`47_inn` (a1 —
  два дубля имени/apply в реестре), `rest_gold` (a3 — допустимо, но 'fullrest'
  короче и совпадает с а2/именем файла).
- D2. Имя строки «Полный отдых». Почему: отличает от бесплатного «Отдых»
  (44) и «Костёр» (47); само описывает услугу полного восстановления; читается
  в обоих зданиях. Отклонены: «Ночёвка» (a1 — подразумевает сон/прохождение
  дня — неверно, день НЕ проходит), «Отдых за золото» (a3 — длиннее).
- D3. ДЕНЬ НЕ ПРОХОДИТ (clock не трогать). Почему: (а) цель по ТЗ — «полное
  воссановление HP и MP» (покупаешь восстановление, а не время); (б)
  бесплатное «прохождение дня» уже есть (44_rest/fire) — платная версия с
  днём строго доминировала бы бесплатную (любой игрок с ≥10 з. всегда брал
  платную), делая бесплатную мёртвым UI; (в) минимум мутаций — не задевает
  onDay-каскад (респауны/жалованье/buffs/dungeon_memory/saveNow×2) —
  детерминизм-безопасно. Отклонён a1 «день проходит».
- D4. Scope = ТОЛЬКО герой (hero.hp = derived.maxHP, hero.mp = derived.maxMP).
  Почему: персистентных HP/MP нет ни у наёмных (makeAlly hp=maxHP каждый бой),
  ни у Эфира (buildEfirUnit hp=maxHP); прецеденты restoreDay / фонтан — hero
  only. Ответ на Q3: формального сброса листов отряда (roster/эфир) НЕТ (был
  бы no-op + вне ТЗ).
- D5. Цена = 10 з. в ОБОИХ каталогах (таверна 10 / лагерь 10), catalog-driven
  (`особые_параметры.эффект.полный_отдых.цена`). Почему: одинаковая услуга →
  одинаковая цена (проще обосновать, пинать, отлаживать); каталог-драйвен →
  тюнинг БЕЗ кода (механизм позволяет 10/5 в будущем — решение D5 оставляет
  дверь открытой, но старт 10/10). Калибровка (a1): 10 з. ≈ 1 зелье лечения;
  полный restore 25 HP + 16 MP за 10 з. экономически сопоставим с 2 зельями,
  но экономнее; дешевле найма (40) и стройки таверны (45). Поле «цена» —
  паттерн 000147 (наставник); под `эффект` — конвенция параметров эффектов
  (слухи/выступление в 44, respawn_days/виды в 47). Ответ на Q1: 10/10, не
  10/5 (a3). Отклонён a1-ключ `ночёвка.стоимость` / a3-ключ
  `отдых_за_золото.стоимость` (имя под «Полный отдых» + «цена»).
- D6. Лимита раз-в-день НЕТ. Почему: как у бесплатного отдыха (44_rest/Костёр)
  — повтор в тот же день допустим (gold-лимитируемо); каталог раз_в_день НЕ
  меняется (44 остаётся {44_perform:true}, 47 — без); марки/ключи сейва не
  вводит. (Все 3 анализа согласны.)
- D7. available() НЕ пишется — золото строку НЕ гасит. Почему: прецедент R-2
  воскрешения 000162 (resurrectAvailable не читает gold; строка всегда
  доступна, отказ — в apply); строка `доступен: true` всегда; клик без
  золота → flash «мало золота (нужно N)» БЕЗ saveNow/марки/render.
- D8. Отказа при полном HP/MP НЕТ (плоская услуга). Почему: переплата —
  решение игрока, эксплойта НЕТ (каждое использование стоит 10 з.; после
  первого герой на максимуме → дальнейшие — чистая трата, рациональный игрок
  сам ограничивает). Ответ на Q5: подтверждено.
- D9. Архитектура — ЧИСТОЕ apply + тонкий спец-модуль. Почему: конвенция
  проекта для ВСЕХ платных эффектов (teleport 000075, mentor 000147,
  resurrect 000162, perform 000137); чистая логика (цена/золото/derived) —
  node-тестируема БЕЗ vm-песочницы; special делает live-мутацию. Отклонён
  a2 «без apply» (отклоняется от конвенции, нет node-тестируемого ядра).
- D10. Сообщение успеха (составляет ЧИСТОЕ apply, flash — r.message ПЕРВЫМ):
  «Полный отдых: HP и MP восстановлены (−N з.)» («−» — U+2212, формат
  «… (−N з.)» — building-actions.js:852). БЕЗ «день N» (день не проходит).
  Отказ — «мало золота (нужно N)» (точная существующая строка, плоская цена).
  Деградация — «недоступно» (нет цены / нет derived / нет hero). Дефенсивный
  отказ хендлера — «недоступно» (паттерн 44_rest) + дефенсивный gold-ре-чек
  «мало золота (нужно N)» (§3.4 п.3 — списание не уводит gold в минус).
- D11. e2e лагеря — РЕАЛЬНЫЙ мировой путь (CP-11 в camp-map-e2e.test.js,
  шаблон bootAndWalkToCamp, лагерь (−18,−12), 30 шагов < 40/день — день
  детерминированно не сменится). Почему: file уже доказывает детерминизм
  размещения лагеря (CP-7/CP-8); реальный путь покрывает placement + HUD +
  оверлей + действие одним сценарием. Отклонён синтетический tile-boundary
  (a1/a2) — слабее (не гоняет реальный путь), при том что walk детерминирован.
- D12. НОВОГО тестового ФАЙЛА нет (отклонён tests/building-effect-inn.test.js
  a1). Почему: конвенция — тесты эффекта живут в tests/building-effects.
  test.js (PF1–PF4, RES-A1..A6), UMD-гарды/порядок — tests/index-order.
  test.js (IO1/IO2) + building-actions.test.js (RES-BA*); меньше новых
  файлов — меньше merge-поверхности.

## 10. План реализации (по файлам, порядок в ветке task/000200)

ОДНА задача → финально ОДИН коммит (правило корня CLAUDE.md: «финально
оформлена в виде одного коммита, содержащего все изменения»). Промежуточные
коммиты по блокам — допустимы ВНЕШЬ workflow; ПЕРЕД стадией мержа ветка
task/000200 ОБЯЗАТЕЛЬНО схлопывается в ОДИН коммит на свежем master
(soft-reset на base + один коммит; мерж — без мерж-коммита). 1-я строка
«Задача 000200: …» (рус.), последний абзац — Co-Authored-By: Claude Code
<noreply@anthropic.com>. НИКАКИХ push.

1. Красные тесты (красная стадия): tests/building-effects.test.js (A1-юнион,
   re-пины A65/A55/A56/B26/B27/PF4, новые RG1–RG5 + RG-E1/RG-E3), tests/
   camp-map-e2e.test.js (CP-7 re-пин + CP-11), tests/index-order.test.js
   (список += тег + IO3) + memory/000200-fullrest.md (этот файл).
   Верификация: `npm test` → падают ровно: 9 новых (RG1–RG5, IO3, RG-E1,
   CP-11, RG-E3) + 9 re-пин-групп (A1, A65, A55, A56, B26, B27, PF4, CP-7,
   index-order «нужные модули подключены») — ВСЕ по одной осмысленной
   причине (нет EFFECTS['fullrest']/модуля/каталожных полей/тега); остальное
   (~2290) зелёные.
2. Каталоги 000044/000047.json (эффекты += fullrest, эффект.полный_отдых.цена
   10) + `node scripts/sync-buildings-data.js` (regen src/buildings.js) — один
   блок (иначе buildings/sync-all красные).
3. src/building-effects.js: запись EFFECTS['fullrest'] + ЧИСТОЕ ядро
   fullRestPrice/applyFullRest + экспорт в хвост.
4. src/building-effect-fullrest.js (новый UMD-спец-модуль) + index.html (тег
   после mentor.js, до hud.js).
5. (при необходимости) правки по итогам review-агентов / тестов.
6. CHANGELOG.md — пуллет в СУЩЕСТВУЮЩУЮ секцию «## 2026-10-13» / «### Игровой
   процесс» (формат по соседям; без программных деталей; дата = 2026-10-13):
   «**Полный отдых.** В таверне и лагере — платное действие «Полный отдых»:
   за золото (10 з.) Флогистон полностью восстанавливает здоровье и ману —
   день при этом не проходит. Отдохнуть можно сколько угодно раз, пока хватает
   золота.»
7. Задачные файлы: tasks/pending/000200.md → tasks/done/000200.md (move) +
   tasks/result/000200.md (краткий отчёт: ссылки на memory, тесты, коммиты).

Ожидаемая дельта (по файлам):
- assets/buildings/000044.json: +2 строки (1 id в эффекты + блок полный_отдых).
- assets/buildings/000047.json: +2 строки.
- src/buildings.js: regen (авто, ~+4 строки на 2 записи).
- src/building-effects.js: ~+70 строк (запись реестра ~+5, ядро ~+45, экспорт
  ~+3, комментарии).
- src/building-effect-fullrest.js: НОВЫЙ файл ~+120 строк (UMD-обёртка +
  fullRest + комментарии по образцу 44_perform).
- index.html: +2 строки (комментарий + тег).
- tests/building-effects.test.js: ~+380 строк (9-10 новых тестов + re-пины).
- tests/camp-map-e2e.test.js: ~+90 строк (CP-11 + re-пин CP-7).
- tests/index-order.test.js: ~+40 строк (IO3 + 1 строка списка).
- memory/000200-fullrest.md: НОВЫЙ (этот файл).
- CHANGELOG.md: +1 пуллет. tasks: move + result.

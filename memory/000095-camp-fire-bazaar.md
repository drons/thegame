# 000095: Лагерь — «Костёр» и «Барахолка» (+ фиксация моста/ворот id 50)

Статус: реализация + правки по итогам ревью сделаны на ветке
task/000095 (worktree .worktrees/task-000095, база master cab0d27).
Дальше — стадии .merge-pending → рибейз (плейбук — §5, обновлён
2026-10-03) → мерж.
Родительская: 000064 (эффекты «особых» построек). SPEC «Эффекты
построек» (L559–568) — источник истины: «Костёр» = clock.rest();
«Барахолка» — сток по паттерну 000029 (сид (тайл, день), respawn_days,
богатство тайла); NPC «кочевник» — новая запись (схема без изменений).
Решение по мосту/воротам (id 50) УЖЕ в SPEC (L565–568) — наша часть:
фиксация в memory, кода не требует.

Параллельные 000091/000092/000093/000094: только СВОИ ханки (конец
EFFECTS, слот спец-модулей index.html, A1-юнион-пин, бандл main.js) —
конфликты резолвятся на рибейзе по порядку тегов/записей. 000065
(наём) — УЖЕ в master: NPC-коллизия ТЗ снята фактом (схема стабильна,
ничего не трогаем).

## 1. Что добавлено / перенесено (файлы)

Код:
* `src/building-effects.js` — ДВЕ записи в КОНЕЦ реестра EFFECTS
  (после группы '40'/'42', ~L280):
      EFFECTS['fire']   = { имя: 'Костёр' };
      EFFECTS['market'] = { имя: 'Барахолка' };
  БЕЗ apply (сторона — в спец-хендлерах: apply обязан быть ЧИСТЫМ по
  снимку, а clock в снимке нет), БЕЗ разВДень (каталог без флага
  раз_в_день → без лимита — hasDailyLimit false; прецедент 000091:
  отдых без лимита).
* `src/building-effect-camp.js` — НОВЫЙ спец-модуль (ДЕЛЬТА к списку
  файлов ТЗ — обязательна контрактом 000128 §2.3: оба действия —
  мир-«стороны», невыразимые чистым apply). ОДИН модуль на ПОСТРОЙКУ
  (два хендлера) — минимальный merge-overlap с параллельными
  000091–000094 (каждая — свой файл).
* `src/items.js` — Дельта (ДЕЛЬТА к ТЗ, обязательная: текущий makeShop
  БЕЗ дня в сиде и shopKindsFor(47)=null — «сид (tile, day)» по 000029
  не выражается без новых функций): НОВЫЕ чистые функции + экспорты:
  CAMP_STOCK_SEED, makeCampShop, campStockDueRefresh,
  serializeCampStocks, restoreCampStocks. **makeShop / shopKindsFor /
  buyPrice / sellPrice / buyItem / sellItem НЕ ТРОГАЮТСЯ** (goldens
  items.test.js L670 и shopKindsFor-пины L642/659 — инвариант).
* `src/main.js` — состояние campStocks + campShopFor (рядом с
  npcStocks, L217); collectSaveData += раздел campStocks;
  restoreFromSave += try/catch-блок (паттерн 000072); deps-бандл
  buildingActions.init += campShopFor (1 строка); renderHud-ctx +=
  campShopFor (1 поле); __game += getter campStocks.
* `src/hud.js` — ветка лагеря в update() (ДЕЛЬТА к ТЗ: hud.js —
  ЕДИНСТВЕННЫЙ per-frame владелец setShop, 000130 — без ветки вкладка
  «Магазин» на лагере мёртвая: isShop false, makeShop(…,47,…) null).
* `assets/npc/000018.json` — НОВЫЙ (id `camp_wanderer`; ТЗ-имя
  «camp_wanderer.json» — shorthand на id ЗАПИСИ: файл обязан быть
  000018.json — нумерация жёстко запинена npc-data.test.js L55 +
  sync-regex ^\d{6}\.json$).
* `src/npc-data.js` — РЕГЕНЕРАЦИЯ (`node scripts/sync-npc-data.js`;
  npm-скрипта sync:npc НЕТ — только sync:all или прямой запуск).
* `assets/buildings/000047.json` — особые_параметры += эффекты +
  эффект (каталог — free-form, правки buildings/schema.json НЕТ).
* `src/buildings.js` — РЕГЕНЕРАЦИЯ (`node scripts/sync-buildings-data.js`
  = npm run sync:buildings). Каталог+зеркало — одной парой коммитов
  (паттерн 000055).
* `index.html` — 1 script-тег (слот после building-actions.js).
* SVG-графика — НЕ НУЖНА (спрайт лагеря — за генерацией, которую задача
  НЕ вводит; оверлей/панель — существующие классы).

Тесты:
* `tests/building-effects.test.js` — A1-юнион + новые A-тесты
  (НОМЕРОВАНИЕ: A-секция сейчас доходит до **A54** — новые стартуют
  с **A55**; B-секция до **B23** — новые с **B24**; числа A44–A52 из
  а-анализов УСТАРЕЛИ — A48–A54 заняты 000074).
* `tests/items.test.js` — кейсы makeCampShop/свежести/сериализации
  («кейсы как в 000029»).
* `tests/hud.js.test.js` — случай ветки лагеря.
* `tests/index-order.test.js` — модуль в «нужных» + пин порядка.
* `tests/npc-data.test.js`, `tests/assets-schemas.test.js`,
  `tests/buildings.test.js` — БЕЗ ПРАВОК (авто: нумерация, схема,
  зеркала после регенерации, ссылочная целостность).

Memory/отчёт/CHANGELOG:
* `memory/000095-camp.md` — короткий фикс (кочевник, стойки, костёр,
  мост/ворота 50).
* `tasks/result/000095.md` + перенос задачи в done — финальная стадия.
* `CHANGELOG.md` — entry на дату мержа (игрок-видимо: действия лагеря +
  новый NPC) — отдельный коммит.

Порядок загрузки (контракт):
  … → building-effects.js → building-ui.js → building-actions.js
  → **building-effect-camp.js (НОВЫЙ тег)** → hud.js → … → main.js.
  Саморегистрация спец-модуля — в момент СВОЕЙ загрузки (между
  building-actions.js и main.js): registerSpecial работает БЕЗ init
  (таблица — модульное поле; BA4). main.js снимает Game ОДИН раз
  (UMD-ловушка 000038) — тег ПОСЛЕ main.js = specials в НОВОМ объекте,
  который снапшот main.js не видит.

Пины tests/index-order.test.js:
  (а) «нужные модули» += 'src/building-effect-camp.js' (тех. правка);
  (б) новый тест: pos('src/building-effect-camp.js') !== -1;
      pos('src/building-actions.js') < pos('src/building-effect-camp.js');
      pos('src/building-effect-camp.js') < pos('src/main.js').
      Adjacency к hud.js/main.js НЕ закреплять (слот общий с
      000091–000094 — свой пин — своя задача, прецедент 000128).
  (в) vm full-chain (BA5/HU5/000130) подхватывают тег сами —
      errors.length === 0 (загрузка чистая).

## 2. Контракты

### 2.1 EFFECTS 'fire' / 'market'
* Записи: `{ имя }` БЕЗ apply, БЕЗ разВДень. effectIds(47) — из
  КАТАЛОГА: `особые_параметры.эффекты: ["fire", "market"]` (массив —
  первый каталог с 2 действиями; 1-к-1 запись EFFECTS['47'] НЕ
  используется). Порядок массива = порядок строк оверлея.
* buildingActions(record47, camp_wanderer, state) =
  [{id:'dialog',…}, {id:'fire', имя:'Костёр'}, {id:'market',
  имя:'Барахолка'}] — «Диалог» ПЕРВЫМ (существующее правило).
  buildingActions(record47, null, state) = ['fire', 'market'].
* hasDailyLimit(record47, 'fire'|'market') === false: в каталоге НЕТ
  флага раз_в_день, в записях нет разВДень → повторные действия в тот
  же день — ДОПУСТИМЫ (Б25 фиксирует: второй «Костёр» — ещё +1 день;
  buildingOncePerDay БЕЗ ключа 'x,y:fire').
* effectId-конвенция (000072): латиница, БЕЗ ':'/','/пробелов
  (registerSpecial-гард `/[:,\s]/` + ключ сейва 'x,y:effectId').
  'fire'/'market' — уникальны относительно параллельных 000091–000094
  ('rest' — 000091; фонтан/колодец/башня/развалины — 000092–94).

### 2.2 Каталог 000047 (source of truth, 000053)
    "особые_параметры": {
      "даёт": "костёр, торговля на барахолке",   // без изменений
      "эффекты": ["fire", "market"],             // НОВОЕ
      "эффект": {                                 // НОВОЕ
        "respawn_days": 1,
        "виды": ["food", "potion", "weapon", "armor"]
      }
    }
* `respawn_days: 1` — ДНЕВНАЯ ротация барахолки (ТЗ-тест «день
  сменился → новый сток» закреплён значением 1; SPEC-«по умолчанию 3»
  не применяется — значение явное в каталоге).
* `виды: ["food","potion","weapon","armor"]` — 18 СУЩЕСТВУЮЩИХ
  предметов (3 food + 5 potion + 7 weapon + 3 armor — сверено с
  каталогом, 42 предмета): «товары в дорогу». reagent/skill_book — не
  барахолка. wealth-3 «универсам»-ветка makeShop у лагеря НЕ
  воспроизводится (виды явные — каталог-драйвен).
* `map_index` / `размещение` / `размер` / `вход` — НЕ ДАВАТЬ (SPEC
  «Расширение карты»: новый map_index перераспределил бы слоты; лагерь
  НЕ генерируется — §4). id 50 (000050.json) — НЕ ТРОГАТЬ (резерв).

### 2.3 Сток барахолки (items.js — чистые функции)
* Свой сид-константа: `CAMP_STOCK_SEED = 0x43414d50` (ASCII «CAMP»;
  паттерн TELEPORT_TIE_SEED 0x54454c50 / STONE_ROLL_SEED 0x53544e52 —
  НЕ GLOBAL_SEED, НЕ сид makeShop 0x154075).
* `makeCampShop(x, y, day, wealth, record)` →
  `{ x, y, buildingType: 47, wealth, stock: {itemId: qty}, seed }` |
  null:
  * kinds = record.особые_параметры.эффект.виды, отфильтрованные по
    ITEM_KINDS, непустой массив; иначе (нет/битые/record null) →
    **null** (fail-open: каталог без видов — не магазин).
  * wealth = Math.max(0, Math.min(3, Math.floor(wealth || 0))) (кламп
    1:1 makeShop).
  * `seed = (hash2(x, y, CAMP_STOCK_SEED) ^ ((day + 1) * 0x9E3779B9))
    >>> 0` — сид (tile, day) по ТЗ; константа-множитель — золотое
    сечение, корреляция соседних дней мала; формула ЗАФИКСИРОВАНА
    golden-пином (A-тест).
  * pool = allItems().filter((it) => kinds.includes(it.kind)).
  * Вероятность/кол-во — 1:1 makeShop: `rng = mulberry32(seed)`;
    `if (rng() < 0.55 + 0.1 * wealth) stock[it.id] = 1 +
    Math.floor(rng() * (2 + wealth))`; магазин НЕ пуст:
    `if (!Object.keys(stock).length) stock[pool[0].id] = 1`.
  * buildingType: 47 — id КАТАЛОГА (не слот): заголовок вкладки
    buildingNameUi(47) → '' → готовый fallback 'магазин'
    (ui-tab-shop.js, правок НЕТ); **buy-only**: shopKindsFor(47) →
    null → sellItem отказывает «магазин не скупает такие предметы» +
    секция «продажа» в UI пуста (kinds = [] — осознанное решение,
    ТЗ молчит; осн: лагерь НЕ скупает — барахолка = привезли
    продавать).
* `campStockDueRefresh(entry, day, respawnDays)` → boolean (АБСОЛЮТНЫЕ
  дни, паттерн npcStocks/defeatedAt/000031 — БЕЗ арифметики циклов):
  * entry null/не-объект → true; day/entry.day не int≥1 → true;
  * `(day - entry.day) >= respawnDays` → true; иначе false.
* Состояние — **main.js** (владелец, паттерн npcStocks L217):
    const CAMP_ID = 47;
    const campStocks = {}; // 'x,y' → { day, stock, seed }
    function campShopFor(x, y, tile) { … }
  * КЛЮЧ стойки — тайл лагеря 'x,y' (НЕ id NPC; несколько лагерей —
    НЕЗАВИСИМЫЕ стойки; «новые лагеря не сбрасывают старые» — тест).
    Координаты — из тайла-ЛАГЕРЯ (см. 2.4): в живом потоке = тайл под
    игроком, в e2e = синтетический t.
  * campShopFor(x, y, tile) — СИГНАТУРА С ТАЙЛОМ (вызывающий передаёт
    результат tileAt): гард `!tile || tile.buildingId !== CAMP_ID →
    null` (hud.js от каталога НЕ зависит); wealth =
    tile.buildingWealth; rec = G.getBuilding(CAMP_ID);
    respawnDays = rec.особые_параметры.эффект.respawn_days (int≥1)
    else 1; entry = campStocks[key]; if (G.campStockDueRefresh(entry,
    clock.day, respawnDays)) → makeCampShop(x, y, clock.day,
    wealth, rec) → entry = { day: clock.day, stock: shop.stock,
    seed: shop.seed }; возврат wrap `{ x, y, buildingType: CAMP_ID,
    wealth, stock: entry.stock, seed: entry.seed }`.
  * stock — ССЫЛКА на entry.stock: buyItem мутирует in place
    (ui.js L226 — closure shop) → campStocks актуален →
    сериализация честная. setShop-обёртка НЕ клонирует stock
    (ui.js setShop: shop = s до key-гарда). Респаун — замена entry
    (новый объект stock) — допустимо.
  * ПОВТОРНОЕ ОТКРЫТИЕ «Барахолки» (т.ч. после «Костёр» → новый
    день): хендлер зовёт campShopFor (респаун по дню — entry свежая)
    → setShop(новый wrap) → toggle(true, 'shop') — render() ПЕРВИЧЕН
    за key-гард (setShop: shop = s ВСЕГДА; render — при смене
    ключа/событиях, а toggle(true) — событие) → панель не устаревает.
* Сериализация (items.js, плоские Game-экспорты, паттерн npc.js):
  * `serializeCampStocks(stocks)` → `{ 'x,y': { day, stock } }` |
    null: копия; entry не-объект/мусор — skip; day int≥1 (иначе
    entry skip); stock: int qty ≥ 0 (иначе skip); stocks не-объект
    → null (1:1 serializeNpcStocks). seed НЕ сериализуется
    (воспроизводится из (x,y,day)).
  * `restoreCampStocks(saved, day, tileAt, record)` →
    `{ 'x,y': { day, stock, seed } }` (fail-open, 000029/000072):
    saved не-объект → {}; ключ 'x,y' не парсится в два int → skip;
    entry не-объект → skip; entry.day не int≥1 → skip;
    **entry.day > day (МИР ДНЯ — подделка) → skip** (паттерн
    buildingOncePerDay/pruneQuestBookByDay); initial =
    makeCampShop(x, y, entry.day, tileAt(x, y).buildingWealth,
    record) (tileAt/каталог упали → try/catch → skip); qty:
    int≥0 → min(qty, initial), иначе initial; предмет вне initial
    (призрак/чужой день) — ОТБРОС; отсутствующий в снимке из initial
    — initial (000029). seed — из того же makeCampShop-вызова.

### 2.4 Раздел сейва `campStocks` (ИМЯ ЗАФИКСИРОВАНО)
* Форма: `{ 'x,y': { day: int≥1, stock: {itemId: int≥0} } }` —
  расширение паттерна npcStocks; неломкое расширение v1 (000031):
  версией НЕ поднимаем, миграций нет.
* collectSaveData (main.js, после buildingQuests):
      campStocks: G.serializeCampStocks
        ? G.serializeCampStocks(campStocks) : {},
  (комментарий «Задача 000095 … неломкое расширение v1»).
* restoreFromSave (main.js, try/catch-блок рядом с restore npcStocks
  L625-628, ПОСЛЕ buildingQuests — там map и clock.day готовы):
      try {
        const rawCamp = d.campStocks;
        if (rawCamp != null && G.restoreCampStocks) {
          const restored = G.restoreCampStocks(
            rawCamp, clock.day, (x, y) => map.tileAt(x, y),
            G.getBuilding(CAMP_ID));
          for (const k of Object.keys(campStocks)) delete campStocks[k];
          Object.assign(campStocks, restored);
        } else if (rawCamp != null) {
          console.warn('Сейв: раздел campStocks — restore недоступен — сбрасываю.');
        }
      } catch (err) { console.warn('Сейв: не удалось восстановить campStocks:', err); }
  * clear+assign in place — живые ссылки бандла не устаревают
    (контракт 000128 §2.2); битый раздел → warn + пусто, игра не
    роняется; старые сейвы БЕЗ секции → rawCamp null → без действия.

### 2.5 Спец-модуль src/building-effect-camp.js
* Чистый UMD (образец building-actions.js): node — module.exports
  `{ fire, market, register }` (без чтения Game); браузер —
  САМОРЕГИСТРАЦИЯ в момент загрузки:
      const BA = rootRef.Game && rootRef.Game.buildingActions;
      if (BA && typeof BA.registerSpecial === 'function') {
        BA.registerSpecial('fire', fire);
        BA.registerSpecial('market', market);
      } else {
        console.error('src/building-effect-camp.js: Game.buildingActions ' +
          'не найден — src/building-actions.js обязан грузиться ДО ' +
          'спец-модулей (задачи 000128/000095)');
      }
  В момент загрузки — НОЛЬ зависимостей: ни require, ни DOM, ни
  чтения Game, ни console (кроме ветки деградации), ни RNG.
* `fire(ctx)`:
      if (!ctx || !ctx.clock || typeof ctx.clock.rest !== 'function')
        return { ok: false, message: 'Костёр недоступен.' };
      ctx.clock.rest();
      return { ok: true };   // БЕЗ message!
  * rest() = steps=0 + advanceDay('rest') → onDay (main.js L659):
    G.restoreDay(hero) (HP/MP по SPEC «Игровое время»), респауны
    групп, playerUI.render, flash «День N.», saveNow.
  * **БЕЗ message — КРИТИЧНО**: пайплайн msg = r.message ||
    sres.message — свой flash ЗАТЯЛ бы onDay-flash «День N.»
    (hudFlash перезаписывается). r = null (запись без apply).
  * Пайплайн после: hasDailyLimit false → БЕЗ маркировки; saveNow()
    (двойной save с onDay — harmless, 1:1 будущий 000091); flash —
    НЕ пишется; playerRender().
* `market(ctx)`:
      const w = ctx.world; const g = w && w.game;
      if (!g || !g.playerUI) return { ok: true };   // деградация 000053
      const t = (ctx.t && typeof ctx.t === 'object') ? ctx.t : ctx.tile;
      const shop = (w && typeof w.campShopFor === 'function')
        ? w.campShopFor(t.x, t.y, t) : null;
      if (shop) g.playerUI.setShop(shop);
      g.playerUI.toggle(true, 'shop');
      return { ok: true };
  * Ключ стойки = координаты ТАЙЛА-ЛАГЕРЯ: в живом потоке ctx.t =
    tileAt(позиция игрока) (toggle() → openBuildingUI(t…)); в e2e —
    синтетический t (a3 §2.4). ctx.tile — позиция ИГРОКА — НЕ
    ключ (на реальном лагере совпадает; в e2e — другое место).
  * setShop СВЕЖИЙ wrap (респаун по дню внутри campShopFor) +
    toggle(true, 'shop') — панель открывается/перерисовывается на
    вкладке «Магазин». БЕЗ message (панель = отклик, flash не нужен).
  * buy-only: секция «продажа» пуста (shopKindsFor(47) null — 2.3).
* Хендлеры НЕ снимают Game при загрузке — только registration; весь
  доступ к миру — через ctx (узкие точки) + ctx.world (escape-hatch
  000128 §2.5 «допуск, а не рекомендация»): playerUI/campShopFor
  нет в стандартных узких точках → world. Бандл расширяем ТОЛЬКО под
  campShopFor (одна строка) — playerUI берётся из world.game.

### 2.6 Узкие точки (правки main.js — ЕДИНСТВЕННЫЕ)
* deps-бандл G.buildingActions.init (L758-780) += 1 строка:
      campShopFor, // (x, y, tile) → wrap | null (000095: сток
                   // барахолки 'x,y'; респаун по clock.day)
* renderHud-ctx (L1424-1436) += 1 поле:
      G.hud.update({ …, campShopFor, … });
* __game (L1494+) += getter (паттерн get npcStocks L1546):
      get campStocks() {
        return JSON.parse(JSON.stringify(campStocks));
      }
  (ГЛУБОКАЯ копия — stock-объекты общие с wrap-перами; тестам нужен
  неизменяемый снимок).
* Ограничение 000128 §2.3 «main.js НЕ правится» — ПЕРЕОПРЕДЕЛЕНО
  файлами ТЗ (состояние + раздел сейва ТЗ-пунктом 3 живут в main.js);
  BA7-пин (main.js не содержит символ `onBuildingAction`) — СОХРАНЯЕТСЯ.

### 2.7 HUD-ветка (src/hud.js update(), L213-225)
    if (ctx.game.playerUI) {
      const isShop = !ctx.dungeonState && ctx.tile.hasBuilding
        && ctx.game.shopKindsFor(ctx.tile.building);
      const campShop = !ctx.dungeonState && ctx.campShopFor
        ? ctx.campShopFor(ctx.player.x, ctx.player.y, ctx.tile) : null;
      ctx.game.playerUI.setShop(isShop
        ? ctx.game.makeShop(ctx.player.x, ctx.player.y,
          ctx.tile.building, ctx.tile.buildingWealth)
        : campShop);
    }
* setShop — ВСЁ ЕЩЁ 1×/кадр (HU4-пин цел); порядок строка → setShop
  → textContent 1:1; ctx.tile — tileAt ОДИН раз на кадр (000129:
  tileAt в hud-модуле НЕ вызывается — тайл ПЕРЕДАЁТ main.js).
* Существующие тесты hud (ctx БЕЗ campShopFor) → campShop null →
  ветка мертва → поведение 1:1 (регрессия).
* Заголовок/комментарии: header hud.js (список полей ctx) +=
  campShopFor; контракт 000129 «14 полей» → 15 (ОПЦИОНАЛЬНОЕ поле —
  задокументировано в этом файле).

### 2.8 NPC camp_wanderer (assets/npc/000018.json)
    {
      "id": "camp_wanderer",
      "имя": "Кочевник",                 // уникально в каталоге
      "роль": "странствующий торговец",  // строка (прецедент 000011)
      "описание": "<1–2 строки лора: повозка, костёр, барахолка>",
      "постройки": [47],
      "диалог": [
        { "id": "prives", "текст": "<фраза>", "действие": "подсказка" },
        { "id": "trade", "текст": "<фраза>", "действие": "торговля" }
      ],
      "торговля": { "предметы": [
        { "предмет": "bread",          "цена_покупки": 3,  "цена_продажи": 2, "количество": 8 },
        { "предмет": "meat",           "цена_покупки": 6,  "цена_продажи": 4, "количество": 5 },
        { "предмет": "honey_cake",     "цена_покупки": 10, "цена_продажи": 6, "количество": 3 },
        { "предмет": "minor_healing",  "цена_покупки": 5,  "цена_продажи": 3, "количество": 5 },
        { "предмет": "healing_potion", "цена_покупки": 12, "цена_продажи": 8, "количество": 3 }
      ] }
    }
* ВСЕ id предметов СУЩЕСТВУЮЩИЕ (каталог 42 предмета); набор —
  «продовольствие в дорогу», УНИКАЛЕН среди 17 (Хольд — reagent-сырьё)
  — не ломает «разные наборы торговцев» npc-data.test.js.
* Связка «Диалог» — БЕЗ НОВОГО КОДА: npcForBuilding(NPCS, 47) →
  camp_wanderer (000071); fallback роутера 'dialog'
  (building-actions.js L302-308); openNpcDialog payload:
  shop: deps.npcShopFor('camp_wanderer') — NPC-сток (система a)
  создаётся лениво и сериализуется в data.npcStocks АВТОМАТИЧЕСКИ
  (restoreNpcStocks знает NPC из каталога).
* ДВЕ СИСТЕМЫ ТОРГОВЛИ (НЕ ПУТАТЬ): (a) NPC-диалог — фиксированная
  витрина, ключ — npcId, ОБЩАЯ на ВСЕ лагеря (документировать:
  «все лагеря делят сток кочевника»); (b) барахолка — сток тайла,
  ключ 'x,y', независимые стойки. Вкладки разные (npcUI «торговля»
  vs панель [I] «Магазин»).
* schema.json НЕ ТРОГАТЬ (доп. поля = правка схемы; новая ЗАПИСЬ по
  существующей схеме — не правка; постройки max 50 — 47 влезает).

## 3. Ленивые ссылки и guards (сводка)

* building-effect-camp.js: ноль require/Game-чтений при загрузке;
  гард регистрации (нет buildingActions → console.error + без
  регистрации, игра не падает — 000053); fire-гард (нет ctx.clock.
  rest → {ok:false} — не ожидается, защита); market-гард (нет
  world.game.playerUI / campShopFor → {ok:true} — тихо, деградация).
* main.js campShopFor: G.getBuilding/rec/эффект — лениво при вызове;
  record null / виды битые → makeCampShop null → campShopFor null
  (без краха).
* hud.js: ctx.campShopFor — ОПЦИЯ (нет → ветка мертва, 1:1).
* restore: per-секция try/catch + console.warn (000072); fail-open —
  битый раздел не роняет игру.
* Детерминизм: ноль Math.random/Date; seed — ТОЛЬКО (x, y, day) через
  hash2/mulberry32 (существующие).

## 4. Границы и ограничения (ВАЖНО будущим задачам)

* **ЛАГЕРЬ НЕ ГЕНЕРИРУЕТСЯ на карте** (нет map_index/размещения/
  подтипа/города; SPEC «Расширование карты»: новые map_index нельзя;
  tileAt — ЧИСТАЯ функция координат — тайл «поставить» нельзя).
  Функция «дремающая»: в живом геймплее игрок на лагере НЕ
  оказывается. СЛЕДСТВИЯ:
  * e2e-тесты — через ГРАНЬ building-actions с СИНТЕТИЧЕСКИМ тайлом:
    openBuildingUI(t, b, npc) / onBuildingAction(action, t, b, npc)
    (публичные; t = { x, y, hasBuilding: true, building: <слот>,
    buildingId: 47, buildingWealth: w }; b = getBuilding(47);
    npc = camp_wanderer из каталога; паттерн BA4/B3);
  * hud-ветка и e2e-путь — ИНФРАСТРУКТУРА под будущую генерацию.
  * НЕ «чинить» отсутствующую генерацию в этой задаче (ТЗ её не
    требует; map.js вне файлов ТЗ). **OPEN QUESTION ОРКЕСТРАТОРУ**:
    генерация/размещение лагеря — отдельная будущая задача (аналог
    «мост → города 000052»); при её появлении campShopFor/hud-ветка
    работают без правок (тайл с buildingId 47 + buildingWealth —
    уже поддерживаются).
* **МОСТ/ВОРОТА (id 50) — РЕШЕНИЕ (фиксация; SPEC L565-568 уже
  содержит текст 1:1)**: отдельного объекта на глобальной карте НЕ
  генерируется — проходы закрыты стационарными группами мобов
  (MOB_GROUP_TYPES, map.js; генерация групп НЕЗАВИСИМА от построек —
  отдельный hash). Мост/ворота — элемент ГОРОДОВ (задача 000052).
  Запись 000050.json остаётся РЕЗЕРВИРОВАННОЙ (не генерируется,
  map_index не даётся) — НЕ ТРОГАТЬ.
* Сток барахолки — buy-only (см. 2.3); продажи лагерь НЕ принимает.
* Сейв v1: версия НЕ поднимается (000031); раздел campStocks —
  неломкое расширение; имена разделов зафиксированы.
* Новые предметы/ассеты — НЕ ВВОДИТЬ (ТЗ: торговля из существующих
  id; SVG — не нужен).

## 5. Merge-заметки (рибейз на свежий мастер перед мержем)

ОБНОВЛЕНО 2026-10-03 по итогам ревью (finding major «A1-юнион-пин
конфликтует с актуальным мастером»): старая версия этого раздела
(«union значений», «негативный пин '39' НЕ ТРОГАТЬ — 000077 не
смержен») УСТАРЕЛА — 000077/000093/000094/000109 УЖЕ в мастере,
форма A1-пина на мастере ИЗМЕНЕНА (форм-пин членства вместо точного
deepEqual, негативного пина '39' НЕТ). На ветке (база cab0d27)
всё зелёно; конфликт проявляется ТОЛЬКО на рибейзе — резолвить
ПО ПОЛЕБУМЕ НИЖЕ, не по старым пометкам.

Мастер на 2026-10-03 — 9c313df (Мердж: task/000109). Смержено ПОСЛЕ
нашей базы cab0d27: 000084 (миникарта союзников), 000099
(настройки на лету, main.js +40), 000083 (наём: ui.js +173, main.js
+17), 000093 (башня '46': building-effects +245, hud.js +15,
main.js +47), 000077 (храм '39'/круг '43': building-effects +373,
main.js +115, index.html +6), 000114 (боевой UI), 000094 (развалины
'48': building-effects +236, index.html +6, main.js +3), 000107
(main.js +56), 000085 (сейв ростера: main.js +125, 2 мержа),
000109 (сейв/респаун городов: main.js +154, cities.js, save-тесты,
global-settings). НЕ смержено: 000091 ('rest' таверны), 000092
(фонтан/колодец) — worktree'ы стоят; если смержатся ДО нашего
рибейза — их id'ы попадают в union (пункт (a)).

Плейбук рибейза (по порядку):
* (a) A1 (tests/building-effects.test.js) — СТРУКТУРНЫЙ конфликт
  тех же строк (на ветке: точный deepEqual
  ['36','37','38','40','41','42','fire','market'] + негативный
  пин «'39' НЕ в реестре»; на мастере: форм-пин членства,
  MERGED/UNION, негативного пина НЕТ — '39' В реестре, 000077).
  Резолв: ВЗЯТЬ ФОРМУ МАСТЕРА и регенерировать состав по
  фактическому реестру (Object.keys(BE.EFFECTS) на мастер-основе),
  т.е.
      const MERGED = ['36','37','38','40','41','42','46','48',
                      'fire','market'];
      const UNION  = ['36','37','38','39','40','41','42','43',
                      '46','48','fire','market'];
  ТОЧНЫЙ deepEqual и негативный пин '39' — УБРАТЬ; комментарий
  мастерский сохранить + строку «000095 добавляет 'fire'/'market»
  (прецедент 000077/000093/000094: «пин регенерирован по
  фактическому коду»). Если в момент рибейза в мастере уже есть
  000091/000092 — union += их id'ы (000091: 'rest'; 000092:
  фонтан/колодец/… — сверить с реестром).
* (b) Конец EFFECTS (src/building-effects.js): удержать ОБА ханка —
  запись мастера EFFECTS['48'] (000094) + наш блок 'fire'/'market'
  (union; наш блок — ПОСЛЕ чужих записей, как было в ханке).
* (c) index.html, слот спец-модулей (между building-actions.js и
  hud.js): 000094 вставил src/building-effect-48.js — РЯДОМ в том
  же слоте (как раз наш регион). Удержать ОБА тега; порядок
  спец-модулей взаимно НЕ фиксируется — любой допустим; наш пин
  требует ТОЛЬКО building-actions < building-effect-camp < main.
* (d) main.js — конфликтных зон БОЛЬШЕ, чем в старой заметке
  (после базы смержились 000099/000083/000093/000077/000094/
  000107/000085/000109 — все трогают main.js). Наши ханки и их
  регионы: campStocks/campShopFor (рядом с npcStocks),
  collectSaveData += раздел 'campStocks', restoreFromSave +=
  try/catch-блок 'campStocks', deps-бандл buildingActions.init +=
  campShopFor (1 строка), renderHud-ctx += campShopFor (1 строка),
  __game += getter campStocks. Резолв: наши строки/блоки — union с
  чужими (разделы сейва 'campStocks' и 'cities' (000109) / ростер
  (000085) — РАЗНЫЕ ключи, не перемешивать); бандл/renderHud —
  наши 1 строка каждая рядом с чужими. Строчные номера стары —
  ориентироваться по якорям (имена функций/ключи).
* (e) hud.js — 000093 правил hud.js (+15) — проверить
  нет-пересечения с нашей веткой лагеря в update() (регион
  setShop); наша поправка ревью (lastCampSeed) — там же.
* (f) После рибейза — ПОЛНЫЙ npm test (все зелёные; на ветке
  до рибейза — 1365) + прогон vm-полных-цепей (BA5/HU5/B-серия).
* 000092 расширяет hasDailyLimit — если смержится первой: наш
  контракт «каталог без флага = без лимита» должен сохраниться
  (адаптироваться под новый контракт, не меняя поведение лагеря).
* 000065 — уже в master (коллизия снята); NPC-схема НЕ трогалась;
  если на рибейзе 000065-подзадачи добавят NPC — файл кочевника
  станет 000018+ — проверить ПОСЛЕДНИЙ номер (ТЗ: при конфликте
  merge — ЖДЁМ 000065).

## 6. Подводные камни (исполнителям)

1. UMD-ловушка 000038: тег ПОСЛЕ main.js → specials зарегистрируются
   в НОВОМ Game, который снапшот main.js не видит → молча нет
   действий. Ловят: пин index-order + B24.
2. setShop key-гард (ui.js L388): `shop = s` — ДО гарда (обновление
   ссылки ВСЕГДА); render — при смене ключа/событиях. Обёртка
   НЕ клонирует stock (иначе покупки терялись бы — buyItem мутирует
   in place; ui.js L226). Респаун — замена entry (новый stock) —
   ок.
3. «Костёр» — БЕЗ message в результате хендлера (иначе flash
   затирает «День N.»); rest() сам шлёт onDay-flash + saveNow.
4. buildingOncePerDay — НИКАКОЙ маркировки лагерных действий (лимитов
   нет) — B25 фиксирует (иначе будущий «раз в день» крадёт повторный
   отдых).
5. tileAt — чистая функция координат: НЕ пытаться «поставить» лагерь
   мутацией карты в e2e (не сработает — новый объект тайла на
   каждом вызове). E2E — только через ГРАНЬ с синтетическим t.
6. Ключ стойки в e2e — координаты СИНТЕТИЧЕСКОГО t (ctx.t), НЕ
   позиции игрока (ctx.tile = deps.player — может быть в другом
   месте): читать __game.campStocks['<t.x>,<t.y>'].
7. npm test — ТОЛЬКО в worktree (memory/test-runner-worktrees.md);
   флейк vm-теста — один перепуск файла + запись в отчёт.
8. Зеркала (buildings.js, npc-data.js) — регенерировать СКРИПТАМИ,
   не руками (byte-пины); каталог+зеркало — одной парой коммитов
   (000055). npm-скрипта sync:npc НЕТ: `node scripts/sync-npc-data.js`
   (или npm run sync:all).
9. effectId 'fire'/'market' — латиница без ':'/','/пробелов
   (registerSpecial-гард + ключ сейва 'x,y:effectId').
10. makeCampShop — record ПЕРЕДАЁТСЯ параметром (не каталог-lookup):
    node-тесты не зависят от Game; каталог-драйвенность — на уровне
    вызывающего (main.js: G.getBuilding(CAMP_ID)).

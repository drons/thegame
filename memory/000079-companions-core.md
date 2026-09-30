# 000079: ядро отряда src/companions.js — закреплённые решения

Задача: ЧИСТЫЙ UMD-модуль ядра отряда (найм, отказ, увольнение,
жалованье, лояльность, уход), без DOM и game-state (паттерн
src/npc.js). Родитель — 000065 (memory/000065-companions-plan.md);
данные найма — 000078 (memory/000078-npc-hire-data.md).

## Модуль и стабильный API (000083/000085/000087 опираются)

* src/companions.js; браузер — **Game.companions (СТРОЧНОЕ имя)**,
  node — require(). Guards при отсутствии global-settings/perlin/npc
  (паттерн day.js).
* Экспорт: `createRoster, canHire, hire, canDismiss, dismiss,
  wagesTotal, payWages, loyaltyTick, candidatesForTavern, eventSeed`.
* index.html — ПОСЛЕ npc.js, ДО combat.js/ui.js/main.js (UMD-ловушка
  000018/000038: потребители снимают const G = Game при загрузке).
  Пин — tests/index-order.test.js (000079).
* **Запись отряда ЗАФИКСИРОВАНА под сейв 000085: ровно
  {npcId, level, xp, loyalty, hiredDay}** — 000082/000085 по этим
  полям. «Призраки» (npcId нет в каталоге) — тихий skip (не падает,
  не отбрасывается); валидация — 000085.
* `hire(roster, npc, character, day)` →
  **{ok:true, entry, loyalty} | {refused:true, reason} | {ok:false,
  reason}**. Отказ ({refused:true}) — НЕ сбой canHire ({ok:false} для
  disabled-кнопок, reason — человекочитаемый); 000083 по флагу `refused`
  пишет текст в npcLog. При отказе золото НЕ списывается.
  Лояльность новичка: min(100, 50 + Харизма, 1:1).
* `payWages(roster, npcs, character, day)` (= `loyaltyTick`,
  экспорт-алиас — 000087 пишет «payWages / loyaltyTick») →
  {paid, total, events}. events: [{type:'wages_paid'|'wages_unpaid',
  total}] + [{type:'left', npcId}] (в порядке отряда) — 000087 пишет
  сообщения по ним. **total = 0 (пустой отряд / одни «призраки») →
  events:[] — события НЕТ** (правки ревью c64c12f: иначе 000087
  написал бы «выплачено жалованье 0»); guard полный — при total = 0 и
  gold ≥ 0 unpaid-ветка недостижима. Неоплата: золото не списывается,
  −20 (floor 0), уход проверяется по НОВОЙ лояльности.
* Лояльность всегда в 0…100 (cap 100 при +2 за оплату, floor 0 при −20).
* `candidatesForTavern(npcs, roster, deadMercs)` — через
  Npc.hireCandidates (000078): найм-данные, не нанят, не мёртв;
  порядок каталога, возвращаются ССЫЛКИ на записи каталога.
* Увольнение: возврат денег НЕТ; повторный найм возможен (даже в тот же
  день — тот же (день, npcId)-сид отказа).

## Детерминизм (ВАЖНО, зафиксировано)

* «Мирового» rng в main.js НЕТ — НЕ вводить. Сид события =
  **perlin.hash2(day, npcKey(npcId), константа_события)**, бросок =
  **perlin.mulberry32(seed)()** — одно значение [0,1) на НОВОМ
  генераторе, без глобального состояния. Тот же (день, npcId) → тот же
  исход; повторная попытка найма в тот же день — тот же исход отказа
  (воспроизводимость, НЕ баг — UI-лог 000083 учитывает).
* **npcKey — FNV-1a строка→uint32 ОБЯЗАТЕЛЕН**: perlin.hash2(day,
  СТРОКА) ВЫРОЖДАЕТСЯ (Math.imul(NaN) → 0 — проверено:
  hash2(5,'merc_volk') === hash2(5,'merc_anna')) — без npcKey все
  наёмники имели бы ОДИН сид на день, отказы/уходы синхронизировались.
  Вырождение зафиксировано тестом.
* Разные события — разные константы (3-й аргумент hash2):
  SEED_REFUSE = 0x72656675 ('refu'), SEED_QUIT = 0x71756974 ('quit').
* Золотые пины в tests/companions.test.js: REFUSE_DAYS_MERC_TEST
  (дни 1..100, merc_test, 30%), REFUSE_DAYS_MERC_VOLK (1..50),
  SEED_PIN_REFUSE_VOLK_D1 = 84935682, SEED_PIN_QUIT_ASHKA_D3 =
  4240972129, QUIT_LEAVE_DAY = 3 (roll 0.48078 < 0.5 — уйдёт),
  QUIT_STAY_DAY = 1 (roll 0.91126 ≥ 0.5 — останется). Смена
  формулы/констант = ре-пин пинов (тест держит НЕЗАВИСИМУЮ копию
  схемы — npcKey + myEventSeed).

## Настройки (src/global-settings.js)

* `max_companions: 3`; `companion_loyalty: {start:50, paid:2,
  unpaid:20, quit_low:20, quit_high:40, quit_chance_mid:0.5}`;
  `companion_refusal: {base:0.30, charisma_per_level:0.02,
  artist_per_level:0.05}`. Доли (не проценты) — как
  combat_difficulties.
* **Читаются ЖИВО при каждом вызове** (не захват при загрузке) —
  паттерн combat.js/live-чтения level_delta_max; тесты меняют SETTINGS
  без перезагрузки модуля.
* **companion_xp_share НЕ здесь — добавляет 000082** (тот же ре-пин
  списка ключей tests/global-settings.test.js).
* Точка конфликта при ребейзе: tests/global-settings.test.js —
  список ключей SETTINGS (наши companion_* + combat_obstacle_* от
  000050) — union; помечено комментарием в тесте. src/global-settings.
  js — оба блока вставлены после city_channel — union.

## Тесты

* tests/companions.test.js (33): API, форма записи, найм (лимит,
  золото, дубль, границы), отказ (0% на границах Харизмы/Артиста,
  база 30% + золотые пины, воспроизводимость), лояльность новичка
  (50+Харизма, cap 100), eventSeed (пины схемы, разные npcId →
  разные сиды), жалованье (оплата +2/cap 100, неоплата −20/floor 0,
  границы gold = цене/жалованью — инвариант gold ≥ 0, total = 0 →
  событий нет), уход (≤20 верно, 21…40 — 50% по сиду, >40 остаётся),
  призраки, увольнение + повторный найм, candidatesForTavern (правила
  + реальный каталог — ровно 6 наёмников в таверне 44), детерминизм
  (два независимых прогона сценария — идентично), браузер (цепочка
  index.html → Game.companions; guard без зависимостей).
* tests/global-settings.test.js (+1): ключи/значения спутников.
* tests/index-order.test.js (+1): порядок подключения.

## Для следующих задач (блок 000065)

* **000080** (боевые союзники): makeAlly в src/combat.js — статы из
  найм.dmg/hp/armor (множители, как MOB_TYPES — memory/000078);
  запись отряда читать, не менять.
* **000082** (рост статов/xp): companion_xp_share в SETTINGS +
  ре-пин списка ключей; level/xp — уже в записи отряда.
* **000083** (UI): G.companions (СТРОЧНОЕ имя); disabled по
  canHire/canDismiss.reason; найм/жалованье подвесить на вкладке
  «найм» 000078 (Game.npcUI); npcLog-текст по {refused:true}.
* **000085** (сейв): компонент companions — записи как есть (форма
  зафиксирована), dead_mercs — отдельный компонент (используется
  candidatesForTavern); CURRENT_VERSION.
* **000087** (смена дня в мире): вызвать
  loyaltyTick(roster, npcs, character, day) при смене дня; сообщения
  игроку — по events (wages_paid/wages_unpaid/left).
* НЕ трогали: src/npc.js (использован API 000078), save.js, main.js,
  src/ui.js, src/combat.js, SPEC.md, assets.

## Риски мержа (на момент Finalize)

* Базовый коммит ветки — ae0b26d (мерж 000067); после него в мастер
  замерджены 000104, 000097, 000050, 000034, 000068 — перед мержем
  ОБЯЗАТЕЛЬНА перебазировка + повторный npm test.
* src/companions.js / tests/companions.test.js — файлы только этой
  задачи, конфликтов не ожидается.
* src/global-settings.js + tests/global-settings.test.js — union с
  combat_obstacle_* (000050) — см. выше.
* index.html / tests/index-order.test.js — разные ханки (000104
  cities.js, 000097 CSS) — авто-мерж вероятен, проверить порядок.

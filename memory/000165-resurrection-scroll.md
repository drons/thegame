# 000165: Свиток воскрешения — предмет resurrection_scroll (быстрый слот)

Дата: 2026-10-07. Worktree `.worktrees/task-000165`, ветка `task/000165`,
база = master `dd9c0e8` (000163 смержен: `resurrectAlly` в combatInternals).
ТЗ — `tasks/pending/000165.md`. Контракт D6 — `memory/000156-resurrection-
design.md`; ядро — `memory/000163-resurrection-spell.md` (§3.2/§5).
Компактная карточка предмета — `memory/000165-resurrect-scroll.md`.

НОВОГО МОДУЛЯ НЕТ: index.html/script-теги/SVG — без изменений; vm-
песочницы подхватывают правки цепочкой `<script>` автоматически.

## 1. Что добавлено / изменено / переиспользовано

**Добавлено**
* `assets/items/000051.json` — 51-й предмет каталога: `resurrect_scroll`,
  «Свиток воскрешения», kind `resurrection_scroll` (НОВЫЙ kind),
  effect `{kind:'resurrect'}` (НОВЫЙ effect-kind), weight 0.5, value 150,
  нестаккуемый (вне STACKABLE).
* `assets/items/schema.json` — 2 enum (append в конец): kind +=
  `resurrection_scroll`; effect.kind += `resurrect`.
* `src/items.js` — 4 точки: `ITEM_KINDS.RESURRECTION_SCROLL`,
  `EFFECT_KINDS.RESURRECT`, ветка `validateItem`, ветка `useItem` (мир —
  отказ «только в бою»).
* `src/combat.js` — 3 точки: ветка `playerQuickItem` (бой — воскрешение),
  зеркало `canDoAction` 'quickItem' (обязательное, 000037), per-mob лут
  `MOB_TYPES.abomination` += `{item:'resurrect_scroll', chance:0.05}`.
* `assets/mobs/000036.json` — loot Уродства += свиток (source of truth;
  зеркало в combat.js — один коммит).
* `src/items-data.js` — РЕГЕН `npm run sync:items` (51 запись).
* Тесты: `tests/items.test.js` (I1/I2 + тех-ре-пин makeShop golden),
  `tests/combat.test.js` (C1-C6), `tests/assets-schemas.test.js` (I3).
* `CHANGELOG.md` — на стадии мержа (отдельный коммит, дата = день мержа):
  новый предмет + боевое применение (быстрый слот), лут Уродства.

**Изменено (технический ре-пин, 1 шт.)**
* `tests/items.test.js` makeShop golden (30,40,WEAPONS_SHOP,wealth 3,
  пул allItems): сток += `resurrect_scroll: 5` (СИМУЛЯЦИЕЙ ПРОВЕРЕНО на
  станции: база воспроизводит golden byte-identical; новый предмет —
  КОНЕЦ пула (rng-хвост) → существующие ключи стока НЕ сдвигаются;
  паттерн ре-пина 000133). Прочие 5 goldens (kind-фильтрованные) и
  makeCampShop (виды 000047: food/potion/weapon/armor) — БЕЗ ПРАВОК.

**Переиспользуется (НЕ дублировать)**
* `resurrectAlly(c, t)` — combat.js L905 (000163): `alive=true`,
  `hp=round(maxHP/2)`, лог «Возвращён в бой.» (R-3, закреплена), НОЛЬ
  `c._rng`. Ветка playerQuickItem вызывает его ПРЯМО (function-
  декларация, hoisting) — межмодульных зависимостей НЕТ.
* `I.hasItem/I.getItem/I.removeItem/I.quickItem` (items.js) — гварды/расход.
* Паттерн «отказ — действие не сгорает» (playerQuickItem L1234-1237).
* Валидационный контур schema.json + `sync-items-data.js` +
  `validateItem` (расширение enum, не новый механизм).
* Доступность — универсам (wealth 3, пул `allItems()`, items.js makeShop)
  продаёт предмет АВТОМАТИЧЕСКИ, без правок.

## 2. Решения станции (openQuestions закрыты)

* **Р-1. Источник (ТЗ п.4 «Лут/торговцы — по флагам каталога (000132)»)
  — per-mob лут УРОДСТВА** (`assets/mobs/000036.json` + зеркало
  `MOB_TYPES.abomination` combat.js L151): `{item:'resurrect_scroll',
  chance:0.05}` КОНЦОМ массива loot (порядок дропа = порядок таблицы).
  Почему: (а) ТЗ цитирует 000132 = per-mob таблицы `u.loot` (+пулы;
  пулы LOOT_* — food/potion/skill_book/weapon-armor, свитку не подходят
  и в них НЕ попадают — N6 deepEqual-пины состава); (б) виды магазинов
  (buildings) — территория 000162 + запрет «building-* не трогать»;
  (в) сундуки подземелий (прецедент 000133) — сдвигут rng-выбор сундуков
  (предметы 6→7) и потребуют ре-пины dungeon golden + FALLBACK-литерал +
  реген dungeons-data.js — шире ТЗ; (г) универсам allItems — продаёт
  авт. (бонус, не источник); (д) тематика: Уродство = склеенный труп,
  уже дропает phoenix_feather (0.2) + greater_healing (0.15); доступен
  в группе 6 «Дух бездны» и как босс Бездны (dungeons 000005) — поздняя
  игра под value 150. РЕ-ПИНЫ существующих лут-пинов НЕТ (проверено
  grep'ом: N1-N6 — wolf/orc_mad; все упоминания abomination в тестах —
  mobIds/dmg-калькуляции, лут-составов не пинуют). RNG: +1 `c._rng`
  ТОЛЬКО за поверженного Уродства (цикл по таблице в rollVictoryLoot) —
  потоки детерминизма без Уродства не сдвигаются.
* **Р-2. Строка отказа «нет погибших союзников» ЗАКРЕПЛЕНА** (ТЗ её не
  фиксирует; пин C3/C5). Предикат мёртвого союзника =
  `u.side==='ally' && !u.alive && !u.fled` — ТОТ ЖЕ, что у правила
  выбора цели 000163 (R-1): сбежавший — не цель (не мёртв, ушёл из
  боя). Игрок НЕ в c.units — свиток его НЕ воскрешает (v1, D6; спасение
  игрока — Аэфир 000164).
* **Р-3. Лог успеха = строка resurrectAlly «Возвращён в бой.» (R-3
  000163) — ДОПОЛНИТЕЛЬНОЙ строки НЕТ.** ТЗ «+ log» закрыта ядром;
  вторая строка = лишний пин-поверхностный след («не больше, не меньше»).
* **Р-4. Зеркало canDoAction 'quickItem' ОБНОВЛЯЕТСЯ — ОБЯЗАТЕЛЬНО**
  (контракт 000037: «при изменении проверок в playerQuickItem —
  обновлять canDoAction синхронно; reason — дословными формулировками
  ядра»). Без зеркала кнопка [Q] активна при живых-только, а ядро
  отклонит — нарушение 000037. Ветка — чистое чтение c.units
  (canDoAction без побочных эффектов). Зеркало 'invItem' (whitelist
  potion/food/skill_book) — БЕЗ ИЗМЕНЕНИЙ (ТЗ: playerInvItem не
  расширяется).
* **Р-5. Размещение ветки — МЕЖДУ разрешением itemId (L1231) и общим
  `c.ps.quickItem -= 1` (L1232)**, т.е. ПЕРЕД I.useItem (ТЗ/D6).
  Отказ — return БЕЗ прикосновения к пулу (действие не сгорает — ноль
  кода возврата; альтернатива «ветка после L1232 + три `+= 1` на
  отказы» отклонена: каждый restore — точка потенциального бага).
  Успех — `c.ps.quickItem -= 1` СНАЧАЛА (ТЗ: «пул quickItem −1
  (СНАЧАЛА, как в текущем коде)»), затем `resurrectAlly`, затем
  `removeItem(p, it.id, 1, true)` — порядок «эффект → расход» тот же,
  что в useItem (potion-путь и spell_scroll-ветка :531 вызывают
  removeItem после эффекта, БЕЗ проверки ok — hasItem-гвард выше
  гарантирует успех; кодбаз-паттерн).
* **Р-6. Гвард hasItem — ОБЯЗАТЕЛЕН в начале ветки.** Ветка обходит
  I.useItem, где hasItem-гвард стоит первым (items.js L502);
  sanitizeInventory может оставить quick-слот на id каталога БЕЗ слота
  в slots (битый сейв) → без гварда воскрешение сработало бы БЕЗ расхода.
  Причина — та же строка, что у useItem/canDoAction: «предмета нет в
  инвентаре».
* **Р-7. Нестаккуемость = отсутствие в STACKABLE** (items.js L53:
  potion/food/skill_book/reagent) — как spell_scroll (000133 §2.2).
  Правки STACKABLE/addItem НЕТ; addItem ×2 → 2 слота qty 1.
* **Р-8. desc 000051.json ЗАКРЕПЛЁН:** «В бою (быстрый слот):
  возвращает первого погибшего союзника на поле боя (50% HP). Цель не
  выбирается.» — 1-2 предложения, тон каталога (000050: «Свиток:
  изучает „Плетень" (нужен ранг школы).»), формулировка = SPEC L1500
  («возвращает мёртвого союзника на поле (50% HP), цель не выбирается
  (первый мёртвый)»).
* **Р-9. SVG/иконок НЕТ** (у предметов каталога иконок схемно нет —
  schema additionalProperties:false, поля icon нет; прецедент 000133).
  index.html — БЕЗ ИЗМЕНЕНИЙ (новых модулей нет: цепочка items-data
  L773 < items L793 < combat L808 не сдвигается; index-order-пины целы).
* **Р-10. ui-tab-inventory.js — НЕ ТРОГАТЬ (осознанное исключение):**
  кнопка «исп.» для resurrection_scroll НЕ добавляется (ТЗ-список файлов
  не включает UI; «исп.» существует только для potion/food/skill_book/
  spell_scroll — мирный отказ виден через ядро/API, красные — API-
  уровень). Кнопка «быстр.» (закрепление в quick-слот) — УЖЕ ЕСТЬ для
  любого предмета — это v1-путь (закрепить → применить в бою).
* **Р-11. Сейвы/детерминизм/очередь:** ноль новых `c._rng` на боевом
  пути (ветка + resurrectAlly + removeItem — без rng) → все createCombat-
  детерминизм-пины (сиды) бит-в-бит; формат сейва не меняется (новый id
  в старых сейвах невозможен — sanitizeInventory no-op; CURRENT_VERSION
  не трогать). Очередь хода при воскрешении НЕ пересчитывается (инвариант
  000163 §3.2 / 000167): воскресший входит в turnOrder с начала
  СЛЕДУЮЩЕГО раунда через существующий buildTurnOrder — в ветке нет
  вызовов buildTurnOrder/startRound (пин C1: turnOrder deepEqual
  до/после + после endTurn — в turnOrder).
* **Р-12. assets/spells — БЕЗ ПРАВОК:** свиток в «предметы» 000017.json
  НЕ появляется (связь в одну сторону item.effect → ядро combat.js;
  000163 §3.1). spells.js/spells-data.js/efir.js — не трогать (ТЗ +
  параллельные 000149/000167).

## 3. Контракты (форма, код, строки)

### 3.1 assets/items/000051.json (key-порядок canonical sync-скрипта)
```json
{
  "id": "resurrect_scroll",
  "name": "Свиток воскрешения",
  "kind": "resurrection_scroll",
  "weight": 0.5,
  "value": 150,
  "desc": "В бою (быстрый слот): возвращает первого погибшего союзника на поле боя (50% HP). Цель не выбирается.",
  "effect": {
    "kind": "resurrect"
  }
}
```
effect — ТОЛЬКО `{kind:'resurrect'}`: полей нет (цели нет, параметры —
в ядре combat.js); новых полей в schema effect НЕТ (additionalProperties:
false).

### 3.2 assets/items/schema.json (2 enum, append в конец)
* L7 kind: `["weapon","armor","potion","food","skill_book","reagent",
  "spell_scroll", "resurrection_scroll"]`.
* L24 effect.kind: `["heal","mp","eat","skill_xp","spell","resurrect"]`.

### 3.3 src/items.js (4 точки — регион «resurrection-kinds/useItem-ветки»)
1. `ITEM_KINDS` (L35-39): += `RESURRECTION_SCROLL: 'resurrection_scroll'`.
2. `EFFECT_KINDS` (L41-44): += `RESURRECT: 'resurrect'`.
3. `validateItem` — ветка ПОСЛЕ spell_scroll-ветки (L92-99), перед
   `const catalog` (L102):
   ```js
   // Свиток воскрешения (задача 000165, контракт D6): ЕДИНСТВЕННЫЙ
   // эффект — { kind: 'resurrect' } (полей нет: цель не выбирается,
   // параметры — в ядре combat.js; применение — только в бою).
   if (it.kind === 'resurrection_scroll') {
     const e = it.effect;
     if (!e || e.kind !== 'resurrect')
       throw new Error(it.id + ': свиток воскрешения — только effect.kind «resurrect»');
   }
   ```
4. `useItem` — ветка ПОСЛЕ spell_scroll-ветки (закрытие L537), ПЕРЕД
   `const d = P.derived(c)` (L539) — после hasItem-гарда L502 и отказов
   weapon/armor/reagent (строка отказа доходит до игрока только при
   наличии предмета):
   ```js
   // Свиток воскрешения (задача 000165, контракт D6): v1 — только в
   // бою (быстрый слот — combat.js playerQuickItem). Мирное средство
   // воскрешения — храм (000162). Отказ ДО расхода, предмет не
   // тратится (паттерн useItem).
   if (it.kind === 'resurrection_scroll') {
     return { ok: false, reason: 'Свиток воскрешения можно применить только в бою' };
   }
   ```
   Строка отказа — ДОСЛОВНО из ТЗ (красный пин I2).
   `STACKABLE` (L53) — НЕ трогать; `KIND_IDS` (L759) — обновится
   автоматически; `bonusKeyFor` — null для нового kind (бонус качества
   невозможен — без правок).

### 3.4 src/combat.js (3 точки)
1. `playerQuickItem` — НОВАЯ ветка МЕЖДУ `itemId = I.quickItem(p, s)`
   (L1231) и `c.ps.quickItem -= 1` (L1232), т.е. ПЕРЕД `I.useItem`
   (L1233). Точный код (фиксированный):
   ```js
   // Свиток воскрешения (задача 000165, контракт D6): быстрый слот
   // воскрешает ПЕРВОГО мёртвого СОЮЗНИКА в порядке c.units
   // (side==='ally' && !alive && !fled — предикат выбора цели 000163;
   // игрок вне c.units — не цель; цель не выбирается — v1). Ядро —
   // resurrectAlly (000163): 50% HP + лог «Возвращён в бой.» (R-3).
   // Очередь хода НЕ пересчитывается: воскресший входит в turnOrder
   // с начала следующего раунда (buildTurnOrder, 000036). Отказ —
   // return ДО сброса пула: действие НЕ сгорает (паттерн).
   const it = I.getItem(itemId);
   if (it && it.kind === 'resurrection_scroll') {
     if (!I.hasItem(p, it.id))
       return { ok: false, reason: 'предмета нет в инвентаре' };
     const t = c.units.find((u) => u.side === 'ally' && !u.alive && !u.fled);
     if (!t) return { ok: false, reason: 'нет погибших союзников' };
     c.ps.quickItem -= 1; // СНАЧАЛА — как в текущем коде (ТЗ)
     resurrectAlly(c, t); // лог «Возвращён в бой.» (R-3, 000163)
     I.removeItem(p, it.id, 1, true); // bonusFirst (000046, паттерн :531);
     // при qty→0 removeItem сам очищает quick-слот (items.js)
     return { ok: true, slot: s, item: it.name };
   }
   ```
   Порядок успеха: пул −1 → эффект → расход (зеркало useItem; hasItem
   выше гарантирует успех removeItem — ok-проверки НЕТ, кодбаз-паттерн).
2. `canDoAction` 'quickItem' (L1343-1376) — ветка ПОСЛЕ reagent-отказа,
   ПЕРЕД `return { ok: true }` (чистое чтение — без побочных эффектов,
   канон canDoAction 000037):
   ```js
   // Свиток воскрешения (000165): применим, только если есть погибший
   // союзник — тот же предикат и та же причина, что в ядре (000037:
   // одна причина — одно поведение; зеркало проверок playerQuickItem).
   if (it.kind === 'resurrection_scroll'
       && !c.units.some((u) => u.side === 'ally' && !u.alive && !u.fled)) {
     return { ok: false, reason: 'нет погибших союзников' };
   }
   ```
3. `MOB_TYPES.abomination` (L151) — loot += `{ item: 'resurrect_scroll',
   chance: 0.05 }` КОНЦОМ массива (после greater_healing 0.15).
   Зеркало в combat.js и JSON assets/mobs — ОДИН коммит (runtime-сверка
   deepEqual — tests/combat.test.js L239, ре-пина не требует).

### 3.5 Строки (все закреплены красными пинами)
* Мир (useItem): `Свиток воскрешения можно применить только в бою` (ТЗ).
* Бой, нет целей: `нет погибших союзников` (Р-2; ядро И зеркало).
* Бой, «призрак»: `предмета нет в инвентаре` (Р-6; зеркало useItem).
* Бой, успех (лог): `Возвращён в бой.` (R-3 000163, из resurrectAlly).

### 3.6 Источник / доступность
* Лут: Уродство (abomination, assets/mobs/000036.json) — 0.05, конец
  таблицы (Р-1). Пулы LOOT_BASE/LOOT_RARE, сундуки подземелий, виды
  магазинов, каталог npc, барахолка (000047) — НЕ ТРОГАТЬСЯ.
* Торговцы: универсам (wealth 3, allItems) — АВТОМАТИЧЕСКИ (ноль правок).

## 4. Тесты (красные — новые; тех-ре-пин — 1)

`tests/items.test.js` — новый блок «Задача 000165» (конец файла;
паттерны 000133 S1/S4, createCharacter, I.addItem/useItem/totalQty):
* **I1.** каталог 000051: 51-й файл (000001..000051.json); поля по ТЗ
  (id 'resurrect_scroll', name «Свиток воскрешения», kind
  'resurrection_scroll', weight 0.5, value 150, desc непустое, effect
  deepEqual {kind:'resurrect'}); валиден по schema.json (enum'ы содержат
  новые значения); зеркало items-data.js (getItem ≡ JSON; allItems — 51);
  нестаккуемость: addItem ×2 → 2 слота qty 1.
* **I2.** useItem в мире: addItem ok → useItem → ok:false, reason
  deepEqual «Свиток воскрешения можно применить только в бою»; totalQty
  1 (НЕ потрачен); hp/mp не мутировали.

`tests/assets-schemas.test.js` — **I3.** enum-пин (прецедент 000133
L356-370): `properties.kind.enum` содержит 'resurrection_scroll';
`properties.effect.properties.kind.enum` содержит 'resurrect'.

`tests/combat.test.js` — новый блок «Задача 000165» (конец файла;
фикстуры winLoot L4673, strongHero L37, createCombat{allies},
combatInternals — то же файловое окружение; мёртвый союзник —
`combatInternals.dealDamageToAlly(c, a, 9999)` — реальный путь гибели,
НОЛЬ c._rng, паттерн deadAlly163 tests/spells.test.js L1297):
* **C1.** quick-слот: addItem + setQuick(0); бой с 2 союзниками
  (allies [A,B] → c.units: [wolf, A, B]); убить ОБА (B ПЕРВЫМ — чтобы
  «первый в c.units» ≠ «умерший первым»); `c.quickItem(0)`: ok, slot 0;
  A (первый мёртвый в порядке c.units) alive=true, hp=Math.round
  (A.maxHP/2); B остаётся мёртв; totalQty 0 (сгорел 1 шт.);
  c.ps.quickItem = pool−1; quick[0] === null (removeItem очистил);
  c.log содержит «Возвращён в бой.»; НОЛЬ вызовов c._rng на ветке
  (обёртка-счётчик ДО quickItem, паттерн R2); turnOrder deepEqual
  до/после (ветка НЕ пересчитывает) + после c.endTurn() A.id ∈ turnOrder
  (входит с начала следующего раунда).
* (порядок — ВСТРОЕН В C1: там убиваются ОБА союзника и пинится, что
  воскресает ПЕРВЫЙ в порядке c.units, а второй остаётся мёртв —
  отдельного C2 НЕТ; убивать B ПЕРВЫМ, чтобы «первый в c.units» ≠
  «умерший первым»).
* **C3.** «живых только»: все союзники живы → c.quickItem(0) → ok:false,
  reason «нет погибших союзников»; c.ps.quickItem НЕ изменился (действие
  НЕ сгорело); totalQty 1; союзники не мутированы.
* **C4.** inv-слот — ВЕТКИ НЕТ (v1-граница): свиток в инвентаре (НЕ в
  quick), есть МЁРТВЫЙ союзник → c.invItem('resurrect_scroll') →
  ok:false, reason «Свиток воскрешения можно применить только в бою»
  (отвечает I.useItem, а не боевая ветка); союзник ОСТАЁТСЯ мёртв;
  c.ps.invItem вернулись (не сгорел); предмет цел.
* **C5.** зеркало canDoAction 'quickItem' (000037): свиток в quick,
  живых только → {ok:false, reason:'нет погибших союзников'}; после
  гибели союзника → ok:true (одна причина — одно поведение).
* **C6.** доступность (ТЗ п.4): assets/mobs/000036.json loot deepEqual
  [{phoenix_feather,0.2},{greater_healing,0.15},{resurrect_scroll,0.05}]
  (+ зеркало MOB_TYPES — runtime-тест L239) + детерминированный дроп:
  `winLoot({mobs:['abomination'], mobLevel:2, seed:5, rng:()=>0.01,
  killBy:'dealDamage'})` → c.result.items deepEqual
  [{phoenix_feather,1},{greater_healing,1},{resurrect_scroll,1},
  {minor_healing,1},{iron_sword,1}] (порядок: таблица → база
  BASE_POOL[0] → редкий RARE_POOL[0]; ВСЕ пороги > 0.01 — проверено по
  логике rollVictoryLoot: 0.01<0.2, 0.01<0.15, 0.01<0.05, 0.01<0.25,
  0.01<0.05+0.01·2).

Краснота (TDD): RED-коммит = ТОЛЬКО новые тесты (без src/, assets/,
schema.json): падают на отсутствующих файлах/ветках (осмысленно —
absence: «файла нет», getItem null, addItem «неизвестный предмет»,
enum не содержит, reason mismatch), НЕ load-crash. Тех-ре-пин
makeShop golden НЕ в red-коммите (упал бы только после каталога) — в
зелёный. Ожидаемо красных: 8 (I1, I2, I3, C1, C3, C4, C5, C6; C2 —
внутри/рядом с C1).

## 5. Границы / НЕ трогать

* spells.js, efir.js, assets/spells (свиток в «предметы» 000017 НЕ
  появляется — односторонняя связь, 000163 §3.1), building-* (территория
  000162), combat-ui.js, ui-tab-inventory.js (кнопка «исп.» не
  добавляется, Р-10), ui.js, index.html, tests/index-order.test.js,
  tests/svg.test.js (SVG не создаётся).
* playerInvItem + зеркало canDoAction 'invItem' (ТЗ v1).
* Пулы LOOT_BASE/LOOT_RARE (N6 deepEqual), сундуки подземелий
  (assets/dungeons, dungeon.js, dungeons-data.js), виды магазинов,
  каталог npc, барахолка 000047.
* Очередь хода: buildTurnOrder/startRound/endPlayerTurn/playerFlee
  (регион 000167) — при воскрешении очередь НЕ пересчитывается (Р-11).
* SPEC.md (строки УЖЕ в master: L1500 тип предмета; L799-803
  «Спутники → Воскрешение» — «первый мёртвый союзник в порядке юнитов
  боя; мёртвых нет — отказ, действие не сгорает»). tests/spec-
  resurrection.test.js — green, не трогаем.
* .merge-pending (только стадия мержа). master и чужие worktrees;
  push в remote — запрещён.

## 6. Подводные камни (TDD-порядок, ребейз, параллельность)

* **TDD-порядок (критично):** RED-коммит — только тесты. Если
  000051.json появится ДО расширения ITEM_KINDS/validateItem —
  `validateItem` бросит «неизвестный тип» при загрузке items.js →
  весь items-сьют + ВСЕ vm-песочницы (цепочка `<script>`) падают вне
  контроля. Каталог + schema + regen + src — ОДИН зелёный коммит
  (прецедент 000133 §11).
* **Ребейз на актуальный master перед мержем ОБЯЗАТЕТЕЛЕН** (000147/
  000167/000149/000162 в работе):
  * `src/items.js` — ОБЩИЙ с 000147 (единое изучение: обобщение
    spell_scroll-ветки useItem + building-effect-runes). Наш дифф —
    additive-регионы: ITEM_KINDS/EFFECT_KINDS (2 строки), validateItem-
    ветка (после spell_scroll-ветки), useItem-ветка (сразу после
    spell_scroll-ветки) — add/add-конфликт вероятен → резолв: сохранить
    ОБЕ ветки (ихя — обобщение spell_scroll; наша — отдельная ветка
    resurrection_scroll); держать наш hunk минимальным.
  * `src/items-data.js` — сгенерированный: при конфликте — РЕГЕН от
    слитого каталога (`npm run sync:items` + `npm run sync:check`),
    руками НЕ мержить. При ребейзе с другими каталожными изменениями —
    тех-ре-пин makeShop golden пересчитать прогоном теста (дифф стока).
  * `src/combat.js` — с 000167 (инициатива: очередь хода): наш регион
    playerQuickItem L1221-1240 / canDoAction L1343-1376 / MOB_TYPES
    L151 — НЕ пересекается с buildTurnOrder/endPlayerTurn (бриф).
    000149 (книга в бою): canDoAction 'spellbook' — не пересекается.
  * `tests/combat.test.js` — 000167 вставляет блок по центру + ре-пины
    очереди; наш блок — КОНЕЦ файла. `CHANGELOG.md` — тривиальный
    add/add → обе записи.
* **vm-песочницы** (~41 файл): подхватывают изменения автоматически
  (index.html не меняется); структурный вывод (HUD/кнопки) не меняется
  → проходят без правок. Единственная точка — порядок коммитов (см. выше).
* **Флейки**: vm-тесты с таймингами — при случайном падении ЧУЖОГО теста:
  перепуск `node --test tests/<файл>` + запись в tasks/result.
* **База (проверено в worktree 2026-10-07): npm test — 1823 pass /
  0 fail** (~98 с).

## 7. Важно будущим задачам (из ссылок ТЗ / контрактов 000156)

* **000166 (UI каста игрока):** пикер целей — по мёртвым СОЮЗНИКАМ
  c.units (игрок не адресуется); предикат мёртвого союзника
  (`side==='ally' && !alive && !fled`) — теперь ДВА канонических
  места: ядро 000163 (evalSpell) и ядро 000165 (свиток) — свиток
  предикат не меняет, 000166 переиспользует.
* **000162 (храм):** мирное средство воскрешения — территория храма;
  свиток сознательно «только в бою» (ОQ-6 000156: внебоевого каст-API
  нет и не требуется). Строка отказа useItem на это ссылается.
* **000164 (окно смерти Аэфира):** спасение ИГРОКА — Аэфир; свиток
  игрока НЕ воскрешает (игрок вне c.units) — v1-граница D6.
* **Следующие предметы-инструменты нового kind'а:** паттерн = эта
  задача (новый kind + effect-kind в schema/ITEM_KINDS/EFFECT_KINDS/
  validateItem + ветка useItem + ветка playerQuickItem + зеркало
  canDoAction 000037 + per-mob лут + реген items-data.js + тех-ре-пин
  makeShop universal golden при попадании в allItems-хвост).
* **Детерминизм лута:** порядок rollVictoryLoot — таблица u.loot (per-
  mob, в порядке таблицы) → базовый ролл → общий редкий ролл; +1 запись
  в таблицу = +1 `c._rng` только за того моба (Р-1).

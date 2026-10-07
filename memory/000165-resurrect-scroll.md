# 000165 (карточка): предмет resurrect_scroll — форма, проводка, источники

Компактный референс. Полный контракт, решения и подводные камни —
`memory/000165-resurrection-scroll.md` (тот же worktree, коммитится
вместе). База — master `ec08e19` (перебазирована на станции ревью,
§8 полной памяти; первоначальная база `dd9c0e8`). Статус: выполнено,
задача в done (2026-10-07).

## 1. Форма 000051 (НОВЫЙ kind)

`assets/items/000051.json` — 51-й файл каталога:

| поле | значение | примечание |
|---|---|---|
| id | `resurrect_scroll` | |
| name | «Свиток воскрешения» | ТЗ |
| kind | `resurrection_scroll` | **НОВЫЙ kind** (не spell_scroll: он = «свиток-обучалка», 000133) |
| weight | 0.5 | ТЗ |
| value | 150 | ТЗ; поздний лут |
| desc | «В бою (быстрый слот): возвращает первого погибшего союзника на поле боя (50% HP). Цель не выбирается.» | закреплено станцией (Р-8); тон = SPEC L1500 |
| effect | `{ "kind": "resurrect" }` | **НОВЫЙ effect-kind**; полей НЕТ (цели нет — параметры в ядре combat.js) |

Нестаккуемый: НЕ входит в `STACKABLE` (items.js L53: potion/food/
skill_book/reagent) — паттерн spell_scroll; правки STACKABLE/addItem
НЕТ (addItem ×2 → 2 слота qty 1).
schema.json: append в конец enum'ов — kind += `resurrection_scroll`
(L7), effect.kind += `resurrect` (L24); additionalProperties:false —
новых полей НЕТ. `src/items-data.js` — РЕГЕН `npm run sync:items`
(руками не править).

## 2. Где ветки

### 2.1 items.js — мир (отказ)
`useItem` (items.js ~L539): ветка ПОСЛЕ spell_scroll-ветки, ПЕРЕД
`const d = P.derived(c)`, после hasItem-гарда (L502) и отказов
weapon/armor/reagent:
```js
if (it.kind === 'resurrection_scroll') {
  return { ok: false, reason: 'Свиток воскрешения можно применить только в бою' };
}
```
Отказ ДО расхода — предмет НЕ тратится. Причина — ДОСЛОВНО из ТЗ
(красный пин I2). Там же `validateItem`-ветка (только effect.kind
'resurrect') + константы `ITEM_KINDS.RESURRECTION_SCROLL` /
`EFFECT_KINDS.RESURRECT`.

### 2.2 combat.js — бой (первый мёртвый)
`playerQuickItem` (combat.js ~L1231): ветка МЕЖДУ разрешением itemId и
общим `c.ps.quickItem -= 1`, т.е. ПЕРЕД `I.useItem`:
```js
const it = I.getItem(itemId);
if (it && it.kind === 'resurrection_scroll') {
  if (!I.hasItem(p, it.id))
    return { ok: false, reason: 'предмета нет в инвентаре' };
  const t = c.units.find((u) => u.side === 'ally' && !u.alive && !u.fled);
  if (!t) return { ok: false, reason: 'нет погибших союзников' };
  c.ps.quickItem -= 1;
  resurrectAlly(c, t);
  I.removeItem(p, it.id, 1, true);
  return { ok: true, slot: s, item: it.name };
}
```
* Цель — ПЕРВЫЙ в порядке `c.units` (mobs → allies в порядке массива)
  со `side==='ally' && !alive && !fled` — предикат 000163 (R-1); игрок
  вне c.units — не цель (v1; Д6).
* Ядро — `resurrectAlly` (combat.js L905, 000163): alive=true,
  hp=round(maxHP/2), лог «Возвращён в бой.» (R-3, единственная строка
  лога — дописывать НЕ надо). Ноль c._rng.
* Зеркало `canDoAction` 'quickItem' — ОДНОВРЕМЕННО (000037): та же
  причина «нет погибших союзников», чистое чтение c.units.

### 2.3 Пул / сгорание
* Отказ (нет целей / «призрак» quick-слота) — return БЕЗ прикосновения
  к пулу: действие НЕ сгорает, предмет цел (паттерн playerQuickItem;
  ветка стоит ДО общего `-= 1`, возвратов не надо).
* Успех — `c.ps.quickItem -= 1` СНАЧАЛА (ТЗ: «как в текущем коде»),
  затем эффект, затем `removeItem(p, it.id, 1, true)` (bonusFirst,
  паттерн spell_scroll :531; ok-проверки нет — hasItem выше
  гарантирует успех, кодбаз-паттерн useItem).
* При qty→0 `removeItem` сам очищает quick-слот (items.js) — после
  применения последнего свитка слот пуст (пин C1).
* Очередь хода НЕ пересчитывается: воскресший входит в turnOrder с
  начала следующего раунда (buildTurnOrder, 000036) — ветка не зовёт
  buildTurnOrder/startRound (инвариант 000163 §3.2 / 000167; пин C1).
* Ноль новых c._rng на боевом пути → детерминизм-пины бит-в-бит.

## 3. Source-флаги (лут/торговцы)

* **Лут**: Уродство (abomination, `assets/mobs/000036.json` + зеркало
  `MOB_TYPES.abomination` combat.js L151 — ОДИН коммит):
  `{ "item": "resurrect_scroll", "chance": 0.05 }` КОНЦОМ loot-массива
  (после phoenix_feather 0.2, greater_healing 0.15). +1 c._rng только
  за поверженного Уродства (rollVictoryLoot, порядок таблицы).
* **Торговцы**: универсам (wealth 3, пул allItems, makeShop) — АВТО
  (ноль правок); барахолка 000047, виды магазинов, каталог npc —
  не содержат новый kind → не сдвигаются.
* НЕ добавлено: пулы LOOT_BASE/LOOT_RARE (N6), сундуки подземелий,
  buildings (территория 000162).
* Тех-ре-пин (1 шт., проверено симуляцией на станции): makeShop golden
  (30,40,WEAPONS_SHOP,wealth 3) += `resurrect_scroll: 5`; остальные
  ключи стока не сдвигаются (новый предмет — конец allItems-пула,
  rng-хвост); прочие 5 goldens + makeCampShop — без правок.

## 4. Что НЕ тронуто (v1-границы)

* **playerInvItem** — НЕ расширяется: свиток из inv-слота → I.useItem →
  отказ «только в бою», пул invItem не сгорает (пин C4).
* **spells.js / assets/spells / efir.js** — не трогать: свиток в
  «предметы» 000017.json НЕ появляется (связь item→ядро односторонняя,
  000163 §3.1); effect без spell-id.
* **building-\*** — не трогать (000162). **combat-ui.js** — не трогать
  (кнопка [Q]/E уже зовёт c.quickItem; отказ — logRejection).
* **ui-tab-inventory.js** — кнопка «исп.» НЕ добавляется; «быстр.» —
  уже есть (v1-путь: закрепить → применить в бою).
* **playerInvItem-зеркало** canDoAction 'invItem' (whitelist
  potion/food/skill_book) — без изменений.
* **SVG/иконок НЕТ**; index.html — без изменений (новых модулей нет).
* **SPEC.md** — не правится (строки уже в master: L1500, L799-803).

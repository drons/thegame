# 000311 — тестовые пины контрактов 000299.x (активный персонаж партии)

Дата: 2026-11-04. Worktree task-000311, базис 6a71df6 (3795/3795);
master двигался 6a71df6 → 284bc1c (000302.06: +25 иконок свитков
Природы — пересечение со SCOPE = 0 файлов) → f98bde8 (000310:
мёртвый код combat-ui — пересечение со SCOPE = 0 файлов) — оба
ребза чистых; тесты не зависят от item-счётчиков 511/468/43/435,
база master f98bde8 (3822/3822 = 3820 + 2 пина 000310), полный
прогон 3831/3831 (+9).

## Что закреплено (tests-only, src/ 0-diff)

Источники: tasks/result/000299.01-retro-20261104.md,
000299.02-retro-20261104.md, 000299.03-retro-20261104.md
(blocker/major = 0 — только пробелы покрытия).

### tests/active-char-building.test.js (11 → 14)

* **AC12 (НОВОЕ)** — контракт «панель открыта — render()» у
  `setActiveCharId` (src/ui.js:1058-1061): [I]-панель с магазином
  (аптека, Зелье лечения, wealth 0) — строки «покупка 10 з»/
  «продажа 10 з» (hero-дефолт) → `setActiveCharId('merc_mira')`
  (merc Торговец 2 в roster) → «покупка 9 з»/«продажа 11 з»
  ИН-ПЛЕЙС, узел `.char-panel` тот же. Поймает: удаление
  `if (panel) render()` в сеттере (проверено мутацией — тест красный).
* **AC13 (НОВОЕ)** — деградация ряда в NPC-диалоге (двойника в
  building-ui.js закрывали AC6-AC8; в npcUI — не было):
  PortraitsData нет → 0 кнопок + console.error ровно 1×
  (один-разовый флаг `partyRowErrorShown` на МОДУЛЬ ui.js) +
  повторный open — тихо; после восстановления — stale активный id
  'merc_ghost' → Party.active тихо (Флогистон активен), 0 ошибок.
* **AC14 (НОВОЕ)** — NPC-диалог БЕЗ __game: ряд = ровно 1 button
  `flogiston` «cp-portrait cp-portrait-active», 0 console.error
  (partyMembersFor → squadUI.liveState() = {roster: null, efir: null}
  → P.list → только hero; тихо — 000145).
* **AC2 (расш.)** — сброс ПУСТОЙ СТРОКОЙ `setActiveCharId('')`
  (контракт «null/'' — сброс»; до — только null).
* **AC3 (расш.)** — ТОЧНАЯ позиция ряда в [E]: .combat-side — ровно
  4 ребёнка, ряд = 2-й (children[1]), children[0] — .cp-title,
  children[2] — .cp-items; классы кнопки ⊆
  {cp-portrait, cp-portrait-active}, НЕ .cp-btn (ловушка 000098),
  нет data-buid/data-npcact (своя ветка `closest('button.cp-portrait')`).
* **AC4 (расш.)** — после клика: ТОЧНЫЙ класс активного
  «cp-portrait cp-portrait-active» + нет data-buid/data-npcact.
* **AC9 (расш.)** — ДО клика в ряде диалога активен Флогистон
  (дефолт) + классы/dataset всех кнопок ряда.

### tests/npc-dialog-scope.test.js (15 → 18)

* **A9 (НОВОЕ)** — `Game.NpcData` нет → роль наёмного null
  (characterScope, src/npc.js:82): опция `для:"merc"` совпадёт
  (по kind), `для:{роль}` — НЕ совпадёт (role null ≠ enum,
  fail-closed). globalThis.__game/Game — save/restore в finally
  (node --test = 1 процесс на файл — утечка запрещена).
* **A10 (НОВОЕ)** — лист без primary/secondary (bare `{level: 1}`):
  все 3 требования «не выполнено», строки причин ТЕ ЖЕ («нужна
  Харизма 3»/«нужен Оратор 2»/«бонус к диалогу меньше 3»), без
  краха (000053). Ловушка: `P.derived(bare)` сам ПОДАЁТСЯ
  (нет sheet.primary/secondary) — но dialogOptions зовёт derived
  ТОЛЬКО при `typeof character.primary === 'object' && character
  .primary` → bonus = 0 тихо.
* **B6 (НОВОЕ)** — ВТОРОЙ call-site (ТЗ 000299.02 п.3): opt-ветка
  `onOverlayClick` (src/ui.js:1416) — `G.dialogOptions(npc,
  activeSheetNow())`. Сценарий: активный Эфир → клик по
  efir_whisper (Берта, `для:"efir"`, «подсказка») → текст в
  `.npc-log`, оверлей не закрыт, вкладка «диалог» не переключена.
  Поймает: регресс ветки к `dialogOptions(npc, c)` (hero) →
  efir-опции нет в списке → find→undefined→return → лог пуст
  (проверено мутацией — тест красный).
* **A8c (расш.)** — schema.json ОТКЛОНЯЕТ объект scope:
  `{роль:"bogus"}` (вне enum melee/ranged/shield/support) и `{}`
  (required «роль») — отрицательная сторона объекта (до — только
  строковый мусор 'nobody').

### tests/shop-prices-000299.03.test.js (9 → 12)

* **A6 (НОВОЕ)** — wealth 3 + priceChar ≠ owner (до: все A3/A4 —
  wealth 0): buyPrice = round(10 × (1−0.10×3) × 0.90) = 6,
  sellPrice = round(10 × (1+0.15×3) × 1.10) = 16 (ОБА множителя:
  богатство × Торговец); hero-регрессия: 7 / 15 (Math.round(14.5)
  = 15). Формулы: BUY/SELL_WEALTH_MULT = 0.10/0.15 (src/items.js),
  buyPriceMult/sellPriceMult = derived() (src/sheet.js).
* **B5 (НОВОЕ)** — npcUI ПРОДАЖКА e2e (до: проданка с активным ≠
  hero не покрыта ни на одном экране): hero с wood_sword, активный
  merc_mira Торговец 2 → строка «покупка 9 з / продажа 7 з»,
  клик «продать» → hero.gold +7 (round(6×1.10)), qty 0, лог
  «Продано: Деревянный меч за 7 з», mira.gold === undefined
  (NaN-ловушка: owner = hero). Поймает: убирание priceChar в
  sell-ветке onOverlayClick (ui.js:1510-1522) → 6 вместо 7
  (сценарий, названный в retro 000299.03).
* **B6 (НОВОЕ)** — [I] ПРОДАЖКА e2e: аптека, hero с
  healing_potion, активный merc → строка «продажа 11 з»
  (round(10×1.10)), клик «продать» (doItemAction sell, ui.js
  645-647, priceChar = activeSheetFor(c)) → hero.gold +11, qty 0,
  mira.gold undefined.
* **B1 (расш.)** — после покупки — строка имени «Деревянный меч
  (ост. 1)»: сток −1 ин-плейс (RED-пункт ТЗ 000299.03; renderTab()
  после buy в onOverlayClick).

## Значения с диска (6a71df6; 284bc1c/f98bde8 не меняют — 000302.06 = только icon-поля, 000310 = только combat-ui/spec)

* merc Торговец 2 → buyPriceMult 0.90 / sellPriceMult 1.10
  (pct = perLevel × 2, perLevel отрицателен).
* wood_sword «Деревянный меч» value 10, weapon; Бренн (000001)
  10/6 ×2. healing_potion «Зелье лечения» value 10, potion,
  скупается аптекарем (shopKindsFor).
* npcSell НЕ инкрементит сток (npc.js:353-368) — «ост.» после
  продажи НЕ меняется (в B5 не ассертится — контракт именно
  таков; инкремент есть только в buy).

## Ловушки

1. **Один-разовый флаг per-sandbox**: `partyRowErrorShown` —
   МОДУЛЬНЫЙ (ui.js:523), свежий в каждом boot() (новый
   vm-контекст). AC13 опирается на это: 1-й open — error 1×,
   повторный — тихо. Если бы флаг висел на globalThis — тест
   давал бы ложный fail на повторных запусках файла.
2. **cleanup globalThis (A9)**: save/restore в finally по образцу
   withWorld (строки «hadGame/hadG» + delete). Node --test = 1
   процесс на файл — утечка __game/Game в B-тесты файла запрещена.
3. **`P.derived(bare)` падает** на листе без primary/secondary —
   никогда не зови derived() в тестах напрямую с bare-листом;
   диалоговая проверка устойчива ТОЛЬКО благодаря typeof-guard
   в dialogOptions (npc.js:143-174). A10 проверяет именно
   устойчивый путь (через dialogOptions).
4. **Активный [I] — через LearnTarget.activeSheet** (ctx getter
   `activeSheet`, ui.js:148 → activeSheetFor → G.LearnTarget
   .activeSheet(c)); npcUI — через activeSheetNow() (ui.js:1123).
   Оба читают ОДИН closure `activeCharId` + LIVE __game.state.
5. **Math.round(14.5) = 15** (half-up) — hero-sell при wealth 3
   = 15, не 14 (A6).
6. **Секция CHANGELOG НЕ трогалась**: задача tests-only — игровой
   процесс/графика не меняются (критерий CLAUDE.md).
7. **0-diff: весь src/, assets/, spec/** — без изменений.

## Счётчики

* Полный прогон: 3831 = 3822 (база master f98bde8) + 9.
* Срез 3 файлов: 44 = 14 (active-char-building) + 18
  (npc-dialog-scope) + 12 (shop-prices).
* Ре-пины НЕ требовались: SPEC_FILE_LINES (companions 203 /
  npc-storage 83 / items 369 — 368 по wc -l, файл без trailing-\n,
  31285 байт) цёлы — spec/ не тронут; ни один тест не пинит содержимое/длины трёх
  целевых тест-файлов; шапка shop-prices «expectedRedCount = 7»
  — историческая (RED-коммит 000299.03), сохранена.

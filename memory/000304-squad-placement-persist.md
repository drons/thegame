# 000304: расстановка перед боем — запоминание в общем сейве между боями + порядок на вкладке «Отряд» [C] (src/main.js + src/combat-ui.js + src/ui.js + spec/companions.md) — контракт

Задача: (1) результат расстановки перед боем (000260) запоминается
в ОБЩЕМ сейве между боями — следующий бой стартует с последней
расстановки; (2) порядок расстановки показывается на вкладке
«Отряд» [C]. Родители: 000295 (кнопка/вкладка «Отряд» [C];
контракт memory/000295-squad-button.md §4 — «КОНТРАКТ ДЛЯ 000304»:
существующий оверлей G.squadUI, точка расширения — строки render()
в .squad-body), 000260 (механизм расстановки: окно, клики, Enter →
свап c0→c1 через makeCore(moved), opts.placement в createCombat,
зона — последние две строки 7×7). ТЗ: tasks/pending/000304.md.

## 1. Поле сейва squad_placement — формат

* Топ-уровневый раздел data: `squad_placement` — объект
  `{ 'player' | 'efir' | npcId → [x, y] }`. Ключи — id БОЕВОГО
  юнита: герой — `'player'` (c.px/c.py), Эфир — `'efir'`
  (efirAllyData), наёмники — `npc.id` (allyDataForEntry,
  companions.js). Фолбэк id `'a'+idx` (makeAlly) в реальной игре
  не срабатывает (всё с id). Это ДРУГОЙ namespace, чем last_spells
  ('flogiston' — hero там).
* Значение — [int, int], обе координаты 0..6 (клетка зоны
  7×7; validatePlacement 000260 на старте боя дополнительно
  проверит зону/перекрытия для конкретного боя).
* Пишется ВСЕГДА (даже {}): неломкое расширение v1 (000031),
  версию НЕ поднимаем, миграций нет.
* Санизация (sanitizeSquadPlacement, main.js): ключ — только
  'player'/'efir' или npcId в live-roster (self-cleaning:
  уволенный наёмник обрезается при следующем сейве); значение —
  только [int,int] в 0..6; не-объект/массив — {}. Невалидные
  записи — тихий сброс (паттерн 000029). Отличие от last_spells:
  restore-блок НЕ печатает warn даже на не-объект (raw != null
  → не-объект/массив → {} молча; только catch — warn
  «не удалось восстановить squad_placement»).
* Restore — IN PLACE в live-объект squadPlacement (live-ссылка
  не меняется — combat-ui держит её как opts.placementLive).
  raw == null (старый сейв) — map остаётся ПУСТОЙ, без warn
  (паттерн 000109 R5).
* Зеркало: `__game.state.squadPlacement` — Object.assign({},
  squadPlacement) на каждый доступ (read-only, как lastSpells).

## 2. Миграция — НЕТ

* save.js — 0 diff (version, MIGRATIONS не меняются).
* Старый сейв (v1, без squad_placement) — live-карта пуста →
  первый бой — дефолтная расстановка (якоря), без warn.
* Невалидная сохранённая расстановка для конкретного боя
  (вышла за поле/перекрытие/юнит не в бою — дрейф состава) →
  makeCore(seed) в createCombat БРОСАЕТ (validatePlacement,
  000260) → catch в startCombat combat-ui.js → makeCore()
  (якоря), без краха. Throw — ДО строки первой встречи Эфира и
  pre-roll (placement применяется в createCombat до generateObstacles)
  → фолбэк чистый (ни one-shot, ни pre-roll не потреблены).

## 3. Точка записи

* closePlacementWindow (combat-ui.js), ВНУТРИ `if (moved)`, ПОСЛЕ
  try/catch свапа (в самом конце тела if). Guard:
  `ctx.placementLive && ctx.combat !== c0` — только УСПЕШНЫЙ свап
  (исключение в makeCore — ctx.combat === c0 — запись НЕ идёт).
* Запись — ПОЛНЫЙ старт-мап: `live.player = [cc.px, cc.py]` +
  ВСЕ ally из cc.units (`live[u.id] = [u.x, u.y]`), включая
  НЕДВИНУТЫХ (Эфир/наёмники на якорях попадают в мап — полный
  снимок, не дельта). Карта чистится ДО записи (мёртвые ключи —
  стёрты).
* Все пути выхода из режима расстановки идут через
  closePlacementWindow (Enter, первое действие, «Побег»,
  finish-ветки) — записей в других точках НЕТ. moved === null
  (переносов не было) — записи нет; c0.result — нет.
* ctx.placementLive — live-ссылка на squadPlacement main.js
  (opts.placementLive, 3 точки startCombat) ИЛИ null (цепи без
  main.js — тесты/модуль: opts не передан → запись no-op).

## 4. Точка чтения

* main.js: ТРИ точки startCombat (мир L~1875, подземелье L~2635,
  отладочный L~3250) передают `placementLive: squadPlacement`
  (live-ссылка, как lastSpells/allyQuickLive).
* startCombat (combat-ui.js): seedPlacement строится из
  opts.placementLive — фильтр: 'player' (int,int) + id из
  alliesArr (Эфир ПЕРВЫМ + наёмники); пустой cand → null.
  `try makeCore(seed) catch makeCore()` (невалидная расстановка —
  якоря, §2). ctx.placementLive — тот же объект (null-guard).
* Дрейф состава: self-cleaning при сейве (ключи вне roster
  вырезаются) + повторный найм того же npcId — СТАРАЯ
  расстановка применяется (семантика задокументирована:
  расстановка — по id боевого юнита, не по «найму»).

## 5. Отображение — вкладка «Отряд» [C]

* IIFE G.squadUI (src/ui.js): `let placement = null;` (локал),
  init(o) — `placement = o.placement (объект) | null`
  (main.js: `placement: squadPlacement` — live-ссылка; панель
  рендерится ПОСЛЕ мутаций main.js → всегда актуально).
* render(): секция ПОСЛЕ renderEfirRow(efirData()) (общий хвост,
  вне веток haveCore/empty), ТОЛЬКО при непустой карте
  (Object.keys(placement).length) — P4-пин rows.length===1
  остаётся зелёным (placement не передан → секции нет).
* Секция: meta `el('div','cp-itemmeta','Расстановка:')` + на
  каждую запись .cp-itemrow: .cp-itemname (имя) + .cp-itemmeta
  «строка Y · столбец X» (0-based; согласовано с hint placebar
  «строки 5–6» 000260). Имя: 'player' → «Флогистон», 'efir' →
  «Эфир», иначе каталог по npcId (npc.имя), фолбэк — голый id
  (паттерн строк отряда).
* CSS — без правок (cp-itemmeta/cp-itemrow/.squad-body
  существующие).

## 6. Ре-пины (green-коммит) и границы

Ре-пины (том же коммите, что код):
* tests/spec-split.test.js: `"companions.md": 156` → `171`
  (+15, абзац «Сейв»: squad_placement).
* tests/spec-000295-wording.test.js: guard
  specLines(companions.md) `156` → `171` (титул W1 + сообщение
  assert с накопленной историей 000295/000304; прецеденты
  такого ре-пина: 000307 → spec-000297-wording, 000303 →
  spec-000275-wording; выявлено полным прогоном сьюта — план
  задачи ре-пин 000295 не покрывал).
* tests/combat-ui.test.js: scene84 — pass-through
  opts.placementLive в G.combatUI.startCombat (аддитивный
  spread; существующие вызывающие не передают — бит-в-бит).

НЕ ТРОГАЛОСЬ (0-diff): src/save.js, src/combat.js, index.html,
src/spells.js, src/ally-spells.js, KeyC-ветка main.js (L2210–2213),
touchControls IIFE (ui.js, 000295), placebar (combat-ui.js
L611–642), placeGate/resetToAnchors/placeFreeCells, squadUI
toggle/Esc/buildSquad/click/renderEfirRow, механики
lastSpells/allyQuick (существующие строки), зону старта боя
(COMBAT_KEYS, «Побег», кнопки .combat-actions — это 000305, идёт
ПОСЛЕ), тесты 000260 U1–U8, squad-panel P1–P6/S1–S3.

## 7. Тесты

* tests/combat-ui.test.js: 000304-U1 (placementLive {player:[2,6]}
  → старт с (2,6); RED), 000304-U2 (guard: битая карта — якоря,
  контроль seed 42, без краха; зелёный с red-стадии —
  осознанный), 000304-U3 (live-карта {player:[9,9], nope:[0,0]}:
  клик герой→(1,5), Enter → свап, карта ПЕРЕЗАПИСАНА {player:
  [1,5]}, мёртвые ключи стёрты; RED).
* tests/save-restore.test.js: 304-SAVE-ROUNDTRIP (S1: seed →
  зеркало → beforeunload → раздел в сейве, version 1; RED),
  304-SAVE-OLD (S2: без раздела — чисто (0 errors/warn), зеркало
  {}, новый сейв {} (пишется всегда)), 304-SAVE-SANITIZE (S3:
  player [99,99]/efir 'oops'/ghost/'a1' отброшены, merc_volk
  в отряде переживает; RED).
* tests/squad-panel.test.js: 000304 P7 (копия инициализации P4 +
  placement {player:[0,6]}: meta «Расстановка:» + .cp-itemrow
  «Флогистон» / «строка 6 · столбец 0»; без placement — секции
  нет; RED по (a)).
* tests/squad-placement-e2e-000304.test.js (НОВЫЙ, harness —
  КОПИЯ squad-panel-e2e + seed/seedSave/readSave/fireBeforeUnload
  из save-restore): SP-1 (seed {player:[2,6], merc_volk:[4,5]} →
  startCombat: (2,6)/(4,5); RED), SP-2 (перенос героя + Enter →
  beforeunload: раздел = ПОЛНЫЙ старт-мап {player, efir,
  merc_volk} по c1; RED), SP-3 (guard: seed без раздела — boot
  чисто, зеркало {}, бой на якорях; зелёный с red-стадии),
  SP-4 (KeyC: панель — «Расстановка:», «Флогистон»,
  «строка 6 · столбец 2», «строка 5 · столбец 4», имя наёмника
  из каталога; RED).
* tests/spec-000304-wording.test.js (НОВЫЙ, 1:1 по
  spec-000295-wording): W1 — 8 фраз раздела «## Сейв» + guard
  specLines(companions.md) = 171 (RED).

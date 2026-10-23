# 000242 — payWages: уход наёмника при низкой лояльности — экипировка возвращается герою (уход откладывается при полном инвентаре)

Станция: ПРОЕКТИРОВАНИЕ (финальная архитектура и контракты, до кода).
2026-10-23. Worktree `.worktrees/task-000242`, ветка `task/000242`,
база = master `c56368b` (000241 УЖЕ в master — зависимость ТЗ закрыта).
ТЗ (source of truth) — `tasks/pending/000242.md`. Источник: ретро
000230.06.01 (2026-10-22) finding #2 (minor) + finding #2
`tasks/result/000230.06.01.md`. Память прецедента:
`memory/000230.06.01-dismiss-equipment-return.md`. Анализы:
a1-domain.md, a2-arch.md, a3-tests.md (`/tmp/thegame-wf-000242/`).
База (a3, прогон): 3062/3062 ok (master c56368b).

**Статус: ЗАДАЧА ВЫПОЛНЕНА (финализация, 2026-10-23, ветка
task/000242): dc27342 (красные тесты + эта память) → 8d00a7c
(реализация + spec + репин + tasks pending→done + отчёт) →
648d1bc (CHANGELOG) → c72dea4 (коррекция W2-рецепта, doc-only) →
коммит финализации (отчёт: финальный прогон 3073/3073 ok, 0
fail). Squash в один коммит на мерже.**

## 1. Задача и цель — что добавлено/перенесено

Цель (ТЗ): при уходе наёмника в payWages (низкая лояльность, event
'left') его экипировка возвращается в hero.inventory — инвариант
«предметы не теряются НИКОГДА» (тот же, что закреплён 000230.06.01
для dismiss). Сейчас: splice записи c sheet.equipment БЕЗ unequip
(src/companions.js L452-455) — предметы существуют только в
экипировке уничтожаемой записи (лист не попадает и в dead_mercs —
там только ГИБЕЛЬ) — ПОТЕРЯНЫ (подтверждено кодом, a1 §6.6).

Выбрано: **(a) + (iii)**:
* **(a)** — единый ВНУТРЕННИЙ helper `returnEquipmentToHero`
  (канон-порядок `G.EQUIP_PHYS_SLOTS` + тот же `allyUnequip`
  failsafe), используемый и dismiss (рефактор БЕЗ изменения
  поведения — бит-в-бит), и payWages.
* **(iii)** — уход при низкой лояльности С экипировкой выполняется
  ТОЛЬКО когда ВСЯ экипировка возвращена в hero.inventory; если
  места нет (вес/слоты) — уход ОТЛАГИВАЕТСЯ: запись НЕ сплайсится,
  предметы остаются надетыми (failsafe), событие
  `{type:'left_blocked', npcId, reason}` + flash-строка в main.js.
  Повторная проверка — на следующей НЕОПЛАЧЕННОЙ смене дня
  (loyalty уже floor 0 → ≤ quit_low → «уйдёт верно» без ролла).

Отклонено:
* **(i)** «вернуть что влезло, остальное ???» — неконструктивен
  (механики «бросить на землю» нет; ТЗ сам: «НОЛЬ потери
  недопустимо»).
* **(ii)** «наёмник уводит невозвратимое с собой» (event 'left'
  +`data:[itemIds]`, строка дня «Забрал с собой: …») — спроектирован
  в полном объёме архитектурной станцией (a2-arch.md §2.4-2.5), но
  ОТКЛОНЁН решением Проектирования: (1) цель задачи — инвариант
  «предметы не теряются НИКОГДА», а (ii) СОХРАНяет потерю в
  угловом случае (инвентарь полон); (2) экипировка — СВОИ предметы
  игрока (общий инвентарь, 000194/000230.06: наёмник одет из
  hero.inventory) — «наёмник уводит» = предметы игрока
  исчезают из игры НАВСЕГДА (механики вернуть их нет: ни
  магазин-выкуп, ни повторный найм — новый найм = новая запись без
  предметов); (3) «видимость» (ii) слаба по каналу: flash эфемерен
  (hudFlashUntil = +5000 мс, main.js:1656), events НЕ
  сериализуются НИГДЕ (проверено: save.js — 0 срабатываний grep
  'events'; в сейв пишется только roster — serializeRoster 4 поля)
  → промахнулся по 5-секундному флэшу = потеря без следа;
  «осознанна и видна» не выдерживает проверки каналом; (4)
  континуум с прецедентом: 000230.06.01 закрепила «инвентарь без
  места — действие не выполняется, предметы не теряются» для той
  же доменной точки («наёмник перестаёт носить экипировку игрока»)
  — (ii) ввела бы ТРЕТЬЮ семантику (увольнение: блок; уход:
  забирает) — рассинхрон для игрока и будущих задач.
* **(б)** «локальная копия цикла в payWages» — дублирование
  hasEq/slots/guard-паттерна = 3 точки дрейфа (ровно то, что
  ретро 000230.06.01 флагало про два независимых splice-пути).

ТЗ-предупреждение («Состояние сейчас»): «В payWages „наёмник
остаётся“ как ответ на полный инвентарь НЕ подходит: уход по
лояльности — игровое решение, не отменяемое весом» — интерпретация
Проектирования: оно против СЛЕПОГО копирования dismiss-ответа
(безусловного «остаётся») как ДЕФОЛТА payWages; (iii) — НЕ слепой
дефолт, а УСЛОВНЫЙ блок (только когда есть экипировка И нет места)
с явной фиксацией, которую ТЗ требует для (iii) («выбрать только с
явной фиксацией в SPEC/memory и тестом» — выполнено: буллет SPEC
§2.6, этот файл, тесты W2/W3/W6/W7/V7). Решение наёмника НЕ
отменяется весом: `leaves = true` (loyalty ≤ quit_low —
детерминированно) — отлагается только механическая передача
экипировки; в первый день, когда место освободилось, — уход
происходит. ТЗ отдаёт финальный выбор «анализу с оценкой
игроко-видимости» — оценка проведена (a1 §2.2; здесь — итог).

Softlock НЕТ (a1 §2.2 п.6): место в hero.inventory ВСЕГДА можно
освободить (использовать/создать/проложить предмет; переодеть на
другого наёмника — allyEquip берёт из hero.inventory и освобождает
слот; одеть на себя). Пока уход заблокирован и игрок платит —
лояльность растёт (+2/день, СУЩЕСТВУЮЩАЯ механика восстановления;
при этом paid-дни не проверяют уход вовсе — существующий
payWages-поток) — давление ухода само исчезает.

## 2. Контракты и границы

### 2.1 Новый ВНУТРЕННИЙ helper (ЭКСПОРТОВ НЕТ — API_KEYS = 19 цел)

```
returnEquipmentToHero(hero, sheet, stopOnFirstFail) →
  {ok:true} | {ok:false, reason:string}
```
Размещение: замыкание src/companions.js, ПОСЛЕ allyUnequip
(сейчас L1116, до `return {...}` с экспортами) — группа
экип-хелперов; function declaration (хостится — вызов из dismiss
выше по файлу не нарушен, прецедент: dismiss уже вызывает
allyUnequip снизу).

* eq — тот же детект, что hasEq в dismiss (L295-300): sheet
  plain-объект, sheet.equipment plain-объект; sheet не-объект /
  без equipment / equipment пуст → `{ok:true}` (NO-OP: плоские
  записи — старый путь ухода побайтово, НЕ зависит от hero —
  W4/G1/V1-V5).
* slots — КАНОН-ПОРЯДОК `G.EQUIP_PHYS_SLOTS` (детерминизм, ноль
  новых RNG); defensive fallback `Object.keys(eq).filter(k =>
  k!=='weapon' && k!=='armor')` (дословно как в dismiss
  L307-310 — недостижим, но в коде).
* Зеркала 'weapon'/'armor' НИКОГДА не итерируются (алиасы:
  двойной unequip, подводный камень .06 §4.2).
* Пустые слоты (не string / '') — skip.
* На каждый занятый слот — ТОТ ЖЕ `allyUnequip(hero, sheet, slot)`
  (failsafe items.js: при отказе предмет остаётся надетым,
  eq[slot] восстановлен; guards 4/5 внутри allyUnequip через
  allyReject — единый словарь строк, helper НЕ дублирует их).
* `stopOnFirstFail=true` (dismiss): ПЕРВЫЙ отказ → немедленный
  `{ok:false, reason}` (STOP, остальные слоты не трогаются —
  семантика .06).
* `stopOnFirstFail=false` (payWages): пробуются ВСЕ занятые слоты
  независимо — что влезло, то в hero.inventory; что не влезло,
  остаётся надетым; reason в результате — ПЕРВЫЙ отказ в
  канон-порядке (детерминированно). Частичный возврат БЕЗОПАСЕН
  при (iii): наёмник в любом случае остаётся (ret.ok false →
  splice нет); «наполовину экипированный в отряде» — нормальное
  состояние; предметы — игрока; повторная попытка итерирует
  только ЗАНЯТЫЕ слоты (возвращённые — null — skip).
* Helper НЕ делает pre-loop allyReject (он остаётся в dismiss —
  §2.2: это и гарантирует бит-в-бит D3/G5d/D4).

### 2.2 dismiss — рефактор через helper, БИТ-В-БИТ (пины
D1/D2/D2b/D2s/D3/D4/G5/G5d/P7/U11 НЕ правятся и остаются зелёными)

Поток (src/companions.js L290-322) — меняется ТОЛЬКО блок
L307-319 (slots+цикл):
1. canDismiss — без изменений.
2. hasEq (L295-300) — без изменений, ИНЛАЙН (НЕ извлекать:
   использует только dismiss).
3. !hasEq → splice, `{ok:true}` — без изменений (плоские записи —
   D4/P5/U7 побайтово; hero на них не влияет).
4. `allyReject(hero, entry.sheet, 'unequip')` ДО мутаций → bad
   возвращается КАК ЕСТЬ (`{ok:false, reason}`, БЕЗ note) —
   без изменений (D3/G5d: точные guard-строки, без note).
5. `const r = returnEquipmentToHero(hero, entry.sheet, true);`
   `!r.ok` → `{ok:false, reason: r.reason, note:'увольнение не
   выполнено: предметы остались экипированными'}` (ТОЧНАЯ строка —
   D2/D2b/D2s), БЕЗ splice; иначе → splice, `{ok:true}` (без note —
   D1 `'note' in r === false`).
Равенство: тот же предикат, тот же pre-loop guard, тот же
канон-порядок, тот же per-slot allyUnequip, тот же STOP, те же
строки — разбегаться нечему (критерий приёмки рефактора — зелёный
полный прогон с D-пинами).

### 2.3 payWages — минимальный ханк (src/companions.js L452-455)

```
      if (leaves) {
        const ret = returnEquipmentToHero(character, e.sheet, false);
        if (ret.ok) {
          roster.splice(roster.indexOf(e), 1);
          events.push({ type: 'left', npcId: e.npcId });
        } else {
          events.push({ type: 'left_blocked', npcId: e.npcId,
            reason: ret.reason });
        }
      }
```
* `character` — СУЩЕСТВУЮЩИЙ 3-й аргумент (main.js:1629 передаёт
  live hero) — сигнатура НЕ меняется.
* Плоская запись (e.sheet undefined / без equipment) — helper NO-OP
  `{ok:true}` → старая ветка побайтово (все существующие уход-тесты
  + G1 + V1-V5 — зелёные без правок).
* Форма 'left' — БЕЗ ИЗМЕНЕНИЙ: `{type:'left', npcId}` побайтово
  (G1 deepEqual L1224 — жёсткий пин).
* 'left_blocked' — push НА МЕСТЕ 'left' (тот же цикл, та же
  позиция): порядок событий = wages_unpaid → left/left_blocked в
  порядке roster (W8-пин — deepEqual всего массива).
* Путь БЕЗ ухода (зарплата/лояльность, paid/unpaid-ветки) — НОЛЬ
  diff (ТЗ «НОЛЬ изменений»); РНГ (roll/eventSeed — только в полосе
  quit_high 21…40) — бит-в-бит.
* Проверка ухода — только после НЕОПЛАЧЕННОГО дня (существующий
  поток: paid-ветка return'ит раньше) → повторная попытка
  заблокированного ухода — каждый unpaid-день.
* JSDoc payWages: +events-строка `[{type:'left_blocked', npcId,
  reason}]` (000242) + строка «уход с экипировкой — авто-возврат
  (тот же failsafe, что dismiss); без места — отложен (
  left_blocked)».
* JSDoc dismiss: +1 строка «цикл возврата — общий хелпер
  returnEquipmentToHero (000242: dismiss — STOP; payWages —
  „всё, что влезло“)».
* Экспорты — 0 новых (API_KEYS = 19).

### 2.4 Событие 'left_blocked' и сейв v1

* Форма: `{type:'left_blocked', npcId, reason}`; reason — дословно
  из словаря allyReject/unequip: 'слишком тяжело (лимит веса)' |
  'нет свободных слотов инвентаря' (в игре) | 'нет персонажа' |
  'экипировка недоступна (items.js не загружен)' (деградация — в
  игре недостижимо: hero всегда валиден, main.js:1629). НЕ
  сочинять новые reason-строки.
* ЭФЕМЕРНО: events payWages НЕ сериализуются НИГДЕ (проверено:
  collectSaveData/save.js — только companions через
  serializeRoster — ровно 4 поля {npcId, sheet, loyalty,
  hiredDay}, dead_mercs, efir; grep 'events' по save.js — 0) —
  потребляются в том же onDay-тике (main.js → hudFlash) и
  выбрасываются. Следствия: (1) сейв v1 — 0-diff: НОВЫХ полей нет
  (ни в data.companions, ни в data.hero, ни top-level), версия НЕ
  поднимается (000031 не трогаем), чтение старых сейвов
  тривиально (новая форма в сейв не попадает); (2) «перманентного
  лога уходов» НЕТ — за рамками ТЗ не вводить.
* ТЗ-проверка «новая форма не ломает чтение старых сейвов» — по
  ФАКТУ тривиальна; ТЗ-формулировка «events уже сериализуются» —
  НЕВЕРНА (зафиксировать в tasks/result, deltas §3).

### 2.5 UI — один ханк src/main.js (onDay, цикл events L1631-1638)

main.js — ЕДИНСТВЕННЫЙ потребитель events payWages (grep по
src/ — только этот цикл). Отдельной панели 'left' НЕТ: рендер =
flash-строка (compLines → hudFlash) + перерисовка открытой панели
«Отряд» (squadUI.render — S4-пин) — ТЗ-пометка «panel 'left» —
уточнение (deltas §3).

```
            } else if (ev.type === 'left') {
              compLines.push(npcName(ev.npcId) + ' покинул отряд.');
            } else if (ev.type === 'left_blocked') {
              compLines.push(npcName(ev.npcId) + ' хотел уйти, но не смог '
                + 'вернуть экипировку: ' + ev.reason + '.');
            }
```
* ТОЧНАЯ flash-строка (V7-пин): «Вольк хотел уйти, но не смог
  вернуть экипировку: слишком тяжело (лимит веса).»
* Ветка 'left' — НЕ ТРОНУТА → бит-в-бит: строка «… покинул отряд.»
  (S1 includes 'покинул отряд' ДО saveNow — цел; V1 includes
  'Вольк покинул отряд.' — цел; V3 байт-в-байт 'День N.' — цел).
* Решение (a1 §2.4, подтверждено Проектированием): блок СО
  СТРОКОЙ (дефолт); ТИХИЙ блок отклонён: наёмник с loyalty 0,
  который «не уходит» без объяснения, — регресс UX (хуже самого
  (ii), который хотя бы флэшил); принцип ТЗ «не молчаливо»
  переносится на (iii); reason прямо actionable (игрок видит,
  ЧТО освободить). Стоимость: 1 else-if-ветка.
* Порядок compLines не меняется (строка wages_unpaid →
  left/left_blocked → «День N.» последней).

### 2.6 SPEC-фиксация (ОБЯЗАТЕЛЬНО по ТЗ для (iii): «выбрать
только с явной фиксацией в SPEC/memory и тестом»)

spec/companions.md, «Контракт и жалованье» — НОВЫЙ буллет ПОСЛЕ
L15 («Увольнение — в диалоге, возврат денег нет.»), ДО «Повторный
найм после увольнения возможен…»:
```
  * Уход при низкой лояльности С экипировкой — экипировка
    возвращается в общий инвентарь героя (000242); инвентарь без
    места — уход откладывается до освобождения (предметы не
    теряются — то же правило, что увольнение, 000230.06.01).
```
(4 строки → wc -l 137 → 137+4; Δ — СЧИТАТЬ ПО ФАКТУ).
Буллет «Бой» (L55-60, «…возврат экипировки герою — при снятии и
при увольнении (000230.06.01: …)») — НЕ правится (минимальность;
W1 includes-пин 000230.06.01 по той строке — не трогать).
tests/spec-split.test.js L112 — РЕ-ПИН `"companions.md": 137` →
137+Δ от факта + комментарий «000242: +Δ (буллет «Контракт и
жалованье»: уход с экипировкой — возврат/отложение)» (ЕДИНСТВЕННАЯ
техническая правка тестов). SPEC_SECTIONS (9 H2, без H3) и
SPEC_ROOT_LINES — НЕ ТРОГАЮТСЯ (буллет внутри существующей
секции; корневой SPEC.md не тронут).
Отдельный wording-тест (tests/spec-000242-*.test.js) НЕ
вводится — раздел ТЗ «Тесты» требует только поведенческих пинов
(строго по ТЗ: не больше); буллет закреплён репином +
поведенческими W/V-тестами.

## 3. Карта тестов (всё — ЧИСТЫЕ ДОБАВЛЕНИЯ концом файлов с
заголовком задачи «Задача 000242», паттерн 000230.06.01/000241;
семантика существующих тестов НЕ меняется)

tests/companions.test.js — EOF-блок (после L1827; node, реальный
каталог; I, C, NPC_VOLK (L1216), entryWithSheet, createCharacter,
BROWSER_CHAIN — уже в скопус; второй наёмник — `const
NPC_ASHKA = NPCS.find((n) => n.id === 'merc_ashka')` локально в
блоке, жалованье 1). Hero-фикстуры: `createCharacter()` +
`I.addItem` (МАТЕРИАЛИЗАЦИЯ ленивого inventory — паттерн D1/G5) +
`hero.gold = 0` (неоплата). loyalty 30 → −20 → 10 ≤ quit_low 20 →
«уйдёт верно» БЕЗ ролла (seed-независимо; конкретный день
фиксируется пином).

| # | red | сценарий | ассерты (суть) |
|---|-----|----------|----------------|
| W1 | RED | ТЗ-пин дословно: iron_sword + chainmail на Вольке (allyEquip ×2), loyalty 30, gold 0 | paid false, total 1; deepEqual events `[{wages_unpaid,total:1},{type:'left',npcId:'merc_volk'}]` (полный возврат → ТОЧНАЯ старая форма, НОВЫХ ПОЛЕЙ НЕТ); roster 0 (та же ссылка); `e.sheet.equipment.torso === null` И `right_hand === null` (экипировка нигде не зафиксирована); `totalQty(hero,'iron_sword') === 1` И `totalQty(hero,'chainmail') === 1` (СЕЙЧАС 0/0 — ПОТЕРЯ) |
| W2 | RED | переполнение ВЕСА (рецепт D2 дословно: ровно 30 кг / 8 слотов + iron_sword на наёмнике) | фаза 1: deepEqual events `[{wages_unpaid,total:1},{type:'left_blocked',npcId:'merc_volk',reason:'слишком тяжело (лимит веса)'}]`; roster 1; `equipment.right_hand === 'iron_sword'` (failsafe — ЦЕЛ); totalQty 0. фаза 2 (removeItem 1× battle_axe 3 кг → 27; payWages след. день: 27 + 1.5 = 28.5 ≤ 30): 'left'; roster 0; totalQty 1 |
| W3 | RED | переполнение СЛОТОВ (рецепт D2s: 20/20 wood_sword, вес 20<30; сырое `equipment {right_hand:'iron_sword'}`) | фаза 1: left_blocked reason 'нет свободных слотов инвентаря'; roster 1; слот цел. фаза 2 (−1 wood_sword): 'left'; totalQty 1 |
| W4 | зелёный | плоская запись (без sheet) + loyalty 30 | deepEqual events `[{wages_unpaid,total:1},{type:'left',npcId:'merc_volk'}]` — ТОЧНАЯ старая форма ухода без экипировки (пин формы) |
| W5 | зелёный | путь БЕЗ ухода бит-в-бит: Вольк с iron_sword, loyalty 70 (→50 > 40) | deepEqual events `[{type:'wages_unpaid',total:1}]`; `equipment.right_hand === 'iron_sword'` (не тронут); totalQty 0 |
| W6 | RED | зеркало сейва: Вольк (iron_sword, loyalty 30) + Ашка (chainmail, loyalty 70) | Вольк ушёл (totalQty 1), Ашка осталась (50 > 40); `C.serializeRoster(roster)`: length 1, deepEqual отсортированных ключей `['hiredDay','loyalty','npcId','sheet']` (РОВНО 4 — v1, новых полей нет), `sheet.equipment.torso === 'chainmail'`; `C.deserializeRoster(NPCS, snap)`: dropped [], roster 1, round-trip equipment |
| W7 | RED (vm) | деградация БЕЗ items.js (паттерн G5d: BROWSER_CHAIN минус companions.js → capturedG → loadIn → delete capturedG.equip/unequip) | без crash; roster 1 (БЕЗ splice — безопасное направление: не могу вернуть → НЕ ухожу, ноль потери); left_blocked reason 'экипировка недоступна (items.js не загружен)'; предмет в слоте |
| W8 | RED | ЧАСТИЧНОСТЬ МЕЖДУ записями: Вольк (iron_sword) + Ашка (leather_kaftan), оба loyalty 30, герой 28.5 кг / 3 слота (рецепт D2b) | deepEqual events `[{wages_unpaid,total:1},{left: volk},{left_blocked: ashka, reason:'слишком тяжело (лимит веса)'}]` (порядок = порядок roster); Вольк: totalQty 1 (ровно 30.0 ≤ 30+1e-9); Ашка: roster 1, кафтан в слоте (31.5 > 30) |
| W9 | RED | ЧАСТИЧНОСТЬ ВНУТРИ записи — пин stopOnFail=false: герой 29.0 кг / 4 слота (stone_chunk×13 + wood_log×4 + wood_sword + healing_potion); сырое `equipment {torso:'knight_plate'(7кг), right_hand:'short_bow'(1кг)}` | фаза 1 (канон: torso ДО right_hand): плита ОТКАЗАНА (36 > 30) — остаётся в слоте; лук ВЕРНУЛСЯ (ровно 30.0 — totalQty 1 — ЭТО отличает stop=false от stop=true: при STOP лук не тронут); left_blocked (weight); roster 1. фаза 2 (освободить ≥7 кг, напр. 7× stone_chunk): 'left', roster 0, оба предмета в hero |

tests/companions-cycle.test.js — EOF-блок (vm e2e, ПОЛНАЯ цепочка
index.html; харнесс boot/seedSave/readSave/mkHero/mainFrameAt —
существующий; host = JSON round-trip; Array.isArray ДО host();
HUD-чтение ПОСЛЕ mainFrameAt — паттерн V1). equipped-сценарий —
ТОЛЬКО seed НОВОГО формата записи {npcId, sheet, loyalty,
hiredDay} с equipment (backfill-запись старого формата equipment
НЕ несёт — S2-инвариант absent→absent).

* **V6 (RED) — зеркало сейва e2e**: seed — day 2, hero
  `mkHero({gold:0})` (инвентарь пуст), companions [Вольк loyalty
  30, sheet канон 10 ключей (рецепт backfilledEntry файла) +
  equipment `{right_hand:'iron_sword'}` (host-side
  `I.sanitizeEquipment`, require items.js в шапке блока)] →
  `setDay(3)` (30−20 = 10 ≤ 20 — уход ВЕРНО):
  hud includes 'Вольк покинул отряд.' И !includes('хотел уйти') И
  endsWith 'День 3.'; readSave: `version === 1` (v1 — без новых
  обязательных полей/миграций), `data.companions` deepEqual `[]`,
  hero.inventory.slots содержит `{id:'iron_sword', qty:1}`
  (предмет В МЕСТЕ после serialize/JSON); `h.errors.length === 0`.
  ЗЕРКАЛО: НОВЫЙ `boot(saved)` (свежий sandbox, тот же сейв) →
  totalQty(восстановленный hero, 'iron_sword') === 1, companions
  []. RED сейчас: splice без возврата → меча нет в hero.inventory.
* **V7 (RED) — переполнение e2e + новая строка дня**: тот же
  seed, НО hero-инвентарь `{slots:[{id:'stone_chunk', qty:20}]}` =
  ровно 30 кг / 1 слот (reagent — стопка 1 слот, 20×1.5) →
  `setDay(3)`: БЛОК: hud includes ТОЧНОЙ строки 'Вольк хотел уйти,
  но не смог вернуть экипировку: слишком тяжело (лимит веса).' И
  !includes('покинул отряд') И endsWith 'День 3.'; readSave:
  companions length 1 (Вольк ОСТАЛСЯ: loyalty 10, equipment
  цела), hero.inventory — stone_chunk×20, меча НЕТ; errors 0.
  RED сейчас: текущий код ВСЕГДА splices (companions [],
  'покинул отряд').

**RED-счёт: ровно 9** (W1, W2, W3, W6, W7, W8, W9, V6, V7) — все
ERR_ASSERTION осмысленные (поведение/содержимое, не синтаксис);
верификация — фактический прогон красной станции. Зелёные с
первого: W4, W5.

Технические правки новых тестов на зелёной станции (2026-10-23,
реализация; семантика ассертов НЕ меняется):
* W7 — `res.events` — vm-реалм: strict deepStrictEqual роняет на
  прототипах при СОДЕРЖИМОМ совпадении («Values have same
  structure but are not reference-equal») — JSON-нормализация
  перед deepEqual (паттерн L715 файла: «JSON — разные realm»).
* W9 — арифметика рецепта: фаза 1 возвращает лук (вес ровно
  30.0), после 7× stone_chunk (−10.5) — 19.5, НЕ 18.5 (18.5 =
  29.0 − 10.5 без учёта возвращённого лука); фаза 2: 19.5 + 7 =
  26.5 ≤ 30 (уход всё равно проходит).

Существующие пины БЕЗ правок (критерий приёмки рефактора):
D1/D2/D2b/D2s/D3/D4/G5/G5d (dismiss бит-в-бит — ТЗ «ре-пин
D1/D2 бит-в-бит» = остаются зелёными), G1 (deepEqual events +
ЗОЛОТЫЕ ПИНЫ QUIT_SEED_VOLK_D5/QUIT_ROLL_VOLK_D5), уход-пины
L517-587 (flat), детерминизм L666, API_KEYS = 19 (node + vm),
C1/C2/C3/E1 (000230.06), P5/P7 (squad-panel), U7/U8/U11
(npc-hire-ui), companions-cycle S1-S4 + V1-V5 (includes +
unarmed e2e + золотой пин seed 1776998158), save S1-S4 (0-diff),
SEED_PIN_*, index-order (index.html 0-diff), SPEC-пины (кроме
репина companions.md 137).

Чувствительность (станция реализации; мутации НЕ коммитятся):
* M1 — payWages: убрать проверку ret.ok (всегда splice) → W2/W3/
  W7/W8/V7 красные.
* M2 — helper: stopOnFirstFail игнорируется (всегда continue) →
  D2/D2b/D2s красные (dismiss-поведение изменилось).
* M3 — helper: stopOnFirstFail игнорируется (всегда stop) → W9
  фаза 1 красная (лук не возвращён).
* M4 — main.js: убрать ветку left_blocked → V7 красный (строки
  нет в hud).

## 4. Что важно будущим задачам (из ТЗ-ссылок и решений)

* **000230.20** (swap-fail в src/items.js — ДРУГАЯ точка, тот же
  класс потери): НЕ смешивать (ТЗ явно) — items.js в 000242
  0-diff; пайплайн allyEquip/allyUnequip не тронут.
* Ретро-000230.06.01 finding #2 (minor, src/companions.js:453) —
  ЗАКРЫТ этой задачей (пины W1/V6).
* **(ii) «наёмник уводит предметы» — задокументированная
  альтернатива** (полный дизайн — a2-arch.md §2.4-2.5): если
  когда-либо появится канал перманентного лога/письма, решение
  может быть пересмотрено; стоимость переключения — форма
  'left' (data) + строка main.js + пере-пины.
* Заблокированный наёмник (loyalty 0 + полный инвентарь) получает
  wages_unpaid-флэш каждый unpaid-день (СУЩЕСТВУЮЩЕЕ поведение:
  loyalty floor 0); при ОПЛАТЕ лояльность растёт (+2/день —
  существующая механика восстановления) — пока платят, давление
  ухода исчезает (paid-дни проверку не проходят) — наёмник может
  не уйти никогда, пока идут деньги (а1 risk #11 — зафиксировано).
* Вес/слоты героя при возврате — тот же композит, что в dismiss
  (000230.18 known-issue — общий; двойного фикса не нужно,
  memory .06.01 §3).
* Если в будущем проверка ухода в payWages будет проходить и на
  paid-днях — логика retry не зависит от этого (блок внутри
  `if (leaves)`).
* Events эфемерны — если в будущем нужен «лог событий отряда»,
  'left_blocked' уже игроко-читаем (reason — дословно из словаря).
* Flash-строки — эфемерны (5 с) — общее свойство compLines
  (существующее ограничение, не расширяется).

## 5. Подводные камни

1. Канон-порядок EQUIP_PHYS_SLOTS: torso (idx3) ДО right_hand
   (idx5) — рецепт W9 (тяжёлый в раннем слоте отказывается, лёгкий
   в позднем возвращается) на этом построен; зеркала
   'weapon'/'armor' НИКОГДА не итерировать.
2. Helper — LOOP-ONLY: pre-loop allyReject остаётся в dismiss —
   это и гарантирует бит-в-бит D3/G5d (guard-строки БЕЗ note) и
   D4 (плоская запись — helper NO-OP, hero не влияет). НЕ
   переносить allyReject внутрь helper (guard-отказ в dismiss
   получил бы note — deepEqual D3/G5d сломался бы).
3. Форма 'left' — побайтово `{type:'left', npcId}` (G1 deepEqual —
   жёсткий пин); 'left_blocked' — только НА МЕСТЕ 'left' (порядок
   событий wages_unpaid → left/left_blocked в порядке roster).
4. Includes-пины 'покинул отряд' (S1/V1) — ветка 'left' в
   main.js не трогается; новая ветка — отдельный else-if ПОСЛЕ
   неё (подстрока на месте, payWages-вызов не сдвинут — S1).
5. Events НЕ сериализуются — перманентный «лог уходов» НЕ
   вводить за рамками ТЗ; сейв v1 0-diff, версия не
   поднимается, миграций нет.
6. Hero-фикстуры: `createCharacter().inventory` — undefined
   (ленивый ensureInventory) — материализовать `I.addItem` ДО
   allyEquip (паттерн D1/G5); в игре hero ВСЕГДА материализован
   (restore/первый addItem) — guard 'нет персонажа' недостижим
   (только vm, W7).
7. W7 (vm): delete equip/unequip — на capturedG (Game ДО загрузки
   companions.js — UMD-ловушка 000038), НЕ на финальном Game.
8. V6/V7 seed — НОВЫЙ формат сейва (запись со sheet + equipment
   через I.sanitizeEquipment, канон 10+1 ключ): backfill (старый
   формат) equipment не несёт (absent→absent, S2) — уход
   equipped-наёмника старым форматом не воспроизвести.
9. stone_chunk/wood_log/resurrect_scroll — reagents (стопка =
   1 слот, MAX_STACK 99) — рецепты D2/D2b/D2s и V7 (stone_chunk×20
   = 30 кг / 1 слот) на этом построены.
10. ОБЩИЕ файлы (tests/companions.test.js,
    tests/companions-cycle.test.js, spec/companions.md,
    tests/spec-split.test.js) — параллельные волны: наши ханки —
    ЧИСТОЕ ДОБАВЛЕНИЕ концом файла с заголовком задачи / 1 строка
    (репин); ребаза под .merge-pending-локом, union.
11. Флейк чужого теста — одиночный перезапуск
    `node --test tests/<file>` + пометка в tasks/result/000242.md
    (протокол .06.01 §4.10). Падение «чужого» детерминизм-теста —
    НЕ флейк, а нарушение (новый RNG) — стоп, анализ.
12. Точные цифры рецептов (кг/слоты) — проверять фактическим
    прогон на красной станции (вес двоично точен 1.5/0.5;
    граница 30.0 ≤ 30 + 1e-9 — паттерн D2b).
13. Один полный npm test за раз в worktree (memory: no parallel
    full tests; тест 000054 мутирует src/npc-data.js).

## 6. Итоговый план реализации (по файлам)

| # | файл | что делаем | ожидаемая дельта |
|---|------|-----------|------------------|
| 1 | src/companions.js | (зелёная) новый ВНУТРЕННИЙ helper returnEquipmentToHero ПОСЛЕ allyUnequip (L1116) с JSDoc (§2.1); dismiss L307-319 → helper(true) + тот же note (§2.2); payWages L452-455 → §2.3; JSDoc payWages (+2-3 строки: events left_blocked + авто-возврат) + JSDoc dismiss (+1 строка) | ~+45, −10 |
| 2 | src/main.js | onDay цикл events (L1636-1638): +ветка else-if 'left_blocked' + flash-строка (§2.5) | +3 |
| 3 | tests/companions.test.js | КОНЕЦ (после L1827): блок «Задача 000242» W1-W9 (§3) | ~+280-330 |
| 4 | tests/companions-cycle.test.js | КОНЕЦ: блок «Задача 000242» V6/V7 (§3; + require items.js в шапке блока для I.sanitizeEquipment/totalQty) | ~+100-130 |
| 5 | spec/companions.md | «Контракт и жалованье»: новый буллет после L15 (§2.6) | +4 (Δ от факта) |
| 6 | tests/spec-split.test.js | L112: `"companions.md": 137` → 137+Δ от факта + комментарий «000242: +Δ (буллет «Контракт и жалованье»: уход с экипировкой — возврат/отложение)» (ЕДИНСТВЕННАЯ техническая правка) | 1 строка изменена |
| 7 | memory/000242-paywages-left-equipment-return.md | этот файл | новый |
| 8 | tasks/pending/000242.md → tasks/done/000242.md | перенос (ОБЯЗАТЕЛЕН с коммитом) | 0 |
| 9 | tasks/result/000242.md | отчёт (сверки: база 3062 → ровно 9 not ok (красная) → все зелёные; deltas ТЗ: events НЕ сериализуются (ТЗ-формулировка не верна), «panel 'left» = flash-строка; флейки — если будут) | новый |
| 10 | CHANGELOG.md | станция мержа: отдельный коммит «Задача 000242: CHANGELOG — …», дата = день мержа, «### Игровой процесс»: «Уход наёмника при низкой лояльности: экипировка возвращается в общий инвентарь героя; инвентарь без места — уход откладывается до освобождения (предметы не теряются)». Программная часть не перечисляется | ~+2 |

НЕ ТРОГАЕМ (явно): src/items.js (000230.20 — другая точка),
src/sheet.js, src/combat.js, src/efir.js, src/npc.js, src/ui.js
(вызывающих payWages там НЕТ — main.js:1629 единственный),
index.html (НОВЫХ <script> НЕТ), tests/index-order.test.js,
assets/* (НОВЫХ SVG НЕТ — svg.test.js не касается), spec/items.md,
SPEC_SECTIONS/SPEC_ROOT_LINES, константы SEED_PIN_*.

Коммиты ветки (squash в один на мерже): №1 КРАСНАЯ — тесты
(W1-W9 + V6/V7) + эта память (npm test: ровно 9 not ok — W1, W2,
W3, W6, W7, W8, W9, V6, V7 — верифицировать фактическим
прогоном; остальные зелёные — вкл. D1/D2/D2b/D2s/D3/G5d, G1,
V1-V5); №2 ЗЕЛЁНАЯ — src/companions.js + src/main.js +
spec/companions.md + репин spec-split + tasks (done, result).
Далее по протоколу: .merge-pending (номер задачи) → rebase на
актуальный мастер → ПОЛНЫЙ npm test (флейк чужого — одиночный
перезапуск + пометка) → ff-only мерж → удалить .merge-pending →
отдельный коммит CHANGELOG (дата мержа). Worktree/ветка — только
после task-notification run'а.

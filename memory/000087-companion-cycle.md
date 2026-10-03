# 000087 — Отряд в игровом цикле: смена дня, гибель, повторный найм (дизайн-контракт)

Статус: ДИЗАЙН ЗАКРЫТ (станция «Проектирование», workflow 000087, 2026-10-03).
**ЭТОТ файл + `memory/000087-party-game-loop.md` (шпаргалка по циклу) —
КАНОНИЧЕСКИЙ контракт 000087.**
ТЗ: `tasks/pending/000087.md` (source of truth). Родитель: 000065.
Порядок мержа: после 000085 (УЖЕ в master — база worktree 0ef1751).
000115 (эфир-сейв) — параллельный, форму efir-сейва 000087 НЕ ТРОГАЕТ.
Параллельный анализ: `/tmp/thegame-wf-000087/a1-domain.md`, `a2-arch.md`,
`a3-tests.md` (все три свёрены с кодом worktree 2026-10-03).
База: npm test = 1443/1443 зелёных (проверено 2026-10-03, HEAD task/000087).
Все номера строк — ТЕКУЩИЕ (мастер смещается; ориентир — контентные якоря).

## 1. Что добавлено / перенесено — файлы

| Файл | Дельта | Содержание |
|---|---|---|
| src/main.js | ~+75 строк | 5 ханков: (A) 3 хелпера после roster-блока (npcName/companionAllies/combatEndCompanions); (B) onDay — payWages + compLines + композиция hudFlash; (C/D/E) 3 боевые точки — `const combat = startCombat({... rosterData: companionAllies(), ...})` + `return combat` + вызов combatEndCompanions в onEnd (мир/дебаг → hudFlash; подземелье → ds.log.push) |
| src/combat-ui.js | ~+6 строк | 1 ханк: L942 `allies: (efirData ? [efirData] : []).concat(Array.isArray(opts.rosterData) ? opts.rosterData : [])` + JSDoc `@param opts.rosterData` |
| tests/companions.test.js | ~+120 строк | блок «Задача 000087»: G1–G3 (золотые ТЗ — контракт-пины, зелёные уже в red-фазе) + W3 (баланс) |
| tests/companions-cycle.test.js | ~+450 строк (НОВЫЙ) | vm e2e, полная цепочка index.html: S1–S4 (структурный скан src; S4 — правка по итогам ревью) + V1–V5 (красные) |
| memory/000087-companion-cycle.md | этот файл | контракт |
| memory/000087-party-game-loop.md | новый | шпаргалка: точки цикла, фикс-строки, повторный найм, числа баланса |
| CHANGELOG.md | ~+6 строк | «Игровой процесс» 2026-10-03: отряд в боях, жалованье, повторный найм (отдельный коммит, паттерн 000126) |
| tasks/pending/000087.md → tasks/done/000087.md | перенос | + tasks/result/000087.md (финальный коммит) |
| **НЕ МЕНЯЕТСЯ** | 0 | src/companions.js (ядро 000079/000082 — 14 экспортов, API_KEYS НЕ репинится), src/combat.js (формула allyXp), src/efir.js, src/save.js, src/ui.js, src/building-actions.js, index.html (0 script-тегов/0 CSS/0 SVG), assets/*, все существующие тесты (семантических правок НЕТ — a3 §5: ни одной) |

Новых модулей НЕТ: решение = клей в двух файлах, уже в цепочке
(a1 §1: «000087 реализуется без новых модулей»).

## 2. Ключевые решения (фиксация «решить в анализе/памяти»)

**D1. Смена дня (onDay): payWages МЕЖДУ buff-cleanup и playerUI.render(),
ДО saveNow (L896).**
Аргумент day = НОВЫЙ день (day.js advanceDay: `day += 1` и потом
`fn({day, reason})`) — сид (day, npcId) детерминирован.
Почему: ТЗ фиксирует порядок; 000085 D10 — НОЛЬ новых saveNow (только
порядок); payWages мутирует hero.gold и roster in place → saveNow в конце
onDay фиксирует итог (видим в сейве — тест V2).
Композиция hudFlash (a2 D1):
```js
hudFlash = (due.length ? 'Мобилизуются новые группы мобов.\n' : '')
  + (compLines.length ? compLines.join('\n') + '\n' : '')
  + 'День ' + day + '.';
```
Строки отряда — МЕЖДУ «Мобилизуются…» и «День N.»; «День N.» остаётся
ПОСЛЕДНЕЙ строкой (существующий паттерн). Пустой отряд: payWages
total=0 → `events: []` (000079: «при total = 0 событий НЕТ») → compLines
пусто → flash **БАЙТ-В-БАЙТ** как сейчас ('День N.') — все существующие
setDay/rest vm-тесты зелёные (проверено grep: ни один тест не сеет
companions + смену дня одновременно). Guard — `hasCompanions` + typeof
payWages (БЕЗ roster.length — «молчание пустого» — контракт ядра 000079).

**D2. Гибель спутника — ВАРИАНТ B: живое состояние боевого объекта,
ЛЮБОЙ исход.**
`combat.units.filter(u => u.side==='ally' && u.kind==='merc' && !u.alive)`.
Почему: res.allyXp есть ТОЛЬКО при 'victory' и только по выжившим
(checkVictory, combat.js L653-656); вариант A «посланные − ids allyXp»
«воскресил бы» наёмника, убитого в 'dead'/'fled'-бою — противоречит SPEC
«гибель — окончательна». В onEnd единственный доступ к combat-объекту =
ВОЗВРАЩАЕМОЕ ЗНАЧЕНИЕ startCombat (combat-ui finish: `ctx = null` ДО
`onEnd(result)`, L886-891).
Фильтр kind==='merc' исключает Эфир (kind 'efir', efir.js L199): Эфир по
SPEC бессмертен (в следующем бою 100% HP), dead_mercs — только наёмники.
Мёртвый: deadMercs.push (dedup indexOf-guard — защита от форged-дублей,
restore 000085 уже валидирует) + roster.splice (guard i>=0) + строка.
Дизайн-зазор a3 §3.2 ЗАКРЫТ: реализация outcome-независима (гибель в
'fled'/'dead' тоже фиксируется); красные тесты проверяют минимальную
поверхность ТЗ (V5: victory + мутация юнита), 'dead'/'fled' покрыты тем
же хелпером + структурным пином S2 (полный vm e2e 'dead' с гибелью не
требуется — ТЗ не называет исход, детерминировать сложнее).

**D3. Опыт: applyCombatXp в onEnd ТОЛЬКО при victory (res.allyXp).**
Почему: 000082 считает долю в combat.js (выжившие kind 'merc',
`Math.round(base × companion_xp_share)`, ОДИН base на всех — доли равны);
клей только применяет (xp += share; while-цикл — один бой может дать
несколько уровней; events level_up). Игрок 100% (res.xp, строка «Победа!
+N опыта…» НЕ ТРОГАЕТСЯ) и Эфир 100% (addEfirXp в combat-ui finish ДО
ctx=null, 000081) — НЕ ТРОГАЮТСЯ, НЕ ДУБЛИРУЮТСЯ (V4 пинит рост
efir.xp = ровно result.xp, не 2×). Нереалистичный случай (мёртвый id в
allyXp — невозможен в реальном бою: checkVictory — только выжившие;
возможен в mutation-тесте): xp применяется первично, затем запись
удаляется — без краха.

**D4. Хелперы в main.js (module scope), ПОСЛЕ roster-блока (L301-309),
ДО комментария «// Задача 000093:» — уникальный контентный якорь.**
```js
function npcName(id) {
  const npc = G.npcById ? G.npcById(NPCS, id) : null;
  return (npc && npc.имя) ? npc.имя : String(id);
}
function companionAllies() {
  if (!hasCompanions || typeof G.companions.allyDataForEntry !== 'function')
    return [];
  const out = [];
  for (const e of roster) {
    const npc = G.npcById ? G.npcById(NPCS, e.npcId) : null;
    const d = G.companions.allyDataForEntry(e, npc);
    if (d) out.push(d);
  }
  return out;
}
function combatEndCompanions(res, combat) {
  if (!hasCompanions) return [];
  const xpLines = [];
  if (res && res.outcome === 'victory' && Array.isArray(res.allyXp) &&
      typeof G.companions.applyCombatXp === 'function') {
    const r = G.companions.applyCombatXp(roster, res.allyXp);
    if (r && Array.isArray(r.events)) {
      for (const ev of r.events) if (ev.type === 'level_up')
        xpLines.push(npcName(ev.npcId) + ' повысил уровень (до ' +
          ev.level + ').');
    }
    const gained = res.allyXp.filter((g) => g && g.xp > 0);
    if (gained.length)
      xpLines.push('Спутники: +' + gained[0].xp + ' опыта (' +
        gained.map((g) => npcName(g.id)).join(', ') + ').');
  }
  const deadLines = [];
  if (combat && Array.isArray(combat.units)) {
    for (const u of combat.units) {
      if (u.side === 'ally' && u.kind === 'merc' && !u.alive) {
        if (deadMercs.indexOf(u.id) === -1) deadMercs.push(u.id);
        const i = roster.findIndex((e) => e && e.npcId === u.id);
        if (i !== -1) roster.splice(i, 1);
        deadLines.push(npcName(u.id) + ' погиб в бою.');
      }
    }
  }
  return xpLines.concat(deadLines);
}
```
Почему в main.js: main.js — клей; нового модуля нет (нет script-тега,
index.html, API). Клозуры над живыми NPCS (L226) / roster / deadMercs
(L301-309) / hasCompanions — всё объявлено раньше. npcName: «призрак» →
голый id (паттерн 000083/000085); G.npcById — УЖЕ используется в main.js
(L233). companionAllies: призраки — тихий skip (allyDataForEntry → null,
000082); деградация UMD → [] (бой без отряда, не крах). combatEnd-
Companions: мутирует ЖИВЫЕ массивы (паттерн 000085: мутация in place,
НИКАКИХ переприсваиваний — const-ссылки держат deps-бандл и state).

**D5. Три боевые точки (startCombatAt L948 / maybeStartCombat L1250 /
startDungeonCombat L1439):**
1. `return G.combatUI.startCombat({...})` → `const combat = G.combatUI.
   startCombat({... rosterData: companionAllies(), ...}); ... return
   combat;` — сигнатура функции НЕ меняется (buildingActions и
   `__game.actions.startCombat` получают то же combat/null). rosterData —
   СНИМОК на старте боя (в бою roster меняется только гибелью — читается
   из combat.units в конце; D2).
2. onEnd — ПЕРЕД `G.playerUI && G.playerUI.render();`:
   - мир/дебаг:
     ```js
     // Задача 000087: отряд — xp/уровни/гибель (до saveNow, D8).
     const compLines = combatEndCompanions(res, combat);
     if (compLines.length)
       hudFlash = hudFlash + '\n' + compLines.join('\n');
     ```
     (в maybeStartCombat — после присваиваний `hudFlash = flash;` /
     `hudFlash = 'Вы очнулись…'` / `hudFlash = 'Вы ушли от боя.'`; в
     startCombatAt — после if/else-flash и teleport-блока).
   - подземелье (канал — ds.log, НЕ hudFlash):
     `for (const l of combatEndCompanions(res, combat)) ds.log.push(l);`
     (журнал — строка = событие, паттерн 000066; порядок: строка «…
     повержена. +N опыта.» → строки отряда).
`combat` в closure onEnd — безопасен (onEnd вызывается из finish() ПОЗЖЕ
return). startCombat → null (isActive guard — на всех трёх точках guard
УЖЕ перед вызовом) → onEnd не вызывается → ханки безопасны. НЕ вводить
`let combat` до вызова.

**D6. combat-ui.js — ОДИН ханк (L942) + JSDoc @param:**
```js
// Эфир (задача 000081): постоянный союзник (см. выше).
// Задача 000087: отряд — opts.rosterData (массив данных makeAlly,
// main.js companionAllies()) — ПОСЛЕ Эфира. Без rosterData —
// allies БAYТ-В-БАЙТ как раньше.
allies: (efirData ? [efirData] : []).concat(
  Array.isArray(opts.rosterData) ? opts.rosterData : []),
```
Почему: комментарий L910-918 ЯВНО предобъявляет эту строку 000087
(«000087 расширит ЭТУ ЖЕ строку: [efirData, ...rosterData]»). Эфир
остаётся ПЕРВЫМ — якорь placeAllies (px−1, py−1, «всегда со мной»).
Имя опции — `rosterData` (НЕ `allies`): allies — понятие ядра боя,
rosterData — данные отряда (a2 D3 — финальная адjudикация; a1-вариант
opts.allies отклонён). Все существующие вызовы/тесты без rosterData →
`[]` → бит-в-бит.

**D7. Повторный найм — БЕЗ КОДА.**
Почему (верифицировано 2026-10-03): ui.js renderHireTab (L655)
ПЕРЕСЧИТЫВАЕТ `C.candidatesForTavern(npcs(), roster, deadMercs || [])`
при КАЖДОМ open; deps-бандл main.js L1048-1049 передаёт ЖИВЫЕ ссылки
(000083). Увольнение → roster.splice (000083) → кандидат ВЕРНУЛСЯ при
следующем open (даже в тот же день — день на фильтр не влияет). Гибель →
deadMercs.push (D2) → отфильтрован НАВСЕГДА. Фиксируют: существующие
U3/U8 (npc-hire-ui.test.js) + новые G2/G3 (unit).

**D8. saveNow — НОЛЬ новых точек (000085 D10): только ПОРЯДОК** —
события отряда ДО уже существующего saveNow:

| Точка | main.js (текущие строки) | 000087 добавляет |
|---|---|---|
| onDay | L896 | payWages + compLines (D1) |
| конец debug-боя | L1014 | combatEndCompanions (D5) |
| конец боя мира | L1313 | combatEndCompanions (D5) |
| конец боя подземелья | L1480 | combatEndCompanions (D5) |
| найм/увольнение | 000083 onChange | не трогаем |

GAP из canon 000085 D10 («debug-бой БЕЗ saveNow — решение 000087») —
УСТАРЕЛ: закрыт 000077 (saveNow L1014). Файл 000085 в done — НЕ ПРАВИТСЯ
(правила tasks/CLAUDE.md).

**D9. Фиксированные строки сообщений** (паттерн 000083 «Нанят: …» /
«Уволен: …» — глагольный префикс; ТЗ фиксирует ПОДСТРОКИ без точек —
тесты assert'ят includes(); точки добавлены: существующие строки «День
N.» / «Победа! … золота.» заканчиваются точкой). Полные таблицы —
`memory/000087-party-game-loop.md` §3.
Решения по расхождениям a1/a2:
- гибель — **«<имя> погиб в бою.»** (a2/a3 — канон; a1 «пал в бою»
  отклонён: «пал в бою!» — строка БОЕВОГО журнала combat.js L616, другой
  слой, не трогается);
- xp — **ОДНА строка «Спутники: +N опыта (Имя1, Имя2).»** (a2; a1-
  поимённые «<имя>: +N опыта» отклонены — доли РАВНЫ: round(base×share),
  один base на всех, поимённые строки избыточны);
- уровень — «<имя> повысил уровень (до N).» на КАЖДОЕ level_up.

**D10. Баланс — каталог НЕ правится.**
Жалованье (assets/npc, 000078): volk 1, ashka 1, baldor 2, mira 2, torga
3, rena 3. Самое дорогое трио (torga+rena+baldor/mira) = 8 золота/день =
16% дохода квеста ~50 золота. Порог W3 (a2): Σ жалованье ЛЮБОГО трио из
реального каталога ≤ 10 з/день (20% от ~50) — проходит с запасом.
Почему: ТЗ правит ДАННЫЕ каталога ТОЛЬКО при дисбалансе — дисбаланса
нет. Числа в тесте — из реального NPCS/SETTINGS (паттерн 000053), без
хардкода.

**D11. Детерминизм — инварианты.**
- НОВОГО rng НЕТ: payWages — только существующий
  `roll(eventSeed(day, npcId, 'quit'))` (000079); applyCombatXp — чистая.
- Бой: seed-логика НЕ меняется (debug `extra.seed||42`, мир
  `hash2(x,y,0x5eedc0de)`, подземелье `hash2(id,level,0xb055)`). Отряд
  влияет на бой ДАННЫМИ makeAlly (детерминированы уровнем + каталогом) —
  осознанное изменение с 000080/000081; бои БЕЗ отряда — бит-в-бит
  (companionAllies() → [] → allies = [efir] как сейчас).
- SETTINGS — ЖИВОЕ чтение (companion_loyalty через payWages,
  companion_xp_share через combat.js) — форма 000098 действует без
  перезагрузки; в тестах НЕ мутировать (live-read).
- placeAllies: 4 союзника (Эфир+3) = 5 якорей на поле 7×7 — хватает;
  fallback bottom-up scan существующий.

**D12. Тесты — поверхность КРАСНЫХ = ровно 7 (S1–S3, V1, V2, V4, V5) —
проверено ревью 2026-10-03 на ba7ea7a; V3 — зелёный регрессионный пин
(по построению — байт-в-байт «День N.»).**
- tests/companions.test.js — блок «Задача 000087» (node, direct require;
  **ЗЕЛЁНЫЕ уже в red-фазе** — ядро 000079/000082 в master; это
  контракт-пины ТЗ-золотых, НЕ красные):
  - G1 (ТЗ, верифицировано node): SETTINGS.companion_refusal.base = 0
    (t.after — restore); герой Харизма 15 (отказ 30%−2%×15 = 0%), gold 40
    (цена Волька), найм день 2 → gold 0, лояльность 65 (50+15). Неоплач.
    дни 4/5/6: 65→45 (день 4, >40 — без ролла) → 25 (день 5:
    eventSeed(5,'merc_volk','quit') = **726194406**, roll = **0.7841**
    ≥ 0.5 — остаётся — золотой пин ролла) → 5 (день 6: ≤20 — ушёл ВЕРНО);
    events дня 6 = [{wages_unpaid,total:1},{left,merc_volk}]; roster [];
    gold 0 (не тронут). Два независимых прогона — deepEqual (паттерн L602).
  - G2 (ТЗ): deadMercs = ['merc_volk'] → candidatesForTavern НЕ содержит
    volk, остальные наёмники на месте (фильтры независимы: нанят+мёртв).
  - G3 (ТЗ): найм → увольнение → candidatesForTavern ВЕРНУЛ (тот же
    день) → повторный найм (тот же сид — base 0) → новая запись
    (hiredDay = день, loyalty = старт 50+Харизма).
  - W3 (баланс, TЗ п.5): для ЛЮБОГО трио реального NPCS:
    Σ найм.жалованье ≤ 10 (20% от ~50); фактически максимум = 8.
- tests/companions-cycle.test.js — НОВЫЙ (vm e2e, полная цепочка
  index.html; СВОЙ harness — дублирование bootWithSave-паттерна 000085
  С ДОБАВЛЕННЫМ возвратом hud-элемента; bootWithSave в save.test.js НЕ
  править — свойство 000085; dублирование харнессов принято, 000083):
  - **S1–S3 — структурный скан src** (паттерн day.test.js L406: чтение
    файла, окно между маркерами, regex): S1 — окно onDay:
    `G.companions.payWages(` ДО `saveNow(` + 3 литерала; S2 — 3 окна
    onEnd: applyCombatXp + чтение allyXp + `deadMercs.push(` + строка
    level_up; S3 — `rosterData: companionAllies()` × 3 в main.js +
    allies-строка combat-ui.js содержит `opts.rosterData`.
  - **V1** (ТЗ: день без золота, уход): seed `{day:2, companions:
    [merc_volk {1,0,65,2}], hero gold 0}` → `g.actions.setDay` × 3 (реальные
    onDay, дни 3/4/5): 65→45 (день 3, >40 без ролла) → 25 (день 4: roll
    eventSeed(4,'merc_volk','quit') — **литерал зафиксировать в
    red-фазе существующим myRoll**; assert'ится ВЫЧИСЛЕННЫЙ исход, не
    желаемый) → 5+уход (день 5: ≤20); roster []; gold 0; hud (после
    rAF-кадров, HU5): «Не хватает денег…», «Вольк покинул отряд»; сейв
    (beforeunload): companions [].
  - **V2** (ТЗ: день с золотом): seed `{day:2, companions:[volk 65],
    hero gold 10}` → rest(): gold 10−1=9, loyalty 67 (cap 100), flash
    «Жалованье выплачено.» + «День 3.», сейв: companions[0].loyalty 67,
    hero.gold 9 (payWages ДО saveNow — видно в сейве).
  - **V3** (регрессия пустого отряда): seed БЕЗ companions → rest() →
    hud.textContent БАЙТ-В-БАЙТ 'День N.' (инвариант «без отряда ничего
    не изменилось»).
  - **V4** (конец боя: победа, паттерн B24/B25): seed отряд [volk] +
    усиленный герой (heroExtra: level 8, hp 200, gold 200) →
    `g.actions.startCombat(0)` → c.units содержит merc (kind 'merc',
    id npcId, level из entry) ПОСЛЕ Эфира (пин 000081: эфир ПЕРВЫМ) →
    `c.phase='over'; c.result = {outcome:'victory', xp:50, gold:1,
    defeated:1, allyXp:[{id:'merc_volk', xp:25}]}` →
    `G.combatUI.handleCode('Escape')` → finish → onEnd: roster[0].xp
    0→25 (applyCombatXp; уровень — по xpForNext-порогу, второй бой до
    level_up), level_up → строка в flash; **зелёные пины в том же
    тесте**: hero.xp += res.xp 100% (000082), efir.xp += result.xp
    ровно 1× (000081 — НЕ дублируется, а не 2×); saveNow — xp в сейве.
  - **V5** (гибель, ТЗ): тот же бой; мутация merc-юнита `u.alive=false;
    u.hp=0` + victory → onEnd: state.deadMercs ['merc_volk'],
    state.roster [] (splice), сейв dead_mercs ['merc_volk'],
    hud «Вольк погиб в бою.», volk НЕ в candidatesForTavern
    (G.candidatesForTavern(NPCS, state.roster, state.deadMercs)).
- RED-верификация (a3 §4): npm test → **fail ровно 7** (S1–S3, V1, V2,
  V4, V5) — ревью 2026-10-03 перепроверило на ba7ea7a; V3 — зелёный
  регрессионный пин (по построению). Причины красных содержательные
  (нет точек подвешивания), НЕ синтаксис/крах (цепочка грузится чисто,
  errors 0). После реализации — весь набор зелёный:
  1443 + 7 красных + 1 V3 + 4 пины (G1–G3, W3) = 1455
  (если red-станция сольёт W3 в существующий тест — 1451; арифметика —
  за station, МНОЖЕСТВО КРАСНЫХ = 7).
- Технических правок существующих тестов — **НИ ОДНОЙ** (a3 §5
  проверено: нет модуля/экспортов/тегов/разделов сейва/.cp-классов;
  onDay-flash нигде не зафиксирован — grep «Мобилизуются» только
  src/main.js).

**D13. Merge-риск — main.js ГОРЯЧИЙ** (параллельно 000091/000109/000112;
000115 efir-сейв — форму не трогаем). 5 контентно-якорных ханков
(main.js: хвост roster-блока, onDay, 3 start-функции) + 1 (combat-ui
L942 + JSDoc). Якоря уникальны и НЕ пересекаются регионами параллельных
задач (keydown/__game.state — 000086; building-wiring — 000091/000092/
000095; хвосты collectSaveData/restoreFromSave — 000109; efir-serde —
000115). Существующие структурные пины регионы 000087 НЕ закрывают
(проверено 2026-10-03: day.test.js L406-425 пинит ПРОХОД 3 drawSprites
G.groupVisible, не onDay; hud-text ассертов на смену дня НЕТ; HU7 пинит
`let hudFlash`/`function flash`/`function renderHud` — 000087 пишет
значения, переменные не добавляет). Ребейз — ПО КОНТЕНТ-ЯКОРЯМ +
полный npm test. combat-ui.js: проверить при ребейзе, что чужие задачи
не мержат ханк в L942 (на момент анализа — нет).

**D14. CHANGELOG.md** — «Игровой процесс», 2026-10-03 (отдельный
коммит, паттерн 000126): отряд участвует в боях (выжившие — опыт/
уровни; гибель — окончательна), жалованье на смене дня (+2 лояльности /
−20 и возможный уход), повторный найм после увольнения (после гибели —
нельзя). Программная часть не перечисляется.

## 3. Контракты и границы (точные сигнатуры)

```js
// src/main.js (module scope, после roster-блока L301-309, до «// Задача 000093:»)
function npcName(id) → string
  // G.npcById(NPCS, id)?.имя || String(id) — «призрак» → голый id (000083).
function companionAllies() → allyData[]
  // !hasCompanions || !G.companions.allyDataForEntry → [] (деградация);
  // allyDataForEntry(e, G.npcById(NPCS, e.npcId)) — null (призрак) → skip;
  // данные makeAlly (kind 'merc', 000082), порядок = порядок roster.
function combatEndCompanions(res, combat) → string[]
  // victory && Array.isArray(res.allyXp) && typeof applyCombatXp →
  //   applyCombatXp(roster, res.allyXp):
  //   level_up events → '<имя> повысил уровень (до N).'
  //   выжившие xp>0 → 'Спутники: +N опыта (Имя1, Имя2).' (одна строка;
  //   N — общая доля; порядок имён = порядок allyXp = порядок c.units)
  // ЛЮБОЙ исход: combat.units side==='ally' && kind==='merc' && !u.alive →
  //   deadMercs.push (dedup) + roster.splice + '<имя> погиб в бою.'
  // Порядок результата: xp-строки, потом строки гибели.
  // МУТАЦИЯ: roster, deadMercs (live, in place — 000085). Чистый вывод —
  // только массив строк.

// onDay (main.js): G.companions.payWages(roster, NPCS, hero, day) —
//   day = НОВЫЙ день (arg колбэка); events:
//   wages_paid  → 'Жалованье выплачено.'
//   wages_unpaid → 'Не хватает денег на жалованье — лояльность падает.'
//   left        → '<имя> покинул отряд.'
//   (splice roster — ВНУТРИ payWages, 000079; main.js НЕ шпилит повторно.)
//   Композиция: [Мобилизуются…\n][compLines \n-разделённые +\n]['День N.']

// 3 боевые точки: opts.rosterData: companionAllies() (снимок на старте);
//   const combat = startCombat(...); return combat (сигнатура не меняется).
//   onEnd (до playerUI.render, до существующего saveNow):
//   мир/дебаг → hudFlash += '\n' + compLines.join('\n');
//   подземелье → for (const l of compLines) ds.log.push(l);

// src/combat-ui.js
startCombat opts: + {Array<object>} [opts.rosterData] — данные отряда
  (allyDataForEntry, 000082) — в allies ПОСЛЕ Эфира. Не передан /
  не-массив → [] (бит-в-бит старое поведение).
```

Границы (ЧТО НЕ ДЕЛАЕТ 000087):
- не трогает src/companions.js (14 экспортов; API_KEYS = 14 — не
  репинится), src/combat.js (формула allyXp L653-656, livingAllies),
  src/efir.js, src/save.js, src/ui.js, src/building-actions.js;
- не добавляет точек saveNow (D8), новых разделов/полей сейва
  (companions/efir/dead_mercs — 000085, формы не меняются,
  CURRENT_VERSION = 1 без бампа);
- не трогает форму efir-сейва (000115 параллельно) — 000087 не пишет
  ни одного поля efir; Эфир — ТОЛЬКО через G.efir API (addEfirXp —
  000081, в finish — не дублируется); Эфир в dead_mercs — никогда
  (фильтр kind 'merc');
- не меняет опыт игрока (100%, res.xp) и существующие flash-строки:
  «Победа! +N опыта, +N золота.», «Вы очнулись. −20% золота.»,
  «Вы ушли от боя.», «(Босс|Группа) повержена. +N опыта.»,
  «Мобилизуются новые группы мобов.»;
- не добавляет <script>/CSS/SVG в index.html, не создаёт ассеты;
- не переприсваивает roster/deadMercs (const, live — 000083 §4/000085);
- не правит SPEC.md, задачи в master не меняются (только финальный
  перенос 000087 pending→done в своей ветке).

## 4. Ленивые ссылки и guards (UMD-инварианты 000038/000053)

- main.js: `const G = globalThis.Game` — ОДИН снапшот на load (L13, не
  трогаем). Все доступы к G.companions — typeof-guard: hasCompanions —
  load-time const (прецеденты 000083/000085, L305-306); typeof payWages/
  allyDataForEntry/applyCombatXp — ЛЕНИВЫЙ, в момент вызова →
  деградация без companions.js: смена дня без отряда, бой без отряда,
  краха нет. console.error на загрузке УЖЕ есть (L307-310) — не
  дублируется.
- hero — в scope onDay (module scope, объявлен раньше onDay).
- roster/deadMercs/NPCS — живые клозуры; хелперы читают их в момент
  вызова (снапшотов внутри хелперов нет).
- SETTINGS — live через payWages/combat.js (main.js не перечитывает).
- combat-ui: opts.rosterData — Array.isArray-guard (мусор/отсутствие →
  [] — бит-в-бит); console.error не нужен (поле опциональное,
  main.js всегда передаёт массив).
- placeAllies: 5 якорей на 7×7 — хватает (D11).

## 5. Что важно будущим задачам

- **000086 (панель «Отряд», KeyC)**: `__game.state.roster/.deadMercs` —
  live (000085 D9). Отряд теперь меняется в 3 точках (onDay —
  жалованье/уход; конец боя — xp/уровни/гибель; найм/увольнение —
  000083) — перерисовка панели: найм/увольнение — 000086 (render
  после найма/увольнения в ui.js); конец боя — 000086 ЗАКРЫВАЕТ панель
  на старте боя (3 точки main.js); **onDay — 000087 (правка по итогам
  ревью 2026-10-03): `if (G.squadUI && G.squadUI.isOpen())
  G.squadUI.render();` ПОСЛЕ payWages, ДО playerUI.render (guard —
  no-op до мержа 000086; пин S4)**; hudFlash виден всем — renderHud
  каждый кадр.
- **000091/000109/000112 (параллельные, main.js)**: регионы 000087 —
  хвост roster-блока, onDay, 3 start-функции; якоря — D13. Не касаться
  их регионов (keydown/__game.state, building-wiring, хвосты сейва).
- **000115 (эфир-сейв)**: форму efir не трогает; efir-юнит в units
  (kind 'efir') исключён гибельным фильтром — его правки serde не
  ломают гибель mercs.
- **000072 (buffs)**: порядок onDay: restoreDay → due → buff-cleanup →
  **payWages** → render → flash → saveNow. payWages ПОСЛЕ buff-cleanup
  (день уже новый: buff.day < day удалены до того, как отряд читает day).
- **combat-ui L942**: будущие расширения allies — Эфир ВСЕГДА первый
  (якорь placeAllies px−1, py−1).
- **000109 (cities)**: его restore-секция — в хвост restoreFromSave
  (~L632); 000087 не трогает restoreFromSave вообще → конфликта нет.
- Форма записи roster не меняется (000079/000085) → бампов сейва нет.

## 6. Подводные камни

1. **hudFlash-композиция**: существующие строки НЕ менять — только
   средняя вставка (D1). Порядок: Мобилизуются → строки отряда →
   «День N.» (день — последняя строка, как сейчас). V3 (байт-в-байт
   'День N.' без отряда) — страховка.
2. **payWages ДО saveNow, ПОСЛЕ buff-cleanup** (порядок onDay зафиксирован).
3. **res.allyXp — только victory**: гибель на 'fled'/'dead' — ТОЛЬКО из
   combat.units (D2); applyCombatXp — victory-guard (иначе — мусор).
4. **Эфир 1×**: addEfirXp в combat-ui finish — НЕ трогать; V4 пинит рост
   efir.xp = ровно result.xp (не 2×).
5. **`const combat` в onEnd**: closure безопасен (onEnd позже return);
   `let combat` до вызова НЕ вводить; startCombat → null → onEnd не
   вызывается (isActive guard на всех 3 точках).
6. **Double-splice**: payWages шпилит roster САМ (000079); main.js по
   events.left строит только строку.
7. **deadMercs dedup**: indexOf-guard (restore 000085 валидирует, защита
   от гипотетической второй гибели — дешёвая).
8. **Подземелье — ds.log.push ПО СТРОКАМ** (не join('\n') — журнал:
   строка = событие, паттерн 000066).
9. **VM-тесты**: flash виден, пока performance.now() < flashUntil —
   гонять rAF-кадры ПЕРЕД чтением hud.textContent (паттерн HU5);
   кросс-реалм: `assert.ok(Array.isArray(state.roster))` ДО host()
   (host(undefined) БРОСАЕТ — 000085 §6.4); ошибки vm не instanceof
   Error хоста.
10. **Форма efir-сейва — 000115 параллельно**: 000087 не пишет ни одного
    поля efir; Эфир в units kind 'efir' — гибельный фильтр не трогает.
11. **roster — live-массив** (restore: length=0 + push) — 000087 только
    splice/push, НИКАКИХ переприсваиваний (const, 000083 §4).
12. **API_KEYS companions.js (14) — НЕ репинить**: экспорты не меняются
    (новых модулей/экспортов НЕТ — это отличает 000087 от 000085).
13. **Числа — из каталога** (000053): жалованье в W3 — из реального NPCS
    (require '../src/npc-data.js'), не литералы; SETTINGS — live, в
    тестах не мутировать companion_* (live-read payWages/combat.js).
14. **main.js — горячий файл**: ханки региональные, соседние блоки
    (quests/respawn/teleport/saveNow) НЕ рефакторить; ребейз — по
    контент-якорям + полный npm test.

## 7. Дельты (ТЗ vs код/канон)

1. ТЗ: onDay «~строка 425» — реально L884 (мастер сместился).
2. ТЗ: «кандидаты — game-state roster + dead_mercs + каталог» —
   candidatesForTavern УЖЕ делает это (000079/000083); 000087 только
   наполняет deadMercs боями.
3. Canon 000085 D10 «GAP: debug-бой БЕЗ saveNow» — УСТАРЕЛ: 000077
   закрыл (L1014).
4. ТЗ: «конец боя — обработчик в main.js» — точек ТРИ (debug L948 /
   мир L1250 / подземелье L1439); трактовка: ВСЕ ТРИ (подземелье тоже
   бой; dead_mercs глобальный в сейве).
5. ТЗ: «Эфир — 100% в свой пул (000082/000081)» — УЖЕ реализовано в
   combat-ui finish (000081); 000087 НЕ дублирует.
6. ТЗ: «выжившие спутники — доля companion_xp_share» — combat.js уже
   считает allyXp (000082); 000087 только применяет (applyCombatXp).
7. ТЗ без разделов «Ограничения»/«Файлы» — ограничения взяты из
   workflow-текста и canon-файлов.

## Коммиты (последующие станции)

1. `Задача 000087: красные тесты` — tests/companions.test.js (G1–G3, W3),
   tests/companions-cycle.test.js (S1–S3, V1–V5), memory/000087-*.md
   (memory коммитится С тестами — станция Проектирования коммитов НЕ делает).
   RED-верификация: fail ровно 7 (S1–S3, V1, V2, V4, V5); V3 — зелёный
   регрессионный пин (перепроверено ревью 2026-10-03 на ba7ea7a).
2. `Задача 000087: src/main.js + src/combat-ui.js — отряд в игровом цикле`
   (D1–D6; весь набор зелёный).
3. `Задача 000087: CHANGELOG — …` (D14, отдельный коммит).
4. (fixups после анализ-агентов, при необходимости).
Каждый коммит: последняя строка `Co-Authored-By: Claude Code
<noreply@anthropic.com>`. Мерж-стадия — оркестратор: .merge-pending →
rebase по смыслу (D13) → npm test → merge → удалить .merge-pending.

# 000193 — Книга заклинаний под активным юнитом (UI-контракт)

**СТАТУС: РЕАЛИЗАЦИЯ ВЫПОЛНЕНА (`6886a18`) + правки по итогам ревью.**
Сопутствующий файл к
`memory/000193-ally-spell-mechanics.md` (механика каста: формулы, пул/мана,
порядок проверок — там). Этот файл — UI: книга под активным юнитом
(игрок/наёмник/Эфир), снятие гейта 000179, K-путь, формулы/максимумы строк.

**Superseded**: `memory/000179-book-active-unit-gate.md` §6(a) — «гейт
снимется при внедрении книги для активного юнита» — 000193 внедряет ровно
это: ветка ally в spellbookUnitGate удалена, allyCanDo('spellbook') больше
не player-only, unitOf → активный юнит. Файл 000179 остаётся для истории;
его пины (CU179-ROW / CU179-EFIR) **семантически ре-пинаются** 000193 —
ТЗ явно меняет механику (книга на ходу спутника теперь РАБОТАЕТ, а не
затемнена). Аналогично `memory/000179-spellbook-ally-turn-gate.md` —
superseded по тому же пункту.

## 1. Ханки src/combat-ui.js (book-секция L1589-1960; G-снапшот L19-38)

1. **unitOf(c)** (L1595-1598): `return c.player;` →
   `return activeUnit(c) || c.player;` — единственная точка замены
   (комментарий L1595 уже обещал: «000193: заменится на активного
   персонажа»). activeUnit (L1617) — function declaration, hoisted.
2. **canResurrect(c)** (L1608-1615): `const u = unitOf(c);` →
   `const u = c.player;` (решение Д-H основного файла: бит-в-бит 000166/
   000171 во всех фазах; resurrectChk L1785+ — НЕ трогать, его
   activeUnitId-ветка остаётся — кнопка воскрешения player-only,
   территория 000171/000196).
3. **spellbookUnitGate(c)** (L1674-1685): УДАЛИТЬ ветку
   `if (id !== 'player') return { ok:false, reason:'недоступно активному
   персонажу' }`; остаться: result → «бой окончен» (phase 'victory'),
   phase !== 'player' → «не ваш ход» (ходы мобов — книга по-прежнему
   закрыта), else {ok:true}. Комментарий: ветка 000179 снята 000193
   (книга — активного).
4. **rowChk(c, row)** (L1694-1699): после гейта, ПЕРЕД spellBook/
   G.Spells.canCastSpell:

```
const u = unitOf(c);
if (u !== c.player) {
  if (G.AllySpells && typeof G.AllySpells.canCastAllySpell === 'function')
    return G.AllySpells.canCastAllySpell(c, u, row.id, c.targetId);
  if (!allySpellsWarned) {
    allySpellsWarned = true;
    console.error('000193: Game.AllySpells не загружен — строки книги
союзника недоступны');
  }
  return { ok: false, reason: 'недоступно активному персонажу' };
}
```

   (флаг allySpellsWarned — паттерн spellBookWarned L1655; один
   console.error на сессию.)
5. **castRow(c, spellId)** (L1757-1773): та же ветка с
   `G.AllySpells.castAllySpell(c, u, spellId, c.targetId)` (деградация —
   то же сообщение + отказ). Успех — оба пути: c._fx = {type:'cast',
   name} + bookOpen = false; отказ — logRejection + книга открыта
   (UX 000149 без изменений).

- **bookRows(c)** (L1639-1649) — БЕЗ ИЗМЕНЕНИЙ: entriesFor(unitOf(c),
  catalog) сам берёт активного; неизвестный id — degraded-строка (name=id,
  desc:'', mana:0, poolKey:null, icon:null, spells.js L38-41) → строчка
  «id — » (mana 0, no -off), клик → отказ «неизвестное заклинание» —
  без краха (CB-6-стиль инъекций в UI безопасен).
- **renderBook(c)** (L1895-1945) — БЕЗ ИЗМЕНЕНИЙ: пустая книга → одна
  строка «—» (.combat-spellrow-off, БЕЗ dataset.spell — ре-пин CU179-ROW);
  steady-state оптимизация (сигнатура строки: title/dataset/className,
  sig = `${title}|${id}|${cls}`) работает для союзников без правок.
- **Кнопка «Книга заклинаний» (act=spellbook)** — БЕЗ ИЗМЕНЕНИЙ в build()
  (L1546-1547: disabled/title — из canDoAction('spellbook')): новое
  состояние приходит из allyCanDo (combat.js: книга пуста → «заклинаний
  нет», иначе ok — см. основной файл §6).
- **stateEl L1515-1525 (000199 HUD)** — НЕ ТРОГАТЬ.

## 2. K-путь (c.cast / KeyK / кнопка «Каст») — решение

Семантика 000168 БЕЗ ИЗМЕНЕНИЙ: strongestKnown(u, 'урон'), пул c.efs
(efirPool), мана u.mp, цель allyTarget (000198, в master). Изменяется
ТОЛЬКО формула урона → 1:1 с пайплайном (основной файл §6, Д-K). Книга —
ДОПОЛНИТЕЛЬНЫЙ путь для Эфира (все 6 действий), K — быстрый урон-каст.
Кнопка «Каст» (castHealVis L1531-1535: activeIsEfir) — не трогать.
«Лечение» (H) — не трогать (c.heal-диспетчеризация; адаптер allyHealAction
— основной файл §6).

## 3. Формулы/максимумы для строк книги («Мана N · Заклинание (Атрибут)»)

- Строки — entriesFor (spellbook.js): каталогные «мани»/«атрибут»
  (spells-data): spark 3/Инт, frost_bolt 4/Инт, mend 3/Мудр, light_heal
  6/Мудр, fireball 6/Инт, flame_burst 10/Инт, magic_shield 5/Мудр, vine
  5/Мудр, shadow_bolt 7/Инт, greater_heal 11/Мудр, stone_skin 8/Мудр,
  nature_blessing 7/Мудр, blizzard 12/Инт, ward 12/Мудр, chill 4/Инт,
  inferno 20/Инт, resurrect 15/Мудр.
- Максимумы/лимиты: мана — БЕЗ регена (u.mp = 5+Инт+Мудр на старте боя;
  startRound рефиллит ТОЛЬКО пулы); пул — 1+floor(атрибут/10) на раунд;
  дальность — 4 (урон/ослабление/контроль; воскрешение — БЕЗ дальности);
  цель — моб (side !== 'ally'); щит — броня 1+степень, 3 хода (плоское
  поглощение до 0, тик startRound).
- Книги (source: npc-data.js / efir.js): наёмник support (meditation) —
  [mend, light_heal]; ranged (120g) — [spark, frost_bolt]; melee/shield/
  ranged (50g) — [] (кнопка «Книга» disabled: «заклинаний нет», строки —
  «—»). Эфир — старт [spark, mend]; открытия по уровню 5/8/10/12/15/20/
  22/25/30: light_heal / frost_bolt / fireball / magic_shield / vine /
  greater_heal / resurrect / ward / nature_blessing.

## 4. Тестовая обвязка (vm-цепи)

- **loadCombatUi** (tests/combat-ui.test.js L153+): после блока
  spellbook.js (L233-237) — ПЕРЕД combat-ui.js:

```
if (opts.withAllySpells) {
  // 000193: ally-spells.js — после spells/spellbook, перед combat-ui
  // (G-снапшот — UMD-ловушка 000038; паттерн withSpells/withEfir).
  vm.runInContext(src('ally-spells.js'), sandbox, { filename: 'ally-spells.js' });
}
```

- **scene84**: `withAllySpells: !!opts.allySpells` (рядом с withEfir/
  withSpells L1463-1465). Старые тесты опцию не передают → цепи
  бит-в-бит (модуль не грузится → деградация-ветки не срабатывают).
- **Полная цепь (createCombat, vm)** — pick up автоматически из index.html
  (тег Д-L основного файла) — без правок.

## 5. Новые красные vm-тесты (в tests/ally-spells.test.js)

- **CU193-BOOK** (наёмник): support-merc (локальный хелпер addMerc193:
  makeAlly({role:'support', attrs:{wisdom:4, intelligence:3, dexterity:4},
  ...} + u.spells=['light_heal']; phase 'player', c.activeUnitId=merc.id):
  KeyQ — книга = [light_heal] (строки ИГРОКА отсутствуют: у игрока
  spark/mend — их строк нет), строка title '' (ресурсов хватает), мана
  строки «6»; клик — castAllySpell:merc сам ранен (hp maxHP−4) → self-heal
  amount round((4 + 0.5·4 + 1)·1) = 7 → u.mp 9→3 (light_heal 6),
  u.spellWis 1→0, игрок (mp/пулы/лог) нетронут, c._fx cast, книга закрыта,
  лог «X лечит себя (+7).»; restore — KeyQ на ходу игрока: строки игрока
  обратно.
- **CU193-EFIR** (Эфир): scene84({efir, spells, allySpells}): phase
  'player', active = Эфир (book [spark, mend], c.efs полные, u.mp 11):
  книга = [spark, mend] без -off (title ''); c.targetId = id волка
  (геометрия d ≤ 4) + клик по «spark» — лог `Эфир: «Искра» — Волк: 6.`,
  c.efs.spellInt 1→0, u.mp 11→8, волк −6, игрок нетронут, c._fx cast,
  книга закрыта.
- **CU193-OFF** (недостаток): на ходу Эфира u.mp = 0 → строка «mend»
  -off, title verbatim «не хватает маны (3)»; клик — ровно ОДНА
  строка отказа в логе, КАСТ не произошёл (hp/пулы/мана — нетронуты,
  c.efs.spellWis не сгорел), книга ОСТАЛАСЬ открыта.
- **CU193-DEGR** (покрытие деградации, фолло-ап ревью 000193;
  живёт в tests/combat-ui.test.js, НЕ в ally-spells.test.js — там
  цепь ВСЕГДА грузит модуль): scene84({spells:true}) БЕЗ allySpells
  (G.SpellBook/G.Spells на месте, G.AllySpells НЕТ — битый порядок),
  наёмник с НЕНУСТОЙ книгой (mend), книга открыта на ходу игрока
  (строки [spark, mend] без -off — бит-в-бит 000149); на ходу
  наёмника строки перестроены — [mend] -off + title verbatim
  «недоступно активному персонажу»; console.error — ровно 1 на
  сессию (флаг allySpellsWarned, паттерн spellBookWarned); стаб-клик
  — ровно 1 строка отказа в лог, трат НЕТ (игрок И наёмник), cast-FX
  нет, книга открыта; restore — строки игрока без -off (деградация
  не sticky). Прецедент формы — CU182-NOSP (кнопка) / CU188-ROWCHK
  (строки, G.Spells).

(node-раздел N1-N5 — основной файл §8/§14.)

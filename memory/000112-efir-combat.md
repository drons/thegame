# 000112 — Эфир в бою: ИИ (поддержка) и свои действия — КОНТРАКТ

Станция Проектирование (workflow 000112). ТЗ: tasks/pending/000112.md
(источник правды). Входы: a1-domain.md, a2-arch.md, a3-tests.md;
сверено с кодом worktree (базовая линия 05c9214 = мерж 000084;
сигнатуры вставок сверены построчно: allyAct:1227-1264,
dealDamageToPlayer:552-585, endPlayerTurn:1266-1320, createCombat:
1565-1660, combat-ui startCombat:907-973).

ВАЖНО (состояние master — ОБНОВЛЕНО в раунде ревью 000112):
master УШЁЛ от 05c9214 (наша база) до c994f4f — 15+ смерженных
задач (000077/000083/000085/000091/000092/000095/000099/000114/
000115/000126/000129 и др.; diff-стат 05c9214..c994f4f проверен).
Среди них 000085 + 000115 ПРАВЯТ src/efir.js (serializeEfir/
deserializeEfir + id-валидация/level-guard — В ХВОСТ фабрики и в
return-блок, В ТО ЖЕ МЕСТО, куда 000112 добавляет buildEfirUnit:
после строки «EFIR_SKILLS, EFIR_SPELL_UNLOCKS,») и tests/efir.
test.js (R1: 11 → 13 БЕЗ buildEfirUnit; наша ветка: 11 → 12 С
buildEfirUnit — ОБЕ правки тот же тест, те же строки + шапка
файла); 000077 — tests/combat.test.js (секция C1 BUILDING_BOSS —
В ХВОСТ, у нас там же секция 000112; оба append после секции
000076) + src/combat.js (+18 строк GROUP_RECIPES.BUILDING_BOSS
~стр. 159 — ДАЛЕКО от наших вставок) + верх CHANGELOG.md
(«## 2026-10-03» → «### Игровой процесс»); 000083/000099/000086/
000092/000095 — main/ui/index. src/combat-ui.js на master НЕ
ТРОНУТ. → РЕБЕЙЗ НА c994f4f НЕЧИСТЫЙ, конфликты:
(1) src/efir.js — хвост фабрики (обе группы функций) + return-
блок (одна и та же строка вставки);
(2) tests/efir.test.js — R1 (строки списка ключей/FUNCS/цифры +
шапка) + хвост файла (оба append после T9: у master 000115-тест
deserialize, у нас EF-1..4);
(3) tests/combat.test.js — хвост файла (конкатенация секций).
ПЛАН РЕШЕНИЯ (обязателен на стадии мержа):
* efir.js — СОХРАНИТЬ ОБА НАБОРА: buildEfirUnit (наша) +
  serializeEfir/deserializeEfir (master) и return-блок с 14
  экспортами (12 функций + 2 данных);
* R1 — «ровно 14 (12 функций + 2 данных)», полные списки — §6;
* хвосты тест-файлов — КОНКАТЕНАЦИЯ обеих секций (порядок
  секций свободный — тесты независимы);
* src/combat.js — ребейз ЧИСТЫЙ (проверено);
* CHANGELOG.md — наша ветка НЕ ТРОГАЛА (не в дифе) → конфликта
  НЕТ; буллет — отдельный коммит ПОСЛЕ ребейза (§9);
* после ребейза — ПОЛНЫЙ npm test (особенно сейв-тесты
  000085/000115 + EF-1..4/CB-1..7 + R1/R7/R8/R9 + 000111 T1..T9):
  buildEfirUnit НЕ ломает deserializeEfir — форма сейва 5 полей
  НЕ меняется (buildEfirUnit — апгрейд юнита боя, state НЕ
  мутирует).
Старая запись «ребейз на 7ab2c03 чистый» — УСТАРЕЛА (верна была
только до мержа 000085/000115). 000080/000081/000082/000111/
000084 — СМЕРЖЕНЫ. Контракт для 000113/000117/000118/000119.
Базовая линия на момент анализа: npm test — 1356 pass / 0 fail
(прогоном, зелёная); после правок раунда ревью — 1369/1369.

## 1. Что добавлено (скоуп)

* `src/efir.js`: `buildEfirUnit(efir, c)` — боевой профиль Эфира
  (явные maxHP/hp/mp, урон «Касание духа», пул `c.efs`, снапшот
  лордов `u.efirSkills`, ссылка `c.efir`). Новый экспорт (12-й) — в
  хвост return-блока.
* `src/combat.js` (ГОРЯЧИЙ — правки ТОЛЬКО вставки, ноль изменённых
  строк): диспетчеризация хода Эфира в `allyAct` (1 строка-условие),
  поглощение щита в `dealDamageToPlayer` (вставка блока), refill пулов
  Эфира + тик щита в `endPlayerTurn` (вставка блока), новые функции
  `strongestKnown` / `mostWounded` / `efirTurn` (один новый блок),
  `combatInternals.dealDamageToAlly` (1 член объекта).
* `src/combat-ui.js`: `startCombat` — вызов `buildEfirUnit` после
  `createCombat` (один guard-блок).
* Тесты: tests/efir.test.js (4 новых + тех. R1), tests/combat.test.js
  (7 новых), tests/main-visuals.test.js (2 новых vm, ОБЕ точки входа).
* `main.js` — 0 изменений (efir в opts всех трёх входов: 730/985/1130
  — 000081). `index.html` — 0 изменений (тегов НЕТ — efir.js уже
  загружается до combat.js/combat-ui.js, пин index-order:843).
  assets/ — 0 новых файлов (спрайты Эфира — 000034/000084, на месте).

## 2. Решения (каждое — почему)

* **D1. buildEfirUnit вызывается ОДИН раз — в combat-ui.js startCombat
  сразу после `const combat = G.createCombat({...});`** — createCombat
  остаётся независимым от efir.js (UMD-порядок: combat.js грузится до
  efir.js; node-тесты combat.test.js не требуют efir.js); main.js
  уже полон проводкой 000081 — 0 изменений.
* **D2. buildEfirUnit — АПГРЕЙД существующего юнита, НЕ создание**
  (ищет `c.units.find(x => x.id === 'efir' && x.side === 'ally')`) —
  расстановка/резервация/очередь уже сделаны createCombat (якорь
  (px−1, py−1), reserved ДО generateObstacles, turnOrder) — ноль новых
  вызовов c._rng, ноль правок createCombat; явные статы не попадают в
  данные efirAllyData (пины T9/2874 «maxHP 8, формула makeAlly» — без
  правок).
* **D3. Диспетчеризация — ОДНА строка в allyAct ПОСЛЕ guard
  `if (!u.alive || u.fled || c.result) return;`:
  `if (u.kind === 'efir' && c.efs) { efirTurn(c, u); return; }`** —
  c.efs = маркер «боевой профиль построен» (поставил buildEfirUnit);
  без c.efs — ветка 000080 (support → allyHeal) БИТ-В-БИТ: держит
  000111 T9 (+7/+35), 000081 R8/R9 БЕЗ ПРАВОК; инвариант 000036
  (turnOrder[c.turnIndex] === id действующего) не трогается (efirTurn
  вызывается из allyAct, turnIndex уже присвоен).
* **D4. Щит — ОТДЕЛЬНЫЙ статус `c.efirShield = {armor, turns: 2}` на
  контексте боя (НЕ переиспользование c.ps.shield)** — ТЗ «(статус
  юнита — аддитивный)»: аддитивный слой поверх щита игрока.
  КРИТИЧНО: у ИГРОКА в v1 ЕСТЬ собственный щит — castSpell
  (spells.js:422, действие «защита» из его книги): `c.ps.shield =
  {armor: 1 + степень, turns: 3}`. Переиспользование c.ps.shield
  (вариант a2-arch) перетирало бы щит игрока кастом Эфира
  (last-writer-wins — замена, а не «аддитивный» статус ТЗ); обратное —
  ИИ не смог бы поставить щит поверх щита игрока. Владение c.ps
  остаётся чистым («пулы/статусы игрока» — 000045/000076); 000118
  видит два щита отдельно; тесты 000045 (combat.test.js 1683-1729)
  не затрагиваются. v1: щит ТОЛЬКО на игроке (цель (2) — игрок).
  Чтение условия (2) «щит не стоит» = c.efirShield.turns ≤ 0
  (ЩИТ ИГРОКА НЕ СЧИТАЕТСЯ — это свой аддитивный статус Эфира; каст
  поверх щита игрока — осознанно, слой). Альтернативное буквальное
  чтение («щит вообще не стоит» — считать и c.ps.shield)
  задокументировано; переключение в одну строку: `|| (c.ps.shield &&
  c.ps.shield.turns > 0)`.
* **D5. Refill пулов и тик щита — в endPlayerTurn ПОСЛЕ refillPools и
  тика c.ps.shield** — тот же ритм, что у игрока (ТЗ «паттерн
  refillPools» = новый раунд: в endPlayerTurn после refillPools:1298
  идёт тик c.ps.shield:1302 — вставка после него); тик щита идёт и
  после ГИБЕЛИ Эфира (тик в efirTurn дал бы вечный щит у мёртвого
  духа — «2 хода» именно 2); efirTurn остаётся чистой логикой
  (точка входа 000113 — её верх, а не хвост).
* **D6. Мораль — только в «Касании»**: `u.damage = max(1, round((2 +
  0.5·Мудрость) · (u.moraleMult || 1)))` (множитель ВНУТРИ round —
  паттерн makeAlly 000080, damage = round(base·mult); чтение
  u.moraleMult С ЮНИТА, НЕ пересчёт)** — ТЗ: «companionMoraleBonus
  применяется к его урону — как к урону любого союзника»; «урон
  союзника» в 000080 — это стат u.damage из makeAlly (там и живёт
  companionMoraleBonus для ВСЕХ союзников) — структурная привязка.
  Формула урон-кастов ТЗ ЗАФИКСИРОВАНА БЕЗ морального множителя
  (L1-пин «round((3+1.5)·1)» — полная двухфакторная структура:
  атрибут × лорд, морали там нет); касты Эфира не проходят через
  u.damage. buffMods НЕ применяются к урону Эфира НИКТОГДА
  (Касание + касты: оба идут через dealDamageToMob без damageMult —
  ally-путь не читает buffMods вообще; 000076 — «множитель урона
  ИГРОКА», пины 2984-2986). ЧИСЛО (правка а1/а2, считавших 6):
  L1 ×1.5 = round(3.5·1.5) = round(5.25) = **5**.
* **D7. Урон-касты — фиксированная формула ТЗ**: `round((3 + 0.5·
  Интеллект) · (1 + 0.05·уровень лорда))` — без морали, без buffMods,
  без RNG («всегда попадает, игнорирует броню» — dealDamageToMob(c,
  e, dmg, true)); лорд по ШКОЛЕ каталога: 'лёд' → icelord, иначе →
  firelord (книга Эфира: урон — только огонь/лёд: spark/fireball/
  frost_bolt; «иначе» — страховка дрейфа, задокументировано).
* **D8. Снапшот лордов — `u.efirSkills` (ВСЕ ЧЕТЫРЕ id по EFIR_SKILLS,
  копия efir.skills: firelord/icelord/perception/precog) в
  buildEfirUnit** — бой не зависит от мутаций state в полёте (xp/
  практика state.skills — только finish() после боя и 000117-практика
  в следующий бой); 000117 читает полные 4 id как базу переучёта;
  u.skills (массив [] из efirAllyData) — НЕ переиспользовать
  (конфликт типа/семантики: u.skills — список id, u.efirSkills —
  объект id→уровень).
* **D9. «Самое сильное» — `strongestKnown(u, action)`**: по u.spells →
  ленивый каталог combatInternals.allySpells (паттерн allyHeal; нет
  каталога/id → null — тихий skip, console.error НЕТ) → s['действие']
  === action → МАКСИМУМ s['мани']; тай-брейк — ЛЕКСИГРАФИЧЕСКИ
  МЕНЬШЕЕ id (строго > по мана, при равенстве `s.id < best.id` —
  ТЗ фиксирует «тай-брейк — id», направление выбираем: меньше id =
  канонически раньше в каталоге, детерминировано). БЕЗ фолбэка на
  более слабое (ТЗ: «маны хватает → самое сильное»). Чистая функция
  (детерминизм). Имя зафиксировано для 000113/000117.
* **D10. Пул — по полю «атрибут» каталога (ТЗ)**: 'intelligence' →
  c.efs.spellInt, иначе → c.efs.spellWis (в книге Эфира: урон —
  intelligence (spark 3/frost_bolt 4/fireball 6); лечение — wisdom
  (mend 3/light_heal 6/greater_heal 11); защита — wisdom (magic_
  shield 5/nature_blessing 7/ward 12); vine (wisdom, «контроль») —
  НЕ запрашивается). Расход: пул −1 И u.mp − s['мани'].
  РАУНД РЕВЬЮ: выбор пула — ЕДИНАЯ точка `efirPool(s)` (combat.js,
  после strongestKnown) для ВСЕХ кастов (1)/(2)/(3) — раньше (2)
  читал жёстко spellWis, (3) — жёстко spellInt; на текущем каталоге
  поведение идентично (EF-3/CB-2/CB-3 без изменений).
* **D11. Цели лечения — `mostWounded(c, maxFrac)`**: пул [игрок
  (frac = p.hp / P.derived(p).maxHP), ...живые союзники в порядке
  c.units] — ЭФИР ВКЛЮЧЁН (само-лечение; ТЗ (1): «союзник (включая
  игрока) ≤ 70%» — Эфир союзник); eligible: frac ≤ maxFrac ((1) —
  0.7); лучший — мин. frac (строгий <), тай — порядок пула (игрок
  первым) — паттерн allyHeal. Возврат {player:true}|{unit:a}|null.
  Приоритет (2) использует frac игрока ≤ 0.5 отдельно.
* **D12. Лечение — формула 000112 (НЕ allyHeal-формула 000080!)**:
  `amount = round(3 + 0.5·Мудрость + u.level)` (L1: 6; L20: 29);
  факт. = hp после − hp до (000037): игрок — P.heal(p, amount)
  (через derived maxHP), союзник — прямой min(maxHP, hp+amount);
  лог — ФАКТ: «Эфир лечит {имя} (+{факт}).» (формат 000080 —
  T9-совместимый стиль).
* **D13. Движение-эскорт — ОДИН бюджет c.efs.move (3), фаза ДО
  действий, ЦЕЛЬ ВЫБИРАЕТСЯ ОДИН РАЗ в начале фазы**: если d до
  игрока > 3 → цель игрок; иНАЧЕ если d до ближайшего врага > 3 →
  цель ближайший враг; иначе — стоим (бюджет не тратится). Все шаги
  фазы — к ОДНОЙ выбранной цели (без перебора условия на каждый
  шаг — иначе зигзаг: шаг к игроку меняет d до врага и обратно,
  бюджет сгорает на маятнике; «эскорт: не отходит от игрока»
  выполняется выбором цели). Шаги — `allyStepToward` (combat.js:498:
  ВСЕГДА ось x первой `[[sx,0],[0,sy]]`, y только если x-клетка
  занята; ОДИН шаг = одна клетка, бюджет −1 за шаг). ВСЕ шаги хода
  тратятся на цель (ТЗ: «до 3 клеток за ход»); стоп: бюджет 0 /
  соседство с целью (d ≤ 1) / allyStepToward false (stuck — без
  телепортов) / c.result. «Дальше — сначала движение» (приоритет 3) — выполнено
  этой фазой: после неё враг d ≤ 4 → каст (3) достижим. Окно
  остатка бюджета: c.efs.move после хода Эфира читается в фазе
  МОБОВ того же раунда N (алли-фаза → моб-фаза → refill в том же
  endPlayerTurn) — 000118 (панель/UX) читает остаток именно там;
  на игровой раунд N+1 пулы уже рефиллены; точное окно чтения
  фиксирует тест 000118.
* **D14. Гибель → 100% HP/MP — СТРУКТУРНО** (000081: HP/MP в state
  НЕТ; каждый бой — новый makeAlly + buildEfirUnit: hp = maxHP,
  mp = maxMP, alive): ОБЕ точки входа уже передают один и тот же
  объект `efir` (main.js 985 maybeStartCombat / 1130
  startDungeonCombat, проверено) → 0 изменений кода; фиксация —
  тестами (обе формы createCombat в node + ОБЕ реальные точки
  входа в vm).

## 3. Контракты и границы

### 3.1 buildEfirUnit(efir, c) — src/efir.js (хвост factory)

```
u = c.units.find(x => x.id === 'efir' && x.side === 'ally')   // efir = state (live)
нет u или c без units → null (тихая деградация)
stats = efirStats(u.level)                    // таблица 000111
u.maxHP = stats.maxHP; u.hp = stats.maxHP     // явные статы (100%)
u.mp    = stats.maxMP                         // своя мана, полная
u.damage = max(1, round((2 + 0.5·stats.wisdom)·(u.moraleMult || 1)))
c.efs = { spellInt: 1+floor(u.attrs.intelligence/10),
          spellWis: 1+floor(u.attrs.wisdom/10), touch: 1, move: 3 }
u.efirSkills = { firelord, icelord, perception, precog }  // СНАПШОТ
          // цикл по EFIR_SKILLS: (efir.skills[id]) || 0
c.efir = u                                    // ссылка (refill/тики)
→ u
```

* L1: maxHP 16, mp 11, damage 4 (×1) / 5 (×1.5); c.efs 1/1/1/3.
  L15 (a=10): c.efs 2/2/1/3; maxHP 30, mp 25; damage =
  round((2+0.5·10)·m) = round(7·m): 7 (×1) / 11 (×1.5).
* state — ТОЛЬКО чтение (level/skills); бой state НЕ мутирует.
* u.attrs (efirAllyData → efirStats — идентично stats) — тот же
  источник, что combat.js на refill (c.efir.attrs) — формула
  зеркальная, пин EF-1.
* Экспорт — 12-й, ПОСЛЕ EFIR_SPELL_UNLOCKS в return-блоке (конфликт
  с 000085-serialize — минимален, контракт 000111 §11).

### 3.2 Поля боя (кто создаёт / читает / тикирует)

| поле | создаёт | читает | тикирует |
|---|---|---|---|
| `c.efs` {spellInt, spellWis, touch, move} | buildEfirUnit | efirTurn | endPlayerTurn (refill от c.efir.attrs; мана НЕТ) |
| `c.efir` (ссылка на юнит) | buildEfirUnit | endPlayerTurn (attrs) | — |
| `c.efirShield` {armor, turns: 2} | efirTurn (приоритет 2) | dealDamageToPlayer (поглощение) | endPlayerTurn (turns −= 1, пока > 0) |
| `u.mp` (мана юнита) | buildEfirUnit | efirTurn (касты) | НИКТО (без регена — ТЗ) |
| `u.efirSkills` | buildEfirUnit (снапшот) | efirTurn (лорд) | НИКТО (000117 — следующий бой) |

* createCombat НЕ создаёт эти поля по умолчанию — существуют только
  после buildEfirUnit/каста; ВСЕ читатели гвардятся; бои без Эфира —
  бит-в-бит (поля undefined — 1 проверка).
* Имён-коллизий НЕТ (проверено по коду/тестам): c.efir/c.efs/
  c.efirShield/u.efirSkills/u.mp/efirTurn/strongestKnown/mostWounded
  — красные символы.

### 3.3 efirTurn(c, u) — src/combat.js (детерминирован, НУЛЬ c._rng)

```
guard: !u.alive || u.fled || c.result → return
// (000113: точка расширения «Вдох Эфира» — ЗДЕСЬ, до движения;
//  закомментирован якорь)
// (000117: якорь начисления практики — в блоке урон-каста (3),
//  после dealDamageToMob; ленивый вызов функции efir.js)
// --- Движение (D13): цель ВЫБИРАЕТСЯ ОДИН РАЗ (dP>3 → игрок;
//     иНАЧЕ dE>3 → ближайший враг; иначе нет); пока
//     c.efs.move > 0 && d до цели > 1 && !c.result:
//     if !allyStepToward(c, u, цель): break   // stuck — стоп (D13)
//     c.efs.move −−
// --- Действия: цикл, пулы в порядке приоритетов, пока не пусты:
(1) W = mostWounded(c, 0.7)                    // пул [игрок, союзники
    if W:                                       //   + Эфир]
      s = strongestKnown(u, 'лечение')
      if s && c.efs[pool(s)] > 0 && u.mp >= s['мани']:
        c.efs[pool(s)] −−; u.mp −= s['мани']
        // pool(s) = efirPool(s) — ЕДИНАЯ точка D10 (раунд ревью):
        // s['атрибут']==='intelligence' ? spellInt : spellWis
        // (лечение — всегда spellWis)
        amount = round(3 + 0.5·Мудр + u.level)  // L1: 6
        W.игрок: P.heal → actual; W.юнит: min(maxHP, hp+amount)
        лог «Эфир лечит {имя} (+{actual}).»; continue
(2) frac(игрок) ≤ 0.5 && !(c.efirShield && c.efirShield.turns > 0):
      s = strongestKnown(u, 'защита')           // неизвестны → skip (Л<12)
      if s && c.efs[efirPool(s)] > 0 && u.mp >= s['мани']:
        c.efs[efirPool(s)] −−; u.mp −= s['мани']
        c.efirShield = { armor: round(5 + 0.5·Мудр), turns: 2 }  // L1: 7
        лог «Эфир: «{название}»: +{armor} брони на 2 раунда.»; continue
(3) e = nearestEnemy(c, u)                      // пересчёт на итерацию
    if e && rectDist(u, e) ≤ SPELL_MAX_DIST:    // константа (раунд ревью)
      s = strongestKnown(u, 'урон')
      if s && c.efs[efirPool(s)] > 0 && u.mp >= s['мани']:
        c.efs[efirPool(s)] −−; u.mp −= s['мани']
        lord = (u.efirSkills[s.школа==='лёд' ? 'icelord' : 'firelord']) || 0
        dmg = round((3 + 0.5·Инт) · (1 + 0.05·lord))   // L1 spark: 5
        r = dealDamageToMob(c, e, dmg, true)     // всегда попадает, игнор брони
        лог «Эфир: «{название}» по {e.name}: {r.dmg}.»
        if c.result: break; continue
(4) if e && rectDist(u, e) ≤ 1 && c.efs.touch > 0:
      c.efs.touch −−; r = dealDamageToMob(c, e, u.damage, true)
      лог «Эфир касается {e.name}: {r.dmg}.»
      if c.result: break; continue
(5) break                                       // пулы пусты / целей нет
```

* (1) пере-проверяется после каждого действия («пулы расходуются в
  этом порядке, пока не пусты»: L20 spellWis 2 + mp 25 → два
  greater_heal подряд (11 маны каждый)).
* Убийство моба → checkVictory → c.result → цикл break; фаза
  завершается существующим `if (c.result) return` в endPlayerTurn.
* «всё равно вне дальности — Касание» (ТЗ): структурно Касание
  d ≤ 1. Ход БЕЗ действия (только движение/стойка) возможен ТОЛЬКО
  если (a) dE > 4 после движения (не дотянуться ни кастом, ни
  Касанием), или (b) каст недоступен (нет в книге / мана / пул
  spellInt = 0) И dE > 1. Детерминировано.
* vine (контроль) — НЕ запрашивается (strongestKnown только
  'лечение'/'защита'/'урон') — в ИИ v1 НЕ используется (ТЗ:
  «при необходимости — отдельная задача»).

### 3.4 Вставки в существующий код (combat.js — ТОЛЬКО вставки)

1. allyAct, ПОСЛЕ `if (!u.alive || u.fled || c.result) return;`:
   `if (u.kind === 'efir' && c.efs) { efirTurn(c, u); return; }`
2. dealDamageToPlayer, ПОСЛЕ блока c.ps.shield, ДО блока-процента:
   `if (c.efirShield && c.efirShield.turns > 0)
      dmg = Math.max(0, dmg - c.efirShield.armor);`
   (плоское поглощение, как c.ps.shield; порядок с c.ps.shield —
   коммутативен; яд идёт через P.takeDamage напрямую — щиты его НЕ
   гасят, как и c.ps.shield)
3. endPlayerTurn, ПОСЛЕ `refillPools(c)` (1298) и тика c.ps.shield
   (1302):
   refill `c.efs` от `c.efir.attrs` (guard `c.efir && c.efs`;
   spellInt = 1+floor(int/10), spellWis = 1+floor(wis/10), touch 1,
   move 3 — формула ЗЕРКАЛЬНАЯ с buildEfirUnit; у.mp НЕ трогается)
   + `if (c.efirShield && c.efirShield.turns > 0)
   c.efirShield.turns -= 1;`
4. combatInternals: + `dealDamageToAlly` (гибель в тестах; объект
   уже экспортирован — 1 член). НЕ добавляем rectDist/efirTurn —
   node-тестам достаточно c.endTurn-сценариев (минимальный дифф
   горячего файла).
   НЕ ТРОГАТЬ: makeAlly, makeMob, mobAct, allyHeal, allyStep*,
   stepTowardRect, refillPools, checkVictory, dealDamageToMob,
   buildTurnOrder, очередь, инвариант 000036, лог-строки
   существующих веток.

### 3.5 Семантика щита (000045-ритм)

Порядок endPlayerTurn (сверено с кодом): [фаза алли+мобов — один
цикл 1281-1292, союзники раньше мобов по turnOrder] → round++ →
refillPools → тик c.ps.shield → (+ наш тик c.efirShield) → новая
очередь. Каст Эфира в раунде N (алли-фаза): щит {armor, 2} → мобы
раунда N (тот же цикл, ПОСЛЕ Эфира) поглощают (turns 2) → тик конца
цикла (turns 1) → мобы N+1 поглощают → тик (turns 0) → раунд N+2 —
не поглощают. Итого ровно 2 раунда, включая раунд каста. Обновление
повторным кастом — переопределение {armor, 2} (не 3 хода, заряд не
кумулялируется; ТЗ «обновляется повторным кастом»).

## 4. Формулы и L1-пины (ТЗ зафиксировано; moraleMult 1 = strongHero)

| величина | формула | L1 |
|---|---|---|
| Касание (u.damage) | max(1, round((2 + 0.5·Мудр)·moraleMult)) | 4 (×1.5 → **5**) |
| урон огня/льда | round((3 + 0.5·Инт)·(1 + 0.05·лорд)) | 5 (firelord 5 → 6); L10 (Инт 7): firelord 0 → 7, firelord 5 → 8 |
| лечение | round(3 + 0.5·Мудр + u.level); факт = after − before | 6 (L20: 29) |
| щит | armor round(5 + 0.5·Мудр), turns 2 | 7 |
| пул | 1+floor(INT/10), 1+floor(WIS/10), touch 1, move 3 | 1/1/1/3 |
| HP/MP | efirStats: 10+2·Тел / 5+Инт+Мудр | 16 / 11 |
| «мани» каталога (сверено с assets/spells) | spark 3, frost_bolt 4, magic_shield 5, fireball 6, light_heal 6, nature_blessing 7, ward 12, greater_heal 11, mend 3, vine 5 | L1 mp 11 |

Мана — СВОЯ (u.mp): после каста p.mp игрока НЕ меняется (пин EF-4);
регена в бою НЕТ. L1-пины ТЗ (4/5/6/7) — при moraleMult 1.
«Самое сильное» по книге: L1 [spark, mend] → урон spark, лечение
mend; L15 → урон fireball (6), лечение light_heal (6), защита
magic_shield (5), vine — мимо; L30 → защита ward (12).
Сила щита в тесте EF-3 — L1-книга БЕЗ лечения: state.spells =
[spark, magic_shield] (прямой set + реальный каталог: «мани» 5,
wisdom → mp 11−5 = 6, armor 7). КНИГА С mend НЕ ПОДХОДИТ: (1)
сработает первым (игрок ранен), потратит ЕДИНСТВЕННЫЙ spellWis
L1 (= 1) → (2) в тот же ход неплатёжно по пулу и щит не встанет.

## 5. Ленивые ссылки и guards (UMD-инварианты)

* src/efir.js: НОЛЬ require( (пин R1); buildEfirUnit — ЧИСТАЯ
  функция (efirStats/EFIR_SKILLS — в модуле; c — параметр); ленивый
  Game — только xpForNext (без изменений); снапшотов Game при
  загрузке НЕТ. buildEfirUnit makeAlly НЕ вызывает (апгрейт, D2) →
  UMD-ловушка порядка не возникает.
* combat.js: каталог — ЛЕНИВО combatInternals.allySpells (spells.js
  ставит при загрузке; node-тесты require spells.js в шапке —
  паттерн combat.test.js/T9); нет каталога → strongestKnown null →
  ветка пропускается (тихо, без console.error — паттерн allyHeal).
* combat-ui.js: guard `efirData && G.efir && typeof G.efir.
  buildEfirUnit === 'function'` → без buildEfirUnit бой как до
  000112 (ветка 000080; тихая деградация — G.efir уже проверен при
  efirAllyData выше); пин 000081 R11 (opts.efir без efir.js →
  console.error, бой без Эфира) — без изменений.
* createCombat: новых полей c по умолчанию НЕТ (бит-в-бит без
  Эфира).

## 6. Тесты

### Красные (13 новых; все сценарии combat.test.js — ДВА прогона с
одинаковым сидом, deepEqual снимка {units[id,x,y,hp,alive], u.mp,
c.efs, c.efirShield, p.hp, p.mp, log, turnOrder} — детерминизм ТЗ)

* tests/efir.test.js (4): **EF-1** пул L1: после buildEfirUnit —
  c.efs 1/1/1/3, hp=maxHP=16, mp=11; после полного endTurn с
  потраченными пулами/маной — c.efs СВОЁН к 1/1/1/3 (D5 — рефилл =
  зеркальный пин формулы efir.js ↔ combat.js), у mp — БЕЗ РЕГЕНА:
  u.mp остаётся на потраченном (endPlayerTurn не трогает u.mp);
  **EF-2** рост L15 (levelUp-цикл, без хардкода сумм) → 2/2/1/3,
  maxHP 30, mp 25; **EF-3** формулы L1: Касание 4 (mp 0, d≤1,
  _rng 0.99 — всё равно бьёт), spark 5 (d≤4, armor 50 — игнор,
  mp 11→8), mend 6 (факт, p.mp не тронулся), щит 7 (книга БЕЗ
  лечения [spark, magic_shield] — иначе (1) первым тратит
  единственный spellWis L1; p.hp 1, mp 11 → 6, c.efirShield
  {7, 2});
  **EF-4** мана — своя (p.mp ДО/ПОСЛЕ одинаков; u.mp по «мани»;
  refillPools mp не пополняет).
* tests/combat.test.js (7, секция «000112»): **CB-1** приоритет (1) —
  ≤70% → самое раненое (2 цели → мин. frac; frac > 0.7 — не лечит;
  формула 6; spellWis −1; при L12+ книге — light_heal (мани 6), не
  mend (3)); **CB-2** приоритет (2) — игрок ≤50% + щита нет →
  magic_shield (книга БЕЗ лечения [spark, magic_shield] — при
  естественной книге (1) первым тратит единственный spellWis L1
  и (2) в тот же ход неплатёжно; «мани» 5, spellWis −1); книга
  без защитных (L1 [spark, mend]) — (1) лечит игрока mend, (2)
  ПРОПУСКАЕТСЯ (нет защитных) → (3); **CB-3** приоритет (3) — «самое сильное» по «мани»
  (L15: fireball 6, НЕ spark/frost_bolt; firelord/icelord по
  школе); враг d=5 → движение → d≤4 → каст; u.mp −6;
  **CB-4** приоритет (4) — Касание 4, d≤1, ВСЕГДА попадает, игнор
  брони, touch −1; мораль: leader 10 → u.damage = 5 (точно:
  round(3.5·1.5)); **CB-5** движение-эскорт: dP>3 → 3 клетки к
  игроку; dP≤3 и dE>3 → к врагу; оба ≤3 — стоим (c.efs.move 3 не
  потрачено); осевая последовательность allyStepToward (x первым):
  из (0,0) к (3,6) → (1,0),(2,0),(3,0) — rectDist 9→6;
  **CB-6** «самое сильное» — тай-брейк id (инжект каталога с двумя
  равными «мани» — паттерн T9 save/set/restore; побеждает меньшее
  id); **CB-7** щит: 2 хода (поглощает мобы 2 раундов, 3-й — полный
  урон), повторный каст — обновление (pre-set c.efirShield
  {armor: 3, turns: 1} → после хода {armor 7, turns 2} — не 3
  хода, не сумма); «щит не стоит» — c.efirShield.turns ≤ 0 (pre-
  set {7, 2} → (2) НЕ кастует, mp не тратится — щит ИГРОКА
  c.ps.shield НЕ считается, D4); щит НЕ мешает c.ps.shield игрока
  (оба действуют: урон − armor обоих).
* tests/main-visuals.test.js (2 vm full-chain; пины — примитивы,
  правило 000082; падение красной фазы — ТОЛЬКО на u.mp undefined):
  **CB-8 (W1, МИР)**: boot; BFS до тайла hasMobGroup && !defeatedAt
  (≥2 группы в сценарии, assert.fail с сообщением — паттерн 940-
  947); walk → maybeStartCombat: Эфир hp=maxHP, mp=maxMP, c.efs
  1/1/1/3 (поля по одному) → G.combatInternals.dealDamageToAlly(c,
  u, 9999) (гибель) → мобы dealDamageToMob 9999 (victory) → Space →
  finish (xp > 0 — 000081) → walk до 2-й группы → бой 2: Эфир
  alive, hp=maxHP, mp=maxMP (по ТЕКУЩЕМУ уровню из g.state.efir —
  возможен рост). **CB-9 (D1, ПОДЗЕМЕЛЬЕ)**: boot;
  `__game.actions.enterDungeon(terrain)` (debug-вход, форма
  состояния как у maybeEnterDungeon — паттерн 000127; бой —
  РЕАЛЬНЫЙ startDungeonCombat через dungeonOnMove) → time-expanded
  BFS (паттерн 000105: occ[s] = wanderStep по копии) до блуждающей
  группы из `__game.dungeon.mobs` → бой: 100% HP/MP → гибель +
  победа (Space) → ПЕРЕПЛАН до 2-й живой группы (занятость вперёд
  от текущего шага) → бой 2: 100% HP/MP. Фолбэк (1 группа):
  +dungeon_memory_days дней → протухло → выход → повторный вход →
  новое содержимое.
* vm-покрывают: ОБЕ точки входа ТЗ (maybeStartCombat — мир;
  startDungeonCombat — подземелье); 3-я (startCombatAt, debug) —
  пин 000081 e2e (без правок).

### Технические правки существующих тестов — ОДНА

* tests/efir.test.js R1 (138): «ровно 11» → **ровно 12** (в список
  ключей и FUNCS — 'buildEfirUnit'; «10 функций + 2 данных»).
  vm-ветка и пин «НЕТ require(» — без правок.
  **ПОСЛЕ РЕБЕЙЗА НА c994f4f** (R1 master = «ровно 13» БЕЗ
  buildEfirUnit) — ОБНОВИТЬ R1 (и строку 5 шапки файла) на «ровно
  14 (12 функций + 2 данных)»; полные списки:
  ключи = ['EFIR_SKILLS', 'EFIR_SPELL_UNLOCKS', 'addEfirXp',
  'buildEfirUnit', 'createEfir', 'deserializeEfir', 'efirAllyData',
  'efirSkillCap', 'efirSkillXpForNext', 'efirSpellsByLevel',
  'efirStats', 'levelUp', 'reprocessEfirSkills', 'serializeEfir'];
  FUNCS = то же минус 2 данных (12 функций).
* **НЕ ПРАВИТСЯ** (всё остаётся зелёным — Option Y, D3): 000111 T9
  (+7/+35 — legacy-путь allyHeal без c.efs — регрессионный якорь
  деградации; новая формула лечения закреплена EF-3/CB-1), 000081
  R7 (2874: maxHP 8, damage 3/4 — формульный путь), R8 (2916:
  гибель → 100% HP, state не мутируется), R9 (2952: детерминизм
  самосравнение), combat-ui R10/R11 + 000084-блок (якорь/turnOrder/
  относительные пины), main-visuals 000081 e2e, index-order, svg,
  save, hud, 000045-блок щита игрока, 000080/000082-блоки.
* (Правка a3 §5.2 — T9 «обязательна» — СНЯТА: Option Y держит
  legacy-путь; ТЗ фиксирует новую формулу для боя через
  buildEfirUnit, что пинят EF-3/CB-1.)

## 7. Что важно будущим задачам (ссылки ТЗ)

* **000113 («Вдох Эфира»)**: срабатывает НА ХОДУ ЭФИРА — точка
  расширения: верх efirTurn, ДО движения (закомментирован якорь;
  ТЗ 000113: «триггер — на ЕГО ходу, ПЕРЕД прочими действиями»).
  Триггер уже ЗАФИКСИРОВАН в ТЗ 000113 (игрок ≤ 40% maxHP И u.mp ≥
  20 И 1 раз за бой) — реализовать ему; «весь ход» — после
  триггера return до приоритетов (движение тоже не выполняется).
  Читает u.mp (своя мана, без регена — D-решения 000112), c.efs —
  расходник (рефилл каждый endPlayerTurn); статус ослабления
  врагов {weakened:{mult,turns}} — новый статус, декремент —
  «паттерн щита из 000112» = тик в endPlayerTurn (тот же блок, что
  c.efirShield). Морали в 000113 НЕТ (одноразовый ультимейт,
  формулы фиксированы) — D6 000112 не нарушается.
* **000117 (практика)**: маппинг действий → навыки ЗАФИКСИРОВАН в
  ТЗ 000117 (урон-каст огня → firelord, льда → icelord —
  PRACTICE_XP.spell (3); уклонение/сопротивление → precog/
  perception); 000112 резервирует точку начисления — якорь-коммент
  в блоке (3) efirTurn (после dealDamageToMob); хук — ЛЕНИВЫЙ вызов
  функции efir.js (practiceEfir, добавит 000117; guard typeof —
  паттерн combatInternals.allySpells), НЕ player.js (потолок — ЕГО
  атрибуты). Читает базу: `u.efirSkills` (снапшот старта боя, D8),
  u.mp, u.level; live state.skills синхронизируется в СЛЕДУЮЩИЙ бой.
* **000118 (UX хода)**: пулы — `c.efs` (остаток move после хода —
  c.efs.move; окно чтения — фаза мобов того же раунда, D13); щит
  Эфира — `c.efirShield` (отдельно от c.ps.shield игрока — D4);
  лог-строки §3.3 — текст панели; «свой» маркер — 000084.
* **000119 (баланс)**: симуляции — node: createCombat({allies:
  [efirAllyData(efir)]}) + buildEfirUnit(efir, c) + c.endTurn;
  детерминизм по сиду (нулевые новые c._rng); формулы — фиксированы
  ТЗ (§4), тюнинг — только новые параметры.

## 8. Подводные камни

* **Math.round — половинки ВВЕРХ**: 3.5→4, 4.5→5, 5.5→6, 6.5→7 —
  формулы считать именно так (L1-пины 4/5/6/7).
* **Мораль ВНУТРИ round** (round(base·mult), НЕ round(base)·mult):
  L1 Касание ×1.5 = 5, не 6 (а1/а2 считали 6 — не верны).
* **щит — c.efirShield, НЕ c.ps.shield** (D4): тесты/UX 000118 не
  смешивают; условие (2) «щит не стоит» — c.efirShield.turns ≤ 0
  (щит игрока НЕ считается — свой статус; альтернативное чтение
  задокументировано в D4 — одна строка).
* **Тик щита — endPlayerTurn, НЕ efirTurn** (D5): щит живёт ровно
  2 раунда и после гибели Эфира; порядок вставок: refill c.efs ПОСЛЕ
  refillPools, тик ПОСЛЕ тика c.ps.shield.
* **Цель движения выбирается ОДИН РАЗ** (D13): «пока dP>3 → к
  игроку, иначе пока dE>3 → к врагу» с перебором на каждый шаг
  даёт зигзаг (шаг к игроку растит dE → возврат к врагу → …),
  бюджет сгорает на маятнике; цель фиксируется в начале фазы.
* **allyStepToward — ВСЕГДА ось x первой** (combat.js:498
  `[[sx,0],[0,sy]]`), y — только если x-клетка занята. НЕ
  путать со stepTowardRect (447, шаг МОБОВ): там — большая ось
  первой, при равенстве — x. CB-5 пинует x-первый порядок.
* **Формула лечения Эфира ≠ allyHeal-формула 000080** (round(3+
  0.5·Мудр+ур) vs round((4+0.5·attr+ур)·(1+0.15·(степ−1))):
  legacy-путь (без c.efs) — allyHeal (T9), боевой путь — efirTurn
  (EF-3/CB-1).
* **Каталожные поля — русские ключи**: «мани», «действие», «школа»,
  «атрибут», «название» (как в assets/spells; опечатка = silent
  null).
* **Касание — ВСЕГДА попадает**: hitChance/c._rng НЕ вызываются
  (отличие от allyAttack legacy — пин CB-4 при _rng 0.99).
* **Рефилл c.efs ≠ реген маны** (D5): c.efs восстанавливается
  КАЖДЫЙ endPlayerTurn (паттерн refillPools), u.mp — НИКОГДА в бою
  (EF-1 фиксирует оба поведения одновременно).
* **buildEfirUnit — апгрейт, не создание** (D2): placeAllies/
  generateObstacles/turnOrder не пересчитывать; якорь (px−1, py−1)
  и reserved — без изменений (пины 1123/1025/2874).
* **efir.js — ОБЩИЙ файл с 000085/000115** (serialize в хвост
  factory; 000115 — id-валидация/обязательный reprocess — в тот же
  хвост): buildEfirUnit — в хвост, return — ОДНА строка в конец.
  РЕБЕЙЗ НА c994f4f — КОНФЛИКТ (хвост фабрики + return-блок — одна
  и та же точка): решение — СОХРАНИТЬ ОБА НАБОРА экспортов (14),
  сверка по смыслу; форма сейва 5 полей не меняется.
* **combat.js — ГОРЯЧИЙ**: дифф = ТОЛЬКО вставки (§3.4); ребейз
  перед мержем ОБЯЗАТЕЛЕН (000087/000113/000117/000118/000119
  параллельны; 000087 правит ту же область startCombat в
  combat-ui.js). MASTER УШЁЛ ВПЕРЕД (05c9214 → c994f4f, diff-стат
  05c9214..c994f4f проверен в раунде ревью): combat.js — только
  +18 строк GROUP_RECIPES.BUILDING_BOSS (~стр. 159, 000077) —
  ДАЛЕКО от наших вставок → РЕБЕЙЗ ЧИСТЫЙ; combat-ui.js — НЕ
  ТРОНУТ; efir.js/efir.test.js/combat.test.js — КОНФЛИКТЫ (ПЛАН —
  «ВАЖНО» в шапке); CHANGELOG.md — наша ветка не трогала →
  конфликта НЕТ (буллет — коммит после ребейза, §9).
* **vm-тесты: пины — примитивы** (000082): c.efs в vm — свой
  realm — сравнивать поля (spellInt и т.д.), не объект;
  deepStrictEqual на cross-realm — нельзя.
* **Семантика ≤ 70%/≤ 50% — дробная** (hp/maxHP exact; over-HP
  9999/25 — не ранен, frac ≥ 1 — исключается, наследуется
  allyHeal).
* **state.spells append-only в игре**, но тесты могут ставить книгу
  напрямую. Щит-сценарии (EF-3/CB-2/CB-7) — книга БЕЗ лечения
  (state.spells = [spark, magic_shield]): при наличии лечебного
  (1) первым (игрок ранен → frac ≤ 0.7) и при spellWis L1 = 1
  (2) в тот же ход неплатёжно — щит не встанет.

## 9. План файлов (дельта)

* src/efir.js: +~55 (buildEfirUnit в хвост factory + 1 экспорт +
  шапка-комментарий)
* src/combat.js: +~150 (новый блок strongestKnown/mostWounded/
  efirTurn ~120; вставки allyAct ~2, dealDamageToPlayer ~4,
  endPlayerTurn ~12 (refill + тик); combatInternals +1 член)
* src/combat-ui.js: +~8 (guard-блок buildEfirUnit после createCombat)
* tests/efir.test.js: +~160 (EF-1..4) + ~6 (R1: 11→12)
* tests/combat.test.js: +~340 (CB-1..7, каждый — 2 прогона)
* tests/main-visuals.test.js: +~260 (CB-8 W1, CB-9 D1 + локальные
  хелперы BFS/time-expanded)
* memory/000112-efir-combat.md: этот файл
* CHANGELOG.md: +~4 (стадия мержа, ПОСЛЕ ребейза — наша ветка
  CHANGELOG НЕ ТРОГАЛА, конфликта нет; раздел «## 2026-10-03»
  УЖЕ СУЩЕСТВУЕТ на master c994f4f (000083/000099 — проверено в
  раунде ревью) — НОВЫЙ БУЛЛЕТ в уже существующий «### Игровой
  процесс», игрок-ориентированная строка «Дух Эфира сражается
  рядом: лечит раненых, щитит, бьёт магией»; коммит отдельный,
  «Задача 000112: CHANGELOG — …»)
* main.js / index.html / assets/: 0

## 10. Ревью (станция «правки по итогам», master c994f4f)

Три ревьюера, 6 findings — все РЕАЛЬНЫЕ, ложных НЕТ (сверено с
кодом master/ветки):

* **M1/M2 (major, дважды): ребейз-ловушка — 000085+000115 на
  master правят src/efir.js и R1 tests/efir.test.js в ту же
  точку** (return-блок/хвост фабрики: обе вставки после
  «EFIR_SKILLS, EFIR_SPELL_UNLOCKS,»; R1: ветка «ровно 12» /
  master «ровно 13»; хвосты тест-файлов — append с обеих сторон).
  Дефекта кода ветки НЕТ (1369/1369 зелёные на HEAD) — риск
  стадии мержа + устаревшая запись «ребейз чистый» в этом файле
  (верна была только до мержа 000085/000115, master=7ab2c03).
  ФИКС НА ЭТОЙ СТАНЦИИ: обновлены «ВАЖНО» (полный план
  конфликта + решение: efir.js — оба набора экспортов = 14; R1 —
  14, списки в §6; хвосты — конкатенация), §8, §6, §9. Сам
  ребейз — стадия мержа (после .merge-pending).
* **m1 (minor): efirTurn(3) — литерал 4 вместо SPELL_MAX_DIST** —
  ИСПРАВЛЕНО: `rectDist(u, e) <= SPELL_MAX_DIST` (та же
  константа, что у каста игрока, combat.js:180) — иначе
  баланс-правка 000119 тихо оторвёт дальность Эфира от
  игрока. Поведение идентично (4 = 4), пины не меняются.
* **m2 (minor): пул (2)/(3) захардкожен (spellWis/spellInt), ТЗ —
  «пул — по полю «атрибут» каталога»** — ИСПРАВЛЕНО: вынесена
  ЕДИНАЯ точка `efirPool(s)` (после strongestKnown) и
  используется в (1)/(2)/(3). На текущем каталоге идентично
  (assets/spells: урон — intelligence ×7; лечение/защита —
  wisdom ×7; vine — control, не запрашивается): EF-3/CB-2/CB-3
  без изменений.
* **m3 (minor): CHANGELOG-буллет ещё не добавлен** — РЕАЛЕН, но
  артефакт стадии мержа (как и запланировано): план §9 точен
  (существующий «## 2026-10-03» → «### Игровой процесс» на
  c994f4f); коммит — ПОСЛЕ ребейза и зелёных тестов.

Итог станции: правки — src/combat.js (m1 + m2), memory (документ
ребейз-плана + синхронизация §2/§3.3/§6/§8/§9). npm test —
1369/1369.

# 000117 — Практика Эфира: рост навыков от применения — КОНТРАКТ

Станция: ПРОЕКТИРОВАНИЕ (workflow 000117). ТЗ: tasks/pending/000117.md
(источник правды; подзадача 000035, P2; зависимости 000111/000112/000115 —
все на master). Входы: a1-domain.md, a2-arch.md, a3-tests.md; ВСЕ решения
сверены построчно с кодом worktree (база 4ac7734 «Мердж: task/000087»;
базовый npm test — 1568/1568, ПЕРЕПРОВЕРЕН прогоном на этой станции, 73 c).
Параллельная 000113 («Вдох Эфира») — в своём worktree, тот же базис;
регионы не пересекаются (§9). Master УШЁЛ: 4ac7734 → 5377b81 (000116 —
только UI-файлы: ui-tab-efir.js/ui.js/index.html/index-order.test.js/
tests/ui-*) → конфликтов с нашими файлами НЕТ; ребейз — стадия мержа (§9).

## 1. Что добавлено (скоуп)

* `src/efir.js`: новая функция `practiceEfir(state, skillId, amount)`
  (хвост фабрики, ПОСЛЕ buildEfirUnit, до return-блока); строка
  `c.efirState = efir` в buildEfirUnit (после `c.efir = u;`); 15-й экспорт
  (13 функций + 2 данных) — `practiceEfir` ПОСЛЕ `buildEfirUnit` в
  return-блоке; docstring-правки (шапка + buildEfirUnit 598-599).
* `src/combat.js` (ГОРЯЧИЙ — дифф = вставки + 3 изменённые строки —
  рев. 3, правка по итогам ревью):
  локальный хелпер `efirPractice(c, skillId, amount)` (перед `function
  efirTurn`, ~стр. 1409); замена якоря-коммента 000112 в блоке (3)
  efirTurn (1493-1495) — хук урон-каста (изменённые строки 3/3: 3
  строки коммента → код+коммент); `mobAttackAlly` (1096-1107) —
  defDodge precog в СУЩЕСТВУЮЩИЙ единственный бросок (изменённая
  строка 2/3: 4-й аргумент hitChance 0 → dodge) + практика в
  ветке промаха; `dealDamageToAlly` (629-638) — опциональный 4-й
  аргумент `opts` с `{ magic: true }` (изменённая строка 1/3:
  сигнатура (c, t, raw) → (c, t, raw, opts)) — сопротивление
  perception + практика.
* `tests/efir.test.js`: раздел «000117» (E1..E5, append после EF-4) +
  ТЕХНИЧЕСКОЕ правка R1 (14→15) — в GREEN-коммите.
* `tests/combat.test.js`: раздел «000117» (C1..C2, append после 3713).
* `memory/000117-efir-practice.md` — этот файл.
* `CHANGELOG.md` — отдельный коммит на стадии мержа (§8).

НЕ ТРОГАЕМ (и почему): index.html (НОВЫХ script-тегов НЕТ — efir.js уже
на 693, ДО combat.js 699; пин index-order не меняется), src/main.js
(проводка live state завершена 000081/000085/000115: один объект efir
идёт в buildEfirUnit — замыкание не нужно), src/save.js (формат сейва не
меняется — skillXp-дроби round-trip с 000115), src/player.js (практика
Эфира НЕ в player.skillPractice — ядро ТЗ; dodgeBonus/magicResistMult
игрока не трогаются), combat-ui.js/spells.js/каталоги/assets (0 новых
файлов; SVG НЕТ).

## 2. Решения (каждое — почему)

* **D1. `practiceEfir(state, skillId, amount)` — чистая функция в хвосте
  фабрики efir.js; 15-й экспорт; возврат — [id] изменённых reprocess
  ([] при no-op).** Guards (тихий no-op → []): state не объект; skillId ∉
  пула EFIR_SKILLS (4 id); amount не finite число > 0. Нормализация
  `state.skillXp` (не-объект/массив → {}); текущий банк (не-число/NaN/≤0 →
  0) — семантики reprocessEfirSkills. `state.skillXp[skillId] += amount`
  БЕЗ округления на входе (дроби легитимны — 000111 §9 / 000115: serde
  переносит дроби без floor). ПОСЛЕ — `reprocessEfirSkills(state)`
  (ТРЕТЬЯ задокументированная точка вызова — УЖЕ в docstring efir.js:346).
  Почему: контракт 000111 §9 + ТЗ п.1; строим на reprocess (потолок =
  атрибут навыка × 2, requires, overflow ХРАНИТСЯ в банке) — логика не
  дублируется; ноль чтения Game, ноль RNG, ноль throw/console.error
  (UMD-чистота; R1-пин «НЕТ require(» сохраняется).
* **D2. Проводка хука: `c.efirState = efir` в buildEfirUnit (live-ссылка)
  + локальный хелпер `efirPractice(c, skillId, amount)` в combat.js,
  читающий `globalThis.Game.efir` ЛЕНИВО в момент вызова (typeof-guard,
  тихий no-op).** Почему НЕ регистрация в combatInternals из efir.js:
  index.html грузит efir.js (693) РАНЬШЕ combat.js (699) → при загрузке
  efir.js Game.combatInternals не существует, а R1-пин запрещает require
  в efir.js. Почему НЕ замыкание `u.practice` (вариант a2): 2 из 3
  анализов (домен/тесты) + консолидация оркестратора выбрали
  c.efirState; юнит остаётся ЧИСТЫМИ ДАННЫМИ (нет function-поля —
  проекции в тестах не меняются); это ровно инвариант «ленивые ссылки
  (rootRef) в момент вызова» (паттерн lazyGame efir.js:76, прецеденты
  000038/000053). Почему НЕ require('./efir.js') из combat.js:
  browser-ветка combat.js принимает Game ПАРАМЕТРАМИ фабрики (P =
  root.Game), новый require ломал бы контракт порядка и node-тесты
  combat.test.js, не грузящие efir.js. Деградация СТРУКТУРНАЯ: бой без
  buildEfirUnit (c.efirState undefined) ИЛИ без Game.efir (node-тесты без
  withGame-efir) → тихий no-op, бит-в-бит 000112. БЕЗ console.error
  (иначе падает companions-cycle V1–V5 `h.errors === 0`; паттерн
  strongestKnown — тихий skip).
* **D3. Хук урон-каста — блок (3) efirTurn, ПОСЛЕ `dealDamageToMob` + log,
  ДО `if (c.result) return;` (замена зарезервированного якоря-коммента
  000112, combat.js:1493-1495): `efirPractice(c, s['школа'] === 'лёд' ?
  'icelord' : 'firelord', PRACTICE_XP.spell)`.** Дискриминатор школы —
  ТОТ ЖЕ, что формула лордов 000112 (строка 1483: spark/fireball «огонь»,
  frost_bolt «лёд»). Практика и при добивании (каст состоялся — пул/мана
  уже списаны). Почему: якорь закреплён 000112 именно для этой точки;
  источник истины о школе — каталог, дублировать нельзя.
* **D4. Уклонение precog — 4-й аргумент defDodge СУЩЕСТВУЮЩЕГО одиночного
  броска `hitChance(u.level, 0, t.level, 0)` в mobAttackAlly: dodge =
  0.05·(t.efirSkills.precog) ТОЛЬКО при `t.kind === 'efir' &&
  t.efirSkills`, иначе 0; практика `precog` + PRACTICE_XP.block (2) в
  СУЩЕСТВУЮЩЕЙ ветке промаха (guard `t.kind === 'efir'`).** Почему
  defDodge-in-hitChance, а НЕ отдельная кость (вариант a2): (1) ТОЧНОЕ
  зеркало механики игрока — `dodgeBonus: pct('precog')` (player.js:236)
  как 4-й аргумент hitChance (mobAttack:1062); (2) НОЛЬ новых вызовов
  c._rng — сильнейшая детерминизм-гарантия (детерминизм-набор 7 тестов —
  жёсткий фиксатор); (3) бит-в-бит при precog = 0 и для всех не-Эфира
  (dodge 0 → выражение идентично); (4) БУТСТРАП: практика за ЛЮБОЙ промах
  по Эфиру → precog вырастает из 0 (дизайн a2 — практика только за
  «заслуженные» precog-доджи → при precog 0 уклонений-эффекта нет →
  precog/перма 0 → строка маппинга и эффект МЁРТВЫЕ — функциональный
  дефект). «Успешное уклонение (эффект precog)» — ЛЮБОЙ промах по Эфиру:
  скобка ТЗ называет КАТЕГОРИЮ эффекта, которой соответствует действие
  (додж = эффект precog), а не каузальный фильтр. Proмах — существующий
  early-return → weaken НЕ тикает (weaken «за попадание» — поведение
  без изменений).
* **D5. Сопротивление perception — опциональный 4-й аргумент `opts` в
  `dealDamageToAlly(c, t, raw, opts)`: при `opts && opts.magic &&
  t.efirSkills && (t.efirSkills.perception || 0) > 0` → `raw = raw /
  (1 + 0.05·perception)` ПЕРЕД вычетом брони + лог «{t.name}
  сопротивляется магическому урону.» + практика perception +
  PRACTICE_XP.block (2).** Почему механизм ПИШЕМ (a1 R6 — только
  комментарий+тест-отрицание): ТЗ «Что сделать» п.3 ЯВНО перечисляет
  эффект «perception — +5% уровень сопротивления (снижение полученного
  магического урона)» — это СПЕЦИФИКАЦИЯ, не опциональный контент;
  механизм = правило, в-игровой триггер = факт контента (в v1 магического
  урона по союзникам НЕТ: 18/18 MOB_TYPES `spells: []`; единственное
  magicResistMult в бою — суккуб:1082, вероятность дебаффа, ИГРОК).
  Почему делитель: зеркало игрока `magicResistMult = 1 + pct('perception')`
  (player.js:238) — в бою он уже используется как ДЕЛИТЕЛЬ (0.25 /
  magicResistMult:1082) → та же семантика: +5% сопротивления/уровень
  (мультипликативно). Почему `{magic: true}`-объект, а не positional
  boolean: самоописывающийся call-site + расширяемость; форма зафиксирована
  в тест-плане (E5d) и консолидации оркестратора; 3-арг-вызовы
  бит-в-бит (opts undefined → блок не входит) — пин main-visuals
  resolveCombatVictory (CB-8/CB-9: `dealDamageToAlly(c, u, 9999)`).
  Почему ПЕРЕД бронёй: резист — % магического попадания, броня — плоская;
  порядок % → плоское; зафиксировано пинном E5d. Тест-отрицание v1:
  физический удар (3 аргумента) → НЕТ снижения/лога/практики (триггер —
  только магия; защита от ложной реализации).
* **D6. Значения практики (зафиксированы ТЗ; единый источник):**
  урон-каст огня → firelord, PRACTICE_XP.spell (3); урон-каст льда →
  icelord, PRACTICE_XP.spell (3); уклонение → precog, PRACTICE_XP.block
  (2); сопротивление → perception, PRACTICE_XP.block (2). Лечение (1),
  щит (2), «Касание духа» (4), «Вдох Эфира» (000113) — практики НЕ дают
  (хуков в этих точках НЕТ; тест-отрицание). Почему PRACTICE_XP.block для
  perception (ТЗ пишет литерал «2»): значение идентично, именованная
  константа — единый источник оборонительной практики, дрейф исключён
  (OQ-2 закрыт). PRACTICE_XP в combat.js (204) НЕ меняется.
* **D7. Снапшот-семантика: практика ПИШЕТ в live state (той же объект
  main.js → сейв всегда актуален); бой ЧИТАЕТ снапшот u.efirSkills
  (D8 000112) → усиление (урон лордов, додж, резист) вступает со
  СЛЕДУЮЩЕГО боя (buildEfirUnit переснимает из state.skills).** Почему:
  000112 ЯВНО предвидел («xp/практика state.skills — только finish()
  после боя и 000117-практика в следующий бой»); текущий бой —
  детерминирован по сиду; сейв mid-combat невозможен (точек сейва в бою
  нет) → рассинхрона нет; 000116 (на master) читает live state → вкладка
  «Эфир» видит рост банка live — ЦЕЛЕВОЕ. ПОСЛЕДСТВИЕ: docstring
  buildEfirUnit (efir.js:598-599 «state (efir) — ТОЛЬКО чтение; бой state
  НЕ мутирует») ОБЯЗАТЕЛЬНО правится: «state — чтение (level/skills) +
  ПРАКТИКА 000117 мутирует skillXp/skills в полёте; формулы боя читают
  СНАПШОТ u.efirSkills — рост в следующий бой».
* **D8. Переучёт при загрузке сейва — НОВОГО КОДА НЕТ, только ПИН (E4).**
  Почему: 000115 УЖЕ делает ОБЯЗАТЕЛЬНЫЙ reprocessEfirSkills в
  deserializeEfir (efir.js:565-571): дроби → уровни в requires-порядке,
  cap, overflow, идемпотентно; 000117 пишет в skillXp только через
  practiceEfir (который сам завершается reprocess) → «аналог
  reprocessSkillXp при загрузке» (ТЗ п.1) покрывается регрессионным
  пинном конвейера «практика → дроби → serialize → deserialize →
  идемпотентный reload».
* **D9. R1-пин (tests/efir.test.js:151) — 14 → 15 («ровно 15 (13 функций
  + 2 данных)», + 'practiceEfir' в ключи и FUNCS) — в GREEN-коммите
  (вместе с кодом).** Почему: RED-фаза обязана показать ровно 7
  смысловых падений при 1568-зелёном базовом наборе (R1 на 14 экспортах в
  RED зелёный); прецедент: 000111/000112/000115 расширяли R1 в GREEN.
  Пин «НОЛЬ require(» и browser-ветка — без изменений.
* **D10. Красные тесты — ровно 7** (план a3; покрытие — суперсет a1 T1-T12
  и a2 PE-1..PE-8): E1..E5 (PR-1..PR-5) в tests/efir.test.js, C1..C2
  (PC-1/PC-2) в tests/combat.test.js. Проверка RED: npm test → 1575 total,
  1568 pass, 7 fail; падения СМЫСЛОВЫЕ (TypeError «E.practiceEfir is not a
  function» / AssertionError отсутствия веток), не синтаксические; фильтр
  `npm test 2>&1 | grep -E '^not ok'` → ровно 7 строк с префиксом «000117».
  После GREEN: 1575/1575 (R1 обновлён). Детали — §5.
* **D11. «Вдох Эфира» (000113, параллельный worktree) — практики НЕ даёт
  (ТЗ явно); отрицательный под-кейс — ТОЛЬКО если 000113 смержен на master
  к моменту ребейза (иначе нет кода, который можно тестировать;
  регион-юнион §9).**
* **D12. Ребейз — регион-юнион с 000113; порядок мержей решает оркестратор
  (зависимости 000117: 000111+000112+000115 — 000113 НЕ входит → 000117
  может мёрзиться раньше).** Детали — §9.

## 3. Контракты и границы

### 3.1 practiceEfir(state, skillId, amount) — src/efir.js

```
guard: state — plain-объект; skillId ∈ EFIR_SKILLS (firelord/icelord/
       perception/precog); amount — finite число > 0 (дроби РАЗРЕШЕНЫ,
       НЕ округлять); иначе тихий return [] (без throw/console.error)
нормализация state.skillXp (не-объект/массив → {}); текущий банк
       (не-число/NaN/≤0 → 0)
state.skillXp[skillId] += amount
return reprocessEfirSkills(state)  // потолок = ЕГО атрибут навыка × 2
                                   // (firelord/icelord — Интеллект,
                                   //  perception/precog — Мудрость —
                                   //  по EFIR_SKILLS.primary + efirStats),
                                   // requires (icelord ← firelord 5,
                                   //  precog ← perception 5), overflow
                                   // за потолком ХРАНИТСЯ в банке
```
* L-пины: кривая 15·(ур+1) (efirSkillXpForNext — без изменений); cap L1 =
  3·2 = 6; practiceEfir(L1,'firelord',999) → level 6, банк 999−315 = 684
  (кривая L0..L5: 15+30+45+60+75+90); повторная практика → level 6, банк
  растёт, без падения.
* Чистая: ноль Game, ноль RNG, ноль console — R1-совместимо.
* ИМЯ зафиксировано (ТЗ/контракт 000111 §9/анализы): practiceEfir.

### 3.2 Проводка (кто что создаёт/читает)

| поле/ссылка | создаёт | читает |
|---|---|---|
| `c.efirState` (live state Эфира) | buildEfirUnit (1 строка после `c.efir = u;`) | efirPractice (combat.js) |
| `efirPractice(c, skillId, amount)` — локальная функция combat.js (перед efirTurn) | — | хуки (3) mobAttackAlly, dealDamageToAlly |

```
function efirPractice(c, skillId, amount) {   // ~стр. 1409 combat.js
  const st = c && c.efirState;
  if (!st) return;
  const G = typeof globalThis !== 'undefined' ? globalThis.Game : null;
  const f = G && G.efir && G.efir.practiceEfir;
  if (typeof f !== 'function') return;
  f(st, skillId, amount);
}
```
* `c.efirState` — имя крассное (коллизий нет: c.efir/c.efs/c.efirShield —
  000112 §3.2). Бои без buildEfirUnit (наёмники/legacy) — c.efirState
  undefined → no-op → бит-в-бит.
* Точки вызова (все — guard-ные, ноль новых c._rng):
  1. efirTurn блок (3), после `dealDamageToMob(c, e, dmg, true)` + log,
     до `if (c.result) return;` (ЗАМЕНА якоря 000112, 1493-1495):
     `efirPractice(c, (s['школа'] === 'лёд') ? 'icelord' : 'firelord',
     PRACTICE_XP.spell);`
  2. mobAttackAlly, ветка промаха (существующий early-return):
     `if (t.kind === 'efir') efirPractice(c, 'precog', PRACTICE_XP.block);`
  3. dealDamageToAlly, в блоке opts.magic (при срабатывании):
     `efirPractice(c, 'perception', PRACTICE_XP.block);`

### 3.3 Изменения combat.js (вставки + 3 изменённые строки — рев. 3)

* `dealDamageToAlly` (629-638): сигнатура `(c, t, raw)` → `(c, t, raw,
  opts)` (изменённая строка 1/3); блок резиста ПЕРЕД `const dmg = ...`
  (~7 строк с комментом).
* `mobAttackAlly` (1096-1107): ДО броска — вычисление dodge (2-3 строки):
  `const dodge = (t.kind === 'efir' && t.efirSkills) ? 0.05 *
  ((t.efirSkills.precog) || 0) : 0;` + ИЗМЕНЕНИЕ строки 1097:
  `hitChance(u.level, 0, t.level, 0)` → `hitChance(u.level, 0, t.level,
  dodge)` (изменённая строка 2/3; не-Эфир/precog 0 →
  dodge 0 → идентично) + практика в ветке промаха (1 строка + guard).
* efirTurn блок (3): якорь-коммент (1493-1495) → 2 строки кода + коммент
  (изменённые строки 3/3: 3 строки коммента → код+коммент).
* НЕ ТРОГАТЬ: createCombat, endPlayerTurn, refill c.efs, PRACTICE_XP,
  диспетчер allyAct, playerAttack/playerSpell/playerBlock (практика
  игрока 000082 — якорь «не трогает игрока»), makeAlly/makeMob/mobAct,
  dealDamageToMob, combatInternals (состав без изменений — 000113 допишет
  СВОИ члены), очередь/инвариант 000036, лог-строки существующих веток.

### 3.4 Маппинг действий → навык → XP (зафиксирован ТЗ; ИСТОЧНИК ПРАВДЫ)

| действие Эфира | точка | навык | XP | в v1 триггер? |
|---|---|---|---|---|
| урон-каст огня (spark/fireball) | efirTurn (3) | firelord | PRACTICE_XP.spell = 3 | да (каст) |
| урон-каст льда (frost_bolt) | efirTurn (3) | icelord | PRACTICE_XP.spell = 3 | да (каст, L8+) |
| успешное уклонение (эффект precog — ЛЮБОЙ промах по Эфиру, D4) | mobAttackAlly | precog | PRACTICE_XP.block = 2 | да (промах) |
| снижение магического урона (opts.magic, perception > 0) | dealDamageToAlly | perception | PRACTICE_XP.block = 2 | МЕХАНИЗМ закреплён тестом; в-игровых источников магического урона НЕТ (18/18 мобов `spells: []`) — триггер придёт с контентом/000119 |
| лечение (1) / щит (2) / «Касание духа» (4) / «Вдох Эфира» (000113) | — | НЕ дают | — | тест-отрицание (E5e) |

* Практика Эфира НЕ трогает skillXp/secondary ИГРОКА (ТЗ ядро; E1 deepEqual
  до/после).

### 3.5 Формулы эффектов в бою (TЗ п.3 «минимум»)

| эффект | формула | статус |
|---|---|---|
| firelord/icelord — +5%/уровень к урон-кастам школы | `round((3 + 0.5·Инт)·(1 + 0.05·lord))` из u.efirSkills | УЖЕ в коде 000112 (combat.js:1483-1488) — НЕ меняется; 000117 поднимает lord практикой (C1) |
| precog — +5%/уровень уклонения от ударов врагов | `defDodge = 0.05·precog` (4-й арг hitChance, снапшот u.efirSkills) | НОВОЕ (D4); детерминировано по сиду (C2) |
| perception — +5%/уровень сопротивления магическому урону | `raw /= (1 + 0.05·perception)` ПЕРЕД бронёй (снапшот) | НОВОЕ (D5); пин E5d прямым вызовом |

### 3.6 Бит-в-бит гарантии (все 1568 существующих — без правок, кроме R1)

1. precog = 0 / не-Эфир → dodge = 0 → hitChance-выражение идентично →
   поток c._rng идентичен (детерминизм-набор 7 тестов зелёный).
2. opts === undefined (все существующие 3-арг-вызовы dealDamageToAlly,
   вкл. main-visuals resolveCombatVictory) → блок резиста не входит.
3. perception = 0 / без u.efirSkills → делителя нет, без лога, без
   практики.
4. Бой без buildEfirUnit → c.efirState undefined → no-op.
5. node-тесты без Game.efir в withGame (EF-1..4/CB-1..7 000112) → хелпер
   no-op (тихо) → их поведение без изменений (хук молча деградирует).
6. Практика НЕ расходует маны/пулы, НЕ вызывает c._rng → ход Эфира
   детерминирован по сиду.
7. `u.efirSkills`/снапшоты — не обновляются mid-combat (D7).
8. Новый член c.efirState — additive; deepEqual по ЦЕЛЫМ юнитам в тестах
   нет (только проекции snap112 — без state) → ничего не ломает.

## 4. Красные тесты (D10; имена с префиксом «000117», node, direct require)

### tests/efir.test.js (append после EF-4, ~стр. 1030)

* **E1 «PR-1: практика — в ЕГО пул; player.skillXp/secondary deepEqual»**:
  (a) `E.practiceEfir(state, 'firelord', 3)` → skillXp.firelord === 3,
  skills.firelord === 0 (банк 3 < 15), ВСЕ 4 id материализованы; (b) боевой:
  L1, книга ['spark'], волк d≤4 armor 50, c._rng = () => 0.99,
  buildEfirUnit, withGame112({ xpForNext: PL.xpForNext, efir: E }) (Game.efir
  ЕСТЬ → хук срабатывает) → c.endTurn() → state.skillXp.firelord === 3;
  player.skillXp И player.secondary — deepEqual до/после (игрок может
  действовать — практика только от его собственных действий). Красный:
  TypeError (а) + AssertionError (б: skillXp {}).
* **E2 «PR-2: потолок + overflow в банке»**: L1 (Int 3 → cap 6):
  practiceEfir(state,'firelord',999) → skills.firelord === 6, банк 684
  (999 − (15+30+45+60+75+90) — формула в тесте через efirSkillXpForNext,
  без хардкода сумм); повторная практика → level 6, банк +N. Красный:
  TypeError.
* **E3 «PR-3: requires»**: practiceEfir(state,'icelord',90) → skills.icelord
  === 0, банк 90 ЦЕЛИКОМ (не сгорел); затем practiceEfir(state,'firelord',
  225) → firelord 5 (банк 0) И icelord 3 (банк 0 — конвертация ПОЛНАЯ,
  семантика 000111 T6). Красный: TypeError.
* **E4 «PR-4: переучёт при load (дроби + requires-порядок + идемпотентность)»**:
  practiceEfir(state,'firelord',150.5) (→ level 4, банк 0.5) +
  practiceEfir(state,'icelord',30) (requires не выполнен → level 0, банк
  30) → raw = serializeEfir(state) → deserializeEfir(raw, SKILL_CATALOG,
  SPELL_CATALOG) → firelord 4, skillXp.firelord === 0.5 (дробь БЕЗ floor —
  000115), icelord 0/банк 30 (requires ПОСЛЕ); повторный
  deserialize(serialize(loaded)) → deepEqual(loaded). Красный: TypeError на
  практике (reprocess-on-load — существующий механизм 000115, зелёный сам
  по себе; красное — конвейер).
* **E5 «PR-5: маппинг»**: (a) огонь — как E1(b): skillXp.firelord === 3,
  icelord не тронут; (b) лёд — L8 (raiseEfir112, mp 17), книга ['frost_bolt']
  (4 маны), враг d≤4, rng 0.99 → skillXp.icelord === 3, firelord НЕ изменился;
  (c) уклонение — L3 (wis 4, cap 8), practiceEfir perception 225 (→ 5) +
  precog 540 (→ 8, cap), книга ['mend'], волк (2,4) (д=1 до Эфира (2,5);
  игрок (3,6) d=3 → nearestPlayerSide выберет Эфира — АВТОР ПРОВЕРЯЕТ
  эмпирически), c._rng = () => 0.3: hitChance(2, 0, 3, 0.4) = 0.12 → 0.3 ≥
  0.12 → промах → skillXp.precog === 2, урон по Эфиру 0; КОНТРОЛЬ: precog 0
  → 0.3 < 0.52 → hit, precog-XP 0; (d) сопротивление — L5 (wis 5),
  practiceEfir perception до 2 (или 10), buildEfirUnit,
  `C.combatInternals.dealDamageToAlly(c, u, 20, { magic: true })` → урон =
  max(1, round(20/(1 + 0.05·perception)) − 0) (формула в тесте; при
  perception 2 → 18) СТРОГО < того же вызова при perception 0 (→ 20), лог
  «сопротивляется», skillXp.perception === 2; КОНТРОЛИ: 3-арг-вызов → 20,
  без лога/практики; perception 0 + {magic:true} → 20, без логов; (e)
  ОТРИЦАТЕЛЬНЫЙ: лечение (mend), щит (книга ['spark','magic_shield'], игрок
  frac ≤ 0.5), Касание (mp 0, волк d=1) → после каждого skillXp всех 4 id
  нет/не изменился; player deepEqual. («Вдох Эфира» — под-кейс только если
  000113 на master к ребейзу — D11.) Красные: (a)(b) AssertionError (хука
  нет), (c) AssertionError (dodge-ветки нет — hit, XP 0), (d) AssertionError
  (полный урон, XP 0); (e) — зелёный сейчас (регресс-страховка внутри).

### tests/combat.test.js (append после 3713)

* **C1 «PC-1: прокачанный firelord — урон +5%·уровень (по сиду)»**: L5
  (Int 5, base 3 + 0.5·5 = 5.5), книга ['spark'], один волк (armor 50, hp
  100, d≤4), seed 5 (board112), rng 0.99, buildEfirUnit,
  withGame112({ xpForNext, efir: E }): A — skills.firelord 0 →
  round(5.5·1) = 6; B — state2 с practiceEfir(state2, 'firelord', 150)
  (→ level 4) → round(5.5·1.2) = round(6.6) = 7. Ассерт из логов
  (маркер «Эфир: «Искра» по …: N»): урон B > урона A, значения — ФОРМУЛА
  в тесте (паттерн CB-3, без хардкода). Детерминизм: повторный прогон →
  deepEqual снапшота. Красный: TypeError на practiceEfir (формула lord —
  существующая, 000112 CB-3 пинит lord 0).
* **C2 «PC-2: уклонение precog снижает попадания врага (по сиду)»**:
  волк L2 (2,4) → Эфир L3 (2,5), d=1, c._rng = () => 0.3, seed 5: A —
  precog 0 → hitChance(2,0,3,0) = 0.52 → hit (0.3 < 0.52), урон по Эфиру
  > 0; B — practiceEfir до precog 8 (perception 5 требует — requires) →
  defDodge 0.4 → 0.12 → miss (0.3 ≥ 0.12), урон 0, лог «промахивается.».
  Ассерт: урон B < урона A. Один rng-вызов на удар — бит-в-бит без precog.
  Детерминизм: два прогона → deepEqual. Красный: dodge-ветки нет → B == A
  (AssertionError) + TypeError на practiceEfir при построении state B.

* Техническое (GREEN): R1 — 14 → 15 (+ 'practiceEfir' в ключи/FUNCS),
  заголовок теста «ровно 15 (13 функций + 2 данных)». Шапка файла
  efir.test.js — строка «PR-1..PR-5 — 000117» (косметика, GREEN).

* Проверка RED: `npm test` → ровно 7 not ok (все «000117»), 1568 зелёных.
  Флик чужого теста → перепуск `node --test tests/файл` + запись в отчёт.

## 5. Что важно будущим задачам (ссылки ТЗ)

* **000116 (UI «Эфир» — УЖЕ на master 5377b81)**: вкладка читает live
  state (skillXp/skills) — практика в бою делает вкладку актуальнее
  (банк «живой») — ЦЕЛЕВОЕ, регрессий нет (000116 не трогает наши файлы).
* **000119 (баланс)**: ручки тюнинга — PRACTICE_XP (3/2), ставки 0.05
  (додж/резист — в combat.js), кривая efirSkillXpForNext (15·(ур+1),
  efir.js — ОДНО место). «Лорды не тюнятся, растут естественно» — практика
  — ЕДИНСТВЕННЫЙ источник skillXp Эфира (нет другого канала). Магический
  урон мобов — будущий контент: любой новый источник должен идти через
  `dealDamageToAlly(c, t, raw, { magic: true })` → сопротивление + практика
  perception сработают автоматически (зафиксированный API, пин E5d).
* **000113 («Вдох Эфира»)**: хук практики НЕ добавляет (D11); точка
  триггера — верх efirTurn (якорь на месте); регионы не пересекаются.
* **000118 (UX хода)**: лог-строки новых веток: «{u.name} промахивается.»
  (существующая, теперь и при precog-уклонении), «{t.name} сопротивляется
  магическому урону.» (новая); practiceEfir возвращает [id] — для
  будущих событий/логов.
* **Любая новая практика/эффект Эфира**: pattern = точка в combat.js +
  `efirPractice(c, id, PRACTICE_XP.???)` (ленивый хелпер); НОВЫЙ экспорт
  efir.js → перепинать R1 (сейчас 15; каждый экспорт +1).

## 6. Подводные камни

* **Изменённые строки combat.js — ТРИ** (рев. 3 — правка по итогам
  ревью; GREEN-коммит 5dc43e2 гласит «1 изменённая строка» — история не
  переписывается, факт — 3): (1) сигнатура dealDamageToAlly (c, t,
  raw) → (c, t, raw, opts); (2) 4-й аргумент hitChance в mobAttackAlly
  (1097): 0 → dodge; (3) якорь-коммент 000112 в блоке (3) efirTurn
  (3 строки коммента → код+коммент). Всё остальное — вставки; все три
  изменения поведенчески безопасны (см. §3.6). Мерж-станции: при
  region-union с 000113 (§9) учитывать ВСЕ ТРИ региона как изменённые,
  сверять СМЫСЛ, не строки.
* **dodge вычисляется ДО броска, но бросок — ТОТ ЖЕ ОДИН** (нулевые новые
  c._rng — детерминизм-набор жёсткий фиксатор). Не «два броска» (анти-
  паттерн a2 отклонён — D4).
* **Практика за промах — ТОЛЬКО `t.kind === 'efir'`** (наёмники/игрок —
  нет; игрок не проходит через mobAttackAlly, но guard обязателен).
* **c.efirState vs c.efir** — разные ссылки: c.efir = юнит (refill/тики
  000112), c.efirState = live state (только практика 000117). Не
  перепутать в вставках/тестах.
* **Снапшот u.efirSkills НЕ обновляется mid-combat** (D7): практика в бою
  N влияет на бой N+1; тесты C1/C2 строят state ДО buildEfirUnit.
* **opts в dealDamageToAlly — ОБЪЕКТ {magic: true}**, не boolean
  (D5); 3-арг-вызовы (main-visuals) — бит-в-бит.
* **Резист — ПЕРЕД бронёй** (порядок: % → плоское); урон min 1
  (Math.max(1, ...) — существующий).
* **R1-пин — GREEN, не RED** (D9); на RED фаза R1 зелёный на 14.
* **withGame112({ xpForNext, efir: E })** — ОБА поля в боевой сценарии
  хука (xpForNext — levelUp-циклы/finish; efir — хук практики); EF/CB-тесты
  000112 (только xpForNext) — хук молча no-op (без правок).
* **vm-тесты (browser-цепочка)**: новых тегов НЕТ; hook ВЫПОЛНЯЕТСЯ в
  main-visuals CB-8/CB-9 (Game.efir есть) — ассерты там только xp > 0 /
  поля юнита → зелёные; companions-cycle V1–V5 `h.errors === 0` → хелпер
  БЕЗ console.error (тихий no-op при отсутствии).
* **save mid-combat невозможен** → рассинхрона сейва нет; skillXp-дроби
  round-trip (000115) — формат не меняется, save.test 000085 зелёный.
* **Math.round — половинки ВВЕРХ** (5.5 → 6, 6.6 → 7): L-пины C1 считать
  именно так.
* **L8 для frost_bolt**: raiseEfir112(E, state, 8) (книга: старт + пороги
  ≤ 8: light_heal, frost_bolt); mp L8 = 5 + 6 + 6 = 17 ≥ 4 (мана frost_bolt)
  — каст платёжен; spellInt L8 = 1 + floor(6/10) = 1.
* **nearestPlayerSide** — моб атакует БЛИЖАЙШЕГО со стороны игрока
  (игрок или союзник): сценарии E5c/C2 — волк (2,4): d до Эфира (2,5) = 1
  < d до игрока (3,6) = 3 → цель Эфир (автор проверяет эмпирически).

## 7. План файлов (дельта) и коммиты

* src/efir.js: +~45 (practiceEfir ~28 с docstring; c.efirState 2; return
  +1; шапка +3; docstring buildEfirUnit правка ~3)
* src/combat.js: +~35 (хелпер efirPractice ~10; якорь каста ~6 (замена
  коммента 3 строк); mobAttackAlly ~8 (в т.ч. 1 изменённая строка);
  dealDamageToAlly ~10)
* tests/efir.test.js: +~200 (E1..E5) + ~6 (R1 — GREEN)
* tests/combat.test.js: +~180 (C1..C2)
* memory/000117-efir-practice.md: этот файл
* CHANGELOG.md: +~3 (стадия мержа)
* index.html / main.js / save.js / player.js / combat-ui.js / spells.js /
  assets/: 0

Коммиты (ветка task/000117; последняя строка каждого — Co-Authored-By:
Claude Code <noreply@anthropic.com>):
1. «Задача 000117: красные тесты (E1..E5, C1..C2)» — тесты + этот файл
   (R1 — НЕ сюда, D9).
2. «Задача 000117: src/efir.js — practiceEfir + c.efirState в buildEfirUnit»
   (+ технический R1 14→15, docstring/шапка).
3. «Задача 000117: src/combat.js — практика Эфира: якорь каста, уклонение
   precog, сопротивление perception» (вставки + 3 изменённые строки —
   рев. 3).
4. Фиксы по итогам агентов анализа (fixup в том же стиле).

CHANGELOG (стадия мержа, отдельный коммит «Задача 000117: CHANGELOG — …»,
дата 2026-10-03, раздел «## 2026-10-03» → «### Игровой процесс»,
игрок-ориентированно, без программной части):
«**Эфир растёт в бою.** Практика действий Эфира теперь растит его
собственные навыки: урон-касты (огонь/лёд), уклонение и сопротивление
магическому урону. Прокачанные навыки усиливают Эфира в следующем бою:
сильнее заклинания, чаще уклоняется, сильнее сопротивляется магии. Рост
ограничен его Интеллектом и Мудростью.»

## 8. Статус и проверки

* Станция: ПРОЕКТИРОВАНИЕ завершена (2026-10-03); базовый прогон
  перепроверен на этой станции: 1568/1568 (73 c) на 4ac7734.
* Красная стадия: коммит 1 (тесты + память) → npm test → ровно 7 not ok,
  все 1568 существующих зелёные.
* GREEN: коммиты 2-3 → npm test → 1575/1575.
* Мерж: .merge-pending → ребейз (§9) → npm test → CHANGELOG → мерж в
  master → git mv задачи pending → done + tasks/result/000117.md.

## 9. Ребейз-план (master 5377b81 + параллельная 000113)

* **master 4ac7734 → 5377b81** (000116: ui-tab-efir.js/ui.js/index.html/
  index-order.test.js/tests/ui-*) — наши файлы (efir.js/combat.js/efir.
  test.js/combat.test.js/memory) 000116 НЕ ТРОГАЕТ → ребейз на них
  ЧИСТЫЙ (fast-forward по нашим файлам). index.html 000116 МОЖЕТ сдвинуть
  номера строк script-тегов — пин index-order сам перепинен 000116; новых
  тегов у нас НЕТ.
* **000113 (параллельный worktree, базис 4ac7734)** — регион-юнион:
  * src/combat.js: у 000113 — верх efirTurn (якорь 1412 «триггер Вдоха
    перед движением», приоритет (0)), combatInternals (+chлены),
    weakened-статус + тик endPlayerTurn, mob-урон; у 000117 — хелпер
    efirPractice (~1409, СМЕСНА с якорем 000113 1412 — юнион внимательно,
    обе вставки рядом), блок (3) (1493-1495), mobAttackAlly (1096-1107),
    dealDamageToAlly (629-638). Пересечений по СТРОКАМ нет (кроме
    смежности ~1409/1412) — юнион семантический.
  * src/efir.js: у 000113 — данные действий (шапка/данные), возможны СВОИ
    экспорт/функции в хвост фабрики; у 000117 — practiceEfir в хвост +
    строка c.efirState в buildEfirUnit + return-блок. return-блок — ОБА
    набора экспортов (юнион).
  * **R1 — счётчик зависит от порядка мержей**: если 000113 смержится
    первым и добавит экспорт X → master R1 = «ровно 15 (…+ X)» → наш
    ребейз: R1 = «ровно 16 (14 функций + 2 данных)» (+X и +practiceEfir);
    если 000117 первым → наш R1 = 15, ребейз 000113 поднимет до 16.
    Кто мержится вторым — перепинивает R1 по факту.
  * хвосты tests/combat.test.js: ОБА аппендят секции (000113 — CB-8+?,
    000117 — PC-1/PC-2 с префиксом «000117») — конкатенация, имена
    уникальны по префиксам (конфликта с CB-8/CB-9 main-visuals НЕТ —
    другой файл).
* После ребейза: ПОЛНЫЙ npm test (особенно 000115-seed/EF/CB + наш
  000117-набор), затем CHANGELOG (раздел «## 2026-10-03» уже существует —
  буллет в «### Игровой процесс», как у 000112/000116).

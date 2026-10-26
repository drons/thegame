# 000279 — «000271-шов (2)»: практик-XP «Застращивания» при успешной панике — Контракт

Статус: ДИЗАЙН ЗАФИКСИРОВАН (станция Проектирование, 2026-10-26).
Тип: новая функциональность, строго по ТЗ (не больше и не меньше).
ТЗ: tasks/pending/000279.md. Worktree .worktrees/task-000279, ветка
task/000279, HEAD bd63004 (= master 92002bd + два дока-коммита ретро
9e482b8/bd63004 — оба: 0 строк в src/, tests/, CHANGELOG.md →
доменного дрейфа нет; ВСЕ координаты ТЗ переоткрыты на HEAD живым
grep — совпали). Происхождение: finding F2 RETRO-20261026
(memory/RETRO-20261026-spec-coverage.md §3, верификация §2):
spec/skills.md:94 обещает практик-XP за успешное применение эффекта
навыка — fear-блок (000271, смержена 944e6b8) его не даёт: навык
растёт только очками/книгами, практик-лупа нет. Зависимости: 000271,
000013 (практик-паттерн — оба смержены). Мерж: ДО 000281 (мягкое —
конфликт-зона верха CHANGELOG). Анализ: /tmp/thegame-wf-000279/
a1-domain.md, a2-arch.md, a3-tests.md (все цифры фикстур live-
верифицированы node на HEAD bd63004: overflow C1 {applied:3,
level:15, total:3}, levelup 27+3=30 → level 2/total 0, fists
{applied:3, level:0}).

## 1. Что добавлено (карта файлов, ожидаемая дельта)

| #  | Файл | Что | Дельта |
|----|------|-----|--------|
| S1 | src/combat.js | playerAttack — 2 вставки: `let prFright = null;` ПЕРЕД fear-блоком; `prFright = P.skillPractice(p, 'fright', PRACTICE_XP.hit);` ВНУТРИ блока ПОСЛЕ `checkVictory(c);` (+1 строка коммента с тегом «000279:»); return — условное поле `frightPractice` (условный spread) | ~+6 строк (регион :1494-1510; якоря §4) |
| T1 | tests/fright-practice-000279.test.js | НОВЫЙ файл: FP-1…FP-6 (§5) | новый, ~180-220 строк |
| K1 | CHANGELOG.md | буллет в СУЩЕСТВУЮЩУЮ секцию «## 2026-10-26» → «### Игровой процесс» — в КОНЕЦ блока (НИЖЕ буллетов 000271 и 000272) — ОТДЕЛЬНЫЙ коммит | ~3-4 строки |
| M1 | memory/000279-fright-practice.md | этот файл — контракт | новый |
| R1 | tasks/pending/000279.md → tasks/done/000279.md + tasks/result/000279.md | перенос + краткий отчёт | — |

НОВЫХ МОДУЛЕЙ/ЭКСПОРТОВ/<script>-тегов/CSS/SVG НЕТ:
* PRACTICE_XP (combat.js:255 `{ hit: 3, block: 2, spell: 3 }`) НЕ
  расширяется (D1 — переиспользование `.hit`);
* index.html (combat.js — единственный тег :1270), tests/
  index-order.test.js, tests/svg.test.js — 0 правок; vm-цепочки
  подхватывают combat.js автоматически (тот же script-тег —
  прецедент 000271);
* spec/ — 0 правок (обещание skills.md:94 уже выполнено текстом;
  R7-пин spec-split skills.md=100 не сдвигается — правок spec нет);
* save-формат — 0 новых полей (skillXp.fright — формат копилки
  000013 id→число; sanitizeSavedHero уже чистит skillXp
  поштучно);
* src/sheet.js, src/player.js, src/craft.js, src/skills-data.js —
  0 правок;
* технических правок СУЩЕСТВУЮЩИХ тестов — НИ ОДНОЙ (D9).

## 2. Механика — контракт

### 2.1 (а) Величина XP — PRACTICE_XP.hit = 3 (D1)

`P.skillPractice(p, 'fright', PRACTICE_XP.hit)`. Почему `.hit`:
эффект (паника) случается ТОЛЬКО при попадании (fear-блок после
dealDamageToMob; промах — early return :1482-1483, до всего) =
категория «попадание» (коммент :251-254: «hit — попадание
(меч/лук/тяжёлое/кулаки)»). Новый ключ `fright: 3` в экспортируемой
константе — изменение экспортированной поверхности без выгоды
(значение совпадает; «не больше и не меньше, чем просит ТЗ»);
расстройка величин — будущее дизайн-решение владельца, не эта
задача. `spell`/`block` — неприменимы (не каст, не блок). Симметрия:
один хит с паникой = 3 XP оружия (как всегда) + 3 XP fright — как у
ВСЕХ прочих боевых навыков.

### 2.2 (б) Представление в результате — `frightPractice` (D2)

Новое ТОП-УРОВНЕВОЕ поле в return playerAttack, shape 1:1 с
существующей записью `practice`:

    frightPractice: { skill: 'fright', xp: PRACTICE_XP.hit, applied, level }

(4 ключа; `total` НЕ выносится — как у weapon-записи :1509).
Поле ЕСТЬ только при успешной панике (условный spread); БЕЗ
паники результат БИТ-В-БИТ идентичен старому (тот же набор ключей:
`{ ok, hit, ...r, practice }`).

ОТКЛОНЁННЫЕ АЛЬТЕРНАТИВЫ (фиксация для будущих):
* `practices: [...]` (массив) — ломает shape `practice` (35
  property-ассертов r.practice.* в tests/combat.test.js + remap-
  пины R9/R10 :9829-9942) — semantic-правка существующих тестов,
  запрещено инвариантом;
* вложенный ключ ВНУТРИ `practice` — меняет семантику записи
  «это практика оружия» (потребители читают r.practice.skill как
  skill оружия; remap-пины — по каждому legacy-оружию);
* поле ВСЕГДА (null/0 без паники) — добавляет ключ в КАЖДЫЙ
  hit-результат (все существующие фикстуры) — шире зона
  регрессии при том же покрытии.
Имя `frightPractice` — по имени навыка (дискриминатор). Это ПЕРВЫЙ
прецедент второй практик-записи в codebase — контракт за §6.1.

ПОРЯДОК КЛЮЧЕЙ: `frightPractice` — ПОСЛЕ `practice` (deepEqual не
зависит от порядка, но читаемость diff — по порядку).

### 2.3 (в) Крафт-хук — АВТОМАТИКА, 0 строк кода (D5)

skillPractice (player.js:234-241) → при `leveledUp` →
craftReprocessHook (player.js:264-271) — ленивое снятие Game.Craft
при ВЫЗОВЕ (паттерн 000038), в node без Game.Craft — no-op.
'fright' НЕ в CRAFT_TYPE_SKILL (craft.js:149; grep «fright» по
craft.js = 0) → хук для fright no-op автоматически. Допроводок НЕТ.
Если в будущем fright станет skill-привязкой крафта — хук сработает
сам.

### 2.4 Считалки c._rng (D6) — НОВЫХ БРОСКОВ 0

skillPractice → sheet.practice (sheet.js:364-420) — ЧИСТАЯ
арифметика/банки, 0 c._rng (прочитано по коду; reprocessCraftXp
craft.js:332 — тоже без RNG, единственный rng в craft.js — rollCraft
:663, другой путь). Гейт страха (&&, :1498-1499) НЕ ТРОГАЕТСЯ.
Поток: без навыка / ровный-выший уровень (гейт закрыт) — ровно 1
c._rng (hit-ролл); навык есть + fear-ролл (промах ИЛИ успех) —
ровно 2 (hit + fear); практика — 0 в обоих случаях. Базовые
голдены (000076/000081/000082/000113/000205) БИТ-В-БИТ: боевой
фикстуры с fright вне tests/fright-000271.test.js НЕТ (grep-факт a3
§1: fright в tests/ — только items.test.js:8211/8263 каталог,
ui.test.js:2162+ T8 без боя) → fear-ветка не входит ни в один
существующий прогон.

### 2.5 Границы — КОГДА практик НЕ начисляется

Практика 'fright' — ТОЛЬКО при успешной панике (все 4 условия
гейта 000271 истинны + fear-ролл успешен): t.alive (труп — нет),
t.level < p.level (равный/выший — нет), d.fearChance > 0 (навык 0
— нет), c._rng() < d.fearChance (промах — нет), промах удара
(early return — нет), союзник/не-цель (guard :1449 — нет). Во всех
этих случаях `practice` оружия — как есть (удар был — weapon-
практика начисляется), `frightPractice` — ОТСУТСТВУЕТ, XP fright —
0.

### 2.6 Level-up ПОСЕРЕДИНЕ боя — ПРЕДНАЗНАЧЕННАЯ прогрессия (D7)

`d = P.derived(p)` (:1453) пересчитывается в КАЖДОМ вызове
playerAttack → рост fright в бою поднимает fearChance на
следующем ударе — как у ВСЕХ прочих навыков (урон/блок/касты);
мутация ДАННЫХ, не RNG → детерминизм не нарушает. Save — без
изменений (skillXp.fright — поле 000013). UI — 0 правок:
combat-ui не показывает `practice` (2 comment-only строки
:1294/:3609 про practiceEfir) и не разбирает ключи результата
thunk'а (combat-ui.js:988) → новое поле UI невидимо, fled уже
рендерится (:1381-1404, 000271).

## 3. Связь с контрактом 000271 (memory/000271-fright-consumer.md)

Контракт 000271 §2 (:75-77) закрепляет: «функция продолжается в
практику/return с неизменным shape {ok: true, hit: true, ...r,
practice} (удар был — практика начисляется; НОВОГО ПОЛЯ в return
НЕТ…)». Это ЛОК 000271 на scope ТОЙ фичи (ТЗ 000271 не требовало
практики — шов легитимен, finding F2 ретро). 000279 — ОСОЗНАННОЕ
аддитивное расширение ПО ТЗ (retro-подзадача 000271-шов (2)):
условное поле не меняет НИ ОДИН существующий результат (видимо
только на новом пути — панике, которой в сьюте до нас не было),
существующая запись `practice` НЕ ТРОНУТА (35 ассертов + R9/R10 —
зелёные без правок). Контракт 000271 остаётся в силе для ВСЕХ
путьев без паники; для паники — дополнен этим файлом (git blame —
на строку, коммит 000279).

## 4. Якоря ребейза (фразы, НЕ номера строк)

combat.js — файл с САМЫМ rebase-давлением (ретро §6.2); параллельный
000278 правит ДРУГОЙ регион (checkVictory :1384-1430 / playerFlee
:1620-1631) — параллельно допустимо (прецедент 000271/000272).
Якоря наших вставок:
* `let prFright = null;` — ПЕРЕД комментом «// 000271:
  «Застращивание» — fearChance» (якорь — начало этого коммента);
* вызов + коммент «000279:» — ВНУТРИ fear-блока ПОСЛЕ
  `checkVictory(c);` (якорь — строка `checkVictory(c);` +
  закрывающая `}` блока);
* условное поле — в return, ПОСЛЕ строки `practice: { skill:
  skillId, xp: PRACTICE_XP.hit, ... }` (якорь — коммент «//
  Практика: попадание даёт опыт навыка оружия (задача 000013).»
  + `const pr = P.skillPractice(p, skillId, PRACTICE_XP.hit);`).
Ребейз — ТОЛЬКО по этим фразам; после ребейза L-координаты
перепроверять grep'ом (ретро §6.9). Комменты в коде — task-tagged
1-строчные «000279: …» (конвенция combat.js; прецеденты 000267
:1486-1488, 000271 :1494-1497; осознанный компромисс CLAUDE.md
по прецеденту — аргументация в этом файле).

## 5. T1 — карта тестов (tests/fright-practice-000279.test.js, НОВЫЙ)

Node-тесты прямым require (vm не нужен: механика в боевом ядре).
Require-шапка: node:test, assert/strict, { createCombat,
PRACTICE_XP } из ../src/combat.js, { createCharacter, derived }
из ../src/player.js. Хелперы strongHero/standNextTo — КОПИИ из
tests/fright-000271.test.js (изолированный запуск). Файл грузится
ЧИСТО на RED-стадии (все require существуют; краснота —
отсутствием поведения, не синтаксисом/require — прецедент
000267/000271).

ФИКСТУРА-ОСНОВА (live-верифицирована): p = strongHero() (hp 9999,
constitution 50); p.level = 5; p.primary.intelligence = 11
(инициатива 12 > 3 — игрок первый); p.primary.strength = 10
(attackActions 2; fists: primary 'strength' → cap 20);
**charisma НЕ задана → 1 → cap fright = 2**; p.secondary.fright
= 15 → d.fearChance = min(0.75, 0.75) = 0.75 (ассерт-фикстура).
fright 15 ВЫШЕ потолка 2 → C1-ПЕРЕЛИВ: applied 3, level НЕ
растёт (15), bank +3 (live: {applied:3, level:15, total:3,
reason:'потолок практикой'}). createCombat({ player: p, mobs:
['wolf'], mobLevel: 1, seed: 13 }); standNextTo; w.maxHP = 200,
w.hp = 200 (удар 13 НЕ летален — гейт t.alive; волк L1 aggro
neutral — НЕ timid). c._rng = () => 0.01: 0.01 < hitChance
L5→L1 ≈ 0.67 — попадание; 0.01 < 0.75 — паника гарантирована
КОНСТАНТОЙ, не seed-охотой. Без оружия → practice-скилл 'fists'
(attackSkillId :258-265), dmg = 3 + floor(10·0.8) + floor(5·0.5)
= 3 + 8 + 2 = 13 (волк armor 0, без бафов — live-вычисление).

ФИКС-ЛЕВЕЛ-АП (FP-3): то же, НО fright 1 (fearChance 0.05;
0.01 < 0.05 — успех) + p.skillXp.fright = 27 → 27 + 3 = 30 =
skillXpForNext(1) (sheet.js:204: 15·(level+1)) → level 1 → 2
(= cap 2), bank 0, leveledUp true (live-верифицировано). Крафт-
хук в node — no-op (без Game.Craft) — ассерты только по level/
bank/полю.

| id | Что пинит | RED/GREEN |
|----|-----------|-----------|
| FP-1 | паника → копилка + поле: atk.ok/hit true, w.fled true; p.skillXp.fright === PRACTICE_XP.hit (3); p.secondary.fright === 15 (потолок — уровень НЕ растёт); atk.frightPractice deepEqual { skill: 'fright', xp: 3, applied: 3, level: 15 }; atk.practice deepEqual { skill: 'fists', xp: 3, applied: 3, level: 0 } (weapon-запись ИНВАРИАНТНА — ОБЕ записи в одном попадании) | RED (frightPractice undefined; p.skillXp.fright undefined — AssertionError на отсутствующую мутацию) |
| FP-2 | shape-инвариант: (а) ПУТЬ ПАНИКИ — full deepEqual atk = { ok: true, hit: true, dmg: 13, killed: false, practice: { skill: 'fists', xp: 3, applied: 3, level: 0 }, frightPractice: { skill: 'fright', xp: 3, applied: 3, level: 15 } } — ПЕРВЫЙ full-result deepEqual attack-результата в сьюте (голен нового пути); (б) ПУТЬ ПРОМАХА FEAR (c._rng = seq [0.01, 0.9]: hit, 0.9 ≥ 0.75 — промах) — full deepEqual atk БЕЗ ключа: { ok: true, hit: true, dmg: 13, killed: false, practice: { skill: 'fists', xp: 3, applied: 3, level: 0 } } (старые пути бит-в-бит, «key in atk» === false) | RED (а: key отсутствует до фикса; б: зелёный с RED-стадии — shape-голен старого пути) |
| FP-3 | level-up из предзасеянного банка: фикс FP-3-фикстура, c._rng 0.01 → w.fled true; p.secondary.fright === 2; p.skillXp.fright === 0; atk.frightPractice deepEqual { skill: 'fright', xp: 3, applied: 3, level: 2 } | RED (level остаётся 1, bank 27 — AssertionError) |
| FP-4 | fear-ролл ПРОМАХ — граница: fright 15, seq [0.01, 0.9] → ровно 2 c._rng (hit + fear); w.fled falsy, w.alive true; p.skillXp.fright absent; !('frightPractice' in atk); atk.practice.skill === 'fists' и applied === 3 (weapon-практика ЕСТЬ — удар был) | GREEN-guard |
| FP-5 | гейт уровня: mobLevel 5 (равный) и 6 (выше), fright 15 → ровно 1 c._rng (уровневый предикат ДО броска — практики ТОЖЕ нет); w.fled falsy, w.alive true; 0 XP, ключа нет | GREEN-guard |
| FP-6 | без навыка: fright 0 (ассерт derived(p).fearChance === 0) → ровно 1 c._rng (fear-ветки НЕТ — бит-в-бит с до-000271); w.alive true, w.fled falsy; 0 XP, ключа нет — ядро ТЗ «c._rng бит-в-бит без навыка» на unit-уровне | GREEN-guard |

expectedRedCount (файл) = 3 (FP-1, FP-2(а), FP-3) — осмысленная
краснота «отсутствием поведения». GREEN-guards FP-4…FP-6 зелёны с
RED-стадии — сознательно (regression-guard; прецедент FR-4/5/6/7
000271). БАЗА: 3354/3354/0 (HEAD bd63004 — memory/
RETRO-20261026-verify.md, 5 прогонов) + 6 = **3360 тестов**;
RED-состояние: ровно 3 «not ok» (FP-1/2/3, AssertionError — НЕ
load/syntax); GREEN-состояние: 3360/3360/0. Изолированный
перепуск: node --test tests/fright-practice-000279.test.js.

ОТКЛОНЁННЫЙ ВАРИАНТ (фиксирую): отдельный seed-детерминизм-тест с
снимком p.skillXp.fright/p.secondary.fright (a3 FP-7) — НЕ
включён в шестёрку (сжатие ТЗ: 6 сценариев, 3360): новая мутация —
чистая арифметика (0 c._rng — зафиксировано счётчиками FP-1/4/5/6),
боевой seed-детерминизм пути паники уже пинится FR-7 (000271) —
детерминированность гарантирована конструкцией. Если ретро найдёт
дыру — отдельной подзадачей.

## 6. Что важно будущим задачам

* 6.1 ПРЕЦЕДЕНТ «второй практик-записи»: топ-поле с именем-
  дискриминатором (`frightPractice`), conditional, ЕСТЬ только при
  эффекте, shape 4-ключа 1:1 с `practice`. Будущим «эффект-
  потребителям» с практикой (и любым многопрактик-действиям) —
  копировать форму, НЕ массив, НЕ вложенность в `practice`. Любой
  новый бой-навык-потребитель обязан получать практик-XP по
  паттерну 000013 (spec/skills.md:94) — 000279 закрывает ПОСЛЕДНИЙ
  бой-навык без лупа.
* 6.2 000281 (микро-дрейф): чинит опечатку «мому»→«мобу» в
  CHANGELOG.md:9 (буллет 000271) — наша вставка НИЖЕ его (:9 не
  сдвигается); мерж 000279 ДО 000281 (мягкое, прецедент 000274);
  ребаза 000281 — по якорям.
* 6.3 000278 (тот же combat.js, ДРУГОЙ регион) — параллельно OK;
  при двойном ребейзе (000279↔000278) — якоря §4 устойчивы.
* 6.4 Голден shapes: FP-2 — ПЕРВЫЙ full-result deepEqual на
  attack-результат в сьюте; будущим задачам, меняющим shape return
  playerAttack, репинить tests/fright-practice-000279.test.js В
  ТОМ ЖЕ КОММИТЕ (и FP-1 property-ассерты).
* 6.5 000280 (skills-data sync: effectType fright «Бой/Карта» →
  «Бой») — display-only, механика (consumer :1498-1499) не
  затрагивается — взаимно не блокируют.

## 7. Подводные камни

* 7.1 C1-перелив в основной фикстуре: charisma 1 → cap 2 < 15 —
  level НЕ растёт (applied 3, bank 3, level 15). Ассерты — по
  skillXp/applied/level=15, НЕ по росту уровня; level-up покрыт
  ОТДЕЛЬНО (FP-3). Если кто-то ожидает рост уровня в основной
  фикстуре — ложная краснота.
* 7.2 Порядок внутри блока — ПОСЛЕ checkVictory (D3), не перед:
  checkVictory не трогает p (контракт 000271: 0 мутаций
  персонажа, 0 c._rng в 'fled'-ветке) → behavior-neutral, выбор —
  консистентность с weapon-путём (weapon-практика тоже после
  checkVictory; c.result может быть поставлен, практика всё равно
  начисляется — удар был).
* 7.3 `t.fled` на входе playerAttack ВСЕГДА falsy (guard :1449) →
  внутри вызова t.fled может установить ТОЛЬКО наш fear-блок →
  «внутри блока» ≡ «после блока, if (t.fled)» — вставка внутри
  блока (без повторной проверки).
* 7.4 fp-2 deepEqual (б) — miss-фикстура с seq [0.01, 0.9]:
  порядок seq важен (hit-ролл первым). Счётчики FP-4/5/6 —
  counting-rng (копия паттерна FR-2/4/5).
* 7.5 npm test — ОДИН полный прогон за раз в worktree (память
  no-parallel-full-tests-in-worktree; 000054 мутирует
  src/npc-data.js). known-флейк «160k tileAt» (tests/map.test.js:
  1943, бюджет 5000 мс) под нагрузкой волн — протокол: solo-
  перепуск node --test tests/map.test.js + запись в отчёт (до
  мержа 000282; задокументирован memory/000209-npc-json-refs.md).
* 7.6 CHANGELOG-конфликт-зона ВЕРХА: буллеты 000271 (:9-12) и
  000272 (:13-16) НЕ ТРОГАТЬ (опечатка «мому» — территория
  000281); наша вставка — в КОНЕЦ блока секции (перед «##
  2026-10-25»).

## 8. Стадии ветки и коммиты

1. «Задача 000279: RED — …» — T1 + M1 (этот файл). npm test: 3360
   тестов, ровно 3 «not ok» (FP-1/2/3 — AssertionError), всё
   остальное зелёное (вкл. FR-1…FR-8 — p.skillXp мутирует в
   паниках, но там не ассертится; 35 practice-пинов; голдены).
2. «Задача 000279: …» — S1 (combat.js) + R1 (pending→done +
   tasks/result/000279.md). npm test ПОЛНЫЙ: 3360/3360/0.
3. «Задача 000279: CHANGELOG — …» — K1 (буллет; черновик: «**
   «Застращивание» теперь даёт опыт навыка.** Успешная паника —
   напуганный моб сбежал — начисляет небольшой опыт навыка
   «Застращивание», как и остальные боевые навыки.»; финализатор
   поправит стиль по соседям: жирный лид + 2-3 строки,
   программная часть не перечисляется).

Первая строка — «Задача 000279: …» (рус.); последний абзац —
Co-Authored-By: Claude Code <noreply@anthropic.com>. Squash при
мерже (reset --soft + commit + ff-only — память
one-commit-per-task-squash). .merge-pending — НЕ на этой стадии
(только станция мержа). Remote — НЕ пушить. МЕРЖ: ДО 000281
(мягкое); rebase на актуальный master ПО ЯКОРЯМ §4; после
мерджа — только по task-notification run'а (память
cleanup-worktree-after-notification).

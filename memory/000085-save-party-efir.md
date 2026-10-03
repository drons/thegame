# 000085 — Сейв: отряд и Эфир (дизайн-контракт)

Статус: ДИЗАЙН ЗАКРЫТ (станция «Проектирование», workflow 000085, финальная
адjudикация — сверена с черновиком предыдущего прогона).
**ЭТОТ файл + `memory/000085-save-roster.md` — КАНОНИЧЕСКИЙ контракт 000085.**
Черновик предыдущего прогона `memory/000085-save-companions-efir.md`
(2026-10-02 23:57, НЕ закоммичен) ПРЕРЫВАН этим файлом; расхождения
разрешены — лог в разделе «Расхождения с черновиком».
КРАСНОЙ СТАНЦИИ: черновик НЕ коммитить (он помечен баннером SUPERSEDED;
при желании удалить — untracked, в git не попадал).
ТЗ: `tasks/pending/000085.md` (source of truth). Родитель: 000065.
Порядок мержа (000065): 000083 → 000084 → **000085** → 000087.
000115 мержит ПОСЛЕ 000085; 000109 (cities) и 000112 (buildEfirUnit) —
параллельные worktree, гребут в тех же горячих файлах.
Параллельный анализ: `/tmp/thegame-wf-000085/a1-domain.md`, `a2-arch.md`,
`a3-tests.md` + черновик предыдущего дизайна (см. выше).
База: npm test = 1356/1356 зелёных (проверено 2026-10-03).

## Ключевые решения (фиксация «решить в анализе/памяти»)

D1. **Форма Эфира в сейве = 5 полей `{level, xp, skillXp, skills, spells}`**
(НЕ 3, как в ТЗ).
Почему: state = форма сейва (000081); SPEC «Дух Эфира»→«Сейв» фиксирует
ровно эти 5; `memory/000111-efir-growth.md` §9 обязывает serialize переносить
skillXp/spells после ребейза (000111 УЖЕ в master, base 05c9214); шапка
`src/efir.js` (23–27): «Состояние — форма ЗАФИКСИРОВАНА под сейв: ровно
{level, xp, skillXp, skills, spells}». 3-полевая форма ТЗ СТАЛАЯ (ТЗ и 000115
писались до мержа 000111, master f9e9b6a): она теряла бы skillXp/spells при
КАЖДОМ сейве (спеллы растут с L5+). Тестовый round-trip ТЗ переформулируется
на 5 полей ПО СМЫСЛУ (000111 §9). Терпимость к 3-полевой форме — в
deserialize (дефолты: skillXp→{}, skills→{}, spells нет/пусто→[spark, mend]).

D2. **`serializeRoster(roster) → Entry[]`** — shape-guard + ЧИСТАЯ проекция
ровно `{npcId, level, xp, loyalty, hiredDay}` (свежие копии полей):
`!Array.isArray → []`, запись не-объект / `npcId` не строка → skip,
лишние поля отбрасываются. **Нормализации значений НЕТ** — snapshot-семантика:
runtime всегда well-formed (доказано: xp — целые, combat.js:637
`Math.round(xp * share)` + целые пороги xpForNext; loyalty — clamped 0..100 в
payWages, `loyaltyTick = payWages`-алиас; level/hiredDay — целые). Единая
точка ремонта — deserialize. (Черновик нормализовал в serialize — отклонено:
тихо переписывает runtime-состояние; честный снапшот + warn при загрузке
лучше, а round-trip `serialize(deserialize(x)) === deserialize(x)` тривиален.)

D3. **`deserializeRoster(npcs, raw) → {roster, dropped} | null`** —
catalog-first (прецедент `restoreNpcStocks(npcs, saved)`, src/npc.js).
Функция ТИХАЯ (чистая, без console) — warn печатает main.js по `dropped`
(паттерн pruneQuestBookByDay 000072).
- `raw == null` (undefined/null, старый сейв) → `{roster: [], dropped: []}` —
  тотальная функция, ПУСТОЙ отряд ЗАФИКСИРОВАНО ТЗ, warn НЕТ (main.js
  дополнительно гвардит `rawC != null` — оба пути дают []).
- `!Array.isArray(raw)` → `null` (битый раздел → main.js: warn «раздел
  companions некорректен» + `roster.length = 0`).
- Не-объект / `npcId` не строка → молча skip (неидентифицируемо, в dropped
  НЕ попадает).
- **Призрак** (критерий `npcForEntry`, companions.js:114–117: id в каталоге
  + объект `найм`) → `dropped.push(npcId)`.
- Дубликат `npcId` → первый живёт, остальные → dropped.
- Лимит `settings.SETTINGS.max_companions` **LIVE-чтение**: guard
  `Number.isInteger(max) && max >= 1 ? max : 3` — мусорный max (000098 UI)
  иначе `slice(0, NaN) → []` = отряд молча испаряется. Сверх-лимит → dropped
  (forge >max ломает раскладку боя 7×7).
- **Числа: НЕВалидные → запись в dropped; валидные → as-is / дешёвая
  нормализация** (SPEC «невалидные записи — тихий сброс» — сброс ЗАПИСИ, а не
  починка значения; house-строгость core sanitizeSavedHero; не выдумывать
  фолбэки вместо прогрессии):
  `level` — `Number.isInteger && >= 1`, иначе dropped (int-критично: форма
  000079, 000082 «level ≥ 1», прецедент hero.level; forged 2.5 НЕ floor'ится);
  `xp` — finite ≥ 0 **КАК ЕСТЬ (дроби допускаются)**, иначе dropped
  (000082 «валидатор обязан принимать любое xp ≥ 0»; прецедент hero.xp);
  `loyalty` — finite → clamp 0..100 **без округления** (77.5 валиден),
  не-finite → dropped (runtime всегда целая clamped — 0..100);
  `hiredDay` — finite ≥ 1 → floor (2.7 → 2), иначе dropped (косметика дня).
- Запись пересобирается ровно как 5 полей; порядок валидных СОХРАНЯЕТСЯ.
- Кросс-валидации `hiredDay > clock.day` НЕТ (чистая функция, без clock;
  ТЗ не требует).

D4. **`serializeEfir(state) → object|null`** — не plain-object → `null`;
иначе свежая копия ровно 5 полей: level/xp as-is (БЕЗ floor — skillXp-дроби
000117 живут в skillXp, xp runtime-целый); skillXp/skills — копии plain-
объектов (нет/не объект → `{}`); spells — копия массива (нет/не массив → `[]`).
Нормализации значений НЕТ (D2-логика; runtime efir well-formed: reprocess
пишет Math.floor, addEfirXp — finite).

D5. **`deserializeEfir(raw) → state|null`** — СТРОГО структурно (SPEC:
«невалидные записи (неизвестные id, отрицательные) → тихий сброс ЗАПИСИ +
warn»; любой дефект → null → main.js warn + тихий сброс на `createEfir()`):
- `raw == null` → `null` (старый сейв — main.js гвардит `rawE != null` и НЕ
  трогает efir: он уже `createEfir()` от старта сессии; warn при ОТСУТСТВИИ
  поля НЕТ).
- не plain-object → `null`.
- `level`: `Number.isInteger && >= 1`, иначе null (core-строгость, как
  sanitizeSavedHero.level; forged 999.5 не floor'ится до 999).
- `xp`: finite ≥ 0, as-is (дроби — прецедент hero.xp; runtime целые).
- `skillXp`: отсутствует → `{}`; иначе plain-object + ВСЕ значения finite ≥ 0
  (дроби ЛЕГИТИМНЫ — 000117 практика), иначе null.
- `skills`: отсутствует → `{}`; иначе plain-object + ВСЕ значения
  `Number.isInteger && >= 0` (по форме 000111 §2 — целые; reprocess пишет
  Math.floor; forged 2.5 — дефект формы → null, а не floor 2), иначе null.
  Принятые значения КАК ЕСТЬ — reprocess приведёт к формам (при levelUp / из
  000115); на бою skills до 000112+ не участвует.
- `spells`: отсутствует ИЛИ ПУСТОЙ → `EFIR_SPELL_START` (модульно-ВНУТРЕННИЙ
  `['spark','mend']` — deserializeEfir в том же файле, ссылается на
  КОНСТАНТУ напрямую, литерал НЕ дублировать; константа НЕ экспортируется —
  пин R1 «2 данных» не трогается), иначе массив СТРОК (копия, дубли — первый
  остаётся), элемент не-строка → null. Правило 000115: «НЕ выводить из
  уровня» — forged L30 с пустой книгой получает базовую [spark, mend], не 8
  заклинаний; легитимная книга никогда не пуста.
- Возвращает НОВЫЙ объект (ровно 5 полей). **НЕ вызывает reprocessEfirSkills**
  (контракт 000115: шапка efir.js «вызовы: …, deserialize (000115 —
  ОБЯЗАТЕЛЬНО)»; ТЗ 000115 п.4).
- **ИД-валидации НЕТ в 000085** — зона 000115 (её ТЗ п.3: id скила ∉
  assets/skills, id заклинания ∉ assets/spells → сброс записи). Сейчас
  unknown-id ИНЕРТЕН: `allyHeal` (combat.js:1183) пропускает id вне
  каталога лечения; reprocess итерит по модульному пулу EFIR_SKILLS;
  `efirSkillCap(state, 'nope') = 0`.
- Без кэпа уровня: SPEC называет только «неизвестные id, отрицательные»;
  локальный сейв = машина игрока (self-forgery, не crash-путь); forged int
  L999 проходит — задокументировано, последствия ограничены полями (spells —
  свой массив, skills — формулы 1+0.05·level в 000112).

D6. **main.js — state zone**: после блока efir (строка 209), ДО `const NPCS`
(212): `let roster = (G.companions && typeof G.companions.createRoster ===
'function') ? G.companions.createRoster() : []` + `console.error('main.js:
companions.js не загружен (обязан грузиться ДО src/main.js, 000079/000085) —
нет отряда')` при деградации + `const deadMercs = []` (стиль `const buffs =
[]`).
Почему `[]` а не null: restore делает `roster.length = 0`, collectSaveData
зовёт serializeRoster(roster) — null упало бы в обе точки. Паттерн — блок
efir (000081, main.js:203–209): guard на load + visible degradation. В
полной цепочке index.html:599 грузит companions.js ДО main.js:678 →
console.error НЕ fires → vm-тесты `errors.length === 0` сохраняются.

D7. **collectSaveData** — в конец объекта (после `buildingQuests`, строка
358):
```js
companions: G.companions && typeof G.companions.serializeRoster === 'function'
  ? G.companions.serializeRoster(roster) : [],
efir: G.efir && typeof G.efir.serializeEfir === 'function'
  ? G.efir.serializeEfir(efir) : null,
dead_mercs: deadMercs.slice(),
```
+ комментарий «неломкое расширение v1 (000031): без бампа CURRENT_VERSION».
Коллизий имён нет (day, steps, position, hero, quests, npcStocks, defeatedAt,
buildingOncePerDay, buffs, teleports, buildingQuests + будущий cities из
000109 — он тоже допишет в хвост, union при ребейзе).

D8. **restoreFromSave — 3 НОВЫХ раздела, каждый в СВОЕМ try/catch** (000031
«каждый раздел — свой try/catch»), размещаются **ПОСЛЕ раздела «Персонаж»**
(строка 451), **ДО «Побеждённые группы»** (453); порядок: companions → efir →
dead_mercs.
Почему в середине: хвост restoreFromSave (после quests/npcStocks ~632, до
rehydrate ~634 и playerUI.render 641) — стандартная append-зона; 000109
(cities) ляжет туда → среднее размещение = минимальный текстуальный конфликт
при ребейзе в любом порядке. Порядок разделов не важен: roster/efir не
зависят от day/hero/position. (Черновик ставил 632–634 — ближе к зоне 000109,
отклонено.)
- **companions**: `const rawC = d.companions; if (rawC != null &&
  G.companions && typeof G.companions.deserializeRoster === 'function')`.
  res = deserializeRoster(NPCS, rawC); res === null → warn «Сейв: раздел
  companions некорректен — сбрасываю.» + `roster.length = 0`; иначе — **мутация
  in place** (`roster.length = 0; for (…push)`) — live-ссылка сохраняется.
  `res.roster.length === 0 && rawC.length > 0` → warn «Сейв: companions —
  валидных записей нет — сбрасываю.»; `res.dropped.length` → warn «Сейв:
  companions — отброшены: ids».
- **efir**: `const rawE = d.efir; if (rawE != null && efir && G.efir &&
  typeof G.efir.deserializeEfir === 'function')`. e = deserializeEfir(rawE);
  e → **`Object.assign(efir, e)`** (live-ссылка, паттерн hero; НЕ `efir = e` —
  combat-finish и state держат live-объект). null → warn «Сейв: раздел efir
  некорректен — сбрасываю.» — efir уже `createEfir()` от старта сессии и ДО
  restore (вызов main.js:1659) никто его не мутировал → «тихий сброс на
  дефолт L1» без явной переназначки. Старый сейв (rawE == null) → guard
  пропускает → L1 (ЗАФИКСИРОВАНО ТЗ). Деградация `efir === null` → тихий skip
  (модуль мёртв, console.error уже на load).
- **dead_mercs** — **INLINE в main.js** (ТЗ фиксирует ровно 4 сериализатора;
  плоский массив строк; NPCS в scope, прецедент restoreNpcStocks(NPCS,…)
  на ~626): `const rawD = d.dead_mercs; if (rawD != null)`: не массив → warn
  «Сейв: раздел dead_mercs некорректен — сбрасываю.» + `deadMercs.length = 0`;
  иначе filter: не строка → молча skip; строка **без NPCS-записи с объектом
  `найм`** (призрак — критерий npcForEntry, СТРОЖЕ чистого членства:
  self-cleaning при правках каталога/демотации merc, консистентно с
  roster-критерием; черновик предлагал чистое членство — отклонено) → bad[];
  дубликат → bad[]; valid → dedup с сохранением порядка; `bad.length` → warn
  «Сейв: dead_mercs — неизвестные/дубли npcId: …».
- catch'и: «Сейв: не удалось восстановить отряд/Эфира/dead_mercs:», err
  (стиль catch «Персонажа», main.js:450).

D9. **__game.state** — после `efir: efir || null,` (строка 1529): добавить
`roster,` и `deadMercs,` (live-объекты; паттерн efir 00081 — «дешёвая точка
smoke-теста, пригодится 000086/000116»). Пин на полный набор ключей state
НЕТ (проверено: main-visuals R13 пинит только ключи state.efir). 000083/000087
читают main.js-область напрямую — state нужен тестам/000086. Плюс
ТЕХОБНОВЛЕНИЕ stale-комментов `{level, xp, skills}`: строки 198–202 (state
zone) и 1526–1528 (getter) → 5 полей + «сейв — 000085»; коммент v1-структуры
322–325 → + companions/efir/dead_mercs. (Черновик P8 «не правим» — отклонено:
правки внутри наших же ханков, нулевая доп. ребейз-площадь, 4 задачи-потребителя
не вводитесь в заблуждение.)

D10. **Новых точек saveNow НЕ добавляется.** Существующие покрывают всё:
смена дня — onDay (main.js:671; 000087 повесит payWages/loyaltyTick ПЕРЕД ней
+ hudFlash); конец боя — world 1032 / dungeon 1162 (000087 доработает onEnd:
applyCombatXp/гибель → dead_mercs → существующий saveNow в конце); найм/
увольнение — 000083 (npcUI.open onChange → saveNow, его ТЗ); каждый шаг
(1460), beforeunload (365), exitLocation (1075).
**РАЗРЕШЕНИЕ КОНФЛИКТА ТЗ**: 000085 «(000087 собирает точки)» vs 000087
«гибель/уровень спутника (000085 собирает)» → **000085 = СОЗДАНИЕ состояния +
разделы сейва; сбор точек = 000083 (найм/увольнение) и 000087 (день/бой)**.
Почему: нулевое добавление saveNow = нулевой риск детерминизма; до 000083/000087
события найма/гибели не существуют — точкам нечего сохранять; 000083 ТЗ сам
вешает onChange.
**GAP (документировано для 000087)**: отладочный бой `startCombatAt`
(main.js ~718–751) — onEnd (742–749) **БЕЗ saveNow** (в отличие от реального
контеста 978–1032): xp/уровень/гибель отряда в debug-бою персистятся на
следующем шаге/дне (так же, как xp героя) — решение 000087, НЕ терять.

D11. **save.js — 0 изменений** (CURRENT_VERSION = 1 строка 41, MIGRATIONS = {}
строка 54; пин 000072 save.test.js:256 уже существует — отдельный тест-пин
НЕ нужен). **index.html — 0 изменений** (теги player.js:594, companions.js:599,
efir.js:605, save.js:676, main.js:678 уже на месте; order-пины зелёные).
CSS/ассеты/SVG — нет.

D12. **Размещение кода**:
- companions.js: функции ПОСЛЕ allyDataForEntry (конец 372), ДО `return {`
  (374); экспорты — хвост return-блока, после `applyCombatXp,
  allyDataForEntry,` (379). НОВЫХ require НЕТ (каталог — ПАРАМЕТР).
- efir.js: функции ПОСЛЕ reprocessEfirSkills (конец 385), ДО `return {`
  (387); экспорты — хвост, после `EFIR_SKILLS, EFIR_SPELL_UNLOCKS,` (395) —
  000111 §11 «новый экспорт — только в хвост фабрики, минимизирует конфликт
  с 000085-serialize». efir.js остаётся с НОЛЁМ `require(` (пин efir.test.js).
  Хвост efir.js — общий с 000112 (buildEfirUnit) и 000115: union при ребейзе.
- main.js: 4 ханка (D6, D7, D8, D9) + техкомменты.

D13. **Тесты** — 6 новых в `tests/save.test.js` (блок «Задача 000085» в конец
файла) + 2 re-pins. **1356 → 1362.** (Черновик: 8 тестов/1364 — канон: 6,
см. «Расхождения».) Детали:
- Harness: `bootWithSave(storage, heroExtra, dataExtra)` — ОПЦИОНАЛЬНЫЙ 3-й
  арг (additive: `data = Object.assign({day:1, steps:0, hero}, dataExtra)`);
  существующие вызовы без правок.
- **T1 (node) serializeRoster**: чистая копия ровно 5 полей, лишние поля
  отброшены, не-массив → [], запись-строка/число → skip, **fresh-copy**
  (мутация input после serialize не меняет снапшот — assert на
  JSON-отличность), функция ТИХАЯ (0 console.warn — warn'ит main.js).
- **T2 (node) deserializeRoster** — фикстуры НАСТОЯЩИЙ NPCS
  (`require('../src/npc-data.js')`, 6 mercs: merc_volk/ashka/baldor/mira/
  torga/rena): null/undefined → `{roster:[], dropped:[]}` (тихо); 'junk'/42/{}
  → null; ghost_merc → dropped; дубликат → dropped; 4 валидные > max 3 → 3
  живёт + 1 в dropped; npcId:42/не-объект → тихий skip (НЕ в dropped);
  таблица чисел: level 2.5 → drop, level 0 → drop, xp -1 → drop, xp 7.9 →
  KEPT as-is, loyalty 150 → 100, loyalty 'x' → drop, loyalty 77.5 → KEPT,
  hiredDay 0 → drop, hiredDay 2.7 → 2; round-trip serialize→deserialize —
  идентично; порядок сохранён; функция ТИХАЯ.
- **T3 (node) serializeEfir/deserializeEfir**: round-trip 5 полей ИДЕНТИЧЕН
  (свежий `createEfir()` И «после боя» `{level:2, xp:10, skillXp:{firelord:
  2.5}, skills:{firelord:1}, spells:['spark','mend','light_heal']}` — дроби +
  порядок spells; **ФИКС-ТОЧКА**: skillXp 2.5 < `efirSkillXpForNext(1)` = 30,
  xp 10 < `xpForNext(2)` = 141 → стабильно под будущим reprocessEfirSkills
  000115); 3-полевая legacy `{level:2, xp:5, skills:{}}` → 5 полей
  (skillXp→{}, spells→[spark,mend]); сломанные → null: 'junk', 42, null,
  level 0.5, level 0, xp 'x', xp -1, skillXp 'abc', skillXp {a:-1}, skills 42,
  skills {a:'x'}, skills {a:2.5}, spells 'abc', spells [1]; spells [] / нет →
  ['spark','mend']; serializeEfir(42) → null.
- **T4 (vm, полная цепочка) e2e round-trip**: seed `{day:7, companions:
  [merc_volk {2,30,77,3}, merc_ashka {1,0,50,2}], efir: {level:5, xp:5,
  skillXp:{firelord:2.5}, skills:{firelord:1}, spells:['spark','mend',
  'light_heal']} (L5: light_heal легитимно по EFIR_SPELL_UNLOCKS; фикс-точка
  2.5 < 30), dead_mercs:['merc_baldor']}` → boot (errors 0) → state
  восстановлен (сначала `assert.ok(Array.isArray(state.roster))` — PITFALL:
  `host(undefined)` БРОСАЕТ, JSON.stringify(undefined) → undefined — в RED-
  фазе state.roster ещё нет), далее `host()` deepEqual — кросс-realm 000082)
  → beforeunload (`h.winListeners['beforeunload'][0]()`) → saved.data
  {companions, efir, dead_mercs} deepEqual seed (JSON-форма) +
  saved.version === 1.
- **T5 (vm) СТАРЫЙ сейв** (bootWithSave как есть, `{day:5, hero}`): errors 0;
  state: roster [] (Array.isArray), deadMercs [], efir = {level:1, xp:0,
  skillXp:{}, skills:{}, spells:['spark','mend']} (L1 ЗАФИКСИРОВАНО);
  beforeunload → saved.version 1; saved.data: companions [], dead_mercs [],
  efir = L1-дефолт (5 полей).
- **T6 (vm) битые разделы + призраки**: seed `{day:5, hero, companions:
  [valid merc_volk, {npcId:'ghost_merc',…}, {npcId:42,…}, 'junk'], efir:
  'junk', dead_mercs: ['merc_rena','ghost_dead',42,'merc_rena']}` →
  errors.length === 0; warns содержит: 'companions' + 'ghost_merc', 'efir',
  'dead_mercs' + 'ghost_dead'; state: roster [merc_volk], efir L1-дефолт,
  deadMercs ['merc_rena']; beforeunload → saved.data ЧИСТЫЕ разделы (битое
  вычищено за 1 цикл, мусор не размножается).
- **Краснота осмысленная**: T1–T3 — TypeError «…is not a function»;
  T4–T6 — saved.data.* undefined / state.roster не массив / warns пуст.
  1356 существующих — зелёные БЕЗ правок (в красной фазе src не правится).
- **Re-pins** (только техническая поверхность, прецедент 000082):
  - API_KEYS (companions.test.js:125–129): 12 → **14** (+ 'serializeRoster',
    + 'deserializeRoster'; отсортированный список; «13» в анализах — ошибка
    пересчёта, актуальный API — ровно 12). Одна константа — оба пина (133,
    632) обновятся сами.
  - R1 (efir.test.js:138): «ровно 11 (9 функций + 2 данных)» → «ровно 13 (11
    функций + 2 данных)»; expected-массив +2; FUNCS +2 (node + браузер);
    заголовок теста. Пин «НОЛЬ require(» (~181) — БЕЗ правок (чистые функции).
- НЕ трогать: index-order.test.js (новых тегов/классов нет),
  save-restore.test.js (deepEqual только buildingOncePerDay/buffs/hero-keys —
  новые поля не задевает), main-visuals.test.js (R13 пинит 5 ключей
  state.efir — форма не меняется), 000072-пины (256), combat/npc/day/
  npc-hire/hud (не задеваются).

## Что добавлено (по файлам)

| Файл | Дельта | Содержание |
|---|---|---|
| src/companions.js | ~+80 строк | serializeRoster, deserializeRoster (+ локальные normalize-помощники), 2 экспорта, шапка |
| src/efir.js | ~+100 строк | serializeEfir, deserializeEfir, 2 экспорта, шапка |
| src/main.js | ~+95 строк | 4 ханка: state zone (roster/deadMercs), collectSaveData (+3 поля), restoreFromSave (+3 раздела, свой try/catch), __game.state (+2 ключа), техкомменты |
| tests/save.test.js | ~+220 строк | bootWithSave + dataExtra, блок «Задача 000085»: T1–T6 |
| tests/companions.test.js | +2 строки | API_KEYS 14 |
| tests/efir.test.js | +4 строки | R1: 13, FUNCS +2 |
| save.js / index.html / CHANGELOG.md | 0 | — |

## Контракты и границы (точные сигнатуры)

```js
// src/companions.js (UMD, экспорты в хвост фабрики)
serializeRoster(roster) → Entry[]             // Entry = ровно {npcId, level, xp, loyalty, hiredDay}
  // !Array → []; запись не-объект/без строки npcId → skip; ЧИСТАЯ копия 5 полей; тихая.
deserializeRoster(npcs, raw) → {roster, dropped} | null
  // raw == null → {roster:[], dropped:[]} (старый сейв, тихо);
  // !Array → null (битый раздел — main.js: warn + reset);
  // ghost/dup/сверх-max/битое-число → dropped (строки npcId);
  // level: int ≥ 1 | xp: finite ≥ 0 (дроби OK) | loyalty: finite → clamp 0..100
  // | hiredDay: finite ≥ 1 → floor — иначе запись в dropped;
  // max_companions LIVE (guard: int ≥ 1, иначе 3); порядок сохранён; тихая.

// src/efir.js (ЧИСТЫЙ UMD, ноль require; экспорты в хвост фабрики)
serializeEfir(state) → {level, xp, skillXp, skills, spells} | null   // не plain-object → null; чистая копия
deserializeEfir(raw) → state(5 полей) | null
  // raw == null / не plain-object / level не int ≥ 1 / xp не finite ≥ 0 /
  // skillXp есть-но-не(plain-объект, все finite ≥ 0) / skills есть-но-не
  // (plain-объект, все int ≥ 0) / spells не-массив-строк → null;
  // skillXp нет → {}, skills нет → {}, spells нет/пусто → EFIR_SPELL_START;
  // БЕЗ reprocess (000115), БЕЗ id-валидации (000115); тихая.

// src/main.js
data.companions: Entry[]      // guard в collectSaveData; restore — mутация in place
data.efir:        object|null // guard; restore — Object.assign(efir, e) (live-ссылка)
data.dead_mercs:  string[]    // slice(); restore — inline-валидация (npcForEntry-критерий)
```

Границы (ЧТО НЕ ДЕЛАЕТ 000085):
- не бампит CURRENT_VERSION, не пишет MIGRATIONS (000031, ТЗ);
- не добавляет saveNow-точки (D10);
- не валидирует id скилов/заклинаний Эфира против assets (000115, её ТЗ п.3);
- не зовёт reprocessEfirSkills из deserialize (000115 — обязательный вызов, её);
- не выводит spells из уровня (000115: дефолт [spark, mend]);
- не трогает combat.js / perlin.js / rng / ui.js / combat-ui.js (R5:
  детерминизм боя не меняется);
- не меняет UI найма (`npcUI.open` + roster/deadMercs/onChange — 000083),
  не вешает payWages/loyaltyTick на onDay и `opts.allies` в startCombat
  (rosterData — 000087);
- не правит существующие разделы collectSaveData/restoreFromSave — только
  ДОБАВЛЕНИЕ своих; SPEC.md, файлы задач — не трогать.

## Ленивые ссылки и guards (UMD-инварианты 000038/000053)

- main.js: `const G = globalThis.Game` — ОДИН snapshot на load (main.js:13,
  не трогаем). Все доступы через `G.companions` / `G.efir` с typeof-guard —
  деградация без падения.
- roster: guard createRoster → `[]` fallback + console.error (D6); в полной
  цепочке — никогда не fires (companions.js:599 до main.js:678).
- deadMercs: plain array в main.js-области, без модульной зависимости.
- settings LIVE: max_companions и companion_loyalty (через payWages, не через
  serde) читаются НА МОМЕНТ ВЫЗОВА (000098 — user-editable); serde-фолбэк
  loyalty НЕ используется (D3: не-finite loyalty → drop записи, не фолбэк).
- efir restore: Object.assign в live-объект (D8) — все ссылки (state,
  combat-finish, будущие 000086/000116) остаются валидными.
- EFIR_SPELL_START остаётся ИНТЕРНАЛЬНЫМ (не экспорт — пин R1: ровно 13
  экспортов, из них 2 данных — те же что были); serialize/deserialize —
  НОЛЬ обращений к Game, НОЛЬ require.

## Что важно будущим задачам

- **000083 (найма UI; мержит ПЕРЕД 000085 по 000065)**: roster/deadMercs
  ОБЪЯВЛЕНЫ в game-state main.js С 000085 (000083/000086/000087 —
  ПОТРЕБИТЕЛИ; `__game.state.roster/.deadMercs` — live). **Правило ребейза**:
  если 000083 (смёрженный первым) сам объявил roster/deadMercs — при ребейзе
  000085 на него УДАЛЯТЬ НАШЕ объявление (ханк a), сохранять save/restore-
  ханки (semantic rebase, не line-based); два `let roster` → ReferenceError
  на load → падают все vm-тесты. 000083 вешает saveNow в onChange найма/
  увольнения СЕБЯ (своё ТЗ).
- **000086 (UI отряда)**: `__game.state.roster` / `.deadMercs` / `.efir` —
  live-ссылки, точка smoke-теста; запись читать, не менять (000079).
- **000087 (сборка цикла)**: точки saveNow — см. D10 и
  `000085-save-roster.md` §«Точки saveNow»; payWages/loyaltyTick ПЕРЕД
  saveNow(671); гибель → dead_mercs.push + saveNow ВНУТРИ onEnd (1032/1162);
  opts.allies = rosterData (allyDataForEntry 000082); candidates = live
  roster + dead_mercs + каталог; gap debug-боя (742–749) — его решение.
- **000112 (buildEfirUnit)**: ПОКА 000115 НЕ смёржен в state могут жить
  forged unknown-id (spells/skills) — потребители обязаны GUARD'ИТЬ
  неизвестные id (прецедент allyHeal: `catalog[id]; if (!s || …) continue`),
  а не падать.
- **000115 (расширение сериализации Эфира)**: расширяет serialize/
  deserializeEfir (НЕ заменяет): + id-валидация (assets/skills, assets/
  spells → сброс записи), + ОБЯЗАТЕЛЬНЫЙ reprocessEfirSkills ПОСЛЕ
  deserialize, + (нормализация дефолтов УЖЕ в 000085: D1/D5). Точки
  сохранения — те же; переносить НЕЛЬЗЯ. Её ТЗ УСТАРЕЛО по форме (3 поля
  против f9e9b6a) — канон: 5 полей (D1).
- **000117 (практика)**: пишет `state.skillXp[id]` (ДРОБИ!) — serde 000085
  переносит дроби БЕЗ floor (D3/D4: xp/skillXp finite ≥ 0 as-is) — round-
  trip 000117 без потерь.
- **000109 (cities)**: лезет в те же функции main.js; его restore-секция —
  в хвост (после quests/npcStocks ~632); наши 3 раздела — в СЕРЕДИНЕ
  (после Персонажа ~451) → конфликт минимален. В collectSaveData оба дописываем
  в хвост объекта — union при ребейзе.
- Форма roster НЕ меняется (000079) → бампов нет; форма efir — 5 полей
  (000111) → бампов нет (000115 — только расширение).

## Подводные камни

1. **Старые строки в ТЗ**: collectSaveData «~262» → факт 326; restoreFromSave
   «~300» → 381; onDay «~425» (000087) → 659/671. Ориентир — по содержимому,
   не по строкам.
2. **Stale-контракты, которые ПРЕРЫВАЕТ 000085** (файлы НЕ правим — активные
   контракты параллельных задач): `memory/000081-efir.md` §3 «СЕЙВ» (3 поля),
   `memory/000081-efir-ally.md` §2 «СЕЙВ» (3 поля), ТЗ 000115 (3-полевая база).
   Форма 5 полей — канон (D1).
3. **slice(0, NaN) → []**: мусорный max_companions молча стирает отряд —
   guard в deserializeRoster (D3).
4. **VM cross-realm** (000082): deepStrictEqual sandbox-объектов vs host-
   литералов падает — только через `host()` (JSON round-trip); **`host(undefined)`
   БРОСАЕТ** (JSON.stringify(undefined) → undefined) — сначала
   `assert.ok(Array.isArray(state.roster))`, потом host(); ошибки из vm не
   instanceof host Error; наблюдаем через `__game.state`.
5. **Object.assign vs per-assignment** для efir: переназначение сломало бы
   live-ссылки (state, combat-finish, future-тесты) — только assign (D8).
6. **Хвост efir.js — трёхсторонний union** (000085 + 000112 + 000115):
   экспорты строго в хвост фабрики (000111 §11); ребейз — по смыслу + полный
   npm test.
7. **Re-pins union**: efir R1 «ровно 11» → 13 (мы) — если 000112 смержится
   первым и докрутит до 12 (buildEfirUnit), итог = 14; решается по смыслу
   при ребейзе.
8. **Новые разделы сейва = 0 новых saveNow** (D10): поведение сейвов
   bit-for-bit как до, кроме новых полей; все существующие тесты (000031/
   000045/000046/000072) зелёные без правок (source-scan 000045/000046 режет
   slice от `function restoreFromSave` и ищет свои строки — наши additions не
   ломают match).
9. **XP/LOYALTY runtime — валидные**: xp — целые (combat.js:637 Math.round;
   applyCombatXp — целые пороги); loyalty — clamped 0..100 (payWages;
   `loyaltyTick = payWages`-алиас, companions.js:278); level/hiredDay —
   целые. Serialize-чистая-копия (D2/D4) — безопасно; «дробный runtime xp у
   roster» (черновик P3) — НЕВЕРНО для roster (верно только для efir.skillXp,
   000117).
10. **main.js — горячий файл** (000083/000086/000087/000109/000115): 4 ханка
    разнесены (a: state-зона ~209, b: хвост collectSaveData ~358, c: 3 секции
    restoreFromSave ~451, d: хвост state-листа ~1529) — ребейз сверять ПО
    СМЫСЛУ; полный npm test после ребейза ОБЯЗАТЕЛЕН.
11. **Флейк чужого теста** → перепуск `node --test tests/<файл>` + запись в
    result (стандарт).

## Коммиты (последующие станции)

1. `Задача 000085: красные тесты` — tests/save.test.js (T1–T6 + dataExtra),
   re-pins API_KEYS/R1, memory/000085-*.md (memory коммитится С тестами;
   черновик 000085-save-companions-efir.md — НЕ коммитить / удалить).
2. `Задача 000085: src/companions.js + src/efir.js — serialize/deserialize отряда и Эфира` (T1–T3 зелёные).
3. `Задача 000085: src/main.js — разделы сейва companions/efir/dead_mercs` (T4–T6, весь тест-план зелёный, 1362).
4. (fixups после анализ-агентов, при необходимости).
Каждый коммит: последняя строка `Co-Authored-By: Claude Code <noreply@anthropic.com>`.
CHANGELOG.md НЕ ТРОГАЕМ (инструкция workflow). Мерж-стадия — оркестратор:
.merge-pending → rebase по смыслу → npm test → merge → удалить .merge-pending.

## Расхождения с черновиком (000085-save-companions-efir.md) — итоговая адjudикация

| Вопрос | Черновик | КАНОН (этот файл) | Почему |
|---|---|---|---|
| Битые числа в записи roster | запись → dropped | **запись → dropped** (level не int ≥ 1, xp не finite ≥ 0, loyalty не finite, hiredDay не finite ≥ 1) | SPEC «невалидные записи — тихий сброс» (сброс ЗАПИСИ), house-строгость sanitizeSavedHero; не выдумывать фолбэки вместо прогрессии |
| xp дробный | as-is (дроби OK) | **as-is (дроби OK)** | 000082 «любое xp ≥ 0», прецедент hero.xp |
| serializeRoster/serializeEfir | нормализация значений | **чистая проекция** (shape-guard только) | runtime well-formed (доказано); единая точка ремонта — deserialize; честный снапшот |
| efir level 2.5 / skills 2.5 | floor | **null (строгий int)** | forged 999.5 не должен floor'иться до 999; прецедент hero.level; форма 000111 §2 — int |
| deserializeRoster(null) | {roster:[], dropped:[]} | **{roster:[], dropped:[]}** (тотальная) + main.js гвард `rawC != null` | оба пути → [], тихо; функция тотальна, гвард — на страховку |
| dead_mercs «призрак» | членство в NPCS | **npcForEntry-критерий (id + найм-объект)** | self-cleaning при правках каталога; консистентно с roster; non-merc id — мусор |
| Размещение restore-секций | после quests/stocks ~632 | **после «Персонажа» ~451** | хвост ~632–634 — зона 000109 (cities); середина = нулевой конфликт |
| Stale-комменты main.js | не трогать (P8) | **обновить** (198–202, 1526–1528, 322–325) | внутри наших ханков, нулевая доп. площадь; 4 потребителя не заблудятся |
| EFIR_SPELL_START в deserialize | литерал-дубликат (P5) | **ссылка на константу** (тот же модуль) | нет дублирования → нет дрейфа |
| Тесты | 8 (R1–R8, →1364) | **6 (T1–T6, →1362)** | version-пин 000072 уже существует (save.test.js:256) — 7-й мой T1 был дубль; состав T1–T6 покрывает все R1–R8 (fresh-copy, фикс-точки, host(undefined) вобраны) |
| max_companions NaN | «default 3» (без явного guard) | **guard int ≥ 1, иначе 3** | slice(0, NaN) → [] = отряд испаряется |

## Конфликт параллельного прогона (примечание красной станции, 2026-10-03)

ВОССТАНОВЛЕНИЕ: этот файл и `000085-save-roster.md` были УДАЛЁНЫ из
worktree в середине сессии красной станции (вне её действий) и
восстановлены красной станцией: данный файл — дословно (по чтению
сессии), roster-файл — реконструкцией по этому контракту (см. шапку того
файла).
Причина: параллельный прогон (другой workflow-инстанс, работающий в этом
же worktree .worktrees/task-000085) переписал
`memory/000085-save-companions-efir.md` в НОВЫЙ «КАНОН-контракт»
(«финальный прогон 2026-10-03», записи 02:32/03:16), заявив, что ЭТОТ файл
и roster — «черновики предыдущего прерванного прогона». Его решения
разногласуют с ЭТИМ контрактом по существу: (а) числовые дефекты записи
roster → НОРМАЛИЗАЦИЯ (level floor/clamp, xp ≥ 0, loyalty → старт 50),
а не drop-записи (D3); (b) `dropped = [{npcId, reason}]`, а не [npcId];
(c) 9 тестов (R0-пин + R1–R6) и 1365, а не 6 (T1–T6) и 1362; (d)
reprocess-fixed-point фикстуры для Эфира.
СТАТУС: конфликт НЕ АРБИТРИРОВАН. Красная/зелёная станции workflow
000085 работают по ЭТОМУ файлу (указание оркестратора: «дизайн закрыт,
контракт записан в 2 файла … КАНОН»). Файл параллельного прогона оставлен
в worktree untracked (НЕ удалён — активный артефакт чужого прогона;
доказательства: /tmp/thegame-wf-000085/conflict-evidence/). Мерж-станции
обязана арбитраж: выбрать ОДИН контракт и довести задачу до его конца.

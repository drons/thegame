# 000085 — Сейв: отряд (companions) и Эфир (efir) — КАНОН-контракт

Станция: ПРОЕКТИРОВАНИЕ (финальный прогон 2026-10-03). Файл-контракт для
RED/GREEN станций и будущих задач (000083/000086/000087/000115/000117).
ВСЕ строковые ссылки, счётчики экспортов и формулы СВЕРДЕНЫ с кодом базы
05c9214 (2026-10-03, station-верификация): save.js:41/54, companions.js
(12 экспортов; npcForEntry:114), efir.js (11 экспортов;
EFIR_SPELL_START:213; reprocess-точки :334; efirSkillXpForNext(1)=30;
xpForNext(5)=559), settings max_companions:3/companion_loyalty.start:50,
main.js (efir-блок 198–209; NPCS 212; collectSaveData 326; buildingQuests
356–358; restoreFromSave 381; «Персонаж» 403–451; defeatedAt 453; saveNow
365/671/1032/1075/1162/1460; debug-бой onEnd 741–749 БЕЗ saveNow;
restoreFromSave() — единственный вызов 1659; __game.state efir 1529),
test-пины (API_KEYS 12; R1 «ровно 11 (9 ф. + 2 д.)» :138; R13 main-visuals
:1047; bootWithSave :405; host() :32; 000072-пин :256), SPEC «Спутники»→
«Сейв» и «Дух Эфира»→«Сейв» (5 полей), memory/000111 §9, 000082, ТЗ
000109 (раздел `cities` — без коллизии), 000065 (порядок мержа).
Красная фаза ВЫПОЛНЕНА и закоммичена: b63f507 «Задача 000085: красные
тесты» (6 тестов T1–T6 + re-пины; npm test: 1362 = 1353 зелёных + 9 красных).
Зелёная фаза ВЫПОЛНЕНА и закоммичена параллельным прогоном: 13ab54b
«Задача 000085: companions.js/efir.js/main.js — сейв отряда и Эфира»
(companions.js +111, efir.js +110, main.js +139; полный npm test в
worktree: 1362/1362 зелёных — проверено станцией проектирования 08:2x).
В b63f507 вместе с тестами закоммичены ОБА черновика первого прогона
(000085-save-party-efir.md + 000085-save-roster.md); на этой станции они
были удалены из worktree, но параллельный GREEN-прогон восстановил их и
закоммичил в 13ab54b — ФИНАЛЬНОЕ удаление (git rm) — обязанность
RESULT/MERGE-станции (§9): в ветке должен остаться ОДИН контракт — этот файл.
АРБИТРАЖ КОНФЛИКТА (2026-10-03, станция ПРОЕКТИРОВАНИЕ): в worktree
одновременно существовали два расходящихся контракта параллельных прогонов
— «party-efir» (первый прогон: строгий drop, dropped=[npcId], 6 тестов
T1–T6; ПО НЕМУ написаны закоммиченные красные тесты) и эти (второй прогон —
нормализация, dropped=[{npcId,reason}], 7 тестов). Арбитраж ВЫБРАЛ семантику
первого прогона — она совпадает с закоммиченными красными тестами и
house-прецедентом sanitizeSavedHero: строгий drop записи roster при
числовом дефекте (D3), dropped = [npcId] строки (D3/D12, паттерн 000072),
6 тестов T1–T6 → 1362 (D14, без дубля version-пина). Фикстуры T3/T4 —
частичные (как в закоммиченных тестах) — §6/§11. Доказательства конфликта:
/tmp/thegame-wf-000085/conflict-evidence/; полная запись арбитража — §11.
Примечание о восстановлении: файл был удалён из worktree параллельным
прогоном в ходе GREEN-реализации (07:1x) и ВОССТАНОВЛЕН станцией
проектирования дословно в этой (арбитражной) редакции; при повторном
удалении архивная копия — /tmp/thegame-wf-000085/final-contract/.
GREEN-коммит 13ab54b (src-реализация, единый коммит по
companions/efir/main.js) закоммичен; параллельный прогон ПРИ ЭТОМ
ВОССТАНОВИЛ черновики (а) — 13ab54b содержит все три 000085-memory-файла.
ФИНАЛЬНОЕ состояние ветки — ОДИН контракт (этот файл): черновики (а)
ОБЯЗАНЫ быть удалены из дерева (`git rm`) следующим коммитом
(RESULT/MERGE-станция) — см. §9.

## 0. Ключевое решение

**CURRENT_VERSION = 1, MIGRATIONS = {} — БЕЗ БУМПЫ, save.js не трогаем (0
изменений).** Правило 000031/000072: неломкое расширение v1 — новые data-поля
не поднимают версию (старый сейв читается: отсутствующие поля → дефолты).
Слом структуры — не повод бампить (бамп = миграция + тест; допустимо ТОЛЬКО
если структура реально ломаётся — в этом ТЗ она не ломается).

### 0.1 Открытые вопросы (a2-arch §7 + ТЗ) — ЗАКРЫТЫ

1. Форма efir: 3 поля (ТЗ 000085/000115) vs 5 (состояние 000111) → **5
   полей** — D1 (SPEC + round-trip без data loss; a3-позиция «3 канон»
   отклонена — её обоснование строилось на устаревшей базе f9e9b6a).
2. saveNow-точки (противоречивая атрибуция ТЗ 000085/000087) → **0 новых
   в 000085** — D9 (существующие call-сайты покрывают; события найма/гибели
   появятся в 000083/000087, точки вешают они).
3. Кап поддельного отряда сверх max_companions → **ДА, первые N, остаток —
   в dropped (id)** — D3 (SPEC «отряд — максимум 3» + защита от forged
   save; NaN-guard в самом чтении SETTINGS).
4. Кросс-валидация «найм в будущем» (hiredDay > clock.day) → **НЕТ** — D15
   (ТЗ не требует; функция чистая — часы не передаются; при необходимости
   опциональный 3-й аргумент — неломкое расширение).

## 1. Что добавлено

### 1.1 Новые поля сейва (data.*) — имена разделов ФИКСИРОВАНЫ

| Поле | Форма | Старый сейв (поля нет) | Писатель | Читатель |
|---|---|---|---|---|
| `companions` | `[{npcId, level, xp, loyalty, hiredDay}]` — ровно 5 полей на запись | `[]` (пустой отряд) | main.js `G.companions.serializeRoster(roster)` | main.js `G.companions.deserializeRoster(NPCS, raw)` |
| `efir` | `{level, xp, skillXp, skills, spells}` — ровно 5 полей (D1) | live-объект уже `createEfir()` = {1, 0, {}, {}, ['spark','mend']} (ЗАФИКСИРОВАНО: Эфир появляется L1) | main.js `G.efir.serializeEfir(efir)` | main.js `G.efir.deserializeEfir(raw)` → `Object.assign(efir, s)` |
| `dead_mercs` | `[npcId]` (строки, mercs) | `[]` | main.js `deadMercs.slice()` | main.js inline (без модульной функции — тривиально) |

Имена НЕ пересекаются с разделами 000072 (buildingOncePerDay/buffs/teleports/
buildingQuests/buildingContent/explored) и с `cities` (000109 параллельно
правит те же функции main.js — см. P1/D7).

### 1.2 Game-state в main.js (000085 СОЗДАЁТ; 000083/000086/000087 — ПОТРЕБИТЕЛИ)

- После блока efir (~строка 209), ДО `const NPCS` (~212):
  `let roster` + guard по шаблону блока efir (198–209):
  `G.companions && typeof G.companions.createRoster === 'function'` →
  `roster = G.companions.createRoster()` (→ `[]`), иначе `roster = []` +
  `console.error` (один раз, деградация — не крах, 000038/000053).
  `const deadMercs = []` рядом (мутабельный массив, не let).
- `__game.state` getter: `+ roster: roster,` и `+ deadMercs: deadMercs,`
  рядом с `efir: efir || null,` (~1529).

## 2. Решения (D1–D15) — каждое с «почему»

**D1. Эфир в сейве — 5 полей `{level, xp, skillXp, skills, spells}`, НЕ 3.**
— SPEC «Дух Эфира»→«Сейв» зафиксировала 5-полевую форму БЕЗ бампа версии;
000111 (слит) создал live-состояние ровно из 5 полей; 3-полевая форма старого
ТЗ потеряла бы skillXp/spells каждый сейв, round-trip был бы невозможен.
(Конфликт a3-анализа «3 поля каноничны» — отклонён: аргументация шла от
устаревшего ТЗ 000115 (3 поля против 5-полевой формы f9e9b6a); канон —
SPEC + code. Её ТЗ устарело по форме; её зона — расширение наших функций.)

**D2. `serializeRoster(roster)` — чистая проекция, без нормализации значений.**
— Live-состояние всегда well-formed (xp — ЦЕЛЫЕ: combat.js:637
`Math.round(xp * share)`; loyalty — clamped 0..100 в payWages), проекция
без потерь; нормализация значений — ЕДИНАЯ точка в deserialize (один закон,
проще контракт). Ровно 5 полей; не-объектные записи — skip; не-массив → [].
Fresh-copy (мутация input не меняет снапшот).

**D3. `deserializeRoster(npcs, raw)` — catalog-first (прецедент restoreNpcStocks),
числовой дефект = ЦЕЛАЯ ЗАПИСЬ В DROPPED (строгий drop).**
— Арбитраж (позиция «нормализация» отклонена): (1) house-прецедент
sanitizeSavedHero (player.js:131) — level не integer ≥ 1 → запись hero NULL
ЦЕЛИКОМ, xp не finite ≥ 0 → null: «битая запись — тихий сброс» (SPEC «Сейв»)
= сброс ЗАПИСИ, а не починки полей; (2) внутренняя согласованность —
deserializeEfir строгий (D5: любой дефект → null), roster-нормализация при
том же роде мусора была бы противоречием в двух новых разделах; (3)
нормализация ИНВЕНТИРИТ прогресс из битого/forged сейва (level 0 → «починка»
1 — спутник, которого в сейве не было, появляется в игре); легитимный сейв
ВСЕГДА well-formed (D2 — serialize чистая проекция live-состояния), поэтому
«сохранить спутника» — пустой аргумент: drop срабатывает только на битом
вводе, где «сохранить» = выдумать; (4) a1-анализ независимо выбрал drop.
Правила:
  - `raw == null` → `{roster: [], dropped: []}` — ТИХО (старый сейв, не битый);
  - не-массив → `null` (main.js: warn + отряд `[]`);
  - запись не-объект / `npcId` не строка → тихий skip (НЕ в dropped — id
    нет, warn нечего печатать);
  - **призрак** — `npcForEntry(npcs, entry)` (companions.js:114: найдено по id
    И `найм` — объект) → `dropped`;
  - дубликат npcId (2-я и далее) → `dropped`;
  - ЧИСЛА — строгая схема, ЛЮБОЙ дефект → запись целиком в `dropped`:
    `level`: `Number.isInteger && >= 1` (2.5 / 0 / 'x' → drop);
    `xp`: `Number.isFinite && >= 0`, сохраняется КАК ЕСТЬ (дробь легитимна —
    прецедент hero.xp в sanitizeSavedHero, 000082 «любое xp ≥ 0»;
    -1 / 'x' → drop);
    `loyalty`: `Number.isFinite` → clamp 0..100 БЕЗ округления (150 → 100,
    77.5 → 77.5 — нормализация диапазона, не инвентаризация; 'x' → drop);
    `hiredDay`: `Number.isFinite && >= 1` → `Math.floor` (2.7 → 2;
    0 / 'x' → drop).
  - **кап**: `max = Number.isInteger(SETTINGS.max_companions) &&
    SETTINGS.max_companions >= 1 ? SETTINGS.max_companions : 3` (guard —
    иначе `slice(0, NaN) → []` сотрёт целый отряд при мусоре в SETTINGS);
    записи сверх max (в порядке) → `dropped`.
  - `dropped` = `[npcId]` — МАССИВ СТРОК (паттерн 000072:
    pruneQuestBookByDay → {book, dropped:[ids]} + warn `.join(', ')`,
    npc.js:653–666); порядок выживших сохранён.
  - «найм в будущем» (hiredDay > clock.day) — НЕ проверяется (D15).
  Функция ТИХАЯ (ноль console — warn печатает main.js по `dropped`).

**D4. `serializeEfir(state)` — чистая структурная проекция.**
— `state == null` / не plain-object → null; ровно 5 полей: level/xp как есть
  (live well-formed); skillXp/skills: объект → копия finite-значений
  (мусорные ключи тихо skip), нет → {}; spells: массив → копия строк
  (не-строки skip), нет → []. Дефолт `['spark','mend']` — ТОЛЬКО в
  deserialize (единая точка дефолта; пустые spells в сейве на загрузке
  превратятся в стартовый набор).

**D5. `deserializeEfir(raw)` — строгая схема: ЛЮБОЙ дефект → null.**
— Эфир — ОДНА запись (не список): дом-стиль для битой одиночной записи —
  сброс целиком (прецедент sanitizeSavedHero → null → дефолт). Правила:
  - `raw == null` / не plain-object → null (main.js: WARN только — efir к
    моменту restore уже `createEfir()` и не мутирован: restoreFromSave()
    вызывается один раз на main.js:1659, после загрузки карты, до цикла
    игры — явное пере-assignment не нужно, сброс к L1-дефолту самодостаточен);
  - `level`: `Number.isInteger && >= 1`, иначе null (2.5 — дефект формы:
    level — целое, прецедент sanitizeSavedHero.level; floor НЕ применяем);
  - `xp`: number, finite, >= 0, КАК ЕСТЬ (дробь OK — прецедент hero.xp);
  - `skillXp`: нет → {}; есть → plain-object + все значения finite >= 0
    (дроби ЛЕГИТИМНЫ — SPEC «{id: дробный}», практика 000117), иначе null;
  - `skills`: нет → {}; есть → plain-object + все значения
    `Number.isInteger && >= 0` (2.5 → null: уровень скила — целое, 000111 §2),
    иначе null;
  - `spells`: нет/пусто → `EFIR_SPELL_START` (внутренняя константа efir.js
    `['spark','mend']` — ссылка напрямую, НЕ экспорт); есть → массив, все
    элементы строки, дубли — первое вхождение, иначе null;
  - возврат — НОВЫЙ объект (копии skillXp/skills/spells);
    **reprocessEfirSkills НЕ вызывается** (D8).

**D6. `dead_mercs` — inline в main.js (без модульной функции-экспорта).**
— serialize: `deadMercs.slice()` (live всегда строки); deserialize: id
  не-строка → тихий skip; дубликат → skip (первый остаётся);
  **призрак = тот же критерий, что у отряда (id И объект `найм`)** — единый
  критерий валидации для обоих разделов (npcForEntry-семантика, в main.js
  инлайн: `NPCS.some(n => n && n.id === id && n.найм && typeof n.найм ===
  'object')`); демонированный merc (без `найм`) и так не кандидат на найм
  (hireCandidates), его id — мёртвый груз; drop + warn — честная чистка.
  Заполнение: clear-then-fill (`deadMercs.length = 0; push(...keep)`).

**D7. Размещение restore-секций — СРЕДИ функции, после try/catch «Персонаж»
(~451), ДО «Побеждённые группы» (~453).** — Хвост restoreFromSave —
конвенциональная append-зона для 000109 (cities; её ТЗ ссылается на
defeatedAt-паттерн, раздел на 453–466, т.е. и хвост, и окрестности
defeatedAt — её вероятные зоны); размещение посреди функции — нулевой
текстовый конфликт при ребейзе. Порядок секций функционально не важен.

**D8. В 000085 НЕТ reprocessEfirSkills и НЕТ id-валидации (зона 000115).**
— efir.js:334: «Точки вызова: levelUp (после while), deserialize (000115 —
ОБЯЗАТЕЛЬНО), practiceEfir (000117…)»; ТЗ 000115: «serialize/deserialize —
базовые из 000085, расширяем» + id-валидация по assets/skills + assets/spells.
До мержа 000115 state МОЖЕТ содержать поддельные id — потребители обязаны
GUARD (§7, 000112).

**D9. 000085 НЕ добавляет НИ ОДНОГО нового вызова saveNow.**
— Существующие точки структурно покрывают ТЗ: each-step (1460), onDay (671),
конец боя world (1032)/dungeon (1162), exitLocation (1075), beforeunload (365).
Сбор «событийных» точек — за потребителями: найм/увольнение — 000083
(npcUI.open onChange → saveNow); гибель/уровень в бою — 000087 (onEnd ВНУТРИ
до существующего saveNow). GAP: debug-бой `startCombatAt` (onEnd ~742–749)
БЕЗ saveNow — решение (xp/уровень/гибель персистятся на следующем
шаге/дне, как xp героя — терять нельзя) — в памяти 000087.

**D10. Guards в collectSaveData — паттерн buildingEffects (356–358), НЕ 000046.**
— `G.companions && typeof G.companions.serializeRoster === 'function'`
(000046'овский `&& x > 0.001` — для числового возврата; здесь функция
возвращает массив/null — проверка на функцию). Fallback: companions → [],
efir → null, dead_mercs → [].

**D11. Устаревшие комментарии main.js — тех-фикс В НАШИХ ХАНКАХ; index.html —
НЕ ТРОГАТЬ.** — main.js:198–202 («{level, xp, skills} (форма зафиксирована
под сейв 000085…») и 1526–1528 («live-объект {level, xp, skills}») становятся
фактически неверными в самом месте, куда ложится наш код: обновить на
5-полевую форму в тех же ханках (комменты — не ребейз-зона). Комментарий
index.html на теге efir.js — НЕ трогать (явный прецедент memory/000111:
«из-зоны фикс, документация сейва — 000115» + инвариант «index.html —
0 изменений»).

**D12. Раздел с «призраками» — тихий сброс + warn, игра НЕ падает.**
— Паттерн 000029/000072: каждый раздел — СВОЙ try/catch; warn —
console.warn (НИКОГДА не console.error — в vm-цепочке 0 console.error,
иначе все vm-тесты падают); текст warn ОБЯЗАН содержать имя раздела
(fixator-friendly: 'companions', 'efir', 'dead_mercs'); `dropped` (строки)
main.js форматирует в ОДИН warn как
`'Сейв: companions — отброшены: ' + dropped.join(', ')` (паттерн 000072:
npc.js:661–666 + main.js:643–647); T6: warns обязаны содержать и имя
раздела, и отброшенный npcId.

**D13. Exports — в хвост фабрики; функции тихие.** — companions.js:
+serializeRoster, +deserializeRoster (API 12 → 14); efir.js: +serializeEfir,
+deserializeEfir (API 11 → 13: 11 функций + 2 данных), ноль require(
(пinned-тест ~181 остаётся верным). Порядок в return-объекте — после
существующего хвоста (минимизация конфликта с 000112/000115, memory/000111 §11).

**D14. Тесты — 6 новых в tests/save.test.js (T1–T6, все red) → 1356+6 =
1362.** — §6 (ровно T1…T6, по одному test() на T; субкейсы — asserтами
внутри). (Арбитраж: 000072-пин «CURRENT_VERSION = 1, миграций нет»
существует — save.test.js:256 — и глобально фиксирует «нет бампа»;
отдельный version-пин в нашем блоке НЕ создаётся (дубль); требование ТЗ
«версия остаётся 1» покрыто ассертом T5 — saved.version === 1. Позиция
второго прогона «7-й test — self-documenting pin в нашем блоке» отклонена
как дубль.)

**D15. Кросс-валидация `hiredDay > clock.day` («найм в будущем») — НЕ
делается в 000085; сигнатура остаётся 2-аргументной `(npcs, raw)`.**
— ТЗ предписывает только «призрак» + битый раздел; оба анализа сошлись
(a1: «функция ЧИСТА — часы не передаются», a2 open-вопрос #4: «НЕ делается —
ТЗ не требует»); кодовые «будущие»-проверки (defeatedAt 459,
buildingOncePerDay 482, buildingQuests 569) существуют, потому что дни там
УПРАВЛЯЮТ респауном/выдачей — hiredDay в 000085 ничему не управляет
(жалованье/уход — 000087). При необходимости 000087/000115 добавят
ОПЦИОНАЛЬНЫЙ 3-й аргумент `day` — расширение неломкое.

## 3. Сигнатуры (фиксированные)

```js
// src/companions.js — exports в хвост фабрики, функции тихие (без console)
serializeRoster(roster) → Entry[]                         // чистая проекция 5 полей; !Array → []
deserializeRoster(npcs, raw) → {roster, dropped} | null   // catalog-first; dropped = [npcId…] (строки, паттерн 000072)

// src/efir.js — exports в хвост фабрики, ноль require, функции тихие
serializeEfir(state) → {level, xp, skillXp, skills, spells} | null   // структурная проекция
deserializeEfir(raw) → state | null                            // строго; БЕЗ reprocess (000115), БЕЗ id-валидации (000115)
```

## 4. Ленивые ссылки и guards

- main.js: ОДИН snapshot `const G = globalThis.Game` (строка 13) — все ссылки
  через `G.companions` / `G.efir` + typeof-guard на функцию; деградация:
  roster=[] / efir=null / deadMercs=[] + console.error ОДИН раз (создание
  state, паттерн 000038/000053).
- SETTINGS — live-чтение `max_companions` — с Number.isInteger guard (D3);
  `companion_loyalty.start` deserialize НЕ читает (дефект loyalty → drop,
  а не fallback — D3).
- companions.js: NPCS-каталог deserializeRoster получает АРГУМЕНТОМ
  (не читает каталог сам — функция чистая); SETTINGS — live-чтение через
  `settings.SETTINGS.*` (фабрика уже держит ссылку — прецедент
  refusalChance), НОВЫХ require НЕТ.
- efir.js: НОЛЬ require (пин ~181), НОЛЬ обращений к корню Game;
  EFIR_SPELL_START — внутренняя константа (D5/P2).
- `Object.assign(efir, s)` при восстановлении — мутация live-объекта
  (000111 §5: efir — один объект на сессию, все потребители держат ссылку).

## 5. saveNow (кто что вешает)

| Точка | main.js | Кто вешает |
|---|---|---|
| каждый шаг | 1460 | существует |
| смена дня (onDay) | 671 | существует; 000087: payWages/loyaltyTick ПЕРЕД ней + hudFlash |
| конец боя (world) | 1032 | существует; 000087: xp/гибель → dead_mercs в onEnd ДО неё |
| dungeon respawn cycle | 1162 | существует; 000087: idem |
| exitLocation | 1075 | существует |
| beforeunload | 365 | существует |
| найм/увольнение | — | **000083** (npcUI.open onChange → saveNow) |
| гибель/уровень спутника в бою | — | **000087** (обработчик конца боя) |
| **debug-бой startCombatAt** | onEnd ~742–749 БЕЗ saveNow | **GAP → 000087** (решение — в его памяти, НЕ терять) |

## 6. Тесты (tests/save.test.js, блок «Задача 000085»)

Harness: `bootWithSave(storage, heroExtra, dataExtra)` — 3-й арг (additive,
ТОЛЬКО save.test.js его использует; `data = Object.assign({day:1, steps:0,
hero}, dataExtra)`). Cross-realm: строки — примитивы (сравнивать напрямую);
для объектов — `host()` (JSON round-trip); `host(undefined)` БРОСАЕТ —
сначала `assert.ok(Array.isArray(state.roster))`, потом host();
beforeunload — `h.winListeners['beforeunload'][0]()`.

- **T1** (node): serializeRoster — ровно 5 полей, лишние поля записи
  отброшены, не-массив → [], не-объектные записи skip, **fresh-copy**
  (мутация input не меняет снапшот), тихая (0 console.warn).
- **T2** (node): deserializeRoster с НАСТОЯЩИМ NPCS (`require ../src/npc-data.js`,
  6 mercs: merc_volk/ashka/baldor/mira/torga/rena) — null/undefined →
  {roster:[],dropped:[]}; 'junk'/42/{} → null; round-trip 3 валидных;
  ghost_merc → dropped; дубликат → dropped; 4 валидные > max 3 → 3 + 4-я
  в dropped; npcId:42 / не-объект → тихий skip (НЕ в dropped); таблица
  чисел (СТРОГИЙ DROP — битая запись целиком в dropped): level 2.5 → drop,
  level 0 → drop, xp -1 → drop, xp 7.9 → 7.9 (as-is, КЕПТ), loyalty 150 →
  100 (КЕПТ), loyalty 'x' → drop, loyalty 77.5 → 77.5 (КЕПТ), hiredDay 0 →
  drop, hiredDay 2.7 → 2 (КЕПТ); порядок сохранён; тихая.
- **T3** (node): serializeEfir/deserializeEfir — round-trip ИДЕНТИЧЕН: свежий
  `createEfir()` И фикстура «после боя»
  `{level:2, xp:10, skillXp:{firelord:2.5}, skills:{firelord:1},
  spells:['spark','mend','light_heal']}` (ключи ЧАСТИЧНЫЕ — serde переносит
  как есть, round-trip идентичен; по ЗНАЧЕНИЯМ — fixed-point будущего
  reprocess: банк 2.5 < efirSkillXpForNext(1)=30, requires не выполнены;
  под reprocess 000115 добавятся 3 нулевых ключа — фикстуру тогда дописывает
  000115, §7). 3-полевая legacy {level:2, xp:5, skills:{}} → 5 полей
  (skillXp {}, spells [spark,mend]); сломанные → null: 'junk', 42, null,
  [1], level 0.5, level 0, xp 'x', xp -1, skillXp 'abc', skillXp {a:-1},
  skills 42, skills {a:'x'}, skills {a:2.5}, spells 'abc', spells [1];
  spells [] / нет → [spark, mend]; serializeEfir(42)/serializeEfir(null)/
  serializeEfir(['a']) → null. (Фикстуры и списки — ЗАКОММИЧЕНЫ в b63f507
  дословно, save.test.js:708–755.)
- **T4** (vm): e2e round-trip — dataExtra {day:7, companions [merc_volk
  {2,30,77,3}, merc_ashka {1,0,50,2}], efir: {level:5, xp:5,
  skillXp:{firelord:2.5}, skills:{firelord:1},
  spells:['spark','mend','light_heal']} (L5: light_heal легитимен по
  EFIR_SPELL_UNLOCKS, порог 5; ключи частичные), dead_mercs [merc_baldor]}
  → boot (errors 0) → state host-сравнение (roster/efir/deadMercs) →
  beforeunload → saved.data deepEqual + version 1.
- **T5** (vm): СТАРЫЙ сейв без новых полей: `bootWithSave(st, undefined,
  {day:5})` (hero — дефолт хелпера; в data НЕТ companions/efir/dead_mercs)
  → state.roster [] (Array!), state.deadMercs [], state.efir
  {level:1, xp:0, skillXp:{}, skills:{}, spells:['spark','mend']}
  (L1, ЗАФИКСИРОВАНО); beforeunload → companions [] / efir L1-дефолт /
  dead_mercs [] / **version 1** (требование ТЗ «версия остаётся 1»
  проверяется здесь; отдельного version-пина в блоке НЕТ — D14).
- **T6** (vm): сломанный сейв + призраки (companions [valid merc_volk,
  {npcId:'ghost_merc',…}, {npcId:42,…}, 'junk'], efir 'junk', dead_mercs
  ['merc_rena','ghost_dead',42,'merc_rena']) → `errors.length === 0`;
  warns: содержат 'companions' + 'ghost_merc', 'efir', 'dead_mercs' +
  'ghost_dead'; state чистый (roster [merc_volk], efir L1-дефолт,
  deadMercs ['merc_rena'] — дубль и призрак вычищены); beforeunload →
  сейв чистый (битое вычищено за 1 цикл).

Краснота — ЗАКОММИЧЕННЫЙ красный статус b63f507: npm test: 1362 = 1353
зелёных + 9 красных: T1–T3 — TypeError «…is not a function» (экспорты
отсутствуют); T4/T5 — state.roster отсутствует в __game.state; T6 — warns
о битых разделах/призраках отсутствуют; 3 re-пина — 2 companions API-теста
(node + браузер; один список API_KEYS 12→14) + efir R1 «ровно 13».
Зелёная фаза: 13ab54b — ВСЕ 1362 тестов зелёных (проверено станцией
проектирования: save.test.js 28/28, полный прогон 1362/1362).

Re-pins (ТОЛЬКО техническая поверхность; ВЫПОЛНЕНЫ в b63f507):
- tests/companions.test.js API_KEYS (список ~125): 12 → 14 (+serializeRoster,
  +deserializeRoster; +6/−2 строки) — падает 2 теста (node + браузер).
- tests/efir.test.js R1: «ровно 11 (9 функций + 2 данных)» → «ровно 13
  (11 функций + 2 данных)» + expected-array +2 + FUNCS +2 (+10/−9 строки);
  пин «НОЛЬ require(» (~181) — без правок.
- НЕ трогать: index-order, save-restore (deepEqual только
  buildingOncePerDay/buffs/hero-keys), main-visuals (R13 — 5 ключей
  state.efir), 000072-пины, combat/npc/day/npc-hire/hud.

## 7. Что важно будущим задачам

- **000083** (мержит ПЕРЕД 000085, memory/000065): UI найма; `npcUI.open` +
  onChange → saveNow (его ТЗ). ПРАВИЛО РЕБЕЙЗА: если 000083 сам объявил
  roster/deadMercs — при ребейзе 000085 УДАЛИТЬ дублирующее объявление,
  сохранить save/restore-ханки (два `let roster` → ReferenceError → падают
  ВСЕ vm-тесты).
- **000086/000087**: потребители `state.roster` / `state.deadMercs` (уже в
  __game.state); 000087 — payWages/loyaltyTick в onDay ПЕРЕД saveNow (671) +
  hudFlash; applyCombatXp (000082) и гибель → dead_mercs ВНУТРИ onEnd ДО
  saveNow (1032/1162); `opts.allies` = rosterData (allyDataForEntry 000082);
  кандидаты = live roster + dead_mercs + каталог (candidatesForTavern 000079).
- **000109** (cities, параллельно): правит collectSaveData/restoreFromSave —
  её append-зона — хвост restoreFromSave; наши секции — посреди (D7).
- **000112** (buildEfirUnit): до мержа 000115 state МОЖЕТ содержать
  поддельные spell/skill-id (000085 id НЕ валидирует) — GUARD обязателен:
  `const s = SPELLS[id]; if (!s || …) continue;` (прецедент allyHeal).
- **000115** (расширяет наши функции, НЕ заменяет): (1) id-валидация: id
  скила ∉ assets/skills, id заклинания ∉ assets/spells → сброс ЗАПИСИ (null);
  (2) ОБЯЗАТЕЛЬНЫЙ `reprocessEfirSkills(state)` ПОСЛЕ deserialize
  (efir.js:334); (3) её ТЗ устарело по форме (3 поля против 5) — канон:
  5 полей (D1). Точки saveNow НЕ переносить (её ТЗ). Фикстуры T3/T4: по
  ЗНАЧЕНИЯМ — fixed-point её reprocess (банк 2.5 < 30, requires не
  выполнены), НО ключи частичные: reprocess пишет все 4 ключа skillXp/skills
  явно → при вводе reprocess 000115 ДОПИСЫВАЕТ в T3/T4-фикстуры 3 нулевых
  ключа (icelord/perception/precog: 0) — тест-правка её стороны.
- **000117** (practiceEfir): skillXp-дроби — легитимный runtime (serde
  переносит БЕЗ floor — D5).

## 8. Подводные камни (P1–P9)

- **P1 — hot-file rebase.** main.js правят 000083/000086/000087/000109/000115,
  efir.js — 000112/000115/000117. Ребейзить ПО СМЫСЛУ, не по строкам;
  наши ханки: state-зона (209–212), collectSaveData-хвост (356–358),
  restore-середина (451–453), __game.state (1526–1529). Конфликт с 000109
  минимален (D7); дубль `let roster` с 000083 — смертелен (§7).
- **P2 — efir.js трёхсторонний union** с 000112/000115 при мержах — exports
  только в хвост фабрики (387–396); EFIR_SPELL_START остаётся ВНУТРЕННЕЙ
  константой (deserialize ссылается напрямую, НЕ экспортировать).
- **P3 — дроби легитимны ТОЛЬКО в skillXp** (runtime: efir practice, 000117)
  И в xp на чтении (as-is, D3/D5). xp у roster в live — ЦЕЛЫЕ (combat.js:637
  Math.round). НЕ вводить floor на xp/skillXp — потеряем дробный runtime.
- **P4 — cross-realm в vm-тестах.** host() только для объектов;
  host(undefined) бросает — сначала assert.ok(Array.isArray); строки
  (warns) — примитивы, сравнивать напрямую.
- **P5 — Object.assign(efir, s) — мутация live-объекта**, не замена ссылки
  (все потребители держат ссылку, 000111 §5). Битый efir-раздел — warn без
  пере-assignment (efir уже дефолтен к моменту restore, D5).
- **P6 — 0 console.error в vm-цепочке.** Guard-ошибки при создании state —
  единственное легитимное console.error (паттерн блока efir 198–209, не
  срабатывает в тестах — модули загружены); restore — ТОЛЬКО console.warn,
  текст с именем раздела (D12).
- **P7 — флейк чужого теста:** перезапуск `node --test tests/<файл>` +
  запись в отчёт result.
- **P8 — комментарии.** main.js:198–202/1526–1528 — тех-фикс в наших ханках
  (D11); index.html-комментарий — НЕ трогать (прецедент 000111); прочие
  stale-комменты «3 поля» вне наших ханков — зона 000115.
- **P9 — source-scan тесты 000045/000046** режут слайс от `function
  restoreFromSave` и ищут СВОИ строки — наши вставки внутри функции их
  не ломают (проверено при анализе).

## 9. Коммиты (для последующих станций; НА ЭТОЙ СТАНЦИИ КОММИТОВ НЕТ)

1. `Задача 000085: красные тесты` — ВЫПОЛНЕНО: b63f507 (tests/save.test.js
   +279/−2 → 857 строк, companions.test.js +6/−2, efir.test.js +10/−9;
   вместе с тестами закоммичены черновики party-efir + roster — см. п. 3).
2. `Задача 000085: src/companions.js + src/efir.js — serialize/deserialize
   отряда и Эфира` + `Задача 000085: src/main.js — разделы сейва
   companions/efir/dead_mercs` — ВЫПОЛНЕНО параллельным прогоном единым
   коммитом: 13ab54b (companions.js +111, efir.js +110, main.js +139;
   serde-экспорты тихие, catalog-first, 3 restore-секции c try/catch).
3. ОСТАЛОСЬ (RESULT/MERGE-станция): (а) `git add` этого memory-файла и
   `git rm memory/000085-save-party-efir.md memory/000085-save-roster.md`
   (черновики восстановлены параллельным прогоном и закоммичены в 13ab54b —
   их удаление ОБЯЗАТЕЛЬНО: в ветке должен остаться ОДИН контракт — этот
   файл, арбитраж §11; при удалении этого файла параллельным прогоном —
   восстановить из /tmp/thegame-wf-000085/final-contract/); (б) полный
   `npm test` → 1362/1362 зелёных (проверено на 13ab54b); (в) опц. fixup:
   шапка тестового блока save.test.js:587–588 ссылается на контракт
   party-efir — обновить на этот файл (коммент, без изменения ассертов);
   (г) report в tasks/result + перенос задачи в done; (д) ребейз на
   актуальный мастер (на 08:2x — 83b079d, задача 000093 смержена; P1).
   Финальная строка каждого коммита: `Co-Authored-By: Claude Code
   <noreply@anthropic.com>`. CHANGELOG.md — НЕ ТРОГАТЬ (инструкция workflow).

## 10. План по файлам (фактические дельты)

| Файл | Дельта | Содержимое |
|---|---|---|
| tests/save.test.js | +279/−2, 580→857 | ВЫПОЛНЕНО (b63f507): блок «Задача 000085» T1–T6 (:583–:857), 3-й арг bootWithSave `dataExtra` (:405) → 1356→1362 |
| tests/companions.test.js | +6/−2 | ВЫПОЛНЕНО (b63f507): API_KEYS 12 → 14 (падает 2 теста: node + браузер) |
| tests/efir.test.js | +10/−9 | ВЫПОЛНЕНО (b63f507): R1 «ровно 13 (11 функций + 2 данных)», FUNCS +2 |
| src/companions.js | +111 | ВЫПОЛНЕНО (13ab54b): serializeRoster (:398) + deserializeRoster (:442, строгий drop D3, dropped-строки) + 2 exports (:490) |
| src/efir.js | +110 | ВЫПОЛНЕНО (13ab54b): serializeEfir (:413) + deserializeEfir (:450, строгий D5) + 2 exports (:503) |
| src/main.js | +139 | ВЫПОЛНЕНО (13ab54b): state-зона (let roster + guard, const deadMercs), collectSaveData +3 поля (guards D10), restoreFromSave — 3 секции, свои try/catch, после «Персонажа» (D7), __game.state +2, коммент-фикс (D11) |
| src/save.js | 0 | CURRENT_VERSION=1, MIGRATIONS={} — не трогаем |
| index.html | 0 | порядок скриптов уже корректен (companions 599 / efir 605 / save 676 / main 678) |
| CHANGELOG.md | 0 | НЕ ТРОГАТЬ (инструкция workflow) |

Итог: ≈ +350 строк в 3 src-файлах + ≈ +295 в тестах. `npm test` (node --test)
на 13ab54b: 1362/1362 зелёных (проверено станцией проектирования).

## 11. Арбитраж конфликта параллельных прогонов (ФИНАЛЬНО)

В worktree одновременно существовали ДВА расходящихся контракта:
(а) «party-efir» — первый прогон дизайна (`000085-save-party-efir.md` +
`000085-save-roster.md`; канон для его RED-станции по указанию оркестратора):
строгий drop, dropped = [npcId], 6 тестов T1–T6 → 1362;
(б) этот файл — второй прогон: нормализация чисел, dropped = [{npcId,
reason}], 7 тестов R0–R6 → 1363.
Примечание (а) фиксировало: «конфликт НЕ АРБИТРИРОВАН … выбрать ОДИН
контракт и довести задачу до его конца». Арбитраж выполнен НА ЭТОЙ СТАНЦИИ
(ПРОЕКТИРОВАНИЕ, 2026-10-03): ОДИН контракт — этот файл; его семантика
(строгий drop, dropped-строки, T1–T6) совпадает с закоммиченными красными
тестами b63f507 (написанными по (а)) — GREEN-станция реализует src под эти
тесты без расхождений; реализация 13ab54b СВЕРЕНА с этим контрактом
(строгий drop, dropped-строки, 3 try/catch, warn-форматы, 0 новых saveNow —
всё совпадает). Черновики (а) закоммичены в b63f507; эта станция удаляла
их из worktree, но параллельный GREEN-прогон восстановил их (13ab54b) — их
git rm — обязанность RESULT/MERGE-станции (§9); доказательства конфликта
сохранены: /tmp/thegame-wf-000085/conflict-evidence/ (архивы черновиков:
*-archived.md там же; архив этого контракта: /tmp/thegame-wf-000085/
final-contract/).

Выборы по расхождениям (каждое — почему):
- **D3 — строгий drop (из (а)).** House-прецедент sanitizeSavedHero
  (player.js:131): level/xp не валидны → запись NULL ЦЕЛИКОМ; SPEC «Сейв»:
  «битая запись — тихий сброс» = сброс записи, не починки полей.
  Согласованность с D5 (deserializeEfir — строгий): один закон для обоих
  новых разделов. Нормализация инвентарит прогресс из битого/forged сейва;
  легитимный сейв всегда well-formed (D2), поэтому аргумент «сохранить
  спутника» пуст (drop срабатывает только на битом вводе). a1-анализ
  независимо выбрал drop.
- **dropped = [npcId] строки (из (а)).** Паттерн 000072:
  pruneQuestBookByDay → {book, dropped:[ids]} + warn `.join(', ')`
  (npc.js:653–666, main.js:643–647); проще, один закон для warn.
- **6 тестов T1–T6 → 1362 (из (а)).** Version-инвариант уже зафиксирован
  000072-пином (save.test.js:256: CURRENT_VERSION=1 + MIGRATIONS пуст);
  T5 дополнительно ассертит saved.version === 1 (требование ТЗ «версия
  остаётся 1»). 7-й test-пин (позиция (б)) — дубль, отклонён.
- **Фикстуры Эфира T3/T4 — ЧАСТИЧНЫЕ (из (а), закоммичены в b63f507).**
  Красная фаза закоммичена по фикстурам первого прогона (T3: L2, xp 10,
  skillXp/skills только firelord; T4: L5, xp 5, там же) — переписывать
  закоммиченные красные тесты нельзя: контракт следует за кодом. По
  значениям фикстуры — fixed-point reprocess 000115 (банк 2.5 < 30,
  requires не выполнены), НО ключи частичные: reprocess пишет все 4 ключа
  явно → 000115 при вводе reprocess дописывает в фикстуры 3 нулевых ключа
  (тест-правка её стороны, §7). Позиция (б) «явные 4 ключа, L5» отклонена
  как фикстура 000085 — применима только как описание правок 000115.

Всё остальное (D1 5-полевой Эфир, D2/D4/D5/D6/D7/D8/D9/D10/D11/D13/D15,
§4–§10, P1–P9) — СОГЛАСОВАНО обоими прогонами: расхождений не осталось.

# 000115 — Сейв Эфира: финальная форма (аудит 000085 + пробелы ТЗ)

Статус: ЗАДАЧА ВЫПОЛНЕНА (реализация + ревью + финализация 2026-10-03;
npm test 1450/1450; см. раздел «Финализация» в конце).
**ЭТОТ файл — КАНОНИЧЕСКИЙ контракт 000115.**
ТЗ: `tasks/pending/000115.md` (source of truth; СТАРЕЕ мержей 000085/000111 —
читать через канон, см. раздел «Сверка 000085 с ТЗ»).
Канон базового сейва: `memory/000085-save-party-efir.md` (D1–D13) +
`memory/000085-save-roster.md`; контракт данных: `memory/000111-efir-growth.md`
(§2/§4/§9). SPEC: «Дух Эфира» → «Сейв» (SPEC.md L845–852).
Анализы: `/tmp/thegame-wf-000115/a1-domain.md`, `a2-arch.md`, `a3-tests.md`.
Worktree: `.worktrees/task-000115`, ветка `task/000115`, база 0ef1751
(мерж 000085). База npm test = **1443/1443 зелёных** (проверено 2026-10-03).
Мерж: ПОСЛЕ 000085 (сделано), ДО 000087 (цикл) и 000117 (практика).

## Итог аудита: задача = закрытие 2 пробелов + тесты, НЕ переписывание

ТЗ 000115 писали до мержа 000085 (его «состояние сейчас» — поле efir «ЕЩЁ НЕТ»
— устарело: 000085 СМЕРЖЕН, форма УЖЕ финальная 5-полевая). Аудит ТЗ-чек-листа
по коду master (0ef1751):

| Пункт ТЗ | Статус | Где закреплено |
|---|---|---|
| п.1 финальная форма `data.efir = {level, xp, skillXp, skills, spells}` | **ЗАКРЫТО** (000085 D1 + 000111) | `serializeEfir` (src/efir.js:413) — чистая копия ровно 5 полей; `createEfir` (efir.js:101) |
| п.1 HP/MP в сейв НЕ сохраняются | **ЗАКРЫТО** (структурно: HP/MP нет в форме состояния, каждый бой — новый makeAlly, hp = maxHP) | SPEC L848–850; 000111 §2 |
| п.2 неломкое v1, CURRENT_VERSION НЕ бампить, MIGRATIONS пуст | **ЗАКРЫТО, save.js — 0 изменений** | save.js:41/54; пин save.test.js:256 (000072) |
| п.2 старая 3-полевая форма → нормализация (spells нет/пусто → [spark, mend], skillXp нет → {}) | **ЗАКРЫТО** (000085 D5) | `deserializeEfir` (efir.js:450–489); T3 save.test.js:764–769 |
| п.2 efir отсутствует → `createEfir()` (L1 sparse) | **ЗАКРЫТО** (000085 D8) | main.js:563–565 (guard `rawE != null`); T5 save.test.js:837 |
| п.3 level/xp < 0 или не-числа; spells не массив; skills/skillXp не объекты → сброс + warn | **ЗАКРЫТО** (000085 D5, структурная) | efir.js:452–455/459/469/476–487; T3 (таблица «сломанные»), T6 (vm warn/дефолт/ре-сейв) |
| п.3 **id скила не в assets/skills** → сброс ЗАПИСИ + warn | **ПРОБЕЛ → 000115** | 000085 D5: «ИД-валидации НЕТ в 000085 — зона 000115» (efir.js:393–394); сейчас unknown-id ИНЕРТЕН |
| п.3 **id заклинания не в assets/spells** → сброс ЗАПИСИ + warn | **ПРОБЕЛ → 000115** | то же |
| (контракт из 000111 §9 / efir.js L335–336 / ТЗ 000117, не в ТЗ-листе) **reprocessEfirSkills при загрузке — ОБЯЗАТЕЛЬНО, из deserialize** | **ПРОБЕЛ → 000115** | efir.js:392 «DESERIALIZE НЕ зовёт reprocessEfirSkills — обязанность 000115» |
| п.4 точки сохранения — те же, НЕ переносить (цикл — 000087) | **ЗАКРЫТО, не трогать** | 000085 D10: saveNow main.js:432 + callers; 000087 — чужой регион |
| Тесты: «версия НЕ поднята» | **ЗАКРЫТО пином** + re-pin в блоке 000115 (ТЗ явно в списке) | save.test.js:256 (000072) |
| Тесты: «createEfir() — L1, xp 0, [spark, mend], skills/skillXp пусты» | **ЗАКРЫТО пином R2** (efir.test.js:186–234) — нового теста НЕТ | efir.test.js R2 |

**000115 ДОБАВЛЯЕТ ровно**: (1) id-валидация в `deserializeEfir` по каталогам-
параметрам (D2), (2) обязательный `reprocessEfirSkills` ВНУТРИ `deserializeEfir`
(D3), (3) level-guard 1e6 против зависания reprocess (D5), (4) тесты 000115
(D8), (5) техническая фиксация фикстур T3×4/T4×2 (D4). `serializeEfir`,
save.js, index.html, экспорты, точки сохранения — 0 изменений.

## Ключевые решения (D1–D9)

D1. **serializeEfir — 0 изменений.** Форма `{level, xp, skillXp, skills, spells}`
уже финальная (000085 D1); SPEC L845 совпадает. — Почему: ТЗ п.1 «расширяем»
оказалось уже расширено мержем 000085; переписывать работающий — нарушение
инварианта «не ломать существующее».

D2. **id-валидация — каталоги ПАРАМЕТРАМИ, полная форма assets, аддитивная
сигнатура `deserializeEfir(raw, skillCatalog, spellCatalog)`** (raw остаётся
1-м):
- любой unknown-id (ключ raw.skillXp / ключ raw.skills / элемент raw.spells,
  при переданном каталоге) → `null` на ВЕСЬ раздел (сброс ЗАПИСИ, ТЗ/SPEC
  «тихий сброс записи + warn», паттерн 000029); warn печатает СУЩЕСТВУЮЩИЙ
  main.js:570 («Сейв: раздел efir некорректен — сбрасываю.») — текст НЕ
  меняется (T6 пинит подстроку 'efir').
- `catalogIds(catalog)` — ВТРОРЕННИЙ хелпер efir.js: массив записей каталога
  (объекты со строковым `.id`) → `Set<string>`; null/undefined/не-массив/
  пустой/без валидных id → `null` = каталог недоступен → id-валидация ВЫКЛ
  (безопасное направление: unknown-id остаётся инертен, как в 000085; serde-
  функции тихие — warn печатает main.js).
- Каталог = ПОЛНЫЕ зеркала assets: skills = `PRIMARY_SKILLS` (массив, 6) +
  `Object.values(SECONDARY_SKILLS)` (ОБЪЕКТ-КАРТА, 31) = **37 id**;
  spells = `SPELLS` (массив, **16 id**). ⚠ SECONDARY_SKILLS — ОБЪЕКТ, не
  массив: `Array.concat(SECONDARY_SKILLS)` добавила бы объект как элемент
  (баг черновика a1-H3) — только `Object.values`.
- Функция остаётся ТИХОЙ (0 console), без require, без обращений к Game
  (пин R1 efir.test.js:179–183 «ровно 13 экспортов / ноль require(» —
  БЕЗ ПРАВОК: новых экспортов НЕТ, хелпер внутренний).
- Последствие (зафиксировано): forged id ВНЕ пула, но В каталоге (напр.
  `skills: {strength: 3}`; `spells: ['flame_burst']`) ПРОХОДИТ и персистит —
  ИНЕРТЕН (reprocess пишет только 4 id пула; пул-потребители читают только
  пул) и идентичен поведению master (master тоже принимает) — регрессии нет;
  строгая валидация «по пулу/книге» ТЗ НЕ предписана (ТЗ буквально
  «не в assets/skills», «не в assets/spells»).
— Почему: ТЗ-формулировка дословна (assets/skills, assets/spells); workflow-
указание «Каталог — параметр (catalog-first, UMD-чистота, 0 require/0 Game)»;
прецедент 000085 D3 `deserializeRoster(npcs, raw)` (каталог-параметр, тихая
функция, warn в main.js); raw первым — 1-арг. вызовы существующих тестов
(таблица «сломанные» T3, L772–792) остаются в структурном режиме и
продолжают проходить.

D3. **reprocessEfirSkills — ВНУТРИ deserializeEfir** (после валидации, до
return): `const state = {level, xp, skillXp, skills, spells};
reprocessEfirSkills(state); return state;`.
- Основание (канон, 5 закоммиченных мест): workflow-указание «внутри
  десериализатора»; efir.js:335–336 (docstring reprocess: «Точки вызова:
  levelUp (после while), deserialize (000115 — ОБЯЗАТЕЛЬНО), practiceEfir
  (000117)»); 000111 §9 «ПОСЛЕ deserialize — ОБЯЗАТЕЛЬНО
  reprocessEfirSkills(state)»; ТЗ 000117 «вызывается из deserialize 000115»;
  000085 D5 «НЕ вызывает reprocessEfirSkills — контракт 000115».
- Следствия (фиксируются тестами):
  * ВЫХОД deserializeEfir — ПЛОТНЫЙ: skillXp/skills = ВСЕ 4 id пула
    (материализация нулями — пин 000111 T7); level/xp/spells reprocess НЕ
    трогает («levelUp при restore» НЕ выдумывать — уровень из сейва as-is).
  * round-trip идентичен на КАНОНИЧЕСКОЙ (post-reprocess) форме —
    неподвижной точке (идемпотентность 000111 §4); на неканонической форме
    deserialize НОРМАЛИЗУЕТ (bank → уровни по requires-порядку, cap).
  * ветки БЕЗ раздела: rawE == null (стариый сейв) → deserialize НЕ вызывается
    → чистый sparse `createEfir()` (T5); `efir: 'junk'` → null ДО reprocess →
    sparse L1 (T6) — ОБЕ без изменений.
- main.js: 0 проводки reprocess (существующий `Object.assign(efir, e)`
  получает плотное состояние).
— Почему: альтернатива (reprocess в main.js после Object.assign) противоречит
закоммиченным контрактам-комментам (5 мест выше) и требует проводки в
hot-файле; канон однозначен.

D4. **Техническая фиксация существующих тестов T3×4 + T4×2** (В ГРИН-КОММИТЕ
вместе с src/efir.js — иначе набор красный):
- T3 (save.test.js:750–797), 4 ассерта-ожидания → post-reprocess форма:
  fresh round-trip → `{level:1, xp:0, skillXp:{4×0}, skills:{4×0},
  spells:[spark,mend]}`; afterBattle round-trip → `{level:2, xp:10,
  skillXp:{firelord:2.5, icelord:0, perception:0, precog:0},
  skills:{firelord:1, icelord:0, perception:0, precog:0}, spells:[spark,mend,
  light_heal]}` (НЕПОДВИЖНАЯ ТОЧКА: 2.5 < efirSkillXpForNext(1) = 30);
  3-полевая legacy → плотное 4×0; spells [] → плотное 4×0 + [spark,mend].
  Таблица «сломанные → null» (L772–792) + serializeEfir-ассерты (L793–796) —
  БЕЗ ПРАВОК (null возвращается ДО reprocess; serialize не меняется).
- T4 (save.test.js:799–835), seed + 2 ассерта → плотный `{level:5, xp:5,
  skillXp:{firelord:2.5, icelord:0, perception:0, precog:0},
  skills:{firelord:1, icelord:0, perception:0, precog:0}, spells:[spark,mend,
  light_heal]}` (L5: cap 10; 2.5 < 30; icelord — requires firelord ≥ 5 не
  выполнен → 0/0; порядок spells и дроби сохранены). companions/dead_mercs/
  version-ассерты — БЕЗ ПРАВОК.
- T5/T6 — БЕЗ ПРАВОК (reprocess не вызывается: null-ветки).
- Это ТЕХНИЧЕСКАЯ правка под новый путь (инвариант workflow допускает:
  «только технические под новый путь — если ТЗ не предписывает иное»): ТЗ/
  канон предписывает reprocess, который ИЗМЕНЯЕТ форму выхода deserialize;
  фикстуры 000085 (L751–752 «Фикс-точка под будущим reprocessEfirSkills
  (000115)») значениями это предвидели, заполнением 4 id — нет. СМЫСЛ пинов
  (round-trip / e2e / legacy-нормализация) НЕ меняется. ДОКУМЕНТИРОВАТЬ в
  result-отчёте.
— Почему: неизбежное следствие D3 (reprocess материализует ВСЕ 4 id пула —
пин 000111 T7); альтернатив, не ломающих контракт, нет.

D5. **Level-guard: `raw.level > 1e6 → null`** (сброс ЗАПИСИ + существующий
warn) — единственный пункт, ВЫХОДЯЩИЙ за исчерпывающий список невалидности
ТЗ; обоснован собственной клаузулой ТЗ п.3 «битый раздел не роняет игру»:
- НОВЫЙ путь после 000115: forged `level` ~1e15 (int ≥ 1 — проходит
  структурную валидацию) + forged bank ≥ 30 → while-цикл reprocess
  (efir.js:375) ограничен cap = 2·attr(level) ≈ level → ~1e15 итераций →
  ВКЛАДКА ЗАМЕРЗАЕТ. ДО 000115 путь из сейва НЕДОСТИЖИМ (reprocess — только
  levelUp/practice с runtime-данными); после 000115 — достижим файлом сейва.
- 1e6: реальный сейв недостижим (xp до L1e6 ≈ ∫50·L^1.5 ≈ 3.3e16, ~1e14
  боёв); reprocess ≤ ~4·1e6 итераций — миллисекунды.
- Прецедент: MAX_SAVED_DAY (main.js:443) — «верхняя граница … (защита от
  подделанного сейва) … граница — не от заморозки, от абсурда».
- 000085 D5 «без кэпа уровня» (forged L999 — последствия ограничены) НЕ
  нарушен: это save-integrity-граница, а не игровой кэп; L999 по-прежнему
  проходит.
- ПРЕСУЩЕСТВУЮЩИЙ (не 000115) case: forged xp 1e300 → зависание levelUp в
  ПЕРВОМ бою ПОСЛЕ restore — поведение master (000085 D5), НЕ чиним (скоуп).
— Почему: без guard ТЗ-контракт «не роняет игру» нарушается новым же путём;
guard — 1 строка + 1 константа.

D6. **main.js — 2 ханка (state zone + restore), каталоги — снапшот-константы,
видимая деградация:**
- State zone (после блока efir L217–223, ДО `const NPCS` L226 — размещение
  000085 D6, минимальный конфликт с 000087/000109/000126):
```js
const EFIR_SKILL_CATALOG =
  (G.SkillsData && Array.isArray(G.SkillsData.PRIMARY_SKILLS) &&
   G.SkillsData.SECONDARY_SKILLS &&
   typeof G.SkillsData.SECONDARY_SKILLS === 'object' &&
   !Array.isArray(G.SkillsData.SECONDARY_SKILLS))
    ? G.SkillsData.PRIMARY_SKILLS.concat(
        Object.values(G.SkillsData.SECONDARY_SKILLS))
    : null;
const EFIR_SPELL_CATALOG =
  (G.SpellsData && Array.isArray(G.SpellsData.SPELLS))
    ? G.SpellsData.SPELLS : null;
if ((!EFIR_SKILL_CATALOG || EFIR_SKILL_CATALOG.length === 0) ||
    !EFIR_SPELL_CATALOG || EFIR_SPELL_CATALOG.length === 0) {
  console.error('main.js: каталоги skills/spells недоступны (Game.' +
    'SkillsData/Game.SpellsData обязаны грузиться ДО src/main.js, ' +
    'задача 000115) — id-валидация сейва Эфира отключена');
}
```
- Restore (L566): `const e = G.efir.deserializeEfir(rawE,
  EFIR_SKILL_CATALOG, EFIR_SPELL_CATALOG);` + обновление коммента раздела
  (id-валидация + переучёт — 000115; канон 000111 §9). WARN-ТЕКСТ и
  `Object.assign(efir, e)` (live-ссылка, D8-000085) — БЕЗ ИЗМЕНЕНИЙ.
- null → `catalogIds(null)` → null → валидация off (безопасно: unknown-id
  инертен, 000085). console.error — видимая деградация (workflow-инвариант
  «отсутствие зависимости — console.error + деградация, игра не падает»);
  в полной цепочке index.html НЕ fires (skills-data.js:585 / spells-data.js:
  612 ДО main.js:690 — пин index-order) → vm-тесты `errors.length === 0`.
— Почему state zone (не lazy-хелпер): прецедент файла (NPCS L226, блоки
  roster/efir — guard на load + visible degradation); G = снапшот Game один
раз (000038, main.js:13) — каталоги гарантированы; lazy только усложнил бы
restore-секцию.

D7. **0 изменений: src/save.js** (механизм 000031 на месте: CURRENT_VERSION =
1 L41, MIGRATIONS = {} L54; пин :256), **index.html** (0 новых тегов/классов;
stale-коммент блока efir.js «{level, xp, skills} и пул» — НЕ трогаем:
index.html не в файлах ТЗ, workflow «save.js/index.html — 0»; документация
сейва закрывается шапкой efir.js + этим файлом), **serializeEfir** (efir.js:
413), **экспортный блок efir.js** (L491–504, R1 «ровно 13»), **точки
сохранения** (saveNow main.js:432 + callers — 000087), **det-механики**
(perlin/rng/combat).

D8. **Тесты: +7 новых (1443 → 1450), блок «Задача 000115» в конец
tests/save.test.js (N1, N2, N4, N3, V1, V2) + 1 в tests/efir.test.js:**
- **N1 (node) — id-валидация** (каталоги — `require('../src/skills-data.js')`
  `{PRIMARY_SKILLS, SECONDARY_SKILLS}` / `require('../src/spells-data.js')`
  `{SPELLS}` — зеркала assets, прецедент tests/spells.test.js:246):
  foreign skill id в skillXp → null; в skills → null; foreign spell id в
  spells → null; каталогически-валидные id (пул + из каталога) → состояние
  (post-reprocess плотное); каталоги null/undefined → структурный режим
  (nope ПРОХОДИТ — совместимость 000085, фиксирует 1-арг. вызовы);
  каталог-мусор (не-массив/записи без строкового id/пустой) → off БЕЗ
  исключений; тихая (quiet(): 0 console.warn).
- **N2 (node) — reprocess при load + round-trip**:
  `{level:1, xp:0, skillXp:{firelord:999}, skills:{}, spells:[spark,mend]}` +
  каталоги → deepEqual `{level:1, xp:0, skillXp:{firelord:684, icelord:0,
  perception:0, precog:0}, skills:{firelord:6, icelord:0, perception:0,
  precog:0}, spells:[spark,mend]}` (фикс-точка 000111 T5: 999 − (15+30+45+
  60+75+90) = 684, cap L1 = 6); round-trip `deserialize(serialize(x))` —
  идентично на КАНОНИЧЕСКОЙ фикстуре (дроби skillXp 2.5, порядок spells
  [spark,mend,light_heal] — ТЗ «включая дроби skillXp и порядок spells»);
  3-полевая legacy `{level:2, xp:5, skills:{}}` → плотная 4×0 + [spark,mend];
  идемпотентность (повторный deserialize того же raw → идентично).
- **N4 (node; правки по итогам ревью, e095054) — пин D5 level-guard**:
  level 2e6 + каталоги → null (сброс ЗАПИСИ, тихая — 0 warn); граница
  level = 1e6 → состояние (ВКЛЮЧИТЕЛЬНА, игровой кэп не введён; плотный
  4×0) + строка `['level > 1e6']` в таблице T3 «сломанные → null»
  (1-арг. вызов — guard срабатывает до каталогов).
- **N3 (node) — версия НЕ поднята** (re-pin 000072, ТЗ явно в списке):
  `S.CURRENT_VERSION === 1`, `Object.keys(S.MIGRATIONS) deepEqual []`.
- **V1 (vm, bootWithSave dataExtra) — e2e foreign id**: seed
  `{day:5, efir:{level:2, xp:0, skillXp:{}, skills:{nope:1},
  spells:['spark','nope']}}` → drain ×5 → `errors.length === 0`; warns
  содержит 'efir' (текст main.js:570); `host(state.efir)` deepEqual
  `{level:1, xp:0, skillXp:{}, skills:{}, spells:['spark','mend']}` (L1-
  дефолт — сброс ЗАПИСИ, НЕ частичная чистка, НЕ материализованный пул);
  beforeunload → `saved.version === 1` + `saved.data.efir` = тот же чистый
  дефолт (мусор не размножается, 000029).
- **V2 (vm, bootWithSave dataExtra) — e2e reprocess on load**: seed
  `{day:7, efir:{level:1, xp:0, skillXp:{firelord:999}, skills:{},
  spells:['spark','mend']}}` → drain ×5 → `errors.length === 0`;
  `host(state.efir)` deepEqual плотная форма N2 (cap 6 + overflow 684);
  beforeunload → `saved.version === 1` + `saved.data.efir` deepEqual той же
  (раздел переживает сейв БЕЗ ПОТЕРЬ, идемпотентно, 000111 §4).
- **tests/efir.test.js +1 тест**: «000115: deserializeEfir — id-валидация по
  каталогам-параметрам + ОБЯЗАТЕЛЬНЫЙ reprocess»: каталоги строятся тестом
  fs'ом из assets/skills/*.json + assets/spells/*.json (зеркало
  SKILL_FILES L124–128 + новый SPELL_FILES по образцу SPELL_IDS L114–119 —
  ЗАПИСИ каталога, не только id-набор); foreign id (skills/skillXp/spells) →
  null; валидные → 5 полей, skillXp/skills — ВСЕ 4 id пула; идемпотентно;
  тихая; Game НЕ нужен (serde чистый, каталог-параметр). R1/R2 — БЕЗ ПРАВОК.
- MAППИГ ТЗ-списка «Тесты» → существующие (аудит, новых тестов под эти
  пункты НЕТ): round-trip/legacy — 000085 T3 (node) + T4 (vm, D4-фиксация);
  «efir отсутствует → дефолт» — T5; «мусор (level −5, xp 'x', spells 'abc')
  → дефолт + warn» — T3 (null) + T6 (vm); «createEfir() — L1/0/[spark,mend]/
  пустые» — R2 efir.test.js:186.
- КРАСНАЯ фаза: N1/N2/V1/V2 — падают ОСМЫСЛЕННО (AssertionError «нет
  поведения»: функция есть, id-валидации/reprocess нет — не
  Syntax/ReferenceError); N3 (re-pin) — зелёная с самого начала; остальные
  1443 — зелёные (src в красной фазе не правится). ГРИН: T3/T4-фикстуры —
  в ТОМ ЖЕ коммите, что src/efir.js (иначе 6 ассертов красные = ошибка
  коммита, не флейк). Итог **1450/1450** (1449 + N4 — правки по итогам
  ревью).

D9. **Коммиты (ветка task/000115) + порядок мержа:**
1. `Задача 000115: красные тесты` — tests/save.test.js (блок «Задача 000115»:
   N1–N3, V1, V2), tests/efir.test.js (+1), memory/000115-efir-save-final.md
   (memory коммитится С тестами, прецедент 000085).
2. `Задача 000115: src/efir.js — deserializeEfir: id-валидация (каталоги-
   параметры) + обязательный reprocess + level-guard` + T3/T4-фикстуры
   (зеленеют N1/N2/V2/N3 + T3/T4).
3. `Задача 000115: src/main.js — каталоги id (state zone) + restore-секция
   efir (приводка id-валидации)` (зеленеет V1; весь набор 1449).
4. fixups после анализ-агентов (при необходимости).
Каждый коммит: первая строка «Задача 000115: …», последний параграф
`Co-Authored-By: Claude Code <noreply@anthropic.com>`.
CHANGELOG.md — НЕ ТРОГАТЬ (инструкция workflow).
Мерж: ПОСЛЕ 000085 (сделано), ДО 000087/000117; .merge-pending — только
стадия мержа. Ребейз на свежий master (000126 уже смёржен — main.js!) —
смысловой, см. «Подводные камни» #4–5.

## Контракты и границы (точные сигнатуры)

```js
// src/efir.js (ЧИСТЫЙ UMD, ноль require, ноль обращений к Game в serde)
catalogIds(catalog) → Set<string> | null        // ВНУТРЕННИЙ (не экспорт)
  // массив записей {id: string} → Set id; null/не-массив/пустой/
  // без валидных id → null (каталог недоступен — валидация off).
deserializeEfir(raw, skillCatalog, spellCatalog) → state(5 полей) | null
  // СЛОЙ 1 (структурный, 000085 D5 — БЕЗ ИЗМЕНЕНИЙ):
  //   raw == null / не plain-object / level не int ≥ 1 / xp не finite ≥ 0 /
  //   skillXp есть-но-не(plain-объект, все finite ≥ 0) / skills есть-но-не
  //   (plain-объект, все int ≥ 0) / spells не-массив-строк → null;
  //   skillXp нет → {}, skills нет → {}, spells нет/пусто → EFIR_SPELL_START.
  // СЛОЙ 2 (000115): level > 1e6 → null (guard reprocess-зависания, D5);
  //   каталог передан (catalogIds → Set): ЛЮБОЙ ключ skillXp/skills ∉
  //   skillCatalog-Set ИЛИ элемент spells ∉ spellCatalog-Set → null
  //   (сброс ЗАПИСИ; warn печатает main.js); каталог null/мусор → слой 2
  //   off (unknown-id инертен, как в 000085).
  // СЛОЙ 3 (000115): ОБЯЗАТЕЛЬНЫЙ reprocessEfirSkills(state) до return —
  //   bank-дроби → уровни в requires-порядку, cap, материализация ВСЕХ
  //   4 id пула (выход — ПЛОТНЫЙ); level/xp/spells НЕ трогает; идемпотентен.
  // Тихая (0 console). 1-арг. вызов deserializeEfir(raw) — структурный
  // режим (совместимость 000085).
// serializeEfir(state) — БЕЗ ИЗМЕНЕНИЙ (000085 D4): чистая копия 5 полей.

// src/main.js (G = снапшот globalThis.Game, L13)
const EFIR_SKILL_CATALOG = [entry…] | null   // 37 id: PRIMARY_SKILLS
                                             // (массив) + Object.values(
                                             // SECONDARY_SKILLS) (объект)
const EFIR_SPELL_CATALOG = [entry…] | null   // 16 id: SPELLS (массив)
// деградация (null/пусто — регрессия порядка) → ОДИН console.error на
// load (видимая; в полной цепочке не fires — index-order пин).
// restoreFromSave → раздел «Эфир»:
//   const e = G.efir.deserializeEfir(rawE, EFIR_SKILL_CATALOG,
//                                    EFIR_SPELL_CATALOG);
//   e → Object.assign(efir, e) (live-ссылка, 000085 D8) — БЕЗ ПРАВОК;
//   null → существующий warn «Сейв: раздел efir некорректен — сбрасываю.»
//   — БЕЗ ПРАВОК; reprocess — ВНУТРИ deserialize (D3), проводки НЕТ.
```

Границы (ЧТО НЕ ДЕЛАЕТ 000115):
- не бампит CURRENT_VERSION, не пишет MIGRATIONS (ТЗ п.2, 000031);
- не добавляет/переносит saveNow-точки (ТЗ п.4 — 000087);
- не правит serializeEfir / createEfir / reprocessEfirSkills / levelUp /
  efirAllyData / EFIR_SKILLS / EFIR_SPELL_UNLOCKS (тела — 000081/000111);
- не выводит spells из уровня (дефолт [spark, mend] — 000085 D5/000115-
  правило, сохраняется);
- не делает levelUp/level-«догонку» при restore (reprocess не пишет
  level/xp);
- не трогает combat.js/perlin.js/rng (детерминизм боя — инвариант);
- не трогает index.html / save.js / SPEC.md / CHANGELOG.md;
- не правит существующие тесты, кроме технической фиксации T3×4/T4×2 (D4).

## Ленивые ссылки и guards (UMD-инварианты 000038/000053)

- efir.js: НОЛЬ require( / НОЛЬ fs / НОЛЬ обращений к Game — СОХРАНЯЕТСЯ
  (каталог — ПАРАМЕТР, serde-функции чистые; lazyGame — только у
  xpForNext, как было). Пин R1 «ровно 13 экспортов + ноль require(» —
  без правок (новых экспортов НЕТ: catalogIds — внутренний).
- main.js: каталоги — снапшот-константы state zone из G (000038); G.SkillsData
  (index.html:585) / G.SpellsData (index.html:612) — ДО main.js:690 (пин
  index-order) → в полной цепочке деградация недостижима.
- Деградация: каталог null/пустой → id-валидация off (безопасно: unknown-id
  инертен, как в 000085; игра не падает) + ОДИН console.error (видимая,
  паттерн блока efir/roster 000085 D6).
- `host(undefined)` БРОСАЕТ (vm cross-realm, 000082): в V1/V2 — сначала
  `assert.ok` на существование, потом `host()` (паттерн T4).
- console.error НЕ входит в vm-тестовые errors при ПРАВИЛЬНОЙ цепочке —
  деградация не ломает `errors.length === 0`.

## Что важно будущим задачам (из ТЗ-ссылок)

- **000117 (практика; мержит ПОСЛЕ 000115)**: его `practiceEfir(efir,
  skillId, amount)` (прибавка в skillXp + reprocess) — точка вызова
  reprocess-при-load УЖЕ РАБОТАЕТ: load → deserializeEfir → reprocess
  (bank → уровни) → save идемпотентен. Сигнатура `deserializeEfir(raw,
  skillCatalog, spellCatalog)` — НЕ ломать (каталоги — опциональные,
  1-арг. вызовы легальны = структурный режим). skillXp-дроби — serde
  переносит БЕЗ floor (000085 D3/D4) — round-trip 000117 без потерь.
- **000087 (цикл; мержит ПОСЛЕ 000115)**: ПОСЛЕ 000115 state.efir после
  ЛЮБОЙ успешной загрузки сейва — ПЛОТНЫЙ (4 id пула в skillXp/skills);
  без загрузки (fresh-сессия, old save без раздела efir) — SPARSE
  (createEfir()). Потребители, читающие `state.efir.skills[id]`, —
  `skills[id] || 0`.
- **000112 (buildEfirUnit)**: 000085-память «пока 000115 не смёржен, в
  state могут жить forged unknown-id — потребители обязаны GUARD'ИТЬ» —
  ПОСЛЕ 000115 forged id ВНЕ каталога НЕ ОСТАЮТСЯ (id-валидация);
  НЕ-ПУЛОВЫЕ каталожные id (D2-последствие) остаются — GUARD по-прежнему
  обязателен (чтение `state.skills[poolId]` по 4 id пула).
- **000116 (UI «Эфир»)**: после загрузки — читать материализованный пул;
  fresh-сессия — sparse (guard `|| 0`).
- **Форма сейва data.efir — 5 полей, version 1, MIGRATIONS {}** —
  зафиксировано пином save.test.js:256 (000072) + N3 (000115 re-pin).

## Подводные камни

1. **Материализация пула (главная причина D3/D4)**: reprocess ВСЕГДА пишет
   ВСЕ 4 id пула в skills/skillXp (efir.js:353–384, пин 000111 T7) → выход
   deserializeEfir ПЛОТНЫЙ; T5/T6 (null-ветки) — SPARSE. Не путать формы.
2. **SECONDARY_SKILLS — ОБЪЕКТ-КАРТА** (src/skills-data.js:81), не массив:
   только `Object.values()`; `.concat(SECONDARY_SKILLS)` добавляет объект как
   элемент (баг черновика a1-H3 — проверено).
3. **Pустой Set опасен**: передавать ПУСТОЙ каталог = отбросить ВСЕ id =
   сброс всех сейвов → main.js возвращает null (не пустой) + console.error.
4. **efir.js — трёхсторонний union при ребейзе** (000085+000112+000115,
   000085 «Подводные камни» #6): наши ханки — ТЕЛО deserializeEfir
   (L450–489) + комментарии L388–395 + docstring; хвост фабрики/return/
   экспорты НЕ ТРОГАЕМСЯ → вероятность текстового конфликта СРЕДНЯЯ;
   ребейз — по смыслу + полный npm test.
5. **main.js — горячий файл** (000087: onDay ~671/onEnd ~1032/1162; 000109:
   хвост collectSaveData/restore; 000126: craft UI — УЖЕ в master 1499092!):
   наши ханки — state zone ~L217–226 и restore-efir ~L554–575 (СЕРЕДИНА,
   000085 D8) — МИНИМАЛЬНО пересекаются; ребейз по смыслу (ориентир — по
   содержимому секций «Эфир (efir)», не по строкам) + полный npm test.
6. **ТЗ 000115 УСТАРЕЛО** (baseline f9e9b6a, «поле efir ЕЩЁ НЕТ»): читать
   через 000085/000111-канон; его «расширяем serialize/deserialize» =
   расширение НА МЕСТЕ (сигнатура аддитивна, новых функций/экспортов НЕТ).
7. **stale-коммент index.html:601** «{level, xp, skills} и пул» — 000111-
   память «документация сейва — 000115», НО index.html не в файлах ТЗ и
   workflow «index.html — 0» → НЕ трогаем (решение D7; документация —
   шапка efir.js + этот файл).
8. **Формы round-trip**: идентичность гарантируется ТОЛЬКО на post-reprocess
   (неподвижной) форме; тесты round-trip — на канонических фикстурах (N2/T3/
   T4/V2). ТЗ «round-trip идентично» — по смыслу на каноне.
9. **Forged-зависание**: level > 1e6 → null (D5 guard) — НОВЫЙ путь
   (reprocess в deserialize); PRESуществующий forged xp 1e300 → levelUp-hang
   в первом бою — НЕ 000115 (000085 D5), НЕ чиним.
10. **Флейк чужого теста** → перепуск `node --test tests/<файл>` + запись в
    result (стандарт, 000085 #11).
11. **VM cross-realm**: deepStrictEqual только через `host()`; ошибки из vm —
    через `__game.state`.

## Сверка 000085 с ТЗ 000115 (что закрыл 000085, что добавил 000115)

**Закрыл 000085 (смержен, 0ef1751) — 000115 не делает:**
- финальная 5-полевая форма + serializeEfir (D1/D4) — ТЗ п.1;
- 3-полевая legacy → нормализация (D5: skillXp→{}, skills→{}, spells
  нет/пусто→[spark,mend]) — ТЗ п.2;
- efir отсутствует → createEfir() L1 sparse, warn НЕТ (D8) — ТЗ п.2;
- структурный мусор (level/xp<0/не-числа, spells не массив, skills/skillXp
  не объекты) → null + warn + чистый L1-дефолт (D5/D8) — ТЗ п.3 (часть);
- version 1, MIGRATIONS {} (пин 000072) — ТЗ п.2 + Тесты;
- HP/MP не в сейве (структурно) — ТЗ п.1;
- точки сохранения — те же (D10) — ТЗ п.4.

**Добавил 000115 (этот контракт):**
- id-валидация: skill id ∉ assets/skills (37), spell id ∉ assets/spells (16)
  → null на весь раздел → существующий warn + L1-дефолт — ТЗ п.3 (пробел);
- ОБЯЗАТЕЛЬНЫЙ reprocessEfirSkills ВНУТРИ deserializeEfir (000111 §9,
  efir.js L335–336, ТЗ 000117) — пробел (контракт, не в ТЗ-листе);
- level-guard 1e6 (D5) — клаузула ТЗ п.3 «не роняет игру» на новом пути;
- тесты 000115 (N1–N3, V1–V2 + efir.test.js +1 = 6; 1443 → 1449);
- техническая фиксация T3×4/T4×2 (D4) — следствие reprocess;
- память (этот файл) + отчёт tasks/result/000115.md.

## Итоговый план реализации (по файлам, ожидаемая дельта)

| Файл | Коммит | Дельта | Содержание |
|---|---|---|---|
| tests/save.test.js | 1 (red) | ~+120 | блок «Задача 000115»: N1, N2, N3, V1, V2 (хвост файла; хелперы quiet/host/bootWithSave/E — существующие; каталоги — require skills-data/spells-data) |
| tests/efir.test.js | 1 (red) | ~+70 | +1 тест 000115 (fs-каталоги assets: SKILL_FILES + новый SPELL_FILES-каталог записей) |
| memory/000115-efir-save-final.md | 1 (red) | новый (~230) | этот файл |
| src/efir.js | 2 (green) | ~+40/−8 | deserializeEfir: +параметры skillCatalog/spellCatalog, +catalogIds-хелпер (внутренний, ~10 строк), +3 id-проверки, +level-guard (константа 1e6), +reprocessEfirSkills(state) до return, +docstring; коммент блока L388–395 («НЕ зовёт… обязанность 000115» → закрыто). Шапка L23–28 — без правок (уже точна). Хвост/экспорты — 0 |
| tests/save.test.js | 2 (green) | ~+10/−10 | T3: 4 ассерта → post-reprocess форма; T4: seed + 2 ассерта → плотная фикс-точка L5 (D4) |
| src/main.js | 3 (green) | ~+25/−2 | state zone: EFIR_SKILL_CATALOG/EFIR_SPELL_CATALOG + console.error-деградация (~20 строк с комментом); restore L566: +2 аргумента + коммент раздела |
| src/save.js / index.html / CHANGELOG.md | — | 0 | D7 |

Итого ≈ +500 строк, 6 файлов (4 с правками + memory + 0-дельты).
Тесты: 1443 → 1449 (красная: 4 осмысленно красных + 1 pin-зелёный + 1443;
зелёная: 1449/1449; ИТОГ с учётом N4 из ревью — 1450/1450, см.
«Финализация»).

## Финализация (2026-10-03)

- Фактические коммиты ветки task/000115 (база 0ef1751 = мерж 000085):
  1078973 (красные тесты + этот файл), 54525e4 (src/efir.js + src/main.js
  + T3/T4-фикстуры — оба src-файла одним коммитом, D9-план свёрнут с 3
  до 2), e095054 (правки по итогам ревью: N4 + строка T3; src/ не тронут).
- Ревью-раунд: findings 1–2 (минор) — РЕАЛЕН: D5 level-guard не был
  закреплён тестом (нарушен инвариант «изменение кода сопровождается
  тестом») → N4 + строка T3 (e095054); findings 3–4 (минор) — процесс
  стадии мержа (append-конфликт save.test.js / сдвиг строк hot-файла
  main.js) — НЕ кодовая правка, закрываются ребейзом + полным npm test
  («Подводные камни» #4–5).
- npm test на финализации: **1450/1450** (база 1443 + 7 новых: N1, N2,
  N4, N3, V1, V2 + efir.test.js +1). Фактические дельты: src/efir.js
  +89/−15, src/main.js +35/−3, tests/save.test.js +262/−12,
  tests/efir.test.js +75/−0, memory +444.
- Отчёт: tasks/result/000115.md; задача перенесена pending → done.
- Ребейз на актуальный master — НА СТАДИИ МЕРЖА (на финализации master
  = 9bd10c9, мерж 000092; сдвиг от базы 0ef1751: 2-й раунд 000085,
  000086, 000091, 000092, 000095, 000109, 000126, новая задача 000131).
  Ожидаемый текстовый конфликт — ТОЛЬКО append в EOF tests/save.test.js
  (000109 добавил 163 строки в том же хвосте; наш блок 227 строк) —
  резолв: сохранить ОБА блока. src/efir.js и tests/efir.test.js на
  master с базы НЕ МЕНЯЛИСЬ → чистый ребейз; ханки main.js (221–226,
  551–570) не пересекаются с ханками master (59/239/323/426/809/951/…)
  → ожидается чисто, но main.js — hot-файл: сверить по смыслу + полный
  npm test (см. «Подводные камни» #4–5).

# 000144 — Эфир на едином листе персонажа (контракт)

Задача 000144 (P1, волна B, родитель 000139). База: master c627b38 (000140 смержен,
Game.Sheet в src/sheet.js). Изменён один src-файл: **src/efir.js**.
Контракт листа: memory/000140-sheet-model.md (S-1..S-5). Правила сейвов: 000031/000029.

## Что добавлено / перенесено

- **Состояние Эфира = Game.Sheet (kind 'efir')** — 10 полей:
  `{kind, level, xp, totalXp, points, primary, secondary, skillXp, skills, spells}`.
  Больше 5-полевого лейаута нет. `npcId` не существует (у листа efir нет иди —
  `delete s.npcId` после createSheet; иначе Object.keys/deepEqual-пины видят 11 ключей).
- **Перенесено в src/sheet.js (через API, не копией кода):** порог xp (xpForNext —
  тот же, что у героя), начисление XP (addXp), рост levels, points 2/уровень
  (live SETTINGS, по TЗ), рост характеристик (raiseSkill: primary +1), каскад
  навыка (reprocessSkillXp), requires-гейты при трате очков (canRaise).
- **Осталось в src/efir.js (фирменное, НЕ унифицировано):**
  - `EFIR_SKILLS` (4 пула) — теперь **НАЧАЛЬНЫЙ СПИСОК** листа; полное дерево 31
    навыка (assets/skills) доступно очками (TЗ).
  - `reprocessEfirSkills` — собственный движок практики (bank-overflow, requires-гейт
    со «стэем» уровня), читает уровни из `secondary`, пишет `secondary` + зеркало
    `skills` для 4 id.
  - `EFIR_SPELL_UNLOCKS` (8 заклинаний, уровни 5/8/10/12/15/20/25/30) — авто-разблокировки.
  - `BREATH_INFO` — «Вдох Эфира» (combat-действие).
  - `efirStats(level)` — **замороженная legacy-таблица** (см. раздел про derived-модификатор).
- **Удалено:** локальный `xpForNext`-блок и `xpWarned` (src/efir.js L100-117) —
  порог теперь из sheet.js (тот же).
- **Не тронуты:** src/companions.js, src/player.js, src/ui-tab-efir.js (000146),
  src/main.js (000143), src/combat.js, src/ui.js, index.html (sheet.js L766 уже
  до efir.js L778), assets. В efir.js 0 новых `require(`, 0 новых экспортов
  (18 — пин R1 tests/efir.test.js).

## Контракты и границы

### createEfir()
- `Game.Sheet.createSheet('efir', {primary, spells: EFIR_SPELL_START.slice()})` +
  `s.secondary`/`s.skills` = начальный список + `delete s.npcId`.
- **Старт:** `primary = {strength:1, dexterity:1, constitution:3, intelligence:3,
  wisdom:3, charisma:1}` (решение аудита; SPEC «Дух Эфира» задавал только тройку 3 —
  зафиксировано правкой SPEC L795-801). Эквивалентно старой формуле a=3 при lv1.
- **Начальный список (решение Q-1):** `secondary = skills = {firelord:1, icelord:0,
  perception:1, precog:0}`. Почему не все 4 по 1: инвариант единого дерева —
  requires (icelord требует firelord 5, precog — perception 5) должны выполняться
  в любой достижимой конфигурации; «icelord@1 + firelord@1» недостижимо легальным
  ростом. Плюс: стартовые уровни 0 дают идентичность гейта «stay» и «zero»
  (T6/PR-3 не ломаются), подарки 15 XP каждый учтены в арithметике reprocess.
- Возврат: sheet (10 полей). R2 tests/efir.test.js пере-пин на 10 ключей
  (комментарий «000139, осознанный перепин»).

### addEfirXp(state, amount) — сигнатура БЕЗ ИЗМЕНЕНИЙ (обёртка)
- Guards: state не object → 0; amount не number/finite/≤0 → 0 (без мутаций).
- Happy path: `Game.Sheet.addXp(state, amount)` (гained = round(amount·xpMult);
  xpMult = 1+pct('scholar') — у Эфира scholar отсутствует до 000147, эффект 0) →
  append авто-разблокировок (`efirSpellsByLevel(level)`, append-only, без дублей) →
  `reprocessEfirSkills(state)` (идемпотентен; инвариант «после addEfirXp пул
  пересчитан»). Возврат: levelsGained.
- **Вызов не меняется:** src/combat-ui.js L988-990 (100% боевого XP) — точка ТЗ.

### levelUp(state) — обёртка
- `Game.Sheet.addXp(state, 0)` (обрабатывает накопленный xp, семантика `>=` та же) →
  append заклинаний → reprocess → levelsGained. Guards: не object / нет Sheet → 0.

### efirDerived — ВНУТРЕННИЙ (не экспорт)
- `efirDerived(base, sheet)` → **ПОЛНЫЙ объект** (S-4):
  `Object.assign({}, base, {intelligence, wisdom, constitution (из sheet.primary),
  maxHP: 10 + 2·Con, maxMP: 5 + Int + Wis})`.
- Единственная точка вызова ctx: `buildEfirUnit`. Формулы баланса SPEC L801-812
  сохранены; БАЗА — характеристики sheet (решение ТЗ: «efirStats —
  derived-модификатор kind 'efir', БАЗА — характеристики sheet»).
- Контракт «полный объект» проверен косвенно: ES-2 (addXp: xpMult читает
  base-ключи) + ES-4 (buildEfirUnit числа); общий механизм запинен в sheet.test.js SH-5.

### reprocessEfirSkills(state)
- Источники: уровни — `state.secondary` (source of truth); bank — `state.skillXp`;
  cap — `state.primary[def.primary] × 2` (через efirAttrs — см. guards).
- **Зеркало `skills`:** отдельный объект (НЕ live-алиас secondary) — reprocess
  пишет `secondary[id]` И `skills[id]` для всех 4 id пула (dense-материализация).
  Почему: (1) live-алиас ломает T7-block2 (перезапись алиаса) и сценарий 000145 —
  просроченное зеркало могло бы затереть уровни, потраченные очками (raiseSkill
  пишет только secondary); (2) зеркало читает src/ui-tab-efir.js (e.skills[d.id]) —
  вкладка остаётся зелёной до 000146.
- **Гейт «stay»:** requires не выполнены → уровень НЕ нулится, bank не тронут
  (фирменное 000111); при старте 0 идентичен старому «zero».
- bank-overflow сохраняется (practice +0.5 → reprocess → +1.5 и т.д.).
- Нормализация: skillXp/secondary/skills — Object.assign({}, x) при !isPlainObject.
- Детерминизм: 0 RNG, порядок EFIR_SKILLS (requires-first) — пин T7-block3.

### efirSkillCap(state, id)
- `efirAttrs(state)[def.primary] × 2`. state не object → legacy-таблица L1 → 6
  (пин `efirSkillCap(null,'firelord')===6` — зелёный без правок).

### efirAllyData(state)
- attrs из `efirAttrs(state)` (primary, fallback — efirStats(level)); остальное
  (makeAlly-формулы 0.7/1.2/0.5) — без изменений.

### buildEfirUnit(efir, c)
- `stats = Game.Sheet.derived(efir, {modifier: efirDerived})` (если Sheet и
  efir.primary — plain object; derived может вернуть null — каталог) →
  fallback `efirStats(u.level)` (старое поведение для деградации/голых объектов).
- `u.maxHP/hp = stats.maxHP; u.mp = stats.maxMP` (L1: 16/11 — цифры баланса
  не меняются).
- `u.damage = max(1, round((2 + 0.5·stats.wisdom)·moraleMult))`.
- `u.efirSkills` (снапшот на бой) — из `efir.secondary[id] ?? efir.skills[id]`
  для 4 id пула. `u.breath` — снапшот: heal `round(10 + 0.8·stats.wisdom)`,
  mpCost 20. `c.efir` — снапшот; `c.efirState` — живая ссылка.
- 0 новых точек RNG (R-9): весь бой детерминирован, как и до.

### serializeEfir(state)
- Возврат: sheet-лейаут **ровно 10 ключей** (копии primary/secondary/skillXp/skills,
  slice spells) — НИКАКОГО npcId (000118 пере-пин).
- `null` при: state не plain object, либо нет plain `primary` (счёт не-листа —
  новый формат невалиден, старый формат сериализовать невозможно — после 000144
  runtime-эфир ВСЕГДА лист; backfill-пути в serialize нет — решение D-F).
- Чистая функция: 0 Game.

### deserializeEfir(raw, skillCatalog, spellCatalog)
- Чистая функция (0 Game — R-10; в node-тестах Game может отсутствовать, поэтому
  литерал строится руками, не через createSheet).
- **Новый формат** (raw.primary — plain object):
  - kind === 'efir' (иначе null); level int 1..1e6; xp finite ≥ 0;
    totalXp: undefined→0, иначе finite ≥ 0; points: undefined→0, иначе int ≥ 0;
    **primary: каждое из 6 значений — int в [1, EFIR_SAVE_MAX_LEVEL=1e6],
    отсутствующий ключ → 1, мусор → null** (решение Q-3/R-11: подделанный
    primary 1e15 → cap 2e15 → while-зависание reprocess);
    secondary/skillXp: undefined→{}, иначе int ≥ 0, id ∈ skillCatalog (если задан);
    skills: то же; spells: как сейчас (id ∈ spellCatalog).
- **Старый формат (5 полей) → backfill** (решение D-H):
  - `{level, xp, totalXp:0, points:0, primary: СТАРТ (3/3/3/1/1/1),
    secondary: skills(старый кэш — КАК ЕСТЬ), skillXp, skills: та же копия,
    spells}` + reprocess.
  - Почему кэш как есть (вариант (a), не «пересчитать с нуля»): НЕЛОМАЮЩИЙ
    (000031) — цифры 000115 должны выжить (684 и т.д.); ТЗ: «level/xp/skillXp
    переносятся». totalXp/points = 0 — истории нет (ТЗ-аналог).
- INVALID (любой формат) → null + caller warn → свежий createEfir (000029).

## Ленивые ссылки и guards (UMD 000038/000053)

- `require(` в efir.js — **ноль** (пин R1 regex). `Game.Sheet` читается через
  существующий `lazyGame()` (globalThis.Game в момент вызова) — НЕ в момент
  загрузки (R-2).
- **Деградация (Sheet недоступен в момент вызова):**
  - `createEfir` → **тихий** fallback-литерал того же 10-полевого лейаута
    (решение D-E: конструктор не логирует — иначе одноразовый флаг degrades
    сгорает до R6-пина; деградация видна по сообщению в addEfirXp при первом
    боевом вызове; в проде недостижимо — index.html: sheet.js до efir.js).
  - `addEfirXp` → console.error ОДИН РАЗ (модульный let, новое — старый
    xpWarned удалён): xp накапливается (`state.xp += amount`), уровень не растёт,
    возврат 0 — **пин R6 tests/efir.test.js зелёный без правок** (сообщение
    не запинено по тексту).
  - `levelUp` → 0 (xp не трогаем — как старое поведение без xpForNext).
  - `buildEfirUnit` → fallback efirStats(u.level) (старые числа).
- Тотальность: ВСЕ экспортируемые функции безопасны для «голых» 5-полевых
  объектов и null (efirAttrs fallback в reprocess/efirSkillCap/efirAllyData;
  addEfirXp/levelUp: нет plain primary → деградационный путь, без исключений —
  derived в sheet.js падает на sheet без primary, обёртка не должна его допускать).
- Node-ветка UMD: `require` src/sheet.js из тестов легален (тест-файлы не
  UMD-модули; R1 regex касается только src/efir.js).

## Старт efir-sheet (характеристики)

| ability | start | source |
|---|---|---|
| intelligence | 3 | ТЗ/аудит |
| wisdom | 3 | ТЗ/аудит |
| constitution | 3 | ТЗ/аудит |
| strength | 1 | решение аудита (SPEC не задаёт) |
| dexterity | 1 | решение аудитa |
| charisma | 1 | решение аудита |

Баланс L1 идентичен legacy-таблице: maxHP = 10+2·3 = 16, maxMP = 5+3+3 = 11.
Рост — очками (2/уровень): raiseSkill primary → maxHP/maxMP пересчитываются
derived-модификатором в buildEfirUnit (level больше не влияет на атрибуты —
вот и есть «этим и отличается» от героя: у героя тоже points, но стартовый
расклад иной).

## Как efirStats стал derived-модификатором

- `efirStats(level)` **НЕ удалён** — замороженная legacy-таблица (a=3+floor((lv−1)/2),
  maxHP 10+2a, maxMP 5+2a). Потребители (все зелёные без правок):
  - src/ui.js L1036-1041 (efirData в списке спутников) и L1121 (строка «всегда со мной»
    в G.squadUI) — frozen legacy до 000145/000146;
  - src/ui-tab-efir.js L313 («макс. HP/мани» — read-only вкладка, 000146 уберёт);
  - tests/efir.test.js T1 (табличная часть — пин legacy);
  - squad-panel-пины (efirStats(1).maxHP=16).
- Боевой путь (buildEfirUnit) legacy-таблицу НЕ читает (кроме деградации):
  `stats = Sheet.derived(efir, {modifier: efirDerived})`. Формулы SPEC L801-812
  перенесены в efirDerived; вход — sheet.primary.
- Переходы: 000145 (унификация UI прокачки) и 000146 (убрать вкладку) —
  снимают потребителей legacy-таблицы; тогда efirStats удаляется.

## Backfill: 5 полей → sheet

Старый лейаут `{level, xp, skillXp, skills, spells}` (000115):
- `level, xp, skillXp, spells` — переносятся 1:1;
- `primary` — старт-формула (3/3/3/1/1/1);
- `secondary` — старый кэш `skills` КАЗ ЕСТЬ (затем reprocess: гейты, cap по
  старту primary = 6);
- `skills` — зеркало (та же копия, reprocess материализует dense 4 id);
- `totalXp = 0`, `points = 0`, `kind = 'efir'`.
- Цифры 000115 сохраняются: 999 bank firelord → 6/684 (не 699 — старт 0,
  кэш перенесён) — пин V2 save.test.js зелёный без арифметических правок
  (меняется только форма ключей).
- SECTION 'efir' в сейве не переименован; CURRENT_VERSION = 1 (без бампа, 000031).
- Пин-тесты: unit — tests/efir-sheet.test.js ES-6 (фиксированный JSON старого
  формата) + e2e — save.test.js ES-7 (vm-dyn: seed старого формата → boot →
  sheet-лейаут в сейве, version 1) + 000085 T4 (seed → backfill-лейаут).

## Что сохранено (фирменное)

1. **Вдох Эфира** — combat-действие без изменений: BREATH_INFO (heal
   round(10+0.8·Wis) — теперь от primary.wisdom, L1 идентичен: 12 —
   round(10+0.8·3) = round(12.4)), 20 mp, один раз за бой. Точка в
   buildEfirUnit — снапшот u.breath.
2. **Авто-разблокировки** — EFIR_SPELL_UNLOCKS (8 заклинаний, 5/8/10/12/15/20/25/30)
   накладываются на sheet.spells (append-only, канонический порядок, без дублей).
   Единое изучение 000147 добавит ИСТОЧНИКИ, не отменяя (записано в ТЗ).
3. **100% боевого XP** — combat-ui.js L988-990 не тронут (обёртка addEfirXp).
4. **Практика** — practiceEfir без изменений (XP практики в skillXp, reprocess).
5. **Детерминизм** — 0 новых точек RNG; c.efs (spellInt/spellWis от attrs),
   c.efirState (живая ссылка) — как было.

## Что важно будущим задачам

- **000145 (унификация UI прокачки):** UI читает state.secondary (истина) для
  уровней ВСЕХ навыков, state.points, Sheet.canRaise (requires-гейты работают —
  icelord откроеется при firelord 5). efirStats-потребители (ui.js L1036-1041,
  L1121; ui-tab-efir.js L313) — кандидаты на вынос на derived (modifier уже есть).
  **Известная асимметрия (на ревью 000145/000147):** requires-гейт блокирует рост
  через ПРАКТИКУ (фирменный 000111, сохранён) но НЕ блокирует каскад траты очков
  (Sheet.reprocessSkillXp — без гейта, как у героя) — наследие единой модели;
  осознано принято.
- **000146 (убрать вкладку «Эфир»):** src/ui-tab-efir.js + index.html L826;
  после удаления — зеркало `skills` можно убрать (тогда serialize → 9 ключей —
  перепин 000118); efirStats удаляется после 000145.
- **000147 (единое изучение):** ИСТОЧНИКИ заклинаний — sheet.spells уже единый
  контейнер (auto-unlocks + будущие learned); addEfirXp теперь применяет
  derived.xpMult — если Эфир получит scholar, бонус XP включится автоматически
  (эффект 0 до тех пор; осознано по ТЗ «различия — только стартовый список и
  фирменные бонусы»).
- **000143 (волна B, main.js):** main.js намеренно НЕ тронут —
  `Object.assign(efir, e)` (restore L846-860) работает с plain-sheet напрямую
  (все 10 ключей перекопируются). Старый комментарий «5 полей» (L239-240) —
  косметика, 000143 переписывает блок при мерже (конфликта нет: регионы разные).
- **Сейв:** формат — 10 ключей; backfill — навсегда (000029); перепины
  save.test.js (000085 T4/T5/T6, 000115 N2/N4/V1/V2, 000118 L1362-1364) —
  осознанные (C3), комментарий «000139» в том же коммите.

## Подводные камни

1. **npcId:** createSheet('efir') кладёт `npcId: undefined` — БЕЗ `delete`
   Object.keys покажет 11 ключей (пин 000118 сломан). createEfir всегда удаляет.
2. **secondary vs skills:** secondary — истина; skills — зеркало (4 id пула).
   raiseSkill пишет ТОЛЬКО secondary (как у героя) — зеркало синхронизируется
   в следующем reprocess (idempotent после addEfirXp/levelUp/practice). Код,
   пишущий в skills напрямую — ошибка.
3. **Гейт «stay» ≠ «zero»:** только при старте 0 они идентичны. НОЛЬСКИЙ уровень
   с bank > 0 (напр., precog@0 bank 5) при выполнении requires поднимется —
   это корректное 000111-поведение, не баг.
4. **Тотальность обёрток:** addEfirXp/levelUp НЕ вызывают Sheet.addXp, если
   `!isPlainObject(state.primary)` (derived в sheet.js упадёт на undefined
   primary) → деградационный путь. Голий 5-полевой объект (ручной в тестах) —
   легальный вход, не crash.
5. **Р6-порядок флага деградации:** createEfir — ТИХИЙ fallback (не console.error)
   — одноразовый флаг должен сгореть в addEfirXp (пин R6: errors.length > 0
   с записью ДО создания state). Не «починять» createEfir на логирование.
6. **Числа репинов (все с комментариями «000139»):**
   - firelord/perception из 1 (подарок) — bank −15 vs старый старт 0:
     T6 225→5/**15**; T8 999→6/**699**; PR-2 firelord/perception **699**,
     icelord/precog **684** (без изменений); PR-3 bank **15**; PR-4 150.5→4/**15.5**;
     PR-5(d) bank 2→**17** (state0-control: нулевая perception в фикстуре —
     иначе гейт precog зависит от старого кэша).
   - level больше не растит атрибуты: T1 L441 attrs {5,5,5}→{3,3,3};
     T9 (L20: 38 очков, wis+9→12, u.attrs {3,12,3}, +35 сохраняется),
     EF-2 (L15: 28 очков, 10/10/10 — 21 потрачено), BR-1c (L15: wis+7→10, heal 18),
     PR-5(c) (wis+1→4, cap 8) — очки тратятся в тестах через
     `Game.Sheet.raiseSkill` (helper gameWithXp: +1 строка `Sheet: require('../src/sheet.js')`).
   - cap = primary×2, НЕ attr(level)×2: T5 capAt → 6 (не 8/10); 999→6/699.
   - Старые цифры 000115/000085 (684 и т.д.) — НЕ меняются (кэш переносится).
7. **000133 (in progress, append +84 строки в КОНЕЦ save.test.js):** регион
   репинов не пересекается (пины 000115 до L1365, свитк 000133 — конец файла);
   при ребейзе после мержа 000133 сверить актуальные номера строк.
8. **SPEC.md:** правки ТОЛЬКО L795-801 (механика/очки/старт), L804-812 (таблица
   характеристик — primary), L836-841 (пул → начальный список + дерево 31),
   L854-861 (сейв — sheet-лейаут + backfill). НЕ трогать L734-748 (Спутники —
   000143) и L842-852 (Вдох Эфира).
9. **Не новые файлы/ассеты/теги:** src/efir.js — единственный src;
   tests/efir-sheet.test.js — новый (node, loadEfir-паттерн); index.html — нет.
10. **Читабельность сейва:** ключи serializeEfir в порядке
    kind, level, xp, totalXp, points, primary, secondary, skillXp, skills, spells
    (пины сортируют ключи — порядок не критичен, но держать единым).
11. **tests/combat.test.js — ЛОВУШКА levelUp-цикла (найдена в зелёной
    фазе, полный npm test):** helper `raiseEfir112` (L~3275) крутит
    `while (state.level < L) { state.xp = PL.xpForNext(...); E.levelUp(state); }`
    под фейком БЕЗ Game.Sheet → новый levelUp → 0 → БЕСКОНЕЧНЫЙ ЦИКЛ
    (test-файл висит на 100% CPU; на мастере 0.7s, с 000144 — висло).
    Ре-пин: фейк + `Sheet: require('../src/sheet.js')` (helper
    raiseEfir112). Атрибутные пины уровня > 1 (статы из листа, уровень
    не растит) — очки в mk()/t3 через `Sheet.raiseSkill` ДОБЫТЬ ВРУЧНУЮ:
    CB-1(c) L12: +5×3 (8/8/8), CB-3 L15: +7×3 (10/10/10), PC-1 L5:
    +2 Int (5), PC-2 L3: +1×3 (4/4/4, cap precog 4×2 = 8). 000119
    BAL-1/2/3 — БЕЗ ПРАВКИ (полосы ±40%; начальный список
    firelord/perception 1 укладывается в полосы).

## Правки по итогам ревью (2026-10-06)

1. **u.breath: мёртвое поле `used: false` УДАЛЕНО** (buildEfirUnit).
   Потребителя не было (src/ и tests/): one-shot-триггер «Вдоха Эфира»
   — канонический флаг `c.efirBreathed` (combat.js, не тронут); ТЗ —
   «Вдох Эфира без изменений» (и по составу снапшота). Поле не
   персистится (боевой снапшот), поведения не меняло.
2. **addEfirXp: appendSpells — БЕУСЛОВНО** (было `if (n > 0)`).
   master 000111: levelUp дополнял книгу до таблицы уровня на КАЖДОМ
   addEfirXp (даже n = 0) — self-restore книги 3-полевого legacy-
   сейва (лейаут пина 000085, без поля spells) при первом боевом XP.
   «if (n > 0)» — регрессия: Эфир бьёлся со стартом [spark, mend]
   вместо таблицы уровня до следующего левелапа. appendSpells
   идемпотентен (append-only) — правка 1 строка. Пин — RF-1
   (tests/efir-sheet.test.js).
3. **CHANGELOG + SPEC «Сейв»: «без потерь» → точная формулировка.**
   Backfill D-H корректен (код не тронут), но «без потерь» неверно
   для старых сейвов с высоким уровнем: primary → старт-формула
   (3/3/3), points = 0 → боевые статы пересчитываются (L20: maxHP
   34→16, maxMP 29→11), уровни навыков — по новому потолку attr×2
   (L20: firelord 20→6, избыток — в банк skillXp 1:1). Сохраняется:
   level/xp/skillXp/spells 1:1. Доверенное обещание «сохранения»
   исправлено формулировкой (игрок не должен видеть ложный «без
   потерь»).
4. **«Что сохранено» п.1: L1 heal «14» → «12»** (арифметика:
   round(10+0.8·3) = 12; код L440 «L1: 12», пин BR-1 assert 12).
5. **ОТЛОЖЕНО в 000145/000146: устаревшие комментарии src/main.js
   про «5 полей» раздела efir** (5 мест: состояние efir ~L227,
   efir_met «заморожен 5 полями» ~L236, serialize-блок ~L628,
   restore-блок ~L835, debug-state ~L2515 — номера на этой ветке).
   Почему не здесь: 000143 (мастер) переписал Соседние комментарии
   companions в том же serialize-ханке (L625-633) — правка main.js в
   этой ветке дала бы новый rebase-конфликт вне проверенного
   dry-run'а. Править в задаче, которая всё равно правит main.js
   (000146 забирает вкладку + main.js): «5 полей» → «лист 10 ключей
   (000139/000144), backfill старого 5-полевого формата внутри
   deserializeEfir».

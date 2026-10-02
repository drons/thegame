# 000111: Эфир — собственные атрибуты, пул навыков, книга заклинаний
## Контракт формы состояния и API (станция Проектирование)

Задача: tasks/pending/000111.md (ТЗ — source of truth). Родитель 000035.
Правятся ТОЛЬКО `src/efir.js` + `tests/efir.test.js` (+ 1 неизбежный
техпин в tests/main-visuals.test.js — §8). Базовая линия: master
`a9c2d60` (после 000125), `npm test` = **1321/1321 зелёных** (проверено).
000081 СМЕРЖЕН (src/efir.js + tests/efir.test.js R1–R6 существуют);
000085 (сейв) — ПАРаллельно: serialize-функции появятся в efir.js
чужой веткой — НЕ трогать, ребейз поглотит. Мерж: ПОСЛЕ 000081, ДО
000112/000115/000116/000117 — этот файл — их контракт.

## 1. Что добавлено / что не тронуто

* **Добавлено в src/efir.js** (единственный правимый src-файл):
  таблица атрибутов `efirStats(level)`, книга: данные
  `EFIR_SPELL_START`/`EFIR_SPELL_UNLOCKS` + чистая `efirSpellsByLevel(level)`
  + поле `spells` в состоянии (append-only), пул: данные `EFIR_SKILLS`
  (зеркало каталога) + `efirSkillXpForNext` + `efirSkillCap` +
  `reprocessEfirSkills`. Поле `skillXp` в состоянии. `efirAllyData` —
  attrs (3 собственных) + книга из состояния.
* **НЕ тронуто**: xp-механика (addEfirXp/levelUp-пороги/100%/деградация —
  ТЗ п.2 «не переделывать раздел xp»), UMD-обёртка, ленивый
  `lazyGame`/`xpForNext`, src/combat.js, src/player.js, src/main.js,
  src/combat-ui.js, src/save.js, index.html, CSS, assets/**,
  SPEC.md, файлы задач. НОВОГО assets/efir/ НЕТ (SPEC «Данные и
  ассеты», 000053: состав пула/таблица/формулы — ДАННЫЕ МОДУЛЯ).
  НОВЫХ SVG нет (svg.test.js не затрагивается). Скрипт-тег
  `<script src="src/efir.js">` (index.html ~line 591) уже на месте —
  пин R12 (index-order) зелёный без правок.

## 2. Форма состояния (КОНТРАКТ для 000085/000112/000115/000116/000117)

```
state = {
  level:   ≥ 1 (int),
  xp:      ≥ 0 (int; в норме 0..xpForNext(level)−1),
  skillXp: { [skillId]: число ≥ 0 (ДРОБНЫЙ разрешён) },   // копилка практики
  skills:  { [skillId]: уровень ≥ 0 (int) },              // КЭШ (выводится переучётом)
  spells:  [spellId…],                                     // книга, append-only
}
```

* `createEfir()` → `{level: 1, xp: 0, skillXp: {}, skills: {},
  spells: ['spark','mend']}` — ровно 5 полей, СВЕЖИЕ объекты на каждый
  вызов (независимость — пин R2 расширен на skillXp/spells).
* **HP/MP в состоянии НЕТ** (решение 000081, SPEC «Сейв»: «к началу
  каждого боя — 100%»): каждый бой — новый makeAlly / 000112
  buildEfirUnit (hp = maxHP, mp = maxMP).
* `spells` — данные состояния (append-only): старт [spark, mend] +
  открытия по порогам (ТЗ/SPEC: «автоматически при level up,
  заклинания не удаляются»); канонический порядок = старт + пороги по
  возрастанию; 000115 round-trip'ит С ПОРЯДКОМ.
* `skills` — КЭШ: источник истины = `skillXp` + `level` (через
  атрибуты → потолок). Писать в `skills` напрямую, кроме
  `reprocessEfirSkills`, НЕЛЬЗЯ.
* `skillXp` — пишется практикой (000117) и нормализуется
  переучётом; дробные значения — легитимны (ТЗ 000115 round-trip
  «включая дроби skillXp»).

## 3. API Game.efir — ровно 11 экспортов (контракт имён)

```
// старые 4 (сигнатуры БЕЗ ИЗМЕНЕНИЙ, кроме тела efirAllyData/levelUp):
createEfir()                → state (5 полей, §2)
addEfirXp(state, amount)    → int  (+amount, levelUp; тихие skip как в 000081)
levelUp(state)              → int  (while-пороги БЕЗ ИЗМЕНЕНИЙ + ПОСЛЕ:
                                     книга §3а + reprocessEfirSkills §4)
efirAllyData(state)         → данные makeAlly: { id:'efir', name:'Эфир',
                                     role:'support', level,
                                     attrs: {intelligence, wisdom,
                                            constitution} (св. копия,
                                            = efirStats(level) без HP/MP),
                                     spells: книга (св. копия),
                                     skills: [], kind:'efir' }
                                     — ЯВНЫХ maxHP/damage НЕТ (§5 D2)
// новые в 000111 (7):
efirStats(level)            → { intelligence, wisdom, constitution,
                                 maxHP, maxMP } — свежий объект (§5 D5)
efirSpellsByLevel(level)    → [spellId…] — старт + пороги ≤ level,
                                 в порядке таблицы, свежая копия
reprocessEfirSkills(state)  → string[] (id, чей уровень ИЗМЕНИЛСЯ; §4)
efirSkillXpForNext(level)   → 15 * (level + 1) — кривая (копия 000013)
efirSkillCap(state, id)     → число — потолок = efirStats(уровень state)
                                 [def.primary] * 2; id вне пула → 0;
                                 state не объект → уровень 1
EFIR_SKILLS                 → данные пула (§5 D6): [{id, primary,
                                 requires}, …] в ЗАВИСИМОМ порядке
EFIR_SPELL_UNLOCKS          → данные таблицы открытий: [[5,'light_heal'],
                                 [8,'frost_bolt'], [10,'fireball'],
                                 [12,'magic_shield'], [15,'vine'],
                                 [20,'greater_heal'], [25,'ward'],
                                 [30,'nature_blessing']]
```

* `EFIR_SPELL_START = ['spark','mend']` — ВНУТРЕННЯЯ константа (не
  экспортируется: старт = `efirSpellsByLevel(1)`; 000115 пишет
  дефолт [spark, mend] по своему ТЗ).
* Чистота UMD СОХРАНЯЕТСЯ: в источнике НОЛЬ `require(` (пин R1);
  новые функции — чистые (не читают Game вообще); ленивый rootRef —
  только у `xpForNext`, как было. Браузерная загрузка без Game —
  0 console.error/исключений (все 11 full-chain vm-тестов).
* Ряд в return-блоке: существующие 4 на прежних позициях, новые 7 —
  ПОСЛЕ (минимизирует текстовый конфликт с 000085-serialize при
  ребейзе; §11).

### 3а. Книга: семантика
* `efirSpellsByLevel(level)` — чистая: L<5: [spark, mend]; L5 +
  light_heal; L8 + frost_bolt; L10 + fireball; L12 + magic_shield;
  L15 + vine; L20 + greater_heal; L25 + ward; L30 — все 10. Монотонна.
* `levelUp` ПОСЛЕ while-цикла (даже при n = 0 — идемпотентно):
  `if (!Array.isArray(state.spells)) state.spells = []` (нормализация
  старого/битого), затем каждый id `efirSpellsByLevel(state.level)`,
  которого нет — push (append-only, «заклинания не удаляются»;
  восстанавливает книгу, обрезанную нормализацией 000115).
* `efirAllyData`: `spells: (Array.isArray(state?.spells) ? state.spells
  : efirSpellsByLevel(level)).slice()` — состояние авторитетно,
  деградация на старую форму — таблица (терпимость к state без
  spells/skillXp — литерал R11 combat-ui).

## 4. Семантика переучёта reprocessEfirSkills (КОНТРАКТ)

ВЕДЕНИЕ С ТЕКУЩЕГО УРОВНЯ (bank = остаток в пределах уровня; на
потолке — overflow). НЕ «с нуля от остатка» — оно НЕ ИДЕМПОТЕНТНО
(проверено арифметически: bank 999, cap 6 → (6, 684); второй прогон
«с нуля» с 684 → (6, 369) — двойное списание). Инкрементальный
вариант — неподвижная точка:

```
reprocessEfirSkills(state) → string[]:
  state null/не-объект → [] (без мутаций)
  нормализация: skillXp/skills не-объект → {} (мутация state);
  значения bank: не-число/NaN/<0 → 0; значения level: не-число/NaN/<0
  → 0, > cap → cap (притёрт к потолку)
  stats = efirStats(state.level)
  ДЛЯ КАЖДОГО def из EFIR_SKILLS (порядок массива = ЗАВИСИМЫЙ:
  firelord → icelord → perception → precog; requires раньше
  зависимых — структурно):
    bank = norm(state.skillXp[def.id]); level = norm(state.skills[def.id])
    cap  = stats[def.primary] * 2
    level = min(level, cap)
    if (def.requires && (state.skills[def.requires.skill] || 0)
        < def.requires.level):
        // requires НЕ выполнен — НЕ растёт, банк ЦЕЛИКОМ (ничего не
        // списано: level 0 → bank = накопление целиком)
        state.skills[def.id] = 0; state.skillXp[def.id] = bank
        continue
    b = bank
    while (level < cap && b >= efirSkillXpForNext(level)):
        b -= efirSkillXpForNext(level); level++
    state.skills[def.id] = level; state.skillXp[def.id] = b
  return [id, чей level изменился (нормализованный «до» ≠ «после»)]
```

Свойства:
* **Идемпотентность** — структурно: после прогона либо level = cap,
  либо b < need(level) → второй прогон ничего не меняет. Тест T7.
* **Банк за потолком ХРАНИТСЯ** (overflow в skillXp): рост уровня
  Эфира → рост cap → следующий переучёт конвертирует остаток.
  Отличие от player `_gainSkillXp` (бросает ВХОДЯЩИЙ опыт на
  потолке): 000117 `practiceEfir` = прибавка в skillXp + reprocess —
  на потолке прибавка не теряется.
* **requires → 0 + банк целиком**: icelord ← firelord 5, precog ←
  perception 5 (каталог assets/skills). Значимый случай — до первого
  гейта (накопленный заранее опыт конвертируется ПОЛНОСТЬЮ, когда
  requires выполнится: bank 90 → при firelord 5: 15+30+45 → уровень 3).
  После выполнения requires — не «обнарушивается» (уровни firelord/
  perception монотонны: reprocess никогда не снижает level).
* **Зависимый порядок** — массив EFIR_SKILLS; requires.skill обязан
  идти раньше зависимого (структурно так: idx 0<1, 2<3).
* **Битый кэш чинится**: level > cap → cap; не-числа → 0.
* Точки вызова: **levelUp (000111, один раз после while — подготовка
  к 000117, поведенчески нейтральна: банк пуст), deserialize (000115 —
  ОБЯЗАТЕЛЬНО, ТЗ 000117 «вызывается из deserialize 000115»),
  practiceEfir (000117 — после прибавки)**. Возврат [id…] — для
  событий/логов 000116/000117.

## 5. Ключевые решения (по каждому — почему)

* **D1. Форма состояния — 5 полей (спells в state)** — SPEC «Сейв»
  фиксирует `data.efir = {level, xp, skillXp, skills, spells}`;
  ТЗ 000115 ожидает `createEfir() — … skills {}, skillXp {}, spells
  [spark, mend]`; нормализация «spells нет/пусто → [spark, mend], НЕ
  выводить из уровня» имеет смысл только для поля состояния.
* **D2. Явных maxHP/damage в efirAllyData НЕТ** — неприкосновенный
  пин R7 в tests/combat.test.js (файл ВНЕ списка правок ТЗ) ждёт
  ФОРМУЛЬНЫЕ maxHP = round(12·0.7) = 8 / damage = round(2.7) = 3
  (мораль ×формула); явные статы ломали бы его и меняли боевое
  поведение, которого ТЗ не просит (ТЗ: «таблица роста как чистая
  функция уровня»). Боевые явные статы (hp = maxHP, mp = maxMP,
  «Касание духа», мана) — скоуп 000112 `buildEfirUnit(efir, c)`
  (берёт `efirStats(level)` + `state.spells`). ПЕРЕЗАКРЫВАЕТ прогноз
  memory/000081 «000111 переключит efirAllyData на явные».
* **D3. attrs (3 собственных) + книга — В efirAllyData** — SPEC «Бой»:
  «Статы (собственные, не шесть основных игрока)» — таблица атрибутов
  Эфира; существующий механизм 000080 allyHeal (combat.js:1204) читает
  `u.attrs[spell['атрибут']]` — с attrs лечение масштабируется от
  Мудрости (задокументированное следствие ТЗ: «растёт сам»); формульный
  maxHP/damage (D2) не трогается → мораль сохраняется. Следствия для
  боя — §6; существующие пины НЕ ломаются (проверено по всем
  efir-тестам).
* **D4. Кривая — КОПИЯ игрока: `efirSkillXpForNext(level) =
  15*(level+1)`** (000013, player.js:341) — отдельная чистая функция
  (ТЗ: «не переиспользование player-объекта»); без ленивых ссылок на
  Game (константа дизайна; правка баланса — 000119 в одном месте).
* **D5. Таблица — чистая функция: `efirStats(level)` →
  a = 3 + floor((lv−1)/2) (Инт = Мудр = Тел); maxHP = 10 + 2a;
  maxMP = 5 + 2a (ТЗ: 5 + Инт + Мудр). L1: 3/3/3, 16, 11; L2:
  3/3/3, 16, 11; L3: 4/4/4, 18, 13; L5: 5/5/5, 20, 15 — значения
  ТЗ/SPEC, пины тестом (T1). Ключи — английские, как в каталогах
  (intelligence/wisdom — совпадают с полем «атрибут» assets/spells →
  allyHeal работает без адаптеров; constitution — maxHP). Мусор/
  <1 → 1. Свежий объект на вызов.**
* **D6. Пул — ДАННЫЕ МОДУЛЯ, ЗЕРКАЛО каталога**:
  `EFIR_SKILLS = [{id:'firelord', primary:'intelligence', requires:
  null}, {id:'icelord', primary:'intelligence', requires:{skill:
  'firelord', level:5}}, {id:'perception', primary:'wisdom', requires:
  null}, {id:'precog', primary:'wisdom', requires:{skill:'perception',
  level:5}}]` (порядок = зависимый). Каталог при загрузке НЕ читается
  (чистый UMD, 0 require — паттерн SECONDARY_SKILLS в player.js);
  source of truth — assets/skills, ЦЕЛОСТНОСТЬ (id + primary +
  requires, deepEqual; null ↔ отсутствие поля) — тестом T4 (паттерн
  000053: данные в модуле + целостность тестом). `efirSkillCap`
  читает def из ДАННЫХ МОДУЛЯ (не лениво из Game.SkillsData —
  node-тестам не нужен stub каталога; дрейф зеркала ловит T4).
* **D7. Потолок — `efirSkillCap(state, id) = efirStats(уровень)
  [def.primary] * 2`** (паттерн practiceCap player.js:351: «основной
  атрибут навыка * 2 по ЕГО атрибутам»; ловушка «у Эфира нет
  основных → потолок 0» закрыта): firelord/icelord — Интеллект·2
  (L1: 6, L3: 8, L5: 10), perception/precog — Мудрость·2 (у Эфира
  те же значения). id вне пула → 0; state не объект → L1.
* **D8. levelUp — ПОСЛЕ while: книга + reprocess** (нейтрально в
  000111, подготовка к 000117); xp-механика (пороги
  xpForNext/100%/деградация) — БЕЗ ИЗМЕНЕНИЙ (R3/R5/R6 — регрессия).

## 6. Следствия для боя (детерминированы; НОЛЬ новых c._rng)

* **L1–L4**: книга [spark, mend] (как было), НО attrs появились →
  mend (wisdom 3, степень 1): `round((4 + 0.5·3 + 1)·1) = 7`
  (было 5 с attrs {} — формула allyHeal 000080). Пинов на сумму
  лечения Эфира НЕТ (проверено: heal-пины 000080 — Орк-шаман/мерсы;
  «Эфир лечит» в tests/ не пинится).
* **L5–L19**: в книге mend + light_heal (обе степень 1) —
  allyHeal (строгое `>` по «степени», тай-брейк — порядок списка)
  выбирает mend (первый в списке). Не баг (механизм 000080).
* **L20+**: greater_heal (степень 2, wisdom 12):
  `round((4 + 6 + 20)·1.15) = 35` — allyHeal начнёт лечить им
  (сильнейшая степень из СПИСКА СОЮЗНИКА). combat.js НЕ правится.
* R7 (combat.test.js): maxHP 8 / damage 3 / мораль 1.5×4 — ФОРМУЛЬНЫЙ
  путь (D2) → БЕЗ ПРАВОК. R8 (гибель): w.damage 20 ≥ 8 — без правок.
  R9 (детерминизм): самосравнение — без правок; поток c._rng
  идентичен (статы/attrs не вызывают RNG; heal — без роллов).
* R10 combat-ui (hp === maxHP — относительно), R11 (литерал старой
  формы — терпимость efirAllyData) — без правок.

## 7. ПЕРЕЗАКРЫТИЕ устаревших строк memory/000081-efir-ally.md §3

Файл НЕ редактируем (активный контракт 000084–000087, параллельные
правки = конфликт ребейза). Устаревшие строки (противоречат ТЗ/SPEC —
авторитетны ТЗ 000111 + SPEC «Дух Эфира»):
* «L3: 20/12; L5: 24/18» → **L3: maxHP 18, maxMP 13; L5: 20, 15**
  (таблица D5: 3+floor((ур−1)/2); 10+2·Тел; 5+Инт+Мудр).
* «12 + waterbolt; 16 + icearmor; 20 + heal» → **waterbolt/icearmor/
  heal в assets/spells НЕТ**; книга: 5 light_heal, 8 frost_bolt,
  10 fireball, 12 magic_shield, 15 vine, 20 greater_heal, 25 ward,
  30 nature_blessing.
* «attrs (телосложение/интеллект/мудрость/воля/обаяние/ловкость)»
  → attrs Эфира = ТОЛЬКО 3: intelligence/wisdom/constitution
  («собственные, не шесть основных игрока»).
* «000111 … явные maxHP/damage … мораль перестаёт влиять на явный
  damage» → **явных maxHP/damage в 000111 НЕТ (D2); явные боевые
  статы — 000112 buildEfirUnit**; формульный damage с моралью — до
  000112 (моральный урон магии — 000113).
* Аналогично перезакрыт прогноз memory/000081-efir.md решение 2
  («000111 переключит efirAllyData на явные») и «подводный камень»
  («000111 переопределит явным maxHP») — см. D2.

## 8. Тесты (tests/efir.test.js расширяем; все node, ленивый
   loadEfir; целостность — fs по assets/skills и assets/spells)

Технические правки (наш файл, под новый путь; семантика пина
сохраняется):
* **R1**: экспорты «ровно 4» → **ровно 11**: 9 функций
  (createEfir, addEfirXp, levelUp, efirAllyData, efirStats,
  efirSpellsByLevel, reprocessEfirSkills, efirSkillXpForNext,
  efirSkillCap) + 2 ДАННЫХ (EFIR_SKILLS, EFIR_SPELL_UNLOCKS —
  Array.isArray; цикл `typeof === 'function'` — только для 9).
  Остальное (0 `require(`, vm-ветка без Game) — без правок.
* **R2**: Object.keys → `['level','skillXp','skills','spells','xp']`;
  `s.skillXp` deepEqual {}; `s.spells` deepEqual ['spark','mend'];
  `d.attrs` — `{intelligence:3, wisdom:3, constitution:3}` (L1,
  свежие 3 собственных — D3); независимость — на skillXp/spells
  тоже; spells/id∈assets/spells — как было.
* **R3, R5, R6 — БЕЗ ПРАВОК** (xp-механика/100%/деградация).
  **R4 — БЕЗ ПРАВОК** (формулы makeAlly 8/14/20 +
  `!('maxHP' in d) && !('damage' in d)` — D2).

Новые КРАСНЫЕ (имена «000111 T1»…«000111 T9»; краснота осмысленная —
нет экспортов/данных/поля, НЕ синтаксис):
* **T1** — таблица: `efirStats(1/2/3/5)` точные значения (3/3/3,16,11;
  3/3/3,16,11; 4/4/4,18,13; 5/5/5,20,15); свежая копия на вызов;
  `efirAllyData(state с level 5).attrs` = {5,5,5} (согласованность).
* **T2** — детерминизм: deepEqual(efirStats(12), efirStats(12));
  deepEqual(efirSpellsByLevel(15), efirSpellsByLevel(15)); два
  createEfir(), поднятых до L8 РАЗНЫМИ путями xp (+50+141+… vs один
  большой addEfirXp) → одинаковые attrs/книга/потолок.
* **T3** — книга: старт (createEfir().spells и efirAllyData L1 =
  ['spark','mend'], копия на вызов); `efirSpellsByLevel` L4 =
  [spark,mend], L5 = +light_heal, L8 = +frost_bolt, L30 = все 10 в
  порядке таблицы; монотонность (L4 ⊂ L5 ⊂ L8); levelUp —
  АВТОМАТИЧЕСКИ appends (L1 → +xp до L8 → state.spells =
  efirSpellsByLevel(8); повторный levelUp — без дублей); append-only
  (ручное понижение state.level НЕ откатывает spells).
* **T4** — целостность: все id EFIR_SKILLS ∈ assets/skills (fs,
  паттерн SPELL_IDS + новый SKILL_IDS-хелпер, паттерн
  combat.test.js:251); primary/requires модуля == каталога
  (deepEqual; null ↔ поле отсутствует); все id книги (старт +
  EFIR_SPELL_UNLOCKS) ∈ assets/spells; каталога assets/efir/ НЕ
  существует (fs.existsSync === false).
* **T5** — потолок: `efirSkillCap` L1 firelord = 6, L3 = 8, L5 = 10;
  perception/precog — те же (Мудрость·2); id вне пула → 0; state
  мусор → L1 (6). Сценарий: `skillXp.firelord = 999` + reprocess (L1)
  → skills.firelord = 6, skillXp.firelord = **684**; рост до L3
  (levelUp по порогам) → **8 / 459** (overflow хранится и
  конвертируется).
* **T6** — requires: только `skillXp.icelord = 90` (firelord 0) →
  reprocess → icelord = 0, skillXp.icelord = **90** (банк ЦЕЛИКОМ);
  + `skillXp.firelord = 225` → reprocess → firelord = **5** (bank 0:
  15+30+45+60+75), icelord = **3** (bank 0: 15+30+45 — полный банк
  90 конвертирован); precog ← perception 5 — зеркально.
* **T7** — идемпотентность: reprocess ×2 → state deepEqual;
  нормализация: bank 'x'/−1/NaN → 0; skills не-число → 0; skills >
  cap → prитёрт к cap; reprocess(null) → [] без исключений.
* **T8** — levelUp-интеграция: pre-set skillXp + addEfirXp через
  пороги → за ОДИН вызов: уровень + книга (L5 → light_heal) +
  reprocess (потолок вырос); xp/level — те же значения, что R3
  (50/141/260 — регрессия порогов).
* **T9** — боевая проекция (createCombat, паттерн блока 000081
  combat.test.js; combat.js уже required в шапке — добавить
  createCombat в dеструктуру): L1, раненый игрок (p.hp = 1) → лог
  «Эфир лечит … (+7)» (attrs.wisdom в формуле allyHeal 000080);
  L20 (поднять циклом `s.xp = P.xpForNext(s.level); levelUp(s)` — БЕЗ
  хардкода суммы) → лог «Эфир лечит … (+35)» (greater_heal, степень
  2); у.attrs deepEqual {intelligence:12, wisdom:12,
  constitution:12}; в ДАННЫХ efirAllyData явных maxHP/damage НЕТ
  (D2 — регрессия смысла R7).

Итог: 1321 + 9 = **1330 тестов**. RED-фаза: `npm test` → 1330,
1321 pass + **9 fail — только имена «000111 T*»** (проверить по
именам: ни один «000081 R*»/чужой не упал); изолированно
`node --test tests/efir.test.js` → 15 (6 зелёных R1–R6 + 9 красных).
R1/R2-правки — вместе с GREEN-коммитом (вводящим экспорты/форму).

**ТЕХПИН ВНЕ СКОПА ТЗ (одобрено Проектированием, 1 шт):**
tests/main-visuals.test.js line 1047–1048 (R13):
`Object.keys(st).sort()` `['level','skills','xp']` →
**`['level','skillXp','skills','spells','xp']`** + комментарий
«форма {level, xp, skillXp, skills, spells} (000085→000115)».
НЕИЗБЕЖЕН: createEfir() 5 полей — ТЗ п.3 ({skillXp, skills}) + SPEC
«Сейв» + ТЗ 000115 (дефолт createEfir()). Техническая правка под
новый путь (инвариант workflow допускает); семантика пина
(«форма состояния» + проводка main.js) сохраняется. Техпин
combat.test.js:2891 (maxHP 8→16) НЕ НУЖЕН (D2). Флейк-процедура:
случайный чужой сбой → перепуск `node --test tests/<файл>` + запись
в result-отчёт.

## 9. Чек-листы последующих задач (что взять от 000111)

* **000085 (ПАРаллельно, сейв):** serializeEfir/deserializeEfir —
  их (базовая форма {level, xp, skills} по их ТЗ). ПОСЛЕ ребейза
  на master (с 000111): createEfir() возвращает 5 полей — их
  serialize должен переносить skillXp/spells (или расширение —
  000115; ТЗ 000115: «serialize/deserialize — базовые из 000085,
  расширяем»); round-trip-тест save.test.js адаптировать к 5 полям
  (по смыслу, без бампа версии). НЕ трогать serialize-регион в
  своей ветке (его там нет — ребейз поглотит).
* **000112 (бой: ИИ + действия):** `buildEfirUnit(efir, c)` —
  явные боевые статы: hp = `efirStats(level).maxHP`, mp =
  `efirStats(level).maxMP`, «Касание духа» round(2 + 0.5·Мудр),
  пулы 1+floor(Инт/10)/1+floor(Муд/10); касты — из `state.spells`;
  уровни лордов — из `state.skills` (формула (1 + 0.05·ур)).
  efirAllyData ОСТАЁТСЯ в API (000086-панель, контракт 000081).
* **000115 (финальный сейв):** deserialize восстанавливает 5 полей
  (нормализация: skillXp нет → {}; skills нет → {}; spells нет/
  пусто → [spark, mend] — НЕ выводить из уровня); **ПОСЛЕ
  deserialize — ОБЯЗАТЕЛЬНО `reprocessEfirSkills(state)`** (ТЗ
  000117); round-trip — идентично (включая дроби skillXp и порядок
  spells); CURRENT_VERSION НЕ поднимать.
* **000116 (UI вкладка «Эфир»):** данные — `efirStats` (атрибуты/
  maxHP/maxMP), `EFIR_SKILLS` (primary/requires — пометки),
  `EFIR_SPELL_UNLOCKS` (таблица «что и на каком уровне откроется»),
  `efirSkillXpForNext` («нужно»), `efirSkillCap` (потолок «атт.·2»),
  state (банк/книга/уровни). «банк/нужно» (паттерн 000041): банк =
  state.skillXp[id] (в пределах уровня; на потолке — overflow).
* **000117 (практика):** `practiceEfir(efir, skillId, amount)` =
  прибавка в `state.skillXp[id]` (НЕ округлять на входе — дроби
  разрешены) + `reprocessEfirSkills(efir)`; маппинг действий — с
  юнита (000112); практика НЕ трогает skillXp/secondary игрока.

## 10. Ленивые ссылки и guards (UMD-инварианты)

* В источнике НОЛЬ `require(` (пин R1 regex); тело модуля —
  константы + объявления функций → 0 console.error при ЗАГРУЗКЕ
  (11 full-chain vm). Новые функции не читают Game вообще
  (чистые по уровню/состоянию); ленивый rootRef — только у
  xpForNext (без изменений).
* Терпимость к старой форме state (без skillXp/spells) — во всех
  точках входа (efirAllyData/levelUp/reprocessEfirSkills): `|| {}` /
  таблица, без console.error-спама (литерал R11).
* Никаких снапшотов Game при загрузке (000038); throw на загрузке —
  НЕТ.

## 11. Риски мержа / порядок

* efir.js — ОБЩИЙ файл с 000085 (параллельно): зона конфликтов —
  return-блок и хвост factory (их serialize-функции). Минимизация:
  новые функции/экспорты — только в хвосте factory; существующие
  функции — минимальные правки. Ребейз на свежий master (с 000085,
  если смержится раньше) — сверять по СМЫСЛУ + полный npm test.
* «Случайное» зелёное: поведение боя Эфира меняется ТОЛЬКО по суммам
  лечения (attrs, D3) и книге L5+; существующие пины покрывают
  L1-создание (формула maxHP/damage — D2, не тронута) и
  самосравнение детерминизма → набор зелёный БЕЗ правок чужих тестов,
  кроме ОДНОГО техпина main-visuals R13 (§8).
* Горячие файлы минимальны: efir.js + efir.test.js + 1 строка
  main-visuals.test.js; combat.js/index.html/assets — 0 изменений.

## 12. Коммиты (ветка task/000111; формат: «Задача 000111: …» +
    Co-Authored-By: Claude Code <noreply@anthropic.com>)

1. «Задача 000111: красные тесты + контракт памяти» — tests/efir.
   test.js (T1–T9, БЕЗ R1/R2-правок) + этот memory-файл.
   Верификация RED (§8): 1330 тестов, 9 fail — только «000111 T*».
2. «Задача 000111: src/efir.js — атрибуты, пул навыков, книга
   заклинаний» — модуль (D1–D8) + R1/R2-правки (наш файл) +
   техпин main-visuals R13. Всё зелёное (1330/1330).
3. (правки по итогам анализа/тестов — при необходимости).
4. Мерж-стадия (оркестратор): .merge-pending → ребейз на свежий
   master → npm test (1330+) → «Задача 000111: CHANGELOG — …»
   (ОТДЕЛЬНЫЙ коммит; раздел «## 2026-10-02» → «### Игровой
   процесс», формат по записям; программное не перечислять) →
   мерж в master → удалить .merge-pending → pending→done + result.

Черновик CHANGELOG: «**Эфир растёт.** У духа появились собственные
характеристики (Интеллект, Мудрость, Телосложение) и растущая с
уровнем книга заклинаний: с 5-го — «Свет исцеления», с 8-го —
«Морозная стрела», с 10-го — «Огненный шар», с 12-го — «Магический
щит», с 15-го — «Плетень», с 20-го — «Сильное исцеление», с 25-го —
«Ограда», с 30-го — «Благословение природы». Лечит отряд самым
сильным известным исцеляющим заклинанием и с уровнями становится
крепче — больше здоровья и сильнее лечение.» (Точная формулировка —
на стадии мержа.)

## 13. Подводные камни

* **НЕ «reprocess с нуля от остатка»** — неидемпотентно (двойное
  списание cost(0..level−1) на каждом прогоне; T7 бы упал).
  Ведение — с ТЕКУЩЕГО уровня (bank = остаток в пределах уровня,
  на потолке — overflow); фиксированная точка структурна.
* **На requires-ветке сохранять БАНК (не остаток после списания)**:
  level 0 → ничего не списано → `skillXp[def.id] = bank` целиком
  (T6: 90 остаётся 90).
* **Порядок EFIR_SKILLS = зависимый** (firelord→icelord,
  perception→precog): requires читает state.skills — prerequisite
  обязан быть уже переучтён в том же прогоне.
* maxMP в боевые данные makeAlly НЕ попадает (поля mp нет; мана —
  000112 buildEfirUnit). Не добавлять «за future».
* `skills: []` (массив!) в efirAllyData — как в 000081 (проекция
  пула в боевой юнит — 000112); НЕ путать со `state.skills`
  (объект id→уровень).
* allyHeal-тайбрейк (D3-заметка для 000112): L5–L19 mend и
  light_heal — обе степень 1, выбран mend (первый в списке, строгое
  `>`); «самое сильное» по «мани» — алгоритм 000112, не 000080.
* Комментарий index.html у тега efir.js («состояние {level, xp,
  skills}») устареет — правка НЕ в скоупе (документация сейва —
  000115).
* memory/000081-efir-ally.md §3 — устарел (§7): при конфликте
  авторитетны ТЗ 000111 + SPEC «Дух Эфира» (таблица/книга/3
  атрибута; явные боевые статы — 000112).

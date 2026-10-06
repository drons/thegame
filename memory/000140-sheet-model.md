# 000140 — ЕДИНАЯ МОДЕЛЬ ЛИСТА ПЕРСОНАЖА: src/sheet.js (Game.Sheet)

Станция «Проектирование» (2026-10-06). База = master 45bbada (000133-000138
ВСЕ смержены — ПРЕДОСТЕРЕЖЕНИЯ ТЗ об in-progress 000133 устарели).
Контракт: memory/000139-skill-unification.md §2/§4 C1/C4/§5/§6.6 (приоритетен
над ТЗ tasks/pending/000140.md). Детали API — memory/000140-sheet-hero.md.

## 1. Что добавлено / перенесено

* **Новый модуль src/sheet.js** (чистый UMD, ~440 строк): единая модель
  прокачки `{kind, level, xp, points, primary{6}, secondary{}, skillXp{},
  spells[]}` + носитель npcId. Чистые функции (без DOM/RNG): createSheet,
  xpForNext, pointsPerLevel, addXp, canRaise, raiseSkill, skillXpForNext,
  practice, reprocessSkillXp, derived, takeDamage, heal, restoreDay.
* **Перенесено из player.js дословно** (формулы/guards — бит-в-бит):
  xpForNext (round(50·L^1.5)), live-логика points_per_level (player.js L57-63
  → sheet.pointsPerLevel, guard 000098/000099: number/finite/≥1 → иначе
  DEFAULTS → литерал 2), derived (player.js L210-266, ВСЕ формулы),
  canRaise (L270-293), raiseSkill (L304-326, БЕЗ craft-хука — см. §3),
  addXp (L332-352, ОДНО live-чтение на вызов), skillXpForNext (15·(L+1)),
  practiceCap (primary×2), skillLevel, reprocessSkillXp (L463-486),
  takeDamage/heal/restoreDay (L502-526).
* **Герой переезжает делегированием**: src/player.js — тонкий слой (см.
  memory/000140-sheet-hero.md). Публичный flat-API (Game.createCharacter /
  Game.addXp / Game.derived / …) — БЕЗ изменений сигнатур и форм значений;
  потребители в src/ (main/combat/items/spells/craft/companions/npc/
  building-effects/ui-*/efir) — 0 правок.
* **ЕДИНСТВЕННОЕ геймплей-изменение — C1 (контракт 000139 §4)**: практика
  навыка на «потолке практикой» (уровень = primary×2, уровень < MAX 100)
  больше не БРОСАЕТ новый опыт — опыт копится в банке c.skillXp[id], уровень
  не растёт, reason остаётся «потолок практикой»; конвертация банка — при
  росте потолка (reprocessSkillXp, уже умеет тратить застрявший банк).
  Эталоны: efir.js reprocessEfirSkills L402-447 (банк за потолком ХРАНИТСЯ)
  и practiceEfir L737-753 (всегда cur+amount). На MAX=100 — бросок
  СОХРАНЯЕТСЯ (applied 0, банк не трогается, reason «максимальный уровень»).

## 2. Контракты и границы

### 2.1 S-1: createSheet(kind, initial) — начальный список = ПАРАМЕТР

* `KINDS = ['hero','efir','merc']`; неизвестный kind → `throw Error`
  (валидация входа — прецедент cityLayoutSize; не деградация).
* **kind 'hero' — ТОЧНЫЙ лейаут createCharacter** (player.js L96-119, порядок
  ключей сохранён — JSON-байты сейва): `{name, level:1, xp:0, totalXp:0,
  gold:100, hp:0, mp:0, points:0, primary{6×1}, secondary:{}, skillXp:{},
  spells:['spark','mend'], alive:true}` + hp/mp из derived (L120-122).
  **ПОЛЯ `kind` У ГЕРОЯ НЕТ** (решение R-1): main.js collectSaveData L584
  сериализует hero ЦЕЛИКОМ, sanitizeSavedHero (остаётся в player.js)
  восстанавливает фиксированный набор — новое поле изменило бы лейаут сейва
  (000031) и исчезало бы после restore (неравномерность сейв/рантайм).
  kind у героя НЕЯВЕН (носитель = player.js). Если 000145 захочет
  sheet.kind у героя — добавит в createSheet('hero') + sanitize (неломко,
  000031) и перепинит сейв.
* **kind 'efir'/'merc'** (база для 000144/000143): `{kind, level:1, xp:0,
  totalXp:0, points:0, primary (initial, дефолт 6×1), secondary:{},
  skillXp:{}, spells (initial.spells||[]).slice(), npcId: initial.npcId}` —
  БЕЗ name/gold/hp/mp/alive (у них их нет; их 5-полевой/5-полевой
  save-формат (пины save.test.js L1362, companions.test.js L725) —
  территория 000144/000143, в 000140 НЕ вызывается игрой).
* `initial` — ЕДИНСТВЕННОЕ допустимое различие персонажей (ТЗ 000139):
  shallow-merge поверх дефолтов (primary — по ключам; name/spells/npcId —
  как есть). createSheet('hero', {name}) — путь player.js. Валидации
  первичных ключов НЕТ (ответственность вызывающего; данные 000141
  генерируются из каталога).
* createSheet НЕ требует каталог/настройки (все дефолты — литералы) →
  никогда не возвращает null (только throw на неизвестный kind).

### 2.2 S-2: practice — C1 (КРИТИЧНО; полный контракт возврата)

`practice(sheet, skillId, amount, ignorePracticeCap=false)`
→ `{ok, applied, level, leveledUp, total, reason?}`:

1. Guards (порядок): неизвестный id →
   `{ok:false, reason:'неизвестный навык: '+id, applied:0, level:0,
   leveledUp:false, total:0}`; amount не number/finite/<0 → 'неверный
   опыт'; `sheet.alive === false` → 'персонаж погиб' (R-2: явное сравнение —
   sheet БЕЗ alive (efir/merc) не ловится).
2. `level0 >= MAX_SKILL_LEVEL (100)` → `{ok:true, applied:0, level:level0,
   leveledUp:false, total:bank0, reason:'максимальный уровень'}` — банк НЕ
   трогается (без изменений; пины player.test.js L308-320, items.test.js
   L298-313).
3. **`level0 >= cap` (cap = primary×2, level < MAX) — ПЕРЕЛИВ В BANK (C1)**:
   `bank = bank0 + Math.round(amount); sheet.skillXp[id] = bank;` уровень НЕ
   растёт. Возврат `{ok:true, applied: GAIN, level:level0, leveledUp:false,
   total: bank, reason:'потолок практикой'}`. **Семантика `applied` на cap =
   gain (опыт ПРИНЯТ в копилку)** — решение D7: документация _gainSkillXp
   «applied — опыт, принятый в копилку», «total — содержимое копилки после
   операции» + эталон practiceEfir (всегда cur+amount). Альтернатива 0
   отклонена; если ревью попросит иное — менять 2 C1-теста (одна точка).
4. Накопление ниже cap — дословно текущий цикл (while level < limit:
   need = 15·(level+1)); банк (остаток) хранится ВСЕГДА, включая остаток при
   достижении cap за один вызов (пин player.test.js L276-282 — числа те же:
   100 → L2/банк55); `leveledUp` true, если уровень вырос.
5. `ignorePracticeCap=true` (книги/свитки, путь skillReadBook): limit = MAX
   100 — рост выше practice-cap до 100 (без изменений; пин player.test.js
   L296-306). «Школы» (тренировочные постройки) — тот же путь practice()
   (hook ТЗ п.1 закрыт параметром ignorePracticeCap + чистым API; механика
   школ — вне 000140).
6. reprocessSkillXp (дословный перенос) при росте primary — лупа до нового
   cap; под C1 застрявший банк БОЛЬШЕ (перелив копится) — лупа покрывает без
   правок (пин player.test.js L284-294 — числа идентичны: 55 → L3/банк10).

### 2.3 S-3: addXp — очки 2/уровень ВСЕМ kinds, live-settings (000099)

* `sheet.alive === false` → `{levelsGained:0, pointsGained:0}` (R-2).
* `gained = Math.round(amount * derived(sheet).xpMult)`; totalXp += gained
  (R-4: totalXp ведётся У ВСЕХ kinds — у efir/merc новое поле, легально:
  000143/144 territory); xp += gained; while-лупа xpForNext.
* `ppl = pointsPerLevel()` — ОДНО live-чтение на вызов (значимость
  начисления и возврата — одна; пины global-settings R3/R7/R9 + L156).
* За уровень `sheet.points += ppl` — ВСЕМ kinds (ТЗ; у Эфира/наёмных очков
  не было — SPEC L748/L801 переопределяет 000139, реализуют 000143/144).
* hp/mp-кламп в новые max — **ТОЛЬКО если поле есть**:
  `if (typeof sheet.hp === 'number') …` — без guard `Math.min(max,
  undefined) = NaN` «загрязнит» efir/merc-листы (у них нет hp/mp).
  Для hero (hp/mp всегда number) — behavior-identical.
* Возврат `{levelsGained, pointsGained: levelsGained * ppl}`.

### 2.4 S-4: derived(sheet, ctx={}) — hero-формулы + kind-модификатор

* Базовые hero-формулы — перенос дословно (player.js L210-266: maxHP/maxMP/
  armor/moveCells/attackActions/…/xpMult 35+ ключей).
* `ctx.modifier` — функция `(base, sheet, ctx) → ПОЛНЫЙ объект` (все ключи
  base + переопределения) — kind-хук для 000144 (формула efirStats) и
  000143 (role-множители makeAlly). Без modifier → base (hero). Контракт
  для 000143/144: модификатор ВЕРНУТЬ должен полный объект, не дифф.
* derived требует каталог (лениво) — см. §3.

### 2.5 S-5: takeDamage/heal/restoreDay

* Дословный перенос; guard смерти — `sheet.alive === false` (R-2).
* Функции оперируют полями hp/mp — предназначены для листов С hp (hero;
  000143 добавит, если наёмным потребуется; Эфир бессмертен — 000144 не
  использует). Вызов на листе без hp — precondition-violation (в 000140
  таких вызовов нет).

### 2.6 Границы scope (НЕ в 000140)

* efir.js / companions.js — НЕ ТРОГАЮТСЯ (унификация — 000144/000143;
  createSheet('efir'/'merc') в этой задаче игрой НЕ вызывается).
* grantXpRaw live-перевод — follow-up 000099 (§4 memory/000099-settings-
  live.md:87); формула зеркала не меняется.
* levelup-feedback / squad-merc-skills / e2e-growth-journeys — отклонены
  контрактом 000139 §5 (сильные будущие кандидаты, нумерация с 000148).
* UI (вкладка «Персонаж», портреты) — 000142/000145/000146; CSS — 000145.

## 3. Ленивые ссылки и guards (UMD-ловушка 000038)

* **UMD-обвязка** (паттерн 000038/000053/000127/000138):
  `factory(skills, settings, rootRef)`. node — `factory(require(
  './skills-data.js'), require('./global-settings.js'), null)` (циклов НЕТ:
  sheet.js player.js не требует); браузер — `root.Game = Object.assign({},
  root.Game, { Sheet: factory(null, null, root) })`.
* **Чистая загрузка (browser-ветка)**: 0 DOM, 0 RNG, 0 console, 0 require,
  СНАПШОТА Game НЕТ. Межимодульные чтения — ТОЛЬКО лениво в момент вызова:
  `rootRef.Game.SkillsData` (SECONDARY_SKILLS — каталог эффектов) и
  `rootRef.Game.GlobalSettings` (SETTINGS.points_per_level + DEFAULTS).
  В node-ветке — прямые объекты от require (тот же живой SETTINGS —
  live-семантика 000099 сохраняется).
* **Деградация** (недостижима в игре — теги global-settings L745 /
  skills-data L748 ПЕРЕД sheet.js; на случай vm-песочниц с неполной
  цепочкой): каталог/настройки отсутствуют на момент ВЫЗОВА →
  console.error ОДИН раз за загрузку (текст называет Game.SkillsData /
  Game.GlobalSettings + порядок — паттерн lazyGame efir.js L105-117) +
  безопасный отказ (createSheet — без зависимости; derived/practice/
  addXp-via-derived/canRaise/raiseSkill/reprocessSkillXp → null / ok:false /
  {levelsGained:0,…} / []), исключений 0, игра не падает (000053).
  pointsPerLevel БЕЗ console.error (guard 000099 молчаливый по
  конструкции): value → DEFAULTS.points_per_level → литерал 2 (значение
  DEFAULTS 000098; финальный fallback недостижим — DEFAULTS frozen-клон
  существует всегда).
* **player.js** (тонкий слой) получает ТРЕТЬЮ load-time зависимость —
  Game.Sheet — в стиле существующих guards (skills-data/global-settings,
  player.js L21-29): отсутствует → `throw Error('player.js: не найден
  Game.Sheet — загрузите sheet.js до player.js (задача 000140)')`. В игре
  недостижимо (пин index-order); герой — ядро, деградация героя невозможна
  по построению → throw, не тихий no-op (в отличие от efir).

## 4. Что важно будущим задачам (ссылки ТЗ/контракта)

* **000143 (наёмные)**: createSheet('merc', {npcId, primary, spells}) —
  очки 2/уровень уже работают (S-3); боевые статы — через derived +
  ctx.modifier (S-4) и makeAlly data.maxHP/data.damage (контракт §6.5);
  запись сейва → {npcId, sheet, loyalty, hiredDay} + backfill (C3 — перепин
  companions.test.js:725 осознанно); death-state остаётся в companions.js
  (dead_mercs) — takeDamage на merc-sheet может не понадобится.
* **000144 (Эфир)**: createSheet('efir', {primary:{int/wis/con:3,…}});
  efirStats → derived-модификатор (S-4); EFIR_SKILLS — начальный список
  (initial); 100% XP/Вдох/авто-разблокировки СОХРАНЕНЫ; backfill 5-полевого
  сейва (C3 — перепин save.test.js:1362 осознанно); addEfirXp-обёртка —
  сигнатура без изменений (combat-ui.js L988-990 не трогать).
* **000145/000146 (UI)**: UI вызывает G.* (player.js — hero) или
  Game.Sheet напрямую; крафт-пересчёт — ТОЛЬКО через обёртки player.js
  (R-3, §3.1 memory/000140-sheet-hero.md). Панель уже готовит display:
  `bank > 0 && lvl < 100` → «lvl (bank/need)» (ui-tab-skills.js L186-196) —
  под C1 на cap теперь ВИДЕН банк (до C1 банк на cap всегда был 0); строка
  маркера «потолок практикой: Сила N×2…» не меняется и остаётся верной.
* **000147 (заклинания)**: sheet.spells — просто массив; canLearn/learn
  (spells.js) уже агностичны к носителю (mutate p.spells).
* **Правило для будущих задач**: HARDCODED vm-цепочка, в которой есть
  'player.js' ⇒ 'sheet.js' ОБЯЗАН быть перед ней (browser-ветка player.js —
  жёсткая load-time зависимость; список — §5).
* **R-2 (контракт 000143/144)**: guard смерти — `sheet.alive === false`
  (sheet без alive = жив); hp/mp-кламп — только при наличии поля.
* **R-4**: totalXp ведётся у всех kinds (у efir/merc — новое поле).
* **Культура сейвов (000031)**: CURRENT_VERSION=1 не меняется, hero-лейаут
  байт-в-байт, MIGRATIONS={} (пин save.test.js:259).

## 5. Подводные камни

1. **C1 шире ТЗ**: ТЗ назвал ОДИН перепин (player.test.js L265-274), но
   бросок на cap закреплён И ВТОРЫМ тестом — tests/combat.test.js L992-1003
   (тот же путь: combat.js L922 → P.skillPractice → r.practice.applied).
   Оба перепинаются в ОДНОМ коммите как части ОДНОГО изменения;
   зафиксировано в tasks/result/000140.md + CHANGELOG. Проверено grep'ом
   ('потолок'/'applied'/'skillXp' по tests/): других пинов броска на cap
   НЕТ (items L298-313 — MAX-100 путь сохранён; craft-core — своя
   craftXp-копилка; ui-skills/ui-panel — только practiceCap-маркер; e2e до
   cap не доводят; spells.test.js L716-730 — ниже cap, идентично).
2. **Live-read points_per_level обязан пережить перенос** (R3/R7/R9 +
   re-require-тест global-settings.test.js L145/151): sheet.pointsPerLevel
   — перенос ЛОГИКИ livePointsPerLevel дословно (guard value → DEFAULTS →
   литерал 2); player.js addXp-обёртка НЕ кэширует; экспорт
   POINTS_PER_LEVEL (снапшот load-time, player.js L51/L530) НЕ УБИРАТЬ —
   grantXpRaw (building-actions.js L165) его читает, иначе points → NaN.
3. **~15 технических вставок 'sheet.js' ПЕРЕД 'player.js'** в HARDCODED
   vm-цепочках (14 файлов): ui-skills L132, ui-panel L267, npc-hire L147,
   npc-hire-ui L202, squad-panel L166, combat-ui L136, items L920
   (ITEMS_CHAIN), cities L1540, dungeon-ui L235 (withCombat), dungeon-
   vision L179 (withCombat), map L873, global-settings L820/L900/L956
   (3 цепочки), companions L117 (BROWSER_CHAIN, префикс 'src/'), index-
   order L371 (CORE_SCRIPTS, префикс 'src/'). Динамические цепочки
   (matchAll index.html — save/city-screen/camp-map-e2e/mob-zones-e2e/
   companions-cycle/building-actions BA5/building-effects R5-R6/locations
   LOC-12/main-visuals/hud/ui-efir/craft-ui) подхватывают тег сами — они
   же зелёный гейт браузерной ветки (errors.length===0).
4. **Craft-хук (000046) НЕ «утекает» в sheet.js**: craftReprocessHook
   (ленивый globalThis.Game.Craft) остаётся в обёртках player.js —
   raiseSkill (target + каждый skill из каскада reprocessSkillXp) и
   practice/skillReadBook при leveledUp (craft-core.test.js L211+ пинит
   «вызывается из player.js при росте навыка»). sheet.js — чистая модель,
   Game.Craft не знает.
5. **Коммент 000133** (свитки/руны, createCharacter player.js L111-116 —
   регион, который делегирование переписывает) ПЕРЕЕЗЖАЕТ за
   `spells: ['spark','mend']` в sheet.js (не терять: 000133 уже в мастере).
6. **index-order пины**: править ТОЛЬКО СВОИ строки (+ 'src/sheet.js' в
   «нужные модули», +тест pos(sheet)<pos(player), + 'src/sheet.js' в
   CORE_SCRIPTS между map.js и player.js); чужие пины (000133
   building-effect-runes.js L837-852, 000138, ui-tabs…) не трогать.
7. **grantXpRaw — ТОЛЬКО коммент зеркала** (building-actions.js L151-157):
   источник addXp теперь src/sheet.js (Game.Sheet.addXp); формула и снапшот
   deps.game.POINTS_PER_LEVEL (known gap 000099) не меняются.
8. **UMD-ловушка 000038**: browser-ветка sheet.js не читает Game при
   загрузке (снапшота НЕТ) — иначе vm-песочницы с неполной цепочкой упадут
   при загрузке; деградация console.error 1× + безопасный отказ, исключений
   0.
9. **Флейк-политика**: npm test ~85 с; одиночный чужой fail →
   `node --test tests/<файл>` — перепуск + запись в tasks/result/000140.md
   (memory/test-runner-worktrees.md; мерить ВНУТРИ worktree).

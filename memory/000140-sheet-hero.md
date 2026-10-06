# 000140 — Game.Sheet: API, слой player.js, C1-тесты, порядок тегов

Дополнение к memory/000140-sheet-model.md (обзор/границы/guards/follow-up).
База = master 45bbada (2026-10-06); file:line — по worktree task-000140.

## 1. API Game.Sheet (module.exports = тот же объект)

```
KINDS                  = ['hero','efir','merc']
MAX_SKILL_LEVEL        = 100

createSheet(kind, initial)  → sheet (mutable) | throw (неизвестный kind)
  hero: ТОЧНЫЙ лейаут createCharacter (без поля kind — R-1); hp/mp из
        derived; коммент 000133 (свитки/руны) переезжает за spells.
  efir/merc: {kind, level:1, xp:0, totalXp:0, points:0, primary,
              secondary:{}, skillXp:{}, spells, npcId} (без name/gold/hp/
              mp/alive).

xpForNext(level)           → round(50 · level^1.5)      // ЕДИНЫЙ источник
pointsPerLevel()           → live: SETTINGS.points_per_level; guard:
                             number/finite/≥1 → иначе DEFAULTS.points_
                             per_level → 2 (значения DEFAULTS 000098)
addXp(sheet, amount)       → { levelsGained, pointsGained }
                             // alive===false → 0/0; xpMult (scholar);
                             // totalXp += gained; +ppl за уровень ВСЕМ
                             // kinds; hp/mp-кламп только при наличии поля
canRaise(sheet, target)    → { ok, reason? }
raiseSkill(sheet, target)  → { ok:true, level, skillLevels? } | { ok:false,
                             // reason }   // БЕЗ craft-хука (R-3 — в
                             // обёртках player.js); каскад reprocessSkillXp
skillXpForNext(level)      → 15 · (level + 1)
practiceCap(sheet, skillId)→ primary[s.primary] · 2; неизвестный id → 0
skillLevel(sheet, skillId) → secondary[skillId] || 0
practice(sheet, skillId, amount, ignorePracticeCap=false)
                           → { ok, applied, level, leveledUp, total,
                               reason? }
  // C1: на cap (level<MAX) — bank += round(amount), level НЕ растёт,
  //     applied = gain, leveledUp false, reason «потолок практикой»
  //     (перелив — в BANK; эталон efir.js L402-447/L737-753)
  //     на MAX=100 — applied 0, банк не трогается,
  //     reason «максимальный уровень» (без изменений)
  //     ignorePracticeCap=true — книги: limit = MAX (без изменений)
reprocessSkillXp(sheet, primaryId) → [id…]  // дословно; лупа до нового cap
derived(sheet, ctx={})     → объект производных (hero-формулы дословно) +
                             ctx.modifier(base, sheet, ctx) → ПОЛНЫЙ объект
takeDamage(sheet, amount)  → { dead }     // guard alive===false
heal(sheet, amount)        → hp
restoreDay(sheet)          → { hp, mp }
```

Чистые функции — мутация ТОЛЬКО переданного sheet; без DOM/RNG/console
(кроме деградации console.error 1× — §3 memory/000140-sheet-model.md).

## 2. src/player.js — тонкий слой делегирования (герой)

UMD: node — `factory(require('./skills-data.js'), require(
'./global-settings.js'), require('./sheet.js'))`; браузер —
`factory(root.Game.SkillsData, root.Game.GlobalSettings, root.Game.Sheet,
root)` + ТРЕТИЙ guard (throw при отсутствии Game.Sheet — см. §3
memory/000140-sheet-model.md).

### 2.1 Делегируется в Game.Sheet (сигнатуры flat-экспортов — БЕЗ изменений)

* Прямые ре-экспорты (та же функция sheet.*): xpForNext, derived,
  canRaise, addXp, skillXpForNext, practiceCap, skillLevel,
  reprocessSkillXp, takeDamage, heal, restoreDay.
* Обёртки:
  * `createCharacter(name='Флогистон') = sheet.createSheet('hero',
    {name})` — лейаут/порядок ключей — ТОЧНО как было (pin save.test.js).
  * `raiseSkill(c, target)`: r = sheet.raiseSkill(c, target); if (r.ok):
    craftReprocessHook(c, target) + for s of (r.skillLevels||[]):
    craftReprocessHook(c, s); return r.
  * `skillPractice(c, id, amount)`: r = sheet.practice(c, id, amount,
    false); if (r.ok && r.leveledUp) craftReprocessHook(c, id); return r.
  * `skillReadBook(c, id, amount)`: то же с ignorePracticeCap=true.
  Точки хука 1:1 с текущими (player.js L314-318, L324, L434) —
  craft-core.test.js L211+ зелёный.

### 2.2 Остаётся в player.js (НЕ переносится)

* **POINTS_PER_LEVEL** — снапшот load-time (L51, экспорт L530):
  grantXpRaw (building-actions.js L165) читает `deps.game.POINTS_PER_LEVEL`
  (иначе points → NaN) + re-require-тест global-settings.test.js L145/151
  пинит P.POINTS_PER_LEVEL === SETTINGS.points_per_level. **НЕ УБИРАТЬ.**
* PRIMARY_SKILLS / SECONDARY_SKILLS — ре-экспорт каталога (skills-data).
* RANKS / rankOf / rankIndex / secondaryName / primaryName — вид-каталог
  для UI (пины player.test.js L106-130, tests/skills.test.js).
* sanitizeSavedHero (L146-207) — культура сейвов 000029/000031,
  hero-лейаут (main.js restoreFromSave L761).
* craftReprocessHook (L494-500) — ленивый globalThis.Game.Craft (000046);
  ТОЛЬКО в обёртках player.js (R-3): sheet.js Game.Craft не знает.
* livePointsPerLevel (L57-63) — УДАЛЯЕТСЯ (не экспортировался; логика →
  sheet.pointsPerLevel дословно).
* return-блок — ТОТ ЖЕ список имён (потребители в src/ — 0 правок:
  main.js L224/L761/L791/L1236/L1408/L1814/L1965/L2102/L2657/L2662,
  combat.js L774/L922/L955/L973/L1002, items.js L486/L592, spells.js
  L453, npc.js L461/L572, companions.js L130/L131/L184/L404-405,
  building-effects.js ×14, ui.js L170, ui-tab-skills.js ×8, ui-tab-efir.js,
  combat-ui.js, dungeon-ui.js, efir.js (Game.xpForNext лениво), craft.js).
* Заголовок файла: + «модель прокачки — src/sheet.js (000140); этот модуль
  — слой героя: сейвы, каталог-виды, craft-хуки».

## 3. grantXpRaw — зеркало (src/building-actions.js L151-170)

* Формула НЕ меняется: та же xpForNext-лупа (sheet.xpForNext = round(50·L^
  1.5) — идентична), тот же снапшот `deps.game.POINTS_PER_LEVEL` (L165 —
  known gap memory/000099-settings-live.md:87; live-перевод ВНЕ scope,
  follow-up 000099), тот же hp/mp-кламп, totalXp ведётся (R1/R4).
* Правка = ТОЛЬКО коммент зеркала (L151-157): «ТОЧНОЕ ЗЕРКАЛО addXp
  (src/sheet.js — Game.Sheet.addXp; player.js — делегирование) БЕЗ xpMult —
  при изменении addXp в sheet.js синхронизировать»; «player.js НЕ
  ТРОГАЕТСЯ» заменить на «сигнатуры flat-API player.js — без изменений».
* Пины зеркала (building-actions.test.js / building-effects.test.js
  L3222: POINTS_PER_LEVEL: 1 в фейк-игре) — без правок.

## 4. Изменённые hero-тесты (C1) — ровно 2, оба осознанные

Контракт C1 (memory/000139-skill-unification.md §4): на cap опыт копится в
банке. Бросок на cap был закреплён ДВУМЯ пинами (ТЗ назвал один — аналитики
нашли второй; зафиксировать в tasks/result/000140.md + CHANGELOG):

1. **C1-HERO** — tests/player.test.js L265-274
   «skillPractice: на потолке практикой опыт не начисляется» →
   «…опыт копится в банке (000140, C1)»:
   `r.applied == 10` (было 0), reason /потолок/, `c.secondary.swordsman ==
   2`, `c.skillXp.swordsman == 10` (было 0).
2. **C1-COMBAT** — tests/combat.test.js L992-1003 «практика: на потолке
   (основной * 2) попадание опыт не даёт» (ТОТ ЖЕ путь через бой:
   combat.js L922 → P.skillPractice → r.practice):
   `r.practice.applied == 3` (= PRACTICE_XP.hit, было 0),
   `r.practice.level == 2`, `p.secondary.swordsman == 2`,
   `p.skillXp.swordsman == 3` (было 0).

Всё остальное — зелёное БЕЗ правок (проверено попунктно): player.test.js
L247-263/276-282/284-294/296-306/308-320/322-331/333-340/362-458,
items.test.js L221-253/L298-313, spells.test.js L716-730,
craft-core.test.js (своя craftXp-копилка), efir.test.js (свой модуль),
ui-skills.test.js (только practiceCap-маркер + bank-отображение по
c.skillXp — hero-поля без изменений), save.test.js (hero-лейаут/version),
companions.test.js L725 (roster), global-settings (POINTS_PER_LEVEL +
live), combat-детерминизм (seed-тесты — пути без cap), building-actions/
effects (зеркало). Видимое UI-следствие C1 (без пинов): zелья/еда (items.js
L612-614) и панель навыков (bank виден на cap) — часть того же изменения.

## 5. Порядок тегов index.html

Между `src/map.js` (L756) и `src/player.js` (L757):

```html
  <script src="src/map.js"></script>
  <!-- Единый «лист персонажа» (задача 000140): модель прокачки
       Game.Sheet — ДО player.js (player.js читает Game.Sheet при
       загрузке: тонкий слой делегирования); UMD-ловушка 000038:
       порядок закреплён tests/index-order.test.js. -->
  <script src="src/sheet.js"></script>
  <script src="src/player.js"></script>
```

* Чистая загрузка sheet.js (browser) — не требует global-settings/
  skills-data при загрузке (лениво); позиция между map.js и player.js —
  регион ядра, до day.js.
* Пины tests/index-order.test.js (править только свои строки):
  1. «нужные модули подключены» (L34-71): + 'src/sheet.js'.
  2. Новый тест: pos('src/sheet.js') != -1 && pos(sheet) < pos(player)
     (образец — пин 000138 L1235-1240; RED: тега нет → -1).
  3. CORE_SCRIPTS (L368-373): + 'src/sheet.js' между 'src/map.js' и
     'src/player.js' (используется vm-тестом «Game.Spells…»).
  4. Чужие пины не трогать (000133 L837-852 building-effect-runes.js —
     свой регион, 000138, ui-tabs, …).
* Технические вставки 'sheet.js' перед 'player.js' (14 файлов / 16 точек):
  ui-skills L132, ui-panel L267, npc-hire L147, npc-hire-ui L202,
  squad-panel L166, combat-ui L136, items L920, cities L1540, dungeon-ui
  L235, dungeon-vision L179, map L873, global-settings L820/L900/L956,
  companions L117 ('src/'), index-order CORE_SCRIPTS ('src/') — см. §5
  memory/000140-sheet-model.md. Механика, без семантики; динамические
  цепочки (matchAll index.html) — 0 правок.

## 6. Коммиты (ветка task/000140)

1. «Задача 000140: красные тесты (sheet.test.js, пин index-order, C1-
   перепины) + memory» — tests/sheet.test.js (SH-1..SH-5 + UMD-чистота),
   tests/index-order.test.js (IO-140), tests/player.test.js (C1-HERO),
   tests/combat.test.js (C1-COMBAT), memory/000140-sheet-model.md,
   memory/000140-sheet-hero.md.
2. «Задача 000140: src/sheet.js + делегирование player.js + тег
   index.html».
3. «Задача 000140: технические правки тестовых цепочек + коммент
   grantXpRaw».
4. «Задача 000140: CHANGELOG — …» (дата = 2026-10-06).
5. Finalize: tasks/result/000140.md + pending→done.
Каждый: первая строка «Задача 000140: …», последний параграф —
Co-Authored-By: Claude Code <noreply@anthropic.com>.

# 000133: изучение заклинаний — свитки из подземелий + руны на камне/обелиске
# контракты и границы

Статус: СТАДИЯ ПРОЕКТИРОВАНИЯ (итоговая архитектура зафиксирована
анализами a1/a2/a3 + сверкой с кодом HEAD 375c0f4). Красная стадия
коммитит этот файл вместе с тестами.
ТЗ: tasks/pending/000133.md (закоммичен в master — НЕ ИЗМЕНЯЕТСЯ;
решения фиксируются здесь).
Родитель: 000001 (непрерывное улучшение; якорь —
memory/000001-improvement-audit.md §3 «000133», §4.2/4.3 — наставнический
источник, §6 — пересечения файлов).
Второй файл: memory/000133-spell-learning.md (контент: состав свитков,
источники, отложенное).
Паттерны, переиспользуемые 1:1: memory/000074-rune-stone-obelisk.md
(камень/обелиск), memory/000128-building-actions.md (спец-модули,
registerSpecial, 000128 §2.3), memory/000091-tavern-rest-rumors.md
(таверна: эффекты-массив + общий эффект-объект).

## 1. Цель и scope

Дать игроку путь изучения заклинаний — ДВА из ТРЁХ SPEC-источников
(SPEC.md L1010-1014 «Книга заклинаний»), достижимые БЕЗ новых построек:
(а) предмет-свиток (новый kind, лут сундуков подземелий, применение —
useItem, source 'scroll'); (б) Рунический камень (40) и Обелиск (42) —
действие «Расшифровка (заклинание)» (source 'rune').
Сегодня игрок навсегда со spark+mend: canLearn/learn (src/spells.js:147-186,
экспорт :489) написаны и протестированы, но БЕЗ единого вызова в src.

ОТЛОЖЕНО (НЕ в этой задаче, ТЗ п.3): наставнический источник (Башня
мага, Лаборатория, Монастырь, Храм исцеления, Храм горы) — постройки
недостижимы, дождутся волн школ (аудит §4.2/4.3; задача-наследник
«000133b», якорь §7 аудита: source 'mentor' в canLearn УЖЕ ГОТОВ —
спец-гейты для 'mentor' не нужны: ранг школы по атрибуту + базовое
заклинание — те же проверки, что у 'scroll').

НЕ ТРОГАТЬ (инварианты):
* src/spells.js (логика изучения — ЕДИНСТВЕННАЯ; вызовы — только из
  items.js и спец-модуля), src/main.js, src/building-actions.js,
  src/building-ui.js, src/combat.js (000132 — горячий файл),
  src/save.js (v1), src/player.js (КОД — только комментарий :111-113),
  src/cities.js, формат сейва (hero.spells уже санитизируется,
  main.js:689-690 + G.Spells.sanitizeSpellBook spells.js:474).
* Записи EFFECTS '40'/'42' и ИХ golden (A42-A54, B21/B22): имена,
  формулы, квест, порядок строк (каталожный `эффекты` — '40'/'42'
  ПЕРВЫМИ), квестный механизм обелиска.
* Записи EFFECTS 000137 (таверна 44*) — общий файл building-effects.js,
  разные записи → чистый ребейз (аудит §6).
* доли_типов 51-54 (серия cities-golden 000134 — НЕ ТРОГАТЬ, аудит §6).
* Боевой RNG/детерминизм (свиток в бою [Q] — через useItem, c._rng не
  трогает; руны — собственный (tile,day)-сид, не пересекается с rng
  боя), legacy playerSpell (кнопки Огонь/Исцел.), SVG/CSS (новых НЕТ —
  у предметов иконок нет, svg.test.js не затрагивается).
* .merge-pending (только стадия мержа), push в remote, основной
  репозиторий, чужие worktrees.

## 2. Контракт spell_scroll (свитки, source 'scroll')

### 2.1 Schema (assets/items/schema.json, additionalProperties:false —
расширение ОБЯЗАТЕЛЬНО, иначе новые JSON невалидны)
* `properties.kind.enum` += `"spell_scroll"`.
* `properties.effect.properties.kind.enum` += `"spell"`.
* `properties.effect.properties` +=
  `"spell": { "type": "string", "pattern": "^[a-z][a-z0-9_]*$" }`
  (аналог `skill`).
* Каталог зданий/подземелий — схемы БЕЗ ПРАВОК (особые_параметры —
  открытый объект; dungeons — предметы: строки).

### 2.2 Каталог — assets/items/000043..000050.json (8 НОВЫХ предметов)

Именование: `<spell_id>_scroll` (прецедент: «Свитки» 000030-000032 —
kind skill_book + skill_xp, опыт НАВЫКА; новые — другой kind, имена не
коллидируют: nature_scroll занят → природа-свиток = vine_scroll).

ФИКСИРОВАННЫЙ СОСТАВ (решение ТЗ, фиксируется тестом S1; 1-2 на школу,
все 6 школ; состав ПОЛНЫЙ — 8 свитков, ни одного больше/меньше):

| файл | id | spell (effect.spell) | школа (уровень, база) |
|---|---|---|---|
| 000043 | fireball_scroll | fireball | огонь 2 (нет) |
| 000044 | flame_burst_scroll | flame_burst | огонь 3 (fireball) |
| 000045 | frost_bolt_scroll | frost_bolt | лёд 1 (нет) |
| 000046 | blizzard_scroll | blizzard | лёд 3 (frost_bolt) |
| 000047 | chill_scroll | chill | тень 1 (нет) |
| 000048 | light_heal_scroll | light_heal | исцеление 2 (нет, Мудрость) |
| 000049 | magic_shield_scroll | magic_shield | защита 1 (нет, Мудрость) |
| 000050 | vine_scroll | vine | природа 1 (нет, Мудрость) |

Почему (решение): spark/mend — стартовые (player.js:114), свитки
бессмысленны (canLearn «уже изучено»); inferno (ур.4), greater_heal/ward
(ур.3 с базой), stone_skin, shadow_bolt, nature_blessing — не в луте
(высокая магия для сундуков); flame_burst/blizzard — дают свитку смысл
«сначала база» (отказ-путь «нужно базовое заклинание», тест S6).
Формат записи (по образцу 000030.json):
  { "id": "fireball_scroll", "name": "Свиток: Огненный шар",
    "kind": "spell_scroll", "weight": 0.2, "value": 60,
    "desc": "Свиток: изучает «Огненный шар» (нужен ранг школы).",
    "effect": { "kind": "spell", "spell": "fireball" } }
value ~45-120 по уровню заклинания (решение реализации, валидно по
схеме 1..100000); weight 0.2 (как прочие книги/свитки).
STACKABLE: spell_scroll НЕ добавляется (items.js:49) — свиток
одноразовое изучение, стопка бессмысленна; addItem нестаккуемого
всегда qty 1 → qty>1 в инвентаре физически невозможен.

### 2.3 Пулы сундуков — assets/dungeons/000001..000005.json

ФИКСИРОВАННОЕ РАСПРЕДЕЛЕНИЕ (решение ТЗ, фиксируется тестом S3
deepEqual; КАЖДЫЙ из 8 свитков — РОВНО в одном подземелье; вставка —
в КОНЕЦ массива `предметы`, порядок массива = порядок
`items[floor(rng()*len)]` dungeon.js:434 → ре-пин golden, §7):
* 000001 CAVE «простая пещера» (4→5): +frost_bolt_scroll
  (холод пещеры; tier-1 лёд — изучаем с нуля);
* 000002 CRYPT «склеп» (4→6): +chill_scroll, +light_heal_scroll
  (тьма склепа: страх тьмы + свет исцеления);
* 000003 RUINS «руины замка» (4→6): +fireball_scroll, +vine_scroll
  (война: огонь; природа затягивает замок);
* 000004 DROWNED «затопленная пещера» (4→5): +magic_shield_scroll
  (вода: защита);
* 000005 ABYSS «бездна» (5→7): +flame_burst_scroll, +blizzard_scroll
  (эндгейм: оба — tier-3, требуют базового — «сначала база»).
Тема/прогрессия: tier-1 свитки — ранние подземелья, tier-3 — бездна.

СИНХРОНИЗАЦИЯ (тройная, Р1): assets/dungeons/*.json →
`npm run sync:dungeons` (src/dungeons-data.js, GENERATED) →
FALLBACK_DUNGEONS-литерал src/dungeon.js:56-107 (1:1 с каталогом,
конвенция 000058; ТЗ о литерале НЕ говорит — дельта D1, правка
ОБЯЗАТЕЛЬНА: 5 массивов `предметы`) → ре-пины (§7).

### 2.4 src/items.js

* :35-38 ITEM_KINDS += `SPELL_SCROLL: 'spell_scroll'`; :40
  EFFECT_KINDS += `SPELL: 'spell'` (перечислительность).
* validateItem (:54-84) — ветка spell_scroll: effect.kind === 'spell'
  && typeof effect.spell === 'string' && /^^[a-z][a-z0-9_]*$/.test
  (ФОРМА только). Каталог spells в браузере грузится ПОЗЖЕ
  (index.html: items.js :684 < spells-data.js :700) — id по каталогу
  при ЗАГРУЗКЕ НЕ проверяем; каталогные id проверяют ТЕСТЫ (S1:
  spell ∈ SPELLS_BY_ID, node) — мусорный id в каталоге не проедет.
* useItem (:483) — НОВАЯ ВЕТКА ПОСЛЕ гарда reagent (:490), ПЕРЕД
  бонус-логикой (:492) и qty-циклом (:512):
  ```js
  if (it.kind === 'spell_scroll') {
    if (qty > 1) return { ok: false, reason: 'свиток: по одному' };
    const G = (typeof globalThis !== 'undefined' &&
               typeof globalThis.Game === 'object') ? globalThis.Game : null;
    const S = G && G.Spells;   // ЛЕНИВО в момент ВЫЗОВА (паттерн G.Craft :533-539)
    if (!S || typeof S.canLearn !== 'function') {
      return { ok: false, reason: 'заклинания недоступны' };
    }
    const chk = S.canLearn(c, it.effect.spell, 'scroll');
    if (!chk.ok) return { ok: false, reason: chk.reason };
    S.learn(c, it.effect.spell, 'scroll');
    removeItem(c, it.id, 1, true);   // бонусFirst — паттерн :551
    const sp = S.getSpell(it.effect.spell);
    return { ok: true, name: it.name, spell: it.effect.spell,
             message: 'Изучено: «' + (sp ? sp.название : it.effect.spell) + '»' };
  }
  ```
  Ключевое: ОТКАЗ (canLearn !ok) → return ДО безусловного
  removeItem (:551) — предмет НЕ тратится, в ответе причина («нужен
  ранг школы «Знаток»» / «нужно базовое заклинание: Огненный шар» /
  «уже изучено» / «неизвестное заклинание»). UI (ui.js:231-232)
  флэшит r.reason при !ok / r.message при ok. Успех → тратится
  РОВНО 1 шт.
* «чтение — Интеллект» (SPEC) — гейт рангом школы по
  spell.атрибут (hero.primary) УЖЕ в canLearn (:151-160) — ничего
  нового не пишем.
* СВИТОК В БОЮ [Q] — ЭМЕРДЖЕНТНО БЕЗ ПРАВОК combat.js:
  playerQuickItem (combat.js:918-938) → I.useItem(p, itemId) (qty 1);
  !r.ok → `c.ps.quickItem += 1` (действие НЕ сгорает — предмет остаётся).
  Применимость quick-слота (combat.js:1063-1081) проверяет только
  weapon/armor/reagent → свиток проходит до useItem. [T]-whitelist
  (combat.js:1086-1091: potion/food/skill_book) БЕЗ ИЗМЕНЕНИЙ — свиток
  в мини-меню [T] НЕ попадает (мини-меню — будущая задача §4.9).

### 2.5 UI (2 точки, минимум)
* src/ui-tab-inventory.js:76-77 — ОБЯЗАТЕЛЬНО: кнопка «исп.» +=
  `|| it.kind === 'spell_scroll'` (иначе кнопки использования нет).
* src/ui.js itemTipText (:266-275) — ветка
  `it.effect.kind === 'spell'` → «Эффект: изучает «<название>»»
  (ленивый G.Spells + typeof-guard, как skill_xp-ветка; без G.Spells —
  «Эффект: изучает заклинание «<spell id>»»).
* Магазин: spell_scroll НЕ входит ни в один каталожный `виды`
  построек → не продаётся (SPEC: лут подземелий); makeShop-goldens
  (items.test.js :377/:670/:717): kind-фильтрованные (:377, :717) —
  БЕЗ ПРАВОК; :670 (wealth 3, пул allItems) — РЕ-ПИН на зелёной
  стадии (свитки концом каталога += сток; см. §11).
* ui.js case 'use' (:215) — без правок (вызывает G.useItem и флэшит).

## 3. Контракт рун (камень 40 / обелиск 42, source 'rune')

### 3.1 Каталог — assets/buildings/000040.json / 000042.json

Паттерн Таверны (000044.json: массив `эффекты` + сингулярный
`эффект`-объект СОСУЩЕСТВУЮТ; прецедент — 000091):
* 000040.json: особые_параметры +=
  `"эффекты": ["40", "40_spell"]`; ВНУТРЬ существующего `эффект`-
  объекта += `"заклинания": ["frost_bolt","chill","vine","magic_shield",
  "fireball","shadow_bolt","light_heal"]` (пул РАЗДЕЛЯЕТ оба действия
  постройки — общий объект, как слухи у Таверны).
* 000042.json: `"эффекты": ["42", "42_spell"]`; `эффект` +=
  `"заклинания": ["stone_skin","nature_blessing","flame_burst",
  "greater_heal","ward"]`.
ПОРЯДОК массива = порядок строк оверлея: СУЩЕСТВУЮЩЕЕ действие
ПЕРВЫМ (A48 :1438 строка [0]='40' — НЕ ДВИГАЕТСЯ; B21/B22 Digit1 =
«Расшифровать»/«Прикоснуться» — НЕ ДВИГАЕТСЯ).
ПУЛЫ (решение ТЗ, фиксируется тестом R1; из 16 каталога; union = 12
заклинаний — вне пулов: spark/mend (стартовые), inferno (ур.4),
blizzard):
* Камень (40) — РАННИЕ (ур.1-2, без базы): frost_bolt (лёд 1), chill
  (тень 1), vine (природа 1), magic_shield (защита 1), fireball (огонь
  2), shadow_bolt (тень 2), light_heal (исцеление 2). Рунопись растёт
  от существующего XP-действия «Расшифровать» — пул «разогревается».
* Обелиск (42) — ПОЗДНИЕ (ур.2-3; 3 из 5 — совершенствования с базой:
  flame_burst←fireball, greater_heal←light_heal, ward←magic_shield —
  учит прогрессию «сначала база»): stone_skin (защита 2),
  nature_blessing (природа 2), flame_burst (огонь 3), greater_heal
  (исцеление 3), ward (защита 3).
`раз_в_день: true` (верхнеуровневый) — НЕ ТРОГАТЬ: булево каталога
действует на ВСЕ effectId (hasDailyLimit :564-577, boolean-ветка) →
КЛЮЧИ 'x,y:40' и 'x,y:40_spell' НЕЗАВИСИМЫ (per-effectId марка
building-actions.js:342-344): и XP-«Расшифровать», и «Расшифровка
(заклинание)» — по разу в день, независимо.
Схема зданий — БЕЗ ПРАВОК (особые_параметры: {"type":"object"}).
Зеркало src/buildings.js — РЕГЕНЕРАЦИЯ `npm run sync:buildings`
(A43 :1325-1326 byte-пин; A43 проверяет поля, НЕ весь объект —
аддитивные `эффекты`/`заклинания` не бьют ассерты).

### 3.2 src/building-effects.js — чистые записи (000071/A12)

* Сид (рядом :182-244, паттерн STONE_ROLL_SEED — СВОЯ ASCII-константа,
  НЕ GLOBAL_SEED): `RUNE_SPELL_SEED = 0x52554e45` ('RUNE'); экспорт —
  для golden-пинов (R4).
* Чистый хелпер `runeSpellPool(st)`: читает
  `st.catalog.особые_параметры.эффект.заклинания` — массив строк
  (прототип-безопасно); не массив/пусто/мусорные элементы → null
  (деградация «недоступно»). Каталог-драйвен (000053: код читает
  каталог, не хардкодит — пул РАЗНЫЙ у камня/обелиска, один apply).
* Чистая `applyRuneSpell(st)` (ОДНА на оба id; ст.catalog — запись
  СОБСТВЕННОЙ постройки, pipeline building-actions.js:190):
  1. `G = lazyGame()`; нет G.hash2 или G.Spells.canLearn →
     `{ ok:false, message:'недоступно' }` (деградация, паттерн
     applyRuneStone :779-785).
  2. `eff = catalogEffect(st)`; `pool = runeSpellPool(st)`; hero —
     объект; иначе → `{ ok:false, message:'недоступно' }`.
  3. КАНДИДАТЫ (интерпретация «из доступных», ТЗ дословно — вариант B,
     filter→pick): `cands = pool.filter((id) =>
     G.Spells.canLearn(st.hero, id, 'rune').ok)` (порядок = порядок
     пула; canLearn — ЧИСТОЕ чтение hero: ранг школы по атрибуту,
     базовое, «уже изучено», Рунопись ≥ spell.уровень
     (spells.js:170-176) — всё уже реализовано).
  4. cands ПУСТО → `{ ok:false,
     message:'нет заклинаний, доступных для расшифровки (Рунопись/ранг школы)' }`
     — ОТКАЗ: ok:false → pipeline (building-actions.js:192-199) —
     flash + БЕЗ марки БЕЗ saveNow — «действие не тратится» (ТЗ:
     «Рунопись < уровень — отказ (предмет/действие не тратится)»,
     «повтор в тот же день — доступен»). **ОСОЗНАННОЕ отличие от R3
     000074**: у '40' (XP-«Расшифровать») провал ролла = ok:true
     (попытка СГОРЕЛА, марка ставится — applyRuneStone :811-816);
     здесь — разные записи, '40' НЕ меняем. Зафиксировано, чтобы
     ревью не «починил» в одну сторону.
  5. иначе `idx = G.hash2(x, y, RUNE_SPELL_SEED ^ day) % cands.length`
     → `spellId = cands[idx]`; возвращает `{ ok:true, success:true,
     spellId, message:'Расшифровано: «' + G.Spells.getSpell(spellId)
     .название + '»' }`. Формула (tile,day) — паттерн pickFragment
     :664-667 (hash — ленивый G.hash2 в момент apply; Math.random/Date
     НЕТ).
  ЧИСТО: hero только ЧИТАЕТ (canLearn read-only; learn() НЕ в apply —
  00071/A49 deepEqual по ВСЕМУ state, hero включён).
* Записи реестра (вставка ПОСЛЕ :390, свой групповой комментарий
  000133):
  ```js
  EFFECTS['40_spell'] = { имя: 'Расшифровка (заклинание)',
    apply: (st) => applyRuneSpell(st) };
  EFFECTS['42_spell'] = { имя: 'Расшифровка (заклинание)',
    apply: (st) => applyRuneSpell(st) };
  ```
  разВДень в записях НЕ ставится (каталог побеждает — паттерн A42).
* Экспорт (:2312-2350): + applyRuneSpell, runeSpellPool, RUNE_SPELL_SEED.
* UI-СТРОКА — АВТОМАТИЧЕСКИ: buildingActions (:1780-1828) строит
  строки из effectIds(каталог `эффекты`) × EFFECTS → ['40',
  '40_spell'] (камень) / ['42', '42_spell'] (обелиск); [E]-оверлей +
  DigitN — существующий механизм. ТЗ «UI — строка в buildingUI»
  достигается БЕЗ правок building-ui.js/main.js.

### 3.3 НОВЫЙ спец-модуль — src/building-effect-runes.js

learn() — МИР-«сторона» (мутация hero.spells), которой нет в ЧИСТОМ
apply → спец-модуль по контракту 000128 §2.3 (шаблон —
src/building-effect-48.js; мульти-id — прецедент src/building-content.js
один хендлер на 43+39):
* UMD: factory() БЕЗ аргументов; node — `module.exports = factory()` →
  { handle, register } (тесты регистрируют явно); браузер —
  `factory().register(G0)` (саморегистрация в момент загрузки, снапшот
  G0). В момент загрузки — ноль require/DOM (B1-семантика: errors 0).
* register(G): guard `!G?.buildingActions?.registerSpecial` →
  console.error + БЕЗ регистрации (деградация 000053, игра не падает);
  ИНАЧЕ registerSpecial('40_spell', handle) И registerSpecial('42_spell',
  handle) — ОДИН хендлер на ОБА id (пул берётся из каталога, НЕ из id
  — хардкод по id НЕ нужен). id '40_spell'/'42_spell' — латиница+
  подчёркивание, без ':'/','/пробелов → проходит registerSpecial-гард
  (building-actions.js:64).
* handle(ctx) (ctx по контракту 000128 §2.5: hero — ЖИВАЯ ссылка, r —
  результат apply по ссылке, world.game — снапшот main.js):
  ```js
  function handle(ctx) {
    const r = ctx && ctx.r;
    if (!r || r.ok !== true || r.success !== true ||
        typeof r.spellId !== 'string') {
      return { ok: false, message: (r && r.reason) ||
        'нет заклинания для расшифровки' };
    }
    const S = ctx.world && ctx.world.game && ctx.world.game.Spells;
    if (!S || typeof S.learn !== 'function') {
      console.error('building-effect-runes.js: Game.Spells не найден — ' +
        'src/spells.js обязан грузиться до main.js (задача 000133)');
      return { ok: false, message: 'заклинания недоступны' };
    }
    const res = S.learn(ctx.hero, r.spellId, 'rune');  // hero — ЖИВОЙ
    if (!res || !res.ok) {
      return { ok: false, message: res && res.reason };
    }
    return { ok: true };  // message — из apply (r.message — приоритет)
  }
  ```
  * learn() повторно гоняет canLearn (чистый гард): apply ok:true ⇒
    success гарантирован (выбор из прошедших canLearn на том же hero —
    тот же результат); ветка !res.ok — теоретическая защита
    (без марки — действие не тратится).
  * Успех {ok:true} → pipeline: марка 'x,y:40_spell'/'x,y:42_spell'
    + saveNow + flash(r.message «Расшифровано: «Имя»») +
    playerRender — АВТОМАТИЧЕСКИ (building-actions.js:337-351).
    hero.spells — в сейве уже есть (000045) → saveNow пишет книгу.
  * Отказ {ok:false} → flash(sres.message), БЕЗ марки/saveNow/render
    (building-actions.js:322-327) — день не сгорает.
  * try/catch НЕТ (000128 §2.4: баг хендлера ловят его тесты).

### 3.4 index.html — новый script-тег

Слот спец-модулей (между building-actions.js :754 и main.js :807):
тег `src/building-effect-runes.js` — ПОСЛЕ `src/building-effect-49.js`
(:784), ДО `src/hud.js` (:790) — append в конец слота (ре-бейз с
000137, добавляющим свой тег в тот же слот — union не-смежных тегов
тривиален). Комментарий — по формату соседних (:756-784, ссылка на
000133). Обязательность: ПОСЛЕ building-actions.js (registerSpecial),
ДО main.js (UMD-ловушка 000038: main.js снимает Game один раз — тег
после main.js ушёл бы в НОВЫЙ объект Game, регистрация молча мертва).
spells.js (:701) и building-actions.js (:754) — оба ВЫШЕ → в момент
загрузки спец-модуля и Game.buildingActions, и Game.Spells на месте
(но модуль не требует их при ЗАГРУЗКЕ — только guard в register()).

### 3.5 Пин — tests/index-order.test.js (формат 000094 :801-814)
* Техническая правка: массив «нужные модули» (:35-59) +=
  'src/building-effect-runes.js'.
* НОВЫЙ тест (НЕ-смежный пин, паттерн :801):
  pos != -1; pos(building-actions.js) < pos(runes); pos(runes) <
  pos(hud.js); pos(runes) < pos(main.js).

## 4. Ленивые ссылки и guards (сводка)

* useItem: `globalThis.Game` ЛЕНИВО в момент вызова (паттерн G.Craft
  items.js:533-539); node-тесты без G.Spells → ok:false
  «заклинания недоступны», игра не падает (тест S8). console.error в
  useItem НЕ ставится (прецедент G.Craft — тихий no-op; причина видна
  игроку во flash).
* applyRuneSpell: lazyGame() в момент apply (модуль чист при
  загрузке — 000053, ни require ни захвата Game); деградация
  'недоступно' (без console.error — паттерн applyRuneStone).
* Спец-модуль: при загрузке — только G0-снапшот + guard
  buildingActions (console.error + деградация); при ВЫЗОВЕ —
  ctx.world.game.Spells (снапшот main.js — в корректной цепочке
  гарантирован).
* VM-песочницы: ЧAIN парсится regex'ом из index.html
  (building-effects.test.js :4327) → новый тег подхватывается
  АВТОМАТИЧЕСКИ; items.test.js ITEMS_CHAIN — свитки в каталоге
  items-data.js, новый kind — в items.js (оба в цепочке).

## 5. Ре-пины (сознательное изменение данных, прецеденты
000073/000103/000131) — все на ЗЕЛЁНОЙ стадии (красная: новые тесты
красные, существующие — зелёные БЕЗ правок)

1. tests/dungeon.test.js :298-299 — golden ABYSS `c1.item`
   (сейчас 'phoenix_feather', seed c2 = 3935780563): пул 5→7 →
   `items[floor(rng()*len)]` ПЕРЕМАПЛИРУЕТ индекс (число rng-вызовов
   НЕ меняется — ternary dungeon.js:434; gold/mobs/позиции/CAVE-
   golden стабильны, только item сдвигается). Новое значение
   вычисляется на зелёной стадии. ТЗ явно: «ре-пин golden
   dungeons-сидов — в этой задаче».
2. tests/index-order.test.js :507-509 — fallback `DUNGEON_ITEMS[4]`
   deepEqual += ['flame_burst_scroll', 'blizzard_scroll'].
3. src/dungeon.js :56-107 — FALLBACK_DUNGEONS 1:1 с каталогом
   (5 массивов `предметы` по §2.3; deepEqual-пин dungeon.test.js
   :343-356 + index-order :489-516).
4. tests/building-effects.test.js A1 (:162-165) — UNION +=
   '40_spell', '42_spell' (MERGED — на стадии мержа; установленный
   паттерн «правка при ребейзе: union, пин регенерирован по
   фактическому коду»).
5. Зеркала (НЕ код тестов): src/items-data.js (`npm run sync:items`),
   src/dungeons-data.js (sync:dungeons), src/buildings.js
   (sync:buildings) — регенерация; deepEqual-зеркальные тесты
   (items :59, dungeon :328, buildings :94, A43 :1325) — без правок.
6. tests/dungeon.test.js :155-166 (пул ≥1 skill_book) — БЕЗ ПРАВОК
   (свитки — другой kind, условие про skill_book сохраняется).

БЕЗ правок (проверено по коду): A42 (имена '40'/'42'), A43 (эффект-
объект сохраняется; аддитивные поля не бьют ассерты), A44-A54
(формулы/golden-роллы/квест — apply('40')/('42') не трогаются),
B21/B22 (строка [0] — '40'/'42' по порядку каталога; марки ':40'/
':42'; квест; роллы 0.695932/0.499819), shop-goldens kind-фильтр
(исключение: items :670 и cities универсам wealth 3 — РЕ-ПИН, §11),
sanitizeSpell-Book/restoreFromSave (save.test.js :231/:305/:557),
зачарование 'заклинание не изучено' без расхода (craft-core.test.js
:863).

## 6. Сейв — БЕЗ ИЗМЕНЕНИЙ

* hero.spells: раздел сейва уже есть (000045); sanitizeSpellBook
  (main.js:689-690 + spells.js:474) чистит подделанный сейв;
  save.version НЕ повышается, миграций НЕТ.
* Новые daily-марки — СУЩЕСТВУЮЩИЙ раздел buildingOncePerDay (000072),
  ключи 'x,y:40_spell'/'x,y:42_spell' (паттерн ':40'/':42' B21).
  restoreDayMap-валидация: effectId без ':'/','/пробелов — проходит.
* Е2 (red-тест): выучить → saveNow → новый boot → hero.spells
  deepEqual (bootWithSave, save.test.js :422).

## 7. Тесты (красные — 17, план red-стадии)

S1-S8 — свитки: S1 каталог 8 свитков (id/kind/effect/spell ∈
SPELLS_BY_ID, 1-2 на школу, все 6 школ, ITEMS-зеркало; tests/items.
test.js); S2 schema enum (tests/assets-schemas.test.js — самодействует);
S3 пулы 5 подземелий deepEqual (§2.3; tests/dungeon.test.js);
S4 useItem-успех (INT 11, fireball в hero.spells, totalQty 0); S5
низкий ранг (INT 10 → /нужен ранг школы «Знаток»/, totalQty 1);
S6 совершенствование без базового (INT 26, без fireball →
/базовое заклинание/, не потрачен); S7 дубль ('уже изучено', не
потрачен); S8 без G.Spells — без исключения, ok:false, предмет цел
(деградация). Node-тесты: globalThis.Game = { Spells:
require('../src/spells.js') } (паттерн craft-core.test.js :213-217,
delete в finally).
R1-R6 — руны: R1 реестр EFFECTS['40_spell']/['42_spell'] (имя
«Расшифровка (заклинание)», apply fn) + каталог `эффекты`
deepEqual ['40','40_spell']/['42','42_spell'] + `заклинания`-пулы
deepEqual (§3.1) + hasDailyLimit(c40,'40_spell')===true +
effectIds(getBuilding(40)) deepEqual ['40','40_spell'] (секция A,
tests/building-effects.test.js); R2 apply-успех (hero runes 2, INT 11,
spells ['spark','mend','frost_bolt'] → ok:true, success:true,
spellId ∈ canLearn('rune')-кандидатов, message, ЧИСТОТА deepEqual
state до/после — паттерн A49); R3 пустые кандидаты (runes 0, INT 1 →
ok:false, message-причина, r.spellId отсутствует, чистота); R4
(tile,day)-детерминизм (2 независимых apply → то же spellId;
golden spellId по (tile,day,hero) + RUNE_SPELL_SEED hex-пин — паттерн
A68; каталог-драйвен: синтетический catalog с другим `заклинания` →
другой кандидат-набор; деградация without Game → 'недоступно');
R5 e2e-камень (секция B full-chain, протокол B21 :6012: pre-seed на
камене (-25,34) день 1, hero {runes:2, intelligence:11,
spells:['spark','mend','frost_bolt']} → [E] → строка '40_spell'
«Расшифровка (заклинание)» (2-я, '40' — первая — regression) →
нажатие → owerлей закрыт, flash успеха, ЖИВОЙ hero.spells +=,
readSave: hero.spells содержит spell + buildingOncePerDay['-25,34:
40_spell']===1 → повтор в тот же день — disabled «уже использовано
сегодня»); R6 e2e-обелиск (аналогично, B22-протокол :6103; строка 1
'42' «Прикоснуться» + квест — БЕЗ ИЗМЕНЕНИЙ).
E1-E3 — e2e full-chain (index.html): E1 свиток → useItem →
G.createCombat + G.Spells.castSpell(c,'fireball', target) ok (формула
spells.js:476, мана −6, пул spellInt −1, hp моба ↓; tests/spells.
test.js — новый e2e-раздел, soloCombat-паттерн :497); E2 save/
respawn — hero.spells восстанавливается (tests/save.test.js,
bootWithSave); E3 выученное в зачаровании (tests/craft-ui.test.js,
CU-6-область :619: пикер содержит fireball; контроль — свежий hero +
fireball → «заклинание не изучено», без расхода — регрессия 000126).
Верификация RED: npm test — падают ТОЛЬКО 17 новых с осмысленными
причинами (нет каталожных записей/записей реестра/строк оверлея),
остальные 1616 зелёные (база 2026-10-05). Флейк чужого теста →
перепуск node --test tests/<файл> + запись в отчёт.

## 8. Мерж-карта (владение 000133, HEAD 375c0f4)

| файл | тип | конфликт-риск |
|---|---|---|
| assets/items/000043..000050.json, assets/items/schema.json | новые/правка | низкий |
| src/items-data.js | GENERATED (sync:items) | низкий (regenerable) |
| assets/dungeons/000001..000005.json, src/dungeons-data.js | правка | низкий |
| src/dungeon.js (FALLBACK_DUNGEONS :56-107) | правка | НИЗКИЙ: 000136 dungeon.js НЕ трогает |
| src/items.js (ITEM_KINDS/validateItem/useItem) | правка | средний |
| src/ui-tab-inventory.js, src/ui.js (itemTipText) | правка | низкий |
| src/player.js (комментарий :111-113) | правка | низкий |
| assets/buildings/000040/000042.json, src/buildings.js (sync) | правка | низкий (только здесь в волне) |
| src/building-effects.js (сид+2 хелпера+2 записи+экспорт) | правка | СРЕДНИЙ: общий с 000137 — разные записи, чистый rebase |
| src/building-effect-runes.js | НОВЫЙ | нет |
| index.html (1 тег + комментарий) | правка | низкий: слот общий с 000137 — union не-смежных тегов |
| tests: items/dungeon/building-effects(+A1)/index-order(+пин)/spells/save/craft-ui | новые секции + ре-пины | средний |
| memory/000133-spell-scrolls-runes.md, memory/000133-spell-learning.md | новые | нет |
| CHANGELOG.md (отдельный коммит, дата = день мержа) | правка | низкий |

Дельты аудита §6 (зафиксировано, не блокировка): (D1) ТЗ не упоминает
FALLBACK_DUNGEONS-литерал — правка dungeon.js обязательна (только
литерал, генерация/рендер не трогаются → пересечение с 000136 = 0);
(D2) аудит «index.html / index-order — только 000137» — неверно
после введения спец-модуля: 000133 тоже правит оба → union-ребейз
(теги/пины не-смежные). 000136 параллельно НЕ запущен по dungeon.js
(аудит: «туман: dungeon.js НЕ трогаем»).

## 9. Что важно будущим задачам

* Третий источник (наставники, «000133b») — ПОСЛЕ волн школ (аудит
  §4.2/4.3: Башня мага/Лаборатория/Монастырь/Храм исцеления/Храм
  горы); source 'mentor' в canLearn ГОТОВ (spells.js:145) — достаточен
  новый спец-модуль по шаблону src/building-effect-runes.js +
  каталожные `эффекты` у 5 построек (иды 16-24 — после их
  размещения, AUDIT §4.3). canLearn 'mentor' = проверки 'scroll'
  (ранг школы по атрибуту + базовое) — без Рунописи.
* Свитки НЕ продаются (виды магазинов) — будущая «Магаз магии»
  (аудит §4.23) при желании добавит 'spell_scroll' в `виды`.
* [T]-мини-меню (аудит §4.9) при реализации — добавит spell_scroll в
  whitelist combat.js:1086-1091.
* Рунные пулы 40/42 — каталог-драйвен (`эффект.заклинания`):
  баланс-правка = правка JSON + sync:buildings + ре-пин R1 — БЕЗ
  правки кода.
* RUNE_SPELL_SEED — экспорт для golden; смена семантики выбора
  (напр., «лучший доступный» вместо hash-выбора) = смена сида.
* Новые (tile,day)-сиды — СВОИ ASCII-константы (NE GLOBAL_SEED) —
  паттерн STONE_ROLL_SEED, не нарушает боевой/мировой RNG.

## 10. Подводные камни

* R1 (тройная синхронизация): JSON → sync → fallback-литерал →
  ре-пины → тест — пропуск ЛЮБОГО шага = красные (зеркало, fallback,
  golden). Порядок правки — как в §5.
* R2 (A1 UNION): на ребейзе — union с записью 000137 ('44_perform')
  по установленному паттерну: реестр после мержа содержит
  '44_perform' + '40_spell' + '42_spell', A1 обязан держать union
  обоих списков (UNION += '44_perform', '40_spell', '42_spell';
  MERGED += те же три — после мержа, когда всё смержено).
  git merge-tree сверен 2026-10-06: конфликты только в
  CHANGELOG.md (union записей 000135/000136/000137/000133 в
  «## 2026-10-05») и tests/building-effects.test.js (A1); прочие
  файлы — чистый auto-merge. REHEARSAL (2026-10-06, одноразовый
  клон /tmp, remote удалён, master 7823794 — уже с 000138):
  merge master + tip ветки, A1 — union выше, CHANGELOG — склейка
  в ОДНУ секцию «## 2026-10-05» (записи 000133 ПОСЛЕ записей
  master, перед «### Интерфейс»), sync:check — синхронно, полный
  npm test — 1694/1694/0. Для стадии мержа: та же резол-процедура;
  перед ребейзом перечитать git merge-tree (мастер мог сдвинуться
  — 000139 и следующие).
* R3 (R3-семантика '40' vs '40_spell'): провал XP-«Расшифровать»
  СГОРАЕТ (ok:true), провал «Расшифровки (заклинания)» НЕ сгорает
  (ok:false) — осознанно (ТЗ «действие не тратится»); ревью НЕ
  «чинить» в одну сторону (зафиксировано §3.2 п.4).
* R4 (UMD-порядок): тег после main.js → регистрация в НОВОМ
  Game-объекте → действие молча мертво; пин §3.5 обязателен.
* R5 (load-time валидация): items.js грузится ДО spells-data.js —
  spell id в каталоге свитков проверяется ТОЛЬКО тестами (S1) и
  canLearn при применении («неизвестное заклинание»).
* R6 (чистота apply): learn() строго в спец-модуле; mутация hero из
  apply → красный A49-deepEqual (в A-тестах hero ВНУТРИ state-снапа).
* R7 (порядок пула): вставка свитка в СЕРЕДИНУ массива `предметы`
  сдвинула бы индексы ВСЕХ подземелий; в конец — ре-пин только у
  ABYSS (единственный golden item).
* R8 (qty>1): свиток нестаккуемый — qty>1 невозможен из UI; ветка
  отказ — защитная (API useItem публичный).
* R9 (hasDailyLimit): верхнеуровневый boolean — лимит на КАЖДОЕ
  действие по своему ключу; если someday нужен «один на оба» —
  per-effect-объект { '40': true, '40_spell': true } (паттерн 49).
* R10 (название поля каталога): у заклинаний — `название` (НЕ `name`)
  — message-строки строят от SPELLS_BY_ID[id].название.
* R11 (A48/B21-порядок строк): '40'/'42' ПЕРВЫМИ в `эффекты` —
  иначе Digit1 и строки оверлея сдвинутся (regression B21/B22).
* R12 (FOG-C1, межд. мина 000136): пин «git diff по src/dungeon.js
  пуст» (HEAD + master...HEAD) УБРАН в 000133 (аудит §6 — прямо
  называл 000133): правка FALLBACK_DUNGEONS легитимна → условие
  «файл заморожен» мертво. Содержимое файла по-прежнему закреплено
  deepEqual-пинами 1:1 (dungeon.test.js + index-order DUNGEON_ITEMS).
  Файл: tests/dungeon-vision.test.js (коммент на месте пина).

## 11. Зелёная стадия — итоги (2026-10-05)

* Ребейз на свежий master (d9678c1, мержи 000132+000136 уже в
  master): перекрытие файлов с 000132/000136 = 0 → ребейз чистый,
  stash/pop зелёных правок без конфликтов. Сьют на новой базе:
  1655 тестов (1634 + 21 от 000132/000136).
* Сломанные красные (4 из 17, все — дефекты самих красных тестов,
  не реализации): E1 — волк maxHP 6 < dmg 10 (difficulties-скал) →
  assert «броня игнорируется» неопределён; ЗАМЕНА на cave_bear
  (maxHP 26, броня 1 — ignoreArmor реально проверяется: 10, а не 9).
  E2 — `__game.state.hero.inventory` (getter main.js) — ЖИВОЙ
  МАССИВ slots, а не объект инвентаря → мост оборачивает
  `{ slots: liveSlots, quick: [] }`. E3 — `C.CRAFT.push(fake)`
  регистрирует рецепт в РЕНДЕРЕ (C.CRAFT), но canCraft ищет по
  CRAFT_BY_ID (индекс, сборка в craft-data.js при загрузке) →
  «неизвестный рецепт» → disabled; FIX: `C.CRAFT_BY_ID[fake.id] =
  fake` + delete в finally.
* Ре-пины стоков (данные-последствия, прецедент 000060/000131):
  (a) items.test.js :670 (30,40,WEAPONS_SHOP,wealth 3): seed
  3346526313 тот же, 33 старых стока не сдвинулись, += 6 свитков
  (fireball 5, flame_burst 2, frost_bolt 2, blizzard 5,
  light_heal 4, vine 3; chill/magic_shield не выпали в этом (x,y)).
  (b) cities.test.js универсам (100,-40,7,5,44,3,wealth 3): seed
  3425630131, 38 старых не сдвинулись, += 8 свитков (fireball 1,
  flame_burst 2, frost_bolt 2, blizzard 2, chill 1, light_heal 2,
  magic_shield 2, vine 2 — там весь хвост выпал). Правило:
  wealth 3 = allItems() → ЛЮБЫЕ новые предметы сдвигают эти два
  golden (концом каталога — без пересортировки старых).
* FOG-C1 (R12) — убран, коммент-объяснение на месте.
* ABYSS-golden (dungeon.test.js :298-299) — БЕЗ ПРАВОК, как
  предсказано §5.1 (c1.item = 'phoenix_feather' — индекс 1 в пулах
  5 и 7 совпадает).
* Итог: 1654/1654 зелёные (FOG-C1 убран → −1 от 1655).

# 000046 — Крафт в игровом коде (каталог assets/craft, 000024/000044)

Реализовано по каталогу `assets/craft` (19 рецептов, source of truth)
и разделу SPEC.md «Крафт». Тесты: tests/craft-core.test.js (красные),
tests/items.test.js, tests/save.test.js, tests/index-order.test.js.
Формулы ЦЕЛИКОМ в шапке src/craft.js и красных тестах — в SPEC их нет
(паттерн 000045).

## Модули

* `src/craft-data.js` — ГЕНЕРИРУЕМОЕ зеркало каталога
  (`scripts/sync-craft-data.js`, стиль sync-spells-data; `npm run
  gen:craft`). Экспорты: `CRAFT` (массив в порядке файлов) и
  `CRAFT_BY_ID` (строится ЦИКЛОМ от CRAFT — те же объекты, как
  SPELLS_BY_ID в 000045: идентичность важна). В браузере —
  `Game.CraftData`.
* `src/craft.js` — ядро, чистый код без DOM. В браузере —
  `Game.Craft` (именованное пространство) + санитайзеры в КОРЕНЕ
  Game (`Game.sanitizeCraftLevels`, `Game.sanitizeCraftXp`) — main.js
  restoreFromSave читает их именно из корня (красный тест grep'ит
  литерал `G.sanitizeCraftLevels`). Guards с console.error
  (паттерны 000038/000045): нет CraftData → player API
  (createCharacter, derived, skillXpForNext) → items API
  (addItem, canAddItem, removeItem, hasItem, getItem) → B.getBuilding
  → Sp.getSpell → console.error + Game.Craft НЕ создаётся
  (тест index-order).
* Экспорты (21): CRAFT, CRAFT_BY_ID, CRAFT_TYPES, CRAFT_TYPE_SKILL,
  SKILL_CRAFT_TYPE, typeBuildings, craftOf, craftLevel,
  craftXpForNext, craftCap, addCraftXp, reprocessCraftXp,
  bookCraftXp, canMentorCraft, mentorCraft, canCraft, craft,
  qualityChance, yieldChance, sanitizeCraftLevels, sanitizeCraftXp.

## Правила (зафиксированы красными тестами)

* Уровни: `c.craft {вид: 1..100}` (лениво, craftOf), копилка
  `c.craftXp {вид: int≥0}`. Порог = `craftXpForNext = 15×(L+1)`
  (= player.skillXpForNext).
* Потолок практикой: `craftCap = (secondary[skill] || primary[skill]
  || 0) × 2`. Таблица CRAFT_TYPE_SKILL: кузнечное_дело→forge,
  алхимия→alchemy, резьба_по_камню→runes, столярное_дело→dexterity
  (ОСНОВНОЙ!), зачарование→runes, рунопись→runes. SKILL_CRAFT_TYPE —
  обратная карта БЕЗ runes (один навык — три вида: для
  reprocessCraftXp('runes') перебираются все три вида; конфликт
  отложен, см. SPEC-таблицу).
* addCraftXp(c, type, amount, ignoreCap) — зеркало
  player._gainSkillXp: на потолке applied=0, копилка НЕ растёт,
  reason 'потолок практикой' (при ignoreCap — 'максимальный уровень'
  на 100). reprocessCraftXp(c, skillId) — зеркало
  player.reprocessSkillXp (рост навыка выше потолка → перелив).
  ВЫЗЫВАЕТСЯ при росте навыка (правки ревью, раунд 1): player.js —
  raiseSkill (основной И вторичный) и _gainSkillXp (практика/книги,
  только при leveledUp), npc.js schoolTrain (школа) — через ЛЕНИВЫЙ
  хук craftReprocessHook (globalThis.Game.Craft при ВЫЗОВЕ; player.js
  загружается ДО craft.js — UMD 000038; паттерн хука bookCraftXp в
  items.js; в node без Game.Craft — no-op, тест задаёт явно).
* Опыт за изготовление: `10 + recipe.уровень`, практика (с потолком).
* canCraft/craft — ОДНА причина, общий evalCraft, порядок проверок:
  неизвестный рецепт → «персонаж погиб» (pre-check по c.alive,
  правки ревью раунд 2) → «недостаточный уровень (нужно N)» →
  «в этом здании такой способ не изготавливается» (только если
  building != null; тип рецепта ∈ typeBuildings(здание)) → «не
  хватает: <название>» (первый недостающий исходник ПО ПОРЯДКУ
  рецепта) → блок заклинаний (только если тип зачарование ИЛИ
  o.spellId != null): «для этого рецепта нужно заклинание» / «в этом
  рецепте нет такого заклинания» / «неизвестное заклинание: X» /
  «заклинание не изучено» (чистое чтение Array.isArray(c.spells) —
  p.spells НЕ создаёт) / «не хватает маны (N)» →
  ЁМКОСТЬ (capacityCheck — см. ниже; ПОСЛЕ проверки исходников, ДО их
  расхода — атомарность). canCraft — без побочных эффектов, без rng.
* ЁМКОСТЬ (правки ревью, раунд 1 — баг «бесплатный предмет» +
  нарушение зеркала 000037): capacityCheck — dry-run ХУДШЕГО СЛУЧАЯ
  последовательности мутаций на ТЕКУЩЕМ инвентаре (исходники ещё
  внутри — консервативно: после расхода их место только прибавится).
  Сценарии: результат в ОБОИХ состояниях слота (с бонусом качества —
  отдельный слот; состояние бонуса меняет слияние с существующими
  стопками — и без; оба проверяются, если качество МОЖЕТ выпасть,
  т.е. qualityChance>0) + 1 выходной поверх каждого (если
  yieldChance>0). dryRunAdd — на КЛОНЕ слотов (реальный addItem; c не
  мутирует). Причины: какой-то сценарий не влез по слотам → «нет
  свободных слотов инвентаря» (приоритет: checkAdd — слоты ДО веса),
  иначе по весу → «слишком тяжело (лимит веса)». Следствие: canCraft
  ok ⇒ craft ВСЕГДА ok (какой бы ролл) — «бесплатного» основного
  результата быть не может; canCraft fail ⇒ craft fail с ТОЙ ЖЕ
  причиной. Бонус — craftBonus(c, recipe, spell, quality): общий для
  craft() (quality = результат ролла) и capacityCheck (quality = «может
  ли выпасть»); значение детерминировано (множитель из навыка, степень
  из каталога).
* craft(): кость КАЧЕСТВА раньше кости ВЫХОДА (scripted-rng тесты).
  Качество: база→1; building==null→0; иначе
  `min(0.5, 0.05+0.005×(L−1))`. Выход: база→1; иначе
  `min(0.25, 0.02+0.002×(L−1))` (в поле то же). Мутации ПОСЛЕ всех
  проверок: removeItem исходников → addItem результат (с bonus;
  rollback исходников при отказе) → +1 выходной (rollback) →
  `c.mp -= spell.мани` → addCraftXp. Возврат {ok, item, qty,
  quality, extra, bonus?, spell?, xp:{applied, level, leveledUp,
  total, reason?}}.
* Бонус качества: +1 к ГЛАВНОМУ стату результата (weapon→damage,
  armor→armor, potion/food→amount) × множитель навыка-потока
  (forge→equipmentDurabilityMult, alchemy→potionPowerMult,
  runes→runePowerMult, dexterity→1), `max(1, round(...))`. Реагенты/
  книги — бонуса нет (validBonus отклонит).
* Зачарование: тип ТРЕБУЕТ заклинание (defolt = первое
  recipe.заклинания; o.spellId переопределяет). Добавка по
  spell.действие: урон→weapon damage += степень, защита→armor armor
  += степень, лечение→potion/food amount += 1+степень;
  ослабление/контроль — без предмета-бонуса (но мана тратится,
  xp даётся). Заклинание СКЛАДЫВАЕТСЯ с качеством в том же слоте.
* Наставники: canMentorCraft порядок: неизвестный вид →
  «персонаж погиб» (pre-check по c.alive, правки ревью раунд 2) →
  «не обучает крафт» → «не обучает этот вид крафта» →
  «нет постройки этого вида»
  (npc.постройки ∩ typeBuildings(вид)) → «максимальный уровень» (ДО
  золота) → «мало золота (нужно N)». Успех: gold −= цена,
  `c.craft[вид] = min(100, уровень+1)` (ПОТОЛОК ПРАКТИКОЙ НЕ
  ДЕЙСТВУЕТ — наставник = «книги и наставники» из SPEC).
* Санитайзеры: sanitizeCraftLevels — известные виды, int≥1, кламп
  100, иначе {}; sanitizeCraftXp — известные виды, int≥0, иначе {}.

## Инвентарь: бонусные слоты (правки items.js, аддитивно)

* `bonus` — поле СЛОТА (не предмета): ровно один ключ — главный стат
  kind-а (bonusKeyFor: weapon→damage, armor→armor, potion/food→
  amount), int≥1. validBonus/bonusState.
* Бонусные экземпляры ИЗОЛИРОВАНЫ от обычных стопок того же id:
  addItem заполняет только стопки с тем же id И тем же bonusState;
  sanitizeInventory мержит так же. Обычный предмет НЕ заполняет
  bonus-слот и наоборот.
* canAddItem — dry-run тех же проверок addItem (слоты + вес) БЕЗ
  мутации (используется крафтом для атомарности).
* removeItem(c, id, qty, bonusFirst=false): порядок удаления НЕ
  менялся (с конца, по референсу, splice indexOf) — только
  bonusFirst берёт группу бонусных слотов первой (внутри — с конца).
* equip: берёт ПЕРВЫЙ слот в порядке слотов (не bonusFirst!):
  первый экип с [bonus, regular] → bonus; после unequip
  [regular, bonus] → regular (красный тест «второй экип — обычная
  копия»). Слот удаляется прямым splice (ровно та копия).
  `c.equipmentBonus {weapon, armor}` (ensureEquipmentBonus);
  equipmentStats складывает бонусы; unequip возвращает бонус в
  слот addItem(id, 1, bonus).
* useItem: bonus-копия расходится ПЕРВОЙ (removeItem ...true);
  heal/mp/eat — per-unit: первые bonusUnits ед. получают +bonus.
  skill_book: ленивый хук `globalThis.Game.Craft.bookCraftXp` (в
  node — no-op).

## Порядок загрузки (UMD-ловушка 000038)

index.html: `… spells.js < craft-data.js < craft.js < dungeon.js …`
(player.js/items.js/buildings.js/spells.js ДО; combat-ui.js/main.js
ПОЗЖЕ — они снимают `const G = globalThis.Game` один раз). Закрыто
тестом index-order (vm-цепочка + guard битого порядка; 21 экспорт).

## Сейв

* `hero.craft`, `hero.craftXp`, `hero.equipmentBonus` — ОПЦИОНАЛЬНЫЕ
  поля без повышения версии (000031). main.js restoreFromSave
  читает санитайзеры из КОРНЯ Game (см. выше); старому сейву —
  дефолты {} / {weapon:null, armor:null}.
* `__game.state.hero` — проекция: добавлены craft/craftXp/
  equipmentBonus (иначе тесту не было из чего читать).

## Баги, найденные в красных тестах (исправлены в тестах, не в коде)

1. addCraftXp: forge=10 (потолок 20) при L=10 «на потолке» —
   невозможно (потолок = навык×2 закреплён тестами craftCap:
   runes 7→14). Фордж 10→5 (потолок 10→22), все последующие
   под-ассерты согласованы только с 10→22.
2. CRAFT_TYPES: ожидание не в порядке .sort() (UTF-16: «з» < «к»):
   алхимия, ЗАЧАРОВАНИЕ, кузнечное_дело, …
3. «качество»: персонажам не хватало уровня рецепта (iron_sword — 2,
   leather_armor — 3) → добавлен c.craft.
4. «инвентарь»: сравнитель сортировки ставит объекты ПЕРВЫМИ —
   ожидание [undefined, {damage:2}] невозможно → [{damage:2},
   undefined].
5. «слишком тяжело»: wood_sword = 1 кг (29+1=30 — влезает ровно);
   1.5 кг — у iron_sword → заменён предмет.
6. save.test.js: assert/strict deepStrictEqual на объектах из
   vm-сэндбокса (чужой Object.prototype) падает при равных значениях
   → JSON-рондтрип `host()` (тот же паттерн global-settings.
   test.js).

## Найден и исправлен баг 000045 (potential data loss)

main.js restoreFromSave: `G.sanitizeSpellBook` — undefined в КОРНЕ
Game (spells.js вешает санитайзер в `Game.Spells`) → при КАЖДОЙ
загрузке сейва книга заклинаний сбрасывалась в []. Исправлено на
`G.Spells && G.Spells.sanitizeSpellBook`. (Тесты 000045 этого не
ловили: они либо не проходили roundtrip с непустой книгой, либо
ожидали именно [].)

## Правки по итогам ревью (раунд 1)

1. craft(): «бесплатный предмет» + нарушение зеркала (баг 1+2
   ревью). Корень: evalCraft проверял ёмкость canAddItem(результат)
   на ТЕКУЩЕМ инвентаре — без бонуса (бонусный слот изолирован) и без
   +1 выхода, тогда как мутации craft: исходники → результат (с
   бонусом) → +1 выходной. Последствия: (a) отказ на выходе
   возвращал исходники, но ОСНОВНОЙ результат оставался в инвентаре
   (предмет бесплатно); (b) canCraft ok + craft fail, когда кость
   качества дала бонус (свой слот) при полном инвентаре. Исправлено:
   capacityCheck (см. «ЁМКОСТЬ» в «Правилах») + craft() при (недостижимом)
   отказе на мутациях — полный rollback инвентаря (снимок
   слотов/quick ДО мутаций, restore при отказе — а не точечный
   «вернуть исходники»: бонусные слоты изолированы, точечный
   removeItem мог снять ЧУЖИЕ копии). Тесты: «ёмкость: выход (+1)
   …», «ёмкость: бонусный слот …» (tests/craft-core.test.js).
2. reprocessCraftXp — мёртвый код (ревью 3): задокументирован как
   «вызывается при росте навыка» (зеркало player.reprocessSkillXp,
   которое ДЕЙСТВИТЕЛЬНО вызывается из raiseSkill), но в игровом коде
   не вызывался НИКТО → опыт в c.craftXp у «потолка практикой» не
   конвертировался при росте связанного навыка. Исправлено: ленивый
   хук craftReprocessHook (см. «Правила», reprocessCraftXp) в
   player.js (raiseSkill — основной и вторичный; _gainSkillXp —
   практика/книги при leveledUp) и npc.js (schoolTrain). Тест:
   «reprocessCraftXp: вызывается из player.js при росте навыка
   (очки/практика/школа)».

## SPEC.md (правки этой задачей)

* «Игрового кода пока нет…» → «Игровой код реализован (задача
  000046): …» (паттерн раздела «Заклинания»).
* Потолок практикой: формулировка «уровень связанного ВТОРИЧНОГО
  навыка» неверна для столярного дела (dexterity — ОСНОВНОЙ) →
  «уровень связанного навыка (обычно вторичного; для столярного
  дела — основного) × 2» + таблица вид→навык (runes у трёх видов).
* Числовых формул в SPEC НЕ добавлено.
* UI крафта — отложен в задачу 000126 (правки ревью, раунд 2):
  примечание в SPEC.md «Крафт» (см. «Отсрочка UI» ниже).

## Отсрочка UI (правки ревью, раунд 2)

Пункт 000046 «UI: экран крафта» ссылался на задачу 000030
(модернизация экранов) — ОШИБКА: 000030 закрыта
(tasks/done/000030.md) и покрывает ТОЛЬКО экран боя; крафтовый
экран не покрыт ни одной pending-задачей (проверено). Создана
tasks/pending/000126.md (follow-up 000046: экран крафта у
постройки + обучение видам в диалоге NPC + зачарование).
Перепривязка: в ветке была 000123 — на master уже занята
(on-screen-кнопки [E]/[I]); 000124 — переформат экрана боя.
Отсрочка
задокументирована: SPEC.md «Крафт» + этот файл + файл задачи.
До 000126 крафт и mentorCraft недостижимы из UI (существует только
логика; единственный путь в игру — bookCraftXp через useItem
книги и хуки reprocessCraftXp).

## Правки по итогам ревью (раунд 2)

1. craft()/canCraft не отклоняли МЁРТВОГО персонажа: evalCraft не
   имел pre-check по alive — craft() проходил все проверки и
   выполнял ВСЕ мутации (исходники сняты, результат в инвентаре,
   мана), и лишь addCraftXp давал reason «персонаж погиб»
   (applied 0); canCraft при том же персонаже — ok:true
   (нарушение зеркала). Исправлено: evalCraft — pre-check
   «персонаж погиб» после «неизвестный рецепт» (и craft и canCraft
   — одна причина, без мутаций); canMentorCraft — тот же pre-check
   после «неизвестный вид» (иначе mentorCraft снимал золото и давал
   +1 уровень погибшему — уровень ставится напрямую, addCraftXp не
   в цепочке). Причина — та же, что в addCraftXp/player.js. Тест:
   «craft: мёртвый персонаж — отказ (pre-check, без мутаций)»
   (tests/craft-core.test.js).
2. main.js restoreFromSave: фикс 000045 (hero.spells через
   G.Spells.sanitizeSpellBook — не G.sanitizeSpellBook, undefined в
   корне Game; data loss: книга сбрасывалась в [] при каждой
   перезагрузке) НЕ имел регрессионного теста (vm-тест save.test.js
   восставлял hero с spells: ['spark'], но не ассертит книгу).
   Исправлено: tests/save.test.js — (a) vm-ассерты:
   state.hero.spells === ['spark'] после restore И в
   сериализованном герое (roundtrip); «старый сейв» (hero.spells
   отсутствует — {spells: undefined} выбывает из JSON) → [];
   (b) статический тест проводки расширен: hero.spells →
   G.Spells.sanitizeSpellBook. Для (a) в ПРОЕКЦИЮ
   __game.state.hero (main.js) добавлено поле spells
   (паттерн craft/craftXp/equipmentBonus — иначе тесту не из чего
   читать); hero.spells всегда массив (createCharacter и
   restoreFromSave).

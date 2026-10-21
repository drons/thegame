# 000232 — Изучение видов крафта + свитки/чертежи: контракт

Станция ПРОЕКТИРОВАНИЕ (2026-10-20). Worktree task/000232, база
master ffc4b15. ТЗ — tasks/pending/000232.md (source of truth, 6 строк,
без секций — все решения зафиксированы здесь). Анализы — a1-domain.md /
a3-tests.md (/tmp/thegame-wf-000232/); выводы a2-arch — в резюме
workflow (файл a2-arch.md на диске отсутствует).

ТЗ дословно: (1) рецепты крафта необходимо изучать, неизученные — не
отображаются в диалогах крафта; (2) особый вид предметов (свитки/
чертежи) — при использовании персонаж изучает соответствующий ВИД
КРАФТА, в JSON предмета — явная ссылка на JSON рецепта; (3) свитки —
у NPC, в сундуках, с мобов.

## 1. Решения (все openQuestions закрыты)

### D0. Граничность изучения — УРОВЕНЬ ВИДА (не рецепта)
ТЗ-строка 2 дословно: «изучит соответствующий вид крафта». Свиток
ссылается на ОДИН представительский рецепт вида (явная ссылка —
жёсткое требование ТЗ, строка 2); использование изучает ВСЁ ВИД.
Почему: (a) ТЗ дословно; (b) готовый RED-план a3 (17 тестов) построен
на по-видовой семантике (learnCraftType(type)); (c) данных ровно 6
(по виду) против 31 (по рецепту); (d) явная ссылка на рецепт остаётся
смысленной — она задаёт и имя предмета, и вид, и якорь.

### D0b. Семантика «изучен» — явное множество + прогресс (совместимость)
«Вид изучен» ⇔ И: `c.craftTypes[type]` (новое явное множество, объект
`{тип: true}`) ИЛИ: есть запись `c.craft[type]` (уровневая —
mentorCraft/craft()/bookCraftXp пишут) ИЛИ: `c.craftXp[type] > 0`.
Почему: свежий герой — 0 изученных (ТЗ: неизученное скрыто); старый
сейв/средний персонаж НЕ регрессирует (прогресс = знание — типы,
 которыми пользовался, видны и после апдейта); версия сейва НЕ
поднимается (v1, опциональное поле, прецедент craft/craftXp 000046);
минимум репинов — фикстуры craft-ui CU-4/5/6/E3 ставят `c.craft =
{тип: N}` → проходят без правок; craft-core репины только у тестов на
«голом» createCharacter (нет записи). Запись `c.craftXp[type] = 0`
без `c.craft[type]` достижима только ПУТЁМ уже изученного вида
(гейт evalCraft) — правило `> 0` достаточное и безопасное.

### D0c. Гейт — в ядре, ОДНА точка: evalCraft
После alive-пре-чека, ДО проверки уровня: `if (!isTypeLearned(c,
recipe.тип)) return { fail: { ok: false, reason: 'вид не изучен' } };`
canCraft/craft наследуют причину (зеркало 000037 не нарушено —
одна причина в обоих). craft-ui render() — ФИЛЬТР отображения
(ТЗ-строка 1) по тому же предикату. mentorCraft/bookCraftXp гейта НЕ
получают (ТЗ не требует; наставник/книга — способ роста в уже
изученном виде). Почему в ядре (а1 рекомендовал UI-only): RED-план
a3 CL-3 тестирует гейт ядра; единая причина держит зеркало
craft/canCraft; UI-обход (API-вызов) не крафтит неизученное.

### D0d. API craft.js (UMD → корень Game, коллизий нет — проверено grep)
* `isTypeLearned(c, type)` → boolean (предикат D0b; чисто).
* `learnedCraftTypes(c)` → string[] отсортированный массив изученных
  видов (UI/тесты).
* `learnCraftType(c, type)` → `{ok:true}` | `{ok:false, reason:
  'неизвестный вид крафта: <type>' | 'вид уже изучен'}`. Мутация
  ТОЛЬКО на успехе: `c.craftTypes = c.craftTypes || {};
  c.craftTypes[type] = true`. Повтор (в т.ч. «уже изучен» по
  совместимости D0b) — отказ, состояние не мутирует (двойное
  обучение исключено; свиток при отказе НЕ тратится — прецедент
  000133).
* `sanitizeCraftTypes(v)` → `{тип: true}`: не-объект/массив → {};
  ключи вне CRAFT_TYPE_SKILL отброшены; значение → truthy = true.
  JSON-совместимо (объект — как hero.craft).
В return craft.js += 4 функции (merge в корень Game).

### D1. Поле-ссылка свитка — effect-форма (решение a2)
JSON: `effect: { kind: 'craft_recipe', recipe:
'assets/craft/NNNNNN.json' }` (ЯВНАЯ файловая ссылка — ТЗ).
Зеркало src/items-data.js: `recipe` в id-форме (резолв при сборке,
конвенция 000208/000211: ссылки живут ТОЛЬКО в JSON). Почему
effect (а не top-level `craft` как в a1): все существующие
свитки/расходники — effect-форма (spell_scroll `{kind:'spell',
spell}`, resurrection_scroll `{kind:'resurrect'}`); itemTipText /
validateItem / useItem уже ветвятся по effect.kind — ноль новых
паттернов.
* schema.json: kind enum += 'craft_scroll' (append концом, 12→13);
  effect.kind enum += 'craft_recipe'; effect.properties +=
  `recipe: { type: 'string', pattern: '^assets/craft/\\d{6}\\.json$'
  }` (опционально; additionalProperties:false сохранён).
* scripts/sync-items-data.js: после чтения файла — если
  `data.effect.kind === 'craft_recipe'` и typeof recipe string:
  resolveRef(ROOT, recipe) (scripts/lib/json-ref.js — REF_RE уже
  включает craft-каталог); !ok → console.error(`<file>:
  <причина>`) + exit 1 (паттерн sync-craft-data refId); ok →
  data.effect.recipe = id. KEYS НЕ меняется ('effect' уже в KEYS).
  Идемпотентность/атомарность не трогаются.
* items.js validateItem (mirror — id-форма!): ветка craft_scroll —
  `effect.kind === 'craft_recipe'` и `recipe` по формату id
  `^[a-z][a-z0-9_]*$`, иначе throw; каталожность id — при применении
  (ленивый Game) + тесты (прецедент spell_scroll L235-243:
  items.js грузится РАНЬШЕ craft-data.js — index.html L1060 < L1103).
* items.js: ITEM_KINDS += CRAFT_SCROLL: 'craft_scroll';
  EFFECT_KINDS += CRAFT_RECIPE: 'craft_recipe'; STACKABLE не
  меняется (нестаккуем, прецедент spell_scroll 000133).

### D2. useItem / useQuickUnit (ветки craft_scroll)
useItem — ПОСЛЕ блока spell_scroll, ДО resurrection_scroll:
qty>1 → «свиток: по одному»; ленивый `G = globalThis.Game` в момент
ВЫЗОВА; `C = G && G.Craft`; !C || typeof C.learnCraftType !==
'function' → `{ok:false, reason:'крафт недоступен'}` (тихий no-op,
console.error НЕ ставить — прецедент spell_scroll/000133; игра не
падает, 000053); `r = C.CRAFT_BY_ID && C.CRAFT_BY_ID[it.effect.
recipe]`; !r → «неизвестный рецепт: <id>»; `chk = C.learnCraftType(c,
r.тип)`; !chk.ok → `{ok:false, reason: chk.reason}` (ОТКАЗ ДО расхода:
«вид уже изучен» — свиток цел); успех → `removeItem(c, it.id, 1,
true)` → `{ok:true, name: it.name, craft: r.тип, message: 'Изучено: «'
+ r.название + '»'}`. Цель обучения — c (носитель инвентаря = герой;
learnTarget НЕ применять — это прецедент заклинаний 000147, крафт —
hero-only).
useQuickUnit — симметричная ветка (после spell_scroll, до
resurrection): те же guard/learnCraftType, БЕЗ removeItem (расход —
у вызывающего, 000223).
«Использовать» в UI (ui.js L273 G.useItem) подхватывается
автоматически.

### D3. itemTipText (ui.js, в цепочке kind-веток после spell)
`else if (it.effect.kind === 'craft_recipe')`: `C = G.Craft`;
`r = C && C.CRAFT_BY_ID && C.CRAFT_BY_ID[it.effect.recipe]`
(typeof-guard); `lines.push('Эффект: изучает вид крафта «' +
(r ? r.тип : it.effect.recipe) + '»')` (деградация без каталога —
id/тип из effect, паттерн spell-ветки L399-407).

### D4. Пустой экран крафта — подсказка
craft-ui.js render(): фильтр рецептов +=
`(C.isTypeLearned ? C.isTypeLearned(hero, r.тип) : true)`
(typeof-guard — деградационный паттерн L247). Если после фильтра
рецептов нет — в bodyEl строка `el('p', 'craft-hint', …)` с ДВУМЯ
текстами (правки по ревью 2026-10-20): НИ ОДНОГО вида не изучено
(или нет C.isTypeLearned — деградация) — 'Виды крафта не изучены.
Свитки и чертежи (торговцы, сундуки, лут мобов) открывают целый
вид.' (пин UCL-1, текст не менять); изученные виды ЕСТЬ, но ни
одного рецепта их нет в этом здании (пример: у героя алхимия,
открыт Дом кузнеца) — 'В этом здании нет изученных видов крафта.'
(нейтрально: старая формулировка «не изучены» в этом случае
игроку не точна — виды-то изучены, просто не этого здания; пин
UCL-4). Детектор 2-го случая —
`C.isTypeLearned && C.CRAFT_TYPES.some((t) => C.isTypeLearned(hero, t))`
(в ветке подсказки recipes.length уже 0, т.е. ни один изученный вид
не дал рецептов здания). Секции с 0 рецептов и заголовки
неизученных типов НЕ показываются (строго ТЗ: никакого контента
неизученного). Строка
«Крафт» в building-actions ОСТАЁТСЯ (пины building-effects
['40','40_spell','craft'] безопасны — они про строки здания, не про
тело экрана). CSS: `.craft-hint` в craft-блоке <style> index.html
(приглушённый цвет, центрирование; ruleExact-пины craft-layout по
другим селекторам не трогаются; G2-гард .cp-*/.combat-* не тронут).

### D5. NPC — 6 продавцов, по одному свитку на вид (статичный сток,
без RNG)
| NPC (id) | свиток | почему «соответствующий» |
|---|---|---|
| Торн (blacksmith) | blueprint_forge | ЕДИНСТВЕННЫЙ живой наставник кузнечного: Карк (arena_master) НЕ может менторить (арена 7 ∉ typeBuildings['кузнечное_дело'] = {8,25}) |
| Мила (apothecary) | blueprint_alchemy | продаёт зелья/реагенты |
| Грота (armor_merchant) | blueprint_enchant | зачарование = доспехи с заклинанием (knight_plate) |
| Зира (magic_merchant) | blueprint_runecraft | продаёт skill books — прецедент продажи «знаний»; руны = магическое начертание |
| Хольд (wanderer_merchant) | blueprint_carving | торговец камнем/рудой (stone_chunk) |
| Кочевник (camp_wanderer) | blueprint_woodwork | лагерь-лес-дерево |
Торн: НОВОЕ поле «торговля» (у него сейчас его нет) + строка диалога
`{ "id": "trade", "текст": "Снаряжение", "действие": "торговля" }`
ПОСЛЕ «train» (enum действий npc/schema.json уже содержит
«торговля» — схема не меняется; синтетическая ментор-опция
«обучить <вид>» — отдельный механизм dialogOptions, не задета).
Остальные 5 — append записи в торговля.предметы КОНЦОМ массива
(000133 S3). Цены: цена_покупки 120 / цена_продажи 60 / количество 1
(выше skill books 53-63 з — свиток учит ЦЕЛЫЙ вид; один на продавца,
без респауна — сток статичен). npc-refs пины: trade 40→46, total
44→50, unique 35→41 (6 новых уникальных предметов, каждый — ровно 1
слот).

### D6. Сундуки — каждый свиток РОВНО в одном пуле, append КОНЦОМ
«предметов» (000133 S3): Склеп (000002, id 1): blueprint_alchemy +
blueprint_carving; Руины (000003, id 2): blueprint_forge +
blueprint_woodwork; Затопленная (000004, id 3): blueprint_runecraft;
Бездна (000005, id 4): blueprint_enchant; **простая пещера (000001,
id 0) — БЕЗ ИЗМЕНЕНИЙ** (a2). Тематическая связка с мовами пулов
(rot/bone_coloss — склеп; orc_warrior/troll — руины; imp —
затопленная). БЛАСТ-RADIUS: main-rng `items[floor(rng()*len)]` —
лишь у изменённых типов; пины состава сундуков есть ТОЛЬКО у ABYSS и
CAVE → репины ТОЛЬКО ABYSS (golden (11,3)/xp=2000 c1, D-BOSS-2 ×3
сценария, 000230.05 L2714-сценарий — проверить), CAVE D-BOSS-3 —
бит-в-бит (пул не тронут). Chest-eq-rarity (salt 0x0E5C) и залежи
(salt 0x0DE5) не трогаются (свитки без slot → ветка редкости не
срабатывает; deposits — отдельный поток). FALLBACK_DUNGEONS в
src/dungeon.js — синхронно 1:1 (4 пула += свитки; pin index-order
:597 DUNGEON_ITEMS[4] репин; :565 live-эквивалентность —
автоматически).

### D7. Мобы — 6 мобов, по одному свитку, chance 0.05, append КОНЦОМ
loot-таблицы (a2-выбор; все 6 — в игре, таблицы непустые, НИ ОДИН не
закреплён составами — wolf/abomination/orc_mad/centipede НЕ ТРОГАТЬ):
| моб (скилл) | свиток | связь скилл→вид |
|---|---|---|
| orc_warrior (heavy) | blueprint_forge | SKILL_CRAFT_TYPE.heavy = кузнечное |
| rot (alchemy) | blueprint_alchemy | SKILL_CRAFT_TYPE.alchemy |
| bone_coloss (golem) | blueprint_carving | кость/камень → резьба |
| troll (leader) | blueprint_woodwork | лес → дерево |
| fire_elemental (firelord) | blueprint_enchant | огонь → зачарование |
| imp (runes) | blueprint_runecraft | SKILL: runes (маппинг в SKILL_CRAFT_TYPE исключён намеренно — один навык на три вида; вид — тематический) |
ДВУХФАЙЛОВЫЙ lockstep: assets/mobs/*.json (loot — строка-ссылка
`{ "item": "assets/items/000077.json", "chance": 0.05 }`) + МОБИЛЬНОЕ
ЗЕРКАЛО ВРУЧНУЮ в src/combat.js MOB_TYPES (id-форма `{ item:
'blueprint_forge', chance: 0.05 }`) — sync-скрипта НЕТ; deepEqual-
зеркальный тест combat.test.js (refToId loot) ЗАСТАВИТ синхронизировать.
RNG: 1 c._rng() на запись таблицы → сдвиг потока ТОЛЬКО этих мобов;
закреплённых лут-голденов у них НЕТ (N2a/EQ4/EQ5/C6 — wolf/
abomination не тронуты) → репинов combat-голденов 0.
LOOT_BASE_POOL/LOOT_RARE_POOL (N6) не редактировать.

### D8. Совместимость старых сейвов — вариант (a) + D0b
Миграции НЕТ, CURRENT_VERSION = 1, save.js не меняется. Старый сейв
без hero.craftTypes → {}; изученность — через прогресс (D0b):
персонаж с craft/craftXp-записями видит свои виды, «пустой» герой —
ничего (ТЗ-строго). Никаких «базовых рецептов по умолчанию» (не
предписано ТЗ; инвариант «не больше, чем просит ТЗ»).

### D-items. 6 предметов 000077-000082 (append концом каталога,
нестаккуемые, weight 0.2, value 80, icon assets/sprites/items/<id>.svg)
| файл | id | name | effect.recipe (JSON) | вид (через рецепт) |
|---|---|---|---|---|
| 000077 | blueprint_forge | Чертёж: кузнечное дело | assets/craft/000001.json (iron_sword) | кузнечное_дело |
| 000078 | blueprint_alchemy | Чертёж: алхимия | assets/craft/000004.json (healing_potion) | алхимия |
| 000079 | blueprint_carving | Чертёж: резьба по камню | assets/craft/000013.json (stone_chisel) | резьба_по_камню |
| 000080 | blueprint_woodwork | Чертёж: столярное дело | assets/craft/000011.json (wood_sword) | столярное_дело |
| 000081 | blueprint_enchant | Чертёж: зачарование | assets/craft/000008.json (hunting_bow) | зачарование |
| 000082 | blueprint_runecraft | Чертёж: рунопись | assets/craft/000019.json (moonstone_runes) | рунопись |
Якорь = ПЕРВЫЙ (низший уровень) рецепт вида — входная точка, без
заклинаний. Имя «Чертёж: <вид>» (ТЗ-альтернатива «свитки/чертежи»;
«Свиток:» — у spell scrolls, не смешиваем). desc (тон spec/items.md):
«Изучает вид крафта «<вид>»: его рецепты появляются в диалоге крафта.»
Новых РЕЦЕПТОВ нет (свитки ссылаются на существующие — R1 «ровно 31»
craft.test.js безопасен).

### D-icons. 6 иконок — НОВЫЙ каталог assets/sprites/items/
Каталога пока не существует (schema-паттерн уже допускает (loot|items);
33 текущих иконки — в loot/). Силуэт: свиток/чертёж на 64×64 —
скатанный пергамент + акцент вида (палитра — flat-полигоны +
тень-эллипс, стиль loot-иконок): forge #c96f3b (уголёк), alchemy
#5aa469 (травяная), carving #8d8fa0 (камень), woodwork #a07c4f
(дерево), enchant #5a7fd6 (арканика), runecraft #8f6fd6 (аметист).
ОБЯЗАТЕЛЬНО: пройти tests/svg.test.js (обход подхватит авто; правила —
well-formed + корень svg + xmlns + viewBox + без NaN) ДО коммита.
Иконки нужны: a3 CR-6 + itemRow-рендер (000237: `if (row.icon)` —
путь из JSON как есть; без иконки — fallback, но требование CR-6).

## 2. Контракты и границы

* Гейт: evalCraft, ПОСЛЕ `!c.alive`, ДО уровня. Причина — РОВНО
  «вид не изучен». canCraft/craft/UI наследуют (одна причина,
  зеркало 000037). mentorCraft/bookCraftXp/canMentorCraft — НЕ
  гейтятся.
* Изученность (D0b): `c.craftTypes[type]` ИЛИ `c.craft[type] !==
  undefined` ИЛИ `c.craftXp[type] > 0`. craftLevel-дефолт 1 НЕ делает
  вид изученным (записи нет — не изучен).
* learnCraftType: мутация только на успехе (c.craftTypes). Повтор —
  отказ «вид уже изучен» (проверка через isTypeLearned —
  совместимость учитывается!).
* Свиток: нестаккуем, qty>1 — отказ; отказ ДО расхода (повтор/
  неизвестный рецепт/нет Game.Craft); успех — ровно 1 шт списано.
* JSON-форма ссылки — ТОЛЬКО в assets (files ref); mirror/runtime —
  id-форма. Сбитая ссылка — sync exit 1 (дрейф-гейт 000054 +
  assets-refs AR8/AR9 авто).
* Сейв: hero.craftTypes — опциональное поле v1 (объект {тип: true});
  restore: `G.sanitizeCraftTypes` (с корня Game — UMD merge) с
  дефолтом {}; проекция __game.state.hero += craftTypes (паттерн
  craft/craftXp/equipmentBonus L3562-3564).
* UI: фильтр в render() (r.здания ∩ learned); пустой экран —
  .craft-hint; строка «Крафт» у здания не гаснет.
* Источники: NPC-сток статичен (RNG 0); сундуки — main stream,
  append концом пула; мобы — per-mob запись, append концом таблицы.
  Новые SOLTED-роллы НЕТ (data-only в существующие потоки).

## 3. Ленивые ссылки и guards

* items.js totalQty (ВНЕ-ТЗ защитная правка, зафиксирована
  правками по ревью 2026-10-20): читает слоты БЕЗ мутации —
  c.inventory — объект {slots, quick} (живой герой) ИЛИ undefined →
  `ensureInventory(c).slots` (путь байт-в-байт как до 000232),
  ИЛИ МАССИВ слотов (проекция state.hero — паттерн craft/craftXp) →
  читает массив; ensureInventory на массиве мутировал бы снимок
  (добавил .quick) и упал с TypeError на .reduce. Нужна для SV-2
  (craftUI.open с проекцией state.hero → render → G.hasItem →
  totalQty). ТЗ эту защиту не просит (деградация-краш превращён в
  read-only) — future-задачи, тронувшие totalQty/проекции
  hero.inventory, СОХРАНЯЮТ оба пути.
* items.js useItem/useQuickUnit: ленивый globalThis.Game В МОМЕНТ
  ВЫЗОВА (items.js грузится ДО craft-data.js/craft.js — index.html
  L1060 vs L1103-1104 — каталог/ядро при загрузке НЕ доступны);
  guard !C → тихий отказ «крафт недоступен» (без console.error —
  прецедент spell_scroll; игра не падает, 000053).
* ui.js itemTipText: typeof-guard на G.Craft/CRAFT_BY_ID
  (деградация — id из effect).
* craft-ui.js render(): typeof-guard на C.isTypeLearned
  (деградация — фильтр отключён, экран как раньше — для цепочек без
  актуального craft.js).
* main.js restore: `G.sanitizeCraftTypes ? … : {}` (UMD-паттерн
  000045 — санитайзер читаем с корня Game).
* sync-items-data.js: resolveRef без бросаний (structural result),
  console.error + exit 1 на !ok.

## 4. Красные тесты (a3-план, 17 тестов / 5 файлов, expectedRedCount=17)

* tests/craft-learn.test.js (node): CL-1 API (isTypeLearned/
  learnedCraftTypes/learnCraftType/sanitizeCraftTypes; свежий герой —
  0; sanitize мусора); CL-2 learnCraftType (идемпотентно-разово,
  неизвестный — отказ без мутации); CL-3 гейт ядра (craft/canCraft —
  «вид не изучен» одной причиной, исходники не тратятся; после
  learnCraftType — успех).
* tests/craft-scrolls.test.js (node): CR-1 kind/схема (ITEM_KINDS,
  enum, recipe-паттерн, additionalProperties:false); CR-2 каталог
  (ровно 6, подряд после 000076, по одному на каждый из 6 видов,
  вне STACKABLE, ссылка резолвится, mirror ≡ JSON (ref→id)); CR-3
  useItem успех (вид изучен, 1 шт списан, flash «Изучено: «…»»);
  CR-4 отказ «уже изучен» (НЕ потрачен, состояние не мутирует); CR-5
  деградация без Game.Craft (console/отказ, краха нет, 000053);
  CR-6 иконки (6 × assets/sprites/items/<id>.svg, файл есть, правила
  svg.test.js).
* tests/craft-ui-learned.test.js (vm, полная CHAIN из index.html,
  паттерн 000231 unlearned-spells-hidden): UCL-1 свежий герой — 0
  строк рецептов (+hint, 1-й текст D4); UCL-2 after useItem свитка —
  ТОЛЬКО рецепты его вида; UCL-3 два вида — объединение,
  неизученных ни заголовков ни строк, building-intersection
  сохранён; UCL-4 (правки по ревью) — изучен вид, но рецептов его
  нет в открытом здании — 0 строк/секций + 2-й (нейтральный) текст
  D4.
* tests/craft-scroll-sources.test.js (node): SRC-1 NPC (каждый из 6 —
  ≥1 продавец, цена>0; наставник Торн продаёт кузнечный); SRC-2
  сундуки (≥1 пул содержит, mirror dungeons-data ≡ JSON, fallback
  синхронен); SRC-3 мобы (≥1 источник, существующие RNG-потоки
  бит-в-бит — data-only).
* tests/craft-learn-save.test.js: SV-1 sanitize + roundtrip + старый
  сейв без поля → {} + version 1/миграций нет (000046/000093); SV-2
  vm e2e: свиток → saveNow → load → вид изучен (диалог показывает
  рецепты; проекция hero.craftTypes читается).
RED-критерий: падают ТОЛЬКО эти 17 (missing exports / пустые
фильтры / assertion-red), сьют загружается чисто (ленивые require +
vm CHAIN), остальные ~2720 — зелёные (репины — GREEN-стадия).

## 5. Ре-пины (GREEN-стадия; ассерт-СТРОКИ не ослабляются)

1. tests/craft-core.test.js: фикстуры, доходящие до craft()/canCraft()
   на персонаже БЕЗ записи вида — += `p.craftTypes = {тип: true}`
   (~15-20 точек; «мёртвый персонаж» НЕ затронут — alive-чек раньше;
   «недостаточный уровень/не хватает/заклинание» — затронуты, гейт
   раньше).
2. tests/items.test.js: «ровно 76» ×4 (L1245/L1283/L1385/L1389) → 82;
   E9-гард (L2131) 76→82; E5 kind-enum 12→13 (append
   'craft_scroll'); зеркальный deepEqual (L61-79) — маппинг
   j.effect.recipe ref→id ПЕРЕД deepEqual (паттерн refToId);
   L3-пин 000158.02 «прочие 43» → 49 (у свитков loot undefined —
   ассерт проходит, число растёт); I1-пин 000211.06: «прочие 43» —
   +skip-сет 6 id (паттерн REAGENTS_000220), «icon — ровно у 33» → 39;
   makeShop-универсам golden (30,40 w=3, пул allItems) — += 0-6
   ключей rng-хвостом (прецедент 000133/000165: существующие ключи не
   сдвигаются).
3. tests/npc-refs.test.js L111-115: trade 40→46, total 44→50, unique
   35→41.
4. tests/dungeon.test.js: ABYSS-только — golden (11,3)/xp=2000 (c1
   item), D-BOSS-2 ×3 (item-поля сундуков), сценарий 000230.05
   L2714 (проверить: mobs/deposits бит-в-бит, item-поля — по
   симуляции); CAVE D-BOSS-3 — БИТ-В-БИТ (пул 0 не тронут).
5. tests/index-order.test.js :597: fallback DUNGEON_ITEMS[4] +=
   'blueprint_enchant' (концом); :565 live-эквивалентность —
   автоматически.
6. tests/craft-ui.test.js — ОЖИДАНИЕ: без правок (CU-4/5/6/E3 ставят
   c.craft-записи → изучены по D0b); проверить в GREEN, если
   неожиданно красное — только setup-изучение.
7. svg.test.js — ПРАВКА ЕСТЬ (e7de7cb): EXPECTED_SVG_BY_DIR +=
   'sprites/items': 6 — иконки чертежей (tests/svg.test.js L465);
   «НЕТ правок: … svg.test.js» в этом пункте — неверно (ретро-
   20261021 finding 6; поправка — 000232.01). Остальные НЕТ
   правок: craft.test.js (31 рецепт), save.test.js (v1),
   assets-refs (sweep авто), index-order order-пины (новых
   модулей нет), craft-layout (ruleExact по другим селекторам),
   building-effects (строки здания), combat.test.js (лут-голдены
   — закреплены другие мобы).

## 6. Важно будущим задачам (из ТЗ-ссылок и контрактов)

* Изученность — НОВЫЙ гейт «до уровня»: будущие рецепты/виды
  автоматически гейтятся (evalCraft); новый вид крафта (7-й) —
  расширяет CRAFT_TYPES/CRAFT_TYPE_SKILL + sanitize/learnCraftType
  подхватят по CRAFT_TYPE_SKILL (ничего не хардкодится по числу
  видов).
* effect.kind 'craft_recipe' — ЕДИНСТВЕННЫЙ эффект свитка крафта;
  recipe — id-форма в mirror (файл-ссылка — только в JSON).
* assets/sprites/items/ — НОВЫЙ каталог иконок предметов (первый
  контент); future-иконки предметов — туда же (schema уже допускает).
* Торн (blacksmith) — ПЕРВЫЙ NPC с «обучение» И «торговля» одновременно;
  будущие NPC с обоими блоками — тот же паттерн.
* Двойное представление лута мобов (assets/mobs JSON + MOB_TYPES
  вручную) — lockstep обязателен; future-задачи с mob-loot — помнить
  обе точки.
* Совместимость D0b (прогресс = знание) — future-фичи изучения
  (например, рецептное изучение, дерево) должны учитывать, что
  c.craftTypes — явное множество, а c.craft/c.craftXp — «старые»
  доказательства.
* totalQty items.js (вне-ТЗ правка 000232, ревью) — hero.inventory
  читает и как ОБЪЕКТ {slots,quick} (живой герой), и как МАССИВ
  (проекция state.hero, read-only); future-задачи, тронувшие
  totalQty/hasItem/проекции hero.inventory — сохранять оба пути
  (детали — §3).

## 7. Подводные камни

1. Зеркальный deepEqual items.test.js (L61-79) без refToId-маппинга
   effect.recipe — красный (R3 a1). Маппинг ОБЯЗАТЕЛЕН.
2. evalCraft-гейт ДО уровня: craft-core-тесты на «голом» героине
   краснеют «вид не изучен» — репины фикстур (не ассертов) в GREEN.
3. learnCraftType «уже изучен» — проверять через isTypeLearned
   (совместимость!), а не только c.craftTypes — иначе свиток тратится
   на вид, «изученный» прогрессом.
4. sync-items-data: резолв ДО генерации; KEYS не менять ('craft'
   top-level НЕ появляется — поле внутри effect); порядок enum'ов —
   append концом (E5-пин).
5. MOB_TYPES вручную: JSON ↔ зеркало = deepEqual-тест; форма —
   id-строки + chance; append концом таблицы (порядок = rng-порядок).
6. ABYSS-репины — только item-поля (позиции/золото/мобы/deposits не
   сдвигаются: число rng-вызовов то же, меняется только индекс
   выбора); CAVE не трогать (D-BOSS-3 бит-в-бит).
7. FALLBACK_DUNGEONS — синхронно с JSON (4 пула), иначе
   index-order :597/fallback-тест.
8. index.html: НОВЫХ <script> НЕТ (index-order order-пины); только
   .craft-hint в <style> (craft-layout ruleExact-пины — другие
   селекторы, G2 — .cp-*/.combat-*).
9. svg-иконки — ПРОВАЛИТЬ svg.test.js ДО добавления в assets (well-
   formed + xmlns + viewBox + без NaN; парсер строгий: неэкранированные
   & / < — ошибки).
10. CHANGELOG.md — общий файл с параллельными workflow
    (конфликт-кандидат) — мерж-окно; отдельный коммит.
11. Один worktree = один полный npm test (memory no-parallel-full-
    tests); 000054 мутирует src/npc-data.js в чужих сьютах.
12. useQuickUnit — БЕЗ removeItem (расход у вызывающего, 000223);
    асимметрия с useItem — не баг.

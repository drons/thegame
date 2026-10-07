# 000147 — Единое изучение заклинаний для всех членов партии

Станция: ПРОЕКТИРОВАНИЕ (финальная архитектура и контракты).
ТЗ: `tasks/pending/000147.md`. Анализы: a1-domain / a2-arch
(design-000147.md) / a3-tests (/tmp/thegame-wf-000147/).
Контракты-родители: memory/000133-spell-learning.md, memory/000133-
spell-scrolls-runes.md, memory/000139-skill-unification.md (§2/§4 C2/§6.7/
§9.1), memory/000145-active-character.md, memory/000146-efir-tab-
removal.md.

## §1 Статус / состав / зависимости

* База worktree: master **7306ca3** (000146 смержен; 000143/144/145/146 в
  базе). Тестовый базлайн на базе: **1813/1813** зелёных.
* **master СОДВИНУЛСЯ в процессе работы**: 000163 («Воскрешение») смержен —
  **dd9c0e8** (после нашей базы). Ребейз на master ПЕРЕД мержем ОБЯЗАТЕЛЕН.
  Дельта 000163 (name-only): src/spells.js, src/spells-data.js (16→17
  заклинаний: +resurrect), src/efir.js (EFIR_SPELL_UNLOCKS 8→9: +[22,
  'resurrect']), src/combat.js (+resurrectAlly), assets/spells/000017.json,
  tests (spells +435, efir*, save, ui-tab-skills-active B6 10→11 строк,
  ui-tabs-efir-removed R3 10→11). Пересечение с НАШИМ диффом: **0 файлов**
  (we don't touch ни один из файлов 000163; tests/ui-tab-skills-
  active.test.js правим НЕ мы — конфликта на ребейзе нет). ПОСЛЕ РЕБЕЙЗА:
  каталог заклинаний = 17 (resurrect), канон. книга Эфира = 11 строк —
  наш UI-код data-driven (читает efirSpellsByLevel(1) + EFIR_SPELL_
  UNLOCKS), хардкода 10/11 НЕТ; resurrect в пулах наставников/рун НЕ
  числится → avail-строки не появляется.
* 000133 = **de3fcac** смержен (СТРОГО-зависимость выполнена): generic-
  АПИ canLearn/learn (src/spells.js L147-185) ЦЕЛЫ (сверено: носитель-
  агностичны — p.spells любой массив, p.primary[spell.атрибут], p.
  secondary.runes для 'rune'; source 'mentor' = проверки 'scroll'),
  источники героя на месте: items.js spell_scroll (L519-539), building-
  effects.js applyRuneSpell (L958-1000) + runeSpellPool (L928-938),
  building-effect-runes.js handleRuneSpell (L68-89), тег index.html
  L916, каталоги 40/42 (эффект.заклинания).
* Параллельно В РАБОТЕ (worktree существуют): **000162** (red-фаза:
  только tests+memory; далее — building-effect-resurrect.js + каталоги
  36/37/38 + EFFECTS['resurrect'] + тег index.html + re-пины — см. §7),
  000149 (combat-ui.js + иконки assets/spells — 0 пересечений), 000167
  (combat.js очередь хода — 0 пересечений: боевой каст наёмных/Эфира —
  СУЩЕСТВУЮЩИЙ механизм, combat.js не трогаем).
* Line-drift ТЗ (сверено с кодом 7306ca3):
  * «SPEC L1009-1014» → фактически **L1068-1083** («Книга заклинаний»:
    заголовок L1068; источники L1070-1077: книга/свиток L1071-1072,
    наставник L1074, руна L1076).
  * «combat.js L1354-1365 / L1460-1473» → фактический боевой каст
    союзников: allyHeal L1586+, strongestKnown L1694+ (combat.js) —
    МЕХАНИЗМ тот же (u.spells), НЕ ТРОГАТЬ.
  * «база worktree = master 0397799» → было 7306ca3 на старте → dd9c0e8
    на ребейзе.
  * «Вызовов canLearn/learn в src/ — 0» → СТАЛО: вызовы есть (000133):
    items.js L530/533, building-effect-runes.js L84. Красное ДО 000147 =
    источники ЗАПЕЧАНЫ НА ГЕРОЕ (c / ctx.hero / st.hero), НЕ отсутствие
    источников.
  * «hardcode kind==='hero' в новом слое» → литерала НЕТ: герой-запекание
    СТРУКТУРНОЕ (носитель = владелец инвентаря / hero из ctx / hero из
    apply-state) — обобщение = подмена носителя на резолв активного.
* Состав работы (по файлам) — см. «План реализации» (после §9).

## §2 Решения (D1-D12)

* **D1. Резолвер активного = НОВЫЙ модуль `src/learn-target.js`,
  `Game.LearnTarget = { activeSheet(hero) }`** — ОДНА точка разрешения
  для всех источников. Почему: 4 потребителя (ui.js-панель, applyRune-
  Spell, handleRuneSpell, handleMentorSpell) получают идентичную логику
  без триплирования; НОЛЬ правок main.js/building-actions.js (минимальная
  поверхность мержа — 000162/000167 рядом); UMD-образец cities.js/
  dungeon.js (чист при загрузке, снапшот G0 один раз, все чтения — лениво
  через rootRef в момент вызова).
* **D2. Hero-fallback: `activeSheet(hero)` возвращает ПЕРЕДАННЫЙ hero
  при отсутствии playerUI/`__game.state`/Game.Party** (и при пустой
  партии). Почему: держит зелёными S4-S8 (node, globalThis.Game={Spells}),
  R2-R6/RUNES-U1-U2 (ctx.world.game без LearnTarget), E1 (полная цепь,
  activeCharId=null → Party.active → первый = hero), R5/R6 (hero-партия);
  id=null/''/stale → Party.active → первый (контракт 000145: дефолт —
  Флогистон, тихий fallback).
* **D3. hero-member ВСЕГДА — live-ссылка ВЫЗЫВАЮЩЕГО** (c в items.js,
  ctx.hero в спец-хендлерах, st.hero в apply). Почему: `__game.state.hero`
  — СНАПШОТ (getter строит НОВЫЙ объект при каждом доступе, L2566-2585:
  только level/xp/hp/gold/inventory/spells/… — НЕТ primary/secondary →
  canLearn прочитал бы level 0 → отказ ВСЕГО); efir/roster/efirMet в
  state — live-ссылки/значения — их и берём.
* **D4. Обобщение источников:**
  * **Свиток**: `useItem(c, itemId, qty = 1, learnTarget = null)` —
    4-й ОПЦИОНАЛЬНЫЙ аргумент = sheet, на КОТОРОГО изучение; предмет
    расходуется ВСЕГДА из инвентаря `c` (герой — носитель инвентаря;
    learnTarget — только лист для bookOf, НИКОГДА не владелец
    инвентаря — иначе ensureInventory на чужом листе сломал бы save-
    layout). Панель: ui.js doItemAction 'use' → `G.useItem(c, id, 1,
    LearnTarget.activeSheet(c))` (helper в ui.js). **Боевой quick-slot
    (combat.js) — БЕЗ 4-го аргумента → герой** (поведение 000133
    НЕ ИЗМЕНЯЕТСЯ; combat.js — территория 000167, 0 правок). Все
    существующие вызовы (2/3 аргумента) — T = c → побайтово как ДО.
  * **Руна**: applyRuneSpell — кандидаты и (в хендлере) learn идут в
    ОДИН sheet `learner = LearnTarget.activeSheet(st.hero) || st.hero`
    (picked=learned — ключевой семантический шов: фильтр кандидатов и
    обучение — один носитель, иначе picked мог оказаться неучимым).
  * **Книга**: предметов-книг изучения заклинаний НЕТ (fire_spellbook/
    ice_spellbook 000027/28 — kind 'skill_book', effect skill_xp — ДРУГАЯ
    механика); source 'book' в canLearn остаётся зарезервированным и
    НЕИСПОЛЬЗОВАННЫМ; UI «доступные» показывает источники свиток/руна/
    наставник.
  * **Эфир**: авто-разблокировки (EFIR_SPELL_START + EFIR_SPELL_UNLOCKS,
    append-only) СОХРАНЕНЫ — единое изучение ДОБАВЛЯЕТ в тот же
    sheet.spells (learn = push), ничего не отменяет; ранг школы — от его
    primary (Int/Wis, старт 3/3/3/1/1/1 — 000144). efir.js = 0 правок.
  * **Наёмные**: изучение в live-sheet roster-записи (companions.js) →
    боевой каст подхватывает АВТОМАТИЧЕСКИ (allyDataForEntry
    `spells: entry.sheet.spells.slice()` → makeAlly → strongestKnown/
    allyHeal); serializeRoster персистирует sheet.spells (000143).
* **D5. 'mentor' (000133b закрыт здесь) — 5 школ по SPEC L1074: 17
  Лаборатория алхимика, 18 Башня мага, 19 Монастырь, 21 Храм исцеления,
  38 Храм горы.** Новый каталожный ключ `особые_параметры.наставник =
  { заклинания: [...], цена: N }` (НЕ `эффект`: у 38 `эффект` — СТРОКА
  («Благословение: +1 броня на 1 день») → catalogEffect вернёт null;
  у 17-21 `эффект` отсутствует вовсе; отдельный ключ — единообразно
  для всех 5 и без конфликта с 000162 (эффекты/раз_в_день у 38)).
  effectIds **'<id>_mentor'** (латиница+подчёркивание — проходит guard
  registerSpecial, building-actions.js:64, как '40_spell'). **Цена = 50
  золота, единая** (якорь: NPC-обучение навыков 20-30/уровень, герой
  старт 100; каталог-драйвен — правка JSON пересчитает). Золото — С
  ГЕРОЯ (общая казна партии: gold — поле героя; наёмный/Эфир gold-поля
  не имеют; списание в хендлере `ctx.hero.gold -= price` — прецедент
  building-actions ctx.hero «gold — паттерн 000075»). **БЕЗ daily-лимита**
  (оплата — ограничитель; SPEC «за золото», не «раз в день»): 17/18/19/21
  `раз_в_день` отсутствуют вовсе; 38 — boolean→пер-эффектный объект
  `{ "38": true }` (благословение побайтово; ключа '38_mentor' НЕТ =
  лимита нет, fail-open 000092). NPC-наставника (диалог, персона NPC) НЕ
  СУЩЕСТВУЕТ: `типичный_npc` — строка; npc.js «обучение» — обучение
  НАВЫКАМ героя за монеты (L139-155), к заклинаниям не относится —
  NPC-часть SPEC («раздел NPC, обучение») — **ОТСРОЧКА** (волны школ),
  зафиксировано как SPEC-отклонение в отчёте. 17/18/19/21 — БЕЗ
  map_index (дормант до волн «Школы», audit §4.3): действие появится у
  постройки, постройка на карте НЕ генерируется; 38 — достижим (подтип
  слота 8). Имя действия — «Обучение (наставник)» (паттерн «Расшифровка
  (заклинание)»). Пространство craft-mentor (000126, 'mentor_<вид>' —
  NPC-диалоги крафта) — другое, пересечений НЕТ.
* **D6. Выбор заклинания наставника — детерминированный ПЕРВЫЙ
  learnable-кандидат в порядке пула** (`pool.find(id => canLearn(learner,
  id, 'mentor').ok)`), БЕЗ RNG-сид. Почему: наставник «учит следующее
  доступное» — предсказуемо для игрока; проще (tile,day)-хеша руны (тот
  для «случайной выгравированной руны»); отказ при пустых кандидатах —
  {ok:false} БЕЗ марки (день не сгорает, повтор доступен — семантика
  000133). Отказ «недостаточно золота» — БЕЗ марки (повтор в тот же день).
* **D7. UI «Книга заклинаний»: avail-строки НОВЫМ классом `.cp-availrow`
  (НЕ `.cp-itemrow`) + заголовок `.cp-avail-title`**, display-only,
  БЕЗ кнопок (read-only, как learned-строки; изучение — через предмет
  [I] / постройку [E]). Почему: пины B6 (ровно N .cp-itemrow у Эфира),
  B7 (2 / 1 «—» строка, button===null), R3 (то же) — зелёные БЕЗ
  репинов; ТЗ не требует кнопок. Источники — каталог-драйвен (лениво в
  render, порядок фиксирован: свиток → руна → наставник): свиток —
  ИНВЕНТАРЬ героя (slots → G.ITEMS kind 'spell_scroll', effect.spell);
  руна — постройки с `особые_параметры.эффект.заклинания` (40/42);
  наставник — с `особые_параметры.наставник.заклинания` (17/18/19/21/38).
  Строка — для каждого НЕ ВЫУЧЕННОГО заклинания каталога (порядок
  G.SpellsData.SPELLS) с ≥1 источником; для Эфира — кроме канонических
  (старт + UNLOCKS — читаются из G.efir, data-driven: 10 на базе, 11
  после 000163). Meta: «<источник-первый>: <статус>»; статус —
  «доступно» если canLearn(sheet, id, key).ok у ЛЮБОГО существующего
  источника, иначе canLearn.reason ПЕРВОГО (для руны reason включит
  «нужна Рунопись N»). Заклинание без источников — строки НЕТ.
* **D8. `src/spells.js` — НОЛЬ правок.** canLearn/learn уже generic
  (D-сверка §1); «src/spells.js — минимально (только если generic не
  хватает)» — не хватает. Flash-сообщения 000133 БЕЗ ИЗМЕНЕНИЙ («Изучено:
  «Имя»» items.js, «Расшифровано: «Имя»» — из applyRuneSpell r.message,
  приоритет роутера 000128); НОВОЕ сообщение наставника — из apply:
  «Наставник передал: «Имя»» (та же схема: r.message → flash роутера).
* **D9. index.html:** тег `src/learn-target.js` — МЕЖДУ day.js (L792) и
  items.js (L793) (ДО снапшотов ui.js L857 и main.js L950 — в снапшотах
  потребителей; коммент «задача 000147»); тег `src/building-effect-
  mentor.js` — в слоте спец-модулей ПОСЛЕ building-effect-runes.js
  (L916), ПЕРЕД hud.js (L922) (коммент «задача 000147»); CSS-блок
  .cp-availrow/.cp-avail-title — после `.cp-itemrow .cp-btn` (L106),
  соуп-коммент 000147. Пины — tests/index-order.test.js (§5).
* **D10. НОЛЬ изменений (подтверждено, не трогать):** src/spells.js,
  src/combat.js, src/companions.js, src/efir.js, src/main.js, src/party.
  js, src/building-actions.js, src/npc.js, assets/spells/*, формат сейва
  (sheet.spells уже персистируется: 000143 roster fresh-copy / 000144
  efir / 000045 hero.spells sanitizeSpellBook; «активный» — per-session,
  000031 — новых полей НЕТ), боевой quick-slot (герой, D4).
* **D11. Тесты:** 10 RED в НОВОМ `tests/spells-any-party.test.js` (AP-1..
  AP-5 + AP-M1..M3 node, AP-6/AP-7 vm) — ленивый require внутри тела
  тестов (паттерн 000133: отсутствие модуля падает каждым тестом на
  своём assert, а не crash-ом файла). Технических правок — ДВЕ:
  tests/building-effects.test.js A1 (UNION/MERGED += 5 mentor-id,
  осознанный re-pin с комментом) + tests/index-order.test.js (+2 модуля
  в «нужные» + 2 позиционных пина — НОВЫЕ тесты, не ре-пин). B6/B7/R3,
  E1, S4-S8, R1-R6, RUNES-U1/U2, HARDCODED CHAINs (ui-skills/ui-panel/
  squad-panel), save/companions/efir/combat-тесты — БЕЗ ПРАВОК (fallback
  D2 + отдельный CSS-класс D7).
* **D12. Пулы наставников (контент, каталог-драйвен; union = ВСЕ 16
  заклинаний каталога базы → любой член партии в принципе выучит любое —
  цель 000139 «тех же заклинаний»):** 17 Лаборатория алхимика (огонь):
  ['fireball','flame_burst','inferno']; 18 Башня мага (огонь+лёд):
  ['spark','frost_bolt','blizzard']; 19 Монастырь (тень): ['chill',
  'shadow_bolt']; 21 Храм исцеления (исцеление+природа): ['mend',
  'light_heal','greater_heal','vine','nature_blessing']; 38 Храм горы
  (защита): ['magic_shield','stone_skin','ward']. После ребейза 000163 —
  каталог 17: 'resurrect' в пулах НЕ ЧИСЛИТСЯ (авто-разблокировка Эфира,
  не область наставника — иначе зависимость-обратка).

## §3 Контракты

### 3.1 Game.LearnTarget.activeSheet(hero) — src/learn-target.js

UMD (образец src/party.js L21-29): node — `module.exports = factory()`
→ `{ activeSheet }`; браузер — `root.Game = Object.assign({}, G0, {
LearnTarget: factory() })`. При загрузке: НОЛЬ DOM/require/console/
чтений Game-данных (только G0-снапшот для Object.assign).

```
activeSheet(hero) → object (sheet, live-ссылка)
  hero не-object/мусор → вернуть как есть (degrade).
  rootRef = globalThis (стабильная ссылка; объект Game ЗАМЕНЯЕТСЯ
  модулями — актуальный — в rootRef.Game в момент ВЫЗОВА).
  G = rootRef.Game;
  (1) !isObj(G) || !isObj(G.Party) || typeof G.Party.list !== 'function'
      || typeof G.Party.active !== 'function' → return hero.
  (2) id = isObj(G.playerUI) && typeof G.playerUI.getActiveCharId ===
      'function' ? G.playerUI.getActiveCharId() : null;   // null/'' ok
  (3) st = isObj(rootRef.__game) ? rootRef.__game.state : null;
      (state — GETTER: новый обёрточный объект при каждом доступе;
       efir/roster — live-ссылки, efirMet — значение, hero — СНАПШОТ
       (не использовать, D3)); !isObj(st) → return hero.
  (4) npcs = isObj(G.NpcData) && Array.isArray(G.NpcData.NPCS)
      ? G.NpcData.NPCS : [];
  (5) members = G.Party.list({ hero,                     // live —
           efir: isObj(st.efir) ? st.efir : null,        // вызывающего
           efirMet: st.efirMet === true,                 // гейт 000145
           roster: Array.isArray(st.roster) ? st.roster : [],
           npcs });
  (6) m = G.Party.active(members, id);
      return (m && isObj(m.sheet)) ? m.sheet : hero.
```

Fallback-цепочка (все → hero): нет Game.Party; нет `__game.state`;
партия = [hero] (roster пуст + Эфир не встречен); id stale/неизвестный →
первый (hero). **Без console.error** (чистый data-путь: отсутствие
__game — норма node-тестов; битый порядок тегов пино index-order).
Efir-гейт: Party.list включает Эфир ТОЛЬКО при efirMet===true (Эфир
СОЗДАЁТСЯ при загрузке, main.js L231-234 — без гейта fresh-игра дала бы
«активный = не встреченный Эфир»); stale id 'efir' при efirMet=false →
fallback на hero.

Потребители (4 шва, все — `LearnTarget.activeSheet(hero) || hero`
с typeof-guard на activeSheet):
* ui.js `doItemAction` case 'use' (панель, вне боя):
  `r = G.useItem(c, id, 1, activeSheetFor(c))`;
  `activeSheetFor(c)` — локальный helper (G.LearnTarget — в снапшоте
  ui.js: тег learn-target.js РАНЬШЕ ui.js; без LearnTarget — c).
* building-effects.js `applyRuneSpell`: learner в canLearn-фильтре
  (G = lazyGame() — уже ленивый в момент вызова).
* building-effect-runes.js `handleRuneSpell`: learn на learner
  (через `ctx.world.game.LearnTarget` — снапшот main.js, в нём
  LearnTarget — тег ДО main.js).
* building-effect-mentor.js `handleMentorSpell`: то же (новый модуль).

### 3.2 src/items.js — useItem

`function useItem(c, itemId, qty = 1, learnTarget = null)` — ветка
spell_scroll (L519-539):
```
const T = (learnTarget && typeof learnTarget === 'object' &&
           !Array.isArray(learnTarget)) ? learnTarget : c;
const chk = S.canLearn(T, it.effect.spell, 'scroll');
if (!chk.ok) return { ok: false, reason: chk.reason };   // ДО removeItem
S.learn(T, it.effect.spell, 'scroll');
removeItem(c, it.id, 1, true);                            // ВСЕГДА с c
```
message 'Изучено: «название»' — БЕЗ ИЗМЕНЕНИЙ (S4-пины /Изучено/i).
Остальные ветки useItem — не трогаются. Сигнатура-изменение —
аддитивное (4-й аргумент опционален; все текущие вызовы 2/3-арг).

### 3.3 src/building-effects.js — руна + наставник

* `applyRuneSpell(st)` (L958-1000) — ЕДИНСТВЕННОЕ изменение:
  после `const hero = st && st.hero` (гард как есть):
  ```
  const LT = G.LearnTarget;
  const learner = (LT && typeof LT.activeSheet === 'function')
    ? LT.activeSheet(hero) : hero;
  const cands = pool.filter((id) => G.Spells.canLearn(learner, id,
    'rune').ok);
  ```
  остальное побайтово: hash2(x, y, RUNE_SPELL_SEED ^ day) % cands.length,
  message, purity (state не мутирует). БЕЗ activeSheet — fallback st.hero
  (R-пины зелёные).
* НОВОЕ (вставка в rune/000133-регион, ПОСЛЕ applyRuneSpell, ДО
  applyObelisk-региона НЕ влезает — блок «Задача 000147» рядом с
  rune-блоком EFFECTS):
  * `mentorSpellPool(st)` — ЧИСТОЕ чтение `st.catalog.особые_
    параметры.наставник` (прототип-безопасно, 000029): не-объект/
    `заклинания` не-массив/пусто/элемент не-строка → null; валидно →
    `{ pool: string[], price: finite number ≥ 0 || 0 }`.
  * `applyMentorSpell(st)` — ЧИСТОЕ apply:
    guards (lazyGame().Spells.canLearn, st.hero object, pool) →
    `{ ok:false, message:'недоступно' }`;
    `learner = LearnTarget.activeSheet(hero) || hero` (typeof-guard);
    `picked = pool.find(id => G.Spells.canLearn(learner, id, 'mentor')
    .ok) || null`;
    пусто → `{ ok:false, message:'Наставник: новых заклинаний нет
    (ранг школы/базовое)' }` (ОТКАЗ БЕЗ марки);
    `st.hero.gold < price` (gold — hero, D5) → `{ ok:false, message:
    'недостаточно золота' }` (БЕЗ марки, gold не тратится);
    успех → `{ ok:true, success:true, spellId, price, message:'
    Наставник передал: «название»' }` (getSpell-название, fallback id).
    ЧИСТО: hero НЕ мутирует (списание — хендлер).
  * Реестр:
    ```
    EFFECTS['17_mentor'] = { имя: 'Обучение (наставник)',
      apply: (st) => applyMentorSpell(st) };
    // ... '18_mentor', '19_mentor', '21_mentor', '38_mentor' — то же
    ```
    `разВДень` в записях НЕ ставится (D5 — без лимита; каталог решает:
    17-21 — флага нет; 38 — объект без ключа '38_mentor').
  * Экспорт (return-блок L2601+): `applyMentorSpell, mentorSpellPool`
    (сид НЕ нужен — D6).
* `RUNE_SPELL_SEED`/`runeSpellPool`/`EFFECTS['40_spell']/['42_spell']` —
  не трогаются.

### 3.4 src/building-effect-mentor.js (НОВЫЙ, ~115 строк, UMD 1:1 по
форме src/building-effect-runes.js)

```
handleMentorSpell(ctx) → { ok, message? }
  r = ctx.r; !r || r.ok!==true || r.success!==true ||
  typeof r.spellId!=='string' → { ok:false, message: (r&&r.reason) ||
  'нет заклинания для обучения' };
  game = ctx.world && ctx.world.game;
  S = game && game.Spells;
  !S || typeof S.learn!=='function' → console.error('building-effect-
  mentor.js: Game.Spells не найден — src/spells.js обязан грузиться
  ДО main.js (задача 000147)') + { ok:false, message:'заклинания
  недоступны' }  (000053);
  LT = game && game.LearnTarget;
  sheet = (LT && typeof LT.activeSheet==='function')
    ? LT.activeSheet(ctx.hero) : ctx.hero;      // hero — live (D3)
  res = S.learn(sheet, r.spellId, 'mentor');
  !res || !res.ok → { ok:false, message: res && res.reason }
  (без марки — действие не тратится);
  success: typeof ctx.hero.gold==='number' && typeof r.price==='number'
  → ctx.hero.gold -= r.price;                    // золото С ГЕРОЯ (D5)
  return { ok:true };                            // message — из apply
  (r.message — приоритет в роутере, 000128).

register(G)
  BA = G && G.buildingActions;
  !BA || typeof BA.registerSpecial!=='function' → console.error +
  БЕЗ регистрации (000053, игра не падает);
  BA.registerSpecial('17_mentor', handleMentorSpell);
  // ... '18_mentor', '19_mentor', '21_mentor', '38_mentor'
  (ОДИН хендлер на 5 id — мульти-id прецедент building-content.js;
   пул/цена — из каталога, хардкод по id НЕ нужен).
```
Порядок тегов: ПОСЛЕ building-actions.js (registerSpecial) и spells.js,
ДО main.js (UMD-ловушка 000038) — пин index-order.

### 3.5 Каталог assets/buildings (JSON + `npm run sync:buildings`)

* 000017.json: `особые_параметры` += `"эффекты": ["17_mentor"]`,
  `"наставник": { "заклинания": ["fireball","flame_burst","inferno"],
  "цена": 50 }`. (раз_в_день — НЕТ → лимита нет.)
* 000018.json: `эффекты: ["18_mentor"]`, `наставник: { заклинания:
  ["spark","frost_bolt","blizzard"], цена: 50 }`.
* 000019.json: `эффекты: ["19_mentor"]`, `наставник: { заклинания:
  ["chill","shadow_bolt"], цена: 50 }`.
* 000021.json: `эффекты: ["21_mentor"]`, `наставник: { заклинания:
  ["mend","light_heal","greater_heal","vine","nature_blessing"], цена:
  50 }`.
* 000038.json: `эффекты: ["38", "38_mentor"]` (явный 1-к-1 + новое —
  порядок строк оверлея: «Благословение (гора)» первой, «Обучение
  (наставник)» — второй; эффектIds-фильтр hasOwnProperty(EFFECTS) —
  оба), `наставник: { заклинания: ["magic_shield","stone_skin","ward"],
  цена: 50 }`, `раз_в_день: { "38": true }` (boolean→объект: «38»
  побайтово через object-ветку hasDailyLimit; '38_mentor' — ключа нет =
  нет лимита). **Конфликт-зона 000162** (они: эффект += 'resurrect' +
  раз_в_день объект с ключом resurrect) — ребейз: union.
* src/buildings.js — GENERATED (mirror — пин buildings.test.js
  deepEqual JSON↔JS); правка ТОЛЬКО через sync.

### 3.6 UI — src/ui-tab-skills.js, «Книга заклинаний»

`renderBook(ctx, active)` — learned-часть БЕЗ ИЗМЕНЕНИЙ (hero/merc —
renderLearnedBook по c.spells; efir — канонические строки с маркерами
«уровень N»/«откроется на N-м уровне» — data-driven). ЕДИНСТВЕННАЯ
реорганизация: efir-ветка НЕ делает ранний return — после 10/11
канонических строк управление переходит к avail-блоку (общему для
всех kinds).

Новый блок (ПРЕСЛЕДУЕТ learned-строки в том же `ctx.panel._book`):
```
// hero — из ctx.character (может быть null в build — только learned);
// G — снапшот модуля (SpellsData/ITEMS/BUILDINGS — ВСЕ ДО вкладки,
//    L774-794 < L852 — в снапшоте; обращения лениво в render).
for (id of G.SpellsData.SPELLS (каталожный порядок)) {
  learned: c.spells.includes(id) → skip;
  efir: id ∈ (efirSpellsByLevel(1) + EFIR_SPELL_UNLOCKS[*][1]) → skip
        (каноника уже показана с маркером);
  sources = [];                       // порядок фиксирован
  свиток: hero.inventory.slots → G.ITEMS[item.id].kind==='spell_scroll'
          && effect.spell===id → ['свиток','scroll'];
  руна: G.BUILDINGS.some(b: isObj(op.эффект) &&
          Array.isArray(op.эффект.заклинания) && includes(id))
        → ['руна','rune'];
  наставник: G.BUILDINGS.some(b: isObj(op.наставник) &&
          Array.isArray(op.наставник.заклинания) && includes(id))
        → ['наставник','mentor'];
  пусто → skip (не «доступное»);
  first = sources[0];
  okAny = sources.some(([ , key]) => G.Spells.canLearn(c, id, key).ok);
  meta = first[0] + ': ' + (okAny ? 'доступно'
         : G.Spells.canLearn(c, id, first[1]).reason);
  row = div.cp-availrow > span.cp-itemname (spellName(id))
        + span.cp-itemmeta (meta);   // БЕЗ button
}
// заголовок div.cp-avail-title 'Доступно к изучению:' — ДО строк,
// ТОЛЬКО если avail-строк ≥ 1.
```
* CSS (index.html, после `.cp-itemrow .cp-btn` L106):
  `.cp-availrow { display: flex; align-items: center; gap: 4px;
  padding: 1px 0; opacity: 0.85; }`
  `.cp-availrow .cp-itemname { flex: 1; }`
  `.cp-avail-title { margin-top: 4px; color: #9a8f76; font-size: 11px; }`
* Стабильный контракт 000146 §8: имена секций/тел `_book`/`_breath`/
  `_breathSec` — НЕ ТРОГАТЬСЯ; rebuild in place (textContent='') — как
  есть.
* ЛИТЕРАЛ 'saveNow' в src/ui-tab-*.js ЗАПРЕЩЁН (сканнер ui-panel.
  test.js) — нового кода с saveNow НЕТ (сейв — за вызывающим
  источником: useItem/роутер постройки).
* Деградация: G.SpellsData/ITEMS/BUILDINGS/Spells отсутствуют — тихий
  нет avail-строк (learned-книга intact).

### 3.7 index.html — позиции (D9) + пины tests/index-order.test.js

* Тег 1: `<script src="src/learn-target.js"></script>` — МЕЖДУ
  `src/day.js` (L792) и `src/items.js` (L793) + коммент 000147.
* Тег 2: `<script src="src/building-effect-mentor.js"></script>` — ПОСЛЕ
  `src/building-effect-runes.js` (L916), ДО `src/hud.js` (L922) + коммент
  000147.
* CSS-блок .cp-avail* — после L106 (см. 3.6).
* tests/index-order.test.js:
  * «нужные модули» (L35-71) += 'src/learn-target.js',
    'src/building-effect-mentor.js';
  * НОВЫЙ тест: learn-target — pos(learn-target) > pos(day.js) && <
    pos(ui.js) && < pos(main.js) (снапшоты потребителей);
  * НОВЫЙ тест (формат пина runes L863-876): mentor — building-actions
    < mentor, spells < mentor, mentor < hud, mentor < main.

## §4 Красные тесты — tests/spells-any-party.test.js (НОВЫЙ)

Ленивый require внутри тел тестов (паттерн 000133: `require('../src/
learn-target.js')` в теле — RED-фаза падает MODULE_NOT_FOUND каждым
тестом, цепочка файла грузится). expectedRedCount = **10**.

Часть A (node):
* **AP-1** — activeSheet + школа по атрибуту на sheet kind 'efir':
  синтетический efir-sheet (primary Int/Wis); activeSheet(hero) с
  globalThis.Game={Party,playerUI:{getActiveCharId:()=>'efir'},NpcData}
  + globalThis.__game={state:{efir:sheet, efirMet:true, roster:[]}} →
  возвращает ТОТ ЖЕ live-sheet; canLearn(efir,'light_heal','scroll')
  при WIS 3 → «нужен ранг школы «Знаток»», WIS 11 → ok; learn мутирует
  sheet.spells, повтор → «уже изучено». RED: require learn-target →
  MODULE_NOT_FOUND.
* **AP-2** — merc-sheet: INT 1 → fireball «Знаток»; flame_burst БЕЗ
  базы → «нужно базовое заклинание: Огненный шар»; с базой + INT 11 →
  ok; source 'mentor' при runes=0 + INT 26 + база → ok (Рунопись НЕ
  нужна); learn — мутация, без дублей. RED: тот же символ.
* **AP-3** — свиток → активный наёмный: heroC {inventory: слот
  fireball_scroll, spells: []}; useItem(heroC, 'fireball_scroll', 1,
  mercSheet) → ok, mercSheet.spells=[fireball], heroC.spells=[],
  предмет −1; отказ (merc INT 1) → reason «Знаток», предмет НЕ сошёл;
  БЕЗ 4-го аргумента → изучение на heroC (регрессия S). RED: 4-й аргумент
  игнорируется → learn на hero → assert merc.spells падает.
* **AP-4** — Эфир: addEfirXp до L5 → авто light_heal (регрессия 000144,
  efir.test.js-паттерн); useItem(heroC, shadow_bolt_scroll, 1,
  efirSheet) (unified, INT/Wis поднят) → efirSheet.spells = старт +
  unlock + shadow_bolt (append-only, auto-разблокировки не сломаны);
  повторный levelUp — ничего не удаляет. RED: 4-й аргумент/символ.
* **AP-5** — руна на не-hero sheet: Game={Spells,Party,NpcData,
  LearnTarget,playerUI:{getActiveCharId:()=>'merc_x'}}, __game.state =
  { roster:[{npcId:'merc_x',sheet:mercSheet}], efir:null, efirMet:false
  }; st = { hero: heroLike, catalog: buildings40 (решённая запись),
  tile:{x,y}, day, save:{} } → applyRuneSpell(st): кандидаты ПО MERC
  (merc runes/INT заданы так, что учим ровно N) → {ok:true, success:
  true, spellId, message} (детерминизм (tile,day) — повторный вызов
  тот же); merc runes=0 → cands=0 → ok:false; БЕЗ __game → кандидаты по
  st.hero (регрессия R, golden-совместимость R2). RED: learner = st.hero
  → кандидаты по hero → assert по merc-кандидатам падает.

Часть A-M (node, наставник — тот же файл, AP-M1..M3):
* **AP-M1** — каталог + реестр + зеркало: 5 зданий 17/18/19/21/38:
  BUILDINGS-запись `наставник.заклинания` deepEqual пулу D12, цена 50;
  effectIds(17cat)=['17_mentor'], effectIds(38cat)=['38','38_mentor'];
  hasDailyLimit(38cat,'38')===true, (38cat,'38_mentor')===false,
  (17cat,'17_mentor')===false; EFFECTS['NN_mentor'] {имя:'Обучение
  (наставник)', apply: fn}; зеркало src/buildings.js deepEqual JSON.
  RED: каталог/реестр/экспорты отсутствуют.
* **AP-M2** — applyMentorSpell (ЧИСТОЕ): st {hero:{gold:100, spells:
  []}, catalog: 17cat, tile, day}, active = efir-sheet (Int 11 →
  fireball ok) → {ok:true, success:true, spellId:'fireball' (первый в
  пуле), price:50, message:'Наставник передал: «Огненный шар»'}; hero
  НЕ мутирован (gold 100, spells [] — deepEqual purity); sheet attrs 1
  (кандидатов нет) → ok:false, message содержит 'заклинаний нет';
  hero.gold=10 → ok:false, message 'недостаточно золота'. RED:
  applyMentorSpell не экспортируется.
* **AP-M3** — handleMentorSpell: ctx {hero:{gold:100, spells:[]},
  r:{ok:true, success:true, spellId:'fireball', price:50, message:'…'},
  world:{game:{Spells, LearnTarget}}}, active = merc → mercSheet.
  spells+=[fireball], hero.gold=50, hero.spells=[]; повтор (learner уже
  знает) → {ok:false, message:'уже изучено'}, gold НЕ списан; без
  Game.Spells → console.error + {ok:false, message:'заклинания
  недоступны'}, sheet не мутирован. RED: модуль отсутствует.

Часть B (vm, ДИНАМИЧЕСКАЯ цепочка до ui.js — паттерн ui-tab-skills-
active.test.js L370+; `__game.state` ИНЖЕКЦИЯ в sandbox ДО openPanel —
main.js в цепочке нет, точку ставит тест):
* **AP-6** — UI «Книга заклинаний»: выученные + доступные: env с hero
  (инвентарь: fireball_scroll), Эфиром (efirMet=true), наёмным (INT
  низкий, spells []); активен наёмный → секция «Книга заклинаний»:
  learned-строки (.cp-itemrow) + avail-строки (.cp-availrow):
  «Огненный шар» meta 'свиток: нужен ранг школы «Знаток»' (первый
  источник — свиток); «Хлад» (только руна, t1) meta 'руна: доступно';
  у avail-строк button === null; количество .cp-itemrow НЕ ИЗМЕНЕНО
  (learned-only); вид Эфира: канонические строки с маркерами intact
  (количество — data-driven assert через G.efir, НЕ хардкод 10/11) +
  avail-строки для НЕ-канонических с источником (shadow_bolt: 'руна:
  нужен ранг школы «Знаток»'). RED: renderBook строит только learned →
  .cp-availrow отсутствует.
* **AP-7** — UI-путь: свиток → активному: hero-инвентарь frost_bolt_
  scroll; активен = наёмный (INT 11; клик .cp-portrait / playerUI.
  toggle(true,'character',id)); «исп.» (doItemAction 'use') →
  mercSheet.spells += frost_bolt, hero.spells НЕ изменился, hero-
  инвентарь −1, flash «Изучено: «Морозная стрела»». RED: ui.js сейчас
  `G.useItem(c, id)` без target → hero учится → assert merc.spells
  падает.

Опционально (не в expectedRedCount): AP-8 vm e2e руна на карте с
активным-наёмным (паттерн R5 с pre-seed тайла 40) — если зелёная стадия
захочет полный мир-шлейф; R5/R6 покрывают hero-регрессию.

## §5 index.html + пины (сводно)

См. §3.7. Дополнительно: динамические vm-цепочки (spells.test.js
E1_CHAIN, ui-tab-skills-active B, ui-tabs-efir-removed R, building-
effects e2e) подхватывают ОБА новых тега АВТОМАТИЧЕСКИ (парсинг
index.html) — без правок лоадеров.

## §6 Пере-пины (только технические, осознанные, с комментом)

1. **tests/building-effects.test.js A1 (L160-183)**: MERGED/UNION +=
   '17_mentor','18_mentor','19_mentor','21_mentor','38_mentor' —
   коммент «Ребейз 000147 на мастер (2026-10-07): MERGED/UNION +=
   NN_mentor (000147, наставники 5 школ) — пин регенерирован по
   фактическому коду». ОБЯЗАТЕЛЬНО (новые ключи EFFECTS). На мерже —
   union с 'resurrect' (000162).
2. **tests/index-order.test.js**: +2 в «нужные модули» + 2 новых
   позиционных теста (§3.7) — это НОВЫЕ пины, не ре-пин.
3. **НЕ ре-пинуются** (решения D2/D7/D10): B6/B7 (ui-tab-skills-
   active), R3 (ui-tabs-efir-removed) — отдельный класс .cp-availrow;
   E1 (spells), S4-S8 (items), R1-R6 (building-effects rune), RUNES-
   U1/U2, makeShop golden, save-пины, companions-sheet, combat*,
   efir export-list (18 — efir.js не трогаем).
4. **HARDCODED CHAINs** (tests/ui-skills.test.js L129-141, ui-panel.
   test.js L264, squad-panel.test.js L163) — БЕЗ ПРАВОК: learn-target.js
   НЕ входит в массивы (цепочки до ui.js) → в этих песочницах
   G.LearnTarget отсутствует → ui.js activeSheetFor/items.js fall-
   back на hero — безопасное направление; mentor-модуль — ПОСЛЕ ui.js
   (слот спец-модулей) — в этих цепочках его не было и нет (как и
   runes). saveNow-сканнер ui-panel покрывает правку ui-tab-skills.js
   АВТОМАТИЧЕСКИ (readdir) — литерала 'saveNow' в новом коде НЕТ.
5. **RUNES-U2** — без правок: target опционален (fallback ctx.hero),
   assert «hero не мутирован при деградации» остаётся верным.
6. **А47 (обнаружено на зелёной стадии, НЕ в исходном плане §6)** —
   каталожные правки 000147 (38: `эффекты += 38_mentor`,
   `раз_в_день` boolean → `{ "38": true }`) сломили ДВА существующих
   e2e-пина в tests/building-effects.test.js — ОБА пере-пинены
   ТЕХНИЧЕСКИ (с комментом «Ре-пин 000147»):
   * **A33** (L981): `p38.раз_в_день === true` → `deepEqual({ 38: true })`
     (схема 000092 per-эффектный объект; fail-open: '38_mentor' —
     без лимита).
   * **B12 helper `findBuildingNoDailyLimit`** (L5080): флаг
     «есть лимит» — `раз_в_день === true` → семантика
     `hasDailyLimit(b, String(b.id))` (boolean ИЛИ per-эффектный
     объект) — без этого BFS нашёл бы 38 (объект ≠ true) и
     e2e упёрся бы в disabled-строку.
   * **B18** (L6119): оверлей 38 — `['38']` → `['38', '38_mentor']`
     (каталог рисует ДВЕ строки; Digit1 = первая '38' — e2e-
     контракт «Благословение» (buffMods/маркировка) — без
     изменений).
   На мерже с 000162: их `эффекты += 'resurrect'` union с нашим
   `['38','38_mentor']` → B18-пин union → `['38','38_mentor',
   'resurrect']` (порядок — порядок каталога); A33/B12 — не
   пересекаются.

## §7 Карта мержа (параллельные задачи)

ОБНОВЛЕНО на станции правок по итогам ревью (master = **9f84149**):
ВСЕ ПЯТЬ параллельных задач СМЕРЖЕНЫ — dd9c0e8 000163, 88a1253
000149, ec08e19 000167, 9768efe 000162, 9f84149 000165. РЕБЕЙЗ
ПЕРЕД МЕРЖЕМ ОБЯЗАТЕЛЕН; точки ниже СВЕРЕНЫ с фактическим кодом
master (не с red-фазами).

* **master 9f84149** — 5 мержей (30 коммитов) сверху базы 7306ca3.
  000163: каталог 17 заклинаний (+resurrect), EFIR_SPELL_UNLOCKS
  8→9 (+[22,'resurrect']), B6/R3 пере-пинены 000163 В ИХ ВЕТКЕ
  (11 строк) — наш код data-driven, их файлы не трогаем;
  resurrect — в avail-строках НЕ появляется (ни свитка-предмета,
  ни пула). 000149 (spellbook.js/combat-ui.js/assets/spell-
  icons) и 000167 (combat.js очередь хода) — 0 пересечений с
  нашим диффом (combat.js/spellbook не трогаем; боевой каст —
  существующий механизм D4).
* **000162 (СМЕРЖЕН 9768efe) — прямое пересечение, свёрено с
  master:**
  * assets/buildings/000038.json — они: `эффекты: ["38","resurrect"]`
    + `воскрешение: {база:20, за_опыт:0.05}` + `раз_в_день:
    {"38": true}`; мы: `эффекты: ["38","38_mentor"]` + `наставник`.
    UNION: `эффекты: ["38","38_mentor","resurrect"]` (порядок =
    порядок оверлея), `наставник` — наш, `воскрешение` — их,
    `раз_в_день: {"38": true}` — ИДЕНТИЧЕН у обеих (у resurrect
    лимита НЕТ — ключа нет, fail-open).
  * src/buildings.js — GENERATED: после union — `npm run sync:
    buildings` (регенерация закрывает текстовый конфликт).
  * src/building-effects.js — их resurrect-регион (EFFECTS['resurrect']
    L407, applyResurrect L2023, экспорты L2791 resurrectPrice/
    resurrectList/resurrectAvailable/applyResurrect) vs наш rune/
    mentor-регион — не-смежные вставки; конфликт — return-блок
    экспорта (оба добавляют) — механический union.
  * index.html — их тег building-effect-resurrect.js ПОСЛЕ runes.js
    (L986), ДО hud.js (L992); наш mentor-тег — тот же слот →
    соседние теги, порядок между ними несущественный (оба ПОСЛЕ
    building-actions/spells, ДО hud/main); пины index-order —
    relative → union.
  * tests/building-effects.test.js: A1 — master += 'resurrect'
    (L169-177), мы += 5 NN_mentor (L170-180) → union массива;
    B18 (38-оверлей) — master ['38','resurrect'] (L6121) ∪ наш
    ['38','38_mentor'] (L6129) → ['38','38_mentor','resurrect']
    (Digit1='38' intact); A33/B12 — ИДЕНТИЧНЫ у обеих ({'38':true})
    → конфликта нет; НОВОЕ: их RES-A1 (L8534+) пинит
    p38.эффекты/effectIds(b38) = ['38','resurrect'] — после
    union-каталога пере-пин на ['38','38_mentor','resurrect']
    (ТЕХНИЧЕСКИЙ, под union; семантика RES intact).
  * tests/index-order.test.js — master: «нужные модули» +=
    building-effect-resurrect.js (L59) + IO2 relative-пины
    (L1384+); мы: += building-effect-mentor.js (L62) +
    позиционный тест (L911+) → union списка + оба теста (порядок
    mentor/resurrect между собой не зафиксирован).
* **000165 (СМЕРЖЕН 9f84149) — ОДИН пересечённый файл:
  src/items.js** (остальные файлы ветки — assets/items/000051.
  json, assets/items/schema.json, assets/mobs/000036.json, src/
  items-data.js, src/combat.js, tests/{assets-schemas,cities,
  combat,items}.test.js, CHANGELOG, tasks, memory — с нашим
  диффом 0):
  * KINDS: они += RESURRECTION_SCROLL (master L39) — мы KINDS
    не трогаем.
  * useItem: ОНИ — signature (c, itemId, qty) + ветка
    resurrection_scroll ПОСЛЕ spell_scroll (master L552); МЫ —
    signature (c, itemId, qty, learnTarget = null) + правка
    ВНУТРИ ветки spell_scroll (T = learnTarget || c). UNION:
    наша signature (суперсет), наша spell_scroll-ветка, их
    resurrection-ветка ЦЕЛИКОМ ПОСЛЕ (2-арг. семантика — без
    4-го аргумента → герой — как и наш контракт боевого
    quick-slot).
  * usable/вес-проверка (master L104): их ветка — мы регион не
    трогаем.
  Ребейз: текстовый конфликт в useItem-регионе — механический
  union; `npm run sync:buildings` НЕ нужен (000165 каталоги
  зданий не правил — лут = моб 000036).
* **CHANGELOG.md — НОВОЕ пересечение (после правок по ревью,
  коммит 76881e8):** обе стороны добавляют буллеты в «## 2026-
  10-07 / ### Игровой процесс»: master — 4 буллета (воскрешение
  в храме, бой по инициативе, книга в бою, свиток воскрешения)
  ПЕРЕД «Вся партия…», наши — 3 буллета ПОСЛЕ «Вкладка «Эфир»
  убрана» → union буллетов (конфликт в одном регионе —
  механический: чужие сверху, наши — после «Вкладка «Эфир»
  убрана», как в ветке).
* **ui-tab-skills.js** — общий с 000146 (смержен, в базе) — правка
  только renderBook + avail-блок (+ learned не-каноника Эфира —
  ревью); контракт _book/_breath/_breathSec стабилен (§3.6);
  000163 файл НЕ правил (только тесты B6/R3) — конфликта нет.

## §8 Подводные камни

1. **UMD-ловушка 000038**: learn-target.js снимает G0 ОДИН раз
   (Object.assign); ВСЕ чтения (Game.Party/playerUI/NpcData, __game.
   state) — ЛЕНИВО через rootRef в момент ВЫЗОВА. main.js снимает
   `const G = globalThis.Game` ОДИН раз (L13) и НЕ заменяет
   globalThis.Game → LearnTarget (тег ДО main.js) — в снапшоте main.js
   → ctx.world.game.LearnTarget в спец-хендлерах.
2. **__game.state.hero — СНАПШОТ** (getter, новый объект на каждый
   доступ; НЕТ primary/secondary → canLearn дал бы level 0 → все
   отказы). hero-member — ТОЛЬКО live-ссылка вызывающего (D3).
3. **__game.state — getter**: обёртка строится на каждое обращение
   (дешево: плоские поля); efir/roster — live-ссылки (можно держать);
   efirMet — значение (копируется).
4. **Fallback на hero** держит зелёными S4-S8 (node Game={Spells}),
   R2-R6 (node, без LearnTarget в ctx.world.game), E1 (полная цепь,
   activeCharId=null), RUNES-U1/U2, HARDCODED-CHAIN-песочницы (тег
   learn-target не в массиве).
5. **Rune (tile,day)-hash НЕ тронут**: picked-спелл на том же
   (tile,day) — тот же; меняется ТОЛЬКО sheet (кандидаты по learner —
   ОДИН sheet → picked гарантированно обучимый, picked=learned).
6. **registerSpecial-guard** (латиница+underscores, building-actions.
   js:64): '17_mentor'…'38_mentor' проходят; ':'/пробелы/кириллица —
   нет.
7. **learn() НЕ логирует source** (спелл-книга хранит только id):
   flash — у вызывающего; сообщения 000133 без изменений; mentor-
   message — из apply (r.message приоритет в роутере, 000128).
8. **Efir-гейт**: Party.list включает Эфир только при efirMet===true;
   Эфир существует при загрузке (main.js L231-234) — гейт ОБЯЗАТЕЛЕН
   (fresh-игра: «активный = не встреченный Эфир» запрещено); stale id
   'efir' → Party.active → первый = hero (тихо).
9. **useItem**: c — ВСЕГДА владелец инвентаря (герой); learnTarget ≠
   c по смыслу (sheet только для bookOf) — ensureInventory на чужом
   листе сломал бы save-layout-пины; существующие вызовы (ui.js до
   правки — 2 арг, combat quick-slot — 2 арг, тесты — 2/3 арг) —
   T = c → побайтово ДО.
10. **saveNow-сканнер** (ui-panel.test.js, readdir src/ui-tab-*.js):
    литерал 'saveNow' в новой части ui-tab-skills.js ЗАПРЕЩЁН.
11. **Количество строк книги Эфира — data-driven** (efirSpellsByLevel
    (1) + EFIR_SPELL_UNLOCKS): 10 (база 7306ca3) / 11 (после 000163) —
    хардкода 10/11 ни в src, ни в AP-6 (assert через G.efir).
12. **Пулы — только существующие id** (16 на базе; 17 после 000163 —
    'resurrect' в пулы НЕ добавляем); spells-каталог-пины 000163 —
    не наши.
13. **Каталоги GENERATED**: JSON → `npm run sync:buildings` (иначе
    sync:all --check CI + buildings.test.js deepEqual JSON↔JS).
14. **Дормант**: 17/18/19/21 — без map_index (волны школ, audit §4.3) —
    наставническое действие в текущем мире доступно ТОЛЬКО на 38
    (подтип слота 8); тесты — node/vm-уровень (без генерации мира).
15. **000163 уже пере-пинил** tests/ui-tab-skills-active.test.js (B6
    10→11) и ui-tabs-efir-removed.test.js (R3 10→11) в СВОЕМ мерже —
    мы эти файлы НЕ правим (конфликта на ребейзе нет).
16. **Боевой quick-slot — герой** (D4): осознанное сохранение
    000133-поведения; combat.js = 0 правок (000167 рядом).

## §9 Что важно будущим задачам

* **LearnTarget.activeSheet(hero)** — ЕДИНАЯ точка «изучение на
  активного»: будущие источники (предмет-книга, мини-меню [T] в бою —
  аудит §4.9, продажа свитков в «Магазе магии» — аудит §4.23) идут
  через него либо через 4-й аргумент useItem.
* **'mentor' реализован (000133b закрыт)**: 5 школ, цена в каталоге
  (наставник.цена), выбор — первый learnable; NPC-наставники (диалог —
  «раздел NPC, обучение» SPEC) — отсрочены (волны школ); canLearn
  'mentor' — только школьные проверки (ранг школы по атрибуту + база).
* **UI-паттерн avail-строк** (.cp-availrow/.cp-avail-title): будущие
  «доступно»-списки — этот класс (НЕ .cp-itemrow — пины B6/B7/R3);
  источники каталог-драйвен (новый источник = каталожный ключ + одна
  запись в sourcesFor 3.6).
* **раз_в_день 38 — пер-эффектный объект**: будущий третий эффект 38 —
  ключа нет = лимита нет (fail-open 000092); не возвращать boolean
  (затронул бы ВСЕ effectId).
* **Эфир: авто-разблокировки + unified learning сосуществуют**
  (append-only bookOf): будущие unlock'и (паттерн 000163 [22,'resurrect'])
  не ломают изучение и наоборот; книга Эфира в UI — data-driven.
* **tests/spells-any-party.test.js** — база семейства «изучение
  партией» (AP-1..AP-7): новые источники партии тестировать ДОБАВЛЕНИЕМ
  в этот файл.
* **Состав диффа 000147** (для мерж-анализа): НОВЫЕ: src/learn-target.
  js, src/building-effect-mentor.js, tests/spells-any-party.test.js,
  memory/000147-*.md; ПРАВКИ: src/items.js (+8), src/ui.js (+10),
  src/building-effects.js (+~95), src/building-effect-runes.js (+4),
  src/ui-tab-skills.js (+~85), index.html (+~14: 2 тега + CSS),
  assets/buildings/0000{17,18,19,21,38}.json (+~8×5), src/buildings.js
  (sync), tests/building-effects.test.js (+~12: A1), tests/index-order.
  test.js (+~35); НЕ ТРОГАЛИ: src/spells.js, src/combat.js, src/
  companions.js, src/efir.js, src/main.js, src/party.js, src/building-
  actions.js, src/npc.js, assets/spells/*, формат сейва.

## §10 Как обобщены источники (сводка для отчёта)

* **Свиток** — изучение на АКТИВНОГО: панель (ui.js) передаёт
  LearnTarget.activeSheet(c) 4-м аргументом useItem; предмет — с героя
  (носитель инвентаря); боевой quick-slot — герой (000133 intact).
* **Книга** — предметов-книг изучения НЕТ (skill_book — другая
  механика, 000027/28); source 'book' в canLearn зарезервирован,
  неиспользуем.
* **Руна** — applyRuneSpell фильтрует кандидаты по активному (одна
  точка — picked=learned); handleRuneSpell учит активного; (tile,day)-
  детерминизм intact.
* **Наставник** (новый, D5/D6/D12) — 5 школ, цена 50 с героя, первый
  learnable, без daily-лимита; каталог-драйвен (наставник.заклинания/
  цена).
* **canLearn/learn — БЕЗ ИЗМЕНЕНИЙ** (спells.js diff = 0): generic с
  000133, обобщение — только в обёртках/потребителях.
* **НЕ ТРОНУТО** (D10): spells.js, combat.js, companions.js, efir.js,
  main.js, party.js, building-actions.js, npc.js, assets/spells, формат
  сейва; боевой каст наёмных/Эфира — существующий механизм (u.spells);
  Эфир-авто-разблокировки — append-only intact.

# 000349 — «Притяжение» (природа, lvl3): мгновенный сбор лута в радиусе

## Что сделано
Заклинание `attraction` (школа природа, уровень 3, мани 13, степень 1,
атрибут wisdom, действие «телепорт», вне_боя true, здания
healing_temple + mountain_temple, без свитка — items 0-diff). Радиус
`5 + Math.floor(Интеллект/10)` тайлов (Формула читает
`hero.primary.intelligence`, НЕ мудрость из «атрибут» — F2 фиксированное
решение: «атрибут» в JSON — про шкалу стоимости обучения/книгу, а
радиус ТЗ привязал к Интеллекту; прецедент decadanceLevels).

## Ключевые фиксированные решения анализа
- **F1**: пустой радиус (нет целей) — БЕСПЛАТНЫЙ отказ «нечего собирать»
  ДО списания маны. Второй бесплатный отказ — «не влезает в
  инвентарь» (цели есть, но 0 успешных мутаций) — тоже ДО маны.
  Инвариант: отказ ⇒ 0 мутаций (ни mp, ни items, ни flags, ни log).
- **F3**: достижимость — НЕ простой радиус. Мир: оконный BFS
  4-соседства по `tileAt().passable` с окном Чебышёва ≤ radius
  (`L.worldLootTargets`); подземелье: `G.reachableFrom(dg, x, y)` ∩ окно
  (`L.dungeonLootTargets`). Вода/стены/футпринт зданий отсекают (passable
  = проходимость мира целиком), обходные пути внутри окна — берутся,
  карман за стеной в окне — НЕ берётся. Граница окна включительна.
- Действие «телепорт» — ради БЕСПЛАТного боя: `OUT_OF_COMBAT`
  содержит «телепорт», поэтому отказ в бою идёт по действию без
  расхода. (Прецедент 000348 decadance — та же привязка.)
- Мгновенный эффект: `{ok, spell, expiresDay: null}` БЕЗ записи в
  outOfCombatEffects; мана списывается ПОСЛЕ успешного колбэка
  (паттерн ctx-колбэка navPath 000333 / decadance 000348 —
  `ctx.attraction` в `outOfCombatCtx`, третья ветка отказов
  «не здесь» для города/карты-без-карты).

## Семантика сбора (эквивалент ручного подбора)
- Мир (`attractionCollectWorld`): цели — лут-тайлы из worldLootTargets
  с видимостью `G.lootVisible(collectedLoot,x,y)` (невидимый/собранный
  раньше — вне целей). Для каждой цели — `G.addItem(hero, item)` ровно
  как ручной подбор (000158.04): ok ⇒ `collectedLoot.set('x,y',
  clock.day)`; отказ ⇒ тайл НЕ помечается (лут остаётся). ДЕНЬ/шаги не
  тратятся.
- Подземелье (`attractionCollectDungeon`): сундуки — `G.openChest` +
  `applyDungeonChest(ds, r, clock.day)` (золото/предмет/overflow →
  авто-золото, ds.log «Сундук: +N золота[, имя]»); залежи —
  `G.gatherDeposit(contents, id, canFit)` с гейтом
  `G.canAddItem(hero,it,n).ok` (fail-closed) ⇒ addItem + ds.log
  «Залежь: +N имя». already-opened/opened/gathered флаги исключены на
  уровне селектора.
- **Сознательное отступление от ручного пайплайна**: один `saveNow()` и
  одна hud-сводка «Притяжение: собрано N.» в конце вместо per-item
  flash+saveNow (массовый сбор; события — строки ds.log — сохранены
  1-в-1; mark-collected/сейв-зеркало collectedLoot — те же ключи/дни).

## Таблица ре-пинов (база 74766f68; счётчики — ПО ДИСКУ)
| файл | было → стало |
|---|---|
| spells.test.js зеркало | 170→171 (files/SPELLS/BY_ID) |
| spells.test.js R1 зеркало | 170→171 |
| spells.test.js R2 | 170→171; buildingRefs 281→283 (+2 — оба храма УЖЕ цели); Σ 482→484; baseRefs 34 / itemRefs 167 / filesWithItems 164 / targets 34/156/7 НЕ двигались |
| spells.test.js W-08 | spells-data 170→171 (items 764 не тронут — свитка нет) |
| spells.test.js W-01/W-02 | name-uniqueness 170→171 ×3 sweep-а |
| spells.test.js «36 из 170» | «36 из 171» ×4 (Притяжение — не урон; assert 36 не двигался) |
| spells-rename-000318.05 | SPELLS_SLUGS += "attraction" (между ashen_debilitation и aura_of_protection); T1/T2/T7 170→171 |
| magic-schools-000324 | A3 170→171 (пер-школа считается с диска: природа 29→30 автоматически) |
| spellbook.test.js | SB9 170→171; SB11 171→172 SVG (171 иконок + кнопка) |
| svg.test.js | реестр 'spell-icons' 170→171; W-05 ×6 assert+name →171; итог SVG считается из реестра (1520→1521 автоматически) |
| efir.test.js | SPELL_CATALOG 170→171 (пересечение волны 000359.01 — единственная разрешённая строка) |
| save.test.js | EFIR_SPELL_CATALOG 170→171 (то же пересечение) |

НЕ ре-пинились (бит-в-бит): spell-links-000327, scroll-spell-links-000326,
spellbook-oc-e2e OC12, волновые «вне_боя — ровно 3» (скоуп — 25 id
волны, attraction в него не входит), SCHOOLS, school-icons 6,
SPEC_FILE_LINES, items-цепочка 764/731, universam/GOLDEN (новый
предмет не добавлен ⇒ rng магазинов не сдвигался), REF_RE/shape-пины.

Условия будущих ре-пинов: +1 spell = та же сетка (spells.test 171,
rename-множество, magic-schools A3, SB9/SB11, svg-реестр, efir/save);
пометка эрраты 000368: актуально 172 спелла с `98eec709` (000350
show_enemies — влился ПОЗЖЕ этой задачи, факт верен на базе записи).
свиток на attraction — добавить items-цепочку 764→765 и GOLDEN-пробу
(прецедент 000348). Пометка эрраты 000368: актуально цепочка 814→815
с `c0013918` (000321.06). Формула пересчёта живых счётчиков (контракт
000362 «значения отсюда не канон, пересчёт свипом»): спеллы —
`ls assets/spells/*.json | grep -vc schema.json`; предметы и base_price —
python-свип assets/items/*.json (паттерн «Счётчики диска (пересчёт свипом,
не отсюда)» memory/000347-temple-scroll-trade.md); NPC —
`ls assets/npc/*.json | grep -vc schema.json`.

## Матрица мутаций (стейдж=HEAD; git restore между; фактические красные)
- M1 вырез ветки attraction в castOutOfCombat → T4,T8–T10 (T5 зелёный:
  боевой отказ «внебоевое» идёт раньше ветки по действию — контракт
  держится и без ветки).
- M2 floor→ceil в attractionRadius → T6,T8 (T9 зелёный: int=10 —
  ceil/floor не различимы, границы ловит именно T6).
- M3 worldLootTargets: простой Чебышёв-диск без BFS → T7,T8.
- M4 списание маны ДО колбэка → T4,T8–T10.
- M5 без collectedLoot.set → РОВНО T8 (сейв-зеркало + повтор).
- M6 без saveNow в attractionSummary → T8,T9.
- M7 clock.addStep(1) в attractionSummary → T8,T9.
- M8 без reach.has в dungeonLootTargets → T7,T9 (карман открывается).
Все красные — ERR_ASSERTION без краха; после restore 10/10
(/tmp/000349-m-final.tap).

## Тесты
tests/spell-attraction-000349.test.js — 10: T1 JSON-схема/порядок
ключей/roundtrip; T2 sweep уникальность id/имени/иконки (sha256);
T3 зеркало + лекс.позиция + items 0-diff; T4 castOutOfCombat ctx-цепочка
(успех −13 РОВНО / три отказа ДО маны / mp<13 — колбэк не вызван);
T5 бой — бесплатный отказ по действию; T6 границы формулы; T7 селекторы
мира+подземелья (фикстурная-геометрия: вода x=3 y2..6 с обходом через
y=1, изолированный стенами (9,4) в окне, invisible (6,5), за-окна
(0,4); карман (4,4) в подземелье); T8 e2e мир (инвентарь == node-
реплика BFS+items.js, collectedLoot-зеркало, за-окном цел, day/steps
целы, mp −13, повтор — бесплатный отказ); T9 e2e подземелье (c1/c3 +
d1/d2 собраны, карман/за-окном/opened-флаги — нет, gold +137, coal 6,
ds.log 4 строки, step/day/steps целы, повтор «нечего собирать»);
T10 e2e отказы (полный инвентарь 60×coal=30кг=лимит → «не влезает»,
gathered:false, log не вырос, mp цел; пустой contents → «нечего
собирать»; город → «не здесь», mp цел, console.error чист).

Ловушки арматуры:
- сейв-форма `hero.inventory` — ОБЪЕКТ `{slots:[...]}`, голый массив
  sanitizer молча обнуляет (T10 seed краснел «собрано 1»);
- mp при restore клампится в `derived.maxMP = 10+(инт+мудр)·3` (seed
  mp 40 у голой крышки = 16 не проходил; мудрость 10 → потолок 43);
- `__game.state.hero` — read-only снапшот БЕЗ primary (первичные —
  только через сейв/beforeunload); `state.hero.inventory` — это УЖЕ
  `.slots`;
- отказ в spellbook-oc НЕ закрывает книгу (success-only close) —
  между последовательными кастами-отказами нужен явный KeyB;
- hud-вспышка «Притяжение: собрано N.» живёт 5 с от performance.now();
  в vmNOW-фикстуре — пока not expired (frameFn NOW+16/32).

## Пересечения волн (11-12)
- task/000359-01 (craft-performer): пересечение только efir.test.js /
  save.test.js (по одной строке каталога 170→171, минимально);
  craft/efir/companions/src — не тронуты.
- task/000354 (storage UI): src/building-actions.js НЕ тронут (0-diff);
  CHANGELOG — разные буллеты одной секции 2026-11-12 (конвенция
  «один день — одна секция»).
- spec/, index.html, save.js, dungeon.js, items — 0-diff;
  src/spells-data.js — перегенерирован sync-spells-data.js (171).

# 000348 — «Декаданс» (тень): экстренный спуск ко входу глубже

## Модель (решение по ТЗ «уточнить на анализе»)

Формула: уровней = `5 + Math.floor((intelligence || 0) / 10)` — округление
ВНИЗ (пол; Д-ФОРМУЛА-7 границы 9→5 / 10→6 / 19→6 / 20→7 / 55→10, undefined→5).
Целевая глубина = **текущая глубина + уровней** (модель (а)), спавн — клетка
ВХОДА целевого этажа. ТЗ допускал прочтение «вход текущего подземелья и спуск
от него»; выбран вариант (а): от ТЕКУЩЕЙ глубины (иначе из глубины 7 на 5
уровней «от входа» при глубине входа 1 формула даёт бессмысленную вилку;
«сбежать глубже» = монотонный рывок вниз от текущего места). Этапы входа
(spawn safe-zone 5×5, живой моб на спавне не садится) переиспользуются штатно —
buildFloor делает это сам, отдельного ре-якоря нет.
Промежуточные этапы НЕ пишутся в память подземелья; записывается ТОЛЬКО
старый этаж (writeFloorMemory до buildFloor), день НЕ тратится (clock не
дёргается). memoryBanned (debug-вход D12) → console.error + null, 0 записей.

## Механика и гейты

- src/spells.js: `decadanceLevels(intelligence)` (экспорт после
  shroudOfNightRadius/darkPresenceRadius); ветка в castOutOfCombat ПОСЛЕ
  way_up/way_down: контекст проверяется через `ctx.decadance` callback
  (прецедент navPath 000333); нет ctx.decadance или callback вернул
  ok:false → `{ok:false, reason:'не здесь'}`; успех — мгновенный телепорт:
  `{ok, spell, expiresDay:null}`, БЕЗ записи в outOfCombatEffects; мана
  списыается только после успеха колбэка.
- Боевой отказ — БЕСПЛАТНЫЙ: действие «телепорт» ∈ OUT_OF_COMBAT
  (castSpell/canCastSpell refus «внебоевое заклинание» до траты пула/маны).
- src/locations.js: `deepDescendFloor(ds, ctx, levels)` (экспорт после
  ascendFloor): гейты kind==='dungeon'/map/player/memory;
  `!Number.isInteger(levels) || levels < 1` → null; memoryBanned → тот же
  текст D12 console.error + null; затем writeFloorMemory(старый) →
  buildFloor({depth: d.depth+levels, logLine:'Декаданс: глубина N.'}).
- src/main.js: `performDecadance()` (после performNavPath) — гейт
  `dungeonState.kind==='dungeon'` (город/карта → «не здесь»), наличие
  G.locations.deepDescendFloor и G.Spells.decadanceLevels,
  transitionFloor(ds,{type:'deepdescend',levels}); успех → hudFlash
  «Декаданс: глубина N.» (5000 мс) + {ok:true}; иначе {ok:false,reason:'не здесь'}.
  Провязка: outOfCombatCtx().decadance = performDecadance; третья ветка
  transitionFloor: `L.deepDescendFloor(ds, ctx, ev.levels)`.

## Данные

- assets/spells/decadance.json — slug-имя (не NNNNNN — ref-шейп spells):
  id decadance, школа «тень», степень 1, атрибут intelligence, уровень 3,
  мани 13, действие «телепорт», вне_боя true, база null, БЕЗ «параметры»;
  предметы [assets/items/000764.json], здания [assets/buildings/mage_tower.json];
  описание канон теста «Не здесь — заклинание не расходуется.»;
  порядок ключей: id,название,школа,база,степень,атрибут,уровень,мани,
  действие,вне_боя,предметы,здания,описание,icon,icon_prompt; roundtrip
  JSON.stringify(obj,null,2)+'\n'.
- assets/items/000764.json — decadance_scroll (перенумерован при ре-базе: 000714–000763 заняты волной 000321.05), kind spell_scroll, value 115,
  tier 3, weight 0.2, desc «Свиток: изучает «Декаданс» (нужен ранг школы.)»,
  effect {kind spell, spell decadance}, БЕЗ base_price (764-й предмет каталога).
- Иконки: assets/spell-icons/decadance.svg (24×24, #e8dcc0, sha256-уникальна)
  и assets/sprites/items/decadance_scroll.svg (64×64, палитра
  shroud_of_night_scroll + винтовые ступени).

## Зеркало (sync)

node scripts/sync-spells-data.js + sync-items-data.js → spells-data 170 /
items-data 764 в ТОМ ЖЕ коммите. Зеркало spells РЕЗОЛВИТ ref'ы:
предметы→['decadance_scroll'], здания→[18] (mage_tower), база:null СОХРАНЯЕТСЯ,
вне_боя переезжает в конец. D-MIRROR-4 сверяет ровно это (Object.assign({},s)
+ перезапись предметов/зданий; НЕ удалять базу — «EXTRA in mirror: база»).
Лексикографическая позиция в SPELLS — между dark_presence и deep_freeze.

## Ре-пины счётчиков (пересчёт диском ПОСЛЕ ре-базы: spells 170, items 764,
spell-icons 170, sprites/items 731; на исходной базе было items 714/иконки 681)

- spells.test.js: каталог/зеркало/BY_ID/names 169→170; R2 itemRefs 166→167,
  buildingRefs 280→281, Σ refs 480→482 (34+167+281), filesWithItems 163→164,
  itemTargets 155→156; baseRefs 34 и buildingTargets 7 НЕ изменились
  (mage_tower уже был целью); W-08 170/764; «36 из 169»→«36 из 170».
- spells-rename-000318.05: PIN-множество += "decadance" (между
  dark_presence/deep_freeze), счётчики 170.
- magic-schools-000324 A3 →170 (пер-школа тень 27→28, шапка 28/29/27/29/29/28).
- spellbook: SB9 →170; SB11 «171 SVG (170 иконок + кнопка)» и rels 171.
- svg.test.js: EXPECTED_SVG_BY_DIR sprites/items 730→731, spell-icons 170;
  все «169»-пины → 170.
- assets-schemas.test.js: items-сегмент [[1,764]], резерв с 000765.
- items.test.js (после ре-базы счётчики считались от 763): S1 свитки 160→161, SCHOOL_SCROLL_MAX тень 26→27;
  I1 000165 и R1 000157.01 763→764; L3 others 730→731; 000211.06 I1 — новое
  исключение `const DECADANCE_000348 = new Set(['decadance_scroll'])` +
  union-строка, «764 − 764 = 0», icon-count 764; I2-сообщение
  «каталог 764 = 764 с icon»; E9 764; others 224→225 (764−539);
  000230.12 R1 764; LF1/LF7 764; universam golden (30,40,WEAPONS_SHOP,w=3,
  seed 3346526313) — хвостом decadance_scroll (на исходной базе probe давал 5;
  после ре-базы переснят живым кодом — см. секцию РЕ-БАЗА: items 2 / cities 4;
  другие 5 GOLDEN-магазинов decadance_scroll НЕ видят — kindPool без
  spell_scroll либо w=0; seed byte-identical, старая часть стока не
  сдвинулась — хвост allItems).
- items-weapon/armor/shield/artifact-000321.0{1..4} + items-tool-000321.05
  (его счётные пины обновлены при ре-базе — файл создан волной .05):
  T1 764 (+хвост «+ 1 свиток Декаданс 000348»), sweep 764, live-каталог 764,
  ids.size 764 (у weapon ГОЛОГО ids.size-ассерта на новой базе нет), T6/T5
  иконки 730→731 (+1 decadance_scroll), hashes 731, T7/T10 items-data 764,
  T10: spell_scroll 160→161, «прочих без slot» 224→225 (764−539),
  shield/artifact T10 «иконки 731» + allSvg T10.
- ui.test.js RAR-G: шапка L49 «каталог 764 шт. (финал, 000321.05; ре-пин
  000348), прочие 225», title+тело 764/225. Финал-цепочка guards: rar-g-heading-000252 H1,
  final-repins-000243 S1-T («161 свитков») / RAR-H / I1-T / I1-H («764 с
  icon»), i2-message-000243.01 I2-M — все токены пересняты на 764/225/161.
- item-icons-000302.08 SWEEP 764; item-prices-000322 R6 764 + «у 720 — нет»
  (base_price 44 без изменений — у свитка Декаданс base_price НЕТ);
  efir.test.js/save.test.js каталог spells 169→170.
- memory/000230.16-spec-equipment-doc.md §2 — канон-таблица
  tests/canon-items-sync-000284.02.test.js (T6 «c1+c2+c3+c4+c11», якоря по
  срезу §2): c1 «Каталог assets/items — 763 файлов (000001–000763;» →
  764/000764; c2 «spell_scroll 160» → 161; в шапке §2 — пометка
  «refresh 000348». НЕ трогать §4.2-иглы («713 файлов (на момент
  000321.04)» в memory и в spec/items.md + W8A wording-теста) — они
  зацеплены побайтно за spec/ (0-diff); тронешь — краснеют T1/T2/W8.
  Найдено полным прогоном: T6 падал «c1: канон != диск count» (единственная краснота сьюта), после ре-пина 10/10.
- НЕ трогали: byte REF_RE/shape-пины, SPEC_FILE_LINES, school-icons 6,
  «36 урон», spec/; «713» в dungeon.test/wall-autotile — sid-ложняки.

## РЕ-БАЗА (на мастер с волной 000321.05)

- Исходная база 6f48c2dc не знала волну инструментов: свиток был 000714.
  На базе bac5b813 диапазон 000714–000763 занят инструментами → свиток
  перенумерован в 000764 (add/add-конфликт 000714.json решён мастером).
  Иконки slug-именованные (decadance_scroll.svg) — перенумерации не требуют.
- Все счётные пины пересчитаны по диску новой базы: items 764, spell_scroll
  161, sprites/items 731, base_price «у 720 — нет» (44 с ценой), прочие без
  slot 225. Цепочки ре-пинов в заголовках сохраняют исторические дельты, добавлен
  сегмент «ре-пин 000348: 763 → 764».
- universam golden — ПЕРЕСНЯТ живым кодом на новой базе (на старой базе
  проба давала хвост 5; роллы сдвинулись из-за инструментов перед хвостом):
  items.test makeShop (30,40,0,3, seed 3346526313) → decadance_scroll: 2;
  cities SHOP_GOLDEN (100,-40,7,5,44,3) → decadance_scroll: 4. Остальные
  642 ключа обоих стоков byte-identical, seed не изменился; остальные
  GOLDEN-магазины decadance_scroll НЕ видят.
- Волновые тесты .01–.04 и .05 конфликтуют с master-счётами — резолв
  «поверх мастера» с ожиданиями на 764/731/161/225.
- Мок style в 000355-репинах не затронут (FX-контракт к задаче не относится).

## Ловушки

- D-CTX-5: после двух успешных кастов mp=4, третий негатив (карта) дал бы
  «не хватает маны» вместо «не здесь» — перед негативной секцией `p.mp = 30`.
- W-08/sync:check на ГРЯЗНОМ дереве краснеет штатно (sync-all отказывается на
  незакоммиченном src/) — зелёный только после коммита (конвенция .12–.16/000344).
- Полные тесты — ОДИН прогон за разом (память no-parallel-full-tests-in-worktree);
  гейт `pgrep -x node | xargs -r ps -o args= -p | grep -c "node --test"` == 0.

## Мутации (поверх GREEN, поверх коммита; git restore между)

- M1 снять контекстный гейт (ветка без ctx.decadance) → краснеют D-CTX-5
  (карта/город/бой/повтор) — /tmp/000348-m1.tap.
- M2 Math.floor → Math.ceil в decadanceLevels → D-FORMULA-7 границы 9/19/… —
  /tmp/000348-m2.tap.
- M3 править описание assets/spells/decadance.json без sync → D-MIRROR-4 +
  «CLI: дрейф src/npc-data.js» (sync-all) — /tmp/000348-m3.tap. ГРАБЛЯ:
  W-08 при этом ЗЕЛЁН (грязь в assets/, а не в src/), а sync-тест «обычный
  режим восстанавливает зеркало» на грязном дереве ПЕРЕГЕНЕРИРУЕТ
  src/spells-data.js из мутантского JSON — после M3 git restore и для
  src/spells-data.js (иначе зеркало остаётся мутированным).

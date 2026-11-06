# 000326 — ссылки свитков assets/items на каталоги (контракт)

Задача = чистое ЗАКРЕПЛЕНИЕ (pin, прецедент 000327): независимый sweep на
базе 219ce4a — 165/165 свитков цёлы, сломанных ссылок НЕТ. Данных правок
нет: новые JSON заклинаний НЕ создавались, ссылки НЕ убирались, schema /
spec / зеркала / CHANGELOG — 0-diff. Закрепление — тестами
tests/scroll-spell-links-000326.test.js (T1–T4).

## 1. Формат ссылки — две РАЗНЫЕ формы (по ФАКТУ КОДА)

### spell_scroll (158 шт.) — effect.spell = id заклинания, НЕ путь
- JSON: `effect = { kind: 'spell', spell: <id> }`, id — латиница
  `^[a-z][a-z0-9_]*$` (пин схемы assets/items/schema.json:29). Ключ — поле
  `id` JSON assets/spells/*.json (зеркало — SPELLS_BY_ID,
  src/spells-data.js).
- Валид src/items.js:301–309 пинит только ФОРМУ id (каталог spells в
  браузере грузится ПОЗЖЕ items.js — memory 000133 §2.4/R5); каталожность
  резолвится тестами (этот sweep T1/T2, items.test.js S1) и при применении:
  S.canLearn/S.learn/S.getSpell(it.effect.spell) с source 'scroll'
  (src/items.js:1015–1022 useItem, :1138–1144 useQuickUnit; src/spells.js
  getSpell :121).
- Составы: 000043–000050 (8 фиксированных 000133) + 000108–000157 +
  000233–000282 (волны 000235.x) + 000460–000484 + 000487–000511
  (волны 000243). Счётный пин 158 — items.test.js S1 (каталог запечатан).

### craft_scroll (6 шт. «Чертёж») — JSON: файловая ссылка; зеркало: id
- JSON: `effect = { kind: 'craft_recipe', recipe: 'assets/craft/NNNNNN.json' }`
  — путь-паттерн схемы (assets/items/schema.json:30; source of truth —
  JSON-каталог).
- src/items.js:321–330 валидирует mirror-форму (id `^[a-z][a-z0-9_]*$`) —
  runtime читает ЗЕРКАЛО: C.CRAFT_BY_ID[it.effect.recipe]
  (src/items.js:1040, :1157).
- scripts/sync-items-data.js:73–82 резолвит путь через
  scripts/lib/json-ref.js resolveRef (not-a-ref | no-file | not-json |
  no-id → exit 1 «битая ссылка на рецепт») и пишет в src/items-data.js
  id рецепта (convention 000211 «пути в assets, id в src»; форма
  зеркальна 000327 «ссылки каталогов = id» — здесь JSON=путь, зеркало=id).
- Пары (файл предмета → ссылка → id): 000077 blueprint_forge →
  assets/craft/000001.json → iron_sword; 000078 → 000004 → healing_potion;
  000079 → 000013 → stone_chisel; 000080 → 000011 → wood_sword;
  000081 → 000008 → hunting_bow; 000082 → 000019 → moonstone_runes.

### resurrection_scroll (1 шт., 000051) — ссылки НЕТ BY DESIGN
- kind `resurrection_scroll` (id `resurrect_scroll`) — ТЗ-формулировка
  «resurrect_scroll» = НЕ kind, фактический kind по коду/schema:
  `resurrection_scroll` (src/items.js:65, schema.json:7).
- effect `{ kind: 'resurrect' }` БЕЗ spell/recipe (контракт D6 000165:
  цель не выбирается, параметры — в combat.js; применение — только в бою).
  В sweep — правило «resurrect ⇔ нет spell/recipe»; нарушение поля =
  красный, отсутствие ссылки — НЕ нарушение.

## 2. Решения
- Отсутствующих/сломанных ссылок нет → ничего не создаём, не убираем,
  JSON свитков не правим (roundtrip: все 165 свитков каноничны
  JSON.stringify(obj,null,2)+'\n'; в каталоге items non-roundtrip только
  schema.json — вне свитков).
- schema 0-diff: ОБА поля описаны (kind enum + spell/recipe паттерны +
  additionalProperties:false); ссылочную семантику (каталожность) в схему
  НЕ дублируем (прецедент 000327).
- spec 0-diff: формат УЖЕ задокументирован — spec/items.md «Свиток
  заклинания» (:229, «spell: <id> … id из assets/spells») и «Чертёж вида
  крафта» (:246, «в JSON — файловая ссылка, в зеркале — id») → ре-пина
  tests/spec-split.test.js НЕТ (items.md остаётся 383).
- Зеркала src/items-data.js / src/spells-data.js 0-diff (данных не меняли;
  перегенерация без правок не меняет файл, но и не нужна).
- CHANGELOG 0-diff: механика/графика не задеты (чистые данные/pin).

## 3. Тесты (tests/scroll-spell-links-000326.test.js)
- T1 — sweep JSON-каталога через checkScrollLinks(itemsDir, spellsDir,
  craftDir) (ЧИСТАЯ функция от каталогов — фикстуры tmp работают):
  spell_scroll → kind/effect/id-форма/∈ id assets/spells; craft_scroll →
  kind/путь-паттерн/файл с id; resurrection_scroll → kind + запрет
  spell/recipe; свитки без effect → нарушение.
- T2 — зеркало: spell — effect deepEqual JSON + ∈ SPELLS_BY_ID; craft —
  id-форма + ∈ id assets/craft + ≡ id резолва JSON-пути; resurrect —
  {kind:'resurrect'} (НЕ копировать слепой deepEqual: путь vs id).
- T3 — self-check чекера фикстурами os.tmpdir() (паттерн 000327 S4):
  чистая → []; кривые spell-id / recipe-в-id-форме / битый craft-путь /
  свиток без effect / resurrect со spell → нарушения с маркером.
  RED-доказательство: на stub-чекере (return []) T3 красная, T1/T2/T4
  зелёные (осмысленная краснота без краха загрузки; RED-коммит df6dcbb).
- T4 — roundtrip-заморозка свитков: множество non-roundtrip файлов kind
  *_scroll = SCROLL_FORMAT_EXCEPTIONS_000326 = [] (двусторонняя заморозка
  LEGACY_STROKE-стиля 000335; legacy-аналога S5 у свитков нет).

## 4. Мутационные проверки (БЕЗ коммита, git restore после каждой)
1. 000043 effect.spell «fireball»→«fireball_x» → T1 (+T2, зеркало≠JSON)
   красные с маркером → restore → зелёные.
2. 000077 effect.recipe «assets/craft/000001.json»→«iron_sword» → T1+T2
   красные + node scripts/sync-items-data.js exit 1 («битая ссылка на
   рецепт: iron_sword (not-a-ref)») → restore → зелёные.
3. 000110 удалить effect → T1 красная («свиток без effect») → зелёные.
4. 000078 effect.recipe → «assets/craft/999999.json» → T1 красная
   («no-file/no-id») + T2 чистый assert («файла нет (no-file)») → зелёные.
5. 000079 reformat (отступ 4) → ТОЛЬКО T4 красная (T1 зелёная —
   заморозка формата независима от ссылок) → зелёные.

## 5. Подводные камни
- W-08 гонка: дрейф-тест 000054 tests/sync-all.test.js мутирует
  src/npc-data.js → sync:check-тесты транзиентно-красны в параллельных
  прогонах (прецеденты 000327/000322); наш diff src/assets не трогает —
  повтор прогона зелёный, НЕ «чинить».
- Мутации JSON откатывать `git restore` (stash запрещён); после мутаций
  проверять git status (в т.ч. что sync-скрипт не переписал зеркало).
- Счётчики spec-split — логический счёт spec-файлов, НЕ wc -l (items.md
  pin 383 при wc -l = 382); мы spec не трогаем.
- Полный прогон — только `node --test tests/` в worktree, один за разом
  (pgrep -af «node --test»); в main-репо npm test рекурсивно гоняет копии
  из .worktrees (memory-прецедент); считать по TAP.
- Динамический sweep (без канареек 158/6/1): 000332/000333 добавляют
  заклинания — новые id цоколятся; свитки они добавлять НЕ должны
  (items.test.js S1 «158 запечатан» — их регресс, не наш).
- Резолв craft-ссылки в тесте — свой existsSync-guard (T2): без него
  битый путь даёт ENOENT-краш вместо чистого assert-сообщения.

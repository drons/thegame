# 000142: Каталог портретов партии (8 SVG-иконок) — контракты (станция Проектирование)

Статус: Проектирование завершено (контракты D1–D16 зафиксированы);
реализация — следующая станция. Дата: 2026-10-06.
Worktree: /home/sas/Documents/Art/thegame/.worktrees/task-000142,
ветка task/000142, база master 45bbada («Мердж: task/000139»).
Базовый npm test: 1696/1696 зелёных (~85 c).
ТЗ: tasks/pending/000142.md (source of truth). Родитель: 000139
(контракт C4, волна A, параллельно 000140/000141).
Арт-справочник (структура каталога, силуэты, палитра, API зеркала):
memory/000142-portraits.md.

## 0. Красное «ДО» (сверено с кодом 45bbada)

* `assets/portraits/` — нет каталога (ls assets/: buildings, cities,
  dungeon, logo.svg, map, mobs, npc, sprites, tiles, ui).
* «портрет»/«portrait» — 0 вхождений в assets/npc/*.json и src/
  (единственные «portrait» — CSS orientation: portrait, не ассеты).
* src/portraits-data.js, scripts/sync-portraits.js, tests/portraits.test.js
  — отсутствуют; тега src/portraits-data.js в index.html нет.
* EXPECTED_SVG_BY_DIR (tests/svg.test.js L436-454) — строки portraits нет.
* Боевые фреймы есть: src/sprites.js PHLOGISTON_ACTIONS (L76), EFIR_FRAMES
  (L101) → assets/sprites/phlogiston|efir/*.svg (64×64) — для D3.
* 8 персон: Флогистон (герой, src/player.js), Эфир (постоянный союзник с
  000081, src/efir.js), 6 наёмных = assets/npc/000012…000017.json — все
  с «описание» и «роль» (наёмник/наёмница):
  merc_volk (Вольк, melee), merc_ashka (Ашка, ranged), merc_baldor
  (Бальдор, shield), merc_mira (Мира, support), merc_torga (Торга, melee),
  merc_rena (Рена, ranged).
* npcId спутника = npc.id (src/companions.js L185: entry = { npcId: npc.id }).

## 1. Что добавлено (карта файлов)

Новые:
| Файл | Что |
|---|---|
| assets/portraits/flogiston.json, efir.json, npc-000012…000017.json | 8 записей, source of truth (паттерн 000053) |
| assets/portraits/flogiston.svg, efir.svg, npc-000012…000017.svg | 8 НОВЫХ иконок 128×128 (D3) |
| scripts/sync-portraits.js | sync-скрипт (шаблон sync-npc-data.js) |
| src/portraits-data.js | ГЕНЕРИРУЕМОЕ зеркало (UMD Game.PortraitsData) |
| tests/portraits.test.js | тесты P1–P6 (красные ДО) |
| memory/000142-portraits-catalog.md, 000142-portraits.md | эти файлы |

Изменённые (все — технические, по одной строке, кроме пина P7):
* index.html — ОДИН тег + 4-строчный коммент (между mob-groups-data.js L755
  и map.js L756).
* tests/index-order.test.js — новый пин-тест P7 (+14 строк) + строка
  'src/portraits-data.js' в списке «нужные модули подключены» (GREEN).
* tests/svg.test.js — строка `portraits: 8,` в EXPECTED_SVG_BY_DIR (GREEN).
* SPEC.md — список каталогов с JS-зеркалом + portraits (D4, 2 вхождения).
* tests/ci.test.js — regex c portraits (D4, 1 строка).

ЯВНО не трогаем: package.json (алиаса sync:portraits НЕТ — прецедент
skills/npc; автоподхват по конвенции имён достаточен),
.github/workflows/ci.yml, scripts/sync-all.js, scripts/lib/write-atomic.js,
игровой код (src/* кроме генерируемого зеркала), CSS, assets/npc/*.json,
assets-schemas.test.js (CATALOGS — механизм 000015 с нумерацией 000001..N,
совместим с фиксированными именами НЕТ; ТЗ схему не требует),
CHANGELOG.md (D15).

## 2. Решения (зафиксированы на стадии Проектирование)

* **D1 — id наёмного портрета = npc.id каталога (merc_volk…merc_rena).**
  Почему: схема ТЗ {id, имя, icon, title, kind, description?} не содержит
  отдельного npcId, а красный тест ТЗ «портрет наёмного совпадает с его
  npcId» требует сопоставимого поля; npcId спутника в companions.js =
  npc.id; потребителю 000145 (entry.npcId → иконка) нужен ровно
  portrait.id === npcId.
* **D2 — icon = имя файла внутри assets/portraits/ (без префикса пути),
  закреплённое равенством «icon = basename(JSON) + .svg».** Почему:
  кратчайшая однозначная связка файл↔иконка, потребитель (000145) сам
  префиксирует assets/portraits/ (единообразие с иконками спрайтов);
  равенство устраняет дрейф «указал svg, которого нет в каталоге».
* **D3 — НОВЫЕ простые SVG, НЕ reuse боевой фреймы.** Почему: фреймы —
  64×64 кадры в полный рост (idle_1/2, move, attack), не портрет;
  reuse: 'sprites.efir.idle_0' ломал бы тест ТЗ «файл svg существует»
  (иконка вне каталога), счётчик EXPECTED_SVG_BY_DIR по каталогам и
  «в стиле logo.svg» (ТЗ); ТЗ даёт выбор — по умолчанию «новые».
* **D4 — SPEC.md + tests/ci.test.js обновить (список каталогов с зеркалом
  += portraits).** Почему: прецеденты 000045/000055/000059 — каждое
  зеркало добавлялось в нормативный список SPEC («в JS-бандлы попадают
  только каталоги, имеющие JS-зеркало (npc, skills, затем buildings,
  spells, items, visuals)» ~L292/L296); regex ci.test.js (L295) создан
  (000045) именно чтобы «не откатить» этот список; правка regex —
  однострочная техническая под новый путь (инвариант разрешает), ТЗ не
  предписывает иное.
* **D5 — имя скрипта ровно `scripts/sync-portraits.js` (по ТЗ); вход —
  ЯВНЫЙ канонический список из 8 файлов, не фильтр /^\d{6}\.json$/.**
  Почему: ТЗ — source of truth (отклонение «ради конвенции» — расхождение
  с ТЗ); SYNC_RE /^sync-.+\.js$/ и listSyncScripts динамические — имя
  подхватывается автоматически, скрытых тестов по именам нет; явный
  список обязателен, т.к. имена смешанные (flogiston.json, npc-000012.json)
  и фильтр 6-цифр не подходит.
* **D6 — форма зеркала: Game.PortraitsData = { PORTRAITS: [8] }, массив в
  каноническом порядке (flogiston, efir, npc-000012…17), без хелперов.**
  Почему: паттерн NpcData/SkillsData (чистый массив, без API); 000145
  построит lookup сам (find по id) — не раздуваем генерируемый файл;
  идемпотентность и byte-идентичность проще.
* **D7 — тег в index.html: ОДИН, между src/mob-groups-data.js (L755) и
  src/map.js (L756) — конец блока данных.** Почему: буквально «после
  данных, до ui.js» (ТЗ); соседний слот свободен; регион не пересекается
  с 000140 (sheet.js: map.js→player.js) и 000133 (building-effect-runes.js
  — уже в мастере, de3fcac) — контракт C4.
* **D8 — пин: НОВЫЙ тест-блок P7 (не-смежный/union):
  pos(mob-groups-data) < pos(portraits-data) < pos(map.js) и
  pos(portraits-data) < pos(ui.js); + строка в списке «нужные модули».**
  Почему: не-смежный пин не ломается, если 000140 вставит свой тег между
  map.js и player.js (и наоборот) — C4; «< ui.js» транзитивно «< main.js»
  (уже запинено) → UMD-ловушка 000038 закрыта: Game.PortraitsData попадает
  в снапшот main.js.
* **D9 — одна строка `portraits: 8,` в EXPECTED_SVG_BY_DIR (svg.test.js).**
  Почему: тест сам предписывает паттерн («новая SVG в каталоге — обновите
  EXPECTED_SVG_BY_DIR»); без строки «ровно N SVG» красный; well-formedness
  и обход новых SVG — автоматически, без правок.
* **D10 — тест sync (P6): exists + конвенция write-atomic + byte-
  идемпотентность + listSyncScripts содержит имя + `sync-all.js --check`
  с guard на dirty-дерево.** Почему: --check по конструкции exit 1 на
  незакоммиченных src/ («не переписываю их молча») — в dev-состоянии
  (до коммита) тест делает t.comment (пропускает этот подпункт честно),
  в финальной верификации (после коммита) и в CI подпункт реален; сам
  механизм --check уже покрыт tmp-репо в tests/sync-all.test.js.
* **D11 — description: у наёмных = точно «описание» из assets/npc/0000NN.json
  (sync сверяет равенство); у героя/духа — авторские 1 строка (тексты
  зафиксированы в memory/000142-portraits.md §1).** Почему: одна точка
  правды для лора наёмных; sync-скрипт — guard от дрейфа (поправка NPC
  красит sync:check и требует правки портрета в той же задаче).
* **D12 — title: «Герой» (flogiston), «Дух» (efir), у наёмных =
  upperFirst(npc.роль) — «Наёмник»/«Наёмница» (sync сверяет).** Почему:
  единый вид UI-подписи (все с заглавной) при одной точке правды
  (каталог NPC); transform детерминирован (одна строка в sync).
* **D13 — SVG: фикс 128×128 (width/height=128, viewBox "0 0 128 128"),
  статичные, плоский вектор, медальон в стиле logo.svg.** Почему: ТЗ
  «квадратные, ≤128px» — фикс на максимум даёт 000145 единый масштаб
  (CSS уменьшит); статично, т.к. это иконки кнопок, а не боевые кадры.
* **D14 — зеркало = ЧИСТЫЙ данные-UMD: без require, без DOM, без
  console.error и без гардов при загрузке (зависимостей нет).** Почему:
  ~20 vm-песочниц с ДИНАМИЧЕСКОЙ цепочкой из index.html (тест 000130,
  ui-efir, main-visuals, building-effects B, save-restore,
  companions-cycle, start-window и др.) подхватят тег автоматически и
  требуют errors.length === 0; паттерн skills-data/npc-data.
* **D15 — CHANGELOG: НЕ добавлять.** Почему: иконки никуда не рендерятся
  до 000145 (нет UI-читателя) — player-visible изменения нет; ТЗ: «сам по
  себе не меняет геймплей».
* **D16 — НЕ добавлять: schema.json в assets/portraits, CATALOGS в
  assets-schemas.test.js, алиас sync:portraits в package.json.** Почему:
  механизм 000015 требует нумерации 000001..N.json — не вписывается в
  фиксированные именованные файлы; ТЗ не просит (инвариант «не больше и
  не меньше»); автоподхват по конвенции имён работает (прецедент:
  skills/npc без алиасов).

## 3. Контракты и границы

### 3.1 Каталог assets/portraits/ (source of truth)

Ровно 8 файлов, канонический порядок (зеркало генерирует в НЁМ, не по
readdir): flogiston.json, efir.json, npc-000012.json, npc-000013.json,
npc-000014.json, npc-000015.json, npc-000016.json, npc-000017.json.
Чужих файлов нет (тест P1 + fail в sync). Имя наёмного =
`npc-<номер npc-каталога>.json` — номер — прямая связка с
assets/npc/<номер>.json.

Схема записи (все 8; ПОРЯДОК КЛЮЧЕЙ JSON — канонический, генератор его
сохраняет): `{"id","имя","icon","title","kind","description"}`.
* id — `^[a-z][a-z0-9_]*$`, уникальны; у наёмных = npc.id (D1).
* имя — не пустое; у наёмных = npc.имя.
* icon — `^[a-z0-9-]+\.svg$`, = basename(JSON)+.svg (D2), файл существует.
* title — UI-подпись (D12).
* kind — фиксирован файлом: flogiston.json → 'hero', efir.json → 'efir',
  npc-*.json → 'merc' (sync сверяет). Совпадает с kind листов персонажа
  000139 (createSheet(kind, initial)) — 000145 мапит портрет → лист без
  доп. кода.
* description — у наёмных = npc.описание (D11), у героя/духа — авторское.

Значения 8 записей — таблица в memory/000142-portraits.md §1.

### 3.2 Связка с NPC-каталогом (сверка в sync-portraits.js, exit 1 при
дрейфе)

Для npc-0000NN.json: id === NPC.id (npcId спутника), имя === NPC.имя,
title === upperFirst(NPC.роль), description === NPC.описание. Тест P4
проверяет id (обязательно по ТЗ) + имя (контракт, дёшево).

### 3.3 scripts/sync-portraits.js

* Имя — ровно sync-portraits.js (D5). Вывод — src/portraits-data.js.
* Вход — явный канонический список 8 файлов; лишний файл в каталоге →
  fail (защита от мусора).
* Валидация — схема 3.1 + kind↔файл + icon↔basename + связка 3.2 +
  существование svg. Ошибки → console.error + exit 1 (стиль
  sync-npc-data.js).
* Генерация — jsValue/jsObjectAt (шаблон sync-npc-data.js): стабильная
  сериализация → идемпотентность (повторный запуск byte-identical,
  тест P6c). Заголовок выходного файла: «ГЕНЕРИРУЕТСЯ скриптом
  scripts/sync-portraits.js, не редактируйте вручную» + «npm run
  sync:all» (алиаса sync:portraits НЕТ — не выдумывать).
* Запись — ТОЛЬКО writeFileAtomic (require('./lib/write-atomic.js'));
  прямой fs.writeFileSync — запрещён (конвенционный тест
  tests/sync-all.test.js сканирует ВСЕ scripts/sync-*.js автоматически).
* Итог в stdout: «src/portraits-data.js перегенерирован: 8 портретов.»
* Автоинтеграция (без правок): listSyncScripts (sync-all.js) находит
  sync-*.js динамически → npm run sync:all / sync:check (CI-гейт
  .github/workflows/ci.yml) подхватывают новый скрипт сами.

### 3.4 src/portraits-data.js (зеркало, генерируется)

UMD-оболочка идентична src/npc-data.js:
`root.Game = Object.assign({}, root.Game, { PortraitsData: factory() })`
(браузер) / module.exports = factory() (node). API:
Game.PortraitsData.PORTRAITS — массив из 8 (node:
require('src/portraits-data.js').PORTRAITS). Без хелперов (D6).
Коммитится в репозиторий (фолбэк file://, паттерн npc-data.js).

### 3.5 index.html + пин

Один тег с комментом — между L755 (mob-groups-data.js) и L756 (map.js)
(D7; точный текст — memory/000142-portraits.md §5). Пин P7 (D8). C4: при
ребейзе сохранить чужие теги (000140: sheet.js); union-пины держат
порядок обоих автоматически.

### 3.6 SVG (8 иконок)

Фикс 128×128 (D13); медальон logo.svg; силуэты/палитра —
memory/000142-portraits.md §3. Гейт — 000120 (tests/svg.test.js, три
уровня): well-formedness (строгой: без &/DOCTYPE/CDATA, кавычки
закрыты, без дубликатов атрибутов, без мусора после </svg>), корень
<svg> + xmlns + viewBox (4 конечных числа; у нас + width/height=128),
без NaN/Infinity/пустых значений атрибутов (легально только
transform=""). ВАЖНО: <filter>/<text>/xlink гейтом НЕ запрещены
(logo.svg — «тяжёлый» позитивный пример); их отсутствие у портретов —
дизайн-решение (чистота иконок), а не требование 000120 — не путать в
отчётах. Все 8 обязаны пройти npm test (svg-гейт) ДО коммита
(правило SPEC/000120) + xmllint --noout (не ловит NaN — только
svg.test.js). Id градиентов — префикс per-file (fl_, ef_, m12_…m17_).
Счётчик: EXPECTED_SVG_BY_DIR += portraits: 8 (D9, GREEN).

## 4. Ленивые ссылки и гарды; владение состоянием

* Состояния НЕТ: задача — статические данные (JSON → генерируемое
  зеркало). Ни один модуль не владеет mutable-состоянием; игровой код,
  сейвы, RNG не трогаются (ТЗ «Игровой код не трогать»; активный
  персонаж — per-session, «в сейв НЕ пишем» — 000139 §3).
* src/portraits-data.js — чистый данные-UMD (D14): без require, без
  DOM, без console.error при загрузке, без гардов (зависимостей нет —
  деградировать нечему; паттерн skills-data/npc-data).
* Тег ДО main.js (запинено P8) → Game.PortraitsData в снапшоте main.js
  (UMD-ловушка 000038: снапшот Game один раз) → 000145 может взять
  Game.PortraitsData в свой rootRef-снапшот.
* Потребитель 000145 (ВНЕ scope этой задачи, контракт для неё): читать
  Game.PortraitsData в момент вызова (ленивые ссылки, паттерн
  src/cities.js/dungeon.js/building-effects.js); guard — при отсутствии
  Game.PortraitsData: console.error + деградация (ряд портретов не
  рисуется), игра не падает.
* sync-portraits.js — build-инструмент, вне игры — гардов не имеет.

## 5. Что важно будущим задачам (из ТЗ-ссылок)

* **000145** (потребитель, «Персонаж»: выбор активного персонажа;
  блокируется этой задачей): ряд иконок сверху (000139 §3: «UI (000145/
  000146): „Персонаж“ = ряд портретов сверху (000142) + лист»); Эфир —
  при efir_met, наёмные — нанятые; клик = активный (per-session, дефолт
  Флогистон, в сейв не пишем). Иконка: `assets/portraits/` + p.icon
  (префикс — у потребителя, D2); связка: entry.npcId (companions.js) /
  'flogiston' / 'efir' → PORTRAITS.find(p => p.id === …); p.kind —
  готовый kind листа (hero/efir/merc).
* **000140** (параллельно, волна A): ОБЩИЕ index.html +
  tests/index-order.test.js (C4). Регионы не пересекаются (sheet.js:
  map.js→player.js). Если 000140 смержится первой — её тег сосуществует
  с нашим; при ребейзе сохранить оба тега, пины union.
* **000141** (параллельно): правит assets/npc/000012-17.json (наём.
  базовые_характеристики/начальные_навыки). Наш sync сверяет
  id/имя/роль/описание: если 000141 (или любая будущая задача) поправит
  описание/имя/роль — sync:check красный, портрет обязан обновиться в
  той же задаче (контракт 3.2).
* **Будущее расширение партии** (новый спутник): новый файл
  npc-0000NN.json + .svg в каталоге + запись в ЯВНЫЙ список
  scripts/sync-portraits.js (не авто!) + portraits: N в
  EXPECTED_SVG_BY_DIR.
* **000146/000147** — ряд портретов живёт в ui-tab-skills.js
  («Персонаж»); каталог/зеркало не трогают.

## 6. Подводные камни

1. **EXPECTED_SVG_BY_DIR**: строка `portraits: 8` в GREEN, иначе тест
   «ровно N SVG» красный. Правится ровно одна строка (паттерн 000120).
2. **Строгий парсер 000120**: без `&` (сущности), без DOCTYPE/CDATA, без
   пустых значений атрибутов (трансформ "" легален), кавычки закрыты,
   дубликатов атрибутов нет, мусора после </svg> нет. Типичный дефект
   генераторов — NaN (таблица — memory/000120-svg-schema.md).
3. **UMD-ловушка 000038**: тег после main.js или «грязная» загрузка
   модуля → PortraitsData вне снапшота / vm-песочницы красные.
   Закрыто пином P7 + чистотой D14.
4. **Имя sync-portraits-data.js «ради конвенции»** — расхождение с ТЗ
   (source of truth). Имя закреплено ТЗ и этим файлом (D5).
5. **Фильтр /^\d{6}\.json$/ из sync-npc-data.js НЕ переносить**: имена
   смешанные — только явный канонический список (D5).
6. **sync:check на dirty-дереве** — exit 1 по конструкции (не
   переписывает незакоммиченные src/). Тест P6: git status src/ не
   пуст — t.comment (честный пропуск), реальная проверка — после
   коммита и в CI.
7. **C4 при ребейзе**: не потерять тег 000140 (sheet.js) и чужие пины;
   union-пины держат порядок обоих тегов автоматически.
8. **Порядок ключей JSON канонический** (id, имя, icon, title, kind,
   description) — генератор сохраняет порядок ключей; порядок записей в
   зеркале = канонический порядок файлов (не readdir).
9. **Флейк vm-тестов** (3 параллельных worktree —
   memory/test-runner-worktrees.md): упал чужой тест — перепуск
   `node --test tests/<файл>` + запись в отчёт.
10. **description наёмных — не выдумывать**: ровно npc.описание (sync
    сверяет равенство); одна точка правды — каталог NPC (D11).
11. **«filter запрещён схемой 000120» — НЕВЕРНО** (ошибка в черновике
    анализа a2): гейт 000120 filter/text/xlink не запрещает (logo.svg —
    позитивный «тяжёлый» пример); у иконок их нет по дизайн-решению
    §3.6.

## 7. Красные тесты (RED-фаза)

tests/portraits.test.js — НОВЫЙ файл, все тесты node; ЧТЕНИЕ ФАЙЛОВ
ЛЕНИВОЕ ВНУТРИ test() (fs.existsSync/readFileSync в теле) — каждый фейл
осмысленный (ENOENT/«нет поля»), не крах файла (паттерн 000091, ленивое
чтение motion.js в index-order.test.js).

* **P1 каталог**: ровно 8 файлов (flogiston, efir, npc-000012…17), чужих
  нет; JSON парсится; поля id/имя/icon/title/kind — строки, не пустые;
  icon = *.svg; kind ∈ {hero, efir, merc}; id уникальны,
  ^[a-z][a-z0-9_]*$; kind согласован с файлом.
* **P2 иконки существуют**: assets/portraits/<icon> на диске (8 файлов).
* **P3 svg-схема (лёгкий regex-чекер, паттерн
  checkCharacterFrameErrors sprites.test.js L1672-1703)**: корень <svg>
  с xmlns, viewBox ровно "0 0 128 128", width/height = 128, без
  NaN/Infinity, <title> содержит имя. FULL well-formedness НЕ
  дублируется — территория tests/svg.test.js (прецедент sprites.test.js
  L1743; требовать .test.js из .test.js нельзя — тесты зарегистрируются
  повторно).
* **P4 связка**: portrait npc-0000NN.json.id === assets/npc/0000NN.json.id
  (ТЗ: npcId) + имя совпадает (контракт 3.2); 6 наёмных покрыты ровно по
  одному разу.
* **P5 зеркало**: src/portraits-data.js (лениво existsSync → require) —
  PORTRAITS.length === 8; каждая запись deepEqual с записью каталога
  (ВСЕ поля, включая description), порядок канонический.
* **P6 sync**: (a) scripts/sync-portraits.js существует; (b) тело
  требует write-atomic.js, нет fs.writeFileSync; (c) spawn
  `node scripts/sync-portraits.js` → exit 0, зеркало byte-идентично
  (идемпотентность); (d) listSyncScripts(ROOT) (require
  scripts/sync-all.js) содержит 'sync-portraits.js'; (e) spawn
  `node scripts/sync-all.js --check` → exit 0; если git status src/ не
  пуст (dev-состояние) — t.comment (см. D10/камень 6).
* **P7** (tests/index-order.test.js, НОВЫЙ test-блок):
  pos('src/portraits-data.js') !== -1; pos(mob-groups-data) <
  pos(portraits-data) < pos(map.js); pos(portraits-data) < pos(ui.js).
  Красный ДО: pos === -1 (паттерн 000091/000137).

Ожидаемый RED: 1703 теста, красны РОВНО 7 новых (P1–P7), остальные
1696 зелёные. Существующие тесты в RED НЕ правятся (строка в списке
«нужные модули», svg.test.js, SPEC, ci.test.js — всё в GREEN вместе с
артефактами).

## 8. Коммитный план (ветка task/000142)

1. «Задача 000142: красные тесты портретов» — tests/portraits.test.js +
   пин P7 в tests/index-order.test.js + memory/000142-*.md (память
   коммитится на красной стадии вместе с тестами). npm test: 1703,
   красны ровно P1–P7.
2. «Задача 000142: каталог портретов (8 JSON + 8 SVG) + sync + зеркало +
   тег + пин» — все артефакты + технические строки (svg.test.js,
   список index-order, SPEC, ci.test.js). npm test зелёный (1703),
   npm run sync:check зелёный.
3. «Задача 000142: отчёт» — tasks/result/000142.md.
CHANGELOG — нет (D15). Перенос tasks/pending/000142.md → tasks/done/ —
на стадии мержа.

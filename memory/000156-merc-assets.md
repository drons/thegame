# Ассеты наёмных NPC — дизамбигуация и дизайн-премисса (handoff)

Дата: 2026-10-06 (станция Проектирование workflow task-000156).

## 0. КАНОНИЧЕСКИЙ НОМЕР: это задача 000152, НЕ 000156

Бриф workflow 000156 (рестарт-волна) содержал УСТАРЕВШУЮ до-рестартную
номенклатуру: «Ассеты для наёмных NPC (экран боя + экран найма)» под
номером 000156. Факт на master `3c0e1b4`:

* `tasks/pending/000156.md` — исследовательская задача о ВОСКРЕШЕНИИ
  (контракт — `memory/000156-resurrection-design.md`).
* Текст ассетного брифа (буква в букву, включая опечатку «должна
  примняться») = **`tasks/pending/000152.md`** (создан коммитом
  `4230a1e`).
* Для 000152 **уже существует worktree `.worktrees/task-000152`**
  (ветка task/000152, HEAD=master, чист) в этой же рестарт-волне.

**Вывод:** ассетная работа выполняется workflow 000152 в её worktree.
В worktree task-000156 ассеты НЕ делаются (одна задача = один worktree;
дублирование = add/add-конфликты sprites.js/combat-ui.js/ui.js/тестов).
Этот файл — дизайн-премисса и карта для workflow 000152 (материал
a3-анализа рестарт-прогона, сохранённый от потери).

## 1. ТЗ (tasks/pending/000152.md)

Для каждого персонажа NPC, которого можно нанять, сгенерировать ассеты
для отображения. Вид персонажа — уникальный и соответствующий его
классу. Ассеты применяются на экране боя и экране найма NPC.

## 2. Где лежат ассеты и в каком формате (дизайн-премисса)

* **Каталог: `assets/sprites/mercs/` — одна «семейная» папка** (паттерн
  `assets/sprites/mobs/` — 192 файла в одном каталоге, НЕ по 6 папок на
  NPC). Имена: `<npcId>_idle_{1[,2]}.svg` (v1 — action 'idle',
  allyFrames вызывается с 'idle'; 2 кадра — опционально, прецедент
  EFIR 000034/000114).
* **6 нанимаемых** (каталог assets/npc, финален, не менять):
  merc_volk (melee), merc_torga (melee), merc_ashka (ranged),
  merc_rena (ranged), merc_baldor (shield), merc_mira (support) —
  силуэт по классу, стилистика — в согласии с существующим боевым
  артом (mobs/phlogiston/efir).
* **SVG-гейт (memory/000120):** каждый новый SVG ОБЯЗАН пройти
  `checkSvg` (well-formed, корень `<svg>` + xmlns + viewBox 4
  конечных числа, без &/DOCTYPE/CDATA/NaN, без пустых атрибутов) ДО
  помещения в assets/ — полный обход tests/svg.test.js работает
  как гейт.
* **tests/svg.test.js — `EXPECTED_SVG_BY_DIR`: ДОВЕСИТЬ ОДНУ строку**
  `'sprites/mercs': <N>` (6 при 1 кадре, 12 при 2) — осознанное
  техническое обновление по комментарию самого файла («при добавлении
  SVG правится ровно одна строка»), прецедент 000034 (sprites/efir).
* **tests/mob-art.test.js** — область `assets/mobs` (36 мобов); новый
  каталог вне её — правок не требует.

## 3. Привязка к npcId и выбор спрайтов (контракт экспортов)

* **src/sprites.js** (СУЩЕСТВУЮЩИЙ модуль — таблица-литерал внутри,
  прецедент EFIR_FRAMES; НОВЫХ модулей/index.html-тегов/sync-скриптов
  НЕТ → index-order/ci/sync-пины без правок):
  * `MERC_FRAMES` — таблица `{ npcId → { idle: [пути] } }`;
  * `mercFrames(npcId, action)` — чистая функция; неизвестный id →
    `[]` (деградация, не crash);
  * `allAssetPaths()` — + merc-семья (без дублей; пин L408 «все файлы
    существуют» остаётся зелёным).
* **src/combat-ui.js `allyFrames`** (боевой выбор): ветка 'merc' —
  per-npcId-поиск: `u.id` является npcId каталога → `G.mercFrames ?
  G.mercFrames(u.id, action) : []`; иначе fallback
  `G.MOB_FRAMES[ALLY_MERC_KIND]` (без изменений). Ветка 'efir' —
  ПЕРВАЯ и не трогается. `ALLY_MERC_KIND='orc'` (L48) — константа-
  заглушка НЕ «чинится» (memory/000084 §2: смена значения — только с
  новым пин-тестом). Почему per-npcId, а не per-класс: ноль
  семантических правок существующих пинов + «уникальный вид» на
  персонажа (ТЗ просит уникальность на персонажа).
* **Детерминизм/деградация:** кадр = `mercFrames(id, 'idle')[
  frameIndex(NOW84, x, y, len)]` (паттерн efirFrames); без sprites.js —
  0 drawImage на клетке, 0 console.error (гард G1).

## 4. Экран найма (src/ui.js `renderHireTab`)

* Строка кандидата (`.cp-itemrow`) — `<img>` ДО `.cp-itemname`:
  `src` = `assets/sprites/mercs/` + `m.id` + `_idle_1.svg` (выводится
  из `m.id` — БЕЗ портретного каталога и без новых цепочек). Строго по
  ТЗ: «сгенерированные ассеты применяются на экране найма».
* **`img.src` — обычное свойство** (`img.src = …`), НЕ setAttribute:
  DOM-стаб тестов (makeEl, npc-hire-ui.test.js L141) пишет
  setAttribute в dataset; продуктовый паттерн уже есть (ui.js
  L1408/1420 — actionIcon.src).
* Порядок строки имя→meta→кнопка сохранён (пин U2 —
  `row.children.indexOf`: img до имени даёт (1,2,3) → зелёный).
* Пины class-based (`.cp-itemname`/`.cp-itemmeta`) — `<img>` их не
  ломает. Каталог портретов 000142 (assets/portraits/, 8 записей,
  128×128) — для выбора персонажа (страница «Персонаж», 000145),
  боевой/наймовый ассет — отдельный; переиспользовать портрет на
  найме можно только технически (CHAIN-правки), по ТЗ — генерируемый
  merc-ассет (решено в пользу merc-ассета).
* readonly-список (деградация без Game.companions) — `<img>` ставить
  НЕ обязательно (гард G2: строки intact, новых console.error нет;
  пин 000078 не ломается ни при каком варианте).

## 5. Красные тесты 000152 (план a3 — для workflow 000152)

RED-5 (падают «отсутствием»), гарды 2 (зелёные с первого дня):

| id | где | что | почему красен |
|----|-----|-----|----------------|
| M1 | node, sprites.test.js | MERC_FRAMES + mercFrames: 6 нанимаемых с уникальными idle-кадрами в assets/sprites/mercs/; файлы существуют; неизвестный id → [] | экспортов нет |
| M2 | node, sprites.test.js | allAssetPaths(): merc-кадры в очереди, без дублей, файлы существуют | merc-семья не собирается |
| C1 | vm, combat-ui.test.js | makeAlly({id:'merc_volk',…}) рисует assets/sprites/mercs/merc_volk…; кадр = mercFrames(id,'idle')[frameIndex(…)]; orc НЕ запрашивается | allyFrames всегда MOB_FRAMES['orc'] |
| C2 | vm, combat-ui.test.js | merc_volk + merc_ashka в одной сцене — РАЗНЫЕ изображения; фикстура без npcId (addMerc84, id 'a1') — orc-fallback (пин 000084 L1490 жив); ветка Эфира не тронута | per-npcId-ветки нет — оба рисуют один orc |
| H1 | vm, npc-hire-ui.test.js | строка каждого из 6 кандидатов несёт <img> с уникальным src (файл существует); порядок имя→meta→кнопка (U2) | renderHireTab рисует только span+button |

* G1 (vm, combat-ui, withSprites=false): наёмник с npcId без
  sprites.js — 0 drawImage, 0 console.error.
* G2 (vm, npc-hire-ui, деградация): readonly-строки intact, новых
  console.error нет.
* Базовая (worktree task-000152, master 3c0e1b4): 1732 pass / 0 fail.
* После RED: полный npm test — fail = ровно 5 (M1, M2, C1, C2, H1);
  `npm run sync:check` — чисто (новых sync-скриптов нет).

## 6. Что НЕ тронуто / не трогать (границы)

* **Рендер-путь боя** (000151 — масштаб текстур, свой worktree) —
  НЕ трогать; правки 000152 ограничены функцией `allyFrames`.
* **src/ui.js** — 000145 правит страницу «Персонаж» (другие функции) +
  ui-tab-skills.js: правки 000152 — только renderHireTab /
  renderHireTabReadonly / hireRowMeta (+ локальный хелпер пути).
* **assets/npc/*.json + src/npc-data.js** — финален (6 записей), не
  менять. **assets/portraits/ + src/portraits-data.js** (000142) —
  финален, не менять.
* **index.html — новых <script>-тегов НЕТ** (MERC_FRAMES внутри
  sprites.js) → tests/index-order.test.js, tests/ci.test.js,
  sync-all.js — без правок; UMD-ловушка 000038 не затрагивается.
* **tests/combat-ui.test.js** — не правится (per-npcId-дизайн:
  addMerc84 → id 'a1' → orc-fallback, 000084-пин L1490 зелёный);
  новые секции — В КОНЦЕ файла.
* **Рендер/логика боя 000156 (воскрешение)** — не пересекаются:
  000156 не правит ни sprites.js, ни combat-ui.js, ни ui.js, ни
  assets/ (исследовательская; код — в подзадачах 000161–000166:
  companions/main/spells/efir/building-*).

## 7. Устаревшие номера брифа 000156 → факт (таблица)

| бриф 000156 (устарело) | факт на master 3c0e1b4 |
|---|---|
| 000156 = ассеты наёмных | **000152** (этот файл) |
| 000152 = ход моба | **000155** (A* мобов) |
| 000154 = HUD-кнопки | **000150** (скрытие [E]/[I]) |
| 000155 = рендер-масштаб боя | **000151** (масштаб текстур) |
| 000145 = ui.js/ui-tab-skills.js | **000145** (совпадает: страница «Персонаж») |
| (инициатива/порядок ходов) | **000154** |

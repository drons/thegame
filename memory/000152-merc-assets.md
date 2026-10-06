# Задача 000152 — Ассеты наёмных NPC (экран боя + экран найма): контракт

Статус: ПРОЕКТИРОВАНИЕ завершено (workflow task-000152, ветка task/000152,
база master 6047b1c). Файл коммитится на стадии красных тестов вместе с
тестами; реализация следует контрактам ниже. Supersedes
`memory/000156-merc-assets.md` (дизайн-премисса/handoff рестарт-волны,
остаётся на master как исторический документ; расхождений нет, кроме числа
кадров: handoff 6|12 → решение **12**, см. D1). Нумерация: 000152 — канон
(прецедент ренумерации — memory/task-numbering-conflicts.md; `memory/
000152-combat-pathfinding.md` — чужой файл задачи 000155/A*, не смешивать).

## 0. Что добавлено / перенесено

Добавлено (всё новое — дифф только в ДАННЫХ: какие спрайты использует
наёмник; логика/рендер не трогаются):

1. **Каталог `assets/sprites/mercs/` — 12 новых SVG** (6 × 2 кадра idle):
   `merc_volk_idle_{1,2}.svg`, `merc_torga_idle_{1,2}.svg`,
   `merc_ashka_idle_{1,2}.svg`, `merc_rena_idle_{1,2}.svg`,
   `merc_baldor_idle_{1,2}.svg`, `merc_mira_idle_{1,2}.svg`.
2. **`src/sprites.js`**: таблица-литерал `MERC_FRAMES`, чистая функция
   `mercFrames(npcId, action)`, merc-семья в `allAssetPaths()`, 2 экспорта.
   Модуль не нов — вставка в существующий (UMD-подпись и require-список
   НЕ меняются).
3. **`src/combat-ui.js`**: merc-ветка в `allyFrames` (per-npcId + orc-
   fallback) + обновление комментария.
4. **`src/ui.js`**: `<img class="cp-itemicon">` в строке кандидата
   `renderHireTab` + локальная константа `MERC_ICON_DIR`.
5. **`index.html`**: одно CSS-правило `.cp-itemicon`.
6. **Тесты**: 5 красных (M1/M2 — sprites.test.js; C1/C2 — combat-ui.
   test.js; H1 — npc-hire-ui.test.js) + 2 гарда (G1 — combat-ui.test.js;
   G2 — npc-hire-ui.test.js) — все новые секции В КОНЦЕ файлов;
   техническая правка одной строки `EXPECTED_SVG_BY_DIR` в svg.test.js.
7. **CHANGELOG.md**: новый подзаголовок «### Графика» (игрок видит
   уникальных наёмников) — отдельный коммит.

Перенесено/повторено без изменений: паттерн EFIR_FRAMES/efirFrames
(000034), паттерн `el('img')` + `img.src` (ui.js actionIcon), очередь
загрузки `allAssetPaths()` (main.js), svg-гейт 000120, палитры/силуэты
000142. НОВЫХ модулей, `<script>`-тегов, sync-скриптов, JSON-каталогов —
НЕТ.

## 1. Где лежат ассеты (формат, каталог) — D1/D2

- **Каталог: одна «семейная» папка `assets/sprites/mercs/`** (паттерн
  `assets/sprites/mobs/` — 192 файла в одном каталоге; НЕ по папкам на
  NPC). **Имена: `<npcId>_idle_{1,2}.svg`** — 12 файлов.
- **Решение 2 кадра idle (12 SVG), не 1 (6)**: все существующие боевые
  персонажи — 2-кадровый idle (phlogiston 4×2, efir 4×2, базовые мобы 6×2);
  наёмник статичный рядом с анимированным Эфиром выглядел бы «мёртвым»;
  контекст ТЗ — «стиль в согласии с существующим боевым артом». Кадр 2 —
  тонкая вариация (±1px голова/плечи, наклон оружия), силуэт идентичен.
  Код от числа кадров не зависит (`frameIndex` при n≤1 → 0): при урезании
  до 6 пострадают только счётчик svg.test.js и M1.
- **Формат каждого SVG** (гейт 000120 — memory/000120-svg-schema.md, ДО
  помещения в каталог):
  * `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">` —
    семья персонажных кадров (phlogiston/efir/базовые мобы); НЕ 100×100
    (личный моб-арт) и НЕ 128×128 (портреты). Заголовок-комментарий —
    как у phlogiston.
  * Прозрачный фон (полноэкранного `<rect>` НЕТ), тень-эллипс под ногами
    (паттерн phlogiston/мобов, opacity ~0.3), персонаж в полный рост
    ~40–50px, плоский вектор + тонкий тёмный контур (MOBS.md).
  * Статичны: без SMIL/`<text>`/`<script>`/внешних ссылок (xlink/http/
    `<image>`), без `&`/DOCTYPE/CDATA/NaN/пустых атрибутов.
  * `defs`-id — per-file префикс `mrc12_` … `mrc17_` (NN — номер файла
    assets/npc/0000NN.json; паттерн 000142) — чистота id-пространства.
  * `<title>` — «Имя — роль» (пример: «Вольк — ближний бой»).
  * **≥30 контурных деталей на файл** (MOBS.md, 1×1):
    `node scripts/count-svg-details.js --min 30 assets/sprites/mercs/*.svg`.
  * Проверка ДО коммита: полный `npm test` (svg-гейт) + `xmllint --noout`.

## 2. Силуэты и палитры (уникальность по класу + идентичность 000142) — D3

Класс → силуэт: melee = оружие/кулак в руке, shield = щит впереди,
ranged = лук (+колчан), support = ветка + свечение, без оружия. 6
силуэтов попарно различимы и отличаются от orc-заглушки. Палитры —
канон memory/000142-portraits.md §3 (портреты assets/portraits/ НЕ
трогаются, НЕ переиспользуются: 128×128 голограмма для страницы
«Персонаж» — не несёт класс-силуэт, требующий ТЗ):

| npcId (0000NN) | имя | роль | маркер класа в силуэте | палитра |
|---|---|---|---|---|
| merc_torga (000016) | Торга | melee | кулаки: стойка боксёра, сжатый кулак впереди, оружия НЕТ | бритая голова #e0b088, повязка #6b4f33, застёжка #d9a63a |
| merc_volk (000012) | Вольк | melee | меч: клинок #8f97a3, рукоять #6b4f33, гарда #d9a63a | рыжие волосы #b0562e, шрам #8a4a3a, тёмная туника #3a3468 |
| merc_baldor (000014) | Бальдор | shield | большой круглый щит ПЕРЕД грудью: поле #cfd6dd, босс #d9a63a | борода #6b4f33, лицо #e8b98a |
| merc_mira (000015) | Мира | support | ветка с листьями #3a4a3f + лечебное свечение #a5e86b (op 0.5); оружия НЕТ | коса #c9a06a, лицо #f0c49e, туника #5a626e |
| merc_ashka (000013) | Ашка | ranged | лук через плечо: дерево #6b4f33, струна #d8d3c5 | серо-зел. капюшон #3a4a3f, светлые волосы #d9d3bf, глаза #2c3550 |
| merc_rena (000017) | Рена | ranged | лук + колчан (оперение #8df2ff/#e8c56a) + зигзаг-молния #8df2ff у плеча | фиолет. волосы #7a68b8, глаза-искра #8df2ff |

Тестами фиксируется только УНИКАЛЬНОСТЬ (6 парно-разных путей, M1/H1) и
формат 64×64 (M1); «соответствие класу» — визуальная премисса (QA по
таблице).

## 3. Привязка к npcId и контракты (sprites.js) — D4

* `MERC_FRAMES` — таблица-литерал `{ <npcId>: { idle: [p1, p2] } }`,
  ровно 6 ключей = id из assets/npc/*.json (merc_volk, merc_ashka,
  merc_baldor, merc_mira, merc_torga, merc_rena — каталог финален).
  Вставка — после `EFIR_FRAMES` (L119), до секции «Группы мобов».
* `mercFrames(npcId, action)` — чистая функция (вставка после
  `efirFrames`, L581–583): `MERC_FRAMES[npcId] ? MERC_FRAMES[npcId]
  [action] || [] : []`; неизвестный id/действие → `[]` (деградация,
  не crash). Не зависит от загрузки (паттерн efirFrames).
* `allAssetPaths()` — += 12 merc-путей (блок после EFIR-цикла L694);
  без дублей (тест sprites.test.js «все файлы существуют, без дублей» —
  файлы обязаны быть на диске). main.js выставляет в spriteLoader
  именно этот список → браузер подхватит кадры автоматически.
* Экспорты — += `MERC_FRAMES`, `mercFrames` (return-объект L835+).
* **UMD-чистота**: ни одного нового require; factory-подпись (map.js,
  mob-groups-data.js, visuals-data.js) не меняется.

## 4. Как выбирает бой (combat-ui.js `allyFrames`) — D5

ЕДИНСТВЕННАЯ правка боевого пути (L532–540):

```js
if (u.kind === 'efir') frames = G.efirFrames ? G.efirFrames(action) : [];
else if (u.kind === 'merc' && u.id) {
  frames = G.mercFrames ? G.mercFrames(u.id, action) : [];
  if (!frames.length)
    frames = G.MOB_FRAMES ? (G.MOB_FRAMES[ALLY_MERC_KIND] || []) : [];
}
else frames = G.MOB_FRAMES ? (G.MOB_FRAMES[ALLY_MERC_KIND] || []) : [];
```

* **Ключ выбора — `u.id` = npcId** (в игре: `companions.allyDataForEntry`
  → `id: npc.id` → `makeAlly` → `id: data.id`). Per-персонажа, НЕ
  per-класс: ТЗ просит уникальность на персонажа; ноль семантических
  правок существующих пинов.
* **orc-fallback ОБЯЗАТЕЛЕН**: тестовые наёмники без npcId (helper
  `addMerc84` → id `'a1'`) и неизвестные id → `MOB_FRAMES['orc']` —
  пин 000084 (tests/combat-ui.test.js «наёмник: спрайт моба-архетипа»)
  и golden-детерминизм остаются зелёными БЕЗ ПРАВОК.
* Ветка `efir` — ПЕРВАЯ, не трогается. `ALLY_MERC_KIND = 'orc'`
  (L52) — константа-фолбэк, НЕ «чинится» (контракт
  memory/000084-ally-render.md §2: смена значения — только с новым
  пин-тестом). Кадр — `frames[G.frameIndex(now, u.x, u.y, len)]`
  (action v1 = 'idle' всегда; детерминизм — now один на render).
* Геометрия слоя (подложка 44×44, спрайт 32×32 inset 8, фолбэк
  ROLE_COLORS) — НЕ трогать (пины R3/R7/R9, golden R6).

## 5. Как выбирает экран найма (ui.js `renderHireTab`) — D6

Строка кандидата `.cp-itemrow`: `<img class="cp-itemicon">` — ПЕРВЫМ
ребёнком, ДО `.cp-itemname` (L669–670):

```js
const icon = el('img', 'cp-itemicon');
icon.src = MERC_ICON_DIR + m.id + '_idle_1.svg';  // MERC_ICON_DIR =
    'assets/sprites/mercs/' (локальная константа блока npcUI)
icon.alt = '';
row.appendChild(icon);
```

* **`img.src` — обычное свойство, НЕ setAttribute** (DOM-стаб тестов
  пишет setAttribute в dataset; продуктовый паттерн — ui.js actionIcon).
* **Путь — СТРОЧНЫЙ ЛИТЕРАЛ из `m.id`, НЕ `G.mercFrames`**: UMD-ловушка
  000038 — ui.js снимает `const G = globalThis.Game` при ЗАГРУЗКЕ (L17)
  и грузится ДО sprites.js (index.html L827 < L903) → G.mercFrames в
  ui.js навсегда undefined; CHAIN vm-песочниц npc-hire-ui.test.js до
  ui.js sprites.js тоже не несёт. Литерал — устойчив к обоим фактам.
* Пин U2 (порядковый: `idxName >= 0 && idxMeta > idxName && idxBtn >
  idxMeta`) — ЗЕЛЁНЫЙ: img до имени даёт (0,1,2,3), порядок
  имя→meta→кнопка сохраняется. Class-пины `.cp-itemname`/`.cp-itemmeta`
  не тронуты.
* `renderHireTabReadonly` (деградация без companions) — БЕЗ img
  (решение O3); блок «Отряд» — БЕЗ img (решение O2).

## 6. CSS и пины — D7/D8

* `index.html`: ОДНО правило `.cp-itemicon { width: 22px; height: 22px;
  flex: none; }` — после `.cp-itemrow .cp-itemname` (L99), перед
  `.cp-itemmeta` (L100). 22px — компактная строка (meta 11px); вектор
  64→22 без артефактов. Селектор независим — CSS-пины
  (npc-layout ruleExact/rulesScoped) не пересекаются. Новых
  `<script>`-тегов НЕТ → index-order/ci/sync — без правок.
* `tests/svg.test.js`: `EXPECTED_SVG_BY_DIR` += `'sprites/mercs': 12,`
  (одна строка, рядом с `sprites/efir` — прецедент 000034; комментарий
  самого файла: «при добавлении SVG правится ровно одна строка»).
  Единственная осознанная техническая правка существующего теста.

## 7. Тесты (красные + гарды)

| id | файл | суть | почему красен |
|----|------|------|---------------|
| M1 | tests/sprites.test.js (node, КОНЕЦ) | `S.MERC_FRAMES`: ровно 6 ключей (id с наймом из assets/npc/*.json); idle = пути `assets/sprites/mercs/<id>_idle_N.svg`; 6 парно-разных; файлы существуют; viewBox "0 0 64 64"; без forbidden-тегов/NaN/внешних ссылок; `S.mercFrames(id,'idle')` ≡ таблице; `mercFrames('no_such',…)` → `[]` | экспортов нет |
| M2 | tests/sprites.test.js (node, КОНЕЦ) | `allAssetPaths()` ⊇ всех 12 merc-путей; без дублей; файлы существуют | merc-семья не собирается |
| C1 | tests/combat-ui.test.js (vm, КОНЕЦ) | `makeAlly({id:'merc_volk',…})` → drawImage `assets/sprites/mercs/merc_volk_idle_<N>.svg`, N = frameIndex(NOW84,x,y,2); orc-пути НЕ запрашиваются; маркер «свой» как раньше | allyFrames всегда orc |
| C2 | tests/combat-ui.test.js (vm, КОНЕЦ) | merc_volk + merc_ashka — РАЗНЫЕ изображения; addMerc84 (id 'a1') — orc-fallback (пин 000084 жив); ветка Эфира не тронута | per-npcId-ветки нет |
| H1 | tests/npc-hire-ui.test.js (vm, КОНЕЦ) | у КАЖДОЙ из 6 строк кандидатов `<img>`; `src === 'assets/sprites/mercs/'+m.id+'_idle_1.svg'`; файл существует; 6 src уникальны; порядок U2 | в строке только span+span+button |

Гарды (зелёные с первого дня, в коммите красных): **G1** — vm
`loadCombatUi(false)`: наёмник с npcId без sprites.js — 0 drawImage,
0 console.error (фолбэк-прямоугольник ROLE_COLORS). **G2** — vm
readonly-деградация (CHAIN без companions): строки intact (имя+meta),
новых console.error нет.

RED: ровно 5 красных (M1/M2/C1/C2/H1), каждый — осмысленное отсутствие
символа/пути/элемента, не синтаксис; `npm run sync:check` — чисто.
GREEN: база 1769 + новые → всё зелёное.

## 8. Что НЕ тронуто / не трогать (границы, зоны ребейза)

* **src/combat.js** — ВЕСЬ (A* 000155 смержена; 000167 — очередь/данные
  мобов; makeAlly уже нисходит `id: data.id || 'a'+idx` — проводка для
  C1/C2 работает без правок). **src/companions.js** — весь (000161).
* **Рендер-путь 000151** (масштаб текстур, registry) — не трогать;
  правка 000152 — только функция `allyFrames`. При ребейзе сверить
  registry 000151 со sprites.js (зона пересечения).
* **src/ui.js** — только `renderHireTab` + `MERC_ICON_DIR` (000145
  параллельно правит «Персонаж»/ui-tab-skills.js — регионы не
  пересекаются, но файл общий).
* **assets/npc/*.json + src/npc-data.js** (финален), **assets/
  portraits/ + src/portraits-data.js** (000142 финален; P1 «ровно 8
  JSON+8 SVG» — боевые ассеты НЕ туда), assets/sprites/{phlogiston,
  efir,mobs,buildings,cities,visuals} — не трогать.
* **index.html** — только 1 CSS-правило; script-порядок не трогать.
* package.json, .github/workflows, scripts/, SPEC.md, MOBS.md — без
  правок (новых JSON-каталогов/зеркал нет — SVG, а не данные).
* `.merge-pending` — не создавать (только стадия мержа).

## 9. Решённые open questions (ст. Проектирование)

* **O1 — 2 кадра idle (12 SVG) vs 1 (6)**: 2. Стиль согласован с
  боевым артом (все персонажи 2-кадровые); код идентичен — влияет
  только на счётчик svg.test.js, M1 и объём арта.
* **O2 — иконка в блоке «Отряд» (нанятые)**: НЕТ. ТЗ — «для каждого
  персонажа, которого МОЖНО нанять»; кандидат-строки = экран найма;
  «Отряд» — уже нанятые, минимальный scope. Если parent захочет — +3
  строки (squad-row), расширение без ломки контракта.
* **O3 — иконка в readonly-списке (деградация без companions)**: НЕТ.
  Readonly — режим деградации 000078 с регрессионными текст-пинами;
  расширение поверхности деградации не требуется ТЗ.
* **O4 — переиспользовать портреты 000142 в найме/бою**: НЕТ (генерируемый
  merc-ассет). Портрет 128×128 — крупный план лица для страницы
  «Персонаж»: не несёт класс-силуэт (лук/щит/кулаки/ветка), требуемый
  ТЗ; handoff D3 решил в пользу отдельного боевого ассета.
* **O5 — где и когда CHANGELOG**: раздел по дате МЕРЖА (сегодня на
  момент коммита; если мерж 2026-10-07 — новый заголовок
  `## 2026-10-07` вверху файла, т.к. 2026-10-06 уже занят), подзаголовок
  `### Графика` (порядок подзаголовков по 2026-10-02: Игровой процесс →
  Графика → Интерфейс), текст для игрока без программной части.

## 10. Подводные камни

1. **EXPECTED_SVG_BY_DIR** — забытая строка → красный обход; счётчик
   `306 → 318` (12 SVG). Сообщение теста показывает разницу по
   каталогам.
2. **addMerc84 → id 'a1' = orc-fallback** — НЕ «чинить» под npcId:
   сломает пин 000084 L1490 и golden-детерминизм.
3. **viewBox гейт НЕ проверяет значение** — ошибочный viewBox (не
   0 0 64 64) пройдёт тесты, но сломает визуал (кадры рисуются в
   32×32 inset 8). M1 фиксирует "0 0 64 64" заголовком; QA-визуал.
4. **UMD-снапшот G**: `G.mercFrames` читается в allyFrames В МОМЕНТ
   ВЫЗОВА (G снят при загрузке combat-ui.js; sprites.js L903 ДО
   combat-ui.js L904 — доступен); в ui.js G-снапшот БРАК (узнать —
   только литерал, §5). withSprites=false → гарды дают [] / null,
   0 console.error (e2e main-visuals 000081 чувствителен).
5. **SVG-авторка**: прогон npm test (гейт 000120) + xmllint +
   count-svg-details.js --min 30 ДО помещения в assets/ (история:
   000062 → 29 сломанных файлов → гейт 000120).
6. **Ребейз**: зоны — конец tests/combat-ui.test.js (000151 дописывает
   213 строк туда же — add/add-конфликт почти гарантирован; слить
   секции и ПЕРЕПРОВЕРИТЬ C1/C2 на новом рендер-пути), конец
   tests/npc-hire-ui.test.js и tests/sprites.test.js (add/add),
   src/ui.js (сдвиг строк 000145), src/combat-ui.js (общий файл,
   ханки не пересекаются с allyFrames-регионом), строка svg.test.js.
   Правки держать минимальными.
7. **Уникальность** в тесте = уникальность ПУТЕЙ/изображений;
   эстетическое соответствие класу — QA по §2.

## 11. Коммитный план (ветка task/000152; первая строка «Задача 000152:
…», последняя — Co-Authored-By)

1. Красные тесты (M1/M2/C1/C2 + G1 + H1 + G2) + этот файл памяти.
   npm test: ровно 5 красных.
2. Реализация: 12 SVG (прошли гейт ДО каталога) + проводка (sprites.js,
   combat-ui.js, ui.js, CSS) + строка svg.test.js. Всё зелёное;
   sync:check чисто.
3. CHANGELOG — «### Графика» (дата мержа).
4. Отчёт tasks/result/000152.md.
5. Finalize: git mv tasks/pending/000152.md → tasks/done/ + отчёт/память.

## 12. Аддэндум (Реализация, 2026-10-07)

* **Форма MERC_FRAMES (расхождение с §3)**: §3 писало
  `{ <npcId>: { idle: [p1, p2] } }`, но закоммиченные КРАСНЫЕ тесты
  задают другую форму: M1 читает `MERC_FRAMES[id].idle`, а M2
  итерирует значения напрямую (`for (const frames of
  Object.values(MERC_FRAMES)) { for (const p of frames) … }` —
  тестов/тестам менять нельзя). Единственная форма, удовлетворяющая
  обеим: значение — САМ СПИСОК КАДРОВ, свойство `.idle` —
  само-ссылка на него (помощник `mercIdle` в src/sprites.js).
  `mercFrames(npcId, action)` = `frames ? (frames[action] || []) :
  []` — работает с этой формой. При добавлении НОВОГО действия —
  либо та же форма (свойство-само-ссылка), либо правка тестов.
* Остальное — строго по §1–§7: 12 SVG (39–45 деталей, прошли гейт
  ДО каталога), проводка (sprites.js/combat-ui.js/ui.js/CSS/
  svg.test.js), orc-fallback жив (пин 000084 без правок),
  readonly/«Отряд» без img (O2/O3). npm test — 1776/1776 зелёных;
  sync:check — «синхронно». Коммиты — tasks/result/000152.md.

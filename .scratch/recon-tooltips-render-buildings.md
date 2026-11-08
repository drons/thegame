

Все шесть пунктов собраны. Итоговый отчёт:

# Отчёт для ТЗ: тултипы / рендер-перф / 3×3 здания + дубли SVG

## 1. Тултипы (задача A)

**Механизм: ЧИСТОЙ CSS, без JS-позиционирования.** Функций `showTooltip`/`renderTooltip` в `src/` нет (grep: слово «tooltip» в src — только `combat-ui.js`/`party.js`/`combat.js` — это нативные `title` в бою, отдельный механизм, не касается [I]-панели). Flip/clamp логики нет нигде (grep `flip|clamp` — только `clampCam` камеры подземелья и `clampValue` настроек).

**CSS** — `/home/sas/Documents/Art/thegame/index.html:124-160`:
- `index.html:133-151` — `.cp-tip { position: absolute; z-index: 11; **bottom: calc(100% + 4px)**; min-width: 180px; max-width: 300px; padding: 6px 8px; background: rgba(10,12,16,.97); … pointer-events: none; opacity: 0; visibility: hidden }`
- `index.html:131-132` — якоря: `.char-panel .cp-tipcell { position: relative; width: 1px; padding: 0 }`, `.char-panel .cp-itemrow { position: relative }`
- `index.html:152-153` — горизонталь: тултип навыка `right: 0` (от 1px-td в конце строки), тултип предмета `left: 0` (от строки, растёт вправо до 300px)
- `index.html:154-160` — показ ТОЛЬКО по `:hover` / `:focus-within` владельца (`.cp-itemrow`, `tr`), скоуп — `.char-panel`
- `index.html:48-62` — `.char-panel { position: fixed; top: 12px; left: 12px; right: 12px; bottom: 56px; z-index: 10 }`; `index.html:86` — `.cp-tabpane { overflow-y: auto }` (вкладка скроллится — любая строка может оказаться у верхнего края)

**Генерация .cp-tip в JS (все call sites):**
| Место | Что |
|---|---|
| `src/ui.js:455-474` | `itemRow(name, meta, buttons, tip, icon, rarity)` — ядро; `:472` — `div.cp-tip` добавляется, если `tip != null`; вкладки получают через `ctx.itemRow` (`ui.js:129-150`) |
| `src/ui.js:571+` | `itemTipText(it, c)` — текст (desc + статы/эффект + аффиксы + набор + вес + цена; 6–10+ строк) |
| `src/ui.js:182-242` | клик по строке → `flashNotice(tip.textContent)` — touch-fallback (`:237-241`) |
| `src/ui-tab-skills.js:68-72` | `skillTipCell` — пустой `td.cp-tipcell > div.cp-tip` концом каждой строки навыка |
| `src/ui-tab-skills.js:91-110`, `:598-600` | `skillTipText(id, c)` (4 строки); render() заполняет текст |

**Call sites с tip:**
- «Инвентарь»: `src/ui-tab-inventory.js:136-142` — все строки предметов
- «Снаряжение»: `src/ui-tab-inventory.js:197-209` (fallback оружие/броня), `:230-236` (каждый заполненный слот EQUIP_SLOTS), `:274-280` (быстрые слоты)
- «Персонаж» (навыки): все 6 основных + 31 вторичный (`ui-tab-skills.js`)
- БЕЗ tip: строки магазина (`src/ui-tab-shop.js:16` — явно), пустые строки (tip=null), NPC-оверлей (перееиспользует `.cp-itemrow`, но не под `.char-panel` — скоуп исключает, `index.html:127-129`)

**Почему уезжает сверху:** `bottom: calc(100% + 4px)` — тултип ВСЕГДА открывается НАД строкой. Первая строка секции сидит ~90–110px от верхнего края вьюпорта (panel top:12px + padding + close-кнопка + ряд вкладок); высота тултипа: навык ~4 строки ≈ 76px, предмет 6–10+ строк ≈ 100–180px (max-width 300, `white-space: pre-line`). Верх тултипа уходит в отрицательные y и обрезается вьюпортом. Плюс прокрутка `.cp-tabpane` доводит любую строку к верхнему краю. Никакого flip (переключение на `top: calc(100%+4px)`) или clamp по `innerHeight` не существует.

**Пины:** `tests/ui-panel.test.js:765+` (000097: у КАЖДОЙ строки навыка/предмета есть `.cp-tip` + точный текст), `tests/ui.test.js:459,626,670,700,729` (строки снаряжения с/без `.cp-tip`), `tests/craft-scroll-use.test.js:307,333` (TIP-1/TIP-2). CSS-позиционирование (`bottom`, `right/left`) нигде не зафиксировано тестами.

## 2. Рендер-циклы (задача B)

**Мир (глобальная карта), `src/main.js`:**
- Цикл `frame()` — `requestAnimationFrame` (`main.js:3821` в finally, старт `:4089`), каждый кадр ~60fps, паузы нет.
- Каждый кадр: `canvas.width/height = innerWidth/innerHeight` (`:3788-3790`) и то же для `spriteCanvas` (`:3808-3810`) — полный сброс контекста/канвы.
- Два полноэкранных canvas: `#game` (WebGL, `index.html:1063`) + `#sprites` (2D поверх, `:1064`, CSS `:25-31`).
- **Сколько тайлов за кадр: только viewport, не вся карта** — `G.visibleTileRange(cam.x, cam.y, canvas.w, canvas.h, zoom)` (`main.js:3312`; `map.js:1184-1190`: `ceil(view/zoom) + margin(2)` по каждой оси).
- Zoom: `ZOOM_MIN=4 / ZOOM_MAX=128 / ZOOM_START=80` (`map.js:1164-1170`), колесо ×1.2 (`main.js:2274`). **Худший случай: zoom=4, 1920×1080 → 482×272 ≈ 131 000 тайлов/кадр** → 131k+ `drawImage`. Комментарий `main.js:3444-3445` прямо фиксирует «при малом зуме видимых тайлов explode».
- **Что в тайле** (`drawSprites`, `main.js:3397-3639`): проход 1 (`:3481-3522`) — `drawImage` текстуры тайла (SVG→Image через spriteLoader) со снап-прямоугольником (сетка краёв считается 1 раз на кадр, `:3421-3442`; `worldAnchoredTileEdges`/`snappedTileEdges`, map.js) + декорации (zoom≥24, ≤3/тайл, `:3496-3503`, константы `sprites.js:485,489`) + лут (zoom≥16, `:3512-3521`, `sprites.js:510`); проход 2 (`:3530-3552`) — постройки: ОДИН `drawImage w*zoom × h*zoom` от якоря; 2.5 — агро-окружности (`:3566-3600`); 3 — мобы (`:3609-3625`); герой (`:3630-3638`).
- **WebGL-слой в steady state = 0 вершин** (спрайты готовы) — `buildFrame` (`:3296-3385`), но `bufferData` вызывается каждый кадр (`:3379-3382`).
- **Кэши:** только ДАННЫЙ — `createTileCache` (`map.js:1203-1226`, FIFO 65536 тайлов — кэш результата `tileAt`, не текстуры). **Кэша текстур/offscreen-canvas/чанков НЕТ** (grep `createElement('canvas')` по src: только `dungeon-ui.js:403`, `combat-ui.js:314` — оверлеи, и `main.js:232` — одноразовый decode map.png).

**Города/подземелья, `src/dungeon-ui.js`** (город и подземелье — ОДИН рендерер, режим по `state.kind === 'city'`):
- СВОЙ rAF-цикл: `step()` (`:962-977`), canvas на весь вьюпорт (`:403-407`, ресайз `:968-969`), `render(now)` (`:479-958`).
- Viewport-каulling: `visibleTileRange` ∩ границ сетки (`:499-504`). Размер сетки: подземелье ≤ 63×63 (`DUNGEON_SIZE_CAP`, `src/dungeon.js:287`), город ≤ 26×26 (`cityLayoutSize = 4×footprint−2`, `src/cities.js:62-68`).
- На клетку: город — `fillRect` hex-палитрой пола/стены (`:575-583`), подземелье — `drawImage` пола (`:584-595`); постройки города — **1×1-спрайт на каждую запись** (`:599-631`, `drawImage` `:628`); стены (`:637-651`), портал (`:666+`), сундуки/мобы/герой (`:679-918`); туман войны — пересчёт маски на кадр (`:540-566`, dungeon только).

**Perf-тесты:** только один — `tests/map.test.js:1942-1959`: 160k `tileAt` (генерация данных, НЕ рендер), бюджет 5000 мс. Perf-тестов drawImage/рендера нет. Рендер-пинны: `tests/global-map-draw.test.js` (000176 single-pass XOR), `tests/tile-seam.test.js` / `tile-pulse.test.js` (снап 000215/000228), `tests/main-visuals.test.js`, `tests/sprites.test.js`.

## 3. 3×3 здания в городе (задача C, баг)

**Каталог 3×3:** id 7 Арена (`buildings.js:189`), 19 Монастырь (`:317`), 24 Ратуша (`:369`), 36 Храм солнца (`:498`). **В игре размещаются только 7 и 36** (есть `map_index` 4/8 → и на мировой карте, и в наборе D3 построяемых в городе); 19/24 — только контент каталога (нет map_index/слота).

**Пайплайн постройки в городе** (`src/building-actions.js`):
- [E] на пустой клетке → `openCityBuildMenu` (`:849-930`, 22 строки D3) → `buildCityAt` (`:945-1100`):
  - re-check геометрии `canBuildAt` (`:988-999`; `cities.js:944-1016` — space (9 FLOOR-клеток footprint), cap 50% интерьера, reach-BFS)
  - списание золота+исходников (`:1000-1070`)
  - **`C.placeBuilding`** (`:1072`; `cities.js:1027-1044`) — ОДНА **ANCHOR**-запись `{x, y, buildingId, player: true}` в `record.built` (persist в cityStates → сейв)
  - **per-cell view** (`:1074-1082`): для каждой клетки `C.buildingCells(buildingId, x, y)` (`cities.js:880-898`, w·h клеток) — push ОТДЕЛЬНОЙ записи `{x,y,buildingId,player:true}` в `ds.cityContents.buildings` → **для 3×3 это 9 записей**
  - магазины на каждую клетку (`:1083-1100`)
- Повторный вход: `prepareCityState` (`src/main.js:2677-2717`) — per-cell view ПЕРЕВОДИТСЯ из built-якорей через `buildingCells` снова (view производный).

**Почему «9 одноклеточных»:** рендер города (`src/dungeon-ui.js:599-631`) рисует **каждую запись** `ds.cityContents.buildings` как ОДИН 1×1-спрайт (`cellRect` — снап-прямоугольник одной клетки, `drawImage` `:628`). 9 per-cell записей → 9 спрайтов. Это **закреплённый контракт, а не случайность**: комментарий `dungeon-ui.js:611-612` («1×1-клетка (000106): каталожный размер НЕ уважается»), `memory/000105-city-screen.md:63-66`, **`spec/buildings.md:400-404`: «построенные игроком — ПО КЛЕТКАМ (w×h здание = w·h спрайтов)»** — ТЗ на баг-фикс будет менять и эту строку SPEC. Пин e2e: `tests/city-screen.test.js:1015` (G1: «ровно 3 спрайта» на 3 здания).

**Существующие большие здания:**
- В городе (экран): генерируемых 3×3 НЕТ — `generateCityContents` (`cities.js:281-380`) размещает только 1×1-записи; Арена — 6-я по доле, НИКОГДА вне ассортимента top-(1+wealth) (пин `tests/cities.test.js:944-968`).
- На мировой карте: 3×3 Арена/Храм солнца + города 2×2/5×5/7×7 рисуются **одним w×h-спрайтом от якоря** (`main.js:3536-3552`; пины `tests/main-visuals.test.js:523-540, 736-795`) — т.е. «большой» рендер уже существует в мировом проходе 2, но не в городском.
- Demolish: удаляет все 9 per-cell записей (пин CI-U19, `tests/city-interact.test.js:852-894`: «per-cell — 9 записей footprint удалено»).

**Пины 3×3:** `tests/cities.test.js:1969-1990` (D3-набор 22 id; gold 3×3 > gold 1×1; Арена=400з, Храм=500з; cap деревни 6×6 — 3×3 не влезает, `spec/buildings.md:437-438`), `tests/city-screen.test.js:1178` («7/36 (3×3 перекрытие) — «Нет места»»), `tests/city-interact.test.js` CI-U13/U14/U18/U19, `tests/city-storage.test.js` (per-cell 55), `tests/building-levels.test.js` (000222 per-cell).

## 4. Ассеты зданий (задача C, дубли)

**Важно:** в `assets/buildings/` SVG **НЕТ** — там 55 JSON + `schema.json` (source of truth каталога; GENERATED-зеркало в `src/buildings.js`, синк `scripts/sync-buildings-data.js`). SVG живут в `assets/sprites/buildings/` (41 файл) и `assets/sprites/cities/` (20 файлов):
- `assets/sprites/buildings/`: `academy`, `apothecary`, `archery_range`, `arena`, `armor_shop`, `blacksmith`, `camp`, `cave_entrance`, `magic_shop`, `npc_house`, `rune_stone`, `tavern`, `temple`, `weapons_shop` (14 баз) + кадры `_1.._4` у `academy, apothecary, blacksmith, camp, magic_shop, tavern, weapons_shop` (28 кадров)
- `assets/sprites/cities/`: `city_51..54` + `_1.._4`

**Дубли:**
- Прямых дублей поля `спрайт` в каталоге **нет** (у каждого id свой SVG).
- Байт-идентичных SVG **нет**, кроме намеренного base==`_1` (замыкание анимации: md5 weapons_shop==weapons_shop_1 и т.д. — 7 пар).
- **Дубли внешнего вида = слотовое разрешение спрайта.** Рендер (и мир, и город) берёт спрайт по СЛОТУ, не по id каталога: мир — `buildingAsset` (`main.js:3236-3264`) → `buildingSprite(rec.type)` (`sprites.js:772-776` + `slotSpriteTable` `:438-449` — таблица slot→спрайт БАЗОВОЙ записи map_index); подтипы `subtypeFor` (`map.js:631-641`, слоты 8..12, 000073) меняют только id каталога (имя/интеракция), **НЕ спрайт**. Город — `cityBuildingPath` (`dungeon-ui.js:458-476`), тот же слот.

**Таблица дублей (11 неуникальных типов):**

| Слот | Общий SVG (база) | Делят внешний вид (id, имя, доля) |
|---|---|---|
| 8 | `temple.svg` (36 Храм солнца) | 37 Храм луны (10%), 38 Храм горы (10%), 39 Заброшенный храм (10%) |
| 9 | `cave_entrance.svg` (31 Простая пещера) | 48 Развалины (20%) |
| 10 | `rune_stone.svg` (40 Рунический камень) | 41 Телепорт-круг (15%), 42 Обелиск (15%), 43 Магический круг (15%) |
| 11 | `tavern.svg` (44 Таверна) | 45 Колодец (15%), 49 Фонтан (25%) |
| 12 | `npc_house.svg` (25 Дом кузнеца) | 46 Смотровая башня (30%), 55 Хранилище (без доли — строится только в городе) |

Слоты 0–7 — 1:1 (по 1 типу). Факт для ТЗ: хук id-разрешения уже существует — `spriteForId(id)` (`sprites.js:451`), используется в `citySprite`/`campSprite` (`:834, :873`), но НЕ в слотовом канале; чтобы дать подтипам свои SVG, рендер-резолв надо вести по id каталога (или расширить `BUILDING_FRAMES`/таблицу).

## 5. Тесты (затронутые)

| Тема | Тесты |
|---|---|
| Тултипы | `tests/ui-panel.test.js:765+` (000097: существование+текст `.cp-tip` у всех 37 навыков и заполненных предметов), `tests/ui.test.js:459,626,670,700,729`, `tests/craft-scroll-use.test.js:307,333`; CSS-позиция не запинена |
| SVG-sweep | `tests/svg.test.js` — обход ВСЕХ `assets/**/*.svg` (сейчас 651 файл): XML well-formedness + схема (корень `<svg>`, xmlns, viewBox = 4 конечных числа) + NaN/пустые атрибуты; исключение `transform=""`. Плюс `tests/assets-schemas.test.js` (JSON-каталоги vs schema.json, включая buildings), `tests/assets-refs.test.js` (целостность ссылок + svg-sweep), `tests/sprites.test.js` (SP-C2 — зеркало city-спрайтов каталогу) |
| Строительство/footprint | `tests/cities.test.js` (layout 4f−2, `canBuildAt` space/cap/reach, `buildCost`, D3_IDS, placeBuilding-чистота), `tests/city-interact.test.js` (CI-U13/U14/U18/U19 — per-cell, 9-записи Арены; CI-B5 — иконки меню = слот-спрайт), `tests/city-screen.test.js:1015` (G1 e2e: 1×1 спрайт на постройку) и `:1178` (build-меню, «7/36 — Нет места»), `tests/city-storage.test.js`, `tests/building-levels.test.js`, `tests/build-menu-layout.test.js`, `tests/camp-placement.test.js` |
| Рендер | `tests/map.test.js:1942-1959` (единственный perf: 160k tileAt, 5000 мс — генерация), `tests/global-map-draw.test.js` (000176), `tests/tile-seam.test.js`, `tests/tile-pulse.test.js` (000228), `tests/main-visuals.test.js` (3×3 w×h от якоря), `tests/sprites.test.js`, `tests/dungeon-ui.test.js` (golden-пины city-тайлов) |

## 6. SPEC

- **Тултипы:** в `SPEC.md`/`spec/*.md` **не упоминаются** (фича задачи 000097, spec-секции нет).
- **Рендер:** `spec/world-map.md:3-17, 57+` — процедурное состояние тайла/детерминизм; требований по производительности/чанкам НЕТ — chunk-рендер вводится новым ТЗ.
- **Города/здания:** `spec/buildings.md:319+` «Города и деревни» (размеры 324-333: хутор 1/деревня 2/город 5/столица 7, не сжимаются); **`:400-404` — текущая SPEC-формулировка per-cell рендера («w×h здание = w·h спрайтов») — её придётся править вместе с баг-фиксом (C)**; `:417+` «Строительство и цены» (22 типа, cap 50% — пример «деревня 6×6 — 3×3 не влезает» `:437-438`); анимация зданий (кадр-свитч 800мс) `:125-147`.
- Числа-якоря для ТЗ: `ZOOM_MIN=4` → ~131k тайлов/кадр на 1080p; `tileCache` 65536 (данные); пересброс обоих canvas каждый кадр (`main.js:3788-3790, 3808-3810`); город-сетка ≤ 26×26, подземелье ≤ 63×63; per-cell записи 3×3 = 9 (`building-actions.js:1074-1082`, `main.js:2703-2715`); 11 неуникальных building-типов (таблица выше).
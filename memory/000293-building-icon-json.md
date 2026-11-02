# 000293 — поле `icon` в JSON построек: единый источник иконки меню «Строительство»

Задача: tasks/pending/000293.md (баг-репорт drons 2026-11-02). Worktree
`.worktrees/task-000293`, ветка `task/000293`, база master 91c66a1.
Дата: 2026-11-02. Тип: новая функциональность (data + один UI-хелпер).

## 1. Суть бага и корень (до)

Меню «Строительство» (пустая клетка города, [E]; `openCityBuildMenu`,
src/building-actions.js) строит 22 строки `build-<id>` (набор D3 —
`Cities.buildableBuildingIds()`) + «Переименовать город». Иконка строки —
`buildIconPath(live, buildingId)` (src/building-actions.js:622), который
брал `slot =особые_параметры.map_index | .размещение.слот` и возвращал
`live.buildingSprite(slot)` — ОДНОАРГУМЕНТНО: спрайт БАЗЫ слота
(BUILDING_SPRITES/slotSpriteTable). Глобальная карта (src/main.js
`buildingAsset`) и город (src/dungeon-ui.js `cityBuildingPath`) рисуют
постройку ДВУХАРГУМЕНТНО — `buildingSprite(slot, buildingId)`:
id-приоритет (000265) — собственное поле «спрайт» каталожной записи
(`spriteForId`) побеждает спрайту слота.

Итог: у 10 из 22 строк диалог показывал чужой вид (субтипы слотов, 000265):

| id | постройка | было в диалоге | на карте/в городе |
|----|-----------|----------------|-------------------|
| 37 | Храм луны | temple.svg | moon_temple.svg |
| 38 | Храм горы | temple.svg | mountain_temple.svg |
| 39 | Заброшенный храм | temple.svg | abandoned_temple.svg |
| 42 | Обелиск | rune_stone.svg | obelisk.svg |
| 43 | Магический круг | rune_stone.svg | magic_circle.svg |
| 45 | Колодец | tavern.svg | well.svg |
| 46 | Смотровая башня | npc_house.svg | watchtower.svg |
| 48 | Развалины | cave_entrance.svg | ruins.svg |
| 49 | Фонтан | tavern.svg | fountain.svg |
| 55 | Хранилище | npc_house.svg | storage.svg |

12 базовых (1,2,3,4,7,8,10,11,25,36,40,44) совпадали (свой спрайт = база
слота). Компромисс «часть построек делит иконку по слоту» закреплён был
в memory/000202-building-menu-ui.md §R4 и пином CI-B5 — 000293 его
ОСКАНЧЕННЫМ способом отменяет (репин CI-B5 — см. §5).

## 2. Что добавлено / перенесено

* **`icon` — у ВСЕХ 55 записей** assets/buildings/0000*.json, `required`
  в schema.json. Значение:
  - 29 записей с «спрайт» (ровно 29 — контур R1 000211.07 не тронут):
    `icon` = ТОЧНО значение «спрайт» (байт-в-байт). Требование
    пользователя «иконка в диалоге = вид на глобальной карте и в городе»
    выполняется КОНСТРУКТИВНО: карта/город рисуют именно этот файл
    (id-приоритет 000265). Файлы НЕ дублируются.
  - 26 записей без «спрайт» (id 5,6,9,12–21,23,24,26–30,32–35,50):
    НОВЫЕ SVG `assets/building-icons/0000{NN}.svg` — имя = id записи
    (механически, БЕЗ параллельной таблицы имён — прецеденты:
    spell-icons <id>.svg, sprites/loot <id>.svg).
* **`icon_prompt` — только у тех же 26** (опционально в схеме): шаблон
  конвенции заклинаний (000149/000235): «Плоская одноцветная иконка для
  игры «Приключения Флогистона»: <силуэт постройки «<название>»>. 24×24,
  заливка #e8dcc0, тёмный фон, единый силуэт, без обводки, без
  градиентов, без текста.»
* **26 новых SVG** в НОВОМ каталоге `assets/building-icons/` (аналог
  топового `assets/spell-icons/` — ТЗ «как у заклинаний»): 24×24,
  `viewBox="0 0 24 24"`, xmlns, один `<path fill="#e8dcc0">`, без
  обводки/градиентов/текста/NaN — проходят tests/svg.test.js.
  Пара-уникальны (sha256). id 22 «Таверна» (школа_навыков) — СВОЙ файл
  000022.svg (силуэт таверны), НЕ переиспользование tavern.svg id 44:
  22 и 44 — разные каталожные постройки (функция/категория); правило
  26 файлов — единое, без исключений.
* **Контракт-пин**: (icon ∈ assets/building-icons/) ⇔ (icon_prompt есть).
  (icon = «спрайт») ⇒ (icon_prompt НЕТ).
* **`buildIconPath`** (src/building-actions.js) переписан: иконка —
  ТОЛЬКО `rec.icon` каталога (`live.getBuilding(buildingId)`), см. §3.
* **Зеркало** src/buildings.js — только регенерация
  `npm run sync:buildings` (scripts/sync-buildings-data.js: `REQUIRED`
  += `'icon'` КОНЦОМ; генератор данных as-is, «спрайт»-подобный
  прогон — icon/icon_prompt так же).
* Тесты: НОВЫЙ tests/building-icon.test.js (BI-1..BI-7, §4) + репины
  (§5). memory (этот файл). CHANGELOG («### Графика», 2026-11-02).

## 3. Контракты и границы

### 3.1 JSON / schema

* schema.json (additionalProperties:false — properties ОБЯЗАТЕЛЬНЫ):
  - `icon`: `{"type":"string","pattern":"^assets/(sprites/(buildings|cities)|building-icons)/[\\w]+\\.svg$"}`
    — union: и существующие арты (sprites/buildings, sprites/cities),
    и новые иконки (building-icons).
  - `icon_prompt`: `{"type":"string","pattern":"^\\S(.*\\S)?$"}`.
  - `required`: `+"icon"` КОНЦОМ массива (required[0]='id' и пин
    «спрайт не required» — R3 — не тронуты); `icon_prompt` — НЕ в
    required (опциональное поле-сопровождение, прецедент: items 000211.06
    — icon не required).
* Позиция ключей в JSON: `icon` (и `icon_prompt`) — ПОСЛЕДНИЕ
  топ-уровневые поля (после «спрайт», где он есть) — порядок ключей =
  порядок генерируемого JS; прецедент 000211.06 («+ icon КОНЦОМ
  объекта»).

### 3.2 Инвариант (главный, для будущих задач)

**icon = вид постройки на глобальной карте и в городе.** Если у
постройки ЕСТЬ «спрайт» — `icon` ОБЯЗАН быть равен «спрайт» (пин BI-1).
Если у постройки БЕЗ «спрайт» когда-нибудь появится «спрайт»
(картный арт, как в 000265) — её `icon` (и icon_prompt) РЕПИННУТЬСЯ
на новый «спрайт». Анимированные слоты (0,2,3,5,7,11 — кадры _1.._4,
000224/000238): icon = СТАТИЧЕСКАЯ БАЗА семейства (тот же файл, что
«спрайт»; `buildingSprite(slot,id)` возвращает базу) — кадры анимации
не рассогласованием НЕ считаются. Города 51–54 — city_5N.svg
(citySprite), лагерь 47 — camp.svg (campSprite), пещера 31 / телепорт 41
— через buildingSprite(map_index, id).

### 3.3 Диалог: buildIconPath (src/building-actions.js)

```
function buildIconPath(live, buildingId) {
  if (!live || typeof live.getBuilding !== 'function') return null;
  const rec = live.getBuilding(buildingId);
  if (!rec) return null;
  return (typeof rec.icon === 'string' && rec.icon !== '') ? rec.icon : null;
}
```

* Источник — ЕДИНСТВЕННЫЙ: `icon` каталожной записи. Зависимость от
  `live.buildingSprite` в этой функции УДАЛЕНА (слотовые параллельные
  таблицы не участвуют — ТЗ п.2 «никаких хардкодов/параллельных
  таблиц»).
* Деградация ТИХАЯ (без console.error — пин CI-V4 «ошибок нет» самый
  жёсткий e2e-пин, прецедент R8 000202): нет каталога/записи/icon/
  пустая строка → null → строка без `a.icon` → нумерационный чип
  (src/building-ui.js:211 — поведение строки без иконки сохранено).
  Меню открывается (23 строки), краш-свободно.
* UMD-ловушка 000038: `getBuilding` читается ЛЕНИВО в момент вызова
  (deps.game — снапшот; buildings.js в цепочке index.html ДО
  building-actions.js — :1250/:1349, пин index-order).

### 3.4 НЕ трогалось (анти-решения)

* «спрайт» / R1-контур «ровно 29 из 55» (000211.07) — 26 без арта
  «спрайт» НЕ получают (рендер карты/города бит-в-бит; icon ≠ спрайт —
  разные каналы).
* src/sprites.js — весь бит-в-бит, включая allAssetPaths: 22 иконки
  диалога = существующие спрайт-файлы (уже в pre-load: BUILDING_SPRITES +
  цикл по «спрайт» каталога + CITY/CAMP); 26 новых иконок в рантайме НЕ
  используются (постройки не buildable, на карте не рендерятся) —
  pre-load был бы мёртвым весом; `<img>` строки строится браузером
  независимо (как и раньше).
* 1-аргументная `buildingSprite(slot)` — бит-в-бит (SP-B1/B2,
  building-anim-пины; другие потребители корректны).
* index.html / CSS / index-order.test.js: НЕТ новых script-тегов и
  классов (`.cp-itemicon` 22×22 существует, index.html:100; img-рендер
  строки — building-ui.js:211, без правок).
* src/building-ui.js, src/cities.js, src/map.js, src/main.js,
  src/dungeon-ui.js — бит-в-бит.
* RNG/сейвы/детерминизм боя — не затронуты (icon — каталожное поле, в
  сейвах не перистируется).

## 4. Тесты

* НОВЫЙ tests/building-icon.test.js (node; фикстура по образцу
  initCityBuild из tests/city-interact.test.js + реальный каталог
  src/buildings.js + SP = require('../src/sprites.js')):
  - BI-1: 29 с «спрайт» — icon === «спрайт» + файл существует.
  - BI-2: 26 без «спрайт» — icon === `assets/building-icons/0000{NN}.svg`
    (точное имя по id), icon_prompt непустой, файл существует; 26 SVG —
    24×24/viewBox/xmlns/#e8dcc0/well-formed/пара-уникальны (sha256).
  - BI-3: schema — deepEqual properties.icon (pattern §3.1),
    properties.icon_prompt, `icon` в required (конец), icon_prompt НЕ в
    required, additionalProperties:false.
  - BI-4: зеркало src/buildings.js — icon === значению СЫРОГО
    JSON-файла (все 55; источник данных диалога — 22 buildable).
  - BI-5: диалог — a.icon ВСЕХ 22 строк === icon сырого JSON;
    rename-city без icon; 23 строки; menu открыт.
  - BI-6: консистентность с артом карты/города НЕЗАВИСИМЫМ резолвом:
    22 buildable + 31/41 — `SP.buildingSprite(слот, id)` (id-приоритет);
    47 — `SP.campSprite(47)`; 51–54 — `SP.citySprite(id)`.
  - BI-7: деградация — запись каталога без icon → a.icon undefined,
    меню 23 строки, console.error нет.
* vm-покрытие — репин e2e (city-screen 000202), не новый файл.

## 5. Репины (ТЗ-обусловленные, осознанные; ок стадии Проектирование)

* tests/city-interact.test.js CI-B5: pinIcon(48) →
  assets/sprites/buildings/ruins.svg (было cave_entrance.svg — баг);
  pinIcon(55) → storage.svg (было npc_house.svg — баг); 36/44/1 —
  БЕЗ ИЗМЕНЕНИЯ (база = свой спрайт); заголовок — «icon = значение
  icon из JSON (000293), консистентность с артом карты/города»;
  часть (b) «без buildingSprite — icon везде undefined» → ИНВЕРСИЯ:
  icon определён из каталога и БЕЗ buildingSprite; тихая деградация
  репинена как «нет каталога (getBuilding → null) — icon нет,
  console.error нет».
* tests/city-screen.test.js 000202 (e2e): хелпер `resolve(id)` —
  формула слот-резолва заменена на `G.getBuilding(id).icon` (12 базовых
  значений — те же, 10 подтипов — свой арт); заголовок — «icon из
  JSON». Остальные пины (23 строки, disabled, reasons, opacity,
  console.error, повторный [E]) — побайтово.
* tests/svg.test.js: EXPECTED_SVG_BY_DIR += строка `'building-icons': 26`
  (новая строка таблицы; строка 'sprites/buildings': 53 НЕ МЕНЯЕТСЯ —
  иконки в другом каталоге).

## 6. Подводные камни

* **Порядок операций**: правка 55 JSON → schema.json → sync REQUIRED →
  РЕГЕНЕРАЦИЯ `npm run sync:buildings` (в worktree) ДО любого npm test —
  иначе buildings.test.js (mirror deepEqual полной записи) и
  assets-schemas (additionalProperties:false → лишние поля icon)
  красные. Коммит — JSON+schema+зеркало+иконки+код ОДНИМ коммитом.
* svg.test.js «ровно N SVG по каталогам»: строка 'building-icons' —
  в ТОМ ЖЕ коммите, что и 26 SVG (иначе «обход» красный в обе стороны).
  Новые SVG — только после локального прогона `node --test
  tests/svg.test.js`.
* sync-all.test.js (дрейф-гейт) может сам регенерировать зеркала —
  мутация src; полный сьют — ОДИН за раз в worktree (000054 мутирует
  src/npc-data.js). Полные тесты ТОЛЬКО `cd .worktrees/task-000293 &&
  npm test` (memory/test-runner-worktrees.md), ps-проверка до пуска.
* 000294 (пещерные тайлы) тоже правит EXPECTED_SVG_by_DIR — другие
  строки, риск текстового мерж-конфликта низкий; assets/buildings/*,
  building-actions.js, building-icons/ — только зона 000293.
* Зеркало НЕ править руками (GENERATED-блок между маркерами); шапка/
  JSDoc src/buildings.js — не меняются (пины «55 типов», id 1..55 —
  размеры не меняются).
* vm-песочницы грузят цепочку <script> из index.html — регенерированное
  buildings.js и исправленный building-actions.js подхватываются
  автоматически (новых script-тегов НЕТ).

# 000265 — уникальные спрайты подтипов зданий (11 типов, 5 слотов)

Станция Проектирование, 2026-10-25. ТЗ: tasks/pending/000265.md.
Анализы: a1-domain, a2-arch (резюме), a3-tests. Все факты сверены с кодом
master 28d9650 (worktree task-000265, ветка task/000265).

## 1. Что добавлено / перенесено

Добавлено:
- 11 статичных SVG 64×64 в assets/sprites/buildings/ (свои, НЕ копии базы):
  | id | название | файл |
  |----|----------|------|
  | 37 | Храм луны | assets/sprites/buildings/moon_temple.svg |
  | 38 | Храм горы | assets/sprites/buildings/mountain_temple.svg |
  | 39 | Заброшенный храм | assets/sprites/buildings/abandoned_temple.svg |
  | 41 | Телепорт-круг | assets/sprites/buildings/teleport_circle.svg |
  | 42 | Обелиск | assets/sprites/buildings/obelisk.svg |
  | 43 | Магический круг | assets/sprites/buildings/magic_circle.svg |
  | 45 | Колодец | assets/sprites/buildings/well.svg |
  | 46 | Смотровая башня | assets/sprites/buildings/watchtower.svg |
  | 48 | Развалины | assets/sprites/buildings/ruins.svg |
  | 49 | Фонтан | assets/sprites/buildings/fountain.svg |
  | 55 | Хранилище | assets/sprites/buildings/storage.svg |
  Кадры _1.._4 НЕ создаются (решение D3: статичные).
- Поле `"спрайт"` (строка-путь, паттерн schema.json) в 11 JSON
  assets/buildings/000037/38/39/41/42/43/45/46/48/49/55.json — как у базовых
  (ПОСЛЕДНЕЕ топ-уровневое поле записи). id/имя/категория/типичный_npc/
  допустимые_тайлы/особые_параметры (слот, доля, эффекты, стройка) — НЕ
  ТРОГАТЬ. Зеркало src/buildings.js — ТОЛЬКО `npm run sync:buildings` (не
  руками).
- src/sprites.js: buildingSprite/buildingFrames получают ОПЦИОНАЛЬНЫЙ
  2-й аргумент buildingId (контракт §2). НОВЫХ ЭКСПОРТОВ НЕТ.
- src/main.js buildingAsset: 2 call-выражения передают rec.buildingId.
- src/dungeon-ui.js cityBuildingPath: 2 call-выражения передают buildingId.
- spec/buildings.md: 3 формулировки (§4).
- Тесты: 9 красных (§5) + технические ре-пины (§6).
- CHANGELOG.md: запись в существующем «## 2026-10-25» → «### Графика».

НЕ добавлено (явные анти-решения):
- НОВАЯ функция-резолвер (buildingSpriteFor/slotAssetFor) — отвергнута (D2).
- ЛИТЕРАЛЬНАЯ таблица SUBTYPE_SPRITES в sprites.js — отвергнута (D1).
- Новые модули/скрипты в index.html — НЕТ (index.html не меняется;
  index-order.test.js не трогать).
- Кадры _1.._4 у подтипов — НЕТ (D3).
- Изменения city_51..54, camp 47, каталога (id/имя/доли/map_index),
  RNG (subtypeFor/GOLDEN_TILES), schema.json, src/map.js,
  src/building-actions.js — НЕТ.

## 2. Контракты и границы

### 2.1 buildingSprite(buildingType, buildingId) — src/sprites.js (~:787)

```
function buildingSprite(buildingType, buildingId) {
  const base = BUILDING_SPRITES[buildingType];
  if (!base) return null;                       // NONE(-1)/999/не-слот → null (как раньше)
  if (Number.isInteger(buildingId)) {
    const own = spriteForId(buildingId);
    if (own) return own;                        // id-приоритет (каталог)
  }
  const t = slotSpriteTable();
  return (t && t[buildingType]) || base;        // старая строка — бит-в-бит
}
```

Семантика:
- 1 аргумент (buildingId === undefined) — бит-в-бит как до задачи
  (SP-B1/B2, buildIconPath/CI-B5, все пины — не трогаются).
- (слот, id БАЗЫ): own = spriteForId(id) === slotSpriteTable()[слот]
  (одна и та же запись каталога) → значение идентично старому поведению.
- (слот, id ПОДТИПА со своим спрайтом) → СВОЙ путь (id-приоритет).
- (слот, null/не-число/нецелое/неизвестный id) → старый слотовый канал.
- (NONE, 47/51..54) → null ДО id-ветки (base-проверка) → каналы
  citySprite/campSprite не затронуты СТРУКТУРНО.
- Инвариант вызова (зафиксирован): id передаётся ТОЛЬКО из той же записи
  якоря, что и type (map.js buildingAtAnchor: слотовые якоря —
  {type: слот, buildingId: subtypeFor()}; город/лагерь — type NONE,
  buildingId 51..54/47). Никогда не передавать city/camp id в слотовый
  канал.

### 2.2 buildingFrames(buildingType, buildingId) — src/sprites.js (~:806)

```
function buildingFrames(buildingType, buildingId) {
  if (Number.isInteger(buildingId)) {
    const own = spriteForId(buildingId);
    if (own) {
      const t = slotSpriteTable();
      const slotBase = t && t[buildingType];
      if (slotBase && own !== slotBase) return null;  // уникальный облик → статично
    }
  }
  return BUILDING_FRAMES[buildingType] || null;       // старая строка — бит-в-бит
}
```

Семантика:
- Уникальный спрайт (own ≠ спрайт БАЗЫ слота) → null (статичное здание).
  Критично для 45/49 (слот 11): НЕ наследуют tavern_1..4-кадры
  (иначе колодец/фонтан «мигали» бы кадрами таверны — визуальный баг).
- own === slotBase (базовый id 44) → кадры слота СОХРАНЯЮТСЯ
  (buildingFrames(11, 44) = 4 кадра — таверна продолжает анимироваться).
- Слоты 8/9/10/12 кадров нет (BA-* пин) → null и так; gate — единый
  (защита от будущего добавления кадров в эти слоты).
- Нет каталога (slotSpriteTable() → null, slotBase undefined) → gate
  ложный → BUILDING_FRAMES[слот] — старое поведение.
- 1 аргумент — бит-в-бит (BA-1..BA-*, SP-frames — не трогаются).

Почему gate «own ≠ slotBase», а не «own существует»: без проверки
равенства базовая таверна (44, own = tavern.svg) потеряла бы анимацию.

### 2.3 Call-sites (ОДИН резолвер = эти две функции в sprites.js; оба
канала делегированы им — трактовка ТЗ-пункта 2)

src/main.js buildingAsset (~:3362, ~:3383):
```
const frames = typeof G.buildingFrames === 'function'
  ? G.buildingFrames(rec.type, rec.buildingId) : null;   // было: (rec.type)
...
return G.buildingSprite(rec.type, rec.buildingId) ||     // было: (rec.type)
  (citySprite) || (campSprite) || null;                  // хвост — не трогать
```
src/dungeon-ui.js cityBuildingPath (~:435, ~:441):
```
const frames = typeof live.buildingFrames === 'function'
  ? live.buildingFrames(slot, buildingId) : null;        // было: (slot)
...
return live.buildingSprite(slot, buildingId);            // было: (slot)
```
НОВЫХ typeof-гардов НЕТ: существующие уже покрывают вызовы. Старый
sprites.js (1-арг.) молча игнорирует 2-й аргумент → legacy-ветка
бит-в-бит, игра не падает (контракт деградации).

### 2.4 Слои 000264 — без изменений
cityBuildingPath вызывается и для anchor (a.id), и для cell (b.buildingId)
— footprint (w×h, 3×3 у храма-семьи) берётся из БАЗОВОЙ записи и НЕ
меняется; cityBuildingPath возвращает только ПУТЬ. Свои спрайты
3×3-подтипов (moon_temple и пр.) рисуются одним w×h-спрайтом от якоря —
автоматически.

### 2.5 Build-меню — НЕ трогать
buildIconPath (src/building-actions.js ~:622-633) — 1-арг.
buildingSprite(slot) → иконки остаются СЛОТОВЫМИ (CI-B5: build-48 →
cave_entrance.svg, build-55 → npc_house.svg; 22 строки). ОСОЗНАНАЯ
несогласованность: иконка меню ≠ облик здания (48: cave_entrance vs
ruins.svg) — ТЗ бит-в-бит CI-B5; зафиксировано в CHANGELOG-смысле и
здесь. Иконка — «тип постройки», здание — конкретная постройка.

## 3. Ленивые ссылки и guards

- spriteForId/slotSpriteTable читают buildingsRef() ЛЕНИВО в момент вызова
  (каталог live; контракт R5 sprites.test.js — мутация каталога без
  re-init). 2-арг. ветки используют ТОЛЬКО spriteForId → ленивость
  сохранена; кэшей НЕТ (как в 1-арг. версии).
- buildingsRef() → null (vm-песочницы без buildings-data): spriteForId →
  null, slotSpriteTable → null → оба резолвера деградируют до старых
  путей БИТ-В-БИТ (без throw, без console.error — канал не новый).
- main.js: buildingAsset — только при spriteLoader != null (sprites.js в
  цепочке); typeof-гард G.buildingFrames — как был.
- dungeon-ui.js: guard `typeof live.buildingSprite !== 'function'` —
  как был (UMD-ловушка 000038: liveGame() в момент вызова).
- allAssetPaths(): 11 новых путей регистрируются АВТОМАТИЧЕСКИ
  (цикл `b.спрайт` по каталогу, ~:1133) — allAssetPaths = ЕДИНСТВЕННЫЙ
  pre-лоад → новые SVG preload'ятся как все остальные; строгая
  готовность кадров (000224) к статичным спрайтам неприменима
  (кадры null → статичный путь, fallback на базу НЕ нужен — путь
  существует в allAssetPaths).

## 4. SPEC — точные правки (spec/buildings.md)

1. «Расширение карты — подтипы слотов» (:303).
   БЫЛО (фрагмент строки): `...базовой записи слота), спрайт — спрайт
   слота. Слоты 0–7 — без подтипов.`
   СТАЛО: `...базовой записи слота), спрайт — свой, если есть в каталоге
   (000265: 11 подтипов слотов 8..12 — собственные статичные SVG,
   резолв по id каталога), иначе — спрайт слота. Слоты 0–7 — без
   подтипов.`
   Фраза «спрайт — спрайт слота» в спеке ЕДИНСТВЕННА (проверено grep'ом)
   — после правки нигде не встречается → пин !includes валиден.
2. «Содержимое города» (:412).
   БЫЛО: `постройки в городе отрисовываются слотовыми спрайтами
   (общий набор с картой мира); базовые — 1×1;`
   СТАЛО: `постройки в городе отрисовываются слотовыми спрайтами
   (общий набор с картой мира); подтипы с собственным спрайтом
   (000265) — свой спрайт; базовые — 1×1;`
3. «Анимация (кадр-свитч)» — ПОСЛЕ буллета CAMP_FRAMES (~:141, до
   «Строгая готовность (000224)») ДОБАВИТЬ буллет:
   `* Подтипы слотов 8..12 с собственным спрайтом (000265:
   37/38/39/41/42/43/45/46/48/49/55) — СТАТИЧНЫЕ: кадры не применяются
   (buildingFrames(слот, id) → null; у подтипов есть кадры только у
   слота 11 — колодец/фонтан НЕ наследуют кадры таверны).`

Wording-пин (tests/spec-000265-wording.test.js, паттерн
spec-000264-wording: norm() = \s+→' ', фразы переживают переносы строк):
- !includes('спрайт — спрайт слота')
- includes('спрайт — свой, если есть в каталоге (000265)')
- includes('подтипы с собственным спрайтом (000265) — свой спрайт')
- includes('НЕ наследуют кадры таверны')

## 5. Красные тесты (9; осмысленная краснота, не синтаксис)

Размещение — в файловых harness'ах домена (infrastructure уже там):

- **R1** (node, tests/buildings.test.js): 11 записей (37/38/39/41/42/43/
  45/46/48/49/55) в assets/buildings/*.json И в зеркале src/buildings.js
  имеют «спрайт» = ЗАКРЫТОМУ литералу (таблица §1, не из кода); pattern
  schema.json; файл svg существует; значения баз 13 + 47 + 51..54 —
  бит-в-бит старые SPRITE_PIN_000211_07. Красное: у 11 — undefined /
  ENOENT.
- **R2** (node, tests/sprites.test.js): buildingSprite(слот, subId) →
  СВОЙ SVG (11 пар §1); buildingSprite(слот, база) → старый путь
  ((8,36)=temple.svg, (9,31)=cave_entrance.svg, (10,40)=rune_stone.svg,
  (11,44)=tavern.svg, (12,25)=npc_house.svg); 1-арг. не меняется
  (buildingSprite(8)=temple.svg, buildingSprite(0)=weapons_shop.svg);
  невалидный id → слотовый канал (buildingSprite(11,999)=tavern.svg,
  (11,null)=tavern.svg, (10,'41')=rune_stone.svg); buildingFrames(11,45)=
  null, (11,49)=null, (8,37)=null, (12,55)=null, (9,48)=null;
  buildingFrames(11,44)=4 кадра, (11)=4 кадра (1-арг.), (11,999)=4 кадра,
  (11,null)=4 кадра. Красное: 2-арг. вызовы игнорируют id → temple.svg ≠
  moon_temple.svg; (11,45) → 4 кадра ≠ null.
- **R3** (node, tests/sprites.test.js): allAssetPaths() содержит 11 новых
  путей (дублей нет, файлы существуют); старые 18 (SP-B3 ALL_18) на
  месте. Красное: пути отсутствуют (в каталоге нет поля).
- **R4** (node, tests/svg.test.js): 11 файлов существуют; корень <svg>,
  xmlns, viewBox = 4 числа (0 0 64 64), нет NaN (строгий парсер — как
  sweep svg.test.js). Красное: ENOENT.
- **W1** (vm-мир, tests/global-map-draw.test.js): детерминированный мир;
  ближайший подтип = ruins 48 @(2,-4) (6 шагов; проверено сканом).
  drawImage = assets/sprites/buildings/ruins.svg (hardcoded), НЕ
  cave_entrance.svg; один w×h×zoom вызов; errors 0. Красное: рисуется
  cave_entrance.svg.
- **W2** (vm-мир, tests/global-map-draw.test.js): well 45 @(-75,15)
  (90 шагов; rec {x:-75,y:15,type:11,buildingId:45}). drawImage =
  well.svg и НИКОГДА tavern_*.svg (иди-приоритет ДО ветки кадров —
  проверить в двух кадровых окнах now); errors 0. Красное: рисуется
  tavern_N.svg.
- **C1** (vm-город, tests/dungeon-ui.test.js): город с buildings [{45},{37},
  {44}]: 37 → moon_temple.svg (не temple.svg), 45 → well.svg (не
  tavern-кадры, статично), база 44 → tavern-кадры без изменений;
  errors 0. Красное: temple.svg / tavern_N.svg.
- **C2** (vm-город, tests/dungeon-ui.test.js): город с buildings [{55},
  {25}]: 55 → storage.svg (не npc_house.svg), база 25 → npc_house.svg
  без изменений. Красное: npc_house.svg.
- **S1** (node, tests/spec-000265-wording.test.js): пин §4.4. Красное:
  SPEC не изменён.

expectedRedCount = 9. Верификация RED: npm test в worktree — ровно 9
новых падений, остальные зелёные.

## 6. Технические ре-пины (только механика зеркал/счётчиков)

- tests/svg.test.js (~:452): EXPECTED_SVG_BY_DIR 'sprites/buildings':
  42 → 53 (+ комментарий «+ 11 спрайтов подтипов, 000265»).
- tests/buildings.test.js R1 000211.07 (~:1454-1546): SPRITE_PIN_000211_07
  + 11 записей (старые 18 — БИТ-В-БИТ), SPRITE_RECORD_IDS_000211_07 +11
  (29), «ровно 18 из 55 / у остальных 37» → «ровно 29 из 55 / у остальных
  26», заголовок/сообщения, строгий контур пересчитан. Вынуждено ТЗ-п.1
  (задача меняет «кто имеет спрайт» — механизм 000211.07-контракта, НЕ
  ослабление: пин перечисляет id→path).
- tests/dungeon-ui.test.js: хелпер buildingSpritePath (:2459-2474) —
  зеркало cityBuildingPath 1:1: `G.buildingFrames(slot, id)`,
  `G.buildingSprite(slot, id)` (id = buildingId). Тест «город UI
  000148.02 (RED): субтип…» (:2526+) — ФЛИП ПО ТЗ (не ослабление):
  id 45 → well.svg (статично, без кадров), id 37 → moon_temple.svg;
  комментарий :2531-2534 обновить (старое поведение описано там).
  Все остальные использования хелпера (базовые id) — вывод неизменен
  (own == slotBase).
- tests/main-visuals.test.js: зеркало expectedBuildings (:774-785) →
  `G.buildingFrames(rec.type, rec.buildingId)`,
  `G.buildingSprite(rec.type, rec.buildingId)`; ассерты :842, :929 →
  `G.buildingSprite(rec.type, rec.buildingId)`; комментарий :614.
  (walkToMulti доходит до multi-постройки = храм-семья слота 8 — в кадре
  может быть ПОДТИП → зеркало ОБЯЗАТЕЛЬНО 2-арг., иначе ложный провал.)
- tests/city-screen.test.js: resolve-зеркала :1054-1060 (G1 e2e) и
  :1553-1558 (000264-рендер) → передавать buildingId.
- Процесс (не правка теста): `npm run sync:buildings` ПОСЛЕ правок JSON
  (зеркало; тест «JSON ≡ зеркало» buildings.test.js ~:861).

НЕ ТРОГАТЬ (остаются 1-арг./слотовыми — бит-в-бит):
- tests/city-screen.test.js :1213-1221 (иконки build-меню, 000202 e2e,
  зеркало buildIconPath — CI-B5).
- tests/city-interact.test.js CI-B5 (:354-394 и ~:1027).
- tests/building-anim.test.js BA-* (1-арг. пин BUILDING_FRAMES).
- tests/sprites.test.js SP-B1/B2/C2/R5/frames (1-арг. + ленивость).
- tests/map.test.js (GOLDEN_TILES, subtypeFor-золотые), tests/
  building-menu-layout.test.js (22 строки), tests/build-menu-layout,
  tests/global-map-draw.test.js RM-BA-5 (цель (-6,-14) = weapons shop,
  слот 0 — проверено сканом, не затрагивается), tests/index-order,
  tests/hacking-doc, 000264-пины (дungeon-ui 000264-U, city-screen E1/E2).

## 7. Что важно будущим задачам (из ссылок ТЗ)

- Слоты 8..12 = ЕДИНСТВЕННЫЕ слоты с подтипами (subtypeFor, 000073);
  базовая запись слота — та, что с map_index (13 записей); подтипы —
  размещение.слот + доля, БЕЗ map_index. Инвариант: подтип НОКОГДА не
  получает map_index (slotSpriteTable строится по map_index; map_index у
  подтипа = сломанная таблица слотов).
- Формула world-рекорда (map.js buildingAtAnchor): слотовые якоря —
  {type: слот, buildingId: subtypeFor(x,y,слот)} (слоты 8..12 — всегда
  id; слоты 0..7 — null); город/лагерь — {type: NONE(-1), buildingId:
  51..54/47}. buildingAsset/cityBuildingPath получают ТОЛЬКО такие пары.
- BUILDING_FRAMES — ЛИТЕРАЛ в sprites.js, ключ = СЛОТ (SPEC: «кадры —
  литеральные таблицы, ВНЕ каталога»); кадры _1.._4 = 4 кадра, кадр 1 =
  байт-копия базы. Новые подтипы кадров не имеют НИКОГДА (D3). Если
  будущая задача захочет анимировать подтип — нужен id-ключевой канал
  (как CITY_FRAMES/CAMP_FRAMES по buildingId), а не расширение
  BUILDING_FRAMES.
- 000264 (в городе): w×h-здание = ОДИН w×h-спрайт от якоря; footprint —
  из БАЗОВОЙ записи слота; cityBuildingPath не знает размера, только путь.
- allAssetPaths() = ЕДИНСТВЕННЫЙ pre-лоад (000224): любой новый asset
  обязан в нём числиться (у зданий — автоматически через поле «спрайт»).
- Прецеденты: 000211.07 (спрайт = поле каталога, source of truth),
  000110/000131 (citySprite/campSprite — id-канал, spriteForId || base),
  000224/000238 (строгая готовность кадров, fallback запрещён),
  000038 (UMD-снапшот Game один раз, ленивые ссылки).
- 55 Хранилище: доля = 0 (явно) → subtypeTable исключает из мира
  (только город, строится игроком). Спрайт — тоже (storage.svg).

## 8. Подводные камни

1. **Рассинхрон кадр/спрайт (критично)**: без gate в buildingFrames
   45/49 (слот 11) наследуют tavern-кадры → колодец «горит» кадрами
   таверны. Gate `own && slotBase && own !== slotBase → null` + красные
   R2 (buildingFrames(11,45/49)=null) и W2 (well.svg, не tavern_N).
2. **Gate по own, а не по id**: если бы condition был «у id есть свой
   спрайт → null кадров», базовая таверна (44) потеряла бы анимацию
   (own = tavern.svg существует). Равенство own === slotBase —
   обязательное условие fallback на кадры.
3. **Зеркала тестов зеркалят ПРОД 1:1**: main-visuals expectedBuildings,
   dungeon-ui buildingSpritePath, city-screen resolve — обновить В ТОМ
   ЖЕ коммите, иначе ложные провалы (walkToMulti — храм-семья, в кадре
   бывает подтип) или ложное зелёное.
4. **R1-репин 18→29 не ослабление**: ТЗ-п.1 меняет контур «кто имеет
   спрайт» (механизм задачи, прецедент 000211.07); пин остаётся
   ЗАКРЫТЫМ (29 id→path перечислены литералами).
5. **SVG-валидатор строгий** (svg.test.js sweep): корень <svg>, xmlns,
  viewBox 4 числа, без NaN/DOCTYPE/CDATA/SMIL. Новые 11 обязаны пройти
  sweep ДО/СРАЗУ после попадания в assets/ (иначе whole-dir падение).
   HTML-комментарии внутри SVG допустимы (как у существующих).
6. **Байт-в-бит 42 существующих SVG** (вкл. 7 пар base == _1): git diff в
   assets/sprites/buildings/ — ТОЛЬКО +11 файлов.
7. **Имена без дефисов**: паттерн schema.json `[\w]+\.svg` — только
   буквы/цифры/_. «teleport_circle», НЕ «teleport-circle».
8. **Меню ≠ здание (осознано)**: buildIconPath по слоту (CI-B5) — иконка
   build-48 = cave_entrance.svg, а здание 48 = ruins.svg. Не «чинить»
   без ТЗ.
9. **UMD/vm**: новые ветки — только spriteForId/slotSpriteTable (чистые,
   ленивые); в песочницах без каталога — тихая деградация до старых
   путей; console.error НЕ вводится (канала-зависимости нового нет).
10. **Конфликты мержа**: 000263 (город-иконки/здания) может трогать
    dungeon-ui.js/sprites.js; параллельные worktrees не трогать; rebase
    на свежий master перед мержем + полный тест (алгоритм CLAUDE.md).
11. **Один worktree = один полный `node --test`** (тест 000054 мутирует
    src/npc-data.js; параллельные полные прогоны в одном worktree —
    нет).
12. **sync:buildings** — ТОЛЬКО после правок JSON; руками src/buildings.js
    не править (тест зеркало ~:861).

## 9. План реализации (по файлам) + ожидаемая дельта

Порядок: (а) 11 SVG → прогон svg.test.js sweep; (б) 11 JSON «спрайт» →
npm run sync:buildings; (в) sprites.js резолвер; (г) main.js +
dungeon-ui.js call-sites; (д) SPEC 3 строки; (е) красные (9) +
технические ре-пины (§6); (ж) npm test — всё зелёное; (з) CHANGELOG.

| файл | действие | дельта (строк) |
|------|----------|----------------|
| assets/sprites/buildings/{moon_temple,mountain_temple,abandoned_temple,teleport_circle,obelisk,magic_circle,well,watchtower,ruins,fountain,storage}.svg | НОВЫЕ 11 | +11 файлов × ~15-25 |
| assets/buildings/0000{37,38,39,41,42,43,45,46,48,49,55}.json | + поле «спрайт» (последнее) | +11 × ~2 |
| src/buildings.js | регенерация sync:buildings | ~+11 |
| src/sprites.js | buildingSprite/buildingFrames: опц. 2-й аргумент + JSDoc-обновление сигнатур (только существующие блоки) | ~+25/−4 |
| src/main.js | buildingAsset: 2 call-выражения (rec.type, rec.buildingId) | 2 |
| src/dungeon-ui.js | cityBuildingPath: 2 call-выражения (slot, buildingId) + точность 1-строки комментария | ~2+1 |
| spec/buildings.md | 3 формулировки (§4) | ~4/2 |
| tests/spec-000265-wording.test.js | НОВЫЙ (S1, паттерн 000264) | ~+70 |
| tests/buildings.test.js | R1 + ре-пин 000211.07 (18→29) | ~+45/−8 |
| tests/sprites.test.js | R2 + R3 | ~+90 |
| tests/svg.test.js | R4 + 42→53 | ~+55/1 |
| tests/global-map-draw.test.js | W1 + W2 | ~+120 |
| tests/dungeon-ui.test.js | C1 + C2 + хелпер + флип субтип-теста | ~+120/−10 |
| tests/main-visuals.test.js | зеркало expectedBuildings + :842/:929 | ~6 |
| tests/city-screen.test.js | 2 resolve-зеркала | ~4 |
| CHANGELOG.md | «## 2026-10-25» → «### Графика» + буллет | ~+6 |
| memory/000265-subtype-building-sprites.md | этот файл | +~200 |
| tasks/{pending→done}/000265.md + tasks/result/000265.md | перенос + отчёт | — |

Итого: ~25 файлов изменено, +13 новых (11 SVG + wording-тест + memory),
один коммит «Задача 000265: …» + Co-Authored-By: Claude Code
<noreply@anthropic.com>. index.html, schema.json, src/map.js,
src/building-actions.js — НЕ изменяются.

## 10. Решения (openQuestions → зафиксировано)

1. **Где данные**: поле «спрайт» каталога (не литерал SUBTYPE_SPRITES) —
   ТЗ-цель: «резолв по id каталога (хук spriteForId)»; counter-аргумент
   a2 (last-wins slotSpriteTable) опровергнут кодом (таблица — только по
   map_index; у 13 баз — есть, у подтипов — нет, проверено по файлам).
2. **Форма резолвера**: расширить buildingSprite/buildingFrames
   опциональным 2-м аргументом (не новая функция) — «один резолвер» ТЗ =
   общая поверхность sprites.js; без нового экспорта (UMD-поверхность
   Game стабильна, 000038); legacy-бит-в-бит без новых гардов;
   base-проверка структурно защищает NONE/city/camp-каналы.
3. **Кадры**: все 11 статичные (не 11×5) — кадры слотовые литералы
   (SPEC: вне каталога); единственный конфликт (45/49 ← tavern) снят
   gate'ом; «не больше и не меньше» ТЗ.
4. **Имена SVG**: set a2/a3 (moon_temple…storage) — два полных анализа
   сошлись; snake_case = стиль семейства; коллизий на диске нет
   (проверено find'ом); warehouse/temple_moon-варианты a1 — отвергнуты.
5. **Силуэты** (§2.5-стиль): temple-семья — тот же силуэт, разная
   палитра/символ на фронтоне (луна/гора/руина); teleport_circle vs
   magic_circle — циан vs фиолет + разные глифы; obelisk — высокий
   монолит с ЗОЛОТЫМИ рунами (у базы 40 — циан); well — каменный ствол +
   крыша на столбах + ведро; fountain — чаша + струя; ruins — сломанные
   стены + лежащая колонна, БЕЗ тёмного входа (у cave_entrance — вход +
   кристаллы); watchtower — высокий силуэт с платформой (vs низкий дом);
   storage — сарай с двускатной крышей + ворота (vs соломенная арка
   npc_house). Все — тень-ellipse rgba(0,0,0,0.28), flat, обводки
   0.8–1.2, палитра семейства (камень #7a7264/#8a8274/#6a6254, дерево
   #8a6f4d/#96793f/#7a5a34, золото #e8c25a, свечение #7de8ff, мох
   #4f7a3a).
6. **SPEC**: 3 строки (§4) — минимально по ТЗ-п.4; остальной текст
   бит-в-бит.
7. **Красные — в файлах-доменах** (не отдельный файл-свалка) — harness'ы
   vm-мира/города живут в global-map-draw/dungeon-ui; S1 — отдельный
   wording-файл (паттерн 000264).
8. **CHANGELOG** — в тот же единый коммит (прецедент 000264; CLAUDE.md:
   один коммит на задачу), раздел «Графика», дата 2026-10-25 (сегодня).
9. **Меню-иконки** — по слоту (CI-B5 бит-в-бит), несогласованность
   иконка/здание осознанна и зафиксирована (§8.8).
10. **JSDoc** в sprites.js — обновить ТОЛЬКО существующие блоки двух
    изменённых функций (сигнатура + семантика 2-го аргумента); новых
    комментариев не писать (правило проекта — info в memory).

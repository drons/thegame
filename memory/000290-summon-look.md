# Контракт вида призывного (000290) — «Морозный вестник» и все 13 заклинаний «призыв»

Баг-репорт drons (2026-11-02): призванный по frost_wisp (000063) в бою
выглядит орком, а не wind_elemental. Фикс — ВИД призывного (спрайт);
статы/имя/роль были и остаются верными (из MOB_TYPES[параметры.summon]).
База — master 91c66a1; worktree .worktrees/task-000290, ветка task/000290.

## 1. Корень: ДВУСЛОЙНЫЙ, 3 ханка (все 3 — в существующих модулях)

1. **src/combat.js, `makeAlly` (:367-439)** — литерал возврата юника
   СОЮЗНИКА не имел поля вида (у вражеских мобов есть — `makeMob` :313
   пишет `mobId`). Ханк: после строки `kind: data.kind || 'merc',`
   добавить `mobId: data.mobId || null,`. Все текущие вызовчики
   (createCombat :3601 — наёмники из companions; spells.js :795 —
   призыв) либо получают `pa.summon`, либо не передают mobId → null.
   `resurrectAlly` (:1184) НЕ пересоздаёт юнит (alive + 50% hp) →
   поле не теряется. Аддитивное поле: в тестах НЕТ deepEqual на целом
   объекте союзника (проверено) — бит-в-бит.
2. **src/spells.js, `case 'призыв'` (:787-823)** — данные makeAlly
   не несли id призываемого. Ханк: после `kind: 'summon',` добавить
   `mobId: pa.summon,`. `pa.summon` уже fail-closed проверен
   (evalSpell :487-497: `MOB_TYPES[pa.summon]` — до расхода пула/маны)
   → mobId всегда валидный id MOB_TYPES.
3. **src/combat-ui.js, `allyFrames` (:1589-1602)** — ветвление по
   `u.kind`: 'efir' → G.efirFrames; 'merc' && u.id → G.mercFrames
   (orc-фолбэк); **else → G.MOB_FRAMES[ALLY_MERC_KIND], ALLY_MERC_KIND
   = 'orc' (:122, пин 000084)** — сюда падал КАЖДЫЙ kind 'summon'.
   Ханк: НОВАЯ ПЕРВАЯ ветка `if (u.kind === 'summon' && u.mobId)`
   (см. §3) — остальное тело бит-в-бит.

«Спавн» (placeAllies/allyRoom) в баге НЕ виноват — это смежная 000292
(спавн на препятствиях); обе правят spells.js case 'призыв' — наши
регионы различаются (u.mobId — одна строка в данных makeAlly),
решается на ребазе.

## 2. Аудит ВСЕХ 13 заклинаний «призыв» (SCOPE 2) — единый корень, дочерних задач НЕТ

Источник: assets/spells/*.json (`действие === 'призыв'`, зеркало
spells-data.js 1:1 — пин 167). ВСЕ 13 рендерились орком (orc_1/orc_2)
— одна причина (§1). Независимых корней не найдено → по ТЗ SCOPE 3
все чинятся ЭТОЙ задачей, дочерние задачи НЕ создаются.

| файл | spell | параметры.summon | вид ДО | вид ПОСЛЕ (арт → базовый вид) |
|---|---|---|---|---|
| 000038 | flame_imp | imp | orc (БАГ) | imp-арт → elemental |
| 000039 | phoenix | fire_elemental | orc (БАГ) | fire_elemental-арт → elemental |
| 000063 | frost_wisp | wind_elemental | orc (БАГ, репорт) | wind_elemental-арт → elemental |
| 000064 | winter_elemental | water_elemental | orc (БАГ) | water_elemental-арт → elemental |
| 000087 | shadow_wraith | vampire | orc (БАГ) | vampire-арт → skeleton |
| 000088 | void_horror | bone_coloss | orc (БАГ) | bone_coloss-арт → skeleton |
| 000109 | light_sprite | fairy | orc (БАГ) | fairy-арт → elemental |
| 000110 | spirit_healer | orc_shaman | orc (случайно верно по базовому виду) | orc_shaman-арт → orc |
| 000111 | holy_guardian | earth_elemental | orc (БАГ) | earth_elemental-арт → elemental |
| 000137 | stone_golem | stone_golem | orc (БАГ) | stone_golem-арт → elemental |
| 000138 | iron_sentinel | bone_coloss | orc (БАГ) | bone_coloss-арт → skeleton |
| 000163 | forest_beast | wolf | orc (БАГ) | wolf-арт → wolf |
| 000164 | treant | earth_elemental | orc (БАГ) | earth_elemental-арт → elemental |

Примечания:
* «случайно ок» у spirit_healer — артефакт ТОГО ЖЕ фолбэка (orc_shaman
  маппится в базовый 'orc'), а не отдельная причина; персональный арт
  orc_shaman ему тоже не показывался.
* У всех 11 уникальных id целей ПЕРСОНАЛЬНЫЙ АРТ существует на диске
  (проверено): assets/sprites/mobs/<id>_{move_1,move_2,attack_1,
  attack_2,dead_1}.svg для imp, fire/wind/water/earth_elemental,
  vampire, bone_coloss, fairy, orc_shaman, stone_golem, wolf.
* Все summon-id ∈ MOB_TYPES и ∈ MOB_SPRITE_KINDS (36 id, sprites.js
  :244; пин tests/sprites.test.js :1295/:1436) — AUDIT-2 страхует
  рост каталога.
* HEAL_SUMMON_IDS (light_sprite, spirit_healer) и
  ROOT_ON_ATTACK_SUMMON_IDS (treant) — только u.spells/traits, на вид
  не влияют.

## 3. Контракт цепочки вида призывного (алли-ветка, v1)

`allyFrames` — ПЕРВАЯ ветка: `u.kind === 'summon' && u.mobId`
(зеркало гарда merc-ветки `u.kind === 'merc' && u.id`). Цепочка —
МИРАЖ моб-ветки (mobSprite :1558-1569) + orc-пол:

1. **Персональный арт** — `G.mobArtFrames(u.mobId, 'move')` (2 кадра,
   MOB_ART_FRAME_COUNTS :277). Действие — **'move' ЗАДАНО**
   (v1 ally-ветки: входящий action = 'idle'/'cast'; каталог арта
   действий move/attack/dead — 'idle' в нём НЕТ; 'move' =
   детерминированная замена «стоит»). c._unitFx в ally-ветке НЕ
   читается (контракт 000084: player-центричная эвристика 000062;
   attack-анимация призывного — НЕ в v1, отдельная будущая фича).
2. **Базовый вид** — `G.MOB_FRAMES[G.mobSpriteKind(u.mobId)]`
   (6 видов, 000047).
3. **orc-фолбэк** — `G.MOB_FRAMES[ALLY_MERC_KIND]` (000084):
   неизвестный mobId / деградация — призывной деградирует как наёмник
   (orc-архетип), а не в прямоугольник; без sprites.js/лоадера →
   null → п.4.
4. **ROLE_COLORS[u.role] || '#888' — прямоугольник** — существующий
   фолбэк вызывающей ветки (:1641-1644), без изменений.

Семантика кандидатов — **per-candidate image fallthrough** (как
mobSprite: пустой список → следующий кандидат; image() → null
(картинка ещё не загрузилась) → следующий кандидат). НЕ одно-списковая
семантика текущего тела allyFrames (там image() → null = сразу
null) — R2 пинит fallthrough: арт не загрузился → рисуется базовый
вид, а не прямоугольник.

Реализация (рекомендуемый ханк): `const img = mobSprite(u, now,
'move'); if (img) return img;` затем orc-кадр той же геометрией
выбора (frameIndex + spriteLoader.image). mobSprite — hoisted-функция
того же замыкания drawUnits, переиспользуется (цепочка 1:1, без
дублирования цикла). Эквивалентная inline-цикла 3 кандидатов допустима
при том же наблюдаемом поведении (requested[]/drawImage).

**u.mobId — дискриминатор вида**: у merc/efir — ВСЕГДА null
(makeAlly-дефолт `data.mobId || null`); у призывного — id из
параметры.summon. Никто, кроме summon-ветки allyFrames, u.mobId у
союзника НЕ читает (проверено grep'ом) — поле не меняет боевую
механику, сейвы, детерминизм.

Кадр — `G.frameIndex(now, u.x, u.y, n)` (чистая, детерминизм 000047;
now — один на render). Геометрия — геометрия вызывающей ветки:
drawImage(px+8, py+8, pw−16, ph−16), подложка/HP-полоса/уровень/
рамка — без изменений.

## 4. Инварианты (что менять нельзя / что остаётся бит-в-бит)

* Ветки 'efir'/'merc' allyFrames — БИТ-В-БИТ; пины 000084/000197
  (наёмник без npcId → MOB_FRAMES['orc'], tests/combat-ui.test.js
  :1822-1824, :2851-2854) и 000152 (merc_volk — свой спрайт, orc НЕ
  запрашивается, :2745) — без правок.
* styleCalls-пины R3/R5 (подложка rgba(140,242,252,0.25), рамка
  #8cf2fc, hpBarColor vs '#6fdc6f'), геометрия 44×44/32×32/32×4/
  39×39, golden R6 — без изменений (новые vm-сцены призывных нет →
  существующие сцены не тронуты).
* **Призывной — ВСЕГДА 1×1** (makeAlly size {w:1,h:1}; пин
  tests/combat.test.js:3272). Мультиклеточные мишени (fire_elemental,
  earth_elemental, stone_golem, bone_coloss — 3×3; water_elemental —
  2×2) рисуются со сжатием на 1×1-клетку (32×32), как все союзники.
  Размер НЕ входит в ТЗ; менять size = геймплей (unitAt/placeAllies/
  allyRoom) — НЕ делать, тема для отдельной задачи.
* v1 ally-ветки — 'idle' только ('cast' — только у efir);
  c._unitFx не читается в ally-ветке.
* makeAlly: формулы (maxHP/damage/armor/mp/spellInt/spellWis/quick/
  freeCast) — без изменений;.mobId — единственное новое поле.
* Детерминизм: 0 новых c._rng (mobId — константа спелла; frameIndex —
  чистая); строки лога без изменений («…: … (N ходов).» — пин
  spec-000235-wording); turnOrder/XP/размещение — без изменений.
* Сейвы: бой НЕ персистится (src/save.js — только исход) → вопроса
  совместимости нет.
* UMD/G-снапшот (combat-ui.js :91, один раз): mobArtFrames/
  mobSpriteKind/MOB_FRAMES/frameIndex — из sprites.js (в цепочке
  index.html ДО combat-ui.js) — в снапшоте; в vm без sprites.js
  (withSprites=false) — гарды (G.X ? … : []) ведут в
  ROLE_COLORS-прямоугольник, как у merc (деградация, не падение).

## 5. Указатели на тесты

* **НОВЫЙ node-файл tests/summon-appearance-000290.test.js** (прямые require
  src/combat.js, src/player.js, src/spells.js, src/sprites.js —
  прецедент хелперов tests/summon-regen-000272.test.js, свои копии,
  экспортов нет):
  * 000290-CAST-1 (RED): каст frost_wisp → юнит kind 'summon',
    summonTurns 4, name «Ветряной стихийник», role 'ranged',
    **mobId 'wind_elemental'** (контрпример: undefined).
  * 000290-AUDIT-1 (RED): обход assets/spells/*.json с действием
    «призыв» (13) — каст каждого → юнит.mobId === параметры.summon И
    юнит.name === MOB_TYPES[summon].name (пин таблицы §2).
  * 000290-AUDIT-2 (GREEN): для всех 13 — summon ∈ MOB_TYPES И
    mobSpriteKind(summon) ∈ keys(MOB_FRAMES) (нет призывного без
    вида; страхует рост каталога).
  * 000290-DEF-1 (GREEN): makeAlly без mobId → null (наёмник/Эфир
    бит-в-бит); makeAlly с mobId → хранит.
* **tests/combat-ui.test.js — append-only блок** (хелперы
  scene84/fakeLoader84/tickSlice/NOW84, паттерн addMerc84 :1685;
  белый ящик: G.makeAlly({…, kind:'summon'}, 1) + u.mobId + x/y +
  push c.units/c.turnOrder):
  * 000290-R1 (RED): mobId 'wind_elemental' → requested содержит
    wind_elemental_move_<frameIndex(NOW84,x,y,2)+1>.svg, orc_ НЕ
    запрашивается, drawImage __fake:'wind_art' на (x*48+8, y*48+8,
    32, 32). Контрпример (мастер): запрашиваются orc_*.
  * 000290-R2 (RED): тот же юнит, лоадер БЕЗ префикса
    wind_elemental_ (арт → null) + префикс elemental_ → requested
    содержит elemental_<N>.svg (пер-кандидатный fallthrough),
    orc_ — нет.
  * 000290-R3 (GREEN): mobId 'no_such_mob' И вариант без mobId →
    orc-кадр запрошен (деградация 000084), drawImage, исключений 0.
* **expectedRedCount = 4** (CAST-1, AUDIT-1, R1, R2). Гарды
  AUDIT-2, DEF-1, R3 — зелёные на обеих стадиях.
* Базовый прогон станции (чистый мастер): 462/462 по tests/combat-ui.
  test.js + tests/spells.test.js + tests/sprites.test.js +
  tests/summon-regen-000272.test.js.

## 6. Что добавлено / перенесено

* Добавлено: поле u.mobId у союзников (дефолт null); 1 строка данных
  в spells.js; 1 ветка в allyFrames (~9 строк). Модулей, ассетов,
  script-тегов, CSS, строк лога — НЕТ. index.html и
  tests/index-order.test.js — не трогать (новых script-тегов нет).
* tests/svg.test.js не задействован (новых SVG нет; используются
  существующие кадры assets/sprites/mobs/).
* Перенесено: ничего (всё — правки в существующих местах).

## 7. Контракты и границы

* Граница задачи — ВИД призывного в бою. НЕ входит: размер (1×1),
  attack/dead-анимация призывного, спавн-позиции (000292), портреты
  в панелях (у панелей своих иконок по роли — не спрайты боя).
* KIND 'summon' — установленный дискриминатор (уже используется в
  гейтах «Лечение» combat-ui.js :492/:3109, поддержки
  combat.js :2583, рассеивания summonTurns) — новые ветки по этому
  kindу добавляются только под своей задачей.
* fail-closed каста (evalSpell :487-497) — НЕ трогать: он же
  гарантирует валидность mobId.
* HEAL_SUMMON_IDS/ROOT_ON_ATTACK_SUMMON_IDS (spells.js :1147-1148) —
  ортогональны виду.

## 8. Ленивые ссылки и гарды

* G-снапшот combat-ui.js — БЕЗ ПРАВОК (правило 000038): все
  используемые функции читаются из G лениво в момент вызова (гарды
  G.mobArtFrames/G.mobSpriteKind/G.MOB_FRAMES/G.frameIndex — в
  mobSprite и новом ханке, паттерн G.mercFrames 000152).
* Отсутствие зависимости = деградация, не падение: без sprites.js
  или без spriteLoader — ROLE_COLORS-прямоугольник (паттерн
  hpBarColor); console.error 0, исключений 0 (пин R3/G1 000152).

## 9. Что важно будущим задачам (из ссылок ТЗ)

* 000292 (спавн на препятствиях) — параллельная; правит тот же
  case 'призыв' в spells.js (регион placeAllies/размещения) и
  combat.js (placeAllies :3282+) — наши регионы (makeAlly :436,
  данные makeAlly) не пересекаются; при мерже — наш ханк в spells.js
  ОДНА строка после `kind: 'summon',`.
* Будущая «attack-анимация призывного»: точка расширения — вызов
  mobSprite(u, now, 'move') в summon-ветке (заменить 'move' на
  эвристику, как у моб-ветки :1689-1691); v1 нарочно не читает
  c._unitFx (контракт 000084).
* Будущий «размер по MOB_TYPES» — ломает пин tests/combat.test.js:
  3272 + геометрию ally-ветки + placeAllies/allyRoom — отдельная
  задача с ТЗ.
* Новые заклинания «призыв»: AUDIT-1/AUDIT-2 подхватят
  автоматически (обход каталога); новый id цели ДОЛЖЕН быть в
  MOB_SPRITE_KINDS (иначе — orc-фолбэк молча).

## 10. Подводные камни

* Семантика fallthrough (per-candidate image) — НЕ копировать
  одно-списковую семантику тела allyFrames в summon-ветку (R2
  упадёт: арт не загрузился → должен быть базовый вид, а не
  прямоугольник).
* Гвард `u.kind === 'summon' && u.mobId` — ДВЕ части: без `u.mobId`
  суммон-фикстуры без mobId ушли бы в цепочку с null (mobArtFrames
  вернул бы [] — не падало бы, но семантика деградации и пин R3-
  «без mobId → else-ветка» потеряны).
* Не править tests/combat.test.js / tests/spells.test.js (параллельная
  волна 000235.07.01 трогает spells.test.js) — ВСЕ новые тесты в
  новом файле + append в combat-ui.test.js (нулевой merge-конфликт).
* Полный прогон ТОЛЬКО `cd .worktrees/task-000290 && npm test`
  (memory/test-runner-worktrees.md); голый npm test из корня —
  рекурсивный скан .worktrees/* (гонка drift-маркера).
* Комментарий в коде — НЕ больше однострочной task-референции (стиль
  файла «000152: …»); правда — этот файл + git blame.

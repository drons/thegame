# 000340 — subset-списки слоёв вместо полных сканов frameTiles (RENDER-OPTIMIZE §5B)

## 1. Суть правки (src/main.js, замыкание IIFE рядом с frameTiles)

Спрайт-слой делал 4 полных прохода по frameTiles каждый кадр. Теперь при
пересборке frameTiles в ТОМ ЖЕ row-major цикле наполнения собирается
«пакет субсписков»; на хите проходы итерируют пакеты. Визуал бит-в-бит
(золотой T1), CHANGELOG 0-diff.

Пакет (`frameSubsets`, замыкание; зеркало `state.frameTilesCache.subsets`
/ `.subsetBuilds` — носители наблюдения для тестов, как tiles/hits):

- `water[]` — тайлы WATER/DEEP_WATER (носитель: Проход 1 в chunk-режиме);
- `decor[]` — тайлы с `G.tileVisuals(...).length>0` без стен; вычисляется
  ТОЛЬКО при `vis` (см. §3) — иначе на z<24 сборка платила бы N вызовов
  tileVisuals за кадр;
- `loot[]` — `t.loot && !(inBuilding && !isEntrance)`;
- `anchors[]` — строки `'ax,ay'` first-seen дедуп по buildingAnchor
  (Set+массив; Set зануляется после сборки `anchorSeen = null`);
- `mobs[]` — `t.hasMobGroup`;
- `p1[]` — row-major объединение water∪decor∪loot: полный список Прохода 1
  для chunk-режима (не-члены p1 дают ровно НОЛЬ вызовов: текстура в
  chunk-режиме только у воды, decor/лут — только члены);
- версия пакета: `keyRef` (идентичность объекта frameTilesKey), `vis`,
  `lootN = collectedLoot.size`, `mobN = defeatedAt.size`.

Места сборки:
1. **in-line в rebuild-цикле buildFrame** (`frameSubsetAdd(subPkg, t)`
   сразу после `frameTiles.push(t)`, ноль лишних сканов; `keyRef`
   присваивается после создания key, счётчик += 1);
2. **лениво в drawSprites** (`frameSubsetsCollect`) — ровно один проход по
   frameTiles, ТОЛЬКО когда проверка инвалидации провалилась на хите
   (collect/победа/respawn без пересборки frame).

Итерация на хите: Проход 1 — `for (const t of (useChunks ? subs.p1 :
frameTiles))` (в НЕchunk-режиме каждый тайл рисует текстуру — p1 там
неприменим, полный скан остаётся); Проход 2 — `for (const key of
subs.anchors)` (Set+сбор удалены); Проходы 2.5 и 3 — `for (const t of
subs.mobs)` (гарды `hasMobGroup`/live-фильтры в теле сохранены). ЦИКЛ
ГЕЙТА buildFrame (hit-ветка legacyTileVerts) ПОЛНЫЙ НЕ ТРОНУТ —
ограничение FT-6/000339 (маркеры рисуются и при всех ready).

## 2. Инвалидация — «версия ключа», НЕ явный bump

Условие пересборки пакета в drawSprites (перед Проходом 1):

```
frameSubsets === null
|| frameSubsets.keyRef !== frameTilesKey      // любая пересборка frame
|| frameSubsets.lootN !== collectedLoot.size  // collect / respawn лута
|| frameSubsets.mobN !== defeatedAt.size      // победа / respawn групп
|| frameSubsets.vis !== showVisuals           // порог 24 пересечён
```

Почему производная от live-значений, а не `worldVersion++`-подобный bump:
точка collect физически в `src/building-actions.js` (вне SCOPE main.js),
respawn/победа пишут Map'ы напрямую; явный bump требовал правок вне файла
или прокидывания вызова. Паттерн `exploredVersion` (000276 §3): версия =
чистое значение из live-структуры, пересчитываемое на кадр — не может
«забыть» точку изменения. Размер Map — монотонный инкремент/декремент с
каждым mutation'ом интересующих render множеств; collect всегда меняет
size (добавление нового ключа; повторный сбор того же ключа неудачен —
действие не доходит до render-состояния), respawn onDay удаляет записи →
size меняется → пакет пересобирается.

`keyRef !==` — идентичность объекта: rebuild ВСЕГДА создаёт новый
frameTilesKey → пересборка пакета гарантирована (в т.ч. после
spawnBuildingTile FT-6, day-change exploredVersion и т.п.).

## 3. Почему live-фильтры остаются В ПЕТЛЕ ОТРИСОВКИ (главный контракт)

Членство в субсписках — функция ДетЕРМИНИРОВАННОГО мира (map.js hash по
координатам; 000276 §3) — СТАТИЧНО между пересборками frame. А «лут
собран» (`collectedLoot`) и «группа повержена» (`defeatedAt`) — live-Map'ы,
меняющиеся ПОСЕРЕДИ жизни пакета без изменения мира. Если вынести
`G.lootVisible`/`G.groupVisible` из тела прохода в `frameSubsetAdd`:
- собранный лут останется нарисованным «призраком» до следующей пересборки
  frame (движение/зум) — регресс 000158.04/000158.05;
- поверженная группа «воскреснет» раньше respawn_days — регресс 000122.
Фильтры дёргаются на членов пакета (горстка), не на весь frameTiles —
выигрыш сохраняется. Тесты-носители: T3 (collect→ровно 1 пересборка, без
призрака), T4 (победа/день<respawn: пересборки НЕТ, группа скрыта
фильтром; день≥respawn: ровно 1 пересборка + возврат), T7 (обёртки
фильтров скрывают/возвращают на хите БЕЗ пересборок). Мутации M2/M2b.

## 4. tileVisuals-экономика (риск «сборка дороже выгоды»)

Сбор `decor` зовёт `G.tileVisuals` на каждый НЕстеновой тайл — это N
вызовов; допустимо ТОЛЬКО когда слой активен. Поэтому `vis` фиксируется в
пакете при сборке и проверяется при валидации: при z<24 decor НЕ
вычисляется вообще (T5: 0 обращений tileVisuals на rebuild- и hit-кадрах
z=4). На 4K (chunk+visuals вместе, z∈[24;32)) rebuild: ровно 1 вызов на
нестеновой тайл нового range; hit: только по НЕстеновым членам p1
(p1 ≪ |frameTiles|, 4K@z≈26.8: |p1|≈10.4k против 14.9k... пинит свойство
«< |frameTiles|», не литерал).

## 5. Подводные камни харнеса (tests/render-frame-subsets-000340.test.js)

- **vm-realm-ловушка**: `.map/.slice` на массиве из vm-sandbox конструирует
  массив ЧУЖОГО realm (Array Species sandbox'а) — `deepStrictEqual` к
  host-массиву падает при полном поэлементном равенстве (прототипы из
  разных realm; TAP YAML при этом печатает списки ИДЕНТИЧНО — 10k элементов,
  ложный «пустой» diff). Рецепты: `Array.prototype.map.call` /
  `sliceHost` (см. `coordList`).
- **createdCanvases отслеживает ПРОКСИ канваса, не target**: drawImage
  получает прокси; `has(target)` ложен → chunk-блипы классифицировались
  как img с `__asset` == функция-фолбэк прокси ('a.startsWith is not a
  function').
- **Префикс текстур тайлов — `assets/tiles/`** (НЕ assets/sprites/tiles/);
  иконки natural-лута `assets/sprites/loot/` (33/33 ITEMS с loot:true;
  экипировочные иконки `assets/sprites/items/` — в лут-проход не
  попадают).
- **z-порядок «decor < loot» существует только ВНУТРИ тайла**: Проход 1
  чередует water/deco/loot по-тайлово (row-major), глобальные max<min по
  deco и loot БЫВАЮТ НАРУШЕНЫ законно. T6 пинит границы ПРОХОДОВ
  (blit < [tile∪deco∪loot] < building < arc < mob < hero); поэлементный
  порядок внутри Прохода 1 запинен золотым deepStrictEqual T1 (полная
  последовательность вызовов).
- Золотой эталон T1: независимая full-scan реализация проходов харнесом
  (G.worldToScreen/worldAnchoredTileEdges/ChunkCache/visualDrawRect/
  lootSprite/buildingFrames...+node SPR.*/WORLD); steady state
  (assertReady) позволяет считать `spriteLoader.image(any)` истинным;
  герой в покое = idle (animUntil=0, lastStepAt покой), волка нет.
- Фикстура «chunk + decor + loot вместе» только на 4K: 3840×2160, 6
  wheel-out (80/1.2^6≈26.79 ∈ [24;32)); 1280×720@z4 — chunk без decor/loot
  (пороги 24/16). 1280×720@80 — non-chunk (p1 неприменим, T3/T4/T7 идут
  на ней, проверая live-фильтры и в этом режиме).
- `settleFrames` — плато по subsetBuilds (cam-сглаживание + explored
  разведка ещё несколько кадров двигают range после шагов).

## 6. Мутации (ФАКТ по TAP — матрица в tasks/result/000340.md; набор
6 файлов/58 тестов; TAP /tmp/000340-m<N>.tap; прецедент 000339 — черновик
расходился с артефактами, синхронизировано по TAP)

- M1 убрать `lootN !==` из проверки → ТОЛЬКО T3 (58/57/1) — обязательная;
- M2 `groupVisible` из тел Проходов 2.5/3 в сборку mobs[] → ТОЛЬКО T7
  (58/57/1); Т4 ЗЕЛЁН (победа двигает mobN → пересборка; скрытие без
  движения Map ловит только T7) — вывод: наблюдимый маркер «фильтр
  вынесен» именно обёртка-фильтр на хите, не победа;
- M2b `lootVisible` в сборку loot[] → LM7 (main-loot, e2e-носитель
  призрачного лута 000158.05) + T3 + T7 (58/55/3) — чужой носитель
  краснеет сам;
- M3 обратный порядок сборки (обе сборки) → T1 + T2 (58/56/2); T6
  ЗЕЛЁНЫЙ: разворот субсписков не двигает границы ПРОХОДОВ (их он и
  пинит); порядок внутри Прохода 1 пинит золотой T1;
- M4 decor без `vis`-флага → ТОЛЬКО T2 (58/57/1): decor≠[] при z<24;
  T5 зелёный (хит-плато в мутации decor-ветку не выполняет);
- M5 убрать `keyRef !==` → 0 красных (58/58/0): in-line сборка в rebuild
  всегда ставит свежий пакет — условие защитное; в паре с M5b (+убрать
  `frameSubsets = subPkg`) → 10 красных (RM-BA-1/2/5/6, RM-CAMP-2,
  000265-W2, LM7, T2, T3, T5) — keyRef ЕДИНСТВЕННЫЙ страж свежести без
  in-line установки; пара «in-line сборка + keyRef-проверка» взаимно
  дополняющая (в изоляции каждая необязательна);
- M6 убрать `mobN !==` → ТОЛЬКО T4 (58/57/1).

## 7. Соседство

- 000339 (steady-гейт) в базе bb49e026: гейт-цикл hit-ветки buildFrame
  НЕ тронут; RM-4/RM-8 (частичная загрузка — полный legacy-кадр)
  проходят 0-diff.
- 000341 (tileCache cap) не пересекается (map.js 0-diff).
- SCOPE: src/main.js (одна область + зеркала-поля), новый тест, память,
  tasks pending→done + result. Вне: spec/, index.html, save.js, ассеты,
  src/map.js, CHANGELOG (визуал бит-в-бит).

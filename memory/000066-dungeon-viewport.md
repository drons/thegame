# 000066: вьюпорт/камера/зум подземелья — тот же движок, что мир
  (подзадача 000032, направление 1)

Статус: выполнено (перенесено в tasks/done, отчёт —
tasks/result/000066.md).

## Что добавлено/изменено в коде

* **src/dungeon-ui.js** — рендер-слой подземелья: полноэкранный
  вьюпорт с мировой математикой. Ключевое:
  * **canvas** — window.innerWidth/innerHeight, прямой ребёнок оверлея
    (CSS absolute inset 0), ресайз в rAF-цикле (паттерн main.js).
  * **ОДИН общий zoom** (px/клетку = px/тайл мира): стартовый — из
    opts (main.js передаёт свою переменную zoom); колесо — слушатель
    НА ОВЕРЛЕЕ `{ passive: false }` (мировой слушатель на #game накрыт
    полноэкранным оверлеем; #game — sibling, bubbling не идёт),
    ×1.2/÷1.2, клампы G.ZOOM_MIN..G.ZOOM_MAX, `onZoom(новый)` →
    main.js пишет в общую переменную. hudUpdate «Масштаб: Xpx»
    корректен без изменений.
  * **камера** cam {x, y} — КЛЕТКИ (дробные): снап к (pos+0.5, pos+0.5)
    при start; сглаживание G.cameraStep(dt, G.CAM_TAU_MS) в rAF-цикле
    (dt первого кадра = 0). **Конечная сетка (НОВОЕ, мир бесконечен)**:
    clampCam — при extent·zoom > view — кламп к [view/2/zoom,
    extent − view/2/zoom]; при extent·zoom <= view (вьюпорт покрывает
    подземелье, диапазон пуст) — жёсткое центрирование extent/2.
    Кламп — каждый кадр ПОСЛЕ сглаживания (зум меняет диапазон,
    сглаживание тянет за пределы).
  * **рендер**: непрозрачный фон #0a0d12 (мир позади оверлея больше не
    проступает); только G.visibleTileRange ∩ границы подземелья;
    пол — G.dungeonFloorFrame (000069) через DI spriteLoader (opts),
    гарды → fill #182029; стены — d.wallObjs + G.DUNGEON_WALL_FRAMES
    (000070), слой ПОД мобами/игроком/сундуками, гарды → без
    drawImage; выход/вход/сундуки/мобы/игрок — прежний визуал, мировая
    проекция G.worldToScreen и размер = zoom.
  * **хук state.pos(now)** (задел 000068): ромб игрока И цель камеры —
    одна точка; фолбэк (s.x, s.y).
  * **rAF-цикл** — паттерн combat-ui.js (nowMs/raf/caf с
    typeof-гардами; vm-песочница без rAF/performance — null,
    событийный синхронный рендер, как в 000043); close() — caf ДО
    overlay.remove().
  * **UMD-ловушка (000038)**: ВСЕ функции движка (cameraStep,
    CAM_TAU_MS, worldToScreen, visibleTileRange, ZOOM_MIN/MAX,
    dungeonFloorFrame, DUNGEON_WALL_FRAMES) читаются из живого
    globalThis.Game в момент вызова (liveGame()) — в index.html
    motion.js и sprites.js грузятся ПОСЛЕ dungeon-ui.js.
* **src/main.js** — оба входа (maybeEnterDungeon + отладочный):
  `dungeonUI.start({ get state, onMove, zoom, onZoom: (z) => { zoom =
  z; }, spriteLoader })` — ОДНА общая переменная zoom, дублирования
  нет.
* **index.html** — CSS .dungeon-overlay: display block, фон #0a0d12
  (НЕПРОЗРАЧНЫЙ — решение по полупрозрачности: фон, а не скрытие
  мира), overflow hidden (auto убран — камера заменяет прокрутку),
  canvas absolute inset 0 100%×100% border/radius none; .combat-side —
  плавающая absolute top/right 16px, rgba(16,18,24,0.85). CSS боя и
  NPC-оверлей не тронуты.
* **tests/dungeon-ui.test.js** — 9 → 24 тестов (+15, красные до кода).
  Песочница: window.innerWidth/innerHeight (меняемые = ресайз),
  rAF/cAF-стабы (кадр — только явный вызов), performance.now
  (опционально, ПО УМОЛЧАНИЮ отсутствуют), addEventListener `[fn,
  opts]`, drawCalls += fillStyle; цепочка — motion.js ПОСЛЕ
  dungeon-ui.js (зеркало index.html).

## Ключевые решения

1. **«Тот же движок» = чистые API + формулы, НЕ рефакторинг**:
   переиспользованы visibleTileRange/cameraStep/CAM_TAU_MS/ZOOM_*/
   worldToScreen (map.js/motion.js); drawSprites/buildFrame из
   main.js НЕ выносились (000039 правит их — ограничение ТЗ).
   У подземелья НЕТ
   WebGL-слоя — весь визуал SVG на 2D-canvas.
2. **Один zoom на мир+подземелье**: onZoom-колбэк пишет в переменную
   main.js; колесо — только на оверлее (один обработчик, не два).
3. **Конечная сетка**: clampCam + центрирование при пустом диапазоне
   (35 клеток × 4 px = 140 px при ZOOM_MIN на широком экране —
   подземелье центрируется, снаружи тёмный фон).
4. **spriteLoader — DI через opts**: dungeon-ui.js standalone,
   vm-песочница без спрайтов → фолбэки #182029/тёмный фон (гарды
   закреплены тестами).

## Контракты для следующих задач

* **000067 (спрайты мобов/выхода)**: рендер в rAF-цикле уже есть;
  заменить fillRect/текст на drawImage в том же порядке слоёв
  (пол → стены → выход/вход → сундуки → мобы → игрок).
* **000068 (глейд)**: дать ds.pos = (now) => mover.renderPos(now) —
  ромб игрока и цель камеры УЖЕ следуют за state.pos(now); rAF-цикл
  уже есть (задел заложен).
* **000052 (города)**: ПОСЛЕ 000066 — движок «внутренних» локаций
  строится поверх этого вьюпорта (рендерер принимает opts/state:
  размеры, визуал клетки, сущности, колбэки; семантика — в клейке
  main.js).

## Подводные камни

* **UMD-ловушка**: load-time-guard на cameraStep/CAM_TAU_MS ломает и
  браузер, и тесты (motion.js после dungeon-ui.js) — только чтение в
  момент вызова.
* **Регрессии 000043**: start() без zoom и без rAF (тесты) —
  фолбэки G.ZOOM_START / синхронный рендер / typeof-гарды не
  удалять.
* **keydown НЕ менять** (000043: e.code-приоритет, e.key-фолбэк,
  бой выше по стеку) — регрессии зафиксированы в тех же тестах.
* **Мерж**: после базы b9f1ed2 на master смержились 000120 и задачи
  000121/000122/000123 — ре-база на актуальный мастер + npm test
  обязательны (файлы этой задачи: dungeon-ui.js/main.js/index.html
  CSS/tests/dungeon-ui.test.js; у 000120 — assets/mobs, MOBS.md,
  SPEC.md — пересечений нет, но проверить по git).

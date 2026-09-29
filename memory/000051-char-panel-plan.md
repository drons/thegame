# 000051: редизайн панели персонажа — план и ключевые решения

Статус: выполнена как проработка + разбивка на 6 дочерних
(000096–000101, pending). Отчёт — tasks/result/000051.md.
Код не изменялся (тесты 567 → 567, см. отчёт).

## Номера (сверено по актуальному master ed88a9e)

* 000088–000090 — НЕ взяты: объявленный резерв 000065 «Найм
  спутников» (резерв 000078–000090; 000078–000087 заняты
  подзадачами 000065 — memory/000065-companions-plan.md).
* 000091–000095 — заняты на master (подзадачи 000064).
* Дочерние 000051: **000096–000101** (правило —
  task-numbering-conflicts.md: от следующего свободного на
  master, не заявленные другими известными ветками; все
  worktree-ветки сверены — 000096+ никто не заявляет).

## Ключевые факты кода (baseline, коммит master ed88a9e)

* Панель (src/ui.js, 916 строк): buildPanel (22-127) — одна
  колонка: .cp-title с ЗАХАРКОДОВАННЫМ «Флогистон» (26 → в
  редизайне c.name), .cp-stats, таблицы навыков (строки <tr>
  .cp-name/.cp-level/.cp-req/.cp-btn[data-skill]), секции
  «Снаряжение»/«Быстрые слоты (бой)»/«Инвентарь»/«Торговля»
  (._equipBody/._quickBody/._invBody/._shopSec/._shopBody),
  .cp-notice; ОДИН делегированный click (102-124): data-act →
  doItemAction, иначе raiseSkill + вспышка причины в .cp-req
  на 1.5 с (паттерн 000041 — НЕ ломать).
* render() (278-327) обновляет строки обходом дерева;
  renderItems (183) — секции предметов/торговли.
* G.playerUI (337-356): setCharacter/setShop/toggle/render/
  isOpen — НЕТ передачи questBook (журнал живёт в main.js:205,
  serialize 290 / deserialize 413) — нужен сеттер setQuests.
* npcUI (IIFE, ui.js ~360-720): рендер квестов renderQuestsTab
  (481) — НЕ экспортирован; bring_item перед отрисовкой —
  G.refreshBringItems (489, mutates book, идемпотентно);
  accept/turnIn (605/612) — в npcUI ОСТАЮТСЯ (панель —
  read-only).
* CSS .char-panel (index.html:44-57): fixed right:12 top:12,
  width:380, max-height calc(100vh-24px), z-10.
* .fs-btn (CSS index.html:85-98; DOM main.js:27-40; ядро
  fullscreen.js, задача 000017): fixed right:12 bottom:12,
  z-15, 13px/1.4, padding 6/10, border 1 → высота ≈33px;
  подписи «⛶ полный экран» (≈130px) / «⛶ выйти из полного
  экрана» (25 симв. ≈217px); кнопки НЕТ при
  fullscreen.supported === false.
* Настройки: global-settings.js (ПЕРВЫЙ скрипт) — 8 ключей
  (steps_per_day=40, respawn_days=3, dungeon_memory_days=3,
  level_delta_max=3, points_per_level=2, move_interval_ms=420,
  combat_difficulty='medium', combat_difficulties={easy/
  medium/hard:{hp,damage}}); экспорт {SETTINGS} — живой объект;
  DEFAULTS/META НЕТ. Первый тест global-settings.test.js
  deepEqual-ом фиксирует ровно 8 ключей.
* Снапшоты при загрузке (задача 000099 переведёт в live-чтение
  в телах функций, экспорт-снапшоты СОХРАНИТЬ): day.js
  STEPS_PER_DAY/RESPAWN_DAYS (23/24, addStep while-цикл 54),
  player.js POINTS_PER_LEVEL (51, addXp 317), dungeon.js
  DUNGEON_MEMORY_DAYS/LEVEL_DELTA_MAX (82/83, mobLevel 236,
  contentValid 292), main.js MOVE_INTERVAL_MS (63-65, guard +
  fallback 140; stepIntervalMs 74-76 — каждый кадр).
* motion.js: MIN_MOVE_INTERVAL_MS=60 (134), clamp
  min(max(60,raw), base) (147-153) — не трогать. combat.js —
  SETTINGS читает динамически — не трогать.
* Данные для тултипов УЖЕ ЕСТЬ: skills-data.js (основные:
  desc/combat/world; вторичные: desc/effect/effectType/names[]
  — 6 титулов), items-data.js (у ВСЕХ 42 предметов desc
  обязателен схемой; weight/value/stats/effect) — assets/ и
  схемы не трогать.
* KeyI (main.js:527) — панель, в т.ч. в бою (коммент 541);
  setShop — main.js:1010.
* DOM-стаб tests/ui-skills.test.js: селекторы «.класс»/тег,
  closest через parent, style plain-объект; НЕТ classList,
  value/событий input; тест вызывает panel.listeners.click[0].
  tests/main-visuals.test.js: ВЕСЬ index.html-цепочка в
  «снисходительном» Proxy-DOM, errors.length === 0.

## Решения (дублируют отчёт — коротко)

* ВЕРСТКА (000096, P0): .char-panel fixed top/left/right:12px,
  bottom:56px, z-10, на весь экран; 2× .cp-column; у каждого
  СВОЙ ряд ШИРОКИХ .cp-tab + скроллящийся .cp-tabpane. Левый:
  «Персонаж» (c.name!)/«Инвентарь»/«Игровые настройки»;
  правый: «Снаряжение» (одетые + быстрые слоты)/«Магазин»/
  «Квесты». Вкладки data-driven: массивы { id, label,
  build(pane) } (лево/право отдельные) — ТОЧКА РАСШИРЕНИЯ для
  000086 «Отряд» (строго ПОСЛЕ мержа всех 000051): новая
  вкладка = запись массива + pane, без переделки. Переключение
  — style.display (стаб не знает classList).
* ГЕОМЕТРИЯ ПОД fs-btn: bottom:56px — нижняя кромка панели
  выше кнопочного прямоугольника (bottom 12..45px) для ДЛИННОЙ
  подписи; терпимость к отсутствию кнопки; структурный тест
  bottom ≥ 56px.
* DOM-КОНТРАКТ (000096): один делегированный click;
  .cp-btn[data-skill] в <tr>; .cp-name/.cp-level/.cp-req;
  data-act; .cp-tab — отдельный класс (не .cp-btn);
  tests/ui-skills.test.js — БЕЗ ИЗМЕНЕНИЙ.
* НАСТРОЙКИ (000098): META (из Object.keys(SETTINGS) + таблица
  метаданных; новый ключ → generic-запись, deepEqual-тест 8
  ключей ломается осознанно) + DEFAULTS (frozen JSON-клон);
  форма ОДИН buildPanel (render() не трогает — focus живёт);
  apply по change; кламп: steps_per_day int ≥ 1 (0 → while-
  бесконечность addStep — ЗАВИСАНИЕ), move_interval_ms int ≥
  60 (ниже — «Ловкий шаг» умирает, memory/000063), int-дни/
  уровни ≥ 1, float-множители > 0, enum сложности;
  combat_difficulties.*.{hp,damage} — вложенное редактирование
  (НЕ молча отбрасывать); сброс per-ключ + «сбросить всё».
* ПЕРСИСТЕНТНОСТЬ — РЕШЕНИЕ: настройки ТОЛЬКО НА СЕССИЮ (в сейв
  НЕ пишутся; перезагрузка → DEFAULTS). Персистентность —
  кандидат в отдельную задачу (data.settings, санитайзер
  000029/000045, round-trip save.test.js; versioning save.js —
  000031).
* LIVE-ПРИМЕНЕНИЕ (000099): чтение SETTINGS в момент вызова в
  телах day/player/dungeon/main; снапшот-экспорты и «единый
  источник»-тесты (re-require) — без изменений (зелёные в
  любом варианте — runtime-применение они НЕ вынуждают, нужен
  новый красный: мутация БЕЗ re-require); opts > SETTINGS >
  снапшот (паттерн 000020); guard мусора → DEFAULTS;
  main.js — литерал 'move_interval_ms' остаться (тест
  global-settings ~175-178), fallback 140 — только без
  global-settings.js.
* КВЕСТЫ (000100): setQuests({npcs, book, day}); общий
  рендерер активных строк — ЭКСТРАКЦИЯ из IIFE npcUI (без
  дублей; кнопка «сдать» — параметр рендерера); read-only
  (взять/сдать — диалог NPC); refreshBringItems перед
  отрисовкой; saveNow из панели — НЕТ.
* МАГАЗИН (000101): перенос во вкладку; setShop API и
  main.js:1010 — без изменений; placeholder без магазина.
* ПОВЕДЕНИЕ: [I] + [Esc]; закрытие при старте боя; .cp-title =
  c.name; панель накрывает touch-контролы z-5 — допустимо
  (модалка).
* ТУЛТИПЫ (000097): .cp-tip чистый CSS hover (+focus-within);
  skills: desc/combat/world (+effect/names для вторичных);
  items: desc/stats/effect/weight/value; touch — полное
  описание вторым тапом в .cp-notice (компактная мета —
  постоянная).
* ТЕСТЫ: красные ПЕРВЫМИ; DOM-стаб — ЛОКАЛЬНО в
  tests/ui-panel.test.js (input.value/type, select+option,
  'change', document.addEventListener) — дублирование стабов
  принято; main-visuals — errors.length === 0 (новый top-level
  терпит null/нет localStorage, паттерн bottomInset()).

## Риски мержа

* index.html — правки ТОЛЬКО <style> (000046 владеет
  <script>-списком — разные hunks).
* src/ui.js — параллельно правит 000083 (сам предупреждает
  «Конфликтует с 000051 — мержить с разнесением/ребейзом»);
  hunk 000041 (строки навыков) уже в master.
* src/main.js — параллельно 000042/000085/000087.
* Перед merge каждой подзадачи: ребейз на актуальный master +
  полный npm test (база 567).
* 000086 «Отряд» — исполнять строго ПОСЛЕ мержа ВСЕХ подзадач
  000051 (у неё это прописано).

# Спрайт Эфира — контракты ассетов и рендера (000114 / 000034 / 000084)

Сжатый контракт: где лежат кадры Эфира, как они выбираются и
рисуются в бою, чего трогать нельзя. Полный контекст —
memory/000114-efir-combat-render.md, memory/000034-hero-redesign.md,
memory/000084-ally-render.md.

## 1. EFIR_FRAMES / efirFrames (src/sprites.js, доставлено 000034)

* `EFIR_FRAMES` (sprites.js:101–118) — таблица-литерал, паттерн
  PHLOGISTON_ACTIONS: `{idle, walk, attack, cast}` × 2 кадра, пути
  `assets/sprites/efir/<действие>_n.svg`. ИМЕНА экспортов —
  контракт задачи 000114 (комментарий sprites.js:95–100).
* `efirFrames(action)` (sprites.js:555–557) — `EFIR_FRAMES[action]
  || []`: чистая функция, неизвестное действие → [] без ошибок,
  диск НЕ читает. «Каталога нет» проявляется на уровне лоадера
  (loadFn → null → image() → null → фолбэк), а не в таблице.
* `allAssetPaths()` — sprites.js:667–668: свой push-блок
  «Эфир (задача 000034)» (все 8 кадров), дедуп — общий Set.
* Экспорты: EFIR_FRAMES (sprites.js:809), efirFrames (830).

## 2. kind 'efir' в обходе отрисовки союзников (000084)

* `allyFrames(u, now, action)` (src/combat-ui.js:528–536):
  `u.kind === 'efir'` → `G.efirFrames(action)` (typeof-гард —
  UMD-ловушка: без sprites.js → [] → фолбэк, 0 падений); иначе →
  `G.MOB_FRAMES[ALLY_MERC_KIND]` ('orc' — архетип ВСЕХ ролей
  наёмника). Кадр — `G.frameIndex(now, u.x, u.y, n)` (детерминизм);
  v1 `action = 'idle'` всегда, `c._unitFx` в ally-ветке НЕ
  читается (контракт 000084; per-action — будущая точка
  расширения).
* Ветвь `item.kind === 'ally'` (combat-ui.js:538–588): подложка
  «свой» → спрайт 32×32 (px+8, py+8) или фолбэк
  ROLE_COLORS[u.role] → HP-бар (трек '#3a0d0d' + fill
  G.hpBarColor(frac)) → уровень → рамка «свой» → кольцо хода
  (только ходящий).
* Проводка: `G.createCombat({ allies: [efirAllyData(state)] })` —
  src/efir.js:179–199 (id 'efir', kind строго 'efir', role
  'support', size 1×1); startCombat — combat-ui.js:919–942
  (деградация без G.efir — console.error + бой без Эфира).
* Плейсхолдера-героя в коде НЕТ (000034 смержена до 000084 —
  ТЗ-строка «спрайт героя до 000034» устарела, memory/000081-
  efir.md §12).

## 3. Маркер «свой» (паттерн 000084)

* Подложка `ALLY_MARKER_UNDERLAY = 'rgba(140, 242, 252, 0.25)'` —
  fillRect(px+2, py+2, pw−4, ph−4), рисуется ПЕРВАЯ (под всеми
  слоями юнита).
* Рамка `ALLY_MARKER = '#8cf2fc'` — strokeRect(px+4.5, py+4.5,
  pw−9, ph−9), lineWidth 2, ПОВЕРХ спрайта, ВСЕГДА.
* Константы — combat-ui.js:52–54 (рядом с ROLE_COLORS). Цвета —
  существующая палитра «стороны игрока» (паттерн 000038: «новых
  цветов не вводим»). Геометрия/цвета пинины тестами 000084
  (styleCalls + golden).

## 4. Ассеты — НЕ ПЕРЕРИСОВЫВАТЬ (блок 000034, SPEC «Дух Эфира»)

* Каталог `assets/sprites/efir/` (8 SVG) — byte-идентичный
  перенос прежнего дух-арта Флогистона (000034, git mv):
  палитра духа #b7f0fb/#52c4e8 пинится тестом «Эфир = прежний
  дух» (tests/sprites.test.js:1651). Улучшать/перерисовывать
  кадры ЗАПРЕЩЕНО (бюджет 1×1 — 13–20 деталей, ниже порога 30 —
  сознательное решение 000034).
* `assets/sprites/phlogiston/` — герой-человек (перерисовка
  000034 по assets/logo.svg); пути PHLOGISTON_ACTIONS
  инвариантны. КАТАЛОГИ НЕ ТРОГАТЬ из подзадач 000035: «подзадачи
  000035 ассеты не перерисовывают» (SPEC «Дух Эфира» → «Данные и
  ассеты»).
* Новые SVG в 000114 НЕ вводились: счёт tests/svg.test.js
  инвариантен — 'sprites/efir': 8, 'sprites/phlogiston': 8, всего
  297 (таблица EXPECTED_SVG_BY_DIR, L439–456).

## 5. Тесты (карта)

* Существующие (000034/000084, зелёные): tests/sprites.test.js
  1569 (8 кадров/диск/[]), 1590 (каталог ровно 8), 1603
  (allAssetPaths), 1651 (дух-палитра), 2056 (выбор не зависит от
  загрузки); tests/combat-ui.test.js 1380 (efirFrames на клетке,
  кадр детерминирован), 1436 (маркер), 1463 (кольцо), 1490
  (наёмник), 1520 (golden), 1626 (деградация).
* Новые в 000114 (защитные, предудовлетворены — RED no-op):
  114-SP-1 (tests/sprites.test.js, конец файла): каталога нет →
  лоадер деградирует штатно (readyCount 0, image() null, таблица
  статична, allAssetPaths без исключений). 114-CU-1 (tests/
  combat-ui.test.js, конец файла): кадр efirFrames на клетке
  Эфира + негативный пин (phlogiston-кадры на клетке Эфира
  отсутствуют — они только в hero-ветке) + маркер «свой».

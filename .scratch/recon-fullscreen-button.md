# Отчёт: материал для ТЗ «кнопка полноэкранного режима в подземельях и городах»

## 1. Кнопка полноэкранного режима

- **Создание (один раз при загрузке, вне экранов):** `/home/sas/Documents/Art/thegame/src/main.js:28-46`
  ```js
  if (G.createFullscreenController) {
    const fullscreen = G.createFullscreenController(document);
    if (fullscreen.supported) {
      const fsBtn = document.createElement('button');
      fsBtn.className = 'fs-btn';
      // подпись: '⛶ выйти из полного экрана' / '⛶ полный экран'
      fullscreen.onChange(fsLabel);
      fsBtn.addEventListener('click', () => fullscreen.toggle());
      document.body.appendChild(fsBtn);   // main.js:44
    }
  }
  ```
  Иконка — текстовый глиф `⛶` в textContent (main.js:37-39), **изображение-ассет нет**.
- **Ядро:** `/home/sas/Documents/Art/thegame/src/fullscreen.js` — `createFullscreenController(doc)` (L35): детект стандартного + webkit/moz/ms-вариантов Fullscreen API (L16-26), `toggle()/enter()/exit()` глотают отклонения, `onChange(fn)` на `*fullscreenchange`, `isFullscreen` перечитывает документ. `requestFullscreen` вызывается в `doc.documentElement[variant.request]` (ядро, а не main.js).
- **CSS:** `/home/sas/Documents/Art/thegame/index.html:176-189`
  ```css
  .fs-btn { position: fixed; right: 12px; bottom: 12px; z-index: 15; ... }
  .fs-btn:hover { background: rgba(0, 0, 0, 0.65); }
  ```
  Комментарий index.html:174-175: «правый нижний угол, под оверлеями боя/подземелья (z-index 20)».
- Загрузка модуля: index.html:1292 `<script src="src/fullscreen.js"></script>`.

## 2. Механизм невидимости в городах и подземельях — перекрытие z-index (НЕ display:none, НЕ «не создаётся»)

Кнопка **создаётся один раз и живёт в DOM на всех экранах**; её перекрывает полноэкранный оверлей локации:

- Экраны города И подземелья — один и тот же оверлей: `src/dungeon-ui.js:397-442` `build()`:
  ```js
  overlay = document.createElement('div');
  overlay.className = 'combat-overlay dungeon-overlay';  // dungeon-ui.js:399
  ...
  document.body.appendChild(overlay);                     // dungeon-ui.js:439
  ```
- CSS оверлея: `.combat-overlay { position: fixed; inset: 0; ... z-index: 20; }` (index.html:243-251) + `.dungeon-overlay { display: block; background: #0a0d12; overflow: hidden; }` с canvas `absolute inset 0` на весь экран (index.html:659-671). Фон **непрозрачный** → мир и всё под z-20 не просматривается.
- `.fs-btn` z-index **15** < оверлей **20** → кнопка целиком под оверлеем: невидима И некликабельна (div оверлея перехватывает pointer-events на всю область).
- **Z-лестница** (комментарии index.html:196-199, 836-838; memory/000212):
  `.char-panel 10 < .fs-btn 15 < .combat-overlay/.dungeon-overlay/.resurrect-overlay 20 < (динамический inline 25) < #touch-controls 30 < .spellbook-oc 35 < .start-window 40`
- Прецедент того же бага для `#hud` и его решение **только для подземелья**: `src/main.js:3739-3749` (000212), frame-driven, идемпотентно:
  ```js
  const hudOver = inDungeon && dungeonState.kind === 'dungeon'
    && !inCombat && !inNpc && !inBuilding && !inCraft && !inResurrect;
  if (hud && hud.style) {
    const z = hudOver ? '25' : '';
    if (hud.style.zIndex !== z) hud.style.zIndex = z;
  }
  ```
  Комментарий main.js:3742: **«Город — вне скоупа»**. Т.е. в городе и `#hud` (z-auto), и `.fs-btn` (15) лежат под оверлеем; в подземелье `#hud` поднят до 25, а `.fs-btn` — нет.
- Подтверждение механизма: `/home/sas/Documents/Art/thegame/memory/000212-dungeon-hud-window.md` — «`#hud` (z-auto) целиком под оверлеем… окно живо, только скрыто».
- display:none/медиазапросы для `.fs-btn` отсутствуют — единственные правила: index.html:176, 189 (plus комментарии 45, 198, 790, 837).
- Замечание: кнопка скрыта и в бою (oверлей боя z-20) — это осознанное решение 000017 (memory/000017-fullscreen-button.md: «z-index 15 … ниже оверлеев боя/подземелья (20) — не мешает в бою»).

## 3. Экраны игры: переключение и HUD

- **Нет `G.screen`.** Состояние — `let dungeonState = null` (src/main.js:1551), форма `{ dg, contents, kind: 'dungeon'|'city', name (город), x, y, ... }` (комментарий main.js:1548). Мир — `dungeonState === null`.
- **Вход:** после шага мира `enterLocation()` main.js:2581-2609 → `L.maybeEnterDungeon(ctx) || L.maybeEnterCity(ctx)` (main.js:2595). Домен — `src/locations.js`: `kind: 'dungeon'` (locations.js:120), `kind: 'city'` (locations.js:150), `maybeEnterDungeon` (locations.js:172), `maybeEnterCity` (locations.js:~277), экспорт locations.js:829.
- **UI локации:** `startLocationUI()` main.js:2761-2794 → `G.dungeonUI.start({...})` (main.js:2762). Выход: `exitLocation()` main.js:2803-2820 → `dungeonState = null; G.dungeonUI.close(); saveNow()`.
- **Пер-кадр флаги экранов:** main.js:3695-3700 — `inCombat / inDungeon (dungeonState !== null) / inNpc / inBuilding / inCraft / inResurrect`.
- **HUD:** единый элемент `<div id="hud">` (index.html:1065), CSS index.html:32-43 (`fixed; left:12px; top:12px; pointer-events:none;` **без z-index** → auto). Рисуется **единым блоком на каждый кадр для всех экранов**: `renderHud()` main.js:3644-3669 → `G.hud.update(ctx)` → строки `buildLine()` src/hud.js:202-300. Различие экранов — в строках:
  - 1-я строка: мир-координаты «x, y» vs ИМЯ подземелья — hud.js:223-227;
  - город: рамка `\n--- <имя> (x, y) ---\n<статус>` — `locationLine` hud.js:167-174;
  - подземелье: только `\n<статус>` («Глубина: N», «До выхода: ~N клеток») — hud.js:175-179 (000212).
  - Кнопок в HUD нет (только текст, pointer-events:none); экранные кнопки — `#touch-controls` и панели (см. п.4).
- Подъём `#hud` в подземелье — main.js:3739-3749 (см. п.2).

## 4. Оверлеи города/подземелья: что перекрывает углы, паттерны кнопок

- **Один общий оверлей** для обоих экранов: `.combat-overlay.dungeon-overlay` (dungeon-ui.js:398-399), непрозрачный фон, canvas на весь экран.
- **Город (`kind === 'city'`):** боковая панель `.combat-side` создаётся **только для города** (dungeon-ui.js:410-438; 000229 убрал её для подземелья). CSS index.html:672-678: `position: absolute; top: 16px; right: 16px; width: 270px; background: rgba(16, 18, 24, 0.85)` — **правый ВЕРХНИЙ** угол. Состав: `stateEl` (имя города + статус, dungeon-ui.js:941-948), `logEl` (последние 8 строк лога, dungeon-ui.js:957), `hint` — статичный текст dungeon-ui.js:430: `'Стрелки/WASD — шаг.\nДверь — вход и выход: встаньте на неё и нажмите [E].\n[E] — постройки.'` (+ контекстная строка «Залежь — [E]», dungeon-ui.js:953-956).
- **Подземелье (`kind === 'dungeon'`):** панель **вообще не создаётся** (000229; dungeon-ui.js:410-413, 934-940) — в оверлее только canvas; инфо — в `#hud` (поднят до z-25, п.2).
- **Вывод по углу:** правый НИЖНИЙ угол (позиция `.fs-btn`: right:12px, bottom:12px) в городе и подземелье не занят ни одной панелью — перекрывает его только сам div оверлея (z-20).
- **Паттерны существующих кнопок в оверлеях/панелях:**
  - `.cp-close` — кнопка «закрыть [I]/[Esc]» в панели персонажа: src/ui.js:120-122 (`el('button', 'cp-close', 'закрыть [I]/[Esc]')`), CSS index.html:90 (`align-self: flex-end`), стили index.html:118-123 (`.cp-btn`);
  - NPC-панель: close-кнопка в заголовке, у правого края: src/ui.js:1310-1313 (`closeBtn.dataset.npcact = 'close'`; CSS `.npc-panel .cp-title` — `justify-content: space-between`, index.html:713-719);
  - боевой оверлей закрывается клавишами Esc/Space/Enter (src/combat-ui.js:11).
- **Паттерн «подъёма над оверлеем» (прямой прецедент для решения):** динамический inline `z-index: '25'` (общий динамический слот 000206), frame-driven идемпотентно в `frame()`: `G.playerUI.applyLayer(...)` main.js:3720-3729, `G.squadUI.applyLayer` main.js:3730-3738, `hud.style.zIndex` main.js:3739-3749.
- **Соседство в правом нижнем углу (тач):** `#touch-controls` z-30 (index.html:200-206); кнопки [E]/[I] раскладываются в правом нижнем углу: `src/controls.js:215-250` `layoutTouchControls` — `action = { x: w - M - B, y: h - M - inset - B }`, `M=16`, `B` 56-96px (controls.js:235-249) — **перекрытие с зоной `.fs-btn` на тач-устройствах** (кнопки видны в бою/инвентаре/входе — `applyVisibility` src/ui.js:1946-1963, вызов main.js:3708-3719). D-pad — левый нижний (controls.js:233).

## 5. Тесты

- **Fullscreens-ядро:** `/home/sas/Documents/Art/thegame/tests/fullscreen.test.js` — 8 тестов с мок-документом (4 варианта API, no-op без API, toggle, подписчики, внешний fullscreenchange, webkit-фолбэк, отклонённый request, синхронный DOMException, destroy).
- **Пин z-лестницы (статичный, по CSS index.html):** `tests/city-inventory-e2e.test.js:1116-1136` — «000206 CI-13: `.char-panel` 10 < `.fs-btn` 15 < `.combat-overlay` 20 < 25 (подъём, inline) < `#touch-controls` 30»; парсит z-index из CSS-правил.
- **Пин .fs-btn:** `tests/ui-panel.test.js:485-509` — z-index `.fs-btn` = 15, `.char-panel` bottom ≥ 56px (нижняя кромка панели выше кромки кнопки); tests/ui-panel.test.js:30-31, 671 — комментарии про .fs-btn.
- **Песочницы fullchain (vm):** кнопка в тестовой DOM **не создаётся** — `documentElement/requestFullscreen` не заданы → `fullscreen.supported = false` (комментарии: tests/main-visuals.test.js:197-198, tests/aggro-visibility.test.js:410-411, tests/city-screen.test.js:210, tests/dungeon-vision.test.js:747, tests/mob-aggro-circle.test.js:221, tests/npc-layout.test.js).
- **Пины HUD:** `tests/hud.js.test.js` (17 тестов; HU4 — побайтовый снимок всей строки HUD, включая городскую/подземную ветки, HU5 — fullchain, форматная топ-строка); `tests/dungeon-info-window.test.js` (000212 DH-1…DH-8: DH-1 `#hud` zIndex «25» в подземелье; DH-6 — в бою подъём снят; DH-7(б) lines 814-815 — «город: подъёма НЕТ (zIndex falsy)»); `tests/dungeon-side-panel.test.js:689-720` (000229 RW-2: оверлей = только canvas, `#hud` zIndex «25»); `tests/city-screen.test.js` (C1-C5, городские строки HUD).
- **Важно для ТЗ:** пина «`.fs-btn` видима в городе/подземелье» **нет** — текущее поведение (кнопка под оверлеем) зафиксировано лишь косвенно (CI-13, ui-panel). Пин «город: подъёма нет» (DH-7б) относится к `#hud`, а не к `.fs-btn`.

## 6. SPEC

- **Упоминаний fullscreen/«полный экран» в `SPEC.md` и `spec/*.md` НЕТ** (grep по `fullscreen`/`Fullscreen` — пусто; единственное совпадение по «полно-» — spec/craft.md:130 «полноэкранный экран крафта» — про экран крафта, не про кнопку).
- Контракты живут в `memory/`:
  - `memory/000017-fullscreen-button.md` — решение 000017: ядро fullscreen.js, кнопка `.fs-btn` правый нижний угол, «z-index 15: выше панели персонажа (10), ниже оверлеев боя/подземелья (20) — не мешает в бою», выход по Esc/F11.
  - `memory/000212-dungeon-hud-window.md` — механизм перекрытия `#hud` оверлеем и z-лестница; подъём «25» только для `kind === 'dungeon'`.
  - `memory/000206-inventory-over-city.md`, `memory/000195-combat-inventory-panel.md` — динамический слот z-25 (applyLayer).
  - `memory/000229-dungeon-side-panel-removed.md` — панель города/подземелья (hint/stateEl/logEl) — только город.
  - `memory/000125-npc-fullscreen.md` — «fullscreen» в названии про полноэкранный диалог NPC, не про кнопку.

## Ключевой вывод для ТЗ

Механизм скрытия — единственный и чистый: **z-index**. `.fs-btn` (fixed, right:12/bottom:12, z-15, создаётся один раз в main.js:34-44) лежит под полноэкранным непрозрачным оверлеем `.combat-overlay.dungeon-overlay` (z-20, inset:0), который dungeon-ui.js подвешивает к body при входе в город (`kind:'city'`) и подземелье (`kind:'dungeon'`). Готовый паттерн решения в коде: frame-driven идемпотентный inline-подъём до z-25 (слот 000206), уже применяемый к `#hud` (main.js:3739-3749, но с исключением города), `playerUI` (main.js:3720-3729) и `squadUI` (main.js:3730-3738). Правый нижний угол в обоих экранах свободен от панелей; на тач-устройствах там же (z-30) живут кнопки [E]/[I] `#touch-controls` — потенциальное перекрытие, учтённое в layout controls.js:215-250. Пинов «кнопка видима в городе/подземелье» в tests/ нет; CSS-лестница зафиксирована в city-inventory-e2e.test.js:1116-1136 и ui-panel.test.js:485-509.
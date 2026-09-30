// Подземелье (HTML-оверлей): карта лабиринта, состояние, журнал.
// Браузерный модуль (ядро — src/dungeon.js, тестируется в node).
//
// Управление: стрелки / WASD / ЦФЫВ — шаг. Выход — клетка «X».
// Маппинг клавиш — единый, из src/controls.js (задачи 000028/000043):
// e.code (физическая клавиша: стрелки, WASD — на русской раскладке это
// и есть ЦФЫВ) с фолбэком по e.key (ц/ф/ы/в, без учёта регистра) для
// виртуальных клавиатур (code «Unidentified») — те же связки, что мир
// (tryMove в main.js). Логика (мобы, сундуки, выход) живёт в main.js;
// оверлей — только отрисовка и передача клавиш в onMove.
//
// Вьюпорт (задача 000066): тот же движок, что глобальная карта —
// canvas на весь вьюпорт, ОДИН общий zoom (px/клетку = px/тайл мира),
// cam в клетках (дробная) с тем же G.cameraStep/CAM_TAU_MS (motion.js),
// рендер только G.visibleTileRange (map.js), проекция G.worldToScreen
// (map.js, 000061). НОВОЕ для конечной сетки (мир бесконечен): кламп
// камеры к границам подземелья / центрирование, когда вьюпорт больше
// подземелья. У подземелья НЕТ WebGL-слоя (весь визуал SVG на 2D).
//
// UMD-ловушка (000038): в index.html src/motion.js грузится ПОСЛЕ
// dungeon-ui.js — cameraStep/CAM_TAU_MS появляются на объекте Game
// только после; экспорты sprites.js (dungeonFloorFrame,
// DUNGEON_WALL_FRAMES) — тоже. ВСЕ функции движка читаются из живого
// globalThis.Game в момент вызова (liveGame), не из снапшота при
// загрузке — load-time-guard на них сломал бы и браузер, и тесты.
//
// Хук state.pos(now) (задел 000068): позиция игрока в момент кадра —
// функция (000068 даст ds.pos = (now) => ds.mover.renderPos(now)),
// фолбэк (s.x, s.y). Та же точка — и для спрайта/ромба игрока, и для
// цели камеры.
//
// Спрайты (задача 000067): игрок — кадры G.phlogistonFrames(действие
// playerAction; в этой задаче всегда 'idle', 000068 даст 'walk' при
// глейде), zoom*1.15; мобы — ПО КАЖДОМУ mobId группы
// (mobSpriteKind → MOB_FRAMES → кадр Math.floor(G.frameIndex(now,
// ux, uy, frames.length)) — floor ОБЯЗАТЕЛЕН: frameIndex на дробных
// координатах юнита возвращает ДРОБНЫЙ индекс), zoom*1.2, смещения
// юнита по индексу (группа «встает» вокруг своей клетки); сундук —
// G.DUNGEON_CHEST, zoom*0.8, центр клетки (открытый — не рисуется).
// Фолбэки ПЕР-ЮНИТ (паттерн 000047): spriteLoader=null / image null /
// sprites.js не загружен / mobSpriteKind null → прежний
// ромб/красный-фиолетовый квадрат/золотой сундук ИМЕННО для этого
// юнита (legacy-группа без mobIds — полный групповой фолбэк),
// остальные — спрайты. Boss — #b06ad4-прямоугольник bounding box
// юнитов (± половина спрайта 0.6 клетки), рисуется ПЕРЕД спрайтами
// юнитов. Выход «X» и вход остаются текстовыми/цветовыми (решение).

(function () {
  'use strict';
  const G = globalThis.Game;
  if (!G || !G.createDungeon || !G.deltaForEvent) {
    // Видимая ошибка, а не молчание (паттерн ui.js/combat-ui.js):
    // без controls.js (должен грузиться РАНЬШЕ,
    // tests/index-order.test.js) захваченный G не получит
    // Game.deltaForEvent никогда — управление сломается тихо.
    console.error('dungeon-ui.js: не найдены Game.createDungeon или ' +
      'Game.deltaForEvent — проверьте порядок загрузки: src/controls.js ' +
      'и src/dungeon.js ДО src/dungeon-ui.js (задача 000043)');
    return;
  }

  // Живой Game в момент вызова (UMD-ловушка выше): motion.js
  // (cameraStep/CAM_TAU_MS) и sprites.js (dungeonFloorFrame,
  // DUNGEON_WALL_FRAMES) доигрываются ПОСЛЕ нашей загрузки; в vm-песочнице
  // тесты подставляют их на финальный объект.
  function liveGame() {
    return (typeof globalThis !== 'undefined' && globalThis.Game) || G;
  }

  // Детерминированные смещения юнита группы ПО ИНДЕКСУ (задача
  // 000067): группа «встает» вокруг своей клетки.
  const MOB_UNIT_OFF = [[0, 0], [-0.35, 0.15], [0.35, 0.15]];

  // --- Время и кадры (паттерн src/combat-ui.js, задача 000047) ---
  // typeof-гарды обязательны: в vm-песочнице requestAnimationFrame
  // и performance могут не существовать (хостовые глобалы не попадают
  // в контекс) — прямой доступ дал бы ReferenceError.
  const nowMs = () => (typeof performance !== 'undefined' && performance.now)
    ? performance.now() : Date.now();
  const raf = (typeof requestAnimationFrame === 'function')
    ? requestAnimationFrame : null;
  const caf = (typeof cancelAnimationFrame === 'function')
    ? cancelAnimationFrame : null;

  let ctx = null; // { get state, onMove, open, onZoom, spriteLoader }
  let overlay = null, canvas = null, g2 = null, stateEl = null, logEl = null;
  let zoom = G.ZOOM_START; // общий с миром: px/клетку = px/тайл
  let cam = { x: 0.5, y: 0.5 }; // клетки (дробные) — центр камеры
  let lastT = null; // время предыдущего кадра (dt первого кадра = 0)
  let rafId = null;

  function isActive() {
    return !!ctx && ctx.open;
  }

  // state — функция или само состояние (getter из main.js).
  function state() {
    const s = ctx.state;
    return typeof s === 'function' ? s() : s;
  }

  // Размеры вьюпорта (окно); песочница передаёт window-стаб.
  function viewW() {
    return (typeof window !== 'undefined' &&
        Number.isFinite(window.innerWidth) && window.innerWidth > 0)
      ? window.innerWidth : 800;
  }
  function viewH() {
    return (typeof window !== 'undefined' &&
        Number.isFinite(window.innerHeight) && window.innerHeight > 0)
      ? window.innerHeight : 600;
  }

  // Позиция игрока в момент now: хук state.pos(now) (000068 — глейд),
  // фолбэк (s.x, s.y) — целочисленная клетка.
  function playerPos(s, now) {
    if (s && typeof s.pos === 'function') {
      const p = s.pos(now);
      if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) return p;
    }
    return { x: s.x, y: s.y };
  }

  // Действие кадра Флогистона в подземелье (задача 000067): пока
  // ВСЕГДА 'idle'. Единственный call-site для выбора действия:
  // 000068 (глейд) переключит на 'walk' одной правкой здесь.
  function playerAction(s, now) {
    return 'idle';
  }

  // Конечная сетка: камера не выходит за подземелье; если вьюпорт
  // ПОКРЫВАЕТ подземелье (диапазон клампа пуст, min > max) — жёсткое
  // центрирование (иначе cam улетал бы в NaN/наружу).
  function clampCam(camPos, extent, viewPx, z) {
    if (extent * z <= viewPx) return extent / 2;
    const lo = viewPx / 2 / z, hi = extent - viewPx / 2 / z;
    return Math.min(hi, Math.max(lo, camPos));
  }

  window.addEventListener('keydown', (e) => {
    if (!isActive()) return;
    if (G.combatUI && G.combatUI.isActive()) return; // бой выше по стеку
    const d = G.deltaForEvent(e);
    if (!d) return;
    e.preventDefault();
    e.stopPropagation();
    ctx.onMove(d[0], d[1]);
    render();
  });

  // Колесо над оверлеем (мировой слушатель на canvas #game накрыт
  // полноэкранным оверлеем; #game — sibling, не предок, bubbling к нему
  // не идёт). Та же математика, что мир (main.js): ×1.2/÷1.2 и те же
  // клампы ZOOM_MIN/ZOOM_MAX (map.js) — ОДИН общий zoom, наверх —
  // onZoom(новый), чтобы main.js повесил его на свою переменную zoom.
  function onWheel(e) {
    if (!isActive() || !e) return;
    if (e.preventDefault) e.preventDefault();
    if (typeof e.deltaY !== 'number' || e.deltaY === 0) return;
    const live = liveGame();
    const next = zoom * (e.deltaY < 0 ? 1.2 : 1 / 1.2);
    const clamped = Math.max(live.ZOOM_MIN, Math.min(live.ZOOM_MAX, next));
    if (clamped !== zoom) {
      zoom = clamped;
      if (typeof ctx.onZoom === 'function') ctx.onZoom(clamped);
    }
  }

  function build() {
    overlay = document.createElement('div');
    overlay.className = 'combat-overlay dungeon-overlay';

    // Canvas — прямой ребёнок оверлея на весь вьюпорт (CSS: absolute
    // inset 0); размер подгоняется в rAF-цикле (паттерн main.js).
    canvas = document.createElement('canvas');
    canvas.width = viewW();
    canvas.height = viewH();
    overlay.appendChild(canvas);
    g2 = canvas.getContext('2d');

    const side = document.createElement('div');
    side.className = 'combat-side';
    stateEl = document.createElement('div');
    stateEl.className = 'combat-state';
    side.appendChild(stateEl);
    logEl = document.createElement('div');
    logEl.className = 'combat-log';
    side.appendChild(logEl);
    const hint = document.createElement('div');
    hint.className = 'combat-state';
    hint.textContent = 'Стрелки/WASD — шаг.\nЖёлтая клетка «X» — выход.\nСундук и мобы — графические спрайты (красный квадрат — фолбэк-метка).';
    side.appendChild(hint);

    overlay.appendChild(side);
    document.body.appendChild(overlay);
    // { passive: false } — иначе preventDefault не гасит скролл страницы.
    overlay.addEventListener('wheel', onWheel, { passive: false });
  }

  // now — время кадра (rAF-цикл); из событий (keydown) — текущее.
  function render(now) {
    if (!ctx || !ctx.open) return;
    const s = state();
    if (!s || !s.dg) return;
    const d = s.dg, c = s.contents || { chests: [], mobs: [] };
    const w = canvas.width, h = canvas.height;
    const live = liveGame();
    // now — время кадра (rAF-цикл); из событий (keydown) — текущее.
    const nowT = now == null ? nowMs() : now;
    // Та же формула «мир→экран», что мир (map.js, 000061): y растёт вниз.
    const proj = (tx, ty) =>
      live.worldToScreen(tx, ty, cam.x, cam.y, zoom, w, h);

    // Непрозрачный фон «за пределами подземелья» (мир позади оверлея
    // больше не проступает — решение по полупрозрачности).
    g2.fillStyle = '#0a0d12';
    g2.fillRect(0, 0, w, h);

    // Рисуем ТОЛЬКО видимый диапазон (та же математика, что мир —
    // visibleTileRange, map.js), обрезанный по границам подземелья:
    // всю сетку 35×35 на каждый кадр не рисуем.
    const range = live.visibleTileRange(cam.x, cam.y, w, h, zoom);
    const x0 = Math.max(0, range.x0), x1 = Math.min(d.width - 1, range.x1);
    const y0 = Math.max(0, range.y0), y1 = Math.min(d.height - 1, range.y1);
    const loader = ctx.spriteLoader || null;

    // Пол (000069): спрайт через DI spriteLoader; гарды (функции нет /
    // путь нет / изображение не готово) — фолбэк #182029, как раньше.
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (d.cells[y * d.width + x] !== G.CELL_FLOOR) continue;
        const p = proj(x, y);
        const path = live.dungeonFloorFrame
          ? live.dungeonFloorFrame(d.type, x, y) : null;
        const img = (path && loader && typeof loader.image === 'function')
          ? ((typeof loader.isReady === 'function' ? loader.isReady(path) : true)
            && loader.image(path))
          : null;
        if (img) {
          g2.drawImage(img, p.x, p.y, zoom, zoom);
        } else {
          g2.fillStyle = '#182029';
          g2.fillRect(p.x, p.y, zoom, zoom);
        }
      }
    }

    // Стены (000070): слой ПОД мобами/игроком/сундуками (порядок
    // зафиксирован в memory 000070). Гарды: wallObjs не массив / obj не
    // в таблице DUNGEON_WALL_FRAMES / изображение не готово — тёмный
    // фон, drawImage не вызывается.
    const wallFrames = live.DUNGEON_WALL_FRAMES;
    if (loader && wallFrames && Array.isArray(d.wallObjs)) {
      for (const wo of d.wallObjs) {
        if (!wo || wo.x < x0 || wo.x > x1 || wo.y < y0 || wo.y > y1) continue;
        const path = wallFrames[wo.obj];
        if (!path) continue;
        const img = (typeof loader.isReady === 'function'
          ? loader.isReady(path) : true) && loader.image(path);
        if (!img) continue;
        const p = proj(wo.x, wo.y);
        g2.drawImage(img, p.x, p.y, zoom, zoom);
      }
    }

    // Выход «X» и вход — ОСТАЮТСЯ текстовыми/цветовыми маркерами
    // (решение 000067: читаемость; спрайт-изация — за рамками).
    // Размер и проекция — мировые.
    const ex = proj(d.exit.x, d.exit.y);
    g2.fillStyle = '#d4b45a';
    g2.fillRect(ex.x + 2, ex.y + 2, zoom - 4, zoom - 4);
    g2.fillStyle = '#101418';
    g2.font = 'bold ' + (zoom - 8) + 'px ui-monospace, monospace';
    g2.textAlign = 'center';
    g2.fillText('X', ex.x + zoom / 2, ex.y + zoom - 5);
    // Вход (откуда зашли).
    const en = proj(d.entrance.x, d.entrance.y);
    g2.fillStyle = '#3f9d55';
    g2.fillRect(en.x + 4, en.y + 4, zoom - 8, zoom - 8);

    // Сундуки (000067): спрайт G.DUNGEON_CHEST (zoom*0.8, центр
    // клетки); гарды (sprites.js не загружен / нет пути /
    // spriteLoader=null / изображение не готово) — прежний золотой
    // квадрат + тёмная полоса. ОТКРЫТЫЙ сундук — не рисуется (клетка
    // пуста, как раньше).
    const chestPath = typeof live.DUNGEON_CHEST === 'string'
      ? live.DUNGEON_CHEST : null;
    for (const ch of c.chests) {
      if (ch.opened) continue;
      const img = (chestPath && loader && typeof loader.image === 'function')
        ? ((typeof loader.isReady === 'function' ? loader.isReady(chestPath) : true)
          && loader.image(chestPath)) || null
        : null;
      if (img) {
        const cs = zoom * 0.8;
        const pc = proj(ch.x + 0.5, ch.y + 0.5);
        g2.drawImage(img, pc.x - cs / 2, pc.y - cs / 2, cs, cs);
      } else {
        const p = proj(ch.x, ch.y);
        g2.fillStyle = '#e0b13c';
        g2.fillRect(p.x + 3, p.y + 3, zoom - 6, zoom - 6);
        g2.fillStyle = '#7a5c16';
        g2.fillRect(p.x + 3, p.y + zoom / 2 - 1, zoom - 6, 2);
      }
    }
    // Мобы (блуждающие группы). 000067: каждый mobId группы — СВОЙ
    // спрайт (мир-паттерн «одна группа = один спрайт» неприменим):
    // mobSpriteKind → MOB_FRAMES → кадр Math.floor(frameIndex(now,
    // ux, uy, frames.length)) — floor ОБЯЗАТЕЛЕН: frameIndex на
    // ДРОБНЫХ координатах юнита (смещения off) возвращает дробный
    // индекс, frames[1.6] = undefined — моб ушёл бы в фолбэк молча.
    // Фолбэки ПЕР-ЮНИТ: image не готов / вида нет → прежний квадрат
    // ИМЕННО для этого юнита, остальные — спрайты. Legacy-группа
    // БЕЗ mobIds (или sprites.js не в цепочке) — один групповой
    // квадрат, как раньше. Boss — #b06ad4-прямоугольник bounding box
    // юнитов (± половина спрайта 0.6 клетки), рисуется ПЕРЕД
    // спрайтами юнитов.
    const mobSpriteOk = typeof live.mobSpriteKind === 'function'
      && live.MOB_FRAMES && typeof live.MOB_FRAMES === 'object'
      && typeof live.frameIndex === 'function';
    for (const m of c.mobs) {
      if (m.defeated) continue;
      const units = (Array.isArray(m.mobIds) && m.mobIds.length > 0
        && mobSpriteOk)
        ? m.mobIds.map((id, i) => ({
          id,
          x: m.x + MOB_UNIT_OFF[i % MOB_UNIT_OFF.length][0],
          y: m.y + MOB_UNIT_OFF[i % MOB_UNIT_OFF.length][1],
        }))
        : null;
      if (units) {
        if (m.boss) {
          // Boss-подсветка — bounding box юнитов (центр ± 0.6 клетки),
          // ДО спрайтов (слой под ними).
          let minX = Infinity, minY = Infinity;
          let maxX = -Infinity, maxY = -Infinity;
          for (const u of units) {
            minX = Math.min(minX, u.x - 0.1);
            maxX = Math.max(maxX, u.x + 1.1);
            minY = Math.min(minY, u.y - 0.1);
            maxY = Math.max(maxY, u.y + 1.1);
          }
          const bb = proj(minX, minY);
          g2.fillStyle = '#b06ad4';
          g2.fillRect(bb.x, bb.y, (maxX - minX) * zoom, (maxY - minY) * zoom);
        }
        for (const u of units) {
          const kind = live.mobSpriteKind(u.id);
          const frames = kind ? live.MOB_FRAMES[kind] : null;
          let img = null;
          if (frames && frames.length && loader
              && typeof loader.image === 'function') {
            const fi = Math.floor(
              live.frameIndex(nowT, u.x, u.y, frames.length));
            const path = frames[fi];
            if (path) {
              img = (typeof loader.isReady === 'function'
                ? loader.isReady(path) : true) && loader.image(path)
                || null;
            }
          }
          if (img) {
            const ms = zoom * 1.2; // формула мобов мира
            const mc = proj(u.x + 0.5, u.y + 0.5);
            g2.drawImage(img, mc.x - ms / 2, mc.y - ms / 2, ms, ms);
          } else {
            const pu = proj(u.x, u.y);
            g2.fillStyle = m.boss ? '#b06ad4' : '#d9483b';
            g2.fillRect(pu.x + 3, pu.y + 3, zoom - 6, zoom - 6);
          }
        }
      } else {
        const p = proj(m.x, m.y);
        g2.fillStyle = m.boss ? '#b06ad4' : '#d9483b';
        g2.fillRect(p.x + 3, p.y + 3, zoom - 6, zoom - 6);
      }
      // Номер уровня группы (как раньше, центр клетки группы).
      const pn = proj(m.x, m.y);
      g2.fillStyle = '#fff';
      g2.font = (zoom - 10) + 'px ui-monospace, monospace';
      g2.fillText(String(m.level), pn.x + zoom / 2, pn.y + zoom / 2 + 3);
    }
    // Игрок: та же точка, что и цель камеры (хук state.pos(now),
    // задел 000068). 000067: спрайт Флогистона (zoom*1.15, формула
    // мира), кадр — по действию playerAction (всегда 'idle'); гарды
    // (sprites.js нет / лоадера нет / кадр не готов) — прежний
    // голубой ромб.
    const pos = playerPos(s, nowT);
    const pp = proj(pos.x + 0.5, pos.y + 0.5);
    let playerImg = null;
    const pf = typeof live.phlogistonFrames === 'function'
      ? live.phlogistonFrames(playerAction(s, nowT)) : null;
    if (pf && pf.length && loader && typeof loader.image === 'function'
        && typeof live.frameIndex === 'function') {
      const fi = Math.floor(
        live.frameIndex(nowT, pos.x, pos.y, pf.length));
      const path = pf[fi];
      if (path) {
        playerImg = (typeof loader.isReady === 'function'
          ? loader.isReady(path) : true) && loader.image(path) || null;
      }
    }
    if (playerImg) {
      const ps = zoom * 1.15; // формула Флогистона мира
      g2.drawImage(playerImg, pp.x - ps / 2, pp.y - ps / 2, ps, ps);
    } else {
      const r = zoom * 0.3;
      g2.fillStyle = '#8cf2fc';
      g2.beginPath();
      g2.moveTo(pp.x, pp.y - r);
      g2.lineTo(pp.x + r, pp.y);
      g2.lineTo(pp.x, pp.y + r);
      g2.lineTo(pp.x - r, pp.y);
      g2.closePath();
      g2.fill();
    }

    const dist = Math.abs(s.x - d.exit.x) + Math.abs(s.y - d.exit.y);
    stateEl.textContent =
      G.DUNGEON_NAMES[d.type] + '  (' + s.x + ', ' + s.y + ')\n' +
      'До выхода: ' + dist + ' клеток (на глаз)\n' +
      'Группы: ' + c.mobs.filter((m) => !m.defeated).length +
      '  |  Сундуки: ' + c.chests.filter((x) => !x.opened).length;
    logEl.textContent = (s.log || []).slice(-8).join('\n');
  }

  // Кадр rAF-цикла: ресайз вьюпорта (паттерн main.js), сглаживание
  // камеры (та же cameraStep/CAM_TAU_MS, что мир) и рендер.
  function step() {
    if (!isActive()) { rafId = null; return; }
    const s = state();
    if (!s || !s.dg) return;
    const d = s.dg;
    const w = viewW(), h = viewH();
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    const now = nowMs();
    const dt = lastT == null ? 0 : Math.max(0, now - lastT);
    lastT = now;
    // Цель — центр клетки игрока (+0.5, как cam/тайл в мире).
    const pos = playerPos(s, now);
    const live = liveGame();
    cam.x = live.cameraStep
      ? live.cameraStep(cam.x, pos.x + 0.5, dt, live.CAM_TAU_MS)
      : pos.x + 0.5;
    cam.y = live.cameraStep
      ? live.cameraStep(cam.y, pos.y + 0.5, dt, live.CAM_TAU_MS)
      : pos.y + 0.5;
    // Кламп/центрирование — каждый кадр ПОСЛЕ сглаживания: зум меняет
    // диапазон, сглаживание тянет за пределы — кламп возвращает.
    cam.x = clampCam(cam.x, d.width, w, zoom);
    cam.y = clampCam(cam.y, d.height, h, zoom);
    render(now);
  }

  function tick() {
    step();
    if (isActive() && raf) rafId = raf(tick);
  }

  G.dungeonUI = {
    start(opts) {
      if (isActive()) return;
      ctx = { open: true, ...opts };
      // Стартовый zoom — из opts (мировое значение); без opts —
      // G.ZOOM_START (существующие вызовы и регрессии 000043 вызывают
      // start без zoom).
      zoom = (typeof opts.zoom === 'number' && Number.isFinite(opts.zoom)
          && opts.zoom > 0) ? opts.zoom : G.ZOOM_START;
      build();
      // Камера — снап к игроку (с клампом/центрированием для конечной
      // сетки); дальше — сглаживание в rAF-цикле.
      const s = state();
      if (s && s.dg) {
        const pos = playerPos(s, nowMs());
        cam = { x: pos.x + 0.5, y: pos.y + 0.5 };
        cam.x = clampCam(cam.x, s.dg.width, viewW(), zoom);
        cam.y = clampCam(cam.y, s.dg.height, viewH(), zoom);
      } else {
        cam = { x: 0.5, y: 0.5 };
      }
      lastT = null;
      render();
      // Цикл (паттерн combat-ui.js): без rAF (vm-песочница 000043) —
      // null, событийный синхронный рендер, как раньше.
      if (raf) rafId = raf(tick);
    },
    close() {
      if (!ctx) return;
      // Остановить rAF-цикл ДО снятия оверлея (паттерн combat-ui.js).
      if (rafId != null && caf) { caf(rafId); rafId = null; }
      if (overlay) overlay.remove();
      overlay = canvas = g2 = stateEl = logEl = null;
      ctx = null;
      lastT = null;
    },
    isActive,
    render,
  };
})();

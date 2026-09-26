// Входная точка игры (SPEC.md): WebGL-рендер процедурной карты мира
// и перемещение Флогистона по тайлам.
//
// Браузерный скрипт (обычный <script>, не модуль — чтобы игра
// открывалась двойным кликом по index.html без локального сервера).
// Использует API из globalThis.Game (perlin.js, mapseed.js, map.js).
//
// Управление: стрелки / WASD / ЦФЫВ — шаг на тайл (удержание — бег).
// Колёсико — приближение.

(function () {
  'use strict';
  const G = globalThis.Game;

  const canvas = document.getElementById('game');
  const hud = document.getElementById('hud');
  // Слой спрайтов (2D-canvas поверх WebGL): текстуры тайлов, постройки,
  // мобы, Флогистон. Не загрузилось — рисуем ничего и остаётся
  // прежний цветной рендер (фолбэк, игра не ломается).
  const spriteCanvas = document.getElementById('sprites');
  const s2 = spriteCanvas ? spriteCanvas.getContext('2d') : null;

  // --- Настройки рендера ---
  const TILE_COLORS = {
    [G.TERRAIN.DEEP_WATER]: [0.09, 0.18, 0.42],
    [G.TERRAIN.WATER]: [0.16, 0.34, 0.62],
    [G.TERRAIN.SAND]: [0.76, 0.70, 0.50],
    [G.TERRAIN.GRASS]: [0.34, 0.55, 0.25],
    [G.TERRAIN.FOREST]: [0.18, 0.40, 0.20],
    [G.TERRAIN.HILL]: [0.45, 0.43, 0.29],
    [G.TERRAIN.MOUNTAIN]: [0.34, 0.32, 0.36],
    [G.TERRAIN.SWAMP]: [0.30, 0.38, 0.24],
  };
  const BUILDING_COLOR = [0.98, 0.83, 0.30]; // золотой маркер
  const MOB_COLOR = [0.85, 0.30, 0.25];      // красный маркер
  const PLAYER_COLOR = [0.55, 0.95, 1.0];    // светящийся Флогистон
  const MOVE_INTERVAL_MS = 140;

  // --- Спрайты (src/sprites.js) ---
  // Загружаем Image() — работает под file://. Выбор файла всегда один и тот
  // же для типа/координат (чистые функции), от загрузки зависит только то,
  // рисуется ли слой или фолбэк.
  let spriteLoader = null;
  if (s2 && G.createSpriteLoader) {
    spriteLoader = G.createSpriteLoader((path) => new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null); // фолбэк: цветные тайлы/маркеры
      img.src = path;
    }));
    for (const p of G.allAssetPaths()) spriteLoader.queue(p);
  }
  let lastStepAt = -1e9;      // время последнего шага (анимация walk/idle)
  let animAction = 'idle';    // отладочное действие (__game.actions.playAnimation)
  let animUntil = 0;

  // --- WebGL ---
  const gl = canvas.getContext('webgl', { antialias: true });
  if (!gl) {
    hud.textContent = 'WebGL не поддерживается этим браузером.';
    return;
  }

  function compile(type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(sh));
    }
    return sh;
  }

  const program = gl.createProgram();
  gl.attachShader(program, compile(gl.VERTEX_SHADER, `
    attribute vec2 a_pos;
    attribute vec4 a_color;
    varying vec4 v_color;
    uniform mat4 u_proj;
    void main() {
      v_color = a_color;
      gl_Position = u_proj * vec4(a_pos, 0.0, 1.0);
    }
  `));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, `
    precision mediump float;
    varying vec4 v_color;
    void main() { gl_FragColor = v_color; }
  `));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program));
  }
  gl.useProgram(program);

  const aPos = gl.getAttribLocation(program, 'a_pos');
  const aColor = gl.getAttribLocation(program, 'a_color');
  const uProj = gl.getUniformLocation(program, 'u_proj');
  gl.enableVertexAttribArray(aPos);
  gl.enableVertexAttribArray(aColor);

  // Один большой буфер: [x, y, r, g, b, a] * 6 вершин на тайл.
  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  const vertexSize = 6 * 4; // 6 floats * 4 байта

  // Минимальная орто-матрица 4x4 (столбцами).
  // zoom = пикселей на тайл; видимое окно = canvas/zoom тайлов.
  // y-ось отражена: в мире y растёт вниз (строки карты), на экране — тоже вниз.
  function orthoMatrix(zoom, cx, cy) {
    const halfW = canvas.width / (2 * zoom);
    const halfH = canvas.height / (2 * zoom);
    return new Float32Array([
      1 / halfW, 0, 0, 0,
      0, -1 / halfH, 0, 0,
      0, 0, -1, 0,
      -cx / halfW, cy / halfH, 0, 1,
    ]);
  }

  // --- Загрузка мира ---

  // Пиксели assets/map.png. При неудаче (например, tainted canvas на file://)
  // пересчитываем ту же детерминированную затравку на клиенте.
  function loadMapPixels() {
    return new Promise((resolve) => {
      const img = new Image();
      const done = (pixels) => resolve(pixels);
      img.onerror = () => {
        console.warn('Не удалось прочитать assets/map.png, используем пересчёт.');
        done({ ...G.generateSeedPixels(), fromPng: false });
      };
      img.onload = () => {
        try {
          const c = document.createElement('canvas');
          c.width = img.naturalWidth;
          c.height = img.naturalHeight;
          const ctx = c.getContext('2d', { willReadFrequently: true });
          ctx.drawImage(img, 0, 0);
          const d = ctx.getImageData(0, 0, c.width, c.height);
          done({ width: c.width, height: c.height, data: d.data, fromPng: true });
        } catch (err) {
          console.warn('Canvas tainted (file://?), используем пересчёт:', err);
          done({ ...G.generateSeedPixels(), fromPng: false });
        }
      };
      img.src = 'assets/map.png';
    });
  }

  // --- Игровое состояние ---
  let map = null;
  let tileCache = null; // кэш тайлов (000019): шум пересчитывается только для новых тайлов
  let mapPixels = null; // пиксели map.png — нужны для сида подземелий
  const hero = G.createCharacter('Флогистон'); // персонаж (src/player.js)
  G.playerUI && G.playerUI.setCharacter(hero);
  const player = { x: 0, y: 0 };
  const prevPos = { x: 0, y: 0 }; // позиция до последнего шага (побег/смерть)
  let zoom = G.ZOOM_START; // пикселей на тайл (детальный старт, 000019)
  const cam = { x: 0.5, y: 0.5 };

  // Игровое время (SPEC.md «Игровое время», src/day.js).
  const clock = G.createClock();
  // Побеждённые группы: 'x,y' → день поражения (респаун через respawn_days).
  const defeatedAt = new Map();
  let hudFlash = '';
  let hudFlashUntil = 0;

  // Подземелье: текущая вылазка и память содержимого по входам.
  // dungeonMemory: 'x,y' входа → { contents, lastVisitDay }.
  let dungeonState = null; // { dg, contents, x, y, prevX, prevY, worldKey, log }
  const dungeonMemory = new Map();

  // Смена дня: восстановление, респауны групп (SPEC.md «Игровое время»).
  clock.onDay(({ day }) => {
    G.restoreDay(hero); // часть HP/MP по формулам навыков
    const due = G.dueForRespawn(defeatedAt, day);
    for (const k of due) defeatedAt.delete(k);
    G.playerUI && G.playerUI.render();
    hudFlash = (due.length ? 'Мобилизуются новые группы мобов.\n' : '') + 'День ' + day + '.';
    hudFlashUntil = performance.now() + 5000;
  });

  function findSpawn() {
    // Ищем проходимый тайл в окрестностях (0,0) по спирали,
    // вдали от групп мобов — чтобы старт не начинался боем.
    for (let r = 0; r < 200; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const t = map.tileAt(dx, dy);
          if (t.passable && !t.hasMobGroup) {
            player.x = dx;
            player.y = dy;
            return;
          }
        }
      }
    }
    throw new Error('не найден проходимый тайл для старта');
  }

  // --- Ввод ---
  const keys = new Set();
  const KEY_DIRS = {
    ArrowUp: [0, -1], KeyW: [0, -1], KeyЦ: [0, -1],
    ArrowDown: [0, 1], KeyS: [0, 1], KeyЫ: [0, 1],
    ArrowLeft: [-1, 0], KeyA: [-1, 0], KeyФ: [-1, 0],
    ArrowRight: [1, 0], KeyD: [1, 0], KeyВ: [1, 0],
  };
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyI' && G.playerUI) { // I (Ш) — панель персонажа
      G.playerUI.toggle();
      return;
    }
    // В бою клавиши обрабатывает combat-ui, в подземелье — dungeon-ui.
    if (G.combatUI && G.combatUI.isActive()) return;
    if (G.dungeonUI && G.dungeonUI.isActive()) return;
    if (KEY_DIRS[e.code]) {
      keys.add(e.code);
      e.preventDefault();
    }
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());
  canvas.addEventListener('wheel', (e) => {
    zoom = Math.max(G.ZOOM_MIN, Math.min(G.ZOOM_MAX, zoom * (e.deltaY < 0 ? 1.2 : 1 / 1.2)));
    e.preventDefault();
  }, { passive: false });

  function tryMove() {
    for (const code of keys) { // порядок в Set = порядок нажатий
      const [dx, dy] = KEY_DIRS[code];
      const t = map.tileAt(player.x + dx, player.y + dy);
      if (t.passable) {
        prevPos.x = player.x;
        prevPos.y = player.y;
        player.x += dx;
        player.y += dy;
        return true;
      }
    }
    return false;
  }

  // Шаг на тайл с группой мобов (ещё не побеждённой) → мини-карта боя.
  function maybeStartCombat() {
    if (G.combatUI && G.combatUI.isActive()) return;
    const t = map.tileAt(player.x, player.y);
    if (!t.hasMobGroup) return;
    const key = player.x + ',' + player.y;
    if (defeatedAt.has(key)) return;
    G.combatUI.startCombat({
      hero,
      tile: t,
      prev: { x: prevPos.x, y: prevPos.y },
      seed: G.hash2(player.x, player.y, 0x5eedc0de),
      day: clock.day,
      onEnd: (res) => {
        if (res.outcome === 'victory') {
          defeatedAt.set(key, clock.day);
          hudFlash = `Победа! +${res.xp} опыта, +${res.gold} золота.`;
        } else if (res.outcome === 'dead') {
          // Подъём: половину HP, −20% золота (полная система смерти — 000008).
          hero.alive = true;
          hero.hp = Math.max(1, Math.round(G.derived(hero).maxHP / 2));
          hero.gold = Math.floor(hero.gold * 0.8);
          hudFlash = 'Вы очнулись. −20% золота.';
        } else {
          hudFlash = 'Вы ушли от боя.';
        }
        // Побег и смерть: назад на тайл, с которого зашёл в бой.
        if (res.outcome !== 'victory') {
          player.x = prevPos.x;
          player.y = prevPos.y;
        }
        G.playerUI && G.playerUI.render();
        hudFlashUntil = performance.now() + 5000;
      },
    });
  }

  // --- Подземелье ---

  // Шаг на тайл с входом в пещеру → лабиринт (ядро: src/dungeon.js).
  function maybeEnterDungeon() {
    if (dungeonState) return;
    const t = map.tileAt(player.x, player.y);
    if (!t.hasBuilding || t.building !== G.BUILDING_TYPES.CAVE_ENTRANCE) return;
    const worldKey = player.x + ',' + player.y;
    const d = G.createDungeon(player.x, player.y, mapPixels, t.terrain);
    const saved = dungeonMemory.get(worldKey);
    // Содержимое живёт, пока внутри + dungeon_memory_days (SPEC).
    let contents = saved && G.contentValid(saved.lastVisitDay, clock.day)
      ? saved.contents
      : null;
    if (!contents) contents = G.generateDungeonContents(d, hero);
    dungeonState = {
      dg: d, contents,
      x: d.entrance.x, y: d.entrance.y,
      prevX: d.entrance.x, prevY: d.entrance.y,
      worldKey,
      log: [G.DUNGEON_NAMES[d.type] + ': вход.'],
    };
    if (saved) saved.lastVisitDay = clock.day; // продлить память
    G.dungeonUI.start({
      get state() { return dungeonState; },
      onMove: (dx, dy) => dungeonMove(dx, dy),
    });
  }

  // Бой с блуждающей группой подземелья.
  function startDungeonCombat(g) {
    const ds = dungeonState;
    G.combatUI.startCombat({
      hero,
      mobs: g.mobIds,
      mobLevel: g.level,
      groupName: g.boss ? 'Хозяин бездны' : 'блуждающая группа',
      prev: { x: ds.prevX, y: ds.prevY },
      seed: G.hash2(g.boss ? 999 : (parseInt(g.id.slice(1), 36) || 17), g.level, 0xb055),
      day: clock.day,
      onEnd: (res) => {
        if (res.outcome === 'victory') {
          g.defeated = true;
          ds.log.push((g.boss ? 'Босс' : 'Группа') + ' повержена. +' + res.xp + ' опыта.');
        } else {
          // Побег и смерть: назад на клетку, с которой зашёл в бой.
          ds.x = ds.prevX; ds.y = ds.prevY;
          if (res.outcome === 'dead') {
            hero.alive = true;
            hero.hp = Math.max(1, Math.round(G.derived(hero).maxHP / 2));
            hero.gold = Math.floor(hero.gold * 0.8);
            ds.log.push('Вы очнулись. −20% золота.');
          }
        }
        G.playerUI && G.playerUI.render();
        G.dungeonUI.render();
      },
    });
  }

  function exitDungeon() {
    const ds = dungeonState;
    dungeonMemory.set(ds.worldKey, { contents: ds.contents, lastVisitDay: clock.day });
    clock.event('dungeon'); // вылазка забирает день (SPEC «Игровое время»)
    dungeonState = null;
    G.dungeonUI.close();
  }

  // Шаг внутри лабиринта (вызывается dungeon-ui по клавише).
  function dungeonMove(dx, dy) {
    const ds = dungeonState;
    if (!ds || (G.combatUI && G.combatUI.isActive())) return;
    const d = ds.dg, c = ds.contents;
    const nx = ds.x + dx, ny = ds.y + dy;
    if (nx < 0 || ny < 0 || nx >= d.width || ny >= d.height) return;
    if (d.cells[ny * d.width + nx] !== G.CELL_FLOOR) return; // стена
    if (nx === d.exit.x && ny === d.exit.y) {
      exitDungeon();
      hudFlash = 'Вы вышли из ' + G.DUNGEON_NAMES[d.type] + '.';
      hudFlashUntil = performance.now() + 5000;
      return;
    }
    ds.prevX = ds.x; ds.prevY = ds.y;
    ds.x = nx; ds.y = ny;
    // Блуждающая группа на клетке → бой.
    const g = c.mobs.find((m) => !m.defeated && m.x === nx && m.y === ny);
    if (g) {
      startDungeonCombat(g);
      return;
    }
    // Сундук на клетке → открыть.
    const ch = c.chests.find((x) => !x.opened && x.x === nx && x.y === ny);
    if (ch) {
      const r = G.openChest(c, ch.id);
      if (r.ok) {
        hero.gold += r.gold;
        // Предмет в сундуке — id из каталога (assets/items) → в инвентарь.
        let itemMsg = '';
        if (r.item) {
          const it = G.getItem(r.item);
          const add = G.addItem(hero, r.item);
          itemMsg = add.ok
            ? ', ' + it.name
            : ' (инвентарь полон: ' + it.name + ' потерян)';
        }
        ds.log.push('Сундук: +' + r.gold + ' золота' + itemMsg);
        hudFlash = 'Сундук: +' + r.gold + ' золота' + itemMsg;
        hudFlashUntil = performance.now() + 5000;
        G.playerUI && G.playerUI.render();
      }
    }
    // Каждый шаг игрока — шаг блуждания мобов.
    G.wanderStep(c, d);
  }

  // --- Камера ---
  function updateCamera() {
    // Плавное следование за игроком.
    cam.x += (player.x + 0.5 - cam.x) * 0.2;
    cam.y += (player.y + 0.5 - cam.y) * 0.2;
  }

  // --- Отрисовка ---
  let quadVerts = []; // переиспользуемый массив [x,y,r,g,b,a]*6

  function pushQuad(verts, x0, y0, x1, y1, [r, g, b]) {
    // Два треугольника, 6 вершин по углам (повторяются).
    const V = [
      [x0, y0], [x1, y0], [x1, y1],
      [x0, y0], [x1, y1], [x0, y1],
    ];
    for (const [px, py] of V) {
      verts.push(px, py, r, g, b, 1);
    }
  }

  const frameTiles = []; // видимые тайлы кадра (общие для WebGL и слоя спрайтов)

  function buildFrame() {
    const verts = quadVerts;
    verts.length = 0;
    frameTiles.length = 0;

    // Отрисовываем только видимую область + запас (000019); тайлы
    // берём из кэша — шум пересчитывается лишь для новых тайлов.
    const range = G.visibleTileRange(cam.x, cam.y, canvas.width, canvas.height, zoom);
    for (let ty = range.y0; ty <= range.y1; ty++) {
      for (let tx = range.x0; tx <= range.x1; tx++) {
        const t = tileCache.tile(tx, ty);
        frameTiles.push(t); // {x, y, terrain, passable, hasBuilding, building, hasMobGroup, mobGroup}
        const base = TILE_COLORS[t.terrain];
        // Небольшое вариативное освещение, чтобы тайлы не были «кляксами».
        const b = map.brightness(tx, ty);
        const c = [base[0] + b * 0.05, base[1] + b * 0.05, base[2] + b * 0.05];
        pushQuad(verts, tx, ty, tx + 1, ty + 1, c);

        // Маркеры на тайле.
        if (t.hasBuilding) {
          pushQuad(verts, tx + 0.30, ty + 0.30, tx + 0.70, ty + 0.70, BUILDING_COLOR);
        } else if (t.hasMobGroup) {
          pushQuad(verts, tx + 0.30, ty + 0.30, tx + 0.70, ty + 0.70, MOB_COLOR);
        }
      }
    }

    // Флогистон: светящийся ромб по центру тайла.
    const px = player.x + 0.5, py = player.y + 0.5, s = 0.28;
    verts.push(
      px, py - s, PLAYER_COLOR[0], PLAYER_COLOR[1], PLAYER_COLOR[2], 1,
      px + s, py, PLAYER_COLOR[0], PLAYER_COLOR[1], PLAYER_COLOR[2], 1,
      px, py + s, PLAYER_COLOR[0], PLAYER_COLOR[1], PLAYER_COLOR[2], 1,
      px, py - s, PLAYER_COLOR[0], PLAYER_COLOR[1], PLAYER_COLOR[2], 1,
      px + s, py, PLAYER_COLOR[0], PLAYER_COLOR[1], PLAYER_COLOR[2], 1,
      px - s, py, PLAYER_COLOR[0], PLAYER_COLOR[1], PLAYER_COLOR[2], 1,
    );

    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.DYNAMIC_DRAW);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, vertexSize, 0);
    gl.vertexAttribPointer(aColor, 4, gl.FLOAT, false, vertexSize, 2 * 4);

    return verts;
  }

  // --- Слой спрайтов (2D-canvas поверх WebGL) ---
  // Мировые координаты → экран те же, что в orthoMatrix:
  //   x_экрана = W/2 + (tx - cam.x) * zoom,  y_экрана = H/2 + (cam.y - ty) * zoom.
  // Если ни один ассет не загрузился — выходим без рисования,
  // под слоем остаются цветные тайлы/маркеры WebGL (фолбэк).
  function drawSprites(now) {
    if (!s2 || !spriteLoader) return;
    const w = spriteCanvas.width, h = spriteCanvas.height;
    s2.clearRect(0, 0, w, h);
    if (spriteLoader.readyCount() === 0) return;
    const cx = w / 2, cy = h / 2;
    const toX = (tx) => cx + (tx - cam.x) * zoom;
    const toY = (ty) => cy + (cam.y - ty) * zoom;

    // Тайлы: текстура (вода/глубокая вода — кадр анимации по чистому
    // селектору frameIndex(время, координаты, число кадров)).
    for (const t of frameTiles) {
      const sx = toX(t.x), sy = toY(t.y);
      const frames = G.tileFrames(t.terrain);
      if (frames.length) {
        const idx = frames.length > 1 ? G.frameIndex(now, t.x, t.y, frames.length) : 0;
        const img = spriteLoader.image(frames[idx]);
        if (img) s2.drawImage(img, sx, sy, zoom, zoom);
      }
      // Иконка постройки / спрайт группы мобов — поверх тайла.
      if (t.hasBuilding) {
        const p = G.buildingSprite(t.building);
        const b = p ? spriteLoader.image(p) : null;
        if (b) s2.drawImage(b, sx + zoom * 0.04, sy + zoom * 0.04, zoom * 0.92, zoom * 0.92);
      } else if (t.hasMobGroup) {
        const mf = G.mobFrames(t.mobGroup);
        const idx = mf.length > 1 ? G.frameIndex(now, t.x, t.y, mf.length) : 0;
        const m = mf.length ? spriteLoader.image(mf[idx]) : null;
        if (m) s2.drawImage(m, sx - zoom * 0.1, sy - zoom * 0.15, zoom * 1.2, zoom * 1.2);
      }
    }

    // Флогистон: idle/walk по движению, attack/cast — отладочная animAction.
    const action = now < animUntil ? animAction
      : (now - lastStepAt < 260 ? 'walk' : 'idle');
    const pf = G.phlogistonFrames(action);
    if (pf.length) {
      const idx = pf.length > 1 ? (Math.floor(now / 240) % pf.length) : 0;
      const pi = spriteLoader.image(pf[idx]);
      if (pi) {
        const size = zoom * 1.15;
        const px = toX(player.x + 0.5), py = toY(player.y + 0.5);
        s2.drawImage(pi, px - size / 2, py - size / 2, size, size);
      }
    }
  }

  function hudUpdate() {
    const t = map.tileAt(player.x, player.y);
    const d = G.derived(hero);
    const key = player.x + ',' + player.y;
    let line = 'Флогистон, ур. ' + hero.level + '  (' + player.x + ', ' + player.y + ')\n' +
      'HP ' + hero.hp + '/' + d.maxHP + '  |  Золото: ' + hero.gold + '  |  Очки: ' + hero.points + '\n' +
      'Местность: ' + G.TERRAIN_NAMES[t.terrain] + '\n' +
      'День: ' + clock.day + '  |  Масштаб: ' + zoom + 'px  |  карта: ' + map.width + 'x' + map.height +
      (map.fromPng ? ' (map.png)' : ' (пересчёт)') +
      (spriteLoader ? '  |  графика: ' + spriteLoader.readyCount() + '/' + spriteLoader.totalCount() : '') + '\n' +
      '[I] персонаж';
    if (dungeonState) {
      const ds = dungeonState;
      const dist = Math.abs(ds.x - ds.dg.exit.x) + Math.abs(ds.y - ds.dg.exit.y);
      line += '\n--- ' + G.DUNGEON_NAMES[ds.dg.type] + ' (' + ds.x + ', ' + ds.y + ') ---' +
        '\nДо выхода: ~' + dist + ' клеток  |  ' +
        (ds.contents.mobs.filter((m) => !m.defeated).length) + ' групп(ы)';
    } else if (t.hasBuilding) {
      const shopHint = G.shopKindsFor(t.building) ? '  (торговля — панель [I])' : '';
      line += '\nЗдесь: ' + G.BUILDING_NAMES[t.building] + shopHint +
        (t.building === G.BUILDING_TYPES.CAVE_ENTRANCE ? ' (вход — шагните)' : '');
    } else if (t.hasMobGroup) {
      line += defeatedAt.has(key)
        ? '\nГруппа ' + G.MOB_GROUP_NAMES[t.mobGroup] + ' повержена.'
        : '\nОсторожно: ' + G.MOB_GROUP_NAMES[t.mobGroup] + '!';
    }
    // Магазин текущего тайла → секция «Торговля» в панели персонажа.
    if (G.playerUI) {
      const isShop = !dungeonState && t.hasBuilding && G.shopKindsFor(t.building);
      G.playerUI.setShop(isShop
        ? G.makeShop(player.x, player.y, t.building, t.buildingWealth)
        : null);
    }
    if (performance.now() < hudFlashUntil) line += '\n' + hudFlash;
    hud.textContent = line;
  }

  // --- Цикл ---
  let lastMove = 0;
  function frame(now) {
    const inCombat = G.combatUI && G.combatUI.isActive();
    const inDungeon = dungeonState !== null;
    if (!inCombat && !inDungeon && now - lastMove >= MOVE_INTERVAL_MS) {
      if (keys.size && tryMove()) {
        lastMove = now;
        lastStepAt = now; // Флогистон переключается на анимацию ходьбы
        clock.addStep(1); // шаги мира тикают игровой день
        maybeStartCombat();
        maybeEnterDungeon();
      }
    }
    updateCamera();

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.06, 0.08, 0.10, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.uniformMatrix4fv(uProj, false, orthoMatrix(zoom, cam.x, cam.y));
    const verts = buildFrame();
    gl.drawArrays(gl.TRIANGLES, 0, verts.length / 6);

    // Слой спрайтов поверх тайлов (пустой, пока ассеты не загрузились).
    if (spriteCanvas) {
      spriteCanvas.width = window.innerWidth;
      spriteCanvas.height = window.innerHeight;
    }
    drawSprites(now);

    hudUpdate();
    requestAnimationFrame(frame);
  }

  // Отладочный крючок (используется смоук-тестами и ручной проверкой).
  globalThis.__game = {
    get state() {
      return {
        player: { x: player.x, y: player.y },
        cam: { x: cam.x, y: cam.y },
        zoom,
        day: clock.day,
        stepsToday: clock.steps,
        hero: {
          level: hero.level, xp: hero.xp, hp: hero.hp,
          gold: hero.gold, points: hero.points,
          weight: G.inventoryWeight(hero),
          maxWeight: G.maxCarryWeight(hero),
          inventory: (hero.inventory || { slots: [] }).slots,
        },
        map: map ? { width: map.width, height: map.height, fromPng: map.fromPng } : null,
        sprites: spriteLoader
          ? { ready: spriteLoader.readyCount(), total: spriteLoader.totalCount() }
          : null,
        keys: Array.from(keys),
      };
    },
    // Отладочные действия (смоук-тесты, ручная проверка баланса).
    // Текущий бой (для смоук-тестов и отладки).
    get combat() {
      return G.combatUI ? G.combatUI.current() : null;
    },
    // Текущее подземелье (или null).
    get dungeon() {
      if (!dungeonState) return null;
      const ds = dungeonState;
      return {
        type: ds.dg.type, name: G.DUNGEON_NAMES[ds.dg.type],
        width: ds.dg.width, height: ds.dg.height,
        cells: ds.dg.cells,
        entrance: { x: ds.dg.entrance.x, y: ds.dg.entrance.y },
        x: ds.x, y: ds.y,
        exit: { x: ds.dg.exit.x, y: ds.dg.exit.y },
        mobs: ds.contents.mobs.filter((m) => !m.defeated)
          .map((m) => ({ x: m.x, y: m.y })),
        chests: ds.contents.chests.filter((c) => !c.opened).length,
        day: clock.day,
      };
    },
    actions: {
      givePoints: (n) => {
        hero.points += n;
        G.playerUI && G.playerUI.render();
      },
      // Показать анимацию Флогистона (idle|walk|attack|cast) на ms миллисекунд.
      playAnimation: (action, ms = 1000) => {
        if (!G.phlogistonFrames(action)) return false;
        animAction = action;
        animUntil = performance.now() + Math.max(0, ms | 0);
        return true;
      },
      // Отладочный бой на текущем тайле (не требует шага на группу).
      startCombat: (groupType = 0) => {
        if (G.combatUI && G.combatUI.isActive()) return null;
        return G.combatUI.startCombat({
          hero,
          tile: { mobGroup: groupType },
          prev: { x: player.x, y: player.y },
          seed: 42,
          day: clock.day,
          onEnd: () => {
            // Лут/опыт уже начислены в ядре (checkVictory).
            G.playerUI && G.playerUI.render();
          },
        });
      },
      // Подземелье из текущего тайла (не требует входа в пещеру).
      enterDungeon: (terrain) => {
        if (dungeonState) return null;
        const t = map.tileAt(player.x, player.y);
        const d = G.createDungeon(player.x, player.y, mapPixels,
          terrain != null ? terrain : t.terrain);
        dungeonState = {
          dg: d, contents: G.generateDungeonContents(d, hero),
          x: d.entrance.x, y: d.entrance.y,
          prevX: d.entrance.x, prevY: d.entrance.y,
          worldKey: player.x + ',' + player.y,
          log: [G.DUNGEON_NAMES[d.type] + ': вход.'],
        };
        G.dungeonUI.start({
          get state() { return dungeonState; },
          onMove: (dx, dy) => dungeonMove(dx, dy),
        });
        return dungeonState;
      },
      // Отладка времени: довести часы до дня n (день = отдых).
      setDay: (n) => {
        const target = Math.max(1, Math.floor(n));
        while (clock.day < target) clock.rest();
        return clock.day;
      },
      // Отдых: день проходит (восстановление, респауны).
      rest: () => clock.rest(),
      train: (skill) => {
        const r = G.raiseSkill(hero, skill);
        G.playerUI && G.playerUI.render();
        return r;
      },
      addXp: (n) => {
        const r = G.addXp(hero, n);
        G.playerUI && G.playerUI.render();
        return r;
      },
      // Выдать предмет из каталога (debug/смоук, задача 000009).
      giveItem: (id, qty) => {
        const r = G.addItem(hero, id, qty || 1);
        G.playerUI && G.playerUI.render();
        return r;
      },
    },
  };

  // --- Старт ---
  loadMapPixels().then((pixels) => {
    mapPixels = pixels; // сохранены: сид формы подземельей зависит от пикселя
    map = G.createMap(pixels);
    map.fromPng = pixels.fromPng;
    tileCache = G.createTileCache(map);
    findSpawn();
    cam.x = player.x + 0.5;
    cam.y = player.y + 0.5;
    maybeStartCombat(); // если спавн оказался на тайле с группой
    requestAnimationFrame(frame);
  });
})();

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
  const hero = G.createCharacter('Флогистон'); // персонаж (src/player.js)
  G.playerUI && G.playerUI.setCharacter(hero);
  const player = { x: 0, y: 0 };
  const prevPos = { x: 0, y: 0 }; // позиция до последнего шага (побег/смерть)
  let zoom = 14; // пикселей на тайл
  const cam = { x: 0.5, y: 0.5 };

  // Побеждённые группы мобов (респаун по дням — задача 000008).
  const defeatedTiles = new Set();
  let hudFlash = '';
  let hudFlashUntil = 0;

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
    // В бою клавиши обрабатывает combat-ui (своим слушателем).
    if (G.combatUI && G.combatUI.isActive()) return;
    if (KEY_DIRS[e.code]) {
      keys.add(e.code);
      e.preventDefault();
    }
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());
  canvas.addEventListener('wheel', (e) => {
    zoom = Math.max(4, Math.min(64, zoom * (e.deltaY < 0 ? 1.2 : 1 / 1.2)));
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
    if (defeatedTiles.has(key)) return;
    G.combatUI.startCombat({
      hero,
      tile: t,
      prev: { x: prevPos.x, y: prevPos.y },
      seed: G.hash2(player.x, player.y, 0x5eedc0de),
      onEnd: (res) => {
        if (res.outcome === 'victory') {
          defeatedTiles.add(key);
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

  function buildFrame() {
    const verts = quadVerts;
    verts.length = 0;

    const tilesX = Math.ceil(canvas.width / zoom) + 2;
    const tilesY = Math.ceil(canvas.height / zoom) + 2;
    const x0 = Math.floor(cam.x - tilesX / 2);
    const y0 = Math.floor(cam.y - tilesY / 2);

    for (let ty = y0; ty < y0 + tilesY; ty++) {
      for (let tx = x0; tx < x0 + tilesX; tx++) {
        const t = map.tileAt(tx, ty);
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

  function hudUpdate() {
    const t = map.tileAt(player.x, player.y);
    const d = G.derived(hero);
    const key = player.x + ',' + player.y;
    let line = 'Флогистон, ур. ' + hero.level + '  (' + player.x + ', ' + player.y + ')\n' +
      'HP ' + hero.hp + '/' + d.maxHP + '  |  Золото: ' + hero.gold + '  |  Очки: ' + hero.points + '\n' +
      'Местность: ' + G.TERRAIN_NAMES[t.terrain] + '\n' +
      'Масштаб: ' + zoom + 'px  |  карта: ' + map.width + 'x' + map.height +
      (map.fromPng ? ' (map.png)' : ' (пересчёт)') + '\n' +
      '[I] персонаж';
    if (t.hasBuilding) line += '\nЗдесь: ' + G.BUILDING_NAMES[t.building];
    else if (t.hasMobGroup) {
      line += defeatedTiles.has(key)
        ? '\nГруппа ' + G.MOB_GROUP_NAMES[t.mobGroup] + ' повержена.'
        : '\nОсторожно: ' + G.MOB_GROUP_NAMES[t.mobGroup] + '!';
    }
    if (performance.now() < hudFlashUntil) line += '\n' + hudFlash;
    hud.textContent = line;
  }

  // --- Цикл ---
  let lastMove = 0;
  function frame(now) {
    const inCombat = G.combatUI && G.combatUI.isActive();
    if (!inCombat && now - lastMove >= MOVE_INTERVAL_MS) {
      if (keys.size && tryMove()) {
        lastMove = now;
        maybeStartCombat();
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
        hero: {
          level: hero.level, xp: hero.xp, hp: hero.hp,
          gold: hero.gold, points: hero.points,
        },
        map: map ? { width: map.width, height: map.height, fromPng: map.fromPng } : null,
        keys: Array.from(keys),
      };
    },
    // Отладочные действия (смоук-тесты, ручная проверка баланса).
    // Текущий бой (для смоук-тестов и отладки).
    get combat() {
      return G.combatUI ? G.combatUI.current() : null;
    },
    actions: {
      givePoints: (n) => {
        hero.points += n;
        G.playerUI && G.playerUI.render();
      },
      // Отладочный бой на текущем тайле (не требует шага на группу).
      startCombat: (groupType = 0) => {
        if (G.combatUI && G.combatUI.isActive()) return null;
        return G.combatUI.startCombat({
          hero,
          tile: { mobGroup: groupType },
          prev: { x: player.x, y: player.y },
          seed: 42,
          onEnd: () => {
            // Лут/опыт уже начислены в ядре (checkVictory).
            G.playerUI && G.playerUI.render();
          },
        });
      },
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
    },
  };

  // --- Старт ---
  loadMapPixels().then((pixels) => {
    map = G.createMap(pixels);
    map.fromPng = pixels.fromPng;
    findSpawn();
    cam.x = player.x + 0.5;
    cam.y = player.y + 0.5;
    maybeStartCombat(); // если спавн оказался на тайле с группой
    requestAnimationFrame(frame);
  });
})();

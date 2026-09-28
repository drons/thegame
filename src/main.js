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

  // Кнопка полноэкранного режима (задача 000017): ядро — src/fullscreen.js
  // (тестируется в node), здесь только DOM-привязка. API недоступен —
  // кнопки нет, игра продолжает работать.
  if (G.createFullscreenController) {
    const fullscreen = G.createFullscreenController(document);
    if (fullscreen.supported) {
      const fsBtn = document.createElement('button');
      fsBtn.className = 'fs-btn';
      const fsLabel = () => {
        fsBtn.textContent = fullscreen.isFullscreen
          ? '⛶ выйти из полного экрана'
          : '⛶ полный экран';
      };
      fsLabel();
      fullscreen.onChange(fsLabel); // подписка/выход по Esc — иконка следит
      fsBtn.addEventListener('click', () => fullscreen.toggle());
      document.body.appendChild(fsBtn);
    }
  }

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

  // Орто-матрица WebGL-слоя (задача 000061) — из src/map.js
  // (G.orthoMatrix): ТО ЖЕ мир→экран, что и спрайт-слой
  // (G.worldToScreen) — y растёт вниз, юг НИЖЕ центра экрана.
  // Fallback на случай устаревшего map.js — Т Е Ж Е знаки
  // (NDC +y = верх экрана, поэтому y-строка отрицательная):
  // «чинить» знак здесь нельзя — слои разъедутся зеркально.
  function legacyOrtho(z, cx, cy, viewW, viewH) {
    const halfW = viewW / (2 * z);
    const halfH = viewH / (2 * z);
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
  // NPC (задача 000010): каталог — зеркало src/npc-data.js
  // (source of truth — assets/npc), журнал квестов — один на сессию.
  const NPCS = (G.NpcData && G.NpcData.NPCS) || [];
  const questBook = G.createQuestBook ? G.createQuestBook() : null;
  // Стоки торговцев NPC (задача 000029): npcId → { itemId: qty }.
  // Создаются лениво при первом диалоге, переживают перезагрузку
  // страницы через общий сейв (раньше сток сбрасывался сессией).
  const npcStocks = {};
  function npcShopFor(npcId) {
    const npc = G.npcById(NPCS, npcId);
    if (!npc) return null;
    if (!npcStocks[npcId]) {
      const shop = G.createNpcShop(npc);
      if (!shop) return null; // NPC не торгует
      npcStocks[npcId] = shop.stock;
    }
    return { npc, stock: npcStocks[npcId] };
  }
  const player = { x: 0, y: 0 };
  const prevPos = { x: 0, y: 0 }; // позиция до последнего шага (побег/смерть)
  let zoom = G.ZOOM_START; // пикселей на тайл (детальный старт, 000019)
  const cam = { x: 0.5, y: 0.5 };

  // Плавное передвижение (задача 000033): чистое ядро — src/motion.js.
  // «Мувёр» интерполирует ЦЕЛЫЕ player.x/y в ДРОБНУЮ позицию на время
  // глейда prev→next; оба слоя рендера (WebGL-ромб и спрайт) рисуют
  // ОДНУ и ту же точку renderPos, а не центр целого тайла (иначе при
  // WebGL-фолбэке персонаж снова «прыгал»). Телепорт-снапы — в 4 местах:
  // старт (спавн/сейв), восстановление сейва, побег/смерть из боя.
  const mover = G.createMover
    ? G.createMover({ x: player.x, y: player.y,
        intervalMs: MOVE_INTERVAL_MS })
    : null;
  function renderPos(now) {
    if (mover) {
      const p = mover.position(now);
      return { x: p.x, y: p.y };
    }
    return { x: player.x, y: player.y };
  }

  // Игровое время (SPEC.md «Игровое время», src/day.js).
  const clock = G.createClock();
  // Побеждённые группы: 'x,y' → день поражения (респаун через respawn_days).
  const defeatedAt = new Map();

  // --- Сохранение (задача 000031; механизм — src/save.js) ---
  // Состояние мира и игрока — в localStorage. Версия структур данных
  // (save.version) записывается вместе с данными; старые версии
  // доводятся до версии кода последовательными миграциями N→N+1.
  //   * migration_failed — данные восстановить невозможно: сообщение
  //     пользователю, обнуление ТОЛЬКО после его согласия;
  //   * corrupt (битый JSON/оболочка) — восстанавливать нечего:
  //     тихий сброс с console.warn (принцип задачи 000029).
  let saveStorage = null;
  try { saveStorage = window.localStorage; } catch (err) { saveStorage = null; }
  let loadedSave = null; // { version, savedAt, data } — после load()
  // Примечание (000031): во время restoreFromSave saveNow вызываться не
  // может — fastForward не оповещает слушателей, addStep ограничен до
  // порога дня (день не сменится), остальное восстановление чисто;
  // отдельный флаг подавления записи (был `restoring`) поэтому не нужен.
  if (saveStorage && G.load) {
    const res = G.load(saveStorage);
    if (res.status === 'ok') {
      loadedSave = res.save;
    } else if (res.status === 'migration_failed') {
      console.warn('Не удалось мигрировать сейв (версия ' + res.version + '):',
        res.error);
      if (window.confirm('Сейв игры не удалось перенести в новый формат ' +
        'данных: восстановить его невозможно.\nОбнулить сохранение?')) {
        G.clear(saveStorage);
      }
    } else if (res.status === 'corrupt') {
      console.warn('Некорректный сейв — сбрасываю:', res.error);
      G.clear(saveStorage);
    }
  }

  // Текущее состояние (структура v1): день мира, позиция, персонаж,
  // журнал квестов, стоки торговцев NPC (задача 000029), побеждённые
  // группы мобов (000031) — доп. поля БЕЗ повышения версии
  // (неломкое расширение).
  function collectSaveData() {
    return {
      day: clock.day,
      steps: clock.steps,
      position: { x: player.x, y: player.y },
      hero,
      quests: questBook && G.serializeQuestBook
        ? G.serializeQuestBook(questBook) : null,
      npcStocks: G.serializeNpcStocks
        ? G.serializeNpcStocks(npcStocks) : null,
      // 'x,y' → день поражения: после перезагрузки побеждённые группы
      // НЕ оживают мгновенно, а респаунятся через respawn_days (SPEC
      // «Игровое время») — иначе награду той же группы можно забрать
      // повторно в тот же день.
      defeatedAt: G.serializeDefeatedAt
        ? G.serializeDefeatedAt(defeatedAt) : {},
    };
  }

  function saveNow() {
    if (saveStorage && G.save) G.save(saveStorage, collectSaveData());
  }
  window.addEventListener('beforeunload', saveNow);

  // Верхняя граница дня в сейве (защита от подделанного сейва).
  // Восстановление дня — O(1) (clock.fastForward, без слушателей),
  // так что граница — не от заморозки, а от абсурда; день > границы
  // клампится (раньше день > 100000 молча сбрасывался на 1, и
  // pruneQuestBookByDay(qb, 1) отбрасывал ВСЕ активные квесты —
  // потеря прогресса легитимного сейва).
  const MAX_SAVED_DAY = 1e9;

  // Восстановление состояния из сейва после загрузки карты:
  // день мира (fastForward — сейв СНИМОК, эффекты прошедших дней уже
  // в данных), персонаж, побеждённые группы, позиция, журнал квестов,
  // стоки торговцев. Некорректное поле — отброс с console.warn
  // (игра не роняется: каждый раздел — свой try/catch, и финальный
  // render панели тоже в try/catch).
  function restoreFromSave() {
    if (!loadedSave) return;
    const d = loadedSave.data || {};

    // --- День мира и шаги ---
    try {
      if (Number.isInteger(d.day) && d.day >= 1) {
        const target = Math.min(d.day, MAX_SAVED_DAY);
        if (target > clock.day) clock.fastForward(target - clock.day);
        // Шаги сохранённого дня — восстанавливаем ВСЕГДА, включая
        // день 1 (раньше блок был вложен в условие d.day > clock.day,
        // и сейв {day:1, steps:35} восставал со steps=0).
        if (Number.isInteger(d.steps) && d.steps >= 0 &&
            d.steps < clock.stepsPerDay) {
          clock.addStep(d.steps);
        }
      }
    } catch (err) {
      console.warn('Сейв: не удалось восстановить день:', err);
    }

    // --- Персонаж ---
    try {
      if (d.hero != null) {
        // Чистка — G.sanitizeSavedHero (player.js): ядро (level/xp/gold/
        // hp/основные навыки) невалидно → null; вторичные навыки/skillXp —
        // посчётный отброс мусора. Инвентарь и снаряжение чистим отдельно
        // (нужен каталог): «призрак»-предметы (id удалён из каталога
        // между сборками) отбрасываются, а не бросают TypeError в
        // inventoryWeight при рендере панели.
        const clean = G.sanitizeSavedHero ? G.sanitizeSavedHero(d.hero) : null;
        if (clean) {
          Object.assign(hero, clean);
          hero.inventory = G.sanitizeInventory
            ? G.sanitizeInventory(d.hero.inventory) : G.createInventory();
          hero.equipment = G.sanitizeEquipment
            ? G.sanitizeEquipment(d.hero.equipment) : { weapon: null, armor: null };
          // Книга заклинаний (задача 000045): новое ОПЦИОНАЛЬНОЕ поле
          // сейва (без повышения версии, 000031) — старым сейвам поля
          // нет → []; подделанные id/дубли чистятся по каталогу.
          // Иначе книга молча теряется при перезагрузке (data loss).
          hero.spells = G.sanitizeSpellBook
            ? G.sanitizeSpellBook(d.hero.spells) : [];
          const dd = G.derived(hero);
          hero.hp = Math.min(Math.max(1, Math.round(hero.hp)), dd.maxHP);
          hero.mp = Math.min(Math.max(0, Math.round(hero.mp) || 0), dd.maxMP);
          hero.alive = true;
        } else {
          console.warn('Сейв: персонаж некорректен — не восстанавливаю.');
        }
      }
    } catch (err) {
      console.warn('Сейв: не удалось восстановить персонажа:', err);
    }

    // --- Побеждённые группы (defeatedAt) ---
    try {
      if (G.restoreDefeatedAt && d.defeatedAt != null) {
        const m = G.restoreDefeatedAt(d.defeatedAt);
        for (const [k, dd] of m) {
          // Подделанный сейв: «поражение в будущем» дня не допустим.
          if (dd > clock.day) m.delete(k);
        }
        defeatedAt.clear();
        for (const [k, v] of m) defeatedAt.set(k, v);
      }
    } catch (err) {
      console.warn('Сейв: не удалось восстановить побеждённые группы:', err);
    }

    // --- Позиция ---
    try {
      const p = d.position;
      if (p && Number.isInteger(p.x) && Number.isInteger(p.y)) {
        if (map.tileAt(p.x, p.y).passable) {
          player.x = p.x; player.y = p.y;
        } else {
          console.warn('Сейв: позиция непроходима — остаюсь на спавне.');
        }
      }
    } catch (err) {
      console.warn('Сейв: не удалось восстановить позицию:', err);
    }
    prevPos.x = player.x; prevPos.y = player.y;
    if (mover) mover.teleport(player.x, player.y); // снап (000033):
    // после восстановления сейва персонаж НЕ «скользит» от точки
    // создания мувера до позиции сейва.

    // --- Журнал квестов и стоки торговцев (задача 000029) ---
    // Невалидная секция — тихий сброс с console.warn; игра не роняется.
    try {
      if (questBook && G.deserializeQuestBook && d.quests != null) {
        const qb = G.deserializeQuestBook(d.quests);
        if (!qb) {
          console.warn('Сейв: журнал квестов некорректен — сбрасываю.');
        } else {
          // День мира уже восстановлен выше — сверяем метки выдачи.
          const pruned = G.pruneQuestBookByDay
            ? G.pruneQuestBookByDay(qb, clock.day)
            : { book: qb, dropped: [] };
          if (pruned.dropped.length) {
            console.warn('Сейв: квесты, выданные позже дня мира (' +
              clock.day + '), исключены: ' + pruned.dropped.join(', '));
          }
          questBook.active = pruned.book.active;
          questBook.done = pruned.book.done;
        }
      }
      if (G.restoreNpcStocks && d.npcStocks != null) {
        const restored = G.restoreNpcStocks(NPCS, d.npcStocks);
        for (const k of Object.keys(npcStocks)) delete npcStocks[k];
        Object.assign(npcStocks, restored);
      }
    } catch (err) {
      console.warn('Сейв: не удалось восстановить квесты/стоки:', err);
    }

    if (G.playerUI) {
      try { G.playerUI.render(); }
      catch (err) { console.warn('Сейв: не удалось отрисовать панель:', err); }
    }
  }
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
    saveNow();
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
  // Маппинг клавиш→направление — в src/controls.js (чистые функции):
  // сначала e.code (физические стрелки/WASD — в русской раскладке это и
  // есть ЦФЫВ), затем e.key по символу (ц/ф/ы/в) — фолбэк для
  // виртуальных клавиатур. keys хранит id клавиш перемещения в порядке
  // нажатий (Set): две клавиши одного направления — два id, движение
  // продолжается, пока удержана хотя бы одна.
  const keys = new Set();
  const moveKey = (e) => G.moveKeyForEvent(e);

  // Действие [E] (задача 000010): диалог NPC / повторное нажатие —
  // закрыть. Вызывается и с клавиатуры, и с on-screen-кнопки «E»
  // тач-варианта контролов (задача 000018).
  function toggleNpcDialog() {
    if (!G.npcUI) return;
    if (G.combatUI && G.combatUI.isActive()) return;
    if (G.dungeonUI && G.dungeonUI.isActive()) return;
    if (G.npcUI.isActive()) { // повторно — закрыть диалог
      G.npcUI.close();
      return;
    }
    // На тайле постройки с NPC — открываем диалог.
    if (map) {
      const t = map.tileAt(player.x, player.y);
      if (t.hasBuilding) {
        const b = G.buildingForMapIndex(t.building);
        const npc = b && G.npcForBuilding(NPCS, b.id);
        if (npc) {
          G.npcUI.open({
            npc,
            character: hero,
            book: questBook,
            tile: { x: player.x, y: player.y,
              building: t.building, buildingWealth: t.buildingWealth },
            // Сток общий на сессию + сейв при изменениях (000029).
            shop: npcShopFor(npc.id),
            onChange: saveNow,
            day: clock.day,
          });
        }
      }
    }
  }

  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyI' && G.playerUI) { // I (Ш) — панель персонажа
      G.playerUI.toggle();
      return;
    }
    if (e.code === 'KeyE' && G.npcUI) { // E (У) — диалог NPC
      toggleNpcDialog();
      return;
    }
    // В бою клавиши обрабатывает combat-ui (единая таблица
    // src/combat-keys.js, задача 000048), в подземелье — dungeon-ui,
    // в диалоге NPC — npcUI. Конфликтов с боевой таблицей нет: этот
    // return стоит ДО движения мира и прочих действий; KeyA в бою —
    // движение (как в мире), KeyE — «быстрый предмет» (toggleNpcDialog
    // выше сам гасится активным боем).
    // Наблюдение (вне 000048): KeyI выше этого return — в бою Ш
    // переключает панель персонажа поверх оверлея.
    if (G.combatUI && G.combatUI.isActive()) return;
    if (G.dungeonUI && G.dungeonUI.isActive()) return;
    if (G.npcUI && G.npcUI.isActive()) return;
    const k = moveKey(e);
    if (k) {
      keys.add(k);
      e.preventDefault();
    }
  });
  window.addEventListener('keyup', (e) => {
    const k = moveKey(e);
    if (k) keys.delete(k);
  });
  window.addEventListener('blur', () => {
    keys.clear();
    if (G.touchControls) G.touchControls.releaseAll();
  });

  // --- Тач-вариант контролов (задача 000018) ---
  // Чистая часть — в src/controls.js (тестируется в node): детект
  // устройства по СНИМКУ окружения, выбор схемы, раскладка и хит-тест.
  // On-screen-контролы (D-pad + кнопка «E») — в src/ui.js.
  // Схема: 'touch' на тач-устройстве, иначе 'keyboard'; вариант можно
  // переопределить параметром URL ?controls=touch|keyboard (для теста
  // на десктопе и наоборот).
  function touchEnvSnapshot() {
    const nav = globalThis.navigator || {};
    let coarse = false;
    try {
      coarse = typeof globalThis.matchMedia === 'function'
        && globalThis.matchMedia('(pointer: coarse)').matches;
    } catch (err) { /* нет matchMedia — false */ }
    return {
      maxTouchPoints: Number.isFinite(nav.maxTouchPoints) ? nav.maxTouchPoints : 0,
      touchEvents: 'ontouchstart' in window,
      coarsePointer: coarse,
    };
  }
  const mControls = /[?&]controls=(touch|keyboard)(?:&|$)/
    .exec(window.location.search || '');
  const controlsScheme = G.chooseControlsScheme(
    touchEnvSnapshot(), mControls ? mControls[1] : null);
  if (controlsScheme === 'touch') {
    if (G.touchControls) {
      G.touchControls.init({
        // Виртуальные «клавиши» 'touch:<dir>' ложатся в тот же Set,
        // что и настоящие: кадр вызывает tryMove → G.deltaForMoveKey.
        onHold: (dir) => keys.add('touch:' + dir),
        onRelease: (dir) => keys.delete('touch:' + dir),
        onInteract: toggleNpcDialog,
      });
      G.touchControls.show();
    } else {
      // Game.touchControls собирается в ui.js при ЗАГРУЗКЕ — если его
      // нет, controls.js загрузился позже (регрессия порядка — tests/
      // index-order.test.js). На чистом тачскрине без этого у игрока
      // не будет НИКАКОГО управления, поэтому — console.error.
      console.error('main.js: схема контролов touch, но Game.touchControls ' +
        'отсутствует — проверьте порядок загрузки: src/controls.js ДО src/ui.js');
    }
  }

  canvas.addEventListener('wheel', (e) => {
    zoom = Math.max(G.ZOOM_MIN, Math.min(G.ZOOM_MAX, zoom * (e.deltaY < 0 ? 1.2 : 1 / 1.2)));
    e.preventDefault();
  }, { passive: false });

  function tryMove() {
    for (const k of keys) { // порядок в Set = порядок нажатий
      const [dx, dy] = G.deltaForMoveKey(k);
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
      // Фон поля боя по типу местности (задача 000049): terrain тайла,
      // где начался бой. spriteLoader может быть null (нет s2/лоадера) —
      // combat-ui терпит: сплошной фолбэк-фон.
      terrain: t.terrain,
      spriteLoader,
      prev: { x: prevPos.x, y: prevPos.y },
      seed: G.hash2(player.x, player.y, 0x5eedc0de),
      day: clock.day,
      onEnd: (res) => {
        if (res.outcome === 'victory') {
          defeatedAt.set(key, clock.day);
          let flash = `Победа! +${res.xp} опыта, +${res.gold} золота.`;
          // Квесты: kill_group отслеживается по ТИПУ группы (задача 000010).
          if (questBook && G.notifyGroupDefeated) {
            const ready = G.notifyGroupDefeated(NPCS, questBook, t.mobGroup);
            if (ready.length) {
              flash += ' Квест готов к сдаче: ' + ready.map((qid) => {
                const inst = questBook.active[qid];
                const def = inst ? G.questDef(NPCS, inst.npcId, qid) : null;
                return (def && def.название) || qid;
              }).join(', ');
            }
          }
          hudFlash = flash;
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
          // Снап (000033): иначе спрайт будет скользить обратно через
          // поле боя.
          if (mover) mover.teleport(player.x, player.y);
        }
        G.playerUI && G.playerUI.render();
        hudFlashUntil = performance.now() + 5000;
        saveNow();
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
      // Фон поля боя по типу подземелья (задача 000049): тайла мира в
      // подземелье нет, тип — DUNGEON_TYPES (ds.dg.type).
      dungeonType: ds.dg.type,
      spriteLoader,
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
        saveNow();
      },
    });
  }

  function exitDungeon() {
    const ds = dungeonState;
    dungeonMemory.set(ds.worldKey, { contents: ds.contents, lastVisitDay: clock.day });
    clock.event('dungeon'); // вылазка забирает день (SPEC «Игровое время»)
    dungeonState = null;
    G.dungeonUI.close();
    saveNow();
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
  let lastCamNow = 0; // timestamp предыдущего кадра (dt; 0 — ещё не было)
  function updateCamera(now) {
    // Плавное следование за игроком. Задача 000033: раньше коэффициент
    // 0.2 применялся НА КАДР — при 144 Гц камера ловила цель в ~2.4 раза
    // быстрее, чем при 60. Теперь — экспоненциальное сглаживание с dt
    // (G.cameraStep, CAM_TAU_MS ≈ 74.7 мс): при 60 fps тот же ≈ 0.2/кадр
    // (ощущение не меняется), при любом другом fps — то же движение за
    // то же РЕАЛЬНОЕ время. Первый кадр — dt = 0 (без движения).
    const dt = lastCamNow ? now - lastCamNow : 0;
    lastCamNow = now;
    const tx = player.x + 0.5, ty = player.y + 0.5;
    if (G.cameraStep) {
      cam.x = G.cameraStep(cam.x, tx, dt, G.CAM_TAU_MS);
      cam.y = G.cameraStep(cam.y, ty, dt, G.CAM_TAU_MS);
    } else {
      cam.x += (tx - cam.x) * 0.2; // fallback, если motion.js не загрузился
      cam.y += (ty - cam.y) * 0.2;
    }
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

  function buildFrame(rp) {
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

    // Флогистон: светящийся ромб в ТЕКУЩЕЙ позиции (задача 000033).
    // rp — ДРОБНАЯ точка рендера (глейд prev→next), одна для обоих
    // слоёв; +0.5 — центр тайла.
    const px = rp.x + 0.5, py = rp.y + 0.5, s = 0.28;
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
  // Мировые координаты → экран — через G.worldToScreen (src/map.js,
  // задача 000061): единый источник проекции для ОБОИХ слоёв
  // (WebGL-матрица G.orthoMatrix рисует то же) — y растёт ВНИЗ,
  // южный тайл НИЖЕ центра экрана (до фикса спрайт-слой зеркалил ось
  // y, и «вниз» двигало вверх).
  // Если ни один ассет не загрузился — выходим без рисования,
  // под слоем остаются цветные тайлы/маркеры WebGL (фолбэк).
  function drawSprites(now, rp) {
    if (!s2 || !spriteLoader) return;
    const w = spriteCanvas.width, h = spriteCanvas.height;
    s2.clearRect(0, 0, w, h);
    if (spriteLoader.readyCount() === 0) return;
    const toPt = G.worldToScreen
      ? (tx, ty) => G.worldToScreen(tx, ty, cam.x, cam.y, zoom, w, h)
      // fallback (устаревший map.js): та же формула, y-вниз.
      : (tx, ty) => ({
          x: w / 2 + (tx - cam.x) * zoom,
          y: h / 2 + (ty - cam.y) * zoom,
        });
    // Декорации тайлов (задача 000039): порог зума вычисляется один раз
    // на кадр — при малом зуме видимых тайлов explode и по-тайловый
    // проход дорог. typeof-гард: старый sprites.js без tileVisuals —
    // слой просто выключен (игра деградирует до вида 000021-минус-рендер).
    const showVisuals = typeof G.tileVisuals === 'function'
      && zoom >= (G.VISUALS_MIN_ZOOM || 0);

    // Тайлы: текстура (вода/глубокая вода — кадр анимации по чистому
    // селектору frameIndex(время, координаты, число кадров)).
    for (const t of frameTiles) {
      const p = toPt(t.x, t.y);
      const sx = p.x, sy = p.y;
      const frames = G.tileFrames(t.terrain);
      if (frames.length) {
        const idx = frames.length > 1 ? G.frameIndex(now, t.x, t.y, frames.length) : 0;
        const img = spriteLoader.image(frames[idx]);
        if (img) s2.drawImage(img, sx, sy, zoom, zoom);
      }
      // Декорации тайла (задача 000039) — поверх текстуры тайла, ДО
      // иконки постройки/моба: проход ВНУТРИ цикла по frameTiles
      // (отдельный проход после цикла рисовал бы декорации поверх
      // построек, мобов и Флогистона). Не загрузившийся спрайт —
      // элемент пропускается (isReady false), слой не падает.
      if (showVisuals) {
        for (const e of G.tileVisuals(t.x, t.y, t.terrain)) {
          if (!spriteLoader.isReady(e.sprite)) continue;
          const r = G.visualDrawRect(e, sx, sy, zoom);
          s2.drawImage(spriteLoader.image(e.sprite),
            r.x, r.y, r.size, r.size);
        }
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
        // Та же ДРОБНАЯ точка, что и WebGL-ромб (задача 000033):
        // фолбэк-слой и спрайт не должны расходиться.
        const pp = toPt(rp.x + 0.5, rp.y + 0.5);
        const px = pp.x, py = pp.y;
        s2.drawImage(pi, px - size / 2, py - size / 2, size, size);
      }
    }
  }

  function hudUpdate() {
    const t = map.tileAt(player.x, player.y);
    const d = G.derived(hero);
    const key = player.x + ',' + player.y;
    // NPC постройки текущего тайла (задача 000010) — подсказка [E].
    const bHere = t.hasBuilding ? G.buildingForMapIndex(t.building) : null;
    const npcHere = bHere && G.npcForBuilding ? G.npcForBuilding(NPCS, bHere.id) : null;
    let line = 'Флогистон, ур. ' + hero.level + '  (' + player.x + ', ' + player.y + ')\n' +
      'HP ' + hero.hp + '/' + d.maxHP + '  |  Золото: ' + hero.gold + '  |  Очки: ' + hero.points + '\n' +
      'Местность: ' + G.TERRAIN_NAMES[t.terrain] + '\n' +
      'День: ' + clock.day + '  |  Масштаб: ' + zoom + 'px  |  карта: ' + map.width + 'x' + map.height +
      (map.fromPng ? ' (map.png)' : ' (пересчёт)') +
      (spriteLoader ? '  |  графика: ' + spriteLoader.readyCount() + '/' + spriteLoader.totalCount() : '') + '\n' +
      '[I] персонаж' + (npcHere ? '  |  [E] диалог' : '');
    if (dungeonState) {
      const ds = dungeonState;
      const dist = Math.abs(ds.x - ds.dg.exit.x) + Math.abs(ds.y - ds.dg.exit.y);
      line += '\n--- ' + G.DUNGEON_NAMES[ds.dg.type] + ' (' + ds.x + ', ' + ds.y + ') ---' +
        '\nДо выхода: ~' + dist + ' клеток  |  ' +
        (ds.contents.mobs.filter((m) => !m.defeated).length) + ' групп(ы)';
    } else if (t.hasBuilding) {
      const shopHint = G.shopKindsFor(t.building) ? '  (торговля — панель [I])' : '';
      const npcHint = npcHere ? '  ([E] ' + npcHere.имя + ')' : '';
      line += '\nЗдесь: ' + G.BUILDING_NAMES[t.building] + shopHint + npcHint +
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
    const inNpc = G.npcUI && G.npcUI.isActive();
    // Интервал шага с учётом «Ловкого шага» (задача 000033; SPEC:
    // Ловкость → «Скорость перемещения по карте»): чем выше навык, тем
    // короче шаг; нижний кламп — G.MIN_MOVE_INTERVAL_MS. Без навыка
    // (moveSpeedMult = 1) — базовые 140 мс, как раньше.
    const stepMs = G.moveIntervalMs
      ? G.moveIntervalMs(MOVE_INTERVAL_MS,
        (G.derived(hero) || {}).moveSpeedMult)
      : MOVE_INTERVAL_MS;
    if (!inCombat && !inDungeon && !inNpc && now - lastMove >= stepMs) {
      if (keys.size && tryMove()) {
        lastMove = now;
        // Глейд prev→next (задача 000033): рендер скользит между тайлами
        // за время шага, а не прыгает. interval — на шаг (динамическая
        // скорость).
        if (mover) mover.step({ x: prevPos.x, y: prevPos.y },
          { x: player.x, y: player.y }, now, stepMs);
        lastStepAt = now; // Флогистон переключается на анимацию ходьбы
        clock.addStep(1); // шаги мира тикают игровой день
        maybeStartCombat();
        maybeEnterDungeon();
        saveNow();
      }
    }
    updateCamera(now);
    // Одна точка рендера на кадр для обоих слоёв (задача 000033).
    const rp = renderPos(now);

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.06, 0.08, 0.10, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // WebGL-слой — через G.orthoMatrix (map.js, задача 000061);
    // fallback — legacyOrtho с теми же знаками (см. выше).
    gl.uniformMatrix4fv(uProj, false,
      G.orthoMatrix
        ? G.orthoMatrix(zoom, cam.x, cam.y, canvas.width, canvas.height)
        : legacyOrtho(zoom, cam.x, cam.y, canvas.width, canvas.height));
    const verts = buildFrame(rp);
    gl.drawArrays(gl.TRIANGLES, 0, verts.length / 6);

    // Слой спрайтов поверх тайлов (пустой, пока ассеты не загрузились).
    if (spriteCanvas) {
      spriteCanvas.width = window.innerWidth;
      spriteCanvas.height = window.innerHeight;
    }
    drawSprites(now, rp);

    hudUpdate();
    requestAnimationFrame(frame);
  }

  // Отладочный крючок (используется смоук-тестами и ручной проверкой).
  globalThis.__game = {
    get state() {
      return {
        player: { x: player.x, y: player.y },
        // ДРОБНАЯ позиция рендера (задача 000033): между шагами может
        // не совпадать с player — для ручной/смоук-проверки плавности.
        playerRender: renderPos(performance.now()),
        cam: { x: cam.x, y: cam.y },
        zoom,
        day: clock.day,
        stepsToday: clock.steps,
        save: loadedSave
          ? { version: loadedSave.version, savedAt: loadedSave.savedAt }
          : null,
        hero: {
          level: hero.level, xp: hero.xp, hp: hero.hp,
          gold: hero.gold, points: hero.points,
          weight: G.inventoryWeight(hero),
          maxWeight: G.maxCarryWeight(hero),
          inventory: (hero.inventory || { slots: [] }).slots,
        },
        map: map ? { width: map.width, height: map.height, fromPng: map.fromPng } : null,
        npcs: NPCS.map((n) => n.id),
        sprites: spriteLoader
          ? { ready: spriteLoader.readyCount(), total: spriteLoader.totalCount() }
          : null,
        keys: Array.from(keys),
        controls: controlsScheme, // 'touch' | 'keyboard' (задача 000018)
      };
    },
    // Журнал квестов (задача 000010): active — инстансы, done — ids.
    get quests() {
      return questBook
        ? { active: Object.values(questBook.active), done: questBook.done }
        : null;
    },
    // Стоки торговцев NPC (задача 000029): npcId → { itemId: qty }.
    get npcStocks() {
      return Object.assign({}, npcStocks);
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
          // Бой «на текущем тайле»: передаём terrain реального тайла
          // (задача 000049) — согласованно с боем мира; без карты
          // фолбэк plain.svg.
          terrain: map ? map.tileAt(player.x, player.y).terrain : undefined,
          spriteLoader,
          prev: { x: player.x, y: player.y },
          seed: 42,
          day: clock.day,
          onEnd: (res) => {
            // Лут/опыт уже начислены в ядре (checkVictory).
            // Квесты: kill_group (задача 000010).
            if (res && res.outcome === 'victory' && questBook && G.notifyGroupDefeated) {
              G.notifyGroupDefeated(NPCS, questBook, groupType);
            }
            G.playerUI && G.playerUI.render();
          },
        });
      },
      // Открыть диалог NPC текущего тайла (задача 000010, смоук-тесты).
      openNpc: () => {
        if (!G.npcUI || !map) return false;
        if (G.npcUI.isActive()) return true;
        const t = map.tileAt(player.x, player.y);
        if (!t.hasBuilding) return false;
        const b = G.buildingForMapIndex(t.building);
        const npc = b && G.npcForBuilding(NPCS, b.id);
        if (!npc) return false;
        G.npcUI.open({
          npc,
          character: hero,
          book: questBook,
          tile: { x: player.x, y: player.y,
            building: t.building, buildingWealth: t.buildingWealth },
          shop: npcShopFor(npc.id),
          onChange: saveNow,
          day: clock.day,
        });
        return G.npcUI.isActive();
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
    restoreFromSave(); // день мира, персонаж, позиция (задача 000031)
    // Снап мувера (задача 000033): старт — спавн или позиция сейва.
    // Иначе персонаж «проскользит» от точки создания мувера (0,0) до
    // спавна.
    if (mover) mover.teleport(player.x, player.y);
    cam.x = player.x + 0.5;
    cam.y = player.y + 0.5;
    maybeStartCombat(); // если спавн оказался на тайле с группой
    requestAnimationFrame(frame);
  });
})();

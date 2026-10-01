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
  // Цвета тайлов — из единой таблицы террейнов (map.js, TERRAIN_DATA,
  // поле rgb; задача 000056): единый источник, собственных копий нет.
  const TILE_COLORS = {};
  for (const k of Object.keys(G.TERRAIN_DATA)) {
    TILE_COLORS[Number(k)] = G.TERRAIN_DATA[Number(k)].rgb;
  }
  const BUILDING_COLOR = [0.98, 0.83, 0.30]; // золотой маркер
  const MOB_COLOR = [0.85, 0.30, 0.25];      // красный маркер
  const PLAYER_COLOR = [0.55, 0.95, 1.0];    // светящийся Флогистон
  // Базовый интервал шага по глобальной карте (задача 000063) — из
  // глобальных настроек (единый источник, паттерн 000020): 140 * 3 =
  // 420 мс, базовая скорость передвижения уменьшена в три раза.
  // Настроек нет (файл не загрузился) — старое поведение, 140 мс
  // (деградация, паттерн 000033 с G.createMover).
  const gs = G.GlobalSettings && G.GlobalSettings.SETTINGS;
  const MOVE_INTERVAL_MS = (gs && Number.isFinite(gs.move_interval_ms)
    && gs.move_interval_ms > 0)
    ? gs.move_interval_ms
    : 140;

  // Текущий интервал шага с учётом «Ловкого шага» (задача 000033;
  // SPEC: Ловкость → «Скорость перемещения по карте»): база — из
  // глобальных настроек (задача 000063), чем выше навык, тем короче
  // шаг; нижний кламп — G.MIN_MOVE_INTERVAL_MS. Без навыка
  // (moveSpeedMult = 1) — базовый интервал. Один источник для цикла
  // шагов и окна анимации walk/idle (drawSprites).
  function stepIntervalMs() {
    return G.moveIntervalMs
      ? G.moveIntervalMs(MOVE_INTERVAL_MS,
        (G.derived(hero) || {}).moveSpeedMult)
      : MOVE_INTERVAL_MS;
  }

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
  // Журнал квестов (000100): read-only зеркало во вкладке «Квесты»
  // панели персонажа. ВАЖНО: проводка ПОСЛЕ `const clock` (TDZ:
  // clock.day читаем только здесь); NPCS/questBook объявлены выше.
  // Журнал мутируется in place (restore) — re-wiring не нужен,
  // панель перерисовывает render() в зоне восстановления сейва.
  G.playerUI && G.playerUI.setQuests
    && G.playerUI.setQuests({ npcs: NPCS, book: questBook, day: clock.day });
  // Побеждённые группы: 'x,y' → день поражения (респаун через respawn_days).
  const defeatedAt = new Map();
  // Состояние эффектов построек (задача 000072): «раз в день» по
  // ЭФФЕКТУ — ключ 'x,y:effectId' → день применения (счёт на эффект,
  // не на здание) — и временные благословения { source: 'x,y', day,
  // kind: 'damage'|'armor' } с АБСОЛЮТНЫМИ днями (сейв — СНИМОК,
  // fastForward без слушателей, 000031).
  const buildingOncePerDay = new Map();
  const buffs = [];
  // Телепорт-круг (задача 000075): 'x,y' круга → { pair: 'px,py'|null,
  // dest: 'dx,dy'|null, active: boolean } — раздел сейва `teleports`
  // (имя зафиксировано 000072). СКАН пары — только при ПЕРВОМ подходе
  // (openBuildingUI, не в кадре); повторного скана НЕТ (кэш в сейве).
  const teleports = new Map();
  // Задача 000076: модификаторы активных благословений на текущий
  // день (day.js buffMods, 000072) — для точек создания боя:
  // благословение действует во ВСЕХ боях дня (мир/подземелье/
  // отладочный). day.js отсутствует — undefined (ядро боя —
  // нейтральный дефолт, fail-open).
  function currentBuffMods() {
    return G.buffMods ? G.buffMods(buffs, clock.day) : undefined;
  }

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
      // Задача 000072: эффекты построек — «раз в день» по эффекту
      // ('x,y:effectId' → день применения) и активные благословения
      // (абсолютные дни). Неломкое расширение v1 (000031): версию НЕ
      // поднимаем, миграций нет.
      buildingOncePerDay: G.serializeDayMap
        ? G.serializeDayMap(buildingOncePerDay) : {},
      buffs: G.serializeBuffs ? G.serializeBuffs(buffs) : [],
      // Задача 000075: телепорт-круги — пары/цели/активация.
      // Неломкое расширение v1 (000031): версию НЕ поднимаем.
      teleports: (G.buildingEffects && G.buildingEffects.serializeTeleports)
        ? G.buildingEffects.serializeTeleports(teleports) : {},
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
          // 000046: правка 000045 — санитайзер живёт в Game.Spells
          // (именованное пространство), а G — снимок корня Game:
          // G.sanitizeSpellBook всегда был undefined, и книга
          // заклинаний молча сбрасывалась в [] при КАЖДОЙ перезагрузке
          // (data loss, которую 000045 как раз исключало).
          hero.spells = (G.Spells && G.Spells.sanitizeSpellBook)
            ? G.Spells.sanitizeSpellBook(d.hero.spells) : [];
          // Крафт (задача 000046): новые ОПЦИОНАЛЬНЫЕ поля сейва
          // (без повышения версии, 000031) — старым сейвам полей нет →
          // дефолты; подделанные значения чистятся санитизерами
          // (craft.js / items.js). Иначе прогресс крафта и бонусы
          // качества молча теряются при перезагрузке (data loss).
          hero.craft = G.sanitizeCraftLevels
            ? G.sanitizeCraftLevels(d.hero.craft) : {};
          hero.craftXp = G.sanitizeCraftXp
            ? G.sanitizeCraftXp(d.hero.craftXp) : {};
          hero.equipmentBonus = G.sanitizeEquipmentBonus
            ? G.sanitizeEquipmentBonus(d.hero.equipmentBonus)
            : { weapon: null, armor: null };
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

    // --- Постройки: «раз в день» по эффекту (задача 000072) ---
    // 'x,y:effectId' → день применения. Битый раздел — отброс +
    // предупреждение (000029); «использовано в будущем» день
    // (dd > clock.day) — отброс (подделка, 000031 — дни абсолютные).
    try {
      const raw = d.buildingOncePerDay;
      if (raw != null) {
        if (typeof raw !== 'object' || Array.isArray(raw)) {
          console.warn(
            'Сейв: раздел buildingOncePerDay некорректен — сбрасываю.');
          buildingOncePerDay.clear();
        } else if (G.restoreDayMap) {
          const m = G.restoreDayMap(raw);
          for (const [k, dd] of m) {
            if (dd > clock.day) m.delete(k);
          }
          buildingOncePerDay.clear();
          for (const [k, v] of m) buildingOncePerDay.set(k, v);
          if (m.size === 0 && Object.keys(raw).length > 0) {
            console.warn(
              'Сейв: buildingOncePerDay — валидных записей нет — сбрасываю.');
          }
        }
      }
    } catch (err) {
      console.warn('Сейв: не удалось восстановить buildingOncePerDay:', err);
    }

    // --- Благословения (buffs) (задача 000072) ---
    // restoreBuffs сам отбрасывает и «будущие» (day > clock.day),
    // и истёкшие (day < clock.day): очистка в onDay не пройдёт —
    // fastForward не оповещает слушателей (000031).
    try {
      const raw = d.buffs;
      if (raw != null) {
        if (!Array.isArray(raw)) {
          console.warn('Сейв: раздел buffs некорректен — сбрасываю.');
          buffs.length = 0;
        } else if (G.restoreBuffs) {
          const restored = G.restoreBuffs(raw, clock.day);
          buffs.length = 0;
          for (const b of restored) buffs.push(b);
          if (restored.length === 0 && raw.length > 0) {
            console.warn(
              'Сейв: buffs — валидных благословений нет — сбрасываю.');
          }
        }
      }
    } catch (err) {
      console.warn('Сейв: не удалось восстановить buffs:', err);
    }

    // --- Телепорт-круги (teleports) (задача 000075) ---
    // 'x,y' круга → { pair: 'px,py'|null, dest: 'dx,dy'|null,
    // active: boolean } (структура — memory/000075-
    // teleport-circles.md). restoreTeleports сам отбрасывает
    // мусорные записи; битый раздел — сброс + предупреждение
    // (000029, паттерн 000072). Старому сейву раздела нет —
    // пустой Map → скан при первом [E].
    try {
      const raw = d.teleports;
      if (raw != null) {
        if (typeof raw !== 'object' || Array.isArray(raw)) {
          console.warn('Сейв: раздел teleports некорректен — сбрасываю.');
          teleports.clear();
        } else if (G.buildingEffects &&
                   G.buildingEffects.restoreTeleports) {
          const m = G.buildingEffects.restoreTeleports(raw);
          teleports.clear();
          for (const [k, v] of m) teleports.set(k, v);
          if (m.size === 0 && Object.keys(raw).length > 0) {
            console.warn(
              'Сейв: teleports — валидных записей нет — сбрасываю.');
          }
        }
      }
    } catch (err) {
      console.warn('Сейв: не удалось восстановить teleports:', err);
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

  // Подземелье/город (000105): текущая вылазка и память содержимого
  // по входам. dungeonMemory: 'x,y' входа → { contents, lastVisitDay }
  // (для ГОРОДА не применяется — персистентность сейва, 000109).
  // { dg, contents, kind: 'dungeon'|'city', name (город), x, y,
  //   prevX, prevY, worldKey, log, mover, pos }
  // (mover/pos — 000068: мувер motion.js + дробная позиция рендера)
  let dungeonState = null;
  const dungeonMemory = new Map();

  // Смена дня: восстановление, респауны групп (SPEC.md «Игровое время»).
  clock.onDay(({ day }) => {
    G.restoreDay(hero); // часть HP/MP по формулам навыков
    const due = G.dueForRespawn(defeatedAt, day);
    for (const k of due) defeatedAt.delete(k);
    // Задача 000072: истёкшие благословения — абсолютные дни
    // (buff.day < day; легитимное благословение — 1 день).
    for (let i = buffs.length - 1; i >= 0; i--) {
      if (buffs[i].day < day) buffs.splice(i, 1);
    }
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

  // Диалог NPC (задача 000010): ТЕ ЖЕ параметры, что и до 000071.
  function openNpcDialog(npc, t) {
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

  // Действие эффекта из оверлея (задача 000071): «Диалог» — npcUI;
  // эффект — entry.apply(state) → при ok: маркировка раз-в-день
  // buildingOncePerDay.set('x,y:effectId', clock.day) (только если
  // hasDailyLimit — хук 000092) + saveNow() СРАЗУ (не ждать
  // beforeunload — паттерн 000029/000072, прецедент _lastUnkillDay)
  // + hudFlash(message). При НЕ-ok: message (если есть) тоже в
  // hudFlash — отказ apply не гаснет молча (ревью раунда 2);
  // маркировки и saveNow НЕТ (эффект не сработал).
  function onBuildingAction(action, t, b, npc) {
    // Реестр эффектов — ПЕРВЫМИ (ревью раунда 3): запись
    // EFFECTS['dialog'] (если появится в каталоге) не должна
    // затеняться спецкейсом ниже. 'dialog' — fallback: NPC-диалог.
    const BE = G.buildingEffects;
    const entry = BE && BE.EFFECTS ? BE.EFFECTS[action.id] : null;
    if (entry && typeof entry.apply === 'function') {
      const r = entry.apply({
        day: clock.day,
        tile: { x: player.x, y: player.y },
        hero,
        // СНИМОК сейва (обычный объект, 000072): эффект не получает
        // живых ссылок на состояние мира. Исключение (000076): map —
        // READ-ONLY ссылка на живую карту (для «Сна» 37 — подсказка
        // сканирует тайлы; запись эффекта карту не мутирует —
        // задокументировано memory/000076-temple-blessings.md).
        save: collectSaveData(),
        map: map || null,
      });
      if (!r || !r.ok) {
        // Отказ apply: видимый отказ (message → hudFlash), без
        // маркировки раз-в-день и saveNow — эффект не сработал
        // (ревью раунда 2: до этого message неуспешного apply
        // отбрасывался — нажатие умирало молча).
        if (r && r.message) {
          hudFlash = r.message;
          hudFlashUntil = performance.now() + 5000;
        }
        return;
      }
      // Телепорт (задача 000075): р.teleport — декларация переноса
      // из ЧИСТОГО apply (dest ИЗ СНИМКА сейва). Исполнение здесь —
      // в снимке мира НЕТ: списание (стоимость ИЗ КАТАЛОГА, не
      // хардкод), hero.gold, позиция + снап мувера. Ханк
      // срабатывает ТОЛЬКО при r.teleport — чужие эффекты (в т.ч.
      // тестовые B3) не затрагиваются. Контракт — memory/000075-
      // teleport-circles.md (для 000093+).
      if (r.teleport) {
        const key = player.x + ',' + player.y;
        const info = teleports.get(key);
        const op = b && b.особые_параметры;
        const eff = op && typeof op.эффект === 'object' ? op.эффект : null;
        const cost = eff && Number.isFinite(eff.стоимость)
          ? eff.стоимость : 0;
        const ch = G.buildingEffects.teleportCharge(
          hero, !!(info && info.active), cost);
        if (!ch.ok) {
          // Мало золота — отказ БЕЗ списания/переноса (мировое
          // состояние не изменилось) → ДО saveNow (контракт 000071:
          // отказ — message в hudFlash, без saveNow/маркировки).
          hudFlash = ch.message;
          hudFlashUntil = performance.now() + 5000;
          return;
        }
        hero.gold = ch.gold;
        if (info && !info.active) info.active = true;
        player.x = r.teleport.x;
        player.y = r.teleport.y;
        prevPos.x = player.x; prevPos.y = player.y;
        if (mover) mover.teleport(player.x, player.y); // снап (000033):
        // персонаж не «скользит» от старой точки (паттерн
        // restoreFromSave).
      }
      // Задача 000076: ОБЩИЙ хук «apply вернул новое состояние» —
      // r.buffs (НОВЫЙ массив, grantBuff 000072) заменяет содержимое
      // живого массива buffs ДО saveNow (СНИМОК не мутировался —
      // main.js владеет живым состоянием). Не храм-специфично: любой
      // эффект-запись может нести новое состояние.
      if (Array.isArray(r.buffs)) {
        buffs.length = 0;
        for (const b of r.buffs) buffs.push(b);
      }
      if (BE.hasDailyLimit(b, action.id)) {
        buildingOncePerDay.set(
          player.x + ',' + player.y + ':' + action.id, clock.day);
      }
      saveNow();
      if (r.message) {
        hudFlash = r.message;
        hudFlashUntil = performance.now() + 5000;
      }
      G.playerUI && G.playerUI.render();
      return;
    }
    if (action.id === 'dialog') {
      if (npc) openNpcDialog(npc, t);
      return;
    }
  }

  // Скан пары телепорт-круга (задача 000075): окно [-R..R]² вокруг
  // круга (x, y), R — каталог особые_параметры.эффект.радиус
  // (фолбэк 100). Предфильтр — necessary-условие якоря слота
  // (map.js: hash2(x, y, GLOBAL_SEED) % buildingCount() === слот) —
  // ~1 из 13 тайлов, остальные не требуют tileAt (полный скан 40k
  // tileAt ≈ 1 c — недопустимо даже при первом подходе; формулу
  // якоря фиксируют золотые пины 000073 — не менять без переписи
  // скана, memory/000075-teleport-circles.md). Подтверждение —
  // tileAt(...).buildingId === 41 (подтип, 000073). Результат — в
  // Map teleports + saveNow; ПОВТОРНОГО скана никогда (кэш в
  // сейве). Вызывается ТОЛЬКО из openBuildingUI (не в кадре).
  function scanTeleportPair(x, y, b) {
    const op = b && b.особые_параметры;
    const eff = op && typeof op.эффект === 'object' ? op.эффект : null;
    const R = eff && Number.isFinite(eff.радиус) ? eff.радиус : 100;
    const slot = op && op.размещение && Number.isFinite(op.размещение.слот)
      ? op.размещение.слот : 10;
    const BE = G.buildingEffects;
    const tie = (px, py) => G.hash2(px, py, BE.TELEPORT_TIE_SEED);
    const count = G.buildingCount ? G.buildingCount() : 0;
    const circles = [];
    for (let cy = y - R; cy <= y + R; cy++) {
      for (let cx = x - R; cx <= x + R; cx++) {
        // Предфильтр якоря слота (см. выше) + свой тайл — не пара.
        if (cx === x && cy === y) continue;
        if (count > 0 && G.hash2(cx, cy, G.GLOBAL_SEED) % count !== slot) {
          continue;
        }
        const t = map.tileAt(cx, cy);
        if (t.buildingId === 41) circles.push({ x: cx, y: cy });
      }
    }
    const link = BE.linkTeleportCircles(circles, x, y, R, tie);
    let dest = null;
    if (link.pairId) {
      const sep = link.pairId.indexOf(',');
      const size = G.buildingSize ? G.buildingSize(b) : { width: 1, height: 1 };
      // мир-оракль dest (контракт memory): проходим, НЕ в footprint'е
      // постройки, без группы мобов (шаг в группу = мгновенный бой,
      // паттерн findSpawn), и не тайл исходного круга.
      dest = BE.teleportDestination(
        { x: Number(link.pairId.slice(0, sep)),
          y: Number(link.pairId.slice(sep + 1)) },
        size,
        (px, py) => {
          if (px === x && py === y) return false;
          const t = map.tileAt(px, py);
          return t.passable && !t.inBuilding && !t.hasMobGroup;
        }, tie);
      dest = dest ? dest.x + ',' + dest.y : null;
    }
    teleports.set(x + ',' + y, {
      pair: link.pairId, dest, active: false,
    });
    saveNow();
  }

  // Открыть оверлей «действия постройки» (задача 000071): список —
  // buildingActions (чистый модуль, src/building-effects.js). Пустой
  // список (нет NPC и нет эффектов) — ничего (как сейчас).
  function openBuildingUI(t, b, npc) {
    if (!G.buildingEffects) return false;
    // Задача 000075: телепорт-круг — скан пары при ПЕРВОМ подходе
    // (кэш в разделе сейва teleports; повторного скана НЕТ).
    if (t.buildingId === 41 && !teleports.has(t.x + ',' + t.y)) {
      scanTeleportPair(t.x, t.y, b);
    }
    const actions = G.buildingEffects.buildingActions(b, npc, {
      day: clock.day,
      tile: { x: player.x, y: player.y },
      hero,
      // СНИМОК (000071) + map — READ-ONLY ссылка (000076, см.
      // onBuildingAction): available?(state) эффектов получает то же
      // состояние, что apply.
      save: collectSaveData(),
      map: map || null,
    });
    if (!actions.length) return false;
    // Заголовок — имя РЕШЁННОЙ записи (000075 RESOLVE-БУГ, 000073):
    // у подтипов слотов 8..12 — своё название (b.id 41 → «телепорт-
    // круг», а не базовое имя слота 10 «рунический камень»);
    // паттерн HUD «Здесь:» (название_карты || название, первая
    // буква нижним).
    let title = G.buildingNameUi ? G.buildingNameUi(t.building) : 'Постройка';
    if (b) {
      const raw = (b.особые_параметры &&
        b.особые_параметры.название_карты) || b.название;
      if (typeof raw === 'string' && raw !== '') {
        title = raw.charAt(0).toLowerCase() + raw.slice(1);
      }
    }
    G.buildingUI.open({
      title,
      actions,
      onAction: (a) => onBuildingAction(a, t, b, npc),
    });
    return true;
  }

  // Каталожная запись тайла (задача 000076, подтипы 000073):
  // ПОДТИП (t.buildingId — id каталожной записи 36..39 и пр.)
  // ПРЕВЫШАЕТ базовую запись слота — у подтипа свои NPC/эффекты/
  // имя (храм горы 38 — без Элдиры, у Элдиры постройки [20, 36]).
  // Без подтипа (слоты 0..7 — buildingId null) либо без каталога
  // (getBuilding → null) — базовая запись слота (как до задачи).
  // Город (000103: building NONE, buildingId 51..54) — запись через
  // buildingId; базовой записи слота -1 нет — поведение как до.
  function buildingRecForTile(t) {
    if (!t || !t.hasBuilding) return null;
    if (t.buildingId != null) {
      const rec = G.getBuilding ? G.getBuilding(t.buildingId) : null;
      if (rec) return rec;
    }
    return G.buildingForMapIndex(t.building);
  }

  // Действие [E] (задача 000010, задача 000071 — ЕДИНЫЙ путь): роутинг
  // [E] на тайле постройки → оверлей Game.buildingUI (список действий:
  // «Диалог», если у постройки NPC, + эффекты каталога). Повторный
  // [E] — закрыть оверлей. Постройка с NPC и БЕЗ эффектов — тоже
  // оверлей из одного пункта «Диалог» (НЕ прямой npcUI — 000076/000107;
  // Digit1 открывает диалог). Вызывается и с клавиатуры, и с
  // on-screen-кнопки «E» тач-варианта (задача 000018) — семантика
  // кнопки «действие на тайле» совпадает автоматически.
  function toggleNpcDialog() {
    if (!G.npcUI) return;
    if (G.combatUI && G.combatUI.isActive()) return;
    if (G.dungeonUI && G.dungeonUI.isActive()) return;
    if (G.buildingUI) {
      // Повторный [E] — закрыть оверлей действий.
      if (G.buildingUI.isActive()) {
        G.buildingUI.close();
        return;
      }
      // Открыт диалог NPC (после «Диалог» из оверлея): повторный [E]
      // закрывает диалог — поведение master (до 000071 проверка
      // npcUI.isActive() шла ПЕРВОЙ в toggleNpcDialog). Без неё
      // buildingUI открывался СВЕРХУ открытого npcUI — оба оверлея
      // активны одновременно (регрессия, тест B4).
      if (G.npcUI.isActive()) {
        G.npcUI.close();
        return;
      }
      if (map) {
        const t = map.tileAt(player.x, player.y);
        if (t.hasBuilding) {
          const b = buildingRecForTile(t); // 000076: подтип слота 8..12
          if (b) {
            const npc = G.npcForBuilding(NPCS, b.id);
            openBuildingUI(t, b, npc);
          }
        }
      }
      return;
    }
    // G.buildingUI отсутствует (регрессия порядка загрузки — паттерн
    // 000018/000038): console.error + деградация к старому прямому
    // npcUI — игра не ломается, ошибка заметна в консоли.
    console.error('main.js: [E], но Game.buildingUI отсутствует — ' +
      'src/building-ui.js обязан грузиться ДО src/main.js');
    if (G.npcUI.isActive()) { // повторно — закрыть диалог
      G.npcUI.close();
      return;
    }
    if (map) {
      const t = map.tileAt(player.x, player.y);
      if (t.hasBuilding) {
        const b = buildingRecForTile(t); // 000076: подтип слота 8..12
        const npc = b && G.npcForBuilding(NPCS, b.id);
        if (npc) openNpcDialog(npc, t);
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
    // Наблюдение (вне 000048; ревью 000071 раунд 2 — buildingUI):
    // KeyI выше ВСЕХ гейтов — Ш переключает панель персонажа
    // поверх ОТКРЫТОГО оверлея (боевого/подземелья/NPC/постройки).
    // Поведение ДО 000071 (для combatUI задокументировано здесь),
    // не регрессия; общий keydown — зона других задач.
    if (G.combatUI && G.combatUI.isActive()) return;
    if (G.dungeonUI && G.dungeonUI.isActive()) return;
    if (G.npcUI && G.npcUI.isActive()) return;
    if (G.buildingUI && G.buildingUI.isActive()) return; // 000071:
    // движение заблокировано, пока открыт оверлей действий постройки
    // (как npcUI).
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
    // Полноэкранная панель накроет карту в бою — закрываем (000096).
    // KeyI в бою по-прежнему переключает (коммент ниже), но это осознанный
    // выбор игрока, а не случайное состояние.
    if (G.playerUI && G.playerUI.isOpen()) G.playerUI.toggle(false);
    // Оверлей действий постройки (000071) под боевым оверлеем —
    // закрываем (тот же стек, паттерн 000096).
    if (G.buildingUI && G.buildingUI.isActive()) G.buildingUI.close();
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
      // Задача 000076: активные благословения — во ВСЕХ боях дня.
      buffMods: currentBuffMods(),
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

  // --- Подземелье/город (задача 000127): домен — src/locations.js ---
  // Проводка: владение dungeonState/dungeonMemory, оверлей, saveNow,
  // flash-строки СЛОВО В СЛОВО, бой — startDungeonCombat (ниже).
  function enterLocation() {
    if (dungeonState) return;
    const L = G.locations;
    if (!L) {
      console.error('main.js: Game.locations отсутствует — ' +
        'src/locations.js обязан грузиться ДО src/main.js (000127)');
      return;
    }
    const ctx = { map, mapPixels, player, hero, day: clock.day,
      memory: dungeonMemory, intervalMs: MOVE_INTERVAL_MS };
    const ds = L.maybeEnterDungeon(ctx) || L.maybeEnterCity(ctx);
    if (ds) {
      dungeonState = ds;
      startLocationUI(ds.kind === 'city' ? cityOnMove : dungeonOnMove);
    }
  }
  function startLocationUI(onMove) {
    G.dungeonUI.start({
      get state() { return dungeonState; },
      onMove,
      // ОДИН общий zoom (задача 000066): колесо поверх оверлея меняет
      // тот же zoom, что мир (мировой слушатель на #game накрыт) —
      // hudUpdate («Масштаб: Xpx») остаётся корректным без изменений.
      zoom,
      onZoom: (z) => { zoom = z; },
      spriteLoader,
    });
  }
  function exitLocation(ds) {
    if (ds.kind === 'city') G.locations.exitCity(ds);
    else G.locations.exitDungeon(ds, { day: clock.day,
      memory: dungeonMemory, clock });
    dungeonState = null;
    G.dungeonUI.close();
    saveNow();
  }
  function dungeonOnMove(dx, dy) {
    const ds = dungeonState;
    if (!ds) return;
    const ev = G.locations.dungeonMove(ds, dx, dy, performance.now(),
      { inCombat: !!(G.combatUI && G.combatUI.isActive()) });
    if (!ev) return;
    if (ev.type === 'exit') {
      exitLocation(ds);
      hudFlash = 'Вы вышли из ' + ev.name + '.';
      hudFlashUntil = performance.now() + 5000;
      return;
    }
    if (ev.type === 'combat') { startDungeonCombat(ev.group); return; }
    const chest = ev.chest;
    if (chest) {
      hero.gold += chest.gold;
      // Предмет в сундуке — id из каталога (assets/items) → в инвентарь.
      let itemMsg = '';
      if (chest.item) {
        const it = G.getItem(chest.item);
        const add = G.addItem(hero, chest.item);
        itemMsg = add.ok
          ? ', ' + it.name
          : ' (инвентарь полон: ' + it.name + ' потерян)';
      }
      const msg = 'Сундук: +' + chest.gold + ' золота' + itemMsg;
      ds.log.push(msg);
      hudFlash = msg;
      hudFlashUntil = performance.now() + 5000;
      G.playerUI && G.playerUI.render();
    }
  }
  function cityOnMove(dx, dy) {
    const ds = dungeonState;
    if (!ds) return;
    const ev = G.locations.cityMove(ds, dx, dy, performance.now(),
      { inCombat: !!(G.combatUI && G.combatUI.isActive()) });
    if (!ev || ev.type !== 'exit') return;
    exitLocation(ds);
    hudFlash = 'Вы вышли из ' + ev.name + '.';
    hudFlashUntil = performance.now() + 5000;
  }

  // Бой с блуждающей группой подземелья.
  function startDungeonCombat(g) {
    const ds = dungeonState;
    // То же, что и в мире (000096): панель не должна накрывать
    // подземелье после боя.
    if (G.playerUI && G.playerUI.isOpen()) G.playerUI.toggle(false);
    if (G.buildingUI && G.buildingUI.isActive()) G.buildingUI.close(); // 000071
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
      // Задача 000076: активные благословения — во ВСЕХ боях дня.
      buffMods: currentBuffMods(),
      onEnd: (res) => {
        if (res.outcome === 'victory') {
          g.defeated = true;
          ds.log.push((g.boss ? 'Босс' : 'Группа') + ' повержена. +' + res.xp + ' опыта.');
        } else {
          // Побег и смерть: назад на клетку, с которой зашёл в бой.
          ds.x = ds.prevX; ds.y = ds.prevY;
          // Снап мувера (000068): иначе спрайт скользил бы обратно
          // через поле боя (аналог снапа мира при побеге/смерти).
          if (ds.mover) ds.mover.teleport(ds.prevX, ds.prevY);
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

    // Задача 000042: три прохода по frameTiles, ГЛОБАЛЬНО согласованный
    // порядок слоёв — текстура тайла + декорации < постройки < мобы <
    // Флогистон. Старый по-тайловый цикл рисовал постройку одним 1x1-
    // спрайтом на тайле ВХОДА (3x3-постройка видна как один спрайт,
    // стены — голый террейн); теперь — ОДИН w×h-спрайт ОТ ЯКОРЯ. По
    // тайлам это сделать нельзя: текстуры СОСЕДНИХ тайлов footprint'а
    // перерисовали бы часть прямоугольника, поэтому текстуры — весь
    // мир одним проходом, постройки — отдельным (один раз на якорь),
    // мобы — третьим.
    //
    // Запись постройки по якорю (source of truth — та, что раскладывала
    // её в мире, ОДИН источник геометрии). typeof-гард: устаревший
    // map.js без buildingAt — фолбэк-скан прямоугольника вправо/вниз по
    // tileCache, НО с ПРОВЕРКОЙ РАВЕНСТВА buildingAnchor (одного
    // inBuilding мало: чужая соседняя постройка зальёт скан и даст
    // ложные 2x1/1x2). Якоря нет — 1x1.
    function buildingRec(ax, ay) {
      if (map && typeof map.buildingAt === 'function') {
        return map.buildingAt(ax, ay);
      }
      const t0 = tileCache.tile(ax, ay);
      if (!t0.inBuilding) return null;
      const same = (t) => t.inBuilding && t.buildingAnchor &&
        t.buildingAnchor[0] === ax && t.buildingAnchor[1] === ay;
      let w = 1, hgt = 1;
      while (w < (G.BUILD_MAX_W || 3) && same(tileCache.tile(ax + w, ay))) w++;
      while (hgt < (G.BUILD_MAX_H || 3) && same(tileCache.tile(ax, ay + hgt))) hgt++;
      return { anchor: [ax, ay], type: t0.building,
               x: ax, y: ay, w, h: hgt,
               entrance: [ax, ay], wealth: 0 };
    }

    // Проход 1: текстура тайла (вода/глубокая вода — кадр анимации по
    // чистому селектору frameIndex) + декорации (задача 000039).
    // Декорации — поверх текстуры тайла, ДО построек/мобов/Флогистона
    // (отдельный проход после рисовал бы их поверх). На тайлах-СТЕНАХ
    // постройки (inBuilding && !isEntrance) декорации НЕ рисуются —
    // иначе травинки вырастают «на стене» (задача 000042); вход
    // декорации сохраняет (там игрок взаимодействует). Не загрузившийся
    // спрайт — элемент пропускается (isReady false), слой не падает.
    for (const t of frameTiles) {
      const p = toPt(t.x, t.y);
      const sx = p.x, sy = p.y;
      const frames = G.tileFrames(t.terrain);
      if (frames.length) {
        const idx = frames.length > 1 ? G.frameIndex(now, t.x, t.y, frames.length) : 0;
        const img = spriteLoader.image(frames[idx]);
        if (img) s2.drawImage(img, sx, sy, zoom, zoom);
      }
      if (showVisuals && !(t.inBuilding && !t.isEntrance)) {
        for (const e of G.tileVisuals(t.x, t.y, t.terrain)) {
          if (!spriteLoader.isReady(e.sprite)) continue;
          const r = G.visualDrawRect(e, sx, sy, zoom);
          s2.drawImage(spriteLoader.image(e.sprite),
            r.x, r.y, r.size, r.size);
        }
      }
    }

    // Проход 2: постройки — ОДИН раз на постройку (не 9 раз на входе).
    // Словарь якорей за кадр: любой видимый тайл-член footprint'а
    // даёт якорь; сам якорь может быть за краем окна (запас зума ~1 <
    // 3), поэтому рисуем по якорям ВИДИМЫХ тайлов, а не только по
    // якорным тайлам. Прямой вызов drawImage: w×h ОТ ЯКОРЯ
    // (worldToScreen(ax, ay), размер w*zoom × h*zoom).
    const anchors = new Set();
    for (const t of frameTiles) {
      if (t.inBuilding && t.buildingAnchor) {
        anchors.add(t.buildingAnchor[0] + ',' + t.buildingAnchor[1]);
      }
    }
    for (const key of anchors) {
      const sep = key.indexOf(',');
      const ax = Number(key.slice(0, sep));
      const ay = Number(key.slice(sep + 1));
      const rec = buildingRec(ax, ay);
      if (!rec) continue;
      const img = spriteLoader.image(G.buildingSprite(rec.type));
      if (!img) continue;
      const p = toPt(rec.x, rec.y);
      s2.drawImage(img, p.x, p.y, rec.w * zoom, rec.h * zoom);
    }

    // Проход 3: спрайты групп мобов — поверх построек (мобы в
    // footprint'е не рождаются, перекрытий по области нет).
    // Задача 000122: поверженная группа скрыта до дня респауна —
    // запись 'x,y' → день в defeatedAt (main.js) удаляется при смене
    // дня (dueForRespawn), спрайт возвращается ровно тогда же, без
    // доп. состояния. Фильтр здесь, в слое отрисовки: hasMobGroup в
    // map.js детерминирован (hash координат) и о defeatedAt не знает.
    for (const t of frameTiles) {
      if (!t.hasMobGroup) continue;
      if (G.groupVisible && !G.groupVisible(defeatedAt, t.x, t.y)) continue;
      const p = toPt(t.x, t.y);
      const sx = p.x, sy = p.y;
      const mf = G.mobFrames(t.mobGroup);
      const idx = mf.length > 1 ? G.frameIndex(now, t.x, t.y, mf.length) : 0;
      const m = mf.length ? spriteLoader.image(mf[idx]) : null;
      if (m) s2.drawImage(m, sx - zoom * 0.1, sy - zoom * 0.15, zoom * 1.2, zoom * 1.2);
    }

    // Флогистон: idle/walk по движению, attack/cast — отладочная animAction.
    // Окно walk/idle (задача 000063) — через G.walkWindowMs от интервала
    // шага (motion.js), а не фикс 260 мс: фикс подобран под старый
    // интервал 140 мс и при базовых 420 мс давал замирание 160 мс в
    // idle за цикл — рваную ходьбу. Без walkWindowMs — старое окно 260.
    const action = now < animUntil ? animAction
      : (now - lastStepAt < (G.walkWindowMs
        ? G.walkWindowMs(stepIntervalMs())
        : 260) ? 'walk' : 'idle');
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
    // Задача 000076: подтип слота 8..12 (buildingId) — СВОЯ запись
    // (свои NPC/эффекты): храм горы (38) — «[E] действия» БЕЗ
    // «[E] диалог» (Элдира — только 20/36). Базовые слоты — как до.
    const bHere = buildingRecForTile(t);
    const npcHere = bHere && G.npcForBuilding ? G.npcForBuilding(NPCS, bHere.id) : null;
    // Эффекты постройки (задача 000071): ПОДСКАЗКА «[E] действия» —
    // только когда NPC НЕТ (NPC без эффектов — ТЕКУЩИЙ текст,
    // регрессия). hasEffects — дешёвый lookup реестра/каталога БЕЗ
    // сейва (сериализация сейва на кадр НЕ вводится).
    const effectsHere = bHere && G.buildingEffects
      && typeof G.buildingEffects.hasEffects === 'function'
      ? G.buildingEffects.hasEffects(bHere)
      : false;
    let line = 'Флогистон, ур. ' + hero.level + '  (' + player.x + ', ' + player.y + ')\n' +
      'HP ' + hero.hp + '/' + d.maxHP + '  |  Золото: ' + hero.gold + '  |  Очки: ' + hero.points + '\n' +
      'Местность: ' + G.TERRAIN_NAMES[t.terrain] + '\n' +
      'День: ' + clock.day + '  |  Масштаб: ' + zoom + 'px  |  карта: ' + map.width + 'x' + map.height +
      (map.fromPng ? ' (map.png)' : ' (пересчёт)') +
      (spriteLoader ? '  |  графика: ' + spriteLoader.readyCount() + '/' + spriteLoader.totalCount() : '') + '\n' +
      '[I] персонаж' + (npcHere ? '  |  [E] диалог'
        : (effectsHere ? '  |  [E] действия' : ''));
    if (dungeonState) {
      const ds = dungeonState;
      const dist = Math.abs(ds.x - ds.dg.exit.x) + Math.abs(ds.y - ds.dg.exit.y);
      if (ds.kind === 'city') {
        // Город (000105): заголовок — имя города; contents null
        // (000106) — строк групп/сундуков нет (ds.contents.mobs
        // упадёт — ветка по kind обязательна).
        line += '\n--- ' + ds.name + ' (' + ds.x + ', ' + ds.y + ') ---' +
          '\nДо выхода: ~' + dist + ' клеток';
      } else {
        line += '\n--- ' + G.DUNGEON_NAMES[ds.dg.type] + ' (' + ds.x + ', ' + ds.y + ') ---' +
          '\nДо выхода: ~' + dist + ' клеток  |  ' +
          (ds.contents.mobs.filter((m) => !m.defeated).length) + ' групп(ы)';
      }
    } else if (t.hasBuilding) {
      const shopHint = G.shopKindsFor(t.building) ? '  (торговля — панель [I])' : '';
      // [E] — РОУТЕР: действия упоминаем ВСЕГДА, когда есть эффекты
      // (NPC не перекрывает их): «([E] имя, действия)» /
      // «([E] имя)» / «([E] действия)» (ревью раунда 3, 000071).
      let eHint = '';
      if (npcHere && effectsHere) {
        eHint = '  ([E] ' + npcHere.имя + ', действия)';
      } else if (npcHere) {
        eHint = '  ([E] ' + npcHere.имя + ')';
      } else if (effectsHere) {
        eHint = '  ([E] действия)';
      }
      let name = G.buildingNameUi(t.building);
      // Задача 000073: у подтипа слота 9 «развалины» (buildingId 48)
      // хинт подавлен — тайл не вход (пара с гардом
      // maybeEnterDungeon); остальные пещерные тайлы (базовая 31,
      // в т.ч. buildingId null без каталога) — как раньше.
      let hint = t.building === G.BUILDING_TYPES.CAVE_ENTRANCE
        && t.buildingId !== 48
        ? ' (вход — шагните)' : '';
      // Каталожная запись тайла: город (000103/000105 — building
      // NONE, buildingNameUi '') И подтипы слотов 8..12 (000073 —
      // building — обобщённое имя слота). Имя — из записи:
      // название_карты || название (тот же вывод, что заголовок
      // города в makeCityState), регистр — конвенция buildingNameUi
      // (первая буква в нижнем). У базовых подтипов строки те же,
      // что buildingNameUi(slot); у подтипов — своё имя (000073).
      // Слоты 0..7 и без каталога — buildingId null, ветка не
      // срабатывает (имя — имя слота, как до задачи).
      if (t.buildingId != null) {
        const rec = G.getBuilding(t.buildingId);
        if (rec) {
          const raw = (rec.особые_параметры &&
            rec.особые_параметры.название_карты) || rec.название;
          if (typeof raw === 'string' && raw !== '') {
            name = raw.charAt(0).toLowerCase() + raw.slice(1);
            // Хинт «(вход — шагните)» — у города (000105); у
            // слотовых — только пещера без подтипа-развалин (см.
            // выше).
            if (rec.категория === 'город') hint = ' (вход — шагните)';
          }
        }
      }
      line += '\nЗдесь: ' + name + shopHint + eHint + hint;
    } else if (t.hasMobGroup) {
      // Имя группы — из каталога лениво (задача 000057): map.js
      // грузится ДО main.js, G.mobGroupName всегда на месте.
      line += defeatedAt.has(key)
        ? '\nГруппа ' + G.mobGroupName(t.mobGroup) + ' повержена.'
        : '\nОсторожно: ' + G.mobGroupName(t.mobGroup) + '!';
    }
    // Магазин текущего тайла → вкладка «Магазин» в панели персонажа.
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
    const inBuilding = G.buildingUI && G.buildingUI.isActive(); // 000071
    // Интервал шага (задача 000033 + 000063): база — из глобальных
    // настроек (420 мс), навык «Ловкий шаг» укорачивает, нижний кламп —
    // G.MIN_MOVE_INTERVAL_MS. Одно значение для шага и окна walk/idle.
    const stepMs = stepIntervalMs();
    if (!inCombat && !inDungeon && !inNpc && !inBuilding
        && now - lastMove >= stepMs) {
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
        enterLocation(); // 000127: домен — src/locations.js (подземелье/город)
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
          // Книга заклинаний (регрессия 000045, правки ревью 000046):
          // restoreFromSave всегда задаёт hero.spells (массив), поэтому
          // здесь просто значение героя — иначе тесту не из чего читать
          // (паттерн craft/craftXp/equipmentBonus, 000046).
          spells: hero.spells,
          // Крафт (задача 000046): опциональные поля — restoreFromSave
          // всегда задаёт дефолты ({} / {} / {weapon:null,armor:null}),
          // поэтому здесь просто значения героя.
          craft: hero.craft,
          craftXp: hero.craftXp,
          equipmentBonus: hero.equipmentBonus,
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
    // Текущее подземелье/город (или null; 000105 — kind).
    get dungeon() {
      if (!dungeonState) return null;
      const ds = dungeonState;
      // Город (000105): name — название_карты, type/mobs/chests — null
      // (contents у города null, type у layout города нет).
      return {
        kind: ds.kind,
        // Город: null, а не undefined (ревью 000105, раунд 1):
        // у layout города (createCityLayout) поля type нет —
        // undefined JSON-сериализация тихо drop'ит, null —
        // явный «типа нет» как у mobs/chests.
        type: ds.kind === 'city' ? null : ds.dg.type,
        name: ds.kind === 'city' ? ds.name : G.DUNGEON_NAMES[ds.dg.type],
        width: ds.dg.width, height: ds.dg.height,
        cells: ds.dg.cells,
        entrance: { x: ds.dg.entrance.x, y: ds.dg.entrance.y },
        x: ds.x, y: ds.y,
        exit: { x: ds.dg.exit.x, y: ds.dg.exit.y },
        mobs: ds.contents
          ? ds.contents.mobs.filter((m) => !m.defeated)
            .map((m) => ({ x: m.x, y: m.y }))
          : null,
        chests: ds.contents
          ? ds.contents.chests.filter((c) => !c.opened).length : null,
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
        // Тот же паттерн, что и в боях мира/подземелья (000096):
        // после отладочного боя полноэкранная панель не должна
        // накрывать карту.
        if (G.playerUI && G.playerUI.isOpen()) G.playerUI.toggle(false);
        // Стек оверлеев (000071): оверлей действий под боем — закрыть.
        if (G.buildingUI && G.buildingUI.isActive()) G.buildingUI.close();
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
          // Задача 000076: активные благословения — во ВСЕХ боях дня.
          buffMods: currentBuffMods(),
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
        const b = buildingRecForTile(t); // 000076: подтип слота 8..12
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
        if (dungeonState || !G.locations) return null;
        // Тот же хелпер, что maybeEnterDungeon (000068): одна форма
        // состояния (000127: домен — src/locations.js).
        const ds = G.locations.debugEnterDungeon(
          { map, mapPixels, player, hero, intervalMs: MOVE_INTERVAL_MS },
          terrain);
        if (!ds) return null;
        dungeonState = ds;
        startLocationUI(dungeonOnMove);
        return ds;   // = dungeonState (как раньше)
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

// Входная точка игры (SPEC.md): процедурная карта мира — WebGL-подложка
// (фолбэк: цветные тайлы/маркеры/ромб) под спрайт-слоем (#sprites) —
// и перемещение Флогистона по тайлам. Каждый элемент мира в кадре
// рисуется ровно одним из слоёв (000176, XOR-контракт:
// memory/000176-global-map-single-pass.md).
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
  // мобы, Флогистон. Элемент без готового кадра спрайта рисует свою
  // legacy-фигуру WebGL-подложка (фолбэк 000011 — игра не ломается);
  // поэлементный гейт — buildFrame (000176, те же селекторы
  // готовности, что и проходы drawSprites).
  const spriteCanvas = document.getElementById('sprites');
  const s2 = spriteCanvas ? spriteCanvas.getContext('2d') : null;

  // Кнопка полноэкранного режима (задача 000017): ядро — src/fullscreen.js
  // (тестируется в node), здесь только DOM-привязка. API недоступен —
  // кнопки нет, игра продолжает работать.
  let fsBtn = null;
  if (G.createFullscreenController) {
    const fullscreen = G.createFullscreenController(document);
    if (fullscreen.supported) {
      fsBtn = document.createElement('button');
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
  // Задача 000172: окружность радиуса агрессии на глобальной карте:
  // alpha < 1 — не заслоняет карту; dash — в пикселях экрана
  // (не зависит от зума). Радиус НЕ здесь: из G.groupZoneInfo
  // (combat.js, 000135) на кадр.
  const AGGRO_CIRCLE_STYLE = 'rgba(255, 64, 56, 0.9)';
  const AGGRO_CIRCLE_DASH = [6, 6];
  const AGGRO_CIRCLE_WIDTH = 2;
  const AGGRO_CIRCLE_FILL = 'rgba(255, 64, 56, 0.10)';
  // Базовый интервал шага по глобальной карте (задача 000063) — из
  // глобальных настроек (единый источник, паттерн 000020): 140 * 3 =
  // 420 мс, базовая скорость передвижения уменьшена в три раза.
  // 000099: move_interval_ms читается ЖИВО в момент ВЫЗОВА (каждый
  // кадр), а не снапшотом при загрузке (настройка из вкладки действует
  // без перезагрузки). Настроек нет (файл не загрузился) или битое
  // значение — старое поведение, 140 мс (деградация, паттерн 000033 с
  // G.createMover; guard 000063 без изменений).

  // Респаун города (задача 000109): дней до ПЕРЕГЕНЕРАЦИИ стока
  // лавок при входе (SPEC «Города и деревни» → «Состояние, сейв,
  // респаун» — «несколько игровых дней»). Глобальная настройка —
  // 000099 live-паттерн: читается в момент ВЫЗОВА (единый источник,
  // 000020); файла нет / значение некорректно — 3 (симметрия
  // respawn_days / dungeon_memory_days).
  function cityRespawnDays() {
    const gs = G.GlobalSettings && G.GlobalSettings.SETTINGS;
    return (gs && Number.isInteger(gs.city_respawn_days)
      && gs.city_respawn_days >= 1)
      ? gs.city_respawn_days
      : 3;
  }

  // Память подземелий (задача 000153.01): дней, в течение которых
  // содержимое посещённого этажа переживает выход (SPEC
  // «dungeon_memory_days»). Глобальная настройка — 000099 live-
  // паттерн: читается в момент ВЫЗОВА (сейв/восстановление), а не
  // кэшем; файла нет / значение некорректно — 3 (дефолт SETTINGS
  // dungeons-data/global-settings, симметрия liveMemoryDays
  // dungeon.js / cityRespawnDays).
  function dungeonMemoryDays() {
    const gs = G.GlobalSettings && G.GlobalSettings.SETTINGS;
    return (gs && Number.isInteger(gs.dungeon_memory_days)
      && gs.dungeon_memory_days >= 1)
      ? gs.dungeon_memory_days
      : 3;
  }

  // Текущий интервал шага с учётом «Ловкого шага» (задача 000033;
  // SPEC: Ловкость → «Скорость перемещения по карте»): база — из
  // глобальных настроек (задача 000063), чем выше навык, тем короче
  // шаг; нижний кламп — G.MIN_MOVE_INTERVAL_MS. Без навыка
  // (moveSpeedMult = 1) — базовый интервал. Один источник для цикла
  // шагов и окна анимации walk/idle (drawSprites).
  function stepIntervalMs() {
    const gs = G.GlobalSettings && G.GlobalSettings.SETTINGS;
    const base = (gs && Number.isFinite(gs.move_interval_ms)
      && gs.move_interval_ms > 0)
      ? gs.move_interval_ms
      : 140;
    return G.moveIntervalMs
      ? G.moveIntervalMs(base, (G.derived(hero) || {}).moveSpeedMult)
      : base;
  }
  // База интервала шага БЕЗ «Ловкого шага» (000099): ТОТ ЖЕ guard и
  // fallback 140, что в stepIntervalMs (копия в синхроне), но без
  // G.moveIntervalMs — муверы подземелья/города и фабрика мувера не
  // масштабируются Ловкостью (документированное ограничение
  // 000066/000067). Значение — в момент вызова.
  function moveIntervalBase() {
    const gs = G.GlobalSettings && G.GlobalSettings.SETTINGS;
    return (gs && Number.isFinite(gs.move_interval_ms)
      && gs.move_interval_ms > 0)
      ? gs.move_interval_ms
      : 140;
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
  // 000235.02: активные эффекты каста вне боя [{spellId, expiresDay}]
  // (опциональное поле v1; restore — санитайзером из Game.Spells).
  hero.outOfCombatEffects = [];
  // 000235.04: портальная метка {x, y, day} (одна, перезаписываемая;
  // restore — sanitizePortalMarker; null — метки нет).
  hero.portal_marker = null;
  G.playerUI && G.playerUI.setCharacter(hero);
  // 000194: карта быстрых предметов союзников { memberId
  // ('efir'|npcId) → [itemId|null]×3 } — ЛАЙВ-объект: [I]-панель
  // (G.playerUI.setAllyQuick — live-ссылка) и старт боя (opts.allyQuick
  // — снимок sanitizeAllyQuick) работают с ним; раздел сейва
  // ally_quick восстанавливается in place (live-ссылка не меняется).
  const allyQuick = {};
  if (G.playerUI && typeof G.playerUI.setAllyQuick === 'function') {
    G.playerUI.setAllyQuick(allyQuick);
  }
  // 000249: карта «последнего заклинания» { 'flogiston' (герой) |
  // 'efir' | npcId → id заклинания } — ЛАЙВ-объект: combat-ui
  // (opts.lastSpells) сидирует из него союзников на старте боя и
  // пишет на успешном касте; раздел сейва last_spells
  // восстанавливается in place (live-ссылка не меняется).
  const lastSpells = {};
  // Эфир (задача 000081): постоянный союзник — состояние
  // {level, xp, skillXp, skills, spells} — 5 полей (000111), форма
  // ЗАФИКСИРОВАНА под сейв (000085; до него — только память сессии).
  // Модуль отсутствует (регрессия порядка — паттерн 000038/000053):
  // efir = null + видимая ошибка — бои без Эфира (деградация, не крах).
  let efir = null;
  if (G.efir && typeof G.efir.createEfir === 'function') {
    efir = G.efir.createEfir();
  } else {
    console.error('main.js: efir.js не загружен (обязан грузиться ' +
      'ДО src/main.js, задача 000081) — в боях нет Эфира');
  }
  // Первая встреча Эфира (задача 000118, вариант (a)): персистентный
  // флаг «Эфир встретился в бою» — ТОП-УРОВНЕВОЕ поле сейва efir_met
  // (ВНЕ раздела efir — он заморожен 5 полями, пины 000085/000115).
  // Двойная преграда первой строки (000113 §3.5: «НЕ изобретать
  // второй флаг»): этот флаг + сессионный one-shot efir.js. true —
  // строка «Эфир материализуется…» не повторится (шов createCombat);
  // установка — noteEfirCombat после точек startCombat (реальные
  // c.units); restore — strict === true / мусор → warn+false /
  // отсутствует → false (безопасное направление: строка максимум
  // РАЗ повторится, не пропадёт).
  let efirMet = false;
  // Каталоги id-валидации раздела сейва Эфира (задача 000115, D2):
  // ПОЛНЫЕ зеркала assets (source of truth — каталоги JSON; JS-модули
  // — фолбэк file://): skills = PRIMARY_SKILLS (массив, 6) +
  // Object.values(SECONDARY_SKILLS) (ОБЪЕКТ-КАРТА, 31 — НЕ массив:
  // .concat добавил бы объект как элемент) = 37 id; spells = SPELLS
  // (массив, 16 id). G = снапшот Game (000038); порядок (skills-data
  // и spells-data ДО main.js) закрепляет пин index-order.
  // Каталог недоступен (регрессия порядка) → null → id-валидация ВЫКЛ
  // (безопасное направление: unknown-id инертен, 000085) + видимая
  // деградация — игра не падает.
  const EFIR_SKILL_CATALOG =
    (G.SkillsData && Array.isArray(G.SkillsData.PRIMARY_SKILLS) &&
     G.SkillsData.SECONDARY_SKILLS &&
     typeof G.SkillsData.SECONDARY_SKILLS === 'object' &&
     !Array.isArray(G.SkillsData.SECONDARY_SKILLS))
      ? G.SkillsData.PRIMARY_SKILLS.concat(
          Object.values(G.SkillsData.SECONDARY_SKILLS))
      : null;
  const EFIR_SPELL_CATALOG =
    (G.SpellsData && Array.isArray(G.SpellsData.SPELLS))
      ? G.SpellsData.SPELLS : null;
  if ((!EFIR_SKILL_CATALOG || EFIR_SKILL_CATALOG.length === 0) ||
      !EFIR_SPELL_CATALOG || EFIR_SPELL_CATALOG.length === 0) {
    console.error('main.js: каталоги skills/spells недоступны (Game.' +
      'SkillsData/Game.SpellsData обязаны грузиться ДО src/main.js, ' +
      'задача 000115) — id-валидация сейва Эфира отключена');
  }
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
  // Стоки барахолки лагеря (задача 000095): 'x,y' ТАЙЛА лагеря →
  // { day, stock, seed } (несколько лагерей — независимые стойки;
  // НЕ позиция игрока — в e2e игрок в другом месте, контракт §6.6).
  // Сток ССЫЛКОЙ в wrap (buyItem мутирует in place — campStocks
  // актуален, ui.js L226). Респаун по дню — respawn_days каталога.
  const CAMP_ID = 47;
  const campStocks = {};
  function campShopFor(x, y, tile) {
    if (!tile || tile.buildingId !== CAMP_ID) return null;
    const rec = G.getBuilding(CAMP_ID);
    const wealth = tile.buildingWealth;
    const key = x + ',' + y;
    const op = rec && rec.особые_параметры;
    const eff = op && op.эффект;
    const respawnDays = (eff && Number.isInteger(eff.respawn_days)
      && eff.respawn_days >= 1) ? eff.respawn_days : 1;
    const entry = campStocks[key];
    if (!entry || G.campStockDueRefresh(entry, clock.day, respawnDays)) {
      const shop = G.makeCampShop(x, y, clock.day, wealth, rec);
      if (!shop) return null;
      campStocks[key] = { day: clock.day, stock: shop.stock, seed: shop.seed };
    }
    const e = campStocks[key];
    return { x, y, buildingType: CAMP_ID, wealth, stock: e.stock, seed: e.seed };
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
        intervalMs: moveIntervalBase() })
    : null;
  function renderPos(now) {
    if (mover) {
      const p = mover.position(now);
      return { x: p.x, y: p.y };
    }
    return { x: player.x, y: player.y };
  }

  // Задача 000173: РЫВОК атакованной группы мобов к игроку на
  // глобальной карте (render-only, ТЗ): шаг-атака запускает мир-бой
  // (maybeStartCombat) — в ТОМ ЖЕ кадре спрайт группы глейдит к тайлу
  // игрока за MOB_CHARGE_MS (easeInOut — тот же createMover, что у
  // героя, 000033). Бой НЕ откладывается: опции startCombat бит-в-бит
  // (D2), логический тайл группы/seed/terrain/сейвы/RNG — без
  // изменений. Оба слоя рендера (проход 3 drawSprites и маркер
  // MOB_COLOR в buildFrame) рисуют ОДНУ дробную точку кадра
  // (принцип 000033). Сессионное состояние, сознательно ВНЕ сейва
  // (как defeatedAt — визуальное, 000122); цель заряда ЗАМОРОЖЕНА на
  // момент атаки (D4); очистка — ПЕРВАЯ строка onEnd (victory/fled/
  // dead).
  const MOB_CHARGE_MS = 1500;
  let mobCharge = null; // null | { key, from, to, mover }
  let lungeEndMs = 0;
  // now последнего кадра — только для debug-поля
  // state.mobCharge.pos (в vm performance.now() заморожен; время
  // анимации — ТОЛЬКО аргумент кадра frame(now), D-RNG-1).
  let lastFrameNow = 0;

  // Игровое время (spec/game-time.md, src/day.js).
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
  // Собранный природный лут (задача 000158.04): 'x,y' → день сбора
  // (респаун через respawn_days, «как для мобов»); ОТДЕЛЬНЫЙ раздел
  // от defeatedAt (не смешивать!).
  const collectedLoot = new Map();
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
  // (building-actions.js, не в кадре); повторного скана НЕТ (кэш в сейве).
  const teleports = new Map();
  // Квесты построек (задача 000074): 'x,y' → { questId: string,
  // day: integer≥1, status: 'active'|'done' } — ИСТОЧНИК ИСТИНЫ
  // (из него же rehydrateBuildingQuests воссоздаёт инстансы
  // questBook.source='building'). Раздел сейва `buildingQuests`
  // (имя зафиксировано контрактом 000074). «Раз в день» самого
  // касания — отдельно, buildingOncePerDay.
  const buildingQuests = new Map();
  // Отряд спутников (задача 000083, родитель 000065; сейв — 000085):
  // ЖИВЫЕ const-массивы — deps-бандл buildingActions передаёт ТЕ ЖЕ
  // ссылки в npcUI.open (контракт 000128 §2.2). 000085 восстановит
  // in place (length=0 + push, паттерн buffs) — ПЕРЕЗАПИСЫВАТЬ нельзя.
  // const, НЕ let: reassignment запрещён контрактом (deps-бандл и
  // npcUI держат ссылки).
  const hasCompanions = G.companions &&
    typeof G.companions.createRoster === 'function';
  const roster = hasCompanions ? G.companions.createRoster() : [];
  // записи {npcId, sheet, loyalty, hiredDay} погибших (000161, D1) —
  // гибель 000087, сейв 000085
  const deadMercs = [];
  if (!hasCompanions) {
    console.error('main.js: Game.companions отсутствует — ' +
      'src/companions.js обязан грузиться ДО src/main.js (000079) — ' +
      'найм/увольнение отключены');
  }
  // Задача 000087: отряд в игровом цикле — хелперы-клей (контракт
  // memory/000087-companion-cycle.md D4). После roster-блока: клозуры
  // roster/deadMercs/hasCompanions/NPCS объявлены выше. Новых модулей
  // НЕТ (main.js — клей; 0 script-тегов, 0 экспортов).
  // Имя NPC из каталога; «призрак» (id не в каталоге) → голый id
  // (паттерн 000083/000085).
  function npcName(id) {
    const npc = G.npcById ? G.npcById(NPCS, id) : null;
    return (npc && npc.имя) ? npc.имя : String(id);
  }
  // Снимок отряда на старте боя (D5): данные makeAlly по каждой записи
  // (kind 'merc', 000082) — порядок = порядок roster; «призрак» —
  // тихий skip (allyDataForEntry → null); деградация UMD → [] (бой
  // без отряда, не крах).
  function companionAllies() {
    if (!hasCompanions || typeof G.companions.allyDataForEntry !== 'function')
      return [];
    const out = [];
    for (const e of roster) {
      const npc = G.npcById ? G.npcById(NPCS, e.npcId) : null;
      const d = G.companions.allyDataForEntry(e, npc);
      if (d) out.push(d);
    }
    return out;
  }
  // 000194: снимок/санизация карты быстрых предметов союзников
  // (collectSaveData/restoreFromSave/старт боя). Ключи: 'efir' —
  // ВСЕГДА (постоянный союзник), остальные — только если в отряде
  // (roster, npcId) — «призрак» тихо обрезается (self-cleaning при
  // расформировании, паттерн dead_mercs). Значения: ровно 3 слота;
  // слот — только id предмета из каталога (G.getItem), иначе null
  // (подделка/редактирование каталога). Возврат — НОВЫЙ объект
  // (live-карта не мутирует при снимке).
  function sanitizeAllyQuick(map) {
    const out = {};
    if (!map || typeof map !== 'object' || Array.isArray(map)) return out;
    for (const k of Object.keys(map)) {
      if (k !== 'efir' &&
          !roster.some((e) => e && e.npcId === k)) continue;
      const raw = map[k];
      const arr = Array.isArray(raw) ? raw : [];
      out[k] = [0, 1, 2].map((i) =>
        (typeof arr[i] === 'string' && G.getItem(arr[i]))
          ? arr[i] : null);
    }
    return out;
  }
  // 000249: снимок/санизация карты «последнего заклинания»
  // (collectSaveData/restoreFromSave). Ключи: 'flogiston'/'efir' —
  // всегда, остальные — только если в отряде (roster, npcId) —
  // «призрак» тихо обрезается (паттерн sanitizeAllyQuick). Значение
  // — только строка из каталога заклинаний (G.SpellsData
  // .SPELLS_BY_ID), иначе отбрасывается (подделка); каталога нет —
  // fail-closed {} (деградация, не крах). Не-объект → {} (warn
  // печатает restore). Возврат — НОВЫЙ объект (live-карта не
  // мутирует при снимке).
  function sanitizeLastSpells(map) {
    const out = {};
    const cat = G.SpellsData && G.SpellsData.SPELLS_BY_ID;
    if (!map || typeof map !== 'object' || Array.isArray(map)
        || !cat) return out;
    for (const k of Object.keys(map)) {
      if (k !== 'flogiston' && k !== 'efir' &&
          !roster.some((e) => e && e.npcId === k)) continue;
      const v = map[k];
      if (typeof v === 'string' && cat[v]) out[k] = v;
    }
    return out;
  }
  // Конец боя (все 3 боевые точки, D2/D3/D9):
  //   * victory + res.allyXp (combat.js 000082) — applyCombatXp в
  //     записи (xp/уровни; while — несколько уровней за бой);
  //   * ЛЮБОЙ исход — гибель из ЖИВОГО объекта боя (combat.units:
  //     side 'ally', kind 'merc', !alive) → deadMercs-запись
  //     {npcId, sheet, loyalty, hiredDay} (окончательно, dedup по
  //     npcId; serializeDeadRecord, 000161) + splice записи. Эфир
  //     (kind 'efir') — НИКОГДА не попадает в deadMercs (SPEC: не
  //     умирает навсегда).
  // Мутирует roster/deadMercs in place (000085: const-ссылки,
  // переприсваиваний НЕТ). Возврат — строки: xp/уровни, потом гибель.
  function combatEndCompanions(res, combat) {
    if (!hasCompanions) return [];
    const xpLines = [];
    if (res && res.outcome === 'victory' && Array.isArray(res.allyXp) &&
        typeof G.companions.applyCombatXp === 'function') {
      const r = G.companions.applyCombatXp(roster, res.allyXp);
      if (r && Array.isArray(r.events)) {
        for (const ev of r.events) if (ev.type === 'level_up')
          xpLines.push(npcName(ev.npcId) + ' повысил уровень (до ' +
            ev.level + ').');
      }
      const gained = res.allyXp.filter((g) => g && g.xp > 0);
      if (gained.length)
        xpLines.push('Спутники: +' + gained[0].xp + ' опыта (' +
          gained.map((g) => npcName(g.id)).join(', ') + ').');
    }
    const deadLines = [];
    if (res && res.outcome === 'dead' && res.partyLost) {
      // 000164 (D4): партия погибла с игроком — ВСЕ ЗАПИСИ roster
      // (не только !alive-юниты: «призрак»-запись без юнита в c.units
      // тоже записывается) → deadMercs (записи 000161) + splice +
      // строки «X погиб в бою.» (SPEC). Эфира в roster нет (000087) —
      // исключён структурно. Порядок строк = порядок roster. else-if:
      // двойной проход дал бы дубль deadLines (дедуп ловит push, но не
      // строку).
      for (let i = 0; i < roster.length; i++) {
        const e = roster[i];
        if (!e || typeof e.npcId !== 'string') continue;
        // Дедуп — по npcId (string|record, first-wins) — ТО ЖЕ
        // выражение, что в !alive-цикле ниже (000161).
        if (!deadMercs.some((r) => (typeof r === 'string' ? r
            : (r && typeof r === 'object' && !Array.isArray(r) &&
               typeof r.npcId === 'string') ? r.npcId : null)
            === e.npcId)) {
          let rec = (typeof G.companions.serializeDeadRecord
              === 'function')
            ? G.companions.serializeDeadRecord(e) : null;
          if (rec == null) rec = e.npcId;
          deadMercs.push(rec);
        }
        roster.splice(i, 1);
        i -= 1;
        deadLines.push(npcName(e.npcId) + ' погиб в бою.');
      }
    } else if (combat && Array.isArray(combat.units)) {
      for (const u of combat.units) {
        if (u.side === 'ally' && u.kind === 'merc' && !u.alive) {
          const i = roster.findIndex((e) => e && e.npcId === u.id);
          // 000161 (D1): запись {npcId, sheet, loyalty, hiredDay}
          // вместо голого id — serialize ПЕРЕД splice (entry обязан
          // быть ещё в roster); дедуп — по npcId (string|record:
          // транзиентный fallback), first-wins (000085); fallback на
          // голый id — деградация бит-в-бит пре-000161 (entry без
          // sheet — инвариант-нарушение, в игре недостижимо; backfill
          // при restore, 000029).
          if (!deadMercs.some((r) => (typeof r === 'string' ? r
              : (r && typeof r === 'object' && !Array.isArray(r) &&
                 typeof r.npcId === 'string') ? r.npcId : null)
              === u.id)) {
            let rec = (i !== -1 &&
                typeof G.companions.serializeDeadRecord === 'function')
              ? G.companions.serializeDeadRecord(roster[i]) : null;
            if (rec == null) rec = u.id;
            deadMercs.push(rec);
          }
          if (i !== -1) roster.splice(i, 1);
          deadLines.push(npcName(u.id) + ' погиб в бою.');
        }
      }
    }
    return xpLines.concat(deadLines);
  }
  // Задача 000132: лут с мобов при победе (spec/mob-groups-storage.md «Лут»;
  // контракт — memory/000132-mob-loot.md) — ОДИН хелпер выдачи для
  // ВСЕХ 3 мест победы (onEnd: startCombatAt/maybeStartCombat/
  // startDungeonCombat): c.result.items [{id, qty}] → G.addItem в
  // инвентарь героя (плоский API items.js, прецедент сундука; G.*
  // читается ЛЕНИВО в момент вызова — 000038/000053). При ЛЮБОМ
  // отказе addItem (лимит веса/слоты) предмет НЕ теряется —
  // авто-золото по value предмета (базовая цена каталога, НЕ
  // sellPrice лавки: в бою лавки нет) + ОДНА агрегированная строка
  // «не влезло: +N золота». no-op guard ОБЯЗАТЕЛЕН: результат БЕЗ
  // items (мутационные e2e, 'fled'/'dead') — [] (байт-в-байт
  // HUD-пины 000087 не тронуты). НОЛЬ rng — выдача чистая функция
  // от res.items. Возврат — строки (hudFlash join('\n') / ds.log по
  // одной на push).
  let lootWarned = false;
  function combatEndLoot(res) {
    const isVictory = res && res.outcome === 'victory';
    if (!isVictory || !Array.isArray(res.items) || res.items.length === 0)
      return [];
    if (typeof G.addItem !== 'function' || typeof G.getItem !== 'function') {
      if (!lootWarned) {
        lootWarned = true;
        console.error('000132: G.addItem/G.getItem недоступны — '
          + 'предметный лут не выдан');
      }
      return [];
    }
    const names = [];
    let overflow = 0;
    for (const rec of res.items) {
      if (!rec || typeof rec.id !== 'string') continue;
      const it = G.getItem(rec.id);
      if (!it) continue; // неизвестный id — тихий skip (деградация)
      let qty = rec.qty;
      if (!Number.isInteger(qty) || qty < 1) qty = 1;
      const add = G.addItem(hero, rec.id, qty);
      if (add && add.ok) {
        names.push(qty > 1 ? it.name + ' ×' + qty : it.name);
      } else {
        overflow += (typeof it.value === 'number' ? it.value : 0) * qty;
      }
    }
    const lines = [];
    if (names.length) lines.push('Лут: ' + names.join(', ') + '.');
    if (overflow > 0) {
      hero.gold += overflow; // live-ссылка (паттерн спец-хендлеров)
      lines.push('не влезло: +' + overflow + ' золота');
    }
    return lines;
  }
  // Задача 000093: смотровая башня — «исследованные» окрестности:
  // 'x,y' башни → Set<'x,y'> тайлов окна Чебышёва (граница
  // включительно) — раздел сейва `explored` (имя зафиксировано
  // 000072; данные — memory/000093-explored.md). Идемпотентно
  // (объединение множеств); лимита раз-в-день НЕТ (взгляд бесплатен,
  // ТЗ). МИНИКАРТА — отсрочена (данные — заготовка).
  const explored = new Map();
  // «Ежедневный контент» построек (задача 000077: круг 43 / храм
  // 39): 'x,y' тайла → { day: integer≥1, type: 'chest'|'boss'|
  // 'relic' } — результат последнего ролла (лут НЕ храним — повтор
  // «молчит», содержимое выдано, R-5). ОБЩИЙ раздел для всех
  // «ежедневных» эффектов (контракт — memory/000077-daily-content.
  // md); имя зафиксировано резервом 000072. Запись — спец-хендлер
  // src/building-content.js (ЖИВАЯ ссылка через world); «раз в
  // день» — отдельно, buildingOncePerDay (backstop).
  const buildingContent = new Map();
  // Состояние городов (задача 000109): 'cx,cy' (ЯКОРЬ города,
  // buildingAnchor — НЕ тайл входа) → { lastVisitDay: int — АБСОЛЮТНЫЙ
  // день (000031), stock: { 'tx,ty': {itemId: qty} } }. stock —
  // LIVE-объекты (тот же объект, что у shop-объекта сессии; мутации
  // 000107 попадают в сейв). Раздел сейва — `cities` (имя
  // зафиксировано 000072, формат — контракт 000108). ds.contents у
  // города — ВСЕГДА null (состояние НЕ там: ловушка dungeon-ui.js —
  // memory/000109-city-save-respawn.md).
  const cityStates = new Map();
  // Панель «Отряд» (задача 000086): ЖИВЫЕ ссылки — мутация
  // roster (hire/dismiss/payWages) и efir (addEfirXp) видна панели
  // без re-wiring; onChange — хук сейва (saveNow, function-декларация
  // ниже — hoisted в этом же scope).
  if (G.squadUI && typeof G.squadUI.init === 'function') {
    G.squadUI.init({ roster, efir, onChange: saveNow });
  } else {
    console.error('main.js: Game.squadUI отсутствует — src/ui.js ' +
      'обязан грузиться ДО src/main.js (000086) — панель ' +
      '«Отряд» отключена');
  }
  // Задача 000076: модификаторы активных благословений на текущий
  // день (day.js buffMods, 000072) — для точек создания боя:
  // благословение действует во ВСЕХ боях дня (мир/подземелье/
  // отладочный). day.js отсутствует — undefined (ядро боя —
  // нейтральный дефолт, fail-open).
  function currentBuffMods() {
    const m = G.buffMods ? G.buffMods(buffs, clock.day) : undefined;
    if (G.Spells && typeof G.Spells.isHeroDivineProtected === 'function'
        && G.Spells.isHeroDivineProtected(hero, clock.day)) {
      return Object.assign({}, m, { incomingMult: 0.85 });
    }
    return m;
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
  // группы мобов (000031), отряд/Эфир/dead_mercs (000085) — доп. поля
  // БЕЗ повышения версии (неломкое расширение).
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
      // Задача 000158.04: природный лут — 'x,y' → день сбора.
      // ОТДЕЛЬНЫЙ раздел (НЕ смешивать с defeatedAt!); тот же
      // сериализатор dayMap (000072); неломкое расширение v1
      // (000031): версию НЕ поднимаем, миграций нет.
      collectedLoot: G.serializeDayMap
        ? G.serializeDayMap(collectedLoot) : {},
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
      // Задача 000074: квесты построек ('x,y' → запись) — источник
      // истины для questBook.source='building'. Неломкое расширение
      // v1 (000031): версию НЕ поднимаем, миграций нет.
      buildingQuests: (G.buildingEffects &&
        G.buildingEffects.serializeBuildingQuests)
        ? G.buildingEffects.serializeBuildingQuests(buildingQuests) : {},
      // Задача 000093: смотровая башня — исследованные окрестности
      // ('x,y' башни → каноническая строка окна). Пишется ВСЕГДА
      // (даже {}) — неломкое расширение v1 (000031): версию НЕ
      // поднимаем, миграций нет.
      explored: (G.buildingEffects && G.buildingEffects.serializeExplored)
        ? G.buildingEffects.serializeExplored(explored) : {},
      // Задача 000077: «ежедневный контент» построек (круг 43 /
      // храм 39) — 'x,y' → { day, type }. Неломкое расширение v1
      // (000031): версию НЕ поднимаем; старого сейва без раздела —
      // пустой Map, без warn (паттерн raw == null).
      buildingContent: (G.buildingEffects &&
        G.buildingEffects.serializeBuildingContent)
        ? G.buildingEffects.serializeBuildingContent(buildingContent)
        : {},
      // Задача 000085: отряд наёмников (записи сейва ровно 4 поля
      // {npcId, sheet, loyalty, hiredDay}, 000143/000139 C3 —
      // level/xp ВНУТРИ sheet; старая 5-полевая форма 000079 —
      // backfill при восстановлении), Эфир (5 полей, 000111) и
      // погибшие наёмники (записи той же 4-полевой формы, 000161).
      // Неломкое расширение v1 (000031): версию
      // НЕ поднимаем, миграций нет — СТАРЫЙ сейв без этих полей
      // восстанавливается restoreFromSave с пустым отрядом и Эфиром
      // L1 (ЗАФИКСИРОВАНО ТЗ).
      companions: (G.companions &&
        typeof G.companions.serializeRoster === 'function')
        ? G.companions.serializeRoster(roster) : [],
      efir: (G.efir && typeof G.efir.serializeEfir === 'function')
        ? G.efir.serializeEfir(efir) : null,
      dead_mercs: deadMercs.slice(),
      // 000194: быстрые предметы союзников { memberId →
      // (string|null)×3 } — снимок sanitizeAllyQuick. Пишется ВСЕГДА
      // (даже {}): неломкое расширение v1 (000031), версию НЕ
      // поднимаем; старому сейву раздела нет — restore чисто (без
      // warn, паттерн 000109 R5).
      ally_quick: sanitizeAllyQuick(allyQuick),
      // 000249: «последнее заклинание» { 'flogiston' | 'efir' |
      // npcId → id заклинания } — снимок sanitizeLastSpells.
      // Пишется ВСЕГДА (даже {}): неломкое расширение v1 (000031),
      // версию НЕ поднимаем, миграций нет; старому сейву раздела нет
      // — restore чисто (без warn, паттерн 000109 R5).
      last_spells: sanitizeLastSpells(lastSpells),
      // Задача 000109: состояние городов (сток лавок, день последнего
      // визита). Пишется ВСЕГДА (пусто — {}); неломкое расширение v1
      // (000031): версию НЕ поднимаем, миграций нет. ОБРЕЗКА истёкших
      // записей — внутри serializeCityStates (мир БЕСКОНЕЧЕН — без
      // неё раздел раздует localStorage до квоты).
      cities: (G.Cities && G.Cities.serializeCityStates)
        ? G.Cities.serializeCityStates(cityStates, clock.day,
            cityRespawnDays())
        : {},
      // Задача 000153.01: память этажей подземелий (содержимое
      // посещённых входов-глубин: открытые сундуки/побеждённые группы/
      // step/позиция) — ОДИН неломный топ-раздел (версию НЕ поднимаем,
      // миграций нет; старый сейв → пусто, без warn). Пишется ВСЕГДА
      // (даже {}). ОБРЕЗКА записей старше dungeon_memory_days — внутри
      // serializeDungeonMemory (мир БЕСКОНЕЧЕН — квота localStorage,
      // прецедент 000109). ACTIVE-MERGE (activeDungeonMemoryRec) —
      // фикс re-loot-эксплойта на первом же входе (записи в Map ещё
      // нет — только in-flight).
      dungeonMemory: G.serializeDungeonMemory
        ? G.serializeDungeonMemory(dungeonMemory, clock.day,
            dungeonMemoryDays(), activeDungeonMemoryRec())
        : {},
      // Задача 000095: барахолка лагеря — стоки стойок 'x,y' →
      // { day, stock } (seed НЕ сериализуется — перегенерируется
      // из x,y,day при восстановлении). Неломкое расширение v1
      // (000031): версию НЕ поднимаем, миграций нет.
      campStocks: G.serializeCampStocks
        ? G.serializeCampStocks(campStocks) : {},
      // Задача 000118: первая встреча Эфира (вариант (a)) — флаг
      // «встретился в бою». ТОП-УРОВЕНЬ (вне раздела efir — он
      // заморожен 5 полями, пины 000085/000115). Пишется ВСЕГДА
      // (true/false) — паттерн 000109 R5. Неломкое расширение v1
      // (000031): версию НЕ поднимаем, миграций нет.
      efir_met: efirMet,
    };
  }

  // false-возврат save() (квота localStorage, save.js) — сообщение
  // ОДИН раз за сессию (saveNow — на каждом мировом шаге: спам
  // недопустим); падений/confirm НЕТ (confirm — только
  // migration_failed/corrupt при загрузке).
  let saveWarned = false;
  // 000170 (D7): исключение в collectSaveData (раздел dead_mercs
  // 000161, новые DOM-снимки 10-07) — logged once, сейв пропущен
  // (G.save/save.js уже ловит setItem — второй try не нужен).
  let saveDataErrLogged = false;
  // 000138: флаг подавления re-сейва после ПОДТВЕРЖДЁННОГО
  // «Начать заново»: location.reload() fire'ит beforeunload →
  // saveNow() перезаписал бы (восстановленный) СТАРЫЙ сейв сразу
  // после G.clear — «сброс» тихо откатился бы (memory/000138-
  // start-window.md §6). Флаг ставится ДО clear+reload (блок
  // стартового окна ниже); ФЛАГ, а не removeEventListener — кроет
  // ЛЮБОЙ путь saveNow (каждый мировой шаг и beforeunload).
  let resetPending = false;
  function saveNow() {
    if (resetPending) return; // 000138: не перезаписывать после сброса
    if (!saveStorage || !G.save) return;
    // 000170 (D7): try/catch ТОЛЬКО вокруг collectSaveData —
    // исключение в сборе сейва НЕ может ронять вызывающие точки
    // (каждый мировой шаг, onDay, onEnd, exitLocation, beforeunload)
    // — этот сейв потерян, logged once; следующий шаг сейвится снова.
    let data;
    try {
      data = collectSaveData();
    } catch (err) {
      if (!saveDataErrLogged) {
        saveDataErrLogged = true;
        console.error('main.js: исключение в collectSaveData — сейв ' +
          'не записан (повторные предупреждения подавлены).', err);
      }
      return;
    }
    if (G.save(saveStorage, data) === false
        && !saveWarned) {
      saveWarned = true;
      console.warn('Сейв: квота localStorage исчерпана — сохранение ' +
        'не записано (повторные предупреждения подавлены).');
    }
  }
  window.addEventListener('beforeunload', saveNow);

  // --- Стартовое окно (задача 000138) ---
  // Логотип assets/logo.svg + «Продолжить» (зелёный) /
  // «Начать заново» (красный). Игра ПОД окном стартует как сейчас
  // (окно — оверлей, не гейт: пины e2e бута). Ядро —
  // src/start-window.js (Game.startWindow, чистая стейт-машина,
  // тестируется в node); здесь — DOM-привязка, сброс данных
  // (G.clear + reload) и подавление re-сейва (resetPending).
  // Модуль не загружен (регрессия порядка — UMD-ловушка 000038):
  // окна нет, игра стартует как раньше (деградация, не крах).
  let startWindow = null;
  if (G.startWindow &&
      typeof G.startWindow.createStartWindow === 'function') {
    startWindow = G.startWindow.createStartWindow({
      document,
      onRestartConfirmed: () => {
        // 000138: флаг ДО clear+reload — иначе beforeunload на
        // reload перезапишет старый сейв (saveNow выше).
        resetPending = true;
        if (saveStorage && G.clear) G.clear(saveStorage);
        const loc = window.location;
        if (loc && typeof loc.reload === 'function') loc.reload();
      },
    });
  } else {
    console.error('main.js: start-window.js не загружен (обязан ' +
      'стоять ДО src/main.js — UMD-ловушка 000038, задача ' +
      '000138) — нет стартового окна');
  }

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
          // 000235.02: эффекты вне боя — ОПЦИОНАЛЬНОЕ поле сейва v1
          // (без бампа, 000031): старому сейву поля нет → [];
          // подделанные записи чистятся по каталогу (Game.Spells).
          hero.outOfCombatEffects = (G.Spells
              && G.Spells.sanitizeOutOfCombatEffects)
            ? G.Spells.sanitizeOutOfCombatEffects(
                d.hero.outOfCombatEffects) : [];
          // 000235.04: портальная метка — опциональное поле сейва v1
          // (старый сейв → undefined → null; подделка → null, молча).
          hero.portal_marker = (G.Spells
              && typeof G.Spells.sanitizePortalMarker === 'function')
            ? G.Spells.sanitizePortalMarker(d.hero.portal_marker) : null;
          // Крафт (задача 000046): новые ОПЦИОНАЛЬНЫЕ поля сейва
          // (без повышения версии, 000031) — старым сейвам полей нет →
          // дефолты; подделанные значения чистятся санитизерами
          // (craft.js / items.js). Иначе прогресс крафта и бонусы
          // качества молча теряются при перезагрузке (data loss).
          hero.craft = G.sanitizeCraftLevels
            ? G.sanitizeCraftLevels(d.hero.craft) : {};
          hero.craftXp = G.sanitizeCraftXp
            ? G.sanitizeCraftXp(d.hero.craftXp) : {};
          hero.craftTypes = G.sanitizeCraftTypes
            ? G.sanitizeCraftTypes(d.hero.craftTypes) : {};
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

    // --- Отряд наёмников (companions) (задача 000085) ---
    // Записи в СЕЙВЕ — {npcId, sheet, loyalty, hiredDay} (000143:
    // level/xp — ВНУТРИ sheet); старая 5-полевая форма
    // {npcId, level, xp, loyalty, hiredDay} (000082/000085) —
    // backfill при восстановлении (000139 C3: неломаный сейв).
    // RUNTIME-запись — 6 ключей {npcId, sheet, level, xp, loyalty,
    // hiredDay} (level/xp — плоские зеркала sheet). Валидация —
    // G.companions.deserializeRoster («призрак» 000029: призрак/дубли/
    // битые числа/битое ядро sheet → dropped; тихая — warn печатает
    // здесь). Старому сейву раздела НЕТ → ПУСТОЙ отряд (ЗАФИКСИРОВАНО
    // ТЗ, warn НЕТ).
    // Live-ссылка: мутация in place — 000086/000087 держат state.roster.
    try {
      const rawC = d.companions;
      if (rawC != null && G.companions &&
          typeof G.companions.deserializeRoster === 'function') {
        const res = G.companions.deserializeRoster(NPCS, rawC);
        if (res === null) {
          console.warn('Сейв: раздел companions некорректен — сбрасываю.');
          roster.length = 0;
        } else {
          roster.length = 0;
          for (const e of res.roster) roster.push(e);
          if (res.roster.length === 0 && rawC.length > 0) {
            console.warn(
              'Сейв: companions — валидных записей нет — сбрасываю.');
          }
          if (res.dropped.length) {
            console.warn('Сейв: companions — отброшены: ' +
              res.dropped.join(', '));
          }
        }
      }
    } catch (err) {
      console.warn('Сейв: не удалось восстановить отряд:', err);
    }

    // --- Эфир (efir) (задача 000085; расширение 000115) ---
    // 5 полей {level, xp, skillXp, skills, spells} (000111). Любой
    // дефект раздела → тихий сброс на createEfir() (L1): efir создан
    // на старте сессии и ДО restore не мутировался — переназначать не
    // нужно (Object.assign — live-ссылка, паттерн hero: state и
    // combat-finish держат live-объект). Старому сейву раздела НЕТ →
    // L1 (ЗАФИКСИРОВАНО ТЗ, warn НЕТ). efir === null (модуль мёртв) —
    // тихий skip (console.error уже на загрузке). 000115: id-валидация
    // по каталогам-параметрам (чужой id → null на весь раздел) +
    // ОБЯЗАТЕЛЬНЫЙ reprocessEfirSkills ВНУТРИ deserialize (канон 000111
    // §9 — выход ПЛОТНЫЙ: все 4 id пула материализованы); проводки
    // reprocess здесь НЕТ (внутри десериализатора).
    try {
      const rawE = d.efir;
      if (rawE != null && efir && G.efir &&
          typeof G.efir.deserializeEfir === 'function') {
        const e = G.efir.deserializeEfir(rawE,
          EFIR_SKILL_CATALOG, EFIR_SPELL_CATALOG);
        if (e) {
          Object.assign(efir, e);
        } else {
          console.warn('Сейв: раздел efir некорректен — сбрасываю.');
        }
      }
    } catch (err) {
      console.warn('Сейв: не удалось восстановить Эфира:', err);
    }

    // --- Погибшие наёмники (dead_mercs) (задача 000085; 000161) ---
    // Массив записей {npcId, sheet, loyalty, hiredDay} (000161, D1)
    // + legacy-строки (голый npcId — старые сейвы): только merc
    // (каталог + объект «найм» — критерий, СТРОЖЕ чистого членства:
    // self-cleaning при правках каталога; консистентно с roster).
    // Пайплайн revive → serialize (G.companions, 000161): string —
    // backfill (новый лист из каталога, loyalty 50, hiredDay 0 —
    // тихий сброс 000029, задокументировано); record — sanitize
    // (битое ядро/нет sheet/битые скаляры — сброс ЗАПИСИ, НЕ починка
    // значения, 000085/000143 → bad). Битый раздел/призрак/дубли/
    // подделка — отброс + warn (000029, паттерн restoreNpcStocks).
    // canRevive-деградация (нет экспорта — в игре недостижимо,
    // vm-тесты со срезанной цепочкой): string — legacy-путь
    // бит-в-бит, record — bad+warn (не восстановить). Старому сейву
    // раздела нет → [].
    try {
      const rawD = d.dead_mercs;
      if (rawD != null) {
        if (!Array.isArray(rawD)) {
          console.warn('Сейв: раздел dead_mercs некорректен — сбрасываю.');
          deadMercs.length = 0;
        } else {
          const canRevive = hasCompanions &&
            typeof G.companions.reviveEntryFromRecord === 'function' &&
            typeof G.companions.serializeDeadRecord === 'function';
          const kept = [];      // записи 4 полей (деградация: строки)
          const bad = [];
          const keptIds = new Set();
          for (const it of rawD) {
            const id = typeof it === 'string' ? it
              : (it && typeof it === 'object' && !Array.isArray(it) &&
                 typeof it.npcId === 'string') ? it.npcId : null;
            if (id == null) continue; // мусор — тихий skip
            const npc = NPCS.find((n) => n && n.id === id &&
              n.найм && typeof n.найм === 'object');
            if (!npc || keptIds.has(id)) { bad.push(id); continue; }
            let rec = null;
            if (canRevive) {
              const e = G.companions.reviveEntryFromRecord(NPCS, it);
              rec = e ? G.companions.serializeDeadRecord(e) : null;
              if (rec == null) { bad.push(id); continue; } // подделка
            } else if (typeof it === 'string') {
              rec = it; // деградация (нет экспорта): legacy бит-в-бит
            } else {
              bad.push(id); continue; // record без модуля — нет
            }
            keptIds.add(id);
            kept.push(rec);
          }
          deadMercs.length = 0;
          for (const rec of kept) deadMercs.push(rec);
          if (bad.length) {
            console.warn('Сейв: dead_mercs — неизвестные/дубли npcId: ' +
              bad.join(', '));
          }
        }
      }
    } catch (err) {
      console.warn('Сейв: не удалось восстановить dead_mercs:', err);
    }

    // --- Быстрые предметы союзников (ally_quick) (задача 000194) ---
    // { memberId → (string|null)×3 }: sanitizeAllyQuick ('efir' —
    // всегда, остальные — только в-отряде, слоты — id каталога,
    // иначе null). Старому сейву раздела нет (raw == null) — map
    // остаётся ПУСТОЙ, без warn (паттерн 000109 R5). Восстановление
    // — IN PLACE в live-объект (он же у G.playerUI — live-ссылка
    // панели; замена объектом сломала бы ссылку).
    try {
      const rawQ = d.ally_quick;
      if (rawQ != null) {
        const clean = (typeof rawQ !== 'object' || Array.isArray(rawQ))
          ? (console.warn(
              'Сейв: раздел ally_quick некорректен — сбрасываю.'), {})
          : sanitizeAllyQuick(rawQ);
        for (const k of Object.keys(allyQuick)) delete allyQuick[k];
        for (const k of Object.keys(clean)) allyQuick[k] = clean[k];
      }
    } catch (err) {
      console.warn('Сейв: не удалось восстановить ally_quick:', err);
    }

    // --- «Последнее заклинание» (last_spells) (задача 000249) ---
    // { 'flogiston' | 'efir' | npcId → id заклинания }:
    // sanitizeLastSpells (ключи — герой/Эфир/в-отряде, значение — id
    // каталога SPELLS_BY_ID). Старому сейву раздела нет (raw ==
    // null) — map остаётся ПУСТОЙ, без warn (паттерн 000109 R5;
    // состояние «до фичи»). Восстановление — IN PLACE в live-объект
    // (combat-ui держит ссылку как opts.lastSpells; замена объектом
    // сломала бы ссылку).
    try {
      const rawLS = d.last_spells;
      if (rawLS != null) {
        const cleanLS = (typeof rawLS !== 'object'
            || Array.isArray(rawLS))
          ? (console.warn(
              'Сейв: раздел last_spells некорректен — сбрасываю.'), {})
          : sanitizeLastSpells(rawLS);
        for (const k of Object.keys(lastSpells)) delete lastSpells[k];
        for (const k of Object.keys(cleanLS)) lastSpells[k] = cleanLS[k];
      }
    } catch (err) {
      console.warn('Сейв: не удалось восстановить last_spells:', err);
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

    // --- Природный лут: собранное (задача 000158.04) ---
    // 'x,y' → день сбора. ОТДЕЛЬНЫЙ раздел (НЕ смешивать с
    // defeatedAt). Старый сейв без поля — тихо (пустая карта,
    // 000031); битый раздел — отброс + предупреждение (000029);
    // «собрано в будущем» день (dd > clock.day) — отброс
    // (подделка, 000031 — дни абсолютные).
    try {
      const raw = d.collectedLoot;
      if (raw != null) {
        if (typeof raw !== 'object' || Array.isArray(raw)) {
          console.warn(
            'Сейв: раздел collectedLoot некорректен — сбрасываю.');
          collectedLoot.clear();
        } else if (G.restoreDayMap) {
          const m = G.restoreDayMap(raw);
          for (const [k, dd] of m) {
            if (dd > clock.day) m.delete(k);
          }
          collectedLoot.clear();
          for (const [k, v] of m) collectedLoot.set(k, v);
          if (m.size === 0 && Object.keys(raw).length > 0) {
            console.warn(
              'Сейв: collectedLoot — валидных записей нет — ' +
              'сбрасываю.');
          }
        }
      }
    } catch (err) {
      console.warn('Сейв: не удалось восстановить collectedLoot:', err);
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

    // --- Квесты построек (buildingQuests) (задача 000074) ---
    // 'x,y' → { questId, day, status: 'active'|'done' } — источник
    // истины; из него же ниже rehydrateBuildingQuests воссоздаёт
    // инстансы questBook.source='building'. restoreBuildingQuests
    // сам отбрасывает мусорные записи (000029, паттерн 000072/75);
    // дополнительно: 'active' с днём ВЫДАЧИ позже дня мира —
    // подделанный сейв, отбрасываем (+warn). 'done' — ВСЕГДА
    // храним (отброс позволил бы повторную выдачу и повторную
    // награду — повторного касания к уже «замолчавшему» обелиску
    // нет, но запись done — единственный маркер «выплачено»).
    try {
      const rawBQ = d.buildingQuests;
      if (rawBQ != null) {
        if (typeof rawBQ !== 'object' || Array.isArray(rawBQ)) {
          console.warn('Сейв: раздел buildingQuests некорректен — сбрасываю.');
          buildingQuests.clear();
        } else if (G.buildingEffects &&
                   G.buildingEffects.restoreBuildingQuests) {
          const mBQ = G.buildingEffects.restoreBuildingQuests(rawBQ);
          for (const [k, v] of mBQ) {
            if (v.status === 'active' &&
                Number.isInteger(v.day) && v.day > clock.day) {
              console.warn('Сейв: квест постройки ' + k +
                ' выдан в день ' + v.day + ' > дня мира ' + clock.day +
                ' — отбрасываю.');
            } else {
              buildingQuests.set(k, v);
            }
          }
          if (mBQ.size === 0 && Object.keys(rawBQ).length > 0) {
            console.warn(
              'Сейв: buildingQuests — валидных записей нет — сбрасываю.');
          }
        }
      }
    } catch (err) {
      console.warn('Сейв: не удалось восстановить buildingQuests:', err);
    }

    // --- Исследованные окрестности (explored) (задача 000093) ---
    // 'x,y' башни → 'x,y;x,y;…' (окно Чебышёва; данные —
    // memory/000093-explored.md). restoreExplored ТИХИЙ (без
    // console) — warn живёт здесь (1:1 шаблон teleports, 000072):
    // битый раздел — fail-open сброс, игра не роняется (000029).
    // Старому сейву раздела нет — пустой Map → записан обратно {}.
    try {
      const rawE = d.explored;
      if (rawE != null) {
        if (typeof rawE !== 'object' || Array.isArray(rawE)) {
          console.warn('Сейв: раздел explored некорректен — сбрасываю.');
          explored.clear();
        } else if (G.buildingEffects &&
                   G.buildingEffects.restoreExplored) {
          const mE = G.buildingEffects.restoreExplored(rawE);
          explored.clear();
          for (const [k, v] of mE) explored.set(k, v);
          if (mE.size === 0 && Object.keys(rawE).length > 0) {
            console.warn(
              'Сейв: explored — валидных записей нет — сбрасываю.');
          }
        }
      }
    } catch (err) {
      console.warn('Сейв: не удалось восстановить explored:', err);
    }

    // --- «Ежедневный контент» построек (buildingContent,
    // задача 000077: круг 43 / храм 39) ---
    // 'x,y' → { day, type: 'chest'|'boss'|'relic' } — результат
    // последнего ролла. restoreBuildingContent сам отбрасывает
    // мусорные ЗАПИСИ (000029, паттерн 000072/75); дополнительно:
    // запись с днём позже дня мира — подделанный сейв, ОТБРОС
    // (+warn) (000031: дни абсолютные); день < дня мира — НОРМА,
    // храним (повтор блокируется только в тот же день — новый
    // ролл дня D+1 не затираем). Старого сейва без раздела —
    // пусто, без warn (паттерн raw == null).
    try {
      const rawBC = d.buildingContent;
      if (rawBC != null) {
        if (typeof rawBC !== 'object' || Array.isArray(rawBC)) {
          console.warn(
            'Сейв: раздел buildingContent некорректен — сбрасываю.');
          buildingContent.clear();
        } else if (G.buildingEffects &&
                   G.buildingEffects.restoreBuildingContent) {
          const mBC = G.buildingEffects.restoreBuildingContent(rawBC);
          for (const [k, v] of mBC) {
            if (Number.isInteger(v.day) && v.day > clock.day) {
              console.warn('Сейв: запись buildingContent ' + k +
                ' с днём ' + v.day + ' > дня мира ' + clock.day +
                ' — отбрасываю.');
            } else {
              buildingContent.set(k, v);
            }
          }
          if (mBC.size === 0 && Object.keys(rawBC).length > 0) {
            console.warn(
              'Сейв: buildingContent — валидных записей нет — ' +
              'сбрасываю.');
          }
        }
      }
    } catch (err) {
      console.warn('Сейв: не удалось восстановить buildingContent:', err);
    }

    // --- Состояние городов (cities) (задача 000109) ---
    // 'cx,cy' (якорь) → { lastVisitDay (абсолютный день), stock }.
    // restoreCityStates сам отбрасывает невалидные записи (000029)
    // и ОБРЕЗАЕТ истёкшие/«будущие» (fastForward без слушателей —
    // 000031: onDay-очистка при восстановлении НЕ пройдёт, restore
    // обрезает сам). Битый раздел — warn + сброс (паттерн
    // 000072/teleports/buildingQuests); игру не роняем.
    try {
      const rawCities = d.cities;
      if (rawCities != null) {
        if (typeof rawCities !== 'object' || Array.isArray(rawCities)) {
          console.warn('Сейв: раздел cities некорректен — сбрасываю.');
          cityStates.clear();
        } else if (G.Cities && G.Cities.restoreCityStates) {
          const mC = G.Cities.restoreCityStates(rawCities, clock.day,
            cityRespawnDays());
          for (const [k, v] of mC) cityStates.set(k, v);
          if (mC.size === 0 && Object.keys(rawCities).length > 0) {
            console.warn(
              'Сейв: cities — валидных записей нет — сбрасываю.');
          }
        }
      }
    } catch (err) {
      console.warn('Сейв: не удалось восстановить cities:', err);
    }

    // --- Память этажей подземелий (dungeonMemory) (задача 000153.01) ---
    // 'x,y:depth' (вход + глубина) → { contents, lastVisitDay, pos? }.
    // restoreDungeonMemory сам отбрасывает невалидные ключи/записи и
    // ОБРЕЗАЕТ истёкшие/«будущие» (те же правила, что serialize).
    // ОТСУТСТВУЮЩИЙ раздел (raw == null — старый сейв) — молча пусто
    // (000115: без warn); явно битый раздел (non-object) — warn +
    // сброс (паттерн 000072/000109); ключи есть, но валидных 0 — warn.
    // День мира восстановлен выше (clock.fastForward) — restore
    // сверяет с ним.
    try {
      const rawDM = d.dungeonMemory;
      if (rawDM != null) {
        if (typeof rawDM !== 'object' || Array.isArray(rawDM)) {
          console.warn('Сейв: раздел dungeonMemory некорректен — сбрасываю.');
          dungeonMemory.clear();
        } else if (G.restoreDungeonMemory) {
          const mDM = G.restoreDungeonMemory(rawDM, clock.day,
            dungeonMemoryDays());
          for (const [k, v] of mDM) dungeonMemory.set(k, v);
          if (mDM.size === 0 && Object.keys(rawDM).length > 0) {
            console.warn(
              'Сейв: dungeonMemory — валидных записей нет — сбрасываю.');
          }
        } else {
          console.warn(
            'Сейв: раздел dungeonMemory — restore недоступен — сбрасываю.');
        }
      }
    } catch (err) {
      console.warn('Сейв: не удалось восстановить dungeonMemory:', err);
    }

    // --- Барахолка лагеря (задача 000095): стоки стойок 'x,y' ---
    // Битый раздел — warn + ПУСТО (fail-open 000029/000072); старые
    // сейвы БЕЗ секции — rawCamp null → без действия. День мира
    // восстановлен выше (clock.fastForward) — restore сверяет с ним.
    try {
      const rawCamp = d.campStocks;
      if (rawCamp != null && G.restoreCampStocks) {
        const restored = G.restoreCampStocks(
          rawCamp, clock.day, (x, y) => map.tileAt(x, y),
          G.getBuilding(CAMP_ID));
        for (const k of Object.keys(campStocks)) delete campStocks[k];
        Object.assign(campStocks, restored);
      } else if (rawCamp != null) {
        console.warn('Сейв: раздел campStocks — restore недоступен — сбрасываю.');
      }
    } catch (err) {
      console.warn('Сейв: не удалось восстановить campStocks:', err);
    }

    // --- Первая встреча Эфира (задача 000118, вариант (a)) ---
    // Топ-уровневое поле efir_met (boolean). Строгая валидация:
    // boolean (true И false) → принять молча (поле ВСЕГДА пишется —
    // false = штатный сейв ДО первого боя с Эфиром, warn об «невалидном
    // значении» здесь был бы ложным); мусор (не-boolean, != null) →
    // warn + false; отсутствует (старый сейв) → молча false. Безопасное
    // направление деградации: при любом сбросе строка первой встречи
    // максимум РАЗ повторится (сессионный one-shot efir.js — вторая
    // преграда), не пропадёт.
    try {
      if (typeof d.efir_met === 'boolean') {
        efirMet = d.efir_met;
      } else if (d.efir_met != null) {
        console.warn('Сейв: efir_met — невалидное значение, сброс');
        efirMet = false;
      }
    } catch (err) {
      console.warn('Сейв: не удалось восстановить efir_met:', err);
    }

    // --- Позиция ---
    // 000235.08: heroPassable, а не t.passable — позиция на воде под
    // frost_walk (1 день) сохраняется; день/эффекты восстановлены
    // выше (блок «День мира» + hero.outOfCombatEffects).
    try {
      const p = d.position;
      if (p && Number.isInteger(p.x) && Number.isInteger(p.y)) {
        if (heroPassable(map.tileAt(p.x, p.y), clock.day)) {
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

    // 000074: квесты построек → журнал (из раздела buildingQuests;
    // инстансы source='building' serializeQuestBook не пишет — R2).
    if (questBook && G.rehydrateBuildingQuests) {
      try { G.rehydrateBuildingQuests(questBook, buildingQuests); }
      catch (err) { console.warn('Сейв: квесты построек:', err); }
    }

    if (G.playerUI) {
      try { G.playerUI.render(); }
      catch (err) { console.warn('Сейв: не удалось отрисовать панель:', err); }
    }
  }
  let hudFlash = '';
  let hudFlashUntil = 0;

  // Подземелье/город (000105): текущая вылазка и память содержимого
  // по входам. dungeonMemory: 'x,y:depth' входа+глубины →
  // { contents, lastVisitDay, pos? } (pos — только in-flight-сейв,
  // 000153.01; для ГОРОДА не применяется — персистентность сейва,
  // 000109).
  // { dg, contents, kind: 'dungeon'|'city', name (город), x, y,
  //   prevX, prevY, worldKey, log, mover, pos }
  // (mover/pos — 000068: мувер motion.js + дробная позиция рендера)
  let dungeonState = null;
  const dungeonMemory = new Map();

  // 000153.01: запись АКТИВНОГО этажа для раздела dungeonMemory
  // (merge «активный поверх» в serializeDungeonMemory, collectSaveData):
  // при ПЕРВОМ входе содержимое ещё НЕ в Map (запись появляется только
  // в exitDungeon) — in-flight-сэйв без активного рекорда = пустой
  // раздел = re-loot-эксплойт снова. null — вне подземелья (город /
  // мир — не влияют; kind-гард — паттерн __game.dungeon).
  function activeDungeonMemoryRec() {
    if (!dungeonState || dungeonState.kind !== 'dungeon') return null;
    const ds = dungeonState;
    // Ревью 000153.01: debug-вход с вынужденным terrain ≠ тайла —
    // чужой контент (форма/тип) НЕ мержится в раздел под мирским
    // ключом (memoryBanned — locations.js debugEnterDungeon).
    if (ds.memoryBanned) return null;
    const depth = ds.dg && Number.isInteger(ds.dg.depth) && ds.dg.depth >= 1
      ? ds.dg.depth : 1;
    const key = G.dungeonMemoryKey
      ? G.dungeonMemoryKey(ds.worldKey, depth)
      : ds.worldKey + ':' + depth;
    return { key, contents: ds.contents, lastVisitDay: clock.day,
      pos: { x: ds.x, y: ds.y } };
  }

  // Смена дня: восстановление, респауны групп (spec/game-time.md).
  // 000170 (D8): watchdog ОКРУЖАЕТ ВЕСЬ ТЕЛО listener'а — максимальная
  // 10-07 исключительная поверхность (playerUI/squadUI — DOM-партии,
  // saveNow) НЕ может рвать день-цепь (clock.event), в т.ч. в выходе
  // из подземелья (D6-finally — страховка). Все МУТАЦИИ тела идут ДО
  // DOM-вызовов → throw в render теряет только flash-строку/сейв.
  let onDayErrLogged = false;
  clock.onDay(({ day }) => {
    try {
      // часть HP/MP по формулам навыков
      G.restoreDay(hero, ((G.Spells && G.Spells.isHeroCamped
        && G.Spells.isHeroCamped(hero, day)) || (G.Spells
        && G.Spells.isHeroPrayer
        && G.Spells.isHeroPrayer(hero, day))) ? 1.1 : 1);
      const due = G.dueForRespawn(defeatedAt, day);
      for (const k of due) defeatedAt.delete(k);
      // 000158.04: респаун природного лута — ТОТ ЖЕ параметр
      // respawn_days (live, 000099), «как для мобов».
      const dueLoot = G.dueForRespawn(collectedLoot, day);
      for (const k of dueLoot) collectedLoot.delete(k);
      // Задача 000072: истёкшие благословения — абсолютные дни
      // (buff.day < day; легитимное благословение — 1 день).
      for (let i = buffs.length - 1; i >= 0; i--) {
        if (buffs[i].day < day) buffs.splice(i, 1);
      }
      // 000235.02: истёкшие эффекты вне боя (expiresDay <= day —
      // граница: эффект живёт ровно days дней). МУТАЦИЯ ДО payWages/
      // render/saveNow (D8); новых flash-строк НЕТ (:1607-1610
      // байт-забинуется).
      hero.outOfCombatEffects = G.Spells
        ? G.Spells.expireOutOfCombatEffects(
            hero.outOfCombatEffects, day)
        : hero.outOfCombatEffects;
      // 000235.08 (ревью): истечение frost_walk на воде без суши в
      // 8-соседстве — шаг невозможен (addStep — только на успешном
      // шаге), день не тикает, rest — только в постройке — софтлок
      // до полной перезагрузки. Инвариант: в конце onDay герой — на
      // heroPassable-тайле (перенос — перенос, не телепорт-спавн).
      let relocated = false;
      if (!heroPassable(map.tileAt(player.x, player.y), day)) {
        relocateToNearestPassable();
        relocated = true;
      }
      // Задача 000087: жалованье отряда (000079) — МЕЖДУ buff-cleanup
      // и render, ДО saveNow (D1/D8): payWages мутирует
      // hero.gold/roster in place — существующий saveNow в конце
      // фиксирует итог. day — НОВЫЙ день (аргумент колбэка): сид
      // ухода (day, npcId) детерминирован.
      // Пустой отряд: total = 0 → events: [] (контракт ядра) →
      // compLines пусто → flash БАЙТ-В-БАЙТ как до 000087 (тест V3).
      // «Уход» — splice ВНУТРИ payWages (000079); main.js строит
      // только строки.
      let compLines = [];
      if (hasCompanions
          && typeof G.companions.payWages === 'function') {
        const wr = G.companions.payWages(roster, NPCS, hero, day);
        if (wr && Array.isArray(wr.events)) {
          for (const ev of wr.events) {
            if (ev.type === 'wages_paid') {
              compLines.push('Жалованье выплачено.');
            } else if (ev.type === 'wages_unpaid') {
              compLines.push('Не хватает денег на жалованье — лояльность падает.');
            } else if (ev.type === 'left') {
              compLines.push(npcName(ev.npcId) + ' покинул отряд.');
            } else if (ev.type === 'left_blocked') {
              compLines.push(npcName(ev.npcId) + ' хотел уйти, но не смог '
                + 'вернуть экипировку: ' + ev.reason + '.');
            }
          }
        }
      }
      // Ревью 000087: панель «Отряд» (000086) держит live-ссылку на
      // roster — после payWages (лояльность/уход) открытая панель
      // перерисовывается. Guard — no-op до 000086 (G.squadUI нет);
      // паттерн тот же, что в 3 точках старта боя (там — закрытие).
      if (G.squadUI && G.squadUI.isOpen()) G.squadUI.render();
      G.playerUI && G.playerUI.render();
      // Порядок строк (D1): «Мобилизуются…» → строки отряда
      // → «День N.» (день — ПОСЛЕДНЯЯ строка, как до 000087).
      hudFlash = (relocated
        ? 'Позиция непроходима — перенос на ближайший проходимый тайл.\n'
        : '')
        + (due.length ? 'Мобилизуются новые группы мобов.\n' : '')
        + (compLines.length ? compLines.join('\n') + '\n' : '')
        + 'День ' + day + '.';
      hudFlashUntil = performance.now() + 5000;
      saveNow();
    } catch (err) {
      if (!onDayErrLogged) {
        onDayErrLogged = true;
        console.error('main.js: исключение при смене дня (день '
          + day + ') — остаток дня не обработан (повторные '
          + 'предупреждения подавлены).', err);
      }
    }
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

  // 000235.08 (ревью): перенос героя с непроходимого тайла (истечение
  // frost_walk на открытом водном пространстве): спираль от позиции
  // героя (паттерн findSpawn — ближайший проходимый БЕЗ группы),
  // moveHero (телепорт-снап 000033 — персонаж не «скользит»).
  // Фолбэк — findSpawn (проходимый тайл на карте есть всегда; его
  // throw — в onDay-вочдог, герой остаётся как был).
  function relocateToNearestPassable() {
    for (let r = 1; r <= 200; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const t = map.tileAt(player.x + dx, player.y + dy);
          if (t.passable && !t.hasMobGroup) {
            moveHero(player.x + dx, player.y + dy);
            return;
          }
        }
      }
    }
    findSpawn();
    prevPos.x = player.x; prevPos.y = player.y;
    if (mover) mover.teleport(player.x, player.y);
  }

  // --- Постройки [E] (задача 000128): роутер и проводка действий —
  // в src/building-actions.js (Game.buildingActions) ---
  // Именованные замыкания — узкие точки мира для роутера: 1:1 с
  // телами перенесённых функций. flash — инлайновые флэш-места
  // пайплайна действий [E]: та же константа 5000 и те же
  // let-переменные hudFlash/hudFlashUntil (иначе HUD-тайминг флэшей
  // сдвинется).
  function flash(msg) {
    hudFlash = msg;
    hudFlashUntil = performance.now() + 5000;
  }
  // Перенос героя (телепорт-чанк 000075 1:1): снап мувера (000033) —
  // персонаж не «скользит» от старой точки (паттерн
  // restoreFromSave).
  function moveHero(x, y) {
    player.x = x;
    player.y = y;
    prevPos.x = player.x; prevPos.y = player.y;
    if (mover) mover.teleport(player.x, player.y);
  }
  function playerRender() {
    G.playerUI && G.playerUI.render();
  }
  // Первая встреча Эфира (задача 000118, вариант (a)): фиксация
  // флага efirMet ПО ФАКТУ боя с Эфиром. Проверяет РЕАЛЬНЫЕ units
  // созданного боя (а не модульную переменную `efir`) — корректно,
  // если Эфир не попал в бой (деградация opts.efir/efirAllyData).
  // Вызываемый сразу после ВСЕХ трёх точек startCombat (мир/
  // debug/подземелье) — до первой точки saveNow (post-бой); crash
  // до неё → строка повторится ОДИН раз (задокументировано).
  function noteEfirCombat(combat) {
    if (combat && !efirMet
        && combat.units.some((u) => u && u.id === 'efir'
            && u.side === 'ally')) {
      efirMet = true;
    }
  }
  // 000235.03: снятие невидимости вступлением в бой — на всех 3
  // точках startCombat (после guard'ов, до startCombat); тихий
  // call-time гард (деградация — до-.03, игра не падает).
  function clearInvisibilityOnCombatStart() {
    if (G.Spells && typeof G.Spells.clearInvisibility === 'function') {
      G.Spells.clearInvisibility(hero);
    }
  }
  // Бой на текущем тайле (одна точка истины мир-боя: делегация
  // __game.actions.startCombat ниже; тело — 1:1). extra (задача
  // 000077): { seed } — детерминированный боевой сид (босс
  // «ежедневного контента» — BOSS_COMBAT_SEED по (tile, day));
  // ОДНОАРГУМЕНТНЫЕ вызовы (debug-бой, делегация) — БЕЗ ИЗМЕНЕНИЙ
  // (seed 42). Новые боевые точки — расширяют extra, НЕ создают
  // параллельных функций (контракт 000077 R-8).
  function startCombatAt(groupType = 0, extra = null) {
    if (G.combatUI && G.combatUI.isActive()) return null;
    // Тот же паттерн, что и в боях мира/подземелья (000096):
    // после отладочного боя полноэкранная панель не должна
    // накрывать карту.
    if (G.playerUI && G.playerUI.isOpen()) G.playerUI.toggle(false);
    // 000086: панель «Отряд» под непрозрачным боевым оверлеем
    // (z-20) устаревает (000087 мутирует уровни roster, Эфир xp) —
    // закрыть во всех входах (паттерн 000096).
    if (G.squadUI && G.squadUI.isOpen()) G.squadUI.toggle(false);
    // Стек оверлеев (000071): оверлей действий под боем — закрыть.
    if (G.buildingUI && G.buildingUI.isActive()) G.buildingUI.close();
    if (G.craftUI && G.craftUI.isActive()) G.craftUI.close(); // 000126
    // Бой «на текущем тайле»: prev = тайл, на котором герой стоит
    // (у мира — prevPos, тайл, с которого зашёл; здесь герой в бою не
    // сдвигается, поэтому «возврат» при не-победе — на тот же тайл).
    const prev = { x: player.x, y: player.y };
    // Задача 000087: `const combat` — onEnd (finish) читает ЖИВОЙ
    // объект боя ПОЗЖЕ return (гибель — по combat.units, D2);
    // startCombat → null (isActive guard выше) → onEnd не вызывается.
    clearInvisibilityOnCombatStart();
    const combat = G.combatUI.startCombat({
      hero,
      // Эфир (задача 000081): постоянный союзник — ВСЕГДА, включая
      // отладочный бой (тоже боевой, с xp).
      efir,
      // 000118 (вариант (a)): флаг первой встречи (из сейва) —
      // шов createCombat (строка не повторится).
      efirMet,
      // Задача 000087: отряд — данные makeAlly (000082), ПОСЛЕ Эфира
      // (companionAllies: снимок на старте боя, D5).
      rosterData: companionAllies(),
      // 000194: быстрые предметы союзников — снимок live-карты
      // (sanitizeAllyQuick: ключи/слоты только валидные).
      allyQuick: sanitizeAllyQuick(allyQuick),
      // 000195: та же live-карта — re-sync u.quick в бою (syncAllyQuickLive).
      allyQuickLive: allyQuick,
      // 000249: та же live-карта — «последнее заклинание» (сидинг
      // союзников на старте + запись на успешном касте, combat-ui).
      lastSpells: lastSpells,
      tile: { mobGroup: groupType },
      // Бой «на текущем тайле»: передаём terrain реального тайла
      // (задача 000049) — согласованно с боем мира; без карты
      // фолбэк plain.svg.
      terrain: map ? map.tileAt(player.x, player.y).terrain : undefined,
      spriteLoader,
      prev,
      // Задача 000077: боевой сид из extra (босс «ежедневного
      // контента»); без extra — 42 (поведение БЕЗ ИЗМЕНЕНИЙ).
      seed: (extra && extra.seed != null) ? extra.seed : 42,
      day: clock.day,
      // Задача 000076: активные благословения — во ВСЕХ боях дня.
      buffMods: currentBuffMods(),
      // onEnd 1:1 с боем мира (000077, ревью): победа — flash +
      // квесты kill_group; смерть — подъём (половина HP, −20% золота —
      // полная система смерти 000008) + flash; побег — flash. Не-победа
      // — возврат на точку боя (prev — текущий тайл). saveNow —
      // существующая пост-боевая точка сейва (ТЗ: «сейв после боя —
      // существующие точки saveNow»): без него перемены героя после
      // босс-боя фиксировались бы только следующей точкой сейва.
      onEnd: (res) => {
        // Лут/опыт уже начислены в ядре (checkVictory).
        if (res && res.outcome === 'victory') {
          // Квесты: kill_group (задача 000010).
          if (questBook && G.notifyGroupDefeated) {
            G.notifyGroupDefeated(NPCS, questBook, groupType);
          }
          hudFlash = `Победа! +${res.xp} опыта, +${res.gold} золота.`;
        } else if (res && res.outcome === 'dead') {
          // Подъём: половину HP, −20% золота (полная система смерти —
          // 000008).
          hero.alive = true;
          hero.hp = Math.max(1, Math.round(G.derived(hero).maxHP / 2));
          hero.gold = Math.floor(hero.gold * 0.8);
          hudFlash = 'Вы очнулись. −20% золота.';
        } else {
          hudFlash = 'Вы ушли от боя.';
        }
        // Побег и смерть: назад на тайл, где начался бой (1:1 с боем
        // мира; здесь prev — текущий тайл, герой остаётся на месте).
        if (res && res.outcome !== 'victory') {
          player.x = prev.x;
          player.y = prev.y;
          // Снап (000033): иначе спрайт будет скользить обратно через
          // поле боя.
          if (mover) mover.teleport(player.x, player.y);
        }
        // Задача 000132: предметный лут — строки ПОСЛЕ базовой
        // флэш-строки, ДО отряда (мультистрочность работает — compLines).
        const lootLines = combatEndLoot(res);
        if (lootLines.length)
          hudFlash = hudFlash + '\n' + lootLines.join('\n');
        // Задача 000087: отряд — xp/уровни/гибель (до saveNow, D8);
        // строки — ПОСЛЕ базовой флэш-строки (база не тронута).
        const compLines = combatEndCompanions(res, combat);
        if (compLines.length)
          hudFlash = hudFlash + '\n' + compLines.join('\n');
        G.playerUI && G.playerUI.render();
        hudFlashUntil = performance.now() + 5000;
        saveNow();
      },
    });
    // 000118: первая встреча Эфира — флаг (реальные c.units); до
    // ближайшего saveNow (post-бой — выше в onEnd; мировые точки —
    // далее по ходу).
    noteEfirCombat(combat);
    return combat;
  }
  // Проводка: явный бандл ссылок (контракт — memory/000128-
  // building-actions.md §2.2). map — GETTER (let, назначается после
  // асинхронной загрузки карты). Модуль отсутствует (регрессия
  // порядка загрузки — паттерн 000038/000053): console.error, [E]
  // инертен — игра не роняется.
  if (G.buildingActions) {
    G.buildingActions.init({
      game: G, // снапшот main.js (единственный, 000038)
      clock, // live clock (.day; .fastForward/.rest — доступны)
      hero, // ЖИВАЯ ссылка (спец-хендлеры мутируют: gold и пр.)
      player, // live { x, y }
      prevPos, // live { x, y } (escape-hatch в world)
      getMap: () => map,
      mover, // const — live-ссылка, никогда не перезаписывается
      npcs: NPCS, // каталог (зеркало assets/npc)
      questBook, // nullable
      npcShopFor, // (npcId) → { npc, stock } | null
      // Задача 000107: [E] в городе — городское состояние (getter —
      // let dungeonState, L выше) + единый решатель shop-формата
      // (city: сток cityShops по (город, клетка), 000108; мир —
      // npcShopFor, 000029).
      cityState: () => dungeonState,
      // Задача 000148.03: состояние городов (live Map 'ax,ay' →
      // {lastVisitDay, stock, built}; built — В-ПАМЯТИ запись
      // построек игрока, персистентность — 000148.05): build/
      // demolish идут через building-actions (world.cityStates).
      cityStates,
      shopFor, // (npc, t) → { npc, stock } | null
      campShopFor, // (x, y, tile) → wrap | null (000095: сток
      // барахолки по тайлу лагеря; респаун по clock.day)
      collectSaveData, // () → снимок сейва (чистая)
      saveNow, // () → запись в localStorage
      flash,
      buildingOncePerDay, // live Map 'x,y:effectId' → день (000072)
      // 000158.04: live Map 'x,y' → день сбора природного лута
      // (респаун через respawn_days, «как для мобов»).
      collectedLoot,
      buffs, // live Array (000072/000076)
      teleports, // live Map 'x,y' → { pair, dest, active } (000075)
      buildingQuests, // live Map 'x,y' → { questId, day, status } (000074)
      roster, // live Array (000083/000085): отряд — npcUI.open
      deadMercs, // live Array записей (000083/000085/000161)
      explored, // live Map 'x,y' → Set<'x,y'> (000093)
      buildingContent, // live Map 'x,y' → { day, type } (000077)
      playerRender,
      moveHero,
      startCombat: startCombatAt,
    });
  } else {
    console.error('main.js: [E] — Game.buildingActions отсутствует — ' +
      'src/building-actions.js обязан грузиться ДО src/main.js');
  }

  // 000157.03: [E]-залежь — Game.gatherDeposit (flat API dungeon.js,
  // паттерн openChest) и Game.canAddItem (flat API items.js) обязаны
  // грузиться ДО main.js (UMD-ловушка 000038: снапшот const G снят
  // вверху). Ошибка — ОДИН раз при загрузке; call-time — тихий
  // typeof-гард в ветке locationOnInteract (вне клетки — no-op молчит,
  // 000121).
  if (typeof G.gatherDeposit !== 'function'
      || typeof G.canAddItem !== 'function') {
    console.error('main.js: [E]-залежь (000157.03) — ' +
      'Game.gatherDeposit/Game.canAddItem отсутствуют — src/dungeon.js ' +
      'и src/items.js обязаны грузиться ДО src/main.js');
  }

  // HUD (задача 000129): строки — src/hud.js (Game.hud). Модуль
  // обязан грузиться ДО main.js (UMD-ловушка 000038: снапшот const G
  // снят вверху) — иначе G.hud — undefined всегда и строки HUD молча
  // исчезают; ошибка видна ОДИН раз при загрузке.
  if (!G.hud) {
    console.error('main.js: Game.hud отсутствует — src/hud.js ' +
      'обязан грузиться ДО src/main.js (000129)');
  }
  let flamePostMoveWarned = false;
  function dungeonCellPassableAt(cx, cy) {
    const d = dungeonState && dungeonState.dg;
    if (!d || !d.cells) return false;
    if (cx < 0 || cy < 0 || cx >= d.width || cy >= d.height) {
      return false;
    }
    return d.cells[cy * d.width + cx] === G.CELL_FLOOR;
  }
  function tileLandingPassable(tx, ty, allowEntrance) {
    const t = map && map.tileAt(tx, ty);
    return !!(t && t.passable
      && (!t.inBuilding || (allowEntrance && t.isEntrance))
      && !(t.hasMobGroup
        && !defeatedAt.has(tx + ',' + ty)));
  }
  function shadowStepPassable(inDungeon) {
    return (cx, cy) => {
      if (inDungeon) return dungeonCellPassableAt(cx, cy);
      if (!map) return false;
      const t = map.tileAt(cx, cy);
      return !!(t && t.passable);
    };
  }
  function flameStepPassable(inDungeon) {
    return (cx, cy) => {
      if (inDungeon) return dungeonCellPassableAt(cx, cy);
      return tileLandingPassable(cx, cy, true);
    };
  }
  function performMiracle() {
    const dead = deadMercs;
    if (!dead.length) {
      return { ok: false, reason: 'нет погибших' };
    }
    const gs = G.GlobalSettings && G.GlobalSettings.SETTINGS;
    const maxC = (gs && typeof gs.max_companions === 'number')
      ? gs.max_companions : 3;
    if (roster.length + dead.length > maxC) {
      return { ok: false, reason: 'отряд полон' };
    }
    if (!G.companions
        || typeof G.companions.reviveEntryFromRecord !== 'function') {
      return { ok: false, reason: 'недоступно' };
    }
    const entries = dead.map((r) =>
      G.companions.reviveEntryFromRecord(NPCS, r));
    if (entries.some((e) => !e)) {
      return { ok: false, reason: 'недоступно' };
    }
    for (let i = dead.length - 1; i >= 0; i--) {
      dead.splice(i, 1);
      roster.push(entries[i]);
    }
    saveNow();
    flash('Чудо: партия вернулась.');
    playerRender();
    return { ok: true };
  }
  function resolveTeleportStep(passableFactory) {
    if (dungeonState && dungeonState.kind === 'city') {
      return { ok: false, reason: 'в городе телепорт недоступен' };
    }
    const inDungeon = !!(dungeonState
      && dungeonState.kind === 'dungeon');
    const sx = inDungeon ? dungeonState.x : player.x;
    const sy = inDungeon ? dungeonState.y : player.y;
    const sPrevX = inDungeon ? dungeonState.prevX : prevPos.x;
    const sPrevY = inDungeon ? dungeonState.prevY : prevPos.y;
    const dx = sx - sPrevX;
    const dy = sy - sPrevY;
    if (Math.abs(dx) + Math.abs(dy) !== 1) {
      return { ok: false, reason: 'нет направления движения' };
    }
    const passable = passableFactory(inDungeon);
    let landing = 0;
    for (let k = 1; k <= 10; k++) {
      if (!passable(sx + dx * k, sy + dy * k)) break;
      landing = k;
    }
    if (landing === 0) {
      return { ok: false, reason: 'некуда шагнуть' };
    }
    return { ok: true, inDungeon, sx, sy, dx, dy, landing };
  }
  function applyTeleportPlacement(r) {
    const now = performance.now();
    if (r.inDungeon) {
      const ds = dungeonState;
      ds.prevX = ds.x; ds.prevY = ds.y;
      ds.x += r.dx * r.landing;
      ds.y += r.dy * r.landing;
      if (ds.mover) {
        ds.mover.step({ x: ds.prevX, y: ds.prevY },
          { x: ds.x, y: ds.y }, now);
      }
    } else {
      moveHero(r.sx + r.dx * r.landing, r.sy + r.dy * r.landing);
    }
  }
  function performShadowStep() {
    const r = resolveTeleportStep(shadowStepPassable);
    if (!r.ok) return { ok: false, reason: r.reason };
    applyTeleportPlacement(r);
    return { ok: true };
  }
  function performFlameStep() {
    const r = resolveTeleportStep(flameStepPassable);
    if (!r.ok) return { ok: false, reason: r.reason };
    applyTeleportPlacement(r);
    if (r.inDungeon) {
      const ds = dungeonState;
      let ev = null;
      if (G.locations
          && typeof G.locations.dungeonPostMove === 'function') {
        ev = G.locations.dungeonPostMove(ds);
      } else if (!flamePostMoveWarned) {
        flamePostMoveWarned = true;
        console.error('main.js: Game.locations.dungeonPostMove '
          + 'отсутствует (src/locations.js обязан грузиться ДО '
          + 'src/main.js, 000239) — после-шажной проверки на '
          + 'лендинге flame_step нет (бой/сундук не проверяются)');
      }
      const dayBefore = clock.day;
      clock.addStep(1);
      if (ev && ev.type === 'combat') startDungeonCombat(ev.group);
      if (ev && ev.chest) applyDungeonChest(ds, ev.chest, dayBefore);
      saveNow();
    } else {
      clock.addStep(1);
      if (!maybeStartCombat(true, performance.now())) enterLocation();
      saveNow();
    }
    return { ok: true };
  }

  // 000235.02: книга заклинаний вне боя (src/spellbook-oc.js) —
  // ОБЯЗАН грузиться ДО main.js (UMD-ловушка 000038: снапшот const G
  // снят вверху) — иначе G.spellbookOC — undefined всегда и [B]/кнопка
  // молча не работают; ошибка видна ОДИН раз при загрузке.
  // hero/clock — live-ссылки; flash — функция-декларация ниже
  // (hoisting); startWindow (000138) — в блок-списке модуля (книга не
  // открывается, пока показано стартовое окно).
  if (G.spellbookOC) {
    G.spellbookOC.init({ hero, clock, flash, startWindow,
      flameStep: performFlameStep,
      shadowStep: performShadowStep,
      miracle: performMiracle,
      // 000235.04: ctx портала — функция (вызов на КАСТ: map — let,
      // переприсваивается при загрузке мира; x/y — свежие).
      outOfCombatCtx: () => ({
        x: player.x, y: player.y,
        cities: cityStates,
        passable: (tx, ty) => tileLandingPassable(tx, ty, false),
        teleport: (tx, ty) => { moveHero(tx, ty); saveNow(); },
      }),
    });
  } else {
    console.error('main.js: книга вне боя (000235.02) — Game.spellbookOC '
      + 'отсутствует — src/spellbook-oc.js обязан грузиться ДО '
      + 'src/main.js');
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

  window.addEventListener('keydown', (e) => {
    // 000162: пикер «Воскрешение» открыт — ввод у него (гейт R-3:
    // KeyI/KeyC/KeyE/движение блокированы; [E] под пикером —
    // buildingUI НЕ открывается — нет двойного оверлея).
    if (G.resurrectUI && G.resurrectUI.isActive()) return; // 000162
    // 000148.05 (D-.05p): ввод имени города (renameInput) открыт —
    // ввод У НЕГО: движение (KeyA = «Ф» на ЦФЫВ!), KeyI/KeyC/KeyE
    // блокированы — гейт ДО всех гейтов (паттерн 000162 resurrectUI);
    // фасад buildingActions.renameInputActive() (module-level фаза).
    if (G.buildingActions &&
        typeof G.buildingActions.renameInputActive === 'function'
        && G.buildingActions.renameInputActive()) return; // 000148.05
    if (e.code === 'KeyI' && G.playerUI) { // I (Ш) — панель персонажа
      G.playerUI.toggle();
      return;
    }
    // C (С) — панель «Отряд» (задача 000086): KeyC СВОБОДНА (сверено:
    // COMBAT_KEYS/controls.js не знают её — в бою остаётся свободной).
    // Семантика = KeyI: работает поверх ОТКРЫТЫХ оверлеев, до гейтов.
    if (e.code === 'KeyC' && G.squadUI) {
      G.squadUI.toggle();
      return;
    }
    // 000235.02: B (И) — книга заклинаний вне боя. Как KeyC: до гейтов
    // (работает на всех 3 экранах; активные оверлеи гасит сама
    // toggle() внутри модуля — no-op).
    if (e.code === 'KeyB' && G.spellbookOC) {
      G.spellbookOC.toggle();
      return;
    }
    if (e.code === 'KeyE' && G.npcUI) { // E (У) — диалог NPC
      // 000107/000177: в локации реальный путь [E] — dungeon-ui →
      // locationOnInteract (выход на совмещённом тайле / в городе —
      // buildingActions.interactCity; dungeon-ui регистрируется ДО
      // main.js — срабатывает первым); дубль toggle() гасят гарды
      // активных оверлеев ВНУТРИ buildingActions.toggle (dungeonUI/
      // buildingUI/npcUI — после выхода dungeonUI закрыт, а на
      // пещерных/городских тайлах openBuildingUI без действий
      // ложится в no-op). В мире — обычный toggle().
      if (G.buildingActions) G.buildingActions.toggle();
      return;
    }
    // В бою клавиши обрабатывает combat-ui (единая таблица
    // src/combat-keys.js, задача 000048), в подземелье — dungeon-ui,
    // в диалоге NPC — npcUI. Конфликтов с боевой таблицей нет: этот
    // return стоит ДО движения мира и прочих действий; KeyA в бою —
    // движение (как в мире), KeyE — «быстрый предмет»
    // (G.buildingActions.toggle() выше сам гасится активным боем).
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
    if (G.craftUI && G.craftUI.isActive()) return; // 000126: экран
    // крафта — движение/прочие действия мира заблокированы (как
    // buildingUI); Esc-закрытие — внутри craft-ui.js (escHandler).
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

  // --- Тач-вариант контролов (задачи 000018, 000123, 000121) ---
  // Чистая часть — в src/controls.js (тестируется в node): детект
  // устройства по СНИМКУ окружения, выбор схемы, раскладка и хит-тест,
  // РОУТИНГ тач-ввода (routeTouchScreen: бой > подземелье > карта;
  // touchKeyCode: тач-действие → e.code клавиатуры — 000121).
  // On-screen-контролы (D-pad + кнопки [E]/[I]) — в src/ui.js.
  // Схема: 'touch' на тач-устройстве, иначе 'keyboard'; вариант можно
  // переопределить параметром URL ?controls=touch|keyboard (для теста
  // на десктопе и наоборот).
  // 000123: кнопки [E] (действие) и [I] (инвентарь) видны в ОБЕИХ
  // схемах; D-pad — только в 'touch' (флаг dpad в touchControls.init).
  // 000150: видимость on-screen-контролов по экранам — пересчёт в
  // frame() от снимка (бой → кнопки скрыты, D-pad жив; инвентарь/
  // вход → кнопки + D-pad скрыты; чистая touchControlsVisibility).
  // 000121: ОДИН D-pad маршрутизируется в активный экран (клей без
  // состояния, снимок в момент события):
  //   бой        — тап = ОДНО действие handleCode(code), БЕЗ повтора
  //                (каждое действие тратит ход); [E] → quickItem (KeyE);
  //   подземелье — touchHold/touchRelease: тап = шаг, повтор при
  //                удержании — в rAF-цикле dungeon-ui (move_interval_ms);
  //                [E] → no-op (кнопка не скрывается);
  //   карта      — как 000018: виртуальная клавиша 'touch:<dir>' в Set
  //                keys; [E] → buildingActions.toggle() (диалог/
  //                постройка закрываются сами — frame-гейт подавляет
  //                движение, как по клавишам).
  function touchScreens() {
    // Снимок активных оверлеев в МОМЕНТ события (контракт 000121).
    return {
      combat: !!(G.combatUI && G.combatUI.isActive()),
      dungeon: !!(G.dungeonUI && G.dungeonUI.isActive()),
      dialog: !!(G.npcUI && G.npcUI.isActive()),
      building: !!(G.buildingUI && G.buildingUI.isActive()),
    };
  }
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
  if (G.touchControls) {
    G.touchControls.init({
      dpad: controlsScheme === 'touch', // D-pad только в 'touch' (000123)
      // Маршрутизация — чистая routeTouchScreen (controls.js, 000121):
      // боевой тап = одно действие, подземелье — touchHold (повтор в
      // rAF dungeon-ui), карта — 'touch:<dir>' в тот же Set keys, что
      // и настоящие клавиши (кадр вызывает tryMove → deltaForMoveKey).
      onHold: (dir) => {
        const screen = G.routeTouchScreen(touchScreens());
        if (screen === 'combat') {
          const code = G.touchKeyCode(dir);
          if (code && G.combatUI) G.combatUI.handleCode(code);
        } else if (screen === 'dungeon') {
          if (G.dungeonUI && typeof G.dungeonUI.touchHold === 'function') {
            G.dungeonUI.touchHold(dir);
          }
        } else {
          keys.add('touch:' + dir);
        }
      },
      // Оба вызова — идемпотентные no-op на «чужом» экране (клей без
      // отслеживания маршрута: повтор живёт в dungeon-ui и гаснет там).
      onRelease: (dir) => {
        if (G.dungeonUI && typeof G.dungeonUI.touchRelease === 'function') {
          G.dungeonUI.touchRelease(dir);
        }
        keys.delete('touch:' + dir);
      },
      // [E] по экранам (000121/000177): бой → quickItem (KeyE — та же
      // ветка, что клавиша), локация (подземелье/город) →
      // locationOnInteract (те же семантики, что клавиша: выход на
      // совмещённом тайле / постройки / no-op), карта → как 000123.
      onInteract: () => {
        const screen = G.routeTouchScreen(touchScreens());
        if (screen === 'combat') {
          const code = G.touchKeyCode('interact'); // 'KeyE'
          if (code && G.combatUI) G.combatUI.handleCode(code);
        } else if (screen === 'dungeon') {
          locationOnInteract();
        } else {
          G.buildingActions && G.buildingActions.toggle();
        }
      },
      onInventory: () => {
        if (G.playerUI) G.playerUI.toggle(undefined, 'inventory');
      },
    });
    G.touchControls.show();
  } else {
    // Game.touchControls собирается в ui.js при ЗАГРУЗКЕ — если его
    // нет, controls.js загрузился позже (регрессия порядка — tests/
    // index-order.test.js). На чистом тачскрине без этого у игрока
    // не будет НИКАКОГО управления, поэтому — console.error.
    console.error('main.js: Game.touchControls отсутствует — проверьте ' +
      'порядок загрузки: src/controls.js ДО src/ui.js');
  }

  canvas.addEventListener('wheel', (e) => {
    zoom = Math.max(G.ZOOM_MIN, Math.min(G.ZOOM_MAX, zoom * (e.deltaY < 0 ? 1.2 : 1 / 1.2)));
    e.preventDefault();
  }, { passive: false });

  // 000235.08: frost_walk — проходимость тайла для героя (мир):
  // базовая проходимость + активная запись frost_walk (1 день)
  // открывает ОБА водных тайла (WATER/DEEP_WATER). Деградация
  // (экспорта нет) — passable-only.
  function heroPassable(t, day0) {
    if (t.passable) return true;
    if (G.Spells && typeof G.Spells.isHeroFrostWalk === 'function'
        && G.Spells.isHeroFrostWalk(hero, day0)) {
      const T = G.TERRAIN;
      return !!(T && (t.terrain === T.WATER
                      || t.terrain === T.DEEP_WATER));
    }
    return false;
  }

  function tryMove() {
    for (const k of keys) { // порядок в Set = порядок нажатий
      const [dx, dy] = G.deltaForMoveKey(k);
      const t = map.tileAt(player.x + dx, player.y + dy);
      if (heroPassable(t, clock.day)) {
        prevPos.x = player.x;
        prevPos.y = player.y;
        player.x += dx;
        player.y += dy;
        return true;
      }
    }
    return false;
  }

  // 000135: зоны групп — чистое ядро в combat.js (G). combat.js
  // обязан грузиться ДО main.js (UMD-ловушка 000038: снапшот const G
  // снят вверху). Модуль/экспорт отсутствует (регрессия порядка) —
  // видимая ошибка ОДИН раз + поведение ДО 000135 (бой только на
  // тайле — деградация, не крах; паттерн 000053/000071).
  if (typeof G.findZoneCombat !== 'function'
      || typeof G.groupZoneInfo !== 'function') {
    console.error('main.js: Game.findZoneCombat/Game.groupZoneInfo ' +
      'отсутствуют — src/combat.js обязан грузиться ДО src/main.js ' +
      '(000135) — зоны групп отключены (бой только на тайле)');
  }

  // 000135: hasMobGroup-тайлы окрестности игрока — окно Чебышёва
  // ≤ 2 = максимум радиуса зоны. tileCache (000019) — шум НЕ
  // пересчитывается (map.tileAt — fbm на каждый вызов).
  function nearbyGroupTiles() {
    const out = [];
    for (let dx = -2; dx <= 2; dx++) {
      for (let dy = -2; dy <= 2; dy++) {
        const t = tileCache.tile(player.x + dx, player.y + dy);
        if (t.hasMobGroup) out.push(t);
      }
    }
    return out;
  }

  // 000235.03: единая точка расширения «зона не триггерится для
  // героя: причина» (ТЗ п.5; .04 — зональная ветка warding_circle
  // по аргументу zone, Чебышёв ≤ 5).
  function zoneSuppressedReason(zone) {
    if (G.Spells && typeof G.Spells.isHeroInvisible === 'function'
        && G.Spells.isHeroInvisible(hero, clock.day)) {
      return 'невидимость';
    }
    // 000235.04: круг защиты — зональная ветка (zone = тайл группы,
    // Чебышёв(зона, герой) ≤ wardRadius(hero, day)).
    if (zone && G.Spells && typeof G.Spells.wardRadius === 'function') {
      const r = G.Spells.wardRadius(hero, clock.day);
      if (r > 0) {
        const d = Math.max(Math.abs(player.x - zone.x),
                           Math.abs(player.y - zone.y));
        if (d <= r) return 'круг защиты';
      }
    }
    // 000235.08: frozen_stillness — зональная ветка (ПОЛНОЕ
    // подавление зоны в радиусе; тайл-бой — ветка выше по коду,
    // сохраняется).
    if (zone && G.Spells
        && typeof G.Spells.frozenStillnessRadius === 'function') {
      const r = G.Spells.frozenStillnessRadius(hero, clock.day);
      if (r > 0) {
        const d = Math.max(Math.abs(player.x - zone.x),
                           Math.abs(player.y - zone.y));
        if (d <= r) return 'замерзание';
      }
    }
    // 000235.09: shroud_of_night — зональная ветка (паттерн
    // frozen_stillness; полный порядок причин: невидимость → круг
    // защиты → замерзание → покров ночи).
    if (zone && G.Spells
        && typeof G.Spells.shroudOfNightRadius === 'function') {
      const r = G.Spells.shroudOfNightRadius(hero, clock.day);
      if (r > 0) {
        const d = Math.max(Math.abs(player.x - zone.x),
                           Math.abs(player.y - zone.y));
        if (d <= r) return 'покров ночи';
      }
    }
    if (zone && G.Spells
        && typeof G.Spells.holyLightRadius === 'function') {
      const r = G.Spells.holyLightRadius(hero, clock.day);
      if (r > 0) {
        const d = Math.max(Math.abs(player.x - zone.x),
                           Math.abs(player.y - zone.y));
        if (d <= r) return 'свет обители';
      }
    }
    return null;
  }

  // 000135: зона для текущей позиции (тайл группы или null) — ОДИН
  // общий скан (бой + HUD). Тихий гард — ошибка уже видна при
  // загрузке. 000235.03: невидимый герой — findZoneCombat НЕ
  // вызывается (zone-бой и HUD «— зона» гаснут одной точкой).
  // 000235.04: зона под кругом защиты — та же точка (после скана,
  // по найденной зоне).
  function zoneCombatInfo() {
    if (typeof G.findZoneCombat !== 'function') return null;
    if (zoneSuppressedReason()) return null;
    // 000235.08: cold_breath — сужение радиуса триггера (0 →
    // вызов идентичен вызову без 5-го аргумента). 000235.09:
    // dark_presence — тот же 5-й аргумент, сужение = max из двух
    // источников (оба активных → −1, не −2).
    const cb0 = (G.Spells
      && typeof G.Spells.coldBreathRadius === 'function')
      ? G.Spells.coldBreathRadius(hero, clock.day) : 0;
    const dp = (G.Spells
      && typeof G.Spells.darkPresenceRadius === 'function')
      ? G.Spells.darkPresenceRadius(hero, clock.day) : 0;
    const cb = Math.max(cb0, dp);
    const z = G.findZoneCombat(player.x, player.y,
      nearbyGroupTiles(), defeatedAt, cb);
    if (z && zoneSuppressedReason(z)) return null;
    return z;
  }

  // 000135: тайл zone-боя (тайл ГРУППЫ) или null.
  function zoneCombatTile() {
    const z = zoneCombatInfo();
    return z ? tileCache.tile(z.x, z.y) : null;
  }

  // 000135: группа зоны для HUD (ВНЕ тайла группы) или null —
  // ЗНАЧЕНИЕ для ctx (000129: hud.js не дотягивается до Game/map).
  // dist 0 → null: на тайле группы — существующая ветка (пин).
  function zoneGroupForHud() {
    const z = zoneCombatInfo();
    return z && (z.x !== player.x || z.y !== player.y)
      ? z.mobGroup : null;
  }

  // Шаг на тайл с группой мобов (ещё не побеждённой) → мини-карта боя.
  // 000135: scanZones — скан зон на успешном шаге (frame передаёт
  // true): агрессивная/территориальная группа — бой при ВХОДЕ В ЕЁ
  // 5×5-зону; нейтральная/трусливая — бой ТОЛЬКО на тайле (без
  // изменений). Тайл боя = тайл ГРУППЫ (key/seed/terrain/quest —
  // ВСЁ от него); на тайле — тайл игрока (бит-в-бит, как до).
  // Возврат: true — бой начался (приоритет над входом в локацию).
  // nowMs — время кадра атаки (frame передаёт now; бут — undefined →
  // performance.now(); на практике from==to → заряда нет, 000173).
  function maybeStartCombat(scanZones, nowMs) {
    if (G.combatUI && G.combatUI.isActive()) return false;
    // Полноэкранная панель накроет карту в бою — закрываем (000096).
    // KeyI в бою по-прежнему переключает (коммент ниже), но это осознанный
    // выбор игрока, а не случайное состояние.
    if (G.playerUI && G.playerUI.isOpen()) G.playerUI.toggle(false);
    // 000086: панель «Отряд» — закрыть (тот же стек, паттерн 000096).
    if (G.squadUI && G.squadUI.isOpen()) G.squadUI.toggle(false);
    // Оверлей действий постройки (000071) под боевым оверлеем —
    // закрываем (тот же стек, паттерн 000096).
    if (G.buildingUI && G.buildingUI.isActive()) G.buildingUI.close();
    if (G.craftUI && G.craftUI.isActive()) G.craftUI.close(); // 000126
    const pt = tileCache.tile(player.x, player.y); // кэш (тот же тайл)
    // 000135: ТАЙЛ БОЯ: на тайле живой группы — тайл игрока
    // (текущее поведение); в зоне триггерящей группы — тайл ГРУППЫ.
    // Ревью 000135: поверженная СВОЯ группа больше не якорь боя
    // (общий guard) — уступаем зоне: шаг на поверженный тайл ВНУТРИ
    // живой 5×5-зоны = бой при ВХОДЕ В ЗОНУ (ТЗ), а не пропуск шага
    // (иначе игрок «проходит мимо» триггерящей группы по повержен-
    // ному тайлу-ступеньке). Приоритет «свой тайл — своя группа»
    // действует только для ЖИВОЙ группы (пин Z2).
    const t = pt.hasMobGroup && !defeatedAt.has(pt.x + ',' + pt.y)
      ? pt
      : (scanZones ? zoneCombatTile() : null);
    if (!t) return false;
    const key = t.x + ',' + t.y; // 000135: ключ ТАЙЛА ГРУППЫ
    if (defeatedAt.has(key)) return false; // общий guard (зона и тайл)
    // Задача 000173 (D4/D8): заряд рывка группы — ПОСЛЕ всех guard'ов
    // и выбора t, ПЕРЕД startCombat: guard'ы и return-значения не
    // меняются (бой стартует бит-в-бит, D2; пины 000135). Цель
    // ЗАМОРОЖЕНА на момент атаки (игрок в бою заморожен — не
    // «уплывает»): атака НА тайле группы (t === pt) — prevPos (тайл,
    // с которого шагнул; от него дистанция 1 — иначе from==to и самый
    // частый случай «шаг на видимого моба» не анимировался бы);
    // атака в зоне — тайл игрока (player.x/y уже после tryMove).
    // Цель == тайл группы (спавн/сейв на группе — prevPos снапнут) →
    // заряда НЕТ (глейд-нуль, рендер бит-в-бит как до). Деградация
    // (D8): createMover отсутствует — заряда нет, тихий guard по
    // образцу мувера героя (выше). Канонические тайлы (nz):
    // findSpawn может дать −0 для спавн-тайла (`dx = −r` при r=0 —
    // существующее поведение, player.x/prevPos; чужие пины читают
    // `=== 0`); это тот же тайл, но Object.is/deepStrictEqual
    // различают −0 и 0 — состояние заряда хранит канонический +0.
    const nz = (v) => (v === 0 ? 0 : v);
    const chargeTo = (t === pt)
      ? { x: nz(prevPos.x), y: nz(prevPos.y) }
      : { x: nz(player.x), y: nz(player.y) };
    if (G.createMover
        && (chargeTo.x !== t.x || chargeTo.y !== t.y)) {
      const chFrom = { x: nz(t.x), y: nz(t.y) };
      const chTo = { x: chargeTo.x, y: chargeTo.y };
      const chNow = nowMs != null ? nowMs : performance.now();
      mobCharge = { key, from: chFrom, to: chTo,
        mover: G.createMover({ x: t.x, y: t.y,
          intervalMs: MOB_CHARGE_MS }) };
      mobCharge.mover.step(chFrom, chTo, chNow, MOB_CHARGE_MS);
      lungeEndMs = chNow + MOB_CHARGE_MS;
    }
    // Задача 000087: `const combat` — onEnd читает ЖИВОЙ объект боя
    // ПОЗЖЕ (гибель — по combat.units, D2); guard isActive — выше.
    clearInvisibilityOnCombatStart();
    const combat = G.combatUI.startCombat({
      hero,
      // Эфир (задача 000081): постоянный союзник — ВСЕГДА.
      efir,
      // 000118 (вариант (a)): флаг первой встречи (из сейва).
      efirMet,
      // Задача 000087: отряд — данные makeAlly (000082), ПОСЛЕ Эфира.
      rosterData: companionAllies(),
      // 000194: быстрые предметы союзников — снимок live-карты.
      allyQuick: sanitizeAllyQuick(allyQuick),
      // 000195: та же live-карта — re-sync u.quick в бою (syncAllyQuickLive).
      allyQuickLive: allyQuick,
      // 000249: та же live-карта — «последнее заклинание» (сидинг
      // союзников на старте + запись на успешном касте, combat-ui).
      lastSpells: lastSpells,
      tile: t,
      lungeGate: mobCharge != null,
      // Фон поля боя по типу местности (задача 000049): terrain тайла,
      // где начался бой. spriteLoader может быть null (нет s2/лоадера) —
      // combat-ui терпит: сплошной фолбэк-фон.
      terrain: t.terrain,
      spriteLoader,
      prev: { x: prevPos.x, y: prevPos.y },
      // 000135: seed — от ТАЙЛА ГРУППЫ (тот же salt; на тайле —
      // значения идентичны: существующие createCombat-пины не
      // сдвигаются; zone-старт — новая точка).
      seed: G.hash2(t.x, t.y, 0x5eedc0de),
      day: clock.day,
      // Задача 000076: активные благословения — во ВСЕХ боях дня.
      buffMods: currentBuffMods(),
      onEnd: (res) => {
        // 000173: конец боя (victory/fled/dead) — заряд сброшен;
        // спрайт группы либо скрыт (defeatedAt, 000122), либо снова
        // на якоря тайла (без «залипшего» смещения).
        mobCharge = null;
        lungeEndMs = 0;
        if (G.combatUI && typeof G.combatUI.setLungeGate === 'function') {
          G.combatUI.setLungeGate(false);
        }
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
        // Задача 000132: предметный лут — строки ПОСЛЕ базовой
        // флэш-строки, ДО отряда (мультистрочность работает — compLines).
        const lootLines = combatEndLoot(res);
        if (lootLines.length)
          hudFlash = hudFlash + '\n' + lootLines.join('\n');
        // Задача 000087: отряд — xp/уровни/гибель (до saveNow, D8);
        // строки — ПОСЛЕ базовой флэш-строки (база не тронута).
        const compLines = combatEndCompanions(res, combat);
        if (compLines.length)
          hudFlash = hudFlash + '\n' + compLines.join('\n');
        G.playerUI && G.playerUI.render();
        hudFlashUntil = performance.now() + 5000;
        saveNow();
      },
    });
    // 000118: первая встреча Эфира — флаг (реальные c.units).
    noteEfirCombat(combat);
    return true; // 000135: бой начался (приоритет над входом в локацию)
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
      memory: dungeonMemory, intervalMs: moveIntervalBase(),
      // 000148.05 (D-.05h): cityStates — live-Map (000109) —
      // maybeEnterCity читает saved-запись (name → ds.name, built →
      // occupied для generateCityContents; без проводки — деградация).
      cityStates };
    const ds = L.maybeEnterDungeon(ctx) || L.maybeEnterCity(ctx);
    if (ds) {
      dungeonState = ds;
      // Задача 000109: вход в город — состояние (сток/lastVisitDay)
      // до UI (контент перегенерация + сток из сейва при в-окне).
      if (ds.kind === 'city') prepareCityState(ds);
      // 000177: onInteract — ОДИН обработчик на оба kind: [E] на
      // совмещённом тайле входа-выхода = ВЫХОД (locationOnInteract →
      // interactExit → exitLocation); вне тайла: город → постройки
      // (000107), подземелье → no-op (000121).
      startLocationUI(
        ds.kind === 'city' ? cityOnMove : dungeonOnMove,
        locationOnInteract);
    }
  }

  // Состояние города при входе (задача 000109): контент
  // (buildings) ВСЕГДА перегенерируется (детерминирован — один
  // якорь → один результат); сток — ветка: day − lastVisitDay >=
  // cityRespawnDays() → ПЕРЕГЕНЕРАЦИЯ (fresh-сток makeCityShop, без
  // соли по дню — детерминизм по (якорь, клетка)), иначе —
  // ВОССТАНОВЛЕНИЕ из сейва (LIVE-ссылка на сохранённый сток);
  // lastVisitDay = day при входе (визит = визит). Ключ — ЯКОРЬ
  // (t.buildingAnchor входного тайла, тот же, что в maybeEnterCity),
  // НЕ worldKey (тайл входа нестабилен у многотайловых городов).
  // API нет — console.error + деградация (город пуст, как до 000109;
  // игра не падает — паттерн 000053/000071).
  function prepareCityState(ds) {
    const C = G.Cities;
    if (!C || typeof C.generateCityContents !== 'function' ||
        typeof C.makeCityShop !== 'function') {
      console.error('main.js: Game.Cities (src/cities.js) отсутствует ' +
        '— состояние города не восстанавливается (000109)');
      return;
    }
    // Входной тайл — ds.worldKey ('x,y'); якорь/богатство/id — поля
    // тайла (те же, что читает maybeEnterCity).
    const parts = String(ds.worldKey).split(',');
    const ex = Number(parts[0]), ey = Number(parts[1]);
    let t = null;
    if (Number.isInteger(ex) && Number.isInteger(ey) && map) {
      try { t = map.tileAt(ex, ey); } catch (err) { t = null; }
    }
    if (!t || !t.buildingAnchor || t.buildingId == null) {
      console.error('main.js: входной тайл города — без buildingAnchor/' +
        'buildingId — состояние не восстанавливается (000109)');
      return;
    }
    const rec = G.getBuilding ? G.getBuilding(t.buildingId) : null;
    if (!rec) {
      console.error('main.js: каталожная запись города ' +
        String(t.buildingId) + ' отсутствует (000109)');
      return;
    }
    const [ax, ay] = t.buildingAnchor;
    const anchorKey = ax + ',' + ay;
    // 000148.05 (a): saved — ПЕРЕНОС ДО generateCityContents
    // (occupied — 6-й аргумент, §3.5: обе точки генерации — ОДИН
    // источник occupied, иначе рассинхрон/«фантомные» базовые).
    const saved = cityStates.get(anchorKey);
    // 000148.05 (b): occupied — клетки built (builtOccupied; null —
    // БИТ-В-БИТ с 5-арг. вызовом: persistent-only/без built).
    const occ = saved && typeof C.builtOccupied === 'function'
      ? C.builtOccupied(saved) : null;
    let contents = null;
    try {
      contents = C.generateCityContents(ds.dg, ax, ay, rec,
        t.buildingWealth, occ);
    } catch (err) {
      console.error('main.js: generateCityContents — ' + err +
        ' (000109) — сток не восстанавливается');
      return;
    }
    // Задача 000148.03: постройки игрока (built — В-ПАМЯТИ запись
    // cityStates, per-cell view; персистентность — 000148.05):
    // merge в contents ДО stock-цикла — player-клетки ПОПАДАЮТ в
    // stock-цикл (сток/NPC/эффекты — как у базовых, SPEC «эффекты
    // постройки — как у базовых»). ЛОВУШКА-ЗАМЕНА (ниже): record
    // перезаписывается при каждом входе — built сохраняем
    // (спред), иначе каждый повторный вход терял постройки.
    // Мусорные записи — fail-open отброс (000029): целые
    // x/y/buildingId, id ∈ каталогу, footprint ⊆ интерьерным FLOOR.
    if (saved && Array.isArray(saved.built) &&
        typeof C.buildingCells === 'function') {
      const W = ds.dg.width, H = ds.dg.height;
      for (const e of saved.built) {
        if (!e || typeof e !== 'object' || Array.isArray(e) ||
            !Number.isInteger(e.x) || !Number.isInteger(e.y) ||
            !Number.isInteger(e.buildingId)) continue;
        const recB = G.getBuilding
          ? G.getBuilding(e.buildingId) : null;
        if (!recB) continue; // id ∉ каталогу — отброс
        let foot = null;
        try {
          foot = C.buildingCells(e.buildingId, e.x, e.y);
        } catch (err) { foot = null; }
        if (!Array.isArray(foot)) continue;
        let inside = true;
        for (const [cx, cy] of foot) {
          // footprint ⊆ интерьер [1, W−2]×[1, H−2] на FLOOR (дверь —
          // периметр — интерьером не является, 000148.03 D-E).
          if (cx < 1 || cx >= W - 1 || cy < 1 || cy >= H - 1 ||
              ds.dg.cells[cy * W + cx] !== C.CELL_FLOOR) {
            inside = false;
            break;
          }
        }
        if (!inside) continue; // вне интерьера — отброс
        for (const [cx, cy] of foot) {
          contents.buildings.push(
            { x: cx, y: cy, buildingId: e.buildingId, player: true });
          // Ревью-правка (blocker): live-вид ds.cityContents.buildings
          // обязан отражать постройки игрока — иначе после выхода/
          // повторного входа [E] на клетке видит «пусто» и открывает
          // меню «Строительство» вместо меню постройки (разборка
          // недостижима, double-build и обход лимита 50%).
          if (ds.cityContents && Array.isArray(ds.cityContents.buildings)) {
            ds.cityContents.buildings.push(
              { x: cx, y: cy, buildingId: e.buildingId, player: true });
          }
        }
      }
    }
    // 000148.05 (D-.05q): persistent-only запись (окно истекло —
    // transient-пара отброшена validateCityState, name/built живы):
    // saved.lastVisitDay ОТСУТСТВУЕТ → day − undefined = NaN,
    // NaN >= N = false → fresh ложно (ловушка) — явный
    // Number.isInteger-гард (persistent-only = всегда fresh-сток).
    const fresh = !saved
      || !Number.isInteger(saved.lastVisitDay)
      || clock.day - saved.lastVisitDay >= cityRespawnDays();
    const stock = {};
    for (const b of contents.buildings) {
      let shop = null;
      try {
        shop = C.makeCityShop(ax, ay, b.x, b.y, b.buildingId,
          t.buildingWealth);
      } catch (err) { shop = null; } // нет записи каталога — не лава
      if (!shop) continue;
      const cellKey = b.x + ',' + b.y;
      if (!fresh && saved && saved.stock &&
          Object.prototype.hasOwnProperty.call(saved.stock, cellKey)) {
        shop.stock = saved.stock[cellKey]; // LIVE-ссылка
      }
      stock[cellKey] = shop.stock;
      // Ревью-правка (major): shopFor (ниже) обслуживает ТОРГОВЛЮ из
      // ds.cityShops (объекты из maybeEnterCity), а сейв/restore — из
      // record.stock (объекты этого цикла). Синхронизируем ССЫЛКУ:
      // объект магазина cellKey === record.stock cellKey → мутации
      // при покупке попадают в cityStates (контракт 000109: сток
      // переживает визит) и ИГРОКОВЫЕ клетки (player-постройки)
      // получают магазин автоматически (merge выше — до цикла).
      if (ds.cityShops && typeof ds.cityShops === 'object') {
        ds.cityShops[cellKey] = shop;
      }
    }
    // 000148.03: built — сохраняем (спред) — record перезаписывается
    // при каждом входе (000109: lastVisitDay/stock свежие).
    // 000148.05: + name (persistent) — БЕЗ name в spread rename
    // теряется при повторном входе (in-memory; R-REPLACE1).
    cityStates.set(anchorKey, { lastVisitDay: clock.day, stock,
      ...(saved && Array.isArray(saved.built)
        ? { built: saved.built } : {}),
      ...(saved && typeof saved.name === 'string'
        ? { name: saved.name } : {}) });
  }
  function startLocationUI(onMove, onInteract) {
    G.dungeonUI.start({
      get state() { return dungeonState; },
      onMove,
      onInteract, // 000177: [E] → locationOnInteract (выход на тайле / постройки)
      // ОДИН общий zoom (задача 000066): колесо поверх оверлея меняет
      // тот же zoom, что мир (мировой слушатель на #game накрыт) —
      // renderHud/Game.hud («Масштаб: Xpx») остаётся корректным
      // без изменений.
      zoom,
      onZoom: (z) => { zoom = z; },
      spriteLoader,
      // Туман войны (задача 000136): множитель радиуса видимости —
      // derived.caveVisionMult («Кошачий глаз», player.js — закрывает
      // мёртвый стат). ФУНКЦИЯ, а не getter: start() делает {...opts},
      // который оценивает getter ОДИН раз (заморозка при входе); live —
      // только функция. Чтение — один раз на кадр в render dungeon-ui
      // (паттерн liveLevelDeltaMax dungeon.js); город — без тумана
      // (dungeon-ui игнорирует visionMult при isCity).
      visionMult: () => {
        const dd = G.derived ? G.derived(hero) : null;
        const m = dd ? dd.caveVisionMult : 1;
        return (typeof m === 'number' && Number.isFinite(m) && m > 0)
          ? m : 1;
      },
      visionRadiusFloor: () => {
        let floorR = 0;
        if (G.Spells && G.Spells.isHeroLit
            && G.Spells.isHeroLit(hero, clock.day)) {
          const sp = G.Spells.getSpell('firelight');
          const r = sp && sp.параметры ? sp.параметры.radius : null;
          if (typeof r === 'number' && r >= 1) floorR = r;
        }
        if (G.Spells
            && typeof G.Spells.holyLightRadius === 'function') {
          const r = G.Spells.holyLightRadius(hero, clock.day);
          if (r > floorR) floorR = r;
        }
        return floorR;
      },
    });
  }
  // 000170 (D6): исключение в день-цепи (exitDungeon → clock.event
  // → onDay) НЕ может пропустить очистку — finally — страховка:
  // dungeonState=null + dungeonUI.close() + saveNow() выполняются
  // при ЛЮБОМ исходе. Без неё герой застревал бы в подземельи на
  // выходной клетке (каждая повторная попытка снова {type:'exit'} —
  // дни уходят, позиция не сдвигается). dungeonUI.close() уже
  // exception-safe; saveNow — тоже (D7).
  let exitErrLogged = false;
  function exitLocation(ds) {
    try {
      if (ds.kind === 'city') G.locations.exitCity(ds);
      else G.locations.exitDungeon(ds, { day: clock.day,
        memory: dungeonMemory, clock });
    } catch (err) {
      if (!exitErrLogged) {
        exitErrLogged = true;
        console.error('main.js: исключение при выходе из локации — ' +
          'состояние подземелья будет снято в любом случае ' +
          '(повторные предупреждения подавлены).', err);
      }
    } finally {
      dungeonState = null;
      G.dungeonUI.close();
      saveNow();
    }
  }
  // 000153.03 (D4/D6): переход МЕЖДУ этажами (descend/ascend из
  // interactExit) — ТОЛЬКО через locationOnInteract (три канала,
  // один код, 000177). Семантика ВСЕ-ИЛИ-НИЧЕГО: либо герой на
  // НОВОМ этаже (порядок зафиксирован: close → state →
  // startLocationUI → saveNow), либо при срыве домена/проведения —
  // СОВЕРШЕННО НИЧЕГО НЕ МЕНЯЕТСЯ: состояние, UI, память, сейв,
  // день (clock на переходном пути НЕТ — день НЕ тратится, ТЗ
  // пп.1–2); повтор [E] безопасен. В отличие от 000170 (finally с
  // ОБНУЛЕНИЕМ — страховка день-цепи exitDungeon→clock.event):
  // буквенное обнуление здесь выкинуло бы героя в мир на пещерном
  // тайле в глубине — последний резерв (state=null + close)
  // срабатывает ТОЛЬКО если восстановление на старый этаж тоже
  // упало (тот же last-resort, что 000170). saveNow — ПОСЛЕ свапа
  // (контракт §9.3: activeRec сериализует НОВЫЙ этаж).
  let transErrLogged = false;
  function transitionFloor(ds, ev) {
    const L = G.locations;
    // Та же форма ctx, что maybeEnterDungeon (enterLocation :2143).
    const ctx = { map, mapPixels, player, hero, day: clock.day,
      memory: dungeonMemory, intervalMs: moveIntervalBase() };
    let next = null;
    try {
      next = ev.type === 'descend'
        ? L.descendFloor(ds, ctx)
        : L.ascendFloor(ds, ctx);
    } catch (err) {
      if (!transErrLogged) {
        transErrLogged = true;
        console.error('main.js: исключение при переходе этажей — ' +
          'герой остаётся на текущем этаже (повторные ' +
          'предупреждения подавлены).', err);
      }
      return; // ВСЕ-ИЛИ-НИЧЕГО: состояние/UI/сейв/день не тронуты
    }
    if (!next) return; // домен вернул null (гард/деградация) — no-op
    try {
      G.dungeonUI.close(); // explored=null → start(): Set() (D13)
      dungeonState = next; // activeDungeonMemoryRec auto-следит
      startLocationUI(
        next.kind === 'city' ? cityOnMove : dungeonOnMove,
        locationOnInteract);
      saveNow();
    } catch (err) {
      if (!transErrLogged) {
        transErrLogged = true;
        console.error('main.js: исключение при проведении перехода — ' +
          'восстановление на старый этаж (повторные предупреждения ' +
          'подавлены).', err);
      }
      try {
        dungeonState = ds; // герой на СТАРОМ этаже
        if (!G.dungeonUI.isActive())
          startLocationUI(dungeonOnMove, locationOnInteract);
      } catch (err2) {
        // Резерв 000170 (last-resort): герой не теряется никогда.
        dungeonState = null;
        try { G.dungeonUI.close(); } catch (_) {}
      }
      try { saveNow(); } catch (_) {}
    }
  }
  function dungeonOnMove(dx, dy) {
    const ds = dungeonState;
    if (!ds) return;
    const ev = G.locations.dungeonMove(ds, dx, dy, performance.now(),
      { inCombat: !!(G.combatUI && G.combatUI.isActive()) });
    if (!ev) return;
    const dayBefore = clock.day;
    clock.addStep(1);
    // 000177: exit-события из шага НЕТ (выход — [E],
    // locationOnInteract); шаг на совмещённый тайл = обычный moved.
    if (ev.type === 'combat') { startDungeonCombat(ev.group); return; }
    const chest = ev.chest;
    if (chest) { applyDungeonChest(ds, chest, dayBefore); }
  }
  function applyDungeonChest(ds, chest, dayBefore) {
    hero.gold += chest.gold;
    // Предмет в сундуке — id из каталога (assets/items) → в инвентарь.
    let itemMsg = '';
    if (chest.item) {
      const it = G.getItem(chest.item);
      // Ревью 000153.01: призрак-предмет (id удалён из каталога
      // МЕЖДУ сборками — содержимое сундуков теперь персистируется
      // в сейве) — G.getItem → null: предмет не начисляется,
      // сообщения нет, падения НЕТ (паттерн buyItem, items.js:
      // !it → ok:false без обращения к it.name).
      if (it) {
        const add = G.addItem(hero, chest.item);
        if (add.ok) {
          itemMsg = ', ' + it.name;
        } else {
          // 000186: overflow → авто-золото по каталожному value
          // (семантика 000132, combatEndLoot) — предмет НЕ теряется
          // (один предмет, qty = 1).
          const overflow = typeof it.value === 'number' ? it.value : 0;
          hero.gold += overflow;
          itemMsg = ' (не влезло: +' + overflow + ' золота)';
        }
      }
    }
    const msg = 'Сундук: +' + chest.gold + ' золота' + itemMsg;
    ds.log.push(msg);
    // 000214 (ревью): шаг, закрывающий день, на клетке с сундуком —
    // onDay-флеш «…День N.» уже выставлен ДО этой ветки; перекрыв
    // его, сделаем смену дня невидимой (в мире конкурента флешу нет
    // — паритет): строка сундука ПРИБИРАЕТСЯ к полному флешу дня.
    hudFlash = (clock.day !== dayBefore ? hudFlash + '\n' : '') + msg;
    hudFlashUntil = performance.now() + 5000;
    G.playerUI && G.playerUI.render();
  }
  function cityOnMove(dx, dy) {
    const ds = dungeonState;
    if (!ds) return;
    // Задача 000107: открытые оверлеи (buildingUI/npcUI) — движение
    // заблокировано (паритет с миром: гейты keydown main.js). Оба
    // канала: keyboard (dungeon-ui → ctx.onMove) и touch D-pad
    // (touchMove → onMove).
    if ((G.buildingUI && G.buildingUI.isActive()) ||
        (G.npcUI && G.npcUI.isActive())) return;
    // 000148.05 (ревью): ввод имени города (renameInput) открыт —
    // движение блокировано. ГЕЙТ В ТОЧКЕ СХОДА НАКРЫВАЕТ ОБА КАНАЛА
    // (keyboard: dungeon-ui window keydown ЦФЫВ → ctx.onMove; touch
    // D-pad: touchHoldStep → ctx.onMove) — keydown-гейт main.js
    // (D-.05p) свой обработчик не гасит для dungeon-ui (слушатель
    // dungeon-ui зарегистрирован РАНЬШЕ, stopPropagation не гасит
    // другие window-слушатели) — без гейта буквы Ц/Ф/Ы/В в имени
    // сдвигали героя (регрессионный пин CI-V17).
    if (G.buildingActions &&
        typeof G.buildingActions.renameInputActive === 'function'
        && G.buildingActions.renameInputActive()) return; // 000148.05
    // 000177: exit-события из шага НЕТ — шаг на дверь = обычный
    // moved; выход — ТОЛЬКО [E] (locationOnInteract).
    const ev = G.locations.cityMove(ds, dx, dy, performance.now(),
      { inCombat: !!(G.combatUI && G.combatUI.isActive()) });
    if (ev) clock.addStep(1);
  }
  // 000177/000153.03/000157.03: [E] в локации — ЕДИНЫЙ путь
  // (клавиша dungeon-ui / тач-кнопка main.js / debug — три канала,
  // один код): interactExit →
  //   { type: 'exit' }   — выход ЧЕРЕЗ exitLocation (контракт 000170:
  //      try/catch/finally) + flash «Вы вышли из <name>.» (слово в
  //      слово, 5 сек; день+1 — exitDungeon) — БИТ-В-БИТ;
  //   { type: 'descend' }/{ type: 'ascend' } — переход этажей
  //      ЧЕРЕЗ transitionFloor (все-или-ничего, 000153.03 D4/D6) +
  //      flash ОДНОЙ строкой «Спуск: глубина N.» / «Подъём:
  //      глубина N.» (D7; день НЕ тратится; endsWith-пины 000183 —
  //      exit-flash не затронут);
  //   null — вне обеих клеток: город → buildingActions.interactCity
  //      (000107/000071: buildingUI → «Диалог» → npcUI), подземелье
  //      на клетке залежи → сбор (000157.03), иначе no-op (000121).
  // Приоритет [E] (000157.03): выход (000177) > город (000107) >
  // залежь (000157.03) > no-op; конфликт «выход vs залежь» исключён
  // по построению (залежь ≠ выходная клетка — свип LOC-18).
  function locationOnInteract() {
    const ds = dungeonState;
    if (!ds) return;
    // 000148.05 (ревью, defense-in-depth): ввод имени города
    // (renameInput) открыт — [E] в городе блокирован ВСЕМИ каналами
    // (клавиша dungeon-ui / тач-кнопка / debug — один код). Без
    // гейта [E] на двери-клетке с открытым вводом шло в interactExit
    // → exitLocation (гард D-.05k — в interactCity, exit-путь не
    // накрывал): герой выходил из города, input-оверлей оставался в
    // DOM в мире. После гейта cityOnMove сценарий через UI
    // недостижим (до двери не дойти, оверлей с двери не открыть) —
    // контракт D-.05p «KeyE в городе — no-op» держится ГЕЙТОМ, а не
    // недостижимостью (паритет 000162 resurrectUI).
    if (ds.kind === 'city' &&
        G.buildingActions &&
        typeof G.buildingActions.renameInputActive === 'function'
        && G.buildingActions.renameInputActive()) return; // 000148.05
    const ev = G.locations.interactExit(ds);
    if (ev) {
      if (ev.type === 'exit') {
        exitLocation(ds);
        hudFlash = 'Вы вышли из ' + ev.name + '.';
        hudFlashUntil = performance.now() + 5000;
        return;
      }
      // 000153.03: переход этажей (descend/ascend) — день НЕ
      // тратится. flash — при фактическом свапе (гард no-op:
      // при срыве домена dungeonState — прежний объект), из
      // ФАКТИЧЕСКОЙ глубины ПОСЛЕ свапа (D7: не арифметика).
      transitionFloor(ds, ev);
      if (dungeonState && dungeonState !== ds) {
        hudFlash = ev.type === 'descend'
          ? 'Спуск: глубина ' + dungeonState.dg.depth + '.'
          : 'Подъём: глубина ' + dungeonState.dg.depth + '.';
        hudFlashUntil = performance.now() + 5000;
      }
      return;
    }
    if (ds.kind === 'city' && G.buildingActions)
      G.buildingActions.interactCity();
    // 000157.03: [E]-залежь (dungeon) — отдельный if-блок ПОСЛЕ
    // city (лёгкий текстовый мерж; ветки exit/city — не тронуты).
    // Fail-closed-гарды (UMD 000038): load-time — wiring-секция.
    if (ds.kind === 'dungeon'
        && typeof G.gatherDeposit === 'function'
        && typeof G.canAddItem === 'function') {
      const dep = G.locations.interactDeposit(ds);
      if (dep) {
        const r = G.gatherDeposit(ds.contents, dep.id,
          (it, n) => G.canAddItem(hero, it, n).ok);
        if (!r.ok) {
          // Единственный достижимый отказ — «не влезает»
          // (interactDeposit возвращает только не-собранную залежь
          // под ногами). Заложь ОСТАЁТСЯ — повтор после освобождения
          // инвентаря: flash (5 с), БЕЗ строки в ds.log, БЕЗ
          // авто-золота (D7 — предмет не теряется никогда).
          hudFlash = 'Залежь: не влезает в инвентарь';
          hudFlashUntil = performance.now() + 5000;
          return;
        }
        // Награда по сундуку-шаблону (dungeonOnMove), без золота.
        const it = G.getItem(r.item); // ghost-guard (000153.01)
        if (it) G.addItem(hero, r.item, r.amount);
        const msg = 'Залежь: +' + r.amount + ' ' + (it ? it.name : r.item);
        ds.log.push(msg);
        hudFlash = msg;
        hudFlashUntil = performance.now() + 5000;
        G.playerUI && G.playerUI.render();
      }
    }
  }
  // Задача 000107 (D4): ЕДИНСТВЕННЫЙ решатель shop-формата {npc,
  // stock} для npcUI (deps.shopFor building-actions). Город (000108):
  // сток — ds.cityShops по (город, клетка) — 6-полевой makeCityShop,
  // подаём только .stock; ТОЛЬКО у NPC с торговля (иначе null —
  // иначе TypeError в ui.js renderTradeTab: у Берты таверны 44
  // записи в cityShops ЕСТЬ, а торговля НЕТ). Мир — как было
  // (npcShopFor, 000029) — КЛЮЧЕВОЙ путь не тронут.
  // 000134: клетка города БЕЗ cityShops-записи — Лавка (id 5): нет
  // map_index (spec/buildings.md «Магазины») → стока постройки нет → NPC-канал
  // (npcStocks по npcId) как в мире — ЖИВОЙ глобальный сток Хольда.
  function shopFor(npc, t) {
    const ds = dungeonState;
    if (ds && ds.kind === 'city' && ds.cityShops && t) {
      const s = ds.cityShops[t.x + ',' + t.y];
      if (!s) return npc ? npcShopFor(npc.id) : null; // 000134
      if (!npc || !npc.торговля || !Array.isArray(npc.торговля.предметы)) {
        return null;
      }
      return { npc, stock: s.stock };
    }
    return npcShopFor(npc.id);
  }

  // Бой с блуждающей группой подземелья.
  function startDungeonCombat(g) {
    const ds = dungeonState;
    // То же, что и в мире (000096): панель не должна накрывать
    // подземелье после боя.
    if (G.playerUI && G.playerUI.isOpen()) G.playerUI.toggle(false);
    // 000086: панель «Отряд» — закрыть (тот же стек, паттерн 000096).
    if (G.squadUI && G.squadUI.isOpen()) G.squadUI.toggle(false);
    if (G.buildingUI && G.buildingUI.isActive()) G.buildingUI.close(); // 000071
    if (G.craftUI && G.craftUI.isActive()) G.craftUI.close(); // 000126
    // Задача 000087: `const combat` — onEnd читает ЖИВОЙ объект боя
    // ПОЗЖЕ (гибель — по combat.units, D2); guard isActive — выше
    // (в вызывающем коде подземелья).
    clearInvisibilityOnCombatStart();
    const combat = G.combatUI.startCombat({
      hero,
      // Эфир (задача 000081): постоянный союзник — ВСЕГДА.
      efir,
      // 000118 (вариант (a)): флаг первой встречи (из сейва).
      efirMet,
      // Задача 000087: отряд — данные makeAlly (000082), ПОСЛЕ Эфира.
      rosterData: companionAllies(),
      // 000194: быстрые предметы союзников — снимок live-карты.
      allyQuick: sanitizeAllyQuick(allyQuick),
      // 000195: та же live-карта — re-sync u.quick в бою (syncAllyQuickLive).
      allyQuickLive: allyQuick,
      // 000249: та же live-карта — «последнее заклинание» (сидинг
      // союзников на старте + запись на успешном касте, combat-ui).
      lastSpells: lastSpells,
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
          ds.log.push((g.boss ? 'Босс' : 'Группа') + ' повержена. +' + res.xp + ' опыта, +' + res.gold + ' золота.');
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
        // Задача 000132: предметный лут в журнал (паттерн 000066 —
        // ПО ОДНОЙ строке на push, НЕ join('\n')): порядок — строка
        // «…повержена. +N опыта.» → лут → отряд.
        for (const l of combatEndLoot(res)) ds.log.push(l);
        // Задача 000087: отряд — xp/уровни/гибель в журнал подземелья
        // (до saveNow, D8). Канал — ds.log, НЕ hudFlash: строка =
        // событие (паттерн 000066 — ПО ОДНОЙ на push, не join('\n'));
        // порядок: строка «…повержена. +N опыта.» → строки отряда.
        for (const l of combatEndCompanions(res, combat)) ds.log.push(l);
        G.playerUI && G.playerUI.render();
        G.dungeonUI.render();
        saveNow();
      },
    });
    // 000118: первая встреча Эфира — флаг (реальные c.units).
    noteEfirCombat(combat);
  }

  // --- Камера ---
  // Фазо-запрет (задача 000228): cam ≡ renderPos(now) + 0.5 НА КАЖДОМ
  // кадре — герой ровно в центре экрана, мир скроллится со скоростью
  // ходьбы (1px-шаги), в покое камера ровно на центре тайла (нет
  // пульса погони и асимптотического хвоста). Контракты и причины —
  // memory/000228-world-rigid-snap.md.
  function updateCamera(rp) {
    cam.x = rp.x + 0.5;
    cam.y = rp.y + 0.5;
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

  // Видимые тайлы кадра (общие для обоих слоёв: WebGL-подложка/фолбэк
  // и слой спрайтов). 000176: наполнение одно, legacy-вершины — только
  // под элементами, которые спрайт-слой не рисует (поэлементный гейт).
  const frameTiles = [];

  // --- 000176: селекторы готовности элементов — ОДИН источник для
  // ОБОИХ слоёв (WebGL-подложка/фолбэк и слой спрайтов) ---
  //
  // XOR-контракт (memory/000176-global-map-single-pass.md): каждый
  // элемент мира (тайл / постройка / группа мобов / Флогистон) в кадре
  // рисуется РОВНО ОДИН раз — спрайтом (#sprites) ИЛИ legacy-фигурой
  // (#game), не оба; кадр спрайта не готов → legacy-фигура (контракт
  // фолбэка 000011). Селекторы вынесены из инлайна проходов в ОБЩИЕ
  // хелперы: гейт buildFrame и проходы drawSprites читают одну и ту же
  // готовность — инлайн frameIndex/asset-выражений в buildFrame
  // запрещён (дрейф = дубль или пропажа). Возврат null — «спрайт
  // нарисовать не может» (нет лоадера / кадр не загрузился).
  //
  // Тайлы — по ТЕКУЩЕМУ кадру анимации (G.frameIndex): иначе вода
  // «мерцала» бы цветным при смене кадра.
  function tileFrameImg(t, now) {
    if (!spriteLoader) return null;
    const frames = G.tileFrames(t.terrain);
    if (!frames.length) return null;
    const idx = frames.length > 1
      ? G.frameIndex(now, t.x, t.y, frames.length) : 0;
    return spriteLoader.image(frames[idx]) || null;
  }

  function mobFrameImg(t, now) {
    if (!spriteLoader) return null;
    const mf = G.mobFrames(t.mobGroup);
    if (!mf.length) return null;
    const idx = mf.length > 1
      ? G.frameIndex(now, t.x, t.y, mf.length) : 0;
    return spriteLoader.image(mf[idx]) || null;
  }

  // Кадр героя: тот же выбор action, что и в проходе Флогистона
  // (idle/walk по движению, attack/cast — отладочная animAction). Окно
  // walk/idle (задача 000063) — через G.walkWindowMs от интервала шага
  // (motion.js), а не фикс 260 мс: фикс подобран под старый интервал
  // 140 мс и при базовых 420 мс давал замирание 160 мс в idle за цикл
  // — рваную ходьбу. Без walkWindowMs — старое окно 260.
  function heroFrameImg(now) {
    if (!spriteLoader) return null;
    const action = now < animUntil ? animAction
      : (now - lastStepAt < (G.walkWindowMs
        ? G.walkWindowMs(stepIntervalMs())
        : 260) ? 'walk' : 'idle');
    const pf = G.phlogistonFrames(action);
    if (!pf.length) return null;
    const idx = pf.length > 1 ? (Math.floor(now / 240) % pf.length) : 0;
    return spriteLoader.image(pf[idx]) || null;
  }

  // Спрайт постройки: слотовая ветка — первична (побайтово как раньше);
  // город (задача 000110) и лагерь (задача 000131) — НЕ слоты, спрайт
  // по каталожному buildingId. typeof-гарды — из исходного выражения
  // прохода 2 (старый sprites.js без citySprite/campSprite — тихая
  // деградация, игра не падает). spriteLoader === null (нет sprites.js
  // в цепочке — G.buildingSprite определён ТОЛЬКО там) — null, как у
  // остальных селекторов (контракт §4: legacy-сцена рисуется ПОЛНОСТЬЮ,
  // игра не падает; до правки по ревью 000176 здесь краш ПЕРВОГО кадра:
  // TypeError в buildFrame → frame, rAF-цикл умирал).
  // 000224: анимированный слот (3/5) — ТЕКУЩИЙ КАДР строго (G.
  // buildingFrames + G.buildingFrameIndex, BUILDING_FRAME_MS = 800):
  // кадр не загрузился — legacy-маркер/skip, FALLBACK НА БАЗУ ЗАПРЕЩЁН
  // (прецедент воды 000025). now — ОДИН на кадр (frame(now) → оба
  // потребителя), XOR-паритет 000176 цел.
  function buildingAsset(rec, now) {
    if (!spriteLoader) return null;
    const frames = typeof G.buildingFrames === 'function'
      ? G.buildingFrames(rec.type) : null;
    if (frames && frames.length > 1) {
      return frames[G.buildingFrameIndex(now, rec.x, rec.y, frames.length)];
    }
    // 000238: город/лагерь — кадры СВОИХ таблиц (ключ — buildingId,
    // не слот: CITY_FRAMES 53, CAMP_FRAMES 47) — строгая готовность
    // и формула те же, что слоты (000224); порядок: слот → город →
    // лагерь (у слотовых записей buildingId = null или id каталожной
    // записи слотов 8..12 (000073); 47 и 51..54 там не бывают —
    // только NONE-каналы).
    if (rec.buildingId != null
        && typeof G.buildingFrameIndex === 'function') {
      const nf = (typeof G.cityFrames === 'function'
        ? G.cityFrames(rec.buildingId) : null) ||
        (typeof G.campFrames === 'function'
         ? G.campFrames(rec.buildingId) : null);
      if (nf && nf.length > 1) {
        return nf[G.buildingFrameIndex(now, rec.x, rec.y, nf.length)];
      }
    }
    return G.buildingSprite(rec.type) ||
      (rec.buildingId != null && typeof G.citySprite === 'function'
       ? G.citySprite(rec.buildingId) : null) ||
      (rec.buildingId != null && typeof G.campSprite === 'function'
       ? G.campSprite(rec.buildingId) : null) || null;
  }

  // Запись постройки по якорю (перенос из drawSprites; 000042):
  // source of truth — та, что раскладывала её в мире, ОДИН источник
  // геометрии. typeof-гард: устаревший map.js без buildingAt —
  // фолбэк-скан прямоугольника вправо/вниз по tileCache, НО с ПРОВЕРКОЙ
  // РАВЕНСТВА buildingAnchor (одного inBuilding мало: чужая соседняя
  // постройка зальёт скан и даст ложные 2x1/1x2). Якоря нет — 1x1.
  function buildingRec(ax, ay) {
    if (map && typeof map.buildingAt === 'function') {
      return map.buildingAt(ax, ay);
    }
    const t0 = tileCache.tile(ax, ay);
    if (!t0.inBuilding) return null;
    const same = (t) => t.inBuilding && t.buildingAnchor &&
      t.buildingAnchor[0] === ax && t.buildingAnchor[1] === ay;
    let w = 1, hgt = 1;
    // Окно фолбэк-скана — по текущему максимуму footprint'а
    // (000055: константы стали функциями buildMaxW()/buildMaxH();
    // города — до 7×7, 000103). memory/000042: `undefined || 3`
    // совпадало случайно — правка обязательна.
    while (w < (G.buildMaxW ? G.buildMaxW() : (G.BUILD_MAX_W || 3))
         && same(tileCache.tile(ax + w, ay))) w++;
    while (hgt < (G.buildMaxH ? G.buildMaxH() : (G.BUILD_MAX_H || 3))
         && same(tileCache.tile(ax, ay + hgt))) hgt++;
    return { anchor: [ax, ay], type: t0.building,
             x: ax, y: ay, w, h: hgt,
             entrance: [ax, ay], wealth: 0 };
  }

  // now — время кадра: заряд группы (000173) спрашивает у мувера
  // дробную точку от него (время — только аргумент кадра, D-RNG-1).
  function buildFrame(rp, now) {
    const verts = quadVerts;
    verts.length = 0;
    frameTiles.length = 0;

    // Отрисовываем только видимую область + запас (000019); тайлы
    // берём из кэша — шум пересчитывается лишь для новых тайлов.
    // 000176: legacy-вершины (цветные квады/маркеры/ромб) — ТОЛЬКО
    // для элементов, которые спрайт-слой нарисовать НЕ МОЖЕТ (кадр
    // спрайта не готов) — поэлементный гейт через ОБЩИЕ селекторы
    // (tileFrameImg/mobFrameImg/heroFrameImg/buildingAsset — те же,
    // что проходы drawSprites; XOR-контракт). Штатное состояние (все
    // ассеты ready) — 0 вершин: drawArrays(gl.TRIANGLES, 0, 0);
    // bufferData на кадр — с пустой нагрузкой (вызов остаётся:
    // DYNAMIC_DRAW-семантика фолбэка), пересборка Float32Array с
    // данными и шум brightness() убраны (нагрузка из 000176).
    const range = G.visibleTileRange(cam.x, cam.y, canvas.width, canvas.height, zoom);
    for (let ty = range.y0; ty <= range.y1; ty++) {
      for (let tx = range.x0; tx <= range.x1; tx++) {
        const t = tileCache.tile(tx, ty);
        frameTiles.push(t); // {x, y, terrain, passable, hasBuilding, building, hasMobGroup, mobGroup}
        if (!tileFrameImg(t, now)) {
          const base = TILE_COLORS[t.terrain];
          // Небольшое вариативное освещение, чтобы тайлы не были
          // «кляксами» (шум — только для рисуемых legacy-тайлов).
          const b = map.brightness(tx, ty);
          const c = [base[0] + b * 0.05, base[1] + b * 0.05, base[2] + b * 0.05];
          pushQuad(verts, tx, ty, tx + 1, ty + 1, c);
        }

        // Маркеры на тайле.
        if (t.hasBuilding) {
          // Якорь — из тайла (проход 2 собирает якоря так же:
          // t.buildingAnchor): вход НЕ всегда якорь (3x3 школа/храм,
          // 2x2/5x5/7x7 города — «вход» каталога смещён),
          // buildingAt(вход) дало бы null — и маркер «пролил» бы
          // под готовым спрайтом (000176).
          const a = t.buildingAnchor;
          const rec = a ? buildingRec(a[0], a[1]) : buildingRec(t.x, t.y);
          const asset = rec ? buildingAsset(rec, now) : null;
          const bimg = (spriteLoader && asset)
            ? spriteLoader.image(asset) : null;
          if (!bimg) {
            pushQuad(verts, tx + 0.30, ty + 0.30, tx + 0.70, ty + 0.70, BUILDING_COLOR);
          }
        } else if (t.hasMobGroup) {
          // Паритет groupVisible с проходом 3 (000122): поверженная
          // группа скрыта В ОБОИХ слоях — после победы красного
          // квадрата нет (фикс «прола», 000176).
          const visible = !G.groupVisible
            || G.groupVisible(defeatedAt, t.x, t.y);
          if (visible && !mobFrameImg(t, now)) {
            // 000173: заряжающаяся группа — ДРОБНАЯ точка глейда
            // (принцип 000033: оба слоя — одна точка кадра, иначе при
            // WebGL-фолбэке фича невидима); без заряда — целые тайловые
            // координаты (бит-в-бит как до).
            const mch = (mobCharge && mobCharge.key === t.x + ',' + t.y)
              ? mobCharge.mover.position(now) : null;
            const mx = mch ? mch.x : tx, my = mch ? mch.y : ty;
            pushQuad(verts, mx + 0.30, my + 0.30, mx + 0.70, my + 0.70,
              MOB_COLOR);
          }
        }
      }
    }

    // Флогистон: светящийся ромб в ТЕКУЩЕЙ позиции (задача 000033) —
    // фолбэк, только пока кадр спрайта героя не готов (000176 XOR:
    // герой в кадре ровно 1× — спрайт ИЛИ ромб).
    // rp — ДРОБНАЯ точка рендера (глейд prev→next), одна для обоих
    // слоёв; +0.5 — центр тайла.
    if (!heroFrameImg(now)) {
      const px = rp.x + 0.5, py = rp.y + 0.5, s = 0.28;
      verts.push(
        px, py - s, PLAYER_COLOR[0], PLAYER_COLOR[1], PLAYER_COLOR[2], 1,
        px + s, py, PLAYER_COLOR[0], PLAYER_COLOR[1], PLAYER_COLOR[2], 1,
        px, py + s, PLAYER_COLOR[0], PLAYER_COLOR[1], PLAYER_COLOR[2], 1,
        px, py - s, PLAYER_COLOR[0], PLAYER_COLOR[1], PLAYER_COLOR[2], 1,
        px + s, py, PLAYER_COLOR[0], PLAYER_COLOR[1], PLAYER_COLOR[2], 1,
        px - s, py, PLAYER_COLOR[0], PLAYER_COLOR[1], PLAYER_COLOR[2], 1,
      );
    }

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
  // Фолбэк ПОЭЛЕМЕНТНЫЙ (000176): элемент без готового кадра спрайта
  // рисует свою legacy-фигуру WebGL-подложка (гейт — buildFrame, те же
  // селекторы готовности); ни один ассет не загрузился — выходим без
  // рисования, под слоем полная цветная сцена (контракт 000011).
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
    // Снап сетки тайлов (задачи 000215/000228): текстуры тайлов — на
    // ЦЕЛЫХ пикселях, у соседних клеток — ОДИН общий край (нет AA-шва
    // → тёмных линий). Мир — мир-якорная жёсткая решётка
    // worldAnchoredTileEdges (край — функция ЦЕЛОГО индекса и зума +
    // один общий сдвиг на ось за кадр; контракты —
    // memory/000228-world-rigid-snap.md); тихий фолбэк —
    // snappedTileEdges (поведение 000215, урезанная цепочка map.js) —
    // паттерн toPt, игра не падает. Сетка краёв — ОДИН раз на кадр
    // (O(1) на тайл): диапазон ТОТ ЖЕ, что buildFrame
    // (visibleTileRange — чистая, пересчёт бит-в-бит). Тихий fallback
    // на (sx, sy, zoom, zoom) — паттерн toPt; дефенсивно (map.js
    // всегда в цепочке ДО main.js).
    const tileRange = (typeof G.visibleTileRange === 'function'
      && (typeof G.worldAnchoredTileEdges === 'function'
        || typeof G.snappedTileEdges === 'function'))
      ? G.visibleTileRange(cam.x, cam.y, w, h, zoom)
      : null;
    const tileEdges = tileRange
      ? (typeof G.worldAnchoredTileEdges === 'function'
          ? G.worldAnchoredTileEdges(tileRange.x0, tileRange.y0,
              tileRange.x1, tileRange.y1, cam.x, cam.y, zoom, w, h)
          : G.snappedTileEdges(tileRange.x0, tileRange.y0,
              tileRange.x1, tileRange.y1, cam.x, cam.y, zoom, w, h))
      : null;
    const snapTile = (tileEdges && !Number.isNaN(tileEdges.x[0]))
      ? (tx, ty) => {
          const ix = tx - tileRange.x0, iy = ty - tileRange.y0;
          if (ix < 0 || iy < 0 || ix + 1 >= tileEdges.x.length
              || iy + 1 >= tileEdges.y.length) return null;
          const x = tileEdges.x[ix], y = tileEdges.y[iy];
          return { x, y, w: tileEdges.x[ix + 1] - x,
            h: tileEdges.y[iy + 1] - y };
        }
      : null;
    // Декорации тайлов (задача 000039): порог зума вычисляется один раз
    // на кадр — при малом зуме видимых тайлов explode и по-тайловый
    // проход дорог. typeof-гард: старый sprites.js без tileVisuals —
    // слой просто выключен (игра деградирует до вида 000021-минус-рендер).
    const showVisuals = typeof G.tileVisuals === 'function'
      && zoom >= (G.VISUALS_MIN_ZOOM || 0);
    // Природный лут (задача 000158.05): крупнее декораций → виден
    // чуть дальше (LOOT_MIN_ZOOM 16 < VISUALS_MIN_ZOOM 24).
    // typeof-гарды: старый sprites.js (нет lootSprite) ИЛИ старый
    // day.js (нет lootVisible) — слой просто выключен, тихо
    // (000038/000053); рендер своё состояние НЕ хранит —
    // невидимость после сбора — ТОЛЬКО через G.lootVisible
    // (000158.04).
    const showLoot = typeof G.lootSprite === 'function'
      && typeof G.lootVisible === 'function'
      && zoom >= (G.LOOT_MIN_ZOOM || 0);

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
    // Запись постройки по якорю — buildingRec (IIFE-уровень, 000176):
    // source of truth и фолбэк-скан — см. там.

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
      // 000176: селектор кадра — общий с гейтом legacy-тайла
      // (buildFrame); не загрузившийся кадр — null, элемент
      // рисуется фолбэком там.
      const img = tileFrameImg(t, now);
      if (img) {
        // 000215: снап-прямоугольник (целые края, общий с соседом);
        // fallback — старые аргументы (устаревший map.js / клетка вне
        // edge-сетки — гипотетически: frameTiles из того же range).
        const r = snapTile ? snapTile(t.x, t.y) : null;
        s2.drawImage(img, r ? r.x : sx, r ? r.y : sy,
          r ? r.w : zoom, r ? r.h : zoom);
      }
      if (showVisuals && !(t.inBuilding && !t.isEntrance)) {
        for (const e of G.tileVisuals(t.x, t.y, t.terrain)) {
          if (!spriteLoader.isReady(e.sprite)) continue;
          const r = G.visualDrawRect(e, sx, sy, zoom);
          s2.drawImage(spriteLoader.image(e.sprite),
            r.x, r.y, r.size, r.size);
        }
      }
      // Природный лут (задача 000158.05): СТРОГО ПОСЛЕ декораций
      // (крупный объект поверх травы), ПЕРЕД постройками/мобами/
      // Флогистоном (проходы 2/2.5/3). Видимость — ТОЛЬКО
      // G.lootVisible (000158.04; ключ 'x,y', fail-open). Стены
      // постройки — skip (000042; структурно лут под постройкой
      // невозможен — 000158.03 — защитный код). Не загрузившийся
      // спрайт — тайл без иконки, слой не падает (паттерн
      // декораций: isReady false → пропуск).
      if (showLoot && t.loot
          && G.lootVisible(collectedLoot, t.x, t.y)
          && !(t.inBuilding && !t.isEntrance)) {
        const ls = G.lootSprite(t.loot.item, t.x, t.y);
        if (ls && spriteLoader.isReady(ls.sprite)) {
          const r = G.visualDrawRect(ls, sx, sy, zoom);
          s2.drawImage(spriteLoader.image(ls.sprite),
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
      // Спрайт: слотовая ветка — первична, город/лагерь — по
      // каталожному buildingId (000176: выражение вынесено в
      // buildingAsset — ОБЩИЙ селектор с гейтом legacy-маркера в
      // buildFrame; семантика веток — там; 000224: анимированный слот
      // — строгий текущий кадр, тот же now, что гейт).
      const asset = buildingAsset(rec, now);
      const img = spriteLoader.image(asset);
      if (!img) continue;
      const p = toPt(rec.x, rec.y);
      s2.drawImage(img, p.x, p.y, rec.w * zoom, rec.h * zoom);
    }

    // Проход 2.5 (задача 000172): окружность радиуса агрессии —
    // красная пунктирная полупрозрачная (AGGRO_CIRCLE_*).
    // Радиус агрессии = дистанция триггера боя (000135, ЕДИНЫЙ источник
    // G.groupZoneInfo): triggers=true (aggressive/territorial) — круг
    // радиуса info.radius*zoom по центру тайла группы; neutral/timid
    // бой ведут ТОЛЬКО на своём тайле (spec/mobs.md «Состав групп» «может пройти мимо») —
    // радиус агрессии 0, окружности нет. Видимость — тот же фильтр, что
    // Проход 3: поверженная сегодня группа (defeatedAt) не аггрит.
    // Z-порядок (000042): тайлы/декорации < постройки < агро-окружности
    // < мобы < Флогистон — под спрайтами, не заслоняет карту и героя.
    // Тихий гард: экспорта нет (регрессия порядка загрузки) — прохода
    // нет (load-time console.error уже есть, L1790-1795 — не дублируем).
    if (typeof G.groupZoneInfo === 'function') {
      // 000235.08: cold_breath — сужение радиуса триггера в отрисовке
      // (UI не врёт про радиус; локальная переменная, info НЕ
      // мутируется; 0 → без сужения, как до). 000235.09:
      // dark_presence — max из двух источников (одна переменная до
      // цикла).
      const cbR0 = (G.Spells
        && typeof G.Spells.coldBreathRadius === 'function')
        ? G.Spells.coldBreathRadius(hero, clock.day) : 0;
      const dpR = (G.Spells
        && typeof G.Spells.darkPresenceRadius === 'function')
        ? G.Spells.darkPresenceRadius(hero, clock.day) : 0;
      const cbR = Math.max(cbR0, dpR);
      for (const t of frameTiles) {
        if (!t.hasMobGroup) continue;
        if (G.groupVisible && !G.groupVisible(defeatedAt, t.x, t.y)) continue;
        const info = G.groupZoneInfo(t.mobGroup);
        if (!info || !info.triggers || !(info.radius > 0)) continue;
        let r = info.radius;
        if (cbR > 0 && Math.max(Math.abs(t.x - player.x),
                                 Math.abs(t.y - player.y)) <= cbR) {
          r = Math.max(1, r - 1);
        }
        const c = toPt(t.x + 0.5, t.y + 0.5);
        s2.beginPath();
        s2.setLineDash(AGGRO_CIRCLE_DASH);
        s2.strokeStyle = AGGRO_CIRCLE_STYLE;
        s2.lineWidth = AGGRO_CIRCLE_WIDTH;
        s2.fillStyle = AGGRO_CIRCLE_FILL;
        s2.arc(c.x, c.y, r * zoom, 0, Math.PI * 2);
        s2.fill();
        s2.stroke();
        s2.setLineDash([]); // гигиена: не оставлять dash-состояние в s2
      }
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
      // 000173: заряжающаяся группа — ДРОБНАЯ точка глейда (принцип
      // 000033: оба слоя — одна точка кадра, как мувер героя);
      // frameIndex — по ЦЕЛОМУ тайлу (стабильный выбор кадра спрайта,
      // не «прыгает» по пути рывка); формула drawImage/порядок/число
      // draw — БЕЗ ИЗМЕНЕНИЙ (пины 000122/000039).
      const ch = (mobCharge && mobCharge.key === (t.x + ',' + t.y))
        ? mobCharge.mover.position(now) : null;
      const p = toPt(ch ? ch.x : t.x, ch ? ch.y : t.y);
      const sx = p.x, sy = p.y;
      // 000176: селектор кадра — общий с гейтом legacy-маркера
      // (buildFrame): groupVisible-паритет — в обоих местах.
      const m = mobFrameImg(t, now);
      if (m) s2.drawImage(m, sx - zoom * 0.1, sy - zoom * 0.15, zoom * 1.2, zoom * 1.2);
    }

    // Флогистон: idle/walk по движению, attack/cast — отладочная
    // animAction (000176: выбор кадра — heroFrameImg, ОБЩИЙ селектор с
    // гейтом legacy-ромба в buildFrame — герой в кадре ровно 1×, XOR).
    const pi = heroFrameImg(now);
    if (pi) {
      const size = zoom * 1.15;
      // Та же ДРОБНАЯ точка, что и WebGL-ромб (задача 000033):
      // фолбэк-слой и спрайт не должны расходиться.
      const pp = toPt(rp.x + 0.5, rp.y + 0.5);
      const px = pp.x, py = pp.y;
      s2.drawImage(pi, px - size / 2, py - size / 2, size, size);
    }
  }

  // 000129: строки HUD (мир/подземелье/город, «Здесь:», хинты
  // [E]/[I], flash-отрисовка) — src/hud.js (Game.hud). Владелец
  // hudFlash/hudFlashUntil — main.js (пишут действия/бой); модуль
  // получает значения в ctx. tileAt — ОДИН раз на кадр (здесь).
  function renderHud() {
    if (!G.hud) return; // тихий per-frame гард (ошибка уже видна при загрузке)
    // Задача 000093: «исследовано N тайлов» — СУММА Set.size по живой
    // Map explored (O(башен), БЕЗ сериализации в кадре); строку
    // строит hud.js (только при N>0).
    let exploredCount = 0;
    for (const s of explored.values()) exploredCount += s.size;
    G.hud.update({
      hudEl: hud, game: G,
      tile: map.tileAt(player.x, player.y),
      map, player, hero,
      day: clock.day, zoom, spriteLoader,
      // 000158.04: сырой live Map 'x,y' → день сбора (hud.js сам
      // через g.lootVisible; паттерн defeatedAt).
      dungeonState, defeatedAt, collectedLoot, npcs: NPCS,
      flash: hudFlash, flashUntil: hudFlashUntil,
      exploredCount,
      campShopFor, // ОПЦИОНАЛЬНОЕ поле ctx (000095): лагерь
      // 000135: ОПЦИОНАЛЬНОЕ поле ctx (ЗНАЧЕНИЕ — тип группы или
      // null): зона триггерящей группы ВНЕ тайла → раннее
      // предупреждение. В подземелье/городе скан не гоняем
      // (dungeonState != null — цепь hud.js и так гасит ветку).
      zoneGroup: dungeonState ? null : zoneGroupForHud(),
    });
  }

  // --- Цикл ---
  let lastMove = 0;
  // 000170 (D3): watchdog — исключение в ЛЮБОЙ точке кадра (saveNow,
  // maybeStartCombat→startCombat, enterLocation, onDay через
  // clock.addStep, drawSprites, renderHud, applyVisibility) НЕ убивает
  // rAF-цепь навсегда: reschedule — в finally, исключение logged once.
  // Listener'ы keydown при живом цикле продолжают потреблять keys —
  // «игра не реагирует на нажатия» исключено. keys.clear() в catch НЕ
  // делаем: заклинившая клавиша повторится при следующем keydown, а
  // сброс потерял бы удержание. Частичный кадр само-исцеляется:
  // canvas.width/height пересет каждый кадр (сбрасывает контекст).
  let frameErrLogged = false;
  function frame(now) {
    try {
      // 000173: время кадра — источник времени заряда (debug-поле
      // state.mobCharge.pos; в vm performance.now() заморожен).
      lastFrameNow = now;
      if (lungeEndMs && mobCharge && now >= lungeEndMs) {
        lungeEndMs = 0;
        if (G.combatUI
            && typeof G.combatUI.setLungeGate === 'function') {
          G.combatUI.setLungeGate(false);
        }
      }
      const inCombat = G.combatUI && G.combatUI.isActive();
      const inDungeon = dungeonState !== null;
      const inNpc = G.npcUI && G.npcUI.isActive();
      const inBuilding = G.buildingUI && G.buildingUI.isActive(); // 000071
      const inCraft = G.craftUI && G.craftUI.isActive(); // 000126
      const inResurrect = !!(G.resurrectUI && G.resurrectUI.isActive()); // 000162
      // 000150: видимость on-screen-контролов по активным экранам:
      // кнопки [I]/[E] — бой/инвентарь/вход; D-pad — инвентарь/вход
      // (в бою остаётся). Чистая touchControlsVisibility (controls.js)
      // от снимка кадра; applyVisibility идемпотентна (0 DOM-записей
      // без смены состояния). Гард — на ОБА чужих экспорта (mixed-
      // версии «controls.js без touchControlsVisibility» → деградация
      // в «всегда видимы», не TypeError в frame; пин TV7).
      if (G.touchControls
          && typeof G.touchControls.applyVisibility === 'function'
          && typeof G.touchControlsVisibility === 'function') {
        G.touchControls.applyVisibility(G.touchControlsVisibility({
          combat: !!inCombat,
          inventory: !!(G.playerUI && G.playerUI.isOpen()),
          // 000162: пикер «Воскрешение» — мапим в существующее поле
          // building (controls.js читает только combat/inventory/
          // building, R-5).
          building: !!inBuilding || !!inResurrect,
        }));
      }
      if (G.playerUI && typeof G.playerUI.applyLayer === 'function') {
        // 000195: в бою панель ПОДНЯТА над боевым оверлеем (z-25 > z-20)
        // — граница 000206 «бой — подъёма нет» снята (кнопка «Предмет
        // [T]» открывает панель в бою). hudOver (000212) НЕ тронут.
        G.playerUI.applyLayer(!!(inDungeon || inCombat) && !inNpc
          && !inBuilding && !inCraft && !inResurrect && !(
            G.buildingActions
            && typeof G.buildingActions.renameInputActive === 'function'
            && G.buildingActions.renameInputActive()));
      }
      // 000217: панель «Отряд» — тот же подъём, что 000195/000206
      // (баг-близнец: z-10 под оверлеем z-20 в городе/подземелье/бою).
      if (G.squadUI && typeof G.squadUI.applyLayer === 'function') {
        G.squadUI.applyLayer(!!(inDungeon || inCombat) && !inNpc
          && !inBuilding && !inCraft && !inResurrect && !(
            G.buildingActions
            && typeof G.buildingActions.renameInputActive === 'function'
            && G.buildingActions.renameInputActive()));
      }
      // 000212: #hud — единое инфо-окно — в локации (город/
      // подземелье) ПОВЕРХ оверлея (frame-driven, идемпотентно;
      // '25' — общий динамический слот 000206; в бою подъём снят —
      // боевой оверлей над HUD, как раньше). 000247: город — в
      // скоупе (подъём в обоих kind'ах).
      const hudOver = inDungeon
        && !inCombat && !inNpc && !inBuilding && !inCraft
        && !inResurrect;
      if (hud && hud.style) {
        const z = hudOver ? '25' : '';
        if (hud.style.zIndex !== z) hud.style.zIndex = z;
      }
      const fsOver = inDungeon
        && !inCombat && !inNpc && !inBuilding && !inCraft
        && !inResurrect;
      if (fsBtn && fsBtn.style) {
        const z = fsOver ? '25' : '';
        if (fsBtn.style.zIndex !== z) fsBtn.style.zIndex = z;
      }
      // 000235.02: книга вне боя — frame-driven мягкое скрытие при
      // активных оверлеях + ре-рендер при смене дня (дешёвый no-op,
      // пока книга закрыта; сам модуль никогда не бросает).
      if (G.spellbookOC) G.spellbookOC.applyVisibility();
      // Интервал шага (задача 000033 + 000063): база — из глобальных
      // настроек (420 мс), навык «Ловкий шаг» укорачивает, нижний
      // кламп — G.MIN_MOVE_INTERVAL_MS. Одно значение для шага и окна
      // walk/idle.
      const stepMs = stepIntervalMs();
      if (!inCombat && !inDungeon && !inNpc && !inBuilding && !inCraft
          && !inResurrect
          && now - lastMove >= stepMs) {
        if (keys.size && tryMove()) {
          lastMove = now;
          // Глейд prev→next (задача 000033): рендер скользит между
          // тайлами за время шага, а не прыгает. interval — на шаг
          // (динамическая скорость).
          if (mover) mover.step({ x: prevPos.x, y: prevPos.y },
            { x: player.x, y: player.y }, now, stepMs);
          lastStepAt = now; // Флогистон переключается на анимацию ходьбы
          clock.addStep(1); // шаги мира тикают игровой день
          // 000135: скан зон — ТОЛЬКО на успешном шаге (ТЗ); бой >
          // вход в локацию (два оверлея в одном кадре — сломанное
          // состояние). Вход откладывается на ПЕРВЫЙ успешный шаг
          // ПОСЛЕ боя, приходящийся на тайл входа: zone-бой НА тайле
          // входа — после победы герой стоит на нём, следующий шаг
          // уводит с него → вход на возвратном шаге туда-обратно
          // (ревью 000135; побег/смерть — возврат на prevPos, вход
          // не начинается).
          if (!maybeStartCombat(true, now))
            enterLocation(); // 000127: домен — src/locations.js
          saveNow();
        }
      }
      // Одна точка рендера на кадр для обоих слоёв (задача 000033).
      const rp = renderPos(now);
      updateCamera(rp);

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
      // 000176: `now` — тот же кадр, что и у drawSprites: гейт
      // legacy-вершин и проходы спрайтов видят одну и ту же
      // готовность (XOR-контракт; ready-состояние — 0 вершин).
      const verts = buildFrame(rp, now);
      gl.drawArrays(gl.TRIANGLES, 0, verts.length / 6);

      // Слой спрайтов поверх тайлов (пустой, пока ассеты не загрузились).
      if (spriteCanvas) {
        spriteCanvas.width = window.innerWidth;
        spriteCanvas.height = window.innerHeight;
      }
      drawSprites(now, rp);

      renderHud();
    } catch (err) {
      if (!frameErrLogged) {
        frameErrLogged = true;
        console.error('main.js: исключение в кадре — главный цикл ' +
          'продолжается (повторные предупреждения подавлены).', err);
      }
    } finally {
      requestAnimationFrame(frame);
    }
  }

  // Отладочный крючок (используется смоук-тестами и ручной проверкой).
  globalThis.__game = {
    get state() {
      return {
        player: { x: player.x, y: player.y },
        // ДРОБНАЯ позиция рендера (задача 000033): между шагами может
        // не совпадать с player — для ручной/смоук-проверки плавности.
        playerRender: renderPos(performance.now()),
        // Задача 000173: заряд рывка атакованной группы (render-only,
        // ВНЕ сейва, D5/D6): null | { key, from, to, pos } — pos —
        // дробная точка ТАЙЛОВЫХ координат на lastFrameNow (в vm
        // performance.now() заморожен — иначе поле всегда отдавало бы
        // старт; время — только аргумент кадра). Читаемое зеркало
        // состояния main.js — мутации запрещены.
        mobCharge: mobCharge
          ? {
              key: mobCharge.key,
              from: { x: mobCharge.from.x, y: mobCharge.from.y },
              to: { x: mobCharge.to.x, y: mobCharge.to.y },
              pos: mobCharge.mover.position(lastFrameNow),
            }
          : null,
        lungeGate: lungeEndMs > 0 && mobCharge != null,
        cam: { x: cam.x, y: cam.y },
        zoom,
        day: clock.day,
        stepsToday: clock.steps,
        save: loadedSave
          ? { version: loadedSave.version, savedAt: loadedSave.savedAt }
          : null,
        hero: {
          level: hero.level, xp: hero.xp, hp: hero.hp,
          // 000094: alive — смоук-фиксатор «ловушка не убивает»
          // (clamp HP ≥ 1; B25 tests/building-effects.test.js).
          alive: hero.alive,
          gold: hero.gold, points: hero.points,
          weight: G.inventoryWeight(hero),
          maxWeight: G.maxCarryWeight(hero),
          inventory: (hero.inventory || { slots: [] }).slots,
          // Книга заклинаний (регрессия 000045, правки ревью 000046):
          // restoreFromSave всегда задаёт hero.spells (массив), поэтому
          // здесь просто значение героя — иначе тесту не из чего читать
          // (паттерн craft/craftXp/equipmentBonus, 000046).
          spells: hero.spells,
          // 000235.02: эффекты каста вне боя — restoreFromSave всегда
          // задаёт массив → здесь просто значение героя (паттерн
          // spells/craft, 000046).
          outOfCombatEffects: hero.outOfCombatEffects,
          // 000235.04: портальная метка — restore всегда задаёт
          // {x, y, day} | null (паттерн spells/craft, 000046).
          portal_marker: hero.portal_marker,
          // Крафт (задача 000046): опциональные поля — restoreFromSave
          // всегда задаёт дефолты ({} / {} / {weapon:null,armor:null}),
          // поэтому здесь просто значения героя.
          craft: hero.craft,
          craftXp: hero.craftXp,
          craftTypes: hero.craftTypes,
          equipmentBonus: hero.equipmentBonus,
        },
        // Эфир (задача 000081): live-объект
        // {level, xp, skillXp, skills, spells} (5 полей, 000111;
        // сейв — 000085; или null, если модуль не загрузился) —
        // точка для 000086/000116.
        efir: efir || null,
        // Задача 000118: флаг первой встречи Эфира (вариант (a)):
        // true — «Эфир встречен в бою» (сейв — top-level efir_met).
        // Точка debug/e2e; канон флага — НЕ изобретать второй
        // (000113 §3.5).
        efirMet,
        // Отряд (000079; сейв — 000085/000143): live-массив записей
        // {npcId, sheet, level, xp, loyalty, hiredDay} (000143: sheet —
        // единый лист, level/xp — плоские зеркала; сейв — 4 поля,
        // level/xp внутри sheet) — точка smoke-теста для
        // 000086/000087 (читать, не менять — 000079).
        roster,
        // 000249: «последнее заклинание» { 'flogiston' | 'efir' |
        // npcId → id заклинания } — зеркало live-карты (копия на
        // каждый доступ, read-only — combat-ui пишет в оригинал).
        lastSpells: Object.assign({}, lastSpells),
        // Погибшие наёмники (000085; 000161): live-массив записей
        // {npcId, sheet, loyalty, hiredDay} — точка smoke-теста для
        // 000086/000087.
        deadMercs,
        map: map ? { width: map.width, height: map.height, fromPng: map.fromPng } : null,
        npcs: NPCS.map((n) => n.id),
        sprites: spriteLoader
          ? { ready: spriteLoader.readyCount(), total: spriteLoader.totalCount() }
          : null,
        keys: Array.from(keys),
        controls: controlsScheme, // 'touch' | 'keyboard' (задача 000018)
      };
    },
    // Стартовое окно (000138): объект src/start-window.js
    // (createStartWindow) — { root, dom, isActive, hide } — или
    // null (модуль не загружен). Точка e2e/смоук-тестов.
    startWindow,
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
    // Состояние городов (задача 000109): якорь 'cx,cy' →
    // { lastVisitDay, stock, built? }. built — 000148.03: постройки
    // игрока (ANCHOR-записи, В-ПАМЯТИ; персистентность — 000148.05).
    // Поверхностная копия записей — значения LIVE-объекты (контракт
    // 000107: мутация стока попадает в cityStates → в сейв).
    get cities() {
      const out = {};
      for (const [k, v] of cityStates) out[k] = v;
      return out;
    },
    // Барахолка лагеря (задача 000095): 'x,y' → { day, stock, seed }.
    // ГЛУБОКАЯ копия (stock-объекты общие с wrap-перами).
    get campStocks() {
      return JSON.parse(JSON.stringify(campStocks));
    },
    // Природный лут (задача 000158.04): 'x,y' → день сбора.
    // Поверхностная копия объекта (паттерн getter cities);
    // мутации копии не попадают в состояние.
    get collectedLoot() {
      const out = {};
      for (const [k, v] of collectedLoot) out[k] = v;
      return out;
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
        // 000153.01: текущая глубина (целое ≥ 1). null — город/
        // вне локации (паттерн type → null).
        depth: ds.kind === 'dungeon' ? ds.dg.depth : null,
        name: ds.kind === 'city' ? ds.name : G.DUNGEON_NAMES[ds.dg.type],
        width: ds.dg.width, height: ds.dg.height,
        cells: ds.dg.cells,
        entrance: { x: ds.dg.entrance.x, y: ds.dg.entrance.y },
        x: ds.x, y: ds.y,
        // 000177: prevX/prevY — проекция для контракта спавна
        // (спавн = единый тайл: x/y/prevX/prevY/мувер на нём).
        prevX: ds.prevX, prevY: ds.prevY,
        exit: { x: ds.dg.exit.x, y: ds.dg.exit.y },
        // 000153.03 (D9): клетка stairs-down (поле формы 000153.02)
        // — навигация e2e/отладка. null — город/поля нет (fail-open,
        // паттерн type/depth → null). КОПИЯ (не ссылка на layout).
        stairsDown: ds.kind === 'dungeon' && ds.dg.stairsDown
          ? { x: ds.dg.stairsDown.x, y: ds.dg.stairsDown.y }
          : null,
        mobs: ds.contents
          ? ds.contents.mobs.filter((m) => !m.defeated)
            .map((m) => ({ x: m.x, y: m.y }))
          : null,
        chests: ds.contents
          ? ds.contents.chests.filter((c) => !c.opened).length : null,
        // 000157.03: live-содержимое этажа (состояние залежей —
        // gathered, 000157.02; тесты/отладка, паттерн mobs/chests).
        // null — город (contents у города null).
        contents: ds.kind === 'dungeon' ? ds.contents : null,
        // Задача 000107: содержимое города в рантайме (тесты/отладка;
        // хендофф 000109). null — подземелье и город без генерации.
        buildings: ds.cityContents
          ? ds.cityContents.buildings : null,
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
      // Тело — в wiring-секции (startCombatAt, задача 000128): одна
      // точка истины, семантика без изменений.
      startCombat: startCombatAt,
      // Открыть диалог NPC текущего тайла (задача 000010, смоук-тесты).
      // Делегация building-actions.js (задача 000128): тело openNpcDialog
      // 1:1 (дедуп — во main.js [E]-подобного пути больше нет).
      openNpc: () => {
        if (!G.npcUI || !map || !G.buildingActions) return false;
        if (G.npcUI.isActive()) return true;
        const t = map.tileAt(player.x, player.y);
        if (!t.hasBuilding) return false;
        const b = G.buildingActions.buildingRecForTile(t); // 000076: подтип слота 8..12
        const npc = b && G.npcForBuilding(NPCS, b.id);
        if (!npc) return false;
        G.buildingActions.openNpcDialog(npc, t);
        return G.npcUI.isActive();
      },
      // Подземелье из текущего тайла (не требует входа в пещеру).
      enterDungeon: (terrain) => {
        if (dungeonState || !G.locations) return null;
        // Тот же хелпер, что maybeEnterDungeon (000068): одна форма
        // состояния (000127: домен — src/locations.js).
        const ds = G.locations.debugEnterDungeon(
          { map, mapPixels, player, hero, intervalMs: moveIntervalBase() },
          terrain);
        if (!ds) return null;
        dungeonState = ds;
        // 000177: [E]-контракт тот же, что в игре (locationOnInteract).
        startLocationUI(dungeonOnMove, locationOnInteract);
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

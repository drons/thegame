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
  G.playerUI && G.playerUI.setCharacter(hero);
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
  const deadMercs = []; // [npcId] погибших — гибель 000087, сейв 000085
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
  // Конец боя (все 3 боевые точки, D2/D3/D9):
  //   * victory + res.allyXp (combat.js 000082) — applyCombatXp в
  //     записи (xp/уровни; while — несколько уровней за бой);
  //   * ЛЮБОЙ исход — гибель из ЖИВОГО объекта боя (combat.units:
  //     side 'ally', kind 'merc', !alive) → deadMercs (окончательно,
  //     dedup) + splice записи. Эфир (kind 'efir') — НИКОГДА не
  //     попадает в deadMercs (SPEC: не умирает навсегда).
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
    if (combat && Array.isArray(combat.units)) {
      for (const u of combat.units) {
        if (u.side === 'ally' && u.kind === 'merc' && !u.alive) {
          if (deadMercs.indexOf(u.id) === -1) deadMercs.push(u.id);
          const i = roster.findIndex((e) => e && e.npcId === u.id);
          if (i !== -1) roster.splice(i, 1);
          deadLines.push(npcName(u.id) + ' погиб в бою.');
        }
      }
    }
    return xpLines.concat(deadLines);
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
      // Задача 000085: отряд наёмников (записи ровно 5 полей, 000079),
      // Эфир (5 полей, 000111) и погибшие наёмники. Неломкое расширение
      // v1 (000031): версию НЕ поднимаем, миграций нет — СТАРЫЙ сейв
      // без этих полей восстанавливается restoreFromSave с пустым
      // отрядом и Эфиром L1 (ЗАФИКСИРОВАНО ТЗ).
      companions: (G.companions &&
        typeof G.companions.serializeRoster === 'function')
        ? G.companions.serializeRoster(roster) : [],
      efir: (G.efir && typeof G.efir.serializeEfir === 'function')
        ? G.efir.serializeEfir(efir) : null,
      dead_mercs: deadMercs.slice(),
      // Задача 000109: состояние городов (сток лавок, день последнего
      // визита). Пишется ВСЕГДА (пусто — {}); неломкое расширение v1
      // (000031): версию НЕ поднимаем, миграций нет. ОБРЕЗКА истёкших
      // записей — внутри serializeCityStates (мир БЕСКОНЕЧЕН — без
      // неё раздел раздует localStorage до квоты).
      cities: (G.Cities && G.Cities.serializeCityStates)
        ? G.Cities.serializeCityStates(cityStates, clock.day,
            cityRespawnDays())
        : {},
      // Задача 000095: барахолка лагеря — стоки стойок 'x,y' →
      // { day, stock } (seed НЕ сериализуется — перегенерируется
      // из x,y,day при восстановлении). Неломкое расширение v1
      // (000031): версию НЕ поднимаем, миграций нет.
      campStocks: G.serializeCampStocks
        ? G.serializeCampStocks(campStocks) : {},
    };
  }

  // false-возврат save() (квота localStorage, save.js) — сообщение
  // ОДИН раз за сессию (saveNow — на каждом мировом шаге: спам
  // недопустим); падений/confirm НЕТ (confirm — только
  // migration_failed/corrupt при загрузке).
  let saveWarned = false;
  function saveNow() {
    if (!saveStorage || !G.save) return;
    if (G.save(saveStorage, collectSaveData()) === false
        && !saveWarned) {
      saveWarned = true;
      console.warn('Сейв: квота localStorage исчерпана — сохранение ' +
        'не записано (повторные предупреждения подавлены).');
    }
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

    // --- Отряд наёмников (companions) (задача 000085) ---
    // Записи {npcId, level, xp, loyalty, hiredDay}. Валидация —
    // G.companions.deserializeRoster («призрак» 000029: призрак/дубли/
    // битые числа → dropped; тихая — warn печатает здесь). Старому
    // сейву раздела НЕТ → ПУСТОЙ отряд (ЗАФИКСИРОВАНО ТЗ, warn НЕТ).
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

    // --- Погибшие наёмники (dead_mercs) (задача 000085) ---
    // Плоский массив npcId — только merc (каталог + объект «найм» —
    // критерий npcForEntry, СТРОЖЕ чистого членства: self-cleaning
    // при правках каталога/демотации merc; консистентно с roster).
    // Битый раздел/призрак/дубли — отброс + warn (000029, паттерн
    // restoreNpcStocks). Старому сейву раздела нет → [].
    try {
      const rawD = d.dead_mercs;
      if (rawD != null) {
        if (!Array.isArray(rawD)) {
          console.warn('Сейв: раздел dead_mercs некорректен — сбрасываю.');
          deadMercs.length = 0;
        } else {
          const kept = [];
          const bad = [];
          for (const id of rawD) {
            if (typeof id !== 'string') continue; // тихий skip
            const npc = NPCS.find((n) => n && n.id === id &&
              n.найм && typeof n.найм === 'object');
            if (!npc || kept.includes(id)) { bad.push(id); continue; }
            kept.push(id);
          }
          deadMercs.length = 0;
          for (const id of kept) deadMercs.push(id);
          if (bad.length) {
            console.warn('Сейв: dead_mercs — неизвестные/дубли npcId: ' +
              bad.join(', '));
          }
        }
      }
    } catch (err) {
      console.warn('Сейв: не удалось восстановить dead_mercs:', err);
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
    // Задача 000087: жалованье отряда (000079) — МЕЖДУ buff-cleanup и
    // render, ДО saveNow (D1/D8): payWages мутирует hero.gold/roster in
    // place — существующий saveNow в конце фиксирует итог. day — НОВЫЙ
    // день (аргумент колбэка): сид ухода (day, npcId) детерминирован.
    // Пустой отряд: total = 0 → events: [] (контракт ядра) →
    // compLines пусто → flash БАЙТ-В-БАЙТ как до 000087 (тест V3).
    // «Уход» — splice ВНУТРИ payWages (000079); main.js строит только
    // строки.
    let compLines = [];
    if (hasCompanions && typeof G.companions.payWages === 'function') {
      const wr = G.companions.payWages(roster, NPCS, hero, day);
      if (wr && Array.isArray(wr.events)) {
        for (const ev of wr.events) {
          if (ev.type === 'wages_paid') {
            compLines.push('Жалованье выплачено.');
          } else if (ev.type === 'wages_unpaid') {
            compLines.push('Не хватает денег на жалованье — лояльность падает.');
          } else if (ev.type === 'left') {
            compLines.push(npcName(ev.npcId) + ' покинул отряд.');
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
    // Порядок строк (D1): «Мобилизуются…» → строки отряда → «День N.»
    // (день — ПОСЛЕДНЯЯ строка, как до 000087).
    hudFlash = (due.length ? 'Мобилизуются новые группы мобов.\n' : '')
      + (compLines.length ? compLines.join('\n') + '\n' : '')
      + 'День ' + day + '.';
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
    const combat = G.combatUI.startCombat({
      hero,
      // Эфир (задача 000081): постоянный союзник — ВСЕГДА, включая
      // отладочный бой (тоже боевой, с xp).
      efir,
      // Задача 000087: отряд — данные makeAlly (000082), ПОСЛЕ Эфира
      // (companionAllies: снимок на старте боя, D5).
      rosterData: companionAllies(),
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
      shopFor, // (npc, t) → { npc, stock } | null
      campShopFor, // (x, y, tile) → wrap | null (000095: сток
      // барахолки по тайлу лагеря; респаун по clock.day)
      collectSaveData, // () → снимок сейва (чистая)
      saveNow, // () → запись в localStorage
      flash,
      buildingOncePerDay, // live Map 'x,y:effectId' → день (000072)
      buffs, // live Array (000072/000076)
      teleports, // live Map 'x,y' → { pair, dest, active } (000075)
      buildingQuests, // live Map 'x,y' → { questId, day, status } (000074)
      roster, // live Array (000083/000085): отряд — npcUI.open
      deadMercs, // live Array [npcId] (000083/000085)
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

  // HUD (задача 000129): строки — src/hud.js (Game.hud). Модуль
  // обязан грузиться ДО main.js (UMD-ловушка 000038: снапшот const G
  // снят вверху) — иначе G.hud — undefined всегда и строки HUD молча
  // исчезают; ошибка видна ОДИН раз при загрузке.
  if (!G.hud) {
    console.error('main.js: Game.hud отсутствует — src/hud.js ' +
      'обязан грузиться ДО src/main.js (000129)');
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
    if (e.code === 'KeyE' && G.npcUI) { // E (У) — диалог NPC
      // Задача 000107: в городе реальный путь [E] — dungeon-ui →
      // cityOnInteract → buildingActions.interactCity (dungeon-ui
      // регистрируется ДО main.js — срабатывает первым); здесь гард
      // toggle() dungeonUI.isActive гасит дубль. В мире/подземелье —
      // обычный toggle() (подземелье — гард, no-op).
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
      // [E] по экранам (000121): бой → quickItem (KeyE — та же ветка,
      // что клавиша), подземелье → no-op, карта → как 000123.
      onInteract: () => {
        const screen = G.routeTouchScreen(touchScreens());
        if (screen === 'combat') {
          const code = G.touchKeyCode('interact'); // 'KeyE'
          if (code && G.combatUI) G.combatUI.handleCode(code);
        } else if (screen === 'dungeon') {
          // В подземелье действий нет — no-op (кнопка не скрывается).
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
    // 000086: панель «Отряд» — закрыть (тот же стек, паттерн 000096).
    if (G.squadUI && G.squadUI.isOpen()) G.squadUI.toggle(false);
    // Оверлей действий постройки (000071) под боевым оверлеем —
    // закрываем (тот же стек, паттерн 000096).
    if (G.buildingUI && G.buildingUI.isActive()) G.buildingUI.close();
    if (G.craftUI && G.craftUI.isActive()) G.craftUI.close(); // 000126
    const t = map.tileAt(player.x, player.y);
    if (!t.hasMobGroup) return;
    const key = player.x + ',' + player.y;
    if (defeatedAt.has(key)) return;
    // Задача 000087: `const combat` — onEnd читает ЖИВОЙ объект боя
    // ПОЗЖЕ (гибель — по combat.units, D2); guard isActive — выше.
    const combat = G.combatUI.startCombat({
      hero,
      // Эфир (задача 000081): постоянный союзник — ВСЕГДА.
      efir,
      // Задача 000087: отряд — данные makeAlly (000082), ПОСЛЕ Эфира.
      rosterData: companionAllies(),
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
      memory: dungeonMemory, intervalMs: moveIntervalBase() };
    const ds = L.maybeEnterDungeon(ctx) || L.maybeEnterCity(ctx);
    if (ds) {
      dungeonState = ds;
      // Задача 000109: вход в город — состояние (сток/lastVisitDay)
      // до UI (контент перегенерация + сток из сейва при в-окне).
      if (ds.kind === 'city') prepareCityState(ds);
      // Задача 000107: onInteract — ТОЛЬКО для города ([E] — путь
      // buildingUI); в подземелье undefined → ветка KeyE dungeon-ui
      // мёртвая (000121: [E] в подземелье — no-op).
      startLocationUI(
        ds.kind === 'city' ? cityOnMove : dungeonOnMove,
        ds.kind === 'city' ? cityOnInteract : undefined);
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
    let contents = null;
    try {
      contents = C.generateCityContents(ds.dg, ax, ay, rec,
        t.buildingWealth);
    } catch (err) {
      console.error('main.js: generateCityContents — ' + err +
        ' (000109) — сток не восстанавливается');
      return;
    }
    const saved = cityStates.get(anchorKey);
    const fresh = !saved
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
    }
    cityStates.set(anchorKey, { lastVisitDay: clock.day, stock });
  }
  function startLocationUI(onMove, onInteract) {
    G.dungeonUI.start({
      get state() { return dungeonState; },
      onMove,
      onInteract, // 000107: город — [E] → cityOnInteract (undefined — мёртвая ветка)
      // ОДИН общий zoom (задача 000066): колесо поверх оверлея меняет
      // тот же zoom, что мир (мировой слушатель на #game накрыт) —
      // renderHud/Game.hud («Масштаб: Xpx») остаётся корректным
      // без изменений.
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
    // Задача 000107: открытые оверлеи (buildingUI/npcUI) — движение
    // заблокировано (паритет с миром: гейты keydown main.js). Оба
    // канала: keyboard (dungeon-ui → ctx.onMove) и touch D-pad
    // (touchMove → onMove).
    if ((G.buildingUI && G.buildingUI.isActive()) ||
        (G.npcUI && G.npcUI.isActive())) return;
    const ev = G.locations.cityMove(ds, dx, dy, performance.now(),
      { inCombat: !!(G.combatUI && G.combatUI.isActive()) });
    if (!ev || ev.type !== 'exit') return;
    exitLocation(ds);
    hudFlash = 'Вы вышли из ' + ev.name + '.';
    hudFlashUntil = performance.now() + 5000;
  }
  // Задача 000107: [E] в городе — ЕДИНЫЙ путь buildingUI (000071) →
  // «Диалог» → npcUI (обход запрещён — в building-actions.interactCity).
  // Вызывается dungeon-ui по KeyE (onInteract — только для города).
  function cityOnInteract() {
    if (G.buildingActions) G.buildingActions.interactCity();
  }
  // Задача 000107 (D4): ЕДИНСТВЕННЫЙ решатель shop-формата {npc,
  // stock} для npcUI (deps.shopFor building-actions). Город (000108):
  // сток — ds.cityShops по (город, клетка) — 6-полевой makeCityShop,
  // подаём только .stock; ТОЛЬКО у NPC с торговля (иначе null —
  // иначе TypeError в ui.js renderTradeTab: у Берты таверны 44
  // записи в cityShops ЕСТЬ, а торговля НЕТ). Мир — как было
  // (npcShopFor, 000029) — КЛЮЧЕВОЙ путь не тронут.
  function shopFor(npc, t) {
    const ds = dungeonState;
    if (ds && ds.kind === 'city' && ds.cityShops && t) {
      const s = ds.cityShops[t.x + ',' + t.y];
      if (!s) return null;
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
    const combat = G.combatUI.startCombat({
      hero,
      // Эфир (задача 000081): постоянный союзник — ВСЕГДА.
      efir,
      // Задача 000087: отряд — данные makeAlly (000082), ПОСЛЕ Эфира.
      rosterData: companionAllies(),
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
      // Спрайт: слотовая ветка — первична (побайтово как раньше).
      // Город (задача 000110) — НЕ слот: у него type = NONE
      // (buildingSprite → null), спрайт — по каталожному buildingId
      // (CITY_SPRITES, канал 000103). Лагерь (задача 000131) — тоже
      // НЕ слот (type = NONE, buildingId 47, канал 000131): городская
      // ветка его не наденет (citySprite(47) → null, таблица 51..54),
      // спрайт — CAMP_SPRITES. typeof-гард: старый sprites.js без
      // citySprite/campSprite — город/лагерь не рисуются (тихая
      // деградация, игра не падает); слотовые якоря 8..12 в
      // деградации городским/лагерным спрайтом не наденут
      // (citySprite/campSprite(подтип) → null).
      const asset = G.buildingSprite(rec.type) ||
        (rec.buildingId != null && typeof G.citySprite === 'function'
         ? G.citySprite(rec.buildingId) : null) ||
        (rec.buildingId != null && typeof G.campSprite === 'function'
         ? G.campSprite(rec.buildingId) : null);
      const img = spriteLoader.image(asset);
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
      dungeonState, defeatedAt, npcs: NPCS,
      flash: hudFlash, flashUntil: hudFlashUntil,
      exploredCount,
      campShopFor, // ОПЦИОНАЛЬНОЕ поле ctx (000095): лагерь
    });
  }

  // --- Цикл ---
  let lastMove = 0;
  function frame(now) {
    const inCombat = G.combatUI && G.combatUI.isActive();
    const inDungeon = dungeonState !== null;
    const inNpc = G.npcUI && G.npcUI.isActive();
    const inBuilding = G.buildingUI && G.buildingUI.isActive(); // 000071
    const inCraft = G.craftUI && G.craftUI.isActive(); // 000126
    // Интервал шага (задача 000033 + 000063): база — из глобальных
    // настроек (420 мс), навык «Ловкий шаг» укорачивает, нижний кламп —
    // G.MIN_MOVE_INTERVAL_MS. Одно значение для шага и окна walk/idle.
    const stepMs = stepIntervalMs();
    if (!inCombat && !inDungeon && !inNpc && !inBuilding && !inCraft
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

    renderHud();
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
          // Крафт (задача 000046): опциональные поля — restoreFromSave
          // всегда задаёт дефолты ({} / {} / {weapon:null,armor:null}),
          // поэтому здесь просто значения героя.
          craft: hero.craft,
          craftXp: hero.craftXp,
          equipmentBonus: hero.equipmentBonus,
        },
        // Эфир (задача 000081): live-объект
        // {level, xp, skillXp, skills, spells} (5 полей, 000111;
        // сейв — 000085; или null, если модуль не загрузился) —
        // точка для 000086/000116.
        efir: efir || null,
        // Отряд (000079; сейв — 000085): live-массив записей
        // {npcId, level, xp, loyalty, hiredDay} — точка smoke-теста
        // для 000086/000087 (читать, не менять — 000079).
        roster,
        // Погибшие наёмники (000085): live-массив npcId — точка
        // smoke-теста для 000086/000087.
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
    // { lastVisitDay, stock }. Поверхностная копия записей —
    // значения LIVE-объекты (контракт 000107: мутация стока
    // попадает в cityStates → в сейв).
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

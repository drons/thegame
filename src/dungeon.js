// Подземелья/лабиринты (SPEC.md, разделы «Карта мира», «Мобы», «Постройки»).
//
// Форму лабиринта определяет ТОЛЬКО точка входа: координаты на основной
// карте, значения шумов Перлина и пиксель assets/map.png в этой точке
// (одинаковый вход всегда даёт одинаковый лабиринт).
// Содержимое (мобы, сундуки, лут) сидируется опытом персонажа
// (totalXp) — при повторном входе с новым опытом генерация иная.
// Содержимое живёт: пока персонаж внутри + dungeon_memory_days дней.
//
// Чистое ядро без DOM — тестируется в node (tests/dungeon.test.js).
// Униформный модуль: в браузере — globalThis.Game, в node — require().
// Зависимости: perlin.js, map.js, global-settings.js
// (dungeon_memory_days, level_delta_max), dungeons-data.js (каталог
// assets/dungeons — source of truth таблиц, задача 000058; без data-модуля
// гард деградирует до fallback-литералов, см. ниже).

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./perlin.js'), require('./map.js'),
      require('./global-settings.js'), require('./dungeons-data.js'));
  } else {
    root.Game = Object.assign({}, root.Game,
      factory(typeof root.Game === 'object' ? root.Game : {}, root.Game,
        root.Game && root.Game.GlobalSettings,
        root.Game && root.Game.DungeonsData));
  }
})(typeof globalThis !== 'undefined' ? globalThis : self,
  function (perlin, mapmod, settings, dungeonsData) {

  const mulberry32 = perlin.mulberry32;
  const hash2 = perlin.hash2;
  const createPerlin2D = perlin.createPerlin2D;
  const GLOBAL_SEED = mapmod.GLOBAL_SEED;
  const TERRAIN = mapmod.TERRAIN;

  const CELL_WALL = 0;
  const CELL_FLOOR = 1;

  // Типы подземелий (SPEC.md, «Входы в пещеры»). Перенумерации НЕТ:
  // фон боя assets/combat/bg выбирается по этим числам (задача 000049).
  const DUNGEON_TYPES = {
    CAVE: 0, CRYPT: 1, RUINS: 2, DROWNED: 3, ABYSS: 4,
  };

  // --- Таблицы по типу подземелья: каталог assets/dungeons ---
  //
  // Source of truth — JSON-файлы assets/dungeons/0000*.json (схема —
  // assets/dungeons/schema.json, задача 000058). В node — require
  // './dungeons-data.js', в браузере — Game.DungeonsData
  // (src/dungeons-data.js подключён в index.html ДО dungeon.js).
  // Без data-модуля (vm-песочница tests/dungeon-ui.test.js его НЕ
  // грузит) гард деградирует до FALLBACK-литералов 1:1 с каталогом
  // (прецедент FALLBACK_BUILDING_COUNT в map.js, задача 000055):
  // генерация не «умирает», а равенство fallback ≡ каталогу закреплено
  // тестом (tests/dungeon.test.js).
  const FALLBACK_DUNGEONS = [
    {
      id: DUNGEON_TYPES.CAVE,
      название: 'простая пещера',
      мобы: ['skeleton', 'ant', 'crawling_bones', 'giant_larva'],
      предметы: ['iron_sword', 'healing_potion', 'sulfur',
        'stone_fist_grimoire', 'frost_bolt_scroll'],
      размер: 25,
      постройка: 31,
      предметы_стен: ['rock', 'stalactite'],
    },
    {
      id: DUNGEON_TYPES.CRYPT,
      название: 'склеп',
      мобы: ['skeleton', 'skeleton_archer', 'rot', 'vampire', 'bone_coloss'],
      предметы: ['alchemy_manual', 'chainmail', 'mana_potion',
        'meditation_scroll', 'chill_scroll', 'light_heal_scroll'],
      размер: 27,
      постройка: 32,
      предметы_стен: ['column', 'rock'],
    },
    {
      id: DUNGEON_TYPES.RUINS,
      название: 'руины замка',
      мобы: ['orc_warrior', 'orc_archer', 'wolf', 'troll', 'skeleton'],
      предметы: ['steel_sword', 'knight_plate', 'war_hammer',
        'iron_hide_tome', 'fireball_scroll', 'vine_scroll'],
      размер: 31,
      постройка: 33,
      предметы_стен: ['column'],
    },
    {
      id: DUNGEON_TYPES.DROWNED,
      название: 'затопленная пещера',
      мобы: ['water_elemental', 'scorpion', 'spider', 'imp'],
      предметы: ['mana_elixir', 'hunting_bow', 'moonstone',
        'nature_scroll', 'magic_shield_scroll'],
      размер: 27,
      постройка: 34,
      предметы_стен: ['rock'],
    },
    {
      id: DUNGEON_TYPES.ABYSS,
      название: 'бездна',
      мобы: ['lower_demon', 'succubus', 'abomination'],
      предметы: ['war_hammer', 'phoenix_feather', 'greater_healing',
        'heavy_tome', 'fire_spellbook', 'flame_burst_scroll',
        'blizzard_scroll'],
      размер: 35,
      постройка: 35,
      предметы_стен: ['stalactite', 'rock'],
    },
  ];

  /** Каталог валиден: 5 записей, id 0..4, строки/списки/целые на месте. */
  function validDungeonCatalog(d) {
    if (!d || !Array.isArray(d.DUNGEONS) || d.DUNGEONS.length !== 5) {
      return false;
    }
    return d.DUNGEONS.every((r) =>
      r && Number.isInteger(r.id) && r.id >= 0 && r.id <= 4 &&
      typeof r.название === 'string' && r.название.length > 0 &&
      Array.isArray(r.мобы) && r.мобы.length > 0 &&
      Array.isArray(r.предметы) && r.предметы.length > 0 &&
      Number.isInteger(r.размер) && r.размер > 0 &&
      Number.isInteger(r.постройка) &&
      // Строки — по enum в схеме (tests/assets-schemas.test.js).
      Array.isArray(r.предметы_стен) && r.предметы_стен.length > 0);
  }

  const CATALOG = validDungeonCatalog(dungeonsData)
    ? dungeonsData.DUNGEONS
    : FALLBACK_DUNGEONS;
  if (dungeonsData !== undefined && !validDungeonCatalog(dungeonsData)) {
    console.warn(
      'dungeon.js: Game.DungeonsData повреждена — использую fallback-' +
      'таблицы (source of truth: assets/dungeons)');
  }

  // DUNGEON_NAMES — кодовый регистр (строчный): строки HUD/логов.
  // Предметы — id из каталога assets/items (фолбэк — src/items-data.js,
  // ядро — src/items.js); постройка — id пещеры 31..35 из
  // assets/buildings (связь «подземелье ↔ вход в мире», однонаправленная).
  const DUNGEON_NAMES = {};
  const DUNGEON_MOBS = {};
  const DUNGEON_ITEMS = {};
  const DUNGEON_SIZE = {};
  // DUNGEON_WALL_KINDS — набор видов «непроходимых» предметов стен
  // типа (задача 000070): rock/column/stalactite, назначение на
  // клетки — wallObjFor (сид ФОРМЫ, не содержимое).
  const DUNGEON_WALL_KINDS = {};
  for (const rec of CATALOG) {
    DUNGEON_NAMES[rec.id] = rec.название;
    DUNGEON_MOBS[rec.id] = rec.мобы.slice();
    DUNGEON_ITEMS[rec.id] = rec.предметы.slice();
    DUNGEON_SIZE[rec.id] = rec.размер;
    DUNGEON_WALL_KINDS[rec.id] = rec.предметы_стен.slice();
  }

  if (!settings || typeof settings.SETTINGS !== 'object') {
    throw new Error(
      'dungeon.js: не найдены глобальные настройки — загрузите global-settings.js до dungeon.js');
  }

  // Глобальные настройки (src/global-settings.js, SPEC.md).
  const DUNGEON_MEMORY_DAYS = settings.SETTINGS.dungeon_memory_days;
  const LEVEL_DELTA_MAX = settings.SETTINGS.level_delta_max; // моб = персонаж ± N
  const CHEST_ITEM_CHANCE = 0.4;

  // 000099: live-чтение в момент вызова (паттерн 000020; см. day.js):
  // guard — границы META 000098 (dungeon_memory_days min 1;
  // level_delta_max min 0 — 0 ВАЛИДНО, «±0»), битое → DEFAULTS →
  // снапшот. Снапшоты выше — load-time API (экспорт-константы).
  // Ревью 000099: guard и на ЦЕЛИКОМ SETTINGS (null/undefined в
  // рантайме, devtools) — NaN не пройдёт guard значения → DEFAULTS.
  function liveLevelDeltaMax() {
    const s = settings.SETTINGS;
    const v = (s && typeof s === 'object') ? s.level_delta_max : NaN;
    return (typeof v === 'number' && Number.isFinite(v) && v >= 0)
      ? v : (settings.DEFAULTS ? settings.DEFAULTS.level_delta_max
        : LEVEL_DELTA_MAX);
  }
  function liveMemoryDays() {
    const s = settings.SETTINGS;
    const v = (s && typeof s === 'object') ? s.dungeon_memory_days : NaN;
    return (typeof v === 'number' && Number.isFinite(v) && v >= 1)
      ? v : (settings.DEFAULTS ? settings.DEFAULTS.dungeon_memory_days
        : DUNGEON_MEMORY_DAYS);
  }

  // Тип подземелья из тайла входа (SPEC.md: «тип — из типа тайла входа»).
  // «Бездна» — редкая: холмистый/горный вход с тёмным альфа-каналом
  // пикселя (тёмный A = редкие фичи).
  function dungeonTypeFor(terrain, pixelAlpha) {
    switch (terrain) {
      case TERRAIN.SWAMP: return DUNGEON_TYPES.DROWNED;
      case TERRAIN.FOREST: return DUNGEON_TYPES.CRYPT;
      case TERRAIN.HILL:
      case TERRAIN.MOUNTAIN:
        return pixelAlpha < 64 ? DUNGEON_TYPES.ABYSS : DUNGEON_TYPES.RUINS;
      default: return DUNGEON_TYPES.CAVE; // песок, трава
    }
  }

  function pixelAt(pixels, x, y) {
    const W = pixels.width, H = pixels.height;
    const ix = ((x % W) + W) % W;
    const iy = ((y % H) + H) % H;
    const o = (iy * W + ix) * 4;
    return [pixels.data[o], pixels.data[o + 1], pixels.data[o + 2], pixels.data[o + 3]];
  }

  /** Сид формы: координаты + шум Перлина в точке входа + пиксель map.png. */
  function dungeonShapeSeed(x, y, pixels) {
    const [r, g, b, a] = pixelAt(pixels, x, y);
    const elevation = createPerlin2D(GLOBAL_SEED);
    const n = elevation.noise2(x * 0.137 + 11.3, y * 0.211 + 7.7);
    return (hash2(x, y, 0xd0d6b5e5)
      ^ Math.abs(Math.round(n * 1e6))
      ^ (r + (g << 8) + (b << 16) + (a << 24))) >>> 0;
  }

  const idx = (d, x, y) => y * d.width + x;
  const inGrid = (d, x, y) => x >= 0 && y >= 0 && x < d.width && y < d.height;

  // --- Предметы стен (задача 000070) ---
  //
  // «Непроходимые» предметы стен (камни/колонны/сталактиты) рисуются
  // только на «фасаде» стен — wall-клетках с floor-соседом. Вид и
  // вариант (_1/_2) — детерминированная функция ТОЛЬКО (x, y, d.seed,
  // d.type) через hash2: без RNG-состояния, без обращения к
  // cells/содержимому/player. Сид — ФОРМЫ подземелья (точка входа),
  // НЕ содержимого (totalXp): «один вход — один вид», возврат с новым
  // опытом не меняет облик стен. Соли зафиксированы golden-тестом
  // (tests/dungeon.test.js, «000070 golden: CAVE (37, −12)»).
  const WALL_KIND_SALT = 0x5e11c3a7;
  const WALL_VARIANT_SALT = 0x0c9f4b2d;

  /**
   * Предмет стены в клетке (x, y) — чистая функция от (x, y, d.seed,
   * d.type). d — объект с полями seed и type (достаточно
   * `{type, seed}`; cells/содержимое не читаются).
   * @param {number} x клетка X
   * @param {number} y клетка Y
   * @param {{seed:number, type:number}} d подземелье
   * @returns {string|null} 'rock_1'|'rock_2'|'column_1'|'column_2'|
   *   'stalactite_1'|'stalactite_2' (null, если у типа нет набора)
   */
  function wallObjFor(x, y, d) {
    const kinds = DUNGEON_WALL_KINDS[d.type];
    if (!kinds || kinds.length === 0) return null;
    const kind = kinds[hash2(x, y, WALL_KIND_SALT ^ d.seed) % kinds.length];
    const variant = (hash2(x, y, WALL_VARIANT_SALT ^ d.seed) & 1) + 1;
    return kind + '_' + variant;
  }

  /**
   * Генерирует лабиринт по точке входа.
   * @param {number} x координата входа на основной карте
   * @param {number} y координата входа
   * @param {{width:number, height:number, data:ArrayBuffer|Uint8Array}} pixels
   *   пиксели assets/map.png (та же затравка, что и у карты мира)
   * @param {number} terrain тип местности тайла входа (TERRAIN из map.js)
   * @returns {{
   *   type:number, width:number, height:number,
   *   cells:number[], rooms:{x,y,w,h,cx,cy}[],
   *   entrance:{x,y}, exit:{x,y}, seed:number,
   *   wallObjs:{x:number, y:number, obj:string}[],
   * }}
   * `wallObjs` (задача 000070) — предметы стен ТОЛЬКО на wall-клетках
   * «фасада» (у стены есть floor-сосед по 8-соседству Чебышёва 1):
   * ровно один {x, y, obj} на клетку, obj — 'rock_1'|…|'stalactite_2'
   * из набора типа (wallObjFor); floor/entrance/exit — без объектов.
   */
  function createDungeon(x, y, pixels, terrain) {
    const type = dungeonTypeFor(terrain, pixelAt(pixels, x, y)[3]);
    const seed = dungeonShapeSeed(x, y, pixels);
    const rng = mulberry32(seed);

    const W = DUNGEON_SIZE[type];
    const H = W;
    const cells = new Array(W * H).fill(CELL_WALL);
    const carve = (cx, cy) => { if (inGrid({ width: W, height: H }, cx, cy)) cells[idx({ width: W, height: H }, cx, cy)] = CELL_FLOOR; };

    // Комнаты: 5-8, размер 4-9 клеток.
    const nRooms = 5 + Math.floor(rng() * 4);
    const rooms = [];
    for (let i = 0; i < nRooms; i++) {
      const w = 4 + Math.floor(rng() * 6);
      const h = 4 + Math.floor(rng() * 6);
      const rx = 2 + Math.floor(rng() * (W - w - 4));
      const ry = 2 + Math.floor(rng() * (H - h - 4));
      for (let cy = ry; cy < ry + h; cy++) {
        for (let cx = rx; cx < rx + w; cx++) carve(cx, cy);
      }
      rooms.push({ x: rx, y: ry, w, h, cx: rx + (w >> 1), cy: ry + (h >> 1) });
    }

    // Коридоры: соединяем центры соседних комнат L-образно (цепочка —
    // все комнаты гарантированно достижимы от входа).
    for (let i = 0; i + 1 < rooms.length; i++) {
      const A = rooms[i], B = rooms[i + 1];
      const horizFirst = rng() < 0.5;
      if (horizFirst) {
        for (let cx = Math.min(A.cx, B.cx); cx <= Math.max(A.cx, B.cx); cx++) carve(cx, A.cy);
        for (let cy = Math.min(A.cy, B.cy); cy <= Math.max(A.cy, B.cy); cy++) carve(B.cx, cy);
      } else {
        for (let cy = Math.min(A.cy, B.cy); cy <= Math.max(A.cy, B.cy); cy++) carve(A.cx, cy);
        for (let cx = Math.min(A.cx, B.cx); cx <= Math.max(A.cx, B.cx); cx++) carve(cx, B.cy);
      }
    }

    const d = {
      type,
      width: W,
      height: H,
      cells,
      rooms,
      entrance: { x: rooms[0].cx, y: rooms[0].cy },
      exit: { x: rooms[rooms.length - 1].cx, y: rooms[rooms.length - 1].cy },
      seed,
    };

    // Предметы стен (задача 000070): ТОЛЬКО wall-клетки «фасада» —
    // у стены есть хотя бы один floor-сосед по 8-соседству
    // Чебышёва 1 (не на всех стенах: сплошная стена не превращается
    // в густую стену камней). Стабильный обход: y, затем x.
    const wallObjs = [];
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (cells[y * W + x] !== CELL_WALL) continue;
        let hasFloor = false;
        for (let dy = -1; dy <= 1 && !hasFloor; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
            if (cells[ny * W + nx] === CELL_FLOOR) { hasFloor = true; break; }
          }
        }
        if (!hasFloor) continue;
        const obj = wallObjFor(x, y, d);
        if (obj) wallObjs.push({ x, y, obj });
      }
    }
    d.wallObjs = wallObjs;
    return d;
  }

  // --- Содержимое (сид = опыт персонажа) ---

  function floorCells(d, exclude) {
    const out = [];
    for (let y = 0; y < d.height; y++) {
      for (let x = 0; x < d.width; x++) {
        if (d.cells[idx(d, x, y)] !== CELL_FLOOR) continue;
        if (exclude && exclude.has(x + ',' + y)) continue;
        out.push([x, y]);
      }
    }
    return out;
  }

  /**
   * Генерирует содержимое подземелья.
   * @param {object} d результат createDungeon
   * @param {object} player персонаж (totalXp — сид, level — сложность)
   * @returns {{
   *   seed:number,
   *   mobs:{id:string, mobIds:string[], x:number, y:number, level:number, defeated:boolean}[],
   *   chests:{id:string, x:number, y:number, opened:boolean, gold:number, item:string|null}[],
   *   createdAtXp:number,
   * }}
   * `chests[].item` — id предмета из каталога assets/items (или null).
   */
  function generateDungeonContents(d, player) {
    const seed = (hash2(player.totalXp, d.seed, 0x5e11) ^ (player.totalXp * 2654435761)) >>> 0;
    const rng = mulberry32(seed);
    const table = DUNGEON_MOBS[d.type];
    const items = DUNGEON_ITEMS[d.type];
    // 000099: ОДНО live-чтение на генерацию (детерминизм: одна
    // значимость и для мобов, и для босса; порядок вызовов rng() не
    // меняется — замена константы на локальную переменную).
    const delta = liveLevelDeltaMax();

    // Входная комната остаётся безопасной; выход — тоже.
    const safe = new Set();
    for (const [cx, cy] of [[d.entrance.x, d.entrance.y], [d.exit.x, d.exit.y]]) {
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) safe.add((cx + dx) + ',' + (cy + dy));
    }
    const spots = floorCells(d, safe);

    const occupied = new Set();
    const takeSpot = () => {
      for (let i = 0; i < 200; i++) {
        const [x, y] = spots[Math.floor(rng() * spots.length)];
        const k = x + ',' + y;
        if (!occupied.has(k)) {
          occupied.add(k);
          return [x, y];
        }
      }
      return null;
    };
    const mobLevel = () => Math.max(1, player.level + Math.floor(rng() * (2 * delta + 1)) - delta);

    // Блуждающие группы: 3-6, по 1-3 моба (SPEC: «мобы подземелий — блуждающие»).
    const mobs = [];
    const nGroups = 3 + Math.floor(rng() * 4);
    for (let i = 0; i < nGroups; i++) {
      const s = takeSpot();
      if (!s) break;
      const nMobs = 1 + Math.floor(rng() * 3);
      const mobIds = [];
      for (let j = 0; j < nMobs; j++) mobIds.push(table[Math.floor(rng() * table.length)]);
      mobs.push({ id: 'g' + i, mobIds, x: s[0], y: s[1], level: mobLevel(), defeated: false });
    }

    // Бездна: босс в дальней комнате (SPEC: «Бездна — мобы бездны, босс»).
    if (d.type === DUNGEON_TYPES.ABYSS) {
      const far = d.rooms[d.rooms.length - 1];
      const s = [far.cx, far.cy];
      mobs.push({
        id: 'boss',
        mobIds: ['abomination', 'lower_demon', 'lower_demon'],
        x: s[0], y: s[1],
        level: Math.max(1, player.level + delta),
        defeated: false,
        boss: true,
      });
    }

    // Сундуки: 2-5, золото растёт с уровнем, шанс предмета.
    const chests = [];
    const nChests = 2 + Math.floor(rng() * 4);
    for (let i = 0; i < nChests; i++) {
      const s = takeSpot();
      if (!s) break;
      const gold = Math.round(10 + rng() * 20 * (1 + player.level * 0.2));
      const item = rng() < CHEST_ITEM_CHANCE ? items[Math.floor(rng() * items.length)] : null;
      chests.push({ id: 'c' + i, x: s[0], y: s[1], opened: false, gold, item });
    }

    return {
      seed,
      mobs,
      chests,
      createdAtXp: player.totalXp,
      step: 0,
    };
  }

  // --- Живучесть содержимого (SPEC: «дungeon_memory_days») ---

  /**
   * Действительно ли сохранённое содержимое.
   * @param {number} lastVisitDay день последнего визита
   * @param {number} currentDay текущий игровой день
   * @param {number} [memoryDays]
   */
  // 000099: default-параметр живёт — оценивается на ВЫЗОВЕ (live).
  function contentValid(lastVisitDay, currentDay, memoryDays = liveMemoryDays()) {
    return currentDay <= lastVisitDay + memoryDays;
  }

  // --- Открытие сундуков и блуждание мобов ---

  /** Открывает сундук (только один раз). @returns {{ok:boolean, gold?:number, item?:string|null, reason?:string}} */
  function openChest(contents, chestId) {
    const c = contents.chests.find((x) => x.id === chestId);
    if (!c) return { ok: false, reason: 'нет такого сундука' };
    if (c.opened) return { ok: false, reason: 'уже открыт' };
    c.opened = true;
    return { ok: true, gold: c.gold, item: c.item };
  }

  /**
   * Один шаг блуждания: каждая живая группа сдвигается на клетку.
   * Детерминированно: rng от номера шага и сида содержимого.
   */
  function wanderStep(contents, d) {
    contents.step = (contents.step || 0) + 1;
    const rng = mulberry32((hash2(contents.step, contents.seed, 0x7777)) >>> 0);
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const taken = new Set(
      contents.mobs.filter((m) => !m.defeated).map((m) => m.x + ',' + m.y));
    for (const m of contents.mobs) {
      if (m.defeated) continue;
      const [dx, dy] = dirs[Math.floor(rng() * 4)];
      const nx = m.x + dx, ny = m.y + dy;
      if (!inGrid(d, nx, ny)) continue;
      if (d.cells[idx(d, nx, ny)] !== CELL_FLOOR) continue;
      const k = nx + ',' + ny;
      if (taken.has(k)) continue;
      taken.delete(m.x + ',' + m.y);
      m.x = nx; m.y = ny;
      taken.add(k);
    }
    return contents;
  }

  // --- Для тестов и отрисовки ---

  /** BFS: все напольные клетки, достижимые от (sx, sy). @returns {Set<string>} */
  function reachableFrom(d, sx, sy) {
    const seen = new Set();
    if (d.cells[idx(d, sx, sy)] !== CELL_FLOOR) return seen;
    const queue = [[sx, sy]];
    seen.add(sx + ',' + sy);
    while (queue.length) {
      const [x, y] = queue.shift();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        const k = nx + ',' + ny;
        if (!inGrid(d, nx, ny) || seen.has(k)) continue;
        if (d.cells[idx(d, nx, ny)] !== CELL_FLOOR) continue;
        seen.add(k);
        queue.push([nx, ny]);
      }
    }
    return seen;
  }

  return {
    DUNGEON_TYPES, DUNGEON_NAMES, DUNGEON_MOBS, DUNGEON_ITEMS, DUNGEON_SIZE,
    DUNGEON_WALL_KINDS,
    DUNGEON_MEMORY_DAYS, LEVEL_DELTA_MAX,
    CELL_WALL, CELL_FLOOR,
    dungeonTypeFor, createDungeon, generateDungeonContents, wallObjFor,
    contentValid, openChest, wanderStep, reachableFrom,
  };
});

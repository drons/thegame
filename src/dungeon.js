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
// (dungeon_memory_days, level_delta_max).

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./perlin.js'), require('./map.js'),
      require('./global-settings.js'));
  } else {
    root.Game = Object.assign({}, root.Game,
      factory(typeof root.Game === 'object' ? root.Game : {}, root.Game,
        root.Game && root.Game.GlobalSettings));
  }
})(typeof globalThis !== 'undefined' ? globalThis : self,
  function (perlin, mapmod, settings) {

  const mulberry32 = perlin.mulberry32;
  const hash2 = perlin.hash2;
  const createPerlin2D = perlin.createPerlin2D;
  const GLOBAL_SEED = mapmod.GLOBAL_SEED;
  const TERRAIN = mapmod.TERRAIN;

  const CELL_WALL = 0;
  const CELL_FLOOR = 1;

  // Типы подземелий (SPEC.md, «Входы в пещеры»).
  const DUNGEON_TYPES = {
    CAVE: 0, CRYPT: 1, RUINS: 2, DROWNED: 3, ABYSS: 4,
  };
  const DUNGEON_NAMES = {
    [DUNGEON_TYPES.CAVE]: 'простая пещера',
    [DUNGEON_TYPES.CRYPT]: 'склеп',
    [DUNGEON_TYPES.RUINS]: 'руины замка',
    [DUNGEON_TYPES.DROWNED]: 'затопленная пещера',
    [DUNGEON_TYPES.ABYSS]: 'бездна',
  };

  // Таблицы мобов по типу подземелья (SPEC.md, «Типы подземелий»).
  const DUNGEON_MOBS = {
    [DUNGEON_TYPES.CAVE]: ['skeleton', 'ant', 'crawling_bones', 'giant_larva'],
    [DUNGEON_TYPES.CRYPT]: ['skeleton', 'skeleton_archer', 'rot', 'vampire', 'bone_coloss'],
    [DUNGEON_TYPES.RUINS]: ['orc_warrior', 'orc_archer', 'wolf', 'troll', 'skeleton'],
    [DUNGEON_TYPES.DROWNED]: ['water_elemental', 'scorpion', 'spider', 'imp'],
    [DUNGEON_TYPES.ABYSS]: ['lower_demon', 'succubus', 'abomination'],
  };

  // Предметы в сундуках по типу подземелья: id предметов из каталога
  // assets/items (фолбэк — src/items-data.js, ядро — src/items.js).
  const DUNGEON_ITEMS = {
    [DUNGEON_TYPES.CAVE]: ['iron_sword', 'healing_potion', 'sulfur', 'stone_fist_grimoire'],
    [DUNGEON_TYPES.CRYPT]: ['alchemy_manual', 'chainmail', 'mana_potion', 'meditation_scroll'],
    [DUNGEON_TYPES.RUINS]: ['steel_sword', 'knight_plate', 'war_hammer', 'iron_hide_tome'],
    [DUNGEON_TYPES.DROWNED]: ['mana_elixir', 'hunting_bow', 'moonstone', 'nature_scroll'],
    [DUNGEON_TYPES.ABYSS]: ['war_hammer', 'phoenix_feather', 'greater_healing', 'heavy_tome', 'fire_spellbook'],
  };

  // Размер лабиринта (клеток) по типу.
  const DUNGEON_SIZE = {
    [DUNGEON_TYPES.CAVE]: 25,
    [DUNGEON_TYPES.CRYPT]: 27,
    [DUNGEON_TYPES.RUINS]: 31,
    [DUNGEON_TYPES.DROWNED]: 27,
    [DUNGEON_TYPES.ABYSS]: 35,
  };

  if (!settings || typeof settings.SETTINGS !== 'object') {
    throw new Error(
      'dungeon.js: не найдены глобальные настройки — загрузите global-settings.js до dungeon.js');
  }

  // Глобальные настройки (src/global-settings.js, SPEC.md).
  const DUNGEON_MEMORY_DAYS = settings.SETTINGS.dungeon_memory_days;
  const LEVEL_DELTA_MAX = settings.SETTINGS.level_delta_max; // моб = персонаж ± N
  const CHEST_ITEM_CHANCE = 0.4;

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
   * }}
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
    const mobLevel = () => Math.max(1, player.level + Math.floor(rng() * (2 * LEVEL_DELTA_MAX + 1)) - LEVEL_DELTA_MAX);

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
        level: Math.max(1, player.level + LEVEL_DELTA_MAX),
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
  function contentValid(lastVisitDay, currentDay, memoryDays = DUNGEON_MEMORY_DAYS) {
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
    DUNGEON_MEMORY_DAYS, LEVEL_DELTA_MAX,
    CELL_WALL, CELL_FLOOR,
    dungeonTypeFor, createDungeon, generateDungeonContents,
    contentValid, openChest, wanderStep, reachableFrom,
  };
});

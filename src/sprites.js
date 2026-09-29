// 2D-графика: выбор спрайтов и загрузка ассетов (SPEC.md, раздел «Графика»).
//
// Ассеты:
//   assets/tiles/<террейн>[_n].svg            — текстуры тайлов (вода — анимация);
//   assets/sprites/phlogiston/<действие>_n.svg — Флогистон (idle/walk/attack/cast);
//   assets/sprites/mobs/<моб>_n.svg           — базовые типы мобов;
//   assets/sprites/buildings/<постройка>.svg  — иконки построек;
//   assets/sprites/visuals/<элемент>.svg      — декорации тайлов (000021),
//     описания — assets/visuals/*.json + schema.json.
//
// Ядро — чистые функции: выбор файла всегда определяется только типом
// (террейн/моб/постройка) и координатами тайла, а НЕ фактом загрузки.
// Если ассет не загрузился (file://, нет сети) — рендерер просто не
// рисует слой спрайтов и остаются прежние цветные тайлы/маркеры WebGL.
// Генерация мира (src/map.js) от ассетов не зависит — детерминизм сохранён.
//
// Униформный модуль: в браузере — globalThis.Game, в node — require().
// В браузере должен грузиться ПОСЛЕ src/map.js (типы террейнов/построек/мобов).

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./map.js'),
      require('./mob-groups-data.js'));
  } else {
    // Браузер: модуль данных грузится ДО sprites.js (index.html) —
    // каталог уже в Game (deps.MobGroupsData), отдельный аргумент
    // не нужен.
    root.Game = Object.assign({}, root.Game,
      factory(typeof root.Game === 'object' ? root.Game : {}));
  }
})(typeof globalThis !== 'undefined' ? globalThis : self, function (deps, mobGroups) {

  const TERRAIN = deps.TERRAIN;
  const TERRAIN_NAMES = deps.TERRAIN_NAMES;
  const BUILDING_TYPES = deps.BUILDING_TYPES;
  const MOB_GROUP_TYPES = deps.MOB_GROUP_TYPES;
  const hash2 = deps.hash2;

  // Базовые цвета тайлов — из единой таблицы террейнов TERRAIN_DATA
  // (src/map.js, поле base; задача 000056): согласованы с цветными
  // квадратами рендера (TILE_COLORS в src/main.js — поле rgb) — единый
  // источник, собственных копий нет.
  const TERRAIN_DATA = deps.TERRAIN_DATA;
  const TILE_BASE = {};
  for (const k of Object.keys(TERRAIN_DATA)) {
    TILE_BASE[Number(k)] = TERRAIN_DATA[Number(k)].base;
  }

  // Кадры тайлов по типу террейна. Вода/глубокая вода анимированы (2–4 кадра),
  // остальные — одна текстура.
  const TILE_FRAMES = {
    [TERRAIN.DEEP_WATER]: [
      'assets/tiles/deepwater_1.svg',
      'assets/tiles/deepwater_2.svg',
    ],
    [TERRAIN.WATER]: [
      'assets/tiles/water_1.svg',
      'assets/tiles/water_2.svg',
      'assets/tiles/water_3.svg',
      'assets/tiles/water_4.svg',
    ],
    [TERRAIN.SAND]: ['assets/tiles/sand_1.svg'],
    [TERRAIN.GRASS]: ['assets/tiles/grass_1.svg'],
    [TERRAIN.FOREST]: ['assets/tiles/forest_1.svg'],
    [TERRAIN.HILL]: ['assets/tiles/hill_1.svg'],
    [TERRAIN.MOUNTAIN]: ['assets/tiles/mountain_1.svg'],
    [TERRAIN.SWAMP]: ['assets/tiles/swamp_1.svg'],
  };

  // Анимации Флогистона (кадры на действие).
  const PHLOGISTON_ACTIONS = {
    idle: [
      'assets/sprites/phlogiston/idle_1.svg',
      'assets/sprites/phlogiston/idle_2.svg',
    ],
    walk: [
      'assets/sprites/phlogiston/walk_1.svg',
      'assets/sprites/phlogiston/walk_2.svg',
    ],
    attack: [
      'assets/sprites/phlogiston/attack_1.svg',
      'assets/sprites/phlogiston/attack_2.svg',
    ],
    cast: [
      'assets/sprites/phlogiston/cast_1.svg',
      'assets/sprites/phlogiston/cast_2.svg',
    ],
  };

  // Группы мобов (map.js) → базовые типы мобов.
  // (дух бездны — отдельный силуэт, не стихийник).
  //
  // Source of truth — каталог assets/mob_groups (задача 000057,
  // поле «спрайт», id − 1 = тип). sprites.js НЕ требует combat.js/
  // dungeon.js (паттерн 000049): в node каталог приходит вторым
  // аргументом UMD, в браузере — из Game (модуль данных грузится
  // ДО sprites.js). vm-песочницы (combat-ui) грузят sprites.js
  // БЕЗ модуля данных — гард обязан дать фолбэк ровно текущих 7
  // видов (прецедент 000055).
  const FALLBACK_MOB_KINDS = {
    [MOB_GROUP_TYPES.ORC_CAMP]: 'orc',
    [MOB_GROUP_TYPES.ORC_RAIDERS]: 'orc',
    [MOB_GROUP_TYPES.SKELETON_DEN]: 'skeleton',
    [MOB_GROUP_TYPES.WOLF_PACK]: 'wolf',
    [MOB_GROUP_TYPES.SPIDER_NEST]: 'spider',
    [MOB_GROUP_TYPES.ELEMENTAL_CIRCLE]: 'elemental',
    [MOB_GROUP_TYPES.ABYSS_SPIRIT]: 'abyss',
  };
  const MOB_GROUPS_DATA = (mobGroups && Array.isArray(mobGroups.MOB_GROUPS))
    ? mobGroups
    : (deps.MobGroupsData && Array.isArray(deps.MobGroupsData.MOB_GROUPS)
      ? deps.MobGroupsData : null);
  const MOB_KINDS = MOB_GROUPS_DATA
    ? (function () {
        const k = {};
        for (const g of MOB_GROUPS_DATA.MOB_GROUPS) {
          const t = g && (typeof g.id === 'number' ? g.id : NaN) - 1;
          if (Number.isInteger(t) && t >= 0 && typeof g.спрайт === 'string') {
            k[t] = g.спрайт;
          }
        }
        return k;
      })()
    : FALLBACK_MOB_KINDS;
  const MOB_FRAMES = {
    orc: ['assets/sprites/mobs/orc_1.svg', 'assets/sprites/mobs/orc_2.svg'],
    skeleton: ['assets/sprites/mobs/skeleton_1.svg', 'assets/sprites/mobs/skeleton_2.svg'],
    wolf: ['assets/sprites/mobs/wolf_1.svg', 'assets/sprites/mobs/wolf_2.svg'],
    spider: ['assets/sprites/mobs/spider_1.svg', 'assets/sprites/mobs/spider_2.svg'],
    elemental: ['assets/sprites/mobs/elemental_1.svg', 'assets/sprites/mobs/elemental_2.svg'],
    abyss: ['assets/sprites/mobs/abyss_1.svg', 'assets/sprites/mobs/abyss_2.svg'],
  };

  // Бой (задача 000047): типы мобов MOB_TYPES из src/combat.js →
  // базовые спрайт-виды MOB_FRAMES. Таблица — ЛИТЕРАЛ: sprites.js не
  // зависит от combat.js (нет цикла), а vm-песочница
  // tests/combat-ui.test.js грузит combat.js БЕЗ require-цепочки
  // sprites.js — равноценность таблицы с фактическими id MOB_TYPES
  // закрывает тест (tests/sprites.test.js импортирует combat.js).
  // Расхождение в заголовке задачи («6 диких зверей, 4 насекомых» —
  // срез по коммент-блокам combat.js, где 'spider' стоит в блоке
  // «Дикие звери») — косметическое: строки таблицы авторитетны,
  // маппинг 5→wolf + 5→spider; все 36 id маппятся 1:1 (проверено).
  const MOB_SPRITE_KINDS = {
    // Орки (8)
    orc_grunt: 'orc', orc_warrior: 'orc', orc_archer: 'orc', orc_shaman: 'orc',
    orc_rider: 'orc', orc_mad: 'orc', orc_captain: 'orc', orc_chief: 'orc',
    // Нежить (7)
    skeleton: 'skeleton', skeleton_archer: 'skeleton', crawling_bones: 'skeleton',
    giant_larva: 'skeleton', vampire: 'skeleton', rot: 'skeleton', bone_coloss: 'skeleton',
    // Дикие звери (5)
    wolf: 'wolf', wolf_pack: 'wolf', boar: 'wolf', cave_bear: 'wolf', troll: 'wolf',
    // Насекомые (5)
    spider: 'spider', ant: 'spider', ant_queen: 'spider',
    scorpion: 'spider', centipede: 'spider',
    // Стихийники и магия (8)
    fire_elemental: 'elemental', water_elemental: 'elemental',
    wind_elemental: 'elemental', earth_elemental: 'elemental',
    imp: 'elemental', salamander: 'elemental',
    fairy: 'elemental', stone_golem: 'elemental',
    // Бездна (3)
    lower_demon: 'abyss', succubus: 'abyss', abomination: 'abyss',
  };

  // --- Персональный арт мобов (задача 000062) ---
  //
  // В JSON-каталоге assets/mobs (source of truth) у каждого моба поле
  // «art»: move (2–3 кадра), attack (2–3), dead (1) — пути
  // assets/sprites/mobs/<mob_id>_<state>_<n>.svg (плоское именование,
  // MOBS.md). Зеркало combat.js арта НЕ содержит (~40 КБ описаний,
  // под file:// арта не грузится — тогда и зеркало источник данных),
  // поэтому и здесь таблица-литерал, как MOB_SPRITE_KINDS: число
  // кадров фиксировано, путь выводится из id — без дублей 180 путей.
  // Равенство таблицы с «art» из JSON закрывает тест
  // (tests/sprites.test.js: все пути ⊆ allAssetPaths + файлы есть).
  const MOB_ART_DIR = 'assets/sprites/mobs/';
  const MOB_ART_FRAME_COUNTS = { move: 2, attack: 2, dead: 1 };
  const MOB_ART_ACTIONS = Object.keys(MOB_ART_FRAME_COUNTS);

  /**
   * Кадры персонального арта боевого моба (задача 000062):
   * mobId из MOB_TYPES (combat.js) и действие move|attack|dead →
   * массив путей SVG (dead — ровно один). Чистая функция;
   * неизвестный id/действие → [] (рендерер отступает на базовые
   * шесть видов MOB_FRAMES, затем на прямоугольник ROLE_COLORS).
   * @param {string} mobId id моба (MOB_TYPES из src/combat.js)
   * @param {string} action 'move' | 'attack' | 'dead'
   * @returns {string[]} массив путей (может быть пустым)
   */
  function mobArtFrames(mobId, action) {
    if (!MOB_SPRITE_KINDS[mobId]) return [];
    const n = MOB_ART_FRAME_COUNTS[action];
    if (!n) return [];
    const out = [];
    for (let i = 1; i <= n; i++) {
      out.push(MOB_ART_DIR + mobId + '_' + action + '_' + i + '.svg');
    }
    return out;
  }

  // Иконки построек (map.js) — один кадр на тип.
  const BUILDING_SPRITES = {
    [BUILDING_TYPES.WEAPONS_SHOP]: 'assets/sprites/buildings/weapons_shop.svg',
    [BUILDING_TYPES.ARMOR_SHOP]: 'assets/sprites/buildings/armor_shop.svg',
    [BUILDING_TYPES.APOTHECARY]: 'assets/sprites/buildings/apothecary.svg',
    [BUILDING_TYPES.MAGIC_SHOP]: 'assets/sprites/buildings/magic_shop.svg',
    [BUILDING_TYPES.ARENA]: 'assets/sprites/buildings/arena.svg',
    [BUILDING_TYPES.BLACKSMITH]: 'assets/sprites/buildings/blacksmith.svg',
    [BUILDING_TYPES.ARCHERY_RANGE]: 'assets/sprites/buildings/archery_range.svg',
    [BUILDING_TYPES.ACADEMY]: 'assets/sprites/buildings/academy.svg',
    [BUILDING_TYPES.TEMPLE]: 'assets/sprites/buildings/temple.svg',
    [BUILDING_TYPES.CAVE_ENTRANCE]: 'assets/sprites/buildings/cave_entrance.svg',
    [BUILDING_TYPES.RUNE_STONE]: 'assets/sprites/buildings/rune_stone.svg',
    [BUILDING_TYPES.TAVERN]: 'assets/sprites/buildings/tavern.svg',
    [BUILDING_TYPES.NPC_HOUSE]: 'assets/sprites/buildings/npc_house.svg',
  };

  // --- Декорации тайлов (задача 000021) ---
  //
  // Небольшие графические объекты поверх текстуры тайла: травинки,
  // цветы, кусты на траве/лесу, камни и снег на холмах/горах и т.д.
  // Источник правды — assets/visuals/NNNNNN.json (схема —
  // assets/visuals/schema.json), спрайты — assets/sprites/visuals/.
  // Ниже — дублирующая JS-копия каталога (фолбэк, как в buildings.js):
  // игра открывается по file://, где fetch() JSON не работает.
  // Тест требует, чтобы файлы JSON совпадали с каталогом.
  const VISUALS = [
    { id: 1, название: 'Светлые травинки', террейны: ['трава'], спрайт: 'assets/sprites/visuals/grass_blades_light.svg', частота: 0.35, размер: 0.14 },
    { id: 2, название: 'Тёмные травинки', террейны: ['трава', 'лес'], спрайт: 'assets/sprites/visuals/grass_blades_dark.svg', частота: 0.30, размер: 0.14 },
    { id: 3, название: 'Красный цветок', террейны: ['трава'], спрайт: 'assets/sprites/visuals/flower_red.svg', частота: 0.12, размер: 0.12 },
    { id: 4, название: 'Жёлтый цветок', террейны: ['трава', 'лес'], спрайт: 'assets/sprites/visuals/flower_yellow.svg', частота: 0.12, размер: 0.12 },
    { id: 5, название: 'Белый цветок', террейны: ['трава'], спрайт: 'assets/sprites/visuals/flower_white.svg', частота: 0.08, размер: 0.12 },
    { id: 6, название: 'Небольшой куст', террейны: ['трава', 'лес'], спрайт: 'assets/sprites/visuals/bush.svg', частота: 0.10, размер: 0.24 },
    { id: 7, название: 'Гриб', террейны: ['лес'], спрайт: 'assets/sprites/visuals/mushroom.svg', частота: 0.12, размер: 0.14 },
    { id: 8, название: 'Камень', террейны: ['холмы', 'горы'], спрайт: 'assets/sprites/visuals/rock.svg', частота: 0.30, размер: 0.22 },
    { id: 9, название: 'Камешек', террейны: ['холмы', 'горы', 'песок'], спрайт: 'assets/sprites/visuals/pebble.svg', частота: 0.25, размер: 0.10 },
    { id: 10, название: 'Снежный сугроб', террейны: ['горы'], спрайт: 'assets/sprites/visuals/snow_patch.svg', частота: 0.30, размер: 0.26 },
    { id: 11, название: 'Сухая травка', террейны: ['песок', 'холмы'], спрайт: 'assets/sprites/visuals/dry_tuft.svg', частота: 0.30, размер: 0.14 },
    { id: 12, название: 'Тростинка', террейны: ['болото'], спрайт: 'assets/sprites/visuals/reed.svg', частота: 0.30, размер: 0.22 },
    { id: 13, название: 'Кувшинка', террейны: ['вода'], спрайт: 'assets/sprites/visuals/lily_pad.svg', частота: 0.15, размер: 0.20 },
  ];

  // Сид выбора/размещения декораций (отдельный от сида построек/мобов).
  const VISUALS_SEED = 0x51a11ce5;
  // Потолок декораций на тайл: разнообразие — да, но без «клякс».
  const MAX_VISUALS_PER_TILE = 3;
  // Порог зума, ниже которого main.js НЕ рисует слой декораций (000039):
  // при малом зуме число видимых тайлов explode, по-тайловый проход
  // дорог, а мелкие элементы и так не различимы.
  const VISUALS_MIN_ZOOM = 24;

  // Период кадра анимации (мс).
  const FRAME_MS = 480;

  // --- Фон поля боя (задача 000049) ---
  //
  // Статичные SVG-фоны в assets/combat/bg/ (11 файлов, генератор —
  // scripts/gen-combat-bg.js): 5 проходимых террейнов, 5 подземелий,
  // 1 фолбэк. combat-ui.js рисует их первым слоем боевого canvas;
  // загрузчик передаётся в startCombat опцией spriteLoader (main.js).
  //
  // COMBAT_BG_DUNGEON — ЛИТЕРАЛЬНОЕ зеркало каталога подземелий
  // assets/dungeons (числа DUNGEON_TYPES 0..4 → имя фона, задача
  // 000058; src/dungeon.js сам выводит таблицы из того же каталога).
  // Зависимость от dungeon.js и data-модулей не создаётся: vm-песочница
  // tests/combat-ui.test.js не грузит dungeon.js и dungeons-data.js, а
  // require в node-ветке UMD дал бы рассинхрон node/браузер веток
  // (задача 000049). Равенство зеркала с каталогом закрывает тест
  // (tests/sprites.test.js).
  const COMBAT_BG_DIR = 'assets/combat/bg/';
  const COMBAT_BG_TERRAIN = {
    [TERRAIN.SAND]: 'sand',
    [TERRAIN.GRASS]: 'grass',
    [TERRAIN.FOREST]: 'forest',
    [TERRAIN.HILL]: 'hill',
    [TERRAIN.SWAMP]: 'swamp',
  };
  const COMBAT_BG_DUNGEON = {
    0: 'cave', 1: 'crypt', 2: 'ruins', 3: 'drowned', 4: 'abyss',
  };
  const COMBAT_BG_FALLBACK = COMBAT_BG_DIR + 'plain.svg';

  // --- Волна на воде (задача 000025) ---
  //
  // Волна в текстуре имеет период 16px (четверть тайла 64px), каждый
  // кадр смещает её на 8px (полпериода). Чтобы волна «соединялась» на
  // стыке тайлов, разность кадров соседних тайлов должна быть чётной —
  // сдвиг на целое число периодов волны, и рисунок в стыке совпадает.
  //
  // Фаза волны в точке мирового пространства — чистая функция мировых
  // координат точки (в единицах тайлов) и времени. Пространственный
  // шаг фазы на тайл — полцикла по каждой оси, поэтому на границе
  // соседних тайлов фаза сдвигается ровно на полцикла: при 4-кадровой
  // квантизации это чётное число кадров — волны на стыке не
  // разрывается, а фаза любой точки стыка — одно значение для обоих
  // тайлов (старая схема (tx*5 + ty*9) % N давала скачок фазы между
  // соседями — отсюда и был разрыв).

  const WAVE_PERIOD_MS = 3200; // период «дрейфа» волны (мс)

  /**
   * Фаза волны в точке мирового пространства.
   * @param {number} nowMs время (мс)
   * @param {number} wx мировая X точки (в тайлах, допустимо дробное)
   * @param {number} wy мировая Y точки (в тайлах)
   * @returns {number} фаза в [0; 1)
   */
  function wavePhase(nowMs, wx, wy) {
    const t = (((nowMs % WAVE_PERIOD_MS) + WAVE_PERIOD_MS) % WAVE_PERIOD_MS) / WAVE_PERIOD_MS;
    const p = 0.5 * wx + 0.5 * wy - t;
    return ((p % 1) + 1) % 1;
  }

  /**
   * Кадр анимации водяного тайла (tx, ty): фаза берётся в центре
   * тайла в мировых координатах. Чистая функция.
   * @param {number} nowMs текущее время (мс)
   * @param {number} tx координата тайла по X
   * @param {number} ty координата тайла по Y
   * @param {number} frameCount число кадров анимации
   * @returns {number} индекс кадра в [0; frameCount)
   */
  function waterTileFrame(nowMs, tx, ty, frameCount) {
    if (!frameCount || frameCount <= 1) return 0;
    const phase = wavePhase(nowMs, tx + 0.5, ty + 0.5);
    return Math.floor(phase * frameCount) % frameCount;
  }

  // Для воды читабельное имя-синоним (та же чистая функция).
  function waterFrame(nowMs, tx, ty, frameCount) {
    return waterTileFrame(nowMs, tx, ty, frameCount);
  }

  // Число кадров текстуры воды — единственное многокадровое значение
  // за пределами 2 (мобы/Флогистон — 2 кадра, прочие тайлы — 1).
  const WATER_FRAME_COUNT = TILE_FRAMES[TERRAIN.WATER].length;

  /**
   * Номер кадра анимации тайла/моба.
   * Чистая функция: один и тот же (момент, координаты, число кадров)
   * всегда даёт один и тот же кадр.
   * Текстуры воды (4 кадра) — через фазу волны в мировых координатах
   * (задача 000025): соседи обязаны «договариваться» о фазе, иначе
   * волна рвётся на стыках тайлов. Мобы (2 кадра) сохраняют старую
   * фазу на тайл: соседи «не синхронизированы», но детерминированы.
   * @param {number} nowMs текущее время (performance.now / Date.now)
   * @param {number} tx координата тайла по X
   * @param {number} ty координата тайла по Y
   * @param {number} frameCount число кадров анимации
   * @returns {number} индекс кадра в [0; frameCount)
   */
  function frameIndex(nowMs, tx, ty, frameCount) {
    if (!frameCount || frameCount <= 1) return 0;
    if (frameCount === WATER_FRAME_COUNT) {
      return waterTileFrame(nowMs, tx, ty, frameCount);
    }
    const t = Math.max(0, Math.floor(nowMs / FRAME_MS));
    const phase = (((tx * 5 + ty * 9) % frameCount) + frameCount) % frameCount;
    return (t + phase) % frameCount;
  }

  /** Кадры текстуры для террейна (массив путей, >= 1). */
  function tileFrames(terrain) {
    return TILE_FRAMES[terrain] || [];
  }

  /** Базовый тип мобов для группы (orc/skeleton/wolf/spider/elemental/abyss). */
  function mobKind(groupType) {
    return MOB_KINDS[groupType] || null;
  }

  /** Кадры спрайта для группы мобов (массив путей). */
  function mobFrames(groupType) {
    const kind = MOB_KINDS[groupType];
    return kind ? MOB_FRAMES[kind] : [];
  }

  /**
   * Базовый спрайт-вид БОЕВОГО моба (задача 000047):
   * mobId из MOB_TYPES (combat.js) → 'orc'|'skeleton'|'wolf'|'spider'
   * |'elemental'|'abyss'. Чистая функция; неизвестный id → null
   * (рендерер рисует фолбэк-прямоугольник).
   * @param {string} mobId id моба (MOB_TYPES из src/combat.js)
   * @returns {string|null} ключ MOB_FRAMES или null
   */
  function mobSpriteKind(mobId) {
    return MOB_SPRITE_KINDS[mobId] || null;
  }

  /** Иконка постройки (путь) или null для NONE. */
  function buildingSprite(buildingType) {
    return BUILDING_SPRITES[buildingType] || null;
  }

  /** Кадры анимации Флогистона для действия idle|walk|attack|cast. */
  function phlogistonFrames(action) {
    return PHLOGISTON_ACTIONS[action] || [];
  }

  /**
   * Декорации тайла (задача 000021): какие небольшие графические
   * объекты рисовать поверх текстуры тайла (tx, ty) террейна terrain.
   * Чистая функция: выбор и позиция — только от координат тайла и
   * террейна (seed — hash2 координат), НЕ от факта загрузки.
   * Элемент попадает на тайл, если его частота побил детерминированный
   * «бросок» из хэша; позиция — детерминированная точка внутри тайла
   * (доли [0.08; 0.92], чтобы не вылезать за границы).
   * @param {number} tx координата тайла по X
   * @param {number} ty координата тайла по Y
   * @param {number} terrain числовой тип террейна (TERRAIN.*)
   * @returns {{id:number, sprite:string, x:number, y:number, size:number}[]}
   *   элементы в порядке каталога, не более MAX_VISUALS_PER_TILE
   */
  function tileVisuals(tx, ty, terrain) {
    const name = TERRAIN_NAMES[terrain];
    if (!name) return [];
    const out = [];
    for (const v of VISUALS) {
      if (!v.террейны.includes(name)) continue;
      const seed = VISUALS_SEED + v.id * 0x9e3779b9;
      // «Бросок» появления: старшие 24 бита хэша как число [0; 1) —
      // детерминированная псевдослучайность по координатам тайла.
      const roll = (hash2(tx, ty, seed) >>> 8) / 16777216; // [0; 1)
      if (roll >= v.частота) continue;
      const hx = hash2(tx, ty, seed + 1);
      const hy = hash2(tx, ty, seed + 2);
      out.push({
        id: v.id,
        sprite: v.спрайт,
        x: 0.08 + (hx / 4294967296) * 0.84,
        y: 0.08 + (hy / 4294967296) * 0.84,
        size: v.размер,
      });
      if (out.length >= MAX_VISUALS_PER_TILE) break;
    }
    return out;
  }

  /**
   * Прямоугольник drawImage элемента декорации (задача 000039).
   * Чистая геометрия: e.x/e.y — ЦЕНТР элемента (доли тайла), поэтому
   * прямоугольник начинается в (центр − s/2, центр − s/2). sx/sy —
   * левый верхний угол тайла на экране, s = e.size * zoom.
   * @param {{x:number, y:number, size:number}} e элемент tileVisuals
   * @param {number} sx левый верхний x тайла на экране
   * @param {number} sy левый верхний y тайла на экране
   * @param {number} zoom пикселей на тайл
   * @returns {{x:number, y:number, size:number}} аргументы drawImage
   *   (x, y, size, size)
   */
  function visualDrawRect(e, sx, sy, zoom) {
    const s = e.size * zoom;
    return {
      x: sx + e.x * zoom - s / 2,
      y: sy + e.y * zoom - s / 2,
      size: s,
    };
  }

  /**
   * Путь SVG-фона боевого поля (задача 000049).
   * Чистая функция: bg → 'assets/combat/bg/<name>.svg'.
   * bg — { terrain: <TERRAIN из map.js> } | { dungeon: <DUNGEON_TYPES> }
   * | {} / null / неизвестный ключ → фолбэк plain.svg.
   * Вода/глубокая вода/горы (непроходимы — боя там по дизайну нет)
   * тоже → plain.svg. Приоритет: terrain, если задан.
   * @param {object|null|undefined} bg
   * @returns {string} путь SVG (всегда один из 11 файлов)
   */
  function combatBackground(bg) {
    if (bg && bg.terrain !== undefined) {
      const k = COMBAT_BG_TERRAIN[bg.terrain];
      return k ? COMBAT_BG_DIR + k + '.svg' : COMBAT_BG_FALLBACK;
    }
    if (bg && bg.dungeon !== undefined) {
      const k = COMBAT_BG_DUNGEON[bg.dungeon];
      if (k) return COMBAT_BG_DIR + k + '.svg';
    }
    return COMBAT_BG_FALLBACK;
  }

  /** Все пути ассетов модуля (без дублей) — для загрузки и тестов. */
  function allAssetPaths() {
    const paths = [];
    for (const frames of Object.values(TILE_FRAMES)) paths.push(...frames);
    for (const frames of Object.values(PHLOGISTON_ACTIONS)) paths.push(...frames);
    for (const frames of Object.values(MOB_FRAMES)) paths.push(...frames);
    // Персональный арт мобов (задача 000062): 36 × (move 2 + attack 2
    // + dead 1) = 180 файлов.
    for (const mobId of Object.keys(MOB_SPRITE_KINDS)) {
      for (const a of MOB_ART_ACTIONS) paths.push(...mobArtFrames(mobId, a));
    }
    paths.push(...Object.values(BUILDING_SPRITES));
    for (const v of VISUALS) paths.push(v.спрайт);
    // Фоны боя (задача 000049): 11 файлов из двух карт + фолбэк.
    for (const k of Object.values(COMBAT_BG_TERRAIN)) {
      paths.push(COMBAT_BG_DIR + k + '.svg');
    }
    for (const k of Object.values(COMBAT_BG_DUNGEON)) {
      paths.push(COMBAT_BG_DIR + k + '.svg');
    }
    paths.push(COMBAT_BG_FALLBACK);
    return Array.from(new Set(paths));
  }

  /**
   * Загрузчик спрайтов с Dependency Injection функции загрузки —
   * в браузере это Image() (работает под file://), в тестах — заглушка.
   * loadFn(path) должен вернуть Promise, разрешающийся изображением
   * или null при неудаче. Ошибки не пробрасываются: «не загрузилось»
   * — штатное состояние, рендерер рисует фолбэк.
   */
  function createSpriteLoader(loadFn) {
    const entries = new Map(); // path → {state:'loading'|'ready'|'failed', img}

    function queue(path) {
      let entry = entries.get(path);
      if (!entry) {
        entry = { state: 'loading', img: null };
        entries.set(path, entry);
        Promise.resolve()
          .then(() => loadFn(path))
          .then(
            (img) => {
              entry.state = img ? 'ready' : 'failed';
              entry.img = img || null;
            },
            () => {
              entry.state = 'failed';
              entry.img = null;
            },
          );
      }
      return entry;
    }

    /** Картинка готова? (фолбэк — если нет.) */
    function isReady(path) {
      const e = entries.get(path);
      return !!e && e.state === 'ready';
    }

    /** Изображение или null, если ещё грузится/не загрузилось. */
    function image(path) {
      const e = entries.get(path);
      return e && e.state === 'ready' ? e.img : null;
    }

    function readyCount() {
      let n = 0;
      for (const e of entries.values()) if (e.state === 'ready') n++;
      return n;
    }

    function totalCount() {
      return entries.size;
    }

    return { queue, isReady, image, readyCount, totalCount };
  }

  // --- Цвета полос HP (задача 000038) ---
  //
  // Цвет полоски здоровья героя в бою: DOM-полоса в .combat-side и
  // 4px-миниполоса над ромбом на canvas (src/combat-ui.js). Чистая
  // функция от доли оставшегося HP — тестируется в node; UI берёт
  // цвета через Game.hpBarColor. Единственный литерал-фолбэк
  // '#6fdc6f' (зелёный полосы мобов) — в combat-ui.js: он срабатывает,
  // только если sprites.js не загружен вовсе (порядок загрузки —
  // закреплён в tests/index-order.test.js, см. комментарий там).
  //
  // Зафиксированные пороги (тесты — tests/sprites.test.js):
  //   frac >= 0.5 → зелёный;
  //   frac >= 0.2 → жёлтый;
  //   иначе       → красный.
  // Границы «включены сверху»: ровно 0.5 — зелёный, ровно 0.2 —
  // жёлтый (ТЗ «>50%» и «20–50%» читаем как включительные диапазоны
  // 50–100 и 20–50).
  // Цвета — из существующей палитры игры, новых не вводим:
  //   #6fdc6f — полоса HP мобов на canvas (src/combat-ui.js);
  //   #e0b13c — ROLE_COLORS.swarm (src/combat-ui.js) и отмётки
  //             подземелья (src/dungeon-ui.js);
  //   #d9483b — ROLE_COLORS.melee (src/combat-ui.js) и отмётки
  //             подземелья (src/dungeon-ui.js).
  const HP_BAR_COLORS = {
    high: '#6fdc6f',
    mid: '#e0b13c',
    low: '#d9483b',
  };

  /**
   * Цвет полосы HP при заданной доле оставшегося здоровья.
   * Чистая функция: frac вне [0,1] клампится в [0,1] (±Infinity —
   * как 1/0), NaN и нечисла — красный (frac = 0). maxHP у героя
   * всегда > 0 (player.js: 20 + конст.·5, множители ≥ 1), так что
   * вызов с нулевым maxHP невозможен — ветка защитная.
   * @param {number} frac доля оставшегося HP (hp / maxHP)
   * @returns {string} CSS-цвет (одно из HP_BAR_COLORS)
   */
  function hpBarColor(frac) {
    const f = (typeof frac === 'number' && !Number.isNaN(frac))
      ? Math.min(1, Math.max(0, frac)) : 0;
    if (f >= 0.5) return HP_BAR_COLORS.high;
    if (f >= 0.2) return HP_BAR_COLORS.mid;
    return HP_BAR_COLORS.low;
  }

  return {
    TILE_BASE, TILE_FRAMES,
    PHLOGISTON_ACTIONS,
    MOB_KINDS, MOB_FRAMES,
    MOB_SPRITE_KINDS, mobSpriteKind,
    MOB_ART_DIR, MOB_ART_FRAME_COUNTS, MOB_ART_ACTIONS, mobArtFrames,
    BUILDING_SPRITES,
    COMBAT_BG_DIR, COMBAT_BG_TERRAIN, COMBAT_BG_DUNGEON, COMBAT_BG_FALLBACK,
    combatBackground,
    HP_BAR_COLORS, hpBarColor,
    VISUALS, VISUALS_SEED, MAX_VISUALS_PER_TILE, VISUALS_MIN_ZOOM,
    FRAME_MS,
    WAVE_PERIOD_MS, WATER_FRAME_COUNT,
    wavePhase, waterTileFrame,
    frameIndex, waterFrame,
    tileFrames, mobKind, mobFrames, buildingSprite, phlogistonFrames,
    tileVisuals, visualDrawRect,
    allAssetPaths,
    createSpriteLoader,
  };
});

// 2D-графика: выбор спрайтов и загрузка ассетов (SPEC.md, раздел «Графика»).
//
// Ассеты:
//   assets/tiles/<террейн>[_n].svg            — текстуры тайлов (вода — анимация);
//   assets/sprites/phlogiston/<действие>_n.svg — Флогистон (idle/walk/attack/cast);
//   assets/sprites/mobs/<моб>_n.svg           — базовые типы мобов;
//   assets/sprites/buildings/<постройка>.svg  — иконки построек.
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
    module.exports = factory(require('./map.js'));
  } else {
    root.Game = Object.assign({}, root.Game,
      factory(typeof root.Game === 'object' ? root.Game : {}));
  }
})(typeof globalThis !== 'undefined' ? globalThis : self, function (deps) {

  const TERRAIN = deps.TERRAIN;
  const BUILDING_TYPES = deps.BUILDING_TYPES;
  const MOB_GROUP_TYPES = deps.MOB_GROUP_TYPES;

  // Базовые цвета тайлов — согласованы с цветными квадратами рендера
  // (TILE_COLORS в src/main.js): фолбэк и текстуры выглядят родственно.
  const TILE_BASE = {
    [TERRAIN.DEEP_WATER]: '#172e6b',
    [TERRAIN.WATER]: '#29579e',
    [TERRAIN.SAND]: '#c2b380',
    [TERRAIN.GRASS]: '#578c40',
    [TERRAIN.FOREST]: '#2e6633',
    [TERRAIN.HILL]: '#736e4a',
    [TERRAIN.MOUNTAIN]: '#57525c',
    [TERRAIN.SWAMP]: '#4d613d',
  };

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
  const MOB_KINDS = {
    [MOB_GROUP_TYPES.ORC_CAMP]: 'orc',
    [MOB_GROUP_TYPES.ORC_RAIDERS]: 'orc',
    [MOB_GROUP_TYPES.SKELETON_DEN]: 'skeleton',
    [MOB_GROUP_TYPES.WOLF_PACK]: 'wolf',
    [MOB_GROUP_TYPES.SPIDER_NEST]: 'spider',
    [MOB_GROUP_TYPES.ELEMENTAL_CIRCLE]: 'elemental',
    [MOB_GROUP_TYPES.ABYSS_SPIRIT]: 'abyss',
  };
  const MOB_FRAMES = {
    orc: ['assets/sprites/mobs/orc_1.svg', 'assets/sprites/mobs/orc_2.svg'],
    skeleton: ['assets/sprites/mobs/skeleton_1.svg', 'assets/sprites/mobs/skeleton_2.svg'],
    wolf: ['assets/sprites/mobs/wolf_1.svg', 'assets/sprites/mobs/wolf_2.svg'],
    spider: ['assets/sprites/mobs/spider_1.svg', 'assets/sprites/mobs/spider_2.svg'],
    elemental: ['assets/sprites/mobs/elemental_1.svg', 'assets/sprites/mobs/elemental_2.svg'],
    abyss: ['assets/sprites/mobs/abyss_1.svg', 'assets/sprites/mobs/abyss_2.svg'],
  };

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

  // Период кадра анимации (мс).
  const FRAME_MS = 480;

  /**
   * Номер кадра анимации тайла/моба.
   * Чистая функция: один и тот же (момент, координаты, число кадров)
   * всегда даёт один и тот же кадр. Фаза зависит только от координат,
   * поэтому соседи «не синхронизированы», но поведение детерминировано.
   * @param {number} nowMs текущее время (performance.now / Date.now)
   * @param {number} tx координата тайла по X
   * @param {number} ty координата тайла по Y
   * @param {number} frameCount число кадров анимации
   * @returns {number} индекс кадра в [0; frameCount)
   */
  function frameIndex(nowMs, tx, ty, frameCount) {
    if (!frameCount || frameCount <= 1) return 0;
    const t = Math.max(0, Math.floor(nowMs / FRAME_MS));
    const phase = (((tx * 5 + ty * 9) % frameCount) + frameCount) % frameCount;
    return (t + phase) % frameCount;
  }

  // Для воды читабельное имя-синоним (та же чистая функция).
  function waterFrame(nowMs, tx, ty, frameCount) {
    return frameIndex(nowMs, tx, ty, frameCount);
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

  /** Иконка постройки (путь) или null для NONE. */
  function buildingSprite(buildingType) {
    return BUILDING_SPRITES[buildingType] || null;
  }

  /** Кадры анимации Флогистона для действия idle|walk|attack|cast. */
  function phlogistonFrames(action) {
    return PHLOGISTON_ACTIONS[action] || [];
  }

  /** Все пути ассетов модуля (без дублей) — для загрузки и тестов. */
  function allAssetPaths() {
    const paths = [];
    for (const frames of Object.values(TILE_FRAMES)) paths.push(...frames);
    for (const frames of Object.values(PHLOGISTON_ACTIONS)) paths.push(...frames);
    for (const frames of Object.values(MOB_FRAMES)) paths.push(...frames);
    paths.push(...Object.values(BUILDING_SPRITES));
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

  return {
    TILE_BASE, TILE_FRAMES,
    PHLOGISTON_ACTIONS,
    MOB_KINDS, MOB_FRAMES,
    BUILDING_SPRITES,
    FRAME_MS,
    frameIndex, waterFrame,
    tileFrames, mobKind, mobFrames, buildingSprite, phlogistonFrames,
    allAssetPaths,
    createSpriteLoader,
  };
});

// Подземелья/лабиринты (spec/world-map.md, spec/mobs.md, spec/buildings.md).
//
// Форму лабиринта определяет ТОЛЬКО точка входа: координаты на основной
// карте, значения шумов Перлина и пиксель assets/map.png в этой точке
// (одинаковый вход всегда даёт одинаковый лабиринт).
// Содержимое (мобы, сундуки, лут) сидируется опытом персонажа
// (totalXp) — при повторном входе с новым опытом генерация иная.
// Содержимое живёт: пока персонаж внутри + dungeon_memory_days дней.
//
// Глубина (000153.01): d.depth — целое ≥ 1, ПЕРВЫЙ ЭТАЖ = 1. Форма
// depth=1 — БИТ-В-БИТ старой формуле (golden'ы); depth>1 — сид формы
// per-глубина (dungeonDepthSeed, без rng). Ключ памяти 'x,y:depth'
// (dungeonMemoryKey) + сериализатор раздела сейва dungeonMemory
// (паттерн cities.js).
//
// Чистое ядро без DOM — тестируется в node (tests/dungeon.test.js).
// Униформный модуль: в браузере — globalThis.Game, в node — require().
// Зависимости: perlin.js, map.js, global-settings.js
// (dungeon_memory_days, level_delta_max), dungeons-data.js (каталог
// assets/dungeons — source of truth таблиц, задача 000058; без data-модуля
// гард деградирует до fallback-литералов, см. ниже), items-data.js
// (каталог предметов — tier записей «руда», 000157.02; без data-модуля
// мягкий путь: «предмет» не валидируется, tier = 1, без console.*).

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./perlin.js'), require('./map.js'),
      require('./global-settings.js'), require('./dungeons-data.js'),
      require('./items-data.js').ITEMS, require('./loot-equip-data.js'));
  } else {
    root.Game = Object.assign({}, root.Game,
      factory(typeof root.Game === 'object' ? root.Game : {}, root.Game,
        root.Game && root.Game.GlobalSettings,
        root.Game && root.Game.DungeonsData,
        root.Game && root.Game.ITEMS,
        (root.Game && root.Game.LootEquipData) || null));
  }
})(typeof globalThis !== 'undefined' ? globalThis : self,
  function (perlin, mapmod, settings, dungeonsData, itemsData,
            lootEquipData) {

  const mulberry32 = perlin.mulberry32;
  const hash2 = perlin.hash2;
  const createPerlin2D = perlin.createPerlin2D;
  const GLOBAL_SEED = mapmod.GLOBAL_SEED;
  const TERRAIN = mapmod.TERRAIN;

  // 000157.02: редкость записей «руда» — tier предмета из каталога
  // assets/items (000157.01; отсутствие tier = 1). node —
  // require('./items-data.js').ITEMS (массив), browser — Game.ITEMS
  // (items-data.js в index.html ДО dungeon.js). Без каталога (vm-
  // песочницы без items-data) — HAVE_ITEMS = false: «предмет» записей
  // НЕ валидируется (soft), tier любого предмета = 1 (depth-1 даёт
  // добычу). НИКАКИХ console.* на load — в песочницах без console
  // это ReferenceError (LOC-11).
  const HAVE_ITEMS = Array.isArray(itemsData) && itemsData.length > 0;
  const ITEM_TIER = {};
  for (const it of (HAVE_ITEMS ? itemsData : [])) {
    if (it && typeof it.id === 'string') ITEM_TIER[it.id] = it.tier || 1;
  }

  const CELL_WALL = 0;
  const CELL_FLOOR = 1;

  // Типы подземелий (spec/buildings.md «Входы в пещеры»). Перенумерации НЕТ:
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
        'stone_fist_grimoire', 'frost_bolt_scroll',
        'ice_lance_scroll', 'rime_bolt_scroll', 'hail_scroll',
        'shatter_scroll', 'glacial_spike_scroll', 'permafrost_scroll',
        'absolute_zero_scroll', 'ice_field_scroll', 'wall_of_ice_scroll',
        'blizzard_field_scroll', 'frost_aura_scroll', 'ice_armor_scroll',
        'winter_haste_scroll', 'frostbite_blessing_scroll', 'slow_scroll',
        'frostbite_scroll', 'arctic_touch_scroll', 'deep_freeze_scroll',
        'freeze_scroll', 'glacier_grasp_scroll', 'frost_wisp_scroll',
        'winter_elemental_scroll', 'frost_walk_scroll',
        'cold_breath_scroll', 'frozen_stillness_scroll'],
      размер: 25,
      постройка: 31,
      объекты_стен: ['rock', 'stalactite'],
      руда: [
        { предмет: 'iron_ore', вид: 'руда' },
        { предмет: 'copper_ore', вид: 'руда' },
        { предмет: 'coal', вид: 'минерал' },
        { предмет: 'stone_chunk', вид: 'минерал' },
        { предмет: 'silver_ore', вид: 'руда' },
        { предмет: 'quartz', вид: 'минерал' },
        { предмет: 'obsidian', вид: 'минерал' },
        { предмет: 'gold_ore', вид: 'руда' },
        { предмет: 'phosphorite', вид: 'минерал' },
        { предмет: 'herb_healing', вид: 'минерал' },
      ],
    },
    {
      id: DUNGEON_TYPES.CRYPT,
      название: 'склеп',
      мобы: ['skeleton', 'skeleton_archer', 'rot', 'vampire', 'bone_coloss'],
      предметы: ['alchemy_manual', 'chainmail', 'mana_potion',
        'meditation_scroll', 'chill_scroll', 'light_heal_scroll',
        'blueprint_alchemy', 'blueprint_carving',
        'umbra_bolt_scroll', 'drain_life_scroll', 'void_arrow_scroll',
        'night_strike_scroll', 'soul_drain_scroll', 'shadowflame_scroll',
        'dark_nova_scroll', 'shroud_scroll', 'night_blade_scroll',
        'vampire_touch_scroll', 'fear_scroll', 'doom_mark_scroll',
        'despair_scroll', 'shadow_curse_scroll', 'shadow_bind_scroll',
        'nightmare_scroll', 'dark_ensnare_scroll', 'shadow_pool_scroll',
        'veil_of_night_scroll', 'shadow_wraith_scroll',
        'void_horror_scroll', 'shadow_step_scroll', 'invisibility_scroll',
        'shroud_of_night_scroll', 'dark_presence_scroll',
        'radiant_heal_scroll', 'life_bloom_scroll', 'purify_scroll',
        'mass_heal_scroll', 'holy_mending_scroll', 'mass_holy_light_scroll',
        'regeneration_scroll', 'blessing_scroll', 'divine_favor_scroll',
        'guardian_blessing_scroll', 'swift_prayer_scroll', 'faith_shield_scroll',
        'smite_scroll', 'unholy_wrath_scroll', 'stun_of_light_scroll',
        'holy_bind_scroll', 'light_sprite_scroll', 'spirit_healer_scroll',
        'holy_guardian_scroll', 'circle_of_light_scroll', 'holy_ground_scroll',
        'prayer_scroll', 'divine_protection_scroll', 'holy_light_scroll',
        'miracle_scroll'],
      размер: 27,
      постройка: 32,
      объекты_стен: ['column', 'rock'],
      руда: [
        { предмет: 'stone_chunk', вид: 'минерал' },
        { предмет: 'quartz', вид: 'минерал' },
        { предмет: 'obsidian', вид: 'минерал' },
        { предмет: 'amethyst', вид: 'самоцвет' },
        { предмет: 'phosphorite', вид: 'минерал' },
        { предмет: 'sapphire', вид: 'самоцвет' },
        { предмет: 'herb_mana', вид: 'минерал' },
      ],
    },
    {
      id: DUNGEON_TYPES.RUINS,
      название: 'руины замка',
      мобы: ['orc_warrior', 'orc_archer', 'wolf', 'troll', 'skeleton'],
      предметы: ['steel_sword', 'knight_plate', 'war_hammer',
        'iron_hide_tome', 'fireball_scroll', 'vine_scroll',
        'blueprint_forge', 'blueprint_woodwork',
        'ember_scroll', 'ignite_scroll', 'fire_nova_scroll',
        'lava_burst_scroll', 'meteor_scroll', 'flame_strike_scroll',
        'hellfire_scroll', 'phlogiston_blast_scroll',
        'burning_ground_scroll', 'wall_of_fire_scroll',
        'burning_haze_scroll', 'blazing_speed_scroll', 'fire_aura_scroll',
        'heat_shield_scroll', 'sunfire_scroll', 'scorch_scroll',
        'cinder_scroll', 'ashen_debilitation_scroll', 'lava_snare_scroll',
        'burning_cage_scroll', 'flame_imp_scroll', 'phoenix_scroll',
        'firelight_scroll', 'hearthfire_scroll', 'flame_step_scroll'],
      размер: 31,
      постройка: 33,
      объекты_стен: ['column'],
      руда: [
        { предмет: 'iron_ore', вид: 'руда' },
        { предмет: 'copper_ore', вид: 'руда' },
        { предмет: 'coal', вид: 'минерал' },
        { предмет: 'silver_ore', вид: 'руда' },
        { предмет: 'quartz', вид: 'минерал' },
        { предмет: 'gold_ore', вид: 'руда' },
        { предмет: 'ruby', вид: 'самоцвет' },
        { предмет: 'wood_log', вид: 'минерал' },
        { предмет: 'hide', вид: 'минерал' },
      ],
    },
    {
      id: DUNGEON_TYPES.DROWNED,
      название: 'затопленная пещера',
      мобы: ['water_elemental', 'scorpion', 'spider', 'imp'],
      предметы: ['mana_elixir', 'hunting_bow', 'moonstone',
        'nature_scroll', 'magic_shield_scroll', 'blueprint_runecraft'],
      размер: 27,
      постройка: 34,
      объекты_стен: ['rock'],
      руда: [
        { предмет: 'sulfur', вид: 'минерал' },
        { предмет: 'stone_chunk', вид: 'минерал' },
        { предмет: 'quartz', вид: 'минерал' },
        { предмет: 'silver_ore', вид: 'руда' },
        { предмет: 'emerald', вид: 'самоцвет' },
        { предмет: 'sapphire', вид: 'самоцвет' },
        { предмет: 'phosphorite', вид: 'минерал' },
        { предмет: 'herb_bitter', вид: 'минерал' },
      ],
    },
    {
      id: DUNGEON_TYPES.ABYSS,
      название: 'бездна',
      мобы: ['lower_demon', 'succubus', 'abomination'],
      предметы: ['war_hammer', 'phoenix_feather', 'greater_healing',
        'heavy_tome', 'fire_spellbook', 'flame_burst_scroll',
        'blizzard_scroll', 'blueprint_enchant'],
      размер: 35,
      постройка: 35,
      объекты_стен: ['stalactite', 'rock'],
      руда: [
        { предмет: 'stone_chunk', вид: 'минерал' },
        { предмет: 'obsidian', вид: 'минерал' },
        { предмет: 'amethyst', вид: 'самоцвет' },
        { предмет: 'ruby', вид: 'самоцвет' },
        { предмет: 'gold_ore', вид: 'руда' },
        { предмет: 'phosphorite', вид: 'минерал' },
        { предмет: 'mithril_ore', вид: 'руда' },
        { предмет: 'diamond', вид: 'самоцвет' },
      ],
    },
  ];

  /**
   * Каталог валиден: 5 записей, id 0..4, строки/списки/целые на месте.
   * 000157.02: + опциональное поле «руда» (minItems 1, запись
   * {предмет, вид}; «вид» — enum всегда; «предмет» ∈ каталогу
   * предметов — только при HAVE_ITEMS: vm-цепи без items-data
   * остаются валидными).
   */
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
      Array.isArray(r.объекты_стен) && r.объекты_стен.length > 0 &&
      (r.руда === undefined || (Array.isArray(r.руда)
        && r.руда.length >= 1 && r.руда.every((o) =>
          o && typeof o === 'object'
          && typeof o.предмет === 'string' && o.предмет.length > 0
          && (o.вид === 'руда' || o.вид === 'минерал'
            || o.вид === 'самоцвет')
          && (!HAVE_ITEMS || ITEM_TIER[o.предмет] !== undefined)))));
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
  // DUNGEON_WALL_KINDS — набор видов «непроходимых» стен типа
  // (задача 000070; 000258: автотайл кромки): rock/column/
  // stalactite, назначение на клетки — wallKindFor (сид ФОРМЫ, не
  // содержимое).
  const DUNGEON_WALL_KINDS = {};
  // DUNGEON_ORES — пул залежей типа (000157.02): записи {предмет,
  // вид} из поля «руда» каталога (порядок = JSON). Поверхностный
  // slice: записи НЕ мутируются (рендер dungeon-ui.js читает «вид»
  // по предмету — уникальность предмета в пуле закреплена тестом).
  const DUNGEON_ORES = {};
  for (const rec of CATALOG) {
    DUNGEON_NAMES[rec.id] = rec.название;
    DUNGEON_MOBS[rec.id] = rec.мобы.slice();
    DUNGEON_ITEMS[rec.id] = rec.предметы.slice();
    DUNGEON_SIZE[rec.id] = rec.размер;
    DUNGEON_WALL_KINDS[rec.id] = rec.объекты_стен.slice();
    DUNGEON_ORES[rec.id] = (rec.руда || []).slice();
  }

  // 000153.02: потолок стороны этажа. = максимум схемы «размер» 5..63
  // (assets/dungeons/schema.json) — задокументированный диапазон БАЗЫ
  // остаётся истинным; JSON не трогаем, рост глубины — ТОЛЬКО в коде
  // (dungeonSizeFor). Перформанс cap не вынуждает (измерено: W=63 →
  // ~3 мс/генерацию, W=128 → ~2.6 мс; memory/000153.02 §5) — cap =
  // дизайн-решение (согласованность со схемой).
  const DUNGEON_SIZE_CAP = 63;

  /**
   * Размер стороны этажа глубины `depth`: min(CAP, round(base·1.1^(depth−1))).
   * Чистая числовая функция (каталог-lookup — на вызове): СТОРОНА ×1.1/
   * этаж (ПЛОЩАДЬ ×1.21). depth=1 → round(base·1) = base — БИТ-В-БИТ
   * (base — целое из каталога). Math.round — half-up: 25·1.1 =
   * 27.500…0004 → 28, 35·1.1 = 38.5 → 39 (зафиксировано W-таблицей
   * tests/dungeon.test.js SZ-1).
   * @param {number} base базовый размер стороны (DUNGEON_SIZE[type], 5..63)
   * @param {number} depth целое ≥ 1 (гард createDungeon — до вызова)
   * @returns {number} сторона этажа (integer 5..DUNGEON_SIZE_CAP)
   */
  function dungeonSizeFor(base, depth) {
    const w = Math.round(base * Math.pow(1.1, depth - 1));
    return w > DUNGEON_SIZE_CAP ? DUNGEON_SIZE_CAP : w;
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

  // Тип подземелья из тайла входа (spec/buildings.md «Входы в пещеры»).
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

  // 000153.01: сид формы depth > 1 — детерминированная функция от
  // (сид формы depth=1, depth, соль), БЕЗ rng (hash2 — чистый
  // finalizer; паттерн wallKindFor — hash2 с солью). depth=1 формула
  // НЕ ТРОНУТА (бит-в-бит; формула ниже существует только в ветке
  // depth>1 createDungeon). Соль 0xd337b153 — без коллизий с
  // существующими (0xd0d6b5e5, 0x5e11, 0x7777, 0x5e11c3a7);
  // 0x9e3779b9 — штатная константа кодовой базы (mapseed.js,
  // perlin.js).
  const DEPTH_SALT = 0xd337b153;

  function dungeonDepthSeed(baseSeed, depth) {
    return (hash2(baseSeed, depth, DEPTH_SALT)
      ^ ((depth * 0x9e3779b9) >>> 0)) >>> 0;
  }

  // 000153.01: ключ dungeonMemory — worldKey ('x,y') + глубина →
  // 'x,y:depth'. Разделитель ':' — прецедент 'x,y:effectId'
  // (buildingOncePerDay); ',' сделал бы ключ неоднозначным (worldKey
  // уже содержит запятую). Единый источник формы ключа: regex —
  // охрана от битых данных в serialize/restore (старый формат 'x,y'
  // без глубины молча отбрасывается — в старых версиях раздела сейва
  // не было вовсе; миграции НЕТ).
  const DUNGEON_MEMORY_KEY_RE = /^-?\d+,-?\d+:\d+$/;

  function dungeonMemoryKey(worldKey, depth) {
    return worldKey + ':' + depth;
  }

  const idx = (d, x, y) => y * d.width + x;
  const inGrid = (d, x, y) => x >= 0 && y >= 0 && x < d.width && y < d.height;

  // --- Автотайлинг кромки стены (задачи 000070/000258) ---
  //
  // Вид стены на wall-клетке (rock/column/stalactite) —
  // детерминированная функция ТОЛЬКО (x, y, d.seed, d.type) через
  // hash2: без RNG-состояния, без обращения к cells/содержимому/
  // player. Сид — ФОРМЫ подземелья (точка входа), НЕ содержимого
  // (totalXp): «один вход — один вид», возврат с новым опытом не
  // меняет облик стен. Соль зафиксирована golden-тестом
  // (tests/dungeon.test.js, «000070 golden: CAVE (37, −12)»).
  // 000258: вариант _1/_2 УБРАН (WALL_VARIANT_SALT мёртв) — облик
  // кромки задаёт маска 4 соседей + 4 диагональных угла
  // (wallTileIndex); фасад 8-соседства (d.wallObjs) заменён
  // масочным множеством рисуемых клеток.
  const WALL_KIND_SALT = 0x5e11c3a7;

  /**
   * Маска 4 соседей wall-клетки (x, y) — чистая функция только
   * от (cells, W, H, x, y): 4 чтения + bounds, без RNG.
   * Биты: N=1 (y−1), E=2 (x+1), S=4 (y+1), W=8 (x−1);
   * бит = 1 ТОЛЬКО если сосед в границах И
   * cells[ny*W+nx] === CELL_FLOOR (ИНВЕРСИЯ кода: CELL_WALL = 0,
   * CELL_FLOOR = 1 — равенство с cities.js зафиксировано тестом).
   * За границей карты = стена (бит не ставится). Сама клетка НЕ
   * проверяется — вызователь гарантирует cells[y*W+x] === CELL_WALL.
   * @param {number[]} cells сетка (flat, индекс y*W+x)
   * @param {number} W ширина сетки
   * @param {number} H высота сетки
   * @param {number} x клетка X
   * @param {number} y клетка Y
   * @returns {number} 0..15
   */
  function wallMask(cells, W, H, x, y) {
    let m = 0;
    if (y > 0 && cells[(y - 1) * W + x] === CELL_FLOOR) m |= 1; // N
    if (x < W - 1 && cells[y * W + x + 1] === CELL_FLOOR) m |= 2; // E
    if (y < H - 1 && cells[(y + 1) * W + x] === CELL_FLOOR) m |= 4; // S
    if (x > 0 && cells[y * W + x - 1] === CELL_FLOOR) m |= 8; // W
    return m;
  }

  /**
   * Индекс краевой плитки wall-клетки (x, y) — 0..19 (контракт
   * WALL_AUTOTILE_NAMES, sprites.js): 0..15 = маска 4 соседей,
   * 16..19 = углы (SE=0, SW=1, NE=2, NW=3 — по клетке (x+1,y+1),
   * (x−1,y+1), (x+1,y−1), (x−1,y−1)).
   * m ≠ 0 → m (диагонали игнорируются); m = 0 и ровно ОДИН
   * диагональный FLOOR-сосед → 16+k; иначе (0 или ≥2 диагонали —
   * внутренний угол L-коридора) → 0 (кромки нет: город — m00-
   * плитка сплошной стены, подземелье — фон).
   * @param {number[]} cells сетка (flat, индекс y*W+x)
   * @param {number} W ширина сетки
   * @param {number} H высота сетки
   * @param {number} x клетка X
   * @param {number} y клетка Y
   * @returns {number} 0..19
   */
  function wallTileIndex(cells, W, H, x, y) {
    const m = wallMask(cells, W, H, x, y);
    if (m !== 0) return m;
    let k = -1, n = 0;
    const diag = (dx, dy, kk) => {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) return;
      if (cells[ny * W + nx] === CELL_FLOOR) { n++; if (n === 1) k = kk; }
    };
    diag(1, 1, 0);  // SE
    diag(-1, 1, 1); // SW
    diag(1, -1, 2); // NE
    diag(-1, -1, 3); // NW
    if (n === 1) return 16 + k;
    return 0;
  }

  /**
   * Вид стены в клетке (x, y) — ЧИСТАЯ функция от (x, y, d.seed,
   * d.type) (kind-часть бывшего wallObjFor 000070, дословно:
   * hash2 + WALL_KIND_SALT + каталог DUNGEON_WALL_KINDS). d —
   * объект с полями seed и type (достаточно `{type, seed}`;
   * cells/содержимое не читаются).
   * @param {number} x клетка X
   * @param {number} y клетка Y
   * @param {{seed:number, type:number}} d подземелье
   * @returns {string|null} 'rock'|'column'|'stalactite'
   *   (null, если у типа нет набора объектов_стен)
   */
  function wallKindFor(x, y, d) {
    const kinds = DUNGEON_WALL_KINDS[d.type];
    if (!kinds || kinds.length === 0) return null;
    return kinds[hash2(x, y, WALL_KIND_SALT ^ d.seed) % kinds.length];
  }

  // 000153.02: stairs-down — детерминированное размещение клетки спуска
  // БЕЗ rng (паттерн wallKindFor: hash2 + соль; «один вход — один вид»).
  // Соль 0x53d10d53 — без коллизий с существующими (0xd0d6b5e5 форма,
  // 0xd337b153 глубина, 0x5e11 контент, 0x7777 wander, 0x5e11c3a7
  // стены) и с in-flight 0x0DE5 (депозиты 000157.02) — закреплено
  // tests/dungeon.test.js ST-1.
  const STAIRS_SALT = 0x53d10d53;

  // 000230.05: редкость лута экипировки из сундуков — СВОЙ rng-поток
  // mulberry32(hash2(seed, depth, 0x0E5C) >>> 0) (паттерн 000157.02,
  // блок ПОСЛЕ залежей). Соль 0x0E5C — без коллизий с ВСЕМИ 0x-
  // константами src/* (решение D6; ORE-7: смена = репин всей зоны —
  // пин CH1: export + текст-пин литерала).
  const CHEST_EQ_SALT = 0x0E5C;

  /**
   * BFS-дистанции (4-соседство) от (sx, sy) по FLOOR-клеткам.
   * ВНУТРЕННИЙ хелпер (не экспортируется): порядок обхода
   * [[1,0],[-1,0],[0,1],[0,-1]] — ТОТ ЖЕ, что в reachableFrom
   * (не Чебышёв). @returns {Map<string, number>} 'x,y' → дистанция
   */
  function bfsDistances(d, sx, sy) {
    const dist = new Map();
    if (d.cells[idx(d, sx, sy)] !== CELL_FLOOR) return dist;
    dist.set(sx + ',' + sy, 0);
    const queue = [[sx, sy]];
    while (queue.length) {
      const [x, y] = queue.shift();
      const dd = dist.get(x + ',' + y);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        const k = nx + ',' + ny;
        if (!inGrid(d, nx, ny) || dist.has(k)) continue;
        if (d.cells[idx(d, nx, ny)] !== CELL_FLOOR) continue;
        dist.set(k, dd + 1);
        queue.push([nx, ny]);
      }
    }
    return dist;
  }

  /**
   * Клетка stairs-down (спуск на этажи ниже) — чистая функция от ФОРМЫ
   * (d.cells/rooms/entrance/exit/type/seed), БЕЗ вызовов rng. Правило:
   * среди достижимых от entrance FLOOR-клеток, исключая 5×5 safe-блоки
   * entrance/exit и клетку босса ABYSS (rooms[last], 000183), выбирается
   * МАКСИМАЛЬНО ДАЛЬНЯЯ (BFS-дистанция) — спуск в «конце» этажа; тай —
   * min hash2(x, y, STAIRS_SALT ^ d.seed); финальный тай — min (y·W+x).
   * Fail-open: кандидатов нет (все достижимые клетки в safe/босс) →
   * все достижимые FLOOR; всё равно нет → null. В реальных формах
   * (5–8 комнат 4×4 + коридоры ≫ 25 safe-клеток + 1 босс-клетка)
   * null недостижим; ПОТРЕБИТЕЛИ (000153.03) всё равно гвардят null.
   * @param {object} d результат createDungeon (до cells достаточно)
   * @returns {{x:number, y:number}|null}
   */
  function stairsDownFor(d) {
    const dist = bfsDistances(d, d.entrance.x, d.entrance.y);
    const safeCells = new Set();
    for (const [cx, cy] of [[d.entrance.x, d.entrance.y], [d.exit.x, d.exit.y]]) {
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        safeCells.add((cx + dx) + ',' + (cy + dy));
      }
    }
    const far = d.rooms[d.rooms.length - 1];
    const bossKey = (d.type === DUNGEON_TYPES.ABYSS)
      ? far.cx + ',' + far.cy : null;
    let best = null;
    const consider = (x, y, k) => {
      const cand = {
        x, y,
        dist: dist.get(k),
        h: hash2(x, y, STAIRS_SALT ^ d.seed),
        i: y * d.width + x,
      };
      if (!best) { best = cand; return; }
      if (cand.dist !== best.dist) { if (cand.dist > best.dist) best = cand; return; }
      if (cand.h !== best.h) { if (cand.h < best.h) best = cand; return; }
      if (cand.i < best.i) best = cand;
    };
    for (const k of dist.keys()) {
      if (safeCells.has(k)) continue;
      if (bossKey && k === bossKey) continue;
      const [x, y] = k.split(',').map(Number);
      consider(x, y, k);
    }
    if (!best) {
      for (const k of dist.keys()) {
        const [x, y] = k.split(',').map(Number);
        consider(x, y, k);
      }
    }
    return best ? { x: best.x, y: best.y } : null;
  }

  /**
   * Генерирует лабиринт по точке входа.
   * @param {number} x координата входа на основной карте
   * @param {number} y координата входа
   * @param {{width:number, height:number, data:ArrayBuffer|Uint8Array}} pixels
   *   пиксели assets/map.png (та же затравка, что и у карты мира)
   * @param {number} terrain тип местности тайла входа (TERRAIN из map.js)
   * @param {number} [depth=1] глубина (000153.01): целое ≥ 1, ПЕРВЫЙ
   *   ЭТАЖ = 1; невалидное — fail-open-кламп к 1 (молча: enterLocation
   *   не обёрнут в try/catch — throw упал бы на игрока, 000029)
   * @returns {{
   *   type:number, width:number, height:number, depth:number,
   *   cells:number[], rooms:{x,y,w,h,cx,cy}[],
   *   entrance:{x,y}, exit:{x,y}, seed:number,
   *   stairsDown:{x:number, y:number}|null,
   * }}
   * Стены НЕ предвычисляются (000258: фасад 8-соседства d.wallObjs
   * 000070 УБРАН — рисуемое множество = wall-клетки с wallTileIndex
   * ≠ 0, чистая функция от cells на кадр; вид — wallKindFor).
   * `stairsDown` (000153.02) — клетка спуска на нижний этаж, ПОЛЕ
   * ФОРМЫ (stairsDownFor: детерминировано, 0 rng): на FLOOR,
   * достижима от entrance, вне 5×5 safe-зон entrance/exit; ABYSS —
   * ≠ клетка босса (rooms[last]). null — только дегенеративные формы
   * (fail-open; потребители 000153.03 гвардят).
   */
  function createDungeon(x, y, pixels, terrain, depth = 1) {
    // 000153.01: fail-open-гард (не throw — см. JSDoc). Ядро не
    // логирует: невалидное значение просто становится первым этажом.
    if (!Number.isInteger(depth) || depth < 1) depth = 1;
    const type = dungeonTypeFor(terrain, pixelAt(pixels, x, y)[3]);
    // dungeonShapeSeed — ровно ОДИН вызов (число вызовов не меняется):
    // depth=1 — старая формула БИТ-В-БИТ; depth>1 — сид per-глубина
    // (dungeonDepthSeed, без новых вызовов rng).
    const baseSeed = dungeonShapeSeed(x, y, pixels);
    const seed = depth === 1 ? baseSeed : dungeonDepthSeed(baseSeed, depth);
    const rng = mulberry32(seed);

    // 000153.02: сторона растёт с глубиной (dungeonSizeFor: base·1.1^(depth−1),
    // cap DUNGEON_SIZE_CAP). depth=1 → round(base·1) = base — БИТ-В-БИТ
    // (существующие goldens без правок; число вызовов rng не меняется).
    const W = dungeonSizeFor(DUNGEON_SIZE[type], depth);
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
      // 000177: ОДИН тайл = вход и выход (центр ПЕРВОЙ комнаты;
      // deepEqual-инвариант d.exit === d.entrance — потребители:
      // __game.dungeon, HUD «До выхода», [E]-контракт). Форма
      // подземелья от этого НЕ зависит: 0 новых вызовов rng —
      // cells/rooms бит-в-бит как до 000177.
      entrance: { x: rooms[0].cx, y: rooms[0].cy },
      exit: { x: rooms[0].cx, y: rooms[0].cy },
      seed,
      // 000153.01: текущая глубина (целое ≥ 1, первый этаж = 1).
      // Additive: контент depth=1 от поля не зависит (0 новых вызовов
      // rng в createDungeon/generateDungeonContents).
      depth,
    };

    // 000153.02: stairs-down — поле ФОРМЫ (детерминировано, 0 rng —
    // rng-потоки createDungeon/generateDungeonContents не сдвинуты).
    // Контент depth=1 от поля не зависит (additive).
    d.stairsDown = stairsDownFor(d);
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
   * @param {object} [opts]
   * @param {number} [opts.depth] глубина этажа (000153; default 1 —
   *   КОДОВОЙ зависимости от 000153 НЕТ: подключение реального
   *   d.depth — в точке вызова locations.js)
   * @returns {{
   *   seed:number,
   *   mobs:{id:string, mobIds:string[], x:number, y:number, level:number, defeated:boolean}[],
   *   chests:{id:string, x:number, y:number, opened:boolean, gold:number, item:string|null}[],
   *   deposits:{id:string, x:number, y:number, item:string, amount:number, gathered:boolean}[],
   *   createdAtXp:number,
   * }}
   * `chests[].item` — id предмета из каталога assets/items (или null).
   * `deposits` (000157.02) — залежи руды/минералов/самоцветов: пул
   * DUNGEON_ORES[d.type], свой rng-поток ПОСЛЕ цикла сундуков
   * (главный rng — ноль новых вызовов — goldens бит-в-бит).
   */
  function generateDungeonContents(d, player, opts = {}) {
    const depth = Math.max(1, opts.depth | 0);
    const seed = (hash2(player.totalXp, d.seed, 0x5e11) ^ (player.totalXp * 2654435761)) >>> 0;
    const rng = mulberry32(seed);
    const table = DUNGEON_MOBS[d.type];
    const items = DUNGEON_ITEMS[d.type];
    // 000099: ОДНО live-чтение на генерацию (детерминизм: одна
    // значимость и для мобов, и для босса; порядок вызовов rng() не
    // меняется — замена константы на локальную переменную).
    const delta = liveLevelDeltaMax();
    // 000153.02: сдвиг БАЗЫ уровня на глубину (константа, 0 rng;
    // depth=1: player.level + 0 === player.level — тождество, формулы
    // свёрнуты бит-в-бит).
    const effLevel = player.level + (d.depth - 1);

    // Входная комната остаётся безопасной (000177: выход — тот же
    // тайл, что вход: Set дедуплицирует две одинаковые точки →
    // ОДИН 5×5-блок; цикл не меняется — форма safe не изменилась).
    // 000183: клетка босса (ABYSS, дальняя комната) дополнительно
    // исключена из спавна через occupied — см. ниже (регрессия 000177:
    // safe-зона переехала из дальней комнаты с боссом в комнаты входа).
    const safe = new Set();
    for (const [cx, cy] of [[d.entrance.x, d.entrance.y], [d.exit.x, d.exit.y]]) {
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) safe.add((cx + dx) + ',' + (cy + dy));
    }
    // 000153.02: depth>1 — safe-зона расширяется на 5×5 вокруг
    // stairs-down (клетка спуска свободна от мобов/сундуков — тот же
    // паттерн 5×5, что entrance/exit). ТОЛЬКО depth>1: на depth=1
    // расширение сдвинуло бы takeSpot → сломало бы бит-в-бит goldens.
    if (d.depth > 1 && d.stairsDown) {
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        safe.add((d.stairsDown.x + dx) + ',' + (d.stairsDown.y + dy));
      }
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
    // 000153.02: уровни групп = effLevel ± δ (сдвиг БАЗЫ; depth=1 —
    // старая формула бит-в-бит; число вызовов rng не меняется).
    const mobLevel = () => Math.max(1, effLevel + Math.floor(rng() * (2 * delta + 1)) - delta);

    // 000183: клетка босса ABYSS — не точка спавна для блуждающих групп и
    // сундуков (wanderStep уже не пускает группы на занятую клетку босса —
    // taken-сет; асимметрия генерации — регрессия 000177, когда safe-зона
    // 5×5 переехала из дальней комнаты с боссом в комнаты входа-выхода).
    // До первого takeSpot: 1 Set.add, 0 новых вызовов rng; guard по типу
    // — все не-ABYSS подземелья бит-в-бит неизменны.
    const far = d.rooms[d.rooms.length - 1];
    if (d.type === DUNGEON_TYPES.ABYSS) {
      occupied.add(far.cx + ',' + far.cy);
    }

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
      const s = [far.cx, far.cy];
      mobs.push({
        id: 'boss',
        mobIds: ['abomination', 'lower_demon', 'lower_demon'],
        x: s[0], y: s[1],
        // 000153.02: босс = effLevel + δ (сдвиг БАЗЫ; depth=1 — старая
        // формула бит-в-бит, 000183 D-BOSS).
        level: Math.max(1, effLevel + delta),
        defeated: false,
        boss: true,
      });
    }

    // Сундуки: 2-5 (+1/этаж, 000153.02: + (depth−1) — лут растёт с
    // глубиной; depth=1 — старая формула бит-в-бит), золото растёт с
    // эффективным уровнем, шанс предмета.
    const T_ = Math.min(4, 1 + Math.floor((depth - 1) / 2));
    const elig_ = items.filter((id) => (ITEM_TIER[id] || 1) <= T_);
    const pool_ = elig_.length ? elig_ : items;
    const chests = [];
    const nChests = 2 + Math.floor(rng() * 4) + (d.depth - 1);
    for (let i = 0; i < nChests; i++) {
      const s = takeSpot();
      if (!s) break;
      const gold = Math.round(10 + rng() * 20 * (1 + effLevel * 0.2));
      const item = rng() < CHEST_ITEM_CHANCE ? pool_[Math.floor(rng() * pool_.length)] : null;
      chests.push({ id: 'c' + i, x: s[0], y: s[1], opened: false, gold, item });
    }

    // Залежи (000157.02): СТРОГО ПОСЛЕ цикла сундуков. Главный rng —
    // НОЛЬ новых вызовов (существующие goldens seed/mobs/chests —
    // бит-в-бит). СВОЙ поток: mulberry32(hash2(seed, depth, 0x0DE5))
    // — соль 0x0DE5 ЗАПИНЕНА (ORE-7: смена = репин всей зоны). Клетка
    // — СОБСТВЕННЫЙ takeSpot-клёшер на rng_dep + ОБЩИЙ occupied:
    // взаимоисключение с мобами/сундуками/босс-клеткой БЕСПЛАТНО
    // (паттерн 000183); безопасная зона 5×5 недоступна (spots уже
    // без неё). Guard: нет «руда» ИЛИ нет записей с tier ≤ T →
    // deposits = [] (защитный путь; с текущими данными не
    // срабатывает — у каждого пула T1).
    // Формулы (числа — здесь и в тестах, в SPEC — только связки):
    //   nDeposits = 1 + min(3, floor(depth/3))  → D1-2:1, D3-5:2,
    //     D6-8:3, D9+:4;
    //   T = min(1 + floor((depth-1)/2), 4)      → D1-2:T1, D3-4:T2,
    //     D5-6:T3, D7+:T4 (шкала 000153 «+1 уровень за глубину»,
    //     tier растёт вдвое медленнее — осознанный дизайн);
    //   amount = 1 + floor(rng_dep()*2) + min(2, floor(depth/4))
    //     → 1..4 (5 недостижимо).
    const deposits = [];
    {
      const pool = DUNGEON_ORES[d.type] || [];
      const T = Math.min(1 + Math.floor((depth - 1) / 2), 4);
      const elig = pool.filter(o => (ITEM_TIER[o.предмет] || 1) <= T);
      if (pool.length > 0 && elig.length > 0) {
        const rng_dep = mulberry32(hash2(seed, depth, 0x0DE5) >>> 0);
        const takeSpotDep = () => {
          for (let i = 0; i < 200; i++) {
            const [x, y] = spots[Math.floor(rng_dep() * spots.length)];
            const k = x + ',' + y;
            if (!occupied.has(k)) { occupied.add(k); return [x, y]; }
          }
          return null;
        };
        const nDeposits = 1 + Math.min(3, Math.floor(depth / 3));
        for (let i = 0; i < nDeposits; i++) {
          // Порядок вызовов rng_dep НА ЗАЛЕЖЬ: предмет → количество
          // → клетка (takeSpotDep ≥1 вызов, при успехе ровно 1) —
          // ЗАПИНЕН (ORE-7).
          const rec = elig[Math.floor(rng_dep() * elig.length)];
          const amt = 1 + Math.floor(rng_dep() * 2)
            + Math.min(2, Math.floor(depth / 4));
          const s = takeSpotDep();
          if (!s) break;
          deposits.push({
            id: 'd' + i, x: s[0], y: s[1],
            item: rec.предмет, amount: amt, gathered: false,
          });
        }
      }
    }

    // Редкость лута экипировки из сундуков (задача 000230.05,
    // контракт memory/000230.05-loot-rarity.md §3.3): предмет с
    // ЯВНЫМ slot (it.slot !== undefined — решение 10; расходники
    // и legacy без slot — без изменений) → ролл редкости
    // (50/30/15/4.9/0.1, данные модуля) → замена ch.item на
    // предмет тир-пула. СВОЙ rng-поток mulberry32(hash2(seed,
    // depth, CHEST_EQ_SALT) >>> 0) — паттерн 000157.02: блок
    // ПОСЛЕ залежей (правило «новые механики — ПОСЛЕ залежей»),
    // вызовы строго по порядку сундуков c0..cN, ТОЛЬКО
    // триггернутые (item непусто И slot явный): 1 (tier) +
    // 1 (select, только если тир-пул не пуст). Главный rng /
    // occupied / spots / gold / mobs — НЕ ТРОГАЮТСЯ (goldens
    // seed/mobs/chests бит-в-бит). Guard ДО ЛЮБОГО вызова rng:
    // пустой пул (000230.05) → 0 вызовов. Замена IN-PLACE:
    // НОВЫХ КЛЮЧЕЙ В ОБЪЕКТЕ СУНДУКА НЕТ (сериализатор save.js
    // {id,x,y,opened,gold,item} держит). Редкость предмета НЕ
    // храним — определяется каталогом (000230.01/.02).
    {
      const eqOk = lootEquipData && Array.isArray(lootEquipData.RARITY)
        && lootEquipData.EQUIP_POOLS
        && typeof lootEquipData.pickRarityTier === 'function';
      const eqTotal = eqOk
        ? lootEquipData.RARITY.reduce(
            (s, t) => s + ((lootEquipData.EQUIP_POOLS[t.id] || []).length), 0)
        : 0;
      if (eqTotal > 0) {
        const rng_eq = mulberry32(hash2(seed, depth, CHEST_EQ_SALT) >>> 0);
        for (const ch of chests) {
          if (!ch.item) continue;
          const it = Array.isArray(itemsData)
            ? itemsData.find((x) => x && x.id === ch.item)
            : undefined;
          if (!it || it.slot === undefined) continue;
          const tier = lootEquipData.pickRarityTier(rng_eq);
          const pool = lootEquipData.EQUIP_POOLS[tier] || [];
          if (pool.length)
            ch.item = pool[Math.floor(rng_eq() * pool.length)];
        }
      }
    }

    return {
      seed,
      mobs,
      chests,
      deposits,
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

  // --- Сериализация памяти подземелий (задача 000153.01) ---
  //
  // Неломный топ-раздел сейва dungeonMemory: ключ 'x,y:depth' →
  // { contents, lastVisitDay, pos? }. Чистые функции (без доступа к
  // Game) — паттерн serialize/restoreCityStates (cities.js): доступны
  // из node-тестов напрямую; main.js — тонкая проводка + guards.
  // Валидаторы возвращают ГЛУБОКИЕ КОПИИ (паттерн validateCityState)
  // — после restore мутации live-контента не касаются объекта сейва.

  /**
   * Валидация содержимого этажа: ЧИСТАЯ глубокая копия результата
   * generateDungeonContents. Поля — ровно те, что генерирует ядро
   * (лишних ключей в копии НЕТ — golden deepEqual-контракт).
   * Нарушение (не-объект/массив, битые числа, не-строки id, gold < 0)
   * → null (запись отбрасывается тихо — ядро не логирует).
   * @returns {{seed:number, createdAtXp:number, step:number,
   *   mobs:object[], chests:object[], deposits?:object[]}|null}
   */
  function validateDungeonContents(contents) {
    if (!contents || typeof contents !== 'object' || Array.isArray(contents)) {
      return null;
    }
    const { seed, createdAtXp, step, mobs, chests } = contents;
    if (!Number.isInteger(seed) || seed < 0) return null;
    if (!Number.isInteger(createdAtXp) || createdAtXp < 0) return null;
    if (!Number.isInteger(step) || step < 0) return null;
    if (!Array.isArray(mobs) || !Array.isArray(chests)) return null;
    const mobsOut = [];
    for (const m of mobs) {
      if (!m || typeof m !== 'object' || Array.isArray(m)) return null;
      if (typeof m.id !== 'string' || !Array.isArray(m.mobIds)) return null;
      if (!m.mobIds.every((x) => typeof x === 'string')) return null;
      if (!Number.isInteger(m.x) || !Number.isInteger(m.y)) return null;
      if (!Number.isInteger(m.level) || m.level < 1) return null;
      if (typeof m.defeated !== 'boolean') return null;
      const mo = {
        id: m.id, mobIds: m.mobIds.slice(), x: m.x, y: m.y,
        level: m.level, defeated: m.defeated,
      };
      // boss — опциональное поле (ABYSS): присутствие/отсутствие
      // сохраняется как есть (лишних ключей — не создавать).
      if (m.boss !== undefined) {
        if (typeof m.boss !== 'boolean') return null;
        mo.boss = m.boss;
      }
      mobsOut.push(mo);
    }
    const chestsOut = [];
    for (const c of chests) {
      if (!c || typeof c !== 'object' || Array.isArray(c)) return null;
      if (typeof c.id !== 'string') return null;
      if (!Number.isInteger(c.x) || !Number.isInteger(c.y)) return null;
      if (typeof c.opened !== 'boolean') return null;
      if (!Number.isInteger(c.gold) || c.gold < 0) return null;
      if (c.item !== null && typeof c.item !== 'string') return null;
      chestsOut.push({
        id: c.id, x: c.x, y: c.y,
        opened: c.opened, gold: c.gold, item: c.item,
      });
    }
    // 000157.03: deposits — ОПЦИОНАЛЬНОЕ поле (паттерн boss в mobs):
    // присутствие/отсутствие сохраняется как есть — в копии ключа НЕТ
    // (старые записи/сейвы без залежей валидны; лишних ключей — не
    // создавать). Глубокая копия {id, x, y, item, amount, gathered}:
    // собранность персистирует ПРАВО как opened (SPEC dungeons-storage;
    // версия сейва НЕ повышается). Битое поле → null (запись
    // отбрасывается тихо).
    let depositsOut = null;
    if (contents.deposits !== undefined) {
      if (!Array.isArray(contents.deposits)) return null;
      depositsOut = [];
      for (const dp of contents.deposits) {
        if (!dp || typeof dp !== 'object' || Array.isArray(dp)) return null;
        if (typeof dp.id !== 'string' || !dp.id) return null;
        if (!Number.isInteger(dp.x) || !Number.isInteger(dp.y)) return null;
        if (typeof dp.item !== 'string' || !dp.item) return null;
        if (!Number.isInteger(dp.amount) || dp.amount < 1) return null;
        if (typeof dp.gathered !== 'boolean') return null;
        depositsOut.push({
          id: dp.id, x: dp.x, y: dp.y,
          item: dp.item, amount: dp.amount, gathered: dp.gathered,
        });
      }
    }
    const out = { seed, createdAtXp, step, mobs: mobsOut, chests: chestsOut };
    if (depositsOut) out.deposits = depositsOut;
    return out;
  }

  // Запись раздела: { contents (валидный), lastVisitDay: int ≥ 1,
  // pos? {x,y: int ≥ 0} } в окне памяти: lastVisitDay ≤ day (будущее
  // — отброс) И contentValid (day − last ≤ memoryDays — валидно).
  // СЕМАНТИКА ОКНА НЕ ПУТАТЬ с cities.js (там day − last ≥ respawnDays
  // → отброс — респаун, а не память). pos без проверки границ
  // (размер подземелья на стороне re-anchor). Чистая копия; null —
  // запись отбрасывается.
  function validateDungeonMemoryRec(rec, day, memoryDays) {
    if (!rec || typeof rec !== 'object' || Array.isArray(rec)) return null;
    const last = rec.lastVisitDay;
    if (!Number.isInteger(last) || last < 1) return null;
    if (last > day) return null;
    if (!contentValid(last, day, memoryDays)) return null;
    const contents = validateDungeonContents(rec.contents);
    if (!contents) return null;
    const out = { contents, lastVisitDay: last };
    const p = rec.pos;
    if (p && typeof p === 'object' && !Array.isArray(p) &&
        Number.isInteger(p.x) && Number.isInteger(p.y) &&
        p.x >= 0 && p.y >= 0) {
      out.pos = { x: p.x, y: p.y };
    }
    return out;
  }

  /**
   * Живое состояние (Map) или plain-объект → JSON-объект раздела
   * (копии; НЕ мутирует вход). Принимает Map (main.js) и plain-объект
   * (roundtrip-тесты); не-объект/массив → {}.
   * ОБРЕЗКА: ключ не по DUNGEON_MEMORY_KEY_RE, lastVisitDay вне
   * [1, day] и вне окна contentValid, битый contents — отброс
   * (тихо). activeRec (не null) — merge «активный поверх»: своя key
   * пишется/перезаписывается (in-flight-содержимое первого входа —
   * запись в Map ещё не создана, fix re-loot).
   * @param {Map|object} memory
   * @param {number} day текущий день мира
   * @param {number} memoryDays dungeon_memory_days
   * @param {?{key:string, contents:object, lastVisitDay:number,
   *   pos?:{x:number, y:number}}} activeRec запись активного этажа
   * @returns {object}
   */
  function serializeDungeonMemory(memory, day, memoryDays, activeRec) {
    const out = {};
    if (memory && typeof memory === 'object' && !Array.isArray(memory)) {
      const entries = (typeof memory.entries === 'function')
        ? memory.entries() : Object.entries(memory);
      for (const [k, rec] of entries) {
        if (typeof k !== 'string' || !DUNGEON_MEMORY_KEY_RE.test(k)) {
          continue;
        }
        const rec2 = validateDungeonMemoryRec(rec, day, memoryDays);
        if (rec2) out[k] = rec2;
      }
    }
    if (activeRec && typeof activeRec === 'object' &&
        typeof activeRec.key === 'string' &&
        DUNGEON_MEMORY_KEY_RE.test(activeRec.key)) {
      const last = activeRec.lastVisitDay;
      const contents = validateDungeonContents(activeRec.contents);
      if (contents && Number.isInteger(last) && last >= 1 &&
          last <= day && contentValid(last, day, memoryDays)) {
        const rec2 = { contents, lastVisitDay: last };
        const p = activeRec.pos;
        if (p && typeof p === 'object' && !Array.isArray(p) &&
            Number.isInteger(p.x) && Number.isInteger(p.y) &&
            p.x >= 0 && p.y >= 0) {
          rec2.pos = { x: p.x, y: p.y };
        }
        out[activeRec.key] = rec2;
      }
    }
    return out;
  }

  /**
   * JSON-объект раздела → Map (паттерн restoreCityStates, cities.js).
   * Не-объект/массив → пустой Map (ТИХО — старому сейву раздела нет,
   * warn печатает проводка main.js только на явно битый раздел);
   * невалидные ключи/записи и ОБРЕЗКА — те же, что serialize:
   * fastForward без слушателей — onDay-очистка не пройдёт, restore
   * сам отбрасывает. Вход не мутируется (копии).
   * @param {object} saved
   * @param {number} day текущий день мира
   * @param {number} memoryDays dungeon_memory_days
   * @returns {Map<string, {contents:object, lastVisitDay:number,
   *   pos?:{x:number, y:number}}>}
   */
  function restoreDungeonMemory(saved, day, memoryDays) {
    const out = new Map();
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) {
      return out;
    }
    for (const [k, rec] of Object.entries(saved)) {
      if (typeof k !== 'string' || !DUNGEON_MEMORY_KEY_RE.test(k)) {
        continue;
      }
      const rec2 = validateDungeonMemoryRec(rec, day, memoryDays);
      if (rec2) out.set(k, rec2);
    }
    return out;
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

  /** Собирает залежь (один раз, 000157.03: [E]-сбор). Атомарно:
   *  проверки → одна мутация (паттерн openChest). БЕЗ RNG (golden-
   *  контракт: детерминизм — вызов не двигает ни один rng-поток).
   *  canFit(item, amount) → boolean — dry-run ёмкости героя (паттерн
   *  000046: вызывающий передаёт предикат — ядро не видит items.js);
   *  не-функция → отказ. Ёмкость проверяется ДО отметки gathered:
   *  «не влезает» → ноль мутаций (залежь остаётся — повтор после
   *  освобождения инвентаря).
   *  @returns {{ok:boolean, item?:string, amount?:number, reason?:string}} */
  function gatherDeposit(contents, depositId, canFit) {
    const deps = (contents && Array.isArray(contents.deposits))
      ? contents.deposits : [];
    const dp = deps.find((x) => x && x.id === depositId);
    if (!dp) return { ok: false, reason: 'нет такой залежи' };
    if (dp.gathered) return { ok: false, reason: 'уже собрана' };
    if (typeof canFit !== 'function' || !canFit(dp.item, dp.amount))
      return { ok: false, reason: 'не влезает в инвентарь' };
    dp.gathered = true;
    return { ok: true, item: dp.item, amount: dp.amount };
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
    DUNGEON_WALL_KINDS, DUNGEON_ORES,
    DUNGEON_MEMORY_DAYS, LEVEL_DELTA_MAX,
    CELL_WALL, CELL_FLOOR,
    dungeonTypeFor, createDungeon, generateDungeonContents,
    // 000258: автотайлинг кромки стены (−wallObjFor 000070:
    // фасад 8-соседства заменён маской 4 соседей + 4 угла).
    wallMask, wallTileIndex, wallKindFor,
    contentValid, openChest,
    // 000157.03: [E]-сбор залежи (атомарно, БЕЗ RNG) — рядом с openChest.
    gatherDeposit,
    wanderStep, reachableFrom,
    // 000153.01: модель глубины + сериализатор раздела сейва
    // dungeonMemory (additive — существующие экспорты не тронуты).
    dungeonDepthSeed, dungeonMemoryKey, DUNGEON_MEMORY_KEY_RE,
    validateDungeonContents, serializeDungeonMemory, restoreDungeonMemory,
    // 000153.02: генерация этажа — размер per-глубина + stairs-down
    // (additive; bfsDistances — внутренний хелпер, НЕ экспортируется).
    DUNGEON_SIZE_CAP, dungeonSizeFor, STAIRS_SALT, stairsDownFor,
    // 000230.05: соль СВОЕГО rng-потока редкости сундуков (CH1-пин).
    CHEST_EQ_SALT,
  };
});

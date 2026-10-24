// Каталог подземелий: униформный JS-модуль (фолбэк для file://).
//
// Source of truth — JSON-файлы каталога assets/dungeons/0000*.json
// (один тип подземелья — один файл, схема —
// assets/dungeons/schema.json, задача 000058).
// Файл ГЕНЕРИРУЕТСЯ скриптом scripts/sync-dungeons-data.js,
// не редактируйте вручную: правьте JSON и пересобирайте модуль.
//
// Униформный модуль: в браузере — globalThis.Game.DungeonsData,
// в node — require() (CommonJS).
// DUNGEONS — массив записей В ПОРЯДКЕ ФАЙЛОВ каталога;
// DUNGEONS_BY_ID — индекс по id (значения DUNGEON_TYPES, 0..4).

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    // В браузере — пространство Game.DungeonsData (не смешивать с Game).
    root.Game = Object.assign({}, root.Game, { DungeonsData: factory() });
  }
})(typeof globalThis !== "undefined" ? globalThis : self, function () {

  // Подземелья (assets/dungeons/000001.json … 000005.json).
  const DUNGEONS = [
    // 000001.json
    {
      id: 0,
      название: "простая пещера",
      мобы: ["skeleton", "ant", "crawling_bones", "giant_larva"],
      предметы: ["iron_sword", "healing_potion", "sulfur", "stone_fist_grimoire", "frost_bolt_scroll", "ice_lance_scroll", "rime_bolt_scroll", "hail_scroll", "shatter_scroll", "glacial_spike_scroll", "permafrost_scroll", "absolute_zero_scroll", "ice_field_scroll", "wall_of_ice_scroll", "blizzard_field_scroll", "frost_aura_scroll", "ice_armor_scroll", "winter_haste_scroll", "frostbite_blessing_scroll", "slow_scroll", "frostbite_scroll", "arctic_touch_scroll", "deep_freeze_scroll", "freeze_scroll", "glacier_grasp_scroll", "frost_wisp_scroll", "winter_elemental_scroll", "frost_walk_scroll", "cold_breath_scroll", "frozen_stillness_scroll"],
      размер: 25,
      постройка: 31,
      объекты_стен: ["rock", "stalactite"],
      руда: [{ предмет: "iron_ore", вид: "руда" }, { предмет: "copper_ore", вид: "руда" }, { предмет: "coal", вид: "минерал" }, { предмет: "stone_chunk", вид: "минерал" }, { предмет: "silver_ore", вид: "руда" }, { предмет: "quartz", вид: "минерал" }, { предмет: "obsidian", вид: "минерал" }, { предмет: "gold_ore", вид: "руда" }, { предмет: "phosphorite", вид: "минерал" }, { предмет: "herb_healing", вид: "минерал" }],
    },
    // 000002.json
    {
      id: 1,
      название: "склеп",
      мобы: ["skeleton", "skeleton_archer", "rot", "vampire", "bone_coloss"],
      предметы: ["alchemy_manual", "chainmail", "mana_potion", "meditation_scroll", "chill_scroll", "light_heal_scroll", "blueprint_alchemy", "blueprint_carving", "umbra_bolt_scroll", "drain_life_scroll", "void_arrow_scroll", "night_strike_scroll", "soul_drain_scroll", "shadowflame_scroll", "dark_nova_scroll", "shroud_scroll", "night_blade_scroll", "vampire_touch_scroll", "fear_scroll", "doom_mark_scroll", "despair_scroll", "shadow_curse_scroll", "shadow_bind_scroll", "nightmare_scroll", "dark_ensnare_scroll", "shadow_pool_scroll", "veil_of_night_scroll", "shadow_wraith_scroll", "void_horror_scroll", "shadow_step_scroll", "invisibility_scroll", "shroud_of_night_scroll", "dark_presence_scroll", "radiant_heal_scroll", "life_bloom_scroll", "purify_scroll", "mass_heal_scroll", "holy_mending_scroll", "mass_holy_light_scroll", "regeneration_scroll", "blessing_scroll", "divine_favor_scroll", "guardian_blessing_scroll", "swift_prayer_scroll", "faith_shield_scroll", "smite_scroll", "unholy_wrath_scroll", "stun_of_light_scroll", "holy_bind_scroll", "light_sprite_scroll", "spirit_healer_scroll", "holy_guardian_scroll", "circle_of_light_scroll", "holy_ground_scroll", "prayer_scroll", "divine_protection_scroll", "holy_light_scroll", "miracle_scroll"],
      размер: 27,
      постройка: 32,
      объекты_стен: ["column", "rock"],
      руда: [{ предмет: "stone_chunk", вид: "минерал" }, { предмет: "quartz", вид: "минерал" }, { предмет: "obsidian", вид: "минерал" }, { предмет: "amethyst", вид: "самоцвет" }, { предмет: "phosphorite", вид: "минерал" }, { предмет: "sapphire", вид: "самоцвет" }, { предмет: "herb_mana", вид: "минерал" }],
    },
    // 000003.json
    {
      id: 2,
      название: "руины замка",
      мобы: ["orc_warrior", "orc_archer", "wolf", "troll", "skeleton"],
      предметы: ["steel_sword", "knight_plate", "war_hammer", "iron_hide_tome", "fireball_scroll", "vine_scroll", "blueprint_forge", "blueprint_woodwork", "ember_scroll", "ignite_scroll", "fire_nova_scroll", "lava_burst_scroll", "meteor_scroll", "flame_strike_scroll", "hellfire_scroll", "phlogiston_blast_scroll", "burning_ground_scroll", "wall_of_fire_scroll", "burning_haze_scroll", "blazing_speed_scroll", "fire_aura_scroll", "heat_shield_scroll", "sunfire_scroll", "scorch_scroll", "cinder_scroll", "ashen_debilitation_scroll", "lava_snare_scroll", "burning_cage_scroll", "flame_imp_scroll", "phoenix_scroll", "firelight_scroll", "hearthfire_scroll", "flame_step_scroll"],
      размер: 31,
      постройка: 33,
      объекты_стен: ["column"],
      руда: [{ предмет: "iron_ore", вид: "руда" }, { предмет: "copper_ore", вид: "руда" }, { предмет: "coal", вид: "минерал" }, { предмет: "silver_ore", вид: "руда" }, { предмет: "quartz", вид: "минерал" }, { предмет: "gold_ore", вид: "руда" }, { предмет: "ruby", вид: "самоцвет" }, { предмет: "wood_log", вид: "минерал" }, { предмет: "hide", вид: "минерал" }],
    },
    // 000004.json
    {
      id: 3,
      название: "затопленная пещера",
      мобы: ["water_elemental", "scorpion", "spider", "imp"],
      предметы: ["mana_elixir", "hunting_bow", "moonstone", "nature_scroll", "magic_shield_scroll", "blueprint_runecraft"],
      размер: 27,
      постройка: 34,
      объекты_стен: ["rock"],
      руда: [{ предмет: "sulfur", вид: "минерал" }, { предмет: "stone_chunk", вид: "минерал" }, { предмет: "quartz", вид: "минерал" }, { предмет: "silver_ore", вид: "руда" }, { предмет: "emerald", вид: "самоцвет" }, { предмет: "sapphire", вид: "самоцвет" }, { предмет: "phosphorite", вид: "минерал" }, { предмет: "herb_bitter", вид: "минерал" }],
    },
    // 000005.json
    {
      id: 4,
      название: "бездна",
      мобы: ["lower_demon", "succubus", "abomination"],
      предметы: ["war_hammer", "phoenix_feather", "greater_healing", "heavy_tome", "fire_spellbook", "flame_burst_scroll", "blizzard_scroll", "blueprint_enchant"],
      размер: 35,
      постройка: 35,
      объекты_стен: ["stalactite", "rock"],
      руда: [{ предмет: "stone_chunk", вид: "минерал" }, { предмет: "obsidian", вид: "минерал" }, { предмет: "amethyst", вид: "самоцвет" }, { предмет: "ruby", вид: "самоцвет" }, { предмет: "gold_ore", вид: "руда" }, { предмет: "phosphorite", вид: "минерал" }, { предмет: "mithril_ore", вид: "руда" }, { предмет: "diamond", вид: "самоцвет" }],
    },
  ];

  // Индекс по id — ТЕ ЖЕ объекты, что в DUNGEONS.
  const DUNGEONS_BY_ID = {};
  for (const d of DUNGEONS) DUNGEONS_BY_ID[d.id] = d;

  return { DUNGEONS, DUNGEONS_BY_ID };
});

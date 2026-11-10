// Редкость экипировочного лута (задача 000230.05): таблица
// вероятностей 50/30/15/4.9/0.1 + пулы предметов по тирам.
//
// Униформный модуль: в браузере — globalThis.Game.LootEquipData,
// в node — require() (CommonJS). Потребители — browser-ветки
// combat.js/dungeon.js (на load) и rollVictoryLoot/generate-
// DungeonContents (на вызове). Контракт — memory/000230.05-
// loot-rarity.md.

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    // В браузере — пространство Game.LootEquipData (не смешивать с Game).
    root.Game = Object.assign({}, root.Game, { LootEquipData: factory() });
  }
})(typeof globalThis !== 'undefined' ? globalThis : self, function () {

  // Таблица редкости (ТЗ п.6): порядок canonical (common→impossible)
  // ОБЯЗАТЕЛЕН — acc-накопление pickRarityTier зависит от него;
  // сумма chance === 1 (FP, точное — пин EQ1/CH4).
  const RARITY = [
    { id: 'common', chance: 0.5 },
    { id: 'rare', chance: 0.3 },
    { id: 'epic', chance: 0.15 },
    { id: 'legendary', chance: 0.049 },
    { id: 'impossible', chance: 0.001 },
  ];

  // Пулы экипировки — ДАННЫЕ МОДУЛЯ (паттерн 000132: фиксированные
  // списки, каталог в рантайме НЕ читается): значения = id-строки
  // предметов, редкость предмета = КЛЮЧ массива. Заполнено 000230.08
  // (head 25) + 000230.09 (ears 25 + neck 25) + 000230.10 (torso 25)
  // + 000230.11 (forearms 25 + palms 25) + 000230.12 (right_hand 25:
  // 15 weapon + 10 tool) + 000230.13 (left_hand 25: 12 shield + 13
  // artifact) + 000230.14 (rings 25) + 000230.15 (legs 25 + feet 25);
  // id в каталожном порядке внутри тира (сначала head, потом ears,
  // потом neck, потом torso, потом forearms, потом palms, потом
  // right_hand, потом left_hand, потом rings, потом legs, потом feet);
  // волны 000230.11–.15 добавляют свои id КОНЦОМ тиров;
  // 000230.19 — 2 set-предмета (traveler_cloak концом common,
  // mystic_sutan концом epic);
  // 000277 — 2 set-предмета (traveler_bracer концом common,
  // mystic_wraps концом epic);
  // 000321.01 — 50 weapon right_hand (меч/лук/тяжёлое/посох),
  // id 000514–000563, КОНЦОМ тиров каталожным порядком.
  // 000321.03 — 50 shield left_hand (щит/тарга/буклер),
  // id 000614–000663, КОНЦОМ тиров каталожным порядком.
  const EQUIP_POOLS = {
    common: ['straw_hat', 'wool_cap', 'leather_cap', 'fur_hat',
             'cloth_band', 'wanderer_cap', 'hood_common',
             'linen_cloth', 'felt_hat', 'travel_cloth',
             'copper_hoop', 'bone_stud', 'leather_loop', 'clay_dangle',
             'wood_bead', 'copper_dangle', 'shell_hoop', 'faith_stud',
             'twine_hoop', 'antler_hook', 'copper_chain', 'bone_beads',
             'twine_amulet', 'clay_pendant', 'wood_pendant',
             'copper_pendant', 'shell_beads', 'faith_necklace',
             'leather_choker', 'stone_beads',
             'linen_shirt', 'wool_shirt', 'cloth_tunic', 'linen_gown',
             'hemp_robe', 'rough_kaftan', 'wool_gown', 'cloth_sutan',
             'linen_tunic', 'wool_kaftan',
             'cloth_cuff', 'leather_cuff', 'hemp_bracer', 'rough_bracer',
             'leather_garter', 'cloth_wrap', 'iron_cuff', 'bone_bracer',
             'wood_brace', 'hide_cuff',
             'cloth_gloves', 'leather_gloves', 'hide_gloves',
             'rough_gauntlets', 'archer_gloves', 'linen_wraps',
             'iron_gauntlets', 'bone_grips', 'wood_guards',
             'fine_gloves',
             'wood_scyte', 'iron_scyte', 'wood_pitchfork',
             'iron_pitchfork', 'copper_scyte', 'iron_hammer',
             'iron_tongs', 'clay_crucible', 'stone_mortar',
             'bone_graver',
             'wooden_buckler', 'leather_shield', 'cloth_shield',
             'wicker_buckler', 'oiled_shield', 'bone_shield',
             'horn_shield', 'palm_shield', 'ash_shield',
             'clay_buckler',
             'copper_ring', 'bone_ring', 'iron_ring', 'thread_ring',
             'stone_ring', 'clay_ring', 'wood_ring', 'leather_ring',
             'silver_ring', 'silver_signet',
             'linen_trousers', 'wool_trousers', 'hemp_breeches',
             'felt_trousers', 'leather_pants', 'traveler_breeches',
             'hide_wrap', 'twine_wraps', 'rough_chaps',
             'cloth_loincloth', 'straw_sandals', 'cloth_sandals',
             'leather_sandals', 'wool_boots', 'felt_boots',
             'leather_boots', 'travel_boots', 'hide_boots',
             'wooden_sandals', 'hemp_sandals',
             'traveler_cloak', 'traveler_bracer',
            'copper_short_sword', 'drill_sword', 'poacher_dirk', 'kopis_curved',
            'legion_sword', 'battered_falx', 'merchant_sword', 'patrol_sword',
            'lumber_machete', 'sapling_bow', 'trade_bow', 'patrol_bow',
            'poacher_bow', 'yew_longbow', 'copper_maul', 'stone_mace',
            'flanged_mace', 'lumber_axe', 'miner_pickaxe', 'campaign_maul',
            'patched_helm', 'felt_coif', 'tin_morion', 'boar_tusk_earring',
            'spiral_earring', 'shell_wire_earring', 'fang_lanyard', 'vial_charm',
            'copper_beads', 'quilted_jack', 'hide_bracers', 'wool_bracers',
            'vigil_vambrace', 'driver_mitts', 'coarse_trousers', 'hide_hose',
            'wool_breeches', 'woven_sandals', 'tar_boots', 'traveler_boots',
            'splint_shield', 'reed_buckler', 'birch_shield', 'pine_shield',
            'rawhide_shield', 'rattan_buckler', 'felt_shield', 'straw_shield',
            'oak_shield', 'resin_shield', 'stitched_shield', 'antler_buckler',
            'shingle_shield', 'adobe_shield', 'rushtwine_buckler',
            'goatskin_shield', 'tarred_shield', 'wicker_targe',
            'ashround_buckler', 'hidefaced_shield'],
    rare: ['silver_band', 'copper_band', 'obsidian_cloth',
           'amethyst_band', 'quartz_cloth', 'bone_band', 'mystic_cloth',
           'stone_bead', 'silver_hoop', 'moonstone_dangle',
           'quartz_bead', 'silver_stud', 'obsidian_stud',
           'amethyst_dangle', 'bone_pendant', 'silver_chain',
           'quartz_amulet', 'moonstone_chain', 'faith_amulet',
           'obsidian_pendant', 'amethyst_choker',
           'wool_sutan', 'leather_kaftan', 'embroidered_kaftan',
           'cloth_robe', 'leather_gown', 'monk_sutan', 'fine_kaftan',
           'studded_bracer', 'copper_brace', 'archer_brace',
           'silver_cuff', 'shadow_wrap', 'iron_elbow', 'runic_cuff',
           'studded_gloves', 'copper_gauntlets', 'quiver_gloves',
           'silver_gauntlets', 'night_gloves', 'iron_wraps',
           'wind_gloves',
           'steel_scyte', 'steel_pitchfork', 'ember_staff',
           'rime_staff', 'rune_staff', 'steel_hammer',
           'rune_stylus',
           'iron_round', 'steel_buckler', 'rune_charm',
           'guard_amulet', 'ember_focus', 'frost_charm',
           'scholar_pendant',
           'gold_ring', 'glacier_ring', 'quartz_ring', 'obsidian_ring',
           'amethyst_ring', 'sapphire_ring', 'gold_signet',
           'bone_greaves', 'copper_greaves', 'silver_chaps',
           'stone_greaves', 'obsidian_greaves', 'amethyst_pants',
           'mystic_breeches', 'bone_sandals', 'copper_boots',
           'silver_boots', 'stone_sandals', 'obsidian_sandals',
           'amethyst_boots', 'mystic_sandals',
            'silvered_sword', 'legion_gladius', 'arming_sword', 'rebel_brand',
            'warder_sword', 'silver_inlaid_bow', 'long_warbow', 'scout_bow',
            'silvered_mace', 'storm_maul', 'siege_axe', 'silver_bound_staff',
            'warden_quarterstaff', 'vine_staff',
           'riveted_helm', 'steel_shishak', 'silver_drop_earring', 'moonstone_stud',
           'silver_pendant_chain', 'amethyst_collar', 'warder_cuirass', 'silver_bracers',
           'thorn_bracers', 'studded_mitts', 'grip_gloves', 'vigil_greaves',
           'scale_hose', 'nailed_boots',
           'rimmed_shield', 'iron_boss_shield', 'bronze_buckler',
           'brass_buckler', 'spiked_buckler', 'ironbark_shield',
           'lamellar_shield', 'tower_shield', 'quenched_shield',
           'riveted_shield', 'boar_shield', 'scalefront_shield',
           'crown_shield', 'garrison_buckler'],
    epic: ['silver_helm', 'gold_helm', 'sapphire_helm', 'mithril_helm',
           'emerald_helm', 'sapphire_hoop', 'emerald_stud', 'ruby_bell',
           'gold_dangle', 'mithril_hoop', 'sapphire_pendant',
           'emerald_amulet', 'ruby_pendant', 'gold_chain',
           'mithril_choker',
           'ember_robe', 'stone_robe', 'shadow_robe',
           'deep_breath_robe', 'meditating_robe',
           'steel_bracers', 'gold_brace', 'sapphire_bracer',
           'ghost_cuff', 'swift_brace',
           'steel_gauntlets', 'gold_gloves', 'emerald_gauntlets',
           'phantom_gloves', 'haste_wraps',
           'harvest_scyte', 'flame_staff', 'ice_staff',
           'silver_crucible', 'rune_chisel',
           'ward_crystal', 'cinder_eye', 'frost_orb', 'rune_sphere',
           'mind_pendant',
           'emerald_signet', 'ruby_ring', 'frost_ring', 'rune_ring',
           'scholar_ring',
           'sapphire_leggings', 'ember_pants', 'emerald_greaves',
           'gold_leggings', 'mithril_greaves', 'sapphire_boots',
           'frost_sandals', 'emerald_boots', 'gold_sandals',
           'mithril_boots', 'mystic_sutan', 'mystic_wraps',
            'gilded_broadsword', 'damascus_blade', 'gilt_war_hammer', 'thunder_maul',
            'goldstring_bow', 'windfletch_bow', 'tempest_staff', 'pyre_staff',
            'hoarfrost_staff', 'archivist_staff',
           'rune_circlet', 'mystic_earring', 'warder_pendant', 'twilight_necklace',
           'vigil_plate', 'engraved_bracers', 'frostgrip_gauntlets', 'sigil_greaves',
           'thorn_boots', 'pathfinder_boots',
           'runeward_shield', 'steel_targe', 'blacksteel_shield',
           'mirror_buckler', 'bulwark_shield', 'thorn_shield',
           'garrison_shield', 'lion_shield', 'sentinel_shield',
           'carved_shield'],
    legendary: ['rune_hoop', 'star_hoop', 'star_earring', 'whisper_hoop',
                'rune_necklace', 'star_pendant',
                'pilgrim_sutan', 'void_robe',
                'rune_bracers', 'star_armguard', 'rune_gauntlets',
                'star_gloves',
                'sage_staff', 'mithril_hammer',
                'arcane_eye', 'snow_focus',
                'star_signet', 'void_ring',
                'rune_greaves', 'storm_leggings', 'storm_sandals',
                'rune_boots',
            'dawnedge_blade', 'gate_hammer', 'aurora_bow', 'starvault_staff',
                'vigil_helm', 'dawn_ear_cuff', 'gilded_vambraces', 'dusk_greaves',
                'frontier_shield', 'dragonplate_shield', 'ironbulwark_shield',
                'dawnwall_shield'],
    impossible: ['crown_flame', 'soul_bell', 'dawn_pendant',
                 'aegis_mantle', 'titan_brace', 'void_gauntlet',
                 'philosopher_staff',
                 'heart_of_elements',
                 'phoenix_ring',
                 'titan_greaves', 'swift_boots',
            'fate_cleaver', 'genesis_staff',
                 'golem_gauntlets', 'lostroad_boots',
                 'aegis_shield', 'lastwall_shield'],
  };

  // Чистая функция: 1 вызов rngFn(); acc-накопление по RARITY,
  // строгое r < acc; fallback = последний тир (impossible) —
  // никогда не undefined. FP-границы (0.95/0.9990000000000001) —
  // часть контракта (пин E3).
  function pickRarityTier(rngFn) {
    const r = rngFn();
    let acc = 0;
    for (const t of RARITY) {
      acc += t.chance;
      if (r < acc) return t.id;
    }
    return RARITY[RARITY.length - 1].id;
  }

  return { RARITY, EQUIP_POOLS, pickRarityTier };
});

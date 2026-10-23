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
  // + 000230.11 (forearms 25 + palms 25) + 000230.13 (left_hand 25:
  // 12 shield + 13 artifact); id в каталожном порядке внутри тира
  // (сначала ears, потом neck, потом torso, потом forearms, потом
  // palms, потом left_hand); волны 000230.12, .14–.15 добавляют
  // свои id КОНЦОМ тиров.
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
             'wooden_buckler', 'leather_shield', 'cloth_shield',
             'wicker_buckler', 'oiled_shield', 'bone_shield',
             'horn_shield', 'palm_shield', 'ash_shield',
             'clay_buckler'],
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
           'iron_round', 'steel_buckler', 'rune_charm',
           'guard_amulet', 'ember_focus', 'frost_charm',
           'scholar_pendant'],
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
           'ward_crystal', 'cinder_eye', 'frost_orb', 'rune_sphere',
           'mind_pendant'],
    legendary: ['rune_hoop', 'star_hoop', 'star_earring', 'whisper_hoop',
                'rune_necklace', 'star_pendant',
                'pilgrim_sutan', 'void_robe',
                'rune_bracers', 'star_armguard', 'rune_gauntlets',
                'star_gloves',
                'arcane_eye', 'snow_focus'],
    impossible: ['crown_flame', 'soul_bell', 'dawn_pendant',
                 'aegis_mantle', 'titan_brace', 'void_gauntlet',
                 'heart_of_elements'],
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

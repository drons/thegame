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
  // (head 25, id в каталожном порядке внутри тира); волны
  // 000230.09–.15 добавляют свои id КОНЦОМ тиров.
  const EQUIP_POOLS = {
    common: ['straw_hat', 'wool_cap', 'leather_cap', 'fur_hat',
             'cloth_band', 'wanderer_cap', 'hood_common',
             'linen_cloth', 'felt_hat', 'travel_cloth'],
    rare: ['silver_band', 'copper_band', 'obsidian_cloth',
           'amethyst_band', 'quartz_cloth', 'bone_band', 'mystic_cloth'],
    epic: ['silver_helm', 'gold_helm', 'sapphire_helm', 'mithril_helm',
           'emerald_helm'],
    legendary: ['rune_hoop', 'star_hoop'],
    impossible: ['crown_flame'],
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

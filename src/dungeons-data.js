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
      предметы: ["iron_sword", "healing_potion", "sulfur", "stone_fist_grimoire"],
      размер: 25,
      постройка: 31,
    },
    // 000002.json
    {
      id: 1,
      название: "склеп",
      мобы: ["skeleton", "skeleton_archer", "rot", "vampire", "bone_coloss"],
      предметы: ["alchemy_manual", "chainmail", "mana_potion", "meditation_scroll"],
      размер: 27,
      постройка: 32,
    },
    // 000003.json
    {
      id: 2,
      название: "руины замка",
      мобы: ["orc_warrior", "orc_archer", "wolf", "troll", "skeleton"],
      предметы: ["steel_sword", "knight_plate", "war_hammer", "iron_hide_tome"],
      размер: 31,
      постройка: 33,
    },
    // 000004.json
    {
      id: 3,
      название: "затопленная пещера",
      мобы: ["water_elemental", "scorpion", "spider", "imp"],
      предметы: ["mana_elixir", "hunting_bow", "moonstone", "nature_scroll"],
      размер: 27,
      постройка: 34,
    },
    // 000005.json
    {
      id: 4,
      название: "бездна",
      мобы: ["lower_demon", "succubus", "abomination"],
      предметы: ["war_hammer", "phoenix_feather", "greater_healing", "heavy_tome", "fire_spellbook"],
      размер: 35,
      постройка: 35,
    },
  ];

  // Индекс по id — ТЕ ЖЕ объекты, что в DUNGEONS.
  const DUNGEONS_BY_ID = {};
  for (const d of DUNGEONS) DUNGEONS_BY_ID[d.id] = d;

  return { DUNGEONS, DUNGEONS_BY_ID };
});

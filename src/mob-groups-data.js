// Каталог стационарных групп мобов: униформный JS-модуль
// (фолбэк для file://).
//
// Source of truth — JSON-файлы каталога assets/mob_groups/*.json
// (одна группа — один файл, схема — assets/mob_groups/schema.json).
// Файл ГЕНЕРИРУЕТСЯ скриптом scripts/sync-mob-groups-data.js,
// GENERATED — не править руками, синхронизируется из assets/mob_groups (scripts/sync-mob-groups-data.js)
//
// Униформный модуль: в браузере — globalThis.Game.MobGroupsData,
// в node — CommonJS. Внутри модуля нет обращений к загрузчику
// (паттерн 000049/000053): vm-песочницы (combat-ui/sprites)
// исполняют файл без module-окружения и не должны тянуть
// зависимости.

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    // В браузере — пространство Game.MobGroupsData (не смешивать с Game).
    root.Game = Object.assign({}, root.Game, { MobGroupsData: factory() });
  }
})(typeof globalThis !== "undefined" ? globalThis : self, function () {

  // Записи групп (assets/mob_groups/000001.json … 000007.json);
  // порядок массива = нумерация файлов; позиция = id − 1 =
  // кодовый индекс группы (hash2 % N, MOB_GROUP_TYPES в src/map.js).
  const MOB_GROUPS = [
    // 000001.json
    {
      id: 1,
      название: "орочий лагерь",
      состав: { название: "orc_camp", мобы: ["orc_warrior", "orc_warrior", "orc_archer", "orc_shaman"] },
      спрайт: "orc",
      особые_параметры: {},
    },
    // 000002.json
    {
      id: 2,
      название: "орочий набеги",
      состав: { название: "orc_raid", мобы: ["orc_rider", "orc_rider", "orc_mad"] },
      спрайт: "orc",
      особые_параметры: {},
    },
    // 000003.json
    {
      id: 3,
      название: "логово скелетов",
      состав: { название: "skeleton_den", мобы: ["skeleton", "skeleton", "skeleton", "crawling_bones", "crawling_bones"] },
      спрайт: "skeleton",
      особые_параметры: {},
    },
    // 000004.json
    {
      id: 4,
      название: "волчья стая",
      состав: { название: "wolf_pack", число: [3, 6], мобы: ["wolf"] },
      спрайт: "wolf",
      особые_параметры: {},
    },
    // 000005.json
    {
      id: 5,
      название: "паучье гнездо",
      состав: { название: "spider_nest", мобы: ["spider", "spider", "spider", "centipede"] },
      спрайт: "spider",
      особые_параметры: {},
    },
    // 000006.json
    {
      id: 6,
      название: "круг стихийников",
      состав: { название: "elemental_circle", мобы: ["fire_elemental", "wind_elemental", "water_elemental", "fairy"] },
      спрайт: "elemental",
      особые_параметры: {},
    },
    // 000007.json
    {
      id: 7,
      название: "дух бездны",
      состав: { название: "abyss_spirit", мобы: ["abomination", "lower_demon", "succubus"] },
      спрайт: "abyss",
      особые_параметры: {},
    },
  ];

  return { MOB_GROUPS };
});

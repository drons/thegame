// Каталог декораций тайлов: униформный JS-модуль (фолбэк для
// file://, задача 000021).
//
// Source of truth — JSON-файлы каталога assets/visuals/*.json
// (один элемент — один файл, схема — assets/visuals/schema.json);
// id = номер файла. Спрайты — assets/sprites/visuals/.
// GENERATED — не править руками, синхронизируется из assets/visuals (scripts/sync-visuals-data.js).
// Не редактируйте вручную: правьте JSON и пересобирайте модуль
// (node scripts/sync-visuals-data.js, npm sync:visuals).
//
// Униформный модуль: в браузере — globalThis.Game.VisualsData,
// в node — require() (CommonJS). Потребитель — src/sprites.js:
// данные снимаются ОДИН раз при загрузке (index.html:
// visuals-data.js ДО sprites.js), собственной копии каталога
// в потребителе нет (задача 000059).

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    // В браузере — пространство Game.VisualsData (не смешивать с Game).
    root.Game = Object.assign({}, root.Game, { VisualsData: factory() });
  }
})(typeof globalThis !== "undefined" ? globalThis : self, function () {

  // Декорации (assets/visuals/000001.json … 000013.json);
  // порядок массива = нумерация файлов (id = номер файла).
  const VISUALS = [
    // 000001.json
    {
      id: 1,
      название: "Светлые травинки",
      террейны: ["трава"],
      спрайт: "assets/sprites/visuals/grass_blades_light.svg",
      частота: 0.35,
      размер: 0.14,
    },
    // 000002.json
    {
      id: 2,
      название: "Тёмные травинки",
      террейны: ["трава", "лес"],
      спрайт: "assets/sprites/visuals/grass_blades_dark.svg",
      частота: 0.3,
      размер: 0.14,
    },
    // 000003.json
    {
      id: 3,
      название: "Красный цветок",
      террейны: ["трава"],
      спрайт: "assets/sprites/visuals/flower_red.svg",
      частота: 0.12,
      размер: 0.12,
    },
    // 000004.json
    {
      id: 4,
      название: "Жёлтый цветок",
      террейны: ["трава", "лес"],
      спрайт: "assets/sprites/visuals/flower_yellow.svg",
      частота: 0.12,
      размер: 0.12,
    },
    // 000005.json
    {
      id: 5,
      название: "Белый цветок",
      террейны: ["трава"],
      спрайт: "assets/sprites/visuals/flower_white.svg",
      частота: 0.08,
      размер: 0.12,
    },
    // 000006.json
    {
      id: 6,
      название: "Небольшой куст",
      террейны: ["трава", "лес"],
      спрайт: "assets/sprites/visuals/bush.svg",
      частота: 0.1,
      размер: 0.24,
    },
    // 000007.json
    {
      id: 7,
      название: "Гриб",
      террейны: ["лес"],
      спрайт: "assets/sprites/visuals/mushroom.svg",
      частота: 0.12,
      размер: 0.14,
    },
    // 000008.json
    {
      id: 8,
      название: "Камень",
      террейны: ["холмы", "горы"],
      спрайт: "assets/sprites/visuals/rock.svg",
      частота: 0.3,
      размер: 0.22,
    },
    // 000009.json
    {
      id: 9,
      название: "Камешек",
      террейны: ["холмы", "горы", "песок"],
      спрайт: "assets/sprites/visuals/pebble.svg",
      частота: 0.25,
      размер: 0.1,
    },
    // 000010.json
    {
      id: 10,
      название: "Снежный сугроб",
      террейны: ["горы"],
      спрайт: "assets/sprites/visuals/snow_patch.svg",
      частота: 0.3,
      размер: 0.26,
    },
    // 000011.json
    {
      id: 11,
      название: "Сухая травка",
      террейны: ["песок", "холмы"],
      спрайт: "assets/sprites/visuals/dry_tuft.svg",
      частота: 0.3,
      размер: 0.14,
    },
    // 000012.json
    {
      id: 12,
      название: "Тростинка",
      террейны: ["болото"],
      спрайт: "assets/sprites/visuals/reed.svg",
      частота: 0.3,
      размер: 0.22,
    },
    // 000013.json
    {
      id: 13,
      название: "Кувшинка",
      террейны: ["вода"],
      спрайт: "assets/sprites/visuals/lily_pad.svg",
      частота: 0.15,
      размер: 0.2,
    },
  ];

  return { VISUALS };
});

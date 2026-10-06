// Портреты партии: униформный JS-модуль (фолбэк для file://).
//
// Source of truth — JSON-файлы каталога assets/portraits/*.json
// (задача 000142: герой, дух, 6 наёмных; наёмные связаны с
// assets/npc/000012..000017.json).
// Файл ГЕНЕРИРУЕТСЯ скриптом scripts/sync-portraits.js,
// не редактируйте вручную: правьте JSON и пересобирайте модуль
// (npm run sync:all).
//
// Униформный модуль: в браузере — globalThis.Game.PortraitsData,
// в node — require() (CommonJS).

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    // В браузере — пространство Game.PortraitsData (не смешивать с Game).
    root.Game = Object.assign({}, root.Game, { PortraitsData: factory() });
  }
})(typeof globalThis !== "undefined" ? globalThis : self, function () {

  // Записи каталога (канонический порядок:
  // flogiston, efir, npc-000012 … npc-000017).
  const PORTRAITS = [
    // flogiston.json
    {
      id: "flogiston",
      имя: "Флогистон",
      icon: "flogiston.svg",
      title: "Герой",
      kind: "hero",
      description: "Одинокий странник с посохом и вечным огнём: первый в отряде, последний, кто сдаётся.",
    },
    // efir.json
    {
      id: "efir",
      имя: "Эфир",
      icon: "efir.svg",
      title: "Дух",
      kind: "efir",
      description: "Дух, привязавшийся к Флогистону: горячее пламя снаружи — тёплая забота внутри.",
    },
    // npc-000012.json
    {
      id: "merc_volk",
      имя: "Вольк",
      icon: "npc-000012.svg",
      title: "Наёмник",
      kind: "merc",
      description: "Клинок без хозяина: служит деньгам, но не предаёт — за контрактом держит слово.",
    },
    // npc-000013.json
    {
      id: "merc_ashka",
      имя: "Ашка",
      icon: "npc-000013.svg",
      title: "Наёмница",
      kind: "merc",
      description: "Лучница с северных дорог: стреляет так, что цель успевает подумать о вечном, но промах не думает.",
    },
    // npc-000014.json
    {
      id: "merc_baldor",
      имя: "Бальдор",
      icon: "npc-000014.svg",
      title: "Наёмник",
      kind: "merc",
      description: "Громила с щитом размером с дверь. Медленный в разговоре, но в бою — как стена, которую кто-то нанял.",
    },
    // npc-000015.json
    {
      id: "merc_mira",
      имя: "Мира",
      icon: "npc-000015.svg",
      title: "Наёмница",
      kind: "merc",
      description: "Целительница без монастыря: швыряет раны, как другие швыряют камни. Работает с теми, кого уважает.",
    },
    // npc-000016.json
    {
      id: "merc_torga",
      имя: "Торга",
      icon: "npc-000016.svg",
      title: "Наёмник",
      kind: "merc",
      description: "Голые кулаки и сорок лет бродяжничества. Дорого стоит — но за эти деньги противник успевает посчитать свои зубы.",
    },
    // npc-000017.json
    {
      id: "merc_rena",
      имя: "Рена",
      icon: "npc-000017.svg",
      title: "Наёмница",
      kind: "merc",
      description: "Лучница, которая научилась стрелять молниями. Говорит мало, считает много и не берёт тех, кто не умеет договариваться.",
    },
  ];

  return { PORTRAITS };
});

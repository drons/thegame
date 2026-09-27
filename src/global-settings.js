// Глобальные настройки игры: «настраиваемые» числовые параметры из SPEC.md.
//
// Единый источник значений, которые раньше были захардкожены по модулям
// (day.js, dungeon.js, player.js, combat.js). Ключи — имена параметров
// из SPEC.md:
//   steps_per_day        — «Игровое время» (по умолчанию 40)
//   respawn_days         — «Мобы» (по умолчанию 3)
//   dungeon_memory_days  — «Мобы» (по умолчанию 3)
//   level_delta_max      — «Мобы», дельта уровня моба N (по умолчанию 3)
//   points_per_level     — «Навыки» (по умолчанию 2)
//   combat_difficulty    — «Боевая система», текущая сложность
//   combat_difficulties  — «Боевая система», множители HP/урона мобов
//                          по каждой сложности ('easy'/'medium'/'hard')
//
// Зависимостей нет — в index.html подключается ПЕРВЫМ среди src-скриптов.
// Униформный модуль: в браузере — globalThis.Game.GlobalSettings,
// в node — require() (CommonJS).

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    // В браузере — пространство Game.GlobalSettings (не смешивать с Game).
    root.Game = Object.assign({}, root.Game, { GlobalSettings: factory() });
  }
})(typeof globalThis !== 'undefined' ? globalThis : self, function () {

  const SETTINGS = {
    steps_per_day: 40,        // успешных шагов мира за игровой день
    respawn_days: 3,          // дней до респауна побеждённой стационарной группы
    dungeon_memory_days: 3,   // дней памяти содержимого подземелья
    level_delta_max: 3,       // уровень моба = персонаж ± N
    points_per_level: 2,      // очков навыков за игровой уровень
    combat_difficulty: 'medium', // текущая сложность боя
    // Множители к HP и урону мобов по каждой сложности (задача 000027).
    // Подобраны симуляцией (tests/combat.test.js, отчёт tasks/result/000027.md):
    // на 'medium' герой уровня группы с разумной прокачкой и разумной игрой
    // (удары + блок, поддержка на первом месте) побеждает ВСЕ стандартные
    // группы на всех сидов; 'hard' — только с грамотной игрой.
    combat_difficulties: {
      easy:   { hp: 0.3, damage: 0.3 },
      medium: { hp: 0.45, damage: 0.45 },
      hard:   { hp: 0.6, damage: 0.55 },
    },
  };

  return { SETTINGS };
});

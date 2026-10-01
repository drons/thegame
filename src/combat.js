// Боевая система: мини-карта боя, пошаговые ходы (SPEC.md, разделы
// «Боевая система» и «Мобы»).
//
// Чистое ядро без DOM — тестируется в node (tests/combat.test.js).
// Все случайности идут через combat._rng (mulberry32), поэтому бой
// детерминирован при фиксированном сиде.
//
// Препятствия (задача 000050): c.obstacles — Set 'x,y' непроходимых
// клеток, генерируются в createCombat (generateObstacles) ТОЛЬКО через
// c._rng — детерминированы по сиду. Блокируют только ДВИЖЕНИЕ
// (playerMove/rectFree → stepToward/stepAway); атаки и заклинания
// (в т.ч. дальние) летают поверх — линий видимости в модели нет.
//
// Союзные юниты (задача 000080): side 'ally', всегда 1×1 — отдельный
// формат makeAlly(data, idx, moraleMult) (формулы makeMob БЕЗ множителей
// сложности; явные maxHP/damage/kind/attrs — для Эфира 000081). createCombat
// принимает opts.allies; очередь — игрок → союзники → мобы; ИИ — allyAct по
// ролям; модель целей МОБА расширена: ближайшая цель СТОРОНЫ ИГРОКА (игрок
// ИЛИ союзник — гибель союзника ≠ поражение). При 0 союзников всё поведение
// (поток c._rng, логи, исход) БИТ-В-БИТ как до 000080. Каталог заклинаний
// для ИИ support читается ЛЕНИВО из combatInternals.allySpells (его ставит
// spells.js — UMD-ловушка 000038; без каталога support — melee-фолбэк).
//
// Опыт спутников (задача 000082): при победе c.result.allyXp — каждому
// ВЫЖИВШЕМУ союзнику kind 'merc' доля companion_xp_share от БАЗОВОГО
// боевого xp (Math.round, не делится на число спутников; положительный
// фильтр — Эфир 'efir' (000081) и неизвестные kind вне доли). Чистая
// арифметика: НОЛЬ новых вызовов c._rng (gold-роллы — до) — бит-в-бит
// при 0 союзников; игрок — 100% БЕЗ ИЗМЕНЕНИЙ; лог-строка победы —
// без изменений. В 'fled'/'dead' поля allyXp нет (000087 гвардит
// outcome === 'victory'). Контракт — memory/000082-companion-xp.md.
//
// Униформный модуль: в браузере — globalThis.Game, в node — require().
// Зависимости: perlin.js (mulberry32), player.js (derived/takeDamage/heal/addXp),
// global-settings.js (level_delta_max, combat_difficulty/combat_difficulties,
// combat_obstacle_min_frac/combat_obstacle_max_frac, companion_xp_share).

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('./perlin.js'), require('./player.js'), require('./items.js'),
      require('./global-settings.js'), require('./mob-groups-data.js'));
  } else {
    root.Game = Object.assign({}, root.Game,
      factory(typeof root.Game === 'object' ? root.Game : {}, root.Game,
        root.Game, root.Game && root.Game.GlobalSettings,
        (root.Game && root.Game.MobGroupsData) || null));
  }
})(typeof globalThis !== 'undefined' ? globalThis : self,
  function (perlin, P, I, settings, mobGroups) {

  if (!settings || typeof settings.SETTINGS !== 'object') {
    throw new Error(
      'combat.js: не найдены глобальные настройки — загрузите global-settings.js до combat.js');
  }

  const mulberry32 = perlin.mulberry32;

  // --- Роли и агрессивность (SPEC.md, «Мобы») ---
  const MOB_ROLES = {
    MELEE: 'melee', RANGED: 'ranged', SUPPORT: 'support',
    LEADER: 'leader', SHIELD: 'shield', SWARM: 'swarm',
  };
  const ROLE_NAMES = {
    melee: 'ближний бой', ranged: 'дальний бой', support: 'поддержка',
    leader: 'лидер', shield: 'щит', swarm: 'рой',
  };
  const AGGRO = {
    NEUTRAL: 'neutral', TIMID: 'timid',
    AGGRESSIVE: 'aggressive', TERRITORIAL: 'territorial',
  };

  // Типы мобов (SPEC.md, «Типы мобов»).
  // Source of truth — JSON-каталог assets/mobs (схема — assets/mobs/schema.json);
  // здесь — зеркало для file:// (браузер без fetch локальных JSON),
  // консистентность проверяет tests/combat.test.js (задача 000022).
  // dmg/hp — множители базовых значений (растущих с уровнем),
  // armor — базовая броня, fast — 2 шага за ход, traits — боевые черты,
  // xp — опыт за убийство (base + perLevel * уровень),
  // skills — ссылки на assets/skills, spells — на assets/spells (000023),
  // loot — возможный лут: ссылки на assets/items.
  const MOB_TYPES = {
    // Орки
    orc_grunt:      { id: 'orc_grunt', name: 'Орк-шестёрка', role: 'melee', aggro: 'aggressive', dmg: 1.0, hp: 1.0, size: { w: 1, h: 1 }, xp: { base: 8, perLevel: 4 }, skills: [], spells: [], loot: [{ item: 'sulfur', chance: 0.2 }] },
    orc_warrior:    { id: 'orc_warrior', name: 'Орк-воин', role: 'shield', aggro: 'aggressive', dmg: 1.1, hp: 1.4, armor: 1, size: { w: 1, h: 1 }, xp: { base: 8, perLevel: 4 }, skills: ['heavy'], spells: [], loot: [{ item: 'battle_axe', chance: 0.1 }, { item: 'sulfur', chance: 0.15 }] },
    orc_archer:     { id: 'orc_archer', name: 'Орк-лучник', role: 'ranged', aggro: 'aggressive', dmg: 0.9, hp: 0.9, size: { w: 1, h: 1 }, xp: { base: 8, perLevel: 4 }, skills: ['archer'], spells: [], loot: [{ item: 'short_bow', chance: 0.1 }] },
    orc_shaman:     { id: 'orc_shaman', name: 'Орк-шаман', role: 'support', aggro: 'timid', dmg: 0.5, hp: 0.7, size: { w: 1, h: 1 }, xp: { base: 8, perLevel: 4 }, skills: ['meditation'], spells: [], loot: [{ item: 'mana_potion', chance: 0.15 }] },
    orc_rider:      { id: 'orc_rider', name: 'Орк-наездник на волке', role: 'melee', aggro: 'aggressive', dmg: 1.1, hp: 1.0, fast: true, size: { w: 1, h: 1 }, xp: { base: 8, perLevel: 4 }, skills: ['step'], spells: [], loot: [{ item: 'sulfur', chance: 0.1 }] },
    orc_mad:        { id: 'orc_mad', name: 'Орк-бешеный', role: 'melee', aggro: 'aggressive', dmg: 1.4, hp: 0.7, size: { w: 1, h: 1 }, xp: { base: 8, perLevel: 4 }, skills: [], spells: [], loot: [] },
    orc_captain:    { id: 'orc_captain', name: 'Орк-капитан', role: 'leader', aggro: 'aggressive', dmg: 1.3, hp: 1.5, size: { w: 1, h: 1 }, xp: { base: 8, perLevel: 4 }, skills: ['leader'], spells: [], loot: [{ item: 'war_hammer', chance: 0.1 }, { item: 'chainmail', chance: 0.1 }] },
    orc_chief:      { id: 'orc_chief', name: 'Орк-вождь', role: 'leader', aggro: 'aggressive', dmg: 1.6, hp: 2.0, size: { w: 1, h: 1 }, xp: { base: 8, perLevel: 4 }, skills: ['leader'], spells: [], loot: [{ item: 'war_hammer', chance: 0.15 }, { item: 'chainmail', chance: 0.15 }, { item: 'greater_healing', chance: 0.1 }] },
    // Нежить
    skeleton:       { id: 'skeleton', name: 'Скелет', role: 'melee', aggro: 'neutral', dmg: 0.8, hp: 0.8, size: { w: 1, h: 1 }, xp: { base: 8, perLevel: 4 }, skills: [], spells: [], loot: [{ item: 'sulfur', chance: 0.15 }] },
    skeleton_archer:{ id: 'skeleton_archer', name: 'Скелет-лучник', role: 'ranged', aggro: 'aggressive', dmg: 0.8, hp: 0.8, size: { w: 1, h: 1 }, xp: { base: 8, perLevel: 4 }, skills: ['archer'], spells: [], loot: [{ item: 'short_bow', chance: 0.1 }] },
    crawling_bones: { id: 'crawling_bones', name: 'Ползучие кости', role: 'swarm', aggro: 'aggressive', dmg: 0.5, hp: 0.5, size: { w: 1, h: 1 }, xp: { base: 8, perLevel: 4 }, skills: [], spells: [], loot: [{ item: 'sulfur', chance: 0.1 }] },
    giant_larva:    { id: 'giant_larva', name: 'Личинка падальщика', role: 'melee', aggro: 'territorial', dmg: 1.0, hp: 1.0, size: { w: 1, h: 1 }, xp: { base: 8, perLevel: 4 }, skills: [], spells: [], loot: [{ item: 'meat', chance: 0.2 }] },
    vampire:        { id: 'vampire', name: 'Вампир', role: 'melee', aggro: 'aggressive', dmg: 1.2, hp: 1.1, traits: { lifesteal: true }, size: { w: 1, h: 1 }, xp: { base: 8, perLevel: 4 }, skills: ['endurance'], spells: [], loot: [{ item: 'greater_healing', chance: 0.1 }, { item: 'mana_elixir', chance: 0.1 }] },
    rot:            { id: 'rot', name: 'Гниль', role: 'melee', aggro: 'aggressive', dmg: 0.9, hp: 0.9, traits: { poison: true }, size: { w: 1, h: 1 }, xp: { base: 8, perLevel: 4 }, skills: ['alchemy'], spells: [], loot: [{ item: 'sulfur', chance: 0.2 }] },
    bone_coloss:    { id: 'bone_coloss', name: 'Костяной колосс', role: 'shield', aggro: 'territorial', dmg: 1.3, hp: 2.5, armor: 2, size: { w: 3, h: 3 }, xp: { base: 8, perLevel: 4 }, skills: ['golem'], spells: [], loot: [{ item: 'knight_plate', chance: 0.1 }, { item: 'chainmail', chance: 0.1 }] },
    // Дикие звери
    wolf:           { id: 'wolf', name: 'Волк', role: 'melee', aggro: 'neutral', dmg: 0.7, hp: 0.8, size: { w: 1, h: 1 }, xp: { base: 8, perLevel: 4 }, skills: [], spells: [], loot: [{ item: 'leather_armor', chance: 0.1 }] },
    wolf_pack:      { id: 'wolf_pack', name: 'Волчья стая', role: 'swarm', aggro: 'territorial', dmg: 0.7, hp: 0.8, size: { w: 1, h: 1 }, xp: { base: 8, perLevel: 4 }, skills: [], spells: [], loot: [{ item: 'leather_armor', chance: 0.15 }] },
    boar:           { id: 'boar', name: 'Казённый вепрь', role: 'melee', aggro: 'neutral', dmg: 1.0, hp: 1.5, size: { w: 1, h: 1 }, xp: { base: 8, perLevel: 4 }, skills: [], spells: [], loot: [{ item: 'meat', chance: 0.3 }] },
    cave_bear:      { id: 'cave_bear', name: 'Пещерный медведь', role: 'shield', aggro: 'territorial', dmg: 1.3, hp: 2.0, armor: 1, size: { w: 2, h: 2 }, xp: { base: 8, perLevel: 4 }, skills: ['endurance'], spells: [], loot: [{ item: 'meat', chance: 0.3 }, { item: 'honey_cake', chance: 0.1 }] },
    spider:         { id: 'spider', name: 'Гигантский паук', role: 'swarm', aggro: 'territorial', dmg: 0.8, hp: 0.8, traits: { poison: true }, size: { w: 1, h: 1 }, xp: { base: 8, perLevel: 4 }, skills: ['alchemy'], spells: [], loot: [{ item: 'sulfur', chance: 0.2 }] },
    troll:          { id: 'troll', name: 'Тролль', role: 'leader', aggro: 'neutral', dmg: 1.5, hp: 2.5, size: { w: 2, h: 2 }, xp: { base: 8, perLevel: 4 }, skills: ['leader'], spells: [], loot: [{ item: 'war_hammer', chance: 0.15 }] },
    // Насекомые
    ant:            { id: 'ant', name: 'Пещерный муравей', role: 'swarm', aggro: 'territorial', dmg: 0.5, hp: 0.5, size: { w: 1, h: 1 }, xp: { base: 8, perLevel: 4 }, skills: [], spells: [], loot: [{ item: 'honey_cake', chance: 0.15 }] },
    ant_queen:      { id: 'ant_queen', name: 'Матка', role: 'leader', aggro: 'territorial', dmg: 1.0, hp: 2.0, size: { w: 1, h: 1 }, xp: { base: 8, perLevel: 4 }, skills: ['leader'], spells: [], loot: [{ item: 'honey_cake', chance: 0.3 }] },
    scorpion:       { id: 'scorpion', name: 'Скорпион', role: 'melee', aggro: 'neutral', dmg: 0.9, hp: 0.9, traits: { poison: true }, size: { w: 1, h: 1 }, xp: { base: 8, perLevel: 4 }, skills: ['alchemy'], spells: [], loot: [{ item: 'sulfur', chance: 0.2 }] },
    centipede:      { id: 'centipede', name: 'Многоножка', role: 'melee', aggro: 'aggressive', dmg: 1.0, hp: 0.9, fast: true, size: { w: 1, h: 1 }, xp: { base: 8, perLevel: 4 }, skills: ['step'], spells: [], loot: [] },
    // Стихийники и магия
    fire_elemental: { id: 'fire_elemental', name: 'Огненный стихийник', role: 'melee', aggro: 'aggressive', dmg: 1.3, hp: 1.1, size: { w: 3, h: 3 }, xp: { base: 8, perLevel: 4 }, skills: ['firelord'], spells: [], loot: [{ item: 'phoenix_feather', chance: 0.1 }] },
    water_elemental:{ id: 'water_elemental', name: 'Водный стихийник', role: 'melee', aggro: 'neutral', dmg: 1.0, hp: 1.4, traits: { regen: true }, size: { w: 2, h: 2 }, xp: { base: 8, perLevel: 4 }, skills: ['breath'], spells: [], loot: [{ item: 'mana_elixir', chance: 0.1 }] },
    wind_elemental: { id: 'wind_elemental', name: 'Ветряной стихийник', role: 'ranged', aggro: 'neutral', dmg: 0.9, hp: 0.9, fast: true, size: { w: 1, h: 1 }, xp: { base: 8, perLevel: 4 }, skills: ['step'], spells: [], loot: [{ item: 'moonstone', chance: 0.1 }] },
    earth_elemental:{ id: 'earth_elemental', name: 'Земляной стихийник', role: 'shield', aggro: 'neutral', dmg: 1.0, hp: 3.0, armor: 2, size: { w: 3, h: 3 }, xp: { base: 8, perLevel: 4 }, skills: ['golem'], spells: [], loot: [{ item: 'moonstone', chance: 0.15 }] },
    imp:            { id: 'imp', name: 'Имп', role: 'ranged', aggro: 'aggressive', dmg: 0.7, hp: 0.7, size: { w: 1, h: 1 }, xp: { base: 8, perLevel: 4 }, skills: ['runes'], spells: [], loot: [{ item: 'sulfur', chance: 0.25 }] },
    salamander:     { id: 'salamander', name: 'Саламандра', role: 'melee', aggro: 'territorial', dmg: 1.1, hp: 1.2, size: { w: 2, h: 2 }, xp: { base: 8, perLevel: 4 }, skills: ['firelord'], spells: [], loot: [{ item: 'phoenix_feather', chance: 0.15 }] },
    fairy:          { id: 'fairy', name: 'Фея', role: 'support', aggro: 'timid', dmg: 0.4, hp: 0.6, size: { w: 1, h: 1 }, xp: { base: 8, perLevel: 4 }, skills: ['nature'], spells: [], loot: [{ item: 'moonstone', chance: 0.2 }] },
    stone_golem:    { id: 'stone_golem', name: 'Каменный голем', role: 'shield', aggro: 'territorial', dmg: 1.2, hp: 2.5, armor: 2, size: { w: 3, h: 3 }, xp: { base: 8, perLevel: 4 }, skills: ['golem'], spells: [], loot: [{ item: 'knight_plate', chance: 0.1 }] },
    // Бездна
    lower_demon:    { id: 'lower_demon', name: 'Низший демон', role: 'melee', aggro: 'aggressive', dmg: 1.4, hp: 1.3, size: { w: 2, h: 2 }, xp: { base: 8, perLevel: 4 }, skills: ['firelord'], spells: [], loot: [{ item: 'greater_healing', chance: 0.1 }, { item: 'sulfur', chance: 0.2 }] },
    succubus:       { id: 'succubus', name: 'Суккуб', role: 'support', aggro: 'aggressive', dmg: 0.6, hp: 0.8, traits: { debuff: true }, size: { w: 1, h: 1 }, xp: { base: 8, perLevel: 4 }, skills: ['orator'], spells: [], loot: [{ item: 'mana_elixir', chance: 0.15 }] },
    abomination:    { id: 'abomination', name: 'Уродство', role: 'leader', aggro: 'aggressive', dmg: 1.7, hp: 2.5, size: { w: 3, h: 3 }, xp: { base: 8, perLevel: 4 }, skills: ['leader'], spells: [], loot: [{ item: 'phoenix_feather', chance: 0.2 }, { item: 'greater_healing', chance: 0.15 }] },
  };

  // Составы групп по типам из map.js (MOB_GROUP_TYPES: 0..6).
  // «Стационарная группа всегда содержит минимум один моб доминирующего
  // типа локации» (SPEC.md) — в каждом рецепте доминирующий тип есть.
  //
  // Source of truth — каталог assets/mob_groups (задача 000057):
  // `состав.название` = имя рецепта (живёт в логе боя), `состав.мобы`
  // = порядок мобов (индекс юнита → расстановка, детерминизм),
  // `состав.число` = [min,max] (волчья стая). В index.html модуль
  // данных загружается ДО combat.js, в node — аргумент UMD.
  const FALLBACK_GROUP_RECIPES = {
    0: { name: 'orc_camp', mobs: ['orc_warrior', 'orc_warrior', 'orc_archer', 'orc_shaman'] },
    1: { name: 'orc_raid', mobs: ['orc_rider', 'orc_rider', 'orc_mad'] },
    2: { name: 'skeleton_den', mobs: ['skeleton', 'skeleton', 'skeleton', 'crawling_bones', 'crawling_bones'] },
    3: { name: 'wolf_pack', count: [3, 6], mobs: ['wolf'] },
    4: { name: 'spider_nest', mobs: ['spider', 'spider', 'spider', 'centipede'] },
    5: { name: 'elemental_circle', mobs: ['fire_elemental', 'wind_elemental', 'water_elemental', 'fairy'] },
    6: { name: 'abyss_spirit', mobs: ['abomination', 'lower_demon', 'succubus'] },
  };
  // Гард: vm-песочницы (combat-ui) грузят combat.js БЕЗ модуля данных —
  // фолбэк обязан дать ровно текущие значения (прецедент 000055).
  const GROUP_RECIPES = (mobGroups && Array.isArray(mobGroups.MOB_GROUPS))
    ? (function () {
        const r = {};
        for (const g of mobGroups.MOB_GROUPS) {
          const t = g && (typeof g.id === 'number' ? g.id : NaN) - 1;
          const s = g && g.состав;
          if (!Number.isInteger(t) || t < 0 || !s) continue;
          const recipe = { name: s.название, mobs: s.мобы.slice() };
          if (Array.isArray(s.число)) recipe.count = s.число.slice();
          r[t] = recipe;
        }
        return r;
      })()
    : FALLBACK_GROUP_RECIPES;

  // Группа с лидером: +5% урон и +5% защита всем (SPEC.md).
  const LEADER_DMG_MULT = 1.05;
  const LEADER_DEF_MULT = 0.95;

  const RANGED_MAX_DIST = 4;
  const BOW_ATTACK_DIST = 4; // дальность атаки из лука (задача 000009)
  const SPELL_MAX_DIST = 4;

  // Опыт практики вторичных навыков за успешное применение эффекта
  // (задача 000013, SPEC.md «Повышение вторичных навыков», п. 2).
  // hit — попадание (меч/лук/тяжёлое/кулаки), block — постановка блока,
  // spell — применение заклинания.
  const PRACTICE_XP = { hit: 3, block: 2, spell: 3 };

  // Навык, который «качает» удар: по подтипу оружия, без оружия — кулаки.
  function attackSkillId(eq) {
    if (eq.damage > 0) {
      if (eq.subtype === 'bow') return 'archer';
      if (eq.subtype === 'heavy') return 'heavy';
      return 'swordsman';
    }
    return 'fists';
  }

  const POISON_CHANCE = 0.3;
  const POISON_TICK = 2;      // урона за ход
  const POISON_TURNS = 2;     // сколько ходов держится
  const FLEE_HP_FRAC = 0.3;   // пугливые убегают ниже 30% HP

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // Вероятность попадания (чистая функция — тестируется отдельно).
  function hitChance(atkLevel, atkBonus, defLevel, defDodge) {
    return clamp(0.55 + 0.03 * (atkLevel - defLevel) + (atkBonus || 0) - (defDodge || 0), 0.05, 0.95);
  }

  // Множитель сложности (задача 000027): { hp, damage } из
  // settings.SETTINGS.combat_difficulties[difficulty].
  function makeMob(mobId, level, idx, hasLeader, diff) {
    const t = MOB_TYPES[mobId];
    const hpRoleMult = { swarm: 0.6, support: 0.7, shield: 1.8, leader: 1.8 }[t.role] || 1.0;
    const maxHP = Math.max(1, Math.round((8 + 4 * level) * t.hp * hpRoleMult * diff.hp));
    const damage = Math.max(1, Math.round(
      (2 + 0.7 * level) * t.dmg * (hasLeader ? LEADER_DMG_MULT : 1) * diff.damage));
    return {
      id: 'm' + idx,
      // Сторона боя (задача 000080): 'mob' — враг (явно; поведение не
      // меняется), 'ally' — союзник (makeAlly).
      side: 'mob',
      mobId,
      name: t.name,
      role: t.role,
      aggro: t.aggro,
      level,
      maxHP,
      hp: maxHP,
      armor: (t.armor || 0) + Math.floor(level / 10),
      damage,
      damageTakenMult: hasLeader ? LEADER_DEF_MULT : 1,
      movePerTurn: t.fast ? 2 : 1,
      // Размер на поле w×h (задача 000040); якорь — верхний левый угол (x, y).
      size: t.size || { w: 1, h: 1 },
      x: 0,
      y: 0,
      alive: true,
      fled: false,
      traits: Object.assign({
        poison: false, lifesteal: false, regen: false, debuff: false,
      }, t.traits),
      // Данные из описания моба (assets/mobs, задача 000022):
      // xp — опыт за убийство, skills/loot — ссылки на каталоги.
      xp: t.xp || { base: 8, perLevel: 4 },
      skills: t.skills || [],
      loot: t.loot || [],
    };
  }

  // Союзный юнит (задача 000080): ВСЕГДА 1×1, side 'ally'.
  // data — данные найма (контракт 000078: assets/npc, поле «найм») либо
  // данные Эфира (000081):
  //   { name, role: 'melee'|'ranged'|'shield'|'support', level,
  //     dmg, hp, armor?, skills?, spells?, attrs?, kind?, id?,
  //     maxHP? (явное, в обход формулы), damage? (явное, в обход) }.
  // Формулы статов — паттерн makeMob БЕЗ множителей сложности
  // combat_difficulties (они — для врагов) и без hasLeader:
  //   maxHP  = max(1, round((8 + 4·ур) · hp · hpРоль)),
  //   damage = max(1, round((2 + 0.7·ур) · dmg · moraleMult)),
  //   armor  = (armor || 0) + floor(ур / 10);
  // hpРоль — те же ролевые HP-множители, что у мобов: support 0.7,
  // shield 1.8, melee/ranged/swarm 1.0. moraleMult (по умолчанию 1) —
  // мораль отряда 1 + companionMoraleBonus (createCombat считает от
  // P.derived(p); +5%/ур. Предводителя — НЕ вражеская роль 'leader'/
  // hasLeader); хранится на юните u.moraleMult для будущих урон-кастов
  // (Эфир, 000112/000113). Чистая функция — тестируется.
  function makeAlly(data, idx, moraleMult = 1) {
    const level = data.level || 1;
    const hpRoleMult = { support: 0.7, shield: 1.8 }[data.role] || 1.0;
    const maxHP = data.maxHP != null
      ? data.maxHP
      : Math.max(1, Math.round((8 + 4 * level) * (data.hp || 1) * hpRoleMult));
    const damage = data.damage != null
      ? data.damage
      : Math.max(1, Math.round((2 + 0.7 * level) * (data.dmg || 1) * moraleMult));
    return {
      // data.id — дискриминатор (Эфир 000081), иначе индексный 'aN'.
      id: data.id || 'a' + idx,
      side: 'ally',
      name: data.name,
      role: data.role,
      level,
      maxHP,
      hp: maxHP,
      armor: (data.armor || 0) + Math.floor(level / 10),
      damage,
      // Тотальная модель урона (000080, раунд ревью 1): dealDamageToMob
      // умножает на это поле — у мобов оно всегда есть (1/
      // LEADER_DEF_MULT); без него союзник получал hp = NaN. 000112/
      // 000113 (урон-касты) читают множители с юнита.
      damageTakenMult: 1,
      moraleMult,
      movePerTurn: 1,
      size: { w: 1, h: 1 },
      x: 0,
      y: 0,
      alive: true,
      fled: false,
      traits: {},
      skills: (data.skills || []).slice(),
      spells: (data.spells || []).slice(),
      attrs: data.attrs || {},
      kind: data.kind || 'merc',
    };
  }

  function unitAt(c, x, y) {
    return c.units.find((u) => u.alive && !u.fled
      && x >= u.x && x < u.x + (u.size.w || 1)
      && y >= u.y && y < u.y + (u.size.h || 1));
  }

  function inBounds(c, x, y) {
    return x >= 0 && y >= 0 && x < c.width && y < c.height;
  }

  // Достигнутые из старта игрока (c.px, c.py) клетки по НЕ-препятствиям
  // (задача 000050): BFS, мобы ИГНОРИРОВАНЫ (они могут сойти с дороги).
  // Чистая функция (c не мутирует) → Set строк 'x,y' (включая старт).
  // Экспортируется — тесты достижимости препятствий.
  function reachableCells(c) {
    const start = c.px + ',' + c.py;
    const seen = new Set([start]);
    const q = [[c.px, c.py]];
    for (let i = 0; i < q.length; i++) {
      const [x, y] = q[i];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= c.width || ny >= c.height) continue;
        const k = nx + ',' + ny;
        if (seen.has(k)) continue;
        if (c.obstacles && c.obstacles.has(k)) continue;
        seen.add(k);
        q.push([nx, ny]);
      }
    }
    return seen;
  }

  // Прямоугольник w×h с якорем (x, y) свободно: в пределах поля,
  // не на игроке, не на препятствии (c.obstacles, задача 000050) и не
  // пересекает других живых юнитов (ignore — сам перемещающийся юнит).
  // ОДНА точка проверки для stepToward И stepAway (оба используют
  // rectFree): мобы не проходят сквозь камни и не встают на них.
  function rectFree(c, x, y, w, h, ignore) {
    if (x < 0 || y < 0 || x + w > c.width || y + h > c.height) return false;
    if (x <= c.px && c.px < x + w && y <= c.py && c.py < y + h) return false;
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) {
        if (c.obstacles && c.obstacles.has(xx + ',' + yy)) return false;
        const v = c.units.find((m) => m !== ignore && m.alive && !m.fled
          && xx >= m.x && xx < m.x + (m.size.w || 1)
          && yy >= m.y && yy < m.y + (m.size.h || 1));
        if (v) return false;
      }
    }
    return true;
  }

  // Манхэттен-расстояние от игрока (1x1) до прямоугольника юнита;
  // 0 — соседствуют/касание.
  function unitDist(c, u) {
    const x1 = u.x + (u.size.w || 1) - 1;
    const y1 = u.y + (u.size.h || 1) - 1;
    const dx = c.px < u.x ? u.x - c.px : (c.px > x1 ? c.px - x1 : 0);
    const dy = c.py < u.y ? u.y - c.py : (c.py > y1 ? c.py - y1 : 0);
    return dx + dy;
  }

  // Нормализует юнит ({x, y, size}) или прямоугольник ({x, y, w, h}).
  function rectOf(v) {
    return v.size
      ? { x: v.x, y: v.y, w: v.size.w || 1, h: v.size.h || 1 }
      : { x: v.x, y: v.y, w: v.w || 1, h: v.h || 1 };
  }

  // Манхэттен-расстояние между двумя прямоугольками (задача 000080);
  // 0 — пересечение/соседство по оси (диапазоны на оси пересекаются).
  // rectDist(игрок 1×1, юнит) ≡ unitDist — бит-в-бит (регрессия).
  function rectDist(a, b) {
    const A = rectOf(a), B = rectOf(b);
    const ax1 = A.x + A.w - 1, ay1 = A.y + A.h - 1;
    const bx1 = B.x + B.w - 1, by1 = B.y + B.h - 1;
    const dx = ax1 < B.x ? B.x - ax1 : (bx1 < A.x ? A.x - bx1 : 0);
    const dy = ay1 < B.y ? B.y - ay1 : (by1 < A.y ? A.y - by1 : 0);
    return dx + dy;
  }

  function nearestMob(c) {
    let best = null;
    for (const u of c.units) {
      if (!u.alive || u.fled || u.side !== 'mob') continue;
      if (!best || unitDist(c, u) < unitDist(c, best)) best = u;
    }
    return best;
  }

  // Живые мобы (side 'mob'): цель игрока/спеллов, аггрегация, победа.
  // Фильтр side (000080): союзники сюда НЕ попадают — игрок не цели и не
  // цель по своей стороне; при 0 союзников — ровно прежний набор.
  function livingMobs(c) {
    return c.units.filter((u) => u.side === 'mob' && u.alive && !u.fled);
  }

  function livingAllies(c) {
    return c.units.filter((u) => u.side === 'ally' && u.alive && !u.fled);
  }

  // Ближайший живой МОБ от союзника u (ИИ союзника, 000080);
  // тай-брейк — порядок c.units (строго <). null — врагов нет.
  function nearestEnemy(c, u) {
    let best = null;
    for (const m of livingMobs(c)) {
      if (!best || rectDist(u, m) < rectDist(u, best)) best = m;
    }
    return best;
  }

  // Ближайшая цель СТОРОНЫ ИГРОКА от моба u (000080): игрок ИЛИ живой
  // союзник — расширение модели целей, без которого гибель союзника
  // недостижима. Тай-брейк — игрок (строгий <). При 0 союзников —
  // всегда игрок (бит-в-бит: rectDist(u, игрок 1×1) ≡ unitDist).
  // Возврат: { x, y, w, h, isPlayer } | { x, y, w, h, unit: ally }.
  function nearestPlayerSide(c, u) {
    let best = { x: c.px, y: c.py, w: 1, h: 1, isPlayer: true };
    let bestD = rectDist(u, best);
    for (const a of livingAllies(c)) {
      const d = rectDist(u, a);
      if (d < bestD) {
        best = { x: a.x, y: a.y, w: a.size.w || 1, h: a.size.h || 1, unit: a };
        bestD = d;
      }
    }
    return best;
  }

  // Очередь хода (задача 000036, расширено 000080): игрок первым, затем
  // живые СОЮЗНИКИ (порядок c.units), затем живые МОБЫ (порядок c.units).
  // Мёртвые (alive=false) и сбежавшие (fled) исключены. Чистая функция —
  // тестируется в tests/combat.test.js.
  function buildTurnOrder(c) {
    return ['player',
      ...livingAllies(c).map((u) => u.id),
      ...livingMobs(c).map((u) => u.id)];
  }

  function log(c, msg) {
    c.log.push(msg);
  }

  // Один шаг к ПРЯМОУГОЛЬНИКУ ЦЕЛИ (задача 000080: общая для мобов —
  // цель-прямоугольник стороны игрока, и для будущих целей; МОБЫ при
  // 0 союзников вызывают с прямоугольником игрока — БИТ-В-БИТ прежняя
  // логика и порядок осей: сначала большая ось, при равенстве — x;
  // если занято — другая). Для многоклеточных юнитов — шаг всего
  // прямоугольника; направление — по расстоянию от соответствующего
  // края до цели.
  function stepTowardRect(c, u, r) {
    const R = rectOf(r);
    const w = u.size.w || 1, h = u.size.h || 1;
    const x1 = u.x + w - 1, y1 = u.y + h - 1;
    const sx = R.x < u.x ? -1 : (R.x + R.w - 1 > x1 ? 1 : 0);
    const sy = R.y < u.y ? -1 : (R.y + R.h - 1 > y1 ? 1 : 0);
    const adx = Math.abs(sx), ady = Math.abs(sy);
    const tries = (adx >= ady ? [[sx, 0], [0, sy]] : [[0, sy], [sx, 0]])
      .filter(([a, b]) => a !== 0 || b !== 0);
    for (const [dx, dy] of tries) {
      const nx = u.x + dx, ny = u.y + dy;
      if (rectFree(c, nx, ny, w, h, u)) {
        u.x = nx; u.y = ny;
        return true;
      }
    }
    return false;
  }

  // Один шаг к игроку (обёртка: цель — клетка игрока 1×1).
  function stepToward(c, u) {
    return stepTowardRect(c, u, { x: c.px, y: c.py, w: 1, h: 1 });
  }

  // Один шаг ОТ прямоугольника цели (паника, отступление): порядок
  // направлений прежний (↑, ↓, ←, →); берётся первая свободная клетка,
  // где расстояние до цели ВЫРОСЛО (бит-в-бит при цели-игроке).
  function stepAwayRect(c, u, r) {
    const d0 = rectDist(u, r);
    const w = u.size.w || 1, h = u.size.h || 1;
    for (const [sx, sy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const nx = u.x + sx, ny = u.y + sy;
      if (!rectFree(c, nx, ny, w, h, u)) continue;
      const u2 = { x: nx, y: ny, size: u.size };
      if (rectDist(u2, r) > d0) {
        u.x = nx; u.y = ny;
        return true;
      }
    }
    return false;
  }

  // Один шаг от игрока (обёртка: цель — клетка игрока 1×1).
  function stepAway(c, u) {
    return stepAwayRect(c, u, { x: c.px, y: c.py, w: 1, h: 1 });
  }

  // Шаг СОЮЗНИКА (1×1) к цели-прямоугольнику (задача 000080): сначала
  // ось x (если оси различаются), затем ось y; направление — к цели;
  // первая rectFree-клетка. Красные тесты фиксируют и «обход занятой
  // клетки» по другой оси, и шаг по x (красные тесты 000080: piny).
  function allyStepToward(c, u, r) {
    const R = rectOf(r);
    const w = u.size.w || 1, h = u.size.h || 1;
    const x1 = u.x + w - 1, y1 = u.y + h - 1;
    const sx = R.x < u.x ? -1 : (R.x + R.w - 1 > x1 ? 1 : 0);
    const sy = R.y < u.y ? -1 : (R.y + R.h - 1 > y1 ? 1 : 0);
    for (const [dx, dy] of [[sx, 0], [0, sy]]
      .filter(([a, b]) => a !== 0 || b !== 0)) {
      const nx = u.x + dx, ny = u.y + dy;
      if (rectFree(c, nx, ny, w, h, u)) {
        u.x = nx; u.y = ny;
        return true;
      }
    }
    return false;
  }

  // Шаг СОЮЗНИКА от цели-прямоугольника: порядок направлений →, ↑, ↓, ←;
  // первая rectFree-клетка, где расстояние до цели выросло. Красные тесты
  // 000080 фиксируют: отступление ranged при d≤1 И «кайтинг»-шаг при
  // d>RANGED_MAX_DIST (см. memory/000080-ally-framework.md).
  function allyStepAway(c, u, r) {
    const d0 = rectDist(u, r);
    const w = u.size.w || 1, h = u.size.h || 1;
    for (const [dx, dy] of [[1, 0], [0, -1], [0, 1], [-1, 0]]) {
      const nx = u.x + dx, ny = u.y + dy;
      if (!rectFree(c, nx, ny, w, h, u)) continue;
      const u2 = { x: nx, y: ny, size: u.size };
      if (rectDist(u2, r) > d0) {
        u.x = nx; u.y = ny;
        return true;
      }
    }
    return false;
  }

  // --- Урон ---

  // Урон по мобо (броня моба, минимум 1; ignoreArmor — для заклинаний).
  // Возвращает { dmg, killed }.
  function dealDamageToMob(c, u, amount, ignoreArmor = false) {
    const dmg = Math.max(1, Math.round(amount * u.damageTakenMult) - (ignoreArmor ? 0 : u.armor));
    u.hp -= dmg;
    if (u.hp <= 0) {
      u.hp = 0;
      u.alive = false;
      log(c, `${u.name} повержен!`);
      checkVictory(c);
    }
    return { dmg, killed: !u.alive };
  }

  // Урон по игроку (щит → блок → броня → «Железная кожа» через P.takeDamage).
  // Возвращает фактический урон (для вампиризма).
  function dealDamageToPlayer(c, raw) {
    const p = c.player;
    const d = P.derived(p);
    let dmg = raw;
    // Магический щит (задача 000045): пока turns > 0, гасит shield.armor
    // (поставляется/тикается src/spells.js и endPlayerTurn).
    const shield = c.ps.shield;
    if (shield && shield.turns > 0) {
      dmg = Math.max(0, dmg - shield.armor);
    }
    if (c.ps.blocked) {
      dmg *= 1 - Math.min(0.6, 0.2 + 0.02 * p.primary.constitution);
    }
    // Задача 000076: благословение горы (c.buffMods.armor, 000072) —
    // +броня поверх уровня/снаряжения. Дефолт 0 — бит-в-бит (−0).
    dmg = Math.max(0, Math.round(dmg) - d.armor - I.equipmentStats(p).armor
      - c.buffMods.armor);
    if (dmg > 0) P.takeDamage(p, dmg);
    if (!p.alive) {
      // «Несокрушимость»: шанс выжить смертельный удар — 1 раз в игровой день
      // (SPEC.md). Счётчик живёт на персонаже — действует на все бои дня.
      if (d.survivalChance > 0 && p._lastUnkillDay !== c.day && c._rng() < d.survivalChance) {
        p.alive = true;
        p.hp = 1;
        p._lastUnkillDay = c.day;
        log(c, 'Несокрушимость! Смерть отказалась.');
      } else {
        c.phase = 'over';
        c.result = { outcome: 'dead' };
        log(c, 'Вы погибли...');
      }
    }
    return dmg;
  }

  // Урон по СОЮЗНИКУ (задача 000080): броня, минимум 1. Без блока/щита/
  // «Несокрушимости» — эффекты c.ps действуют ТОЛЬКО на игрока (v1).
  // Гибель союзника — покидает бой: НИКАКОГО checkVictory/поражения,
  // клетка освобождается (alive=false), из очереди исключается.
  // Возвращает фактический урон.
  function dealDamageToAlly(c, t, raw) {
    const dmg = Math.max(1, Math.round(raw) - (t.armor || 0));
    t.hp -= dmg;
    if (t.hp <= 0) {
      t.hp = 0;
      t.alive = false;
      log(c, `${t.name} пал в бою!`);
    }
    return dmg;
  }

  function checkVictory(c) {
    if (c.result) return;
    const left = livingMobs(c);
    if (left.length > 0) return;
    c.phase = 'over';
    // Лут/опыт/«defeated» — ТОЛЬКО за мобов (000080): мёртвые союзники
    // в lут не попадают и опыта не дают (xp у них нет).
    const killed = c.units.filter((u) => u.side === 'mob' && !u.alive);
    // Опыт за победу: сумма опыта поверженных мобов (assets/mobs, xp =
    // base + perLevel * уровень моба; задача 000022).
    const xp = killed.reduce(
      (s, u) => s + Math.round(u.xp.base + u.xp.perLevel * u.level), 0);
    const gold = killed.reduce((s, u) => s + Math.round(3 + 2 * u.level + c._rng() * u.level), 0);
    if (killed.length > 0) {
      P.addXp(c.player, xp);
      c.player.gold += gold;
      // Доля боевого опыта ВЫЖИВШИМ спутникам (задача 000082, SPEC.md
      // «Спутники» → «Опыт и уровни», memory/000082-companion-xp.md):
      // каждому живому союзнику kind 'merc' (ПОЛОЖИТЕЛЬНЫЙ фильтр —
      // Эфир kind 'efir' (000081) и неизвестные kind вне доли:
      // у Эфира свой пул, он растёт с 100% xp) — Math.round(базовый
      // xp × companion_xp_share) НЕЗАВИСИМО (не делится на число
      // спутников). Игрок — без изменений (100% + «Учёный» внутри
      // P.addXp; «Учёный» спутникам НЕ идёт). Чистая арифметика —
      // НОЛЬ новых вызовов c._rng (gold-роллы выше) — бит-в-бит
      // поток RNG сохранён. Настройка читается ЖИВО: Number(...) || 0
      // (мусор в настройках → 0, бой не падает). allyXp ВСЕГДА массив
      // (может быть пустым); в 'fled'/'dead' поля нет — обработчик
      // конца боя (000087) гвардит outcome === 'victory'.
      // Лог-строка победы — без изменений (сообщения о спутниках —
      // 000087).
      const share = Number(settings.SETTINGS.companion_xp_share) || 0;
      const allyXp = livingAllies(c)
        .filter((u) => u.kind === 'merc')
        .map((u) => ({ id: u.id, xp: Math.round(xp * share) }));
      c.result = { outcome: 'victory', xp, gold, defeated: killed.length, allyXp };
      log(c, `Победа! +${xp} опыта, +${gold} золота.`);
    } else {
      // Все сбежали — лута нет.
      c.result = { outcome: 'fled', xp: 0, gold: 0, defeated: 0 };
      log(c, 'Противники разбежались.');
    }
  }

  // --- Действия игрока ---

  function checkTurn(c) {
    if (c.phase === 'over') return 'бой закончен';
    if (c.phase !== 'player') return 'не ваш ход';
    return null;
  }

  function playerAttack(c, targetId) {
    const why = checkTurn(c);
    if (why) return { ok: false, reason: why };
    const blocked = checkBlocked(c);
    if (blocked) return blocked;
    if (c.ps.attack <= 0) return { ok: false, reason: 'действий «Удар» больше нет' };
    const t = targetId ? c.units.find((u) => u.id === targetId) : nearestMob(c);
    // Союзник — не цель игрока (000080): своя сторона, reason «нет цели».
    if (!t || !t.alive || t.fled || t.side === 'ally') {
      return { ok: false, reason: 'нет цели' };
    }
    const p = c.player;
    const d = P.derived(p);
    const eq = I.equipmentStats(p);
    // Лук бьёт в даль (BOW_ATTACK_DIST); остальное оружие — вплотную.
    const isBow = eq.subtype === 'bow';
    const maxDist = isBow ? BOW_ATTACK_DIST : 1;
    if (unitDist(c, t) > maxDist) {
      return { ok: false, reason: isBow ? 'цель слишком далеко (дальность лука 4)' : 'цель слишком далеко (ближний бой)' };
    }
    c.ps.attack -= 1;
    let dmg;
    if (eq.damage > 0) {
      dmg = eq.damage * (1 + eq.dmgBonus);
    } else {
      const base = 3 + Math.floor(p.primary.strength * 0.8) + Math.floor(p.level * 0.5);
      dmg = base * (1 + d.fistDamageBonus + d.heavyDamageBonus);
    }
    // Задача 000076: благословение солнца (c.buffMods.damageMult, 000072)
    // — множитель к расчётному урону (удар И стрельба — обе ветки
    // формулы). Применён ДО round() в dealDamageToMob; дефолт ×1 —
    // бит-в-бит, НОЛЬ новых вызовов c._rng (детерминизм 000080/000082).
    dmg *= c.buffMods.damageMult;
    const hitBonus = eq.damage > 0 ? eq.hitBonus : d.swordHitBonus;
    if (c._rng() >= hitChance(p.level, hitBonus, t.level, 0)) {
      log(c, `Вы промахнулись (${t.name}).`);
      return { ok: true, hit: false, dmg: 0 };
    }
    const r = dealDamageToMob(c, t, dmg);
    log(c, `Вы бьёте ${t.name}: ${r.dmg}.`);
    // Практика: попадание даёт опыт навыка оружия (задача 000013).
    const skillId = attackSkillId(eq);
    const pr = P.skillPractice(p, skillId, PRACTICE_XP.hit);
    return {
      ok: true, hit: true, ...r,
      practice: { skill: skillId, xp: PRACTICE_XP.hit, applied: pr.applied, level: pr.level },
    };
  }

  function playerSpell(c, school, targetId) {
    const why = checkTurn(c);
    if (why) return { ok: false, reason: why };
    const blocked = checkBlocked(c);
    if (blocked) return blocked;
    const p = c.player;
    const d = P.derived(p);
    if (school === 'fire') {
      if (c.ps.spellInt <= 0) return { ok: false, reason: 'действий «Заклинание» (Интеллект) больше нет' };
      if (p.mp < 3) return { ok: false, reason: 'не хватает маны (3)' };
      const t = targetId ? c.units.find((u) => u.id === targetId) : nearestMob(c);
      // Союзник — не цель (000080).
      if (!t || !t.alive || t.fled || t.side === 'ally') {
        return { ok: false, reason: 'нет цели' };
      }
      if (unitDist(c, t) > SPELL_MAX_DIST) return { ok: false, reason: 'цель слишком далеко (дальность 4)' };
      c.ps.spellInt -= 1;
      p.mp -= 3;
      // Заклинание: всегда попадает, игнорирует броню. Задача 000076:
      // благословение солнца (c.buffMods.damageMult) — ×множитель
      // (дефолт ×1 — бит-в-бит, НОЛЬ новых вызовов c._rng).
      const dmg = Math.round((3 + 0.5 * p.primary.intelligence)
        * (1 + d.fireDamageBonus) * c.buffMods.damageMult);
      const r = dealDamageToMob(c, t, dmg, true);
      log(c, `Огненная стрела по ${t.name}: ${r.dmg}.`);
      // Практика: каст даёт опыт «Повелителю огня» (задача 000013).
      const pr = P.skillPractice(p, 'firelord', PRACTICE_XP.spell);
      return {
        ok: true, dmg: r.dmg, killed: r.killed,
        practice: { skill: 'firelord', xp: PRACTICE_XP.spell, applied: pr.applied, level: pr.level },
      };
    }
    if (school === 'heal') {
      if (c.ps.spellWis <= 0) return { ok: false, reason: 'действий «Заклинание» (Мудрость) больше нет' };
      if (p.mp < 3) return { ok: false, reason: 'не хватает маны (3)' };
      c.ps.spellWis -= 1;
      p.mp -= 3;
      const amount = Math.round(3 + 0.5 * p.primary.wisdom + p.level);
      const hpBefore = p.hp;
      const hp = P.heal(p, amount);
      // Задача 000037: логируем фактически восстановленную величину
      // (HP после − HP до), а не новое ОБЩЕЕ HP.
      log(c, `Исцеление: ${hp - hpBefore}.`);
      // Практика: каст даёт опыт «Медитации» (задача 000013).
      const pr = P.skillPractice(p, 'meditation', PRACTICE_XP.spell);
      return {
        // hp — общее HP после исцеления (совместимость),
        // healed — восстановленная величина (задача 000037).
        ok: true, hp, healed: hp - hpBefore,
        practice: { skill: 'meditation', xp: PRACTICE_XP.spell, applied: pr.applied, level: pr.level },
      };
    }
    return { ok: false, reason: 'неизвестная школа' };
  }

  // Блок — только как ПОСЛЕДНЕЕ действие хода (SPEC.md): пока блок стоит,
  // прочие действия хода запрещены (атака/заклинания/предметы/движение).
  // Раньше проверка «пулы других действий пусты» делала блок невыполнимым
  // в бою: пулы заклинаний refillPools() восстанавливает каждый ход в ≥1
  // (задача 000027).
  function checkBlocked(c) {
    return c.ps.blocked ? { ok: false, reason: 'блок — только последнее действие' } : null;
  }

  function playerBlock(c) {
    const why = checkTurn(c);
    if (why) return { ok: false, reason: why };
    if (c.ps.block <= 0) return { ok: false, reason: 'действий «Блок» больше нет' };
    c.ps.block -= 1;
    c.ps.blocked = true;
    log(c, 'Вы ставите блок.');
    // Практика: блок даёт опыт «Железной коже» (задача 000013).
    const p = c.player;
    const pr = P.skillPractice(p, 'hide', PRACTICE_XP.block);
    return {
      ok: true,
      practice: { skill: 'hide', xp: PRACTICE_XP.block, applied: pr.applied, level: pr.level },
    };
  }

  function playerMove(c, dx, dy) {
    const why = checkTurn(c);
    if (why) return { ok: false, reason: why };
    const blocked = checkBlocked(c);
    if (blocked) return blocked;
    if (c.ps.moveLeft <= 0) return { ok: false, reason: 'шаги на ход исчерпаны' };
    const nx = c.px + dx, ny = c.py + dy;
    if (!inBounds(c, nx, ny)) return { ok: false, reason: 'стена' };
    if (c.obstacles && c.obstacles.has(nx + ',' + ny)) {
      return { ok: false, reason: 'препятствие' };
    }
    // unitAt — все юниты (000050): и моб, и союзник блокируют клетку;
    // у союзника — своя формулировка (000080).
    const blocker = unitAt(c, nx, ny);
    if (blocker) {
      return {
        ok: false,
        reason: blocker.side === 'ally' ? 'тут стоит союзник' : 'тут стоит моб',
      };
    }
    c.px = nx; c.py = ny;
    c.ps.moveLeft -= 1;
    return { ok: true };
  }

  function playerFlee(c) {
    const why = checkTurn(c);
    if (why) return { ok: false, reason: why };
    const mobs = livingMobs(c);
    const avg = mobs.length ? mobs.reduce((s, u) => s + u.level, 0) / mobs.length : 1;
    const chance = clamp(0.45 + 0.03 * (c.player.level - avg) + 0.02 * c.player.primary.dexterity, 0.25, 0.9);
    if (c._rng() < chance) {
      c.phase = 'over';
      c.result = { outcome: 'fled' };
      log(c, 'Вы сбежали из боя.');
      return { ok: true, fled: true };
    }
    log(c, 'Сбежать не удалось!');
    endPlayerTurn(c); // ход сгорает, мобы действуют
    return { ok: true, fled: false };
  }

  // «Быстрый предмет» (SPEC: Ловкость/Харизма): закреплённый слот,
  // пул quickItem восстанавливается от Ловкости (refillPools).
  function playerQuickItem(c, slot) {
    const why = checkTurn(c);
    if (why) return { ok: false, reason: why };
    const blocked = checkBlocked(c);
    if (blocked) return blocked;
    if (c.ps.quickItem <= 0) return { ok: false, reason: 'действий «Быстрый предмет» больше нет' };
    const p = c.player;
    const s = Number.isInteger(slot) ? slot : I.firstQuickSlot(p);
    if (s == null) return { ok: false, reason: 'быстрые слоты пусты' };
    const itemId = I.quickItem(p, s);
    if (!itemId) return { ok: false, reason: 'быстрый слот ' + (s + 1) + ' пуст' };
    c.ps.quickItem -= 1;
    const r = I.useItem(p, itemId);
    if (!r.ok) {
      c.ps.quickItem += 1; // неприменимый предмет — действие не сгорает
      return { ok: false, reason: r.reason };
    }
    log(c, r.message);
    return { ok: true, slot: s, item: r.name };
  }

  // «Вытащить предмет» (SPEC: Удача) из инвентаря: 1 действие за ход.
  function playerInvItem(c, itemId) {
    const why = checkTurn(c);
    if (why) return { ok: false, reason: why };
    const blocked = checkBlocked(c);
    if (blocked) return blocked;
    if (c.ps.invItem <= 0) return { ok: false, reason: 'действий «Предмет из инвентаря» больше нет' };
    if (!itemId) return { ok: false, reason: 'выберите предмет из инвентаря' };
    const p = c.player;
    if (!I.hasItem(p, itemId)) return { ok: false, reason: 'предмета нет в инвентаре' };
    c.ps.invItem -= 1;
    const r = I.useItem(p, itemId);
    if (!r.ok) {
      c.ps.invItem += 1;
      return { ok: false, reason: r.reason };
    }
    log(c, r.message);
    return { ok: true, item: r.name };
  }

  function playerSelectTarget(c, targetId) {
    const t = c.units.find((u) => u.id === targetId);
    // Союзник — не цель (000080): та же причина, что у мёртвого/сбежавшего.
    if (!t || !t.alive || t.fled || t.side === 'ally') {
      return { ok: false, reason: 'недоступная цель' };
    }
    c.targetId = targetId;
    return { ok: true };
  }

  // canDoAction (задача 000037): предпросмотр доступности действия БЕЗ
  // побочных эффектов — «зеркало» проверок ядра (playerAttack/
  // playerSpell/playerBlock/playerQuickItem/playerInvItem/playerFlee/
  // endPlayerTurn). Одна причина — одно поведение: reason — теми же
  // формулировками, что в ядре, поэтому UI (title/лог) и ядро согласованы.
  // Не тратит пулы/ману, не вызывает c._rng(), не мутирует c.ps, p.hp,
  // p.mp, c.log, c.targetId — дёшево, можно на каждом render.
  // args.targetId — для 'attack'/'fire' (UI передаёт c.targetId; без
  // args — ближайший живой моб, как в ядре).
  function canDoAction(c, action, args) {
    const a = args || {};
    const p = c.player;
    if (action === 'attack') {
      const why = checkTurn(c);
      if (why) return { ok: false, reason: why };
      const blocked = checkBlocked(c);
      if (blocked) return blocked;
      if (c.ps.attack <= 0) return { ok: false, reason: 'действий «Удар» больше нет' };
      const t = a.targetId ? c.units.find((u) => u.id === a.targetId) : nearestMob(c);
      if (!t || !t.alive || t.fled || t.side === 'ally') {
        return { ok: false, reason: 'нет цели' };
      }
      // Снаряжение читаем прямым доступом, БЕЗ I.equipmentStats (тот через
      // ensureEquipment лениво СОЗДАЁТ p.equipment — canDoAction обязан
      // быть без побочных эффектов). Для дальности нужен только subtype.
      const eq = p.equipment;
      const w = (eq && eq.weapon) ? I.getItem(eq.weapon) : null;
      // Лук бьёт в даль (BOW_ATTACK_DIST); остальное оружие — вплотную.
      const isBow = !!(w && w.subtype === 'bow');
      const maxDist = isBow ? BOW_ATTACK_DIST : 1;
      if (unitDist(c, t) > maxDist) {
        return { ok: false, reason: isBow
          ? 'цель слишком далеко (дальность лука 4)'
          : 'цель слишком далеко (ближний бой)' };
      }
      return { ok: true };
    }
    if (action === 'fire') {
      const why = checkTurn(c);
      if (why) return { ok: false, reason: why };
      const blocked = checkBlocked(c);
      if (blocked) return blocked;
      if (c.ps.spellInt <= 0) return { ok: false, reason: 'действий «Заклинание» (Интеллект) больше нет' };
      if (p.mp < 3) return { ok: false, reason: 'не хватает маны (3)' };
      const t = a.targetId ? c.units.find((u) => u.id === a.targetId) : nearestMob(c);
      if (!t || !t.alive || t.fled || t.side === 'ally') {
        return { ok: false, reason: 'нет цели' };
      }
      if (unitDist(c, t) > SPELL_MAX_DIST) return { ok: false, reason: 'цель слишком далеко (дальность 4)' };
      return { ok: true };
    }
    if (action === 'heal') {
      const why = checkTurn(c);
      if (why) return { ok: false, reason: why };
      const blocked = checkBlocked(c);
      if (blocked) return blocked;
      if (c.ps.spellWis <= 0) return { ok: false, reason: 'действий «Заклинание» (Мудрость) больше нет' };
      if (p.mp < 3) return { ok: false, reason: 'не хватает маны (3)' };
      // Задача 000037: при полном HP заклинание бесполезно (P.heal
      // восстановил бы 0) — дизейбл с фиксированной причиной.
      if (p.hp >= P.derived(p).maxHP) return { ok: false, reason: 'здоровье полное' };
      return { ok: true };
    }
    if (action === 'block') {
      // checkBlocked НЕ проверяется: playerBlock в ядре его не вызывает —
      // блок и есть последнее действие (задача 000027).
      const why = checkTurn(c);
      if (why) return { ok: false, reason: why };
      if (c.ps.block <= 0) return { ok: false, reason: 'действий «Блок» больше нет' };
      return { ok: true };
    }
    if (action === 'quickItem') {
      const why = checkTurn(c);
      if (why) return { ok: false, reason: why };
      const blocked = checkBlocked(c);
      if (blocked) return blocked;
      if (c.ps.quickItem <= 0) return { ok: false, reason: 'действий «Быстрый предмет» больше нет' };
      // Быстрые слоты и наличие предмета читаем прямым доступом, БЕЗ
      // I.firstQuickSlot/I.quickItem/I.hasItem (те через ensureInventory
      // лениво СОЗДАЮТ p.inventory — canDoAction обязан быть без
      // побочных эффектов). Поведение совпадает с ядром: при отсутствии
      // инвентаря «быстрые слоты пусты».
      const inv = p.inventory;
      const quick = (inv && Array.isArray(inv.quick)) ? inv.quick : null;
      let s = null;
      let itemId = null;
      if (quick) {
        for (let i = 0; i < quick.length; i++) {
          if (quick[i]) { s = i; itemId = quick[i]; break; }
        }
      }
      if (s == null) return { ok: false, reason: 'быстрые слоты пусты' };
      if (!itemId) return { ok: false, reason: 'быстрый слот ' + (s + 1) + ' пуст' };
      // Применимость — проверки useItem ДО потребления, без самого useItem
      // (он мутирует: инвентарь, HP, навыки).
      const it = I.getItem(itemId);
      if (!it) return { ok: false, reason: 'неизвестный предмет: ' + itemId };
      const has = !!(inv && Array.isArray(inv.slots)
        && inv.slots.some((e) => e && e.id === itemId));
      if (!has) return { ok: false, reason: 'предмета нет в инвентаре' };
      if (it.kind === 'weapon') return { ok: false, reason: 'оружие — экипируется' };
      if (it.kind === 'armor') return { ok: false, reason: 'броня — экипируется' };
      if (it.kind === 'reagent') return { ok: false, reason: 'реагент нельзя применить (торговый товар)' };
      return { ok: true };
    }
    if (action === 'invItem') {
      const why = checkTurn(c);
      if (why) return { ok: false, reason: why };
      const blocked = checkBlocked(c);
      if (blocked) return blocked;
      if (c.ps.invItem <= 0) return { ok: false, reason: 'действий «Предмет из инвентаря» больше нет' };
      // Задача 000037: кнопка «Предмет [T]» активна, когда в инвентаре есть
      // хотя бы ОДИН применимый предмет (зелья/еда/книги — те же kind,
      // что принимает useItem). Мини-меню выбора предмета из боя —
      // отдельная задача.
      const inv = p.inventory;
      const has = !!(inv && Array.isArray(inv.slots) && inv.slots.some((e) => {
        const it = I.getItem(e.id);
        return !!it && (it.kind === 'potion' || it.kind === 'food'
          || it.kind === 'skill_book');
      }));
      if (!has) return { ok: false, reason: 'нет применимых предметов в инвентаре' };
      return { ok: true };
    }
    if (action === 'flee') {
      // playerFlee в ядре checkBlocked не гоняет — блок побегу не
      // препятствие. Бросок шанса побега остаётся только в playerFlee —
      // здесь c._rng() не вызываем.
      const why = checkTurn(c);
      if (why) return { ok: false, reason: why };
      return { ok: true };
    }
    if (action === 'endTurn') {
      const why = checkTurn(c);
      if (why) return { ok: false, reason: why };
      return { ok: true };
    }
    return { ok: false, reason: 'неизвестное действие: ' + action };
  }

  // --- Ход мобов ---

  function mobAttack(c, u) {
    const p = c.player;
    const d = P.derived(p);
    if (c._rng() >= hitChance(u.level, 0, p.level, d.dodgeBonus)) {
      log(c, `${u.name} промахивается.`);
      return;
    }
    // Ослабление (задача 000045, ставится src/spells.js): урон моба ×mult;
    // эффект тикает ВМЕСТЕ С ПРИМЕНЕНИЕМ — ×0.75 ровно `turns` ударов.
    let dmg = u.damage;
    if (u.weaken && u.weaken.turns > 0) {
      dmg *= u.weaken.mult;
      u.weaken.turns -= 1;
    }
    const dealt = dealDamageToPlayer(c, dmg);
    if (dealt <= 0 || c.result) return;
    if (u.traits.lifesteal) {
      u.hp = Math.min(u.maxHP, u.hp + dealt);
      log(c, `${u.name} высасывает здоровье.`);
    }
    if (u.traits.poison && c._rng() < POISON_CHANCE && c.ps.poison === 0) {
      c.ps.poison = POISON_TURNS;
      log(c, 'Вы отравлены!');
    }
    if (u.traits.debuff && c._rng() < 0.25 / d.magicResistMult) {
      // Суккуб: слабит волю — игрок теряет одно действие (случайный пул).
      const pools = ['attack', 'spellInt', 'spellWis'].filter((k) => c.ps[k] > 0);
      if (pools.length) {
        const k = pools[Math.floor(c._rng() * pools.length)];
        c.ps[k] -= 1;
        log(c, 'Воля подорвана: −1 действие.');
      }
    }
  }

  // Удар моба по СОЮЗНИКУ (задача 000080): те же бросок/ослабление, но
  // трейты (яд/вампиризм/дебафф) в v1 действуют ТОЛЬКО на игрока —
  // сюда не переносятся. Гибель союзника — НЕ поражение (dealDamageToAlly).
  function mobAttackAlly(c, u, t) {
    if (c._rng() >= hitChance(u.level, 0, t.level, 0)) {
      log(c, `${u.name} промахивается.`);
      return;
    }
    let dmg = u.damage;
    if (u.weaken && u.weaken.turns > 0) {
      dmg *= u.weaken.mult;
      u.weaken.turns -= 1;
    }
    dealDamageToAlly(c, t, dmg);
  }

  function mobAct(c, u) {
    if (!u.alive || u.fled || c.result) return;
    // Контроль (задача 000045, ставится src/spells.js): скованный моб
    // пропускает ровно ОДНО действие (тик вместе с пропуском); пока
    // скован, прочие эффекты НЕ тикают (weaken тикает в mobAttack).
    if (u.bind && u.bind.turns > 0) {
      u.bind.turns -= 1;
      log(c, `${u.name} скован — пропускает действие.`);
      return;
    }
    // Расширенная модель целей (задача 000080): ближайшая цель СТОРОНЫ
    // ИГРОКА — игрок ИЛИ живой союзник (без этого гибель союзника
    // недостижима). При 0 союзников — всегда игрок: rectDist(u, игрок)
    // ≡ unitDist, шаги/атаки — бит-в-бит как до изменения.
    const target = nearestPlayerSide(c, u);
    const dToP = rectDist(u, target);
    const stepToTarget = () => stepTowardRect(c, u, target);
    const stepFromTarget = () => stepAwayRect(c, u, target);
    const attackTarget = () => (target.isPlayer
      ? mobAttack(c, u)
      : mobAttackAlly(c, u, target.unit));

    // Регенерация (водные стихийники).
    if (u.traits.regen) {
      u.hp = Math.min(u.maxHP, u.hp + Math.max(1, Math.round(u.maxHP * 0.1)));
    }

    // Пугливые: убегают при ранении; у верхней стены — уходят из боя.
    if (u.aggro === AGGRO.TIMID && u.hp < u.maxHP * FLEE_HP_FRAC) {
      if (u.y === 0) {
        u.fled = true;
        log(c, `${u.name} сбежал из боя!`);
        checkVictory(c);
        return;
      }
      stepFromTarget();
      return;
    }

    switch (u.role) {
      case MOB_ROLES.RANGED:
        // Держит дистанцию; при подходе паникует и отступает.
        if (dToP <= 1) {
          stepFromTarget();
          log(c, `${u.name} отступает.`);
          return;
        }
        if (dToP <= RANGED_MAX_DIST) attackTarget();
        else stepToTarget();
        return;
      case MOB_ROLES.SUPPORT:
        // Лечит самого раненого СОЮЗНОГО МОБА; в одиночку — бьёт сама.
        const allies = livingMobs(c).filter((a) => a !== u);
        const wounded = allies
          .filter((a) => a.hp < a.maxHP * 0.7)
          .sort((a, b) => a.hp / a.maxHP - b.hp / b.maxHP)[0];
        if (wounded) {
          const amount = 4 + u.level;
          wounded.hp = Math.min(wounded.maxHP, wounded.hp + amount);
          log(c, `${u.name} лечит ${wounded.name} (+${amount}).`);
        } else if (dToP <= 1) {
          attackTarget();
        } else {
          stepToTarget();
        }
        return;
      case MOB_ROLES.LEADER:
        // Бафф группы — на старте боя; сам лидер тоже дерётся.
        if (dToP <= 1) attackTarget();
        else stepToTarget();
        return;
      default: // melee, shield, swarm
        if (dToP <= 1) {
          attackTarget();
        } else {
          for (let i = 0; i < u.movePerTurn && !c.result; i++) {
            if (rectDist(u, target) <= 1) break;
            stepToTarget();
          }
        }
        return;
    }
  }

  // --- Ход союзника (задача 000080) ---

  // Атака союзника: бросок c._rng (hitChance от уровня союзника/цели),
  // урон — u.damage (мораль уже применена при создании) через
  // dealDamageToMob (гибель последнего моба → checkVictory — победа).
  function allyAttack(c, u, t) {
    if (c._rng() >= hitChance(u.level, 0, t.level, 0)) {
      log(c, `${u.name} промахивается.`);
      return;
    }
    // t — МОБ-цель (dealDamageToMob: 2-й аргумент — получающий урон).
    const r = dealDamageToMob(c, t, u.damage);
    log(c, `${u.name} бьёт ${t.name}: ${r.dmg}.`);
  }

  // Лечение support (задача 000080): каталог заклинаний читается ЛЕНИВО
  // из combatInternals.allySpells (UMD-ловушка 000038: в браузере
  // combat.js грузится ДО spells-data.js/spells.js; spells.js одной
  // строкой ставит каталог при загрузке). Без каталога/без лечебных
  // спеллов/без раненых — false → melee-фолбэк (задокументировано).
  // Заклинание — сильнейшая степень из СПИСКА СОЮЗНИКА u.spells
  // (действие «лечение»; тай-брейк — порядок списка). Цель — САМОГО
  // РАНЕНОГО пула [игрок, ...живые союзники] (порядок: игрок первым,
  // затем c.units): минимальная доля hp/maxHP; тай-брейк — порядок пула.
  // Формула — формула лечения spells.js с attrs союзника (у наёмника
  // attrs пуст → уровень): round((4 + 0.5·attr + ур)·(1 + 0.15·(степень−1))).
  // Игрок лечится P.heal; союзник — прямой hp (без c.ps-эффектов).
  function allyHeal(c, u) {
    const catalog = combatInternals.allySpells;
    if (!catalog) return false;
    let spell = null;
    for (const id of u.spells) {
      const s = catalog[id];
      if (!s || s['действие'] !== 'лечение') continue;
      if (!spell || s['степень'] > spell['степень']) spell = s;
    }
    if (!spell) return false;
    const p = c.player;
    const pMax = P.derived(p).maxHP;
    let best = null, bestFrac = null;
    const consider = (frac, ref) => {
      if (frac >= 1) return; // не ранен (включая «пере-HP» 9999/270)
      if (bestFrac == null || frac < bestFrac) { best = ref; bestFrac = frac; }
    };
    consider(p.hp / pMax, { player: true });
    for (const a of livingAllies(c)) consider(a.hp / a.maxHP, { unit: a });
    if (!best) return false;
    const amount = Math.round(
      (4 + 0.5 * ((u.attrs && u.attrs[spell['атрибут']]) || 0) + u.level) *
      (1 + 0.15 * (spell['степень'] - 1)));
    if (best.player) {
      P.heal(p, amount);
      log(c, `${u.name} лечит ${p.name} (+${amount}).`);
    } else {
      const a = best.unit;
      a.hp = Math.min(a.maxHP, a.hp + amount);
      log(c, `${u.name} лечит ${a.name} (+${amount}).`);
    }
    return true;
  }

  // ИИ союзника (аналог mobAct на нашей стороне, задача 000080):
  // цель — nearestEnemy (ближайший живой МОБ); роли:
  //  * melee/shield/swarm — шаг к цели (allyStepToward, movePerTurn)
  //    + атака при d≤1;
  //  * ranged — d≤1: отступление (allyStepAway, лог «отступает»);
  //    1<d≤RANGED_MAX_DIST: атака в даль БЕЗ сближения;
  //    d>RANGED_MAX_DIST: «кайтинг»-шаг (красные тесты 000080 пинят
  //    allyStepAway — см. memory/000080-ally-framework.md);
  //  * support — лечит самого раненого (игрок В пуле); нет раненого/
  //    заклинаний/каталога — melee-ветка.
  function allyAct(c, u) {
    if (!u.alive || u.fled || c.result) return;
    const t = nearestEnemy(c, u);
    if (!t) return; // врагов нет — бой кончается чужим checkVictory
    const d = rectDist(u, t);
    if (u.role === MOB_ROLES.RANGED) {
      if (d <= 1) {
        // Паника (красные тесты 000080): отступает, ПОКА враг в d ≤ 2 —
        // за свой ход враг сокращает дистанцию на 1, и тест пинит, что к
        // концу раунда (после хода врага) дистанция ВЫРОСЛА: отступление
        // должно закончиться при d ≥ 3. Застрял (углы/юниты) — выходит
        // из цикла, лог тот же (как у моба: лог не зависит от успеха шага).
        let dNow = d;
        while (dNow <= 2) {
          if (!allyStepAway(c, u, t)) break;
          dNow = rectDist(u, t);
        }
        log(c, `${u.name} отступает.`);
        return;
      }
      if (d <= RANGED_MAX_DIST) {
        allyAttack(c, u, t);
        return;
      }
      allyStepAway(c, u, t); // d > 4: зафиксированный тестом шаг
      return;
    }
    if (u.role === MOB_ROLES.SUPPORT && allyHeal(c, u)) return;
    // melee / shield / swarm / support-фолбэк: подход + атака при d≤1.
    if (d <= 1) {
      allyAttack(c, u, t);
      return;
    }
    for (let i = 0; i < u.movePerTurn && !c.result; i++) {
      if (rectDist(u, t) <= 1) break;
      allyStepToward(c, u, t);
    }
  }

  function endPlayerTurn(c) {
    const why = checkTurn(c);
    if (why) return;
    c.phase = 'mob';
    // c.turnIndex = позиция действующего в c.turnOrder (задача 000036):
    // 0 = игрок (уже ходил), 1..n = мобы. Фаза мобов идёт по УСТАРЕВШЕЙ
    // очереди: пересчёт turnOrder происходит в начале раунда (конец
    // прошлого endPlayerTurn), ТО ЕСТЬ ДО фазы игрока — поэтому моб,
    // убитый игроком, числится в очереди до конца раунда. Позиции
    // сохраняются: убитые/сбежавшие пропускаются, их слоты остаются
    // (UI-токен серый). Инвариант (регрессионным тестом): в момент
    // mobAct c.turnOrder[c.turnIndex] === id действующего моба. Мобы
    // не убивают друг друга — «разваливание» очереди только до фазы
    // мобов; побег пугливого моба — внутри собственного mobAct
    // (после присвоения turnIndex).
    for (let i = 1; i < (c.turnOrder || []).length; i++) {
      const u = c.units.find((x) => x.id === c.turnOrder[i]);
      if (!u || !u.alive || u.fled) continue; // слот пуст — токен серый
      c.turnIndex = i;
      // Союзник (000080) — allyAct, иначе mobAct; инвариант 000036
      // сохранён: c.turnOrder[c.turnIndex] = id действующего.
      if (u.side === 'ally') allyAct(c, u);
      else mobAct(c, u);
      // Бой закончился (игрок погиб) — turnIndex замирает на последнем
      // действовавшем юните; очередь в phase 'over' не пересчитывается.
      if (c.result) return;
    }

    // Новый ход игрока: пулы восстанавливаются от навыков.
    c.round += 1;
    c.phase = 'player';
    c.ps.blocked = false;
    refillPools(c);
    // Магический щит (задача 000045): тик в начале хода игрока (после
    // refillPools) — эффект держится ровно `turns` раундов, включая
    // раунд каста (защита в раунде каста — до этого тика).
    if (c.ps.shield && c.ps.shield.turns > 0) c.ps.shield.turns -= 1;
    // Новый раунд — новая очередь (задача 000036): из очереди вышли
    // мёртвые и сбежавшие мобы, turnIndex возвращается к игроку.
    c.turnOrder = buildTurnOrder(c);
    c.turnIndex = 0;
    // Отравление тикает в начале хода игрока.
    if (c.ps.poison > 0) {
      c.ps.poison -= 1;
      P.takeDamage(c.player, POISON_TICK);
      log(c, `Яд: −${POISON_TICK} HP.`);
      if (!c.player.alive) {
        c.phase = 'over';
        c.result = { outcome: 'dead' };
        log(c, 'Вы погибли...');
        return;
      }
    }
    c.targetId = (nearestMob(c) || {}).id || null;
  }

  function refillPools(c) {
    const p = c.player;
    const d = P.derived(p);
    c.ps.moveLeft = d.moveCells;
    c.ps.attack = d.attackActions;
    c.ps.spellInt = d.spellActionsInt;
    c.ps.spellWis = d.spellActionsWis;
    c.ps.quickItem = 1 + Math.floor(p.primary.dexterity / 10);
    c.ps.invItem = 1; // «Удача» появится вместе с инвентарём
    c.ps.block = 1;
  }

  // --- Создание боя ---

  // Сложность боя (задача 000027): имя из opts.difficulty, иначе настройка
  // combat_difficulty. Таблица множителей — settings.SETTINGS.combat_difficulties;
  // неизвестное имя деградирует до настроенной сложности, затем 'medium',
  // затем к 1/1 (бой «как в старой версии»).
  function resolveDifficulty(name) {
    const table = (settings.SETTINGS.combat_difficulties || {});
    const cur = settings.SETTINGS.combat_difficulty;
    const d = (name != null && table[name])
      ? table[name]
      : (table[cur] || table.medium || { hp: 1, damage: 1 });
    return (d && typeof d.hp === 'number' && typeof d.damage === 'number')
      ? d : (table.medium || { hp: 1, damage: 1 });
  }

  // Расстановка мобов на поле (задача 000040): детерминированно,
  // без RNG. Большие мобы (w*h > 1) ставятся первыми (больше площадь —
  // раньше), поиск места — построчно сверху. Остальные (1x1) занимают
  // прежние якоря (xs, верхние две строки); если якорь занят большим —
  // построчный обход со сдвигом. Занятость — локальная сетка: не
  // зависит от координат ещё не поставленных юнитов.
  function placeUnits(c, units) {
    const occ = new Set();
    const free = (x, y, w, h) => {
      if (x < 0 || y < 0 || x + w > c.width || y + h > c.height) return false;
      for (let yy = y; yy < y + h; yy++) {
        for (let xx = x; xx < x + w; xx++) {
          if ((xx === c.px && yy === c.py) || occ.has(xx + ',' + yy)) return false;
        }
      }
      return true;
    };
    const occupy = (u) => {
      for (let yy = u.y; yy < u.y + u.size.h; yy++) {
        for (let xx = u.x; xx < u.x + u.size.w; xx++) occ.add(xx + ',' + yy);
      }
    };
    const big = [], small = [];
    units.forEach((u, i) => (u.size.w * u.size.h > 1 ? big : small).push({ u, i }));
    big.sort((a, b) => b.u.size.w * b.u.size.h - a.u.size.w * a.u.size.h
      || a.i - b.i);
    const scan = (w, h) => {
      for (let y = 0; y + h <= c.height; y++) {
        for (let x = 0; x + w <= c.width; x++) {
          if (free(x, y, w, h)) return [x, y];
        }
      }
      return null;
    };
    for (const { u } of big) {
      const spot = scan(u.size.w, u.size.h);
      if (!spot) throw new Error('нет места для моба ' + u.mobId);
      u.x = spot[0]; u.y = spot[1];
      occupy(u);
    }
    const xs = [1, 3, 5, 0, 2, 4];
    for (const { u, i } of small) {
      const ax = xs[i % xs.length], ay = i < 3 ? 0 : 1;
      if (free(ax, ay, 1, 1)) {
        u.x = ax; u.y = ay;
      } else {
        const spot = scan(1, 1);
        if (!spot) throw new Error('нет места для моба ' + u.mobId);
        u.x = spot[0]; u.y = spot[1];
      }
      occupy(u);
    }
  }

  // Расстановка СОЮЗНИКОВ (задача 000080): рядом с игроком (низ поля).
  // Детерминированные якоря вокруг (c.px, c.py) В ПОРЯДКЕ массива allies:
  //   (px−1, py−1), (px+1, py−1), (px, py−1), (px−1, py), (px+1, py)
  // — все в d≤2 от старта; при занятости — построчный скан СНИЗУ
  // (от нижнего края вверх, слева направо). БЕЗ бросков c._rng
  // (поток RNG боя не меняется; один сид → одна расстановка).
  // Занятость — игрок + все уже расставленные мобы (c.units до
  // конкатенации союзников). Мест нет — throw (как у мобов).
  function placeAllies(c, allies) {
    const occ = new Set([c.px + ',' + c.py]);
    for (const u of c.units) {
      for (let yy = u.y; yy < u.y + (u.size.h || 1); yy++) {
        for (let xx = u.x; xx < u.x + (u.size.w || 1); xx++) {
          occ.add(xx + ',' + yy);
        }
      }
    }
    const free = (x, y) => x >= 0 && y >= 0 && x < c.width && y < c.height
      && !occ.has(x + ',' + y);
    const anchors = [
      [c.px - 1, c.py - 1], [c.px + 1, c.py - 1], [c.px, c.py - 1],
      [c.px - 1, c.py], [c.px + 1, c.py],
    ];
    for (const u of allies) {
      let spot = null;
      for (const [ax, ay] of anchors) {
        if (free(ax, ay)) { spot = [ax, ay]; break; }
      }
      if (!spot) {
        outer: for (let y = c.height - 1; y >= 0; y--) {
          for (let x = 0; x < c.width; x++) {
            if (free(x, y)) { spot = [x, y]; break outer; }
          }
        }
      }
      if (!spot) throw new Error('нет места для союзника ' + (u.name || u.id));
      u.x = spot[0]; u.y = spot[1];
      occ.add(u.x + ',' + u.y);
    }
  }

  // Препятствия (задача 000050): случайные непроходимые клетки поля.
  // Вызывается в createCombat РОВНО между placeUnits (нужны стартовые
  // прямоугольники мобов) и refillPools — порядок потока c._rng:
  // delta-roll и count-roll (волчья стая) → placeUnits (без RNG) →
  // generateObstacles → refillPools/targetId (без RNG).
  //
  // Алгоритм (ВСЕ броски — c._rng, детерминизм по сиду; последователь
  // «1 бросок на target + 2 на кандидата» закреплена — не менять):
  //   area = width×height;
  //   min  = round(combat_obstacle_min_frac × area);
  //   max  = round(combat_obstacle_max_frac × area) (live-чтение
  //           settings.SETTINGS, паттерн level_delta_max; guard max<min);
  //   target = min + floor(c._rng() × (max − min + 1)) — ОДИН бросок;
  //   цикл (лимит MAX_OBSTACLE_TRIES попыток, guard ≤ 500):
  //     x = floor(c._rng() × width), y = floor(c._rng() × height) —
  //     ДВА броска на кандидата;
  //     клетка в reserved (старт игрока + ВСЕ клетки стартовых
  //     прямоугольников мобов) или уже занята — continue;
  //     иначе добавить и проверить достижимость: BFS из старта игрока
  //     по НЕ-препятствиям (мобы игнорируя) обязан достигать ≥1 клетки
  //     стартового прямоугольника КАЖДОГО моба; нарушение — удалить
  //     только что добавленную клетку («перегенерация» той же клетки
  //     следующим кандидатом) и продолжить;
  //   лимит попыток дошёл раньше target — меньше препятствий
  //   (допустимый фолбэк: поле играбельно, плотность ниже min).
  // При max_frac ≤ 0 бросков НЕТ вообще — поток c._rng совпадает с
  // боем без генерации (критично для снэпшот-тестов).
  const MAX_OBSTACLE_TRIES = 500;
  function generateObstacles(c) {
    c.obstacles = new Set();
    const area = c.width * c.height;
    const minFrac = Number(settings.SETTINGS.combat_obstacle_min_frac) || 0;
    const maxFrac = Number(settings.SETTINGS.combat_obstacle_max_frac) || 0;
    let min = Math.round(minFrac * area);
    let max = Math.round(maxFrac * area);
    if (max < min) max = min;
    if (max <= 0) return;
    const target = min + Math.floor(c._rng() * (max - min + 1));
    // Зарезервировано: клетка старта игрока + все клетки стартовых
    // прямоугольников всех мобов (placeUnits уже расставил юнитов).
    const reserved = new Set([c.px + ',' + c.py]);
    for (const u of c.units) {
      for (let yy = u.y; yy < u.y + (u.size.h || 1); yy++) {
        for (let xx = u.x; xx < u.x + (u.size.w || 1); xx++) {
          reserved.add(xx + ',' + yy);
        }
      }
    }
    const mobReachable = () => {
      const reach = reachableCells(c);
      for (const u of c.units) {
        let hit = false;
        for (let yy = u.y; yy < u.y + (u.size.h || 1) && !hit; yy++) {
          for (let xx = u.x; xx < u.x + (u.size.w || 1); xx++) {
            if (reach.has(xx + ',' + yy)) { hit = true; break; }
          }
        }
        if (!hit) return false;
      }
      return true;
    };
    for (let i = 0; i < MAX_OBSTACLE_TRIES && c.obstacles.size < target; i++) {
      const x = Math.floor(c._rng() * c.width);
      const y = Math.floor(c._rng() * c.height);
      const k = x + ',' + y;
      if (reserved.has(k) || c.obstacles.has(k)) continue;
      c.obstacles.add(k);
      if (!mobReachable()) c.obstacles.delete(k); // нарушение — перегенерация
    }
  }

  // Задача 000076: нормализация opts.buffMods (благословения храма,
  // 000072). Не-объект/мусор — нейтральный дефолт (fail-open, 000029):
  // бой не падает. damageMult — число > 0, armor — число >= 0;
  // невалидное поле — дефолт (неполный объект доводится до полного).
  function normalizeBuffMods(m) {
    const out = { damageMult: 1, armor: 0 };
    if (!m || typeof m !== 'object' || Array.isArray(m)) return out;
    const dm = m.damageMult;
    if (typeof dm === 'number' && Number.isFinite(dm) && dm > 0) {
      out.damageMult = dm;
    }
    const ar = m.armor;
    if (typeof ar === 'number' && Number.isFinite(ar) && ar >= 0) {
      out.armor = ar;
    }
    return out;
  }

  /**
   * Создаёт бой.
   * @param {object} opts
   * @param {object} opts.player    персонаж (модифицируется: hp/mp/опыт/золото)
   * @param {number} opts.groupType тип группы (MOB_GROUP_TYPES из map.js, 0..6)
   * @param {string} [opts.groupName] название группы для логов
   * @param {number} [opts.width=7]  ширина мини-карты
   * @param {number} [opts.height=7] высота мини-карты
   * @param {number} [opts.seed]     сид RNG (детерминированный бой)
   * @param {function} [opts.rng]    готовый RNG () => [0..1)
   * @param {number} [opts.levelDeltaMax] разброс уровня мобов (SPEC: N;
   *   по умолчанию level_delta_max из src/global-settings.js)
   * @param {string} [opts.difficulty] сложность ('easy'/'medium'/'hard';
   *   по умолчанию combat_difficulty из src/global-settings.js)
   * @param {Array<object>} [opts.allies] союзные юниты (задача 000080):
   *   массив data для makeAlly — { name, role: 'melee'|'ranged'|'shield'|
   *   'support', level, dmg, hp, armor?, skills?, spells?, attrs?, kind?,
   *   id?, maxHP?, damage? }. Без allies — бой БИТ-В-БИТ как без 000080
   *   (расстановка союзников не потребляет c._rng).
   * @param {{damageMult?: number, armor?: number}} [opts.buffMods]
   *   благословения храма (задача 000076, 000072): { damageMult —
   *   множитель урона игрока (удар/стрельба/заклинания), armor —
   *   +броня игрока } из day.js buffMods(buffs, day). Нормализуется в
   *   c.buffMods (дефолт { damageMult: 1, armor: 0 }; мусор — дефолт,
   *   fail-open). Дефолт — бой БИТ-В-БИТ как без 000076 (×1/−0),
   *   НОЛЬ новых вызовов c._rng (детерминизм 000080/000082).
   * @returns {object} объект боя c. Поле c.obstacles (задача 000050) —
   *   Set 'x,y' непроходимых клеток (может быть пустым); генерация —
   *   generateObstacles, детерминирована по сиду. Поле c.buffMods
   *   (задача 000076) — нормализованные { damageMult, armor }.
   */
  function createCombat(opts) {
    const p = opts.player;
    const rng = opts.rng || mulberry32(opts.seed != null ? opts.seed : 12345);
    const N = opts.levelDeltaMax != null ? opts.levelDeltaMax
      : settings.SETTINGS.level_delta_max;
    const difficulty = opts.difficulty != null
      ? opts.difficulty : settings.SETTINGS.combat_difficulty;
    const diff = resolveDifficulty(opts.difficulty);
    const width = opts.width || 7;
    const height = opts.height || 7;
    // Игровой день (для «раз в день» эффектов, напр. Несокрушимость).
    const day = opts.day != null ? opts.day : 0;

    let ids, level, recipe;
    if (Array.isArray(opts.mobs)) {
      // Произвольный состав (блуждающие группы подземелий, кастомные бои).
      ids = opts.mobs;
      level = Math.max(1, opts.mobLevel != null ? opts.mobLevel : p.level);
      recipe = null;
    } else {
      // Уровень группы = уровень персонажа + дельта [-N; +N] — «в среднем
      // можно победить» (SPEC.md).
      const delta = Math.floor(rng() * (2 * N + 1)) - N;
      level = Math.max(1, p.level + delta);
      recipe = GROUP_RECIPES[opts.groupType];
      if (!recipe) throw new Error('неизвестный тип группы: ' + opts.groupType);
      ids = recipe.mobs.slice();
      if (recipe.count) {
        const n = recipe.count[0] + Math.floor(rng() * (recipe.count[1] - recipe.count[0] + 1));
        ids = new Array(n).fill(recipe.mobs[0]);
      }
    }
    const hasLeader = ids.some((id) => MOB_TYPES[id].role === MOB_ROLES.LEADER);
    const mobs = ids.map((mobId, i) => makeMob(mobId, level, i, hasLeader, diff));
    // Союзники (задача 000080): данные отряда (000078/000079) или Эфира
    // (000081) — формат makeAlly. Мораль: урон ВСЕХ союзников ×
    // (1 + companionMoraleBonus) — навык ПРЕДВОДИТЕЛЬ персонажа
    // (src/player.js, +5%/уровень); НЕ вражеский hasLeader (бафф ГРУППЫ
    // МОБОВ — другая сущность, регрессионный тест).
    const moraleMult = 1 + (P.derived(p).companionMoraleBonus || 0);
    const allies = (Array.isArray(opts.allies) ? opts.allies : [])
      .map((d, i) => makeAlly(d, i, moraleMult));

    const c = {
      player: p,
      width,
      height,
      groupType: opts.groupType,
      groupName: opts.groupName || (recipe ? recipe.name : 'блуждающая группа'),
      difficulty,
      units: mobs,
      // Препятствия (задача 000050): Set 'x,y', всегда есть (может быть
      // пустым); заполняется generateObstacles ниже.
      obstacles: new Set(),
      px: Math.floor(width / 2),
      py: height - 1,
      round: 1,
      phase: 'player',
      result: null,
      // Очередь хода (задача 000036, 000080):
      // ['player', ...id живых союзников, ...id живых мобов];
      // пересчитывается в начале каждого раунда (createCombat/endPlayerTurn).
      turnOrder: null,
      // Индекс действующего в turnOrder: 0 в phase 'player',
      // 1..n в phase 'mob'; при c.result — замирает на последнем действовавшем.
      turnIndex: 0,
      log: [],
      targetId: null,
      ps: {
        moveLeft: 0, attack: 0, spellInt: 0, spellWis: 0,
        quickItem: 0, invItem: 0, block: 0,
        blocked: false, poison: 0,
        // Магический щит (задача 000045, src/spells.js): временная броня.
        // Новый бой — всегда чистое состояние (эффекты не переносятся).
        shield: { armor: 0, turns: 0 },
      },
      _rng: rng,
      day,
      // Задача 000076: благословения храма (000072) — ПАРАМЕТР боя,
      // не поле персонажа (derived не трогается). Дефолт ×1/−0 —
      // бит-в-бит как без 000076.
      buffMods: normalizeBuffMods(opts.buffMods),
    };
    // Мобы — в верхней части, игрок — в центре нижнего края.
    placeUnits(c, mobs);
    // Союзники (000080) — рядом с игроком (низ поля); ДО generateObstacles,
    // чтобы их клетки попали в reserved (reserved строится из c.units).
    // placeAllies — ДО конкатенации: occ-сетка строится из c.units, а
    // неразставленный makeAlly-юнит сидит на x=y=0 — при конкатенации
    // раньше расстановки клетка (0,0) ложно числилась занятой и скан
    // «снизу вверх» (где (0,0) — последняя клетка) мог бросить «нет
    // места» при свободной (0,0) (раунд ревью 2).
    if (allies.length) {
      placeAllies(c, allies);
      c.units = c.units.concat(allies);
    }
    // Препятствия (задача 000050): ПОСЛЕ расстановки (стартовые
    // прямоугольники мобов + клетки союзников — reserved-клетки),
    // ДО любых в-бою RNG-бросков.
    generateObstacles(c);
    refillPools(c);
    log(c, `Бой: ${c.groupName} (уровень ${level}, мобы ${mobs.length}).`);
    if (hasLeader) log(c, 'Лидер вдохновляет группу: +5% урона, +5% защиты.');
    c.targetId = (nearestMob(c) || {}).id || null;
    // Начало боя: все мобы живы — очередь собрана, turnIndex указывает
    // на игрока (игрок ходит первым).
    c.turnOrder = buildTurnOrder(c);
    c.turnIndex = 0;

    // Публичные действия.
    c.attack = (targetId) => playerAttack(c, targetId);
    c.spell = (school, targetId) => playerSpell(c, school, targetId);
    c.block = () => playerBlock(c);
    c.move = (dx, dy) => playerMove(c, dx, dy);
    c.flee = () => playerFlee(c);
    c.quickItem = (slot) => playerQuickItem(c, slot);
    c.invItem = (itemId) => playerInvItem(c, itemId);
    c.selectTarget = (targetId) => playerSelectTarget(c, targetId);
    c.endTurn = () => endPlayerTurn(c);
    return c;
  }

  // Боевые internals для src/spells.js (задача 000045): применение
  // заклинания в бою переиспользует проверки и урон ядра. ОДНОБАЗОВЫЙ
  // объект (node-require кэш и браузерный Game.combatInternals — одна
  // ссылка): spells.js при загрузке дописывает сюда allySpells
  // (задача 000080) — ленивый каталог для ИИ support-союзника.
  const combatInternals = {
    log, nearestMob, unitDist, checkTurn, checkBlocked, dealDamageToMob,
  };

  return {
    MOB_ROLES, ROLE_NAMES, AGGRO, MOB_TYPES, GROUP_RECIPES,
    LEADER_DMG_MULT, LEADER_DEF_MULT,
    PRACTICE_XP,
    hitChance, createCombat, resolveDifficulty, canDoAction, buildTurnOrder,
    // Союзники (задача 000080): союзный юнит 1×1 из данных.
    makeAlly,
    // Препятствия (задача 000050): достижимость клеток от игрока по
    // не-препятствиям — чистая функция для тестов.
    reachableCells,
    combatInternals,
  };
});

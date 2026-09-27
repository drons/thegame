// Боевая система: мини-карта боя, пошаговые ходы (SPEC.md, разделы
// «Боевая система» и «Мобы»).
//
// Чистое ядро без DOM — тестируется в node (tests/combat.test.js).
// Все случайности идут через combat._rng (mulberry32), поэтому бой
// детерминирован при фиксированном сиде.
//
// Униформный модуль: в браузере — globalThis.Game, в node — require().
// Зависимости: perlin.js (mulberry32), player.js (derived/takeDamage/heal/addXp),
// global-settings.js (level_delta_max, combat_difficulty/combat_difficulties).

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('./perlin.js'), require('./player.js'), require('./items.js'),
      require('./global-settings.js'));
  } else {
    root.Game = Object.assign({}, root.Game,
      factory(typeof root.Game === 'object' ? root.Game : {}, root.Game,
        root.Game, root.Game && root.Game.GlobalSettings));
  }
})(typeof globalThis !== 'undefined' ? globalThis : self,
  function (perlin, P, I, settings) {

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
  const GROUP_RECIPES = {
    0: { name: 'orc_camp', mobs: ['orc_warrior', 'orc_warrior', 'orc_archer', 'orc_shaman'] },
    1: { name: 'orc_raid', mobs: ['orc_rider', 'orc_rider', 'orc_mad'] },
    2: { name: 'skeleton_den', mobs: ['skeleton', 'skeleton', 'skeleton', 'crawling_bones', 'crawling_bones'] },
    3: { name: 'wolf_pack', count: [3, 6], mobs: ['wolf'] },
    4: { name: 'spider_nest', mobs: ['spider', 'spider', 'spider', 'centipede'] },
    5: { name: 'elemental_circle', mobs: ['fire_elemental', 'wind_elemental', 'water_elemental', 'fairy'] },
    6: { name: 'abyss_spirit', mobs: ['abomination', 'lower_demon', 'succubus'] },
  };

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

  function unitAt(c, x, y) {
    return c.units.find((u) => u.alive && !u.fled
      && x >= u.x && x < u.x + (u.size.w || 1)
      && y >= u.y && y < u.y + (u.size.h || 1));
  }

  function inBounds(c, x, y) {
    return x >= 0 && y >= 0 && x < c.width && y < c.height;
  }

  // Прямоугольник w×h с якорем (x, y) свободно: в пределах поля,
  // не на игроке и не пересекает других живых юнитов (ignore — сам
  // перемещающийся юнит).
  function rectFree(c, x, y, w, h, ignore) {
    if (x < 0 || y < 0 || x + w > c.width || y + h > c.height) return false;
    if (x <= c.px && c.px < x + w && y <= c.py && c.py < y + h) return false;
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) {
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

  function nearestMob(c) {
    let best = null;
    for (const u of c.units) {
      if (!u.alive || u.fled) continue;
      if (!best || unitDist(c, u) < unitDist(c, best)) best = u;
    }
    return best;
  }

  function livingMobs(c) {
    return c.units.filter((u) => u.alive && !u.fled);
  }

  function log(c, msg) {
    c.log.push(msg);
  }

  // Один шаг к игроку (сначала большая ось; если занято — другая).
  // Для многоклеточных мобов — шаг всего прямоугольника;
  // направление — по расстоянию от соответствующего края до игрока.
  function stepToward(c, u) {
    const w = u.size.w || 1, h = u.size.h || 1;
    const x1 = u.x + w - 1, y1 = u.y + h - 1;
    const sx = c.px < u.x ? -1 : (c.px > x1 ? 1 : 0);
    const sy = c.py < u.y ? -1 : (c.py > y1 ? 1 : 0);
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

  // Один шаг от игрока (паника, отступление).
  function stepAway(c, u) {
    const d0 = unitDist(c, u);
    const w = u.size.w || 1, h = u.size.h || 1;
    for (const [sx, sy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const nx = u.x + sx, ny = u.y + sy;
      if (!rectFree(c, nx, ny, w, h, u)) continue;
      const u2 = { x: nx, y: ny, size: u.size };
      if (unitDist({ px: c.px, py: c.py, units: [] }, u2) > d0) {
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

  // Урон по игроку (блок → броня → «Железная кожа» через P.takeDamage).
  // Возвращает фактический урон (для вампиризма).
  function dealDamageToPlayer(c, raw) {
    const p = c.player;
    const d = P.derived(p);
    let dmg = raw;
    if (c.ps.blocked) {
      dmg *= 1 - Math.min(0.6, 0.2 + 0.02 * p.primary.constitution);
    }
    dmg = Math.max(0, Math.round(dmg) - d.armor - I.equipmentStats(p).armor);
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

  function checkVictory(c) {
    if (c.result) return;
    const left = livingMobs(c);
    if (left.length > 0) return;
    c.phase = 'over';
    const killed = c.units.filter((u) => !u.alive);
    // Опыт за победу: сумма опыта поверженных мобов (assets/mobs, xp =
    // base + perLevel * уровень моба; задача 000022).
    const xp = killed.reduce(
      (s, u) => s + Math.round(u.xp.base + u.xp.perLevel * u.level), 0);
    const gold = killed.reduce((s, u) => s + Math.round(3 + 2 * u.level + c._rng() * u.level), 0);
    if (killed.length > 0) {
      P.addXp(c.player, xp);
      c.player.gold += gold;
      c.result = { outcome: 'victory', xp, gold, defeated: killed.length };
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
    if (!t || !t.alive || t.fled) return { ok: false, reason: 'нет цели' };
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
      if (!t || !t.alive || t.fled) return { ok: false, reason: 'нет цели' };
      if (unitDist(c, t) > SPELL_MAX_DIST) return { ok: false, reason: 'цель слишком далеко (дальность 4)' };
      c.ps.spellInt -= 1;
      p.mp -= 3;
      // Заклинание: всегда попадает, игнорирует броню.
      const dmg = Math.round((3 + 0.5 * p.primary.intelligence) * (1 + d.fireDamageBonus));
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
      const hp = P.heal(p, amount);
      log(c, `Исцеление: ${hp}.`);
      // Практика: каст даёт опыт «Медитации» (задача 000013).
      const pr = P.skillPractice(p, 'meditation', PRACTICE_XP.spell);
      return {
        ok: true, hp,
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
    if (unitAt(c, nx, ny)) return { ok: false, reason: 'тут стоит моб' };
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
    if (!t || !t.alive || t.fled) return { ok: false, reason: 'недоступная цель' };
    c.targetId = targetId;
    return { ok: true };
  }

  // --- Ход мобов ---

  function mobAttack(c, u) {
    const p = c.player;
    const d = P.derived(p);
    if (c._rng() >= hitChance(u.level, 0, p.level, d.dodgeBonus)) {
      log(c, `${u.name} промахивается.`);
      return;
    }
    const dealt = dealDamageToPlayer(c, u.damage);
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

  function mobAct(c, u) {
    if (!u.alive || u.fled || c.result) return;
    const dToP = unitDist(c, u);

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
      stepAway(c, u);
      return;
    }

    switch (u.role) {
      case MOB_ROLES.RANGED:
        // Держит дистанцию; при подходе паникует и отступает.
        if (dToP <= 1) {
          stepAway(c, u);
          log(c, `${u.name} отступает.`);
          return;
        }
        if (dToP <= RANGED_MAX_DIST) mobAttack(c, u);
        else stepToward(c, u);
        return;
      case MOB_ROLES.SUPPORT:
        // Лечит самого раненого союзника; в одиночку — бьёт сама.
        const allies = livingMobs(c).filter((a) => a !== u);
        const wounded = allies
          .filter((a) => a.hp < a.maxHP * 0.7)
          .sort((a, b) => a.hp / a.maxHP - b.hp / b.maxHP)[0];
        if (wounded) {
          const amount = 4 + u.level;
          wounded.hp = Math.min(wounded.maxHP, wounded.hp + amount);
          log(c, `${u.name} лечит ${wounded.name} (+${amount}).`);
        } else if (dToP <= 1) {
          mobAttack(c, u);
        } else {
          stepToward(c, u);
        }
        return;
      case MOB_ROLES.LEADER:
        // Бафф группы — на старте боя; сам лидер тоже дерётся.
        if (dToP <= 1) mobAttack(c, u);
        else stepToward(c, u);
        return;
      default: // melee, shield, swarm
        if (dToP <= 1) {
          mobAttack(c, u);
        } else {
          for (let i = 0; i < u.movePerTurn && !c.result; i++) {
            if (unitDist(c, u) <= 1) break;
            stepToward(c, u);
          }
        }
        return;
    }
  }

  function endPlayerTurn(c) {
    const why = checkTurn(c);
    if (why) return;
    c.phase = 'mob';
    for (const u of c.units) {
      mobAct(c, u);
      if (c.result) break;
    }
    if (c.result) return;

    // Новый ход игрока: пулы восстанавливаются от навыков.
    c.round += 1;
    c.phase = 'player';
    c.ps.blocked = false;
    refillPools(c);
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
    const units = ids.map((mobId, i) => makeMob(mobId, level, i, hasLeader, diff));

    const c = {
      player: p,
      width,
      height,
      groupType: opts.groupType,
      groupName: opts.groupName || (recipe ? recipe.name : 'блуждающая группа'),
      difficulty,
      units,
      px: Math.floor(width / 2),
      py: height - 1,
      round: 1,
      phase: 'player',
      result: null,
      log: [],
      targetId: null,
      ps: {
        moveLeft: 0, attack: 0, spellInt: 0, spellWis: 0,
        quickItem: 0, invItem: 0, block: 0,
        blocked: false, poison: 0,
      },
      _rng: rng,
      day,
    };
    // Мобы — в верхней части, игрок — в центре нижнего края.
    placeUnits(c, units);
    refillPools(c);
    log(c, `Бой: ${c.groupName} (уровень ${level}, мобы ${units.length}).`);
    if (hasLeader) log(c, 'Лидер вдохновляет группу: +5% урона, +5% защиты.');
    c.targetId = (nearestMob(c) || {}).id || null;

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

  return {
    MOB_ROLES, ROLE_NAMES, AGGRO, MOB_TYPES, GROUP_RECIPES,
    LEADER_DMG_MULT, LEADER_DEF_MULT,
    PRACTICE_XP,
    hitChance, createCombat, resolveDifficulty,
  };
});

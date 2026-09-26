// Персонаж: статы, навыки, опыт и уровни (SPEC.md, раздел «Навыки»).
//
// Чистое ядро без DOM — тестируется в node (tests/player.test.js).
// Униформный модуль: в браузере — globalThis.Game, в node — require().
// Данные каталога навыков (основные и вторичные) — из униформного
// модуля skills-data.js: зеркала каталога assets/skills (source of truth).

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./skills-data.js'));
  } else {
    root.Game = Object.assign({}, root.Game,
      factory(root.Game && root.Game.SkillsData));
  }
})(typeof globalThis !== 'undefined' ? globalThis : self, function (skills) {

  if (!skills || !Array.isArray(skills.PRIMARY_SKILLS) ||
      !skills.SECONDARY_SKILLS || typeof skills.SECONDARY_SKILLS !== 'object') {
    throw new Error(
      'player.js: не найден каталог навыков — загрузите skills-data.js до player.js');
  }

  // --- Основные навыки (assets/skills, source of truth) ---
  const PRIMARY_SKILLS = skills.PRIMARY_SKILLS;

  // --- Вторичные навыки (assets/skills, source of truth) ---
  // requires: null | { skill: 'basic'|'secondary', level: N }
  // effect: { stat, perLevel } — доля эффекта за уровень (0.05 = 5%)
  const SECONDARY_SKILLS = skills.SECONDARY_SKILLS;

  // --- Ранги навыков (SPEC.md, раздел «Навыки») ---
  const RANKS = [
    { min: 1, max: 10, name: 'Новичок' },
    { min: 11, max: 25, name: 'Ученик' },
    { min: 26, max: 50, name: 'Знаток' },
    { min: 51, max: 75, name: 'Мастер' },
    { min: 76, max: 99, name: 'Гроссмейстер' },
    { min: 100, max: 100, name: 'Легенда' },
  ];

  const MAX_SKILL_LEVEL = 100;
  const POINTS_PER_LEVEL = 2; // параметр points_per_level (SPEC.md)

  function rankOf(level) {
    for (const r of RANKS) {
      if (level >= r.min && level <= r.max) return r;
    }
    return RANKS[RANKS.length - 1];
  }

  // Название вторичного навыка для уровня (имя меняется по рангам, SPEC.md).
  function secondaryName(id, level) {
    const s = SECONDARY_SKILLS[id];
    if (!s) return id;
    return s.names[rankIndex(level)] || s.names[0];
  }

  function rankIndex(level) {
    for (let i = 0; i < RANKS.length; i++) {
      if (level >= RANKS[i].min && level <= RANKS[i].max) return i;
    }
    return RANKS.length - 1;
  }

  // Опыт, необходимый для перехода с уровня level на level+1.
  function xpForNext(level) {
    return Math.round(50 * Math.pow(level, 1.5));
  }

  /**
   * Создаёт персонажа.
   * @returns объект персонажа (mutable)
   */
  function createCharacter(name = 'Флогистон') {
    const c = {
      name,
      level: 1,
      xp: 0,
      totalXp: 0,
      gold: 100,
      hp: 0,
      mp: 0,
      points: 0, // неистраченные очки навыков
      primary: {
        strength: 1, dexterity: 1, constitution: 1,
        intelligence: 1, wisdom: 1, charisma: 1,
      },
      secondary: {}, // id -> уровень
      alive: true,
    };
    const d = derived(c);
    c.hp = d.maxHP;
    c.mp = d.maxMP;
    return c;
  }

  // Производные характеристики из навыков (все формулы из SPEC.md).
  function derived(c) {
    const P = c.primary;
    const S = (id) => c.secondary[id] || 0;
    const pct = (id) => SECONDARY_SKILLS[id].effect.perLevel * S(id);

    const maxHPMult = 1 + pct('endurance') + pct('golem');
    const maxHP = Math.round((20 + P.constitution * 5) * maxHPMult);
    const maxMP = 10 + (P.intelligence + P.wisdom) * 3;
    const armor = S('golem'); // +1 броня за уровень «Голем»

    return {
      maxHP,
      maxMP,
      armor,
      // Ход в бою: X клеток (Ловкость), Y действий (основной навык действия).
      moveCells: 3 + Math.floor(P.dexterity / 5),
      attackActions: 1 + Math.floor(P.strength / 10),
      spellActionsInt: 1 + Math.floor(P.intelligence / 10),
      spellActionsWis: 1 + Math.floor(P.wisdom / 10),
      // Точность и урон.
      swordHitBonus: pct('swordsman'),
      archerHitBonus: pct('archer'),
      heavyDamageBonus: pct('heavy'),
      fistDamageBonus: pct('fists'),
      rangedDamageBonus: pct('accuracy'),
      fireDamageBonus: pct('firelord'),
      iceDamageBonus: pct('icelord'),
      // Защита.
      damageTakenMult: Math.max(0.1, 1 + pct('hide')),
      dodgeBonus: pct('precog'),
      survivalChance: Math.min(1, pct('unkill')),
      magicResistMult: 1 + pct('perception'),
      // Карта мира и приключения.
      carryWeightMult: 1 + pct('back'),
      moveSpeedMult: 1 + pct('step'),
      caveVisionMult: 1 + pct('catseye'),
      acroBonus: pct('acro'),
      thiefBonus: pct('thief'),
      dialogueBonus: Math.round(S('elder') * 1 + S('orator') * 1),
      companionMoraleBonus: pct('leader'),
      performanceIncomeMult: 1 + pct('artist'),
      fearChance: Math.min(0.75, pct('fright')),
      // Зелья, еда, руны, опыт.
      potionPowerMult: 1 + pct('alchemy'),
      foodPowerMult: 1 + pct('nature'),
      runePowerMult: 1 + pct('runes'),
      xpMult: 1 + pct('scholar'),
      // Экономика.
      buyPriceMult: Math.max(0.3, 1 + pct('merchant')),
      sellPriceMult: 1 - pct('merchant'), // pct('merchant') отрицателен
      // Прочность снаряжения.
      equipmentDurabilityMult: 1 + pct('forge'),
      // Восстановление между днями (доля от максимума за день, SPEC «Игровое время»).
      hpRegenMult: 0.10 + pct('breath') + pct('meditation'),
      mpRegenMult: 0.10 + pct('meditation'),
    };
  }

  // Можно ли поднять навык? target — id основного или вторичного.
  // @returns {{ ok: boolean, reason?: string }}
  function canRaise(c, target) {
    if (!c.alive) return { ok: false, reason: 'персонаж погиб' };
    if (c.points < 1) return { ok: false, reason: 'нет свободных очков навыков' };
    if (PRIMARY_SKILLS.some((p) => p.id === target)) {
      if (c.primary[target] >= MAX_SKILL_LEVEL) return { ok: false, reason: 'максимальный уровень' };
      return { ok: true };
    }
    const s = SECONDARY_SKILLS[target];
    if (!s) return { ok: false, reason: 'неизвестный навык' };
    const lvl = c.secondary[target] || 0;
    if (lvl >= MAX_SKILL_LEVEL) return { ok: false, reason: 'максимальный уровень' };
    // Требование к основному навыку.
    if (c.primary[s.primary] < 1) return { ok: false, reason: 'недостаточно: ' + primaryName(s.primary) };
    // Требование к другому навыку (ветка дерева).
    if (s.requires) {
      const need = s.requires;
      const have = need.skill in c.primary ? c.primary[need.skill] : (c.secondary[need.skill] || 0);
      if (have < need.level) {
        const reqName = need.skill in c.primary ? primaryName(need.skill) : (SECONDARY_SKILLS[need.skill] || { name: need.skill }).name;
        return { ok: false, reason: `нужен ${reqName} ${need.level}` };
      }
    }
    return { ok: true };
  }

  function primaryName(id) {
    const p = PRIMARY_SKILLS.find((x) => x.id === id);
    return p ? p.name : id;
  }

  /**
   * Тратит 1 очко на навык.
   * @returns {{ ok: boolean, level?: number }}
   */
  function raiseSkill(c, target) {
    const check = canRaise(c, target);
    if (!check.ok) return { ok: false, reason: check.reason };
    c.points -= 1;
    if (PRIMARY_SKILLS.some((p) => p.id === target)) {
      c.primary[target] += 1;
      return { ok: true, level: c.primary[target] };
    }
    c.secondary[target] = (c.secondary[target] || 0) + 1;
    return { ok: true, level: c.secondary[target] };
  }

  /**
   * Начисляет опыт. Возвращает, сколько уровней получено.
   * Учёт бонуса «Учёный» (+2% за уровень).
   */
  function addXp(c, amount) {
    if (!c.alive) return { levelsGained: 0, pointsGained: 0 };
    let gained = Math.round(amount * derived(c).xpMult);
    c.totalXp += gained;
    c.xp += gained;
    let levelsGained = 0;
    while (c.xp >= xpForNext(c.level)) {
      c.xp -= xpForNext(c.level);
      c.level += 1;
      levelsGained += 1;
      c.points += POINTS_PER_LEVEL;
    }
    // maxHP/maxMP зависят только от навыков; перекладываем в новые границы.
    const d = derived(c);
    c.hp = Math.min(d.maxHP, c.hp);
    c.mp = Math.min(d.maxMP, c.mp);
    return { levelsGained, pointsGained: levelsGained * POINTS_PER_LEVEL };
  }

  function takeDamage(c, amount) {
    if (!c.alive) return { dead: true };
    const d = derived(c);
    c.hp -= Math.round(amount * d.damageTakenMult);
    if (c.hp <= 0) {
      c.hp = 0;
      c.alive = false;
      return { dead: true };
    }
    return { dead: false };
  }

  function heal(c, amount) {
    const d = derived(c);
    c.hp = Math.min(d.maxHP, c.hp + amount);
    return c.hp;
  }

  function restoreDay(c) {
    // Восстановление за игровой день (SPEC.md: между днями).
    const d = derived(c);
    c.hp = Math.min(d.maxHP, c.hp + Math.round(d.maxHP * d.hpRegenMult));
    c.mp = Math.min(d.maxMP, c.mp + Math.round(d.maxMP * d.mpRegenMult));
    return { hp: c.hp, mp: c.mp };
  }

  return {
    PRIMARY_SKILLS, SECONDARY_SKILLS, RANKS,
    MAX_SKILL_LEVEL, POINTS_PER_LEVEL,
    rankOf, secondaryName, xpForNext,
    createCharacter, derived, canRaise, raiseSkill,
    addXp, takeDamage, heal, restoreDay,
  };
});

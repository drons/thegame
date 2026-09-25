// Персонаж: статы, навыки, опыт и уровни (SPEC.md, раздел «Навыки»).
//
// Чистое ядро без DOM — тестируется в node (tests/player.test.js).
// Униформный модуль: в браузере — globalThis.Game, в node — require().

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Game = Object.assign({}, root.Game, factory());
  }
})(typeof globalThis !== 'undefined' ? globalThis : self, function () {

  // --- Основные навыки ---
  const PRIMARY_SKILLS = [
    { id: 'strength', name: 'Сила', desc: 'Физическая мощь' },
    { id: 'dexterity', name: 'Ловкость', desc: 'Проворство, рефлексы и равновесие' },
    { id: 'constitution', name: 'Телосложение', desc: 'Здоровье и выносливость' },
    { id: 'intelligence', name: 'Интеллект', desc: 'Логика и память' },
    { id: 'wisdom', name: 'Мудрость', desc: 'Восприимчивость и ментальная устойчивость' },
    { id: 'charisma', name: 'Харизма', desc: 'Уверенность, самообладание и обаяние' },
  ];

  // --- Ранги навыков (SPEC.md, раздел «Навыки») ---
  const RANKS = [
    { min: 1, max: 10, name: 'Новичок' },
    { min: 11, max: 25, name: 'Ученик' },
    { min: 26, max: 50, name: 'Знаток' },
    { min: 51, max: 75, name: 'Мастер' },
    { min: 76, max: 99, name: 'Гроссмейстер' },
    { min: 100, max: 100, name: 'Легенда' },
  ];

  // --- Вторичные навыки ---
  // requires: null | { skill: 'basic'|'secondary', level: N }
  // effect: { stat, perLevel } — доля эффекта за уровень (0.05 = 5%)
  const SECONDARY_SKILLS = {
    // Сила
    swordsman: {
      name: 'Мечник', primary: 'strength', requires: null,
      effect: { stat: 'swordHitBonus', perLevel: 0.05 },
      desc: '+5% вероятность попадания мечом за уровень',
      names: ['Начинающий мечник', 'Ученик фехтовальщика', 'Знаток клинка', 'Мастер меча', 'Гроссмейстер меча', 'Легенда клинка'],
    },
    heavy: {
      name: 'Тяжёлое оружие', primary: 'strength', requires: { skill: 'swordsman', level: 5 },
      effect: { stat: 'heavyDamageBonus', perLevel: 0.05 },
      desc: '+5% урон тяжёлым оружием за уровень',
      names: ['Сильная рука', 'Ученик бойца с топором', 'Знаток тяжёлого оружия', 'Мастер топора', 'Гроссмейстер топора', 'Легенда великого топора'],
    },
    fists: {
      name: 'Каменные кулаки', primary: 'strength', requires: null,
      effect: { stat: 'fistDamageBonus', perLevel: 0.05 },
      desc: '+5% урон голыми руками за уровень',
      names: ['Новичок кулака', 'Ученик кулака', 'Знаток босого боя', 'Мастер кулака', 'Гроссмейстер кулака', 'Легенда несокрушимого кулака'],
    },
    forge: {
      name: 'Кузнечная рука', primary: 'strength', requires: { skill: 'strength', level: 5 },
      effect: { stat: 'equipmentDurabilityMult', perLevel: 0.05 },
      desc: '+5% прочность собственного снаряжения за уровень',
      names: ['Подмастерье-кузнец', 'Ученик наковальни', 'Знаток кузницы', 'Мастер-кузнец', 'Гроссмейстер кузницы', 'Легенда молота'],
    },
    back: {
      name: 'Крепкая спина', primary: 'strength', requires: null,
      effect: { stat: 'carryWeightMult', perLevel: 0.10 },
      desc: '+10% к максимальному весу за уровень',
      names: ['Носильщик', 'Ученик грузчика', 'Знаток ноши', 'Мастер ноши', 'Гроссмейстер ноши', 'Легенда крепкой спины'],
    },

    // Ловкость
    accuracy: {
      name: 'Меткость', primary: 'dexterity', requires: null,
      effect: { stat: 'rangedDamageBonus', perLevel: 0.05 },
      desc: '+5% урон от оружия дальнего боя за уровень',
      names: ['Твёрдый глаз', 'Ученик стрелка', 'Знаток мишени', 'Мастер меткости', 'Гроссмейстер меткости', 'Легенда стрелы'],
    },
    catseye: {
      name: 'Кошачий глаз', primary: 'dexterity', requires: null,
      effect: { stat: 'caveVisionMult', perLevel: 0.10 },
      desc: '+10% дистанция зрения в пещерах за уровень',
      names: ['Зоркий взгляд', 'Ученик кошачьего глаза', 'Знаток ночи', 'Мастер ночи', 'Гроссмейстер ночи', 'Легенда взора'],
    },
    step: {
      name: 'Ловкий шаг', primary: 'dexterity', requires: null,
      effect: { stat: 'moveSpeedMult', perLevel: 0.05 },
      desc: '+5% скорость перемещения по карте за уровень',
      names: ['Лёгкая нога', 'Ученик бегуна', 'Знаток шага', 'Мастер бегуна', 'Гроссмейстер шага', 'Легенда ветра'],
    },
    archer: {
      name: 'Стрелок', primary: 'dexterity', requires: { skill: 'accuracy', level: 5 },
      effect: { stat: 'archerHitBonus', perLevel: 0.05 },
      desc: '+5% вероятность попадания из лука за уровень',
      names: ['Юный лучник', 'Ученик стрелка', 'Знаток лука', 'Мастер лучник', 'Гроссмейстер лучник', 'Легенда тетивы'],
    },
    acro: {
      name: 'Акробатика', primary: 'dexterity', requires: { skill: 'step', level: 5 },
      effect: { stat: 'acroBonus', perLevel: 0.05 },
      desc: '+5% шанс избежать падения, лазание за уровень',
      names: ['Прыгун', 'Ученик акробата', 'Знаток прыжка', 'Мастер акробата', 'Гроссмейстер акробата', 'Легенда прыжка'],
    },
    thief: {
      name: 'Тать', primary: 'dexterity', requires: { skill: 'dexterity', level: 5 },
      effect: { stat: 'thiefBonus', perLevel: 0.05 },
      desc: 'Открывание замков, снятие ловушек, кража: +5% за уровень',
      names: ['Шалун', 'Ученик вора', 'Знаток замков', 'Мастер воровства', 'Гроссмейстер теней', 'Легенда теней'],
    },

    // Телосложение
    hide: {
      name: 'Железная кожа', primary: 'constitution', requires: null,
      effect: { stat: 'damageTakenMult', perLevel: -0.05 },
      desc: '-5% получаемый урон за уровень',
      names: ['Толстая шкура', 'Ученик шкуры', 'Знаток железа', 'Мастер железа', 'Гроссмейстер железа', 'Легенда несокрушимого'],
    },
    endurance: {
      name: 'Выносливость', primary: 'constitution', requires: null,
      effect: { stat: 'maxHPMult', perLevel: 0.03 },
      desc: '+3% к максимальному здоровью за уровень',
      names: ['Устойчивое дыхание', 'Ученик выносливого', 'Знаток выносливости', 'Мастер выносливости', 'Гроссмейстер выносливости', 'Легенда горы'],
    },
    golem: {
      name: 'Голем', primary: 'constitution', requires: { skill: 'hide', level: 5 },
      effect: { stat: 'maxHPMult', perLevel: 0.02 },
      desc: '+2% макс. здоровье и +1 броня за уровень',
      names: ['Каменное сердце', 'Ученик голема', 'Знаток гранита', 'Мастер голема', 'Гроссмейстер голема', 'Легенда истукана'],
    },
    breath: {
      name: 'Глубокий вдох', primary: 'constitution', requires: { skill: 'constitution', level: 5 },
      effect: { stat: 'hpRegenMult', perLevel: 0.05 },
      desc: '+5% к восстановлению здоровья между днями за уровень',
      names: ['Глубокий вдох', 'Ученик лёгких', 'Знаток дыхания', 'Мастер дыхания', 'Гроссмейстер дыхания', 'Легенда кита'],
    },
    unkill: {
      name: 'Несокрушимость', primary: 'constitution', requires: { skill: 'golem', level: 10 },
      effect: { stat: 'survivalChance', perLevel: 0.01 },
      desc: '1% за уровень шанс выжить смертельный удар (1 раз в день)',
      names: ['Упрямство', 'Ученик выживальщика', 'Знаток второго шанса', 'Мастер выживший', 'Гроссмейстер выживший', 'Легенда презрения к смерти'],
    },

    // Интеллект
    firelord: {
      name: 'Повелитель огня', primary: 'intelligence', requires: null,
      effect: { stat: 'fireDamageBonus', perLevel: 0.05 },
      desc: '+5% урон огненными заклинаниями за уровень',
      names: ['Искра огня', 'Ученик пироманта', 'Знаток пламени', 'Повелитель огня', 'Гроссмейстер пламени', 'Легенда солнца'],
    },
    icelord: {
      name: 'Повелитель льда', primary: 'intelligence', requires: { skill: 'firelord', level: 5 },
      effect: { stat: 'iceDamageBonus', perLevel: 0.05 },
      desc: '+5% урон заклинаниями льда за уровень',
      names: ['Ледяной осколок', 'Ученик криоманта', 'Знаток стужи', 'Повелитель льда', 'Гроссмейстер стужи', 'Легенда полярного сияния'],
    },
    alchemy: {
      name: 'Алхимик', primary: 'intelligence', requires: null,
      effect: { stat: 'potionPowerMult', perLevel: 0.05 },
      desc: '+5% сила зелий и снадобий за уровень',
      names: ['Любопытный нос', 'Ученик алхимика', 'Знаток зелий', 'Мастер-алхимик', 'Гроссмейстер алхимии', 'Легенда философа'],
    },
    scholar: {
      name: 'Учёный', primary: 'intelligence', requires: null,
      effect: { stat: 'xpMult', perLevel: 0.02 },
      desc: '+2% к получаемому опыту за уровень',
      names: ['Книголюб', 'Ученик писца', 'Знаток знаний', 'Мастер учёный', 'Гроссмейстер учёный', 'Легенда архивов'],
    },
    runes: {
      name: 'Рунопись', primary: 'intelligence', requires: { skill: 'intelligence', level: 5 },
      effect: { stat: 'runePowerMult', perLevel: 0.05 },
      desc: '+5% сила рунических эффектов за уровень',
      names: ['Чтец рун', 'Ученик рунописца', 'Знаток начертания', 'Мастер рунописец', 'Гроссмейстер рунописца', 'Легенда руны'],
    },

    // Мудрость
    perception: {
      name: 'Зоркость', primary: 'wisdom', requires: null,
      effect: { stat: 'magicResistMult', perLevel: 0.05 },
      desc: '+5% сопротивление всем школам магии за уровень',
      names: ['Чутьё', 'Ученик завесы', 'Знаток защиты', 'Мастер защиты', 'Гроссмейстер защиты', 'Легенда непоколебимого'],
    },
    meditation: {
      name: 'Медитация', primary: 'wisdom', requires: null,
      effect: { stat: 'mpRegenMult', perLevel: 0.02 },
      desc: '+2% к восстановлению здоровья и маны между днями за уровень',
      names: ['Тихая мысль', 'Ученик медитатора', 'Знаток тишины', 'Мастер тишины', 'Гроссмейстер тишины', 'Легенда безмолвного ума'],
    },
    precog: {
      name: 'Ясновидение', primary: 'wisdom', requires: { skill: 'perception', level: 5 },
      effect: { stat: 'dodgeBonus', perLevel: 0.05 },
      desc: '+5% шанс уклонения за уровень',
      names: ['Предчувствие', 'Ученик ясновидца', 'Знаток видения', 'Мастер ясновидец', 'Гроссмейстер ясновидца', 'Легенда будущего'],
    },
    nature: {
      name: 'Сердце природы', primary: 'wisdom', requires: { skill: 'wisdom', level: 5 },
      effect: { stat: 'foodPowerMult', perLevel: 0.05 },
      desc: '+5% сила зелий и еды за уровень',
      names: ['Сборник трав', 'Ученик луга', 'Знаток рощи', 'Мастер рощи', 'Гроссмейстер рощи', 'Легенда мира-дерева'],
    },
    elder: {
      name: 'Старейшина', primary: 'wisdom', requires: null,
      effect: { stat: 'dialogueBonus', perLevel: 1 },
      desc: '+1 к проверкам в диалогах за уровень',
      names: ['Задавака', 'Ученик слушателя', 'Знаток слова', 'Мастер слова', 'Гроссмейстер слова', 'Легенда мудрости'],
    },

    // Харизма
    merchant: {
      name: 'Торговец', primary: 'charisma', requires: null,
      effect: { stat: 'buyPriceMult', perLevel: -0.05 },
      desc: '-5% цены покупки, +5% цены продажи за уровень',
      names: ['Торгошина', 'Ученик купца', 'Знаток сделки', 'Мастер-торговец', 'Гроссмейстер торговли', 'Легенда весов'],
    },
    orator: {
      name: 'Оратор', primary: 'charisma', requires: null,
      effect: { stat: 'dialogueBonus', perLevel: 1 },
      desc: 'Открывает дополнительные опции в диалогах',
      names: ['Болтун', 'Ученик оратора', 'Знаток речи', 'Мастер оратор', 'Гроссмейстер оратор', 'Легенда форума'],
    },
    leader: {
      name: 'Предводитель', primary: 'charisma', requires: { skill: 'orator', level: 5 },
      effect: { stat: 'companionMoraleBonus', perLevel: 0.05 },
      desc: '+5% мораль спутников за уровень',
      names: ['Бунтарь', 'Ученик вожатого', 'Знаток знамени', 'Мастер вожак', 'Гроссмейстер вожак', 'Легенда стяга'],
    },
    artist: {
      name: 'Артист', primary: 'charisma', requires: null,
      effect: { stat: 'performanceIncomeMult', perLevel: 0.10 },
      desc: '+10% заработок на выступлениях за уровень',
      names: ['Сказитель', 'Ученик исполнителя', 'Знаток сцены', 'Мастер-артист', 'Гроссмейстер артист', 'Легенда песни'],
    },
    fright: {
      name: 'Застращивание', primary: 'charisma', requires: { skill: 'charisma', level: 5 },
      effect: { stat: 'fearChance', perLevel: 0.05 },
      desc: '5% за уровень шанс напугать моба уровнем ниже',
      names: ['Взгляд', 'Ученик запугателя', 'Знаток тени', 'Мастер страха', 'Гроссмейстер страха', 'Легенда устрашения'],
    },
  };

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
      // Восстановление между днями (доля от максимума за день).
      hpRegenMult: 0.10 + pct('breath') + pct('meditation') * 0.5,
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

// Персонаж: статы, навыки, опыт и уровни (SPEC.md, раздел «Навыки»).
//
// Чистое ядро без DOM — тестируется в node (tests/player.test.js).
// Униформный модуль: в браузере — globalThis.Game, в node — require().
// Данные каталога навыков (основные и вторичные) — из униформного
// модуля skills-data.js: зеркала каталога assets/skills (source of truth).
// Зависимости: skills-data.js, global-settings.js (points_per_level).

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./skills-data.js'),
      require('./global-settings.js'));
  } else {
    root.Game = Object.assign({}, root.Game,
      factory(root.Game && root.Game.SkillsData,
        root.Game && root.Game.GlobalSettings));
  }
})(typeof globalThis !== 'undefined' ? globalThis : self,
  function (skills, settings) {

  if (!skills || !Array.isArray(skills.PRIMARY_SKILLS) ||
      !skills.SECONDARY_SKILLS || typeof skills.SECONDARY_SKILLS !== 'object') {
    throw new Error(
      'player.js: не найден каталог навыков — загрузите skills-data.js до player.js');
  }
  if (!settings || typeof settings.SETTINGS !== 'object') {
    throw new Error(
      'player.js: не найдены глобальные настройки — загрузите global-settings.js до player.js');
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
  // Глобальная настройка (src/global-settings.js, SPEC.md «Навыки»).
  const POINTS_PER_LEVEL = settings.SETTINGS.points_per_level;

  // 000099: live-чтение в момент вызова (паттерн 000020; см. day.js):
  // guard META 000098 (min 1), битое → DEFAULTS → снапшот.
  // Ревью 000099: guard и на ЦЕЛИКОМ SETTINGS (null/undefined в
  // рантайме) — NaN не пройдёт guard значения → DEFAULTS.
  function livePointsPerLevel() {
    const s = settings.SETTINGS;
    const v = (s && typeof s === 'object') ? s.points_per_level : NaN;
    return (typeof v === 'number' && Number.isFinite(v) && v >= 1)
      ? v : (settings.DEFAULTS ? settings.DEFAULTS.points_per_level
        : POINTS_PER_LEVEL);
  }

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
      skillXp: {}, // id вторичного навыка -> опыт внутри текущего уровня (практика, задача 000013)
      // Книга заклинаний (задача 000045): стартовая — аналоги старых
      // кнопок «Огонь»/«Исцел.» (идут в каталоге assets/spells).
      // Источники изучения (задача 000133): свитки-предметы из сундуков
      // подземелий (kind spell_scroll, useItem, source 'scroll') и руны
      // на Руническом камне/Обелиске (source 'rune'); наставники —
      // отложены до волн школ (000133b).
      spells: ['spark', 'mend'],
      alive: true,
    };
    const d = derived(c);
    c.hp = d.maxHP;
    c.mp = d.maxMP;
    return c;
  }

  /**
   * Чистка сохранённого персонажа (восстановление сейва, задачи
   * 000029/000031): «битый сейв не роняет игру». Сейв живёт в
   * localStorage МЕЖДУ версиями игры, поэтому поля могут быть
   * подделаны/не соответствовать коду (переименованные навыки и т.п.).
   * Правила:
   *   * обязательное ядро (level/xp/gold/hp + все шесть основных
   *     навыков — конечные числа, навыки >= 1) — невалидно → null
   *     (персонаж сейва не восстанавливается, игра стартует заново);
   *   * вторичные навыки / skillXp — ПОСЧТОВЫЙ отброс невалидных
   *     записей (неизвестный id, нецелый/отрицательный уровень,
   *     нечисловой или дробный опыт) — легитимный прогресс сохраняется;
   *   * всё, что не проверяется (mp/points/name/totalXp), нормализуется
   *     к безопасному значению.
   * Инвентарь/снаряжение здесь НЕ чистятся (нужен каталог предметов —
   * см. items.js: sanitizeInventory/sanitizeEquipment).
   * @param {object} s данные персонажа из сейва
   * @returns {object|null} чистые поля персонажа (форма createCharacter)
   *          или null — персонаж сейва невосстановим
   */
  function sanitizeSavedHero(s) {
    if (!s || typeof s !== 'object' || Array.isArray(s)) return null;
    if (!Number.isInteger(s.level) || s.level < 1) return null;
    if (typeof s.xp !== 'number' || !Number.isFinite(s.xp) || s.xp < 0) return null;
    if (typeof s.gold !== 'number' || !Number.isFinite(s.gold) || s.gold < 0) return null;
    // hp — любое конечное (отрицательное/большое) — main.js заклампит.
    if (typeof s.hp !== 'number' || !Number.isFinite(s.hp)) return null;

    // Основные навыки — все шесть, конечные числа >= 1 (иначе — null:
    // без полного набора производные характеристики не считаются).
    const primary = {};
    let ok = !!(s.primary && typeof s.primary === 'object' &&
      !Array.isArray(s.primary));
    if (ok) {
      for (const p of PRIMARY_SKILLS) {
        const v = s.primary[p.id];
        if (typeof v !== 'number' || !Number.isFinite(v) || v < 1) {
          ok = false; break;
        }
        primary[p.id] = v;
      }
    }
    if (!ok) return null;

    // Вторичные навыки: известное id + целое >= 0.
    const secondary = {};
    if (s.secondary && typeof s.secondary === 'object') {
      for (const [id, v] of Object.entries(s.secondary)) {
        if (SECONDARY_SKILLS[id] && Number.isInteger(v) && v >= 0) {
          secondary[id] = v;
        }
      }
    }

    // Опыт навыков: известное id + целое >= 0. В игре копилка всегда
    // целочисленная (_gainSkillXp: Math.round(amount), пороги 15·(lvl+1)),
    // дробное значение возможно только в подделанном сейве — отбрасываем
    // (как нецелые уровни вторичных навыков выше).
    const skillXp = {};
    if (s.skillXp && typeof s.skillXp === 'object') {
      for (const [id, v] of Object.entries(s.skillXp)) {
        if (SECONDARY_SKILLS[id] && Number.isInteger(v) && v >= 0) {
          skillXp[id] = v;
        }
      }
    }

    return {
      name: (typeof s.name === 'string' && s.name) ? s.name : 'Флогистон',
      level: s.level,
      xp: s.xp,
      totalXp: (typeof s.totalXp === 'number' && Number.isFinite(s.totalXp)
        && s.totalXp >= 0) ? s.totalXp : s.xp,
      gold: s.gold,
      hp: s.hp,
      mp: (typeof s.mp === 'number' && Number.isFinite(s.mp) && s.mp >= 0)
        ? s.mp : 0,
      points: (Number.isInteger(s.points) && s.points >= 0) ? s.points : 0,
      primary, secondary, skillXp,
      alive: true,
    };
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
      // Потолок практикой вырос — пересчитываем застрявшие копилки опыта.
      const skillLevels = reprocessSkillXp(c, target);
      // Крафт (000046): потолок вида, привязанный к основному навыку
      // (у столярного дела — Ловкость), тоже вырос.
      craftReprocessHook(c, target);
      // ...а также ко всем вторичным, поднятым КАСКАДОМ reprocessSkillXp
      // (рост Силы → «Кузнечная рука» выше потолка → кузнечное_дело).
      // Для не-крафтовых навыков хук — no-op (CRAFT_TYPE_SKILL пусто).
      for (const s of skillLevels) craftReprocessHook(c, s);
      return { ok: true, level: c.primary[target], skillLevels };
    }
    c.secondary[target] = (c.secondary[target] || 0) + 1;
    // Крафт (000046): потолок видов на вторичном навыке (forge/alchemy/
    // runes) вырос.
    craftReprocessHook(c, target);
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
    // 000099: ОДНО live-чтение на вызов — начисление и возврат
    // pointsGained — одна значимость.
    const ppl = livePointsPerLevel();
    let levelsGained = 0;
    while (c.xp >= xpForNext(c.level)) {
      c.xp -= xpForNext(c.level);
      c.level += 1;
      levelsGained += 1;
      c.points += ppl;
    }
    // maxHP/maxMP зависят только от навыков; перекладываем в новые границы.
    const d = derived(c);
    c.hp = Math.min(d.maxHP, c.hp);
    c.mp = Math.min(d.maxMP, c.mp);
    return { levelsGained, pointsGained: levelsGained * ppl };
  }

  // --- Практика навыков (задача 000013, SPEC.md «Повышение вторичных навыков», п. 2) ---
  // Опыт вторичного навыка хранится в c.skillXp[id] — прогресс внутри
  // текущего уровня; накопленный опыт конвертируется в уровни навыка.
  // skillXpForNext(level) — сколько опыта нужно, чтобы перейти
  // с уровня level на level+1.
  function skillXpForNext(level) {
    return 15 * (level + 1);
  }

  /**
   * «Потолок практикой»: уровень основного навыка данного вторичного * 2
   * (SPEC.md). На уровне, равном или выше потолка, навык растёт только
   * очками навыков и книгами.
   * @returns {number} 0, если навык неизвестен
   */
  function practiceCap(c, skillId) {
    const s = SECONDARY_SKILLS[skillId];
    if (!s) return 0;
    return (c.primary[s.primary] || 0) * 2;
  }

  /** Текущий уровень вторичного навыка (0, если не начат). */
  function skillLevel(c, skillId) {
    return c.secondary[skillId] || 0;
  }

  /**
   * Начисляет опыт вторичного навыка и конвертирует его в уровни.
   * @param {object} c персонаж
   * @param {string} skillId id вторичного навыка
   * @param {number} amount опыт
   * @param {boolean} ignorePracticeCap книги/свитки: потолок практикой
   *   не учитывается (рост до максимума 100)
   * @returns {{ ok:boolean, applied:number, level:number, leveledUp:boolean,
   *             total:number, reason?:string }}
   *   applied — опыт, принятый в копилку (0 при потолке/максимуме),
   *   total — содержимое копилки c.skillXp[skillId] после операции.
   */
  function _gainSkillXp(c, skillId, amount, ignorePracticeCap) {
    const fail = (reason) =>
      ({ ok: false, reason, applied: 0, level: 0, leveledUp: false, total: 0 });
    const s = SECONDARY_SKILLS[skillId];
    if (!s) return fail('неизвестный навык: ' + skillId);
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) {
      return fail('неверный опыт');
    }
    if (!c.alive) return fail('персонаж погиб');
    const level0 = c.secondary[skillId] || 0;
    const limit = ignorePracticeCap
      ? MAX_SKILL_LEVEL
      : Math.min(MAX_SKILL_LEVEL, practiceCap(c, skillId));
    const bank0 = (c.skillXp && c.skillXp[skillId]) || 0;
    if (level0 >= limit) {
      c.skillXp = c.skillXp || {};
      c.skillXp[skillId] = bank0; // держим копилку числом (инвариант хранилища)
      return {
        ok: true, applied: 0, level: level0, leveledUp: false, total: bank0,
        reason: level0 >= MAX_SKILL_LEVEL ? 'максимальный уровень' : 'потолок практикой',
      };
    }
    const gain = Math.round(amount);
    let bank = bank0 + gain;
    let level = level0;
    let leveledUp = false;
    while (level < limit) {
      const need = skillXpForNext(level);
      if (bank < need) break;
      bank -= need;
      level += 1;
      leveledUp = true;
    }
    c.skillXp = c.skillXp || {};
    c.skillXp[skillId] = bank;
    c.secondary[skillId] = level;
    // Примечание: HP/MP не прижимаем к максимуму — макс. HP/MP только
    // растут от вторичных навыков (Выносливость/Голем), maxMP зависит
    // только от основных, так что текущие значения не могут оказаться
    // выше новых границ.
    // Крафт (000046): навык вырос (практика/книги) — потолок видов
    // крафта, привязанных к нему, вырос — пересчёт копилки c.craftXp.
    if (leveledUp) craftReprocessHook(c, skillId);
    return { ok: true, applied: gain, level, leveledUp, total: bank };
  }

  /**
   * Практика: успешное применение эффекта навыка (попадание мечом —
   * «Мечник», блок — «Железная кожа», зелье — «Алхимик» и т.д.).
   * Опыт копится в c.skillXp[skillId] и поднимает уровень навыка до
   * «потолка практикой» (основной навык * 2); остаток хранится и
   * применяется, когда потолок поднимется (основной навык вырос).
   */
  function skillPractice(c, skillId, amount) {
    return _gainSkillXp(c, skillId, amount, false);
  }

  /**
   * Книги и свитки: дают опыт навыка, игнорируя потолок практикой
   * (растёт до максимума 100).
   */
  function skillReadBook(c, skillId, amount) {
    return _gainSkillXp(c, skillId, amount, true);
  }

  /**
   * Пересчёт копилки опыта после повышения основного навыка: «потолок
   * практикой» вырос, и опыт, застрявший в skillXp у уровня потолка,
   * конвертируется в уровни (до нового потолка). Вызывается из raiseSkill.
   * @returns {string[]} id навыков, чей уровень вырос
   */
  function reprocessSkillXp(c, primaryId) {
    const leveled = [];
    for (const [id, s] of Object.entries(SECONDARY_SKILLS)) {
      if (s.primary !== primaryId) continue;
      const bank0 = (c.skillXp && c.skillXp[id]) || 0;
      if (bank0 <= 0) continue;
      const level0 = c.secondary[id] || 0;
      const limit = Math.min(MAX_SKILL_LEVEL, practiceCap(c, id));
      let level = level0;
      let bank = bank0;
      while (level < limit) {
        const need = skillXpForNext(level);
        if (bank < need) break;
        bank -= need;
        level += 1;
      }
      if (level !== level0) {
        c.secondary[id] = level;
        c.skillXp[id] = bank;
        leveled.push(id);
      }
    }
    return leveled;
  }

  // Хук крафта (задача 000046): рост навыка поднимает «потолок
  // практикой» видов крафта, привязанных к нему (Craft.CRAFT_TYPE_SKILL),
  // и опыт, застрявший в c.craftXp, обязан пересчитаться. ЛЕНИВО
  // (player.js загружается ДО craft.js — UMD-ловушка 000038): Game.Craft
  // снимается при ВЫЗОВЕ — паттерн хука bookCraftXp в items.js. В node
  // без Game.Craft — no-op (тесты задают его явно).
  function craftReprocessHook(c, skillId) {
    const G = (typeof globalThis !== 'undefined' &&
      typeof globalThis.Game === 'object') ? globalThis.Game : null;
    if (G && G.Craft && typeof G.Craft.reprocessCraftXp === 'function') {
      G.Craft.reprocessCraftXp(c, skillId);
    }
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
    createCharacter, sanitizeSavedHero, derived, canRaise, raiseSkill,
    addXp, takeDamage, heal, restoreDay,
    skillXpForNext, practiceCap, skillLevel,
    skillPractice, skillReadBook, reprocessSkillXp,
  };
});

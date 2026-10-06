// Единый «лист персонажа» (задача 000140, follow-up 000139): единая
// модель прокачки — опыт/уровни, 2 очка за уровень, навыки, практика,
// заклинания — на котором работают герой (переехал делегированием),
// Эфир (000144) и наёмные NPC (000143). Различия персонажей — ТОЛЬКО
// начальный список: createSheet(kind, initial) — параметр (ТЗ 000139).
//
// Чистый UMD-модуль без DOM/RNG (паттерн 000053/000130): в node —
// require(), в браузере — Game.Sheet.
//
// Зависимости — ТОЛЬКО лениво в момент вызова (UMD-ловушка 000038):
//   * Game.SkillsData (skills-data.js) — каталог навыков;
//   * Game.GlobalSettings (global-settings.js) — points_per_level
//     (live-чтение 000099) + DEFAULTS (guard 000098).
// СНАПШОТА Game при загрузке НЕТ (browser-ветка не читает Game):
// vm-песочницы с неполной цепочкой не падают при загрузке. Если
// каталог/настройки отсутствуют в момент ВЫЗОВА — console.error
// ОДИН раз за загрузку + безопасный отказ (derived → null, practice →
// ok:false, addXp → 0/0, canRaise/raiseSkill → ok:false,
// reprocessSkillXp → []): исключений 0, игра не падает (000038/000053).
// createSheet и pointsPerLevel зависимостей не требуют (все дефолты —
// литералы; pointsPerLevel — молчаливый guard по конструкции 000099).
//
// Формулы/guards перенесены дословно из player.js (задача 000140 —
// герой переезжает делегированием, публичный flat-API player.js без
// изменений). ЕДИНСТВЕННОЕ геймплей-изменение — C1 (контракт 000139
// §4): практика навыка на «потолке практикой» (уровень = основной×2,
// уровень < MAX 100) больше не бросает опыт — опыт копится в банке
// sheet.skillXp[id], уровень не растёт, reason «потолок практикой»;
// конвертация банка — при росте потолка (reprocessSkillXp). На MAX=100
// бросок СОХРАНЯЕТСЯ (без изменений). Эталоны: practiceEfir /
// reprocessEfirSkills (src/efir.js).
//
// Контракты: memory/000140-sheet-model.md (S-1..S-5, guards, UMD) и
// memory/000140-sheet-hero.md (§1 API Game.Sheet).

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./skills-data.js'),
      require('./global-settings.js'), null);
  } else {
    root.Game = Object.assign({}, root.Game,
      { Sheet: factory(null, null, root) });
  }
})(typeof globalThis !== 'undefined' ? globalThis : self,
  function (skills, settings, rootRef) {

  // node-ветка — прямые объекты от require (тот же живой SETTINGS —
  // live-семантика 000099 сохраняется); browser-ветка — лениво через
  // rootRef (UMD-ловушка 000038: снапшота Game при загрузке НЕТ).
  const hasDirect = !!(skills && settings);

  const KINDS = ['hero', 'efir', 'merc'];
  const MAX_SKILL_LEVEL = 100;
  // Основные навыки в порядке создания героя (байты сейва, 000031).
  const PRIMARY_KEYS = ['strength', 'dexterity', 'constitution',
    'intelligence', 'wisdom', 'charisma'];

  let degradeLogged = false;
  function logDegrade() {
    // Один след за загрузку — без спама (паттерн lazyGame, efir.js).
    if (degradeLogged) return;
    degradeLogged = true;
    console.error(
      'sheet.js: не найден Game.SkillsData / Game.GlobalSettings — '
      + 'загрузите skills-data.js и global-settings.js до sheet.js '
      + '(задача 000140); безопасная деградация (000038/000053)');
  }

  function getSkills() {
    const s = hasDirect ? skills
      : (rootRef && rootRef.Game ? rootRef.Game.SkillsData : null);
    return (s && Array.isArray(s.PRIMARY_SKILLS)
      && s.SECONDARY_SKILLS && typeof s.SECONDARY_SKILLS === 'object')
      ? s : null;
  }

  function getSettings() {
    const g = hasDirect ? settings
      : (rootRef && rootRef.Game ? rootRef.Game.GlobalSettings : null);
    return (g && typeof g.SETTINGS === 'object') ? g : null;
  }

  /**
   * Создаёт лист (состояние прокачки персонажа).
   * @param {string} kind 'hero' | 'efir' | 'merc'; неизвестный — throw
   *   (валидация входа, не деградация — прецедент cityLayoutSize).
   * @param {object} initial ЕДИНСТВЕННОЕ допустимое различие
   *   персонажей (ТЗ 000139): shallow-merge поверх дефолтов (primary —
   *   по ключам; name/spells/npcId — как есть). Валидации первичных
   *   ключей НЕТ (ответственность вызывающего).
   * @returns {object} лист (mutable). kind 'hero' — ТОЧНЫЙ лейаут
   *   createCharacter (порядок ключей = байты сейва 000031; ПОЛЯ kind
   *   У ГЕРОЯ НЕТ — R-1) + hp/mp из derived. kind 'efir'/'merc' —
   *   {kind, level, xp, totalXp, points, primary, secondary, skillXp,
   *   spells, npcId} (без name/gold/hp/mp/alive — их save-форматы —
   *   территория 000144/000143).
   */
  function createSheet(kind, initial) {
    if (!KINDS.includes(kind)) {
      throw new Error('createSheet: неизвестный kind: ' + kind);
    }
    const init = (initial && typeof initial === 'object') ? initial : {};
    const primary = {};
    for (const k of PRIMARY_KEYS) primary[k] = 1;
    if (init.primary && typeof init.primary === 'object') {
      for (const k of Object.keys(init.primary)) {
        primary[k] = init.primary[k];
      }
    }
    if (kind === 'hero') {
      // ТОЧНЫЙ лейаут createCharacter (player.js, до 000140): порядок
      // ключей — JSON-байты сейва (000031); ПОЛЯ kind у героя НЕТ
      // (R-1: main.js сериализует hero целиком, sanitizeSavedHero
      // восстанавливает фиксированный набор).
      const c = {
        name: (init.name !== undefined) ? init.name : 'Флогистон',
        level: 1,
        xp: 0,
        totalXp: 0,
        gold: 100,
        hp: 0,
        mp: 0,
        points: 0, // неистраченные очки навыков
        primary,
        secondary: {}, // id -> уровень
        skillXp: {}, // id вторичного навыка -> опыт внутри текущего уровня (практика, задача 000013)
        // Книга заклинаний (задача 000045): стартовая — аналоги старых
        // кнопок «Огонь»/«Исцел.» (идут в каталоге assets/spells).
        // Источники изучения (задача 000133): свитки-предметы из сундуков
        // подземелий (kind spell_scroll, useItem, source 'scroll') и руны
        // на Руническом камне/Обелиске (source 'rune'); наставники —
        // отложены до волн школ (000133b).
        spells: Array.isArray(init.spells) ? init.spells.slice()
          : ['spark', 'mend'],
        alive: true,
      };
      // (деградация без каталога: derived → null — hp/mp остаются 0;
      // в игре недостижимо — тег skills-data.js перед sheet.js)
      const d = derived(c);
      if (d) {
        c.hp = d.maxHP;
        c.mp = d.maxMP;
      }
      return c;
    }
    // efir/merc (база для 000144/000143): 5-полевое состояние + kind
    // + носитель; save-форматы — территория тех задач.
    return {
      kind,
      level: 1,
      xp: 0,
      totalXp: 0,
      points: 0,
      primary,
      secondary: {},
      skillXp: {},
      spells: Array.isArray(init.spells) ? init.spells.slice() : [],
      npcId: init.npcId,
    };
  }

  // Опыт, необходимый для перехода с уровня level на level+1
  // (ЕДИНЫЙ источник кривой; перенос дословно из player.js).
  function xpForNext(level) {
    return Math.round(50 * Math.pow(level, 1.5));
  }

  // Опыт вторичного навыка: сколько нужно, чтобы перейти с уровня
  // level на level+1 (перенос дословно из player.js).
  function skillXpForNext(level) {
    return 15 * (level + 1);
  }

  // 000099: live-чтение в момент вызова (паттерн 000020): SETTINGS.
  // points_per_level; guard 000098 (min 1): не number/finite/≥1 →
  // DEFAULTS.points_per_level → литерал 2 (значения DEFAULTS 000098).
  // Молчалив по конструкции (без console.error — паттерн
  // livePointsPerLevel; SETTINGS = null не ловится guard значения →
  // DEFAULTS).
  function pointsPerLevel() {
    const g = getSettings();
    const s = g ? g.SETTINGS : null;
    const v = (s && typeof s === 'object') ? s.points_per_level : NaN;
    if (typeof v === 'number' && Number.isFinite(v) && v >= 1) return v;
    const d = (g && g.DEFAULTS && typeof g.DEFAULTS === 'object')
      ? g.DEFAULTS.points_per_level : NaN;
    return (typeof d === 'number' && Number.isFinite(d) && d >= 1)
      ? d : 2;
  }

  /**
   * Начисляет опыт. Возвращает, сколько уровней получено.
   * Учёт бонуса «Учёный» (+2% за уровень) — через derived.
   * 2 очка за уровень — ВСЕМ kinds (ТЗ 000139/000140). totalXp ведётся
   * у всех kinds (R-4). hp/mp-кламп в новые max — ТОЛЬКО если поле
   * есть (у efir/merc нет hp/mp — без guard NaN «загрязнит» лист, S-3).
   */
  function addXp(sheet, amount) {
    // R-2: лист БЕЗ alive (efir/merc) — жив.
    if (sheet.alive === false) return { levelsGained: 0, pointsGained: 0 };
    const d = derived(sheet);
    if (!d) return { levelsGained: 0, pointsGained: 0 };
    let gained = Math.round(amount * d.xpMult);
    sheet.totalXp += gained;
    sheet.xp += gained;
    // 000099: ОДНО live-чтение на вызов — начисление и возврат
    // pointsGained — одна значимость.
    const ppl = pointsPerLevel();
    let levelsGained = 0;
    while (sheet.xp >= xpForNext(sheet.level)) {
      sheet.xp -= xpForNext(sheet.level);
      sheet.level += 1;
      levelsGained += 1;
      sheet.points += ppl;
    }
    // maxHP/maxMP зависят только от навыков; перекладываем в новые
    // границы — только при наличии поля (S-3).
    if (typeof sheet.hp === 'number') sheet.hp = Math.min(d.maxHP, sheet.hp);
    if (typeof sheet.mp === 'number') sheet.mp = Math.min(d.maxMP, sheet.mp);
    return { levelsGained, pointsGained: levelsGained * ppl };
  }

  // Название основного навыка (reason canRaise; перенос дословно).
  function primaryName(id) {
    const sk = getSkills();
    const p = sk ? sk.PRIMARY_SKILLS.find((x) => x.id === id) : null;
    return p ? p.name : id;
  }

  // Можно ли поднять навык? target — id основного или вторичного.
  // @returns {{ ok: boolean, reason?: string }}
  function canRaise(sheet, target) {
    const sk = getSkills();
    if (!sk) {
      logDegrade();
      return { ok: false, reason: 'не загружен каталог навыков (sheet.js)' };
    }
    if (sheet.alive === false) return { ok: false, reason: 'персонаж погиб' };
    if (sheet.points < 1) return { ok: false, reason: 'нет свободных очков навыков' };
    if (sk.PRIMARY_SKILLS.some((p) => p.id === target)) {
      if (sheet.primary[target] >= MAX_SKILL_LEVEL) return { ok: false, reason: 'максимальный уровень' };
      return { ok: true };
    }
    const s = sk.SECONDARY_SKILLS[target];
    if (!s) return { ok: false, reason: 'неизвестный навык' };
    const lvl = sheet.secondary[target] || 0;
    if (lvl >= MAX_SKILL_LEVEL) return { ok: false, reason: 'максимальный уровень' };
    // Требование к основному навыку.
    if (sheet.primary[s.primary] < 1) return { ok: false, reason: 'недостаточно: ' + primaryName(s.primary) };
    // Требование к другому навыку (ветка дерева).
    if (s.requires) {
      const need = s.requires;
      const have = need.skill in sheet.primary
        ? sheet.primary[need.skill] : (sheet.secondary[need.skill] || 0);
      if (have < need.level) {
        const reqName = need.skill in sheet.primary
          ? primaryName(need.skill)
          : (sk.SECONDARY_SKILLS[need.skill] || { name: need.skill }).name;
        return { ok: false, reason: `нужен ${reqName} ${need.level}` };
      }
    }
    return { ok: true };
  }

  /**
   * Тратит 1 очко на навык.
   * @returns {{ ok: boolean, level?: number, skillLevels?: string[],
   *             reason?: string }}
   * БЕЗ craft-хука (R-3): хуки крафта (000046) — в обёртках
   * player.js (герой); sheet.js — чистая модель, Game.Craft не знает.
   * Каскад reprocessSkillXp — в возврате (skillLevels).
   */
  function raiseSkill(sheet, target) {
    const sk = getSkills();
    if (!sk) {
      logDegrade();
      return { ok: false, reason: 'не загружен каталог навыков (sheet.js)' };
    }
    const check = canRaise(sheet, target);
    if (!check.ok) return { ok: false, reason: check.reason };
    sheet.points -= 1;
    if (sk.PRIMARY_SKILLS.some((p) => p.id === target)) {
      sheet.primary[target] += 1;
      // Потолок практикой вырос — пересчитываем застрявшие копилки.
      const skillLevels = reprocessSkillXp(sheet, target);
      return { ok: true, level: sheet.primary[target], skillLevels };
    }
    sheet.secondary[target] = (sheet.secondary[target] || 0) + 1;
    return { ok: true, level: sheet.secondary[target] };
  }

  /**
   * «Потолок практикой»: уровень основного навыка данного вторичного * 2
   * (SPEC.md). На уровне, равном или выше потолка, навык растёт только
   * очками навыков и книгами.
   * @returns {number} 0, если навык неизвестен
   */
  function practiceCap(sheet, skillId) {
    const sk = getSkills();
    if (!sk) { logDegrade(); return 0; }
    const s = sk.SECONDARY_SKILLS[skillId];
    if (!s) return 0;
    return (sheet.primary[s.primary] || 0) * 2;
  }

  /** Текущий уровень вторичного навыка (0, если не начат). */
  function skillLevel(sheet, skillId) {
    return sheet.secondary[skillId] || 0;
  }

  /**
   * Начисляет опыт вторичного навыка и конвертирует его в уровни.
   * @param {object} sheet лист
   * @param {string} skillId id вторичного навыка
   * @param {number} amount опыт
   * @param {boolean} ignorePracticeCap книги/свитки (hook ТЗ п.1):
   *   потолок практикой не учитывается (рост до максимума 100)
   * @returns {{ ok:boolean, applied:number, level:number,
   *             leveledUp:boolean, total:number, reason?:string }}
   *   applied — опыт, принятый в копилку; total — содержимое копилки
   *   sheet.skillXp[skillId] после операции.
   * C1 (контракт 000139 §4): НА «потолке практикой» (уровень < MAX)
   * опыт НЕ бросается — ПЕРЕЛИВ В BANK: bank += round(amount), уровень
   * не растёт, applied = gain, reason «потолок практикой»; конвертация
   * — при росте потолка (reprocessSkillXp). На MAX=100 бросок
   * СОХРАНЯЕТСЯ: applied 0, банк не трогается, reason «максимальный
   * уровень» (без изменений). Эталоны: practiceEfir /
   * reprocessEfirSkills (src/efir.js).
   */
  function practice(sheet, skillId, amount, ignorePracticeCap) {
    const sk = getSkills();
    const fail = (reason) =>
      ({ ok: false, reason, applied: 0, level: 0, leveledUp: false, total: 0 });
    if (!sk) {
      logDegrade();
      return fail('не загружен каталог навыков (sheet.js)');
    }
    const s = sk.SECONDARY_SKILLS[skillId];
    if (!s) return fail('неизвестный навык: ' + skillId);
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) {
      return fail('неверный опыт');
    }
    if (sheet.alive === false) return fail('персонаж погиб');
    const level0 = sheet.secondary[skillId] || 0;
    const limit = ignorePracticeCap
      ? MAX_SKILL_LEVEL
      : Math.min(MAX_SKILL_LEVEL, practiceCap(sheet, skillId));
    const bank0 = (sheet.skillXp && sheet.skillXp[skillId]) || 0;
    if (level0 >= limit) {
      if (level0 >= MAX_SKILL_LEVEL) {
        // MAX=100 — бросок (без изменений; пины player.test.js /
        // items.test.js).
        sheet.skillXp = sheet.skillXp || {};
        sheet.skillXp[skillId] = bank0; // держим копилку числом (инвариант хранилища)
        return {
          ok: true, applied: 0, level: level0, leveledUp: false, total: bank0,
          reason: 'максимальный уровень',
        };
      }
      // C1: ПЕРЕЛИВ В BANK — опыт принят в копилку (решение D7:
      // applied = gain), уровень не растёт; конвертация — при росте
      // потолка (reprocessSkillXp).
      const gain = Math.round(amount);
      const bank = bank0 + gain;
      sheet.skillXp = sheet.skillXp || {};
      sheet.skillXp[skillId] = bank;
      return {
        ok: true, applied: gain, level: level0, leveledUp: false, total: bank,
        reason: 'потолок практикой',
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
    sheet.skillXp = sheet.skillXp || {};
    sheet.skillXp[skillId] = bank;
    sheet.secondary[skillId] = level;
    // Примечание: HP/MP не прижимаем к максимуму — макс. HP/MP только
    // растут от вторичных навыков (Выносливость/Голем), maxMP зависит
    // только от основных, так что текущие значения не могут оказаться
    // выше новых границ.
    return { ok: true, applied: gain, level, leveledUp, total: bank };
  }

  /**
   * Пересчёт копилки опыта после повышения основного навыка: «потолок
   * практикой» вырос, и опыт, застрявший в skillXp у уровня потолка,
   * конвертируется в уровни (до нового потолка). Под C1 застрявший
   * банк БОЛЬШЕ (перелив копится) — лупа покрывает без правок.
   * @returns {string[]} id навыков, чей уровень вырос
   */
  function reprocessSkillXp(sheet, primaryId) {
    const sk = getSkills();
    if (!sk) { logDegrade(); return []; }
    const leveled = [];
    for (const [id, s] of Object.entries(sk.SECONDARY_SKILLS)) {
      if (s.primary !== primaryId) continue;
      const bank0 = (sheet.skillXp && sheet.skillXp[id]) || 0;
      if (bank0 <= 0) continue;
      const level0 = sheet.secondary[id] || 0;
      const limit = Math.min(MAX_SKILL_LEVEL, practiceCap(sheet, id));
      let level = level0;
      let bank = bank0;
      while (level < limit) {
        const need = skillXpForNext(level);
        if (bank < need) break;
        bank -= need;
        level += 1;
      }
      if (level !== level0) {
        sheet.secondary[id] = level;
        sheet.skillXp[id] = bank;
        leveled.push(id);
      }
    }
    return leveled;
  }

  /**
   * Производные характеристики из навыков (все формулы из SPEC.md —
   * перенос дословно из player.js).
   * @param {object} sheet лист
   * @param {object} [ctx] kind-хук (000143/000144): ctx.modifier —
   *   функция (base, sheet, ctx) → ПОЛНЫЙ объект (все ключи base +
   *   переопределения); модификатор ВЕРНУТЬ должен полный объект,
   *   не дифф. Без modifier — base (hero-формулы).
   */
  function derived(sheet, ctx) {
    const sk = getSkills();
    if (!sk) { logDegrade(); return null; }
    const P = sheet.primary;
    const S = (id) => sheet.secondary[id] || 0;
    const pct = (id) => sk.SECONDARY_SKILLS[id].effect.perLevel * S(id);

    const maxHPMult = 1 + pct('endurance') + pct('golem');
    const maxHP = Math.round((20 + P.constitution * 5) * maxHPMult);
    const maxMP = 10 + (P.intelligence + P.wisdom) * 3;
    const armor = S('golem'); // +1 броня за уровень «Голем»

    const base = {
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
    if (ctx && typeof ctx.modifier === 'function') {
      const mod = ctx.modifier(base, sheet, ctx);
      if (mod && typeof mod === 'object') return mod;
    }
    return base;
  }

  // Функции оперируют полями hp/mp — предназначены для листов С hp
  // (hero; Эфир бессмертен — 000144 не использует; наёмным — добавит
  // 000143, если потребуется). Guard смерти — sheet.alive === false
  // (R-2: лист без alive — жив).
  function takeDamage(sheet, amount) {
    if (sheet.alive === false) return { dead: true };
    const d = derived(sheet);
    if (!d) return { dead: false };
    sheet.hp -= Math.round(amount * d.damageTakenMult);
    if (sheet.hp <= 0) {
      sheet.hp = 0;
      sheet.alive = false;
      return { dead: true };
    }
    return { dead: false };
  }

  function heal(sheet, amount) {
    const d = derived(sheet);
    if (!d) return sheet.hp;
    sheet.hp = Math.min(d.maxHP, sheet.hp + amount);
    return sheet.hp;
  }

  function restoreDay(sheet) {
    // Восстановление за игровой день (SPEC.md: между днями).
    const d = derived(sheet);
    if (!d) return { hp: sheet.hp, mp: sheet.mp };
    sheet.hp = Math.min(d.maxHP, sheet.hp + Math.round(d.maxHP * d.hpRegenMult));
    sheet.mp = Math.min(d.maxMP, sheet.mp + Math.round(d.maxMP * d.mpRegenMult));
    return { hp: sheet.hp, mp: sheet.mp };
  }

  return {
    KINDS, MAX_SKILL_LEVEL,
    createSheet, xpForNext, pointsPerLevel, addXp,
    canRaise, raiseSkill, skillXpForNext, practiceCap, skillLevel,
    practice, reprocessSkillXp, derived,
    takeDamage, heal, restoreDay,
  };
});

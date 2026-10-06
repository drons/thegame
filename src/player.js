// Персонаж: статы, навыки, опыт и уровни (SPEC.md, раздел «Навыки»).
//
// Чистое ядро без DOM — тестируется в node (tests/player.test.js).
// Униформный модуль: в браузере — globalThis.Game, в node — require().
// Данные каталога навыков (основные и вторичные) — из униформного
// модуля skills-data.js: зеркала каталога assets/skills (source of
// truth).
// Зависимости: skills-data.js, global-settings.js (points_per_level),
// sheet.js (Game.Sheet — модель прокачки).
//
// Задача 000140: модель прокачки (XP/уровни/очки/навыки/практика/
// derived) — в src/sheet.js; этот модуль — слой героя: сейвы
// (000029/000031), каталог-виды для UI, craft-хуки (000046). Публичный
// flat-API (Game.createCharacter / Game.addXp / Game.derived / …) —
// БЕЗ изменений сигнатур и форм значений: внутренность —
// делегирование в Game.Sheet.

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./skills-data.js'),
      require('./global-settings.js'), require('./sheet.js'));
  } else {
    root.Game = Object.assign({}, root.Game,
      factory(root.Game && root.Game.SkillsData,
        root.Game && root.Game.GlobalSettings,
        root.Game && root.Game.Sheet));
  }
})(typeof globalThis !== 'undefined' ? globalThis : self,
  function (skills, settings, sheet) {

  if (!skills || !Array.isArray(skills.PRIMARY_SKILLS) ||
      !skills.SECONDARY_SKILLS || typeof skills.SECONDARY_SKILLS !== 'object') {
    throw new Error(
      'player.js: не найден каталог навыков — загрузите skills-data.js до player.js');
  }
  if (!settings || typeof settings.SETTINGS !== 'object') {
    throw new Error(
      'player.js: не найдены глобальные настройки — загрузите global-settings.js до player.js');
  }
  // Задача 000140: модель прокачки — Game.Sheet (src/sheet.js).
  // В игре недостижимо (тег sheet.js ДО player.js в index.html; пин
  // tests/index-order.test.js). Герой — ядро: деградация героя
  // невозможна по построению → throw, не тихий no-op (в отличие от
  // efir.js, 000053).
  if (!sheet || typeof sheet.createSheet !== 'function' ||
      typeof sheet.addXp !== 'function') {
    throw new Error(
      'player.js: не найден Game.Sheet — загрузите sheet.js до player.js (задача 000140)');
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

  const MAX_SKILL_LEVEL = sheet.MAX_SKILL_LEVEL;
  // Глобальная настройка (src/global-settings.js, SPEC.md «Навыки»).
  // СНЯПШОТ МОМЕНТА ЗАГРУЗКИ — экспорт НЕ убирать: grantXpRaw
  // (src/building-actions.js) читает deps.game.POINTS_PER_LEVEL (иначе
  // points → NaN); live-перевод зеркала — known gap (000099), вне
  // scope. Ре-require-пин — tests/global-settings.test.js.
  const POINTS_PER_LEVEL = settings.SETTINGS.points_per_level;

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

  /**
   * Создаёт персонажа.
   * @returns объект персонажа (mutable)
   */
  function createCharacter(name = 'Флогистон') {
    // 000140: модель — Game.Sheet; hero-лейаут (порядок ключей = байты
    // сейва, 000031) — ТОЧНО как до делегирования.
    return sheet.createSheet('hero', { name });
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
    // целочисленная (sheet.js practice: Math.round(amount), пороги
    // 15·(lvl+1)), дробное значение возможно только в подделанном сейве
    // — отбрасываем (как нецелые уровни вторичных навыков выше).
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

  // --- Делегирование в Game.Sheet (задача 000140) ---
  // Прямые ре-экспорты (та же функция sheet.*; сигнатуры flat-API без
  // изменений — потребители в src/ не правятся):
  const xpForNext = sheet.xpForNext;
  const derived = sheet.derived;
  const canRaise = sheet.canRaise;
  const addXp = sheet.addXp;
  const skillXpForNext = sheet.skillXpForNext;
  const practiceCap = sheet.practiceCap;
  const skillLevel = sheet.skillLevel;
  const reprocessSkillXp = sheet.reprocessSkillXp;
  const takeDamage = sheet.takeDamage;
  const heal = sheet.heal;
  const restoreDay = sheet.restoreDay;

  /**
   * Тратит 1 очко на навык.
   * @returns {{ ok: boolean, level?: number, skillLevels?: string[],
   *             reason?: string }}
   */
  function raiseSkill(c, target) {
    const r = sheet.raiseSkill(c, target);
    if (r.ok) {
      // Крафт (000046): потолок вида, привязанный к основному навыку
      // (у столярного дела — Ловкость), тоже вырос.
      craftReprocessHook(c, target);
      // ...а также ко всем вторичным, поднятым КАСКАДОМ reprocessSkillXp
      // (рост Силы → «Кузнечная рука» выше потолка → кузнечное_дело).
      // Для не-крафтовых навыков хук — no-op (CRAFT_TYPE_SKILL пусто).
      for (const s of (r.skillLevels || [])) craftReprocessHook(c, s);
    }
    return r;
  }

  /**
   * Практика: успешное применение эффекта навыка (попадание мечом —
   * «Мечник», блок — «Железная кожа», зелье — «Алхимик» и т.д.).
   * Опыт копится в c.skillXp[skillId] и поднимает уровень навыка до
   * «потолка практикой» (основной навык * 2); остаток хранится и
   * применяется, когда потолок поднимется (основной навык вырос).
   * 000140/C1: на потолке опыт не бросается — копится в банке
   * (Game.Sheet.practice).
   */
  function skillPractice(c, skillId, amount) {
    const r = sheet.practice(c, skillId, amount, false);
    if (r.ok && r.leveledUp) {
      // Крафт (000046): навык вырос (практика) — потолок видов
      // крафта, привязанных к нему, вырос — пересчёт копилки c.craftXp.
      craftReprocessHook(c, skillId);
    }
    return r;
  }

  /**
   * Книги и свитки: дают опыт навыка, игнорируя потолок практикой
   * (растёт до максимума 100).
   */
  function skillReadBook(c, skillId, amount) {
    const r = sheet.practice(c, skillId, amount, true);
    if (r.ok && r.leveledUp) {
      // Крафт (000046): навык вырос (книги) — потолок видов крафта,
      // привязанных к нему, вырос.
      craftReprocessHook(c, skillId);
    }
    return r;
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

// Заклинания (задача 000045): книга заклинаний, ранги школы, применение
// в бою — по каталогу assets/spells (source of truth, задача 000023).
//
// Чистое ядро без DOM — тестируется в node (tests/spells.test.js).
// Униформный модуль: в браузере — globalThis.Game.Spells, в node — require().
// Зависимости (ПОРЯДОК ВАЖЕН, UMD-ловушка 000038):
//   * spells-data.js (Game.SpellsData — зеркало каталога, фолбэк file://);
//   * combat.js (Game.combatInternals — боевые функции ядра,
//     Game.PRACTICE_XP — опыт практики);
//   * player.js (Game.derived/heal/skillPractice — характеристики и HP/MP).
//
// Числовые формулы эффектов (данные в каталоге описательные):
//   * урон:     round((4 + 0.5*атрибут) * (1 + 0.15*(степень−1))
//               * (1 + schoolBonus)); schoolBonus: огонь →
//               fireDamageBonus, лёд → iceDamageBonus, иначе 0.
//               Всегда попадает, броню моба игнорирует.
//   * лечение:  round((4 + 0.5*атрибут + уровень) * (1 + 0.15*(степень−1)))
//               (атрибут — как у урона; в каталоге все исцеления — Мудрость).
//   * защита:   c.ps.shield = { armor: 1 + степень, turns: 3 } (тик — в
//               начале хода игрока, combat.js).
//   * ослабление: u.weaken = { mult: 0.75, turns: 3 } (тик — вместе с
//               ударом моба, combat.js).
//   * контроль: u.bind = { turns: 1 } (моб пропускает одно действие,
//               combat.js).
// Пул действий — c.ps.spellInt/spellWis по spell.атрибут, мана — spell.мани.
// В бою действует только высшая ИЗВЕСТНАЯ степень цепочки «база».

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    const combat = require('./combat.js');
    module.exports = factory(
      require('./spells-data.js'),
      combat.combatInternals,
      require('./player.js'),
      combat.PRACTICE_XP);
  } else {
    // В браузере — пространство Game.Spells (не смешивать с Game).
    // Guard сбойного порядка (factory → undefined + console.error)
    // Game.Spells НЕ создаёт — «мёртвая магия» должна быть заметна.
    const Game = (typeof root.Game === 'object' && root.Game) || {};
    const api = factory(Game.SpellsData, Game.combatInternals, Game,
      Game.PRACTICE_XP);
    if (api) root.Game = Object.assign({}, root.Game, { Spells: api });
  }
})(typeof globalThis !== 'undefined' ? globalThis : self,
  function (SpellsData, internals, P, PRACTICE_XP) {

  // Guards с console.error (паттерн 000038): битый порядок загрузки не
  // должен оставлять «мёртвую магию» молча — tests/index-order.test.js.
  if (!SpellsData || !Array.isArray(SpellsData.SPELLS) ||
      !SpellsData.SPELLS_BY_ID ||
      typeof SpellsData.SPELLS_BY_ID !== 'object') {
    console.error('spells.js: не найден каталог заклинаний — загрузите ' +
      'src/spells-data.js до src/spells.js (задача 000045)');
    return;
  }
  if (!internals ||
      typeof internals.log !== 'function' ||
      typeof internals.nearestMob !== 'function' ||
      typeof internals.unitDist !== 'function' ||
      typeof internals.checkTurn !== 'function' ||
      typeof internals.checkBlocked !== 'function' ||
      typeof internals.dealDamageToMob !== 'function') {
    console.error('spells.js: не найдены боевые internals — загрузите ' +
      'src/combat.js до src/spells.js (задача 000045)');
    return;
  }
  if (!P || typeof P.skillPractice !== 'function' ||
      typeof P.heal !== 'function' || typeof P.derived !== 'function') {
    console.error('spells.js: не найден модуль персонажа — загрузите ' +
      'src/player.js до src/spells.js (задача 000045)');
    return;
  }
  if (!PRACTICE_XP || typeof PRACTICE_XP.spell !== 'number') {
    console.error('spells.js: не найден PRACTICE_XP боя — загрузите ' +
      'src/combat.js до src/spells.js (задача 000045)');
    return;
  }

  const {
    log, nearestMob, unitDist, checkTurn, checkBlocked, dealDamageToMob,
  } = internals;

  // --- Каталог (зеркало assets/spells, src/spells-data.js) ---

  const SPELLS = SpellsData.SPELLS;
  const SPELLS_BY_ID = SpellsData.SPELLS_BY_ID;

  function getSpell(id) {
    if (typeof id !== 'string' || !id) return null;
    return SPELLS_BY_ID[id] || null;
  }

  // --- Ранги школы (SPEC.md «Заклинания» → «Ранги в школе») ---
  // Ранг определяется уровнем основного навыка-атрибута школы;
  // tier — открываемый уровень заклинаний (поле «уровень» каталога).
  const SCHOOL_RANKS = [
    { name: 'Ученик', min: 1, max: 10, tier: 1 },
    { name: 'Знаток', min: 11, max: 25, tier: 2 },
    { name: 'Мастер', min: 26, max: 50, tier: 3 },
    { name: 'Аркимаг', min: 51, max: 100, tier: 4 },
  ];

  // Ранг по уровню навыка: { name, tier } или null (уровень вне 1..100).
  function schoolRank(level) {
    if (typeof level !== 'number' || !Number.isFinite(level)) return null;
    for (const r of SCHOOL_RANKS) {
      if (level >= r.min && level <= r.max) {
        return { name: r.name, tier: r.tier };
      }
    }
    return null;
  }

  // Открывает ли уровень навыка уровень заклинания tier (ранг >= tier).
  function rankAllowsTier(level, tier) {
    const r = schoolRank(level);
    return !!r && r.tier >= tier;
  }

  // --- Книга заклинаний (список id из каталога) ---

  // Ленивая инициализация: «голый» персонаж без p.spells получает [].
  // Возвращает ТОТ ЖЕ массив (мутация — прямая).
  function bookOf(p) {
    if (!Array.isArray(p.spells)) p.spells = [];
    return p.spells;
  }

  function knows(p, id) {
    return bookOf(p).includes(id);
  }

  // Можно ли выучить (проверки ПО ПОРЯДКУ: id → не изучено → ранг школы
  // по атрибуту → базовое заклинание → для источника 'rune' — Рунопись).
  // source: 'book' | 'scroll' | 'mentor' | 'rune'; «предметы»/«здания»
  // каталога — описательны (мирная привязка — будущие NPC/мировые задачи).
  function canLearn(p, spellId, source) {
    const spell = getSpell(spellId);
    if (!spell) return { ok: false, reason: 'неизвестное заклинание' };
    if (knows(p, spellId)) return { ok: false, reason: 'уже изучено' };
    // Ранг школы — по уровню основного навыка-атрибута заклинания.
    const level = (p.primary && p.primary[spell.атрибут]) || 0;
    const rank = schoolRank(level);
    if (!rank || rank.tier < spell.уровень) {
      const need = SCHOOL_RANKS.find((r) => r.tier === spell.уровень);
      return {
        ok: false,
        reason: `нужен ранг школы «${need ? need.name : '?'}»`,
      };
    }
    // Совершенствование — только при известном базовом заклинании.
    if (spell.база !== null && !knows(p, spell.база)) {
      const base = SPELLS_BY_ID[spell.база];
      return {
        ok: false,
        reason: `нужно базовое заклинание: ${base ? base.название : spell.база}`,
      };
    }
    // Рунический камень/обелиск: расшифровка навыком «Рунопись» (SPEC).
    if (source === 'rune') {
      const runes = (p.secondary && p.secondary.runes) || 0;
      if (runes < spell.уровень) {
        return { ok: false, reason: `нужна Рунопись ${spell.уровень}` };
      }
    }
    return { ok: true };
  }

  // Выучить: успех — mutates p.spells (без дублей — canLearn проверяет).
  function learn(p, spellId, source) {
    const check = canLearn(p, spellId, source);
    if (!check.ok) return { ok: false, reason: check.reason };
    bookOf(p).push(spellId);
    return { ok: true };
  }

  // --- Цепочки «база» (предвычисление из каталога) ---

  // childrenOf: baseId → [улучшения] (каталог обычно линейный: степень =
  // степень базового + 1, задача 000023; схема не запрещает НЕСКОЛЬКО
  // улучшений одной базы — тогда цепочка разветвляется, и «высшая
  // степень» определяется по всей цепочке от корня).
  const childrenOf = new Map();
  for (const s of SPELLS) {
    if (s.база === null) continue;
    if (!childrenOf.has(s.база)) childrenOf.set(s.база, []);
    childrenOf.get(s.база).push(s);
  }

  // CHAIN_OF: id любого звена → цепочка от корня [корень, …, высшая
  // степень] (ВСЕ улучшения, по возрастанию степени, при равных —
  // порядок каталога); ROOT_OF: id любого звена → id корня.
  const CHAIN_OF = new Map();
  const ROOT_OF = new Map();
  for (const s of SPELLS) {
    if (s.база !== null) continue;
    const chain = [s];
    const seen = new Set([s.id]); // защита от циклов в данных
    const stack = [s];
    while (stack.length) {
      const cur = stack.pop();
      for (const kid of childrenOf.get(cur.id) || []) {
        if (seen.has(kid.id)) continue;
        seen.add(kid.id);
        chain.push(kid);
        stack.push(kid);
      }
    }
    // Стабильная сортировка: при равных степенях — порядок каталога.
    chain.sort((a, b) => a.степень - b.степень);
    for (const m of chain) {
      CHAIN_OF.set(m.id, chain);
      ROOT_OF.set(m.id, s.id);
    }
  }

  function chainRoot(spell) {
    if (!spell) return null;
    const rootId = ROOT_OF.get(spell.id);
    return rootId ? SPELLS_BY_ID[rootId] : spell;
  }

  // Цепочка от корня (по возрастанию степени); неизвестный id → [].
  function chainSpells(rootId) {
    const chain = CHAIN_OF.get(rootId);
    if (chain) return chain;
    const s = getSpell(rootId);
    return s ? [s] : [];
  }

  // Высшая ИЗВЕСТНАЯ степень цепочки заклинания (null, если ни одна).
  // При равных степенях (разветвлённая цепочка) — первое в каталоге.
  function highestKnown(p, spell) {
    if (!spell) return null;
    const chain = CHAIN_OF.get(spell.id) || [spell];
    const book = Array.isArray(p.spells) ? p.spells : null;
    if (!book) return null;
    let best = null;
    for (const s of chain) {
      // Строгое > : среди равных степеней остаётся раннее в каталоге.
      if (book.includes(s.id) && (!best || s.степень > best.степень)) {
        best = s;
      }
    }
    return best;
  }

  // Набор для боя: Map rootId → высшая известная степень цепочки.
  // Нечитаемый без побочных эффектов (p.spells не создаётся).
  function activeSpells(p) {
    const map = new Map();
    const book = Array.isArray(p.spells) ? p.spells : null;
    if (!book) return map;
    for (const id of book) {
      const spell = SPELLS_BY_ID[id];
      if (!spell) continue; // некаталожный id в книге — пропускаем
      const rootId = ROOT_OF.get(id);
      const chain = CHAIN_OF.get(rootId) || [spell];
      let best = null;
      for (const s of chain) {
        // Строгое > : среди равных степеней — раннее в каталоге.
        if (book.includes(s.id) && (!best || s.степень > best.степень)) {
          best = s;
        }
      }
      if (!best) continue;
      const prev = map.get(rootId);
      if (!prev || best.степень > prev.степень) map.set(rootId, best);
    }
    return map;
  }

  // --- Применение в бою ---

  const SPELL_MAX_DIST = 4; // дальность каста (как у старых кнопок)
  const ATTR_POOL = { intelligence: 'spellInt', wisdom: 'spellWis' };
  const ATTR_NAME = { intelligence: 'Интеллект', wisdom: 'Мудрость' };
  // Школьный бонус к урону — из производных характеристик (Повелители).
  const SCHOOL_BONUS = { огонь: 'fireDamageBonus', лёд: 'iceDamageBonus' };
  // Практика: мапа школа → вторичный навык (задача 000013); у школ Тень
  // и Защита соответствующего вторичного навыка нет — практики нет.
  const PRACTICE_BY_SCHOOL = {
    огонь: 'firelord',
    лёд: 'icelord',
    исцеление: 'meditation',
    природа: 'nature',
  };
  // Действия, требующие цель на поле (прочие — по себе).
  const TARGETED = new Set(['урон', 'ослабление', 'контроль']);
  // Все действия, поддерживаемые эффектом (ветки switch в castSpell).
  // В файле enum закреплён схемой; проверка — защита от каталога,
  // мутированного в памяти (ревью 000045, раунд 1): отказ обязан идти
  // ДО расхода пула/маны, и canCastSpell даёт ту же причину (000037).
  const KNOWN_ACTIONS = new Set(
    ['урон', 'лечение', 'защита', 'ослабление', 'контроль']);

  // Общие проверки каста (зеркало 000037: castSpell и canCastSpell
  // обязаны дать ОДНУ и ту же причину). Чисто: не тратит пулы/ману,
  // не трогает c.log/c.targetId/c._rng, не создаёт p.spells.
  // Возврат: { fail: { ok:false, reason } } | { ok, spell, p, t, poolKey }.
  function evalSpell(c, spellId, targetId) {
    const why = checkTurn(c);
    if (why) return { fail: { ok: false, reason: why } };
    const blocked = checkBlocked(c);
    if (blocked) return { fail: blocked };
    const spell = getSpell(spellId);
    if (!spell) return { fail: { ok: false, reason: 'неизвестное заклинание' } };
    const p = c.player;
    const book = Array.isArray(p.spells) ? p.spells : null;
    if (!book || !book.includes(spellId)) {
      return { fail: { ok: false, reason: 'заклинание не изучено' } };
    }
    // Неизвестное действие (битые данные) — отказ ДО расхода пула/маны;
    // castSpell и canCastSpell дают одну причину (зеркало 000037).
    if (!KNOWN_ACTIONS.has(spell.действие)) {
      return {
        fail: { ok: false, reason: 'неизвестное действие: ' + spell.действие },
      };
    }
    // В бою действует только высшая известная степень цепочки «база».
    const highest = highestKnown(p, spell);
    if (highest !== spell) {
      return {
        fail: {
          ok: false,
          reason: `в бою действует высшая степень: ${highest.название}`,
        },
      };
    }
    // Пул действий по атрибуту (Интеллект/Мудрость).
    const poolKey = ATTR_POOL[spell.атрибут];
    if (c.ps[poolKey] <= 0) {
      return {
        fail: {
          ok: false,
          reason:
            `действий «Заклинание» (${ATTR_NAME[spell.атрибут]}) больше нет`,
        },
      };
    }
    if (p.mp < spell.мани) {
      return { fail: { ok: false, reason: `не хватает маны (${spell.мани})` } };
    }
    // Цель (для урона/ослабления/контроля): аргумент, иначе ближайший.
    let t = null;
    if (TARGETED.has(spell.действие)) {
      t = targetId ? c.units.find((u) => u.id === targetId) : nearestMob(c);
      if (!t || !t.alive || t.fled) {
        return { fail: { ok: false, reason: 'нет цели' } };
      }
      if (unitDist(c, t) > SPELL_MAX_DIST) {
        return {
          fail: { ok: false, reason: 'цель слишком далеко (дальность 4)' },
        };
      }
    }
    return { ok: true, spell, p, t, poolKey };
  }

  /**
   * Применить заклинание в бою (действие «Применение заклинания»).
   * Расход: пул по атрибуту −1, мана −spell.мани; эффект по spell.действие
   * (формулы — см. шапку модуля); практика — по школе (если есть навык).
   * @returns {{ ok:boolean, reason?:string, spell?, dmg?, killed?,
   *             healed?, hp?, shield?, weakened?, bound?, practice? }}
   */
  function castSpell(c, spellId, targetId) {
    const ev = evalSpell(c, spellId, targetId);
    if (ev.fail) return ev.fail;
    const { spell, p, t, poolKey } = ev;
    c.ps[poolKey] -= 1;
    p.mp -= spell.мани;
    const d = P.derived(p);
    const out = { ok: true, spell };
    switch (spell.действие) {
      case 'урон': {
        // Заклинание: всегда попадает, игнорирует броню моба.
        const bonusKey = SCHOOL_BONUS[spell.школа];
        const bonus = bonusKey ? d[bonusKey] : 0;
        const dmg = Math.round(
          (4 + 0.5 * p.primary[spell.атрибут]) *
          (1 + 0.15 * (spell.степень - 1)) * (1 + bonus));
        const r = dealDamageToMob(c, t, dmg, true);
        log(c, `${spell.название} по ${t.name}: ${r.dmg}.`);
        out.dmg = r.dmg;
        out.killed = r.killed;
        break;
      }
      case 'лечение': {
        // Как урон — от spell.атрибут (в каталоге все исцеления —
        // Мудрость; при другом атрибуте формула следовала бы за ним).
        const amount = Math.round(
          (4 + 0.5 * p.primary[spell.атрибут] + p.level) *
          (1 + 0.15 * (spell.степень - 1)));
        const hpBefore = p.hp;
        const hp = P.heal(p, amount);
        // Задача 000037: логим фактически восстановленную величину.
        log(c, `${spell.название}: ${hp - hpBefore}.`);
        out.hp = hp;
        out.healed = hp - hpBefore;
        break;
      }
      case 'защита': {
        // Временная броня (тик — в начале хода игрока, combat.js):
        // держится ровно 3 раунда, включая раунд каста.
        c.ps.shield = { armor: 1 + spell.степень, turns: 3 };
        log(c, `${spell.название}: +${c.ps.shield.armor} брони на 3 раунда.`);
        out.shield = { armor: c.ps.shield.armor, turns: c.ps.shield.turns };
        break;
      }
      case 'ослабление': {
        // Урон моба ×0.75 на 3 его атаки (тик — вместе с ударом, combat.js).
        t.weaken = { mult: 0.75, turns: 3 };
        log(c, `${t.name} ослаблен (${spell.название}).`);
        out.weakened = t.id;
        break;
      }
      case 'контроль': {
        // Сковывание: моб пропускает ровно одно действие (combat.js).
        t.bind = { turns: 1 };
        log(c, `${t.name} скован (${spell.название}).`);
        out.bound = t.id;
        break;
      }
      default:
        // Недостижимо: evalSpell уже отказывает в неизвестном действии
        // ДО расхода пула/маны (зеркало 000037). Страховка.
        return {
          ok: false,
          reason: 'неизвестное действие: ' + spell.действие,
        };
    }
    // Практика: каст даёт опыт навыку школы (задача 000013), если у школы
    // есть соответствующий вторичный навык.
    const skill = PRACTICE_BY_SCHOOL[spell.школа];
    if (skill) {
      const pr = P.skillPractice(p, skill, PRACTICE_XP.spell);
      out.practice = {
        skill, xp: PRACTICE_XP.spell, applied: pr.applied, level: pr.level,
      };
    }
    return out;
  }

  // canCastSpell (зеркало 000037): чистый предпросмотр — те же причины,
  // что castSpell, БЕЗ побочных эффектов (пулы/мана/лог/c._rng не
  // трогаются, p.spells не создаётся). args.targetId — как в ядре.
  function canCastSpell(c, spellId, args) {
    const ev = evalSpell(c, spellId, (args && args.targetId) || undefined);
    if (ev.fail) return ev.fail;
    return { ok: true };
  }

  // --- Сейв (опциональное поле hero.spells, без повышения версии) ---

  // Чистка книги из сейва (подделанный сейв): только строки-каталожные id,
  // без дублей, порядок сохранён; не-массив (поле отсутствует/мусор) → [].
  function sanitizeSpellBook(list) {
    if (!Array.isArray(list)) return [];
    const out = [];
    for (const id of list) {
      if (typeof id !== 'string' || !id) continue;
      if (!SPELLS_BY_ID[id]) continue;
      if (out.includes(id)) continue;
      out.push(id);
    }
    return out;
  }

  return {
    SPELLS, SPELLS_BY_ID, SCHOOL_RANKS,
    getSpell, schoolRank, rankAllowsTier,
    bookOf, knows, canLearn, learn,
    chainRoot, chainSpells, highestKnown, activeSpells,
    castSpell, canCastSpell,
    sanitizeSpellBook,
  };
});
